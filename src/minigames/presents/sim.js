// Present Delivery (door 21): pure gameplay simulation (no three.js, runs in Node for tests and bots).
// The tram drives itself 1.5 laps of TRAM_LOOP (Park Gate → … → Sledge Hill). You ride the rear platform and toss
// presents left or right. A present keeps 90 % of the tram's forward speed and lands 0.5 s later beside the track
// (at the lateral line of the catcher it is aimed at), so the throw's timing decides where it lands along the track.
// Landing ≤ 0.18 from the catcher = Perfect 20, ≤ 0.4 = Good 10, else it lands in the snow (the streak resets).
// Streak bonus: +5 for every catch from the 5th in a row on. Max = 19 × 20 + 15 × 5 = 455.
import { Path } from '../../life/paths.js';

export const CFG = {
  flight: 0.5, // s in the air
  keepV: 0.9, // share of the tram's forward speed the present keeps
  rear: -0.86, // launch point (the rear platform) along the track from the tram's centre
  hand: 0.12, // launch point to the side of the tram's centre line
  perfect: 0.18, good: 0.4,
  pts: { perfect: 20, good: 10 },
  streakFrom: 5, streakBonus: 5,
  sack: 27, // 19 catchers + 8 spares
  cooldown: 0.24, // grabbing the next present
  maxFlight: 6,
  spawnAhead: 6, // catchers pop up this far ahead of the tram
  defLat: { R: 0.65, L: 1.6 }, // landing line when nobody is waiting on that side
  aimWin: 2.5, // a throw is aimed at a waiting catcher within this distance (along the track) of where it would land
  acc: 0.7, dec: 1.1, endDec: 0.5, // u/s²
  cornerR: 1.2, cornerEase: 0.7, // corner zone (distance from the corner's apex) + speed ease-in before it
  celebrate: 2.6, // s at the last stop before the run ends
};
export const N_CATCH = 19;
export const MAX_SCORE = N_CATCH * CFG.pts.perfect + (N_CATCH - CFG.streakFrom + 1) * CFG.streakBonus; // 455
export const STARS = [0, 190, 330]; // 1★ = route finished; 2★ spec value; 3★ spec 300 + 10 % for the streak bonus (bot-tuned, see index.js)
export const starsFor = (score, finished = true) => (!finished ? 0 : score >= STARS[2] ? 3 : score >= STARS[1] ? 2 : 1);

const H = 1 / 60; // fixed physics step
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Route geometry. nudge(x, z) → [x, z] may push a catcher spot off colliders (the browser passes colliders.resolve).
 * Catchers get an absolute travel distance s (monotonic over the 1.5 laps), their lateral distance from the rails and
 * a spot id (lap-2 visits reuse lap-1 spots: their doorstep lantern is shared).
 */
export function createRoute(layout, nudge = null) {
  const P = layout.PRESENTS;
  const path = new Path(layout.TRAM_LOOP, { closed: true, radius: 1.0 }); // same rounding as life/traffic.js
  const L = path.length;
  const s0 = path.nearestS(0, 6.05); // Park Gate stop, heading west
  const sHill = path.nearestS(0, -6.05);
  const sEnd = s0 + L + ((((sHill - s0) % L) + L) % L); // 1.5 laps: the Sledge Hill stop on lap 2
  const cs = layout.TRAM_LOOP.map(([x, z]) => path.nearestS(x, z));
  const corners = [];
  for (let lap = -1; lap <= 2; lap++) for (const c of cs) corners.push(c + lap * L);
  const F = {};
  const spots = [];
  const catchers = [];
  let prev = s0;
  P.catchers.forEach(([x0, z0, side], i) => {
    let [x, z] = nudge ? nudge(x0, z0) : [x0, z0];
    let key = `${x0},${z0}`;
    let spot = spots.findIndex((p) => p.key === key);
    if (spot < 0) { spot = spots.length; spots.push({ key, x, z, side }); }
    const sl = path.nearestS(x, z);
    let ds = (((sl - prev) % L) + L) % L;
    if (ds > L - 0.5) ds -= L; // (never: catchers are in route order)
    const s = prev + ds;
    path.at(s, F);
    const nx = -F.dz, nz = F.dx; // right of travel (= the plaza side)
    const lat = (x - F.x) * nx + (z - F.z) * nz; // signed: + right, − left
    catchers.push({ i, x, z, side, s, lat: Math.abs(lat), sideOk: (lat > 0) === (side === 'R'), spot });
    prev = s;
  });
  for (const sp of spots) {
    // the doorstep lantern stands a little behind its catcher (away from the rails) and a little along the track
    const c = catchers.find((q) => q.spot === spots.indexOf(sp));
    path.at(c.s, F);
    const sg = c.side === 'R' ? 1 : -1, nx = -F.dz * sg, nz = F.dx * sg;
    let lx = c.x + nx * 0.3 + F.dx * 0.26, lz = c.z + nz * 0.3 + F.dz * 0.26;
    if (nudge) [lx, lz] = nudge(lx, lz, 0.1);
    sp.lamp = [lx, lz];
  }
  return { path, L, s0, sEnd, corners, catchers, spots };
}

