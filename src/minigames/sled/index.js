// Sledge Hill Race (door 7) — two timed runs down Sledge Hill on a wooden sled.
// Run 1 "Pine Run" goes down the west half, run 2 "Cable Car Run" winds through the east half; both start on the
// hilltop (layout ARENAS.sled.top) and finish under the FINISH arch at the bottom. Steer left/right only.
// Files: course.js (routes, sampling, obstacle probing, item layout), race.js (simulation), props.js (models).
import { aspectK } from '../view.js';
import * as THREE from 'three';
import { buildCharacter } from '../../core/player.js';
import { RUN_DEFS, FINISH, sampleRun, frameAt, pointAt, project, probeObstacles, layoutRun } from './course.js';
import { createRace, scoreRace, scoreNight } from './race.js';
import * as PR from './props.js';
import './sled.css';

const T_CLEAN_NIGHT = 38.2; // autopilot clock of the night race (14/15 gates, 1 penalty; measured with __sled2.auto); 3★ needs this + 3.5 s
const T_FAST = 40.5; // seconds (both runs + penalties) for the "fast" star; a clean autopilot run is ~37 s
/** Per-variant options: door 7 ('day') is the original race; door 16 ('night', see night.js) reuses everything else. */
export const VARIANTS = {
  day: {
    variant: 'day', hook: '__sled', seeds: [11, 23], layout: {}, gateGeo: () => PR.gateGeo(0.32), itemGeo: () => PR.starGeo(), itemScale: 1,
    itemY: 0.25, itemName: 'Stars', gateName: 'flag', banner1: ['Run 1 · Pine Run', 'Steer ◀ ▶ through the flag gates'], banner2: ['Run 2 · Cable Car Run', 'Ready…'],
    okTint: [1.18, 1.08, 0.78], missTint: [0.55, 0.55, 0.6], sparkle: 'pickup', gateSfx: ['whoosh', 0.6],
  },
  night: {
    variant: 'night', hook: '__sled2', seeds: [23, 41], layout: { minGap: 1.9, thinStars: 4 }, gateGeo: () => PR.lanternGateGeo(0.32), itemGeo: () => PR.bellGeo(), itemScale: 1.2,
    itemY: 0.2, itemName: 'Bells', gateName: 'lantern', banner1: ['Night Race', 'Run 1 · Pine Run · steer ◀ ▶ through the lantern gates'], banner2: ['Night Race', 'Run 2 · Cable Car Run · Ready…'],
    okTint: [1.5, 1.3, 0.85], missTint: [0.28, 0.28, 0.36], sparkle: 'bell', gateSfx: ['bell', 0.55], hour: 21.5,
  },
};
const PLAYER_SCALE = 1.15; // createPlayer's doll scale
const params = new URLSearchParams(location.search);
let obstacleCache = null; // { colliders, list } — the hill's colliders don't change between replays

export default {
  id: 'sled',
  title: 'Sledge Hill Race',
  district: 'hill',
  icon: '🛷',
  intro: 'Two runs down Sledge Hill! Steer with ← → (or A / D), or hold the left or right side of the screen. Zip through the flag gates, grab the gold stars, and dodge gnomes, pines and snow lumps.',
  start(ctx, mg) { return startSled(ctx, mg, { variant: 'day' }); },
};

