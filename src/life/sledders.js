// Kids and little gnomes sledging down HILL.sledLanes, then trudging back up pulling their sleds.
import * as THREE from 'three';
import { KNIT, FELT, part, boxUV, xf, merge } from '../core/yarn.js';
import { turnTo } from './paths.js';

// Little wooden sled: slatted deck on two bent-wood runners that curl right over at the front, a
// cross-bar between the curls and a pull rope. Modelled in pale wood tones; tinted per instance.
function sledGeo() {
  const g = (geo, c, k = FELT) => part(boxUV(geo), c, k);
  const parts = [];
  for (const x of [-0.052, -0.0175, 0.0175, 0.052]) parts.push(xf(g(new THREE.BoxGeometry(0.03, 0.012, 0.25), x * x > 0.001 ? '#f4ead8' : '#ffffff'), [x, 0.05, -0.01])); // slats
  for (const z of [-0.1, 0.0, 0.09]) parts.push(xf(g(new THREE.BoxGeometry(0.14, 0.01, 0.022), '#d9c8ac'), [0, 0.041, z])); // cross battens
  for (const x of [-0.062, 0.062]) {
    const pts = [[x, 0.009, -0.15], [x, 0.008, 0.06], [x, 0.014, 0.13], [x, 0.04, 0.175], [x, 0.075, 0.17], [x, 0.09, 0.135], [x, 0.078, 0.108], [x, 0.058, 0.115]];
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    parts.push(part(new THREE.TubeGeometry(curve, 16, 0.0095, 5), '#e2cfae', FELT, [5, 1]));
    for (const z of [-0.1, 0.0, 0.09]) parts.push(xf(g(new THREE.BoxGeometry(0.012, 0.034, 0.014), '#c9b592'), [x, 0.026, z])); // posts
  }
  parts.push(xf(g(new THREE.BoxGeometry(0.13, 0.012, 0.012), '#d9c8ac'), [0, 0.083, 0.145])); // bar joining the curls
  const rope = new THREE.CatmullRomCurve3([[-0.05, 0.085, 0.145], [-0.02, 0.06, 0.12], [0, 0.058, 0.06], [0.02, 0.06, 0.12], [0.05, 0.085, 0.145]].map((p) => new THREE.Vector3(...p)));
  parts.push(part(new THREE.TubeGeometry(rope, 10, 0.004, 3), '#fff6e6', KNIT, [4, 1]));
  return merge(parts);
}

