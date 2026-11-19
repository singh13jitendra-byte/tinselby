// Floating name tags for remote players: all tags share ONE canvas atlas and ONE mesh (camera-facing quads rebuilt
// on the CPU each frame) → 1 draw call, 2 triangles per tag. Each label is a little red felt patch with a cream
// running stitch, a pom in the player's coat colour and their (cleanName-filtered) name. Readability first: tags draw
// on top (no depth test, so overhead arches / houses don't swallow them), grow a little with distance and fade out far away.
import * as THREE from 'three';
import { cleanName } from '../core/names.js';

const SLOTS = 16, COLS = 2, SW = 256, SH = 64; // atlas 512 × 512
const TAG_H = 0.17; // world height of a tag at the follow-camera distance (~25 px tall)
const FOLLOW_REF = 6.7 * Math.tan(THREE.MathUtils.degToRad(16)); // follow camera: distance × tan(fov / 2)
const LIFT = 0.6; // above the doll's feet (doll is ~0.48 tall incl. pom-pom)

export function createNameTags(ctx) {
  const { engine } = ctx;
  const canvas = document.createElement('canvas');
  canvas.width = SW * COLS;
  canvas.height = SH * (SLOTS / COLS);
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const pos = new Float32Array(SLOTS * 4 * 3), uv = new Float32Array(SLOTS * 4 * 2), col = new Float32Array(SLOTS * 4 * 4).fill(1);
  const idx = new Uint16Array(SLOTS * 6);
  for (let i = 0; i < SLOTS; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, vertexColors: true, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 30;
  mesh.name = 'net-nametags';
  engine.scene.add(mesh);

  const slots = new Array(SLOTS).fill(null); // slot → {id, label, coat, w}
  const byId = new Map();
  let fontReady = false;
  try {
    if (document.fonts && document.fonts.load) document.fonts.load('600 30px Fredoka').then(() => { fontReady = true; redrawAll(); }, () => {});
  } catch (e) { /* default font */ }

  function draw(i) {
    const s = slots[i];
    const x0 = (i % COLS) * SW, y0 = Math.floor(i / COLS) * SH;
    g.clearRect(x0, y0, SW, SH);
    if (!s) return;
    g.save();
    g.font = `600 30px ${fontReady ? 'Fredoka, ' : ''}"Trebuchet MS", system-ui, sans-serif`;
    const text = s.label;
    const tw = Math.min(SW - 62, g.measureText(text).width);
    const h = 50, w = Math.round(tw + 58), x = x0 + Math.round((SW - w) / 2), y = y0 + 7, r = h / 2;
    const pill = () => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    // soft shadow + red felt patch
    g.shadowColor = 'rgba(20,10,20,0.45)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
    pill(); g.fillStyle = '#a92f2b'; g.fill();
    g.shadowColor = 'transparent';
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, 'rgba(255,220,200,0.28)'); grd.addColorStop(0.55, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(60,10,10,0.25)');
    g.fillStyle = grd; pill(); g.fill();
    // cream running stitch (the player's own tag: warm gold stitch + an outer gold rim)
    if (s.self) { pill(); g.lineWidth = 3; g.strokeStyle = '#f2b843'; g.stroke(); }
    g.setLineDash([5, 4]); g.lineWidth = 2.4; g.strokeStyle = s.self ? '#ffd877' : '#f6e6c8';
    g.beginPath(); const ir = r - 5;
    g.moveTo(x + 5 + ir, y + 5); g.arcTo(x + w - 5, y + 5, x + w - 5, y + h - 5, ir); g.arcTo(x + w - 5, y + h - 5, x + 5, y + h - 5, ir); g.arcTo(x + 5, y + h - 5, x + 5, y + 5, ir); g.arcTo(x + 5, y + 5, x + w - 5, y + 5, ir); g.closePath();
    g.stroke(); g.setLineDash([]);
    if (s.self) { // a little gold felt star = "you"
      g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 4.8 : 11; g[k ? 'lineTo' : 'moveTo'](x + 22 + Math.cos(a) * rr, y + h / 2 + 0.5 + Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = '#ffd25a'; g.fill(); g.lineWidth = 1.6; g.lineJoin = 'round'; g.strokeStyle = '#fff1c4'; g.stroke();
    } else {
      // pom in their coat colour
      g.beginPath(); g.arc(x + 22, y + h / 2, 9.5, 0, Math.PI * 2); g.fillStyle = '#f6e6c8'; g.fill();
      g.beginPath(); g.arc(x + 22, y + h / 2, 7.5, 0, Math.PI * 2); g.fillStyle = s.coat; g.fill();
      g.beginPath(); g.arc(x + 19.5, y + h / 2 - 2.5, 2.6, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
    }
    // name
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = 'rgba(60,10,10,0.55)'; g.fillText(text, x + 37, y + h / 2 + 3, SW - 62);
    g.fillStyle = '#fff6e6'; g.fillText(text, x + 36, y + h / 2 + 1.5, SW - 62);
    g.restore();
    s.u0 = x / canvas.width; s.u1 = (x + w) / canvas.width;
    s.v0 = 1 - (y + h + 4) / canvas.height; s.v1 = 1 - (y - 3) / canvas.height;
    s.aspect = w / (h + 7);
    tex.needsUpdate = true;
  }
  function redrawAll() { for (let i = 0; i < SLOTS; i++) if (slots[i]) draw(i); }
  function slotFor(t) {
    let i = byId.get(t.id);
    const label = cleanName(t.name);
    if (i === undefined) {
      i = slots.indexOf(null);
      if (i < 0) return -1;
      slots[i] = { id: t.id, label, coat: t.coat, self: !!t.self };
      byId.set(t.id, i);
      draw(i);
    } else if (slots[i].label !== label || slots[i].coat !== t.coat) { slots[i].label = label; slots[i].coat = t.coat; draw(i); }
    return i;
  }

  const right = new THREE.Vector3(), up = new THREE.Vector3(), cp = new THREE.Vector3();
  const tops = new Map(); // id → {x, y, z, k, f}: world point at the top centre of this frame's tag (speech bubbles sit on it)
  let frame = 0;
  /** tags: [{id, name, coat, x, y, z, k}] (k = 0..1 fade). Call after the camera has moved this frame. */
  function update(tags) {
    const cam = engine.camera;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    right.set(e[0], e[1], e[2]).normalize();
    up.set(e[4], e[5], e[6]).normalize();
    cp.setFromMatrixPosition(cam.matrixWorld);
    const eyeK = ctx.cam?.eye || 0, tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const seen = new Set();
    let n = 0;
    frame++;
    // no depth test: draw far tags first so nearer ones overlap them
    const list = tags.map((t) => ({ t, d: Math.hypot(t.x - cp.x, t.y + LIFT - cp.y, t.z - cp.z) })).sort((a, b) => b.d - a.d);
    for (const { t, d } of list) {
      if (n >= SLOTS) break;
      const i = slotFor(t);
      if (i < 0) continue;
      seen.add(t.id);
      const s = slots[i];
      const cx = t.x, cy = t.y + LIFT + (t.self ? 0.04 : 0), cz = t.z;
      const alpha = t.k * (t.self ? 1 : 1 - smooth(26, 34, d));
      if (alpha < 0.02) continue;
      let size = TAG_H * Math.min(1.9, Math.max(1, 0.6 + d / 16)) * (0.7 + 0.3 * Math.min(1, t.k));
      if (t.self) { // own tag: constant screen-space height (≥ ~26 px, ≤ 8 % of the view), clamped in world size
        const vh = Math.max(200, engine.renderer.domElement.clientHeight || 540);
        size = Math.min(TAG_H * 5, Math.max(TAG_H * 0.8, d * 2 * tanHalf * Math.min(0.08, Math.max(0.047, 26 / vh)))) * (0.7 + 0.3 * Math.min(1, t.k));
      }
      // eye view (camera at doll height, often < 1 m away): never bigger on screen than at the follow-camera distance
      if (eyeK > 0 && !t.self) size += (Math.min(size, TAG_H * 1.15 * d * tanHalf / FOLLOW_REF) - size) * eyeK;
      const hw = (size * s.aspect) / 2;
      const o = n * 12;
      // bl, br, tr, tl
      for (let c = 0; c < 4; c++) {
        const sx = c === 0 || c === 3 ? -hw : hw, sy = c >= 2 ? size : 0;
        pos[o + c * 3] = cx + right.x * sx + up.x * sy;
        pos[o + c * 3 + 1] = cy + right.y * sx + up.y * sy;
        pos[o + c * 3 + 2] = cz + right.z * sx + up.z * sy;
      }
      let tp = tops.get(t.id);
      if (!tp) tops.set(t.id, (tp = { x: 0, y: 0, z: 0, k: 0, f: 0 }));
      tp.x = cx + up.x * size; tp.y = cy + up.y * size; tp.z = cz + up.z * size; tp.k = alpha; tp.f = frame;
      uv.set([s.u0, s.v0, s.u1, s.v0, s.u1, s.v1, s.u0, s.v1], n * 8);
      for (let c = 0; c < 4; c++) col[n * 16 + c * 4 + 3] = alpha;
      n++;
    }
    for (let i = 0; i < SLOTS; i++) if (slots[i] && !seen.has(slots[i].id)) { byId.delete(slots[i].id); slots[i] = null; }
    geo.setDrawRange(0, n * 6);
    geo.attributes.position.needsUpdate = geo.attributes.uv.needsUpdate = geo.attributes.color.needsUpdate = true;
    mesh.visible = n > 0;
    for (const [id, tp] of tops) if (tp.f !== frame) tops.delete(id);
    return n;
  }
  return { mesh, update, /** this frame's tag top for id (or undefined if its tag isn't drawn) */ top: (id) => tops.get(id), get count() { return geo.drawRange.count / 6; }, dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); tex.dispose(); } };
}

function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
