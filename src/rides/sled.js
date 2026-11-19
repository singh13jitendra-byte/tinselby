// FREE SLEDGING on Sledge Hill (free-play ride, see src/rides/index.js for the contract). No gates, no stars, no timer.
//
// "Grab a sledge" at the top of the hill (beside ARENAS.sled.top, on the east sled lane): the player sits on a knitted
// sledge (the door-7 sledge model + a second doll in the same sitting pose) and slides down the real hill height field
// (ctx.colliders.heightAt): gravity along the slope, runners that grip sideways slip, drag that grows on the flat so the
// run rolls out at the bottom. Steer left / right (stick x, A D, ← →), back / S brakes, forward / W pushes off when slow.
// Pines, lamps, benches and the chalet are the town's own colliders (ctx.colliders.resolve): you bump off them gently
// (a third of the speed goes, a snow puff and a pop). At the bottom the run rolls to a stop: "Walk back up" puts you
// back at the top (a quick fade), "Hop off" ends the ride; the cable car also still works (it ends the ride).
//
// Camera: a chase shot behind and above the sledge (the door-7 rig idea: smoothed heading, pulls in / up when a pine is
// in the way, pulls back in portrait); the "View" button toggles an eye-level view from the rider's seat (drag to look
// round, springs back). Whee: existing ctx.audio.sfx names only (whoosh, cheer, sleighBells, pop, drop).
//
// Contract notes: player.controllable = false during the ride and the player's own doll is hidden; everything is
// restored (and the player put down at a safe spot) on Hop off, game / minigame / finale changes.
import * as THREE from 'three';
import { buildCharacter } from '../core/player.js';
import { sledParts, mergeGeos, puffGeo } from '../minigames/sled/props.js';
import { aspectK } from '../minigames/view.js';
import { mountRideJoystick } from './skate.js';
import './rides-snow.css';

const SCALE = 1.15; // the player's doll scale
const START = { x: 0.5, z: -14.95 }; // top of the east sled lane
const SPOT = { x: 0.4, z: -15.35 };
const G = 3.5; // slope acceleration (units/s² per unit of gradient)
const GRIP = 3.4; // 1/s: sideways slip fades
const DRAG = 0.4; // 1/s forward drag on the slope
const FLAT_DRAG = 1.0; // extra drag when the ground is flat (rolls out at the bottom)
const MAX_V = 2.9;
const BODY_R = 0.26; // bump radius vs. the town's colliders (a pine's knitted skirt reaches about 0.4 from its trunk)
const NP = 56;
const XMIN = -7.9, XMAX = 8.4, ZMIN = -16.3, ZMAX = -7.8; // the run rolls out at the foot of the hill, short of the tram street

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const ICON_EYE = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" fill="currentColor" fill-opacity=".15"/><circle cx="12" cy="12" r="3"/></svg>';

