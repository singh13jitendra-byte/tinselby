// Sledge Hill Race — course data + pure helpers (no DOM, no rendering; runs in node for tests).
// Two runs share the start (layout ARENAS.sled.top) and a finish pad at the hill bottom:
//   run 1 "Pine Run"       west of the tree column that splits Sledge Hill (narrow chute, 2 traverses);
//   run 2 "Cable Car Run"  east half, under the cable-car side of the hill (4 traverses with hairpins).
// The hill's own pines sit in a near-solid column at x ≈ −1, so a single course cannot cross the hill; two
// heats (best total time) use both halves and give a ~40 s race.
// Lateral convention: d > 0 is to the RIGHT of the travel direction; right = (−tz, tx).
import { HILL } from '../../core/layout.js';

/** Control points [x, z, width]. Hand-routed around the hill's existing pines (see tools notes in the report). */
export const RUN_DEFS = [
  {
    id: 'west', name: 'Pine Run', flag: 0,
    pts: [
      [-1.1, -15.35, 0.72], [-1.6, -15.12, 0.72], [-2.02, -14.78, 0.74], [-2.22, -14.25, 0.78], [-2.36, -13.75, 0.85],
      [-2.9, -13.33, 0.95], [-3.9, -13.2, 1.0], [-4.75, -13.12, 1.0], [-5.25, -12.92, 1.0], [-5.55, -12.45, 1.0],
      [-5.28, -11.98, 1.0], [-4.4, -11.84, 1.0], [-3.25, -11.8, 1.0], [-2.62, -11.55, 1.0], [-2.5, -11.0, 1.0],
      [-2.47, -10.3, 1.05], [-2.32, -9.62, 1.05], [-1.78, -9.02, 1.0], [-1.0, -8.78, 1.0], [-0.2, -8.73, 1.0], [0.42, -8.71, 1.0],
    ],
  },
  {
    id: 'east', name: 'Cable Car Run', flag: 1,
    pts: [
      [-1.1, -15.35, 0.62], [-0.5, -15.52, 0.62], [0.1, -15.42, 0.68], [0.42, -14.95, 0.74], [0.43, -14.45, 0.8],
      [0.62, -13.85, 0.85], [1.25, -13.38, 0.92], [2.3, -13.42, 0.95], [3.6, -13.55, 0.95], [4.55, -13.55, 0.95],
      [5.12, -13.28, 0.95], [5.38, -12.78, 0.95], [5.08, -12.3, 0.95], [4.2, -12.18, 0.95], [3.0, -12.15, 0.95],
      [2.05, -12.1, 0.95], [1.4, -11.85, 0.95], [1.12, -11.4, 0.95], [1.42, -10.98, 0.95], [2.3, -10.88, 0.95],
      [3.6, -10.95, 0.95], [4.6, -10.98, 0.95], [5.22, -10.72, 0.95], [5.42, -10.3, 0.95], [5.05, -9.92, 0.95],
      [4.1, -9.88, 0.95], [3.2, -9.85, 0.95], [2.72, -9.5, 0.95], [2.45, -9.02, 0.95], [1.8, -8.83, 1.0],
      [0.8, -8.8, 1.0], [-0.2, -8.74, 1.0], [-0.85, -8.72, 1.0],
    ],
  },
];

export const FINISH = { x: -0.2, z: -8.74, pad: [-0.98, -9.3, 0.58, -8.2] }; // finish line x; pad rect [x0, z0, x1, z1]
export const DS = 0.05; // sample spacing along a course

// ------------------------------------------------------------------ spline sampling
function catmull(p0, p1, p2, p3, t) {
  // centripetal Catmull-Rom (alpha 0.5) in 2D + width
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => a.map((v, i) => ((tb - u) / (tb - ta)) * v + ((u - ta) / (tb - ta)) * b[i]);
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

/**
 * Sample a run into a dense, arc-length-parameterised centreline.
 * ground(x, z) → surface height. Returns { n, len, x, z, y, tx, tz, w, k (signed curvature), grade }.
 */
export function sampleRun(def, ground) {
  const P = def.pts;
  const ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1], P[0][2]], ...P, [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1], P[P.length - 1][2]]];
  const dense = [];
  for (let i = 1; i < ext.length - 2; i++) for (let k = 0; k < 40; k++) dense.push(catmull(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / 40));
  dense.push(P[P.length - 1].slice());
  // arc-length resample
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const len = cum[cum.length - 1];
  const n = Math.floor(len / DS) + 1;
  const x = new Float32Array(n), z = new Float32Array(n), y = new Float32Array(n), w = new Float32Array(n);
  const tx = new Float32Array(n), tz = new Float32Array(n), k = new Float32Array(n), grade = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * DS;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = Math.min(1, Math.max(0, (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j])));
    x[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
    z[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
    w[i] = dense[j][2] + (dense[j + 1][2] - dense[j][2]) * f;
    y[i] = ground(x[i], z[i]);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3);
    const cr = tx[a] * tz[b] - tz[a] * tx[b];
    const dot = tx[a] * tx[b] + tz[a] * tz[b];
    k[i] = Math.atan2(cr, dot) / Math.max(DS, (b - a) * DS); // > 0: turning right (clockwise seen from above)
    const ga = Math.max(0, i - 4), gb = Math.min(n - 1, i + 4);
    grade[i] = (y[ga] - y[gb]) / Math.max(DS, (gb - ga) * DS); // > 0 downhill
  }
  return { id: def.id, name: def.name, flag: def.flag, n, len: (n - 1) * DS, x, z, y, tx, tz, w, k, grade };
}

