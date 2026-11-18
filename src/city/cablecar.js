// Cable car: base + top stations, pylons, two cables, two red cabins with snowy roofs. ride(dir) carries the player.
import * as THREE from 'three';
import { SEAT_DROP } from '../core/player.js';
import { C, xf, box, rbox, cyl, cone, ball, bead, torus, tube, merge, extrude, poly, bulbLine, KNIT, FELT, GLOW, GLOSS } from './kit.js';

const GRIP = 1.19; // cable height above the station floor level
const FLOOR = 1.04; // cabin floor (bottom of the floor slab) below the grip
/** Cabin interior, heights above the floor slab's bottom: sill = top of the walls (window band above), roof = underside
 * of the roof, seat = top of the bench cushion. Tall enough for a seated doll with a pom-pom hat. */
const CAB = { w: 0.62, d: 0.56, sill: 0.25, roof: 0.73, seat: 0.185 };
const SEAT_Z = 0.13; // |z| of the rider's root on their bench (the uphill one: they always face the town)
const SEAT_X = 0.08; // a little off-centre (+x): the corner posts then frame the view instead of hiding the market tree
const SHOT = 'cablecarRide';

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

  // ---------------------------------------------------------------- cabins (door on the outer side, two knitted benches inside)
  const cabins = [0, 1].map((i) => {
    const m = new THREE.Mesh(cabinGeo(i === 0 ? -1 : 1), engine.mat);
    m.castShadow = true;
    const grp = new THREE.Group();
    grp.add(m);
    grp.userData.u = i === 0 ? 0 : 1;
    grp.userData.side = i === 0 ? -1 : 1; // outer side (door) on ±x
    // the rider's things sit on the bench beside them during the ride (e.g. the tree star, see stowAnchor)
    const stow = new THREE.Object3D();
    stow.position.set(SEAT_X - 0.27, -FLOOR + CAB.seat + 0.075, 0); // beside the rider; z follows their bench (ride())
    stow.rotation.y = 0.35;
    grp.add(stow);
    grp.userData.stow = stow;
    at(i, grp.userData.u, grp.position);
    K.G.hill.group.root.add(grp);
    K.G.hill.group.node(grp, [grp.position.x, grp.position.y, grp.position.z], { delay: 1.0, dur: 0.5 });
    return grp;
  });
  const exits = { up: { x: tx - 1.1, z: tz + 0.55, heading: Math.PI }, down: { x: bx - 1.05, z: bz + 0.7, heading: 0 } };

  let ride = null;
  const player = K.ctx.player;
  const cam = K.ctx.cam;
  const DUR = 7.5;
  const dollK = () => { const ch = player.character; return (ch?.group?.scale.x || 1.15) * (ch?.yaw?.scale.x || 0.9); };
  /** f = +1: the rider faces +z (down the cable, the town, the market tree) — riding down that is the way the cabin
   * travels; riding up they ride backwards and watch the town fall away (facing uphill only shows a wall of snow). */
  const facing = () => 1;
  /** Cabin-local root of the seated doll: on the uphill bench, facing the town (f = +1). */
  const seatLocal = (out, f) => out.set(SEAT_X, -FLOOR + CAB.seat - SEAT_DROP * dollK(), -f * SEAT_Z);
  const seatW = new THREE.Vector3();
  function placeRider(r) {
    r.cab.updateWorldMatrix(true, false);
    seatLocal(seatW, r.f);
    r.cab.localToWorld(seatW);
    player.pos.copy(seatW);
    player.vel.set(0, 0);
    player.heading = r.f > 0 ? 0 : Math.PI;
    player.object.position.copy(seatW);
    player.object.rotation.x = r.cab.rotation.x; // sway with the cabin
    const ch = player.character;
    if (ch) { ch.seated = true; ch.yaw.rotation.y = player.heading; }
  }
  function unseat() {
    player.object.rotation.x = 0;
    const ch = player.character;
    if (ch) { ch.seated = false; ch.yaw.visible = true; }
  }
  K.updates.push((dt) => {
    if (!ride) return;
    ride.t += dt;
    const l = Math.min(1, ride.t / DUR);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * l);
    const u = ride.dir === 'up' ? e : 1 - e;
    at(ride.ci, u, ride.cab.position);
    at(1 - ride.ci, 1 - u, ride.other.position);
    // gentle swing (about the grip)
    ride.cab.rotation.x = Math.sin(ride.t * 2.1) * 0.035 * Math.sin(Math.PI * l);
    ride.other.rotation.x = -ride.cab.rotation.x;
    placeRider(ride);
    // the ride shot hides the doll while the camera sits in its head; anything else (skipped / no shot) shows it
    if (!cam || cam.shotName !== SHOT) player.character.yaw.visible = true;
    if (l >= 1) {
      const r = ride; ride = null;
      r.done = true;
      r.cab.userData.u = r.dir === 'up' ? 1 : 0;
      r.other.userData.u = 1 - r.cab.userData.u;
      r.cab.rotation.x = r.other.rotation.x = 0;
      unseat();
      const ex = exits[r.dir];
      player.teleport(ex.x, ex.z, ex.heading);
      player.object.position.copy(player.pos);
      player.controllable = r.wasControllable || game.state.phase === 'play';
      game.emit('cablecar:arrive', { dir: r.dir });
      r.resolve();
    }
  });

  // ---------------------------------------------------------------- ride camera: zoom into the cabin → the rider's eyes → zoom out
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
  const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const bez = (out, p0, p1, p2, s) => { const k = 1 - s; return out.set(k * k * p0.x + 2 * k * s * p1.x + s * s * p2.x, k * k * p0.y + 2 * k * s * p1.y + s * s * p2.y, k * k * p0.z + 2 * k * s * p1.z + s * s * p2.z); };
  // Camera spots at a station: raycast from the rider's head to each candidate and take the first clear one (pines,
  // station walls and roofs). Runs twice per boarding; hits on the cabins, the player and particles are ignored.
  // A spot is { x (× side), y, z (× along) } from the rider's eyes, before the portrait pull-back.
  const ray = new THREE.Raycaster();
  const IN_SPOTS = [{ x: CAB.w / 2 + 1.9, y: 0.45, z: -0.5 }, { x: CAB.w / 2 + 1.9, y: 0.9, z: -0.5 }, { x: CAB.w / 2 + 1.3, y: 0.7, z: -0.3 }];
  const OUT_SPOTS = [{ x: 0.45, y: 0.5, z: 1.9 }, { x: 0.2, y: 0.75, z: 1.6 }, { x: 0.7, y: 0.95, z: 1.4 }, { x: CAB.w / 2 + 1.3, y: 0.7, z: 0.4 }];
  const ignoreHit = (o) => {
    if (o.isPoints || o.isLine || o.isSprite || !o.visible) return true;
    for (let p = o; p; p = p.parent) if (p === player.object || cabins.includes(p) || ghosts.includes(p)) return true;
    return false;
  };
  const spotPos = (out, eye, o, pf) => out.set(eye.x + o.side * o.x * pf, eye.y + o.y, eye.z + o.along * o.z * pf);
  function pickSpot(eye, list, sx, along, pf) {
    for (const side of [sx, -sx]) {
      for (const sp of list) {
        const o = { ...sp, side, along };
        spotPos(_c, eye, o, pf);
        _d.copy(_c).sub(eye);
        const len = _d.length();
        ray.set(eye, _d.normalize());
        ray.near = 0.5; ray.far = len + 0.2;
        let hit = false;
        try { hit = ray.intersectObjects(engine.scene.children, true).some((h) => !ignoreHit(h.object)); } catch (e) { hit = false; }
        if (!hit) return o;
      }
    }
    return { ...list[list.length - 1], side: sx, along };
  }

  /**
   * One playShot for the whole ride, driven by the ride clock (not u):
   *  0–T1   from wherever the camera was, a glide to beside the cabin, then in through the doorway behind the rider's
   *         head into their eyes (the doll hides once the camera is that close); the view turns to the town before it gets there;
   *  T1–T2  eye level: out of the town-side window along the cable (down: the town ahead, slowly turning to the market
   *         tree; up, riding backwards: past the base station to the market tree, then down the cable as the town
   *         falls away), swaying with the cabin, tilt-shift off;
   *  T2–T3  back out to a spot on the cable side of the arrival station (in front of the rider riding up, behind them
   *         riding down), watching the cabin glide in; the rider steps out at DUR and the director blends to the
   *         gameplay camera over TAIL.
   * Skippable: a tap blends straight to the normal camera, which now shows the doll properly seated in the cabin.
   */
  function rideShot(r) {
    const T1 = 1.45, T2 = DUR - 2.2, T3 = T2 + 1.35, TAIL = 0.95;
    const sx = r.cab.userData.side, f = r.f; // door on the outer side: the other cabin never gets in between
    const endA = at(r.ci, r.dir === 'up' ? 1 : 0, new THREE.Vector3());
    const openOut = r.dir === 'up' ? 1 : -1; // the arrival station opens towards the cable: +z at the top, −z at the base
    const post = { band: 0.3, falloff: 0.5 };
    // proposed camera.js hook (ignored until the director reads shot.lens): eye-level lens while w → 1
    const lens = { w: 0, fov: 54, near: 0.03 };
    const eyeL = new THREE.Vector3(), headL = new THREE.Vector3(), doorL = new THREE.Vector3();
    const pEnd = new THREE.Vector3(), eyeW = new THREE.Vector3(), headW = new THREE.Vector3(), doorW = new THREE.Vector3(), gaze = new THREE.Vector3();
    const c0 = engine.camera.position.clone(), l0 = engine.camera.getWorldDirection(new THREE.Vector3());
    /** Pull outside poses back on narrow (portrait) screens so the cabin keeps its width in frame. */
    const pull = () => {
      const c = engine.camera, half = Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * c.aspect;
      return Math.min(2.4, Math.max(1, 0.62 / (half * 2.0)));
    };
    const tree = () => { const t = K.ctx.city?.tree; return { x: t?.pos?.x ?? L.MARKET.tree.x, z: t?.pos?.z ?? L.MARKET.tree.z }; };
    function gazeAt(T, out) {
      const q = ss((T - T1) / (T2 - T1));
      let yaw, pitch;
      const tp = tree(), yTree = Math.atan2(tp.x - eyeW.x, tp.z - eyeW.z); // the cable runs along +z (yaw 0)
      if (r.dir === 'down') { // the town ahead, slowly turning towards the big tree in the market
        yaw = yTree * (0.35 + 0.45 * q);
        pitch = -0.075;
      } else { // riding up backwards: start looking past the base station towards the tree, end down the cable
        yaw = yTree * (0.85 - 0.4 * q);
        pitch = -0.03 - 0.07 * q;
      }
      yaw += Math.sin(T * 0.55) * 0.03;
      pitch += Math.sin(T * 0.7) * 0.012;
      return out.set(Math.sin(yaw) * Math.cos(pitch) * f, Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch) * f);
    }
    seatLocal(_a, f);
    const eye0 = new THREE.Vector3(_a.x, _a.y + 0.268 * dollK(), _a.z);
    r.cab.updateWorldMatrix(true, false);
    const spotIn = pickSpot(r.cab.localToWorld(eye0.clone()), IN_SPOTS, sx, f, pull()); // beside, a little behind the rider
    const spotOut = pickSpot(eye0.clone().add(endA), OUT_SPOTS, sx, openOut, pull());
    const HIDE = 0.42; // the doll hides while the camera is closer than this to its head (it would clip the near plane)
    return {
      // blendIn ≈ 0: the path itself starts at the camera's current pose (a position blend would cut through roofs)
      name: SHOT, duration: DUR + TAIL, blendIn: 0.05, blendOut: TAIL, skippable: true, tilt: 0.7, portrait: false, post, lens,
      update(_u, out) {
        const T = Math.min(r.t, DUR), cab = r.cab, k = dollK(), ch = player.character;
        seatLocal(_a, f);
        eyeL.set(_a.x, _a.y + 0.268 * k, _a.z + f * 0.02);
        headL.set(_a.x, _a.y + 0.265 * k, _a.z);
        cab.updateWorldMatrix(true, false);
        eyeW.copy(eyeL); cab.localToWorld(eyeW);
        eyeW.y += Math.sin(T * 1.9) * 0.003; // a little head bob on top of the cabin's sway
        headW.copy(headL); cab.localToWorld(headW);
        gazeAt(T, gaze);
        const pf = pull();
        let eyeK = 0;
        if (T < T1) {
          // current camera → beside the cabin → the doorway just behind the rider's head → their eyes
          doorL.set(spotIn.side * (CAB.w / 2 + 0.06), eyeL.y + 0.04, _a.z - f * 0.1);
          doorW.copy(doorL); cab.localToWorld(doorW);
          // two legs: a straight glide to the spot beside the cabin (from the gameplay camera that line stays clear of
          // the station roof: both lie outside the station's footprint), then a curve through the doorway to the eyes
          spotPos(_b, eyeW, spotIn, pf);
          const s1 = T / T1 < 0.45 ? ss(T / T1 / 0.45) : 1, s2 = ss((T / T1 - 0.45) / 0.55);
          if (s2 <= 0) out.pos.copy(c0).lerp(_b, s1);
          else bez(out.pos, _b, doorW, eyeW, s2);
          _c.copy(headW).sub(out.pos);
          if (_c.lengthSq() < 1e-4) _c.copy(gaze);
          _c.normalize();
          if (s2 <= 0) _d.copy(l0).lerp(_c, ss(s1 / 0.8));
          else _d.copy(_c).lerp(gaze, ss((s2 - 0.1) / 0.6));
          out.target.copy(out.pos).addScaledVector(_d.normalize(), 3);
          eyeK = s2;
        } else if (T < T2) {
          out.pos.copy(eyeW);
          out.target.copy(eyeW).addScaledVector(gaze, 4);
          eyeK = 1;
        } else {
          const s = ss((T - T2) / (T3 - T2));
          // out through the window on the station's cable side to the arrival spot; look back at the rider once clear
          _e.set(endA.x + eyeL.x, endA.y + eyeL.y, endA.z + _a.z); // the rider's eyes once the cabin has stopped
          spotPos(pEnd, _e, spotOut, pf);
          doorL.set(spotOut.side * 0.12 + _a.x, eyeL.y + 0.05, _a.z + openOut * 0.24);
          doorW.copy(doorL); cab.localToWorld(doorW);
          bez(out.pos, eyeW, doorW, pEnd, s);
          _c.copy(headW).sub(out.pos);
          if (_c.lengthSq() < 1e-4) _c.copy(gaze);
          _d.copy(gaze).lerp(_c.normalize(), ss((s - 0.25) / 0.5)).normalize();
          out.target.copy(out.pos).addScaledVector(_d, Math.max(1, out.pos.distanceTo(headW)));
          eyeK = 1 - s;
        }
        // hide the doll while the camera is inside (or just behind) its head
        if (ch) ch.yaw.visible = out.pos.distanceTo(headW) > HIDE;
        post.band = 0.3 + 0.75 * eyeK; // wide focus (no tilt-shift blur) at eye level
        post.falloff = 0.5 + 0.2 * eyeK;
        lens.w = eyeK;
        lens.fov = 54 + 22 * (cam?.portrait || 0);
      },
    };
  }

  // ---------------------------------------------------------------- remote riders (net dolls): give them a cabin of their own
  // A remote player in the cable car arrives here as a doll sliding along the cable line at ground level (the net view
  // only knows x/z). After the net update (order 50) we lift such dolls onto the floor of a spare cabin on the cable
  // and hide their blob shadow; walkers are told apart by moving purely along the line, exactly on it, away from stations.
  const ghostGeo = [cabinGeo(-1), cabinGeo(1)];
  const ghosts = [];
  const riders = new Map();
  let netRoot = null, netLook = 0;
  const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0), v3 = new THREE.Vector3();
  function cableY(i, z) {
    for (let s = 0; s < sup.length - 1; s++) {
      const a = sup[s], b = sup[s + 1];
      if ((z <= a.z && z >= b.z) || s === sup.length - 2) { const f = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z))); return a.y + (b.y - a.y) * f - spanSag(f); }
    }
    return sup[0].y;
  }
  engine.addUpdate((dt) => {
    if (!netRoot || netRoot.parent !== engine.scene) {
      netRoot = null;
      if ((netLook -= dt) > 0) return;
      netLook = 1; // the net view adds its root straight to the scene (none with ?net=off): a cheap top-level look
      netRoot = engine.scene.children.find((o) => o.name === 'net-remotes') || null;
      if (!netRoot) return;
    }
    let used = 0, blobs = null, bi = 0;
    for (const g of netRoot.children) {
      if (g.isInstancedMesh) { blobs = g; continue; }
      const x = g.position.x, z = g.position.z, k = bi++;
      let rec = riders.get(g);
      if (!rec) { rec = { px: x, pz: z, on: false, still: 0 }; riders.set(g, rec); }
      const vz = (z - rec.pz) / Math.max(dt, 1e-4), vx = (x - rec.px) / Math.max(dt, 1e-4);
      rec.px = x; rec.pz = z;
      const li = Math.abs(x - lineX[0]) < 0.05 ? 0 : Math.abs(x - lineX[1]) < 0.05 ? 1 : -1;
      const inSpan = z < bz - 0.75 && z > tz + 0.75;
      if (li < 0 || !inSpan) rec.on = false;
      else if (!rec.on && Math.abs(vz) > 0.15 && Math.abs(vx) < 0.06) rec.on = true;
      rec.still = Math.abs(vz) < 0.02 ? rec.still + dt : 0;
      if (rec.still > 1.5) rec.on = false;
      if (!rec.on) continue;
      let gc = ghosts[used];
      if (!gc) { gc = new THREE.Mesh(ghostGeo[li], engine.mat); gc.castShadow = true; engine.scene.add(gc); ghosts.push(gc); }
      gc.geometry = ghostGeo[li];
      gc.visible = true;
      used++;
      const gy = cableY(li, z);
      gc.position.set(lineX[li], gy, z);
      g.position.set(lineX[li], gy - FLOOR + 0.06, z);
      if (blobs && k < blobs.count) {
        blobs.getMatrixAt(k, m4);
        v3.setFromMatrixPosition(m4);
        if (Math.abs(v3.x - x) < 0.02 && Math.abs(v3.z - z) < 0.02) { blobs.setMatrixAt(k, zero); blobs.instanceMatrix.needsUpdate = true; }
      }
    }
    for (let i = used; i < ghosts.length; i++) ghosts[i].visible = false;
    if (riders.size > 24) for (const g of riders.keys()) if (g.parent !== netRoot) riders.delete(g);
  }, 60);

  return {
    base: new THREE.Vector3(bx, gb, bz),
    top: new THREE.Vector3(tx, HL.topY, tz),
    cabins,
    get riding() { return !!ride; },
    /** Remote riders currently shown in a cabin of their own (diagnostics). */
    get remoteRiders() { let n = 0; for (const r of riders.values()) if (r.on) n++; return { view: !!netRoot, riding: n, cabins: ghosts.filter((g) => g.visible).length }; },
    /** Object3D on the bench beside the rider (child of the riding cabin), or null when nobody rides. */
    get stowAnchor() { return ride ? ride.cab.userData.stow : null; },
    ride(dir = 'up') {
      if (ride) return ride.promise;
      const startU = dir === 'up' ? 0 : 1;
      const ci = Math.abs(cabins[0].userData.u - startU) < 0.5 ? 0 : 1;
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const f = facing(dir);
      ride = { dir, f, t: 0, ci, cab: cabins[ci], other: cabins[1 - ci], resolve, promise, wasControllable: player.controllable, done: false };
      ride.cab.userData.stow.position.z = -f * (SEAT_Z + 0.01);
      player.controllable = false;
      at(ci, startU, ride.cab.position);
      placeRider(ride);
      game.emit('cablecar:ride', { dir, duration: DUR, cabin: ride.cab });
      // our ride shot replaces the generic side-on follow shot (camera/shots.js plays it on cablecar:ride)
      if (cam && game.state.phase === 'play' && !K.ctx.params?.has?.('noshots')) cam.playShot(rideShot(ride));
      return promise;
    },
  };
}

