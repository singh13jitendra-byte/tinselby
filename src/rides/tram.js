// Free-play TRAM ride: hop on the ambient tram at any stop (layout.TRAM_STOPS), sit by a window and ride the loop for as
// long as you like; "Hop off" gets you off at the next stop (or at once while the tram stands at one).
// The ride uses the ambient tram itself (src/life/traffic.js): it keeps its normal traffic behaviour, stops and dings;
// while you ride it wears its hollow 'riding' body (open windows, lit interior, benches, passengers: src/life/tram.js).
// Door 11 (Tram Conductor) hides the ambient tram with life.holdVehicle('tram'); rides.stopAll runs on minigame:start
// before that, and a held / hidden tram offers no boarding.
import * as THREE from 'three';
import { TRAM_SEAT, TRAM_DOOR, buildTramOpenGeometry } from '../life/tram.js';
import { SEAT_DROP } from '../core/player.js';
import { createSeat, createRideLayer } from './seatride.js';
import { W4 } from './flag.js';

const SHOT = 'ride-tram';
// Riding together (W4): the free benches of the riding body (the three knitted passengers keep theirs). Seat 0 is the
// usual rider's bench; 1 is across the aisle from it, then the benches behind / in front.
const SEATS = [
  { x: TRAM_SEAT.x, z: TRAM_SEAT.z },
  { x: -TRAM_SEAT.x, z: TRAM_SEAT.z },
  { x: TRAM_SEAT.x, z: -0.54 },
  { x: TRAM_SEAT.x, z: 0.0 },
  { x: -TRAM_SEAT.x, z: 0.27 },
];
const NEAR = SEATS.map((a, i) => SEATS.map((b, j) => [j, Math.hypot(a.x - b.x, a.z - b.z)]).filter(([j]) => j !== i).sort((p, q) => p[1] - q[1]).map(([j]) => j));

