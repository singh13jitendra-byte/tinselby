// Frostmere Lake: walkable ice, cable-knit shore, pebbles, reeds, pier, promenade, Ferris wheel, cocoa hut.
import * as THREE from 'three';
import {
  C, xf, box, rbox, cyl, cone, ball, bead, torus, tube, part, flatShapeE, garland, lampGeos, benchGeos, pineGeos,
  pomTreeGeos, snowLump, put, merge, KNIT, FELT, GLOW, GLOSS, mulberry32,
} from './kit.js';
import { pathGeos, forest } from './park.js';
import { townhouse } from './residential.js';

const TAU = Math.PI * 2;

export function buildLakeside(K) {
  const { layout: L, colliders, engine } = K;
  const LK = L.LAKE;
  const { x: cx, z: cz } = LK.center, rx = LK.rx, rz = LK.rz;
  const rnd = mulberry32(41);
  const P = (geos, anchor, opts) => K.prop('lakeside', anchor, geos, opts);
  const isIce = (x, z) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1;
  const promenade = L.WALK_LOOPS.find((w) => w.id === 'promenade').pts;
  const distProm = (x, z) => {
    let d = 1e9;
    for (let i = 0; i < promenade.length - 1; i++) {
      const [ax, az] = promenade[i], [bx, bz] = promenade[i + 1];
      const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz;
      const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / l2));
      d = Math.min(d, Math.hypot(x - ax - abx * t, z - az - abz * t));
    }
    return d;
  };

  // ---------------------------------------------------------------- ice + shore
  {
    const g = [];
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rx, rz, 0, TAU, false, 0);
    g.push(xf(flatShapeE(shape, 0.02, C.ice, GLOSS, 48), [cx, 0.03, cz]));
    // inner lighter ice
    const s2 = new THREE.Shape(); s2.absellipse(0, 0, rx * 0.72, rz * 0.68, 0, TAU, false, 0);
    g.push(xf(flatShapeE(s2, 0.004, '#b9d6e6', GLOSS, 40), [cx + 0.3, 0.05, cz - 0.1]));
    // skate marks
    for (const [ox, oz, a, b] of [[0.6, 0.2, 2.2, 1.3], [-1.0, -0.3, 1.5, 0.9], [1.4, -0.6, 1.0, 0.7]]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = (i / 24) * TAU; pts.push([cx + ox + Math.cos(t) * a, 0.056, cz + oz + Math.sin(t) * b]); }
      g.push(tube(pts, 0.008, '#e6f0f5', FELT, 48, 3, false));
    }
    const ice = P(g, [cx, 0, cz], { cast: false, delay: 0.2, kind: 'pop' });
    // chunky cable-knit rim
    const rim = [];
    for (let i = 0; i <= 64; i++) { const t = (i / 64) * TAU; rim.push([cx + Math.cos(t) * (rx + 0.04), 0.07, cz + Math.sin(t) * (rz + 0.04)]); }
    P([tube(rim, 0.075, C.snow, KNIT, 128, 6, false)], [cx, 0, cz], { cast: false, delay: 0.35 });
    // pebbles + reeds
    const pg = [];
    const pcol = [C.pebble, C.pebbleDark, C.stone, '#a9a39b'];
    for (let i = 0; i < 64; i++) {
      const t = rnd() * TAU, f = 1.05 + rnd() * 0.1;
      const x = cx + Math.cos(t) * rx * f, z = cz + Math.sin(t) * rz * f;
      if (distProm(x, z) < 0.45 || (Math.abs(z - LK.pier.z) < 0.5 && x < cx)) continue;
      const r = 0.06 + rnd() * 0.07;
      pg.push(xf(sphLo(r, pcol[i % 4]), [x, 0.04, z], [0, rnd() * 3, 0], [1, 0.55, 0.8 + rnd() * 0.4]));
    }
    P(pg, [cx, 0, cz], { cast: false, delay: 0.5 });
    for (let k = 0; k < 9; k++) {
      const t = -1.2 + k * 0.45 + rnd() * 0.2;
      const x = cx + Math.cos(t) * rx * 1.09, z = cz + Math.sin(t) * rz * 1.09;
      if (distProm(x, z) < 0.5) continue;
      const rg = [];
      for (let j = 0; j < 6; j++) {
        const ox = (rnd() - 0.5) * 0.25, oz = (rnd() - 0.5) * 0.25, h = 0.28 + rnd() * 0.25;
        rg.push(xf(cone(0.018, h, 5, j % 2 ? C.olive : '#8a8a4a', FELT), [x + ox, 0.04 + h / 2, z + oz], [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3]));
        if (j % 2 === 0) rg.push(xf(cyl(0.022, 0.022, 0.08, 5, C.woodDark, FELT), [x + ox, 0.04 + h + 0.02, z + oz]));
      }
      P(rg, [x, 0.04, z], { cast: false });
    }
  }

  // ---------------------------------------------------------------- pier
  const pierRect = [9.5, LK.pier.z - 0.31, 12.3, LK.pier.z + 0.31];
  {
    const g = [], [x0, z0, x1, z1] = pierRect, zc = (z0 + z1) / 2;
    for (let x = x0 + 0.06; x < x1; x += 0.13) g.push(xf(box(0.11, 0.035, 0.62, (Math.round(x * 7.7) % 2) ? C.wood : '#86593b'), [x, 0.135, zc]));
    for (const z of [z0 + 0.03, z1 - 0.03]) g.push(xf(box(x1 - x0, 0.05, 0.05, C.woodDark), [(x0 + x1) / 2, 0.1, z]));
    for (let x = x0 + 0.3; x < x1; x += 0.65) for (const z of [z0 + 0.03, z1 - 0.03]) {
      g.push(xf(cyl(0.035, 0.035, 0.35, 6, C.woodDark), [x, 0.05, z]));
      g.push(xf(cyl(0.035, 0.035, 0.25, 6, C.woodDark), [x, 0.27, z]));
      g.push(xf(bead(0.04, C.snow), [x, 0.4, z], null, [1.2, 0.6, 1.2]));
    }
    for (const z of [z0 + 0.03, z1 - 0.03]) g.push(tube([[x0 + 0.3, 0.36, z], [(x0 + x1) / 2, 0.32, z], [x1 - 0.1, 0.36, z]], 0.014, C.cream, KNIT, 12, 4));
    g.push(xf(rbox(x1 - x0 - 0.1, 0.03, 0.2, 0.012, C.snow, FELT, 1), [(x0 + x1) / 2 + 0.05, 0.16, z0 + 0.12]));
    const b = P(g, [(x0 + x1) / 2, 0, zc], { delay: 0.6 });
    b.add(put('lamp', () => lampGeos(), x1 - 0.12, 0.15, z1 - 0.05, 0, 0.75));
    colliders.addSegment(x0 + 0.3, z0 - 0.02, x1, z0 - 0.02, 0.03, 'pier');
    colliders.addSegment(x0 + 0.3, z1 + 0.02, x1, z1 + 0.02, 0.03, 'pier');
    colliders.addSegment(x1 + 0.02, z0, x1 + 0.02, z1, 0.03, 'pier');
  }

  // ---------------------------------------------------------------- promenade path, lamps, benches, garlands
  {
    const g = pathGeos(promenade, 0.7, false, 0.046);
    for (const q of g) { q.computeBoundingBox(); const c = q.boundingBox.getCenter(new THREE.Vector3()); P([q], [c.x, 0.03, c.z], { cast: false }); }
    const lamps = [[9.15, -3.6], [9.2, 2.3], [9.35, 5.2], [11.0, 8.45], [14.5, 8.45], [18.0, 8.45], [20.35, 4.4]];
    for (const [x, z] of lamps) { P([put('lamp', () => lampGeos(), x, 0.03, z)], [x, 0.03, z]); colliders.addCircle(x, z, 0.08, 'lamp'); K.keepCircle(x, z, 0.3); }
    for (let i = 3; i < 6; i++) {
      const [ax, az] = lamps[i], [bx, bz] = lamps[i + 1];
      const gl = garland([ax, 1.28, az], [bx, 1.28, bz], 0.3, { n: 14, cord: C.pine, bulbR: 0.03 });
      P([gl.cord], [(ax + bx) / 2, 0, (az + bz) / 2]).add(gl.bulbs, 'festive4');
    }
    for (const [x, z, ry] of [[12.6, 7.25, Math.PI], [16.4, 7.25, Math.PI], [10.55, -2.4, Math.PI / 2], [19.4, 6.0, -2.3]]) {
      P([put('bench', benchGeos, x, 0.03, z, ry)], [x, 0.03, z]);
      colliders.addSegment(x - Math.cos(ry) * 0.3, z + Math.sin(ry) * 0.3, x + Math.cos(ry) * 0.3, z - Math.sin(ry) * 0.3, 0.12, 'bench');
      K.keepCircle(x, z, 0.5);
    }
  }

  // ---------------------------------------------------------------- Ferris wheel (cream cable-knit, pom-pom cabins)
  buildFerris(K, 18.3, -3.7);

  // ---------------------------------------------------------------- cocoa hut
  {
    const x = 12.8, z = -5.4;
    const th = townhouse({ w: 1.3, d: 1.05, h: 1.2, wall: C.wood, trim: C.cream, door: C.red, seed: 9 });
    const b = P(th.g.map((q) => xf(q, [x, 0.03, z])), [x, 0, z]);
    b.add(th.lights.map((q) => xf(q, [x, 0.03, z]))).add(th.wreath.map((q) => xf(q, [x, 0.03, z])));
    // striped awning over the front
    const aw = box(1.2, 0.03, 0.4, C.red);
    b.add(xf(aw, [x, 0.95, z + 0.72], [0.35, 0, 0]));
    b.add(xf(rbox(1.1, 0.05, 0.35, 0.02, C.snow, FELT, 1), [x, 0.99, z + 0.72], [0.35, 0, 0]));
    colliders.addRect(x - 0.7, z - 0.56, x + 0.7, z + 0.56, 'hut');
    K.keepCircle(x, z, 1.3);
  }

  // ---------------------------------------------------------------- trees around
  forest(K, [9.0, -7.4, 20.8, 9.4], 18, { minS: 0.9, maxS: 1.9 });
  forest(K, [9.2, -16.8, 20.8, -7.7], 12, { minS: 1.1, maxS: 2.3, pines: 0.8 });
  return { isIce, pierRect };
}

