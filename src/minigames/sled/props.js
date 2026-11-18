// Sledge Hill Race — knitted / felted props. Every builder returns geometry ready for ONE mesh (merge) or for
// an InstancedMesh, using the shared yarn material's per-vertex colour + surface kind.
import * as THREE from 'three';
import { cone, cyl, sph, dot, box, rbox, torus, extrude, tube, xf, merge, poly, starPts, part, recolor, KNIT, FELT, GLOW } from '../../core/prims.js';
import { P, SW, SH } from '../../core/yarn.js';
import { buildCharacter } from '../../core/player.js';
import { DS, FINISH, frameAt } from './course.js';

const TAU = Math.PI * 2;
export { merge as mergeGeos };
const C = (c) => new THREE.Color(c);
const RED = '#c0352f', CREAM = '#f3e6cc', WHITE = '#f7f2ea', GREEN = '#3f7d4e', GOLD = '#ecb03c';

/** Candy-cane (helical) stripes on a TubeGeometry made with `segs` × `radial`. */
function candyTube(pts, r, segs, radial, a = RED, b = CREAM, pitch = 0.07) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const len = curve.getLength();
  const g = part(new THREE.TubeGeometry(curve, segs, r, radial, false), b, KNIT, [len / SW, (TAU * r) / SH]);
  const ca = C(a), cb = C(b), segLen = len / segs;
  return recolor(g, (k) => {
    const q = Math.floor(k / 6), j = Math.floor(q / radial), i = q % radial;
    return Math.floor((j * segLen) / pitch + (i * 2) / radial) % 2 ? ca : cb;
  });
}
/** Vertical candy-striped post (bands by height). */
function candyPost(r, h, a = RED, b = CREAM, band = 0.06) {
  const g = cyl(r, r * 1.1, h, 8, b);
  const ca = C(a);
  return recolor(g, (k, pos) => (Math.floor((pos.getY(k) + h / 2 + (Math.atan2(pos.getZ(k), pos.getX(k)) / TAU) * band * 2) / band) % 2 ? ca : null));
}

