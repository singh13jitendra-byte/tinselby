// The gift Santa hands over: a small ornate music box / treasure chest. Knitted dark-wood box with gold inlay corners,
// trim bands, diamond inlays and a clasp; a hinged lid (separate pivot) with "Merry Christmas!" lettering inside.
// Inside, under a warm glowing lining: a tiny decorated Christmas tree (glowing fairy lights, baubles, gold star),
// a candle with a glowing flame, a felt cottage with a lit window, little parcels and a glowing arched window.
// A knitted tag "For {name}" hangs from the front-left corner.
// Box front faces +z, hinge along the back top edge (−z); origin near the box centre. ≈ 0.16 wide, ≈ 2.5k triangles.
// userData: { lid (pivot Group), setOpen(k 0..1), inside (Object3D at the interior centre, for sparkles), tag }.
import * as THREE from 'three';
import { cone, cyl, sph, box, rbox, tube, extrude, xf, merge, part, poly, starPts, KNIT, FELT, GLOSS, GLOW } from '../core/prims.js';
import { P } from '../core/yarn.js';

const W = 0.16, D = 0.108, BH = 0.062, LH = 0.024, T = 0.007; // width, depth, body height, lid height, wall thickness
const Y0 = -0.03; // body bottom
const TOP = Y0 + BH; // body rim height (hinge line)
const FLOOR = Y0 + T + 0.002; // interior floor (top of the lining)
const OPEN = -1.9; // lid angle about the hinge when fully open (rad)
const C = {
  wood: '#6a3f27', panel: '#4c2b1a', lining: '#48190d', floor: '#5c2a12', gold: '#d39b35', // antique gold
  pine: '#2f6446', pineLight: '#3f7d52', trunk: P.woodDark, candle: '#f3e6cc', flame: '#ffc766',
  house: P.cream, roof: '#9e2b28', window: '#e8893a', arch: '#d97a2e',
};
const LIGHTS = ['#ffd27a', '#ff8a5c', '#fff1c9', '#ffb347', '#ff6f6f', '#ffe08a'];

/** Multiply a part's uv (stitch units) so knit / felt reads at the box's tiny scale. */
function fine(g, k) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}
const lowDot = (r, c, k = GLOSS) => sph(r, c, k, 5, 3); // 20 triangles

/** Flat diamond plate on a face: centre p, normal along axis 'z' | 'x' (sign s), half-width a (horizontal), half-height b. */
function diamond(p, axis, s, a, b, t, c, k) {
  const g = cyl(1, 1, t, 4, c, k); // 4 radial segments: vertices on ±x / ±z, a rhombus seen down the y axis
  if (axis === 'z') { g.scale(a, 1, b); g.rotateX(s * Math.PI / 2); } // x stays horizontal, z becomes vertical
  else { g.scale(b, 1, a); g.rotateZ(-s * Math.PI / 2); } // x becomes vertical, z stays horizontal (along the side)
  g.translate(p[0], p[1], p[2]);
  return g;
}

