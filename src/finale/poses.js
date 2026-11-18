// STUB (wave 3 scaffolding), replaced by the Finale builder (WAVE3.md §Door 24 "poses.js"). Pose generators in the
// camera/shots.js style: (t, out, dt) → fills out.pos / out.target (world). Plain, safe framings until then.
import * as THREE from 'three';

const treeAt = (ctx) => {
  const p = ctx.city?.tree?.pos, m = ctx.layout.MARKET.tree;
  return { x: p ? p.x : m.x, z: p ? p.z : m.z, h: m.height || 3.2 };
};

/** Low, among the gathered crowd, looking up at the star. */
export function spiritPose(ctx) {
  const tr = treeAt(ctx);
  return (t, out) => {
    const a = 0.25 + t * 0.03;
    out.pos.set(tr.x + Math.sin(a) * 3.2, 0.7, tr.z + Math.cos(a) * 3.2);
    out.target.set(tr.x, tr.h * 0.85, tr.z);
  };
}

/** Low, beside the team, following Clover (getClover → Vector3-like or null). */
export function cloverPose(ctx, getClover) {
  const L = ctx.layout.MARKET.landing, tgt = new THREE.Vector3();
  return (t, out) => {
    const c = getClover?.();
    tgt.set(c ? c.x : L.x, 0.3, c ? c.z : L.z - 1.4);
    out.pos.set(tgt.x + 2.2, 0.9, tgt.z + 1.6);
    out.target.copy(tgt);
  };
}

/** Wide view of the sky round the tree for the pre-Eve flyover (getSleigh → Vector3-like or null). */
export function previewPose(ctx, getSleigh) {
  const tr = treeAt(ctx), tgt = new THREE.Vector3();
  return (t, out) => {
    const s = getSleigh?.();
    tgt.set(tr.x, 3.2, tr.z);
    if (s) tgt.lerp(s, 0.35);
    out.pos.set(tr.x + 3.5, 1.6, tr.z + 11);
    out.target.copy(tgt);
  };
}
