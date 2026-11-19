// Present Delivery props (knitted / felted, yarn material). Tram-local frames match buildTramMesh: +z forward,
// −x = right of travel (the plaza side). Instanced pieces are tinted with setColorAt (GLOW parts glow in the tint).
import { P, KNIT, FELT, GLOW, GLOSS } from '../../core/yarn.js';
import { box, rbox, cyl, cone, sph, torus, xf, merge } from '../../core/prims.js';
import { buildCharacter } from '../../core/player.js';
import { TRAM_LEN } from '../../life/tram.js';

/** Low-poly bead (lights, berries): 6×3 segments. */
const bead = (r, c, k = FELT) => sph(r, c, k, 6, 3);
const RZ = -TRAM_LEN / 2; // the tram's rear face (z)
/** Where the rider stands on the rear platform (tram-local, feet). */
export const RIDER = { x: -0.05, y: 0.148, z: RZ - 0.115 };

/** Rear platform with a railing, a sack of presents and a little pile: parts to merge into the tram's mesh. */
export function deckParts() {
  const g = [];
  const z0 = RZ - 0.005, d = 0.25, zc = z0 - d / 2, W = 0.44;
  g.push(xf(rbox(W, 0.035, d, 0.012, P.woodDark, KNIT), [0, 0.13, zc]));
  g.push(xf(box(W - 0.04, 0.012, d - 0.03, '#8d5b3a', FELT), [0, 0.152, zc]));
  // railing: posts, a gold top rail round the back, a pine garland with lights
  // the rear windscreen gets a knitted door with a wreath (no glare behind the rider)
  g.push(xf(rbox(0.36, 0.2, 0.012, 0.004, P.cream, KNIT), [0, 0.46, RZ - 0.008]));
  g.push(xf(box(0.012, 0.19, 0.016, P.red, KNIT), [0, 0.46, RZ - 0.012]));
  g.push(xf(torus(0.045, 0.014, P.pine, KNIT, Math.PI * 2, 12, 4), [0, 0.49, RZ - 0.02]));
  g.push(xf(bead(0.014, P.red), [0, 0.452, RZ - 0.03]));
  for (const sx of [-1, 1]) g.push(xf(box(0.11, 0.07, 0.01, P.glowSoft, GLOW), [sx * 0.1, 0.5, RZ - 0.012]));
  const posts = [[-W / 2 + 0.02, z0 - d + 0.02], [W / 2 - 0.02, z0 - d + 0.02], [-W / 2 + 0.02, z0 - 0.03], [W / 2 - 0.02, z0 - 0.03], [0, z0 - d + 0.02]];
  for (const [x, z] of posts) g.push(xf(cyl(0.009, 0.009, 0.2, 6, P.ink, FELT), [x, 0.25, z]));
  const yR = 0.35;
  g.push(xf(cyl(0.011, 0.011, W - 0.04, 6, P.gold, GLOSS), [0, yR, z0 - d + 0.02], [0, 0, Math.PI / 2]));
  for (const sx of [-1, 1]) g.push(xf(cyl(0.011, 0.011, d - 0.05, 6, P.gold, GLOSS), [sx * (W / 2 - 0.02), yR, zc - 0.005], [Math.PI / 2, 0, 0]));
  const lights = [P.glow, '#ff6a5a', '#9fe07a', P.gold];
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 0.03 + (i / 8) * (W - 0.06);
    const y = yR - 0.025 - Math.abs(Math.sin((i / 8) * Math.PI * 2)) * 0.02;
    g.push(xf(sph(0.016, P.pine, KNIT, 5, 3), [x, y, z0 - d + 0.015], null, [1.3, 1, 1]));
    if (i % 2 === 0) g.push(xf(bead(0.011, lights[(i / 2) % 4], GLOW), [x, y - 0.014, z0 - d + 0.002]));
  }
  // a felt sack, tied at the neck, presents peeking out
  const sx = 0.115, sz = zc + 0.02;
  g.push(xf(sph(0.09, '#a5493a', FELT, 12, 8), [sx, 0.24, sz], null, [1, 1.12, 0.95]));
  g.push(xf(cyl(0.035, 0.05, 0.04, 8, '#8b3a2f', FELT), [sx, 0.345, sz]));
  g.push(xf(torus(0.04, 0.008, P.gold, KNIT, Math.PI * 2, 10, 4), [sx, 0.335, sz], [Math.PI / 2, 0, 0]));
  g.push(xf(box(0.05, 0.05, 0.05, P.green, FELT), [sx - 0.015, 0.385, sz], [0.2, 0.4, 0.1]));
  g.push(xf(box(0.04, 0.045, 0.04, '#4f6fa0', FELT), [sx + 0.03, 0.375, sz + 0.01], [-0.2, -0.3, 0.15]));
  g.push(xf(box(0.052, 0.008, 0.012, P.gold, GLOSS), [sx - 0.015, 0.411, sz], [0.2, 0.4, 0.1]));
  // a small pile beside the rider
  g.push(xf(box(0.07, 0.06, 0.07, P.red, FELT), [-0.16, 0.183, zc - 0.05], [0, 0.3, 0]));
  g.push(xf(box(0.074, 0.008, 0.016, P.gold, GLOSS), [-0.16, 0.214, zc - 0.05], [0, 0.3, 0]));
  g.push(xf(box(0.05, 0.045, 0.05, P.cream, FELT), [-0.155, 0.235, zc - 0.045], [0, -0.4, 0]));
  return g;
}

