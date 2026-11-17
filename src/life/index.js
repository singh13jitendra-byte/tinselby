// Tinselby city life (CONTRACTS.md §Life): instanced knitted dolls (pedestrians, market, park kids,
// skaters, sledders) plus the festive tram, cars and the horse-drawn carriage (carriage.js, driven by traffic.js). buildLife(ctx) → { gatherAt, release, cheer, setFestive }.
import { mulberry32 } from '../core/yarn.js';
import { createDollPool } from './dolls.js';
import { createCrowd } from './crowd.js';
import { createKids } from './kids.js';
import { createSkaters } from './skaters.js';
import { createSledders } from './sledders.js';
import { createTraffic } from './traffic.js';
import { turnTo, clamp } from './paths.js';

export function buildLife(ctx) {
  const { engine, game, layout, params } = ctx;
  const pool = createDollPool(engine, 110);
  const revealT = new Map(); // district id → engine time when revealed
  const time = () => engine.time;

  const W = {
    ctx, engine, layout, pool, rnd: mulberry32(20261224), festive: 0,
    isRevealed: (id) => revealT.has(id),
    groundAt: (x, z) => (ctx.colliders?.heightAt ? ctx.colliders.heightAt(x, z) : 0),
    near: (x, z, r) => { const p = ctx.player.pos; return (p.x - x) ** 2 + (p.z - z) ** 2 < r * r; },
    sfx: (name, x, z) => { try { ctx.audio?.sfx?.(name, { x, z }); } catch (e) { /* audio optional */ } },
    vehicleNear: () => false,
    /** Nearest spot to (x, z) where a ring of radius ringR (plus clearance) touches no collider. */
    findFree(x, z, ringR = 0, clr = 0.12) {
      const col = ctx.colliders;
      if (!col?.resolve) return [x, z];
      const q = { x: 0, z: 0 };
      const clear = (cx, cz) => {
        const n = ringR > 0 ? 8 : 0;
        for (let i = -1; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          q.x = i < 0 ? cx : cx + Math.cos(a) * ringR; q.z = i < 0 ? cz : cz + Math.sin(a) * ringR;
          const ox = q.x, oz = q.z;
          col.resolve(q, clr);
          if (Math.abs(q.x - ox) + Math.abs(q.z - oz) > 0.005 || col.blocked?.(ox, oz)) return false;
        }
        return true;
      };
      for (let rr = 0; rr <= 2.4; rr += 0.3) {
        const n = rr === 0 ? 1 : 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const cx = x + Math.cos(a) * rr, cz = z + Math.sin(a) * rr;
          if (clear(cx, cz)) return [cx, cz];
        }
      }
      return [x, z];
    },
  };

  const crowd = createCrowd(W);
  const kids = createKids(W);
  const skaters = createSkaters(W);
  const sledders = createSledders(W);
  const traffic = createTraffic(W);
  W.vehicleNear = traffic.vehicleNear;
  const modules = [crowd, kids, skaters, sledders];
  const roadPeople = [...crowd.roadPeople];
  const gatherable = [...crowd.gatherable, ...kids.gatherable];

  // ---------------------------------------------------------------- reveal
  const revealAll = () => { for (const d of layout.DISTRICTS) if (!revealT.has(d.id)) revealT.set(d.id, time()); };
  game.on('district:revealed', ({ id } = {}) => { if (id && !revealT.has(id)) revealT.set(id, time()); });
  game.on('game:start', () => {
    // the city folds every district back into the book at game start; districts pop up again on entry
    if (params.has('reveal')) return;
    revealT.clear();
  });
  if (params.has('reveal')) revealAll();
  // stay in step with the city's own state (it starts fully revealed for the entry screen without
  // emitting events, and folds everything at game start)
  let syncT = 0;
  function syncReveal(dt, now) {
    syncT -= dt;
    if (syncT > 0) return;
    syncT = 0.2;
    const isRev = ctx.city?.isRevealed;
    if (typeof isRev !== 'function') return;
    for (const d of layout.DISTRICTS) {
      const on = !!isRev(d.id);
      if (on && !revealT.has(d.id)) revealT.set(d.id, now);
      else if (!on && revealT.has(d.id) && !params.has('reveal') && !gatherPoint) revealT.delete(d.id);
    }
  }

  // ---------------------------------------------------------------- gathering (finale)
  let gatherPoint = null;
  function gatherAt(x, z, radius = 1.6) {
    gatherPoint = { x, z };
    const R0 = Math.max(0.9, radius);
    const pool2 = gatherable.filter((d) => revealT.has(d.district) || d.vis);
    pool2.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
    const crowdN = Math.min(pool2.length, 36);
    // slots on rings around the point, skipping the sleigh landing and solid props
    const slots = [];
    const land = layout.MARKET.landing;
    const tmp = { x: 0, z: 0 };
    for (let ring = 0; ring < 6 && slots.length < crowdN * 1.4; ring++) {
      const r = R0 + ring * 0.42;
      const n = Math.floor((Math.PI * 2 * r) / 0.36);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.37;
        tmp.x = x + Math.cos(a) * r; tmp.z = z + Math.sin(a) * r;
        if (Math.abs(tmp.x - land.x) < 1.9 && Math.abs(tmp.z - land.z) < 1.4) continue;
        const ox = tmp.x, oz = tmp.z;
        ctx.colliders?.resolve?.(tmp, 0.1);
        if (Math.hypot(tmp.x - ox, tmp.z - oz) > 0.05) continue;
        if (ctx.colliders?.blocked?.(tmp.x, tmp.z)) continue;
        slots.push({ x: tmp.x, z: tmp.z, used: false });
      }
    }
    for (let i = 0; i < crowdN; i++) {
      const d = pool2[i];
      let best = null, bd = Infinity;
      for (const s of slots) { if (s.used) continue; const dd = (s.x - d.x) ** 2 + (s.z - d.z) ** 2; if (dd < bd) { bd = dd; best = s; } }
      if (!best) break;
      best.used = true;
      const g = { tx: best.x, tz: best.z, home: [d.x, d.z], returning: false, arrived: false };
      // far away: start just outside the crowd so everyone arrives in time
      const dist = Math.hypot(d.x - best.x, d.z - best.z);
      if (dist > 9) { const a = Math.atan2(best.z - z, best.x - x); d.x = best.x + Math.cos(a) * 5; d.z = best.z + Math.sin(a) * 5; g.teleported = true; }
      d.gather = g; d.alwaysVis = true; d.vis = true; d.active = true;
      if (!revealT.has(d.district)) revealT.set(d.district, time() - 5);
    }
  }
  function release() {
    gatherPoint = null;
    for (const d of gatherable) if (d.gather) { d.gather.returning = true; d.gather.arrived = false; }
  }
  function cheer() {
    for (const d of pool.dolls) if (d.vis) { d.cheerT = 2.6 + W.rnd() * 0.8; d.cheerDelay = W.rnd() * 0.4; }
    const p = gatherPoint || ctx.player.pos;
    W.sfx('cheer', p.x, p.z);
  }
  function setFestive(level) { W.festive = clamp(level | 0, 0, 4); }

  const pos = { x: 0, z: 0 };
  function updateGather(dt, t) {
    for (const d of gatherable) {
      const g = d.gather;
      if (!g) continue;
      const tx = g.returning ? g.home[0] : g.tx, tz = g.returning ? g.home[1] : g.tz;
      const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
      d.sit = 0; d.legMode = 'walk'; d.pitch = 0;
      if (dist > 0.04) {
        const sp = Math.min(1.25, dist * 3) * dt;
        const px = d.x, pz = d.z;
        d.x += (dx / dist) * sp; d.z += (dz / dist) * sp;
        if (ctx.colliders?.resolve && dist > 0.4) { pos.x = d.x; pos.z = d.z; ctx.colliders.resolve(pos, 0.07, px, pz); d.x = pos.x; d.z = pos.z; }
        d.yaw = turnTo(d.yaw, Math.atan2(dx, dz), dt * 8);
        d.amp = 1; d.phase += dt * 8; d.lean = 0.05; d.sway = 0; d.headYaw = 0;
        d.armMode = d.gift ? 'carry' : 'swing';
      } else {
        if (g.returning) { d.gather = null; d.alwaysVis = false; continue; }
        g.arrived = true;
        d.amp = 0; d.lean = 0;
        const gp = gatherPoint || { x: g.tx, z: g.tz };
        d.yaw = turnTo(d.yaw, Math.atan2(gp.x - d.x, gp.z - d.z), dt * 5);
        d.headYaw = Math.sin(t * 0.7 + d.id) * 0.15;
        d.sway = Math.sin(t * 1.1 + d.id) * 0.03;
        if (!d.gift) { d.armMode = 'custom'; d.aLx = d.aRx = -0.1; d.aLz = d.aRz = 0; }
      }
      d.y = W.groundAt(d.x, d.z);
    }
  }

  // ---------------------------------------------------------------- hide a district's ambient people (mini-games)
  const hidden = new Map(); // district id → hold count
  function hideDistrict(id) {
    hidden.set(id, (hidden.get(id) || 0) + 1);
    let done = false;
    return () => { if (done) return; done = true; const n = (hidden.get(id) || 1) - 1; if (n > 0) hidden.set(id, n); else hidden.delete(id); };
  }

  // ---------------------------------------------------------------- per-frame
  const perf = { ms: 0, n: 0 };
  engine.addUpdate((dt, t) => {
    const t0 = performance.now();
    const now = time();
    syncReveal(dt, now);
    for (const m of modules) m.update(dt, t);
    updateGather(dt, t);
    traffic.update(dt, t, roadPeople);
    // reveal pop-in (squash & stretch) and hide unrevealed districts
    for (const d of pool.dolls) {
      if (hidden.size && !d.gather && hidden.has(d.district)) { d.pop = 0; continue; }
      const rt = revealT.get(d.district);
      if (rt === undefined) { if (!d.gather) d.vis = false; d.pop = 0; continue; }
      const a = (now - rt - 0.35 - d.stagger) / 0.45;
      d.pop = a <= 0 ? 0 : a >= 1 ? 1 : 1 + 2.2 * (a - 1) ** 3 + 1.2 * (a - 1) ** 2; // ease-out-back
    }
    const cam = engine.camera.position, f = engine.focus;
    const camDist = Math.hypot(cam.x - f.x, cam.y - f.y, cam.z - f.z);
    pool.update(dt, t, f, clamp(camDist * 0.85 + 3, 9, 32));
    perf.ms = perf.ms * 0.95 + (performance.now() - t0) * 0.05;
  }, 5);

  return { gatherAt, release, cheer, setFestive, hideDistrict, perf, _debug: { pool, traffic, revealT, W } };
}
