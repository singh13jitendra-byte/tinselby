// Figure Skating: Advent door 9 on Frostmere Lake. Owned by the skate mini-game agent.
// Your own knitted skater glides three glowing patterns (figure eight, heart, snowflake loop) in time with the music.
// Stars sit on the ribbon, one per beat: pass a star on its beat (Perfect 10 / Good 5). Every 8th beat a gold ring:
// twirl inside it on the beat (15, or 8 when off the beat). Staying on the ribbon earns up to 50 per pattern.
// Stars at 30 / 60 / 85 % of the maximum (1290). About 60–75 s of skating depending on the song's tempo.
//
// Controls (one thumb): hold the left / right side of the screen (or drag sideways anywhere) to curve left / right,
// a quick tap anywhere twirls. Desktop: ← → / A D curve, Space twirls; the mouse works like a thumb.
// Portrait phones get narrower, taller patterns and a steeper, further camera (built when the run starts).
//
// Logic lives in routine.js (path + beat map) and sim.js (physics, scoring, bot), both pure so tune.mjs can
// tune them in node. This file is staging: doll, ribbon, stars, rings, trail, camera, DOM, audio, audience.
// Everything hangs off one root group added through mg.add(); geometry, materials, DOM, listeners and the
// window.__skate hook are released on dispose.
import * as THREE from 'three';
import { buildCharacter } from '../../core/player.js';
import { box, cyl, torus, extrude, poly, starPts, part, xf, merge, FELT, GLOW, GLOSS } from '../../core/prims.js';
import { isPortrait } from '../view.js';
import { buildRoutine, toWorld, FIT, BEATS } from './routine.js';
import { createSim, createBot, starsFor, TUNE, STAR_FRAC, runHeadless } from './sim.js';
import './skate.css';

const DOLL_S = 1.15; // like the player
const BLADE_LIFT = 0.017; // blades raise the doll a touch
const OWN_SPB = 0.6; // 100 bpm when the music isn't running (audio off / muted / capture)
const TRAIL_N = 44, TRAIL_DT = 0.045;
const RING_GOLD = '#e3aa3a';
const ICON = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M14 6h11l2 14c6 1 11 3 12 8v3H12z" fill="#a9cfe0" stroke="#3a2a24" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 13h9M14 18h9" stroke="#3a2a24" stroke-width="2" stroke-linecap="round"/><path d="M8 38h32c3 0 5-2 5-4" fill="none" stroke="#8a98a6" stroke-width="3" stroke-linecap="round"/><path d="M16 31v7M33 31v7" stroke="#8a98a6" stroke-width="2.6"/><circle cx="36" cy="12" r="3" fill="#e3aa3a"/><circle cx="41" cy="20" r="2" fill="#e3aa3a"/></svg>';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const frac = (x) => x - Math.floor(x);
const ease = (k) => k * k * (3 - 2 * k);

let lastExit = { time: -1e9 }; // "Play again" starts without a camera hop

