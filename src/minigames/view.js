// Shared aspect helpers for the mini-games (portrait phones vs landscape / desktop).
// Shots are framed for wide screens: horizontal coverage shrinks with aspect, so portrait pulls the camera back
// along its view ray by aspectK(). One factor, no separate code paths; call it every frame so rotate/resize adapts.
export const isPortrait = () => innerWidth < innerHeight;
export const aspect = () => innerWidth / Math.max(1, innerHeight);
/** >= 1. 1 at ref aspect or wider; grows as the screen gets narrower (power < 1: don't pull back the full way). */
export function aspectK(ref = 1.75, max = 2.4, power = 0.85) {
  return Math.min(max, Math.max(1, Math.pow(ref / aspect(), power)));
}
/** Move pos away from target by factor k (in place). */
export function zoomOut(pos, target, k) {
  pos.x = target.x + (pos.x - target.x) * k;
  pos.y = target.y + (pos.y - target.y) * k;
  pos.z = target.z + (pos.z - target.z) * k;
  return pos;
}
