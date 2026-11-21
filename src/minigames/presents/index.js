// Present Delivery (door 21): the tram drives itself 1.5 laps of TRAM_LOOP (Park Gate → Sledge Hill on lap 2) and you
// ride the rear platform with a sack of presents. Neighbours wave on doorstep rings beside the track: toss a present
// left or right as you pass (left / right half of the screen, a swipe, the two THROW buttons, ← → / A D).
// A present keeps 90 % of the tram's speed and lands 0.5 s later, about abeam the tram: timing decides the catch.
// Landing ≤ 0.18 from the catcher = Perfect 20, ≤ 0.4 = Good 10, else it plops into the snow (puff, the streak resets).
// The ring glows gold while a throw right now would be Perfect. Streak bonus +5 from the 5th catch in a row; each
// delivery lights that doorstep's lantern (they stay lit, so lap 2 runs past a glowing town). Max 455.
// Stars (sim.js): 1★ route finished, 2★ ≥ 190 (spec value), 3★ ≥ 330 (spec 300 +10 %: the streak bonus adds up to 75).
// Bots (Node, /tmp/presents/bots.mjs, 20 seeds): perfect 455 (3★) · good 310–445 (17×3★, 3×2★) · sloppy 120–245
// (9×2★, 11×1★) · none 0 (1★). Ride ≈ 70 s + 2.6 s at the last stop.
// Cost while running (__presents.budget(), shadow casters ×2; measured in Chrome): 4 calls / 17.6k at rest, 8–9 calls /
// 26–36k riding (≤ 10 calls possible; Node peak estimate ≈ 37k with 4 catchers visible). 0 left after dispose.
// Test hook window.__presents = { state, bot(mode), ff(sec, step), budget(), throw(side), sim, route, log };
// ?mgauto plays the 'good' bot (&presentsbot=perfect|good|sloppy|none to pick).
import * as THREE from 'three';
import { buildTramMesh } from '../../life/tram.js';
import { crowdDollGeo } from '../sled/props.js';
import { merge } from '../../core/prims.js';
import { createRoute, createSim, makeBot, CFG, STARS, MAX_SCORE, N_CATCH } from './sim.js';
import { createRig, presentsPk } from './rig.js';
import { deckParts, presentGeo, PRESENT_TINTS, ringGeo, lampGeo, fxGeo, riderDollGeo, RIDER } from './props.js';
import './presents.css';

const params = new URLSearchParams(location.search);
const ICON = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><rect x="8" y="20" width="32" height="22" rx="3" fill="#b8302d"/><rect x="6" y="14" width="36" height="9" rx="2.5" fill="#d64a3e"/><rect x="21" y="14" width="6" height="28" fill="#e3aa3a"/><path d="M24 14c-3-6-11-7-10-2 1 3 7 3 10 2zM24 14c3-6 11-7 10-2-1 3-7 3-10 2z" fill="#e3aa3a" stroke="#a87418" stroke-width="1.2"/><circle cx="24" cy="14" r="2.4" fill="#f0c35a"/></svg>';
const ARROW = (dir) => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="${dir < 0 ? 'M25 8L11 20l14 12' : 'M15 8l14 12-14 12'}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5h6l-1.5 2.2C15 8.5 17 11.5 17 14c0 3-3 4.5-7 4.5S3 17 3 14c0-2.5 2-5.5 5.5-6.8z" fill="#a5493a"/><path d="M7.5 6.6h5" stroke="#e3aa3a" stroke-width="1.6" stroke-linecap="round"/></svg>';
const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true" width="16" height="16"><path d="M10 1.8l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L10 14.6l-5.1 2.8 1.1-5.7L1.8 7.8l5.7-.7z" fill="currentColor"/></svg>';
const ADULT = { coat: 'teal', hat: 'bobble', scarf: 'red', hair: 'bob', hairColor: 'ginger', skin: 'light' };
const KID = { coat: 'mustard', hat: 'earflap', scarf: 'white', hair: 'tousled', hairColor: 'dark', skin: 'brown' };
const TINTS = [[1, 1, 1], [1.08, 0.92, 0.92], [0.92, 1.02, 1.08], [1.04, 1.0, 0.86]];
const MAXV = 8; // visible catchers (spec ≤ 8)
const HAND_Y = 0.47; // raised mittens of crowdDollGeo (× doll size)

export default {
  id: 'presents',
  title: 'Present Delivery',
  district: 'market',
  icon: ICON,
  intro: 'Ride the tram and toss a present to everyone waving! Tap the left or right side of the screen (or the THROW buttons, or the arrow keys) as you roll past. Throw when their ring glows gold for a perfect catch.',
  introTouch: 'Ride the tram and toss a present to everyone waving! Tap the left or right side of the screen (or the THROW buttons) as you roll past. Throw when their ring glows gold for a perfect catch.',
  start(ctx, mg) { return startPresents(ctx, mg); },
};

