import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Christmas miniature palette — every colour in the scene comes from here.
export const P = {
  page: '#e4d5bb', // oatmeal felt book page
  thread: '#9c7a57',
  snow: '#f5f1ea',
  snowShade: '#e4e0d9',
  cream: '#efe1c6',
  creamDark: '#d9c6a3',
  red: '#b8302d',
  deepRed: '#8b2523',
  pine: '#2f6446',
  green: '#4a8250',
  teal: '#4f9590',
  sage: '#94b77a',
  moss: '#8fae58',
  olive: '#a8b45e',
  gold: '#e3aa3a',
  wood: '#7a4f33',
  woodDark: '#5c3a26',
  brick: '#a5493a',
  glow: '#ffae55',
  glowSoft: '#ffd89a',
  ice: '#9fc3d8',
  pebble: '#b9b3aa',
  pebbleDark: '#8d8882',
  orange: '#e0782c',
  pink: '#e7a1a3',
  mint: '#bfd8c6',
  ink: '#2f2a29',
  skin: '#f2d6bd',
  blueGrey: '#6d8ca6',
};

export const KNIT = 1, FELT = 0, GLOW = 2, GLOSS = 3;
export const SW = 0.08; // stitch width (world units) — chunky knit
export const SH = 0.064; // stitch row height

// ------------------------------------------------------------------ textures
/** One knit "V" stitch cell (height map; tiles in u and v). Used for bump + shading. */
export function makeKnitTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(30,30,30)';
  g.fillRect(0, 0, size, size);
  const leg = (cx, cy, ang) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    g.scale(1, 2.05);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.27);
    grd.addColorStop(0, 'rgb(255,255,255)');
    grd.addColorStop(0.55, 'rgb(205,205,205)');
    grd.addColorStop(0.85, 'rgb(110,110,110)');
    grd.addColorStop(1, 'rgba(30,30,30,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, size * 0.27, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  // each stitch: two slanted legs meeting at the bottom; draw shifted copies so it tiles vertically
  for (const oy of [-size, 0, size]) {
    leg(size * 0.28, size * 0.5 + oy, -0.55);
    leg(size * 0.72, size * 0.5 + oy, 0.55);
  }
  // fibre strands along the legs
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 260; i++) {
    const left = Math.random() < 0.5;
    const t = Math.random();
    const x = left ? size * (0.1 + t * 0.36) : size * (0.9 - t * 0.36);
    const y = Math.random() * size;
    g.strokeStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.12})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (left ? 1 : -1) * 4, y + 9);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Wool felt: dense mat of tiny curly fibres (height map). */
