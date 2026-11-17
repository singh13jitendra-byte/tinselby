// Holly Lane: two rows of tall narrow knitted townhouses, string lights (task houses switch on), smoking chimneys.
import * as THREE from 'three';
import {
  C, xf, box, rbox, cyl, cone, ball, bead, torus, extrude, poly, part, faceColor, garland, bulbLine, lampGeos,
  giftGeos, wreathGeos, wreathLights, snowmanGeos, pineGeos, pomTreeGeos, shrubGeos, fenceGeos, snowLump, put,
  KNIT, FELT, GLOW, GLOSS, mulberry32,
} from './kit.js';

const TAU = Math.PI * 2;
const WALLS = [C.red, C.teal, C.cream, C.mustard, C.red, C.teal, C.cream, C.mustard, '#b6584a', C.sage, C.teal, C.red];
const TRIMS = [C.cream, C.cream, C.teal, C.cream, C.cream, C.cream, C.red, C.cream, C.cream, C.cream, C.cream, C.cream];
const HEIGHTS = [2.3, 2.75, 2.1, 2.55, 2.9, 2.25];

/** Townhouse in local space (front faces +z). Returns {g, lights(roofline bulbs), wreath(door wreath bulbs), chimney:[x,y,z]} */
export function townhouse({ w = 1.5, d = 1.3, h = 2.4, wall = C.red, trim = C.cream, door = C.pine, seed = 1 }) {
  const rnd = mulberry32(seed);
  const g = [], lights = [], wreath = [];
  const rh = 0.56 * w;
  g.push(xf(box(w + 0.06, 0.12, d + 0.06, C.stone), [0, 0.06, 0]));
  g.push(xf(box(w, h, d, wall), [0, h / 2, 0]));
  g.push(xf(box(w + 0.03, 0.05, d + 0.03, trim), [0, h * 0.5, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.push(xf(box(0.06, h, 0.06, trim), [sx * (w / 2 - 0.01), h / 2, sz * (d / 2 - 0.01)]));
  g.push(xf(extrude(poly([[-w / 2, 0], [w / 2, 0], [0, rh]]), d, wall), [0, h, -d / 2]));
  // knitted snow roof
  const ang = Math.atan2(rh, w / 2), L = Math.hypot(w / 2, rh) + 0.16;
  for (const s of [-1, 1]) {
    const mx = (s * w) / 4, my = h + rh / 2;
    const ux = s * Math.cos(ang), uy = -Math.sin(ang), nx = s * Math.sin(ang), ny = Math.cos(ang);
    g.push(xf(rbox(L, 0.13, d + 0.24, 0.05, C.snow, KNIT, 1), [mx + ux * 0.08 + nx * 0.065, my + uy * 0.08 + ny * 0.065, 0], [0, 0, -s * ang]));
    // fascia trims on both gables
    for (const sz of [-1, 1]) g.push(xf(box(L - 0.1, 0.06, 0.04, trim), [mx + ux * 0.04 - nx * 0.01, my + uy * 0.04 - ny * 0.01, sz * (d / 2 + 0.03)], [0, 0, -s * ang]));
    // snow drips along the eaves
    const ex = s * (w / 2 + 0.13), ey = h - 0.1;
    for (let k = 0; k < 3; k++) g.push(xf(bead(0.05, C.snow), [ex, ey + 0.02, -d / 2 + 0.2 + k * ((d - 0.4) / 2)], null, [0.8, 1.2, 1.6]));
    // roofline bulbs: under both gable edges + along the eave
    for (const sz of [-1, 1]) lights.push(...bulbLine([s * (w / 2 + 0.06), h - 0.03, sz * (d / 2 + 0.1)], [s * 0.06, h + rh - 0.06, sz * (d / 2 + 0.1)], 7, 0.03));
    lights.push(...bulbLine([ex - s * 0.02, ey - 0.06, -d / 2 + 0.05], [ex - s * 0.02, ey - 0.06, d / 2 - 0.05], 7, 0.028));
  }
  g.push(xf(cyl(0.085, 0.085, d + 0.26, 8, C.snow, KNIT), [0, h + rh + 0.08, 0], [Math.PI / 2, 0, 0]));
  // chimney
  const cx = (rnd() < 0.5 ? -1 : 1) * w * 0.24, cz = -d * 0.15;
  const cy0 = h + rh * (1 - Math.abs(cx) / (w / 2));
  g.push(xf(box(0.22, 0.55, 0.22, C.brick), [cx, cy0 + 0.17, cz]));
  g.push(xf(box(0.27, 0.06, 0.27, C.stone), [cx, cy0 + 0.47, cz]));
  g.push(xf(rbox(0.25, 0.08, 0.25, 0.035, C.snow, FELT, 1), [cx, cy0 + 0.53, cz]));
  // windows (front + back)
  const win = (x, y, ww, wh, sz, candle = false) => {
    const z = sz * (d / 2 + 0.012);
    g.push(xf(box(ww, wh, 0.02, '#ffc070', GLOW), [x, y, z]));
    g.push(xf(box(ww + 0.09, 0.05, 0.05, trim), [x, y + wh / 2 + 0.02, z]));
    g.push(xf(box(ww + 0.12, 0.04, 0.08, trim), [x, y - wh / 2 - 0.02, z + sz * 0.015]));
    g.push(xf(box(ww + 0.1, 0.035, 0.07, C.snow, FELT), [x, y - wh / 2 + 0.015, z + sz * 0.03]));
    for (const sx of [-1, 1]) g.push(xf(box(0.045, wh + 0.06, 0.05, trim), [x + (sx * (ww + 0.045)) / 2, y, z]));
    g.push(xf(box(0.025, wh, 0.03, trim), [x, y, z + sz * 0.005]));
    g.push(xf(box(ww, 0.025, 0.03, trim), [x, y + wh * 0.12, z + sz * 0.005]));
    if (candle) {
      g.push(xf(cyl(0.018, 0.018, 0.08, 6, C.cream, FELT), [x - ww * 0.25, y - wh / 2 + 0.07, z + sz * 0.04]));
      g.push(xf(bead(0.018, '#ffe6a0', GLOW), [x - ww * 0.25, y - wh / 2 + 0.13, z + sz * 0.04], null, [1, 1.5, 1]));
    }
  };
  const upY = h * 0.5 + (h * 0.5) / 2 + 0.02;
  const nUp = 2;
  for (const sz of [1, -1]) {
    for (let k = 0; k < nUp; k++) win((k - 0.5) * 0.62, upY, 0.32, Math.min(0.5, h * 0.2), sz);
    // gable wreath
    g.push(...wreathGeos(0.13).map((q) => xf(q, [0, h + rh * 0.36, sz * (d / 2 + 0.02)], [0, sz > 0 ? 0 : Math.PI, 0])));
  }
  // ground floor: front = window + door, back = two windows
  const doorX = 0.3;
  win(-0.32, h * 0.25 + 0.06, 0.4, Math.min(0.5, h * 0.2), 1, true);
  win(-0.32, h * 0.25 + 0.06, 0.34, 0.42, -1, true);
  win(0.32, h * 0.25 + 0.06, 0.34, 0.42, -1);
  // door with arch, wreath, step, lantern
  const dz = d / 2 + 0.015;
  g.push(xf(box(0.36, 0.56, 0.03, door), [doorX, 0.4, dz]));
  g.push(xf(cyl(0.18, 0.18, 0.03, 10, door), [doorX, 0.68, dz], [Math.PI / 2, 0, 0]));
  g.push(xf(box(0.44, 0.05, 0.05, trim), [doorX, 0.12 + 0.01, dz + 0.01]));
  for (const sx of [-1, 1]) g.push(xf(box(0.045, 0.62, 0.05, trim), [doorX + sx * 0.2, 0.43, dz]));
  g.push(xf(torus(0.2, 0.025, trim, KNIT, Math.PI, 10), [doorX, 0.68, dz]));
  g.push(xf(bead(0.022, C.gold, GLOSS), [doorX + 0.11, 0.4, dz + 0.03]));
  g.push(xf(box(0.5, 0.06, 0.2, C.stone), [doorX, 0.03, dz + 0.1]));
  g.push(...wreathGeos(0.1).map((q) => xf(q, [doorX, 0.55, dz + 0.035])));
  wreath.push(...wreathLights(0.1).map((q) => xf(q, [doorX, 0.55, dz + 0.035])));
  // window box with red berries
  g.push(xf(box(0.44, 0.08, 0.1, C.wood), [-0.32, h * 0.25 - 0.2, d / 2 + 0.06]));
  for (let k = 0; k < 5; k++) g.push(xf(bead(0.035, k % 2 ? C.pine : C.red), [-0.5 + k * 0.09, h * 0.25 - 0.14, d / 2 + 0.07]));
  // gifts stacked by the door
  g.push(...giftGeos(0.12, 0.1, C.red, C.gold).map((q) => xf(q, [doorX + 0.36, 0.0, d / 2 + 0.12], [0, 0.4, 0])));
  g.push(...giftGeos(0.09, 0.08, C.gold, C.red).map((q) => xf(q, [doorX + 0.38, 0.1, d / 2 + 0.12], [0, 1.1, 0])));
  return { g, lights, wreath, chimney: [cx, cy0 + 0.6, cz] };
}

export function buildResidential(K) {
  const { layout: L, colliders, engine } = K;
  const R = L.RESIDENTIAL;
  const rnd = mulberry32(77);
  const houses = [];
  const chimneys = [];
  const taskKey = (x, z) => R.taskHouses.findIndex((t) => Math.abs(t.x - x) < 0.01 && Math.abs(t.z - z) < 0.01);
  const all = [];
  let n = 0;
  for (const rowZ of [R.rowNorthZ, R.rowSouthZ]) {
    R.houseXs.forEach((x, i) => {
      all.push({ x, z: rowZ, i: n++, col: i + (rowZ > 0 ? 3 : 0) });
    });
  }
  const order = [...all].sort((a, b) => {
    const ta = taskKey(a.x, a.z), tb = taskKey(b.x, b.z);
    return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb) || a.i - b.i;
  });
  for (const hd of order) {
    const ti = taskKey(hd.x, hd.z);
    const ry = hd.z < 0 ? 0 : Math.PI;
    const w = 1.5, d = 1.3;
    const h = HEIGHTS[(hd.col + (hd.z > 0 ? 2 : 0)) % HEIGHTS.length];
    const k = hd.i;
    const th = townhouse({ w, d, h, wall: WALLS[k % WALLS.length], trim: TRIMS[k % TRIMS.length], door: [C.pine, C.deepRed, C.teal, C.woodDark][k % 4], seed: k + 3 });
    const toW = (q) => xf(q, [hd.x, 0, hd.z], [0, ry, 0]);
    const b = K.prop('residential', [hd.x, 0, hd.z], th.g.map(toW));
    const name = 'house' + k;
    b.add(th.lights.map(toW), name);
    b.add(th.wreath.map(toW), name);
    colliders.addRect(hd.x - w / 2 - 0.04, hd.z - d / 2 - 0.04, hd.x + w / 2 + 0.04, hd.z + d / 2 + 0.04, 'house');
    K.keepCircle(hd.x, hd.z, 1.05);
    const sz = hd.z < 0 ? 1 : -1;
    const cw = new THREE.Vector3(th.chimney[0], th.chimney[1], th.chimney[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(hd.x, 0, hd.z));
    chimneys.push(cw);
    const door = ti >= 0 ? R.taskHouses[ti].door : [hd.x + 0.3 * (sz > 0 ? 1 : -1), hd.z + sz * 0.85];
    const house = {
      x: hd.x, z: hd.z, door: [door[0], door[1]], taskHouse: ti >= 0, lit: ti < 0,
      setLights(on) { house.lit = !!on; K.lights.set(name, on ? 1 : 0); },
    };
    houses.push(house);
  }
  // initial: task houses dark, others lit (after finalize — deferred)


  // ---------------------------------------------------------------- street garlands (festive 1), lamps
  for (const x of [-10.9, -14.5, -18.1]) {
    const gl = garland([x, 1.9, -1.98], [x, 1.9, 1.98], 0.32, { n: 14, cord: C.pine, cordR: 0.018, bulbR: 0.03 });
    const b = K.prop('residential', [x, 0, 0], [gl.cord]);
    b.add(gl.bulbs, 'festive1');
    // little star ornament in the middle
    b.add(xf(extrude(poly(starPts(0.12, 0.05)), 0.03, C.gold, KNIT), [x, 1.42, -0.015], [0, Math.PI / 2, 0]));
  }
  for (const x of [-9.4, -12.7, -16.3, -19.9]) for (const z of [-0.9, 0.9]) {
    const xx = x + (z > 0 ? 0.6 : 0);
    K.prop('residential', [xx, 0.065, z], [put('lamp', () => lampGeos(), xx, 0.065, z)]);
    colliders.addCircle(xx, z, 0.08, 'lamp');
  }
  // lit fir trees at the end of the street
  for (const z of [-2.75, 2.75]) {
    const x = -20.4;
    const s = z < 0 ? 1.9 : 1.45;
    const b = K.prop('residential', [x, 0, z], [put('pineA', () => pineGeos(), x, 0, z, 0, s)]);
    const lg = [];
    for (let i = 0; i < 34; i++) { const t = i / 34, y = 0.15 + t * 0.78, a = t * TAU * 4.5; const r = (0.42 - t * 0.32) * 1.02; lg.push(xf(bead(0.032 / s, C.bulbs[i % 4] , GLOW), [Math.cos(a) * r, y, Math.sin(a) * r])); }
    lg.push(xf(extrude(poly(starPts(0.08, 0.035)), 0.02, '#ffd27a', GLOW), [0, 1.06, 0]));
    b.add(lg.map((q) => xf(q, [x, 0, z], null, s)));
    colliders.addCircle(x, z, 0.3, 'tree');
    K.keepCircle(x, z, 0.7);
  }
  // snowmen
  for (const [x, z, ry] of [[-20.3, 1.45, 1.2], [-13.0, 4.4, 0.3], [-16.2, -4.3, 0.2], [-9.2, -4.2, -0.4]]) {
    K.prop('residential', [x, 0.03, z], [put('snowman', snowmanGeos, x, 0.03, z, ry)]);
    colliders.addCircle(x, z, 0.16, 'snowman');
    K.keepCircle(x, z, 0.4);
  }
  // back gardens: fences, shrubs, trees
  for (const sz of [-1, 1]) {
    const zf = sz * 3.75;
    for (let i = 0; i < 6; i++) {
      const x = R.houseXs[i];
      if (sz > 0) K.prop('residential', [x, 0, zf], fenceGeos(x - 0.8, zf, x + 0.8, zf, i % 2 ? C.cream : '#e6d7bb'), { cast: false });
      for (const ox of [-0.5, 0.45]) K.prop('residential', [x + ox, 0.03, sz * 3.45], [put('shrub' + (i % 3), () => shrubGeos([C.red, C.rose, C.pine][i % 3]), x + ox, 0.03, sz * 3.45, rnd() * 3, 0.9 + rnd() * 0.4)], { cast: false });
    }
  }
  const crowns = [C.pink, C.sage, C.mint, C.rose, C.cream];
  const rect = [-20.8, -7.4, -8.7, 7.4];
  K.scatter(rect, 16, 0.32, (x, z, i) => {
    if (Math.abs(z) < 4.1) return;
    if (i % 3 === 0) K.prop('residential', [x, 0.03, z], [put('pom' + (i % 5), () => pomTreeGeos(crowns[i % 5]), x, 0.03, z, rnd() * 6, 1.0 + rnd() * 0.5)]);
    else K.prop('residential', [x, 0.03, z], [put('pineB' + (i % 2), () => pineGeos(i % 2 ? C.teal : C.pine, i % 2 ? '#3f7d78' : '#285a3e'), x, 0.03, z, rnd() * 6, 0.9 + rnd() * 0.9)]);
    colliders.addCircle(x, z, 0.15, 'tree');
  });
  K.scatter(rect, 18, 0.25, (x, z) => {
    if (Math.abs(z) < 3.9) return;
    K.prop('residential', [x, 0.03, z], [put('lump', () => snowLump(0.32), x, 0.03, z, rnd() * 3, 0.7 + rnd() * 0.6)], { cast: false });
  });

  // ---------------------------------------------------------------- chimney smoke (instanced felt puffs)
  const PUFFS = 3;
  const smoke = new THREE.InstancedMesh(part(new THREE.SphereGeometry(1, 8, 6), '#ece8e2', FELT), engine.mat, chimneys.length * PUFFS);
  smoke.frustumCulled = false;
  K.G.residential.group.root.add(smoke);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  K.updates.push((dt, t) => {
    const st = K.G.residential.group.state;
    smoke.visible = st === 'shown';
    if (!smoke.visible) return;
    let idx = 0;
    chimneys.forEach((c, ci) => {
      for (let p = 0; p < PUFFS; p++) {
        const u = ((t * 0.22 + p / PUFFS + ci * 0.137) % 1);
        v.set(c.x + Math.sin(u * 5 + ci) * 0.05 + u * 0.25, c.y + u * 0.9, c.z - u * 0.1);
        const r = 0.05 + u * 0.1;
        const fade = Math.sin(Math.PI * Math.min(1, u * 1.15));
        s.setScalar(r * Math.max(0.01, fade));
        m4.compose(v, q, s);
        smoke.setMatrixAt(idx++, m4);
      }
    });
    smoke.instanceMatrix.needsUpdate = true;
  });

  return { houses, setHouseLights(i, on) { houses[i]?.setLights(on); } };
}

function starPts(r, ri) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return pts;
}
