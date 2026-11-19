// Run: node src/net/core.test.mjs  — unit tests for src/net/core.js + the local transport (node 22: BroadcastChannel + performance are global).
import assert from 'node:assert/strict';
import { createNetCore, SnapBuffer, nextRoom, sendRates, sanitizeStyle, sanitizeMeta, encodePos, decodePos, TUNING,
  normTownCode, makeTownCode, TOWN_ALPHABET, sanitizeRide, validateMsg, createRateLimiter, EMOTES } from './core.js';
import { emotePose, EMOTE_DUR } from './emotes.js';
import { createLocalTransport } from './transport.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { info() {}, warn() {}, log() {} };
let pass = 0; const ok = (name) => { pass++; console.log('ok -', name); };

// --- pure helpers
assert.equal(nextRoom(1, 24), 1); assert.equal(nextRoom(1, 25), 2); assert.equal(nextRoom(3, 40), 4);
assert.equal(nextRoom(TUNING.maxRooms, 99), TUNING.maxRooms); ok('room decision');
assert.deepEqual(sendRates(1), { move: 8, idle: 1 }); assert.deepEqual(sendRates(3), { move: 8, idle: 1 });
assert.ok(sendRates(5).move < 8 && sendRates(5).move > 3); assert.equal(sendRates(25).move, 1.5); assert.equal(sendRates(25).idle, 0.25); ok('send rates scale with room size');
const opts = { coat: { red: 1, teal: 1 }, hat: { bobble: 1 } };
assert.deepEqual(sanitizeStyle({ coat: 'teal', hat: 'santa?', hair: 'bun', hairColor: '#7a4a2c', skin: '#f2d6bd', outfit: 'elf-suit', x: { a: 1 }, 'bad key': 'v', n: 2 }, opts),
  { coat: 'teal', hair: 'bun', hairColor: '#7a4a2c', skin: '#f2d6bd', outfit: 'elf-suit', n: 2 });
assert.deepEqual(sanitizeStyle({ coat: '#123456' }, opts), { coat: '#123456' });
assert.deepEqual(sanitizeStyle({ coat: 'magenta' }, opts), {}); ok('style: every key kept, values checked');
const m = sanitizeMeta({ id: 'abc', name: '  <b>Holly</b>  ', style: { coat: 'red' }, door: 5 }, 'k', opts);
assert.equal(m.id, 'abc'); assert.equal(m.name, 'bHolly/b'); assert.equal(m.door, 5);
assert.equal(sanitizeMeta({ name: 'x' }, 'key1').id, 'key1'); assert.equal(sanitizeMeta(null, 'k'), null); ok('presence meta sanitised');
assert.deepEqual(encodePos('i', 1.23456, -2.345, 7, 1.999), { id: 'i', x: 1.23, z: -2.35, h: 0.72, s: 2 });
assert.equal(decodePos({ id: 'i', x: 'nan', z: 0 }), null); assert.equal(decodePos({ id: 'i', x: 1, z: 1e6 }), null); assert.ok(decodePos({ id: 'i', x: 1, z: 2 })); ok('pos codec');

