// Camera shot library (played through ctx.cam.playShot).
//  - Standalone shots (blend in from / out to the follow camera): districtRevealShot, cableCarShot, poseShot.
//  - Pose generators gen(t, out, dt) for continuous cinematics: treeStarPose, landingPose, greetPose, giftClosePose, giftOpenPose,
//    crowdPose, pullbackPose, endOrbitPose.
//  - createCinemaRig(ctx): ONE long playShot whose pose is cross-faded between generators with rig.cut(gen, blend).
//    (cam.playShot always blends via the follow camera, so back-to-back cinematics use the rig instead.)
//  - installGameplayShots(ctx): district reveal on first district:enter.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const damp = (dt, k) => 1 - Math.exp(-dt * k);
const BASE_YAW = 0.28;

function treeInfo(ctx) {
  const L = ctx.layout.MARKET.tree;
  const t = ctx.city?.tree;
  const pos = t?.pos ? V(t.pos.x, 0, t.pos.z) : V(L.x, 0, L.z);
  const star = t?.starSocket ? t.starSocket.clone() : V(L.x, L.height + 0.1, L.z);
  return { pos, star };
}

// ------------------------------------------------------------------ standalone shots
/** Wrap a pose generator as a standalone shot spec. */
export function poseShot(name, gen, duration, opts = {}) {
  return { name, duration, blendIn: 0.8, blendOut: 0.8, skippable: true, tilt: 1, ...opts, update: (u, out, info) => gen(u * duration, out, info?.dt ?? 1 / 60) };
}

/** Short sweep up to a high angle over a district centre and back (≈2.6 s). */
export function districtRevealShot(ctx, id) {
  const d = ctx.layout.DISTRICTS.find((x) => x.id === id);
  if (!d) return null;
  const [cx, cz] = d.center;
  const w = Math.max(d.rect[2] - d.rect[0], d.rect[3] - d.rect[1]);
  const cy = id === 'hill' ? ctx.layout.HILL.topY * 0.45 : 0;
  const dist = 9 + w * 0.75;
  return {
    name: 'districtReveal', duration: 2.7, blendIn: 1.0, blendOut: 1.0, skippable: true, tilt: 0.7,
    update(u, out) {
      const yaw = BASE_YAW + (u - 0.5) * 0.3, pitch = THREE.MathUtils.degToRad(56 + u * 6);
      const hd = Math.cos(pitch) * dist;
      out.target.set(cx, cy, cz);
      out.pos.set(cx + Math.sin(yaw) * hd, cy + Math.sin(pitch) * dist, cz + Math.cos(yaw) * hd);
    },
  };
}

/** Follow a cable car cabin from the side (east of the line, looking west across the slope). */
export function cableCarShot(ctx, { cabin, duration = 6, dir = 'up' } = {}) {
  const obj = cabin || ctx.player.object;
  const p = V(), tgt = V(), cur = V();
  let init = false;
  const s = dir === 'down' ? -1 : 1; // up = travelling north (−z)
  return {
    name: 'cablecar', duration: Math.max(2, duration), blendIn: 1.1, blendOut: 1.2, skippable: true, tilt: 1.1,
    update(u, out, info) {
      obj.getWorldPosition(p);
      if (!init) { cur.copy(p); init = true; }
      cur.lerp(p, damp(info?.dt ?? 1 / 60, 6));
      const swing = Math.sin(u * Math.PI) * 0.6;
      out.pos.set(cur.x + 3.4 + swing * 0.5, cur.y + 0.12, cur.z + s * (1.7 - u * 1.4));
      tgt.set(cur.x - 0.4, cur.y - 0.6, cur.z - s * 0.6);
      out.target.copy(tgt);
    },
  };
}

// ------------------------------------------------------------------ pose generators (finale)
/** Rise up the big tree to the newly placed star, with a gentle orbit (≈5.5 s). */
export function treeStarPose(ctx, dur = 5.5) {
  const { pos, star } = treeInfo(ctx);
  return (t, out) => {
    const k = ease(t / dur);
    const a = 0.42 - k * 0.32, r = 6.4 + k * 1.4;
    out.pos.set(pos.x + Math.sin(a) * r, 0.8 + k * (star.y - 0.6), pos.z + Math.cos(a) * r);
    out.target.set(star.x, 1.0 + k * (star.y - 1.05), star.z);
  };
}

