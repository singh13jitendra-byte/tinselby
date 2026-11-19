// HOT COCOA HUT (door 19, lakeside): Nana Marigold's cocoa hut. Six knitted townsfolk step up to the counter with an order
// card (a mug filled to a line + one or two toppings). Hold POUR and let go on the glow, then tap the toppings in order;
// the drink is served, the customer sips, hops and a steam heart floats up. Tips for accuracy and speed. ~55-65 s.
// Controls (one thumb): hold the big POUR button / Space; then the topping chips (keys 1-4). Rules + bot: sim.js.
// Scene: a fixed close shot on the counter (own aspect-aware fit, `portrait: false`), the player's own doll as barista,
// customers = one InstancedMesh (<= 4 visible), pot, 4 shelf jars, mug with live cocoa + toppings, steam, order cards in DOM.
// The lake hut's fold-down only runs while no camera shot is active, so the hut stays upright for the whole game.
// Budget: <= 24 draw calls (shadow passes counted), ~30k tris at peak, everything under one group via mg.add().
// Debug: window.__cocoa = { state, auto, bot(mode), ff(sec, step), budget(), log, result, sim, press, release, tap }.
import * as THREE from 'three';
import { P } from '../../core/yarn.js';
import { buildCharacter } from '../../core/player.js';
import { box, rbox, cyl, sph, dot, torus, tube, part, xf, merge, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';
import { ARENAS } from '../../core/layout.js';
import { isPortrait } from '../view.js';
import { createSim, createBot, TOPS, TUNE } from './sim.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const easeOutBack = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

// ------------------------------------------------------------------ layout (counter-local metres: x right, y up, z toward the camera)
const TOP = 0.232; // counter top (incl. the cloth)
const BAR = { x: 0, z: -0.24 }; // barista behind the counter (x moves with the layout)
const MS = 1.2; // the mug is drawn this much bigger than the dolls' scale strictly allows: it is the hero prop
const SHELF_Y = 0.515;
const MUG_H = 0.09, MUG_RT = 0.05, MUG_RB = 0.044, FILL_BASE = 0.008, FILL_H = 0.078;
const POT_SPOUT = 0.14; // spout tip: pot z + this (the mug stands under it)
const JAR_R = 0.05, JAR_H = 0.12;
// two arrangements of the same props (portrait is a narrow column: customer front-left, mug mid, jars on the right)
const LAY = {
  land: { pot: [-0.34, -0.02], bar: [-0.08, -0.24], jars: [[0.12, TOP, 0.03], [0.27, TOP, 0.03], [0.42, TOP, 0.03], [0.57, TOP, 0.03]], pitch: 25, yaw: 0.27, top: 0.12, bot: 0.17, botPhone: 0.22, side: 0.04, wide: true },
  port: { pot: [-0.17, -0.07], bar: [0.1, -0.24], jars: [[-0.21, SHELF_Y, -0.33], [-0.07, SHELF_Y, -0.33], [0.07, SHELF_Y, -0.33], [0.21, SHELF_Y, -0.33]], pitch: 28, yaw: 0.22, top: 0.17, bot: 0.25, botPhone: 0.25, side: 0.05, wide: false },
};
const A0 = ARENAS.cocoa || { x: 12.8, z: -4.45, heading: 0, cam: { x: 13.35, y: 1.05, z: -3.35 }, target: { x: 12.8, y: 0.38, z: -4.5 }, queue: [[12.35, -3.95], [11.9, -3.7], [11.45, -3.5], [11.0, -3.3]] };
const queueLocal = (A) => (A.queue || A0.queue).map(([x, z]) => [x - A.x, z - A.z]);
const TINTS = ['#ffffff', '#ffd2c8', '#cfe3ff', '#d9f5c8', '#ffe7a6', '#ecd2ff'];
const CHEER = '#ff8fa8';
const TOP_COL = ['#fffaf0', '#fffaf0', '#8a4f2c', '#d8453c'];
const CLOSE_POST = { bloom: 0.42, glow: 0.6, threshold: 0.35, band: 0.3, falloff: 0.3 };

// ------------------------------------------------------------------ icons (SVG only)
const ICON = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M9 14h26v17c0 7-5 11-13 11S9 38 9 31z" fill="#fff4e2" stroke="#3a2a24" stroke-width="2.4" stroke-linejoin="round"/><path d="M11 18h22v13c0 5-4 8-11 8s-11-3-11-8z" fill="#7a3f2a"/><path d="M35 18h3a5 5 0 0 1 0 11h-3" fill="none" stroke="#3a2a24" stroke-width="2.4"/><path d="M17 10c-2-3 2-4 0-7M24 10c-2-3 2-4 0-7M31 10c-2-3 2-4 0-7" fill="none" stroke="#e8d9bd" stroke-width="2.2" stroke-linecap="round"/></svg>';
const TOP_SVG = [
  '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="19" width="15" height="15" rx="5" fill="#fffaf0" stroke="#bda98b" stroke-width="2" transform="rotate(-10 12 26)"/><rect x="20" y="15" width="15" height="15" rx="5" fill="#ffeef2" stroke="#d09aa8" stroke-width="2" transform="rotate(12 27 22)"/><rect x="12" y="5" width="15" height="15" rx="5" fill="#fffaf0" stroke="#bda98b" stroke-width="2"/></svg>',
  '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 33h26c3 0 3-6 0-6H7c-3 0-3 6 0 6z" fill="#fffaf0" stroke="#bda98b" stroke-width="2"/><path d="M10 27c-2-6 3-8 10-8s12 2 10 8z" fill="#fffaf0" stroke="#bda98b" stroke-width="2"/><path d="M13 19c-1-5 3-7 7-7s8 2 7 7z" fill="#fffaf0" stroke="#bda98b" stroke-width="2"/><path d="M20 12c-3-3 0-7 3-9 0 4 3 6-3 9z" fill="#fffaf0" stroke="#bda98b" stroke-width="2"/></svg>',
  '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="21" width="30" height="8" rx="4" fill="#b06f40" stroke="#6b3d22" stroke-width="2" transform="rotate(-24 18 25)"/><rect x="8" y="12" width="30" height="8" rx="4" fill="#9a5a33" stroke="#6b3d22" stroke-width="2" transform="rotate(14 23 16)"/><circle cx="12" cy="33" r="1.8" fill="#8a4f2c"/><circle cx="19" cy="35" r="1.8" fill="#8a4f2c"/><circle cx="27" cy="34" r="1.8" fill="#8a4f2c"/><circle cx="32" cy="31" r="1.8" fill="#8a4f2c"/></svg>',
  '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 36V15a7.5 7.5 0 0 1 15 0" fill="none" stroke="#6e1a18" stroke-width="9.5" stroke-linecap="round"/><path d="M13 36V15a7.5 7.5 0 0 1 15 0" fill="none" stroke="#fffaf0" stroke-width="7" stroke-linecap="round"/><path d="M13 36V15a7.5 7.5 0 0 1 15 0" fill="none" stroke="#c4362f" stroke-width="7" stroke-dasharray="4 5.5"/></svg>',
];
const TOP_BG = ['#f7d9e2', '#dce9f7', '#ecc9a2', '#f4c6c0'];
function mugSvg(c) {
  const y = 37 - c * 26;
  return `<svg viewBox="0 0 46 46" aria-hidden="true"><rect x="9" y="${y}" width="20" height="${37 - y}" rx="2" fill="#8a4a2a"/><path d="M7 8h24v22c0 6-4 10-12 10S7 36 7 30z" fill="none" stroke="#3a2a24" stroke-width="2.6" stroke-linejoin="round"/><path d="M31 14h3a5 5 0 0 1 0 11h-3" fill="none" stroke="#3a2a24" stroke-width="2.6"/><path d="M8.5 ${y}h21" stroke="#ffd24a" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 3"/></svg>`;
}

// ------------------------------------------------------------------ geometry
/** Open cylinder wall facing outward (wall) or inward (flip). */
function wall(rt, rb, h, seg, c, flip = false) {
  const g = part(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), c, KNIT, [TAU * Math.max(rt, rb) / 0.05, h / 0.05]);
  if (flip) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let t = 0; t < p.count; t += 3) {
      for (const a of [p, n, uv, g.attributes.color, g.attributes.aMat]) {
        const s = a.itemSize;
        for (let k = 0; k < s; k++) { const v1 = a.array[(t + 1) * s + k]; a.array[(t + 1) * s + k] = a.array[(t + 2) * s + k]; a.array[(t + 2) * s + k] = v1; }
      }
    }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return g;
}
function setGeo() {
  const g = [];
  // counter: knitted wooden body, cream top plank, green cloth with a stitched border, red front apron with bunting dots
  g.push(xf(rbox(1.24, 0.2, 0.46, 0.02, P.wood, KNIT), [0, 0.1, 0.03]));
  g.push(xf(rbox(1.32, 0.03, 0.52, 0.015, '#d9b98a', FELT), [0, 0.205, 0.03]));
  g.push(xf(rbox(1.14, 0.012, 0.42, 0.005, '#2f6446', FELT, 1), [0, 0.226, 0.03]));
  for (const sx of [-1, 1]) g.push(xf(box(0.022, 0.014, 0.42, P.cream, KNIT), [sx * 0.55, 0.229, 0.03]));
  g.push(xf(box(1.14, 0.014, 0.022, P.cream, KNIT), [0, 0.229, 0.231]));
  g.push(xf(box(1.14, 0.014, 0.022, P.cream, KNIT), [0, 0.229, -0.171]));
  g.push(xf(rbox(1.2, 0.14, 0.02, 0.008, P.red, KNIT, 1), [0, 0.115, 0.268]));
  g.push(xf(box(1.2, 0.022, 0.024, P.cream, KNIT), [0, 0.185, 0.272]));
  for (let i = 0; i < 12; i++) g.push(xf(dot(0.017, P.cream, FELT), [-0.55 + i * 0.1, 0.105, 0.282]));
  // warm lantern + tip jar on the right end of the counter
  g.push(xf(cyl(0.034, 0.034, 0.085, 8, '#ffb55a', GLOW), [-0.56, TOP + 0.05, -0.08]));
  g.push(xf(cyl(0.04, 0.04, 0.014, 8, P.woodDark, KNIT), [-0.56, TOP + 0.007, -0.08]));
  g.push(xf(cyl(0.04, 0.04, 0.014, 8, P.woodDark, KNIT), [-0.56, TOP + 0.102, -0.08]));
  g.push(xf(cyl(0.035, 0.032, 0.07, 10, '#f6efe4', FELT), [-0.55, TOP + 0.035, 0.14]));
  for (let i = 0; i < 3; i++) g.push(xf(dot(0.013, P.gold, GLOSS), [-0.55 + (i - 1) * 0.016, TOP + 0.076, 0.14 + (i % 2) * 0.01]));
  // shelf decor out at the ends (the portrait jars stand in the middle)
  for (const x of [-0.4, 0.4]) { g.push(xf(cyl(0.03, 0.027, 0.05, 10, P.cream, KNIT), [x, SHELF_Y - 0.0 + 0.025, -0.33])); g.push(xf(torus(0.03, 0.005, P.red, KNIT, TAU, 12, 4), [x, SHELF_Y + 0.045, -0.33], [Math.PI / 2, 0, 0])); }
  g.push(xf(cyl(0.016, 0.016, 0.05, 8, '#ffb55a', GLOW), [0.33, SHELF_Y + 0.03, -0.33]));
  // shelf on the hut wall with warm bulbs, hung from the awning
  g.push(xf(rbox(0.96, 0.03, 0.12, 0.01, '#c79a63', FELT), [0, 0.5, -0.33]));
  for (const sx of [-1, 1]) g.push(xf(box(0.03, 0.08, 0.1, P.woodDark, KNIT), [sx * 0.42, 0.455, -0.335]));
  const bulbs = 9;
  g.push(tube([[-0.5, 0.8, -0.28], [0, 0.72, -0.28], [0.5, 0.8, -0.28]], 0.005, P.ink, KNIT, 18, 4));
  for (let i = 0; i < bulbs; i++) {
    const t = i / (bulbs - 1), x = -0.5 + t * 1, y = 0.8 - 0.08 * Math.sin(t * Math.PI);
    g.push(xf(sph(0.016, i % 2 ? '#e6b36c' : '#d08a3e', GLOW, 6, 4), [x, y - 0.012, -0.28]));
  }
  return merge(g);
}
function potGeo() {
  const g = [];
  g.push(xf(cyl(0.062, 0.074, 0.15, 14, P.red, KNIT), [0, 0.075, 0]));
  g.push(xf(cyl(0.076, 0.076, 0.016, 14, P.cream, KNIT), [0, 0.03, 0]));
  g.push(xf(cyl(0.066, 0.066, 0.012, 14, P.cream, KNIT), [0, 0.125, 0]));
  g.push(xf(cyl(0.052, 0.062, 0.022, 14, P.creamDark, FELT), [0, 0.16, 0]));
  g.push(xf(dot(0.017, P.gold, GLOSS), [0, 0.18, 0]));
  g.push(xf(sph(0.022, '#ffb55a', GLOW, 8, 6), [0, 0.07, 0.07], null, [1.1, 1.3, 0.4])); // ember window
  g.push(xf(torus(0.04, 0.008, P.woodDark, KNIT, Math.PI, 12, 5), [-0.07, 0.1, 0], [0, 0, Math.PI / 2 + 0.2])); // handle
  g.push(tube([[0, 0.115, 0.05], [0, 0.135, 0.1], [0, 0.13, POT_SPOUT - 0.01]], 0.011, P.red, KNIT, 8, 6));
  g.push(xf(cyl(0.013, 0.01, 0.035, 8, P.creamDark, KNIT), [0, 0.128, POT_SPOUT]));
  return merge(g);
}
function jarGeo(k) {
  const g = [];
  const body = ['#f6efe4', '#fbf7ee', '#a0613a', '#f4ecdc'][k];
  const lid = ['#e58fa0', '#6fa0d4', '#e3aa3a', '#b8302d'][k];
  g.push(xf(cyl(JAR_R, JAR_R - 0.004, JAR_H, 12, body, FELT), [0, JAR_H / 2, 0]));
  g.push(xf(torus(JAR_R + 0.001, 0.007, lid, KNIT, TAU, 14, 5), [0, JAR_H * 0.78, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(dot(0.02, lid, GLOSS), [0, JAR_H * 0.42, JAR_R - 0.002], null, [1, 1, 0.5])); // label dot
  if (k === 0) { // marshmallows heaped out of the top
    for (const [x, z, r] of [[-0.02, 0.01, 0], [0.022, -0.012, 0.4], [0, -0.022, 0.2], [0.004, 0.02, 0.8]]) g.push(xf(rbox(0.032, 0.026, 0.032, 0.009, '#fffaf0', FELT, 1), [x, JAR_H + 0.008, z], [0.2, r, 0.1]));
  } else if (k === 1) { // whipped-cream swirl
    g.push(xf(sph(0.034, '#fffaf0', FELT, 10, 6), [0, JAR_H + 0.002, 0], null, [1, 0.6, 1]));
    g.push(xf(sph(0.022, '#fffaf0', FELT, 8, 5), [0, JAR_H + 0.024, 0], null, [1, 0.7, 1]));
    g.push(xf(sph(0.012, '#fffaf0', FELT, 6, 4), [0, JAR_H + 0.04, 0]));
  } else if (k === 2) { // shaker lid
    g.push(xf(cyl(JAR_R - 0.006, JAR_R - 0.002, 0.026, 12, lid, KNIT), [0, JAR_H + 0.011, 0]));
    for (const [x, z] of [[-0.016, 0], [0.016, 0.004], [0, -0.016]]) g.push(xf(dot(0.005, '#6b3d22', FELT), [x, JAR_H + 0.025, z]));
  } else { // candy canes stuck in the jar
    [[-0.022, 0.2], [0.012, -0.15], [0.03, 0.35]].forEach(([x, rz], i) => {
      g.push(xf(cyl(0.006, 0.006, 0.09, 6, '#fffaf0', KNIT), [x, JAR_H + 0.035, (i - 1) * 0.012], [0, 0, rz]));
      g.push(xf(cyl(0.0068, 0.0068, 0.014, 6, '#c4362f', KNIT), [x - Math.sin(rz) * 0.01, JAR_H + 0.03, (i - 1) * 0.012], [0, 0, rz]));
      g.push(xf(torus(0.014, 0.006, '#c4362f', KNIT, Math.PI, 8, 5), [x - Math.sin(rz) * 0.044 - 0.014 * Math.cos(rz), JAR_H + 0.035 + Math.cos(rz) * 0.044, (i - 1) * 0.012], [0, 0, rz]));
    });
  }
  return merge(g);
}
function mugGeo() {
  const g = [];
  g.push(wall(MUG_RT, MUG_RB, MUG_H, 14, P.cream));
  g.push(wall(MUG_RT - 0.004, MUG_RB - 0.004, MUG_H, 14, '#d9c6a3', true));
  g.push(xf(cyl(MUG_RB, MUG_RB, 0.008, 14, P.cream, KNIT), [0, 0.004, 0]));
  g.push(xf(torus(MUG_RT, 0.006, P.red, KNIT, TAU, 16, 5), [0, MUG_H - 0.004, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(torus(MUG_RB + 0.003, 0.007, P.red, KNIT, TAU, 16, 5), [0, 0.016, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(torus(0.027, 0.0075, P.cream, KNIT, Math.PI * 1.2, 10, 5), [MUG_RT + 0.012, MUG_H * 0.5, 0], [0, 0, -Math.PI * 0.6]));
  return merge(g);
}
function toppingGeo(k) {
  const g = [];
  if (k === 0) {
    for (const [x, z, r] of [[-0.02, 0.006, 0.3], [0.018, -0.012, 0.9], [0.002, 0.022, 0.1]]) g.push(xf(rbox(0.03, 0.024, 0.03, 0.008, '#fffaf0', FELT, 1), [x, 0.011, z], [0.1, r, 0.15]));
    g.push(xf(dot(0.007, '#ffb3c4', FELT), [0.018, 0.026, -0.012]));
  } else if (k === 1) {
    g.push(xf(sph(0.03, '#fffaf0', FELT, 10, 6), [0, 0.006, 0], null, [1, 0.62, 1]));
    g.push(xf(sph(0.021, '#fffaf0', FELT, 8, 5), [0, 0.024, 0], null, [1, 0.7, 1]));
    g.push(xf(sph(0.012, '#fffaf0', FELT, 6, 4), [0, 0.04, 0]));
    g.push(xf(dot(0.007, '#c4362f', FELT), [0.004, 0.054, 0]));
  } else if (k === 2) {
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.012 + (i % 3) * 0.011; g.push(xf(dot(0.0045, i % 2 ? '#8a4f2c' : '#6b3d22', FELT), [Math.cos(a) * r, 0.002, Math.sin(a) * r], null, [1, 0.4, 1])); }
    g.push(xf(cyl(0.0055, 0.0055, 0.1, 6, '#9a5a33', KNIT), [0.032, 0.045, 0.0], [0, 0, 0.32]));
  } else {
    g.push(xf(cyl(0.0055, 0.0055, 0.085, 6, '#fffaf0', KNIT), [-0.03, 0.04, 0.004], [0, 0, -0.3]));
    for (const t of [0.01, 0.035, 0.06]) g.push(xf(cyl(0.0062, 0.0062, 0.013, 6, '#c4362f', KNIT), [-0.03 + Math.sin(0.3) * (0.04 - t), 0.002 + t + 0.0, 0.004], [0, 0, -0.3]));
    g.push(xf(torus(0.014, 0.0055, '#c4362f', KNIT, Math.PI, 8, 5), [-0.0215 + 0.0, 0.1, 0.004], [0, 0, -0.3 + 0.2]));
  }
  return merge(g);
}
/** A knitted customer baked into one geometry (arms resting, hands a little forward). */
function customerGeo(mat) {
  const ch = buildCharacter(mat, { coat: 'cream', hat: 'bobble', scarf: 'green', hair: 'none', skin: 'light', outfit: 'coat' });
  ch.arms[0].rotation.x = ch.arms[1].rotation.x = -0.4;
  ch.group.updateMatrixWorld(true);
  const geos = [], orig = new Set();
  ch.group.traverse((o) => { if (o.isMesh) { orig.add(o.geometry); geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); } });
  for (const g of orig) g.dispose();
  return merge(geos);
}

const CSS = `
.cc-root{position:absolute;inset:0;pointer-events:none;font-family:var(--font,system-ui);overflow:hidden}
.cc-bubble{position:absolute;left:0;top:0;display:flex;align-items:center;gap:7px;padding:7px 11px 7px 8px;border-radius:18px;background:#fbf1dc;border:3px dashed rgba(139,90,58,.6);box-shadow:0 5px 0 rgba(90,50,30,.32),0 10px 20px rgba(0,0,0,.2);opacity:0;will-change:transform;transition:opacity .18s;white-space:nowrap}
.cc-bubble.on{opacity:1}.cc-bubble:after{content:"";position:absolute;left:50%;bottom:-9px;width:14px;height:14px;background:#fbf1dc;border-right:3px dashed rgba(139,90,58,.6);border-bottom:3px dashed rgba(139,90,58,.6);transform:translateX(-50%) rotate(45deg)}
.cc-bubble.pop{animation:ccPop .45s cubic-bezier(.2,1.6,.4,1) both}
@keyframes ccPop{0%{scale:.4}100%{scale:1}}
.cc-mug{width:36px;height:40px}.cc-mug svg{width:100%;height:100%;display:block}
.cc-tops{display:flex;gap:5px}
.cc-ti{position:relative;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid rgba(139,90,58,.4)}
.cc-ti svg{width:26px;height:26px}
.cc-ti.done{opacity:.45}.cc-ti.done:after{content:"";position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Cpath d='M9 19l6 6 12-14' fill='none' stroke='%232f7a46' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
.cc-ti.next{border-color:#e3aa3a;box-shadow:0 0 0 3px rgba(227,170,58,.45);animation:ccNext .9s ease-in-out infinite}
@keyframes ccNext{50%{box-shadow:0 0 0 6px rgba(227,170,58,.15)}}
.cc-tip{font:800 20px/1 var(--font,system-ui);color:#6e3a1c;padding:0 6px}
.cc-tip small{font:700 11px/1 var(--font,system-ui);letter-spacing:.06em;margin-left:4px;color:#8a5a3a}
.cc-ctl{position:absolute;left:0;right:0;bottom:calc(14px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
.cc-gauge{display:none;flex-direction:column;align-items:center;gap:5px;pointer-events:none}
.cc-lab{font:700 12px/1 var(--font,system-ui);letter-spacing:.1em;text-transform:uppercase;color:#fff;text-shadow:0 2px 0 rgba(60,30,20,.8)}
.cc-track{position:relative;width:min(78vw,330px);height:30px;border-radius:15px;background:#4a2c24;border:3px solid #f1e3c7;box-shadow:0 4px 0 rgba(60,30,20,.45);overflow:hidden}
.cc-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#8a4a2a,#c47a44)}
.cc-band{position:absolute;top:0;bottom:0;background:rgba(255,214,90,.55);border-left:3px solid #ffd24a;border-right:3px solid #ffd24a;box-shadow:0 0 14px rgba(255,214,90,.9)}
.cc-line{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff}
.cc-brim{position:absolute;right:0;top:0;bottom:0;width:7px;background:repeating-linear-gradient(135deg,#c4362f 0 4px,#f1e3c7 4px 8px)}
.cc-pour{display:none;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;outline:none;cursor:pointer;min-width:min(60vw,280px);height:88px;border-radius:44px;border:4px dashed rgba(255,255,255,.75);background:#7a3f2a;color:#fff;font:800 34px/1 var(--font,system-ui);letter-spacing:.1em;box-shadow:0 7px 0 #3f1f14,0 12px 24px rgba(0,0,0,.35);flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:transform .08s,box-shadow .08s,background .15s}
.cc-pour small{font:600 12px/1 var(--font,system-ui);letter-spacing:.14em;opacity:.8;text-transform:uppercase}
.cc-pour.down{transform:translateY(5px);box-shadow:0 2px 0 #3f1f14;background:#92503a}
.cc-pour.hint{animation:ccHint 1s ease-in-out infinite}
@keyframes ccHint{50%{background:#a85c40}}
.cc-chips{display:none;gap:9px;pointer-events:none}
.cc-chip{position:relative;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;outline:none;cursor:pointer;width:min(21vw,100px);height:86px;border-radius:22px;border:3px dashed rgba(255,255,255,.8);color:#4a2c24;font:700 11px/1.1 var(--font,system-ui);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;box-shadow:0 5px 0 rgba(60,30,20,.45),0 9px 18px rgba(0,0,0,.28);transition:transform .07s,box-shadow .07s}
.cc-chip svg{width:42px;height:42px}
.cc-chip b{position:absolute;top:4px;left:9px;font:800 12px/1 var(--font,system-ui);opacity:.65}
.cc-chip.down{transform:translateY(4px);box-shadow:0 1px 0 rgba(60,30,20,.45)}
.cc-ctl[data-mode=pour] .cc-gauge{display:flex}.cc-ctl[data-mode=pour] .cc-pour{display:flex}
.cc-ctl[data-mode=top] .cc-chips{display:flex}
.cc-fb{position:absolute;left:50%;top:24%;transform:translateX(-50%);font:800 clamp(26px,5.6vw,46px)/1 var(--font,system-ui);color:#fff;white-space:nowrap;text-shadow:0 3px 0 rgba(60,20,18,.85),0 0 18px rgba(0,0,0,.35);animation:ccFb 1.2s ease-out both;text-align:center}
.cc-fb.great{color:#ffd45a}.cc-fb.ok{color:#bfe8b0}.cc-fb.bad{color:#ff9d8a}
.cc-fb small{display:block;font:700 clamp(13px,2.4vw,18px)/1.3 var(--font,system-ui);margin-top:4px;color:#fff}
@keyframes ccFb{0%{opacity:0;transform:translateX(-50%) translateY(14px) scale(.7)}15%{opacity:1;transform:translateX(-50%) scale(1.12)}30%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-26px)}}
@media (orientation:portrait){.cc-fb{top:21%}}
@media (orientation:landscape) and (max-height:520px){
 .cc-ctl{flex-direction:row;align-items:flex-end;justify-content:flex-end;gap:18px;padding-right:calc(18px + env(safe-area-inset-right,0px));box-sizing:border-box;bottom:calc(10px + env(safe-area-inset-bottom,0px))}
 .cc-gauge{order:0;margin-bottom:26px}.cc-track{width:min(44vw,360px)}
 .cc-pour{order:1;min-width:0;width:104px;height:104px;border-radius:50%;font-size:26px}
 .cc-chip{height:70px;width:min(15vw,104px)}.cc-chip svg{width:32px;height:32px}
}
`;

// ------------------------------------------------------------------ the game
export default {
  id: 'cocoa',
  title: 'Hot Cocoa Hut',
  district: 'lakeside',
  icon: ICON,
  intro: "Help Nana Marigold serve six warm drinks! Hold POUR and let go on the glowing line, then tap the toppings on the order card.",

  async start(ctx, mg) {
    const { engine, cam, uiRoot, game } = ctx;
    const params = new URLSearchParams(location.search);
    const audio = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* audio is optional */ } };
    const A = ARENAS.cocoa || A0;
    const heading = A.heading ?? 0;
    const gy = (() => { try { return ctx.colliders?.heightAt?.(A.x, A.z) || 0; } catch (e) { return 0; } })();
    const QL = queueLocal(A);
    mg.setPlayerVisible(false);

    const seed = params.has('seed') ? +params.get('seed') || 1 : (Math.random() * 1e9) | 0;
    const S = createSim({ seed });
    const bot = createBot('good', seed);
    const dbg = (window.__cocoa = {
      auto: params.has('mgauto'), mode: 'good', log: [], result: null, sim: S, seed,
      bot(mode = 'good') { dbg.auto = true; dbg.mode = mode; Object.assign(bot, createBot(mode, seed)); return dbg; },
      press: () => S.press(), release: () => S.release(), tap: (k) => S.tap(k),
      get state() { return { started, phase: S.phase, i: S.i, level: +S.level.toFixed(3), pouring: S.pouring, score: S.score, correct: S.correct, wrong: S.wrong, t: +S.t.toFixed(2), finished: S.finished, results: S.results.slice(), orders: S.orders.map((o) => ({ c: o.c, tops: o.tops.slice() })) }; },
    });

    // ---------------------------------------------------------------- scene
    const geos = [];
    const own = (g) => { geos.push(g); return g; };
    const group = mg.add(new THREE.Group());
    group.name = 'cocoa';
    group.position.set(A.x, gy, A.z);
    group.rotation.y = heading;
    const meshes = [];
    const mk = (geo, parent = group, { cast = false, vis = true } = {}) => {
      const m = new THREE.Mesh(own(geo), engine.mat);
      m.castShadow = cast; m.receiveShadow = cast; m.visible = vis; m.frustumCulled = false;
      parent.add(m); meshes.push(m);
      return m;
    };
    mk(setGeo(), group, { cast: true });
    const potM = mk(potGeo(), group, { cast: true });
    const jarM = [0, 1, 2, 3].map((k) => mk(jarGeo(k)));
    // mug: wall + fill + the glowing line + toppings (all in mug space, base at y 0)
    const mugG = new THREE.Group(); group.add(mugG);
    mk(mugGeo(), mugG);
    const fillG = new THREE.CylinderGeometry(MUG_RT - 0.009, MUG_RB - 0.005, 1, 14);
    fillG.translate(0, 0.5, 0);
    const fillM = mk(part(fillG, '#6b3322', GLOSS), mugG, { vis: false });
    const ringM = mk(torus(MUG_RT + 0.004, 0.0034, '#ffd24a', GLOW, TAU, 24, 5), mugG, { vis: false });
    ringM.rotation.x = Math.PI / 2;
    const topG = new THREE.Group(); mugG.add(topG);
    const topM = [0, 1, 2, 3].map((k) => mk(toppingGeo(k), topG, { vis: false }));
    const streamM = mk(part(new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6), '#7a3f2a', GLOSS), group, { vis: false });
    // steam / hearts / sparkles: one instanced mesh of cotton-ball puffs
    const NP = 60;
    const puffs = new THREE.InstancedMesh(own(sph(1, '#ffffff', FELT, 6, 4)), engine.mat, NP);
    puffs.frustumCulled = false; puffs.castShadow = false; puffs.receiveShadow = false;
    puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), SC = new THREE.Vector3(), V = new V3(), V2 = new V3(), COL = new THREE.Color();
    for (let i = 0; i < NP; i++) { puffs.setMatrixAt(i, M4.makeScale(0, 0, 0)); puffs.setColorAt(i, COL.set('#ffffff')); }
    puffs.count = 0;
    group.add(puffs);

    // customers: one instanced mesh, <= 4 visible
    const NC = 4;
    const custGeo = own(customerGeo(engine.mat));
    const custIM = new THREE.InstancedMesh(custGeo, engine.mat, NC);
    custIM.frustumCulled = false; custIM.castShadow = false; custIM.receiveShadow = true;
    custIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < NC; i++) { custIM.setMatrixAt(i, M4.makeScale(0, 0, 0)); custIM.setColorAt(i, COL.set('#ffffff')); }
    custIM.count = 0;
    group.add(custIM);

    // the barista: the player's own doll (legs hide behind the counter; both arms on one shoulder pivot = 1 mesh)
    const ch = buildCharacter(engine.mat, game.state.style || {});
    for (const l of ch.legs) { l.children[0].geometry.dispose(); l.removeFromParent(); }
    {
      const src = ch.arms[0].children[0].geometry;
      const armsG = own(merge([-1, 1].map((sx) => xf(xf(src.clone(), [0, 0, 0], [0, 0, sx * 0.25]), [sx * 0.076, 0, 0]))));
      src.dispose();
      for (const a of ch.arms) a.removeFromParent();
      var armPivot = new THREE.Group();
      armPivot.position.set(0, 0.178, 0);
      const am = new THREE.Mesh(armsG, engine.mat);
      am.castShadow = false; am.frustumCulled = false;
      armPivot.add(am);
      ch.body.add(armPivot);
      meshes.push(am);
    }
    ch.group.scale.setScalar(1.12);
    ch.group.position.set(BAR.x, 0, BAR.z);
    group.add(ch.group);
    ch.group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.geometry) geos.push(o.geometry); } });

    // ---------------------------------------------------------------- DOM
    const root = document.createElement('div');
    root.className = 'cc-root';
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    uiRoot.appendChild(root);
    const coarse = matchMedia('(pointer:coarse)').matches;
    const bubble = document.createElement('div'); bubble.className = 'cc-bubble'; root.appendChild(bubble);
    const ctl = document.createElement('div'); ctl.className = 'cc-ctl'; ctl.dataset.mode = 'none'; root.appendChild(ctl);
    const gauge = document.createElement('div'); gauge.className = 'cc-gauge'; ctl.appendChild(gauge);
    gauge.innerHTML = '<div class="cc-lab">Let go in the glow</div><div class="cc-track"><div class="cc-fill"></div><div class="cc-band"></div><div class="cc-line"></div><div class="cc-brim"></div></div>';
    const gFill = gauge.querySelector('.cc-fill'), gBand = gauge.querySelector('.cc-band'), gLine = gauge.querySelector('.cc-line');
    const pourBtn = document.createElement('button'); pourBtn.className = 'cc-pour'; pourBtn.tabIndex = -1; ctl.appendChild(pourBtn);
    pourBtn.innerHTML = 'POUR' + (coarse ? '' : '<small>hold, or hold Space</small>');
    const chips = document.createElement('div'); chips.className = 'cc-chips'; ctl.appendChild(chips);
    const chipEls = TOPS.map((t, k) => {
      const b = document.createElement('button'); b.className = 'cc-chip'; b.tabIndex = -1; b.style.background = TOP_BG[k];
      b.innerHTML = (coarse ? '' : `<b>${t.key}</b>`) + TOP_SVG[k] + t.label;
      chips.appendChild(b);
      return b;
    });
    const feedback = (text, tone, sub = '') => {
      root.querySelectorAll('.cc-fb').forEach((e) => e.remove());
      const f = document.createElement('div');
      f.className = 'cc-fb ' + tone;
      f.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
      root.appendChild(f);
      setTimeout(() => f.remove(), 1300);
    };
    const setMode = (m) => { ctl.dataset.mode = m; };

    // ---------------------------------------------------------------- layout / camera fit
    let lay = isPortrait() ? LAY.port : LAY.land;
    let portrait = isPortrait();
    let slotQ = [], spawnQ = [0, 0], mugXZ = [0, 0], potXZ = [0, 0];
    const jarXZ = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const applyLayout = () => {
      portrait = isPortrait();
      lay = portrait ? LAY.port : LAY.land;
      slotQ = portrait ? [[-0.22, 0.5], [-0.6, 0.64], [-0.98, 0.78]] : [QL[0], QL[1], QL[2]];
      spawnQ = portrait ? [-1.35, 0.92] : QL[3] || [-1.8, 1.15];
      potXZ = lay.pot;
      mugXZ = [lay.pot[0], lay.pot[1] + POT_SPOUT];
      potM.position.set(potXZ[0], TOP, potXZ[1]);
      mugG.position.set(mugXZ[0], TOP, mugXZ[1]);
      lay.jars.forEach((j, k) => { jarXZ[k] = j; jarM[k].position.set(j[0], j[1], j[2]); });
      BAR.x = lay.bar[0]; BAR.z = lay.bar[1];
      ch.group.position.set(BAR.x, 0, BAR.z);
      if (mugState.mode === 'rest') mugG.position.set(mugXZ[0], TOP, mugXZ[1]);
      fit.key = '';
    };
    const fit = { key: '', D: 2, cx: 0, cy: 0, basis: null, L: new V3(0, 0.3, 0.05) };
    const phoneLand = () => !portrait && innerHeight <= 520;
    const fitPoints = () => {
      const pts = [], add = (x, y, z) => pts.push(new V3(x, y, z));
      const [qx, qz] = slotQ[0];
      add(qx, 0.0, qz); add(qx - 0.09, 0.5, qz); add(qx + 0.09, 0.5, qz); add(qx - 0.1, 0.62, qz); add(qx + 0.1, 0.62, qz);
      add(BAR.x, 0.55, BAR.z); add(BAR.x - 0.09, 0.3, BAR.z); add(BAR.x + 0.09, 0.3, BAR.z);
      add(potXZ[0] - 0.08, TOP, potXZ[1] + 0.07); add(potXZ[0] + 0.08, TOP + 0.19, potXZ[1] - 0.07);
      for (const [x, y, z] of jarXZ) { add(x - JAR_R, y, z + JAR_R); add(x + JAR_R, y + JAR_H + 0.06, z - JAR_R); }
      if (lay.wide) { add(-0.45, TOP, 0.28); add(0.5, TOP, 0.28); }
      return pts;
    };
    const solveFit = () => {
      const c = engine.camera, asp = Math.max(0.2, c.aspect);
      const key = `${asp.toFixed(3)}|${c.fov.toFixed(2)}|${portrait ? 1 : 0}|${phoneLand() ? 1 : 0}`;
      if (fit.key === key) return fit;
      fit.key = key;
      const yaw = lay.yaw, pitch = lay.pitch * Math.PI / 180, cp = Math.cos(pitch);
      const d = new V3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      const f = d.clone().negate();
      const r = new V3(-f.z, 0, f.x).normalize();
      const u = new V3().crossVectors(r, f);
      fit.basis = { d, f, r, u };
      const th = Math.tan((c.fov * Math.PI) / 360), tx = th * asp;
      const bot = phoneLand() ? lay.botPhone : lay.bot;
      const xlo = -1 + 2 * lay.side, xhi = 1 - 2 * (phoneLand() ? 0.115 : lay.side), ylo = -1 + 2 * bot, yhi = 1 - 2 * lay.top;
      const pts = fitPoints();
      const solve = (D) => {
        let loX = -1e9, hiX = 1e9, loY = -1e9, hiY = 1e9;
        for (const p of pts) {
          V.copy(p).sub(fit.L);
          const xr = V.dot(r), yu = V.dot(u), dep = D + V.dot(f);
          if (dep < 0.25) return null;
          loX = Math.max(loX, xr - xhi * dep * tx); hiX = Math.min(hiX, xr - xlo * dep * tx);
          loY = Math.max(loY, yu - yhi * dep * th); hiY = Math.min(hiY, yu - ylo * dep * th);
        }
        return loX <= hiX && loY <= hiY ? { cx: (loX + hiX) / 2, cy: (loY + hiY) / 2 } : null;
      };
      let lo = 0.5, hi = 16;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (solve(mid)) hi = mid; else lo = mid; }
      const s = solve(hi) || { cx: 0, cy: 0 };
      fit.D = hi; fit.cx = s.cx; fit.cy = s.cy;
      return fit;
    };
    const camPose = (out) => {
      const F = solveFit(), b = F.basis;
      const sway = Math.sin(S.t * 0.6) * 0.012;
      V2.copy(F.L).addScaledVector(b.r, F.cx + sway).addScaledVector(b.u, F.cy);
      out.target.copy(V2); group.localToWorld(out.target);
      out.pos.copy(V2).addScaledVector(b.d, F.D); group.localToWorld(out.pos);
    };
    cam.setMode('close');
    cam.playShot({ name: 'cocoa', duration: 900, skippable: false, blendIn: 1.0, blendOut: 0.6, tilt: 0.55, post: CLOSE_POST, portrait: false, update(u, out) { camPose(out); } });

    // ---------------------------------------------------------------- customers
    const orders = S.orders;
    const cs = orders.map((o, i) => ({ i, look: o.look, x: 0, z: 0, yaw: 0, state: 'off', delay: 0, path: [], vis: false, hop: 0, sipT: -1, walkPh: 0, moving: false, s: 0.98 + (i % 3) * 0.03, gone: false }));
    const slotOf = (j) => j - S.i;
    function spawn(c, delay) { c.state = 'walk'; c.delay = delay; c.x = spawnQ[0]; c.z = spawnQ[1]; c.vis = false; c.yaw = Math.atan2(slotQ[0][0] - c.x, slotQ[0][1] - c.z); }
    function route(c) { // walk to the queue slot
      const s = slotOf(c.i);
      if (s < 0 || s > 2) return;
      c.state = 'walk'; c.path = [slotQ[s]];
    }
    function startArrive() {
      const i = S.i;
      if (i > 0 && cs[i - 1].state !== 'gone') { // the last customer leaves right (past the counter front)
        const p = cs[i - 1];
        p.state = 'leave'; p.sipT = -1;
        p.path = [[p.x + 0.55, p.z + 0.32], [p.x + 1.5, p.z + 0.4]];
      }
      for (let j = i; j <= Math.min(S.T.N - 1, i + 2); j++) {
        const c = cs[j];
        if (c.state === 'off') spawn(c, i === 0 ? (j - i) * 0.9 : 0);
        c.delay = Math.max(0, c.delay);
        route(c);
      }
      mugState.mode = 'rest'; mugState.t = 0; mugState.pop = 0; // a fresh mug pops in
      mugG.visible = true;
      hideToppings();
      fillM.visible = false; ringM.visible = false;
      setMode('none');
      bubble.classList.remove('on');
    }
    const CAMLOC = new V3();
    const dummy = new THREE.Object3D();
    function updateCustomers(dt) {
      let n = 0;
      CAMLOC.copy(engine.camera.position); group.worldToLocal(CAMLOC);
      for (const c of cs) {
        if (c.state === 'off' || c.state === 'gone') continue;
        if (c.delay > 0) { c.delay -= dt; if (c.delay > 0) continue; c.vis = true; }
        else c.vis = true;
        // walking along the path
        let moving = false;
        if ((c.state === 'walk' || c.state === 'leave') && c.path.length) {
          const [tx, tz] = c.path[0];
          const dx = tx - c.x, dz = tz - c.z, dist = Math.hypot(dx, dz);
          const sp = (c.state === 'leave' ? 0.95 : 1.0) * dt;
          if (dist <= sp) { c.x = tx; c.z = tz; c.path.shift(); } else { c.x += (dx / dist) * sp; c.z += (dz / dist) * sp; moving = true; c.yaw += wrap(Math.atan2(dx, dz) - c.yaw) * Math.min(1, dt * 10); }
          if (!c.path.length) { if (c.state === 'leave') { c.state = 'gone'; c.vis = false; continue; } c.state = 'wait'; }
        }
        c.moving = moving;
        if (moving) c.walkPh += dt * 9;
        let tiltX = 0, roll = 0, y = 0, sc = c.s, sq = 1;
        if (moving) { y = Math.abs(Math.sin(c.walkPh)) * 0.012; roll = Math.sin(c.walkPh) * 0.07; tiltX = 0.05; }
        else if (c.state === 'wait' || c.state === 'sip') {
          const s = slotOf(c.i);
          let fx, fz;
          if (c.state === 'sip') { fx = CAMLOC.x - c.x; fz = CAMLOC.z - c.z; }
          else if (s <= 0) { fx = mugXZ[0] - c.x; fz = mugXZ[1] - c.z; } else { fx = slotQ[s - 1][0] - c.x; fz = slotQ[s - 1][1] - c.z; }
          c.yaw += wrap(Math.atan2(fx, fz) - c.yaw) * Math.min(1, dt * 7);
          y = Math.sin(S.t * 2.2 + c.i) * 0.002;
        }
        if (c.state === 'sip' && c.sipT >= 0) {
          c.sipT += dt;
          const t = c.sipT;
          if (t > 0.7 && t < 1.35) tiltX = -0.26 * Math.sin(((t - 0.7) / 0.65) * Math.PI);
          for (const h0 of [1.45, 1.8]) if (t > h0 && t < h0 + 0.3) { const k = (t - h0) / 0.3; y += Math.sin(k * Math.PI) * 0.06; sq = 1 + Math.sin(k * Math.PI * 2) * 0.03; }
        }
        // leaving customers shrink away once out in the snow
        if (c.state === 'leave' && c.x > slotQ[0][0] + 0.9) sc *= clamp(1 - (c.x - slotQ[0][0] - 0.9) / 0.5, 0, 1);
        dummy.position.set(c.x, y, c.z);
        dummy.rotation.set(tiltX, c.yaw, roll, 'YXZ');
        dummy.scale.set(sc / Math.sqrt(sq), sc * sq, sc / Math.sqrt(sq));
        dummy.updateMatrix();
        if (n < NC) { custIM.setMatrixAt(n, dummy.matrix); custIM.setColorAt(n, COL.set(TINTS[c.look % TINTS.length])); n++; }
        c._n = n - 1;
      }
      custIM.count = n;
      custIM.instanceMatrix.needsUpdate = true;
      if (custIM.instanceColor) custIM.instanceColor.needsUpdate = true;
    }

    // ---------------------------------------------------------------- particles
    const pf = Array.from({ length: NP }, () => ({ c: new THREE.Color(), on: false, kind: 'rise', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 0.02, s1: 0.04, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0 }));
    function puff(kind, o) {
      let p = pf.find((q) => !q.on);
      if (!p) p = pf.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
      Object.assign(p, { on: true, kind, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 0.02, s1: 0.04, arc: 0 }, o);
      p.fx = p.x; p.fy = p.y; p.fz = p.z;
      p.c.set(o.col || '#ffffff');
      return p;
    }
    function updatePuffs(dt) {
      let n = 0;
      for (let i = 0; i < NP; i++) {
        const p = pf[i];
        if (!p.on) continue;
        p.t += dt;
        if (p.t < 0) continue;
        const k = p.t / p.life;
        if (k >= 1) { p.on = false; continue; }
        let s;
        if (p.kind === 'fly') {
          const e = k * k * (3 - 2 * k);
          p.x = lerp(p.fx, p.tx, e); p.z = lerp(p.fz, p.tz, e); p.y = lerp(p.fy, p.ty, e) + Math.sin(k * Math.PI) * p.arc;
          s = p.s0 * (k > 0.85 ? (1 - k) / 0.15 : 1);
        } else {
          if (p.kind === 'ball') p.vy -= 1.9 * dt; else { p.vx *= 1 - dt * 0.7; p.vz *= 1 - dt * 0.7; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          s = (p.s0 + (p.s1 - p.s0) * k) * Math.min(1, k * 7) * Math.min(1, (1 - k) * 3);
        }
        dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(0.0001, s)); dummy.updateMatrix();
        puffs.setMatrixAt(n, dummy.matrix);
        puffs.setColorAt(n, p.c);
        n++;
      }
      puffs.count = n;
      puffs.instanceMatrix.needsUpdate = true;
      if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
    }
    let steamT = 0;
    function steam(dt) {
      steamT -= dt;
      if (steamT > 0) return;
      steamT = 0.33;
      puff('rise', { x: potXZ[0] + (Math.random() - 0.5) * 0.02, y: TOP + 0.2, z: potXZ[1], vy: 0.1, vx: 0.01, life: 1.5, s0: 0.014, s1: 0.04, col: '#f4efe6' });
      if (mugState.mode === 'rest' && S.level > 0.15 && mugG.visible && S.phase !== 'arrive') {
        puff('rise', { x: mugXZ[0] + (Math.random() - 0.5) * 0.03, y: TOP + MS * (FILL_BASE + clamp(S.level, 0, 1) * FILL_H) + 0.02, z: mugXZ[1] + (Math.random() - 0.5) * 0.03, vy: 0.09, life: 1.3, s0: 0.012, s1: 0.034, col: '#f4efe6' });
      }
    }
    const HQ = new THREE.Quaternion(), HR = new V3(), HF = new V3();
    function hearts(c) {
      // polish: 22 small beads drawn as one stroke (was 14 big puffs that merged into a blob). The heart faces the camera
      // as it is right now (so it also reads after a rotate), floats above the customer's hat and a little towards the
      // camera so the doll never hides its tip; each bead's start height makes up for its delayed start, so the outline
      // stays a heart while the whole shape drifts up.
      group.getWorldQuaternion(HQ).invert();
      HR.setFromMatrixColumn(engine.camera.matrixWorld, 0).applyQuaternion(HQ); HR.y = 0;
      if (HR.lengthSq() < 1e-6) HR.set(1, 0, 0);
      HR.normalize();
      HF.copy(engine.camera.position).sub(group.getWorldPosition(V2)).applyQuaternion(HQ).setY(0).sub(V2.set(c.x, 0, c.z)).normalize();
      const cx = c.x + HF.x * 0.09, cz = c.z + HF.z * 0.09, cy = 0.63, HN = 22, K = 0.0052, VY = 0.035, GAP = 0.022;
      for (let i = 0; i < HN; i++) {
        const a = (i / HN) * TAU;
        const hx = 16 * Math.pow(Math.sin(a), 3), hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
        puff('rise', { x: cx + HR.x * hx * K, y: cy + hy * K + VY * i * GAP, z: cz + HR.z * hx * K, vy: VY, life: 1.9, t: -i * GAP, s0: 0.0125, s1: 0.0145, col: CHEER });
      }
    }
    function sparkle(x, y, z, col, n = 9, sp = 0.28) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.random(), up = 0.18 + Math.random() * 0.25;
        puff('ball', { x, y, z, vx: Math.cos(a) * sp * (0.5 + Math.random() * 0.6), vz: Math.sin(a) * sp * (0.5 + Math.random() * 0.6), vy: up, life: 0.7 + Math.random() * 0.3, s0: 0.012, s1: 0.008, col });
      }
    }

    // ---------------------------------------------------------------- mug / pour / toppings / barista
    const mugState = { mode: 'rest', t: 0, pop: 0, from: new V3(), to: new V3(), shake: 0 };
    const topPop = [1, 1, 1, 1];
    function hideToppings() { topM.forEach((m) => { m.visible = false; }); topPop.fill(1); }
    const jarPulse = [0, 0, 0, 0];
    let reachT = 0, reachK = 0, pourPose = 0, servePose = 0;
    const bar = { yaw: 0, lean: 0, arms: -0.5 };
    function setFill() {
      const l = clamp(S.phase === 'pour' ? S.level : S.phase === 'arrive' ? 0 : (S.pourLevel ?? 0), 0, 1);
      fillM.visible = l > 0.004;
      fillM.scale.set(1, Math.max(0.001, l * FILL_H), 1);
      fillM.position.y = FILL_BASE;
      topG.position.y = FILL_BASE + l * FILL_H;
      ringM.position.y = FILL_BASE + S.order.c * FILL_H;
    }
    function updateMug(dt) {
      mugState.t += dt;
      if (mugState.mode === 'rest') {
        mugG.position.set(mugXZ[0], TOP, mugXZ[1]);
        mugG.scale.setScalar(MS * Math.max(0.01, easeOutBack(clamp(mugState.t / 0.5 - 0.6, 0, 1))));
        if (mugState.shake > 0) { mugState.shake -= dt; mugG.position.x += Math.sin(mugState.shake * 60) * 0.006 * Math.min(1, mugState.shake * 5); }
      } else if (mugState.mode === 'fly') {
        const k = clamp(mugState.t / 0.6, 0, 1), e = k * k * (3 - 2 * k);
        mugG.position.lerpVectors(mugState.from, mugState.to, e);
        mugG.position.y += Math.sin(k * Math.PI) * 0.08;
        mugG.scale.setScalar(MS);
        if (mugState.t > 1.9) { mugG.scale.setScalar(MS * Math.max(0.01, 1 - (mugState.t - 1.9) / 0.3)); }
        if (mugState.t > 2.2) mugG.visible = false;
      }
      mugG.rotation.y = 0;
      // sip tilt of the held mug
      if (mugState.mode === 'fly' && mugState.t > 1.0 && mugState.t < 1.5) mugG.rotation.x = -0.5 * Math.sin(((mugState.t - 1.0) / 0.5) * Math.PI); else mugG.rotation.x = 0;
      topM.forEach((m, k) => { if (m.visible && topPop[k] < 1) { topPop[k] = Math.min(1, topPop[k] + dt * 3.2); m.scale.setScalar(Math.max(0.02, easeOutBack(topPop[k]))); } });
      // pour stream
      const tipY = TOP + 0.11, topY = TOP + MS * (FILL_BASE + clamp(S.level, 0, 1.0) * FILL_H);
      if (S.pouring && S.phase === 'pour') {
        streamM.visible = true;
        const h = Math.max(0.01, tipY - topY);
        streamM.scale.set(1, h, 1);
        streamM.position.set(mugXZ[0], topY + h / 2, mugXZ[1]);
        if (Math.random() < dt * 10) puff('rise', { x: mugXZ[0], y: topY + 0.005, z: mugXZ[1], vy: 0.05, life: 0.5, s0: 0.008, s1: 0.016, col: '#9a5a3a' });
      } else streamM.visible = false;
      for (let k = 0; k < 4; k++) {
        jarPulse[k] = Math.max(0, jarPulse[k] - dt * 3.4);
        const p = jarPulse[k];
        jarM[k].scale.setScalar(1 + 0.18 * Math.sin(p * Math.PI));
        jarM[k].position.y = jarXZ[k][1] + 0.03 * Math.sin(p * Math.PI);
      }
    }
    function updateBarista(dt) {
      let yawT = Math.sin(S.t * 0.7) * 0.08, leanT = 0, armsT = -0.5;
      if (S.pouring && S.phase === 'pour') { yawT = clamp(Math.atan2(potXZ[0] - BAR.x, 0.32), -0.9, 0.9); leanT = 0.12; armsT = -1.15; }
      else if (reachT > 0) { reachT -= dt; const jx = jarXZ[reachK][0]; yawT = clamp(Math.atan2(jx - BAR.x, 0.4), -0.9, 0.9); armsT = -2.3; leanT = -0.05; }
      else if (mugState.mode === 'fly' && mugState.t < 0.9) { const c = cs[S.i]; yawT = clamp(Math.atan2(c.x - BAR.x, c.z - BAR.z), -0.9, 0.9); armsT = -1.2; leanT = 0.1; }
      else if (S.phase === 'serve' && S.pt > 1.2) { armsT = -2.6 + Math.sin(S.t * 14) * 0.3; yawT = 0; } // cheering for the happy customer
      const k = 1 - Math.exp(-dt * 11);
      bar.yaw += (yawT - bar.yaw) * k; bar.lean += (leanT - bar.lean) * k; bar.arms += (armsT - bar.arms) * k;
      ch.yaw.rotation.y = bar.yaw;
      ch.body.rotation.x = bar.lean;
      ch.body.scale.y = 1 + Math.sin(S.t * 2.2) * 0.012;
      armPivot.rotation.x = bar.arms;
    }

    // ---------------------------------------------------------------- bubble / gauge
    let bubbleKind = '', bubbleSig = '';
    const tipText = { el: null };
    function setBubble(kind) {
      const o = S.order;
      let sig = kind + S.i + ':' + S.correct;
      if (sig === bubbleSig) return;
      bubbleSig = sig; bubbleKind = kind;
      if (kind === 'order') {
        bubble.innerHTML = `<div class="cc-mug">${mugSvg(o.c)}</div><div class="cc-tops">${o.tops.map((k, n) => `<div class="cc-ti${n < S.correct ? ' done' : n === S.correct && S.phase === 'top' ? ' next' : ''}" style="background:${TOP_BG[k]}">${TOP_SVG[k]}</div>`).join('')}</div>`;
        bubble.classList.add('on');
        if (S.correct === 0 && S.phase === 'pour') { bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
      }
    }
    const SP = new V3();
    function placeBubble() {
      const c = cs[Math.min(S.i, cs.length - 1)];
      if (!bubble.classList.contains('on') || !c) return;
      SP.set(c.x, 0.53, c.z); group.localToWorld(SP); engine.camera.updateMatrixWorld(); SP.project(engine.camera);
      const w = innerWidth, h = innerHeight;
      const px = clamp((SP.x * 0.5 + 0.5) * w, 90, w - 90), py = clamp((-SP.y * 0.5 + 0.5) * h, h * (innerWidth > innerHeight && h <= 520 ? 0.33 : 0.2), h * 0.7);
      bubble.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-100%)`;
    }
    function setGauge() {
      const o = S.order;
      gBand.style.left = ((o.c - S.T.half) * 100).toFixed(1) + '%';
      gBand.style.width = (S.T.half * 200).toFixed(1) + '%';
      gLine.style.left = (o.c * 100).toFixed(1) + '%';
    }

    // ---------------------------------------------------------------- events
    const hudGoal = () => mg.hud.setGoal(`Order ${Math.min(S.i + 1, S.T.N)}/${S.T.N}`);
    const hudScore = () => mg.hud.setScore(S.score, 'Tips');
    function onEvent(e) {
      dbg.log.push(e.type === 'phase' ? { t: +e.t.toFixed(2), phase: e.phase, i: e.i } : { t: +e.t.toFixed(2), type: e.type });
      switch (e.type) {
        case 'phase': {
          if (e.phase === 'arrive') { hudGoal(); startArrive(); }
          else if (e.phase === 'pour') { setGauge(); setBubble('order'); setMode('pour'); ringM.visible = true; fillM.visible = false; gFill.style.width = '0%'; audio('pop'); }
          else if (e.phase === 'top') { setMode('top'); bubbleSig = ''; setBubble('order'); }
          else if (e.phase === 'end') { setMode('none'); bubble.classList.remove('on'); }
          break;
        }
        case 'pourStart': audio('pop'); break;
        case 'pourAbort': feedback('Hold a little longer', 'ok'); break;
        case 'pour': {
          ringM.visible = false;
          const { acc, hit } = e;
          audio('pop');
          if (hit) { feedback('Perfect pour!', 'great'); sparkle(mugXZ[0], TOP + 0.12, mugXZ[1], '#ffd24a'); audio('pickup'); }
          else if (acc >= 0.6) feedback('Nice pour', 'ok');
          else feedback(S.level < S.order.c ? 'A bit low' : 'A bit full', 'bad');
          break;
        }
        case 'splash': {
          ringM.visible = false;
          feedback('Splash!', 'bad', 'Too full this time');
          audio('ui');
          sparkle(mugXZ[0], TOP + MS * MUG_H, mugXZ[1], '#7a3f2a', 12, 0.4);
          mugState.shake = 0.5;
          break;
        }
        case 'top': {
          const k = e.k;
          jarPulse[k] = 1; reachT = 0.4; reachK = k;
          if (e.ok) {
            const m = topM[k]; m.visible = true; topPop[k] = 0; m.scale.setScalar(0.02);
            for (let j = 0; j < 5; j++) puff('fly', { x: jarXZ[k][0], y: jarXZ[k][1] + JAR_H + 0.04, z: jarXZ[k][2], tx: mugXZ[0], ty: TOP + MS * MUG_H + 0.03, tz: mugXZ[1], life: 0.34 + j * 0.04, t: -j * 0.04, s0: 0.011, arc: 0.12, col: TOP_COL[k] });
            audio('pickup');
            bubbleSig = ''; setBubble('order');
          } else {
            audio('ui'); mugState.shake = 0.35; feedback('Oops, not that one', 'bad');
            puff('rise', { x: jarXZ[k][0], y: jarXZ[k][1] + JAR_H + 0.05, z: jarXZ[k][2], vy: 0.1, life: 0.7, s0: 0.014, s1: 0.03, col: '#b9b2a8' });
          }
          break;
        }
        case 'serve': {
          const c = cs[e.i];
          c.state = 'sip'; c.sipT = 0; c.path = [];
          const hx = c.x + Math.sin(c.yaw) * 0.06, hz = c.z + Math.cos(c.yaw) * 0.07;
          mugState.mode = 'fly'; mugState.t = 0; mugState.from.copy(mugG.position); mugState.to.set(hx, 0.25, hz);
          setMode('none');
          hudScore();
          const word = e.splash ? 'Mopped up!' : e.pts >= 110 ? 'Perfect!' : e.pts >= 90 ? 'Delicious!' : e.pts >= 60 ? 'Lovely' : 'Thank you';
          queueTip(e, word);
          bubble.classList.remove('on');
          after(0.9, () => { hearts(c); audio(e.pts >= 90 ? 'task' : 'pop'); });
          after(0.55, () => { if (e.pts >= 90) puff('fly', { x: c.x, y: 0.36, z: c.z, tx: 0.54, ty: TOP + 0.1, tz: 0.14, life: 0.7, s0: 0.016, arc: 0.3, col: '#ffd24a' }); });
          break;
        }
        case 'cap': feedback('Last orders!', 'ok', 'Everyone gets a cup'); break;
        case 'house': {
          for (let j = e.from; j < S.T.N; j++) { const c = cs[j]; if (c.state === 'off') continue; if (c.state !== 'gone') { c.state = 'leave'; c.path = [[c.x + 0.6, c.z + 0.35], [c.x + 1.6, c.z + 0.45]]; } }
          hudScore();
          break;
        }
        case 'finish': {
          const r = S.result();
          dbg.result = r; dbg.finished = true;
          root.querySelectorAll('.cc-fb').forEach((f) => f.remove());
          bubble.classList.remove('on'); setMode('none');
          mg.finish({ score: r.score, stars: r.stars, text: endText(r) });
          break;
        }
      }
    }
    function endText(r) {
      const n = r.served;
      if (r.stars >= 3) return `${n} warm drinks served, ${r.perfect} of them perfect. Nana Marigold says it's the best cocoa in Tinselby!`;
      if (r.stars === 2) return `${n} cosy cups served with a smile. Nana Marigold is very pleased.`;
      return 'Everyone left with a warm cup. A steadier pour earns bigger tips!';
    }
    function queueTip(e, word) {
      feedback(word, e.pts >= 90 ? 'great' : 'ok', `+${e.pts} tip${e.bonus >= 12 ? ' · quick service' : ''}`);
    }
    const timers = [];
    const after = (s, fn) => timers.push({ t: S.t + s, fn });

    // ---------------------------------------------------------------- input
    let held = false;
    const down = (e) => { e.preventDefault(); e.stopPropagation(); try { pourBtn.setPointerCapture(e.pointerId); } catch (er) { /* synthetic events */ } held = true; pourBtn.classList.add('down'); S.press(); };
    const up = () => { if (!held) return; held = false; pourBtn.classList.remove('down'); S.release(); };
    pourBtn.addEventListener('pointerdown', down);
    pourBtn.addEventListener('pointerup', up);
    pourBtn.addEventListener('pointercancel', up);
    pourBtn.addEventListener('lostpointercapture', up);
    pourBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    chipEls.forEach((b, k) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); S.tap(k); });
      const off = () => b.classList.remove('down');
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    });
    const onKeyDown = (e) => {
      if (mg.finished) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && !held) { held = true; pourBtn.classList.add('down'); S.press(); } }
      else if (e.key >= '1' && e.key <= '4' && !e.repeat) { chipEls[+e.key - 1].classList.add('down'); S.tap(+e.key - 1); }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') { e.preventDefault(); up(); }
      else if (e.key >= '1' && e.key <= '4') chipEls[+e.key - 1].classList.remove('down');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', up);

    // ---------------------------------------------------------------- loop
    let started = false, hintT = 0;
    function frame(dt) {
      if (!started) return;
      if (portrait !== isPortrait()) applyLayout();
      if (dbg.auto && !S.finished) bot.act(S, dt);
      S.step(dt);
      for (const e of S.drain()) onEvent(e);
      for (let i = timers.length - 1; i >= 0; i--) if (S.t >= timers[i].t) { const f = timers.splice(i, 1)[0].fn; f(); }
      // gauge
      if (ctl.dataset.mode === 'pour') {
        gFill.style.width = (clamp(S.level, 0, 1) * 100).toFixed(1) + '%';
        hintT = S.pouring ? 0 : hintT + dt;
        pourBtn.classList.toggle('hint', hintT > 2.5 && !S.pouring);
      } else hintT = 0;
      setFill();
      updateMug(dt);
      updateBarista(dt);
      updateCustomers(dt);
      steam(dt);
      updatePuffs(dt);
      placeBubble();
    }
    mg.addUpdate((dt) => frame(Math.min(dt, 0.05)), 60);
    dbg.ff = (sec, h = 1 / 30) => { for (let i = 0, n = Math.round(sec / h); i < n && !S.finished; i++) frame(h); return dbg.state; };
    dbg.budget = () => {
      let calls = 0, tris = 0;
      group.traverseVisible((o) => {
        if (!o.isMesh) return;
        const passes = o.castShadow ? 2 : 1;
        const cnt = o.isInstancedMesh ? o.count : 1;
        calls += passes; tris += (o.geometry.attributes.position.count / 3) * passes * cnt;
      });
      return { calls, tris: Math.round(tris) };
    };

    mg.onDispose(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', up);
      root.remove();
      for (const g of new Set(geos)) g.dispose();
      puffs.dispose(); custIM.dispose();
      meshes.length = 0;
      if (window.__cocoa === dbg) delete window.__cocoa;
      const p = new V3(), t = new V3();
      camPose({ pos: p, target: t });
      cam.playShot({ name: 'cocoa-out', duration: 0.7, skippable: false, blendIn: 0.01, blendOut: 0.6, tilt: 0.55, post: CLOSE_POST, portrait: false, update(u, out) { out.pos.copy(p); out.target.copy(t); } });
    });

    // ---------------------------------------------------------------- go
    applyLayout();
    ringM.position.y = FILL_BASE + S.order.c * FILL_H;
    mugG.visible = false;
    mg.hud.setScore(0, 'Tips');
    mg.hud.setGoal(`Order 1/${S.T.N}`);
    await mg.intro();
    started = true;
    setGauge();
    // opening: the first customers walk up while the mug pops in (the sim starts in its 'arrive' phase)
    startArrive();
    for (const e of S.drain()) onEvent(e);
  },
};
