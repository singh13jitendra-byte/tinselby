// Run: node src/net/core.test.mjs  — unit tests for src/net/core.js + the local transport (node 22: BroadcastChannel + performance are global).
import assert from 'node:assert/strict';
import { createNetCore, SnapBuffer, nextRoom, sendRates, sanitizeStyle, sanitizeMeta, encodePos, decodePos, TUNING } from './core.js';
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
  const tr = createLocalTransport({ prefix: 'test-' + extra.prefix + ':', heartbeatSec: 0.2, expireSec: 1.5 });
  const self = { name: sid.toUpperCase(), style: { coat: 'teal', hair: 'bun' }, door: 3 };
  const core = createNetCore({ transport: tr, sid, clock: () => performance.now() / 1000, getSelf: () => self, getPlayerId: () => extra.pid || null,
    emit: (e, d) => events.push([e, d]), log: quiet, tuning: extra.tuning, store: extra.store });
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
console.log(`\n${pass} groups passed`);
process.exit(0);
