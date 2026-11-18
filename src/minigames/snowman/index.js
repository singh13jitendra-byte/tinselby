// Snowman Contest — Advent door 13 (Pinecone Park, ARENAS.snowman: the rolling lawn west of Pip). Owned by the snowman agent.
//
// 1. ROLL  (~40 s): walk with the town joystick / WASD / tap-to-walk; you push a snowball in front of you. It grows with
//    the distance it rolls (sparkly fresh-snow patches grow it 2.5× faster and get used up), leaves a green trail where
//    it picked the snow up, and you slow down as it grows. The ring gauge (bottom right) shows the size band for the
//    current ball: base 0.19–0.23, middle 0.14–0.17, head 0.09–0.12. Roll each ball into the glowing build ring.
// 2. STACK (~8 s): each upper ball swings over the stack: tap anywhere / Drop / Space when it's centred.
// 3. DRESS (~12 s): five rows of three big chips (eyes, nose, hat, scarf, arms), one tap each. Matching sets score best.
// 4. JUDGES: three knitted kids hold up felt cards 1–10 (rolling, stacking, style). Total / 30, see rules.js.
//
// Portrait + landscape: one long camera shot, re-fitted every frame to the screen aspect and to the UI bands at the
// top (framework HUD) and bottom (joystick, gauge, chips), so the lawn / snowman always sits in the free area.
// Cost while running (window.__snowman.budget(), shadow passes ×2): 8 calls / ~9k tris while rolling, peak 12 calls /
// ~40k tris while judging (3 knitted kids + shadow). Everything hangs off one root group (mg.add); geometry, textures, DOM and listeners are freed
// on dispose. The finished snowman is not kept after the game (keeps the scene child count unchanged).
import * as THREE from 'three';
import { P } from '../../core/yarn.js';
import { cone, cyl, sph, dot, rbox, torus, tube, extrude, part, xf, merge, poly, starPts, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';
import { crowdDollGeo } from '../sled/props.js';
import { ARENAS } from '../../core/layout.js';
import { isPortrait, zoomOut } from '../view.js';
import * as R from './rules.js';
import './snowman.css';

const TAU = Math.PI * 2;
const A = ARENAS.snowman || { x: -4.45, z: 12.25, r: 1.0, build: { x: -4.5, z: 12.8 } };
const C = { x: A.x, z: A.z }, RAD = A.r, B = { x: A.build.x, z: A.build.z };
const GROW = 0.0052; // radius gained per unit rolled (×2.5 on fresh snow)
const PATCH_BOOST = 2.5;
const SNOW = '#fbf9f4', SNOW2 = '#eef0f3', TRAIL = '#a7bf8f';
const KID_S = 0.92;
const KID_STYLE = { coat: 'teal', hat: 'bobble', scarf: 'red' };
const KID_TINT = [[1, 1, 1], [1.08, 0.86, 0.8], [0.82, 0.95, 1.1]];
// layout in camera space around the build spot: [right, toward camera]
const KID_AT = [[-0.98, 0.32], [0.55, 0.22], [0.95, 0.32]];
const WATCH_AT = [-0.72, -0.28];
const PARK_AT = [[-0.48, -0.05], [0.48, -0.05]];
const POSTS_AT = [[-0.8, -0.6], [0.8, -0.6]];

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const outBack = (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const ease = (k) => k * k * (3 - 2 * k);

const ICON = '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><ellipse cx="32" cy="58" rx="20" ry="4" fill="#e4e0d9"/><circle cx="32" cy="45" r="14" fill="#fbf9f4" stroke="#d9cdb6" stroke-width="2"/><circle cx="32" cy="25" r="10" fill="#fbf9f4" stroke="#d9cdb6" stroke-width="2"/><rect x="23" y="5" width="18" height="13" rx="2" fill="#2f2a29"/><rect x="18" y="16" width="28" height="4" rx="2" fill="#2f2a29"/><rect x="23" y="13" width="18" height="3" fill="#b8302d"/><circle cx="28" cy="23" r="1.8" fill="#2f2a29"/><circle cx="36" cy="23" r="1.8" fill="#2f2a29"/><path d="M32 26 l9 2 -9 1.6z" fill="#e0782c"/><path d="M22 33 q10 5 20 0 l1 4 q-11 5 -22 0z" fill="#b8302d"/><circle cx="32" cy="42" r="1.8" fill="#2f2a29"/><circle cx="32" cy="48" r="1.8" fill="#2f2a29"/></svg>';

let lastExit = { time: -1e9 };

export default {
  id: 'snowman',
  title: 'Snowman Contest',
  district: 'park',
  icon: ICON,
  intro: 'Push a snowball round the lawn: it grows as it rolls, faster on sparkly snow. Roll a big base, a middle and a small head into the glowing ring, stack them, then dress your snowman. Tilly\'s friends love things that go together!',
  async start(ctx, mg) {
    const { engine, player, cam, colliders, input } = ctx;
    const params = ctx.params || new URLSearchParams(location.search);
    const sfx = (name, o) => { try { ctx.audio?.sfx?.(name, o); } catch (e) { /* audio is optional */ } };
    const rnd = Math.random;
    const touch = params.has('smtouch') || engine.isMobile || matchMedia('(pointer: coarse)').matches;

    const root = mg.add(new THREE.Group());
    root.name = 'snowman-contest';
    const owned = [];
    const own = (x) => { owned.push(x); return x; };

    // camera-space axes (the town camera looks north-north-west; joystick directions follow cam.yaw)
    const Y = cam.yaw ?? 0.28;
    const RIGHT = { x: Math.cos(Y), z: -Math.sin(Y) }, TOWARD = { x: Math.sin(Y), z: Math.cos(Y) };
    const at = (r, t, base = B) => ({ x: base.x + RIGHT.x * r + TOWARD.x * t, z: base.z + RIGHT.z * r + TOWARD.z * t });
    const gy = (x, z) => colliders.heightAt(x, z);
    const GY = gy(B.x, B.z);

    // ------------------------------------------------------------------ meshes
    const props = new THREE.Mesh(own(buildProps()), engine.mat);
    props.castShadow = props.receiveShadow = true;
    root.add(props);

    const ring = new THREE.Mesh(own(merge([
      xf(torus(0.3, 0.02, '#ffd27a', GLOW, TAU, 40, 6), [0, 0, 0], [Math.PI / 2, 0, 0]),
      ...Array.from({ length: 10 }, (_, i) => xf(dot(0.022, i % 2 ? '#ff8a6a' : '#fff1c2', GLOW), [Math.cos((i / 10) * TAU) * 0.3, 0.02, Math.sin((i / 10) * TAU) * 0.3])),
    ])), engine.mat);
    ring.position.set(B.x, GY + 0.012, B.z);
    root.add(ring);

    const ballGeo = own(ballGeometry());
    const balls = new THREE.InstancedMesh(ballGeo, engine.mat, 3);
    balls.castShadow = balls.receiveShadow = true;
    const trailN = 240;
    const trail = new THREE.InstancedMesh(own(part(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), TRAIL, FELT)), engine.mat, trailN);
    trail.receiveShadow = true;
    const patchGeo = own(patchGeometry());
    const patchesM = new THREE.InstancedMesh(patchGeo, engine.mat, 6);
    patchesM.receiveShadow = true;
    const puffs = new THREE.InstancedMesh(own(dot(1, SNOW, FELT)), engine.mat, 48);
    const kidGeo = own(crowdDollGeo(engine.mat, KID_STYLE));
    kidGeo.computeBoundingBox();
    const kidTop = kidGeo.boundingBox.max.y * KID_S;
    const kidsM = new THREE.InstancedMesh(kidGeo, engine.mat, 3);
    kidsM.castShadow = true; kidsM.receiveShadow = true;
    const tint = new THREE.Color();
    for (let i = 0; i < 3; i++) kidsM.setColorAt(i, tint.setRGB(...KID_TINT[i])); // allocate instance colours up front
    for (const m of [balls, trail, patchesM, puffs, kidsM]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); }
    const decor = new THREE.Mesh(new THREE.BufferGeometry(), engine.mat);
    decor.castShadow = decor.receiveShadow = true;
    decor.position.set(B.x, GY, B.z);
    decor.rotation.y = Y;
    decor.visible = false;
    root.add(decor);

    // felt score cards (one 384×128 canvas atlas, three quads)
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 384; cardCanvas.height = 128;
    const cardTex = own(new THREE.CanvasTexture(cardCanvas));
    cardTex.colorSpace = THREE.SRGBColorSpace;
    const cardMat = own(new THREE.MeshLambertMaterial({ map: cardTex, side: THREE.DoubleSide, alphaTest: 0.5 }));
    const cards = [0, 1, 2].map((i) => {
      const g = own(new THREE.PlaneGeometry(0.17, 0.17));
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
      const m = new THREE.Mesh(g, cardMat);
      m.visible = false;
      root.add(m);
      m.rotation.order = 'YXZ';
      return m;
    });

    // ------------------------------------------------------------------ DOM
    const ui = document.createElement('div');
    ui.className = 'sm-ui';
    ctx.uiRoot.insertBefore(ui, ctx.uiRoot.querySelector('.mg-layer'));
    const gauge = el('div', 'knit-card sm-gauge', ui);
    gauge.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="sm-g-bg" cx="50" cy="50" r="46"/><circle class="sm-g-band" cx="50" cy="50"/><circle class="sm-g-ball" cx="50" cy="50"/><circle class="sm-g-min" cx="50" cy="50"/><circle class="sm-g-max" cx="50" cy="50"/></svg><div class="sm-g-label"></div>`;
    const G = { band: gauge.querySelector('.sm-g-band'), ball: gauge.querySelector('.sm-g-ball'), min: gauge.querySelector('.sm-g-min'), max: gauge.querySelector('.sm-g-max'), label: gauge.querySelector('.sm-g-label') };
    gauge.hidden = true;
    const dropBtn = el('button', 'knit-btn green sm-drop interactive', ui);
    dropBtn.textContent = 'Drop!';
    dropBtn.hidden = true;
    dropBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dropNow(); });
    const deck = el('div', 'sm-deck', ui);
    deck.hidden = true;
    const deckTitle = el('div', 'knit-card sm-deck-title', deck);
    const chipRow = el('div', 'sm-chips', deck);
    const chips = [0, 1, 2].map((j) => {
      const b = el('button', 'knit-btn cream sm-chip interactive', chipRow);
      b.addEventListener('click', (e) => { e.stopPropagation(); choose(j); });
      return b;
    });
    let hint = null;
    if (!touch) { hint = el('div', 'knit-card sm-hint', ui); hint.innerHTML = 'Push with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows · or click where to go'; }
    const labels = [];
    const bubbles = [];

    mg.onKey((e) => {
      const k = e.key.toLowerCase();
      if (phase === 'stack' && (k === ' ' || k === 'enter')) { e.preventDefault(); dropNow(); }
      if (phase === 'dress' && (k === '1' || k === '2' || k === '3')) choose(+k - 1);
    });
    mg.onTap(() => { if (phase === 'stack') dropNow(); });

    // ------------------------------------------------------------------ park life steps aside
    const showPark = ctx.life?.hideDistrict ? ctx.life.hideDistrict('park') : () => {};

    // ------------------------------------------------------------------ state
    const quick = engine.time - lastExit.time < 2.5;
    const pre = quick && lastExit.pre ? lastExit.pre : { x: player.pos.x, z: player.pos.z, h: player.heading };
    const start = at(0.62, -0.62, C);
    player.teleport(start.x, start.z, Math.atan2(C.x - start.x, C.z - start.z));
    player.walkTo(start.x, start.z); // replaces any scripted walk still pending (e.g. Play again right after a run); ends on the next frame
    let walking = false;
    mg.setPlayerControl(false);

    let phase = 'intro', T = 0, phaseT = 0, rollTime = 0, shownSec = -1;
    const ballsS = []; // { r, x, y, z, q: Quaternion, state, i, park?, off? }
    let cur = null; // the ball being rolled / stacked
    const lastP = { x: player.pos.x, z: player.pos.z };
    let rolledSinceStep = 0, trailAcc = 0, trailHead = 0, trailCount = 0, hintT = 0, bandSaid = -1;
    const trailBuf = []; // { x, y, z, s, t }
    const patches = [];
    const puffList = [];
    const offsets = [0, 0], amps = [0.1, 0.1];
    let stackIdx = 1, swingT = 0, fall = null;
    const picks = {};
    let dressRow = 0, dressT = 0, lockChips = 0, slotOrder = [];
    let result = null, judgeT = 0, judgeStep = -1, endT = 0;
    let bot = params.has('mgauto') ? 1 : 0, botT = 0, botWp = null, botPhase = 0, botTarget = null, botTapAt = null;
    const kidPose = KID_AT.map(([r, t], i) => ({ ...at(r, t), s: 0, hop: 0, pop: -1, i }));
    for (const k of kidPose) { // face the camera, turned a little towards the snowman
      const dx = B.x - k.x, dz = B.z - k.z, d = Math.hypot(dx, dz) || 1;
      k.face = Math.atan2(TOWARD.x * 0.8 + (dx / d) * 0.45, TOWARD.z * 0.8 + (dz / d) * 0.45);
    }
    let ringS = 1, decorPop = 0;
    const timers = []; // game-time timers (so ff() / slow frames stay in step)
    const later = (sec, fn) => timers.push({ t: sec, fn });
    const V = new THREE.Vector3(), V2 = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), Q1 = new THREE.Quaternion(), SC = new THREE.Vector3(), AX = new THREE.Vector3(), EU = new THREE.Euler();

    // ------------------------------------------------------------------ camera: one long shot, aspect-fitted every frame
    const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), goalPos = new THREE.Vector3(), goalTgt = new THREE.Vector3();
    const uiBand = { top: 0, bottom: 0, t: 1 }; // free band between the framework HUD and our bottom controls (px)
    frame(0, true);
    cam.playShot({
      name: 'snowman', duration: 1e6, blendIn: quick ? 0.0001 : 0.9, blendOut: 0.6, skippable: false, tilt: 1.0, portrait: false,
      post: { bloom: 0.9, glow: 0.9, threshold: 0.04, band: 0.2, falloff: 0.4 },
      update(u, out) { out.pos.copy(camPos); out.target.copy(camTgt); },
    });

    // patches of fresh sparkly snow
    for (let i = 0; i < 6; i++) patches.push(newPatch(i, (i / 6) * TAU + 0.4));
    mg.addUpdate(update);
    mg.onDispose(dispose);
    exposeDebug();

    await mg.intro();
    if (mg.finished) return;
    beginRoll();

    // ================================================================== per frame
    function update(dt) {
      dt = Math.min(dt, 0.05);
      T += dt; phaseT += dt;
      for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); }
      if (bot) runBot(dt);
      if (phase === 'roll') updateRoll(dt);
      else if (phase === 'stack') updateStack(dt);
      else if (phase === 'dress') updateDress(dt);
      else if (phase === 'judge') updateJudge(dt);
      lastP.x = player.pos.x; lastP.z = player.pos.z;
      updatePatches(dt);
      updatePuffs(dt);
      writeInstances(dt);
      updateLabels(dt);
      frame(dt, false);
    }

    // ------------------------------------------------------------------ ROLL
    function beginRoll() {
      phase = 'roll'; phaseT = 0;
      mg.setPlayerControl(true);
      newBall(0);
      gauge.hidden = false;
      mg.hud.setTimer(R.ROLL_LIMIT);
      mg.hud.setScore('0/3', 'Balls');
      goal();
      if (hint) later(9, () => hint?.classList.add('off'));
    }
    function goal() {
      if (phase === 'roll' && cur) {
        const b = R.BANDS[cur.i];
        mg.hud.setGoal(cur.r < b.min ? `Roll a ${cur.i === 0 ? 'big base' : cur.i === 1 ? 'middle' : 'small head'} ball` : cur.r <= b.max ? 'Just right! Roll it into the ring' : 'A bit big! Into the ring');
      }
    }
    function newBall(i) {
      const h = player.heading;
      cur = { i, r: R.START_R, x: player.pos.x + Math.sin(h) * 0.17, z: player.pos.z + Math.cos(h) * 0.17, y: 0, q: new THREE.Quaternion(), state: 'roll', pop: 0 };
      cur.y = gy(cur.x, cur.z) + cur.r * 0.93;
      ballsS.push(cur);
      bandSaid = -1;
      sfx('pop', { vol: 0.5 });
      updateGauge();
    }
    function speedFactor(r) { return 1 - 1.5 * (r - R.START_R); }
    function obstacles() { return ballsS.filter((b) => b !== cur && (b.state === 'parked' || b.state === 'settle')); }
    function updateRoll(dt) {
      rollTime += dt;
      const left = R.ROLL_LIMIT - rollTime;
      const s = Math.ceil(Math.max(0, left));
      if (s !== shownSec) { shownSec = s; mg.hud.setTimer(left); if (s <= 5 && s > 0) sfx('countdown', { vol: 0.3 }); }
      if (left <= 0) { timeUp(); return; }
      if (!cur) return;
      // the player slows down as the ball grows (scale this frame's walk)
      const k = speedFactor(cur.r) * (onPatch(cur) ? 0.9 : 1);
      player.pos.x = lastP.x + (player.pos.x - lastP.x) * k;
      player.pos.z = lastP.z + (player.pos.z - lastP.z) * k;
      // stay near the lawn
      let dx = player.pos.x - C.x, dz = player.pos.z - C.z, d = Math.hypot(dx, dz);
      if (d > RAD + 0.45) { const m = (d - RAD - 0.45) * Math.min(1, dt * 10) / d; player.pos.x -= dx * m; player.pos.z -= dz * m; }
      // walk round the dropped balls
      for (const o of obstacles()) pushOut(player.pos, o, o.r + 0.09);
      // the ball sits in front of the player
      const h = player.heading, reach = 0.12 + cur.r;
      const tx = player.pos.x + Math.sin(h) * reach, tz = player.pos.z + Math.cos(h) * reach;
      const f = 1 - Math.exp(-dt * 16);
      const nx = { x: lerp(cur.x, tx, f), z: lerp(cur.z, tz, f) };
      // delivery
      const db = Math.hypot(nx.x - B.x, nx.z - B.z);
      const base = ballsS[0];
      const under = cur.r < R.BANDS[cur.i].min; // still small: you have to push it right in (no accidental drops in passing)
      const reachRing = cur.i === 0 ? db < (under ? 0.12 : 0.22) : db < base.r + cur.r + (under ? 0.025 : 0.1);
      if (reachRing && cur.r >= R.MIN_R[cur.i]) { moveBall(nx.x, nx.z); deliver(); return; }
      if (reachRing && hintT <= 0) { hintT = 2.5; label(V.set(cur.x, cur.y + cur.r + 0.12, cur.z), 'Keep rolling: too small!', 'small'); }
      hintT -= dt;
      // the lawn edge, colliders and the dropped balls stop the ball (and so the player behind it)
      const ox = nx.x, oz = nx.z;
      dx = nx.x - C.x; dz = nx.z - C.z; d = Math.hypot(dx, dz);
      const lim = RAD - cur.r * 0.3;
      if (d > lim) { nx.x = C.x + (dx / d) * lim; nx.z = C.z + (dz / d) * lim; }
      for (const o of obstacles()) pushOut(nx, o, o.r + cur.r);
      if (cur.i > 0) pushOut(nx, base, base.r + cur.r);
      colliders.resolve(nx, cur.r * 0.8, cur.x, cur.z);
      const cx = nx.x - ox, cz = nx.z - oz;
      if (cx || cz) { player.pos.x += cx; player.pos.z += cz; }
      player.object.position.x = player.pos.x; player.object.position.z = player.pos.z;
      const ds = moveBall(nx.x, nx.z);
      // growth
      if (ds > 0) {
        const boost = eatPatch(cur, ds) ? PATCH_BOOST : 1;
        cur.r = Math.min(R.CAP_R, cur.r + ds * GROW * boost);
        trailAcc += ds; rolledSinceStep += ds;
        if (trailAcc > Math.max(0.04, cur.r * 0.4)) { trailAcc = 0; dropTrail(cur); }
        if (rolledSinceStep > 0.4) { rolledSinceStep = 0; sfx('step', { vol: 0.35 }); }
        if (boost > 1 && rnd() < ds * 30) puff(V.set(cur.x, cur.y - cur.r * 0.6, cur.z), 1, 0.5);
      }
      cur.y = gy(cur.x, cur.z) + cur.r * 0.93;
      updateGauge();
    }
    function moveBall(x, z) {
      const dx = x - cur.x, dz = z - cur.z, ds = Math.hypot(dx, dz);
      if (ds > 1e-5) { AX.set(dz / ds, 0, -dx / ds); Q1.setFromAxisAngle(AX, ds / cur.r); cur.q.premultiply(Q1); }
      cur.x = x; cur.z = z;
      return ds;
    }
    function pushOut(p, o, min) {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      if (d < min && d > 1e-6) { p.x = o.x + (dx / d) * min; p.z = o.z + (dz / d) * min; }
    }
    function deliver() {
      const b = cur, i = b.i, band = R.BANDS[i];
      b.state = 'settle'; b.t = 0; b.from = { x: b.x, y: b.y, z: b.z };
      const spot = i === 0 ? B : at(PARK_AT[i - 1][0] * (1 + ballsS[0].r * 1.6), PARK_AT[i - 1][1]);
      b.park = { x: spot.x, z: spot.z, y: gy(spot.x, spot.z) + b.r * (i === 0 ? 0.9 : 0.93) };
      const inBand = b.r >= band.min && b.r <= band.max;
      label(V.set(b.x, b.y + b.r + 0.1, b.z), inBand ? 'Just right!' : b.r < band.min ? 'A little small' : 'A bit big!', inBand ? 'good' : 'small');
      sfx(inBand ? 'bell' : 'pop', { vol: 0.6 });
      puff(V.set(b.x, b.y, b.z), 8, 0.9);
      mg.hud.setScore(`${i + 1}/3`, 'Balls');
      cur = null;
      if (i < 2) {
        ringS = (ballsS[0].r + 0.17) / 0.3;
        later(0.45, () => { if (phase === 'roll' && !cur) { newBall(i + 1); goal(); } });
        mg.hud.setGoal(i === 0 ? 'Now a middle ball' : 'Now a small head');
      } else beginStack();
    }
    function timeUp() {
      label(V.set(B.x, 0.5, B.z), "Time's up! Let's stack", 'big');
      // deliver what you have; missing balls appear at their smallest size
      if (cur) { cur.r = Math.max(cur.r, R.MIN_R[cur.i]); deliver(); }
      while (ballsS.length < 3 && phase === 'roll') {
        const i = ballsS.length;
        cur = { i, r: R.MIN_R[i], x: B.x, z: B.z, y: 0, q: new THREE.Quaternion(), state: 'roll', pop: 1 };
        ballsS.push(cur);
        deliver();
      }
    }
    function dropTrail(b) {
      const e = { x: b.x, y: gy(b.x, b.z) + 0.006 + (trailHead % 7) * 0.0004, z: b.z, s: b.r * 0.85, t: T };
      trailBuf[trailHead] = e;
      trailHead = (trailHead + 1) % trailN;
      trailCount = Math.min(trailN, trailCount + 1);
    }

    // ------------------------------------------------------------------ fresh snow patches
    function newPatch(i, ang) {
      for (let tries = 0; tries < 30; tries++) {
        const a = ang != null && tries === 0 ? ang : rnd() * TAU, rr = 0.35 + rnd() * 0.45;
        const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
        if (Math.hypot(x - B.x, z - B.z) < 0.5) continue;
        if (patches.some((p) => p !== patches[i] && p.amount > 0 && Math.hypot(p.x - x, p.z - z) < 0.42)) continue;
        if (ballsS.some((b) => b.state !== 'roll' && Math.hypot(b.x - x, b.z - z) < b.r + 0.2)) continue;
        return { x, z, amount: 1, show: 0, wait: 0, rad: 0.15 + rnd() * 0.04, ry: rnd() * TAU };
      }
      return { x: C.x, z: C.z - 0.4, amount: 1, show: 0, wait: 0, rad: 0.16, ry: 0 };
    }
    function onPatch(b) { return patches.some((p) => p.amount > 0.05 && Math.hypot(p.x - b.x, p.z - b.z) < p.rad + b.r * 0.6); }
    function eatPatch(b, ds) {
      let hit = false;
      for (const p of patches) {
        if (p.amount <= 0.05 || Math.hypot(p.x - b.x, p.z - b.z) > p.rad + b.r * 0.6) continue;
        hit = true;
        p.amount -= ds * 2.2;
        if (p.amount <= 0.05) { p.amount = 0; p.wait = 3 + rnd() * 2; sfx('pop', { vol: 0.3 }); }
      }
      return hit;
    }
    function updatePatches(dt) {
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i];
        if (p.amount <= 0) { p.wait -= dt; p.show = Math.max(0, p.show - dt * 4); if (p.wait <= 0 && phase === 'roll') { patches[i] = newPatch(i); } continue; }
        p.show = Math.min(1, p.show + dt * 2.5);
      }
    }

    // ------------------------------------------------------------------ STACK
    function beginStack() {
      phase = 'stack'; phaseT = 0; stackIdx = 1; swingT = -0.9; fall = null;
      mg.setPlayerControl(false);
      input.clearTap();
      const w = at(...WATCH_AT);
      walking = true;
      player.walkTo(w.x, w.z).then(() => { walking = false; if (!mg.finished) player.faceTowards(B.x, B.z); });
      mg.hud.setTimer(null);
      gauge.hidden = true;
      hint?.remove(); hint = null;
      for (const p of patches) { p.amount = 0; p.wait = 1e9; }
      mg.hud.setGoal('Tap to drop it in the middle!');
      dropBtn.hidden = false;
    }
    function stackTop(i) { // y of the top of ball i (stacked)
      const b = ballsS[i];
      return b.y + b.r * 0.9;
    }
    function updateStack(dt) {
      // settle animations of delivered balls finish first
      if (ballsS.some((b) => b.state === 'settle')) return;
      const b = ballsS[stackIdx], below = ballsS[stackIdx - 1];
      if (!b) return;
      const A0 = amps[stackIdx - 1] = below.r * 0.5 + 0.04;
      const period = stackIdx === 1 ? 1.6 : 1.25;
      const hoverY = stackTop(stackIdx - 1) + b.r + 0.2;
      if (b.state === 'parked') { b.state = 'lift'; b.t = 0; b.from = { x: b.x, y: b.y, z: b.z }; b.q.identity(); sfx('whoosh', { vol: 0.4 }); }
      if (b.state === 'lift') {
        b.t += dt;
        const u = Math.min(1, b.t / 0.6), e = ease(u);
        const off = A0; // arrives at the right-hand end of the swing
        b.x = lerp(b.from.x, below.x + RIGHT.x * off, e); b.z = lerp(b.from.z, below.z + RIGHT.z * off, e);
        b.y = lerp(b.from.y, hoverY, e) + Math.sin(u * Math.PI) * 0.25;
        if (u >= 1) { b.state = 'swing'; swingT = 0; }
        ring.position.set(below.x, stackTop(stackIdx - 1) + 0.004, below.z);
        ringS = below.r * 0.42 / 0.3;
        return;
      }
      if (b.state === 'swing') {
        swingT += dt;
        b.off = A0 * Math.cos((swingT / period) * TAU);
        b.x = below.x + RIGHT.x * b.off; b.z = below.z + RIGHT.z * b.off;
        b.y = hoverY + Math.sin((swingT / period) * TAU * 2) * 0.012;
        if (swingT > period * 3.25) dropNow(); // nobody tapped: it drops by itself
        return;
      }
      if (b.state === 'fall') {
        b.t += dt;
        const landY = stackTop(stackIdx - 1) + b.r * 0.8;
        const u = Math.min(1, b.t / 0.24);
        b.y = lerp(fall.y0, landY, u * u);
        const land = fall.land;
        b.x = lerp(fall.x0, below.x + RIGHT.x * land, u); b.z = lerp(fall.z0, below.z + RIGHT.z * land, u);
        if (u >= 1) {
          b.state = 'stacked'; b.t = 0; b.y = landY;
          const acc = R.stackAcc(offsets[stackIdx - 1], A0);
          label(V.set(b.x, b.y + b.r + 0.08, b.z), acc >= 0.85 ? 'Perfect!' : acc >= 0.5 ? 'Nice!' : 'Wobbly!', acc >= 0.85 ? 'good' : acc >= 0.5 ? '' : 'small');
          sfx(acc >= 0.85 ? 'bell' : 'pop', { vol: 0.6 });
          puff(V.set(b.x, b.y - b.r * 0.7, b.z), 7, 0.8);
          b.wob = 1 - acc;
          stackIdx++;
          if (stackIdx > 2) later(0.65, () => { if (phase === 'stack') beginDress(); });
          else swingT = -0.4;
        }
      }
    }
    function dropNow() {
      if (phase !== 'stack') return;
      const b = ballsS[stackIdx], below = ballsS[stackIdx - 1];
      if (!b || b.state !== 'swing') return;
      const A0 = amps[stackIdx - 1];
      offsets[stackIdx - 1] = b.off;
      const land = clamp(b.off, -below.r * 0.55, below.r * 0.55);
      fall = { y0: b.y, x0: b.x, z0: b.z, land };
      b.state = 'fall'; b.t = 0;
      sfx('whoosh', { vol: 0.35 });
      void A0;
    }

    // ------------------------------------------------------------------ DRESS
    function beginDress() {
      phase = 'dress'; phaseT = 0; dressRow = 0; dressT = 0;
      dropBtn.hidden = true;
      ring.visible = false;
      slotOrder = R.SLOTS.map(() => shuffle([0, 1, 2]));
      deck.hidden = false;
      mg.hud.setGoal('Dress your snowman!');
      showRow();
      rebuildDecor();
      decor.visible = true;
    }
    function showRow() {
      const s = R.SLOTS[dressRow];
      deckTitle.innerHTML = `<b>${s.label}</b> <span>${dressRow + 1} / ${R.SLOTS.length}</span>`;
      chips.forEach((b, j) => {
        const c = s.choices[slotOrder[dressRow][j]];
        b.innerHTML = `${chipIcon(s.slot, c.key)}<span>${c.label}</span>`;
        b.classList.remove('picked');
        b.disabled = false;
      });
      lockChips = 0.25;
      dressT = 0;
    }
    function choose(j) {
      if (phase !== 'dress' || lockChips > 0 || dressRow >= R.SLOTS.length) return;
      const s = R.SLOTS[dressRow];
      const c = s.choices[slotOrder[dressRow][j]];
      picks[s.slot] = c.key;
      chips[j].classList.add('picked');
      chips.forEach((b) => { b.disabled = true; });
      sfx('ui');
      sfx('pop', { vol: 0.4 });
      rebuildDecor();
      decorPop = 1;
      lockChips = 1e9;
      later(0.38, () => {
        if (phase !== 'dress') return;
        dressRow++;
        if (dressRow >= R.SLOTS.length) beginJudge();
        else showRow();
      });
    }
    function updateDress(dt) {
      lockChips -= dt;
      dressT += dt;
      if (dressT > 25 && lockChips < 0) choose(Math.floor(rnd() * 3)); // nobody's there: pick for them
    }

    // ------------------------------------------------------------------ JUDGES
    function beginJudge() {
      phase = 'judge'; phaseT = 0; judgeT = 0; judgeStep = -1;
      deck.hidden = true;
      result = R.judge({ radii: ballsS.map((b) => b.r), offsets, amps, picks, rollTime });
      result.lines = R.comments(result, Math.floor(rnd() * 10));
      drawCards(result.cards);
      mg.hud.setGoal("Tilly's friends are judging…");
      kidsM.count = 3;
      kidPose.forEach((k, i) => { k.pop = -0.25 * i; k.s = 0; });
      sfx('cheer', { vol: 0.3 });
    }
    function updateJudge(dt) {
      judgeT += dt;
      for (const k of kidPose) { if (k.pop < 1) k.pop += dt / 0.45; k.hop = Math.max(0, k.hop - dt * 3); }
      const step = Math.floor((judgeT - 1.0) / 1.5);
      if (step > judgeStep && step <= 2 && judgeT >= 1.0) {
        judgeStep = step;
        const k = kidPose[step];
        k.hop = 1;
        cards[step].visible = true;
        bubble(k, `${R.JUDGES[step]}: ${result.lines[step]}`);
        sfx('bell', { vol: 0.55 + step * 0.1 });
        mg.hud.setScore(result.cards.slice(0, step + 1).reduce((a, b) => a + b, 0), 'Points');
      }
      if (judgeT > 1.0 + 1.5 * 3 && endT === 0) {
        endT = judgeT;
        for (const k of kidPose) k.hop = 1;
        sfx('cheer', { vol: 0.6 });
        label(V.set(B.x, stackTop(2) + 0.25, B.z), `${result.total} / 30`, 'big');
        mg.hud.setGoal('★'.repeat(result.stars));
      }
      if (endT && judgeT > endT + 1.8) finishGame();
    }
    function finishGame() {
      if (mg.finished) return;
      const c = result.cards;
      const text = `Rosie ${c[0]} · Theo ${c[1]} · Mabel ${c[2]} = ${result.total} / 30. ${result.lines[result.stars >= 3 ? 2 : c.indexOf(Math.max(...c))]}`;
      mg.finish({ score: result.total, stars: result.stars, text });
    }
    function drawCards(vals) {
      const g = cardCanvas.getContext('2d');
      g.clearRect(0, 0, 384, 128);
      vals.forEach((v, i) => {
        const x = i * 128;
        g.fillStyle = '#fff4e2'; roundRect(g, x + 6, 6, 116, 116, 18); g.fill();
        g.strokeStyle = '#b8302d'; g.lineWidth = 4; g.setLineDash([9, 7]); roundRect(g, x + 16, 16, 96, 96, 12); g.stroke(); g.setLineDash([]);
        g.fillStyle = v >= 9 ? '#b8302d' : '#3a2a24';
        g.font = '700 66px Fredoka, Nunito, "Trebuchet MS", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(v), x + 64, 68);
      });
      cardTex.needsUpdate = true;
    }

    // ------------------------------------------------------------------ instances + animation
    function writeInstances(dt) {
      // balls
      let n = 0;
      for (const b of ballsS) {
        if (b.state === 'settle') {
          b.t += dt * 2; // 0.5 s hop into place
          const u = Math.min(1, b.t), e = ease(u);
          b.x = lerp(b.from.x, b.park.x, e); b.z = lerp(b.from.z, b.park.z, e);
          b.y = lerp(b.from.y, b.park.y, e) + Math.sin(u * Math.PI) * 0.12;
          if (u >= 1) b.state = 'parked';
        }
        b.pop = Math.min(1, (b.pop || 0) + dt * 4);
        let s = b.r * (b.pop < 1 ? outBack(b.pop) : 1), sy = s;
        if (b.state === 'stacked' && b.t < 0.5) { b.t += dt; const w = Math.sin(b.t * 30) * (1 - b.t / 0.5) * 0.12; sy = s * (1 - w); s *= 1 + w * 0.5; }
        V.set(b.x, b.y, b.z); SC.set(s, sy, s);
        M4.compose(V, b.q, SC);
        balls.setMatrixAt(n++, M4);
      }
      balls.count = n;
      // trail (oldest discs shrink away)
      let nt = 0;
      for (let k = 0; k < trailCount; k++) {
        const e = trailBuf[(trailHead - 1 - k + trailN) % trailN];
        const fade = k > trailN - 40 ? (trailN - k) / 40 : 1;
        V.set(e.x, e.y, e.z); SC.set(e.s * fade, 1, e.s * fade);
        M4.compose(V, Q0, SC);
        trail.setMatrixAt(nt++, M4);
      }
      trail.count = nt;
      // patches
      let np = 0;
      for (const p of patches) {
        const s = p.show * (0.35 + 0.65 * p.amount);
        if (s <= 0.01) continue;
        V.set(p.x, gy(p.x, p.z) + 0.004, p.z);
        Q1.setFromAxisAngle(AX.set(0, 1, 0), p.ry + T * 0.3);
        const pul = 1 + Math.sin(T * 3 + p.ry) * 0.04;
        SC.set(p.rad * s * pul, p.rad * s * (0.6 + 0.4 * p.amount), p.rad * s * pul);
        M4.compose(V, Q1, SC);
        patchesM.setMatrixAt(np++, M4);
      }
      patchesM.count = np;
      // puffs
      let nq = 0;
      for (const q of puffList) { const k = 1 - q.t / q.life; V.copy(q.p); const s = q.r * (0.4 + 0.6 * k); SC.set(s, s, s); M4.compose(V, Q0, SC); puffs.setMatrixAt(nq++, M4); }
      puffs.count = nq;
      // judges
      if (kidsM.count) {
        kidPose.forEach((k, i) => {
          const pp = clamp(k.pop, 0, 1), s = KID_S * (pp > 0 ? outBack(pp) : 0);
          const hop = Math.sin(k.hop * Math.PI) * 0.09 + (endT ? Math.abs(Math.sin(T * 7 + i)) * 0.04 : 0);
          V.set(k.x, gy(k.x, k.z) + hop, k.z);
          Q1.setFromEuler(EU.set(0, k.face, 0));
          SC.set(s, s, s);
          M4.compose(V, Q1, SC);
          kidsM.setMatrixAt(i, M4);
          const c = cards[i];
          c.position.set(k.x, gy(k.x, k.z) + hop + kidTop * (s / KID_S) + 0.07, k.z);
          c.rotation.set(-0.12, Y, Math.sin(T * 5 + i) * 0.06);
          c.scale.setScalar(Math.max(0.001, s / KID_S));
        });
        kidsM.instanceMatrix.needsUpdate = true;
      }
      for (const m of [balls, trail, patchesM, puffs]) m.instanceMatrix.needsUpdate = true;
      // ring + decor
      if (ring.visible) { ring.rotation.y = T * 0.4; ring.scale.setScalar(ringS * (phase === 'stack' ? 1 : 1 + Math.sin(T * 4) * 0.04)); }
      if (decor.visible) {
        decorPop = Math.max(0, decorPop - dt * 3);
        const w = Math.sin(decorPop * Math.PI * 2) * decorPop * 0.05;
        decor.scale.set(1 + w, 1 - w, 1 + w);
      }
    }
    function puff(p, n, s) {
      for (let i = 0; i < n; i++) {
        if (puffList.length >= 48) puffList.shift();
        const a = rnd() * TAU, up = 0.4 + rnd() * 0.8, sp = (0.3 + rnd() * 0.5) * s;
        puffList.push({ p: p.clone(), v: new THREE.Vector3(Math.cos(a) * sp, up * s, Math.sin(a) * sp), t: 0, life: 0.35 + rnd() * 0.25, r: (0.016 + rnd() * 0.018) * s });
      }
    }
    function updatePuffs(dt) {
      for (let i = puffList.length - 1; i >= 0; i--) {
        const q = puffList[i];
        q.t += dt;
        if (q.t >= q.life) { puffList.splice(i, 1); continue; }
        q.v.y -= 3 * dt; q.v.multiplyScalar(1 - dt * 2.5); q.p.addScaledVector(q.v, dt);
        if (q.p.y < GY + 0.02) { q.p.y = GY + 0.02; q.v.y = 0; }
      }
    }

    // ------------------------------------------------------------------ decorations (one merged mesh, rebuilt per pick)
    function rebuildDecor() {
      const old = decor.geometry;
      const g = decorGeos(picks);
      decor.geometry = g.length ? merge(g) : new THREE.BufferGeometry();
      old.dispose();
    }
    function toLocal(b) {
      const dx = b.x - B.x, dz = b.z - B.z;
      return { x: dx * Math.cos(Y) - dz * Math.sin(Y), y: b.y - GY, z: dx * Math.sin(Y) + dz * Math.cos(Y), r: b.r };
    }
    function decorGeos(pk) {
      const g = [];
      const [lb, lm, lh] = ballsS.map(toLocal);
      if (!lh) return g;
      const on = (c, r, az, el, out = 0) => [c.x + (r + out) * Math.cos(el) * Math.sin(az), c.y + (r + out) * Math.sin(el), c.z + (r + out) * Math.cos(el) * Math.cos(az)];
      const rh = lh.r, rm = lm.r;
      const eyeCol = pk.eyes === 'berries' ? '#c4302e' : pk.eyes === 'buttons' ? '#8a5a36' : P.ink;
      // eyes, smile and body buttons
      if (pk.eyes) {
        for (const s of [-1, 1]) {
          const p = on(lh, rh, s * 0.36, 0.26, 0.004);
          if (pk.eyes === 'buttons') {
            g.push(xf(cyl(rh * 0.15, rh * 0.15, rh * 0.06, 10, '#b98250', FELT), p, [Math.PI / 2 - 0.26, s * 0.36, 0]));
            g.push(xf(dot(rh * 0.04, '#5c3a26'), on(lh, rh, s * 0.36, 0.26, rh * 0.04)));
          } else g.push(xf(sph(rh * (pk.eyes === 'coal' ? 0.12 : 0.11), eyeCol, GLOSS, 8, 6), p));
        }
        for (let i = 0; i < 5; i++) { const a = -0.42 + i * 0.21; g.push(xf(dot(rh * 0.055, eyeCol, GLOSS), on(lh, rh, a, -0.22 - 0.1 * (1 - (a / 0.42) ** 2), 0.002))); }
        for (const el of [0.32, 0.02, -0.28]) {
          const p = on(lm, rm, 0, el, 0.004);
          if (pk.eyes === 'buttons') g.push(xf(cyl(rm * 0.1, rm * 0.1, rm * 0.05, 10, '#b98250', FELT), p, [Math.PI / 2 - el, 0, 0]));
          else g.push(xf(sph(rm * 0.08, eyeCol, GLOSS, 8, 6), p));
        }
      }
      // nose
      if (pk.nose) {
        const p = on(lh, rh, 0, 0.02, -0.01);
        if (pk.nose === 'carrot') {
          const c = cone(rh * 0.15, rh * 0.8, 8, P.orange, FELT);
          g.push(xf(c, [p[0], p[1], p[2] + rh * 0.4], [Math.PI / 2, 0, 0]));
          for (let i = 1; i < 3; i++) g.push(xf(torus(rh * 0.15 * (1 - i * 0.28), rh * 0.012, '#b85a1c', KNIT, TAU, 10, 4), [p[0], p[1], p[2] + rh * 0.8 * i * 0.25]));
        } else if (pk.nose === 'pinecone') {
          g.push(xf(sph(rh * 0.16, '#7a4f33', FELT, 8, 6), [p[0], p[1], p[2] + rh * 0.16], null, [1, 1, 1.5]));
          for (let i = 0; i < 3; i++) g.push(xf(torus(rh * (0.14 - i * 0.03), rh * 0.025, '#5c3a26', KNIT, TAU, 10, 4), [p[0], p[1], p[2] + rh * (0.08 + i * 0.1)]));
        } else {
          g.push(xf(extrude(poly(starPts(rh * 0.3, rh * 0.13, 5)), rh * 0.08, P.gold, GLOSS), [p[0], p[1], p[2] + rh * 0.04]));
          g.push(xf(dot(rh * 0.06, '#fff1c2', GLOW), [p[0], p[1] + rh * 0.02, p[2] + rh * 0.14]));
        }
      }
      // hat
      if (pk.hat) {
        const top = [lh.x, lh.y + rh * 0.78, lh.z];
        if (pk.hat === 'top') {
          g.push(xf(cyl(rh * 1.0, rh * 1.0, rh * 0.07, 18, P.ink, FELT), top, [-0.1, 0, 0.08]));
          g.push(xf(cyl(rh * 0.62, rh * 0.66, rh * 0.9, 16, P.ink, FELT), [top[0] + rh * 0.04, top[1] + rh * 0.46, top[2] - rh * 0.045], [-0.1, 0, 0.08]));
          g.push(xf(cyl(rh * 0.665, rh * 0.672, rh * 0.18, 16, P.red, KNIT), [top[0] + rh * 0.01, top[1] + rh * 0.13, top[2] - rh * 0.012], [-0.1, 0, 0.08]));
          g.push(xf(dot(rh * 0.08, '#8fb35a'), [top[0] - rh * 0.4, top[1] + rh * 0.18, top[2] + rh * 0.48]));
        } else if (pk.hat === 'bobble') {
          g.push(xf(part(new THREE.SphereGeometry(rh * 0.98, 16, 7, 0, TAU, 0, Math.PI / 2), '#4f9590', KNIT, [(TAU * rh) / 0.08, (Math.PI * rh) / 0.064]), [lh.x, lh.y + rh * 0.36, lh.z], [-0.15, 0, 0.1], [1, 1.1, 1]));
          g.push(xf(torus(rh * 0.95, rh * 0.18, '#efe1c6', KNIT, TAU, 20, 6), [lh.x, lh.y + rh * 0.42, lh.z], [Math.PI / 2 - 0.15, 0.1, 0]));
          g.push(xf(sph(rh * 0.3, '#efe1c6', FELT, 10, 7), [lh.x + rh * 0.08, lh.y + rh * 1.42, lh.z - rh * 0.15]));
        } else {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            g.push(xf(sph(rh * 0.2, i % 2 ? '#2f6446' : '#4a8250', FELT, 8, 5), [lh.x + Math.sin(a) * rh * 0.72, lh.y + rh * 0.7, lh.z + Math.cos(a) * rh * 0.72], [0.5, a, 0], [1.6, 0.35, 0.8]));
          }
          for (const a of [-0.35, 0, 0.35]) g.push(xf(sph(rh * 0.1, '#d23a33', GLOSS, 8, 6), [lh.x + Math.sin(a) * rh * 0.72, lh.y + rh * 0.8, lh.z + Math.cos(a) * rh * 0.72]));
          g.push(xf(dot(rh * 0.09, '#fff1c2', GLOW), [lh.x, lh.y + rh * 0.86, lh.z + rh * 0.75]));
        }
      }
      // scarf (at the neck between head and middle)
      if (pk.scarf) {
        const col = pk.scarf === 'red' ? P.red : pk.scarf === 'gold' ? '#d9a13b' : '#3f6e45';
        const ny = lh.y - rh * 0.78;
        const R0 = Math.min(rh * 0.95, rm * 0.75);
        g.push(xf(torus(R0, rh * 0.24, col, KNIT, TAU, 22, 7), [lh.x, ny, lh.z], [Math.PI / 2, 0, 0]));
        if (pk.scarf === 'striped') for (let i = 0; i < 6; i++) g.push(xf(torus(R0, rh * 0.245, P.cream, KNIT, TAU / 22, 2, 7), [lh.x, ny, lh.z], [Math.PI / 2, 0, (i / 6) * TAU]));
        const tx = lh.x + R0 * 0.55, tz = lh.z + R0 * 0.75;
        const n = 4;
        for (let i = 0; i < n; i++) {
          const c = pk.scarf === 'striped' ? (i % 2 ? P.cream : col) : col;
          g.push(xf(rbox(rh * 0.42, rh * 0.36, rh * 0.12, rh * 0.04, c, KNIT, 1), [tx + i * rh * 0.04, ny - rh * 0.22 - i * rh * 0.34, tz + rh * 0.02 + i * rh * 0.06], [-0.2, 0.2, -0.12]));
        }
        for (let i = 0; i < 4; i++) g.push(xf(cyl(rh * 0.025, rh * 0.025, rh * 0.18, 4, pk.scarf === 'gold' ? '#fff1c2' : P.cream, KNIT), [tx + n * rh * 0.04 - rh * 0.15 + i * rh * 0.1, ny - rh * 0.3 - n * rh * 0.34, tz + n * rh * 0.06], [-0.2, 0.2, -0.12]));
      }
      // arms on the middle ball
      if (pk.arms) {
        for (const s of [-1, 1]) {
          const a0 = on(lm, rm, s * Math.PI / 2, 0.15, -rm * 0.05);
          const dir = s, up = s > 0 ? 0.55 : 0.25;
          const L = rm * 1.5;
          const a1 = [a0[0] + dir * L * 0.55, a0[1] + L * up * 0.5, a0[2] + 0.01];
          const a2 = [a0[0] + dir * L, a0[1] + L * up, a0[2] + 0.02];
          if (pk.arms === 'canes') {
            const pts = [a0, a1, a2, [a2[0] + dir * rm * 0.08, a2[1] + rm * 0.18, a2[2]], [a2[0] + dir * rm * 0.24, a2[1] + rm * 0.18, a2[2]], [a2[0] + dir * rm * 0.3, a2[1] + rm * 0.06, a2[2]]];
            g.push(tube(pts, rm * 0.07, '#f6efe4', KNIT, 20, 6));
            for (let i = 1; i < 5; i++) { const u = i / 5; g.push(xf(torus(rm * 0.072, rm * 0.026, P.red, KNIT, TAU, 10, 4), [lerp(a0[0], a2[0], u), lerp(a0[1], a2[1], u), lerp(a0[2], a2[2], u)], [0, 0, Math.PI / 2 - Math.atan2(a2[1] - a0[1], (a2[0] - a0[0]))])); }
          } else {
            g.push(tube([a0, a1, a2], rm * 0.055, P.woodDark, KNIT, 8, 5));
            const f = [lerp(a0[0], a2[0], 0.62), lerp(a0[1], a2[1], 0.62), a1[2]];
            g.push(tube([f, [f[0] + dir * rm * 0.25, f[1] + rm * 0.28, f[2] + 0.01]], rm * 0.035, P.woodDark, KNIT, 3, 4));
            if (pk.arms === 'mittens') {
              g.push(xf(sph(rm * 0.2, '#c4362f', KNIT, 10, 7), [a2[0] + dir * rm * 0.05, a2[1] + rm * 0.05, a2[2]], [0, 0, -dir * 0.5], [0.85, 1.15, 0.7]));
              g.push(xf(sph(rm * 0.08, '#c4362f', KNIT, 8, 6), [a2[0] - dir * rm * 0.08, a2[1] + rm * 0.16, a2[2] + rm * 0.05]));
              g.push(xf(torus(rm * 0.14, rm * 0.05, '#efe1c6', KNIT, TAU, 12, 5), [a2[0] - dir * rm * 0.06, a2[1] - rm * 0.1, a2[2]], [Math.PI / 2, 0, -dir * 0.5]));
            } else g.push(tube([a1, [a1[0] + dir * rm * 0.1, a1[1] - rm * 0.18, a1[2]]], rm * 0.03, P.woodDark, KNIT, 3, 4));
          }
        }
      }
      // rosy cheeks once the face is on
      if (pk.eyes) for (const s of [-1, 1]) g.push(xf(sph(rh * 0.14, '#f08f9c', FELT, 8, 6), on(lh, rh, s * 0.62, -0.05, -rh * 0.08), [0, s * 0.62, 0], [1, 0.75, 0.35]));
      return g;
    }

    // ------------------------------------------------------------------ camera framing (aspect-aware)
    function frame(dt, snap) {
      const portrait = isPortrait();
      const H = innerHeight, Wd = innerWidth;
      let cx, cy, cz, hw, hh, pitch, bottomPx;
      measureUI(dt);
      const topPx = Math.max(uiBand.top, portrait ? 96 : 64);
      if (phase === 'roll' || phase === 'intro') {
        const bx = cur ? cur.x : C.x, bz = cur ? cur.z : C.z;
        cx = lerp(C.x, bx, 0.28); cz = lerp(C.z, bz, 0.28); cy = 0.12 + GY;
        pitch = 50; hw = portrait ? 1.12 : 1.2; hh = 1.18 * Math.sin(THREE.MathUtils.degToRad(pitch)) + 0.14;
        bottomPx = portrait ? Math.max(uiBand.bottom, touch ? 160 : 40) : touch ? 24 : 46;
      } else {
        const sh = Math.max(0.6, ballsS.reduce((a, b) => a + b.r * 1.75, 0) + (phase === 'stack' ? 0.32 : 0.12));
        if (phase === 'judge') { const mid = at(0, 0.15); cx = mid.x; cz = mid.z; cy = GY + 0.38; hw = portrait ? 1.08 : 1.18; hh = Math.max(0.5, sh * 0.55); pitch = portrait ? 34 : 20; bottomPx = 16; }
        else if (phase === 'dress') { cx = B.x; cz = B.z; cy = GY + sh * 0.52; hw = 0.62; hh = sh * 0.55; pitch = 26; bottomPx = Math.max(uiBand.bottom, portrait ? 160 : 110); }
        else { cx = B.x; cz = B.z; cy = GY + sh * 0.5; hw = 0.72; hh = sh * 0.56; pitch = 24; bottomPx = portrait ? Math.max(uiBand.bottom, 140) : 24; }
      }
      const fov = THREE.MathUtils.degToRad(engine.camera.fov || 32), t = Math.tan(fov / 2), asp = Wd / Math.max(1, H);
      const uh = Math.max(0.35, 1 - (topPx + bottomPx) / H);
      const d = Math.max(hw / (t * asp * 0.94), hh / (t * uh));
      const p = THREE.MathUtils.degToRad(pitch);
      const cY = (bottomPx - topPx) / H; // NDC y of the free area's centre
      goalTgt.set(cx, cy, cz);
      goalPos.set(cx + Math.sin(Y) * Math.cos(p), cy + Math.sin(p), cz + Math.cos(Y) * Math.cos(p));
      zoomOut(goalPos, goalTgt, d); // goalPos was 1 unit from the target: push it out to the fitted distance
      const shift = -cY * d * t; // pan along the camera's up vector so the subject sits in the free band
      const ux = -Math.sin(Y) * Math.sin(p), uy = Math.cos(p), uz = -Math.cos(Y) * Math.sin(p);
      goalPos.x += ux * shift; goalPos.y += uy * shift; goalPos.z += uz * shift;
      goalTgt.x += ux * shift; goalTgt.y += uy * shift; goalTgt.z += uz * shift;
      if (snap) { camPos.copy(goalPos); camTgt.copy(goalTgt); return; }
      const k = 1 - Math.exp(-dt * (phase === 'roll' ? 3 : 2.2));
      camPos.lerp(goalPos, k); camTgt.lerp(goalTgt, k);
    }

    // the free band between the framework HUD (top) and our bottom controls, re-measured twice a second
    function measureUI(dt) {
      uiBand.t += dt || 0;
      if (uiBand.t < 0.5) return;
      uiBand.t = 0;
      let top = 0;
      for (const n of ctx.uiRoot.querySelectorAll('.mg-hud > *')) { if (n.hidden) continue; const r = n.getBoundingClientRect(); if (r.height && r.top < innerHeight * 0.4) top = Math.max(top, r.bottom); }
      let bottom = 0;
      for (const n of [deck, dropBtn, gauge]) { if (n.hidden) continue; const r = n.getBoundingClientRect(); if (r.height) bottom = Math.max(bottom, innerHeight - r.top); }
      uiBand.top = top + 8; uiBand.bottom = bottom + 10;
    }

    // ------------------------------------------------------------------ gauge, labels, bubbles
    function updateGauge() {
      if (!cur) return;
      const b = R.BANDS[cur.i], S = 42 / 0.26;
      G.band.setAttribute('r', ((b.min + b.max) / 2 * S).toFixed(1));
      G.band.setAttribute('stroke-width', ((b.max - b.min) * S).toFixed(1));
      G.min.setAttribute('r', (b.min * S).toFixed(1));
      G.max.setAttribute('r', (b.max * S).toFixed(1));
      G.ball.setAttribute('r', (cur.r * S).toFixed(1));
      const st = cur.r < b.min ? 0 : cur.r <= b.max ? 1 : 2;
      gauge.classList.toggle('ok', st === 1);
      gauge.classList.toggle('big', st === 2);
      const txt = `${b.label} · ${st === 0 ? 'keep rolling' : st === 1 ? 'just right!' : 'too big'}`;
      if (G.label.textContent !== txt) G.label.textContent = txt;
      if (st !== bandSaid) { if (bandSaid >= 0 || st > 0) { if (st === 1) sfx('bell', { vol: 0.4 }); goal(); } bandSaid = st; }
    }
    function screenOf(v) { V2.copy(v).project(engine.camera); return [((V2.x + 1) / 2) * innerWidth, ((1 - V2.y) / 2) * innerHeight]; }
    function placeAt(node, v, minY = 0) {
      let [x, y] = screenOf(v);
      const hw = (node.offsetWidth || 80) / 2 + 6;
      x = clamp(x, hw, Math.max(hw, innerWidth - hw));
      y = Math.max(y, minY || (isPortrait() ? 140 : 90));
      node.style.left = `${x.toFixed(1)}px`; node.style.top = `${y.toFixed(1)}px`;
    }
    function label(v, text, cls = '') {
      const n = el('div', 'sm-pop ' + cls, ui);
      n.textContent = text;
      if (cls.includes('big')) { n.style.left = '50%'; n.style.top = isPortrait() ? '34%' : '30%'; }
      else placeAt(n, v);
      labels.push({ el: n, t: 0, life: cls.includes('big') ? 1.6 : 1.1 });
    }
    function bubble(k, text) {
      for (const b of bubbles) b.el.remove();
      bubbles.length = 0;
      const n = el('div', 'sm-bubble', ui);
      n.textContent = text;
      const o = { el: n, k, t: 0 };
      bubbles.push(o);
      placeBubble(o);
    }
    function placeBubble(o) {
      // portrait: one bubble at a time, centred low over the judges; landscape: over the kid's card
      if (isPortrait()) { o.el.style.left = '50%'; o.el.style.top = `${Math.round(innerHeight * 0.26)}px`; o.el.classList.add('wide'); return; }
      placeAt(o.el, V.set(o.k.x, gy(o.k.x, o.k.z) + kidTop + 0.27, o.k.z), 100);
    }
    function updateLabels(dt) {
      for (let i = labels.length - 1; i >= 0; i--) { const l = labels[i]; l.t += dt; if (l.t > l.life) { l.el.remove(); labels.splice(i, 1); } }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.t += dt;
        if (b.t > 4.2) { b.el.remove(); bubbles.splice(i, 1); continue; }
        placeBubble(b);
      }
    }

    // ------------------------------------------------------------------ cleanup
    function dispose() {
      lastExit = { time: engine.time, pre };
      const lp = camPos.clone(), lt = camTgt.clone();
      cam.playShot({ name: 'snowman-out', duration: 0.8, blendIn: 0.0001, blendOut: 0.8, skippable: false, tilt: 1.0, portrait: false, update(u, out) { out.pos.copy(lp); out.target.copy(lt); } });
      showPark();
      input.clearTap();
      for (const l of labels) l.el.remove();
      for (const b of bubbles) b.el.remove();
      labels.length = 0; bubbles.length = 0;
      ui.remove();
      hint = null;
      player.teleport(pre.x, pre.z, pre.h);
      if (walking) player.walkTo(pre.x, pre.z); // cancels our walk to the watch spot (ends on the next frame)
      decor.geometry.dispose();
      for (const o of owned) o.dispose?.();
      owned.length = 0;
      if (window.__snowman && window.__snowman._owner === root) delete window.__snowman;
    }

    // ------------------------------------------------------------------ bot (mgauto / tests)
    // mode 1 = best (mid-band sizes, fresh snow first, centred drops, one theme), 2 = typical first try
    // (often a bit big, so-so drops, random outfit), 3 = hurried (smallest allowed balls, instant drops, first chips)
    function runBot(dt) {
      botT -= dt;
      if (phase === 'roll' && cur && cur.state === 'roll') {
        const b = R.BANDS[cur.i];
        if (botTarget == null || botTarget.i !== cur.i) {
          const t = bot === 1 ? (b.min + b.max) / 2 - 0.006 : bot === 2 ? b.max - 0.004 + rnd() * 0.03 : R.MIN_R[cur.i] + 0.002;
          botTarget = { i: cur.i, r: Math.min(t, R.CAP_R - 0.006) }; botPhase = 0; botWp = null;
        }
        if (cur.r < botTarget.r) {
          const near = !botWp || Math.hypot(player.pos.x - botWp.x, player.pos.z - botWp.z) < 0.12 || botT <= -2.5;
          if (near) {
            botT = 0;
            let wp = null;
            const clear = (ballsS[0].state === 'roll' ? 0.3 : ballsS[0].r + 0.12) + cur.r + 0.12;
            const ok = (c) => segDist(player.pos.x, player.pos.z, c.x, c.z, B.x, B.z) > clear && obstacles().every((o) => segDist(player.pos.x, player.pos.z, c.x, c.z, o.x, o.z) > o.r + cur.r + 0.1);
            if (bot === 1) {
              let bd = 9;
              for (const p of patches) { if (p.amount < 0.3 || p.show < 0.5 || !ok(p)) continue; const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd && d > 0.15) { bd = d; wp = { x: p.x, z: p.z }; } }
            }
            if (!wp) {
              const a0 = Math.atan2(player.pos.z - C.z, player.pos.x - C.x);
              for (let k = 1; k < 10 && !wp; k++) {
                const a = a0 + (0.7 + 0.15 * (k % 3)) * k * (bot === 2 ? -1 : 1), rr = 0.45 + 0.2 * ((k * 7) % 3) / 2;
                const c = { x: C.x + Math.cos(a) * rr, z: C.z + Math.sin(a) * rr };
                if (ok(c)) wp = c;
              }
            }
            botWp = wp || { x: C.x, z: C.z - 0.3 };
            input.setTap(botWp.x, botWp.z);
          }
        } else {
          // deliver: approach from the lawn side, then walk into the ring
          const ap = at(0, -0.62);
          if (botPhase === 0) { botWp = ap; input.setTap(ap.x, ap.z); botPhase = 1; }
          else if (botPhase === 1 && Math.hypot(player.pos.x - ap.x, player.pos.z - ap.z) < 0.15) { botPhase = 2; input.setTap(B.x, B.z); }
          else if (botPhase === 2 && !input.tapTarget) input.setTap(B.x, B.z);
          else if (botPhase === 1 && !input.tapTarget) input.setTap(ap.x, ap.z);
        }
      } else if (phase === 'stack') {
        const b = ballsS[stackIdx];
        if (b && b.state === 'swing') {
          const A0 = amps[stackIdx - 1];
          if (botTapAt == null || botTapAt.i !== stackIdx) botTapAt = { i: stackIdx, f: bot === 1 ? 0.05 : bot === 2 ? 0.15 + rnd() * 0.55 : 2, t: bot === 3 ? 0 : bot === 2 ? 0.6 + rnd() * 0.6 : 0.4 };
          botTapAt.t -= dt;
          if (botTapAt.t <= 0 && Math.abs(b.off) <= botTapAt.f * A0 + 1e-4) dropNow();
        }
      } else if (phase === 'dress' && lockChips < 0 && botT <= 0) {
        botT = bot === 3 ? 0.2 : 0.6;
        const s = R.SLOTS[dressRow];
        let j = 0;
        if (bot === 1) j = slotOrder[dressRow].findIndex((ix) => s.choices[ix].theme === 'classic');
        else if (bot === 2) j = Math.floor(rnd() * 3);
        choose(j);
      }
    }

    function exposeDebug() {
      const api = {
        _owner: root,
        get state() {
          return {
            phase, T: +T.toFixed(2), rollTime: +rollTime.toFixed(2), stackIdx, dressRow, picks: { ...picks },
            balls: ballsS.map((b) => ({ i: b.i, r: +b.r.toFixed(3), state: b.state, x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(3) })),
            player: [+player.pos.x.toFixed(2), +player.pos.z.toFixed(2)], offsets: offsets.map((o) => +o.toFixed(3)), amps: amps.map((o) => +o.toFixed(3)),
            patches: patches.map((p) => +p.amount.toFixed(2)), trail: trailCount, puffs: puffList.length, labels: labels.length,
            result: result && { cards: result.cards, total: result.total, stars: result.stars, theme: result.style.theme, lines: result.lines },
          };
        },
        bot(mode) { bot = mode | 0; botTarget = null; botTapAt = null; return bot; },
        ff(sec, step = 1 / 30) { for (let i = 0, n = Math.round(sec / step); i < n && !mg.finished; i++) { engine.time += step; for (const u of engine.updates.slice()) u.fn(step, engine.time); } return api.state; },
        /** Fast-forward until the phase changes (or the run ends); returns the state. */
        until(ph, maxSec = 120, step = 1 / 30) { let s = 0; while (phase !== ph && !mg.finished && s < maxSec) { api.ff(0.5, step); s += 0.5; } return api.state; },
        setSize(r) { if (cur) { cur.r = r; updateGauge(); } return api.state; },
        deliver() { if (cur && phase === 'roll') { cur.r = Math.max(cur.r, R.MIN_R[cur.i]); deliver(); } return api.state; },
        drop() { dropNow(); return api.state; },
        pick(j) { choose(j); return api.state; },
        setTime(s) { rollTime = R.ROLL_LIMIT - s; },
        budget() {
          let calls = 0, tris = 0;
          root.traverseVisible((o) => {
            if (!o.isMesh) return;
            const n = o.isInstancedMesh ? o.count : 1;
            const cnt = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position?.count || 0;
            if (!n || !cnt) return;
            const passes = o.castShadow ? 2 : 1;
            calls += passes;
            tris += (cnt / 3) * n * passes;
          });
          return { calls, tris: Math.round(tris) };
        },
      };
      window.__snowman = api;
    }

    // ================================================================== geometry
    function ballGeometry() {
      const R0 = 0.16; // stitch scale of a mid-sized ball, then normalised to radius 1 (instances scale by r)
      const g = [sph(R0, SNOW, FELT, 18, 12)];
      const bits = [[0.3, 0.5, P.woodDark], [2.1, -0.2, '#8fae58'], [4.0, 0.9, P.woodDark], [5.2, -0.8, '#b9b3aa'], [1.2, -1.1, '#8fae58']];
      for (const [a, e, c] of bits) g.push(xf(sph(R0 * 0.07, c, FELT, 5, 3), [R0 * Math.cos(e) * Math.cos(a), R0 * Math.sin(e), R0 * Math.cos(e) * Math.sin(a)], null, [1.4, 0.6, 1]));
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.6, e = (i % 2 ? 0.4 : -0.3); g.push(xf(sph(R0 * 0.22, SNOW2, FELT, 6, 4), [R0 * 0.92 * Math.cos(e) * Math.cos(a), R0 * 0.92 * Math.sin(e), R0 * 0.92 * Math.cos(e) * Math.sin(a)], null, [1, 0.5, 1])); }
      return xf(merge(g), [0, 0, 0], null, 1 / R0);
    }
    function patchGeometry() { // unit-size mound of fresh snow with glinting sparkles (instance scale = radius)
      const g = [xf(part(new THREE.SphereGeometry(1, 12, 4, 0, TAU, 0, Math.PI / 2), SNOW, FELT, [TAU / 0.5, Math.PI / 1]), [0, 0, 0], null, [1, 0.32, 0.9])];
      for (const [x, z, s] of [[0.5, 0.2, 1], [-0.4, 0.45, 0.8], [-0.2, -0.5, 1.1], [0.15, -0.1, 0.7], [0.62, -0.42, 0.8]]) {
        g.push(xf(part(new THREE.OctahedronGeometry(0.09 * s, 0), s > 0.9 ? '#fff6d8' : '#cfe8ff', GLOW), [x, 0.33 * Math.sqrt(Math.max(0, 1 - x * x - z * z)) + 0.04, z]));
      }
      for (const [x, z] of [[0.75, 0.55], [-0.8, -0.3], [0.1, 0.85]]) g.push(xf(sph(0.18, SNOW, FELT, 6, 4), [x, 0.02, z], null, [1, 0.5, 1]));
      return merge(g);
    }
    function buildProps() { // contest corner: two candy-cane posts with felt bunting behind the build spot
      const g = [];
      const ps = POSTS_AT.map(([r, t]) => at(r, t));
      for (const p of ps) {
        const y = gy(p.x, p.z);
        g.push(xf(cyl(0.022, 0.026, 0.62, 8, '#f6efe4', KNIT), [p.x, y + 0.31, p.z]));
        for (let i = 0; i < 6; i++) g.push(xf(torus(0.024, 0.008, P.red, KNIT, TAU, 10, 4), [p.x, y + 0.06 + i * 0.1, p.z], [Math.PI / 2 - 0.4, 0, 0]));
        g.push(xf(sph(0.035, P.gold, GLOSS, 8, 6), [p.x, y + 0.64, p.z]));
        g.push(xf(sph(0.11, SNOW, FELT, 8, 4), [p.x, y + 0.01, p.z], null, [1.3, 0.35, 1.1]));
      }
      const [a, b] = ps, ya = gy(a.x, a.z) + 0.58, yb = gy(b.x, b.z) + 0.58;
      const n = 9, cols = [P.red, '#e3aa3a', '#3f6e45', '#efe1c6'];
      const pts = [];
      for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push([lerp(a.x, b.x, u), lerp(ya, yb, u) - Math.sin(u * Math.PI) * 0.09, lerp(a.z, b.z, u)]); }
      g.push(tube(pts, 0.006, P.woodDark, KNIT, 24, 4));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u), y = lerp(ya, yb, u) - Math.sin(u * Math.PI) * 0.09;
        g.push(xf(extrude(trianglePts(), 0.008, cols[i % 4], FELT), [x, y, z], [0, Y, 0]));
      }
      // little snow lumps round the lawn edge
      for (let i = 0; i < 7; i++) { const ang = (i / 7) * TAU + 0.3, x = C.x + Math.cos(ang) * (RAD + 0.12), z = C.z + Math.sin(ang) * (RAD + 0.12); if (Math.hypot(x - B.x, z - B.z) < 0.6) continue; g.push(xf(sph(0.1 + (i % 3) * 0.03, SNOW, FELT, 8, 4), [x, gy(x, z), z], null, [1.4, 0.4, 1])); }
      return merge(g);
    }
  },
};

function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; }
function segDist(ax, az, bx, bz, px, pz) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0; return Math.hypot(ax + dx * t - px, az + dz * t - pz); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function trianglePts() { const s = new THREE.Shape(); s.moveTo(-0.035, 0); s.lineTo(0.035, 0); s.lineTo(0, -0.075); s.closePath(); return s; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** Small inline SVG icons for the decoration chips (no emoji). */
function chipIcon(slot, key) {
  const head = '<circle cx="24" cy="26" r="16" fill="#fbf9f4" stroke="#d9cdb6" stroke-width="2"/>';
  const s = (body) => `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">${body}</svg>`;
  switch (slot + ':' + key) {
    case 'eyes:coal': return s(head + '<circle cx="18" cy="23" r="3.4" fill="#2f2a29"/><circle cx="30" cy="23" r="3.4" fill="#2f2a29"/>');
    case 'eyes:buttons': return s(head + '<circle cx="18" cy="23" r="4" fill="#b98250"/><circle cx="30" cy="23" r="4" fill="#b98250"/><circle cx="17" cy="22.5" r="0.9" fill="#5c3a26"/><circle cx="19" cy="23.5" r="0.9" fill="#5c3a26"/><circle cx="29" cy="22.5" r="0.9" fill="#5c3a26"/><circle cx="31" cy="23.5" r="0.9" fill="#5c3a26"/>');
    case 'eyes:berries': return s(head + '<circle cx="18" cy="23" r="3.4" fill="#c4302e"/><circle cx="30" cy="23" r="3.4" fill="#c4302e"/><circle cx="17" cy="22" r="1" fill="#ffd9d0"/><circle cx="29" cy="22" r="1" fill="#ffd9d0"/>');
    case 'nose:carrot': return s('<path d="M8 22 L40 26 L8 30 Z" fill="#e0782c"/><path d="M14 23 l2 6 M20 24 l1.6 4.4 M27 25 l1 2.6" stroke="#b85a1c" stroke-width="1.6"/>');
    case 'nose:pinecone': return s('<ellipse cx="24" cy="25" rx="10" ry="14" fill="#7a4f33"/><path d="M15 18 q9 5 18 0 M14 25 q10 5 20 0 M15 32 q9 5 18 0" stroke="#5c3a26" stroke-width="2.4" fill="none"/>');
    case 'nose:star': return s('<path d="M24 6 L29 19 L43 19 L32 28 L36 42 L24 34 L12 42 L16 28 L5 19 L19 19 Z" fill="#e3aa3a" stroke="#b07b1c" stroke-width="1.5"/>');
    case 'hat:top': return s('<rect x="14" y="8" width="20" height="24" rx="2" fill="#2f2a29"/><rect x="14" y="25" width="20" height="5" fill="#b8302d"/><rect x="6" y="31" width="36" height="5" rx="2.5" fill="#2f2a29"/>');
    case 'hat:bobble': return s('<path d="M8 34 Q8 12 24 12 Q40 12 40 34 Z" fill="#4f9590"/><rect x="6" y="31" width="36" height="7" rx="3.5" fill="#efe1c6"/><circle cx="24" cy="10" r="6" fill="#efe1c6"/>');
    case 'hat:holly': return s('<ellipse cx="15" cy="26" rx="9" ry="4.5" fill="#2f6446" transform="rotate(-25 15 26)"/><ellipse cx="33" cy="26" rx="9" ry="4.5" fill="#4a8250" transform="rotate(25 33 26)"/><circle cx="21" cy="24" r="3.2" fill="#d23a33"/><circle cx="27" cy="24" r="3.2" fill="#d23a33"/><circle cx="24" cy="19.5" r="3.2" fill="#d23a33"/>');
    case 'scarf:red': return s('<rect x="6" y="14" width="36" height="10" rx="5" fill="#b8302d"/><rect x="26" y="20" width="9" height="20" rx="3" fill="#b8302d" transform="rotate(-10 30 30)"/>');
    case 'scarf:striped': return s('<rect x="6" y="14" width="36" height="10" rx="5" fill="#3f6e45"/><rect x="13" y="14" width="5" height="10" fill="#efe1c6"/><rect x="25" y="14" width="5" height="10" fill="#efe1c6"/><rect x="26" y="20" width="9" height="20" rx="3" fill="#3f6e45" transform="rotate(-10 30 30)"/><rect x="26" y="28" width="9" height="5" fill="#efe1c6" transform="rotate(-10 30 30)"/>');
    case 'scarf:gold': return s('<rect x="6" y="14" width="36" height="10" rx="5" fill="#d9a13b"/><rect x="26" y="20" width="9" height="20" rx="3" fill="#d9a13b" transform="rotate(-10 30 30)"/><path d="M27 40 v4 M30 40 v4 M33 40 v4" stroke="#fff1c2" stroke-width="2" transform="rotate(-10 30 30)"/>');
    case 'arms:twigs': return s('<path d="M6 34 L24 22 L42 12 M30 18 l4 -8 M14 29 l-2 -7" stroke="#5c3a26" stroke-width="3.2" stroke-linecap="round" fill="none"/>');
    case 'arms:mittens': return s('<path d="M6 36 L28 22" stroke="#5c3a26" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="34" cy="17" rx="8" ry="10" fill="#c4362f" transform="rotate(35 34 17)"/><circle cx="27" cy="11" r="3.6" fill="#c4362f"/><rect x="24" y="22" width="11" height="4" rx="2" fill="#efe1c6" transform="rotate(35 30 24)"/>');
    case 'arms:canes': return s('<path d="M14 42 L14 16 Q14 6 24 6 Q34 6 34 16" stroke="#f6efe4" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M14 38 v-3 M14 29 v-3 M14 20 v-3 M18 8.5 l2 -1.5 M28 7 l2 2 M33 13 l1.5 2" stroke="#b8302d" stroke-width="6" fill="none"/>');
    default: return s(head);
  }
}
