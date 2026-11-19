// Free-play ride: the Ferris wheel by Frostmere Lake (see src/rides/index.js for the ride contract).
//
// Walk up to the wheel's boarding mat (beside Otto's ticket booth) → "Ride the Ferris wheel". The wheel slows and brings
// the next gondola down to the mat, the doll walks over and hops in (seated, visible from outside), then the wheel takes
// it round twice, slowly (~0.2 rad/s), with a 6 s pause at the very top on the second turn (~75 s in all). The wheel is
// driven through city/lakeside.js (getFerris().driver); the gondolas stay level and swing a little with the wheel.
//
// Camera (one long playShot, released at the end): the gameplay camera glides to a close boarding view, then zooms into
// the gondola and the rider's eyes: eye level from the seat with a wide lens (shot.lens), no tilt-shift, the gondola's
// gentle swing; drag / swipe (or arrow keys) looks around. Before the first drag the gaze drifts on its own from the
// lake (bottom) to the market tree and the town (top). "View" toggles an outside view of the whole wheel (drag orbits).
// "Hop off" (or Esc): at the bottom you step out at once; anywhere else the wheel brings you down quickly (shortest way,
// up to ~5 s) and you step out onto the mat.
//
// Shared bits for the carousel (UI bar, drag look, small maths) are exported from here.
import * as THREE from 'three';
import { SEAT_DROP } from '../core/player.js';
import { getFerris } from '../city/lakeside.js';
import { icon } from '../ui/icons.js';
import { W4 } from './flag.js';
import './rides-wheel.css';

const TAU = Math.PI * 2;
const SHOT = 'rideFerris';
const BOTTOM = -Math.PI / 2; // gondola angle at the bottom of the wheel
const SPIN = -1; // the wheel turns clockwise seen from its front: riders rise on the town (west) side
const RIDE_W = 0.2, RIDE_A = 0.07; // ride speed (rad/s) and acceleration
const TOP_PAUSE = 6;
// Riding together (W4): each gondola has two places on its bench, seat s = gondola * 2 + j. Alone you sit in the middle;
// with somebody beside you, j = 0 slides to −x and j = 1 to +x (gondola-local, facing +z).
const PER = 2, PAIR_X = 0.085;

export const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
export const mod = (a, m) => ((a % m) + m) % m;
export const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export const dollK = (player) => { const ch = player.character; return (ch?.group?.scale.x || 1.15) * (ch?.yaw?.scale.x || 0.9); };
/** Doll eye height above its root (buildCharacter eyes at 0.268 design units). */
export const EYE_H = 0.268;

/**
 * The ride's DOM: a bottom-right bar with a big "Hop off" button and a round "View" toggle, plus a hint line.
 * Returns { setView(mode), setHop(text, enabled), hint(text, ms), dispose() }.
 */