function bodyParts() {
  const g = [];
  const wood = (geo) => fine(geo, 2.6);
  // hollow body: floor + 4 walls (knitted dark wood)
  g.push(wood(xf(box(W, T, D, C.wood, KNIT), [0, Y0 + T / 2, 0])));
  g.push(wood(xf(box(W, BH, T, C.wood, KNIT), [0, Y0 + BH / 2, D / 2 - T / 2])));
  g.push(wood(xf(box(W, BH, T, C.wood, KNIT), [0, Y0 + BH / 2, -D / 2 + T / 2])));
  for (const s of [-1, 1]) g.push(wood(xf(box(T, BH, D - 2 * T, C.wood, KNIT), [s * (W / 2 - T / 2), Y0 + BH / 2, 0])));
  // recessed darker panels on the outside faces
  g.push(fine(xf(box(W - 0.032, BH - 0.03, 0.002, C.panel, FELT), [0, Y0 + BH / 2, D / 2 + 0.001]), 3));
  for (const s of [-1, 1]) g.push(fine(xf(box(0.002, BH - 0.03, D - 0.032, C.panel, FELT), [s * (W / 2 + 0.001), Y0 + BH / 2, 0]), 3));
  // warm glowing lining (inner walls + floor): reads as candle-lit velvet once the lid opens
  const li = 0.0016, iw = W - 2 * T, id = D - 2 * T, ih = BH - T - 0.003;
  g.push(xf(box(iw, 0.002, id, C.floor, GLOW), [0, FLOOR - 0.001, 0]));
  g.push(xf(box(iw, ih, li, C.lining, GLOW), [0, FLOOR + ih / 2, -D / 2 + T + li / 2]));
  g.push(xf(box(iw, ih, li, C.lining, GLOW), [0, FLOOR + ih / 2, D / 2 - T - li / 2]));
  for (const s of [-1, 1]) g.push(xf(box(li, ih, id - 2 * li, C.lining, GLOW), [s * (W / 2 - T - li / 2), FLOOR + ih / 2, 0]));
  // glowing arched window on the back lining, with dark mullions
  const arch = poly([[-0.015, 0], [0.015, 0], ...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI; return [Math.cos(a) * 0.015, 0.024 + Math.sin(a) * 0.015]; })]);
  const az = -D / 2 + T + li + 0.0004;
  g.push(xf(extrude(arch, 0.0008, C.arch, GLOW, 1), [-0.044, FLOOR + 0.004, az]));
  g.push(xf(box(0.0024, 0.038, 0.0012, C.panel, FELT), [-0.044, FLOOR + 0.023, az + 0.001]));
  g.push(xf(box(0.03, 0.0024, 0.0012, C.panel, FELT), [-0.044, FLOOR + 0.022, az + 0.001]));
  // gold: top rim band + bottom band (slightly proud of the walls)
  const band = (y, h, o) => {
    g.push(xf(box(W + o * 2, h, 0.003, C.gold, GLOSS), [0, y, D / 2 + o - 0.0015]));
    g.push(xf(box(W + o * 2, h, 0.003, C.gold, GLOSS), [0, y, -D / 2 - o + 0.0015]));
    for (const s of [-1, 1]) g.push(xf(box(0.003, h, D + o * 2, C.gold, GLOSS), [s * (W / 2 + o - 0.0015), y, 0]));
  };
  band(TOP - 0.0024, 0.0048, 0.0022);
  band(Y0 + 0.0024, 0.0048, 0.0022);
  // gold L-shaped corner caps on the four vertical edges
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.push(xf(box(0.0095, BH, 0.0028, C.gold, GLOSS), [sx * (W / 2 - 0.00475 + 0.0026), Y0 + BH / 2, sz * (D / 2 + 0.0026)]));
    g.push(xf(box(0.0028, BH, 0.0095, C.gold, GLOSS), [sx * (W / 2 + 0.0026), Y0 + BH / 2, sz * (D / 2 - 0.00475 + 0.0026)]));
    g.push(xf(lowDot(0.0065, C.gold), [sx * (W / 2 - 0.007), Y0 - 0.004, sz * (D / 2 - 0.007)], null, [1, 0.8, 1])); // ball feet
  }
  // gold diamond inlays (front ×2, sides ×1) with a dark centre and a gold boss
  const yc = Y0 + BH / 2;
  for (const x of [-0.044, 0.044]) {
    g.push(diamond([x, yc, D / 2 + 0.0025], 'z', 1, 0.021, 0.015, 0.0016, C.gold, GLOSS));
    g.push(diamond([x, yc, D / 2 + 0.0034], 'z', 1, 0.016, 0.011, 0.0012, C.panel, FELT));
    g.push(xf(lowDot(0.0032, C.gold), [x, yc, D / 2 + 0.0038]));
  }
  for (const s of [-1, 1]) {
    g.push(diamond([s * (W / 2 + 0.0025), yc, 0], 'x', s, 0.02, 0.014, 0.0016, C.gold, GLOSS));
    g.push(diamond([s * (W / 2 + 0.0034), yc, 0], 'x', s, 0.015, 0.0105, 0.0012, C.panel, FELT));
    g.push(xf(lowDot(0.0032, C.gold), [s * (W / 2 + 0.0038), yc, 0]));
  }
  // lock plate with a keyhole on the front centre
  g.push(xf(box(0.018, 0.022, 0.003, C.gold, GLOSS), [0, TOP - 0.02, D / 2 + 0.003]));
  g.push(xf(lowDot(0.0026, P.ink, FELT), [0, TOP - 0.018, D / 2 + 0.0048], null, [1, 1, 0.4]));
  g.push(xf(box(0.0018, 0.005, 0.001, P.ink, FELT), [0, TOP - 0.022, D / 2 + 0.0047]));
  // yarn loop for the tag (front-left corner)
  g.push(tube([[-W / 2 + 0.002, TOP - 0.004, D / 2 + 0.004], [-W / 2 - 0.004, TOP - 0.006, D / 2 + 0.008], [-W / 2 - 0.008, Y0 + 0.044, D / 2 + 0.01]], 0.0016, P.cream, KNIT, 8, 4));
  return g;
}

