// COOKIE BAKERY (door 8) — three quick tap-timing rounds at a knitted bakery counter: Cut, Bake, Decorate.
// One input (tap / Space / Enter / big DOM button), ~60 s. Budget: ~16 draw calls, ~12k tris, all removed on dispose.
// Debug: window.__cookies = { auto (taps perfectly), speed (sim time multiplier), log, stage, score }.
import * as THREE from 'three';
import { P } from '../../core/yarn.js';
import { box, rbox, cyl, sph, dot, torus, tube, extrude, flatShape, xf, merge, poly, circlePts, starPts, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';
import { ARENAS } from '../../core/layout.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;

// ------------------------------------------------------------------ layout (local space; camera looks toward -z)
const COUNTER_Y = 0.78;
const LANE_Z = 0.26, DOUGH_Y = 0.815;
const OVEN = { x: 0.72, z: -0.23, w: 0.64, h: 0.6, d: 0.38 };
const WIN = { bottom: 0.17, height: 0.3, w: 0.26 }; // glow window (above counter top)
const PLATE = { x: -0.68, z: -0.05 };
const TRAY = { x: 0, z: 0.22 };
const CUTTER_X = 0.0;
const R = 0.105; // cookie radius

const CAM = {
  cut: { pos: [0.05, 1.6, 2.35], tgt: [0.05, 0.84, 0.1] },
  bake: { pos: [0.45, 1.45, 1.75], tgt: [0.5, 1.0, 0.05] },
  dec: { pos: [0.0, 1.55, 1.95], tgt: [0.0, 0.84, 0.2] },
};

// ------------------------------------------------------------------ tuning
const CUTS = 6, TRAYS = 3, DROPS = 8;
const MAXPTS = { cut: 60, bake: 110, dec: 40 };
const MAX_SCORE = CUTS * MAXPTS.cut + TRAYS * MAXPTS.bake + DROPS * MAXPTS.dec;
const STARS = [0.4, 0.65, 0.85];
const BAKE = [
  { c: 0.5, h: 0.15, speed: 0.27 },
  { c: 0.6, h: 0.115, speed: 0.31 },
  { c: 0.68, h: 0.085, speed: 0.35 },
];
const DROP_ORDER = [0, 4, 2, 3, 1, 5, 3, 0];

// ------------------------------------------------------------------ shapes (unit space, y up = away from camera)
const TREE = [[0, 1], [0.45, 0.45], [0.22, 0.45], [0.6, -0.05], [0.3, -0.05], [0.75, -0.6], [0.16, -0.6], [0.16, -0.9], [-0.16, -0.9], [-0.16, -0.6], [-0.75, -0.6], [-0.3, -0.05], [-0.6, -0.05], [-0.22, 0.45], [-0.45, 0.45]];
const MAN = [[0.12, 0.38], [0.55, 0.4], [0.86, 0.3], [0.9, 0.1], [0.58, 0.1], [0.3, 0.12], [0.34, -0.25], [0.62, -0.62], [0.5, -0.86], [0.18, -0.8], [0, -0.4], [-0.18, -0.8], [-0.5, -0.86], [-0.62, -0.62], [-0.34, -0.25], [-0.3, 0.12], [-0.58, 0.1], [-0.9, 0.1], [-0.86, 0.3], [-0.55, 0.4], [-0.12, 0.38]];
const HEAD = circlePts(0, 0.62, 0.3, 0.3, 16);
const STAR = starPts(1, 0.48, 5);
const SHAPES = [{ name: 'star', pts: STAR }, { name: 'tree', pts: TREE }, { name: 'man', pts: MAN, head: HEAD }];
const scaled = (pts, s) => pts.map(([x, y]) => [x * s, y * s]);
const W = (sx, sy, y) => [sx * R, y, -sy * R]; // shape coords → world offset on a flat cookie

function cookieGeo(k) {
  const g = [];
  const col = ['#e8b85e', '#cf9a5c', '#b9783d'][k];
  const s = SHAPES[k];
  g.push(flatShape(poly(scaled(s.pts, R)), 0.035, col, FELT));
  if (s.head) g.push(flatShape(poly(scaled(s.head, R)), 0.035, col, FELT));
  const top = 0.036;
  if (k === 0) g.push(xf(dot(0.016, P.glowSoft, GLOW), [0, top, 0], null, [1, 0.5, 1]));
  if (k === 1) for (const [x, y, c] of [[0, 0.52, P.red], [0.2, -0.05, P.gold], [-0.25, -0.12, P.red], [0.0, -0.4, P.glowSoft]]) g.push(xf(dot(0.013, c, FELT), W(x, y, top), null, [1, 0.5, 1]));
  if (k === 2) {
    for (const y of [0.1, -0.12, -0.34]) g.push(xf(dot(0.013, P.red, FELT), W(0, y, top), null, [1, 0.5, 1]));
    for (const x of [-0.1, 0.1]) g.push(xf(dot(0.01, P.ink, FELT), W(x, 0.68, top), null, [1, 0.5, 1]));
  }
  return merge(g);
}

function ringShape(pts, wall) {
  const sh = poly(scaled(pts, R * 1.1));
  sh.holes.push(new THREE.Path(scaled(pts, R * 1.1 * (1 - wall)).map(([x, y]) => new THREE.Vector2(x, y))));
  return sh;
}
function cutterGeo(k) {
  const s = SHAPES[k];
  const g = [flatShape(ringShape(s.pts, 0.16), 0.05, '#c8ccd2', GLOSS)];
  if (s.head) g.push(flatShape(ringShape(s.head, 0.2), 0.05, '#c8ccd2', GLOSS));
  g.push(xf(box(R * 1.7, 0.014, 0.024, P.red, KNIT), [0, 0.056, 0]));
  g.push(xf(sph(0.022, P.red, KNIT, 8, 6), [0, 0.075, 0]));
  return merge(g);
}

// ------------------------------------------------------------------ static set
function buildSet() {
  const g = [];
  const WOOD = P.wood, WOODD = P.woodDark, PLANK = '#c79a63';
  // counter
  g.push(xf(rbox(2.4, 0.74, 0.9, 0.02, WOOD, KNIT), [0, 0.37, 0]));
  g.push(xf(rbox(2.48, 0.05, 0.98, 0.02, PLANK, FELT), [0, 0.755, 0]));
  g.push(xf(rbox(2.3, 0.36, 0.03, 0.012, P.red, KNIT, 1), [0, 0.5, 0.455]));
  g.push(xf(box(2.3, 0.04, 0.035, P.cream, KNIT), [0, 0.66, 0.46]));
  for (let i = 0; i < 20; i++) g.push(xf(dot(0.034, P.cream, FELT), [-1.09 + i * 0.115, 0.31, 0.47]));
  // posts, beam, striped awning
  for (const sx of [-1, 1]) {
    g.push(xf(cyl(0.04, 0.045, 1.8, 8, WOODD, KNIT), [sx * 1.22, 0.9, 0.46]));
    g.push(xf(cyl(0.04, 0.045, 1.8, 8, WOODD, KNIT), [sx * 1.22, 0.9, -0.48]));
    g.push(xf(torus(0.045, 0.012, P.red, KNIT, TAU, 10), [sx * 1.22, 1.0, 0.46], [Math.PI / 2, 0, 0]));
  }
  g.push(xf(rbox(2.6, 0.1, 0.12, 0.02, WOODD, KNIT), [0, 1.78, 0.46]));
  for (let i = 0; i < 10; i++) {
    const x = -1.17 + i * 0.26, c = i % 2 ? P.cream : P.red;
    g.push(xf(box(0.26, 0.04, 1.1, c, KNIT), [x, 1.88, 0.0], [-0.16, 0, 0]));
    g.push(xf(sph(0.13, c, KNIT, 8, 5), [x, 1.75, 0.58], null, [1, 0.55, 0.35]));
  }
  // back wall planks
  const shade = ['#7a4f33', '#82553a', '#74492f', '#7e5236'];
  for (let i = 0; i < 4; i++) g.push(xf(rbox(0.6, 1.0, 0.04, 0.01, shade[i], KNIT, 1), [-0.9 + i * 0.6, COUNTER_Y + 0.5, -0.5]));
  // shelf with sprinkle jars
  g.push(xf(rbox(1.0, 0.035, 0.16, 0.01, PLANK, FELT), [-0.62, 1.12, -0.4]));
  [P.red, P.green, P.gold, P.pink].forEach((c, i) => {
    const x = -0.95 + i * 0.22;
    g.push(xf(cyl(0.048, 0.048, 0.11, 10, c, GLOSS), [x, 1.19, -0.4]));
    g.push(xf(cyl(0.05, 0.05, 0.025, 10, P.cream, KNIT), [x, 1.26, -0.4]));
    g.push(xf(dot(0.014, P.red, FELT), [x, 1.285, -0.4]));
    g.push(xf(box(0.05, 0.04, 0.006, P.cream, FELT), [x, 1.19, -0.35]));
  });
  // warm glowing windows behind the shelves (like the cosy shop reference) + sign board and cords
  for (const wx of [-0.62, 0.05]) {
    g.push(xf(rbox(wx < 0 ? 1.08 : 0.8, 0.34, 0.02, 0.01, P.cream, FELT, 1), [wx, 1.27, -0.475]));
    g.push(xf(rbox(wx < 0 ? 1.0 : 0.72, 0.26, 0.02, 0.01, '#8a5524', GLOW, 1), [wx, 1.27, -0.462]));
    for (let k = 1; k < (wx < 0 ? 4 : 3); k++) g.push(xf(box(0.015, 0.26, 0.012, P.cream, FELT), [wx - (wx < 0 ? 0.5 : 0.36) + k * (wx < 0 ? 0.25 : 0.24), 1.27, -0.45]));
  }
  g.push(xf(rbox(0.9, 0.2, 0.03, 0.012, '#2f5b40', KNIT, 1), [0.05, 1.22, -0.3]));
  g.push(xf(rbox(0.94, 0.24, 0.02, 0.012, P.gold, FELT, 1), [0.05, 1.22, -0.32]));
  // warm bulb garland along the front beam (GLOW)
  for (let i = 0; i < 15; i++) {
    const t = i / 14, x = -1.15 + t * 2.3, y = 1.5 - 0.07 * Math.sin(t * Math.PI);
    g.push(xf(dot(0.022, i % 3 ? '#c9803a' : '#d9a460', GLOW), [x, y, 0.5]));
  }
  g.push(tube([[-1.15, 1.52, 0.5], [0, 1.43, 0.5], [1.15, 1.52, 0.5]], 0.007, P.ink, KNIT, 24, 4));
  // rolling board (the dough lane) + notch marker under the cutter
  g.push(xf(rbox(2.3, 0.02, 0.34, 0.008, '#e0c08a', FELT), [0, 0.79, LANE_Z]));
  g.push(xf(extrude(poly([[-0.03, 0], [0.03, 0], [0, 0.05]]), 0.008, P.glow, GLOW), [0, 0.8, LANE_Z + 0.22], [-Math.PI / 2, 0, 0]));
  // dough ball + rolling pin
  g.push(xf(sph(0.07, '#ecd5a4', FELT), [0.2, 0.84, -0.3], null, [1, 0.75, 1]));
  g.push(xf(cyl(0.025, 0.025, 0.3, 10, P.wood, KNIT), [-0.1, 0.81, -0.34], [0, 0, Math.PI / 2]));
  // plate for finished cookies
  g.push(xf(cyl(0.21, 0.19, 0.02, 20, P.cream, FELT), [PLATE.x, 0.79, PLATE.z]));
  g.push(xf(torus(0.2, 0.014, P.red, KNIT, TAU, 20), [PLATE.x, 0.805, PLATE.z], [Math.PI / 2, 0, 0]));
  // the oven
  const o = OVEN, oy = COUNTER_Y;
  g.push(xf(rbox(o.w, o.h, o.d, 0.03, '#a5493a', KNIT), [o.x, oy + o.h / 2, o.z]));
  g.push(xf(rbox(o.w + 0.04, 0.05, o.d + 0.04, 0.02, P.cream, KNIT), [o.x, oy + o.h + 0.01, o.z]));
  g.push(xf(cyl(0.05, 0.055, 0.2, 10, P.brick, KNIT), [o.x + 0.18, oy + o.h + 0.13, o.z - 0.08]));
  g.push(xf(torus(0.052, 0.014, P.cream, KNIT, TAU, 10), [o.x + 0.18, oy + o.h + 0.23, o.z - 0.08], [Math.PI / 2, 0, 0]));
  const fz = o.z + o.d / 2;
  g.push(xf(rbox(0.5, 0.44, 0.03, 0.015, P.cream, FELT, 1), [o.x, oy + WIN.bottom + WIN.height / 2, fz + 0.01]));
  g.push(xf(rbox(0.36, 0.38, 0.02, 0.01, P.ink, FELT, 1), [o.x, oy + WIN.bottom + WIN.height / 2, fz + 0.03]));
  for (const k of [-1, 0, 1]) g.push(xf(dot(0.022, k ? P.gold : P.red, GLOSS), [o.x + k * 0.14, oy + 0.08, fz + 0.025]));
  g.push(xf(box(0.3, 0.025, 0.02, P.cream, KNIT), [o.x, oy + WIN.bottom + WIN.height + 0.06, fz + 0.03]));
  return merge(g);
}

function trayGeo() {
  const g = [];
  g.push(xf(rbox(0.96, 0.025, 0.5, 0.01, '#bfc4c9', GLOSS, 1), [0, 0, 0]));
  g.push(xf(rbox(0.98, 0.04, 0.02, 0.008, '#a9aeb4', GLOSS, 1), [0, 0.012, 0.25]));
  g.push(xf(rbox(0.98, 0.04, 0.02, 0.008, '#a9aeb4', GLOSS, 1), [0, 0.012, -0.25]));
  g.push(xf(rbox(0.02, 0.04, 0.5, 0.008, '#a9aeb4', GLOSS, 1), [0.48, 0.012, 0]));
  g.push(xf(rbox(0.02, 0.04, 0.5, 0.008, '#a9aeb4', GLOSS, 1), [-0.48, 0.012, 0]));
  return merge(g);
}

function shakerGeo() {
  const g = [];
  g.push(xf(cyl(0.05, 0.04, 0.13, 10, '#dfe9ee', GLOSS), [0, 0.07, 0]));
  g.push(xf(cyl(0.04, 0.044, 0.035, 10, P.red, KNIT), [0, -0.012, 0]));
  g.push(xf(torus(0.046, 0.008, P.gold, KNIT, TAU, 10), [0, 0.07, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(dot(0.022, P.red, KNIT), [0, 0.15, 0]));
  return merge(g);
}

const SPR_COLS = [P.red, P.green, P.gold, P.pink, P.teal, '#ffffff', P.orange];
function sprinkleBits(n, rnd) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: (rnd() - 0.5) * 0.06, y: rnd() * 0.12, z: (rnd() - 0.5) * 0.06, r: rnd() * Math.PI, c: SPR_COLS[(rnd() * SPR_COLS.length) | 0] });
  return out;
}
const bitGeo = (b) => xf(box(0.028, 0.009, 0.009, b.c, FELT), [b.x, b.y, b.z], [0, b.r, 0]);

