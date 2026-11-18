// Santa's Reindeer Rest (door 15): a small open-front knitted stable in Pinecone Park's north-east corner.
// One merged mesh (≤ 5k triangles) + a tiny canvas-textured felt sign. Collider: back and side walls (front open).
// Hidden until the park is revealed, then pops in with a squash-and-stretch scale.
import * as THREE from 'three';
import { cyl, cone, sph, dot, rbox, box, torus, tube, xf, merge, KNIT, FELT, GLOSS, GLOW } from '../../core/prims.js';
import { P } from '../../core/yarn.js';
import { REINDEER } from '../../core/layout.js';

const C = { wall: '#a5493a', trim: P.cream, wood: P.wood, woodDark: P.woodDark, straw: '#e0bf6a', strawDark: '#c79d45', snow: P.snow, water: '#9fc3d8', twig: '#7a5a3c' };

function restGeo() {
  const g = [];
  const HW = 0.5, HD = 0.35, WH = 0.62; // half width, half depth, wall height
  // floor of straw
  g.push(xf(rbox(1.06, 0.03, 0.78, 0.012, C.straw, KNIT, 1), [0, 0.015, 0.02]));
  // back + side walls (knitted red), cream trim rails
  g.push(xf(rbox(1.0, WH, 0.05, 0.02, C.wall, KNIT, 1), [0, WH / 2 + 0.02, -HD + 0.025]));
  for (const sx of [-1, 1]) {
    g.push(xf(rbox(0.05, WH, 0.7, 0.02, C.wall, KNIT, 1), [sx * (HW - 0.025), WH / 2 + 0.02, 0]));
    g.push(xf(rbox(0.06, 0.035, 0.74, 0.012, C.trim, KNIT, 1), [sx * (HW - 0.025), 0.23, 0]));
  }
  g.push(xf(rbox(1.0, 0.035, 0.06, 0.012, C.trim, KNIT, 1), [0, 0.23, -HD + 0.03]));
  // corner posts (front pair taller visual weight)
  for (const [x, z] of [[-HW, HD], [HW, HD], [-HW, -HD], [HW, -HD]]) {
    g.push(xf(cyl(0.028, 0.03, WH + 0.06, 8, C.woodDark, KNIT), [x, (WH + 0.06) / 2 + 0.01, z]));
  }
  // front beam
  g.push(xf(rbox(1.08, 0.04, 0.05, 0.015, C.wood, KNIT, 1), [0, WH + 0.06, HD]));
  // gable roof: two sloped panels + snow caps
  const a = Math.atan2(0.26, 0.56), L = 0.6;
  for (const sx of [-1, 1]) {
    const cx = sx * 0.285, cy = WH + 0.06 + 0.13;
    g.push(xf(rbox(L, 0.04, 0.84, 0.015, C.woodDark, KNIT, 1), [cx, cy, 0.02], [0, 0, -sx * a]));
    // snow blanket: thicker, scalloped by lumps
    g.push(xf(rbox(L * 0.98, 0.05, 0.86, 0.022, C.snow, FELT, 1), [cx, cy + 0.04, 0.02], [0, 0, -sx * a]));
    for (let i = 0; i < 4; i++) {
      const z = -0.34 + i * 0.23 + (sx > 0 ? 0.05 : 0);
      g.push(xf(sph(0.05, C.snow, FELT, 8, 6), [sx * (0.52 - 0.035 * (i % 2)), cy - 0.16 - (0.0 * i) , z + 0.02], null, [1.1, 0.7, 1.1]));
    }
  }
  g.push(xf(cyl(0.035, 0.035, 0.88, 8, C.snow, FELT), [0, WH + 0.06 + 0.265, 0.02], [Math.PI / 2, 0, 0])); // ridge snow roll
  // hanging lantern at the front gable
  g.push(xf(cyl(0.004, 0.004, 0.07, 4, C.woodDark, KNIT), [0.0, WH + 0.1, HD + 0.02]));
  g.push(xf(sph(0.028, P.glow, GLOW, 10, 7), [0, WH + 0.03, HD + 0.02], null, [1, 1.2, 1]));
  g.push(xf(cone(0.03, 0.03, 8, P.gold, GLOSS), [0, WH + 0.065, HD + 0.02]));
  // hay bale + straw tufts
  g.push(xf(rbox(0.2, 0.11, 0.13, 0.03, C.strawDark, KNIT, 1), [-0.27, 0.085, -0.2], [0, 0.2, 0]));
  g.push(xf(rbox(0.205, 0.015, 0.02, 0.006, C.wood, KNIT, 1), [-0.27, 0.09, -0.2], [0, 0.2, 0]));
  for (let i = 0; i < 5; i++) g.push(xf(cone(0.012, 0.07, 5, C.straw, KNIT), [-0.12 + i * 0.045, 0.05, -0.02 + (i % 2) * 0.05], [0.2 * (i % 3 - 1), 0, 0.3 * (i % 2 ? 1 : -1)]));
  // water trough with an icy surface
  g.push(xf(rbox(0.24, 0.08, 0.1, 0.02, C.wood, KNIT, 1), [0.27, 0.07, -0.22]));
  g.push(xf(box(0.2, 0.012, 0.06, C.water, GLOSS), [0.27, 0.108, -0.22]));
  // twig fence along both sides at the front
  for (const sx of [-1, 1]) {
    const x = sx * 0.62;
    const zs = [-0.28, -0.04, 0.2, 0.44];
    zs.forEach((z, i) => g.push(xf(cyl(0.012, 0.015, 0.2 + (i % 2) * 0.02, 5, C.twig, KNIT), [x, 0.1, z], [0, 0, sx * 0.06 * (i % 2 ? 1 : -1)])));
    for (const y of [0.09, 0.16]) g.push(xf(cyl(0.007, 0.007, 0.74, 5, C.twig, KNIT), [x, y, 0.08], [Math.PI / 2, 0, 0]));
  }
  // snow mounds + a tiny holly sprig on the sign post
  g.push(xf(sph(0.09, C.snow, FELT, 9, 6), [-0.58, 0.01, 0.52], null, [1.3, 0.45, 1]));
  g.push(xf(sph(0.07, C.snow, FELT, 9, 6), [0.58, 0.01, -0.34], null, [1.3, 0.4, 1]));
  // sign: two posts on the right front (the board with text is a separate textured plane)
  for (const dx of [-0.15, 0.15]) g.push(xf(cyl(0.01, 0.012, 0.3, 5, C.woodDark, KNIT), [0.7 + dx, 0.15, 0.5]));
  g.push(xf(rbox(0.36, 0.115, 0.018, 0.012, C.trim, FELT, 1), [0.7, 0.29, 0.495]));
  for (const dx of [-0.15, 0.15]) g.push(xf(dot(0.012, P.red, GLOSS), [0.7 + dx, 0.31, 0.5]));
  g.push(xf(sph(0.06, C.snow, FELT, 8, 6), [0.7, 0.01, 0.5], null, [1.6, 0.4, 1]));
  return merge(g);
}

function signTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 76;
  const c = cv.getContext('2d');
  c.fillStyle = '#efe1c6'; c.fillRect(0, 0, 256, 76);
  c.strokeStyle = '#b8302d'; c.lineWidth = 3; c.setLineDash([7, 5]); c.strokeRect(5, 5, 246, 66);
  c.setLineDash([]);
  c.fillStyle = '#8b2523';
  c.font = 'bold 30px "Trebuchet MS", system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('REINDEER', 128, 27);
  c.fillText('REST', 128, 56);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

/** Build the Reindeer Rest. Returns { group, pos, home, show(), update(dt), triangles, signMesh }. */
export function buildRest(ctx) {
  const { engine, colliders } = ctx;
  const { x, z, heading } = REINDEER.rest;
  const geo = restGeo();
  const mesh = new THREE.Mesh(geo, engine.mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const sMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.95, metalness: 0, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.28 });
  sMat.emissiveMap = sMat.map;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.098), sMat);
  sign.position.set(0.7, 0.29, 0.506);
  const group = new THREE.Group();
  group.add(mesh, sign);
  const y0 = colliders.heightAt?.(x, z) || 0;
  group.position.set(x, y0, z);
  group.rotation.y = heading;
  group.visible = false;
  group.scale.setScalar(0.001);
  engine.scene.add(group);

  // collider: back + side walls (front, +z local, stays open). local → world
  const c = Math.cos(heading), s = Math.sin(heading);
  const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const cols = [];
  const seg = (a, b) => { const A = W(...a), B = W(...b); try { cols.push(colliders.addSegment(A[0], A[1], B[0], B[1], 0.035, 'reindeerRest')); } catch (e) { /* */ } };
  seg([-0.52, -0.37], [0.52, -0.37]);
  seg([-0.52, -0.37], [-0.52, 0.2]);
  seg([0.52, -0.37], [0.52, 0.2]);

  const home = { x: W(0, 0.0)[0], z: W(0, 0.0)[1] }; // Clover's standing spot inside
  const door = { x: W(0, 0.62)[0], z: W(0, 0.62)[1] }; // just outside the open front
  let shown = false, pop = -1;
  const isRev = () => { try { return !!ctx.city?.isRevealed?.('park'); } catch (e) { return true; } };
  const rest = {
    group, mesh, sign, home, door, heading, pos: { x, z },
    triangles: geo.attributes.position.count / 3 + 2,
    update(dt) {
      const rev = isRev();
      if (rev && !shown) { shown = true; pop = 0; group.visible = true; }
      else if (!rev && shown && pop < 0) { shown = false; group.visible = false; group.scale.setScalar(0.001); }
      if (pop >= 0) {
        pop += dt;
        const u = Math.min(1, pop / 0.55);
        const e = 1 + Math.sin(u * Math.PI * 2.2) * Math.exp(-u * 3.2) * 0.22 - Math.exp(-u * 7) * 1;
        group.scale.set(e * (1 + (1 - u) * 0.0), e * (1 + Math.sin(u * 9) * 0.04 * (1 - u)), e);
        if (u >= 1) { pop = -1; group.scale.setScalar(1); }
      }
    },
    get shown() { return shown; },
    dispose() { engine.scene.remove(group); geo.dispose(); sMat.map.dispose(); sMat.dispose(); sign.geometry.dispose(); for (const o of cols) o.enabled = false; },
  };
  return rest;
}
