// Wave-1 festive scenery: chunky knitted lanterns (red / green zigzag bands, warm glow) and pom-pom garlands strung
// between poles and lamp posts in the market and along Holly Lane, plus a low wrought-iron fence beside the tram tracks.
// Everything is merged into the district batches (no extra draw calls beyond the batches' spatial cells).
import * as THREE from 'three';
import { C, xf, box, cyl, bead, part, faceColor, garland, KNIT, FELT, GLOW, GLOSS } from './kit.js';

const TAU = Math.PI * 2;
const IRON = '#262b30';
const PAPER = new THREE.Color('#ffd08a').multiplyScalar(0.5); // warm paper glow: bright, but not a white blob at night

/** Knitted globe lantern hanging from the origin (top of its cord), r = radius, drop = cord length. */
export function knitLanternGeos(r = 0.11, drop = 0.08, bands = [C.red, C.pine]) {
  const g = [];
  const ROWS = 8;
  const body = part(new THREE.SphereGeometry(r, 12, ROWS), PAPER, GLOW, [(TAU * r) / 0.08, (Math.PI * r) / 0.064]);
  const kind = body.attributes.aMat;
  // zigzag bands: in a sphere row every quad is two triangles; colouring the lower triangles of one row and the
  // upper triangles of the next gives a knitted diamond chain for free
  faceColor(body, (x, y, z, f) => {
    const v = (Math.acos(Math.max(-1, Math.min(1, y / (r * 0.97)))) / Math.PI) * ROWS, row = Math.floor(v), lower = v - row > 0.5;
    let c = null;
    if ((row === 1 && lower) || (row === 2 && !lower)) c = bands[0];
    else if ((row === 5 && lower) || (row === 6 && !lower)) c = bands[1];
    else if (row === 0 || row === ROWS - 1) c = '#f3e6cc';
    if (c) for (let j = 0; j < 3; j++) kind.setX(f * 3 + j, KNIT);
    return c;
  });
  const cy = -drop - r;
  g.push(xf(body, [0, cy, 0]));
  g.push(xf(cyl(0.004, 0.004, drop + 0.02, 3, C.ink, FELT), [0, -drop / 2, 0]));
  g.push(xf(cyl(r * 0.3, r * 0.42, 0.028, 7, IRON, KNIT), [0, cy + r * 0.97, 0]));
  g.push(xf(cyl(r * 0.4, r * 0.28, 0.024, 7, IRON, KNIT), [0, cy - r * 0.97, 0]));
  g.push(xf(bead(r * 0.26, bands[0]), [0, cy - r - 0.045, 0]));
  return g;
}

