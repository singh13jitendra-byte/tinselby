// Quest givers: knitted dolls standing at their door spot, facing the player when close, with a bobbing glowing
// star above them while their door is the current one. To keep draw calls low each doll is compacted into
// 2 meshes (body + legs + left arm merged; the right arm stays separate so it can wave).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCharacter } from '../core/player.js';
const DOLL_H = 0.44; // doll height incl. pom-pom (chibi dolls)

function compact(ch) {
  const bodyMesh = ch.body.children.find((o) => o.isMesh);
  if (!bodyMesh) return;
  const parts = [bodyMesh.geometry];
  const drop = [];
  for (const piv of [...ch.legs, ch.arms[0]]) {
    piv.updateMatrix();
    const m = piv.children.find((o) => o.isMesh);
    if (!m) continue;
    m.updateMatrix();
    parts.push(m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(piv.matrix, m.matrix)));
    drop.push(m);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) return;
  merged.computeBoundingSphere();
  for (const g of parts) g.dispose();
  for (const m of drop) m.removeFromParent();
  bodyMesh.geometry = merged;
}

export function createGiver(ctx, models, { id, who, style, opts, scale = 1, x, z }) {
  const { engine, colliders, player } = ctx;
  // nudge the spot off any collider it landed on (stalls, firs, lanterns …)
  const p = { x, z };
  try { colliders.resolve(p, 0.06 + 0.11 * scale); } catch (e) { /* colliders optional */ }
  x = p.x; z = p.z;
  const ch = buildCharacter(engine.mat, style, opts);
  compact(ch);
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
  try { colliders.addCircle(x, z, 0.11 * scale, 'giver'); } catch (e) { /* colliders optional */ }

  // face roughly toward the market centre to start with
  const yaw0 = Math.atan2(-x, -z);
  let yaw = yaw0;
  let hop = 0, wave = 0, pop = 0;
  // wave 3: the doll can be moved off its spot (finale gathering: x/z stay the spot, px/pz are where it stands now),
  // told to face a point instead of the player, and hidden (ref-counted by token, see tasks.setGiverHidden)
  let px = x, pz = z, faceTo = null;
  const head = new THREE.Vector3();
  const giver = {
    id, who, root, ch, marker, x, z, scale,
    showMarker: false,
    hiddenBy: new Set(),
    get hidden() { return giver.hiddenBy.size > 0; },
    get gathered() { return px !== x || pz !== z; },
    /** World position just above the head (for speech bubbles). */
    headPos() { return head.set(px, root.position.y + DOLL_H * scale + 0.12, pz); },
    hop() { hop = 1.2; },
    wave() { wave = 1.6; },
    /** A quick grow-in (0.6 → 1), used by the gathering. */
    pop() { pop = 1; },
    /** Stand somewhere else (null → back on the spot). Collider and interact spot stay where they were. */
    moveTo(nx, nz) {
      px = nx == null ? x : nx; pz = nz == null ? z : nz;
      root.position.set(px, colliders.heightAt(px, pz), pz);
    },
    /** Turn towards a world point instead of the player (null → normal behaviour, back to the starting heading when `reset`). */
    faceTowards(fx, fz, reset = false) {
      faceTo = fx == null ? null : { x: fx, z: fz };
      if (fx == null && reset) yaw = yaw0;
    },
    update(dt, t) {
      root.visible = !giver.hiddenBy.size;
      const dx = player.pos.x - px, dz = player.pos.z - pz, d = Math.hypot(dx, dz);
      if (faceTo) {
        const goal = Math.atan2(faceTo.x - px, faceTo.z - pz);
        let dy = goal - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        yaw += dy * Math.min(1, dt * 5);
      } else if (d < 3) {
        const goal = Math.atan2(dx, dz);
        let dy = goal - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        yaw += dy * Math.min(1, dt * 5);
      }
      if (pop > 0) { pop = Math.max(0, pop - dt * 4); const k = 1 - 0.4 * pop * pop; ch.group.scale.setScalar(scale * k); }
      else if (ch.group.scale.x !== scale) ch.group.scale.setScalar(scale);
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
