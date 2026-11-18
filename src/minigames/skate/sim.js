// Figure Skating (door 9): skater physics, beat scoring and the test bot. Pure logic (no THREE / DOM), so the
// node tuner (tune.mjs) runs exactly what the game runs.
//
// Feel: the skater glides on its own at the music's tempo (a cruise control keeps it level with the beat), and a gentle
// assist half-follows the ribbon. On its own the assist under-steers every curve, so the player curves left / right
// (hold a side, drag, ← →) to stay on the line and pass each star on its beat. Tap = twirl; a twirl inside a gold
// ring on its beat scores big.
import { guideS, guideRate, wrap, inEdge, EDGE, DS } from './routine.js';

export const TUNE = {
  turnMax: 1.6, // rad/s at full steer
  steerRate: 5, // steer input smoothing (1/s): a tap nudges, a hold carves
  assistFF: 0.1, // share of each curve the skater takes by itself (it under-steers: that's your job)
  assistH: 0.25, // gentle pull towards the ribbon (rad/s per rad of heading error)
  latStart: 0.24,
  assistH2: 4.0, // extra pull once you stray past latStart from the line (keeps over-steering from costing much)
  look: 0.5, // assist look-ahead along the path (units)
  cruise: 3, // speed-up per unit behind the beat
  cruiseMax: 0.5,
  twirlDur: 0.62,
  perfD: 0.12, perfT: 0.12, // Perfect: within 0.12 of the star centre, within ±120 ms of the beat
  goodD: 0.25, goodT: 0.25, // Good: within 0.25, ±250 ms (forgiving)
  ringR: 0.42, ringWin: 1.0, ringPerfT: 0.2, // twirl rings: radius, window in beats, on-beat tolerance (s)
  lineFull: 0.08, lineZero: 0.3, // on-line credit: full inside lineFull, none past lineZero
};
export const PTS = { perfect: 10, good: 5, ring: 15, ringOff: 8, line: 50 };
export const STAR_FRAC = [0.3, 0.6, 0.85];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function createSim(R, T = TUNE) {
  const rings = R.stars.filter((s) => s.ring);
  const S = {
    u: R.start.u, v: R.start.v, h: R.start.h, sp: 0, steer: 0, omega: 0,
    i: 0, sProj: 0, lat: 0, sGuide: 0, b: R.b0, spb: 0.6, t: 0,
    twirlT: -1, twirls: 0, score: 0, perfect: 0, good: 0, miss: 0, streak: 0, bestStreak: 0,
    spins: 0, spinPerfect: 0, ringsMissed: 0, pat: -1, patLine: R.patterns.map(() => ({ acc: 0, time: 0, bonus: 0 })),
    nextStar: 0, nextRing: 0, track: new Map(), events: [], done: false, running: false,
    max: R.stars.length * PTS.perfect + rings.length * PTS.ring + R.patterns.length * PTS.line,
  };
  for (const r of rings) r.used = false;
  for (const st of R.stars) st.res = null;

  const ix = (s) => clamp(Math.round(s / DS), 0, R.n - 1);
  /** nearest path sample near the last one (keeps the figure-eight's crossing from snapping branches) */
  function project() {
    let best = S.i, bd = Infinity;
    const scan = (a, b) => {
      for (let k = Math.max(0, a); k <= Math.min(R.n - 1, b); k++) {
        const d = (R.u[k] - S.u) ** 2 + (R.v[k] - S.v) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
    };
    scan(S.i - 20, S.i + 50);
    if (bd > 0.8 * 0.8) { const lim = ix(S.sGuide + 1.5); scan(S.i, Math.max(S.i + 50, lim)); }
    S.i = best;
    S.sProj = best * DS;
    const hx = Math.cos(R.hd[best]), hy = Math.sin(R.hd[best]);
    S.lat = (S.v - R.v[best]) * hx - (S.u - R.u[best]) * hy; // + = left of the line
    return Math.sqrt(bd);
  }

  function step(dt, input = {}, clock = {}) {
    if (S.done) return S;
    if (clock.spb) S.spb = clock.spb;
    const spb = S.spb;
    const pu = S.u, pv = S.v, pb = S.b;
    S.t += dt;
    S.b += dt / spb + (clock.phase || 0);
    S.sGuide = guideS(R, S.b);
    const dist = project();
    // ---- speed: tempo × cruise control (catch up / ease off to stay level with the beat)
    const vNom = guideRate(R, S.b) / spb;
    const along = S.sGuide - S.sProj;
    let vT = vNom * (1 + clamp(T.cruise * along, -T.cruiseMax, T.cruiseMax));
    if (S.b >= R.bEnd) vT = 0;
    if (S.twirlT >= 0) vT *= 0.92;
    S.sp += (vT - S.sp) * (1 - Math.exp(-dt * 3));
    // ---- steering: player + assist (+ soft rim)
    S.steer += (clamp(input.steer || 0, -1, 1) - S.steer) * (1 - Math.exp(-dt * T.steerRate));
    const sT = Math.max(S.sProj, S.sGuide - 1.0) + T.look;
    const j = ix(sT);
    const toT = Math.atan2(R.v[j] - S.v, R.u[j] - S.u);
    const kap = R.kappa[S.i];
    const hEff = T.assistH + T.assistH2 * clamp((Math.abs(S.lat) - T.latStart) / 0.2, 0, 1.5);
    let w = T.assistFF * kap * S.sp + hEff * wrap(toT - S.h);
    if (S.twirlT < 0) w += S.steer * T.turnMax;
    if (!inEdge(S.u, S.v, 0.93)) w += 3 * wrap(Math.atan2(-S.v, -S.u) - S.h);
    S.omega = w;
    S.h = wrap(S.h + w * dt);
    S.u += Math.cos(S.h) * S.sp * dt;
    S.v += Math.sin(S.h) * S.sp * dt;
    const m = Math.sqrt((S.u / EDGE.rx) ** 2 + (S.v / EDGE.rz) ** 2);
    if (m > 1) { S.u /= m; S.v /= m; }
    if (S.twirlT >= 0 && (S.twirlT += dt) > T.twirlDur) S.twirlT = -1;
    // ---- twirl
    if (input.twirl && S.twirlT < 0 && S.b > R.b0 + 0.5 && S.b < R.bEnd) twirl();
    // ---- stars: closest approach to each star near its beat
    scoreStars(pu, pv, pb);
    // ---- rings that went by without a twirl
    while (S.nextRing < rings.length && S.b > rings[S.nextRing].b + T.ringWin) {
      const r = rings[S.nextRing++];
      if (!r.used) { r.used = true; S.ringsMissed++; S.events.push({ type: 'ring', grade: 'miss', star: r }); }
    }
    // ---- on-line credit + pattern bookkeeping
    const pat = R.patterns.findIndex((P) => S.b >= P.b0 && S.b < P.b1);
    if (pat !== S.pat) {
      if (S.pat >= 0) finishPattern(S.pat);
      S.pat = pat;
      if (pat >= 0) S.events.push({ type: 'pattern', index: pat });
    }
    if (pat >= 0) {
      const L = S.patLine[pat];
      L.time += dt;
      L.acc += dt * clamp((T.lineZero - dist) / (T.lineZero - T.lineFull), 0, 1);
    }
    if (S.b >= R.bEnd + 1.5 && !S.done) {
      if (S.pat >= 0) finishPattern(S.pat);
      S.pat = -1;
      S.done = true;
      S.events.push({ type: 'done' });
    }
    return S;
  }

  function finishPattern(p) {
    const L = S.patLine[p];
    if (L.done) return;
    L.done = true;
    L.bonus = Math.round(PTS.line * (L.time > 0 ? L.acc / L.time : 0));
    S.score += L.bonus;
    S.events.push({ type: 'patternEnd', index: p, bonus: L.bonus });
  }

  function twirl() {
    S.twirlT = 0;
    S.twirls++;
    let hit = null;
    for (let k = S.nextRing; k < rings.length; k++) {
      const r = rings[k];
      if (r.b - S.b > T.ringWin) break;
      if (r.used || Math.abs(S.b - r.b) > T.ringWin) continue;
      if (Math.hypot(S.u - r.u, S.v - r.v) <= T.ringR) { hit = r; break; }
    }
    if (!hit) { S.events.push({ type: 'twirl', grade: null }); return; }
    hit.used = true;
    const off = Math.abs(S.b - hit.b) * S.spb;
    const perfect = off <= T.ringPerfT;
    S.spins++;
    if (perfect) S.spinPerfect++;
    S.score += perfect ? PTS.ring : PTS.ringOff;
    S.events.push({ type: 'ring', grade: perfect ? 'perfect' : 'good', star: hit, off });
  }

  function scoreStars(pu, pv, pb) {
    // start tracking stars whose window opened
    while (S.nextStar < R.stars.length && R.stars[S.nextStar].b - 1 <= S.b) {
      const st = R.stars[S.nextStar++];
      S.track.set(st, { d: Infinity, b: st.b + 99 });
    }
    for (const [st, tr] of S.track) {
      // closest point of this frame's segment to the star
      const ex = S.u - pu, ey = S.v - pv, l2 = ex * ex + ey * ey;
      const k = l2 > 1e-12 ? clamp(((st.u - pu) * ex + (st.v - pv) * ey) / l2, 0, 1) : 1;
      const d = Math.hypot(pu + ex * k - st.u, pv + ey * k - st.v);
      const bb = pb + (S.b - pb) * k;
      if (bb >= st.b - 1 && d < tr.d) { tr.d = d; tr.b = bb; }
      if (S.b > st.b + 0.6) {
        S.track.delete(st);
        const off = Math.abs(tr.b - st.b) * S.spb;
        const grade = tr.d <= T.perfD && off <= T.perfT ? 'perfect' : tr.d <= T.goodD && off <= T.goodT ? 'good' : 'miss';
        st.res = grade;
        if (grade === 'perfect') { S.perfect++; S.streak++; S.score += PTS.perfect; }
        else if (grade === 'good') { S.good++; S.streak = 0; S.score += PTS.good; }
        else { S.miss++; S.streak = 0; }
        S.bestStreak = Math.max(S.bestStreak, S.streak);
        S.events.push({ type: 'star', grade, star: st, d: tr.d, off, streak: S.streak });
      }
    }
  }

  S.step = step;
  S.stars = () => starsFor(S.score, S.max);
  S.ratio = () => S.score / S.max;
  return S;
}

export function starsFor(score, max) {
  const r = score / Math.max(1, max);
  return r >= STAR_FRAC[2] ? 3 : r >= STAR_FRAC[1] ? 2 : r >= STAR_FRAC[0] ? 1 : 0;
}

// ---------------------------------------------------------------- bot (mgauto, tuning)
/** Seeded RNG for repeatable bot runs. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/**
 * Bot modes: 'perfect' (tight line, twirls on the beat), 'good' (bang-bang thumb, 0.15 s reaction), 'sloppy'
 * (late, lazy thumb with lapses, rough twirls: a first-timer), 'idle' (no input at all).
 */
export const BOT = {
  perfect: { delay: 0, antic: 0, quant: 0, gain: 1, lapse: 0, noise: 0, twirlSd: 0, forget: 0 },
  good: { delay: 0.1, antic: 0.12, quant: 0.3, gain: 1, lapse: 0.04, noise: 0.15, twirlSd: 0.09, forget: 0.1 },
  sloppy: { delay: 0.22, antic: 0.08, quant: 0.45, gain: 0.75, lapse: 0.28, noise: 0.35, twirlSd: 0.22, forget: 0.45 },
  idle: null,
};
export function createBot(R, S, mode = 'perfect', seed = 7, T = TUNE) {
  const cfg = BOT[mode];
  const r = rng(seed);
  const hist = [];
  let lapseT = 0, lapsing = false, plan = null, held = 0, noiseV = 0;
  const rings = R.stars.filter((s) => s.ring);
  const at = (k) => Math.min(R.n - 1, Math.max(0, Math.round(k)));
  return function input(dt) {
    if (!cfg) return { steer: 0, twirl: false };
    // desired turn rate: follow the line (curvature a little ahead = anticipation, plus pursuit of a near point)
    const i = S.i, ahead = (S.sp * cfg.antic) / DS;
    const la = at(i + ahead + 0.22 / DS);
    const toLa = Math.atan2(R.v[la] - S.v, R.u[la] - S.u);
    const kap = R.kappa[at(i + ahead)];
    const wDes = kap * S.sp + 3.2 * wrap(toLa - S.h);
    const sT = Math.max(S.sProj, S.sGuide - 1.0) + T.look;
    const j = at(sT / DS);
    const hEff = T.assistH + T.assistH2 * Math.max(0, Math.min(1.5, (Math.abs(S.lat) - T.latStart) / 0.2));
    const assist = T.assistFF * R.kappa[i] * S.sp + hEff * wrap(Math.atan2(R.v[j] - S.v, R.u[j] - S.u) - S.h);
    noiseV += (gauss(r) * cfg.noise - noiseV) * Math.min(1, dt * 3);
    const want = ((wDes - assist) / T.turnMax) * cfg.gain + noiseV;
    hist.push([S.t, want]);
    while (hist.length > 2 && hist[1][0] <= S.t - cfg.delay) hist.shift();
    let steer = cfg.delay ? hist[0][1] : want;
    if (cfg.quant) { // a thumb holds a side or lets go (with a little hysteresis)
      if (Math.abs(steer) > cfg.quant) held = Math.sign(steer);
      else if (Math.abs(steer) < cfg.quant * 0.5 || Math.sign(steer) !== held) held = 0;
      steer = held;
    }
    lapseT -= dt;
    if (lapseT <= 0) { lapsing = r() < cfg.lapse; lapseT = 0.8 + r() * 1.2; }
    if (lapsing) steer = 0;
    // twirls: aim for the next ring's beat (with timing noise), sometimes forget it
    let twirl = false;
    const ring = rings.find((x) => !x.used && x.b > S.b - 0.5);
    if (ring) {
      if (!plan || plan.ring !== ring) plan = { ring, at: ring.b + (gauss(r) * cfg.twirlSd) / S.spb, skip: r() < cfg.forget };
      if (!plan.skip && S.b >= plan.at - dt / S.spb / 2 && S.twirlT < 0) { twirl = true; plan.skip = true; }
    }
    return { steer: Math.max(-1, Math.min(1, steer)), twirl };
  };
}

/** Headless full run (node tuning / __skate.sim): returns the result summary. */
export function runHeadless(R, mode, seed = 7, dt = 1 / 30, spb = 0.6, T = TUNE) {
  const S = createSim(R, T);
  const bot = createBot(R, S, mode, seed, T);
  let guard = 0;
  while (!S.done && guard++ < 20000) S.step(dt, bot(dt), { spb });
  return { mode, seed, score: S.score, max: S.max, ratio: +(S.score / S.max).toFixed(3), stars: starsFor(S.score, S.max), perfect: S.perfect, good: S.good, miss: S.miss, spins: S.spins, spinPerfect: S.spinPerfect, line: S.patLine.map((l) => l.bonus), secs: +S.t.toFixed(1) };
}