function stripGeo(u) {
  const g = [];
  g.push(rbox(1.6, 0.03, 0.2, 0.012, '#ecd5a4', FELT));
  g.push(xf(cyl(0.046, 0.046, 0.012, 14, '#ff5a3c', GLOW), [u, 0.021, 0]));
  g.push(xf(torus(0.066, 0.009, '#fff1c0', GLOW, TAU, 16), [u, 0.018, 0], [Math.PI / 2, 0, 0]));
  return merge(g);
}

function fillGeo(w, d) {
  const gg = box(w, 1, d, '#ffb52e', GLOW);
  gg.translate(0, 0.5, 0);
  return gg;
}
function railGeo() {
  const a = box(0.03, 1, 0.025, '#ffd45a', GLOW); a.translate(-0.19, 0.5, 0);
  const b = box(0.03, 1, 0.025, '#ffd45a', GLOW); b.translate(0.19, 0.5, 0);
  return merge([a, b]);
}

// ------------------------------------------------------------------ colours for the oven glow
const KEYS = (c, h) => [[0, '#5a3d28'], [c - h, '#c8a46a'], [c, '#ffb52e'], [c + h, '#e0561c'], [Math.min(1, c + h + 0.22), '#4a1a10']].map(([t, col]) => [t, new THREE.Color(col)]);
const tmpC = new THREE.Color();
function bakeColor(L, c, h, out) {
  const k = KEYS(c, h);
  if (L <= k[0][0]) return out.copy(k[0][1]);
  for (let i = 1; i < k.length; i++) if (L <= k[i][0]) { const t = (L - k[i - 1][0]) / Math.max(1e-4, k[i][0] - k[i - 1][0]); return out.copy(k[i - 1][1]).lerp(k[i][1], t); }
  return out.copy(k[k.length - 1][1]);
}
function paint(geo, c) {
  const a = geo.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b);
  a.needsUpdate = true;
}

