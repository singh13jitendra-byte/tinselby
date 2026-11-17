// Horse-drawn carriage: a needle-felted horse with a walking leg cycle pulling a red carriage with gold trim and
// knitted passenger dolls. It drives a car lane like any other vehicle (src/life/traffic.js: yields to the player,
// pedestrians, other vehicles and occupied crossings). 4 draw calls: horse body, legs (instanced), carriage, wheels (instanced).
import * as THREE from 'three';
import { P, KNIT, FELT, GLOW, GLOSS, part } from '../core/yarn.js';
import { rbox, box, cyl, cone, torus, tube, xf, merge } from '../core/prims.js';

const dot = (r, c, k = FELT) => part(new THREE.SphereGeometry(r, 6, 4), c, k, [1, 1]);
const ball = (r, c, k = FELT, ws = 10, hs = 7) => part(new THREE.SphereGeometry(r, ws, hs), c, k, [(6.283 * r) / 0.08, (3.1416 * r) / 0.064]);

export const CARRIAGE_LEN = 1.36, CARRIAGE_HALF_W = 0.2;
const HORSE_Z = 0.36; // horse centre (carriage group faces +z)
const CAR_Z = -0.3; // carriage body centre
const HIP_Y = 0.235, LEG_LEN = 0.2;
const TAN = '#b98a5e', TAN_D = '#8f6242', MANE = '#4a3022', MUZZLE = '#ecd9c0';
const WHEELS = [[0.2, 0.105, CAR_Z - 0.14, 0.105], [-0.2, 0.105, CAR_Z - 0.14, 0.105], [0.19, 0.08, CAR_Z + 0.19, 0.08], [-0.19, 0.08, CAR_Z + 0.19, 0.08]];
const LEGS = [[0.052, HORSE_Z + 0.13, 0], [-0.052, HORSE_Z + 0.13, Math.PI], [0.052, HORSE_Z - 0.13, Math.PI], [-0.052, HORSE_Z - 0.13, 0]]; // x, z, gait phase

