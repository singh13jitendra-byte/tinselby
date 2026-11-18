// ORNAMENT HUNT (door 6): five knitted ornaments hidden around Market Square. Walk, follow the warm/cold radar and the chime,
// pick them up before the 90 s run out. Everything is registered through mg so dispose removes meshes, spots and DOM.
import * as THREE from 'three';
import { cone, cyl, sph, dot, rbox, torus, extrude, tube, xf, merge, poly, starPts, recolor, KNIT, FELT, GLOW, GLOSS } from '../../core/prims.js';
import { P, mulberry32 } from '../../core/yarn.js';
import { ARENAS } from '../../core/layout.js';

// Small inline SVG tray icons (no emoji fonts: they render differently on every phone).
const ORN_SVG = {
  bauble: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="10" y="2.5" width="4" height="3" rx="1" fill="#e3aa3a"/><circle cx="12" cy="14" r="8" fill="#b8302d"/><path d="M5 13c3 2 11 2 14 0" stroke="#fff4e2" stroke-width="1.6" fill="none"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8 6.2 20l1.4-6.4L2.7 9.2l6.5-.7z" fill="#e3aa3a" stroke="#b07b1c" stroke-width="1"/></svg>',
  stocking: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="7" y="2.5" width="9" height="4" rx="1.2" fill="#fff4e2"/><path d="M8 6.5h7v8l3.5 3a3 3 0 0 1-2 5.2H11a4 4 0 0 1-4-4V6.5z" fill="#b8302d"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3a6 6 0 0 1 6 6v5l2 3H4l2-3V9a6 6 0 0 1 6-6z" fill="#e3aa3a" stroke="#b07b1c" stroke-width="1"/><circle cx="12" cy="19.5" r="2" fill="#b07b1c"/><path d="M9 4.5l-2-1.5M15 4.5l2-1.5" stroke="#3f6e45" stroke-width="2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="#fff4e2" stroke="#b8302d" stroke-width="2"/><path d="M8 9.5l8 6M10 8l7 5" stroke="#b8302d" stroke-width="1.6"/></svg>',
};

const TIME = 90;
const SEE = 3.5; // sparkle visibility radius
const SIZE = 1.35;

// ~14 candidate hiding places (x, z, note). Validated at start (collider push-out + a walkable ring to stand on).
const CANDIDATES = [
  [-5.35, -4.15, 'behind the north-west stall'],
  [5.35, -4.15, 'behind the north-east stall'],
  [-5.6, 0.25, 'behind the west stall'],
  [2.4, -5.15, 'behind the back stall'],
  [5.62, -2.2, 'at a lamp post base'],
  [-1.4, 4.8, 'at the south lamp post'],
  [3.4, -4.85, 'at the back lamp post'],
  [-2.8, 3.1, 'in the gift pile by the fir'],
  [3.4, 1.5, 'in the gift pile by the barrel'],
  [-3.15, 2.2, 'under the bench'],
  [3.2, -1.0, 'beside the east bench'],
  [2.9, 4.0, 'by the carousel'],
  [1.5, -3.0, 'beside the tree'],
  [-1.5, -3.0, 'beside the tree (other side)'],
  [4.5, 4.6, 'by the south gift pile'],
  [2.0, -3.5, 'by the little snowman'],
];

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

const CSS = `
.orn-hud{position:absolute;inset:0;pointer-events:none;font-family:var(--font,sans-serif)}
.orn-radar{position:absolute;left:calc(14px + var(--safe-l,0px));top:calc(78px + var(--safe-t,0px));width:150px;padding:8px 12px 10px;text-align:center}
.orn-radar small{display:block;font:600 10px/1 var(--font);letter-spacing:.14em;text-transform:uppercase;opacity:.7;margin-bottom:6px}
.orn-bar{position:relative;height:14px;border-radius:9px;background:linear-gradient(90deg,#6f9bd1,#9fc3d8 30%,#efe1c6 55%,#e3aa3a 78%,#c93a2d);box-shadow:inset 0 0 0 2px rgba(60,40,30,.35),0 2px 0 rgba(0,0,0,.15)}
.orn-bar i{position:absolute;top:-4px;width:8px;height:22px;margin-left:-4px;border-radius:5px;background:#fff;border:2px solid #5c3a26;transition:left .25s}
.orn-word{margin-top:7px;font:700 15px/1 var(--font)}
.orn-tray{position:absolute;left:50%;top:calc(62px + var(--safe-t,0px));transform:translateX(-50%);display:flex;gap:8px;padding:6px 10px}
.orn-slot{width:34px;height:34px;border-radius:50%;background:rgba(92,58,38,.16);box-shadow:inset 0 0 0 2px rgba(92,58,38,.35);display:grid;place-items:center;font-size:19px;line-height:1}
.orn-slot span{opacity:0;transform:scale(0)}
.orn-slot.on{background:rgba(227,170,58,.35)}
.orn-slot.on span{opacity:1;animation:ornPop .5s ease both}
@keyframes ornPop{0%{transform:scale(0) rotate(-40deg)}60%{transform:scale(1.5) rotate(10deg)}100%{transform:scale(1) rotate(0)}}
@media (orientation:portrait){.orn-radar{left:50%;transform:translateX(-50%);top:calc(124px + var(--safe-t,0px));width:min(260px,76vw);padding:6px 12px 8px}.orn-tray{top:calc(194px + var(--safe-t,0px));max-width:92vw;box-sizing:border-box;padding:5px 10px}.orn-slot{width:38px;height:38px}}
@media (max-height:420px){.orn-radar{top:calc(70px + var(--safe-t,0px));width:128px;padding:5px 9px 7px}.orn-slot{width:28px;height:28px;font-size:16px}}
`;

