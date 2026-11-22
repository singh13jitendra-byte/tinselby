// Scoreboard API (PHASE3.md §Scoreboard RPCs): friends towns only, through the net transport's rpc().
//   submit(game, raw)      → Promise<{ best, prev_best, town_best, prev_top, rank, limited } | null>  (null: public town / nothing to send)
//   list({ force })        → Promise<[{ game, name, best, me, at }]>  town_scores, cached 30 s per town
//   last()                 → the most recent list (any age) or null: used for "You beat Ava's 590!" (the previous top score)
//   town()                 → friends town code | null       enabled() → true when submit / list can work now
// Backend: `?scores=mock` or `?net=local` → src/scores/mock.js (in-memory, shared by tabs); `?net=supabase` / production →
// ctx.net.rpc if the net module exposes it, else a lazily made supabase transport of our own (same project + key);
// `?net=off` / `?scores=off` → off. `?scoresdelay=ms` adds fake latency to the mock (tests of the loading stitch / timeout).
import { getIdentity } from '../net/identity.js';
import { cleanName } from '../core/names.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../core/net-config.js';
import { createSupabaseTransport } from '../net/transport.js';
import { createScoresMock } from './mock.js';
import { toServer, validGame } from './games.js';

export const CACHE_MS = 30000;
export const TIMEOUT_MS = 4000;

/** Reject with Error('timeout') after ms; the original promise keeps running (a slow submit still lands). */
export function withTimeout(p, ms = TIMEOUT_MS) {
  let t = null;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

function pickMode(ctx) {
  const p = ctx.params, s = (p && p.get && p.get('scores')) || '';
  if (s === 'off') return 'off';
  if (s === 'mock') return 'mock';
  const net = ctx.net && ctx.net.mode;
  if (net === 'local') return 'mock';
  if (net === 'supabase') return 'supabase';
  return 'off';
}

const normRes = (d) => {
  const o = Array.isArray(d) ? d[0] : d;
  if (!o || typeof o !== 'object') return null;
  const int = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
  return { best: int(o.best), prev_best: int(o.prev_best), town_best: !!o.town_best, prev_top: typeof o.prev_top === 'string' && o.prev_top ? o.prev_top.slice(0, 18) : null, rank: int(o.rank), limited: !!o.limited };
};
const normRows = (d) => {
  const a = Array.isArray(d) ? d : [];
  const out = [];
  for (const r of a) {
    if (!r || !validGame(r.game) || !Number.isFinite(+r.best)) continue;
    out.push({ game: r.game, name: cleanName(r.name, 'Friend'), best: Math.round(+r.best), me: !!r.me, at: typeof r.at === 'string' ? r.at : '' });
  }
  return out.sort((a, b) => (a.game < b.game ? -1 : a.game > b.game ? 1 : b.best - a.best || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)));
};

export function createScoresApi(ctx) {
  const mode = pickMode(ctx);
  let backend = mode === 'mock' ? createScoresMock() : null; // made now so it syncs with the other tabs at load
  let delay = Math.max(0, +((ctx.params && ctx.params.get && ctx.params.get('scoresdelay')) || 0) || 0);
  async function rpc(fn, args) {
    if (mode === 'mock') {
      backend = backend || createScoresMock();
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return backend.rpc(fn, args);
    }
    if (mode === 'supabase') {
      if (ctx.net && typeof ctx.net.rpc === 'function') return ctx.net.rpc(fn, args);
      backend = backend || createSupabaseTransport({ url: SUPABASE_URL, key: SUPABASE_KEY });
      return backend.rpc(fn, args);
    }
    return { data: null, error: { message: 'scores off' } };
  }
  const town = () => { try { return (ctx.net && ctx.net.town && ctx.net.town.code) || null; } catch (e) { return null; } };
  let cache = null; // { town, at, rows }
  let inflight = null; // { town, p }
  let lastRows = null; // { town, rows }

  const api = {
    mode,
    town,
    enabled: () => mode !== 'off' && !!town(),
    async submit(game, raw) {
      const t = town();
      if (mode === 'off' || !t || !validGame(game)) return null;
      const p_score = toServer(game, raw);
      if (p_score == null || p_score <= 0) return null; // zero runs never go on a board
      const id = getIdentity(ctx);
      if (!id.player) return null;
      const name = cleanName(ctx.game && ctx.game.state && ctx.game.state.playerName);
      const { data, error } = await rpc('score_submit', { p_town: t, p_player: id.player, p_secret: id.secret, p_name: name, p_game: game, p_score });
      if (error) throw new Error(error.message || 'score_submit failed');
      if (cache && cache.town === t) cache.at = -Infinity; // stale: the next list() refetches
      return normRes(data);
    },
    list({ force = false } = {}) {
      const t = town();
      if (mode === 'off' || !t) return Promise.resolve([]);
      if (!force && cache && cache.town === t && performance.now() - cache.at < CACHE_MS) return Promise.resolve(cache.rows);
      if (inflight && inflight.town === t) return inflight.p;
      const id = getIdentity(ctx);
      const p = rpc('town_scores', { p_town: t, p_player: id.player })
        .then(({ data, error }) => {
          if (error) throw new Error(error.message || 'town_scores failed');
          const rows = normRows(data);
          if (town() === t) { cache = { town: t, at: performance.now(), rows }; lastRows = { town: t, rows }; }
          return rows;
        })
        .finally(() => { if (inflight && inflight.p === p) inflight = null; });
      inflight = { town: t, p };
      return p;
    },
    last() { const t = town(); return lastRows && lastRows.town === t ? lastRows.rows : null; },
    invalidate() { cache = null; },
    _rpc: rpc, // tests
    _setDelay(ms) { delay = Math.max(0, +ms || 0); }, // tests: fake latency for the mock
  };
  return api;
}

/** Rows of one game, best first. */
export const rowsFor = (rows, game) => (rows || []).filter((r) => r.game === game).sort((a, b) => b.best - a.best);