export default {
  id: 'skate',
  title: 'Figure Skating',
  district: 'lakeside',
  icon: ICON,
  intro: 'Glide the glowing patterns and pass each star on the beat. Hold left or right (or ← →) to curve. Tap (Space) to twirl inside the gold rings.',
  async start(ctx, mg) {
    const { engine, cam, audio, game } = ctx;
    const params = ctx.params || new URLSearchParams(location.search);
    const sfx = (name, o) => { try { audio?.sfx?.(name, o); } catch (e) { /* audio is optional */ } };
    mg.setPlayerControl(false);
    mg.setPlayerVisible(false);

    const portrait = isPortrait();
    const R = buildRoutine({ portrait });
    const S = createSim(R);
    const ICE_Y = ctx.colliders?.heightAt?.(FIT.x, FIT.z) ?? 0.05;
    const W = (u, v, y = ICE_Y) => { const p = toWorld(u, v); return V.set(p.x, y, p.z); };
    const V = new THREE.Vector3(), V2 = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();

    const root = mg.add(new THREE.Group());
    root.name = 'skate';
    const owned = [];
    const own = (x) => { owned.push(x); return x; };

    // ------------------------------------------------------------------ the skater doll (player's style) + blades
    const ch = buildCharacter(engine.mat, game.state.style || {});
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

    // ------------------------------------------------------------------ ribbon: one strip for the whole routine, dashed + faded in the shader
    const ribbonMat = own(new THREE.ShaderMaterial({
      // premultiplied blend: the live dashes cover the pale ice with saturated gold (plain additive washed out to cream
      // on the bright ice); alpha 0 parts (the icy preview of the next pattern) still add like before
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uS: { value: 0 }, uA: { value: 0 }, uB: { value: 0 }, uC: { value: 0 }, uT: { value: 0 }, uK: { value: 0 } },
      vertexShader: 'attribute float aS; attribute float aX; varying float vS; varying float vX; void main() { vS = aS; vX = aX; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uS, uA, uB, uC, uT, uK; varying float vS; varying float vX;
        void main() {
          float stitch = smoothstep(0.08, 0.16, fract(vS / 0.17)) * (1.0 - smoothstep(0.62, 0.7, fract(vS / 0.17)));
          float edge = 1.0 - smoothstep(0.45, 1.0, abs(vX));
          float ahead = vS - uS;
          vec3 gold = vec3(1.0, 0.55, 0.09), ice = vec3(0.55, 0.78, 1.0);
          vec3 c = vec3(0.0);
          float a = 0.0; // how much of the ice the dash covers
          if (vS >= uA && vS <= uB) {
            if (ahead < -0.15) { c = gold * 0.42; a = 0.4; } // already skated: a dim amber stitch
            else { float near = 1.0 - clamp(ahead / 7.0, 0.0, 1.0); c = gold * mix(1.25, 1.5, near); a = 0.95; }
          } else if (vS > uB && vS <= uC) c = ice * 0.32;
          float m = stitch * edge * (0.82 + 0.18 * sin(vS * 7.0 - uT * 4.0)) * uK;
          gl_FragColor = vec4(c * m, a * m);
        }`,
    }));
    const ribbon = new THREE.Mesh(own(ribbonGeo()), ribbonMat);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 2;
    root.add(ribbon);

    // ------------------------------------------------------------------ beat stars (instanced, one pattern at a time), twirl rings, approach cues
    const starGeo = own(merge([
      xf(extrude(poly(starPts(0.075, 0.034)), 0.016, RING_GOLD, FELT, 2), [0, 0, -0.008]),
      ...[1, -1].map((sd) => xf(part(new THREE.ShapeGeometry(poly(starPts(0.056, 0.026))), '#7a4c10', GLOW), [0, 0, sd * 0.0092], [0, sd > 0 ? 0 : Math.PI, 0])),
    ]));
    const stars = new THREE.InstancedMesh(starGeo, engine.mat, BEATS);
    const ringGeo = own(merge([
      xf(torus(0.4, 0.022, '#b8302d', FELT, Math.PI * 2, 30, 5), [0, 0, 0], [Math.PI / 2, 0, 0]),
      xf(torus(0.365, 0.01, '#8a5a14', GLOW, Math.PI * 2, 30, 4), [0, 0.006, 0], [Math.PI / 2, 0, 0]),
      ...[0, 1, 2, 3, 4, 5].map((k) => xf(part(new THREE.ShapeGeometry(poly(starPts(0.03, 0.014))), '#8a5a14', GLOW), [Math.cos(k * 1.047) * 0.4, 0.024, Math.sin(k * 1.047) * 0.4], [-Math.PI / 2, 0, 0])),
    ]));
    const ringsPer = BEATS / 8;
    const rings = new THREE.InstancedMesh(ringGeo, engine.mat, ringsPer);
    const cueMat = own(new THREE.MeshBasicMaterial({ color: '#ffd89a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const cues = new THREE.InstancedMesh(own(new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2)), cueMat, 2);
    for (const m of [stars, rings, cues]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; root.add(m); }
    stars.setColorAt(0, C.set('#ffffff'));
    cues.setColorAt(0, C.set('#000000'));
    rings.receiveShadow = true;

    // ------------------------------------------------------------------ glow trail behind the blades
    const trailPos = new Float32Array(TRAIL_N * 2 * 3), trailCol = new Float32Array(TRAIL_N * 2 * 3);
    const trailGeo = own(new THREE.BufferGeometry());
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3).setUsage(THREE.DynamicDrawUsage));
    const tIdx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    trailGeo.setIndex(tIdx);
    const trail = new THREE.Mesh(trailGeo, own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
    trail.frustumCulled = false;
    trail.renderOrder = 3;
    root.add(trail);
    const trailPts = []; // newest first: {x, z, dx, dz}
    let trailAcc = 0;

    // ------------------------------------------------------------------ DOM: touch layer, curve pads, beat lamp, hint, labels, banner
    const touch = params.has('sktouch') || engine.isMobile || matchMedia('(pointer: coarse)').matches;
    const ui = document.createElement('div');
    ui.className = 'sk-ui';
    ctx.uiRoot.insertBefore(ui, ctx.uiRoot.querySelector('.mg-layer'));
    const layer = el('div', 'sk-touch', ui);
    const padL = el('div', 'sk-pad l', ui), padR = el('div', 'sk-pad r', ui);
    padL.innerHTML = arrowSvg(-1); padR.innerHTML = arrowSvg(1);
    if (!touch) { padL.classList.add('mini'); padR.classList.add('mini'); }
    const lamp = el('div', 'sk-beat', ui);
    const lampDot = el('div', 'sk-dot', lamp);
    const lampTxt = el('div', 'sk-cue', ui);
    const hint = el('div', 'knit-card sk-hint', ui);
    hint.innerHTML = touch ? 'Hold a side to curve · quick tap to twirl' : 'Curve with <kbd>←</kbd><kbd>→</kbd> · twirl with <kbd>Space</kbd>';
    const banner = el('div', 'sk-banner', ui);
    const labels = [];

    // pointers: hold a half = curve that way, drag sideways = analog curve, quick tap = twirl (multi-touch friendly)
    const ptrs = new Map();
    let twirlReq = false;
    const keys = { l: false, r: false };
    layer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ptrs.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), drag: false, side: e.clientX < innerWidth / 2 ? 1 : -1 });
      try { layer.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ }
    });
    layer.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.abs(p.x - p.x0) > 12) p.drag = true;
    });
    const up = (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      ptrs.delete(e.pointerId);
      if (e.type === 'pointerup' && performance.now() - p.t0 < 180 && Math.hypot(p.x - p.x0, p.y - p.y0) < 12) twirlReq = true;
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(ev, up);
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    const keyMap = (k) => (k === 'a' || k === 'arrowleft' ? 'l' : k === 'd' || k === 'arrowright' ? 'r' : null);
    mg.onKey((e) => {
      const k = keyMap(e.key.toLowerCase());
      if (k) { keys[k] = true; e.preventDefault(); }
      if ((e.key === ' ' || e.code === 'Space') && !e.repeat) { twirlReq = true; e.preventDefault(); }
    });
    const onKeyUp = (e) => { const k = keyMap(e.key.toLowerCase()); if (k) keys[k] = false; };
    const onBlur = () => { keys.l = keys.r = false; ptrs.clear(); };
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    function playerSteer() {
      const now = performance.now();
      const full = Math.max(48, Math.min(innerWidth, innerHeight) * 0.12);
      let s = (keys.l ? 1 : 0) - (keys.r ? 1 : 0);
      let l = false, r = false;
      for (const p of ptrs.values()) {
        let v = 0;
        if (p.drag) v = clamp(-(p.x - p.x0) / full, -1, 1);
        else if (now - p.t0 > 110) v = p.side;
        s += v;
        if (v > 0.2) l = true; else if (v < -0.2) r = true;
      }
      padL.classList.toggle('on', l || keys.l);
      padR.classList.toggle('on', r || keys.r);
      return clamp(s, -1, 1);
    }

    // ------------------------------------------------------------------ audience: lakeside people step off the ice and gather round the rim
    const showLake = ctx.life?.hideDistrict ? ctx.life.hideDistrict('lakeside') : () => {};
    try { ctx.life?.gatherAt?.(14.6, 1.6, 4.6); } catch (e) { /* life is optional */ }
    const cheer = () => { if (ctx.life?.cheer) { try { ctx.life.cheer(); } catch (e) { /* optional */ } } else sfx('cheer', { vol: 0.6 }); };

    // ------------------------------------------------------------------ camera: one long shot from the south shore, gently following
    const quick = engine.time - lastExit.time < 2.5;
    const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), gPos = new THREE.Vector3(), gTgt = new THREE.Vector3();
    camGoal(gPos, gTgt);
    camPos.copy(gPos); camTgt.copy(gTgt);
    cam.playShot({
      name: 'skate', duration: 1e6, blendIn: quick ? 0.0001 : 1.1, blendOut: 0.6, skippable: false, tilt: 0.7, portrait: false,
      update(u, out) { out.pos.copy(camPos); out.target.copy(camTgt); },
    });

    // ------------------------------------------------------------------ state
    let phase = 'intro', T = 0, endT = 0, ffing = false, lastAudio = null, audioLive = false, spb = OWN_SPB;
    let botMode = null, bot = null, forceSteer = null, dispPat = -1, lastBeat = -99, iceT = 0, goalKey = '', shownSec = -1;
    let starsShown = 0, banT = 0, hintT = 0;
    const resT = new Map(); // star → time it was resolved (pop animation)
    const thr = STAR_FRAC.map((f) => Math.ceil(f * S.max));
    if (params.has('mgauto')) setBot(params.get('skbot') || 'perfect');

    mg.addUpdate(update);
    mg.onDispose(dispose);
    exposeDebug();
    showPattern(0);

    await mg.intro();
    if (mg.finished) return;
    phase = 'play';
    S.running = true;
    mg.hud.setScore(0);
    mg.hud.setTimer((R.bEnd - S.b) * spb);
    setGoal('Skate the glowing ribbon');
    hintT = 7;

    // ================================================================== per-frame
    function update(dt) {
      dt = Math.min(dt, 0.05);
      T += dt;
      if (phase === 'play') {
        const clk = clock(dt);
        const inp = bot ? bot(dt) : { steer: forceSteer ?? playerSteer(), twirl: false };
        if (bot) playerSteer(); // keep the pads in sync with the keys
        if (twirlReq) { inp.twirl = true; twirlReq = false; }
        // sub-step so the physics doesn't care about the frame rate
        const n = Math.max(1, Math.ceil(dt / (1 / 30)));
        for (let k = 0; k < n; k++) S.step(dt / n, inp, { spb: clk.spb, phase: clk.phase / n });
        drainEvents();
        hud(dt);
        if (S.done) beginEnd();
      } else if (phase === 'end') {
        endT += dt;
        if (endT > 1.6) finishGame();
      } else twirlReq = false;
      poseDoll(dt);
      updateTrail(dt);
      updateMarks();
      updateRibbon(dt);
      updateLabels(dt);
      updateCamera(dt);
    }

    /** Beat clock: lock to the music's beat when it's playing (audio.beat()), else our own 100 bpm. */
    function clock(dt) {
      const bt = !engine.capture && !ffing ? audio?.beat?.() : null;
      let phaseCorr = 0;
      audioLive = false;
      if (bt && bt.spb > 0.25 && bt.spb < 1.5) {
        const adv = lastAudio == null ? 0 : bt.now - lastAudio;
        lastAudio = bt.now;
        if (adv > dt * 0.3 && adv < 0.5) { // the audio clock is really running (not suspended / muted)
          audioLive = true;
          spb = bt.spb;
          const ph = (bt.now - bt.start) / bt.spb;
          let err = frac(ph) - frac(S.b);
          if (err > 0.5) err -= 1; else if (err < -0.5) err += 1;
          phaseCorr = err * Math.min(1, dt * 4);
        }
      } else lastAudio = null;
      if (!audioLive) spb += (OWN_SPB - spb) * Math.min(1, dt * 2);
      return { spb, phase: phaseCorr };
    }

    function drainEvents() {
      for (const ev of S.events) {
        if (ev.type === 'star') {
          resT.set(ev.star, T);
          const p = W(ev.star.u, ev.star.v, ICE_Y + 0.22);
          if (ev.grade === 'perfect') {
            label(p, 'Perfect!', 'good');
            sfx('bell', { vol: 0.42 });
            if (ev.streak === 4 || (ev.streak > 4 && ev.streak % 8 === 4)) { cheer(); label(W(S.u, S.v, ICE_Y + 0.62).clone(), `${ev.streak} in a row!`, 'small'); }
          } else if (ev.grade === 'good') { label(p, 'Good', 'ok'); sfx('bell', { vol: 0.18 }); }
          else label(p, '·', 'miss');
          mg.hud.setScore(S.score);
          checkStars();
        } else if (ev.type === 'ring') {
          resT.set(ev.star, T);
          if (ev.grade === 'miss') continue;
          label(W(S.u, S.v, ICE_Y + 0.66).clone(), ev.grade === 'perfect' ? 'Twirl! +15' : 'Twirl +8', ev.grade === 'perfect' ? 'big' : 'good');
          sfx('bell', { vol: 0.6 });
          sfx('pop', { vol: 0.5, delay: 0.08 });
          mg.hud.setScore(S.score);
          checkStars();
        } else if (ev.type === 'twirl') {
          // free twirl (no ring in reach): still a lovely spin
        } else if (ev.type === 'patternEnd') {
          label(W(S.u, S.v, ICE_Y + 0.8).clone(), `On the line +${ev.bonus}`, 'small');
          sfx('sleighBells', { vol: 0.45 });
          mg.hud.setScore(S.score);
          checkStars();
        } else if (ev.type === 'pattern') {
          showPattern(ev.index);
          banner.textContent = R.patterns[ev.index].name;
          banner.classList.remove('on'); void banner.offsetWidth; banner.classList.add('on');
          banT = 2.2;
        }
      }
      S.events.length = 0;
    }
    function checkStars() {
      while (starsShown < 3 && S.score >= thr[starsShown]) {
        starsShown++;
        label(W(S.u, S.v, ICE_Y + 0.95).clone(), '★'.repeat(starsShown), 'big');
      }
    }
    function setGoal(t) { if (t !== goalKey) { goalKey = t; mg.hud.setGoal(t); } }
    function hud(dt) {
      const left = Math.max(0, (R.bEnd - S.b) * spb);
      const s = Math.ceil(left);
      if (s !== shownSec) { shownSec = s; mg.hud.setTimer(left); }
      if (hintT > 0 && (hintT -= dt) <= 0) hint.classList.add('off');
      if (banT > 0) banT -= dt;
      if (S.b > 1.5 || hintT <= 3) {
        const P = R.patterns.find((x) => S.b < x.b1);
        const next = starsShown < 3 ? `${'★'.repeat(starsShown + 1)} at ${thr[starsShown]}` : '★★★ Brilliant!';
        if (!P) setGoal(next);
        else if (S.b < P.b0) setGoal(`Next: ${P.name}`);
        else setGoal(portrait ? next : `${P.name} · ${next}`);
      }
      // beat lamp: pulse on each beat, count in the next twirl ring
      const beat = Math.floor(S.b + 0.02);
      if (beat !== lastBeat) {
        lastBeat = beat;
        lamp.classList.remove('pulse'); void lamp.offsetWidth; lamp.classList.add('pulse');
      }
      const ring = R.stars.find((st) => st.ring && !st.used && st.b > S.b - 0.4);
      const toRing = ring ? ring.b - S.b : 99;
      const txt = toRing <= 0.45 ? 'Twirl!' : toRing <= 3.45 ? String(Math.ceil(toRing - 0.45)) : '';
      if (lampTxt.textContent !== txt) { lampTxt.textContent = txt; lampTxt.classList.toggle('now', txt === 'Twirl!'); }
      lamp.classList.toggle('ring', toRing <= 3.45);
      // gentle glide hiss on the beat
      if ((iceT -= dt) <= 0 && S.sp > 0.2) { iceT = spb * 2; sfx('ice', { vol: 0.22 }); }
    }
    function beginEnd() {
      if (phase !== 'play') return;
      phase = 'end';
      endT = 0;
      cheer();
      setGoal(S.stars() >= 3 ? 'Brilliant skating!' : S.stars() >= 1 ? 'Lovely skating!' : 'Nearly there!');
      mg.hud.setTimer(0);
    }
    function finishGame() {
      if (phase === 'done') return;
      phase = 'done';
      const stars = S.stars();
      const name = game.state.playerName || 'skater';
      const lines = [
        'Keep practising: the music helps!',
        `Ilse claps for you, ${name}!`,
        `Graceful as a snowflake, ${name}!`,
        `A perfect routine, ${name}! Frostmere is cheering.`,
      ];
      mg.finish({ score: S.score, stars, text: `${S.perfect} Perfect · ${S.good} Good · ${S.spins} twirl${S.spins === 1 ? '' : 's'} in the rings. ${lines[stars]}` });
    }

    // ------------------------------------------------------------------ doll pose
    function poseDoll(dt) {
      const p = W(S.u, S.v, ICE_Y + BLADE_LIFT);
      skater.position.copy(p);
      const yaw = Math.atan2(Math.cos(S.h), -Math.sin(S.h));
      let spin = 0, tw = 0;
      if (S.twirlT >= 0) { tw = S.twirlT / TUNE.twirlDur; spin = ease(tw) * Math.PI * 4; }
      ch.yaw.rotation.y = yaw + spin;
      const [aL, aR] = ch.arms, [lL, lR] = ch.legs;
      const b = S.b, beatK = Math.sin(Math.PI * frac(b));
      const up = Math.sin(Math.PI * Math.min(1, tw * 1.25));
      const fin = phase === 'end' || phase === 'done' ? Math.min(1, endT * 2) : 0;
      const idle = phase === 'intro' ? 1 : 0;
      ch.body.rotation.z = lerp(ch.body.rotation.z, clamp(-S.omega * 0.09, -0.22, 0.22), 1 - Math.exp(-dt * 6)) * (1 - up);
      ch.body.rotation.x = lerp(0.14, 0.02, Math.max(up, fin, idle * 0.6));
      ch.body.position.y = 0;
      const out = lerp(1.25, 0.45, idle) + Math.sin(b * Math.PI) * 0.06;
      aL.rotation.set(-0.15 + 0.1 * beatK, 0, lerp(lerp(-out, -2.75, up), -2.5, fin));
      aR.rotation.set(-0.15 + 0.1 * beatK, 0, lerp(lerp(out, 2.75, up), 2.5, fin));
      // stroke: one blade pushes back on each beat, alternating; twirl tucks the free leg
      const push = phase === 'play' && S.twirlT < 0 ? 0.42 * beatK : 0;
      const left = Math.floor(b) % 2 === 0;
      lL.rotation.x = left ? push : 0;
      lR.rotation.x = (left ? 0 : push) + 0.55 * up;
      ch.body.scale.y = idle ? 1 + Math.sin(T * 2.2) * 0.012 : 1;
    }

    function updateTrail(dt) {
      trailAcc += dt;
      if (phase === 'play' && trailAcc >= TRAIL_DT && S.sp > 0.05) {
        trailAcc = 0;
        const p = toWorld(S.u, S.v);
        trailPts.unshift({ x: p.x, z: p.z, dx: Math.cos(S.h), dz: -Math.sin(S.h) });
        if (trailPts.length > TRAIL_N) trailPts.pop();
      } else if (phase !== 'play' && trailAcc >= TRAIL_DT && trailPts.length) { trailAcc = 0; trailPts.pop(); }
      const y = ICE_Y + 0.004;
      for (let i = 0; i < TRAIL_N; i++) {
        const q = trailPts[Math.min(i, trailPts.length - 1)];
        const o = i * 6;
        if (!q) { trailPos.fill(0, o, o + 6); trailCol.fill(0, o, o + 6); continue; }
        const k = i < trailPts.length ? 1 - i / TRAIL_N : 0;
        const w = 0.012 + 0.03 * k;
        trailPos[o] = q.x - q.dz * w; trailPos[o + 1] = y; trailPos[o + 2] = q.z + q.dx * w;
        trailPos[o + 3] = q.x + q.dz * w; trailPos[o + 4] = y; trailPos[o + 5] = q.z - q.dx * w;
        const c = k * k;
        trailCol[o] = trailCol[o + 3] = 1.0 * c; trailCol[o + 1] = trailCol[o + 4] = 0.72 * c; trailCol[o + 2] = trailCol[o + 5] = 0.42 * c;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
    }

    // ------------------------------------------------------------------ stars, rings, approach cues
    function showPattern(p) {
      if (p === dispPat || p < 0 || p >= R.patterns.length) return;
      dispPat = p;
      stars.count = BEATS;
      rings.count = ringsPer;
    }
    function updateMarks() {
      if (dispPat < 0) return;
      // switch to the next pattern's stars once this pattern's last star is scored
      const P = R.patterns[dispPat];
      if (S.b > P.b1 + 0.8 && dispPat + 1 < R.patterns.length) showPattern(dispPat + 1);
      const base = dispPat * BEATS;
      const camP = engine.camera.position;
      const b = S.b;
      const pulse = Math.exp(-frac(b) * 5);
      let ri = 0, ci = 0;
      for (let k = 0; k < BEATS; k++) {
        const st = R.stars[base + k];
        const p = W(st.u, st.v);
        let s = 1, y = ICE_Y + 0.1 + Math.sin(T * 2 + k) * 0.008;
        const appear = dispPat === 0 ? 1 : clamp((b - (R.patterns[dispPat].b0 - 3) - k * 0.06) * 2, 0, 1);
        s *= ease(appear);
        const ahead = st.b - b;
        if (!st.res) {
          s *= ahead < 2.5 ? 1 + 0.25 * pulse : 0.78;
          C.set(1, 1, 1).multiplyScalar(ahead < 2.5 ? 1.15 : 0.8);
        } else {
          const a = (T - (resT.get(st) ?? T)) / 0.35;
          if (st.res === 'miss') { s *= 0.5; C.setRGB(0.42, 0.44, 0.52); }
          else { s *= a < 1 ? 1 + a * 0.9 : 0; y += Math.min(1, a) * 0.12; C.setRGB(1.3, 1.2, 1.0); }
        }
        E.set(0, Math.atan2(camP.x - p.x, camP.z - p.z), 0);
        Q.setFromEuler(E);
        SC.setScalar(Math.max(1e-4, s));
        M4.compose(V2.set(p.x, y, p.z), Q, SC);
        stars.setMatrixAt(k, M4);
        stars.setColorAt(k, C);
        if (st.ring) {
          let rs = ease(appear), rot = T * 0.4;
          if (st.used) {
            const a = (T - (resT.get(st) ?? T)) / 0.5;
            rs *= a < 1 ? 1 + a * 0.5 : 0;
            rot += Math.min(1, a) * 3;
            if (a >= 1) rs = 0;
          } else if (Math.abs(ahead) < 1.2) rs *= 1 + 0.12 * pulse;
          E.set(0, rot, 0);
          Q.setFromEuler(E);
          SC.setScalar(Math.max(1e-4, rs));
          M4.compose(V2.set(p.x, ICE_Y + 0.008, p.z), Q, SC);
          rings.setMatrixAt(ri++, M4);
        }
        // approach cue: a soft ring closes onto the next stars as their beat arrives
        if (!st.res && ahead > 0 && ahead < 1.5 && ci < 2 && phase === 'play') {
          const r = 0.09 + 0.3 * (ahead / 1.5);
          SC.set(r, 1, r);
          M4.compose(V2.set(p.x, ICE_Y + 0.007, p.z), Q.identity(), SC);
          cues.setMatrixAt(ci, M4);
          cues.setColorAt(ci, C.setRGB(1, 1, 1).multiplyScalar(0.25 + 0.6 * (1 - ahead / 1.5)));
          ci++;
        }
      }
      rings.count = ri;
      cues.count = ci;
      stars.instanceMatrix.needsUpdate = true;
      if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
      rings.instanceMatrix.needsUpdate = true;
      cues.instanceMatrix.needsUpdate = true;
      if (cues.instanceColor) cues.instanceColor.needsUpdate = true;
    }
    function updateRibbon(dt) {
      const u = ribbonMat.uniforms;
      const P = R.patterns[Math.max(0, dispPat)];
      const nextP = R.patterns[dispPat + 1];
      u.uS.value = S.sProj;
      u.uA.value = dispPat > 0 ? R.patterns[dispPat - 1].s1 : 0; // the connector (or lead-in) glows with its pattern
      u.uB.value = P.s1 + 0.02;
      u.uC.value = nextP && S.b > P.b1 - 8 ? nextP.s1 : P.s1; // preview the next pattern near the end
      if (!nextP && S.b > P.b1) u.uC.value = R.L; // the closing glide
      u.uT.value = T;
      u.uK.value = Math.min(1, u.uK.value + dt * 1.5);
    }

    // ------------------------------------------------------------------ DOM labels
    function label(p, text, cls) {
      const node = el('div', 'sk-pop ' + (cls || ''), ui);
      node.textContent = text;
      labels.push({ node, p: p.clone(), t: 0 });
      while (labels.length > 7) labels.shift().node.remove();
      place(node, p);
    }
    function updateLabels(dt) {
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i];
        l.t += dt;
        if (l.t > 1.1) { l.node.remove(); labels.splice(i, 1); continue; }
        place(l.node, l.p);
      }
    }
    function place(node, p) {
      V2.copy(p).project(engine.camera);
      let x = ((V2.x + 1) / 2) * innerWidth, y = ((1 - V2.y) / 2) * innerHeight;
      x = clamp(x, 60, innerWidth - 60);
      y = clamp(y, portrait || isPortrait() ? 140 : 80, innerHeight - 110);
      node.style.left = `${x.toFixed(1)}px`;
      node.style.top = `${y.toFixed(1)}px`;
    }

    // ------------------------------------------------------------------ camera
    function camGoal(pos, tgt) {
      const por = clamp(cam.portrait ?? (isPortrait() ? 1 : 0), 0, 1);
      const p = toWorld(S.u, S.v);
      const follow = lerp(0.35, 0.12, por);
      const fx = FIT.x + (p.x - FIT.x) * follow, fz = FIT.z + (p.z - FIT.z) * follow * 0.6;
      const fov = THREE.MathUtils.degToRad(engine.camera.fov || 32);
      const tanH = Math.tan(fov / 2) * Math.max(0.3, engine.camera.aspect || 1.7);
      const halfW = R.ru * 0.9 * (1 - follow) + lerp(0.75, 0.5, por); // portrait: a touch closer so the doll reads
      const pitch = THREE.MathUtils.degToRad(lerp(25, 52, por));
      const dist = clamp(Math.max(lerp(7.4, 8.5, por), halfW / tanH), 6, 15);
      const lookN = lerp(0.2, 0.45, por); // aim a little north so the pattern sits above the thumb controls
      tgt.set(fx, ICE_Y + 0.1, fz - lookN);
      pos.set(fx, ICE_Y + 0.1 + Math.sin(pitch) * dist, fz - lookN + Math.cos(pitch) * dist);
    }
    function updateCamera(dt) {
      camGoal(gPos, gTgt);
      const k = 1 - Math.exp(-dt * 2.2);
      camPos.lerp(gPos, k);
      camTgt.lerp(gTgt, k);
    }

    // ------------------------------------------------------------------ cleanup
    function dispose() {
      lastExit = { time: engine.time };
      const lp = camPos.clone(), lt = camTgt.clone();
      cam.playShot({ name: 'skate-out', duration: 0.8, blendIn: 0.0001, blendOut: 0.8, skippable: false, tilt: 0.7, portrait: false, update(u, out) { out.pos.copy(lp); out.target.copy(lt); } });
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      try { ctx.life?.release?.(); } catch (e) { /* optional */ }
      showLake();
      for (const l of labels) l.node.remove();
      labels.length = 0;
      ptrs.clear();
      ui.remove();
      ch.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const o of owned) o.dispose?.();
      owned.length = 0;
      stars.dispose(); rings.dispose(); cues.dispose();
      if (window.__skate && window.__skate._owner === root) delete window.__skate;
    }

    // ------------------------------------------------------------------ test hooks (window.__skate)
    function setBot(mode) {
      botMode = mode || null;
      bot = botMode ? createBot(R, S, botMode, 7) : null;
      return botMode;
    }
    function exposeDebug() {
      const api = {
        _owner: root,
        get state() {
          return {
            phase, b: +S.b.toFixed(2), pattern: S.pat, score: S.score, max: S.max, ratio: +(S.score / S.max).toFixed(3), stars: S.stars(),
            perfect: S.perfect, good: S.good, miss: S.miss, twirls: S.twirls, spins: S.spins, spinPerfect: S.spinPerfect, streak: S.streak, bestStreak: S.bestStreak,
            u: +S.u.toFixed(2), v: +S.v.toFixed(2), lat: +S.lat.toFixed(3), speed: +S.sp.toFixed(2), audioLive, spb: +spb.toFixed(3),
            secsLeft: +Math.max(0, (R.bEnd - S.b) * spb).toFixed(1), bot: botMode, portrait, routine: { bEnd: R.bEnd, stars: R.stars.length, length: +R.L.toFixed(1), patterns: R.patterns.map((x) => x.name) },
          };
        },
        /** 'perfect' | 'good' | 'sloppy' | 'idle' | null (back to the player). */
        bot: setBot,
        steer(v) { forceSteer = v == null ? null : clamp(v, -1, 1); },
        twirl() { twirlReq = true; },
        /** Advance the game without rendering (all engine updates run; music sync is off meanwhile). */
        ff(sec, step = 1 / 30) {
          ffing = true;
          try { for (let i = 0, n = Math.round(sec / step); i < n; i++) { engine.time += step; for (const u of engine.updates.slice()) u.fn(step, engine.time); } } finally { ffing = false; }
          return api.state;
        },
        /** Headless bot runs on a fresh routine (no scene): [{ mode, ratio, stars, … }]. */
        sim(modes = ['perfect', 'good', 'sloppy', 'idle'], seeds = 3) {
          const out = [];
          for (const m of modes) for (let s = 1; s <= (m === 'perfect' || m === 'idle' ? 1 : seeds); s++) out.push(runHeadless(buildRoutine({ portrait }), m, s, 1 / 30, OWN_SPB));
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
        tune: TUNE,
        starsFor,
      };
      window.__skate = api;
    }

    // ------------------------------------------------------------------ geometry
    function ribbonGeo() {
      const step = 4, half = 0.036, y = ICE_Y + 0.006;
      const rows = Math.floor((R.n - 1) / step) + 1;
      const pos = new Float32Array(rows * 2 * 3), aS = new Float32Array(rows * 2), aX = new Float32Array(rows * 2);
      const idx = [];
      for (let r = 0; r < rows; r++) {
        const i = Math.min(R.n - 1, r * step);
        const p = toWorld(R.u[i], R.v[i]);
        const nx = -Math.sin(R.hd[i]), nv = Math.cos(R.hd[i]); // left normal in (u, v)
        const ox = nx * half, oz = -nv * half;
        pos.set([p.x + ox, y, p.z + oz, p.x - ox, y, p.z - oz], r * 6);
        aS[r * 2] = aS[r * 2 + 1] = R.s[i];
        aX[r * 2] = 1; aX[r * 2 + 1] = -1;
        if (r < rows - 1) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
      g.setAttribute('aX', new THREE.BufferAttribute(aX, 1));
      g.setIndex(idx);
      return g;
    }
  },
};

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}
function arrowSvg(dir) {
  // a curved arrow sweeping left (dir −1) or right (dir 1)
  const t = dir < 0 ? '' : ' transform="matrix(-1 0 0 1 48 0)"';
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><g${t}><path d="M36 36c0-12-7-20-19-20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M20 7l-9 9 9 9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}