/** Interpolated frame at arc length s: { x, z, y, tx, tz, rx, rz, w, k, grade }. */
export function frameAt(C, s, out = {}) {
  const f = Math.min(C.n - 1.0001, Math.max(0, s / DS));
  const i = Math.floor(f), t = f - i, j = Math.min(C.n - 1, i + 1);
  const L = (A) => A[i] + (A[j] - A[i]) * t;
  out.x = L(C.x); out.z = L(C.z); out.y = L(C.y); out.w = L(C.w); out.k = L(C.k); out.grade = L(C.grade);
  let tx = L(C.tx), tz = L(C.tz);
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l; out.tz = tz / l;
  out.rx = -out.tz; out.rz = out.tx;
  return out;
}

/** World point at (s, d). */
export function pointAt(C, s, d, out = {}) {
  frameAt(C, s, out);
  out.x += out.rx * d; out.z += out.rz * d;
  return out;
}

/** Closest course sample to (x, z) → { s, d, dist } (brute force with a coarse pass). */
export function project(C, x, z) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < C.n; i += 4) { const d = (C.x[i] - x) ** 2 + (C.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  for (let i = Math.max(0, best - 6); i <= Math.min(C.n - 1, best + 6); i++) { const d = (C.x[i] - x) ** 2 + (C.z[i] - z) ** 2; if (d <= bd) { bd = d; best = i; } }
  const dx = x - C.x[best], dz = z - C.z[best];
  return { s: best * DS, d: dx * -C.tz[best] + dz * C.tx[best], along: dx * C.tx[best] + dz * C.tz[best], dist: Math.sqrt(bd), i: best };
}

// ------------------------------------------------------------------ world obstacles (the hill's pines, lamps, pylons…)
/**
 * Find blocking colliders near the courses by probing colliders.resolve on a grid, clustering the blocked cells
 * into circles. probe(x, z) → displaced {x, z} (or null if free). Returns [{x, z, r, R (visual radius), tree}].
 */
export function probeObstacles(courses, probe) {
  const step = 0.045;
  const cells = new Map();
  const seen = new Set();
  for (const C of courses) {
    for (let i = 0; i < C.n; i += 3) {
      const reach = C.w[i] / 2 + 1.0;
      const i0 = Math.round((C.x[i] - reach) / step), i1 = Math.round((C.x[i] + reach) / step);
      const j0 = Math.round((C.z[i] - reach) / step), j1 = Math.round((C.z[i] + reach) / step);
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
        const key = a + ',' + b;
        if (seen.has(key)) continue;
        seen.add(key);
        const x = a * step, z = b * step;
        if (z < -16.6) continue; // world-edge clamp, not an obstacle
        const p = probe(x, z);
        if (p) cells.set(key, [x, z, p.x, p.z]);
      }
    }
  }
  const out = [];
  const done = new Set();
  for (const [key] of cells) {
    if (done.has(key)) continue;
    const queue = [key], pts = [];
    done.add(key);
    while (queue.length) {
      const c = queue.pop();
      pts.push(cells.get(c));
      const [a, b] = c.split(',').map(Number);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        const kk = (a + da) + ',' + (b + db);
        if (cells.has(kk) && !done.has(kk)) { done.add(kk); queue.push(kk); }
      }
    }
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cz += p[1]; }
    cx /= pts.length; cz /= pts.length;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p[2] - cx, p[3] - cz));
    if (r < 0.3) {
      // city pines / pom trees: collider = 0.13 × scale, lowest knitted tier ≈ 0.42 × scale → visual ≈ 3.15 r
      const tree = r > 0.105 && Math.abs(cx - HILL.cableBase.x) > 0.05;
      out.push({ x: cx, z: cz, r, R: tree ? r * 3.15 : r + 0.06, tree });
    } else {
      // walls / benches / stations (segment colliders): keep their outline as a chain of small posts
      const kept = [];
      for (const p of pts) if (!kept.some((q) => Math.hypot(q[0] - p[2], q[1] - p[3]) < 0.09)) kept.push([p[2], p[3]]);
      for (const [x, z] of kept) out.push({ x, z, r: 0.02, R: 0.08, tree: false });
    }
  }
  return out;
}