function horseBody() {
  const p = [], z = HORSE_Z;
  p.push(xf(ball(0.1, TAN), [0, 0.31, z], null, [0.95, 0.98, 1.9])); // barrel
  p.push(xf(ball(0.07, TAN), [0, 0.33, z + 0.14], null, [1.05, 1.15, 1.0])); // chest
  p.push(xf(cyl(0.045, 0.066, 0.2, 8, TAN, FELT), [0, 0.42, z + 0.2], [0.62, 0, 0])); // neck
  p.push(xf(ball(0.058, TAN, FELT, 8, 6), [0, 0.5, z + 0.28], [0.45, 0, 0], [0.9, 0.95, 1.5])); // head
  p.push(xf(ball(0.036, MUZZLE, FELT, 7, 5), [0, 0.468, z + 0.35], null, [1, 0.9, 1.1])); // muzzle
  for (const s of [-1, 1]) {
    p.push(xf(cone(0.016, 0.05, 5, TAN_D, FELT), [s * 0.03, 0.565, z + 0.235], [-0.2, 0, s * 0.25]));
    p.push(xf(dot(0.01, P.ink, GLOSS), [s * 0.047, 0.512, z + 0.305]));
    p.push(xf(dot(0.007, P.ink), [s * 0.016, 0.462, z + 0.383]));
  }
  // mane, forelock and tail (dark yarn)
  for (let k = 0; k < 5; k++) p.push(xf(dot(0.026, MANE), [0, 0.535 - k * 0.036, z + 0.215 - k * 0.028], null, [0.7, 1, 1]));
  p.push(xf(dot(0.022, MANE), [0, 0.552, z + 0.275]));
  p.push(tube([[0, 0.34, z - 0.18], [0, 0.31, z - 0.24], [0, 0.2, z - 0.27], [0, 0.13, z - 0.26]], 0.02, MANE, KNIT, 8, 5));
  // harness: red knitted collar with gold bells, girth strap, red blanket with gold trim
  p.push(xf(torus(0.075, 0.02, P.red, KNIT, Math.PI * 2, 12), [0, 0.365, z + 0.155], [0.5, 0, 0]));
  for (const s of [-1, 0, 1]) p.push(xf(dot(0.014, P.gold, GLOSS), [s * 0.05, 0.31 + Math.abs(s) * 0.03, z + 0.2 - Math.abs(s) * 0.02]));
  p.push(xf(rbox(0.2, 0.05, 0.17, 0.02, P.red, KNIT, 1), [0, 0.385, z - 0.01]));
  p.push(xf(box(0.204, 0.014, 0.174, P.gold, FELT), [0, 0.366, z - 0.01]));
  p.push(xf(torus(0.098, 0.009, P.ink, FELT, Math.PI * 2, 12), [0, 0.31, z + 0.08], [0, 0, 0], [0.95, 1, 1]));
  // hips (so the instanced legs join the body softly)
  for (const [lx, lz] of LEGS) p.push(xf(dot(0.036, TAN), [lx, HIP_Y + 0.02, lz], null, [1, 1.3, 1.2]));
  return merge(p);
}
/** One leg hanging from the origin (pivot at the hip). */
function legGeo() {
  return merge([
    xf(cyl(0.023, 0.017, LEG_LEN - 0.03, 6, TAN, FELT), [0, -(LEG_LEN - 0.03) / 2, 0]),
    xf(cyl(0.021, 0.024, 0.036, 6, MANE, FELT), [0, -LEG_LEN + 0.018, 0]),
    xf(dot(0.022, MUZZLE), [0, -LEG_LEN + 0.05, 0], null, [1, 0.8, 1]), // white sock
  ]);
}
/** Spoked wheel of radius 1 in the yz plane (axle along x): scaled per instance. */
function wheelGeo() {
  const p = [xf(torus(1, 0.085, P.deepRed, KNIT, Math.PI * 2, 14), [0, 0, 0], [0, Math.PI / 2, 0])];
  for (let k = 0; k < 4; k++) p.push(xf(box(0.1, 1.9, 0.1, P.gold, FELT), [0, 0, 0], [(k * Math.PI) / 4, 0, 0]));
  p.push(xf(dot(0.2, P.gold, GLOSS), [0, 0, 0], null, [0.9, 1, 1]));
  return merge(p);
}
/** A small seated knitted passenger. */
function passenger(p, x, y, z, coat, hat, scarf) {
  p.push(xf(cyl(0.04, 0.058, 0.13, 8, coat, KNIT), [x, y + 0.065, z]));
  p.push(xf(torus(0.04, 0.015, scarf, KNIT, Math.PI * 2, 8), [x, y + 0.13, z], [Math.PI / 2, 0, 0]));
  p.push(xf(ball(0.046, P.skin, FELT, 8, 6), [x, y + 0.18, z]));
  p.push(xf(ball(0.047, hat, KNIT, 8, 5), [x, y + 0.2, z - 0.004], null, [1.02, 0.72, 1.02]));
  p.push(xf(dot(0.018, '#fbf7ee'), [x, y + 0.245, z - 0.004]));
  for (const s of [-1, 1]) {
    p.push(xf(dot(0.006, P.ink), [x + s * 0.017, y + 0.185, z + 0.043]));
    p.push(xf(cyl(0.016, 0.014, 0.09, 5, coat, KNIT), [x + s * 0.055, y + 0.08, z + 0.02], [-0.5, 0, s * 0.25]));
  }
}
function carriageBody() {
  const p = [], z = CAR_Z;
  // tub: red knitted body, darker floor, raised curved back, gold trim along the rim
  p.push(xf(rbox(0.34, 0.13, 0.5, 0.05, P.red, KNIT), [0, 0.205, z]));
  p.push(xf(rbox(0.3, 0.05, 0.44, 0.02, P.deepRed, KNIT, 1), [0, 0.135, z]));
  p.push(xf(rbox(0.34, 0.2, 0.07, 0.03, P.red, KNIT, 1), [0, 0.3, z - 0.225], [0.2, 0, 0]));
  p.push(xf(rbox(0.3, 0.1, 0.05, 0.02, P.red, KNIT, 1), [0, 0.3, z + 0.235], [-0.35, 0, 0])); // dash board
  for (const s of [-1, 1]) {
    p.push(xf(box(0.016, 0.018, 0.5, P.gold, GLOSS), [s * 0.168, 0.272, z]));
    p.push(xf(box(0.016, 0.018, 0.5, P.gold, GLOSS), [s * 0.172, 0.15, z]));
    // curled gold scroll + lantern at the front corners
    p.push(xf(torus(0.03, 0.008, P.gold, GLOSS, Math.PI * 1.5, 8), [s * 0.172, 0.21, z + 0.2], [0, Math.PI / 2, 0]));
    p.push(xf(cyl(0.006, 0.006, 0.1, 4, P.ink, FELT), [s * 0.165, 0.33, z + 0.24]));
    p.push(xf(box(0.036, 0.046, 0.036, '#ffc474', GLOW), [s * 0.165, 0.395, z + 0.24]));
    p.push(xf(cone(0.034, 0.03, 4, P.ink, FELT), [s * 0.165, 0.432, z + 0.24], [0, Math.PI / 4, 0]));
    // shafts to the horse
    p.push(xf(cyl(0.01, 0.01, 0.62, 5, P.woodDark, FELT), [s * 0.115, 0.275, z + 0.52], [Math.PI / 2 - 0.07, 0, 0]));
    // axles' leaf springs
    p.push(xf(box(0.02, 0.03, 0.4, P.ink, FELT), [s * 0.15, 0.115, z + 0.02]));
  }
  p.push(xf(box(0.346, 0.018, 0.016, P.gold, GLOSS), [0, 0.398, z - 0.245]));
  // benches with cream cushions
  p.push(xf(rbox(0.28, 0.05, 0.13, 0.02, P.cream, FELT, 1), [0, 0.262, z - 0.13]));
  p.push(xf(rbox(0.28, 0.05, 0.11, 0.02, P.cream, FELT, 1), [0, 0.29, z + 0.13]));
  // driver in front, two passengers behind, a gift and a wreath on the back
  passenger(p, 0, 0.3, z + 0.13, P.pine, P.red, P.cream);
  passenger(p, -0.075, 0.272, z - 0.12, P.deepRed, P.pine, P.gold);
  passenger(p, 0.075, 0.272, z - 0.12, '#4f7fa8', P.red, '#fbf7ee');
  p.push(tube([[0.03, 0.4, z + 0.17], [0.05, 0.4, z + 0.42], [0.04, 0.39, z + 0.72]], 0.004, P.ink, FELT, 6, 3)); // reins
  p.push(tube([[-0.03, 0.4, z + 0.17], [-0.05, 0.4, z + 0.42], [-0.04, 0.39, z + 0.72]], 0.004, P.ink, FELT, 6, 3));
  p.push(xf(torus(0.06, 0.022, P.pine, KNIT, Math.PI * 2, 10), [0, 0.3, z - 0.278], [0.2, 0, 0]));
  p.push(xf(dot(0.02, P.red), [0, 0.245, z - 0.3], null, [1.4, 0.8, 0.6]));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; p.push(xf(dot(0.01, i % 2 ? '#ff6a5a' : P.glow, GLOW), [Math.cos(a) * 0.06, 0.3 + Math.sin(a) * 0.058, z - 0.3 - Math.sin(a) * 0.012])); }
  // cotton snow on the back rail
  p.push(xf(ball(0.05, '#fbf9f4', FELT, 7, 4), [0, 0.412, z - 0.25], null, [3, 0.4, 0.7]));
  return merge(p);
}