function lidParts() {
  // lid-local: hinge on the x axis at the origin; lid extends along +z (closed) and up to y = LH
  const g = [];
  const o = 0.003; // overhang
  const zc = D / 2 + o;
  g.push(fine(xf(rbox(W + 2 * o, LH, D + 2 * o, 0.005, C.wood, KNIT, 1), [0, LH / 2, zc]), 2.6));
  // raised top panel with a gold frame, diamond and corner studs
  g.push(fine(xf(rbox(W - 0.03, 0.006, D - 0.03, 0.002, C.panel, FELT, 1), [0, LH + 0.002, zc]), 3));
  const fy = LH + 0.0012;
  for (const s of [-1, 1]) {
    g.push(xf(box(W - 0.022, 0.003, 0.0035, C.gold, GLOSS), [0, fy, zc + s * (D - 0.026) / 2]));
    g.push(xf(box(0.0035, 0.003, D - 0.022, C.gold, GLOSS), [s * (W - 0.026) / 2, fy, zc]));
  }
  const top = cyl(1, 1, 0.0016, 4, C.gold, GLOSS);
  g.push(xf(top, [0, LH + 0.0056, zc], null, [0.03, 1, 0.022]));
  g.push(xf(lowDot(0.004, C.gold), [0, LH + 0.0068, zc]));
  // gold band around the lid's lower edge + corner caps
  const by = 0.0024;
  g.push(xf(box(W + 2 * o + 0.004, 0.0048, 0.003, C.gold, GLOSS), [0, by, D + 2 * o + 0.0005]));
  g.push(xf(box(W + 2 * o + 0.004, 0.0048, 0.003, C.gold, GLOSS), [0, by, -0.0005]));
  for (const s of [-1, 1]) g.push(xf(box(0.003, 0.0048, D + 2 * o + 0.004, C.gold, GLOSS), [s * (W / 2 + o + 0.0005), by, zc]));
  for (const sx of [-1, 1]) for (const z of [0.0005, D + 2 * o - 0.0005]) {
    g.push(xf(box(0.012, 0.006, 0.012, C.gold, GLOSS), [sx * (W / 2 + o - 0.005), LH - 0.0015, z + (z < 0.01 ? 0.0055 : -0.0055)]));
  }
  // clasp (hasp) hanging from the front edge over the lock plate
  g.push(xf(box(0.013, 0.02, 0.0028, C.gold, GLOSS), [0, -0.004, D + 2 * o + 0.0032]));
  g.push(xf(lowDot(0.0028, C.gold), [0, -0.011, D + 2 * o + 0.005]));
  return g;
}