// ------------------------------------------------------------------ the knitted track
const inRect = (x, z, r, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;
/** Ribbon + candy bolsters for one course; skips the finish pad and the shared start mat (they cover the joins). */
export function trackGeos(Cr, ground, { lift = 0.04, start = null } = {}) {
  const out = [];
  const step = 2; // every 2nd sample (0.1 units)
  const keep = (i) => {
    const x = Cr.x[i], z = Cr.z[i];
    if (inRect(x, z, FINISH.pad, -0.06)) return false;
    if (start && Math.hypot(x - start[0], z - start[1]) < start[2] - 0.08) return false;
    return true;
  };
  // split into runs of kept samples
  const segsList = [];
  let cur = [];
  for (let i = 0; i < Cr.n; i += step) {
    if (keep(i)) cur.push(i);
    else if (cur.length) { segsList.push(cur); cur = []; }
  }
  if (cur.length) segsList.push(cur);
  for (const idx of segsList) {
    if (idx.length < 2) continue;
    const across = [-1, -1 / 3, 1 / 3, 1];
    const pos = [], uv = [], ind = [];
    idx.forEach((i, row) => {
      const tx = Cr.tx[i], tz = Cr.tz[i], rx = -tz, rz = tx, w = Cr.w[i];
      for (const u of across) {
        const x = Cr.x[i] + rx * u * w / 2, z = Cr.z[i] + rz * u * w / 2;
        pos.push(x, ground(x, z) + lift, z);
        uv.push((u * w) / 2 / SW, (i * DS) / SH);
      }
      if (row) for (let c = 0; c < 3; c++) {
        const a = (row - 1) * 4 + c, b = a + 1, d = row * 4 + c, e = d + 1;
        ind.push(a, d, b, b, d, e);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ind);
    g.computeVertexNormals();
    // make sure normals point up (winding depends on travel direction)
    const n = g.attributes.normal;
    let up = 0;
    for (let k = 0; k < n.count; k++) up += n.getY(k);
    if (up < 0) { for (let k = 0; k < ind.length; k += 3) { const t = ind[k + 1]; ind[k + 1] = ind[k + 2]; ind[k + 2] = t; } g.setIndex(ind); g.computeVertexNormals(); }
    out.push(part(g, WHITE, KNIT));
    // cable bolsters along both edges (red / cream candy twist)
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let k = 0; k < idx.length; k += 2) {
        const i = idx[k], rx = -Cr.tz[i], rz = Cr.tx[i], w = Cr.w[i] / 2 - 0.012;
        const x = Cr.x[i] + rx * w * sd, z = Cr.z[i] + rz * w * sd;
        pts.push([x, ground(x, z) + lift + 0.022, z]);
      }
      const last = idx[idx.length - 1];
      { const rx = -Cr.tz[last], rz = Cr.tx[last], w = Cr.w[last] / 2 - 0.012, x = Cr.x[last] + rx * w * sd, z = Cr.z[last] + rz * w * sd; pts.push([x, ground(x, z) + lift + 0.022, z]); }
      if (pts.length >= 2) out.push(candyTube(pts, 0.03, Math.max(4, Math.round(pts.length * 1.15)), 4, RED, CREAM, 0.085));
    }
  }
  return out;
}

/** A felt mat draped over the ground on rect [x0, z0, x1, z1] (grid follows the slope). colorAt(x, z) → colour. */
function drapedMat(rect, ground, lift, nx, nz, colorAt, kind = KNIT) {
  const [x0, z0, x1, z1] = rect;
  const pos = [], uv = [], col = [], ind = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
    pos.push(x, ground(x, z) + lift, z);
    uv.push(x / SW, z / SH);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    ind.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  const out = part(g, WHITE, kind);
  // colour per face (crisp checks / borders)
  const p = out.attributes.position, c = out.attributes.color;
  for (let f = 0; f < p.count; f += 3) {
    const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const cc = C(colorAt(cx, cz));
    for (let k = 0; k < 3; k++) c.setXYZ(f + k, cc.r, cc.g, cc.b);
  }
  return out;
}

/** Finish pad (cream knit, red border, checkered finish line) — sits over both ribbons' ends. */
export function finishPadGeos(ground) {
  const r = FINISH.pad, fx = FINISH.x;
  const g = drapedMat(r, ground, 0.052, 26, 18, (x, z) => {
    const e = Math.min(x - r[0], r[2] - x, z - r[1], r[3] - z);
    if (e < 0.07) return RED;
    if (Math.abs(x - fx) < 0.12) return (Math.floor((x - fx + 0.12) / 0.12) + Math.floor((z - r[1]) / 0.12)) % 2 ? '#2f2a29' : WHITE;
    return e < 0.12 ? CREAM : WHITE;
  });
  return [g];
}

/** Round start mat where both runs begin. */
export function startMatGeos(ground, x, z, R) {
  const g = drapedMat([x - R, z - R, x + R, z + R], ground, 0.056, 16, 16, (px, pz) => {
    const d = Math.hypot(px - x, pz - z) / R;
    if (d > 0.82) return RED;
    const a = Math.atan2(pz - z, px - x);
    return d > 0.62 ? (Math.floor((a / TAU) * 16 + 16) % 2 ? RED : WHITE) : CREAM;
  });
  // trim to a disc: collapse faces outside the circle
  const p = g.attributes.position;
  for (let f = 0; f < p.count; f += 3) {
    let out = false;
    for (let k = 0; k < 3; k++) if (Math.hypot(p.getX(f + k) - x, p.getZ(f + k) - z) > R * 1.02) out = true;
    if (out) for (let k = 0; k < 3; k++) p.setXYZ(f + k, x, ground(x, z) + 0.02, z);
  }
  p.needsUpdate = true;
  return [g];
}

// ------------------------------------------------------------------ knitted i-cord letters (local glyph set)
const arc = (cx, cy, rx, ry, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const GLYPHS = {
  F: [[[0.85, 1], [0, 1], [0, 0]], [[0, 0.52], [0.65, 0.52]]],
  I: [[[0.5, 1], [0.5, 0]]],
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  S: [[[0.92, 0.82], [0.65, 1], [0.3, 0.98], [0.06, 0.78], [0.2, 0.56], [0.5, 0.5], [0.82, 0.42], [0.96, 0.2], [0.72, 0.01], [0.32, 0], [0.04, 0.18]]],
  H: [[[0, 1], [0, 0]], [[1, 1], [1, 0]], [[0, 0.52], [1, 0.52]]],
  T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
  A: [[[0, 0], [0.5, 1], [1, 0]], [[0.2, 0.38], [0.8, 0.38]]],
  R: [[[0, 0], [0, 1], [0.6, 1], [0.88, 0.86], [0.88, 0.62], [0.6, 0.5], [0, 0.5]], [[0.45, 0.5], [0.95, 0]]],
  '!': [[[0.5, 1], [0.5, 0.3]], arc(0.5, 0.05, 0.05, 0.05, 0, TAU, 6)],
};
function letters(str, h, c, r = h * 0.09) {
  const w = h * 0.62, sp = w * 0.3;
  const widths = str.split('').map((ch) => (ch === 'I' || ch === '!' ? w * 0.4 : w));
  let x = -(widths.reduce((a, b) => a + b, 0) + sp * (str.length - 1)) / 2;
  const g = [];
  str.split('').forEach((ch, n) => {
    for (const stroke of GLYPHS[ch] || []) {
      const pts = stroke.map(([u, v]) => [x + (ch === 'I' || ch === '!' ? (u - 0.5) * w + widths[n] / 2 : u * widths[n]), v * h, 0]);
      g.push(tube(pts, r, c, KNIT, Math.max(4, stroke.length * 2), 4));
    }
    x += widths[n] + sp;
  });
  return g;
}

/** Felt pennant (triangle) hanging from (0,0,0), pointing down. */
function pennant(w, h, c) {
  return extrude(poly([[-w / 2, 0], [w / 2, 0], [0, -h]]), 0.008, c, FELT, 1);
}
/** Bunting: sagging cord from a to b with n pennants. */
function bunting(a, b, sag, n, colors, size = 0.07) {
  const g = [];
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t]); }
  g.push(tube(pts, 0.006, '#f6ead2', KNIT, 12, 3));
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) - Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t];
    g.push(xf(pennant(size, size * 1.25, colors[i % colors.length]), p, [0, yaw, 0]));
  }
  return g;
}

