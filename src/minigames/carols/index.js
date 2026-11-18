// Carol Singing: Advent door 17 at the Pinecone Park gazebo. Owned by the carols mini-game agent.
// Three real carols play back to back through audio.playSong (Jingle Bells chorus, Deck the Halls, We Wish You a
// Merry Christmas). Knitted baubles and bells fall into three lanes (low / middle / high notes); tap the lane as each
// one reaches its wreath and your doll's voice joins the melody (audio.note at the note's pitch). Long notes have a
// yarn tail: keep the lane held. The choir (Tilly + four carollers) sings and sways on the stage, the park gathers
// round to listen and cheers your streaks.
//
// Controls (one thumb): tap / hold a lane. Keys: ← ↓ → (also A S D, J K L, 1 2 3; Space / Enter = the middle lane).
// Scoring + bot: sim.js (Perfect ±0.11 s 10, Good ±0.22 s 5, wrong lane "Close" 3, holds 2 per beat). Stars: 1 = all
// three carols sung, 2 ≥ 60 %, 3 ≥ 85 % of the maximum. Charts: chart.js. Tuning: node src/minigames/carols/tune.mjs.
//
// Timing: song time comes from playSong's { start, spb } on the AudioContext clock (minus the output latency); when
// playSong returns null (no audio, muted, hidden tab, capture mode) the game runs its own clock at the song's tempo.
// Everything (root group, geometry, DOM, listeners, window.__carols) is released on dispose.
import * as THREE from 'three';
import { buildCharacter } from '../../core/player.js';
import { box, rbox, sph, extrude, poly, starPts, xf, merge, FELT, GLOW, GLOSS, KNIT } from '../../core/prims.js';
import { isPortrait } from '../view.js';
import { buildCharts, LANES } from './chart.js';
import { createSim, createBotDriver, TUNE, STAR_FRAC, runHeadless } from './sim.js';
import './carols.css';

const ARENA0 = { x: 3.0, z: 11.6, stageY: 0.2, cam: { x: 3.0, y: 1.35, z: 14.6 }, target: { x: 3.0, y: 0.5, z: 11.7 },
  player: [0, 0.42], choir: [[-0.42, 0.22], [0.42, 0.22], [-0.22, -0.05], [0.22, -0.05], [0, -0.25]] };
// Tilly (door 5's doll, lines.js GIVERS[5]); she sings in the choir while her giver doll is hidden
const TILLY = { coat: 'teal', outfit: 'duffle', hat: 'none', hair: 'bunches', hairColor: 'ginger', scarf: 'red' };
const CAROLLER_A = { coat: 'red', outfit: 'coat', hat: 'bobble', scarf: 'white', hair: 'bob', hairColor: 'dark', skin: 'brown' };
const CAROLLER_B = { coat: 'forest', outfit: 'dress', hat: 'earmuffs', scarf: 'gold', hair: 'long', hairColor: 'blonde', skin: 'light' };
// choir slot → doll kind (0 Tilly, 1 caroller A, 2 caroller B); slot order = ARENAS.carols.choir
const CHOIR_KIND = [0, 1, 2, 2, 1];
const CHOIR_SCALE = [0.95, 0.98, 0.98, 0.98, 1.0];
const RISER = [0, 0, 0.07, 0.07, 0.14]; // middle / back rows stand on felt risers so their faces clear the front row
const PLAYER_S = 1.12;
const SHOULDER_Y = 0.178, ARM_REST = -1.0; // player.js arm pivot height; arms forward holding the songbook
const LEAD_FIRST = 2.6, LEAD_NEXT = 2.1; // s of falling notes (+ title card) before each carol's first note
const VIS_LEAD = 1.7; // s a note takes to fall to its wreath
const END_PAUSE = 2.2;
const MOUTH = [0, 0.249, 0.08]; // design units in the doll's body space (head centre y 0.265, r 0.085)
const DOLL_K = 0.9; // player.js design units → doll group
const LANE_COL = ['#3f7a4a', '#c4362f', '#e3aa3a'];
const SPARK_N = 64;
const ICON = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M10 12c0-3 3-5 6-5h20v30H16c-3 0-6 2-6 5z" fill="#c4362f" stroke="#3a2a24" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 42V12" stroke="#3a2a24" stroke-width="2.4"/><path d="M24 15v12" stroke="#fff4e2" stroke-width="2.6" stroke-linecap="round"/><path d="M24 15l6 2" stroke="#fff4e2" stroke-width="2.6" stroke-linecap="round"/><circle cx="21" cy="28" r="3.4" fill="#fff4e2"/><circle cx="39" cy="9" r="2.6" fill="#e3aa3a"/><circle cx="43" cy="17" r="1.8" fill="#e3aa3a"/></svg>';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

let lastExit = { time: -1e9 }; // "Play again" starts without a camera hop

