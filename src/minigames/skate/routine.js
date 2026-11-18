// Figure Skating (door 9): the routine = one long path on Frostmere Lake (lead-in, three patterns joined by short
// connectors, a closing glide) plus the beat map that says where the music wants the skater to be.
// Pure logic, no THREE: shared by index.js (render) and tune.mjs (node bot tuning).
//
// Local frame: u = east (world +x), v = north (world −z), so a positive turn rate is a left turn (counter-clockwise
// as seen from the camera on the south shore). World: x = FIT.x + u, z = FIT.z − v.

/** Usable ellipse for the patterns: ARENAS.skate trimmed so nothing touches the pier (world x 9.5…12.3, z 0.89…1.51). */
export const FIT = { x: 15.2, z: 1.65, rx: 2.75, rz: 2.4 };
/** Hard edge for the skater (soft push-back past it). */
export const EDGE = { rx: 2.85, rz: 2.5 };
export const START = { x: 14.6, z: 3.6 }; // WAVE2 §Door 9
export const BEATS = 32; // per pattern (≈ 19 s at 100 bpm), one star per beat
export const RING_EVERY = 8; // twirl ring on every 8th beat of a pattern
export const LEAD_BEATS = 4;
export const OUTRO_BEATS = 4;
export const DS = 0.02; // path sample spacing (world units)
export const KMAX = 2.1; // tightest turn in a pattern (1 / radius)
export const PATTERNS = [
  { kind: 'eight', name: 'Figure eight' },
  { kind: 'heart', name: 'Heart' },
  { kind: 'flake', name: 'Snowflake loop' },
];

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Raw closed curve (no duplicated end point), arbitrary scale, centred later. */
function raw(kind, portrait, n = 900) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    if (kind === 'eight') pts.push([3.0 * Math.sin(t), 1.9 * Math.sin(t) * Math.cos(t)]); // lemniscate of Gerono, a 3.0 b 1.9
    else if (kind === 'heart') pts.push([16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
    else { // r = cos 3θ over θ ∈ [0, π): three petals, turned so one points up (north). The petals are plumped up
      // (sign-keeping power 0.45) because the plain rose's tips are far too tight to skate.
      const th = t / 2, c3 = Math.cos(3 * th), r = Math.sign(c3) * Math.abs(c3) ** (portrait ? 0.32 : 0.45), a = th + Math.PI / 2;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  return pts;
}

function lengthOf(pts, closed) {
  let L = 0;
  for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}
/** Uniform resample by arclength. closed: the result has no duplicated end point. */
export function resample(pts, ds, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
  const L = cum[cum.length - 1];
  const n = Math.max(2, Math.round(L / ds));
  const out = [];
  let j = 1;
  const m = closed ? n : n + 1;
  for (let i = 0; i < m; i++) {
    const s = (i / n) * L;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const k = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    out.push([src[j - 1][0] + (src[j][0] - src[j - 1][0]) * k, src[j - 1][1] + (src[j][1] - src[j - 1][1]) * k]);
  }
  return out;
}
/** Max |curvature| of a polyline (turning angle over ±3 samples). */
function maxCurv(pts, closed) {
  const n = pts.length;
  let m = 0;
  for (let i = closed ? 0 : 3; i < (closed ? n : n - 3); i++) {
    const a = pts[(i - 3 + n) % n], c = pts[i], b = pts[(i + 3) % n];
    const h1 = Math.atan2(c[1] - a[1], c[0] - a[0]), h2 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    const l = (Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(b[0] - c[0], b[1] - c[1])) / 2;
    m = Math.max(m, Math.abs(wrap(h2 - h1)) / Math.max(1e-6, l));
  }
  return m;
}
/** Round off only the spots tighter than kmax (cusps, petal tips) with local Laplacian passes; closed polyline. */
function soften(pts, kmax, ds) {
  let a = pts;
  for (let pass = 0; pass < 900 && a.length > 60; pass++) {
    const n = a.length, hot = new Uint8Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      const p = a[(i - 3 + n) % n], c = a[i], q = a[(i + 3) % n];
      const h1 = Math.atan2(c[1] - p[1], c[0] - p[0]), h2 = Math.atan2(q[1] - c[1], q[0] - c[0]);
      if (Math.abs(wrap(h2 - h1)) / (3 * ds) > kmax) { any = true; for (let k = -4; k <= 4; k++) hot[(i + k + n) % n] = 1; }
    }
    if (!any) break;
    const b = a.slice();
    for (let i = 0; i < n; i++) if (hot[i]) {
      const p = a[(i - 1 + n) % n], c = a[i], q = a[(i + 1) % n];
      b[i] = [0.25 * p[0] + 0.5 * c[0] + 0.25 * q[0], 0.25 * p[1] + 0.5 * c[1] + 0.25 * q[1]];
    }
    a = pass % 40 === 39 ? resample(b, ds, true) : b;
  }
  return a;
}
/** Centre the bounding box and scale uniformly so the curve fills `k` of the (ru, rv) ellipse. */
function fit(pts, ru, rv, k) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let m = 0;
  for (const [x, y] of pts) m = Math.max(m, ((x - cx) / ru) ** 2 + ((y - cy) / rv) ** 2);
  const s = k / Math.sqrt(m);
  return pts.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}

