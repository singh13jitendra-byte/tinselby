// Shared modelling kit for the city: colours, prefab cache, and reusable knitted / felted props.
// All builders return arrays of geometries in LOCAL space (origin at the base centre, front facing +z).
import * as THREE from 'three';
import { cone, cyl, sph, box, rbox, torus as primTorus, extrude, tube, xf, merge, poly, part, boxUV, KNIT, FELT, GLOW, GLOSS } from '../core/prims.js';
import { P, mulberry32 } from '../core/yarn.js';

export { KNIT, FELT, GLOW, GLOSS, xf, merge, poly, part, cone, cyl, sph, box, rbox, extrude, tube, mulberry32 };

export const C = {
  ...P,
  mustard: '#d9a13b',
  rose: '#c98585',
  dusk: '#5f7fa8',
  stone: '#c9bfb2',
  cobble: ['#f2efea', '#e9e6e0', '#f7f5f1', '#e4e1db', '#edeae5'], // snowy cream knit patchwork
  road: ['#bcc3cc', '#c7cdd5', '#b2bac4', '#cfd4da', '#abb3be'], // trodden snow over grey wool
  lampPost: '#2f3b36',
  rail: '#55504c',
  path: '#ece6dc',
  bulbs: ['#ff7a52', '#ffd27a', '#9fe07a', '#ffb04a', '#ff9ec0', '#8fd0ff'],
  warm: '#ffc77a',
};
export const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
const TAU = Math.PI * 2;
/** Flat 2D shape laid on the ground (shape y → world −z), extruded up by depth, with curve resolution. */
export const flatShapeE = (shape, depth, c, k = FELT, segs = 24) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segs });
  g.rotateX(-Math.PI / 2);
  return part(boxUV(g), c, k);
};

/** Low-poly bead (6×4) for lights, baubles, pom-poms. */
// Perf: beads are the most numerous parts in the city. Glowing bulbs up to r 0.034 are octahedra (8 tris; they read as a
// bloom dot at every play distance), bigger ones icosahedra. Felt / gloss beads: 4×2 (8 tris) below r 0.026, 4×3 (16)
// below r 0.034, 5×3 (20) above, where their silhouette starts to show in the follow view.
export const bead = (r, c, k = FELT) => (k === GLOW
  ? part(r > 0.034 ? new THREE.IcosahedronGeometry(r, 0) : new THREE.OctahedronGeometry(r, 0), c, GLOW)
  : r < 0.026 ? sph(r, c, k, 4, 2) : r < 0.034 ? sph(r, c, k, 4, 3) : sph(r, c, k, 5, 3));
export const ball = (r, c, k = FELT, ws = 8, hs = 6) => sph(r, c, k, ws, hs);
/** City torus: 6-sided tube cross-section by default (rings, wreaths and rims read the same as 8 at play distance). */
export const torus = (R, r, c, k = KNIT, arc = TAU, ts = 24, rs = 6) => primTorus(R, r, c, k, arc, ts, rs);

/** Mark a part as main-pass only (no shadow): wall-mounted trims, details sitting inside a bigger caster's shadow. */
export const noCast = (g) => { if (g) g.userData.noCast = true; return g; };

// ------------------------------------------------------------------ prefab cache
// A prefab is cached as up to two merged geometries: the body, and its tiny / glowing details (bobbles, bows, fairy
// lights; flagged noCast so the city puts them in the non-shadow batch). put() returns that array (K.prop flattens it).
const cache = new Map();
const tinyPart = (g) => {
  if (g.attributes.aMat.array[0] === GLOW || g.userData.noCast) return true;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  return Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 0.1;
};
export function prefab(key, build) {
  let e = cache.get(key);
  if (!e) {
    const body = [], det = [];
    for (const p of build().filter(Boolean)) (tinyPart(p) ? det : body).push(p);
    e = [];
    if (body.length) e.push(merge(body));
    if (det.length) e.push(noCast(merge(det)));
    cache.set(key, e);
  }
  return e;
}
/** Cached prefab cloned into world space. */
/** Where lamps were placed ([x, y, z, scale]); the city lays warm light pools on the snow under them. */
export const lampSpots = [];
export function put(key, build, x, y, z, ry = 0, s = 1) {
  if (key === 'lamp') lampSpots.push([x, y, z, s]);
  return prefab(key, build).map((g) => xf(g.clone(), [x, y, z], [0, ry, 0], s));
}
/** Transform an array of local geos into world space (in place) and return them. */
export function place(geos, x, y, z, ry = 0, s = 1) {
  for (const g of geos) xf(g, [0, 0, 0], null, s), xf(g, [x, y, z], [0, ry, 0]);
  return geos;
}

