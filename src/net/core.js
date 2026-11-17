// Multiplayer core: rooms, presence, position snapshots, Town Spirit. No three.js / DOM here, so it runs in node tests.
// The transport (./transport.js) hides Supabase Realtime vs. the local BroadcastChannel mock behind one interface:
//   transport.join(topic, presenceKey, {status(s, info), presence(list), pos(payload)}) → room {track(meta), send(event, payload), leave(), tick?()}
//   transport.rpc(fn, args) → Promise<{data, error}>, transport.disconnect?()
import { cleanName } from '../core/names.js';

/** Tunables. Supabase Free allows ~100 Realtime messages/s per project (each delivery counts), so send rates
 *  scale down with room size: per-room traffic ≈ n² × hz ≤ roomMsgBudget. Raise roomMsgBudget on a paid plan. */
export const TUNING = {
  roomCap: 25, // join the lowest room with fewer than this many other players
  maxRooms: 40,
  moveHz: 8, idleHz: 1, // nominal send rates (moving / standing still)
  minMoveHz: 1.5, minIdleHz: 0.25, // floors when a room is busy (idle floor stays well inside staleSec)
  roomMsgBudget: 90,
  staleSec: 20, // hide a remote after this long without any message
  spiritEverySec: 30,
  backoffBaseSec: 2, backoffMaxSec: 60, // realtime reconnect backoff
  spiritBackoffMaxSec: 300,
  syncWaitSec: 1.5, // settle a room join even if no presence sync arrived
  trackDebounceSec: 0.35,
};

const TELEPORT = 4; // a jump larger than this (units) snaps instead of interpolating
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, k) => a + wrap(b - a) * k;

// ------------------------------------------------------------------ payloads
/** Compact position packet: {id, x, z, h, s}, numbers rounded to 2 decimals. */
export function encodePos(id, x, z, h, s) {
  return { id, x: r2(x), z: r2(z), h: r2(wrap(h || 0)), s: r2(clamp(s || 0, 0, 20)) };
}
export function decodePos(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || p.id.length > 64) return null;
  const x = +p.x, z = +p.z, h = +p.h, s = +p.s;
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 300 || Math.abs(z) > 300) return null;
  return { id: p.id, x, z, h: Number.isFinite(h) ? wrap(h) : 0, s: Number.isFinite(s) ? clamp(s, 0, 20) : 0 };
}

/**
 * Keep every style key (the wardrobe grows over time), but only plain, short values. For slots that STYLE_OPTIONS
 * knows (coat / hat / scarf …) the value must be one of its keys or a #hex colour, so a bad packet can't make
 * buildCharacter warn about unknown colours.
 */
