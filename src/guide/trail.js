// Glowing knitted footprints along the planned route to the guide target: ONE InstancedMesh (1 draw call when shown,
// 0 when hidden), pooled (64 prints), laid at fixed arc-length steps along the route so they stay put while you walk;
// prints behind you vanish, the ones ahead fade out with distance and a soft light wave runs along them towards the goal.
// No allocations per frame: instance matrices / fades are written straight into the attribute arrays.
import * as THREE from 'three';

const MAXP = 64; // pooled prints on screen
const MAXL = 320; // prints laid along one route (≈ 110 m)
const STEP = 0.42; // metres between prints (alternating feet)
const SIDE = 0.085; // half the stance width
const AHEAD = 17; // metres of trail shown ahead of the player
const PW = 0.17, PL = 0.28; // print size (m), readable from the follow camera on a phone

/** A knitted boot print: soft halo (alpha) + bright core (red channel) with V-stitch texture, drawn once on a canvas. */
function printTexture() {
  const w = 64, h = 112, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const sole = (grow) => {
    g.beginPath(); g.ellipse(w / 2 + 2, 36, 17 + grow, 26 + grow, 0.12, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(w / 2 - 1, 86, 13 + grow, 17 + grow, 0, 0, Math.PI * 2); g.fill();
  };
  // halo: alpha only (r = 0)
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 9; g.fillStyle = 'rgba(0,0,0,0.55)'; sole(3); // shadowBlur: Safari-safe soft edge
  g.shadowColor = 'transparent'; g.shadowBlur = 0;
  // core: r = 255 → bright gold in the shader
  g.fillStyle = '#ff0000'; sole(0);
  // V stitches knocked back a little so it reads as yarn
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = 'rgba(0,0,0,0.42)'; g.lineWidth = 2.2; g.lineCap = 'round';
  for (let y = 14; y < 104; y += 8) for (let x = 14; x < 54; x += 9) {
    g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x, y + 2); g.lineTo(x + 3, y - 3); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function createTrail(ctx) {
  const { engine, colliders, player, cam } = ctx;
  const geo = new THREE.PlaneGeometry(PW, PL).rotateX(-Math.PI / 2); // flat, toe towards −z
  const fade = new Float32Array(MAXP);
  geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  const core = new THREE.Color('#ffc94d'), halo = new THREE.Color('#ff9a3c');
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: printTexture() }, core: { value: new THREE.Vector3(core.r, core.g, core.b).multiplyScalar(2.3) }, halo: { value: new THREE.Vector3(halo.r, halo.g, halo.b).multiplyScalar(1.1) } },
    vertexShader: /* glsl */ `
      attribute float aFade; varying vec2 vUv; varying float vF;
      void main() { vUv = uv; vF = aFade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform vec3 core; uniform vec3 halo; varying vec2 vUv; varying float vF;
      void main() {
        vec4 t = texture2D(map, vUv);
        float a = t.a * vF;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(halo, core, t.r), a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAXP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.count = 0;
  mesh.visible = false;
  mesh.name = 'guide-trail';
  engine.scene.add(mesh);

  // laid prints (per route): position, heading, side, arc length
  const lx = new Float32Array(MAXL), ly = new Float32Array(MAXL), lz = new Float32Array(MAXL);
  const lc = new Float32Array(MAXL), ls = new Float32Array(MAXL), lside = new Float32Array(MAXL), larc = new Float32Array(MAXL);
  let nl = 0;
  // the route polyline (copied) for the player's arc-length lookup
  const rx = new Float32Array(256), rz = new Float32Array(256), rcum = new Float32Array(256);
  let nr = 0, k = 0, playerS = 0, offBy = 0;

  /** Lay prints along a waypoint list (from route.plan). */
  function lay(wx, wz, n) {
    nr = Math.min(n, 256); nl = 0;
    let L = 0;
    for (let i = 0; i < nr; i++) {
      rx[i] = wx[i]; rz[i] = wz[i];
      if (i) L += Math.hypot(rx[i] - rx[i - 1], rz[i] - rz[i - 1]);
      rcum[i] = L;
    }
    let seg = 0, foot = 0;
    for (let s = STEP * 0.5; s < L - 0.15 && nl < MAXL; s += STEP) {
      while (seg < nr - 2 && rcum[seg + 1] < s) seg++;
      const sl = rcum[seg + 1] - rcum[seg] || 1e-6, t = (s - rcum[seg]) / sl;
      const dx = (rx[seg + 1] - rx[seg]) / sl, dz = (rz[seg + 1] - rz[seg]) / sl;
      const side = foot ? 1 : -1; foot ^= 1;
      const x = rx[seg] + (rx[seg + 1] - rx[seg]) * t - dz * SIDE * side; // right of travel = (−dz, dx)
      const z = rz[seg] + (rz[seg + 1] - rz[seg]) * t + dx * SIDE * side;
      lx[nl] = x; lz[nl] = z; ly[nl] = colliders.heightAt(x, z) + 0.05; // clears rugs / road decals
      const yaw = Math.atan2(-dx, -dz); lc[nl] = Math.cos(yaw); ls[nl] = Math.sin(yaw);
      lside[nl] = side; larc[nl] = s; nl++;
    }
  }
  /** Player's arc length along the route and distance off it. */
  function locate(px, pz) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < nr - 1; i++) {
      const ax = rx[i], az = rz[i], bx = rx[i + 1] - ax, bz = rz[i + 1] - az, l2 = bx * bx + bz * bz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * bx + (pz - az) * bz) / l2)) : 0;
      const d = (ax + bx * t - px) ** 2 + (az + bz * t - pz) ** 2;
      if (d < bd) { bd = d; best = rcum[i] + Math.sqrt(l2) * t; }
    }
    playerS = best; offBy = Math.sqrt(bd);
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /** Per frame: on = trail wanted; t = time. */
  function update(dt, t, on) {
    k += ((on && nl > 0 ? 1 : 0) - k) * Math.min(1, dt * 5);
    if (k < 0.02) { if (mesh.visible) { mesh.visible = false; mesh.count = 0; } return; }
    locate(player.pos.x, player.pos.z);
    const big = 1 + 0.35 * (cam.portrait || 0);
    const m = mesh.instanceMatrix.array;
    let n = 0;
    const s0 = playerS + 0.3, s1 = playerS + AHEAD;
    for (let i = 0; i < nl && n < MAXP; i++) {
      const s = larc[i];
      if (s < s0) continue;
      if (s > s1) break;
      const ahead = s - playerS;
      const wave = (((ahead - t * 2.6) % 3.4) + 3.4) % 3.4; // light runs towards the goal
      const pulse = Math.exp(-((wave - 1.7) ** 2) * 3);
      fade[n] = k * smooth(0.3, 1.1, ahead) * (1 - smooth(AHEAD - 6, AHEAD, ahead)) * (0.62 + 0.38 * pulse);
      const sc = big * (0.92 + 0.12 * pulse), c = lc[i] * sc, sn = ls[i] * sc, sx = lside[i]; // left foot mirrored
      const o = n * 16;
      m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -sn * sx; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = sc; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = sn; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
      m[o + 12] = lx[i]; m[o + 13] = ly[i]; m[o + 14] = lz[i]; m[o + 15] = 1;
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    geo.attributes.aFade.needsUpdate = true;
  }
  return {
    mesh, lay, update,
    clear() { nl = 0; nr = 0; },
    /** Metres the player is off the laid route (after update). */
    get offBy() { return nr ? offBy : Infinity; },
    /** Route length left from the player. */
    get left() { return nr ? Math.max(0, rcum[nr - 1] - playerS) : 0; },
    get laid() { return nl; },
    get shown() { return mesh.visible ? mesh.count : 0; },
    get goalX() { return nr ? rx[nr - 1] : NaN; },
    get goalZ() { return nr ? rz[nr - 1] : NaN; },
    locate,
  };
}