// --- interpolation
{
  const b = new SnapBuffer();
  for (let i = 0; i <= 10; i++) b.push(i * 0.125, i * 0.25, 0, 0, 2); // 2 units/s at 8 Hz
  assert.ok(Math.abs(b.delay() - 0.15) < 0.01, 'delay ~150 ms at 8 Hz: ' + b.delay());
  let o = b.sample(1.25, 0); // render clock = 1.25 - 0.15 = 1.10 → x = 2.2
  assert.ok(Math.abs(o.x - 2.2) < 0.02, 'x ' + o.x);
  o = b.sample(1.30, 0.05); assert.ok(Math.abs(o.x - 2.3) < 0.03, 'x2 ' + o.x);
  o = b.sample(1.5, 0.2); assert.ok(o.x > 2.5 && o.x <= 2.5 + 0.2 * 2 + 1e-6, 'extrapolates a little ' + o.x);
  b.push(1.4, 30, 30, 1, 0); o = b.sample(1.45, 0.05); assert.equal(o.x, 30); assert.equal(o.z, 30); // teleport snaps
  const c = new SnapBuffer(); // heading wraps the short way
  c.push(0, 0, 0, 3.0, 1); c.push(0.125, 0.1, 0, -3.0, 1);
  o = c.sample(0.0625 + c.delay(), 0); assert.ok(Math.abs(Math.abs(o.h) - Math.PI) < 0.2, 'heading ' + o.h);
  const s = new SnapBuffer(); // slow senders get a longer buffer
  for (let i = 0; i < 12; i++) s.push(i * 0.6, i * 0.5, 0, 0, 1);
  assert.ok(s.delay() > 0.6, 'adaptive delay ' + s.delay());
  ok('snapshot interpolation, extrapolation, teleport snap, heading wrap, adaptive delay');
}

