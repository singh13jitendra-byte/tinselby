// Activities: makes the things you can do in town easy to spot.
//
//   ctx.activities = createActivities(ctx)
//   activities.list() → [{ id, name, verb, x, z, locked, unlockDoor, district }]   (every activity; Analytics may use it)
//   activities.items  → the live activity objects (x, z, dist, locked, …; read-only)   activities.state() → diagnostics
//   activities.resetTips()                                                              (tests)
//   events: 'activity:near' { id, locked } the first time per visit you come within 2.5 m of one
//
// What it draws:
// - floating knitted signs (DOM, 0 draw calls) over the nearest ≤ 3 on-screen activities within 18 m: icon + name + verb
//   ("Ferris wheel · Ride"), or a lock + "Opens with Door N" when it's locked; they grow and fade in as you approach,
//   hide while that activity's green interact button shows (you're already there), and step around the HUD (goal card,
//   mini-map, round buttons, joystick, social buttons, guide arrow / "!" …) by reading those rects ~4×/s like src/guide.
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
const KEY = 'tinselby.acts.v1';
const AVOID = [
  '.tb-hud:not([hidden]) .tb-stats > *', '.tb-hud:not([hidden]) .tb-tc', '.tb-hud:not([hidden]) .tb-tr', '.tb-hud:not([hidden]) .tb-goal',
  '.tb-act:not([hidden])', '.tb-joylayer:not([hidden]) .tb-joy', '.tb-keys:not([hidden])',
  '.tbs-root .tbs-corner', '.tbs-root .tbs-main', '.tbs-root .tbs-extra', '.tbs-root .tbs-pill',
  '.tbm-mini:not([hidden])', '.tbg-edge:not([hidden]) .tbg-badge', '.tbg-edge:not([hidden]) .tbg-lab', '.tbg-mark:not([hidden]) .tbg-bob', '.tb-toast', '.tb-cards:not(:empty)',
  '.tbt-call:not([hidden])', '.tbt-help:not([hidden])', '.tb-bubble', '[data-guide-avoid]',
].join(',');
const MAXR = 32;

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
  const signs = [];
  for (let i = 0; i < MAX_SIGNS; i++) {
    const el = document.createElement('div');
    el.className = 'tba-sign';
    el.hidden = true;
    el.innerHTML = '<div class="tba-in"><span class="tba-ico"></span><span class="tba-txt"><b class="tba-name"></b><span class="tba-verb"></span></span></div><i class="tba-tail"></i>';
    root.appendChild(el);
    signs.push({
      el, ico: el.querySelector('.tba-ico'), name: el.querySelector('.tba-name'), verb: el.querySelector('.tba-verb'),
      act: null, key: '', w: 120, h: 34, on: false, x: NaN, y: NaN, s: NaN, o: NaN, dy: 0, vis: false,
    });
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
    sg.w = sg.el.offsetWidth || sg.w; sg.h = sg.el.offsetHeight || sg.h;
    if (was) sg.el.hidden = true;
    sg.x = sg.y = sg.s = sg.o = NaN; sg.dy = 0;
  }
  function hideSign(sg) {
    if (sg.on) { sg.on = false; sg.el.classList.remove('on'); sg.el.hidden = true; }
    sg.act = null; sg.vis = false;
  }

  // ------------------------------------------------------------------ obstacle rects (like src/guide/screen.js)
  const rects = new Float32Array(MAXR * 4);
  let nRects = 0, rectT = 0, els = [], elsT = 0;
  window.addEventListener('resize', () => { rectT = 0; elsT = 0; for (const sg of signs) sg.key = ''; });
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
  function clearAt(l, t, r, b) {
    for (let i = 0; i < nRects; i++) {
      const o = i * 4;
      if (r > rects[o] - PAD && l < rects[o + 2] + PAD && b > rects[o + 1] - PAD && t < rects[o + 3] + PAD) return false;
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
    // ---- pick ≤ 3 signs: present, in range, on screen, not "here", nearest first (5×/s)
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
      nOrder = 0;
      for (let i = 0; i < N; i++) {
        const a = acts[i];
        if (!a.on || a.dist > SIGN_R || hereAt(a)) continue;
        v.set(a.x, a.y + a.lift, a.z).project(camera);
        if (!(v.z < 1 && v.z > -1) || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.1) continue;
        // insertion by distance
        let k = nOrder++;
        while (k > 0 && acts[order[k - 1]].dist > a.dist) { order[k] = order[k - 1]; k--; }
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
      let ok = false, dy = 0;
      if (inFront && op > 0.02) {
        // prefer last frame's offset if it is still clear (no jitter), else try the list
        if (sg.vis && tryAt(ax, ay, w, h, sg.dy, W, H)) { ok = true; dy = sg.dy; }
        else for (let j = 0; j < TRY.length; j++) if (tryAt(ax, ay, w, h, TRY[j], W, H)) { ok = true; dy = TRY[j]; break; }
      }
      if (!ok) { // nowhere free: fade out but keep the slot (it may come back next frame)
        if (sg.on && sg.o !== 0) { sg.o = 0; sg.el.style.opacity = '0'; }
        sg.vis = false;
        continue;
      }
      nPlaced++;
      sg.vis = true; sg.dy = dy;
      let l = ax - w / 2;
      if (l < 4) l = 4; else if (l + w > W - 4) l = W - 4 - w;
      const tail = Math.max(10, Math.min(w - 10, ax - l)) / sc; // tail points at the spot even when clamped
      const qx = Math.round(l * 2) / 2, qy = Math.round((ay - h + dy) * 2) / 2, qs = Math.round(sc * 50) / 50, qo = Math.round(op * 20) / 20;
      if (!sg.on) { sg.on = true; sg.el.hidden = false; void sg.el.offsetWidth; sg.el.classList.add('on'); sg.x = sg.y = sg.s = NaN; }
      if (qx !== sg.x || qy !== sg.y || qs !== sg.s) {
        sg.el.style.transform = `translate(${qx}px,${qy}px) scale(${qs})`;
        sg.el.style.setProperty('--tail', `${Math.round(tail)}px`);
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
    resetTips() { store = { seen: {} }; save(); nearFlag.fill(0); },
    get lastTip() { return lastTip; },
    state() {
      return {
        free: free(),
        signs: signs.filter((s) => s.on && s.vis).map((s) => {
          const r = s.el.getBoundingClientRect();
          return { id: s.act?.id, text: s.el.innerText.replace(/\s+/g, ' ').trim(), locked: s.el.classList.contains('locked'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), o: s.o };
        }),
        rings: rings.count,
        avoid: (() => { const out = []; for (let i = 0; i < nRects; i++) out.push([...rects.slice(i * 4, i * 4 + 4)].map(Math.round)); return out; })(),
        tip: lastTip,
      };
    },
  };
  return api;
}
