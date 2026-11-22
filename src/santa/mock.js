// In-memory Secret Santa backend for tests (PHASE3.md §Client side): the same RPCs, names, arguments, result shapes and
// error codes as the Supabase functions, shared between the tabs of one browser through a BroadcastChannel.
// Used with ?santa=mock, and automatically under ?net=local (no server there).
//
//   createSantaMock({ now: () => ms }) → { rpc(fn, args) → Promise<{data, error}>, reset(), dump() }
//
// Sharing: every tab keeps a full copy {ver, by, groups, secrets, cancelled}; a change bumps ver and posts the whole copy;
// a newly opened tab asks 'who' and takes the newest copy it hears (ties: the higher tab id). Calls wait for that first
// sync (≤ 300 ms). The draw is deterministic (seeded by town + members), so two tabs drawing at once agree.
// p_now (santa_status) is honoured for every town here (the server only does that for QQ… test towns).
import { cleanName as clean } from '../core/names.js';

export const CLOSE_AT = '2026-12-20T18:30:00Z'; // 21 Dec 00:00 IST: sign-ups close, names are drawn
export const REVEAL_AT = '2026-12-24T18:30:00Z'; // 25 Dec 00:00 IST: presents open
const CLOSE_MS = Date.parse(CLOSE_AT), REVEAL_MS = Date.parse(REVEAL_AT);
const MAX = 16, MIN_DRAW = 3, SEASON = 2026;
const TOWN_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/; // as the server (no I L O 0 1)
const UUID_RE = /^[0-9a-f-]{16,64}$/i;
const ITEM_RE = /^[a-z]+\.[a-z0-9]+$/;

const clone = (o) => JSON.parse(JSON.stringify(o));
function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cleanName = (n) => clean(n, 'Friend');

