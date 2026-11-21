// Browser implementation of the app's storage, Google sign-in and Drive sync (replaces the desktop preload)
const CLIENT_ID = '902209078143-4qtt6l8rml2hif3l85trits6js3nh60k.apps.googleusercontent.com';
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'دفتري';

// ---------------- IndexedDB key/value files ----------------
let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('daftari', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('files', { keyPath: 'rel' }); r.result.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); let out; Promise.resolve(fn(s)).then(v => out = v); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function getFile(rel) { return tx('files', 'readonly', s => req(s.get(rel))); }
async function putFile(rel, data, mtime = Date.now()) { return tx('files', 'readwrite', s => req(s.put({ rel, data, mtime }))); }
async function delFile(rel) { return tx('files', 'readwrite', s => req(s.delete(rel))); }
async function allKeys() { return tx('files', 'readonly', s => req(s.getAllKeys())); }
async function getMeta(k) { return tx('meta', 'readonly', s => req(s.get(k))); }
async function setMeta(k, v) { return tx('meta', 'readwrite', s => req(s.put(v, k))); }
const enc = new TextEncoder(), dec = new TextDecoder();
const asText = d => typeof d === 'string' ? d : d instanceof Uint8Array ? dec.decode(d) : '';
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { }

// ---------------- sync state ----------------
let state = { folderId: null, account: null, files: {}, dirty: [], deleted: [] };
const stateReady = getMeta('sync').then(s => { if (s) state = Object.assign(state, s); });
const saveState = () => setMeta('sync', state);
const listeners = { status: [], pulled: [] };
const emit = (k, v) => listeners[k].forEach(cb => { try { cb(v); } catch { } });

function markDirty(rel) {
  if (!state.dirty.includes(rel)) state.dirty.push(rel);
  state.deleted = state.deleted.filter(r => r !== rel);
  saveState(); schedule(3000);
}
function markDeleted(rel) {
  state.dirty = state.dirty.filter(r => r !== rel);
  if (state.files[rel] && !state.deleted.includes(rel)) state.deleted.push(rel);
  saveState(); schedule(3000);
}

// ---------------- Google sign-in (Google Identity Services token client) ----------------
let token = null, tokenExp = 0, tokenClient = null, profile = null, active = false;
try { profile = JSON.parse(localStorage.getItem('daftari.profile') || 'null'); } catch { }
let gisP = null;
function loadGis() {
  return gisP ||= new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => { gisP = null; rej(new Error('offline')); };
    document.head.append(s);
  });
}
let pendingTok = null;
async function requestToken(interactive) {
  await loadGis();
  if (pendingTok) return pendingTok;
  pendingTok = new Promise((res) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES, include_granted_scopes: true,
      hint: profile?.email || undefined,
      callback: r => {
        if (r && r.access_token) { token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000; res({ ok: true }); }
        else res({ ok: false, error: r?.error || 'cancelled' });
      },
      error_callback: e => res({ ok: false, error: e?.type || 'cancelled' })
    });
    tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  }).finally(() => { setTimeout(() => pendingTok = null, 0); });
  return pendingTok;
}
const haveToken = () => token && Date.now() < tokenExp;
async function accessToken() {
  if (haveToken()) return token;
  throw Object.assign(new Error('need-token'), { code: 'need-token' });
}
// tokens last ~1 hour; renew quietly on the next click so the browser allows the Google popup
document.addEventListener('pointerdown', () => {
  if (!profile || haveToken() || pendingTok) return;
  if (Date.now() - (window.__lastTokTry || 0) < 15000) return;
  window.__lastTokTry = Date.now();
  requestToken(false).then(r => { if (r.ok) { if (!active) startSync(); else runNow(); } });
}, true);

async function login() {
  try {
    const r = await requestToken(true);
    if (!r.ok) return { ok: false, error: r.error === 'popup_closed' || r.error === 'cancelled' ? 'cancelled' : r.error };
    const pr = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token } });
    profile = await pr.json();
    localStorage.setItem('daftari.profile', JSON.stringify({ email: profile.email, name: profile.name, picture: profile.picture }));
    startSync();
    return { ok: true, email: profile.email, name: profile.name };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
async function logout() {
  stopSync();
  try { if (token) google.accounts.oauth2.revoke(token, () => { }); } catch { }
  token = null; profile = null; localStorage.removeItem('daftari.profile');
}

// ---------------- Drive sync ----------------
let timer = null, interval = null, running = null, again = false;
function schedule(ms) { if (!active) return; clearTimeout(timer); timer = setTimeout(() => runNow().catch(() => { }), ms); }
async function startSync() {
  await stateReady;
  if (state.account && profile?.email && state.account !== profile.email) { state.folderId = null; state.files = {}; state.deleted = []; }
  state.account = profile?.email || null;
  for (const rel of await allKeys()) if (!rel.startsWith('thumbs/') && !state.files[rel] && !state.dirty.includes(rel)) state.dirty.push(rel);
  await saveState();
  active = true;
  clearInterval(interval); interval = setInterval(() => runNow().catch(() => { }), 60000);
  runNow().catch(() => { });
}
function stopSync() { active = false; clearTimeout(timer); clearInterval(interval); emit('status', { state: 'signedout' }); }

