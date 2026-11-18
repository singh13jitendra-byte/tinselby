// Toasts, speech bubbles, district banners and the "tap to skip" hint. (Portrait is a first-class layout now: no rotate overlay.)
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
  root.append(bubbles, toasts, banner, skip);

  // ---- toasts (pass {x, z} to add a live arrow pointing at that spot)
  const arrows = []; // {el, x, z, t}
  function toast(text, ms = 2800, opts = {}) {
    if (!text) return;
    const t = document.createElement('div');
    t.className = 'tb-toast knit-card';
    if (Number.isFinite(opts.x) && Number.isFinite(opts.z)) {
      t.classList.add('has-arrow');
      const a = document.createElement('span');
      a.className = 'tb-toast-arrow';
      a.innerHTML = ICONS.arrow;
      const s = document.createElement('span');
      s.textContent = text;
      t.append(a, s);
      arrows.push({ el: a, x: opts.x, z: opts.z, toast: t });
    } else t.textContent = text;
    toasts.appendChild(t);
    while (toasts.children.length > 2) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }
  game.on('ui:toast', ({ text, ms, x, z }) => toast(text, ms, { x, z }));
  function updateArrows() {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      if (!a.toast.isConnected) { arrows.splice(i, 1); continue; }
      a.el.style.transform = `rotate(${screenAngle(a.x, a.z).toFixed(3)}rad)`;
    }
  }
  /** Angle (clockwise from screen-up) from the player to a world spot, using the camera's ground yaw. */
  function screenAngle(x, z) {
    const p = ctx.player.pos, yaw = cam.yaw;
    const dx = x - p.x, dz = z - p.z;
    const f = dx * -Math.sin(yaw) + dz * -Math.cos(yaw), r = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    return Math.atan2(r, f);
  }

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
  // the finale has its own overlays: clear any leftover task chatter when it starts
  game.on('finale:start', () => {
    toasts.replaceChildren();
    for (const o of live.values()) o.life = Math.min(o.life, 0);
  });
  // a mini-game owns the screen: giver bubbles fade out (toasts from the game itself still show)
  game.on('minigame:start', () => { for (const o of live.values()) o.life = Math.min(o.life, 0); });
  const v = new THREE.Vector3();
  function updateBubbles(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    const toastsBottom = W < H && live.size && toasts.children.length ? toasts.getBoundingClientRect().bottom : 0;
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
        // keep clear of the top HUD (two rows + goal chip in portrait) and of the joystick / button row at the bottom
        let top = W < H ? 176 : H <= 380 ? 112 : 70;
        const bottom = W < H ? 180 : 20;
        if (W < H && toastsBottom) top = Math.max(top, toastsBottom + 22); // portrait: toasts share the column, sit below them
        x = Math.max(bw / 2 + 8, Math.min(W - bw / 2 - 8, behind ? W / 2 : x));
        y = Math.max(bh + top, Math.min(H - bottom, behind ? H * 0.4 : y));
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

  // ---- cinematic skip: tap / key during a skippable shot
  let shotT = 0;
  const trySkip = () => { if (cam.shotActive) cam.skip(); };
  window.addEventListener('pointerdown', trySkip, { capture: true });
  window.addEventListener('keydown', (e) => { if (e.target?.tagName !== 'INPUT') trySkip(); }, { capture: true });

  function update(dt) {
    updateBubbles(dt);
    updateArrows();
    shotT = cam.shotSkippable ? shotT + dt : 0;
    const showSkip = shotT > 0.6 && game.state.phase !== 'entry';
    if (skip.hidden === showSkip) skip.hidden = !showSkip;
  }
  return { toast, say, update, screenAngle };
}
