// Install Tinselby as an app (PWA). ctx.pwa = createPwa(ctx)
//   - registers public/sw.js (production https host; on localhost only with ?pwa; never on file:// or ?capture without ?pwa)
//   - after a door is completed (the first one for new players), in free play only, shows ONE knitted card:
//       "Add Tinselby to your home screen" [Add] [Not now]
//     Android / desktop Chrome / Edge: the captured beforeinstallprompt → prompt(). iPhone / iPad: a 2-step picture guide.
//     Never when already installed (display-mode standalone / navigator.standalone). "Not now" → 3 days quiet. Max 3 times.
//     Remembered in localStorage `tinselby.pwa.v1`.
//   - offline: a small knitted toast "You're offline: friends and online play are paused" (navigator.onLine false, or the
//     net layer failing while a same-origin ping fails too).
// API: pwa.standalone, pwa.platform ('android'|'ios'|'desktop'|null), pwa.canInstall, pwa.state, pwa.show(force) (tests),
//      pwa.hide(), pwa.cardShown, pwa.sw (registration promise | null), pwa.offlineToast(force)
// Events (analytics listens): pwa:prompt {platform}, pwa:accept {platform}, pwa:dismiss {platform}, pwa:installed {via}
import './pwa.css';
import { SHARE_ICON, ADD_ICON } from './icons.js';

const KEY = 'tinselby.pwa.v1';
const SNOOZE_MS = 3 * 24 * 3600 * 1000;
const MAX_SHOWS = 3;

const load = () => { try { return { n: 0, until: 0, done: 0, inst: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { n: 0, until: 0, done: 0, inst: 0 }; } };

export function isStandalone() {
  try {
    if (navigator.standalone === true) return true; // iOS home-screen launch
    return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
  } catch (e) { return false; }
}

function detectIOS() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports a Mac
  if (!ios) return null;
  if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|GSA\//.test(ua)) return null; // in-app browsers have no "Add to Home Screen"
  return /iPad/.test(ua) || navigator.platform === 'MacIntel' ? 'ipad' : 'iphone';
}

