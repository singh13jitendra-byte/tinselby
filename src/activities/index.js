// Activities: makes the things you can do in town easy to spot.
//
//   ctx.activities = createActivities(ctx)
//   activities.list() → [{ id, name, verb, x, z, locked, unlockDoor, district }]   (every activity; Analytics may use it)
//   activities.items  → the live activity objects (x, z, dist, locked, …; read-only)   activities.state() → diagnostics
//   activities.resetTips()                                                              (tests)
//   events: 'activity:near' { id, locked } the first time per visit you come within 2.5 m of one
//
// What it draws:
// - floating knitted signs (DOM, 0 draw calls) over the nearest ≤ 3 activities within 18 m: icon + name + verb
//   ("Ferris wheel · Ride"), or a lock + "Opens with Door N" when it's locked; they grow and fade in as you approach,
//   hide while that activity's green interact button shows (you're already there), and step around the HUD (goal card,
//   mini-map, round buttons, joystick, social buttons, guide arrow / "!" …) by reading those rects ~4×/s like src/guide.
// - edge signs: when one of those ≤ 3 nearest spots projects off-screen (the north-facing follow cam shows little ahead,
//   esp. in portrait) or under the HUD, its sign becomes a compact tag pinned just inside the play area (under the top
//   HUD band at the spot's screen x, or on the bottom edge for spots behind you if that's clear of the joystick and
//   buttons) with a little knitted arrow pointing at it; it glides back into the floating tag once the spot is well on
//   screen (hysteresis + a short dwell, no flicker). Tapping an edge sign = "Show the way" (map.wayTo / guide.showWay).
//   activities.showWay(id) does the same (tests).
// - a soft pulsing glow ring on the ground at each unlocked activity's start spot within 10 m (rings.js, ≤ 1 draw call).
// - a one-time tip toast the first time you walk up to each one (localStorage `tinselby.acts.v1`).
// Hidden outside free play (same rule as src/social/index.js free()), and while the full town map is open.
import './activities.css';
import * as THREE from 'three';
import { ICONS } from '../ui/icons.js';
import { buildActivities, iconOf } from './data.js';
import { createRings } from './rings.js';

const SIGN_R = 18; // metres: signs show within this
const FADE_M = 4; // …fading in over the outer 4 m
const RING_R = 10; // glow rings within this
const NEAR_R = 2.5; // tip + 'activity:near'
const MAX_SIGNS = 3;
const TAIL = 13; // px: the yarn string + bead under each tag (activities.css .tba-tail)
const ES = 0.88; // edge signs are a touch smaller than the floating tags
const DWELL = 0.4; // s: a sign keeps its look (floating / edge) at least this long (no flicker)
const EDGE_BACK = 44; // px: an edge sign morphs back once its spot is this far inside the top of the screen (and clear)
const KEY = 'tinselby.acts.v1';
const AVOID = [
  '.tb-hud:not([hidden]) .tb-stats > *', '.tb-hud:not([hidden]) .tb-tc', '.tb-hud:not([hidden]) .tb-tr', '.tb-hud:not([hidden]) .tb-goal',
  '.tb-act:not([hidden])', '.tb-joylayer:not([hidden]) .tb-joy', '.tb-keys:not([hidden])',
  '.tbs-root .tbs-corner', '.tbs-root .tbs-main', '.tbs-root .tbs-extra', '.tbs-root .tbs-pill',
  '.tbm-mini:not([hidden])', '.tbg-edge:not([hidden]) .tbg-badge', '.tbg-edge:not([hidden]) .tbg-lab', '.tbg-mark:not([hidden]) .tbg-bob', '.tb-toast', '.tb-cards:not(:empty)',
  '.tbt-call:not([hidden])', '.tbt-help:not([hidden])', '.tb-bubble', '[data-guide-avoid]',
].join(',');
const MAXR = 48;

