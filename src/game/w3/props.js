// Wave 3 task props (WAVE3.md §Props): knitted / felted geometry only. Every builder returns ONE merged BufferGeometry for
// the shared yarn material (vertex colours + aMat), origin at the base centre, front +z.
// The Tasks agent owns placement, instancing, colliders and animation.
import * as THREE from 'three';
import { box, cyl, sph, cone, torus, extrude, xf, merge, part, poly, starPts, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';

const TAU = Math.PI * 2;
const RED = '#b5332e', RED_DARK = '#8f2823', GOLD = '#e3aa3a', CREAM = '#f3e7cf', SNOW = '#fbf7f0', IRON = '#2b2523', GREEN = '#3f7a4a', FLAME = '#ffd27a';
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
/** Low-poly bead: 8 tris (octahedron) for glow dots, 5×3 otherwise. */
const bead = (r, c, k = FELT) => (k === GLOW ? xf(part(new THREE.OctahedronGeometry(1, 0), c, GLOW), [0, 0, 0], null, r) : sph(r, c, k, 5, 3));
/** One flat felt triangle (single-sided, counter-clockwise seen from its front). */
function tri3(a, b, c, col, k = FELT) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
  geo.computeVertexNormals();
  return part(geo, col, k);
}
/** Upper half of a sphere (dome), base at y = 0. */
const dome = (r, c, k, ws, hs) => part(new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, Math.PI / 2), c, k, [(TAU * r) / 0.08, (Math.PI * r) / 0.064]);
/** A small ribbon bow facing +z, centred on the knot. */
function bow(c, s = 1, k = FELT) {
  const dark = shade(c, 0.82), p = [];
  for (const sx of [-1, 1]) {
    p.push(xf(sph(0.02 * s, c, k, 5, 3), [sx * 0.02 * s, 0.004 * s, 0], [0, 0, sx * 0.35], [1.15, 0.72, 0.45]));
    p.push(xf(box(0.011 * s, 0.03 * s, 0.004 * s, dark, k), [sx * 0.011 * s, -0.02 * s, 0.001], [0, 0, sx * 0.45]));
  }
  p.push(xf(sph(0.009 * s, dark, k, 5, 3), [0, 0.002 * s, 0.004 * s]));
  return p;
}

/** Door 18: red felt pillar box (≤ 1.2k tris), collider r 0.15. Domed cap with a snow lump, gold slot band, little wreath. */
export function postBoxGeo() {
  const g = [];
  g.push(xf(cyl(0.142, 0.148, 0.045, 14, IRON, FELT), [0, 0.0225, 0])); // plinth
  g.push(xf(cyl(0.122, 0.128, 0.37, 16, RED, FELT), [0, 0.23, 0])); // pillar
  g.push(xf(cyl(0.126, 0.126, 0.03, 16, GOLD, GLOSS), [0, 0.4, 0])); // gold slot band
  g.push(xf(box(0.105, 0.013, 0.02, IRON, FELT), [0, 0.4, 0.119])); // the slot
  g.push(xf(box(0.118, 0.006, 0.03, RED_DARK, FELT), [0, 0.411, 0.122], [0.35, 0, 0])); // little rain hood over it
  g.push(xf(cyl(0.146, 0.146, 0.03, 16, RED_DARK, FELT), [0, 0.43, 0])); // cap rim
  g.push(xf(dome(0.14, RED, FELT, 16, 4), [0, 0.445, 0], null, [1, 0.5, 1]));
  g.push(xf(dome(0.098, SNOW, FELT, 10, 3), [0.006, 0.484, -0.008], null, [1.1, 0.42, 1])); // snow on the dome
  for (const [a, r, s] of [[0.5, 0.1, 0.03], [2.4, 0.105, 0.026], [4.3, 0.098, 0.028]]) g.push(xf(sph(s, SNOW, FELT, 5, 3), [Math.sin(a) * r, 0.474, Math.cos(a) * r], null, [1.2, 0.6, 1.2]));
  g.push(xf(sph(0.016, GOLD, GLOSS, 6, 4), [0, 0.527, -0.006])); // finial
  // collection plate: cream felt card with two "lines of writing"
  g.push(xf(box(0.07, 0.045, 0.006, CREAM, FELT), [0, 0.335, 0.1245]));
  for (const [y, w] of [[0.343, 0.048], [0.329, 0.034]]) g.push(xf(box(w, 0.005, 0.003, RED_DARK, FELT), [0, y, 0.128]));
  // the wreath on the front, with berries and a red bow
  const wy = 0.215, wz = 0.132;
  g.push(xf(torus(0.05, 0.016, GREEN, KNIT, TAU, 12, 6), [0, wy, wz]));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.45; g.push(xf(bead(0.0085, '#d8342c', GLOSS), [Math.cos(a) * 0.05, wy + Math.sin(a) * 0.05, wz + 0.014])); }
  for (const p of bow('#c4362f', 0.95)) g.push(xf(p, [0, wy - 0.052, wz + 0.014]));
  // a knitted red-and-white band round the foot (reads from behind too)
  for (let i = 0; i < 8; i++) g.push(xf(part(new THREE.CylinderGeometry(0.1305, 0.1315, 0.026, 2, 1, true, (i / 8) * TAU, TAU / 8), i % 2 ? SNOW : RED_DARK, KNIT, [1, 0.4]), [0, 0.075, 0]));
  return merge(g);
}

