// Hot Cocoa Hut: pure game logic (no three.js, no DOM), so it runs in Node (tune.mjs) and in the browser alike.
// Six customers order one drink each: pour cocoa to the line (hold = level rises, release = commit), then tap the
// toppings in the order on the card, the drink is served and the next customer steps up.
//
// Per order  round(100 * (0.6 * pour + 0.4 * toppings)) + a speed bonus (<= 20, full under 5 s, none at 10 s).
//   pour      = clamp(1 - |level - line| / 0.25, 0, 1); over the brim (1.0) is a splash = 0
//   toppings  = clamp(correct / needed - 0.34 * wrong, 0, 1)
// Max 6 * 120 = 720. Stars: 1 = all six served, 2 >= 430, 3 >= 610. A 90 s safety cap serves everyone still waiting a
// plain "house cocoa" (30 points each) so a very slow player still finishes with a star.
// The sim only knows time + inputs: press() / release() for the pour, tap(k) for a topping. It emits events
// (drain() returns and clears them) that the scene turns into animation and sfx.

export const TUNE = {
  N: 6,
  rate: 0.45, // pour level per second (holding)
  bands: [0.6, 0.75, 0.9], // line heights (centre of the gauge band)
  half: 0.06, // the shown band is +-half around the line
  span: 0.25, // pour accuracy reaches 0 this far from the line
  minPour: 0.12, // releasing below this is an accidental tap: the pour restarts, no penalty
  arrive0: 3.0, arrive: 2.6, // s from "customer starts walking in" to "order is on the counter" (the last one leaves meanwhile)
  serve: 2.2, // mug slides over, sip + hop + steam heart
  endPause: 1.2,
  fast: 5, slow: 10, bonus: 20, // speed bonus window (s since the customer reached the counter)
  wrong: 0.34, maxWrong: 3, // wrong taps: penalty per tap; 3 wrong taps serve what is there
  cap: 90, house: 30,
  stars: [430, 610],
};
export const TOPS = [
  { id: 'marshmallow', label: 'Marshmallows', key: '1' },
  { id: 'cream', label: 'Cream', key: '2' },
  { id: 'cinnamon', label: 'Cinnamon', key: '3' },
  { id: 'candy', label: 'Candy cane', key: '4' },
];
export const MAX_SCORE = TUNE.N * (100 + TUNE.bonus);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (rnd, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Six seeded orders: each line height twice (the first one never the brimmed 0.9), 1-2 toppings, a customer tint slot. */
export function makeOrders(rnd, T = TUNE) {
  let bands;
  do { bands = shuffle(rnd, [0, 0, 1, 1, 2, 2]); } while (bands[0] === 2);
  const needs = [1, 1, ...shuffle(rnd, [2, 2, 1, 2])];
  const looks = shuffle(rnd, [0, 1, 2, 3, 4, 5]);
  return bands.slice(0, T.N).map((b, i) => {
    const tops = [];
    while (tops.length < needs[i]) { const k = Math.floor(rnd() * TOPS.length); if (!tops.includes(k)) tops.push(k); }
    return { band: b, c: T.bands[b], tops, look: looks[i] };
  });
}

export function createSim({ seed = 1, tune = {} } = {}) {
  const T = { ...TUNE, ...tune };
  const rnd = rng(seed);
  const orders = makeOrders(rnd, T);
  const S = {
    T, seed, orders,
    t: 0, phase: 'arrive', pt: 0, i: 0,
    level: 0, pouring: false, pourAcc: null, pourLevel: null, hit: false,
    correct: 0, wrong: 0, orderT: 0,
    score: 0, results: [], events: [], finished: false, capped: false,
    get order() { return orders[Math.min(S.i, orders.length - 1)]; },
    get need() { return S.order.tops.length; },
    drain() { const e = S.events; S.events = []; return e; },
    step, press, release, tap, result,
  };
  const emit = (type, d) => S.events.push({ type, t: S.t, i: S.i, ...d });
  const setPhase = (p) => { S.phase = p; S.pt = 0; emit('phase', { phase: p }); };
  emit('start', {});

  function resetOrder() {
    S.level = 0; S.pouring = false; S.pourAcc = null; S.pourLevel = null; S.hit = false;
    S.correct = 0; S.wrong = 0; S.orderT = 0;
  }
  function step(dt) {
    if (S.finished) return;
    S.t += dt; S.pt += dt;
    if (S.phase === 'arrive' && S.pt >= (S.i === 0 ? T.arrive0 : T.arrive)) { S.orderT = 0; setPhase('pour'); }
    else if (S.phase === 'pour') {
      S.orderT += dt;
      if (S.pouring) {
        S.level += T.rate * dt;
        if (S.level >= 1) { // over the brim: splash, no pour marks
          S.pouring = false; S.pourAcc = 0; S.pourLevel = S.level; S.hit = false;
          emit('splash', { level: S.level });
          setPhase('top');
        }
      }
    } else if (S.phase === 'top') S.orderT += dt;
    else if (S.phase === 'serve' && S.pt >= T.serve) next();
    else if (S.phase === 'end' && S.pt >= T.endPause) finish();
    if (!S.capped && S.t >= T.cap && !S.finished && S.phase !== 'end') cap();
  }
  function press() {
    if (S.phase !== 'pour' || S.pouring) return false;
    S.pouring = true; S.level = 0;
    emit('pourStart', {});
    return true;
  }
  function release() {
    if (S.phase !== 'pour' || !S.pouring) return false;
    S.pouring = false;
    if (S.level < T.minPour) { S.level = 0; emit('pourAbort', {}); return false; }
    const c = S.order.c;
    S.pourAcc = clamp(1 - Math.abs(S.level - c) / T.span, 0, 1);
    S.pourLevel = S.level;
    S.hit = Math.abs(S.level - c) <= T.half;
    emit('pour', { level: S.level, acc: S.pourAcc, c, hit: S.hit });
    setPhase('top');
    return true;
  }
  function tap(k) {
    if (S.phase !== 'top') return false;
    const want = S.order.tops[S.correct];
    const ok = k === want;
    if (ok) S.correct++; else S.wrong++;
    emit('top', { k, ok, n: S.correct, wrong: S.wrong });
    if (S.correct >= S.need || S.wrong >= T.maxWrong) serve();
    return ok;
  }
  function serve() {
    const need = S.need;
    const topScore = clamp(S.correct / need - T.wrong * S.wrong, 0, 1);
    const pour = S.pourAcc ?? 0;
    const base = Math.round(100 * (0.6 * pour + 0.4 * topScore));
    const bonus = Math.round(T.bonus * clamp((T.slow - S.orderT) / (T.slow - T.fast), 0, 1));
    const pts = base + bonus;
    S.score += pts;
    const r = { i: S.i, pts, base, bonus, pour, topScore, time: S.orderT, hit: S.hit, splash: S.pourLevel != null && S.pourLevel >= 1, level: S.pourLevel, correct: S.correct, wrong: S.wrong };
    S.results.push(r);
    emit('serve', r);
    setPhase('serve');
  }
  function houseFrom(j0, shown) {
    for (let j = j0; j < T.N; j++) { S.results.push({ i: j, pts: T.house, house: true }); S.score += T.house; }
    emit('house', { from: j0, shown });
  }
  function next() {
    if (S.capped || S.i + 1 >= T.N) { setPhase('end'); return; }
    S.i++; resetOrder(); setPhase('arrive');
  }
  function cap() {
    S.capped = true;
    emit('cap', {});
    if (S.phase === 'top') { serve(); houseFrom(S.i + 1, false); }
    else if (S.phase === 'serve') houseFrom(S.i + 1, false);
    else { houseFrom(S.i, true); S.pouring = false; setPhase('end'); }
  }
  function finish() {
    S.finished = true;
    emit('finish', result());
  }
  function result() {
    const done = S.results.length >= T.N;
    const stars = done ? 1 + (S.score >= T.stars[0] ? 1 : 0) + (S.score >= T.stars[1] ? 1 : 0) : 0;
    const real = S.results.filter((r) => !r.house);
    return { score: S.score, stars, served: real.length, house: S.results.length - real.length, perfect: real.filter((r) => r.pts >= 100).length, t: S.t, results: S.results.slice() };
  }
  return S;
}

// ------------------------------------------------------------------ bots
const BOTS = {
  // humans: react = reading the card + reaching the button; err = release timing error as a level (0.45 / s: 0.06 = 130 ms)
  perfect: { react: 0.3, reactJ: 0, err: 0, mis: 0, gap: 0.3, gapJ: 0, top0: 0.3 },
  good: { react: 0.8, reactJ: 0.25, err: 0.05, mis: 0.07, gap: 0.55, gapJ: 0.2, top0: 0.55 },
  sloppy: { react: 1.4, reactJ: 0.4, err: 0.14, mis: 0.28, gap: 0.9, gapJ: 0.3, top0: 1.0 },
  none: null,
};
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.283185307 * r()); }

