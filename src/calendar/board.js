// The knitted Advent calendar board in Market Square (layout.ADVENT_BOARD): a wooden stand with a red knitted panel,
// 24 felt doors in a 6×4 grid, a glowing star topper, a fairy-light garland and a felt "Town Spirit" counter sign.
// Draw calls: 1 static merged mesh + 1 dynamic door mesh (yarn material) + 1 label mesh (canvas atlas) = 3.
// Door states: locked = shut, soon = shut + cross-stitched, open = ajar + warm glow inside, done = wide open + reward icon.
import * as THREE from 'three';
import { P } from '../core/yarn.js';
import { STYLE_OPTIONS } from '../core/player.js';
import { cyl, sph, box, rbox, tube, dot, extrude, xf, merge, poly, starPts, KNIT, FELT, GLOW, GLOSS } from '../core/prims.js';
import { createAtlas, cellUV, CELL } from './atlas.js';

const COLS = 6, ROWS = 4, CW = 0.26, DOOR = 0.2, DT = 0.028;
const PANEL_W = COLS * CW + 0.2, GRID_H = ROWS * CW, HEADER = 0.25;
const BOTTOM = 0.56, PANEL_H = GRID_H + HEADER + 0.13, TOP = BOTTOM + PANEL_H;
const GRID_TOP = BOTTOM + 0.06 + GRID_H, HEADER_Y = GRID_TOP + HEADER / 2 + 0.01;
const LEG_X = PANEL_W / 2 + 0.03, SIGN_Y = 0.31, SIGN_W = 0.94, SIGN_H = 0.3;
const Z_FRONT = 0.04, Z_PLATE = 0.045, Z_DOOR = 0.065, Z_ICON = 0.049;
const SCALE = 0.8; // whole board (keeps it readable from the follow camera when you stand at it)
const DOOR_COLS = ['#b8302d', '#3f6e45', '#efe1c6', '#4f9590', '#d59f3c', '#8a4f7d'];
const HAT_TINT = { santa: '#c4362f', reindeer: '#8a5a3c', elf: '#3f8a4a', bobble: '#efe1c6', earflap: '#8a5a3c', earmuffs: '#e7a1a3' };
const SPECIAL_TINT = { candycane: '#e0605a', striped: '#e0605a', gingerbread: '#a8693c' };

/** Door n (1..24) cell centre in board space. */
export function cellCentre(n) {
  const i = n - 1, col = i % COLS, row = Math.floor(i / COLS);
  return [(col - (COLS - 1) / 2) * CW, GRID_TOP - (row + 0.5) * CW];
}

function isColour(v) { return typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v); }
export function rewardTint(slot, key) {
  if (SPECIAL_TINT[key]) return SPECIAL_TINT[key];
  if (slot === 'hat') return HAT_TINT[key] || '#e3aa3a';
  const v = STYLE_OPTIONS[slot]?.[key];
  return isColour(v) ? v : '#e3aa3a';
}

