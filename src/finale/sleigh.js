// Santa's sleigh (red knit body, gold trim + runners, piled wrapped gifts, a sack) and the gift with a knitted name tag.
// Sleigh faces +z (front scroll at +z); origin on the ground under its middle.
import * as THREE from 'three';
import { cyl, sph, box, rbox, torus, tube, xf, merge, poly, part, boxUV, KNIT, FELT, GLOSS, GLOW } from '../core/prims.js';
import { P } from '../core/yarn.js';
import { C } from './santa.js';

const PROFILE = [ // (along z, y) side silhouette
  [-0.42, 0.09], [-0.47, 0.3], [-0.42, 0.35], [-0.14, 0.31], [-0.1, 0.45], [-0.04, 0.47], [0.0, 0.42], [0.03, 0.25],
  [0.2, 0.25], [0.3, 0.37], [0.4, 0.43], [0.47, 0.38], [0.43, 0.31], [0.37, 0.1],
];
export const SLEIGH = { seat: new THREE.Vector3(0, 0.12, 0.1), front: 0.45, rear: -0.48, halfW: 0.22 };

function giftBox(w, h, d, col, ribbon, pos, rotY = 0) {
  const g = [xf(rbox(w, h, d, Math.min(w, h, d) * 0.12, col, KNIT), [0, h / 2, 0])];
  g.push(xf(box(w + 0.006, h + 0.004, 0.018, ribbon, FELT), [0, h / 2, 0]));
  g.push(xf(box(0.018, h + 0.006, d + 0.006, ribbon, FELT), [0, h / 2, 0]));
  for (const s of [-1, 1]) g.push(xf(sph(0.022, ribbon, FELT, 8, 6), [s * 0.018, h + 0.01, 0], [0, 0, s * 0.6], [1.2, 0.6, 0.7]));
  return g.map((p) => xf(p, pos, [0, rotY, 0]));
}