/** Speed the tram wants at travel distance s (straights / corners / start / last stop). */
export function targetSpeed(route, s, layoutP) {
  const { speed, cornerSpeed } = layoutP;
  let dc = Infinity;
  for (const c of route.corners) { const d = Math.abs(s - c); if (d < dc) dc = d; }
  let v = cornerSpeed + (speed - cornerSpeed) * sstep(CFG.cornerR, CFG.cornerR + CFG.cornerEase, dc);
  const left = route.sEnd - s;
  v = Math.min(v, Math.sqrt(Math.max(0, 2 * CFG.endDec * left)) + 0.04);
  return v;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/**
 * The run. step(dt) advances in fixed 1/60 substeps and returns this step's events:
 *  spawn {i}, throw {id, side, lag, target, quality, fx, fz, tx, tz, flight}, land {id, side, target, quality, x, z, pts,
 *  bonus, streak}, miss {i} (a catcher passed without a present), empty {}, end {}, done {}.
 * throw(side, lag) is the input (lag ≤ 0.12 s: the throw counts as made lag seconds ago; tap/swipe disambiguation).
 * Phases: ready → ride → celebrate → done.
 */
export function createSim(route, layoutP) {
  const S = {
    phase: 'ready', t: 0, s: route.s0, v: 0, phaseT: 0,
    score: 0, delivered: 0, perfect: 0, good: 0, snow: 0, missed: 0, thrown: 0, streak: 0, bestStreak: 0, bonus: 0,
    sack: CFG.sack, cool: 0, nextId: 1,
  };
  const C = route.catchers.map((c) => ({ ...c, state: 'hidden', claimed: false }));
  const flying = [];
  const out = [];
  const emit = (type, o = {}) => out.push({ type, ...o });
  const F = {};

  /** Along-track distance where a throw made now (lag s ago) lands. */
  const landS = (lag = 0) => S.s - S.v * lag + CFG.rear + CFG.keepV * S.v * CFG.flight;
  function sidePoint(s, side, lat, o) {
    route.path.at(s, F);
    const sg = side === 'R' ? 1 : -1;
    o.x = F.x - F.dz * lat * sg; o.z = F.z + F.dx * lat * sg;
    return o;
  }
  /** The waiting catcher a throw to `side` landing at ls would be aimed at (nearest along the track), or null. */
  function aimAt(side, ls) {
    let best = null, bd = CFG.aimWin;
    for (const c of C) {
      if (c.state !== 'wait' || c.claimed || c.side !== side) continue;
      const d = Math.abs(c.s - ls);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  const api = {
    S, C, flying,
    get finished() { return S.phase === 'done'; },
    landS,
    /** What a throw to `side` right now would do: { s, x, z, target, dist, quality }. */
    predict(side, lag = 0) {
      const ls = landS(lag);
      const c = aimAt(side, ls);
      const p = sidePoint(ls, side, c ? c.lat : CFG.defLat[side], {});
      const dist = c ? Math.hypot(p.x - c.x, p.z - c.z) : Infinity;
      return { s: ls, x: p.x, z: p.z, target: c, dist, quality: dist <= CFG.perfect ? 'perfect' : dist <= CFG.good ? 'good' : 'snow' };
    },
    start() { if (S.phase === 'ready') { S.phase = 'ride'; S.phaseT = 0; } },
    /** Toss a present to 'L' or 'R'. Returns the throw event or null (not riding / cooling down / sack empty / hands full). */
    throw(side, lag = 0) {
      if (side !== 'L' && side !== 'R') return null;
      if (S.phase !== 'ride' || S.cool > 0 || flying.length >= CFG.maxFlight) return null;
      if (S.sack <= 0) { emit('empty'); return null; }
      lag = clamp(lag, 0, 0.12);
      const pr = api.predict(side, lag);
      const sl = S.s - S.v * lag + CFG.rear;
      route.path.at(sl, F);
      const sg = side === 'R' ? 1 : -1;
      const fx = F.x - F.dz * CFG.hand * sg, fz = F.z + F.dx * CFG.hand * sg;
      const quality = pr.quality;
      const target = pr.target && quality !== 'snow' ? pr.target.i : (pr.target ? pr.target.i : -1);
      if (pr.target && quality !== 'snow') pr.target.claimed = true;
      const f = { id: S.nextId++, side, lag, target, quality, fx, fz, tx: pr.x, tz: pr.z, flight: CFG.flight, t: lag, dist: pr.dist };
      flying.push(f);
      S.sack--; S.thrown++; S.cool = CFG.cooldown;
      const ev = { type: 'throw', ...f };
      out.push(ev);
      return ev;
    },
    /** Advance; returns the events since the last step (including throws made in between). */
    step(dt) {
      let left = Math.min(dt, 0.25);
      while (left > 1e-9) { const h = Math.min(H, left); sub(h); left -= h; }
      const evs = out.slice();
      out.length = 0;
      return evs;
    },
    result() {
      return { score: S.score, stars: starsFor(S.score, S.phase === 'done' || S.phase === 'celebrate'), delivered: S.delivered, perfect: S.perfect, good: S.good, snow: S.snow, missed: S.missed, thrown: S.thrown, bestStreak: S.bestStreak, bonus: S.bonus, time: +S.t.toFixed(1) };
    },
  };

  function land(f) {
    const c = f.target >= 0 ? C[f.target] : null;
    if (f.quality !== 'snow' && c) {
      c.state = 'caught';
      const pts = CFG.pts[f.quality];
      S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      const bonus = S.streak >= CFG.streakFrom ? CFG.streakBonus : 0;
      S.score += pts + bonus; S.bonus += bonus; S.delivered++;
      if (f.quality === 'perfect') S.perfect++; else S.good++;
      emit('land', { id: f.id, side: f.side, target: c.i, quality: f.quality, x: c.x, z: c.z, pts, bonus, streak: S.streak });
    } else {
      S.snow++;
      const had = S.streak;
      S.streak = 0;
      emit('land', { id: f.id, side: f.side, target: c ? c.i : -1, quality: 'snow', x: f.tx, z: f.tz, pts: 0, bonus: 0, streak: 0, broke: had });
    }
  }

  function sub(h) {
    S.t += h; S.phaseT += h;
    if (S.cool > 0) S.cool -= h;
    if (S.phase === 'ride') {
      const vt = Math.max(0.12, targetSpeed(route, S.s, layoutP));
      const dv = vt - S.v;
      S.v = Math.max(0, S.v + clamp(dv, -CFG.dec * h, CFG.acc * h));
      S.s = Math.min(route.sEnd, S.s + S.v * h);
      if (route.sEnd - S.s < 0.01 && S.v < 0.2) { S.s = route.sEnd; S.v = 0; S.phase = 'celebrate'; S.phaseT = 0; emit('end'); }
    } else if (S.phase === 'celebrate') {
      if (S.phaseT >= CFG.celebrate && !flying.length) { S.phase = 'done'; emit('done'); }
    }
    // catchers: pop up ahead, count as missed once a throw can no longer reach them
    if (S.phase === 'ride' || S.phase === 'celebrate') {
      const ls = landS(0);
      for (const c of C) {
        if (c.state === 'hidden' && c.s - S.s <= CFG.spawnAhead) { c.state = 'wait'; emit('spawn', { i: c.i }); }
        if (c.state === 'wait' && !c.claimed && (ls > c.s + CFG.good + 0.05 || S.phase === 'celebrate')) {
          c.state = 'missed'; S.missed++;
          const had = S.streak; S.streak = 0;
          emit('miss', { i: c.i, broke: had });
        }
      }
    }
    for (let k = flying.length - 1; k >= 0; k--) {
      const f = flying[k];
      f.t += h;
      if (f.t >= f.flight) { flying.splice(k, 1); land(f); }
    }
  }
  return api;
}

/**
 * Bots for tuning and ?mgauto. Per catcher: a timing error (gaussian, seconds), sometimes the wrong side, sometimes
 * no throw at all. perfect: exact · good: σ 0.11 s, 3 % wrong side, 3 % skipped · sloppy: σ 0.24 s, 12 % / 12 % ·
 * none: never throws (the route still finishes: 1★).
 */
export function makeBot(mode = 'good', seed = 7) {
  const cfg = { perfect: { sd: 0, wrong: 0, skip: 0 }, good: { sd: 0.11, wrong: 0.03, skip: 0.03 }, sloppy: { sd: 0.24, wrong: 0.12, skip: 0.12 } }[mode];
  const rnd = rng(seed);
  const plan = new Map();
  return (sim) => {
    const S = sim.S;
    if (!cfg || S.phase !== 'ride') return null;
    const ls = sim.landS(0);
    for (const c of sim.C) {
      if (c.state !== 'wait' || c.claimed) continue;
      let p = plan.get(c.i);
      if (!p) { p = { err: gauss(rnd) * cfg.sd, wrong: rnd() < cfg.wrong, skip: rnd() < cfg.skip, done: false }; plan.set(c.i, p); }
      if (p.done || p.skip) continue;
      // throw once the landing point reaches the catcher (+ the timing error); the perfect bot aims half a frame early
      const lead = mode === 'perfect' ? 0.5 * S.v / 30 : 0;
      if (ls + lead >= c.s + p.err * Math.max(0.3, S.v)) {
        const side = p.wrong ? (c.side === 'R' ? 'L' : 'R') : c.side;
        if (sim.throw(side, 0)) { p.done = true; return side; }
      }
    }
    return null;
  };
}