// --- two cores over the local transport: presence, pos, join/leave events
function mk(sid, extra = {}) {
  const events = [];
  extra.self = extra.self || null;
  const tr = createLocalTransport({ prefix: 'test-' + extra.prefix + ':', heartbeatSec: 0.2, expireSec: 1.5 });
  const self = { name: sid.toUpperCase(), style: { coat: 'teal', hair: 'bun' }, door: 3, ride: null };
  const core = createNetCore({ transport: tr, sid, clock: () => performance.now() / 1000, getSelf: () => self, getPlayerId: () => extra.pid || null,
    emit: (e, d) => events.push([e, d]), log: quiet, tuning: extra.tuning, store: extra.store, w4: extra.w4, town: extra.town });
  return { core, tr, events, self };
}
{
  const A = mk('a', { prefix: 'p1' }), B = mk('b', { prefix: 'p1' });
  A.core.start(); A.core.setTracking(true);
  await sleep(500);
  B.core.start(); B.core.setTracking(true);
  await sleep(700);
  assert.equal(A.core.state.online, true); assert.equal(B.core.state.room, 1); assert.equal(B.core.state.others, 1);
  assert.ok(A.events.some(([e, d]) => e === 'join' && d.name === 'B'), 'A got net:join for B');
  assert.ok(!B.events.some(([e]) => e === 'join'), 'no join flood for players already there');
  const rb = B.core.remotes.get('a');
  assert.ok(rb && rb.present && rb.name === 'A' && rb.style.hair === 'bun' && rb.door === 3, 'B sees A presence with whole style');
  for (let i = 0; i < 12; i++) { A.core.tick({ x: 1 + i * 0.1, z: 2, h: 0.5, s: 1.9 }, 0.13); B.core.tick(null, 0.13); await sleep(130); }
  for (let i = 0; i < 4; i++) { B.core.tick(null, 0.13); await sleep(130); }
  const r = B.core.remotes.get('a');
  assert.ok(r.buf.count >= 6, 'pos packets received: ' + r.buf.count);
  assert.ok(Math.abs(r.x - 2.1) < 0.25 && Math.abs(r.z - 2) < 0.01, `B interpolates A near the newest spot: ${r.x}, ${r.z}`);
  // style change re-tracks
  A.self.style = { coat: 'red', hair: 'plaits' }; A.core.selfChanged();
  await sleep(600);
  assert.equal(B.core.remotes.get('a').style.hair, 'plaits'); ok('presence + pos between two tabs, style re-track');
  // stale after silence (short staleSec)
  A.core.stop();
  await sleep(400);
  assert.ok(B.events.some(([e, d]) => e === 'leave' && d.name === 'A'), 'B got net:leave');
  assert.equal(B.core.state.others, 0);
  B.core.stop(); ok('leave detected');
}
// --- room overflow: cap 1 → second player moves to town:2
{
  const tuning = { roomCap: 1 };
  const A = mk('a', { prefix: 'p2', tuning }), B = mk('b', { prefix: 'p2', tuning }), C = mk('c', { prefix: 'p2', tuning });
  A.core.start(); A.core.setTracking(true); await sleep(500);
  B.core.start(); B.core.setTracking(true); await sleep(1200);
  C.core.start(); C.core.setTracking(true); await sleep(1800);
  assert.equal(A.core.state.room, 1); assert.equal(B.core.state.room, 2); assert.equal(C.core.state.room, 3);
  A.core.stop(); B.core.stop(); C.core.stop(); ok('full rooms overflow to town:2, town:3');
}
// --- stale removal
{
  const tuning = { staleSec: 0.6 };
  const A = mk('a', { prefix: 'p3', tuning }), B = mk('b', { prefix: 'p3', tuning });
  A.core.start(); A.core.setTracking(true); await sleep(400); B.core.start(); await sleep(700);
  A.core.tick({ x: 3, z: 3, h: 0, s: 0 }, 0.1); await sleep(50); B.core.tick(null, 0.05);
  assert.ok(!B.core.remotes.get('a').stale);
  await sleep(800); B.core.tick(null, 0.8);
  assert.ok(B.core.remotes.get('a').stale, 'silent remote marked stale');
  A.core.stop(); B.core.stop(); ok('stale after silence');
}
// --- Town Spirit + door queue (local fake DB), dedupe, stub playerId waits
{
  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  let pid = 'stub';
  const saved = { v: null }; const store = { load: () => saved.v, save: (o) => { saved.v = o; } };
  const events = [];
  const tr = createLocalTransport({ prefix: 'p4:', storage });
  const core = createNetCore({ transport: tr, sid: 's', clock: () => performance.now() / 1000, getSelf: () => ({}), getPlayerId: () => pid, emit: (e, d) => events.push([e, d]), log: quiet, store });
  core.start(); await sleep(100);
  assert.ok(events.some(([e, d]) => e === 'spirit' && d.doors === 0), 'first town:spirit emitted');
  core.recordDoor(1); await sleep(50);
  assert.deepEqual(core.stats().pendingDoors, [1], 'queued while playerId is a stub');
  pid = '0b5f2c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b';
  core.recordDoor(1); core.recordDoor(2); core.recordDoor(2); await sleep(100);
  assert.deepEqual(core.stats().pendingDoors, []); assert.equal(core.spirit.doors, 2);
  core.recordDoor(1); await sleep(50); assert.equal(JSON.parse(mem.get('tinselby.localnet.spirit')).length, 2, 'deduped');
  assert.ok(saved.v.sent.length === 2, 'sent doors persisted');
  core.recordDoor(0); core.recordDoor(25); core.recordDoor('x'); assert.deepEqual(core.stats().pendingDoors, []);
  await core.refreshSpirit(); assert.equal(core.spirit.helpers, 1);
  core.stop(); ok('town spirit + open_door queue, dedupe, validation');
}
// --- offline transport: failures back off, never throw
{
  const warns = [];
  const bad = { kind: 'supabase', join(topic, key, h) { setTimeout(() => h.status('error', 'CHANNEL_ERROR: test'), 0); return { track: async () => 'x', send: () => false, leave: async () => 'ok' }; }, rpc: async () => ({ data: null, error: { message: 'Failed to fetch' } }), disconnect() {} };
  const core = createNetCore({ transport: bad, sid: 's', clock: () => performance.now() / 1000, getSelf: () => ({}), getPlayerId: () => null, log: { info() {}, warn: (m) => warns.push(m) }, tuning: { backoffBaseSec: 0.1 } });
  core.start(); await sleep(900);
  const rt = warns.filter((w) => w.includes('realtime unavailable'));
  assert.ok(rt.length >= 2 && rt.length <= 4, 'backoff limits retries: ' + rt.length);
  assert.ok(warns.filter((w) => w.includes('town spirit')).length === 1, 'spirit warns once per backoff');
  assert.equal(core.state.online, false);
  core.stop(); ok('offline: exponential backoff, one warn per attempt');
}

