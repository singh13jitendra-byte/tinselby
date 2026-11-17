import * as THREE from 'three';
import { makeKnitTexture, makeFeltTexture, makeYarnMaterial } from './yarn.js';
import { TiltShift } from './post.js';

const params = new URLSearchParams(location.search);

/** Renderer, scene, twilight lighting, shared yarn material, post-processing, update loop and quality scaling. */
export function createEngine(canvas) {
  const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const capture = params.has('capture');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const bg = new THREE.Color('#2b3452');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 38, 90);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.3, 140);
  camera.position.set(0, 8, 20);

  const mat = makeYarnMaterial(makeKnitTexture(), makeFeltTexture());

  // twilight: cool sky fill, low warm key with long soft shadows, blue rim fill
  const hemi = new THREE.HemisphereLight('#a9bdee', '#d6cdc6', 0.78);
  const key = new THREE.DirectionalLight('#ffd6a8', 2.3);
  key.castShadow = true;
  const sm = isMobile ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  const sc = key.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight('#7f9cff', 0.75);
  scene.add(hemi, key, key.target, fill, fill.target);
  const KEY_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
  const FILL_DIR = new THREE.Vector3(0.6, 0.45, -0.66).normalize();

  const post = new TiltShift(renderer);
  const maxPR = isMobile ? Math.min(window.devicePixelRatio || 1, 1.0) : Math.min(window.devicePixelRatio || 1, 1.25);
  let pixelRatio = maxPR;

  const engine = {
    THREE, renderer, scene, camera, mat, post, hemi, key, fill, isMobile, capture,
    focus: new THREE.Vector3(), // world point the camera looks at (shadow box + tilt-shift centre)
    time: 0,
    quality: isMobile ? 'medium' : 'high',
    updates: [],
    /** Register fn(dt, t). Lower order runs first. Returns an unregister function. */
    addUpdate(fn, order = 0) {
      const u = { fn, order };
      engine.updates.push(u);
      engine.updates.sort((a, b) => a.order - b.order);
      return () => { const i = engine.updates.indexOf(u); if (i >= 0) engine.updates.splice(i, 1); };
    },
    /** 0 = early evening, 1 = festive night. Driven by spirit progress. */
    setEvening(k) { engine._eveningTarget = Math.max(0, Math.min(1, k)); },
    _evening: 0,
    _eveningTarget: 0,
    resize,
    step,
    start,
    stats() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pr: pixelRatio, quality: engine.quality }; },
  };

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
  }
  window.addEventListener('resize', resize);
  resize();

  const cA = new THREE.Color(), cB = new THREE.Color();
  function applyEvening(dt) {
    engine._evening += (engine._eveningTarget - engine._evening) * (1 - Math.exp(-dt * 0.8));
    const k = engine._evening;
    hemi.intensity = 0.78 - 0.22 * k;
    key.intensity = 2.3 - 0.9 * k;
    key.color.copy(cA.set('#ffd6a8').lerp(cB.set('#ffc28a'), k));
    renderer.toneMappingExposure = 0.9 - 0.08 * k;
    bg.copy(cA.set('#2b3452').lerp(cB.set('#18203a'), k));
    scene.fog.color.copy(bg);
    mat.userData.uniforms.uGlow.value = 6.0 + 2.5 * k;
  }

  function step(dt) {
    engine.time += dt;
    for (const u of engine.updates) u.fn(dt, engine.time);
    applyEvening(dt);
    mat.userData.uniforms.uTime.value = engine.time;
    // shadow box follows the camera focus (snapped to avoid shimmer)
    const fx = Math.round(engine.focus.x / 0.25) * 0.25, fz = Math.round(engine.focus.z / 0.25) * 0.25;
    key.target.position.set(fx, 0, fz);
    key.position.set(fx + KEY_DIR.x * 20, KEY_DIR.y * 20, fz + KEY_DIR.z * 20);
    fill.target.position.set(fx, 0, fz);
    fill.position.set(fx + FILL_DIR.x * 12, FILL_DIR.y * 12, fz + FILL_DIR.z * 12);
    renderer.info.reset();
    post.render(scene, camera, engine.time);
  }

  let last = 0, acc = 0, frames = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    acc += dt; frames++;
    if (acc > 2) {
      const avg = acc / frames;
      if (avg > 1 / 45 && pixelRatio > 0.7) { pixelRatio = Math.max(0.7, pixelRatio - 0.15); resize(); }
      else if (avg < 1 / 58 && pixelRatio < maxPR) { pixelRatio = Math.min(maxPR, pixelRatio + 0.1); resize(); }
      if (avg > 1 / 30 && engine.quality !== 'low') { engine.quality = 'low'; renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
      acc = 0; frames = 0;
    }
    requestAnimationFrame(loop);
  }
  function start() {
    if (capture) return; // frames are stepped manually via window.__tinselby.step
    requestAnimationFrame((t) => { last = t; loop(t); });
  }
  return engine;
}