/** Build the carriage. Returns { mesh: Group (faces +z), animate(dt, v) } for the traffic system. */
export function buildCarriage(engine, sfx) {
  const group = new THREE.Group();
  group.name = 'life-carriage';
  const mk = (geo, name) => { const m = new THREE.Mesh(geo, engine.mat); m.castShadow = m.receiveShadow = true; m.name = name; group.add(m); return m; };
  mk(horseBody(), 'life-carriage-horse');
  mk(carriageBody(), 'life-carriage-body');
  const legs = new THREE.InstancedMesh(legGeo(), engine.mat, 4);
  const wheels = new THREE.InstancedMesh(wheelGeo(), engine.mat, 4);
  for (const m of [legs, wheels]) { m.castShadow = true; m.frustumCulled = false; group.add(m); }
  legs.name = 'life-carriage-legs'; wheels.name = 'life-carriage-wheels';

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  let stride = 0, roll = 0, lastBeat = 0;
  function pose() {
    for (let i = 0; i < 4; i++) {
      const [lx, lz, ph] = LEGS[i];
      const sw = Math.sin(stride + ph);
      // swing from the hip; lift the hoof a touch on the forward stroke
      e.set(-sw * 0.5, 0, 0);
      q.setFromEuler(e);
      v3.set(lx, HIP_Y + Math.max(0, Math.cos(stride + ph)) * 0.022, lz);
      legs.setMatrixAt(i, m4.compose(v3, q, s3.set(1, 1, 1)));
    }
    legs.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 4; i++) {
      const [wx, wy, wz, r] = WHEELS[i];
      e.set(roll / r, 0, 0);
      q.setFromEuler(e);
      wheels.setMatrixAt(i, m4.compose(v3.set(wx, wy, wz), q, s3.set(r * 0.32, r, r)));
    }
    wheels.instanceMatrix.needsUpdate = true;
  }
  pose();

  return {
    mesh: group,
    /** Called by traffic every frame while shown: v.v = current speed, v.x / v.z = position. */
    animate(dt, v) {
      if (v.v < 0.004) return; // standing still: hold the pose (no matrix uploads)
      stride += v.v * dt * 15;
      roll += v.v * dt;
      pose();
      // clip-clop: two soft hoof beats per stride
      const beat = Math.floor(stride / Math.PI);
      if (beat !== lastBeat) { lastBeat = beat; sfx?.(v.x, v.z, beat % 2 ? 0.22 : 0.3); }
    },
  };
}
