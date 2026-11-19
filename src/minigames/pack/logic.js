// PACK THE SLEIGH: pure game logic (no three.js, no DOM), shared by the game, the bot and the Node sims.
// Bed: 5 columns x 3 rows. 12 presents (widths 1 or 2 cells), one at a time, each slides along the rail (ping-pong).
// drop() snaps to the column under it and rests on the highest filled cell in its footprint. Empty cells under a present
// are gaps (-5 each). A present that would stick out above row 3 tumbles into the snow (no fail).
// Score: +10 per cell, +25 per completed row, -5 per gap, +50 perfect pack (15 cells, 0 gaps). Max 275.

export const COLS = 5, ROWS = 3, N = 12;
export const WIDTHS = [1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1]; // sum 15 = a perfect pack
export const CELL_PTS = 10, ROW_PTS = 25, GAP_PTS = -5, PERFECT_PTS = 50, MAX_SCORE = 275;
export const STARS = [160, 240]; // 2★, 3★ (1★ = all 12 dropped)
export const SETTLE = 0.8; // s between a drop and the next present
export const IDLE_DROP = 10; // s: an idle present drops itself
export const speedOf = (i) => 1.0 + 0.06 * i; // cells per second

/** Triangle wave: s travelled -> position in [0, R]. */
export const tri = (s, R) => { if (R <= 0) return 0; const p = ((s % (2 * R)) + 2 * R) % (2 * R); return p <= R ? p : 2 * R - p; };

export function createModel() {
  const m = {
    h: new Array(COLS).fill(0),
    occ: Array.from({ length: ROWS }, () => new Array(COLS).fill(false)),
    idx: 0, phase: 'slide', t: 0, settle: 0,
    cells: 0, gaps: 0, rows: 0, tumbles: 0, dropped: 0, bonus: 0, score: 0, perfect: false,
    last: null, // result of the latest drop
    get w() { return WIDTHS[Math.min(m.idx, N - 1)]; },
    get R() { return COLS - m.w; },
    get u() { return tri((m.idx % 2) * m.R + speedOf(m.idx) * m.t, m.R); },
    get col() { return Math.max(0, Math.min(m.R, Math.round(m.u))); },
    /** Where would a drop at column c land? (pure) */
    probe(c, w = m.w) {
      let r = 0; for (let k = c; k < c + w; k++) r = Math.max(r, m.h[k]);
      let gaps = 0; for (let k = c; k < c + w; k++) gaps += r - m.h[k];
      return { col: c, row: r, gaps, tumble: r >= ROWS };
    },
    /** Drop the current present now. Returns the result (also m.last). */
    drop() {
      if (m.phase !== 'slide') return null;
      const w = m.w, i = m.idx, c = m.col, p = m.probe(c, w);
      const gapL = p.row - m.h[c], gapR = w === 2 ? p.row - m.h[c + 1] : 0;
      const res = { i, w, col: c, row: p.row, gaps: 0, tumble: p.tumble, rowsDone: [], cells: 0, pts: 0, dir: (c + w / 2 > COLS / 2 ? 1 : -1), tilt: p.tumble ? 0 : gapR - gapL };
      if (p.tumble) { m.tumbles++; }
      else {
        for (let k = c; k < c + w; k++) { m.occ[p.row][k] = true; m.h[k] = p.row + 1; }
        res.gaps = p.gaps; res.cells = w;
        m.cells += w; m.gaps += p.gaps;
        res.pts = w * CELL_PTS + p.gaps * GAP_PTS;
        if (m.occ[p.row].every(Boolean)) { m.rows++; res.rowsDone.push(p.row); res.pts += ROW_PTS; }
      }
      m.score += res.pts;
      m.dropped++; m.last = res;
      m.phase = 'settle'; m.settle = SETTLE;
      return res;
    },
    step(dt) {
      if (m.phase === 'slide') { m.t += dt; if (m.t > IDLE_DROP) m.drop(); }
      else if (m.phase === 'settle') {
        m.settle -= dt;
        if (m.settle <= 0) {
          m.idx++; m.t = 0;
          if (m.idx >= N) {
            m.phase = 'end';
            if (m.cells === COLS * ROWS && m.gaps === 0) { m.perfect = true; m.bonus = PERFECT_PTS; m.score += PERFECT_PTS; }
            m.score = Math.max(0, m.score);
          } else m.phase = 'slide';
        }
      }
    },
    get stars() { return m.dropped >= N ? (m.score >= STARS[1] ? 3 : m.score >= STARS[0] ? 2 : 1) : 0; },
  };
  return m;
}

// ------------------------------------------------------------------ planner (exact DP over the remaining presents)
const key = (h, occ) => { let a = 0; for (let c = 0; c < COLS; c++) a = a * 4 + h[c]; let b = 0; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) b = b * 2 + (occ[r][c] ? 1 : 0); return a * 32768 + b; };