export function createActivities(ctx) {
  const { game, player, cam, engine, uiRoot, params, interact, colliders } = ctx;
  const S = game.state;
  const acts = buildActivities(ctx);
  const N = acts.length;

  // ------------------------------------------------------------------ tips store
  const tipsOn = !params.has('capture') || params.has('tips') || params.has('acts');
  if (params.has('reset')) { try { localStorage.removeItem(KEY); } catch (e) { /* */ } }
  let store = { seen: {} };
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); store = { seen: o.seen || {} }; } catch (e) { /* */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };
  let lastTip = null;
  function tipFor(a) {
    const key = a.locked ? a.id + ':locked' : a.tipKey;
    if (store.seen[key]) return;
    store.seen[key] = 1; save();
    if (!tipsOn) return;
    const text = a.locked ? `${a.name} opens with Door ${a.door}. Keep opening doors on the Advent calendar!` : a.tip;
    if (!text) return;
    lastTip = { id: a.id, text, t: engine.time };
    try { ctx.ui?.toast?.(text, 5200); } catch (e) { /* */ }
    elsT = 0; rectT = 0; // the toast is a new obstacle: re-read the HUD now
  }

  // ------------------------------------------------------------------ free play (copy of src/social/index.js free())
  function free() {
    return S.phase === 'play' && player.controllable && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.finale?.running
      && !ctx.ui?.modalOpen?.() && !ctx.photo?.isOpen && !document.body.classList.contains('tb-photo')
      && !uiRoot.classList.contains('tb-house-open') && !ctx.map?.isOpen;
  }

  // ------------------------------------------------------------------ DOM: a small pool of signs
  const root = document.createElement('div');
  root.className = 'tba-root';
  root.setAttribute('aria-hidden', 'true');
  uiRoot.appendChild(root);
  // safe-area insets (notches), read from a hidden probe like src/guide/screen.js
  const probe = document.createElement('div');
  probe.className = 'tba-safe';
  root.appendChild(probe);
  const safe = { l: 0, t: 0, r: 0, b: 0 };
  function readSafe() {
    const cs = getComputedStyle(probe);
    safe.l = parseFloat(cs.paddingLeft) || 0; safe.t = parseFloat(cs.paddingTop) || 0;
    safe.r = parseFloat(cs.paddingRight) || 0; safe.b = parseFloat(cs.paddingBottom) || 0;
  }
  readSafe();
  const ARR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 14.5L12 9l5.5 5.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const signs = [];
  for (let i = 0; i < MAX_SIGNS; i++) {
    const el = document.createElement('div');
    el.className = 'tba-sign';
    el.hidden = true;
    el.innerHTML = `<div class="tba-in"><i class="tba-arr">${ARR}</i><span class="tba-ico"></span><span class="tba-txt"><b class="tba-name"></b><span class="tba-verb"></span></span></div><i class="tba-tail"></i>`;
    root.appendChild(el);
    const sg = {
      el, ico: el.querySelector('.tba-ico'), name: el.querySelector('.tba-name'), verb: el.querySelector('.tba-verb'), arr: el.querySelector('.tba-arr'),
      act: null, key: '', w: 120, h: 34, on: false, x: NaN, y: NaN, s: NaN, o: NaN, dy: 0, vis: false,
      // edge mode (the spot is off-screen / under the HUD): a compact tag pinned inside the play area with an arrow
      mode: 0, modeT: -9, tap: false, we: 130, he: 30, bot: false, ar: false, rot: NaN, tx: 0, ty: 0, ox: 0, oy: 0,
    };
    signs.push(sg);
    // tap an edge sign → "Show the way" there (the map's way, else the Guide's)
    el.addEventListener('pointerdown', (e) => { if (sg.tap) e.stopPropagation(); });
    el.addEventListener('click', (e) => {
      if (!sg.tap || !sg.act) return;
      e.preventDefault(); e.stopPropagation();
      showWayTo(sg.act);
    });
  }
  let lastWay = null;
  function showWayTo(a) {
    const name = a.sub ? `${a.name} · ${a.sub}` : a.name;
    let ok = false;
    try { ok = !!ctx.map?.wayTo?.({ id: 'act-' + a.id, name, gx: a.x, gz: a.z }); } catch (e) { console.warn('[activities] map.wayTo', e); }
    try { if (!ok) ok = !!ctx.guide?.showWay?.({ x: a.x, z: a.z, label: name }); } catch (e) { console.warn('[activities] guide.showWay', e); }
    try { ctx.audio?.sfx?.('ui'); } catch (e) { /* */ }
    lastWay = { id: a.id, ok };
    return ok;
  }
  function fill(sg, a) {
    const key = a.id + (a.locked ? ':L' : '');
    if (sg.key === key) return;
    sg.key = key; sg.act = a;
    sg.el.classList.toggle('locked', a.locked);
    sg.el.dataset.id = a.id;
    sg.ico.innerHTML = iconOf(a.icon);
    sg.name.textContent = a.name;
    sg.verb.innerHTML = a.locked ? `${ICONS.lock}<span>Opens with Door ${a.door}</span>` : `<span>${a.verb}</span>`;
    const was = sg.el.hidden; sg.el.hidden = false;
    sg.el.style.transform = 'none';
    // measure both looks: the floating tag (with its yarn tail) and the compact edge tag (with its arrow)
    sg.el.classList.remove('edge');
    sg.w = sg.el.offsetWidth || sg.w; sg.h = sg.el.offsetHeight || sg.h;
    sg.el.classList.add('edge');
    sg.we = sg.el.offsetWidth || sg.we; sg.he = sg.el.offsetHeight || sg.he;
    sg.el.classList.toggle('edge', sg.mode === 1);
    if (was) sg.el.hidden = true;
    sg.x = sg.y = sg.s = sg.o = NaN; sg.dy = 0;
  }
  function setMode(sg, m) {
    if (sg.mode === m) return;
    sg.mode = m; sg.el.classList.toggle('edge', m === 1);
    setTap(sg, false);
  }
  /** Only a settled, visible edge sign takes taps (never while it glides or is faded out over the HUD). */
  function setTap(sg, on) {
    if (sg.tap === on) return;
    sg.tap = on; sg.el.classList.toggle('tap', on);
  }
  function hideSign(sg) {
    if (sg.on) { sg.on = false; sg.el.classList.remove('on'); sg.el.hidden = true; }
    sg.act = null; sg.vis = false;
    setMode(sg, 0); sg.modeT = -9; sg.ox = sg.oy = 0;
  }

  // ------------------------------------------------------------------ obstacle rects (like src/guide/screen.js)
  const rects = new Float32Array(MAXR * 4);
  let nRects = 0, rectT = 0, els = [], elsT = 0;
  window.addEventListener('resize', () => { readSafe(); rectT = 0; elsT = 0; for (const sg of signs) sg.key = ''; });
  function refreshRects(dt, W, H) {
    elsT -= dt; rectT -= dt;
    if (elsT <= 0) { elsT = 0.5; els = uiRoot.querySelectorAll(AVOID); }
    if (rectT > 0) return;
    rectT = 0.25;
    nRects = 0;
    for (let i = 0; i < els.length && nRects < MAXR; i++) {
      const r = els[i].getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.width * r.height > W * H * 0.5) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) continue;
      const o = nRects * 4; rects[o] = r.left; rects[o + 1] = r.top; rects[o + 2] = r.right; rects[o + 3] = r.bottom; nRects++;
    }
  }
  const placed = new Float32Array(MAX_SIGNS * 4);
  let nPlaced = 0;
  const PAD = 4;
  const EPX = 6, EPY = 11; // edge signs are tappable: keep clear of the HUD's grown hit areas too (chips: 8 px above / below)
  function clearAt(l, t, r, b, px = PAD, py = PAD) {
    for (let i = 0; i < nRects; i++) {
      const o = i * 4;
      if (r > rects[o] - px && l < rects[o + 2] + px && b > rects[o + 1] - py && t < rects[o + 3] + py) return false;
    }
    for (let i = 0; i < nPlaced; i++) {
      const o = i * 4;
      if (r > placed[o] - 2 && l < placed[o + 2] + 2 && b > placed[o + 1] - 2 && t < placed[o + 3] + 2) return false;
    }
    return true;
  }
  const TRY = [0, -14, -28, -42, 14, 28, 42, 56, 70];
  /** Sign box (anchor ax/ay = tail tip, size w×h, vertical offset d) clear of the HUD and earlier signs? Records it. */
  function tryAt(ax, ay, w, h, d, W, H) {
    let l = ax - w / 2;
    const tp = ay - h + d;
    if (l < 4) l = 4; else if (l + w > W - 4) l = W - 4 - w;
    if (tp < 4 || tp + h > H - 4) return false;
    if (!clearAt(l, tp, l + w, tp + h)) return false;
    const o = nPlaced * 4; placed[o] = l; placed[o + 1] = tp; placed[o + 2] = l + w; placed[o + 3] = tp + h;
    return true;
  }
  /** Is this screen point under a HUD element (goal card, buttons, mini-map, joystick …)? */
  function covered(x, y, pad) {
    for (let i = 0; i < nRects; i++) {
      const o = i * 4;
      if (x > rects[o] - pad && x < rects[o + 2] + pad && y > rects[o + 1] - pad && y < rects[o + 3] + pad) return true;
    }
    return false;
  }
  // Edge sign spot: just inside the visible play area, under the top HUD band (or on the bottom edge for spots behind
  // you, only where it doesn't fight the joystick / buttons), at the spot's screen x clamped to the safe area, sliding a
  // little sideways around HUD bits. Writes EX/EY (top-left) and records the box.
  const SLIDE = [0, -22, 22, -44, 44, -70, 70];
  let EX = 0, EY = 0;
  function edgeAt(sx, w, h, bottom, W, H) {
    const minL = safe.l + 6, maxL = W - safe.r - 6 - w;
    if (maxL < minL) return false;
    const l0 = sx - w / 2;
    const y0 = bottom ? H - safe.b - 6 - h : safe.t + 6;
    const y1 = bottom ? y0 - 36 : Math.max(y0, H * 0.46 - h); // top: never deeper than ~the upper half
    const step = bottom ? -6 : 6;
    for (let y = y0; bottom ? y >= y1 : y <= y1; y += step) {
      for (let j = 0; j < SLIDE.length; j++) {
        let l = l0 + SLIDE[j];
        if (l < minL) l = minL; else if (l > maxL) l = maxL;
        if (j > 0 && l === (l0 < minL ? minL : l0 > maxL ? maxL : l0)) continue; // clamped back onto the first try
        if (!clearAt(l, y, l + w, y + h, EPX, EPY)) continue;
        const o = nPlaced * 4; placed[o] = l; placed[o + 1] = y; placed[o + 2] = l + w; placed[o + 3] = y + h;
        EX = l; EY = y;
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ rings
  const rings = createRings(ctx, N);

  // ------------------------------------------------------------------ per frame
  const v = new THREE.Vector3();
  const order = new Int16Array(N); // candidate indices, nearest first
  let nOrder = 0, pickT = 0, lockT = 0, wasFree = false;
  const nearFlag = new Uint8Array(N);
  /** Is this activity's own green button up right now? (you're standing at it) */
  const actBtn = () => { const e = uiRoot.querySelector('.tb-act'); return !!e && !e.hidden; };
  let btnUp = false;
  function hereAt(a) {
    const c = interact.current;
    return !!c && btnUp && Math.hypot(c.x - a.x, c.z - a.z) < 1.6;
  }
  function refreshLive() {
    for (const a of acts) {
      a.locked = !a.unlocked();
      a.on = a.present();
      if (a.y == null) a.y = colliders.heightAt(a.x, a.z) || 0;
    }
  }
  refreshLive();

  engine.addUpdate((dt, t) => {
    const isFree = free();
    if (!isFree) {
      if (wasFree) { for (const sg of signs) hideSign(sg); rings.begin(); rings.end(); }
      wasFree = false;
      return;
    }
    wasFree = true;
    const W = window.innerWidth, H = window.innerHeight;
    const px = player.pos.x, pz = player.pos.z;
    // distances (cheap, every frame) + slow refresh of lock / presence (1×/s)
    lockT -= dt;
    if (lockT <= 0) { lockT = 1; refreshLive(); }
    for (let i = 0; i < N; i++) { const a = acts[i]; a.dist = Math.hypot(a.x - px, a.z - pz); }

    // ---- rings (≤ 1 draw call): unlocked + present within RING_R, pulsing
    rings.begin();
    for (let i = 0; i < N; i++) {
      const a = acts[i];
      if (!a.on || a.locked || a.dist > RING_R) continue;
      const fade = Math.min(1, (RING_R - a.dist) / 2.5);
      const ph = t * 2.2 + i * 0.9;
      const pulse = 0.5 + 0.5 * Math.sin(ph);
      rings.put(a.x, a.y + 0.025, a.z, a.r * (1.45 + 0.12 * pulse), fade * (0.55 + 0.35 * pulse));
    }
    rings.end();

    // ---- near: tips + event (5×/s with the pick)
    // ---- pick ≤ 3 signs: present, in range, not "here", nearest first (on screen or not: edge signs) (5×/s)
    btnUp = actBtn();
    pickT -= dt;
    const camera = engine.camera;
    camera.updateMatrixWorld();
    if (pickT <= 0) {
      pickT = 0.2;
      for (let i = 0; i < N; i++) {
        const a = acts[i];
        const near = a.on && a.dist < NEAR_R;
        if (near && !nearFlag[i]) { nearFlag[i] = 1; game.emit('activity:near', { id: a.id, locked: a.locked }); tipFor(a); }
        else if (!near && a.dist > NEAR_R + 1.5) nearFlag[i] = 0;
      }
      // every spot in range counts, on screen or not (off-screen ones get an edge sign); spots behind you / below the
      // screen only get a slot after the ones ahead (they can only use the bottom edge, which is often taken)
      nOrder = 0;
      for (let i = 0; i < N; i++) {
        const a = acts[i];
        if (!a.on || a.dist > SIGN_R || hereAt(a)) continue;
        v.set(a.x, a.y + a.lift, a.z).project(camera);
        // (portrait shows a narrow strip: spots a few metres to the side are far off-screen; below the middle → bottom)
        const back = !(v.z < 1 && v.z > -1) || (v.y < -0.24 && (v.y < -1.05 || v.x < -1.05 || v.x > 1.05));
        a.rank = a.dist + (back ? 1000 : 0);
        // insertion by rank (distance)
        let k = nOrder++;
        while (k > 0 && acts[order[k - 1]].rank > a.rank) { order[k] = order[k - 1]; k--; }
        order[k] = i;
      }
      // one sign per group nearby is enough (the 4 tram stops sit far apart, but keep it tidy): skip same-group repeats
      let w = 0;
      for (let k = 0; k < nOrder; k++) {
        const a = acts[order[k]];
        let dup = false;
        for (let j = 0; j < w; j++) if (acts[order[j]].group === a.group && acts[order[j]].verb === a.verb) { dup = true; break; }
        if (!dup) order[w++] = order[k];
      }
      nOrder = Math.min(w, MAX_SIGNS);
      // keep a sign on the activity it already shows (no flicker when the order swaps)
      for (const sg of signs) {
        if (!sg.act) continue;
        let still = false;
        for (let k = 0; k < nOrder; k++) if (acts[order[k]] === sg.act) { still = true; break; }
        if (!still) hideSign(sg);
      }
      for (let k = 0; k < nOrder; k++) {
        const a = acts[order[k]];
        let has = false;
        for (const sg of signs) if (sg.act === a) { has = true; break; }
        if (has) continue;
        for (const sg of signs) if (!sg.act) { fill(sg, a); sg.act = a; break; }
      }
      for (const sg of signs) if (sg.act) fill(sg, sg.act); // lock state may have flipped
    }

    // ---- place the chosen signs (every frame, transforms written only when they change)
    refreshRects(dt, W, H);
    nPlaced = 0;
    // nearest first gets the best spot
    for (let k = 0; k < nOrder; k++) {
      const a = acts[order[k]];
      let sg = null;
      for (const s of signs) if (s.act === a) { sg = s; break; }
      if (!sg) continue;
      if (hereAt(a)) { hideSign(sg); continue; }
      v.set(a.x, a.y + a.lift, a.z).project(camera);
      const inFront = v.z < 1 && v.z > -1;
      const ax = (v.x * 0.5 + 0.5) * W, ay = (-v.y * 0.5 + 0.5) * H;
      const near = Math.max(0, Math.min(1, (SIGN_R - a.dist) / (SIGN_R - 3)));
      const sc = 0.8 + 0.2 * near;
      const op = Math.max(0, Math.min(1, (SIGN_R - a.dist) / FADE_M));
      const w = sg.w * sc, h = (sg.h + TAIL) * sc; // the box includes the yarn tail below the tag
      const canSwitch = t - sg.modeT >= DWELL; // hysteresis: a sign keeps its look for a moment (no flicker)
      let mode = -1, dy = 0, tx = 0, ty = 0, qs = 1;
      if (op > 0.02) {
        // 1. the floating tag over the spot. An edge sign only morphs back once the spot is well inside the play area.
        const worldOK = inFront && (sg.mode === 0
          ? ax > -0.05 * W && ax < 1.05 * W && ay > -0.05 * H && ay < 1.05 * H
          : canSwitch && ax > 24 && ax < W - 24 && ay > safe.t + EDGE_BACK && ay < H - 40 && !covered(ax, ay, 10));
        if (worldOK) {
          // prefer last frame's offset if it is still clear (no jitter), else try the list
          if (sg.vis && sg.mode === 0 && tryAt(ax, ay, w, h, sg.dy, W, H)) { mode = 0; dy = sg.dy; }
          else for (let j = 0; j < TRY.length; j++) if (tryAt(ax, ay, w, h, TRY[j], W, H)) { mode = 0; dy = TRY[j]; break; }
        }
        if (mode === 0) {
          let l = ax - w / 2;
          if (l < 4) l = 4; else if (l + w > W - 4) l = W - 4 - w;
          tx = l; ty = ay - h + dy; qs = sc;
        } else {
          // 2. an edge sign: the spot is off-screen (above, beside, behind) or hidden under the HUD
          const off = !inFront || ax < 0 || ax > W || ay < safe.t + 30 || ay > H || covered(ax, ay, 4);
          if (sg.mode === 1 || (canSwitch && off)) {
            // which edge: top for spots ahead, bottom for spots behind you / below the screen (sticky in between)
            const bottom = !inFront || ay > H * (sg.mode === 1 && sg.bot ? 0.42 : 0.62);
            let sx = ax;
            if (!inFront) { // behind the camera: the projection is mirrored, use which side of the view it is on
              const e = camera.matrixWorld.elements;
              sx = W / 2 + ((a.x - e[12]) * e[0] + (a.z - e[14]) * e[2] > 0 ? 0.3 : -0.3) * W;
            }
            const ew = sg.we * ES, eh = sg.he * ES;
            if (edgeAt(sx, ew, eh, bottom, W, H)) {
              mode = 1; tx = EX; ty = EY; qs = ES; sg.bot = bottom;
              // arrow from its end of the tag toward the spot: up / up-left / up-right (down… on the bottom edge)
              const arX = sg.ar ? EX + ew - 14 * ES : EX + 14 * ES, arY = EY + eh / 2;
              const gx = inFront ? ax : sx, gy = inFront ? ay : H * 3;
              let ang = Math.atan2(gx - arX, -(gy - arY)) * 57.2958; // clockwise from screen-up
              if (bottom) { if (ang < 0) ang += 360; ang = Math.max(115, Math.min(245, ang)); }
              else ang = Math.max(-65, Math.min(65, ang));
              const lean = bottom ? 180 - ang : ang; // > 0: the spot is to the right
              const ar = lean > 22 ? true : lean < -22 ? false : sg.ar;
              if (ar !== sg.ar) { sg.ar = ar; sg.el.classList.toggle('ar', ar); }
              const qa = Math.round(ang / 5) * 5;
              if (qa !== sg.rot) { sg.rot = qa; sg.arr.style.setProperty('--rot', `${qa}deg`); }
            }
          }
        }
      }
      if (mode < 0) { // nowhere free: fade out but keep the slot (it may come back next frame)
        if (sg.on && sg.o !== 0) { sg.o = 0; sg.el.style.opacity = '0'; }
        sg.vis = false; setTap(sg, false);
        continue;
      }
      nPlaced++;
      // morph between the two looks: the tag glides from where it was to its new place (offset decays, ~0.25 s);
      // an edge sign also glides when its spot along the edge jumps (HUD toast came and went, …)
      if (mode !== sg.mode) {
        if (sg.vis && sg.on && Number.isFinite(sg.x)) { sg.ox = sg.x - tx; sg.oy = sg.y - ty; } else sg.ox = sg.oy = 0;
        setMode(sg, mode); sg.modeT = t;
      } else if (mode === 1 && sg.vis) {
        // jumps (slid past a HUD bit, a toast came / went) glide; smooth drift (walking) is tracked exactly (no lag)
        const jx = sg.tx - tx, jy = sg.ty - ty;
        if (jx > 10 || jx < -10 || jy > 5 || jy < -5) { sg.ox += jx; sg.oy += jy; }
      }
      sg.tx = tx; sg.ty = ty;
      if (sg.ox !== 0 || sg.oy !== 0) {
        const kk = Math.exp(-dt * 13);
        sg.ox *= kk; sg.oy *= kk;
        if (Math.abs(sg.ox) < 0.5 && Math.abs(sg.oy) < 0.5) sg.ox = sg.oy = 0;
      }
      sg.vis = true; sg.dy = dy;
      setTap(sg, mode === 1 && sg.ox === 0 && sg.oy === 0 && op > 0.5);
      const qx = Math.round((tx + sg.ox) * 2) / 2, qy = Math.round((ty + sg.oy) * 2) / 2, qo = Math.round(op * 20) / 20;
      qs = Math.round(qs * 50) / 50;
      if (!sg.on) { sg.on = true; sg.el.hidden = false; void sg.el.offsetWidth; sg.el.classList.add('on'); sg.x = sg.y = sg.s = NaN; }
      if (qx !== sg.x || qy !== sg.y || qs !== sg.s) {
        sg.el.style.transform = `translate(${qx}px,${qy}px) scale(${qs})`;
        if (mode === 0) {
          const tail = Math.max(10, Math.min(w - 10, ax - tx)) / sc; // tail points at the spot even when clamped
          sg.el.style.setProperty('--tail', `${Math.round(tail)}px`);
        }
        sg.x = qx; sg.y = qy; sg.s = qs;
      }
      if (qo !== sg.o) { sg.o = qo; sg.el.style.opacity = String(qo); }
    }
  }, 165); // after the camera (100) and the guide (160)

  game.on('game:start', () => { for (const a of acts) a.y = null; lockT = 0; });
  game.on('progress:change', () => { lockT = 0; });
  game.on('progress:reset', () => { lockT = 0; });

  const api = {
    items: acts,
    /** Every activity: [{ id, name, verb, x, z, locked, unlockDoor, district }]. */
    list() {
      return acts.map((a) => ({ id: a.id, name: a.sub ? `${a.name} · ${a.sub}` : a.name, verb: a.verb, x: +a.x.toFixed(2), z: +a.z.toFixed(2), locked: !a.unlocked(), unlockDoor: a.door || null, district: a.district }));
    },
    /** Map helper: the activity with this id. */
    get(id) { return acts.find((a) => a.id === id) || null; },
    iconOf,
    /** "Show the way" to an activity (what tapping its edge sign does). */
    showWay(id) { const a = acts.find((q) => q.id === id); return a ? showWayTo(a) : false; },
    resetTips() { store = { seen: {} }; save(); nearFlag.fill(0); },
    get lastTip() { return lastTip; },
    state() {
      return {
        free: free(),
        signs: signs.filter((s) => s.on && s.vis).map((s) => {
          const r = s.el.getBoundingClientRect();
          return {
            id: s.act?.id, text: s.el.innerText.replace(/\s+/g, ' ').trim(), locked: s.el.classList.contains('locked'),
            x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), o: s.o,
            mode: s.mode ? 'edge' : 'float', ...(s.mode ? { edge: s.bot ? 'bottom' : 'top', arrow: s.rot } : {}),
          };
        }),
        way: lastWay,
        rings: rings.count,
        avoid: (() => { const out = []; for (let i = 0; i < nRects; i++) out.push([...rects.slice(i * 4, i * 4 + 4)].map(Math.round)); return out; })(),
        tip: lastTip,
      };
    },
  };
  return api;
}
