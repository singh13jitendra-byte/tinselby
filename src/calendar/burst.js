// A small sparkle burst of glowing felt stars + confetti (1 instanced mesh, hidden when idle → 0 draw calls).
import * as THREE from 'three';
import { extrude, poly, starPts, xf, merge, GLOW } from '../core/prims.js';

const N = 22;
const COLS = ['#f2b640', '#ffd27a', '#ff7b6b', '#9fe0a0', '#fff1c9', '#e8913a'];

export function createBurst(ctx) {
  const { engine } = ctx;
  const geo = merge([xf(extrude(poly(starPts(0.034, 0.015)), 0.012, '#ffffff', GLOW), [0, 0, -0.006])]);
  const mesh = new THREE.InstancedMesh(geo, engine.mat, N);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) mesh.setColorAt(i, c.set(COLS[i % COLS.length]).multiplyScalar(0.7));
  engine.scene.add(mesh);
  const parts = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, s: 1 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  let t = -1, life = 1.2;

  return {
    mesh,
    /** Burst at a world point; up = how strongly it shoots upward. */
    play(pos, { up = 1.6, spread = 0.9, dur = 1.2 } = {}) {
      t = 0; life = dur;
      for (const p of parts) {
        const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * spread;
        p.p.copy(pos);
        p.v.set(Math.cos(a) * s, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s);
        p.r = Math.random() * 6; p.s = 0.6 + Math.random() * 0.8;
      }
      mesh.visible = true;
    },
    update(dt) {
      if (t < 0) return;
      t += dt;
      if (t > life) { t = -1; mesh.visible = false; return; }
      const k = t / life;
      for (let i = 0; i < N; i++) {
        const p = parts[i];
        p.v.y -= 3.2 * dt;
        p.v.multiplyScalar(1 - dt * 1.2);
        p.p.addScaledVector(p.v, dt);
        p.r += dt * 7;
        const s = p.s * (k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.55) / 0.45));
        m4.compose(p.p, q.setFromEuler(e.set(p.r * 0.3, p.r, 0)), sc.setScalar(Math.max(0.001, s)));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    get active() { return t >= 0; },
  };
}
