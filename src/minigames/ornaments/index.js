// ORNAMENT HUNT (door 6): five knitted ornaments hidden around Market Square. Walk, follow the warm/cold radar and the chime,
// pick them up before the 90 s run out. Everything is registered through mg so dispose removes meshes, spots and DOM.
import * as THREE from 'three';
import { cone, cyl, sph, dot, rbox, torus, extrude, tube, xf, merge, poly, starPts, recolor, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';
import { P, mulberry32 } from '../../core/yarn.js';
import { ARENAS } from '../../core/layout.js';
import { SPOTS } from './clues.js';
import { TIME, BEAM_T, SHOW_T, SHOW_COST, SEE, PICK_R, heat, heatWord, pulsePeriod, scoreFor, starsFor } from './rules.js';

// Small inline SVG tray icons (no emoji fonts: they render differently on every phone).
const ORN_SVG = {
  bauble: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="10" y="2.5" width="4" height="3" rx="1" fill="#e3aa3a"/><circle cx="12" cy="14" r="8" fill="#b8302d"/><path d="M5 13c3 2 11 2 14 0" stroke="#fff4e2" stroke-width="1.6" fill="none"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8 6.2 20l1.4-6.4L2.7 9.2l6.5-.7z" fill="#e3aa3a" stroke="#b07b1c" stroke-width="1"/></svg>',
  stocking: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="7" y="2.5" width="9" height="4" rx="1.2" fill="#fff4e2"/><path d="M8 6.5h7v8l3.5 3a3 3 0 0 1-2 5.2H11a4 4 0 0 1-4-4V6.5z" fill="#b8302d"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3a6 6 0 0 1 6 6v5l2 3H4l2-3V9a6 6 0 0 1 6-6z" fill="#e3aa3a" stroke="#b07b1c" stroke-width="1"/><circle cx="12" cy="19.5" r="2" fill="#b07b1c"/><path d="M9 4.5l-2-1.5M15 4.5l2-1.5" stroke="#3f6e45" stroke-width="2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="#fff4e2" stroke="#b8302d" stroke-width="2"/><path d="M8 9.5l8 6M10 8l7 5" stroke="#b8302d" stroke-width="1.6"/></svg>',
};

const SIZE = 1.35;

// ------------------------------------------------------------------ ornament models (each ONE merged geometry, ~0.26 tall, centred)
const loop = (y, c = P.gold) => xf(torus(0.03, 0.009, c, GLOSS, Math.PI * 2, 10), [0, y, 0], [0, 0, 0]);
const ORN = [
  { name: 'bauble', icon: 'bauble', make: () => merge([
    sph(0.12, P.red, KNIT, 16, 12), xf(torus(0.122, 0.014, P.cream, KNIT, Math.PI * 2, 18), [0, 0, 0], [Math.PI / 2, 0, 0]),
    xf(torus(0.1, 0.012, P.cream, KNIT, Math.PI * 2, 18), [0, 0.04, 0], [Math.PI / 2, 0, 0], [0.8, 0.8, 1]),
    dot(0.03, P.glowSoft, GLOW).applyMatrix4(new THREE.Matrix4().makeTranslation(0.05, 0.06, 0.1)),
    xf(cyl(0.04, 0.045, 0.045, 10, P.gold, GLOSS), [0, 0.135, 0]), loop(0.19)]) },
  { name: 'star', icon: 'star', make: () => merge([
    xf(extrude(poly(starPts(0.15, 0.07)), 0.05, P.gold, FELT), [0, -0.01, -0.025]),
    xf(extrude(poly(starPts(0.09, 0.045)), 0.012, P.glowSoft, GLOW), [0, -0.01, 0.024]),
    xf(extrude(poly(starPts(0.09, 0.045)), 0.012, P.glowSoft, GLOW), [0, -0.01, -0.036]),
    loop(0.19)]) },
  { name: 'stocking', icon: 'stocking', make: () => merge([
    xf(rbox(0.1, 0.2, 0.07, 0.025, P.red, KNIT), [-0.01, 0.02, 0]),
    xf(rbox(0.17, 0.09, 0.07, 0.03, P.red, KNIT), [0.04, -0.09, 0]),
    xf(rbox(0.115, 0.06, 0.085, 0.02, P.cream, FELT), [-0.01, 0.13, 0]),
    xf(rbox(0.07, 0.05, 0.075, 0.02, P.green, KNIT), [0.095, -0.1, 0]),
    xf(rbox(0.06, 0.05, 0.075, 0.02, P.green, KNIT), [-0.03, -0.1, 0]),
    xf(dot(0.02, P.glowSoft, GLOW), [0.03, 0.04, 0.04]),
    loop(0.19, P.gold)]) },
  { name: 'bell', icon: 'bell', make: () => merge([
    xf(cyl(0.05, 0.125, 0.19, 14, P.teal, KNIT), [0, 0.01, 0]),
    xf(sph(0.05, P.teal, KNIT, 12, 8), [0, 0.105, 0]),
    xf(torus(0.125, 0.016, P.gold, GLOSS, Math.PI * 2, 18), [0, -0.085, 0], [Math.PI / 2, 0, 0]),
    xf(torus(0.088, 0.01, P.cream, KNIT, Math.PI * 2, 16), [0, 0.02, 0], [Math.PI / 2, 0, 0]),
    xf(dot(0.032, P.glow, GLOW), [0, -0.1, 0]), loop(0.19)]) },
  { name: 'candy heart', icon: 'heart', make: () => {
    const pts = [];
    for (let i = 0; i < 20; i++) {
      const t = (i / 20) * Math.PI * 2, s = Math.sin(t);
      pts.push([0.0085 * 16 * s * s * s, 0.0085 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 0.01, 0]);
    }
    const t = tube(pts, 0.026, P.red, KNIT, 40, 6, true);
    recolor(t, (i) => (Math.floor(i / 36 / 3) % 2 ? new THREE.Color(P.cream) : null));
    return merge([t, xf(dot(0.02, P.glowSoft, GLOW), [0, 0.1, 0.03]), loop(0.2)]);
  } },
];

function sparkleGeo() {
  const g = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, h = 0.25 + i * 0.2, r = 0.09 * (1 - i / 14);
    g.push(xf(dot(0.028 - i * 0.002, i % 2 ? P.glowSoft : P.glow, GLOW), [Math.cos(a) * r, h, Math.sin(a) * r]));
  }
  g.push(xf(extrude(poly(starPts(0.07, 0.025, 4)), 0.01, P.glowSoft, GLOW), [0, 1.85, -0.005]));
  g.push(xf(extrude(poly(starPts(0.07, 0.025, 4)), 0.01, P.glowSoft, GLOW), [0, 1.85, -0.005], [0, Math.PI / 2, 0]));
  return merge(g);
}

