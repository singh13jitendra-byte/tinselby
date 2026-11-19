// Wave 3 finale camera poses (WAVE3.md §Door 24 "poses.js"), in the camera/shots.js style: gen(t, out, dt) fills
// out.pos / out.target (world). They run inside createCinemaRig, whose shots get the 'cinema' portrait framing
// (keep 0.75, see finale/index.js), and they use the base shot lens (vertical FOV 32°), so the framings sit well back.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const damp = (dt, k) => 1 - Math.exp(-dt * k);
const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export function treeAt(ctx) {
  const p = ctx.city?.tree?.pos, m = ctx.layout.MARKET.tree;
  const star = ctx.city?.tree?.starSocket;
  const x = p ? p.x : m.x, z = p ? p.z : m.z, h = m.height || 3.2;
  return { x, z, h, star: star ? V(star.x, star.y, star.z) : V(x, h + 0.1, z) };
}

/** Town Spirit: low in the aisle south of the tree (the sleigh's landing lane, kept free of the crowd), the gathered
 *  friends to both sides in the lower third, looking up the tree to the star; a slow push-in with a little drift. */
export function spiritPose(ctx, dur = 6) {
  const tr = treeAt(ctx);
  return (t, out) => {
    const k = ss(t / dur);
    const a = 0.045 - k * 0.09, r = 9.2 - k * 0.65; // on the park path (x ≈ 0), clear of the runway lanterns and trees
    // the star sits ≈ 5° above the frame centre, clear of the Town Spirit banner; the crowd fills the lower third
    out.pos.set(tr.x + Math.sin(a) * r, 1.05 + k * 0.08, tr.z + Math.cos(a) * r);
    out.target.set(tr.x, 2.42 + k * 0.08, tr.z);
  };
}

/** Santa's approach: from the east edge of the park, low over the ring road, watching the sleigh swing round the town,
 *  come in over the gate and run low along the lantern runway, then pan with it onto the landing rug.
 *  getSleigh() → Vector3. */
export function runwayPose(ctx, getSleigh, dur = 8.5) {
  const L = ctx.layout.MARKET.landing;
  const from = V(3.6, 2.3, 9.8), to = V(2.45, 0.95, 6.3);
  const land = V(L.x, 0.3, L.z - 0.4);
  const tgt = V(), s = V();
  let init = false;
  return (t, out, dt) => {
    const k = ss(t / dur);
    s.copy(getSleigh());
    if (!init) { tgt.copy(s); init = true; }
    tgt.lerp(s, damp(dt, 4.5));
    out.pos.lerpVectors(from, to, k);
    out.target.copy(tgt).lerp(land, ss((t - dur * 0.7) / (dur * 0.3)) * 0.55);
  };
}

/** Clover: low beside the team, east of the harness, following Clover from her waiting spot into her slot.
 *  getClover() → Vector3-like (her position) or null. */
export function cloverPose(ctx, getClover) {
  const L = ctx.layout.MARKET.landing;
  const E = ctx.layout.EVE || {};
  const w = E.cloverWait || { x: 1.55, z: 3.55 };
  // behind Clover, south-east of her waiting spot: outside the townsfolk's crowd rings round the tree (r ≤ 5.6), clear of
  // the carousel (4.2, 2.8) and above the tram rails further south; she walks away from us into the harness
  const fromP = V(w.x + 0.95, 0.85, w.z + 1.5), toP = V(L.x + 1.9, 0.64, L.z + 2.0);
  const slot = V(L.x + 0.19, 0.24, L.z - 1.52);
  const c = V(), tgt = V();
  let init = false;
  return (t, out, dt) => {
    const p = getClover?.();
    c.set(p ? p.x : slot.x, 0.24, p ? p.z : slot.z);
    if (!init) { tgt.copy(c); init = true; }
    tgt.lerp(c, damp(dt, 3.2));
    const k = ss(t / 3.2);
    out.pos.lerpVectors(fromP, toP, k);
    out.target.copy(tgt).lerp(slot, 0.25);
  };
}

/** Wish piece: a medium two-shot from the player's right-front (Santa just beyond), so the new piece reads.
 *  getPlayer() → Vector3 (feet), getHeading() → the player's heading. */
export function dressPose(ctx, getPlayer, getHeading) {
  const cur = V(), pos = V(), g = V();
  let init = false;
  return (t, out, dt) => {
    const p = getPlayer(), h = getHeading();
    const rx = Math.cos(h), rz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
    g.set(p.x, p.y + 0.3, p.z);
    const d = 1.75 - Math.min(1, t / 3) * 0.12;
    pos.set(p.x + (rx * 0.78 + fx * 0.62) * d, p.y + 0.62, p.z + (rz * 0.78 + fz * 0.62) * d);
    if (!init) { cur.copy(g); out.pos.copy(pos); init = true; }
    cur.lerp(g, damp(dt, 5));
    out.pos.lerp(pos, damp(dt, 4));
    out.target.copy(cur);
  };
}

/** Pre-Eve flyover: wide from the south-east of the market, looking up past the tree top, tracking the circling sleigh.
 *  getSleigh() → Vector3-like or null. */
export function previewPose(ctx, getSleigh) {
  const tr = treeAt(ctx);
  const top = V(tr.x, tr.h + 1.3, tr.z); // looking up: mostly sky, the tree top and the roofs along the bottom
  const tgt = V(), want = V();
  let init = false;
  return (t, out, dt) => {
    const s = getSleigh?.();
    want.copy(top);
    if (s) want.lerp(s, 0.62);
    if (!init) { tgt.copy(want); init = true; }
    tgt.lerp(want, damp(dt, 2.4));
    const a = 0.32 - Math.min(1, t / 16) * 0.12;
    out.pos.set(tr.x + Math.sin(a) * 15.5, 1.75 + Math.min(1, t / 16) * 0.5, tr.z + Math.cos(a) * 15.5);
    out.target.copy(tgt);
  };
}

/** Countdown: a slow orbit of the market a little closer and lower than crowdPose (the crowd, the parked sleigh and the
 *  star, with the numbers over the tree), which also keeps the far districts out of the frame. */
export function countPose(ctx, dur = 11.5) {
  const tr = treeAt(ctx);
  return (t, out) => {
    const k = t / dur;
    const a = 0.58 - k * 0.26, r = 8.9 - k * 0.6;
    out.pos.set(tr.x + Math.sin(a) * r, 3.35 - k * 0.25, tr.z + 1.5 + Math.cos(a) * r);
    out.target.set(tr.x, 1.5, tr.z + 1.2);
  };
}
