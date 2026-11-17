// Debug helper (lazy-loaded): a row of knitted dolls in given styles, facing the camera, for wardrobe screenshots.
import * as THREE from 'three';
import { buildCharacter } from '../core/player.js';

export function lineup(ctx, styles, { x = 0, z = 1, gap = 0.34, scale = 1.15, heading = 0 } = {}) {
  const group = new THREE.Group();
  let tris = 0;
  styles.forEach((s, i) => {
    const ch = buildCharacter(ctx.engine.mat, s);
    const px = x + (i - (styles.length - 1) / 2) * gap;
    ch.group.scale.setScalar(scale);
    ch.group.position.set(px, ctx.colliders.heightAt(px, z), z);
    ch.yaw.rotation.y = heading;
    ch.group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    group.add(ch.group);
  });
  ctx.engine.scene.add(group);
  return { group, tris, remove: () => group.removeFromParent() };
}