function place(h, occ, c, w) { // returns { pts, h2, occ2 } for a drop at column c
  let r = 0; for (let k = c; k < c + w; k++) r = Math.max(r, h[k]);
  if (r >= ROWS) return { pts: 0, h2: h, occ2: occ };
  let gaps = 0; for (let k = c; k < c + w; k++) gaps += r - h[k];
  const h2 = h.slice(), occ2 = occ.map((x) => x.slice());
  for (let k = c; k < c + w; k++) { occ2[r][k] = true; h2[k] = r + 1; }
  let pts = w * CELL_PTS + gaps * GAP_PTS;
  if (occ2[r].every(Boolean)) pts += ROW_PTS;
  return { pts, h2, occ2 };
}

/** best additional score from presents i.. (horizon limits how many are looked at; null = all) */
export function makePlanner(horizon = null) {
  const memo = new Map();
  const V = (h, occ, i, hz) => {
    if (i >= N) return occ.every((row) => row.every(Boolean)) ? PERFECT_PTS : 0;
    if (hz === 0) return 0;
    const k = key(h, occ) * 16 + i + (hz === Infinity ? 0 : 16 * 1e10 * hz);
    const hit = memo.get(k); if (hit !== undefined) return hit;
    const w = WIDTHS[i]; let best = -1e9;
    for (let c = 0; c <= COLS - w; c++) { const p = place(h, occ, c, w); best = Math.max(best, p.pts + V(p.h2, p.occ2, i + 1, hz - 1)); }
    memo.set(k, best); return best;
  };
  /** choose the column for present i given the current board; ties prefer the lower column. noise = chance of a random pick */
  return {
    choose(model, rng = Math.random, noise = 0) {
      const i = model.idx, w = WIDTHS[i], opts = [];
      for (let c = 0; c <= COLS - w; c++) { const p = place(model.h, model.occ, c, w); opts.push({ c, v: p.pts + V(p.h2, p.occ2, i + 1, (horizon ?? Infinity) - 1) }); }
      if (rng() < noise) return opts[Math.floor(rng() * opts.length)].c;
      opts.sort((a, b) => b.v - a.v || a.c - b.c);
      return opts[0].c;
    },
  };
}

// ------------------------------------------------------------------ bots
export const BOTS = {
  perfect: { horizon: null, noise: 0, lat: [0.0, 0.0], think: 2.0, newbie: false }, // exact plan, perfect timing
  good: { horizon: 4, noise: 0.06, lat: [0.14, 0.06], think: 2.4, newbie: false }, // looks 4 ahead, sloppy timing
  casual: { horizon: 1, noise: 0.25, lat: [0.2, 0.1], think: 2.0, newbie: false }, // greedy, sometimes misplaces
  newbie: { horizon: 1, noise: 1, lat: [0.25, 0.15], newbie: true }, // random column
};
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(6.2831853 * rng());

/** Bot driver: call tick(model, dt) each step; it calls model.drop() when it decides to. */
export function createBot(modeName = 'good', rng = Math.random) {
  const cfg = BOTS[modeName] || BOTS.good;
  const planner = makePlanner(cfg.horizon);
  let forIdx = -1, think = 0, target = 0, armed = false, wait = 0, prevU = 0;
  return {
    mode: modeName,
    tick(m, dt) {
      if (m.phase !== 'slide') { forIdx = -1; return; }
      if (forIdx !== m.idx) {
        forIdx = m.idx; think = cfg.think * (0.8 + 0.4 * rng()); armed = false; wait = 0; prevU = m.u;
        target = cfg.newbie ? Math.floor(rng() * (m.R + 1)) : planner.choose(m, rng, cfg.noise);
        if (cfg.newbie) wait = 0.4 + rng() * 2.5; // newbies just tap when the mood strikes
      }
      if (cfg.newbie) { if (m.t >= wait) m.drop(); return; }
      const u = m.u;
      if (!armed && m.t >= think && (Math.abs(u - target) < 0.04 || (u - target) * (prevU - target) < 0)) { armed = true; wait = Math.max(0, cfg.lat[0] + gauss(rng) * cfg.lat[1]); }
      prevU = u;
      if (armed) { wait -= dt; if (wait <= 0) m.drop(); }
    },
  };
}

/** Run a whole game headless; returns the finished model. */
export function simulate(modeName, rng = Math.random, dt = 1 / 30) {
  const m = createModel(), bot = createBot(modeName, rng);
  let guard = 0;
  while (m.phase !== 'end' && guard++ < 100000) { bot.tick(m, dt); m.step(dt); }
  m.sim = guard * dt;
  return m;
}
