// Sky & horizon: gradient dome (sun / moon glow), stars, a big soft moon, drifting felt clouds, distant felted snowy
// hills around the book, a snowfield under it, and now and then a tiny Santa sleigh crossing the moon with a swirling
// sparkle trail. Everything is unlit and cheap: 8 draw calls, ~3k triangles, no per-frame allocations.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const R = 112; // dome radius (camera far plane is 140)
const MOON_DIR = new THREE.Vector3(-0.3, 0.31, -0.93).normalize(); // low over the northern hills
const MOON_R = 6.2;

const DOME_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DOME_FRAG = /* glsl */ `
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform float uSun;
uniform vec3 uMoonDir; uniform float uMoon;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float t = pow(smoothstep(-0.03, 0.8, d.y), 0.6);
  vec3 c = mix(uHor, uZen, t);
  float s = max(dot(d, uSunDir), 0.0);
  // sun: wide warm wash + soft disc; low suns also warm the whole horizon band
  c += uSunCol * uSun * (pow(s, 5.0) * 0.28 + pow(s, 48.0) * 0.5 + smoothstep(0.9990, 0.9996, s) * 2.5);
  c += uSunCol * uSun * 0.22 * (1.0 - smoothstep(0.0, 0.3, abs(d.y))) * (1.0 - uSunDir.y);
  float m = max(dot(d, uMoonDir), 0.0);
  c += vec3(0.55, 0.66, 1.0) * uMoon * (pow(m, 14.0) * 0.16 + pow(m, 90.0) * 0.3);
  gl_FragColor = vec4(c, 1.0);
}`;

const STAR_VERT = /* glsl */ `
uniform float uTime; uniform float uK; uniform float uPx;
attribute float aSeed;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.65 + 0.35 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 90.0);
  vA = uK * tw * (0.35 + 0.65 * aSeed);
  gl_PointSize = uPx * (1.4 + 2.6 * aSeed * aSeed);
}`;
const STAR_FRAG = /* glsl */ `
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * 1.9 * vA * smoothstep(0.5, 0.05, d), 1.0);
}`;

const MOON_FRAG = /* glsl */ `
uniform float uK; varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 5.0;            // disc radius 1 inside a 2.5-radius halo quad
  float r = length(p);
  float disc = smoothstep(1.0, 0.94, r);
  // soft felt mottling (a few darker "seas")
  float sea = smoothstep(0.55, 0.0, length(p - vec2(-0.3, 0.25))) * 0.16 + smoothstep(0.4, 0.0, length(p - vec2(0.35, -0.2))) * 0.13
            + smoothstep(0.28, 0.0, length(p - vec2(0.1, 0.5))) * 0.1 + smoothstep(0.3, 0.0, length(p - vec2(-0.25, -0.45))) * 0.09;
  vec3 col = vec3(1.0, 0.94, 0.78) * (1.3 - sea * 1.6) * disc * (0.82 + 0.18 * smoothstep(1.0, 0.2, r));
  float halo = exp(-max(r - 0.9, 0.0) * 2.1) * 0.5 * smoothstep(2.5, 1.2, r);
  col += vec3(0.75, 0.82, 1.0) * halo * (1.0 - disc);
  gl_FragColor = vec4(col * uK, max(disc, halo) * uK);
}`;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const TRAIL_VERT = /* glsl */ `
uniform float uTime; uniform float uPx;
attribute float aBirth; attribute float aSeed;
varying float vA;
void main(){
  float age = uTime - aBirth;
  float life = 3.2 + aSeed * 2.2;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  vec3 p = position;
  p.y -= age * age * 0.12;                                   // sparkles sink slowly
  p.x += sin(age * 1.7 + aSeed * 30.0) * 0.25 * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float k = age / life;
  vA = (1.0 - k) * (1.0 - k) * (0.55 + 0.45 * sin(age * 9.0 + aSeed * 60.0));
  gl_PointSize = uPx * (1.6 + 3.4 * aSeed) * (1.0 - 0.5 * k);
}`;
const TRAIL_FRAG = /* glsl */ `
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vec3(1.0, 0.9, 0.66) * 2.6 * vA * smoothstep(0.5, 0.0, d), 1.0);
}`;

