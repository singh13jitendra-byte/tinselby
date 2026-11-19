// PACK THE SLEIGH (door 23): Auntie Noor and the elves hand you twelve knitted presents, one at a time. Each hangs from
// the candy-cane rail and slides left and right over Santa's sleigh; tap (Space / the big DROP button) to let it go. It snaps
// to the column under it and rests on the highest filled cell, so a wide present over uneven heights leaves a wobbly gap.
// A present that would stick out above the top row tumbles into the snow (no fail). Tidy rows sparkle, a perfect pack wins
// the big bow. ~60-75 s, one thumb. Rules, scoring and the bot live in logic.js (pure, also used by the Node sims).
// Budget: <= 14 draw calls (shadow passes included), ~12k tris at peak. Everything hangs under one group via mg.add().
// Debug: window.__pack = { state, grid, bot(mode), auto, ff(sec, step), budget(), log, result, finished, model }.
import * as THREE from 'three';
import { P } from '../../core/yarn.js';
import { box, rbox, cyl, dot, sph, torus, tube, xf, merge, KNIT, FELT, GLOW } from '../../core/prims.js';
import { ARENAS } from '../../core/layout.js';
import { isPortrait } from '../view.js';
import { COLS, ROWS, N, WIDTHS, createModel, createBot } from './logic.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ dimensions (local metres: x right, y up from the bed floor, z toward the camera)
const CW = 0.16, CH = 0.12; // cell width / height
const PW = CW - 0.012, PH = CH - 0.008, PD = 0.13; // present size per cell
const RAIL_Y = 0.58, HANG = 0.06; // rail height, drop of the cord
const GROUND = -0.121; // runner bottom
const SNOW_Y = -0.089; // snow top
const GRAV = 5.5;

const PAL = [
  ['#c23a33', '#efe1c6'], ['#3f8f8a', '#e8b84a'], ['#e8b84a', '#b8302d'], ['#e08aa5', '#efe1c6'],
  ['#4a8250', '#e3aa3a'], ['#efe1c6', '#b8302d'], ['#79a9d8', '#efe1c6'],
];
const palOf = (i) => PAL[(i * 3) % PAL.length];

const xOf = (u, w) => (u + w / 2 - COLS / 2) * CW; // present centre x for left edge u (cells)
const yOfRow = (r) => (r + 0.5) * CH;

// ------------------------------------------------------------------ geometry
function sleighGeo() {
  const g = [];
  const WOOD = '#a8753f', GOLD = '#e3aa3a', NAVY = '#2c4170';
  g.push(xf(rbox(0.92, 0.05, 0.27, 0.012, WOOD, KNIT, 1), [0, -0.025, 0]));
  g.push(xf(box(0.92, 0.022, 0.016, GOLD, KNIT), [0, -0.022, 0.135]));
  // back panel with stitched grid
  g.push(xf(rbox(0.92, 0.5, 0.03, 0.01, NAVY, KNIT, 1), [0, 0.25, -0.1]));
  for (let c = 0; c <= COLS; c++) g.push(xf(box(0.004, CH * ROWS, 0.003, '#c9b27a', FELT), [(c - COLS / 2) * CW, (CH * ROWS) / 2, -0.0835]));
  for (let r = 1; r <= ROWS; r++) g.push(xf(box(CW * COLS, 0.004, 0.003, '#c9b27a', FELT), [0, r * CH, -0.0835]));
  // low red end plates
  for (const s of [-1, 1]) g.push(xf(rbox(0.035, 0.2, 0.25, 0.012, P.red, KNIT, 1), [s * 0.4425, 0.1, 0]));
  // candy-cane posts and rail (striped cylinders)
  const SEG = 9, segH = RAIL_Y / SEG;
  for (const s of [-1, 1]) for (let k = 0; k < SEG; k++) g.push(xf(cyl(0.016, 0.016, segH * 1.001, 7, k % 2 ? P.cream : P.red, KNIT), [s * 0.43, segH * (k + 0.5), 0.02]));
  const RS = 15, rl = 0.88 / RS;
  for (let k = 0; k < RS; k++) g.push(xf(cyl(0.015, 0.015, rl * 1.001, 7, k % 2 ? P.cream : P.red, KNIT), [-0.44 + rl * (k + 0.5), RAIL_Y, 0.02], [0, 0, Math.PI / 2]));
  for (const s of [-1, 1]) g.push(xf(dot(0.026, GOLD, KNIT), [s * 0.43, RAIL_Y + 0.02, 0.02]));
  // warm bulbs along the top of the back panel + a garland thread
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = -0.4 + t * 0.8, y = 0.48 - 0.03 * Math.sin(t * Math.PI);
    g.push(xf(dot(0.017, i % 3 === 0 ? '#ffd27a' : i % 3 === 1 ? '#ff9a6a' : '#fff0b8', GLOW), [x, y, -0.07]));
  }
  g.push(tube([[-0.42, 0.485, -0.075], [0, 0.45, -0.075], [0.42, 0.485, -0.075]], 0.004, P.ink, KNIT, 14, 3));
  // runners with curled tips and struts
  for (const z of [-0.085, 0.085]) {
    g.push(tube([[-0.6, 0.0, z], [-0.56, -0.07, z], [-0.46, -0.1, z], [0.4, -0.105, z], [0.52, -0.095, z], [0.6, -0.04, z], [0.6, 0.03, z]], 0.016, GOLD, KNIT, 28, 5));
    for (const x of [-0.3, 0, 0.3]) g.push(xf(box(0.022, 0.07, 0.022, WOOD, KNIT), [x, -0.065, z]));
  }
  // snow patch + two lumps
  g.push(xf(sph(0.95, P.snow, FELT, 22, 4), [0, SNOW_Y - 0.0238, 0.06], null, [1, 0.025, 0.95]));
  for (const s of [-1, 1]) g.push(xf(dot(0.1, P.snow, FELT), [s * 0.78, SNOW_Y - 0.005, -0.12], null, [1.7, 0.55, 1.2]));
  return merge(g);
}