// ------------------------------------------------------------------ course content
function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const SLED_R = 0.12; // sled collision radius
export const dmaxAt = (w) => Math.max(0.06, w / 2 - 0.15);

/**
 * Lay out gates, stars, snow lumps, extra pines and gnome riders along a course, avoiding world obstacles.
 * Returns { hazards:[{s,d,x,z,r,kind,R?}], gates:[{s,d,hw,x,z}], stars:[{s,d,x,z}], gnomes:[{s0,d0,v}] }.
 */
export function layoutRun(C, obstacles, seed = 7, opts = {}) {
  const minGap = opts.minGap || 2.35; // night race packs the gates closer
  const thinStars = opts.thinStars || 0; // night race: drop every n-th collectible (0 = keep all)
  const rnd = rng(seed);
  const hazards = [];
  // existing world obstacles near the track become hazards (pines bump at ~70% of their branch radius)
  for (const o of obstacles) {
    const p = project(C, o.x, o.z);
    if (Math.abs(p.along) > 0.3) continue; // beyond the course ends
    const w = C.w[p.i];
    const rb = o.tree ? o.R * 0.62 : o.r + 0.02;
    if (Math.abs(p.d) - rb < w / 2 + 0.05) hazards.push({ s: p.s, d: p.d, x: o.x, z: o.z, r: rb, kind: o.tree ? 'tree' : 'post', world: true, R: o.R });
  }
  const clear = (s, d, r) => {
    for (const h of hazards) if (Math.abs(h.s - s) < h.r + r + 0.4) { const a = pointAt(C, s, d), b = { x: h.x, z: h.z }; if (Math.hypot(a.x - b.x, a.z - b.z) < h.r + r) return false; }
    for (const o of obstacles) { const a = pointAt(C, s, d); if (Math.hypot(a.x - o.x, a.z - o.z) < o.R + r * 0.6) return false; }
    return true;
  };
  const sharp = (s) => Math.abs(frameAt(C, s).k) > 1.15;
  const inPad = (s) => { const f = frameAt(C, s); return f.x > FINISH.pad[0] - 0.4 && f.x < FINISH.pad[2] + 0.4 && f.z > FINISH.pad[1] && f.z < FINISH.pad[3]; };
  const endS = C.len - 1.3;

  // gates: every ~2.5 units on calm stretches, alternating sides (gentle slalom)
  const gates = [];
  let side = rnd() < 0.5 ? -1 : 1;
  for (let s = 2.4; s < endS - 0.4; s += 0.1) {
    if (gates.length && s - gates[gates.length - 1].s < minGap) continue;
    if (sharp(s) || sharp(s - 0.3) || sharp(s + 0.3) || inPad(s)) continue;
    const f = frameAt(C, s), dm = dmaxAt(f.w);
    if (dm < 0.28) continue;
    const hw = 0.3;
    let placed = false;
    for (const off of [side * dm * 0.62, side * dm * 0.35, side * dm * 0.12, -side * dm * 0.3]) {
      // the gate's whole mouth must be free of hazards
      let ok = true;
      for (let q = -hw + 0.08; q <= hw - 0.08 + 1e-6; q += 0.08) if (!clear(s, off + q, SLED_R + 0.03)) { ok = false; break; }
      for (const q of [-0.5, -0.25, 0.25, 0.5, 0.75]) if (ok && !clear(s + q, off, SLED_R + 0.08)) ok = false;
      if (ok) { const p = pointAt(C, s, off); gates.push({ s, d: off, hw, x: p.x, z: p.z }); placed = true; break; }
    }
    if (placed) side = -side;
  }

  // own hazards: snow lumps + small pines on straight-ish stretches between gates
  const own = [];
  const bounds = [{ s: 1.4, d: 0 }, ...gates, { s: endS, d: 0 }];
  for (let gi = 0; gi < bounds.length - 1; gi++) {
    const a = bounds[gi].s, b = bounds[gi + 1].s;
    if (b - a < 1.7) continue;
    const slots = b - a > 3.4 ? [0.3, 0.5, 0.72] : [0.5];
    for (const u of slots) {
      if (rnd() < 0.15) continue;
      const s = a + (b - a) * (u + (rnd() - 0.5) * 0.12);
      if (Math.abs(frameAt(C, s).k) > 1.6 || inPad(s) || s < 2) continue;
      const f = frameAt(C, s), dm = dmaxAt(f.w);
      if (dm < 0.2) continue;
      const kind = rnd() < 0.6 ? 'lump' : 'pine';
      const r = kind === 'lump' ? 0.15 : 0.17;
      // block one side, leave the other open (opposite the next gate's side, so it reads as a choice)
      const nextD = bounds[gi + 1].d || (rnd() < 0.5 ? 0.1 : -0.1);
      const d = (nextD >= 0 ? -1 : 1) * dm * (0.3 + rnd() * 0.45);
      if (!clear(s, d, r + 0.05)) continue;
      // keep a sled-wide gap open on the other side
      if (dm - Math.abs(d) + dm < r + 2 * SLED_R + 0.1) continue;
      const p = pointAt(C, s, d);
      const hz = { s, d, x: p.x, z: p.z, r: r + 0.04, kind, own: true, scale: 0.85 + rnd() * 0.35 };
      hazards.push(hz); own.push(hz);
    }
  }

  // stars: little arcs leading from each gate toward the next one (follow them = pass the gates)
  const stars = [];
  let cand = 0;
  const pts = [{ s: 0.9, d: 0 }, ...gates.map((g) => ({ s: g.s, d: g.d })), { s: endS, d: 0 }];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], gap = b.s - a.s;
    const m = gap > 2.2 ? 3 : gap > 1.3 ? 2 : 1;
    for (let k = 1; k <= m; k++) {
      const u = k / (m + 1), s = a.s + gap * u;
      if (inPad(s)) continue;
      const f = frameAt(C, s), dm = dmaxAt(f.w);
      const bulge = (i % 2 ? 1 : -1) * Math.min(0.16, dm * 0.5) * Math.sin(Math.PI * u) * (Math.abs(b.d - a.d) < 0.2 ? 1.6 : 1);
      let d = a.d + (b.d - a.d) * (u * u * (3 - 2 * u)) + bulge;
      d = Math.max(-dm, Math.min(dm, d));
      // nudge away from hazards
      let ok = clear(s, d, 0.14);
      for (const off of [0.15, -0.15, 0.3, -0.3]) { if (ok) break; const dd = Math.max(-dm, Math.min(dm, d + off)); if (clear(s, dd, 0.14)) { d = dd; ok = true; } }
      if (!ok) continue;
      if (thinStars && ++cand % thinStars === 0) continue;
      const p = pointAt(C, s, d);
      stars.push({ s, d, x: p.x, z: p.z });
    }
  }

  // gnome riders: start spread along the course, slower than the player
  const gnomes = [];
  const nG = C.len > 20 ? 3 : 2;
  for (let g = 0; g < nG; g++) {
    const s0 = C.len * (0.22 + (g / nG) * 0.55) + rnd() * 0.6;
    gnomes.push({ s0, d0: (g % 2 ? 1 : -1) * 0.18, v: 0.42 + rnd() * 0.12 });
  }
  return { hazards, gates, stars, own, gnomes };
}