/** Door 20: runway lantern → { body ≤ 300 (dark iron post 0.55 tall, cage, snow cap), flame ≤ 80 (GLOW, centred at y 0.47) }. */
export function lanternGeos() {
  const b = [];
  b.push(xf(cyl(0.03, 0.044, 0.028, 8, IRON, KNIT), [0, 0.014, 0])); // foot
  b.push(xf(sph(0.034, SNOW, FELT, 6, 3), [0.012, 0.012, 0.01], null, [1.5, 0.45, 1.4])); // snow drift round the foot
  b.push(xf(cyl(0.013, 0.018, 0.385, 6, IRON, KNIT), [0, 0.22, 0])); // post
  b.push(xf(cyl(0.024, 0.024, 0.012, 6, GOLD, GLOSS), [0, 0.3, 0])); // gold collar
  b.push(xf(box(0.098, 0.012, 0.098, IRON, KNIT), [0, 0.416, 0])); // cage floor
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.push(xf(box(0.011, 0.1, 0.011, IRON, KNIT), [x * 0.041, 0.47, z * 0.041])); // corner bars
  b.push(xf(box(0.104, 0.01, 0.104, IRON, KNIT), [0, 0.523, 0]));
  b.push(xf(cone(0.078, 0.05, 4, IRON, KNIT), [0, 0.553, 0], [0, Math.PI / 4, 0])); // pyramid roof
  b.push(xf(dome(0.058, SNOW, FELT, 6, 3), [0.004, 0.546, 0], null, [1.12, 0.62, 1.12])); // snow cap
  b.push(xf(sph(0.012, GOLD, GLOSS, 5, 3), [0, 0.588, 0]));
  const f = [
    xf(sph(0.021, FLAME, GLOW, 6, 4), [0, 0.462, 0], null, [1, 1.05, 1]),
    xf(cone(0.0165, 0.036, 6, FLAME, GLOW), [0, 0.496, 0]),
    xf(sph(0.011, '#fff3c9', GLOW, 5, 3), [0, 0.464, 0.0]),
  ];
  return { body: merge(b), flame: merge(f) };
}

/** Door 22: Santa's mailbox on a candy-cane post (≤ 1k tris), collider r 0.14. Red felt arched box, gold star on the door,
 *  snow on top. The flag is a separate piece on a pivot: MAILBOX_FLAG = the pivot, mailboxFlagGeo() = the flag itself. */
