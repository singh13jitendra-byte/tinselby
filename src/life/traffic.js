// Tram + cars: follow their loops, look ahead (≤ 1.2) for the player, pedestrians, other vehicles and
// occupied crossings, slow/stop smoothly, tram pauses at TRAM_STOP with a ding. Vehicles are moving
// obstacles for the player (circle colliders updated every frame).
import { Path, clamp } from './paths.js';
import { buildTramMesh, TRAM_LEN, TRAM_HALF_W } from './tram.js';
import { buildCarMesh, CAR_LEN, CAR_HALF_W } from './cars.js';

const LOOK = 1.2;

export function createTraffic(W) {
  const { layout, engine, ctx } = W;
  const vehicles = [];
  const A = { x: 0, z: 0, dx: 0, dz: 1 }, B = { x: 0, z: 0, dx: 0, dz: 1 }, S = { x: 0, z: 0, dx: 0, dz: 1 };

  function bigCircle(path) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < path.x.length; i++) { x0 = Math.min(x0, path.x[i]); x1 = Math.max(x1, path.x[i]); z0 = Math.min(z0, path.z[i]); z1 = Math.max(z1, path.z[i]); }
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.max(x1 - x0, z1 - z0) / 2 + 1.2 };
  }
  function addVehicle(o) {
    const mesh = o.mesh;
    mesh.visible = false;
    engine.scene.add(mesh);
    const bc = bigCircle(o.path);
    // colliders: index each circle over the whole route (colliders bucket by add-time bounds), then shrink it
    const circles = o.offsets.map((off) => {
      const c = ctx.colliders?.addCircle ? ctx.colliders.addCircle(bc.cx, bc.cz, bc.r, 'vehicle') : { x: 0, z: 0, r: 0, enabled: false };
      c.r = o.r; c.enabled = false;
      return { off, c };
    });
    const v = { ...o, circles, v: 0, x: 0, z: 0, yaw: 0, fx: 0, fz: 1, wait: 0, served: false, blockT: 0, pop: 0, shown: false, blocker: '' };
    vehicles.push(v);
    place(v);
    return v;
  }
  function place(v) {
    const h = v.len * 0.32;
    v.path.at(v.s + h, A); v.path.at(v.s - h, B);
    v.x = (A.x + B.x) / 2; v.z = (A.z + B.z) / 2;
    const dx = A.x - B.x, dz = A.z - B.z, l = Math.hypot(dx, dz) || 1;
    v.fx = dx / l; v.fz = dz / l;
    v.yaw = Math.atan2(v.fx, v.fz);
    for (const ci of v.circles) { ci.c.x = v.x + v.fx * ci.off; ci.c.z = v.z + v.fz * ci.off; }
  }

  // tram
  const tramPath = new Path(layout.TRAM_LOOP, { closed: true, radius: 1.0 });
  const stopS = tramPath.nearestS(layout.TRAM_STOP[0], layout.TRAM_STOP[1]);
  const tram = addVehicle({ kind: 'tram', mesh: buildTramMesh(engine), path: tramPath, s: stopS - 3, len: TRAM_LEN, half: TRAM_HALF_W, vmax: 0.85, offsets: [-0.5, 0, 0.5], r: 0.27, district: 'market', stopS });

  // cars
  const ring = layout.CAR_LANES.find((l) => l.id === 'ringOuter') || layout.CAR_LANES[0];
  const west = layout.CAR_LANES.find((l) => l.id === 'westStreet');
  const ringPath = new Path(ring.pts, { closed: true, radius: 1.2 });
  const carDefs = [['#c8433a', 'tree'], ['#4f9590', 'wreath'], ['#e0b54a', 'gifts'], ['#bfd8c6', '']];
  for (let i = 0; i < 3; i++) {
    addVehicle({ kind: 'car', mesh: buildCarMesh(engine, carDefs[i][0], carDefs[i][1]), path: ringPath, s: (i / 3) * ringPath.length + 2, len: CAR_LEN, half: CAR_HALF_W, vmax: 0.95 + i * 0.08, offsets: [-0.17, 0.17], r: 0.2, district: 'market' });
  }
  if (west) {
    const westPath = new Path(west.pts, { closed: true, radius: 0.36 });
    addVehicle({ kind: 'car', mesh: buildCarMesh(engine, carDefs[3][0], carDefs[3][1]), path: westPath, s: 3, len: CAR_LEN, half: CAR_HALF_W, vmax: 0.8, offsets: [-0.17, 0.17], r: 0.2, district: 'residential' });
  }

  const CROSS = layout.CROSSINGS;
  const people = []; // filled per frame: {x, z}
  function occupied(cx, cz) {
    for (const p of people) if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < 0.85 * 0.85) return true;
    return false;
  }

  function freeAhead(v) {
    let free = 99;
    v.blocker = '';
    const front = v.s + v.len / 2;
    const pl = ctx.player.pos;
    for (let k = 0; k <= 8; k++) {
      const ds = k * (LOOK / 8);
      if (ds >= free) break;
      v.path.at(front + ds, S);
      const lim = v.half + 0.1;
      if ((S.x - pl.x) ** 2 + (S.z - pl.z) ** 2 < lim * lim) { free = ds; v.blocker = 'player'; break; }
      let hit = false;
      for (const p of people) {
        if (p.player) continue;
        if ((S.x - p.x) ** 2 + (S.z - p.z) ** 2 < lim * lim) { hit = true; break; }
      }
      if (hit) { free = ds; v.blocker = 'person'; break; }
      for (const o of vehicles) {
        if (o === v || !o.shown) continue;
        for (const ci of o.circles) {
          const l2 = v.half * 0.6 + ci.c.r;
          if ((S.x - ci.c.x) ** 2 + (S.z - ci.c.z) ** 2 < l2 * l2) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) { free = ds; v.blocker = 'vehicle'; break; }
    }
    // occupied crossings ahead
    for (const c of CROSS) {
      const rx = c[0] - v.x, rz = c[1] - v.z;
      if (rx * rx + rz * rz > 9) continue;
      if (rx * v.fx + rz * v.fz < v.len * 0.3) continue; // already over it
      if (!occupied(c[0], c[1])) continue;
      for (let k = 0; k <= 8; k++) {
        const ds = k * (LOOK / 8);
        if (ds >= free) break;
        v.path.at(front + ds, S);
        if ((S.x - c[0]) ** 2 + (S.z - c[1]) ** 2 < 0.75 * 0.75) { free = Math.max(0, ds - 0.1); v.blocker = v.blocker || 'crossing'; break; }
      }
    }
    return free;
  }

  function update(dt, t, roadPeople) {
    // who's on the street
    people.length = 0;
    const pl = ctx.player.pos;
    people.push({ x: pl.x, z: pl.z, player: true });
    for (const d of roadPeople) if (d.vis) people.push({ x: d.x, z: d.z });
    for (const v of vehicles) {
      const show = W.isRevealed(v.district);
      if (show && !v.shown) { v.shown = true; v.pop = 0; v.mesh.visible = true; }
      if (!show && v.shown) { v.shown = false; v.mesh.visible = false; }
      for (const ci of v.circles) ci.c.enabled = v.shown;
      if (!v.shown) continue;
      v.pop = Math.min(1, v.pop + dt * 2.2);
      // speed target
      let vt = v.vmax;
      const free = freeAhead(v);
      vt = Math.min(vt, v.vmax * clamp((free - 0.2) / 0.9, 0, 1));
      if (v.stopS != null) {
        const L = v.path.length;
        const ds = (((v.stopS - v.s) % L) + L) % L;
        if (ds > 0.5) v.served = false;
        if (!v.served) {
          vt = Math.min(vt, Math.max(0.06, Math.sqrt(2 * 0.9 * ds)));
          if (ds < 0.03) { v.served = true; v.wait = 3.2; v.v = 0; W.sfx('tram', v.x, v.z); }
        }
      }
      if (v.wait > 0) { v.wait -= dt; vt = 0; }
      const dv = vt - v.v;
      v.v += clamp(dv, -(free < 0.3 ? 6 : 2.5) * dt, 0.6 * dt);
      if (v.v < 0) v.v = 0;
      v.s += v.v * dt;
      place(v);
      // honk / ding if the player stands in the way
      if (v.blocker === 'player' && v.v < 0.05) {
        v.blockT += dt;
        if (v.blockT > 2.5) { v.blockT = -4; W.sfx(v.kind === 'tram' ? 'tram' : 'car', v.x, v.z); }
      } else if (v.blockT > 0) v.blockT = 0;
      else if (v.blockT < 0) v.blockT = Math.min(0, v.blockT + dt);
      const m = v.mesh;
      const k = v.pop;
      const ov = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.18 : 1;
      m.scale.set(k * ov, k * (k < 1 ? 1.25 - 0.25 * k : 1), k * ov);
      m.position.set(v.x, W.groundAt(v.x, v.z), v.z);
      m.rotation.y = v.yaw;
    }
  }

  function vehicleNear(x, z, r) {
    for (const v of vehicles) {
      if (!v.shown) continue;
      for (const ci of v.circles) if ((ci.c.x - x) ** 2 + (ci.c.z - z) ** 2 < r * r) return true;
    }
    return false;
  }

  return { vehicles, tram, update, vehicleNear };
}