/** Wide tracking of the incoming sleigh, ending low at the landing spot. getSleigh() → Vector3. */
export function landingPose(ctx, getSleigh, dur = 9) {
  const L = ctx.layout.MARKET.landing;
  const from = V(9.5, 6.8, 15.5), to = V(2.9, 0.95, 5.9);
  const land = V(L.x, 0.3, L.z - 0.6);
  const tgt = V(), s = V();
  let init = false;
  return (t, out, dt) => {
    const k = ease(t / dur);
    s.copy(getSleigh());
    if (!init) { tgt.copy(s); init = true; }
    tgt.lerp(s, damp(dt, 2.6));
    out.pos.lerpVectors(from, to, k);
    out.target.copy(tgt).lerp(land, ss((t - dur * 0.55) / (dur * 0.45)) * 0.75);
  };
}

/** Medium shot of Santa beside the sleigh while the player walks up. */
export function greetPose(ctx, getSanta, getPlayer) {
  const mid = V(), cur = V();
  let init = false;
  return (t, out, dt) => {
    const sp = getSanta(), pp = getPlayer();
    mid.set(sp.x * 0.62 + pp.x * 0.38, 0.27, sp.z * 0.62 + pp.z * 0.38);
    if (!init) { cur.copy(mid); init = true; }
    cur.lerp(mid, damp(dt, 2.2));
    const a = 0.98 + t * 0.02;
    out.pos.set(cur.x + Math.sin(a) * 2.5, 0.95 + t * 0.02, cur.z + Math.cos(a) * 2.5);
    out.target.copy(cur);
  };
}

/** Close-up on the gift and its tag: camera in front of the player, off to their right (Santa stands just beyond). */
export function giftClosePose(ctx, getGift, getHeading) {
  const g = V(), cur = V(), pos = V();
  let init = false;
  return (t, out, dt) => {
    getGift(g);
    const h = getHeading();
    const rx = Math.cos(h), rz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
    const push = 1 - Math.min(1, t / 5) * 0.12;
    pos.set(g.x + (rx * 0.8 + fx * 0.26) * push, g.y + 0.3, g.z + (rz * 0.8 + fz * 0.26) * push); // above doll height so passers-by rarely block it
    if (!init) { cur.copy(g); out.pos.copy(pos); init = true; }
    cur.lerp(g, damp(dt, 5));
    out.pos.lerp(pos, damp(dt, 4));
    out.target.set(cur.x + fx * 0.14, cur.y, cur.z + fz * 0.14);
  };
}

/** Slow push-in on the opened music box, from its front and a little above, so the tree inside and the
 *  "Merry Christmas!" lettering in the lid both read. getGift(out) → box origin, getFront(out) → box front (world). */
export function giftOpenPose(ctx, getGift, getFront) {
  const g = V(), f = V(), cur = V(), pos = V();
  let init = false;
  return (t, out, dt) => {
    getGift(g);
    getFront(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, 1);
    f.normalize();
    const lx = -f.z, lz = f.x; // towards the box's left (where the name tag hangs)
    const k = ease(Math.min(1, t / 4.5)), dist = 0.6 - 0.07 * k; // ≈30° down: sees into the box and onto the open lid
    if (!init) { cur.copy(g); init = true; }
    cur.lerp(g, damp(dt, 5));
    pos.set(cur.x + f.x * dist + lx * 0.1, cur.y + 0.38 - 0.05 * k, cur.z + f.z * dist + lz * 0.1);
    out.pos.copy(pos);
    out.target.set(cur.x + lx * 0.012, cur.y + 0.055, cur.z + lz * 0.012);
  };
}

/** Wide, slow orbit of the market: crowd around the tree, sleigh parked, countdown clock. */
export function crowdPose(ctx, dur = 11.5) {
  const { pos } = treeInfo(ctx);
  return (t, out) => {
    const k = t / dur;
    const a = 0.62 - k * 0.3, r = 10.6 - k * 0.8;
    out.pos.set(pos.x + Math.sin(a) * r, 4.4 - k * 0.3, pos.z + 1.6 + Math.cos(a) * r);
    out.target.set(pos.x, 1.55, pos.z + 1.1);
  };
}

