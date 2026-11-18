// Cable car: base + top stations, pylons, two cables, two red cabins with snowy roofs. ride(dir) carries the player.
import * as THREE from 'three';
import { C, xf, box, rbox, cyl, cone, ball, bead, torus, tube, merge, extrude, poly, bulbLine, KNIT, FELT, GLOW, GLOSS } from './kit.js';

const GRIP = 1.19; // cable height above the station floor level
const FLOOR = 0.92; // cabin floor below the grip

export function buildCableCar(K) {
  const { layout: L, colliders, engine, game } = K;
  const HL = L.HILL;
  const H = (x, z) => HL.heightAt(x, z) + 0.03;
  const bx = HL.cableBase.x, bz = HL.cableBase.z, tx = HL.cableTop.x, tz = HL.cableTop.z;
  const gb = H(bx, bz), gt = H(tx, tz);
  const OFF = 0.33;
  const lineX = [bx - OFF, bx + OFF];

  // ---------------------------------------------------------------- support profile (z → y) with pylons that clear the slope
  const sup = [{ z: bz, y: gb + 0.25 + GRIP }];
  for (const u of [0.42, 0.74]) {
    const z = bz + (tz - bz) * u;
    sup.push({ z, y: H(bx, z) + 1.55, pylon: true });
  }
  sup.push({ z: tz, y: gt + 0.25 + GRIP });
  // raise pylons until every span keeps the cabin floor ≥ 0.3 above the snow
  for (let it = 0; it < 40; it++) {
    let ok = true;
    for (let s = 0; s < sup.length - 1; s++) {
      const a = sup[s], b = sup[s + 1];
      for (let k = 1; k < 10; k++) {
        const f = k / 10, z = a.z + (b.z - a.z) * f, y = a.y + (b.y - a.y) * f - spanSag(f);
        if (y - FLOOR - 0.3 < H(bx, z)) { ok = false; if (a.pylon) a.y += 0.05; if (b.pylon) b.y += 0.05; }
      }
    }
    if (ok) break;
  }
  const spanLen = [];
  let totalLen = 0;
  for (let s = 0; s < sup.length - 1; s++) { const l = Math.hypot(sup[s + 1].z - sup[s].z, sup[s + 1].y - sup[s].y); spanLen.push(l); totalLen += l; }
  /** Cable point at u (0 base → 1 top) on line i. */
  function at(i, u, out) {
    let d = u * totalLen, s = 0;
    while (s < spanLen.length - 1 && d > spanLen[s]) { d -= spanLen[s]; s++; }
    const f = Math.min(1, d / spanLen[s]), a = sup[s], b = sup[s + 1];
    return out.set(lineX[i], a.y + (b.y - a.y) * f - spanSag(f), a.z + (b.z - a.z) * f);
  }

  // ---------------------------------------------------------------- static: stations, pylons, cables
  const tmp = new THREE.Vector3();
  station(K, bx, gb, bz, 0, 'base');
  station(K, tx, gt, tz, Math.PI, 'top');
  for (const s of sup.filter((q) => q.pylon)) {
    const g = [], y0 = H(bx, s.z), hh = s.y - y0;
    g.push(xf(rbox(0.36, 0.14, 0.36, 0.04, C.stone, KNIT, 1), [bx, y0 + 0.05, s.z]));
    g.push(xf(cyl(0.06, 0.1, hh, 8, C.red), [bx, y0 + hh / 2, s.z]));
    for (let k = 1; k < 4; k++) g.push(xf(torus(0.085 - k * 0.008, 0.018, C.cream, KNIT, Math.PI * 2, 10), [bx, y0 + (hh * k) / 4, s.z], [Math.PI / 2, 0, 0]));
    g.push(xf(box(OFF * 2 + 0.3, 0.07, 0.12, C.red), [bx, s.y + 0.04, s.z]));
    for (const lx of lineX) g.push(xf(torus(0.05, 0.015, C.lampPost, KNIT, Math.PI * 2, 10), [lx, s.y + 0.02, s.z], [0, Math.PI / 2, 0]));
    g.push(xf(ball(0.09, C.snow, FELT, 8, 5), [bx, s.y + 0.1, s.z], null, [3, 0.5, 1.2]));
    const p = K.prop('hill', [bx, y0, s.z], g);
    p.add(bulbLine([bx - OFF - 0.12, s.y - 0.0, s.z + 0.07], [bx + OFF + 0.12, s.y - 0.0, s.z + 0.07], 6, 0.022), 'festive4');
    colliders.addCircle(bx, s.z, 0.14, 'pylon');
  }
  for (let i = 0; i < 2; i++) {
    const pts = [];
    for (let k = 0; k <= 60; k++) { at(i, k / 60, tmp); pts.push([tmp.x, tmp.y + 0.02, tmp.z]); }
    K.prop('hill', [lineX[i], gb, bz], [tube(pts, 0.013, '#3b3633', GLOSS, 64, 4)], { delay: 0.9 });
  }

  // ---------------------------------------------------------------- cabins
  const cabGeo = cabinGeo();
  const cabins = [0, 1].map((i) => {
    const m = new THREE.Mesh(cabGeo, engine.mat);
    m.castShadow = true;
    const grp = new THREE.Group();
    grp.add(m);
    grp.userData.u = i === 0 ? 0 : 1;
    at(i, grp.userData.u, grp.position);
    K.G.hill.group.root.add(grp);
    K.G.hill.group.node(grp, [grp.position.x, grp.position.y, grp.position.z], { delay: 1.0, dur: 0.5 });
    return grp;
  });
  const exits = { up: { x: tx - 1.1, z: tz + 0.55, heading: Math.PI }, down: { x: bx - 1.05, z: bz + 0.7, heading: 0 } };

  let ride = null;
  const player = K.ctx.player;
  const DUR = 7.5;
  K.updates.push((dt) => {
    if (!ride) return;
    ride.t += dt;
    const l = Math.min(1, ride.t / DUR);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * l);
    const u = ride.dir === 'up' ? e : 1 - e;
    at(ride.ci, u, ride.cab.position);
    at(1 - ride.ci, 1 - u, ride.other.position);
    // gentle swing
    ride.cab.rotation.x = Math.sin(ride.t * 2.1) * 0.035 * Math.sin(Math.PI * l);
    ride.other.rotation.x = -ride.cab.rotation.x;
    player.pos.set(ride.cab.position.x, ride.cab.position.y - FLOOR + 0.02, ride.cab.position.z);
    player.vel.set(0, 0);
    player.object.position.copy(player.pos);
    if (l >= 1) {
      const r = ride; ride = null;
      r.cab.userData.u = r.dir === 'up' ? 1 : 0;
      r.other.userData.u = 1 - r.cab.userData.u;
      r.cab.rotation.x = r.other.rotation.x = 0;
      const ex = exits[r.dir];
      player.teleport(ex.x, ex.z, ex.heading);
      player.object.position.copy(player.pos);
      player.controllable = r.wasControllable || game.state.phase === 'play';
      game.emit('cablecar:arrive', { dir: r.dir });
      r.resolve();
    }
  });

  return {
    base: new THREE.Vector3(bx, gb, bz),
    top: new THREE.Vector3(tx, HL.topY, tz),
    cabins,
    get riding() { return !!ride; },
    ride(dir = 'up') {
      if (ride) return ride.promise;
      const startU = dir === 'up' ? 0 : 1;
      const ci = Math.abs(cabins[0].userData.u - startU) < 0.5 ? 0 : 1;
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      ride = { dir, t: 0, ci, cab: cabins[ci], other: cabins[1 - ci], resolve, promise, wasControllable: player.controllable };
      player.controllable = false;
      player.heading = dir === 'up' ? Math.PI : 0;
      at(ci, startU, ride.cab.position);
      player.pos.set(ride.cab.position.x, ride.cab.position.y - FLOOR + 0.02, ride.cab.position.z);
      player.object.position.copy(player.pos);
      game.emit('cablecar:ride', { dir, duration: DUR, cabin: ride.cab });
      return promise;
    },
  };
}

