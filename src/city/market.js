// Market Square: the big tree (star socket), stalls with striped awnings, carousel, countdown clock, bead garlands.
import * as THREE from 'three';
import {
  C, xf, box, rbox, cyl, cylS, cone, ball, bead, torus, extrude, tube, poly, part, faceColor, angleStripes,
  garland, bulbLine, lampGeos, benchGeos, pineGeos, giftGeos, wreathGeos, snowLump, textGeos, put, prefab, merge,
  lanternGeos, candyCaneGeos, barrelGeos, basketGeos, litFirGeos, snowmanGeos,
  KNIT, FELT, GLOW, GLOSS, mulberry32,
} from './kit.js';
import { spring, squash } from './reveal.js';

const TAU = Math.PI * 2;

export function buildMarket(K) {
  const { layout: L, colliders, engine } = K;
  const M = L.MARKET;
  const rnd = mulberry32(31);

  const tree = buildTree(K, M.tree);
  // ---------------------------------------------------------------- stalls
  M.stalls.forEach((s, i) => {
    const ry = Math.atan2(-s.x, -s.z);
    const { g, lights, extra } = stallGeos(i, rnd);
    const toW = (geo) => xf(geo, [s.x, 0, s.z], [0, ry, 0]);
    const b = K.prop('market', [s.x, 0, s.z], g.map(toW));
    b.add(lights.map(toW));
    b.add(extra.map(toW), 'festive2');
    // collider: rotated rect
    const c = Math.cos(ry), sn = Math.sin(ry);
    const corner = (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    const pts = [corner(-0.7, -0.38), corner(0.7, -0.38), corner(0.7, 0.44), corner(-0.7, 0.44)];
    for (let k = 0; k < 4; k++) { const a = pts[k], bb = pts[(k + 1) % 4]; colliders.addSegment(a[0], a[1], bb[0], bb[1], 0.04, 'stall'); }
    K.keepCircle(s.x, s.z, 0.95);
  });

  // ---------------------------------------------------------------- carousel
  buildCarousel(K, M.carousel);

  // ---------------------------------------------------------------- countdown clock
  {
    const { x, z } = M.countdownClock;
    const g = [];
    g.push(xf(cyl(0.12, 0.15, 0.12, 10, C.lampPost), [0, 0.06, 0]));
    g.push(xf(cyl(0.04, 0.05, 1.5, 8, C.lampPost), [0, 0.75, 0]));
    for (const y of [0.3, 0.9, 1.3]) g.push(xf(torus(0.05, 0.015, C.gold, GLOSS, TAU, 10), [0, y, 0], [Math.PI / 2, 0, 0]));
    const hy = 1.68;
    g.push(xf(cyl(0.25, 0.25, 0.1, 20, C.pine), [0, hy, 0], [Math.PI / 2, 0, 0]));
    for (const sz of [1, -1]) {
      g.push(xf(cyl(0.21, 0.21, 0.01, 20, C.cream, FELT), [0, hy, sz * 0.05], [Math.PI / 2, 0, 0]));
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.push(xf(bead(k % 3 ? 0.012 : 0.02, k % 3 ? C.ink : C.red), [Math.cos(a) * 0.17, hy + Math.sin(a) * 0.17, sz * 0.058])); }
      g.push(xf(box(0.018, 0.13, 0.01, C.ink), [-0.02, hy + 0.06, sz * 0.064], [0, 0, 0.3]));
      g.push(xf(box(0.014, 0.17, 0.01, C.red), [0.005, hy + 0.08, sz * 0.068], [0, 0, -0.05]));
      g.push(xf(bead(0.018, C.gold), [0, hy, sz * 0.07]));
    }
    g.push(xf(torus(0.25, 0.03, C.red, KNIT, TAU, 20), [0, hy, 0]));
    g.push(xf(bead(0.05, C.gold, GLOSS), [0, hy + 0.3, 0]));
    g.push(xf(ball(0.1, C.snow, FELT, 8, 5), [0, hy + 0.26, 0], null, [1.6, 0.4, 0.8]));
    // knitted "NOEL" board (both faces)
    g.push(xf(rbox(0.6, 0.24, 0.05, 0.02, C.cream, FELT, 1), [0, 1.08, 0]));
    g.push(xf(rbox(0.66, 0.3, 0.03, 0.02, C.red, KNIT, 1), [0, 1.08, 0]));
    g.push(...textGeos('NOEL', 0.13, C.red, { r: 0.012 }).map((q) => xf(q, [0, 1.015, 0.032])));
    g.push(...textGeos('NOEL', 0.13, C.pine, { r: 0.012 }).map((q) => xf(q, [0, 1.015, 0.032], [0, Math.PI, 0])));
    g.push(xf(ball(0.07, C.snow, FELT, 8, 4), [0, 1.235, 0], null, [3.6, 0.35, 0.6]));
    g.push(...wreathGeos(0.08).map((q) => xf(q, [0, 0.65, 0.06])));
    const b = K.prop('market', [x, 0, z], g.map((q) => xf(q, [x, 0, z])));
    b.add(bulbLine([x - 0.3, 1.215, z + 0.03], [x + 0.3, 1.215, z + 0.03], 8, 0.016).concat(bulbLine([x - 0.3, 0.945, z + 0.03], [x + 0.3, 0.945, z + 0.03], 8, 0.016)));
    colliders.addCircle(x, z, 0.16, 'clock');
  }

  // ---------------------------------------------------------------- lamps, garland poles, bead garlands
  const lamps = [[-5.85, -2.0], [5.85, -2.2], [-5.85, 4.9], [5.85, 4.9], [-1.25, 5.1], [1.25, 5.1], [-3.4, -5.05], [3.6, -5.1]];
  for (const [x, z] of lamps) { K.prop('market', [x, 0, z], [put('lamp', () => lampGeos(), x, 0, z)]); colliders.addCircle(x, z, 0.08, 'lamp'); }
  const poles = [[-6.05, -5.15], [6.05, -5.15], [-6.1, 1.9], [6.1, 1.5]];
  const top = [M.tree.x, 2.75, M.tree.z];
  for (const [x, z] of poles) {
    const g = [];
    const p = cylS(0.045, 0.05, 2.2, 8, 12, C.red);
    faceColor(p, (px, py, pz) => (Math.floor(py / 0.12 + Math.atan2(pz, px) / 1.2) % 2 ? C.cream : null));
    g.push(xf(p, [x, 1.1, z]));
    g.push(xf(bead(0.07, C.gold, GLOSS), [x, 2.24, z]));
    g.push(...wreathGeos(0.1).map((q) => xf(q, [x, 1.6, z + 0.06])));
    const b = K.prop('market', [x, 0, z], g);
    colliders.addCircle(x, z, 0.07, 'pole');
    // garland from the pole to just under the tree tip
    const dx = top[0] - x, dz = top[2] - z, d = Math.hypot(dx, dz);
    const end = [top[0] - (dx / d) * 0.25, top[1], top[2] - (dz / d) * 0.25];
    const gl = garland([x, 2.15, z], end, 0.45, { n: 16, cord: C.cream, cordR: 0.013, bulbR: 0.028, colors: [C.warm, '#ffe0a0'], beads: [C.red, C.gold, C.red, '#efe1c6'] });
    b.add(gl.cord).add(gl.beads).add(gl.bulbs);
  }
  // warm fairy-light strings swagged lamp to lamp round the plaza (always lit: the cosy base glow)
  {
    const ring = [[-6.05, -5.15], [-3.4, -5.05], [3.6, -5.1], [6.05, -5.15], [5.85, -2.2], [6.1, 1.5], [5.85, 4.9], [1.25, 5.1], [-1.25, 5.1], [-5.85, 4.9], [-6.1, 1.9], [-5.85, -2.0]];
    const cords = [], bulbs = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < 2.6 && Math.abs(p[1]) > 5 && Math.abs(p[0]) < 2) continue; // keep the south entrance open
      const gl = garland([p[0], 1.33, p[1]], [q[0], 1.33, q[1]], 0.1 + d * 0.035, { n: Math.round(d * 4.6), cord: C.pine, cordR: 0.012, bulbR: 0.03, colors: [C.warm, '#ffe0a0', C.warm, '#ff9a6a'], beads: [C.red, '#f5efe4', C.gold] });
      cords.push(gl.cord, ...gl.beads); bulbs.push(...gl.bulbs);
    }
    K.prop('market', [0, 1.3, 0], cords, { cast: false }).add(bulbs);
  }

  // ---------------------------------------------------------------- benches, gifts, snow
  for (const [x, z, ry] of [[2.75, -1.3, -Math.PI / 2], [-2.75, 1.7, Math.PI / 2 + 0.3], [-3.6, -2.9, 0.9]]) {
    K.prop('market', [x, 0.055, z], [put('bench', benchGeos, x, 0.055, z, ry)]);
    colliders.addSegment(x - Math.cos(ry) * 0.3, z + Math.sin(ry) * 0.3, x + Math.cos(ry) * 0.3, z - Math.sin(ry) * 0.3, 0.12, 'bench');
  }
  const giftCols = [[C.red, C.gold], [C.pine, C.red], [C.cream, C.red], [C.teal, C.cream], [C.gold, C.red], ['#7a5aa0', C.gold]];
  const pile = (x, z, n) => {
    const g = [];
    for (let i = 0; i < n; i++) {
      const [a, b] = giftCols[(((i + Math.floor(x * 3)) % 6) + 6) % 6];
      const w = 0.12 + rnd() * 0.08, h = 0.1 + rnd() * 0.08;
      const ox = (rnd() - 0.5) * 0.35, oz = (rnd() - 0.5) * 0.3;
      g.push(...giftGeos(w, h, a, b).map((q) => xf(q, [x + ox, 0.055 + (i > 3 ? 0.12 : 0), z + oz], [0, rnd() * 3, 0])));
    }
    K.prop('market', [x, 0.055, z], g, { cast: false });
  };
  // little decorated firs in knitted planters at the plaza edges
  for (const [x, z] of [[-6.05, 3.4], [6.12, 3.3], [-6.1, -3.7], [6.15, -3.45]]) {
    const g = [];
    const pl = cyl(0.24, 0.2, 0.26, 10, C.red);
    faceColor(pl, (px, py) => (py > 0.05 ? C.cream : null));
    g.push(xf(pl, [x, 0.185, z]));
    g.push(...pineGeos(C.pine, '#285a3e', { bobbles: false }).map((q) => xf(q, [x, 0.3, z], [0, x, 0], 1.05)));
    for (let k = 0; k < 6; k++) { const a = k * 1.7 + x; const yy = 0.45 + k * 0.1; const r = (0.42 - (yy - 0.3) / 1.05 * 0.35) * 1.05; g.push(xf(bead(0.04, k % 2 ? C.red : C.gold, GLOSS), [x + Math.cos(a) * r, yy, z + Math.sin(a) * r])); }
    const b = K.prop('market', [x, 0.055, z], g);
    const lg = [];
    for (let k = 0; k < 18; k++) { const t = k / 18, yy = 0.42 + t * 0.75, a = t * TAU * 3; const r = (0.44 - t * 0.34) * 1.05; lg.push(xf(bead(0.025, C.warm, GLOW), [x + Math.cos(a) * r, yy, z + Math.sin(a) * r])); }
    b.add(lg);
    colliders.addCircle(x, z, 0.26, 'planter');
  }
  pile(-5.6, -4.6, 4); pile(5.5, -4.3, 4); pile(-5.5, 2.9, 3); pile(3.0, -4.9, 3);
  const lumps = [[-6.2, -5.3], [6.2, -5.3], [-6.25, 5.25], [6.2, 5.25], [-6.3, -0.6], [6.3, 0.6], [-3.0, 5.35], [3.0, 5.35], [0, -5.35], [-5.7, -2.25], [5.7, -2.45], [-5.65, 4.65], [5.65, 4.65], [-3.55, -5.3], [3.75, -5.35], [-4.6, 5.4], [4.7, -5.4], [-6.3, 0.9], [6.3, -1.0], [-1.6, -5.4], [1.9, 5.4]];
  for (const [x, z] of lumps) K.prop('market', [x, 0.05, z], [put('lump', () => snowLump(0.32), x, 0.05, z, rnd() * 3, 0.8 + rnd() * 0.5)], { cast: false });


  // ---------------------------------------------------------------- festive dressing: rug, lanterns, candy canes, firs, gifts, snowman
  {
    const Lg = M.landing, Y0 = 0.057;
    const disc = (r, c, y, seg = 40) => xf(part(new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2), c, KNIT, [(2 * r) / 0.08, (2 * r) / 0.064]), [Lg.x, y, Lg.z]);
    const star = (r, ri, n, c, y, rot = 0) => {
      const pts = [];
      for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr = i % 2 ? ri : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      return xf(part(new THREE.ShapeGeometry(poly(pts)).rotateX(-Math.PI / 2), c, KNIT, [1 / 0.08, 1 / 0.064]), [Lg.x, y, Lg.z]);
    };
    // big knitted Nordic rug where the square is widest (flat: the sleigh lands on it)
    const rug = [];
    for (let k = 0; k < 22; k++) { const a = (k / 22) * TAU; rug.push(xf(part(new THREE.CircleGeometry(0.15, 10).rotateX(-Math.PI / 2), k % 2 ? '#f5efe4' : C.red, KNIT, [3.75, 4.7]), [Lg.x + Math.cos(a) * 1.6, Y0, Lg.z + Math.sin(a) * 1.6])); }
    rug.push(disc(1.6, C.red, Y0 + 0.002), disc(1.47, '#f5efe4', Y0 + 0.004), disc(1.36, C.pine, Y0 + 0.006), disc(1.27, '#f5efe4', Y0 + 0.008));
    rug.push(star(1.2, 0.74, 8, C.red, Y0 + 0.01), star(0.86, 0.5, 8, '#f5efe4', Y0 + 0.012, Math.PI / 8), star(0.5, 0.2, 8, C.pine, Y0 + 0.014), disc(0.13, C.gold, Y0 + 0.016, 12));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + Math.PI / 8; rug.push(xf(part(new THREE.CircleGeometry(0.06, 8).rotateX(-Math.PI / 2), C.gold, KNIT, [1.5, 1.9]), [Lg.x + Math.cos(a) * 1.02, Y0 + 0.012, Lg.z + Math.sin(a) * 1.02])); }
    K.prop('market', [Lg.x, 0.055, Lg.z], rug, { cast: false, kind: 'pop' });
    // knitted skirt rings round the big tree (smooth rings instead of mosaic cells)
    {
      const T = M.tree, ring = (r0, r1, c, y) => xf(part(new THREE.RingGeometry(r0, r1, 48, 1).rotateX(-Math.PI / 2), c, KNIT, [(2 * r1) / 0.08, (2 * r1) / 0.064]), [T.x, y, T.z]);
      const tr = [ring(1.1, 1.36, '#f5efe4', Y0 + 0.002), ring(1.36, 1.62, '#a5493a', Y0 + 0.004), ring(1.62, 1.86, C.pine, Y0 + 0.002), ring(1.86, 1.95, C.gold, Y0 + 0.004)];
      for (let k = 0; k < 26; k++) { const a = (k / 26) * TAU; tr.push(xf(part(new THREE.CircleGeometry(0.13, 10).rotateX(-Math.PI / 2), k % 2 ? C.red : '#f5efe4', KNIT, [3.2, 4]), [T.x + Math.cos(a) * 2.0, Y0, T.z + Math.sin(a) * 2.0])); }
      K.prop('market', [T.x, 0.055, T.z], tr, { cast: false, kind: 'pop' });
    }

    const lantern = (x, z, s = 1) => { K.prop('market', [x, 0.055, z], lanternGeos().map((q) => xf(q, [x, 0.055, z], [0, x, 0], s))); colliders.addCircle(x, z, 0.07 * s, 'lantern'); K.keepCircle(x, z, 0.25); };
    const cane = (x, z, ry = 0) => { K.prop('market', [x, 0.055, z], candyCaneGeos().map((q) => xf(q, [x, 0.055, z], [0, ry, 0], 1.15))); colliders.addCircle(x, z, 0.05, 'cane'); };
    const fir = (x, z, s = 1, pot = C.red) => { const f = litFirGeos(pot); const w = (q) => xf(q, [x, 0.055, z], [0, x * 2, 0], s); K.prop('market', [x, 0.055, z], f.g.map(w)).add(f.lights.map(w)); colliders.addCircle(x, z, 0.17 * s, 'fir'); K.keepCircle(x, z, 0.4); };
    const gifts = (x, z, n, spread = 0.3) => {
      const g = [];
      for (let i = 0; i < n; i++) {
        const [a, b] = giftCols[(i + Math.abs(Math.round(x * 3))) % 6];
        const w = 0.11 + rnd() * 0.09, h = 0.09 + rnd() * 0.09;
        const ang = i * 2.4, r = i === 0 ? 0 : spread * (0.5 + 0.5 * rnd());
        const top = i >= 4;
        g.push(...giftGeos(w, h, a, b).map((q) => xf(q, [x + Math.cos(ang) * (top ? r * 0.3 : r), 0.055 + (top ? 0.13 : 0), z + Math.sin(ang) * (top ? r * 0.3 : r)], [0, rnd() * 3, 0])));
      }
      K.prop('market', [x, 0.055, z], g);
      colliders.addCircle(x, z, spread * 0.8, 'gifts');
    };
    const barrel = (x, z) => { K.prop('market', [x, 0.055, z], barrelGeos().map((q) => xf(q, [x, 0.055, z], [0, z, 0]))); colliders.addCircle(x, z, 0.17, 'barrel'); K.keepCircle(x, z, 0.4); };
    const basket = (x, z, fill, kind) => K.prop('market', [x, 0.055, z], basketGeos(fill, kind).map((q) => xf(q, [x, 0.055, z])));

    // lantern + candy-cane avenue from the south entrance up to the rug
    for (const sx of [-1, 1]) {
      lantern(sx * 1.85, 4.05); lantern(sx * 2.15, 3.05, 1.15); lantern(sx * 2.2, 1.35);
      cane(sx * 1.62, 5.2, sx > 0 ? Math.PI : 0); cane(sx * 2.42, 2.25, sx > 0 ? Math.PI : 0);
    }
    // lanterns round the tree skirt
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.52; lantern(M.tree.x + Math.cos(a) * 2.32, M.tree.z + Math.sin(a) * 2.32, 0.9); }
    // clusters
    fir(-2.75, 3.5, 1.15); gifts(-2.35, 3.2, 6, 0.3); lantern(-3.15, 3.15);
    barrel(2.6, 0.7); gifts(2.95, 1.05, 4, 0.22); basket(2.3, 1.0, '#7a4f33', FELT); fir(3.05, 0.2, 0.9, C.pine);
    barrel(-2.3, 0.45); basket(-2.6, 0.75, C.red, GLOSS); gifts(-1.95, 0.2, 3, 0.2); cane(-2.65, 0.15);
    { const x = 2.5, z = -3.05; K.prop('market', [x, 0.055, z], snowmanGeos('#6fa8b4', C.moss).map((q) => xf(q, [x, 0.055, z], [0, -0.5, 0], 1.25))); colliders.addCircle(x, z, 0.22, 'snowman'); K.keepCircle(x, z, 0.45); gifts(2.95, -2.8, 3, 0.2); }
    { const x = -3.05, z = -1.9; K.prop('market', [x, 0.055, z], snowmanGeos(C.rose, '#f1e4cc', '#fbf9f4').map((q) => xf(q, [x, 0.055, z], [0, 0.9, 0], 1.0))); colliders.addCircle(x, z, 0.18, 'snowman'); }
    // south edge (outside the walk loop): firs, lanterns, gift piles
    for (const sx of [-1, 1]) { fir(sx * 2.45, 5.2, 1.0, sx > 0 ? C.red : C.pine); fir(sx * 4.5, 5.22, 1.2); lantern(sx * 3.5, 5.2, 1.1); gifts(sx * 3.95, 5.15, 4, 0.2); basket(sx * 2.95, 5.25, sx > 0 ? C.gold : C.red, GLOSS); }
  }
  return { tree };
}