export default {
  id: 'ornaments', title: 'Ornament Hunt', district: 'market',
  intro: 'Five knitted ornaments are hidden around the market square. Walk and look: sparkles show up close, the chime and the warm/cold meter tell you when you are near. Press E or tap Pick up. 90 seconds!',
  async start(ctx, mg, opts = {}) {
    const { engine, colliders, interact, player, audio, cam } = ctx;
    const A = ARENAS.ornaments;
    const seed = opts.seed ?? (Number(new URLSearchParams(location.search).get('seed')) || ((Math.random() * 1e9) | 0));
    const rnd = mulberry32(seed);

    // ---------------------------------------------------------------- choose + validate spots
    const tmp = new THREE.Vector3();
    const valid = [];
    for (const [x, z, note] of CANDIDATES) {
      tmp.set(x, 0, z);
      colliders.resolve(tmp, 0.25);
      if (Math.hypot(tmp.x - x, tmp.z - z) > 0.5) continue; // buried in a prop
      if (Math.hypot(tmp.x - A.x, tmp.z - A.z) > A.r + 1.0) continue;
      let reach = false; // is there a free spot to stand within pick-up range?
      for (let k = 0; k < 8 && !reach; k++) {
        const a = (k / 8) * Math.PI * 2;
        const q = new THREE.Vector3(tmp.x + Math.cos(a) * 0.7, 0, tmp.z + Math.sin(a) * 0.7);
        colliders.resolve(q, 0.25);
        if (Math.hypot(q.x - tmp.x - Math.cos(a) * 0.7, q.z - tmp.z - Math.sin(a) * 0.7) < 0.03 && Math.hypot(q.x - tmp.x, q.z - tmp.z) < 0.95) reach = true;
      }
      if (reach) valid.push({ x: tmp.x, z: tmp.z, note });
    }
    const pool = (valid.length >= 5 ? valid : CANDIDATES.map(([x, z, note]) => ({ x, z, note })));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const chosen = [];
    for (const minD of [3.2, 2.2, 0]) { // spread them out, relax if needed
      for (const s of pool) if (chosen.length < 5 && !chosen.includes(s) && chosen.every((c) => Math.hypot(c.x - s.x, c.z - s.z) >= minD)) chosen.push(s);
      if (chosen.length >= 5) break;
    }
    const kinds = ORN.map((_, i) => i);
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }

    // ---------------------------------------------------------------- meshes
    const sparkG = sparkleGeo();
    const geos = [sparkG];
    const items = chosen.map((s, i) => {
      const k = ORN[kinds[i]];
      const g = k.make(); geos.push(g);
      const mesh = mg.add(new THREE.Mesh(g, engine.mat));
      mesh.scale.setScalar(SIZE); mesh.castShadow = true;
      const base = colliders.heightAt(s.x, s.z) + 0.32;
      mesh.position.set(s.x, base, s.z);
      const spark = mg.add(new THREE.Mesh(sparkG, engine.mat));
      spark.position.set(s.x, base - 0.25, s.z); spark.visible = false; spark.scale.setScalar(0);
      const it = { x: s.x, z: s.z, note: s.note, kind: k.name, icon: k.icon, mesh, spark, base, phase: rnd() * 6.28, got: false, pop: -1, fade: 0, spot: null };
      it.spot = interact.add({ id: 'orn' + i, x: s.x, z: s.z, r: 1.0, label: 'Pick up', icon: 'hand', enabled: () => !it.got && !mg.finished, onInteract: () => collect(it) });
      return it;
    });

    // ---------------------------------------------------------------- DOM
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const hud = document.createElement('div'); hud.className = 'orn-hud'; ctx.uiRoot.appendChild(hud);
    hud.innerHTML = `<div class="knit-card orn-radar"><small>Radar</small><div class="orn-bar"><i style="left:5%"></i></div><div class="orn-word">Cold</div></div><div class="knit-card orn-tray">${items.map((it) => `<div class="orn-slot"><span>${ORN_SVG[it.icon] || ''}</span></div>`).join('')}</div>`;
    const marker = hud.querySelector('.orn-bar i'), word = hud.querySelector('.orn-word');
    const slots = [...hud.querySelectorAll('.orn-slot')];
    mg.onDispose(() => {
      hud.remove(); style.remove();
      for (const it of items) { interact.remove(it.spot); it.spot.removed = true; }
      for (const g of geos) g.dispose();
      if (window.__ornaments && window.__ornaments.token === token) delete window.__ornaments;
    });

    // ---------------------------------------------------------------- state
    let found = 0, left = TIME, running = false, doneAt = -1, chimeT = 0, now = 0;
    const token = {};
    const refresh = () => { mg.hud.setScore(`${found}/5`, 'Found'); mg.hud.setTimer(left); };
    function collect(it) {
      if (it.got || mg.finished) return;
      it.got = true; it.pop = 0; interact.remove(it.spot); it.spot.removed = true;
      slots[found]?.classList.add('on'); slots[found] && (slots[found].firstChild.innerHTML = ORN_SVG[it.icon] || '');
      found++;
      audio?.sfx?.('pickup'); audio?.sfx?.('task');
      mg.hud.toast(found < 5 ? `Found the ${it.kind}! ${5 - found} to go` : 'All five found!');
      refresh();
      if (found >= 5) doneAt = now;
    }
    function end() {
      if (mg.finished) return;
      const secs = Math.max(0, Math.floor(left));
      const stars = found >= 5 ? (secs >= 30 ? 3 : 2) : found >= 3 ? 1 : 0;
      const score = found * 100 + secs * 5;
      mg.finish({ score, stars, text: found >= 5 ? `All five ornaments found with ${secs}s to spare!` : `You found ${found} of 5 ornaments.` });
    }
    window.__ornaments = {
      token, seed, get spots() { return items.map((i) => ({ x: i.x, z: i.z, kind: i.kind, note: i.note, got: i.got })); },
      get found() { return found; }, get left() { return left; }, get valid() { return valid.length; },
      collectNext(viaInteract = false) {
        const it = items.find((i) => !i.got); if (!it) return null;
        if (viaInteract) { player.teleport(it.x + 0.5, it.z + 0.5, 0); interact.update(player.pos.x, player.pos.z, true); interact.trigger(); } else collect(it);
        return it.kind;
      },
      setLeft(s) { left = s; },
    };

    // ---------------------------------------------------------------- go
    player.teleport(0, 3.6, Math.PI);
    cam.setMode('follow');
    mg.hud.setGoal('Find the hidden ornaments');
    refresh();
    await mg.intro();
    mg.setPlayerControl(true);
    cam.setMode('follow');
    running = true;

    mg.addUpdate((dt, t) => {
      now += dt;
      const px = player.pos.x, pz = player.pos.z;
      let nearest = Infinity;
      for (const it of items) {
        if (it.got) {
          if (it.pop >= 0) { // pickup pop: spin up, swell, vanish
            it.pop += dt; const k = it.pop / 0.45;
            it.mesh.position.y = it.base + k * 0.9; it.mesh.rotation.y += dt * 14;
            it.mesh.scale.setScalar(SIZE * (1 + Math.sin(Math.min(1, k) * Math.PI) * 0.5) * Math.max(0, 1.15 - k));
            it.spark.visible = false;
            if (k >= 1) { it.mesh.visible = false; it.pop = -1; }
          }
          continue;
        }
        const d = Math.hypot(it.x - px, it.z - pz);
        nearest = Math.min(nearest, d);
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
      }
      if (running && !mg.finished) {
        // radar + chime
        const w = nearest === Infinity ? 0 : Math.max(0, Math.min(1, 1 - (nearest - 0.8) / 8.5));
        marker.style.left = (5 + w * 90).toFixed(1) + '%';
        word.textContent = w > 0.88 ? 'Burning hot!' : w > 0.7 ? 'Hot' : w > 0.45 ? 'Warm' : w > 0.2 ? 'Cool' : 'Cold';
        if (w > 0.05) {
          chimeT -= dt;
          if (chimeT <= 0) { audio?.sfx?.('bell', { vol: 0.12 + w * 0.3 }); chimeT = 2.6 - w * 2.25; }
        }
        left -= dt;
        mg.hud.setTimer(left);
        if (found >= 5 && doneAt >= 0 && now - doneAt > 0.7) { running = false; end(); }
        else if (left <= 0) { left = 0; running = false; end(); }
      }
    });
    mg.onTap(() => {});
  },
};