/** A present (instanced): pale paper so the instance tint gives the colour, ribbon cross and a bow. Origin = centre. */
export function presentGeo() {
  const s = 0.11;
  return merge([
    rbox(s, s * 0.9, s, 0.01, '#f5f1ea', FELT, 1),
    box(s + 0.004, s * 0.9 + 0.004, 0.02, '#f0c35a', FELT),
    box(0.02, s * 0.9 + 0.004, s + 0.004, '#f0c35a', FELT),
    xf(sph(0.022, '#f0c35a', FELT, 6, 4), [-0.017, s * 0.45 + 0.01, 0], null, [1.2, 0.7, 0.6]),
    xf(sph(0.022, '#f0c35a', FELT, 6, 4), [0.017, s * 0.45 + 0.01, 0], null, [1.2, 0.7, 0.6]),
  ]);
}
export const PRESENT_TINTS = [[0.9, 0.24, 0.2], [0.27, 0.6, 0.33], [0.32, 0.47, 0.78], [1, 0.96, 0.9], [0.95, 0.55, 0.2], [0.75, 0.35, 0.6]];

/** The doorstep target (instanced, flat on the ground): a felt ring the size of the Perfect zone with glowing beads,
 *  and a dashed outer ring for the Good zone. Tinted per state (gold = a throw now would be Perfect). */
export function ringGeo(rPerfect = 0.18, rGood = 0.4) {
  const g = [];
  g.push(xf(torus(rPerfect, 0.016, '#fbf3e4', FELT, Math.PI * 2, 18, 3), [0, 0.012, 0], [Math.PI / 2, 0, 0], [1, 1, 0.5]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.push(xf(bead(0.018, '#fff1c9', GLOW), [Math.cos(a) * rPerfect, 0.024, Math.sin(a) * rPerfect], null, [1, 0.7, 1]));
  }
  g.push(xf(cyl(rPerfect - 0.02, rPerfect - 0.02, 0.006, 14, '#fbe7b8', GLOW), [0, 0.006, 0]));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.push(xf(box(0.06, 0.008, 0.02, '#f3e7cf', FELT), [Math.cos(a) * rGood, 0.008, Math.sin(a) * rGood], [0, -a + Math.PI / 2, 0]));
  }
  return merge(g);
}

/** Doorstep lantern on a little post with a wreath (instanced). Dim tint = unlit, full tint = lit by a delivery. */
export function lampGeo() {
  const g = [];
  g.push(xf(cyl(0.035, 0.04, 0.02, 7, P.snow, FELT), [0, 0.01, 0]));
  g.push(xf(cyl(0.01, 0.012, 0.3, 5, P.ink, FELT), [0, 0.16, 0]));
  g.push(xf(torus(0.032, 0.011, P.pine, KNIT, Math.PI * 2, 9, 3), [0, 0.19, 0.012]));
  g.push(xf(bead(0.01, P.red), [0, 0.165, 0.04]));
  g.push(xf(box(0.072, 0.012, 0.072, P.ink, FELT), [0, 0.31, 0]));
  g.push(xf(box(0.056, 0.07, 0.056, '#ffd89a', GLOW), [0, 0.35, 0]));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.push(xf(box(0.008, 0.074, 0.008, P.ink, FELT), [x * 0.03, 0.35, z * 0.03]));
  g.push(xf(cone(0.055, 0.05, 6, P.red, FELT), [0, 0.41, 0]));
  g.push(xf(sph(0.035, P.snow, FELT, 6, 3), [0, 0.43, 0], null, [1.3, 0.45, 1.3]));
  g.push(xf(bead(0.012, P.gold, GLOSS), [0, 0.445, 0]));
  return merge(g);
}

/** Puff / confetti bead (instanced, tinted white for snow, gold / red / green for sparkles). */
export function fxGeo() { return merge([sph(0.026, '#ffffff', FELT, 6, 4)]); }

/** The player's own doll in their style as one merged geometry (mittens a little forward, ready to toss).
 *  Origin at the feet, faces +z. */
export function riderDollGeo(mat, style) {
  const ch = buildCharacter(mat, style || undefined);
  ch.arms[0].rotation.x = ch.arms[1].rotation.x = -0.75;
  ch.arms[0].rotation.z = -0.28; ch.arms[1].rotation.z = 0.28;
  ch.group.updateMatrixWorld(true);
  const geos = [], orig = new Set();
  ch.group.traverse((o) => { if (o.isMesh) { orig.add(o.geometry); geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); } });
  for (const g of orig) g.dispose();
  return merge(geos);
}