const CSS = `
.ck-root{position:absolute;inset:0;pointer-events:none;font-family:var(--font,system-ui)}
.ck-card{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);text-align:center;padding:14px 34px 16px;animation:ckCard 1.7s ease both}
.ck-card small{display:block;font:700 12px/1 var(--font);letter-spacing:.2em;text-transform:uppercase;opacity:.7}
.ck-card b{display:block;font:800 clamp(34px,7vw,56px)/1.05 var(--font);color:var(--red,#b8302d);margin:6px 0 4px}
.ck-card span{font:600 clamp(13px,2.2vw,17px)/1.3 var(--font)}
@keyframes ckCard{0%{opacity:0;transform:translate(-50%,-40%) scale(.85)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.04)}20%{transform:translate(-50%,-50%) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-56%) scale(.98)}}
.ck-fb{position:absolute;left:50%;top:24%;transform:translateX(-50%);font:800 clamp(30px,6vw,52px)/1 var(--font);color:#fff;white-space:nowrap;text-shadow:0 3px 0 rgba(60,20,18,.85),0 0 18px rgba(0,0,0,.35);animation:ckFb 1.1s ease-out both}
.ck-fb.great{color:#ffd45a}.ck-fb.ok{color:#bfe8b0}.ck-fb.bad{color:#ff9d8a}
@keyframes ckFb{0%{opacity:0;transform:translateX(-50%) translateY(14px) scale(.7)}15%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.12)}30%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-26px)}}
.ck-tap{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);pointer-events:auto;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
 min-width:min(54vw,260px);height:86px;border-radius:44px;border:4px dashed rgba(255,255,255,.75);outline:none;cursor:pointer;background:#b8302d;color:#fff;font:800 36px/1 var(--font,system-ui);letter-spacing:.08em;
 box-shadow:0 7px 0 #6e1a18,0 12px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:opacity .2s}
.ck-tap small{font:600 12px/1 var(--font,system-ui);letter-spacing:.14em;opacity:.8;text-transform:uppercase}
.ck-tap:active,.ck-tap.down{transform:translateX(-50%) translateY(5px);box-shadow:0 2px 0 #6e1a18}
.ck-tap.idle{opacity:.55}
@media (pointer:coarse){.ck-tap{height:96px;min-width:min(60vw,300px)}}
@media (max-height:420px){.ck-tap{height:70px;font-size:30px}.ck-card{top:34%}}
`;

