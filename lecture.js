// Lecture view: slides + free writing (pen, highlighter, text anywhere, shapes, eraser) + side notes
import { getStroke } from './vendor/perfect-freehand.mjs';
import { h, icon, esc } from './ui.js';

const PALETTES = {
  pen: [['أسود', '#1B1B1B'], ['أزرق', '#2F6FED'], ['أحمر', '#E5484D'], ['أخضر', '#30A46C'], ['برتقالي', '#F08A4B'], ['بنفسجي', '#8E4EC6'], ['أبيض', '#FFFFFF']],
  highlight: [['أصفر', '#FFE27A'], ['أخضر', '#9BE3B5'], ['وردي', '#F7A8C4'], ['أزرق', '#9CC8FF'], ['برتقالي', '#FFC58A']],
  text: [['أبيض', '#FFFFFF'], ['أزرق', '#7FB0FF'], ['أحمر', '#FF7A7F'], ['أخضر', '#6FD39B'], ['أصفر', '#FFE27A'], ['أسود', '#1B1B1B'], ['أزرق غامق', '#2F6FED'], ['أحمر غامق', '#C62828']]
};
PALETTES.shapes = PALETTES.pen;
const THICK = { pen: [2, 3.5, 6], highlight: [10, 16, 24], shapes: [2, 3.5, 6] };
const SIZES = [12, 14, 16, 18, 22, 28, 36];
const SHAPES = [['rect', 'مربع'], ['ellipse', 'دائرة'], ['star', 'نجمة'], ['triangle', 'مثلث'], ['arrow', 'سهم'], ['line', 'خط مستقيم'], ['diamond', 'معين'], ['bubble', 'فقاعة كلام']];
const TOOLS = [['select', 'تحديد', 'select', 'V'], ['pen', 'قلم', 'pen', 'P'], ['highlight', 'تحديد ملوّن', 'hl', 'H'], ['text', 'كتابة', 'text', 'T'], ['shapes', 'أشكال', 'shapes', 'S'], ['eraser', 'ممحاة', 'eraser', 'E']];
const MORE = { pen: 'خيارات القلم', highlight: 'خيارات قلم التحديد', text: 'حجم الخط', shapes: 'اختيار الشكل', eraser: 'نوع الممحاة' };
const NS = 'http://www.w3.org/2000/svg';
const uid = () => Math.random().toString(36).slice(2, 10);
const r1 = v => Math.round(v * 10) / 10;

