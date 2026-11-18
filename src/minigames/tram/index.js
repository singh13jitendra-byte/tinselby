// Tram Conductor (door 11): drive your own festive tram round TRAM_LOOP. One input: hold anywhere / BRAKE /
// Space / S / ↓ to brake, let go to roll on gently. Stop with the tram's centre on each stop (the door lines up
// with the glowing platform): Perfect ±0.25 (30), Good ±0.6 (15), + Smooth (≤ 1 brake release on the approach, 5)
// + On time (5) + 10 per passenger who hops aboard. Overshoot past +0.6 and the passengers wave sadly.
// Route: Park Gate start → Holly Lane, Sledge Hill, Frostmere, Park Gate, Holly Lane, Sledge Hill (1.5 laps).
// Stars (sim.js): 1★ route finished, 2★ ≥ 240 (every stop made), 3★ ≥ 340 (about 4+ perfect stops), max 380.
// Bots (Node, 12 seeds): perfect 380 (3★) · good 335–380 (10×3★, 2×2★) · sloppy 235–315 (11×2★, 1×1★) · none 0 (1★).
// Run ≈ 75 s (perfect), 48 s (never brakes), ≤ 86 s (sloppy).
// Cost while running (__tram.budget(), shadow casters ×2): 9–10 draw calls, ~35k triangles (measured in Chrome).
// Test hook window.__tram = { state, bot(mode), ff(sec, step), budget(), sim, route, log }; ?mgauto plays the
// 'good' bot (&trambot=perfect|good|sloppy|none to pick).
import * as THREE from 'three';
import { buildTramMesh } from '../../life/tram.js';
import { crowdDollGeo } from '../sled/props.js';
import { aspectK } from '../view.js';
import { merge, xf } from '../../core/prims.js';
import { createRoute, createSim, makeBot, ZONE, DOOR_Z, STARS, MAX_SCORE, WAITING } from './sim.js';
import { platformParts, markerGeo, doorGlowGeo, doorLeafGeo, sparkGeo, PLAT } from './props.js';
import './tram.css';

const params = new URLSearchParams(location.search);
const ICON = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M17 6h14M24 6v5" stroke="#2f2a29" stroke-width="2.5" stroke-linecap="round" fill="none"/><rect x="9" y="11" width="30" height="27" rx="6" fill="#b8302d"/><rect x="9" y="11" width="30" height="12" rx="6" fill="#efe1c6"/><rect x="13" y="14.5" width="9" height="7" rx="2" fill="#ffd89a"/><rect x="26" y="14.5" width="9" height="7" rx="2" fill="#ffd89a"/><circle cx="24" cy="31" r="3" fill="#ffe2a8"/><path d="M12 42l4-4M36 42l-4-4" stroke="#2f2a29" stroke-width="2.5" stroke-linecap="round"/><path d="M11 25.5q6.5 3 13 0t13 0" stroke="#2f6446" stroke-width="2" fill="none"/></svg>';
const PERSON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.2" r="3" fill="currentColor"/><path d="M2.5 15c0-4 2.4-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="currentColor"/></svg>';
const DOLL_STYLES = [
  { coat: 'teal', hat: 'bobble', scarf: 'red', hair: 'bob', hairColor: 'ginger', skin: 'light' },
  { coat: 'mustard', hat: 'earflap', scarf: 'white', hair: 'tousled', hairColor: 'dark', skin: 'brown', outfit: 'duffle' },
];
const TINTS = [[1, 1, 1], [1.08, 0.92, 0.92], [0.92, 1.02, 1.08]];
const G_MIN = -6, G_MAX = 1.2; // gauge window (distance to the stop)

export default {
  id: 'tram',
  title: 'Tram Conductor',
  district: 'market',
  icon: ICON,
  intro: 'Drive the festive tram round Tinselby! Hold anywhere (or BRAKE, Space, S) to brake and let go to roll on. Stop so the door lines up with the glowing platform: gentle, on time, and everyone hops aboard.',
  start(ctx, mg) { return startTram(ctx, mg); },
};