function insideParts() {
  // inside-local: origin on the interior floor at the box centre (scaled in y for the pop-up when the lid opens)
  const g = [];
  const tx = 0.004, tz = -0.008; // tree near the centre, a little towards the back
  g.push(xf(cyl(0.004, 0.005, 0.014, 6, C.trunk, KNIT), [tx, 0.007, tz]));
  g.push(xf(cyl(0.012, 0.0095, 0.008, 8, C.gold, GLOSS), [tx, 0.004, tz])); // gold pot
  const tiers = [[0.04, 0.046, 0.013], [0.031, 0.04, 0.037], [0.021, 0.034, 0.059]]; // [radius, height, base y]
  tiers.forEach(([r, h, y], i) => g.push(fine(xf(cone(r, h, 12, i % 2 ? C.pineLight : C.pine, KNIT), [tx, y + h / 2, tz]), 2.2)));
  const treeTop = 0.093;
  const radius = (y) => { // outer radius of the tier stack at height y
    let r = 0;
    for (const [tr, th, ty] of tiers) if (y >= ty && y <= ty + th) r = Math.max(r, tr * (1 - (y - ty) / th));
    return r;
  };
  // fairy lights spiralling down the tree (GLOW), baubles in between (GLOSS)
  const N = 22;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1), y = 0.017 + k * 0.068, a = i * 2.25;
    const r = radius(y) + 0.0012;
    g.push(xf(lowDot(0.0032, LIGHTS[i % LIGHTS.length], GLOW), [tx + Math.sin(a) * r, y, tz + Math.cos(a) * r]));
  }
  const BAUBLES = [P.red, C.gold, '#c8312f', C.gold, P.red, '#e9d9b8', '#c8312f'];
  for (let i = 0; i < BAUBLES.length; i++) {
    const y = 0.022 + (i / (BAUBLES.length - 1)) * 0.05, a = i * 2.25 + 1.1;
    const r = radius(y) + 0.002;
    g.push(xf(lowDot(0.0042, BAUBLES[i], GLOSS), [tx + Math.sin(a) * r, y, tz + Math.cos(a) * r]));
  }
  // gold bead garland: a loose spiral
  const gp = [];
  for (let i = 0; i <= 14; i++) { const k = i / 14, y = 0.022 + k * 0.058, a = k * Math.PI * 3.2 + 0.4; const r = radius(y) + 0.0008; gp.push([tx + Math.sin(a) * r, y, tz + Math.cos(a) * r]); }
  g.push(tube(gp, 0.0012, C.gold, GLOSS, 36, 3));
  // gold star on top (gloss points around a glowing heart)
  const star = extrude(poly(starPts(0.0125, 0.0055, 5)), 0.003, C.gold, GLOSS, 1);
  g.push(xf(star, [tx, treeTop + 0.005, tz - 0.0015]));
  g.push(xf(lowDot(0.005, '#ffe3a0', GLOW), [tx, treeTop + 0.005, tz + 0.0004]));
  // little parcels in front of the tree
  g.push(xf(box(0.013, 0.011, 0.013, P.red, FELT), [tx + 0.03, 0.0055, tz + 0.036], [0, 0.4, 0]));
  g.push(xf(box(0.014, 0.0016, 0.0134, C.gold, FELT), [tx + 0.03, 0.0097, tz + 0.036], [0, 0.4, 0]));
  g.push(xf(box(0.011, 0.009, 0.011, '#2f6e4a', FELT), [tx - 0.012, 0.0045, tz + 0.042], [0, -0.3, 0]));
  g.push(xf(box(0.012, 0.0014, 0.0036, P.red, FELT), [tx - 0.012, 0.0092, tz + 0.042], [0, -0.3, 0]));
  // candle on a little gold side table, left, with a glowing flame
  const cx = -0.05, cz = 0.014;
  g.push(xf(cyl(0.007, 0.008, 0.0015, 8, C.gold, GLOSS), [cx, 0.00075, cz]));
  g.push(xf(cyl(0.0016, 0.0016, 0.013, 4, C.gold, GLOSS), [cx, 0.0075, cz]));
  g.push(xf(cyl(0.0095, 0.0095, 0.0018, 10, C.panel, FELT), [cx, 0.0145, cz]));
  g.push(xf(cyl(0.0045, 0.0048, 0.017, 8, C.candle, FELT), [cx, 0.0239, cz]));
  g.push(xf(cyl(0.0006, 0.0006, 0.003, 3, P.ink, FELT), [cx, 0.0335, cz]));
  g.push(xf(sph(0.0036, C.flame, GLOW, 6, 5), [cx, 0.0375, cz], null, [1, 1.9, 1]));
  // felt cottage with a lit window, back right
  const hx = 0.052, hz = -0.018;
  g.push(fine(xf(box(0.024, 0.019, 0.019, C.house, FELT), [hx, 0.0095, hz], [0, -0.3, 0]), 3));
  const roof = cyl(0.0125, 0.0125, 0.026, 3, C.roof, FELT); // triangular prism: apex up, ridge along the cottage's x
  roof.rotateX(-Math.PI / 2); roof.scale(1, 0.8, 1); roof.rotateY(Math.PI / 2 - 0.3); roof.translate(hx, 0.024, hz);
  g.push(roof);
  const rot = new THREE.Matrix4().makeRotationY(-0.3);
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(rot).add(new THREE.Vector3(hx, 0, hz)).toArray();
  g.push(xf(box(0.0075, 0.0075, 0.0012, C.window, GLOW), at(0.005, 0.011, 0.0098), [0, -0.3, 0]));
  g.push(xf(box(0.006, 0.01, 0.0012, P.woodDark, FELT), at(-0.0062, 0.005, 0.0098), [0, -0.3, 0]));
  return g;
}