export function sanitizeStyle(style, options = null) {
  const out = {};
  if (!style || typeof style !== 'object' || Array.isArray(style)) return out;
  let n = 0;
  for (const k of Object.keys(style)) {
    if (n >= 16) break;
    if (!/^[A-Za-z][\w-]{0,23}$/.test(k)) continue;
    const v = style[k];
    if (typeof v === 'string') {
      if (!/^[#\w-]{1,32}$/.test(v)) continue;
      const opts = options && options[k];
      if (opts && typeof opts === 'object' && !(v in opts) && !/^#[0-9a-f]{3,8}$/i.test(v)) continue;
      out[k] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === 'boolean') out[k] = v;
    else continue;
    n++;
  }
  return out;
}

/** Presence payload {id, name, style, door} → sanitised copy (null if unusable). */
export function sanitizeMeta(meta, key, styleOptions = null) {
  if (!meta || typeof meta !== 'object') return null;
  const id = typeof meta.id === 'string' && meta.id && meta.id.length <= 64 ? meta.id : typeof key === 'string' && key ? key.slice(0, 64) : null;
  if (!id) return null;
  const door = Number.isInteger(meta.door) && meta.door >= 1 && meta.door <= 24 ? meta.door : null;
  return { id, name: cleanName(meta.name), style: sanitizeStyle(meta.style, styleOptions), door };
}

/** Room decision after the first presence sync: stay, or the next room number to try. */
export function nextRoom(room, others, tuning = TUNING) {
  return others >= tuning.roomCap && room < tuning.maxRooms ? room + 1 : room;
}

/** Send rates for a room of n players (including you): keeps n² × hz near the budget, within [min, nominal]. */
export function sendRates(n, tuning = TUNING) {
  const k = tuning.roomMsgBudget / Math.max(1, n * n);
  return { move: clamp(k, tuning.minMoveHz, tuning.moveHz), idle: clamp(k, tuning.minIdleHz, tuning.idleHz) };
}

// ------------------------------------------------------------------ snapshot interpolation
/**
 * Per-remote snapshot buffer. Snapshots are stamped with the local receive time; rendering runs ~150 ms behind
 * (more when the sender is rate-limited: delay follows the measured packet interval), with a short extrapolation.
 */
export class SnapBuffer {
  constructor(max = 12) { this.s = []; this.max = max; this.ema = 0.125; this.rt = null; this.out = { x: 0, z: 0, h: 0, s: 0 }; }
  get count() { return this.s.length; }
  get last() { return this.s.length ? this.s[this.s.length - 1] : null; }
  push(t, x, z, h, s) {
    const L = this.last;
    if (L) {
      if (t <= L.t) t = L.t + 0.001;
      if (Math.hypot(x - L.x, z - L.z) > TELEPORT) { this.s.length = 0; this.rt = null; } // teleport / cable car: snap
      else if (L.s > 0.08 || s > 0.08) this.ema += (Math.min(t - L.t, 1.2) - this.ema) * 0.25; // idle gaps don't count
    }
    this.s.push({ t, x, z, h, s });
    if (this.s.length > this.max) this.s.shift();
  }
  delay() { return clamp(this.ema * 1.2, 0.15, 1.0); }
  /** Advance this buffer's render clock by dt (same clock as `now`) and return the interpolated state. */
  sample(now, dt) {
    const S = this.s, o = this.out;
    if (!S.length) return null;
    const target = now - this.delay();
    if (this.rt === null || Math.abs(target - this.rt) > 1.5) this.rt = target;
    else this.rt += dt + (target - this.rt) * Math.min(1, dt * 2.5); // drift gently toward the target delay
    const t = this.rt;
    if (t <= S[0].t || S.length === 1) { const a = S[0]; o.x = a.x; o.z = a.z; o.h = a.h; o.s = S.length === 1 ? a.s : 0; return o; }
    for (let i = S.length - 1; i > 0; i--) {
      const a = S[i - 1], b = S[i];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / Math.max(1e-4, b.t - a.t);
        o.x = a.x + (b.x - a.x) * k; o.z = a.z + (b.z - a.z) * k; o.h = lerpAngle(a.h, b.h, k); o.s = a.s + (b.s - a.s) * k;
        return o;
      }
    }
    // newer than the newest snapshot: extrapolate a little while moving, then hold
    const b = S[S.length - 1], a = S[S.length - 2];
    const ex = Math.min(t - b.t, 0.2), span = Math.max(0.03, b.t - a.t);
    let vx = (b.x - a.x) / span, vz = (b.z - a.z) / span;
    const v = Math.hypot(vx, vz), vmax = Math.min(4, b.s * 1.1); // arrival spacing is jittery: trust the sender's speed
    if (v > vmax) { const k = vmax / Math.max(v, 1e-6); vx *= k; vz *= k; }
    const mv = b.s > 0.08 ? ex : 0;
    o.x = b.x + vx * mv; o.z = b.z + vz * mv; o.h = b.h; o.s = b.s;
    return o;
  }
}

// ------------------------------------------------------------------ the core
/**
 * @param o.transport  transport (or null = offline)
 * @param o.sid        this tab's id (presence key + pos id)
 * @param o.clock      () → seconds (monotonic "live" clock)
 * @param o.getSelf    () → {name, style, door} for presence
 * @param o.getPlayerId () → progress.playerId (uuid) for open_door
 * @param o.emit       (evt, data) → void   ('status' | 'join' | 'leave' | 'spirit' | 'reset')
 * @param o.store      {load() → obj|null, save(obj)} persistence for spirit cache and door queue
 * @param o.isHidden   () → bool
 * @param o.styleOptions STYLE_OPTIONS (for value checks)
 */
export function createNetCore(o) {
  const T = { ...TUNING, ...(o.tuning || {}) };
  const { transport, sid, clock } = o;
  const log = o.log || console;
  const emit = o.emit || (() => {});
  const isHidden = o.isHidden || (() => false);
  const kind = transport ? transport.kind : 'off';

  const saved = safe(() => o.store && o.store.load(), null) || {};
  const st = { online: false, room: 0, status: transport ? 'idle' : 'off', others: 0 };
  const spirit = { doors: num(saved.spirit && saved.spirit.doors), helpers: num(saved.spirit && saved.spirit.helpers) };
  const sentDoors = new Set(Array.isArray(saved.sent) ? saved.sent.filter((s) => typeof s === 'string') : []);
  const pendingDoors = new Set(Array.isArray(saved.pending) ? saved.pending.filter((n) => Number.isInteger(n) && n >= 1 && n <= 24) : []);
  const remotes = new Map();

  let room = null, gen = 0, joined = false, settled = false, stash = null;
  let tracking = false, paused = false, stopped = false;
  let failures = 0, retryTimer = null, syncTimer = null, trackTimer = null, lastTrackedKey = '';
  let lastSent = -1e9, lastMoving = false, lastX = 0, lastZ = 0, sentCount = 0, recvCount = 0;
  let spiritTimer = null, spiritBusy = false, spiritFails = 0, flushBusy = false;

  function persist() {
    safe(() => o.store && o.store.save({ spirit: { ...spirit }, sent: [...sentDoors].slice(-200), pending: [...pendingDoors] }));
  }
  function emitStatus() { emit('status', { online: st.online, room: st.room, count: st.online ? st.others + 1 : 1, others: st.others, mode: kind }); }

  // ---------------------------------------------------------------- rooms
  function join(n) {
    if (!transport || stopped || paused) return;
    clearTimeout(retryTimer); retryTimer = null;
    clearTimeout(syncTimer); syncTimer = null;
    const g = ++gen;
    joined = false; settled = false; stash = null; lastTrackedKey = '';
    st.room = n; st.status = 'joining';
    try {
      room = transport.join('town:' + n, sid, {
        status: (s, info) => { if (g === gen) onStatus(s, info); },
        presence: (list) => { if (g === gen) onPresence(list); },
        pos: (p) => { if (g === gen) onPos(p); },
      });
    } catch (e) { fail('join failed: ' + msg(e)); }
  }
  function leaveRoom() {
    const r = room;
    room = null; gen++; joined = false; settled = false;
    clearTimeout(syncTimer); syncTimer = null;
    if (r) safe(() => Promise.resolve(r.leave()).catch(() => {}));
  }
  function onStatus(s, info) {
    if (s === 'joined') {
      if (joined) return; // a rejoin after a socket blip reports SUBSCRIBED again
      joined = true;
      if (stash) { const l = stash; stash = null; onPresence(l); }
      else syncTimer = setTimeout(() => { if (joined && !settled) onPresence([]); }, T.syncWaitSec * 1000);
    } else if (s === 'error' || s === 'closed') fail(info || s);
  }
  function onPresence(list) {
    if (!joined) { stash = list; return; }
    const others = new Map();
    for (const it of Array.isArray(list) ? list : []) {
      const m = sanitizeMeta(it && it.meta, it && it.key, o.styleOptions);
      if (m && m.id !== sid) others.set(m.id, m);
    }
    if (!settled) {
      clearTimeout(syncTimer); syncTimer = null;
      const next = nextRoom(st.room, others.size, T);
      if (next !== st.room) {
        log.info(`[net] town:${st.room} is full (${others.size} players); trying town:${next}`);
        leaveRoom();
        join(next);
        return;
      }
      settled = true; failures = 0;
      st.online = true; st.status = 'online';
      log.info(`[net] connected to town:${st.room} via ${kind} (${others.size} other player${others.size === 1 ? '' : 's'} here)`);
      applyPresence(others, true);
      if (tracking) track();
      emitStatus();
      flushDoors();
      return;
    }
    applyPresence(others, false);
  }
  function applyPresence(others, initial) {
    const now = clock();
    for (const [id, m] of others) {
      let r = remotes.get(id);
      if (!r) remotes.set(id, (r = newRemote(id)));
      const was = r.present;
      r.present = true; r.leftAt = 0;
      const key = JSON.stringify(m.style);
      if (key !== r.styleKey) { r.style = m.style; r.styleKey = key; }
      r.name = m.name; r.door = m.door;
      if (!was) { r.lastSeen = now; r.stale = false; if (!initial) emit('join', { id, name: r.name }); }
    }
    for (const r of remotes.values()) {
      if (r.present && !others.has(r.id)) { r.present = false; r.leftAt = now; emit('leave', { id: r.id, name: r.name }); }
    }
    const n = others.size;
    if (n !== st.others) { st.others = n; emitStatus(); }
  }
  function newRemote(id) {
    return { id, name: 'Traveller', style: {}, styleKey: '{}', door: null, present: false, stale: false, lastSeen: clock(), leftAt: 0, buf: new SnapBuffer(), x: 0, z: 0, h: 0, s: 0 };
  }
  function onPos(p) {
    const d = decodePos(p);
    if (!d || d.id === sid) return;
    recvCount++;
    let r = remotes.get(d.id);
    if (!r) remotes.set(d.id, (r = newRemote(d.id)));
    const now = clock();
    r.buf.push(now, d.x, d.z, d.h, d.s);
    r.lastSeen = now; r.stale = false;
  }
  function fail(info) {
    if (stopped) return;
    const wasOnline = st.online;
    leaveRoom();
    safe(() => transport && transport.disconnect && Promise.resolve(transport.disconnect()).catch(() => {}));
    clearRemotes();
    st.online = false; st.others = 0; st.status = 'offline';
    if (wasOnline || failures === 0) emitStatus();
    if (paused) return;
    const delay = Math.min(T.backoffMaxSec, T.backoffBaseSec * 2 ** failures) * (0.8 + Math.random() * 0.4);
    failures = Math.min(failures + 1, 10);
    log.warn(`[net] ${kind} realtime unavailable (${String(info).slice(0, 160)}); retrying in ${Math.round(delay)} s`);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; join(1); }, delay * 1000);
  }
  function clearRemotes() {
    if (remotes.size) { remotes.clear(); emit('reset', {}); }
  }

  // ---------------------------------------------------------------- presence (self)
  function track() {
    if (!room || !settled || !tracking) return;
    const self = safe(() => o.getSelf(), null) || {};
    const meta = { id: sid, name: cleanName(self.name), style: sanitizeStyle(self.style, o.styleOptions), door: Number.isInteger(self.door) ? self.door : null };
    const key = JSON.stringify(meta);
    if (key === lastTrackedKey) return;
    lastTrackedKey = key;
    safe(() => Promise.resolve(room.track(meta)).catch(() => {}));
  }
  function selfChanged() {
    if (trackTimer) return;
    trackTimer = setTimeout(() => { trackTimer = null; track(); }, T.trackDebounceSec * 1000);
  }

  // ---------------------------------------------------------------- per-frame
  function tick(self, dtLive) {
    const now = clock();
    for (const r of remotes.values()) {
      if (!r.stale && now - r.lastSeen > T.staleSec) r.stale = true;
      if (!r.present && (r.leftAt ? now - r.leftAt > 3 : r.stale)) { remotes.delete(r.id); continue; }
      if (r.present && !r.stale && r.buf.count) {
        const v = r.buf.sample(now, dtLive || 0);
        if (v) { r.x = v.x; r.z = v.z; r.h = v.h; r.s = v.s; }
      }
    }
    if (!self || !room || !settled || !tracking || paused || !st.online || isHidden()) return;
    const rates = sendRates(st.others + 1, T);
    const moving = self.s > 0.08;
    const jumped = Math.hypot(self.x - lastX, self.z - lastZ) > 2;
    const interval = 1 / (moving ? rates.move : rates.idle);
    if (moving !== lastMoving || jumped || now - lastSent >= interval) {
      const ok = safe(() => room.send('pos', encodePos(sid, self.x, self.z, self.h, moving ? self.s : 0)), false);
      if (ok) { lastSent = now; lastMoving = moving; lastX = self.x; lastZ = self.z; sentCount++; }
    }
  }

  // ---------------------------------------------------------------- Town Spirit
  function setSpirit(doors, helpers) {
    const d = Math.max(0, Math.floor(num(doors))), h = Math.max(0, Math.floor(num(helpers)));
    if (d === spirit.doors && h === spirit.helpers) return false;
    spirit.doors = d; spirit.helpers = h;
    persist();
    emit('spirit', { doors: d, helpers: h });
    return true;
  }
  function scheduleSpirit(sec) {
    clearTimeout(spiritTimer);
    if (stopped || !transport) return;
    spiritTimer = setTimeout(refreshSpirit, sec * 1000);
  }
  async function refreshSpirit() {
    if (!transport || stopped) return;
    if (spiritBusy) return;
    if (isHidden()) { scheduleSpirit(T.spiritEverySec); return; }
    spiritBusy = true;
    try {
      const res = await transport.rpc('town_spirit');
      if (!res || res.error) throw new Error(res && res.error ? res.error.message || String(res.error) : 'no response');
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!row || !Number.isFinite(+row.doors)) throw new Error('unexpected town_spirit result');
      const first = spiritFails === -1;
      spiritFails = 0;
      if (!setSpirit(row.doors, row.helpers) && first) emit('spirit', { ...spirit });
      scheduleSpirit(T.spiritEverySec);
      flushDoors();
    } catch (e) {
      const delay = Math.min(T.spiritBackoffMaxSec, T.spiritEverySec * 2 ** Math.max(0, spiritFails));
      spiritFails = Math.max(0, spiritFails) + 1;
      log.warn(`[net] town spirit unavailable (${msg(e)}); retrying in ${Math.round(delay)} s`);
      scheduleSpirit(delay);
    } finally { spiritBusy = false; }
  }
  spiritFails = -1; // marks the first fetch, which always emits town:spirit

  function recordDoor(n) {
    n = Math.floor(+n);
    if (!(n >= 1 && n <= 24)) return;
    const pid = safe(() => o.getPlayerId(), null);
    if (isUuid(pid) && sentDoors.has(pid + ':' + n)) return;
    if (pendingDoors.has(n)) return;
    pendingDoors.add(n);
    persist();
    flushDoors();
  }
  async function flushDoors() {
    if (!transport || flushBusy || !pendingDoors.size || stopped) return;
    const pid = safe(() => o.getPlayerId(), null);
    if (!isUuid(pid)) return; // progress not ready (stub) yet: keep the queue
    flushBusy = true;
    let ok = 0;
    try {
      for (const n of [...pendingDoors]) {
        if (sentDoors.has(pid + ':' + n)) { pendingDoors.delete(n); continue; }
        const res = await transport.rpc('open_door', { p_player: pid, p_door: n });
        if (!res || res.error) throw new Error(res && res.error ? res.error.message || String(res.error) : 'no response');
        pendingDoors.delete(n); sentDoors.add(pid + ':' + n); ok++;
        const total = num(Array.isArray(res.data) ? res.data[0] : res.data);
        if (total > spirit.doors) setSpirit(total, Math.max(spirit.helpers, 1));
      }
    } catch (e) {
      log.warn(`[net] open_door failed (${msg(e)}); will retry with the next Town Spirit refresh`);
    } finally {
      flushBusy = false;
      persist();
      if (ok) scheduleSpirit(1.5); // refresh helpers soon
    }
  }

  // ---------------------------------------------------------------- lifecycle
  return {
    kind, sid, state: st, remotes, spirit,
    get tuning() { return T; },
    start() {
      if (!transport) return;
      stopped = false;
      join(1);
      refreshSpirit();
    },
    stop() {
      stopped = true;
      clearTimeout(retryTimer); clearTimeout(spiritTimer); clearTimeout(trackTimer); trackTimer = null;
      leaveRoom(); clearRemotes();
      st.online = false; st.others = 0; st.status = 'stopped';
    },
    /** Tab hidden for a while: leave the room (frees a Realtime connection); resume() rejoins. */
    pause() {
      if (paused || !transport) return;
      paused = true;
      clearTimeout(retryTimer); retryTimer = null;
      const was = st.online;
      leaveRoom();
      safe(() => transport.disconnect && Promise.resolve(transport.disconnect()).catch(() => {}));
      clearRemotes();
      st.online = false; st.others = 0; st.status = 'paused';
      if (was) emitStatus();
    },
    resume() {
      if (!paused) return;
      paused = false; failures = 0;
      join(1);
      refreshSpirit();
    },
    get paused() { return paused; },
    setTracking(on) { tracking = !!on; if (tracking) track(); },
    get tracking() { return tracking; },
    selfChanged,
    tick,
    refreshSpirit,
    recordDoor,
    stats() { return { sent: sentCount, recv: recvCount, room: st.room, status: st.status, failures, pendingDoors: [...pendingDoors] }; },
  };
}

function num(v) { const n = +v; return Number.isFinite(n) ? n : 0; }
function msg(e) { return (e && (e.message || e.toString && e.toString())) || String(e); }
function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
