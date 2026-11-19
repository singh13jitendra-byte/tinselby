// Pedestrians on the walk loops (some in hand-holding pairs, some carrying gifts), people using the
// pedestrian crossings, and the market: a keeper behind every stall plus browsers in front.
import { Path, turnTo, clamp } from './paths.js';

const TAU = Math.PI * 2;

export function createCrowd(W) {
  const { layout, pool, rnd } = W;
  const P = { x: 0, z: 0, dx: 0, dz: 1 };
  const walkers = [];
  const COUNTS = { plaza: 9, resNorth: 4, resSouth: 4, promenade: 5, parkLoop: 5 };
  const PAIRS = { plaza: 1, resNorth: 0, resSouth: 1, promenade: 1, parkLoop: 1 };

  for (const loop of layout.WALK_LOOPS) {
    // the plaza loop's north edge runs through the two north stalls: walk just behind them instead
    const pts = loop.id === 'plaza' ? loop.pts.map(([x, z]) => [x, z < -4 ? z - 0.65 : z]) : loop.pts;
    const path = new Path(pts, { closed: !loop.pingpong, pingpong: !!loop.pingpong, radius: 0.7 });
    const n = COUNTS[loop.id] ?? 4;
    const pairs = PAIRS[loop.id] ?? 0;
    const total = n + 1; // +1 festive extra
    for (let i = 0; i < total; i++) {
      const s0 = (i / total) * path.cycle + rnd() * 0.5;
      const kid = rnd() < 0.15;
      const d = pool.create({ district: loop.district, rnd, scale: kid ? 0.74 : 0.96 + rnd() * 0.12 });
      const gr = rnd();
      d.gift = gr < 0.13 ? 2 : gr < 0.26 ? 1 : false; // some carry stacks of presents
      const w = { d, path, s: s0, v: 0.36 + rnd() * 0.16, off: (rnd() - 0.5) * 0.24, pause: 0, festiveMin: i >= n ? 1 + (i % 3) : 0, giftMin: rnd() < 0.5 ? 1 + Math.floor(rnd() * 3) : 9, vcur: 0, leader: null, kid };
      walkers.push(w);
      if (i < pairs) {
        const f = pool.create({ district: loop.district, rnd, scale: 0.94 + rnd() * 0.1 });
        const fw = { ...w, d: f, leader: w, gift: false };
        w.off = Math.min(w.off, 0.0) - 0.06;
        w.d.hold = 1; f.hold = -1; w.d.gift = false; f.gift = false; w.giftMin = 9; fw.giftMin = 9;
        walkers.push(fw);
      }
    }
  }

  // ---------------------------------------------------------------- crossers
  const CROSS = [
    { c: [0, 6.5], a: [0.3, 5.2], b: [0.3, 7.8], district: 'market' },
    { c: [-12, 0], a: [-12.25, -1.25], b: [-12.25, 1.25], district: 'residential' },
    { c: [-7.5, 0], a: [-6.2, 0.3], b: [-8.8, 0.3], district: 'market' },
    { c: [7.5, 0], a: [6.2, -0.3], b: [8.8, -0.3], district: 'market' },
  ];
  const crossers = CROSS.map((cr, i) => {
    const d = pool.create({ district: cr.district, rnd, scale: 0.95 + rnd() * 0.1 });
    d.gift = i === 1 ? 2 : i === 3 ? 1 : false;
    d.x = cr.a[0]; d.z = cr.a[1];
    return { d, cr, side: 0, state: 'wait', t: 1 + rnd() * 4, prog: 0 };
  });

  // ---------------------------------------------------------------- market
  const keepers = [], browsers = [];
  layout.MARKET.stalls.forEach((st, i) => {
    const l = Math.hypot(st.x, st.z) || 1;
    const nx = -st.x / l, nz = -st.z / l; // towards the plaza centre
    const k = pool.create({ district: 'market', rnd, scale: 1.02 });
    k.x = st.x - nx * 0.12; k.z = st.z - nz * 0.12; k.yaw = Math.atan2(nx, nz);
    keepers.push({ d: k, home: [k.x, k.z], yaw: k.yaw, wave: 0, next: 2 + rnd() * 8 });
    const nb = i % 3 === 0 ? 2 : 1;
    for (let j = 0; j < nb; j++) {
      const lat = nb === 2 ? (j ? 0.2 : -0.2) : (rnd() - 0.5) * 0.2;
      const kid = nb === 2 && j === 1;
      const b = pool.create({ district: 'market', rnd, scale: kid ? 0.74 : 0.95 + rnd() * 0.12 });
      b.x = st.x + nx * (0.72 + rnd() * 0.12) + -nz * lat; b.z = st.z + nz * (0.72 + rnd() * 0.12) + nx * lat;
      [b.x, b.z] = W.findFree(b.x, b.z, 0, 0.08); // step out of any prop the city put here
      b.yaw = Math.atan2(st.x - b.x, st.z - b.z) + (rnd() - 0.5) * 0.4;
      b.gift = rnd() < 0.3 ? (rnd() < 0.5 ? 2 : 1) : false;
      browsers.push({ d: b, home: [b.x, b.z], yaw: b.yaw, point: 0, next: 1 + rnd() * 6, look: rnd() * TAU });
    }
  });

  const all = [...walkers.map((w) => w.d), ...crossers.map((c) => c.d), ...keepers.map((k) => k.d), ...browsers.map((b) => b.d)];
  /** People that vehicles must look out for. */
  const roadPeople = [...walkers.map((w) => w.d), ...crossers.map((c) => c.d)];

  const isFree = (x, z) => { const [fx, fz] = W.findFree(x, z, 0, 0.08); return Math.abs(fx - x) + Math.abs(fz - z) < 0.05; };
  function updateWalkers(dt, t) {
    const pl = W.ctx.player.pos;
    for (const w of walkers) {
      const d = w.d;
      d.active = W.festive >= w.festiveMin;
      if (d.gather) continue;
      if (!d.active) { d.vis = false; continue; }
      const L = w.leader;
      if (!L) {
        if (!w._pair && !w.kid) d.gift = d.gift || (W.festive >= w.giftMin ? (W.festive >= 3 ? 2 : 1) : false);
        // pause to look around / chat
        if (w.pause > 0) w.pause -= dt;
        else if (rnd() < dt * 0.05) {
          w.pause = 1.5 + rnd() * 2.5;
          if (w._pair && W.near(d.x, d.z, 5)) W.sfx('chatter', d.x, d.z);
        }
        let target = w.pause > 0 ? 0 : w.v;
        // don't walk into the player
        const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
        const px = pl.x - d.x, pz = pl.z - d.z;
        const ahead = px * fx + pz * fz, side = Math.abs(px * fz - pz * fx);
        if (ahead > 0 && ahead < 0.55 && side < 0.22) target = 0;
        w.vcur += (target - w.vcur) * (1 - Math.exp(-dt * 5));
        w.s += w.vcur * dt;
      } else {
        w.s = L.s; w.vcur = L.vcur; w.pause = L.pause;
      }
      const path = w.path;
      path.at(w.s, P);
      const off = L ? L.off + 0.22 : w.off;
      let px0 = P.x - P.dz * off, pz0 = P.z + P.dx * off;
      // make room for the tram / cars when the loop runs beside the road or rails (eased, so nobody pops)
      const dg = W.vehicleDodge(px0, pz0, isFree);
      const k6 = 1 - Math.exp(-dt * 6);
      w.ddx = (w.ddx || 0) + ((dg ? dg.dx : 0) - (w.ddx || 0)) * k6;
      w.ddz = (w.ddz || 0) + ((dg ? dg.dz : 0) - (w.ddz || 0)) * k6;
      if (Math.abs(w.ddx) + Math.abs(w.ddz) > 0.005) { px0 += w.ddx; pz0 += w.ddz; }
      d.x = px0;
      d.z = pz0;
      d.y = W.groundAt(d.x, d.z);
      const chat = w.pause > 0 && (L || w._pair);
      let face = Math.atan2(P.dx, P.dz);
      if (chat) face += L ? -Math.PI / 2 : Math.PI / 2; // pairs turn to each other
      d.yaw = turnTo(d.yaw, face, dt * 6);
      const k = clamp(w.vcur / 0.3, 0, 1);
      d.amp = k * (w.kid ? 1.2 : 1);
      d.phase += dt * (5.2 + w.vcur * 4) * (k > 0.02 ? 1 : 0);
      d.armMode = d.gift ? 'carry' : 'swing';
      d.headYaw = w.pause > 0 && !chat ? Math.sin(t * 1.3 + d.id) * 0.6 : 0;
      d.hold = chat ? 0 : (L ? -1 : (w._pair ? 1 : 0)); // pairs hold hands, let go while chatting
      d.vis = true;
    }
  }
  // remember who leads a pair so hands can re-join after chatting
  for (const w of walkers) if (w.leader) w.leader._pair = true;

  function updateCrossers(dt, t) {
    for (const c of crossers) {
      const d = c.d;
      d.active = true;
      if (d.gather) continue;
      const { a, b } = c.cr;
      const from = c.side ? b : a, to = c.side ? a : b;
      if (c.state === 'wait') {
        d.x = from[0]; d.z = from[1];
        d.yaw = turnTo(d.yaw, Math.atan2(to[0] - from[0], to[1] - from[1]), dt * 4);
        d.amp += (0 - d.amp) * Math.min(1, dt * 6);
        d.headYaw = Math.sin(t * 0.9 + d.id) * 0.7; // look both ways
        c.t -= dt;
        if (c.t <= 0) {
          if (W.vehicleNear(c.cr.c[0], c.cr.c[1], 1.7)) c.t = 0.5;
          else { c.state = 'cross'; c.prog = 0; }
        }
      } else {
        const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
        c.prog += (0.5 * dt) / len;
        const u = Math.min(1, c.prog);
        d.x = from[0] + (to[0] - from[0]) * u;
        d.z = from[1] + (to[1] - from[1]) * u;
        d.yaw = turnTo(d.yaw, Math.atan2(to[0] - from[0], to[1] - from[1]), dt * 8);
        d.amp += (1 - d.amp) * Math.min(1, dt * 6);
        d.phase += dt * 7;
        d.headYaw = 0;
        if (u >= 1) { c.side ^= 1; c.state = 'wait'; c.t = 4 + rnd() * 7; }
      }
      d.armMode = d.gift ? 'carry' : 'swing';
      d.y = W.groundAt(d.x, d.z);
      d.vis = true;
    }
  }

  function updateMarket(dt, t) {
    for (const k of keepers) {
      const d = k.d;
      d.active = true; d.vis = true;
      if (d.gather) continue;
      d.x = k.home[0]; d.z = k.home[1]; d.y = W.groundAt(d.x, d.z);
      d.yaw = turnTo(d.yaw, k.yaw, dt * 4);
      d.headYaw = Math.sin(t * 0.45 + d.id * 1.7) * 0.5;
      d.sway = Math.sin(t * 0.9 + d.id) * 0.03;
      d.amp = 0;
      d.armMode = 'custom';
      k.next -= dt;
      if (k.next <= 0 && k.wave <= 0) { k.wave = 1.6; k.next = 5 + rnd() * 9; }
      if (k.wave > 0) {
        k.wave -= dt;
        d.aLx = -0.5; d.aLz = 0; d.aRx = -0.2; d.aRz = 2.2 + Math.sin(t * 12) * 0.35; // waving
      } else { d.aLx = d.aRx = -0.55; d.aLz = d.aRz = -0.1; } // hands on the counter
    }
    for (const b of browsers) {
      const d = b.d;
      d.active = true; d.vis = true;
      if (d.gather) continue;
      d.x = b.home[0]; d.z = b.home[1]; d.y = W.groundAt(d.x, d.z);
      d.yaw = turnTo(d.yaw, b.yaw + Math.sin(t * 0.3 + d.id) * 0.25, dt * 3);
      d.sway = Math.sin(t * 0.8 + d.id * 2.1) * 0.04;
      d.headYaw = Math.sin(t * 0.6 + b.look) * 0.45;
      d.amp = 0;
      b.next -= dt;
      if (b.next <= 0 && b.point <= 0) { b.point = 1.2; b.next = 4 + rnd() * 7; if (W.near(d.x, d.z, 4) && rnd() < 0.3) W.sfx('chatter', d.x, d.z); }
      if (d.gift) d.armMode = 'carry';
      else if (b.point > 0) { b.point -= dt; d.armMode = 'custom'; d.aLx = 0; d.aLz = 0; d.aRx = -1.35; d.aRz = 0.05; }
      else { d.armMode = 'custom'; d.aLx = d.aRx = -0.15; d.aLz = d.aRz = 0; }
    }
  }

  return {
    all, roadPeople,
    gatherable: all,
    update(dt, t) { updateWalkers(dt, t); updateCrossers(dt, t); updateMarket(dt, t); },
  };
}
