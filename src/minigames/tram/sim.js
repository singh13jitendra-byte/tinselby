// Tram Conductor (door 11): pure gameplay simulation (no three.js, runs in Node for tests).
// One input: brake held or not. Released = gentle power. The route visits 6 stops of layout.TRAM_STOPS
// (1.5 laps of TRAM_LOOP); each stop is judged by where the tram's centre comes to rest.
import { Path } from '../../life/paths.js';

export const PHYS = {
  vmax: 1.8, // u/s
  acc: 0.8, // power (u/s²), tapers off near vmax
  brake: 1.6, // full brake (u/s²)
  brakeMin: 0.45, // a fresh press starts at 45 % and ramps to full over brakeRamp seconds (short taps = gentle)
  brakeRamp: 0.25,
  accRamp: 0.35,
  stopV: 0.05,
};
export const ZONE = { perfect: 0.25, good: 0.6 };
export const PTS = { perfect: 30, good: 15, smooth: 5, onTime: 5, passenger: 10 };
export const ROUTE = ['holly', 'hill', 'lake', 'park', 'holly', 'hill'];
export const WAITING = [2, 3, 2, 3, 2, 2]; // 14 passengers
export const ALIGHT = [1, 1, 2, 2, 1, 2]; // riders who hop off (visual only)
export const START_BOARD = 2; // Park Gate passengers boarding at the start (not scored)
export const MAX_SCORE = ROUTE.length * (PTS.perfect + PTS.smooth + PTS.onTime) + WAITING.reduce((a, b) => a + b, 0) * PTS.passenger; // 380
export const STARS = [0, 240, 340]; // 1★ = route finished (any score); 2★ ≈ every stop made; 3★ ≈ 4+ perfect stops (bot-tuned)
export const SLACK = 3.0; // seconds on top of the ideal segment time for "on time"
export const APPROACH = 6; // lurches only count within this distance of the stop
export const DOOR_Z = 0.66; // door centre ahead of the tram centre (buildTramMesh)
// dwell choreography (seconds)
const DW = { open: 0.45, alight: 0.35, board: 0.42, hop: 0.5, close: 0.55 };

const H = 1 / 60; // fixed physics step

/** Route geometry: the loop, absolute stop distances along it and per-segment par times. */
export function createRoute(layout) {
  const path = new Path(layout.TRAM_LOOP, { closed: true, radius: 1.0 }); // same rounding as life/traffic.js
  const L = path.length;
  const byId = Object.fromEntries(layout.TRAM_STOPS.map((st) => [st.id, { ...st, s: path.nearestS(st.pos[0], st.pos[1]) }]));
  const s0 = byId.park.s;
  const stops = [];
  let prev = s0;
  ROUTE.forEach((id, i) => {
    const st = byId[id];
    let ds = (((st.s - prev) % L) + L) % L;
    if (ds < 0.5) ds += L;
    const s = prev + ds;
    stops.push({ i, id, name: st.name, s, D: ds, waiting: WAITING[i], alight: ALIGHT[i], stop: st, par: idealTime(ds) + SLACK });
    prev = s;
  });
  return { path, L, s0, stops, byId };
}

/** Simulated ideal (bot-perfect) time from standstill to standstill over distance D. */
export function idealTime(D) {
  const st = { v: 0, bk: 0, ap: 0, s: 0 };
  let t = 0, brake = false;
  while (t < 60) {
    if (!brake && st.s + predictStop(st.v, 0) >= D) brake = true;
    physStep(st, brake, H);
    t += H;
    if (brake && st.v <= 0) break;
  }
  return t;
}

function physStep(st, brake, dt) {
  let a;
  if (brake) {
    st.bk = Math.min(1, st.bk + dt / PHYS.brakeRamp);
    st.ap = 0;
    a = -PHYS.brake * (PHYS.brakeMin + (1 - PHYS.brakeMin) * st.bk);
  } else {
    st.bk = 0;
    st.ap = Math.min(1, st.ap + dt / PHYS.accRamp);
    a = PHYS.acc * st.ap * Math.max(0, Math.min(1, (PHYS.vmax - st.v) / 0.35));
  }
  st.a = a;
  st.v = Math.max(0, st.v + a * dt);
  st.s += st.v * dt;
}