export function buildSleigh(mat) {
  const g = [];
  const shape = poly(PROFILE.map(([z, y]) => [z, y]));
  const W = SLEIGH.halfW * 2;
  const body = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 6 });
  body.translate(0, 0, -W / 2);
  body.rotateY(-Math.PI / 2); // shape x → +z, extrusion → x
  g.push(xf(boxify(body, C.suit), [0, 0, 0]));
  // seat cushion + backrest cushion (deep green felt)
  g.push(xf(rbox(W - 0.04, 0.05, 0.17, 0.02, '#2f6446', FELT), [0, 0.27, 0.11]));
  g.push(xf(rbox(W - 0.04, 0.13, 0.05, 0.02, '#2f6446', FELT), [0, 0.37, 0.01], [-0.15, 0, 0]));
  // gold trim along both top edges + a gold swirl on the side panels
  const top = PROFILE.slice(0, 13).map(([z, y]) => [z, y + 0.012]);
  for (const sx of [-1, 1]) {
    g.push(tube(top.map(([z, y]) => [sx * (SLEIGH.halfW + 0.012), y, z]), 0.011, P.gold, GLOSS, 60, 5));
    g.push(tube([[sx * 0.237, 0.2, -0.3], [sx * 0.237, 0.26, -0.18], [sx * 0.237, 0.2, -0.06], [sx * 0.237, 0.15, 0.1], [sx * 0.237, 0.18, 0.24], [sx * 0.237, 0.23, 0.3]], 0.008, P.gold, GLOSS, 30, 4));
    for (const z of [-0.28, 0.12]) g.push(xf(sph(0.018, P.gold, GLOSS, 8, 6), [sx * 0.24, 0.17, z]));
    // runners with a front curl
    const run = [[-0.55, 0.05], [-0.48, 0.0], [-0.2, -0.005], [0.25, -0.005], [0.5, 0.03], [0.62, 0.15], [0.6, 0.26], [0.52, 0.27], [0.49, 0.21]];
    g.push(tube(run.map(([z, y]) => [sx * 0.2, y + 0.018, z]), 0.016, P.gold, GLOSS, 60, 6));
    for (const z of [-0.32, 0.0, 0.28]) g.push(xf(cyl(0.012, 0.012, 0.08, 6, P.gold, GLOSS), [sx * 0.2, 0.06, z]));
  }
  // rear deck: sack + piled gifts
  g.push(xf(sph(0.14, C.sack, FELT, 14, 10), [0.03, 0.43, -0.3], [0.2, 0.3, 0.1], [1, 1.05, 0.9]));
  g.push(xf(cyl(0.035, 0.05, 0.06, 10, C.sack, FELT), [0.0, 0.57, -0.33], [0.3, 0, 0.2]));
  g.push(xf(torus(0.04, 0.009, P.gold, KNIT), [0.0, 0.555, -0.33], [Math.PI / 2 + 0.3, 0, 0.2]));
  g.push(...giftBox(0.11, 0.1, 0.11, '#2f6e4a', P.gold, [-0.12, 0.31, -0.36], 0.4));
  g.push(...giftBox(0.09, 0.08, 0.09, P.gold, C.suit, [0.15, 0.31, -0.2], -0.3));
  g.push(...giftBox(0.08, 0.12, 0.08, '#4f9590', C.fur, [0.14, 0.31, -0.4], 0.2));
  g.push(...giftBox(0.07, 0.06, 0.07, '#e7a1a3', '#2f6e4a', [-0.1, 0.41, -0.33], 0.9));
  g.push(...giftBox(0.075, 0.07, 0.075, C.fur, C.suit, [-0.13, 0.31, -0.18], -0.6));
  // little lantern on the front scroll
  g.push(xf(cyl(0.004, 0.004, 0.06, 4, P.ink, KNIT), [0.2, 0.43, 0.38]));
  g.push(xf(sph(0.022, P.glowSoft, GLOW, 8, 6), [0.2, 0.39, 0.38]));
  const mesh = new THREE.Mesh(merge(g), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Convert an ExtrudeGeometry into a yarn part (colour + knit uv). */
function boxify(geo, color) { return part(boxUV(geo), color, KNIT); }

/** The gift Santa hands over: red knit box, gold ribbon + bow, and a knitted tag "For {name}" hanging at its front-right. */
export function buildGift(mat, name) {
  const group = new THREE.Group();
  const s = 0.11;
  const g = [xf(rbox(s, s * 0.9, s, 0.014, '#c22f2b', KNIT), [0, 0, 0])];
  g.push(xf(box(s + 0.008, s * 0.9 + 0.006, 0.022, P.gold, FELT), [0, 0, 0]));
  g.push(xf(box(0.022, s * 0.9 + 0.008, s + 0.008, P.gold, FELT), [0, 0, 0]));
  for (const a of [0.5, -0.5, 2.6, -2.6]) g.push(xf(sph(0.026, P.gold, FELT, 8, 6), [Math.sin(a) * 0.022, s * 0.45 + 0.016, Math.cos(a) * 0.022], [0, a, 0.5], [1.3, 0.55, 0.7]));
  g.push(xf(sph(0.013, P.gold, FELT, 8, 6), [0, s * 0.45 + 0.022, 0]));
  // yarn loop the tag hangs from
  g.push(tube([[s * 0.42, s * 0.45, s / 2 + 0.004], [s * 0.4, s * 0.1, s / 2 + 0.012], [s * 0.3, -s * 0.3, s / 2 + 0.016]], 0.0024, P.cream, KNIT, 12, 4));
  const box3 = new THREE.Mesh(merge(g), mat);
  box3.castShadow = true;
  group.add(box3);

  // tag: knitted cream card with stitched border and the player's name (canvas texture)
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = '#f6ead2';
  c.fillRect(0, 0, 256, 160);
  for (let y = 0; y < 160; y += 8) for (let x = (y / 8) % 2 ? 0 : 6; x < 256; x += 12) { // knit V texture
    c.strokeStyle = 'rgba(150,110,70,0.18)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3, y + 7); c.lineTo(x + 6, y); c.stroke();
  }
  c.setLineDash([10, 7]); c.strokeStyle = '#b8302d'; c.lineWidth = 5;
  c.strokeRect(12, 12, 232, 136);
  c.setLineDash([]);
  c.fillStyle = '#8b2523';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '600 30px Fredoka, Nunito, "Trebuchet MS", sans-serif';
  c.fillText('For', 128, 52);
  let fs = 50;
  const label = (name || 'you').slice(0, 18);
  do { c.font = `700 ${fs}px Fredoka, Nunito, "Trebuchet MS", sans-serif`; fs -= 2; } while (c.measureText(label).width > 210 && fs > 16);
  c.fillText(label, 128, 104);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const tagMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 });
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.053), tagMat);
  tag.position.set(s * 0.24, -s * 0.52, s / 2 + 0.018);
  tag.rotation.set(-0.08, 0.38, 0.1);
  group.add(tag);
  group.userData.tag = tag;
  return group;
}
