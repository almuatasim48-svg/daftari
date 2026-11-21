import * as pdfjsLib from './vendor/pdf.min.mjs';
import { h, icon, esc, menu, modal, prompt, confirmBox, toast, swatches, SUBJECT_COLORS, TAG_COLORS, contrastText } from './ui.js';
import { openLecture } from './lecture.js';
import { initStudy, openCards, openQuiz, testKey } from './study.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
export { pdfjsLib };

const api = window.api;
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const APP_VERSION = '0.3.0';
const PHASE2 = 'بطاقات المراجعة والاختبارات جاية في المرحلة الثانية من البرنامج';

const DEFAULT_SETTINGS = {
  theme: 'night', notesMode: 'side', subjectView: 'grid',
  tools: {
    pen: { color: '#E5484D', size: 3, smooth: true },
    highlight: { color: '#FFE27A', size: 14, straight: true },
    text: { color: '#7FB0FF', size: 18, bold: false, italic: false },
    shapes: { color: '#F08A4B', size: 3, fill: false, kind: 'rect' },
    eraser: { mode: 'whole' }
  }
};

let lib = null;
let nav = { view: 'home' };
let lectureCtl = null;
let syncState = { state: 'signedout' };
let account = null;
initStudy({ api: window.api, get lib() { return lib; }, pdfjsLib, node: id => lib.nodes[id], openLecture: (id, page) => go({ view: 'lecture', id, page }) });

// ---------------- library ----------------
function blankLib() { return { v: 1, nodes: {}, tags: {}, settings: structuredClone(DEFAULT_SETTINGS), ui: { expanded: {} } }; }
function normalize(l) {
  l = l || blankLib();
  l.nodes ||= {}; l.tags ||= {}; l.deleted ||= {}; l.ui ||= { expanded: {} }; l.ui.expanded ||= {};
  l.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(l.settings || {}) };
  l.settings.tools = { ...structuredClone(DEFAULT_SETTINGS.tools), ...(l.settings.tools || {}) };
  for (const k of Object.keys(DEFAULT_SETTINGS.tools)) l.settings.tools[k] = { ...DEFAULT_SETTINGS.tools[k], ...(l.settings.tools[k] || {}) };
  return l;
}
let saveT = null;
function saveLib(now = false) {
  clearTimeout(saveT);
  const go = () => api.saveLibrary(lib);
  if (now) return go();
  saveT = setTimeout(go, 400);
}
const node = id => lib.nodes[id];
const kids = (pid, type) => Object.values(lib.nodes).filter(n => (n.parentId || null) === (pid || null) && (!type || n.type === type))
  .sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || a.name.localeCompare(b.name, 'ar', { numeric: true }));
const lecturesOf = sid => kids(sid, 'lecture').sort((a, b) => (a.created || 0) - (b.created || 0));
function pathOf(n) { const out = []; let c = n; while (c) { out.unshift(c); c = c.parentId ? node(c.parentId) : null; } return out; }
function subjectOf(n) { let c = n; while (c && c.type !== 'subject') c = c.parentId ? node(c.parentId) : null; return c; }
function countLectures(n) { if (n.type === 'lecture') return 1; return kids(n.id).reduce((s, k) => s + countLectures(k), 0); }
function descendants(n) { const out = [n]; for (const k of kids(n.id)) out.push(...descendants(k)); return out; }

// ---------------- theme ----------------
function applyTheme() { document.documentElement.dataset.theme = lib.settings.theme || 'night'; }

// ---------------- navigation ----------------
async function go(next) {
  if (lectureCtl) { await lectureCtl.close(); lectureCtl = null; }
  nav = next;
  $('#app').classList.remove('focus');
  render();
}
function render() { renderSidebar(); renderView(); }

// ---------------- sidebar ----------------
function renderSidebar() {
  const sb = $('#sidebar');
  sb.innerHTML = '';
  const plus = h('button', { class: 'icon-btn outlined', 'aria-label': 'إضافة', title: 'إضافة', html: icon('plus') });
  plus.onclick = e => { const r = plus.getBoundingClientRect(); plus.classList.add('on'); addMenu(r.right, r.bottom + 6); setTimeout(() => plus.classList.remove('on'), 50); };
  sb.append(h('div', { class: 'brand' }, h('div', { class: 'logo', html: icon('book') }), h('div', { class: 'brand-name' }, 'دفتري'), plus));
  const s = h('button', { class: 'search', type: 'button', html: icon('search', 16) + '<span>ابحث في كل محاضراتك…</span><span class="k ltr">Ctrl K</span>' });
  s.onclick = openSearch;
  sb.append(s);

  const tree = h('div', { class: 'tree', role: 'tree' });
  const roots = kids(null);
  if (!roots.length) tree.append(h('div', { class: 'sec-title', style: { fontWeight: 400 } }, 'اضغط + فوق وسوِّ أول مجلد أو مادة'));
  for (const n of roots) tree.append(treeNode(n));

  const tags = Object.values(lib.tags);
  if (tags.length) {
    tree.append(h('div', { class: 'sec-title' }, 'التصنيفات'));
    for (const t of tags) {
      const cnt = Object.values(lib.nodes).filter(n => n.type === 'lecture' && (n.tags || []).includes(t.id)).length;
      const r = h('button', { class: 'row' + (nav.view === 'tag' && nav.id === t.id ? ' sel' : ''), type: 'button' },
        h('span', { class: 'dot round', style: { background: t.color } }), h('span', { class: 'name' }, t.name), h('span', { class: 'count' }, cnt));
      r.onclick = () => go({ view: 'tag', id: t.id });
      r.oncontextmenu = e => { e.preventDefault(); tagMenu(t, e.clientX, e.clientY); };
      tree.append(r);
    }
  }
  sb.append(tree);

  const foot = h('div', { class: 'side-foot' });
  foot.append(syncPill());
  const set = h('button', { class: 'icon-btn', 'aria-label': 'الإعدادات', title: 'الإعدادات', html: icon('gear') });
  set.onclick = () => go({ view: 'settings' });
  const av = h('div', { class: 'avatar' });
  if (account?.picture) av.append(h('img', { src: account.picture, alt: '' }));
  else if (account?.name) av.textContent = account.name.slice(0, 2);
  else { av.innerHTML = icon('book', 16); av.style.background = 'var(--active)'; av.style.color = 'var(--muted)'; }
  const meRow = h('div', { class: 'me', style: account ? {} : { cursor: 'pointer' }, title: account ? account.email : 'تسجيل الدخول بقوقل', onclick: e => { if (!account && !e.target.closest('button')) doLogin(); } }, av, h('div', { style: { flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, account?.name || 'سجّل دخول'), set);
  foot.append(meRow);
  sb.append(foot);
}

function treeNode(n) {
  const wrap = h('div', { role: 'treeitem' });
  const open = !!lib.ui.expanded[n.id];
  const selected = (nav.id === n.id && nav.view !== 'tag') || (nav.view === 'lecture' && n.type === 'lecture' && nav.id === n.id);
  if (n.type === 'lecture') {
    const r = h('button', { class: 'row lec' + (selected ? ' sel' : ''), type: 'button', title: n.name }, h('span', { class: 'name ltr', dir: 'auto', style: { textAlign: 'right' } }, n.name));
    const t = (n.tags || []).map(id => lib.tags[id]).filter(Boolean)[0];
    if (t) r.prepend(h('span', { class: 'dot round', style: { background: t.color, width: '7px', height: '7px' } }));
    r.onclick = () => go({ view: 'lecture', id: n.id });
    r.oncontextmenu = e => { e.preventDefault(); lectureMenu(n, e.clientX, e.clientY); };
    wrap.append(r);
    return wrap;
  }
  const chev = h('span', { class: 'chev' + (open ? ' open' : ''), html: icon('chev', 16) });
  const lead = n.type === 'folder' ? h('span', { style: { color: '#E8C46A', display: 'flex' }, html: icon('folder', 16) }) : h('span', { class: 'dot', style: { background: n.color || '#9AA3AD' } });
  const r = h('button', { class: 'row' + (selected ? ' sel' : ''), type: 'button' }, chev, lead, h('span', { class: 'name', dir: 'auto' }, n.name), h('span', { class: 'count' }, countLectures(n) || ''));
  chev.onclick = e => { e.stopPropagation(); lib.ui.expanded[n.id] = !open; saveLib(); renderSidebar(); };
  r.onclick = () => { if (!lib.ui.expanded[n.id]) { lib.ui.expanded[n.id] = true; saveLib(); } go({ view: n.type, id: n.id }); };
  r.oncontextmenu = e => { e.preventDefault(); (n.type === 'folder' ? folderMenu : subjectMenu)(n, e.clientX, e.clientY); };
  if (n.type === 'subject') {
    r.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); r.classList.add('dropping'); } });
    r.addEventListener('dragleave', () => r.classList.remove('dropping'));
    r.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); r.classList.remove('dropping'); importFiles(e.dataTransfer.files, n.id); });
  }
  wrap.append(r);
  if (open) {
    const k = n.type === 'subject' ? lecturesOf(n.id) : kids(n.id);
    if (k.length) wrap.append(h('div', { class: 'kids', role: 'group' }, ...k.map(treeNode)));
  }
  return wrap;
}

