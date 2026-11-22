// "Send a Christmas card": the player makes a card picture of their own doll in town and shares it with a link that
// invites the friend into Tinselby (WhatsApp first). Kids play: ready-made greetings only, no free text anywhere.
//
//   ctx.cards = createCards(ctx)
//   cards.open(where = 'friends' | 'photo', { photo? }) → bool   (photo = a canvas from photo mode: becomes the scene)
//   cards.close(), cards.isOpen, cards.state → {scene, greeting, frame, where}
//   cards.set(key, id)          key = 'scene' | 'greeting' | 'frame'
//   cards.ready() → Promise     resolves when the preview + JPEG for the current choices are done
//   cards.file / cards.canvas   the finished JPEG (File/Blob, 1080 × 1350) and the card canvas
//   cards.link() / cards.text() the share link (src/cards/link.js cardLink) and the share text
// Opened from the Friends/invite card ("Send a Christmas card") and photo mode ("Make a card"); free play only.
// Events: card:open {where}, card:created {scene, greeting, frame} (first Send/WhatsApp/Copy/Save of a design),
// card:shared {method: share|whatsapp|copy|save}. Nothing runs per frame while the maker is closed.
import './cards.css';
import { cleanName } from '../core/names.js';
import { SCENES, GREETINGS, FRAMES, cardLink, greetingText } from './link.js';
import { drawCard, PHOTO, FRAME_STYLES, CARD_W, CARD_H } from './render.js';
import { createSceneShooter } from './scenes.js';

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const CARD_ICONS = {
  card: svg('<rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="currentColor" fill-opacity=".15"/><path d="M3.8 7l8.2 6 8.2-6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  send: svg('<path d="M4 12l16-7-6 16-3-6.5z" fill="currentColor" fill-opacity=".18"/><path d="M11 14.5L20 5"/>'),
  save: svg('<path d="M12 3.5v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 16.5v3h16v-3"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>'),
  chat: svg('<path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z" fill="currentColor" fill-opacity=".15"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>'),
  lock: svg('<rect x="5.5" y="11" width="13" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>'),
  tree: svg('<path d="M12 3l5 7h-3l4 6H6l4-6H7z" fill="currentColor" fill-opacity=".18"/><path d="M12 16v4"/>'),
  wheel: svg('<circle cx="12" cy="10" r="6.5"/><path d="M12 3.5v13M5.5 10h13M7.4 5.4l9.2 9.2M16.6 5.4l-9.2 9.2"/><path d="M8.5 21l3.5-5 3.5 5"/>'),
  park: svg('<circle cx="8" cy="9" r="4" fill="currentColor" fill-opacity=".18"/><path d="M8 13v7"/><path d="M14 20l2.5-9 2.5 9z" fill="currentColor" fill-opacity=".18"/><path d="M3 20.5h18"/>'),
  photo: svg('<rect x="2.8" y="7" width="18.4" height="13" rx="3.2" fill="currentColor" fill-opacity=".18"/><path d="M8.2 7l1.4-2.4h4.8L15.8 7"/><circle cx="12" cy="13.4" r="3.5"/>'),
};
const LAND = ['tree', 'wheel', 'park']; // landmark scenes (+ 'photo' when it came from photo mode)
const PLACE = { market: 'Market Square', lakeside: 'Frostmere Lake', park: 'Pinecone Park' };
const FILE_NAME = 'tinselby-christmas-card.jpg';
// chip labels (the card itself shows the full greeting); chips are ordered to pack into two rows on a phone
const GREET_CHIPS = [['g1', 'Merry Christmas!'], ['g5', 'Ho ho ho!'], ['g4', 'Warm wishes!'], ['g3', 'Season’s greetings!'], ['g2', 'Happy holidays!']];
const FRAME_CHIPS = { f1: 'Red', f2: 'Green', f3: 'Holly' };

export function createCards(ctx) {
  const { game, player, input, cam, engine, uiRoot } = ctx;
  const shooter = createSceneShooter(ctx);
  const S = { open: false, where: 'friends', scene: 'tree', greeting: 'g1', frame: 'f1' };
  let saved = null, photo = null, shots = new Map(), file = null, ver = 0, busy = null, offUpdate = null;
  const createdKeys = new Set();
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* audio optional */ } };
  const toast = (t, ms = 2400) => { try { ctx.ui?.toast?.(t, ms); } catch (e) { /* */ } };

  // ---------------------------------------------------------------- DOM
  const chip = (g, id, inner, extra = '') => `<button class="tbc-chip" data-g="${g}" data-id="${id}" ${extra}>${inner}</button>`;
  const el = document.createElement('div');
  // a full modal: the backdrop (interactive, so it catches taps) covers the whole screen, HUD included; title + ✕ sit inside the panel
  el.className = 'tb-modal tbc-layer interactive';
  el.hidden = true;
  el.innerHTML = `
    <div class="tbc-panel knit-card interactive" role="dialog" aria-modal="true" aria-label="Send a Christmas card">
      <div class="tbc-head">
        <div class="tb-modal-title tbc-title"><span class="tbc-tico">${CARD_ICONS.card}</span>Christmas card</div>
        <button class="knit-btn cream round tb-modal-close tbc-x" aria-label="Close">${CARD_ICONS.close}</button>
      </div>
      <div class="tbc-body">
        <div class="tbc-preview">
          <canvas class="tbc-canvas" width="${CARD_W}" height="${CARD_H}" aria-label="Your Christmas card"></canvas>
          <div class="tbc-busy" hidden><span>Knitting your card…</span></div>
        </div>
        <div class="tbc-side">
          <div class="tbc-scroll">
            <div class="tbc-lab">Scene</div>
            <div class="tbc-row tbc-scenes">${SCENES.map((s) => chip('scene', s.id, `<i class="tbc-ci">${CARD_ICONS[s.id]}</i><span>${s.label}</span><i class="tbc-lock">${CARD_ICONS.lock}</i>`)).join('')}</div>
            <div class="tbc-msg" role="status"></div>
            <div class="tbc-lab">Greeting</div>
            <div class="tbc-row tbc-greets">${GREET_CHIPS.map(([id, label]) => chip('greeting', id, label, `aria-label="${greetingText(id)}"`)).join('')}</div>
            <div class="tbc-lab">Frame</div>
            <div class="tbc-row tbc-frames">${FRAMES.map((f) => chip('frame', f.id, `<i class="tbc-sw tbc-sw-${f.id}" style="background:${FRAME_STYLES[f.id].swatch}"></i><span>${FRAME_CHIPS[f.id]}</span>`, `aria-label="${f.label} frame"`)).join('')}</div>
          </div>
          <div class="tbc-actions">
            <button class="knit-btn green tbc-send">${CARD_ICONS.send}<span>Send</span></button>
            <button class="knit-btn green tbc-wa" hidden>${CARD_ICONS.chat}<span>WhatsApp</span></button>
            <button class="knit-btn cream tbc-copy" hidden>${CARD_ICONS.link}<span>Copy link</span></button>
            <button class="knit-btn cream tbc-save" aria-label="Save picture">${CARD_ICONS.save}<span>Save<span class="tbc-long"> picture</span></span></button>
          </div>
        </div>
      </div>
    </div>`;
  uiRoot.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const panel = $('.tbc-panel'), canvas = $('.tbc-canvas'), busyEl = $('.tbc-busy'), msgEl = $('.tbc-msg');
  const sendBtn = $('.tbc-send'), waBtn = $('.tbc-wa'), copyBtn = $('.tbc-copy'), saveBtn = $('.tbc-save');
  const stop = (e) => e.stopPropagation();
  panel.addEventListener('pointerdown', stop);
  el.addEventListener('pointerdown', (e) => { stop(e); if (e.target === el) { sfx('ui'); close(); } });
  el.addEventListener('click', (e) => {
    stop(e);
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.dataset.g) { set(b.dataset.g, b.dataset.id); return; }
    if (b.classList.contains('tbc-x')) { sfx('ui'); close(); return; }
    if (b === sendBtn) { send(); return; }
    if (b === waBtn) { whatsapp(); return; }
    if (b === copyBtn) { copyLink(); return; }
    if (b === saveBtn) { savePicture(); return; }
  });

  const setMsg = (t) => { msgEl.textContent = t || ''; msgEl.hidden = !t; };

  /** Show either "Send" (Web Share) or the WhatsApp + Copy link fallback; "Save picture" always. */
  function showFallback(on) {
    sendBtn.hidden = !!on;
    waBtn.hidden = !on; copyBtn.hidden = !on;
    el.querySelector('.tbc-actions').classList.toggle('fb', !!on);
  }

  function sync() {
    for (const b of el.querySelectorAll('[data-g]')) {
      const on = S[b.dataset.g] === b.dataset.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    for (const b of el.querySelectorAll('[data-g="scene"]')) {
      const id = b.dataset.id;
      b.hidden = id === 'photo' ? !photo : false;
      const locked = id !== 'photo' && !shooter.available(id);
      b.classList.toggle('locked', locked);
      b.setAttribute('aria-label', locked ? `${b.textContent.trim()} (visit ${PLACE[shooter.SHOTS[id].district]} first)` : b.textContent.trim());
    }
    const ready = !!file && !busy;
    for (const b of [sendBtn, waBtn, copyBtn, saveBtn]) b.classList.toggle('wait', !ready);
  }

  function set(key, id) {
    if (key === 'scene') {
      if (!SCENES.some((s) => s.id === id) || (id === 'photo' && !photo)) return;
      if (id !== 'photo' && !shooter.available(id)) {
        setMsg(`Walk to ${PLACE[shooter.SHOTS[id].district]} first, then you can use this scene.`);
        sfx('ui');
        return;
      }
    } else if (key === 'greeting') { if (!GREETINGS.some((g) => g.id === id)) return; }
    else if (key === 'frame') { if (!FRAMES.some((f) => f.id === id)) return; }
    else return;
    setMsg('');
    sfx('ui');
    if (S[key] === id && file) return;
    S[key] = id;
    refresh();
  }

  // ---------------------------------------------------------------- making the card
  const fontsReady = () => {
    try {
      return Promise.race([document.fonts.load('700 60px Fredoka').then(() => document.fonts.load('600 40px Fredoka')), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  };
  const later = (ms) => new Promise((r) => setTimeout(r, ms));
  function renderScale() {
    if (engine.quality === 'low') return 0.6;
    if (engine.isMobile) return 0.85;
    return 1;
  }

  /** Scene canvas for the current choice (cached per scene while the maker is open). */
  async function sceneCanvas(id) {
    if (id === 'photo') return photo;
    if (shots.has(id)) return shots.get(id);
    busyEl.hidden = false;
    await later(80); // let the panel paint and one game frame hide the free-play markers (guide trail, glow rings)
    // opened in the first moments of play, before even the park has finished knitting itself in: wait for it (≤ 3 s)
    for (let i = 0; i < 15 && S.open && !shooter.available(id); i++) await later(200);
    const k = renderScale();
    let cv = null;
    try { cv = shooter.shoot(id, Math.round(PHOTO.w * k), Math.round(PHOTO.h * k)); } catch (err) { console.error('[cards] scene shot failed', err); }
    if (cv && S.open) shots.set(id, cv);
    return cv;
  }

  function refresh() {
    const v = ++ver;
    file = null;
    sync();
    const job = (async () => {
      await fontsReady();
      if (v !== ver || !S.open) return;
      const scene = await sceneCanvas(S.scene);
      if (v !== ver || !S.open) return;
      drawCard(canvas, scene, { greeting: S.greeting, frame: S.frame, name: cleanName(game.state.playerName) });
      busyEl.hidden = true;
      // the JPEG is made in advance: Web Share must be called straight from the tap
      const blob = await new Promise((res) => { try { canvas.toBlob((b) => res(b), 'image/jpeg', 0.9); } catch (e) { res(null); } });
      if (v !== ver || !S.open) return;
      file = blob ? (typeof File === 'function' ? new File([blob], FILE_NAME, { type: 'image/jpeg' }) : blob) : null;
      if (!file) setMsg('Sorry, the card didn’t work. Try another scene?');
    })().catch((err) => { console.error('[cards] make failed', err); })
      .finally(() => { if (v === ver) { busy = null; busyEl.hidden = true; sync(); } });
    busy = job;
    return job;
  }
  /** Resolves when the current card (preview + JPEG) is finished. */
  async function ready() {
    while (busy) await busy;
    return file;
  }

  // ---------------------------------------------------------------- sharing
  const link = () => cardLink({ name: cleanName(game.state.playerName), scene: S.scene, greeting: S.greeting, frame: S.frame, town: ctx.net?.town?.code || null });
  const text = () => `${greetingText(S.greeting)} 🎄 Come and see me in Tinselby!`;
  function created() {
    const k = `${S.scene}.${S.greeting}.${S.frame}`;
    if (createdKeys.has(k)) return;
    createdKeys.add(k);
    game.emit('card:created', { scene: S.scene, greeting: S.greeting, frame: S.frame });
  }
  const shared = (method) => { game.emit('card:shared', { method }); };
  const notReady = () => { if (file) return false; toast('One moment, your card is nearly ready…', 1400); return true; };

  async function send() {
    if (notReady()) return;
    sfx('ui');
    created();
    const data = { text: text(), url: link() };
    try {
      let files = false;
      try { files = !!(navigator.canShare && file instanceof File && navigator.canShare({ files: [file] })); } catch (e) { files = false; }
      if (files) await navigator.share({ files: [file], ...data });
      else if (typeof navigator.share === 'function') await navigator.share(data);
      else { showFallback(true); return; }
      shared('share');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // the player closed the share sheet
      showFallback(true);
      setMsg('Sharing isn’t working here. Try WhatsApp or Copy link instead.');
    }
  }
  function whatsapp() {
    if (notReady()) return;
    sfx('ui');
    created();
    const url = `https://wa.me/?text=${encodeURIComponent(`${text()} ${link()}`)}`;
    let w = null;
    try { w = window.open(url, '_blank', 'noopener'); } catch (e) { w = null; }
    if (!w) { // pop-up blocked (or noopener returned null): fall back to a plain link click
      try { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* */ }
    }
    shared('whatsapp');
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  async function copyLink() {
    if (notReady()) return;
    sfx('ui');
    created();
    const ok = await copyText(link());
    if (ok) {
      shared('copy');
      copyBtn.querySelector('span').textContent = 'Copied!';
      copyBtn.classList.add('done');
      clearTimeout(copyLink.t);
      copyLink.t = setTimeout(() => { copyBtn.querySelector('span').textContent = 'Copy link'; copyBtn.classList.remove('done'); }, 1800);
    } else setMsg('Couldn’t copy the link here. Try Save picture instead.');
  }
  function savePicture() {
    if (notReady()) return;
    sfx('ui');
    created();
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = FILE_NAME;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL?.(url), 5000);
      shared('save');
      toast('Card saved!', 1800);
    } catch (e) { setMsg('Couldn’t save the picture here.'); }
  }

  // ---------------------------------------------------------------- open / close
  function canOpen() {
    return game.state.phase === 'play' && !S.open && player.controllable && input.enabled !== false && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.finale?.running && !ctx.house?.isOpen
      && !ctx.ui?.modalOpen?.() && !ctx.photo?.isOpen;
  }
  function open(where = 'friends', opts = {}) {
    if (!canOpen()) return false;
    try { ctx.social?.closeAll?.(); } catch (e) { /* */ }
    saved = { controllable: player.controllable, input: input.enabled };
    player.controllable = false;
    input.enabled = false;
    input.clearTap?.();
    photo = opts.photo && opts.photo.width ? opts.photo : null;
    S.open = true;
    S.where = where === 'photo' ? 'photo' : 'friends';
    S.scene = photo ? 'photo' : (LAND.find((id) => shooter.available(id)) || 'park');
    shots = new Map();
    file = null;
    createdKeys.clear();
    showFallback(typeof navigator.share !== 'function');
    setMsg('');
    el.hidden = false;
    document.body.classList.add('tbc-open');
    offUpdate = engine.addUpdate(watch, 106); // only while open: leave if something else takes over
    sync();
    refresh();
    sfx('pop');
    game.emit('card:open', { where: S.where });
    return true;
  }
  function close() {
    if (!S.open) return;
    S.open = false;
    ver++;
    busy = null;
    el.hidden = true;
    document.body.classList.remove('tbc-open');
    if (offUpdate) { offUpdate(); offUpdate = null; }
    const free = game.state.phase === 'play' && !ctx.minigames?.active && !ctx.rides?.active && !cam.shotActive;
    if (saved && free) { player.controllable = saved.controllable; input.enabled = saved.input; }
    saved = null;
    shots = new Map(); photo = null; file = null; // let the canvases go
    game.emit('card:close', {});
  }
  function watch() {
    if (game.state.phase !== 'play' || ctx.minigames?.active || ctx.finale?.running || cam.shotActive) close();
  }
  game.on('minigame:start', () => close());
  game.on('finale:start', () => close());
  window.addEventListener('keydown', (e) => {
    if (!S.open) return;
    if ((e.key || '').toLowerCase() === 'escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, { capture: true });

  return {
    open, close, canOpen, set, ready, link, text,
    icon: CARD_ICONS.card,
    get isOpen() { return S.open; },
    get state() { return { ...S }; },
    get file() { return file; },
    get canvas() { return canvas; },
    shooter,
  };
}
