// node src/streaks/logic.test.mjs : unit tests for the streak date logic (fake clock, no browser).
import assert from 'node:assert/strict';
import { play, view, seed, claim, normalize, blankState, isoWeek, daysBetween, addDays, isDay, dayKey, THRESHOLDS } from './logic.js';

let n = 0, fails = 0;
function test(name, fn) {
  try { fn(); n++; console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + (e && e.message)); }
}
/** Fake clock: play a list of days in order; returns { state, results }. */
function run(days, state = blankState()) {
  const results = [];
  for (const d of days) { const r = play(state, d); state = r.state; results.push(r.result); }
  return { state, results };
}

test('date helpers: isDay / daysBetween / addDays', () => {
  assert.ok(isDay('2026-11-21')); assert.ok(!isDay('2026-02-30')); assert.ok(!isDay('21-11-2026')); assert.ok(!isDay(null));
  assert.equal(daysBetween('2026-11-21', '2026-11-22'), 1);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2); // leap year
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // across a DST change in Europe
  assert.equal(daysBetween('2026-11-22', '2026-11-21'), -1);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
test('dayKey uses the local calendar date', () => {
  assert.equal(dayKey(new Date(2026, 10, 21, 23, 59)), '2026-11-21');
  assert.equal(dayKey(new Date(2026, 10, 22, 0, 1)), '2026-11-22');
});
test('ISO weeks (Monday start, year boundaries)', () => {
  assert.equal(isoWeek('2026-11-16'), '2026-W47'); // Monday
  assert.equal(isoWeek('2026-11-22'), '2026-W47'); // Sunday, same week
  assert.equal(isoWeek('2026-11-23'), '2026-W48'); // next Monday
  assert.equal(isoWeek('2026-01-01'), '2026-W01'); // Thursday
  assert.equal(isoWeek('2027-01-01'), '2026-W53'); // Friday belongs to 2026's week 53
  assert.equal(isoWeek('2024-12-30'), '2025-W01'); // Monday belongs to 2025
});

test('first play starts a streak of 1', () => {
  const { state, results } = run(['2026-11-21']);
  assert.equal(state.streak, 1); assert.equal(results[0].counted, true); assert.equal(state.last, '2026-11-21');
});
test('consecutive days count up', () => {
  const { state, results } = run(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.equal(state.streak, 5); assert.equal(state.best, 5); assert.equal(state.days, 5);
  assert.ok(results.every((r) => r.counted && !r.snowUsed && !r.reset));
});
test('same-day repeats do not count twice', () => {
  const { state, results } = run(['2026-11-21', '2026-11-21', '2026-11-21', '2026-11-22', '2026-11-22']);
  assert.equal(state.streak, 2); assert.equal(state.days, 2);
  assert.equal(results[1].ignored, 'same-day'); assert.equal(results[1].counted, false);
});
test('one missed day is bridged by the snow day', () => {
  const { state, results } = run(['2026-11-17', '2026-11-18', '2026-11-20']); // missed Thu 19th (W47)
  assert.equal(state.streak, 3); assert.equal(results[2].snowUsed, true); assert.equal(state.snow['2026-W47'], 1);
});
test('only one snow day per ISO week', () => {
  // Mon 16 play, Tue missed (snow), Wed play, Thu missed → no snow day left in W47 → reset on Fri
  const { state, results } = run(['2026-11-16', '2026-11-18', '2026-11-20']);
  assert.equal(results[1].snowUsed, true);
  assert.equal(results[2].snowUsed, false); assert.equal(results[2].reset, true);
  assert.equal(state.streak, 1);
});
test('a new ISO week brings a new snow day', () => {
  // W47: miss Tue 17 (snow). W48: miss Tue 24 (snow again) → streak keeps going
  const { state, results } = run(['2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-25']);
  assert.equal(results[1].snowUsed, true); assert.equal(results[7].snowUsed, true);
  assert.equal(state.streak, 8); assert.deepEqual(Object.keys(state.snow).sort(), ['2026-W47', '2026-W48']);
});
test('week boundary: the missed day decides which week pays', () => {
  // play Sat 21, miss Sun 22 (W47), play Mon 23 (W48): W47's snow day is used, W48 still has one
  const { state, results } = run(['2026-11-21', '2026-11-23']);
  assert.equal(results[1].snowUsed, true); assert.equal(state.snow['2026-W47'], 1); assert.ok(!state.snow['2026-W48']);
  assert.equal(view(state, '2026-11-23').snowLeft, 1);
  // miss Sun 22 bridged; now miss Mon... play Sat 28 after missing Thu 26 (W48) → W48 pays
  const r2 = run(['2026-11-24', '2026-11-25', '2026-11-27'], state);
  assert.equal(r2.results[2].snowUsed, true); assert.equal(r2.state.snow['2026-W48'], 1); assert.equal(r2.state.streak, 5);
});
test('two missed days in a row reset gently to 1', () => {
  const { state, results } = run(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-22']);
  assert.equal(state.streak, 1); assert.equal(results[3].reset, true); assert.equal(results[3].snowUsed, false);
  assert.equal(state.best, 3); assert.ok(!state.snow['2026-W47']); // no snow day wasted on a lost cause
});
test('a long break resets too, best is kept', () => {
  const { state } = run(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-12-01']);
  assert.equal(state.streak, 1); assert.equal(state.best, 4);
});
test('clock going backwards is ignored (no count, no break)', () => {
  let { state, results } = run(['2026-11-20', '2026-11-21', '2026-11-19', '2026-11-18']);
  assert.equal(state.streak, 2); assert.equal(state.last, '2026-11-21');
  assert.equal(results[2].ignored, 'backwards'); assert.equal(results[3].counted, false);
  const v = view(state, '2026-11-19');
  assert.equal(v.alive, true); assert.equal(v.streak, 2); assert.equal(v.playedToday, true); // never nag after a clock change
  ({ state } = run(['2026-11-22'], state));
  assert.equal(state.streak, 3); // back to normal once the clock is right again
});
test('bad dates are ignored', () => {
  const { state, results } = run(['2026-11-21', 'nope', '2026-13-01']);
  assert.equal(state.streak, 1); assert.equal(results[1].ignored, 'bad-date');
});
test('view: alive / at risk / snow pending / broken', () => {
  const { state } = run(['2026-11-19', '2026-11-20', '2026-11-21']);
  let v = view(state, '2026-11-21'); assert.deepEqual([v.streak, v.alive, v.playedToday, v.atRisk], [3, true, true, false]);
  v = view(state, '2026-11-22'); assert.deepEqual([v.streak, v.atRisk, v.snowPending], [3, true, false]);
  v = view(state, '2026-11-23'); assert.deepEqual([v.streak, v.atRisk, v.snowPending], [3, true, true]);
  v = view(state, '2026-11-24'); assert.deepEqual([v.streak, v.alive], [0, false]);
  assert.equal(view(state, '2026-11-21').snowLeft, 1);
});
test('view: snow pending only when the missed week still has a snow day', () => {
  const { state } = run(['2026-11-16', '2026-11-18', '2026-11-19']); // W47 snow used on Tue 17
  const v = view(state, '2026-11-21'); // Fri 20 missed, W47 has none left
  assert.equal(v.alive, false); assert.equal(v.streak, 0); assert.equal(v.snowLeft, 0);
});
test('rewards at 3, 7 and 14 days, each once; never taken away', () => {
  const days = []; for (let i = 0; i < 15; i++) days.push(addDays('2026-11-01', i));
  let state = blankState(); const got = [];
  for (const d of days) { const r = play(state, d); state = r.state; if (r.result.rewards.length) { got.push([r.result.streak, r.result.rewards]); state = claim(state, r.result.rewards); } }
  assert.deepEqual(got, [[3, [3]], [7, [7]], [14, [14]]]);
  assert.deepEqual(state.claimed, THRESHOLDS);
  // break and climb again: nothing new, claimed stays
  ({ state } = run(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'], state));
  assert.equal(state.streak, 4); assert.deepEqual(state.claimed, [3, 7, 14]);
});
test('rewards: jumping past a threshold (seeded streak) still hands it out once', () => {
  let state = seed(5, '2026-11-21');
  const r = play(state, '2026-11-22');
  assert.equal(r.result.streak, 6); assert.deepEqual(r.result.rewards, [3]);
  state = claim(r.state, r.result.rewards);
  assert.deepEqual(play(state, '2026-11-22').result.rewards, []); // same day again: nothing
  assert.deepEqual(play(state, '2026-11-23').result.rewards, [7]); // day 7: only the 7-day piece, not the 3 again
});
test('seed(N) ends today; view shows it; play tomorrow adds one', () => {
  const s = seed(5, '2026-11-21');
  assert.equal(view(s, '2026-11-21').streak, 5);
  assert.equal(play(s, '2026-11-21').result.counted, false);
  assert.equal(play(s, '2026-11-22').state.streak, 6);
  assert.equal(seed(0, '2026-11-21').streak, 0);
});
test('next reward in view', () => {
  const s = seed(5, '2026-11-21');
  assert.deepEqual(view(s, '2026-11-21').next, { days: 7, left: 2 });
  assert.deepEqual(view(claim(seed(8, '2026-11-21'), [3, 7]), '2026-11-21').next, { days: 14, left: 6 });
  assert.equal(view(claim(seed(20, '2026-11-21'), [3, 7, 14]), '2026-11-21').next, null);
});
test('normalize: junk and hand-edited saves', () => {
  assert.deepEqual(normalize(null), blankState());
  assert.deepEqual(normalize('x'), blankState());
  const s = normalize({ streak: '7', best: 2, last: '2026-11-21', days: -4, snow: { '2026-W47': 1, bad: 3, '2026-W48': 'x' }, claimed: [3, 3, 99, 'a', 7] });
  assert.deepEqual(s, { v: 1, streak: 7, best: 7, last: '2026-11-21', days: 0, snow: { '2026-W47': 1 }, claimed: [3, 7] });
  assert.equal(normalize({ streak: 9, last: 'yesterday' }).streak, 0);
});
test('snow bookkeeping is pruned to recent weeks', () => {
  const s = normalize({ streak: 3, last: '2026-11-20', snow: { '2025-W01': 1, '2026-W46': 1 } });
  const r = play(s, '2026-11-21');
  assert.deepEqual(Object.keys(r.state.snow), ['2026-W46']);
});
test('play is pure (input state untouched)', () => {
  const s = seed(2, '2026-11-20'); const copy = JSON.stringify(s);
  play(s, '2026-11-21'); assert.equal(JSON.stringify(s), copy);
});

console.log(`\n${n} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
