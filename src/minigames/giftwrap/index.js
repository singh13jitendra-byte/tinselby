// GIFT WRAPPING (door 12): wrap four presents with Auntie Noor at her knitted counter. One input (tap / Space / Enter /
// big DOM button; the bow uses press-and-hold). Per gift: pick the wanted paper print as it slides by, fold two flaps
// onto a glowing ghost flap, tape the seam on two glowing rings, then hold to grow the bow loop and let go on the ring.
// The finished gift flies onto a growing pile beside a little pom-pom tree. Each gift gets faster. ~60-80 s.
// Neatness = mean accuracy of 24 taps (time error to the ideal moment, so every stage is judged the same way).
// Stars by mean accuracy 0.40 / 0.65 / 0.85 (finishing always gives 1).
// Layout is aspect-aware: the camera fits a content box to the live fov/aspect (portrait is steeper, content is
// stacked in depth), the TAP button is a bottom pill in portrait/desktop and a side circle on landscape phones.
// Budget: <= 14 draw calls, ~13k tris at peak, everything under one group removed through mg.add().
// Debug: window.__giftwrap = { auto, mode, bot(mode), speed, log, state, ff(sec), budget(), result }.
import * as THREE from 'three';
import { P } from '../../core/yarn.js';
import { box, rbox, cyl, dot, torus, tube, cone, xf, merge, part, boxUV, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';
import { ARENAS } from '../../core/layout.js';
import { isPortrait } from '../view.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;
const D2R = Math.PI / 180;

// ------------------------------------------------------------------ tuning
const GIFTS = 4;
const MAT_Y = 0.802; // tablecloth top
const GW = 0.24, GH = 0.12, GD = 0.2; // gift body (x, y, z)
const STARS = [0.4, 0.65, 0.85];
const SPEED = [1, 1.14, 1.28, 1.42]; // belt speed multiplier per gift
const T_FOLD = [2.4, 2.1, 1.85, 1.65]; // full flap swing period (s)
const T_TAPE = [2.2, 1.95, 1.75, 1.55]; // dispenser glide period (s)
const T_BOW = [1.1, 1.0, 0.9, 0.8]; // seconds of holding that match the outline
const WIN_P = 0.045, WIN_Z = 0.24; // time error (s): full marks inside P, zero beyond Z (shrinks 10% per gift)
const BELT_V = 0.62, BELT_STEP = 0.5, BELT_N = 3, BELT_LEN = BELT_STEP * BELT_N;
const R_BOW = 0.11; // glowing bow outline radius
const IDLE = 9; // seconds before an idle stage resolves itself with a poor score
const PS = 0.6; // pile gift scale
const FL = GW / 2 + 0.004; // flap length
const TAPE_A = 0.135; // dispenser glide amplitude (z)
const SLOTS = [[-0.17, 0, 0.0, 0.12], [0.0, 0, 0.02, -0.16], [0.17, 0, -0.01, 0.1], [0.0, GH * PS, 0.005, 0.3]];

// layouts in counter-local metres (x right, z toward the camera); `fit` is the content box the camera frames
const LAY = {
  land: { gz: 0.04, tree: [-0.62, -0.4], pile: [-0.24, -0.3], card: [0.44, -0.3], fit: { t: [0, -0.04], halfW: 0.68, halfD: 0.44 }, pitch: 37 },
  port: { gz: 0.12, tree: [-0.27, -0.5], pile: [-0.04, -0.33], card: [0.29, -0.44], fit: { t: [0, -0.1], halfW: 0.45, halfD: 0.56 }, pitch: 38 },
};

// ------------------------------------------------------------------ paper prints (knitted pixel patterns)
const C = (() => { const m = new Map(); return (h) => { let c = m.get(h); if (!c) { c = new THREE.Color(h); m.set(h, c); } return c; }; })();
const PATS = [
  { name: 'Candy stripes', main: '#b8302d', rib: '#e3aa3a', rib2: '#b07b1c', fn: (i) => (mod(i, 4) < 2 ? '#b8302d' : '#efe1c6') },
  {
    name: 'Starry night', main: '#2c4170', rib: '#c4362f', rib2: '#8b2523',
    fn: (i, j) => {
      const ii = mod(i + (Math.floor(j / 5) % 2 ? 2 : 0), 5), jj = mod(j, 5);
      const c = ii === 2 && jj === 2, arm = (ii === 1 && jj === 2) || (ii === 3 && jj === 2) || (ii === 2 && jj === 1) || (ii === 2 && jj === 3);
      return c ? '#fff0b8' : arm ? '#e8b84a' : '#2c4170';
    },
  },
  {
    name: 'Holly berries', main: '#3d7a52', rib: '#efe1c6', rib2: '#d9c6a3',
    fn: (i, j) => { const k = mod((i >> 1) + (j >> 1), 3); return k === 0 ? '#c23a33' : k === 1 ? '#2f6446' : '#4a8250'; },
  },
];

// ------------------------------------------------------------------ geometry helpers
function paintTris(geo, fn) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const c = fn(cx, cy, cz, nor.getX(t), nor.getY(t), nor.getZ(t));
    for (let k = 0; k < 3; k++) col.setXYZ(t + k, c.r, c.g, c.b);
  }
}
/** Patterned box: cells follow the segment grid so stitches are square-ish. top/bot override the +y / -y faces. */
function patBox(w, h, d, sx, sy, sz, pat, top = null, bot = '#7a5a3a') {
  const g = part(boxUV(new THREE.BoxGeometry(w, h, d, sx, sy, sz)), '#ffffff', FELT);
  paintTris(g, (x, y, z, nx, ny, nz) => {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let i, j;
    if (ay >= ax && ay >= az) {
      if (ny < 0) return C(bot);
      if (top) return C(top);
      i = Math.floor((x + w / 2) / (w / sx)); j = Math.floor((z + d / 2) / (d / sz));
    } else if (ax >= az) { i = Math.floor((z + d / 2) / (d / sz)) + 3; j = Math.floor((y + h / 2) / (h / sy)); }
    else { i = Math.floor((x + w / 2) / (w / sx)); j = Math.floor((y + h / 2) / (h / sy)) + 5; }
    return C(pat.fn(i, j));
  });
  return g;
}
const frameGeo = (L, D, t, cx = 0) => merge([
  xf(box(L, 0.004, t, '#ffe29a', GLOW), [cx, 0, D / 2]), xf(box(L, 0.004, t, '#ffe29a', GLOW), [cx, 0, -D / 2]),
  xf(box(t, 0.004, D, '#ffe29a', GLOW), [cx - L / 2, 0, 0]), xf(box(t, 0.004, D, '#ffe29a', GLOW), [cx + L / 2, 0, 0]),
]);

