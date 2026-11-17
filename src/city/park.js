// Pinecone Park: "Welcome to Tinselby" gate, knitted paths, pom-pom trees, gazebo, benches, lamps.
import * as THREE from 'three';
import {
  C, xf, box, rbox, cyl, cylS, cone, ball, bead, torus, tube, faceColor, angleStripes, bulbLine, lampGeos, benchGeos,
  pineGeos, pomTreeGeos, pomLights, fenceGeos, snowLump, shrubGeos, textGeos, put, KNIT, FELT, GLOW, GLOSS, mulberry32,
} from './kit.js';

const TAU = Math.PI * 2;
const CROWNS = [C.pink, C.sage, C.mint, C.rose, C.cream, C.teal];

/** Knitted path ribbon along a polyline with chunky i-cord edges. */
export function pathGeos(pts, w, closed = false, y = 0.042) {
  const g = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    g.push(xf(box(L, 0.012, w, C.path, KNIT), [(ax + bx) / 2, y, (az + bz) / 2], [0, -ang, 0]));
    const nx = -Math.sin(ang) * (w / 2), nz = Math.cos(ang) * (w / 2);
    for (const s of [-1, 1]) g.push(tube([[ax + s * nx, y + 0.01, az + s * nz], [bx + s * nx, y + 0.01, bz + s * nz]], 0.032, C.snow, KNIT, 3, 5));
  }
  for (let i = 0; i < pts.length; i++) {
    if (!closed && (i === 0 || i === pts.length - 1)) continue;
    g.push(xf(cyl(w / 2, w / 2, 0.012, 12, C.path, KNIT), [pts[i][0], y, pts[i][1]]));
  }
  return g;
}

/** Scatter a little forest (pines + pom-pom trees + lumps) in a rect, each prop going to the group that owns the spot. */
export function forest(K, rect, n, { pines = 0.65, lumps = 0.5, minS = 0.9, maxS = 1.8, pomRatio = 0.35 } = {}) {
  const rnd = mulberry32(Math.floor(rect[0] * 13 + rect[1] * 7) + 99);
  K.scatter(rect, n, 0.32, (x, z, i) => {
    const gid = K.groupAt(x, z);
    const s = minS + rnd() * (maxS - minS);
    if (rnd() < pines) {
      const v = i % 3;
      K.prop(gid, [x, 0.03, z], [put('pineF' + v, () => pineGeos([C.pine, C.teal, '#3d6f4c'][v], ['#285a3e', '#3f7d78', '#2f5a3e'][v], { bobbles: v !== 2 }), x, 0.03, z, rnd() * 6, s)]);
    } else {
      K.prop(gid, [x, 0.03, z], [put('pomF' + (i % 6), () => pomTreeGeos(CROWNS[i % 6]), x, 0.03, z, rnd() * 6, s * 0.9)]);
    }
    K.colliders.addCircle(x, z, 0.14 * s, 'tree');
  });
  K.scatter(rect, Math.round(n * lumps), 0.25, (x, z) => {
    K.prop(K.groupAt(x, z), [x, 0.03, z], [put('lump', () => snowLump(0.32), x, 0.03, z, rnd() * 3, 0.7 + rnd() * 0.7)], { cast: false });
  });
}

