// Skaters on little steel blades gliding figure-eights on the frozen lake (a couple and two kids holding hands).
import { clamp } from './paths.js';

const TAU = Math.PI * 2;

export function createSkaters(W) {
  const { pool, rnd, layout } = W;
  const L = layout.LAKE;
  const C = L.center;
  const inLake = (x, z, m = 0.78) => ((x - C.x) / L.rx) ** 2 + ((z - C.z) / L.rz) ** 2 <= m;

  const skaters = [];
  const mkCurve = (i) => {
    // figure-eight (lemniscate of Gerono) shrunk until it fits inside the ice ellipse
    let a = 2.7 + rnd() * 0.6, b = 2.0 + rnd() * 0.5;
    const rot = (rnd() - 0.5) * 0.8 + (i % 2 ? Math.PI / 2 * 0.25 : 0);
    const ox = (rnd() - 0.5) * 0.8, oz = (rnd() - 0.5) * 0.5;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let tries = 0; tries < 12; tries++) {
      let ok = true;
      for (let k = 0; k < 24 && ok; k++) {
        const t = (k / 24) * TAU;
        const lx = a * Math.sin(t), lz = b * Math.sin(t) * Math.cos(t);
        if (!inLake(C.x + ox + lx * c - lz * s, C.z + oz + lx * s + lz * c)) ok = false;
      }
      if (ok) break;
      a *= 0.9; b *= 0.9;
    }
    return { a, b, c, s, ox, oz };
  };
  const pos = (cv, t, off, out) => {
    const lx = cv.a * Math.sin(t), lz = cv.b * Math.sin(t) * Math.cos(t);
    const dx = cv.a * Math.cos(t), dz = cv.b * Math.cos(2 * t);
    const wx = dx * cv.c - dz * cv.s, wz = dx * cv.s + dz * cv.c, wl = Math.hypot(wx, wz) || 1;
    out.x = C.x + cv.ox + lx * cv.c - lz * cv.s - (wz / wl) * off;
    out.z = C.z + cv.oz + lx * cv.s + lz * cv.c + (wx / wl) * off;
    out.dx = wx / wl; out.dz = wz / wl; out.sp = wl;
    return out;
  };

  for (let i = 0; i < 5; i++) {
    const d = pool.create({ district: 'lakeside', rnd, scale: i >= 3 ? 0.74 + (i - 3) * 0.04 : 0.95 + rnd() * 0.1, skates: true, holdSpread: 0.55 });
    skaters.push({ d, cv: mkCurve(i), t: rnd() * TAU, v: 0.65 + rnd() * 0.25, off: 0, partner: null, lastYaw: 0, check: rnd() });
  }
  // the couple: skater 1 follows skater 0 holding hands
  skaters[1].partner = skaters[0];
  skaters[0].d.hold = 1; skaters[1].d.hold = -1;
  skaters[0].off = -0.14;
  // two kids skating hand in hand as well
  skaters[4].partner = skaters[3];
  skaters[3].d.hold = 1; skaters[4].d.hold = -1;
  skaters[3].off = -0.1;

  const P = { x: 0, z: 0, dx: 0, dz: 1, sp: 1 };
  function update(dt, t) {
    const show = W.isRevealed('lakeside');
    const isIce = W.ctx.city?.lake?.isIce;
    const realIce = typeof isIce === 'function' && isIce(C.x, C.z);
    for (const k of skaters) {
      const d = k.d;
      d.active = true; d.vis = show;
      if (d.gather) continue;
      if (k.partner) { k.t = k.partner.t; k.cv = k.partner.cv; }
      else { pos(k.cv, k.t, 0, P); k.t += (dt * k.v) / Math.max(0.3, P.sp); }
      pos(k.cv, k.t, k.partner ? k.partner.off + 0.29 * k.d.s : k.off, P);
      d.x = P.x; d.z = P.z;
      d.y = W.groundAt(d.x, d.z) + 0.02 * d.s; // standing on the blades
      const yaw = Math.atan2(P.dx, P.dz);
      let dy = yaw - k.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      k.lastYaw = yaw;
      const turnRate = dy / Math.max(dt, 1e-3);
      d.yaw = yaw;
      d.sway += (clamp(-turnRate * 0.12, -0.28, 0.28) - d.sway) * Math.min(1, dt * 4); // lean into the turn
      d.lean = 0.16;
      d.phase += dt * 2.6;
      d.amp = 0.15;
      d.armMode = d.hold ? 'swing' : 'out';
      d.legMode = 'custom';
      const sp = Math.sin(d.phase);
      d.lLx = Math.max(0, sp) * 0.55; d.lRx = Math.max(0, -sp) * 0.55; // push-and-glide
      // with the real city: nudge curves that stray off the ice inwards
      k.check -= dt;
      if (realIce && k.check <= 0 && !k.partner) {
        k.check = 1;
        if (!isIce(d.x, d.z)) { k.cv.a *= 0.92; k.cv.b *= 0.92; }
      }
    }
  }
  return { all: skaters.map((k) => k.d), gatherable: [], update, roadPeople: [] };
}
