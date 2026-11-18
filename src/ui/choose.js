// ui.choose({ title, text, options: [{ id | value, label, icon }] }) → Promise<id | null>
// A small knitted card with one big button per option plus a close button. Touch, mouse and keyboard
// (arrows / Tab move, Enter / Space pick, 1–9 pick, Esc / backdrop tap cancel → null).
import { ICONS } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createChoose(ctx, root) {
  let cur = null; // { el, finish }
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };

  function choose(spec = {}) {
    if (cur) cur.finish(null); // one card at a time
    const options = (spec.options || []).filter((o) => o && (o.label != null));
    if (!options.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'tb-choose interactive';
      wrap.innerHTML = `
        <div class="tb-choose-card knit-card" role="dialog" aria-modal="true" aria-label="${esc(spec.title || 'Choose')}">
          <button type="button" class="knit-btn cream round tb-choose-x" aria-label="Close">${ICONS.close}</button>
          ${spec.title ? `<div class="tb-choose-title">${esc(spec.title)}</div>` : ''}
          ${spec.text ? `<div class="tb-choose-text">${esc(spec.text)}</div>` : ''}
          <div class="tb-choose-opts">${options.map((o, i) => `
            <button type="button" class="knit-btn ${i % 2 ? 'cream' : 'green'} tb-choose-opt" data-i="${i}">
              <span class="tb-choose-ico">${ICONS[o.icon] || ICONS.star}</span><span class="tb-choose-lab">${esc(o.label)}</span>
            </button>`).join('')}
          </div>
        </div>`;
      root.appendChild(wrap);
      const btns = [...wrap.querySelectorAll('.tb-choose-opt')];
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onKey, true);
        if (cur && cur.el === wrap) cur = null;
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 260);
        resolve(val);
      };
      const pick = (i) => { const o = options[i]; if (!o) return; sfx('ui'); finish(o.id !== undefined ? o.id : o.value !== undefined ? o.value : o.label); };
      const cancel = () => { sfx('ui'); finish(null); };
      btns.forEach((b, i) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(i); }));
      wrap.querySelector('.tb-choose-x').addEventListener('click', (e) => { e.stopPropagation(); cancel(); });
      wrap.addEventListener('pointerdown', (e) => e.stopPropagation()); // never walks the player / skips shots underneath
      wrap.addEventListener('click', (e) => { if (e.target === wrap) cancel(); });
      function onKey(e) {
        const k = e.key;
        const idx = btns.indexOf(document.activeElement);
        let handled = true;
        if (k === 'Escape') cancel();
        else if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'd' || k === 's') btns[(idx + 1 + btns.length) % btns.length].focus();
        else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'a' || k === 'w') btns[(idx <= 0 ? btns.length : idx) - 1].focus();
        else if (k === 'Enter' || k === ' ') { if (idx >= 0) pick(idx); else pick(0); }
        else if (/^[1-9]$/.test(k) && +k <= options.length) pick(+k - 1);
        else if (k === 'Tab') { btns[(idx + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus(); }
        else handled = false;
        // the game must not also walk / interact / mute while the card is up
        if (handled || !['Shift', 'Control', 'Alt', 'Meta'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }
      window.addEventListener('keydown', onKey, true);
      cur = { el: wrap, finish };
      requestAnimationFrame(() => { wrap.classList.add('in'); btns[0]?.focus({ preventScroll: true }); });
    });
  }
  return { choose, get isOpen() { return !!cur; } };
}
