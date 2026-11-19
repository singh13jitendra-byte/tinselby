// Snowballs between players (PLAY.md §Snow & gifts). Owned by the Snow & gifts agent.
//   createSnowball(ctx) → { throwAt(id), throwNearest(), nearby(), allowed(), register(social), actions, update(dt), dispose() }
// Throw: arc from your hand to the target's position (pooled InstancedMesh: balls + splat puffs share ONE draw call),
// net.send('snow', {t, x, z, tx, tz}); at landing a simple distance test against the target's doll decides the hit →
// net.send('hit', {t, id}) + target doll.stagger. Receiving 'snow' draws the arc from that doll; receiving 'hit' on you
// puffs snow on your player + toast "<name> got you with a snowball!". Cosmetic only: no damage, no score. Cooldown 1 s.
// Off unless W4 (src/net/play-flag.js); never throws; all net / social calls are `?.`-guarded.
import { W4 } from '../net/play-flag.js';
import { sph } from '../core/prims.js';
import { FELT } from '../core/yarn.js';
import { ICONS } from '../ui/icons.js';
import './snow.css';

const RANGE = 12;        // people-card / HUD button range (m)
const MAX_THROW = 16;    // a person-card throw at someone farther than this is refused with a toast
const COOLDOWN = 1.0;    // s
const HIT_R = 1.0;       // landing distance from the target's doll that counts as a hit (m, generous for latency)
const BALLS = 10, PUFFS = 56;
const SNOW_COL = '#fbfaf6';
const TAU = Math.PI * 2;
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (Number.isFinite(+v) ? +v : NaN);

export function createSnowball(ctx) {
  const dead = { throwAt: () => false, throwNearest: () => false, nearby: () => [], allowed: () => false, register() {}, actions: [], update() {}, dispose() {} };
  if (!W4) return dead;
  try { return build(ctx); } catch (e) { console.warn('[snowball] disabled after a setup error:', e); return dead; }
}

