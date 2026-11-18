// Dev tool (not bundled): run the skate bot headless in node to tune difficulty and the star thresholds.
//   node src/minigames/skate/tune.mjs [seeds=8] [bpm=100]
import { buildRoutine } from './routine.js';
import { runHeadless } from './sim.js';

const seeds = +(process.argv[2] || 8);
const bpm = +(process.argv[3] || 100);
for (const portrait of [false, true]) {
  const R0 = buildRoutine({ portrait });
  console.log(`\n${portrait ? 'portrait' : 'landscape'}  max ${runHeadless(R0, 'idle').max}  bpm ${bpm}`);
  for (const mode of ['perfect', 'good', 'sloppy', 'idle']) {
    const runs = [];
    for (let s = 1; s <= (mode === 'perfect' || mode === 'idle' ? 1 : seeds); s++) runs.push(runHeadless(buildRoutine({ portrait }), mode, s, 1 / 30, 60 / bpm));
    const avg = (k) => (runs.reduce((a, r) => a + r[k], 0) / runs.length).toFixed(k === 'ratio' ? 3 : 1);
    const st = [0, 1, 2, 3].map((n) => runs.filter((r) => r.stars === n).length);
    console.log(`${mode.padEnd(8)} ratio ${avg('ratio')} (${Math.min(...runs.map((r) => r.ratio))}–${Math.max(...runs.map((r) => r.ratio))})  stars 0/1/2/3: ${st.join('/')}  P ${avg('perfect')} G ${avg('good')} M ${avg('miss')}  spins ${avg('spins')} (${avg('spinPerfect')} on beat)  line ${runs[0].line.join(',')}  ${runs[0].secs}s`);
  }
}