function buildSet() {
  const g = [];
  const WOOD = P.wood, WOODD = P.woodDark, PLANK = '#c79a63';
  g.push(xf(rbox(2.2, 0.74, 1.08, 0.02, WOOD, KNIT), [0, 0.37, -0.04]));
  g.push(xf(rbox(2.3, 0.05, 1.14, 0.02, PLANK, FELT), [0, 0.765, -0.04]));
  g.push(xf(rbox(2.1, 0.4, 0.03, 0.012, P.red, KNIT, 1), [0, 0.52, 0.505]));
  g.push(xf(box(2.1, 0.04, 0.035, P.cream, KNIT), [0, 0.69, 0.51]));
  for (let i = 0; i < 18; i++) g.push(xf(dot(0.034, P.cream, FELT), [-1.0 + i * 0.118, 0.32, 0.52]));
  // tablecloth with a cream stitched border
  g.push(xf(rbox(1.9, 0.012, 1.0, 0.005, '#35684a', FELT, 1), [0, 0.796, -0.04]));
  for (const sx of [-1, 1]) g.push(xf(box(0.025, 0.014, 1.0, P.cream, KNIT), [sx * 0.93, 0.797, -0.04]));
  g.push(xf(box(1.9, 0.014, 0.025, P.cream, KNIT), [0, 0.797, 0.45]));
  g.push(xf(box(1.9, 0.014, 0.025, P.cream, KNIT), [0, 0.797, -0.53]));
  // back wall planks, shelf of ribbon spools, posts and a warm bulb garland
  const shade = ['#7a4f33', '#82553a', '#74492f', '#7e5236'];
  for (let i = 0; i < 5; i++) g.push(xf(rbox(0.48, 1.0, 0.04, 0.01, shade[i % 4], KNIT, 1), [-0.96 + i * 0.48, 1.29, -0.585]));
  g.push(xf(rbox(1.5, 0.035, 0.16, 0.01, PLANK, FELT), [0, 1.0, -0.5]));
  [P.red, P.gold, P.green, P.cream, P.pink, P.teal, P.red, P.gold].forEach((c, i) => {
    const x = -0.66 + i * 0.19;
    g.push(xf(cyl(0.05, 0.05, 0.07, 10, c, KNIT), [x, 1.055, -0.5]));
    g.push(xf(cyl(0.057, 0.057, 0.012, 10, P.creamDark, FELT), [x, 1.095, -0.5]));
    g.push(xf(cyl(0.057, 0.057, 0.012, 10, P.creamDark, FELT), [x, 1.017, -0.5]));
  });
  for (const sx of [-1, 1]) g.push(xf(cyl(0.04, 0.045, 1.45, 8, WOODD, KNIT), [sx * 1.08, 1.5, -0.55]));
  for (let i = 0; i < 17; i++) {
    const t = i / 16, x = -1.08 + t * 2.16, y = 1.34 - 0.09 * Math.sin(t * Math.PI);
    g.push(xf(dot(0.024, i % 3 ? '#d08a3e' : '#e6b36c', GLOW), [x, y, -0.52]));
  }
  g.push(tube([[-1.08, 1.34, -0.52], [0, 1.25, -0.52], [1.08, 1.34, -0.52]], 0.007, P.ink, KNIT, 20, 4));
  // a glowing lantern at the back and a little spool on the cloth
  g.push(xf(cyl(0.05, 0.05, 0.12, 8, '#ffb55a', GLOW), [-0.95, 0.87, -0.45]));
  g.push(xf(cyl(0.058, 0.058, 0.014, 8, WOODD, KNIT), [-0.95, 0.808, -0.45]));
  g.push(xf(cyl(0.058, 0.058, 0.014, 8, WOODD, KNIT), [-0.95, 0.932, -0.45]));
  g.push(xf(cyl(0.04, 0.04, 0.04, 10, P.red, KNIT), [0.9, 0.822, -0.38]));
  g.push(xf(cyl(0.045, 0.045, 0.01, 10, P.creamDark, FELT), [0.9, 0.845, -0.38]));
  return merge(g);
}

function buildTree() {
  const g = [];
  g.push(xf(cyl(0.07, 0.06, 0.09, 10, P.brick, KNIT), [0, 0.045, 0]));
  g.push(xf(cyl(0.015, 0.02, 0.1, 6, P.woodDark, KNIT), [0, 0.14, 0]));
  const cols = [P.pine, '#3a7a52', P.green];
  [[0.15, 0.2, 0.2], [0.12, 0.2, 0.32], [0.085, 0.18, 0.43]].forEach(([r, h, y], i) => g.push(xf(cone(r, h, 10, cols[i], KNIT), [0, y, 0])));
  g.push(xf(dot(0.03, P.gold, GLOW), [0, 0.54, 0]));
  [[0.1, 0.17, 0.08, P.red], [-0.08, 0.2, 0.09, P.gold], [0.02, 0.26, 0.11, P.cream], [-0.08, 0.31, 0.06, P.red], [0.07, 0.36, 0.06, P.gold], [-0.03, 0.43, 0.06, P.red]]
    .forEach(([x, y, z, c]) => g.push(xf(dot(0.016, c, FELT), [x, y, z])));
  return merge(g);
}

