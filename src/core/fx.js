import * as THREE from 'three';

const SPRITE_VERT = /* glsl */ `
uniform float uTime; uniform vec3 uCenter; uniform float uScale;
attribute float aSeed;
varying float vA;
void main() {
  vec3 box = vec3(18.0, 7.0, 18.0);
  vec3 p = position;
  p.y = mod(position.y - uTime * (0.25 + aSeed * 0.25), box.y);
  p.x += sin(uTime * 0.7 + aSeed * 40.0) * 0.25;
  p.z += cos(uTime * 0.5 + aSeed * 23.0) * 0.2;
  vec3 rel = p - uCenter;
  rel.x = mod(rel.x + box.x * 0.5, box.x) - box.x * 0.5;
  rel.z = mod(rel.z + box.z * 0.5 + 4.0, box.z) - box.z * 0.5 - 4.0;
  vec3 w = vec3(uCenter.x + rel.x, p.y, uCenter.z + rel.z);
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(9.0, uScale * (0.6 + aSeed * 0.8) / -mv.z);
  vA = smoothstep(0.0, 0.6, p.y) * smoothstep(box.y, box.y - 1.5, p.y);
}`;
const SPRITE_FRAG = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * vA * 0.75;
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * 1.15, a);
}`;

/** Falling snow (soft felt-ball flakes). */
export class Snow {
  constructor(scene, count = 1400) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 18;
      pos[i * 3 + 1] = Math.random() * 7;
      pos[i * 3 + 2] = Math.random() * 18;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uScale: { value: 300 } },
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(t, center, pxScale) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uCenter.value.copy(center);
    this.mat.uniforms.uScale.value = 55 * pxScale;
  }
}

const FW_VERT = /* glsl */ `
uniform float uTime; uniform float uScale;
attribute vec3 aVel; attribute vec3 aColor; attribute float aBirth;
varying vec3 vC; varying float vA;
void main() {
  float t = uTime - aBirth;
  float life = 1.9;
  vec3 p = position;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  float drag = 1.6;
  p += aVel * (1.0 - exp(-drag * t)) / drag;
  p.y -= 0.45 * t * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float k = t / life;
  vA = (1.0 - k) * (1.0 - k) * (0.75 + 0.25 * sin(t * 40.0 + position.x * 30.0));
  gl_PointSize = uScale * (1.0 - 0.5 * k) / -mv.z;
  vC = aColor;
}`;
const FW_FRAG = /* glsl */ `
varying vec3 vC; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vC * a * vA * 5.0, 1.0);
}`;

/** Christmas-night fireworks: bursts of glowing sparks (additive, picked up by bloom). */
export class Fireworks {
  constructor(scene, max = 1600) {
    this.max = max;
    this.head = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.birth = new Float32Array(max).fill(-100);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(this.vel, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FW_VERT, fragmentShader: FW_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 200 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 3;
    this.onBurst = null;
    this.palettes = [
      ['#ffcf6b', '#ffe9b0'], ['#ff5a4e', '#ffb0a0'], ['#7fe0d0', '#e8fff8'], ['#ffd36b', '#ff6a4a'], ['#ffffff', '#ffe0a0'], ['#b9f27a', '#ffe08a'],
    ];
  }
  burst(t, x, y, z) {
    const pal = this.palettes[Math.floor(Math.random() * this.palettes.length)].map((h) => new THREE.Color(h));
    const n = 130, speed = 1.2 + Math.random() * 0.6;
    const ring = Math.random() < 0.3;
    for (let i = 0; i < n; i++) {
      const k = this.head;
      this.head = (this.head + 1) % this.max;
      let dx, dy, dz;
      if (ring) {
        const a = (i / n) * Math.PI * 2;
        dx = Math.cos(a); dy = Math.sin(a) * 0.4 + 0.2; dz = Math.sin(a) * 0.9;
      } else {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        dx = r * Math.cos(a); dy = u; dz = r * Math.sin(a);
      }
      const s = speed * (0.75 + Math.random() * 0.3);
      this.pos.set([x, y, z], k * 3);
      this.vel.set([dx * s, dy * s + 0.2, dz * s], k * 3);
      const c = pal[Math.random() < 0.7 ? 0 : 1];
      this.col.set([c.r, c.g, c.b], k * 3);
      this.birth[k] = t + Math.random() * 0.05;
    }
    for (const a of ['position', 'aVel', 'aColor', 'aBirth']) this.geo.attributes[a].needsUpdate = true;
    this.onBurst?.();
  }
  update(t, cx, cz, pxScale) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uScale.value = 210 * pxScale;
    if (t > this.next) {
      // burst just above the near-ahead terrain so it sits in the upper part of the view
      const x = cx + (Math.random() - 0.5) * 7, z = cz - 1.5 - Math.random() * 3, y = 2.0 + Math.random() * 1.2;
      this.burst(t, x, y, z);
      if (Math.random() < 0.35) this.burst(t + 0.25, x + (Math.random() - 0.5) * 2, y + 0.4, z - 0.5);
      this.next = t + 2.2 + Math.random() * 2.8;
    }
  }
}