/** Recolour faces by centroid: fn(cx, cy, cz, faceIndex) → colour | null. */
export function faceColor(geo, fn) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let f = 0; f < p.count; f += 3) {
    const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const k = fn(cx, cy, cz, f / 3);
    if (k) { const cc = col(k); for (let j = 0; j < 3; j++) c.setXYZ(f + j, cc.r, cc.g, cc.b); }
  }
  c.needsUpdate = true;
  return geo;
}
/** Vertical stripes by angle around the y axis. */
export const angleStripes = (geo, n, a, b) => {
  const ca = col(a), cb = col(b);
  return faceColor(geo, (x, y, z) => (Math.floor(((Math.atan2(z, x) / TAU) + 1) * n) % 2 ? cb : ca));
};
/** Cylinder with height segments (for spiral candy stripes etc). */
export const cylS = (rt, rb, h, seg, hs, c, k = KNIT) => part(new THREE.CylinderGeometry(rt, rb, h, seg, hs), c, k, [(TAU * Math.max(rt, rb)) / 0.072, h / 0.058]);

// ------------------------------------------------------------------ strings of lights / garlands
/** Catenary from a to b sagging by sag. Returns {cord, bulbs:[geo], pts}. */
export function garland(a, b, sag, { n = 10, cord = C.pine, cordR = 0.016, bulbR = 0.03, colors = C.bulbs, kind = GLOW, bulbsOnly = false, beads = null } = {}) {
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(at(i / 8));
  const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const out = { cord: bulbsOnly ? null : tube(pts, cordR, cord, KNIT, Math.max(6, Math.min(14, Math.round(span * 2.4))), 4), bulbs: [], beads: [] };
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = at(t);
    out.bulbs.push(xf(bead(bulbR, colors[i % colors.length], kind), [p[0], p[1] - bulbR * 0.9, p[2]]));
    if (beads) { const q = at(t + 0.5 / n); if (t + 0.5 / n < 1) out.beads.push(xf(bead(bulbR * 1.1, beads[i % beads.length], FELT), [q[0], q[1] - bulbR, q[2]])); }
  }
  return out;
}
/** Bulbs along a straight edge from a to b (for rooflines). */
export function bulbLine(a, b, n, r = 0.03, colors = C.bulbs) {
  const g = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    g.push(xf(bead(r, colors[i % colors.length], GLOW), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
  }
  return g;
}

// ------------------------------------------------------------------ trees
/** Knitted fir with snowy pom-poms (reference: teal knit cones with white bobbles). h = 1 unit, scale on placement. */
export function pineGeos(colour = C.pine, shade = '#285a3e', { bobbles = true, lights = false } = {}) {
  const g = [];
  g.push(xf(cyl(0.045, 0.06, 0.18, 6, C.woodDark), [0, 0.09, 0]));
  const tiers = [[0.42, 0.46, 0.12], [0.32, 0.42, 0.38], [0.2, 0.36, 0.64]];
  tiers.forEach(([r, h, y], i) => {
    const c = angleStripes(cone(r, h, 10, colour), 10, colour, shade);
    g.push(xf(c, [0, y + h / 2, 0]));
    // cotton snow settled on the upper part of each tier
    if (i > 0) g.push(xf(cone(r * 0.56, h * 0.55, 8, C.snow, FELT), [0, y + h - h * 0.275 + 0.012, 0], [0, i, 0], [1.06, 1, 1.06]));
    if (bobbles) {
      const n = i < 2 ? 3 - i : 0;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + i * 0.7;
        g.push(xf(bead(0.04, C.snow), [Math.cos(a) * r * 0.92, y + 0.03, Math.sin(a) * r * 0.92]));
      }
    }
  });
  g.push(xf(cone(0.075, 0.12, 8, C.snow, FELT), [0, 0.98, 0]));
  return g;
}