function bodyGeo(w) {
  const W = w * CW - 0.012;
  return rbox(W, PH, PD, 0.012, '#ffffff', FELT, 1);
}
function ribbonGeo(w) {
  const W = w * CW - 0.012, g = [];
  g.push(box(0.026, PH + 0.004, PD + 0.004, '#ffffff', KNIT));
  g.push(box(W + 0.004, 0.026, PD + 0.004, '#ffffff', KNIT));
  g.push(box(W + 0.004, PH + 0.004, 0.026, '#ffffff', KNIT));
  for (const s of [-1, 1]) g.push(xf(dot(0.019, '#ffffff', KNIT), [s * 0.02, PH / 2 + 0.008, 0], null, [1.2, 0.8, 1]));
  return merge(g);
}
function ghostGeo(w, color) {
  const W = w * CW - 0.004, H = PH + 0.004, t = 0.0055, g = [];
  g.push(xf(box(W, t, 0.004, color, GLOW), [0, H / 2, 0.07]), xf(box(W, t, 0.004, color, GLOW), [0, -H / 2, 0.07]));
  g.push(xf(box(t, H, 0.004, color, GLOW), [-W / 2, 0, 0.07]), xf(box(t, H, 0.004, color, GLOW), [W / 2, 0, 0.07]));
  return merge(g);
}
const beamGeo = () => xf(box(0.01, 1, 0.01, '#ffe29a', GLOW), [0, -0.5, 0.0]); // top at y 0, hangs down 1 unit
const hookGeo = () => merge([xf(box(0.05, 0.022, 0.045, '#e3aa3a', KNIT), [0, 0, 0]), xf(box(0.004, 0.05, 0.004, P.cream, KNIT), [0, -0.035, 0]), xf(dot(0.01, '#e3aa3a', KNIT), [0, -0.062, 0])]);
function bowGeo() {
  const g = [], R = '#c23a33', RD = '#8b2523', GOLD = '#e8b84a';
  for (const s of [-1, 1]) {
    g.push(xf(torus(0.07, 0.02, R, KNIT, TAU, 16, 6), [s * 0.085, 0.06, 0], [0, s * 0.45, s * 0.5], [1, 1.25, 0.65]));
    g.push(xf(box(0.05, 0.16, 0.012, RD, KNIT), [s * 0.04, -0.07, 0.01], [0, 0, s * 0.28]));
  }
  g.push(xf(dot(0.036, GOLD, KNIT), [0, 0.04, 0.02]));
  return merge(g);
}
const sparkGeo = () => box(0.016, 0.016, 0.004, '#ffffff', GLOW);