/** Deterministic pseudo-random. */
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function createSky(ctx) {
  const { engine } = ctx;
  const scene = engine.scene, cam = engine.camera;
  const root = new THREE.Group(); // follows the camera
  root.name = 'world-sky';
  scene.add(root);

  // ---------------------------------------------------------------- dome
  const domeMat = new THREE.ShaderMaterial({
    vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    uniforms: {
      uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: 0 }, uMoonDir: { value: MOON_DIR.clone() }, uMoon: { value: 0 },
    },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 14), domeMat);
  dome.renderOrder = -30; dome.frustumCulled = false; dome.name = 'world-dome';
  root.add(dome);

  // ---------------------------------------------------------------- stars
  const NS = engine.isMobile ? 260 : 420;
  const rnd = rng(77);
  const sp = new Float32Array(NS * 3), ss = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const y = 0.05 + rnd() * 0.93, a = rnd() * TAU, r = Math.sqrt(1 - y * y);
    sp[i * 3] = Math.cos(a) * r * (R - 6); sp[i * 3 + 1] = y * (R - 6); sp[i * 3 + 2] = Math.sin(a) * r * (R - 6);
    ss[i] = rnd();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uPx: { value: 1 } },
  });
  const stars = new THREE.Points(sg, starMat);
  stars.frustumCulled = false; stars.renderOrder = -29; stars.name = 'world-stars';
  root.add(stars);

  // ---------------------------------------------------------------- moon
  const moonMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: MOON_FRAG, transparent: true, depthWrite: false, fog: false, uniforms: { uK: { value: 0 } } });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(MOON_R * 5, MOON_R * 5), moonMat);
  moon.position.copy(MOON_DIR).multiplyScalar(R - 10);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -28; moon.frustumCulled = false; moon.name = 'world-moon';
  root.add(moon);

  // ---------------------------------------------------------------- Santa silhouette + sparkle trail (in the moon's plane)
  const fly = new THREE.Group();
  fly.position.copy(MOON_DIR).multiplyScalar(R - 14);
  fly.lookAt(0, 0, 0); // local +z faces the camera, so +x reads as screen right
  fly.visible = false;
  root.add(fly);
  const sil = new THREE.Mesh(sleighSilhouette(), new THREE.MeshBasicMaterial({ color: '#070a18', fog: false, side: THREE.DoubleSide }));
  sil.name = 'world-santa'; sil.frustumCulled = false;
  fly.add(sil);
  const NT = 320;
  const tp = new Float32Array(NT * 3), tb = new Float32Array(NT).fill(-100), ts = new Float32Array(NT);
  for (let i = 0; i < NT; i++) ts[i] = rnd();
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tg.setAttribute('aBirth', new THREE.BufferAttribute(tb, 1));
  tg.setAttribute('aSeed', new THREE.BufferAttribute(ts, 1));
  const trailMat = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
  });
  const trail = new THREE.Points(tg, trailMat);
  trail.frustumCulled = false; trail.renderOrder = -26; trail.name = 'world-trail';
  fly.add(trail);
  let head = 0, flyT = -1, emitAcc = 0, nextFly = 150 + rnd() * 90, queued = -1, trailEnd = 0;
  const FLY_DUR = 11;

  // ---------------------------------------------------------------- hills, snowfield, clouds (world-fixed)
  const hillNear = new THREE.Mesh(hillRing(44, 5.2, 1.6, 11, 0.55), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  const hillFar = new THREE.Mesh(hillRing(66, 15, 5.5, 23, 1.0), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  hillNear.name = 'world-hills-near'; hillFar.name = 'world-hills-far';
  hillNear.renderOrder = -19; hillFar.renderOrder = -20;
  const field = new THREE.Mesh(new THREE.CircleGeometry(72, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ fog: true }));
  field.position.y = -0.62; field.name = 'world-snowfield';
  scene.add(hillFar, hillNear, field);

  const cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
  const NC = 9;
  const clouds = new THREE.InstancedMesh(cloudPuff(), cloudMat, NC);
  clouds.name = 'world-clouds'; clouds.frustumCulled = false; clouds.renderOrder = -21;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU + rnd() * 0.5, rr = 70 + rnd() * 22, sc = 4.5 + rnd() * 4.5;
      p.set(Math.cos(a) * rr, 13 + rnd() * 15, Math.sin(a) * rr);
      q.setFromAxisAngle(up, -a + Math.PI / 2 + (rnd() - 0.5));
      clouds.setMatrixAt(i, m.compose(p, q, s.set(sc * 1.5, sc * 0.62, sc)));
    }
  }
  const cloudRoot = new THREE.Group();
  cloudRoot.add(clouds);
  scene.add(cloudRoot);

  const tmpC = new THREE.Color(), v0 = new THREE.Vector3();

  function emit(t, x, y) {
    const k = head; head = (head + 1) % NT;
    tp[k * 3] = x; tp[k * 3 + 1] = y; tp[k * 3 + 2] = -0.4;
    tb[k] = t;
  }

  function update(dt, t, look) {
    root.position.copy(cam.position);
    const u = domeMat.uniforms;
    u.uZen.value.copy(look.zen); u.uHor.value.copy(look.hor); u.uSunCol.value.copy(look.sunCol);
    u.uSunDir.value.copy(look.keyDir); u.uSun.value = look.sun; u.uMoon.value = look.moon;
    const px = engine.renderer.domElement.height / 540;
    starMat.uniforms.uTime.value = t; starMat.uniforms.uK.value = look.stars; starMat.uniforms.uPx.value = px;
    stars.visible = look.stars > 0.01;
    moonMat.uniforms.uK.value = look.moon; moon.visible = look.moon > 0.01;
    // distant things melt into the horizon haze
    hillNear.material.color.copy(look.hill).lerp(look.hor, 0.22);
    hillFar.material.color.copy(look.hill).lerp(look.hor, 0.55);
    field.material.color.copy(look.field);
    cloudMat.color.copy(look.cloud);
    cloudMat.opacity = 0.55 + 0.4 * (1 - look.lamp);
    cloudRoot.rotation.y = t * 0.0045;

    // ---- Santa crossing the moon
    if (queued >= 0) { queued -= dt; if (queued < 0 && flyT < 0) begin(look.moon); }
    nextFly -= dt;
    if (nextFly < 0) { nextFly = 170 + Math.random() * 110; if (flyT < 0) begin(look.moon); }
    if (flyT >= 0) {
      flyT += dt;
      const w = flyT / FLY_DUR;
      if (w >= 1) { flyT = -1; sil.visible = false; trailEnd = t + 5.5; }
      else {
        // gentle rising arc from lower-left to upper-right, passing in front of the moon mid-way
        const x = (-3.6 + w * 7.2) * MOON_R, y = (-1.15 + 1.5 * w + Math.sin(w * Math.PI) * 0.45) * MOON_R;
        const slope = Math.atan2((1.5 + Math.cos(w * Math.PI) * 0.45 * Math.PI) , 7.2);
        sil.position.set(x, y + Math.sin(t * 2.2) * 0.12, 0);
        sil.rotation.z = slope;
        emitAcc += dt * 26;
        while (emitAcc >= 1) {
          emitAcc -= 1;
          // swirl: the sparkles corkscrew around the flight line behind the sleigh
          const ph = t * 5.2 + emitAcc * 0.2, back = 8.6 + Math.random() * 1.4, amp = 0.35 + Math.random() * 0.9;
          emit(t, x - Math.cos(slope) * back - Math.sin(slope) * Math.sin(ph) * amp, y - Math.sin(slope) * back + Math.cos(slope) * Math.sin(ph) * amp + (Math.random() - 0.5) * 0.3);
        }
        tg.attributes.position.needsUpdate = true; tg.attributes.aBirth.needsUpdate = true;
      }
    }
    fly.visible = flyT >= 0 || t < trailEnd;
    if (fly.visible) { trailMat.uniforms.uTime.value = t; trailMat.uniforms.uPx.value = px; }
  }
  function begin(moonK) {
    if (moonK < 0.5) return false;
    flyT = 0; emitAcc = 0; sil.visible = true; fly.visible = true;
    try { ctx.audio?.sfx?.('sleighBells', { vol: 0.3 }); } catch (e) { /* audio optional */ }
    return true;
  }

  return {
    update,
    /** Start the moon fly-by now (needs the moon up). */
    flyby: (moonK = 1) => (flyT < 0 ? begin(moonK) : false),
    /** Start it in `s` seconds if the moon is up by then. */
    queueFlyby(s = 3) { queued = s; },
    get flying() { return flyT >= 0; },
    moonDir: MOON_DIR,
  };
}