export function createTramRide(ctx) {
  const { game, interact, player, layout } = ctx;
  const STOPS = layout.TRAM_STOPS;
  const traffic = () => ctx.life?._debug?.traffic;
  const tram = () => traffic()?.tram || null;
  let openGeo = null, closedGeo = null, swapBackT = 0;

  // (seat, eye and the boarding glide are changed in place for the other benches: see useSeat)
  const seatSpec = { ...TRAM_SEAT };
  const seat = createSeat(ctx, {
    id: 'tram', shot: SHOT, icon: 'tram',
    mesh: () => tram().mesh,
    seat: seatSpec,
    // out of the plaza-side window (local −x), turned a little towards the direction of travel
    // (leaning towards the glass: the window posts either side stay out of a landscape frame)
    eye: { yaw0: -Math.PI / 2 + 0.03, pitch0: -0.05, yawMin: -1.5, yawMax: 1.75, fov: 56, fovPortrait: 28, dx: -0.078, dz: 0.02 },
    approach: [-1.25, 0.75, -0.85], entry: [-0.32, 0.45, TRAM_SEAT.z],
    // (trees, lamps and stop props line the plaza side of the track: behind, over the rails, is the clearest corridor, then
    // the road side)
    chase: [
      { pos: [-0.4, 1.45, -2.3], look: [0, 0.36, 0.15] },
      { pos: [1.4, 1.25, -1.9], look: [0, 0.36, 0.0] },
      { pos: [-1.2, 1.35, -1.8], look: [0, 0.34, 0.05] },
      { pos: [0.2, 2.2, -3.0], look: [0, 0.3, 0.3] },
      { pos: [-0.5, 2.9, -1.3], look: [0, 0.3, 0.25] }, // nearly overhead: over the trees at the corners
    ],
    chaseSpan: 0.72,
    sway(T, out) {
      const v = tram(), k = Math.min(1, (v?.v || 0) / 0.85);
      out.x = Math.sin(T * 1.7) * 0.004 * k;
      out.y = (Math.sin(T * 7.1) * 0.0022 + Math.sin(T * 2.3) * 0.0016) * k;
    },
  });

  /** Sit on bench i (0 = the usual one): seat, eye (out of the nearer window) and the boarding glide follow. */
  let seatIdx = 0, wantSeat = null;
  function useSeat(i) {
    seatIdx = i;
    const b = SEATS[i], side = b.x < 0 ? 1 : -1; // 1 = the plaza side (local −x)
    seatSpec.x = b.x; seatSpec.z = b.z;
    const sp = seat.spec;
    sp.eye.yaw0 = side * (-Math.PI / 2 + 0.03); sp.eye.dx = side * -0.078;
    sp.eye.yawMin = side > 0 ? -1.5 : -1.75; sp.eye.yawMax = side > 0 ? 1.75 : 1.5;
    sp.approach[0] = side * -1.25; sp.entry[0] = side * -0.32; sp.entry[2] = b.z;
  }
  /** The bench to take: wanted (beside a friend) or the usual one, never one a remote rider is drawn on. */
  function pickSeat(want) {
    const taken = W4 ? (ctx.rides?.takenByOthers?.('tram') || new Set()) : new Set();
    const order = want == null ? [0, ...NEAR[0]] : NEAR[want];
    return order.find((i) => !taken.has(i)) ?? null;
  }

  // ---------------------------------------------------------------- state
  // idle → wait (tram pulling in) → board (hop on + camera glides in) → ride → alight (hop off) → idle
  let state = 'idle', layer = null, pendingOff = false, stopIdx = -1, step = null, prev = null, offs = [], waitT = 0;
  const api = {
    id: 'tram',
    get active() { return state !== 'idle'; },
    get state() { return state; },
    update, stop,
    /** test hook: board at the nearest stop as soon as the tram is there (returns false if no tram can be boarded now) */
    _board(i) { if (canBoard(i)) { begin(i); return true; } return false; },
    hopOff,
  };

  /** Plaza-side spot where riders wait: a stop's first wait spot (the one away from Conductor Clem at Park Gate), a
   *  little nearer the rails. */
  const spotOf = (st) => {
    const [mx, mz] = st.wait[0];
    return { x: mx + (st.pos[0] - mx) * 0.2 - (st.pos[0] === 0 ? 0.1 : 0), z: mz + (st.pos[1] - mz) * 0.2 - (st.pos[0] !== 0 ? 0.1 : 0) };
  };
  function tramReady(i) {
    const v = tram();
    if (!v || !v.shown || v.held || v.rider) return false;
    if (v.atStop === i && v.wait > 0.35) return true;
    return v.nextStop === i && !v.served && v.nextDs < 2.4;
  }
  /** The tram runs and nobody rides it: a stop's spot offers "Hop on" while it is there / pulling in, else "Wait for it". */
  function tramFree() { const v = tram(); return !!v && v.shown && !v.held && !v.rider; }
  function canWait() {
    return game.state.phase === 'play' && ctx.rides && ctx.rides.active === null && !ctx.minigames?.active && !ctx.cam.shotActive && tramFree();
  }
  function canBoard(i) { return canWait() && tramReady(i); }
  const spots = STOPS.map((st, i) => {
    const p = spotOf(st);
    return interact.add({ id: 'ride-tram-' + st.id, x: p.x, z: p.z, r: 1.0, label: 'Wait for the tram', icon: 'tram', enabled: canWait, onInteract: () => begin(i) });
  });
  /** Rough seconds until the tram stands at stop i (path distance at cruising pace + the stands at stops on the way). */
  function eta(i) {
    const v = tram();
    if (!v || !v.stops) return 0;
    if (v.atStop === i) return 0;
    const L = v.path.length, d = (((v.stops[i] - v.s) % L) + L) % L;
    let n = 0;
    for (let j = 0; j < v.stops.length; j++) { const dj = (((v.stops[j] - v.s) % L) + L) % L; if (j !== i && dj > 0.05 && dj < d) n++; }
    return Math.max(0, v.wait) + d / (v.vmax * 0.82) + n * ((v.stopWait || 3.2) + 1.2);
  }
  const etaText = (s) => (s < 8 ? 'Tram due any moment' : 'Tram in about ' + Math.round(s / 5) * 5 + ' s');

  // ---------------------------------------------------------------- boarding
  const _w = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _o = new THREE.Vector3();
  const doorOut = () => seat.local(_d, TRAM_DOOR.x - 0.16, 0.0, TRAM_DOOR.z);
  const doorIn = () => seat.local(_o, seatSpec.x, TRAM_SEAT.y - 0.03, TRAM_DOOR.z - 0.12);
  const seatP = () => seat.seatPos(_s);
  /** want (riding together): board in the free bench nearest this one. */
  function begin(i, want = null) {
    if (state !== 'idle') return;
    stopIdx = i; pendingOff = false; wantSeat = want;
    prev = { ctl: player.controllable, input: ctx.input.enabled };
    player.controllable = false;
    ctx.input.enabled = false;
    ctx.input.clearTap?.();
    ctx.rides.begin(api);
    layer = createRideLayer(ctx, { icon: 'tram', onOff: hopOff, onView: toggleView });
    layer.showButtons(false);
    offs.push(game.on('interact', () => { if (state === 'ride') hopOff(); }));
    offs.push(game.on('ui:escape', () => { if (state === 'ride' || state === 'wait') hopOff(); }));
    offs.push(game.on('camera:toggle', () => { if (state === 'ride') toggleView(); }));
    offs.push(game.on('game:start', () => stop()));
    const v = tram(), st = STOPS[i];
    // face the track while waiting
    player.faceTowards(st.pos[0], st.pos[1]);
    if (v.atStop === i) { v.wait = Math.max(v.wait, 1.4); startBoard(); return; }
    state = 'wait'; waitT = 0;
    if (tramReady(i)) pullIn();
    else {
      // the tram is further round the loop: wait at the stop (Cancel walks away again)
      layer.status(etaText(eta(i)));
      layer.offLabel('Cancel');
      layer.showView(false);
      layer.showButtons(true);
    }
  }
  /** The tram is pulling in to our stop: it now ignores the player as an obstacle (they may stand close to the rails)
   *  and stands a little longer. */
  function pullIn() {
    const v = tram();
    v.minWait = 2.2; v.rider = true;
    layer.showButtons(false);
    layer.status('The tram is pulling in…');
  }
  function startBoard() {
    const v = tram();
    state = 'board';
    v.rider = true;
    useSeat(pickSeat(wantSeat) ?? 0);
    try {
      if (!openGeo) { closedGeo = v.mesh.geometry; openGeo = buildTramOpenGeometry(); }
      v.mesh.geometry = openGeo;
    } catch (e) { console.warn('[ride tram] riding body', e); }
    swapBackT = 0;
    layer.showView(true);
    layer.offLabel('Hop off');
    seat.resetLook();
    seat.attachLook();
    seat.startShot(true);
    const from = player.pos.clone();
    const h1 = seat.hop(() => from, doorOut, 0.42, 0.13, () => Math.atan2(doorOut().x - from.x, doorOut().z - from.z));
    let h2 = null;
    step = (dt) => {
      if (!h2) { if (h1(dt)) { const a = doorOut().clone(); h2 = seat.hop(() => a, doorIn, 0.22, 0.05); } return false; }
      if (!h2.done && h2(dt)) {
        const b = doorIn().clone();
        h2.done = true;
        step = seat.hop(() => b, seatP, 0.3, 0.02, () => tram().mesh.rotation.y);
        seat.sit();
      }
      return false;
    };
    ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z });
    layer.status('All aboard!');
  }
  function onSeated() {
    state = 'ride';
    step = null;
    layer.showButtons(true);
    layer.hint(ctx.engine.isMobile ? 'Swipe to look around' : 'Drag (or use the arrow keys) to look around');
  }

  // ---------------------------------------------------------------- riding
  function toggleView() {
    if (state !== 'ride') return;
    seat.st.viewGoal = seat.st.viewGoal > 0.5 ? 0 : 1;
    layer.view(seat.st.viewGoal > 0.5);
  }
  function hopOff() {
    if (state === 'wait') { if (!tram()?.rider) finish(null, false); return; } // Cancel (not once it is pulling in)
    if (state !== 'ride') return;
    const v = tram();
    if (v.atStop >= 0) startAlight(v.atStop);
    else pendingOff = true;
  }
  function startAlight(i) {
    const v = tram();
    state = 'alight';
    stopIdx = i;
    v.wait = Math.max(v.wait, 1.6);
    seat.st.viewGoal = 1; // back out to the chase view while the rider steps down
    layer.showButtons(false);
    layer.status(STOPS[i].name);
    const st = STOPS[i];
    // the wait spot nearest the door
    doorOut();
    let best = st.wait[0], bd = Infinity;
    for (const w of st.wait) { const d = (w[0] - _d.x) ** 2 + (w[1] - _d.z) ** 2; if (d < bd) { bd = d; best = w; } }
    const land = new THREE.Vector3(best[0], ctx.colliders.heightAt(best[0], best[1]), best[1]);
    seat.unsit();
    const a = seatP().clone();
    const h1 = seat.hop(() => a, doorIn, 0.25, 0.03, () => tram().mesh.rotation.y - Math.PI / 2);
    let h2 = null;
    step = (dt) => {
      v.wait = Math.max(v.wait, 0.4);
      if (!h2) { if (h1(dt)) { const b = doorIn().clone(); h2 = seat.hop(() => b, () => land, 0.5, 0.15, () => Math.atan2(land.x - b.x, land.z - b.z)); } return false; }
      if (h2(dt)) finish(land, true);
      return false;
    };
  }
  function finish(at, soft) {
    const v = tram();
    if (v) { v.rider = false; v.minWait = 0; }
    swapBackT = 2.5; // the riding body goes back to the glowing windows once the tram has moved on
    seat.unsit();
    seat.detachLook();
    seat.endShot();
    if (at) {
      player.teleport(at.x, at.z, player.heading);
      ctx.colliders.resolve?.(player.pos, 0.08);
      player.object.position.copy(player.pos);
      // face away from the track, into the plaza
      const st = STOPS[stopIdx] || STOPS[0];
      player.heading = Math.atan2(at.x - st.pos[0], at.z - st.pos[1]);
    }
    player.controllable = game.state.phase === 'play';
    ctx.input.enabled = prev ? prev.input !== false : true;
    for (const off of offs) { try { off?.(); } catch (e) { /* ignore */ } }
    offs = [];
    layer?.destroy(); layer = null;
    state = 'idle'; step = null; pendingOff = false;
    ctx.rides.end(api);
    if (soft) ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z });
  }
  /** Forced end (phase change, mini-game, finale): put the player at the nearest stop's wait spot at once. */
  function stop() {
    if (state === 'idle') return;
    const v = tram();
    let best = STOPS[0].wait[0], bd = Infinity, bi = 0;
    const px = v && v.shown ? v.x : player.pos.x, pz = v && v.shown ? v.z : player.pos.z;
    STOPS.forEach((st, i) => { for (const w of st.wait) { const d = (w[0] - px) ** 2 + (w[1] - pz) ** 2; if (d < bd) { bd = d; best = w; bi = i; } } });
    stopIdx = bi;
    finish(state === 'wait' ? null : { x: best[0], z: best[1] }, false);
    if (v && openGeo && v.mesh.geometry === openGeo) { v.mesh.geometry = closedGeo; swapBackT = 0; }
  }

  // ---------------------------------------------------------------- riding together (src/rides/together.js)
  const _p = new THREE.Vector3();
  let remoteBody = false;
  api.seats = {
    n: SEATS.length,
    mine: () => (state === 'ride' || (state === 'board' && seat.st.seated) ? seatIdx : null),
    near: (s) => NEAR[s].slice(),
    pose(s, out) {
      const v = tram();
      if (!v || !v.shown || v.held) return null;
      const b = SEATS[s], m = v.mesh;
      m.updateWorldMatrix(true, false);
      m.localToWorld(_p.set(b.x, TRAM_SEAT.y - SEAT_DROP * seat.dollK(), b.z));
      out.x = _p.x; out.y = _p.y; out.z = _p.z; out.h = m.rotation.y; out.pose = 'bench';
      return out;
    },
    /** Board at a stop (the one you stand at, else the one the tram reaches first) beside bench s. */
    join(s, _taken, i) {
      if (!canWait()) return false;
      begin(Number.isInteger(i) ? i : nextStop(), s);
      return state !== 'idle';
    },
    where() { const i = nextStop(), p = spotOf(STOPS[i]); return { x: p.x, z: p.z, h: Math.atan2(STOPS[i].pos[0] - p.x, STOPS[i].pos[1] - p.z), i }; },
    spots,
    /** Remote riders aboard while you are not: show the riding body (open windows) so they can be seen inside. */
    remote(on) {
      const v = tram();
      if (!v || state !== 'idle') { remoteBody = false; return; }
      if (on && v.shown) {
        try {
          if (!openGeo) { closedGeo = v.mesh.geometry; openGeo = buildTramOpenGeometry(); }
          if (v.mesh.geometry !== openGeo) v.mesh.geometry = openGeo;
          remoteBody = true; swapBackT = 0;
        } catch (e) { console.warn('[ride tram] riding body', e); }
      } else if (remoteBody) { remoteBody = false; swapBackT = 1.5; }
    },
  };
  /** The stop the tram reaches first from now. */
  function nextStop() { let b = 0, be = Infinity; for (let i = 0; i < STOPS.length; i++) { const e = eta(i); if (e < be) { be = e; b = i; } } return b; }

  function update(dt) {
    const v = tram();
    if (swapBackT > 0 && v && state === 'idle') {
      swapBackT -= dt;
      if (swapBackT <= 0 && openGeo && v.mesh.geometry === openGeo) v.mesh.geometry = closedGeo;
    }
    if (state === 'idle') {
      if (v) for (let i = 0; i < spots.length; i++) spots[i].label = tramReady(i) ? 'Hop on the tram' : 'Wait for the tram';
      return;
    }
    if (game.state.phase !== 'play' || !v || !v.shown || v.held) { stop(); return; }
    if (state === 'wait') {
      waitT += dt;
      // hop on once the tram stands at our stop (it waits at least minWait there)
      if (v.atStop === stopIdx) { v.wait = Math.max(v.wait, 1.4); startBoard(); return; }
      if (!v.rider) {
        if (tramReady(stopIdx)) pullIn();
        else if (waitT > 180) finish(null, false); // stuck somewhere (should not happen)
        else layer.status(etaText(eta(stopIdx)));
      } else if (v.nextStop !== stopIdx || waitT > 180) finish(null, false); // went past (should not happen)
      return;
    }
    seat.tick(dt);
    if (state === 'board') {
      v.wait = Math.max(v.wait, 0.4);
      step?.(dt);
      if (seat.st.seated && !seat.boarding && player.pos.distanceTo(seat.seatPos(_w)) < 0.01) onSeated();
      return;
    }
    if (state === 'alight') { step?.(dt); return; }
    // riding
    seat.place();
    // (just after leaving a stop it is still the 'next' one until the tram is half a step past it)
    const next = STOPS[v.served && v.atStop < 0 ? (v.nextStop + 1) % STOPS.length : v.nextStop] || STOPS[0];
    if (v.atStop >= 0) {
      if (pendingOff) { startAlight(v.atStop); return; }
      layer.status(STOPS[v.atStop].name + ' · doors open');
      layer.offLabel('Hop off');
    } else if (pendingOff) {
      layer.status('Next stop: ' + next.name);
      layer.offLabel('Getting off at ' + next.name, true);
    } else {
      layer.status('Next stop: ' + next.name);
      layer.offLabel('Hop off');
    }
  }
  return api;
}
