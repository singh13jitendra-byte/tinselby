// Multiplayer (WAVE1.md §Net): shared town via Supabase Realtime, remote players as knitted dolls with name tags,
// and the Town Spirit counter. Offline-safe: every failure is caught, logged once per backoff step, and retried.
//
// Protocol
//   channel  `town:<n>` (supabase-js Realtime; presence key = this tab's id, broadcast self:false)
//   presence {id, name (cleanName), style (whole style object, values sanitised), door (progress.current())}
//   broadcast 'pos' {id, x, z, h, s}  2-decimal numbers; ~8 Hz moving / ~1 Hz idle, scaled down in busy rooms
//   rooms    join town:1; after the first presence sync, if ≥ 25 others are there, move on to town:2, …
//   RPCs     rpc('town_spirit') → [{doors, helpers}] every 30 s;  rpc('open_door', {p_player, p_door}) per door
// URL: ?net=local → BroadcastChannel mock between tabs (tests) · ?net=off → no networking · ?net=supabase forces
// the real thing. Capture/test runs (?capture) default to off so headless screenshots never touch the network.
//
// Wave 4 "Play together" (PLAY.md §Net API, behind ?w4 — see play-flag.js; off = the protocol above, unchanged)
//   friend towns ?town=CODE → channel `friends:CODE` (≤ 16 players; full → back to the public rooms), remembered in
//                localStorage `tinselby.town` for 12 h · net.town / newTownCode / joinTown / leaveTown / inviteUrl
//   broadcast 'msg' {id, t: type, d: data}  whitelisted + validated (core.validateMsg), ≤ 4/s per sender per type
//   presence   + ride {k, s} | null (net.setPresence)
//   local      muting (tinselby.net.v1), remote doll handles (emote / bubble / stagger / seat), tap picking,
//              speech bubbles (bubbles.js)
import { SUPABASE_URL, SUPABASE_KEY } from '../core/net-config.js';
import { cleanName } from '../core/names.js';
import { STYLE_OPTIONS } from '../core/player.js';
import { createNetCore, TUNING, normTownCode, makeTownCode, sanitizeRide, EMOTES, MSG_TYPES } from './core.js';
import { W4 } from './play-flag.js';
import { createBubbles } from './bubbles.js';
import { createSupabaseTransport, createLocalTransport } from './transport.js';
import { createDollView, MAX_DOLLS } from './dolls.js';
import { createNameTags } from './tags.js';
import { createSelfTag } from './selftag.js';

const STORE_KEY = 'tinselby.net.v1';
const TOWN_KEY = 'tinselby.town', TOWN_TTL_MS = 12 * 3600 * 1000;
const SID_KEY = 'tinselby.net.sid';
const PUBLIC_ORIGIN = 'https://tinselby-sepia.vercel.app';
const SELF_ID = '__self';

function loadTown() {
  try {
    const o = JSON.parse(localStorage.getItem(TOWN_KEY) || 'null');
    const c = o && normTownCode(o.code), age = o ? Date.now() - +o.at : Infinity;
    return c && age >= -60000 && age < TOWN_TTL_MS ? c : null;
  } catch (e) { return null; }
}
function saveTown(code) {
  try { if (code) localStorage.setItem(TOWN_KEY, JSON.stringify({ code, at: Date.now() })); else localStorage.removeItem(TOWN_KEY); } catch (e) { /* private mode */ }
}
/** ?town=CODE wins (and is remembered); ?town= (empty / invalid) forgets it; otherwise the remembered town (12 h). */
function initialTown(params) {
  if (params && params.has && params.has('town')) { const c = normTownCode(params.get('town')); saveTown(c); return c; }
  return loadTown();
}
/** Keep a ?town= in the address bar in step (so a reload or a copied URL means the town you're in). */
function setUrlTown(code) {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('town')) return;
    if (code) u.searchParams.set('town', code); else u.searchParams.delete('town');
    history.replaceState(history.state, '', u.toString());
  } catch (e) { /* file:// or sandboxed */ }
}
function inviteOrigin() {
  try { if (/^https?:$/.test(location.protocol) && location.origin && location.origin !== 'null') return location.origin; } catch (e) { /* ignore */ }
  return PUBLIC_ORIGIN;
}

