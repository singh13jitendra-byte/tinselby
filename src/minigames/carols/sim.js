// Carol Singing: scoring core + bot. Pure (no three.js, no DOM): index.js feeds it real taps, tune.mjs runs it in node.
//
// Per song the game calls sim.begin(k), then, with song-local seconds (see chart.js):
//   press(lane, t) / release(lane, t)   a thumb (or key) going down / up on a lane
//   advance(t)                          time moved on: misses notes whose window has passed, finishes holds
// and drains sim.events. Timing: Perfect ±0.11 s (10), Good ±0.22 s (5), WAVE3 §Door 17. Forgiving extras:
//   - the right moment in the wrong lane still sings: "Close" (3), breaks the streak;
//   - a tap 0.22–0.32 s early in the note's own lane uses the note up ("Early", 0): mashing a lane doesn't pay;
//   - holds: 2 points per beat held from the note's time to its end (hold the lane down; lift early = fewer points).
// Stars: 1 = all three carols finished, 2 ≥ 60 % of max, 3 ≥ 85 % (bot-checked, see tune.mjs).
import { buildCharts, LANES } from './chart.js';

export const TUNE = { perfect: 0.11, good: 0.22, early: 0.32, pts: { perfect: 10, good: 5, close: 3 }, holdPerBeat: 2, streakCheer: 8 };
export const STAR_FRAC = [0, 0.6, 0.85];

export function starsFor(score, max, finished = true) {
  if (!finished) return 0;
  const r = max > 0 ? score / max : 0;
  return r >= STAR_FRAC[2] - 1e-9 ? 3 : r >= STAR_FRAC[1] - 1e-9 ? 2 : 1;
}

export function holdMax(n) { return n.hold ? Math.round(TUNE.holdPerBeat * n.holdBeats) : 0; }

export function createSim(charts = buildCharts()) {
  const max = charts.reduce((a, c) => a + c.notes.reduce((s, n) => s + TUNE.pts.perfect + holdMax(n), 0), 0);
  const S = {
    charts, max, song: -1, chart: null,
    score: 0, perfect: 0, good: 0, close: 0, early: 0, miss: 0, holdPts: 0, holdsFull: 0, stray: 0,
    streak: 0, bestStreak: 0, events: [],
    pressed: new Array(LANES).fill(0), // pointers / keys down per lane
    holds: new Array(LANES).fill(null), // active hold per lane: { note, pts }
    next: 0, // first unjudged note index (notes are in time order)
    finished: false,
    begin(k) {
      S.song = k;
      S.chart = charts[k];
      for (const n of S.chart.notes) { n.res = null; n.err = null; n.held = 0; }
      S.next = 0;
      S.holds.fill(null);
    },
    /** a thumb / key goes down on `lane` at song time t (s) */
    press(lane, t) {
      if (!S.chart || lane < 0 || lane >= LANES) return null;
      S.pressed[lane]++;
      const notes = S.chart.notes;
      // own lane first: the closest unjudged note within [−early, +good]
      let best = null, be = Infinity;
      for (let i = S.next; i < notes.length; i++) {
        const n = notes[i];
        if (n.t - t > TUNE.early + 0.01) break;
        if (n.res || n.lane !== lane) continue;
        const e = t - n.t;
        if (e < -TUNE.early || e > TUNE.good) continue;
        if (Math.abs(e) < Math.abs(be)) { best = n; be = e; }
      }
      if (best) {
        const a = Math.abs(be);
        if (be < -TUNE.good) return judge(best, 'early', be, lane);
        const g = a <= TUNE.perfect ? 'perfect' : 'good';
        judge(best, g, be, lane);
        if (best.hold) S.holds[lane] = { note: best, pts: 0 };
        return g;
      }
      // the right moment in another lane: still sings, softly ("Close")
      let other = null, oe = Infinity;
      for (let i = S.next; i < notes.length; i++) {
        const n = notes[i];
        if (n.t - t > TUNE.good + 0.01) break;
        if (n.res) continue;
        const e = t - n.t;
        if (Math.abs(e) <= TUNE.good && Math.abs(e) < Math.abs(oe)) { other = n; oe = e; }
      }
      if (other) return judge(other, 'close', oe, lane);
      S.stray++;
      if (S.streak) S.streak = 0;
      S.events.push({ type: 'stray', lane, t });
      return 'stray';
    },
    release(lane, t) {
      if (lane < 0 || lane >= LANES) return;
      S.pressed[lane] = Math.max(0, S.pressed[lane] - 1);
      if (S.pressed[lane] === 0 && S.holds[lane]) endHold(lane, t, false);
    },
    advance(t) {
      if (!S.chart) return;
      const notes = S.chart.notes;
      while (S.next < notes.length && (notes[S.next].res || t - notes[S.next].t > TUNE.good)) {
        const n = notes[S.next];
        if (!n.res) judge(n, 'miss', null, n.lane);
        S.next++;
      }
      for (let l = 0; l < LANES; l++) {
        const h = S.holds[l];
        if (!h) continue;
        tickHold(h, t);
        if (t >= h.note.endT) endHold(l, h.note.endT, true);
      }
    },
    /** End of the current song: anything left is missed, holds close. */
    endSong(t = Infinity) {
      for (let l = 0; l < LANES; l++) if (S.holds[l]) endHold(l, Math.min(t, S.holds[l].note.endT), S.pressed[l] > 0);
      S.advance(Infinity);
    },
    finish() { S.finished = true; },
    stars() { return starsFor(S.score, S.max, S.finished); },
    get ratio() { return S.max ? S.score / S.max : 0; },
  };

  function judge(n, grade, err, lane) {
    n.res = grade; n.err = err;
    const pts = TUNE.pts[grade] || 0;
    S.score += pts;
    if (grade === 'perfect' || grade === 'good') {
      S[grade]++;
      S.streak++;
      if (S.streak > S.bestStreak) S.bestStreak = S.streak;
    } else {
      S[grade]++;
      S.streak = 0;
    }
    S.events.push({ type: 'note', grade, note: n, lane, err, pts, streak: S.streak });
    return grade;
  }
  function tickHold(h, t) {
    const n = h.note, spb = S.chart.spb;
    const beats = Math.max(0, Math.min(t, n.endT) - n.t) / spb;
    const pts = Math.min(holdMax(n), Math.floor(beats * TUNE.holdPerBeat + 1e-6));
    if (pts > h.pts) {
      S.score += pts - h.pts; S.holdPts += pts - h.pts; h.pts = pts; n.held = pts;
      S.events.push({ type: 'holdTick', note: n, pts });
    }
  }
  function endHold(lane, t, full) {
    const h = S.holds[lane];
    S.holds[lane] = null;
    tickHold(h, t);
    const done = full || h.pts >= holdMax(h.note);
    if (done) S.holdsFull++;
    S.events.push({ type: 'holdEnd', note: h.note, lane, pts: h.pts, full: done });
  }
  return S;
}