async function gapi(url, init = {}) {
  const t = await accessToken();
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + t } });
  if (r.status === 401) { token = null; throw Object.assign(new Error('need-token'), { code: 'need-token' }); }
  return r;
}
async function json(r) { if (!r.ok) { const t = await r.text(); throw Object.assign(new Error('drive ' + r.status + ' ' + t.slice(0, 300)), { status: r.status }); } return r.json(); }
async function ensureFolder() {
  if (state.folderId) {
    const r = await gapi(`${API}/files/${state.folderId}?fields=id,trashed`);
    if (r.ok && !(await r.json()).trashed) return;
    state.folderId = null; state.files = {};
  }
  const q = `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false and 'root' in parents`;
  const found = await json(await gapi(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`));
  if (found.files && found.files[0]) state.folderId = found.files[0].id;
  else state.folderId = (await json(await gapi(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }) }))).id;
  await saveState();
}
async function listRemote() {
  const out = []; let pageToken = '';
  do {
    const q = `'${state.folderId}' in parents and trashed=false`;
    const r = await json(await gapi(`${API}/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime,appProperties)${pageToken ? '&pageToken=' + pageToken : ''}`));
    out.push(...(r.files || [])); pageToken = r.nextPageToken || '';
  } while (pageToken);
  return out;
}
async function downloadBytes(id) { const r = await gapi(`${API}/files/${id}?alt=media`); if (!r.ok) throw new Error('download ' + r.status); return new Uint8Array(await r.arrayBuffer()); }
const storeAs = (rel, bytes) => rel.endsWith('.json') ? dec.decode(bytes) : bytes;
async function mergeLibrary(f) {
  let remote = null, local = null;
  try { remote = JSON.parse(dec.decode(await downloadBytes(f.id))); } catch { }
  const lf = await getFile('library.json');
  try { local = JSON.parse(asText(lf?.data)); } catch { }
  if (!remote) return;
  if (!local) { await putFile('library.json', JSON.stringify(remote)); return; }
  const localNewer = (lf?.mtime || 0) > Date.parse(f.modifiedTime);
  const localEmpty = !local.nodes || !Object.keys(local.nodes).length;
  const [older, newer] = localNewer && !localEmpty ? [remote, local] : [local, remote];
  const deleted = { ...(remote.deleted || {}), ...(local.deleted || {}) };
  const nodes = { ...(older.nodes || {}), ...(newer.nodes || {}) };
  const tags = { ...(older.tags || {}), ...(newer.tags || {}) };
  for (const id of Object.keys(deleted)) { delete nodes[id]; delete tags[id]; }
  await putFile('library.json', JSON.stringify({ ...older, ...newer, nodes, tags, deleted, settings: localEmpty ? remote.settings : newer.settings, ui: { expanded: { ...(older.ui?.expanded || {}), ...(newer.ui?.expanded || {}) } } }));
}
async function upload(rel) {
  const f = await getFile(rel); if (!f) return null;
  const body = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
  const mime = rel.endsWith('.pdf') ? 'application/pdf' : 'application/json';
  const st = state.files[rel];
  if (st && st.id) {
    const r = await gapi(`${UPLOAD}/files/${st.id}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': mime }, body });
    if (r.ok) return r.json();
    if (r.status !== 404) return json(r);
  }
  const meta = { name: rel.replace(/\//g, '__'), parents: [state.folderId], appProperties: { rel } };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', new Blob([body], { type: mime }));
  return json(await gapi(`${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, { method: 'POST', body: form }));
}
async function cycle() {
  emit('status', { state: 'syncing' });
  await ensureFolder();
  const pulled = []; const seen = new Set();
  for (const f of await listRemote()) {
    const rel = f.appProperties && f.appProperties.rel;
    if (!rel || rel.includes('..')) continue;
    seen.add(rel);
    const st = state.files[rel];
    if (st && st.remoteModified === f.modifiedTime && st.id === f.id) continue;
    if (state.deleted.includes(rel)) continue;
    if (rel === 'library.json' && state.dirty.includes(rel)) { await mergeLibrary(f); state.files[rel] = { id: f.id, remoteModified: f.modifiedTime }; pulled.push(rel); await saveState(); continue; }
    if (state.dirty.includes(rel)) {
      const lf = await getFile(rel);
      if (Date.parse(f.modifiedTime) <= (lf?.mtime || 0)) { state.files[rel] = { id: f.id, remoteModified: f.modifiedTime }; continue; }
      state.dirty = state.dirty.filter(r => r !== rel);
    }
    await putFile(rel, storeAs(rel, await downloadBytes(f.id)), Date.parse(f.modifiedTime));
    state.files[rel] = { id: f.id, remoteModified: f.modifiedTime };
    pulled.push(rel); await saveState();
  }
  for (const rel of Object.keys(state.files)) {
    if (!seen.has(rel) && !state.dirty.includes(rel) && !state.deleted.includes(rel) && rel !== 'library.json') { await delFile(rel); delete state.files[rel]; pulled.push(rel); }
  }
  await saveState();
  if (pulled.length) emit('pulled', pulled);
  for (const rel of [...state.deleted]) {
    const st = state.files[rel];
    if (st && st.id) { const r = await gapi(`${API}/files/${st.id}`, { method: 'DELETE' }); if (!r.ok && r.status !== 404) throw new Error('delete ' + r.status); }
    delete state.files[rel]; state.deleted = state.deleted.filter(r => r !== rel); await saveState();
  }
  for (const rel of [...state.dirty]) {
    const res = await upload(rel);
    if (res && res.id) state.files[rel] = { id: res.id, remoteModified: res.modifiedTime };
    state.dirty = state.dirty.filter(r => r !== rel); await saveState();
  }
  emit('status', { state: 'synced', at: Date.now() });
}
async function runNow() {
  if (!active) return { ok: false };
  if (running) { again = true; return running; }
  running = (async () => {
    try { do { again = false; await cycle(); } while (again); return { ok: true }; }
    catch (e) {
      if (e.code === 'need-token') emit('status', { state: 'needtoken', pending: state.dirty.length });
      else emit('status', { state: navigator.onLine === false || /Failed to fetch|NetworkError/i.test(String(e.message)) ? 'offline' : 'error', message: String(e.message || e).slice(0, 300) });
      return { ok: false };
    } finally { running = null; }
  })();
  return running;
}
window.addEventListener('online', () => runNow());
window.addEventListener('beforeunload', e => { if (active && state.dirty.length && haveToken()) { runNow(); } });

// ---------------- file picking ----------------
function pickPdfs() {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,.pdf'; inp.multiple = true;
    inp.onchange = () => res([...inp.files]);
    inp.addEventListener('cancel', () => res([]));
    inp.click();
  });
}

// ---------------- search ----------------
const strip = s => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
async function search(q) {
  q = String(q || '').trim().toLowerCase(); if (!q) return [];
  const out = [];
  for (const rel of await allKeys()) {
    if (!rel.startsWith('lectures/')) continue;
    let data; try { data = JSON.parse(asText((await getFile(rel)).data)); } catch { continue; }
    const id = rel.slice(9).replace(/\.json$/, '');
    for (const [pi, pg] of Object.entries(data.pages || {})) {
      const texts = [pg.note || '', ...(pg.items || []).filter(i => i.t === 'text').map(i => strip(i.html))];
      for (const t of texts) { const i = t.toLowerCase().indexOf(q); if (i >= 0) { out.push({ id, page: Number(pi), snippet: t.slice(Math.max(0, i - 40), i + q.length + 60) }); break; } }
      if (out.length > 60) return out;
    }
  }
  return out;
}

window.api = {
  loadLibrary: async () => { const f = await getFile('library.json'); try { return f ? JSON.parse(asText(f.data)) : null; } catch { return null; } },
  saveLibrary: async lib => { await putFile('library.json', JSON.stringify(lib)); markDirty('library.json'); return true; },
  loadLecture: async id => { const f = await getFile('lectures/' + id + '.json'); try { return f ? JSON.parse(asText(f.data)) : { pages: {} }; } catch { return { pages: {} }; } },
  saveLecture: async (id, data) => { await putFile('lectures/' + id + '.json', JSON.stringify(data)); markDirty('lectures/' + id + '.json'); return true; },
  deleteLecture: async id => { for (const rel of ['lectures/' + id + '.json', 'pdfs/' + id + '.pdf']) { await delFile(rel); markDeleted(rel); } await delFile('thumbs/' + id + '.png'); return true; },
  pickPdfs,
  addPdf: async (file, id) => { await putFile('pdfs/' + id + '.pdf', new Uint8Array(await file.arrayBuffer())); markDirty('pdfs/' + id + '.pdf'); return true; },
  readPdf: async id => { const f = await getFile('pdfs/' + id + '.pdf'); return f ? new Uint8Array(f.data) : null; },
  getThumb: async id => (await getFile('thumbs/' + id + '.png'))?.data || null,
  saveThumb: async (id, url) => { await putFile('thumbs/' + id + '.png', url); return true; },
  search,
  pathForFile: f => f,
  authStatus: async () => ({ configured: true, signedIn: !!profile, email: profile?.email || null, name: profile?.name || null, picture: profile?.picture || null }),
  login, logout,
  syncNow: async () => { if (!haveToken() && profile) { const r = await requestToken(false); if (r.ok && !active) return startSync(); } return runNow(); },
  openData: null,
  version: async () => 'web',
  onSyncStatus: cb => listeners.status.push(cb),
  onPulled: cb => listeners.pulled.push(cb),
  _resume: () => { if (profile) startSync(); }
};
