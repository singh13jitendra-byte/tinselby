// Book page, cotton-snow ground tiles, knitted cobbled roads, tram rails, crossings, pavements.
import * as THREE from 'three';
import { C, part, xf, box, rbox, KNIT, FELT, GLOSS, faceColor, col, mulberry32 } from './kit.js';

const PLAZA_SNOW = ['#f7f5f1', '#f1efeb', '#fbfaf7', '#f4f2ee', '#eeece8'];

/** Flat grid of knit "cobbles": per-cell colour jitter (cheap mosaic). Top face at y. */
export function cobbles(x0, z0, x1, z1, cell, palette, y, seed = 1, k = KNIT) {
  const w = x1 - x0, d = z1 - z0;
  const nx = Math.max(1, Math.round(w / cell)), nz = Math.max(1, Math.round(d / cell));
  const g = part(new THREE.PlaneGeometry(w, d, nx, nz).rotateX(-Math.PI / 2), palette[0], k, [w / 0.072, d / 0.058]);
  const rnd = mulberry32(seed);
  const pal = palette.map(col);
  const cc = [];
  for (let i = 0; i < nx * nz; i++) cc.push(pal[Math.floor(rnd() * pal.length)]);
  const cgeo = g.attributes.color;
  for (let v = 0; v < cgeo.count; v++) { const c = cc[Math.floor(v / 6)]; cgeo.setXYZ(v, c.r, c.g, c.b); }
  // knit uv in world units so stitches line up across chunks
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let v = 0; v < p.count; v++) uv.setXY(v, (p.getX(v) + x0 + w / 2) / 0.072, (p.getZ(v) + z0 + d / 2) / 0.058);
  return xf(g, [x0 + w / 2, y, z0 + d / 2]);
}

/** Split a rect into chunks (≈size) and call fn(x0,z0,x1,z1) for each. */
export function chunks(x0, z0, x1, z1, size, fn) {
  const nx = Math.max(1, Math.round((x1 - x0) / size)), nz = Math.max(1, Math.round((z1 - z0) / size));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    fn(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz, x0 + ((x1 - x0) * (i + 1)) / nx, z0 + ((z1 - z0) * (j + 1)) / nz);
  }
}

export function buildBook(K) {
  const { engine } = K;
  const parts = [];
  const W = 50, D = 41, cx = 0, cz = -0.5;
  // hard cover (knitted, deep red) peeking out under the pages
  parts.push(xf(rbox(W + 1.4, 0.3, D + 1.4, 0.12, C.deepRed, KNIT, 1), [cx, -0.42, cz]));
  // page block: stacked felt sheets with slightly different tones
  const tones = ['#e8dcc4', '#dccfb5', '#e4d5bb', '#d4c6aa'];
  for (let i = 0; i < 4; i++) parts.push(xf(box(W - i * 0.05, 0.07, D - i * 0.04, tones[i], FELT), [cx, -0.27 + i * 0.07 - 0.035 + 0.035, cz]));
  // top page
  const page = part(new THREE.PlaneGeometry(W, D, 1, 1).rotateX(-Math.PI / 2), C.page, FELT, [W / 0.072, D / 0.058]);
  parts.push(xf(page, [cx, 0, cz]));
  // a stitched border line around the city on the page
  const r = K.layout.WORLD, m = 0.55;
  const dash = [];
  for (let x = r.minX - m; x < r.maxX + m; x += 0.5) { dash.push([x, r.minZ - m, 0]); dash.push([x, r.maxZ + m, 0]); }
  for (let z = r.minZ - m; z < r.maxZ + m; z += 0.5) { dash.push([r.minX - m, z, 1]); dash.push([r.maxX + m, z, 1]); }
  for (const [x, z, v] of dash) parts.push(xf(box(v ? 0.05 : 0.26, 0.012, v ? 0.26 : 0.05, C.thread, KNIT), [x + (v ? 0 : 0.13), 0.006, z + (v ? 0.13 : 0)]));
  const geo = K.merge(parts);
  const mesh = new THREE.Mesh(geo, engine.mat);
  mesh.receiveShadow = true;
  mesh.name = 'city-book';
  engine.scene.add(mesh);
  K.colliders.groundMeshes.push(mesh);
  return mesh;
}

