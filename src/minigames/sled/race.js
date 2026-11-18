// Sledge Hill Race — gameplay simulation on the course rails (pure: no THREE, no DOM; node-testable).
// The sled moves along a run's centreline at speed v (arc length s) with a lateral offset d the player steers.
import { frameAt, pointAt, chooseLane, dmaxAt, SLED_R, FINISH } from './course.js';

export const TUNING = {
  steerSpeed: 1.5, // lateral speed at full steer (units / s)
  steerResp: 9, // lateral response (1/s)
  drift: 0.2, // outward push in turns (× k v²)
  vMin: 0.68, vMax: 1.75, vBase: 0.8, vSlope: 2.5, // target speed = base + slope × downhill grade
  accel: 0.95, // units / s² when building speed
  turnGrip: 1.25, // lateral accel limit in turns → speed cap sqrt(grip / |k|)
  bumpKeep: 0.42, // speed kept after a bump
  gnomeR: 0.13, starR: 0.2, penalty: 2, // seconds added per missed gate
};

/**
 * runs: [{ C (sampled course), L (layoutRun result) }]. Returns the race object; call step(dt, steer) each frame.
 * step returns an array of events: {type:'star'|'gate'|'bump'|'edge'|'finish', …}.
 */
export function createRace(runs, opts = {}) {
  const T = { ...TUNING, ...(opts.tuning || {}) };
  const race = {
    runs, heat: 0, s: 0, d: 0, vd: 0, v: 0, steer: 0,
    time: 0, penalty: 0, runTimes: [], phase: 'ready', // ready → run → runout → (next heat) … → done
    stars: runs.map(() => new Set()), gates: runs.map((r) => new Array(r.L.gates.length).fill(undefined)),
    bumps: 0, bumpT: 0, streak: 0, edgeT: 0, hitCool: new Map(), gnomes: [],
    finishS: runs.map((r) => finishS(r.C)),
    get run() { return runs[race.heat]; },
    get totalStars() { return runs.reduce((a, r) => a + r.L.stars.length, 0); },
    get starCount() { return race.stars.reduce((a, s) => a + s.size, 0); },
    get totalGates() { return runs.reduce((a, r) => a + r.L.gates.length, 0); },
    get gateCount() { return race.gates.reduce((a, g) => a + g.filter((x) => x === true).length, 0); },
    get clock() { return race.time + race.penalty; },
    startHeat(h) {
      race.heat = h; race.s = 0.05; race.d = 0; race.vd = 0; race.v = 0; race.bumpT = 0; race.streak = 0;
      race.phase = 'run';
      race.hitCool.clear();
      const r = runs[h];
      race.gnomes = r.L.gnomes.map((g, i) => ({ i, s: g.s0, d: g.d0, v: g.v, vd: 0, hitT: 0, wob: 0, gone: 0 }));
    },
    /** Lane the autopilot would take right now. */
    autoSteer(extraAvoid = []) {
      const r = race.run;
      const avoid = race.gnomes.filter((g) => !g.gone).map((g) => ({ s: g.s + g.v * 0.9, d: g.d, r: T.gnomeR })).concat(extraAvoid);
      const target = chooseLane(r.C, r.L, race.s, race.d, { taken: race.stars[race.heat], passed: race.gates[race.heat], avoid, look: 1.7 });
      return Math.max(-1, Math.min(1, (target - race.d) * 5));
    },
    /** extra: [{ id, x, z, r }] — moving things in the world (the town's own sledders) that also bump. */
    step(dt, steer = 0, extra = null) {
      const ev = [];
      if (race.phase !== 'run' && race.phase !== 'runout') { stepGnomes(dt); return ev; }
      const r = race.run, C = r.C;
      const f = frameAt(C, race.s);
      const dm = dmaxAt(f.w);
      // ---- steering
      if (race.phase === 'runout') steer = Math.max(-1, Math.min(1, -race.d * 3));
      race.steer = steer;
      race.vd += (steer * T.steerSpeed - race.vd) * (1 - Math.exp(-dt * T.steerResp));
      const drift = -f.k * race.v * race.v * T.drift;
      race.d += (race.vd + drift) * dt;
      if (Math.abs(race.d) > dm) {
        race.d = Math.sign(race.d) * dm; race.vd = 0;
        race.v *= 1 - 0.5 * dt;
        race.edgeT += dt;
        if (race.edgeT > 0.25) { race.edgeT = 0; ev.push({ type: 'edge', side: Math.sign(race.d) }); }
      }
      // ---- speed: builds with the downhill grade, eased in tight turns
      if (race.phase === 'run') {
        let target = T.vBase + T.vSlope * Math.max(0, f.grade) - 0.6 * Math.max(0, -f.grade) + Math.min(5, race.streak) * 0.035;
        target = Math.max(T.vMin, Math.min(T.vMax, target));
        const cap = Math.sqrt(T.turnGrip / Math.max(0.05, Math.abs(f.k)));
        target = Math.min(target, Math.max(T.vMin, cap));
        const acc = race.bumpT > 0 ? T.accel * 0.45 : T.accel;
        if (race.v < target) race.v = Math.min(target, race.v + acc * dt);
        else race.v += (target - race.v) * (1 - Math.exp(-dt * 1.6));
        race.time += dt;
      } else {
        race.v *= Math.exp(-dt * 2.6);
        if (race.v < 0.04) race.v = 0;
      }
      race.bumpT = Math.max(0, race.bumpT - dt);
      const s0 = race.s;
      race.s = Math.min(C.len - 0.02, race.s + race.v * dt);
      const P = pointAt(C, race.s, race.d);
      // ---- collisions with hazards (world pines / posts, own lumps & pines)
      for (let i = 0; i < r.L.hazards.length; i++) {
        const h = r.L.hazards[i];
        if (Math.abs(h.s - race.s) > h.r + 0.5) continue;
        const dist = Math.hypot(P.x - h.x, P.z - h.z), min = h.r + SLED_R;
        if (dist < min) {
          // push out sideways and slow down (only once per contact)
          const away = Math.sign(race.d - h.d) || (race.d >= 0 ? 1 : -1);
          race.d = Math.max(-dm, Math.min(dm, race.d + away * (min - dist + 0.02)));
          const key = 'h' + i;
          if (!(race.hitCool.get(key) > 0)) {
            race.hitCool.set(key, 0.9);
            bump(ev, h.kind, h.x, h.z, i);
          }
        }
      }
      // ---- gnome riders
      stepGnomes(dt);
      for (const g of race.gnomes) {
        if (g.gone > 0.5 || Math.abs(g.s - race.s) > 0.6) continue;
        const Q = pointAt(C, g.s, g.d);
        const dist = Math.hypot(P.x - Q.x, P.z - Q.z), min = T.gnomeR + SLED_R;
        if (dist < min) {
          const away = Math.sign(race.d - g.d) || 1;
          race.d = Math.max(-dm, Math.min(dm, race.d + away * (min - dist) * 0.6));
          g.vd -= away * 0.9;
          if (!(g.hitT > 0)) { g.hitT = 1; g.wob = 1; bump(ev, 'gnome', Q.x, Q.z, g.i); }
        }
      }
      if (extra) for (const o of extra) {
        const dist = Math.hypot(P.x - o.x, P.z - o.z), min = o.r + SLED_R;
        if (dist >= min || (o.va !== undefined && race.v - o.va < 0.1)) continue;
        const key = 'x' + o.id;
        if (race.hitCool.get(key) > 0) continue;
        race.hitCool.set(key, 1.4);
        const q = { s: race.s, d: race.d };
        const away = ((P.x - o.x) * -C.tz[Math.round(race.s / (C.len / (C.n - 1)))] + (P.z - o.z) * C.tx[Math.round(race.s / (C.len / (C.n - 1)))]) >= 0 ? 1 : -1;
        race.d = Math.max(-dm, Math.min(dm, q.d + away * 0.12));
        bump(ev, 'townie', o.x, o.z, o.id);
      }
      for (const [k, v] of race.hitCool) race.hitCool.set(k, v - dt);
      // ---- stars
      const taken = race.stars[race.heat];
      r.L.stars.forEach((st, i) => {
        if (taken.has(i) || Math.abs(st.s - race.s) > 0.35) return;
        if (Math.hypot(P.x - st.x, P.z - st.z) < T.starR) { taken.add(i); ev.push({ type: 'star', i, x: st.x, z: st.z }); }
      });
      // ---- gates (decided when the sled crosses the gate line)
      const passed = race.gates[race.heat];
      r.L.gates.forEach((g, i) => {
        if (passed[i] !== undefined || !(s0 < g.s && race.s >= g.s)) return;
        const ok = Math.abs(race.d - g.d) <= g.hw + 0.02;
        passed[i] = ok;
        if (ok) race.streak++; else { race.streak = 0; race.penalty += T.penalty; }
        ev.push({ type: 'gate', i, ok, x: g.x, z: g.z });
      });
      // ---- finish line
      if (race.phase === 'run' && s0 < race.finishS[race.heat] && race.s >= race.finishS[race.heat]) {
        race.phase = 'runout';
        race.runTimes[race.heat] = race.time - race.runTimes.reduce((a, b) => a + (b || 0), 0);
        ev.push({ type: 'finish', heat: race.heat, last: race.heat === runs.length - 1 });
      }
      return ev;
    },
  };

  function bump(ev, kind, x, z, i) {
    race.v *= T.bumpKeep;
    race.bumpT = 1.1;
    race.streak = 0;
    race.bumps++;
    ev.push({ type: 'bump', kind, x, z, i });
  }

  function stepGnomes(dt) {
    const r = race.run;
    if (!r) return;
    const C = r.C;
    for (const g of race.gnomes) {
      g.hitT = Math.max(0, g.hitT - dt);
      g.wob = Math.max(0, g.wob - dt * 1.4);
      if (race.phase !== 'run' && race.phase !== 'runout') continue;
      const f = frameAt(C, g.s), dm = dmaxAt(f.w);
      if (g.s > C.len - 1.7) { g.gone = Math.min(1, g.gone + dt * 1.5); g.v *= Math.exp(-dt * 2); }
      const target = chooseLane(C, r.L, g.s, g.d, { wantGates: false, wantStars: false, look: 1.1 });
      g.vd += ((target - g.d) * 2.2 - g.vd) * (1 - Math.exp(-dt * 3));
      g.d = Math.max(-dm, Math.min(dm, g.d + g.vd * dt));
      g.s = Math.min(C.len - 0.05, g.s + g.v * (g.hitT > 0 ? 0.5 : 1) * dt);
    }
  }
  return race;
}

/** Arc length where a course crosses the finish line (x = FINISH.x, near its end). */
export function finishS(C) {
  for (let i = C.n - 2; i > 0; i--) {
    if ((C.x[i] - FINISH.x) * (C.x[i + 1] - FINISH.x) <= 0 && Math.abs(C.z[i] - FINISH.z) < 0.6) return i * (C.len / (C.n - 1));
  }
  return C.len - 0.7;
}

/** Score + star rating. tFast: seconds for the "fast" star. */
export function scoreRace(race, tFast) {
  const T = race.clock, nS = race.starCount, NS = race.totalStars, nG = race.gateCount, NG = race.totalGates;
  const fast = T <= tFast;
  const most = nS >= Math.ceil(NS * 0.7);
  const stars = 1 + (fast || most ? 1 : 0) + (fast && most ? 1 : 0);
  const score = Math.max(0, Math.round(500 + nS * 30 + nG * 20 + Math.max(0, 75 - T) * 15));
  return { score, stars, fast, most, T, nS, NS, nG, NG };
}