/** Felt pom-pom tree (round puffy crown, snow cap, bobbles). */
export function pomTreeGeos(crown = C.pink, rnd = Math.random) {
  const g = [];
  g.push(xf(cyl(0.035, 0.05, 0.38, 6, C.wood), [0, 0.19, 0]));
  const r = 0.27;
  g.push(xf(ball(r, crown, FELT, 10, 7), [0, 0.55, 0]));
  g.push(xf(ball(r * 0.72, crown, FELT, 7, 5), [0.17, 0.46, 0.06]));
  g.push(xf(ball(r * 0.66, crown, FELT, 7, 5), [-0.15, 0.48, -0.05]));
  // cotton-wool snow hat + a smaller drift on the side puff
  g.push(xf(ball(r * 0.86, C.snow, FELT, 8, 4), [0, 0.775, 0], null, [1, 0.42, 1]));
  g.push(xf(ball(r * 0.5, C.snow, FELT, 6, 3), [0.2, 0.61, 0.07], null, [1, 0.4, 1]));
  for (let k = 0; k < 7; k++) {
    const a = k * 2.1 + 0.3, yy = 0.4 + (k % 4) * 0.075, rr = Math.sqrt(Math.max(0.01, r * r - (yy - 0.55) ** 2)) * 1.0;
    g.push(xf(bead(0.032, C.snow), [Math.cos(a) * rr, yy, Math.sin(a) * rr]));
  }
  return g;
}
/** Fairy lights for a pom-pom tree crown (separate so they can switch on). */
export function pomLights() {
  const g = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9, yy = 0.4 + k * 0.035;
    g.push(xf(bead(0.022, C.bulbs[k % 3 === 0 ? 1 : 3], GLOW), [Math.cos(a) * 0.285, yy, Math.sin(a) * 0.285]));
  }
  return g;
}

/** Small knitted shrub ball. */
export function shrubGeos(c = C.red) {
  return [xf(sph(0.13, c, KNIT, 8, 6), [0, 0.1, 0], null, [1, 0.85, 1]), xf(bead(0.07, C.snow), [0, 0.19, 0], null, [1, 0.5, 1])];
}

// ------------------------------------------------------------------ street furniture
export function lampGeos(h = 1.25) {
  const g = [];
  g.push(xf(cyl(0.07, 0.09, 0.1, 8, C.lampPost), [0, 0.05, 0]));
  g.push(xf(cyl(0.025, 0.035, h, 6, C.lampPost), [0, h / 2, 0]));
  g.push(xf(cyl(0.07, 0.05, 0.04, 6, C.lampPost), [0, h + 0.02, 0]));
  g.push(xf(box(0.125, 0.16, 0.125, C.warm, GLOW), [0, h + 0.115, 0]));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.push(xf(box(0.018, 0.16, 0.018, C.lampPost), [x * 0.056, h + 0.115, z * 0.056]));
  g.push(xf(cone(0.1, 0.09, 4, C.lampPost), [0, h + 0.235, 0], [0, Math.PI / 4, 0]));
  g.push(xf(ball(0.075, C.snow, FELT, 7, 4), [0, h + 0.28, 0], null, [1, 0.45, 1]));
  // fairy lights wound round the post
  for (let k = 0; k < 8; k++) { const a = k * 1.25, y = h * (0.2 + k * 0.095); g.push(xf(bead(0.017, k % 3 ? C.warm : '#ffe6b0', GLOW), [Math.cos(a) * 0.04, y, Math.sin(a) * 0.04])); }
  // red bow on the post
  g.push(xf(bead(0.03, C.red), [-0.025, h * 0.62, 0.03], null, [1.2, 0.8, 0.6]));
  g.push(xf(bead(0.03, C.red), [0.025, h * 0.62, 0.03], null, [1.2, 0.8, 0.6]));
  return g;
}