function dispenserGeo() {
  const g = [];
  g.push(xf(rbox(0.07, 0.022, 0.05, 0.008, P.red, KNIT), [0, 0.03, 0]));
  g.push(xf(torus(0.03, 0.013, P.cream, KNIT, TAU, 16, 6), [0, 0.062, 0], [0, Math.PI / 2, 0]));
  g.push(xf(cone(0.012, 0.03, 8, P.creamDark, KNIT), [0, 0.012, 0], [Math.PI, 0, 0]));
  return merge(g);
}
function bowGeo(rc, rc2) {
  const g = [];
  for (const s of [-1, 1]) g.push(xf(torus(0.05, 0.013, rc, KNIT, TAU, 16, 6), [s * 0.055, 0.05, 0], [0, 0, s * 0.35], [1, 1.2, 1]));
  g.push(xf(dot(0.026, rc2, KNIT), [0, 0.035, 0]));
  for (const s of [-1, 1]) g.push(xf(box(0.026, 0.006, 0.08, rc, KNIT), [s * 0.03, 0.006, 0.05], [0, s * 0.35, 0]));
  return merge(g);
}
function trimGeo(rc) {
  const g = [];
  g.push(xf(box(0.034, 0.006, GD + 0.016, rc, KNIT), [0, GH + 0.0215, 0]));
  for (const s of [-1, 1]) g.push(xf(box(0.034, GH + 0.026, 0.006, rc, KNIT), [0, (GH + 0.026) / 2, s * (GD / 2 + 0.004)]));
  return merge(g);
}
function cardGeo(pat, rc) {
  const g = [];
  g.push(xf(rbox(0.22, 0.27, 0.014, 0.006, P.cream, FELT, 1), [0, 0.135, 0]));
  g.push(xf(patBox(0.15, 0.008, 0.15, 7, 1, 7, pat), [0, 0.15, 0.011], [Math.PI / 2, 0, 0]));
  g.push(xf(dot(0.02, rc, KNIT), [0, 0.04, 0.012]));
  g.push(xf(dot(0.012, P.red, GLOSS), [0, 0.262, 0.012]));
  return xf(merge(g), [0, 0, 0], [-0.3, 0, 0]);
}
function sheetGeo(pat) {
  const g = [patBox(0.24, 0.012, 0.24, 12, 1, 12, pat, null, pat.main)];
  g.push(xf(cyl(0.032, 0.032, 0.24, 10, pat.main, KNIT), [-0.14, 0.02, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(cyl(0.034, 0.034, 0.012, 10, P.cream, FELT), [-0.14, 0.02, 0.126], [Math.PI / 2, 0, 0]));
  g.push(xf(cyl(0.034, 0.034, 0.012, 10, P.cream, FELT), [-0.14, 0.02, -0.126], [Math.PI / 2, 0, 0]));
  return merge(g);
}
function giftBodyGeo(pat) {
  const g = patBox(GW, GH, GD, 12, 6, 10, pat, '#d8b98a');
  g.translate(0, GH / 2, 0);
  return g;
}
function flapGeo(pat) {
  const g = patBox(FL, 0.006, GD + 0.002, 6, 1, 10, pat);
  g.translate(FL / 2, 0.003, 0);
  return g;
}
function tapeGeo(list) {
  if (!list.length) return xf(box(0.001, 0.001, 0.001, '#ffffff', GLOSS), [0, -5, 0]);
  return merge(list.map((s) => xf(box(0.1, 0.004, 0.04, '#f6efd8', GLOSS), [s.x, GH + 0.0155, s.z], [0, s.yaw, 0])));
}

const CSS = `
.gw-root{position:absolute;inset:0;pointer-events:none;font-family:var(--font,system-ui)}
.gw-fb{position:absolute;left:50%;top:25%;transform:translateX(-50%);font:800 clamp(28px,6vw,50px)/1 var(--font);color:#fff;white-space:nowrap;text-shadow:0 3px 0 rgba(60,20,18,.85),0 0 18px rgba(0,0,0,.35);animation:gwFb 1.1s ease-out both}
.gw-fb.great{color:#ffd45a}.gw-fb.ok{color:#bfe8b0}.gw-fb.bad{color:#ff9d8a}
.gw-fb small{display:block;text-align:center;font:700 clamp(13px,2.4vw,18px)/1.3 var(--font);margin-top:4px;color:#fff}
@keyframes gwFb{0%{opacity:0;transform:translateX(-50%) translateY(14px) scale(.7)}15%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.12)}30%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-26px)}}
.gw-tap{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
 min-width:min(60vw,280px);height:88px;border-radius:44px;border:4px dashed rgba(255,255,255,.75);outline:none;cursor:pointer;background:#b8302d;color:#fff;font:800 34px/1 var(--font,system-ui);letter-spacing:.08em;
 box-shadow:0 7px 0 #6e1a18,0 12px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:opacity .2s,background .15s}
.gw-tap small{font:600 12px/1 var(--font,system-ui);letter-spacing:.14em;opacity:.8;text-transform:uppercase}
.gw-tap.down{transform:translateX(-50%) translateY(5px);box-shadow:0 2px 0 #6e1a18;background:#c8403c}
.gw-tap.idle{opacity:.5}
.gw-tap.side{left:auto;right:calc(22px + env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:none;width:112px;min-width:0;height:112px;border-radius:50%;font-size:28px}
.gw-tap.side.down{transform:translateY(5px)}
@media (max-height:420px){.gw-tap.side{width:100px;height:100px;font-size:26px}}
@media (orientation:portrait){.gw-fb{top:21%;font-size:clamp(26px,9vw,42px)}}
`;

const ICON = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><rect x="7" y="20" width="34" height="22" rx="3" fill="#b8302d"/><rect x="5" y="14" width="38" height="9" rx="3" fill="#d4453f"/><rect x="21" y="14" width="6" height="28" fill="#e3aa3a"/><path d="M24 14C16 3 8 8 15 13Z M24 14C32 3 40 8 33 13Z" fill="none" stroke="#e3aa3a" stroke-width="3.5" stroke-linejoin="round"/></svg>';

// ------------------------------------------------------------------ sinusoid timing helpers
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
/** Seconds between phase theta and the nearest crossing of sin(theta) = s. */
function sinErr(theta, s, omega) {
  const a = Math.asin(clamp(s, -1, 1));
  return Math.min(Math.abs(wrapPi(theta - a)), Math.abs(wrapPi(theta - (Math.PI - a)))) / omega;
}
/** Seconds until the next crossing of sin(theta) = s that is at least minWait away. */
function sinNext(theta, s, omega, minWait) {
  const a = Math.asin(clamp(s, -1, 1));
  let best = 1e9;
  for (const c of [a, Math.PI - a]) {
    let d = mod(c - theta, TAU);
    while (d / omega < minWait) d += TAU;
    best = Math.min(best, d / omega);
  }
  return best;
}

export default {
  id: 'giftwrap',
  title: 'Gift Wrapping',
  district: 'market',
  icon: ICON,
  intro: 'Wrap four presents for Auntie Noor! Tap at the right moment: pick the paper, fold the flaps, tape the seam, then hold to grow the bow and let go on the ring.',

  async start(ctx, mg) {
    const { engine, cam, uiRoot } = ctx;
    const params = new URLSearchParams(location.search);
    const audio = (n) => ctx.audio?.sfx?.(n);
    const A = ARENAS.giftwrap;
    const heading = A.heading ?? Math.PI / 2;
    const ch = Math.cos(heading), sh = Math.sin(heading);
    const toWorld = (lx, ly, lz, out = new V3()) => out.set(A.x + lx * ch + lz * sh, ly, A.z - lx * sh + lz * ch);
    mg.setPlayerVisible(false);

    let G = 0, stage = 'card', ready = false, stageT = 0, started = false, giftIdx = 0, sub = 0;
    const accs = [], giftAcc = [], giftMeans = [];
    const mean = () => (accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0);

    const dbg = (window.__giftwrap = {
      auto: params.has('mgauto'), mode: 'good', speed: 1, log: [], result: null, finished: false,
      bot(mode = 'good') { dbg.auto = true; dbg.mode = mode; return dbg; },
      get state() { return { stage, gift: giftIdx, sub, taps: accs.length, mean: mean(), ready, holding: bow.holding, hold: bow.t, accs: accs.slice(), gifts: giftMeans.slice() }; },
      get stage() { return stage; },
    });

    // ---------------------------------------------------------------- scene
    const group = mg.add(new THREE.Group());
    group.position.set(A.x, 0, A.z);
    group.rotation.y = heading;
    const work = new THREE.Group(); group.add(work);
    const gift = new THREE.Group(); work.add(gift);
    const pileG = new THREE.Group(); group.add(pileG);
    const meshes = [];
    const mk = (geo, parent = group, { cast = false, vis = true } = {}) => {
      const m = new THREE.Mesh(geo, engine.mat);
      m.castShadow = cast; m.receiveShadow = cast; m.visible = vis; m.frustumCulled = false;
      parent.add(m); meshes.push(m);
      return m;
    };
    mk(buildSet(), group, { cast: true });
    const treeM = mk(buildTree());
    const cardM = mk(cardGeo(PATS[0], '#fff'));
    const sheets = PATS.map((p) => mk(sheetGeo(p), work));
    const bodyM = mk(giftBodyGeo(PATS[0]), gift, { vis: false });
    const flapShared = { g: flapGeo(PATS[0]) };
    const flaps = [-1, 1].map((s) => {
      const m = mk(flapShared.g, gift, { vis: false });
      m.rotation.order = 'YXZ';
      return { m, side: s, alpha: 165, skew: 0, gap: 0, anim: null, closed: false };
    });
    const tapeM = mk(tapeGeo([]), gift, { vis: false });
    const trimM = mk(trimGeo('#fff'), gift, { vis: false });
    const bowM = mk(bowGeo('#fff', '#fff'), gift, { vis: false });
    const dispM = mk(dispenserGeo(), gift, { vis: false });
    const ringM = mk(torus(1, 0.06, '#ffffff', KNIT, TAU, 28, 6), gift, { vis: false }); // growing loop (colour per gift)
    ringM.rotation.x = Math.PI / 2;
    const glowM = mk(frameGeo(0.3, 0.3, 0.012), work, { vis: false });
    const GLOWS = { frame: glowM.geometry, ghost: frameGeo(FL, GD + 0.012, 0.009, FL / 2), ring: torus(0.038, 0.006, '#ffe29a', GLOW, TAU, 20, 5), bow: torus(R_BOW, 0.006, '#ffe29a', GLOW, TAU, 32, 5) };
    const pileM = mk(xf(box(0.001, 0.001, 0.001, '#ffffff', FELT), [0, -5, 0]), pileG, { vis: false });
    const pileParts = [];

    // ---------------------------------------------------------------- DOM
    const root = document.createElement('div');
    root.className = 'gw-root';
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    uiRoot.appendChild(root);
    const coarse = matchMedia('(pointer:coarse)').matches;
    const btn = document.createElement('button');
    btn.className = 'gw-tap idle';
    btn.tabIndex = -1;
    root.appendChild(btn);
    const setBtn = (word) => { btn.innerHTML = word + (coarse ? '' : '<small>or press Space</small>'); };
    setBtn('TAP');
    const feedback = (text, tone, sub2 = '') => {
      root.querySelectorAll('.gw-fb').forEach((e) => e.remove());
      const f = document.createElement('div');
      f.className = 'gw-fb ' + tone;
      f.innerHTML = text + (sub2 ? `<small>${sub2}</small>` : '');
      root.appendChild(f);
      setTimeout(() => f.remove(), 1200);
    };

    // ---------------------------------------------------------------- layout / camera
    let lay = isPortrait() ? LAY.port : LAY.land;
    let portrait = isPortrait();
    const sideBtn = () => !isPortrait() && (innerHeight <= 520 || matchMedia('(pointer:coarse)').matches);
    const applyLayout = () => {
      portrait = isPortrait();
      lay = portrait ? LAY.port : LAY.land;
      work.position.set(0, MAT_Y, lay.gz);
      treeM.position.set(lay.tree[0], MAT_Y, lay.tree[1]);
      cardM.position.set(lay.card[0], MAT_Y, lay.card[1]);
      pileG.position.set(lay.pile[0], MAT_Y, lay.pile[1]);
      btn.classList.toggle('side', sideBtn());
    };
    const CLOSE_POST = { bloom: 0.42, glow: 0.6, threshold: 0.35, band: 0.3, falloff: 0.3 };
    const camPose = (out) => {
      const c = engine.camera;
      const th = Math.tan((c.fov * D2R) / 2), asp = Math.max(0.2, c.aspect);
      const side = sideBtn();
      // free screen fractions above (HUD) and below (TAP pill) the content
      const top = portrait ? 0.15 : side ? 0.17 : 0.13, bot = portrait ? 0.19 : side ? 0.05 : 0.2;
      // keep the camera below y 2.0: the market's cream cord garlands (pole to tree, y 2.15-2.6) run right over the
      // portrait camera spot otherwise and smear across the view (nothing above the camera height is ever visible)
      let pr = lay.pitch * D2R, dist = 1.1;
      for (let k = 0; k < 3; k++) {
        const halfH = lay.fit.halfD * Math.sin(pr) + 0.14 * Math.cos(pr) + 0.05;
        dist = Math.max(halfH / ((1 - top - bot) * th), lay.fit.halfW / (th * asp), 1.1);
        pr = Math.min(lay.pitch * D2R, Math.asin(clamp(1.18 / dist, 0, 1)));
      }
      const tx = lay.fit.t[0], tz = lay.fit.t[1];
      const shift = (top - bot) * dist * th; // look a little above so the content sits in the free band
      const sway = Math.sin(G * 0.6) * 0.01;
      toWorld(tx + sway, MAT_Y + Math.sin(pr) * dist, tz + Math.cos(pr) * dist, out.pos);
      toWorld(tx, MAT_Y + Math.cos(pr) * shift, tz - Math.sin(pr) * shift, out.target);
    };
    cam.setMode('close');
    cam.playShot({ name: 'giftwrap', duration: 900, skippable: false, blendIn: 1.0, blendOut: 0.6, tilt: 0.55, post: CLOSE_POST, portrait: false, update(u, out) { camPose(out); } });
    applyLayout();

    // ---------------------------------------------------------------- state
    const timers = [];
    const after = (s, fn) => timers.push({ t: G + s, fn });
    const order = (() => { const a = [0, 1, 2].sort(() => Math.random() - 0.5); a.push([0, 1, 2].filter((k) => k !== a[2])[Math.floor(Math.random() * 2)]); return a; })();
    let pat = PATS[0], rc = '#fff';
    const win = () => { const k = 1 - 0.1 * giftIdx; return { p: WIN_P * k, z: WIN_Z * k }; };
    const accOf = (err, scale = 1) => { const w = win(); const p = w.p * scale, z = w.z * scale; return err <= p ? 1 : err >= z ? 0 : 1 - (err - p) / (z - p); };
    const gaussian = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());

    const award = (acc, extra = '') => {
      accs.push(acc); giftAcc.push(acc);
      dbg.log.push({ gift: giftIdx, stage, acc: +acc.toFixed(3) });
      mg.hud.setScore(Math.round(mean() * 100) + '%', 'Neatness');
      if (acc >= 0.9) { feedback('Perfect!', 'great', extra); audio('bell'); audio('pop'); }
      else if (acc >= 0.6) { feedback('Nice!', 'ok', extra); audio('pop'); }
      else if (acc >= 0.3) { feedback('Almost', 'ok', extra); audio('pop'); }
      else { feedback('Oops', 'bad', extra); audio('ui'); }
    };
    const goal = (t) => mg.hud.setGoal(`Gift ${giftIdx + 1}/${GIFTS} · ${t}`);
    const setReady = (on, word) => { ready = on; stageT = 0; btn.classList.toggle('idle', !on); if (word) setBtn(word); };

    // belt
    let beltOff = 0, beltFade = 1, mistakes = 0;
    const beltSpeed = () => BELT_V * SPEED[giftIdx];
    const sheetX = (k) => mod(k * BELT_STEP + beltOff + BELT_LEN / 2, BELT_LEN) - BELT_LEN / 2;
    // fold / tape / bow
    let foldTheta = Math.PI / 2, foldTarget = 100, tapeTheta = -Math.PI / 2;
    const tapeMarks = [0, 0];
    let tapeList = [];
    const bow = { holding: false, t: 0, tT: 1, done: false, sc: 0, popT: 9 };
    let bodyPop = 9, flapPop = 9, flight = null, pulse = 0;

    // ---------------------------------------------------------------- gift flow
    function startGift() {
      pat = PATS[order[giftIdx]];
      rc = pat.rib;
      cardM.geometry.dispose(); cardM.geometry = cardGeo(pat, rc);
      mistakes = 0; giftAcc.length = 0; tapeList = []; sub = 0;
      gift.position.set(0, 0, 0); gift.scale.set(1, 1, 1); gift.rotation.set(0, 0, 0);
      for (const m of [bodyM, tapeM, trimM, bowM, dispM, ringM]) m.visible = false;
      flaps.forEach((f) => { f.m.visible = false; f.alpha = 165; f.skew = 0; f.gap = 0; f.anim = null; f.closed = false; });
      bow.popT = 9; bow.holding = false; bow.done = false;
      tapeM.geometry.dispose(); tapeM.geometry = tapeGeo([]);
      beltFade = 1; sheets.forEach((s) => { s.visible = true; });
      stage = 'paper';
      setReady(false, 'TAP');
      goal(`Tap when ${pat.name} is framed`);
      glowM.geometry = GLOWS.frame; glowM.position.set(0, 0.018, 0); glowM.rotation.set(0, 0, 0); glowM.visible = true;
      after(0.55, () => setReady(true));
    }

    function tapPaper(forced) {
      let best = -1, bd = 9;
      for (let k = 0; k < BELT_N; k++) { const d = Math.abs(sheetX(k)); if (d < bd) { bd = d; best = k; } }
      if (forced == null) {
        if (bd > 0.17) { feedback('Wait for it', 'ok'); return; }
        if (best !== order[giftIdx]) { mistakes++; feedback('Not that one!', 'bad', `Look for ${pat.name}`); audio('ui'); return; }
      }
      setReady(false);
      const acc = forced ?? accOf(bd / beltSpeed()) * Math.pow(0.65, mistakes);
      award(acc);
      bodyM.geometry.dispose(); bodyM.geometry = giftBodyGeo(pat);
      flapShared.g.dispose(); flapShared.g = flapGeo(pat); flaps.forEach((f) => { f.m.geometry = flapShared.g; });
      trimM.geometry.dispose(); trimM.geometry = trimGeo(rc);
      bowM.geometry.dispose(); bowM.geometry = bowGeo(rc, pat.rib2);
      ringM.geometry.dispose(); ringM.geometry = torus(1, 0.06, rc, KNIT, TAU, 28, 6);
      glowM.visible = false;
      bodyM.visible = true; bodyPop = 0; audio('fold');
      stage = 'wrap';
      after(0.8, () => startFold(0));
    }

    function startFold(i) {
      sub = i; stage = 'fold';
      flaps.forEach((f) => { f.m.visible = true; });
      flapPop = i ? 1 : 0;
      foldTheta = Math.PI / 2;
      foldTarget = 50 + Math.random() * 80;
      glowM.geometry = GLOWS.ghost; glowM.visible = true;
      goal(i ? 'Fold the second flap' : 'Fold! Match the glow');
      setReady(false, 'TAP');
      after(0.5, () => setReady(true));
    }
    const foldAlpha = () => 90 + 75 * Math.sin(foldTheta);
    function tapFold(forced) {
      setReady(false);
      const f = flaps[sub];
      const err = sinErr(foldTheta, (foldTarget - 90) / 75, TAU / T_FOLD[giftIdx]);
      const acc = forced ?? accOf(err);
      award(acc);
      f.alpha = foldAlpha();
      f.anim = { from: f.alpha, to: 0, t: 0, dur: 0.4 };
      f.skew = (1 - acc) * 0.16 * (Math.random() < 0.5 ? -1 : 1);
      f.gap = (1 - acc) * 0.014;
      f.closed = true;
      glowM.visible = false;
      audio('fold');
      stage = 'wrap';
      after(0.7, () => (sub === 0 ? startFold(1) : startTape(0)));
    }

    function startTape(i) {
      sub = i; stage = 'tape';
      tapeTheta = -Math.PI / 2;
      const zm = (i ? 0.06 : -0.06) + (Math.random() - 0.5) * 0.04;
      tapeMarks[i] = zm;
      dispM.visible = true; tapeM.visible = true;
      glowM.geometry = GLOWS.ring; glowM.visible = true; glowM.position.set(0, GH + 0.017, zm); glowM.rotation.set(Math.PI / 2, 0, 0);
      goal(i ? 'Tape again on the ring' : 'Tape the seam on the ring');
      setReady(false, 'TAP');
      after(0.45, () => setReady(true));
    }
    const tapeZ = () => TAPE_A * Math.sin(tapeTheta);
    function tapTape(forced) {
      setReady(false);
      const err = sinErr(tapeTheta, tapeMarks[sub] / TAPE_A, TAU / T_TAPE[giftIdx]);
      const acc = forced ?? accOf(err);
      award(acc);
      tapeList.push({ x: (Math.random() - 0.5) * 0.01 * (1 - acc), z: clamp(tapeZ(), -0.1, 0.1), yaw: (1 - acc) * 0.5 * (Math.random() < 0.5 ? -1 : 1) });
      tapeM.geometry.dispose(); tapeM.geometry = tapeGeo(tapeList);
      glowM.visible = false;
      audio('pop');
      stage = 'wrap';
      after(0.6, () => (sub === 0 ? startTape(1) : startBow()));
    }

    function startBow() {
      stage = 'bow'; sub = 0;
      dispM.visible = false;
      trimM.visible = true;
      bow.holding = false; bow.t = 0; bow.tT = T_BOW[giftIdx]; bow.done = false;
      glowM.geometry = GLOWS.bow; glowM.visible = true; glowM.position.set(0, GH + 0.026, 0); glowM.rotation.set(Math.PI / 2, 0, 0);
      goal('Hold to grow the bow, let go at the ring');
      setReady(false, 'HOLD');
      after(0.5, () => setReady(true));
    }
    function startHold() { bow.holding = true; bow.t = 0; ringM.visible = true; audio('ui'); }
    function releaseBow(forced) {
      if (bow.done) return;
      bow.done = true; bow.holding = false; setReady(false);
      const acc = forced ?? accOf(Math.abs(bow.t - bow.tT), 1.3);
      bow.sc = clamp(bow.t / bow.tT, 0.35, 1.6);
      award(acc);
      ringM.visible = false; glowM.visible = false;
      bowM.visible = true; bow.popT = 0;
      audio('gift');
      stage = 'wrap';
      after(0.95, placeGift);
    }

    function placeGift() {
      stage = 'place';
      const slot = SLOTS[Math.min(giftIdx, SLOTS.length - 1)];
      const m = giftAcc.reduce((a, b) => a + b, 0) / giftAcc.length;
      giftMeans.push(m);
      feedback(`Gift ${giftIdx + 1} done!`, m >= 0.85 ? 'great' : 'ok', `${Math.round(m * 100)}% neat`);
      flight = { t: 0, dur: 0.85, target: new V3(lay.pile[0] + slot[0], slot[1], lay.pile[1] + slot[2] - lay.gz), yaw: slot[3], slot };
      audio('whoosh');
    }
    function landGift() {
      const slot = flight.slot;
      gift.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(gift.matrixWorld).invert();
      const Tp = new THREE.Matrix4().compose(new V3(slot[0], slot[1], slot[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, flight.yaw, 0)), new V3(PS, PS, PS));
      for (const m of [bodyM, flaps[0].m, flaps[1].m, tapeM, trimM, bowM]) {
        m.updateMatrixWorld(true);
        const g = m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().copy(Tp).multiply(new THREE.Matrix4().copy(inv).multiply(m.matrixWorld)));
        pileParts.push(g);
      }
      pileM.geometry.dispose();
      pileM.geometry = merge(pileParts.map((g) => g.clone()));
      pileM.visible = true;
      flight = null;
      audio('gift');
      for (const m of [bodyM, tapeM, trimM, bowM, flaps[0].m, flaps[1].m]) m.visible = false;
      giftIdx++;
      stage = 'wrap';
      if (giftIdx < GIFTS) after(0.5, startGift); else after(0.9, finish);
    }

    function finish() {
      stage = 'end';
      btn.remove();
      const m = mean();
      const stars = Math.max(1, m >= STARS[2] ? 3 : m >= STARS[1] ? 2 : 1);
      const pct = Math.round(m * 100);
      const text = stars >= 3 ? `Perfectly wrapped! ${pct}% neat. Auntie Noor is thrilled.`
        : stars >= 2 ? `Lovely wrapping! ${pct}% neat. The pile looks wonderful.`
          : `All wrapped! ${pct}% neat. A little practice makes perfect.`;
      dbg.result = { score: Math.round(m * 1000), stars, mean: m, perGift: giftMeans.slice() };
      dbg.finished = true;
      audio('cheer');
      mg.finish({ score: Math.round(m * 1000), stars, text });
    }

    // ---------------------------------------------------------------- input
    const doTap = () => {
      if (!started || !ready) return;
      if (stage === 'paper') tapPaper(); else if (stage === 'fold') tapFold(); else if (stage === 'tape') tapTape();
    };
    const down = () => {
      if (!started || dbg.finished) return;
      btn.classList.add('down');
      if (stage === 'bow') { if (ready && !bow.holding && !bow.done) startHold(); return; }
      doTap();
    };
    const up = () => { btn.classList.remove('down'); if (stage === 'bow' && bow.holding) releaseBow(); };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); btn.setPointerCapture?.(e.pointerId); down(); });
    btn.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); up(); });
    btn.addEventListener('pointercancel', () => up());
    const winDown = (e) => { if (e.target === engine.renderer.domElement) down(); };
    const winUp = () => up();
    window.addEventListener('pointerdown', winDown);
    window.addEventListener('pointerup', winUp);
    window.addEventListener('pointercancel', winUp);
    mg.onKey((e) => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) down(); } });
    const onKeyUp = (e) => { if (e.code === 'Space' || e.key === 'Enter') up(); };
    window.addEventListener('keyup', onKeyUp);

    // ---------------------------------------------------------------- bot (taps at the predicted ideal moment + a timing error)
    const BIAS = { perfect: 0, good: 0.04, ok: 0.08, sloppy: 0.17, random: 0 };
    let plan = null;
    const MINW = 0.14;
    function makePlan(key) {
      const rand = dbg.mode === 'random';
      const b = dbg.mode === 'perfect' ? 0 : gaussian() * (BIAS[dbg.mode] ?? 0.04);
      const p = { key, b, tapAt: Infinity, pressAt: Infinity, relAt: Infinity };
      const g = giftIdx;
      if (stage === 'paper') {
        const bs = beltSpeed();
        let t = mod(-sheetX(order[g]), BELT_LEN) / bs;
        while (t + b < MINW) t += BELT_LEN / bs;
        p.tapAt = rand ? G + 0.2 + Math.random() * 2.5 : G + t + b;
      } else if (stage === 'fold') {
        p.tapAt = rand ? G + 0.2 + Math.random() * 1.5 : G + sinNext(foldTheta, (foldTarget - 90) / 75, TAU / T_FOLD[g], MINW - b) + b;
      } else if (stage === 'tape') {
        p.tapAt = rand ? G + 0.2 + Math.random() * 1.5 : G + sinNext(tapeTheta, tapeMarks[sub] / TAPE_A, TAU / T_TAPE[g], MINW - b) + b;
      } else if (stage === 'bow') p.pressAt = G + 0.2;
      return p;
    }
    function botTick() {
      if (!dbg.auto || !ready || stage === 'end') { if (!ready) plan = null; return; }
      const key = stage + ':' + giftIdx + ':' + sub;
      if (!plan || plan.key !== key) plan = makePlan(key);
      if (stage === 'bow') {
        if (!bow.holding && !bow.done && G >= plan.pressAt) { down(); plan.relAt = G + (dbg.mode === 'random' ? 0.2 + Math.random() * 1.6 : Math.max(0.05, bow.tT + plan.b)); }
        else if (bow.holding && G >= plan.relAt) up();
      } else if (G >= plan.tapAt) { plan.tapAt = Infinity; down(); up(); }
    }

    // ---------------------------------------------------------------- animation
    const easeOutBack = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
    const animate = (h) => {
      // paper belt
      if (stage === 'paper') beltOff += beltSpeed() * h;
      else if (beltFade > 0) beltFade = Math.max(0, beltFade - h * 4);
      const edge = portrait ? 0.34 : 0.55;
      for (let k = 0; k < BELT_N; k++) {
        const x = sheetX(k);
        const sc = clamp((edge + 0.2 - Math.abs(x)) / 0.2, 0, 1) * beltFade;
        sheets[k].position.set(x, 0.008, 0);
        sheets[k].scale.setScalar(Math.max(0.001, sc));
        sheets[k].visible = sc > 0.01;
      }
      pulse += h * 6;
      if (glowM.visible) { const k = 1 + 0.04 * Math.sin(pulse); if (glowM.geometry === GLOWS.frame) glowM.scale.set(k, 1, k); else glowM.scale.setScalar(k); }
      if (bodyPop < 1) { bodyPop = Math.min(1, bodyPop + h * 2.6); bodyM.scale.set(1, Math.max(0.02, easeOutBack(bodyPop)), 1); }
      if (flapPop < 1) flapPop = Math.min(1, flapPop + h * 3);
      for (let i = 0; i < 2; i++) {
        const f = flaps[i];
        if (!f.m.visible) continue;
        if (stage === 'fold' && i === sub && !f.closed) f.alpha = foldAlpha();
        if (f.anim) {
          f.anim.t += h;
          const k = Math.min(1, f.anim.t / f.anim.dur);
          f.alpha = f.anim.from + (f.anim.to - f.anim.from) * (k * k * (3 - 2 * k));
          if (k >= 1) f.anim = null;
        }
        f.m.position.set(f.side * (GW / 2 + (f.closed ? f.gap : 0)), GH + (f.side > 0 ? 0.007 : 0), 0);
        f.m.rotation.set(0, (f.side > 0 ? Math.PI : 0) + f.skew, f.alpha * D2R);
        f.m.scale.setScalar(Math.max(0.02, easeOutBack(flapPop)));
      }
      if (stage === 'fold') {
        const f = flaps[sub];
        glowM.position.set(f.side * (GW / 2), GH + (f.side > 0 ? 0.007 : 0) + 0.004, 0);
        glowM.rotation.set(0, f.side > 0 ? Math.PI : 0, foldTarget * D2R, 'YXZ');
      }
      if (stage === 'tape') dispM.position.set(0, GH + 0.017 + 0.004 * Math.sin(pulse * 0.8), tapeZ());
      if (bow.holding) {
        const r = Math.max(0.01, (R_BOW * bow.t) / bow.tT);
        ringM.position.set(0, GH + 0.024, 0);
        ringM.scale.set(r, r, r);
      }
      if (bow.popT < 1) {
        bow.popT = Math.min(1, bow.popT + h * 2.8);
        bowM.scale.setScalar(bow.sc * Math.max(0.01, easeOutBack(bow.popT)));
        bowM.position.set(0, GH + 0.025, 0);
      }
      if (flight) {
        flight.t += h;
        const k = Math.min(1, flight.t / flight.dur), e = k * k * (3 - 2 * k);
        gift.position.set(flight.target.x * e, flight.target.y * e + 0.2 * Math.sin(Math.PI * k), flight.target.z * e);
        gift.rotation.y = flight.yaw * e;
        gift.scale.setScalar(1 + (PS - 1) * e);
        if (k >= 1) landGift();
      }
    };

    const step = (h) => {
      G += h;
      for (let i = 0; i < timers.length; i++) if (G >= timers[i].t) { const f = timers.splice(i, 1)[0].fn; i--; f(); }
      if (started) {
        if (stage === 'fold') foldTheta += (TAU / T_FOLD[giftIdx]) * h;
        else if (stage === 'tape') tapeTheta += (TAU / T_TAPE[giftIdx]) * h;
        else if (stage === 'bow' && bow.holding) { bow.t += h; if (bow.t > bow.tT * 1.7) releaseBow(0); }
        if (ready) {
          stageT += h;
          if (stageT > IDLE) {
            if (stage === 'paper') tapPaper(0.1); else if (stage === 'fold') tapFold(0.1); else if (stage === 'tape') tapTape(0.1);
            else if (stage === 'bow' && !bow.holding) releaseBow(0.1);
          }
        }
        botTick();
      }
      animate(h);
    };
    let wasPortrait = portrait;
    mg.addUpdate((dt) => {
      if (isPortrait() !== wasPortrait) { wasPortrait = isPortrait(); applyLayout(); }
      let rem = Math.min(dt, 0.1) * dbg.speed;
      while (rem > 1e-6) { const h = Math.min(rem, 1 / 60); step(h); rem -= h; }
    });
    dbg.ff = (sec, h = 1 / 30) => { for (let i = 0, n = Math.round(sec / h); i < n && !dbg.finished; i++) step(h); return dbg.state; };
    dbg.budget = () => {
      let calls = 0, tris = 0;
      group.traverseVisible((o) => {
        if (!o.isMesh) return;
        const passes = o.castShadow ? 2 : 1;
        calls += passes; tris += (o.geometry.attributes.position.count / 3) * passes;
      });
      return { calls, tris: Math.round(tris) };
    };

    mg.onDispose(() => {
      window.removeEventListener('pointerdown', winDown);
      window.removeEventListener('pointerup', winUp);
      window.removeEventListener('pointercancel', winUp);
      window.removeEventListener('keyup', onKeyUp);
      root.remove();
      for (const m of meshes) m.geometry.dispose();
      Object.values(GLOWS).forEach((g) => g.dispose());
      pileParts.forEach((g) => g.dispose());
      meshes.length = 0;
      if (window.__giftwrap === dbg) delete window.__giftwrap;
      // ease the camera back out instead of snapping
      const p = new V3(), t = new V3();
      camPose({ pos: p, target: t });
      cam.playShot({ name: 'giftwrap-out', duration: 0.7, skippable: false, blendIn: 0.01, blendOut: 0.6, tilt: 0.55, post: CLOSE_POST, portrait: false, update(u, out) { out.pos.copy(p); out.target.copy(t); } });
    });

    // ---------------------------------------------------------------- go
    mg.hud.setScore('0%', 'Neatness');
    mg.hud.setGoal(`Gift 1/${GIFTS} · Get ready`);
    await mg.intro();
    started = true;
    startGift();
  },
};