// ------------------------------------------------------------------ the big tree
function buildTree(K, T) {
  const { colliders, engine } = K;
  const rnd = mulberry32(5);
  const B = K.G.market.group.batch({ cast: true, name: 'tree' });
  const g = [];
  const x = T.x, z = T.z, H = T.height;
  // felt skirt + little picket ring
  g.push(xf(cyl(1.08, 1.12, 0.03, 28, C.red, FELT), [0, 0.07, 0]));
  g.push(xf(torus(1.1, 0.04, C.cream, KNIT, TAU, 32), [0, 0.085, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(cyl(0.11, 0.14, 0.5, 10, C.woodDark), [0, 0.3, 0]));
  const tiers = [[1.0, 0.95, 0.4], [0.86, 0.85, 0.82], [0.72, 0.8, 1.24], [0.58, 0.72, 1.65], [0.44, 0.64, 2.04], [0.29, 0.62, 2.43]];
  const radiusAt = (y) => { let r = 0; for (const [tr, th, ty] of tiers) if (y >= ty && y <= ty + th) r = Math.max(r, tr * (1 - (y - ty) / th)); return r; };
  for (const [r, h, y] of tiers) {
    const c = angleStripes(cone(r, h, 22, C.pine), 22, C.pine, '#3a7a52');
    g.push(xf(c, [0, y + h / 2, 0]));
    g.push(xf(part(new THREE.CircleGeometry(r, 22), '#285a3e', KNIT), [0, y + 0.002, 0], [Math.PI / 2, 0, 0]));
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + y; g.push(xf(bead(0.045, C.snow), [Math.cos(a) * r * 0.95, y + 0.04, Math.sin(a) * r * 0.95], null, [1.4, 0.6, 1.4])); }
  }
  // gold yarn garland spiral
  const gp = [];
  for (let i = 0; i <= 90; i++) { const t = i / 90, y = 0.55 + t * 2.4, a = t * TAU * 4.5 + 1.5; const r = radiusAt(y) + 0.035; gp.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
  g.push(tube(gp, 0.02, C.gold, KNIT, 120, 4));
  // baubles
  for (let i = 0; i < 40; i++) {
    const y = 0.5 + rnd() * 2.35, a = rnd() * TAU, r = radiusAt(y) + 0.03;
    const c = [C.red, C.gold, C.red, '#efe1c6', C.deepRed][i % 5];
    g.push(xf(sph8(0.06 - y * 0.008, c), [Math.cos(a) * r, y - 0.04, Math.sin(a) * r]));
  }
  // socket on top
  g.push(xf(cyl(0.055, 0.04, 0.12, 10, C.gold, GLOSS), [0, H - 0.06, 0]));
  // gifts under the tree
  const gc = [[C.red, C.gold], [C.cream, C.red], [C.teal, C.gold], [C.gold, C.red], [C.pine, C.cream]];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3, r = 0.66 + (i % 2) * 0.15, [c1, c2] = gc[i % gc.length];
    g.push(...giftGeos(0.13 + (i % 3) * 0.04, 0.11 + (i % 2) * 0.06, c1, c2).map((q) => xf(q, [Math.cos(a) * r, 0.085, Math.sin(a) * r], [0, a, 0])));
  }
  B.begin([x, 0, z], { delay: 0.25, dur: 0.7 });
  B.add(g.map((q) => xf(q, [x, 0, z])));
  // fairy lights spiral (light group 'tree', dimmer → brighter with spirit)
  const lg = [];
  for (let i = 0; i < 130; i++) {
    const t = i / 130, y = 0.5 + t * 2.55, a = t * TAU * 6.5;
    const r = radiusAt(y) + 0.03;
    lg.push(xf(bead(0.03, i % 6 === 0 ? '#ff8a5c' : i % 6 === 3 ? '#ffe9b0' : C.warm, GLOW), [x + Math.cos(a) * r, y, z + Math.sin(a) * r]));
  }
  B.add(lg, 'tree');
  colliders.addCircle(x, z, 1.0, 'tree');

  // star (hidden until placed)
  const starShape = poly(starPtsLocal(0.24, 0.1));
  const sg = merge([
    xf(extrude(starShape, 0.06, '#ffd27a', GLOW), [0, 0, -0.03]),
    xf(extrude(poly(starPtsLocal(0.275, 0.12)), 0.035, C.gold, KNIT), [0, 0, -0.0175]),
    xf(cyl(0.03, 0.03, 0.12, 8, C.gold, GLOSS), [0, -0.27, 0]),
  ]);
  const star = new THREE.Mesh(sg, engine.mat);
  const socket = new THREE.Vector3(x, H, z);
  star.position.set(x, H + 0.3, z);
  star.visible = false;
  star.castShadow = true;
  engine.scene.add(star);
  let starT = -1;
  K.updates.push((dt) => {
    if (starT < 0) return;
    starT += dt;
    const l = Math.min(1, starT / 0.8);
    const f = spring(l), g2 = squash(l);
    star.scale.set(f * (1 - 0.2 * g2), f * (1 + 0.34 * g2), f);
    star.rotation.y = Math.sin(starT * 0.8) * 0.5 + (1 - f) * 3;
  });

  return {
    pos: new THREE.Vector3(x, 0, z),
    starSocket: socket,
    star,
    placeStar() { if (starT >= 0) return; star.visible = true; starT = 0; star.scale.setScalar(0.001); },
    setLights(k) { K.lights.set('tree', Math.max(0, Math.min(1, k))); },
  };
}
const sph8 = (r, c) => part(new THREE.SphereGeometry(r, 6, 5), c, GLOSS);
function starPtsLocal(r, ri) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return pts;
}

