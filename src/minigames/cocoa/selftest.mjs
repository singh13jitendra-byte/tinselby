// node src/minigames/cocoa/selftest.mjs : logic checks for sim.js (no browser)
import { createSim, createBot, runHeadless, TUNE, TOPS } from './sim.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (S, sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) S.step(dt); };
const toPour = (S) => { while (S.phase !== 'pour') S.step(1 / 30); };

{ // orders are deterministic and well formed
  const a = createSim({ seed: 9 }).orders, b = createSim({ seed: 9 }).orders;
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed, same orders');
  ok(a.length === 6 && a.every((o) => o.tops.length >= 1 && o.tops.length <= 2 && new Set(o.tops).size === o.tops.length), 'six orders, 1-2 distinct toppings');
  ok([0.6, 0.75, 0.9].every((c) => a.filter((o) => o.c === c).length === 2), 'each line height twice');
  ok(a[0].c !== 0.9, 'first order is not the brim line');
}
{ // tiny tap: pour restarts with no penalty
  const S = createSim({ seed: 1 }); toPour(S);
  S.press(); run(S, 0.1); S.release();
  ok(S.phase === 'pour' && S.level === 0 && !S.pouring, 'a 0.1 s tap does not commit the pour');
  ok(S.drain().some((e) => e.type === 'pourAbort'), 'pourAbort event');
}
{ // splash
  const S = createSim({ seed: 1 }); toPour(S);
  S.press(); run(S, 3);
  ok(S.phase === 'top' && S.pourAcc === 0 && S.drain().some((e) => e.type === 'splash'), 'holding past the brim splashes: pour 0, toppings phase');
}
{ // exact pour, wrong toppings, serve rules
  const S = createSim({ seed: 2 }); toPour(S);
  const o = S.order;
  S.press(); while (S.level < o.c) S.step(1 / 30); S.release();
  ok(S.phase === 'top' && S.pourAcc > 0.93, 'release on the line: accuracy ' + S.pourAcc.toFixed(3));
  const wrong = (o.tops[0] + 1) % 4;
  S.tap(wrong); S.tap(wrong);
  ok(S.phase === 'top' && S.wrong === 2, 'wrong taps do not serve until 3');
  S.tap(wrong);
  ok(S.phase === 'serve', '3 wrong taps serve what is there');
  const r = S.results[0];
  ok(r.topScore === 0 && r.base === Math.round(100 * 0.6 * S.pourAcc), 'toppings 0 after 3 wrong taps (' + r.base + ')');
}
{ // topping order matters, auto-serve when done, penalty maths
  const S = createSim({ seed: 3 }); S.i = S.orders.findIndex((o) => o.tops.length === 2); S.phase = 'pour'; S.orderT = 0;
  const o = S.order;
  S.press(); while (S.level < o.c) S.step(1 / 30); S.release();
  S.tap(o.tops[1]); // second topping first: wrong
  ok(S.wrong === 1 && S.correct === 0, 'toppings must be tapped in the order on the card');
  S.tap(o.tops[0]); S.tap(o.tops[1]);
  ok(S.phase === 'serve' && Math.abs(S.results[0].topScore - (1 - 0.34)) < 1e-9, 'one wrong tap costs 0.34: ' + S.results[0].topScore.toFixed(2));
}
{ // speed bonus: full under 5 s, none at 10 s
  const S = createSim({ seed: 4 }); toPour(S); const o = S.order;
  run(S, 10.2); S.press(); while (S.level < o.c) S.step(1 / 30); S.release(); o.tops.forEach((k) => S.tap(k));
  ok(S.results[0].bonus === 0, 'no bonus after 10 s');
}
{ // 90 s cap: idle player still finishes, everybody gets the house cocoa, 1 star
  const r = runHeadless({ mode: 'none', seed: 1 });
  ok(r.stars === 1 && r.score === 6 * TUNE.house && r.served === 0 && r.t < 95, `idle: ${r.score} points, ${r.stars} star, ended at ${r.t.toFixed(1)} s`);
}
{ // cap in the middle of a drink
  const S = createSim({ seed: 5 }); toPour(S);
  const o = S.order; S.press(); while (S.level < o.c) S.step(1 / 30); S.release();
  S.t = TUNE.cap - 0.01; S.step(0.05);
  ok(S.capped && S.phase === 'serve' && S.results.length === 6, 'cap while toppings are open serves the current drink and the rest get house cocoa');
}
{ // bots
  const per = runHeadless({ mode: 'perfect', seed: 1 });
  ok(per.stars === 3 && per.score === 720, 'perfect bot: 720, 3 stars');
  let g3 = 0, s23 = 0;
  for (let s = 1; s <= 100; s++) { if (runHeadless({ mode: 'good', seed: s }).stars === 3) g3++; const r = runHeadless({ mode: 'sloppy', seed: s }); if (r.stars >= 1 && r.stars <= 2) s23++; }
  ok(g3 >= 90, `good bot 3 stars in ${g3}/100 seeds`);
  ok(s23 >= 85, `sloppy bot 1-2 stars in ${s23}/100 seeds`);
}
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