export function buildFestive(K) {
  const { layout: L, colliders } = K;
  const M = L.MARKET;
  const POMS = [C.red, '#fbf9f4', C.pine, '#fbf9f4', C.gold, C.red, '#fbf9f4'];
  const sagAt = (a, b, sag, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];

  /** Pom-pom garland from a to b with knitted lanterns hanging at the given t positions. */
  function span(gid, a, b, sag, lanternTs, { poms = true, r = 0.11, drop = 0.07 } = {}) {
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const mid = sagAt(a, b, sag, 0.5);
    const geos = [];
    if (poms) {
      const gl = garland(a, b, sag, { n: Math.max(4, Math.round(d * 3.2)), cord: '#f3e6cc', cordR: 0.014, bulbR: 0.043, colors: POMS, kind: FELT });
      geos.push(gl.cord, ...gl.bulbs);
    }
    lanternTs.forEach((t, i) => {
      const p = sagAt(a, b, sag, t);
      geos.push(...knitLanternGeos(r, drop, i % 2 ? [C.pine, C.red] : [C.red, C.pine]).map((q) => xf(q, p, [0, i * 1.3, 0])));
    });
    K.prop(gid, [mid[0], 0, mid[2]], geos, { cast: false });
  }

  // ---------------------------------------------------------------- market
  // lanterns on the four big garlands that run from the candy poles up to the tree (same catenary as market.js)
  const poles = [[-6.05, -5.15], [6.05, -5.15], [-6.1, 1.9], [6.1, 1.5]];
  const top = [M.tree.x, 2.75, M.tree.z];
  for (const [x, z] of poles) {
    const dx = top[0] - x, dz = top[2] - z, d = Math.hypot(dx, dz);
    const end = [top[0] - (dx / d) * 0.25, top[1], top[2] - (dz / d) * 0.25];
    span('market', [x, 2.15, z], end, 0.45, [0.2, 0.42, 0.63], { poms: false, r: 0.12, drop: 0.09 });
  }
  // pom-pom garlands with lanterns along the north, west and east edges of the square (pole to pole, above the stalls)
  span('market', [-6.05, 2.12, -5.15], [6.05, 2.12, -5.15], 0.5, [0.14, 0.32, 0.5, 0.68, 0.86]);
  span('market', [-6.05, 2.12, -5.15], [-6.1, 2.12, 1.9], 0.34, [0.25, 0.5, 0.75]);
  span('market', [6.05, 2.12, -5.15], [6.1, 2.12, 1.5], 0.34, [0.25, 0.5, 0.75]);

  // ---------------------------------------------------------------- Holly Lane: lamp post to lamp post down both pavements
  const xs = [-9.4, -12.7, -16.3, -19.9];
  for (const z of [-0.9, 0.9]) for (let i = 0; i < xs.length - 1; i++) {
    const o = z > 0 ? 0.6 : 0;
    span('residential', [xs[i] + o, 1.31, z], [xs[i + 1] + o, 1.31, z], 0.2, [0.3, 0.7], { r: 0.1, drop: 0.06 });
  }

  // ---------------------------------------------------------------- wrought-iron fence beside the tram tracks
  // Short stretches on the plaza side of the rails; crossings, corners and regular gaps stay open.
  const NS = [[-5.6, -3.9], [-3.0, -1.3], [1.3, 3.0], [3.9, 5.6]], WE = [[-4.6, -3.0], [-2.3, -1.2], [1.2, 2.3], [3.0, 4.6]];
  const fence = (ax, az, bx, bz) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    K.prop(K.groupAt(mx, mz), [mx, 0.05, mz], ironFenceGeos(ax, az, bx, bz));
    colliders.addSegment(ax, az, bx, bz, 0.04, 'fence');
  };
  for (const sz of [-5.69, 5.69]) for (const [x0, x1] of NS) fence(x0, sz, x1, sz);
  for (const sx of [-6.69, 6.69]) for (const [z0, z1] of WE) fence(sx, z0, sx, z1);
}

/** Low wrought-iron fence run (dark gloss): posts with ball finials, two rails, pickets and a scroll ring per bay, snow on top. */
export function ironFenceGeos(ax, az, bx, bz, { h = 0.27, y = 0.05, bay = 0.42 } = {}) {
  const g = [];
  const Ln = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), n = Math.max(1, Math.round(Ln / bay));
  const ry = -ang;
  const at = (t) => [ax + (bx - ax) * t, az + (bz - az) * t];
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  for (const yy of [0.06, h - 0.03]) g.push(xf(box(Ln, 0.016, 0.016, IRON, GLOSS), [mx, y + yy, mz], [0, ry, 0]));
  g.push(xf(box(Ln - 0.06, 0.022, 0.04, C.snow, FELT), [mx, y + h - 0.012, mz], [0, ry, 0]));
  for (let i = 0; i <= n; i++) {
    const [x, z] = at(i / n);
    g.push(xf(box(0.03, h + 0.03, 0.03, IRON, GLOSS), [x, y + (h + 0.03) / 2, z], [0, ry, 0]));
    g.push(xf(part(new THREE.OctahedronGeometry(0.026, 0), IRON, GLOSS), [x, y + h + 0.05, z]));
    g.push(xf(bead(0.024, C.snow), [x, y + h + 0.074, z], null, [1.2, 0.5, 1.2]));
    if (i === n) break;
    const [cx, cz] = at((i + 0.5) / n);
    g.push(xf(part(new THREE.TorusGeometry(0.05, 0.007, 4, 8), IRON, GLOSS), [cx, y + 0.06 + (h - 0.09) / 2, cz], [0, ry, 0]));
    for (const o of [0.2, 0.8]) { const [px, pz] = at((i + o) / n); g.push(xf(box(0.012, h - 0.09, 0.012, IRON, GLOSS), [px, y + 0.06 + (h - 0.09) / 2, pz], [0, ry, 0])); }
  }
  return g;
}
