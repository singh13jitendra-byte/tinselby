// Sledge Hill: sculpted cotton-snow slope (layout.HILL.heightAt), sled tracks, footpath, pines, hilltop chalet.
import * as THREE from 'three';
import { C, xf, part, ball, bead, faceColor, pineGeos, pomTreeGeos, snowLump, benchGeos, lampGeos, snowmanGeos, put, KNIT, FELT, GLOW, mulberry32 } from './kit.js';
import { townhouse } from './residential.js';
import { forest } from './park.js';

/** Ribbon draped on the hill surface along a polyline. */
function surfaceRibbon(H, pts, w, color, lift = 0.04, steps = 40) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const P = curve.getSpacedPoints(steps);
  const pos = [], uv = [];
  let along = 0;
  const side = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * (w / 2), nz = dx / l * (w / 2);
    if (i) along += P[i].distanceTo(P[i - 1]);
    const L = [P[i].x + nx, P[i].z + nz], R = [P[i].x - nx, P[i].z - nz];
    side.push([[L[0], H(L[0], L[1]) + lift, L[1], 0, along], [R[0], H(R[0], R[1]) + lift, R[1], w, along]]);
  }
  for (let i = 0; i < side.length - 1; i++) {
    const [a, b] = side[i], [c, d] = side[i + 1];
    for (const v of [a, b, c, b, d, c]) { pos.push(v[0], v[1], v[2]); uv.push(v[3] / 0.072, v[4] / 0.058); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return part(g, color, KNIT);
}

export function buildHill(K) {
  const { layout: L, colliders } = K;
  const HL = L.HILL;
  const H = (x, z) => HL.heightAt(x, z);
  const rnd = mulberry32(61);
  const slope = K.G.hill.group.batch({ cast: false, name: 'slope' });
  K.hillSlope = slope;

  // ---------------------------------------------------------------- sculpted slope
  {
    const x0 = -8.5, x1 = 9, z0 = -17, z1 = -7.6;
    const nx = 52, nz = 30;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const inner = x > x0 + 0.01 && x < x1 - 0.01 && z < z1 - 0.01 && z > z0 + 0.01;
      const bump = inner ? 0.025 * (0.5 + 0.5 * Math.sin(x * 2.3 + z * 1.7) * Math.cos(x * 1.1 - z * 2.9)) : 0;
      p.setY(i, H(x, z) + 0.03 + bump);
    }
    g.computeVertexNormals();
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.072, p.getZ(i) / 0.058);
    const geo = part(g, C.snow, FELT);
    slope.begin([(x0 + x1) / 2, 0, (z0 + z1) / 2], { kind: 'rise', delay: 0, dur: 0.8 });
    slope.add(geo);
    // back wall of the plateau (seen from the attract orbit)
    const wall = new THREE.PlaneGeometry(x1 - x0, 1, nx, 1);
    const wp = wall.attributes.position;
    for (let i = 0; i < wp.count; i++) { const x = wp.getX(i) + (x0 + x1) / 2, top = wp.getY(i) > 0; wp.setXYZ(i, -x, top ? H(x, z0 + 0.001) + 0.03 : 0, -z0); }
    wall.rotateY(Math.PI);
    wall.computeVertexNormals();
    slope.add(part(wall, C.snowShade, FELT));
  }

  // ---------------------------------------------------------------- sled tracks + footpath
  for (let i = 0; i < HL.sledLanes.length; i += 2) {
    const [a, b] = [HL.sledLanes[i], HL.sledLanes[i + 1]];
    const m = [(a[0] + b[0]) / 2 + 0.25, (a[1] + b[1]) / 2];
    slope.begin([m[0], H(m[0], m[1]), m[1]], { delay: 0.6 + i * 0.05 });
    slope.add(surfaceRibbon(H, [a, m, b], 0.42, '#e6e0d6', 0.038, 36));
  }
  const foot = [[0, -7.7], [2.5, -8.7], [3.4, -10.6], [3.0, -12.6], [4.0, -14.5], [4.9, -15.25]];
  slope.begin([3.2, H(3.2, -11), -11], { delay: 0.7 });
  slope.add(surfaceRibbon(H, foot, 0.55, C.path, 0.042, 48));
  for (let i = 0; i < foot.length - 1; i++) K.keepSeg(foot[i][0], foot[i][1], foot[i + 1][0], foot[i + 1][1], 0.5);

  // ---------------------------------------------------------------- hilltop chalet + lookout
  {
    const x = -3.2, z = -16.05, y = H(x, z) + 0.02;
    const th = townhouse({ w: 1.7, d: 1.2, h: 1.35, wall: C.red, trim: C.cream, door: C.pine, seed: 21 });
    const b = K.prop('hill', [x, y, z], th.g.map((q) => xf(q, [x, y, z])));
    b.add(th.lights.map((q) => xf(q, [x, y, z])), 'festive4').add(th.wreath.map((q) => xf(q, [x, y, z])));
    colliders.addRect(x - 0.9, z - 0.65, x + 0.9, z + 0.65, 'chalet');
    K.keepCircle(x, z, 1.3);
  }
  for (const [x, z, ry] of [[3.4, -16.2, 0], [-0.6, -15.9, 0]]) {
    const y = H(x, z) + 0.02;
    K.prop('hill', [x, y, z], [put('bench', benchGeos, x, y, z, ry)]);
    colliders.addSegment(x - 0.3, z, x + 0.3, z, 0.12, 'bench');
    K.keepCircle(x, z, 0.5);
  }
  for (const [x, z] of [[1.5, -8.2], [4.2, -12.0], [4.5, -15.0], [-1.6, -15.6]]) {
    const y = H(x, z) + 0.02;
    K.prop('hill', [x, y, z], [put('lamp', () => lampGeos(), x, y, z)]);
    colliders.addCircle(x, z, 0.08, 'lamp');
    K.keepCircle(x, z, 0.3);
  }
  { const x = -6.8, z = -9.0, y = H(x, z); K.prop('hill', [x, y, z], [put('snowman', snowmanGeos, x, y, z, 0.4, 1.2)]); colliders.addCircle(x, z, 0.18); K.keepCircle(x, z, 0.4); }

  // ---------------------------------------------------------------- pines all over the slope (sitting on the surface)
  K.scatter([-8.3, -16.8, 8.8, -7.9], 30, 0.3, (x, z, i) => {
    const y = H(x, z) + 0.02, s = 0.9 + rnd() * 1.1;
    const v = i % 3;
    if (i % 7 === 3) K.prop('hill', [x, y, z], [put('pomH' + (i % 2), () => pomTreeGeos(i % 2 ? C.mint : C.cream), x, y, z, rnd() * 6, s * 0.9)]);
    else K.prop('hill', [x, y, z], [put('pineF' + v, () => pineGeos([C.pine, C.teal, '#3d6f4c'][v], ['#285a3e', '#3f7d78', '#2f5a3e'][v], { bobbles: v !== 2 }), x, y, z, rnd() * 6, s)]);
    colliders.addCircle(x, z, 0.13 * s, 'tree');
  });
  K.scatter([-8.3, -16.8, 8.8, -7.9], 24, 0.25, (x, z) => {
    const y = H(x, z) + 0.02;
    K.prop('hill', [x, y, z], [put('lump', () => snowLump(0.32), x, y, z, rnd() * 3, 0.8 + rnd() * 0.7)], { cast: false });
  });
  // north-west corner beside the hill
  forest(K, [-20.8, -16.8, -8.6, -7.7], 11, { minS: 1.1, maxS: 2.3, pines: 0.8 });
}
