// Procedural emote poses for remote dolls (wave 4). Pure maths, no three.js: emotePose(name, t) → pose where
//   pose.body  = {y, rx, ry, rz}            offsets for the whole doll (pivot at the feet)
//   pose.limbs = {armL, armR, legL, legR}   absolute [rotX, rotZ] of each limb pivot, or undefined = rest pose
// Limb conventions follow buildCharacter (src/core/player.js): an arm hangs along −y; rotX < 0 swings it forward
// (−2.85 = straight up, as when carrying), rotZ = sx·a lifts it outward on side sx (rest is sx·0.25).
export const EMOTE_DUR = { wave: 2.0, cheer: 1.6, dance: 2.4, clap: 1.8, heart: 2.0, laugh: 1.8, bow: 2.0, snowangel: 2.5 };
export const ARM_REST_Z = 0.25;
/** The seated pose (bench / cabin / horse), matching player.js animate() while seated. */
export const SEATED = { body: { y: 0, rx: -0.05, ry: 0, rz: 0 }, limbs: { armL: [-0.72, -ARM_REST_Z], armR: [-0.72, ARM_REST_Z], legL: [-1.42, 0.06], legR: [-1.42, -0.06] } };

const TAU = Math.PI * 2;
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
/** 0 → 1 → 0 envelope: ease in over the first `a` and out over the last `a` of the emote. */
const env = (u, a = 0.14) => sm(0, a, u) * (1 - sm(1 - a, 1, u));

/** sx = −1 for armL / legL, +1 for armR / legR. */
const arm = (sx, x, outward) => [x, sx * outward];

export function emotePose(name, t, out = { body: { y: 0, rx: 0, ry: 0, rz: 0 }, limbs: {} }) {
  const dur = EMOTE_DUR[name] || 2;
  const u = Math.max(0, Math.min(1, t / dur));
  const e = env(u), b = out.body, L = out.limbs;
  b.y = 0; b.rx = 0; b.ry = 0; b.rz = 0;
  L.armL = L.armR = L.legL = L.legR = undefined;
  const R = ARM_REST_Z;
  switch (name) {
    case 'wave': { // right mitten up high, waving side to side
      const w = Math.sin(t * TAU * 2.6) * 0.38 * e;
      L.armR = arm(1, -0.25 * e, lerp(R, 2.55, e) + w);
      L.armL = arm(-1, 0, R - 0.08 * e);
      b.rz = -0.06 * e; b.ry = Math.sin(t * TAU * 1.3) * 0.06 * e;
      break;
    }
    case 'cheer': { // both arms up, two little hops
      const hop = Math.abs(Math.sin(u * Math.PI * 3)) * 0.055 * e;
      L.armL = arm(-1, -0.35 * e, lerp(R, 2.65, e) + Math.sin(t * TAU * 3) * 0.12 * e);
      L.armR = arm(1, -0.35 * e, lerp(R, 2.65, e) - Math.sin(t * TAU * 3) * 0.12 * e);
      b.y = hop; b.rx = -0.06 * e;
      break;
    }
    case 'dance': { // twist and bop, arms pumping in turn
      const ph = t * TAU * 2;
      b.ry = Math.sin(ph) * 0.5 * e; b.rz = Math.sin(ph) * 0.12 * e; b.y = Math.abs(Math.sin(ph * 2)) * 0.03 * e;
      L.armL = arm(-1, -0.45 * e, lerp(R, 1.35 + Math.sin(ph) * 0.95, e));
      L.armR = arm(1, -0.45 * e, lerp(R, 1.35 - Math.sin(ph) * 0.95, e));
      L.legL = [Math.max(0, Math.sin(ph)) * -0.5 * e, 0]; L.legR = [Math.max(0, -Math.sin(ph)) * -0.5 * e, 0];
      break;
    }
    case 'clap': { // mittens forward, clapping
      const open = 0.5 + 0.5 * Math.sin(t * TAU * 4.5);
      L.armL = arm(-1, -1.3 * e, lerp(R, -0.18 + 0.5 * open, e));
      L.armR = arm(1, -1.3 * e, lerp(R, -0.18 + 0.5 * open, e));
      b.y = Math.abs(Math.sin(t * TAU * 2.25)) * 0.012 * e;
      break;
    }
    case 'heart': { // arms curved over the head, swaying
      L.armL = arm(-1, -2.75 * e, lerp(R, -0.42, e));
      L.armR = arm(1, -2.75 * e, lerp(R, -0.42, e));
      b.rz = Math.sin(t * TAU * 1.2) * 0.12 * e; b.y = Math.abs(Math.sin(t * TAU * 1.2)) * 0.015 * e;
      break;
    }
    case 'laugh': { // lean back, hold the tummy, shake
      L.armL = arm(-1, -0.95 * e, lerp(R, -0.32, e));
      L.armR = arm(1, -0.95 * e, lerp(R, -0.32, e));
      b.rx = -0.16 * e + Math.sin(t * TAU * 7) * 0.03 * e; b.y = Math.abs(Math.sin(t * TAU * 7)) * 0.018 * e;
      b.rz = Math.sin(t * TAU * 3.5) * 0.04 * e;
      break;
    }
    case 'bow': { // one mitten across the tummy, the other back, a deep bow and up again
      const down = sm(0.1, 0.38, u) * (1 - sm(0.68, 0.94, u));
      L.armR = arm(1, -1.0 * e, lerp(R, -0.45, e));
      L.armL = arm(-1, 0.55 * e, R + 0.1 * e);
      b.rx = 0.62 * down;
      break;
    }
    case 'snowangel': { // fall back into the snow, sweep arms and legs, hop up
      const fall = sm(0, 0.18, u) * (1 - sm(0.84, 1, u));
      const sw = 0.5 + 0.5 * Math.sin((u - 0.18) * TAU * 3);
      b.rx = -1.45 * fall; b.y = 0.075 * fall;
      L.armL = arm(-1, -0.15 * fall, R + fall * (0.85 + 1.2 * sw));
      L.armR = arm(1, -0.15 * fall, R + fall * (0.85 + 1.2 * sw));
      L.legL = arm(-1, 0, fall * (0.08 + 0.38 * sw));
      L.legR = arm(1, 0, fall * (0.08 + 0.38 * sw));
      break;
    }
    default: break;
  }
  return out;
}
