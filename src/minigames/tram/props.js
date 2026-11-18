// Tram Conductor props: platform kerbs + stop signs (one merged static mesh), the next-stop marker, the inner
// door overlay (glowing doorway + two sliding leaves) and sparkles. Local frames match buildTramMesh: +z forward,
// −x = the inner (plaza) side where passengers wait.
import { P, KNIT, FELT, GLOW, GLOSS } from '../../core/yarn.js';
import { box, rbox, cyl, cone, sph, dot, torus, xf, merge } from '../../core/prims.js';

export const STOP_COL = { park: '#4a8250', holly: '#b8302d', hill: '#4f6fa0', lake: '#4f9590' };
export const PLAT = { x0: 0.33, x1: 0.64 }; // lateral extent (inner side) of the platform kerb
export const SIGN = { z: 0.86, x: -0.6 }; // stop sign, relative to the door-zone centre

/**
 * One stop's platform in its local frame (origin = door-zone centre on the rails at road height; the stop's door
 * zone is z ∈ [−0.6, 0.6] (Good), [−0.25, 0.25] (Perfect)). top = platform top above the origin.
 */
export function platformParts(id, top = 0.1) {
  const g = [];
  const w = PLAT.x1 - PLAT.x0, cx = -(PLAT.x0 + PLAT.x1) / 2;
  const len = 1.5;
  // raised knitted kerb (cream) with a red felt edge stripe facing the rails
  g.push(xf(rbox(w, top, len, 0.025, P.cream, KNIT), [cx, top / 2, 0]));
  g.push(xf(box(0.022, 0.03, len - 0.02, P.red, FELT), [-PLAT.x0 + 0.004, top - 0.03, 0]));
  // glowing zone strips along the track edge: Good (soft green) and Perfect (gold) on top
  g.push(xf(box(0.075, 0.012, 1.2, '#a7e08a', GLOW), [-PLAT.x0 - 0.06, top + 0.004, 0]));
  g.push(xf(box(0.09, 0.016, 0.5, '#ffcf5a', GLOW), [-PLAT.x0 - 0.06, top + 0.008, 0]));
  // felt door outline on the platform where the door should line up (two posts + lintel, flat)
  for (const sz of [-1, 1]) g.push(xf(box(0.16, 0.01, 0.02, P.gold, FELT), [cx - 0.02, top + 0.006, sz * 0.07]));
  // cotton snow tufts on the kerb ends
  for (const sz of [-1, 1]) g.push(xf(sph(0.07, P.snow, FELT, 8, 5), [cx - 0.04, top, sz * (len / 2 - 0.08)], null, [1.2, 0.45, 1]));
  // stop sign: pole, round felt sign facing the oncoming tram (−z), gold rim, snow cap, glowing lamp bead
  const sx = SIGN.x, sz = SIGN.z;
  g.push(xf(cyl(0.02, 0.024, 0.78, 7, P.ink, FELT), [sx, top + 0.39, sz]));
  g.push(xf(cyl(0.12, 0.12, 0.03, 16, STOP_COL[id] || P.red, FELT), [sx, top + 0.82, sz], [Math.PI / 2, 0, 0]));
  g.push(xf(cyl(0.075, 0.075, 0.034, 14, P.cream, FELT), [sx, top + 0.82, sz], [Math.PI / 2, 0, 0]));
  g.push(xf(torus(0.12, 0.012, P.gold, GLOSS, Math.PI * 2, 16, 4), [sx, top + 0.82, sz]));
  g.push(xf(sph(0.06, P.snow, FELT, 8, 4), [sx, top + 0.95, sz], null, [1.3, 0.5, 0.7]));
  g.push(xf(dot(0.03, '#ffe2a8', GLOW), [sx, top + 0.82, sz - 0.03], null, [1, 1, 0.5]));
  // tram pictogram on the sign: tiny red body + cream window band
  g.push(xf(box(0.07, 0.045, 0.012, P.red, FELT), [sx, top + 0.81, sz - 0.022]));
  g.push(xf(box(0.06, 0.016, 0.014, P.glowSoft, GLOW), [sx, top + 0.825, sz - 0.024]));
  return g;
}

/** Bobbing "next stop" marker: a glowing felt down-arrow with a red ring. Origin at the arrow tip. */
export function markerGeo() {
  return merge([
    xf(cone(0.09, 0.16, 10, '#ffcf5a', GLOW), [0, 0.08, 0], [Math.PI, 0, 0]),
    xf(cyl(0.04, 0.04, 0.14, 8, '#ffcf5a', GLOW), [0, 0.22, 0]),
    xf(torus(0.1, 0.014, P.red, KNIT, Math.PI * 2, 14, 4), [0, 0.165, 0], [Math.PI / 2, 0, 0]),
  ]);
}

/** Warm doorway shown when the inner door opens (local, at the tram's door). */
export function doorGlowGeo() { return merge([box(0.01, 0.19, 0.11, P.glowSoft, GLOW)]); }
/** One door leaf (half of the door), red knit with a glowing window slit. */
export function doorLeafGeo() {
  return merge([box(0.014, 0.2, 0.058, P.red, KNIT), xf(box(0.016, 0.06, 0.03, P.glowSoft, GLOW), [0, 0.04, 0])]);
}
/** Sparkle bead (instanced). */
export function sparkGeo() { return merge([dot(0.022, '#ffe08a', GLOW)]); }
