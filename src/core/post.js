import * as THREE from 'three';

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Separable 9-tap gaussian (5 linear fetches); radius grows with distance from the focus band (tilt-shift).
const BLUR = /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 res;
uniform float focus; uniform float band; uniform float falloff; uniform float maxBlur;
varying vec2 vUv;
vec4 tap(vec2 uv){ vec4 v = texture2D(tDiffuse, uv); return (any(isnan(v)) || any(isinf(v))) ? vec4(0.0) : min(v, vec4(48.0)); }
void main(){
  float d = abs(vUv.y - focus);
  float amt = smoothstep(band, band + falloff, d) * maxBlur;
  vec2 st = dir * amt / res;
  vec4 c = tap(vUv) * 0.2270270270;
  c += tap(vUv + st * 1.3846153846) * 0.3162162162;
  c += tap(vUv - st * 1.3846153846) * 0.3162162162;
  c += tap(vUv + st * 3.2307692308) * 0.0702702703;
  c += tap(vUv - st * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tDiffuse; uniform float thr;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = min(c, vec3(48.0));
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(thr, thr + 0.8, l), 1.0);
}`;

const FINAL = /* glsl */ `
uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float bloom; uniform vec2 res; uniform float time;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 col = texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(mix(vec3(lum), col, 1.22), 0.0);            // richer yarn colours
  col *= vec3(1.02, 1.0, 0.975);                       // warm lantern grade
  float v = smoothstep(1.0, 0.32, length((vUv - 0.5) * vec2(1.0, 1.25)));
  col *= mix(0.66, 1.0, v);                            // soft warm vignette
  col = mix(col, col * vec3(0.93, 0.96, 1.06), 1.0 - v);  // cool twilight at the edges
  col += (hash(vUv * res + fract(time) * 91.0) - 0.5) * 0.012; // film grain
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class TiltShift {
  constructor(renderer) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.blur = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BLUR,
      uniforms: {
        tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, res: { value: new THREE.Vector2(1, 1) },
        focus: { value: 0.45 }, band: { value: 0.085 }, falloff: { value: 0.33 }, maxBlur: { value: 3 },
      },
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.final = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FINAL,
      uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, bloom: { value: 1.45 }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 } },
      depthTest: false, depthWrite: false,
    });
    this.bright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tDiffuse: { value: null }, thr: { value: 1.12 } }, depthTest: false, depthWrite: false, toneMapped: false });
    this.bloomBlur = this.blur.clone();
    this.bloomBlur.uniforms.band.value = -1;
    this.bloomBlur.uniforms.falloff.value = 0.001;
    this.rtH = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtQ1 = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtQ2 = new THREE.WebGLRenderTarget(1, 1, opts);
    this.focus = 0.45;
    this.strength = 1;
  }
  setSize(w, h) {
    this.rtScene.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.blur.uniforms.res.value.set(w, h);
    this.rtH.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.rtQ1.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.rtQ2.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.bloomBlur.uniforms.res.value.set(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.final.uniforms.res.value.set(w, h);
    this.h = h;
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }
  render(scene, camera, time) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    const u = this.blur.uniforms;
    u.focus.value = this.focus;
    const base = 3.7 * (this.h / 900) * this.strength;
    // small axis-aligned pair first (pre-filter), then a wide diagonal pair: no visible tap grid in the bokeh
    const passes = [
      [this.rtScene, this.rtA, 1, 0, base * 0.45],
      [this.rtA, this.rtB, 0, 1, base * 0.45],
      [this.rtB, this.rtA, 0.7071, 0.7071, base],
      [this.rtA, this.rtB, -0.7071, 0.7071, base],
    ];
    for (const [src, dst, dx, dy, m] of passes) {
      u.tDiffuse.value = src.texture;
      u.dir.value.set(dx, dy);
      u.maxBlur.value = m;
      this.pass(this.blur, dst);
    }
    // bloom: bright pass → half res → quarter res, wide separable blur
    this.bright.uniforms.tDiffuse.value = this.rtScene.texture;
    this.pass(this.bright, this.rtH);
    const bu = this.bloomBlur.uniforms;
    // tight → wide so the wide taps never see sharp points (no grid of ghost bulbs in the glow)
    const bp = [
      [this.rtH, this.rtQ1, 1, 0, 1.0], [this.rtQ1, this.rtQ2, 0, 1, 1.0],
      [this.rtQ2, this.rtQ1, 0.7071, 0.7071, 2.2], [this.rtQ1, this.rtQ2, -0.7071, 0.7071, 2.2],
      [this.rtQ2, this.rtQ1, 1, 0, 4.2], [this.rtQ1, this.rtQ2, 0, 1, 4.2],
    ];
    for (const [src, dst, dx, dy, m] of bp) {
      bu.tDiffuse.value = src.texture;
      bu.dir.value.set(dx, dy);
      bu.maxBlur.value = m;
      this.pass(this.bloomBlur, dst);
    }
    this.final.uniforms.tBloom.value = this.rtQ2.texture;
    this.final.uniforms.tDiffuse.value = this.rtB.texture;
    this.final.uniforms.time.value = time;
    this.pass(this.final, null);
  }
}
