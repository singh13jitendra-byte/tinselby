// Install Tinselby as an app (PWA). ctx.pwa = createPwa(ctx)
//   - registers public/sw.js (production https host; on localhost only with ?pwa; never on file:// or ?capture without ?pwa)
//   - offers ONE knitted card "Add Tinselby to your home screen" [Add] [Not now], in free play only, once per session:
//       trigger 'door'      a few seconds after a door is completed
//       trigger 'returning' a player who already has ≥1 door done: at a calm free-play moment ~45 s (game time) after
//                           entering play (players who finished doors before the install card existed never saw it)
//     Add → Android / desktop Chrome / Edge with a captured beforeinstallprompt: prompt().
//           iPhone / iPad: a 2-step picture guide (Share → Add to Home Screen).
//           Android without beforeinstallprompt (in-app browsers / Custom Tabs opened from WhatsApp etc., Samsung Internet,
//           Firefox, or Chrome deciding not to fire it): a 2-step picture guide for the browser menu
//           (⋮ → Open in Chrome, then ⋮ → Add to Home screen / Install app). "No beforeinstallprompt within 5 s" = use the menu.
//     Never when already installed (display-mode standalone / navigator.standalone). "Not now" → 3 days quiet. Max 3 times.
//     Remembered in localStorage `tinselby.pwa.v1`.
//   - pwa.offer() (the "?" help card's "Add Tinselby to your home screen" row, src/tips): on demand, straight to the action
//     (prompt / iPhone guide / Android guide / desktop "install icon in the address bar" hint); doesn't count as a show.
//   - offline: a small knitted toast "You're offline: friends and online play are paused" (navigator.onLine false, or the
//     net layer failing while a same-origin ping fails too).
// API: pwa.standalone, pwa.platform ('android'|'ios'|'desktop'|null), pwa.canInstall, pwa.helpAvailable, pwa.helpLabel,
//      pwa.state, pwa.show(force) (tests), pwa.offer({trigger}) → guide kind | false, pwa.hide(), pwa.cardShown, pwa.mode,
//      pwa.sw (registration promise | null), pwa.offlineToast(force), pwa.reset()
// Events (analytics listens): pwa:prompt {platform, trigger, guide}, pwa:accept {platform, trigger, guide},
//   pwa:dismiss {platform, native, trigger, guide}, pwa:installed {via}
//   trigger: door | returning | help    guide: prompt | ios | android_menu | desktop_hint
import './pwa.css';
import { SHARE_ICON, ADD_ICON, MENU_ICON, BARS_ICON, OPEN_ICON, INSTALL_ICON, DOTS_INLINE } from './icons.js';

const KEY = 'tinselby.pwa.v1';
const SNOOZE_MS = 3 * 24 * 3600 * 1000;
const MAX_SHOWS = 3;
const BIP_WAIT_MS = 5000; // Android: no beforeinstallprompt by now → the browser menu is the way
const RETURN_AFTER = 45; // s of play (game time) before a returning player is asked
const DOOR_DELAY = 2.6; // s after a door
const QUIET_FOR = 1.2; // s of nothing else on screen before the card appears

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