const sphLo = (r, c) => part(new THREE.SphereGeometry(r, 5, 4), c, FELT);

function buildFerris(K, x, z) {
  const { engine, colliders } = K;
  const R = 1.45, HUB = R + 0.42;
  const stand = [];
  stand.push(xf(rbox(2.1, 0.12, 1.0, 0.04, C.cream, KNIT, 1), [0, 0.09, 0]));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const pts = [[sx * 0.85, 0.14, sz * 0.38], [0, HUB, sz * 0.14]];
    stand.push(tube(pts, 0.05, '#e9dcc3', KNIT, 6, 6));
  }
  stand.push(xf(cyl(0.05, 0.05, 0.4, 8, '#e9dcc3'), [0, HUB, 0], [Math.PI / 2, 0, 0]));
  // little ticket booth
  stand.push(xf(box(0.36, 0.42, 0.3, C.red), [1.25, 0.21, 0.25]));
  stand.push(xf(box(0.22, 0.14, 0.02, C.warm, GLOW), [1.25, 0.3, 0.405]));
  stand.push(xf(cone(0.3, 0.2, 4, C.cream), [1.25, 0.52, 0.25], [0, Math.PI / 4, 0]));
  K.prop('lakeside', [x, 0, z], stand.map((q) => xf(q, [x, 0.03, z])));
  colliders.addRect(x - 1.05, z - 0.5, x + 1.45, z + 0.5, 'ferris');
  K.keepCircle(x, z, 1.9);

  const g = [];
  g.push(torus(R, 0.055, '#efe3cc', KNIT, TAU, 56));
  g.push(torus(R - 0.14, 0.028, '#efe3cc', KNIT, TAU, 48));
  const NS = 14;
  for (let k = 0; k < NS; k++) {
    const a = (k / NS) * TAU;
    g.push(xf(cyl(0.014, 0.014, R, 4, '#e9dcc3'), [Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0.05], [0, 0, a - Math.PI / 2]));
    g.push(xf(cyl(0.014, 0.014, R, 4, '#e9dcc3'), [Math.cos(a) * R / 2, Math.sin(a) * R / 2, -0.05], [0, 0, a - Math.PI / 2]));
  }
  g.push(xf(ball(0.13, '#efe3cc', KNIT), [0, 0, 0], null, [1, 1, 1.4]));
  for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU; g.push(xf(bead(0.025, k % 2 ? C.warm : '#ffe4a8', GLOW), [Math.cos(a) * (R - 0.07), Math.sin(a) * (R - 0.07), 0.06])); }
  const wheel = new THREE.Mesh(merge(g), engine.mat);
  wheel.castShadow = true;
  wheel.position.set(0, HUB + 0.03, 0);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.add(wheel);
  const NC = 12;
  const cabGeo = merge([
    xf(ball(0.15, '#ffffff', KNIT, 10, 7), [0, -0.2, 0]),
    xf(box(0.16, 0.06, 0.31, '#ffe0a0', GLOW), [0, -0.2, 0]),
    xf(cyl(0.012, 0.012, 0.08, 4, C.lampPost), [0, -0.05, 0]),
  ]);
  const cabs = new THREE.InstancedMesh(cabGeo, engine.mat, NC);
  const tints = ['#c23a33', '#f2e9da', '#4f9590', '#e3aa3a'].map((c) => new THREE.Color(c));
  for (let k = 0; k < NC; k++) cabs.setColorAt(k, tints[k % 4]);
  cabs.castShadow = true;
  root.add(cabs);
  K.G.lakeside.group.root.add(root);
  K.G.lakeside.group.node(root, [x, 0, z], { delay: 0.55, dur: 0.7 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  K.updates.push((dt, t) => {
    if (!root.visible) return;
    const rot = t * 0.18;
    wheel.rotation.z = rot;
    for (let k = 0; k < NC; k++) {
      const a = rot + (k / NC) * TAU;
      v.set(Math.cos(a) * (R + 0.02), HUB + 0.03 + Math.sin(a) * (R + 0.02), 0);
      m4.compose(v, q, s);
      cabs.setMatrixAt(k, m4);
    }
    cabs.instanceMatrix.needsUpdate = true;
  });
}
