// ctx.house: the player's own cottage on Holly Lane (door 10). A decoration overlay on the existing cream north-row
// townhouse (one merged mesh, <= 4k tris), a decorate panel with a close-up camera, saved through ctx.progress.
// API (WAVE2.md §House): OPTIONS, DEFAULT, owned, style, isOpen, decorate({first, auto}), setStyle(style), houseRef.
// Events: house:open {first}, house:close {style, first}, house:change {style}. Test hook: window.__house.
import * as THREE from 'three';
import { HOUSE } from '../core/layout.js';
import { OPTIONS, DEFAULT, buildDecor } from './decor.js';
import { createPanel } from './panel.js';

const HOUSE_NEIGHBOUR = false; // stretch: show a nearby online player's decorations next door (off until the lead says go)
const FALLBACK_KEY = 'tinselby.house.v1'; // only used while progress.house doesn't exist yet
const CAM_SHOT = { bloom: 0.6, glow: 0.8, threshold: 0.1, band: 0.34, falloff: 0.5 };
const TARGET = new THREE.Vector3(HOUSE.x - 0.05, 1.0, HOUSE.z + HOUSE.d / 2); // the facade, door height
const MAX_CAM_Z = 1.62; // stay in the street, in front of the south row's front walls (z 1.95)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;

function sanitize(s) {
  const out = { ...DEFAULT };
  if (s && typeof s === 'object') for (const k in OPTIONS) if (OPTIONS[k].some((o) => o.key === s[k])) out[k] = s[k];
  return out;
}
const same = (a, b) => Object.keys(OPTIONS).every((k) => a[k] === b[k]);
/** Style code for the net stretch: four option indices, e.g. 'w1l2d3s0'. */
export const styleCode = (s) => ['wreath', 'lights', 'door', 'snowman'].map((k) => k[0] + Math.max(0, OPTIONS[k].findIndex((o) => o.key === s[k]))).join('');

