// node src/minigames/cocoa/tune.mjs  : bot results over many seeds (stars, score, run time)
import { runHeadless, MAX_SCORE } from './sim.js';
const N = 200;
for (const mode of ['perfect', 'good', 'sloppy', 'none']) {
  const sc = [], st = [0, 0, 0, 0], ts = [];
  for (let s = 1; s <= N; s++) { const r = runHeadless({ mode, seed: s }); sc.push(r.score); st[r.stars]++; ts.push(r.t); }
  sc.sort((a, b) => a - b);
  const mean = sc.reduce((a, b) => a + b, 0) / N;
  console.log(mode.padEnd(8), 'score mean', mean.toFixed(0), 'min', sc[0], 'p10', sc[Math.floor(N * 0.1)], 'max', sc[N - 1], '/', MAX_SCORE, '| stars 0/1/2/3 =', st.join('/'), '| time mean', (ts.reduce((a, b) => a + b, 0) / N).toFixed(1), 's');
}
