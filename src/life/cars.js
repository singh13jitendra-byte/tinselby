// Little knitted cars with glowing headlights (one carries a Christmas tree on its roof). One merged mesh each, faces +z.
import * as THREE from 'three';
import { P, KNIT, FELT, GLOW, GLOSS, part } from '../core/yarn.js';
import { rbox, box, cyl, cone, torus, xf, merge } from '../core/prims.js';

/** Low-poly bead (lights, berries). */
const dot = (r, c, k = FELT) => part(new THREE.SphereGeometry(r, 5, 3), c, k, [1, 1]);

export const CAR_LEN = 0.72, CAR_HALF_W = 0.2;

export function buildCarMesh(engine, color, extra = '') {
  const p = [];
  const L = CAR_LEN, Wd = 0.38;
  p.push(xf(rbox(Wd, 0.15, L, 0.06, color, KNIT), [0, 0.115, 0]));
  p.push(xf(rbox(0.32, 0.15, 0.4, 0.06, color, KNIT), [0, 0.245, -0.04]));
  p.push(xf(rbox(0.27, 0.03, 0.33, 0.014, P.snow, FELT, 1), [0, 0.33, -0.04]));
  // windows: glossy ice-blue
  for (const sx of [-1, 1]) p.push(xf(box(0.008, 0.08, 0.3, P.ice, GLOSS), [sx * 0.161, 0.255, -0.04]));
  p.push(xf(box(0.26, 0.08, 0.008, P.ice, GLOSS), [0, 0.255, 0.161]));
  p.push(xf(box(0.26, 0.08, 0.008, P.ice, GLOSS), [0, 0.255, -0.241]));
  // wheels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(xf(cyl(0.056, 0.056, 0.05, 7, P.ink, FELT), [sx * 0.175, 0.056, sz * 0.22], [0, 0, Math.PI / 2]));
    p.push(xf(cyl(0.025, 0.025, 0.052, 5, P.cream, FELT), [sx * 0.176, 0.056, sz * 0.22], [0, 0, Math.PI / 2]));
  }
  // bumpers, headlights (GLOW), tail lights
  p.push(xf(box(0.4, 0.04, 0.04, P.cream, FELT), [0, 0.06, L / 2]));
  p.push(xf(box(0.4, 0.04, 0.04, P.cream, FELT), [0, 0.06, -L / 2]));
  for (const sx of [-1, 1]) {
    p.push(xf(dot(0.028, '#ffe7b0', GLOW), [sx * 0.12, 0.13, L / 2 - 0.004], null, [1, 1, 0.6]));
    p.push(xf(dot(0.016, '#ff4a3a', GLOW), [sx * 0.13, 0.13, -L / 2 + 0.002]));
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