export default {
  id: 'carols',
  title: 'Carol Singing',
  district: 'park',
  icon: ICON,
  intro: 'Sing three carols with the choir! Tap a lane as each bauble reaches its wreath, and hold the lane for the long notes.',
  async start(ctx, mg) {
    const { engine, cam, audio, game } = ctx;
    const params = ctx.params || new URLSearchParams(location.search);
    const A = ctx.layout?.ARENAS?.carols || ARENA0;
    const stageY = A.stageY ?? 0.2;
    const sfx = (name, o) => { try { audio?.sfx?.(name, o); } catch (e) { /* audio is optional */ } };
    mg.setPlayerControl(false);
    mg.setPlayerVisible(false);

    const charts = buildCharts();
    const S = createSim(charts);
    const V = new THREE.Vector3(), V2 = new THREE.Vector3(), M4 = new THREE.Matrix4(), M5 = new THREE.Matrix4(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
    const world = (lx, lz, y = stageY) => V.set(A.x + lx, y, A.z + lz);

    const root = mg.add(new THREE.Group());
    root.name = 'carols';
    const owned = [];
    const own = (x) => { owned.push(x); return x; };

    // ------------------------------------------------------------------ the player's doll: body + legs = 1 mesh; both arms + the songbook = 1 mesh
    // on one shoulder pivot (the arms share the shoulder line, so lifting the book on a hit is one rotation)
    const ch = buildCharacter(engine.mat, game.state.style || {});
    ch.group.scale.setScalar(PLAYER_S);
    const armPivot = new THREE.Group();
    {
      const bodyMesh = ch.body.children.find((o) => o.isMesh);
      ch.body.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(ch.body.matrixWorld).invert();
      const parts = [bodyMesh.geometry];
      for (const l of ch.legs) { l.updateMatrixWorld(true); const m = l.children[0]; parts.push(m.geometry.clone().applyMatrix4(M4.multiplyMatrices(inv, m.matrixWorld))); }
      const geo = merge(parts);
      for (const p of parts) p.dispose();
      for (const l of ch.legs) { l.children[0].geometry.dispose(); l.removeFromParent(); }
      bodyMesh.geometry = geo;
      // arms: rest pose baked relative to the shoulder pivot (0, SHOULDER_Y, 0)
      const armGeo = ch.arms[0].children[0].geometry;
      const arms = ch.arms.map((a, i) => { const sx = i === 0 ? -1 : 1; return xf(xf(armGeo.clone(), [0, 0, 0], [ARM_REST, 0, -sx * 0.36]), [sx * 0.076, 0, 0]); });
      arms.push(songbook().translate(0, -SHOULDER_Y, 0));
      const ag = merge(arms);
      for (const g of arms) g.dispose();
      armGeo.dispose();
      for (const a of ch.arms) a.removeFromParent();
      const armMesh = new THREE.Mesh(ag, engine.mat);
      armMesh.castShadow = false; // in the body's shadow anyway: saves a call
      armPivot.position.set(0, SHOULDER_Y, 0);
      armPivot.add(armMesh);
      ch.body.add(armPivot);
    }
    const pp = world(A.player[0], A.player[1]);
    ch.group.position.copy(pp);
    root.add(ch.group);

    // ------------------------------------------------------------------ the choir (Tilly + 4 carollers) on felt risers
    const kinds = [TILLY, CAROLLER_A, CAROLLER_B].map((st) => own(choirGeo(st)));
    const choirMeshes = kinds.map((g, k) => {
      const n = CHOIR_KIND.filter((x) => x === k).length;
      const m = new THREE.InstancedMesh(g, engine.mat, n);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(m);
      return m;
    });
    const choir = A.choir.map(([lx, lz], i) => ({ lx, lz, kind: CHOIR_KIND[i], idx: CHOIR_KIND.slice(0, i).filter((x) => x === CHOIR_KIND[i]).length, s: CHOIR_SCALE[i], y: stageY + RISER[i], ph: i * 0.37, open: 0, bow: 0, hop: 0 }));
    const riser = new THREE.Mesh(own(merge([
      xf(rbox(0.74, 0.07, 0.24, 0.02, '#a8322e', FELT), [0, 0.035, -0.05]),
      xf(rbox(0.3, 0.14, 0.2, 0.02, '#a8322e', FELT), [0, 0.07, -0.25]),
      xf(box(0.745, 0.012, 0.012, '#e3aa3a', GLOSS), [0, 0.066, 0.072]),
      xf(box(0.305, 0.012, 0.012, '#e3aa3a', GLOSS), [0, 0.136, -0.148]),
    ])), engine.mat);
    riser.position.set(A.x, stageY, A.z);
    riser.receiveShadow = true;
    root.add(riser);

    // ------------------------------------------------------------------ singing mouths (5 choir + you, one instanced mesh)
    const mouths = new THREE.InstancedMesh(own(merge([
      xf(sph(0.017, '#5c1d22', FELT, 10, 6), [0, 0, 0], null, [1, 1, 0.42]),
      xf(sph(0.009, '#c75a5f', FELT, 6, 4), [0, -0.006, 0.0035], null, [1, 0.6, 0.4]),
    ])), engine.mat, choir.length + 1);
    mouths.frustumCulled = false;
    mouths.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mouths);
    let playerOpen = 0;

    // ------------------------------------------------------------------ sparkles (streak bursts over the choir, little stars from your songbook)
    const sparkGeo = own(merge([xf(extrude(poly(starPts(0.03, 0.013)), 0.006, '#ffd27a', GLOW, 2), [0, 0, -0.003])]));
    const sparks = new THREE.InstancedMesh(sparkGeo, engine.mat, SPARK_N);
    sparks.frustumCulled = false;
    sparks.count = 0;
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sparks.setColorAt(0, C.set('#ffffff'));
    root.add(sparks);
    const parts = []; // { x, y, z, vx, vy, vz, t, life, s, c }

    // ------------------------------------------------------------------ audience + stage
    const showPark = ctx.life?.hideDistrict ? ctx.life.hideDistrict('park') : () => {};
    try { ctx.life?.gatherAt?.(A.x, A.z, 2.0); } catch (e) { /* life is optional */ }
    let unhideTilly = null;
    try { unhideTilly = ctx.tasks?.setGiverHidden?.(5, true) || null; } catch (e) { /* tasks optional */ }
    const cheer = () => { if (ctx.life?.cheer) { try { ctx.life.cheer(); } catch (e) { /* optional */ } } else sfx('cheer', { vol: 0.6 }); };

    // ------------------------------------------------------------------ DOM: lanes, wreath targets, notes, labels, banner, hint
    const touch = params.has('crtouch') || engine.isMobile || matchMedia('(pointer: coarse)').matches;
    const ui = document.createElement('div');
    ui.className = 'cr-ui';
    ctx.uiRoot.insertBefore(ui, ctx.uiRoot.querySelector('.mg-layer'));
    const sceneBox = el('div', 'cr-scene', ui);
    const banner = el('div', 'cr-banner', sceneBox);
    const streakEl = el('div', 'cr-streak', sceneBox);
    const lanesEl = el('div', 'cr-lanes', ui);
    const KEYCAP = ['←', '↓', '→'];
    const lanes = [0, 1, 2].map((i) => {
      const node = el('div', 'cr-lane', lanesEl);
      const target = el('div', 'cr-target', node);
      target.innerHTML = wreathSvg(LANE_COL[i]);
      if (!touch) el('div', 'cr-key', node).textContent = KEYCAP[i];
      return { node, target, flash: 0, near: false };
    });
    const probe = el('div', 'cr-probe', lanes[0].node);
    const hint = el('div', 'knit-card cr-hint', sceneBox);
    hint.innerHTML = touch ? 'Tap a lane as its bauble reaches the wreath. Hold the long ones!' : 'Press <kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> (or <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>) as each bauble reaches its wreath. Hold the long ones!';
    let laneH = 300, hitY = 240, sceneRect = { l: 0, t: 0, w: innerWidth, h: innerHeight }, lanesRect = { l: innerWidth, w: 0 };
    const measure = () => {
      laneH = lanes[0].node.clientHeight || laneH;
      hitY = probe.offsetTop || laneH * 0.8;
      const r = sceneBox.getBoundingClientRect();
      if (r.width > 10 && r.height > 10) sceneRect = { l: r.left, t: r.top, w: r.width, h: r.height };
      const q = lanesEl.getBoundingClientRect();
      lanesRect = { l: q.left, w: q.width };
    };
    measure();
    window.addEventListener('resize', measure);
    const noteEls = new Map(); // note → { node, tail, lane, done }

    // ------------------------------------------------------------------ input: lanes (multi-touch), keys
    const ptrs = new Map();
    const keysDown = new Map();
    let frameWall = performance.now();
    const laneAt = (x) => clamp(Math.floor(((x - lanesRect.l) / Math.max(1, lanesRect.w)) * LANES), 0, LANES - 1);
    lanesEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const l = laneAt(e.clientX);
      ptrs.set(e.pointerId, l);
      try { lanesEl.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ }
      press(l);
    });
    const up = (e) => { if (!ptrs.has(e.pointerId)) return; const l = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); release(l); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) lanesEl.addEventListener(ev, up);
    lanesEl.addEventListener('contextmenu', (e) => e.preventDefault());
    const KEYS = { arrowleft: 0, a: 0, j: 0, 1: 0, arrowdown: 1, arrowup: 1, s: 1, k: 1, 2: 1, ' ': 1, enter: 1, arrowright: 2, d: 2, l: 2, 3: 2 };
    mg.onKey((e) => {
      const k = e.key.toLowerCase();
      if (!(k in KEYS)) return;
      e.preventDefault();
      if (e.repeat || keysDown.has(k)) return;
      keysDown.set(k, KEYS[k]);
      press(KEYS[k]);
    });
    const onKeyUp = (e) => { const k = e.key.toLowerCase(); if (keysDown.has(k)) { const l = keysDown.get(k); keysDown.delete(k); release(l); } };
    const onBlur = () => { for (const l of keysDown.values()) release(l); keysDown.clear(); for (const l of ptrs.values()) release(l); ptrs.clear(); };
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    function inputTime() { return songT + Math.min(0.1, (performance.now() - frameWall) / 1000); }
    function press(l) {
      lanes[l].flash = 0.14;
      if (bot || phase !== 'song') return;
      const t = inputTime();
      S.advance(t);
      S.press(l, t);
    }
    function release(l) {
      if (bot || phase !== 'song') return;
      S.release(l, inputTime());
    }

    // ------------------------------------------------------------------ camera: one long, gently swaying shot; framed beside the lanes
    const quick = engine.time - lastExit.time < 2.5;
    const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), gPos = new THREE.Vector3(), gTgt = new THREE.Vector3();
    const lens = { w: 1, fov: 32 };
    camGoal(camPos, camTgt, 0);
    cam.playShot({
      name: 'carols', duration: 1e6, blendIn: quick ? 0.0001 : 1.2, blendOut: 0.6, skippable: false, tilt: 0.45, portrait: false, lens,
      post: { bloom: 0.85, glow: 0.9, threshold: 0.1, band: 0.42, falloff: 0.4 },
      update(u, out) { out.pos.copy(camPos); out.target.copy(camTgt); },
    });

    // ------------------------------------------------------------------ state
    let phase = 'intro', T = 0, endT = 0, songK = -1, chart = null, songT = -9, seg = null, segT0 = 0, audioLive = false;
    let ffing = false, bot = null, botMode = null, lastBeatI = -99, shownSec = -1, goalKey = '', streakShown = 0, hintT = 0;
    let melI = 0, choirOpen = 0, logLines = [];
    const thr = STAR_FRAC.map((f) => Math.ceil(f * S.max));
    const log = (s) => { logLines.push(`${T.toFixed(2)} ${s}`); if (logLines.length > 60) logLines.shift(); };
    if (params.has('mgauto')) setBot(params.get('crbot') || 'good');

    mg.addUpdate(update);
    mg.onDispose(dispose);
    exposeDebug();

    await mg.intro();
    if (mg.finished) return;
    mg.hud.setScore(0);
    hintT = 8;
    startSong(0);

    // ================================================================== songs
    function startSong(k) {
      songK = k;
      chart = charts[k];
      S.begin(k);
      bot?.begin(k);
      melI = 0;
      const lead = k === 0 ? LEAD_FIRST : LEAD_NEXT;
      seg = null;
      audioLive = false;
      const ac = audio?.context;
      if (!engine.capture && !ffing && ac && ac.state === 'running' && audio?.playSong) {
        const r = audio.playSong(chart.id, { fromBeat: chart.from, toBeat: chart.to, at: ac.currentTime + lead });
        if (r && r.spb > 0) { seg = r; segT0 = r.start + chart.from * r.spb; }
      }
      songT = seg ? (audio.context.currentTime - latency()) - segT0 : -lead;
      phase = 'song';
      banner.innerHTML = `<small>Carol ${k + 1} of ${charts.length}</small><b>${chart.title}</b>`;
      banner.classList.remove('on'); void banner.offsetWidth; banner.classList.add('on');
      log(`song ${k} ${chart.id} ${seg ? 'audio' : 'own clock'} lead ${lead}`);
    }
    function latency() {
      try { const b = audio?.beat?.(); if (b && Number.isFinite(b.latency)) return b.latency; } catch (e) { /* optional */ }
      const ac = audio?.context;
      return ac ? clamp(ac.outputLatency || ac.baseLatency || 0, 0, 0.35) : 0;
    }
    /** Song clock: our own seconds, pulled onto the AudioContext clock while the segment is really playing. */
    function clock(dt) {
      songT += dt;
      audioLive = false;
      const ac = audio?.context;
      if (seg && ac && ac.state === 'running' && !ffing && !engine.capture && !audio.muted) {
        const a = ac.currentTime - latency() - segT0;
        const d = a - songT;
        if (Math.abs(d) > 0.3) songT = a; else songT += d * Math.min(1, dt * 8);
        audioLive = true;
      }
    }

    // ================================================================== per-frame
    function update(dt) {
      dt = Math.min(dt, 0.1);
      T += dt;
      if (phase === 'song') {
        clock(dt);
        frameWall = performance.now();
        if (bot) bot.step(songT, (a) => { if (a.type === 'press') lanes[a.lane].flash = 0.12; });
        S.advance(songT);
        drainEvents();
        if (songT >= chart.end) {
          S.endSong(chart.end);
          drainEvents();
          if (songK + 1 < charts.length) { cheer(); startSong(songK + 1); } else beginEnd();
        }
        hud(dt);
      } else if (phase === 'end') {
        endT += dt;
        if (endT > END_PAUSE) finishGame();
      }
      updateNotes();
      updateLanes(dt);
      poseAll(dt);
      updateSparks(dt);
      updateCamera(dt);
    }

    function drainEvents() {
      for (const ev of S.events) {
        if (ev.type === 'note') {
          const n = ev.note, g = ev.grade;
          const ne = noteEls.get(n);
          if (ne) ne.node.classList.add(g === 'perfect' || g === 'good' ? (n.hold ? 'holding' : 'hit') : g);
          if (g === 'perfect' || g === 'good' || g === 'close') {
            const dur = n.hold ? Math.max(0.45, n.endT - n.t) : 0.42;
            try { audio?.note?.(n.m, { kind: 'choir', dur, vol: g === 'perfect' ? 0.85 : g === 'good' ? 0.7 : 0.4 }); } catch (e) { /* optional */ }
            playerOpen = g === 'close' ? 0.6 : 1;
            if (g !== 'close') bookSparks(g === 'perfect' ? 2 : 1, ev.lane);
          }
          pop(ev.lane ?? n.lane, g === 'perfect' ? 'Perfect!' : g === 'good' ? 'Good' : g === 'close' ? 'Close' : g === 'early' ? 'Too early' : 'Missed', g);
          if ((g === 'perfect' || g === 'good') && ev.streak > 0 && ev.streak % TUNE.streakCheer === 0) streak(ev.streak);
          mg.hud.setScore(S.score);
        } else if (ev.type === 'holdEnd') {
          const ne = noteEls.get(ev.note);
          if (ne) { ne.node.classList.remove('holding'); ne.node.classList.add('hit'); ne.doneT = T; }
          if (ev.full) pop(ev.lane, `Held! +${ev.pts}`, 'hold');
          mg.hud.setScore(S.score);
        } else if (ev.type === 'holdTick') {
          playerOpen = 1;
          mg.hud.setScore(S.score);
        }
      }
      S.events.length = 0;
    }
    function streak(n) {
      streakShown = n;
      streakEl.textContent = `${n} in a row!`;
      streakEl.classList.remove('on'); void streakEl.offsetWidth; streakEl.classList.add('on');
      cheer();
      burst();
      for (const c of choir) c.hop = 1;
      sfx('bell', { vol: 0.35 });
      log(`streak ${n}`);
    }
    function setGoal(t) { if (t !== goalKey) { goalKey = t; mg.hud.setGoal(t); } }
    function hud(dt) {
      if (hintT > 0 && (hintT -= dt) <= 0) hint.classList.add('off');
      let left = Math.max(0, chart.end - songT);
      for (let k = songK + 1; k < charts.length; k++) left += LEAD_NEXT + charts[k].end;
      const s = Math.ceil(left + END_PAUSE * 0.5);
      if (s !== shownSec) { shownSec = s; mg.hud.setTimer(s); }
      const nextStar = S.score >= thr[2] ? '★★★' : S.score >= thr[1] ? `★★★ at ${thr[2]}` : `★★ at ${thr[1]}`;
      setGoal(isPortrait() ? `${chart.title} · ${songK + 1}/3` : `${chart.title} · ${nextStar}`);
    }
    function beginEnd() {
      phase = 'end';
      endT = 0;
      S.finish();
      cheer();
      burst(); burst();
      sfx('task', { vol: 0.5 });
      const st = S.stars();
      setGoal(st >= 3 ? 'Encore! Encore!' : st >= 2 ? 'Lovely singing!' : 'The park loved it!');
      mg.hud.setTimer(0);
      log(`end score ${S.score}/${S.max} stars ${st}`);
    }
    function finishGame() {
      if (phase === 'done') return;
      phase = 'done';
      const stars = S.stars();
      const name = game.state.playerName || 'friend';
      const lines = [
        'Keep singing: the music helps!',
        `The whole park sang along with you, ${name}!`,
        `Lovely singing, ${name}! Tilly is grinning ear to ear.`,
        `What a voice, ${name}! The park wants an encore.`,
      ];
      const held = S.holdsFull ? ` · ${S.holdsFull} long note${S.holdsFull === 1 ? '' : 's'} held` : '';
      mg.finish({ score: S.score, stars, text: `${S.perfect} Perfect · ${S.good} Good${held}. ${lines[stars]}` });
    }

    // ------------------------------------------------------------------ notes (DOM)
    function updateNotes() {
      const live = phase === 'song' && chart;
      if (live) {
        for (let i = S.next > 2 ? S.next - 2 : 0; i < chart.notes.length; i++) {
          const n = chart.notes[i];
          if (n.t - songT > VIS_LEAD + 0.1) break;
          if (!noteEls.has(n) && !n.res && n.t - songT > -TUNE.good) noteEls.set(n, makeNote(n));
        }
      }
      const travel = hitY + 40;
      for (const [n, ne] of noteEls) {
        if (!live || !chart.notes.includes(n)) { ne.node.remove(); noteEls.delete(n); continue; }
        const holding = S.holds[n.lane]?.note === n;
        let y = hitY - ((n.t - songT) / VIS_LEAD) * travel;
        if (holding || (n.res && (n.res === 'perfect' || n.res === 'good' || n.res === 'close'))) y = Math.min(y, hitY);
        if (n.res && !ne.doneT && !holding) ne.doneT = T;
        if (ne.tail) {
          const top = hitY - ((n.endT - songT) / VIS_LEAD) * travel;
          const h = Math.max(0, (holding ? hitY : y) - top);
          ne.tail.style.height = `${h.toFixed(1)}px`;
          if (n.res && !holding && n.res !== 'miss' && n.res !== 'early' && n.endT > songT && ne.doneT) ne.tail.style.opacity = '0.35';
        }
        ne.node.style.transform = `translateY(${y.toFixed(1)}px)`;
        const gone = (ne.doneT && T - ne.doneT > 0.5 && (n.res !== 'miss' || y > laneH + 40)) || y > laneH + 80;
        if (gone && !holding) { ne.node.remove(); noteEls.delete(n); }
      }
    }
    function makeNote(n) {
      const node = el('div', 'cr-note', lanes[n.lane].node);
      let tail = null;
      if (n.hold) tail = el('div', 'cr-tail', node);
      const svg = document.createElement('div');
      svg.innerHTML = n.lane === 2 ? bellSvg(LANE_COL[2]) : baubleSvg(LANE_COL[n.lane]);
      node.appendChild(svg.firstChild);
      node.style.transform = 'translateY(-60px)';
      return { node, tail, doneT: 0 };
    }
    function updateLanes(dt) {
      const pressedNow = [false, false, false];
      for (const l of ptrs.values()) pressedNow[l] = true;
      for (const l of keysDown.values()) pressedNow[l] = true;
      for (let i = 0; i < LANES; i++) {
        const L = lanes[i];
        if (L.flash > 0) L.flash -= dt;
        const on = pressedNow[i] || L.flash > 0 || (bot && S.holds[i]);
        if (on !== L.on) { L.on = on; L.node.classList.toggle('on', !!on); }
        let near = false;
        if (phase === 'song' && chart) for (let j = S.next; j < chart.notes.length && chart.notes[j].t - songT < 0.2; j++) { const n = chart.notes[j]; if (n.lane === i && !n.res && Math.abs(n.t - songT) <= TUNE.perfect) near = true; }
        if (near !== L.near) { L.near = near; L.target.classList.toggle('near', near); }
      }
      // wreaths pulse on every beat (also the visible beat when the game runs its own clock)
      if (chart && phase === 'song') {
        const bi = Math.floor(songT / chart.spb + 1e-3);
        if (bi !== lastBeatI) {
          lastBeatI = bi;
          for (const L of lanes) { L.target.classList.remove('pulse'); void L.target.offsetWidth; L.target.classList.add('pulse'); }
        }
      }
    }
    function pop(lane, text, cls) {
      const n = el('div', 'cr-pop ' + (cls || ''), lanes[clamp(lane | 0, 0, 2)].node);
      n.textContent = text;
      setTimeout(() => n.remove(), 950);
    }

    // ------------------------------------------------------------------ dolls: sway on the beat, mouths with the melody, bow at the end
    function poseAll(dt) {
      const spb = chart ? chart.spb : 0.6;
      const beat = chart && phase === 'song' ? songT / spb : T / 0.6;
      const singing = phase === 'song' && songT > -0.3 && songT < chart.end;
      // choir mouths: open on every melody note of the carol (they're singing it), closing through the note
      if (singing) {
        const mel = chart.melody;
        while (melI < mel.length && mel[melI].t + mel[melI].d < songT) melI++;
        let o = 0;
        for (let j = melI; j < mel.length && mel[j].t <= songT; j++) {
          const m = mel[j], a = (songT - m.t) / Math.max(0.15, m.d);
          if (a >= 0 && a <= 1) o = Math.max(o, 1 - 0.45 * a);
        }
        choirOpen += (o - choirOpen) * Math.min(1, dt * 22);
      } else choirOpen += (0.05 - choirOpen) * Math.min(1, dt * 6);
      const bowing = phase === 'end' || phase === 'done' ? clamp(endT * 1.6, 0, 1) * (endT < 1.3 ? 1 : clamp(1 - (endT - 1.3) * 2.2, 0, 1)) : 0;
      const intro = phase === 'intro' ? 1 : 0;
      // player
      const swayP = Math.sin(Math.PI * beat) * (intro ? 0.03 : 0.075);
      ch.body.rotation.z = lerp(ch.body.rotation.z, swayP, Math.min(1, dt * 10));
      ch.body.position.y = Math.abs(Math.sin(Math.PI * beat)) * 0.012;
      ch.body.rotation.x = bowing * 0.55;
      const lift = playerOpen * 0.18;
      armPivot.rotation.x = -lift - bowing * 0.2;
      playerOpen = Math.max(S.holds.some(Boolean) ? 0.9 : 0, playerOpen - dt * 2.6);
      ch.group.rotation.y = Math.sin(T * 0.6) * 0.06;
      root.updateMatrixWorld(true);
      // choir
      for (let i = 0; i < choir.length; i++) {
        const c = choir[i];
        c.hop = Math.max(0, c.hop - dt * 2.4);
        const b = beat + c.ph * 0.15;
        const hop = Math.sin(Math.PI * (1 - c.hop)) * c.hop * 0.06;
        const y = c.y + Math.abs(Math.sin(Math.PI * b)) * 0.01 + hop;
        E.set(bowing * 0.5, Math.sin(T * 0.5 + c.ph) * 0.08, Math.sin(Math.PI * b) * 0.07);
        Q.setFromEuler(E);
        SC.setScalar(c.s);
        M4.compose(V2.set(A.x + c.lx, y, A.z + c.lz), Q, SC);
        choirMeshes[c.kind].setMatrixAt(c.idx, M4);
        const open = clamp(choirOpen * (0.85 + 0.15 * Math.sin(T * 9 + c.ph * 5)), 0.08, 1);
        M5.compose(V2.set(MOUTH[0] * DOLL_K, MOUTH[1] * DOLL_K, MOUTH[2] * DOLL_K), Q.identity(), SC.set(1, 0.25 + open * 1.05, 1));
        mouths.setMatrixAt(i, M4.multiply(M5));
      }
      for (const m of choirMeshes) m.instanceMatrix.needsUpdate = true;
      // the player's mouth rides on the doll's body
      M5.compose(V2.set(MOUTH[0], MOUTH[1], MOUTH[2]), Q.identity(), SC.set(1, 0.25 + clamp(playerOpen, 0.06, 1) * 1.05, 1));
      mouths.setMatrixAt(choir.length, M4.multiplyMatrices(ch.body.matrixWorld, M5));
      mouths.instanceMatrix.needsUpdate = true;
    }

    // ------------------------------------------------------------------ sparkles
    function spawn(x, y, z, vx, vy, vz, life, s, col) {
      if (parts.length >= SPARK_N) parts.shift();
      parts.push({ x, y, z, vx, vy, vz, t: 0, life, s, c: col });
    }
    function burst() {
      const cx = A.x, cy = stageY + 0.72, cz = A.z;
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.15 + Math.random() * 0.35;
        spawn(cx + Math.cos(a) * 0.1, cy, cz + Math.sin(a) * 0.1, Math.cos(a) * r, 0.5 + Math.random() * 0.6, Math.sin(a) * r * 0.6, 1.1 + Math.random() * 0.5, 0.8 + Math.random() * 0.6, ['#ffd27a', '#ffffff', '#ff9a8a', '#bff0c0'][i % 4]);
      }
    }
    function bookSparks(n, lane) {
      V2.set(0, 0.15, 0.1).applyMatrix4(ch.body.matrixWorld);
      for (let i = 0; i < n; i++) spawn(V2.x + (Math.random() - 0.5) * 0.06, V2.y, V2.z + 0.02, (lane - 1) * 0.12 + (Math.random() - 0.5) * 0.1, 0.32 + Math.random() * 0.2, 0.05, 0.9, 0.55, LANE_COL[lane] === '#e3aa3a' ? '#ffe2a0' : '#fff2d8');
    }
    function updateSparks(dt) {
      const q = engine.camera.quaternion;
      let n = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) { parts.splice(i, 1); continue; }
        p.vy -= dt * 0.35; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 1 - dt * 0.8; p.vz *= 1 - dt * 0.8;
      }
      for (const p of parts) {
        const k = p.t / p.life, s = p.s * Math.sin(Math.PI * Math.min(1, k * 1.2)) + 1e-4;
        E.set(0, 0, p.t * 3);
        Q.setFromEuler(E).premultiply(q);
        M4.compose(V2.set(p.x, p.y, p.z), Q, SC.setScalar(s));
        sparks.setMatrixAt(n, M4);
        sparks.setColorAt(n, C.set(p.c).multiplyScalar(1.3));
        n++;
      }
      sparks.count = n;
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }

    // ------------------------------------------------------------------ camera
    // Base pose = ARENAS.carols cam → target. It pulls back until the stage fits the free part of the screen (beside the
    // lanes in landscape, above them in portrait), then the camera slides so the stage sits in the middle of that part.
    function camGoal(pos, tgt, t) {
      const por = clamp(cam.portrait ?? (isPortrait() ? 1 : 0), 0, 1);
      const aspect = Math.max(0.3, innerWidth / Math.max(1, innerHeight));
      lens.fov = lerp(32, 46, por);
      const tanV = Math.tan(THREE.MathUtils.degToRad(lens.fov) / 2), tanH = tanV * aspect;
      const fw = clamp(sceneRect.w / innerWidth, 0.3, 1), fh = clamp(sceneRect.h / innerHeight, 0.25, 1);
      const sx = ((sceneRect.l + sceneRect.w / 2) / innerWidth) * 2 - 1;
      const sy = 1 - ((sceneRect.t + sceneRect.h / 2) / innerHeight) * 2;
      const dir = V2.set(A.cam.x - A.target.x, A.cam.y - A.target.y, A.cam.z - A.target.z);
      const d0 = dir.length();
      dir.normalize();
      // pitch up from the arena's 16° so the view clears the gazebo's rail into the stage (a touch more in portrait)
      { const p = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + 0.17 + 0.07 * por; const h = Math.hypot(dir.x, dir.z) || 1; dir.set((dir.x / h) * Math.cos(p), Math.sin(p), (dir.z / h) * Math.cos(p)); }
      const halfW = lerp(1.45, 0.95, por), halfH = lerp(1.0, 0.86, por);
      const d = Math.max(d0, halfW / (tanH * fw), halfH / (tanV * fh));
      tgt.set(A.target.x, A.target.y + lerp(0, 0.12, por), A.target.z);
      pos.copy(tgt).addScaledVector(dir, d);
      // slide so the subject (the target) lands at screen (sx, sy): camera moves the other way, in its own plane
      const right = V.set(dir.z, 0, -dir.x).normalize(); // camera right (looking along −dir)
      const upv = new THREE.Vector3().crossVectors(right, dir).multiplyScalar(-1).normalize();
      if (upv.y < 0) upv.multiplyScalar(-1);
      const ox = -sx * d * tanH, oy = -sy * d * tanV;
      pos.addScaledVector(right, ox).addScaledVector(upv, oy);
      tgt.addScaledVector(right, ox).addScaledVector(upv, oy);
      // gentle sway
      pos.x += Math.sin(t * 0.23) * 0.06 * d / d0;
      pos.y += Math.sin(t * 0.31 + 1) * 0.025 * d / d0;
    }
    function updateCamera(dt) {
      camGoal(gPos, gTgt, T);
      const k = 1 - Math.exp(-dt * 3);
      camPos.lerp(gPos, k);
      camTgt.lerp(gTgt, k);
    }

    // ------------------------------------------------------------------ cleanup
    function dispose() {
      lastExit = { time: engine.time };
      const lp = camPos.clone(), lt = camTgt.clone(), lf = lens.fov;
      cam.playShot({ name: 'carols-out', duration: 0.8, blendIn: 0.0001, blendOut: 0.8, skippable: false, tilt: 0.45, portrait: false, lens: { w: 1, fov: lf }, update(u, out) { out.pos.copy(lp); out.target.copy(lt); } });
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', measure);
      try { ctx.life?.release?.(); } catch (e) { /* optional */ }
      showPark();
      try { unhideTilly?.(); } catch (e) { /* optional */ }
      noteEls.clear();
      ptrs.clear(); keysDown.clear();
      ui.remove();
      ch.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const o of owned) o.dispose?.();
      owned.length = 0;
      for (const m of [...choirMeshes, mouths, sparks]) m.dispose();
      if (window.__carols && window.__carols._owner === root) delete window.__carols;
    }

    // ------------------------------------------------------------------ test hooks (window.__carols)
    function setBot(mode) {
      botMode = mode && mode !== 'off' ? mode : null;
      bot = botMode ? createBotDriver(S, botMode, 3) : null;
      if (bot && songK >= 0) bot.begin(songK);
      return botMode;
    }
    function exposeDebug() {
      const api = {
        _owner: root,
        get state() {
          return {
            phase, song: songK, songId: chart?.id ?? null, t: +songT.toFixed(2), audioLive, clock: seg ? 'audio' : 'own',
            score: S.score, max: S.max, ratio: +S.ratio.toFixed(3), stars: phase === 'end' || phase === 'done' ? S.stars() : null, thresholds: thr,
            perfect: S.perfect, good: S.good, close: S.close, early: S.early, miss: S.miss, stray: S.stray, holdPts: S.holdPts, holdsFull: S.holdsFull,
            streak: S.streak, bestStreak: S.bestStreak, notesOnScreen: noteEls.size, sparks: parts.length, bot: botMode, portrait: isPortrait(),
          };
        },
        /** 'perfect' | 'good' | 'sloppy' | 'none' | null (back to the player). */
        bot: setBot,
        press(l) { const b = bot; bot = null; press(l); bot = b; },
        release(l) { const b = bot; bot = null; release(l); bot = b; },
        /** Advance the game without rendering (all engine updates run; music sync is off meanwhile). */
        ff(sec, step = 1 / 30) {
          ffing = true;
          try { for (let i = 0, n = Math.round(sec / step); i < n; i++) { engine.time += step; for (const u of engine.updates.slice()) u.fn(step, engine.time); } } finally { ffing = false; }
          return api.state;
        },
        /** Headless bot runs (no scene): [{ mode, ratio, stars, … }]. */
        sim(modes = ['perfect', 'good', 'sloppy', 'none'], seeds = 3) {
          const out = [];
          for (const m of modes) for (let s = 1; s <= (m === 'perfect' || m === 'none' ? 1 : seeds); s++) out.push(runHeadless(m, s));
          return out;
        },
        budget() {
          let calls = 0, tris = 0;
          root.traverseVisible((o) => {
            if (!o.isMesh) return;
            const n = o.isInstancedMesh ? o.count : 1;
            if (!n) return;
            const passes = o.castShadow ? 2 : 1;
            const g = o.geometry;
            calls += passes;
            tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * n * passes;
          });
          return { calls, tris: Math.round(tris) };
        },
        charts: charts.map((c) => ({ id: c.id, title: c.title, notes: c.notes.length, holds: c.notes.filter((n) => n.hold).length, secs: +c.len.toFixed(1) })),
        get log() { return logLines.slice(); },
        tune: TUNE,
      };
      window.__carols = api;
    }

    // ------------------------------------------------------------------ geometry
    function poseArms(arms) {
      // mittens forward and together, holding the songbook at the chest
      arms.forEach((a, i) => { const sx = i === 0 ? -1 : 1; a.rotation.set(ARM_REST, 0, -sx * 0.36); });
    }
    function songbook() {
      // an open felt songbook: red covers in a shallow V (spine towards the audience, pages facing the singer), cream
      // pages, a gold star on each cover; held in the mittens at the chest, tilted so the singer looks down into it
      const half = [];
      for (const sx of [-1, 1]) {
        half.push(xf(merge([
          xf(box(0.06, 0.08, 0.007, '#b8302d', FELT), [sx * 0.03, 0, 0]),
          xf(box(0.054, 0.072, 0.004, '#fff4e2', FELT), [sx * 0.028, 0, -0.0055]),
          xf(extrude(poly(starPts(0.014, 0.006)), 0.003, '#e3aa3a', GLOSS, 2), [sx * 0.031, 0.007, 0.0035]),
        ]), [0, 0, 0], [0, sx * 0.32, 0]));
      }
      const g = merge(half);
      for (const h of half) h.dispose();
      return xf(g, [0, 0.142, 0.108], [0.55, 0, 0]);
    }
    /** One choir doll as a single geometry (in the doll group's space, so DOLL_K is baked in), arms holding a songbook. */
    function choirGeo(style) {
      const d = buildCharacter(engine.mat, style);
      poseArms(d.arms);
      d.group.updateMatrixWorld(true);
      const geos = [], orig = new Set();
      d.group.traverse((o) => { if (o.isMesh) { orig.add(o.geometry); geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); } });
      geos.push(songbook().applyMatrix4(d.body.matrixWorld));
      for (const g of orig) g.dispose();
      const out = merge(geos);
      for (const g of geos) g.dispose();
      return out;
    }
  },
};

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}
function baubleSvg(col) {
  return `<svg viewBox="0 0 50 54" aria-hidden="true"><path d="M25 2v6" stroke="#8a5a14" stroke-width="2.4"/><rect x="18.5" y="7" width="13" height="8" rx="2.5" fill="#e3aa3a" stroke="#3a2a24" stroke-width="2.2"/><circle cx="25" cy="33" r="18.5" fill="${col}" stroke="#3a2a24" stroke-width="2.6"/><path d="M8.5 29c10 5 23 5 33 0" fill="none" stroke="#fff4e2" stroke-width="2.6" stroke-dasharray="3.4 3" stroke-linecap="round"/><path d="M8 37c10 5 24 5 34 0" fill="none" stroke="#fff4e2" stroke-width="2.6" stroke-dasharray="3.4 3" stroke-linecap="round"/><circle cx="18" cy="24" r="3.6" fill="#fff" opacity=".5"/></svg>`;
}
function bellSvg(col) {
  return `<svg viewBox="0 0 50 54" aria-hidden="true"><path d="M25 4c-3 0-4 2-4 4" fill="none" stroke="#b8302d" stroke-width="3" stroke-linecap="round"/><path d="M25 8c-9 0-13 8-13 17 0 7-3 11-6 14h38c-3-3-6-7-6-14 0-9-4-17-13-17z" fill="${col}" stroke="#3a2a24" stroke-width="2.6" stroke-linejoin="round"/><path d="M12 31h26" stroke="#fff4e2" stroke-width="2.4" stroke-dasharray="3.4 3" stroke-linecap="round"/><circle cx="25" cy="44" r="5" fill="#8a5a14" stroke="#3a2a24" stroke-width="2.2"/><path d="M17 16c2-3 4-4 6-4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55"/><path d="M19 6l-5-3M31 6l5-3" stroke="#3f7a4a" stroke-width="3.2" stroke-linecap="round"/></svg>`;
}
function wreathSvg(col) {
  // a knitted wreath ring with leaf stitches, berries and a bow in the lane's colour
  let leaves = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = 32 + Math.cos(a) * 22, y = 32 + Math.sin(a) * 22;
    leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="4.2" transform="rotate(${((a * 180) / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${i % 2 ? '#3f7a4a' : '#2f5e3e'}" stroke="#1f3a26" stroke-width="1.2"/>`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="rgba(255,244,226,.22)" stroke="#2f5e3e" stroke-width="9"/>${leaves}<circle cx="32" cy="32" r="22" fill="none" stroke="#bfe3b0" stroke-width="1.4" stroke-dasharray="2.5 3.5"/><circle cx="14" cy="22" r="2.6" fill="#c4362f"/><circle cx="50" cy="22" r="2.6" fill="#c4362f"/><circle cx="32" cy="10" r="2.6" fill="#c4362f"/><path d="M32 52l-9-6v10zM32 52l9-6v10z" fill="${col}" stroke="#3a2a24" stroke-width="1.8" stroke-linejoin="round"/><circle cx="32" cy="52" r="3.4" fill="${col}" stroke="#3a2a24" stroke-width="1.8"/></svg>`;
}
