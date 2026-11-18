import { WISH_REWARDS } from './doors.js';
// Save file: localStorage key `tinselby.save.v1`, versioned JSON. Every read/write is guarded (private mode, quota,
// corrupt JSON, hand-edited values): a bad save never breaks the game, it just starts fresh.
export const SAVE_KEY = 'tinselby.save.v1';
export const SAVE_VERSION = 1;

export function uuid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* insecure context */ }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0; }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function blankSave() {
  const now = Date.now();
  return {
    v: SAVE_VERSION,
    playerId: uuid(),
    created: now,
    updated: now,
    profile: { name: '', style: null },
    doors: {}, // n → { stars, score, at }
    rewards: [], // reward ids
    best: {}, // gameId → { score, stars, plays }
    daily: { last: '', streak: 0, claims: 0 },
    house: null, // wave 2: { wreath, lights, door, snowman } (option keys), null until the player decorates
    wave: 8, // highest available door the player has been told about (new saves: progress sets lastAvailable())
    wish: null, // wave 3: id of the wish piece picked at door 22 (one of WISH_REWARDS), Santa brings it in the finale
    flags: [], // wave 3: one-time card flags ('eve-card', 'xmas-card'), ≤ 32 entries /^[a-z0-9-]{1,24}$/
    eveWatched: 0, // wave 3: how many times the Christmas Eve finale reached its end card
  };
}

/** House style keys (WAVE2.md §Doors agent): only these four, each value /^[a-z]{1,12}$/, anything else is dropped. */
export const HOUSE_KEYS = ['wreath', 'lights', 'door', 'snowman'];
export function cleanHouse(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k of HOUSE_KEYS) if (typeof v[k] === 'string' && /^[a-z]{1,12}$/.test(v[k])) out[k] = v[k];
  return Object.keys(out).length ? out : null;
}

export const FLAG_RE = /^[a-z0-9-]{1,24}$/;
export const MAX_FLAGS = 32;
export const isWishId = (id) => typeof id === 'string' && WISH_REWARDS.some((r) => r.id === id);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const int = (v, d = 0) => (Number.isFinite(+v) ? Math.floor(+v) : d);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Turn whatever was stored into a valid save (unknown / broken fields fall back to defaults). */
export function normalize(raw) {
  const s = blankSave();
  if (!isObj(raw)) return s;
  // future migrations: if (raw.v === 1) … ; newer versions are read field by field like v1
  if (typeof raw.playerId === 'string' && /^[0-9a-f-]{16,64}$/i.test(raw.playerId)) s.playerId = raw.playerId;
  s.created = int(raw.created, s.created);
  s.updated = int(raw.updated, s.updated);
  if (isObj(raw.profile)) {
    if (typeof raw.profile.name === 'string') s.profile.name = raw.profile.name.slice(0, 24);
    if (isObj(raw.profile.style)) {
      const st = {};
      for (const [k, v] of Object.entries(raw.profile.style)) if (typeof v === 'string' && v.length < 40) st[k] = v;
      s.profile.style = st;
    }
  }
  if (isObj(raw.doors)) for (const [k, v] of Object.entries(raw.doors)) {
    const n = int(k, -1);
    if (n < 1 || n > 24 || !(v === true || isObj(v))) continue;
    s.doors[n] = { stars: Math.max(0, Math.min(3, int(v.stars, 1))), score: num(v.score, 0), at: int(v.at, 0) };
  }
  if (Array.isArray(raw.rewards)) s.rewards = [...new Set(raw.rewards.filter((r) => typeof r === 'string' && r.length < 40))];
  if (isObj(raw.best)) for (const [k, v] of Object.entries(raw.best)) {
    if (!isObj(v) || k.length > 24) continue;
    s.best[k] = { score: num(v.score, 0), stars: Math.max(0, Math.min(3, int(v.stars, 0))), plays: Math.max(0, int(v.plays, 0)) };
  }
  if (isObj(raw.daily)) {
    if (typeof raw.daily.last === 'string' && DAY.test(raw.daily.last)) s.daily.last = raw.daily.last;
    s.daily.streak = Math.max(0, int(raw.daily.streak, 0));
    s.daily.claims = Math.max(0, int(raw.daily.claims, 0));
  }
  s.house = cleanHouse(raw.house);
  // saves from before wave 2 have no `wave`: they were told about doors 1–8
  s.wave = raw.wave === undefined || !Number.isFinite(+raw.wave) ? 8 : Math.max(0, Math.min(24, int(raw.wave, 8)));
  s.wish = isWishId(raw.wish) ? raw.wish : null;
  if (Array.isArray(raw.flags)) s.flags = [...new Set(raw.flags.filter((f) => typeof f === 'string' && FLAG_RE.test(f)))].slice(0, MAX_FLAGS);
  s.eveWatched = Math.max(0, Math.min(9999, int(raw.eveWatched, 0)));
  return s;
}

/** localStorage-like store (window.localStorage when usable, else an in-memory map). */
export function defaultStorage() {
  try {
    const ls = window.localStorage;
    const k = '__tinselby_probe';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch (e) {
    return memoryStorage();
  }
}
export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

export function load(storage, key = SAVE_KEY) {
  let raw = null;
  try { raw = storage.getItem(key); } catch (e) { return { save: blankSave(), fresh: true }; }
  if (!raw) return { save: blankSave(), fresh: true };
  try { return { save: normalize(JSON.parse(raw)), fresh: false }; } catch (e) {
    return { save: blankSave(), fresh: true, corrupt: true };
  }
}

export function store(storage, save, key = SAVE_KEY) {
  try { storage.setItem(key, JSON.stringify(save)); return true; } catch (e) { return false; }
}

export function wipe(storage, key = SAVE_KEY) {
  try { storage.removeItem(key); } catch (e) { /* ignore */ }
}

/** Local calendar day as YYYY-MM-DD (the player's own time zone). */
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** The local day before `key`. */
export function prevDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12));
}
