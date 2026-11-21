// Soft glowing rings on the ground at activity start spots: ONE InstancedMesh (1 draw call while any ring shows, 0
// otherwise). A small canvas texture (soft gold glow + a cream running stitch) on a flat quad; per-instance scale pulses
// gently and instanceColor fades each ring in / out (additive blending, so colour = brightness). No per-frame allocation.
import * as THREE from 'three';

function ringTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), m = S / 2;
  // soft glow band
  const grd = g.createRadialGradient(m, m, m * 0.42, m, m, m);
  grd.addColorStop(0, 'rgba(255,200,90,0)');
  grd.addColorStop(0.32, 'rgba(255,205,100,0.55)');
  grd.addColorStop(0.55, 'rgba(255,215,120,1)');
  grd.addColorStop(0.72, 'rgba(255,190,80,0.45)');
  grd.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // faint inner fill so the spot reads as "stand here"
  const inner = g.createRadialGradient(m, m, 0, m, m, m * 0.6);
  inner.addColorStop(0, 'rgba(255,220,140,0.22)'); inner.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = inner; g.beginPath(); g.arc(m, m, m * 0.6, 0, Math.PI * 2); g.fill();
  // knitted running stitch
  g.strokeStyle = 'rgba(255,248,230,0.95)'; g.lineWidth = 4; g.lineCap = 'round'; g.setLineDash([7, 7]);
  g.beginPath(); g.arc(m, m, m * 0.64, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRings(ctx, max) {
  const { engine } = ctx;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false; // instances are spread over the town; the mesh only shows near the player anyway
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = 4;
  mesh.name = 'activity-rings';
  engine.scene.add(mesh);
  const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    /** One ring this frame: centre (x, y, z), diameter s, brightness k (0..1). */
    put(x, y, z, s, k) {
      if (n >= max) return;
      const o = n * 16;
      M[o] = s; M[o + 1] = 0; M[o + 2] = 0; M[o + 3] = 0;
      M[o + 4] = 0; M[o + 5] = 1; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = 0; M[o + 9] = 0; M[o + 10] = s; M[o + 11] = 0;
      M[o + 12] = x; M[o + 13] = y; M[o + 14] = z; M[o + 15] = 1;
      const c = n * 3; C[c] = k; C[c + 1] = k * 0.92; C[c + 2] = k * 0.78;
      n++;
    },
    end() {
      mesh.count = n;
      mesh.visible = n > 0;
      if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    },
    get count() { return n; },
  };
}
