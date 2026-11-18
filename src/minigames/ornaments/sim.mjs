// Pacing / stars Monte-Carlo for the Ornament Hunt (pure node: `node src/minigames/ornaments/sim.mjs`).
// It models players, not physics: walking 1.9 m/s, reading time, chance to solve the riddle, guided search by the warm/cold meter,
// the sparkle beam at BEAM_T and "Show me" at SHOW_T. Same order rules as index.js (first clue >= 4.5 m from the start, then nearest next).
import { SPOTS } from './clues.js';
import { TIME, BEAM_T, SHOW_T, scoreFor, starsFor } from './rules.js';

let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const expo = (mean) => -Math.log(1 - rnd()) * mean;
const SPEED = 1.9, START = { x: 0, z: 3.6 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function pickFive() {
  const pool = SPOTS.slice().sort(() => rnd() - 0.5), chosen = [];
  for (const minD of [3.2, 2.2, 0]) { for (const s of pool) if (chosen.length < 5 && !chosen.includes(s) && chosen.every((c) => dist(c, s) >= minD)) chosen.push(s); if (chosen.length >= 5) break; }
  const far = chosen.filter((s) => dist(s, START) >= 4.5), rest = chosen.slice(), order = []; let cur = START;
  const nn = (l) => l.reduce((b, s) => (dist(s, cur) < dist(b, cur) ? s : b));
  while (rest.length) { const s = order.length ? nn(rest) : nn(far.length ? far : rest); order.push(s); rest.splice(rest.indexOf(s), 1); cur = s; }
  return order;
}

// profile: read = seconds to read + think; solve = chance the riddle points straight at the landmark;
// guided = mean search time when it does not (the meter helps); detour = path wiggle; useShow = taps Show me when it appears.
const PROFILES = {
  expert:     { read: 3.5, solve: 0.95, guided: 10, detour: 1.15, useShow: false, beam: 'seen' },
  good:       { read: 5,   solve: 0.7,  guided: 16, detour: 1.25, useShow: false, beam: 'seen' },
  average:    { read: 7,   solve: 0.4,  guided: 24, detour: 1.35, useShow: true,  beam: 'seen' },
  firstTimer: { read: 9,   solve: 0.15, guided: 34, detour: 1.5,  useShow: true,  beam: 'seen' },
};

function run(p, TIMEc = TIME) {
  const order = pickFive(); let t = 0, pos = START, found = 0, shows = 0;
  for (const s of order) {
    const walk = (dist(pos, s) * p.detour) / SPEED;
    let tFind; // time on this clue until the ornament is in hand
    if (rnd() < p.solve) tFind = p.read + walk + 1;
    else {
      const search = p.read + Math.max(5, expo(p.guided));
      tFind = search + Math.min(6, walk * 0.4) + 1;
      if (tFind > BEAM_T + 3) { // the beam rises at BEAM_T: from then on the player walks straight to it
        tFind = Math.min(tFind, BEAM_T + Math.max(2, walk * 0.7) + 1.5);
        if (p.useShow && tFind > SHOW_T) { shows++; tFind = SHOW_T + 3; }
      }
    }
    if (t + tFind > TIMEc) return { found, secs: 0, shows };
    t += tFind; found++; pos = s;
  }
  return { found, secs: Math.floor(TIMEc - t), shows };
}

const N = 6000;
for (const T of [90, TIME]) {
  console.log(`\n=== run length ${T}s (BEAM ${BEAM_T}s, Show me ${SHOW_T}s) ===`);
  for (const [name, p] of Object.entries(PROFILES)) {
    const star = [0, 0, 0, 0]; let secs = 0, found = 0, shows = 0, score = 0, all5 = 0;
    for (let i = 0; i < N; i++) { const r = run(p, T); const st = starsFor(r); star[st]++; secs += r.secs; found += r.found; shows += r.shows; score += scoreFor(r); if (r.found >= 5) all5++; }
    console.log(name.padEnd(11), 'avg found', (found / N).toFixed(2), '| all5', ((all5 / N) * 100).toFixed(0) + '%', '| avg secs left', (secs / N).toFixed(0), '| show-me', (shows / N).toFixed(2), '| score', (score / N).toFixed(0),
      '| stars 0/1/2/3 %', star.map((c) => ((c / N) * 100).toFixed(0)).join('/'));
  }
}
