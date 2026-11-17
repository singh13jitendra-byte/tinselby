import * as THREE from 'three';
import { makeKnitTexture, makeFeltTexture, makeYarnMaterial } from './yarn.js';
import { TiltShift } from './post.js';
import { Snow } from './fx.js';

const params = new URLSearchParams(location.search);

/** Renderer, scene, lighting (look driven by time of day, see engine.env), shared yarn material, post-processing, update loop and quality scaling. */
export function createEngine(canvas) {
  const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const capture = params.has('capture');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const bg = new THREE.Color('#46567a');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 30, 84);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.3, 140);
  camera.position.set(0, 8, 20);

  const mat = makeYarnMaterial(makeKnitTexture(), makeFeltTexture());

  // twilight: cool sky fill, low warm key with long soft shadows, blue rim fill
  const hemi = new THREE.HemisphereLight('#c3d3fb', '#eeeae6', 1.55);
  const key = new THREE.DirectionalLight('#fff0e0', 1.9);
  key.castShadow = true;
  const sm = isMobile ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  const sc = key.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 2.2;
  const fill = new THREE.DirectionalLight('#9db4ff', 0.45);
  scene.add(hemi, key, key.target, fill, fill.target);
  const FILL_DIR = new THREE.Vector3(0.6, 0.45, -0.66).normalize();

  const snow = new Snow(scene, isMobile ? 500 : 900); // soft falling flakes around the camera focus (1 draw call)
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
    /**
     * Festive progress 0..1 (driven by spirit). It no longer darkens the sky (time of day does that, see src/world):
     * it scales how strongly decorations, garlands and fairy lights glow.
     */
    setEvening(k) { engine._eveningTarget = Math.max(0, Math.min(1, k)); },
    _evening: 0,
    _eveningTarget: 0,
    get festive() { return engine._evening; },
    /**
     * The current look, written by the time-of-day module (src/world) every frame and applied here.
     * Defaults = the classic blue-hour look, so the engine still works without a world module.
     * lamp: 0 (broad day) .. 1 (night) = how much lamps / windows / light pools read as "on".
     */
    env: {
      hemiSky: new THREE.Color('#c3d3fb'), hemiGround: new THREE.Color('#eeeae6'), hemiI: 1.55,
      keyCol: new THREE.Color('#fff0e0'), keyI: 1.9, fillCol: new THREE.Color('#9db4ff'), fillI: 0.45,
      exposure: 0.92, bg: new THREE.Color('#46567a'), fogNear: 30, fogFar: 84,
      glow: 7.0, bloom: 1.45, bloomThr: 1.02, vignette: 0.66, lamp: 1, shadowRadius: 2.2,
      keyDir: new THREE.Vector3(-0.5, 0.84, 0.46).normalize(),
    },
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

  function applyLook(dt) {
    engine._evening += (engine._eveningTarget - engine._evening) * (1 - Math.exp(-dt * 0.8));
    const k = engine._evening, e = engine.env;
    hemi.color.copy(e.hemiSky); hemi.groundColor.copy(e.hemiGround); hemi.intensity = e.hemiI;
    key.color.copy(e.keyCol); key.intensity = e.keyI;
    fill.color.copy(e.fillCol); fill.intensity = e.fillI;
    key.shadow.radius = e.shadowRadius;
    renderer.toneMappingExposure = e.exposure;
    bg.copy(e.bg);
    scene.fog.color.copy(bg); scene.fog.near = e.fogNear; scene.fog.far = e.fogFar;
    // festive progress makes every decoration glow a little stronger (garlands, fairy lights, lanterns)
    mat.userData.uniforms.uGlow.value = e.glow * (0.8 + 0.34 * k);
    post.bloom = e.bloom * (0.92 + 0.14 * k);
    post.threshold = e.bloomThr;
    post.vignette = e.vignette;
  }

  function step(dt) {
    engine.time += dt;
    for (const u of engine.updates) u.fn(dt, engine.time);
    applyLook(dt);
    mat.userData.uniforms.uTime.value = engine.time;
    // shadow box follows the camera focus (snapped to avoid shimmer)
    const fx = Math.round(engine.focus.x / 0.25) * 0.25, fz = Math.round(engine.focus.z / 0.25) * 0.25;
    key.target.position.set(fx, 0, fz);
    const kd = engine.env.keyDir;
    key.position.set(fx + kd.x * 20, kd.y * 20, fz + kd.z * 20);
    fill.target.position.set(fx, 0, fz);
    fill.position.set(fx + FILL_DIR.x * 12, FILL_DIR.y * 12, fz + FILL_DIR.z * 12);
    snow.update(engine.time, engine.focus, renderer.domElement.height / 540);
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