function syncPill() {
  const map = {
    signedout: [account ? 'bad' : '', account ? 'انتهى تسجيل الدخول — اضغط وسجّل من جديد' : 'بدون مزامنة — سجّل دخول من الإعدادات'],
    syncing: ['busy', 'جاري المزامنة…'],
    synced: ['ok', 'متزامن مع Google Drive'],
    offline: ['bad', 'بدون نت — بيتزامن لما يرجع'],
    error: ['bad', 'تعذّرت المزامنة — اضغط للمحاولة'],
    needtoken: ['busy', 'اضغط هنا عشان تكمل المزامنة']
  };
  const [cls, label] = map[syncState.state] || map.signedout;
  const b = h('button', { class: 'pill', type: 'button', title: syncState.message || '' }, h('span', { class: 'st ' + cls }), h('span', { style: { flex: 1, textAlign: 'right' } }, label));
  if (syncState.state === 'synced' && syncState.at) b.append(h('span', { style: { color: 'var(--muted)' } }, ago(syncState.at)));
  b.onclick = async () => { if (!account) return go({ view: 'settings' }); if (syncState.state === 'signedout') return doLogin(); if (syncState.state === 'error' && syncState.message) toast('سبب المشكلة: ' + syncState.message, 9000); await api.syncNow(); };
  return b;
}
function ago(t) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'الحين' : m < 60 ? `قبل ${m} د` : `قبل ${Math.round(m / 60)} س`; }
setInterval(() => { if (syncState.state === 'synced') renderSidebarFoot(); }, 60000);
function renderSidebarFoot() { const f = document.querySelector('.side-foot .pill'); if (f) f.replaceWith(syncPill()); }

