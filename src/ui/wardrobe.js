// The style tray: a "Character" section (quick presets + hair / hair colour / skin / outfit) above the wardrobe
// (coat / hat / scarf). Options are read from STYLE_OPTIONS at runtime, so new keys appear automatically and missing
// ones are skipped. Locked wardrobe pieces show greyed with a lock and where they come from ("Door 5").
// Used by the entry screen and by the in-game wardrobe (createWardrobe → modal).
import { STYLE_OPTIONS, DEFAULT_STYLE } from '../core/player.js';
import { sharedPreview } from './preview.js';
import { ICONS } from './icons.js';
import { saveProfile, validStyle } from './profile.js';

const CHARACTER = ['hair', 'hairColor', 'skin', 'outfit'];
const WARDROBE = ['coat', 'hat', 'scarf'];
const LABEL = { coat: 'Coat', hat: 'Hat', scarf: 'Scarf', hair: 'Hair', hairColor: 'Hair colour', skin: 'Skin', outfit: 'Outfit' };
const SHORT = { bobble: 'Bobble', earflap: 'Ear-flap', earmuffs: 'Earmuffs', none: 'None', santa: 'Santa', reindeer: 'Reindeer', elf: 'Elf', conductor: 'Conductor', bow: 'Bow', gnome: 'Gnome' };
// small marks so swatches with (nearly) the same colour read differently: jingle = red + gold bell, holly = green + berry, snowy = cream + coal
const MARK = { jingle: 'gold', holly: 'berry', snowy: 'coal' };
const SWATCH = { striped: 'repeating-linear-gradient(45deg,#b8302d 0 7px,#f5f1ea 7px 14px)', candycane: 'repeating-linear-gradient(135deg,#b5332e 0 6px,#f5f1ea 6px 12px)' };
const PRESETS = [
  { id: 'boy', label: 'Boy', style: { hair: 'tousled', hairColor: 'brown', outfit: 'duffle', coat: 'mustard', hat: 'none' }, legacy: { coat: 'mustard', hat: 'earflap' } },
  { id: 'girl', label: 'Girl', style: { hair: 'bob', hairColor: 'dark', outfit: 'duffle', coat: 'red', hat: 'none' }, legacy: { coat: 'red', hat: 'none' } },
];
const DOLL = {
  boy: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 64c1-12 8-17 18-17s17 5 18 17z" fill="#d59f3c"/><path d="M26 47l6 7 6-7" fill="none" stroke="#a87526" stroke-width="2.5"/><circle cx="32" cy="31" r="15" fill="#f2d6bd"/><path d="M16 29c-1-11 7-17 16-17 10 0 18 6 16 17-3-4-6-6-9-6l-2-4-3 4-4-5-3 5-4-3-1 4c-3 0-5 2-6 5z" fill="#7a4a2c"/><circle cx="26.5" cy="32" r="1.8" fill="#2f2a29"/><circle cx="37.5" cy="32" r="1.8" fill="#2f2a29"/><circle cx="23" cy="36.5" r="2.6" fill="#e9938f" opacity=".7"/><circle cx="41" cy="36.5" r="2.6" fill="#e9938f" opacity=".7"/><path d="M29 38.5q3 2.4 6 0" fill="none" stroke="#2f2a29" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  girl: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 64c1-12 8-17 18-17s17 5 18 17z" fill="#b5332e"/><path d="M26 47l6 7 6-7" fill="none" stroke="#8b2523" stroke-width="2.5"/><path d="M15 33c-1-13 7-20 17-20s18 7 17 20l1 11h-9l-1-8H23l-1 8h-8z" fill="#3a2820"/><circle cx="32" cy="32" r="14" fill="#f2d6bd"/><path d="M18 30c1-9 7-13 14-13s13 4 14 13c-6-1-11-4-14-8-3 4-8 7-14 8z" fill="#3a2820"/><circle cx="26.5" cy="33" r="1.8" fill="#2f2a29"/><circle cx="37.5" cy="33" r="1.8" fill="#2f2a29"/><circle cx="23" cy="37.5" r="2.6" fill="#e9938f" opacity=".7"/><circle cx="41" cy="37.5" r="2.6" fill="#e9938f" opacity=".7"/><path d="M29 39.5q3 2.4 6 0" fill="none" stroke="#2f2a29" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};

const isCssColour = (v) => typeof v === 'string' && (/^#[0-9a-f]{3,8}$/i.test(v) || /gradient\(/.test(v) || /^(rgb|hsl)a?\(/.test(v));
const swatchCss = (key, v) => SWATCH[key] || (isCssColour(v) ? v : null);
const nice = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const shortLabel = (slot, key, v) => (slot === 'hat' && SHORT[key]) || (typeof v === 'string' && !isCssColour(v) ? v.replace(/\s+(hat|beanie|coat)$/i, '') : nice(key));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * createStyleTray(ctx, data, { style, primary: 'Enter Tinselby' | 'Done', back?: bool, onChange(style), onPrimary(), onBack() })
 * → { el, style, setStyle, render, show(), hide(), visible }
 */
export function createStyleTray(ctx, data, opts = {}) {
  const style = validStyle(opts.style || DEFAULT_STYLE, data);
  const el = document.createElement('div');
  el.className = 'knit-card tb-tray';
  const slots = Object.keys(STYLE_OPTIONS);
  const charSlots = CHARACTER.filter((s) => slots.includes(s));
  const wardSlots = [...WARDROBE.filter((s) => slots.includes(s)), ...slots.filter((s) => !CHARACTER.includes(s) && !WARDROBE.includes(s))];
  const hasOutfit = slots.includes('outfit');

  const row = (slot) => {
    const opts2 = STYLE_OPTIONS[slot];
    const keys = Object.keys(opts2);
    const swatchy = keys.filter((k) => swatchCss(k, opts2[k])).length > keys.length / 2;
    const label = slot === 'coat' && hasOutfit ? 'Colour' : LABEL[slot] || nice(slot);
    const items = keys.map((k) => {
      const v = opts2[k];
      if (swatchy) {
        const css = swatchCss(k, v) || '#ccc';
        return `<button type="button" class="tb-swatch" data-k="${slot}" data-v="${k}" aria-label="${esc(label)}: ${esc(nice(k))}" style="--c:${esc(css)}">${MARK[k] ? `<span class="tb-mark ${MARK[k]}"></span>` : ''}<span class="tb-lock" hidden></span></button>`;
      }
      return `<button type="button" class="tb-chipbtn" data-k="${slot}" data-v="${k}"><span class="tb-chiptxt">${esc(shortLabel(slot, k, v))}</span><span class="tb-lock" hidden></span></button>`;
    }).join('');
    return `<div class="tb-row" data-slot="${slot}"><span class="tb-rowlab">${esc(label)}</span><div class="tb-opts">${items}</div></div>`;
  };
  const presets = charSlots.length || slots.includes('coat')
    ? `<div class="tb-presets">${PRESETS.map((p) => `<button type="button" class="tb-preset" data-p="${p.id}">${DOLL[p.id]}<span>${p.label}</span></button>`).join('')}</div>` : '';

  el.innerHTML = `
    <div class="tb-preview"></div>
    <div class="tb-choices">
      <div class="tb-scroll">
        <section class="tb-sec"><h3 class="tb-sechead">Character</h3>${presets}${charSlots.map(row).join('')}</section>
        <section class="tb-sec"><h3 class="tb-sechead">Wardrobe</h3>${wardSlots.map(row).join('')}</section>
      </div>
      <div class="tb-hint" aria-live="polite"></div>
      <div class="tb-row-end">
        ${opts.back ? `<button type="button" class="knit-btn cream tb-back" aria-label="Back">${ICONS.back}</button>` : ''}
        <button type="button" class="knit-btn cream tb-random" aria-label="Randomise">${ICONS.dice}<span>Randomise</span></button>
        <button type="button" class="knit-btn green tb-primary">${esc(opts.primary || 'Done')}</button>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const hint = $('.tb-hint');
  let hintT = 0;
  let preview = null; // the shared preview renderer is created the first time a tray is shown
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };

  function presetStyle(p) {
    const src = charSlots.includes('hair') ? p.style : p.legacy;
    const out = {};
    for (const [k, v] of Object.entries(src)) if (STYLE_OPTIONS[k] && v in STYLE_OPTIONS[k] && data.isUnlocked(k, v)) out[k] = v;
    return out;
  }
  function render() {
    el.querySelectorAll('[data-k]').forEach((b) => {
      const slot = b.dataset.k, key = b.dataset.v;
      const info = data.lockInfo(slot, key);
      b.classList.toggle('on', style[slot] === key);
      b.classList.toggle('locked', !!info);
      b.setAttribute('aria-pressed', String(style[slot] === key));
      const lk = b.querySelector('.tb-lock');
      if (info) { lk.hidden = false; lk.innerHTML = `${ICONS.lock}<span>${info.door ? `Door ${info.door}` : 'Gift'}</span>`; b.setAttribute('aria-disabled', 'true'); }
      else { lk.hidden = true; lk.innerHTML = ''; b.removeAttribute('aria-disabled'); }
    });
    el.querySelectorAll('.tb-preset').forEach((b) => {
      const p = PRESETS.find((x) => x.id === b.dataset.p);
      const ps = presetStyle(p);
      const on = Object.keys(ps).length > 0 && Object.entries(ps).every(([k, v]) => style[k] === v);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (visible) preview?.setStyle({ ...style });
  }
  function say(text) {
    hint.textContent = text;
    hint.classList.remove('show'); void hint.offsetWidth; hint.classList.add('show');
    clearTimeout(hintT);
    hintT = setTimeout(() => hint.classList.remove('show'), 3200);
  }
  function changed() { render(); opts.onChange?.({ ...style }); }

  el.addEventListener('click', (e) => {
    const pb = e.target.closest('.tb-preset');
    if (pb) { Object.assign(style, presetStyle(PRESETS.find((x) => x.id === pb.dataset.p))); sfx('pop'); changed(); return; }
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const slot = b.dataset.k, key = b.dataset.v;
    const info = data.lockInfo(slot, key);
    if (info) {
      b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
      const what = data.rewardLabel(slot, key);
      say(info.door ? `The ${what} unlocks at Door ${info.door}: ${data.door(info.door)?.title || ''}` : `The ${what} comes in a daily gift box.`);
      sfx('ui');
      return;
    }
    style[slot] = key;
    sfx('ui');
    changed();
  });
  $('.tb-random').addEventListener('click', () => {
    for (const slot of slots) {
      const ks = data.unlocked(slot);
      if (ks.length) style[slot] = ks[Math.floor(Math.random() * ks.length)];
    }
    sfx('pop');
    changed();
  });
  $('.tb-primary').addEventListener('click', () => { sfx('ui'); opts.onPrimary?.({ ...style }); });
  $('.tb-back')?.addEventListener('click', () => { sfx('ui'); opts.onBack?.(); });

  let visible = false, offUpdate = null;
  const api = {
    el, style,
    setStyle(s) { Object.assign(style, validStyle({ ...style, ...s }, data)); render(); },
    render,
    setPrimary(text) { $('.tb-primary').textContent = text; },
    get visible() { return visible; },
    show() {
      visible = true;
      el.hidden = false;
      preview = preview || sharedPreview(ctx);
      preview?.mount($('.tb-preview'));
      render();
      if (!offUpdate) offUpdate = ctx.engine.addUpdate((dt) => { if (visible) preview?.render(dt); }, 200);
    },
    hide() { visible = false; el.hidden = true; offUpdate?.(); offUpdate = null; },
  };
  render();
  return api;
}

/** In-game wardrobe: the same tray in a modal; changes apply live to the player and the net layer. */
export function createWardrobe(ctx, data) {
  const { game, player } = ctx;
  const wrap = document.createElement('div');
  wrap.className = 'tb-modal tb-wardrobe interactive';
  wrap.hidden = true;
  ctx.uiRoot.appendChild(wrap);
  let netT = 0, isOpen = false, restore = null;
  const apply = (style) => {
    if (!isOpen) return;
    try { player.setStyle(style); } catch (e) { console.error('[ui] setStyle', e); }
    saveProfile({ style });
    clearTimeout(netT);
    netT = setTimeout(() => { try { ctx.net?.setStyle?.({ ...game.state.style }); } catch (e) { /* offline */ } }, 350);
  };
  const tray = createStyleTray(ctx, data, { style: game.state.style, primary: 'Done', onChange: apply, onPrimary: () => api.close() });
  tray.hide();
  const title = document.createElement('div');
  title.className = 'tb-modal-title';
  title.innerHTML = `${ICONS.jumper}<span>Wardrobe</span>`;
  const close = document.createElement('button');
  close.className = 'knit-btn cream round tb-modal-close';
  close.setAttribute('aria-label', 'Close wardrobe');
  close.innerHTML = ICONS.close;
  close.addEventListener('click', (e) => { e.stopPropagation(); api.close(); });
  tray.el.prepend(title);
  tray.el.appendChild(close);
  wrap.appendChild(tray.el);
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  wrap.addEventListener('click', (e) => { if (e.target === wrap) api.close(); });
  game.on('ui:escape', () => { if (isOpen) api.close(); });

  const api = {
    el: wrap, tray,
    get isOpen() { return isOpen; },
    open() {
      if (isOpen || game.state.phase !== 'play') return;
      isOpen = true;
      tray.setStyle(game.state.style);
      wrap.hidden = false;
      tray.show();
      // in game the wardrobe pieces (door rewards) are what changes: on short screens open scrolled to them
      requestAnimationFrame(() => { try {
        const sc = wrap.querySelector('.tb-scroll'), secs = wrap.querySelectorAll('.tb-sec');
        if (sc && secs[1] && sc.scrollHeight > sc.clientHeight + 8) sc.scrollTop = secs[1].offsetTop - sc.offsetTop - 6;
      } catch (e) { /* */ } });
      restore = true;
      player.controllable = false;
      ctx.input.enabled = false;
      ctx.input.clearTap?.();
      ctx.input.setJoystick?.(0, 0);
      game.emit('wardrobe:open', {});
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      tray.hide();
      wrap.hidden = true;
      if (restore && game.state.phase === 'play' && !ctx.cam.shotActive) { player.controllable = true; ctx.input.enabled = true; }
      restore = null;
      game.emit('wardrobe:close', {});
    },
  };
  return api;
}
