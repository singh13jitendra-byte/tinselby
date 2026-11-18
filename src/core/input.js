import * as THREE from 'three';

/**
 * Keyboard (WASD / arrows, E/Space/Enter = interact, C = camera view, M = mute),
 * tap / click to walk, and a joystick vector the UI feeds in with setJoystick(x, y) (−1..1, y up = forward).
 * Eye view (input.eyeView, set by the camera director): W/S + joystick y walk forward/back, A/D strafe, ←/→ and
 * joystick x turn (getTurn), and a drag / swipe on the canvas looks around (consumeLook) — a short press without
 * moving is still tap-to-walk.
 */
export function createInput(canvas, engine, game, colliders) {
  const keys = new Set();
  const joy = new THREE.Vector2();
  let tapTarget = null;
  let gestured = false;
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function gesture() {
    if (!gestured) { gestured = true; game.emit('input:gesture'); }
  }
  const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    gesture();
    const k = e.key.toLowerCase();
    if (MOVE.includes(k)) { keys.add(k); tapTarget = null; e.preventDefault(); }
    else if (k === 'e' || k === ' ' || k === 'enter') { game.emit('interact'); e.preventDefault(); }
    else if (k === 'c') game.emit('camera:toggle');
    else if (k === 'm') game.emit('audio:toggle');
    else if (k === 'escape') game.emit('ui:escape');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('pointerdown', gesture, { capture: true });

  // eye view: a press on the canvas becomes a look-drag once it moves a few pixels, otherwise a tap on release
  const DRAG_PX = 8;
  const look = { x: 0, y: 0 };
  const drags = new Map(); // pointerId → { x, y, sx, sy, moved }
  canvas.addEventListener('pointerdown', (e) => {
    if (input.enabled === false) return;
    if (input.eyeView) {
      if (e.button != null && e.button > 0) return;
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      return;
    }
    tapAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > DRAG_PX) d.moved = true;
    if (d.moved && input.eyeView) {
      const s = Math.max(1, Math.min(window.innerWidth, window.innerHeight));
      look.x += (e.clientX - d.x) / s;
      look.y += (e.clientY - d.y) / s;
    }
    d.x = e.clientX; d.y = e.clientY;
  });
  const endDrag = (e, tap) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    drags.delete(e.pointerId);
    if (tap && !d.moved && input.enabled !== false) tapAt(d.sx, d.sy);
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, true));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, false));

  function tapAt(cx, cy) {
    const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, engine.camera);
    let hit = null;
    if (colliders.groundMeshes.length) {
      const hits = ray.intersectObjects(colliders.groundMeshes, false);
      if (hits.length) hit = hits[0].point;
    }
    if (!hit) { const p = new THREE.Vector3(); if (ray.ray.intersectPlane(plane, p)) hit = p; }
    if (hit) {
      tapTarget = hit.clone();
      game.emit('input:tap', { point: tapTarget.clone() });
    }
  }

  const input = {
    enabled: true,
    /** Set by the camera director while the eye (first-person) view is active. */
    eyeView: false,
    /** True while a look-drag is in progress (eye view). */
    get looking() { for (const d of drags.values()) if (d.moved) return true; return false; },
    /** Look-drag since the last call, in short-screen-side units (x right, y down); resets the accumulator. */
    consumeLook() { const o = { x: look.x, y: look.y }; look.x = 0; look.y = 0; return o; },
    /** Eye view turn input −1..1 (+ = turn right): ←/→ keys and joystick x. */
    getTurn() {
      if (!input.enabled || !input.eyeView) return 0;
      let t = joy.x;
      if (keys.has('arrowright')) t += 1;
      if (keys.has('arrowleft')) t -= 1;
      if (t) tapTarget = null;
      return Math.max(-1, Math.min(1, t));
    },
    /** World-space desired move direction (x, z) given the camera yaw; length 0..1. */
    getMove(camYaw, px, pz) {
      const out = new THREE.Vector2();
      if (!input.enabled) return out;
      let f = 0, r = 0;
      if (keys.has('w') || keys.has('arrowup')) f += 1;
      if (keys.has('s') || keys.has('arrowdown')) f -= 1;
      const eye = input.eyeView;
      if (keys.has('d') || (!eye && keys.has('arrowright'))) r += 1;
      if (keys.has('a') || (!eye && keys.has('arrowleft'))) r -= 1;
      f += joy.y; if (!eye) r += joy.x; // eye view: joystick x turns (getTurn) instead of strafing
      if (f || r) {
        tapTarget = null;
        const fwd = new THREE.Vector2(-Math.sin(camYaw), -Math.cos(camYaw));
        const right = new THREE.Vector2(Math.cos(camYaw), -Math.sin(camYaw));
        out.copy(fwd).multiplyScalar(f).addScaledVector(right, r);
        if (out.length() > 1) out.normalize();
        return out;
      }
      if (tapTarget) {
        const dx = tapTarget.x - px, dz = tapTarget.z - pz, d = Math.hypot(dx, dz);
        if (d < 0.08) { tapTarget = null; return out; }
        out.set(dx / d, dz / d).multiplyScalar(Math.min(1, d / 0.35));
      }
      return out;
    },
    get tapTarget() { return tapTarget; },
    clearTap() { tapTarget = null; },
    setJoystick(x, y) { joy.set(x, y); if (x || y) tapTarget = null; },
    setTap(x, z) { tapTarget = new THREE.Vector3(x, 0, z); },
  };
  return input;
}