export function createBoard(ctx, data) {
  const { engine, layout } = ctx;
  const B = layout.ADVENT_BOARD;
  const group = new THREE.Group();
  group.name = 'advent-board';
  group.position.set(B.x, ctx.colliders?.heightAt?.(B.x, B.z) || 0, B.z);
  group.rotation.y = B.heading || 0;
  group.scale.setScalar(SCALE);
  engine.scene.add(group);
  const ch = Math.cos(group.rotation.y) * SCALE, sh = Math.sin(group.rotation.y) * SCALE;
  /** board-local (x, z) → world (x, z) */
  const toWorld = (lx, lz) => [B.x + lx * ch + lz * sh, B.z - lx * sh + lz * ch];

  // ------------------------------------------------------------ static mesh (stand, panel, garland, topper, sign)
  const g = [];
  const panelCY = BOTTOM + PANEL_H / 2;
  g.push(xf(rbox(PANEL_W + 0.09, PANEL_H + 0.09, 0.05, 0.025, P.cream, KNIT), [0, panelCY, -0.03]));
  g.push(xf(rbox(PANEL_W, PANEL_H, 0.08, 0.03, P.red, KNIT), [0, panelCY, 0]));
  for (const sx of [-1, 1]) {
    const legH = TOP + 0.08;
    g.push(xf(cyl(0.042, 0.05, legH, 10, P.wood, KNIT), [sx * LEG_X, legH / 2, -0.01]));
    g.push(xf(sph(0.055, P.gold, GLOSS, 10, 8), [sx * LEG_X, legH + 0.04, -0.01]));
    g.push(xf(rbox(0.13, 0.06, 0.36, 0.02, P.woodDark, KNIT), [sx * LEG_X, 0.03, -0.01]));
    for (let k = 0; k < 3; k++) g.push(xf(sph(0.06 - k * 0.012, P.snow, FELT, 10, 6), [sx * LEG_X + (k - 1) * 0.07, 0.05, 0.13 - k * 0.12], null, [1, 0.55, 1]));
  }
  // cross bar + hanging counter sign
  g.push(xf(cyl(0.022, 0.022, LEG_X * 2, 8, P.woodDark, KNIT), [0, SIGN_Y + SIGN_H / 2 + 0.06, -0.01], [0, 0, Math.PI / 2]));
  for (const sx of [-1, 1]) g.push(xf(cyl(0.006, 0.006, 0.07, 4, P.thread, KNIT), [sx * 0.36, SIGN_Y + SIGN_H / 2 + 0.03, 0.01]));
  g.push(xf(rbox(SIGN_W + 0.05, SIGN_H + 0.05, 0.03, 0.03, P.green, FELT), [0, SIGN_Y, 0.005]));
  g.push(xf(rbox(SIGN_W, SIGN_H, 0.04, 0.03, P.cream, FELT), [0, SIGN_Y, 0.012]));
  // header ribbon
  g.push(xf(rbox(1.22, 0.2, 0.03, 0.02, '#2f6446', FELT), [0, HEADER_Y, Z_FRONT + 0.012]));
  for (const sx of [-1, 1]) g.push(xf(box(0.12, 0.13, 0.02, '#244f37', FELT), [sx * 0.64, HEADER_Y - 0.02, Z_FRONT + 0.004], [0, 0, sx * 0.35]));
  // door mats (cream felt frames)
  for (let n = 1; n <= 24; n++) { const [cx, cy] = cellCentre(n); g.push(xf(box(0.232, 0.232, 0.006, '#f1e2c4', FELT), [cx, cy, Z_FRONT + 0.001])); }
  // glowing felt star topper
  g.push(xf(extrude(poly(starPts(0.13, 0.055)), 0.045, '#d99a2e', GLOW), [0, TOP + 0.16, -0.022]));
  g.push(xf(cyl(0.012, 0.012, 0.12, 5, P.woodDark, KNIT), [0, TOP + 0.04, -0.01]));
  // cotton snow along the top
  for (let i = 0; i < 7; i++) g.push(xf(sph(0.075 - (i % 2) * 0.015, P.snow, FELT, 10, 6), [(i - 3) * 0.27 + ((i * 37) % 5 - 2) * 0.015, TOP + 0.015, 0], null, [1.4, 0.5, 0.9]));
  // pine garland with fairy lights, two swags across the top front
  const gz = Z_FRONT + 0.04, gy = TOP - 0.03;
  const swag = [[-PANEL_W / 2, gy, gz], [-PANEL_W / 4, gy - 0.1, gz + 0.01], [0, gy - 0.01, gz], [PANEL_W / 4, gy - 0.1, gz + 0.01], [PANEL_W / 2, gy, gz]];
  g.push(tube(swag, 0.026, P.pine, KNIT, 40, 6));
  const bulbs = ['#ffae55', '#ff7b6b', '#9fe0a0', '#fff1c9'];
  const curve = new THREE.CatmullRomCurve3(swag.map((p) => new THREE.Vector3(...p)));
  for (let i = 0; i <= 10; i++) { const p = curve.getPoint(i / 10); g.push(xf(dot(0.022, bulbs[i % 4], GLOW), [p.x, p.y - 0.025, p.z + 0.012])); }
  const staticMesh = new THREE.Mesh(merge(g), engine.mat);
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;
  group.add(staticMesh);

  // ------------------------------------------------------------ dynamic door mesh (doors hinge on their right edge)
  const slab = xf(rbox(DOOR, DOOR, DT, 0.012, '#ffffff', FELT, 1), [-DOOR / 2, 0, 0]);
  const slabN = slab.attributes.position.count;
  const knob = xf(dot(0.014, P.gold, GLOSS), [-DOOR + 0.032, 0, DT / 2 + 0.006]);
  const tmpl = merge([slab, knob]);
  const plate = box(DOOR - 0.012, DOOR - 0.012, 0.004, '#2f2420', FELT);
  const TN = tmpl.attributes.position.count, PN = plate.attributes.position.count;
  const PER = TN + PN, NV = PER * 24;
  const dg = new THREE.BufferGeometry();
  const A = (n, k) => new THREE.BufferAttribute(new Float32Array(n * k), k);
  for (const [name, k] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3], ['aMat', 1]]) dg.setAttribute(name, A(NV, k));
  const dpos = dg.attributes.position.array, dnor = dg.attributes.normal.array, dcol = dg.attributes.color.array, dmat = dg.attributes.aMat.array;
  const tp = tmpl.attributes.position.array, tn = tmpl.attributes.normal.array;
  const hinge = []; // per door [hx, hy, hz]
  const tmpC = new THREE.Color();
  for (let i = 0; i < 24; i++) {
    const [cx, cy] = cellCentre(i + 1);
    hinge.push([cx + DOOR / 2, cy, Z_DOOR]);
    const o = i * PER;
    dg.attributes.uv.array.set(tmpl.attributes.uv.array, o * 2);
    dg.attributes.color.array.set(tmpl.attributes.color.array, o * 3);
    dmat.set(tmpl.attributes.aMat.array, o);
    // plate: static position
    const pp = plate.attributes.position.array, pn = plate.attributes.normal.array;
    for (let v = 0; v < PN; v++) {
      const d = (o + TN + v) * 3;
      dpos[d] = pp[v * 3] + cx; dpos[d + 1] = pp[v * 3 + 1] + cy; dpos[d + 2] = pp[v * 3 + 2] + Z_PLATE;
      dnor[d] = pn[v * 3]; dnor[d + 1] = pn[v * 3 + 1]; dnor[d + 2] = pn[v * 3 + 2];
    }
    dg.attributes.uv.array.set(plate.attributes.uv.array, (o + TN) * 2);
    dg.attributes.color.array.set(plate.attributes.color.array, (o + TN) * 3);
    dmat.set(plate.attributes.aMat.array, o + TN);
  }
  plate.dispose();
  dg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, GRID_TOP - GRID_H / 2, 0.1), 1.2);
  const doorMesh = new THREE.Mesh(dg, engine.mat);
  doorMesh.receiveShadow = true;
  group.add(doorMesh);

  function writeDoor(i, a) {
    const c = Math.cos(a), s = Math.sin(a), [hx, hy, hz] = hinge[i], o = i * PER * 3;
    for (let v = 0; v < TN; v++) {
      const k = v * 3, d = o + k;
      const x = tp[k], y = tp[k + 1], z = tp[k + 2];
      dpos[d] = hx + x * c + z * s; dpos[d + 1] = hy + y; dpos[d + 2] = hz - x * s + z * c;
      const nx = tn[k], nz = tn[k + 2];
      dnor[d] = nx * c + nz * s; dnor[d + 1] = tn[k + 1]; dnor[d + 2] = -nx * s + nz * c;
    }
  }
  function paintDoor(i, st) {
    const o = i * PER;
    tmpC.set(DOOR_COLS[(i * 5 + Math.floor(i / COLS)) % DOOR_COLS.length]);
    if (st === 'soon') tmpC.lerp(new THREE.Color('#8f8a86'), 0.55).multiplyScalar(0.8);
    for (let v = 0; v < slabN; v++) { const d = (o + v) * 3; dcol[d] = tmpC.r; dcol[d + 1] = tmpC.g; dcol[d + 2] = tmpC.b; }
    const kind = st === 'open' ? GLOW : FELT;
    tmpC.set(st === 'open' ? '#cf6f26' : st === 'done' ? '#f3d9a8' : '#2f2420');
    for (let v = 0; v < PN; v++) { const d = (o + TN + v) * 3; dcol[d] = tmpC.r; dcol[d + 1] = tmpC.g; dcol[d + 2] = tmpC.b; dmat[o + TN + v] = kind; }
  }

  // ------------------------------------------------------------ label mesh (atlas quads)
  const atlas = createAtlas();
  const labelMat = new THREE.MeshStandardMaterial({
    map: atlas.tex, alphaTest: 0.42, vertexColors: true, roughness: 0.95, metalness: 0,
    emissive: new THREE.Color('#ffffff'), emissiveMap: atlas.tex, emissiveIntensity: 0.14,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const NQ = 105;
  const lg = new THREE.BufferGeometry();
  for (const [name, k] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) lg.setAttribute(name, A(NQ * 6, k));
  const lpos = lg.attributes.position.array, lnor = lg.attributes.normal.array, luv = lg.attributes.uv.array, lcol = lg.attributes.color.array;
  const Q = { num: 0, stitch: 24, icon: 48, stars: 72, header: 96, spirit: 97, flake: 98, digits: 99 };
  const ORDER = [0, 1, 2, 0, 2, 3]; // corners: 0 bl, 1 br, 2 tr, 3 tl
  /** Write a quad from 4 corners ([x,y,z] bl, br, tr, tl), a uv rect and a tint; normal n. */
  function setQuad(q, corners, uv, tint, n = [0, 0, 1]) {
    const uvc = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    tmpC.set(tint);
    for (let j = 0; j < 6; j++) {
      const c = ORDER[j], d = (q * 6 + j);
      lpos.set(corners[c], d * 3); lnor.set(n, d * 3); luv.set(uvc[c], d * 2);
      lcol[d * 3] = tmpC.r; lcol[d * 3 + 1] = tmpC.g; lcol[d * 3 + 2] = tmpC.b;
    }
  }
  const hideQuad = (q) => lpos.fill(0, q * 18, q * 18 + 18);
  const flatQuad = (q, cx, cy, z, w, h, uv, tint) => setQuad(q, [[cx - w / 2, cy - h / 2, z], [cx + w / 2, cy - h / 2, z], [cx + w / 2, cy + h / 2, z], [cx - w / 2, cy + h / 2, z]], uv, tint);
  function writeNumber(i, a, st) {
    const c = Math.cos(a), s = Math.sin(a), [hx, hy, hz] = hinge[i], z = DT / 2 + 0.0025, h = DOOR / 2;
    const P4 = [[-DOOR, -h], [0, -h], [0, h], [-DOOR, h]].map(([x, y]) => [hx + x * c + z * s, hy + y, hz - x * s + z * c]);
    setQuad(Q.num + i, P4, cellUV(CELL.num(i + 1)), st === 'soon' ? '#bdb5ad' : '#ffffff', [s, 0, c]);
  }
  // static labels
  flatQuad(Q.header, 0, HEADER_Y, Z_FRONT + 0.03, 0.96, 0.24, cellUV(CELL.header, 4), '#ffffff');
  flatQuad(Q.flake, -0.34, SIGN_Y, 0.035, 0.22, 0.22, cellUV(CELL.flake), '#cfe3f2');
  flatQuad(Q.spirit, 0.09, SIGN_Y + 0.075, 0.035, 0.6, 0.15, cellUV(CELL.spirit, 4), '#ffffff');
  for (let q = 0; q < 24 * 3; q++) hideQuad(Q.stitch + q);
  lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, TOP / 2, 0.1), 1.6);
  const labelMesh = new THREE.Mesh(lg, labelMat);
  labelMesh.receiveShadow = true;
  group.add(labelMesh);

  let spiritShown = -1;
  function setSpirit(v) {
    v = Math.max(0, Math.min(999999, Math.floor(v || 0)));
    if (v === spiritShown) return;
    spiritShown = v;
    const s = String(v), w = 0.072, x0 = 0.09 - ((s.length - 1) * w) / 2;
    for (let k = 0; k < 6; k++) {
      if (k < s.length) flatQuad(Q.digits + k, x0 + k * w, SIGN_Y - 0.055, 0.036, 0.13, 0.13, cellUV(CELL.digit(+s[k])), '#c4362f');
      else hideQuad(Q.digits + k);
    }
    lg.attributes.position.needsUpdate = lg.attributes.uv.needsUpdate = lg.attributes.color.needsUpdate = lg.attributes.normal.needsUpdate = true;
  }

  // ------------------------------------------------------------ state + animation
  const states = new Array(24).fill(null);
  const angle = new Float32Array(24).fill(-1); // -1 forces the first write
  let sig = '';
  function applyStates(force = false) {
    const next = [];
    for (let n = 1; n <= 24; n++) next.push(data.state(n));
    // stars only matter visually for done mini-game doors
    const s = next.join(',') + '|' + next.map((st, i) => (st === 'done' ? data.stars(i + 1) : 0)).join('');
    if (s === sig && !force) return [];
    sig = s;
    const changed = [];
    for (let i = 0; i < 24; i++) {
      const st = next[i];
      if (states[i] !== st) changed.push({ n: i + 1, from: states[i], to: st });
      states[i] = st;
      paintDoor(i, st);
      const [cx, cy] = cellCentre(i + 1);
      // stitches on "coming soon" doors (mirrored so they sit on the free, left-hand seam)
      if (st === 'soon') { const u = cellUV(CELL.stitch); flatQuad(Q.stitch + i, cx - 0.036, cy, Z_DOOR + DT / 2 + 0.005, DOOR, DOOR, [u[2], u[1], u[0], u[3]], '#f6ead6'); }
      else hideQuad(Q.stitch + i);
      const d = data.door(i + 1);
      if (st === 'done') {
        const r = d?.reward;
        const cell = r ? CELL[r.slot] ?? CELL.star : CELL.star;
        flatQuad(Q.icon + i, cx, cy + 0.022, Z_ICON, 0.13, 0.13, cellUV(cell), r ? rewardTint(r.slot, r.key) : '#f2b640');
        const k = d?.game ? data.stars(i + 1) : 0;
        if (k > 0) { const u = cellUV(CELL.stars(k)); const dv = (u[3] - u[1]); flatQuad(Q.stars + i, cx, cy - 0.06, Z_ICON + 0.001, 0.17, 0.064, [u[0], u[1] + dv * 0.3, u[2], u[3] - dv * 0.3], '#ffffff'); }
        else hideQuad(Q.stars + i);
      } else { hideQuad(Q.icon + i); hideQuad(Q.stars + i); }
      writeNumber(i, Math.max(0, angle[i]), st);
    }
    dg.attributes.color.needsUpdate = dg.attributes.aMat.needsUpdate = true;
    lg.attributes.position.needsUpdate = lg.attributes.uv.needsUpdate = lg.attributes.color.needsUpdate = lg.attributes.normal.needsUpdate = true;
    return changed;
  }

  const focus = new THREE.Vector3();
  function update(dt, t) {
    const near = engine.focus ? focus.copy(engine.focus).distanceTo(group.position) < 16 : true;
    let moved = false;
    for (let i = 0; i < 24; i++) {
      const st = states[i];
      const goal = st === 'open' ? 0.6 + Math.sin(t * 1.4 + i * 1.7) * (near ? 0.07 : 0) : st === 'done' ? 1.32 : 0;
      const a0 = angle[i] < 0 ? goal : angle[i];
      const a = angle[i] < 0 ? goal : a0 + (goal - a0) * (1 - Math.exp(-dt * 4.5));
      if (Math.abs(a - angle[i]) > 1e-4 && (near || angle[i] < 0 || Math.abs(goal - a) > 0.01)) {
        angle[i] = a;
        writeDoor(i, a);
        writeNumber(i, a, st);
        moved = true;
      }
    }
    if (moved) {
      dg.attributes.position.needsUpdate = dg.attributes.normal.needsUpdate = true;
      lg.attributes.position.needsUpdate = lg.attributes.normal.needsUpdate = true;
    }
  }

  /** World position of a door's centre (for sparkles). */
  function doorWorld(n) {
    const [cx, cy] = cellCentre(n);
    const [wx, wz] = toWorld(cx, Z_DOOR + 0.05);
    return new THREE.Vector3(wx, group.position.y + cy * SCALE, wz);
  }

  return {
    group, staticMesh, doorMesh, labelMesh, toWorld, doorWorld,
    legs: [toWorld(-LEG_X, 0), toWorld(LEG_X, 0)],
    front: toWorld(0, 0.95),
    applyStates, setSpirit, update,
    get states() { return states.slice(); },
    stats() {
      const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      return { meshes: 3, tris: Math.round(tri(staticMesh) + tri(doorMesh) + tri(labelMesh)) };
    },
  };
}