function spanSag(f) { return 0.06 * 4 * f * (1 - f); }

/** Cabin with an open window band all round, thin knitted walls below it, a door on the outer side (doorSide ±x),
 * two facing benches (the rider sits on the one at the back, see SEAT_Z) and a snowy roof. Origin = the grip on the cable. */
function cabinGeo(doorSide) {
  const g = [];
  const { w, d, sill, roof, seat } = CAB, y0 = -FLOOR, t = 0.032, wallH = sill - 0.05;
  g.push(xf(rbox(w, 0.06, d, 0.025, C.deepRed, KNIT, 1), [0, y0 + 0.03, 0]));
  // walls below the windows (hollow: the riders sit inside)
  for (const sz of [-1, 1]) g.push(xf(box(w, wallH, t, C.red), [0, y0 + 0.05 + wallH / 2, sz * (d / 2 - t / 2)]));
  for (const sx of [-1, 1]) g.push(xf(box(t, wallH, d - 2 * t, C.red), [sx * (w / 2 - t / 2), y0 + 0.05 + wallH / 2, 0]));
  // cream sill band + corner posts up to the roof
  for (const sz of [-1, 1]) g.push(xf(box(w + 0.012, 0.03, 0.05, C.cream), [0, y0 + sill, sz * (d / 2 - 0.02)]));
  for (const sx of [-1, 1]) g.push(xf(box(0.05, 0.03, d + 0.012, C.cream), [sx * (w / 2 - 0.02), y0 + sill, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.push(xf(box(0.038, roof - sill, 0.038, C.red), [sx * (w / 2 - 0.02), y0 + (sill + roof) / 2, sz * (d / 2 - 0.02)]));
  // door on the outer side: a cream frame from floor to roof, a split down the middle, a darker lower panel + handle
  const dx = doorSide * (w / 2 + 0.004), dz = 0.105;
  for (const sz of [-1, 1]) g.push(xf(box(0.014, roof - 0.05, 0.026, C.cream), [dx, y0 + 0.05 + (roof - 0.05) / 2, sz * dz]));
  g.push(xf(box(0.014, 0.026, dz * 2 + 0.026, C.cream), [dx, y0 + roof - 0.012, 0]));
  g.push(xf(box(0.01, wallH - 0.02, dz * 2 - 0.03, C.deepRed), [dx, y0 + 0.06 + (wallH - 0.02) / 2, 0]));
  g.push(xf(box(0.012, roof - 0.07, 0.008, C.deepRed), [dx + doorSide * 0.002, y0 + 0.06 + (roof - 0.07) / 2, 0]));
  for (const sz of [-1, 1]) g.push(xf(bead(0.013, C.gold, GLOSS), [dx + doorSide * 0.01, y0 + sill - 0.05, sz * 0.03]));
  g.push(xf(box(0.06, 0.02, dz * 2 + 0.03, C.cream), [doorSide * (w / 2 + 0.03), y0 + 0.012, 0])); // step
  // two facing benches: wooden frame, a knitted cushion, a striped backrest against each end wall (shows in the windows)
  for (const sz of [-1, 1]) {
    const zc = sz * (d / 2 - t - 0.068), zb = sz * (d / 2 - t - 0.013);
    g.push(xf(box(w - 2 * t - 0.02, seat - 0.085, 0.12, C.wood), [0, y0 + 0.06 + (seat - 0.085) / 2 - 0.01, zc]));
    g.push(xf(rbox(w - 2 * t - 0.03, 0.04, 0.13, 0.016, C.green, KNIT, 1), [0, y0 + seat - 0.022, zc - sz * 0.004]));
    // backrest top just above the sill: it shows behind the rider but keeps the view out of the front window clear
    g.push(xf(rbox(w - 2 * t - 0.03, 0.125, 0.026, 0.012, C.cream, KNIT, 1), [0, y0 + seat + 0.058, zb]));
    g.push(xf(box(w - 2 * t - 0.028, 0.026, 0.03, C.red), [0, y0 + seat + 0.095, zb]));
  }
  // roof (red rim + white snowy cap)
  g.push(xf(rbox(w + 0.04, 0.06, d + 0.04, 0.025, C.red, KNIT, 1), [0, y0 + roof + 0.03, 0]));
  g.push(xf(rbox(w - 0.02, 0.07, d - 0.04, 0.035, C.snow, FELT, 1), [0, y0 + roof + 0.08, 0]));
  g.push(xf(ball(0.1, C.snow, FELT, 8, 5), [0.12, y0 + roof + 0.12, 0.05], null, [1.6, 0.5, 1.4]));
  // warm bulbs under the roof rim
  for (let k = 0; k < 6; k++) for (const sz of [-1, 1]) g.push(xf(bead(0.016, C.warm, GLOW), [-w / 2 + 0.06 + k * ((w - 0.12) / 5), y0 + roof - 0.01, sz * (d / 2 + 0.01)]));
  // hanger arm (curved) + grip on the cable
  const top = y0 + roof + 0.1;
  g.push(tube([[0, top, 0], [0.03, top + 0.06, 0], [0.1, -0.1, 0], [0.07, -0.035, 0], [0, -0.02, 0]], 0.022, '#6e7175', GLOSS, 16, 5));
  g.push(xf(box(0.06, 0.06, 0.16, '#6e7175', GLOSS), [0, 0, 0]));
  g.push(xf(cyl(0.035, 0.035, 0.03, 8, '#4e5054'), [0, 0.02, 0.06], [0, 0, Math.PI / 2]));
  g.push(xf(cyl(0.035, 0.035, 0.03, 8, '#4e5054'), [0, 0.02, -0.06], [0, 0, Math.PI / 2]));
  g.push(xf(bead(0.03, C.snow), [0, 0.06, 0], null, [1, 0.6, 2]));
  // little wreaths on both ends
  for (const sz of [-1, 1]) {
    g.push(xf(torus(0.055, 0.018, C.pine, KNIT, Math.PI * 2, 10), [0, y0 + 0.15, sz * (d / 2 + 0.02)]));
    g.push(xf(bead(0.024, C.red), [0, y0 + 0.1, sz * (d / 2 + 0.034)]));
  }
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