/** One pattern as a closed, uniformly sampled curve in the local frame. portrait: narrower, taller patterns. */
export function patternCurve(kind, portrait) {
  const ru = portrait ? 1.8 : FIT.rx, rv = FIT.rz;
  let pts = raw(kind, portrait);
  if (kind === 'eight' && rv > ru) pts = pts.map(([x, y]) => [y, x]); // lobes along the long axis of the screen
  if (kind === 'heart' && !portrait) pts = pts.map(([x, y]) => [x * 1.12, y]); // a touch wider on wide screens
  pts = fit(pts, ru, rv, 1);
  pts = resample(pts, 0.03, true);
  pts = soften(pts, KMAX * 1.05, 0.03); // cusps and petal tips get rounded so they can be skated
  pts = fit(pts, ru, rv, 0.9);
  return resample(pts, DS, true);
}

/** Cubic Hermite from p0 (unit tangent t0) to p1 (unit tangent t1), sampled at DS. */
function hermite(p0, t0, p1, t1, mk = 1.1) {
  const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const m = Math.max(0.6, d * mk);
  const out = [];
  const n = 200;
  for (let i = 0; i <= n; i++) {
    const s = i / n, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    out.push([h00 * p0[0] + h10 * m * t0[0] + h01 * p1[0] + h11 * m * t1[0], h00 * p0[1] + h10 * m * t0[1] + h01 * p1[1] + h11 * m * t1[1]]);
  }
  return out;
}
const tangentAt = (pts, i, closed) => {
  const n = pts.length;
  const a = pts[closed ? (i - 3 + n) % n : Math.max(0, i - 3)], b = pts[closed ? (i + 3) % n : Math.min(n - 1, i + 3)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
/** Rotate / reverse a closed pattern so it starts where a short, smooth connector from (p, t) can reach it. */
function chooseStart(curve, p, t, wantLen, ru, rv) {
  let best = null;
  const n = curve.length;
  for (const dir of [1, -1]) {
    for (let i = 0; i < n; i += 6) {
      const q = curve[i];
      let tq = tangentAt(curve, i, true);
      if (dir < 0) tq = [-tq[0], -tq[1]];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const pre = Math.abs(d - wantLen) * 0.8 + (1 - (t[0] * tq[0] + t[1] * tq[1])) * 0.6;
      if (best && pre > best.cost) continue;
      for (const mk of [0.8, 1.15, 1.6]) {
        const conn = clampIn(hermite(p, t, q, tq, mk), ru, rv);
        const len = lengthOf(conn, false);
        const kc = maxCurv(resample(conn, 0.03, false), false);
        const cost = pre + Math.max(0, kc - KMAX * 0.8) * 1.5 + Math.abs(len - wantLen) * 0.3;
        if (!best || cost < best.cost) best = { cost, i, dir, conn };
      }
    }
  }
  const out = [];
  for (let k = 0; k < n; k++) out.push(curve[(best.i + best.dir * k + n * 2) % n]);
  return { curve: out, conn: best.conn };
}
const inFit = (q, ru, rv, k = 0.97) => (q[0] / ru) ** 2 + (q[1] / rv) ** 2 <= k * k;
function clampIn(pts, ru, rv) {
  return pts.map((q) => {
    const m = Math.sqrt((q[0] / ru) ** 2 + (q[1] / rv) ** 2);
    return m > 0.97 ? [(q[0] / m) * 0.97, (q[1] / m) * 0.97] : q;
  });
}

/**
 * Build the whole routine for the current screen shape.
 * Returns { n, u, v, s, hd, kappa, L, knots: [{b, s}], stars: [{s, b, p, j, ring}], patterns: [{kind, name, s0, s1, b0, b1}],
 *           b0, bEnd, start: {u, v, h} }.
 */
export function buildRoutine({ portrait = false } = {}) {
  const ru = portrait ? 1.8 : FIT.rx, rv = FIT.rz;
  const start = [START.x - FIT.x, -(START.z - FIT.z)];
  const pieces = []; // { pts, beats, kind? }
  let p = start, t = [1, 0]; // set off along the south rim towards the east
  const curves = PATTERNS.map((P) => patternCurve(P.kind, portrait));
  for (let k = 0; k < curves.length; k++) {
    const stepLen = lengthOf(curves[k], true) / BEATS;
    const { curve: c, conn } = chooseStart(curves[k], p, t, stepLen * (k === 0 ? LEAD_BEATS : 4), ru, rv);
    const q = c[0], tq = tangentAt(c, 0, true);
    const cl = lengthOf(conn, false);
    const beats = k === 0 ? LEAD_BEATS : Math.max(2, Math.min(6, Math.round(cl / stepLen)));
    pieces.push({ pts: conn, beats, kind: null });
    pieces.push({ pts: [...c, c[0]], beats: BEATS, kind: PATTERNS[k].kind, name: PATTERNS[k].name });
    p = q; t = tq;
  }
  // closing glide: ease to a stop a little south of centre, ending towards the camera (smoothest of a few spots)
  let outro = null;
  for (const ex of [-0.9, -0.45, 0, 0.45, 0.9]) for (const ey of [-0.5, -0.9, -1.3]) for (const ea of [-0.6, 0, 0.6]) {
    const q = [ex * (ru / FIT.rx), ey], tq = [Math.sin(ea), -Math.cos(ea)];
    for (const mk of [0.9, 1.3]) {
      const pts = clampIn(hermite(p, t, q, tq, mk), ru, rv);
      const len = lengthOf(pts, false);
      const cost = Math.max(0, maxCurv(resample(pts, 0.03, false), false) - KMAX * 0.7) * 2 + Math.abs(len - 1.8) * 0.4;
      if (!outro || cost < outro.cost) outro = { cost, pts };
    }
  }
  pieces.push({ pts: outro.pts, beats: OUTRO_BEATS, kind: null, outro: true });

  // concatenate and resample uniformly; remember each piece's start / end arclength
  const all = [];
  const marks = [];
  let acc = 0;
  for (const pc of pieces) {
    const r = resample(pc.pts, DS, false);
    const s0 = acc;
    for (let i = all.length ? 1 : 0; i < r.length; i++) {
      if (all.length) { const a = all[all.length - 1]; acc += Math.hypot(r[i][0] - a[0], r[i][1] - a[1]); }
      all.push(r[i]);
    }
    marks.push({ s0, s1: acc });
  }
  const U = resample(all, DS, false);
  const n = U.length, L = (n - 1) * DS;
  const scaleS = L / acc; // resampling keeps arclength; tiny float drift absorbed here
  const u = new Float32Array(n), v = new Float32Array(n), s = new Float32Array(n), hd = new Float32Array(n), kappa = new Float32Array(n);
  for (let i = 0; i < n; i++) { u[i] = U[i][0]; v[i] = U[i][1]; s[i] = i * DS; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    hd[i] = Math.atan2(v[b] - v[a], u[b] - u[a]);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4);
    kappa[i] = b > a ? wrap(hd[b] - hd[a]) / ((b - a) * DS) : 0;
  }
  // beat map knots and stars
  const knots = [];
  const stars = [];
  const patterns = [];
  let b = -LEAD_BEATS;
  knots.push({ b, s: 0 });
  let pi = 0;
  pieces.forEach((pc, k) => {
    const s0 = marks[k].s0 * scaleS, s1 = marks[k].s1 * scaleS;
    const b0 = b, b1 = b + pc.beats;
    knots.push({ b: b1, s: s1 });
    if (pc.kind) {
      patterns.push({ kind: pc.kind, name: pc.name, s0, s1, b0, b1, index: pi });
      for (let j = 1; j <= pc.beats; j++) stars.push({ s: s0 + ((s1 - s0) * j) / pc.beats, b: b0 + j, p: pi, j, ring: j % RING_EVERY === 0 });
      pi++;
    }
    b = b1;
  });
  for (const st of stars) { const i = Math.min(n - 1, Math.round(st.s / DS)); st.u = u[i]; st.v = v[i]; }
  return { n, u, v, s, hd, kappa, L, knots, stars, patterns, b0: -LEAD_BEATS, bEnd: b, start: { u: start[0], v: start[1], h: hd[0] }, portrait, ru, rv };
}

/** Arclength the music wants at beat b (piecewise linear between knots). */
export function guideS(R, b) {
  const K = R.knots;
  if (b <= K[0].b) return K[0].s;
  for (let i = 1; i < K.length; i++) if (b <= K[i].b) return K[i - 1].s + ((K[i].s - K[i - 1].s) * (b - K[i - 1].b)) / (K[i].b - K[i - 1].b);
  return K[K.length - 1].s;
}
/** ds/db at beat b. */
export function guideRate(R, b) {
  const K = R.knots;
  for (let i = 1; i < K.length; i++) if (b < K[i].b) return (K[i].s - K[i - 1].s) / (K[i].b - K[i - 1].b);
  return 0;
}
export const toWorld = (u, v) => ({ x: FIT.x + u, z: FIT.z - v });
export const inEdge = (u, v, k = 1) => (u / EDGE.rx) ** 2 + (v / EDGE.rz) ** 2 <= k * k;
export { wrap, inFit };