function pickMode(params) {
  const p = (params && params.get && params.get('net')) || '';
  if (p === 'off' || p === '0' || p === 'false') return 'off';
  if (p === 'local') return 'local';
  if (p === 'supabase' || p === 'on') return 'supabase';
  if (params && params.has && params.has('capture')) return 'off';
  if (typeof WebSocket === 'undefined') return 'off';
  return 'supabase';
}
function makeId() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* older browsers */ }
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const store = {
  load() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } },
  save(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } },
};

function offlineNet(reason) {
  return {
    online: false, room: 0, mode: 'off', townSpirit: { doors: 0, helpers: 0 },
    players: () => [], gather: () => () => {}, recordDoor() {}, setStyle() {}, setName() {}, refreshSpirit() {}, stats: () => ({ reason }),
    // wave 4 no-ops
    town: null, newTownCode: () => makeTownCode(), joinTown: () => false, leaveTown: () => false, inviteUrl: () => null,
    send: () => false, setPresence() {}, mute: () => false, isMuted: () => false, doll: () => null, dollAt: () => null, selfBubble: () => false,
  };
}
/** Wave 4: keep this tab's id across a reload (sessionStorage), so mutes and rides still point at the same player. */
function makeSid() {
  if (!W4) return makeId();
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const prev = sessionStorage.getItem(SID_KEY);
    if (prev && nav && nav.type === 'reload' && /^[\w-]{1,64}$/.test(prev)) return prev; // not for duplicated tabs
    const id = makeId();
    sessionStorage.setItem(SID_KEY, id);
    return id;
  } catch (e) { return makeId(); }
}

export function createNet(ctx) {
  try { return createNetImpl(ctx); } catch (e) {
    console.warn('[net] multiplayer disabled after a setup error:', e);
    return offlineNet(String(e));
  }
}

