// Wave 3 finale: Clover's stand-in. The finale walks its own copy of Clover (the same felt reindeer geometry as the
// team and as door 15's Clover, reindeerGeos()) along layout.EVE's paths, driven purely by the timeline, so skips and
// jumpTo land in exactly the right place. The real Clover is sent `away` into the Rest meanwhile (tasks.reindeer API).
import * as THREE from 'three';
import { reindeerGeos, REINDEER_RIG } from './reindeer.js';

/** Polyline [[x, z], …] → { len, at(s, out) → out {x, z, h} } (h = heading, +z forward). */
export function polyline(pts) {
  const seg = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, bx, bz, l, s0: len });
    len += l;
  }
  return {
    len,
    at(s, out = { x: 0, z: 0, h: 0 }) {
      if (!seg.length) { out.x = pts[0][0]; out.z = pts[0][1]; return out; }
      s = Math.min(len, Math.max(0, s));
      let g = seg[seg.length - 1];
      for (const q of seg) if (s <= q.s0 + q.l) { g = q; break; }
      const k = g.l > 0 ? (s - g.s0) / g.l : 1;
      out.x = g.ax + (g.bx - g.ax) * k;
      out.z = g.az + (g.bz - g.az) * k;
      out.h = Math.atan2(g.bx - g.ax, g.bz - g.az);
      return out;
    },
  };
}

let geos = null;

export function createCloverDouble(engine) {
  if (!geos) geos = reindeerGeos();
  const body = new THREE.Mesh(geos.body, engine.mat);
  body.castShadow = true;
  body.matrixAutoUpdate = false;
  const legs = new THREE.InstancedMesh(geos.leg, engine.mat, 4);
  legs.castShadow = true;
  legs.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'finaleClover';
  group.add(body, legs);
  const { HIP_Y, LEGS } = REINDEER_RIG;
  const dummy = new THREE.Object3D(), leg = new THREE.Object3D(), mLeg = new THREE.Matrix4();
  let ph = 0, k = 0;
  const c = {
    group,
    get inScene() { return !!group.parent; },
    show(on) {
      if (on && !group.parent) engine.scene.add(group);
      if (!on && group.parent) group.removeFromParent();
    },
    /** Place at (x, y, z) facing h; walking (0..1) drives the gait. */
    pose(x, y, z, h, walking, dt) {
      group.position.set(x, y, z);
      group.rotation.y = h;
      k += ((walking ? 1 : 0) - k) * (1 - Math.exp(-dt * 6));
      ph += dt * (walking ? 9 : 1.5);
      dummy.position.set(0, Math.abs(Math.sin(ph)) * 0.03 * k + (1 - k) * Math.sin(ph * 0.4) * 0.003, 0);
      dummy.rotation.set(-Math.cos(ph) * 0.08 * k, (1 - k) * Math.sin(ph * 0.25) * 0.08, 0);
      dummy.updateMatrix();
      body.matrix.copy(dummy.matrix);
      body.matrixWorldNeedsUpdate = true;
      LEGS.forEach(([lx, lz, lph], j) => {
        leg.position.set(lx, HIP_Y, lz);
        leg.rotation.set(Math.sin(ph + lph) * 0.7 * k, 0, 0);
        leg.updateMatrix();
        mLeg.multiplyMatrices(dummy.matrix, leg.matrix);
        legs.setMatrixAt(j, mLeg);
      });
      legs.instanceMatrix.needsUpdate = true;
    },
  };
  return c;
}