export async function openLecture(container, ctx) {
  const { node, lib, pdfjsLib, api } = ctx;
  const st = lib.settings;
  const prefs = st.tools;
  let tool = st.lastTool && TOOLS.some(t => t[0] === st.lastTool) ? st.lastTool : 'pen';
  let zoom = st.zoom || 1;
  let data = await api.loadLecture(node.id);
  data.pages ||= {};
  let doc = null, sizes = [], boards = [], fit = 1, closed = false;
  let selected = null; // {i, id}
  let editing = null;  // {i, item, el, before}
  let undo = [], redo = [];
  let saveT = null, saving = false;
  let pop = null;
  const sideNotes = st.notesMode !== 'onslide';
  const renders = new Map();

  container.innerHTML = '';
  const root = h('div', { class: 'lecv' });
  container.append(root);

  // ---------- header ----------
  const saved = h('div', { class: 'saved' }, h('span', { class: 'dot round', style: { width: '7px', height: '7px', background: '#3FBF7F' } }), h('span', {}, 'محفوظ'));
  const focusBtn = h('button', { class: 'icon-btn', type: 'button', title: 'وضع التركيز', 'aria-label': 'وضع التركيز', html: icon('focus') });
  let focusOn = false;
  focusBtn.onclick = () => { focusOn = !focusOn; ctx.setFocus(focusOn); focusBtn.classList.toggle('on', focusOn); setTimeout(relayout, 30); };
  const moreBtn = h('button', { class: 'icon-btn', type: 'button', title: 'خيارات المحاضرة', 'aria-label': 'خيارات المحاضرة', html: '<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>' });
  moreBtn.onclick = () => { const r = moreBtn.getBoundingClientRect(); ctx.contextMenu(r.right, r.bottom + 6); };
  const title = h('div', { class: 't' });
  for (const t of ctx.tags) title.append(h('span', { class: 'tagpill', style: { background: t.color, color: '#1B1B1B' } }, t.name));
  title.append(h('span', { class: 'ltr', dir: 'auto' }, node.name));
  root.append(h('div', { class: 'lec-head' },
    h('button', { class: 'btn ghost', type: 'button', style: { height: '36px', padding: '0 10px' }, html: icon('back', 16) + `<span class="ltr">${esc(ctx.subject?.name || 'رجوع')}</span>`, onclick: () => ctx.back() }),
    title, saved, moreBtn, focusBtn));

  // ---------- toolbar ----------
  const toolsWrap = h('div', { class: 'tools-wrap' });
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'أدوات الكتابة' });
  const strip = h('div', { class: 'strip' });
  const studyBtns = h('div', { class: 'study-btns' },
    h('button', { class: 'btn', type: 'button', html: icon('cards', 16) + 'البطاقات', onclick: () => ctx.openCards() }),
    h('button', { class: 'btn', type: 'button', html: icon('quiz', 16) + 'اختبار', onclick: () => ctx.openQuiz() }));
  toolsWrap.append(studyBtns, toolbar, strip);
  root.append(toolsWrap);
  const zoomLbl = h('span', { class: 'zoom' });

  function drawToolbar() {
    toolbar.innerHTML = '';
    for (const [id, label, ic, key] of TOOLS) {
      const wrap = h('div', { class: 'tool' + (tool === id ? ' on' : '') });
      const b = h('button', { type: 'button', title: `${label} (${key})`, html: icon(ic) + label });
      b.onclick = () => setTool(id);
      wrap.append(b);
      if (MORE[id]) {
        const m = h('button', { type: 'button', class: 'more', 'aria-label': MORE[id], title: MORE[id], html: icon('down', 14) });
        m.onclick = e => { e.stopPropagation(); setTool(id); openPop(id, m); };
        wrap.append(m);
      }
      toolbar.append(wrap);
    }
    toolbar.append(h('span', { class: 'tb-sep' }),
      h('button', { class: 'icon-btn', type: 'button', title: 'تراجع (Ctrl+Z)', 'aria-label': 'تراجع', html: icon('undo'), onclick: doUndo }),
      h('button', { class: 'icon-btn', type: 'button', title: 'إعادة (Ctrl+Y)', 'aria-label': 'إعادة', html: icon('redo'), onclick: doRedo }),
      h('span', { class: 'tb-sep' }),
      h('button', { class: 'icon-btn', type: 'button', title: 'تصغير', 'aria-label': 'تصغير', html: icon('zout'), onclick: () => setZoom(zoom / 1.15) }),
      zoomLbl,
      h('button', { class: 'icon-btn', type: 'button', title: 'تكبير', 'aria-label': 'تكبير', html: icon('zin'), onclick: () => setZoom(zoom * 1.15) }));
    zoomLbl.textContent = Math.round(zoom * 100) + '%';
  }

  function colorRow(kind) {
    const p = prefs[kind];
    const sel = selItem();
    const cur = sel && kindOf(sel) === kind ? sel.c : p.color;
    const els = [];
    for (const [name, hex] of PALETTES[kind]) {
      els.push(h('button', { type: 'button', class: 'sw' + (hex.toLowerCase() === String(cur).toLowerCase() ? ' on' : '') + (hex === '#1B1B1B' ? ' dark' : ''), style: { background: hex }, title: name, 'aria-label': name, onclick: () => setPref(kind, 'color', hex) }));
    }
    const custom = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#ffffff', 'aria-label': 'لون مخصص' });
    custom.oninput = () => setPref(kind, 'color', custom.value, true);
    custom.onchange = () => setPref(kind, 'color', custom.value);
    els.push(h('label', { class: 'cp', title: 'لون مخصص', html: icon('plus', 14) }, custom));
    return els;
  }
  function thickRow(kind) {
    const p = prefs[kind];
    const sel = selItem();
    const cur = sel && kindOf(sel) === kind ? sel.w : p.size;
    return [h('span', { class: 'lbl' }, 'السُمك'), ...THICK[kind].map((v, i) => h('button', { type: 'button', class: 'thick' + (Math.abs(v - cur) < .01 ? ' on' : ''), 'aria-label': ['رفيع', 'متوسط', 'عريض'][i], title: ['رفيع', 'متوسط', 'عريض'][i], onclick: () => setPref(kind, 'size', v) }, h('span', { style: { height: [2, 4, 7][i] + 'px' } })))];
  }
  function toggle(kind, key, label) {
    const inp = h('input', { type: 'checkbox', checked: !!prefs[kind][key] });
    inp.onchange = () => setPref(kind, key, inp.checked);
    return h('label', { class: 'tog' }, inp, label);
  }
  const sep = () => h('span', { class: 'tb-sep', style: { height: '22px', margin: 0 } });
  function drawStrip() {
    strip.innerHTML = '';
    const add = (...xs) => strip.append(...xs.flat());
    if (tool === 'pen') add(h('span', { class: 'lbl' }, 'لون القلم'), colorRow('pen'), sep(), thickRow('pen'), sep(), toggle('pen', 'smooth', 'تنعيم الخط'));
    else if (tool === 'highlight') add(h('span', { class: 'lbl' }, 'لون التحديد'), colorRow('highlight'), sep(), thickRow('highlight'), sep(), toggle('highlight', 'straight', 'خط مستقيم تلقائي'));
    else if (tool === 'text') {
      const t = prefs.text; const sel = selItem(); const it = sel && sel.t === 'text' ? sel : null;
      const size = it ? it.s : t.size;
      const sizeBtn = h('button', { type: 'button', class: 'mini on', title: 'حجم الخط', html: `<b>${size}</b>` + icon('down', 12) });
      sizeBtn.onclick = e => { e.stopPropagation(); openPop('text', sizeBtn); };
      add(h('span', { class: 'lbl' }, 'لون النص'), colorRow('text'), sep(), h('span', { class: 'lbl' }, 'الحجم'), sizeBtn,
        h('button', { type: 'button', class: 'mini' + ((it ? it.b : t.bold) ? ' on' : ''), 'aria-label': 'عريض', title: 'عريض (Ctrl+B)', style: { fontWeight: 800 }, onclick: () => setPref('text', 'bold', !(it ? it.b : t.bold)) }, 'B'),
        h('button', { type: 'button', class: 'mini' + ((it ? it.it : t.italic) ? ' on' : ''), 'aria-label': 'مائل', title: 'مائل', style: { fontStyle: 'italic' }, onclick: () => setPref('text', 'italic', !(it ? it.it : t.italic)) }, 'I'),
        sep(), h('span', { class: 'lbl' }, 'اضغط أي مكان في الصفحة وابدأ اكتب'));
    } else if (tool === 'shapes') {
      const k = SHAPES.find(s => s[0] === prefs.shapes.kind) || SHAPES[0];
      const shBtn = h('button', { type: 'button', class: 'mini on', title: 'الشكل', html: icon(k[0]) + k[1] + icon('down', 12) });
      shBtn.onclick = e => { e.stopPropagation(); openPop('shapes', shBtn); };
      add(shBtn, sep(), h('span', { class: 'lbl' }, 'لون الشكل'), colorRow('shapes'), sep(), thickRow('shapes'), sep(), toggle('shapes', 'fill', 'تعبئة بلون فاتح'));
    } else if (tool === 'eraser') {
      const m = prefs.eraser.mode;
      add(h('span', { class: 'lbl' }, 'الممحاة'),
        h('button', { type: 'button', class: 'mini' + (m === 'whole' ? ' on' : ''), onclick: () => setPref('eraser', 'mode', 'whole') }, 'تمسح الشي كامل'),
        h('button', { type: 'button', class: 'mini' + (m === 'part' ? ' on' : ''), onclick: () => setPref('eraser', 'mode', 'part') }, 'تمسح جزء من الخط'));
    } else add(h('span', { class: 'lbl' }, 'اضغط على أي شي عشان تحركه، Delete تحذفه، ودبل كليك على النص تعدّله'));
  }

  function openPop(kind, anchor) {
    closePop();
    const p = h('div', { class: 'pop' });
    if (kind === 'text') {
      p.append(h('div', { class: 'lbl', style: { fontSize: '12px', color: 'var(--muted)', padding: '4px 8px' } }, 'حجم الخط'));
      const sel = selItem(); const cur = sel && sel.t === 'text' ? sel.s : prefs.text.size;
      for (const n of SIZES) p.append(h('button', { type: 'button', class: 'size-opt' + (n === cur ? ' on' : ''), onclick: () => { setPref('text', 'size', n); closePop(); } },
        h('span', { style: { fontSize: Math.min(n, 24) + 'px' } }, n <= 14 ? 'صغير' : n <= 18 ? 'عادي' : n <= 28 ? 'كبير' : 'عنوان'), h('span', { class: 'n' }, n)));
      p.append(h('div', { class: 'lock', html: icon('lock', 14) + 'يثبت على هذا الحجم لين تغيّره' }));
    } else if (kind === 'shapes') {
      p.append(h('div', { style: { fontSize: '12px', color: 'var(--muted)', padding: '2px 4px 6px' } }, 'اختر الشكل'));
      const g = h('div', { class: 'shape-grid' });
      for (const [k, l] of SHAPES) g.append(h('button', { type: 'button', class: prefs.shapes.kind === k ? 'on' : '', title: l, 'aria-label': l, html: icon(k, 24), onclick: () => { prefs.shapes.kind = k; persist(); closePop(); drawStrip(); } }));
      p.append(g, h('div', { class: 'hint' }, 'اسحب بالماوس لترسم، و Shift يخليه متساوي'));
    } else if (kind === 'eraser') {
      for (const [m, l, d] of [['whole', 'تمسح الشي كامل', 'ضغطة على الخط أو الشكل أو النص تمسحه'], ['part', 'تمسح جزء من الخط', 'تمسح بس المكان اللي تمر عليه']])
        p.append(h('button', { type: 'button', class: 'size-opt' + (prefs.eraser.mode === m ? ' on' : ''), style: { flexDirection: 'column', alignItems: 'flex-start', padding: '8px 10px', gap: 0 }, onclick: () => { setPref('eraser', 'mode', m); closePop(); } }, h('span', {}, l), h('span', { class: 'n' }, d)));
    } else return;
    toolsWrap.append(p);
    const ar = anchor.getBoundingClientRect(), wr = toolsWrap.getBoundingClientRect();
    let left = ar.right - wr.left - p.offsetWidth;
    left = Math.max(8, Math.min(left, wr.width - p.offsetWidth - 8));
    p.style.left = left + 'px'; p.style.top = (ar.bottom - wr.top + 6) + 'px';
    pop = p;
  }
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  const onDocDown = e => { if (pop && !pop.contains(e.target)) closePop(); };
  document.addEventListener('pointerdown', onDocDown, true);

  function setTool(id) {
    if (editing && id !== 'text') endEdit();
    tool = id; st.lastTool = id; persist();
    if (id !== 'select' && !(id === 'text' && selItem()?.t === 'text')) setSelected(null, false);
    closePop(); drawToolbar(); drawStrip();
    for (const b of boards) b.el.dataset.tool = tool;
  }
  function kindOf(it) { return it.t === 'pen' ? 'pen' : it.t === 'hl' ? 'highlight' : it.t === 'text' ? 'text' : it.t === 'shape' ? 'shapes' : null; }
  function setPref(kind, key, val, live) {
    prefs[kind][key] = val;
    persist();
    // apply to selected / editing item of the same kind
    const it = selItem();
    if (it && kindOf(it) === kind && (key === 'color' || key === 'size' || key === 'bold' || key === 'italic' || key === 'fill')) {
      const i = selected.i;
      if (!live) pushUndo(i);
      if (key === 'color') it.c = val;
      if (key === 'size') { if (it.t === 'text') it.s = val; else it.w = val; }
      if (key === 'bold') it.b = val;
      if (key === 'italic') it.it = val;
      if (key === 'fill') it.f = val;
      renderPage(i); scheduleSave();
      if (editing) { const el = boards[i].texts.querySelector(`[data-id="${it.id}"]`); if (el) { editing.el = el; startEdit(i, it, el, true); } }
    }
    if (!live) drawStrip();
  }
  let persistT = null;
  function persist() { clearTimeout(persistT); persistT = setTimeout(() => ctx.saveSettings(), 500); }

  // ---------- pages ----------
  const pagesEl = h('div', { class: 'pages' });
  root.append(pagesEl);
  pagesEl.append(h('div', { class: 'loading' }, 'جاري فتح المحاضرة…'));
  try {
    const bytes = await api.readPdf(node.id);
    if (!bytes) throw new Error('missing');
    doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  } catch (e) {
    pagesEl.innerHTML = '';
    pagesEl.append(h('div', { class: 'loading' }, 'ملف المحاضرة مو موجود على هذا الجهاز للحين. لو أضفته من جهاز ثاني، انتظر المزامنة شوي.'));
    drawToolbar(); drawStrip();
    return { close: async () => { closed = true; document.removeEventListener('pointerdown', onDocDown, true); }, reloadFromDisk: async () => ctx.back() };
  }
  for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const v = pg.getViewport({ scale: 1 }); sizes.push({ W: v.width, H: v.height }); }
  if (node.pages !== doc.numPages) { node.pages = doc.numPages; ctx.saveSettings(); }
  pagesEl.innerHTML = '';

  const geo = i => { const { W, H } = sizes[i]; const G = Math.round(W * 0.42), M = 24; return { W, H, G, M, BW: G + W + M, BH: H + 2 * M }; };
  const pageData = i => (data.pages[i] ||= { note: '', items: [] });

  const io = new IntersectionObserver(ents => { for (const en of ents) if (en.isIntersecting) renderPdf(Number(en.target.dataset.i)); }, { root: pagesEl, rootMargin: '900px 0px' });

  for (let i = 0; i < sizes.length; i++) {
    const g = geo(i);
    const board = h('div', { class: 'board', 'data-i': i, 'data-tool': tool });
    const slide = h('div', { class: 'slide' });
    const canvas = h('canvas');
    slide.append(canvas, h('span', { class: 'pno' }, `${i + 1} / ${sizes.length}`));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ink'); svg.setAttribute('viewBox', `0 0 ${g.BW} ${g.BH}`); svg.setAttribute('preserveAspectRatio', 'none');
    const texts = h('div', { class: 'texts' });
    board.append(slide, svg, texts);
    const row = h('div', { class: 'prow' }, board);
    let note = null;
    if (sideNotes) {
      const ta = h('textarea', { dir: 'auto', placeholder: 'اكتب ملاحظتك هنا…', 'aria-label': `ملاحظة سلايد ${i + 1}` });
      ta.value = pageData(i).note || '';
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(120, ta.scrollHeight) + 'px'; };
      ta.oninput = () => { pageData(i).note = ta.value; grow(); scheduleSave(); };
      note = h('div', { class: 'note' }, h('div', { class: 'h' }, h('span', {}, 'سلايد ' + (i + 1)), h('span', {}, 'ملاحظة')), ta);
      row.append(note);
      requestAnimationFrame(grow);
      note._grow = grow; note._ta = ta;
    }
    pagesEl.append(row);
    boards.push({ el: board, slide, canvas, svg, texts, note, row, rendered: 0 });
    io.observe(board);
    bindBoard(i);
  }

  function computeFit() {
    const avail = pagesEl.clientWidth - 48 - (sideNotes ? 18 + Math.min(460, Math.max(280, pagesEl.clientWidth * 0.28)) : 0);
    const g0 = geo(0);
    fit = Math.max(0.3, avail / g0.BW);
  }
  const S = () => fit * zoom;
  function relayout() {
    computeFit();
    const s = S();
    boards.forEach((b, i) => {
      const g = geo(i);
      b.el.style.width = g.BW * s + 'px'; b.el.style.height = g.BH * s + 'px';
      Object.assign(b.slide.style, { left: g.G * s + 'px', top: g.M * s + 'px', width: g.W * s + 'px', height: g.H * s + 'px' });
      if (b.note) b.note.style.maxHeight = 'none';
      layoutTexts(i);
      if (b.rendered && Math.abs(b.rendered - s) > 0.01) b.stale = true;
    });
    // re-render visible stale pages
    const vr = pagesEl.getBoundingClientRect();
    boards.forEach((b, i) => { const r = b.el.getBoundingClientRect(); if (r.bottom > vr.top - 900 && r.top < vr.bottom + 900) renderPdf(i); });
    zoomLbl.textContent = Math.round(zoom * 100) + '%';
  }
  async function renderPdf(i) {
    const b = boards[i]; const s = S();
    if (b.rendered && !b.stale) return;
    if (renders.has(i)) { try { renders.get(i).cancel(); } catch { } }
    const pg = await doc.getPage(i + 1);
    if (closed) return;
    const dpr = window.devicePixelRatio || 1;
    const vp = pg.getViewport({ scale: s * dpr });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const task = pg.render({ canvasContext: c.getContext('2d'), viewport: vp });
    renders.set(i, task);
    try { await task.promise; } catch { return; }
    renders.delete(i);
    if (closed) return;
    b.slide.replaceChild(c, b.canvas); b.canvas = c;
    b.rendered = s; b.stale = false;
  }
  function setZoom(z) {
    const old = zoom;
    zoom = Math.min(3, Math.max(0.4, z));
    if (zoom === old) return;
    const ratio = zoom / old, top = pagesEl.scrollTop;
    st.zoom = zoom; persist();
    relayout();
    pagesEl.scrollTop = top * ratio;
  }
  const ro = new ResizeObserver(() => relayout());
  ro.observe(pagesEl);
  const onWheel = e => { if (e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); } };
  pagesEl.addEventListener('wheel', onWheel, { passive: false });

  // ---------- items rendering ----------
  function strokePath(pts, size, smooth, last = true) {
    const out = getStroke(pts, { size: size * 1.6, thinning: 0.35, smoothing: 0.6, streamline: smooth ? 0.55 : 0.25, simulatePressure: true, last });
    if (!out.length) return '';
    const d = out.reduce((acc, [x0, y0], i, arr) => { const [x1, y1] = arr[(i + 1) % arr.length]; acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2); return acc; }, ['M', ...out[0], 'Q']);
    d.push('Z');
    return d.map(v => typeof v === 'number' ? r1(v) : v).join(' ');
  }
  function polyline(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + r1(p[0]) + ' ' + r1(p[1])).join(' '); }
  function norm(it) { const x = Math.min(it.x, it.x + it.w), y = Math.min(it.y, it.y + it.h); return { x, y, w: Math.abs(it.w), h: Math.abs(it.h) }; }
  function starPts(b) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, out = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.42 : 1; out.push([cx + Math.cos(a) * b.w / 2 * r, cy + Math.sin(a) * b.h / 2 * r]); } return out; }
  function shapeEl(it) {
    const g = document.createElementNS(NS, 'g');
    const stroke = it.c, sw = it.w, fill = it.f ? it.c : 'none';
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.setAttribute('stroke', stroke); e.setAttribute('stroke-width', sw); e.setAttribute('stroke-linejoin', 'round'); e.setAttribute('stroke-linecap', 'round'); e.setAttribute('fill', fill); if (it.f) e.setAttribute('fill-opacity', '0.22'); g.append(e); return e; };
    const b = normG(it);
    const poly = pts => mk('polygon', { points: pts.map(p => r1(p[0]) + ',' + r1(p[1])).join(' ') });
    switch (it.kind) {
      case 'rect': mk('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6 }); break;
      case 'ellipse': mk('ellipse', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 }); break;
      case 'star': poly(starPts(b)); break;
      case 'triangle': poly([[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]); break;
      case 'diamond': poly([[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]]); break;
      case 'bubble': mk('path', { d: `M${b.x + 8} ${b.y} H${b.x + b.w - 8} Q${b.x + b.w} ${b.y} ${b.x + b.w} ${b.y + 8} V${b.y + b.h * 0.72 - 8} Q${b.x + b.w} ${b.y + b.h * 0.72} ${b.x + b.w - 8} ${b.y + b.h * 0.72} H${b.x + b.w * 0.32} L${b.x + b.w * 0.14} ${b.y + b.h} L${b.x + b.w * 0.18} ${b.y + b.h * 0.72} H${b.x + 8} Q${b.x} ${b.y + b.h * 0.72} ${b.x} ${b.y + b.h * 0.72 - 8} V${b.y + 8} Q${b.x} ${b.y} ${b.x + 8} ${b.y} Z` }); break;
      case 'line': mk('line', { x1: it.x, y1: it.y, x2: it.x + it.gw, y2: it.y + it.gh }).setAttribute('fill', 'none'); break;
      case 'arrow': {
        const x2 = it.x + it.gw, y2 = it.y + it.gh, a = Math.atan2(it.gh, it.gw), L = Math.max(10, sw * 4);
        mk('line', { x1: it.x, y1: it.y, x2, y2 }).setAttribute('fill', 'none');
        const hd = mk('path', { d: `M${r1(x2 - L * Math.cos(a - 0.45))} ${r1(y2 - L * Math.sin(a - 0.45))} L${r1(x2)} ${r1(y2)} L${r1(x2 - L * Math.cos(a + 0.45))} ${r1(y2 - L * Math.sin(a + 0.45))}` });
        hd.setAttribute('fill', 'none');
        break;
      }
    }
    return g;
  }
  function itemEl(it) {
    let e;
    if (it.t === 'pen') { e = document.createElementNS(NS, 'path'); e.setAttribute('d', strokePath(it.pts, it.w, it.sm !== false)); e.setAttribute('fill', it.c); }
    else if (it.t === 'hl') { e = document.createElementNS(NS, 'path'); e.setAttribute('d', polyline(it.pts)); e.setAttribute('fill', 'none'); e.setAttribute('stroke', it.c); e.setAttribute('stroke-width', it.w); e.setAttribute('stroke-linecap', it.pts.length === 2 ? 'butt' : 'round'); e.setAttribute('stroke-linejoin', 'round'); e.setAttribute('stroke-opacity', '0.5'); e.setAttribute('class', 'hl'); }
    else if (it.t === 'shape') e = shapeEl(it);
    if (e) e.dataset.id = it.id;
    return e;
  }
  function bbox(it) {
    if (it.t === 'pen' || it.t === 'hl') { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of it.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } const p = it.w / 2 + 2; return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p }; }
    if (it.t === 'shape') { const b = normG(it); const p = it.w + 2; return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p }; }
    return null;
  }
  function renderPage(i) {
    const b = boards[i]; const pd = pageData(i);
    const svg = b.svg;
    while (svg.firstChild) svg.firstChild.remove();
    for (const it of pd.items) if (it.t !== 'text') { const e = itemEl(it); if (e) svg.append(e); }
    if (selected && selected.i === i) {
      const it = pd.items.find(x => x.id === selected.id);
      const bb = it && bbox(it);
      if (bb) { const r = document.createElementNS(NS, 'rect'); r.setAttribute('class', 'selbox'); r.setAttribute('x', bb.x); r.setAttribute('y', bb.y); r.setAttribute('width', bb.w); r.setAttribute('height', bb.h); r.setAttribute('rx', 4); svg.append(r); }
    }
    renderTexts(i);
  }
  function renderTexts(i) {
    const b = boards[i]; const pd = pageData(i);
    const keep = editing && editing.i === i ? editing.item.id : null;
    for (const el of [...b.texts.children]) if (el.dataset.id !== keep) el.remove();
    for (const it of pd.items) {
      if (it.t !== 'text' || it.id === keep) continue;
      const el = h('div', { class: 'tbox' + (selected && selected.id === it.id ? ' sel' : ''), 'data-id': it.id, dir: 'auto' });
      el.innerHTML = it.html;
      bindText(i, el);
      b.texts.append(el);
    }
    layoutTexts(i);
  }
  // text that starts in the free margin wraps before the slide; text on the slide wraps at its edge
  function maxW(i, it) { const g = geo(i); return it.x < g.G - 20 ? Math.max(120, g.G - it.x - 10) : Math.max(120, g.G + g.W - it.x - 6); }
  function layoutTexts(i) {
    const b = boards[i]; const s = S(); const pd = pageData(i);
    for (const el of b.texts.children) {
      const it = pd.items.find(x => x.id === el.dataset.id); if (!it) continue;
      Object.assign(el.style, { left: it.x * s + 'px', top: it.y * s + 'px', fontSize: it.s * s + 'px', color: it.c, fontWeight: it.b ? '700' : '400', fontStyle: it.it ? 'italic' : 'normal', maxWidth: maxW(i, it) * s + 'px' });
    }
  }
  const selItem = () => { if (!selected) return null; return pageData(selected.i).items.find(x => x.id === selected.id) || null; };
  function setSelected(sel, redraw = true) {
    const prev = selected; selected = sel;
    if (redraw) { if (prev) renderPage(prev.i); if (sel && (!prev || prev.i !== sel.i)) renderPage(sel.i); }
    else if (prev) renderPage(prev.i);
    drawStrip();
  }

  // ---------- undo / save ----------
  function pushUndo(i) { undo.push({ i, items: JSON.stringify(pageData(i).items) }); if (undo.length > 150) undo.shift(); redo = []; }
  function swap(from, to) {
    const e = from.pop(); if (!e) return;
    if (editing) endEdit(true);
    to.push({ i: e.i, items: JSON.stringify(pageData(e.i).items) });
    pageData(e.i).items = JSON.parse(e.items);
    selected = null; renderPage(e.i); scheduleSave(); drawStrip();
    boards[e.i].el.scrollIntoView({ block: 'nearest' });
  }
  const doUndo = () => swap(undo, redo);
  const doRedo = () => swap(redo, undo);
  function scheduleSave() {
    saved.lastChild.textContent = 'جاري الحفظ…'; saved.firstChild.style.background = '#E8C46A';
    clearTimeout(saveT); saveT = setTimeout(flush, 700);
  }
  async function flush() {
    clearTimeout(saveT); saveT = null;
    if (editing) syncEditing();
    saving = true;
    await api.saveLecture(node.id, data);
    saving = false;
    saved.lastChild.textContent = 'محفوظ'; saved.firstChild.style.background = '#3FBF7F';
  }

  // ---------- text editing ----------
  function syncEditing() { if (!editing) return; editing.item.html = cleanHtml(editing.el.innerHTML); }
  function cleanHtml(s) { return String(s).replace(/<(?!\/?(div|br|b|i|span)\b)[^>]*>/gi, '').replace(/\s(on\w+|style|class)="[^"]*"/gi, ''); }
  function startEdit(i, item, el, keepUndo) {
    if (editing && editing.item.id !== item.id) endEdit();
    if (!keepUndo || !editing) editing = { i, item, el, before: JSON.stringify(pageData(i).items) };
    else editing.el = el;
    selected = { i, id: item.id };
    el.contentEditable = 'true'; el.classList.add('editing'); el.classList.remove('sel');
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    drawStrip();
  }
  function endEdit(silent) {
    if (!editing) return;
    const { i, item, el, before } = editing;
    editing = null;
    item.html = cleanHtml(el.innerHTML);
    el.contentEditable = 'false'; el.classList.remove('editing');
    const pd = pageData(i);
    if (!el.textContent.trim()) pd.items = pd.items.filter(x => x.id !== item.id);
    if (!silent && JSON.stringify(pd.items) !== before) { undo.push({ i, items: before }); redo = []; scheduleSave(); }
    if (selected && selected.id === item.id && !pd.items.includes(item)) selected = null;
    renderPage(i);
  }
  function bindText(i, el) {
    el.addEventListener('pointerdown', e => {
      const pd = pageData(i); const it = pd.items.find(x => x.id === el.dataset.id); if (!it) return;
      if (tool === 'text') { e.stopPropagation(); if (!(editing && editing.item.id === it.id)) { e.preventDefault(); startEdit(i, it, el); } }
      else if (tool === 'select') { e.stopPropagation(); e.preventDefault(); if (editing) endEdit(); setSelected({ i, id: it.id }); dragMove(i, it, e); }
    });
    el.addEventListener('dblclick', () => { const it = pageData(i).items.find(x => x.id === el.dataset.id); if (it) { setTool('text'); const fresh = boards[i].texts.querySelector(`[data-id="${it.id}"]`); startEdit(i, it, fresh || el); } });
    el.addEventListener('input', () => { if (editing && editing.el === el) { syncEditing(); scheduleSave(); } });
    el.addEventListener('blur', () => { if (editing && editing.el === el) setTimeout(() => { if (editing && editing.el === el && document.activeElement !== el) endEdit(); }, 0); });
    el.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); el.blur(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); setPref('text', 'bold', !editing?.item.b); } });
  }

  // ---------- pointer interaction ----------
  function bindBoard(i) {
    const b = boards[i];
    const el = b.el;
    const pt = e => { const r = el.getBoundingClientRect(); const s = S(); return [r1((e.clientX - r.left) / s), r1((e.clientY - r.top) / s)]; };
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.tbox')) return;
      closePop();
      const p = pt(e);
      if (tool === 'text') {
        e.preventDefault();
        if (editing) { endEdit(); }
        const t = prefs.text;
        const it = { t: 'text', id: uid(), x: p[0], y: r1(p[1] - t.size * 0.75), s: t.size, c: t.color, b: !!t.bold, it: !!t.italic, html: '' };
        pageData(i).items.push(it);
        const tb = h('div', { class: 'tbox', 'data-id': it.id, dir: 'auto' });
        bindText(i, tb); b.texts.append(tb); layoutTexts(i);
        editing = null;
        startEdit(i, it, tb);
        editing.before = JSON.stringify(pageData(i).items.filter(x => x.id !== it.id));
        return;
      }
      if (editing) endEdit();
      if (tool === 'pen' || tool === 'highlight') return drawStroke(i, e, p);
      if (tool === 'shapes') return drawShape(i, e, p);
      if (tool === 'eraser') return erase(i, e, p);
      if (tool === 'select') {
        const hit = hitTest(i, p);
        if (hit) { setSelected({ i, id: hit.id }); dragMove(i, hit, e); }
        else setSelected(null);
      }
    });
    el.addEventListener('contextmenu', e => { e.preventDefault(); });
  }
  function capture(e, move, up) {
    const tgt = e.currentTarget || e.target;
    try { tgt.setPointerCapture(e.pointerId); } catch { }
    const mv = ev => move(ev);
    const fin = ev => { tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', fin); tgt.removeEventListener('pointercancel', fin); up(ev); };
    tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', fin); tgt.addEventListener('pointercancel', fin);
  }
  function boardPt(i, ev) { const r = boards[i].el.getBoundingClientRect(); const s = S(); return [r1((ev.clientX - r.left) / s), r1((ev.clientY - r.top) / s)]; }

  function drawStroke(i, e, p0) {
    e.preventDefault();
    const hl = tool === 'highlight';
    const pr = hl ? prefs.highlight : prefs.pen;
    const pts = [p0];
    const tmp = document.createElementNS(NS, 'path');
    if (hl) { tmp.setAttribute('fill', 'none'); tmp.setAttribute('stroke', pr.color); tmp.setAttribute('stroke-width', pr.size); tmp.setAttribute('stroke-linecap', 'round'); tmp.setAttribute('stroke-linejoin', 'round'); tmp.setAttribute('stroke-opacity', '0.5'); tmp.setAttribute('class', 'hl'); }
    else tmp.setAttribute('fill', pr.color);
    boards[i].svg.append(tmp);
    let raf = 0;
    const paint = () => { raf = 0; tmp.setAttribute('d', hl ? polyline(pts) : strokePath(pts, pr.size, pr.smooth, false)); };
    capture(e, ev => {
      const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      for (const c of (evs.length ? evs : [ev])) { const q = boardPt(i, c); const l = pts[pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 0.6) pts.push(q); }
      if (!raf) raf = requestAnimationFrame(paint);
    }, () => {
      cancelAnimationFrame(raf); tmp.remove();
      let fin = pts;
      if (hl && pr.straight && pts.length > 1) {
        const a = pts[0], z = pts[pts.length - 1];
        const dx = z[0] - a[0], dy = z[1] - a[1];
        if (Math.abs(dy) < Math.abs(dx) * 0.35) { const y = r1(pts.reduce((s, q) => s + q[1], 0) / pts.length); fin = [[a[0], y], [z[0], y]]; }
        else fin = [a, z];
      }
      if (fin.length === 1) fin = [fin[0], [fin[0][0] + 0.1, fin[0][1] + 0.1]];
      pushUndo(i);
      pageData(i).items.push(hl ? { t: 'hl', id: uid(), pts: fin, c: pr.color, w: pr.size } : { t: 'pen', id: uid(), pts: fin, c: pr.color, w: pr.size, sm: !!pr.smooth });
      renderPage(i); scheduleSave();
    });
  }
  function drawShape(i, e, p0) {
    e.preventDefault();
    const pr = prefs.shapes;
    // shapes keep geometry in gw/gh; w is the stroke width
    const it = { t: 'shape', id: uid(), kind: pr.kind, x: p0[0], y: p0[1], c: pr.color, f: !!pr.fill };
    const sw = pr.size;
    let live = null, gw = 0, gh = 0;
    const paint = () => { if (live) live.remove(); live = shapeEl({ ...it, w: sw, gw, gh }); boards[i].svg.append(live); };
    capture(e, ev => {
      const q = boardPt(i, ev);
      gw = q[0] - p0[0]; gh = q[1] - p0[1];
      if (ev.shiftKey) {
        if (it.kind === 'line' || it.kind === 'arrow') { const a = Math.round(Math.atan2(gh, gw) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(gw, gh); gw = Math.cos(a) * L; gh = Math.sin(a) * L; }
        else { const m = Math.max(Math.abs(gw), Math.abs(gh)); gw = Math.sign(gw || 1) * m; gh = Math.sign(gh || 1) * m; }
      }
      paint();
    }, () => {
      if (live) live.remove();
      if (Math.abs(gw) < 4 && Math.abs(gh) < 4) { if (it.kind === 'line' || it.kind === 'arrow') { gw = 90; gh = 0; } else { gw = 80; gh = 80; } }
      pushUndo(i);
      pageData(i).items.push({ t: 'shape', id: it.id, kind: it.kind, x: r1(it.x), y: r1(it.y), gw: r1(gw), gh: r1(gh), c: it.c, w: sw, f: it.f });
      renderPage(i); scheduleSave();
    });
  }

  function dist2seg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  function hitItem(p, it, tol) {
    if (it.t === 'pen' || it.t === 'hl') { const r = it.w / 2 + tol; for (let k = 0; k < it.pts.length; k++) { const a = it.pts[k], b = it.pts[k + 1] || a; if (dist2seg(p, a, b) <= r) return true; } return false; }
    if (it.t === 'shape') {
      if (it.kind === 'line' || it.kind === 'arrow') return dist2seg(p, [it.x, it.y], [it.x + it.gw, it.y + it.gh]) <= it.w / 2 + tol;
      const b = normG(it); return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
    }
    if (it.t === 'text') {
      const el = boards[currentHitPage].texts.querySelector(`[data-id="${it.id}"]`); if (!el) return false;
      const s = S(); const w = el.offsetWidth / s, hh = el.offsetHeight / s;
      return p[0] >= it.x - tol && p[0] <= it.x + w + tol && p[1] >= it.y - tol && p[1] <= it.y + hh + tol;
    }
    return false;
  }
  let currentHitPage = 0;
  function hitTest(i, p, tol = 4) { currentHitPage = i; const items = pageData(i).items; for (let k = items.length - 1; k >= 0; k--) if (hitItem(p, items[k], tol / Math.max(.5, S()) * 1.2)) return items[k]; return null; }
  function normG(it) { return norm({ x: it.x, y: it.y, w: it.gw, h: it.gh }); }

  function erase(i, e, p0) {
    e.preventDefault();
    const part = prefs.eraser.mode === 'part';
    const R = 10;
    let changed = false;
    const ring = h('div', { class: 'eraser-ring' });
    if (part) { boards[i].el.append(ring); }
    const before = JSON.stringify(pageData(i).items);
    const at = p => {
      if (part) { const s = S(); Object.assign(ring.style, { left: p[0] * s + 'px', top: p[1] * s + 'px', width: R * 2 * s + 'px', height: R * 2 * s + 'px' }); }
      const pd = pageData(i);
      if (!part) {
        const hit = hitTest(i, p, 6);
        if (hit) { pd.items = pd.items.filter(x => x !== hit); changed = true; renderPage(i); }
        return;
      }
      let any = false;
      const out = [];
      for (const it of pd.items) {
        if (it.t !== 'pen' && it.t !== 'hl') { if (hitItem(p, it, R * 0.6) && it.t === 'shape') { any = true; continue; } out.push(it); continue; }
        if (it.t === 'hl' && it.pts.length === 2) {
          // straight highlight: densify so it can be split
          const [a, b] = it.pts; const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
          it.pts = Array.from({ length: n + 1 }, (_, k) => [r1(a[0] + (b[0] - a[0]) * k / n), r1(a[1] + (b[1] - a[1]) * k / n)]);
        }
        const segs = []; let cur = [];
        for (const q of it.pts) { if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= R + it.w / 2) { if (cur.length) segs.push(cur); cur = []; any = true; } else cur.push(q); }
        if (cur.length) segs.push(cur);
        if (segs.length === 1 && segs[0].length === it.pts.length) { out.push(it); continue; }
        for (const sgm of segs) if (sgm.length >= 2) out.push({ ...it, id: uid(), pts: sgm });
      }
      if (any) { pd.items = out; changed = true; renderPage(i); }
    };
    at(p0);
    capture(e, ev => at(boardPt(i, ev)), () => {
      ring.remove();
      if (changed) { undo.push({ i, items: before }); redo = []; scheduleSave(); }
    });
  }
  function dragMove(i, it, e) {
    const start = boardPt(i, e);
    let moved = false; let before = JSON.stringify(pageData(i).items);
    let last = start;
    const tgt = boards[i].el;
    try { tgt.setPointerCapture(e.pointerId); } catch { }
    const mv = ev => {
      const q = boardPt(i, ev); const dx = q[0] - last[0], dy = q[1] - last[1]; last = q;
      if (!moved && Math.hypot(q[0] - start[0], q[1] - start[1]) < 2) { last = start; return; }
      moved = true;
      if (it.pts) it.pts = it.pts.map(([x, y]) => [r1(x + dx), r1(y + dy)]);
      else { it.x = r1(it.x + dx); it.y = r1(it.y + dy); }
      if (it.t === 'text') layoutTexts(i); else renderPage(i);
    };
    const up = () => { tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up); if (moved) { undo.push({ i, items: before }); redo = []; scheduleSave(); renderPage(i); } };
    tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up);
  }

  // ---------- keyboard ----------
  const onKey = e => {
    const typing = e.target.closest && (e.target.closest('.tbox[contenteditable=true]') || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
    const mod = e.ctrlKey || e.metaKey;
    if (document.querySelector('.modal-bg')) return;
    if (mod && !typing && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    if (mod && !typing && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoom * 1.15); return; }
    if (mod && e.key === '-') { e.preventDefault(); setZoom(zoom / 1.15); return; }
    if (mod && e.key === '0') { e.preventDefault(); setZoom(1); return; }
    if (typing || mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      pushUndo(selected.i); const i = selected.i; pageData(i).items = pageData(i).items.filter(x => x.id !== selected.id); selected = null; renderPage(i); scheduleSave(); drawStrip(); return;
    }
    if (e.key === 'Escape') { setSelected(null); return; }
    const map = { v: 'select', p: 'pen', h: 'highlight', t: 'text', s: 'shapes', e: 'eraser' };
    const k = e.code && e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
    if (map[k]) { e.preventDefault(); setTool(map[k]); }
  };
  document.addEventListener('keydown', onKey);

  // ---------- go ----------
  drawToolbar(); drawStrip();
  relayout();
  for (let i = 0; i < sizes.length; i++) renderPage(i);
  if (ctx.startPage != null && boards[ctx.startPage]) setTimeout(() => boards[ctx.startPage].row.scrollIntoView({ block: 'start' }), 60);

  return {
    async close() {
      if (closed) return;
      if (editing) endEdit();
      if (saveT) await flush();
      closed = true;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDocDown, true);
      io.disconnect(); ro.disconnect();
      for (const t of renders.values()) { try { t.cancel(); } catch { } }
      try { await doc.destroy(); } catch { }
    },
    async reloadFromDisk() {
      if (editing || saveT || saving) return;
      data = await api.loadLecture(node.id); data.pages ||= {};
      selected = null; undo = []; redo = [];
      for (let i = 0; i < sizes.length; i++) { renderPage(i); const b = boards[i]; if (b.note) { b.note._ta.value = pageData(i).note || ''; b.note._grow(); } }
    }
  };
}