/** Distance the tram still travels if the brake is held from now (bk = current brake ramp, 0 = fresh press). */
export function predictStop(v, bk = 0) {
  let d = 0, b = bk;
  for (let k = 0; k < 400 && v > 0; k++) {
    b = Math.min(1, b + H / PHYS.brakeRamp);
    v = Math.max(0, v - PHYS.brake * (PHYS.brakeMin + (1 - PHYS.brakeMin) * b) * H);
    d += v * H;
  }
  return d;
}

export function starsFor(score, finished = true) {
  if (!finished) return 0;
  return score >= STARS[2] ? 3 : score >= STARS[1] ? 2 : 1;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The run. step(dt, brakeHeld) advances in fixed 1/60 substeps and returns the events of this step:
 *  depart {i}, stop {i, quality, d, smooth, onTime, pts}, board {i, k, start}, alight {i, k}, doorsOpen {i},
 *  doorsClose {i}, miss {i}, short {i}, end {}.
 * Phases: ready → board (start dwell) → drive ⇄ dwell → (runout) → celebrate → done
 */
export function createSim(route) {
  const S = {
    phase: 'ready', t: 0, s: route.s0, v: 0, bk: 0, ap: 0, a: 0, brake: false,
    idx: 0, // next stop index into route.stops
    score: 0, aboard: 0, boarded: 0, missed: 0, perfect: 0, good: 0, smoothN: 0, onTimeN: 0,
    lurches: 0, due: 0, dwellT: 0, dwell: null, shortHint: false, phaseT: 0, results: [],
  };
  const out = [];
  const emit = (type, o = {}) => out.push({ type, ...o });
  const target = () => route.stops[S.idx];

  function beginDwell(i, alight, board, start = false) {
    const plan = [];
    let t = DW.open;
    for (let k = 0; k < alight; k++) { plan.push({ at: t, type: 'alight', k }); t += DW.alight; }
    if (alight) t += 0.1;
    for (let k = 0; k < board; k++) { plan.push({ at: t, type: 'board', k }); t += DW.board; }
    S.dwell = { i, plan, end: t + DW.hop + DW.close, start, closed: false };
    S.dwellT = 0;
    emit('doorsOpen', { i, start });
  }
  function depart() {
    S.phase = 'drive'; S.phaseT = 0;
    S.lurches = 0; S.shortHint = false;
    S.due = S.t + target().par;
    emit('depart', { i: S.idx });
  }

  function sub(brakeIn) {
    S.t += H; S.phaseT += H;
    if (S.phase === 'board' || S.phase === 'dwell') {
      S.v = 0; S.bk = 0; S.ap = 0; S.a = 0;
      const d = S.dwell;
      S.dwellT += H;
      for (const p of d.plan) {
        if (p.done || S.dwellT < p.at) continue;
        p.done = true;
        if (p.type === 'alight') { S.aboard = Math.max(0, S.aboard - 1); emit('alight', { i: d.i, k: p.k }); }
        else {
          S.aboard++;
          if (!d.start) { S.boarded++; S.score += PTS.passenger; }
          emit('board', { i: d.i, k: p.k, start: d.start, pts: d.start ? 0 : PTS.passenger });
        }
      }
      if (!d.closed && S.dwellT >= d.end - DW.close) { d.closed = true; emit('doorsClose', { i: d.i }); }
      if (S.dwellT >= d.end) {
        S.dwell = null;
        if (S.idx >= route.stops.length) { S.phase = 'celebrate'; S.phaseT = 0; emit('end', {}); }
        else depart();
      }
      return;
    }
    if (S.phase === 'drive' || S.phase === 'runout') {
      const brake = S.phase === 'runout' ? true : !!brakeIn;
      if (S.phase === 'drive' && S.brake && !brake && S.v > 0.25 && target() && target().s - S.s < APPROACH) S.lurches++;
      S.brake = brake;
      physStep(S, brake, H);
      if (S.phase === 'runout') {
        if (S.v <= 0) { S.phase = 'celebrate'; S.phaseT = 0; emit('end', {}); }
        return;
      }
      const T = target();
      const d = S.s - T.s;
      if (brake && S.v < PHYS.stopV && Math.abs(d) <= ZONE.good) {
        S.v = 0; S.a = 0;
        const quality = Math.abs(d) <= ZONE.perfect ? 'perfect' : 'good';
        const smooth = S.lurches <= 1, onTime = S.t <= S.due + 1e-6;
        const pts = PTS[quality] + (smooth ? PTS.smooth : 0) + (onTime ? PTS.onTime : 0);
        S.score += pts;
        S[quality]++; if (smooth) S.smoothN++; if (onTime) S.onTimeN++;
        const r = { i: S.idx, id: T.id, quality, d: +d.toFixed(3), smooth, onTime, pts, late: +(S.t - S.due).toFixed(2) };
        S.results.push(r);
        emit('stop', r);
        S.idx++;
        S.phase = 'dwell'; S.phaseT = 0;
        beginDwell(r.i, Math.min(T.alight, S.aboard), T.waiting);
        return;
      }
      if (brake && S.v <= 0 && d < -ZONE.good && !S.shortHint) { S.shortHint = true; emit('short', { i: S.idx, d }); }
      if (d > ZONE.good) {
        S.missed++;
        S.results.push({ i: S.idx, id: T.id, quality: 'miss', d: +d.toFixed(3), smooth: false, onTime: false, pts: 0 });
        emit('miss', { i: S.idx, waiting: T.waiting });
        S.idx++;
        if (S.idx >= route.stops.length) { S.phase = 'runout'; S.phaseT = 0; return; }
        // next stop: keep the schedule fair (fresh par from here)
        S.lurches = 0; S.shortHint = false;
        S.due = S.t + idealTime(Math.max(1, target().s - S.s)) + SLACK;
      }
      return;
    }
    if (S.phase === 'celebrate' && S.phaseT >= 2.2) { S.phase = 'done'; emit('done', {}); }
  }

  let acc = 0;
  return {
    S, route,
    get target() { return target(); },
    start() { if (S.phase !== 'ready') return; S.phase = 'board'; S.phaseT = 0; beginDwell(-1, 0, START_BOARD, true); },
    step(dt, brakeIn) {
      out.length = 0;
      acc += dt;
      while (acc >= H - 1e-9) { acc -= H; sub(brakeIn); }
      return out;
    },
    /** Predicted rest distance from the target if the brake were held from now (d < 0 = short). */
    ghostD() {
      const T = target();
      if (!T) return null;
      return S.s + predictStop(S.v, S.brake ? S.bk : 0) - T.s;
    },
    get finished() { return S.phase === 'celebrate' || S.phase === 'done'; },
    result() {
      const stars = starsFor(S.score, true);
      return { score: S.score, stars, perfect: S.perfect, good: S.good, missed: S.missed, boarded: S.boarded, smooth: S.smoothN, onTime: S.onTimeN, time: +S.t.toFixed(1) };
    },
  };
}

/**
 * Bots (tests + ?mgauto). Return a function (sim) → brake boolean, called once per frame.
 *  perfect: brakes exactly when the predicted rest point reaches the stop, one smooth application.
 *  good:    human-ish, reaction error ±0.3 u and occasional corrections.
 *  sloppy:  big timing errors, rarely corrects.
 *  none:    never brakes (overshoots everything, still finishes the route).
 */
export function makeBot(mode = 'good', seed = 7) {
  const rnd = rng(seed);
  const cfg = { perfect: { err: 0, fix: 0.12, react: 0 }, good: { err: 0.32, fix: 0.3, react: 0.18 }, sloppy: { err: 1.2, fix: 1.0, react: 0.35 } }[mode];
  let aim = null, lastIdx = -1, hold = false, cool = 0;
  return (sim, dt = 1 / 30) => {
    const S = sim.S;
    if (!cfg || S.phase !== 'drive') { hold = false; return false; }
    const T = sim.target;
    if (S.idx !== lastIdx) { lastIdx = S.idx; aim = T.s + (rnd() * 2 - 1) * cfg.err; cool = 0; }
    cool -= dt;
    const restIfBrake = S.s + predictStop(S.v, hold ? S.bk : 0);
    if (!hold) {
      if (S.v < 0.02 && S.s < T.s - ZONE.good) return false; // stopped short: creep forward
      if (restIfBrake >= aim - 0.02 && cool <= 0) { hold = true; cool = cfg.react; }
    } else if (S.v > 0.05 && restIfBrake < aim - cfg.fix && cool <= 0 && S.s < T.s - ZONE.perfect) {
      // stopping short: ease off and roll on a little (a lurch)
      hold = false; cool = cfg.react + 0.1;
      if (cfg.err) aim = T.s + (rnd() * 2 - 1) * cfg.err * 0.6;
    } else if (S.v <= 0.0 && S.s < T.s - ZONE.good) { hold = false; }
    return hold;
  };
}
