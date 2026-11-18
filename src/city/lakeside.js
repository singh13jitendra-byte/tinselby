// Frostmere Lake: walkable ice, cable-knit shore, pebbles, reeds, pier, promenade, Ferris wheel, cocoa hut.
import * as THREE from 'three';
import {
  C, xf, box, rbox, cyl, cone, ball, bead, torus, tube, part, flatShapeE, garland, lampGeos, benchGeos, pineGeos,
  pomTreeGeos, snowLump, put, merge, woodFenceGeos, snowmanGeos, lanternGeos, KNIT, FELT, GLOW, GLOSS, mulberry32,
} from './kit.js';
import { pathGeos, forest } from './park.js';
import { townhouse } from './residential.js';
import { squashProps } from './reveal.js';

const TAU = Math.PI * 2;

export function buildLakeside(K) {
  const { layout: L, colliders, engine } = K;
  const LK = L.LAKE;
  const { x: cx, z: cz } = LK.center, rx = LK.rx, rz = LK.rz;
  const rnd = mulberry32(41);
  const P = (geos, anchor, opts) => K.prop('lakeside', anchor, geos, opts);
  const isIce = (x, z) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1;
  const promenade = L.WALK_LOOPS.find((w) => w.id === 'promenade').pts;
  const distProm = (x, z) => {
    let d = 1e9;
    for (let i = 0; i < promenade.length - 1; i++) {
      const [ax, az] = promenade[i], [bx, bz] = promenade[i + 1];
      const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz;
      const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / l2));
      d = Math.min(d, Math.hypot(x - ax - abx * t, z - az - abz * t));
    }
    return d;
  };

  // ---------------------------------------------------------------- ice + shore
  {
    const g = [];
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rx, rz, 0, TAU, false, 0);
    g.push(xf(flatShapeE(shape, 0.02, C.ice, GLOSS, 48), [cx, 0.03, cz]));
    // inner lighter ice
    const s2 = new THREE.Shape(); s2.absellipse(0, 0, rx * 0.72, rz * 0.68, 0, TAU, false, 0);
    g.push(xf(flatShapeE(s2, 0.004, '#b9d6e6', GLOSS, 40), [cx + 0.3, 0.05, cz - 0.1]));
    // skate marks
    for (const [ox, oz, a, b] of [[0.6, 0.2, 2.2, 1.3], [-1.0, -0.3, 1.5, 0.9], [1.4, -0.6, 1.0, 0.7]]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = (i / 24) * TAU; pts.push([cx + ox + Math.cos(t) * a, 0.056, cz + oz + Math.sin(t) * b]); }
      g.push(tube(pts, 0.008, '#e6f0f5', FELT, 32, 3, false));
    }
    const ice = P(g, [cx, 0, cz], { cast: false, delay: 0.2, kind: 'pop' });
    // chunky cable-knit rim
    const rim = [];
    for (let i = 0; i <= 64; i++) { const t = (i / 64) * TAU; rim.push([cx + Math.cos(t) * (rx + 0.04), 0.07, cz + Math.sin(t) * (rz + 0.04)]); }
    P([tube(rim, 0.075, C.snow, KNIT, 96, 5, false)], [cx, 0, cz], { cast: false, delay: 0.35 });
    // pebbles + reeds
    const pg = [];
    const pcol = [C.pebble, C.pebbleDark, C.stone, '#a9a39b'];
    for (let i = 0; i < 64; i++) {
      const t = rnd() * TAU, f = 1.05 + rnd() * 0.1;
      const x = cx + Math.cos(t) * rx * f, z = cz + Math.sin(t) * rz * f;
      if (distProm(x, z) < 0.45 || (Math.abs(z - LK.pier.z) < 0.5 && x < cx)) continue;
      const r = 0.06 + rnd() * 0.07;
      pg.push(xf(sphLo(r, pcol[i % 4]), [x, 0.04, z], [0, rnd() * 3, 0], [1, 0.55, 0.8 + rnd() * 0.4]));
    }
    P(pg, [cx, 0, cz], { cast: false, delay: 0.5 });
    for (let k = 0; k < 9; k++) {
      const t = -1.2 + k * 0.45 + rnd() * 0.2;
      const x = cx + Math.cos(t) * rx * 1.09, z = cz + Math.sin(t) * rz * 1.09;
      if (distProm(x, z) < 0.5) continue;
      const rg = [];
      for (let j = 0; j < 6; j++) {
        const ox = (rnd() - 0.5) * 0.25, oz = (rnd() - 0.5) * 0.25, h = 0.28 + rnd() * 0.25;
        rg.push(xf(cone(0.018, h, 5, j % 2 ? C.olive : '#8a8a4a', FELT), [x + ox, 0.04 + h / 2, z + oz], [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3]));
        if (j % 2 === 0) rg.push(xf(cyl(0.022, 0.022, 0.08, 5, C.woodDark, FELT), [x + ox, 0.04 + h + 0.02, z + oz]));
      }
      P(rg, [x, 0.04, z], { cast: false });
    }
  }

  // ---------------------------------------------------------------- low snow-capped wooden fence round part of the shore
  // (open on the west side by the pier / promenade and on the east side, so the ice and the scarf stay easy to reach)
  {
    const arcs = [[-158, -24], [22, 112]];
    for (const [d0, d1] of arcs) {
      const n = Math.round((d1 - d0) / 11.5);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = ((d0 + ((d1 - d0) * i) / n) * Math.PI) / 180;
        const p = [cx + Math.cos(t) * (rx + 0.36), cz + Math.sin(t) * (rz + 0.36)];
        if (prev) {
          P(woodFenceGeos([prev, p], { step: 0.5 }), [(prev[0] + p[0]) / 2, 0.03, (prev[1] + p[1]) / 2], { delay: 0.45 + i * 0.02 });
          colliders.addSegment(prev[0], prev[1], p[0], p[1], 0.05, 'fence');
        }
        prev = p;
      }
    }
    // a felted snowman waving from the east bank, lanterns at the fence ends
    { const x = cx + rx + 0.75, z = cz - 0.4; P(snowmanGeos('#e7a1a3', '#f1e4cc', '#fbf9f4').map((q) => xf(q, [x, 0.03, z], [0, -1.3, 0], 1.3)), [x, 0.03, z]); colliders.addCircle(x, z, 0.22, 'snowman'); K.keepCircle(x, z, 0.5); }
    for (const d of [-158, -24, 22, 112]) { const t = (d * Math.PI) / 180, x = cx + Math.cos(t) * (rx + 0.62), z = cz + Math.sin(t) * (rz + 0.62); P(lanternGeos().map((q) => xf(q, [x, 0.03, z], null, 1.2)), [x, 0.03, z]); colliders.addCircle(x, z, 0.08, 'lantern'); }
  }

  // ---------------------------------------------------------------- pier
  const pierRect = [9.5, LK.pier.z - 0.31, 12.3, LK.pier.z + 0.31];
  {
    const g = [], [x0, z0, x1, z1] = pierRect, zc = (z0 + z1) / 2;
    for (let x = x0 + 0.06; x < x1; x += 0.13) g.push(xf(box(0.11, 0.035, 0.62, (Math.round(x * 7.7) % 2) ? C.wood : '#86593b'), [x, 0.135, zc]));
    for (const z of [z0 + 0.03, z1 - 0.03]) g.push(xf(box(x1 - x0, 0.05, 0.05, C.woodDark), [(x0 + x1) / 2, 0.1, z]));
    for (let x = x0 + 0.3; x < x1; x += 0.65) for (const z of [z0 + 0.03, z1 - 0.03]) {
      g.push(xf(cyl(0.035, 0.035, 0.35, 6, C.woodDark), [x, 0.05, z]));
      g.push(xf(cyl(0.035, 0.035, 0.25, 6, C.woodDark), [x, 0.27, z]));
      g.push(xf(bead(0.04, C.snow), [x, 0.4, z], null, [1.2, 0.6, 1.2]));
    }
    for (const z of [z0 + 0.03, z1 - 0.03]) g.push(tube([[x0 + 0.3, 0.36, z], [(x0 + x1) / 2, 0.32, z], [x1 - 0.1, 0.36, z]], 0.014, C.cream, KNIT, 12, 4));
    g.push(xf(rbox(x1 - x0 - 0.1, 0.03, 0.2, 0.012, C.snow, FELT, 1), [(x0 + x1) / 2 + 0.05, 0.16, z0 + 0.12]));
    const b = P(g, [(x0 + x1) / 2, 0, zc], { delay: 0.6 });
    b.add(put('lamp', () => lampGeos(), x1 - 0.12, 0.15, z1 - 0.05, 0, 0.75));
    colliders.addSegment(x0 + 0.3, z0 - 0.02, x1, z0 - 0.02, 0.03, 'pier');
    colliders.addSegment(x0 + 0.3, z1 + 0.02, x1, z1 + 0.02, 0.03, 'pier');
    colliders.addSegment(x1 + 0.02, z0, x1 + 0.02, z1, 0.03, 'pier');
  }

  // ---------------------------------------------------------------- promenade path, lamps, benches, garlands
  {
    const g = pathGeos(promenade, 0.7, false, 0.046);
    for (const q of g) { q.computeBoundingBox(); const c = q.boundingBox.getCenter(new THREE.Vector3()); P([q], [c.x, 0.03, c.z], { cast: false }); }
    const lamps = [[9.15, -3.6], [9.2, 2.3], [9.35, 5.2], [11.0, 8.45], [14.5, 8.45], [18.0, 8.45], [20.35, 4.4]];
    for (const [x, z] of lamps) { P([put('lamp', () => lampGeos(), x, 0.03, z)], [x, 0.03, z]); colliders.addCircle(x, z, 0.08, 'lamp'); K.keepCircle(x, z, 0.3); }
    for (let i = 3; i < 6; i++) {
      const [ax, az] = lamps[i], [bx, bz] = lamps[i + 1];
      const gl = garland([ax, 1.28, az], [bx, 1.28, bz], 0.3, { n: 14, cord: C.pine, bulbR: 0.03 });
      P([gl.cord], [(ax + bx) / 2, 0, (az + bz) / 2]).add(gl.bulbs, 'festive4');
    }
    for (const [x, z, ry] of [[12.6, 7.25, Math.PI], [16.4, 7.25, Math.PI], [10.55, -2.4, Math.PI / 2], [19.4, 6.0, -2.3]]) {
      P([put('bench', benchGeos, x, 0.03, z, ry)], [x, 0.03, z]);
      colliders.addSegment(x - Math.cos(ry) * 0.3, z + Math.sin(ry) * 0.3, x + Math.cos(ry) * 0.3, z - Math.sin(ry) * 0.3, 0.12, 'bench');
      K.keepCircle(x, z, 0.5);
    }
  }

  // ---------------------------------------------------------------- Ferris wheel (cream cable-knit, pom-pom cabins)
  const ferris = buildFerris(K, 18.3, -3.7);

  // ---------------------------------------------------------------- cocoa hut
  let hutProps = null;
  {
    const x = 12.8, z = -5.4;
    const th = townhouse({ w: 1.3, d: 1.05, h: 1.2, wall: C.wood, trim: C.cream, door: C.red, seed: 9 });
    const b = P(th.g.map((q) => xf(q, [x, 0.03, z])), [x, 0, z]);
    hutProps = b.props;
    b.add(th.lights.map((q) => xf(q, [x, 0.03, z]))).add(th.wreath.map((q) => xf(q, [x, 0.03, z])));
    // striped awning over the front
    const aw = box(1.2, 0.03, 0.4, C.red);
    b.add(xf(aw, [x, 0.95, z + 0.72], [0.35, 0, 0]));
    b.add(xf(rbox(1.1, 0.05, 0.35, 0.02, C.snow, FELT, 1), [x, 0.99, z + 0.72], [0.35, 0, 0]));
    colliders.addRect(x - 0.7, z - 0.56, x + 0.7, z + 0.56, 'hut');
    K.keepCircle(x, z, 1.3);
  }

  // ---------------------------------------------------------------- cut-away: tall props fold down when the player is behind them
  // The follow camera sits south-south-east (yaw 0.28, 36 deg down), so a prop hides whatever stands within about
  // height / tan(36 deg) beyond it, along the view direction. Same idea as Holly Lane: while the player is in that
  // shadow the prop squashes towards the ground (squashProps), eased in and out; eye view fades it out (stands tall).
  {
    const player = K.ctx.player, cam = K.ctx.cam;
    const VX = -Math.sin(0.28), VZ = -Math.cos(0.28); // ground direction of the view, camera -> scene
    const folds = [
      // hut: 1.2 tall -> shadow ~1.65 beyond its front face; fold to 7 % (like Holly Lane's near houses: lower than the doll, so the folded roof can't hide it)
      { props: hutProps, x: 12.8, z: -5.4, near: 0.1, far: 2.6, half: 0.95, min: 0.07 },
      // ticket booth: 0.62 tall incl. roof
      { props: ferris.booth, x: 19.55, z: -3.45, near: 0.0, far: 1.4, half: 0.55, min: 0.25 },
    ].filter((f) => f.props?.length).map((f) => ({ ...f, s: 1, applied: 1 }));
    K.updates.push((dt) => {
      const shown = K.G.lakeside.group.state === 'shown';
      if (!shown) { for (const f of folds) { f.s = 1; f.applied = -1; } return; }
      const p = player?.pos, eye = cam?.eye || 0, kd = 1 - Math.exp(-dt * 6);
      for (const f of folds) {
        let cut = 0;
        if (p && !cam?.shotActive) { // shots (the Ferris wheel ride, cable car…) frame themselves: everything stands tall
          const dx = p.x - f.x, dz = p.z - f.z;
          const along = dx * VX + dz * VZ, lat = Math.abs(dx * -VZ + dz * VX);
          const a = Math.min(1, Math.max(0, (along + 0.35 - f.near) / 0.5)) * Math.min(1, Math.max(0, (f.far - along) / 0.7));
          const l = Math.min(1, Math.max(0, (f.half + 0.35 - lat) / 0.5));
          cut = a * l * (1 - eye);
        }
        const goal = 1 - cut * (1 - f.min);
        f.s += (goal - f.s) * kd;
        if (Math.abs(f.s - goal) < 0.003) f.s = goal;
        const q = Math.round(f.s * 200) / 200;
        if (q !== f.applied) { f.applied = q; squashProps(f.props, q); }
      }
    });
  }

  // ---------------------------------------------------------------- trees around
  forest(K, [9.0, -7.4, 20.8, 9.4], 18, { minS: 0.9, maxS: 1.9 });
  forest(K, [9.2, -16.8, 20.8, -7.7], 12, { minS: 1.1, maxS: 2.3, pines: 0.8 });
  return { isIce, pierRect };
}

