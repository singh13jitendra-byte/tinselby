// Free-play ride: the carousel in Market Square (see src/rides/index.js for the ride contract).
//
// Stand by the carousel → "Ride the carousel". It slows to a stop, the doll walks to the edge by the nearest horse and
// hops into the saddle (legs either side, mittens on the pole), and the carousel goes round three times (~70 s) with
// the horses bobbing, then stops and lets the rider down at the edge. "Hop off" (or Esc) stops it early (about a second
// of braking) and the rider steps down beside the horse. The rotor is driven through city/market.js (getCarousel().driver).
// Sound: a music-box flourish ('gift') as it starts and every time round, soft chimes in between, sleigh bells as it stops.
//
// Camera: a ride-along view by default: the camera turns with the rotor just outside the platform,
// a little ahead of your horse, so the doll and its horse stay put on screen (bobbing up and down) while the market
// glides by behind. Drag / arrow keys circle the camera round the rider (front, side, back). "View" switches to eye level
// from the saddle (drag to look; the look stays relative to the horse).
// Why not eye level by default (the Ferris wheel's is): on the carousel the view itself turns all the time (17°/s
// even at the ride's slower 0.3 rad/s; idle is 0.42), and the neighbouring poles and horses sweep past a few cm from
// the lens; on a phone that reads as a constant pan with flicker, with nothing steady to look at. Riding along keeps a
// steady subject (you) in the frame, which is the comfortable way to watch a turning world, and it shows what a
// carousel ride is about: you on a bobbing horse. Eye level stays one tap away (only 40% of the bob reaches it and the
// horizon stays level).
import * as THREE from 'three';
import { getCarousel } from '../city/market.js';
import { rideUI, dragLook, ss, angLerp, dollK, EYE_H } from './ferris.js';

const SHOT = 'rideCarousel';
const RIDE_W = 0.3, RIDE_TURNS = 3;
const EDGE_R = 1.26; // where riders step on / off (carousel collider r 1.12)

