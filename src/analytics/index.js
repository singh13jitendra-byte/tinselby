// Analytics (see /ANALYTICS.md). ctx.analytics = createAnalytics(ctx)
//   analytics.track(event, props)   manual capture (rarely needed: everything is derived from game events)
//   analytics.enabled               true when events are really being collected (key set, no DNT/GPC) or a test stub is set
//   analytics.flush()               send the queue now
// It only SUBSCRIBES to game events (+ wraps ctx.net.send / joinTown and ctx.guide.showWay at runtime). No names, chat text,
// codes or IPs are ever sent. Without a key every call is a no-op. PostHog loads only on the production host, never with ?capture / file:// / localhost / DNT / GPC.
import * as CFG from './config.js';
import { createClient, anonId, privacyOptOut } from './client.js';

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const id24 = (s) => clip(s, 24).replace(/[^A-Za-z0-9_\-]/g, '');
const vpBucket = (w) => (w < 400 ? 'xs<400' : w < 600 ? 'sm<600' : w < 900 ? 'md<900' : w < 1400 ? 'lg<1400' : 'xl>=1400');
const fpsBucket = (f) => (f < 15 ? '<15' : f < 25 ? '15-24' : f < 41 ? '25-40' : f < 56 ? '41-55' : '56+');
/** error text without URLs / file paths / long numbers */
export const scrub = (m) => clip(String(m == null ? '' : m).replace(/(https?|file|blob|data):[^\s)'"]+/gi, '<url>').replace(/\/[\w.\-/]{6,}/g, '<path>').replace(/\s+/g, ' ').trim(), 120);

function prodHost() {
  try {
    const { protocol, hostname } = location;
    if (protocol !== 'https:' && protocol !== 'http:') return false; // file://
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false;
    return hostname.endsWith(CFG.PROD_HOST_SUFFIX) || CFG.PROD_EXTRA_HOSTS.includes(hostname);
  } catch (e) { return false; }
}

export function createAnalytics(ctx) {
  const { game, params } = ctx;
  const T0 = performance.now();
  const stub = (typeof window !== 'undefined' && window.__analyticsStub) || null;
  const optOut = privacyOptOut();
  const key = optOut || params.has('capture') || !prodHost() ? '' : CFG.KEY; // PostHog only on the production host
  const { id, returning } = anonId();
  const sessionId = (() => { try { return crypto.randomUUID(); } catch (e) { return String(Math.random()).slice(2) + Date.now(); } })();
  const client = optOut ? createClient({ key: '', host: CFG.HOST }) : createClient({ key, host: CFG.HOST, stub, distinctId: id, sessionId });
  const enabled = client.live;
  const track = (event, props) => { try { client.capture(event, props); } catch (e) { /* never throw */ } };
  const api = { track, enabled, flush: () => client.flush(), client, id: enabled ? id : null };
  if (!enabled) { api.off = true; return api; }

  const S = { startT: 0, doorStart: null, finale: null, errors: 0, seen: new Set(), played: false, visMs: 0, visSince: document.hidden ? 0 : performance.now() };
  const secsSince = (t) => (t ? Math.min(7200, Math.round((performance.now() - t) / 1000)) : undefined);
  const on = (evt, fn) => { try { game.on(evt, (d = {}) => { try { fn(d || {}); } catch (e) { /* never throw */ } }); } catch (e) { /* */ } };

  // ---- session_start
  (function sessionStart() {
    const w = window.innerWidth || 0, h = window.innerHeight || 0;
    const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
    const mn = Math.min(w, h);
    let refDomain = '';
    try { if (document.referrer) { const u = new URL(document.referrer); if (u.hostname !== location.hostname) refDomain = clip(u.hostname.replace(/^www\./, ''), 60); } } catch (e) { /* */ }
    const p = {
      device: coarse ? (mn >= 600 ? 'tablet' : 'phone') : 'desktop',
      orientation: h > w ? 'portrait' : 'landscape',
      viewport: vpBucket(w),
      returning,
      lang: clip(navigator.language || '', 5),
      referrer_domain: refDomain,
      town_link: params.has('town'), // arrived from a friends-town invite (the code itself is never sent)
      standalone: (() => { try { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches; } catch (e) { return false; } })(), // opened as an installed app (src/pwa)
    };
    for (const k of ['source', 'medium', 'campaign']) { const v = params.get('utm_' + k); if (v) p['utm_' + k] = clip(v, 40); }
    track('session_start', p);
  })();

  // ---- game events
  on('game:start', () => { S.startT = performance.now(); S.played = true; track('name_entered', {}); });
  on('door:open', ({ n }) => { if (!S.played || n == null || S.seen.has('o' + n)) return; S.seen.add('o' + n); track('door_opened', { n }); });
  on('door:complete', ({ n, stars }) => {
    const p = { n, stars };
    const s = secsSince(S.doorStart); if (s != null) p.secs = s;
    S.doorStart = null;
    track('door_completed', p);
  });
  on('task:accepted', () => { S.doorStart = performance.now(); });
  on('minigame:start', ({ id: gid }) => { S.doorStart = performance.now(); S.mgT = performance.now(); track('minigame_start', { id: id24(gid) }); });
  on('minigame:end', ({ id: gid, score, stars, quit }) => {
    const p = { id: id24(gid), score: +score || 0, stars: +stars || 0, quit: !!quit };
    const s = secsSince(S.mgT); if (s != null) p.secs = s;
    track('minigame_end', p);
  });
  on('ride:start', ({ id: rid }) => { S.rideT = performance.now(); track('ride_start', { id: id24(rid) }); });
  on('ride:end', ({ id: rid }) => { const p = { id: id24(rid) }; const s = secsSince(S.rideT); if (s != null) p.secs = s; track('ride_end', p); });
  on('photo:taken', () => track('photo_taken', {}));
  on('photo:shared', () => track('photo_shared', {}));
  on('card:open', ({ where }) => track('card_opened', { where: where === 'photo' ? 'photo' : 'friends' })); // Christmas cards (src/cards): ids only, never the name
  on('card:created', ({ scene, greeting, frame }) => track('card_created', { scene: id24(scene), greeting: id24(greeting), frame: id24(frame) }));
  on('card:shared', ({ method }) => track('card_shared', { method: id24(method) }));
  on('map:open', () => { S.mapOpen = true; track('map_opened', {}); });
  on('activities:open', () => track('activities_opened', {})); // phones: the "Things to do" button's sheet (src/activities/sheet.js)
  on('activities:way', ({ id }) => track('activity_way', { id: id24(id) })); // a row tapped → the way there is lit
  on('tips:skipped', () => track('tips_skipped', {}));
  on('invite:open', ({ hasCard, hasTown }) => track('invite_opened', { has_card: !!hasCard, has_town: !!hasTown })); // never the sender's name
  on('invite:played', () => track('invite_played', {}));
  // install as an app (src/pwa): platform android | ios | desktop
  const plat = (p) => (p === 'android' || p === 'ios' ? p : 'desktop');
  // trigger: door | returning | help ("?" card row); guide: prompt | ios | android_menu | desktop_hint (what Add opens)
  const trig = (t) => (t === 'returning' || t === 'help' ? t : 'door');
  const gd = (g) => (g === 'ios' || g === 'android_menu' || g === 'desktop_hint' ? g : 'prompt');
  on('pwa:prompt', ({ platform, trigger, guide }) => track('install_prompt_shown', { platform: plat(platform), trigger: trig(trigger), guide: gd(guide) }));
  on('pwa:accept', ({ platform, trigger, guide }) => track('install_accepted', { platform: plat(platform), trigger: trig(trigger), guide: gd(guide) }));
  on('pwa:dismiss', ({ platform, native, trigger, guide }) => track('install_dismissed', { platform: plat(platform), native: !!native, trigger: trig(trigger), guide: gd(guide) }));
  on('pwa:installed', ({ via }) => track('installed', { via: via === 'prompt' ? 'prompt' : 'launch' }));
  on('streak:day', ({ streak, snowDayUsed }) => track('streak_day', { streak: Math.max(0, Math.min(9999, +streak | 0)), snow_day_used: !!snowDayUsed })); // play streaks (src/streaks)
  on('streak:reward', ({ days }) => track('streak_reward', { days: +days | 0 }));
  const finaleDone = () => { if (!S.finale) return; track('finale_watched', { secs: secsSince(S.finale.t), replay: !!S.finale.replay }); S.finale = null; };
  on('finale:start', ({ preview, replay }) => { if (!preview) S.finale = { t: performance.now(), replay: !!replay }; });
  on('finale:exit', ({ preview }) => { if (!preview) finaleDone(); });
  on('game:end', finaleDone);

  // ---- things with no game event: wrap the call site (runtime only, other modules' files untouched)
  const wrap = (obj, name, fn) => {
    try {
      const orig = obj && obj[name];
      if (typeof orig !== 'function') return false;
      obj[name] = function (...a) { const r = orig.apply(this, a); try { fn(a, r); } catch (e) { /* */ } return r; };
      return true;
    } catch (e) { return false; }
  };
  let madeCode = null;
  wrap(ctx.net, 'newTownCode', (a, r) => { madeCode = r; });
  wrap(ctx.net, 'joinTown', ([code], ok) => {
    if (!ok) return;
    if (madeCode && String(code).toUpperCase() === String(madeCode).toUpperCase()) { madeCode = null; track('friend_town_created', {}); } else track('friend_town_joined', {});
  });
  wrap(ctx.net, 'send', ([type, d], ok) => {
    if (!ok) return;
    if (type === 'emote') track('emote_sent', { id: id24(d?.e) });
    else if (type === 'say') track('phrase_sent', { id: id24(d?.p) }); // the phrase id only, never text
    else if (type === 'snow') track('snowball_thrown', {});
    else if (type === 'gift') track('gift_sent', {});
    else if (type === 'gift-ok') track('gift_accepted', {});
  });
  const showWay = (src) => track('show_way', { source: src });
  wrap(ctx.guide, 'showWay', () => showWay(S.mapOpen ? 'map' : 'other'));
  on('map:close', () => { S.mapOpen = false; });

  // ---- errors (message only, scrubbed, max 5 per session)
  const err = (m) => {
    if (S.errors >= 5) return;
    const msg = scrub(m); if (!msg || S.seen.has('e' + msg)) return;
    S.seen.add('e' + msg); S.errors++;
    track('error', { message: msg });
  };
  window.addEventListener('error', (e) => err(e && e.message));
  window.addEventListener('unhandledrejection', (e) => err('unhandledrejection: ' + (e && e.reason && (e.reason.message || e.reason))));

  // ---- perf: fps over a 5 s window starting 25 s in (only while the tab is visible), load time bucket
  let perfSent = false;
  const firePerf = (fps) => { if (perfSent) return; perfSent = true; track('perf', { fps_bucket: fpsBucket(fps), fps: Math.round(fps), load_ms: Math.round(T0 / 100) * 100 }); };
  api._firePerf = firePerf;
  (function perfWatch() {
    let frames = 0, t0 = 0, armed = false;
    const tick = (t) => {
      if (perfSent) return;
      if (document.hidden) { frames = 0; t0 = 0; armed = false; }
      else if (performance.now() - T0 >= 25000) {
        if (!armed) { armed = true; frames = 0; t0 = t; }
        else { frames++; if (t - t0 >= 5000) { if (frames >= 5) { firePerf(frames / ((t - t0) / 1000)); return; } armed = false; } }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();

  // ---- session_end (visible minutes). Sent on every hide / pagehide; use the max per $session_id.
  let lastEnd = 0;
  const visMinutes = () => (S.visMs + (S.visSince ? performance.now() - S.visSince : 0)) / 60000;
  const sessionEnd = (final) => {
    const now = performance.now(); if (now - lastEnd < 800) return; lastEnd = now;
    track('session_end', { minutes: Math.round(visMinutes() * 10) / 10, final: !!final });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (S.visSince) { S.visMs += performance.now() - S.visSince; S.visSince = 0; } sessionEnd(false); }
    else S.visSince = performance.now();
  });
  window.addEventListener('pagehide', () => { if (S.visSince) { S.visMs += performance.now() - S.visSince; S.visSince = 0; } sessionEnd(true); });

  // ---- the one-line privacy note on the entry card (only when something is actually collected)
  try {
    const card = document.querySelector('.tb-entry-card');
    if (card && !card.querySelector('.tb-privacy')) {
      const p = document.createElement('div');
      p.className = 'tb-privacy';
      p.textContent = 'We count anonymous visits and taps to improve the game. No names, chat or cookies.';
      p.style.cssText = 'font:500 11px/1.3 Fredoka,system-ui,sans-serif;opacity:.6;text-align:center;margin-top:2px;pointer-events:none';
      card.appendChild(p);
      game.once('game:start', () => p.remove());
    }
  } catch (e) { /* cosmetic */ }

  return api;
}