// ------------------------------------------------------------------ geometry builders
/** A ring of soft felted hills: 3 rows of vertices, snowy tops, bluish feet. Base colours are multiplied by the material colour. */
function hillRing(radius, hMax, hMin, seed, sharp) {
  const N = 120, rows = 3;
  const rnd = rng(seed);
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU];
  const hAt = (a) => {
    const n = 0.5 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.2 * Math.sin(a * 7 + ph[1]) + 0.12 * Math.sin(a * 13 + ph[2]) + 0.07 * Math.sin(a * 23 + ph[3]);
    const k = Math.min(1, Math.max(0, n));
    return hMin + (hMax - hMin) * (sharp > 0.8 ? k * k * 1.25 : k);
  };
  const pos = [], col = [], idx = [];
  const top = new THREE.Color('#ffffff'), mid = new THREE.Color('#c4cfe4'), foot = new THREE.Color('#9fafd0'), c = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, h = hAt(a);
    for (let r = 0; r < rows; r++) {
      const f = r / (rows - 1); // 0 foot … 1 crest
      const rr = radius + (1 - f) * -4 + (r === 1 ? Math.sin(a * 17 + seed) * 0.6 : 0);
      const y = -1.2 + (h + 1.2) * (r === 1 ? 0.62 : f);
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      if (r === 0) c.copy(foot); else if (r === 1) c.copy(mid).lerp(top, 0.25 + 0.25 * Math.sin(a * 9 + seed)); else c.copy(top);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < N; i++) for (let r = 0; r < rows - 1; r++) {
    const a = i * rows + r, b = (i + 1) * rows + r;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** A felt cloud: a clump of squashed balls, bright on top and softly shaded underneath (vertex colours). */
function cloudPuff() {
  const balls = [[0, 0, 0, 1], [0.95, -0.1, 0.1, 0.72], [-0.9, -0.12, -0.1, 0.66], [0.4, 0.32, -0.15, 0.6], [-0.4, 0.25, 0.2, 0.55]];
  const pos = [], col = [], idx = [];
  let base = 0;
  for (const [x, y, z, r] of balls) {
    const s = new THREE.SphereGeometry(r, 9, 6);
    const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const py = p.getY(i);
      pos.push(p.getX(i) + x, py * 0.8 + y, p.getZ(i) + z);
      const k = 0.72 + 0.28 * Math.min(1, Math.max(0, (py / r + 1) / 1.6));
      col.push(k, k, Math.min(1, k * 1.03));
    }
    for (let i = 0; i < s.index.count; i++) idx.push(s.index.getX(i) + base);
    base += p.count;
    s.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Flat silhouette (xy plane, travelling towards +x): 4 reindeer in two pairs pulling Santa's sleigh. ~15 units long. */
function sleighSilhouette() {
  const geos = [];
  const add = (pts, ox = 0, oy = 0, s = 1) => {
    const sh = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? sh.lineTo(ox + x * s, oy + y * s) : sh.moveTo(ox + x * s, oy + y * s)));
    sh.closePath();
    geos.push(new THREE.ShapeGeometry(sh));
  };
  const ell = (cx, cy, rx, ry, n = 12) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * rx, cy + Math.sin((i / n) * TAU) * ry]);
  const deer = (ox, oy, s, gait) => {
    add(ell(0, 0, 0.95, 0.4), ox, oy, s); // body
    add([[0.6, 0.1], [1.05, 0.95], [1.3, 0.95], [1.0, -0.05]], ox, oy, s); // neck
    add(ell(1.35, 1.05, 0.36, 0.2, 8), ox, oy, s); // head
    add([[1.1, 1.15], [0.95, 1.75], [1.05, 1.76], [1.18, 1.4], [1.35, 1.8], [1.44, 1.76], [1.24, 1.15]], ox, oy, s); // antlers
    add([[-0.9, 0.15], [-1.2, 0.35], [-1.15, 0.42], [-0.85, 0.3]], ox, oy, s); // tail
    // galloping legs: front pair reaches forward, hind pair kicks back
    add([[0.65, -0.2], [1.35 + gait, -0.75], [1.3 + gait, -0.88], [0.45, -0.3]], ox, oy, s);
    add([[0.55, -0.25], [1.0 + gait, -1.0], [0.92 + gait, -1.08], [0.35, -0.3]], ox, oy, s);
    add([[-0.6, -0.2], [-1.4 - gait, -0.7], [-1.36 - gait, -0.84], [-0.4, -0.32]], ox, oy, s);
    add([[-0.5, -0.25], [-1.05 - gait, -0.98], [-0.97 - gait, -1.07], [-0.3, -0.3]], ox, oy, s);
  };
  deer(6.2, 0.9, 1.0, 0.1); deer(3.4, 0.45, 1.0, -0.12); deer(5.0, 0.6, 0.92, -0.1); deer(2.2, 0.2, 0.92, 0.12);
  // reins
  add([[-2.6, 0.55], [6.0, 1.05], [6.0, 0.95], [-2.6, 0.42]]);
  // sleigh: tub with a high curled back, runner underneath, sack + Santa
  add([[-5.6, 0.1], [-5.9, 1.5], [-5.3, 1.75], [-5.0, 0.75], [-2.9, 0.6], [-2.2, 1.1], [-1.9, 0.9], [-2.4, -0.35], [-5.0, -0.45]]);
  add([[-5.9, -0.75], [-2.2, -0.75], [-1.6, -0.35], [-1.75, -0.25], [-2.3, -0.62], [-5.9, -0.62]]);
  add([[-5.0, -0.45], [-4.9, -0.7], [-4.75, -0.7], [-4.8, -0.45]]); add([[-3.0, -0.4], [-2.95, -0.7], [-2.8, -0.7], [-2.8, -0.4]]);
  add(ell(-4.75, 1.25, 0.6, 0.72, 10)); // sack
  add(ell(-3.7, 1.0, 0.5, 0.62, 10)); // Santa's body
  add(ell(-3.6, 1.72, 0.27, 0.27, 8)); // head
  add([[-3.85, 1.85], [-3.95, 2.3], [-4.2, 2.2], [-3.4, 1.9]]); // hat
  add([[-3.4, 1.2], [-2.6, 0.75], [-2.6, 0.6], [-3.5, 0.95]]); // arm on the reins
  const pos = [];
  for (const g of geos) {
    const p = g.attributes.position, ix = g.index;
    for (let i = 0; i < ix.count; i++) { const k = ix.getX(i); pos.push(p.getX(k) * 1.45, p.getY(k) * 1.45, 0); }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}
