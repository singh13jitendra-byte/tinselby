// Tram + cars: follow their loops, look ahead (≤ 1.2) for the player, pedestrians, other vehicles and
// occupied crossings, slow/stop smoothly, tram pauses at TRAM_STOP with a ding. Vehicles are moving
// obstacles for the player (circle colliders updated every frame).
// Free-play rides (src/rides/tram.js, carriage.js): the tram stops at every layout.TRAM_STOPS stop and the carriage at
// CARRIAGE_STOP; v.rider = true while the player sits aboard (the player is then no obstacle for anyone, the vehicle's
// sounds play at the rider), v.minWait = the shortest stand at the next stop, v.scaleMul = a size multiplier.
import { Path, clamp } from './paths.js';
import { buildTramMesh, TRAM_LEN, TRAM_HALF_W } from './tram.js';
import { buildCarMesh, CAR_LEN, CAR_HALF_W } from './cars.js';
import { buildCarriage, CARRIAGE_LEN, CARRIAGE_HALF_W, CARRIAGE_STOP } from './carriage.js';

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
    const v = { ...o, circles, v: 0, x: 0, z: 0, yaw: 0, fx: 0, fz: 1, wait: 0, served: false, blockT: 0, pop: 0, shown: false, blocker: '',
      rider: false, minWait: 0, scaleMul: 1, scaleK: 1, atStop: -1, nextStop: -1, nextDs: Infinity };
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
  // stops in travel order (layout.TRAM_STOPS); falls back to the single TRAM_STOP
  const tramStops = (layout.TRAM_STOPS || [{ pos: layout.TRAM_STOP }]).map((st) => tramPath.nearestS(st.pos[0], st.pos[1]));
  const tram = addVehicle({ kind: 'tram', mesh: buildTramMesh(engine), path: tramPath, s: stopS - 3, len: TRAM_LEN, half: TRAM_HALF_W, vmax: 0.85, offsets: [-0.5, 0, 0.5], r: 0.27, district: 'market', stopS, stops: tramStops, stopWait: 3.6, ding: 'tram' });

  // cars
  const ring = layout.CAR_LANES.find((l) => l.id === 'ringOuter') || layout.CAR_LANES[0];
  const west = layout.CAR_LANES.find((l) => l.id === 'westStreet');
  const ringPath = new Path(ring.pts, { closed: true, radius: 1.2 });
  const carDefs = [['#c8433a', 'tree'], ['#4f9590', 'wreath'], ['#e0b54a', 'gifts'], ['#bfd8c6', '']];
  // the cars (and the little bus) share the ring; Holly Lane belongs to the horse-drawn carriage
  const NCAR = carDefs.length;
  for (let i = 0; i < NCAR; i++) {
    addVehicle({ kind: 'car', mesh: buildCarMesh(engine, carDefs[i][0], carDefs[i][1]), path: ringPath, s: (i / NCAR) * ringPath.length + 2, len: CAR_LEN, half: CAR_HALF_W, vmax: 0.92 + (i % 3) * 0.07, offsets: [-0.17, 0.17], r: 0.2, district: 'market' });
  }
  let carriage = null;
  if (west) {
    const westPath = new Path(west.pts, { closed: true, radius: 0.36 });
    // hoof beats: at the rider's ears while the player rides (a touch louder), positional otherwise
    const hoof = (x, z, vol) => {
      const pl = ctx.player.pos, ride = carriage && carriage.rider;
      try { ctx.audio?.sfx?.('step', ride ? { x: pl.x, z: pl.z, vol: vol * 1.25 } : { x, z, vol }); } catch (e) { /* audio optional */ }
    };
    const rig = buildCarriage(engine, hoof);
    const cs = CARRIAGE_STOP ? [westPath.nearestS(CARRIAGE_STOP.pos[0], CARRIAGE_STOP.pos[1])] : null;
    carriage = addVehicle({ kind: 'carriage', mesh: rig.mesh, anim: rig.animate, rig, path: westPath, s: 3, len: CARRIAGE_LEN, half: CARRIAGE_HALF_W, vmax: 0.46, offsets: [-0.45, -0.1, 0.38], r: 0.21, district: 'residential', stops: cs, stopWait: 3.0 });
  }

  const CROSS = layout.CROSSINGS;
  const people = []; // filled per frame: {x, z}
  function occupied(cx, cz) {
    for (const p of people) if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < 0.85 * 0.85) return true;
    return false;
  }

  let riding = false; // the player sits aboard some vehicle: they are nobody's obstacle
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
      if (!riding && (S.x - pl.x) ** 2 + (S.z - pl.z) ** 2 < lim * lim) { free = ds; v.blocker = 'player'; break; }
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
    // aboard, or waiting at a stop for the tram / carriage (the stop's spot is on a crossing: counting the waiting
    // player as an obstacle made the vehicle stop short of the stop for good)
    const rideId = ctx.rides?.active?.id;
    riding = vehicles.some((v) => v.rider) || rideId === 'tram' || rideId === 'carriage';
    if (!riding) people.push({ x: pl.x, z: pl.z, player: true });
    for (const d of roadPeople) if (d.vis) people.push({ x: d.x, z: d.z });
    for (const v of vehicles) {
      const show = W.isRevealed(v.district) && !v.held;
      if (show && !v.shown) { v.shown = true; v.pop = 0; v.mesh.visible = true; }
      if (!show && v.shown) { v.shown = false; v.mesh.visible = false; }
      for (const ci of v.circles) ci.c.enabled = v.shown;
      if (!v.shown) continue;
      v.pop = Math.min(1, v.pop + dt * 2.2);
      // speed target
      let vt = v.vmax;
      const free = freeAhead(v);
      vt = Math.min(vt, v.vmax * clamp((free - 0.2) / 0.9, 0, 1));
      if (v.stops) {
        // the next stop ahead (stops in travel order; the one just served stays 'next' until the vehicle leaves it)
        const L = v.path.length;
        let ds = Infinity, si = -1;
        for (let i = 0; i < v.stops.length; i++) {
          const d = (((v.stops[i] - v.s) % L) + L) % L;
          const dd = d > L - 0.5 ? d - L : d; // just past a stop (stopped a hair beyond it): still that stop
          if (dd < ds && dd > -0.5) { ds = dd; si = i; }
        }
        if (si !== v.nextStop) v.served = false;
        v.nextStop = si; v.nextDs = Math.max(0, ds);
        if (!v.served && ds >= 0) {
          vt = Math.min(vt, Math.max(0.06, Math.sqrt(2 * 0.9 * ds)));
          if (ds < 0.03) {
            v.served = true; v.wait = Math.max(v.stopWait || 3.2, v.minWait); v.minWait = 0; v.v = 0;
            if (v.ding) W.sfx(v.ding, v.rider ? pl.x : v.x, v.rider ? pl.z : v.z);
          }
        }
      }
      if (v.wait > 0) { v.wait -= dt; vt = 0; }
      v.atStop = v.stops && v.served && v.v < 0.02 && v.wait > 0 ? v.nextStop : -1;
      const dv = vt - v.v;
      v.v += clamp(dv, -(free < 0.3 ? 6 : 2.5) * dt, 0.6 * dt);
      if (v.v < 0) v.v = 0;
      v.s += v.v * dt;
      place(v);
      // honk / ding if the player stands in the way
      if (v.blocker === 'player' && v.v < 0.05) {
        v.blockT += dt;
        if (v.blockT > 2.5) { v.blockT = -4; if (v.kind !== 'carriage') W.sfx(v.kind === 'tram' ? 'tram' : 'car', v.x, v.z); }
      } else if (v.blockT > 0) v.blockT = 0;
      else if (v.blockT < 0) v.blockT = Math.min(0, v.blockT + dt);
      const m = v.mesh;
      const k = v.pop;
      const ov = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.18 : 1;
      v.scaleK += (v.scaleMul - v.scaleK) * (1 - Math.exp(-dt * 4));
      if (Math.abs(v.scaleMul - v.scaleK) < 1e-3) v.scaleK = v.scaleMul;
      const sk = v.scaleK;
      m.scale.set(k * ov * sk, k * (k < 1 ? 1.25 - 0.25 * k : 1) * sk, k * ov * sk);
      m.position.set(v.x, W.groundAt(v.x, v.z), v.z);
      m.rotation.y = v.yaw;
      if (v.anim) v.anim(dt, v);
    }
  }

  function vehicleNear(x, z, r) {
    for (const v of vehicles) {
      if (!v.shown) continue;
      for (const ci of v.circles) if ((ci.c.x - x) ** 2 + (ci.c.z - z) ** 2 < r * r) return true;
    }
    return false;
  }

  /** Sideways step (dx, dz) that takes a pedestrian at (x, z) out of the lane just ahead of / alongside any running
   *  vehicle (so walkers whose loop runs beside the rails make room instead of holding the tram up for good).
   *  isFree(x, z) → bool picks the side that has room (fences!). Returns null when nothing is near. */
  function vehicleDodge(x, z, isFree) {
    let dx = 0, dz = 0, any = false;
    for (const v of vehicles) {
      if (!v.shown || v.held) continue;
      const rx = x - v.x, rz = z - v.z;
      const lon = rx * v.fx + rz * v.fz;
      if (lon < -v.len / 2 - 0.2 || lon > v.len / 2 + LOOK + 0.4) continue;
      const nx = v.fz, nz = -v.fx;
      const lat = rx * nx + rz * nz, clear = v.half + 0.3;
      if (Math.abs(lat) >= clear) continue;
      let side = lat >= 0 ? 1 : -1;
      if (isFree) {
        const a = side * clear - lat, b = -side * clear - lat;
        if (!isFree(x + nx * a, z + nz * a) && isFree(x + nx * b, z + nz * b)) side = -side;
      }
      const need = side * clear - lat;
      dx += nx * need; dz += nz * need; any = true;
    }
    return any ? { dx, dz } : null;
  }

  /** wave 2: hide one ambient vehicle by kind (e.g. the tram during Tram Conductor) → release() */
  function hold(kind) {
    const v = vehicles.find((x) => x.kind === kind);
    if (!v) return () => {};
    v.held = (v.held || 0) + 1;
    let done = false;
    return () => { if (done) return; done = true; v.held = Math.max(0, v.held - 1); };
  }
  return { vehicles, tram, carriage, update, vehicleNear, vehicleDodge, hold, tramPath };
}
