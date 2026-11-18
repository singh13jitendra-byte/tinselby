// Decorate panel: knitted DOM sheet in ctx.uiRoot. Landscape = right-side panel (<= 42% width); portrait = bottom sheet.
// Chips preview live (onChange); Done saves, the X cancels. Returns { el, close() }.
import './house.css';

const ROWS = [['wreath', 'Wreath'], ['lights', 'Window lights'], ['door', 'Door'], ['snowman', 'Snowman']];
const X_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" fill="none"/></svg>';

export function createPanel({ root, OPTIONS, style, first, onChange, onDone, onCancel, sfx }) {
  const draft = { ...style };
  const el = document.createElement('div');
  el.className = 'tbh-panel knit-card';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Decorate your cottage');
  const rowEls = {};
  el.innerHTML = `<div class="tbh-head"><h2 class="tbh-title">${first ? 'Make it cosy!' : 'Decorate your cottage'}</h2>
    <button type="button" class="tbh-x" aria-label="Close">${X_ICON}</button></div>
    <div class="tbh-scroll"></div>
    <button type="button" class="knit-btn green tbh-done">Done</button>`;
  const scroll = el.querySelector('.tbh-scroll');
  for (const [id, name] of ROWS) {
    const opts = OPTIONS[id] || [];
    const row = document.createElement('div');
    row.className = 'tbh-row';
    const lab = document.createElement('div');
    lab.className = 'tbh-rowlab';
    const chips = document.createElement('div');
    chips.className = 'tbh-chips tbh-n' + opts.length;
    for (const o of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbh-chip' + (id === 'door' ? ' tbh-dot' : '');
      b.dataset.row = id; b.dataset.key = o.key; b.title = o.label; b.setAttribute('aria-label', `${name}: ${o.label}`);
      b.innerHTML = `<i style="background:${o.swatch}"></i>${id === 'door' ? '' : `<span>${o.label}</span>`}`;
      chips.appendChild(b);
    }
    row.append(lab, chips);
    scroll.appendChild(row);
    rowEls[id] = { lab, chips, name, opts };
  }
  const sync = () => {
    for (const id in rowEls) {
      const r = rowEls[id], cur = r.opts.find((o) => o.key === draft[id]);
      r.lab.innerHTML = `${r.name}<b>${cur ? cur.label : ''}</b>`;
      for (const b of r.chips.children) { const on = b.dataset.key === draft[id]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    }
  };
  sync();
  let closed = false;
  const finish = (fn) => { if (closed) return; closed = true; el.classList.add('tbh-out'); setTimeout(() => el.remove(), 320); fn(); };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || closed) return;
    if (b.classList.contains('tbh-done')) { sfx?.('bell'); finish(() => onDone({ ...draft })); return; }
    if (b.classList.contains('tbh-x')) { sfx?.('ui'); finish(() => onCancel()); return; }
    if (b.dataset.row) { draft[b.dataset.row] = b.dataset.key; sync(); sfx?.('pop'); onChange({ ...draft }); }
  });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(() => onCancel()); }
    else if (e.key === 'Enter') { e.preventDefault(); finish(() => onDone({ ...draft })); }
  };
  window.addEventListener('keydown', onKey, true);
  root.appendChild(el);
  return {
    el, draft,
    close() { window.removeEventListener('keydown', onKey, true); if (!closed) { closed = true; el.remove(); } else setTimeout(() => el.remove(), 320); },
  };
}