// ------------------------------------------------------------------ DOM
const CSS = `
.pk-root{position:absolute;inset:0;pointer-events:none;z-index:6}
.pk-drop{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
 min-width:min(60vw,280px);height:88px;border-radius:44px;border:4px dashed rgba(255,255,255,.75);outline:none;cursor:pointer;background:#b8302d;color:#fff;font:800 34px/1 var(--font,system-ui);letter-spacing:.08em;
 box-shadow:0 7px 0 #6e1a18,0 12px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:opacity .2s,background .15s}
.pk-drop small{font:600 12px/1 var(--font,system-ui);letter-spacing:.14em;opacity:.8;text-transform:uppercase}
.pk-drop.down{transform:translateX(-50%) translateY(5px);box-shadow:0 2px 0 #6e1a18;background:#c8403c}
.pk-drop.idle{opacity:.5}
.pk-drop.side{left:auto;right:calc(22px + env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:none;width:112px;min-width:0;height:112px;border-radius:50%;font-size:26px}
.pk-drop.side.down{transform:translateY(5px)}
@media (max-height:420px){.pk-drop.side{width:100px;height:100px;font-size:24px}}
.pk-next{position:absolute;left:50%;bottom:calc(122px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:14px;background:rgba(40,28,24,.55);color:#fff;font:700 11px/1 var(--font,system-ui);letter-spacing:.14em;text-transform:uppercase;min-height:34px}
.pk-next i{display:block;height:20px;border-radius:5px;border:2px solid rgba(255,255,255,.8);box-sizing:border-box;position:relative}
.pk-next i::after{content:'';position:absolute;left:50%;top:0;bottom:0;width:4px;margin-left:-2px;background:var(--rb)}
.pk-next.side{left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:none}
.pk-fb{position:absolute;left:50%;top:26%;transform:translateX(-50%);font:800 clamp(30px,6vw,52px)/1 var(--font,system-ui);color:#ffe29a;text-shadow:0 3px 0 #6e1a18,0 0 18px rgba(255,200,120,.6);letter-spacing:.04em;animation:pkFb 1.15s ease-out forwards;white-space:nowrap}
.pk-fb.bad{color:#ffd0c8}.pk-fb.ok{color:#fff}
.pk-fb small{display:block;text-align:center;font:700 clamp(13px,2.4vw,18px)/1.3 var(--font,system-ui);margin-top:4px;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.4)}
@keyframes pkFb{0%{opacity:0;transform:translateX(-50%) translateY(14px) scale(.7)}15%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.12)}30%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-26px)}}
@media (orientation:portrait){.pk-fb{top:19%;font-size:clamp(26px,9vw,42px)}}
`;
const ICON = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M6 14h36v4H6z" fill="#e3aa3a"/><rect x="9" y="18" width="30" height="16" rx="2" fill="#2c4170"/><rect x="11" y="22" width="8" height="10" fill="#c23a33"/><rect x="20" y="26" width="8" height="6" fill="#e8b84a"/><rect x="29" y="22" width="8" height="10" fill="#3f8f8a"/><path d="M4 40q20 6 38-2" stroke="#e3aa3a" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M9 14v-6M39 14v-6" stroke="#b8302d" stroke-width="3" stroke-linecap="round"/></svg>';

