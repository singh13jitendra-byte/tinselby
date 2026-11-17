// Little knitted cars with glowing headlights (one carries a Christmas tree on its roof). One merged mesh each, faces +z.
import * as THREE from 'three';
import { P, KNIT, FELT, GLOW, GLOSS, part } from '../core/yarn.js';
import { rbox, box, cyl, cone, torus, xf, merge } from '../core/prims.js';

/** Low-poly bead (lights, berries). */
const dot = (r, c, k = FELT) => part(new THREE.SphereGeometry(r, 5, 3), c, k, [1, 1]);

export const CAR_LEN = 0.72, CAR_HALF_W = 0.2;

const GREY = '#b4b1ad', CREAM = '#f3ead8';

/** Wheel: black wool tyre with a grey spiral hub (reference: cream knitted bus). */
function wheel(p, x, y, z, r) {
  p.push(xf(cyl(r, r, 0.055, 9, P.ink, KNIT), [x, y, z], [0, 0, Math.PI / 2]));
  p.push(xf(cyl(r * 0.55, r * 0.55, 0.06, 7, GREY, KNIT), [x, y, z], [0, 0, Math.PI / 2]));
  p.push(xf(dot(r * 0.2, CREAM), [x + Math.sign(x) * 0.03, y, z]));
}

/** Cream knitted mini-bus: grey wool skirt and window frames, thick cotton roof, warm windows, round lamps. */
function busParts(p) {
  const L = CAR_LEN, Wd = 0.38;
  p.push(xf(rbox(Wd, 0.2, L, 0.05, CREAM, KNIT, 1), [0, 0.16, 0]));
  p.push(xf(rbox(Wd + 0.012, 0.075, L + 0.012, 0.03, GREY, KNIT, 1), [0, 0.092, 0]));
  p.push(xf(rbox(Wd - 0.02, 0.17, L - 0.04, 0.04, CREAM, KNIT, 1), [0, 0.335, 0]));
  // thick cotton-wool roof
  p.push(xf(rbox(Wd + 0.03, 0.075, L + 0.02, 0.035, '#fbf9f4', FELT, 1), [0, 0.45, 0]));
  // warm windows with grey wool frames
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) p.push(xf(box(0.008, 0.115, 0.165, P.glowSoft, GLOW), [sx * (Wd / 2 - 0.008), 0.34, -0.2 + i * 0.2]));
    for (let i = 0; i < 4; i++) p.push(xf(box(0.014, 0.14, 0.024, GREY, KNIT), [sx * (Wd / 2 - 0.006), 0.34, -0.3 + i * 0.2]));
    p.push(xf(box(0.014, 0.022, L - 0.1, GREY, KNIT), [sx * (Wd / 2 - 0.006), 0.272, 0]));
  }
  for (const sz of [-1, 1]) {
    p.push(xf(box(0.27, 0.115, 0.008, P.glowSoft, GLOW), [0, 0.34, sz * (L / 2 - 0.022)]));
    for (const sx of [-1, 1]) p.push(xf(box(0.024, 0.14, 0.014, GREY, KNIT), [sx * 0.15, 0.34, sz * (L / 2 - 0.02)]));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(p, sx * 0.178, 0.066, sz * 0.21, 0.066);
  for (const sx of [-1, 1]) {
    p.push(xf(dot(0.032, '#ffe7b0', GLOW), [sx * 0.115, 0.17, L / 2 + 0.004], null, [1, 1, 0.55]));
    p.push(xf(torus(0.034, 0.008, CREAM, KNIT, Math.PI * 2, 8), [sx * 0.115, 0.17, L / 2 + 0.004]));
    p.push(xf(dot(0.016, '#ff4a3a', GLOW), [sx * 0.13, 0.15, -L / 2 - 0.002]));
  }
  p.push(xf(box(0.11, 0.04, 0.012, '#fbf9f4', FELT), [0, 0.09, L / 2 + 0.008]));
  // wreath on the nose
  p.push(xf(torus(0.045, 0.017, P.pine, KNIT, Math.PI * 2, 10), [0, 0.215, L / 2 + 0.016]));
  p.push(xf(dot(0.014, P.red, FELT), [0, 0.175, L / 2 + 0.03]));
}

