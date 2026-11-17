// Park kids: a snowball fight (arcing snowballs), kids chasing round in a circle, and a kid rolling
// a growing snowball. Snowballs (and the rolled ball) are one instanced mesh.
import * as THREE from 'three';
import { P, FELT, part } from '../core/yarn.js';
import { turnTo } from './paths.js';

const TAU = Math.PI * 2;

export function createKids(W) {
  const { pool, rnd, engine } = W;
  const ballGeo = part(new THREE.SphereGeometry(1, 8, 6), P.snow, FELT, [14, 8]);
  const balls = new THREE.InstancedMesh(ballGeo, engine.mat, 12);
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  balls.frustumCulled = false;
  balls.castShadow = true;
  balls.receiveShadow = true;
  balls.count = 0;
  balls.name = 'life-snowballs';
  engine.scene.add(balls);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), ax = new THREE.Vector3();

  const kid = (x, z) => {
    const d = pool.create({ district: 'park', rnd, scale: 0.7 + rnd() * 0.06 });
    d.x = x; d.z = z;
    return d;
  };

  // --- snowball fight: two pairs facing each other
  const fighters = [
    { d: kid(-0.7, 11.5), home: [-0.7, 11.5], foe: 1 }, { d: kid(1.9, 11.0), home: [1.9, 11.0], foe: 0 },
    { d: kid(-0.5, 12.6), home: [-0.5, 12.6], foe: 3 }, { d: kid(2.2, 12.35), home: [2.2, 12.35], foe: 2 },
  ];
  fighters.forEach((f, i) => { f.timer = 0.8 + i * 0.9 + rnd() * 1.5; f.throwT = -1; f.hitT = 0; f.dodge = rnd() * TAU; });
  const flying = []; // {t, dur, ax, ay, az, bx, by, bz, h, target}

  // --- chasing in a circle
  const RC = { x: 3.4, z: 11.7, r: 0.62 };
  const runners = [0, 1, 2].map((i) => ({ d: kid(RC.x, RC.z), a: (i / 3) * TAU }));

  // --- snowball roller near the snowman spot
  const RS = { x: -3.9, z: 11.1, rx: 0.6, rz: 0.42 };
  const roller = { d: kid(RS.x, RS.z), a: 0, r: 0.05, spin: 0, axis: new THREE.Vector3(1, 0, 0), qb: new THREE.Quaternion(), reset: 0 };

  const all = [...fighters.map((f) => f.d), ...runners.map((r) => r.d), roller.d];

  function throwBall(f, foe) {
    const d = f.d, e = foe.d;
    const hx = d.x + Math.sin(d.yaw) * 0.05, hz = d.z + Math.cos(d.yaw) * 0.05;
    flying.push({ t: 0, dur: 0.7 + rnd() * 0.15, ax: hx, ay: d.y + 0.27 * d.s, az: hz, bx: e.x, by: e.y + 0.2 * e.s, bz: e.z, h: 0.32 + rnd() * 0.12, target: foe });
  }

  function update(dt, t) {
    const show = W.isRevealed('park');
    // fighters
    for (const f of fighters) {
      const d = f.d;
      d.active = true; d.vis = show;
      if (d.gather) continue;
      const foe = fighters[f.foe];
      f.dodge += dt * 0.9;
      d.x = f.home[0] + Math.sin(f.dodge + d.id) * 0.12;
      d.z = f.home[1] + Math.cos(f.dodge * 0.7) * 0.06;
      d.y = W.groundAt(d.x, d.z);
      d.yaw = turnTo(d.yaw, Math.atan2(foe.d.x - d.x, foe.d.z - d.z), dt * 6);
      d.phase += dt * 8; d.amp = 0.25; // little sidestep shuffle
      d.armMode = 'custom';
      d.aLx = -0.3; d.aLz = 0.15;
      f.timer -= dt;
      if (f.throwT < 0 && f.timer <= 0) { f.throwT = 0; f.timer = 2.2 + rnd() * 2.5; }
      if (f.throwT >= 0) {
        const pt = f.throwT;
        f.throwT += dt;
        if (pt < 0.4) { d.aRx = 2.7 * (pt / 0.4); d.aRz = 0.1; d.lean = -0.12; } // wind-up over the shoulder
        else if (pt < 0.55) { const u = (pt - 0.4) / 0.15; d.aRx = 2.7 - 4.2 * u; d.aRz = 0.1; d.lean = 0.18 * u; if (pt + dt >= 0.55 || u >= 1) {} }
        else { d.aRx = -1.5 + (pt - 0.55) * 3; d.lean *= 0.9; }
        if (pt < 0.47 && f.throwT >= 0.47 && show) throwBall(f, foe);
        if (f.throwT > 0.9) { f.throwT = -1; d.lean = 0; }
      } else { d.aRx = -0.3 + Math.sin(t * 2 + d.id) * 0.1; d.aRz = 0.15; }
      if (f.hitT > 0) { f.hitT -= dt; d.lean = -0.35 * Math.sin((f.hitT / 0.35) * Math.PI); d.hop = 0.04 * Math.sin((f.hitT / 0.35) * Math.PI); }
      else if (d.cheerT <= 0) d.hop = 0;
    }
    // runners
    for (const r of runners) {
      const d = r.d;
      d.active = true; d.vis = show;
      if (d.gather) continue;
      r.a += dt * 1.7;
      d.x = RC.x + Math.cos(r.a) * RC.r;
      d.z = RC.z + Math.sin(r.a) * RC.r;
      d.y = W.groundAt(d.x, d.z);
      d.yaw = Math.atan2(-Math.sin(r.a), Math.cos(r.a));
      d.phase += dt * 11; d.amp = 1.3;
      d.sway = -0.18; d.lean = 0.15;
      d.armMode = 'swing';
    }
    // roller
    {
      const d = roller.d;
      d.active = true; d.vis = show;
      if (!d.gather) {
        const R = roller.r;
        const da = dt * 0.32;
        roller.a += da;
        const bx = RS.x + Math.cos(roller.a) * RS.rx, bz = RS.z + Math.sin(roller.a) * RS.rz;
        const tx = -Math.sin(roller.a) * RS.rx, tz = Math.cos(roller.a) * RS.rz, tl = Math.hypot(tx, tz);
        const dist = da * tl;
        if (roller.reset > 0) { roller.reset -= dt; roller.r = Math.max(0.0001, roller.r - dt * 0.4); if (roller.reset <= 0) roller.r = 0.04; }
        else { roller.r = Math.min(0.15, roller.r + dt * 0.008); if (roller.r >= 0.15) roller.reset = 0.5; }
        roller.bx = bx; roller.bz = bz;
        ax.set(tz / tl, 0, -tx / tl);
        q.setFromAxisAngle(ax, dist / Math.max(R, 0.03));
        roller.qb.premultiply(q);
        const back = R + 0.1;
        d.x = bx - (tx / tl) * back; d.z = bz - (tz / tl) * back;
        d.y = W.groundAt(d.x, d.z);
        d.yaw = Math.atan2(tx, tz);
        d.phase += dt * 4.5; d.amp = 0.6;
        d.lean = 0.3; d.armMode = 'custom';
        d.aLx = d.aRx = -1.25 + Math.min(0.4, R); d.aLz = d.aRz = -0.15;
      }
    }

    // snowballs in flight
    let n = 0;
    for (let i = flying.length - 1; i >= 0; i--) {
      const b = flying[i];
      b.t += dt;
      const u = b.t / b.dur;
      if (u >= 1) {
        const tf = b.target;
        if (tf.hitT <= 0) tf.hitT = 0.35;
        flying.splice(i, 1);
        continue;
      }
    }
    if (show) {
      for (const b of flying) {
        const u = b.t / b.dur;
        v3.set(b.ax + (b.bx - b.ax) * u, b.ay + (b.by - b.ay) * u + Math.sin(u * Math.PI) * b.h, b.az + (b.bz - b.az) * u);
        sc.setScalar(0.022);
        mtx.compose(v3, q.identity(), sc);
        mtx.toArray(balls.instanceMatrix.array, n++ * 16);
      }
      if (roller.r > 0.002 && !roller.d.gather) {
        v3.set(roller.bx, W.groundAt(roller.bx, roller.bz) + roller.r * 0.92, roller.bz);
        sc.setScalar(roller.r);
        mtx.compose(v3, roller.qb, sc);
        mtx.toArray(balls.instanceMatrix.array, n++ * 16);
      }
    }
    balls.count = n;
    balls.instanceMatrix.needsUpdate = true;
  }

  return { all, gatherable: all, update, roadPeople: [] };
}