// ---------------- menus ----------------
function contextParent() {
  const cur = nav.id && node(nav.id);
  if (!cur) return null;
  if (cur.type === 'folder') return cur;
  if (cur.type === 'subject') return cur.parentId ? node(cur.parentId) : null;
  if (cur.type === 'lecture') { const s = subjectOf(cur); return s && s.parentId ? node(s.parentId) : null; }
  return null;
}
function addMenu(x, y) {
  const cur = nav.id && node(nav.id);
  const subj = cur && (cur.type === 'subject' ? cur : cur.type === 'lecture' ? subjectOf(cur) : null);
  menu(x, y, [
    { title: 'إضافة جديد' },
    { label: 'مجلد', sub: 'للسنة أو البلوك، مثل "السنة الثالثة" أو "GIT"', iconHtml: `<span style="color:#E8C46A;display:flex">${icon('folder')}</span>`, onClick: () => newFolder(contextParent()?.id || null) },
    { label: 'مادة', sub: 'مثل Anatomy أو Pathology، ولها لون', iconHtml: '<span class="dot" style="background:#F08A4B;width:14px;height:14px;margin:4px 2px 0"></span>', onClick: () => newSubject(contextParent()?.id || null) },
    { label: 'محاضرة', sub: 'استيراد ملف PDF أو سحبه للبرنامج', iconHtml: `<span style="color:#9CC8FF;display:flex">${icon('file')}</span>`, onClick: () => newLecture(subj?.id) },
    'sep',
    { label: 'تصنيف', sub: 'مثل "ميد" أو "فاينل"، بلون تختاره', iconHtml: '<span style="display:flex;gap:3px;margin-top:6px"><span class="dot round" style="background:#F29A4A;width:8px;height:8px"></span><span class="dot round" style="background:#A97CF0;width:8px;height:8px"></span></span>', onClick: () => newTag() }
  ]);
}
function lectureMenu(n, x, y) {
  const tagEl = h('div', { class: 'swrow' }, h('span', { style: { flex: 1 } }, 'التصنيف'));
  for (const t of Object.values(lib.tags)) {
    const on = (n.tags || []).includes(t.id);
    tagEl.append(h('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), style: { background: t.color }, title: t.name, 'aria-label': t.name, onclick: () => { toggleTag(n, t.id); menu.close?.(); document.querySelector('.menu')?.remove(); } }));
  }
  tagEl.append(h('button', { type: 'button', class: 'sw none', title: 'تصنيف جديد', 'aria-label': 'تصنيف جديد', onclick: async () => { document.querySelector('.menu')?.remove(); const t = await newTag(); if (t) toggleTag(n, t.id, true); } }));
  menu(x, y, [
    { label: 'فتح المحاضرة', onClick: () => go({ view: 'lecture', id: n.id }) },
    'sep',
    { label: 'البطاقات (مراجعة متباعدة)', iconHtml: `<span style="color:var(--accent);display:flex">${icon('cards', 16)}</span>`, onClick: () => openCards([n.id], n.name) },
    { label: 'اختبار', iconHtml: `<span style="color:var(--accent);display:flex">${icon('quiz', 16)}</span>`, onClick: () => openQuiz([n.id], n.name) },
    'sep',
    { el: tagEl },
    { label: 'إعادة تسمية', onClick: () => rename(n) },
    { label: 'نقل إلى مادة ثانية…', onClick: () => moveTo(n) },
    { label: 'حذف', danger: true, onClick: () => remove(n) }
  ]);
}
function subjectMenu(n, x, y) {
  menu(x, y, [
    { label: 'فتح المادة', onClick: () => go({ view: 'subject', id: n.id }) },
    { label: 'محاضرة جديدة', onClick: () => newLecture(n.id) },
    'sep',
    { label: 'إعادة تسمية', onClick: () => rename(n) },
    { label: 'تغيير اللون', onClick: () => recolor(n) },
    { label: 'نقل إلى مجلد…', onClick: () => moveTo(n) },
    { label: 'حذف', danger: true, onClick: () => remove(n) }
  ]);
}
function folderMenu(n, x, y) {
  menu(x, y, [
    { label: 'مجلد داخله', onClick: () => newFolder(n.id) },
    { label: 'مادة داخله', onClick: () => newSubject(n.id) },
    'sep',
    { label: 'إعادة تسمية', onClick: () => rename(n) },
    { label: 'نقل إلى…', onClick: () => moveTo(n) },
    { label: 'حذف', danger: true, onClick: () => remove(n) }
  ]);
}
function tagMenu(t, x, y) {
  menu(x, y, [
    { label: 'إعادة تسمية', onClick: async () => { const v = await prompt('اسم التصنيف', t.name); if (v) { t.name = v; saveLib(); render(); } } },
    { label: 'تغيير اللون', onClick: () => pickColor('لون التصنيف', TAG_COLORS, t.color, c => { t.color = c; saveLib(); render(); }) },
    { label: 'حذف التصنيف', danger: true, onClick: async () => { if (await confirmBox('حذف التصنيف؟', `بينشال تصنيف "${t.name}" من كل المحاضرات، والمحاضرات نفسها ما تنحذف.`)) { delete lib.tags[t.id]; lib.deleted[t.id] = Date.now(); for (const n of Object.values(lib.nodes)) if (n.tags) n.tags = n.tags.filter(x => x !== t.id); saveLib(); if (nav.view === 'tag' && nav.id === t.id) go({ view: 'home' }); else render(); } } }
  ]);
}

// ---------------- create / edit ----------------
function parentSelect(types, value, exclude) {
  const sel = h('select', { class: 'field' });
  sel.append(h('option', { value: '' }, '— بدون مجلد —'));
  const walk = (pid, depth) => {
    for (const n of kids(pid, 'folder')) {
      if (exclude && exclude.has(n.id)) continue;
      sel.append(h('option', { value: n.id, selected: n.id === value }, '  '.repeat(depth) + n.name));
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return sel;
}
async function newFolder(parentId) {
  const r = await modal((box, close) => {
    const name = h('input', { class: 'field', placeholder: 'مثلاً: السنة الثالثة، أو GIT', dir: 'auto' });
    const par = parentSelect(['folder'], parentId);
    const ok = h('button', { class: 'btn primary', type: 'button' }, 'إنشاء');
    ok.onclick = () => name.value.trim() && close({ name: name.value.trim(), parentId: par.value || null });
    name.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    box.append(h('h3', {}, 'مجلد جديد'), h('label', {}, 'الاسم', name), h('label', {}, 'داخل', par), h('div', { class: 'acts' }, ok, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء')));
  });
  if (!r) return;
  const n = { id: uid(), type: 'folder', parentId: r.parentId, name: r.name, created: Date.now() };
  lib.nodes[n.id] = n;
  if (r.parentId) lib.ui.expanded[r.parentId] = true;
  lib.ui.expanded[n.id] = true;
  saveLib(); go({ view: 'folder', id: n.id });
}
async function newSubject(parentId) {
  let color = SUBJECT_COLORS[Object.values(lib.nodes).filter(n => n.type === 'subject').length % SUBJECT_COLORS.length];
  const r = await modal((box, close) => {
    const name = h('input', { class: 'field ltr', placeholder: 'مثلاً: Anatomy', dir: 'auto' });
    const par = parentSelect(['folder'], parentId);
    const ok = h('button', { class: 'btn primary', type: 'button' }, 'إنشاء');
    ok.onclick = () => name.value.trim() && close({ name: name.value.trim(), parentId: par.value || null, color });
    name.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    box.append(h('h3', {}, 'مادة جديدة'), h('label', {}, 'اسم المادة', name), h('label', {}, 'اللون', swatches(SUBJECT_COLORS, color, c => color = c)), h('label', {}, 'داخل مجلد', par),
      h('div', { class: 'acts' }, ok, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء')));
  });
  if (!r) return;
  const n = { id: uid(), type: 'subject', parentId: r.parentId, name: r.name, color: r.color, created: Date.now() };
  lib.nodes[n.id] = n;
  if (r.parentId) lib.ui.expanded[r.parentId] = true;
  lib.ui.expanded[n.id] = true;
  saveLib(); go({ view: 'subject', id: n.id });
}
async function newLecture(subjectId) {
  const subjects = Object.values(lib.nodes).filter(n => n.type === 'subject');
  if (!subjects.length) { toast('سوِّ مادة أول، وبعدين أضف محاضراتها'); return newSubject(contextParent()?.id || null); }
  if (!subjectId) {
    subjectId = await modal((box, close) => {
      const sel = h('select', { class: 'field' }, ...subjects.map(s => h('option', { value: s.id }, pathOf(s).map(p => p.name).join(' › '))));
      box.append(h('h3', {}, 'لأي مادة؟'), sel, h('div', { class: 'acts' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close(sel.value) }, 'اختيار الملفات'), h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء')));
    });
    if (!subjectId) return;
  }
  const paths = await api.pickPdfs();
  if (paths.length) await importPaths(paths, subjectId);
}
async function newTag() {
  let color = TAG_COLORS[Object.keys(lib.tags).length % TAG_COLORS.length];
  const r = await modal((box, close) => {
    const name = h('input', { class: 'field', placeholder: 'مثلاً: ميد', dir: 'auto' });
    const ok = h('button', { class: 'btn primary', type: 'button' }, 'إنشاء');
    ok.onclick = () => name.value.trim() && close({ name: name.value.trim(), color });
    name.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    box.append(h('h3', {}, 'تصنيف جديد'), h('label', {}, 'الاسم', name), h('label', {}, 'اللون', swatches(TAG_COLORS, color, c => color = c)), h('div', { class: 'acts' }, ok, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء')));
  });
  if (!r) return null;
  const t = { id: uid(), name: r.name, color: r.color };
  lib.tags[t.id] = t; saveLib(); render();
  return t;
}
function toggleTag(n, tid, force) {
  n.tags ||= [];
  const on = n.tags.includes(tid);
  if (force === true && on) return;
  n.tags = on ? n.tags.filter(x => x !== tid) : [...n.tags, tid];
  saveLib(); render();
}
async function rename(n) { const v = await prompt('إعادة تسمية', n.name); if (v) { n.name = v; saveLib(); render(); } }
function pickColor(title, colors, value, cb) {
  modal((box, close) => { box.append(h('h3', {}, title), swatches(colors, value, c => { cb(c); close(c); })); });
}
function recolor(n) { pickColor('لون المادة', SUBJECT_COLORS, n.color, c => { n.color = c; saveLib(); render(); }); }
async function moveTo(n) {
  const r = await modal((box, close) => {
    let sel;
    if (n.type === 'lecture') {
      const subjects = Object.values(lib.nodes).filter(s => s.type === 'subject');
      sel = h('select', { class: 'field' }, ...subjects.map(s => h('option', { value: s.id, selected: s.id === n.parentId }, pathOf(s).map(p => p.name).join(' › '))));
    } else sel = parentSelect(['folder'], n.parentId, new Set(descendants(n).map(d => d.id)));
    box.append(h('h3', {}, 'نقل "' + n.name + '" إلى'), sel, h('div', { class: 'acts' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close({ v: sel.value || null }) }, 'نقل'), h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء')));
  });
  if (!r) return;
  n.parentId = r.v; saveLib(); render();
}
async function remove(n) {
  const all = descendants(n);
  const lecs = all.filter(x => x.type === 'lecture');
  const msg = n.type === 'lecture' ? 'بتنحذف المحاضرة مع كل ملاحظاتها وكتاباتك عليها.' : `بينحذف "${n.name}" وكل اللي داخله (${lecs.length} محاضرة) مع ملاحظاتها.`;
  if (!(await confirmBox('متأكد تبي تحذف؟', msg))) return;
  for (const x of all) { delete lib.nodes[x.id]; lib.deleted[x.id] = Date.now(); }
  for (const l of lecs) await api.deleteLecture(l.id);
  saveLib(true);
  if (all.some(x => x.id === nav.id)) go(n.parentId ? { view: node(n.parentId)?.type || 'home', id: n.parentId } : { view: 'home' });
  else render();
}

// ---------------- import ----------------
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
async function importFiles(fileList, subjectId) {
  const paths = [...fileList].filter(f => /\.pdf$/i.test(f.name)).map(f => api.pathForFile(f)).filter(Boolean);
  if (!paths.length) return toast('البرنامج يقبل ملفات PDF بس');
  await importPaths(paths, subjectId);
}
async function importPaths(paths, subjectId) {
  const subj = node(subjectId);
  toast(`جاري إضافة ${paths.length} محاضرة…`, 1600);
  let first = null;
  for (const p of paths) {
    const id = uid();
    await api.addPdf(p, id);
    let pages = 0;
    try { const doc = await pdfjsLib.getDocument({ data: await api.readPdf(id) }).promise; pages = doc.numPages; await doc.destroy(); } catch { }
    const name = (typeof p === 'string' ? p.split(/[\\/]/).pop() : p.name).replace(/\.pdf$/i, '');
    lib.nodes[id] = { id, type: 'lecture', parentId: subjectId, name, created: Date.now() + (first ? 1 : 0), pages, tags: [] };
    first ||= id;
  }
  lib.ui.expanded[subjectId] = true;
  saveLib(true);
  toast(paths.length === 1 ? 'تمت إضافة المحاضرة' : `تمت إضافة ${paths.length} محاضرات إلى ${subj?.name || ''}`);
  if (nav.view === 'subject' && nav.id === subjectId) render();
  else go({ view: 'subject', id: subjectId });
}
async function askSubjectForDrop(files) {
  const subjects = Object.values(lib.nodes).filter(n => n.type === 'subject');
  if (!subjects.length) return toast('سوِّ مادة أول من زر +، وبعدين اسحب الملفات عليها');
  const sid = await modal((box, close) => {
    const sel = h('select', { class: 'field' }, ...subjects.map(s => h('option', { value: s.id }, pathOf(s).map(p => p.name).join(' › '))));
    box.append(h('h3', {}, 'لأي مادة نضيف الملفات؟'), sel, h('div', { class: 'acts' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close(sel.value) }, 'إضافة'), h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء')));
  });
  if (sid) importFiles(files, sid);
}
let veil = null;
window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); if (!veil) { veil = h('div', { class: 'dropveil' }, 'أفلت ملفات المحاضرات هنا'); document.body.append(veil); } });
window.addEventListener('dragleave', e => { if (e.relatedTarget == null && veil) { veil.remove(); veil = null; } });
window.addEventListener('drop', e => {
  if (veil) { veil.remove(); veil = null; }
  if (!hasFiles(e)) return;
  e.preventDefault();
  const cur = nav.id && node(nav.id);
  const subj = cur && (cur.type === 'subject' ? cur : cur.type === 'lecture' ? subjectOf(cur) : null);
  if (subj) importFiles(e.dataTransfer.files, subj.id); else askSubjectForDrop(e.dataTransfer.files);
});

// ---------------- thumbnails ----------------
const thumbCache = new Map();
let thumbQueue = Promise.resolve();
function thumbInto(el, id) {
  if (thumbCache.has(id)) { el.src = thumbCache.get(id); return; }
  thumbQueue = thumbQueue.then(async () => {
    let url = await api.getThumb(id);
    if (!url) {
      try {
        const data = await api.readPdf(id);
        if (!data) return;
        const doc = await pdfjsLib.getDocument({ data }).promise;
        const pg = await doc.getPage(1);
        const v0 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: 420 / v0.width });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        url = c.toDataURL('image/png');
        await api.saveThumb(id, url);
        await doc.destroy();
      } catch { return; }
    }
    thumbCache.set(id, url);
    if (el.isConnected) el.src = url;
  });
}

// ---------------- views ----------------
function renderView() {
  const v = $('#view');
  v.innerHTML = '';
  v.scrollTop = 0;
  if (nav.view === 'lecture' && node(nav.id)) return viewLecture(v);
  if (nav.view === 'subject' && node(nav.id)) return viewSubject(v, node(nav.id));
  if (nav.view === 'folder' && node(nav.id)) return viewFolder(v, node(nav.id));
  if (nav.view === 'tag' && lib.tags[nav.id]) return viewTag(v, lib.tags[nav.id]);
  if (nav.view === 'settings') return viewSettings(v);
  return viewHome(v);
}
function crumbs(n) {
  const c = h('div', { class: 'crumbs' });
  pathOf(n).slice(0, -1).forEach((p, i) => { if (i) c.append(h('span', {}, '·')); c.append(h('button', { type: 'button', onclick: () => go({ view: p.type, id: p.id }) }, p.name)); });
  return c;
}
function viewHome(v) {
  const p = h('div', { class: 'page' });
  p.append(h('div', { class: 'head' }, h('h1', { class: 'title' }, 'هلا' + (account?.name ? ' ' + account.name.split(' ')[0] : '')), h('span', { class: 'badge ltr', title: 'رقم التحديث' }, 'v' + APP_VERSION)));
  const roots = kids(null);
  if (!roots.length) {
    p.append(h('div', { class: 'empty' }, h('div', { style: { fontSize: '18px', fontWeight: 700, color: 'var(--text)' } }, 'نبدأ؟'),
      h('div', {}, 'سوِّ مجلد للسنة، وداخله المواد، وبعدين اسحب ملفات المحاضرات على المادة.'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } },
        h('button', { class: 'btn primary', type: 'button', onclick: () => newFolder(null), html: icon('folder', 16) + 'مجلد جديد' }),
        h('button', { class: 'btn', type: 'button', onclick: () => newSubject(null), html: icon('plus', 16) + 'مادة جديدة' }))));
  } else {
    p.append(h('div', { class: 'tiles' }, ...roots.map(tile)));
    const recent = Object.values(lib.nodes).filter(n => n.type === 'lecture' && n.opened).sort((a, b) => b.opened - a.opened).slice(0, 8);
    if (recent.length) { p.append(h('div', { style: { fontWeight: 700, fontSize: '16px', marginTop: '10px' } }, 'آخر المحاضرات اللي فتحتها')); p.append(lectureGrid(recent, null)); }
  }
  v.append(p);
}
function tile(n) {
  const lead = n.type === 'folder' ? h('span', { style: { color: '#E8C46A', display: 'flex' }, html: icon('folder', 22) }) : h('span', { class: 'dot', style: { background: n.color, width: '16px', height: '16px', borderRadius: '5px' } });
  const t = h('button', { class: 'tile', type: 'button' }, lead, h('span', { class: 'n', dir: 'auto' }, n.name), h('span', { style: { color: 'var(--muted)', fontSize: '12px' } }, countLectures(n) + ' محاضرة'));
  t.onclick = () => { lib.ui.expanded[n.id] = true; go({ view: n.type, id: n.id }); };
  t.oncontextmenu = e => { e.preventDefault(); (n.type === 'folder' ? folderMenu : subjectMenu)(n, e.clientX, e.clientY); };
  return t;
}
function viewFolder(v, f) {
  const p = h('div', { class: 'page' });
  p.append(h('div', { class: 'head' }, h('div', {}, crumbs(f), h('h1', { class: 'title' }, h('span', { style: { color: '#E8C46A', display: 'flex' }, html: icon('folder', 26) }), h('span', { dir: 'auto' }, f.name))),
    h('div', { style: { display: 'flex', gap: '8px' } }, h('button', { class: 'btn', type: 'button', onclick: () => newFolder(f.id), html: icon('folder', 16) + 'مجلد داخله' }), h('button', { class: 'btn primary', type: 'button', onclick: () => newSubject(f.id), html: icon('plus', 16) + 'مادة' }))));
  const k = kids(f.id);
  if (!k.length) p.append(h('div', { class: 'empty' }, 'المجلد فاضي. أضف مواد أو مجلدات داخله.'));
  else p.append(h('div', { class: 'tiles' }, ...k.map(tile)));
  v.append(p);
}
function tagStyle(t) { return { background: t.color, color: contrastText(t.color) }; }
function lectureGrid(list, activeTag) {
  const view = lib.settings.subjectView;
  if (view === 'list') {
    return h('div', { class: 'list' }, ...list.map(n => {
      const tags = (n.tags || []).map(id => lib.tags[id]).filter(Boolean);
      const r = h('button', { class: 'lrow' + (activeTag && !tags.some(t => t.id === activeTag) ? ' dim' : ''), type: 'button' },
        h('span', { style: { color: '#9CC8FF', display: 'flex' }, html: icon('file') }), h('span', { class: 'n ltr', dir: 'auto', style: { textAlign: 'right' } }, n.name),
        ...tags.map(t => h('span', { class: 'tagpill', style: tagStyle(t) }, t.name)), h('span', { class: 's' }, (n.pages || '?') + ' سلايد'));
      r.onclick = () => go({ view: 'lecture', id: n.id });
      r.oncontextmenu = e => { e.preventDefault(); lectureMenu(n, e.clientX, e.clientY); };
      return r;
    }));
  }
  return h('div', { class: 'grid' }, ...list.map(n => {
    const tags = (n.tags || []).map(id => lib.tags[id]).filter(Boolean);
    const first = tags[0];
    const img = h('img', { alt: '' });
    thumbInto(img, n.id);
    const dim = activeTag && !tags.some(t => t.id === activeTag);
    const c = h('button', { class: 'card' + (dim ? ' dim' : ''), type: 'button', style: !dim && activeTag ? { borderColor: lib.tags[activeTag].color } : {} },
      h('div', { class: 'band', style: { background: first ? first.color : 'var(--border)' } }),
      h('div', { class: 'thumb' }, img, first ? h('span', { class: 'tagpill', style: tagStyle(first) }, first.name) : null),
      h('div', { class: 'meta' }, h('span', { class: 'n ltr', dir: 'auto', style: { textAlign: 'right' } }, n.name), h('span', { class: 's' }, (n.pages || '?') + ' سلايد' + (tags.length > 1 ? ' · ' + tags.slice(1).map(t => t.name).join('، ') : ''))));
    c.onclick = () => go({ view: 'lecture', id: n.id });
    c.oncontextmenu = e => { e.preventDefault(); lectureMenu(n, e.clientX, e.clientY); };
    return c;
  }));
}
function viewToggle() {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'طريقة العرض' });
  for (const [k, l, ic] of [['grid', 'صور', 'grid'], ['list', 'قائمة', 'listi']]) {
    seg.append(h('button', { type: 'button', class: lib.settings.subjectView === k ? 'on' : '', html: icon(ic, 16) + l, onclick: () => { lib.settings.subjectView = k; saveLib(); renderView(); } }));
  }
  return seg;
}
function tagChips(list, active, onPick) {
  const chips = h('div', { class: 'chips' });
  chips.append(h('button', { type: 'button', class: 'chip' + (!active ? ' on' : ''), style: !active ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}, onclick: () => onPick(null) }, 'الكل · ' + list.length));
  for (const t of Object.values(lib.tags)) {
    const cnt = list.filter(n => (n.tags || []).includes(t.id)).length;
    if (!cnt) continue;
    const on = active === t.id;
    chips.append(h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), style: on ? { borderColor: t.color, background: t.color + '29' } : {}, onclick: () => onPick(on ? null : t.id) },
      h('span', { class: 'dot round', style: { background: t.color, width: '8px', height: '8px' } }), t.name + ' · ' + cnt));
  }
  chips.append(h('button', { type: 'button', class: 'chip dashed', onclick: () => newTag() }, '+ تصنيف'));
  return chips;
}
function actionBar(t, list) {
  const n = list.length, ids = list.map(x => x.id);
  return h('div', { class: 'actionbar', style: { background: t.color + '1A', border: '1px solid ' + t.color + '59' } },
    h('div', { style: { flex: 1, minWidth: '200px' } }, h('b', {}, `${n} ${n === 1 ? 'محاضرة' : 'محاضرات'} بتصنيف "${t.name}"`), h('span', { style: { color: 'var(--muted)' } }, ' — جهّزها للمراجعة مرة وحدة')),
    h('button', { class: 'btn', type: 'button', style: { background: t.color, color: contrastText(t.color), borderColor: 'transparent' }, html: icon('cards', 16) + 'بطاقات المراجعة', onclick: () => openCards(ids, `بطاقات «${t.name}»`) }),
    h('button', { class: 'btn ghost', type: 'button', style: { borderColor: t.color }, html: icon('quiz', 16) + 'اختبار', onclick: () => openQuiz(ids, `اختبار «${t.name}»`) }));
}
function viewSubject(v, s) {
  const p = h('div', { class: 'page' });
  const list = lecturesOf(s.id);
  const active = nav.tag && lib.tags[nav.tag] ? nav.tag : null;
  p.append(h('div', { class: 'head' },
    h('div', {}, crumbs(s), h('h1', { class: 'title' }, h('span', { class: 'dot', style: { background: s.color, width: '14px', height: '14px', borderRadius: '4px' } }), h('span', { class: 'ltr', dir: 'auto' }, s.name))),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, viewToggle(), h('button', { class: 'btn primary', type: 'button', html: icon('plus', 16) + 'محاضرة', onclick: () => newLecture(s.id) }))));
  if (!list.length) {
    p.append(h('div', { class: 'empty' }, h('div', { style: { color: '#9CC8FF' }, html: icon('file', 40) }), h('div', { style: { fontSize: '16px', fontWeight: 700, color: 'var(--text)' } }, 'اسحب ملفات المحاضرات هنا'), h('div', {}, 'أو اضغط "محاضرة" واختر الملفات. تقدر تضيف كذا ملف مرة وحدة.')));
  } else {
    p.append(tagChips(list, active, t => { nav.tag = t; renderView(); }));
    if (active) p.append(actionBar(lib.tags[active], list.filter(n => (n.tags || []).includes(active))));
    p.append(lectureGrid(list, active));
  }
  v.append(p);
}
function viewTag(v, t) {
  const p = h('div', { class: 'page' });
  const list = Object.values(lib.nodes).filter(n => n.type === 'lecture' && (n.tags || []).includes(t.id)).sort((a, b) => (a.created || 0) - (b.created || 0));
  p.append(h('div', { class: 'head' }, h('div', {}, h('div', { class: 'crumbs' }, 'تصنيف'), h('h1', { class: 'title' }, h('span', { class: 'dot round', style: { background: t.color, width: '14px', height: '14px' } }), t.name)), viewToggle()));
  if (!list.length) p.append(h('div', { class: 'empty' }, 'ما فيه محاضرات بهذا التصنيف. كليك يمين على أي محاضرة واختر التصنيف.'));
  else { p.append(actionBar(t, list)); p.append(lectureGrid(list, null)); }
  v.append(p);
}