function createNetImpl(ctx) {
  const { game, engine, player } = ctx;
  const mode = pickMode(ctx.params);
  const sid = makeSid();

  // A "live" clock: wall time, but each frame can add at most 0.25 s, so a frozen or throttled page (or a manually
  // stepped capture run) doesn't suddenly think every remote went silent.
  let liveBase = performance.now() / 1000, lastTickWall = liveBase;
  const clock = () => liveBase + Math.min(0.25, Math.max(0, performance.now() / 1000 - lastTickWall));

  let nameOverride = null;
  const transport = mode === 'supabase' ? createSupabaseTransport({ url: SUPABASE_URL, key: SUPABASE_KEY })
    : mode === 'local' ? createLocalTransport({ clock }) : null;

  const live4 = W4 && !!transport; // wave-4 networking available
  let selfRide = null;
  const net = {
    online: false,
    room: 0,
    mode,
    id: sid,
    townSpirit: { doors: 0, helpers: 0 },
    /** Other players in your room (not you): [{id, name, style, door, x, z}] (+ ride {k, s} | null with ?w4). */
    players() {
      const out = [];
      try {
        for (const r of core.remotes.values()) {
          if (!r.present || r.stale || !r.buf.count) continue;
          const p = { id: r.id, name: r.name, style: r.style, door: r.door, x: Math.round(r.x * 100) / 100, z: Math.round(r.z * 100) / 100 };
          if (W4) p.ride = r.ride ? { k: r.ride.k, s: r.ride.s } : null;
          out.push(p);
        }
      } catch (e) { /* never throw */ }
      return out;
    },

    // ---------------------------------------------------------------- wave 4 (PLAY.md §Net API)
    /** The friend town you're in: {code, url, count} | null (public rooms). */
    get town() {
      try {
        const c = live4 ? core.town : null;
        return c ? { code: c, url: net.inviteUrl(c), count: core.state.online ? core.state.others + 1 : 1 } : null;
      } catch (e) { return null; }
    },
    /** A fresh random town code (6 chars of ABCDEFGHJKMNPQRSTUVWXYZ23456789). */
    newTownCode() {
      try {
        const a = new Uint32Array(6);
        crypto.getRandomValues(a);
        let i = 0;
        return makeTownCode(() => a[i++] / 4294967296);
      } catch (e) { return makeTownCode(); }
    },
    /** Leave the current room and join friends:CODE (true if the code is valid). Remembered for 12 h. */
    joinTown(code) {
      try {
        if (!live4) return false;
        const c = normTownCode(code);
        if (!c) return false;
        saveTown(c); setUrlTown(c);
        return core.setTown(c);
      } catch (e) { return false; }
    },
    /** Back to the public rooms. */
    leaveTown() {
      try {
        if (!live4) return false;
        saveTown(null); setUrlTown(null);
        return core.setTown(null);
      } catch (e) { return false; }
    },
    /** https://<this origin>/?town=CODE (the live site when running from a file). Defaults to the current town. */
    inviteUrl(code) {
      try {
        const c = normTownCode(code == null ? core.town : code);
        return c ? inviteOrigin() + '/?town=' + c : null;
      } catch (e) { return null; }
    },
    /** Broadcast a whitelisted message to your room (see PLAY.md); false if invalid, rate-limited or offline. */
    send(type, data) { try { return live4 ? core.send(type, data) : false; } catch (e) { return false; } },
    /** {ride: {k, s} | null} → presence (others see you seated on their copy of the ride). */
    setPresence(p) {
      try {
        if (!W4 || !p || typeof p !== 'object' || !('ride' in p)) return;
        const r = sanitizeRide(p.ride);
        if (JSON.stringify(r) === JSON.stringify(selfRide)) return;
        selfRide = r;
        core.selfChanged();
      } catch (e) { /* never throw */ }
    },
    /** Mute / unmute a player (their messages and bubbles are dropped; their doll is still drawn). Persisted. */
    mute(id, on = true) {
      try {
        if (!W4) return false;
        const ok = core.mute(id, !!on);
        if (on) bubbles.clear(id);
        return ok;
      } catch (e) { return false; }
    },
    isMuted(id) { try { return W4 && core.isMuted(id); } catch (e) { return false; } },
    /** Handle on a remote player's doll, or null: {x, z, y, h, visible, emote(e), bubble(text, ms), stagger(dx, dz), seat(pose|null)}. */
    doll(id) {
      try {
        if (!W4) return null;
        const r = core.remotes.get(id);
        if (!r || !r.present) return null;
        const at = () => view.dollPos(id);
        return {
          id,
          get x() { const p = at(); return p ? p.x : r.x; },
          get z() { const p = at(); return p ? p.z : r.z; },
          /** feet height of the drawn doll (seated riders sit above the ground), or null when not drawn */
          get y() { const p = at(); return p ? p.y : null; },
          get h() { const p = at(); return p ? p.h : r.h; },
          get visible() { return !!at(); },
          emote: (e) => { try { return view.emote(id, e); } catch (err) { return false; } },
          bubble: (text, ms) => { try { return !core.isMuted(id) && bubbles.show(id, text, ms); } catch (err) { return false; } },
          stagger: (dx, dz) => { try { return view.stagger(id, dx, dz); } catch (err) { return false; } },
          /** pose {x, y, z, h} = the doll's root (feet) in world space, as seatride's seatPos(); optional pose: 'stand'. */
          seat: (pose) => { try { return view.seat(id, pose); } catch (err) { return false; } },
        };
      } catch (e) { return null; }
    },
    /** Tap picking: client coordinates → remote player id under the finger (doll or name tag), or null. */
    dollAt(x, y) { try { return W4 ? view.pick(+x, +y, tags.top) : null; } catch (e) { return null; } },
    /** A speech bubble over your own doll (same style as the remotes'). */
    selfBubble(text, ms) { try { return W4 && bubbles.show(SELF_ID, text, ms, true); } catch (e) { return false; } },
    EMOTES, MSG_TYPES,
    /** Draw remote players on an arc round (x, z) facing it (the finale's gathering), local only. Returns release(). */
    gather(g) { try { return view.setGather(g); } catch (e) { return () => {}; } },
    /** Count a completed door towards Town Spirit (fire and forget; queued while offline; deduped). */
    recordDoor(n) { try { core.recordDoor(n); } catch (e) { /* never throw */ } },
    setStyle(style) {
      try {
        if (style && typeof style === 'object') game.state.style = { ...game.state.style, ...style };
        core.selfChanged();
      } catch (e) { /* never throw */ }
    },
    setName(name) {
      try { nameOverride = cleanName(name); core.selfChanged(); } catch (e) { /* never throw */ }
    },
    refreshSpirit() { try { core.refreshSpirit(); } catch (e) { /* never throw */ } },
    stats() { return { ...core.stats(), mode, online: net.online, others: core.state.others, ...view.stats(), tags: tags.count, ...(W4 ? { bubbles: bubbles.count } : {}) }; },
  };

  const emit = (evt, data) => {
    if (evt === 'status') {
      net.online = data.online; net.room = data.room;
      game.emit('net:status', { online: data.online, room: data.room, count: data.count, others: data.others });
    } else if (evt === 'spirit') {
      net.townSpirit = { doors: data.doors, helpers: data.helpers };
      game.emit('town:spirit', { doors: data.doors, helpers: data.helpers });
    } else if (evt === 'join') game.emit('net:join', { name: data.name, id: data.id });
    else if (evt === 'leave') {
      if (W4) { view.clearFx(data.id); bubbles.clear(data.id); }
      game.emit('net:leave', { name: data.name, id: data.id });
    } else if (evt === 'reset') {
      if (W4) { view.clearFx(); bubbles.clearExcept(SELF_ID); }
    } else if (evt === 'msg') game.emit('net:msg', data);
    else if (evt === 'presence') game.emit('net:presence', { id: data.id, ride: data.ride });
    else if (evt === 'town') {
      if (data.full) {
        saveTown(null); setUrlTown(null);
        game.emit('ui:toast', { text: 'That friend town is full, so you\'re in the big town', ms: 3500 });
      }
      game.emit('net:town', data.full ? { code: data.code, count: data.count, full: data.full } : { code: data.code, count: data.count });
    }
  };

  const getSelf = () => {
    let door = null;
    try { const d = ctx.progress && ctx.progress.current && ctx.progress.current(); if (Number.isInteger(d)) door = d; } catch (e) { /* stub */ }
    return { name: nameOverride || game.state.playerName || 'Traveller', style: game.state.style, door, ride: selfRide };
  };
  const core = createNetCore({
    w4: W4, town: W4 ? initialTown(ctx.params) : null,
    transport, sid, clock, emit, store, getSelf,
    getPlayerId: () => (ctx.progress ? ctx.progress.playerId : null),
    isHidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    styleOptions: STYLE_OPTIONS,
    log: console,
  });
  const cached = core.spirit;
  net.townSpirit = { doors: cached.doors, helpers: cached.helpers };

  const view = createDollView(ctx);
  const tags = createNameTags(ctx);
  const selfTag = createSelfTag(ctx, () => nameOverride || game.state.playerName);
  ctx.nameTag = { setVisible: (b) => selfTag.setVisible(b), get visible() { return selfTag.visible; } };
  const bubbles = W4 ? createBubbles(ctx) : { show: () => false, clear() {}, clearExcept() {}, update() {}, count: 0 };
  /** Speech bubbles hide whenever the name tags would (mini-games, finale, cinematics, the cottage). */
  const bubblesHidden = () => {
    const S = game.state;
    return S.phase !== 'play' || !!ctx.minigames?.active || !!ctx.house?.isOpen || !!ctx.cam?.shotActive || !!ctx.finale?.running;
  };
  const anchors = new Map();

  // ---------------------------------------------------------------- per frame
  let styleCheck = 0, lastStyleKey = '', lastDoor = null, warnedFrame = false;
  engine.addUpdate((dt) => {
    try {
      const now = performance.now() / 1000;
      const live = Math.min(0.25, Math.max(0, now - lastTickWall));
      liveBase += live; lastTickWall = now;
      if (transport && transport.tick) transport.tick();
      const self = { x: player.pos.x, z: player.pos.z, h: player.heading, s: player.speed };
      core.tick(self, live);
      // belt and braces: notice style / door changes even if nobody called setStyle
      if ((styleCheck += dt) > 1.5) {
        styleCheck = 0;
        const k = JSON.stringify(game.state.style);
        const door = getSelf().door;
        if (k !== lastStyleKey || door !== lastDoor) { lastStyleKey = k; lastDoor = door; core.selfChanged(); }
      }
      // up to 12 nearest remotes around what the camera is looking at
      const fx = engine.focus.x, fz = engine.focus.z;
      const wanted = [];
      for (const r of core.remotes.values()) {
        if (!r.present || r.stale || !r.buf.count) continue;
        const sp = W4 ? view.seatOf(r.id) : null, wx = sp ? sp.x : r.x, wz = sp ? sp.z : r.z;
        wanted.push({ id: r.id, name: r.name, style: r.style, styleKey: r.styleKey, x: r.x, z: r.z, h: r.h, s: r.s, dist: Math.hypot(wx - fx, wz - fz) });
      }
      wanted.sort((a, b) => a.dist - b.dist);
      if (wanted.length > MAX_DOLLS) wanted.length = MAX_DOLLS;
      view.update(dt, wanted);
    } catch (e) {
      if (!warnedFrame) { warnedFrame = true; console.warn('[net] frame update error (further ones are silent):', e); }
    }
  }, 50);
  engine.addUpdate((dt) => { // after the camera moved (order 100), so tags face this frame's view
    try {
      const list = view.visible(), me = selfTag.entry(dt);
      if (me) list.push(me);
      tags.update(list);
      if (W4 && bubbles.count) {
        anchors.clear();
        for (const t of list) {
          if (t.id !== SELF_ID && core.isMuted(t.id)) continue;
          const tp = tags.top(t.id);
          anchors.set(t.id, tp ? { x: tp.x, y: tp.y, z: tp.z, k: tp.k } : { x: t.x, y: t.y + 0.8, z: t.z, k: t.k });
        }
        bubbles.update(anchors, bubblesHidden());
      }
    } catch (e) { /* never break the frame */ }
  }, 110);

  // ---------------------------------------------------------------- game events
  game.on('game:start', (d) => {
    if (d && d.name) nameOverride = null;
    core.setTracking(true);
    core.selfChanged();
  });
  game.on('door:complete', (d) => { if (d && Number.isInteger(+d.n)) net.recordDoor(+d.n); core.selfChanged(); });
  game.on('door:open', () => core.selfChanged());
  if (game.state.phase && game.state.phase !== 'entry') core.setTracking(true);

  // ---------------------------------------------------------------- tab visibility
  let hiddenTimer = null;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.visibilityState === 'hidden') {
          clearTimeout(hiddenTimer);
          hiddenTimer = setTimeout(() => core.pause(), 30000); // sending already stops: no frames while hidden
        } else {
          clearTimeout(hiddenTimer); hiddenTimer = null;
          core.resume();
        }
      } catch (e) { /* never throw */ }
    });
    window.addEventListener('pagehide', () => { try { if (transport && transport.leaveAll) transport.leaveAll(); } catch (e) { /* ignore */ } });
  }

  if (mode === 'off') console.info('[net] networking off' + (ctx.params && ctx.params.has('capture') ? ' (capture mode; add &net=local or &net=supabase)' : ''));
  core.start();
  net._core = core; // debugging / tests
  net._tuning = TUNING;
  return net;
}