/** Cotton-snow ground tiles for every district (the hill makes its own sculpted ground). */
export function buildGroundTiles(K) {
  const { WORLD } = K.layout;
  const tones = ['#f9f7f4', '#f7f5f2', '#fbfaf7', '#f6f4f1']; // near-uniform cotton white: no visible patchwork
  const rnd = mulberry32(7);
  const tile = (x0, z0, x1, z1) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const gid = K.groupAt(cx, cz);
    const b = K.G[gid].ground;
    b.begin([cx, 0, cz], { kind: 'tile', hinge: [cx, 0, z0] });
    b.add(xf(box(x1 - x0 + 0.002, 0.03, z1 - z0 + 0.002, tones[Math.floor(rnd() * tones.length)], FELT), [cx, 0.015, cz]));
  };
  // south of the hill: full width
  const zs = -7.6;
  const nx = 20, nz = 12;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = WORLD.minX + ((WORLD.maxX - WORLD.minX) * i) / nx, x1 = WORLD.minX + ((WORLD.maxX - WORLD.minX) * (i + 1)) / nx;
    const z0 = zs + ((WORLD.maxZ - zs) * j) / nz, z1 = zs + ((WORLD.maxZ - zs) * (j + 1)) / nz;
    tile(x0, z0, x1, z1);
  }
  // beside the hill
  chunks(WORLD.minX, WORLD.minZ, -8.5, zs, 2.3, tile);
  chunks(9, WORLD.minZ, WORLD.maxX, zs, 2.3, tile);
}