// ================================================================== wave 4 (PLAY.md §Net API)
// --- town codes
{
  assert.equal(normTownCode(' abc234 '), 'ABC234'); assert.equal(normTownCode('ABC23'), null); assert.equal(normTownCode('ABC2340'), null);
  assert.equal(normTownCode('ABCDE0'), null, 'no zero'); assert.equal(normTownCode('ABCDEO'), null, 'no O'); assert.equal(normTownCode('ABCDEI'), null, 'no I');
  assert.equal(normTownCode('ABCDE1'), null, 'no 1'); assert.equal(normTownCode('ABCDEL'), null, 'no L'); assert.equal(normTownCode(123456), null); assert.equal(normTownCode(null), null);
  assert.equal(TOWN_ALPHABET.length, 31);
  for (let i = 0; i < 200; i++) assert.ok(normTownCode(makeTownCode()), 'generated codes are valid');
  assert.equal(makeTownCode(() => 0), 'AAAAAA'); assert.equal(makeTownCode(() => 0.99999999), '999999');
  ok('town codes: alphabet, normalise, generate');
}
// --- message validation
{
  for (const e of EMOTES) assert.deepEqual(validateMsg('emote', { e }), { e });
  assert.equal(validateMsg('emote', { e: 'moonwalk' }), null); assert.equal(validateMsg('emote', null), null); assert.equal(validateMsg('emote', ['wave']), null);
  assert.deepEqual(validateMsg('emote', { e: 'wave', extra: '<script>' }), { e: 'wave' }, 'unknown fields stripped');
  assert.deepEqual(validateMsg('say', { p: 'merry-christmas' }), { p: 'merry-christmas' });
  assert.equal(validateMsg('say', { p: 'Hello there!' }), null, 'never free text'); assert.equal(validateMsg('say', { p: 'a'.repeat(25) }), null);
  assert.equal(validateMsg('say', { p: '' }), null);
  assert.deepEqual(validateMsg('snow', { t: 7, x: 1.234, z: -2, tx: 3, tz: 4.567 }), { t: 7, x: 1.23, z: -2, tx: 3, tz: 4.57 });
  assert.deepEqual(validateMsg('snow', { t: 'k3-a', x: 0, z: 0, tx: 0, tz: 0 }).t, 'k3-a');
  assert.equal(validateMsg('snow', { t: 1, x: NaN, z: 0, tx: 0, tz: 0 }), null); assert.equal(validateMsg('snow', { t: 1, x: 0, z: 0, tx: 999, tz: 0 }), null);
  assert.equal(validateMsg('snow', { t: 1, x: '1', z: 0, tx: 0, tz: 0 }), null, 'numbers must be numbers'); assert.equal(validateMsg('snow', { t: -1, x: 0, z: 0, tx: 0, tz: 0 }), null);
  assert.deepEqual(validateMsg('hit', { t: 3, id: '0b5f2c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b' }), { t: 3, id: '0b5f2c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b' });
  assert.equal(validateMsg('hit', { t: 3, id: 'a b' }), null); assert.equal(validateMsg('hit', { t: 3 }), null);
  assert.deepEqual(validateMsg('gift', { g: 'g1', to: 'p-x', r: 'scarf:red' }), { g: 'g1', to: 'p-x', r: 'scarf:red' });
  assert.equal(validateMsg('gift', { g: 'g1', to: 'p-x', r: 'scarf' }), null); assert.equal(validateMsg('gift', { g: 'g1', to: 'p-x', r: 'a:b:c' }), null);
  assert.deepEqual(validateMsg('gift-ok', { g: 1, to: 'p-x', r: 'x:y' }), { g: 1, to: 'p-x' }); assert.deepEqual(validateMsg('gift-no', { g: 1, to: 'p-x' }), { g: 1, to: 'p-x' });
  assert.equal(validateMsg('gift-ok', { g: 1 }), null);
  assert.equal(validateMsg('pos', { x: 1 }), null); assert.equal(validateMsg('chat', { text: 'hi' }), null); assert.equal(validateMsg('__proto__', {}), null);
  ok('message whitelist + per-type validation');
}
// --- ride presence + rate limiter
{
  assert.deepEqual(sanitizeRide({ k: 'ferris', s: 3 }), { k: 'ferris', s: 3 }); assert.deepEqual(sanitizeRide({ k: 'tram', s: -1 }), { k: 'tram', s: 0 });
  assert.equal(sanitizeRide({ k: 'a b', s: 1 }), null); assert.equal(sanitizeRide(null), null); assert.equal(sanitizeRide({ s: 1 }), null);
  assert.deepEqual(sanitizeMeta({ id: 'x', ride: { k: 'carousel', s: 2, junk: 1 } }, 'x').ride, { k: 'carousel', s: 2 });
  assert.equal(sanitizeMeta({ id: 'x' }, 'x').ride, null);
  const L = createRateLimiter(4, 1);
  const r = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => L.allow('a|emote', t));
  assert.deepEqual(r, [true, true, true, true, false, false], '4 per second');
  assert.equal(L.allow('a|say', 0.5), true, 'per type'); assert.equal(L.allow('b|emote', 0.5), true, 'per sender');
  assert.equal(L.allow('a|emote', 1.0), true, 'window slides'); assert.equal(L.allow('a|emote', 1.05), false); assert.equal(L.allow('a|emote', 1.1), true);
  ok('ride presence sanitised, sliding-window rate limit per sender per type');
}
// --- emote poses are finite and settle back to rest
{
  for (const [e, dur] of Object.entries(EMOTE_DUR)) {
    assert.ok(dur >= 1.5 && dur <= 2.5, e + ' duration');
    for (let t = 0; t <= dur; t += 0.05) {
      const p = emotePose(e, t);
      for (const v of Object.values(p.body)) assert.ok(Number.isFinite(v), e + ' body');
      for (const l of Object.values(p.limbs)) if (l) assert.ok(Number.isFinite(l[0]) && Number.isFinite(l[1]), e + ' limb');
    }
    const end = emotePose(e, dur);
    assert.ok(Math.abs(end.body.rx) < 1e-6 && Math.abs(end.body.y) < 1e-6, e + ' ends upright');
  }
  ok('emote poses: 1.5–2.5 s, finite, end at rest');
}
// --- two w4 cores: friend town, messages, mute, rides, town switch, w4 off unchanged
{
  const mem = new Map(); const saved = { v: null }; const store = { load: () => saved.v, save: (o) => { saved.v = o; } };
  const A = mk('a', { prefix: 'w4', w4: true, town: 'abc234' }), B = mk('b', { prefix: 'w4', w4: true, store });
  const P = mk('p', { prefix: 'w4', w4: true }); // stays in the public town
  P.core.start(); P.core.setTracking(true);
  A.core.start(); A.core.setTracking(true);
  await sleep(500);
  B.core.start(); B.core.setTracking(true);
  await sleep(700);
  assert.equal(A.core.town, 'ABC234'); assert.equal(A.core.state.others, 0, 'friend town is separate from the public town');
  assert.equal(B.core.state.others, 1, 'B is in the public town with P');
  assert.ok(A.events.some(([e, d]) => e === 'town' && d.code === 'ABC234' && d.count === 1), 'A got town event');
  // B joins A's town: leaves the public room, P sees B leave
  assert.equal(B.core.setTown('zzzz'), false, 'bad code refused');
  assert.equal(B.core.setTown('abc234'), true);
  await sleep(800);
  assert.equal(B.core.state.others, 1); assert.ok(B.core.remotes.has('a') && !B.core.remotes.has('p'), 'B now sees A only');
  assert.equal(A.core.state.others, 1); assert.ok(P.events.some(([e, d]) => e === 'leave' && d.id === 'b'), 'P saw B leave');
  assert.ok(B.events.some(([e]) => e === 'reset'), 'remotes cleared on town switch');
  assert.ok(A.events.some(([e, d]) => e === 'town' && d.code === 'ABC234' && d.count === 2), 'count follows');
  // messages
  assert.equal(A.core.send('emote', { e: 'wave' }), true);
  assert.equal(A.core.send('say', { p: 'Not allowed!' }), false, 'invalid not sent');
  assert.equal(A.core.send('say', { p: 'merry-christmas' }), true);
  assert.equal(A.core.send('snow', { t: 1, x: 1, z: 2, tx: 3, tz: 4 }), true);
  assert.equal(A.core.send('hit', { t: 1, id: 'b' }), true);
  assert.equal(A.core.send('gift', { g: 'g1', to: 'b', r: 'scarf:red' }), true);
  assert.equal(B.core.send('gift-ok', { g: 'g1', to: 'a' }), true);
  assert.equal(B.core.send('gift-no', { g: 'g2', to: 'a' }), true);
  await sleep(100);
  const got = B.events.filter(([e]) => e === 'msg').map(([, d]) => d);
  assert.deepEqual(got.map((m) => m.type), ['emote', 'say', 'snow', 'hit', 'gift']);
  assert.deepEqual(got[0], { type: 'emote', from: 'a', name: 'A', data: { e: 'wave' } });
  assert.deepEqual(A.events.filter(([e]) => e === 'msg').map(([, d]) => d.type), ['gift-ok', 'gift-no']);
  assert.ok(!P.events.some(([e]) => e === 'msg'), 'public town hears nothing');
  // sender-side limit: 4/s per type
  let sent = 0; for (let i = 0; i < 6; i++) if (A.core.send('emote', { e: 'clap' })) sent++;
  assert.equal(sent, 3, 'one emote already this second → 3 more');
  // receiver-side limit + validation against a raw spammer posting straight onto the channel
  const bc = new BroadcastChannel('test-w4:friends:ABC234');
  const before = B.events.filter(([e]) => e === 'msg').length;
  for (let i = 0; i < 10; i++) bc.postMessage({ t: 'b', event: 'msg', payload: { id: 'a', t: 'say', d: { p: 'hi-' + i } } });
  bc.postMessage({ t: 'b', event: 'msg', payload: { id: 'a', t: 'chat', d: { text: 'free text' } } });
  bc.postMessage({ t: 'b', event: 'msg', payload: { id: 'ghost', t: 'emote', d: { e: 'wave' } } });
  bc.postMessage({ t: 'b', event: 'msg', payload: { id: 'a', t: 'emote', d: { e: 'moonwalk' } } });
  await sleep(100);
  const spam = B.events.filter(([e]) => e === 'msg').slice(before).map(([, d]) => d);
  assert.equal(spam.filter((m) => m.type === 'say').length, 3, 'receiver drops beyond 4/s (1 say earlier this second)');
  assert.ok(!spam.some((m) => m.type === 'chat' || m.from === 'ghost' || m.data.e === 'moonwalk'), 'non-whitelisted / unknown sender / invalid dropped');
  // mute: dropped before 'msg', persisted
  assert.equal(B.core.mute('a', true), true); assert.equal(B.core.isMuted('a'), true);
  assert.deepEqual(saved.v.muted.map((e) => e[0]), ['a'], 'mute persisted in the net store');
  await sleep(1100);
  const n0 = B.events.filter(([e]) => e === 'msg').length;
  assert.equal(A.core.send('emote', { e: 'heart' }), true); await sleep(80);
  assert.equal(B.events.filter(([e]) => e === 'msg').length, n0, 'muted player dropped');
  B.core.mute('a', false); assert.equal(B.core.isMuted('a'), false); assert.equal(saved.v.muted, undefined, 'unmute persisted');
  assert.equal(A.core.send('emote', { e: 'heart' }), true); await sleep(80);
  assert.equal(B.events.filter(([e]) => e === 'msg').length, n0 + 1, 'unmuted again');
  // ride presence
  A.self.ride = { k: 'ferris', s: 2 }; A.core.selfChanged();
  await sleep(700);
  assert.deepEqual(B.core.remotes.get('a').ride, { k: 'ferris', s: 2 });
  assert.ok(B.events.some(([e, d]) => e === 'presence' && d.id === 'a' && d.ride && d.ride.k === 'ferris'), 'presence event');
  A.self.ride = null; A.core.selfChanged(); await sleep(700);
  assert.equal(B.core.remotes.get('a').ride, null);
  assert.ok(B.events.some(([e, d]) => e === 'presence' && d.id === 'a' && d.ride === null), 'ride cleared');
  // leave the town → back in the public town with P
  B.core.setTown(null); await sleep(800);
  assert.equal(B.core.town, null); assert.ok(B.core.remotes.has('p') && !B.core.remotes.has('a'), 'back in public');
  assert.ok(B.events.some(([e, d]) => e === 'town' && d.code === null));
  A.core.stop(); B.core.stop(); P.core.stop(); bc.close();
  ok('w4: friend town join/switch/leave, all message types, rate limits, mute drops + persists, ride presence');
}
// --- full friend town bounces to the public rooms
{
  const tuning = { townCap: 2 };
  const A = mk('a', { prefix: 'w4f', w4: true, town: 'FUZZ22', tuning }), B = mk('b', { prefix: 'w4f', w4: true, town: 'FUZZ22', tuning }), C = mk('c', { prefix: 'w4f', w4: true, town: 'FUZZ22', tuning });
  A.core.start(); A.core.setTracking(true); await sleep(500);
  B.core.start(); B.core.setTracking(true); await sleep(700);
  C.core.start(); C.core.setTracking(true); await sleep(1200);
  assert.equal(B.core.town, 'FUZZ22'); assert.equal(C.core.town, null, 'third player bounced');
  assert.ok(C.events.some(([e, d]) => e === 'town' && d.code === null && d.full === 'FUZZ22'));
  assert.equal(C.core.state.room, 1); assert.equal(C.core.state.online, true);
  A.core.stop(); B.core.stop(); C.core.stop(); ok('full friend town → public town, full event');
}
// --- w4 off: wave-1 protocol (no ride in presence, msgs ignored, no town)
{
  const metas = [];
  const tr = createLocalTransport({ prefix: 'w0:', heartbeatSec: 0.2 });
  const orig = tr.join.bind(tr);
  let hk = null;
  tr.join = (topic, key, h) => { hk = h; const r = orig(topic, key, h); const t = r.track; r.track = (m) => { metas.push({ topic, m }); return t(m); }; return r; };
  const events = [];
  const core = createNetCore({ transport: tr, sid: 'z', clock: () => performance.now() / 1000, getSelf: () => ({ name: 'Z', style: {}, door: null, ride: { k: 'ferris', s: 1 } }), getPlayerId: () => null, emit: (e, d) => events.push([e, d]), log: quiet, town: 'ABC234' });
  core.start(); core.setTracking(true); await sleep(600);
  assert.equal(metas[0].topic, 'town:1'); assert.deepEqual(Object.keys(metas[0].m), ['id', 'name', 'style', 'door'], 'presence unchanged');
  assert.equal(hk.msg, undefined, 'no msg listener'); assert.equal(core.send('emote', { e: 'wave' }), false); assert.equal(core.setTown('ABC234'), false);
  assert.ok(!events.some(([e]) => e === 'town'));
  core.stop(); ok('w4 off: protocol and presence unchanged');
}
console.log(`\n${pass} groups passed`);
process.exit(0);