export default {
  id: 'pack',
  title: 'Pack the Sleigh',
  district: 'market',
  icon: ICON,
  intro: "Auntie Noor and the elves are loading Santa's sleigh! Tap DROP to let each present fall. Fill the bed snugly, finish tidy rows and leave no gaps.",
  async start(ctx, mg) {
    const { engine, cam, uiRoot } = ctx;
    const params = new URLSearchParams(location.search);
    const sfx = (n) => ctx.audio?.sfx?.(n);
    const A = ARENAS.pack;
    const showMarket = ctx.life?.hideDistrict ? ctx.life.hideDistrict('market') : () => {};
    mg.onDispose(showMarket);
    mg.setPlayerVisible(false);

    const model = createModel();
    let G = 0, started = false, endT = -1, endStage = 0, shownScore = 0, shownRows = 0, bot = null;
    const dbg = (window.__pack = {
      auto: params.has('mgauto'), mode: 'good', log: [], result: null, finished: false, model,
      bot(mode = 'good') { dbg.auto = true; dbg.mode = mode; bot = createBot(mode); return dbg; },
      get state() { return { phase: model.phase, idx: model.idx, w: model.w, u: +model.u.toFixed(3), col: model.col, score: model.score, cells: model.cells, gaps: model.gaps, rows: model.rows, tumbles: model.tumbles, dropped: model.dropped, perfect: model.perfect, stars: model.stars }; },
      get grid() { return { h: model.h.slice(), occ: model.occ.map((r) => r.slice()), cells: model.cells, gaps: model.gaps }; },
      drop() { return model.drop(); },
      get pres() { return pres.map((p) => ({ i: p.i, st: p.st, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), rot: +p.rot.toFixed(2) })); },
    });
    if (dbg.auto) bot = createBot('good');

    // ---------------------------------------------------------------- scene
    const group = mg.add(new THREE.Group());
    group.position.set(A.x, -GROUND, A.z);
    group.rotation.y = A.heading || 0;
    const geos = [], disposables = [];
    const meshes = [];
    const mk = (geo, { cast = false, vis = true, parent = group } = {}) => {
      geos.push(geo);
      const m = new THREE.Mesh(geo, engine.mat);
      m.castShadow = cast; m.receiveShadow = cast; m.visible = vis; m.frustumCulled = false;
      parent.add(m); meshes.push(m);
      return m;
    };
    const mkInst = (geo, n, { cast = true } = {}) => {
      geos.push(geo);
      const im = new THREE.InstancedMesh(geo, engine.mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false;
      const m4 = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color('#ffffff');
      for (let i = 0; i < n; i++) { im.setMatrixAt(i, m4); im.setColorAt(i, c); }
      group.add(im); meshes.push(im); disposables.push(im);
      return im;
    };
    mk(sleighGeo(), { cast: true });
    const bodies = [mkInst(bodyGeo(1), N), mkInst(bodyGeo(2), N)];
    const ribbons = [mkInst(ribbonGeo(1), N), mkInst(ribbonGeo(2), N)];
    const ghosts = [1, 2].map((w) => [mk(ghostGeo(w, '#ffe29a'), { vis: false }), mk(ghostGeo(w, '#ff9a8a'), { vis: false })]);
    const beam = mk(beamGeo(), { vis: false });
    const hook = mk(hookGeo(), { vis: false });
    const bow = mk(bowGeo(), { cast: true, vis: false });
    bow.position.set(0, RAIL_Y + 0.07, 0.06);
    const NSP = 40;
    const sparks = mkInst(sparkGeo(), NSP, { cast: false });
    sparks.visible = false;

    // ---------------------------------------------------------------- per-present animation state
    const m4 = new THREE.Matrix4(), mT = new THREE.Matrix4(), mR = new THREE.Matrix4(), mS = new THREE.Matrix4(), mO = new THREE.Matrix4(), col = new THREE.Color();
    const pres = WIDTHS.map((w, i) => {
      const [bc, rc] = palOf(i);
      bodies.forEach((im, k) => im.setColorAt(i, col.set(bc))); // colour on both (the unused width stays scaled to 0)
      ribbons.forEach((im) => im.setColorAt(i, col.set(rc)));
      return { i, w, on: false, st: 'off', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vrot: 0, rest: 0, wob: 0, wobT: 0, sq: 0, spawn: 1, res: null, tx: 0, ty: 0, tumble: false, ground: false };
    });
    bodies.forEach((im) => { im.instanceColor.needsUpdate = true; });
    ribbons.forEach((im) => { im.instanceColor.needsUpdate = true; });
    const spk = Array.from({ length: NSP }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, rot: 0, vr: 0 }));

    const writePres = (p) => {
      const k = p.w - 1;
      const ib = bodies[k], ir = ribbons[k];
      if (!p.on) { mO.makeScale(0, 0, 0); ib.setMatrixAt(p.i, mO); ir.setMatrixAt(p.i, mO); return; }
      // pivot at the bottom centre: translate(bottom) · Rz · S · translate(0, half height)
      const sx = 1 + p.sq * 0.18, sy = 1 - p.sq * 0.28, sp = p.spawn < 1 ? 0.2 + 0.8 * (1 + 2.2 * (p.spawn - 1) ** 3 + 1.2 * (p.spawn - 1) ** 2) : 1;
      const tum = p.st === 'tumble'; // tumbling presents spin about their centre, the rest pivot on their bottom edge
      mT.makeTranslation(p.x, tum ? p.y : p.y - PH / 2, p.z);
      mR.makeRotationZ(p.rot + p.rest + p.wob * Math.sin(p.wobT * 17) * Math.exp(-p.wobT * 3.2));
      mS.makeScale(sx * sp, sy * sp, sp);
      mO.makeTranslation(0, tum ? 0 : PH / 2, 0);
      m4.copy(mT).multiply(mR).multiply(mS).multiply(mO);
      ib.setMatrixAt(p.i, m4); ir.setMatrixAt(p.i, m4);
    };
    const flushPres = () => {
      for (const p of pres) writePres(p);
      for (const im of [...bodies, ...ribbons]) im.instanceMatrix.needsUpdate = true;
    };

    // ---------------------------------------------------------------- DOM
    const root = document.createElement('div');
    root.className = 'pk-root';
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    uiRoot.appendChild(root);
    const coarse = matchMedia('(pointer:coarse)').matches;
    const btn = document.createElement('button');
    btn.className = 'pk-drop idle';
    btn.tabIndex = -1;
    btn.innerHTML = 'DROP' + (coarse ? '' : '<small>or press Space</small>');
    root.appendChild(btn);
    const nextEl = document.createElement('div');
    nextEl.className = 'pk-next';
    root.appendChild(nextEl);
    const sideBtn = () => !isPortrait() && (innerHeight <= 520 || coarse);
    const applyLayout = () => { btn.classList.toggle('side', sideBtn()); nextEl.classList.toggle('side', !isPortrait()); };
    const renderNext = () => {
      nextEl.innerHTML = 'Next';
      for (let k = model.idx + 1; k <= model.idx + 3 && k < N; k++) {
        const e = document.createElement('i');
        const [bc, rc] = palOf(k);
        e.style.width = WIDTHS[k] * 20 + 'px'; e.style.background = bc; e.style.setProperty('--rb', rc);
        nextEl.appendChild(e);
      }
      nextEl.hidden = model.idx + 1 >= N;
    };
    const feedback = (text, tone, sub = '') => {
      root.querySelectorAll('.pk-fb').forEach((e) => e.remove());
      const f = document.createElement('div');
      f.className = 'pk-fb ' + tone;
      f.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
      root.appendChild(f);
      setTimeout(() => f.remove(), 1200);
    };
    const hud = () => {
      mg.hud.setScore(shownScore, 'Score');
      mg.hud.setGoal(`Present ${Math.min(model.idx + 1, N)}/${N} · Neat rows ${shownRows}/${ROWS}`);
    };

    // ---------------------------------------------------------------- camera
    const CLOSE_POST = { bloom: 0.38, glow: 0.55, threshold: 0.35, band: 0.8, falloff: 0.5 };
    let portrait = isPortrait();
    const camPose = (out) => {
      const c = engine.camera;
      const th = Math.tan((c.fov * D2R) / 2), asp = Math.max(0.2, c.aspect);
      const side = sideBtn();
      portrait = isPortrait();
      // free screen fractions: HUD above, DROP pill + next strip below (portrait / desktop) or a side circle (landscape phones)
      const top = portrait ? 0.17 : side ? 0.2 : 0.15, bot = portrait ? 0.24 : side ? 0.06 : 0.27;
      const halfW = portrait ? 0.57 : 0.66, halfH = 0.44, cy = 0.27; // polish: portrait is width-bound, so a slimmer margin = a bigger sleigh
      const pr = (portrait ? 20 : 16) * D2R;
      const dist = Math.max(halfH / ((1 - top - bot) * th), halfW / (th * asp), 1.0);
      const shift = (top - bot) * dist * th;
      const y0 = -GROUND + cy;
      out.pos.set(A.x, y0 + Math.sin(pr) * dist, A.z + Math.cos(pr) * dist);
      out.target.set(A.x, y0 + Math.cos(pr) * shift, A.z - Math.sin(pr) * shift);
    };
    cam.setMode('close');
    cam.playShot({ name: 'pack', duration: 900, skippable: false, blendIn: 1.0, blendOut: 0.6, tilt: 0.12, post: CLOSE_POST, portrait: false, update(u, out) { camPose(out); } });
    applyLayout();

    // ---------------------------------------------------------------- effects
    const burstRow = (r) => {
      const colors = ['#ffe29a', '#fff0b8', '#ffb08a', '#e8b84a'];
      for (let k = 0; k < 18; k++) {
        const s = spk.find((x) => !x.on); if (!s) break;
        s.on = true; s.x = (Math.random() - 0.5) * CW * COLS; s.y = yOfRow(r); s.z = 0.075;
        s.vx = (Math.random() - 0.5) * 0.5; s.vy = 0.25 + Math.random() * 0.5; s.vz = 0.15 + Math.random() * 0.3; s.life = 0.9 + Math.random() * 0.5; s.rot = Math.random() * 6; s.vr = (Math.random() - 0.5) * 12;
        s.c = colors[k % colors.length];
      }
    };
    const burstBow = () => {
      for (let k = 0; k < NSP; k++) {
        const s = spk[k]; s.on = true; s.x = (Math.random() - 0.5) * 0.3; s.y = RAIL_Y + 0.08; s.z = 0.1;
        s.vx = (Math.random() - 0.5) * 0.9; s.vy = 0.3 + Math.random() * 0.7; s.vz = 0.1 + Math.random() * 0.4; s.life = 1.0 + Math.random() * 0.8; s.rot = 0; s.vr = (Math.random() - 0.5) * 12; s.c = ['#ffe29a', '#fff0b8', '#ff9a8a', '#e8b84a'][k % 4];
      }
    };
    let sparkDirty = false;
    const stepSparks = (h) => {
      let any = false;
      for (let k = 0; k < NSP; k++) {
        const s = spk[k];
        if (s.on) {
          s.life -= h; s.vy -= 1.2 * h; s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h; s.rot += s.vr * h;
          if (s.life <= 0) s.on = false;
        }
        if (s.on || sparkDirty) {
          if (s.on) {
            mO.makeRotationZ(s.rot); mO.setPosition(s.x, s.y, s.z); const sc = clamp(s.life * 2, 0, 1); mT.makeScale(sc, sc, sc); m4.copy(mO).multiply(mT);
            sparks.setMatrixAt(k, m4); sparks.setColorAt(k, col.set(s.c));
          } else { mO.makeScale(0, 0, 0); sparks.setMatrixAt(k, mO); }
          any = true;
        }
      }
      if (any) { sparks.instanceMatrix.needsUpdate = true; if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true; }
      sparkDirty = spk.some((s) => s.on);
      sparks.visible = sparkDirty || any;
    };

    // ---------------------------------------------------------------- drop handling
    const spawn = (i) => {
      const p = pres[i];
      p.on = true; p.st = 'rail'; p.spawn = 0; p.rot = 0; p.rest = 0; p.wob = 0; p.sq = 0;
      hook.visible = true; sfx('pop');
      renderNext(); hud();
    };
    const onDropped = (res) => {
      const p = pres[res.i];
      p.st = 'fall'; p.res = res; p.vy = -0.05; p.vx = 0; p.tumble = res.tumble;
      p.tx = xOf(res.col, res.w);
      p.ty = yOfRow(res.row);
      p.wobT = 99;
      hook.visible = false;
      ghosts.flat().forEach((g) => { g.visible = false; }); beam.visible = false;
      dbg.log.push({ i: res.i, col: res.col, row: res.row, gaps: res.gaps, tumble: res.tumble, pts: res.pts, t: +G.toFixed(2) });
    };
    const rawDrop = model.drop;
    model.drop = () => { const r = rawDrop(); if (r) onDropped(r); return r; };
    const land = (p) => {
      const res = p.res;
      sfx('drop');
      p.sq = 1; p.wobT = 0;
      if (res.tumble) {
        p.st = 'tumble'; p.vy = 0.55; p.vx = res.dir * 0.36; p.vz = 0.4; p.vrot = -res.dir * 6.5; p.ground = false;
        feedback('Oops!', 'bad', 'It tumbles into the snow');
        return;
      }
      p.st = 'rest'; p.y = p.ty; p.x = p.tx; p.z = 0;
      p.wob = res.gaps ? 0.18 + 0.05 * res.gaps : 0.07;
      p.rest = res.gaps ? clamp(-0.05 * res.tilt, -0.1, 0.1) : 0;
      shownScore = runningScore();
      shownRows = model.rows;
      hud();
      if (res.rowsDone.length) { burstRow(res.row); sfx('bell'); feedback('Neat!', 'great', `Row complete +25 · +${res.pts - 25}`); }
      else if (res.gaps) { feedback('Wobbly', 'ok', `${res.gaps} gap${res.gaps > 1 ? 's' : ''} · ${res.pts}`); }
      else feedback('Snug', 'ok', `+${res.pts}`);
    };
    // score shown = everything resolved by landed presents
    const runningScore = () => { let s = 0; for (const r of dbg.log) { if (pres[r.i].st === 'rest' || pres[r.i].st === 'tumble') s += r.pts; } return Math.max(0, s); };

    // ---------------------------------------------------------------- input
    let down = false;
    const doDrop = () => { if (!started || endT >= 0 || model.phase !== 'slide') return; if (model.t < 0.12) return; model.drop(); };
    const onDown = (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.add('down'); down = true; doDrop(); };
    const onUp = () => { btn.classList.remove('down'); down = false; };
    btn.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    mg.onTap(() => doDrop());
    mg.onKey((e) => { if (e.repeat) return; if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); doDrop(); } });
    mg.onDispose(() => { window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); });

    // ---------------------------------------------------------------- per-step
    const animate = (h) => {
      // the sliding present
      if (model.phase === 'slide' && started) {
        const p = pres[model.idx];
        p.spawn = Math.min(1, p.spawn + h / 0.3);
        p.x = xOf(model.u, p.w); p.y = RAIL_Y - HANG - PH / 2; p.z = 0;
        hook.position.set(p.x, RAIL_Y, 0);
        hook.visible = true;
        // landing aid
        const pr = model.probe(model.col, p.w);
        const gi = ghosts[p.w - 1], on = pr.tumble ? 1 : 0;
        gi[on].visible = true; gi[1 - on].visible = false;
        const gy = yOfRow(pr.row);
        gi[on].position.set(xOf(pr.col, p.w), gy, 0);
        const top = gy + PH / 2 + 0.004, bottom = p.y - PH / 2;
        beam.visible = !pr.tumble && bottom > top + 0.01;
        if (beam.visible) { beam.position.set(xOf(pr.col, p.w), bottom, 0.0); beam.scale.set(1, bottom - top, 1); }
        btn.classList.remove('idle');
      } else btn.classList.add('idle');

      for (const p of pres) {
        if (!p.on) continue;
        if (p.st === 'fall') {
          p.vy -= GRAV * h; p.y += p.vy * h;
          p.x += (p.tx - p.x) * Math.min(1, h * 22); // snap to the column
          p.rot *= 1 - Math.min(1, h * 10);
          if (p.y <= p.ty) { p.y = p.ty; p.x = p.tx; land(p); }
        } else if (p.st === 'tumble') {
          p.sq = Math.max(0, p.sq - h * 4);
          p.vy -= GRAV * h; p.y += p.vy * h; p.x += p.vx * h; p.z += p.vz * h; p.rot += p.vrot * h;
          const gy = SNOW_Y + PH / 2 + 0.002 + 0.004;
          if (p.y <= gy) {
            p.y = gy;
            if (!p.ground) { p.ground = true; p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.35; p.vz *= 0.3; p.vrot *= 0.4; sfx('pop'); }
            else { p.vy = 0; p.vx *= 1 - Math.min(1, h * 9); p.vz *= 1 - Math.min(1, h * 9); const goal = Math.round(p.rot / Math.PI) * Math.PI; p.rot += (goal - p.rot) * Math.min(1, h * 10); p.vrot *= 1 - Math.min(1, h * 10); }
          }
        } else if (p.st === 'rest') {
          p.wobT += h; p.sq = Math.max(0, p.sq - h * 5);
        }
        if (p.st !== 'fall') p.spawn = 1;
      }
      flushPres();
      stepSparks(h);
      // bow
      if (endStage >= 2) {
        const t = Math.min(1, (G - bowAt) / 0.7), s = (t <= 0 ? 0 : 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2) * 1.3;
        bow.visible = t > 0; bow.scale.setScalar(Math.max(0.001, s));
        bow.rotation.z = Math.sin(G * 2.2) * 0.04;
      }
    };
    let bowAt = 0;
    const step = (h) => {
      G += h;
      if (started) {
        if (endT < 0) {
          const before = model.phase;
          if (dbg.auto && bot) bot.tick(model, h);
          model.step(h);
          if (before === 'settle' && model.phase === 'slide') spawn(model.idx);
          else if (before === 'settle' && model.phase === 'end') { endT = 0; hud(); }
        } else {
          endT += h;
          if (endStage === 0 && endT > 0.55) {
            endStage = 1;
            shownScore = Math.max(0, model.score); hud();
            if (model.perfect) feedback('Perfect pack!', 'great', '+50');
            else feedback('All packed!', 'ok', `${model.cells} of ${COLS * ROWS} cells`);
            sfx('bell');
          }
          if (endStage === 1 && endT > 1.2) { endStage = 2; bowAt = G; burstBow(); sfx('gift'); try { ctx.life?.cheer?.(); } catch (e) { sfx('cheer'); } }
          if (endStage === 2 && endT > 3.3) { endStage = 3; finish(); }
        }
      }
      animate(h);
    };
    const finish = () => {
      const stars = model.stars, text = `${model.cells} of ${COLS * ROWS} cells packed, ${model.rows} neat row${model.rows === 1 ? '' : 's'}${model.perfect ? ' and a perfect pack. Santa is thrilled!' : '.'}`;
      dbg.finished = true; dbg.result = { score: model.score, stars, cells: model.cells, rows: model.rows, gaps: model.gaps, tumbles: model.tumbles, perfect: model.perfect };
      mg.finish({ score: model.score, stars, text });
    };
    let wasPortrait = portrait;
    mg.addUpdate((dt) => {
      if (isPortrait() !== wasPortrait) { wasPortrait = isPortrait(); applyLayout(); }
      applyLayout();
      let rem = Math.min(dt, 0.1);
      while (rem > 1e-6) { const h = Math.min(rem, 1 / 60); step(h); rem -= h; }
    });
    dbg.ff = (sec, h = 1 / 30) => { for (let i = 0, n = Math.round(sec / h); i < n && !dbg.finished; i++) step(h); return dbg.state; };
    dbg.budget = () => {
      let calls = 0, tris = 0;
      group.traverseVisible((o) => {
        if (!o.isMesh) return;
        let n = o.geometry.attributes.position.count / 3;
        if (o.isInstancedMesh) {
          const list = o === bodies[0] || o === ribbons[0] ? pres.filter((p) => p.on && p.w === 1) : o === bodies[1] || o === ribbons[1] ? pres.filter((p) => p.on && p.w === 2) : spk.filter((s) => s.on);
          n *= list.length; if (!list.length) return;
        }
        const passes = o.castShadow ? 2 : 1;
        calls += passes; tris += n * passes;
      });
      return { calls, tris: Math.round(tris) };
    };

    mg.onDispose(() => {
      root.remove();
      for (const im of disposables) im.dispose();
      for (const g of geos) g.dispose();
      meshes.length = 0;
      if (window.__pack === dbg) delete window.__pack;
      const p = new V3(), t = new V3();
      camPose({ pos: p, target: t });
      cam.playShot({ name: 'pack-out', duration: 0.7, skippable: false, blendIn: 0.01, blendOut: 0.6, tilt: 0.12, post: CLOSE_POST, portrait: false, update(u, out) { out.pos.copy(p); out.target.copy(t); } });
    });

    // ---------------------------------------------------------------- go
    hud();
    renderNext();
    flushPres();
    await mg.intro();
    started = true;
    spawn(0);
  },
};