/** Ring road, connector roads, tram rails, crossings, pavements + plaza cobbles. */
export function buildRoads(K) {
  const L = K.layout;
  const Y = 0.05;
  let seed = 11;
  const strip = (gid, x0, z0, x1, z1, pal = C.road, cell = 0.3, y = Y, size = 2.4) => {
    chunks(x0, z0, x1, z1, size, (a, b, c, d) => {
      const B = K.G[gid].ground;
      B.begin([(a + c) / 2, 0, (b + d) / 2], { kind: 'tile', hinge: [(a + c) / 2, 0, b] });
      B.add(cobbles(a, b, c, d, cell, pal, y, seed++));
    });
  };
  // ring road: north / south strips include corners
  strip('streets', -8.4, -7.4, 8.4, -5.6);
  strip('streets', -8.4, 5.6, 8.4, 7.4);
  strip('streets', -8.4, -5.6, -6.6, 5.6);
  strip('streets', 6.6, -5.6, 8.4, 5.6);
  // connectors
  strip('streets', -8.6, -0.8, -8.4, 0.8);
  strip('residential', -20.5, -0.8, -8.6, 0.8);
  strip('streets', 8.4, -0.7, 9.6, 0.7);
  strip('streets', -0.7, -7.75, 0.7, -7.4);
  strip('streets', -0.7, 7.4, 0.7, 8.2);
  // market plaza (light cream cobbles) with a red-brick ring round the tree
  const tree = L.MARKET.tree;
  chunks(-6.6, -5.6, 6.6, 5.6, 2.2, (a, b, c, d) => {
    const B = K.G.market.ground;
    B.begin([(a + c) / 2, 0, (b + d) / 2], { kind: 'tile', hinge: [(a + c) / 2, 0, b] });
    // cotton-snow square (felt) with knitted inlays: brick + pine rings round the tree, candy-stripe border
    const g = cobbles(a, b, c, d, 0.34, PLAZA_SNOW, 0.055, seed++, FELT);
    const kind = g.attributes.aMat;
    faceColor(g, (x, y, z, f) => {
      const r = Math.hypot(x - tree.x, z - tree.z);
      let c2 = null;
      if (Math.abs(x) > 6.24 || Math.abs(z) > 5.29) c2 = (Math.floor((x + 6.6) / 0.36667) + Math.floor((z + 5.6) / 0.32)) % 2 ? '#b8302d' : '#f5efe4';
      if (c2) for (let j = 0; j < 3; j++) kind.setX(f * 3 + j, KNIT);
      return c2;
    });
    B.add(g);
  });
  // residential pavements (raised a touch) + curbs
  strip('residential', -20.5, 0.8, -8.6, 1.98, C.cobble, 0.3, 0.065, 2.4);
  strip('residential', -20.5, -1.98, -8.6, -0.8, C.cobble, 0.3, 0.065, 2.4);
  const curb = (gid, x0, z0, x1, z1, y = 0.07) => {
    const B = K.G[gid].ground;
    B.begin([(x0 + x1) / 2, 0, (z0 + z1) / 2], { kind: 'pop' });
    B.add(xf(box(Math.abs(x1 - x0) || 0.07, 0.05, Math.abs(z1 - z0) || 0.07, C.cream, KNIT), [(x0 + x1) / 2, y - 0.025, (z0 + z1) / 2]));
  };
  for (let x = -20.5; x < -8.6; x += 2.98) { curb('residential', x, 0.8, Math.min(x + 2.98, -8.6), 0.8, 0.085); curb('residential', x, -0.8, Math.min(x + 2.98, -8.6), -0.8, 0.085); }
  // ring curbs (outer edge) + plaza curb
  for (const [x0, z0, x1, z1] of [[-8.4, -7.4, 8.4, -7.4], [-8.4, 7.4, -0.7, 7.4], [0.7, 7.4, 8.4, 7.4], [-8.4, -7.4, -8.4, -0.8], [-8.4, 0.8, -8.4, 7.4], [8.4, -7.4, 8.4, -0.7], [8.4, 0.7, 8.4, 7.4]]) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 3));
    for (let i = 0; i < n; i++) curb('streets', x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n, z0 + ((z1 - z0) * (i + 1)) / n);
  }
  for (const [x0, z0, x1, z1] of [[-6.6, -5.6, -0.7, -5.6], [0.7, -5.6, 6.6, -5.6], [-6.6, 5.6, -0.7, 5.6], [0.7, 5.6, 6.6, 5.6], [-6.6, -5.6, -6.6, 5.6], [6.6, -5.6, 6.6, 5.6]]) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 3));
    for (let i = 0; i < n; i++) curb('market', x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n, z0 + ((z1 - z0) * (i + 1)) / n, 0.08);
  }
  // tram rails: two rectangles offset ±0.17 from the tram loop, plus a darker groove band between
  const [ax, az] = [Math.abs(L.TRAM_LOOP[0][0]), Math.abs(L.TRAM_LOOP[0][1])];
  const B = K.G.streets.ground;
  for (const side of ['n', 's', 'w', 'e']) {
    const horiz = side === 'n' || side === 's';
    const sgn = side === 'n' || side === 'w' ? -1 : 1;
    const c = horiz ? [0, 0, sgn * az] : [sgn * ax, 0, 0];
    B.begin(c, { kind: 'pop', delay: 0.5 });
    for (const off of [-0.17, 0.17]) {
      const hx = ax + off, hz = az + off;
      if (horiz) B.add(xf(box(2 * hx + 0.035, 0.016, 0.035, C.rail, GLOSS), [0, Y + 0.008, sgn * hz]));
      else B.add(xf(box(0.035, 0.016, 2 * hz + 0.035, C.rail, GLOSS), [sgn * hx, Y + 0.008, 0]));
    }
    // sleepers peeking between cobbles
    const len = horiz ? 2 * ax : 2 * az;
    for (let t = -len / 2 + 0.2; t < len / 2; t += 0.34) {
      if (horiz) B.add(xf(box(0.07, 0.006, 0.46, C.woodDark, KNIT), [t, Y + 0.003, sgn * az]));
      else B.add(xf(box(0.46, 0.006, 0.07, C.woodDark, KNIT), [sgn * ax, Y + 0.003, t]));
    }
  }
  // zebra crossings
  for (const [x, z] of L.CROSSINGS) {
    const alongX = Math.abs(z) > 5 || (Math.abs(x) > 9); // road direction at this crossing
    const width = Math.abs(x) > 9 ? 1.6 : 1.8;
    const gid = Math.abs(x) > 8.6 ? 'residential' : 'streets';
    const Bc = K.G[gid].ground;
    Bc.begin([x, 0, z], { kind: 'pop', delay: 0.55 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const o = -width / 2 + 0.2 + (i * (width - 0.4)) / (n - 1);
      if (alongX) Bc.add(xf(box(0.62, 0.008, 0.16, C.cream, KNIT), [x, Y + 0.006, z + o]));
      else Bc.add(xf(box(0.16, 0.008, 0.62, C.cream, KNIT), [x + o, Y + 0.006, z]));
    }
  }
}