export function createSledgingRide(ctx) {
  const { engine, game, cam, player, colliders, input, interact, uiRoot, layout } = ctx;
  const H = (x, z) => colliders.heightAt(x, z);
  const sfx = (n, o) => { try { ctx.audio?.sfx?.(n, o); } catch (e) { /* audio is optional */ } };
  const ride = { id: 'sled', active: false, keepControls: true, update, stop, get state() { return S; }, board };

  // heading h: direction (sin h, cos h) in (x, z) (the sledge model faces +z); right of travel = (-cos h, sin h)
  const S = { x: 0, z: 0, vx: 0, vz: 0, h: 0, steer: 0, sp: 0, y: 0, grade: 0, t: 0, idleT: 0, stopped: false, bumpT: 0, bumps: 0, pitch: 0, wob: 0, fade: 0, fadeDir: 0, resetPending: false, whooT: 0, cheered: false, runT: 0, maxV: 0 };
  let R = null;
  let saved = null;

  const spot = interact.add({
    id: 'ride-sled', x: SPOT.x, z: SPOT.z, r: 1.15, label: 'Grab a sledge', icon: 'sleigh',
    enabled: () => game.state.phase === 'play' && ctx.rides?.active === null && player.controllable && !cam.shotActive,
    onInteract: board,
  });
  // riding together (src/rides/together.js): one place (s = 0); remote riders keep their streamed position (no seat pose)
  ride.seats = {
    n: 1,
    mine: () => (ride.active ? 0 : null),
    near: () => [],
    join() {
      if (game.state.phase !== 'play' || ctx.rides?.active !== null || !player.controllable) return false;
      board();
      return ride.active;
    },
    where: () => ({ x: SPOT.x, z: SPOT.z }),
    spots: [spot],
  };

  // ---------------------------------------------------------------- board
  function board() {
    if (ride.active || ctx.rides.active) return;
    ride.active = true;
    ctx.rides.begin(ride);
    saved = { visible: player.object.visible, wasControllable: player.controllable, onStep: player.onStep };
    player.controllable = false;
    player.object.visible = false;
    input.clearTap();
    build();
    reset();
    snapRig();
    startShot();
    sfx('sleighBells', { vol: 0.5 });
    sfx('whoosh', { vol: 0.5 });
    game.emit('ui:toast', { text: 'Whee! Steer left and right, pull back to brake', ms: 3400 });
  }

  /** (re)start at the top of the lane, rolling gently */
  function reset() {
    S.x = START.x; S.z = START.z; S.h = 0.02;
    S.sp = 0.8; S.vx = Math.sin(S.h) * S.sp; S.vz = Math.cos(S.h) * S.sp;
    S.steer = 0; S.idleT = 0; S.stopped = false; S.bumpT = 0; S.wob = 0; S.runT = 0; S.cheered = false; S.maxV = 0; S.whooT = 0;
    S.y = H(S.x, S.z);
    if (R) R.ui.classList.remove('rs-stopped');
  }

  // ---------------------------------------------------------------- build
  function build() {
    const mat = engine.mat;
    const disp = [];
    const own = (x) => { disp.push(x); return x; };
    const root = new THREE.Group();
    root.name = 'ride-sled';
    engine.scene.add(root);
    const sled = new THREE.Group();
    const sledMesh = new THREE.Mesh(own(mergeGeos(sledParts(1, '#b8302d'))), mat);
    sledMesh.castShadow = true; sledMesh.receiveShadow = true;
    sled.add(sledMesh);
    const rider = buildCharacter(mat, game.state.style || {});
    rider.group.scale.setScalar(SCALE);
    rider.group.position.set(0, 0.112, -0.075);
    sled.add(rider.group);
    rider.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(sled);
    const puffs = new THREE.InstancedMesh(own(puffGeo()), mat, NP);
    puffs.frustumCulled = false; puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(puffs);
    const pool = Array.from({ length: NP }, () => ({ t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler();
    for (let i = 0; i < NP; i++) puffs.setMatrixAt(i, M.compose(V.set(0, -20, 0), Q.identity(), SC.setScalar(0.0001)));
    // DOM
    const ui = document.createElement('div');
    ui.className = 'rs-ui rs-sled';
    ui.innerHTML = `<div class="rs-fade"></div>
      <div class="rs-stack">
        <div class="rs-panel"><button class="rs-btn rs-pill rs-big rs-up">Walk back up</button><div class="rs-note">or ride the cable car</div></div>
        <button class="rs-btn rs-round rs-view" aria-label="Switch view"><span class="rs-ico">${ICON_EYE}</span><span class="rs-lab">View</span></button>
        <button class="rs-btn rs-pill rs-off" aria-label="Hop off">Hop off</button>
      </div>`;
    uiRoot.appendChild(ui);
    const unJoy = mountRideJoystick(ctx, ui);
    for (const b of ui.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.querySelector('.rs-view').addEventListener('click', (e) => { e.preventDefault(); sfx('ui'); toggleView(); });
    ui.querySelector('.rs-off').addEventListener('click', (e) => { e.preventDefault(); sfx('ui'); finish('hop'); });
    ui.querySelector('.rs-up').addEventListener('click', (e) => { e.preventDefault(); sfx('ui'); walkUp(); });
    // drag to look (eye view only): on the canvas
    const look = { yaw: 0, pitch: 0, drag: null };
    const dom = engine.renderer.domElement;
    const onDown = (e) => { if (R && R.eye && e.target === dom && (e.button == null || e.button === 0)) look.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
    const onMove = (e) => {
      const d = look.drag;
      if (!d || d.id !== e.pointerId) return;
      const s = Math.max(1, Math.min(innerWidth, innerHeight));
      look.yaw = clamp(look.yaw + ((e.clientX - d.x) / s) * 2.2, -1.6, 1.6);
      look.pitch = clamp(look.pitch + ((e.clientY - d.y) / s) * 1.6, -0.5, 0.5);
      d.x = e.clientX; d.y = e.clientY;
    };
    const onUp = (e) => { if (look.drag && look.drag.id === e.pointerId) look.drag = null; };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    const offs = [
      game.on('input:tap', () => input.clearTap()),
      game.on('minigame:start', () => finish('hop')),
      game.on('cablecar:ride', () => finish('cable')),
      unJoy,
    ];
    const lens = { w: 0, fov: 58, near: 0.02 };
    R = {
      root, sled, rider, puffs, pool, puffI: 0, ui, disp, offs, mat, M, Q, V, SC, E, look, lens,
      rig: { pos: new THREE.Vector3(), target: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), k: 4 },
      want: new THREE.Vector3(), wantT: new THREE.Vector3(),
      eye: false, eyeK: 0, listeners: [onDown, onMove, onUp], shot: null, wobT: 0,
    };
  }

  function spray(x, y, z, n, spread, up, size, life = 0.7) {
    for (let k = 0; k < n; k++) {
      const p = R.pool[(R.puffI + k) % NP];
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      Object.assign(p, { t: 0, life: life * (0.7 + Math.random() * 0.6), x, y, z, vx: Math.cos(a) * r, vz: Math.sin(a) * r, vy: up * (0.5 + Math.random()), s: size * (0.6 + Math.random() * 0.7) });
    }
    R.puffI = (R.puffI + n) % NP;
  }

  // ---------------------------------------------------------------- camera
  function startShot() {
    R.shot = cam.playShot({
      name: 'sled-ride', portrait: false, duration: 1e6, blendIn: 0.6, blendOut: 0.6, skippable: false, tilt: 0.8, lens: R.lens,
      update: (u, out) => { if (R) { out.pos.copy(R.rig.pos); out.target.copy(R.rig.target); } },
    });
  }
  function toggleView() {
    if (!R) return;
    R.eye = !R.eye;
    R.look.yaw = R.look.pitch = 0;
    R.ui.classList.toggle('rs-eye', R.eye);
  }
  /** sight-line test against the town's colliders (pines, chalet…): is something solid between (cx,cy,cz) and the sled? */
  const probe = { x: 0, z: 0 };
  function blocked(cx, cy, cz, sx, sy, sz) {
    for (let k = 0; k <= 6; k++) {
      const u = k / 7, x = cx + (sx - cx) * u, z = cz + (sz - cz) * u, y = cy + (sy - cy) * u;
      probe.x = x; probe.z = z;
      colliders.resolve(probe, 0.3, x, z);
      if (Math.hypot(probe.x - x, probe.z - z) > 0.01 && y < H(x, z) + 1.12) return true;
    }
    return false;
  }
  function aimRig(dt, snap = false) {
    const { rig, want, wantT } = R;
    const hx = Math.sin(S.h), hz = Math.cos(S.h);
    const kd = snap ? 1 : 1 - Math.exp(-dt * 2.6);
    rig.dir.x += (hx - rig.dir.x) * kd; rig.dir.z += (hz - rig.dir.z) * kd;
    const l = Math.hypot(rig.dir.x, rig.dir.z) || 1, dx = rig.dir.x / l, dz = rig.dir.z / l;
    const py = S.y + 0.1;
    R.eyeK += ((R.eye ? 1 : 0) - R.eyeK) * (snap ? 1 : 1 - Math.exp(-dt * 6));
    // chase: behind and above, pulled back in portrait; closer and higher when a pine is in the way
    const ak = 1 + (aspectK(1.75, 2.2, 0.9) - 1) * 0.8;
    let back = 1.75 * ak, up = 1.45 * ak;
    for (let it = 0; it < 6; it++) {
      if (!blocked(S.x - dx * back, py + up, S.z - dz * back, S.x, py + 0.3, S.z)) break;
      back *= 0.82; up += 0.22;
    }
    want.set(S.x - dx * back, py + up, S.z - dz * back);
    want.y = Math.max(want.y, H(want.x, want.z) + 0.5);
    wantT.set(S.x + dx * 1.1, py + 0.02, S.z + dz * 1.1);
    if (snap) { rig.pos.copy(want); rig.target.copy(wantT); } else {
      rig.pos.lerp(want, 1 - Math.exp(-dt * rig.k));
      rig.target.lerp(wantT, 1 - Math.exp(-dt * (rig.k + 2)));
      rig.k = Math.min(4.4, rig.k + dt * 0.8);
      if (blocked(rig.pos.x, rig.pos.y, rig.pos.z, S.x, S.y + 0.35, S.z)) { rig.pos.lerp(want, 1 - Math.exp(-dt * 6)); rig.pos.y += dt * 1.2; }
    }
    // eye view: from the rider's seat, along the sledge (the slope's pitch included) + drag-look
    const e = R.eyeK;
    if (e > 0.001) {
      const yaw = S.h + R.look.yaw, pitch = -S.pitch * 0.8 + R.look.pitch;
      const cp = Math.cos(pitch);
      const ex = S.x - Math.sin(S.h) * 0.03, ey = S.y + 0.325, ez = S.z - Math.cos(S.h) * 0.03;
      const sm = e * e * (3 - 2 * e);
      rig.pos.lerp(V3.set(ex, ey, ez), sm);
      rig.target.lerp(V3b.set(ex + Math.sin(yaw) * cp * 3, ey - Math.sin(pitch) * 3, ez + Math.cos(yaw) * cp * 3), sm);
    }
    R.lens.w = e;
    R.lens.fov = 58 + 26 * (cam.portrait || 0);
    R.lens.near = 0.02;
  }
  const V3 = new THREE.Vector3(), V3b = new THREE.Vector3();
  function snapRig() { aimRig(0, true); }

  // ---------------------------------------------------------------- physics
  const EPS = 0.06;
  function step(dt) {
    S.t += dt; S.runT += dt;
    // input in the sledge's own frame (stick x steers, stick y pushes / brakes)
    const yaw = S.h + Math.PI;
    const mv = input.getMove(yaw, S.x, S.z); // (-sin yaw, -cos yaw) = heading
    const hx = Math.sin(S.h), hz = Math.cos(S.h), rx = -hz, rz = hx;
    const f = mv.x * hx + mv.y * hz, r = mv.x * rx + mv.y * rz;
    const brake = f < -0.3 ? Math.min(1, -f) : 0;
    const push = f > 0.3 ? f : 0;
    S.steer += (clamp(r * 1.2, -1, 1) - S.steer) * (1 - Math.exp(-dt * 6));
    // slope
    const gx = (H(S.x + EPS, S.z) - H(S.x - EPS, S.z)) / (2 * EPS), gz = (H(S.x, S.z + EPS) - H(S.x, S.z - EPS)) / (2 * EPS);
    const gmag = Math.hypot(gx, gz);
    S.vx -= G * gx * dt; S.vz -= G * gz * dt;
    // turn: right = heading decreases
    const turn = (0.8 + 0.7 * clamp(S.sp / 2, 0, 1)) * S.steer;
    S.h = wrap(S.h - turn * dt);
    // runners: sideways slip fades, drag, brake, push-off
    const nhx = Math.sin(S.h), nhz = Math.cos(S.h);
    let vf = S.vx * nhx + S.vz * nhz;
    let lx = S.vx - vf * nhx, lz = S.vz - vf * nhz;
    const lk = Math.exp(-dt * GRIP * (1 + brake));
    lx *= lk; lz *= lk;
    if (push && vf < 1.0) vf += 1.3 * push * dt;
    const flat = 1 - clamp(gmag / 0.12, 0, 1);
    const foot = clamp((S.z + 9.0) / 1.0, 0, 1); // extra friction over the last unit of snow
    vf *= Math.exp(-dt * (DRAG + FLAT_DRAG * flat + foot * 1.6 + brake * 2.4));
    if (vf > MAX_V) vf = MAX_V;
    S.vx = nhx * vf + lx; S.vz = nhz * vf + lz;
    S.sp = Math.hypot(S.vx, S.vz);
    S.maxV = Math.max(S.maxV, S.sp);
    // move + bump (the town's colliders, a little wider than the sledge)
    let nx = S.x + S.vx * dt, nz = S.z + S.vz * dt;
    let hit = false, bnx = 0, bnz = 0;
    probe.x = nx; probe.z = nz;
    colliders.resolve(probe, BODY_R, S.x, S.z);
    const dxp = probe.x - nx, dzp = probe.z - nz, dl = Math.hypot(dxp, dzp);
    if (dl > 0.003) { hit = true; bnx = dxp / dl; bnz = dzp / dl; nx = probe.x; nz = probe.z; }
    // soft hill edges
    if (nx < XMIN) { nx = XMIN; hit = true; bnx = 1; bnz = 0; } else if (nx > XMAX) { nx = XMAX; hit = true; bnx = -1; bnz = 0; }
    if (nz < ZMIN) { nz = ZMIN; hit = true; bnx = 0; bnz = 1; }
    if (nz > ZMAX) { nz = ZMAX; if (S.vz > 0) S.vz *= -0.15; }
    if (hit) {
      const vn = S.vx * bnx + S.vz * bnz;
      if (vn < 0) {
        S.vx -= 1.3 * vn * bnx; S.vz -= 1.3 * vn * bnz; // a gentle rebound
        S.vx *= 0.82; S.vz *= 0.82;
        if (-vn > 0.25 && S.bumpT <= 0) {
          S.bumpT = 0.7; S.bumps++; S.wob = 1;
          spray(nx - bnx * 0.15, H(nx, nz) + 0.35, nz - bnz * 0.15, 9, 0.55, 0.55, 0.05, 0.8);
          sfx('pop', { vol: 0.7 }); sfx('drop', { vol: 0.4 });
        }
      }
    }
    S.bumpT = Math.max(0, S.bumpT - dt);
    S.wob = Math.max(0, S.wob - dt * 1.3);
    S.x = nx; S.z = nz;
    S.sp = Math.hypot(S.vx, S.vz);
    const ty = H(S.x, S.z) + 0.042;
    S.y += (ty - S.y) * (1 - Math.exp(-dt * 18));
    if (Math.abs(ty - S.y) > 0.3) S.y = ty;
    // gradient along the heading (pitch) and a little drift sound / spray
    const nh2x = Math.sin(S.h), nh2z = Math.cos(S.h);
    S.pitch = Math.atan(gx * nh2x + gz * nh2z) * 0.9; // dh/ds < 0 downhill
    S.grade = gmag;
    if (S.sp > 0.3 && (Math.abs(S.steer) * S.sp > 0.9) && Math.random() < dt * 14) {
      const bx = S.x - nh2x * 0.22, bz = S.z - nh2z * 0.22;
      spray(bx, H(bx, bz) + 0.06, bz, 1, 0.35, 0.5, 0.025);
    }
    // whee
    S.whooT -= dt;
    if (S.sp > 2.0 && S.whooT <= 0) { S.whooT = 3.2; sfx('whoosh', { vol: 0.4 }); if (!S.cheered) { S.cheered = true; sfx('cheer', { vol: 0.35 }); } }
    // end of the run: rolled to a stop (at the bottom, or stuck anywhere for a moment)
    if (S.sp < 0.14 && !push && S.runT > 1.5) S.idleT += dt; else S.idleT = 0;
    if (!S.stopped && S.idleT > 1.1) {
      S.stopped = true;
      R.ui.classList.add('rs-stopped');
      if (S.z > -10.5) sfx('cheer', { vol: 0.4 });
    }
    if (S.stopped && S.sp > 0.3) { S.stopped = false; R.ui.classList.remove('rs-stopped'); }
  }

  // ---------------------------------------------------------------- render
  function apply(dt) {
    const { sled, rider } = R;
    const t = S.t;
    const wig = Math.sin(t * 26) * S.wob * 0.2;
    sled.position.set(S.x, S.y, S.z);
    sled.rotation.set(-S.pitch, S.h + S.steer * -0.12 + wig, S.steer * 0.1 * clamp(S.sp / 2, 0, 1) + Math.sin(t * 19) * S.wob * 0.08, 'YXZ');
    // sled pitch: nose down on the way down (pitch is dh/ds: negative downhill; rotation.x > 0 lowers the nose)
    player.pos.set(S.x, S.y, S.z);
    player.vel.set(0, 0);
    player.heading = S.h;
    player.object.position.copy(player.pos);
    const cheer = S.sp > 2.1 && Math.sin(t * 0.9) > 0.2;
    rider.yaw.rotation.y = 0;
    rider.body.position.y = -0.07 + (cheer ? Math.abs(Math.sin(t * 9)) * 0.012 : 0);
    rider.body.rotation.set(-0.08 + S.sp * 0.04, 0, S.steer * 0.12 + wig * 1.5);
    rider.legs[0].rotation.set(-1.42, 0, -0.06);
    rider.legs[1].rotation.set(-1.42, 0, 0.06);
    const flail = S.wob > 0.2 ? Math.sin(t * 22) * 0.6 * S.wob : 0;
    if (cheer) { rider.arms[0].rotation.set(-2.8 + Math.sin(t * 12) * 0.15, 0, -0.3); rider.arms[1].rotation.set(-2.8 - Math.sin(t * 12) * 0.15, 0, 0.3); }
    else { rider.arms[0].rotation.set(-1.0 + flail, 0, -0.15 - S.steer * 0.1); rider.arms[1].rotation.set(-1.0 - flail, 0, 0.15 - S.steer * 0.1); }
    rider.group.visible = R.eyeK < 0.8;
    // puffs
    const { pool, puffs, M, Q, V, SC } = R;
    for (let i = 0; i < NP; i++) {
      const p = pool[i];
      if (p.t >= p.life) { if (p.s !== -1) { puffs.setMatrixAt(i, M.compose(V.set(0, -20, 0), Q.identity(), SC.setScalar(0.0001))); p.s = -1; } continue; }
      p.t += dt; p.vy -= 1.4 * dt; p.vx *= Math.exp(-dt * 2.5); p.vz *= Math.exp(-dt * 2.5);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life, s = p.s * (0.6 + k * 0.9) * (1 - k * k);
      puffs.setMatrixAt(i, M.compose(V.set(p.x, p.y, p.z), Q.identity(), SC.setScalar(Math.max(0.0001, s))));
    }
    puffs.instanceMatrix.needsUpdate = true;
    // fade (walk back up)
    if (S.fadeDir !== 0) {
      S.fade = clamp(S.fade + S.fadeDir * dt * 3.2, 0, 1);
      R.ui.firstElementChild.style.opacity = String(S.fade);
      if (S.fadeDir > 0 && S.fade >= 1) { reset(); snapRig(); S.fadeDir = -1; sfx('whoosh', { vol: 0.3 }); }
      else if (S.fadeDir < 0 && S.fade <= 0) { S.fadeDir = 0; }
    }
  }
  function walkUp() { if (R && S.fadeDir === 0) { S.fadeDir = 1; sfx('step', { vol: 0.5 }); } }

  // ---------------------------------------------------------------- frame
  function update(dt) {
    if (!ride.active) return;
    if (game.state.phase !== 'play') { finish('hop'); return; }
    const d = Math.min(dt, 0.05);
    if (!(S.fadeDir > 0)) step(d);
    apply(d);
    aimRig(d);
    // the shot may have been replaced (a cinematic): take it back
    if (R && !cam.shotActive) startShot();
  }

  // ---------------------------------------------------------------- end
  /** why: 'hop' (put the player down here), 'cable' (the cable car takes over: leave the player alone) */
  function finish(why) {
    if (!ride.active) return;
    ride.active = false;
    ride.lastEnd = { why, t: S.t, stack: new Error().stack.split('\n').slice(1, 5).join(' | ') }; // debug aid for tests (window.__ctx.rides.list)
    const x = S.x, z = S.z, h = S.h;
    for (const o of R.offs) { try { o(); } catch (e) { /* ignore */ } }
    const [d, m, u] = R.listeners;
    window.removeEventListener('pointerdown', d, true);
    window.removeEventListener('pointermove', m, true);
    window.removeEventListener('pointerup', u, true);
    window.removeEventListener('pointercancel', u, true);
    R.ui.remove();
    engine.scene.remove(R.root);
    R.rider.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const o of R.disp) { try { o.dispose(); } catch (e) { /* gone */ } }
    R.puffs.dispose?.();
    if (cam.shotName === 'sled-ride') cam.release('sled-ride');
    R = null;
    player.object.visible = saved ? saved.visible !== false : true;
    if (why !== 'cable') {
      // step off beside the sledge, clear of pines
      const p = { x: x + Math.cos(h) * 0.32, z: z - Math.sin(h) * 0.32 };
      colliders.resolve(p, 0.14, x, z);
      player.teleport(p.x, p.z, h);
      player.object.position.copy(player.pos);
      player.controllable = game.state.phase === 'play';
    }
    input.clearTap();
    saved = null;
    ctx.rides.end(ride);
  }
  function stop() { finish('hop'); }

  window.__rideSled = {
    ride, S,
    board: () => board(),
    toggleView: () => toggleView(),
    walkUp: () => walkUp(),
    /** tests: fast-forward n seconds with a fixed stick (x right, y up) */
    sim(sec, jx = 0, jy = 0) { input.setJoystick(jx, jy); for (let i = 0; i < sec * 30 && ride.active; i++) { step(1 / 30); if (ride.active) { apply(1 / 30); aimRig(1 / 30); } } return ride.active ? { x: +S.x.toFixed(2), z: +S.z.toFixed(2), sp: +S.sp.toFixed(2), bumps: S.bumps, stopped: S.stopped, maxV: +S.maxV.toFixed(2), t: +S.runT.toFixed(1) } : { active: false }; },
  };
  return ride;
}