/** act(sim, dt) once per frame before sim.step(dt). */
export function createBot(mode = 'good', seed = 7) {
  const B = BOTS[mode] === undefined ? BOTS.good : BOTS[mode];
  const r = rng(seed * 7919 + 13);
  let seen = null, w = 0, target = 0, pressed = false;
  return {
    mode,
    act(S, dt) {
      if (!B) return;
      const key = S.phase + ':' + S.i;
      if (key !== seen) { // entered a new phase: plan it
        seen = key; pressed = false;
        if (S.phase === 'pour') { w = B.react + (r() - 0.5) * 2 * B.reactJ; target = clamp(S.order.c + gauss(r) * B.err, 0.2, 1.08); }
        else if (S.phase === 'top') w = B.top0 + (r() - 0.5) * 2 * B.reactJ * 0.5;
      }
      if (S.phase === 'pour') {
        if (!pressed) { w -= dt; if (w <= 0) { S.press(); pressed = true; } }
        else if (S.pouring && S.level >= target) S.release();
      } else if (S.phase === 'top') {
        w -= dt;
        if (w <= 0) {
          const want = S.order.tops[S.correct];
          const k = r() < B.mis ? (want + 1 + Math.floor(r() * 3)) % 4 : want;
          S.tap(k);
          w = B.gap + (r() - 0.5) * 2 * B.gapJ;
        }
      }
    },
  };
}

export function runHeadless({ mode = 'good', seed = 1, dt = 1 / 30, tune } = {}) {
  const S = createSim({ seed, tune });
  const bot = createBot(mode, seed);
  for (let g = 0; !S.finished && g < 60000; g++) { bot.act(S, dt); S.step(dt); S.events.length = 0; }
  return S.result();
}
