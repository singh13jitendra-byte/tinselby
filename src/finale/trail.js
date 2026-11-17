// GLOW sparkle trail behind the sleigh: a ring buffer of additive points (picked up by bloom).
import * as THREE from 'three';

const VERT = /* glsl */ `
uniform float uTime; uniform float uScale;
attribute float aBirth; attribute float aSize; attribute vec3 aColor; attribute vec3 aVel;
varying vec3 vC; varying float vA;
void main() {
  float t = uTime - aBirth;
  float life = 1.5;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  vec3 p = position + aVel * t - vec3(0.0, 0.12 * t * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float k = t / life;
  vA = (1.0 - k) * (0.6 + 0.4 * sin(t * 30.0 + aBirth * 91.0));
  gl_PointSize = max(1.0, uScale * aSize * (1.0 - 0.6 * k) / -mv.z);
  vC = aColor;
}`;
const FRAG = /* glsl */ `
varying vec3 vC; varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float star = smoothstep(0.5, 0.0, d) + 0.6 * smoothstep(0.08, 0.0, min(abs(q.x), abs(q.y))) * smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(vC * star * vA * 3.0, 1.0);
}`;

export class Trail {
  constructor(scene, max = 700) {
    this.max = max; this.head = 0; this.acc = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.birth = new Float32Array(max).fill(-100);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(this.vel, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 60 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.cols = ['#ffd27a', '#fff3d0', '#ffb347', '#ffffff', '#ffe08a'].map((h) => new THREE.Color(h));
    this.dirty = false;
  }
  /** Spawn n sparkles around p (Vector3) with spread s and size sz. */
  emit(t, p, n, s = 0.06, sz = 1, color = null, up = 0.05) {
    for (let i = 0; i < n; i++) {
      const k = this.head;
      this.head = (this.head + 1) % this.max;
      this.pos.set([p.x + (Math.random() - 0.5) * s, p.y + (Math.random() - 0.5) * s, p.z + (Math.random() - 0.5) * s], k * 3);
      this.vel.set([(Math.random() - 0.5) * 0.12, up + Math.random() * 0.05, (Math.random() - 0.5) * 0.12], k * 3);
      const c = color || this.cols[Math.floor(Math.random() * this.cols.length)];
      this.col.set([c.r, c.g, c.b], k * 3);
      this.size[k] = sz * (0.5 + Math.random() * 0.8);
      this.birth[k] = t;
    }
    this.dirty = true;
  }
  /** Burst outward (landing puff). */
  puff(t, p, n, color, speed = 0.6, sz = 1.4) {
    for (let i = 0; i < n; i++) {
      const k = this.head;
      this.head = (this.head + 1) % this.max;
      const a = Math.random() * Math.PI * 2, r = speed * (0.5 + Math.random() * 0.5);
      this.pos.set([p.x, p.y, p.z], k * 3);
      this.vel.set([Math.cos(a) * r, 0.1 + Math.random() * 0.25, Math.sin(a) * r], k * 3);
      this.col.set([color.r, color.g, color.b], k * 3);
      this.size[k] = sz * (0.6 + Math.random() * 0.6);
      this.birth[k] = t;
    }
    this.dirty = true;
  }
  update(t, pxScale) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uScale.value = 62 * pxScale;
    if (this.dirty) {
      for (const a of ['position', 'aVel', 'aColor', 'aSize', 'aBirth']) this.geo.attributes[a].needsUpdate = true;
      this.dirty = false;
    }
  }
}
