// World & time of day (WAVE1.md §World). The town follows the player's local clock: morning → day → golden
// afternoon → blue-hour evening → moonlit night. This module owns the keyframed look (lights, exposure, fog, glow,
// bloom) and writes it into engine.env every frame; src/world/sky.js draws the sky, horizon, moon, stars and clouds.
//   world.timeOfDay (0–24)   world.setTimeOfDay(h)   world.phase ('morning'|'day'|'evening'|'night')
//   world.flyby()            → the little Santa sleigh crosses the moon (night only; returns false otherwise)
//   event: world:phase {phase}
// URL: ?tod=HOURS (start hour instead of the local clock), ?todspeed=N (game hours per real hour, default 1).
import * as THREE from 'three';
import { createSky } from './sky.js';

const C = (h) => new THREE.Color(h);
const D = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// Keyframes, sorted by hour. Colour fields are lerped in linear space, numbers linearly, keyDir by nlerp.
const NIGHT = {
  zen: C('#070d26'), hor: C('#22305f'), bg: C('#1a2550'), hemiSky: C('#8ea4e6'), hemiGround: C('#b9bfd6'), hemiI: 0.98,
  keyCol: C('#b9ccff'), keyI: 1.25, fillCol: C('#5f78d0'), fillI: 0.3, exposure: 0.9, glow: 9.0, bloom: 1.7, bloomThr: 0.95,
  vignette: 0.6, lamp: 1, stars: 1, moon: 1, sun: 0, sunCol: C('#8fa6e8'), field: C('#1c2748'), hill: C('#34416e'), cloud: C('#3b4a7a'),
  keyDir: D(-0.6, 0.72, 0.1), shadowRadius: 2.6,
};
const KEYS = [
  { h: 0, ...NIGHT },
  { h: 5.3, ...NIGHT },
  { // dawn: pink horizon, lamps still on
    h: 6.9, zen: C('#5673ad'), hor: C('#f3c4ae'), bg: C('#c9b6c0'), hemiSky: C('#c9d4f5'), hemiGround: C('#f0e6e2'), hemiI: 1.3,
    keyCol: C('#ffd0b0'), keyI: 1.5, fillCol: C('#9db4ff'), fillI: 0.4, exposure: 0.92, glow: 5, bloom: 1.2, bloomThr: 1.05,
    vignette: 0.7, lamp: 0.7, stars: 0.12, moon: 0.2, sun: 0.8, sunCol: C('#ffb48a'), field: C('#cfc4cf'), hill: C('#b9b3cc'), cloud: C('#f1cfc4'),
    keyDir: D(0.8, 0.3, 0.35), shadowRadius: 3.2,
  },
  { // morning: cool bright white snow, pale blue sky, soft long shadows
    h: 9, zen: C('#8fbbe8'), hor: C('#e6eef7'), bg: C('#dfe8f2'), hemiSky: C('#dfeaff'), hemiGround: C('#f3f0ec'), hemiI: 1.5,
    keyCol: C('#fff3e2'), keyI: 2.1, fillCol: C('#bcd0ff'), fillI: 0.5, exposure: 0.9, glow: 1.6, bloom: 0.55, bloomThr: 1.35,
    vignette: 0.84, lamp: 0.1, stars: 0, moon: 0, sun: 1, sunCol: C('#fff2d8'), field: C('#e4ebf3'), hill: C('#dfe6f0'), cloud: C('#ffffff'),
    keyDir: D(0.72, 0.55, 0.42), shadowRadius: 3.0,
  },
  { // day: bright neutral, crisp
    h: 13, zen: C('#6fa8e6'), hor: C('#d9e8f6'), bg: C('#d3e2f1'), hemiSky: C('#e6efff'), hemiGround: C('#f4f2ee'), hemiI: 1.55,
    keyCol: C('#fffaf2'), keyI: 2.2, fillCol: C('#c6d6ff'), fillI: 0.45, exposure: 0.88, glow: 1.3, bloom: 0.5, bloomThr: 1.4,
    vignette: 0.86, lamp: 0, stars: 0, moon: 0, sun: 1, sunCol: C('#fffbe8'), field: C('#e6edf4'), hill: C('#dce5f0'), cloud: C('#ffffff'),
    keyDir: D(-0.25, 0.86, 0.45), shadowRadius: 1.6,
  },
  { // golden afternoon
    h: 16.5, zen: C('#7f9fd6'), hor: C('#ffd3a0'), bg: C('#ecc9a6'), hemiSky: C('#d3d9f6'), hemiGround: C('#f6e6d6'), hemiI: 1.3,
    keyCol: C('#ffc07a'), keyI: 2.4, fillCol: C('#a6b6f2'), fillI: 0.5, exposure: 0.92, glow: 3.6, bloom: 1.0, bloomThr: 1.2,
    vignette: 0.76, lamp: 0.4, stars: 0, moon: 0, sun: 1, sunCol: C('#ffb060'), field: C('#e9d2bd'), hill: C('#e2c4b4'), cloud: C('#ffd9b8'),
    keyDir: D(-0.82, 0.36, 0.34), shadowRadius: 2.8,
  },
  { // evening / blue hour: the classic Tinselby twilight, windows and string lights on
    h: 18.5, zen: C('#2c3a66'), hor: C('#6d7aa6'), bg: C('#46567a'), hemiSky: C('#c3d3fb'), hemiGround: C('#eeeae6'), hemiI: 1.55,
    keyCol: C('#fff0e0'), keyI: 1.9, fillCol: C('#9db4ff'), fillI: 0.45, exposure: 0.92, glow: 7, bloom: 1.45, bloomThr: 1.02,
    vignette: 0.66, lamp: 1, stars: 0.35, moon: 0.55, sun: 0.3, sunCol: C('#c98a8a'), field: C('#5d6c94'), hill: C('#56648f'), cloud: C('#6f7ba6'),
    keyDir: D(-0.5, 0.84, 0.46), shadowRadius: 2.2,
  },
  { h: 21.2, ...NIGHT },
  { h: 24, ...NIGHT },
];
const COLS = ['zen', 'hor', 'bg', 'hemiSky', 'hemiGround', 'keyCol', 'fillCol', 'sunCol', 'field', 'hill', 'cloud'];
const NUMS = ['hemiI', 'keyI', 'fillI', 'exposure', 'glow', 'bloom', 'bloomThr', 'vignette', 'lamp', 'stars', 'moon', 'sun', 'shadowRadius'];