// ---------------- lecture ----------------
async function viewLecture(v) {
  const n = node(nav.id);
  n.opened = Date.now(); saveLib();
  const s = subjectOf(n);
  lectureCtl = await openLecture(v, {
    node: n, subject: s, lib, pdfjsLib, api, startPage: nav.page,
    tags: (n.tags || []).map(id => lib.tags[id]).filter(Boolean),
    saveSettings: () => saveLib(),
    back: () => go(s ? { view: 'subject', id: s.id } : { view: 'home' }),
    setFocus: on => $('#app').classList.toggle('focus', on),
    openCards: () => openCards([n.id], n.name),
    openQuiz: () => openQuiz([n.id], n.name),
    contextMenu: (x, y) => lectureMenu(n, x, y)
  });
}

// ---------------- settings ----------------
function viewSettings(v) {
  const st = lib.settings;
  const p = h('div', { class: 'page', style: { maxWidth: '1080px' } });
  p.append(h('div', { class: 'head' }, h('h1', { class: 'title' }, 'الإعدادات'), h('span', { class: 'badge ltr' }, 'الإصدار v' + APP_VERSION)));
  const opt = (on, pv, title, desc, badge, onClick) => h('button', { class: 'opt' + (on ? ' on' : ''), type: 'button', onclick: onClick }, pv, h('div', { class: 't' }, title, badge ? h('span', { class: 'badge' }, badge) : null), h('div', { class: 'd' }, desc));
  const line = (w, c = 'var(--muted)') => `<div style="height:5px;width:${w}%;background:${c};border-radius:2px;opacity:.7"></div>`;
  const pvSide = h('div', { class: 'pv', html: `<div style="flex:3;border-radius:6px;background:#fff;padding:10px;display:flex;flex-direction:column;gap:5px">${line(55, '#C62828')}${line(80, '#ccc')}${line(70, '#ccc')}</div><div style="flex:2;border-radius:6px;background:var(--panel);padding:10px;display:flex;flex-direction:column;gap:5px">${line(90)}${line(70)}${line(80)}</div>` });
  const pvOn = h('div', { class: 'pv', html: `<div style="position:relative;flex:1;border-radius:6px;background:#fff;padding:10px;display:flex;flex-direction:column;gap:5px">${line(40, '#C62828')}${line(60, '#ccc')}${line(50, '#ccc')}<div style="position:absolute;top:14px;left:14px;width:70px;height:34px;border-radius:4px;background:#FFE27A"></div><div style="position:absolute;bottom:12px;left:40%;width:60px;height:26px;border-radius:4px;background:#9BE3B5"></div></div>` });
  p.append(h('section', { class: 'set-sec' }, h('div', {}, h('div', { class: 'h' }, 'مكان الملاحظات'), h('div', { class: 'd' }, 'وين تكتب ملاحظاتك وأنت تذاكر المحاضرة')),
    h('div', { class: 'opts' },
      opt(st.notesMode === 'side', pvSide, 'جنب السلايد', 'مربع ملاحظات جنب كل سلايد، وتقدر تكتب على السلايد بعد.', 'ننصح فيه', () => { st.notesMode = 'side'; saveLib(); renderView(); }),
      opt(st.notesMode === 'onslide', pvOn, 'على السلايد نفسها', 'بدون مربع جانبي. تكتب وترسم فوق السلايد وحوله بس.', null, () => { st.notesMode = 'onslide'; saveLib(); renderView(); }))));
  const pvGrid = h('div', { class: 'pv', style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }, html: ['#F29A4A', '#F29A4A', '#A97CF0', '#A97CF0', 'var(--border)', 'var(--border)'].map(c => `<div style="border-radius:5px;background:#fff;border-top:5px solid ${c}"></div>`).join('') });
  const pvList = h('div', { class: 'pv', style: { flexDirection: 'column', gap: '7px' }, html: ['#F29A4A', '#F29A4A', '#A97CF0'].map(c => `<div style="display:flex;align-items:center;gap:6px;height:16px"><span style="width:8px;height:8px;border-radius:50%;background:${c}"></span><span style="flex:1;height:6px;background:var(--muted);opacity:.6;border-radius:2px"></span></div>`).join('') });
  p.append(h('section', { class: 'set-sec' }, h('div', {}, h('div', { class: 'h' }, 'لما تفتح مادة'), h('div', { class: 'd' }, 'كيف تنعرض محاضرات المادة')),
    h('div', { class: 'opts' },
      opt(st.subjectView === 'grid', pvGrid, 'صور المحاضرات', 'أغلفة مثل نوتبيلتي، ولون التصنيف فوق كل غلاف.', null, () => { st.subjectView = 'grid'; saveLib(); renderView(); }),
      opt(st.subjectView === 'list', pvList, 'قائمة', 'أسماء المحاضرات تحت بعض مع لون التصنيف.', null, () => { st.subjectView = 'list'; saveLib(); renderView(); }))));
  const themes = h('div', { class: 'themes' });
  for (const [k, l, bg, fg] of [['night', 'ليلي', '#16191C', '#E8EAED'], ['paper', 'ورقي', '#F6F3EE', '#23201C'], ['indigo', 'نيلي', '#14152B', '#ECECF8']])
    themes.append(h('button', { type: 'button', class: st.theme === k ? 'on' : '', style: { background: bg, color: fg }, onclick: () => { st.theme = k; applyTheme(); saveLib(); renderView(); } }, l));
  p.append(h('section', { class: 'set-sec' }, h('div', {}, h('div', { class: 'h' }, 'الثيم'), h('div', { class: 'd' }, 'اختياري — غيّره متى ما بغيت')), themes));
  const tagsBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '520px' } });
  for (const t of Object.values(lib.tags)) tagsBox.append(h('div', { class: 'tagrow' }, h('span', { class: 'dot round', style: { background: t.color, width: '12px', height: '12px' } }), h('span', { class: 'n' }, t.name),
    h('button', { class: 'mini', type: 'button', onclick: e => tagMenu(t, e.clientX, e.clientY) }, 'تعديل')));
  tagsBox.append(h('button', { class: 'btn ghost', type: 'button', style: { alignSelf: 'flex-start' }, html: icon('plus', 16) + 'تصنيف جديد', onclick: () => newTag() }));
  p.append(h('section', { class: 'set-sec' }, h('div', { class: 'h' }, 'التصنيفات'), tagsBox));
  const acct = h('div', { class: 'acct' });
  if (account) {
    const av = h('div', { class: 'avatar', style: { width: '40px', height: '40px' } }); if (account.picture) av.append(h('img', { src: account.picture, alt: '' })); else av.textContent = (account.name || '').slice(0, 2);
    acct.append(av, h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 600 } }, account.email), h('div', { style: { fontSize: '12px', color: 'var(--muted)' } }, 'ملفاتك محفوظة في مجلد "دفتري" داخل Google Drive')),
      h('button', { class: 'btn', type: 'button', html: icon('sync', 16) + 'زامن الحين', onclick: () => api.syncNow() }),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { if (await confirmBox('تسجيل خروج؟', 'ملفاتك تبقى على الجهاز وفي الدرايف، بس المزامنة بتوقف.', 'تسجيل خروج')) { await api.logout(); account = null; syncState = { state: 'signedout' }; render(); } } }, 'تسجيل خروج'));
  } else {
    acct.append(h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 600 } }, 'مو مسجّل دخول'), h('div', { style: { fontSize: '12px', color: 'var(--muted)' } }, 'سجّل بقوقل عشان تتزامن محاضراتك بين اللابتوب والكمبيوتر')),
      h('button', { class: 'btn primary', type: 'button', onclick: doLogin }, 'تسجيل الدخول بقوقل'));
  }
  const errLine = account && syncState.state === 'error' && syncState.message ? h('div', { class: 'ltr', style: { fontSize: '12px', color: 'var(--danger)', textAlign: 'left', wordBreak: 'break-word' } }, syncState.message) : null;
  const accSec = h('section', { class: 'set-sec' }, h('div', { class: 'h' }, 'الحساب والمزامنة'), acct, errLine,
    api.openData ? h('button', { class: 'linkbtn', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => api.openData() }, 'فتح مجلد ملفات البرنامج على الجهاز') : null);
  p.insertBefore(accSec, p.children[1]);
  const keyInp = h('input', { class: 'field ltr', type: 'password', placeholder: 'AIza…', value: st.geminiKey || '', style: { flex: 1, minWidth: '240px' } });
  const keyMsg = h('div', { style: { fontSize: '12px', color: 'var(--muted)' } }, st.geminiKey ? 'المفتاح محفوظ ✓' : 'بدون مفتاح ما تشتغل البطاقات والاختبارات');
  const saveKey = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const k = keyInp.value.trim(); keyMsg.textContent = 'أتأكد من المفتاح…';
    try { await testKey(k); st.geminiKey = k; saveLib(); keyMsg.textContent = 'المفتاح شغال ✓'; keyMsg.style.color = '#3FBF7F'; }
    catch (e) { keyMsg.textContent = 'المفتاح ما اشتغل: ' + e.message; keyMsg.style.color = 'var(--danger)'; } } }, 'حفظ');
  p.insertBefore(h('section', { class: 'set-sec' }, h('div', {}, h('div', { class: 'h' }, 'الذكاء الاصطناعي (Gemini)'), h('div', { class: 'd' }, 'يسوي البطاقات والاختبارات من سلايدات المحاضرة. المفتاح مجاني من Google AI Studio.')),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '640px' } }, keyInp, saveKey), keyMsg), p.children[2]);
  v.append(p);
}