/** Pull up and back from the crowd to a high wide view full of fireworks, keeping the departing sleigh in frame. */
export function pullbackPose(ctx, getSleigh, dur = 14) {
  const { pos } = treeInfo(ctx);
  const start = V(), startT = V(), end = V(pos.x + 9, 12.5, pos.z + 21), endT = V(pos.x - 0.5, 3.2, pos.z - 2.2);
  crowdPose(ctx)(11.5, { pos: start, target: startT });
  const s = V(), sm = V();
  let init = false;
  return (t, out, dt) => {
    const k = ease(t / dur);
    out.pos.lerpVectors(start, end, k);
    out.target.lerpVectors(startT, endT, k);
    const sl = getSleigh();
    if (sl) {
      s.copy(sl);
      if (!init) { sm.copy(s); init = true; }
      sm.lerp(s, damp(dt, 2));
      const w = 0.28 * Math.sin(Math.min(1, t / (dur * 0.8)) * Math.PI);
      out.target.lerp(sm, w);
    }
  };
}

/** Slow high orbit behind the end card. */
export function endOrbitPose(ctx) {
  const { pos } = treeInfo(ctx);
  return (t, out) => {
    const a = 0.4 + t * 0.025, r = 21;
    out.pos.set(pos.x + Math.sin(a) * r, 12 + Math.sin(t * 0.1) * 0.5, pos.z - 0.6 + Math.cos(a) * r);
    out.target.set(pos.x, 3.0, pos.z - 0.6);
  };
}

// ------------------------------------------------------------------ cinema rig
export function createCinemaRig(ctx, { tilt = 1.2, blendIn = 1.0, name = 'cinema' } = {}) {
  let gen = null, segT = 0, blendT = 0, blendDur = 0, active = false;
  const from = { pos: V(), target: V() }, cur = { pos: V(), target: V() }, last = { pos: V(), target: V() };
  let hasFrom = false;
  const rig = {
    get active() { return active; },
    start() {
      if (active) return;
      active = true;
      ctx.cam.playShot({
        name, duration: 1e6, blendIn, blendOut: 1.0, skippable: false, tilt,
        update: (u, out, info) => rig.update(out, info?.dt ?? 1 / 60),
      }).then(() => { active = false; });
    },
    /** Hand the camera back to the base camera (cam.setMode first): hold the last pose, blend out over `blendOut` s. */
    release(blendOut = 3) {
      if (!active) return;
      const p = last.pos.clone(), q = last.target.clone();
      gen = null;
      ctx.cam.playShot({ name: name + 'Out', duration: blendOut + 0.05, blendIn: 0.001, blendOut, skippable: false, tilt, update: (u, out) => { out.pos.copy(p); out.target.copy(q); } });
    },
    /** Switch to a new pose generator, cross-fading from the current camera over `blend` seconds. */
    cut(g, blend = 1.2) {
      if (gen) { from.pos.copy(last.pos); from.target.copy(last.target); hasFrom = blend > 0; }
      gen = g; segT = 0; blendT = 0; blendDur = blend;
    },
    update(out, dt) {
      if (!gen) { out.pos.copy(last.pos); out.target.copy(last.target); return; }
      segT += dt;
      gen(segT, cur, dt);
      if (hasFrom && blendT < blendDur) {
        blendT += dt;
        const k = ss(blendT / blendDur);
        out.pos.lerpVectors(from.pos, cur.pos, k);
        out.target.lerpVectors(from.target, cur.target, k);
      } else { out.pos.copy(cur.pos); out.target.copy(cur.target); }
      last.pos.copy(out.pos); last.target.copy(out.target);
    },
  };
  return rig;
}

// ------------------------------------------------------------------ gameplay hooks
export function installGameplayShots(ctx) {
  const { game, cam, engine, params } = ctx;
  let startT = -1;
  game.on('game:start', () => { startT = engine.time; });
  game.on('district:enter', ({ id, first }) => {
    if (!first || id === 'streets' || game.state.phase !== 'play') return;
    if (cam.shotActive || startT < 0) return;
    const since = engine.time - startT;
    if (since < 1.5) return; // teleports right after start (spawn / test flags)
    if (id === 'park' && since < 4) return; // the very first park entry would fight the start
    if (params?.has('reveal') || params?.has('noshots')) return; // already revealed (test) / disabled
    const spec = districtRevealShot(ctx, id);
    if (spec) cam.playShot(spec);
  });
  // (the cable car ride shot is started by src/city/cablecar.js itself; cableCarShot stays exported for other callers)
}