export default {
  id: 'cookies',
  title: 'Cookie Bakery',
  district: 'market',
  icon: '',
  intro: 'Cut the cookies, bake them golden, then sprinkle! Just tap (or press Space) at the right moment.',

  async start(ctx, mg) {
    const { engine, cam, uiRoot } = ctx;
    const audio = (n) => ctx.audio?.sfx?.(n);
    const A = ARENAS.cookies;
    const origin = new V3(A.x - 1.9, 0, A.z + 0.2);
    const rnd = Math.random;
    mg.setPlayerVisible(false); // close-up counter camera: keep the player's doll out of the shot

    const dbg = (window.__cookies = { auto: false, speed: 1, log: [], get stage() { return stage; }, get score() { return score; }, result: null });

    // ---------------------------------------------------------------- scene
    const group = mg.add(new THREE.Group());
    group.position.copy(origin);
    const meshes = [];
    const mk = (geo, { cast = false, vis = true, cull = false } = {}) => {
      const m = new THREE.Mesh(geo, engine.mat);
      m.castShadow = cast; m.receiveShadow = cast; m.visible = vis; m.frustumCulled = cull;
      group.add(m); meshes.push(m);
      return m;
    };
    mk(buildSet(), { cast: true, cull: true });
    {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
      const c2 = cv.getContext('2d');
      c2.fillStyle = '#2f5b40'; c2.fillRect(0, 0, 512, 96);
      c2.strokeStyle = 'rgba(239,225,198,.55)'; c2.setLineDash([9, 7]); c2.lineWidth = 3; c2.strokeRect(8, 8, 496, 80);
      c2.fillStyle = '#efe1c6'; c2.font = '800 54px system-ui, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.fillText('WARM COOKIES', 256, 52);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const signMat = new THREE.MeshBasicMaterial({ map: tex });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.158), signMat);
      sign.position.set(0.05, 1.22, -0.282); group.add(sign);
      mg.onDispose(() => { tex.dispose(); signMat.dispose(); sign.geometry.dispose(); });
    }
    const trayMesh = mk(trayGeo(), { vis: false });
    const strips = [0, 1].map(() => ({ mesh: mk(stripGeo(0), { vis: false }), active: false, x: -2, u: 0, v: 1, judged: false }));
    const cutters = [0, 1, 2].map((k) => { const m = mk(cutterGeo(k), { vis: false }); return m; });
    const cookieMeshes = [0, 1, 2].map((k) => {
      const im = new THREE.InstancedMesh(cookieGeo(k), engine.mat, 3);
      im.count = 0; im.frustumCulled = false; im.castShadow = false;
      group.add(im); meshes.push(im);
      return im;
    });
    const fill = mk(fillGeo(WIN.w, 0.02), {});
    fill.position.set(OVEN.x, COUNTER_Y + WIN.bottom + (0.38 - WIN.height) / 2, OVEN.z + OVEN.d / 2 + 0.05);
    fill.scale.y = 0.001;
    const rails = mk(railGeo(), { vis: false });
    rails.position.set(OVEN.x, fill.position.y, fill.position.z);
    const targetDot = mk(merge([xf(cyl(0.05, 0.05, 0.012, 14, '#ffd060', GLOW), [0, 0, 0]), xf(torus(0.072, 0.01, '#fff4c8', GLOW, TAU, 16), [0, 0.004, 0], [Math.PI / 2, 0, 0])]), { vis: false });
    const shaker = mk(shakerGeo(), { vis: false });
    const rainBits = sprinkleBits(14, rnd);
    const rain = mk(merge(rainBits.map(bitGeo)), { vis: false });
    let landed = mk(merge([bitGeo({ x: 0, y: 0, z: 0, r: 0, c: P.red })]), { vis: false });
    const landedBits = [];

    // ---------------------------------------------------------------- cookies (6 total, kind = i % 3)
    const cookies = Array.from({ length: CUTS }, (_, i) => ({
      i, kind: i % 3, slot: Math.floor(i / 3), placed: false, pos: new V3(), from: new V3(), to: new V3(), t: 1, dur: 1, arc: 0, delay: 0,
      rot: 0, spin: 0, scale: 1, tilt: 0, hopT: 9, onLand: null,
    }));
    const dummy = new THREE.Object3D();
    const pileSlot = (i) => {
      const layer = i < 3 ? 0 : 1, k = i % 3, a = (k / 3) * TAU + layer * 0.9;
      return new V3(PLATE.x + Math.cos(a) * 0.07, 0.815 + layer * 0.04, PLATE.z + Math.sin(a) * 0.07);
    };
    const traySlot = (i) => new V3(-0.3 + 0.3 * (i % 3), 0.855, 0.11 + 0.22 * Math.floor(i / 3));
    const moveCookie = (c, to, dur, arc, delay = 0, onLand = null) => {
      c.from.copy(c.pos); c.to.copy(to); c.t = 0; c.dur = dur; c.arc = arc; c.delay = delay; c.spin = (rnd() - 0.5) * 5; c.onLand = onLand;
    };

    // ---------------------------------------------------------------- state
    let G = 0, stage = 'card', score = 0, perfects = 0, actions = 0;
    const timers = [];
    const after = (s, fn) => timers.push({ t: G + s, fn });
    const camPos = new V3(...CAM.cut.pos), camTgt = new V3(...CAM.cut.tgt);
    const goalPos = camPos.clone(), goalTgt = camTgt.clone();
    const setCam = (k) => { goalPos.set(...CAM[k].pos); goalTgt.set(...CAM[k].tgt); };
    const roundScore = { cut: 0, bake: 0, dec: 0 };

    // cut
    let cutIdx = 0;
    const cutter = { y: 0.98, stampT: 9, busy: false, cur: 0, shown: false };
    // bake
    let trayIdx = 0, L = 0, bakeAcc = false;
    // decorate
    let dropIdx = 0, shPhase = rnd() * TAU, shX = 0, shVel = 0, shZ = LANE_Z, shHit = 9, decAcc = false;
    let target = { x: 0, z: 0, cookie: 0 };
    let rainT = 9, rainFrom = 0, rainX = 0, rainZ = 0, rainSpread = 0;
    let trayT = 0;

    // ---------------------------------------------------------------- camera
    cam.setMode('close');
    // counter close-up: wide sharp band (counter, oven meter and stall front all crisp), gentle bloom so the bulb
    // garland stays small warm points instead of blown discs
    const CLOSE_POST = { bloom: 0.42, glow: 0.6, threshold: 0.35, band: 0.3, falloff: 0.3 };
    const shotOut = new V3(), shotTgt = new V3();
    cam.playShot({
      name: 'cookies', duration: 900, skippable: false, blendIn: 1.0, blendOut: 0.6, tilt: 0.55, post: CLOSE_POST,
      update(u, out) {
        const sway = Math.sin(G * 0.7) * 0.012;
        out.pos.copy(camPos).add(origin); out.pos.x += sway;
        out.target.copy(camTgt).add(origin);
      },
    });

    // ---------------------------------------------------------------- DOM
    const root = document.createElement('div');
    root.className = 'ck-root';
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    uiRoot.appendChild(root);
    const coarse = matchMedia('(pointer:coarse)').matches;
    const btn = document.createElement('button');
    btn.className = 'ck-tap idle';
    btn.tabIndex = -1;
    btn.innerHTML = 'TAP' + (coarse ? '' : '<small>or press Space</small>');
    root.appendChild(btn);
    let card = null;
    const showCard = (n, title, sub) => {
      card?.remove();
      card = document.createElement('div');
      card.className = 'ck-card knit-card';
      card.innerHTML = `<small>Round ${n} of 3</small><b>${title}</b><span>${sub}</span>`;
      root.appendChild(card);
      audio('ui');
    };
    const hideCard = () => { card?.remove(); card = null; };
    const feedback = (text, tone) => {
      root.querySelectorAll('.ck-fb').forEach((e) => e.remove());
      const f = document.createElement('div');
      f.className = 'ck-fb ' + tone;
      f.textContent = text;
      root.appendChild(f);
      setTimeout(() => f.remove(), 1200);
    };

    const accepting = () => stage === 'cut' || stage === 'bake' || stage === 'dec';
    const award = (round, acc, label, tone) => {
      score += acc * MAXPTS[round]; roundScore[round] += acc * MAXPTS[round];
      actions++; if (acc >= 1) perfects++;
      dbg.log.push({ round, acc, label });
      mg.hud.setScore(Math.round(score));
      feedback(label, tone);
      if (acc >= 1) { audio('bell'); audio('pop'); } else if (acc > 0) audio('pop');
    };

    // ---------------------------------------------------------------- ROUND 1: cut
    const spawnStrip = () => {
      const s = strips.find((q) => !q.active);
      if (!s) return;
      s.u = (rnd() - 0.5) * 0.9;
      s.mesh.geometry.dispose();
      s.mesh.geometry = stripGeo(s.u);
      s.x = -1.95; s.v = 0.75 + 0.05 * cutIdx; s.active = true; s.judged = false; s.exit = false;
      s.mesh.visible = true;
    };
    const doCut = (s, acc, label, tone) => {
      s.judged = true; s.exit = true;
      award('cut', acc, label, tone);
      cutter.busy = true; cutter.stampT = 0; cutter.pendingAcc = acc;
      const i = cutIdx++;
      mg.hud.setGoal(`Cut ${Math.min(cutIdx + 1, CUTS)}/${CUTS}`);
      after(0.1, () => {
        const c = cookies[i];
        c.placed = true; c.pos.set(CUTTER_X, DOUGH_Y + 0.015, LANE_Z);
        c.scale = 0.74 + 0.3 * acc; c.rot = (1 - acc) * (rnd() - 0.5) * 1.6; c.tilt = (1 - acc) * (rnd() - 0.5) * 0.35;
        cookieMeshes[c.kind].count = c.slot + 1;
        moveCookie(c, pileSlot(i), 0.65, 0.28, 0.12, () => audio('pop'));
        audio('pop');
      });
      if (cutIdx < CUTS) spawnStrip();
      else after(1.5, () => startRound(2));
    };
    const tapCut = () => {
      if (cutter.busy) return;
      let best = null, bd = 9;
      for (const s of strips) if (s.active && !s.judged) { const dx = s.x + s.u - CUTTER_X; if (dx > -0.75 && Math.abs(dx) < bd) { bd = Math.abs(dx); best = s; } }
      if (!best) return;
      const dx = best.x + best.u - CUTTER_X, a = Math.abs(dx);
      if (a < 0.09) doCut(best, 1, 'Perfect!', 'great');
      else if (a < 0.22) doCut(best, 0.6, 'Good cut!', 'ok');
      else if (a < 0.38) doCut(best, 0.25, 'Close!', 'ok');
      else doCut(best, 0, dx < 0 ? 'Too early!' : 'Oops, missed!', 'bad');
    };
    const updateCut = (h) => {
      for (const s of strips) {
        if (!s.active || s.judged) continue;
        const dx = s.x + s.u - CUTTER_X;
        if (dbg.auto && !cutter.busy && dx >= -s.v * h * 0.6) { tapCut(); continue; }
        if (dx > 0.5) doCut(s, 0, 'Too slow!', 'bad');
      }
    };

    // ---------------------------------------------------------------- ROUND 2: bake
    const startTray = () => {
      stage = 'bake'; bakeAcc = false; L = 0;
      const b = BAKE[trayIdx];
      mg.hud.setGoal(`Tray ${trayIdx + 1}/${TRAYS} · stop in the gold`);
      rails.scale.y = 2 * b.h * WIN.height + 0.0001; // set below in animate via zone mapping
      rails.position.y = COUNTER_Y + WIN.bottom + (0.38 - WIN.height) / 2 + (b.c - b.h) * WIN.height;
      rails.visible = true;
      fill.scale.y = 0.001;
    };
    const tapBake = () => {
      if (bakeAcc) return;
      bakeAcc = true;
      const b = BAKE[trayIdx], d = Math.abs(L - b.c);
      let r;
      if (d <= b.h * 0.5) r = [1, 'Perfectly golden!', 'great'];
      else if (d <= b.h) r = [0.75, 'Golden!', 'great'];
      else if (L < b.c) r = d <= b.h * 2.2 ? [0.3, 'A bit pale', 'ok'] : [0.1, 'Still doughy', 'bad'];
      else r = d <= b.h * 1.5 ? [0.3, 'A little toasty', 'ok'] : [0, 'Oops, crispy', 'bad'];
      endTray(...r);
    };
    const endTray = (acc, label, tone) => {
      stage = 'bakeWait';
      award('bake', acc, label, tone);
      after(1.3, () => {
        trayIdx++;
        if (trayIdx < TRAYS) { fill.scale.y = 0.001; startTray(); } else { rails.visible = false; fill.scale.y = 0.001; startRound(3); }
      });
    };
    const updateBake = (h) => {
      const b = BAKE[trayIdx];
      if (bakeAcc) return;
      L += b.speed * h;
      if (dbg.auto && L >= b.c) { tapBake(); return; }
      if (L >= 1) { L = 1; bakeAcc = true; endTray(0, 'Oops, crispy', 'bad'); }
    };

    // ---------------------------------------------------------------- ROUND 3: decorate
    const nextTarget = () => {
      stage = 'dec'; decAcc = false;
      const ci = DROP_ORDER[dropIdx];
      const p = traySlot(ci);
      target = { x: p.x + (rnd() - 0.5) * 0.08, z: p.z, cookie: ci };
      targetDot.position.set(target.x, 0.885, target.z);
      targetDot.visible = true;
      mg.hud.setGoal(`Sprinkle ${dropIdx + 1}/${DROPS}`);
    };
    const tapDec = () => {
      if (decAcc) return;
      decAcc = true;
      const dx = Math.abs(shX - target.x);
      let r;
      if (dx < 0.06) r = [1, 'Perfect!', 'great', 0.05];
      else if (dx < 0.13) r = [0.6, 'Sprinkled!', 'ok', 0.08];
      else if (dx < 0.22) r = [0.25, 'Close!', 'ok', 0.1];
      else r = [0, 'Oops!', 'bad', 0.12];
      award('dec', r[0], r[1], r[2]);
      rainSpread = r[3]; rainX = shX; rainZ = shZ; rainT = 0; rainFrom = shaker.position.y - 0.04;
      shHit = 0; rain.visible = true;
      targetDot.visible = false;
      dropIdx++;
      stage = 'decWait';
      after(0.75, () => {
        if (dropIdx < DROPS) nextTarget();
        else { stage = 'end'; shaker.visible = false; after(1.0, finish); }
      });
    };
    const addLanded = () => {
      for (const b of rainBits) landedBits.push({ x: rainX + b.x * (rainSpread / 0.03), y: 0.86 + b.y * 0.02, z: rainZ + b.z * (rainSpread / 0.03), r: b.r + rnd(), c: b.c });
      landed.geometry.dispose();
      landed.geometry = merge(landedBits.map(bitGeo));
      landed.visible = true;
      const c = cookies[target.cookie];
      if (c) c.hopT = 0;
    };
    const updateDec = (h) => {
      if (stage !== 'dec' || decAcc) return;
      if (dbg.auto) {
        const near = Math.abs(shX - target.x);
        if (near <= Math.abs(shVel) * h * 0.55 + 0.003) tapDec();
      }
    };

    // ---------------------------------------------------------------- flow
    const startRound = (n) => {
      stage = 'card';
      btn.classList.add('idle');
      if (n === 1) { showCard(1, 'Cut!', 'Tap when the red dot is under the cutter'); mg.hud.setGoal('Round 1 · Cut'); setCam('cut'); }
      if (n === 2) { showCard(2, 'Bake!', 'Stop the glow in the golden zone'); mg.hud.setGoal('Round 2 · Bake'); setCam('bake'); cutter.shown = false; }
      if (n === 3) { showCard(3, 'Decorate!', 'Tap to drop sprinkles on the glowing dot'); mg.hud.setGoal('Round 3 · Decorate'); setCam('dec'); }
      after(1.7, () => {
        hideCard();
        btn.classList.remove('idle');
        if (n === 1) { stage = 'cut'; cutIdx = 0; cutter.shown = true; mg.hud.setGoal(`Cut 1/${CUTS}`); spawnStrip(); }
        if (n === 2) { trayIdx = 0; startTray(); }
        if (n === 3) {
          stage = 'decWait';
          trayMesh.visible = true; trayT = 0;
          cookies.forEach((c, i) => moveCookie(c, traySlot(i), 0.7, 0.3, 0.3 + i * 0.1, () => audio('pop')));
          shaker.visible = true; shHit = 9;
          after(1.9, nextTarget);
        }
      });
    };

    const finish = () => {
      btn.remove();
      const acc = score / MAX_SCORE;
      const stars = acc >= STARS[2] ? 3 : acc >= STARS[1] ? 2 : acc >= STARS[0] ? 1 : 0;
      const pct = Math.round(acc * 100);
      const text = stars >= 3 ? `Bakery-perfect! ${perfects} perfect hits, ${pct}% accuracy.`
        : stars >= 1 ? `Yummy! ${perfects} perfect hits, ${pct}% accuracy.` : `${pct}% accuracy. Cookies take practice!`;
      dbg.result = { score: Math.round(score), stars, acc, perfects, rounds: { ...roundScore } };
      mg.finish({ score: Math.round(score), stars, text });
    };

    // ---------------------------------------------------------------- input
    const tap = () => {
      if (!accepting()) return;
      btn.classList.add('down'); setTimeout(() => btn.classList.remove('down'), 90);
      if (stage === 'cut') tapCut(); else if (stage === 'bake') tapBake(); else if (stage === 'dec') tapDec();
    };
    const onBtn = (e) => { e.preventDefault(); e.stopPropagation(); tap(); };
    btn.addEventListener('pointerdown', onBtn);
    mg.onTap(() => tap());
    mg.onKey((e) => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) tap(); } });

    // ---------------------------------------------------------------- animation (runs in sim time)
    const animate = (h) => {
      // cutter
      const cw = cutters;
      cutters.forEach((m, k) => { m.visible = cutter.shown && k === cutter.cur; });
      let cy = 0.98 + 0.035 * Math.sin(G * 5);
      if (cutter.stampT < 0.4) {
        cutter.stampT += h;
        const t = cutter.stampT;
        cy = t < 0.12 ? 0.98 + (0.835 - 0.98) * (t / 0.12) : 0.835 + (0.98 - 0.835) * Math.min(1, (t - 0.12) / 0.2);
        if (t >= 0.34 && cutter.busy) { cutter.busy = false; cutter.cur = cutIdx % 3; }
      }
      cw.forEach((m) => m.position.set(CUTTER_X, cy, LANE_Z));
      // strips
      for (const s of strips) {
        if (!s.active) continue;
        s.x += s.v * (s.exit ? 2.4 : 1) * h;
        s.mesh.position.set(s.x, DOUGH_Y, LANE_Z);
        if (s.x > 2.1) { s.active = false; s.mesh.visible = false; }
      }
      // cookies
      for (const c of cookies) {
        if (!c.placed) continue;
        if (c.t < c.dur) {
          c.t += h;
          if (c.t >= 0) {
            const k = Math.min(1, c.t / c.dur), e = k * k * (3 - 2 * k);
            c.pos.lerpVectors(c.from, c.to, e); c.pos.y += c.arc * Math.sin(Math.PI * k);
            c.rotAdd = c.spin * k;
            if (k >= 1) { c.rot += c.spin; c.rotAdd = 0; const f = c.onLand; c.onLand = null; f?.(); }
          }
        }
        c.hopT += h * 3;
        const hop = c.hopT < 1 ? 0.035 * Math.sin(c.hopT * Math.PI) : 0;
        dummy.position.set(c.pos.x, c.pos.y + hop, c.pos.z);
        dummy.rotation.set(c.tilt, c.rot + (c.rotAdd || 0), c.tilt * 0.5);
        dummy.scale.setScalar(c.scale);
        dummy.updateMatrix();
        cookieMeshes[c.kind].setMatrixAt(c.slot, dummy.matrix);
      }
      cookieMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
      // oven fill
      if (stage === 'bake' || stage === 'bakeWait') {
        const b = BAKE[Math.min(trayIdx, TRAYS - 1)];
        fill.scale.y = Math.max(0.001, L * 0.38 * (WIN.height / 0.38) * (0.38 / WIN.height) * (WIN.height / 0.38) * (0.38 / 0.38));
        fill.scale.y = Math.max(0.001, L * WIN.height);
        bakeColor(L, b.c, b.h, tmpC); paint(fill.geometry, tmpC);
      }
      // sprinkles
      trayT = Math.min(1, trayT + h * 2.2);
      trayMesh.position.set(TRAY.x, 0.805 + (1 - trayT * trayT * (3 - 2 * trayT)) * 0.5, TRAY.z);
      if (shaker.visible) {
        shPhase += (2.2 + 0.18 * dropIdx) * h;
        const nx = 0.5 * Math.sin(shPhase);
        shVel = (nx - shX) / Math.max(h, 1e-5); shX = nx;
        const tz = stage === 'dec' || stage === 'decWait' ? (target.z || LANE_Z) : LANE_Z;
        shZ += (tz - shZ) * (1 - Math.exp(-h * 9));
        shHit += h * 3;
        const shake = shHit < 1 ? Math.sin(shHit * 34) * 0.35 * (1 - shHit) : 0;
        shaker.position.set(shX, 1.1 + 0.015 * Math.sin(G * 6), shZ);
        shaker.rotation.set(0, 0, Math.PI - THREE.MathUtils.clamp(shVel * 0.18, -0.5, 0.5) + shake);
        // inverted: spout points down
      }
      targetDot.scale.setScalar(1 + 0.14 * Math.sin(G * 8));
      if (rainT < 1) {
        rainT += h * 3.6;
        const k = Math.min(1, rainT);
        rain.position.set(rainX, rainFrom + (0.86 - rainFrom) * k * k, rainZ);
        if (rainT >= 1) { rain.visible = false; addLanded(); audio('pop'); }
      }
    };

    const step = (h) => {
      G += h;
      for (let i = 0; i < timers.length; i++) if (G >= timers[i].t) { const f = timers.splice(i, 1)[0].fn; i--; f(); }
      const kc = 1 - Math.exp(-h * 2.4);
      camPos.lerp(goalPos, kc); camTgt.lerp(goalTgt, kc);
      if (stage === 'cut') updateCut(h); else if (stage === 'bake') updateBake(h); else if (stage === 'dec') updateDec(h);
      animate(h);
    };
    mg.addUpdate((dt) => {
      let rem = Math.min(dt, 0.1) * dbg.speed;
      while (rem > 1e-6) { const h = Math.min(rem, 1 / 60); step(h); rem -= h; }
    });

    mg.onDispose(() => {
      root.remove();
      for (const m of meshes) { m.geometry.dispose(); if (m.isInstancedMesh) m.dispose(); }
      meshes.length = 0;
      if (window.__cookies === dbg) delete window.__cookies;
      // ease the camera back out instead of snapping
      const p = camPos.clone().add(origin), t = camTgt.clone().add(origin);
      cam.playShot({ name: 'cookies-out', duration: 0.7, skippable: false, blendIn: 0.01, blendOut: 0.6, tilt: 0.55, post: CLOSE_POST, update(u, out) { out.pos.copy(p); out.target.copy(t); } });
    });

    // ---------------------------------------------------------------- go
    mg.hud.setScore(0);
    // props + camera hold already running; play the intro card over them
    await mg.intro();
    startRound(1);
  },
};