/** Finish arch over the finish line (spans north–south at x = FINISH.x) with "FINISH" on both faces. */
export function finishArchGeos(ground) {
  const g = [];
  const x = FINISH.x, za = FINISH.pad[1] - 0.04, zb = FINISH.pad[3] + 0.04;
  const top = Math.max(ground(x, za), ground(x, zb)) + 0.98;
  for (const z of [za, zb]) {
    const y0 = ground(x, z), h = top - y0 + 0.06;
    g.push(xf(candyPost(0.032, h), [x, y0 + h / 2, z]));
    g.push(xf(dot(0.05, GOLD, GLOW), [x, top + 0.12, z]));
    g.push(xf(cyl(0.06, 0.07, 0.04, 8, '#2f3b36'), [x, y0 + 0.02, z]));
  }
  const L = zb - za;
  g.push(xf(rbox(0.05, 0.27, L - 0.02, 0.02, RED, KNIT, 1), [x, top, (za + zb) / 2]));
  g.push(xf(rbox(0.056, 0.035, L - 0.02, 0.012, CREAM, KNIT, 1), [x, top + 0.135, (za + zb) / 2]));
  g.push(xf(rbox(0.056, 0.035, L - 0.02, 0.012, CREAM, KNIT, 1), [x, top - 0.135, (za + zb) / 2]));
  for (const sd of [-1, 1]) for (const q of letters('FINISH', 0.13, WHITE)) g.push(xf(q, [x + sd * 0.032, top - 0.068, (za + zb) / 2], [0, sd * Math.PI / 2, 0]));
  for (let i = 0; i < 6; i++) g.push(xf(dot(0.02, i % 2 ? '#ffd27a' : '#ff7a52', GLOW), [x, top + 0.16, za + ((i + 0.5) / 6) * L]));
  g.push(...bunting([x, top - 0.17, za + 0.03], [x, top - 0.17, zb - 0.03], 0.1, 7, [RED, GREEN, GOLD, CREAM]));
  return g;
}

/** Little wooden START sign on the hilltop. */
export function startSignGeos(ground, x, z) {
  const g = [], y = ground(x, z);
  g.push(xf(cyl(0.022, 0.026, 0.5, 6, '#6e4630'), [x, y + 0.25, z]));
  g.push(xf(rbox(0.46, 0.17, 0.035, 0.02, '#a8713f', FELT, 1), [x, y + 0.5, z]));
  g.push(xf(rbox(0.5, 0.04, 0.05, 0.015, WHITE, FELT, 1), [x, y + 0.6, z])); // snow on top
  for (const sd of [-1, 1]) for (const q of letters('START', 0.085, WHITE)) g.push(xf(q, [x, y + 0.462, z + sd * 0.02], [0, sd > 0 ? 0 : Math.PI, 0]));
  g.push(...bunting([x - 0.25, y + 0.6, z], [x + 0.25, y + 0.6, z], 0.06, 4, [RED, GREEN, GOLD], 0.05));
  return g;
}

