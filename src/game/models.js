// Small knitted props for the tasks: bauble, scarf, star, giver marker, sparkle, hint chevron.
// Each prop is merged into ONE geometry and drawn with the shared yarn material.
import * as THREE from 'three';
import { P } from '../core/yarn.js';
import { sph, dot, cyl, torus, rbox, extrude, flatShape, xf, merge, poly, starPts, KNIT, FELT, GLOW, GLOSS } from '../core/prims.js';

const mesh = (geo, mat, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
};

/** A box running from a to b (Vector3), thickness t along ~n, width w across. */
function segBox(a, b, w, t, color, n, kind = KNIT) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const L = dir.length();
  dir.normalize();
  const Z = new THREE.Vector3().crossVectors(dir, n).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, dir).normalize();
  const g = rbox(L * 1.08, t, w, Math.min(t, w) * 0.45, color, kind, 1);
  const m = new THREE.Matrix4().makeBasis(dir, Y, Z);
  m.setPosition(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

const STRIPES = [P.red, P.cream, P.red, P.green];

function stripedStrip(pts, w, t, n) {
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) parts.push(segBox(pts[i], pts[i + 1], w, t, STRIPES[i % STRIPES.length], n));
  return parts;
}

function fringe(at, dir, color, n) {
  const out = [];
  const side = new THREE.Vector3().crossVectors(dir, n).normalize();
  for (const o of [-0.026, -0.009, 0.009, 0.026]) {
    const a = at.clone().addScaledVector(side, o);
    out.push(segBox(a, a.clone().addScaledVector(dir, 0.04), 0.008, 0.008, color, n, FELT));
  }
  return out;
}