/**
 * Pick the best lateral target at s for an AI rider (autopilot / gnomes).
 * items: { hazards, gates?, stars? }, taken: Set of star indices. Returns d.
 */
export function chooseLane(C, run, s, d, opts = {}) {
  const { look = 1.5, wantGates = true, wantStars = true, taken = null, passed = null, avoid = [] } = opts;
  const f = frameAt(C, s + 0.5), dm = dmaxAt(f.w);
  let best = d, bestScore = -1e9;
  for (let c = -4; c <= 4; c++) {
    const cand = (c / 4) * dm;
    let score = -Math.abs(cand - d) * 0.6;
    for (const h of [...run.hazards, ...avoid]) {
      const ds = h.s - s;
      if (ds < -0.15 || ds > look) continue;
      const gap = Math.abs(cand - h.d) - (h.r + SLED_R + 0.06);
      const near = Math.max(0.12, Math.min(1, 1.25 - ds));
      if (gap < 0) score -= (8 + -gap * 6) * near;
      else if (gap < 0.12) score -= (0.12 - gap) * 6 * near;
    }
    if (wantGates && run.gates) {
      for (let gi = 0; gi < run.gates.length; gi++) {
        const g = run.gates[gi];
        if (passed && passed[gi] !== undefined) continue;
        const ds = g.s - s;
        if (ds < 0 || ds > look + 0.8) continue;
        score -= Math.abs(cand - g.d) * 4.5 * (1.25 - ds / (look + 1));
        break;
      }
    }
    if (wantStars && run.stars) {
      for (let si = 0; si < run.stars.length; si++) {
        if (taken && taken.has(si)) continue;
        const st = run.stars[si], ds = st.s - s;
        if (ds < 0 || ds > look) continue;
        score -= Math.abs(cand - st.d) * 1.4 * (1 - ds / (look + 0.3));
      }
    }
    if (score > bestScore) { bestScore = score; best = cand; }
  }
  return best;
}
