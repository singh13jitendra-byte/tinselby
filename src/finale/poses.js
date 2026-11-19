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

/** Santa's approach, seen from the tree end of the lantern runway: just north of the landing rug, above the heads
 *  of the gathered friends, looking south down the two rows of glowing lanterns to the park gate and the night sky. The
 *  sleigh swings in over the gate, runs low along the lanterns straight towards us and sets down on the rug in the
 *  foreground. Portrait: the camera slides closer to the runway's axis, so the lantern rows run up the tall frame.
 *  getSleigh() → Vector3. */
export function runwayPose(ctx, getSleigh, dur = 8.5) {
  const L = ctx.layout.MARKET.landing;
  const land = V(L.x, 0.3, L.z - 0.3);
  const far = V(L.x, 0.75, L.z + 6.6); // a point on the runway, between the lantern rows
  const from = V(), to = V(), tgt = V(), s = V(), sm = V();
  let init = false;
  return (t, out, dt) => {
    const p = Math.min(1, Math.max(0, ctx.cam?.portrait ?? 0));
    // starts on the runway's axis (the lantern rows framed between the two market lamps at the plaza edge), then drifts
    // east and down beside the rug for the touchdown
    // Portrait stays on the axis the whole way: the tall frame is only ~15° wide, and head-on the team is narrow enough
    // to fit while the gate, the lantern rows and the sky stack up above it (no pull-back: the tree is right behind us).
    from.set(L.x + 0.5 - 0.2 * p, 2.6, L.z - 2.2);
    to.set(L.x + 1.95 - 1.6 * p, 1.25 + 0.6 * p, L.z - 1.35 - 0.75 * p);
    const k = ss(t / dur);
    s.copy(getSleigh());
    if (!init) { sm.copy(s); init = true; }
    sm.lerp(s, damp(dt, 4));
    out.pos.lerpVectors(from, to, k);
    // early: hold the lantern rows and let the sleigh swing into the frame; then stay with the sleigh down onto the rug
    const w = (0.52 + 0.2 * p) + (0.48 - 0.2 * p) * ss((t - dur * 0.3) / (dur * 0.4));
    tgt.lerpVectors(far, sm, w);
    out.target.copy(tgt).lerp(land, ss((t - dur * 0.72) / (dur * 0.28)) * 0.6);
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
  const fromP = V(w.x + 0.95, 1.08, w.z + 1.5), toP = V(L.x + 1.9, 0.86, L.z + 2.0); // polish: a head higher, over the townsfolk standing in front
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
    // portrait: a tall frame from this low angle was mostly empty rug. Move in on Clover and look higher, so she and the
    // team sit in the lower third with the tree, the lights and the night sky stacked above them.
    const por = Math.min(1, Math.max(0, ctx.cam?.portrait ?? 0));
    if (por > 0) {
      out.pos.lerp(out.target, 0.24 * por);
      out.pos.y += 0.2 * por;
      out.target.y += 0.45 * por;
    }
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
