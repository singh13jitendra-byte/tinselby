// Christmas card scene shots: the player's own doll posed in front of a landmark, rendered once into a canvas.
// No per-frame cost: a fresh doll (buildCharacter with the player's style, cached per style) is added to the scene only
// for the one render and removed straight after; the real player, renderer size, post settings, shadow box and snow
// centre are all put back exactly as they were (same restore pattern as the photo module's capture()).
import * as THREE from 'three';
import { buildCharacter } from '../core/player.js';
import { MARKET } from '../core/layout.js';
import { gradeCanvas, filterById } from '../photo/frames.js';

const FERRIS = { x: 18.3, z: -3.7, yaw: -0.4 }; // src/city/lakeside.js buildFerris(K, 18.3, -3.7), YAW −0.4
const GAZEBO = { x: 3.0, z: 11.6 }; // src/city/park.js
const fw = (lx, lz) => { // Ferris-local (x right, z out of the wheel's face) → world
  const c = Math.cos(FERRIS.yaw), s = Math.sin(FERRIS.yaw);
  return [FERRIS.x + lx * c + lz * s, FERRIS.z - lx * s + lz * c];
};

/**
 * Shots. at = where the doll stands (it turns to face the camera, then `turn` more), cam = camera position (y above
 * the ground there), look = the point the camera aims at, fov = vertical FOV, pose = arms, look = photo look (frames.js).
 * district = the city group that must be revealed for the landmark to be standing (else the scene is locked).
 */
export const SHOTS = {
  tree: {
    district: 'market', pose: 'wave', filter: 'cosy',
    at: [MARKET.tree.x + 0.25, MARKET.tree.z + 2.0], cam: [MARKET.tree.x + 0.7, 0.42, MARKET.tree.z + 3.4],
    look: [MARKET.tree.x - 0.05, 1.22, MARKET.tree.z], fov: 64, turn: 0.15,
  },
  wheel: {
    district: 'lakeside', pose: 'cheer', filter: 'cosy',
    at: fw(0.2, 3.45), cam: [fw(0.7, 4.8)[0], 0.5, fw(0.7, 4.8)[1]],
    look: [fw(0, 0)[0], 1.5, fw(0, 0)[1]], fov: 66, turn: 0.15,
  },
  park: {
    district: 'park', pose: 'wave', filter: 'snowy',
    at: [GAZEBO.x - 1.05, GAZEBO.z + 2.3], cam: [GAZEBO.x - 1.35, 0.42, GAZEBO.z + 3.5],
    look: [GAZEBO.x, 0.72, GAZEBO.z], fov: 56, turn: 0.2,
  },
};

const tmp = new THREE.Vector3();

/** Rest / wave / cheer arms on a freshly built doll. */
function pose(ch, kind) {
  const [aL, aR] = ch.arms;
  ch.body.rotation.set(0, 0, 0); ch.body.position.set(0, 0, 0);
  aL.rotation.set(0, 0, -0.25); aR.rotation.set(0, 0, 0.25);
  if (kind === 'wave') { aR.rotation.set(0, 0, 2.5); ch.body.rotation.z = -0.06; }
  else if (kind === 'cheer') { aL.rotation.set(-2.7, 0, -0.55); aR.rotation.set(-2.7, 0, 0.55); ch.body.position.y = 0.02; }
}

