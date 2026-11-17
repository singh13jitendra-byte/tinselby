// Knitted red/cream tram dressed for Christmas: glowing windows, pantograph, garland of tiny lights
// along the roofline, a wreath on the front and a warm headlamp. One merged mesh, faces +z.
import * as THREE from 'three';
import { P, KNIT, FELT, GLOW, GLOSS, part } from '../core/yarn.js';
import { rbox, box, cyl, torus, tube, xf, merge } from '../core/prims.js';

/** Low-poly bead (lights, berries). */
const dot = (r, c, k = FELT) => part(new THREE.SphereGeometry(r, 5, 3), c, k, [1, 1]);

export const TRAM_LEN = 1.5, TRAM_HALF_W = 0.25;

export function buildTramMesh(engine) {
  const L = TRAM_LEN, Wd = 0.48;
  const p = [];
  // body
  p.push(xf(rbox(Wd, 0.25, L, 0.06, P.red, KNIT), [0, 0.205, 0]));
  p.push(xf(rbox(Wd - 0.02, 0.25, L - 0.03, 0.06, P.cream, KNIT), [0, 0.445, 0]));
  p.push(xf(box(Wd + 0.012, 0.03, L + 0.01, P.deepRed, FELT), [0, 0.33, 0]));
  // roof + cotton snow
  p.push(xf(rbox(Wd + 0.03, 0.05, L + 0.03, 0.02, P.deepRed, KNIT, 1), [0, 0.592, 0]));
  p.push(xf(rbox(Wd - 0.03, 0.07, L - 0.1, 0.033, '#fbf9f4', FELT, 1), [0, 0.635, 0]));
  // grey wool skirt + cream window posts (chunky knit, like the felted bus)
  p.push(xf(rbox(Wd + 0.014, 0.07, L + 0.014, 0.03, '#b4b1ad', KNIT, 1), [0, 0.105, 0]));
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) p.push(xf(box(0.016, 0.16, 0.05, '#f3ead8', KNIT), [sx * (Wd / 2 - 0.004), 0.455, -0.675 + i * 0.27]));
  // side windows (warm glow) with cream mullions implied by gaps
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -0.54 + i * 0.27;
      p.push(xf(box(0.01, 0.13, 0.19, P.glowSoft, GLOW), [sx * (Wd / 2 - 0.004), 0.455, z]));
    }
    // doors (red with glowing slit)
    p.push(xf(box(0.012, 0.2, 0.12, P.red, KNIT), [sx * (Wd / 2), 0.29, 0.66]));
  }
  // front + back windscreens, headlamp, tail lights, bumpers, number board
  for (const sz of [-1, 1]) {
    p.push(xf(box(0.34, 0.15, 0.01, P.glowSoft, GLOW), [0, 0.46, sz * (L / 2 - 0.004)]));
    p.push(xf(box(0.44, 0.045, 0.05, P.ink, FELT), [0, 0.085, sz * (L / 2 + 0.005)]));
  }
  p.push(xf(dot(0.034, '#ffe2a8', GLOW), [0, 0.22, L / 2 + 0.012], null, [1, 1, 0.6])); // big warm headlamp
  p.push(xf(torus(0.036, 0.008, P.gold, GLOSS, Math.PI * 2, 12), [0, 0.22, L / 2 + 0.012]));
  for (const sx of [-1, 1]) p.push(xf(dot(0.016, '#ff5a4a', GLOW), [sx * 0.16, 0.16, -L / 2 - 0.006]));
  // bogies + wheels
  for (const sz of [-1, 1]) {
    p.push(xf(box(0.36, 0.07, 0.32, P.ink, FELT), [0, 0.05, sz * 0.48]));
    for (const sx of [-1, 1]) for (const wz of [-0.09, 0.09]) p.push(xf(cyl(0.045, 0.045, 0.03, 7, P.woodDark, FELT), [sx * 0.19, 0.045, sz * 0.48 + wz], [0, 0, Math.PI / 2]));
  }
  // pantograph: base, diamond arms, collector bar
  p.push(xf(box(0.16, 0.025, 0.12, P.ink, FELT), [0, 0.675, -0.05]));
  p.push(tube([[0, 0.66, -0.1], [0, 0.77, 0.03], [0, 0.88, -0.06]], 0.007, P.ink, FELT, 8, 4));
  p.push(tube([[0, 0.66, 0.0], [0, 0.77, -0.12], [0, 0.88, -0.06]], 0.007, P.ink, FELT, 8, 4));
  p.push(xf(box(0.32, 0.014, 0.024, P.ink, FELT), [0, 0.885, -0.06]));
  // garland with tiny lights scalloped along both roof edges
  const lightCols = [P.glow, '#ff6a5a', '#9fe07a', P.gold, '#ffd89a'];
  for (const sx of [-1, 1]) {
    const pts = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const z = -L / 2 + 0.04 + (i / n) * (L - 0.08);
      pts.push([sx * (Wd / 2 + 0.012), 0.56 - Math.abs(Math.sin((i / n) * Math.PI * 5)) * 0.035, z]);
    }
    p.push(tube(pts, 0.011, P.pine, KNIT, 24, 3));
    for (let i = 0; i <= n; i++) p.push(xf(dot(0.011, lightCols[(i + (sx > 0 ? 2 : 0)) % lightCols.length], GLOW), [pts[i][0] + sx * 0.008, pts[i][1] - 0.008, pts[i][2]]));
  }
  // garland across the front and back above the windscreen
  for (const sz of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const x = -0.22 + i * 0.055; pts.push([x, 0.565 - Math.abs(Math.sin((i / 8) * Math.PI * 2)) * 0.03, sz * (L / 2 + 0.014)]); }
    p.push(tube(pts, 0.011, P.pine, KNIT, 12, 3));
    for (let i = 0; i <= 8; i += 2) p.push(xf(dot(0.011, lightCols[i % lightCols.length], GLOW), [pts[i][0], pts[i][1] - 0.01, pts[i][2] + sz * 0.006]));
  }
  // wreath on the front (below the windscreen), red bow and glowing berries
  p.push(xf(torus(0.062, 0.024, P.pine, KNIT, Math.PI * 2, 10), [0, 0.33, L / 2 + 0.03]));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; p.push(xf(dot(0.011, i % 2 ? '#ff5a4a' : P.glow, GLOW), [Math.cos(a) * 0.062, 0.33 + Math.sin(a) * 0.062, L / 2 + 0.055])); }
  for (const sx of [-1, 1]) p.push(xf(dot(0.02, P.red, FELT), [sx * 0.02, 0.27, L / 2 + 0.05], null, [1.3, 0.8, 0.6]));
  const mesh = new THREE.Mesh(merge(p), engine.mat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'life-tram';
  return mesh;
}
