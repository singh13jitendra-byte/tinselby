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
import { SUPABASE_URL, SUPABASE_KEY } from '../core/net-config.js';
import { cleanName } from '../core/names.js';
import { STYLE_OPTIONS } from '../core/player.js';
import { createNetCore, TUNING } from './core.js';
import { createSupabaseTransport, createLocalTransport } from './transport.js';
import { createDollView, MAX_DOLLS } from './dolls.js';
import { createNameTags } from './tags.js';
import { createSelfTag } from './selftag.js';

const STORE_KEY = 'tinselby.net.v1';

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
  };
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
  const sid = makeId();

  // A "live" clock: wall time, but each frame can add at most 0.25 s, so a frozen or throttled page (or a manually
  // stepped capture run) doesn't suddenly think every remote went silent.
  let liveBase = performance.now() / 1000, lastTickWall = liveBase;
  const clock = () => liveBase + Math.min(0.25, Math.max(0, performance.now() / 1000 - lastTickWall));

  let nameOverride = null;
  const transport = mode === 'supabase' ? createSupabaseTransport({ url: SUPABASE_URL, key: SUPABASE_KEY })
    : mode === 'local' ? createLocalTransport({ clock }) : null;

  const net = {
    online: false,
    room: 0,
    mode,
    id: sid,
    townSpirit: { doors: 0, helpers: 0 },
    /** Other players in your room (not you): [{id, name, style, door, x, z}]. */
    players() {
      const out = [];
      try {
        for (const r of core.remotes.values()) {
          if (r.present && !r.stale && r.buf.count) out.push({ id: r.id, name: r.name, style: r.style, door: r.door, x: Math.round(r.x * 100) / 100, z: Math.round(r.z * 100) / 100 });
        }
      } catch (e) { /* never throw */ }
      return out;
    },
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
    stats() { return { ...core.stats(), mode, online: net.online, others: core.state.others, ...view.stats(), tags: tags.count }; },
  };

  const emit = (evt, data) => {
    if (evt === 'status') {
      net.online = data.online; net.room = data.room;
      game.emit('net:status', { online: data.online, room: data.room, count: data.count, others: data.others });
    } else if (evt === 'spirit') {
      net.townSpirit = { doors: data.doors, helpers: data.helpers };
      game.emit('town:spirit', { doors: data.doors, helpers: data.helpers });
    } else if (evt === 'join') game.emit('net:join', { name: data.name, id: data.id });
    else if (evt === 'leave') game.emit('net:leave', { name: data.name, id: data.id });
  };

  const getSelf = () => {
    let door = null;
    try { const d = ctx.progress && ctx.progress.current && ctx.progress.current(); if (Number.isInteger(d)) door = d; } catch (e) { /* stub */ }
    return { name: nameOverride || game.state.playerName || 'Traveller', style: game.state.style, door };
  };
  const core = createNetCore({
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
        wanted.push({ id: r.id, name: r.name, style: r.style, styleKey: r.styleKey, x: r.x, z: r.z, h: r.h, s: r.s, dist: Math.hypot(r.x - fx, r.z - fz) });
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