export function createSceneShooter(ctx) {
  const { engine, player, game, colliders } = ctx;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 140);
  const root = new THREE.Group();
  root.name = 'card-doll';
  let doll = null, dollKey = '';

  function getDoll() {
    const key = JSON.stringify(game.state.style || {});
    if (doll && key === dollKey) return doll;
    if (doll) { // a new outfit since last time: free the old doll's geometries (built fresh per call, materials shared)
      doll.group.removeFromParent();
      doll.group.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
    }
    doll = buildCharacter(engine.mat, game.state.style || {});
    doll.group.scale.setScalar(1.15); // same as the player (src/core/player.js SCALE)
    dollKey = key;
    root.add(doll.group);
    return doll;
  }

  /** Is the scene's landmark standing (its district revealed)? */
  function available(id) {
    const s = SHOTS[id];
    if (!s) return false;
    const city = ctx.city;
    if (!city?.isRevealed) return true;
    return !!city.isRevealed(s.district);
  }

  /** Render shot `id` into a new W×H canvas (graded with the shot's photo look). Throws on failure (state restored). */
  function shoot(id, W, H) {
    const s = SHOTS[id];
    if (!s) throw new Error('unknown scene ' + id);
    const r = engine.renderer, post = engine.post, gl = r.getContext();
    const lim = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, 4096);
    const f = Math.min(1, lim / Math.max(W, H));
    const Wr = Math.max(16, Math.floor(W * f)), Hr = Math.max(16, Math.floor(H * f));

    // doll in place, facing the camera
    const ch = getDoll();
    const [ax, az] = s.at, gy = colliders.heightAt(ax, az);
    const cx = s.cam[0], cz = s.cam[2], cy = colliders.heightAt(cx, cz) + s.cam[1];
    root.position.set(ax, gy, az);
    ch.yaw.rotation.y = Math.atan2(cx - ax, cz - az) + (s.turn || 0);
    try { ch.animate(1 / 30, 0); } catch (e) { /* idle pose only */ }
    pose(ch, s.pose);
    camera.fov = s.fov; camera.aspect = Wr / Hr; camera.near = 0.08; camera.far = 140;
    camera.position.set(cx, cy, cz);
    camera.lookAt(s.look[0], s.look[1], s.look[2]);
    camera.updateProjectionMatrix();

    // save everything this render touches
    const keepPost = { focus: post.focus, strength: post.strength, band: post.band, falloff: post.falloff };
    const keepVis = player.object.visible;
    const key = engine.key, fill = engine.fill;
    const keepKey = [key.position.clone(), key.target.position.clone(), fill.position.clone(), fill.target.position.clone()];
    const pts = [];
    engine.scene.traverse((o) => {
      const u = o.isPoints && o.material?.uniforms;
      if (u?.uScale) pts.push([u, u.uScale.value, u.uCenter ? u.uCenter.value.clone() : null]);
    });
    const out = document.createElement('canvas');
    out.width = Wr; out.height = Hr;
    try {
      engine.scene.add(root);
      player.object.visible = false; // the doll stands in for the player (no double if you're standing right there)
      // shadow box + fill light centred on the subject (engine.step's maths, without the camera nudge)
      const fx = Math.round(((ax + s.look[0]) / 2) / 0.25) * 0.25, fz = Math.round(((az + s.look[2]) / 2) / 0.25) * 0.25;
      const kd = engine.env.keyDir;
      key.target.position.set(fx, 0, fz); key.position.set(fx + kd.x * 20, kd.y * 20, fz + kd.z * 20);
      const fd = tmp.copy(keepKey[2]).sub(keepKey[3]);
      fill.target.position.set(fx, 0, fz); fill.position.set(fx + fd.x, fd.y, fz + fd.z);
      key.target.updateMatrixWorld(); fill.target.updateMatrixWorld();
      // snow falls round the subject, flakes sized for this canvas
      for (const [u] of pts) { u.uScale.value = 55 * (Hr / 540); if (u.uCenter) u.uCenter.value.set(ax, 0, az); }
      // tilt-shift: sharp on the doll, soft fall-off towards the top (the landmark stays readable)
      tmp.set(ax, gy + 0.28, az).project(camera);
      post.focus = Number.isFinite(tmp.y) ? Math.max(0, Math.min(1, (tmp.y + 1) / 2)) : 0.3;
      post.band = 0.3; post.falloff = 0.5; post.strength = 0.55;
      r.setPixelRatio(1);
      r.setSize(Wr, Hr, false);
      post.setSize(Wr, Hr);
      post.render(engine.scene, camera, engine.time);
      out.getContext('2d').drawImage(r.domElement, 0, 0, Wr, Hr);
    } finally {
      root.removeFromParent();
      player.object.visible = keepVis;
      Object.assign(post, keepPost);
      key.position.copy(keepKey[0]); key.target.position.copy(keepKey[1]);
      fill.position.copy(keepKey[2]); fill.target.position.copy(keepKey[3]);
      key.target.updateMatrixWorld(); fill.target.updateMatrixWorld();
      for (const [u, v, c] of pts) { u.uScale.value = v; if (c && u.uCenter) u.uCenter.value.copy(c); }
      engine.resize();
      post.render(engine.scene, engine.camera, engine.time); // repaint the screen at its own size (no blank frame)
    }
    try { gradeCanvas(out, filterById(s.filter)); } catch (e) { /* ungraded is fine */ }
    return out;
  }

  return { shoot, available, SHOTS, get doll() { return doll; } };
}
