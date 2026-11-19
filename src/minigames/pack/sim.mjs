// Node sim of the rules + bots: node src/minigames/pack/sim.mjs
import { simulate, BOTS } from './logic.js';
let seed = 12345; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (const mode of Object.keys(BOTS)) {
  const N = mode === 'perfect' ? 5 : 300; const sc = [], st = [0,0,0,0], time = [], tum = [], gaps = [];
  for (let i = 0; i < N; i++) { const t0 = Date.now(); const m = simulate(mode, rng); sc.push(m.score); st[m.stars]++; time.push(m.sim); tum.push(m.tumbles); gaps.push(m.gaps); }
  sc.sort((a,b)=>a-b);
  console.log(mode, 'median', sc[sc.length>>1], 'p10', sc[Math.floor(sc.length*.1)], 'p90', sc[Math.floor(sc.length*.9)], 'max', sc.at(-1), 'stars', st, 'time', (time.reduce((a,b)=>a+b)/N).toFixed(1), 'tumbles', (tum.reduce((a,b)=>a+b)/N).toFixed(2), 'gaps', (gaps.reduce((a,b)=>a+b)/N).toFixed(2));
}