// ---------------- search ----------------
function openSearch() {
  modal((box, close) => {
    box.style.width = 'min(640px, 94vw)';
    const inp = h('input', { class: 'field', placeholder: 'ابحث في أسماء المحاضرات والملاحظات…', dir: 'auto' });
    const res = h('div', { class: 'results' });
    let t = null, seq = 0;
    const show = async () => {
      const q = inp.value.trim(); const my = ++seq;
      res.innerHTML = '';
      if (!q) return;
      const ql = q.toLowerCase();
      const names = Object.values(lib.nodes).filter(n => n.name.toLowerCase().includes(ql)).slice(0, 12);
      for (const n of names) {
        const b = h('button', { class: 'res', type: 'button' }, h('span', { dir: 'auto' }, n.name), h('span', { class: 's' }, { folder: 'مجلد', subject: 'مادة', lecture: 'محاضرة' }[n.type] + (n.parentId ? ' · ' + pathOf(n).slice(0, -1).map(x => x.name).join(' › ') : '')));
        b.onclick = () => { close(); go({ view: n.type, id: n.id }); };
        res.append(b);
      }
      const hits = await api.search(q);
      if (my !== seq) return;
      for (const hit of hits) {
        const n = node(hit.id); if (!n) continue;
        const snip = esc(hit.snippet).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
        const b = h('button', { class: 'res', type: 'button' }, h('span', { dir: 'auto', html: snip }), h('span', { class: 's' }, `${n.name} · سلايد ${hit.page + 1}`));
        b.onclick = () => { close(); go({ view: 'lecture', id: n.id, page: hit.page }); };
        res.append(b);
      }
      if (!res.children.length) res.append(h('div', { style: { color: 'var(--muted)', padding: '12px' } }, 'ما لقيت شي'));
    };
    inp.oninput = () => { clearTimeout(t); t = setTimeout(show, 160); };
    inp.onkeydown = e => { if (e.key === 'Enter') res.querySelector('.res')?.click(); };
    box.append(inp, res);
  });
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
});

