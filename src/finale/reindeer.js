// Felt reindeer team: 4 instanced reindeer + Rudolph (glowing nose), instanced legs with a gallop / flying cycle,
// red yarn antlers, harness with gold bells, and reins back to the sleigh. All in the sleigh rig's local space (+z forward).
import * as THREE from 'three';
import { cyl, sph, dot, torus, tube, xf, merge, KNIT, FELT, GLOSS, GLOW } from '../core/prims.js';
import { P } from '../core/yarn.js';
import { C } from './santa.js';

export const TEAM = [ // rig-local slots (sleigh centre at the origin)
  { x: -0.19, z: 0.98, ph: 0.0 }, { x: 0.19, z: 0.98, ph: 0.6 },
  { x: -0.19, z: 1.52, ph: 1.7 }, { x: 0.19, z: 1.52, ph: 2.4 },
  { x: 0, z: 2.06, ph: 3.3, rudolph: true },
];
const HIP_Y = 0.165;
const LEGS = [[-0.042, 0.095, 0], [0.042, 0.095, 0.35], [-0.042, -0.095, Math.PI], [0.042, -0.095, Math.PI + 0.35]]; // x, z, phase

function antler(sx) {
  const b = [sx * 0.03, 0.44, 0.17];
  return [
    tube([b, [sx * 0.06, 0.5, 0.15], [sx * 0.08, 0.56, 0.12], [sx * 0.075, 0.6, 0.1]], 0.009, C.antler, KNIT, 12, 5),
    tube([[sx * 0.058, 0.5, 0.15], [sx * 0.09, 0.52, 0.18], [sx * 0.11, 0.55, 0.19]], 0.007, C.antler, KNIT, 8, 5),
    tube([[sx * 0.075, 0.555, 0.125], [sx * 0.04, 0.59, 0.14], [sx * 0.035, 0.61, 0.15]], 0.006, C.antler, KNIT, 8, 5),
  ];
}

function bodyGeo(rudolph) {
  const g = [];
  g.push(xf(sph(0.1, C.reindeer, FELT, 16, 10), [0, 0.25, 0], null, [0.68, 0.72, 1.32]));
  g.push(xf(sph(0.085, C.muzzle, FELT, 12, 8), [0, 0.22, 0.03], null, [0.62, 0.55, 1.1])); // belly
  g.push(xf(sph(0.065, C.reindeer, FELT, 12, 8), [0, 0.28, 0.09], null, [0.9, 1, 1])); // chest
  g.push(xf(cyl(0.035, 0.045, 0.13, 10, C.reindeer, FELT), [0, 0.34, 0.14], [0.55, 0, 0]));
  g.push(xf(sph(0.05, C.reindeer, FELT, 12, 10), [0, 0.41, 0.18], null, [0.85, 0.9, 1.1]));
  g.push(xf(sph(0.034, C.muzzle, FELT, 10, 8), [0, 0.392, 0.225], null, [0.9, 0.8, 1.1]));
  if (rudolph) {
    g.push(xf(sph(0.027, '#ff3626', GLOW, 10, 8), [0, 0.398, 0.266]));
  } else g.push(xf(dot(0.013, P.ink, GLOSS), [0, 0.4, 0.258]));
  for (const sx of [-1, 1]) {
    g.push(xf(dot(0.0075, P.ink, GLOSS), [sx * 0.025, 0.425, 0.215]));
    g.push(xf(sph(0.018, C.reindeer, FELT, 8, 6), [sx * 0.045, 0.44, 0.16], [0, 0, sx * 0.9], [1.5, 0.5, 0.8])); // ears
    g.push(...antler(sx));
  }
  g.push(xf(sph(0.022, C.fur, FELT, 8, 6), [0, 0.29, -0.13])); // tail
  // harness: collar with gold bells, girth strap, back strap
  g.push(xf(torus(0.05, 0.012, C.antler, KNIT), [0, 0.32, 0.12], [0.9, 0, 0], [1, 1.15, 1]));
  for (const a of [-1.1, -0.4, 0.4, 1.1]) g.push(xf(dot(0.011, P.gold, GLOSS), [Math.sin(a) * 0.05, 0.3 - Math.cos(a) * 0.035, 0.14 + Math.cos(a) * 0.02]));
  g.push(xf(torus(0.072, 0.011, C.antler, KNIT), [0, 0.25, -0.01], null, [0.98, 1.05, 1]));
  g.push(xf(sph(0.02, P.gold, GLOSS, 8, 6), [0, 0.326, -0.01], null, [1, 0.5, 1]));
  return merge(g).translate(0, -0.025, 0);
}

