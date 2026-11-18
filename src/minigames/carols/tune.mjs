// Dev tool (not bundled): chart stats + the carols bot headless in node, to tune timing and the star thresholds.
//   node src/minigames/carols/tune.mjs [seeds=10]
import { chartStats } from './chart.js';
import { runHeadless, STAR_FRAC } from './sim.js';

const seeds = +(process.argv[2] || 10);
console.log('charts', JSON.stringify(chartStats()));
console.log('stars at', STAR_FRAC.map((f) => f * 100 + '%').join(' / '));
for (const mode of ['perfect', 'good', 'sloppy', 'none']) {
  const runs = [];
  for (let s = 1; s <= (mode === 'perfect' || mode === 'none' ? 1 : seeds); s++) runs.push(runHeadless(mode, s));
  const avg = (k) => (runs.reduce((a, r) => a + r[k], 0) / runs.length).toFixed(k === 'ratio' ? 3 : 1);
  const st = [0, 1, 2, 3].map((n) => runs.filter((r) => r.stars === n).length);
  console.log(`${mode.padEnd(8)} max ${runs[0].max}  score ${avg('score')}  ratio ${avg('ratio')} (${Math.min(...runs.map((r) => r.ratio))}–${Math.max(...runs.map((r) => r.ratio))})  stars 0/1/2/3: ${st.join('/')}  P ${avg('perfect')} G ${avg('good')} C ${avg('close')} E ${avg('early')} M ${avg('miss')} hold ${avg('holdPts')}  streak ${avg('bestStreak')}  ~${runs[0].secs}s`);
}