function spanSag(f) { return 0.06 * 4 * f * (1 - f); }

function cabinGeo() {
  const g = [];
  const w = 0.62, d = 0.56, y0 = -FLOOR;
  g.push(xf(rbox(w, 0.06, d, 0.025, C.deepRed, KNIT, 1), [0, y0 + 0.03, 0]));
  g.push(xf(rbox(w, 0.26, d, 0.04, C.red, KNIT, 1), [0, y0 + 0.17, 0]));
  g.push(xf(box(w + 0.01, 0.03, d + 0.01, C.cream), [0, y0 + 0.29, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.push(xf(box(0.04, 0.32, 0.04, C.red), [sx * (w / 2 - 0.02), y0 + 0.46, sz * (d / 2 - 0.02)]));
  // window rail
  for (const sz of [-1, 1]) g.push(xf(box(w - 0.04, 0.02, 0.02, '#d9d4cc', GLOSS), [0, y0 + 0.4, sz * (d / 2 - 0.02)]));
  // roof (red rim + white snowy cap)
  g.push(xf(rbox(w + 0.04, 0.06, d + 0.04, 0.025, C.red, KNIT, 1), [0, y0 + 0.64, 0]));
  g.push(xf(rbox(w - 0.02, 0.07, d - 0.04, 0.035, C.snow, FELT, 1), [0, y0 + 0.69, 0]));
  g.push(xf(ball(0.1, C.snow, FELT, 8, 5), [0.12, y0 + 0.73, 0.05], null, [1.6, 0.5, 1.4]));
  // warm bulbs under the roof rim
  for (let k = 0; k < 6; k++) for (const sz of [-1, 1]) g.push(xf(bead(0.016, C.warm, GLOW), [-w / 2 + 0.06 + k * ((w - 0.12) / 5), y0 + 0.6, sz * (d / 2 + 0.01)]));
  // hanger arm (curved) + grip on the cable
  g.push(tube([[0, y0 + 0.72, 0], [0.05, y0 + 0.82, 0], [0.12, -0.32, 0], [0.06, -0.12, 0], [0, -0.03, 0]], 0.022, '#6e7175', GLOSS, 16, 5));
  g.push(xf(box(0.06, 0.06, 0.16, '#6e7175', GLOSS), [0, 0, 0]));
  g.push(xf(cyl(0.035, 0.035, 0.03, 8, '#4e5054'), [0, 0.02, 0.06], [0, 0, Math.PI / 2]));
  g.push(xf(cyl(0.035, 0.035, 0.03, 8, '#4e5054'), [0, 0.02, -0.06], [0, 0, Math.PI / 2]));
  g.push(xf(bead(0.03, C.snow), [0, 0.06, 0], null, [1, 0.6, 2]));
  // little wreath on the front
  g.push(xf(torus(0.06, 0.02, C.pine, KNIT, Math.PI * 2, 10), [0, y0 + 0.17, -d / 2 - 0.02]));
  g.push(xf(bead(0.025, C.red), [0, y0 + 0.11, -d / 2 - 0.035]));
  return merge(g);
}

function station(K, x, y, z, ry, kind) {
  const g = [], lights = [];
  const W = 1.5, D = 1.3;
  g.push(xf(rbox(W, 0.25, D, 0.05, C.stone, KNIT, 1), [0, 0.125, 0]));
  g.push(xf(box(W - 0.1, 0.02, D - 0.1, C.wood), [0, 0.26, 0]));
  // back wall (away from the cable) with a glowing window, side walls half height
  g.push(xf(box(W, 1.2, 0.08, C.cream), [0, 0.85, D / 2 - 0.04]));
  g.push(xf(box(0.42, 0.3, 0.02, '#ffc070', GLOW), [0.35, 0.95, D / 2 + 0.005]));
  g.push(xf(box(0.48, 0.04, 0.05, C.red), [0.35, 0.78, D / 2 + 0.01]));
  for (const sx of [-1, 1]) {
    g.push(xf(box(0.08, 0.5, D, C.red), [sx * (W / 2 - 0.04), 0.5, 0]));
    g.push(xf(box(0.1, 1.2, 0.1, C.red), [sx * (W / 2 - 0.05), 0.85, -D / 2 + 0.05]));
  }
  // bullwheel (horizontal) under the roof
  g.push(xf(torus(0.33, 0.035, C.lampPost, KNIT, Math.PI * 2, 20), [0, GRIP + 0.25, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(cyl(0.05, 0.05, 0.12, 8, C.lampPost), [0, GRIP + 0.3, 0]));
  // gable roof with snow
  const rh = 0.42;
  g.push(xf(extrude(poly([[-W / 2 - 0.1, 0], [W / 2 + 0.1, 0], [0, rh]]), D + 0.2, C.red), [0, 1.45, -D / 2 - 0.1]));
  const ang = Math.atan2(rh, W / 2 + 0.1), Ls = Math.hypot(W / 2 + 0.1, rh) + 0.1;
  for (const s of [-1, 1]) g.push(xf(rbox(Ls, 0.1, D + 0.3, 0.04, C.snow, KNIT, 1), [s * (W / 4 + 0.03), 1.45 + rh / 2 + 0.06, 0], [0, 0, -s * ang]));
  // sign
  g.push(xf(rbox(0.7, 0.2, 0.04, 0.02, C.cream, FELT, 1), [0, 1.5, -D / 2 - 0.14]));
  g.push(xf(bead(0.06, C.red), [-0.22, 1.5, -D / 2 - 0.16], null, [1, 1, 0.4]));
  g.push(xf(bead(0.06, C.pine), [0.22, 1.5, -D / 2 - 0.16], null, [1, 1, 0.4]));
  for (const s of [-1, 1]) lights.push(...bulbLine([s * (W / 2 + 0.12), 1.42, -D / 2 - 0.12], [0, 1.45 + rh - 0.02, -D / 2 - 0.12], 7, 0.026));
  lights.push(...bulbLine([-W / 2, 1.38, -D / 2 - 0.1], [W / 2, 1.38, -D / 2 - 0.1], 10, 0.022));
  const toW = (q) => xf(q, [x, y, z], [0, ry, 0]);
  const p = K.prop('hill', [x, y, z], g.map(toW), { delay: kind === 'base' ? 0.5 : 0.9 });
  p.add(lights.map(toW));
  // colliders: the back + side walls (open towards the cable)
  const c = Math.cos(ry), s = Math.sin(ry);
  const W2 = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const segs = [[[-W / 2, D / 2], [W / 2, D / 2]], [[-W / 2, -D / 2], [-W / 2, D / 2]], [[W / 2, -D / 2], [W / 2, D / 2]]];
  for (const [a, bb] of segs) { const A = W2(...a), B = W2(...bb); K.colliders.addSegment(A[0], A[1], B[0], B[1], 0.05, 'station'); }
  K.keepCircle(x, z, 1.2);
}
