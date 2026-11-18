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
const VIEW_LEFT = HOUSE.x - 0.8; // left edge of the close-up on the facade: 0.05 past the west wall, 0.1 inside the street garland (x -14.5)
const NEAR_CAM_Z = 0.75; // just north of the south pavement garland (z 0.9)
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
  const tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpU = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let free = { w: 0.58, h: 1 }, panel = null;
  function frame(out, dt) {
    const c = engine.camera, aspect = Math.max(0.2, c.aspect || innerWidth / innerHeight);
    const portrait = innerWidth < innerHeight;
    let gw = 1, gh = 1;
    if (panel) {
      if (portrait) gh = 1 - clamp(panel.el.offsetHeight / innerHeight, 0, 0.7);
      else gw = 1 - clamp((panel.el.offsetWidth + 14) / innerWidth, 0, 0.55);
    }
    const k = 1 - Math.exp(-dt * 6);
    free.w = lerp(free.w, gw, k); free.h = lerp(free.h, gh, k);
    const tf = Math.tan((c.fov * Math.PI) / 360), tw = tf * aspect;
    // Holly Lane's lamp-to-lamp garlands (festive.js: z ±0.9, cord y 1.11-1.31, a knitted lantern hanging to y 0.88
    // at x -13.78 north / -13.18 south) run between the street and the facade. Two camera spots keep them tidy:
    //  near (the cottage fits the free width from 2.7 away: landscape, tablets): north of the south garland, so only
    //       the north one is in view;
    //  far  (phone portrait): against the south row, low enough that the south garland passes above the frame.
    // Eye height is chosen so the north cord and its lantern project onto the blank wall band between the two floors
    // (y 0.92-1.36) instead of across the windows, the door and the wreath.
    const near = tw * gw >= 0.28;
    const d = (near ? NEAR_CAM_Z : MAX_CAM_Z) - TARGET.z, cy = near ? 0.94 : 0.85;
    // The cross-street garland at x -14.5 hangs 0.15 west of the cottage. The camera stands east of it and pans right
    // until the left edge of the picture meets the facade just inside that garland (VIEW_LEFT): neither its cord nor
    // its star can cross the shot, and the cottage sits flush left, beside (landscape) or above (portrait) the panel.
    const left = near ? VIEW_LEFT : VIEW_LEFT + 0.08; // phone portrait is only ~1.5 wide at the facade: keep the owner by the door in
    const cx = Math.min(left + d * tw, HOUSE.x + 0.35);
    const yaw = Math.max(0, Math.atan(tw) - Math.atan((cx - left) / d));
    out.pos.set(cx, cy, TARGET.z + d);
    // framed from the doorstep up (door, wreath, ground-floor window, snowman, owner); the upper windows may crop
    out.target.set(cx + Math.tan(yaw) * d, near ? 0.86 : 0.82, TARGET.z);
    // portrait: lift the facade into the free area above the bottom sheet
    tmpF.copy(out.target).sub(out.pos);
    const visH = 2 * tf * tmpF.length();
    tmpF.normalize();
    tmpR.crossVectors(tmpF, UP).normalize();
    tmpU.crossVectors(tmpR, tmpF);
    out.target.addScaledVector(tmpU, -((1 - free.h) / 2) * visH);
  }

  let openPromise = null, holdCarriage = null;
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
      player.teleport(HOUSE.door.x + 0.33, HOUSE.door.z + 0.1, 0); // beside the door, facing the camera: wreath and door stay visible (and inside the narrow portrait frame)
      holdCarriage = ctx.life?.holdVehicle?.('carriage') || null; // the ambient carriage would drive through the close-up
      uiRoot.classList.add('tb-house-open');
      refresh();
      emit('house:open', { first });
      cam.setMode('close');
      free = { w: 0.58, h: innerWidth < innerHeight ? 0.58 : 1 };
      cam.playShot({
        name: 'house', duration: 1e5, skippable: false, blendIn: 0.9, blendOut: 0.6, tilt: 0.5, portrait: false, post: CAM_SHOT,
        update(u, out, s) { frame(out, s?.dt ?? 0.016); },
      });
      const end = (style) => {
        panel?.close(); panel = null;
        if (holdCarriage) { try { holdCarriage(); } catch (e) { /* ignore */ } holdCarriage = null; }
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