export function rideUI(ctx, { onHop, onView, cls = '' }) {
  const el = document.createElement('div');
  el.className = 'rw-ui ' + cls;
  el.innerHTML = `<div class="rw-hint" hidden></div>
    <div class="rw-bar">
      <button class="knit-btn cream rw-view" type="button" aria-label="Change view"><span class="rw-ico"></span><span class="rw-lbl">View</span></button>
      <button class="knit-btn rw-hop" type="button"><span class="rw-ico">${icon('arrow')}</span><span class="rw-lbl">Hop off</span></button>
    </div>`;
  ctx.uiRoot.appendChild(el);
  const hop = el.querySelector('.rw-hop'), view = el.querySelector('.rw-view'), hintEl = el.querySelector('.rw-hint');
  const stop = (e) => { e.stopPropagation(); };
  for (const b of [hop, view]) { b.addEventListener('pointerdown', stop); }
  hop.addEventListener('click', (e) => { e.stopPropagation(); if (!hop.disabled) { ctx.audio?.sfx?.('ui'); onHop(); } });
  view.addEventListener('click', (e) => { e.stopPropagation(); ctx.audio?.sfx?.('ui'); onView(); });
  let hintT = null;
  requestAnimationFrame(() => el.classList.add('rw-in'));
  return {
    el,
    setView(mode) {
      // the button shows where it takes you: the eye (seat view) from outside, the camera (outside) from the seat
      view.querySelector('.rw-ico').innerHTML = icon(mode === 'eye' ? 'camera' : 'eye');
      view.setAttribute('aria-label', mode === 'eye' ? 'Outside view' : 'Seat view');
    },
    setHop(text, enabled = true) { hop.querySelector('.rw-lbl').textContent = text; hop.disabled = !enabled; hop.classList.toggle('rw-busy', !enabled); },
    hint(text, ms = 3500) {
      clearTimeout(hintT);
      hintEl.textContent = text; hintEl.hidden = false;
      hintEl.classList.remove('rw-show'); void hintEl.offsetWidth; hintEl.classList.add('rw-show');
      hintT = setTimeout(() => { hintEl.classList.remove('rw-show'); hintT = setTimeout(() => { hintEl.hidden = true; }, 400); }, ms);
    },
    dispose() { clearTimeout(hintT); el.remove(); },
  };
}