const sphLo = (r, c) => part(new THREE.SphereGeometry(r, 5, 4), c, FELT);

/** The Ferris wheel the free-play ride (src/rides/ferris.js) drives; null until the lakeside is built. */
let FERRIS = null;
export const getFerris = () => FERRIS;

/** Gondola (pivot-local, hangs below the cross-bar on the rim): open knitted tub + four posts + a little roof.
 * Sized for a seated player doll (~0.43 tall standing): floor at FLOOR, bench top at SEAT_Y (rider faces +z). */
const GOND = { floor: -0.62, rim: -0.45, seatY: -0.52, seatZ: -0.075, roof: -0.115, r: 0.19 };

function buildFerris(K, x, z) {
  const { engine, colliders } = K;
  // R = rim radius, HUB = hub height: high enough that the bottom gondola floor clears the platform (gondolas hang 0.62)
  const R = 1.45, HUB = R + 0.88, RZ = 0.32; // RZ: the two rims sit at z = ±RZ, the gondolas hang between them
  const NC = 10, AMBIENT = -0.18; // gondolas; idle spin (rad/s; < 0 = clockwise seen from the front: riders rise on the town side)
  // The wheel faces south-south-west (front = local +z towards yaw YAW): riders look out over the lake, and the town
  // (60° to the right of straight out) passes under the rim at the top, so the view is clear; from the follow camera
  // (yaw 0.28) the face still reads well. The ticket booth stays where it was (door 14's Otto + the gnomes use it).
  const YAW = -0.4, cY = Math.cos(YAW), sY = Math.sin(YAW);
  const toW = (lx, lz) => [x + lx * cY + lz * sY, z - lx * sY + lz * cY];
  const stand = [];
  stand.push(xf(rbox(1.9, 0.12, 1.0, 0.04, C.cream, KNIT, 1), [0, 0.09, 0]));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const pts = [[sx * 0.82, 0.14, sz * 0.46], [0, HUB, sz * 0.43]];
    stand.push(tube(pts, 0.05, '#e9dcc3', KNIT, 6, 6));
  }
  stand.push(xf(cyl(0.05, 0.05, 0.98, 8, '#e9dcc3'), [0, HUB, 0], [Math.PI / 2, 0, 0]));
  for (const sz of [-1, 1]) stand.push(xf(ball(0.08, C.red, KNIT), [0, HUB, sz * 0.5], null, [1, 1, 0.6]));
  // boarding mat in front of the bottom gondola
  stand.push(xf(rbox(0.5, 0.03, 0.3, 0.012, C.red, KNIT, 1), [0, 0.16, 0.33]));
  // little ticket booth (world-aligned, where it always stood)
  const booth = [];
  booth.push(xf(box(0.36, 0.42, 0.3, C.red), [1.25, 0.21, 0.25]));
  booth.push(xf(box(0.22, 0.14, 0.02, C.warm, GLOW), [1.25, 0.3, 0.405]));
  booth.push(xf(cone(0.3, 0.2, 4, C.cream), [1.25, 0.52, 0.25], [0, Math.PI / 4, 0]));
  K.prop('lakeside', [x, 0, z], stand.map((q) => xf(q, [x, 0.03, z], [0, YAW, 0])));
  const boothRef = K.prop('lakeside', [x + 1.25, 0, z + 0.25], booth.map((q) => xf(q, [x, 0.03, z])));
  { // platform (rotated rect) + booth
    const cs = [toW(-0.95, -0.5), toW(0.95, -0.5), toW(0.95, 0.5), toW(-0.95, 0.5)];
    for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; colliders.addSegment(a[0], a[1], b[0], b[1], 0.04, 'ferris'); }
    colliders.addRect(x + 1.25 - 0.2, z + 0.25 - 0.17, x + 1.25 + 0.2, z + 0.25 + 0.17, 'ferris');
  }
  K.keepCircle(x, z, 1.9);

  // ---- the wheel: two cable-knit rims (z = ±RZ) with spokes, cross-bars the gondolas hang from, fairy lights
  const g = [];
  const lightCols = [C.warm, '#ffe4a8', '#ff9a6a', '#ffd27a'];
  for (const sz of [-1, 1]) {
    g.push(xf(torus(R, 0.05, '#efe3cc', KNIT, TAU, 56), [0, 0, sz * RZ]));
    g.push(xf(torus(R - 0.16, 0.026, '#efe3cc', KNIT, TAU, 48), [0, 0, sz * RZ]));
    const NS = 12;
    for (let k = 0; k < NS; k++) {
      const a = (k / NS) * TAU + 0.13;
      g.push(xf(cyl(0.014, 0.014, R, 4, '#e9dcc3'), [(Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, sz * RZ], [0, 0, a - Math.PI / 2]));
      // a few bulbs along every other spoke (the wheel reads as a lit flower at night)
      if (k % 2 === 0) for (let j = 1; j <= 3; j++) g.push(xf(bead(0.022, lightCols[(k + j) % 4], GLOW), [Math.cos(a) * R * (0.24 * j + 0.04), Math.sin(a) * R * (0.24 * j + 0.04), sz * (RZ + 0.03)]));
    }
    g.push(xf(ball(0.13, '#efe3cc', KNIT), [0, 0, sz * RZ], null, [1, 1, 0.8]));
    g.push(xf(bead(0.05, C.red), [0, 0, sz * (RZ + 0.1)]));
    for (let k = 0; k < 32; k++) { const a = (k / 32) * TAU; g.push(xf(bead(0.026, lightCols[k % 4], GLOW), [Math.cos(a) * (R + 0.06), Math.sin(a) * (R + 0.06), sz * RZ])); }
  }
  g.push(xf(cyl(0.065, 0.065, 2 * RZ, 10, '#e9dcc3'), [0, 0, 0], [Math.PI / 2, 0, 0]));
  for (let k = 0; k < NC; k++) {
    const a = (k / NC) * TAU;
    g.push(xf(cyl(0.018, 0.018, 2 * RZ, 5, C.lampPost), [Math.cos(a) * R, Math.sin(a) * R, 0], [Math.PI / 2, 0, 0]));
  }
  const wheel = new THREE.Mesh(merge(g), engine.mat);
  wheel.castShadow = true;
  wheel.position.set(0, HUB + 0.03, 0);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = YAW;
  root.add(wheel);

  // ---- gondolas (instanced; white parts take the instance tint)
  const cg = [], { floor, rim, seatY, seatZ, roof, r } = GOND, W = '#ffffff';
  cg.push(xf(cyl(0.013, 0.013, 0.07, 5, '#cfcfcf'), [0, -0.035, 0]));
  cg.push(xf(cone(0.26, 0.11, 12, W), [0, roof + 0.055, 0]));
  cg.push(xf(cyl(0.255, 0.255, 0.014, 12, '#f4ead8', FELT), [0, roof - 0.004, 0])); // roof underside
  cg.push(xf(ball(0.1, '#fbf9f4', FELT, 8, 4), [0, roof + 0.09, 0], null, [1.5, 0.42, 1.5])); // snow cap
  cg.push(xf(bead(0.034, '#fff6dc', GLOW), [0, roof - 0.04, 0])); // lantern under the roof
  // two side posts (at the rider's elbows, a touch behind): the view out of the front and across to the town stays clear
  for (const px of [1, -1]) {
    cg.push(xf(cyl(0.013, 0.013, rim - roof, 5, '#e8e0d0'), [px * (r - 0.005), (rim + roof) / 2, seatZ + 0.01]));
    cg.push(xf(bead(0.022, '#e8e0d0'), [px * (r - 0.005), rim + 0.005, seatZ + 0.01]));
  }
  const NST = 11;
  for (let k = 0; k < NST; k++) {
    const a = (k / NST) * TAU;
    cg.push(xf(box(0.118, rim - floor, 0.022, k % 2 ? W : '#f1e6e6'), [Math.sin(a) * r, (rim + floor) / 2, Math.cos(a) * r], [0, a, 0]));
  }
  cg.push(xf(torus(r + 0.004, 0.022, '#fff3dc', KNIT, TAU, 18, 5), [0, rim, 0], [Math.PI / 2, 0, 0]));
  cg.push(xf(torus(r, 0.018, W, KNIT, TAU, 18, 5), [0, floor + 0.012, 0], [Math.PI / 2, 0, 0]));
  cg.push(xf(cyl(r - 0.01, r - 0.01, 0.02, 12, '#d9cbb8'), [0, floor + 0.012, 0]));
  cg.push(xf(rbox(0.3, 0.05, 0.12, 0.018, '#f2ece2', KNIT, 1), [0, seatY - 0.025, seatZ - 0.01])); // bench cushion
  cg.push(xf(box(0.26, seatY - 0.05 - floor, 0.1, '#d8c8b0'), [0, (seatY - 0.05 + floor) / 2, seatZ - 0.01]));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; cg.push(xf(bead(0.016, '#ffe9b8', GLOW), [Math.sin(a) * (r + 0.026), rim - 0.03, Math.cos(a) * (r + 0.026)])); }
  const cabs = new THREE.InstancedMesh(merge(cg), engine.mat, NC);
  const tints = ['#d24a41', '#f4ebdc', '#5aa39d', '#e7b143', '#c9718a'].map((c) => new THREE.Color(c));
  for (let k = 0; k < NC; k++) cabs.setColorAt(k, tints[k % tints.length]);
  cabs.castShadow = true;
  cabs.frustumCulled = false; // instance bounds are computed once from the start pose; the gondolas travel 4 units up
  root.add(cabs);
  K.G.lakeside.group.root.add(root);
  K.G.lakeside.group.node(root, [x, 0, z], { delay: 0.55, dur: 0.7 });

  // ---- motion: the wheel turns slowly (ambient), or as the ride's driver says; gondolas stay level and swing a little
  // with the wheel's angular acceleration (each one about its cross-bar) plus a breath of wind.
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
  const sw = new Float32Array(NC), swv = new Float32Array(NC);
  let alpha = 0;
  const api = {
    x, z, R, HUB, NC, RZ, YAW, root, wheel, cabs, booth: boothRef.props,
    /** Wheel-local ground point (local +z = the wheel's front) → world [x, z]. */
    toWorld: toW,
    /** Wheel angle (rad, +z = counter-clockwise seen from +z) and angular speed (rad/s). */
    ang: 0, speed: AMBIENT, ambient: AMBIENT,
    /** Ride control: fn(dt) that sets api.ang / api.speed itself (null = idle spin). */
    driver: null,
    /** Gondola-local bench top (the rider sits here facing +z) and the hang depth. */
    seat: new THREE.Vector3(0, seatY, seatZ),
    gond: GOND,
    /** Where a rider stands to step in (world, on the platform mat in front of the bottom gondola). */
    board: { x: toW(0, 0.68)[0], z: toW(0, 0.68)[1] },
    get shown() { return K.G.lakeside.group.state === 'shown' && root.visible; },
    gondolaAngle(k) { return api.ang + (k / NC) * TAU; },
    swing(k) { return sw[k]; },
    /** Gondola k's pivot in root space. */
    pivot(k, out) { const a = api.gondolaAngle(k); return out.set(Math.cos(a) * R, HUB + 0.03 + Math.sin(a) * R, 0); },
    pivotWorld(k, out) { api.pivot(k, out); root.updateWorldMatrix(true, false); return out.applyMatrix4(root.matrixWorld); },
    /** World matrix of gondola k (pivot + swing about z). */
    gondolaMatrix(k, out) {
      api.pivot(k, v); q.setFromAxisAngle(zAxis, sw[k]);
      out.compose(v, q, s);
      root.updateWorldMatrix(true, false);
      return out.premultiply(root.matrixWorld);
    },
  };
  K.updates.push((dt, t) => {
    if (!root.visible) return;
    const prev = api.speed;
    if (api.driver) api.driver(dt);
    else { api.speed += (AMBIENT - api.speed) * (1 - Math.exp(-dt * 0.7)); api.ang += api.speed * dt; }
    if (dt > 0) alpha += ((api.speed - prev) / dt - alpha) * (1 - Math.exp(-dt * 8));
    wheel.rotation.z = api.ang;
    const n = Math.min(20, Math.max(1, Math.ceil(dt / 0.02))), h = dt / n;
    for (let k = 0; k < NC; k++) {
      const a = api.gondolaAngle(k);
      // lag behind the rim's horizontal acceleration (θ > 0 swings the tub towards +x) + wind
      const goal = Math.max(-0.16, Math.min(0.16, 0.9 * alpha * R * Math.sin(a))) + Math.sin(t * 1.25 + k * 1.9) * 0.012;
      for (let i = 0; i < n; i++) { swv[k] += (-(sw[k] - goal) * 7.5 - swv[k] * 1.1) * h; sw[k] += swv[k] * h; }
      v.set(Math.cos(a) * R, HUB + 0.03 + Math.sin(a) * R, 0);
      q.setFromAxisAngle(zAxis, sw[k]);
      m4.compose(v, q, s);
      cabs.setMatrixAt(k, m4);
    }
    cabs.instanceMatrix.needsUpdate = true;
  });
  FERRIS = api;
  return api;
}