// ------------------------------------------------------------------ instanced props (local space, travel = +z)
/** Slalom gate: two candy poles with glowing tips and bunting between them. hw = half width. */
export function gateGeo(hw = 0.32) {
  const g = [];
  for (const sd of [-1, 1]) {
    const c = sd < 0 ? RED : GREEN;
    g.push(xf(candyPost(0.017, 0.68, c, CREAM, 0.07), [sd * hw, 0.34, 0]));
    g.push(xf(sph(0.04, c, FELT, 8, 6), [sd * hw, 0.7, 0])); // felt pom-pom tip
    g.push(xf(extrude(poly([[0, 0], [0, -0.13], [sd * 0.13, -0.065]]), 0.008, c, FELT, 1), [sd * hw, 0.67, -0.004])); // side flag
    g.push(xf(sph(0.045, WHITE, FELT, 8, 4), [sd * hw, 0.0, 0], null, [1, 0.5, 1])); // snow tuft at the foot
  }
  g.push(...bunting([-hw, 0.65, 0], [hw, 0.65, 0], 0.035, 5, [RED, CREAM, GOLD, CREAM, GREEN], 0.06));
  g.push(xf(dot(0.022, '#ffcf7a', GLOW), [0, 0.63, 0]));
  return merge(g);
}

/** Gold felt star with a glowing heart (stands upright, centred at the origin). */
export function starGeo() {
  const g = [];
  const s = extrude(poly(starPts(0.1, 0.046)), 0.03, GOLD, FELT, 1);
  g.push(xf(s, [0, 0, -0.015]));
  for (const sd of [-1, 1]) g.push(xf(part(new THREE.ShapeGeometry(poly(starPts(0.052, 0.024))), '#7a4c10', GLOW), [0, 0, sd * 0.0165], [0, sd > 0 ? 0 : Math.PI, 0]));
  return merge(g);
}

/** Wooden sled with curled runners and a chunky knitted cushion (reference: wooden sleds, yarn coils). */
export function sledParts(k = 1, cushion = RED) {
  const g = [];
  const woods = ['#c58f57', '#b98554', '#cf9c66', '#b07a48'];
  for (let i = 0; i < 4; i++) g.push(xf(box(0.052, 0.014, 0.4, woods[i], FELT), [(-0.084 + i * 0.056) * k, 0.082 * k, -0.01 * k], null, [k, k, k]));
  for (const z of [-0.15, 0.0, 0.14]) g.push(xf(box(0.23, 0.012, 0.03, '#a8713f', FELT), [0, 0.07 * k, z * k], null, [k, k, k]));
  for (const sx of [-0.105, 0.105]) {
    const pts = [[sx, 0.012, -0.24], [sx, 0.01, 0.1], [sx, 0.02, 0.2], [sx, 0.06, 0.27], [sx, 0.115, 0.262], [sx, 0.14, 0.21], [sx, 0.12, 0.17], [sx, 0.09, 0.18]].map((p) => p.map((v) => v * k));
    g.push(tube(pts, 0.013 * k, '#d9b98c', FELT, 18, 5));
    for (const z of [-0.15, 0.0, 0.14]) g.push(xf(box(0.018 * k, 0.06 * k, 0.02 * k, '#a8713f', FELT), [sx * k, 0.042 * k, z * k]));
  }
  g.push(xf(box(0.22 * k, 0.016 * k, 0.016 * k, '#a8713f', FELT), [0, 0.13 * k, 0.225 * k]));
  // pull rope looping back from the curls
  g.push(tube([[-0.1, 0.13, 0.225], [-0.06, 0.11, 0.16], [0, 0.105, 0.11], [0.06, 0.11, 0.16], [0.1, 0.13, 0.225]].map((p) => p.map((v) => v * k)), 0.006 * k, '#fff3dc', KNIT, 12, 3));
  if (cushion) {
    // coiled yarn cushion: rings of chunky knit
    const cols = [cushion, CREAM, cushion, GOLD, cushion];
    for (let i = 0; i < 5; i++) {
      g.push(xf(cyl(0.021 * k, 0.021 * k, 0.22 * k, 8, cols[i], KNIT), [(-0.076 + i * 0.038) * k, 0.106 * k, -0.06 * k], [Math.PI / 2, 0, 0]));
      for (const e of [-1, 1]) g.push(xf(sph(0.021 * k, cols[i], KNIT, 8, 5), [(-0.076 + i * 0.038) * k, 0.106 * k, (-0.06 + e * 0.11) * k]));
    }
  }
  return g;
}