// Hint beam: a helix of glowing beads and little four-point stars (3.6 m, so it clears the clue card on phones) over two flat halo rings
// that read from the high follow camera even when the spot is behind a stall.
function beamGeo() {
  const g = [], H = 3.8;
  for (let i = 0; i < 22; i++) {
    const t = i / 21, a = i * 0.95, r = 0.3 * (1 - t * 0.45), h = 0.2 + t * H;
    g.push(xf(dot(0.12 - t * 0.05, i % 2 ? P.glowSoft : P.glow, GLOW), [Math.cos(a) * r, h, Math.sin(a) * r]));
  }
  for (const [h, s] of [[1.0, 0.3], [2.0, 0.36], [3.0, 0.42], [H + 0.6, 0.62]]) {
    g.push(xf(extrude(poly(starPts(s, s * 0.36, 4)), 0.03, P.glowSoft, GLOW), [0, h, -0.015]));
    g.push(xf(extrude(poly(starPts(s, s * 0.36, 4)), 0.03, P.glowSoft, GLOW), [0, h, -0.015], [0, Math.PI / 2, 0]));
  }
  g.push(xf(torus(0.85, 0.07, P.glow, GLOW, Math.PI * 2, 28), [0, 0.06, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(torus(0.5, 0.055, P.glowSoft, GLOW, Math.PI * 2, 24), [0, 0.07, 0], [Math.PI / 2, 0, 0]));
  return merge(g);
}

const CSS = `
.orn-hud{position:absolute;inset:0;pointer-events:none;font-family:var(--font,sans-serif);color:var(--ink,#4a2e22)}
.orn-card{position:absolute;left:50%;transform:translateX(-50%);top:calc(10px + var(--safe-t,0px));width:min(440px,calc(100vw - 240px));box-sizing:border-box;padding:8px 14px 9px;border-radius:18px;outline-offset:-6px}
.orn-top{display:flex;align-items:center;gap:8px}
.orn-ic{flex:none;width:34px;height:34px;border-radius:50%;background:rgba(227,170,58,.28);box-shadow:inset 0 0 0 2px rgba(92,58,38,.35);display:grid;place-items:center}
.orn-ic svg,.orn-slot svg{width:80%;height:80%;display:block}
.orn-tt{flex:1;min-width:0}
.orn-name{display:block;font:700 16px/1.1 var(--font)}
.orn-sub{display:block;font:600 11px/1.2 var(--font);opacity:.72;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orn-sub.good{color:#2f7a3a;opacity:1}.orn-sub.glow{color:#b8651c;opacity:1}
.orn-tray{display:flex;gap:5px;flex:none}
.orn-slot{all:unset;box-sizing:border-box;width:30px;height:30px;border-radius:50%;background:rgba(92,58,38,.14);box-shadow:inset 0 0 0 2px rgba(92,58,38,.3);display:grid;place-items:center;cursor:pointer;pointer-events:auto;position:relative}
.orn-slot svg{opacity:.38;filter:grayscale(.7)}
.orn-slot.cur{box-shadow:inset 0 0 0 3px #b8302d,0 0 0 2px rgba(255,244,226,.9);background:rgba(227,170,58,.3)}
.orn-slot.cur svg{opacity:.95;filter:none}
.orn-slot.on{background:rgba(110,170,100,.4);box-shadow:inset 0 0 0 2px #3f8a47}
.orn-slot.on svg{opacity:1;filter:none;animation:ornPop .5s ease both}
.orn-slot.on::after{content:'';position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;background:#3f8a47 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 6.3l2 2 4-4.4' stroke='%23fff' stroke-width='1.8' fill='none'/%3E%3C/svg%3E") center/100% no-repeat}
@keyframes ornPop{0%{transform:scale(0) rotate(-40deg)}60%{transform:scale(1.5) rotate(10deg)}100%{transform:scale(1) rotate(0)}}
.orn-riddle{margin:6px 0 0;font:600 14.5px/1.3 var(--font);font-style:italic}
.orn-riddle span{display:block}.orn-riddle b{font-style:normal;color:#b8302d}
.orn-heat{display:flex;align-items:center;gap:9px;margin-top:7px}
.orn-ring{position:relative;flex:none;width:26px;height:26px}
.orn-ring i,.orn-ring u{position:absolute;border-radius:50%}
.orn-ring i{left:7px;top:7px;width:12px;height:12px;background:var(--heat,#6f9bd1)}
.orn-ring u{inset:0;border:3px solid var(--heat,#6f9bd1);opacity:0}
.orn-bar{position:relative;flex:1;height:12px;border-radius:8px;background:linear-gradient(90deg,#6f9bd1,#9fc3d8 28%,#efe1c6 50%,#e3aa3a 74%,#d6362b);box-shadow:inset 0 0 0 2px rgba(60,40,30,.35)}
.orn-bar i{position:absolute;top:-4px;width:8px;height:20px;margin-left:-4px;border-radius:5px;background:#fff;border:2px solid #5c3a26;transition:left .25s}
.orn-word{flex:none;min-width:92px;text-align:right;font:800 17px/1 var(--font);color:var(--heat,#6f9bd1);text-shadow:0 1px 0 rgba(255,255,255,.7)}
.orn-show{all:unset;box-sizing:border-box;flex:none;pointer-events:auto;cursor:pointer;padding:6px 11px;border-radius:14px;background:#b8302d;color:#fff4e2;font:700 13px/1.1 var(--font);box-shadow:0 3px 0 #7d1f1d;animation:ornNudge 1.4s ease-in-out infinite}
.orn-show small{font-size:10px;opacity:.85;margin-left:3px}
.orn-show:active{transform:translateY(2px)}
.orn-show[hidden]{display:none}
@keyframes ornNudge{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
.orn-pin{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;pointer-events:none;display:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
.orn-pin svg{width:100%;height:100%;animation:ornBob .7s ease-in-out infinite alternate}
@keyframes ornBob{from{transform:translateY(-6px)}to{transform:translateY(5px)}}
@media (orientation:portrait){
  .orn-card{top:calc(66px + var(--safe-t,0px));width:min(92vw,380px);padding:7px 12px 8px}
  .orn-top{flex-wrap:wrap}
  .orn-tray{order:-1;width:100%;justify-content:center;margin-bottom:5px}
  .orn-riddle{font-size:13.5px;line-height:1.27;margin-top:5px}
  .orn-word{min-width:84px;font-size:16px}
}
@media (max-height:420px) and (orientation:landscape){
  .orn-card{padding:6px 12px 7px;width:min(430px,calc(100vw - 230px))}
  .orn-ic{width:28px;height:28px}.orn-slot{width:25px;height:25px}
  .orn-name{font-size:15px}.orn-riddle{font-size:13.5px;margin-top:4px}.orn-heat{margin-top:5px}
}
@media (max-width:359px){.orn-name{font-size:14.5px}.orn-riddle{font-size:12.5px}}
`;

const lerp = (a, b, t) => a + (b - a) * t;
const HEAT_STOPS = [[111, 155, 209], [227, 170, 58], [214, 54, 43]]; // cold blue, warm amber, hot red
function heatCss(w) {
  const k = w < 0.5 ? w * 2 : (w - 0.5) * 2, A = HEAT_STOPS[w < 0.5 ? 0 : 1], B = HEAT_STOPS[w < 0.5 ? 1 : 2];
  return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`;
}
const ARROW = '<svg viewBox="0 0 44 44"><path d="M22 40L6 18h9V5h14v13h9z" fill="#e3aa3a" stroke="#fff4e2" stroke-width="3" stroke-linejoin="round"/><path d="M22 40L6 18h9V5h14v13h9z" fill="none" stroke="#b8302d" stroke-width="1.6" stroke-linejoin="round" transform="translate(0 0)"/></svg>';

export default {
  id: 'ornaments', title: 'Ornament Hunt', district: 'market',
  intro: 'Mr Pine hid five knitted ornaments, and left a riddle for each. Read the clue, find the landmark, and follow the Cold-to-Hot meter. Stuck? A sparkle beam rises after a while. Press E or tap Pick up. 105 seconds!',
  async start(ctx, mg, opts = {}) {
    const { engine, colliders, interact, player, audio, cam } = ctx;
    const A = ARENAS.ornaments;
    const seed = opts.seed ?? (Number(new URLSearchParams(location.search).get('seed')) || ((Math.random() * 1e9) | 0));
    const rnd = mulberry32(seed);
    const START = { x: 0, z: 3.6 };

    // ---------------------------------------------------------------- choose + validate spots
    const tmp = new THREE.Vector3();
    const valid = [], report = [];
    for (const sp of SPOTS) {
      const { x, z } = sp;
      let ok = false, why = '';
      tmp.set(x, 0, z);
      colliders.resolve(tmp, 0.25);
      if (Math.hypot(tmp.x - x, tmp.z - z) > 0.5) why = 'buried in a prop';
      else if (Math.abs(tmp.x - A.x) > 6.3 || Math.abs(tmp.z - A.z) > 5.6) why = 'outside the plaza'; // the square is a 12.4 x 10.8 rectangle
      else {
        for (let k = 0; k < 8 && !ok; k++) { // is there a free spot to stand within pick-up range?
          const a = (k / 8) * Math.PI * 2;
          const q = new THREE.Vector3(tmp.x + Math.cos(a) * 0.7, 0, tmp.z + Math.sin(a) * 0.7);
          colliders.resolve(q, 0.25);
          if (Math.hypot(q.x - tmp.x - Math.cos(a) * 0.7, q.z - tmp.z - Math.sin(a) * 0.7) < 0.03 && Math.hypot(q.x - tmp.x, q.z - tmp.z) < 0.95) ok = true;
        }
        if (!ok) why = 'no standing room';
      }
      report.push({ id: sp.id, ok, why });
      if (ok) valid.push({ ...sp, x: tmp.x, z: tmp.z });
    }
    const pool = valid.length >= 5 ? valid : SPOTS.map((s) => ({ ...s }));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let chosen = [];
    for (const minD of [3.2, 2.2, 0]) { // spread them out, relax if needed
      for (const s of pool) if (chosen.length < 5 && !chosen.includes(s) && chosen.every((c) => Math.hypot(c.x - s.x, c.z - s.z) >= minD)) chosen.push(s);
      if (chosen.length >= 5) break;
    }
    // hunting order: first clue is never right next to the start; then a loose nearest-neighbour walk (less back and forth)
    {
      const far = chosen.filter((s) => Math.hypot(s.x - START.x, s.z - START.z) >= 4.5);
      const rest = chosen.slice(); const order = [];
      let cur = START;
      const pick = (list) => list.reduce((b, s) => (Math.hypot(s.x - cur.x, s.z - cur.z) < Math.hypot(b.x - cur.x, b.z - cur.z) ? s : b));
      let first = pick(far.length ? far : rest);
      while (rest.length) { const s = order.length ? pick(rest) : first; order.push(s); rest.splice(rest.indexOf(s), 1); cur = s; }
      chosen = order;
    }
    const kinds = ORN.map((_, i) => i);
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }

    // ---------------------------------------------------------------- meshes
    const sparkG = sparkleGeo(), beamG = beamGeo();
    const geos = [sparkG, beamG];
    const items = chosen.map((s, i) => {
      const k = ORN[kinds[i]];
      const g = k.make(); geos.push(g);
      const mesh = mg.add(new THREE.Mesh(g, engine.mat));
      mesh.scale.setScalar(SIZE); mesh.castShadow = true;
      const base = colliders.heightAt(s.x, s.z) + 0.32;
      mesh.position.set(s.x, base, s.z);
      const spark = mg.add(new THREE.Mesh(sparkG, engine.mat));
      spark.position.set(s.x, base - 0.25, s.z); spark.visible = false; spark.scale.setScalar(0);
      const beam = mg.add(new THREE.Mesh(beamG, engine.mat));
      beam.position.set(s.x, base - 0.28, s.z); beam.visible = false; beam.scale.set(1, 0.001, 1);
      const it = { i, id: s.id, x: s.x, z: s.z, note: s.at, clue: s.clue, kind: k.name, icon: k.icon, mesh, spark, beam, base, phase: rnd() * 6.28, got: false, pop: -1, fade: 0, t: 0, beamOn: false, beamK: 0, spot: null };
      it.spot = interact.add({ id: 'orn' + i, x: s.x, z: s.z, r: PICK_R, label: 'Pick up', icon: 'hand', enabled: () => !it.got && !mg.finished, onInteract: () => collect(it) });
      return it;
    });

    // ---------------------------------------------------------------- DOM
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const hud = document.createElement('div'); hud.className = 'orn-hud'; ctx.uiRoot.appendChild(hud);
    hud.innerHTML = `<div class="knit-card orn-card">
      <div class="orn-top"><div class="orn-tray">${items.map((it, i) => `<button class="orn-slot" data-i="${i}" aria-label="Clue ${i + 1}">${ORN_SVG[it.icon] || ''}</button>`).join('')}</div>
        <div class="orn-ic"></div><div class="orn-tt"><b class="orn-name"></b><span class="orn-sub"></span></div><button class="orn-show" hidden>Show me<small>-${SHOW_COST}</small></button></div>
      <p class="orn-riddle"></p>
      <div class="orn-heat"><span class="orn-ring"><u></u><i></i></span><div class="orn-bar"><i style="left:5%"></i></div><b class="orn-word">Cold</b></div></div>
      <div class="orn-pin">${ARROW}</div>`;
    const $ = (s) => hud.querySelector(s);
    const card = $('.orn-card'), icEl = $('.orn-ic'), nameEl = $('.orn-name'), subEl = $('.orn-sub'), riddleEl = $('.orn-riddle');
    const marker = $('.orn-bar i'), word = $('.orn-word'), ringU = $('.orn-ring u'), showBtn = $('.orn-show'), pin = $('.orn-pin');
    const slots = [...hud.querySelectorAll('.orn-slot')];
    hud.querySelectorAll('.orn-slot, .orn-show').forEach((b) => b.addEventListener('pointerdown', (e) => e.stopPropagation()));
    mg.onDispose(() => {
      hud.remove(); style.remove();
      for (const it of items) { interact.remove(it.spot); it.spot.removed = true; }
      for (const g of geos) g.dispose();
      if (window.__ornaments && window.__ornaments.token === token) delete window.__ornaments;
    });

    // ---------------------------------------------------------------- state
    let found = 0, left = TIME, running = false, doneAt = -1, now = 0, cur = 0, shows = 0, pinUntil = 0, phase = 0, flash = '', flashUntil = 0, lastWord = '', lastSub = '', lastHeat = 0;
    const token = {};
    const refresh = () => { mg.hud.setScore(`${found}/5`, 'Found'); mg.hud.setTimer(left); };
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    function showClue() {
      slots.forEach((s, i) => { s.classList.toggle('cur', i === cur && !items[i].got); });
      const it = items[cur];
      if (!it || it.got) return;
      icEl.innerHTML = ORN_SVG[it.icon] || '';
      nameEl.textContent = `Find the ${it.kind}`;
      riddleEl.innerHTML = it.clue.map((l) => `<span>${esc(l).replace('{orn}', `<b>${esc(it.kind)}</b>`)}</span>`).join('');
    }
    function select(i) {
      if (!items[i] || items[i].got || i === cur) return;
      cur = i; phase = 0; pinUntil = 0; flashUntil = 0; showClue(); audio?.sfx?.('ui');
    }
    slots.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (running) select(+b.dataset.i); }));
    function nextTarget() { const n = items.findIndex((x) => !x.got); return n; }
    function showMe() {
      const it = items[cur];
      if (!running || mg.finished || !it || it.got || it.t < SHOW_T) return false;
      shows++; pinUntil = now + 8; it.beamOn = true;
      flash = `Hint on screen (-${SHOW_COST} points)`; flashUntil = now + 3; audio?.sfx?.('ui');
      return true;
    }
    showBtn.addEventListener('click', (e) => { e.stopPropagation(); showMe(); });
    mg.onKey((e) => { if (e.key === 'h' || e.key === 'H') showMe(); });

    function collect(it) {
      if (it.got || mg.finished) return;
      it.got = true; it.pop = 0; interact.remove(it.spot); it.spot.removed = true;
      const sl = slots[it.i]; sl.classList.remove('cur'); sl.classList.add('on'); 
      found++;
      audio?.sfx?.('pickup'); audio?.sfx?.('task');
      refresh();
      if (found >= 5) {
        doneAt = now; cur = -1;
        nameEl.textContent = 'All five found!'; subEl.textContent = 'Lovely work'; subEl.className = 'orn-sub good'; riddleEl.innerHTML = ''; showBtn.hidden = true; pin.style.display = 'none';
      } else {
        const prev = cur;
        if (it.i === cur) cur = nextTarget(); // a different ornament was found by chance: keep hunting the current clue
        phase = 0; showClue();
        if (it.i === prev) pinUntil = 0; // the hint was for the ornament that is now in hand
        flash = `Found the ${it.kind}! ${5 - found} to go`; flashUntil = now + 2.4;
      }
    }
    function end() {
      if (mg.finished) return;
      const secs = Math.max(0, Math.floor(left));
      const r = { found, secs, shows };
      const stars = starsFor(r), score = scoreFor(r);
      hud.style.display = 'none'; // the results card takes over
      mg.finish({ score, stars, text: found >= 5 ? `All five ornaments found with ${secs}s to spare!${shows ? ` (${shows} hint${shows > 1 ? 's' : ''} used)` : ''}` : `You found ${found} of 5 ornaments.` });
    }
    const hintState = () => { const it = items[cur]; return it ? { cur, kind: it.kind, id: it.id, clue: it.clue.join(' ').replace('{orn}', it.kind), t: +it.t.toFixed(1), beamOn: it.beamOn, showReady: it.t >= SHOW_T, shows, pinned: now < pinUntil } : { cur: -1 }; };
    window.__ornaments = {
      token, seed, report,
      get spots() { return items.map((i) => ({ x: i.x, z: i.z, kind: i.kind, id: i.id, note: i.note, clue: i.clue.join(' ').replace('{orn}', i.kind), got: i.got, t: +i.t.toFixed(1), beamOn: i.beamOn })); },
      get found() { return found; }, get left() { return left; }, get valid() { return valid.length; },
      get hint() { return { ...hintState(), heat: lastHeat, word: lastWord, sub: subEl.textContent }; },
      collectNext(viaInteract = false) {
        const it = items[cur] || items.find((i) => !i.got); if (!it || it.got) return null;
        if (viaInteract) { player.teleport(it.x + 0.5, it.z + 0.5, 0); interact.update(player.pos.x, player.pos.z, true); interact.trigger(); } else collect(it);
        return it.kind;
      },
      setLeft(s) { left = s; },
      /** test: pretend s seconds passed on the current clue (beam at BEAM_T, Show me at SHOW_T) */
      addHuntTime(s) { const it = items[cur]; if (it) it.t += s; },
      select, showMe,
      /** test: stand d metres from the current ornament (camera-relative south of it) */
      standNear(d = 2, sz = 1) { const it = items[cur]; if (it) player.teleport(it.x + d * 0.6, it.z + d * 0.8 * sz, 0); }, // sz -1: stand north of it, so it shows low on screen
      score: () => ({ found, secs: Math.floor(left), shows, stars: starsFor({ found, secs: Math.floor(left), shows }), score: scoreFor({ found, secs: Math.floor(left), shows }) }),
    };

    // ---------------------------------------------------------------- go
    player.teleport(START.x, START.z, Math.PI);
    cam.setMode('follow');
    mg.hud.setGoal(null);
    refresh(); showClue();
    subEl.textContent = 'Clue 1 of 5';
    await mg.intro();
    mg.setPlayerControl(true);
    cam.setMode('follow');
    running = true;
    const v3 = new THREE.Vector3();

    mg.addUpdate((dt, t) => {
      now += dt;
      const px = player.pos.x, pz = player.pos.z;
      const act = items[cur] && !items[cur].got ? items[cur] : null;
      for (const it of items) {
        if (it.got) {
          if (it.pop >= 0) { // pickup pop: spin up, swell, vanish
            it.pop += dt; const k = it.pop / 0.45;
            it.mesh.position.y = it.base + k * 0.9; it.mesh.rotation.y += dt * 14;
            it.mesh.scale.setScalar(SIZE * (1 + Math.sin(Math.min(1, k) * Math.PI) * 0.5) * Math.max(0, 1.15 - k));
            it.spark.visible = false; it.beam.visible = false;
            if (k >= 1) { it.mesh.visible = false; it.pop = -1; }
          }
          continue;
        }
        const d = Math.hypot(it.x - px, it.z - pz);
        it.mesh.position.y = it.base + Math.sin(t * 1.8 + it.phase) * 0.05;
        it.mesh.rotation.y = t * 0.9 + it.phase;
        it.mesh.rotation.z = Math.sin(t * 1.3 + it.phase) * 0.12;
        const target = d < SEE ? 1 : 0;
        it.fade += (target - it.fade) * Math.min(1, dt * 4);
        const f = it.fade;
        it.spark.visible = f > 0.02;
        if (it.spark.visible) {
          it.spark.scale.set(f, f * (0.9 + Math.sin(t * 3 + it.phase) * 0.1), f);
          it.spark.rotation.y = t * 1.5;
        }
        // escalating help: the beam grows out of the spot (stays on once lit)
        if (it.beamOn) {
          it.beamK = Math.min(1, it.beamK + dt / 1.6);
          const e = 1 - Math.pow(1 - it.beamK, 3), br = 1 + Math.sin(t * 4 + it.phase) * 0.12;
          it.beam.visible = true; it.beam.scale.set(br, Math.max(0.001, e), br); it.beam.rotation.y = t * 1.2;
        }
      }
      if (running && !mg.finished) {
        if (act) {
          act.t += dt;
          if (!act.beamOn && act.t >= BEAM_T) { act.beamOn = true; flash = 'A sparkle beam is rising!'; flashUntil = now + 4; audio?.sfx?.('bell', { vol: 0.25 }); }
          const d = Math.hypot(act.x - px, act.z - pz), w = heat(d);
          lastHeat = +w.toFixed(2);
          // warmer / colder: bar, word, colour, pulsing ring and chime all share one rhythm
          const col = heatCss(w);
          card.style.setProperty('--heat', col);
          marker.style.left = (5 + w * 90).toFixed(1) + '%';
          const wd = heatWord(w);
          if (wd !== lastWord) { lastWord = wd; word.textContent = wd; }
          phase += dt / pulsePeriod(w);
          if (phase >= 1) { phase -= Math.floor(phase); if (w > 0.05) audio?.sfx?.('bell', { vol: 0.12 + w * 0.3 }); }
          ringU.style.transform = `scale(${(0.45 + phase * (0.7 + w * 0.5)).toFixed(3)})`;
          ringU.style.opacity = (Math.max(0, 1 - phase) * (0.55 + w * 0.45)).toFixed(3);
          ringU.parentNode.style.filter = `drop-shadow(0 0 ${(2 + w * 10).toFixed(1)}px ${col})`;
          // sub line: flash message, else the hint state
          let sub = now < flashUntil ? flash : act.beamOn ? (act.t >= SHOW_T ? 'Still stuck? Tap Show me' : 'Follow the sparkle beam') : `Clue ${act.i + 1} of 5`;
          const cls = now < flashUntil ? (flash.startsWith('Found') ? 'orn-sub good' : 'orn-sub glow') : act.beamOn ? 'orn-sub glow' : 'orn-sub';
          if (sub !== lastSub) { lastSub = sub; subEl.textContent = sub; subEl.className = cls; }
          const ready = act.t >= SHOW_T; if (showBtn.hidden === ready) showBtn.hidden = !ready;
          // Show me pin (big, over the spot, costs points) and a free soft chevron on the screen edge once the beam is lit and the spot is off-screen
          const pinned = now < pinUntil;
          if (pinned || act.beamOn) {
            const cam3 = engine.camera;
            v3.set(act.x, act.base + 0.5, act.z).project(cam3);
            const W = innerWidth, H = innerHeight, back = v3.z > 1;
            let sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
            if (back) { sx = W - sx; sy = H - sy; }
            const top = card.getBoundingClientRect().bottom + 30, m = 34, bot = H - 120;
            const off = back || sx < m || sx > W - m || sy < top || sy > bot;
            let rot = 0, show = pinned;
            if (off) {
              show = true;
              const cx = W / 2, cy = (top + bot) / 2; let dx = sx - cx, dy = sy - cy; if (!dx && !dy) dy = 1;
              const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), ((bot - top) / 2 - 8) / Math.abs(dy || 1e-6));
              sx = cx + dx * k; sy = cy + dy * k;
              rot = Math.atan2(-dx, dy); // the arrow art points down: turn it to point along (dx, dy)
            } else sy -= 36;
            if (show) {
              pin.style.display = 'block'; pin.style.opacity = pinned ? '1' : '0.8';
              pin.style.transform = `translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px) rotate(${rot.toFixed(3)}rad) scale(${pinned ? 1 : 0.7})`;
            } else pin.style.display = 'none';
          } else if (pin.style.display !== 'none') pin.style.display = 'none';
        }
        left -= dt;
        mg.hud.setTimer(left);
        if (found >= 5 && doneAt >= 0 && now - doneAt > 0.9) { running = false; end(); }
        else if (left <= 0) { left = 0; running = false; end(); }
      }
    });
    mg.onTap(() => {});
  },
};