export function buildPark(K) {
  const { layout: L, colliders } = K;
  const PK = L.PARK, GATE = L.GATE;
  const rnd = mulberry32(17);
  const P = (geos, anchor, opts) => K.prop('park', anchor, geos, opts);

  // ---------------------------------------------------------------- paths
  const loop = L.WALK_LOOPS.find((w) => w.id === 'parkLoop').pts;
  const lg = pathGeos(loop, 0.62, true);
  // split into props per segment for the reveal ripple
  for (let i = 0; i < lg.length; i++) {
    const bb = lg[i]; bb.computeBoundingBox();
    const c = bb.boundingBox.getCenter(new THREE.Vector3());
    P([bb], [c.x, 0.03, c.z], { cast: false, kind: 'pop' });
  }
  for (const seg of [[[0, 7.6], [0, 9.0]], [[0, 9.0], [0, 14.0]], [[0, 14.0], [0, 15.9]]]) {
    const g = pathGeos(seg, 0.7, false, 0.044);
    P(g, [0, 0.03, (seg[0][1] + seg[1][1]) / 2], { cast: false });
  }
  K.keepSeg(0, 7.6, 0, 15.9, 0.5);

  // ---------------------------------------------------------------- gate arch
  {
    const { x, z } = GATE, hw = GATE.width / 2;
    const g = [], lights = [];
    for (const s of [-1, 1]) {
      const px = x + s * hw;
      g.push(xf(rbox(0.42, 0.2, 0.42, 0.04, C.stone, KNIT, 1), [px, 0.1, z]));
      const p = cylS(0.15, 0.16, 1.3, 12, 14, C.red);
      faceColor(p, (cx, cy, cz) => (Math.floor(cy / 0.1 + (Math.atan2(cz, cx) / TAU) * 2 + 10) % 2 ? C.cream : null));
      g.push(xf(p, [px, 0.85, z]));
      g.push(xf(cyl(0.2, 0.2, 0.06, 12, C.pine), [px, 1.52, z]));
      g.push(xf(ball(0.17, C.snow, FELT, 10, 6), [px, 1.58, z], null, [1.2, 0.5, 1.2]));
      g.push(xf(box(0.14, 0.18, 0.14, C.warm, GLOW), [px, 1.72, z]));
      g.push(xf(cone(0.13, 0.12, 4, C.lampPost), [px, 1.87, z], [0, Math.PI / 4, 0]));
      g.push(xf(bead(0.05, C.snow), [px, 1.94, z], null, [1.4, 0.6, 1.4]));
      g.push(...wreath(px, 1.05, z + 0.17));
    }
    // arch: chunky garland half-torus, flattened
    const arch = torus(hw, 0.075, C.pine, KNIT, Math.PI, 28);
    g.push(xf(arch, [x, 1.5, z], null, [1, 0.5, 1]));
    for (let k = 0; k <= 22; k++) {
      const a = (k / 22) * Math.PI;
      const px = x + Math.cos(a) * hw, py = 1.5 + Math.sin(a) * hw * 0.5;
      lights.push(xf(bead(0.032, C.bulbs[k % 4], GLOW), [px, py + 0.04, z + 0.075]));
      if (k % 3 === 1) g.push(xf(bead(0.045, k % 2 ? C.red : C.gold, GLOSS), [px, py - 0.06, z + 0.05]));
    }
    // hanging sign board with knitted letters
    g.push(xf(rbox(2.5, 0.62, 0.06, 0.05, C.cream, FELT, 2), [x, 1.62, z]));
    const border = [];
    for (const [ax, ay, bx, by] of [[-1.2, 1.35, 1.2, 1.35], [-1.2, 1.89, 1.2, 1.89]]) border.push(tube([[x + ax, ay, z + 0.035], [x + bx, by, z + 0.035]], 0.018, C.red, KNIT, 3, 5));
    g.push(...border);
    g.push(...textGeos('WELCOME TO', 0.13, C.pine, { r: 0.013 }).map((q) => xf(q, [x, 1.66, z + 0.045])));
    g.push(...textGeos('TINSELBY', 0.22, C.red, { r: 0.021 }).map((q) => xf(q, [x, 1.41, z + 0.05])));
    for (const s of [-1, 1]) g.push(xf(bead(0.05, C.gold, GLOSS), [x + s * 1.12, 1.62, z + 0.05]));
    // ropes from arch to board
    for (const s of [-1, 1]) g.push(xf(cyl(0.012, 0.012, 0.25, 4, C.thread), [x + s * 0.9, 1.97, z]));
    const b = P(g, [x, 0, z], { delay: 0.15, dur: 0.7 });
    b.add(lights);
    for (const s of [-1, 1]) colliders.addCircle(x + s * hw, z, 0.2, 'gate');
    K.keepCircle(x - hw, z, 0.5); K.keepCircle(x + hw, z, 0.5);
    // fence along the south edge
    for (const [a, bx] of [[-7.4, -4.6], [-4.6, -1.9], [1.9, 4.6], [4.6, 7.4]]) P(fenceGeos(a, 15.82, bx, 15.82), [(a + bx) / 2, 0, 15.82], { cast: false });
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) P([put('shrub' + k, () => shrubGeos([C.red, C.rose, C.pine][k]), x + sx * (2.1 + k * 0.32), 0.03, 15.45 - (k % 2) * 0.2, k)], [x + sx * 2.2, 0, 15.4], { cast: false });
  }

  // ---------------------------------------------------------------- gazebo
  {
    const x = 3.0, z = 11.6, g = [], lights = [];
    g.push(xf(cyl(0.78, 0.82, 0.12, 8, C.wood), [0, 0.09, 0]));
    g.push(xf(cyl(0.72, 0.72, 0.02, 8, C.cream, FELT), [0, 0.16, 0]));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + TAU / 16;
      g.push(xf(cyl(0.03, 0.03, 0.95, 6, C.cream), [Math.cos(a) * 0.68, 0.62, Math.sin(a) * 0.68]));
    }
    g.push(xf(torus(0.68, 0.02, C.cream, KNIT, TAU * 0.82, 16), [0, 0.42, 0], [Math.PI / 2, 0, -0.9]));
    g.push(xf(cyl(0.82, 0.82, 0.08, 8, C.pine), [0, 1.12, 0]));
    const roof = angleStripes(cone(0.95, 0.62, 8, C.red), 8, C.red, C.cream);
    g.push(xf(roof, [0, 1.47, 0]));
    g.push(xf(cone(0.55, 0.34, 8, C.snow, KNIT), [0, 1.62, 0]));
    g.push(xf(bead(0.06, C.gold, GLOSS), [0, 1.82, 0]));
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; lights.push(xf(bead(0.025, C.warm, GLOW), [Math.cos(a) * 0.86, 1.05, Math.sin(a) * 0.86])); }
    const b = P(g.map((q) => xf(q, [x, 0.03, z])), [x, 0.03, z]);
    b.add(lights.map((q) => xf(q, [x, 0.03, z])));
    colliders.addCircle(x, z, 0.8, 'gazebo');
    K.keepCircle(x, z, 1.2);
  }

  // ---------------------------------------------------------------- benches, lamps, snow pile
  for (const [x, z, ry] of [[-3.0, 8.35, 0], [3.4, 8.35, 0], [-6.45, 11.5, Math.PI / 2], [6.5, 11.5, -Math.PI / 2], [-2.6, 14.65, Math.PI], [2.6, 14.65, Math.PI]]) {
    P([put('bench', benchGeos, x, 0.03, z, ry)], [x, 0.03, z]);
    colliders.addSegment(x - Math.cos(ry) * 0.3, z + Math.sin(ry) * 0.3, x + Math.cos(ry) * 0.3, z - Math.sin(ry) * 0.3, 0.12, 'bench');
    K.keepCircle(x, z, 0.5);
  }
  for (const [x, z] of [[-5.6, 8.35], [5.7, 8.35], [-6.45, 14.6], [6.45, 14.6], [-0.6, 10.4], [0.6, 12.8]]) {
    P([put('lamp', () => lampGeos(), x, 0.03, z)], [x, 0.03, z]);
    colliders.addCircle(x, z, 0.08, 'lamp');
    K.keepCircle(x, z, 0.3);
  }
  P([xf(ball(0.4, C.snow, FELT, 12, 7), [PK.bauble.x, 0.03, PK.bauble.z], null, [1, 0.28, 0.85])], [PK.bauble.x, 0.03, PK.bauble.z], { cast: false });
  // snowballs near the snowman spot
  for (let k = 0; k < 4; k++) P([xf(ball(0.05 + k * 0.012, C.snow, FELT, 8, 5), [PK.snowmanSpot.x + 0.55 + k * 0.12, 0.08, PK.snowmanSpot.z + 0.35 - (k % 2) * 0.15])], [PK.snowmanSpot.x + 0.6, 0.03, PK.snowmanSpot.z + 0.3]);

  // ---------------------------------------------------------------- pom-pom trees with fairy lights (festive 3)
  K.scatter([-7.2, 7.8, 7.2, 15.4], 16, 0.36, (x, z, i) => {
    const s = 1.1 + rnd() * 0.55, ry = rnd() * 6;
    const b = P([put('pom' + (i % 6), () => pomTreeGeos(CROWNS[i % 6]), x, 0.03, z, ry, s)], [x, 0.03, z]);
    b.add([put('pomL', pomLights, x, 0.03, z, ry, s)], 'festive3');
    colliders.addCircle(x, z, 0.12 * s, 'tree');
  });
  forest(K, [-7.3, 7.8, 7.3, 15.4], 8, { pines: 1, lumps: 1.2, minS: 0.9, maxS: 1.5 });
  // corners south-west / south-east of the park
  forest(K, [-20.8, 7.7, -7.7, 15.8], 15, { minS: 1.0, maxS: 2.1 });
  forest(K, [7.7, 9.8, 20.8, 15.8], 15, { minS: 1.0, maxS: 2.1 });
  return {};
}

function wreath(x, y, z) {
  const g = [xf(torus(0.11, 0.04, C.pine, KNIT, TAU, 14), [x, y, z])];
  g.push(xf(bead(0.035, C.red), [x - 0.03, y - 0.1, z + 0.03], null, [1.3, 0.8, 0.6]));
  g.push(xf(bead(0.035, C.red), [x + 0.03, y - 0.1, z + 0.03], null, [1.3, 0.8, 0.6]));
  return g;
}
