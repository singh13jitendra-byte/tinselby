// In-memory stand-in for the scoreboard RPCs (PHASE3.md §Scoreboard RPCs) for tests: `?scores=mock`, or automatically
// under `?net=local`. Same argument names, same JSON shapes, same rules (best per player / game / town, higher is
// better, validation, 30 submits per player per hour, the secret must match the one first used for that player).
// Shared between the tabs of one browser through BroadcastChannel: every accepted best is broadcast ('put'), and a new
// tab asks the others for everything they know ('who' → 'all'), so tools/play2.py-style two-page tests see one board.
// Nothing is persisted: closing every tab clears the board.
//   rpc(fn, args) → Promise<{ data, error }>      (like transport.rpc)      opts.delayMs: fake network latency
const CHANNEL = 'tinselby-scores-mock';
const GAME_RE = /^[a-z0-9_]{2,24}$/;
const TOWN_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/; // as the server's _tsb_town (QQ… = test towns)
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // uuid
const RATE_N = 30, RATE_MS = 3600 * 1000;

export function createScoresMock({ delayMs = 0, channel = CHANNEL, now = () => Date.now() } = {}) {
  const rows = new Map(); // `${town}|${game}|${player}` → { town, game, player, name, best, at }
  const secrets = new Map(); // player → secret (the real server keeps sha256(secret))
  const recent = new Map(); // player → [submit times] (rate limit, per tab)
  const key = (t, g, p) => `${t}|${g}|${p}`;
  let bc = null;
  try { bc = new BroadcastChannel(channel); } catch (e) { bc = null; }
  const post = (m) => { try { bc && bc.postMessage(m); } catch (e) { /* closed */ } };

  const better = (a, b) => a.best > b.best || (a.best === b.best && a.at < b.at);
  function put(r) {
    if (!r || typeof r !== 'object' || !GAME_RE.test(r.game) || !Number.isInteger(r.best)) return;
    const k = key(r.town, r.game, r.player), cur = rows.get(k);
    if (!cur || r.best > cur.best) rows.set(k, { town: r.town, game: r.game, player: r.player, name: String(r.name).slice(0, 18), best: r.best, at: r.at });
    else if (r.name) cur.name = String(r.name).slice(0, 18); // the server renames your row on every submit
  }
  if (bc) {
    bc.onmessage = (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'put') { put(m.row); if (m.secret && !secrets.has(m.row.player)) secrets.set(m.row.player, m.secret); }
      else if (m.t === 'who') post({ t: 'all', rows: [...rows.values()], secrets: [...secrets] });
      else if (m.t === 'all') {
        for (const r of m.rows || []) put(r);
        for (const [p, s] of m.secrets || []) if (!secrets.has(p)) secrets.set(p, s);
      }
    };
    post({ t: 'who' });
  }
  // answer nothing until the other tabs had a moment to send what they know (first 'all', or 250 ms)
  let ready = new Promise((resolve) => {
    if (!bc) { resolve(); return; }
    const t = setTimeout(resolve, 250);
    const prev = bc.onmessage;
    bc.onmessage = (ev) => { prev(ev); if (ev.data && ev.data.t === 'all') { clearTimeout(t); resolve(); } };
  });

  const board = (town, game) => [...rows.values()].filter((r) => r.town === town && r.game === game).sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const fail = (message) => ({ data: null, error: { message } });

  function scoreSubmit(a) {
    const { p_town: rawTown, p_player: player, p_secret: secret, p_name: rawName, p_game: game, p_score: score } = a || {};
    const town = typeof rawTown === 'string' ? rawTown.trim().toUpperCase() : '';
    const name = typeof rawName === 'string' ? rawName.normalize('NFKC').replace(/[\u0000-\u001f<>{}\[\]\\`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18).trim() : '';
    if (!TOWN_RE.test(town)) return fail('bad_town');
    if (!name) return fail('bad_name');
    if (typeof player !== 'string' || !ID_RE.test(player) || typeof secret !== 'string' || !ID_RE.test(secret)) return fail('bad_secret');
    if (typeof game !== 'string' || !GAME_RE.test(game)) return fail('bad_game');
    if (!Number.isInteger(score) || score < 0 || score > 1000000) return fail('bad_score');
    if (secrets.has(player) && secrets.get(player) !== secret) return fail('bad_secret');
    secrets.set(player, secret);
    const t = now();
    const times = (recent.get(player) || []).filter((x) => t - x < RATE_MS);
    const list = board(town, game);
    const mine = rows.get(key(town, game, player)) || null;
    const rankOf = () => board(town, game).findIndex((r) => r.player === player) + 1 || null; // ties: earlier best first, as the server
    if (times.length >= RATE_N) { // ignored (rate limit): report the stored best unchanged
      recent.set(player, times);
      const b = mine ? mine.best : null;
      return { data: { best: b, prev_best: b, town_best: false, prev_top: null, rank: b == null ? null : rankOf(), limited: true }, error: null };
    }
    times.push(t); recent.set(player, times);
    const top = list[0] || null;
    const prevBest = mine ? mine.best : null;
    const row = { town, game, player, name, best: prevBest == null || score > prevBest ? score : prevBest, at: new Date(t).toISOString() };
    if (prevBest != null && score <= prevBest) row.at = mine.at;
    put(row);
    post({ t: 'put', row, secret });
    const townBest = (prevBest == null || score > prevBest) && (!top || score > top.best); // improved AND strictly above the old #1
    return {
      data: { best: row.best, prev_best: prevBest, town_best: townBest, prev_top: townBest && top && top.player !== player ? top.name : null, rank: rankOf(), limited: false },
      error: null,
    };
  }

  function townScores(a) {
    const town = typeof (a && a.p_town) === 'string' ? a.p_town.trim().toUpperCase() : '', player = a && a.p_player;
    if (!TOWN_RE.test(town)) return fail('bad_town');
    const games = [...new Set([...rows.values()].filter((r) => r.town === town).map((r) => r.game))].sort(); // games alphabetical, as the server
    const out = [];
    for (const g of games) for (const r of board(town, g).slice(0, 10)) out.push({ game: g, name: r.name, best: r.best, me: r.player === player, at: r.at });
    return { data: out, error: null };
  }

  return {
    kind: 'mock',
    async rpc(fn, args) {
      if (ready) { await ready; ready = null; }
      const res = fn === 'score_submit' ? scoreSubmit(args) : fn === 'town_scores' ? townScores(args) : fail('unknown function ' + fn);
      return new Promise((resolve) => setTimeout(() => resolve(res), Math.max(0, delayMs)));
    },
    _rows: rows, // tests
    close() { try { bc && bc.close(); } catch (e) { /* */ } bc = null; },
  };
}
