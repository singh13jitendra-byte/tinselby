// Toasts, speech bubbles, district banners, "tap to skip" hint and the portrait overlay.
import * as THREE from 'three';
import { ICONS } from './icons.js';

export function createOverlays(ctx, root) {
  const { game, engine, cam, layout } = ctx;
  const toasts = document.createElement('div');
  toasts.className = 'tb-toasts';
  const bubbles = document.createElement('div');
  bubbles.className = 'tb-bubbles';
  const banner = document.createElement('div');
  banner.className = 'tb-banner';
  banner.hidden = true;
  const skip = document.createElement('div');
  skip.className = 'tb-skip';
  skip.textContent = 'Tap to skip';
  skip.hidden = true;
  const portrait = document.createElement('div');
  portrait.className = 'tb-portrait';
  portrait.innerHTML = `<div class="knit-card tb-portrait-card"><div class="tb-portrait-phone">${ICONS.phone}</div><div class="tb-portrait-txt">Turn your phone sideways</div><div class="tb-portrait-sub">Tinselby is best in landscape</div></div>`;
  root.append(bubbles, toasts, banner, skip, portrait);

  // ---- toasts
  function toast(text, ms = 2800) {
    if (!text) return;
    const t = document.createElement('div');
    t.className = 'tb-toast knit-card';
    t.textContent = text;
    toasts.appendChild(t);
    while (toasts.children.length > 2) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }
  game.on('ui:toast', ({ text, ms }) => toast(text, ms));

  // ---- speech bubbles (anchored above the speaker when a world pos is given)
  const live = new Map(); // who → {el, pos, until}
  function say({ who, text, ms, pos }) {
    if (!text) return;
    for (const [k, o] of live) if (k !== (who || '')) o.life = Math.min(o.life, 0); // one speaker at a time
    let b = live.get(who || '');
    if (!b) {
      const el = document.createElement('div');
      el.className = 'tb-bubble';
      bubbles.appendChild(el);
      b = { el };
      live.set(who || '', b);
    }
    b.el.innerHTML = '';
    if (who) { const n = document.createElement('div'); n.className = 'tb-bubble-who'; n.textContent = who; b.el.appendChild(n); }
    const p = document.createElement('div');
    p.className = 'tb-bubble-txt';
    p.textContent = text;
    b.el.appendChild(p);
    b.el.classList.remove('out', 'pop'); void b.el.offsetWidth; b.el.classList.add('pop');
    b.pos = pos && pos.isVector3 ? pos.clone() : pos && typeof pos.x === 'number' ? new THREE.Vector3(pos.x, pos.y || 0.6, pos.z) : null;
    b.el.classList.toggle('free', !b.pos);
    b.life = (ms || Math.min(7000, 2200 + text.length * 45)) / 1000;
  }
  game.on('dialog', say);
  const v = new THREE.Vector3();
  function updateBubbles(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    for (const [who, b] of live) {
      b.life -= dt;
      if (b.life <= 0 && !b.el.classList.contains('out')) {
        b.el.classList.add('out');
        setTimeout(() => { if (b.life <= 0) { b.el.remove(); live.delete(who); } }, 350);
      }
      if (b.pos) {
        v.copy(b.pos).project(engine.camera);
        const behind = v.z > 1;
        let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
        const bw = b.el.offsetWidth || 220, bh = b.el.offsetHeight || 60;
        x = Math.max(bw / 2 + 10, Math.min(W - bw / 2 - 10, behind ? W / 2 : x));
        y = Math.max(bh + 70, Math.min(H - 20, behind ? H * 0.4 : y));
        b.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
  }

  // ---- district banner on first visit
  let bannerTimer = 0;
  game.on('district:enter', ({ id, first }) => {
    if (!first || game.state.phase !== 'play') return;
    const d = layout.DISTRICTS.find((x) => x.id === id);
    if (!d) return;
    banner.innerHTML = `<span class="tb-banner-ribbon">${d.name}</span>`;
    banner.hidden = false;
    banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.hidden = true; }, 3000);
  });
  game.on('task:complete', ({ id }) => {
    const left = game.state.spiritMax - game.state.spirit;
    if (id === 'star') return;
    toast(left > 1 ? `Festive Spirit +1! Tinselby feels merrier.` : 'Festive Spirit +1! Now, the star for the big tree!', 3200);
  });

  // ---- cinematic skip: tap / key during a skippable shot
  let shotT = 0;
  const trySkip = () => { if (cam.shotActive) cam.skip(); };
  window.addEventListener('pointerdown', trySkip, { capture: true });
  window.addEventListener('keydown', (e) => { if (e.target?.tagName !== 'INPUT') trySkip(); }, { capture: true });

  function update(dt) {
    updateBubbles(dt);
    shotT = cam.shotSkippable ? shotT + dt : 0;
    const showSkip = shotT > 0.6 && game.state.phase !== 'entry';
    if (skip.hidden === showSkip) skip.hidden = !showSkip;
  }
  return { toast, say, update };
}