export function createCarouselRide(ctx) {
  const { game, interact, player, cam, engine, input } = ctx;
  const canvas = engine.renderer.domElement;
  let R = null;
  const ride = {
    id: 'carousel',
    get active() { return !!R; },
    update,
    stop() { if (R) finish(true); },
    get state() { return R ? { phase: R.phase, k: R.k, t: +R.T.toFixed(1), view: R.view, turns: +(R.turned / (Math.PI * 2)).toFixed(2) } : null; },
    hopOff: () => requestLeave(),
    toggleView: () => toggleView(),
  };
  const c0 = getCarousel();
  if (c0) interact.add({
    id: 'ride-carousel', x: c0.x + 0.15, z: c0.z + 1.4, r: 0.8, label: 'Ride the carousel', icon: 'hoof',
    enabled: () => game.state.phase === 'play' && !R && (ctx.rides?.active ?? null) === null && !!getCarousel()?.shown && !ctx.minigames?.active,
    onInteract: () => start(),
  });
  else console.warn('[rides] carousel: not found (market not built)');

  function drive(dt) {
    const c = getCarousel();
    if (!R) return;
    const d = R.goal - c.speed, a = R.acc * dt;
    c.speed += Math.max(-a, Math.min(a, d));
  }

  function start() {
    const c = getCarousel();
    if (R || !c || !c.shown) return;
    R = {
      phase: 'slow', t: 0, T: 0, k: 0, view: 'out', goal: 0, acc: 0.35, turned: 0, walked: false,
      from: new THREE.Vector3(), edge: new THREE.Vector3(), look: dragLook(canvas), manual: false, rel: null, relS: null,
      pitch: -0.06, pitchS: -0.06, orbit: 0, orbitS: 0, eyeK: 0, wideK: 0, ui: null, offEsc: null,
    };
    c.driver = drive;
    ctx.rides?.begin(ride);
    player.controllable = false;
    input.clearTap?.();
    player.faceTowards(c.x, c.z);
    R.ui = rideUI(ctx, { onHop: requestLeave, onView: toggleView, cls: 'rw-carousel' });
    R.ui.setView(R.view);
    R.ui.setHop('Hop off', true);
    R.offEsc = game.on('ui:escape', () => requestLeave());
    ctx.audio?.sfx?.('bell', { x: c.x, z: c.z, vol: 0.6 });
    cam.playShot(rideShot());
  }

  function toggleView() {
    if (!R) return;
    R.view = R.view === 'eye' ? 'out' : 'eye';
    R.ui?.setView(R.view);
    R.ui?.hint(R.view === 'eye' ? 'Drag to look around' : 'Drag to circle round your horse', 2500);
  }

  function requestLeave() {
    if (!R) return;
    const ph = R.phase;
    if (ph === 'slow' || ph === 'walk') { player.walkTo(player.pos.x, player.pos.z); finish(false); return; }
    if (ph === 'hop' || ph === 'settle') { beginAlight(); return; }
    if (ph === 'ride') { R.phase = 'stop'; R.t = 0; R.goal = 0; R.acc = 0.32; R.ui?.setHop('Stopping…', false); }
  }

  function beginAlight() {
    const c = getCarousel();
    R.phase = 'alight'; R.t = 0;
    // step down at the edge beside the horse
    c.horseMatrix(R.k, M); hp.setFromMatrixPosition(M);
    const dx = hp.x - c.x, dz = hp.z - c.z, l = Math.hypot(dx, dz) || 1;
    R.edge.set(c.x + (dx / l) * EDGE_R, 0, c.z + (dz / l) * EDGE_R);
    R.edge.y = ctx.colliders.heightAt(R.edge.x, R.edge.z);
    R.ui?.setHop('Hopping off…', false);
    ctx.audio?.sfx?.('pop', { x: c.x, z: c.z, vol: 0.55 });
  }

  function finish(forced) {
    const c = getCarousel(), r = R;
    if (!r) return;
    R = null;
    if (c) { if (c.driver === drive) c.driver = null; c.rider = null; }
    r.look.dispose();
    r.ui?.dispose();
    r.offEsc?.();
    const ch = player.character;
    if (ch) { ch.seated = false; ch.yaw.visible = true; resetPose(ch); }
    player.object.rotation.set(0, 0, 0);
    const play = game.state.phase === 'play';
    if (play && (r.phase === 'alight' || r.phase === 'hop' || r.phase === 'settle' || r.phase === 'ride' || r.phase === 'stop')) {
      const e = r.edge.lengthSq() > 0 ? r.edge : player.pos;
      player.teleport(e.x, e.z, Math.atan2(e.x - (c?.x ?? 0), e.z - (c?.z ?? 0)));
      player.object.position.copy(player.pos);
    }
    input.clearTap?.();
    if (play) player.controllable = true;
    cam.release(SHOT);
    ctx.rides?.end(ride);
    if (!forced) ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z, vol: 0.45 });
  }

  /** Astride the horse: legs either side of its back, mittens forward on the pole, a little lean. */
  function astride(ch) {
    const { legs, arms, body } = ch;
    legs[0].rotation.set(-0.55, 0, -0.95);
    legs[1].rotation.set(-0.55, 0, 0.95);
    arms[0].rotation.x = arms[1].rotation.x = -1.2; // (their z tilt is set at build: leave it)
    body.rotation.set(0.06, 0, 0);
  }
  function resetPose(ch) {
    ch.legs[0].rotation.set(0, 0, 0); ch.legs[1].rotation.set(0, 0, 0); // the walk cycle drives the rest again
    ch.body.rotation.set(0, 0, 0);
  }

  /** The organ: a music-box flourish ('gift') every time round, soft glockenspiel chimes ('pickup') in between. Only
   * existing sfx names (src/audio/sfx.js); the background music (itself a music box) keeps playing underneath. */
  function musicBox(c) {
    const turn = Math.floor(R.turned / (Math.PI * 2)), beat = Math.floor(R.t / 3.4);
    if (turn > (R.turnSnd ?? 0)) { R.turnSnd = turn; R.chime = beat; ctx.audio?.sfx?.('gift', { x: c.x, z: c.z, vol: 0.4 }); return; }
    if (beat > R.chime) { R.chime = beat; ctx.audio?.sfx?.(beat % 3 === 2 ? 'bell' : 'pickup', { x: c.x, z: c.z, vol: beat % 3 === 2 ? 0.18 : 0.28 }); }
  }

  // ------------------------------------------------------------------ per frame (order 50: after the rotor turned)
  const M = new THREE.Matrix4(), hp = new THREE.Vector3(), seatW = new THREE.Vector3(), fwd = new THREE.Vector3();
  const HIP = 0.06; // doll root below the saddle top (hips on the saddle)
  function seatWorld(out) {
    const c = getCarousel();
    c.horseMatrix(R.k, M);
    out.copy(c.saddle).applyMatrix4(M);
    out.y -= HIP;
    fwd.set(M.elements[0], 0, M.elements[2]).normalize();
    return out;
  }
  function update(dt) {
    if (!R) return;
    const c = getCarousel();
    if (!c || game.state.phase !== 'play' || !c.shown) { finish(true); return; }
    R.t += dt; R.T += dt;
    input.clearTap?.();
    const ch = player.character;
    switch (R.phase) {
      case 'slow': {
        if (Math.abs(c.speed) < 1e-3 && R.t > 0.4) {
          // the nearest horse, and the edge spot beside it
          let best = Infinity;
          for (let i = 0; i < c.NH; i++) {
            c.horseMatrix(i, M); hp.setFromMatrixPosition(M);
            const d = Math.hypot(hp.x - player.pos.x, hp.z - player.pos.z);
            if (d < best) { best = d; R.k = i; }
          }
          c.horseMatrix(R.k, M); hp.setFromMatrixPosition(M);
          const dx = hp.x - c.x, dz = hp.z - c.z, l = Math.hypot(dx, dz) || 1;
          R.edge.set(c.x + (dx / l) * EDGE_R, 0, c.z + (dz / l) * EDGE_R);
          player.walkTo(R.edge.x, R.edge.z).then(() => { if (R) R.walked = true; });
          R.phase = 'walk'; R.t = 0;
        }
        return;
      }
      case 'walk': {
        if (R.t > 2.5 && !R.walked) { player.walkTo(player.pos.x, player.pos.z); player.teleport(R.edge.x, R.edge.z); R.walked = true; }
        if (R.walked) {
          R.phase = 'hop'; R.t = 0; R.from.copy(player.pos); c.rider = R.k;
          ctx.audio?.sfx?.('pop', { x: c.x, z: c.z, vol: 0.55 });
        }
        return;
      }
      case 'hop': {
        const s = ss(R.t / 0.6);
        seatWorld(seatW);
        player.pos.lerpVectors(R.from, seatW, s);
        player.pos.y += Math.sin(Math.PI * s) * 0.2;
        const hFrom = Math.atan2(c.x - R.from.x, c.z - R.from.z), hTo = Math.atan2(fwd.x, fwd.z);
        player.heading = angLerp(hFrom, hTo, ss((R.t - 0.05) / 0.45));
        player.vel.set(0, 0);
        player.object.position.copy(player.pos);
        if (ch) { ch.seated = s > 0.5; ch.yaw.rotation.y = player.heading; if (s > 0.5) astride(ch); }
        if (R.t >= 0.6) { R.phase = 'settle'; R.t = 0; }
        return;
      }
      case 'settle':
        if (R.t > 0.7) { R.phase = 'ride'; R.t = 0; R.goal = RIDE_W; R.acc = 0.1; R.chime = 0; ctx.audio?.sfx?.('gift', { x: c.x, z: c.z, vol: 0.55 }); }
        break;
      case 'ride':
        R.turned += c.speed * dt;
        musicBox(c);
        if (R.turned >= RIDE_TURNS * Math.PI * 2 - (RIDE_W * RIDE_W) / (2 * 0.15)) { R.phase = 'stop'; R.t = 0; R.goal = 0; R.acc = 0.15; R.ui?.setHop('Stopping…', false); }
        break;
      case 'stop':
        R.turned += c.speed * dt;
        if (R.phase === 'stop' && R.t < dt * 1.5) ctx.audio?.sfx?.('sleighBells', { x: c.x, z: c.z, vol: 0.35 });
        if (Math.abs(c.speed) < 1e-3) { ctx.audio?.sfx?.('bell', { x: c.x, z: c.z, vol: 0.5 }); beginAlight(); }
        break;
      case 'alight': {
        const s = ss(R.t / 0.55);
        seatWorld(seatW);
        player.pos.lerpVectors(seatW, R.edge, s);
        player.pos.y += Math.sin(Math.PI * s) * 0.2;
        player.heading = angLerp(Math.atan2(fwd.x, fwd.z), Math.atan2(R.edge.x - c.x, R.edge.z - c.z), ss(R.t / 0.4));
        player.object.position.copy(player.pos);
        if (ch) { ch.seated = s < 0.45; ch.yaw.rotation.y = player.heading; if (s < 0.45) astride(ch); else resetPose(ch); }
        if (R.t >= 0.55) finish(false);
        return;
      }
      default: break;
    }
    // seated on the horse: moves with the rotor and the bob
    seatWorld(seatW);
    player.pos.copy(seatW);
    player.vel.set(0, 0);
    player.heading = Math.atan2(fwd.x, fwd.z);
    player.object.position.copy(seatW);
    if (ch) { ch.seated = true; ch.yaw.rotation.y = player.heading; astride(ch); }
  }

  // ------------------------------------------------------------------ camera
  function rideShot() {
    const c = getCarousel();
    const lens = { w: 1, fov: 46, near: 0.05 };
    const post = { band: 0.5, falloff: 0.55 };
    const eyeP = new THREE.Vector3(), headP = new THREE.Vector3(), gaze = new THREE.Vector3(), outP = new THREE.Vector3(), outT = new THREE.Vector3();
    const apP = new THREE.Vector3(), apT = new THREE.Vector3(), coP = new THREE.Vector3(), coT = new THREE.Vector3();
    const porch = new THREE.Vector3(), tmp = new THREE.Vector3(), sad = new THREE.Vector3(), Mh = new THREE.Matrix4(), f2 = new THREE.Vector3(), hp2 = new THREE.Vector3();
    let hintShown = false, apAng = null;
    return {
      name: SHOT, duration: 1e5, blendIn: 1.1, blendOut: 1.0, skippable: false, tilt: 0.7, portrait: false, post, lens,
      update(_u, out, info) {
        const r = R;
        if (!r) return;
        const dt = Math.min(0.1, info?.dt ?? 1 / 60);
        const pr = cam.portrait || 0, k = dollK(player);
        const picked = r.phase !== 'slow';
        // rider: eye at the doll's eye height, but only 40% of the horse's bob reaches the camera (calmer)
        c.horseMatrix(r.k, Mh); hp2.setFromMatrixPosition(Mh);
        f2.set(Mh.elements[0], 0, Mh.elements[2]).normalize();
        const bob = c.bob(r.k) - 0.64;
        sad.copy(c.saddle).applyMatrix4(Mh); // saddle top (world)
        eyeP.set(sad.x + f2.x * 0.025, sad.y - HIP - bob * 0.6 + EYE_H * k, sad.z + f2.z * 0.025);
        const onHorse = r.phase === 'hop' || r.phase === 'settle' || r.phase === 'ride' || r.phase === 'stop';
        if (onHorse) headP.set(sad.x, sad.y - HIP + 0.25 * k, sad.z);
        else headP.set(player.pos.x, player.pos.y + 0.25 * k, player.pos.z);
        const heading = Math.atan2(f2.x, f2.z);
        const phi = Math.atan2(sad.x - c.x, sad.z - c.z); // the rider's angle round the centre (sin/cos convention)
        let delta = phi - heading; delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // ±90°: straight out
        // ---- look input: eye = gaze relative to the horse, outside = circle round the rider
        const L = r.look.consume();
        const autoRel = delta * 0.55;
        if (r.view === 'eye' && r.eyeK > 0.6) {
          if (L.any && !r.manual) { r.manual = true; r.rel = r.relS ?? autoRel; r.pitch = r.pitchS; }
          if (r.manual) {
            r.rel -= L.x * 2.0 + L.keyX * 1.5 * dt;
            r.pitch = Math.max(-0.9, Math.min(0.5, r.pitch - L.y * 1.5 - L.keyY * 1.0 * dt));
          }
        } else if (r.view === 'out') r.orbit = Math.max(-2.5, Math.min(0.55, r.orbit - L.x * 2.2 - L.keyX * 1.2 * dt));
        const kt = 1 - Math.exp(-dt * 10);
        const rel = r.manual ? r.rel : autoRel;
        r.relS = r.relS == null ? rel : angLerp(r.relS, rel, kt);
        r.pitchS += ((r.manual ? r.pitch : -0.06) - r.pitchS) * kt;
        r.orbitS += (r.orbit - r.orbitS) * kt;
        const gy = heading + r.relS;
        gaze.set(Math.sin(gy) * Math.cos(r.pitchS), Math.sin(r.pitchS), Math.cos(gy) * Math.cos(r.pitchS));
        // ---- blends: eyeK (outside <-> saddle), wideK (walking up <-> riding along with your horse)
        const wantEye = r.view === 'eye' && (r.phase === 'ride' || r.phase === 'stop' || (r.phase === 'settle' && r.t > 0.3)) ? 1 : 0;
        const wantWide = picked ? 1 : 0;
        r.eyeK += (wantEye - r.eyeK) * (1 - Math.exp(-dt * 1.6)); if (Math.abs(wantEye - r.eyeK) < 0.002) r.eyeK = wantEye;
        r.wideK += (wantWide - r.wideK) * (1 - Math.exp(-dt * 1.4)); if (Math.abs(wantWide - r.wideK) < 0.002) r.wideK = wantWide;
        if (r.eyeK > 0.95 && !hintShown && !r.manual) { hintShown = true; r.ui?.hint('Drag to look around'); }
        // ---- walking up (before a horse is picked): behind the doll, looking at it and the carousel
        const px = player.pos.x - c.x, pz = player.pos.z - c.z;
        const pa = Math.atan2(px, pz);
        apAng = apAng == null ? pa : angLerp(apAng, pa, 1 - Math.exp(-dt * 3));
        const apR = Math.max(2.2, Math.hypot(px, pz) + 1.3) + 0.5 * pr;
        apP.set(c.x + Math.sin(apAng + 0.35) * apR, 1.05 + 0.35 * pr, c.z + Math.cos(apAng + 0.35) * apR);
        apT.set(player.pos.x, player.pos.y + 0.32, player.pos.z).lerp(tmp.set(c.x, 0.7, c.z), 0.3);
        // ---- riding along: on the rotor just outside the platform, ahead of the horse (orbit < 0 swings round behind)
        const lead = 0.35 + r.orbitS, Rc = 1.52 + 0.2 * pr; // three-quarter front, ~0.9 from the rider
        coP.set(c.x + Math.sin(phi + lead) * Rc, 0.98 + 0.12 * pr, c.z + Math.cos(phi + lead) * Rc);
        coT.set(sad.x, sad.y - bob * 0.5 + 0.1, sad.z).lerp(tmp.set(c.x, 0.75, c.z), 0.12);
        const w = ss(r.wideK);
        outP.copy(apP).lerp(coP, w); outT.copy(apT).lerp(coT, w);
        const e = ss(r.eyeK);
        if (e <= 0.0005) { out.pos.copy(outP); out.target.copy(outT); }
        else {
          // in towards the rider from the outer side, into the eyes, turning to the gaze
          porch.set(eyeP.x + (hp2.x - c.x) * 0.5, eyeP.y + 0.06, eyeP.z + (hp2.z - c.z) * 0.5);
          const a = 1 - e;
          out.pos.set(a * a * outP.x + 2 * a * e * porch.x + e * e * eyeP.x, a * a * outP.y + 2 * a * e * porch.y + e * e * eyeP.y, a * a * outP.z + 2 * a * e * porch.z + e * e * eyeP.z);
          tmp.copy(eyeP).addScaledVector(gaze, 4);
          out.target.copy(outT).lerp(headP, ss(e / 0.5)).lerp(tmp, ss((e - 0.45) / 0.55));
        }
        const ch = player.character;
        if (ch) ch.yaw.visible = out.pos.distanceTo(headP) > 0.36;
        // lens: walking up 46°, riding along a little wider (the camera is close), eye level wide; + portrait
        const fovOut = 46 + 8 * w + 22 * pr;
        lens.fov = fovOut + (64 + 22 * pr - fovOut) * e;
        lens.near = 0.05 + (0.02 - 0.05) * e;
        post.band = 0.5 + 0.55 * Math.max(w, e);
        post.falloff = 0.55 + 0.1 * e;
        post.bloom = 1 - 0.12 * e;
      },
    };
  }

  return ride;
}