async function startPresents(ctx, mg) {
  const { engine, cam, colliders, layout, uiRoot, game } = ctx;
  const mat = engine.mat;
  const sfx = (n, o) => { try { ctx.audio?.sfx?.(n, o); } catch (e) { /* audio optional */ } };
  const ground = (x, z) => { const y = colliders?.heightAt ? colliders.heightAt(x, z) : 0; return Number.isFinite(y) ? y : 0; };
  const disposables = [];
  const keep = (g) => { disposables.push(g); return g; };
  mg.setPlayerControl(false);
  mg.setPlayerVisible(false);

  // ---------------------------------------------------------------- route + sim (spots re-checked against colliders)
  const nudge = (x, z, r = 0.12) => { const p = { x, z }; try { colliders?.resolve?.(p, r, x, z); } catch (e) { /* keep the layout spot */ } return [p.x, p.z]; };
  const route = createRoute(layout, nudge);
  const sim = createSim(route, layout.PRESENTS);
  const S = sim.S;
  const rig = createRig(route.path);
  const { frame } = rig;

  // ---------------------------------------------------------------- scene
  const root = new THREE.Group();
  root.name = 'presents-game';
  mg.add(root);
  const tram = new THREE.Group();
  tram.name = 'presents-tram';
  const tramMesh = new THREE.Mesh(keep(merge([buildTramMesh(engine).geometry, ...deckParts()])), mat);
  tramMesh.name = 'presents-tram-body';
  tramMesh.castShadow = tramMesh.receiveShadow = true;
  tram.add(tramMesh);
  const rider = new THREE.Group();
  rider.position.set(RIDER.x, RIDER.y, RIDER.z);
  const riderMesh = new THREE.Mesh(keep(riderDollGeo(mat, game?.state?.style)), mat);
  riderMesh.name = 'presents-rider';
  riderMesh.castShadow = true;
  rider.add(riderMesh);
  tram.add(rider);
  root.add(tram);

  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  function inst(geo, n, name) {
    const im = new THREE.InstancedMesh(keep(geo), mat, n);
    im.name = name;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.receiveShadow = true;
    for (let i = 0; i < n; i++) { im.setMatrixAt(i, m4.makeScale(0, 0, 0)); im.setColorAt(i, col.setRGB(1, 1, 1)); }
    im.count = 0;
    disposables.push(im);
    root.add(im);
    return im;
  }
  const dollIms = [inst(crowdDollGeo(mat, ADULT), MAXV, 'presents-dolls-a'), inst(crowdDollGeo(mat, KID), MAXV, 'presents-dolls-k')];
  const rings = inst(ringGeo(CFG.perfect, CFG.good), MAXV, 'presents-rings');
  const lamps = inst(lampGeo(), route.spots.length, 'presents-lamps');
  const NPV = 12;
  const presentsIm = inst(presentGeo(), NPV, 'presents-boxes');
  const NFX = 40;
  const fxIm = inst(fxGeo(), NFX, 'presents-fx');

  // catcher / lamp / present / fx visual state
  const F = {};
  const cv = route.catchers.map((c, i) => {
    const kid = (i * 5) % 3 === 0;
    return { i, kid, size: kid ? 0.78 + (i % 2) * 0.04 : 0.98 + (i % 3) * 0.035, tint: TINTS[(i * 3) % TINTS.length], state: 'hidden', t: 0, sc: 0, yaw: 0, y: ground(c.x, c.z), ph: i * 1.7, ring: 0, ringCol: [1, 1, 1], ringS: 1, fade: 1, shrugT: -1, hop: 0 };
  });
  for (const c of cv) { const rc = route.catchers[c.i]; route.path.at(rc.s, F); c.yaw = Math.atan2(F.x - rc.x, F.z - rc.z); }
  const lv = route.spots.map((sp) => {
    const [x, z] = sp.lamp;
    const c = route.catchers.find((q) => route.spots[q.spot] === sp);
    route.path.at(c.s, F);
    return { x, z, y: ground(x, z), yaw: Math.atan2(F.x - x, F.z - z), shown: false, t: 0, lit: false, litT: 0, k: 0 };
  });
  const pv = []; // presents: { id, mode: fly | held | snow, t, T, from, to, catcher, tint, spin, life }
  const fx = Array.from({ length: NFX }, () => ({ t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, c: [1, 1, 1], g: 1 }));

  // the town's own tram must not run alongside ours (it is only hidden, and parked, while held)
  let release = ctx.life?.holdVehicle?.('tram');
  let ambient = null;
  if (typeof release !== 'function') {
    release = null;
    try { const v = ctx.life?._debug?.traffic?.tram; if (v && v.mesh) { ambient = v; v.mesh.visible = false; } } catch (e) { /* life internals changed */ }
  }

  // ---------------------------------------------------------------- DOM
  const ui = el('div', 'pd-root', uiRoot);
  const btn = {
    L: el('button', 'pd-btn l', ui),
    R: el('button', 'pd-btn r', ui),
  };
  btn.L.innerHTML = `${ARROW(-1)}<span>Throw</span>`;
  btn.R.innerHTML = `${ARROW(1)}<span>Throw</span>`;
  btn.L.setAttribute('aria-label', 'Throw left'); btn.R.setAttribute('aria-label', 'Throw right');
  btn.L.tabIndex = btn.R.tabIndex = -1;
  const chip = el('div', 'pd-chip knit-card', ui);
  const chipSack = el('span', 'sack', chip);
  const chipStreak = el('span', 'streak', chip);
  const help = el('div', 'pd-help', ui);
  help.textContent = matchMedia('(pointer:coarse)').matches ? 'Tap left or right as you pass' : 'Click a side or press the arrow keys as you pass';
  const banner = el('div', 'pd-banner', ui);
  const pop = (text, cls = '') => { if (mg.finished || S.phase === 'done') return; for (const p of ui.querySelectorAll('.pd-pop.' + (cls.split(' ')[0] || 'x'))) p.remove(); const p = el('div', 'pd-pop ' + cls, ui); p.textContent = text; setTimeout(() => p.remove(), 1200); };
  function showBanner(title, sub = '', ms = 2600) {
    banner.innerHTML = '';
    el('div', 'knit-title', banner).textContent = title;
    if (sub) el('div', 'knit-sub', banner).textContent = sub;
    banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
    clearTimeout(showBanner.t);
    showBanner.t = setTimeout(() => banner.classList.remove('show'), ms);
  }

  // ---------------------------------------------------------------- input: buttons, tap a half / swipe, keys
  const canvas = engine.renderer.domElement;
  let pending = null, pendT = 0, lastEmpty = -9;
  function doThrow(side, lag = 0, human = true) {
    if (mg.finished) return;
    if (human && botFn) { botFn = null; dbg.auto = null; } // the player took over
    const ev = sim.throw(side, lag);
    if (!ev && human) {
      const b = btn[side];
      b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
    }
    if (human) help.classList.add('off');
  }
  function resolvePending(side) {
    if (!pending) return;
    const lag = (performance.now() - pending.t0) / 1000;
    clearTimeout(pendT);
    pending = null;
    doThrow(side, lag);
  }
  const onDown = (e) => {
    if (mg.finished) return;
    if (e.target === btn.L || btn.L.contains(e.target) || e.target === btn.R || btn.R.contains(e.target)) {
      e.preventDefault();
      const side = btn.L.contains(e.target) ? 'L' : 'R';
      btn[side].classList.add('down');
      setTimeout(() => btn[side].classList.remove('down'), 140);
      doThrow(side, 0);
      return;
    }
    if (e.target !== canvas) return;
    if (pending) resolvePending(pending.side);
    // a tap throws to its half of the screen; a quick sideways swipe (within 110 ms) throws that way instead.
    // Either way the throw counts from the touch-down moment (the sim back-dates it), so the swipe costs no timing.
    pending = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), side: e.clientX < innerWidth / 2 ? 'L' : 'R' };
    pendT = setTimeout(() => resolvePending(pending?.side), 110);
  };
  const onMove = (e) => {
    if (!pending || e.pointerId !== pending.id) return;
    const dx = e.clientX - pending.x0, dy = e.clientY - pending.y0;
    if (Math.abs(dx) >= 26 && Math.abs(dx) > Math.abs(dy) * 1.2) resolvePending(dx < 0 ? 'L' : 'R');
  };
  const onUp = (e) => { if (pending && e.pointerId === pending.id) resolvePending(pending.side); };
  const KEYS = { arrowleft: 'L', a: 'L', arrowright: 'R', d: 'R' };
  const onKey = (e) => {
    const side = KEYS[e.key.toLowerCase()];
    if (!side || e.repeat) return;
    e.preventDefault();
    btn[side].classList.add('down');
    setTimeout(() => btn[side].classList.remove('down'), 140);
    doThrow(side, 0);
  };
  const noMenu = (e) => e.preventDefault();
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  window.addEventListener('keydown', onKey);
  btn.L.addEventListener('contextmenu', noMenu); btn.R.addEventListener('contextmenu', noMenu);

  // ---------------------------------------------------------------- test hook
  const dbg = window.__presents = {
    auto: params.has('mgauto') ? (params.get('presentsbot') || 'good') : null,
    sim, route, log: [],
    get state() {
      return {
        phase: S.phase, t: +S.t.toFixed(1), s: +(S.s - route.s0).toFixed(2), v: +S.v.toFixed(2), score: S.score, delivered: S.delivered,
        perfect: S.perfect, good: S.good, snow: S.snow, missed: S.missed, streak: S.streak, bestStreak: S.bestStreak, sack: S.sack,
        flying: sim.flying.length, visible: cv.filter((c) => c.sc > 0.001).length, lit: lv.filter((l) => l.lit).length, finished: mg.finished,
      };
    },
    bot(mode) { this.auto = mode && mode !== 'off' ? mode : null; botFn = this.auto ? makeBot(this.auto, 7) : null; return this.auto; },
    ff(sec, step = 1 / 30) { for (let i = 0; i < sec / step && !mg.finished; i++) { tick(step); anim(step); } render(step, engine.time); aim(0, true); return this.state; },
    throw(side) { doThrow(side, 0, false); return this.state; },
    budget() {
      let calls = 0, tris = 0;
      root.traverseVisible((o) => {
        if (!o.isMesh) return;
        const n = o.isInstancedMesh ? o.count : 1;
        if (!n) return;
        const passes = o.castShadow ? 2 : 1;
        calls += passes;
        const g = o.geometry;
        tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * n * passes;
      });
      return { calls, tris: Math.round(tris) };
    },
  };
  let botFn = dbg.auto ? makeBot(dbg.auto, 7) : null;

  // ---------------------------------------------------------------- events → visuals
  const TF = {};
  function handPos(c, out) {
    const rc = route.catchers[c.i];
    out.x = rc.x; out.z = rc.z; out.y = c.y + c.hop + HAND_Y * c.size * c.sc;
    return out;
  }
  function burst(x, y, z, kind, n) {
    let k = 0;
    for (const p of fx) {
      if (k >= n) break;
      if (p.t < p.life) continue;
      const a = Math.random() * Math.PI * 2;
      if (kind === 'puff') {
        const r = 0.35 + Math.random() * 0.45;
        Object.assign(p, { t: 0, life: 0.55 + Math.random() * 0.3, x, y: y + 0.02, z, vx: Math.cos(a) * r, vz: Math.sin(a) * r, vy: 0.35 + Math.random() * 0.5, s: 1.1 + Math.random() * 0.9, g: 1.4, c: [1, 1, 1] });
      } else {
        const r = 0.3 + Math.random() * 0.6;
        const cc = [[1.25, 0.95, 0.35], [1.1, 0.3, 0.25], [0.4, 0.9, 0.45], [1.2, 1.1, 0.9]][k % 4];
        Object.assign(p, { t: 0, life: 0.7 + Math.random() * 0.4, x, y, z, vx: Math.cos(a) * r, vz: Math.sin(a) * r, vy: 0.8 + Math.random() * 0.9, s: 0.55 + Math.random() * 0.35, g: 1.8, c: cc });
      }
      k++;
    }
  }
  function lightLamp(spot) {
    const l = lv[spot];
    if (!l || l.lit) return;
    l.lit = true; l.litT = 0;
    setTimeout(() => sfx('bell', { vol: 0.45 }), 120);
  }
  let lastStreakPop = 0;
  function handle(evs) {
    for (const e of evs) {
      dbg.log.push({ t: +S.t.toFixed(2), ...e });
      if (dbg.log.length > 300) dbg.log.splice(0, 100);
      if (e.type === 'spawn') {
        const c = cv[e.i];
        Object.assign(c, { state: 'pop', t: 0, sc: 0, fade: 1, hop: 0 });
        const l = lv[route.catchers[e.i].spot];
        if (!l.shown) { l.shown = true; l.t = 0; }
      } else if (e.type === 'throw') {
        frame(S.s, TF);
        riderAnim = { side: e.side, t: 0 };
        sfx('whoosh', { vol: 0.45 });
        const from = { x: e.fx, y: ground(TF.x, TF.z) + RIDER.y + 0.3, z: e.fz };
        const caught = e.quality !== 'snow' && e.target >= 0;
        const to = caught ? null : { x: e.tx, y: ground(e.tx, e.tz) + 0.04, z: e.tz };
        if (pv.length >= NPV) { const k = pv.findIndex((p) => p.mode !== 'fly'); pv.splice(k >= 0 ? k : 0, 1); }
        pv.push({ id: e.id, mode: 'fly', t: e.lag, T: e.flight, from, to, catcher: caught ? e.target : -1, tint: PRESENT_TINTS[e.id % PRESENT_TINTS.length], spin: (e.side === 'R' ? 1 : -1), life: 0, arc: 0.26 + Math.hypot(e.tx - e.fx, e.tz - e.fz) * 0.07 });
      } else if (e.type === 'land') {
        const p = pv.find((q) => q.id === e.id);
        if (e.quality !== 'snow') {
          const c = cv[e.target];
          Object.assign(c, { state: 'catch', t: 0 });
          if (p) { p.mode = 'held'; p.life = 0; }
          lightLamp(route.catchers[e.target].spot);
          const hp = handPos(c, {});
          if (e.quality === 'perfect') { pop(`Perfect! +${e.pts + e.bonus}`, 'gold'); sfx('pop'); sfx('gift', { vol: 0.7 }); burst(hp.x, hp.y, hp.z, 'spark', 14); }
          else { pop(`Good +${e.pts + e.bonus}`, 'ok'); sfx('pop', { vol: 0.8 }); burst(hp.x, hp.y, hp.z, 'spark', 6); }
          if (e.streak >= CFG.streakFrom && (e.streak === CFG.streakFrom || e.streak % 5 === 0) && e.streak !== lastStreakPop) {
            lastStreakPop = e.streak;
            setTimeout(() => pop(e.streak === CFG.streakFrom ? `Streak ${e.streak}! +${CFG.streakBonus} a catch` : `Streak ${e.streak}!`, 'streak'), 380);
          }
        } else {
          if (p) { p.mode = 'snow'; p.life = 0; }
          burst(e.x, ground(e.x, e.z), e.z, 'puff', 9);
          sfx('drop', { vol: 0.7 });
          if (e.target >= 0 && cv[e.target].state === 'wait') { cv[e.target].shrugT = 0; }
          pop(e.broke >= 3 ? 'Plop! Streak lost' : 'Plop! In the snow', 'bad');
        }
      } else if (e.type === 'miss') {
        const c = cv[e.i];
        Object.assign(c, { state: 'sad', t: 0 });
        pop(e.broke >= 3 ? 'Missed one! Streak lost' : 'Missed one!', 'bad');
        sfx('fold', { vol: 0.5 });
      } else if (e.type === 'empty') {
        if (S.t - lastEmpty > 1.5) { lastEmpty = S.t; pop('The sack is empty!', 'bad'); }
      } else if (e.type === 'end') {
        btn.L.classList.add('off'); btn.R.classList.add('off'); chip.classList.add('off'); help.classList.add('off');
        sfx('tram'); setTimeout(() => sfx('cheer', { vol: 0.7 }), 300);
        showBanner('Last stop: Sledge Hill!', S.delivered >= N_CATCH ? 'Every present delivered. Merry Christmas!' : 'Merry Christmas, everyone!', 2600);
        rig.R.orbit = 0;
      } else if (e.type === 'done') {
        finish();
      }
    }
  }

  // ---------------------------------------------------------------- HUD
  let lastHud = '';
  function hud() {
    const port = innerWidth < innerHeight;
    const key = [S.score, S.delivered, S.sack, S.streak, port].join('|');
    if (key === lastHud) return;
    lastHud = key;
    mg.hud.setScore(S.score);
    mg.hud.setGoal(port ? `Presents ${S.delivered}/${N_CATCH}` : `Presents delivered ${S.delivered}/${N_CATCH}`);
    chipSack.innerHTML = `${SACK}<span>${S.sack}</span><small>left</small>`;
    chipStreak.innerHTML = `${STAR}<span>${S.streak}</span><small>streak</small>`;
    chipStreak.classList.toggle('on', S.streak > 0);
    chipStreak.classList.toggle('hot', S.streak >= CFG.streakFrom);
  }

  // ---------------------------------------------------------------- camera (one long, non-skippable shot)
  let pkS = presentsPk(innerWidth / Math.max(1, innerHeight));
  const lens = { w: 1, fov: 38 };
  cam.setMode('close');
  const playMain = (blendIn) => cam.playShot({ name: 'presents', duration: 1e5, blendIn, blendOut: 0.4, skippable: false, tilt: 0.42, portrait: false, lens, update: (u, out) => { out.pos.set(rig.R.pos.x, rig.R.pos.y, rig.R.pos.z); out.target.set(rig.R.target.x, rig.R.target.y, rig.R.target.z); } });
  playMain(engine.capture ? 0.05 : 0.9);
  const keepShot = () => {
    if (mg.finished) return;
    const name = typeof cam.shotName === 'string' ? cam.shotName : (cam.shotActive ? 'presents' : '');
    if (name !== 'presents') playMain(engine.capture ? 0.05 : 0.5);
  };
  function aim(dt, snap = false) {
    const pk = presentsPk(innerWidth / Math.max(1, innerHeight));
    pkS += (pk - pkS) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    rig.update(S, pkS, dt, ground, snap);
    lens.fov = rig.R.fov;
  }

  // ---------------------------------------------------------------- tick (gameplay) / anim (visual state) / render
  let riderAnim = null;
  function tick(dt) {
    if (mg.finished) return;
    if (ambient) ambient.mesh.visible = false;
    if (botFn) botFn(sim);
    handle(sim.step(dt));
    if (S.t > 9) help.classList.add('off');
    hud();
  }
  const ease = (u) => { const c = 1.7; u = Math.min(1, u) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
  function anim(dt) {
    const ls = sim.landS(0);
    for (const c of cv) {
      if (c.state === 'hidden' || c.state === 'gone') continue;
      const rc = route.catchers[c.i];
      c.t += dt;
      c.hop = 0;
      if (c.state === 'pop') { c.sc = ease(c.t / 0.4); if (c.t >= 0.4) { c.state = 'wait'; c.sc = 1; } }
      else if (c.state === 'catch') { const u = Math.min(1, c.t / 0.55); c.hop = Math.sin(Math.PI * u) * 0.17; if (c.t > 2.4) c.state = 'happy'; }
      if (c.shrugT >= 0) { c.shrugT += dt; if (c.shrugT > 0.8) c.shrugT = -1; }
      // ring: idle → warming as the landing point approaches → gold while a throw now is Perfect
      const waiting = c.state === 'wait' || c.state === 'pop';
      const d = rc.s - ls;
      let rk = 0, rcol = [0.78, 0.72, 0.66], rs = 1;
      const claimed = sim.C[c.i].claimed;
      if (waiting && !claimed) {
        rk = 1;
        const warm = Math.max(0, Math.min(1, 1 - (d - CFG.perfect) / 1.6));
        rcol = [0.78 + 0.3 * warm, 0.72 + 0.14 * warm, 0.66 - 0.2 * warm];
        if (Math.abs(d) <= CFG.perfect) { rcol = [1.45, 1.08, 0.32]; rs = 1.12 + 0.06 * Math.sin(engine.time * 22); }
        else if (Math.abs(d) <= CFG.good) rcol = [0.95, 1.05, 0.55];
      } else if (waiting && claimed) { rk = 1; rcol = [1.3, 1.0, 0.4]; }
      else if (c.state === 'catch') { rk = Math.max(0, 1 - c.t / 0.9); rcol = [1.4, 1.1, 0.45]; rs = 1 + c.t * 0.9; }
      else if (c.state === 'sad') { rk = Math.max(0, 1 - c.t / 1.2); rcol = [0.45, 0.45, 0.5]; }
      c.ring = rk; c.ringCol = rcol; c.ringS = rs;
      // leave once the tram is well past
      const behind = S.s - rc.s;
      if ((c.state === 'happy' || c.state === 'sad' || (c.state === 'catch' && c.t > 1.2)) && (behind > 2.6 || (c.state === 'sad' && c.t > 2.4))) c.fade = Math.max(0, c.fade - dt / 0.45);
      if (S.phase === 'celebrate' && c.state !== 'catch') c.fade = Math.max(0, c.fade - dt / 0.8);
      if (c.fade <= 0) { c.state = 'gone'; c.sc = 0; }
    }
    for (const l of lv) {
      if (!l.shown) continue;
      l.t += dt;
      if (l.lit) l.litT += dt;
    }
    for (let k = pv.length - 1; k >= 0; k--) {
      const p = pv[k];
      if (p.mode === 'fly') p.t += dt;
      else { p.life += dt; if (p.life > (p.mode === 'held' ? 1.6 : 1.1)) pv.splice(k, 1); }
    }
    for (const p of fx) {
      if (p.t >= p.life) continue;
      p.t += dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
    }
    if (riderAnim) { riderAnim.t += dt; if (riderAnim.t > 0.55) riderAnim = null; }
  }
  const TV = {};
  let riderTurn = 0;
  function render(dt, t) {
    frame(S.s, TV);
    const ty = ground(TV.x, TV.z);
    tram.position.set(TV.x, ty + 0.004, TV.z);
    tram.rotation.set(0, TV.yaw, 0);
    // rider: faces back (to the camera), swings towards the throw side (R = tram-local −x), little hop; cheers at the end
    let goal = 0, lean = 0, hop = 0;
    if (riderAnim) {
      const u = riderAnim.t, sg = riderAnim.side === 'R' ? 1 : -1;
      const k = u < 0.08 ? u / 0.08 : u < 0.22 ? 1 : Math.max(0, 1 - (u - 0.22) / 0.33);
      goal = sg * 1.35 * k; lean = -sg * 0.22 * k; hop = Math.sin(Math.min(1, u / 0.3) * Math.PI) * 0.02;
    }
    if (S.phase === 'celebrate' || S.phase === 'done') { hop = Math.abs(Math.sin(t * 7)) * 0.04; goal = Math.sin(t * 2.2) * 0.5; }
    riderTurn += (goal - riderTurn) * (1 - Math.exp(-dt * 26));
    rider.rotation.set(0, Math.PI + riderTurn, lean + Math.sin(t * 3.1) * 0.02 * S.v, 'YXZ');
    rider.position.y = RIDER.y + hop;
    // catchers (packed into the two instanced meshes; count = how many are visible)
    const cnt = [0, 0];
    let nr = 0;
    for (const c of cv) {
      if (c.state === 'hidden' || c.state === 'gone') continue;
      const rc = route.catchers[c.i];
      const im = dollIms[c.kid ? 1 : 0], k = c.kid ? 1 : 0;
      const sc = c.sc * c.fade;
      if (sc > 0.001 && cnt[k] < MAXV) {
        let yaw = c.yaw, roll = 0, sy = 1, y = c.y + c.hop;
        const face = Math.atan2(TV.x - rc.x, TV.z - rc.z);
        c.yaw += Math.atan2(Math.sin(face - c.yaw), Math.cos(face - c.yaw)) * (1 - Math.exp(-dt * 5));
        yaw = c.yaw;
        if (c.state === 'wait' || c.state === 'pop') {
          const near = c.ring > 0 && Math.abs(rc.s - S.s) < 2.2;
          roll = Math.sin(t * (near ? 9 : 5) + c.ph) * (near ? 0.16 : 0.09);
          y += Math.abs(Math.sin(t * (near ? 9 : 4) + c.ph)) * (near ? 0.045 : 0.012);
        } else if (c.state === 'catch') { yaw += Math.min(1, c.t / 0.55) * Math.PI * 2; }
        else if (c.state === 'happy') { y += Math.abs(Math.sin(t * 6 + c.ph)) * 0.02; roll = Math.sin(t * 4 + c.ph) * 0.06; }
        else if (c.state === 'sad') { roll = Math.sin(t * 7 + c.ph) * 0.26 * Math.max(0, 1 - c.t / 2); sy = 0.92; }
        if (c.shrugT >= 0) { roll += Math.sin(c.shrugT * 18) * 0.22 * (1 - c.shrugT / 0.8); sy *= 0.95; }
        const s = sc * c.size;
        e3.set(0, yaw, roll, 'YXZ');
        im.setMatrixAt(cnt[k], m4.compose(v3.set(rc.x, y, rc.z), q4.setFromEuler(e3), s3.set(s, s * sy, s)));
        im.setColorAt(cnt[k], col.setRGB(...c.tint));
        cnt[k]++;
      }
      if (c.ring > 0.01 && nr < MAXV) {
        const rs = (c.ringS || 1) * Math.min(1, c.sc * 1.3 + 0.001) * (c.ring < 1 && c.state !== 'catch' ? c.ring : 1);
        rings.setMatrixAt(nr, m4.compose(v3.set(rc.x, c.y + 0.004, rc.z), q4.identity(), s3.set(rs, 1, rs)));
        const rk = c.state === 'catch' ? c.ring : 1;
        rings.setColorAt(nr, col.setRGB(c.ringCol[0] * rk, c.ringCol[1] * rk, c.ringCol[2] * rk));
        nr++;
      }
    }
    dollIms.forEach((im, k) => { im.count = cnt[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    rings.count = nr; rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    // doorstep lanterns: pop in with their first catcher, dim until a delivery lights them (with a little overshoot)
    let nl = 0;
    for (const l of lv) {
      if (!l.shown) continue;
      const sp = ease(l.t / 0.45);
      const lk = l.lit ? Math.min(1, l.litT / 0.25) : 0;
      const bump = l.lit ? 1 + Math.sin(Math.min(1, l.litT / 0.5) * Math.PI) * 0.35 : 1;
      e3.set(0, l.yaw, 0);
      lamps.setMatrixAt(nl, m4.compose(v3.set(l.x, l.y, l.z), q4.setFromEuler(e3), s3.setScalar(Math.max(0.001, sp * bump))));
      const flick = l.lit ? 0.94 + 0.06 * Math.sin(t * 9 + l.x * 3) : 1;
      lamps.setColorAt(nl, col.setRGB((0.36 + 0.86 * lk) * flick, (0.34 + 0.74 * lk) * flick, (0.4 + 0.52 * lk) * flick));
      nl++;
    }
    lamps.count = nl; lamps.instanceMatrix.needsUpdate = true; if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    // presents: arc (with a spin) to the catcher's mittens or the snow; held above the head after a catch, then gone
    let np = 0;
    const hp = {};
    for (const p of pv) {
      let x, y, z, s = 1, rx = 0, ry = 0, rz = 0;
      if (p.mode === 'fly') {
        const u = Math.min(1, p.t / p.T);
        const to = p.catcher >= 0 ? handPos(cv[p.catcher], hp) : p.to;
        x = p.from.x + (to.x - p.from.x) * u; z = p.from.z + (to.z - p.from.z) * u;
        y = p.from.y + (to.y - p.from.y) * u + 4 * p.arc * u * (1 - u);
        rx = u * 5.5; ry = u * 4 * p.spin; rz = u * 2;
      } else if (p.mode === 'held') {
        const c = cv[p.catcher];
        handPos(c, hp);
        x = hp.x; y = hp.y + 0.02 + Math.abs(Math.sin(p.life * 6)) * 0.015; z = hp.z;
        ry = c.yaw; s = p.life > 1.25 ? Math.max(0, 1 - (p.life - 1.25) / 0.35) : 1;
        s *= c.fade;
      } else {
        x = p.to.x; y = p.to.y - Math.min(0.03, p.life * 0.05); z = p.to.z;
        rx = 0.35; rz = 0.25; ry = p.id;
        s = p.life > 0.8 ? Math.max(0, 1 - (p.life - 0.8) / 0.3) : 1;
      }
      if (s <= 0.001) continue;
      e3.set(rx, ry, rz);
      presentsIm.setMatrixAt(np, m4.compose(v3.set(x, y, z), q4.setFromEuler(e3), s3.setScalar(s)));
      presentsIm.setColorAt(np, col.setRGB(...p.tint));
      np++;
    }
    presentsIm.count = np; presentsIm.instanceMatrix.needsUpdate = true; if (presentsIm.instanceColor) presentsIm.instanceColor.needsUpdate = true;
    let nf = 0;
    for (const p of fx) {
      if (p.t >= p.life) continue;
      const u = p.t / p.life;
      const s = p.s * (p.g < 1.6 ? (u < 0.3 ? 0.6 + u * 1.6 : 1.08 * (1 - (u - 0.3) / 0.7)) : 1 - u);
      if (s <= 0.001) continue;
      e3.set(p.t * 7, p.t * 9, 0);
      fxIm.setMatrixAt(nf, m4.compose(v3.set(p.x, Math.max(p.y, ground(p.x, p.z) + 0.01), p.z), q4.setFromEuler(e3), s3.setScalar(s)));
      fxIm.setColorAt(nf, col.setRGB(...p.c));
      nf++;
    }
    fxIm.count = nf; fxIm.instanceMatrix.needsUpdate = true; if (fxIm.instanceColor) fxIm.instanceColor.needsUpdate = true;
  }

  function finish() {
    const r = sim.result();
    const lit = lv.filter((l) => l.lit).length;
    const lines = [`Delivered ${r.delivered}/${N_CATCH} · Perfect ${r.perfect} · Good ${r.good} · Best streak ${r.bestStreak}`, `Doorsteps lit ${lit}/${lv.length}`];
    if (r.stars < 2) lines.push(`For ★★: ${STARS[1]}+ points. Toss as the ring glows gold!`);
    else if (r.stars < 3) lines.push(`For ★★★: ${STARS[2]}+ of ${MAX_SCORE}. Keep your streak going!`);
    else lines.push('Every doorstep in Tinselby is glowing!');
    dbg.result = { ...r, lit };
    for (const p of ui.querySelectorAll('.pd-pop')) p.remove(); // keep the results card clean
    banner.classList.remove('show'); help.classList.add('off');
    mg.finish({ score: r.score, stars: r.stars, text: lines.join(' — ') });
  }

  const unreg = engine.addUpdate((dt, t) => {
    const d = Math.min(0.05, dt);
    tick(d);
    anim(d);
    render(d, t);
    aim(d);
    keepShot();
  }, 50);

  // ---------------------------------------------------------------- cleanup
  mg.onDispose(() => {
    unreg();
    clearTimeout(pendT); clearTimeout(showBanner.t);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    window.removeEventListener('keydown', onKey);
    ui.remove();
    for (const d of disposables) { try { d.dispose(); } catch (e) { /* already gone */ } }
    try { release?.(); } catch (e) { /* ignore */ }
    if (ambient) { try { ambient.mesh.visible = !!ambient.shown; } catch (e) { /* ignore */ } }
    ctx.input.clearTap();
    const hold = { pos: new THREE.Vector3(rig.R.pos.x, rig.R.pos.y, rig.R.pos.z), target: new THREE.Vector3(rig.R.target.x, rig.R.target.y, rig.R.target.z) };
    cam.playShot({ name: 'presents-out', duration: 0.7, blendIn: 0.001, blendOut: 0.7, skippable: false, portrait: false, update: (u, out) => { out.pos.copy(hold.pos); out.target.copy(hold.target); } });
    if (window.__presents === dbg) delete window.__presents;
  });

  // ---------------------------------------------------------------- go: at the Park Gate stop, heading west
  render(0.016, engine.time);
  aim(0, true);
  hud();
  await mg.intro();
  if (mg.finished) return;
  sim.start();
  sfx('tram');
  showBanner('Ding ding!', 'Presents for everyone waving!', 2400);
}

function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; }