/** Android browser family for the menu guide: 'chrome' (Chrome, Custom Tabs, WebViews, Edge, Opera: a ⋮ menu) | 'samsung' | 'firefox' | null */
export function detectAndroid() {
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) return null;
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Firefox\//i.test(ua)) return 'firefox';
  return 'chrome';
}
/** Clear signs we are inside another app (WhatsApp / Instagram / Facebook ... in-app browser, a WebView or a Custom Tab). */
export function inAppSignal() {
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) return false;
  if (/; wv\)|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|GSA\/|LinkedInApp|Twitter|TikTok|musical_ly/i.test(ua)) return true;
  try { if (/^android-app:\/\//.test(document.referrer || '')) return true; } catch (e) { /* */ }
  try { const b = navigator.userAgentData?.brands; if (b && b.some((x) => /WebView/i.test(x.brand || ''))) return true; } catch (e) { /* */ }
  return false;
}
function detectDesktop() {
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return null;
  if (/Edg\/|Chrome\/|Chromium\//.test(ua) && !/OPR\/|Firefox\//.test(ua)) return 'chromium';
  if (/Macintosh/.test(ua) && /Version\/\d+.*Safari\//.test(ua)) return 'safari';
  return null;
}

export function createPwa(ctx) {
  const { game, params, uiRoot, player, cam, engine } = ctx;
  const S = game.state;
  const capture = params.has('capture');
  const forced = params.has('pwa'); // tests / manual checks: allow on localhost and in ?capture runs
  let store = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };
  const ios = detectIOS();
  const android = detectAndroid();
  const inApp = inAppSignal();
  const desktop = detectDesktop();
  const t0 = performance.now();
  let bip = null; // the deferred beforeinstallprompt event
  let pending = false, pendT = 0, quietT = 0, playT = 0, shownSession = false, card = null, mode = 'ask', parked = false;
  let trigger = 'door', lastCheck = -1;
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const emit = (e, d) => { try { game.emit(e, d); } catch (er) { /* */ } };
  const menuReady = () => !!android && !bip && performance.now() - t0 > BIP_WAIT_MS;
  const platform = () => (bip ? (android ? 'android' : 'desktop') : ios ? 'ios' : menuReady() ? 'android' : null);
  const guideKind = () => (bip ? 'prompt' : ios ? 'ios' : android ? 'android_menu' : 'desktop_hint');
  const doneCount = () => { try { return ctx.progress?.doneCount?.() ?? ctx.ui?.data?.doneCount?.() ?? 0; } catch (e) { return 0; } };

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
  // the "?" help row: anything we can do on this browser (a prompt, or a guide that makes sense here)
  const helpAvailable = () => !isStandalone() && (!!bip || !!ios || !!android || !!desktop);

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
    pending = true; pendT = 0; trigger = 'door';
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
  const ICON = '<img class="tb-pwa-app" src="./icons/tinselby-192.png" alt="" draggable="false">';
  const ev = (extra = {}) => ({ platform: platform() || (ios ? 'ios' : android ? 'android' : 'desktop'), trigger, guide: guideKind(), ...extra });

  function renderAsk() {
    mode = 'ask';
    card.className = 'tb-card knit-card interactive tb-pwa-card';
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
  // kind: 'ios' | 'android'. Two numbered steps, each with a little picture.
  function guideSteps(kind) {
    if (kind === 'ios') {
      const where = ios === 'ipad' ? 'at the top of Safari' : 'in Safari’s toolbar';
      return { title: 'Add to Home Screen', steps: [
        [SHARE_ICON, `Tap <b>Share</b><small>${where}</small>`],
        [ADD_ICON, 'Choose <b>Add to Home Screen</b><small>scroll down if you can’t see it</small>'],
      ] };
    }
    if (android === 'samsung') return { title: 'Add to Home screen', steps: [
      [BARS_ICON, 'Tap the <b>menu</b><small>the ≡ button at the bottom right</small>'],
      [INSTALL_ICON, 'Choose <b>Add page to</b>, then <b>Home screen</b>'],
    ] };
    if (android === 'firefox') return { title: 'Add to Home screen', steps: [
      [MENU_ICON, `Tap the ${DOTS_INLINE} <b>menu</b><small>top right (or bottom right)</small>`],
      [INSTALL_ICON, 'Choose <b>Add app to Home screen</b><small>or “Install”</small>'],
    ] };
    return { title: 'Add to Home screen', steps: [ // Chrome / in-app browser / Custom Tab
      [OPEN_ICON, `Tap ${DOTS_INLINE} then <b>Open in Chrome</b><small>${inApp ? 'top right of this screen' : 'top right · skip if you’re already in Chrome'}</small>`],
      [INSTALL_ICON, `In Chrome tap ${DOTS_INLINE} then <b>Add to Home screen</b><small>or “Install app”</small>`],
    ] };
  }
  function renderGuide(kind) {
    mode = kind === 'ios' ? 'guide' : 'guide-android';
    card.className = `tb-card knit-card interactive tb-pwa-card guide${kind === 'ios' ? '' : ' android'}`;
    const g = guideSteps(kind);
    card.innerHTML = `
      <div class="tb-pwa-gbody">
        <div class="tb-card-title">${g.title}</div>
        <ol class="tb-pwa-steps">${g.steps.map(([pic, html], i) => `
          <li><span class="tb-pwa-n">${i + 1}</span><span class="tb-pwa-pic">${pic}</span><span class="tb-pwa-st">${html}</span></li>`).join('')}
        </ol>
      </div>
      <div class="tb-card-btns"></div>`;
    card.querySelector('.tb-card-btns').append(btn('Got it', 'green tb-pwa-ok', () => { if (trigger !== 'help') { store.done = 1; save(); } hide(); }));
  }
  function renderHint() { // desktop without an install prompt (Chrome / Edge already offering its own icon, or Safari)
    mode = 'hint';
    card.className = 'tb-card knit-card interactive tb-pwa-card hint';
    const sub = desktop === 'safari' ? 'In Safari, choose <b>File</b> → <b>Add to Dock</b>.'
      : 'Click the <b>install icon</b> at the right end of the address bar, or the browser menu → <b>Install Tinselby</b>.';
    card.innerHTML = `
      <div class="tb-card-ico tb-pwa-ico">${ICON}</div>
      <div class="tb-card-body">
        <div class="tb-card-title">Install Tinselby as an app</div>
        <div class="tb-card-sub">${sub}</div>
      </div>
      <div class="tb-card-btns"></div>`;
    card.querySelector('.tb-card-btns').append(btn('Got it', 'green tb-pwa-ok', hide));
  }

  function mount() {
    if (card) { card.remove(); card = null; }
    card = buildCard();
    layer.appendChild(card);
    parked = false;
  }
  function show(force = false, why) {
    if (card) return false;
    if (!force && !eligible()) return false;
    if (why) trigger = why;
    mount();
    renderAsk();
    shownSession = true; pending = false;
    store.n = (store.n || 0) + 1; store.until = Date.now() + SNOOZE_MS; save(); // counts once shown, even if the tab closes
    sfx('bell');
    emit('pwa:prompt', ev());
    return true;
  }
  /** On demand (the "?" help card): straight to the action. Must run inside the tap, so prompt() keeps the user gesture. */
  function offer({ trigger: why = 'help' } = {}) {
    if (isStandalone()) return false;
    trigger = why; pending = false;
    if (bip) { if (card) { const el = card; card = null; el.remove(); } emit('pwa:prompt', ev()); runPrompt(); return 'prompt'; }
    const kind = guideKind();
    if (kind === 'desktop_hint' && !desktop) return false;
    mount();
    if (kind === 'ios') renderGuide('ios'); else if (kind === 'android_menu') renderGuide('android'); else renderHint();
    sfx('pop');
    emit('pwa:prompt', ev());
    return kind;
  }
  function hide() {
    if (!card) return;
    const el = card; card = null; parked = false;
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }
  async function runPrompt() {
    const e = bip; bip = null;
    const d = ev({ guide: 'prompt' });
    hide();
    let outcome = 'dismissed';
    try { await e.prompt(); const c = await e.userChoice; outcome = c && c.outcome; } catch (er) { console.warn('[pwa] prompt failed', er && er.message); }
    if (outcome === 'accepted') { store.done = 1; save(); emit('pwa:accept', d); }
    else { if (d.trigger !== 'help') { store.until = Date.now() + SNOOZE_MS; save(); } emit('pwa:dismiss', { ...d, native: true }); }
  }
  function onAdd() {
    if (bip) { runPrompt(); return; }
    if (ios) { emit('pwa:accept', ev()); renderGuide('ios'); return; }
    if (android) { emit('pwa:accept', ev()); renderGuide('android'); return; }
    hide();
  }
  function onLater() {
    store.until = Date.now() + SNOOZE_MS; save();
    emit('pwa:dismiss', ev({ native: false }));
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
  engine.addUpdate((dt) => {
    if (offlineWanted && S.phase === 'play') offlineToast();
    if (S.phase === 'play') playT += dt;
    if (card) {
      if (isStandalone()) { hide(); return; }
      const ok = free() && !ctx.ui?.cards?.busy;
      if (!ok && !parked) { parked = true; card.classList.add('parked'); }
      else if (ok && parked) { parked = false; card.classList.remove('parked'); }
      return;
    }
    // a returning player (doors done before this release, or on an earlier day): once per session, ~45 s into play
    if (!pending && !shownSession && S.phase === 'play' && playT >= RETURN_AFTER && Math.floor(playT) !== lastCheck) {
      lastCheck = Math.floor(playT); // check about once a game-second
      if (doneCount() >= 1 && eligible()) { pending = true; pendT = DOOR_DELAY; trigger = 'returning'; }
    }
    if (!pending) { quietT = 0; return; }
    pendT += dt;
    if (pendT > DOOR_DELAY && quiet()) {
      if (!eligible()) { pending = false; return; } // e.g. no install route on this browser
      // the reward card's queue must have been empty for a moment so the two never chain back-to-back abruptly
      quietT += dt;
      if (quietT > QUIET_FOR) show(false, trigger);
    } else quietT = 0;
  }, 160);

  const api = {
    get standalone() { return isStandalone(); },
    get platform() { return platform(); },
    get canInstall() { return eligible(); },
    get helpAvailable() { return helpAvailable(); },
    get helpLabel() { return desktop && !android && !ios ? 'Install Tinselby as an app' : 'Add Tinselby to your home screen'; },
    get state() { return { ...store, pending, shownSession, mode, parked, trigger, playT: +playT.toFixed(1), bip: !!bip, ios, android, inApp, desktop, guide: guideKind(), sw: !!sw, swAllowed }; },
    get cardShown() { return !!card && !parked; },
    get mode() { return card ? mode : null; },
    get sw() { return sw; },
    show, offer, hide, offlineToast,
    /** tests: forget the remembered state */
    reset() { store = { n: 0, until: 0, done: 0, inst: 0 }; save(); shownSession = false; pending = false; playT = 0; lastCheck = -1; },
  };
  return api;
}