// ------------------------------------------------------------------ stall
function stallGeos(i, rnd) {
  const g = [], lights = [], extra = [];
  const pal = [[C.red, C.cream], [C.pine, C.cream], [C.red, C.cream], [C.teal, C.cream], [C.red, C.gold], [C.pine, C.red], [C.red, C.cream]][i % 7];
  const W = 1.3;
  // counter
  g.push(xf(box(W, 0.4, 0.42, C.wood), [0, 0.2, 0.2]));
  const front = box(W + 0.02, 0.3, 0.02, pal[0]);
  faceColor(front, (x) => (Math.floor((x + W) / 0.13) % 2 ? pal[1] : null));
  g.push(xf(front, [0, 0.22, 0.42]));
  g.push(xf(box(W + 0.08, 0.04, 0.5, C.woodDark), [0, 0.42, 0.2]));
  g.push(xf(box(W, 1.0, 0.06, C.wood), [0, 0.5, -0.32]));
  g.push(xf(box(W - 0.2, 0.03, 0.12, C.woodDark), [0, 0.75, -0.25]));
  for (const sx of [-1, 1]) {
    g.push(xf(cyl(0.03, 0.03, 1.02, 6, C.woodDark), [sx * 0.62, 0.51, 0.4]));
    g.push(xf(box(0.04, 1.0, 0.7, C.wood), [sx * 0.63, 0.5, 0.05]));
  }
  // awning: striped slope with scalloped valance + snow
  const len = 1.0, ang = Math.atan2(0.18, 0.92);
  const aw = box(W + 0.18, 0.035, len, pal[0]);
  faceColor(aw, (x) => (Math.floor((x + W) / 0.18) % 2 ? pal[1] : null));
  g.push(xf(aw, [0, 1.0, 0.1], [ang, 0, 0]));
  g.push(xf(rbox(W + 0.06, 0.05, len * 0.42, 0.022, C.snow, FELT, 1), [0, 1.04 + 0.27 * Math.sin(ang), 0.1 - 0.27 * Math.cos(ang)], [ang, 0, 0]));
  const zf = 0.1 + Math.cos(ang) * len / 2 + 0.01, yf = 1.0 - Math.sin(ang) * len / 2;
  const sc = new THREE.Shape();
  sc.absarc(0, 0, 0.085, Math.PI, TAU, false);
  sc.closePath();
  const n = 8;
  for (let k = 0; k < n; k++) {
    const x = -W / 2 - 0.09 + 0.085 + k * ((W + 0.18 - 0.17) / (n - 1));
    g.push(xf(extrude(sc, 0.025, k % 2 ? pal[1] : pal[0], KNIT, 6), [x, yf, zf - 0.012]));
  }
  // cart-style string of big warm bulbs hanging under the awning edge
  g.push(xf(cyl(0.008, 0.008, W + 0.16, 4, C.ink, FELT), [0, yf - 0.012, zf + 0.012], [0, 0, Math.PI / 2]));
  for (let k = 0; k < 6; k++) {
    const x = -W / 2 + 0.05 + k * ((W - 0.1) / 5), drop = 0.07 + (k % 2) * 0.035;
    g.push(xf(cyl(0.004, 0.004, drop, 3, C.ink, FELT), [x, yf - 0.012 - drop / 2, zf + 0.012]));
    g.push(xf(cyl(0.016, 0.016, 0.026, 6, C.ink, FELT), [x, yf - 0.02 - drop, zf + 0.012]));
    lights.push(xf(bead(0.04, k % 2 ? '#ffd27a' : '#ffbe66', GLOW), [x, yf - 0.065 - drop, zf + 0.012], null, [1, 1.25, 1]));
  }
  // fluffy cotton snow: heaps on the roof and a soft lip along the front edge
  for (let k = 0; k < 4; k++) g.push(xf(ball(0.16, C.snow, FELT, 8, 5), [-0.48 + k * 0.32, 1.085 + (k % 2) * 0.012, -0.2 + (k % 2) * 0.06], null, [1.25, 0.4, 1.5]));
  for (let k = 0; k < 8; k++) g.push(xf(bead(0.05, C.snow), [-W / 2 - 0.02 + k * ((W + 0.04) / 7), yf + 0.035, zf - 0.03], null, [1.5, 0.75, 1]));
  // wagon wheel, counter lantern, jars, basket
  const wx = (i % 2 ? 1 : -1) * 0.68;
  g.push(xf(torus(0.17, 0.024, C.woodDark, KNIT, TAU, 14), [wx, 0.19, 0.16], [0, Math.PI / 2, 0]));
  for (let k = 0; k < 3; k++) g.push(xf(box(0.022, 0.32, 0.022, C.wood), [wx, 0.19, 0.16], [(k * Math.PI) / 3, 0, 0]));
  g.push(xf(bead(0.035, C.woodDark), [wx, 0.19, 0.16]));
  g.push(...lanternGeos(C.woodDark).map((q) => xf(q, [-wx * 0.76, 0.44, 0.3], null, 0.62)));
  g.push(xf(box(W - 0.2, 0.03, 0.12, C.woodDark), [0, 0.56, -0.25]));
  for (let k = 0; k < 4; k++) {
    const x = -0.36 + k * 0.24, c = ['#e09a3a', '#c8552d', '#e6c06a', '#b8302d'][(k + i) % 4];
    g.push(xf(cyl(0.032, 0.032, 0.075, 7, c, GLOSS), [x, 0.612, -0.24]));
    g.push(xf(cyl(0.034, 0.034, 0.016, 7, C.cream, FELT), [x, 0.657, -0.24]));
  }
  g.push(...basketGeos(i % 2 ? C.red : '#7a4f33', i % 2 ? GLOSS : FELT).map((q) => xf(q, [-wx * 0.8, 0, 0.56])));
  // sign
  g.push(xf(rbox(0.5, 0.16, 0.03, 0.015, C.cream, FELT, 1), [0, 1.27, -0.3]));
  g.push(xf(bead(0.04, pal[0]), [0, 1.27, -0.28], null, [1, 1, 0.5]));
  // goods on the counter
  for (let k = 0; k < 6; k++) {
    const x = -0.5 + k * 0.2, z = 0.25 + (k % 2) * 0.08;
    const t = (i + k) % 4;
    if (t === 0) g.push(...giftGeos(0.1, 0.08, k % 2 ? C.red : C.gold, C.cream).map((q) => xf(q, [x, 0.44, z])));
    else if (t === 1) { g.push(xf(cyl(0.05, 0.05, 0.015, 10, '#a86a3c', FELT), [x, 0.45, z])); g.push(xf(torus(0.04, 0.006, C.snow, FELT, TAU, 10), [x, 0.46, z], [Math.PI / 2, 0, 0])); }
    else if (t === 2) { g.push(xf(cyl(0.035, 0.03, 0.08, 8, C.red), [x, 0.48, z])); g.push(xf(cyl(0.032, 0.032, 0.01, 8, '#6b3f2a', FELT), [x, 0.52, z])); }
    else { g.push(xf(bead(0.04, C.red, GLOSS), [x, 0.48, z])); g.push(xf(bead(0.035, C.gold, GLOSS), [x + 0.05, 0.47, z - 0.03])); }
  }
  // shelf goods on the back wall
  for (let k = 0; k < 5; k++) g.push(xf(bead(0.035, [C.red, C.gold, C.teal, C.cream, C.red][k], GLOSS), [-0.4 + k * 0.2, 0.8, -0.24]));
  // festive extra: draped bulbs between front posts
  const gl = garland([-0.62, 0.99, 0.43], [0.62, 0.99, 0.43], 0.1, { n: 9, bulbR: 0.022, cord: C.pine, cordR: 0.02 });
  g.push(gl.cord);
  for (const sx of [-1, 1]) g.push(xf(bead(0.04, C.red), [sx * 0.62, 0.97, 0.45], null, [1.2, 0.9, 0.7]));
  extra.push(...gl.bulbs);
  return { g, lights, extra };
}

