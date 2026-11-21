// Small UI helpers: elements, icons, menus, dialogs, toasts
const P = {
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5z"/><path d="M8 7h7"/><path d="M8 11h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  chev: '<path d="m15 18-6-6 6-6"/>',
  back: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  select: '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
  pen: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  hl: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  shapes: '<rect x="3" y="3" width="9" height="9" rx="1"/><circle cx="16.5" cy="16.5" r="4.5"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  zin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>',
  zout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  focus: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  quiz: '<path d="M9 11l2 2 4-4"/><rect x="4" y="3" width="16" height="18" rx="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  listi: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  rect: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  ellipse: '<circle cx="12" cy="12" r="8.5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  triangle: '<path d="M12 4 21 20H3z"/>',
  arrow: '<path d="M4 20 20 4"/><path d="M10 4h10v10"/>',
  line: '<path d="M4 20 20 4"/>',
  diamond: '<path d="M12 3 21 12 12 21 3 12z"/>',
  bubble: '<path d="M4 5h16v11H9l-5 4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'
};
export function icon(name, size = 18) {
  return `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const layer = () => document.getElementById('layer');
let openMenuEl = null;
export function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
document.addEventListener('pointerdown', e => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('blur', closeMenu);

// items: {label, sub, icon, iconHtml, onClick, danger, big} | 'sep' | {title} | {el}
export function menu(x, y, items) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { m.append(h('div', { class: 'sep' })); continue; }
    if (it.title) { m.append(h('div', { class: 'mt' }, it.title)); continue; }
    if (it.el) { m.append(it.el); continue; }
    const b = h('button', { class: 'mi' + (it.danger ? ' danger' : '') + (it.sub ? ' big' : ''), role: 'menuitem', type: 'button' });
    b.innerHTML = (it.iconHtml || (it.icon ? icon(it.icon) : '')) + `<span><span>${esc(it.label)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</span>`;
    b.onclick = () => { closeMenu(); it.onClick && it.onClick(); };
    m.append(b);
  }
  layer().append(m);
  const r = m.getBoundingClientRect();
  let left = x - r.width, top = y;
  if (left < 8) left = Math.min(x, innerWidth - r.width - 8);
  if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  openMenuEl = m;
  const first = m.querySelector('.mi'); first && first.focus({ preventScroll: true });
  return m;
}

export function modal(build) {
  return new Promise(resolve => {
    const bg = h('div', { class: 'modal-bg' });
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
    bg.append(box);
    const close = v => { bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    bg.addEventListener('pointerdown', e => { if (e.target === bg) close(null); });
    build(box, close);
    layer().append(bg);
    const f = box.querySelector('input,textarea,select,button.primary'); if (f) f.focus();
  });
}

export function prompt(title, value = '', placeholder = '') {
  return modal((box, close) => {
    const inp = h('input', { class: 'field', value, placeholder, dir: 'auto' });
    const ok = h('button', { class: 'btn primary', type: 'button' }, 'حفظ');
    ok.onclick = () => close(inp.value.trim() || null);
    inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    box.append(h('h3', {}, title), inp, h('div', { class: 'acts' }, ok, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء')));
    setTimeout(() => inp.select(), 40);
  });
}

export function confirmBox(title, text, okLabel = 'حذف') {
  return modal((box, close) => {
    box.append(h('h3', {}, title), h('div', { style: { color: 'var(--muted)' } }, text),
      h('div', { class: 'acts' }, h('button', { class: 'btn primary', type: 'button', style: { background: 'var(--danger)', color: '#fff' }, onclick: () => close(true) }, okLabel),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(false) }, 'إلغاء')));
  });
}

export function toast(text, ms = 2600) {
  const t = h('div', { class: 'toast' }, text);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

export const SUBJECT_COLORS = ['#F08A4B', '#4FB6A0', '#B07CE8', '#5B9BF0', '#E5484D', '#E8C46A', '#3FBF7F', '#F7A8C4', '#9AA3AD'];
export const TAG_COLORS = ['#F29A4A', '#A97CF0', '#4FB6A0', '#5B9BF0', '#E5484D', '#E8C46A', '#F7A8C4'];
export function swatches(colors, value, onPick) {
  const wrap = h('div', { class: 'swatches' });
  const draw = v => {
    wrap.innerHTML = '';
    for (const c of colors) wrap.append(h('button', { type: 'button', class: 'sw' + (c === v ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => { onPick(c); draw(c); } }));
  };
  draw(value);
  return wrap;
}
export function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1B1B1B' : '#FFFFFF';
}