export function buildTeam(mat) {
  const group = new THREE.Group();
  const normals = TEAM.filter((s) => !s.rudolph);
  const bodies = new THREE.InstancedMesh(bodyGeo(false), mat, normals.length);
  bodies.castShadow = true;
  bodies.frustumCulled = false;
  const rud = new THREE.Mesh(bodyGeo(true), mat);
  rud.castShadow = true;
  rud.matrixAutoUpdate = false;
  const legGeo = merge([
    xf(sph(0.034, C.reindeer, FELT, 8, 6), [0, -0.01, 0], null, [0.75, 1.3, 1]),
    xf(cyl(0.018, 0.026, 0.13, 7, C.reindeer, FELT), [0, -0.075, 0]),
    xf(cyl(0.02, 0.018, 0.035, 7, C.muzzle, FELT), [0, -0.145, 0.002]),
    xf(sph(0.021, C.reindeerDark, FELT, 8, 6), [0, -0.158, 0.006], null, [1, 0.6, 1.2]),
  ]);
  const legs = new THREE.InstancedMesh(legGeo, mat, TEAM.length * 4);
  legs.castShadow = true;
  legs.frustumCulled = false;
  group.add(bodies, rud, legs);

  // reins: from each collar back to the sleigh front, plus a centre trace (static; reindeer bob is tiny)
  const r = [];
  const sleighFront = [[-0.14, 0.33, 0.36], [0.14, 0.33, 0.36]];
  for (const s of TEAM) {
    const collar = [s.x, 0.31, s.z + 0.12];
    const back = s.rudolph ? [0, 0.3, 1.62] : [s.x * 0.6, 0.33, s.z - 0.5];
    r.push(tube([collar, [s.x, 0.3, s.z - 0.05], [s.x * 0.8, 0.31, s.z - 0.25], back], 0.006, C.antler, KNIT, 12, 4));
  }
  for (const sx of [-1, 1]) r.push(tube([[sx * 0.11, 0.33, 0.48], [sx * 0.12, 0.31, 0.8], [sx * 0.1, 0.31, 1.2], [sx * 0.06, 0.3, 1.62], [0, 0.3, 1.9]], 0.007, P.gold, GLOSS, 24, 4));
  for (const [i, f] of sleighFront.entries()) r.push(tube([f, [f[0] * 0.9, 0.36, 0.42], [(i ? 1 : -1) * 0.11, 0.33, 0.48]], 0.006, P.gold, GLOSS, 8, 4));
  const reins = new THREE.Mesh(merge(r).translate(0, -0.02, 0), mat);
  reins.castShadow = true;
  group.add(reins);

  const dummy = new THREE.Object3D(), leg = new THREE.Object3D();
  const mBody = new THREE.Matrix4(), mLeg = new THREE.Matrix4();
  let t = 0;
  const team = {
    group,
    mode: 'stand', // stand | gallop | fly
    blend: 0, // 0 stand → 1 moving
    update(dt, speed = 1) {
      t += dt * (team.mode === 'stand' ? 1 : speed);
      const target = team.mode === 'stand' ? 0 : 1;
      team.blend += (target - team.blend) * (1 - Math.exp(-dt * 5));
      const k = team.blend, fly = team.mode === 'fly' ? 1 : 0;
      let bi = 0;
      TEAM.forEach((s, i) => {
        const ph = t * 9 + s.ph;
        const bob = Math.abs(Math.sin(ph)) * 0.035 * k + (1 - k) * Math.sin(t * 1.5 + s.ph) * 0.003;
        dummy.position.set(s.x, bob + fly * Math.sin(ph * 0.5) * 0.02, s.z);
        dummy.rotation.set(-Math.cos(ph) * 0.12 * k - fly * 0.06, 0, 0);
        if (!k && !s.rudolph) dummy.rotation.y = Math.sin(t * 0.4 + s.ph) * 0.06;
        else dummy.rotation.y = 0;
        dummy.updateMatrix();
        mBody.copy(dummy.matrix);
        if (s.rudolph) { rud.matrix.copy(mBody); rud.matrixWorldNeedsUpdate = true; }
        else bodies.setMatrixAt(bi++, mBody);
        LEGS.forEach(([lx, lz, lph], j) => {
          const front = lz > 0;
          let a;
          if (fly) a = front ? -0.9 + Math.sin(ph + lph) * 0.35 : 0.85 + Math.sin(ph + lph) * 0.35; // stretched, gentle paddling
          else a = Math.sin(ph + lph) * 0.75 * k;
          leg.position.set(lx, HIP_Y, lz);
          leg.rotation.set(a, 0, 0);
          leg.updateMatrix();
          mLeg.multiplyMatrices(mBody, leg.matrix);
          legs.setMatrixAt(i * 4 + j, mLeg);
        });
      });
      bodies.instanceMatrix.needsUpdate = true;
      legs.instanceMatrix.needsUpdate = true;
    },
  };
  team.update(0);
  return team;
}
