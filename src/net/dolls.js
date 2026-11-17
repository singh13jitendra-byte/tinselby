// Remote players as knitted dolls. Each doll = buildCharacter(engine.mat, style) merged into ONE mesh (the whole doll
// waddles, bobs and leans instead of swinging separate limbs), plus one shared InstancedMesh of soft felt blob
// shadows. Budget for all remotes: ≤ 12 dolls → ≤ 12 + 1 draw calls here (+1 for name tags), ≤ ~42k triangles:
// nearest dolls get the full mesh while the budget allows, the rest a vertex-clustered LOD (~45 % of the tris).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCharacter, STYLE_OPTIONS } from '../core/player.js';

export const DOLL_SCALE = 1.15; // same size as the local player
export const MAX_DOLLS = 12;
const TRI_BUDGET = 42000; // dolls only (blobs + tags add < 300)
const LITE_CELL = 0.03; // LOD clustering cell (world units, doll is ~0.48 tall)
const LITE_EST = 2000;
const LOD_FAR = 15; // beyond this distance always use the LOD
const ATTRS = [['position', 3], ['normal', 3], ['uv', 2], ['color', 3], ['aMat', 1]];
const TAU = Math.PI * 2;

/** Normalise a part to the yarn attribute set (non-indexed position/normal/uv/color/aMat). */
function normalizeGeo(src) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const n = g.attributes.position.count;
  for (const k of Object.keys(g.attributes)) if (!ATTRS.some(([a]) => a === k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (!g.attributes.aMat) g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  for (const [k, size] of ATTRS) if (g.attributes[k].itemSize !== size) return null;
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/** buildCharacter → one merged BufferGeometry (rest pose, DOLL_SCALE baked in, feet at y = 0, facing +z). */
export function mergedDollGeometry(mat, style) {
  const ch = buildCharacter(mat, style);
  ch.group.updateMatrixWorld(true);
  const parts = [], owned = new Set();
  ch.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    owned.add(o.geometry);
    if (o.material !== mat || !o.visible) return; // only yarn parts (that's everything today)
    const g = normalizeGeo(o.geometry);
    if (!g) return;
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  for (const g of owned) g.dispose();
  let geo = parts.length ? mergeGeometries(parts, false) : null;
  parts.forEach((g) => g.dispose());
  if (!geo) throw new Error('doll merge failed');
  geo.scale(DOLL_SCALE, DOLL_SCALE, DOLL_SCALE);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Cheap LOD by vertex clustering: snap vertices to a grid (cell average), drop triangles that collapse.
 * Gloss triangles (bead eyes, buttons) are kept as they are, so the face survives.
 */
export function decimateGeometry(geo, cell = LITE_CELL) {
  const A = geo.attributes, P = A.position.array, M = A.aMat.array, n = A.position.count;
  const key = new Float64Array(n), sums = new Map();
  for (let i = 0; i < n; i++) {
    const k = (Math.floor(P[i * 3] / cell) + 512) * 1048576 + (Math.floor(P[i * 3 + 1] / cell) + 512) * 1024 + (Math.floor(P[i * 3 + 2] / cell) + 512);
    key[i] = k;
    let s = sums.get(k);
    if (!s) sums.set(k, (s = [0, 0, 0, 0]));
    s[0] += P[i * 3]; s[1] += P[i * 3 + 1]; s[2] += P[i * 3 + 2]; s[3]++;
  }
  const keep = [];
  for (let t = 0; t < n; t += 3) {
    if (M[t] > 2.5) keep.push(t, 1);
    else if (key[t] !== key[t + 1] && key[t + 1] !== key[t + 2] && key[t] !== key[t + 2]) keep.push(t, 0);
  }
  const m = keep.length / 2, out = new THREE.BufferGeometry();
  for (const [name, size] of ATTRS) {
    const src = A[name].array, dst = new Float32Array(m * 3 * size);
    let w = 0;
    for (let j = 0; j < keep.length; j += 2) {
      const t = keep[j], raw = keep[j + 1];
      for (let v = 0; v < 3; v++) {
        const i = t + v;
        if (name === 'position' && !raw) { const s = sums.get(key[i]); dst[w++] = s[0] / s[3]; dst[w++] = s[1] / s[3]; dst[w++] = s[2] / s[3]; }
        else for (let c = 0; c < size; c++) dst[w++] = src[i * size + c];
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, size));
  }
  out.computeBoundingSphere();
  return out;
}

const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const turn = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, k);

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * @returns {update(dt, wanted), visible() → [{id, name, coat, x, y, z, k}], stats(), dispose()}
 *   wanted: up to MAX_DOLLS entries {id, name, style, styleKey, x, z, h, s, dist}, nearest first.
 */
export function createDollView(ctx) {
  const { engine, colliders } = ctx;
  const mat = engine.mat;
  const root = new THREE.Group();
  root.name = 'net-remotes';
  engine.scene.add(root);
  const cache = new Map(); // styleKey → {full, tris, lite, liteTris, refs, used}
  const dolls = new Map(); // id → doll

  const blobGeo = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: '#1a2140', map: blobTexture(), transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, MAX_DOLLS + 6);
  blobs.count = 0;
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  blobs.name = 'net-blobs';
  root.add(blobs);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  let builds = 0;

  function entryFor(w) {
    let e = cache.get(w.styleKey);
    if (e) return e;
    if (builds >= 1) return null; // at most one doll build per frame (no hitches when many join at once)
    builds++;
    let full;
    try { full = mergedDollGeometry(mat, w.style); } catch (err) {
      console.warn('[net] could not build a remote doll for style', w.styleKey, err);
      full = mergedDollGeometry(mat, {});
    }
    e = { full, tris: full.attributes.position.count / 3, lite: null, liteTris: LITE_EST, refs: 0, used: 0 };
    cache.set(w.styleKey, e);
    return e;
  }
  function liteFor(e) {
    if (e.lite) return e.lite;
    if (builds >= 1) return null;
    builds++;
    e.lite = decimateGeometry(e.full);
    e.liteTris = e.lite.attributes.position.count / 3;
    return e.lite;
  }
  function release(e) {
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    e.used = engine.time;
  }
  function trimCache() {
    if (cache.size <= 16) return;
    const idle = [...cache.entries()].filter(([, e]) => e.refs === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of idle.slice(0, cache.size - 16)) { e.full.dispose(); if (e.lite) e.lite.dispose(); cache.delete(k); }
  }
  function coatOf(style) {
    const c = style && style.coat;
    return (STYLE_OPTIONS.coat && STYLE_OPTIONS.coat[c]) || (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#b5332e');
  }
  function create(w, e) {
    const mesh = new THREE.Mesh(e.full, mat);
    mesh.castShadow = false; // blob shadows instead (keeps remotes out of the shadow pass)
    mesh.receiveShadow = true;
    mesh.scale.setScalar(0.001);
    const group = new THREE.Group();
    group.add(mesh);
    root.add(group);
    e.refs++;
    const y = colliders.heightAt(w.x, w.z);
    group.position.set(w.x, y, w.z);
    const d = { id: w.id, name: w.name, coat: coatOf(w.style), styleKey: w.styleKey, entry: e, mesh, group, lod: 'full', state: 'in', t: 0, pop: 0, h: w.h, spd: 0, phase: Math.random() * TAU, idle: Math.random() * 5, dist: w.dist, w };
    group.rotation.y = d.h;
    dolls.set(w.id, d);
    try { if (w.dist < 9) ctx.audio && ctx.audio.sfx && ctx.audio.sfx('pop', { x: w.x, z: w.z, vol: 0.35 }); } catch (err) { /* audio is optional */ }
    return d;
  }
  function destroy(d) {
    d.group.removeFromParent();
    release(d.entry);
    dolls.delete(d.id);
  }

  function update(dt, wanted) {
    builds = 0;
    const want = new Map();
    for (const w of wanted) want.set(w.id, w);
    for (const d of dolls.values()) if (!want.has(d.id) && d.state !== 'out') { d.state = 'out'; d.t = 0; d.from = d.pop; }
    for (const w of wanted) {
      let d = dolls.get(w.id);
      if (!d) {
        const e = entryFor(w);
        if (!e) continue;
        d = create(w, e);
      } else if (d.styleKey !== w.styleKey) { // restyled: swap the mesh with a little pop
        const e = entryFor(w);
        if (e) {
          release(d.entry); e.refs++;
          d.entry = e; d.styleKey = w.styleKey; d.coat = coatOf(w.style); d.lod = 'full';
          d.mesh.geometry = e.full;
          d.state = 'in'; d.t = 0; d.pop = 0.6;
        }
      }
      if (d.state === 'out') { d.state = 'in'; d.t = 0; }
      d.w = w; d.name = w.name; d.dist = w.dist;
    }
    // LOD under the triangle budget, nearest first
    const live = [...dolls.values()].sort((a, b) => a.dist - b.dist);
    let used = 0;
    live.forEach((d, i) => {
      const e = d.entry, rest = (live.length - i - 1) * Math.max(e.liteTris, 600);
      const far = d.lod === 'full' ? LOD_FAR : LOD_FAR - 2; // hysteresis
      let lod = d.dist < far && used + e.tris + rest <= TRI_BUDGET ? 'full' : 'lite';
      if (lod === 'lite' && !liteFor(e)) lod = 'full';
      if (lod !== d.lod) { d.lod = lod; d.mesh.geometry = lod === 'full' ? e.full : e.lite; }
      used += lod === 'full' ? e.tris : e.liteTris;
    });
    // animate
    let nb = 0;
    for (const d of [...dolls.values()]) {
      const w = d.w;
      d.t += dt;
      if (d.state === 'in') {
        const k = Math.min(1, d.t / 0.45);
        d.pop = Math.max(d.pop, easeOutBack(k));
        if (k >= 1) { d.state = 'live'; d.pop = 1; }
      } else if (d.state === 'out') {
        const k = Math.min(1, d.t / 0.35);
        d.pop = (d.from ?? 1) * (1 - k * k) * (1 + Math.sin(k * Math.PI) * 0.25);
        if (k >= 1) { destroy(d); continue; }
      } else d.pop = 1;
      const gy = colliders.heightAt(w.x, w.z);
      const dx = w.x - d.group.position.x, dz = w.z - d.group.position.z;
      d.group.position.set(w.x, d.group.position.y + (gy - d.group.position.y) * Math.min(1, dt * 14), w.z);
      if (Math.abs(dx) + Math.abs(dz) > 3) d.group.position.y = gy;
      const moved = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      d.spd += (Math.min(4, Math.max(w.s, moved * 0.5)) - d.spd) * Math.min(1, dt * 8);
      d.h = turn(d.h, w.h, dt * 12);
      d.group.rotation.y = d.h;
      // waddle: rock side to side on the feet, hop, lean forward; breathe when idle
      const walking = d.spd > 0.08, k = Math.min(1, d.spd / 1.8);
      d.phase += dt * (walking ? 6 + d.spd * 2.4 : 0);
      const sn = Math.sin(d.phase);
      if (!walking) d.idle += dt;
      d.mesh.position.y = Math.abs(sn) * 0.03 * k;
      d.mesh.rotation.z = sn * 0.13 * k;
      d.mesh.rotation.x = 0.09 * k;
      const breathe = walking ? 1 : 1 + Math.sin(d.idle * 2.2) * 0.014;
      const p = Math.max(0.001, d.pop);
      d.mesh.scale.set(p, p * breathe * (walking ? 1 - Math.abs(sn) * 0.04 * k : 1), p);
      if (nb < blobs.instanceMatrix.count) {
        const bs = Math.max(0.001, p) * (1 - Math.abs(sn) * 0.12 * k);
        m4.compose(v3.set(d.group.position.x, d.group.position.y + 0.012, d.group.position.z), q, s3.set(bs, 1, bs));
        blobs.setMatrixAt(nb++, m4);
      }
    }
    blobs.count = nb;
    blobs.instanceMatrix.needsUpdate = true;
    if (Math.random() < 0.01) trimCache();
  }

  return {
    root,
    update,
    /** Dolls currently shown (for name tags). k = 0..1 pop/fade factor. */
    visible() {
      const out = [];
      for (const d of dolls.values()) out.push({ id: d.id, name: d.name, coat: d.coat, x: d.group.position.x, y: d.group.position.y + d.mesh.position.y, z: d.group.position.z, k: Math.min(1, Math.max(0, d.state === 'out' ? d.pop : d.pop)) });
      return out;
    },
    stats() {
      let tris = 0;
      for (const d of dolls.values()) tris += d.lod === 'full' ? d.entry.tris : d.entry.liteTris;
      return { dolls: dolls.size, dollTris: tris, lods: [...dolls.values()].map((d) => d.lod), cached: cache.size, blobs: blobs.count };
    },
    dispose() {
      for (const d of [...dolls.values()]) destroy(d);
      for (const e of cache.values()) { e.full.dispose(); if (e.lite) e.lite.dispose(); }
      cache.clear();
      root.removeFromParent();
    },
  };
}