// ---------------- login ----------------
async function doLogin() {
  const r = await api.login();
  if (r.ok) { account = await api.authStatus(); account = account.signedIn ? account : null; toast('أهلاً ' + (r.name || '') + ' — المزامنة شغالة'); $('#login').classList.add('hidden'); render(); return true; }
  if (r.error === 'not-configured') toast('تسجيل الدخول بقوقل يحتاج مفتاح البرنامج — بنضبطه سوا خطوة بخطوة', 4500);
  else if (r.error !== 'cancelled') toast('ما تم تسجيل الدخول: ' + r.error, 4000);
  return false;
}
function showLogin(status) {
  const L = $('#login');
  L.innerHTML = '';
  const btn = h('button', { class: 'gbtn', type: 'button', html: '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>تسجيل الدخول بقوقل' });
  const note = h('p', { style: { fontSize: '12px' } }, 'بنسوي مجلد اسمه "دفتري" في الدرايف حقك، والبرنامج ما يشوف إلا الملفات اللي هو يسويها.');
  btn.onclick = async () => {
    btn.disabled = true; btn.lastChild.textContent = 'كمّل تسجيل الدخول في المتصفح…';
    const ok = await doLogin();
    btn.disabled = false; btn.lastChild.textContent = 'تسجيل الدخول بقوقل';
  };
  const skip = h('button', { class: 'linkbtn', type: 'button', onclick: () => { localStorage.setItem('daftari.offline', '1'); L.classList.add('hidden'); } }, 'استخدمه بدون حساب الحين');
  L.append(h('div', { class: 'login-card' }, h('div', { class: 'logo', html: icon('book') }), h('h1', {}, 'دفتري'), h('p', {}, 'محاضراتك وملاحظاتك في مكان واحد، ومتزامنة بين أجهزتك.'), btn, note, skip));
  L.classList.remove('hidden');
}

// ---------------- sync events ----------------
api.onSyncStatus(s => { syncState = s; renderSidebarFoot(); if (nav.view === 'settings') renderView(); });
api.onPulled(async list => {
  if (list.includes('library.json')) {
    const fresh = normalize(await api.loadLibrary());
    lib.nodes = fresh.nodes; lib.tags = fresh.tags; lib.settings = fresh.settings; lib.deleted = fresh.deleted; lib.ui = fresh.ui;
    applyTheme();
  }
  if (lectureCtl && list.includes('lectures/' + nav.id + '.json')) await lectureCtl.reloadFromDisk();
  if (nav.view !== 'lecture') renderView();
  renderSidebar();
});

// ---------------- boot ----------------
(async () => {
  lib = normalize(await api.loadLibrary());
  applyTheme();
  const st = await api.authStatus();
  account = st.signedIn ? st : null;
  if (account) { syncState = { state: 'needtoken' }; api._resume && api._resume(); }
  render();
  if (!account && !localStorage.getItem('daftari.offline')) showLogin(st);
  if (!(await api.loadLibrary())) saveLib(true);
})();