/** Felt gnome riding a little sled (faces +z). */
export function gnomeGeo() {
  const g = sledParts(0.72, null);
  const blue = '#4f7fa6';
  g.push(xf(cyl(0.05, 0.075, 0.12, 10, blue, FELT), [0, 0.135, -0.02]));
  for (const sx of [-1, 1]) {
    g.push(xf(cyl(0.02, 0.02, 0.09, 6, '#3d5f7f', FELT), [sx * 0.03, 0.1, 0.05], [Math.PI / 2 - 0.2, 0, 0]));
    g.push(xf(sph(0.026, '#5c3a26', FELT, 6, 4), [sx * 0.03, 0.1, 0.105], null, [1, 0.8, 1.3]));
    g.push(xf(sph(0.022, '#e7d3b8', FELT, 6, 4), [sx * 0.065, 0.12, 0.07])); // mittens on the rope
  }
  g.push(xf(sph(0.05, P.skin, FELT, 10, 7), [0, 0.215, -0.01]));
  g.push(xf(sph(0.052, WHITE, FELT, 10, 7), [0, 0.18, 0.02], null, [1.05, 1.15, 0.75])); // beard
  g.push(xf(dot(0.02, '#e9938f'), [0, 0.215, 0.05]));
  g.push(xf(cone(0.058, 0.17, 10, RED, KNIT), [0, 0.33, -0.015], [-0.12, 0, 0]));
  g.push(xf(torus(0.052, 0.012, '#8b2523', KNIT, TAU, 12), [0, 0.252, -0.012], [Math.PI / 2, 0, 0]));
  g.push(xf(dot(0.022, WHITE), [0, 0.415, -0.03]));
  return merge(g);
}

export function lumpGeo() {
  return merge([
    xf(sph(0.2, WHITE, FELT, 12, 7), [0, 0, 0], null, [1, 0.45, 0.85]),
    xf(sph(0.11, WHITE, FELT, 8, 5), [0.13, 0.02, 0.06], null, [1, 0.55, 1]),
    xf(sph(0.09, WHITE, FELT, 8, 5), [-0.12, 0.01, -0.06], null, [1, 0.6, 1]),
  ]);
}

/** Small knitted fir (h ≈ 0.95 × scale). */
export function pineGeo() {
  const g = [];
  g.push(xf(cyl(0.035, 0.045, 0.14, 6, '#5c3a26'), [0, 0.07, 0]));
  const tiers = [[0.4, 0.42, 0.1], [0.3, 0.38, 0.34], [0.19, 0.32, 0.58]];
  const cA = C('#2f6446'), cB = C('#285a3e');
  tiers.forEach(([r, h, y], i) => {
    const c = cone(r, h, 10, '#2f6446');
    recolor(c, (k, pos) => (Math.floor(((Math.atan2(pos.getZ(k), pos.getX(k)) + Math.PI) / TAU) * 10) % 2 ? cA : cB));
    g.push(xf(c, [0, y + h / 2, 0]));
    if (i > 0) g.push(xf(cone(r * 0.56, h * 0.55, 8, WHITE, FELT), [0, y + h - h * 0.275 + 0.012, 0], [0, i, 0], [1.06, 1, 1.06]));
    for (let k = 0; k < 3 - i; k++) { const a = (k / (3 - i)) * TAU + i; g.push(xf(dot(0.035, WHITE), [Math.cos(a) * r * 0.9, y + 0.03, Math.sin(a) * r * 0.9])); }
  });
  g.push(xf(cone(0.07, 0.11, 8, WHITE, FELT), [0, 0.95, 0]));
  return merge(g);
}

export const puffGeo = () => part(new THREE.IcosahedronGeometry(1, 0), WHITE, FELT);
export const sparkGeo = () => part(new THREE.OctahedronGeometry(1, 0), '#a8741c', GLOW);

/** A knitted spectator baked into one geometry (arms up, cheering). */
export function crowdDollGeo(mat, style) {
  const ch = buildCharacter(mat, style);
  ch.arms[0].rotation.x = ch.arms[1].rotation.x = -2.7;
  ch.arms[0].rotation.z = -0.35; ch.arms[1].rotation.z = 0.35;
  ch.group.updateMatrixWorld(true);
  const geos = [], orig = new Set();
  ch.group.traverse((o) => { if (o.isMesh) { orig.add(o.geometry); geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); } });
  for (const g of orig) g.dispose();
  return merge(geos);
}

/** Average course tangent over [s0, s1] (camera look direction). */
export function avgDir(Cr, s0, s1, out) {
  let x = 0, z = 0;
  const f = {};
  for (let k = 0; k <= 6; k++) { frameAt(Cr, s0 + ((s1 - s0) * k) / 6, f); const wgt = 1 - k / 9; x += f.tx * wgt; z += f.tz * wgt; }
  const l = Math.hypot(x, z) || 1;
  out.x = x / l; out.z = z / l;
  return out;
}