export function makeFeltTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 120 + (Math.random() - 0.5) * 60;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 10 + Math.random() * 40;
    const light = Math.random() < 0.5;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, light ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)');
      grd.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  g.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const a = Math.random() * Math.PI * 2, len = 3 + Math.random() * 9;
    const light = Math.random() < 0.6;
    g.strokeStyle = light ? `rgba(255,255,255,${0.12 + Math.random() * 0.3})` : `rgba(0,0,0,${0.08 + Math.random() * 0.16})`;
    g.lineWidth = 0.6 + Math.random() * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 1) * len * 0.6, y + Math.sin(a + 1) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // cotton-wool puffs (tileable soft lumps) go in the green channel: used for fluffy snow shading
  const pc = document.createElement('canvas');
  pc.width = pc.height = size;
  const pg = pc.getContext('2d');
  pg.fillStyle = '#000';
  pg.fillRect(0, 0, size, size);
  pg.globalCompositeOperation = 'lighter';
  let sd = 1234567;
  const pr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = pr() * size, y = pr() * size, r = 16 + pr() * 26;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
      const grd = pg.createRadialGradient(x + ox - r * 0.15, y + oy - r * 0.15, 0, x + ox, y + oy, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.28)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      pg.fillStyle = grd;
      pg.beginPath();
      pg.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      pg.fill();
    }
  }
  const fib = g.getImageData(0, 0, size, size), puf = pg.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) fib.data[i * 4 + 1] = puf.data[i * 4];
  g.putImageData(fib, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// ------------------------------------------------------------------ material
const YARN_PARS = /* glsl */ `
#ifdef USE_BUMPMAP
uniform sampler2D bumpMap;
uniform float bumpScale;
uniform sampler2D feltTex;
uniform float uTime;
uniform float uGlow;
varying float vMat;
varying float vTw;
float knitFar() { vec2 fw = fwidth(vBumpMapUv); return smoothstep(0.07, 0.42, max(fw.x, fw.y)); }
float snowW() { return smoothstep(0.6, 0.78, min(vColor.r, min(vColor.g, vColor.b))); }
float yarnH(vec2 uv) {
  if (vMat < 0.5) { vec4 f = texture2D(feltTex, uv * 0.12); return f.x * 0.9 + texture2D(feltTex, uv * 0.027).y * 4.0 * snowW(); }
  if (vMat < 1.5) return texture2D(bumpMap, uv).x * (1.0 - 0.75 * knitFar());
  return 0.0;
}
vec3 yarnShade() {
  if (vMat < 0.5) {
    float w = snowW();
    float puff = texture2D(feltTex, vBumpMapUv * 0.027).y;
    vec3 f = vec3(0.8 + 0.38 * texture2D(feltTex, vBumpMapUv * 0.12).x);
    // cotton wool: soft bluish hollows between bright puffs
    return f * mix(vec3(1.0), mix(vec3(0.8, 0.86, 0.98), vec3(1.07, 1.06, 1.04), smoothstep(0.08, 0.7, puff)), w);
  }
  if (vMat < 1.5) {
    float far = knitFar();
    float h = texture2D(bumpMap, vBumpMapUv).x;
    // chunky stitches up close; contrast eases off with distance so far knit reads as soft wool, not noise
    // white wool (snowy roofs, pavements) keeps its stitches but stays bright
    return vec3(mix(mix(0.44 + 0.74 * h, 0.78 + 0.22 * h, far), mix(0.7 + 0.42 * h, 0.9 + 0.14 * h, far), snowW()));
  }
  return vec3(1.0);
}
float snowGlitter() {
  if (vMat > 0.5) return 0.0;
  vec2 q = vBumpMapUv * 1.3;
  vec2 cell = floor(q);
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float dotm = smoothstep(0.42, 0.12, length(fract(q) - 0.5));
  vec2 fw = fwidth(q);
  float fade = 1.0 - smoothstep(0.25, 0.7, max(fw.x, fw.y));
  return step(0.972, h) * dotm * fade * snowW() * (0.5 + 0.5 * sin(uTime * 2.6 + h * 400.0));
}
vec2 dHdxy_fwd() {
  vec2 dSTdx = dFdx(vBumpMapUv);
  vec2 dSTdy = dFdy(vBumpMapUv);
  float Hll = bumpScale * yarnH(vBumpMapUv);
  float dBx = bumpScale * yarnH(vBumpMapUv + dSTdx) - Hll;
  float dBy = bumpScale * yarnH(vBumpMapUv + dSTdy) - Hll;
  return vec2(dBx, dBy);
}
vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 dpx = dFdx(surf_pos.xyz), dpy = dFdy(surf_pos.xyz);
  if (dot(dpx, dpx) < 1e-14 || dot(dpy, dpy) < 1e-14) return surf_norm; // tiny / degenerate: no bump (avoids NaN)
  vec3 vSigmaX = normalize(dpx);
  vec3 vSigmaY = normalize(dpy);
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  vec3 nn = abs(fDet) * surf_norm - vGrad;
  return dot(nn, nn) > 1e-12 ? normalize(nn) : surf_norm;
}
#endif
`;

/**
 * One shared yarn material. Per-vertex attribute aMat picks the surface:
 * 0 felt (fuzzy), 1 knit (V stitches), 2 glow (warm emissive, twinkles), 3 gloss (baubles, ice).
 */
export function makeYarnMaterial(knitTex, feltTex) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    sheen: 1.0,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#fff4e6'),
    bumpMap: knitTex,
    bumpScale: 2.2,
  });
  m.userData.uniforms = { feltTex: { value: feltTex }, uTime: { value: 0 }, uGlow: { value: 6.5 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMat;\nvarying float vMat;\nvarying float vTw;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvMat = aMat;\nvTw = fract(sin(dot(floor(position * 14.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <bumpmap_pars_fragment>', YARN_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= yarnShade();')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vMat > 2.5) roughnessFactor = 0.25;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nif (vMat > 1.5 && vMat < 2.5) totalEmissiveRadiance += vColor.rgb * uGlow * (0.72 + 0.28 * sin(uTime * 2.4 + vTw * 6.283));\ntotalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * snowGlitter() * 0.55;'
      )
      // cotton-wool snow: keep the warm/cool light contrast but pull the chroma back so it reads white, not pink or grey
      .replace(
        '#include <opaque_fragment>',
        'if (vMat < 1.5) { float sw = snowW(); float sl = dot(outgoingLight, vec3(0.3, 0.59, 0.11)); outgoingLight = mix(outgoingLight, vec3(sl) * vec3(1.0, 1.015, 1.05) * 1.1, 0.62 * sw); }\n#include <opaque_fragment>'
      );
  };
  m.customProgramCacheKey = () => 'yarn-v4';
  return m;
}

// ------------------------------------------------------------------ geometry helpers
const KEEP = new Set(['position', 'normal', 'uv']);
/** Prepare a geometry as one coloured "part": non-indexed, uv in stitch units, colour + surface kind baked. */
export function part(geo, color, kind = KNIT, uvScale = null) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (uvScale) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
  }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), mat = new Float32Array(n);
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    mat[i] = kind;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(mat, 1));
  g.clearGroups();
  return g;
}

/** Planar uv projection by dominant normal, in stitch units (boxes, roofs, extrusions). */
export function boxUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / SW;
    uv[i * 2 + 1] = v / SH;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function xf(g, p = [0, 0, 0], r = null, s = null) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (r) q.setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
  const sc = new THREE.Vector3(...(s ? (Array.isArray(s) ? s : [s, s, s]) : [1, 1, 1]));
  m.compose(new THREE.Vector3(...p), q, sc);
  g.applyMatrix4(m);
  return g;
}

export function merge(geos) {
  const m = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  m.computeBoundingSphere();
  return m;
}

// ------------------------------------------------------------------ 2D shape helpers
export function poly(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}
export function circlePts(cx, cy, rx, ry = rx, n = 20, wobble = 0, rnd = Math.random) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + (rnd() - 0.5) * wobble;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  return pts;
}
export function starPts(r, ri, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? ri : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

// ------------------------------------------------------------------ deterministic randomness
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(i, j, s = 0) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
