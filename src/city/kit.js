// Shared modelling kit for the city: colours, prefab cache, and reusable knitted / felted props.
// All builders return arrays of geometries in LOCAL space (origin at the base centre, front facing +z).
import * as THREE from 'three';
import { cone, cyl, sph, box, rbox, torus, extrude, tube, xf, merge, poly, part, boxUV, KNIT, FELT, GLOW, GLOSS } from '../core/prims.js';
import { P, mulberry32 } from '../core/yarn.js';

export { KNIT, FELT, GLOW, GLOSS, xf, merge, poly, part, cone, cyl, sph, box, rbox, torus, extrude, tube, mulberry32 };

export const C = {
  ...P,
  mustard: '#d9a13b',
  rose: '#c98585',
  dusk: '#5f7fa8',
  stone: '#c9bfb2',
  cobble: ['#c9bba4', '#d6cab5', '#bfae96', '#cdbfa8', '#b8a78f'],
  road: ['#8f8780', '#9a9189', '#867e78', '#a39a90', '#7f7872'],
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
export const bead = (r, c, k = FELT) => (k === GLOW ? part(new THREE.OctahedronGeometry(r, 0), c, GLOW) : sph(r, c, k, 5, 3));
export const ball = (r, c, k = FELT, ws = 8, hs = 6) => sph(r, c, k, ws, hs);

// ------------------------------------------------------------------ prefab cache
const cache = new Map();
export function prefab(key, build) {
  let g = cache.get(key);
  if (!g) { const parts = build().filter(Boolean); g = merge(parts); cache.set(key, g); }
  return g;
}
/** Cached prefab cloned into world space. */
export function put(key, build, x, y, z, ry = 0, s = 1) {
  return xf(prefab(key, build).clone(), [x, y, z], [0, ry, 0], s);
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
  const out = { cord: bulbsOnly ? null : tube(pts, cordR, cord, KNIT, 14, 4), bulbs: [], beads: [] };
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
  const tiers = [[0.42, 0.42, 0.12], [0.34, 0.38, 0.33], [0.26, 0.34, 0.52], [0.17, 0.3, 0.7]];
  tiers.forEach(([r, h, y], i) => {
    const c = angleStripes(cone(r, h, 12, colour), 12, colour, shade);
    g.push(xf(c, [0, y + h / 2, 0]));
    // underside cap so it isn't hollow from low angles
    g.push(xf(part(new THREE.CircleGeometry(r, 12), shade, KNIT), [0, y + 0.002, 0], [Math.PI / 2, 0, 0]));
    if (bobbles) {
      const n = i < 3 ? 4 - i : 0;
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
  g.push(xf(ball(r, crown), [0, 0.55, 0]));
  g.push(xf(ball(r * 0.72, crown), [0.17, 0.46, 0.06]));
  g.push(xf(ball(r * 0.66, crown), [-0.15, 0.48, -0.05]));
  g.push(xf(ball(r * 0.8, C.snow), [0, 0.68, 0], null, [1, 0.42, 1]));
  for (let k = 0; k < 6; k++) {
    const a = k * 1.1 + 0.3, yy = 0.42 + (k % 3) * 0.08;
    g.push(xf(bead(0.03, C.snow), [Math.cos(a) * r * 0.98, yy, Math.sin(a) * r * 0.98]));
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
  g.push(xf(box(0.11, 0.15, 0.11, C.warm, GLOW), [0, h + 0.115, 0]));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.push(xf(box(0.018, 0.16, 0.018, C.lampPost), [x * 0.056, h + 0.115, z * 0.056]));
  g.push(xf(cone(0.1, 0.09, 4, C.lampPost), [0, h + 0.235, 0], [0, Math.PI / 4, 0]));
  g.push(xf(ball(0.075, C.snow, FELT, 8, 5), [0, h + 0.28, 0], null, [1, 0.45, 1]));
  // tiny wreath + bow on the post
  g.push(xf(torus(0.06, 0.022, C.pine, KNIT, TAU, 7), [0, h * 0.62, 0.035]));
  g.push(xf(bead(0.025, C.red), [0, h * 0.62 - 0.05, 0.05]));
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

export function snowLump(r = 0.3) { return [xf(ball(r, C.snow, FELT, 10, 6), [0, 0, 0], null, [1, 0.38, 0.8])]; }

export function snowmanGeos() {
  const g = [];
  g.push(xf(ball(0.17, C.snow, FELT), [0, 0.15, 0]));
  g.push(xf(ball(0.12, C.snow, FELT), [0, 0.38, 0]));
  g.push(xf(ball(0.085, C.snow, FELT), [0, 0.55, 0]));
  g.push(xf(torus(0.08, 0.025, C.red, KNIT, TAU, 10), [0, 0.47, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(box(0.05, 0.14, 0.02, C.red), [0.05, 0.4, 0.09], [0.2, 0, 0.2]));
  g.push(xf(cone(0.018, 0.09, 6, C.orange, FELT), [0, 0.55, 0.11], [Math.PI / 2, 0, 0]));
  for (const x of [-0.03, 0.03]) g.push(xf(bead(0.012, C.ink), [x, 0.58, 0.075]));
  for (const y of [0.33, 0.39]) g.push(xf(bead(0.014, C.ink), [0, y, 0.115]));
  g.push(xf(cyl(0.06, 0.07, 0.02, 10, C.ink), [0, 0.625, 0]));
  g.push(xf(cyl(0.045, 0.05, 0.09, 10, C.ink), [0, 0.67, 0]));
  g.push(xf(cyl(0.05, 0.05, 0.02, 10, C.red), [0, 0.645, 0]));
  for (const s of [-1, 1]) g.push(xf(cyl(0.008, 0.008, 0.2, 4, C.woodDark), [s * 0.17, 0.42, 0], [0, 0, s * 1.0]));
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
      g.push(tube(pts, r, c, KNIT, Math.max(6, stroke.length * 3), 5));
    }
    x += cw + sp;
  }
  return g;
}
