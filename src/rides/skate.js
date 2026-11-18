// FREE SKATING on Frostmere Lake (free-play ride, see src/rides/index.js for the contract). No score, no timer, no door.
//
// "Put on skates" at the west bank gap (next to the pier): the player's knitted doll (a second one built like the
// door-9 skater, same blade geometry) glides on the ice with momentum and gentle curves. The player's own doll is
// hidden for the ride and put back afterwards.
//
// Controls (all views): joystick / WASD / arrows steer, tap / Space = little twirl, "Take off skates" button.
//  - follow / high view: the stick sets the direction you want to skate in; the skater turns towards it at the door-9
//    sim's turn rate (TUNE.turnMax, TUNE.steerRate), pushes off when facing it, and otherwise just glides (long
//    coast, edges grip sideways slip away gently).
//  - eye view: the view is the heading (drag / joystick x / ← → look and turn); stick up / W pushes, stick down / S
//    snow-ploughs. The eye camera sits in the doll's head, the doll hides itself.
// The lake's rim is a soft wall; pressing outwards into the west gap for a moment steps you off the ice (so does the
// button). Ambient skaters and the town are untouched.
//
// Deviation from the ride contract: player.controllable stays TRUE during the ride, because the camera director only
// allows the eye view while the player is controllable (eye view must work while skating). The player's own movement
// is neutralised instead: the doll is hidden, player.pos is overwritten every frame (rides update runs after
// player.update) and player.onStep is silenced; both are restored on exit.
import * as THREE from 'three';
import { buildCharacter } from '../core/player.js';
import { box, cyl, torus, xf, merge, GLOSS } from '../core/prims.js';
import { TUNE } from '../minigames/skate/sim.js';
import { puffGeo, sparkGeo } from '../minigames/sled/props.js';
import { createJoystick } from '../ui/joystick.js';
import './rides-snow.css';

const DOLL_S = 1.15; // like the player
const BLADE_LIFT = 0.017;
const MAX_SP = 2.5; // units / s, push-off limit
const PUSH = 1.5; // units / s² while pushing
const COAST = 0.22; // 1/s: coasting friction (a long glide)
const GRIP = 2.3; // 1/s: sideways slip fades (gentle carving)
const TRAIL_N = 40;
const TRAIL_STEP = 0.07;
const NP = 28;
const SPOT = { x: 10.0, z: 2.6 }; // west bank gap beside the pier
const EXIT_SECTOR = [(115 * Math.PI) / 180, (205 * Math.PI) / 180]; // angles round the lake (atan2(dz, dx)) where the bank is open

