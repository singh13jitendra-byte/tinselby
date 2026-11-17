import * as THREE from 'three';

/**
 * Keyboard (WASD / arrows, E/Space/Enter = interact, C = camera view, M = mute),
 * tap / click to walk, and a joystick vector the UI feeds in with setJoystick(x, y) (−1..1, y up = forward).
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

  canvas.addEventListener('pointerdown', (e) => {
    if (input.enabled === false) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
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
  });

  const input = {
    enabled: true,
    /** World-space desired move direction (x, z) given the camera yaw; length 0..1. */
    getMove(camYaw, px, pz) {
      const out = new THREE.Vector2();
      if (!input.enabled) return out;
      let f = 0, r = 0;
      if (keys.has('w') || keys.has('arrowup')) f += 1;
      if (keys.has('s') || keys.has('arrowdown')) f -= 1;
      if (keys.has('d') || keys.has('arrowright')) r += 1;
      if (keys.has('a') || keys.has('arrowleft')) r -= 1;
      f += joy.y; r += joy.x;
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