/** Drag / swipe on the canvas (and arrow keys / A D W S) → look deltas. consume() returns { x, y, keyX, keyY, any }. */
export function dragLook(canvas) {
  const acc = { x: 0, y: 0 };
  const drags = new Map();
  const keys = new Set();
  const down = (e) => { if (e.button != null && e.button > 0) return; drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const move = (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    const s = Math.max(1, Math.min(window.innerWidth, window.innerHeight));
    acc.x += (e.clientX - d.x) / s; acc.y += (e.clientY - d.y) / s;
    d.x = e.clientX; d.y = e.clientY;
  };
  const up = (e) => drags.delete(e.pointerId);
  const KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'];
  const kd = (e) => { const k = e.key.toLowerCase(); if (KEYS.includes(k) && e.target?.tagName !== 'INPUT') keys.add(k); };
  const ku = (e) => keys.delete(e.key.toLowerCase());
  const blur = () => { keys.clear(); drags.clear(); };
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  return {
    consume() {
      const kx = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
      const ky = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
      const o = { x: acc.x, y: acc.y, keyX: kx, keyY: ky, any: acc.x !== 0 || acc.y !== 0 || kx !== 0 || ky !== 0 };
      acc.x = 0; acc.y = 0;
      return o;
    },
    get dragging() { return drags.size > 0; },
    dispose() {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    },
  };
}

/** Pick the first camera spot (world, relative to `from`) with a clear line of sight to `from`; ignore(o) skips objects. */
export function clearSpot(engine, from, list, ignore) {
  const ray = new THREE.Raycaster(), d = new THREE.Vector3();
  for (const p of list) {
    d.copy(p).sub(from);
    const len = d.length();
    ray.set(from, d.normalize()); ray.near = 0.6; ray.far = len;
    let hit = false;
    try { hit = ray.intersectObjects(engine.scene.children, true).some((h) => !ignore(h.object)); } catch (e) { hit = false; }
    if (!hit) return p;
  }
  return list[0];
}

export function createFerrisWheelRide(ctx) {
  const { game, interact, player, cam, engine, input } = ctx;
  const canvas = engine.renderer.domElement;
  let R = null; // the running ride
  const ride = {
    id: 'ferris',
    get active() { return !!R; },
    update,
    stop() { if (R) finish(true); },
    /** Diagnostics / tests: { phase, k, t, view, turns }. */
    get state() { const f = getFerris(); return R ? { phase: R.phase, k: R.k, j: R.j, t: +R.T.toFixed(1), view: R.view, turns: f && R.ang0 != null ? +(Math.abs(f.ang - R.ang0) / TAU).toFixed(2) : 0 } : null; },
    /** Tests: hop off / toggle the view without the DOM. */
    hopOff: () => requestLeave(),
    toggleView: () => toggleView(),
  };

  const f0 = getFerris();
  const NS = (f0?.NC || 10) * PER;
  const offs = new Float32Array(NS); // smoothed side shift per seat (gondola-local x)
  const seatX = (s) => (W4 ? offs[s] : 0);
  const free = (k, taken) => [0, 1].filter((j) => !taken.has(k * PER + j));
  const spot = f0 && interact.add({
    id: 'ride-ferris', x: f0.toWorld(-0.05, 1.12)[0], z: f0.toWorld(-0.05, 1.12)[1], r: 0.75, label: 'Ride the Ferris wheel', icon: 'sparkle',
    enabled: () => game.state.phase === 'play' && !R && (ctx.rides?.active ?? null) === null && !!getFerris()?.shown && !ctx.minigames?.active,
    onInteract: () => start(),
  });
  if (!f0) console.warn('[rides] ferris: no wheel found (lakeside not built)');
  const canStart = () => game.state.phase === 'play' && !R && (ctx.rides?.active ?? null) === null && !!getFerris()?.shown && !ctx.minigames?.active;
  const SEATED = ['settle', 'up', 'top', 'down', 'return'];
  const _p = new THREE.Vector3(), _m = new THREE.Matrix4();
  /** Riding together (src/rides/together.js). */
  ride.seats = {
    n: NS,
    mine: () => (R && SEATED.includes(R.phase) ? R.k * PER + R.j : null),
    /** The other place in the same gondola, then the gondolas either side, and so on round the wheel. */
    near(s) {
      const k = Math.floor(s / PER), out = [s ^ 1], NC = NS / PER;
      for (let d = 1; d <= NC / 2; d++) for (const kk of [mod(k + d, NC), mod(k - d, NC)]) { if (!out.includes(kk * PER)) out.push(kk * PER, kk * PER + 1); }
      return out.filter((q) => q !== s);
    },
    tick(dt, occ) {
      const kt = 1 - Math.exp(-dt * 5);
      for (let s = 0; s < NS; s++) {
        const goal = occ && occ.has(s) && occ.has(s ^ 1) ? (s % PER ? PAIR_X : -PAIR_X) : 0;
        offs[s] += (goal - offs[s]) * kt;
        if (Math.abs(goal - offs[s]) < 1e-4) offs[s] = goal;
      }
    },
    pose(s, out) {
      const f = getFerris();
      if (!f || !f.shown) return null;
      const k = Math.floor(s / PER);
      f.gondolaMatrix(k, _m);
      _p.set(f.seat.x + offs[s], f.seat.y - SEAT_DROP * dollK(player), f.seat.z).applyMatrix4(_m);
      out.x = _p.x; out.y = _p.y; out.z = _p.z; out.h = f.YAW;
      out.roll = f.swing(k); // the gondola's swing (about the wheel's axis, i.e. the doll's local z)
      out.pose = 'bench';
      return out;
    },
    /** Board beside seat s: its gondola if there is a free place, else the nearest gondola with one. */
    join(s, taken) {
      if (!canStart()) return false;
      const NC = NS / PER, k0 = Math.floor(s / PER);
      for (let d = 0; d <= NC / 2; d++) {
        for (const k of d ? [mod(k0 + d, NC), mod(k0 - d, NC)] : [k0]) {
          const js = free(k, taken);
          if (js.length) { start({ k, j: js.includes(s ^ 1) && k === k0 ? s ^ 1 : js[0], join: true }); return !!R; }
        }
      }
      return false;
    },
    where: () => (spot ? { x: spot.x, z: spot.z, h: (getFerris()?.YAW ?? 0) + Math.PI } : null),
    spots: spot ? [spot] : [],
  };

  // ------------------------------------------------------------------ wheel driver (called by lakeside's update, order 5)
  /** Moves the wheel towards R.target (direction R.dir) with speed ≤ R.vmax and accel R.acc; R.hold keeps it still. */
  function drive(dt) {
    const f = getFerris();
    if (!R || R.hold) { f.speed = 0; return; }
    let v = f.speed * R.dir; // speed along the wanted direction
    if (v < -1e-4) { v = Math.min(0, v + R.acc * dt); f.ang += R.dir * v * dt; f.speed = R.dir * v; return; } // turning round: brake first
    const rem = (R.target - f.ang) * R.dir;
    if (rem <= 1e-5) { f.ang = R.target; f.speed = 0; R.arrived = true; return; }
    const vc = Math.min(R.vmax, Math.sqrt(2 * R.acc * rem));
    v = v < vc ? Math.min(vc, Math.max(0, v) + R.acc * dt) : vc;
    const step = Math.min(rem, v * dt);
    f.ang += R.dir * step; f.speed = R.dir * v;
    if (rem - step <= 1e-5) { f.ang = R.target; f.speed = 0; R.arrived = true; }
  }
  function moveTo(target, vmax, acc, dir = 1) { R.target = target; R.vmax = vmax; R.acc = acc; R.dir = dir; R.arrived = false; R.hold = false; }

  // ------------------------------------------------------------------ start / leave / finish
  /** pref (riding together): { k, j, join } = this gondola and place (the wheel may turn back to bring it down). */
  function start(pref = null) {
    const f = getFerris();
    if (R || !f || !f.shown) return;
    // the next gondola that can still stop at the bottom without braking hard
    const accB = 0.25, stopD = (Math.max(0, f.speed * SPIN) ** 2) / (2 * accB) + 0.02;
    const taken = W4 ? (ctx.rides?.takenByOthers?.('ferris') || new Set()) : new Set();
    let k = 0, best = Infinity, dir = SPIN, j = 0;
    for (let i = 0; i < f.NC; i++) {
      if (taken.has(i * PER) && taken.has(i * PER + 1)) continue; // full (riding together)
      let d = mod(SPIN * (BOTTOM - f.gondolaAngle(i)), TAU); // still to go, turning the way the wheel turns
      if (d < stopD) d += TAU;
      if (d < best) { best = d; k = i; }
    }
    if (W4 && !pref) j = free(k, taken)[0] ?? 0;
    if (pref) {
      // a friend's gondola: bring it down whichever way round is shorter
      k = pref.k; j = pref.j;
      const fwd = mod(SPIN * (BOTTOM - f.gondolaAngle(k)), TAU), back = TAU - fwd;
      if (fwd <= back + 0.4) best = fwd; // (just short of the bottom: the wheel brakes a little harder)
      else { best = back; dir = -SPIN; } // (turning round: the driver brakes first)
    }
    R = {
      k, j, phase: 'approach', t: 0, T: 0, view: 'eye', ang0: null, leave: false, walked: false,
      target: 0, vmax: 0.4, acc: accB, dir: 1, hold: false, arrived: false,
      from: new THREE.Vector3(), wasEye: cam.view === 'eye',
      look: dragLook(canvas), manual: false, yaw: 0, pitch: -0.1, yawS: null, pitchS: -0.1, orbit: 0, orbitS: 0,
      eyeK: 0, wideK: 0, offEsc: null, ui: null,
    };
    moveTo(f.ang + dir * best, 0.4, accB, dir);
    f.driver = drive;
    ctx.rides?.begin(ride);
    player.controllable = false;
    input.clearTap?.();
    player.walkTo(f.board.x, f.board.z).then(() => { if (R) R.walked = true; });
    R.ui = rideUI(ctx, { onHop: requestLeave, onView: toggleView, cls: 'rw-ferris' });
    R.ui.setView(R.view);
    R.ui.setHop('Hop off', true);
    R.offEsc = game.on('ui:escape', () => requestLeave());
    ctx.audio?.sfx?.('bell', { x: f.x, z: f.z, vol: 0.7 });
    cam.playShot(rideShot());
  }

  function toggleView() {
    if (!R) return;
    R.view = R.view === 'eye' ? 'out' : 'eye';
    R.ui?.setView(R.view);
    if (R.view === 'eye' && !R.manual) R.ui?.hint('Drag to look around');
    if (R.view === 'out') R.ui?.hint('Drag to move round the wheel', 2500);
  }

  function requestLeave() {
    if (!R) return;
    const f = getFerris();
    const ph = R.phase;
    if (ph === 'approach') { player.walkTo(player.pos.x, player.pos.z); finish(false); return; }
    if (ph === 'alight' || ph === 'return') return;
    if (ph === 'hop' || ph === 'settle') { beginAlight(); return; }
    // in the air: the wheel brings the gondola down the shorter way (forward unless backward is much shorter)
    const a = f.gondolaAngle(R.k), df = mod(SPIN * (BOTTOM - a), TAU), db = TAU - df;
    if (Math.min(df, db) < 0.03 && Math.abs(f.speed) < 0.05) { beginAlight(); return; }
    const fwd = df <= db + 0.5;
    moveTo(f.ang + (fwd ? SPIN * df : -SPIN * db), 0.85, 0.35, fwd ? SPIN : -SPIN);
    R.phase = 'return'; R.t = 0;
    R.ui?.setHop('Coming down…', false);
  }

  function beginAlight() {
    R.phase = 'alight'; R.t = 0; R.hold = true;
    R.ui?.setHop('Hopping off…', false);
    ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z, vol: 0.6 });
  }

  function finish(forced) {
    const f = getFerris(), r = R;
    if (!r) return;
    R = null;
    if (f && f.driver === drive) f.driver = null; // the wheel spins back up to its idle speed on its own
    r.look.dispose();
    r.ui?.dispose();
    r.offEsc?.();
    const ch = player.character;
    if (ch) { ch.seated = false; ch.yaw.visible = true; }
    player.object.rotation.set(0, 0, 0);
    const play = game.state.phase === 'play';
    if (play && f) {
      player.teleport(f.board.x, f.board.z, f.YAW);
      player.object.position.copy(player.pos);
    }
    input.clearTap?.();
    if (play) player.controllable = true;
    cam.release(SHOT);
    ctx.rides?.end(ride);
    if (!forced) ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z, vol: 0.5 });
  }

  // ------------------------------------------------------------------ per frame (order 50: after the wheel moved)
  const M = new THREE.Matrix4(), seatW = new THREE.Vector3(), boardW = new THREE.Vector3(), tmp = new THREE.Vector3();
  function seatWorld(out) {
    const f = getFerris();
    f.gondolaMatrix(R.k, M);
    return out.set(f.seat.x + seatX(R.k * PER + R.j), f.seat.y - SEAT_DROP * dollK(player), f.seat.z).applyMatrix4(M);
  }
  function update(dt) {
    if (!R) return;
    const f = getFerris();
    if (!f || game.state.phase !== 'play' || !f.shown) { finish(true); return; }
    R.t += dt; R.T += dt;
    input.clearTap?.();
    const ch = player.character;
    boardW.set(f.board.x, 0.19, f.board.z);
    switch (R.phase) {
      case 'approach': {
        if (R.t > 2.5 && !R.walked) { player.walkTo(player.pos.x, player.pos.z); player.teleport(f.board.x, f.board.z, f.YAW + Math.PI); R.walked = true; }
        if (R.arrived && R.walked && R.t > 0.6) {
          R.phase = 'hop'; R.t = 0; R.hold = true;
          R.from.copy(player.pos);
          ctx.audio?.sfx?.('pop', { x: f.x, z: f.z, vol: 0.6 });
        }
        return;
      }
      case 'hop': {
        const s = ss(R.t / 0.6);
        seatWorld(seatW);
        player.pos.lerpVectors(R.from, seatW, s);
        player.pos.y += Math.sin(Math.PI * s) * 0.22;
        player.heading = angLerp(f.YAW + Math.PI, f.YAW, ss((R.t - 0.1) / 0.4)); // turns round in the air to sit facing out
        if (ch) { ch.seated = s > 0.55; ch.yaw.rotation.y = player.heading; }
        player.vel.set(0, 0);
        player.object.position.copy(player.pos);
        if (R.t >= 0.6) { R.phase = 'settle'; R.t = 0; }
        return;
      }
      case 'settle':
        if (R.t > 0.9) { R.ang0 = f.ang; moveTo(f.ang + SPIN * 3 * Math.PI, RIDE_W, RIDE_A, SPIN); R.phase = 'up'; R.t = 0; }
        break;
      case 'up':
        if (R.arrived) { R.phase = 'top'; R.t = 0; R.hold = true; ctx.audio?.sfx?.('bell', { x: f.x, z: f.z, vol: 0.45 }); if (R.view === 'eye' && !R.manual) R.ui?.hint('The whole of Tinselby!', 3000); }
        break;
      case 'top':
        if (R.t > TOP_PAUSE) { moveTo(f.ang + SPIN * Math.PI, RIDE_W, RIDE_A, SPIN); R.phase = 'down'; R.t = 0; }
        break;
      case 'down':
      case 'return':
        if (R.arrived) beginAlight();
        break;
      case 'alight': {
        const s = ss(R.t / 0.55);
        seatWorld(seatW);
        player.pos.lerpVectors(seatW, boardW, s);
        player.pos.y += Math.sin(Math.PI * s) * 0.2;
        player.heading = f.YAW;
        if (ch) { ch.seated = s < 0.45; ch.yaw.rotation.y = f.YAW; }
        player.object.position.copy(player.pos);
        player.object.rotation.set(0, 0, 0);
        if (R.t >= 0.55) finish(false);
        return;
      }
      default: break;
    }
    // seated: ride with the gondola (position + its swing), facing out over the lake (+z)
    seatWorld(seatW);
    player.pos.copy(seatW);
    player.vel.set(0, 0);
    player.heading = f.YAW;
    player.object.position.copy(seatW);
    player.object.rotation.set(0, f.YAW, 0); // the root yaws with the wheel so the swing (about the wheel's z) is right
    player.object.rotateZ(f.swing(R.k));
    if (ch) { ch.seated = true; ch.yaw.rotation.y = 0; }
  }

  // ------------------------------------------------------------------ camera
  function rideShot() {
    const f = getFerris();
    const lens = { w: 1, fov: 40, near: 0.1 };
    const post = { band: 0.35, falloff: 0.5 };
    const hub = new THREE.Vector3(f.x, f.HUB + 0.03, f.z);
    const tree = ctx.city?.tree?.pos || new THREE.Vector3(ctx.layout.MARKET.tree.x, 1.5, ctx.layout.MARKET.tree.z);
    const lake = ctx.layout.LAKE.center;
    // outside spot: in front of the wheel (+z), out over the ice if the line of sight is clear
    const ignore = (o) => {
      if (o.isPoints || o.isLine || o.isSprite || !o.visible) return true;
      for (let p = o; p; p = p.parent) if (p === player.object || p === f.root) return true;
      return false;
    };
    const cands = [-0.15, 0.15, -0.45, 0.4].map((d) => new THREE.Vector3(f.x + Math.sin(f.YAW + d) * 7, 2.6, f.z + Math.cos(f.YAW + d) * 7));
    const pick = clearSpot(engine, hub, cands, ignore);
    const theta = Math.atan2(pick.x - f.x, pick.z - f.z);
    const eyeL = new THREE.Vector3(), eyeP = new THREE.Vector3(), headP = new THREE.Vector3(), gaze = new THREE.Vector3();
    const outP = new THREE.Vector3(), outT = new THREE.Vector3(), porch = new THREE.Vector3(), gondP = new THREE.Vector3();
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    let hintShown = false;
    return {
      name: SHOT, duration: 1e5, blendIn: 1.1, blendOut: 1.0, skippable: false, tilt: 0.7, portrait: false, post, lens,
      update(_u, out, info) {
        const r = R;
        const dt = Math.min(0.1, info?.dt ?? 1 / 60);
        if (!r) return; // finishing: the director blends back from the last pose
        const pr = cam.portrait || 0, aspect = Math.max(0.3, cam.aspect || 1.6);
        const k = dollK(player);
        f.gondolaMatrix(r.k, M);
        const sx = f.seat.x + seatX(r.k * PER + r.j);
        eyeL.set(sx, f.seat.y - SEAT_DROP * k + EYE_H * k + 0.004, f.seat.z + 0.025);
        eyeP.copy(eyeL).applyMatrix4(M);
        headP.set(sx, f.seat.y - SEAT_DROP * k + 0.25 * k, f.seat.z).applyMatrix4(M);
        f.pivotWorld(r.k, gondP); gondP.y -= 0.4;
        // ---- look input: eye = gaze (yaw / pitch), outside = orbit round the wheel
        const L = r.look.consume();
        const seated = r.phase === 'settle' || r.phase === 'up' || r.phase === 'top' || r.phase === 'down' || r.phase === 'return';
        const yawTo = (x, z) => Math.atan2(x - eyeP.x, z - eyeP.z);
        const ga = f.gondolaAngle(r.k), hgt = (1 - Math.cos(ga - BOTTOM)) / 2; // 0 bottom … 1 top
        // out over the lake at the bottom; rising on the town side and at the top, the market tree and the town; coming
        // down the far side (looking across would cut through the wheel) back towards the lake
        const westK = ss((0.6 - Math.cos(ga)) / 0.9);
        let autoYaw = angLerp(yawTo(lake.x, lake.z), yawTo(tree.x, tree.z), ss(hgt * 1.3) * westK) + Math.sin(r.T * 0.21) * 0.1;
        // riding together: a friend beside you fills half the frame from 17 cm, so the drifting gaze stays within ~45° of
        // straight out on their side (dragging still looks anywhere)
        const pairK = W4 ? Math.abs(seatX(r.k * PER + r.j)) / PAIR_X : 0;
        if (pairK > 0) {
          const side = seatX(r.k * PER + r.j) < 0 ? 1 : -1; // the friend's side: +1 = gondola-local +x (world yaw YAW + π/2)
          const d = Math.atan2(Math.sin(autoYaw - f.YAW), Math.cos(autoYaw - f.YAW));
          if (d * side > 0.8) autoYaw = angLerp(autoYaw, f.YAW + side * 0.8, Math.min(1, pairK));
        }
        // looking down onto the town from up high also keeps the front rim's arc (10-25° above the eye line at the top)
        // out of the frame; portrait's taller view needs a little more
        const autoPitch = -0.05 - (0.27 + 0.07 * pr) * hgt;
        if (r.view === 'eye' && r.eyeK > 0.6) {
          if (L.any && !r.manual) { r.manual = true; r.yaw = r.yawS ?? autoYaw; r.pitch = r.pitchS; }
          if (r.manual) {
            r.yaw -= L.x * 2.0 + L.keyX * 1.5 * dt;
            r.pitch = Math.max(-1.0, Math.min(0.45, r.pitch - L.y * 1.5 - L.keyY * 1.0 * dt));
          }
        } else if (r.view === 'out') {
          r.orbit = Math.max(-1.1, Math.min(1.1, r.orbit - L.x * 2.0 - L.keyX * 1.0 * dt));
        }
        const gy = r.manual ? r.yaw : autoYaw, gp = r.manual ? r.pitch : autoPitch;
        const kt = 1 - Math.exp(-dt * 10);
        r.yawS = r.yawS == null ? gy : angLerp(r.yawS, gy, kt);
        r.pitchS += (gp - r.pitchS) * kt;
        r.orbitS += (r.orbit - r.orbitS) * kt;
        gaze.set(Math.sin(r.yawS) * Math.cos(r.pitchS), Math.sin(r.pitchS), Math.cos(r.yawS) * Math.cos(r.pitchS));
        // ---- blends: eyeK (outside ↔ seat), wideK (boarding close-up ↔ the whole wheel)
        const wantEye = r.view === 'eye' && (seated && !(r.phase === 'settle' && r.t < 0.35)) ? 1 : 0;
        const wantWide = seated ? 1 : 0;
        r.eyeK += (wantEye - r.eyeK) * (1 - Math.exp(-dt * 1.6)); if (Math.abs(wantEye - r.eyeK) < 0.002) r.eyeK = wantEye;
        r.wideK += (wantWide - r.wideK) * (1 - Math.exp(-dt * 1.2)); if (Math.abs(wantWide - r.wideK) < 0.002) r.wideK = wantWide;
        if (r.eyeK > 0.95 && !hintShown && !r.manual) { hintShown = true; r.ui?.hint('Drag to look around'); }
        // ---- outside pose (portrait: pull back so the wheel keeps its width)
        const fovOut = 40 + 14 * pr, tH = Math.tan(THREE.MathUtils.degToRad(fovOut / 2));
        const dWide = Math.min(13, Math.max(5.5, 2.2 / (tH * aspect))), dClose = Math.min(6.5, Math.max(2.7, 0.75 / (tH * aspect)));
        const th = theta + r.orbitS, w = ss(r.wideK);
        const D = dClose + (dWide - dClose) * w;
        outP.set(f.x + Math.sin(th) * D, 0.85 + (1.15 + gondP.y * 0.35) * w, f.z + Math.cos(th) * D);
        p0.set(f.board.x, 0.42, f.board.z).lerp(tmp.set(f.x, 0.42, f.z), 0.4); // boarding: the mat and the bottom gondola
        p1.copy(hub).lerp(gondP, 0.5);
        outT.copy(p0).lerp(p1, w);
        // ---- the seat: a curve from outside to just in front of the rider's face, into the eyes, turning to the gaze
        const e = ss(r.eyeK);
        porch.copy(eyeP); porch.y += 0.07; porch.x += Math.sin(f.YAW) * 0.6; porch.z += Math.cos(f.YAW) * 0.6;
        if (e <= 0.0005) { out.pos.copy(outP); out.target.copy(outT); }
        else {
          const a = 1 - e;
          out.pos.set(a * a * outP.x + 2 * a * e * porch.x + e * e * eyeP.x, a * a * outP.y + 2 * a * e * porch.y + e * e * eyeP.y, a * a * outP.z + 2 * a * e * porch.z + e * e * eyeP.z);
          tmp.copy(eyeP).addScaledVector(gaze, 4);
          out.target.copy(outT).lerp(headP, ss(e / 0.5)).lerp(tmp, ss((e - 0.45) / 0.55));
        }
        // the doll hides while the camera is inside (or just behind) its head
        const ch = player.character;
        if (ch) ch.yaw.visible = out.pos.distanceTo(headP) > 0.36;
        lens.fov = fovOut + (62 + 16 * pr - fovOut) * e; // wide eye lens (portrait: ~45° across a tall phone)
        lens.near = 0.1 + (0.02 - 0.1) * e;
        post.band = 0.35 + 0.7 * e;
        post.falloff = 0.5 + 0.15 * e;
        post.bloom = 1 - 0.12 * e;
      },
    };
  }

  return ride;
}
