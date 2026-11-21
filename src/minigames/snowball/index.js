// Snowball Fight! — Advent door 5 (Pinecone Park). Owned by the snowball mini-game agent.
// Knitted kids pop up behind felt snow forts and wave or lob snowballs back. Tap / click to throw an arcing
// snowball (hit a kid +10, three quick hits in a row start a +5 streak bonus), spare the friendly snowman (−5),
// and sidestep incoming snowballs: a red ring shows where each will land (◀ ▶ buttons, A / D or arrow keys;
// −3 when hit). 60 s. Stars at 50 / 110 / 170.
//
// Staging: the old ARENAS.snowball centre (1.5, 12.2) was taken by the park gazebo and two pom-pom trees, so the
// fight happens in the open clearing right next to it (east of the gazebo), looking north: the kids' faces catch
// the warm key light and the glowing market sits blurred behind the forts.
// Cost while running (measured with __snowball.budget(), shadow passes included): 4–14 draw calls and ~36k–52k
// triangles depending on how many kids are up. All of it is one root group added through mg.add(); geometry,
// textures, DOM and listeners are released on dispose (scene child count returns to its value before the game).
// Park walkers / ambient kids are parked for the round (their district tag is swapped and restored on dispose)
// because the park loop path runs straight through the clearing.
import * as THREE from 'three';
import { buildCharacter } from '../../core/player.js';
import { P } from '../../core/yarn.js';
import { cone, cyl, sph, dot, rbox, torus, tube, extrude, poly, part, xf, merge, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';
import './snowball.css';
import { aspectK, zoomOut, isPortrait } from '../view.js';

const TAU = Math.PI * 2;
const DUR = 60;
const STARS = [50, 110, 170];
const RAIL = { z: 13.35, x0: 4.35, x1: 5.75 }; // the player's dodge rail, just behind their own low snow wall
const START_X = 5.0;
const SPEED = 2.4; // rail speed (units / s)
const CAM = { x: 5.0, y: 0.95, z: 15.2, off: 0.75, follow: 0.4 }; // over-the-shoulder, a touch right of the player
const LOOK = { x: 5.35, y: 0.02, z: 11.4, follow: 0.22 };
const KID_S = 1.15; // knitted kids are scaled like the player
const HEAD_Y = 0.274 * (KID_S / 1.15), CHEST_Y = 0.17;
const HIDE_Y = -0.36;
const FORT_H = 0.2;
const HIT_R = 0.24; // incoming snowball catches you if you're this close to its ring centre
const SNOW = P.snow, SNOW2 = '#ece7df';
const FORTS = [ // world spots chosen so the forts fan out across the view from the fixed camera
  { x: 4.69, z: 12.29, ry: 0.35, w: 0.8, deco: 'flag' },
  { x: 5.68, z: 11.3, ry: 0.018, w: 1.05, deco: 'lights' },
  { x: 6.24, z: 12.14, ry: -0.158, w: 0.8, deco: 'cane' },
];
const SNOWMAN = { x: 5.14, z: 11.75 };
const KIDS = [ // style, look, fort, pop-up spots (local x along the fort; side spots step out past the fort's end)
  { style: { coat: 'teal', hat: 'bobble', scarf: 'striped' }, look: { hair: '#6b3f25' }, fort: 0, spots: [{ x: -0.54, side: -1 }, { x: -0.16 }, { x: 0.2 }] },
  { style: { coat: 'mustard', hat: 'earflap', scarf: 'red' }, look: { hair: '#3b2a22' }, fort: 1, spots: [{ x: -0.34 }, { x: -0.06 }] },
  { style: { coat: 'cream', hat: 'bobble', scarf: 'green' }, look: { hair: '#b5622f' }, fort: 1, spots: [{ x: 0.27 }, { x: 0.68, side: 1 }] },
  { style: { coat: '#c9708a', hat: 'none', scarf: 'white' }, look: { hair: '#4a2f22', skin: '#eec7a6' }, fort: 2, spots: [{ x: -0.54, side: -1 }, { x: -0.14 }, { x: 0.22 }] },
];
const GIGGLES = ['Hee hee!', 'Got me!', 'Ha ha!', 'Brrr!', 'Eek!', 'Nice one!'];

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const outBack = (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const outCubic = (k) => 1 - (1 - k) ** 3;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let lastExit = { time: -1e9 }; // lets "Play again" start without a camera hop

export default {
  id: 'snowball',
  title: 'Snowball Fight!',
  district: 'park',
  icon: '❄️',
  intro: 'Tap a kid to throw a snowball: +10, and quick hits in a row earn a streak bonus. Spare the friendly snowman! When a red ring appears at your feet, step aside with ◀ ▶ (A / D or arrow keys).',
  introTouch: 'Tap a kid to throw a snowball: +10, and quick hits in a row earn a streak bonus. Spare the friendly snowman! When a red ring appears at your feet, step aside with the ◀ ▶ buttons.',
  async start(ctx, mg) {
    const { engine, player, cam, audio, colliders } = ctx;
    const params = ctx.params || new URLSearchParams(location.search);
    const sfx = (name, o) => { try { audio?.sfx?.(name, o); } catch (e) { /* audio is optional */ } };
    const rnd = Math.random;
    mg.setPlayerControl(false); // we drive the player along the rail ourselves (no tap-to-walk while throwing)

    const root = mg.add(new THREE.Group());
    root.name = 'snowball-fight';
    const owned = []; // geometries / materials / textures to free on dispose
    const own = (x) => { owned.push(x); return x; };

    // ------------------------------------------------------------------ props (one merged mesh)
    for (const f of FORTS) {
      f.mat = new THREE.Matrix4().compose(new THREE.Vector3(f.x, 0, f.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.ry, 0)), new THREE.Vector3(1, 1, 1));
      f.inv = f.mat.clone().invert();
      f.box = new THREE.Box3(new THREE.Vector3(-f.w / 2, 0, -0.12), new THREE.Vector3(f.w / 2, FORT_H + 0.05, 0.09));
    }
    const props = new THREE.Mesh(own(buildProps()), engine.mat);
    props.castShadow = props.receiveShadow = true;
    root.add(props);

    // ------------------------------------------------------------------ the friendly snowman
    const snowman = new THREE.Group();
    snowman.position.set(SNOWMAN.x, 0, SNOWMAN.z);
    snowman.rotation.y = Math.atan2(CAM.x + CAM.off - SNOWMAN.x, CAM.z - SNOWMAN.z);
    const smMesh = new THREE.Mesh(own(snowmanGeo()), engine.mat);
    smMesh.castShadow = smMesh.receiveShadow = true;
    snowman.add(smMesh);
    root.add(snowman);
    let smWobble = 0;

    // ------------------------------------------------------------------ knitted kids (body + left arm + legs baked into one mesh, throwing arm live)
    const kids = KIDS.map((def, i) => makeKid(def, i));

    // ------------------------------------------------------------------ instanced fx: snowballs, puffs, soft shadows, warning rings
    const balls = new THREE.InstancedMesh(own(sph(1, SNOW, FELT, 10, 7)), engine.mat, 16);
    const puffs = new THREE.InstancedMesh(own(dot(1, SNOW, FELT)), engine.mat, 96);
    const rings = new THREE.InstancedMesh(own(part(new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2), '#d9473e', FELT)), engine.mat, 6);
    const blobTex = own(makeBlobTexture());
    const blobMat = own(new THREE.MeshBasicMaterial({ map: blobTex, color: '#2a3352', transparent: true, opacity: 0.4, depthWrite: false }));
    const blobs = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), blobMat, 28);
    for (const m of [balls, puffs, rings, blobs]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); }
    balls.receiveShadow = true;
    rings.receiveShadow = true;
    blobs.renderOrder = 1;

    // ------------------------------------------------------------------ DOM: ◀ ▶ pad (touch) or key hint (desktop), splat, labels
    const touch = params.has('sbtouch') || engine.isMobile || matchMedia('(pointer: coarse)').matches;
    const ui = document.createElement('div');
    ui.className = 'sb-ui';
    ctx.uiRoot.insertBefore(ui, ctx.uiRoot.querySelector('.mg-layer'));
    const splat = el('div', 'sb-splat', ui);
    const splatBlob = el('div', 'sb-blob', ui);
    const hold = [false, false];
    const keys = { l: false, r: false };
    let hint = null;
    if (touch) {
      const pad = el('div', 'sb-pad', ui);
      [-1, 1].forEach((dir, j) => {
        const b = el('button', 'knit-btn cream round sb-btn', pad);
        b.textContent = dir < 0 ? '◀' : '▶';
        b.setAttribute('aria-label', dir < 0 ? 'Move left' : 'Move right');
        const on = (e) => { e.preventDefault(); e.stopPropagation(); hold[j] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ } };
        const off = () => { hold[j] = false; b.classList.remove('on'); };
        b.addEventListener('pointerdown', on);
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    } else {
      hint = el('div', 'knit-card sb-hint', ui);
      hint.innerHTML = 'Click a kid to throw · dodge with <kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd>';
    }
    const labels = []; // {el, t, life, follow?}
    let smBubble = null;

    const keyMap = (k) => (k === 'a' || k === 'arrowleft' ? 'l' : k === 'd' || k === 'arrowright' ? 'r' : null);
    mg.onKey((e) => { const k = keyMap(e.key.toLowerCase()); if (k) keys[k] = true; });
    const onKeyUp = (e) => { const k = keyMap(e.key.toLowerCase()); if (k) keys[k] = false; };
    const onBlur = () => { keys.l = keys.r = false; hold[0] = hold[1] = false; };
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    mg.onTap((ndc, e) => handleTap(ndc, e.clientX, e.clientY));

    // ------------------------------------------------------------------ park life steps aside (walkers on the park loop cross this clearing)
    const showPark = ctx.life?.hideDistrict ? ctx.life.hideDistrict('park') : () => {};

    // ------------------------------------------------------------------ player on the rail + camera
    // remember where the player stood (next to Tilly) so they go back there afterwards; "Play again" keeps the first spot
    const quick = engine.time - lastExit.time < 2.5;
    const pre = quick && lastExit.pre ? lastExit.pre : { x: player.pos.x, z: player.pos.z, h: player.heading };
    player.teleport(START_X, RAIL.z, Math.PI);
    let px = START_X, pv = 0, throwAnim = -1, released = false, throwTarget = null, pending = null, faceT = 0, faceX = 0, flinch = 0;
    const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
    let shake = 0;
    updateCamera(0);
    cam.playShot({
      name: 'snowball', portrait: false, duration: 1e6, blendIn: quick ? 0.0001 : 0.9, blendOut: 0.6, skippable: false, tilt: 1.2,
      update(u, out) { out.pos.copy(camPos); out.target.copy(camTgt); },
    });

    // ------------------------------------------------------------------ state
    let phase = 'intro', T = 0, timeLeft = DUR, shownSec = -1, endT = 0;
    let score = 0, hits = 0, misses = 0, streak = 0, bestStreak = 0, lastHitT = -10, snowmanHits = 0, hitsTaken = 0, dodges = 0;
    let popT = 0.7, incomingT = 6, firstIncoming = true, goalLock = 0, starsShown = 0;
    const myBalls = [], incoming = [], puffList = [];
    let bot = 0, botT = 0, botDir = 0;
    const ray = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.03);
    const V = new THREE.Vector3(), V2 = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), SC = new THREE.Vector3();
    const put = (mesh, i, x, y, z, s, sy = s) => { V.set(x, y, z); SC.set(s, sy, s); M4.compose(V, Q0, SC); mesh.setMatrixAt(i, M4); };
    let starsShownGoal = false;

    // intro attract: everyone up and waving hello
    for (const k of kids) { setSpot(k, k.spots.findIndex((s) => !s.side)); k.y = k.upY; k.lx = k.upLx; k.state = 'up'; k.timer = 99; k.wave = 99; }

    mg.addUpdate(update);
    mg.onDispose(dispose);
    exposeDebug();

    await mg.intro();
    if (mg.finished) return;
    phase = 'play';
    for (const k of kids) { k.wave = 0; k.timer = 0; }
    mg.hud.setScore(0);
    mg.hud.setTimer(DUR);
    setGoal('Tap the kids to throw!');
    if (hint) setTimeout(() => hint?.classList.add('off'), 9000);

    // ================================================================== per-frame
    function update(dt) {
      dt = Math.min(dt, 0.05);
      T += dt;
      if (phase === 'play') {
        timeLeft -= dt;
        const s = Math.ceil(Math.max(0, timeLeft));
        if (s !== shownSec) { shownSec = s; mg.hud.setTimer(timeLeft); if (s <= 5 && s > 0) sfx('countdown', { vol: 0.35 }); }
        if (goalLock > 0 && (goalLock -= dt) <= 0) setGoal(nextStarText());
        else if (T > 7 && goalLock <= 0 && !starsShownGoal) { starsShownGoal = true; setGoal(nextStarText()); }
        if (timeLeft <= 0) beginEnd();
      } else if (phase === 'end') {
        endT += dt;
        if (endT > 1.6 && !myBalls.length) finishGame();
      }
      if (bot) runBot(dt);
      movePlayer(dt);
      director(dt);
      updateKids(dt);
      updateSnowman(dt);
      updateBalls(dt);
      updateIncoming(dt);
      updatePuffs(dt);
      writeInstances();
      updateLabels(dt);
      updateCamera(dt);
    }

    // ------------------------------------------------------------------ player
    function movePlayer(dt) {
      let dir = (keys.r || hold[1] ? 1 : 0) - (keys.l || hold[0] ? 1 : 0);
      if (bot) dir = botDir;
      if (phase !== 'play') dir = 0;
      pv += (dir * SPEED - pv) * (1 - Math.exp(-dt * 14));
      px = clamp(px + pv * dt, RAIL.x0, RAIL.x1);
      if ((px <= RAIL.x0 && pv < 0) || (px >= RAIL.x1 && pv > 0)) pv = 0;
      player.pos.x = px;
      player.pos.z = RAIL.z;
      player.object.position.x = px;
      player.object.position.z = RAIL.z;
      const ch = player.character;
      // face north (towards the forts), turn a little into a dodge or towards a throw
      let h = Math.PI - clamp(pv / SPEED, -1, 1) * 0.55;
      if (faceT > 0) { faceT -= dt; h = Math.atan2(faceX - px, 11.6 - RAIL.z); }
      player.heading = h;
      ch.yaw.rotation.y = h;
      const sp = Math.abs(pv);
      if (sp > 0.08) ch.animate(dt, sp * 0.9);
      // throw: quick wind-up over the shoulder, release, follow-through
      const arm = ch.arms[0];
      if (throwAnim >= 0) {
        throwAnim += dt;
        const a = throwAnim;
        arm.rotation.x = a < 0.07 ? lerp(0, 2.5, a / 0.07) : a < 0.19 ? lerp(2.5, -1.7, (a - 0.07) / 0.12) : lerp(-1.7, 0, Math.min(1, (a - 0.19) / 0.14));
        ch.body.rotation.x = a < 0.07 ? -0.1 : a < 0.25 ? 0.18 : 0.18 * (1 - Math.min(1, (a - 0.25) / 0.1));
        if (!released && a >= 0.07) { released = true; launch(throwTarget); }
        if (a > 0.34) { throwAnim = -1; if (pending) { const p = pending; pending = null; tryThrow(p); } }
      }
      if (flinch > 0) { flinch -= dt; ch.body.rotation.x = -0.35 * Math.sin((flinch / 0.4) * Math.PI); ch.body.scale.y = 1 - 0.06 * Math.sin((flinch / 0.4) * Math.PI); }
    }

    // ------------------------------------------------------------------ throwing
    function handleTap(ndc, sx, sy) {
      if (phase !== 'play') return;
      tryThrow(aimAt(ndc, sx, sy));
    }
    function aimAt(ndc, sx, sy) {
      // generous aim assist: snap to the nearest kid on screen; the snowman only if you really tapped him
      let best = null, bestD = Math.max(touch ? 50 : 38, Math.min(innerHeight, isPortrait() ? innerWidth * 1.3 : innerHeight) * (touch ? 0.095 : 0.07));
      for (const k of kids) {
        if (!hittable(k) && k.state !== 'rise') continue;
        for (const hy of [HEAD_Y, CHEST_Y]) {
          V.set(k.wx, k.y + hy, k.wz);
          const d = screenDist(V, sx, sy);
          if (d < bestD) { bestD = d; best = { kind: 'kid', kid: k, point: V2.set(k.wx, k.y + HEAD_Y - 0.02, k.wz).clone() }; }
        }
      }
      if (best) return best;
      for (const [hy, r] of [[0.16, 0.17], [0.36, 0.13], [0.53, 0.105]]) {
        V.set(SNOWMAN.x, hy, SNOWMAN.z);
        if (screenDist(V, sx, sy) < screenRadius(V, r) * 1.05) return { kind: 'snowman', point: V.clone() };
      }
      ray.setFromCamera(ndc, engine.camera);
      let pt = null, bestT = Infinity;
      for (const f of FORTS) { // a snowball aimed at a fort splats on the fort
        const lr = ray.ray.clone().applyMatrix4(f.inv);
        const h = lr.intersectBox(f.box, V);
        if (h) { const w = h.applyMatrix4(f.mat); const t = w.distanceTo(ray.ray.origin); if (t < bestT) { bestT = t; pt = w.clone(); } }
      }
      const g = ray.ray.intersectPlane(groundPlane, V);
      if (g && g.distanceTo(ray.ray.origin) < bestT) pt = g.clone();
      if (!pt) { V.copy(ray.ray.direction).setY(0).normalize(); pt = new THREE.Vector3(px + V.x * 6, 0.03, RAIL.z + V.z * 6); }
      const dx = pt.x - px, dz = pt.z - RAIL.z, d = Math.hypot(dx, dz);
      if (d > 6) pt.set(px + (dx / d) * 6, 0.03, RAIL.z + (dz / d) * 6);
      return { kind: 'ground', point: pt };
    }
    function tryThrow(target) {
      if (phase !== 'play' || !target) return;
      if (throwAnim >= 0 && throwAnim < 0.17) { pending = target; return; }
      if (myBalls.length >= 4) return;
      throwAnim = 0; released = false; throwTarget = target;
      faceT = 0.45; faceX = target.point.x;
    }
    function launch(target) {
      const a = new THREE.Vector3(px + 0.1, player.pos.y + 0.47, RAIL.z + 0.06);
      const b = target.point.clone();
      const d = a.distanceTo(b);
      myBalls.push({ a, b, t: 0, T: 0.6, h: 0.16 + d * 0.06, target, free: null });
      sfx('whoosh', { vol: 0.45 });
    }
    function hittable(k) { return phase === 'play' && (k.state === 'up' || (k.state === 'rise' && k.t > 0.1)); }

    function updateBalls(dt) {
      for (let i = myBalls.length - 1; i >= 0; i--) {
        const b = myBalls[i];
        if (b.free) { // missed its kid: keep flying until it lands on a fort or the snow
          const f = b.free;
          f.v.y -= f.g * dt;
          f.p.addScaledVector(f.v, dt);
          if (f.p.y <= landHeight(f.p.x, f.p.z) || f.p.y < -0.2) { f.p.y = Math.max(f.p.y, landHeight(f.p.x, f.p.z)); missed(f.p); myBalls.splice(i, 1); }
          continue;
        }
        b.t += dt;
        if (b.t >= b.T) {
          if (!resolveMine(b)) { // continue the arc past the target
            const g = (8 * b.h) / (b.T * b.T);
            const v = b.b.clone().sub(b.a).divideScalar(b.T);
            v.y -= (4 * b.h) / b.T;
            b.free = { p: b.b.clone(), v, g };
            continue;
          }
          myBalls.splice(i, 1);
        }
      }
    }
    /** true when the ball is done (hit something or splatted where it was aimed). */
    function resolveMine(b) {
      const tg = b.target;
      let kid = tg.kind === 'kid' && hittable(tg.kid) ? tg.kid : null;
      if (!kid) {
        let bd = tg.kind === 'kid' ? 0.3 : 0.26;
        for (const k of kids) if (hittable(k)) { const d = Math.hypot(k.wx - b.b.x, k.wz - b.b.z); if (d < bd && Math.abs(k.y + CHEST_Y - b.b.y) < 0.45) { bd = d; kid = k; } }
      }
      if (kid) { hitKid(kid); return true; }
      if (tg.kind === 'snowman' || Math.hypot(b.b.x - SNOWMAN.x, b.b.z - SNOWMAN.z) < 0.2) { hitSnowman(); return true; }
      if (tg.kind === 'kid') return false;
      missed(b.b);
      return true;
    }
    function missed(p) {
      puff(p, 7, 0.9);
      sfx('step', { vol: 0.6 });
      misses++;
      streak = 0;
    }
    function hitKid(k) {
      hits++;
      streak = T - lastHitT < 3.2 ? streak + 1 : 1;
      lastHitT = T;
      bestStreak = Math.max(bestStreak, streak);
      const bonus = streak >= 3 ? 5 : 0;
      addScore(10 + bonus);
      V.set(k.wx, k.y + HEAD_Y, k.wz);
      puff(V, 9, 1.2);
      label(V, bonus ? `+${10 + bonus}` : '+10', '', 0.05);
      if (bonus) label(V, `Streak ×${streak}!`, 'small', 0.16);
      kidBubble(k, pick(GIGGLES));
      k.state = 'hit'; k.t = 0; k.throwT = -1; k.from = k.y;
      sfx('pop', { vol: 0.9 });
      sfx('cheer', { vol: 0.35, delay: 0.2 });
    }
    function hitSnowman() {
      snowmanHits++;
      streak = 0;
      addScore(-5);
      smWobble = 1;
      V.set(SNOWMAN.x, 0.38, SNOWMAN.z);
      puff(V, 8, 1);
      label(V, '−5', 'bad', 0.05);
      smBubble?.el.remove();
      smBubble = { el: el('div', 'sb-bubble', ui), t: 0 };
      smBubble.el.textContent = 'Hey!';
      sfx('drop', { vol: 0.8 });
    }
    function addScore(d) {
      score = Math.max(0, score + d);
      mg.hud.setScore(score);
      while (starsShown < 3 && score >= STARS[starsShown]) {
        starsShown++;
        bigLabel('★'.repeat(starsShown));
        sfx('bell', { vol: 0.6 });
        if (goalLock <= 0) setGoal(nextStarText());
      }
    }
    function nextStarText() { return starsShown >= 3 ? 'Snowball champion! ★★★' : `${'★'.repeat(starsShown + 1)} at ${STARS[starsShown]} points`; }
    function setGoal(t) { mg.hud.setGoal(t); }

    // ------------------------------------------------------------------ kids
    function makeKid(def, i) {
      const ch = buildCharacter(engine.mat, def.style, def.look);
      ch.group.updateMatrixWorld(true);
      const livePiv = ch.arms[1];
      const armSrc = livePiv.children[0];
      const parts = [];
      ch.group.traverse((o) => { if (o.isMesh && o !== armSrc) parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
      const bodyGeo = own(merge(parts));
      ch.group.traverse((o) => { if (o.isMesh && o.geometry !== armSrc.geometry) o.geometry.dispose(); });
      own(armSrc.geometry);
      const kroot = new THREE.Group();
      kroot.scale.setScalar(KID_S);
      const inner = new THREE.Group();
      kroot.add(inner);
      const body = new THREE.Mesh(bodyGeo, engine.mat);
      body.receiveShadow = true;
      inner.add(body);
      const ys = ch.yaw.scale.x;
      const piv = new THREE.Group();
      piv.position.copy(livePiv.position).multiplyScalar(ys);
      piv.scale.setScalar(ys);
      const arm = new THREE.Mesh(armSrc.geometry, engine.mat);
      arm.receiveShadow = true;
      piv.add(arm);
      inner.add(piv);
      kroot.visible = false;
      root.add(kroot);
      const fort = FORTS[def.fort];
      return {
        i, root: kroot, inner, piv, baseZ: livePiv.rotation.z, fort, spots: def.spots, spot: -1,
        state: 'hidden', t: 0, timer: 0, cool: 0, y: HIDE_Y, from: HIDE_Y, lx: 0, upLx: 0, hideLx: 0, upY: 0.14, lz: -0.13,
        wx: fort.x, wz: fort.z, wave: 0, throwT: -1, bubble: null, next: null,
      };
    }
    function setSpot(k, idx) {
      if (idx < 0) idx = Math.floor(rnd() * k.spots.length);
      k.spot = idx;
      const s = k.spots[idx], hw = k.fort.w / 2;
      k.upLx = s.x;
      k.hideLx = s.side ? s.side * (hw - 0.14) : s.x;
      k.upY = s.side ? 0 : 0.14;
      k.lz = s.side ? -0.08 : -0.13;
    }
    function popKid(k, prog) {
      let idx = Math.floor(rnd() * k.spots.length);
      if (idx === k.spot && k.spots.length > 1) idx = (idx + 1 + Math.floor(rnd() * (k.spots.length - 1))) % k.spots.length;
      setSpot(k, idx);
      k.state = 'rise'; k.t = 0; k.from = HIDE_Y; k.lx = k.hideLx;
      const peek = rnd() < lerp(0.12, 0.32, prog); // quick peekaboo: reward fast throws
      k.timer = peek ? 0.75 + rnd() * 0.3 : lerp(2.1, 1.35, prog) * (0.85 + rnd() * 0.3);
      k.wave = !peek && rnd() < 0.5 ? 0.8 : 0;
      sfx('pop', { vol: 0.3 });
    }
    function director(dt) {
      if (phase !== 'play') return;
      const prog = clamp(1 - timeLeft / DUR, 0, 1);
      popT -= dt;
      if (popT <= 0) {
        const up = kids.filter((k) => k.state === 'rise' || k.state === 'up').length;
        const maxUp = prog < 0.12 ? 1 : prog < 0.45 ? 2 : 3;
        const free = kids.filter((k) => k.state === 'hidden' && k.timer <= 0);
        if (up < maxUp && free.length) { popKid(pick(free), prog); popT = lerp(1.9, 1.2, prog) * (0.8 + rnd() * 0.4); }
        else popT = 0.15;
      }
      incomingT -= dt;
      if (incomingT <= 0) {
        const c = kids.filter((k) => k.state === 'up' && k.throwT < 0 && k.t > 0.3 && k.timer > 0.5);
        if (c.length) { pick(c).throwT = 0; incomingT = lerp(3.3, 2.0, prog) * (0.85 + rnd() * 0.3); }
        else incomingT = 0.25;
      }
    }
    function updateKids(dt) {
      for (const k of kids) {
        k.t += dt;
        let tilt = 0, sq = 1, armX = 0.06 * Math.sin(T * 2 + k.i), armZ = k.baseZ, waving = false;
        switch (k.state) {
          case 'hidden': k.timer -= dt; k.y = HIDE_Y; break;
          case 'rise': {
            const q = Math.min(1, k.t / 0.24);
            k.y = lerp(k.from, k.upY, outBack(q));
            k.lx = lerp(k.hideLx, k.upLx, outCubic(q));
            sq = 1 + 0.12 * Math.sin(q * Math.PI);
            if (q >= 1) { k.state = k.next || 'up'; k.next = null; k.t = 0; }
            break;
          }
          case 'up':
            k.timer -= dt;
            k.y = k.upY + Math.abs(Math.sin(T * 4.5 + k.i * 1.7)) * 0.012;
            if (k.timer <= 0 && k.throwT < 0 && phase === 'play') { k.state = 'duck'; k.t = 0; k.from = k.y; k.cool = 0.4 + rnd() * 0.8; }
            break;
          case 'duck': {
            const q = Math.min(1, k.t / 0.2);
            k.y = lerp(k.from, HIDE_Y, q * q);
            k.lx = lerp(k.upLx, k.hideLx, q);
            if (q >= 1) { k.state = 'hidden'; k.timer = k.cool; }
            break;
          }
          case 'hit': { // flinch, plop down on the snow, giggle and wave, then duck
            const a = k.t;
            sq = a < 0.16 ? 1 - 0.18 * Math.sin((a / 0.16) * Math.PI) : 1;
            const sit = outCubic(Math.min(1, Math.max(0, (a - 0.08) / 0.22)));
            k.y = lerp(k.from, k.upY - 0.075, sit);
            tilt = -0.55 * sit + Math.sin(a * 22) * 0.05 * (a > 0.3 ? 1 : 0);
            waving = a > 0.25;
            if (a > 1.35) { k.state = 'duck'; k.t = 0; k.from = k.y; k.cool = 1.2 + rnd() * 1.0; }
            break;
          }
          case 'cheer':
            k.y = k.upY + Math.abs(Math.sin(T * 7 + k.i * 1.3)) * 0.06;
            waving = true;
            break;
          default: break;
        }
        if (k.wave > 0) { k.wave -= dt; waving = true; }
        if (k.throwT >= 0) { // wind-up over the shoulder, lob, follow-through
          k.throwT += dt;
          const a = k.throwT;
          if (a < 0.45) { armX = lerp(0, 2.6, outCubic(a / 0.45)); tilt = -0.14 * (a / 0.45); armZ = k.baseZ + 0.15; }
          else if (a < 0.62) { armX = lerp(2.6, -1.35, (a - 0.45) / 0.17); tilt = 0.16; }
          else { armX = lerp(-1.35, 0, Math.min(1, (a - 0.62) / 0.2)); tilt = 0.16 * (1 - Math.min(1, (a - 0.62) / 0.2)); }
          if (a >= 0.45 && a - dt < 0.45 && (k.state === 'up' || k.state === 'rise')) spawnIncoming(k);
          if (a > 0.85 || (k.state !== 'up' && k.state !== 'rise')) k.throwT = -1;
          waving = false;
        }
        if (waving) { armZ = 2.45 + 0.4 * Math.sin(T * 13 + k.i); armX = -0.15; }
        k.piv.rotation.set(armX, 0, armZ);
        k.inner.rotation.x = tilt;
        k.inner.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
        // place behind the fort, facing the player
        const c = Math.cos(k.fort.ry), s = Math.sin(k.fort.ry);
        k.wx = k.fort.x + k.lx * c + k.lz * s;
        k.wz = k.fort.z - k.lx * s + k.lz * c;
        k.root.position.set(k.wx, k.y, k.wz);
        k.root.rotation.y = Math.atan2(px - k.wx, RAIL.z - k.wz);
        k.root.visible = k.state !== 'hidden';
        if (k.bubble) {
          k.bubble.t += dt;
          if (k.bubble.t > 1.1) { k.bubble.el.remove(); k.bubble = null; }
          else placeAt(k.bubble.el, V.set(k.wx, k.y + 0.62, k.wz));
        }
      }
    }
    function kidBubble(k, text) {
      k.bubble?.el.remove();
      k.bubble = { el: el('div', 'sb-bubble kid', ui), t: 0 };
      k.bubble.el.textContent = text;
      placeAt(k.bubble.el, V.set(k.wx, k.y + 0.62, k.wz));
    }

    // ------------------------------------------------------------------ incoming snowballs (red ring telegraph)
    function spawnIncoming(k) {
      const aimed = rnd() < 0.68;
      let tx = aimed ? px + (rnd() - 0.5) * 0.12 : px + (rnd() < 0.5 ? -1 : 1) * (0.38 + rnd() * 0.25);
      tx = clamp(tx, RAIL.x0 - 0.12, RAIL.x1 + 0.12);
      k.root.updateMatrixWorld(true);
      const a = k.root.localToWorld(new THREE.Vector3(0.07, 0.44, -0.03));
      const b = new THREE.Vector3(tx, 0.05, RAIL.z + 0.03);
      incoming.push({ a, b, t: 0, T: 1.15, h: 0.5, x: tx, wasIn: Math.abs(px - tx) < HIT_R, checked: false, dodge: rnd() < 0.4 });
      sfx('whoosh', { vol: 0.3 });
      if (firstIncoming) { firstIncoming = false; setGoal('Red ring = incoming! Step aside ◀ ▶'); goalLock = 3.5; }
    }
    function updateIncoming(dt) {
      for (let i = incoming.length - 1; i >= 0; i--) {
        const s = incoming[i];
        s.t += dt;
        const u = s.t / s.T;
        if (Math.abs(px - s.x) < HIT_R) s.wasIn = true;
        if (!s.checked && u >= 0.87) {
          s.checked = true;
          if (Math.abs(px - s.x) < HIT_R && phase === 'play') { playerHit(); incoming.splice(i, 1); continue; }
        }
        if (u >= 1) {
          puff(s.b, 6, 0.8);
          sfx('step', { vol: 0.4 });
          if (s.wasIn && phase === 'play') { dodges++; label(V.set(px, 0.6, RAIL.z), 'Dodged!', 'good small', 0); }
          incoming.splice(i, 1);
        }
      }
    }
    function playerHit() {
      hitsTaken++;
      addScore(-3);
      shake = 0.35;
      flinch = 0.4;
      V.set(px, 0.42, RAIL.z);
      puff(V, 8, 1);
      label(V.set(px, 0.75, RAIL.z), '−3', 'bad', 0);
      splat.classList.remove('on'); void splat.offsetWidth; splat.classList.add('on');
      splatBlob.style.left = `${30 + rnd() * 40}%`;
      splatBlob.style.top = `${55 + rnd() * 25}%`;
      splatBlob.classList.remove('on'); void splatBlob.offsetWidth; splatBlob.classList.add('on');
      sfx('drop', { vol: 0.9 });
    }

    // ------------------------------------------------------------------ snowman, puffs, instances
    function updateSnowman(dt) {
      smWobble = Math.max(0, smWobble - dt * 1.1);
      const w = smWobble * smWobble;
      smMesh.rotation.z = Math.sin(T * 19) * 0.2 * w + Math.sin(T * 1.3) * 0.015;
      smMesh.rotation.x = Math.sin(T * 15) * 0.06 * w;
      smMesh.scale.set(1 + 0.05 * w, 1 - 0.06 * w * Math.abs(Math.sin(T * 19)), 1 + 0.05 * w);
      if (phase === 'end') smMesh.position.y = Math.abs(Math.sin(T * 6)) * 0.03;
      if (smBubble) {
        smBubble.t += dt;
        if (smBubble.t > 1.2) { smBubble.el.remove(); smBubble = null; }
        else placeAt(smBubble.el, V.set(SNOWMAN.x, 0.78, SNOWMAN.z));
      }
    }
    function puff(p, n, s) {
      for (let i = 0; i < n; i++) {
        if (puffList.length >= 96) puffList.shift();
        const a = rnd() * TAU, up = 0.4 + rnd() * 0.9, sp = (0.35 + rnd() * 0.5) * s;
        puffList.push({ p: p.clone(), v: new THREE.Vector3(Math.cos(a) * sp, up * s, Math.sin(a) * sp), t: 0, life: 0.38 + rnd() * 0.22, r: (0.018 + rnd() * 0.02) * s });
      }
    }
    function updatePuffs(dt) {
      for (let i = puffList.length - 1; i >= 0; i--) {
        const q = puffList[i];
        q.t += dt;
        if (q.t >= q.life) { puffList.splice(i, 1); continue; }
        q.v.y -= 3.2 * dt;
        q.v.multiplyScalar(1 - dt * 2.5);
        q.p.addScaledVector(q.v, dt);
        if (q.p.y < 0.03) { q.p.y = 0.03; q.v.y = 0; }
      }
    }
    function ballPos(b, out) {
      if (b.free) return out.copy(b.free.p);
      const u = Math.min(1, b.t / b.T);
      return out.lerpVectors(b.a, b.b, u).setY(lerp(b.a.y, b.b.y, u) + 4 * b.h * u * (1 - u));
    }
    function writeInstances() {
      let nb = 0, ns = 0, nr = 0;
      for (const b of myBalls) {
        ballPos(b, V2);
        put(balls, nb++, V2.x, V2.y, V2.z, 0.042);
        const gy = colliders.heightAt(V2.x, V2.z) + 0.045;
        const hgt = Math.max(0, V2.y - gy);
        put(blobs, ns++, V2.x, gy, V2.z, clamp(0.13 - hgt * 0.06, 0.05, 0.13));
      }
      for (const s of incoming) {
        ballPos(s, V2);
        put(balls, nb++, V2.x, V2.y, V2.z, 0.045);
        const u = Math.min(1, s.t / s.T);
        const gy = colliders.heightAt(s.x, s.b.z) + 0.045;
        put(blobs, ns++, V2.x, colliders.heightAt(V2.x, V2.z) + 0.046, V2.z, 0.09 + 0.06 * u);
        put(blobs, ns++, s.x, gy + 0.001, s.b.z, lerp(0.22, 0.5, u));
        const pulse = 1 + 0.06 * Math.sin(T * 18);
        put(rings, nr++, s.x, gy + 0.004, s.b.z, lerp(0.55, HIT_R + 0.02, outCubic(u)) * pulse, 1);
      }
      for (const k of kids) {
        if (!k.root.visible || k.y < -0.05) continue;
        put(blobs, ns++, k.wx, colliders.heightAt(k.wx, k.wz) + 0.044, k.wz + 0.02, 0.3);
      }
      put(blobs, ns++, SNOWMAN.x, colliders.heightAt(SNOWMAN.x, SNOWMAN.z) + 0.044, SNOWMAN.z, 0.5);
      let np = 0;
      for (const q of puffList) { const k = 1 - q.t / q.life; put(puffs, np++, q.p.x, q.p.y, q.p.z, q.r * (0.4 + 0.6 * k)); }
      balls.count = nb; blobs.count = ns; rings.count = nr; puffs.count = np;
      for (const m of [balls, blobs, rings, puffs]) m.instanceMatrix.needsUpdate = true;
    }
    function landHeight(x, z) {
      for (const f of FORTS) {
        V.set(x, 0, z).applyMatrix4(f.inv);
        if (Math.abs(V.x) < f.w / 2 && V.z > -0.12 && V.z < 0.09) return FORT_H + 0.03;
      }
      return colliders.heightAt(x, z) + 0.03;
    }

    // ------------------------------------------------------------------ camera
    function updateCamera(dt) {
      const dx = px - START_X;
      let ox = 0, oy = 0;
      if (shake > 0) { shake = Math.max(0, shake - dt); const s = shake * 0.07; ox = Math.sin(T * 61) * s; oy = Math.cos(T * 47) * s; }
      // narrower screens (4:3 tablets) step back a little so the outermost pop-up spots stay in frame
      // portrait / narrow screens pull back along the view ray so the whole row of forts fits the width (aspectK)
      camPos.set(CAM.x + CAM.off + dx * CAM.follow + ox, CAM.y + oy, CAM.z);
      camTgt.set(LOOK.x + dx * LOOK.follow, LOOK.y, LOOK.z);
      const k = aspectK(1.75, 2.1, 0.9);
      if (k > 1) { zoomOut(camPos, camTgt, k); camPos.y += (k - 1) * 0.35; camTgt.y -= (k - 1) * 0.25; } // lift a little, forts sit mid-screen above the buttons
    }

    // ------------------------------------------------------------------ DOM labels
    function screenOf(v) {
      V2.copy(v).project(engine.camera);
      return [((V2.x + 1) / 2) * innerWidth, ((1 - V2.y) / 2) * innerHeight, V2.z < 1];
    }
    function screenDist(v, sx, sy) { const [x, y, ok] = screenOf(v); return ok ? Math.hypot(x - sx, y - sy) : Infinity; }
    function screenRadius(v, r) { const d = v.distanceTo(engine.camera.position); return (r / (d * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)))) * innerHeight * 0.5; }
    function placeAt(node, v) {
      let [x, y] = screenOf(v);
      const hw = (node.offsetWidth || 60) / 2 + 6; // keep bubbles and pops inside the screen
      x = clamp(x, hw, Math.max(hw, innerWidth - hw));
      if (isPortrait()) y = Math.max(y, 130);
      node.style.left = `${x.toFixed(1)}px`; node.style.top = `${y.toFixed(1)}px`;
    }
    function label(v, text, cls = '', delay = 0) {
      const n = el('div', 'sb-pop ' + cls, ui);
      n.textContent = text;
      placeAt(n, v);
      n.style.top = `${parseFloat(n.style.top) - (cls.includes('small') ? 18 : 30)}px`;
      if (delay) n.style.animationDelay = `${delay}s`;
      labels.push({ el: n, t: -delay, life: 1.0 });
    }
    function bigLabel(text) {
      const n = el('div', 'sb-pop big', ui);
      n.textContent = text;
      n.style.left = '50%'; n.style.top = '30%';
      labels.push({ el: n, t: 0, life: 1.45 });
    }
    function updateLabels(dt) {
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i];
        l.t += dt;
        if (l.t > l.life) { l.el.remove(); labels.splice(i, 1); }
      }
    }

    // ------------------------------------------------------------------ end of round
    function beginEnd() {
      if (phase !== 'play') return;
      phase = 'end'; endT = 0; timeLeft = 0;
      mg.hud.setTimer(0);
      bigLabel("Time's up!");
      sfx('bell', { vol: 0.7 });
      for (const s of incoming) puff(ballPos(s, new THREE.Vector3()), 5, 0.7);
      incoming.length = 0;
      for (const k of kids) { // everybody pops up for a cheer
        if (k.state === 'hidden' || k.state === 'duck') { setSpot(k, k.spot); k.state = 'rise'; k.t = 0; k.from = k.y; k.lx = k.lx || k.hideLx; k.next = 'cheer'; }
        else if (k.state === 'up' || k.state === 'hit') { k.state = 'cheer'; k.y = Math.max(k.y, k.upY - 0.02); }
        else k.next = 'cheer';
        k.throwT = -1;
      }
      smWobble = 0.6;
      sfx('cheer', { vol: 0.5, delay: 0.3 });
    }
    function finishGame() {
      if (mg.finished) return;
      const stars = score >= STARS[2] ? 3 : score >= STARS[1] ? 2 : score >= STARS[0] ? 1 : 0;
      let text = `${hits} hit${hits === 1 ? '' : 's'} · best streak ×${Math.max(1, bestStreak)}`;
      if (snowmanHits) text += snowmanHits > 1 ? ` · the snowman forgives you (${snowmanHits}×)` : ' · the snowman forgives you';
      if (!stars) text = `${hits} hit${hits === 1 ? '' : 's'} — tap the kids the moment they pop up. ${STARS[0]} points earns a star!`;
      mg.finish({ score, stars, text });
    }

    // ------------------------------------------------------------------ cleanup
    function dispose() {
      lastExit = { time: engine.time, pre };
      const lp = camPos.clone(), lt = camTgt.clone();
      cam.playShot({ name: 'snowball-out', portrait: false, duration: 0.8, blendIn: 0.0001, blendOut: 0.8, skippable: false, tilt: 1.2, update(u, out) { out.pos.copy(lp); out.target.copy(lt); } });
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      showPark();
      for (const l of labels) l.el.remove();
      labels.length = 0;
      for (const k of kids) k.bubble?.el.remove();
      smBubble?.el.remove();
      ui.remove();
      hint = null;
      const ch = player.character;
      ch.body.rotation.x = 0; ch.body.scale.y = 1; ch.arms[0].rotation.x = 0;
      player.teleport(pre.x, pre.z, pre.h); // back beside Tilly; the follow camera glides over during the blend-out
      for (const o of owned) o.dispose?.();
      owned.length = 0;
      if (window.__snowball && window.__snowball._owner === root) delete window.__snowball;
    }

    // ------------------------------------------------------------------ test hooks (window.__snowball)
    function runBot(dt) {
      if (phase !== 'play') { botDir = 0; return; }
      botT -= dt;
      if (botT <= 0) {
        const ks = kids.filter((k) => hittable(k) && !myBalls.some((b) => b.target.kid === k) && (bot === 1 || k.t > 0.45));
        if (ks.length) {
          const k = ks[0];
          if (bot === 2 && rnd() < 0.45) tryThrow({ kind: 'ground', point: new THREE.Vector3(k.wx + (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.4), 0.03, k.wz + 0.25) });
          else tryThrow({ kind: 'kid', kid: k, point: new THREE.Vector3(k.wx, k.y + HEAD_Y - 0.02, k.wz) });
          botT = bot === 1 ? 0.3 : 1.0 + rnd() * 0.9;
        } else botT = 0.1;
      }
      botDir = 0;
      const danger = incoming.find((s) => Math.abs(px - s.x) < HIT_R + 0.06 && s.t / s.T > (bot === 1 ? 0.3 : 0.55));
      if (danger && (bot === 1 || danger.dodge)) botDir = danger.x <= px ? (px > RAIL.x1 - 0.05 ? -1 : 1) : px < RAIL.x0 + 0.05 ? 1 : -1;
    }
    function exposeDebug() {
      const api = {
        _owner: root,
        get state() {
          return {
            phase, timeLeft: +timeLeft.toFixed(2), score, hits, misses, streak, bestStreak, snowmanHits, hitsTaken, dodges, px: +px.toFixed(2),
            balls: myBalls.length, incoming: incoming.length, puffs: puffList.length, labels: labels.length,
            kids: kids.map((k) => ({ state: k.state, x: +k.wx.toFixed(2), z: +k.wz.toFixed(2), y: +k.y.toFixed(2) })),
          };
        },
        throwAt(x, z, y = 0.03) { tryThrow({ kind: 'ground', point: new THREE.Vector3(x, y, z) }); return api.state; },
        throwAtKid(i) { const k = kids[i]; tryThrow({ kind: 'kid', kid: k, point: new THREE.Vector3(k.wx, k.y + HEAD_Y - 0.02, k.wz) }); return k.state; },
        throwAtSnowman() { tryThrow({ kind: 'snowman', point: new THREE.Vector3(SNOWMAN.x, 0.36, SNOWMAN.z) }); },
        /** Simulate a tap at a screen pixel (runs the real aim assist + raycast). */
        tap(sx, sy) { handleTap({ x: (sx / innerWidth) * 2 - 1, y: -(sy / innerHeight) * 2 + 1 }, sx, sy); return api.state; },
        /** Screen pixel of kid i's head (for tap tests). */
        kidScreen(i) { const k = kids[i]; const [x, y] = screenOf(V.set(k.wx, k.y + HEAD_Y, k.wz)); return [Math.round(x), Math.round(y)]; },
        popAll() { for (const k of kids) if (k.state === 'hidden') popKid(k, 0); },
        incomingNow(i = 0) { const k = kids[i]; if (k.state === 'up') k.throwT = 0; else spawnIncoming(k); },
        move(dir) { keys.l = dir < 0; keys.r = dir > 0; },
        setTime(s) { timeLeft = s; },
        bot(mode) { bot = mode | 0; return bot; },
        /** Advance game logic without rendering (all engine updates run). */
        ff(sec, step = 1 / 30) { for (let i = 0, n = Math.round(sec / step); i < n; i++) { engine.time += step; for (const u of engine.updates.slice()) u.fn(step, engine.time); } return api.state; },
        budget() {
          let calls = 0, tris = 0;
          root.traverseVisible((o) => {
            if (!o.isMesh) return;
            const n = o.isInstancedMesh ? o.count : 1;
            if (!n) return;
            const passes = o.castShadow ? 2 : 1;
            calls += passes;
            tris += (o.geometry.attributes.position.count / 3) * n * passes;
          });
          return { calls, tris: Math.round(tris) };
        },
      };
      window.__snowball = api;
    }

    // ================================================================== geometry
    function buildProps() {
      const g = [];
      for (const f of FORTS) for (const p of fortGeos(f)) g.push(xf(p, [f.x, 0, f.z], [0, f.ry, 0]));
      // the player's own low snow wall + a ready pile of snowballs
      const n = 11, x0 = 4.1, x1 = 5.95, wz = 13.03;
      for (let i = 0; i < n; i++) {
        const x = lerp(x0, x1, (i + 0.5) / n), j = Math.sin(i * 12.9898) * 0.5;
        g.push(xf(rbox((x1 - x0) / n * 0.96, 0.085, 0.12, 0.03, i % 2 ? SNOW2 : SNOW, FELT, 1), [x, 0.045, wz + j * 0.02], [0, j * 0.12, 0]));
        if (i % 2 === 0) g.push(xf(sph(0.07, SNOW, FELT, 10, 6), [x + 0.04, 0.095, wz], null, [1.5, 0.5, 1.1]));
      }
      for (const [x, z, s] of [[4.02, 13.06, 1], [6.03, 13.05, 1.1]]) g.push(xf(sph(0.12, SNOW, FELT, 10, 6), [x, 0.03, z], null, [s * 0.9, 0.55, 0.9]));
      g.push(...ammoPile(5.97, 13.36, 0.036));
      // soft snow lumps across the clearing
      for (const [x, z, s] of [[4.45, 12.8, 0.8], [5.7, 12.8, 0.9], [5.95, 11.75, 0.7], [4.3, 11.6, 1], [6.65, 12.6, 0.8], [5.2, 11.0, 0.9]]) {
        g.push(xf(sph(0.12 * s, SNOW, FELT, 10, 6), [x, 0.02, z], null, [1.6, 0.36, 1.1]));
      }
      return merge(g);
    }
    function fortGeos(f) {
      const g = [], rows = 3, bh = FORT_H / rows, bd = 0.13, k = 0.32;
      const n = Math.max(4, Math.round(f.w / 0.15)), bw = f.w / n;
      const curveZ = (x) => -k * x * x;
      const brick = (x, y, w, h, d, col) => g.push(xf(rbox(w, h, d, 0.026, col, FELT, 1), [x, y, curveZ(x)], [0, Math.atan(2 * k * x), 0]));
      for (let r = 0; r < rows; r++) {
        const shift = r % 2 ? bw * 0.5 : 0;
        for (let i = 0; i < n; i++) {
          const x = -f.w / 2 + bw * (i + 0.5) + shift;
          if (x > f.w / 2 - bw * 0.3) continue;
          brick(x, bh * (r + 0.5), bw * 0.95, bh * 0.94, bd, (i + r) % 3 ? SNOW : SNOW2);
        }
        if (shift) brick(-f.w / 2 + bw * 0.25, bh * (r + 0.5), bw * 0.47, bh * 0.94, bd, SNOW2);
      }
      for (let i = 0; i < n; i += 2) brick(-f.w / 2 + bw * (i + 0.5), FORT_H + 0.028, bw * 0.86, 0.058, bd * 0.9, SNOW);
      for (let i = 1; i < n; i += 2) { const x = -f.w / 2 + bw * (i + 0.5); g.push(xf(sph(0.055, SNOW, FELT, 10, 6), [x, FORT_H + 0.004, curveZ(x)], null, [1.3, 0.42, 1.2])); }
      for (const x of [-f.w * 0.32, 0.02, f.w * 0.3]) g.push(xf(sph(0.11, SNOW, FELT, 10, 6), [x, 0.012, curveZ(x) + 0.085], null, [1.5, 0.3, 0.8]));
      const front = (x) => curveZ(x) + bd / 2;
      if (f.deco === 'flag') {
        const x = -f.w / 2 + 0.07;
        g.push(xf(cyl(0.008, 0.008, 0.36, 5, P.wood, KNIT), [x, FORT_H + 0.17, curveZ(x)]));
        g.push(xf(extrude(poly([[0, 0], [0.18, -0.045], [0, -0.09]]), 0.01, P.red, FELT), [x + 0.006, FORT_H + 0.34, curveZ(x) - 0.005]));
        g.push(xf(extrude(poly([[0, -0.03], [0.07, -0.045], [0, -0.06]]), 0.012, P.cream, FELT), [x + 0.006, FORT_H + 0.34, curveZ(x) - 0.006]));
        g.push(xf(dot(0.016, P.gold, GLOSS), [x, FORT_H + 0.355, curveZ(x)]));
        g.push(...ammoPile(f.w * 0.32, 0.1, 0.032));
      } else if (f.deco === 'lights') {
        const pts = [];
        for (let i = 0; i <= 10; i++) { const x = lerp(-f.w / 2 + 0.05, f.w / 2 - 0.05, i / 10); pts.push([x, FORT_H - 0.012 - Math.sin((i % 5) / 5 * Math.PI) * 0.03, front(x) + 0.006]); }
        g.push(tube(pts, 0.0045, P.pine, KNIT, 30, 4));
        const cols = [P.glow, '#ff6a5a', '#8fe0b0', P.glowSoft];
        for (let i = 0; i < 10; i++) { const x = lerp(-f.w / 2 + 0.09, f.w / 2 - 0.09, i / 9); const sag = Math.sin(((i * 10 / 9) % 5) / 5 * Math.PI) * 0.03; g.push(xf(dot(0.016, cols[i % 4], GLOW), [x, FORT_H - 0.03 - sag, front(x) + 0.012])); }
        g.push(...ammoPile(-f.w * 0.36, 0.1, 0.032));
      } else if (f.deco === 'cane') {
        const x = f.w / 2 - 0.12, z = front(x) + 0.02;
        g.push(xf(tube([[0, 0, 0], [0, 0.24, 0], [0.008, 0.29, 0], [0.04, 0.312, 0], [0.072, 0.296, 0], [0.082, 0.262, 0]], 0.014, '#f6efe4', KNIT, 24, 6), [x, 0.05, z]));
        for (let i = 0; i < 6; i++) g.push(xf(torus(0.0145, 0.0055, P.red, KNIT, TAU, 10), [x, 0.07 + i * 0.038, z], [Math.PI / 2 - 0.45, 0, 0]));
        g.push(...ammoPile(-f.w * 0.28, 0.1, 0.032));
      }
      return g;
    }
    function ammoPile(x, z, r) {
      return [[-1, 0, 0], [1, 0, 0], [0, 0, 1.6], [0, 1, 0.55]].map(([i, j, l]) => xf(sph(r, SNOW, FELT, 8, 6), [x + i * r * 1.02, r * 0.9 + j * r * 1.45, z + l * r * 0.62]));
    }
    function snowmanGeo() {
      const g = [];
      g.push(xf(sph(0.22, SNOW, FELT, 14, 7), [0, 0.02, 0], null, [1.25, 0.28, 1.15]));
      g.push(xf(sph(0.165, SNOW, FELT, 16, 10), [0, 0.15, 0], null, [1, 0.92, 1]));
      g.push(xf(sph(0.126, SNOW, FELT, 16, 10), [0, 0.355, 0]));
      g.push(xf(sph(0.098, SNOW, FELT, 16, 10), [0, 0.525, 0]));
      for (const sx of [-1, 1]) {
        g.push(xf(dot(0.012, P.ink, GLOSS), [sx * 0.033, 0.548, 0.088]));
        g.push(xf(dot(0.017, '#e9938f', FELT), [sx * 0.058, 0.515, 0.074], [0, sx * 0.62, 0], [1, 0.7, 0.4]));
      }
      g.push(xf(cone(0.02, 0.1, 8, P.orange, FELT), [0, 0.527, 0.146], [Math.PI / 2, 0, 0]));
      for (let i = 0; i < 5; i++) { const a = -0.5 + i * 0.25, x = a * 0.085, y = 0.494 + a * a * 0.05; g.push(xf(dot(0.0075, P.ink, GLOSS), [x, y, Math.sqrt(Math.max(0, 0.098 ** 2 - x * x - (y - 0.525) ** 2)) + 0.002])); }
      for (const [y, c] of [[0.31, '#7fc9c0'], [0.37, P.red]]) g.push(xf(dot(0.014, c, GLOSS), [0, y, Math.sqrt(0.126 ** 2 - (y - 0.355) ** 2) + 0.002]));
      g.push(xf(torus(0.09, 0.025, P.mint, KNIT, TAU, 18), [0, 0.448, 0], [Math.PI / 2, 0, 0]));
      g.push(xf(rbox(0.045, 0.13, 0.02, 0.008, P.mint, KNIT, 1), [0.06, 0.39, 0.095], [0.15, 0, 0.18]));
      for (let i = 0; i < 3; i++) g.push(xf(rbox(0.047, 0.012, 0.022, 0.004, P.red, KNIT, 1), [0.06 - i * 0.002, 0.43 - i * 0.03, 0.098], [0.15, 0, 0.18]));
      // knitted beanie with a pom-pom
      g.push(xf(part(new THREE.SphereGeometry(0.096, 14, 6, 0, TAU, 0, Math.PI / 2), P.red, KNIT, [(TAU * 0.096) / 0.08, (Math.PI * 0.096) / 0.064]), [0, 0.565, -0.008], [-0.15, 0, 0], [1, 1.05, 1]));
      g.push(xf(torus(0.093, 0.018, P.cream, KNIT, TAU, 18), [0, 0.57, -0.006], [Math.PI / 2 - 0.15, 0, 0]));
      g.push(xf(sph(0.035, P.cream, FELT, 10, 7), [0, 0.675, -0.03]));
      // twig arms (one waving)
      g.push(tube([[0.11, 0.37, 0], [0.2, 0.43, 0.02], [0.28, 0.53, 0.03]], 0.01, P.woodDark, KNIT, 8, 5));
      g.push(tube([[0.225, 0.465, 0.024], [0.27, 0.46, 0.05]], 0.007, P.woodDark, KNIT, 3, 4));
      g.push(tube([[-0.11, 0.36, 0], [-0.2, 0.33, 0.02], [-0.29, 0.31, 0.04]], 0.01, P.woodDark, KNIT, 8, 5));
      g.push(tube([[-0.23, 0.322, 0.026], [-0.26, 0.355, 0.04]], 0.007, P.woodDark, KNIT, 3, 4));
      g.push(xf(sph(0.026, P.red, KNIT, 8, 6), [0.29, 0.545, 0.03], null, [1, 1.2, 0.8]));
      return merge(g);
    }
  },
};

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
