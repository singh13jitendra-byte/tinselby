// Knitted Santa: red knit suit, white felt beard / trim / pom-pom, black boots, gold buckle, rosy cheeks.
// Faces +z, feet at y = 0, about 0.56 tall (player ≈ 0.42). One body mesh + two arm meshes (for waving / handing over).
import * as THREE from 'three';
import { cone, cyl, sph, dot, box, rbox, torus, tube, xf, merge, KNIT, FELT, GLOSS } from '../core/prims.js';
import { P } from '../core/yarn.js';

export const C = {
  suit: '#bf2a2a', suitDark: '#8f1f22', fur: '#fbf6ee', boot: '#262222', belt: '#2a2324', buckle: '#f0b742',
  skin: '#f4d2b8', cheek: '#ec8f92', reindeer: '#8a5a3a', reindeerDark: '#5e3b26', muzzle: '#d9b48c', antler: '#c8312f',
  sack: '#a98a62', sackDark: '#7f6546',
};

export function buildSanta(mat) {
  const group = new THREE.Group();
  const body = new THREE.Group(); // bobs / leans
  group.add(body);
  const g = [];
  // boots + legs
  for (const sx of [-1, 1]) {
    g.push(xf(sph(0.036, C.boot, FELT, 12, 8), [sx * 0.045, 0.028, 0.012], null, [1, 0.8, 1.45]));
    g.push(xf(cyl(0.03, 0.032, 0.05, 10, C.boot, KNIT), [sx * 0.045, 0.06, 0]));
    g.push(xf(torus(0.032, 0.01, C.fur, FELT), [sx * 0.045, 0.085, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(cyl(0.032, 0.034, 0.04, 10, C.suit, KNIT), [sx * 0.045, 0.105, 0]));
  }
  // round belly coat
  g.push(xf(sph(0.115, C.suit, KNIT, 18, 12), [0, 0.2, 0.004], null, [1, 1.0, 0.92]));
  g.push(xf(cyl(0.1, 0.118, 0.07, 18, C.suit, KNIT), [0, 0.135, 0]));
  g.push(xf(torus(0.108, 0.017, C.fur, FELT), [0, 0.104, 0], [Math.PI / 2, 0, 0], [1, 1, 0.92]));
  // front fur strip
  g.push(xf(rbox(0.04, 0.17, 0.03, 0.012, C.fur, FELT), [0, 0.2, 0.103], [-0.12, 0, 0]));
  // belt + gold buckle
  g.push(xf(torus(0.112, 0.017, C.belt, KNIT, Math.PI * 2, 28), [0, 0.19, 0.004], [Math.PI / 2, 0, 0], [1, 0.93, 1]));
  g.push(xf(rbox(0.05, 0.042, 0.014, 0.006, C.buckle, GLOSS), [0, 0.19, 0.112]));
  g.push(xf(box(0.026, 0.02, 0.016, C.belt, KNIT), [0, 0.19, 0.114]));
  // chest / shoulders
  g.push(xf(sph(0.085, C.suit, KNIT, 16, 10), [0, 0.29, 0], null, [1.05, 0.9, 0.9]));
  // head
  g.push(xf(sph(0.064, C.skin, FELT, 16, 12), [0, 0.37, 0.006]));
  for (const sx of [-1, 1]) {
    g.push(xf(dot(0.0085, P.ink, GLOSS), [sx * 0.022, 0.382, 0.06]));
    g.push(xf(sph(0.014, C.cheek, FELT, 8, 6), [sx * 0.036, 0.362, 0.052], null, [1, 0.75, 0.5]));
    g.push(xf(sph(0.014, C.fur, FELT, 8, 6), [sx * 0.024, 0.398, 0.056], [0, 0, sx * 0.3], [1.3, 0.5, 0.6])); // brows
  }
  g.push(xf(sph(0.014, '#eba08f', FELT, 8, 6), [0, 0.366, 0.066])); // nose
  // beard (big fluffy felt) + moustache
  g.push(xf(sph(0.066, C.fur, FELT, 14, 10), [0, 0.325, 0.03], null, [1.08, 1.12, 0.78]));
  g.push(xf(sph(0.04, C.fur, FELT, 12, 8), [0, 0.285, 0.05], null, [1, 1, 0.8]));
  for (const sx of [-1, 1]) g.push(xf(sph(0.022, C.fur, FELT, 10, 8), [sx * 0.02, 0.352, 0.064], [0, 0, sx * -0.5], [1.5, 0.7, 0.7]));
  // hair at the back
  g.push(xf(sph(0.06, C.fur, FELT, 12, 8), [0, 0.37, -0.02], null, [1.1, 0.9, 0.9]));
  // floppy hat: brim, cone, bent tip, pom-pom
  g.push(xf(torus(0.06, 0.019, C.fur, FELT), [0, 0.41, 0.0], [Math.PI / 2 - 0.12, 0, 0]));
  g.push(xf(cone(0.06, 0.1, 14, C.suit, KNIT), [0, 0.46, -0.008], [-0.25, 0, 0]));
  g.push(xf(cone(0.032, 0.07, 12, C.suit, KNIT), [0.0, 0.5, -0.05], [-1.3, 0, 0]));
  g.push(xf(sph(0.026, C.fur, FELT, 10, 8), [0, 0.49, -0.09]));
  const mesh = new THREE.Mesh(merge(g), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  body.add(mesh);

  const armGeo = merge([
    xf(cyl(0.024, 0.027, 0.11, 10, C.suit, KNIT), [0, -0.055, 0]),
    xf(torus(0.026, 0.01, C.fur, FELT), [0, -0.11, 0], [Math.PI / 2, 0, 0]),
    xf(sph(0.026, C.fur, FELT, 10, 8), [0, -0.135, 0], null, [1, 1.1, 1]),
  ]);
  const arms = [-1, 1].map((sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.098, 0.3, 0);
    piv.rotation.z = sx * 0.35;
    const m = new THREE.Mesh(armGeo, mat);
    m.castShadow = true;
    piv.add(m);
    body.add(piv);
    return piv;
  });
  const hands = new THREE.Object3D();
  hands.position.set(0, 0.2, 0.15);
  body.add(hands);

  let t = 0;
  const santa = {
    group, body, arms, hands,
    pose: 'sit', // sit | stand | wave | give | cheer
    walk: 0, // 0..1 walking intensity
    update(dt) {
      t += dt;
      const [L, R] = arms;
      let lx = 0, lz = -0.35, rx = 0, rz = 0.35;
      body.position.y = 0;
      body.rotation.set(0, 0, 0);
      if (santa.pose === 'sit') {
        lx = rx = -0.5; lz = -0.25; rz = 0.25; // holding reins
        body.position.y = Math.sin(t * 3) * 0.004;
      } else if (santa.pose === 'wave') {
        rz = 2.5 + Math.sin(t * 9) * 0.35; rx = -0.2;
        lz = -0.3; lx = -0.1;
        body.rotation.z = Math.sin(t * 4.5) * 0.05;
        body.position.y = Math.abs(Math.sin(t * 4.5)) * 0.01;
      } else if (santa.pose === 'give') {
        lx = rx = -1.25; lz = -0.15; rz = 0.15;
        body.rotation.x = 0.12;
      } else if (santa.pose === 'cheer') {
        lz = -2.6 - Math.sin(t * 7) * 0.25; rz = 2.6 + Math.sin(t * 7) * 0.25;
        body.position.y = Math.abs(Math.sin(t * 5)) * 0.02;
      } else {
        const s = Math.sin(t * 9) * santa.walk;
        lx = s * 0.5; rx = -s * 0.5;
        body.position.y = Math.abs(s) * 0.015 + Math.sin(t * 2) * 0.003;
        body.rotation.z = s * 0.06;
      }
      const k = 1 - Math.exp(-dt * 12);
      L.rotation.x += (lx - L.rotation.x) * k; L.rotation.z += (lz - L.rotation.z) * k;
      R.rotation.x += (rx - R.rotation.x) * k; R.rotation.z += (rz - R.rotation.z) * k;
    },
  };
  return santa;
}