/** Red glossy bauble with a gold cap and a knitted cream band (≈0.15 across, centred). */
export function baubleGeo() {
  const g = [];
  g.push(sph(0.075, P.red, GLOSS, 18, 14));
  g.push(xf(torus(0.074, 0.009, P.cream, KNIT, Math.PI * 2, 28), [0, 0, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.push(xf(dot(0.009, P.gold, GLOSS), [Math.cos(a) * 0.066, 0.034, Math.sin(a) * 0.066]));
    g.push(xf(dot(0.009, P.gold, GLOSS), [Math.cos(a + 0.4) * 0.066, -0.034, Math.sin(a + 0.4) * 0.066]));
  }
  g.push(xf(cyl(0.022, 0.026, 0.03, 10, P.gold, GLOSS), [0, 0.08, 0]));
  g.push(xf(torus(0.014, 0.004, P.gold, GLOSS, Math.PI * 2, 12), [0, 0.102, 0]));
  return merge(g);
}

/** Snow pile the bauble hides in. */
export function snowPileGeo() {
  return merge([
    xf(sph(0.2, P.snow, FELT, 14, 10), [0, 0, 0], null, [1, 0.42, 0.9]),
    xf(sph(0.13, P.snow, FELT, 12, 8), [0.16, 0, 0.08], null, [1, 0.5, 1]),
    xf(sph(0.11, P.snowShade, FELT, 12, 8), [-0.15, 0, -0.06], null, [1, 0.55, 1]),
  ]);
}

/** Striped scarf lying on the ice in a lazy S (base at y=0). */
export function scarfGroundGeo() {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push(new THREE.Vector3((u - 0.5) * 0.62, 0.014, Math.sin(u * Math.PI * 1.6) * 0.1));
  }
  const up = new THREE.Vector3(0, 1, 0);
  const g = stripedStrip(pts, 0.075, 0.022, up);
  const d0 = new THREE.Vector3().subVectors(pts[0], pts[1]).normalize();
  const d1 = new THREE.Vector3().subVectors(pts[12], pts[11]).normalize();
  g.push(...fringe(pts[0], d0, P.cream, up), ...fringe(pts[12], d1, P.cream, up));
  return merge(g);
}

/** Scarf draped over the hands while carried (centred on the carry anchor). */
export function scarfCarryGeo() {
  const pts = [];
  // a U: down the left, across the bottom, up the right — reads as a folded scarf held in front
  const path = [[-0.05, 0.03], [-0.055, -0.02], [-0.05, -0.07], [-0.02, -0.095], [0.02, -0.095], [0.05, -0.07], [0.055, -0.02], [0.05, 0.03], [0.02, 0.05], [-0.02, 0.05]];
  for (const [x, y] of path) pts.push(new THREE.Vector3(x, y, 0.02));
  const n = new THREE.Vector3(0, 0, 1);
  const g = stripedStrip(pts, 0.05, 0.02, n);
  // hanging tails with fringe
  const tail = [new THREE.Vector3(0.03, 0.0, 0.035), new THREE.Vector3(0.035, -0.07, 0.04), new THREE.Vector3(0.03, -0.14, 0.04)];
  g.push(...stripedStrip(tail, 0.045, 0.018, n));
  g.push(...fringe(tail[2], new THREE.Vector3(0, -1, 0), P.cream, n));
  return merge(g);
}

/** Five-point gold star (upright, faces +z, centred). r = outer radius. */
export function starGeo(r = 0.16, depth = 0.05, withRim = true) {
  const shape = poly(starPts(r, r * 0.45, 5));
  const g = [xf(extrude(shape, depth, P.gold, GLOW, 2), [0, 0, -depth / 2])];
  if (withRim) {
    const inner = poly(starPts(r * 0.62, r * 0.28, 5));
    g.push(xf(extrude(inner, depth * 0.3, P.glowSoft, GLOW, 2), [0, 0, depth / 2]));
    g.push(xf(extrude(inner, depth * 0.3, P.glowSoft, GLOW, 2), [0, 0, -depth / 2 - depth * 0.3]));
  }
  return merge(g);
}

/** Little felt cushion the star waits on at the top station. */
export function cushionGeo() {
  return merge([
    xf(rbox(0.36, 0.08, 0.3, 0.035, P.deepRed, FELT, 2), [0, 0.04, 0]),
    xf(torus(0.14, 0.012, P.gold, KNIT, Math.PI * 2, 20), [0, 0.085, 0], [Math.PI / 2, 0, 0]),
    ...[[-0.17, -0.14], [0.17, -0.14], [-0.17, 0.14], [0.17, 0.14]].map(([x, z]) => xf(dot(0.02, P.gold, GLOSS), [x, 0.07, z])),
  ]);
}

/** Bobbing marker above quest givers (small glowing star with a felt halo bead). */
export function markerGeo() {
  return merge([starGeo(0.075, 0.028, false), xf(dot(0.018, P.glowSoft, GLOW), [0, -0.11, 0])]);
}

/** Sparkle: a ring of tiny glowing beads + a mini star (hint that an item is here). */
export function sparkleGeo() {
  const g = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.push(xf(dot(i % 2 ? 0.014 : 0.02, i % 2 ? P.glowSoft : P.gold, GLOW), [Math.cos(a) * 0.17, (i % 3) * 0.05, Math.sin(a) * 0.17]));
  }
  g.push(xf(starGeo(0.045, 0.016, false), [0, 0.2, 0]));
  return merge(g);
}

/** Flat chevron arrow on the ground, pointing to −z (rotate around y to aim). */
export function chevronGeo() {
  const a = poly([[0, 0.17], [0.13, 0.03], [0.075, 0.03], [0, 0.1], [-0.075, 0.03], [-0.13, 0.03]]);
  const b = poly([[0, 0.06], [0.13, -0.08], [0.075, -0.08], [0, -0.01], [-0.075, -0.08], [-0.13, -0.08]]);
  return merge([flatShape(a, 0.014, P.gold, GLOW, 0), flatShape(b, 0.014, P.glowSoft, GLOW, 0)]);
}

export function makeModels(mat) {
  const star = starGeo();
  return {
    bauble: () => mesh(baubleGeo(), mat),
    snowPile: () => mesh(snowPileGeo(), mat),
    scarfGround: () => mesh(scarfGroundGeo(), mat),
    scarfCarry: () => mesh(scarfCarryGeo(), mat),
    star: () => mesh(star, mat),
    cushion: () => mesh(cushionGeo(), mat),
    markerGeo: markerGeo(),
    sparkleGeo: sparkleGeo(),
    chevron: () => mesh(chevronGeo(), mat, false),
    mesh: (g, s) => mesh(g, mat, s),
  };
}