export const MAILBOX_FLAG = { x: 0.1, y: 0.62, z: 0 };
export function mailboxGeo() {
  const g = [];
  // candy-cane post: diagonal red / white knit stripes
  const post = part(new THREE.CylinderGeometry(0.026, 0.028, 0.5, 8, 10, true), SNOW, KNIT, [2, 7.8]);
  const col = post.attributes.color, red = new THREE.Color('#c4362f');
  for (let v = 0; v < col.count; v++) { const q = Math.floor(v / 6), x = Math.floor(q / 10), y = q % 10; if ((x + y) % 4 < 2) col.setXYZ(v, red.r, red.g, red.b); }
  g.push(xf(post, [0, 0.25, 0]));
  g.push(xf(sph(0.05, SNOW, FELT, 6, 3), [0.008, 0.012, 0.006], null, [1.5, 0.45, 1.4])); // snow drift at the foot
  g.push(xf(box(0.11, 0.014, 0.2, '#8a5a3c', KNIT), [0, 0.5, 0])); // wooden shelf under the box
  // arched body: extruded along z, front at +z
  const w = 0.085, h0 = 0.075, arch = [[-w, 0], [w, 0], [w, h0]];
  for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; arch.push([Math.cos(a) * w, h0 + Math.sin(a) * w * 0.82]); }
  arch.push([-w, h0]);
  g.push(xf(extrude(poly(arch), 0.26, RED, FELT), [0, 0.507, -0.13]));
  const door = arch.map(([x, y]) => [x * 0.84, 0.008 + y * 0.84]);
  g.push(xf(extrude(poly(door), 0.008, RED_DARK, FELT), [0, 0.507, 0.13])); // door panel
  g.push(xf(extrude(poly(starPts(0.034, 0.015)), 0.006, GOLD, GLOSS), [0, 0.586, 0.138])); // gold star
  g.push(xf(box(0.085, 0.011, 0.006, IRON, FELT), [0, 0.535, 0.138])); // letter slot
  g.push(xf(sph(0.009, GOLD, GLOSS, 5, 3), [0.052, 0.553, 0.14])); // door knob
  for (const z of [-0.085, 0.085]) g.push(xf(box(0.176, 0.012, 0.012, GOLD, GLOSS), [0, 0.513, z])); // gold straps along the base
  // snow along the top + two lumps
  const snow = [];
  for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; if (i >= 2 && i <= 6) snow.push([Math.cos(a) * w * 1.04, h0 + Math.sin(a) * w * 0.82 + 0.004]); }
  for (let i = 6; i >= 2; i--) { const a = (i / 8) * Math.PI; snow.push([Math.cos(a) * w * 1.04, h0 + Math.sin(a) * w * 0.82 + 0.02 + Math.sin(a) * 0.008]); }
  g.push(xf(extrude(poly(snow), 0.25, SNOW, FELT), [0, 0.507, -0.125]));
  for (const [x, z, s] of [[-0.03, 0.07, 0.032], [0.035, -0.06, 0.036]]) g.push(xf(sph(s, SNOW, FELT, 6, 3), [x, 0.662, z], null, [1.2, 0.5, 1.3]));
  g.push(xf(cyl(0.011, 0.011, 0.02, 6, GOLD, GLOSS), [MAILBOX_FLAG.x - 0.008, MAILBOX_FLAG.y, MAILBOX_FLAG.z], [0, 0, Math.PI / 2])); // the flag's pivot pin
  // "SANTA" would need a texture: a holly sprig on each side says Christmas instead
  for (const sx of [-1, 1]) {
    for (const s of [-1, 1]) g.push(xf(part(new THREE.OctahedronGeometry(1, 0), GREEN, FELT), [sx * 0.0875, 0.555, -0.04 + s * 0.02], [s * 0.5, 0, 0], [0.004, 0.012, 0.026]));
    g.push(xf(bead(0.0075, '#d8342c', GLOSS), [sx * 0.089, 0.553, -0.04]));
  }
  return merge(g);
}
/** The mailbox flag (≤ 80 tris): pivot at its origin, arm along +y with a red felt pennant and a gold bead (rotate about z). */
export function mailboxFlagGeo() {
  return merge([
    xf(box(0.011, 0.118, 0.011, SNOW, FELT), [0.006, 0.059, 0]),
    xf(box(0.052, 0.036, 0.009, '#c4362f', FELT), [0.036, 0.098, 0]),
    xf(extrude(poly(starPts(0.011, 0.005)), 0.011, GOLD, GLOSS), [0.038, 0.098, -0.0055]),
    xf(sph(0.0085, GOLD, GLOSS, 5, 3), [0.006, 0.122, 0]),
  ]);
}