export function buildCarMesh(engine, color, extra = '') {
  const p = [];
  const L = CAR_LEN, Wd = 0.38;
  if (extra === '') {
    busParts(p);
    const bus = new THREE.Mesh(merge(p), engine.mat);
    bus.castShadow = bus.receiveShadow = true;
    bus.name = 'life-car';
    return bus;
  }
  p.push(xf(rbox(Wd, 0.15, L, 0.06, color, KNIT), [0, 0.125, 0]));
  p.push(xf(rbox(Wd + 0.01, 0.06, L + 0.01, 0.028, GREY, KNIT, 1), [0, 0.075, 0]));
  p.push(xf(rbox(0.32, 0.15, 0.4, 0.06, color, KNIT), [0, 0.25, -0.04]));
  p.push(xf(rbox(0.31, 0.06, 0.39, 0.028, '#fbf9f4', FELT, 1), [0, 0.345, -0.04]));
  // windows: warm lamplight inside
  for (const sx of [-1, 1]) p.push(xf(box(0.008, 0.08, 0.3, P.glowSoft, GLOW), [sx * 0.161, 0.26, -0.04]));
  p.push(xf(box(0.26, 0.08, 0.008, P.glowSoft, GLOW), [0, 0.26, 0.161]));
  p.push(xf(box(0.26, 0.08, 0.008, P.glowSoft, GLOW), [0, 0.26, -0.241]));
  for (const sx of [-1, 1]) p.push(xf(box(0.012, 0.1, 0.03, color, KNIT), [sx * 0.162, 0.26, -0.04]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(p, sx * 0.176, 0.06, sz * 0.22, 0.06);
  // headlights (GLOW) with wool rings, tail lights
  for (const sx of [-1, 1]) {
    p.push(xf(dot(0.03, '#ffe7b0', GLOW), [sx * 0.12, 0.14, L / 2 - 0.004], null, [1, 1, 0.6]));
    p.push(xf(torus(0.032, 0.008, CREAM, KNIT, Math.PI * 2, 8), [sx * 0.12, 0.14, L / 2 + 0.002]));
    p.push(xf(dot(0.016, '#ff4a3a', GLOW), [sx * 0.13, 0.14, -L / 2 + 0.002]));
  }
  if (extra === 'tree') {
    p.push(xf(cone(0.09, 0.26, 9, P.pine, KNIT), [0, 0.44, -0.04], [Math.PI / 2, 0, 0]));
    p.push(xf(cyl(0.02, 0.02, 0.06, 6, P.wood, FELT), [0, 0.44, -0.2], [Math.PI / 2, 0, 0]));
    for (const z of [-0.1, 0.02]) p.push(xf(torus(0.07 - (z + 0.1) * 0.25, 0.006, P.red, FELT, Math.PI * 2, 10), [0, 0.43, z]));
  } else if (extra === 'wreath') {
    p.push(xf(torus(0.05, 0.018, P.pine, KNIT, Math.PI * 2, 12), [0, 0.15, L / 2 + 0.02]));
    p.push(xf(dot(0.015, P.red, FELT), [0, 0.11, L / 2 + 0.035]));
  } else if (extra === 'gifts') {
    p.push(xf(box(0.12, 0.08, 0.1, P.red, KNIT), [-0.04, 0.39, -0.08], [0, 0.3, 0]));
    p.push(xf(box(0.09, 0.07, 0.09, P.gold, KNIT), [0.06, 0.38, 0.02], [0, -0.2, 0]));
    p.push(xf(box(0.124, 0.084, 0.02, P.snow, FELT), [-0.04, 0.39, -0.08], [0, 0.3, 0]));
  }
  const mesh = new THREE.Mesh(merge(p), engine.mat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'life-car';
  return mesh;
}