function build(ctx) {
  const { THREE, engine, game, player, colliders } = ctx;
  const net = () => ctx.net;
  const toast = (text, ms = 2600) => { try { game.emit('ui:toast', { text, ms }); } catch (e) { /* */ } };
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };

  // ---------------------------------------------------------------- pooled fx (one InstancedMesh = one draw call)
  const geo = sph(1, SNOW_COL, FELT, 10, 7);
  const mesh = new THREE.InstancedMesh(geo, engine.mat, BALLS + PUFFS);
  mesh.name = 'snow-fx';
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  engine.scene.add(mesh);
  const V = new THREE.Vector3(), SC = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion();
  const put = (i, x, y, z, s) => { V.set(x, y, z); SC.set(s, s, s); M4.compose(V, Q0, SC); mesh.setMatrixAt(i, M4); };

  /** flights: { t0, dur, fx, fy, fz, tx, ty, tz, peak, done: fn|null } · puffs: { x, y, z, vx, vy, vz, t, life, r } */
  const flights = [], puffs = [];
  let clock = 0;
  function puff(x, y, z, n, s = 1) {
    for (let i = 0; i < n; i++) {
      if (puffs.length >= PUFFS) puffs.shift();
      const a = Math.random() * TAU, up = 0.5 + Math.random() * 1.0, sp = (0.35 + Math.random() * 0.55) * s;
      puffs.push({ x, y, z, vx: Math.cos(a) * sp, vy: up * s, vz: Math.sin(a) * sp, t: 0, life: 0.4 + Math.random() * 0.25, r: (0.02 + Math.random() * 0.022) * s });
    }
  }
  function launch(fx, fy, fz, tx, tz, done) {
    const ty = colliders.heightAt(tx, tz) + 0.3;
    const d = Math.hypot(tx - fx, tz - fz);
    if (flights.length >= BALLS) { const f = flights.shift(); f.done?.(); }
    flights.push({ t0: clock, dur: Math.min(1.3, Math.max(0.45, d / 9)), fx, fy, fz, tx, ty, tz, peak: 0.5 + d * 0.09, done });
  }
  function frame(dt) {
    clock += dt;
    let n = 0;
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i], k = (clock - f.t0) / f.dur;
      if (k >= 1) {
        flights.splice(i, 1);
        puff(f.tx, f.ty, f.tz, 9, 1);
        try { f.done?.(); } catch (e) { console.warn('[snowball]', e); }
      }
    }
    for (const f of flights) {
      const k = Math.min(1, (clock - f.t0) / f.dur);
      put(n++, f.fx + (f.tx - f.fx) * k, f.fy + (f.ty - f.fy) * k + Math.sin(Math.PI * k) * f.peak, f.fz + (f.tz - f.fz) * k, 0.05);
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i];
      q.t += dt;
      if (q.t >= q.life) { puffs.splice(i, 1); continue; }
      q.vy -= 3.2 * dt;
      q.vx *= 1 - dt * 2.5; q.vz *= 1 - dt * 2.5;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.03) { q.y = 0.03; q.vy = 0; }
    }
    for (const q of puffs) { if (n >= BALLS + PUFFS) break; put(n++, q.x, q.y, q.z, q.r * (0.4 + 0.6 * (1 - q.t / q.life))); }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- state / rules
  let cdUntil = 0;
  const seen = new Set();            // recent throw ids already handled (hit de-dupe)
  const throwers = new Map();        // t → { x, z } for stagger direction
  const remember = (set, v) => { set.add(v); if (set.size > 60) set.delete(set.values().next().value); };
  const newId = () => Math.floor(Math.random() * 1e9) + 1;
  const bodyHas = (c) => typeof document !== 'undefined' && document.body.classList.contains(c);
  /** Throwing / drawing is allowed only in free play: not in mini-games, the finale, rides or photo mode. */
  function allowed() {
    try {
      if (game.state.phase !== 'play') return false;
      if (ctx.minigames?.active || ctx.finale?.running) return false;
      if (ctx.rides?.active) return false;
      if (bodyHas('tb-photo') || ctx.photo?.active) return false;
      return true;
    } catch (e) { return false; }
  }
  const ready = () => typeof net()?.send === 'function' && !!net()?.id;
  // Where player id is: their drawn doll, else their streamed position. A doll handle that isn't drawn falls back to
  // the raw remote state, which is (0, 0) until the first position packet arrives: never aim there.
  const posOf = (id) => {
    const d = net()?.doll?.(id);
    if (d && d.visible && Number.isFinite(d.x)) return { x: d.x, z: d.z };
    const p = net()?.players?.().find((q) => q.id === id);
    return p ? { x: p.x, z: p.z } : null;
  };
  const idOf = (p) => (p && typeof p === 'object' ? p.id : p);
  /** Players within RANGE of you, nearest first: [{id, name, d}] */
  function nearby(range = RANGE) {
    const out = [];
    try {
      const px = player.pos.x, pz = player.pos.z;
      for (const p of net()?.players?.() || []) {
        const q = posOf(p.id) || p;
        const d = Math.hypot(q.x - px, q.z - pz);
        if (d <= range) out.push({ id: p.id, name: p.name, d });
      }
    } catch (e) { /* */ }
    return out.sort((a, b) => a.d - b.d);
  }

  const handY = () => colliders.heightAt(player.pos.x, player.pos.z) + 0.5;

  /** Throw at player `id` (string or {id}). Returns true if a ball left your hand. */
  function throwAt(who) {
    const id = idOf(who);
    if (!id || !allowed() || !ready()) return false;
    if (performance.now() < cdUntil) return false;
    const tp = posOf(id);
    if (!tp) return false;
    const d = Math.hypot(tp.x - player.pos.x, tp.z - player.pos.z);
    if (d > MAX_THROW) { toast('Too far away: walk a bit closer!', 2200); return false; }
    cdUntil = performance.now() + COOLDOWN * 1000;
    updateBtn(true);
    const t = newId();
    const fx = player.pos.x, fz = player.pos.z, tx = tp.x, tz = tp.z;
    try { player.faceTowards?.(tx, tz); } catch (e) { /* */ }
    try { net().send('snow', { t, x: r2(fx), z: r2(fz), tx: r2(tx), tz: r2(tz) }); } catch (e) { /* */ }
    sfx('whoosh');
    launch(fx, handY(), fz, tx, tz, () => {
      // local hit test at landing: is the target's doll still near where I aimed?
      const cur = posOf(id);
      if (!cur || Math.hypot(cur.x - tx, cur.z - tz) > HIT_R) return;
      try { net().send('hit', { t, id }); } catch (e) { /* */ }
      stagger(id, tx - fx, tz - fz);
      sfx('pop');
    });
    return true;
  }
  function throwNearest() { const n = nearby()[0]; return n ? throwAt(n.id) : false; }
  function stagger(id, dx, dz) {
    try { const l = Math.hypot(dx, dz) || 1; net()?.doll?.(id)?.stagger?.(dx / l, dz / l); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------- incoming
  const offMsg = game.on('net:msg', (m) => {
    try { onMsg(m || {}); } catch (e) { console.warn('[snowball]', e); }
  });
  function onMsg({ type, from, name, data }) {
    if (!data || (type !== 'snow' && type !== 'hit')) return;
    if (type === 'snow') {
      const tx = num(data.tx), tz = num(data.tz);
      if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
      const d = net()?.doll?.(from);
      let fx = num(data.x), fz = num(data.z);
      if (d && Number.isFinite(d.x)) { fx = d.x; fz = d.z; }
      if (!Number.isFinite(fx) || !Number.isFinite(fz)) return;
      throwers.set(data.t, { x: fx, z: fz });
      if (throwers.size > 60) throwers.delete(throwers.keys().next().value);
      if (!allowed()) return;
      launch(fx, colliders.heightAt(fx, fz) + 0.5, fz, tx, tz, null);
      return;
    }
    // hit {t, id}
    if (seen.has(data.t)) return;
    remember(seen, data.t);
    const th = throwers.get(data.t) || posOf(from);
    if (data.id === net()?.id) {
      if (allowed()) hitMe(name || 'Someone');
      return;
    }
    const tp = posOf(data.id);
    if (th && tp) stagger(data.id, tp.x - th.x, tp.z - th.z);
  }
  let lastHitToast = 0;
  function hitMe(name) {
    const p = player.pos;
    puff(p.x, colliders.heightAt(p.x, p.z) + 0.38, p.z, 14, 1.3);
    sfx('pop');
    splat();
    const now = performance.now();
    if (now - lastHitToast > 900) { lastHitToast = now; toast(`${name} got you with a snowball!`, 3000); }
  }

  // ---------------------------------------------------------------- DOM: screen splat + fallback HUD button
  let splatEl = null;
  function splat() {
    const host = ctx.uiRoot;
    if (!host) return;
    if (!splatEl) { splatEl = document.createElement('div'); splatEl.className = 'sn-splat'; host.appendChild(splatEl); }
    splatEl.style.setProperty('--sx', `${35 + Math.random() * 30}%`);
    splatEl.style.setProperty('--sy', `${40 + Math.random() * 25}%`);
    splatEl.classList.remove('on'); void splatEl.offsetWidth; splatEl.classList.add('on');
  }
  let btn = null, btnWanted = false, useHud = false;
  function makeBtn() {
    if (btn || !ctx.uiRoot) return;
    btn = document.createElement('button');
    btn.className = 'knit-btn round sn-btn';
    btn.setAttribute('aria-label', 'Throw a snowball');
    btn.innerHTML = ICONS.snowflake;
    btn.hidden = true;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => { e.stopPropagation(); throwNearest(); });
    ctx.uiRoot.appendChild(btn);
  }
  function updateBtn(force) {
    if (!btn) return;
    const show = btnWanted && allowed();
    btn.hidden = !show;
    btn.classList.toggle('cool', performance.now() < cdUntil);
    if (force) return;
  }

  // ---------------------------------------------------------------- people-card / HUD registration (Social UI)
  const actions = [{
    id: 'snowball', label: 'Throw snowball', icon: ICONS.snowflake,
    when: (p) => allowed() && ready() && (!idOf(p) || !!posOf(idOf(p))),
    run: (p) => { throwAt(p); },
  }];
  let registered = false, waited = 0;
  function register(social) {
    if (registered || !social) return;
    registered = true;
    for (const a of actions) { try { social.addPersonAction?.(a); } catch (e) { console.warn('[snowball] addPersonAction', e); } }
    if (typeof social.addHudButton === 'function') {
      useHud = true;
      try {
        social.addHudButton({ id: 'snowball', label: 'Throw snowball', icon: ICONS.snowflake, when: () => btnWanted && allowed(), run: () => { throwNearest(); } });
      } catch (e) { useHud = false; }
    }
    if (!useHud) makeBtn();
  }

  let acc = 0;
  const off = engine.addUpdate((dt) => {
    frame(Math.min(dt, 0.1));
    if (!registered) { // Social UI's index.js may build us before ctx.social exists: pick it up when it appears
      if (ctx.social) register(ctx.social);
      else if ((waited += dt) > 4) { registered = true; makeBtn(); }
    }
    acc += dt;
    if (acc > 0.25) { acc = 0; btnWanted = allowed() && ready() && nearby().length > 0; }
    updateBtn();
  }, 55);

  return {
    throwAt, throwNearest, nearby, allowed, register, actions,
    update: frame,
    get flying() { return flights.length; },
    /** test hook: same as receiving a hit on me */
    _hitMe: hitMe,
    dispose() { try { off?.(); offMsg?.(); } catch (e) { /* */ } engine.scene.remove(mesh); geo.dispose(); btn?.remove(); splatEl?.remove(); },
  };
}