export function createHouse(ctx) {
  const { engine, game, player, cam, colliders, interact, uiRoot, input } = ctx;
  const emit = (e, d) => game.emit(e, d);
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* ignore */ } };
  const city = () => ctx.city;
  const houseRef = city()?.residential?.houses?.find((h) => Math.abs(h.x - HOUSE.x) < 0.01 && Math.abs(h.z - HOUSE.z) < 0.01) || null;
  const lit0 = houseRef ? !!houseRef.lit : true;

  // ---- persistence (progress.house when it exists, a local key until then)
  const store = {
    get() {
      try {
        const p = ctx.progress?.house;
        const v = p?.get ? p.get() : (() => { const j = localStorage.getItem(FALLBACK_KEY); return j ? JSON.parse(j) : null; })();
        return v ? sanitize(v) : null;
      } catch (e) { return null; }
    },
    set(s) {
      try {
        if (ctx.progress?.house?.set) ctx.progress.house.set(s);
        else localStorage.setItem(FALLBACK_KEY, JSON.stringify(s));
      } catch (e) { /* ignore */ }
    },
    clearFallback() { try { localStorage.removeItem(FALLBACK_KEY); } catch (e) { /* ignore */ } },
  };
  const isOwned = () => !!store.get() || ctx.progress?.state?.(10) === 'done';
  const savedStyle = () => store.get() || { ...DEFAULT };

  // ---- overlay mesh
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), engine.mat);
  mesh.name = 'house-decor';
  mesh.position.set(HOUSE.x, 0.035, HOUSE.z);
  mesh.rotation.y = HOUSE.heading || 0;
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.visible = false;
  engine.scene.add(mesh);
  const blocker = colliders.addCircle(HOUSE.snowman.x, HOUSE.snowman.z, 0.15, 'house-snowman');
  blocker.enabled = false;
  let tris = 0, builtSig = '', lightsApplied = false, preview = null, isOpen = false, openFirst = false;

  const shown = () => (isOwned() || isOpen) && !!city()?.isRevealed?.('residential');
  const current = () => preview || savedStyle();

  function refresh() {
    const vis = shown();
    const st = vis ? current() : null;
    const sig = vis ? JSON.stringify(st) : '';
    if (sig !== builtSig) {
      builtSig = sig;
      const old = mesh.geometry;
      const g = st ? buildDecor(st) : null;
      mesh.geometry = g || new THREE.BufferGeometry();
      old.dispose();
      tris = g ? g.attributes.position.count / 3 : 0;
    }
    mesh.visible = !!st && tris > 0;
    blocker.enabled = !!st && st.snowman !== 'none';
    if (houseRef) {
      if (st) { const on = st.lights !== 'off'; if (!lightsApplied || houseRef.lit !== on) { houseRef.setLights(on); lightsApplied = true; } }
      else if (lightsApplied) { houseRef.setLights(lit0); lightsApplied = false; }
    }
  }

  let acc = 0;
  engine.addUpdate((dt) => { acc += dt; if (acc > 0.25) { acc = 0; refresh(); } });
  for (const e of ['district:revealed', 'progress:change', 'door:complete', 'game:start']) game.on(e, refresh);
  game.on('progress:reset', () => { store.clearFallback(); preview = null; refresh(); });

  // ---- redecorate spot at the front door
  interact.add({
    id: 'house-decorate', x: HOUSE.door.x, z: HOUSE.door.z, r: 0.8, label: 'Decorate your house', icon: 'home',
    enabled: () => game.state.phase === 'play' && isOwned() && !isOpen && !ctx.minigames?.active,
    onInteract: () => { api.decorate(); },
  });

  // ---- close-up camera (aspect aware: side panel in landscape, bottom sheet in portrait)
  const tmpC = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpU = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let free = { w: 0.58, h: 1 }, panel = null;
  function frame(out, dt) {
    const c = engine.camera, aspect = Math.max(0.2, c.aspect || innerWidth / innerHeight);
    const portrait = innerWidth < innerHeight;
    const port = clamp((1.1 - aspect) / 0.55, 0, 1);
    const a = -(0.1 + port * 0.12); // camera a touch left of the door: clear of the street lamps (x -12.7 / -12.1) and the garland at x -14.5
    let gw = 1, gh = 1;
    if (panel) {
      if (portrait) gh = 1 - clamp(panel.el.offsetHeight / innerHeight, 0, 0.7);
      else gw = 1 - clamp((panel.el.offsetWidth + 14) / innerWidth, 0, 0.55);
    }
    const k = 1 - Math.exp(-dt * 6);
    free.w = lerp(free.w, gw, k); free.h = lerp(free.h, gh, k);
    const tf = Math.tan((c.fov * Math.PI) / 360);
    const needW = portrait ? 1.95 : 2.1, needH = portrait ? 2.1 : 2.15;
    const maxD = (MAX_CAM_Z - TARGET.z) / Math.cos(a);
    // the camera only turns towards the free area (it never slides sideways in front of a lamp post)
    const d = clamp(Math.max(needW / (2 * tf * aspect * free.w), needH / (2 * tf * free.h)), 2.4, maxD);
    out.target.copy(TARGET);
    out.pos.set(TARGET.x + Math.sin(a) * d, 1.4, TARGET.z + Math.cos(a) * d);
    tmpF.copy(out.target).sub(out.pos).normalize();
    tmpR.crossVectors(tmpF, UP).normalize();
    tmpU.crossVectors(tmpR, tmpF);
    const visW = 2 * tf * aspect * d, visH = 2 * tf * d;
    const dx = ((1 - free.w) / 2) * visW, dy = ((1 - free.h) / 2) * visH;
    tmpC.copy(tmpR).multiplyScalar(dx).addScaledVector(tmpU, -dy);
    out.target.add(tmpC);
  }

  let openPromise = null;
  function decorate({ first = false, auto = false } = {}) {
    if (openPromise) return openPromise;
    if (auto) {
      const st = store.get() || { ...DEFAULT };
      api.setStyle(st);
      return Promise.resolve(st);
    }
    openPromise = new Promise((resolve) => {
      isOpen = true; openFirst = first;
      const prev = savedStyle();
      preview = { ...prev };
      const prevCtl = player.controllable, prevEnabled = input.enabled, prevMode = cam.mode;
      player.controllable = false; input.enabled = false;
      player.teleport(HOUSE.door.x + 0.5, HOUSE.door.z, 0); // beside the door, facing the camera: wreath and door stay visible
      uiRoot.classList.add('tb-house-open');
      refresh();
      emit('house:open', { first });
      cam.setMode('close');
      free = { w: 0.58, h: 1 };
      cam.playShot({
        name: 'house', duration: 1e5, skippable: false, blendIn: 0.9, blendOut: 0.6, tilt: 0.5, portrait: false, post: CAM_SHOT,
        update(u, out, s) { frame(out, s?.dt ?? 0.016); },
      });
      const end = (style) => {
        panel?.close(); panel = null;
        isOpen = false; openPromise = null; preview = null;
        uiRoot.classList.remove('tb-house-open');
        cam.release('house');
        cam.setMode(prevMode);
        player.teleport(HOUSE.door.x, HOUSE.door.z, 0);
        player.controllable = prevCtl; input.enabled = prevEnabled;
        if (style) api.setStyle(style);
        refresh();
        const fin = savedStyle();
        emit('house:close', { style: fin, first });
        resolve(fin);
      };
      panel = createPanel({
        root: uiRoot, OPTIONS, style: prev, first, sfx,
        onChange: (s) => { preview = s; refresh(); emit('house:change', { style: s }); },
        onDone: (s) => end(s),
        onCancel: () => end(first ? { ...DEFAULT } : null),
      });
    });
    return openPromise;
  }

  const api = {
    OPTIONS, DEFAULT,
    get owned() { return isOwned(); },
    get style() { return savedStyle(); },
    get isOpen() { return isOpen; },
    get houseRef() { return houseRef; },
    decorate,
    setStyle(style) {
      const st = sanitize(style);
      store.set(st);
      refresh();
      emit('house:change', { style: st });
      if (HOUSE_NEIGHBOUR) { try { ctx.net?.setStyle?.({ house: styleCode(st) }); } catch (e) { /* offline play must never break */ } }
    },
  };

  window.__house = {
    open: (first = false) => decorate({ first }),
    set: (s) => api.setStyle(s),
    get style() { return api.style; },
    get owned() { return api.owned; },
    get isOpen() { return isOpen; },
    budget: () => ({ calls: mesh.visible ? 1 : 0, tris }),
    refresh,
  };
  return api;
}
