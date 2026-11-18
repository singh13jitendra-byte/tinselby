// Knitted / felted primitive builders. Every builder returns a non-indexed BufferGeometry with
// position, normal, uv (in stitch units), color and aMat attributes, ready for merge() and the shared yarn material.
// Transform with xf(geo, [x,y,z], [rx,ry,rz], scale) then merge([...]) into ONE mesh per prop.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { KNIT, FELT, GLOW, GLOSS, SW, SH, part, boxUV, xf, merge, poly, circlePts, starPts } from './yarn.js';

export { KNIT, FELT, GLOW, GLOSS, xf, merge, poly, circlePts, starPts, part, boxUV };
const TAU = Math.PI * 2;

/** Open-bottom cone centred on its middle (spans -h/2..h/2). */
export const cone = (r, h, seg, c, k = KNIT) => part(new THREE.ConeGeometry(r, h, seg, 1, true), c, k, [(TAU * r) / SW, Math.hypot(r, h) / SH]);
/** Cylinder centred on its middle. */
export const cyl = (rt, rb, h, seg, c, k = KNIT) => part(new THREE.CylinderGeometry(rt, rb, h, seg), c, k, [(TAU * Math.max(rt, rb)) / SW, h / SH]);
export const sph = (r, c, k = FELT, ws = 14, hs = 10) => part(new THREE.SphereGeometry(r, ws, hs), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);
/** Low-poly small sphere for decorations (lights, baubles, buttons). */
export const dot = (r, c, k = FELT) => sph(r, c, k, 8, 6);
export const box = (w, h, d, c, k = KNIT) => part(boxUV(new THREE.BoxGeometry(w, h, d)), c, k);
export const rbox = (w, h, d, r, c, k = KNIT, seg = 2) => part(boxUV(new RoundedBoxGeometry(w, h, d, seg, r)), c, k);
/** Torus; rs = radial (tube cross-section) segments, optional (default 8). */
export const torus = (R, r, c, k = KNIT, arc = TAU, ts = 24, rs = 8) => part(new THREE.TorusGeometry(R, r, rs, ts, arc), c, k, [(R * arc) / SW, (TAU * r) / SH]);
/** Extrude a THREE.Shape along +z by depth. */
export const extrude = (shape, depth, c, k = KNIT, curveSegments = 8) => part(boxUV(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments })), c, k);
/** Tube along points [[x,y,z],...]. */
export const tube = (pts, r, c, k = KNIT, segs = 32, radial = 6, closed = false) => {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  return part(new THREE.TubeGeometry(curve, segs, r, radial, closed), c, k, [curve.getLength() / SW, (TAU * r) / SH]);
};
/** Lay a 2D shape flat on the ground (shape x → world x, shape y → world −z), extruded upward by depth, base at y. */
export const flatShape = (shape, depth, c, k = FELT, y = 0) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return part(boxUV(g), c, k);
};
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/** Recolour a part in place (e.g. stripes). fn(i, positionArray) → THREE.Color */
export function recolor(geo, fn) {
  const col = geo.attributes.color, pos = geo.attributes.position;
  for (let i = 0; i < col.count; i++) {
    const c = fn(i, pos);
    if (c) col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return geo;
}