export const phaseAt = (h) => (h >= 6 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 20.5 ? 'evening' : 'night');
const wrap = (h) => ((h % 24) + 24) % 24;

export function createWorld(ctx) {
  const { engine, game, params } = ctx;
  const look = { keyDir: new THREE.Vector3() };
  for (const k of COLS) look[k] = new THREE.Color();
  for (const k of NUMS) look[k] = 0;

  /** Fill `look` for hour h (no allocations). */
  function sample(h) {
    let i = 0;
    while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
    for (const k of COLS) look[k].copy(a[k]).lerp(b[k], t);
    for (const k of NUMS) look[k] = a[k] + (b[k] - a[k]) * t;
    look.keyDir.copy(a.keyDir).lerp(b.keyDir, t).normalize();
  }

  let tod = 18;
  if (params.has('tod') && Number.isFinite(parseFloat(params.get('tod')))) tod = wrap(parseFloat(params.get('tod')));
  else { const d = new Date(); tod = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
  const speed = Number.isFinite(parseFloat(params.get('todspeed'))) ? parseFloat(params.get('todspeed')) : 1;
  let shown = tod; // the hour actually displayed: eases towards `tod` after setTimeOfDay so the light never pops
  let phase = phaseAt(tod);

  const sky = createSky(ctx);

  function apply() {
    sample(shown);
    const e = engine.env;
    e.hemiSky.copy(look.hemiSky); e.hemiGround.copy(look.hemiGround); e.hemiI = look.hemiI;
    e.keyCol.copy(look.keyCol); e.keyI = look.keyI; e.fillCol.copy(look.fillCol); e.fillI = look.fillI;
    e.exposure = look.exposure; e.bg.copy(look.bg);
    e.glow = look.glow; e.bloom = look.bloom; e.bloomThr = look.bloomThr; e.vignette = look.vignette;
    e.lamp = look.lamp; e.shadowRadius = look.shadowRadius;
    e.keyDir.copy(look.keyDir);
  }

  const world = {
    get timeOfDay() { return tod; },
    get phase() { return phase; },
    /** 0 (day) .. 1 (night): how dark it is (lamps, windows and stars follow this). */
    get night() { return look.lamp; },
    setTimeOfDay(h, instant = false) {
      if (!Number.isFinite(h)) return;
      tod = wrap(h);
      if (instant) shown = tod;
      setPhase();
    },
    /** Santa's sleigh crosses the moon (only when the moon is up). */
    flyby: () => sky.flyby(phaseAt(tod) === 'night' ? 1 : look.moon),
    sky,
  };
  function setPhase() {
    const p = phaseAt(tod);
    if (p === phase) return;
    phase = p;
    game.emit('world:phase', { phase });
    if (p === 'night') sky.queueFlyby(6);
  }

  apply();
  sky.update(0, 0, look);
  engine.addUpdate((dt, t) => {
    tod = wrap(tod + (dt * speed) / 3600);
    // ease the displayed hour along the shortest way round the clock
    let d = tod - shown;
    if (d > 12) d -= 24; else if (d < -12) d += 24;
    shown = Math.abs(d) < 0.002 ? tod : wrap(shown + d * (1 - Math.exp(-dt * 1.6)));
    setPhase();
    apply();
  }, -20);
  // after the camera director (order 100) so the sky is centred on the final camera position
  engine.addUpdate((dt, t) => sky.update(dt, t, look), 110);
  // the wave-1 ending teaser ("Santa's sleigh has been spotted…") also shows in the sky when the moon is up
  game.on('wave:end', () => sky.queueFlyby(2.5));
  return world;
}
