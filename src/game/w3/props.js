// STUB (wave 3 scaffolding): plain stand-in shapes of the right size, replaced by the Props & Wardrobe builder
// (WAVE3.md §Props). Pure geometry, origin at the base centre, front +z, yarn material (merge → one BufferGeometry).
// The Tasks agent owns placement, instancing, colliders and animation.
import { box, cyl, xf, merge, KNIT, FELT, GLOW } from '../../core/prims.js';

/** Door 18: red felt pillar box (≤ 1.2k tris), collider r 0.15. */
export function postBoxGeo() {
  return merge([xf(cyl(0.13, 0.14, 0.5, 10, '#b5332e', FELT), [0, 0.25, 0]), xf(box(0.12, 0.02, 0.02, '#e3aa3a', FELT), [0, 0.4, 0.13])]);
}

/** Door 20: runway lantern → { body ≤ 300 (post 0.55 tall), flame ≤ 80 (GLOW, at y 0.47) }. */
export function lanternGeos() {
  return {
    body: merge([xf(cyl(0.02, 0.025, 0.42, 6, '#2b2523', KNIT), [0, 0.21, 0]), xf(box(0.09, 0.11, 0.09, '#2b2523', KNIT), [0, 0.47, 0])]),
    flame: xf(box(0.035, 0.05, 0.035, '#ffd27a', GLOW), [0, 0.47, 0]),
  };
}

/** Door 22: Santa's mailbox on a post (≤ 1k tris), collider r 0.14. MAILBOX_FLAG = the flag's pivot. */
export const MAILBOX_FLAG = { x: 0.1, y: 0.62, z: 0 };
export function mailboxGeo() {
  return merge([xf(cyl(0.025, 0.025, 0.5, 6, '#f5f1ea', KNIT), [0, 0.25, 0]), xf(box(0.16, 0.14, 0.26, '#b5332e', FELT), [0, 0.57, 0])]);
}

/** Door 22: a runaway letter (≤ 120 tris). */
export function letterGeo() { return box(0.1, 0.006, 0.07, '#f3e7cf', FELT); }

/** Door 20: the carried taper (≤ 200 tris), GLOW flame at the top. */
export function taperGeo() {
  return merge([xf(cyl(0.008, 0.008, 0.16, 6, '#f3e7cf', FELT), [0, 0.08, 0]), xf(box(0.016, 0.026, 0.016, '#ffd27a', GLOW), [0, 0.175, 0])]);
}

/** Door 18: the bundle of cards tied with ribbon (≤ 200 tris). */
export function bundleGeo() { return xf(box(0.1, 0.05, 0.07, '#f3e7cf', FELT), [0, 0.025, 0]); }