async function startTram(ctx, mg) {
  const { engine, cam, colliders, layout, uiRoot } = ctx;
  const mat = engine.mat;
  const sfx = (n, o) => { try { ctx.audio?.sfx?.(n, o); } catch (e) { /* audio optional */ } };
  const ground = (x, z) => (colliders?.heightAt ? colliders.heightAt(x, z) : 0);
  const disposables = [];
  const keep = (g) => { disposables.push(g); return g; };
  mg.setPlayerControl(false);
  mg.setPlayerVisible(false);

  // ---------------------------------------------------------------- route + sim
  const route = createRoute(layout);
  const { path } = route;
  const sim = createSim(route);
  const S = sim.S;
  const F = { x: 0, z: 0, dx: 0, dz: 1 }, F2 = { x: 0, z: 0, dx: 0, dz: 1 };
  /** Tram centre + facing for path distance s (chord of the two bogies, like life/traffic.js). */
  function frame(s, o) {
    path.at(s + 0.48, F); const ax = F.x, az = F.z;
    path.at(s - 0.48, F2);
    o.x = (ax + F2.x) / 2; o.z = (az + F2.z) / 2;
    let fx = ax - F2.x, fz = az - F2.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    o.fx = fx; o.fz = fz; o.nx = -fz; o.nz = fx; // n = inner (plaza) side = local −x
    o.yaw = Math.atan2(fx, fz);
    return o;
  }

  // ---------------------------------------------------------------- scene
  const root = new THREE.Group();
  root.name = 'tram-game';
  mg.add(root);
  // platforms + stop signs: one merged static mesh for the 4 stops
  const stopFx = {};
  {
    const parts = [];
    for (const st of layout.TRAM_STOPS) {
      const s = route.byId[st.id].s;
      const f = frame(s + DOOR_Z, {});
      const base = ground(f.x, f.z);
      const top = Math.max(0.1, ground(f.x + f.nx * 0.5, f.z + f.nz * 0.5) - base + 0.035);
      const g = merge(platformParts(st.id, top));
      xf(g, [f.x, base, f.z], [0, f.yaw, 0]);
      parts.push(g);
      stopFx[st.id] = { ...f, base, top };
    }
    const plat = new THREE.Mesh(keep(merge(parts)), mat);
    plat.name = 'tram-platforms';
    plat.receiveShadow = true;
    root.add(plat);
  }
  // the tram + inner door overlay
  const tram = new THREE.Group();
  tram.name = 'tram-mg';
  const tramMesh = buildTramMesh(engine);
  keep(tramMesh.geometry);
  tramMesh.name = 'tram-mg-body';
  tram.add(tramMesh);
  const doorGlow = new THREE.Mesh(keep(doorGlowGeo()), mat);
  doorGlow.position.set(-0.249, 0.29, DOOR_Z);
  doorGlow.visible = false;
  tram.add(doorGlow);
  const leafGeo = keep(doorLeafGeo());
  const leaves = [-1, 1].map((sz) => { const m = new THREE.Mesh(leafGeo, mat); m.userData.sz = sz; tram.add(m); return m; });
  root.add(tram);
  // next-stop marker
  const marker = new THREE.Mesh(keep(markerGeo()), mat);
  marker.name = 'tram-marker';
  root.add(marker);
  // passengers: 2 instanced doll styles × 3
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const dollIms = DOLL_STYLES.map((st, k) => {
    const im = new THREE.InstancedMesh(keep(crowdDollGeo(mat, st)), mat, 3);
    im.name = 'tram-dolls' + k;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.receiveShadow = true;
    for (let i = 0; i < 3; i++) { im.setMatrixAt(i, m4.makeScale(0, 0, 0)); im.setColorAt(i, col.setRGB(1, 1, 1)); }
    disposables.push(im);
    root.add(im);
    return im;
  });
  const dolls = [];
  for (let i = 0; i < 6; i++) dolls.push({ im: dollIms[i % 2], slot: i >> 1, state: 'off', x: 0, y: 0, z: 0, yaw: 0, sc: 0, t: 0, ph: Math.random() * 6, stop: -9, k: 0, from: null, to: null, size: 1 });
  // sparkles
  const NSP = 14;
  const sparks = new THREE.InstancedMesh(keep(sparkGeo()), mat, NSP);
  sparks.name = 'tram-sparks';
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  disposables.push(sparks);
  root.add(sparks);
  const sparkP = Array.from({ length: NSP }, () => ({ t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));

  // the town's own tram must not run alongside ours (lead API; read-only fallback until it lands)
  let release = ctx.life?.holdVehicle?.('tram');
  let ambient = null;
  if (typeof release !== 'function') {
    release = null;
    try {
      const v = ctx.life?._debug?.traffic?.tram;
      if (v && v.mesh) { ambient = v; v.mesh.visible = false; }
    } catch (e) { /* life internals changed */ }
  }

  // ---------------------------------------------------------------- DOM
  const ui = el('div', 'tr-root', uiRoot);
  const gauge = el('div', 'tr-gauge knit-card far', ui);
  const gTop = el('div', 'tr-g-top', gauge);
  const gNext = el('span', 'nx', gTop);
  const gAboard = el('span', 'ab', gTop);
  const bar = el('div', 'tr-g-bar', gauge);
  const gx = (d) => `${(((Math.max(G_MIN, Math.min(G_MAX, d)) - G_MIN) / (G_MAX - G_MIN)) * 100).toFixed(2)}%`;
  const zGood = el('i', 'good', bar); zGood.style.left = gx(-ZONE.good); zGood.style.width = `calc(${gx(ZONE.good)} - ${gx(-ZONE.good)})`;
  const zPerf = el('i', 'perfect', bar); zPerf.style.left = gx(-ZONE.perfect); zPerf.style.width = `calc(${gx(ZONE.perfect)} - ${gx(-ZONE.perfect)})`;
  el('i', 'flag', bar).style.left = gx(0);
  const ghost = el('b', 'ghost', bar);
  const tramDot = el('b', 'tram', bar);
  const help = el('div', 'tr-g-help', gauge);
  const coarse = matchMedia('(pointer:coarse)').matches;
  help.textContent = coarse ? 'Hold anywhere to brake · the line shows where you would stop' : 'Hold Space (or click) to brake · the line shows where you would stop';
  const brakeBtn = el('button', 'tr-brake', ui);
  brakeBtn.tabIndex = -1;
  brakeBtn.innerHTML = 'BRAKE<small>hold</small>';
  const banner = el('div', 'tr-banner', ui);
  const pop = (text, cls = '') => { const p = el('div', 'tr-pop ' + cls, ui); p.textContent = text; setTimeout(() => p.remove(), 1300); };
  function showBanner(title, sub = '', ms = 2400) {
    banner.innerHTML = '';
    el('div', 'knit-title', banner).textContent = title;
    if (sub) el('div', 'knit-sub', banner).textContent = sub;
    banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
    clearTimeout(showBanner.t);
    showBanner.t = setTimeout(() => banner.classList.remove('show'), ms);
  }

  // ---------------------------------------------------------------- input: hold anywhere / BRAKE / keys
  const canvas = engine.renderer.domElement;
  const pointers = new Set(), keys = new Set();
  const onDown = (e) => {
    if (e.target !== canvas && e.target !== brakeBtn && !brakeBtn.contains(e.target)) return;
    pointers.add(e.pointerId);
    if (e.target !== canvas) e.preventDefault();
  };
  const onUp = (e) => pointers.delete(e.pointerId);
  const KEYS = [' ', 's', 'arrowdown', 'b'];
  const onKeyDown = (e) => { const k = e.key.toLowerCase(); if (KEYS.includes(k)) { keys.add(k); if (k === ' ' || k === 'arrowdown') e.preventDefault(); } };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  const onBlur = () => { keys.clear(); pointers.clear(); };
  const noMenu = (e) => e.preventDefault();
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  brakeBtn.addEventListener('contextmenu', noMenu);
  const humanBrake = () => pointers.size > 0 || keys.size > 0;

  // ---------------------------------------------------------------- test hook
  const dbg = window.__tram = {
    auto: params.has('mgauto') ? (params.get('trambot') || 'good') : null,
    sim, route, log: [],
    get state() {
      const T = sim.target;
      return { phase: S.phase, idx: S.idx, stop: T ? T.id : null, d: T ? +(S.s - T.s).toFixed(2) : null, v: +S.v.toFixed(2), brake: S.brake, score: S.score, aboard: S.aboard, boarded: S.boarded, perfect: S.perfect, good: S.good, missed: S.missed, t: +S.t.toFixed(1), due: T ? +(S.due - S.t).toFixed(1) : null, results: S.results, finished: mg.finished };
    },
    bot(mode) { this.auto = mode && mode !== 'off' ? mode : null; botFn = this.auto ? makeBot(this.auto, 7) : null; return this.auto; },
    ff(sec, step = 1 / 30) { for (let i = 0; i < sec / step && !mg.finished; i++) tick(step); visuals(step, engine.time); aim(0, true); return this.state; },
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
    get dolls() { return dolls.map((d) => d.state); },
  };
  let botFn = dbg.auto ? makeBot(dbg.auto, 7) : null;

  // ---------------------------------------------------------------- passengers
  const waitSpots = {};
  for (const st of layout.TRAM_STOPS) {
    const f = stopFx[st.id];
    const a = st.wait[0], b = st.wait[1];
    const third = [(a[0] + b[0]) / 2 + f.nx * 0.42, (a[1] + b[1]) / 2 + f.nz * 0.42];
    waitSpots[st.id] = [a, b, third].map(([x, z]) => {
      const p = { x, z };
      try { colliders.resolve?.(p, 0.1, x, z); } catch (e) { /* keep the layout spot */ }
      return [p.x, p.z];
    });
  }
  function freeDoll(prefer) {
    for (const k of [prefer % 2, (prefer + 1) % 2]) for (const d of dolls) if (d.state === 'off' && d.im === dollIms[k]) return d;
    return null;
  }
  const TF = {};
  function spawnWaiting(i, stopId, n) {
    const spots = waitSpots[stopId];
    const f = stopFx[stopId];
    for (let k = 0; k < n; k++) {
      const d = freeDoll(k + i + 1);
      if (!d) break;
      const [x, z] = spots[k % spots.length];
      Object.assign(d, { state: 'pop', t: -k * 0.12, x, z, y: ground(x, z), yaw: Math.atan2(-f.nx, -f.nz) + (k - 1) * 0.25, stop: i, k, size: 1.05 + ((k * 37 + i * 11) % 5) * 0.025, sc: 0 });
      d.im.setColorAt(d.slot, col.setRGB(...TINTS[(((k + i) % 3) + 3) % 3]));
      d.im.instanceColor.needsUpdate = true;
    }
  }
  function doorPos(out, side = 0.3) {
    frame(S.s, TF);
    out.x = TF.x + TF.fx * DOOR_Z + TF.nx * side;
    out.z = TF.z + TF.fz * DOOR_Z + TF.nz * side;
    out.y = ground(TF.x, TF.z) + 0.1;
    return out;
  }
  function hop(d, to, dur, h, state) {
    d.from = { x: d.x, y: d.y, z: d.z };
    d.to = to; d.t = 0; d.dur = dur; d.h = h; d.state = state;
  }
  function emitSparks(x, y, z, n = 12) {
    let k = 0;
    for (const p of sparkP) {
      if (k >= n) break;
      if (p.t < p.life) continue;
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.6;
      Object.assign(p, { t: 0, life: 0.6 + Math.random() * 0.4, x, y, z, vx: Math.cos(a) * r, vz: Math.sin(a) * r, vy: 0.7 + Math.random() * 0.9 });
      k++;
    }
  }

  // ---------------------------------------------------------------- events
  const stopName = (i) => route.stops[i]?.name || '';
  function handle(evs) {
    for (const e of evs) {
      dbg.log.push({ t: +S.t.toFixed(2), ...e });
      if (e.type === 'doorsOpen') { doorTarget = 1; sfx('tram'); }
      else if (e.type === 'doorsClose') doorTarget = 0;
      else if (e.type === 'board') {
        const d = dolls.find((q) => q.stop === e.i && q.k === e.k && (q.state === 'wait' || q.state === 'pop'));
        if (d) { const to = doorPos({}, 0.22); hop(d, to, 0.5, 0.32, 'board'); d.yaw = Math.atan2(to.x - d.x, to.z - d.z); }
        sfx('pop', { vol: 0.7 });
        if (e.pts) pop(`+${e.pts}`, 'pax');
      } else if (e.type === 'alight') {
        const d = freeDoll(e.k);
        if (d) {
          const from = doorPos({}, 0.24);
          frame(S.s, TF);
          const tx = from.x + TF.nx * 0.5 + TF.fx * (e.k * 0.22 - 0.1), tz = from.z + TF.nz * 0.5 + TF.fz * (e.k * 0.22 - 0.1);
          Object.assign(d, { x: from.x, y: from.y, z: from.z, sc: 0.3, stop: -5, k: e.k, size: 1.0 + e.k * 0.05, yaw: Math.atan2(TF.nx, TF.nz) });
          d.im.setColorAt(d.slot, col.setRGB(...TINTS[(e.k + 2) % 3])); d.im.instanceColor.needsUpdate = true;
          hop(d, { x: tx, y: ground(tx, tz), z: tz }, 0.5, 0.28, 'alight');
        }
        sfx('step', { vol: 0.6 });
      } else if (e.type === 'stop') {
        const dp = doorPos({}, 0.3);
        if (e.quality === 'perfect') { pop('Perfect stop! +30', 'gold'); sfx('bell'); emitSparks(dp.x, dp.y + 0.3, dp.z, 14); }
        else pop('Good stop +15', 'ok');
        const extras = [e.smooth ? 'Smooth +5' : 'Bumpy ride', e.onTime ? 'On time +5' : 'A bit late'];
        setTimeout(() => pop(extras.join(' · '), 'small' + (e.smooth && e.onTime ? ' gold' : '')), 650);
      } else if (e.type === 'miss') {
        pop(`Missed ${stopName(e.i)}!`, 'bad');
        sfx('fold', { vol: 0.7 });
        for (const d of dolls) if (d.stop === e.i && (d.state === 'wait' || d.state === 'pop')) { d.state = 'sad'; d.t = 0; }
        const N = route.stops[S.idx];
        if (N) spawnWaiting(S.idx, N.id, N.waiting);
      } else if (e.type === 'short') {
        pop('A little further…', 'small');
      } else if (e.type === 'depart') {
        sfx('tram'); setTimeout(() => sfx('tram', { vol: 0.8 }), 220);
        const T = route.stops[e.i];
        spawnWaiting(e.i, T.id, T.waiting);
        if (e.i === 0) showBanner('Ding ding!', `Next stop: ${T.name}`, 2200);
        else pop('Ding ding!', 'small');
      } else if (e.type === 'end') {
        brakeBtn.classList.add('off');
        gauge.classList.add('off');
        sfx('cheer', { vol: 0.7 });
        rig.orbit = 0;
      }
    }
  }

  // ---------------------------------------------------------------- HUD
  let lastHud = '';
  function hud() {
    const T = sim.target;
    const driving = S.phase === 'drive';
    const key = [S.score, S.idx, S.phase, driving ? Math.ceil(S.due - S.t) : -1, S.aboard, innerWidth < innerHeight].join('|');
    if (key !== lastHud) {
      lastHud = key;
      mg.hud.setScore(S.score);
      // portrait: the framework's centred goal chip only has half the width, keep it to one short line
      if (T) mg.hud.setGoal(innerWidth < innerHeight ? `${T.name} · ${T.waiting} waiting` : `Stop ${S.idx + 1}/${route.stops.length} · ${T.name} · ${T.waiting} waiting`);
      else mg.hud.setGoal('Last stop! Merry Christmas, everyone');
      mg.hud.setTimer(driving ? Math.max(0, S.due - S.t) : null);
      gNext.innerHTML = '';
      el('small', '', gNext).textContent = T ? `Stop ${S.idx + 1}/${route.stops.length}` : 'Done';
      gNext.appendChild(document.createTextNode(T ? T.name : 'All aboard'));
      gAboard.innerHTML = `${PERSON}<span>${S.aboard} aboard</span>`;
    }
    if (T) {
      const d = S.s - T.s;
      const gd = sim.ghostD();
      tramDot.style.left = gx(d);
      ghost.style.left = gx(gd);
      ghost.className = 'ghost' + (Math.abs(gd) <= ZONE.perfect ? ' top' : Math.abs(gd) <= ZONE.good ? ' ok' : gd > ZONE.good ? ' over' : '');
      ghost.style.opacity = driving && S.v > 0.02 ? '1' : '0';
      gauge.classList.toggle('far', d < G_MIN);
    }
    brakeBtn.classList.toggle('down', S.brake && driving);
  }

  // ---------------------------------------------------------------- camera rig (one long, non-skippable shot)
  const rig = { pos: engine.camera.position.clone(), target: (engine.focus || new THREE.Vector3()).clone(), dx: 0, dz: 1, k: 2.0, orbit: 0, side: 0 };
  const wantPos = new THREE.Vector3(), wantTarget = new THREE.Vector3(), RF = {}, AD = {};
  cam.setMode('close');
  const playMain = (blendIn) => cam.playShot({ name: 'tram', duration: 1e5, blendIn, blendOut: 0.4, skippable: false, tilt: 0.45, portrait: false, update: (u, out) => { out.pos.copy(rig.pos); out.target.copy(rig.target); } });
  playMain(engine.capture ? 0.05 : 0.9); // capture (tests) steps only a few frames: blend in at once
  // another cinematic (e.g. a district reveal sweep) replaced our shot: take the camera back
  const keepShot = () => {
    if (mg.finished) return;
    const name = typeof cam.shotName === 'string' ? cam.shotName : (cam.shotActive ? 'tram' : '');
    if (name !== 'tram') playMain(engine.capture ? 0.05 : 0.5);
  };
  function aim(dt, snap = false) {
    frame(S.s, RF);
    const py = ground(RF.x, RF.z);
    // portrait / narrow screens: pull back and up (the track then runs up the tall screen)
    const ak = 1 + (aspectK(1.75, 2.2, 0.9) - 1) * 0.6;
    const stopped = S.phase === 'ready' || S.phase === 'board' || S.phase === 'dwell';
    // side weight: 1 = three-quarter view from the platform side (stops), 0 = chase view
    const sideGoal = stopped ? 1 : 0;
    rig.side += (sideGoal - rig.side) * (snap ? 1 : 1 - Math.exp(-dt * (stopped ? 1.6 : 1.1)));
    if (S.phase === 'celebrate' || S.phase === 'done') {
      rig.orbit += dt;
      const a = Math.atan2(RF.nx, RF.nz) - 0.9 + rig.orbit * 0.22;
      wantPos.set(RF.x + Math.sin(a) * 2.4 * ak, py + 1.25 * ak, RF.z + Math.cos(a) * 2.4 * ak);
      wantTarget.set(RF.x, py + 0.35, RF.z);
    } else {
      // look-ahead direction: ≥ 2 s of travel (round corners early)
      const ahead = 1.0 + Math.max(1.2, S.v * 2.2);
      let ax = 0, az = 0;
      for (let k = 0; k <= 6; k++) { path.at(S.s - 0.3 + ((ahead + 0.3) * k) / 6, AD); const w = 1 - k / 10; ax += AD.dx * w; az += AD.dz * w; }
      const l = Math.hypot(ax, az) || 1;
      const kd = snap ? 1 : 1 - Math.exp(-dt * 2.2);
      rig.dx += (ax / l - rig.dx) * kd; rig.dz += (az / l - rig.dz) * kd;
      const ll = Math.hypot(rig.dx, rig.dz) || 1, dx = rig.dx / ll, dz = rig.dz / ll;
      const w = rig.side;
      // chase: behind, a little to the plaza side; stop: three-quarter view over the platform
      // (portrait: the stop view rises rather than swinging far into the plaza, where garlands and baubles hang)
      // Portrait at speed: the narrow frame is only ~2 units wide at the tram, so the plaza-edge firs (0.95 inside the
      // rails, 0.9 wide) filled a third of it from the plaza side. There the chase sits on the outer side of the rails,
      // a little higher, and looks slightly outward: the firs slide along the right edge instead (pk: 0 landscape … 1
      // phone portrait; po fades the offset out as the tram slows for a stop, where the plaza-side view takes over).
      const pk = Math.min(1, Math.max(0, (ak - 1) / 0.72));
      const sv = Math.min(1, Math.max(0, (S.v - 0.3) / 1.0)), po = pk * sv * sv * (3 - 2 * sv);
      const back = ((2.3 - 0.2 * pk) * (1 - w) + 1.3 * w) * ak, up = ((2.0 + 0.4 * pk) * (1 - w) + 1.6 * w) * ak;
      const side = (0.4 - 0.85 * po) * ak * (1 - w) + 1.9 * Math.sqrt(ak) * w;
      wantPos.set(RF.x - dx * back + RF.nx * side, py + up, RF.z - dz * back + RF.nz * side);
      // look at the tram itself (it stays in the sharp tilt-shift band, mid-screen above the gauge); portrait looks a
      // little further ahead so the track runs up the tall screen
      const look = (0.7 + (ak - 1) * 1.1) * (1 - w) + 0.45 * w, out = 0.18 * po * (1 - w);
      wantTarget.set(RF.x + dx * look + RF.nx * (0.3 * w - out), py + 0.25, RF.z + dz * look + RF.nz * (0.3 * w - out));
    }
    wantPos.y = Math.max(wantPos.y, ground(wantPos.x, wantPos.z) + 0.6);
    if (snap) { rig.pos.copy(wantPos); rig.target.copy(wantTarget); return; }
    rig.pos.lerp(wantPos, 1 - Math.exp(-dt * rig.k));
    rig.target.lerp(wantTarget, 1 - Math.exp(-dt * (rig.k + 1.5)));
  }

  // ---------------------------------------------------------------- tick (gameplay) + visuals (render)
  let doorTarget = 0, doorK = 0, pitch = 0;
  function tick(dt) {
    if (mg.finished) return;
    if (ambient) ambient.mesh.visible = false;
    if (S.phase === 'done') { finish(); return; }
    const brake = botFn ? botFn(sim, dt) : humanBrake();
    handle(sim.step(dt, brake));
    // passengers
    for (const d of dolls) {
      if (d.state === 'off') continue;
      d.t += dt;
      if (d.state === 'pop') { if (d.t >= 0) { d.sc = Math.min(1, d.t / 0.35); if (d.t >= 0.35) d.state = 'wait'; } }
      else if (d.state === 'board' || d.state === 'alight' || d.state === 'leave') {
        const u = Math.min(1, d.t / d.dur);
        d.x = d.from.x + (d.to.x - d.from.x) * u; d.z = d.from.z + (d.to.z - d.from.z) * u;
        d.y = d.from.y + (d.to.y - d.from.y) * u + 4 * d.h * u * (1 - u);
        if (d.state === 'board') d.sc = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
        else if (d.state === 'alight') d.sc = Math.min(1, 0.3 + u * 1.4);
        else d.sc = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.5);
        if (u >= 1) {
          if (d.state === 'alight') { const fx = d.x + Math.sin(d.yaw) * 0.7, fz = d.z + Math.cos(d.yaw) * 0.7; hop(d, { x: fx, y: ground(fx, fz), z: fz }, 1.3, 0.03, 'leave'); }
          else { d.state = 'off'; d.sc = 0; d.stop = -9; }
        }
      } else if (d.state === 'sad') { d.sc = d.t < 2.2 ? 1 : Math.max(0, 1 - (d.t - 2.2) / 0.4); if (d.t > 2.6) { d.state = 'off'; d.stop = -9; } }
    }
    for (const p of sparkP) {
      if (p.t >= p.life) continue;
      p.t += dt; p.vy -= 1.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    hud();
  }
  const TV = {};
  function visuals(dt, t) {
    frame(S.s, TV);
    tram.position.set(TV.x, ground(TV.x, TV.z) + 0.004, TV.z);
    pitch += (Math.max(-1.6, Math.min(1, -(S.a || 0))) * 0.018 - pitch) * (1 - Math.exp(-dt * 6));
    tram.rotation.set(pitch, TV.yaw, 0, 'YXZ');
    doorK += (doorTarget - doorK) * (1 - Math.exp(-dt * 9));
    doorGlow.visible = doorK > 0.05;
    for (const m of leaves) m.position.set(-0.256, 0.29, DOOR_Z + m.userData.sz * (0.029 + doorK * 0.05));
    // next-stop marker over the platform door outline
    const T = sim.target;
    if (T && (S.phase === 'drive' || S.phase === 'board' || S.phase === 'ready')) {
      const f = stopFx[T.id];
      const near = Math.abs(S.s - T.s) < 0.6 ? 1 : 0;
      marker.visible = true;
      marker.position.set(f.x + f.nx * (PLAT.x0 + 0.1), f.base + f.top + 0.62 + Math.sin(t * 3.2) * 0.06, f.z + f.nz * (PLAT.x0 + 0.1));
      marker.rotation.y = t * 1.6;
      marker.scale.setScalar(1 + near * 0.25 * (0.5 + 0.5 * Math.sin(t * 10)));
    } else marker.visible = false;
    // passengers
    for (const d of dolls) {
      if (d.state === 'off' || d.sc <= 0.001) { d.im.setMatrixAt(d.slot, m4.makeScale(0, 0, 0)); continue; }
      let y = d.y, roll = 0, yaw = d.yaw, sy = 1;
      if (d.state === 'wait' || d.state === 'pop') {
        const close = T && d.stop === S.idx && S.phase === 'drive' && T.s - S.s < 4;
        y += close ? Math.abs(Math.sin(t * 8 + d.ph)) * 0.05 : Math.abs(Math.sin(t * 2 + d.ph)) * 0.01;
        if (close) { frame(S.s, RF); yaw = Math.atan2(RF.x - d.x, RF.z - d.z); }
      } else if (d.state === 'sad') { roll = Math.sin(t * 7 + d.ph) * 0.28; sy = 0.92; }
      else if (d.state === 'leave') y += Math.abs(Math.sin(d.t * 10)) * 0.02;
      const s = d.sc * d.size;
      e3.set(0, yaw, roll, 'YXZ');
      d.im.setMatrixAt(d.slot, m4.compose(v3.set(d.x, y, d.z), q4.setFromEuler(e3), s3.set(s, s * sy, s)));
    }
    for (const im of dollIms) im.instanceMatrix.needsUpdate = true;
    sparkP.forEach((p, i) => {
      if (p.t >= p.life) { sparks.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
      const s = 1 - p.t / p.life;
      e3.set(p.t * 7, p.t * 9, 0);
      sparks.setMatrixAt(i, m4.compose(v3.set(p.x, p.y, p.z), q4.setFromEuler(e3), s3.setScalar(Math.max(0.001, s))));
    });
    sparks.instanceMatrix.needsUpdate = true;
  }

  function finish() {
    const r = sim.result();
    const n = route.stops.length, total = WAITING.reduce((a, b) => a + b, 0);
    const lines = [`Perfect ${r.perfect} · Good ${r.good} · Missed ${r.missed}`, `Passengers ${r.boarded}/${total} · On time ${r.onTime}/${n} · Smooth ${r.smooth}/${n}`];
    if (r.stars < 3) lines.push(r.stars < 2 ? `For ★★: ${STARS[1]}+ points, stop at every platform.` : `For ★★★: ${STARS[2]}+ of ${MAX_SCORE}, try for 4 perfect stops.`);
    else lines.push('Tinselby has never had such a cosy ride!');
    dbg.result = r;
    for (const p of ui.querySelectorAll('.tr-pop')) p.remove(); // keep the results card clean
    mg.finish({ score: r.score, stars: r.stars, text: lines.join(' — ') });
  }

  const unreg = engine.addUpdate((dt, t) => {
    const d = Math.min(0.05, dt);
    tick(d);
    visuals(d, t);
    aim(d);
    keepShot();
  }, 50);

  // ---------------------------------------------------------------- cleanup
  mg.onDispose(() => {
    unreg();
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    clearTimeout(showBanner.t);
    ui.remove();
    for (const d of disposables) { try { d.dispose(); } catch (e) { /* already gone */ } }
    try { release?.(); } catch (e) { /* ignore */ }
    if (ambient) { try { ambient.mesh.visible = !!ambient.shown; } catch (e) { /* ignore */ } }
    ctx.input.clearTap();
    const hold = { pos: rig.pos.clone(), target: rig.target.clone() };
    cam.playShot({ name: 'tram-out', duration: 0.7, blendIn: 0.001, blendOut: 0.7, skippable: false, portrait: false, update: (u, out) => { out.pos.copy(hold.pos); out.target.copy(hold.target); } });
    if (window.__tram === dbg) delete window.__tram;
  });

  // ---------------------------------------------------------------- go: stand at Park Gate, first passengers waiting
  spawnWaiting(-1, 'park', 2);
  for (const d of dolls) if (d.state === 'pop') { d.state = 'wait'; d.sc = 1; }
  doorTarget = 1;
  visuals(0.016, engine.time);
  aim(0, true);
  hud();
  await mg.intro();
  if (mg.finished) return;
  sim.start();
  sfx('tram');
}

function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; }
