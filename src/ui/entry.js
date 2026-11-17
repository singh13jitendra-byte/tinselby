// Entry screen: knitted title, name input, Enter button and the "Change style" tray with a live 3D preview.
import { STYLE_OPTIONS, DEFAULT_STYLE } from '../core/player.js';
import { createPreview } from './preview.js';
import { ICONS } from './icons.js';

const KEY = 'tinselby.profile';
const HAT_SHORT = { bobble: 'Bobble', earflap: 'Ear-flap', earmuffs: 'Earmuffs', none: 'None' };
const SWATCH = { striped: 'repeating-linear-gradient(45deg,#b8302d 0 7px,#f5f1ea 7px 14px)' };

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return v; } catch (e) { /* private mode */ }
  return {};
}
function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createEntry(ctx, root) {
  const { game, engine } = ctx;
  const saved = load();
  const style = { ...DEFAULT_STYLE };
  if (saved.style) for (const k of Object.keys(STYLE_OPTIONS)) if (saved.style[k] in STYLE_OPTIONS[k]) style[k] = saved.style[k];

  const el = document.createElement('div');
  el.className = 'tb-entry';
  const NB = 17;
  const bulbs = Array.from({ length: NB }, (_, i) => `<i style="--i:${i};--y:${(Math.sin((i / (NB - 1)) * Math.PI) * 14).toFixed(1)}px"></i>`).join('');
  const letters = [...'Tinselby'].map((c, i) => `<b class="${i % 2 ? 'cr' : 'rd'}" style="--r:${((i * 37) % 7 - 3) * 1.2}deg">${c}</b>`).join('');
  const swatches = (k) => Object.entries(STYLE_OPTIONS[k]).map(([id, c]) => `<button class="tb-swatch" data-k="${k}" data-v="${id}" aria-label="${k} ${id}" style="--c:${SWATCH[id] || c}"></button>`).join('');
  const chips = Object.keys(STYLE_OPTIONS.hat).map((id) => `<button class="tb-chipbtn" data-k="hat" data-v="${id}">${HAT_SHORT[id] || id}</button>`).join('');
  el.innerHTML = `
    <div class="tb-entry-head fade-in">
      <div class="tb-garland" aria-hidden="true">${bulbs}</div>
      <h1 class="tb-title" aria-label="Welcome to Tinselby"><span class="tb-welcome">Welcome to</span><span class="tb-word">${letters}</span></h1>
      <div class="knit-sub">A cosy knitted Christmas town</div>
    </div>
    <div class="tb-entry-body">
      <form class="knit-card tb-entry-card fade-in" autocomplete="off">
        <label class="tb-label" for="tb-name">What should Tinselby call you?</label>
        <input id="tb-name" class="tb-input" type="text" maxlength="18" placeholder="Your name" enterkeyhint="go" spellcheck="false" value="${esc((saved.name || '').slice(0, 18))}" />
        <button type="submit" class="knit-btn tb-enter">Enter Tinselby</button>
        <button type="button" class="knit-btn cream tb-style-toggle" aria-expanded="false">Change style</button>
      </form>
      <div class="knit-card tb-tray fade-in" hidden>
        <div class="tb-preview"><canvas></canvas></div>
        <div class="tb-choices">
          <div class="tb-row"><span class="tb-rowlab">Coat</span><div class="tb-opts">${swatches('coat')}</div></div>
          <div class="tb-row"><span class="tb-rowlab">Hat</span><div class="tb-opts">${chips}</div></div>
          <div class="tb-row"><span class="tb-rowlab">Scarf</span><div class="tb-opts">${swatches('scarf')}</div></div>
          <div class="tb-row tb-row-end"><button type="button" class="knit-btn cream tb-random">${ICONS.dice}<span>Randomise</span></button><button type="button" class="knit-btn green tb-done">Done</button></div>
        </div>
      </div>
    </div>`;
  root.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const form = $('.tb-entry-card');
  const input = $('#tb-name');
  const tray = $('.tb-tray');
  const toggle = $('.tb-style-toggle');
  let preview = null;

  function refresh() {
    el.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', style[b.dataset.k] === b.dataset.v));
    preview?.setStyle(style);
  }
  function openTray(open) {
    tray.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide style' : 'Change style';
    el.classList.toggle('tray-open', open);
    if (open && !preview) { preview = createPreview(ctx, $('.tb-preview canvas')); refresh(); }
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b) { style[b.dataset.k] = b.dataset.v; refresh(); try { ctx.audio?.sfx?.('ui'); } catch (er) { /* */ } }
  });
  toggle.addEventListener('click', () => openTray(tray.hidden));
  $('.tb-done').addEventListener('click', () => openTray(false));
  $('.tb-random').addEventListener('click', () => {
    for (const k of Object.keys(STYLE_OPTIONS)) {
      const ks = Object.keys(STYLE_OPTIONS[k]);
      style[k] = ks[Math.floor(Math.random() * ks.length)];
    }
    refresh();
    try { ctx.audio?.sfx?.('pop'); } catch (er) { /* */ }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim().slice(0, 18) || 'Traveller';
    save({ name, style });
    input.blur();
    game.emit('game:start', { name, style: { ...style } });
  });
  game.on('ui:escape', () => { if (!tray.hidden) openTray(false); });
  refresh();

  const offUpdate = engine.addUpdate((dt) => { if (preview && !tray.hidden) preview.render(dt); }, 200);
  let gone = false;
  function hide() {
    if (gone) return;
    gone = true;
    offUpdate();
    const done = () => { el.remove(); preview?.dispose(); preview = null; };
    if (engine.capture) { done(); return; } // headless capture: no fade
    el.classList.add('tb-leaving');
    setTimeout(done, 600);
  }
  return { el, hide, openTray, style };
}