export function createPwa(ctx) {
  const { game, params, uiRoot, player, cam, engine } = ctx;
  const S = game.state;
  const capture = params.has('capture');
  const forced = params.has('pwa'); // tests / manual checks: allow on localhost and in ?capture runs
  let store = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };
  const ios = detectIOS();
  let bip = null; // the deferred beforeinstallprompt event
  let pending = false, pendingAt = 0, shownSession = false, card = null, mode = 'ask', parked = false;
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const emit = (e, d) => { try { game.emit(e, d); } catch (er) { /* */ } };
  const platform = () => (bip ? (/Android/i.test(navigator.userAgent || '') ? 'android' : 'desktop') : ios ? 'ios' : null);

  // ------------------------------------------------------------------ service worker
  let sw = null;
  const swAllowed = (() => {
    try {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
      const { protocol, hostname } = location;
      const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
      if (local) return forced;
      if (protocol !== 'https:') return false;
      return !capture || forced;
    } catch (e) { return false; }
  })();
  if (swAllowed) {
    const register = () => {
      sw = navigator.serviceWorker.register('./sw.js').catch((e) => { console.warn('[pwa] service worker not registered', e && e.message); return null; });
    };
    // after the page has loaded (and a beat later), so the worker never competes with the game's own start-up
    if (document.readyState === 'complete') setTimeout(register, 1500);
    else window.addEventListener('load', () => setTimeout(register, 1500), { once: true });
  }

  // ------------------------------------------------------------------ installed?
  const markInstalled = (via) => {
    if (store.inst) return;
    store.inst = 1; store.done = 1; save();
    emit('pwa:installed', { via });
  };
  if (isStandalone() || params.get('source') === 'pwa') markInstalled('launch');
  window.addEventListener('appinstalled', () => { bip = null; hide(); markInstalled('prompt'); });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's mini-infobar away: we ask at a nicer moment
    bip = e;
  });

  const eligible = () => !isStandalone() && !store.done && !store.inst && store.n < MAX_SHOWS && Date.now() >= (store.until || 0)
    && !!platform() && (!capture || forced);

  // ------------------------------------------------------------------ when may the card show (free play, nothing else on screen)
  const vis = (sel) => { const e = uiRoot.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; };
  function free() {
    return S.phase === 'play' && player.controllable && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.finale?.running
      && !ctx.ui?.modalOpen?.() && !ctx.photo?.isOpen && !document.body.classList.contains('tb-photo')
      && !uiRoot.classList.contains('tb-house-open') && !ctx.map?.isOpen && !ctx.cards?.isOpen
      && !ctx.ui?.hud?.el?.classList.contains('tb-framing');
  }
  const quiet = () => free() && !ctx.ui?.cards?.busy && !vis('.tbt-call') && !vis('.tbt-help');

  // a door done (first door for new players; the next door for players who already had some) → ask a few seconds later
  game.on('door:complete', () => {
    if (pending || shownSession || !eligible()) return;
    pending = true; pendingAt = performance.now();
  });

  // ------------------------------------------------------------------ the card
  const layer = document.createElement('div');
  layer.className = 'tb-cards tb-pwa-layer';
  uiRoot.appendChild(layer);

  function buildCard() {
    const el = document.createElement('div');
    el.className = 'tb-card knit-card interactive tb-pwa-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Add Tinselby to your home screen');
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    return el;
  }
  const btn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `knit-btn ${cls}`; b.textContent = label;
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sfx('ui'); try { fn(); } catch (er) { console.error('[pwa]', er); } });
    return b;
  };
  const ICON = '<img class="tb-pwa-app" src="./icons/icon-192.png" alt="" draggable="false">';

  function renderAsk() {
    mode = 'ask';
    card.classList.remove('guide');
    card.innerHTML = `
      <div class="tb-card-ico tb-pwa-ico">${ICON}</div>
      <div class="tb-card-body">
        <div class="tb-card-kicker">Keep Tinselby handy</div>
        <div class="tb-card-title">Add Tinselby to your home screen</div>
        <div class="tb-card-sub">Open it like an app, any time.</div>
      </div>
      <div class="tb-card-btns"></div>`;
    const btns = card.querySelector('.tb-card-btns');
    btns.append(btn('Add', 'green tb-pwa-add', onAdd), btn('Not now', 'cream tb-pwa-later', onLater));
  }
  function renderGuide() {
    mode = 'guide';
    card.classList.add('guide');
    const where = ios === 'ipad' ? 'at the top of Safari' : 'in Safari’s toolbar';
    card.innerHTML = `
      <div class="tb-pwa-gbody">
        <div class="tb-card-title">Add to Home Screen</div>
        <ol class="tb-pwa-steps">
          <li><span class="tb-pwa-n">1</span><span class="tb-pwa-pic">${SHARE_ICON}</span><span class="tb-pwa-st">Tap <b>Share</b><small>${where}</small></span></li>
          <li><span class="tb-pwa-n">2</span><span class="tb-pwa-pic">${ADD_ICON}</span><span class="tb-pwa-st">Choose <b>Add to Home Screen</b><small>scroll down if you can’t see it</small></span></li>
        </ol>
      </div>
      <div class="tb-card-btns"></div>`;
    card.querySelector('.tb-card-btns').append(btn('Got it', 'green tb-pwa-ok', () => { store.done = 1; save(); hide(); }));
  }

  function show(force = false) {
    if (card) return false;
    if (!force && !eligible()) return false;
    const plat = platform() || (ios ? 'ios' : 'desktop');
    card = buildCard();
    renderAsk();
    layer.appendChild(card);
    shownSession = true; pending = false; parked = false;
    store.n = (store.n || 0) + 1; store.until = Date.now() + SNOOZE_MS; save(); // counts once shown, even if the tab closes
    sfx('bell');
    emit('pwa:prompt', { platform: plat });
    return true;
  }
  function hide() {
    if (!card) return;
    const el = card; card = null; parked = false;
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }
  async function onAdd() {
    const plat = platform();
    if (bip) {
      const e = bip; bip = null;
      hide();
      let outcome = 'dismissed';
      try { await e.prompt(); const c = await e.userChoice; outcome = c && c.outcome; } catch (er) { console.warn('[pwa] prompt failed', er && er.message); }
      if (outcome === 'accepted') { store.done = 1; save(); emit('pwa:accept', { platform: plat }); }
      else { store.until = Date.now() + SNOOZE_MS; save(); emit('pwa:dismiss', { platform: plat, native: true }); }
      return;
    }
    if (ios) { emit('pwa:accept', { platform: 'ios' }); renderGuide(); return; }
    hide();
  }
  function onLater() {
    store.until = Date.now() + SNOOZE_MS; save();
    emit('pwa:dismiss', { platform: platform() || (ios ? 'ios' : 'desktop') });
    hide();
  }

  // ------------------------------------------------------------------ offline toast
  let offlineShown = false, lastPing = 0, offlineWanted = navigator.onLine === false;
  function offlineToast(force) {
    if (offlineShown && !force) return;
    if (S.phase !== 'play') { offlineWanted = true; return; }
    offlineShown = true; offlineWanted = false;
    const text = 'You’re offline: friends and online play are paused';
    try { if (ctx.ui?.toast) ctx.ui.toast(text, 6500); else game.emit('ui:toast', { text, ms: 6500 }); } catch (e) { /* */ }
    // lift it above the floating activity signs / guide chips (pwa.css)
    try { const t = uiRoot.querySelector('.tb-toasts')?.lastElementChild; if (t && t.textContent === text) t.classList.add('tb-pwa-toast'); } catch (e) { /* */ }
  }
  window.addEventListener('offline', () => offlineToast());
  window.addEventListener('online', () => { offlineShown = false; offlineWanted = false; });
  game.on('game:start', () => { if (offlineWanted || navigator.onLine === false) setTimeout(() => offlineToast(), 1200); });
  // the net layer failed: only call it "offline" when our own host doesn't answer either (a Realtime hiccup is not "offline")
  game.on('net:status', (d) => {
    if (!d || d.online || offlineShown) return;
    let st = '';
    try { st = ctx.net?.stats?.()?.status || ''; } catch (e) { /* */ }
    if (st !== 'offline') return;
    if (navigator.onLine === false) { offlineToast(); return; }
    const now = performance.now(); if (now - lastPing < 60000) return; lastPing = now;
    fetch(`./sw.js?ping=${Date.now()}`, { method: 'HEAD', cache: 'no-store' }).catch(() => offlineToast());
  });

  // ------------------------------------------------------------------ per frame: show when quiet, step aside when not
  engine.addUpdate(() => {
    if (offlineWanted && S.phase === 'play') offlineToast();
    if (card) {
      if (isStandalone()) { hide(); return; }
      const ok = free() && !ctx.ui?.cards?.busy;
      if (!ok && !parked) { parked = true; card.classList.add('parked'); }
      else if (ok && parked) { parked = false; card.classList.remove('parked'); }
      return;
    }
    if (pending && performance.now() - pendingAt > 2600 && quiet()) {
      if (!eligible()) { pending = false; return; } // e.g. no install prompt available on this browser
      // wait for the reward card's queue to have been empty for a moment so the two never chain back-to-back abruptly
      if (!api._quietSince) api._quietSince = performance.now();
      if (performance.now() - api._quietSince > 1200) show();
    } else api._quietSince = 0;
  }, 160);

  const api = {
    get standalone() { return isStandalone(); },
    get platform() { return platform(); },
    get canInstall() { return eligible(); },
    get state() { return { ...store, pending, shownSession, mode, parked, bip: !!bip, ios, sw: !!sw, swAllowed }; },
    get cardShown() { return !!card && !parked; },
    get sw() { return sw; },
    show, hide, offlineToast,
    /** tests: forget the remembered state */
    reset() { store = { n: 0, until: 0, done: 0, inst: 0 }; save(); shownSession = false; pending = false; },
    _quietSince: 0,
  };
  return api;
}