/** Door 22: a runaway letter (≤ 120 tris), lying flat: cream envelope, flap + red wax seal on top, address lines underneath. */
export function letterGeo() {
  const t = 0.0034, flap = shade(CREAM, 0.86);
  return merge([
    box(0.1, 0.006, 0.07, CREAM, FELT),
    tri3([-0.05, t, -0.035], [0, t, 0.006], [0.05, t, -0.035], flap), // the flap (top face)
    tri3([-0.05, t, 0.035], [0.05, t, 0.035], [0, t - 0.0002, 0.012], shade(CREAM, 0.94)),
    xf(cyl(0.0115, 0.0115, 0.005, 6, '#c4362f', GLOSS), [0, 0.0045, 0.006]), // wax seal
    xf(box(0.05, 0.002, 0.005, RED_DARK, FELT), [-0.012, -0.0035, -0.004]), // address lines (underside)
    xf(box(0.036, 0.002, 0.005, RED_DARK, FELT), [-0.019, -0.0035, 0.008]),
    xf(box(0.016, 0.002, 0.018, GREEN, FELT), [0.034, -0.0035, -0.02]), // stamp
  ]);
}

/** Door 20: the carried taper (≤ 200 tris): cream candle in a little gold holder, GLOW flame at the top (y ≈ 0.175). */
export function taperGeo() {
  return merge([
    xf(cyl(0.026, 0.017, 0.008, 8, GOLD, GLOSS), [0, 0.004, 0]), // drip dish
    xf(torus(0.011, 0.0035, GOLD, GLOSS, TAU, 6, 4), [0.034, 0.006, 0], [Math.PI / 2, 0, 0]), // finger ring
    xf(cyl(0.0085, 0.0095, 0.15, 6, CREAM, FELT), [0, 0.083, 0]),
    xf(sph(0.0115, SNOW, FELT, 5, 3), [0.002, 0.155, 0.001], null, [1, 0.5, 1]), // melted rim
    xf(box(0.003, 0.012, 0.003, IRON, FELT), [0, 0.163, 0]), // wick
    xf(sph(0.0125, FLAME, GLOW, 6, 4), [0, 0.176, 0], null, [1, 1.1, 1]),
    xf(cone(0.0098, 0.022, 6, FLAME, GLOW), [0, 0.197, 0]),
  ]);
}

/** Door 18: the bundle of cards tied with ribbon (≤ 200 tris): four felt envelopes, red ribbon cross, bow on top. */
export function bundleGeo() {
  const g = [], cols = [CREAM, '#c4362f', '#f7efe0', GREEN];
  cols.forEach((c, i) => g.push(xf(box(0.1 - (i % 2) * 0.008, 0.0105, 0.07 - (i % 2) * 0.004, c, FELT), [(i % 2 ? 0.003 : -0.002), 0.0055 + i * 0.0112, (i % 2 ? -0.002 : 0.002)], [0, (i - 1.5) * 0.07, 0])));
  const top = 0.0455, rib = '#c4362f';
  g.push(xf(box(0.013, top + 0.003, 0.077, rib, FELT), [0.012, top / 2, 0]));
  g.push(xf(box(0.107, top + 0.003, 0.012, rib, FELT), [0, top / 2, 0.004]));
  for (const p of bow(GOLD, 0.8, GLOSS)) g.push(xf(xf(p, [0, 0, 0], [-Math.PI / 2 + 0.5, 0, 0]), [0.012, top + 0.008, 0.006]));
  g.push(xf(box(0.022, 0.0015, 0.016, SNOW, FELT), [-0.03, top + 0.0005, -0.016])); // stamp on the top card
  g.push(xf(tri3([-0.05, 0, -0.034], [-0.004, 0, 0.0], [0.042, 0, -0.034], shade(GREEN, 0.84)), [0, top + 0.0006, 0])); // top envelope's flap
  return merge(g);
}