export function benchGeos() {
  const g = [];
  for (const x of [-0.26, 0.26]) {
    g.push(xf(box(0.04, 0.17, 0.2, C.lampPost), [x, 0.085, 0]));
    g.push(xf(box(0.04, 0.2, 0.04, C.lampPost), [x, 0.27, -0.09]));
  }
  for (let i = 0; i < 3; i++) g.push(xf(box(0.66, 0.025, 0.06, C.wood), [0, 0.18, -0.07 + i * 0.07]));
  for (let i = 0; i < 2; i++) g.push(xf(box(0.66, 0.05, 0.022, C.wood), [0, 0.27 + i * 0.08, -0.1], [-0.12, 0, 0]));
  g.push(xf(rbox(0.6, 0.04, 0.17, 0.018, C.snow, FELT, 1), [0, 0.205, 0]));
  return g;
}

// top half only: the lower half sits under the snow (deco, no shadow), so a 10×4 dome keeps the same outline
export function snowLump(r = 0.3) { return [xf(part(new THREE.SphereGeometry(r, 10, 4, 0, TAU, 0, Math.PI / 2), C.snow, FELT, [(TAU * r) / 0.08, (Math.PI * r) / 2 / 0.064]), [0, 0, 0], null, [1, 0.38, 0.8])]; }