export function createSantaMock({ now = () => Date.now(), channel = 'tinselby-santa-mock' } = {}) {
  const tab = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let db = { ver: 0, by: '', groups: {}, secrets: {}, cancelled: {} };
  let bc = null;
  try { bc = new BroadcastChannel(channel); } catch (e) { bc = null; }
  let synced = !bc, resolveSync = null;
  const ready = synced ? Promise.resolve() : new Promise((r) => { resolveSync = r; setTimeout(() => { synced = true; r(); }, 300); });
  const newer = (m) => m.ver > db.ver || (m.ver === db.ver && String(m.by) > String(db.by));
  if (bc) {
    bc.onmessage = (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'who') { if (db.ver > 0) bc.postMessage({ t: 'db', db }); }
      else if (m.t === 'db' && m.db && typeof m.db.ver === 'number') {
        if (newer(m.db)) db = clone(m.db);
        if (!synced) { synced = true; resolveSync?.(); }
      }
    };
    try { bc.postMessage({ t: 'who' }); } catch (e) { /* closed */ }
  }
  function commit() {
    db.ver += 1; db.by = tab;
    try { bc?.postMessage({ t: 'db', db }); } catch (e) { /* closed */ }
  }

  const fail = (code) => ({ data: null, error: { message: code, code: 'P0001', details: null, hint: null } });
  const member = (g, p) => (g ? g.members.find((m) => m.p === p) || null : null);
  const nameOf = (g, p) => member(g, p)?.name || null;

  function draw(g, town) {
    const ids = g.members.map((m) => m.p).sort();
    const r = rng(hash32(town + '|' + ids.join(',') + '|' + g.created));
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    g.match = {};
    for (let i = 0; i < ids.length; i++) g.match[ids[i]] = ids[(i + 1) % ids.length]; // one cycle: nobody draws themselves
    g.drawn = true; g.drawnAt = new Date(now()).toISOString();
  }
  /** Lazy close: past close_at an open group is drawn (≥ 3) or cancelled. Returns true if it changed anything. */
  function lazyClose(town, t) {
    const g = db.groups[town];
    if (!g || g.drawn || t < CLOSE_MS) return false;
    if (g.members.length >= MIN_DRAW) draw(g, town);
    else { delete db.groups[town]; db.cancelled[town] = true; }
    return true;
  }
  function status(town, p, t) {
    const g = db.groups[town];
    const base = { state: 'none', close_at: CLOSE_AT, reveal_at: REVEAL_AT, starter: null, count: 0, members: [], joined: false, is_starter: false, my_match: null, my_gift: null, gifts: [], late: false };
    if (!g) return { ...base, cancelled: !!db.cancelled[town] };
    const state = !g.drawn ? 'open' : t >= REVEAL_MS ? 'revealed' : 'drawn';
    const me = member(g, p);
    return {
      ...base, state,
      starter: nameOf(g, g.starter),
      count: g.members.length,
      members: g.members.map((m) => m.name),
      joined: !!me,
      is_starter: g.starter === p,
      my_match: g.drawn && me ? nameOf(g, g.match[p]) : null,
      my_gift: me ? g.gifts[p] || null : null,
      gifts: state === 'revealed' ? g.members.map((m) => ({ from: m.name, to: nameOf(g, g.match[m.p]), item: g.gifts[m.p] || null })) : [],
      late: g.drawn && !me,
    };
  }

  async function rpc(fn, args = {}) {
    await ready;
    const a = args || {};
    const town = a.p_town, p = a.p_player, secret = a.p_secret;
    if (!/^santa_/.test(fn)) return fail('unknown function ' + fn);
    if (typeof town !== 'string' || !TOWN_RE.test(town)) return fail('bad_town');
    if (typeof p !== 'string' || !UUID_RE.test(p) || typeof secret !== 'string' || !UUID_RE.test(secret)) return fail('bad_secret');
    let dirty = false;
    if (db.secrets[p] && db.secrets[p] !== secret) return fail('bad_secret');
    if (!db.secrets[p]) { db.secrets[p] = secret; dirty = true; }
    let t = now();
    if (fn === 'santa_status' && a.p_now) { const x = Date.parse(a.p_now); if (Number.isFinite(x)) t = x; }
    if (lazyClose(town, t)) dirty = true;
    let g = db.groups[town];
    const done = () => { if (dirty) commit(); return { data: status(town, p, t), error: null }; };
    const stop = (code) => { if (dirty) commit(); return fail(code); };

    switch (fn) {
      case 'santa_status': return done();
      case 'santa_start': {
        if (g) return stop('already_started');
        if (t >= CLOSE_MS) return stop('not_open');
        db.groups[town] = { season: SEASON, created: new Date(t).toISOString(), starter: p, members: [{ p, name: cleanName(a.p_name), at: t }], drawn: false, match: {}, gifts: {} };
        delete db.cancelled[town];
        dirty = true;
        return done();
      }
      case 'santa_join': {
        if (!g || g.drawn || t >= CLOSE_MS) return stop('not_open');
        const me = member(g, p);
        if (me) { me.name = cleanName(a.p_name); dirty = true; return done(); }
        if (g.members.length >= MAX) return stop('full');
        g.members.push({ p, name: cleanName(a.p_name), at: t });
        dirty = true;
        return done();
      }
      case 'santa_leave': {
        if (!g) return done();
        if (g.drawn) return stop('not_open');
        if (!member(g, p)) return done();
        g.members = g.members.filter((m) => m.p !== p);
        if (!g.members.length) delete db.groups[town];
        else if (g.starter === p) g.starter = [...g.members].sort((x, y) => x.at - y.at)[0].p;
        dirty = true;
        return done();
      }
      case 'santa_draw': {
        if (!g || g.drawn) return stop('not_open');
        if (g.starter !== p) return stop('not_starter');
        if (g.members.length < MIN_DRAW) return stop('too_few');
        draw(g, town);
        dirty = true;
        return done();
      }
      case 'santa_give': {
        const item = a.p_item;
        if (typeof item !== 'string' || item.length > 32 || !ITEM_RE.test(item)) return stop('bad_item');
        if (!g || !g.drawn) return stop('not_drawn');
        if (t >= REVEAL_MS) return stop('revealed');
        if (!member(g, p)) return stop('not_member');
        g.gifts[p] = item;
        dirty = true;
        return done();
      }
      default: return stop('unknown function ' + fn);
    }
  }
  return {
    kind: 'mock', rpc,
    reset() { db = { ver: db.ver + 1, by: tab, groups: {}, secrets: {}, cancelled: {} }; commit(); },
    dump: () => clone(db),
  };
}
