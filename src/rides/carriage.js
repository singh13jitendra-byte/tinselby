// Free-play HORSE CARRIAGE ride: hail the carriage on Holly Lane as it passes (or catch it at its stop at the east end,
// CARRIAGE_STOP), sit on the back bench and clip-clop along the lane and back, round and round; "Hop off" lets you down
// at the roadside at once (the carriage pulls up for a moment). The ambient carriage (src/life/carriage.js, driven by
// src/life/traffic.js) is the ride: it keeps yielding to people and stopping at crossings. While you ride, its two back
// passengers step aside (rider body) and it grows a touch (scaleMul) so the doll fits the bench.
import * as THREE from 'three';
import { CARRIAGE_SEAT, CARRIAGE_STOP } from '../life/carriage.js';
import { createSeat, createRideLayer } from './seatride.js';

const SHOT = 'ride-carriage';
const GROW = 1.12; // carriage size while ridden
const DOLL = 0.84; // doll size while seated (× its normal size)

export function createCarriageRide(ctx) {
  const { game, interact, player, layout } = ctx;
  const carriage = () => ctx.life?._debug?.traffic?.carriage || null;

  const seat = createSeat(ctx, {
    id: 'carriage', shot: SHOT, icon: 'hoof',
    mesh: () => carriage().mesh,
    seat: CARRIAGE_SEAT, dollMul: DOLL,
    // forward past the horse (sitting on the left of the bench, turned a touch left: the driver sits front-right)
    eye: { yaw0: 0.1, pitch0: -0.1, yawMin: -1.9, yawMax: 1.9, fov: 56, fovPortrait: 28, dx: 0.06, dz: 0.03 },
    approach: [0.95, 0.8, -1.55], entry: [0.24, 0.56, -0.48],
    chase: [
      { pos: [1.05, 1.0, -2.05], look: [0, 0.3, 0.05] },
      { pos: [-1.05, 1.0, -2.05], look: [0, 0.3, 0.05] },
      { pos: [0.3, 1.6, -2.5], look: [0, 0.3, 0.2] },
    ],
    sway(T, out) {
      const v = carriage(), k = Math.min(1, (v?.v || 0) / 0.46), sd = v?.rig?.stride || 0;
      out.y = Math.abs(Math.sin(sd)) * 0.007 * k + Math.sin(T * 1.3) * 0.001;
      out.x = Math.sin(sd * 0.5) * 0.004 * k;
    },
  });

  let state = 'idle', layer = null, step = null, offs = [], lastSay = '', waitT = 0;
  const api = {
    id: 'carriage',
    get active() { return state !== 'idle'; },
    get state() { return state; },
    update, stop,
    _board() { if (canBoard()) { begin(); return true; } return false; },
    hopOff,
  };

  // ---------------------------------------------------------------- the interact spot rides along on the pavement side
  function ready() { const v = carriage(); return !!v && v.shown && !v.held && !v.rider; }
  function canBoard() {
    return game.state.phase === 'play' && ctx.rides && ctx.rides.active === null && !ctx.minigames?.active && !ctx.cam.shotActive && ready();
  }
  const spot = interact.add({ id: 'ride-carriage', x: CARRIAGE_STOP.wait[0], z: CARRIAGE_STOP.wait[1], r: 0.9, label: 'Ride the carriage', icon: 'hoof', enabled: canBoard, onInteract: () => begin() });
  // the carriage stop at the east end of Holly Lane: hop on if it is there, else wait for it to come round
  const near = () => { const v = carriage(); return !!v && Math.hypot(v.x - player.pos.x, v.z - player.pos.z) < 1.0; };
  const stopSpot = interact.add({ id: 'ride-carriage-stop', x: CARRIAGE_STOP.wait[0], z: CARRIAGE_STOP.wait[1], r: 0.8, label: 'Wait for the carriage', icon: 'hoof', enabled: canBoard, onInteract: () => (near() ? begin() : wait()) });
  /** Rough seconds until the carriage stands at its stop. */
  function eta() {
    const v = carriage();
    if (!v || !v.stops) return 0;
    if (v.atStop >= 0) return 0;
    const L = v.path.length, d = (((v.stops[0] - v.s) % L) + L) % L;
    return Math.max(0, v.wait) + d / (v.vmax * 0.8);
  }
  const etaText = (s) => (s < 6 ? 'Carriage due any moment' : 'Carriage in about ' + Math.round(s / 5) * 5 + ' s');
  function moveSpot() {
    const v = carriage();
    if (!v) return;
    spot.x = v.x - v.fz * 0.3; spot.z = v.z + v.fx * 0.3; // right-hand side = the pavement
  }

  // ---------------------------------------------------------------- roadside spot to hop down to
  const _t = new THREE.Vector3(), _s = new THREE.Vector3();
  function roadside() {
    const v = carriage(), W = layout.WORLD;
    const rx = -v.fz, rz = v.fx;
    for (const [side, d] of [[1, 0.8], [-1, 0.8], [1, 1.1], [-1, 1.1], [1, 0.6], [-1, 0.6]]) {
      const x = v.x + rx * side * d, z = v.z + rz * side * d;
      if (x < W.minX + 0.4 || x > W.maxX - 0.4 || z < W.minZ + 0.4 || z > W.maxZ - 0.4) continue;
      _t.set(x, 0, z);
      ctx.colliders.resolve?.(_t, 0.1);
      if (Math.hypot(_t.x - x, _t.z - z) < 0.04) return { x, z, heading: Math.atan2(rx * side, rz * side) };
    }
    return { x: v.x + rx * 0.8, z: v.z + rz * 0.8, heading: Math.atan2(rx, rz) };
  }

  // ---------------------------------------------------------------- board → ride → alight
  const seatP = () => seat.seatPos(_s);
  /** Common start of a ride (boarding at once, or waiting at the stop first). */
  function enter() {
    player.controllable = false;
    ctx.input.enabled = false;
    ctx.input.clearTap?.();
    ctx.rides.begin(api);
    layer = createRideLayer(ctx, { icon: 'hoof', onOff: hopOff, onView: toggleView });
    layer.showButtons(false);
    offs.push(game.on('interact', () => { if (state === 'ride') hopOff(); }));
    offs.push(game.on('ui:escape', () => { if (state === 'ride' || state === 'wait') hopOff(); }));
    offs.push(game.on('camera:toggle', () => { if (state === 'ride') toggleView(); }));
    offs.push(game.on('game:start', () => stop()));
  }
  function begin() {
    if (state !== 'idle') return;
    enter();
    board();
  }
  function wait() {
    if (state !== 'idle') return;
    enter();
    state = 'wait'; waitT = 0;
    player.faceTowards(CARRIAGE_STOP.pos[0], CARRIAGE_STOP.pos[1]);
    layer.status(etaText(eta()));
    layer.offLabel('Cancel');
    layer.showView(false);
    layer.showButtons(true);
  }
  function board() {
    const v = carriage();
    layer.showButtons(false);
    layer.showView(true);
    layer.offLabel('Hop off');
    layer.status('Whoa there… climb aboard!');
    state = 'board';
    v.wait = Math.max(v.wait, 1.6); // pull up
    v.rider = true;
    v.scaleMul = GROW;
    try { v.rig?.setRider?.(true); } catch (e) { console.warn('[ride carriage] rider body', e); }
    seat.resetLook();
    seat.attachLook();
    seat.startShot(true);
    const from = player.pos.clone();
    let sat = false;
    const h = seat.hop(() => from, seatP, 0.62, 0.22, () => (sat ? carriage().mesh.rotation.y : Math.atan2(seatP().x - from.x, seatP().z - from.z)));
    step = (dt) => { if (h(dt) && !sat) { sat = true; seat.sit(); } return sat; };
    ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z });
    lastSay = '';
  }
  function toggleView() {
    if (state !== 'ride') return;
    seat.st.viewGoal = seat.st.viewGoal > 0.5 ? 0 : 1;
    layer.view(seat.st.viewGoal > 0.5);
  }
  function hopOff() {
    if (state === 'wait') { finish(null, false); return; } // Cancel
    if (state !== 'ride') return;
    const v = carriage();
    state = 'alight';
    v.wait = Math.max(v.wait, 1.5);
    seat.st.viewGoal = 1;
    layer.showButtons(false);
    layer.status('Thank you, driver!');
    const land = roadside();
    const to = new THREE.Vector3(land.x, ctx.colliders.heightAt(land.x, land.z), land.z);
    let t = 0;
    step = (dt) => {
      t += dt;
      if (t < 0.25) { seat.place(); return false; } // wait for the carriage to pull up
      if (!step.h) { seat.unsit(); const a = player.pos.clone(); step.h = seat.hop(() => a, () => to, 0.55, 0.2, () => land.heading); }
      v.wait = Math.max(v.wait, 0.3);
      if (step.h(dt)) finish(land, true);
      return false;
    };
  }
  function finish(at, soft) {
    const v = carriage();
    if (v) { v.rider = false; v.scaleMul = 1; try { v.rig?.setRider?.(false); } catch (e) { /* keep going */ } }
    seat.unsit();
    seat.detachLook();
    seat.endShot();
    if (at) {
      player.teleport(at.x, at.z, at.heading);
      ctx.colliders.resolve?.(player.pos, 0.08);
      player.object.position.copy(player.pos);
    }
    player.controllable = game.state.phase === 'play';
    ctx.input.enabled = true;
    for (const off of offs) { try { off?.(); } catch (e) { /* ignore */ } }
    offs = [];
    layer?.destroy(); layer = null;
    state = 'idle'; step = null;
    ctx.rides.end(api);
    if (soft) ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z });
  }
  function stop() {
    if (state === 'idle') return;
    const v = carriage();
    finish(v && v.shown && state !== 'wait' ? roadside() : null, false);
  }

  function update(dt) {
    const v = carriage();
    if (state === 'idle') { if (v && v.shown) { moveSpot(); stopSpot.label = near() ? 'Ride the carriage' : 'Wait for the carriage'; } return; }
    if (game.state.phase !== 'play' || !v || !v.shown || v.held) { stop(); return; }
    if (state === 'wait') {
      // board once it stands at the stop (or pulls up right beside you)
      waitT += dt;
      if ((v.atStop >= 0 && v.wait > 0.4) || near()) board();
      else if (waitT > 150) finish(null, false);
      else layer.status(etaText(eta()));
      return;
    }
    seat.tick(dt);
    if (state === 'board') {
      v.wait = Math.max(v.wait, 0.3);
      if (step?.(dt) && !seat.boarding) {
        state = 'ride'; step = null;
        layer.showButtons(true);
        layer.hint(ctx.engine.isMobile ? 'Swipe to look around' : 'Drag (or use the arrow keys) to look around');
      }
      return;
    }
    if (state === 'alight') { step?.(dt); return; }
    seat.place();
    let say;
    if (v.atStop >= 0) say = CARRIAGE_STOP.name + ' stop';
    else if (v.v < 0.05) say = 'Waiting a moment…';
    else if (v.fx < -0.5) say = 'Trotting down Holly Lane';
    else if (v.fx > 0.5) say = 'Back towards the market';
    else say = 'Turning round…';
    if (say !== lastSay) { lastSay = say; layer.status(say); }
  }
  return api;
}