/** Needle-felted snowman: knit beanie with fat brim and pom-pom, striped fringed scarf, wooden buttons, carrot nose, rosy cheeks. */
export function snowmanGeos(hat = '#6fa8b4', scarf = C.moss, brim = '#f1e4cc') {
  const g = [], W = '#fbf9f4';
  g.push(xf(ball(0.185, W, FELT, 12, 8), [0, 0.165, 0], null, [1, 0.95, 1]));
  g.push(xf(ball(0.135, W, FELT, 12, 8), [0, 0.43, 0]));
  for (const s of [-1, 1]) g.push(xf(ball(0.055, W, FELT, 8, 6), [s * 0.178, 0.25, 0.035], [0, 0, s * 0.55], [0.72, 1.5, 0.8])); // stubby felted arms
  // scarf: chunky wrap + hanging striped tail with fringe
  g.push(xf(torus(0.108, 0.036, scarf, KNIT, TAU, 14), [0, 0.325, 0], [Math.PI / 2, 0, 0]));
  const tail = box(0.075, 0.18, 0.028, scarf);
  faceColor(tail, (x, y) => (Math.floor((y + 0.09) / 0.03) % 2 ? null : hat));
  g.push(xf(tail, [0.065, 0.225, 0.158], [-0.22, 0, -0.1]));
  [C.pink, hat, C.gold].forEach((c, i) => g.push(xf(bead(0.017, c), [0.05 + i * 0.022, 0.128, 0.175])));
  // wooden buttons
  for (const y of [0.1, 0.19]) {
    const z = Math.sqrt(Math.max(0, 0.185 * 0.185 - (y - 0.165) ** 2)) * 0.98;
    g.push(xf(cyl(0.024, 0.024, 0.012, 8, '#b98250', FELT), [-0.025, y, z], [Math.PI / 2 - (y - 0.165) * 2.5, 0, 0]));
    g.push(xf(cyl(0.012, 0.012, 0.014, 6, '#7a4f33', FELT), [-0.025, y, z + 0.002], [Math.PI / 2, 0, 0]));
  }
  // face
  g.push(xf(cone(0.022, 0.085, 7, C.orange, FELT), [0, 0.428, 0.165], [Math.PI / 2, 0, 0]));
  for (const x of [-0.047, 0.047]) g.push(xf(bead(0.014, C.ink, GLOSS), [x, 0.458, 0.122]));
  for (const x of [-0.08, 0.08]) g.push(xf(bead(0.026, '#f08f9c'), [x, 0.418, 0.105], [0, x * 4, 0], [1, 0.8, 0.35]));
  for (const [x, y] of [[-0.03, 0.392], [-0.01, 0.384], [0.01, 0.384], [0.03, 0.392]]) g.push(xf(bead(0.006, C.ink), [x, y, 0.129]));
  // beanie
  g.push(xf(ball(0.122, hat, KNIT, 12, 8), [0, 0.535, -0.005], null, [1, 0.82, 1]));
  g.push(xf(torus(0.118, 0.036, brim, KNIT, TAU, 14), [0, 0.505, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(ball(0.052, brim, FELT, 8, 6), [0, 0.66, -0.01]));
  return g;
}

/** Floor lantern (glowing), ~0.3 tall. */
export function lanternGeos(c = C.lampPost) {
  const g = [];
  g.push(xf(box(0.13, 0.03, 0.13, c), [0, 0.015, 0]));
  g.push(xf(box(0.085, 0.13, 0.085, '#ffc474', GLOW), [0, 0.095, 0]));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.push(xf(box(0.016, 0.13, 0.016, c), [x * 0.048, 0.095, z * 0.048]));
  g.push(xf(cone(0.095, 0.07, 4, c), [0, 0.195, 0], [0, Math.PI / 4, 0]));
  g.push(xf(torus(0.03, 0.007, c, KNIT, TAU, 8), [0, 0.25, 0]));
  g.push(xf(ball(0.05, C.snow, FELT, 6, 4), [0, 0.225, 0], null, [1.2, 0.4, 1.2]));
  return g;
}
/** Knitted candy cane post with a red bow, ~0.62 tall. */
export function candyCaneGeos() {
  const pts = [[0, 0, 0], [0, 0.3, 0], [0, 0.5, 0], [0.03, 0.58, 0], [0.1, 0.61, 0], [0.16, 0.57, 0], [0.175, 0.49, 0]];
  const t = tube(pts, 0.032, C.snow, KNIT, 33, 5);
  faceColor(t, (x, y, z, f) => (Math.floor(f / 10 / 3) % 2 ? C.red : null)); // ring stripes, three tube segments each
  return [t, xf(bead(0.035, C.red), [-0.03, 0.36, 0.035], null, [1.3, 0.8, 0.6]), xf(bead(0.035, C.red), [0.03, 0.36, 0.035], null, [1.3, 0.8, 0.6]), xf(bead(0.022, C.gold, GLOSS), [0, 0.36, 0.05])];
}
/** Wooden barrel table with snow, mugs and a lantern on top. */
export function barrelGeos() {
  const g = [];
  const b = cylS(0.15, 0.13, 0.34, 10, 3, C.wood);
  faceColor(b, (x, y, z) => (Math.floor((Math.atan2(z, x) / TAU + 1) * 10) % 2 ? '#86593b' : null));
  g.push(xf(b, [0, 0.17, 0]));
  for (const y of [0.08, 0.26]) g.push(xf(torus(0.15, 0.012, C.lampPost, KNIT, TAU, 12), [0, y, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(cyl(0.16, 0.16, 0.02, 10, C.woodDark), [0, 0.35, 0]));
  g.push(xf(ball(0.1, C.snow, FELT, 8, 5), [-0.04, 0.36, -0.05], null, [1.1, 0.25, 0.9]));
  for (const [x, z, c] of [[0.07, 0.05, C.red], [-0.05, 0.08, C.cream]]) {
    g.push(xf(cyl(0.028, 0.024, 0.05, 8, c), [x, 0.385, z]));
    g.push(xf(cyl(0.022, 0.022, 0.006, 8, '#6b3f2a', FELT), [x, 0.412, z]));
    g.push(xf(torus(0.014, 0.005, c, KNIT, TAU, 6), [x + 0.03, 0.385, z]));
  }
  return g;
}
/** Woven basket heaped with pine cones / apples / baubles. */
export function basketGeos(fill = '#7a4f33', kind = FELT) {
  const g = [];
  g.push(xf(cyl(0.105, 0.08, 0.09, 10, '#c49a62'), [0, 0.045, 0]));
  g.push(xf(torus(0.105, 0.014, '#a87c48', KNIT, TAU, 12), [0, 0.09, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 7; i++) { const a = i * 2.4, r = i ? 0.055 : 0; g.push(xf(bead(0.036, i % 3 === 2 && kind === FELT ? '#8f6242' : fill, kind), [Math.cos(a) * r, 0.105 + (i ? 0 : 0.03), Math.sin(a) * r], [0, a, 0], [1, 1.15, 1])); }
  g.push(xf(bead(0.03, C.snow), [0.03, 0.15, -0.02], null, [1.3, 0.5, 1.2]));
  return g;
}
/** Small fir in a knitted pot, wrapped in fairy lights. Returns {g, lights}. */
export function litFirGeos(pot = C.red) {
  const g = [], lights = [];
  const pl = cyl(0.17, 0.14, 0.18, 10, pot);
  faceColor(pl, (x, y) => (y > 0.04 ? C.cream : null));
  g.push(xf(pl, [0, 0.09, 0]));
  g.push(...pineGeos(C.pine, '#285a3e', { bobbles: false }).map((q) => xf(q, [0, 0.13, 0], null, 0.74)));
  for (let k = 0; k < 5; k++) { const a = k * 1.9, t = 0.12 + k * 0.17, r = (0.42 - t * 0.33) * 0.74; g.push(xf(bead(0.032, k % 2 ? C.red : C.gold, GLOSS), [Math.cos(a) * r, 0.2 + t * 0.72, Math.sin(a) * r])); }
  for (let k = 0; k < 16; k++) { const t = k / 16, a = t * TAU * 3, r = (0.44 - t * 0.34) * 0.74; lights.push(xf(bead(0.022, k % 4 === 0 ? '#ff9a6a' : C.warm, GLOW), [Math.cos(a) * r, 0.22 + t * 0.6, Math.sin(a) * r])); }
  return { g, lights };
}

/** Low rustic wooden fence with cotton-snow caps along a polyline [[x,z],...]. Posts ~every `step`. */
export function woodFenceGeos(pts, { step = 0.62, h = 0.3, y = 0.03 } = {}) {
  const g = [];
  const post = (x, z, ang) => {
    g.push(xf(box(0.075, h, 0.075, C.wood, FELT), [x, y + h / 2, z], [0, -ang, 0]));
    g.push(xf(ball(0.058, C.snow, FELT, 6, 4), [x, y + h + 0.005, z], null, [1.1, 0.55, 1.1]));
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, l = L / n;
      post(x0, z0, ang);
      for (const ry of [0.38, 0.74]) g.push(xf(box(l, 0.045, 0.03, k % 2 ? '#86593b' : C.wood, FELT), [mx, y + h * ry, mz], [0, -ang, 0]));
      g.push(xf(box(l * 0.8, 0.028, 0.05, C.snow, FELT), [mx, y + h * 0.74 + 0.032, mz], [0, -ang, 0]));
    }
    if (i === pts.length - 2) post(bx, bz, ang);
  }
  return g;
}

export function giftGeos(w = 0.14, h = 0.12, c = C.red, ribbon = C.gold) {
  return [
    xf(box(w, h, w, c, FELT), [0, h / 2, 0]),
    xf(box(w + 0.006, h + 0.006, 0.025, ribbon, FELT), [0, h / 2, 0]),
    xf(box(0.025, h + 0.006, w + 0.006, ribbon, FELT), [0, h / 2, 0]),
    xf(bead(0.025, ribbon), [-0.02, h + 0.01, 0], null, [1, 0.6, 1]),
    xf(bead(0.025, ribbon), [0.02, h + 0.01, 0], null, [1, 0.6, 1]),
  ];
}
/** Wreath with bow, standing in the xy plane facing +z. */
export function wreathGeos(R = 0.11, lights = false) {
  const g = [xf(torus(R, R * 0.36, C.pine, KNIT, TAU, 10), [0, 0, 0])];
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4; g.push(xf(bead(R * 0.16, i % 2 ? C.red : C.gold), [Math.cos(a) * R, Math.sin(a) * R, R * 0.3])); }
  g.push(xf(bead(R * 0.3, C.red), [-R * 0.28, -R * 0.95, R * 0.3], null, [1.3, 0.8, 0.6]));
  g.push(xf(bead(R * 0.3, C.red), [R * 0.28, -R * 0.95, R * 0.3], null, [1.3, 0.8, 0.6]));
  g.push(xf(box(R * 0.12, R * 0.6, 0.02, C.red), [-R * 0.12, -R * 1.3, R * 0.3], [0, 0, 0.3]));
  g.push(xf(box(R * 0.12, R * 0.6, 0.02, C.red), [R * 0.12, -R * 1.3, R * 0.3], [0, 0, -0.3]));
  return g;
}
export function wreathLights(R = 0.11) {
  const g = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.push(xf(bead(R * 0.13, C.warm, GLOW), [Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05, R * 0.34])); }
  return g;
}

/** Picket fence run from a to b on the ground. */
export function fenceGeos(ax, az, bx, bz, c = C.cream) {
  const g = [], L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), n = Math.max(2, Math.round(L / 0.22));
  const rail = (y) => xf(xf(box(L, 0.035, 0.025, c), [L / 2, y, 0]), [ax, 0, az], [0, -ang, 0]);
  g.push(rail(0.09), rail(0.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    g.push(xf(box(0.05, 0.27, 0.035, c), [x, 0.135, z], [0, -ang, 0]));
    g.push(xf(bead(0.032, C.snow), [x, 0.28, z], null, [1, 0.6, 1]));
  }
  return g;
}

// ------------------------------------------------------------------ text: knitted i-cord letters
const arc = (cx, cy, rx, ry, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const GLYPHS = {
  W: [[[0, 1], [0.22, 0], [0.5, 0.62], [0.78, 0], [1, 1]]],
  E: [[[0.9, 1], [0, 1], [0, 0], [0.9, 0]], [[0, 0.52], [0.7, 0.52]]],
  L: [[[0, 1], [0, 0], [0.85, 0]]],
  C: [arc(0.55, 0.5, 0.5, 0.5, 0.8, TAU - 0.8, 12)],
  O: [arc(0.5, 0.5, 0.5, 0.5, 0, TAU, 16)],
  M: [[[0, 0], [0, 1], [0.5, 0.42], [1, 1], [1, 0]]],
  T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
  I: [[[0.5, 1], [0.5, 0]], [[0.2, 1], [0.8, 1]], [[0.2, 0], [0.8, 0]]],
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  S: [[[0.92, 0.82], [0.65, 1], [0.3, 0.98], [0.06, 0.78], [0.2, 0.56], [0.5, 0.5], [0.82, 0.42], [0.96, 0.2], [0.72, 0.01], [0.32, 0], [0.04, 0.18]]],
  B: [[[0, 0], [0, 1], [0.58, 1], [0.84, 0.9], [0.86, 0.66], [0.6, 0.52], [0, 0.52]], [[0.6, 0.52], [0.92, 0.4], [0.94, 0.13], [0.65, 0], [0, 0]]],
  Y: [[[0, 1], [0.5, 0.48], [1, 1]], [[0.5, 0.48], [0.5, 0]]],
  R: [[[0, 0], [0, 1], [0.6, 1], [0.88, 0.86], [0.88, 0.62], [0.6, 0.5], [0, 0.5]], [[0.45, 0.5], [0.95, 0]]],
  H: [[[0, 1], [0, 0]], [[1, 1], [1, 0]], [[0, 0.52], [1, 0.52]]],
  A: [[[0, 0], [0.5, 1], [1, 0]], [[0.2, 0.38], [0.8, 0.38]]],
  K: [[[0, 1], [0, 0]], [[0.92, 1], [0.04, 0.44]], [[0.3, 0.62], [0.96, 0]]],
  2: [[[0.06, 0.74], [0.25, 0.97], [0.62, 1], [0.9, 0.8], [0.82, 0.52], [0.06, 0], [0.96, 0]]],
  0: [arc(0.5, 0.5, 0.45, 0.5, 0, TAU, 14)],
  7: [[[0.02, 1], [0.98, 1], [0.38, 0]]],
};
/** Centred text in the xy plane facing +z. Returns geos. h = cap height. */
export function textGeos(str, h, c, { r = h * 0.075, gap = 0.28 } = {}) {
  const w = h * 0.62, sp = w * gap;
  const chars = str.split('');
  const total = chars.reduce((s, ch) => s + (ch === ' ' ? w * 0.55 : (ch === 'I' ? w * 0.6 : w) + sp), -sp);
  let x = -total / 2;
  const g = [];
  for (const ch of chars) {
    if (ch === ' ') { x += w * 0.55; continue; }
    const cw = ch === 'I' ? w * 0.6 : w;
    for (const stroke of GLYPHS[ch] || []) {
      const pts = stroke.map(([u, v]) => [x + u * cw, v * h, 0]);
      g.push(tube(pts, r, c, KNIT, Math.max(6, stroke.length * 3), 4));
    }
    x += cw + sp;
  }
  return g;
}