// ------------------------------------------------------------------ carousel
function buildCarousel(K, pos) {
  const { engine, colliders } = K;
  const { x, z } = pos;
  const R = 1.0;
  // static base
  const base = [];
  const ring = cyl(R + 0.08, R + 0.12, 0.12, 28, C.red);
  base.push(xf(ring, [0, 0.11, 0]));
  base.push(xf(torus(R + 0.1, 0.025, C.gold, KNIT, TAU, 32), [0, 0.17, 0], [Math.PI / 2, 0, 0]));
  base.push(xf(torus(R + 0.12, 0.02, C.gold, KNIT, TAU, 32), [0, 0.06, 0], [Math.PI / 2, 0, 0]));
  const bl = [];
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; bl.push(xf(bead(0.02, C.warm, GLOW), [x + Math.cos(a) * (R + 0.125), 0.11, z + Math.sin(a) * (R + 0.125)])); }
  K.prop('market', [x, 0, z], base.map((q) => xf(q, [x, 0, z]))).add(bl);
  colliders.addCircle(x, z, R + 0.12, 'carousel');
  K.keepCircle(x, z, R + 0.4);

  // rotor
  const g = [];
  g.push(xf(cyl(R, R, 0.04, 28, C.cream, FELT), [0, 0.19, 0]));
  const col = cyl(0.26, 0.26, 1.05, 12, C.red);
  faceColor(col, (px, py, pz) => (Math.floor((Math.atan2(pz, px) / TAU + 1) * 12) % 3 === 0 ? C.gold : null));
  g.push(xf(col, [0, 0.72, 0]));
  for (const y of [0.3, 0.75, 1.2]) g.push(xf(torus(0.27, 0.025, C.pine, KNIT, TAU, 14), [0, y, 0], [Math.PI / 2, 0, 0]));
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.push(xf(bead(0.025, C.red), [Math.cos(a) * 0.29, 0.75, Math.sin(a) * 0.29])); }
  const NH = 6, RH = 0.7;
  for (let k = 0; k < NH; k++) {
    const a = (k / NH) * TAU;
    const p = cylS(0.022, 0.022, 1.2, 6, 10, C.gold);
    faceColor(p, (px, py, pz) => (Math.floor(py / 0.07 + (Math.atan2(pz, px) / TAU) * 2) % 2 ? C.cream : null));
    g.push(xf(p, [Math.sin(a) * RH, 0.8, Math.cos(a) * RH]));
  }
  // canopy
  g.push(xf(cyl(R + 0.12, R + 0.12, 0.03, 28, C.cream, FELT), [0, 1.4, 0]));
  const roof = angleStripes(cone(R + 0.15, 0.5, 24, C.red), 24, C.red, C.cream);
  g.push(xf(roof, [0, 1.65, 0]));
  const band = cyl(R + 0.15, R + 0.15, 0.16, 24, C.red);
  faceColor(band, (px, py, pz) => (Math.floor((Math.atan2(pz, px) / TAU + 1) * 24) % 2 ? C.gold : null));
  g.push(xf(band, [0, 1.43, 0]));
  const sc = new THREE.Shape(); sc.absarc(0, 0, 0.13, Math.PI, TAU, false); sc.closePath();
  const NS = 12;
  for (let k = 0; k < NS; k++) {
    const a = (k / NS) * TAU, rr = R + 0.16;
    const px = Math.sin(a) * rr, pz = Math.cos(a) * rr;
    g.push(xf(extrude(sc, 0.02, k % 2 ? C.cream : C.red, KNIT, 6), [px, 1.36, pz], [0, a, 0]));
    // crown wreaths with red bows
    g.push(...wreathGeos(0.075).map((q) => xf(xf(q, [0, 0, 0.015]), [px, 1.47, pz], [0, a, 0])));
  }
  // cupola + flag
  g.push(xf(cyl(0.16, 0.18, 0.14, 12, C.cream), [0, 1.95, 0]));
  g.push(xf(cone(0.2, 0.18, 12, C.red), [0, 2.11, 0]));
  g.push(xf(cyl(0.008, 0.008, 0.3, 4, C.gold), [0, 2.32, 0]));
  g.push(xf(box(0.14, 0.08, 0.008, C.cream, FELT), [0.07, 2.42, 0]));
  const lights = [];
  for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; lights.push(xf(bead(0.022, k % 2 ? C.warm : '#ffe6b0', GLOW), [Math.sin(a) * (R + 0.17), 1.35 - Math.abs(Math.sin((k / 3) * Math.PI)) * 0.1, Math.cos(a) * (R + 0.17)])); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; lights.push(xf(bead(0.018, C.warm, GLOW), [Math.sin(a) * (R + 0.02) * 0.6, 1.65 + 0.2, Math.cos(a) * (R + 0.02) * 0.6])); }
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; lights.push(xf(bead(0.018, C.warm, GLOW), [Math.sin(a) * 0.19, 1.88, Math.cos(a) * 0.19])); }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + 0.26; lights.push(xf(bead(0.016, C.warm, GLOW), [Math.cos(a) * 0.272, 1.05, Math.sin(a) * 0.272])); }
  const rotor = new THREE.Group();
  rotor.position.set(x, 0, z);
  const mesh = new THREE.Mesh(merge([...g, ...lights]), engine.mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  rotor.add(mesh);
  // horses: instanced, bobbing on their poles
  const hg = horseGeo();
  const horses = new THREE.InstancedMesh(hg, engine.mat, NH);
  horses.castShadow = true;
  rotor.add(horses);
  K.G.market.group.root.add(rotor);
  K.G.market.group.node(rotor, [x, 0, z], { delay: 0.5, dur: 0.6 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  K.updates.push((dt, t) => {
    if (!rotor.visible) return;
    rotor.rotation.y += dt * 0.42;
    for (let k = 0; k < NH; k++) {
      const a = (k / NH) * TAU;
      v.set(Math.sin(a) * RH, 0.62 + Math.sin(t * 2.2 + k * 2.1) * 0.08, Math.cos(a) * RH);
      q.setFromAxisAngle(up, a);
      m4.compose(v, q, s1);
      horses.setMatrixAt(k, m4);
    }
    horses.instanceMatrix.needsUpdate = true;
  });
}

function horseGeo() {
  const g = [];
  const W = C.cream === '#efe1c6' ? '#f6f0e6' : C.snow;
  g.push(xf(ball(0.1, W), [0, 0, 0], null, [1.65, 0.85, 0.75]));
  g.push(xf(cyl(0.045, 0.06, 0.2, 8, W, FELT), [0.15, 0.1, 0], [0, 0, -0.6]));
  g.push(xf(ball(0.055, W), [0.24, 0.19, 0], null, [1.5, 0.9, 0.85]));
  g.push(xf(bead(0.022, C.pink), [0.31, 0.17, 0]));
  for (const s of [-1, 1]) g.push(xf(cone(0.015, 0.05, 5, W, FELT), [0.21, 0.26, s * 0.025]));
  // mane + tail (golden yarn)
  for (let k = 0; k < 4; k++) g.push(xf(bead(0.025, C.gold), [0.1 + k * 0.045, 0.15 + k * 0.03, 0]));
  g.push(tube([[-0.15, 0.03, 0], [-0.22, -0.02, 0], [-0.25, -0.12, 0]], 0.022, C.gold, KNIT, 6, 5));
  // legs (prancing)
  for (const [lx, lz, a] of [[0.1, 0.04, 0.8], [0.1, -0.04, 0.5], [-0.1, 0.04, -0.4], [-0.1, -0.04, -0.2]]) {
    g.push(xf(cyl(0.016, 0.014, 0.17, 5, W, FELT), [lx + Math.sin(a) * 0.07, -0.1 - Math.cos(a) * 0.05, lz], [0, 0, a]));
  }
  // saddle, garland, bow
  g.push(xf(box(0.11, 0.03, 0.17, C.red), [-0.01, 0.075, 0]));
  g.push(xf(box(0.04, 0.12, 0.17, C.gold), [-0.01, 0.0, 0]));
  g.push(xf(torus(0.06, 0.02, C.pine, KNIT, TAU, 10), [0.15, 0.08, 0], [0, Math.PI / 2, -0.6]));
  g.push(xf(bead(0.035, C.red), [0.17, 0.03, 0.05], null, [1, 0.8, 0.5]));
  g.push(xf(bead(0.035, C.red), [0.17, 0.03, -0.05], null, [1, 0.8, 0.5]));
  return merge(g);
}
