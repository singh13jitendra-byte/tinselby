// Live rotating 3D preview of the player's knitted doll for the entry screen's style tray.
// Its own small WebGLRenderer + lights, sharing the yarn material (ctx.engine.mat).
import * as THREE from 'three';
import { buildCharacter } from '../core/player.js';
import { P } from '../core/yarn.js';
import { cyl, sph, xf, merge, FELT } from '../core/prims.js';

export function createPreview(ctx, canvas) {
  const { engine } = ctx;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: !!engine.capture });
  } catch (e) {
    console.warn('[ui] preview renderer unavailable', e);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 0.8, 0.05, 20);
  camera.position.set(0, 0.36, 1.32);
  camera.lookAt(0, 0.18, 0);
  scene.add(new THREE.HemisphereLight('#c9d6ff', '#e8d8c8', 1.25));
  const key = new THREE.DirectionalLight('#ffd6a8', 2.4);
  key.position.set(-1, 1.4, 1.5);
  const rim = new THREE.DirectionalLight('#8fa8ff', 1.2);
  rim.position.set(1.2, 0.8, -1.2);
  scene.add(key, rim);
  // snowy felt pedestal
  const ped = new THREE.Mesh(merge([
    xf(cyl(0.16, 0.17, 0.04, 28, P.snow, FELT), [0, -0.02, 0]),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => xf(sph(0.03, P.snowShade, FELT, 8, 6), [Math.cos(i * 0.9) * 0.15, 0.0, Math.sin(i * 0.9) * 0.15], null, [1, 0.6, 1])),
  ]), engine.mat);
  scene.add(ped);
  const turn = new THREE.Group();
  scene.add(turn);
  let ch = null;
  let angle = 0.5;

  function size() {
    const w = canvas.clientWidth || 140, h = canvas.clientHeight || 180;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) {
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  return {
    setStyle(style) {
      if (ch) turn.remove(ch.group);
      ch = buildCharacter(engine.mat, style);
      turn.add(ch.group);
    },
    render(dt) {
      size();
      angle += dt * 0.9;
      turn.rotation.y = angle;
      if (ch) ch.animate(dt, 0);
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    },
  };
}
