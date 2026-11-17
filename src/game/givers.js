// Quest givers: knitted dolls standing at their layout spot, facing the player when close,
// with a bobbing glowing star above them while their task is waiting.
import * as THREE from 'three';
import { buildCharacter } from '../core/player.js';
const DOLL_H = 0.44; // doll height incl. pom-pom (chibi dolls)

export function createGiver(ctx, models, { id, who, style, opts, scale, x, z }) {
  const { engine, colliders, player } = ctx;
  const ch = buildCharacter(engine.mat, style, opts);
  // limbs are tiny: skip their shadows to save draw calls
  ch.group.traverse((o) => { if (o.isMesh && o.parent !== ch.body) o.castShadow = false; });
  ch.group.scale.setScalar(scale);
  const root = new THREE.Group();
  const y = colliders.heightAt(x, z);
  root.position.set(x, y, z);
  root.add(ch.group);
  const marker = models.mesh(models.markerGeo, false);
  marker.position.y = DOLL_H * scale + 0.28;
  root.add(marker);
  engine.scene.add(root);
  try { colliders.addCircle(x, z, 0.11 * scale); } catch (e) { /* colliders optional */ }

  // face roughly toward the market centre to start with
  let yaw = Math.atan2(-x, -z);
  let hop = 0, wave = 0;
  const head = new THREE.Vector3();
  const giver = {
    id, who, root, ch, marker, x, z,
    showMarker: false,
    /** World position just above the head (for speech bubbles). */
    headPos() { return head.set(x, root.position.y + DOLL_H * scale + 0.12, z); },
    hop() { hop = 1.2; },
    wave() { wave = 1.6; },
    update(dt, t) {
      const dx = player.pos.x - x, dz = player.pos.z - z, d = Math.hypot(dx, dz);
      if (d < 3) {
        const goal = Math.atan2(dx, dz);
        let dy = goal - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        yaw += dy * Math.min(1, dt * 5);
      }
      ch.yaw.rotation.y = yaw;
      ch.animate(dt, 0);
      if (wave > 0) {
        wave -= dt;
        ch.arms[1].rotation.x = -2.4 + Math.sin(t * 12) * 0.4;
        ch.arms[1].rotation.z = 0.5;
      } else ch.arms[1].rotation.z = 0.25;
      if (hop > 0) {
        hop -= dt;
        ch.group.position.y = Math.abs(Math.sin(hop * 9)) * 0.08 * Math.min(1, hop);
      } else ch.group.position.y = 0;
      marker.visible = giver.showMarker;
      if (marker.visible) {
        marker.position.y = DOLL_H * scale + 0.28 + Math.sin(t * 2.6) * 0.05;
        marker.rotation.y = t * 1.6;
      }
    },
  };
  return giver;
}