/** Canvas lettering for the inside of the lid: gold "Merry Christmas!" on dark wood with a gold border and stars. */
function letteringTexture() {
  const cv = document.createElement('canvas');
  cv.width = 384; cv.height = 256;
  const c = cv.getContext('2d');
  const grd = c.createRadialGradient(192, 150, 20, 192, 128, 230);
  grd.addColorStop(0, '#6a3a22'); grd.addColorStop(1, '#3a2014');
  c.fillStyle = grd;
  c.fillRect(0, 0, 384, 256);
  for (let y = 0; y < 256; y += 10) for (let x = (y / 10) % 2 ? 0 : 7; x < 384; x += 14) { // fine knit V texture
    c.strokeStyle = 'rgba(255,220,170,0.07)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3.5, y + 8); c.lineTo(x + 7, y); c.stroke();
  }
  c.strokeStyle = '#d9a23e'; c.lineWidth = 4; c.strokeRect(12, 12, 360, 232);
  c.lineWidth = 1.5; c.strokeRect(22, 22, 340, 212);
  const starAt = (x, y, r) => {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill();
  };
  c.fillStyle = '#f2c35a';
  for (const [x, y, r] of [[40, 40, 9], [344, 40, 9], [40, 216, 9], [344, 216, 9], [192, 40, 7]]) starAt(x, y, r);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const script = '"Snell Roundhand", "Apple Chancery", "Segoe Script", "Brush Script MT", Georgia, "Times New Roman", serif';
  const line = (txt, y, size) => {
    c.font = `italic 700 ${size}px ${script}`;
    let s = size;
    while (c.measureText(txt).width > 320 && s > 20) { s -= 2; c.font = `italic 700 ${s}px ${script}`; }
    c.lineWidth = 6; c.strokeStyle = 'rgba(40,18,8,0.85)'; c.strokeText(txt, 192, y);
    const g2 = c.createLinearGradient(0, y - s / 2, 0, y + s / 2);
    g2.addColorStop(0, '#ffe7a3'); g2.addColorStop(0.55, '#e7ad3c'); g2.addColorStop(1, '#b77a1e');
    c.fillStyle = g2; c.fillText(txt, 192, y);
  };
  line('Merry', 98, 72);
  line('Christmas!', 170, 72);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Knitted cream tag "For {name}" (canvas texture). */
function tagTexture(name) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = '#f6ead2';
  c.fillRect(0, 0, 256, 160);
  for (let y = 0; y < 160; y += 8) for (let x = (y / 8) % 2 ? 0 : 6; x < 256; x += 12) { // knit V texture
    c.strokeStyle = 'rgba(150,110,70,0.18)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3, y + 7); c.lineTo(x + 6, y); c.stroke();
  }
  c.setLineDash([10, 7]); c.strokeStyle = '#b8302d'; c.lineWidth = 5;
  c.strokeRect(12, 12, 232, 136);
  c.setLineDash([]);
  c.fillStyle = '#8b2523';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '600 30px Fredoka, Nunito, "Trebuchet MS", sans-serif';
  c.fillText('For', 128, 52);
  let fs = 50;
  const label = (name || 'you').slice(0, 18);
  do { c.font = `700 ${fs}px Fredoka, Nunito, "Trebuchet MS", sans-serif`; fs -= 2; } while (c.measureText(label).width > 210 && fs > 16);
  c.fillText(label, 128, 104);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const easeOutBack = (x) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export function buildGift(mat, name) {
  const group = new THREE.Group();
  group.name = 'gift';
  const body = new THREE.Mesh(merge(bodyParts()), mat);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // contents: pops up (pop-up-book style) as the lid opens
  const inside = new THREE.Mesh(merge(insideParts()), mat);
  inside.position.set(0, FLOOR, 0);
  inside.castShadow = true;
  inside.scale.set(1, 0.45, 1);
  group.add(inside);
  const insideCentre = new THREE.Object3D();
  insideCentre.position.set(0, FLOOR + 0.03, 0);
  group.add(insideCentre);

  // lid on a hinge pivot along the back top edge
  const lid = new THREE.Group();
  lid.position.set(0, TOP, -D / 2 - 0.003);
  group.add(lid);
  const lidMesh = new THREE.Mesh(merge(lidParts()), mat);
  lidMesh.castShadow = lidMesh.receiveShadow = true;
  lid.add(lidMesh);
  const lt = letteringTexture();
  const letterMat = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.7, emissive: '#ffffff', emissiveMap: lt, emissiveIntensity: 0.55 });
  const letters = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.014, D - 0.01), letterMat);
  letters.position.set(0, -0.0007, D / 2 + 0.003);
  letters.rotation.x = Math.PI / 2; // faces down while closed; reads upright from the front once the lid swings open
  lid.add(letters);

  // knitted tag "For {name}" dangling from the front-left corner
  const tt = tagTexture(name);
  const tagMat = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.95, emissive: '#ffffff', emissiveMap: tt, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.045), tagMat);
  tag.position.set(-W / 2 - 0.027, Y0 + 0.024, D / 2 + 0.012);
  tag.rotation.set(-0.1, -0.28, 0.12);
  group.add(tag);

  function setOpen(k) {
    k = Math.min(1, Math.max(0, k));
    lid.rotation.x = OPEN * k;
    const p = Math.min(1, Math.max(0, (k - 0.25) / 0.75)); // contents rise once the lid is partly open
    inside.scale.y = 0.45 + 0.55 * easeOutBack(p);
  }
  setOpen(0);
  Object.assign(group.userData, { lid, setOpen, inside: insideCentre, tag });
  return group;
}
