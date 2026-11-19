// Present Delivery chase camera (pure math, Node-testable). Behind and above the tram, its heading follows the track
// ≥ 2 s ahead (so it turns into corners early). Presents land about abeam the tram, so the frame is built round the
// tram: both kerbs (catchers 0.6 right … 2.55 left of the rails) must be on screen at the moment of the throw.
// Poses were grid-searched in Node (/tmp/presents/search*.mjs, perfect-bot timeline): every catcher is within
// |x| ≤ 0.86 NDC at its throw and ≥ 1.5 s before it, above the bottom thumb zone, for aspects 2.16 … 0.46.
// pk = portrait amount (presentsPk(aspect): 0 at ≥ 16:9 … 1 at a 390×844 phone): rises, pulls back, widens the lens.
export const POSE = {
  land: { fov: 34, back: 3.75, up: 1.75, side: 0, look: -0.75, lside: -0.8 },
  port: { fov: 48, back: 6, up: 7.5, side: -2, look: 0.5, lside: -0.8 },
};
export const presentsPk = (aspect) => Math.min(1, Math.max(0, (1.78 - aspect) / (1.78 - 0.47)));
const mix = (k, pk) => POSE.land[k] + (POSE.port[k] - POSE.land[k]) * pk;

export function createRig(path) {
  const AD = {}, F = {}, F2 = {};
  const R = { dx: 0, dz: 1, orbit: 0, pos: { x: 0, y: 3, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 38, init: false };
  /** Tram centre + facing for path distance s (chord of the two bogies, like life/traffic.js). */
  function frame(s, o) {
    path.at(s + 0.48, F); const ax = F.x, az = F.z;
    path.at(s - 0.48, F2);
    o.x = (ax + F2.x) / 2; o.z = (az + F2.z) / 2;
    let fx = ax - F2.x, fz = az - F2.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    o.fx = fx; o.fz = fz; o.nx = -fz; o.nz = fx; // n = right of travel (the plaza side) = tram-local −x
    o.yaw = Math.atan2(fx, fz);
    return o;
  }
  const RF = {}, want = { x: 0, y: 0, z: 0 }, wantT = { x: 0, y: 0, z: 0 };
  /**
   * S: { s, v, phase }. ground(x, z) → y. Writes R.pos / R.target / R.fov. snap = jump straight to the pose.
   */
  function update(S, pk, dt, ground = () => 0, snap = false) {
    frame(S.s, RF);
    const py = ground(RF.x, RF.z);
    // riding: the chase pose. At the last stop (celebrate / results) the same pose cranes slowly up and back and settles
    // on the tram: it stays over the rails / outer kerb, which the ride has just shown to be clear (an orbit round the
    // stop ran into the plaza-edge firs and stalls on one side and the hill on the other).
    const end = S.phase === 'celebrate' || S.phase === 'done';
    if (end) R.orbit += dt;
    const ck = end ? Math.min(1, R.orbit / 3) : 0, ce = ck * ck * (3 - 2 * ck);
    {
      const ahead = 1.0 + Math.max(1.6, S.v * 2.2);
      let ax = 0, az = 0;
      for (let k = 0; k <= 6; k++) { path.at(S.s - 0.3 + ((ahead + 0.3) * k) / 6, AD); const w = 1 - k / 10; ax += AD.dx * w; az += AD.dz * w; }
      const l = Math.hypot(ax, az) || 1;
      const kd = snap || !R.init ? 1 : 1 - Math.exp(-dt * 2.2);
      R.dx += (ax / l - R.dx) * kd; R.dz += (az / l - R.dz) * kd;
      const ll = Math.hypot(R.dx, R.dz) || 1, dx = R.dx / ll, dz = R.dz / ll, nx = -dz, nz = dx;
      const back = mix('back', pk) + 1.0 * ce, up = mix('up', pk) + (1.3 + 1.0 * pk) * ce, side = mix('side', pk) * (1 - 0.5 * ce); // side < 0 = towards the outer (left) kerb
      want.x = RF.x - dx * back + nx * side; want.y = py + up; want.z = RF.z - dz * back + nz * side;
      const look = mix('look', pk) * (1 - ce), lside = mix('lside', pk) * (1 - ce);
      wantT.x = RF.x + dx * look + nx * lside; wantT.y = py + 0.12 + 0.2 * ce; wantT.z = RF.z + dz * look + nz * lside;
    }
    want.y = Math.max(want.y, ground(want.x, want.z) + 0.6);
    R.fov = mix('fov', pk);
    if (snap || !R.init) { Object.assign(R.pos, want); Object.assign(R.target, wantT); R.init = true; return R; }
    const kp = 1 - Math.exp(-dt * 2.4), kt = 1 - Math.exp(-dt * 3.9);
    for (const c of ['x', 'y', 'z']) { R.pos[c] += (want[c] - R.pos[c]) * kp; R.target[c] += (wantT[c] - R.target[c]) * kt; }
    return R;
  }
  return { R, frame, update };
}
