// Photo mode + shareable postcards.
// Entry: a round camera button injected into the HUD's top-right group (.tb-hud .tb-tr) and the P key, free play only.
// Photo mode: HUD hidden (body.tb-photo), townsfolk + city animations slowed, the player stops; an orbit camera around
// the character (drag / one finger = orbit, wheel / pinch = zoom, arrow keys too) with presets, poses, looks
// (filters), own name tag and depth-blur toggles. A crop guide shows exactly what the card photo will contain.
// Postcard: the frame inside the guide is re-rendered at card resolution (renderer resized for one frame, view offset
// = the guide), graded, and composited with a knitted frame, a ready-made greeting, the player's name and the game
// link (frames.js). Share (Web Share API with the PNG), Save image, Copy link. Nothing is uploaded anywhere.
//
// Hooks used (no core edits): the camera pose / lens / tilt-shift / engine.shotPost / engine.env are overridden in an
// update at order 105 (after the camera director at 100 and before the name tags at 110, and before engine.applyLook),
// so everything is rewritten by its owners every frame and nothing needs restoring except the view offset.
// Poses run at order 20 (after player.update at −10) on player.character's pivots. Slow-motion wraps the order-5
// updates (life + city animations) while open.
import './photo.css';
import * as THREE from 'three';
import { cleanName } from '../core/names.js';
import { WORLD } from '../core/layout.js';
import { SHAPES, photoAspect, GREETINGS, FRAMES, FILTERS, filterById, filterCSS, drawPostcard, gradeCanvas, LINK } from './frames.js';

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const IC = {
  tall: svg('<rect x="6.5" y="3.5" width="11" height="17" rx="2.5"/>'),
  wide: svg('<rect x="3" y="6.5" width="18" height="11" rx="2.5"/>'),
  photo: svg('<rect x="2.8" y="7" width="18.4" height="13" rx="3.2" fill="currentColor" fill-opacity=".18"/><path d="M8.2 7l1.4-2.4h4.8L15.8 7"/><circle cx="12" cy="13.4" r="3.5"/><circle cx="17.6" cy="10" r=".7" fill="currentColor" stroke="none"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  share: svg('<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.4 10.8l7.2-4M8.4 13.2l7.2 4"/>'),
  save: svg('<path d="M12 3.5v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 16.5v3h16v-3"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  cam: svg('<circle cx="12" cy="12" r="3.2"/><path d="M4.5 9.5V6.5a2 2 0 0 1 2-2h3M19.5 9.5V6.5a2 2 0 0 0-2-2h-3M4.5 14.5v3a2 2 0 0 0 2 2h3M19.5 14.5v3a2 2 0 0 1-2 2h-3"/>'),
  pose: svg('<circle cx="12" cy="4.8" r="2.2"/><path d="M5 8.5l7 2 7-2M12 10.5v4.5l-3.5 5.5M12 15l3.5 5.5"/>'),
  look: svg('<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".12"/><path d="M12 3.5v17M12 3.5a8.5 8.5 0 0 1 0 17" fill="currentColor" fill-opacity=".35"/>'),
};

// Camera presets: yaw relative to the character's heading (0 = straight in front), pitch in degrees, distance from
// the look point (ty above the feet), vertical FOV of the photo.
// fov = vertical FOV of the card photo itself (the crop guide), band = half-height of the sharp tilt-shift band in
// photo heights.
const PRESETS = [
  { id: 'me', label: 'Me', yaw: 0.42, pitch: 11, dist: 1.6, fov: 30, ty: 0.24, band: 0.22 },
  { id: 'town', label: 'Me + town', yaw: 0.6, pitch: 9, dist: 3.4, fov: 40, ty: 0.5, band: 0.16 },
  { id: 'selfie', label: 'Selfie', yaw: 0.1, pitch: 19, dist: 0.8, fov: 50, ty: 0.31, band: 0.26 },
  { id: 'bird', label: 'Bird’s eye', yaw: 0.35, pitch: 62, dist: 6.5, fov: 34, ty: 0.12, band: 0.14 },
];
const POSES = [
  { id: 'none', label: 'Relax' }, { id: 'wave', label: 'Wave' }, { id: 'cheer', label: 'Cheer' },
  { id: 'jump', label: 'Jump' }, { id: 'sit', label: 'Sit' }, { id: 'angel', label: 'Snow angel' },
];
const PITCH_MIN = -4, PITCH_MAX = 85, DIST_MIN = 0.55, DIST_MAX = 18;
const WALL_H = 3.4; // camera samples above this height ignore walls (roofs are lower than this almost everywhere)
const SLOW = 0.15; // time scale for townsfolk / city animations while posing
const smooth = (x) => x * x * (3 - 2 * x);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const D2R = Math.PI / 180;

export function createPhoto(ctx) {
  const { engine, game, player, cam, input, colliders, uiRoot } = ctx;
  const camera = engine.camera;
  const S = {
    open: false, result: false, preset: 'me', pose: 'none', filter: 'cosy', showName: false, blur: true,
    shape: innerHeight > innerWidth ? 'tall' : 'wide', frame: 'classic', greeting: 'merry', tab: 'camera',
  };
  let shapePicked = false; // until the player picks a card shape, it follows the screen orientation at open()
  const orb = { yaw: 0, pitch: 12, dist: 2, fov: 30, ty: 0.25, band: 0.2 };
  const goal = { ...orb };
  let dEff = 2, w = 0, saved = null, offsetOn = false, slowT = 0;
  let guide = { x: 0, y: 0, w: innerWidth, h: innerHeight };
  let photoCv = null, cardCv = null, cardFile = null, cardVer = 0, busy = false;
  const target = new THREE.Vector3(), myPos = new THREE.Vector3(), myLook = new THREE.Vector3(), dirPos = new THREE.Vector3();
  const dirQ = new THREE.Quaternion(), myQ = new THREE.Quaternion(), tmp = new THREE.Vector3(), probe = { x: 0, z: 0 };
  const cKey = new THREE.Color(), cSky = new THREE.Color();
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* audio optional */ } };

  // ---------------------------------------------------------------- DOM
  const btn = document.createElement('button');
  btn.className = 'knit-btn cream round tb-photo-btn';
  btn.setAttribute('aria-label', 'Photo mode (P)');
  btn.title = 'Photo mode (P)';
  btn.innerHTML = IC.photo;
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
  function injectButton() {
    const tr = uiRoot.querySelector('.tb-hud .tb-tr');
    if (!tr) return false;
    if (btn.parentNode !== tr) tr.insertBefore(btn, tr.querySelector('.tb-mute'));
    return true;
  }
  injectButton();

  const tint = document.createElement('div'); // live colour tint (must sit outside #ui so it blends with the canvas)
  tint.className = 'tb-ph-tint';
  tint.hidden = true;
  document.body.insertBefore(tint, uiRoot);

  const chip = (g, id, label, attrs = '') => `<button class="tb-ph-chip" data-g="${g}" data-id="${id}"${attrs ? ' ' + attrs : ''}>${label}</button>`;
  const root = document.createElement('div');
  root.className = 'tb-ph-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="tb-ph-drag interactive" aria-hidden="true"></div>
    <div class="tb-ph-guide"><i class="tb-ph-c tl"></i><i class="tb-ph-c tr"></i><i class="tb-ph-c bl"></i><i class="tb-ph-c br"></i></div>
    <div class="tb-ph-tip">Drag to look around · pinch or scroll to zoom</div>
    <div class="tb-ph-flash"></div>
    <div class="tb-ph-panel knit-card">
      <div class="tb-ph-tabs" role="tablist">
        <button class="tb-ph-tab" data-tab="camera" role="tab">${IC.cam}<span>Camera</span></button>
        <button class="tb-ph-tab" data-tab="pose" role="tab">${IC.pose}<span>Pose</span></button>
        <button class="tb-ph-tab" data-tab="look" role="tab">${IC.look}<span>Look</span></button>
        <button class="tb-ph-x" aria-label="Close photo mode">${IC.close}</button>
      </div>
      <div class="tb-ph-panes">
        <div class="tb-ph-pane" data-pane="camera">
          <div class="tb-ph-row">${PRESETS.map((p) => chip('preset', p.id, p.label)).join('')}</div>
          <div class="tb-ph-row">
            <button class="tb-ph-tog" data-t="showName" aria-pressed="false" aria-label="Show my name tag"><i></i>My name</button>
            <button class="tb-ph-tog" data-t="blur" aria-pressed="true" aria-label="Depth blur"><i></i>Blur</button>
            <span class="tb-ph-seg tb-ph-shape">${chip('shape', 'tall', IC.tall, 'aria-label="Tall card" title="Tall card"')}${chip('shape', 'wide', IC.wide, 'aria-label="Wide card" title="Wide card"')}</span>
          </div>
        </div>
        <div class="tb-ph-pane" data-pane="pose">
          <div class="tb-ph-row">${POSES.map((p) => chip('pose', p.id, p.label)).join('')}</div>
        </div>
        <div class="tb-ph-pane" data-pane="look">
          <div class="tb-ph-row">${FILTERS.map((f) => chip('filter', f.id, `<i class="tb-ph-dot" style="background:${f.swatch}"></i>${f.label}`)).join('')}</div>
        </div>
      </div>
      <button class="knit-btn tb-ph-shutter">${IC.photo}<span>Take photo</span></button>
    </div>
    <div class="tb-ph-result" hidden>
      <div class="tb-ph-cardwrap"><canvas class="tb-ph-card" aria-label="Your Tinselby postcard"></canvas></div>
      <div class="tb-ph-rpanel knit-card">
        <div class="tb-ph-rlab">Frame</div>
        <div class="tb-ph-row tb-ph-frames">${FRAMES.map((f) => `<button class="tb-ph-sw" data-g="frame" data-id="${f.id}"><i style="background:${f.swatch}"></i><span>${f.label}</span></button>`).join('')}</div>
        <div class="tb-ph-rlab">Greeting</div>
        <div class="tb-ph-row">${GREETINGS.map((g) => chip('greeting', g.id, g.label)).join('')}</div>
        <div class="tb-ph-actions">
          <button class="knit-btn tb-ph-mkcard" hidden><span class="tb-ph-mkico"></span><span>Make a Christmas card</span></button>
          <button class="knit-btn green tb-ph-share" hidden>${IC.share}<span>Share</span></button>
          <button class="knit-btn cream tb-ph-save">${IC.save}<span>Save image</span></button>
          <button class="knit-btn cream tb-ph-copy">${IC.link}<span>Copy link</span></button>
        </div>
        <div class="tb-ph-actions2">
          <button class="tb-ph-link tb-ph-retake">${IC.back}<span>Retake</span></button>
          <span class="tb-ph-seg">${chip('shape', 'tall', 'Tall')}${chip('shape', 'wide', 'Wide')}</span>
          <button class="tb-ph-link tb-ph-done">Done</button>
        </div>
      </div>
    </div>
    <div class="tb-ph-toast" hidden></div>`;
  uiRoot.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const panel = $('.tb-ph-panel'), guideEl = $('.tb-ph-guide'), drag = $('.tb-ph-drag'), flash = $('.tb-ph-flash'), tip = $('.tb-ph-tip');
  const result = $('.tb-ph-result'), cardEl = $('.tb-ph-card'), shareBtn = $('.tb-ph-share'), shutter = $('.tb-ph-shutter');
  const toastEl = $('.tb-ph-toast');
  root.addEventListener('pointerdown', (e) => e.stopPropagation()); // never reaches the cinematic-skip / tap-to-walk listeners

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.dataset.g) { set(b.dataset.g, b.dataset.id); sfx('ui'); return; }
    if (b.dataset.tab) { S.tab = b.dataset.tab; sync(); layout(); sfx('ui'); return; }
    if (b.dataset.t) { set(b.dataset.t, !S[b.dataset.t]); sfx('ui'); return; }
    if (b.classList.contains('tb-ph-x') || b.classList.contains('tb-ph-done')) { close(); sfx('ui'); return; }
    if (b === shutter) { shoot(); return; }
    if (b.classList.contains('tb-ph-retake')) { showResult(false); sfx('ui'); return; }
    if (b === shareBtn) { share(); return; }
    if (b.classList.contains('tb-ph-save')) { save(); return; }
    if (b.classList.contains('tb-ph-copy')) { copyLink(); return; }
    if (b.classList.contains('tb-ph-mkcard')) { const ph = photoCv; if (!ph || !ctx.cards) return; sfx('ui'); close(); ctx.cards.open('photo', { photo: ph }); return; } // src/cards
  });

  function toast(text, ms = 2200) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { toastEl.hidden = true; }, ms);
  }

  /** Reflect state in the DOM (pressed chips, tabs, toggles, live filter). */
  function sync() {
    for (const b of root.querySelectorAll('[data-g]')) b.classList.toggle('on', String(S[b.dataset.g]) === b.dataset.id);
    for (const b of root.querySelectorAll('[data-tab]')) { b.classList.toggle('on', b.dataset.tab === S.tab); b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); }
    for (const p of root.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== S.tab;
    for (const b of root.querySelectorAll('[data-t]')) b.setAttribute('aria-pressed', String(!!S[b.dataset.t]));
    const f = filterById(S.filter);
    engine.renderer.domElement.style.filter = S.open ? filterCSS(f).replace('none', '') : '';
    tint.hidden = !S.open || !f.tint;
    if (f.tint) { tint.style.background = f.tint.col; tint.style.mixBlendMode = f.tint.mode; tint.style.opacity = String(f.tint.a); }
  }

  function set(key, v) {
    if (key === 'preset') { S.preset = v; applyPreset(v); }
    else if (key === 'pose') S.pose = v;
    else if (key === 'filter') S.filter = v;
    else if (key === 'showName') { S.showName = !!v; ctx.nameTag?.setVisible?.(S.showName); }
    else if (key === 'blur') S.blur = !!v;
    else if (key === 'shape') { shapePicked = true; if (S.shape === v) return; S.shape = v; sync(); layout(); if (S.result) develop(); return; }
    else if (key === 'frame') { S.frame = v; sync(); if (S.result) compose(); return; }
    else if (key === 'greeting') { S.greeting = v; sync(); if (S.result) compose(); return; }
    sync();
  }

  function applyPreset(id) {
    const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
    goal.yaw = player.heading + p.yaw;
    goal.pitch = p.pitch; goal.dist = p.dist; goal.fov = p.fov; goal.ty = p.ty; goal.band = p.band;
  }

  // ---------------------------------------------------------------- crop guide (what the card photo will contain)
  function layout() {
    const W = innerWidth, H = innerHeight, cs = getComputedStyle(root); // the root's padding = the safe-area insets
    const sT = parseFloat(cs.paddingTop) || 0, sB = parseFloat(cs.paddingBottom) || 0, sL = parseFloat(cs.paddingLeft) || 0;
    const pr = panel.getBoundingClientRect();
    const portrait = H > W, m = 14;
    let rx, ry, rw, rh;
    if (portrait) { rx = m; ry = sT + m + 30; rw = W - 2 * m; rh = pr.top - m - ry; }
    else { rx = sL + m; ry = sT + m + 26; rw = pr.left - m - rx; rh = H - sB - m - ry; }
    rw = Math.max(80, rw); rh = Math.max(80, rh);
    const A = photoAspect(S.shape);
    let gw = Math.min(rw, rh * A), gh = gw / A;
    guide = { x: rx + (rw - gw) / 2, y: ry + (rh - gh) / 2, w: gw, h: gh };
    Object.assign(guideEl.style, { left: guide.x + 'px', top: guide.y + 'px', width: gw + 'px', height: gh + 'px' });
    tip.style.top = Math.max(sT + 8, guide.y - 34) + 'px';
    tip.style.left = guide.x + gw / 2 + 'px';
  }
  window.addEventListener('resize', () => { if (S.open) requestAnimationFrame(layout); });

  // ---------------------------------------------------------------- orbit input
  const ptrs = new Map();
  let pinch0 = 0, dist0 = 0;
  drag.addEventListener('pointerdown', (e) => {
    if (!S.open || S.result) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { drag.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; dist0 = goal.dist; }
    tip.classList.add('out');
  });
  drag.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      const s = Math.min(innerWidth, innerHeight);
      goal.yaw -= (dx / s) * 3.2;
      goal.pitch = clamp(goal.pitch + (dy / s) * 140, PITCH_MIN, PITCH_MAX);
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      goal.dist = clamp(dist0 * (pinch0 / d), DIST_MIN, DIST_MAX);
    }
  });
  const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; dist0 = goal.dist; } };
  drag.addEventListener('pointerup', endPtr);
  drag.addEventListener('pointercancel', endPtr);
  drag.addEventListener('wheel', (e) => { e.preventDefault(); goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.0012), DIST_MIN, DIST_MAX); tip.classList.add('out'); }, { passive: false });

  // keyboard: P toggles, Esc closes; while open the movement / camera / interact keys orbit instead
  const held = new Set();
  const BLOCK = ['c', 'e', ' ', 'enter', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '=', '-', '_'];
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (S.open) close(); else if (canEnter()) open();
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if (!S.open) return;
    if (k === 'escape') { if (S.result) showResult(false); else close(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (BLOCK.includes(k)) { held.add(k); e.preventDefault(); e.stopImmediatePropagation(); }
  }, { capture: true });
  window.addEventListener('keyup', (e) => held.delete((e.key || '').toLowerCase()), { capture: true });
  window.addEventListener('blur', () => held.clear());

  // ---------------------------------------------------------------- enter / exit
  function canEnter() {
    return game.state.phase === 'play' && !S.open && player.controllable && input.enabled !== false && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.house?.isOpen && !ctx.ui?.modalOpen?.();
  }
  function open() {
    if (!canEnter()) return false;
    saved = { controllable: player.controllable, input: input.enabled, nameTag: ctx.nameTag ? ctx.nameTag.visible : true };
    player.controllable = false;
    input.enabled = false;
    input.clearTap?.();
    // start the orbit where the gameplay camera is, then swoop to the preset
    const p = player.object.position;
    target.set(p.x, p.y + 0.25, p.z);
    tmp.copy(camera.position).sub(target);
    const d = tmp.length();
    orb.dist = dEff = clamp(d, DIST_MIN, DIST_MAX);
    orb.pitch = clamp(Math.asin(clamp(tmp.y / (d || 1), -1, 1)) / D2R, PITCH_MIN, PITCH_MAX);
    orb.yaw = Math.atan2(tmp.x, tmp.z);
    orb.fov = camera.fov; orb.ty = 0.25; orb.band = 0.2;
    if (!shapePicked) S.shape = innerHeight > innerWidth ? 'tall' : 'wide';
    S.open = true; S.result = false; S.preset = 'me'; S.pose = 'none'; S.tab = 'camera';
    applyPreset('me');
    ctx.nameTag?.setVisible?.(S.showName);
    slowT = 0;
    slowWorld(true);
    document.body.classList.add('tb-photo');
    root.hidden = false; result.hidden = true;
    tip.classList.remove('out');
    clearTimeout(open.tipT); open.tipT = setTimeout(() => tip.classList.add('out'), 5000);
    sync();
    layout();
    sfx('pop');
    game.emit('photo:open', {});
    return true;
  }
  function close() {
    if (!S.open) return;
    S.open = false; S.result = false;
    ptrs.clear(); held.clear();
    const free = game.state.phase === 'play' && !ctx.minigames?.active && !ctx.rides?.active && !ctx.ui?.modalOpen?.();
    if (saved && free) { player.controllable = saved.controllable; input.enabled = saved.input; }
    if (saved) ctx.nameTag?.setVisible?.(saved.nameTag);
    saved = null;
    slowWorld(false);
    document.body.classList.remove('tb-photo');
    root.hidden = true; result.hidden = true;
    sync();
    game.emit('photo:close', {});
  }
  game.on('minigame:start', () => close());
  game.on('finale:start', () => close());

  // ---------------------------------------------------------------- slow motion for ambient life (order-5 updates)
  function slowWorld(on) {
    for (const u of engine.updates) {
      if (on && u.order === 5 && !u.__photo) {
        const f = u.fn;
        u.__photo = f;
        u.fn = (dt, t) => f(dt * SLOW, t - slowT);
      } else if (!on && u.__photo) { u.fn = u.__photo; delete u.__photo; }
    }
  }

  // ---------------------------------------------------------------- poses (after player.update at −10)
  let posed = false;
  function applyPose(ch, pose, t) {
    const { body, arms, legs, group } = ch;
    group.position.y = 0; body.position.z = 0; body.rotation.y = 0;
    arms[0].rotation.y = arms[1].rotation.y = 0;
    arms[0].rotation.z = -0.25; arms[1].rotation.z = 0.25;
    if (pose === 'none') return;
    if (pose === 'wave') {
      arms[1].rotation.set(0, 0, 2.5 + Math.sin(t * 9) * 0.38);
      body.rotation.z = -0.07;
    } else if (pose === 'cheer') {
      arms[0].rotation.set(-2.75, 0, -0.5); arms[1].rotation.set(-2.75, 0, 0.5);
      const b = Math.abs(Math.sin(t * 5.5));
      body.position.y = b * 0.035; body.scale.y = 1 + b * 0.03;
    } else if (pose === 'jump') {
      group.position.y = 0.17;
      body.rotation.set(-0.12, 0, 0); body.position.y = 0; body.scale.y = 1.04;
      legs[0].rotation.set(-0.75, 0, 0.05); legs[1].rotation.set(0.4, 0, -0.05);
      arms[0].rotation.set(-0.3, 0, -1.95); arms[1].rotation.set(-0.3, 0, 1.95);
    } else if (pose === 'sit') {
      group.position.y = -0.045;
      body.rotation.set(-0.08, 0, 0); body.position.y = 0;
      legs[0].rotation.set(-1.45, 0, 0.12); legs[1].rotation.set(-1.45, 0, -0.12);
      arms[0].rotation.set(-0.55, 0, -0.32); arms[1].rotation.set(-0.55, 0, 0.32);
    } else if (pose === 'angel') {
      const s = 0.5 + 0.5 * Math.sin(t * 3.2);
      body.rotation.set(-Math.PI / 2, 0, 0); body.position.set(0, 0.1, 0.2); body.scale.y = 1;
      arms[0].rotation.set(0, 0, -(1.0 + s * 0.75)); arms[1].rotation.set(0, 0, 1.0 + s * 0.75);
      legs[0].rotation.set(0, 0, -(0.08 + s * 0.32)); legs[1].rotation.set(0, 0, 0.08 + s * 0.32);
    }
  }
  function resetBody(ch) { ch.body.position.set(0, 0, 0); ch.body.rotation.set(0, 0, 0); ch.body.scale.set(1, 1, 1); for (const l of ch.legs) l.rotation.set(0, 0, 0); for (const a of ch.arms) a.rotation.x = 0; }
  engine.addUpdate((dt, t) => {
    const ch = player.character;
    if (!ch || ch.seated) return;
    if (S.open && S.pose !== 'none') { applyPose(ch, S.pose, t); posed = true; }
    else if (posed) { applyPose(ch, 'none', t); resetBody(ch); posed = false; }
  }, 20);

  // ---------------------------------------------------------------- camera / look override (after the director)
  const effDir = (sp) => ({ // the director's shotPost as applyLook would use it
    band: 0.11 + (sp.band - 0.11) * sp.w, falloff: 0.36 + (sp.falloff - 0.36) * sp.w,
    bloom: 1 + (sp.bloom - 1) * sp.w, glow: 1 + (sp.glow - 1) * sp.w, threshold: sp.threshold * sp.w,
  });
  const push = { x: 0, z: 0 };
  /** True if a small sphere at (x, z) overlaps an obstacle; push = the way out (the obstacle's normal). */
  function solidAt(x, z) {
    probe.x = x; probe.z = z;
    colliders.resolve(probe, 0.06, x, z);
    push.x = probe.x - x; push.z = probe.z - z;
    return Math.abs(push.x) + Math.abs(push.z) > 1e-4;
  }
  function orbitPose(dt) {
    const k = 1 - Math.exp(-dt * 7);
    orb.yaw += wrapA(goal.yaw - orb.yaw) * k;
    orb.pitch += (goal.pitch - orb.pitch) * k;
    orb.dist += (goal.dist - orb.dist) * k;
    orb.fov += (goal.fov - orb.fov) * k;
    orb.ty += (goal.ty - orb.ty) * k;
    orb.band += (goal.band - orb.band) * k;
    const p = player.object.position;
    target.set(p.x, p.y + orb.ty, p.z);
    const pr = orb.pitch * D2R, cp = Math.cos(pr);
    const dx = Math.sin(orb.yaw) * cp, dy = Math.sin(pr), dz = Math.cos(orb.yaw) * cp;
    // walls: march out from the subject; the first sample inside a wall (below roof height) stops the camera.
    // Small props (lanterns, canes, benches, planters, townsfolk) don't count: a hit only blocks if the obstacle goes
    // on along its surface (±0.45 along the tangent: walls, fences, stall sides) or deeper along the view line
    // (+0.7: the big tree, the carousel); small round colliders are free at all three points.
    let hit = orb.dist;
    const hl = Math.hypot(dx, dz) || 1, rx = dx / hl, rz = dz / hl;
    for (let s = 0.35; s <= orb.dist; s += 0.1) {
      const y = target.y + dy * s;
      if (y > WALL_H) break;
      const sx = target.x + dx * s, sz = target.z + dz * s;
      if (sx < WORLD.minX + 0.4 || sx > WORLD.maxX - 0.4 || sz < WORLD.minZ + 0.4 || sz > WORLD.maxZ - 0.4) break;
      if (y < colliders.heightAt(sx, sz) + 0.05) { hit = Math.max(DIST_MIN * 0.8, s - 0.12); break; } // hill slopes
      if (!solidAt(sx, sz)) continue;
      const pl = Math.hypot(push.x, push.z) || 1, tx = -push.z / pl, tz = push.x / pl;
      if (solidAt(sx + tx * 0.45, sz + tz * 0.45) || solidAt(sx - tx * 0.45, sz - tz * 0.45) || solidAt(sx + rx * 0.7, sz + rz * 0.7)) {
        hit = Math.max(DIST_MIN * 0.8, s - 0.12); break;
      }
    }
    if (hit < dEff) dEff = hit; else dEff += (hit - dEff) * (1 - Math.exp(-dt * 3));
    myPos.set(target.x + dx * dEff, target.y + dy * dEff, target.z + dz * dEff);
    const gy = colliders.heightAt(myPos.x, myPos.z) + 0.12;
    if (myPos.y < gy) myPos.y = gy;
    myLook.copy(target);
  }

  engine.addUpdate((dt) => {
    if (!btn.isConnected) injectButton();
    // button state: dimmed when photo mode can't start right now
    const can = canEnter() || S.open;
    if (can !== btn._can) { btn._can = can; btn.classList.toggle('off', !can); btn.disabled = !can; }
    if (S.open) {
      // something else took over (mini-game, finale, a cinematic, a panel): leave photo mode
      if (game.state.phase !== 'play' || cam.shotActive || ctx.minigames?.active || ctx.rides?.active || ctx.ui?.modalOpen?.()) close();
    }
    if (S.open) {
      slowT += dt * (1 - SLOW);
      // keyboard orbit
      if (held.size) {
        const r = dt * 1.6;
        if (held.has('arrowleft') || held.has('a')) goal.yaw -= r;
        if (held.has('arrowright') || held.has('d')) goal.yaw += r;
        if (held.has('arrowup') || held.has('w')) goal.pitch = clamp(goal.pitch + r * 40, PITCH_MIN, PITCH_MAX);
        if (held.has('arrowdown') || held.has('s')) goal.pitch = clamp(goal.pitch - r * 40, PITCH_MIN, PITCH_MAX);
        if (held.has('+') || held.has('=')) goal.dist = clamp(goal.dist * Math.exp(-dt * 1.4), DIST_MIN, DIST_MAX);
        if (held.has('-') || held.has('_')) goal.dist = clamp(goal.dist * Math.exp(dt * 1.4), DIST_MIN, DIST_MAX);
      }
      w = Math.min(1, w + dt / 0.35);
    } else if (w > 0) w = Math.max(0, w - dt / 0.45);
    if (w <= 0) {
      if (offsetOn) { camera.clearViewOffset(); offsetOn = false; }
      return;
    }
    if (S.open || w > 0) orbitPose(dt);
    const e = smooth(w);
    // pose: blend from wherever the director put the camera this frame
    dirPos.copy(camera.position); dirQ.copy(camera.quaternion);
    camera.position.copy(myPos); camera.lookAt(myLook); myQ.copy(camera.quaternion);
    camera.position.lerpVectors(dirPos, myPos, e);
    camera.quaternion.slerpQuaternions(dirQ, myQ, e);
    // orb.fov is the photo's own vertical FOV: widen the full-screen frustum so the crop guide sees exactly that
    const W = innerWidth, H = innerHeight;
    const fovFull = Math.min(150, 2 * Math.atan(Math.tan((orb.fov * D2R) / 2) * (H / Math.max(1, guide.h))) / D2R);
    camera.fov += (fovFull - camera.fov) * e;
    camera.near += (0.08 - camera.near) * e;
    // projection centre = the guide's centre (photo framing matches the crop window)
    camera.setViewOffset(W, H, (W / 2 - (guide.x + guide.w / 2)) * e, (H / 2 - (guide.y + guide.h / 2)) * e, W, H);
    offsetOn = true;
    camera.updateMatrixWorld();
    // tilt-shift: focus on the character, band / blur measured in guide heights so the card matches the preview
    const gk = guide.h / H;
    tmp.copy(target).project(camera);
    const post = engine.post;
    if (Number.isFinite(tmp.y)) post.focus += (((clamp(tmp.y, -1, 1) + 1) / 2) - post.focus) * e;
    const f = filterById(S.filter), fe = f.env || {}, bk = f.bokeh;
    // the Bokeh look always blurs the background (whatever the depth-blur toggle says), harder and with a slimmer band
    const tiltK = clamp(1.6 - 0.35 * Math.log(1 + dEff), 0.6, 1.5) * gk * (bk ? bk.blur : S.blur ? 1 : 0);
    post.strength += (tiltK - post.strength) * e;
    const sp = engine.shotPost, d0 = effDir(sp);
    sp.w = 1;
    sp.band = d0.band + (orb.band * gk * (bk ? bk.band : 1) - d0.band) * e;
    sp.falloff = d0.falloff + (0.34 * gk - d0.falloff) * e;
    sp.bloom = d0.bloom + ((fe.bloom ?? 1) - d0.bloom) * e;
    sp.glow = d0.glow + ((fe.glow ?? 1) - d0.glow) * e;
    sp.threshold = d0.threshold * (1 - e);
    // the look's lighting tweaks (engine.env is rewritten by the time-of-day module every frame)
    const env = engine.env;
    if (fe.key) env.keyCol.lerp(cKey.set(fe.key), fe.keyK * e);
    if (fe.sky) env.hemiSky.lerp(cSky.set(fe.sky), fe.skyK * e);
    if (fe.exposure) env.exposure *= 1 + (fe.exposure - 1) * e;
    if (fe.vignette) env.vignette = clamp(env.vignette + fe.vignette * e, 0.2, 1);
  }, 105);

  // ---------------------------------------------------------------- capture: re-render the guide at card resolution
  function renderScale() {
    if (engine.quality === 'low') return 0.6;
    if (engine.isMobile) return 0.85;
    return 1;
  }
  let capFocus = null;
  function capture() {
    const r = engine.renderer, post = engine.post, gl = r.getContext();
    const sh = SHAPES[S.shape].photo;
    const k = renderScale();
    let Wr = Math.round(sh.w * k), Hr = Math.round(sh.h * k);
    const lim = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, 4096);
    const f = Math.min(1, lim / Math.max(Wr, Hr));
    Wr = Math.floor(Wr * f); Hr = Math.floor(Hr * f);
    const W = innerWidth, H = innerHeight, G = guide;
    const screenH = r.domElement.height;
    const keep = { focus: post.focus, strength: post.strength, band: post.band, falloff: post.falloff };
    const pts = [];
    engine.scene.traverse((o) => { const u = o.isPoints && o.material?.uniforms?.uScale; if (u) pts.push([u, u.value]); });
    const out = document.createElement('canvas');
    out.width = Wr; out.height = Hr;
    try {
      r.setPixelRatio(1);
      r.setSize(Wr, Hr, false);
      post.setSize(Wr, Hr);
      camera.setViewOffset(W, H, W / 2 - G.w / 2, H / 2 - G.h / 2, G.w, G.h);
      camera.updateMatrixWorld();
      tmp.copy(target).project(camera);
      if (Number.isFinite(tmp.y)) post.focus = (clamp(tmp.y, -1, 1) + 1) / 2;
      const kh = H / G.h;
      post.band = keep.band * kh; post.falloff = keep.falloff * kh; post.strength = keep.strength * kh;
      capFocus = { focusY: 1 - post.focus, band: post.band }; // for the Bokeh look's light discs
      const ps = Hr / Math.max(1, screenH * (G.h / H)); // point sprites (snow, fireworks) keep their size in the frame
      for (const [u, v] of pts) u.value = v * ps;
      post.render(engine.scene, camera, engine.time);
      out.getContext('2d').drawImage(r.domElement, 0, 0, Wr, Hr);
    } finally {
      Object.assign(post, keep);
      for (const [u, v] of pts) u.value = v;
      engine.resize();
      camera.setViewOffset(W, H, W / 2 - (G.x + G.w / 2), H / 2 - (G.y + G.h / 2), W, H);
      camera.updateMatrixWorld();
      post.render(engine.scene, camera, engine.time); // repaint the screen at its own size (no blank frame)
    }
    return out;
  }

  const fontsReady = () => {
    try {
      return Promise.race([document.fonts.load('700 60px Fredoka').then(() => document.fonts.load('600 40px Fredoka')), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  };

  async function develop() {
    if (busy) return null;
    busy = true;
    try {
      layout();
      const shot = capture();
      gradeCanvas(shot, filterById(S.filter), capFocus || undefined);
      photoCv = shot;
      await compose();
      return cardCv;
    } catch (err) {
      console.error('[photo] capture failed', err);
      toast('Sorry, that photo didn’t work. Try again?');
      return null;
    } finally { busy = false; }
  }

  async function compose() {
    if (!photoCv) return null;
    await fontsReady();
    const ver = ++cardVer;
    cardCv = cardCv || document.createElement('canvas');
    drawPostcard(cardCv, photoCv, { shape: S.shape, frame: S.frame, greeting: S.greeting, name: cleanName(game.state.playerName) });
    // show it
    cardEl.width = cardCv.width; cardEl.height = cardCv.height;
    cardEl.getContext('2d').drawImage(cardCv, 0, 0);
    // prepare the PNG for sharing (Web Share must be called straight from the tap, so the file is made in advance)
    cardFile = null;
    shareBtn.classList.add('wait');
    await new Promise((res) => {
      try {
        cardCv.toBlob((blob) => {
          if (ver === cardVer && blob) {
            cardFile = typeof File === 'function' ? new File([blob], 'tinselby-postcard.png', { type: 'image/png' }) : blob;
            shareBtn.classList.remove('wait');
          }
          res();
        }, 'image/png');
      } catch (e) { res(); }
    });
    return cardCv;
  }

  async function shoot() {
    if (!S.open || busy) return null;
    sfx('pop');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    shutter.classList.add('busy');
    await new Promise((r) => setTimeout(r, 40)); // let the flash paint before the heavy frame
    const c = await develop();
    shutter.classList.remove('busy');
    if (c) { showResult(true); sfx('bell'); game.emit('photo:taken', {}); }
    return c;
  }

  function showResult(on) {
    S.result = !!on && S.open;
    result.hidden = !S.result;
    root.classList.toggle('tb-ph-showing', S.result);
    if (S.result) {
      const f = cardFile instanceof File ? cardFile : null;
      let can = false;
      try { can = !!(navigator.share && navigator.canShare && f && navigator.canShare({ files: [f] })); } catch (e) { can = false; }
      shareBtn.hidden = !can;
      const mk = root.querySelector('.tb-ph-mkcard'); // "Make a Christmas card" (src/cards)
      mk.hidden = !ctx.cards;
      if (ctx.cards && !mk.dataset.ico) { mk.dataset.ico = '1'; mk.querySelector('.tb-ph-mkico').outerHTML = ctx.cards.icon || ''; }
      root.querySelector('.tb-ph-save').classList.toggle('green', shareBtn.hidden);
      root.querySelector('.tb-ph-save').classList.toggle('cream', !shareBtn.hidden);
    }
    sync();
  }

  const shareText = () => {
    const g = GREETINGS.find((x) => x.id === S.greeting) || GREETINGS[0];
    return `${g.text} Come and visit my knitted Christmas town: ${LINK}`;
  };
  async function share() {
    const f = cardFile;
    if (!f) { toast('One moment, your card is nearly ready…', 1400); return; }
    const data = { files: [f], title: 'A postcard from Tinselby', text: shareText() };
    try {
      if (!navigator.canShare || !navigator.canShare({ files: [f] })) throw new Error('no file share');
      await navigator.share(data);
      game.emit('photo:shared', {});
    } catch (err) {
      if (err && err.name === 'AbortError') return; // the player closed the share sheet
      toast('Sharing isn’t available here, so we saved it instead.');
      save();
    }
  }
  function save() {
    const f = cardFile;
    const done = (url) => {
      const a = document.createElement('a');
      a.href = url; a.download = 'tinselby-postcard.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL?.(url), 5000);
      toast('Postcard saved!');
      sfx('ui');
    };
    if (f) done(URL.createObjectURL(f));
    else if (cardCv) cardCv.toBlob((b) => b && done(URL.createObjectURL(b)), 'image/png');
  }
  async function copyLink() {
    let ok = false;
    try { await navigator.clipboard.writeText(LINK); ok = true; } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = LINK; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e2) { ok = false; }
    }
    toast(ok ? 'Link copied!' : LINK, ok ? 1800 : 4000);
    sfx('ui');
  }

  sync();
  return {
    open, close,
    toggle: () => (S.open ? (close(), false) : open()),
    get isOpen() { return S.open; },
    get state() { return { ...S }; },
    canEnter,
    set,
    shoot,
    /** Re-render the card (e.g. after changing the shape) without the shutter animation. */
    develop,
    get card() { return cardCv; },
    get photo() { return photoCv; },
    get guide() { return { ...guide }; },
  };
}
