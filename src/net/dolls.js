// Remote players as knitted dolls. Each doll = buildCharacter(engine.mat, style) merged into ONE mesh (the whole doll
// waddles, bobs and leans instead of swinging separate limbs), plus one shared InstancedMesh of soft felt blob
// shadows. Budget for all remotes: ≤ 12 dolls → ≤ 12 + 1 draw calls here (+1 for name tags), ≤ ~42k triangles:
// nearest dolls get the full mesh while the budget allows, the rest a vertex-clustered LOD (~45 % of the tris).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCharacter, STYLE_OPTIONS } from '../core/player.js';
import { emotePose, EMOTE_DUR, SEATED } from './emotes.js';

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

/**
 * buildCharacter → one merged BufferGeometry (rest pose, DOLL_SCALE baked in, feet at y = 0, facing +z).
 * geo.userData.rig = {limbs: [{name, sx, ranges: [[firstVertex, count]], p: [x, y, z] pivot, pq: parent world
 * rotation, rest: Euler}]}: where each arm / leg sits in the merged vertex buffer, so emotes and the seated pose can
 * bend them on the CPU (wave 4) without extra meshes or draw calls.
 */
export function mergedDollGeometry(mat, style) {
  const ch = buildCharacter(mat, style);
  ch.group.updateMatrixWorld(true);
  const parts = [], owned = new Set();
  const limbOf = new Map(), limbs = [];
  [['armL', ch.arms && ch.arms[0], -1], ['armR', ch.arms && ch.arms[1], 1], ['legL', ch.legs && ch.legs[0], -1], ['legR', ch.legs && ch.legs[1], 1]].forEach(([name, piv, sx]) => {
    if (!piv || !piv.isObject3D) return;
    const L = { name, sx, ranges: [], p: piv.getWorldPosition(new THREE.Vector3()).multiplyScalar(DOLL_SCALE).toArray(),
      pq: piv.parent ? piv.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(), rest: piv.rotation.clone() };
    limbs.push(L);
    piv.traverse((o) => { if (o.isMesh) limbOf.set(o, L); });
  });
  let vtx = 0;
  ch.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    owned.add(o.geometry);
    if (o.material !== mat || !o.visible) return; // only yarn parts (that's everything today)
    const g = normalizeGeo(o.geometry);
    if (!g) return;
    g.applyMatrix4(o.matrixWorld);
    const n = g.attributes.position.count, L = limbOf.get(o);
    if (L) { const last = L.ranges[L.ranges.length - 1]; if (last && last[0] + last[1] === vtx) last[1] += n; else L.ranges.push([vtx, n]); }
    vtx += n;
    parts.push(g);
  });
  for (const g of owned) g.dispose();
  let geo = parts.length ? mergeGeometries(parts, false) : null;
  parts.forEach((g) => g.dispose());
  if (!geo) throw new Error('doll merge failed');
  geo.scale(DOLL_SCALE, DOLL_SCALE, DOLL_SCALE);
  geo.computeBoundingSphere();
  if (geo.attributes.position.count === vtx) geo.userData.rig = { limbs: limbs.filter((L) => L.ranges.length) };
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
    dropDef(d);
    d.group.removeFromParent();
    release(d.entry);
    dolls.delete(d.id);
  }

  // ---- wave 4: emotes, stagger, seated pose. Per-player effect state lives here (keyed by id) so it survives the
  // doll popping in / out; limbs bend on the CPU in a per-doll copy of the merged geometry (no extra draw calls).
  const fx = new Map(); // id → {emote, et, stag: {x, z, t} | null, seat: {x, y, z, h, pose} | null}
  const fxOf = (id) => { let f = fx.get(id); if (!f) fx.set(id, (f = { emote: null, et: 0, stag: null, seat: null })); return f; };
  const mT = new THREE.Matrix4(), mD = new THREE.Matrix4(), eT = new THREE.Euler();
  const poseTmp = { body: { y: 0, rx: 0, ry: 0, rz: 0 }, limbs: {} }, limbTmp = {};
  function ensureDef(d) {
    if (d.def) return d.def;
    const full = d.entry.full, rig = full.userData.rig;
    if (!rig || !rig.limbs.length) return null;
    const geo = full.clone();
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    geo.boundingSphere = full.boundingSphere.clone();
    geo.boundingSphere.radius *= 1.5; // raised arms / lying down
    d.def = { geo, rig, rp: full.attributes.position.array, rn: full.attributes.normal.array, dirty: new Set(), idle: 0 };
    d.mesh.geometry = geo;
    d.lod = 'def';
    return d.def;
  }
  function dropDef(d) {
    if (!d.def) return;
    d.def.geo.dispose();
    d.def = null;
    d.lod = 'full';
    d.mesh.geometry = d.entry.full;
  }
  /** limbs: {armL: [rotX, rotZ], …} (absolute pivot angles) — missing limbs go back to the rest pose. */
  function deform(d, limbs) {
    const D = d.def, P = D.geo.attributes.position, N = D.geo.attributes.normal, pa = P.array, na = N.array;
    let touched = false;
    P.clearUpdateRanges(); N.clearUpdateRanges();
    for (const L of D.rig.limbs) {
      const tg = limbs && limbs[L.name];
      if (!tg) {
        if (!D.dirty.has(L.name)) continue;
        D.dirty.delete(L.name);
        for (const [a, n] of L.ranges) {
          pa.set(D.rp.subarray(a * 3, (a + n) * 3), a * 3); na.set(D.rn.subarray(a * 3, (a + n) * 3), a * 3);
          P.addUpdateRange(a * 3, n * 3); N.addUpdateRange(a * 3, n * 3);
        }
        touched = true;
        continue;
      }
      if (!L.mRi) { // delta = Q · R(target) · R(rest)⁻¹ · Q⁻¹ about the pivot (Q = parent's world rotation)
        L.mRi = new THREE.Matrix4().makeRotationFromEuler(L.rest).invert();
        L.mQ = new THREE.Matrix4().makeRotationFromQuaternion(L.pq);
        L.mQi = L.mQ.clone().invert();
      }
      eT.set(tg[0], L.rest.y, tg[1], L.rest.order);
      mD.copy(L.mQ).multiply(mT.makeRotationFromEuler(eT)).multiply(L.mRi).multiply(L.mQi);
      const m = mD.elements, px = L.p[0], py = L.p[1], pz = L.p[2], rp = D.rp, rn = D.rn;
      for (const [a, n] of L.ranges) {
        for (let i = a * 3, e = (a + n) * 3; i < e; i += 3) {
          const x = rp[i] - px, y = rp[i + 1] - py, z = rp[i + 2] - pz;
          pa[i] = px + m[0] * x + m[4] * y + m[8] * z;
          pa[i + 1] = py + m[1] * x + m[5] * y + m[9] * z;
          pa[i + 2] = pz + m[2] * x + m[6] * y + m[10] * z;
          const nx = rn[i], ny = rn[i + 1], nz = rn[i + 2];
          na[i] = m[0] * nx + m[4] * ny + m[8] * nz;
          na[i + 1] = m[1] * nx + m[5] * ny + m[9] * nz;
          na[i + 2] = m[2] * nx + m[6] * ny + m[10] * nz;
        }
        P.addUpdateRange(a * 3, n * 3); N.addUpdateRange(a * 3, n * 3);
      }
      D.dirty.add(L.name);
      touched = true;
    }
    if (touched) { P.needsUpdate = true; N.needsUpdate = true; }
  }
  function emote(id, e) {
    if (!EMOTE_DUR[e]) return false;
    const f = fxOf(id);
    f.emote = e; f.et = 0;
    return true;
  }
  function stagger(id, dx, dz) {
    let x = +dx || 0, z = +dz || 0;
    const l = Math.hypot(x, z);
    if (l < 1e-6) { x = 0; z = -1; } else { x /= l; z /= l; }
    fxOf(id).stag = { x, z, t: 0 };
    return true;
  }
  function seat(id, pose) {
    const f = fxOf(id);
    if (!pose) {
      if (f.seat) { f.seat = null; const d = dolls.get(id); if (d) d.unseat = true; }
      return true;
    }
    const n = (v) => (Number.isFinite(+v) ? +v : null);
    const x = n(pose.x), y = n(pose.y), z = n(pose.z);
    if (x === null || y === null || z === null) return false;
    f.seat = { x, y, z, h: n(pose.h) ?? 0, pose: pose.pose === 'stand' ? 'stand' : 'sit' };
    const d = dolls.get(id);
    if (d) { d.group.position.set(x, y, z); d.group.rotation.y = d.h = f.seat.h; } // no frame of lag behind the ride
    return true;
  }
  /** Seat pose of a pinned player (the net loop ranks / tags dolls by it), or null. */
  const seatOf = (id) => { const f = fx.get(id); return f ? f.seat : null; };
  function clearFx(id) {
    if (id === undefined) { for (const k of [...fx.keys()]) clearFx(k); return; }
    const f = fx.get(id);
    if (f && f.seat) { const d = dolls.get(id); if (d) d.unseat = true; }
    fx.delete(id);
  }

  // ---- gathering (finale): remote dolls are drawn on slots of an arc round (x, z), facing it; local only
  let gather = null; // {x, z, r, a0, a1, token}
  let gatherToken = 0;
  const gp = { x: 0, z: 0 };
  function setGather(g) {
    if (!g) { gather = null; return () => {}; }
    const n = (v, d) => (Number.isFinite(+v) ? +v : d);
    gather = { x: n(g.x, 0), z: n(g.z, 0), r: Math.max(0.5, n(g.r, 4.4)), a0: n(g.a0, -1.2), a1: n(g.a1, 1.2), token: ++gatherToken, slots: new Map() };
    const mine = gather.token;
    return () => { if (gather && gather.token === mine) gather = null; };
  }
  function assignSlots(wanted) {
    const ids = wanted.map((w) => w.id).sort();
    const n = ids.length;
    gather.slots.clear();
    ids.forEach((id, i) => {
      const a = gather.a0 + ((gather.a1 - gather.a0) * (i + 0.5)) / n;
      gp.x = gather.x + Math.sin(a) * gather.r;
      gp.z = gather.z + Math.cos(a) * gather.r;
      try { ctx.colliders.resolve(gp, 0.15); } catch (e) { /* keep the raw slot */ }
      gather.slots.set(id, { x: gp.x, z: gp.z });
    });
  }

  function update(dt, wanted) {
    builds = 0;
    if (gather) assignSlots(wanted);
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
          dropDef(d);
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
      if (d.def) { used += d.entry.tris; return; } // emoting / seated: full mesh, bent in place
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
      let w = d.w;
      // gather blend: 0 = live position, 1 = on the slot (about 1 s each way)
      const slot = gather && gather.slots.get(d.id);
      d.gk = Math.max(0, Math.min(1, (d.gk || 0) + (slot ? dt : -dt)));
      if (d.gk > 0) {
        const k = d.gk * d.gk * (3 - 2 * d.gk);
        const sx = slot ? slot.x : d.gs.x, sz = slot ? slot.z : d.gs.z;
        if (slot) d.gs = slot;
        const fx = gather ? gather.x : d.gf.x, fz = gather ? gather.z : d.gf.z;
        if (gather) d.gf = { x: gather.x, z: gather.z };
        w = { ...w, x: w.x + (sx - w.x) * k, z: w.z + (sz - w.z) * k, s: w.s * (1 - k), h: d.gk > 0.5 ? Math.atan2(fx - sx, fz - sz) : w.h };
        d.gbob = true;
      } else d.gbob = false;
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
      const f = fx.get(d.id), seatP = f && f.seat, sitting = !!seatP && seatP.pose === 'sit';
      let pose = null;
      if (f && f.emote) { // walking off interrupts an emote (as for the local player)
        f.et += dt;
        if (f.et >= EMOTE_DUR[f.emote] || (!seatP && w.s > 0.35)) f.emote = null;
        else pose = emotePose(f.emote, f.et, poseTmp);
      }
      let sn = 0, k = 0, walking = false;
      if (seatP) { // pinned by a ride (Ride together): no waddle, heading from the seat
        d.group.position.set(seatP.x, seatP.y, seatP.z);
        d.h = seatP.h; d.group.rotation.y = d.h; d.spd = 0;
      } else {
        const gy = colliders.heightAt(w.x, w.z);
        const dx = w.x - d.group.position.x, dz = w.z - d.group.position.z;
        d.group.position.set(w.x, d.group.position.y + (gy - d.group.position.y) * Math.min(1, dt * 14), w.z);
        if (Math.abs(dx) + Math.abs(dz) > 3 || d.unseat) d.group.position.y = gy;
        const moved = d.unseat ? 0 : Math.hypot(dx, dz) / Math.max(dt, 1e-4);
        d.unseat = false;
        d.spd += (Math.min(4, Math.max(w.s, moved * 0.5)) - d.spd) * Math.min(1, dt * 8);
        d.h = turn(d.h, w.h, dt * 12);
        d.group.rotation.y = d.h;
        // waddle: rock side to side on the feet, hop, lean forward; breathe when idle
        walking = d.spd > 0.08; k = Math.min(1, d.spd / 1.8);
        d.phase += dt * (walking ? 6 + d.spd * 2.4 : 0);
        sn = Math.sin(d.phase);
      }
      if (!walking) d.idle += dt;
      d.mesh.position.y = sitting ? 0 : Math.abs(sn) * 0.03 * k + (d.gk >= 1 ? Math.abs(Math.sin(engine.time * 2.1 + d.phase)) * 0.012 : 0);
      d.mesh.position.x = d.mesh.position.z = 0;
      d.mesh.rotation.z = sn * 0.13 * k;
      d.mesh.rotation.x = sitting ? SEATED.body.rx : 0.09 * k;
      d.mesh.rotation.y = 0;
      if (pose) {
        const b = pose.body;
        if (sitting) { d.mesh.rotation.z += b.rz * 0.5; d.mesh.rotation.y = b.ry * 0.4; }
        else { d.mesh.position.y += b.y; d.mesh.rotation.x += b.rx; d.mesh.rotation.y = b.ry; d.mesh.rotation.z += b.rz; }
      }
      if (f && f.stag) { // snowball hit: knocked a little in the throw direction, wobble back
        const st = f.stag;
        st.t += dt;
        const u = Math.min(1, st.t / 0.8);
        if (u >= 1) f.stag = null;
        else {
          const push = Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u) * 0.14, lean = Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u) * 0.5;
          const c = Math.cos(d.h), s = Math.sin(d.h), lx = st.x * c - st.z * s, lz = st.x * s + st.z * c;
          d.mesh.position.x = lx * push; d.mesh.position.z = lz * push;
          d.mesh.rotation.x += lz * lean; d.mesh.rotation.z -= lx * lean + Math.sin(u * Math.PI * 5) * 0.12 * (1 - u);
        }
      }
      // limbs: seated pose and / or the emote's arms + legs, bent in this doll's own copy of the mesh
      let limbs = null;
      if (sitting) { limbs = limbTmp; limbTmp.armL = SEATED.limbs.armL; limbTmp.armR = SEATED.limbs.armR; limbTmp.legL = SEATED.limbs.legL; limbTmp.legR = SEATED.limbs.legR; }
      if (pose) {
        if (!limbs) { limbs = limbTmp; limbTmp.armL = limbTmp.armR = limbTmp.legL = limbTmp.legR = undefined; }
        const L = pose.limbs;
        if (L.armL) limbs.armL = L.armL;
        if (L.armR) limbs.armR = L.armR;
        if (!sitting) { if (L.legL) limbs.legL = L.legL; if (L.legR) limbs.legR = L.legR; }
      }
      if (limbs) { if (ensureDef(d)) { deform(d, limbs); d.def.idle = 0; } }
      else if (d.def) { deform(d, null); if ((d.def.idle += dt) > 2) dropDef(d); }
      const breathe = walking ? 1 : 1 + Math.sin(d.idle * 2.2) * (sitting ? 0.01 : 0.014);
      const p = Math.max(0.001, d.pop);
      d.mesh.scale.set(p, p * breathe * (walking ? 1 - Math.abs(sn) * 0.04 * k : 1), p);
      if (!seatP && nb < blobs.instanceMatrix.count) {
        const bs = Math.max(0.001, p) * (1 - Math.abs(sn) * 0.12 * k);
        m4.compose(v3.set(d.group.position.x, d.group.position.y + 0.012, d.group.position.z), q, s3.set(bs, 1, bs));
        blobs.setMatrixAt(nb++, m4);
      }
    }
    blobs.count = nb;
    blobs.instanceMatrix.needsUpdate = true;
    if (Math.random() < 0.01) trimCache();
  }

  const _v = new THREE.Vector3();
  function toScreen(x, y, z, rect) {
    _v.set(x, y, z).project(engine.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * rect.width, y: (0.5 - _v.y * 0.5) * rect.height };
  }
  /**
   * Tap picking: client (screen) coordinates → id of the nearest drawn doll or name tag within a finger radius, or
   * null. tagTop(id) → this frame's tag top {x, y, z, k} (tags.js).
   */
  function pick(cx, cy, tagTop, liftTag = 0.6) {
    const cv = engine.renderer.domElement, rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const px = cx - rect.left, py = cy - rect.top;
    const finger = engine.isMobile ? 34 : 26;
    let best = null, bestScore = Infinity;
    for (const d of dolls.values()) {
      if (d.state === 'out' || d.pop < 0.5 || !d.group.parent) continue;
      const g = d.group.position, y0 = g.y + d.mesh.position.y;
      const a = toScreen(g.x, y0 + 0.03, g.z, rect), b = toScreen(g.x, y0 + 0.5, g.z, rect);
      if (a && b) { // the doll: distance to its feet → head segment on screen
        const sx = b.x - a.x, sy = b.y - a.y, l2 = sx * sx + sy * sy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * sx + (py - a.y) * sy) / l2)) : 0;
        const dist = Math.hypot(px - (a.x + sx * t), py - (a.y + sy * t)), rad = Math.max(finger, Math.sqrt(l2) * 0.35);
        if (dist <= rad && dist / rad < bestScore) { bestScore = dist / rad; best = d.id; }
      }
      const tp = tagTop && tagTop(d.id);
      if (tp && tp.k > 0.3) { // its name tag: distance to the tag's rectangle
        const top = toScreen(tp.x, tp.y, tp.z, rect), bot = toScreen(g.x, y0 + liftTag, g.z, rect);
        if (top && bot) {
          const h = Math.max(12, Math.abs(bot.y - top.y)), w = h * 3.4, mx = (top.x + bot.x) / 2, my = (top.y + bot.y) / 2;
          const dist = Math.hypot(Math.max(0, Math.abs(px - mx) - w / 2), Math.max(0, Math.abs(py - my) - h / 2));
          const score = dist / finger;
          if (dist <= finger * 0.6 && score < bestScore) { bestScore = score; best = d.id; }
        }
      }
    }
    return best;
  }
  /** Where a drawn doll is (null if not drawn). */
  function dollPos(id) {
    const d = dolls.get(id);
    if (!d || d.state === 'out') return null;
    return { x: d.group.position.x, y: d.group.position.y, z: d.group.position.z, h: d.h, k: d.pop };
  }

  return {
    root,
    update,
    setGather,
    emote, stagger, seat, seatOf, clearFx, pick, dollPos,
    emoting: (id) => !!(fx.get(id) && fx.get(id).emote),
    /** Dolls currently shown (for name tags). k = 0..1 pop/fade factor. */
    visible() {
      const out = [];
      for (const d of dolls.values()) out.push({ id: d.id, name: d.name, coat: d.coat, x: d.group.position.x, y: d.group.position.y + d.mesh.position.y, z: d.group.position.z, k: Math.min(1, Math.max(0, d.state === 'out' ? d.pop : d.pop)) });
      return out;
    },
    stats() {
      let tris = 0;
      for (const d of dolls.values()) tris += d.lod === 'lite' ? d.entry.liteTris : d.entry.tris;
      return { dolls: dolls.size, dollTris: tris, lods: [...dolls.values()].map((d) => d.lod), cached: cache.size, blobs: blobs.count, fx: fx.size };
    },
    dispose() {
      for (const d of [...dolls.values()]) destroy(d);
      for (const e of cache.values()) { e.full.dispose(); if (e.lite) e.lite.dispose(); }
      cache.clear();
      root.removeFromParent();
    },
  };
}