export async function startSled(ctx, mg, opts = {}) {
  const V = VARIANTS[opts.variant || 'day'];
  const night = V.variant === 'night';
  const { engine, player, cam, colliders, game, layout } = ctx;
  const mat = engine.mat;
  const disposables = [];
  const keep = (g) => { disposables.push(g); return g; };
  mg.setPlayerControl(false);
  // night race: the town goes dark for the run (the sky eases in during the intro) and the hour is handed back on dispose
  const world = ctx.world;
  const h0 = night && world?.setTimeOfDay ? world.timeOfDay : null, t0 = engine.time;
  if (h0 != null) {
    world.setTimeOfDay(V.hour);
    mg.onDispose(() => world.setTimeOfDay(h0 + Math.max(0, engine.time - t0) / 3600));
  }

  // ---------------------------------------------------------------- course + race
  const ground = (x, z) => colliders.heightAt(x, z);
  const courses = RUN_DEFS.map((d) => sampleRun(d, ground));
  if (!obstacleCache || obstacleCache.colliders !== colliders) {
    const probe = (x, z) => { const p = { x, z }; colliders.resolve(p, 0, x, z); return Math.hypot(p.x - x, p.z - z) > 1e-5 ? p : null; };
    obstacleCache = { colliders, list: probeObstacles(courses, probe) };
  }
  const obstacles = obstacleCache.list;
  const runs = courses.map((C, i) => ({ C, L: layoutRun(C, obstacles, V.seeds[i], V.layout) }));
  const race = createRace(runs);

  // ---------------------------------------------------------------- static course props (2 merged meshes)
  const start0 = [RUN_DEFS[0].pts[0][0], RUN_DEFS[0].pts[0][1]];
  const START_R = 0.36;
  const trackParts = [];
  runs.forEach((r, i) => trackParts.push(...PR.trackGeos(r.C, ground, { lift: 0.04 + i * 0.006, start: [...start0, START_R] })));
  trackParts.push(...PR.finishPadGeos(ground), ...PR.startMatGeos(ground, start0[0], start0[1], START_R));
  const track = mg.add(new THREE.Mesh(keep(mergeAll(trackParts)), mat));
  track.receiveShadow = true;
  track.name = 'sled-track';
  const decor = mg.add(new THREE.Mesh(keep(mergeAll([...PR.finishArchGeos(ground), ...PR.startSignGeos(ground, -1.22, -15.74)])), mat));
  decor.castShadow = decor.receiveShadow = true;
  decor.name = 'sled-decor';

  // ---------------------------------------------------------------- instanced props
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const yawOf = (f) => Math.atan2(f.tx, f.tz);
  const setM = (im, i, x, y, z, ry, s, rx = 0, rz = 0) => {
    e3.set(rx, ry, rz, 'YXZ');
    im.setMatrixAt(i, m4.compose(v3.set(x, y, z), q4.setFromEuler(e3), typeof s === 'number' ? s3.setScalar(s) : s));
  };
  const inst = (geo, n, name, { cast = false, dynamic = false } = {}) => {
    const im = new THREE.InstancedMesh(keep(geo), mat, Math.max(1, n));
    im.count = n;
    im.castShadow = cast; im.receiveShadow = true;
    im.name = name;
    if (dynamic) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; }
    disposables.push(im);
    return mg.add(im);
  };
  // gates (both runs)
  const gateList = [];
  runs.forEach((r, ri) => r.L.gates.forEach((g, gi) => gateList.push({ ri, gi, g })));
  const gates = inst(V.gateGeo(), gateList.length, 'sled-gates', { dynamic: true });
  const gateFx = gateList.map(() => ({ pop: 0 }));
  gateList.forEach((q, k) => gates.setColorAt(k, col.setRGB(1, 1, 1))); // allocate instance colours up front (no shader swap mid-run)
  // stars (only the active run's are shown)
  const starList = [];
  runs.forEach((r, ri) => r.L.stars.forEach((st, si) => starList.push({ ri, si, st, y: ground(st.x, st.z) + V.itemY, pop: 0 })));
  const stars = inst(V.itemGeo(), starList.length, 'sled-stars', { dynamic: true });
  // hazards: snow lumps + small pines (both runs, static scenery)
  const own = runs.flatMap((r) => r.L.own);
  const lumpsL = own.filter((h) => h.kind === 'lump'), pinesL = own.filter((h) => h.kind === 'pine');
  const lumps = inst(PR.lumpGeo(), lumpsL.length, 'sled-lumps');
  lumpsL.forEach((h, i) => setM(lumps, i, h.x, ground(h.x, h.z) + 0.01, h.z, h.s * 3.1, h.scale * 0.95));
  const pines = inst(PR.pineGeo(), pinesL.length, 'sled-pines', { cast: true });
  pinesL.forEach((h, i) => setM(pines, i, h.x, ground(h.x, h.z), h.z, h.s * 2.3, 0.52 + h.scale * 0.12));
  const hzFx = new Map(); // hazard → shake timer
  // gnome riders (active run)
  const maxG = Math.max(...runs.map((r) => r.L.gnomes.length));
  const gnomes = inst(PR.gnomeGeo(), maxG, 'sled-gnomes', { dynamic: true });
  // puffs + sparkles
  const NP = 56, NS = 40;
  const puffs = inst(PR.puffGeo(), NP, 'sled-puffs', { dynamic: true });
  const sparks = inst(PR.sparkGeo(), NS, 'sled-sparks', { dynamic: true });
  const puffP = Array.from({ length: NP }, () => ({ t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
  const sparkP = Array.from({ length: NS }, () => ({ t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
  let puffI = 0, sparkI = 0;
  const emit = (pool, idx, n, x, y, z, spread, up, size, life) => {
    for (let k = 0; k < n; k++) {
      const p = pool[(idx + k) % pool.length];
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      Object.assign(p, { t: 0, life: life * (0.7 + Math.random() * 0.6), x, y, z, vx: Math.cos(a) * r, vz: Math.sin(a) * r, vy: up * (0.5 + Math.random()), s: size * (0.6 + Math.random() * 0.7) });
    }
    return (idx + n) % pool.length;
  };
  const puff = (x, y, z, n = 6, spread = 0.6, up = 0.6, size = 0.035) => { puffI = emit(puffP, puffI, n, x, y, z, spread, up, size, 0.7); };
  const sparkle = (x, y, z, n = 8) => { sparkI = emit(sparkP, sparkI, n, x, y, z, 0.7, 0.9, 0.022, 0.6); };
  // finish crowd: 4 cheering knitted dolls (2 instanced styles)
  const crowdA = inst(PR.crowdDollGeo(mat, { coat: 'teal', hat: 'bobble', scarf: 'red' }), 2, 'sled-crowdA', { dynamic: true });
  const crowdB = inst(PR.crowdDollGeo(mat, { coat: 'mustard', hat: 'earflap', scarf: 'white' }), 2, 'sled-crowdB', { dynamic: true });
  const crowd = [[crowdA, 0, -1.45, -8.02], [crowdB, 0, -0.75, -7.92], [crowdA, 1, 0.35, -7.95], [crowdB, 1, 0.95, -8.05]]
    .map(([im, i, x, z]) => ({ im, i, x, z, y: ground(x, z), yaw: Math.atan2(FINISH.x - x, FINISH.z - z), ph: Math.random() * 6, hop: 0 }));
  for (const c of crowd) setM(c.im, c.i, c.x, c.y, c.z, c.yaw, 1);
  for (const im of [crowdA, crowdB]) { im.frustumCulled = true; im.computeBoundingSphere(); im.boundingSphere.radius += 0.3; }

  // ---------------------------------------------------------------- the sled + the player's own doll
  const sledGroup = new THREE.Group();
  sledGroup.name = 'sled-player';
  const sledMesh = new THREE.Mesh(keep(mergeAll(PR.sledParts(1, '#b8302d'))), mat);
  sledMesh.castShadow = true; sledMesh.receiveShadow = true;
  sledGroup.add(sledMesh);
  const rider = buildCharacter(mat, game.state.style || {});
  rider.group.scale.setScalar(PLAYER_SCALE);
  rider.group.position.set(0, 0.112, -0.075);
  sledGroup.add(rider.group);
  rider.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; disposables.push(o.geometry); } });
  mg.add(sledGroup);
  // the town's own hill sledders would ride through the course: park them for the race (public Life API)
  const lifeHold = ctx.life?.hideDistrict?.('hill') || null;
  const lifeSleds = lifeHold ? engine.scene.getObjectByName('life-sleds') : null;
  const lifeSledsVis = lifeSleds ? lifeSleds.visible : true;
  if (lifeSleds) lifeSleds.visible = false;
  const prevVisible = player.object.visible;
  player.object.visible = false; // the copy on the sled stands in for the player's doll

  // ---------------------------------------------------------------- DOM: steer pads, fade, pops
  const ui = document.createElement('div');
  ui.className = 'sled-ui';
  ctx.uiRoot.appendChild(ui);
  const padL = el('div', 'sled-pad l interactive', ui, '◀');
  const padR = el('div', 'sled-pad r interactive', ui, '▶');
  const fade = el('div', 'sled-fade', ui);
  const banner = el('div', 'sled-banner', ui);
  const pop = (text, cls = '') => { const p = el('div', 'sled-pop ' + cls, ui, text); setTimeout(() => p.remove(), 950); };

  // ---------------------------------------------------------------- input (keys, touch halves, pads)
  const keys = new Set();
  const pointers = new Map(); // id → -1 | 1
  const canvas = engine.renderer.domElement;
  const onDown = (e) => {
    let side = 0;
    if (e.target === padL) side = -1;
    else if (e.target === padR) side = 1;
    else if (e.target === canvas) side = e.clientX < innerWidth / 2 ? -1 : 1;
    if (!side) return;
    pointers.set(e.pointerId, side);
    if (e.target !== canvas) e.preventDefault();
  };
  const onMove = (e) => { if (pointers.has(e.pointerId) && e.target === canvas) pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); };
  const onUp = (e) => pointers.delete(e.pointerId);
  const onKeyDown = (e) => { const k = e.key.toLowerCase(); if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) keys.add(k); };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  const onBlur = () => { keys.clear(); pointers.clear(); };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  const humanSteer = () => {
    let s = 0;
    if (keys.has('a') || keys.has('arrowleft')) s -= 1;
    if (keys.has('d') || keys.has('arrowright')) s += 1;
    for (const v of pointers.values()) s += v;
    return Math.max(-1, Math.min(1, s));
  };

  // the town's own kids & gnomes sledging on the hill (Life module) are solid too — read-only, optional
  const townBuf = [], townLast = new Map();
  function townies() {
    townBuf.length = 0;
    if (lifeHold) return townBuf; // hill sledders are parked for the race
    try {
      const dolls = ctx.life?._debug?.pool?.dolls;
      if (!dolls) return townBuf;
      const P = pointAt(race.run.C, race.s, race.d);
      for (const d of dolls) {
        if (d.district !== 'hill' || !d.vis || !(d.pop > 0.5) || d.gather) continue;
        const last = townLast.get(d.id);
        townLast.set(d.id, [d.x, d.z, engine.time]);
        if (Math.abs(d.x - P.x) > 2 || Math.abs(d.z - P.z) > 2) continue;
        // speed along the track: a faster kid overtaking from behind passes "through" (only running into them bumps)
        let va = 0;
        if (last && engine.time - last[2] > 1e-3) va = ((d.x - last[0]) * P.tx + (d.z - last[1]) * P.tz) / (engine.time - last[2]);
        townBuf.push({ id: d.id, x: d.x, z: d.z, r: d.sit ? 0.12 : 0.08, va });
      }
    } catch (e) { /* Life internals changed: just skip */ }
    return townBuf;
  }
  const projectTo = (o) => { const p = project(race.run.C, o.x, o.z); return { s: p.s, d: p.d }; };

  // ---------------------------------------------------------------- debug / test hook
  const dbg = window[V.hook] = Object.assign(window[V.hook] || {}, { variant: V.variant, auto: params.has('mgauto') || params.has('sledauto') || !!(window[V.hook] && window[V.hook].auto) });
  if (night) window.__sled = dbg; // WAVE2: window.__sled.variant === 'night' while Sled II runs (door 7 never runs at the same time)
  dbg.race = race;
  /** Draw calls / triangles of everything this game keeps in the scene (shadow casters count twice, like __snowball.budget()). */
  dbg.budget = () => {
    let calls = 0, tris = 0;
    for (const root of engine.scene.children) {
      if (!root.name || !root.name.startsWith('sled-')) continue;
      root.traverseVisible((o) => {
        if (!o.isMesh) return;
        const n = o.isInstancedMesh ? o.count : 1;
        if (!n) return;
        const passes = o.castShadow ? 2 : 1, g = o.geometry;
        calls += passes;
        tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * n * passes;
      });
    }
    return { calls, tris: Math.round(tris) };
  };
  dbg.runs = runs;
  dbg.obstacles = obstacles;

  // ---------------------------------------------------------------- camera rig (one long, non-skippable shot)
  const rig = { pos: engine.camera.position.clone(), target: (engine.focus || new THREE.Vector3()).clone(), dir: new THREE.Vector3(), orbit: 0, k: 2.2 };
  { const f = frameAt(runs[0].C, 0.6); rig.dir.set(f.tx, 0, f.tz); }
  const wantPos = new THREE.Vector3(), wantTarget = new THREE.Vector3(), tmpDir = { x: 0, z: 0 };
  cam.setMode('close');
  const shotSpec = { name: 'sled', portrait: false, duration: 1e5, blendIn: 0.001, blendOut: 0.4, skippable: false, tilt: 0.8, update: (u, out) => { out.pos.copy(rig.pos); out.target.copy(rig.target); } };
  cam.playShot(shotSpec);
  const trees = obstacles.filter((o) => o.tree);
  const walls = obstacles.filter((o) => !o.tree && o.r < 0.03); // chalet / bench / station outlines
  const START_AIM = [null, 0.31]; // per run: chase heading (rad from +z towards +x) held at the start gate; null = follow the track
  function camBlocked(cx, cy, cz, sx, sy, sz) {
    for (const t of trees) {
      if (Math.abs(cx - t.x) > 2.5 || Math.abs(cz - t.z) > 2.5) continue;
      const base = ground(t.x, t.z), h = (t.r / 0.13) * 1.12; // snowy cap included, a little conservative
      if (Math.hypot(cx - t.x, cz - t.z) < t.R * 1.1 && cy < base + h + 0.25) return true;
      for (let k = 1; k <= 6; k++) { // line of sight through the knitted cone
        const u = k / 7, x = cx + (sx - cx) * u, y = cy + (sy - cy) * u, z = cz + (sz - cz) * u, yl = y - base;
        if (yl > 0 && yl < h && Math.hypot(x - t.x, z - t.z) < t.R * (1 - yl / h) + 0.12) return true;
      }
    }
    for (const w of walls) {
      if (Math.abs(cx - w.x) > 1 || Math.abs(cz - w.z) > 1) continue;
      if (Math.hypot(cx - w.x, cz - w.z) < 0.7 && cy < ground(w.x, w.z) + 2.1) return true;
    }
    return false;
  }
  function aimRig(dt, snap = false) {
    const r = race.run, Cr = r.C;
    const P = pointAt(Cr, race.s, race.d);
    const py = ground(P.x, P.z) + 0.1;
    if (phase === 'celebrate' || phase === 'done') {
      // slow sway on the open south-east side (the crowd, the FINISH banner; the hill's pines are to the north)
      rig.orbit += dt;
      const a = 0.75 + Math.sin(rig.orbit * 0.35) * 0.45;
      { const ck = aspectK(1.75, 2, 0.9); wantPos.set(P.x + Math.sin(a) * 2.1 * ck, py + 1.1 + (ck - 1) * 0.8, P.z + Math.cos(a) * 2.1 * ck); }
      wantTarget.set(P.x + 0.15, py + 0.3, P.z);
    } else {
      PR.avgDir(Cr, race.s - 0.15, race.s + 1.5, tmpDir);
      // heat start: run 2 sets off due east, which put the chase camera inside / behind the hilltop chalet (x -4.1…-2.3).
      // Start it north of the gate instead, already looking down the hill the way the run turns after ~1 unit
      // (lamp to one side, bench to the other), and hand over to the normal chase direction by s ≈ 1.5.
      const sa = START_AIM[race.heat];
      if (sa != null && race.s < 1.5) {
        const u = Math.min(1, Math.max(0, (race.s - 0.3) / 1.2)), k = 1 - u * u * (3 - 2 * u);
        tmpDir.x += (Math.sin(sa) - tmpDir.x) * k; tmpDir.z += (Math.cos(sa) - tmpDir.z) * k;
      }
      const kd = snap ? 1 : 1 - Math.exp(-dt * 2.4);
      rig.dir.x += (tmpDir.x - rig.dir.x) * kd; rig.dir.z += (tmpDir.z - rig.dir.z) * kd;
      const l = Math.hypot(rig.dir.x, rig.dir.z) || 1;
      const dx = rig.dir.x / l, dz = rig.dir.z / l;
      const ak = 1 + (aspectK(1.75, 2.2, 0.9) - 1) * 0.75; // portrait: pull back / up so the lane and gates fit the narrow width
      let back = 2.15 * ak, up = 1.9 * ak;
      // keep the sled in view: if a pine / wall is near the camera or between it and the sled, come closer and higher
      for (let it = 0; it < 6; it++) {
        if (!camBlocked(P.x - dx * back, py + up, P.z - dz * back, P.x, py + 0.3, P.z)) break;
        back *= 0.8; up += 0.24;
      }
      dbg.cam = { back: +back.toFixed(2), up: +up.toFixed(2) };
      wantPos.set(P.x - dx * back, py + up, P.z - dz * back);
      wantPos.y = Math.max(wantPos.y, ground(wantPos.x, wantPos.z) + 0.55);
      wantTarget.set(P.x + dx * 1.2, py + 0.05, P.z + dz * 1.2);
    }
    if (snap) { rig.pos.copy(wantPos); rig.target.copy(wantTarget); return; }
    rig.pos.lerp(wantPos, 1 - Math.exp(-dt * rig.k));
    rig.target.lerp(wantTarget, 1 - Math.exp(-dt * (rig.k + 2)));
    // the lagging camera itself lost sight of the sled (e.g. swinging round a pine): hurry up and over
    if (phase !== 'celebrate' && phase !== 'done') {
      const P2 = pointAt(race.run.C, race.s, race.d), sy = ground(P2.x, P2.z) + 0.4;
      if (camBlocked(rig.pos.x, rig.pos.y, rig.pos.z, P2.x, sy, P2.z)) {
        rig.pos.lerp(wantPos, 1 - Math.exp(-dt * 6));
        rig.pos.y += dt * 1.2;
      }
    }
    rig.k = Math.min(3.4, rig.k + dt * 0.6);
  }

  // ---------------------------------------------------------------- game flow
  let phase = 'intro'; // intro → run → runout → fadeOut → fadeIn → ready → run … → celebrate → done
  let phaseT = 0;
  let lastHud = '';
  let wob = 0, armsUpT = 0, edgeSfxT = 0;
  const totalStars = race.totalStars;
  race.startHeat(0);
  race.phase = 'ready';
  const setPhase = (p) => { phase = p; phaseT = 0; };
  function hud() {
    const timer = race.clock;
    const key = Math.ceil(timer) + '|' + race.starCount + '|' + race.heat;
    if (key === lastHud) return;
    lastHud = key;
    mg.hud.setTimer(timer);
    mg.hud.setScore(`${race.starCount}/${totalStars}`, V.itemName);
    mg.hud.setGoal(`${night ? 'Night race · ' : ''}Run ${race.heat + 1} of 2 · ${race.run.C.name}`);
  }
  hud();
  showBanner(V.banner1[0], V.banner1[1], night ? 2400 : 1600);

  function showBanner(title, sub = '', ms = 1600) {
    banner.innerHTML = `<div class="knit-title">${title}</div>${sub ? `<div class="knit-sub">${sub}</div>` : ''}`;
    banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
    clearTimeout(showBanner.t);
    showBanner.t = setTimeout(() => banner.classList.remove('show'), ms);
  }

  function handle(ev) {
    const r = race.run;
    for (const e of ev) {
      if (e.type === 'star') {
        const k = starList.findIndex((q) => q.ri === race.heat && q.si === e.i);
        if (k >= 0) starList[k].pop = 0.001;
        sparkle(e.x, ground(e.x, e.z) + V.itemY, e.z, 9);
        if (night) { ctx.audio?.sfx?.('sleighBells', { vol: 0.3 }); ctx.audio?.sfx?.('pickup', { vol: 0.55 }); }
        else ctx.audio?.sfx?.('pickup', { vol: 0.75 });
      } else if (e.type === 'gate') {
        const k = gateList.findIndex((q) => q.ri === race.heat && q.gi === e.i);
        if (k >= 0) { gateFx[k].pop = 0.001; gates.setColorAt(k, e.ok ? col.setRGB(...V.okTint) : col.setRGB(...V.missTint)); gates.instanceColor.needsUpdate = true; }
        if (e.ok) { sparkle(e.x, ground(e.x, e.z) + 0.6, e.z, 6); ctx.audio?.sfx?.(V.gateSfx[0], { vol: V.gateSfx[1] }); }
        else { pop(night ? 'Lantern missed +2s' : 'Missed gate +2s', 'miss'); ctx.audio?.sfx?.('fold', { vol: 0.6 }); }
      } else if (e.type === 'bump') {
        wob = 1;
        const y = ground(e.x, e.z);
        puff(e.x, y + (e.kind === 'tree' ? 0.45 : 0.15), e.z, e.kind === 'tree' ? 10 : 7, 0.7, 0.5, e.kind === 'tree' ? 0.05 : 0.04);
        const P = pointAt(r.C, race.s, race.d);
        puff(P.x, ground(P.x, P.z) + 0.08, P.z, 5, 0.5, 0.6, 0.035);
        if (e.kind !== 'gnome' && e.kind !== 'townie') hzFx.set(r.L.hazards[e.i], 0.6);
        ctx.audio?.sfx?.('pop', { vol: 0.9 });
        ctx.audio?.sfx?.('drop', { vol: 0.5 });
        pop(e.kind === 'gnome' ? 'Oops, sorry gnome!' : e.kind === 'townie' ? 'Oops, sorry!' : 'Bump!', 'miss');
      } else if (e.type === 'edge') {
        if (edgeSfxT <= 0) { ctx.audio?.sfx?.('ice', { vol: 0.35 }); edgeSfxT = 0.6; }
      } else if (e.type === 'finish') {
        for (const c of crowd) c.hop = e.last ? 3.2 : 1.4;
        if (e.last) { ctx.audio?.sfx?.('cheer'); armsUpT = 4; }
        else { ctx.audio?.sfx?.('bell'); ctx.audio?.sfx?.('cheer', { vol: 0.5 }); armsUpT = 1.5; }
        pop(`Run ${e.heat + 1}: ${fmt(race.runTimes[e.heat])}`, 'gold');
      }
    }
  }

  /** Gameplay tick (no rendering): input → race → events → phase timers. */
  function tick(dt) {
    if (mg.finished || phase === 'done') return;
    phaseT += dt;
    edgeSfxT -= dt;
    if (phase === 'run' || phase === 'runout') {
      const extra = townies();
      const steer = (dbg.steerFn || window.__sledBot) ? (dbg.steerFn || window.__sledBot)(dt, race) : dbg.auto ? race.autoSteer(extra.map((o) => ({ ...projectTo(o), r: o.r }))) : humanSteer(); // steerFn: test hook (sloppy bots)
      handle(race.step(dt, steer, extra));
      if (race.phase === 'runout' && phase === 'run') setPhase('runout');
      if (phase === 'runout' && (race.v === 0 || phaseT > 2.2)) {
        if (race.heat < runs.length - 1) { setPhase('fadeOut'); fade.style.opacity = '0'; }
        else { setPhase('celebrate'); rig.orbit = 0; rig.k = 1.6; padL.classList.add('off'); padR.classList.add('off'); }
      }
    } else if (phase === 'fadeOut') {
      fade.style.opacity = String(Math.min(1, phaseT / 0.45));
      if (phaseT >= 0.55) {
        race.startHeat(race.heat + 1);
        race.phase = 'ready';
        aimRig(0, true);
        rig.dir.set(0, 0, 0); { const f = frameAt(race.run.C, 0.6); rig.dir.set(f.tx, 0, f.tz); }
        aimRig(0, true);
        setPhase('fadeIn');
        showBanner(V.banner2[0], V.banner2[1], 1500);
      }
    } else if (phase === 'fadeIn') {
      fade.style.opacity = String(Math.max(0, 1 - phaseT / 0.45));
      if (phaseT >= 1.15) {
        fade.style.opacity = '0';
        race.phase = 'run';
        setPhase('run');
        showBanner('Go!', '', 700);
        ctx.audio?.sfx?.('bell');
      }
    } else if (phase === 'celebrate') {
      if (phaseT >= 2.2) {
        setPhase('done');
        const sc = night ? scoreNight(race, T_CLEAN_NIGHT) : scoreRace(race, T_FAST);
        const missed = race.totalGates - race.gateCount;
        const lines = [`Time ${fmt(race.clock)}${missed ? ` (incl. +${missed * 2}s for ${missed} missed gate${missed > 1 ? 's' : ''})` : ''}`,
          night ? `Lantern gates ${sc.nG}/${sc.NG} · Bells ${sc.nS}/${sc.NS}` : `Stars ${sc.nS}/${sc.NS} · Gates ${sc.nG}/${sc.NG}`];
        if (night) { if (sc.stars < 3) lines.push(sc.stars < 2 ? `For ★★: light ${Math.ceil(sc.NG * 0.7)}+ of the ${sc.NG} lanterns.` : `For ★★★: light ${Math.ceil(sc.NG * 0.9)}+ lanterns and finish under ${fmt(sc.tTarget)}.`); }
        else if (sc.stars < 3) lines.push(`For ★★★: finish under ${fmt(T_FAST)} and collect ${Math.ceil(sc.NS * 0.7)}+ stars.`);
        mg.finish({ score: sc.score, stars: sc.stars, text: lines.join(' — ') });
      }
    }
    hud();
  }

  // ---------------------------------------------------------------- visuals (every frame, also during results)
  const fr = {};
  function visuals(dt, t) {
    const r = race.run, Cr = r.C;
    // sled transform
    frameAt(Cr, race.s, fr);
    const P = pointAt(Cr, race.s, race.d);
    const gy = ground(P.x, P.z) + 0.042 + race.heat * 0.006;
    wob = Math.max(0, wob - dt * 1.3);
    const wiggle = Math.sin(t * 26) * wob * 0.22;
    const yaw = yawOf(fr) + race.vd * 0.22 + wiggle;
    const pitch = -Math.atan(fr.grade) * 0.9;
    const roll = -fr.k * race.v * race.v * 0.09 - race.vd * 0.08 + Math.sin(t * 19) * wob * 0.1;
    sledGroup.position.set(P.x, gy, P.z);
    sledGroup.rotation.set(pitch, yaw, roll, 'YXZ');
    // keep the (hidden) player object with the sled so the camera base, district and positional sounds follow
    player.pos.set(P.x, gy, P.z);
    player.vel.set(0, 0);
    player.heading = yaw;
    // rider pose: sitting, legs forward, hands on the rope; arms up on fast stretches / at the finish
    armsUpT = Math.max(0, armsUpT - dt);
    const cheer = armsUpT > 0 || (phase === 'run' && race.v > 1.45 && Math.sin(t * 0.9) > 0.2);
    rider.yaw.rotation.y = 0;
    rider.body.position.y = -0.07 + (cheer ? Math.abs(Math.sin(t * 9)) * 0.012 : 0);
    rider.body.rotation.set(-0.08 + race.v * 0.04, 0, -fr.k * race.v * race.v * 0.12 - race.vd * 0.1 + wiggle * 1.5);
    rider.legs[0].rotation.set(-1.42, 0, -0.06);
    rider.legs[1].rotation.set(-1.42, 0, 0.06);
    const flail = wob > 0.2 ? Math.sin(t * 22) * 0.6 * wob : 0;
    if (cheer) { rider.arms[0].rotation.set(-2.8 + Math.sin(t * 12) * 0.15, 0, -0.3); rider.arms[1].rotation.set(-2.8 - Math.sin(t * 12) * 0.15, 0, 0.3); }
    else { rider.arms[0].rotation.set(-1.0 + flail, 0, -0.15 + race.vd * 0.1); rider.arms[1].rotation.set(-1.0 - flail, 0, 0.15 + race.vd * 0.1); }
    // snow spray from the runners when carving or rubbing the bolsters
    if ((phase === 'run' || phase === 'runout') && race.v > 0.3 && (Math.abs(race.vd) > 0.7 || Math.abs(fr.k) > 1.2) && Math.random() < dt * 14) {
      const back = pointAt(Cr, race.s - 0.2, race.d);
      puff(back.x, ground(back.x, back.z) + 0.06, back.z, 1, 0.35, 0.5, 0.025);
    }
    // gates: bounce when passed
    gateList.forEach((q, k) => {
      const fx = gateFx[k];
      const f = frameAt(runs[q.ri].C, q.g.s);
      let sy = 1, rz = 0;
      if (fx.pop > 0) { fx.pop += dt; const a = fx.pop; sy = 1 + Math.sin(a * 14) * 0.18 * Math.max(0, 1 - a); rz = Math.sin(a * 17) * 0.12 * Math.max(0, 1 - a); if (a > 1) fx.pop = -1; }
      setM(gates, k, q.g.x, ground(q.g.x, q.g.z), q.g.z, yawOf(f), s3.set(1, sy, 1), 0, rz);
    });
    gates.instanceMatrix.needsUpdate = true;
    // stars: spin + bob on the active run; pop when collected
    starList.forEach((q, k) => {
      let s = q.ri === race.heat ? 1 : 0;
      if (q.pop > 0) { q.pop += dt; s = q.pop < 0.12 ? 1 + q.pop * 4 : Math.max(0, 1.5 - (q.pop - 0.12) * 6); if (q.pop > 0.5) { q.pop = -1; } }
      if (q.pop < 0 || race.stars[q.ri].has(q.si) && q.pop === 0) s = 0;
      setM(stars, k, q.st.x, q.y + Math.sin(t * 2.4 + k) * 0.03, q.st.z, night ? Math.sin(t * 1.7 + k) * 0.5 + k : t * 2.2 + k, s * V.itemScale, 0, night ? Math.sin(t * 5 + k * 2) * 0.12 : 0);
    });
    stars.instanceMatrix.needsUpdate = true;
    // own pines / lumps shake when bumped
    let shook = false;
    for (const [h, v] of hzFx) {
      const nv = v - dt;
      if (nv <= 0) hzFx.delete(h); else hzFx.set(h, nv);
      const k = (h.kind === 'pine' ? pinesL : lumpsL).indexOf(h);
      if (k < 0) continue;
      const a = Math.max(0, nv) * Math.sin(t * 30) * 0.12;
      if (h.kind === 'pine') setM(pines, k, h.x, ground(h.x, h.z), h.z, h.s * 2.3, 0.52 + h.scale * 0.12, a, a * 0.6);
      else setM(lumps, k, h.x, ground(h.x, h.z) + 0.01, h.z, h.s * 3.1, h.scale * (0.95 - Math.max(0, nv) * 0.3));
      shook = true;
    }
    if (shook) { pines.instanceMatrix.needsUpdate = true; lumps.instanceMatrix.needsUpdate = true; }
    // gnomes on sleds
    for (let i = 0; i < maxG; i++) {
      const g = race.gnomes[i];
      if (!g) { setM(gnomes, i, 0, -9, 0, 0, 0.0001); continue; }
      const Q = pointAt(Cr, g.s, g.d), fq = frameAt(Cr, g.s);
      const sc = 1 - g.gone;
      const w = Math.sin(t * 24 + i) * g.wob * 0.3;
      setM(gnomes, i, Q.x, ground(Q.x, Q.z) + 0.04, Q.z, yawOf(fq) + g.vd * 0.3 + w, Math.max(0.0001, sc), -Math.atan(fq.grade) * 0.9, -fq.k * g.v * g.v * 0.2 + w * 0.5);
    }
    gnomes.instanceMatrix.needsUpdate = true;
    // crowd
    for (const c of crowd) {
      c.hop = Math.max(0, c.hop - dt);
      const h = c.hop > 0 ? Math.abs(Math.sin(t * 9 + c.ph)) * 0.09 : Math.abs(Math.sin(t * 2 + c.ph)) * 0.012;
      setM(c.im, c.i, c.x, c.y + h, c.z, c.yaw + Math.sin(t * 1.3 + c.ph) * 0.2, 1.0);
    }
    crowdA.instanceMatrix.needsUpdate = true; crowdB.instanceMatrix.needsUpdate = true;
    // particles
    stepParticles(puffs, puffP, dt, -1.4, false);
    stepParticles(sparks, sparkP, dt, -0.6, true);
    aimRig(dt);
  }
  function stepParticles(im, pool, dt, grav, spin) {
    pool.forEach((p, i) => {
      if (p.t >= p.life) { setM(im, i, 0, -20, 0, 0, 0); return; }
      p.t += dt;
      p.vy += grav * dt;
      p.vx *= Math.exp(-dt * 2.5); p.vz *= Math.exp(-dt * 2.5);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life;
      const s = p.s * (spin ? (1 - k) : (0.6 + k * 0.9) * (1 - k * k));
      setM(im, i, p.x, p.y, p.z, spin ? p.t * 9 : 0, Math.max(0.0001, s), spin ? p.t * 7 : 0, 0);
    });
    im.instanceMatrix.needsUpdate = true;
  }

  const unreg = engine.addUpdate((dt, t) => {
    const d = Math.min(0.05, dt);
    tick(d);
    visuals(d, t);
  }, 50);

  /** Fast-forward the gameplay without rendering (tests): runs tick() in 1/30 s steps. */
  dbg.sim = (sec) => { for (let i = 0; i < sec * 30 && !mg.finished; i++) tick(1 / 30); visuals(1 / 30, engine.time); aimRig(0, true); return dbg.state(); };
  dbg.simUntil = (ph, max = 60) => { for (let i = 0; i < max * 30 && !mg.finished && phase !== ph; i++) tick(1 / 30); visuals(1 / 30, engine.time); aimRig(0, true); return dbg.state(); };
  dbg.state = () => ({ phase, heat: race.heat, s: +race.s.toFixed(2), d: +race.d.toFixed(2), v: +race.v.toFixed(2), clock: +race.clock.toFixed(1), stars: race.starCount + '/' + totalStars, gates: race.gateCount + '/' + race.totalGates, bumps: race.bumps, finished: mg.finished });

  // ---------------------------------------------------------------- cleanup: restore the player standing at the hill base
  mg.onDispose(() => {
    unreg();
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    clearTimeout(showBanner.t);
    ui.remove();
    for (const d of disposables) { try { d.dispose(); } catch (e) { /* already gone */ } }
    try { lifeHold?.(); } catch (e) { /* ignore */ }
    if (lifeSleds) lifeSleds.visible = lifeSledsVis;
    player.object.visible = prevVisible !== false;
    const b = layout.ARENAS.sled.bottom;
    player.teleport(b.x, b.z, 0);
    player.object.position.copy(player.pos);
    ctx.input.clearTap();
    // hand the camera back smoothly from where the rig is
    const hold = { pos: rig.pos.clone(), target: rig.target.clone() };
    cam.playShot({ name: 'sled-out', portrait: false, duration: 0.7, blendIn: 0.001, blendOut: 0.7, skippable: false, update: (u, out) => { out.pos.copy(hold.pos); out.target.copy(hold.target); } });
    if (night) { if (window.__sled === dbg) delete window.__sled; if (window.__sled2 === dbg) delete window.__sled2; }
    else if (window.__sled === dbg) { dbg.race = dbg.runs = null; dbg.cleaned = true; }
  });

  // ---------------------------------------------------------------- go
  aimRig(0, false);
  await mg.intro();
  if (mg.finished) return;
  race.phase = 'run';
  setPhase('run');
  if (night) showBanner('Night Race', 'Light the lantern gates, ring the bells', 2000);
  ctx.audio?.sfx?.('sleighBells', { vol: 0.6 });
}

// ------------------------------------------------------------------ helpers
function mergeAll(parts) { return PR.mergeGeos(parts); }
function el(tag, cls, parent, text) { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; parent.appendChild(e); return e; }
function fmt(sec) { const s = Math.max(0, sec || 0); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; }