export function createSledders(W) {
  const { pool, rnd, engine, layout } = W;
  const H = layout.HILL;
  const sleds = new THREE.InstancedMesh(sledGeo(), engine.mat, 8);
  sleds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sleds.frustumCulled = false;
  sleds.castShadow = true;
  sleds.receiveShadow = true;
  sleds.count = 0;
  sleds.name = 'life-sleds';
  const woods = ['#b98554', '#a8713f', '#c2925f', '#9c6a40', '#b98554', '#c79a6a'];
  for (let i = 0; i < 8; i++) sleds.setColorAt(i, new THREE.Color(woods[i % woods.length]));
  engine.scene.add(sleds);

  const hAt = (x, z) => Math.max(H.heightAt(x, z), W.groundAt(x, z));
  const lanes = [];
  for (let i = 0; i < H.sledLanes.length; i += 2) {
    const [tx, tz] = H.sledLanes[i], [bx, bz] = H.sledLanes[i + 1];
    const len = Math.hypot(bx - tx, bz - tz);
    lanes.push({ tx, tz, bx, bz, len, ux: (bx - tx) / len, uz: (bz - tz) / len });
  }
  const T_SIT = 0.8, T_SLIDE = 4.2, T_STAND = 0.7, UP_SPEED = 0.6, RUNOUT = 0.4, SIDE = 0.45;
  const riders = [];
  lanes.forEach((ln, li) => {
    for (let j = 0; j < 2; j++) {
      const gnome = (li + j) % 2 === 0;
      const d = pool.create({ district: 'hill', rnd, gnome, scale: gnome ? 0.8 : 0.72 + rnd() * 0.05 });
      riders.push({ d, ln, state: j ? 'walk' : 'sit', t: j ? 0.5 : rnd() * 0.5, sledYaw: 0, sx: 0, sz: 0, sy: 0, spitch: 0 });
    }
  });

  const mtx = new THREE.Matrix4(), rx = new THREE.Matrix4();
  function pitchAt(x, z, dx, dz) { const a = hAt(x - dx * 0.1, z - dz * 0.1), b = hAt(x + dx * 0.1, z + dz * 0.1); return -Math.atan2(b - a, 0.2); }

  function update(dt, t) {
    const show = W.isRevealed('hill');
    let n = 0;
    for (const r of riders) {
      const d = r.d, ln = r.ln;
      d.active = true; d.vis = show;
      if (d.gather) continue;
      r.t += dt;
      const downYaw = Math.atan2(ln.ux, ln.uz);
      const rideLen = ln.len + RUNOUT;
      let sledAttached = true;
      d.legMode = 'walk'; d.hop = d.cheerT > 0 ? d.hop : 0;
      if (r.state === 'sit') {
        const k = Math.min(1, r.t / T_SIT);
        d.x = ln.tx; d.z = ln.tz; d.yaw = turnTo(d.yaw, downYaw, dt * 6);
        d.sit = k > 0.5 ? 1 : 0; d.amp = 0; d.lean = 0;
        d.armMode = 'custom'; d.aLx = d.aRx = -0.9 * k; d.aLz = d.aRz = 0;
        if (r.t >= T_SIT) { r.state = 'slide'; r.t = 0; }
      } else if (r.state === 'slide') {
        const x = Math.min(1, r.t / T_SLIDE);
        const s = rideLen * x * x * (3 - 2 * x); // slow start, fast on the steep middle, easing out at the bottom
        const wig = Math.sin(r.t * 2.3 + d.id) * 0.08 * Math.sin(x * Math.PI);
        d.x = ln.tx + ln.ux * s - ln.uz * wig; d.z = ln.tz + ln.uz * s + ln.ux * wig;
        d.yaw = downYaw + Math.cos(r.t * 2.3 + d.id) * 0.12 * Math.sin(x * Math.PI);
        d.sit = 1; d.amp = 0; d.lean = -0.1;
        d.armMode = 'custom'; d.aLx = d.aRx = -0.9; d.aLz = d.aRz = 0;
        if (x > 0.3 && x < 0.75) { d.aLz = d.aRz = 1.6 + Math.sin(t * 10) * 0.2; d.aLx = d.aRx = -0.4; } // wheee
        if (r.t >= T_SLIDE) { r.state = 'stand'; r.t = 0; }
      } else if (r.state === 'stand') {
        d.sit = r.t > T_STAND * 0.5 ? 0 : 1;
        d.armMode = 'swing'; d.amp = 0;
        d.yaw = turnTo(d.yaw, downYaw + Math.PI, dt * 5);
        if (r.t >= T_STAND) { r.state = 'walk'; r.t = 0; r.up = 0; }
      } else if (r.state === 'walk') {
        // walk back up beside the lane, pulling the sled
        r.up = (r.up || 0) + UP_SPEED * dt;
        const side = r.up < 0.35 ? r.up / 0.35 : r.up > rideLen + 0.35 ? Math.max(0, 1 - (r.up - rideLen - 0.35) / 0.35) : 1;
        const along = Math.max(0, rideLen - Math.max(0, r.up - 0.35));
        d.x = ln.tx + ln.ux * along - ln.uz * -SIDE * side;
        d.z = ln.tz + ln.uz * along + ln.ux * -SIDE * side;
        d.sit = 0; d.amp = 1; d.phase += dt * 6; d.lean = 0.2;
        d.yaw = turnTo(d.yaw, side < 1 && r.up > rideLen ? downYaw + Math.PI * 0.5 : downYaw + Math.PI, dt * 5);
        d.armMode = 'custom'; d.aLx = -Math.sin(d.phase) * 0.5; d.aLz = 0; d.aRx = 0.5; d.aRz = 0.1; // right hand holds the rope behind
        sledAttached = false;
        if (r.up >= rideLen + 0.7) { r.state = 'sit'; r.t = 0; }
      }
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
      d.y = hAt(d.x, d.z) + (d.sit ? 0.052 : 0);
      d.pitch = d.sit ? pitchAt(d.x, d.z, fx, fz) : 0;
      // sled transform
      if (sledAttached) {
        r.sx = d.x + fx * 0.04 * d.s; r.sz = d.z + fz * 0.04 * d.s; r.sledYaw = d.yaw;
      } else {
        // trail behind the walker on a short rope
        const tx = d.x - fx * 0.3, tz = d.z - fz * 0.3;
        r.sx += (tx - r.sx) * Math.min(1, dt * 6); r.sz += (tz - r.sz) * Math.min(1, dt * 6);
        r.sledYaw = turnTo(r.sledYaw, Math.atan2(d.x - r.sx, d.z - r.sz), dt * 5);
      }
      if (show && n < 8) {
        const sy = Math.sin(r.sledYaw), cy = Math.cos(r.sledYaw);
        const sp = pitchAt(r.sx, r.sz, sy, cy);
        const e = mtx.elements;
        e[0] = cy; e[1] = 0; e[2] = -sy; e[3] = 0; e[4] = 0; e[5] = 1; e[6] = 0; e[7] = 0;
        e[8] = sy; e[9] = 0; e[10] = cy; e[11] = 0; e[12] = r.sx; e[13] = hAt(r.sx, r.sz); e[14] = r.sz; e[15] = 1;
        rx.makeRotationX(sp);
        mtx.multiply(rx);
        mtx.toArray(sleds.instanceMatrix.array, n++ * 16);
      }
    }
    sleds.count = n;
    sleds.instanceMatrix.needsUpdate = true;
  }
  return { all: riders.map((r) => r.d), gatherable: [], update, roadPeople: [] };
}