// ------------------------------------------------------------------ bot
// A player model: per note a timing error (bias + gaussian), a chance to pick the wrong lane, to miss it, to
// lift a hold early, plus stray taps. 'good' ≈ a player who knows the carols; 'sloppy' ≈ a first try.
export const BOTS = {
  perfect: { sd: 0.02, bias: 0, lane: 0, miss: 0, lift: 0, stray: 0 },
  good: { sd: 0.065, bias: 0.015, lane: 0.03, miss: 0.02, lift: 0.25, stray: 0.03 },
  sloppy: { sd: 0.12, bias: 0.05, lane: 0.14, miss: 0.1, lift: 0.6, stray: 0.12 },
  none: null,
};

export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The bot's planned actions for one chart: [{ t, type: 'press' | 'release', lane }] sorted by time. */
export function botPlan(chart, mode, seed = 1) {
  const P = BOTS[mode];
  if (!P) return [];
  const rnd = mulberry(seed * 7919 + chart.notes.length);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const out = [];
  for (const n of chart.notes) {
    if (rnd() < P.miss) continue;
    let lane = n.lane;
    if (rnd() < P.lane) lane = (n.lane + 1 + Math.floor(rnd() * (LANES - 1))) % LANES;
    const t = n.t + P.bias + gauss() * P.sd;
    out.push({ t, type: 'press', lane });
    let up = t + 0.09;
    if (n.hold) {
      const len = n.endT - n.t;
      up = rnd() < P.lift ? n.t + len * (0.2 + 0.7 * rnd()) : n.endT + 0.05;
    }
    out.push({ t: Math.max(t + 0.04, up), type: 'release', lane });
    if (rnd() < P.stray) { // a stray tap somewhere between this note and the next
      const nx = chart.notes[n.i + 1];
      if (nx && nx.t - n.t > 0.8) { const st = n.t + 0.4 + rnd() * (nx.t - n.t - 0.75); const sl = Math.floor(rnd() * LANES); out.push({ t: st, type: 'press', lane: sl }, { t: st + 0.08, type: 'release', lane: sl }); }
    }
  }
  out.sort((a, b) => a.t - b.t || (a.type === 'release' ? -1 : 1));
  return out;
}

/** Feed a sim the actions due by time t (exact action times, so the frame rate doesn't matter). */
export function createBotDriver(S, mode, seed = 1) {
  let plan = [], i = 0;
  return {
    mode,
    begin(k) { plan = botPlan(S.charts[k], mode, seed + k * 101); i = 0; },
    step(t, onAction) {
      while (i < plan.length && plan[i].t <= t) {
        const a = plan[i++];
        S.advance(a.t);
        if (a.type === 'press') { const g = S.press(a.lane, a.t); onAction?.(a, g); } else { S.release(a.lane, a.t); onAction?.(a, null); }
      }
    },
  };
}

/** Headless run of all three carols: { mode, seed, score, max, ratio, stars, perfect, good, close, early, miss, holdPts, bestStreak, secs }. */
export function runHeadless(mode, seed = 1, dt = 1 / 30) {
  const S = createSim(buildCharts());
  const bot = createBotDriver(S, mode, seed);
  let secs = 0;
  for (let k = 0; k < S.charts.length; k++) {
    const c = S.charts[k];
    S.begin(k); bot.begin(k);
    for (let t = -2; t <= c.end; t += dt) { bot.step(t); S.advance(t); }
    S.endSong(c.end);
    S.events.length = 0;
    secs += c.end + 2;
  }
  S.finish();
  return { mode, seed, score: S.score, max: S.max, ratio: +S.ratio.toFixed(3), stars: S.stars(), perfect: S.perfect, good: S.good, close: S.close, early: S.early, miss: S.miss, stray: S.stray, holdPts: S.holdPts, bestStreak: S.bestStreak, secs: +secs.toFixed(1) };
}