/** The HUD hides its joystick during free-play rides, so the snow rides carry their own (touch devices only; shared with sled.js). */
export function mountRideJoystick(ctx, ui) {
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches || ctx.engine.isMobile;
  const layer = document.createElement('div');
  layer.className = 'tb-joylayer';
  ui.appendChild(layer);
  let joy = null;
  const ensure = () => { if (!joy) joy = createJoystick(ctx, layer); };
  if (coarse) ensure();
  const onTouch = (e) => { if (e.pointerType === 'touch') ensure(); };
  window.addEventListener('pointerdown', onTouch, { passive: true });
  return () => { window.removeEventListener('pointerdown', onTouch); joy?.reset(); ctx.input.setJoystick(0, 0); };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (k) => k * k * (3 - 2 * k);
const frac = (x) => x - Math.floor(x);

const ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c2 3 2 6 0 9-2-3-2-6 0-9z" fill="currentColor" fill-opacity=".25"/><path d="M5 14c4 3 10 3 14 0M7 19h10"/></svg>';

export function createSkatingRide(ctx) {
  const { engine, game, cam, player, colliders, input, interact, layout, uiRoot } = ctx;
  const L = layout.LAKE;
  const RX = L.rx - 0.42, RZ = L.rz - 0.38; // soft rim (the knitted edge + fence stand just outside)
  const ICE_Y = colliders.heightAt(L.center.x, L.center.z) || 0.05;
  const sfx = (n, o) => { try { ctx.audio?.sfx?.(n, o); } catch (e) { /* audio is optional */ } };
  const ride = { id: 'skate', active: false, keepControls: true, update, stop, get state() { return S; }, board };

  // ---- sim state (world units; heading h: direction (sin h, cos h) in (x, z) like player.heading)
  const S = { x: 0, z: 0, vx: 0, vz: 0, h: 0, steer: 0, omega: 0, sp: 0, twirlT: -1, twirls: 0, strokePh: 0, thrust: 0, exitT: 0, t: 0, dist: 0, bumpT: 0 };
  let R = null; // render + DOM objects while active
  let saved = null;

  interact.add({
    id: 'ride-skate', x: SPOT.x, z: SPOT.z, r: 1.05, label: 'Put on skates', icon: 'skate',
    enabled: () => game.state.phase === 'play' && ctx.rides?.active === null && player.controllable && !cam.shotActive,
    onInteract: board,
  });

  // ---------------------------------------------------------------- board
  function board() {
    if (ride.active || ctx.rides.active) return;
    ride.active = true;
    ctx.rides.begin(ride);
    saved = { onStep: player.onStep, visible: player.object.visible };
    player.onStep = null;
    player.object.visible = false;
    input.clearTap();
    build();
    // start on the ice, a little way in from the bank, looking across the lake
    const dx = SPOT.x - L.center.x, dz = SPOT.z - L.center.z, m = Math.hypot(dx / RX, dz / RZ);
    S.x = L.center.x + (dx / m) * 0.8; S.z = L.center.z + (dz / m) * 0.8;
    S.h = Math.atan2(L.center.x - S.x, L.center.z - S.z);
    S.sp = 0.5; S.vx = Math.sin(S.h) * S.sp; S.vz = Math.cos(S.h) * S.sp;
    S.steer = S.omega = S.thrust = S.exitT = S.bumpT = 0; S.twirlT = -1; S.twirls = 0; S.dist = 0;
    apply(0);
    sfx('ice', { vol: 0.7 });
    game.emit('ui:toast', { text: 'Skating! Steer to glide, tap to twirl', ms: 3200 });
  }

  // ---------------------------------------------------------------- build visuals + DOM
  function build() {
    const mat = engine.mat;
    const disp = [];
    const own = (x) => { disp.push(x); return x; };
    const root = new THREE.Group();
    root.name = 'ride-skate';
    engine.scene.add(root);
    // doll + blades (same geometry as the door-9 skater)
    const ch = buildCharacter(mat, game.state.style || {});
    ch.group.scale.setScalar(DOLL_S);
    {
      const legMesh = ch.legs[0].children[0];
      const steel = '#c9d3dc';
      const blade = merge([
        legMesh.geometry.clone(),
        xf(box(0.009, 0.007, 0.104, steel, GLOSS), [0, -0.089, 0.012]),
        xf(torus(0.011, 0.0035, steel, GLOSS, Math.PI, 8, 4), [0, -0.0785, 0.064], [0, Math.PI / 2, 0]),
        xf(cyl(0.004, 0.004, 0.014, 5, '#8a98a6', GLOSS), [0, -0.081, -0.022]),
        xf(cyl(0.004, 0.004, 0.014, 5, '#8a98a6', GLOSS), [0, -0.081, 0.042]),
      ]);
      const old = legMesh.geometry;
      for (const l of ch.legs) l.children[0].geometry = blade;
      old.dispose();
    }
    const skater = new THREE.Group();
    skater.add(ch.group);
    root.add(skater);
    // glide trail: one tapered strip with per-vertex alpha
    const tp = new Float32Array(TRAIL_N * 2 * 3), tc = new Float32Array(TRAIL_N * 2 * 4);
    const tg = own(new THREE.BufferGeometry());
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(idx);
    tg.setDrawRange(0, 0);
    const trail = new THREE.Mesh(tg, own(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    })));
    trail.frustumCulled = false; trail.renderOrder = 3;
    root.add(trail);
    // puffs (ice spray on twirls and hard turns)
    const puffs = new THREE.InstancedMesh(own(puffGeo()), mat, NP);
    puffs.frustumCulled = false; puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(puffs);
    const pool = Array.from({ length: NP }, () => ({ t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3();
    for (let i = 0; i < NP; i++) puffs.setMatrixAt(i, M.compose(V.set(0, -20, 0), Q.identity(), SC.setScalar(0.0001)));
    // DOM
    const ui = document.createElement('div');
    ui.className = 'rs-ui rs-skate';
    ui.innerHTML = `<div class="rs-stack"><button class="rs-btn rs-round rs-twirl" aria-label="Twirl"><span class="rs-ico">${ICON}</span><span class="rs-lab">Twirl</span></button>
      <button class="rs-btn rs-pill rs-off" aria-label="Take off skates">Take off skates</button></div>`;
    uiRoot.appendChild(ui);
    const unJoy = mountRideJoystick(ctx, ui);
    for (const b of ui.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.querySelector('.rs-twirl').addEventListener('click', (e) => { e.preventDefault(); twirl(); });
    ui.querySelector('.rs-off').addEventListener('click', (e) => { e.preventDefault(); sfx('ui'); finish('stay'); });
    const offs = [
      game.on('input:tap', () => { input.clearTap(); twirl(); }),
      game.on('interact', () => twirl()),
      game.on('minigame:start', () => finish('stay')),
      unJoy,
    ];
    R = { root, ch, skater, trail, tp, tc, tg, puffs, pool, puffI: 0, ui, disp, offs, mat, trailLast: null, trailArr: [], M, Q, V, SC, sprayT: 0, iceSfxT: 0, ph: 0 };
  }

  function spray(x, y, z, n, spread, up, size) {
    for (let k = 0; k < n; k++) {
      const p = R.pool[(R.puffI + k) % NP];
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      Object.assign(p, { t: 0, life: 0.55 * (0.7 + Math.random() * 0.6), x, y, z, vx: Math.cos(a) * r, vz: Math.sin(a) * r, vy: up * (0.5 + Math.random()), s: size * (0.6 + Math.random() * 0.7) });
    }
    R.puffI = (R.puffI + n) % NP;
  }

  function twirl() {
    if (!ride.active || S.twirlT >= 0) return;
    S.twirlT = 0; S.twirls++;
    spray(S.x, ICE_Y + 0.03, S.z, 7, 0.45, 0.45, 0.026);
    sfx('whoosh', { vol: 0.45 });
  }

  // ---------------------------------------------------------------- physics
  const fwdOf = (h) => [Math.sin(h), Math.cos(h)];
  function step(dt) {
    S.t += dt;
    const eye = input.eyeView;
    const mv = input.getMove(cam.yaw, S.x, S.z); // Vector2 (world x, z), length 0..1 (camera-relative)
    let thrust = 0, brake = 0, ix = 0, iz = 0; // ix, iz: the way the player means to go (for the bank exit)
    if (eye) {
      // the view is the heading: the skater faces where the eyes look
      const hCam = cam.yaw - Math.PI;
      const dh = wrap(hCam - S.h);
      S.omega = (dh * (1 - Math.exp(-dt * 9))) / Math.max(dt, 1e-4);
      S.h = wrap(S.h + dh * (1 - Math.exp(-dt * 9)));
      const [fx, fz] = fwdOf(S.h);
      const f = mv.x * fx + mv.y * fz;
      if (f > 0.1) thrust = Math.min(1, f); else if (f < -0.25) brake = Math.min(1, -f);
      ix = fx * f; iz = fz * f;
    } else {
      const m = Math.min(1, mv.length());
      let cmd = 0;
      if (m > 0.12) {
        const target = Math.atan2(mv.x, mv.y), err = wrap(target - S.h), c = Math.cos(err);
        cmd = clamp(err * 2.6, -1, 1);
        thrust = m * clamp((c + 0.25) / 1.25, 0, 1);
        if (c < -0.6 && m > 0.5) brake = 0.8; // asking for the opposite way: snowplough while turning round
        ix = mv.x; iz = mv.y;
      }
      S.steer += (cmd - S.steer) * (1 - Math.exp(-dt * TUNE.steerRate));
      S.omega = S.steer * TUNE.turnMax * (0.55 + 0.45 * clamp(S.sp / 1.2, 0, 1));
      S.h = wrap(S.h + S.omega * dt);
    }
    if (S.twirlT >= 0 && (S.twirlT += dt) > TUNE.twirlDur) S.twirlT = -1;
    S.thrust = thrust;
    // velocity: along the facing direction (push / coast / brake), sideways slip fades (edges grip)
    const [fx, fz] = fwdOf(S.h);
    let vf = S.vx * fx + S.vz * fz;
    let lx = S.vx - vf * fx, lz = S.vz - vf * fz;
    const lk = Math.exp(-dt * GRIP);
    lx *= lk; lz *= lk;
    const cap = MAX_SP * (S.twirlT >= 0 ? 0.92 : 1);
    if (thrust > 0 && vf < cap * thrust) vf = Math.min(cap * thrust, vf + PUSH * dt);
    vf *= Math.exp(-dt * (COAST + brake * 2.6));
    S.vx = fx * vf + lx; S.vz = fz * vf + lz;
    S.sp = Math.hypot(S.vx, S.vz);
    let nx = S.x + S.vx * dt, nz = S.z + S.vz * dt;
    // ---- soft rim
    const ox = nx - L.center.x, oz = nz - L.center.z, mm = Math.hypot(ox / RX, oz / RZ);
    let touching = false;
    if (mm > 1) {
      touching = true;
      nx = L.center.x + ox / mm; nz = L.center.z + oz / mm;
      let ex = ox / (RX * RX), ez = oz / (RZ * RZ);
      const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
      const vn = S.vx * ex + S.vz * ez;
      if (vn > 0) {
        S.vx -= (1.22) * vn * ex; S.vz -= 1.22 * vn * ez; // soft bounce (a quarter of it comes back)
        S.vx *= 0.9; S.vz *= 0.9;
        if (vn > 0.5 && S.bumpT <= 0) { S.bumpT = 0.6; spray(nx, ICE_Y + 0.03, nz, 5, 0.4, 0.4, 0.024); sfx('ice', { vol: 0.35 }); }
      }
      // meaning to leave through the open west bank?
      const ang = Math.atan2(oz, ox);
      const inSector = ang >= EXIT_SECTOR[0] || ang <= EXIT_SECTOR[1] - 2 * Math.PI;
      const il = Math.hypot(ix, iz);
      if (inSector && il > 0.3 && (ix * ex + iz * ez) / il > 0.4 && S.sp < 1.1) S.exitT += dt; else S.exitT = Math.max(0, S.exitT - dt * 2);
    } else S.exitT = Math.max(0, S.exitT - dt * 2);
    S.bumpT = Math.max(0, S.bumpT - dt);
    S.dist += Math.hypot(nx - S.x, nz - S.z);
    S.x = nx; S.z = nz;
    if (touching && S.exitT > 0.35) { finish('bank'); return; }
  }

  // ---------------------------------------------------------------- render
  function apply(dt) {
    const { ch, skater } = R;
    const t = S.t;
    const hop = S.twirlT >= 0 ? Math.sin(Math.PI * (S.twirlT / TUNE.twirlDur)) * 0.03 : 0;
    skater.position.set(S.x, ICE_Y + BLADE_LIFT + hop, S.z);
    // player.pos / vel follow the skater: camera, districts, positional sounds and the shared town see where we are
    player.pos.set(S.x, ICE_Y + BLADE_LIFT, S.z);
    player.heading = S.h;
    if (input.eyeView) player.vel.set(0, 0); else player.vel.set(S.vx, S.vz);
    player.object.position.copy(player.pos);
    ch.yaw.rotation.y = S.h;
    let tw = 0, spin = 0;
    if (S.twirlT >= 0) { tw = S.twirlT / TUNE.twirlDur; spin = ease(tw) * Math.PI * 4; }
    ch.yaw.rotation.y = S.h + spin;
    const up = Math.sin(Math.PI * Math.min(1, tw * 1.25));
    const [aL, aR] = ch.arms, [lL, lR] = ch.legs;
    R.ph += S.sp * dt * 0.85;
    const beatK = Math.sin(Math.PI * frac(R.ph));
    const pushing = S.twirlT < 0 && (S.thrust > 0.08 || S.sp < 0.9) && S.sp > 0.05;
    const left = Math.floor(R.ph) % 2 === 0;
    const k6 = 1 - Math.exp(-dt * 6);
    ch.body.rotation.z = lerp(ch.body.rotation.z, clamp(-S.omega * 0.09, -0.22, 0.22), k6) * (1 - up);
    ch.body.rotation.x = lerp(0.04 + 0.1 * clamp(S.sp / MAX_SP, 0, 1), 0.02, up);
    ch.body.position.y = 0;
    const out = lerp(0.45, 1.25, clamp(S.sp / 1.6, 0, 1)) + Math.sin(t * 2) * 0.03;
    aL.rotation.set(-0.15 + 0.1 * beatK, 0, lerp(-out, -2.75, up));
    aR.rotation.set(-0.15 + 0.1 * beatK, 0, lerp(out, 2.75, up));
    const push = pushing ? 0.42 * beatK * clamp(0.4 + S.sp, 0, 1) : 0;
    lL.rotation.x = left ? push : 0;
    lR.rotation.x = (left ? 0 : push) + 0.55 * up;
    ch.body.scale.y = S.sp < 0.15 ? 1 + Math.sin(t * 2.2) * 0.012 : 1;
    skater.visible = cam.eye < 0.8; // eye view: the camera sits in the doll's head
    // trail
    const ty = ICE_Y + 0.013;
    const last = R.trailLast;
    if (S.sp > 0.25 && (!last || Math.hypot(S.x - last.x, S.z - last.z) > TRAIL_STEP)) {
      const hx = Math.sin(S.h), hz = Math.cos(S.h);
      R.trailArr.push({ x: S.x - hx * 0.05, z: S.z - hz * 0.05, a: 1 });
      if (R.trailArr.length > TRAIL_N) R.trailArr.shift();
      R.trailLast = R.trailArr[R.trailArr.length - 1];
    }
    const pts = R.trailArr, n = pts.length;
    for (let i = 0; i < n; i++) pts[i].a = Math.max(0, pts[i].a - dt * 0.55);
    R.tg.setDrawRange(0, Math.max(0, (n - 1) * 6));
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let dx = q.x - o.x, dz = q.z - o.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const w = 0.032 * (0.35 + 0.65 * (i / Math.max(1, n - 1)));
      R.tp.set([p.x - dz * w, ty, p.z + dx * w, p.x + dz * w, ty, p.z - dx * w], i * 6);
      const al = p.a * 0.5 * (0.25 + 0.75 * (i / Math.max(1, n - 1)));
      R.tc.set([0.62, 0.82, 0.97, al, 0.62, 0.82, 0.97, al], i * 8);
    }
    R.tg.attributes.position.needsUpdate = true; R.tg.attributes.color.needsUpdate = true;
    // puffs
    const { pool, puffs, M, Q, V, SC } = R;
    for (let i = 0; i < NP; i++) {
      const p = pool[i];
      if (p.t >= p.life) { if (p.s !== -1) { puffs.setMatrixAt(i, M.compose(V.set(0, -20, 0), Q.identity(), SC.setScalar(0.0001))); p.s = -1; } continue; }
      p.t += dt; p.vy -= 1.2 * dt; p.vx *= Math.exp(-dt * 2.5); p.vz *= Math.exp(-dt * 2.5);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life, s = p.s * (0.6 + k * 0.9) * (1 - k * k);
      puffs.setMatrixAt(i, M.compose(V.set(p.x, Math.max(ICE_Y + 0.01, p.y), p.z), Q.identity(), SC.setScalar(Math.max(0.0001, s))));
    }
    puffs.instanceMatrix.needsUpdate = true;
    // a soft scrape while gliding fast
    R.iceSfxT -= dt;
    if (S.sp > 1.3 && R.iceSfxT <= 0) { R.iceSfxT = 1.6; sfx('ice', { vol: 0.12 }); }
  }

  // ---------------------------------------------------------------- frame
  function update(dt) {
    if (!ride.active) return;
    if (game.state.phase !== 'play') { finish('stay'); return; }
    const d = Math.min(dt, 0.05);
    step(d);
    if (ride.active) apply(d);
  }

  // ---------------------------------------------------------------- end
  /** why: 'stay' (button / game change: stand where you are) or 'bank' (stepped off through the gap). */
  function finish(why) {
    if (!ride.active) return;
    ride.active = false;
    ride.lastEnd = { why, t: S.t, stack: new Error().stack.split('\n').slice(1, 5).join(' | ') }; // debug aid for tests (window.__ctx.rides.list)
    let x = S.x, z = S.z;
    if (why === 'bank') {
      const ox = S.x - L.center.x, oz = S.z - L.center.z, m = Math.hypot(ox / L.rx, oz / L.rz) || 1;
      const p = { x: L.center.x + (ox / m) * 1.14 + Math.sign(ox) * 0.15, z: L.center.z + (oz / m) * 1.14 };
      colliders.resolve(p, 0.12, p.x, p.z);
      const onIce = ((p.x - L.center.x) / L.rx) ** 2 + ((p.z - L.center.z) / L.rz) ** 2 < 1;
      if (onIce || colliders.blocked(p.x, p.z)) { p.x = SPOT.x; p.z = SPOT.z; }
      x = p.x; z = p.z;
    }
    const h = S.h;
    for (const o of R.offs) { try { o(); } catch (e) { /* ignore */ } }
    R.ui.remove();
    engine.scene.remove(R.root);
    R.ch.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const d of R.disp) { try { d.dispose(); } catch (e) { /* gone */ } }
    R.puffs.dispose?.();
    R = null;
    player.object.visible = saved ? saved.visible !== false : true;
    player.onStep = saved ? saved.onStep : null;
    player.teleport(x, z, h);
    player.object.position.copy(player.pos);
    input.clearTap();
    saved = null;
    ctx.rides.end(ride);
  }
  function stop() { finish('stay'); }

  window.__rideSkate = {
    ride, S,
    board: () => board(),
    /** tests: fast-forward n seconds with a fixed stick (x right, y up) in the current view */
    sim(sec, jx = 0, jy = 0) { input.setJoystick(jx, jy); for (let i = 0; i < sec * 30 && ride.active; i++) { step(1 / 30); if (ride.active) apply(1 / 30); } return { ...S, active: ride.active }; },
  };
  return ride;
}
