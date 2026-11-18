import * as THREE from 'three';
import { P, KNIT, FELT, GLOW, GLOSS, SW, SH, part, boxUV, xf, merge, poly, starPts } from './yarn.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SPAWN } from './layout.js';

const TAU = Math.PI * 2;
const sph = (r, c, k = FELT, ws = 14, hs = 10) => part(new THREE.SphereGeometry(r, ws, hs), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);
const cyl = (rt, rb, h, c, k = KNIT, seg = 12) => part(new THREE.CylinderGeometry(rt, rb, h, seg), c, k, [(TAU * Math.max(rt, rb)) / SW, h / SH]);

/** Character style options shown in the "Change style" tray. Keys are stored in game.state.style.
 * coat / scarf values are CSS colours (candycane: a CSS stripe gradient for swatches), hat / hair / outfit values are labels.
 * Wave 1 rewards (Advent doors + daily gifts, gated by ctx.progress.wardrobe): coat plum, navy, gingerbread, forest;
 * hat santa, reindeer, elf; scarf candycane, gold, berry, sky, mint. Character keys (hair, hairColor, skin, outfit) are never gated.
 * Wave 2 rewards (doors 9–16): coat icy, snowy, midnight; hat conductor, bow, gnome; scarf holly, jingle (accents live in the geometry).
 * Wave 3 rewards (doors 17–23): coat cocoa, lantern, elf; hat tophat, parcel; scarf postal, frost. Santa's wish gifts (door 24):
 * coat santa, hat starlight, scarf aurora (each carries a few GLOW beads). Accents live in the geometry here too. */
export const STYLE_OPTIONS = {
  coat: { red: '#b5332e', teal: '#4b8f8b', cream: '#ecdcc0', mustard: '#d59f3c', green: '#6f9463', plum: '#7b3b63', navy: '#34486e', gingerbread: '#a3653a', forest: '#2f5e3e', icy: '#a9cfe0', snowy: '#f3efe6', midnight: '#26305a', cocoa: '#6b4130', lantern: '#d9822b', elf: '#3c8d4a', santa: '#c4262e' },
  hat: { bobble: 'Bobble beanie', earflap: 'Ear-flap hat', earmuffs: 'Earmuffs', none: 'No hat', santa: 'Santa hat', reindeer: 'Reindeer hat', elf: 'Elf hat', conductor: "Conductor's cap", bow: 'Ribbon bow', gnome: 'Gnome hat', tophat: "Caroller's top hat", parcel: 'Present hat', starlight: 'Starlight crown' },
  scarf: { green: '#5d8a58', red: '#b5332e', white: P.snow, striped: 'striped', candycane: 'repeating-linear-gradient(135deg,#b5332e 0 6px,#f5f1ea 6px 12px)', gold: '#e3aa3a', berry: '#9c2f55', sky: '#86b4d8', mint: '#9fd3b4', holly: '#3f7a4a', jingle: '#b5332e', postal: '#c0392b', frost: '#dce8f2', aurora: '#4fb3a6' },
  hair: { none: 'Classic', tousled: 'Tousled', bob: 'Bob', bunches: 'Bunches', long: 'Long' },
  hairColor: { brown: '#7a4a2c', dark: '#3a2820', ginger: '#c2632b', blonde: '#dfb562' },
  skin: { light: P.skin, tan: '#deb08a', brown: '#a8714e', deep: '#6f4a33' },
  outfit: { coat: 'Coat', duffle: 'Duffle coat', dress: 'Knit dress', jumper: 'Jumper' },
};
export const DEFAULT_STYLE = { coat: 'red', hat: 'bobble', scarf: 'green', hair: 'none', hairColor: 'brown', skin: 'light', outfit: 'coat' };

const DOLL_K = 0.9; // design units → world (the doll is modelled ~0.46 tall incl. pom-pom, then shrunk a touch)
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
const boxp = (w, h, d, c, k = KNIT) => part(boxUV(new THREE.BoxGeometry(w, h, d)), c, k);
const torusN = (R, r, c, k, rs, ts, arc = TAU) => part(new THREE.TorusGeometry(R, r, rs, ts, arc), c, k, [(R * arc) / SW, (TAU * r) / SH]);
const halfN = (r, c, k, ws, hs) => part(new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, Math.PI / 2), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);
/** A scarf tail hanging from (x, y, z) with a row of fringe at its free end. rot tilts it; stripe adds a band. */
function scarfTail(out, col, pos, rot, len, stripe) {
  const t = [boxp(0.038, len, 0.016, col)];
  if (stripe) t.push(xf(boxp(0.04, len * 0.22, 0.018, stripe), [0, -len * 0.18, 0]));
  for (let i = -1; i <= 1; i++) t.push(xf(boxp(0.008, 0.022, 0.01, stripe || shade(col, 0.82)), [i * 0.013, -len / 2 - 0.009, 0]));
  for (const p of t) out.push(xf(xf(p, [0, -len / 2, 0]), pos, rot));
}

// ---------------------------------------------------------------- wave 1 wardrobe + character pieces (kept cheap: player ≤ 4.5k tris)
const shell = (r, c, ps, pl, ts, tl, ws, hs, k = KNIT) => part(new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl), c, k, [(pl * r) / SW, (tl * r) / SH]);
const frustum = (rt, rb, h, c, k, seg) => part(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), c, k, [(TAU * Math.max(rt, rb)) / SW, h / SH]);
const coneN = (r, h, c, k, seg) => part(new THREE.ConeGeometry(r, h, seg, 1, true), c, k, [(TAU * r) / SW, Math.hypot(r, h) / SH]);
const _e = new THREE.Euler(), _v = new THREE.Vector3();
/** Place a y-up piece of height h with its base at pos, tilted by rot; returns the world tip of its axis. */
function onBase(out, geo, h, pos, rot) {
  out.push(xf(xf(geo, [0, h / 2, 0]), pos, rot));
  _v.set(0, h, 0).applyEuler(_e.set(rot[0], rot[1], rot[2]));
  return [pos[0] + _v.x, pos[1] + _v.y, pos[2] + _v.z];
}
const FACE = 0.8; // half-width (radians) of the face opening in hair shells (face looks along +z, phi = π/2)

/** Hair styles in yarn. covered = a hat sits on the crown (only the part below the brim is built). */
function addHair(g, style, col, skin, covered, hat) {
  const t0 = covered ? 1.0 : 0; // shells start just above the brim line when a hat covers the crown
  const ears = (r = 0.022) => { for (const sx of [-1, 1]) g.push(xf(sph(r, skin, FELT, 6, 4), [sx * 0.084, 0.257, -0.004], null, [0.55, 1, 0.8])); };
  const showEars = hat !== 'earflap' && hat !== 'earmuffs' && hat !== 'reindeer' && hat !== 'elf' && hat !== 'gnome';
  if (style === 'bob' || style === 'long') {
    const long = style === 'long';
    // back + sides down to the chin (bob) or the shoulders (long), open at the face; fringe across the forehead
    g.push(xf(shell(0.095, col, Math.PI / 2 + FACE, TAU - 2 * FACE, t0, (long ? 2.42 : 2.2) - t0, 12, covered ? 5 : 8), [0, 0.265, -0.004], null, [1.06, 1, 1.05]));
    g.push(xf(shell(0.097, col, Math.PI / 2 - FACE - 0.04, 2 * FACE + 0.08, t0, 1.28 - t0, 5, covered ? 2 : 5), [0, 0.265, -0.004], null, [1.06, 1, 1.05]));
    if (long) {
      // a curtain of hair over the scarf at the back + a strand in front of each shoulder
      g.push(xf(part(new THREE.CylinderGeometry(0.084, 0.094, 0.1, 8, 1, true, Math.PI - 1.15, 2.3), col, KNIT, [3, 1.6]), [0, 0.2, -0.004]));
      for (const sx of [-1, 1]) g.push(xf(boxp(0.022, 0.085, 0.026, col), [sx * 0.078, 0.215, 0.018], [0.15, 0, sx * 0.12]));
    }
  } else if (style === 'tousled') {
    // short boy hair: a cap with chunky tufts on the crown and a fringe swept to one side
    if (!covered) {
      g.push(xf(shell(0.091, col, Math.PI / 2 + FACE, TAU - 2 * FACE, 0, 1.78, 12, 7), [0, 0.268, -0.008]));
      g.push(xf(shell(0.092, col, Math.PI / 2 - FACE - 0.04, 2 * FACE + 0.08, 0, 1.0, 4, 4), [0, 0.268, -0.008]));
      for (const [x, y, z, rx, rz] of [[0.0, 0.358, 0.0, 0.3, 0.2], [0.04, 0.35, -0.03, -0.4, -0.6], [-0.045, 0.348, -0.02, 0.2, 0.7], [0.01, 0.34, -0.06, -0.9, 0.1], [-0.02, 0.352, 0.035, 0.7, 0.4]]) {
        g.push(xf(sph(0.03, col, KNIT, 6, 4), [x, y, z], [rx, 0, rz], [1.1, 0.62, 1.25]));
      }
    } else g.push(xf(shell(0.091, col, Math.PI / 2 + FACE, TAU - 2 * FACE, 0.95, 0.83, 12, 3), [0, 0.268, -0.008]));
    const fy = covered ? 0.296 : 0.318;
    for (const [x, rz, k] of [[-0.036, 0.5, 1], [0.0, 0.25, 1.1], [0.035, -0.1, 0.95]]) g.push(xf(sph(0.024, col, KNIT, 6, 4), [x, fy - Math.abs(x) * 0.25, 0.071 - Math.abs(x) * 0.25], [0.5, 0, rz], [1.35 * k, 0.6, 0.85]));
    for (const sx of [-1, 1]) g.push(xf(sph(0.022, col, KNIT, 6, 4), [sx * 0.08, covered ? 0.29 : 0.3, -0.02], [0, 0, sx * 0.6], [0.7, 1.1, 1]));
    if (showEars) ears();
  } else if (style === 'bunches') {
    if (covered) g.push(xf(sph(0.089, col, KNIT, 12, 8), [0, 0.268, -0.013]));
    else {
      g.push(xf(sph(0.089, col, KNIT, 12, 8), [0, 0.268, -0.013]));
      g.push(xf(halfN(0.091, col, KNIT, 14, 6), [0, 0.268, -0.006], [-0.25, 0, 0]));
    }
    // two pom bunches with red ties (tucked lower and further back under hats so ear-flaps don't swallow them)
    const by = covered ? 0.235 : 0.285, bz = covered ? -0.04 : -0.03, bx = covered ? 0.094 : 0.092;
    for (const sx of [-1, 1]) {
      g.push(xf(sph(0.034, col, KNIT, 8, 6), [sx * (bx + 0.012), by - 0.012, bz]));
      if (!covered) for (const [dy, dz] of [[0.02, -0.012], [-0.006, 0.016]]) g.push(xf(sph(0.02, col, KNIT, 6, 4), [sx * (bx + 0.03), by - 0.012 + dy, bz + dz]));
      g.push(xf(sph(0.011, STYLE_OPTIONS.coat.red, FELT, 5, 3), [sx * (bx - 0.012), by, bz + 0.004]));
    }
  }
}

/** Wave 1 reward hats: santa (red, white fur trim + pom), reindeer (brown beanie, felt antlers + ears), elf (green point, red band, bell). */
function festiveHat(g, hat, skin) {
  if (hat === 'santa') {
    // classic floppy Santa hat: a knitted cone whose top half flops over to one side, white fur brim, pom at the tip
    const red = '#c0302c', fur = '#fbf7f0';
    const top = onBase(g, frustum(0.05, 0.094, 0.12, red, KNIT, 14), 0.12, [0, 0.296, -0.006], [-0.12, 0, 0.16]);
    g.push(xf(sph(0.05, red, KNIT, 10, 6), top));
    const tip = onBase(g, coneN(0.05, 0.12, red, KNIT, 12), 0.12, top, [0.1, 0, 1.95]);
    g.push(xf(torusN(0.092, 0.024, fur, FELT, 8, 18), [0, 0.306, -0.005], [Math.PI / 2 - 0.1, 0, 0]));
    g.push(xf(sph(0.03, fur, FELT, 10, 7), tip));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; g.push(xf(sph(0.017, fur, FELT, 6, 4), [tip[0] + Math.cos(a) * 0.021, tip[1] + (i % 2 ? 0.011 : -0.01), tip[2] + Math.sin(a) * 0.021])); }
  } else if (hat === 'reindeer') {
    const brown = '#8a5a3c', dark = '#6a4330', antler = '#d8b88a';
    g.push(xf(halfN(0.093, brown, KNIT, 14, 7), [0, 0.3, -0.006], [-0.1, 0, 0], [1, 1.05, 1]));
    g.push(xf(torusN(0.09, 0.017, dark, KNIT, 6, 18), [0, 0.305, -0.005], [Math.PI / 2 - 0.1, 0, 0]));
    for (const sx of [-1, 1]) {
      const top = onBase(g, cyl(0.006, 0.0095, 0.08, antler, FELT, 5), 0.08, [sx * 0.042, 0.37, -0.012], [-0.15, 0, -sx * 0.45]);
      onBase(g, cyl(0.005, 0.0065, 0.036, antler, FELT, 5), 0.036, [sx * 0.058, 0.4, -0.016], [0.25, 0, -sx * 1.15]);
      onBase(g, cyl(0.0045, 0.006, 0.03, antler, FELT, 5), 0.03, top.map((v, i) => v - [sx * 0.004, 0.006, 0][i]), [0.1, 0, sx * 0.35]);
      // felt ears sticking out sideways below the antlers
      g.push(xf(sph(0.03, brown, FELT, 8, 5), [sx * 0.098, 0.322, -0.012], [0, 0, -sx * 0.45], [1.15, 0.42, 0.62]));
      g.push(xf(sph(0.019, '#e7a1a3', FELT, 6, 4), [sx * 0.1, 0.323, -0.002], [0, 0, -sx * 0.45], [1.1, 0.32, 0.4]));
    }
  } else if (hat === 'elf') {
    const green = '#3f8a4c', red = '#c0302c';
    g.push(xf(frustum(0.07, 0.094, 0.07, green, KNIT, 14), [0, 0.335, -0.006], [-0.1, 0, 0]));
    const mid = onBase(g, coneN(0.07, 0.13, green, KNIT, 12), 0.13, [0, 0.368, -0.01], [-0.32, 0, 0.12]);
    void mid;
    const tip = [mid[0] - 0.012, mid[1] - 0.004, mid[2] - 0.004];
    g.push(xf(torusN(0.091, 0.017, red, KNIT, 6, 18), [0, 0.306, -0.005], [Math.PI / 2 - 0.1, 0, 0]));
    g.push(xf(sph(0.017, '#e8b640', GLOSS, 8, 6), tip));
    g.push(xf(sph(0.005, '#5c3a26', FELT, 4, 3), [tip[0], tip[1] - 0.012, tip[2] + 0.006]));
    // pointy elf ears
    for (const sx of [-1, 1]) g.push(xf(coneN(0.016, 0.056, skin, FELT, 6), [sx * 0.1, 0.276, -0.006], [0, 0, -sx * 1.05], [0.55, 1, 1]));
  }
}

// ---------------------------------------------------------------- wave 2 wardrobe (doors 9–16; each piece ≤ 400 tris)
const FUR = '#fbf7f0', GOLD = '#e8b640';
const octa = (c, k, s) => xf(part(new THREE.OctahedronGeometry(1), c, k), [0, 0, 0], null, s);
/** A point in a scarf tail's local frame (y runs 0 → −len down the tail) moved to doll space. */
const tailPt = (pos, rot, x, y, z) => { _v.set(x, y, z).applyEuler(_e.set(rot[0], rot[1], rot[2])); return [pos[0] + _v.x, pos[1] + _v.y, pos[2] + _v.z]; };
/** Body cone of each outfit: [radius at y, y of the hem roll, hem radius, y0 + span used for coat decorations]. */
const BODY = {
  coat: { r: (y) => 0.083 - ((y - 0.0655) / 0.125) * 0.031, hemY: 0.068, hemR: 0.081, y0: 0.084, span: 0.082, slope: 0.24 },
  duffle: { r: (y) => 0.089 - ((y - 0.043) / 0.15) * 0.035, hemY: 0.044, hemR: 0.087, y0: 0.066, span: 0.1, slope: 0.23 },
  dress: { r: (y) => 0.094 - ((y - 0.071) / 0.118) * 0.044, hemY: 0.073, hemR: 0.092, y0: 0.09, span: 0.06, slope: 0.36 },
  jumper: { r: (y) => 0.074 - ((y - 0.0855) / 0.105) * 0.018, hemY: 0.088, hemR: 0.072, y0: 0.102, span: 0.02, slope: 0.17 },
};
/** Coat accents: icy = fluffy white hem lumps, snowy = coal felt buttons (non-coat outfits), midnight = gold star beads. */
function coatAccents(g, key, outfit) {
  const B = BODY[outfit];
  if (key === 'icy') {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.45; g.push(xf(sph(0.0175, FUR, FELT, 4, 2), [Math.sin(a) * (B.hemR + 0.004), B.hemY + (i % 2 ? 0.004 : -0.003), Math.cos(a) * (B.hemR + 0.004)])); }
  } else if (key === 'snowy' && outfit !== 'coat') {
    const coal = '#2a2623';
    if (outfit === 'duffle') for (const sx of [-1, 1]) { const a = sx * 0.62, r = B.r(0.075) + 0.008; g.push(xf(sph(0.0085, coal, FELT, 6, 4), [Math.sin(a) * r, 0.077, Math.cos(a) * r])); }
    else for (const y of outfit === 'dress' ? [0.095, 0.117, 0.139] : [0.102, 0.122, 0.142]) g.push(xf(sph(0.009, coal, FELT, 6, 4), [0, y, B.r(y) + (outfit === 'jumper' && y > 0.13 ? 0.007 : 0.002)]));
  } else if (key === 'midnight') {
    // little four-point sparkles sewn flat onto the coat, front and back (clear of the placket and the arms)
    for (const [a, t, k] of [[0.5, 0.2, 1], [-0.45, 0.85, 0.8], [-0.9, 0.1, 0.85], [2.45, 0.25, 1], [-2.4, 0.8, 0.8], [3.2, 0.0, 0.85]]) {
      const y = B.y0 + t * B.span, r = B.r(y) + 0.0025, at = [Math.sin(a) * r, y, Math.cos(a) * r], rot = [-B.slope, a, 0];
      g.push(xf(octa(GOLD, GLOSS, [0.015 * k, 0.005 * k, 0.003]), at, rot));
      g.push(xf(octa(GOLD, GLOSS, [0.005 * k, 0.015 * k, 0.003]), at, rot));
    }
  }
}
/** Scarf accents: holly = berry beads on the fringe + two felt leaves on the knot, jingle = three gold bells down each tail. */
function scarfAccents(g, key, tails) {
  if (key === 'holly') {
    const berry = '#c8322e', leaf = '#1d4427';
    for (const [pos, rot, len] of tails) for (let i = -1; i <= 1; i++) g.push(xf(sph(0.0085, berry, GLOSS, 5, 3), tailPt(pos, rot, i * 0.014, -len - 0.025, 0)));
    for (const sx of [-1, 1]) g.push(xf(octa(leaf, FELT, [0.027, 0.012, 0.005]), [0.046 + sx * 0.021, 0.2, 0.073], [-0.45, sx * 0.3, sx * 0.5]));
    for (const [x, y, z] of [[0.046, 0.199, 0.079], [0.039, 0.207, 0.075], [0.053, 0.207, 0.075]]) g.push(xf(sph(0.0068, berry, GLOSS, 5, 3), [x, y, z]));
  } else if (key === 'jingle') {
    tails.forEach(([pos, rot, len], ti) => {
      const side = ti ? -1 : 1; // the back tail flies out behind: its bells sit on the upper face
      for (const [x, y, z] of [[-0.008, -len * 0.4, 0.012], [0.008, -len * 0.68, 0.012], [0, -len - 0.014, 0.003]]) g.push(xf(sph(0.0108, GOLD, GLOSS, 6, 4), tailPt(pos, rot, x, y, z * side)));
    });
  }
}
/** Wave 2 reward hats: conductor (navy felt cap, gloss visor, gold band + badge), bow (satin ribbon bow on a headband), gnome (tall floppy felt cone). */
function wave2Hat(g, hat, skin, hairStyle) {
  if (hat === 'conductor') {
    const navy = '#2c3d63', lean = (y) => -0.006 - (y - 0.3) * 0.1, tilt = [-0.1, 0, 0];
    g.push(xf(frustum(0.091, 0.0905, 0.036, navy, FELT, 14), [0, 0.316, lean(0.316)], tilt)); // band
    g.push(xf(frustum(0.0935, 0.093, 0.012, GOLD, GLOSS, 14), [0, 0.309, lean(0.309)], tilt));
    g.push(xf(frustum(0.105, 0.091, 0.022, navy, FELT, 14), [0, 0.344, lean(0.344)], tilt)); // the crown flares out a little
    g.push(xf(halfN(0.105, navy, FELT, 12, 3), [0, 0.355, lean(0.355)], tilt, [1, 0.2, 1]));
    g.push(xf(part(new THREE.CylinderGeometry(0.08, 0.08, 0.006, 8, 1, false, -1.15, 2.3), '#1f2433', GLOSS), [0, 0.3085, 0.029], [0.1, 0, 0])); // stiff visor (short, so the eyes stay visible from the follow camera)
    g.push(xf(sph(0.0105, GOLD, GLOSS, 6, 4), [0, 0.326, lean(0.326) + 0.0925]));
    if (!hairStyle) for (const sx of [-1, 1]) g.push(xf(sph(0.022, skin, FELT, 6, 4), [sx * 0.084, 0.257, -0.004], null, [0.55, 1, 0.8]));
  } else if (hat === 'bow') {
    const red = '#c4362f', dark = '#a32a25';
    const R = hairStyle === 'bob' || hairStyle === 'long' ? 0.106 : 0.097, a = 0.58;
    g.push(xf(torusN(R, 0.006, dark, FELT, 4, 10, Math.PI), [0, 0.268, -0.004]));
    const at = [Math.sin(a) * (R + 0.02), 0.268 + Math.cos(a) * (R + 0.02), 0.004], rot = [0.05, 0.25, -a + 0.1];
    const b = [];
    for (const sx of [-1, 1]) {
      b.push(xf(sph(0.034, red, GLOSS, 8, 5), [sx * 0.036, 0.008, 0], [0, 0, sx * 0.3], [1.1, 0.72, 0.42])); // loop
      b.push(xf(boxp(0.021, 0.046, 0.007, red, GLOSS), [sx * 0.021, -0.03, 0.004], [0, 0, sx * 0.55])); // tail
    }
    b.push(xf(sph(0.015, dark, GLOSS, 6, 4), [0, 0.002, 0.005], null, [0.9, 1.15, 1]));
    for (const p of b) g.push(xf(p, at, rot));
  } else if (hat === 'gnome') {
    const red = '#b5332e';
    g.push(xf(torusN(0.096, 0.009, shade(red, 0.84), FELT, 4, 12), [0, 0.288, -0.006], [Math.PI / 2 - 0.06, 0, 0]));
    let p = onBase(g, frustum(0.064, 0.097, 0.09, red, FELT, 14), 0.09, [0, 0.284, -0.006], [-0.06, 0, 0.04]);
    g.push(xf(sph(0.064, red, FELT, 8, 4), p));
    p = onBase(g, frustum(0.036, 0.064, 0.075, red, FELT, 12), 0.075, p, [-0.2, 0, -0.3]);
    g.push(xf(sph(0.036, red, FELT, 8, 4), p));
    p = onBase(g, frustum(0.016, 0.036, 0.066, red, FELT, 10), 0.066, p, [0.05, 0, -1.0]);
    g.push(xf(sph(0.016, red, FELT, 6, 4), p));
    p = onBase(g, coneN(0.016, 0.05, red, FELT, 8), 0.05, p, [0.2, 0, -2.0]);
    g.push(xf(sph(0.008, red, FELT, 5, 3), p));
  }
}

// ---------------------------------------------------------------- wave 3 wardrobe (doors 17–23 + Santa's three wish gifts; each piece ≤ 400 tris)
const WHIP = '#fff3df', ELF_RED = '#c0302c', TOGGLE_DARK = '#3a2a22', BELT_BLACK = '#26221f', SANTA_GLOVE = '#2a2623';
const ENVELOPE = '#f3e7cf', AURORA_VIOLET = '#8e6bd6', AURORA_PINK = '#f08fc0', STARLIGHT = '#ffd27a';
/** One flat felt triangle (single-sided, counter-clockwise seen from its front). */
function tri3(a, b, c, col, k = FELT) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
  geo.computeVertexNormals();
  return part(geo, col, k);
}
/** Where a belt sits on each outfit (clear of buttons, toggles and bands). */
const BELT_Y = { coat: 0.113, duffle: 0.1075, dress: 0.119, jumper: 0.111 };
/** A felt belt round the body with an optional gold buckle at the front. */
function belt(g, outfit, col, buckle) {
  const B = BODY[outfit], y = BELT_Y[outfit], h = 0.015;
  g.push(xf(frustum(B.r(y + h / 2) + 0.0035, B.r(y - h / 2) + 0.0035, h, col, FELT, 14), [0, y, 0]));
  if (buckle) {
    const z = B.r(y) + 0.006;
    g.push(xf(boxp(0.03, 0.024, 0.005, GOLD, GLOSS), [0, y, z], [-B.slope, 0, 0]));
    g.push(xf(boxp(0.016, 0.011, 0.007, col, FELT), [0, y, z], [-B.slope, 0, 0]));
  }
}
/** Coat accents: cocoa = whipped-cream collar + marshmallow buttons, lantern = dark toggles + belt with a glowing lantern charm,
 *  elf = red hem with a white felt zigzag + buckled belt, santa = fluffy white trim, buckled belt, fairy lights in the hem fur. */
function wave3CoatAccents(g, key, outfit) {
  const B = BODY[outfit];
  const frontZ = (y) => (outfit === 'coat' ? 0.0795 - (y - 0.098) * 0.24 : B.r(y) + 0.0045);
  if (key === 'cocoa') {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.2; g.push(xf(sph(0.0205, WHIP, FELT, 5, 3), [Math.sin(a) * 0.073, 0.168 + (i % 2 ? 0.003 : -0.002), Math.cos(a) * 0.073], null, [1, 0.8, 1])); }
    const ys = outfit === 'coat' ? [0.098, 0.128, 0.158] : outfit === 'duffle' ? [0.09, 0.125, 0.16] : outfit === 'dress' ? [0.095, 0.117, 0.139] : [0.102, 0.122, 0.142];
    ys.forEach((y, i) => g.push(xf(cyl(0.0108, 0.0108, 0.011, i === 1 ? '#fffaf2' : '#f6b4c3', FELT, 6), [0, y, frontZ(y) + 0.001], [Math.PI / 2 - B.slope, 0, 0])));
  } else if (key === 'lantern') {
    const ys = outfit === 'coat' ? [0.098, 0.128, 0.158] : outfit === 'dress' ? [0.096, 0.141] : outfit === 'jumper' ? [0.142, 0.167] : []; // the duffle recolours its own toggles
    for (const y of ys) g.push(xf(cyl(0.0055, 0.0055, 0.03, TOGGLE_DARK, GLOSS, 6), [0.002, y, frontZ(y) + 0.002], [0, 0, Math.PI / 2]));
    belt(g, outfit, TOGGLE_DARK, false);
    // the charm hangs from the belt at the front, between the placket and the doll's right arm (clear of the scarf tail)
    const a = -0.4, y = BELT_Y[outfit], r = B.r(y - 0.02) + 0.0125, x = Math.sin(a) * r, z = Math.cos(a) * r;
    g.push(xf(boxp(0.019, 0.0055, 0.019, TOGGLE_DARK, FELT), [x, y - 0.0095, z], [0, a, 0]));
    g.push(xf(boxp(0.0155, 0.021, 0.0155, STARLIGHT, GLOW), [x, y - 0.0225, z], [0, a, 0]));
    g.push(xf(boxp(0.019, 0.0045, 0.019, TOGGLE_DARK, FELT), [x, y - 0.035, z], [0, a, 0]));
  } else if (key === 'elf') {
    const n = 16, y0 = B.hemY + 0.009, y1 = y0 + 0.027, da = TAU / n / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + da, r0 = B.r(y0) + 0.004, r1 = B.r(y1) + 0.004;
      g.push(tri3([Math.sin(a - da) * r0, y0, Math.cos(a - da) * r0], [Math.sin(a + da) * r0, y0, Math.cos(a + da) * r0], [Math.sin(a) * r1, y1, Math.cos(a) * r1], FUR));
    }
    belt(g, outfit, BELT_BLACK, true);
  } else if (key === 'santa') {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.45; g.push(xf(sph(0.0185, FUR, FELT, 4, 2), [Math.sin(a) * (B.hemR + 0.003), B.hemY + (i % 2 ? 0.004 : -0.002), Math.cos(a) * (B.hemR + 0.003)], [0, a + Math.PI / 4, 0], [1.3, 0.82, 1.05])); } // soft tufts: a flat side faces out
    if (outfit !== 'coat') { // fur placket down the front (the classic coat recolours its own)
      const [ya, yb] = outfit === 'duffle' ? [0.052, 0.184] : outfit === 'dress' ? [0.08, 0.15] : [0.096, 0.19], ym = (ya + yb) / 2;
      g.push(xf(boxp(0.023, yb - ya, 0.008, FUR, FELT), [0, ym, B.r(ym) + 0.002], [-B.slope, 0, 0]));
    }
    belt(g, outfit, BELT_BLACK, true);
    // four tiny warm lights nestled in the hem fur: Santa's gift twinkles
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.9; g.push(xf(octa(STARLIGHT, GLOW, 0.0075), [Math.sin(a) * (B.hemR + 0.019), B.hemY + 0.006, Math.cos(a) * (B.hemR + 0.019)])); }
  }
}
/** Put parts modelled in a scarf tail's frame (x across, y 0 → −len down the tail, +z = its outer face) at local (x, y, z) with a local spin. */
function onTail(g, parts, [pos, rot], at, lrot = null) { for (const p of parts) g.push(xf(xf(p, at, lrot), pos, rot)); }
/** Scarf accents: postal = a cream envelope charm with a red heart seal (+ cream airmail band), frost = three white snowflake
 *  charms on ice-blue patches, aurora = pink bands and glowing beads in the fringe (its violet bands come from scarfTail). */
function wave3ScarfAccents(g, key, tails) {
  if (key === 'postal') {
    const len = tails[0][2], red = '#d2342c';
    onTail(g, [
      boxp(0.052, 0.036, 0.005, ENVELOPE, FELT),
      tri3([-0.026, 0.018, 0.0032], [0, -0.003, 0.0032], [0.026, 0.018, 0.0032], shade(ENVELOPE, 0.86)), // the flap
      xf(sph(0.0062, red, GLOSS, 5, 3), [-0.0045, 0.0005, 0.0045], null, [1, 1, 0.6]),
      xf(sph(0.0062, red, GLOSS, 5, 3), [0.0045, 0.0005, 0.0045], null, [1, 1, 0.6]),
      xf(octa(red, GLOSS, [0.0098, 0.0098, 0.0036]), [0, -0.0035, 0.0045]),
    ], tails[0], [0.003, -len * 0.5, 0.0115], [0, 0, -0.16]);
  } else if (key === 'frost') {
    const ice = '#9cc4e0', white = '#ffffff';
    const flake = (tail, y, side, k = 1) => {
      const p = [boxp(0.04, 0.034 * k, 0.018, ice)];
      for (let i = 0; i < 3; i++) p.push(xf(boxp(0.029 * k, 0.0048, 0.004, white, FELT), [0, 0, side * 0.0105], [0, 0, (i / 3) * Math.PI + 0.26]));
      p.push(xf(octa(white, FELT, 0.0062), [0, 0, side * 0.012]));
      onTail(g, p, tail, [0, y, 0]);
    };
    flake(tails[0], -tails[0][2] * 0.3, 1, 0.92);
    flake(tails[0], -tails[0][2] * 0.76, 1);
    flake(tails[1], -tails[1][2] * 0.7, -1); // the back tail flies out behind: its flake sits on the upper face
  } else if (key === 'aurora') {
    for (const tail of tails) {
      const len = tail[2];
      onTail(g, [boxp(0.04, len * 0.15, 0.018, AURORA_PINK)], tail, [0, -len * 0.4, 0]);
      for (let i = -1; i <= 1; i++) onTail(g, [octa('#c9fff0', GLOW, 0.0082)], tail, [i * 0.0135, -len - 0.026, 0]);
    }
  }
}
/** Wave 3 hats: tophat (black felt, red band, holly sprig), parcel (red gift box, gold ribbon + bow), starlight (gold headband, glowing star). */
function wave3Hat(g, hat, skin, hairStyle) {
  const place = (parts, pos, rot) => { for (const p of parts) g.push(xf(p, pos, rot)); };
  const ears = () => { if (!hairStyle) for (const sx of [-1, 1]) g.push(xf(sph(0.022, skin, FELT, 6, 4), [sx * 0.084, 0.257, -0.004], null, [0.55, 1, 0.8])); };
  if (hat === 'tophat') {
    const black = '#2b2523', leaf = '#3f8f4f', berry = '#d8342c', a = 0.62;
    const h = [
      xf(cyl(0.112, 0.112, 0.009, black, FELT, 14), [0, 0.0045, 0]), // brim
      xf(cyl(0.079, 0.072, 0.1, black, FELT, 14), [0, 0.059, 0]), // crown, flaring a little towards the top
      xf(frustum(0.0762, 0.0752, 0.024, '#c4362f', FELT, 14), [0, 0.022, 0]), // band
    ];
    const hx = Math.sin(a) * 0.079, hz = Math.cos(a) * 0.079;
    for (const sx of [-1, 1]) h.push(xf(octa(leaf, FELT, [0.027, 0.0125, 0.004]), [hx + sx * 0.017 * Math.cos(a), 0.027, hz - sx * 0.017 * Math.sin(a)], [0, a, sx * 0.55]));
    for (const [dx, dy] of [[0, -0.003], [-0.007, 0.007], [0.007, 0.007]]) h.push(xf(sph(0.0072, berry, GLOSS, 5, 3), [hx + dx * Math.cos(a) + Math.sin(a) * 0.004, 0.022 + dy, hz - dx * Math.sin(a) + Math.cos(a) * 0.004]));
    place(h, [0.004, 0.322, -0.008], [-0.1, 0, -0.13]);
    ears();
  } else if (hat === 'parcel') {
    const red = '#c4362f', sat = shade(GOLD, 0.84);
    const h = [
      xf(part(boxUV(new RoundedBoxGeometry(0.118, 0.082, 0.118, 1, 0.012)), red, FELT), [0, 0.041, 0]),
      xf(boxp(0.129, 0.02, 0.129, shade(red, 0.88), FELT), [0, 0.083, 0]), // lid
      xf(boxp(0.022, 0.097, 0.132, GOLD, GLOSS), [0, 0.0475, 0]), // ribbon cross, over the lid and down the sides
      xf(boxp(0.132, 0.097, 0.022, GOLD, GLOSS), [0, 0.0475, 0]),
      xf(sph(0.011, sat, GLOSS, 5, 3), [0, 0.1, 0]), // knot
    ];
    for (const sx of [-1, 1]) {
      h.push(xf(sph(0.025, GOLD, GLOSS, 6, 3), [sx * 0.026, 0.106, 0], [0, 0, sx * 0.4], [1.2, 0.72, 0.55])); // loop
      h.push(xf(boxp(0.013, 0.004, 0.04, sat, GLOSS), [sx * 0.012, 0.097, 0.026], [0.12, sx * 0.5, 0])); // tail
    }
    place(h, [-0.006, 0.325, -0.01], [-0.08, 0.38, 0.19]);
    ears();
  } else if (hat === 'starlight') {
    const gold = '#e3aa3a', R = hairStyle === 'bob' || hairStyle === 'long' ? 0.106 : 0.097, tip = 0.42; // the band tips forward like a tiara
    const on = (parts, phi, lift, lrot) => { // phi = angle along the band from its top (+ = the doll's left), lift = distance off the band
      const pos = [Math.sin(phi) * (R + lift), Math.cos(phi) * (R + lift), 0];
      for (const p of parts) g.push(xf(xf(xf(p, [0, 0, 0], lrot), pos), [0, 0.268, -0.004], [tip, 0, 0]));
    };
    g.push(xf(torusN(R, 0.0075, gold, FELT, 5, 12, Math.PI), [0, 0.268, -0.004], [tip, 0, 0]));
    const star = (r, ri, d, c, k) => { const e = part(boxUV(new THREE.ExtrudeGeometry(poly(starPts(r, ri)), { depth: d, bevelEnabled: false })), c, k); return xf(e, [0, 0, -d / 2]); };
    on([star(0.025, 0.011, 0.012, STARLIGHT, GLOW), xf(star(0.041, 0.019, 0.008, gold, GLOSS), [0, 0, -0.003])], 0, 0.03, [-tip - 0.12, 0, 0]); // a small glowing heart in a gold felt star: a soft halo, not a lamp
    for (const sx of [-1, 1]) on([sph(0.0082, '#fff1c4', GLOW, 6, 4)], sx * 0.78, 0.004, null);
  }
}

/** Outfit bodies other than the classic coat: duffle (long, toggles, hood, pockets), dress (A-line, cream bands), jumper (turtleneck, chest band). */
function outfitBody(g, outfit, coat, trimCol, isCream, toggle = '#ead8b0') { // toggle: horn toggle colour, null = none (wave 3 coats bring their own front)
  if (outfit === 'duffle') {
    const rAt = (y) => 0.089 - ((y - 0.043) / 0.15) * 0.035;
    g.push(xf(cyl(0.054, 0.089, 0.15, coat, KNIT, 14), [0, 0.118, 0]));
    g.push(xf(sph(0.056, coat, KNIT, 12, 6), [0, 0.186, 0], null, [1, 0.5, 1]));
    g.push(xf(torusN(0.087, 0.013, trimCol || shade(coat, 0.86), KNIT, 6, 16), [0, 0.044, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(halfN(0.064, shade(coat, 0.93), KNIT, 10, 5), [0, 0.198, -0.06], [-1.95, 0, 0], [1, 0.8, 0.85])); // hood resting on the back
    if (toggle) for (const y of [0.09, 0.125, 0.16]) {
      const z = rAt(y) + 0.004;
      g.push(xf(boxp(0.034, 0.004, 0.004, '#5c3a26'), [0, y, z - 0.002])); // rope loop
      g.push(xf(cyl(0.0055, 0.0055, 0.028, toggle, GLOSS, 6), [0.004, y, z + 0.002], [0, 0, Math.PI / 2])); // horn toggle
    }
    for (const sx of [-1, 1]) { const a = sx * 0.62, r = rAt(0.075) + 0.003; g.push(xf(boxp(0.036, 0.03, 0.006, shade(coat, 0.9)), [Math.sin(a) * r, 0.075, Math.cos(a) * r], [-0.2, a, 0])); }
  } else if (outfit === 'dress') {
    const band = trimCol || (isCream ? STYLE_OPTIONS.coat.red : '#f3e7d0');
    g.push(xf(cyl(0.05, 0.094, 0.118, coat, KNIT, 16), [0, 0.13, 0]));
    g.push(xf(sph(0.052, coat, KNIT, 12, 6), [0, 0.186, 0], null, [1, 0.5, 1]));
    g.push(xf(torusN(0.092, 0.012, band, KNIT, 6, 18), [0, 0.073, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(frustum(0.0635, 0.0665, 0.014, band, KNIT, 14), [0, 0.158, 0]));
  } else {
    const band = trimCol || (isCream ? STYLE_OPTIONS.coat.red : '#efe1c6');
    g.push(xf(cyl(0.056, 0.074, 0.105, coat, KNIT, 14), [0, 0.138, 0]));
    g.push(xf(sph(0.056, coat, KNIT, 12, 6), [0, 0.186, 0], null, [1, 0.5, 1]));
    g.push(xf(torusN(0.072, 0.014, trimCol || shade(coat, 0.8), KNIT, 6, 16), [0, 0.088, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(frustum(0.0655, 0.069, 0.032, band, KNIT, 14), [0, 0.142, 0]));
    g.push(xf(cyl(0.05, 0.056, 0.03, shade(coat, 0.9), KNIT, 10), [0, 0.206, -0.01])); // turtleneck roll
  }
}

/** Legs for the dress (striped tights) and the jumper (rolled trousers), both with sneakers. */
function sneakerLeg(outfit, accent) {
  const p = [];
  if (outfit === 'dress') {
    for (let i = 0; i < 3; i++) p.push(xf(frustum(0.021, 0.021, 0.0175, i % 2 ? P.snow : accent, KNIT, 8), [0, -0.0035 - i * 0.0175, 0]));
  } else {
    const tr = '#b98a52';
    p.push(xf(cyl(0.025, 0.025, 0.046, tr, KNIT, 8), [0, -0.018, 0]));
    p.push(xf(cyl(0.029, 0.029, 0.012, shade(tr, 0.86), KNIT, 8), [0, -0.04, 0.002]));
  }
  p.push(xf(sph(0.029, '#3b3f4c', FELT, 8, 6), [0, -0.05, 0.012], null, [1, 0.72, 1.4]));
  p.push(xf(cyl(0.03, 0.031, 0.012, P.snow, FELT, 8), [0, -0.069, 0.013], null, [1, 1, 1.42]));
  p.push(xf(boxp(0.02, 0.006, 0.018, P.snow), [0, -0.031, 0.026], [-0.5, 0, 0]));
  return p;
}

/**
 * Build a chibi knitted doll (~0.42 tall with pom-pom, faces +z, feet at y = 0): big round felt head, bead eyes,
 * rosy cheeks, ribbed beanie with a fluffy pom-pom, chunky scarf with fringe tails, mittens, chunky boots.
 * Returns { group, yaw, body, legs[2], arms[2], hands: Object3D (carry anchor), animate(dt, speed) }.
 * Also used by the entry-screen preview and for quest-giver NPCs (pass any style).
 */
export function buildCharacter(mat, style = DEFAULT_STYLE, opts = {}) {
  const s = { ...DEFAULT_STYLE, ...style };
  const coat = STYLE_OPTIONS.coat[s.coat] || s.coat || P.red;
  const scarfKey = s.scarf;
  const striped = scarfKey === 'striped';
  const candy = scarfKey === 'candycane';
  const scarf = striped || candy ? STYLE_OPTIONS.scarf.red : STYLE_OPTIONS.scarf[scarfKey] || scarfKey || P.green;
  const snowy = s.coat === 'snowy', icy = s.coat === 'icy', midnight = s.coat === 'midnight';
  const cocoa = s.coat === 'cocoa', lantern = s.coat === 'lantern', elf = s.coat === 'elf', santa = s.coat === 'santa'; // wave 3
  const aurora = scarfKey === 'aurora';
  const isCream = s.coat === 'cream' || snowy; // snowy: red hat, brown mitts like cream, but coal buttons
  const ging = s.coat === 'gingerbread';
  const hatCol = isCream ? STYLE_OPTIONS.coat.red : '#f0e4cc';
  const trim = striped ? P.snow : scarf; // hat brim / pom accents echo the scarf
  const brimCol = scarfKey === 'white' && !isCream ? coat : new THREE.Color(trim).equals(new THREE.Color(hatCol)) ? STYLE_OPTIONS.coat.mustard : trim;
  const mitt = isCream ? '#8a5a3c' : '#f0e4cc';
  const button = snowy ? '#2a2623' : midnight || elf ? GOLD : isCream || s.coat === 'mustard' ? '#7a4f33' : '#f6e7c4';
  const skin = opts.skin || STYLE_OPTIONS.skin[s.skin] || P.skin;
  const hair = opts.hair || STYLE_OPTIONS.hairColor[s.hairColor] || '#7a4a2c';
  const cheek = !opts.skin && s.skin === 'deep' ? '#b4574f' : !opts.skin && s.skin === 'brown' ? '#c96d64' : '#e9938f';
  const outfit = s.outfit in STYLE_OPTIONS.outfit ? s.outfit : 'coat';
  const hairStyle = s.hair in STYLE_OPTIONS.hair && s.hair !== 'none' ? s.hair : null;
  const icing = '#fbf6ee'; // gingerbread coat: white icing trim

  const group = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  yaw.scale.setScalar(DOLL_K);
  group.add(yaw);
  yaw.add(body);
  const g = [];
  if (outfit === 'coat') {
    // --- coat: flared knit body, rounded shoulders, rolled hem, button placket
    g.push(xf(cyl(0.052, 0.083, 0.125, coat, KNIT, 14), [0, 0.128, 0]));
    g.push(xf(sph(0.054, coat, KNIT, 12, 6), [0, 0.186, 0], null, [1, 0.5, 1]));
    g.push(xf(torusN(0.081, icy || santa ? 0.016 : 0.013, ging ? icing : icy || santa ? FUR : elf ? ELF_RED : shade(coat, 0.86), icy || santa ? FELT : KNIT, 6, 16), [0, 0.068, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(santa ? boxp(0.023, 0.112, 0.008, FUR, FELT) : boxp(0.016, 0.112, 0.006, ging ? icing : shade(coat, 0.84)), [0, 0.128, 0.0685], [-0.24, 0, 0]));
    const gum = ['#c8322e', '#3f8f4f', '#c8322e'];
    if (!cocoa && !lantern && !santa) [0.098, 0.128, 0.158].forEach((y, i) => g.push(xf(sph(0.0095, ging ? gum[i] : button, snowy ? FELT : GLOSS, 6, 4), [0, y, 0.0795 - (y - 0.098) * 0.24])));
  } else outfitBody(g, outfit, coat, ging ? icing : icy || santa ? FUR : elf ? ELF_RED : null, isCream, cocoa || santa ? null : lantern ? TOGGLE_DARK : undefined);
  if (icy || snowy || midnight) coatAccents(g, s.coat, outfit);
  if (cocoa || lantern || elf || santa) wave3CoatAccents(g, s.coat, outfit);
  // --- scarf: chunky ring, a knot, one tail in front and one flying out behind (reads from the follow camera)
  if (aurora) for (let i = 0; i < 16; i++) g.push(xf(xf(torusN(0.058, 0.024, i % 8 === 3 ? AURORA_VIOLET : i % 8 === 7 ? AURORA_PINK : scarf, KNIT, 8, 1, TAU / 16 + 0.01), [0, 0, 0], [0, 0, (i / 16) * TAU]), [0, 0.193, 0], [Math.PI / 2, 0, 0])); // same triangle count as the plain ring
  else if (candy) for (let i = 0; i < 8; i++) g.push(xf(xf(torusN(0.058, 0.024, i % 2 ? P.snow : scarf, KNIT, 8, 2, TAU / 8 + 0.01), [0, 0, 0], [0, 0, (i / 8) * TAU]), [0, 0.193, 0], [Math.PI / 2, 0, 0]));
  else g.push(xf(torusN(0.058, 0.024, scarf, KNIT, 8, 16), [0, 0.193, 0], [Math.PI / 2, 0, 0]));
  if (striped) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; g.push(xf(sph(0.0255, P.snow, KNIT, 6, 4), [Math.cos(a) * 0.058, 0.193, Math.sin(a) * 0.058])); }
  g.push(xf(sph(0.024, scarf, KNIT, 8, 6), [0.046, 0.186, 0.052]));
  const tailStripe = striped || candy ? P.snow : aurora ? AURORA_VIOLET : scarfKey === 'postal' ? ENVELOPE : null;
  scarfTail(g, scarf, [0.045, 0.186, 0.066], [-0.22, 0, 0.14], 0.085, tailStripe);
  scarfTail(g, scarf, [-0.03, 0.2, -0.062], [1.05, 0, -0.25], 0.105, tailStripe);
  if (scarfKey === 'postal' || scarfKey === 'frost' || aurora) wave3ScarfAccents(g, scarfKey, [[[0.045, 0.186, 0.066], [-0.22, 0, 0.14], 0.085], [[-0.03, 0.2, -0.062], [1.05, 0, -0.25], 0.105]]);
  if (scarfKey === 'holly' || scarfKey === 'jingle') scarfAccents(g, scarfKey, [[[0.045, 0.186, 0.066], [-0.22, 0, 0.14], 0.085], [[-0.03, 0.2, -0.062], [1.05, 0, -0.25], 0.105]]);
  // --- head: big felt ball, bead eyes, rosy cheeks, a little smile
  g.push(xf(sph(0.085, skin, FELT, 18, 12), [0, 0.265, 0]));
  for (const sx of [-1, 1]) {
    g.push(xf(sph(0.0095, P.ink, GLOSS, 8, 6), [sx * 0.03, 0.268, 0.0795]));
    g.push(xf(sph(0.016, cheek, FELT, 8, 6), [sx * 0.052, 0.246, 0.0625], [0, sx * 0.65, 0], [1, 0.7, 0.35]));
  }
  g.push(xf(torusN(0.015, 0.0028, P.ink, FELT, 4, 8, 2.1), [0, 0.256, 0.084], [0, 0, -Math.PI / 2 - 1.05]));
  // hats that cover the crown: hair styles only show below the brim
  const hairCap = () => {
    if (hairStyle) addHair(g, hairStyle, hair, skin, true, s.hat);
    else g.push(xf(sph(0.089, hair, KNIT, 12, 8), [0, 0.268, -0.013]));
  };
  const pom = (r, c, p) => {
    g.push(xf(sph(r, c, FELT, 12, 8), p));
    for (let i = 0; i < 6; i++) { // lumps make the pom-pom fluffy against the sky
      const a = (i / 6) * TAU, e = i % 2 ? 0.5 : -0.35;
      g.push(xf(sph(r * 0.52, c, FELT, 6, 4), [p[0] + Math.cos(a) * Math.cos(e) * r * 0.68, p[1] + Math.sin(e) * r * 0.68, p[2] + Math.sin(a) * Math.cos(e) * r * 0.68]));
    }
  };
  if (s.hat === 'bobble') {
    hairCap();
    g.push(xf(halfN(0.093, hatCol, KNIT, 14, 7), [0, 0.3, -0.006], [-0.1, 0, 0], [1, 1.1, 1]));
    g.push(xf(torusN(0.09, 0.019, brimCol, KNIT, 8, 18), [0, 0.306, -0.005], [Math.PI / 2 - 0.1, 0, 0]));
    pom(0.046, brimCol, [0, 0.436, -0.02]);
  } else if (s.hat === 'earflap') {
    hairCap();
    const hc = '#8a5a3c';
    g.push(xf(halfN(0.093, hc, KNIT, 14, 7), [0, 0.3, -0.006], [-0.1, 0, 0], [1, 1.05, 1]));
    g.push(xf(torusN(0.09, 0.017, '#f0e4cc', FELT, 6, 18), [0, 0.305, -0.005], [Math.PI / 2 - 0.1, 0, 0]));
    for (const sx of [-1, 1]) {
      g.push(xf(sph(0.042, hc, KNIT, 10, 6), [sx * 0.085, 0.258, -0.004], null, [0.42, 1.3, 0.95]));
      g.push(xf(cyl(0.006, 0.006, 0.06, '#f0e4cc', KNIT, 5), [sx * 0.089, 0.172, -0.004]));
      g.push(xf(sph(0.016, '#f0e4cc', FELT, 6, 4), [sx * 0.089, 0.138, -0.004]));
    }
    pom(0.032, '#f0e4cc', [0, 0.412, -0.018]);
  } else if (s.hat === 'earmuffs') {
    if (hairStyle) addHair(g, hairStyle, hair, skin, false, s.hat);
    else {
      hairCap();
      g.push(xf(halfN(0.091, hair, KNIT, 14, 6), [0, 0.268, -0.006], [-0.25, 0, 0]));
      g.push(xf(sph(0.03, hair, KNIT, 8, 6), [0, 0.352, -0.03])); // top-knot
    }
    g.push(xf(torusN(0.092, 0.008, P.ink, FELT, 5, 14, Math.PI), [0, 0.268, 0], [0, 0, 0]));
    const mc = s.coat === 'red' ? P.snow : '#e7a1a3';
    for (const sx of [-1, 1]) {
      g.push(xf(sph(0.04, mc, FELT, 10, 8), [sx * 0.088, 0.266, 0], null, [0.6, 1, 1]));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.push(xf(sph(0.018, mc, FELT, 6, 4), [sx * 0.094, 0.266 + Math.sin(a) * 0.03, Math.cos(a) * 0.03])); }
    }
  } else if (s.hat === 'santa' || s.hat === 'reindeer' || s.hat === 'elf') {
    hairCap();
    festiveHat(g, s.hat, skin);
  } else if (s.hat === 'conductor' || s.hat === 'gnome') {
    hairCap();
    wave2Hat(g, s.hat, skin, hairStyle);
  } else if (s.hat === 'tophat' || s.hat === 'parcel') {
    hairCap();
    wave3Hat(g, s.hat, skin, hairStyle);
  } else if (s.hat === 'starlight') {
    // a headband crown: hair stays uncovered (the classic look keeps its bunches)
    if (hairStyle) addHair(g, hairStyle, hair, skin, false, s.hat);
    else {
      hairCap();
      g.push(xf(halfN(0.091, hair, KNIT, 14, 6), [0, 0.268, -0.006], [-0.25, 0, 0]));
      for (const sx of [-1, 1]) {
        g.push(xf(sph(0.036, hair, KNIT, 8, 6), [sx * 0.082, 0.318, -0.03]));
        g.push(xf(sph(0.012, STYLE_OPTIONS.coat.red, FELT, 6, 4), [sx * 0.062, 0.31, -0.022]));
      }
    }
    wave3Hat(g, s.hat, skin, hairStyle);
  } else if (s.hat === 'bow') {
    // the bow sits on a headband: hair stays uncovered (classic hair loses its bunches so the bow has room)
    if (hairStyle) addHair(g, hairStyle, hair, skin, false, s.hat);
    else { hairCap(); g.push(xf(halfN(0.091, hair, KNIT, 14, 6), [0, 0.268, -0.006], [-0.25, 0, 0])); }
    wave2Hat(g, s.hat, skin, hairStyle);
  } else if (hairStyle) {
    addHair(g, hairStyle, hair, skin, false, s.hat);
  } else {
    hairCap();
    g.push(xf(halfN(0.091, hair, KNIT, 14, 6), [0, 0.268, -0.006], [-0.25, 0, 0]));
    for (const sx of [-1, 1]) { // bunches
      g.push(xf(sph(0.036, hair, KNIT, 8, 6), [sx * 0.082, 0.318, -0.03]));
      g.push(xf(sph(0.012, STYLE_OPTIONS.coat.red, FELT, 6, 4), [sx * 0.062, 0.31, -0.022]));
    }
  }
  const bodyMesh = new THREE.Mesh(merge(g), mat);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  body.add(bodyMesh);

  // sleeves + mittens (duffle: colourful mittens; jumper: ribbed cuffs; gingerbread: icing cuffs)
  const cuffCol = ging ? icing : icy || santa ? FUR : cocoa ? WHIP : elf ? ELF_RED : outfit === 'jumper' ? shade(coat, 0.8) : outfit === 'duffle' ? '#e0782c' : shade(mitt, 0.9);
  const mittCol = santa ? SANTA_GLOVE : outfit === 'duffle' ? '#3d6db0' : mitt;
  const thumbCol = santa ? SANTA_GLOVE : outfit === 'duffle' ? '#e0782c' : mitt;
  const armGeo = merge([
    xf(sph(0.022, coat, KNIT, 8, 4), [0, 0, 0]),
    xf(cyl(0.02, 0.025, 0.072, coat, KNIT, 8), [0, -0.036, 0]),
    xf(cyl(0.028, 0.028, 0.016, cuffCol, KNIT, 8), [0, -0.072, 0]),
    xf(sph(0.028, mittCol, KNIT, 10, 7), [0, -0.094, 0], null, [1, 1.12, 1]),
    xf(sph(0.012, thumbCol, KNIT, 6, 4), [0, -0.088, 0.024]),
    ...(icy || santa ? [0, 1, 2].map((i) => xf(sph(0.0145, FUR, FELT, 4, 2), [Math.sin(i * 2.094 + 0.5) * 0.026, -0.072 + (i % 2 ? 0.003 : -0.003), Math.cos(i * 2.094 + 0.5) * 0.026])) : []), // fluffy cuff (low-poly lumps keep the doll ≤ 4.5k)
  ]);
  const arms = [-1, 1].map((sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.076, 0.178, 0);
    piv.rotation.z = sx * 0.25;
    const m = new THREE.Mesh(armGeo, mat);
    m.castShadow = true;
    piv.add(m);
    body.add(piv);
    return piv;
  });
  const legGeo = outfit === 'dress' || outfit === 'jumper' ? merge(sneakerLeg(outfit, striped || candy ? STYLE_OPTIONS.scarf.red : scarfKey === 'white' ? coat : scarf)) : merge([
    xf(cyl(0.023, 0.023, 0.05, '#4b5568', KNIT, 8), [0, -0.022, 0]),
    xf(cyl(0.03, 0.03, 0.014, '#f0e4cc', FELT, 8), [0, -0.036, 0.003]),
    xf(sph(0.031, '#6e4630', FELT, 10, 7), [0, -0.05, 0.012], null, [1, 0.8, 1.38]),
  ]);
  const legs = [-1, 1].map((sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.034, 0.075, 0);
    const m = new THREE.Mesh(legGeo, mat);
    m.castShadow = true;
    piv.add(m);
    body.add(piv);
    return piv;
  });
  const hands = new THREE.Object3D(); // carry anchor: held up above the pom-pom so it shows from behind in the follow view
  hands.position.set(0, 0.55, 0.0);
  hands.scale.setScalar(1 / DOLL_K);
  body.add(hands);

  let phase = 0, idle = 0;
  return {
    group, yaw, body, legs, arms, hands,
    animate(dt, speed, onStep) {
      if (this.seated) { // sitting on a bench (cable car): thighs forward, mittens on the lap, a slow breath
        idle += dt;
        body.position.y = 0;
        body.rotation.set(-0.05, 0, 0);
        body.scale.y = 1 + Math.sin(idle * 2.2) * 0.01;
        legs[0].rotation.set(-1.42, 0, 0.06);
        legs[1].rotation.set(-1.42, 0, -0.06);
        arms[0].rotation.x = arms[1].rotation.x = -0.72;
        return;
      }
      if (legs[0].rotation.z) legs[0].rotation.z = legs[1].rotation.z = 0;
      const walking = speed > 0.08;
      const prev = phase;
      phase += dt * (walking ? 6 + speed * 2.4 : 0);
      const k = Math.min(1, speed / 1.8);
      const sn = Math.sin(phase);
      body.position.y = Math.abs(sn) * 0.022 * k;
      body.rotation.z = sn * 0.08 * k;
      body.rotation.x = 0.08 * k;
      legs[0].rotation.x = sn * 0.7 * k;
      legs[1].rotation.x = -sn * 0.7 * k;
      if (!this.armsUp) { arms[0].rotation.x = -sn * 0.6 * k; arms[1].rotation.x = sn * 0.6 * k; }
      else { arms[0].rotation.x = arms[1].rotation.x = -2.85 + sn * 0.06 * k; }
      if (!walking) { idle += dt; body.scale.y = 1 + Math.sin(idle * 2.2) * 0.012; } else body.scale.y = 1;
      if (walking && onStep && Math.floor(prev / Math.PI) !== Math.floor(phase / Math.PI)) onStep();
    },
    armsUp: false,
    /** Seated pose (bench in the cable car cabin): the doll's root then sits SEAT_DROP below the bench top. */
    seated: false,
  };
}
/** How far below the bench top the doll's root goes in the seated pose (design units; × the doll's scale). */
export const SEAT_DROP = 0.056;

/** The player: knitted character + movement, collisions, ground height, carrying, scripted walkTo. */
export function createPlayer(engine, input, colliders, game, camYawRef) {
  const SCALE = 1.15, SPEED = 1.9, R = 0.08;
  let ch = buildCharacter(engine.mat, game.state.style);
  ch.group.scale.setScalar(SCALE);
  const root = new THREE.Group();
  root.add(ch.group);
  engine.scene.add(root);
  const pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  const vel = new THREE.Vector2();
  let heading = SPAWN.heading;
  let carried = null;
  let script = null; // {x, z, resolve}
  let dollVisible = true; // false while the camera looks through the character's eyes (eye view)

  const player = {
    object: root,
    pos,
    vel,
    get heading() { return heading; },
    set heading(h) { heading = h; },
    get speed() { return vel.length(); },
    controllable: false, // true during play; false in entry screen / cutscenes
    character: ch,
    onStep: null,
    /** Rebuild the doll with a new style (keeps what you carry). */
    setStyle(style) {
      game.state.style = { ...game.state.style, ...style };
      ch.group.removeFromParent();
      ch = buildCharacter(engine.mat, game.state.style);
      ch.group.scale.setScalar(SCALE);
      ch.group.visible = dollVisible;
      root.add(ch.group);
      player.character = ch;
      if (carried) ch.hands.add(carried);
    },
    /** Show / hide the doll (and anything it carries); the camera hides it in eye view. */
    setDollVisible(v) { dollVisible = !!v; ch.group.visible = dollVisible; },
    get dollVisible() { return dollVisible; },
    teleport(x, z, h = heading) { pos.set(x, colliders.heightAt(x, z), z); heading = h; vel.set(0, 0); },
    /** Hold an Object3D in front of the chest (null to drop). Returns the previously carried object. */
    carry(obj) {
      const prev = carried;
      if (prev) prev.removeFromParent();
      carried = obj || null;
      if (carried) { carried.position.set(0, 0, 0); ch.hands.add(carried); }
      ch.armsUp = !!carried;
      return prev;
    },
    get carrying() { return carried; },
    /** Scripted walk for cutscenes; resolves when arrived. */
    walkTo(x, z) { return new Promise((resolve) => { script = { x, z, resolve }; }); },
    faceTowards(x, z) { heading = Math.atan2(x - pos.x, z - pos.z); },
    update(dt) {
      const px = pos.x, pz = pos.z;
      let desired = new THREE.Vector2();
      if (script) {
        const dx = script.x - pos.x, dz = script.z - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.06) { const r = script.resolve; script = null; r(); }
        else desired.set(dx / d, dz / d).multiplyScalar(Math.min(1, d / 0.3));
      } else if (player.controllable) desired = input.getMove(camYawRef.yaw, pos.x, pos.z);
      vel.lerp(desired.multiplyScalar(SPEED), 1 - Math.exp(-dt * 9));
      pos.x += vel.x * dt;
      pos.z += vel.y * dt;
      colliders.resolve(pos, R, px, pz);
      const moved = Math.hypot(pos.x - px, pos.z - pz) / Math.max(dt, 1e-4);
      if (moved > 0.15) heading = turn(heading, Math.atan2(vel.x, vel.y), dt * 10);
      const gy = colliders.heightAt(pos.x, pos.z);
      pos.y += (gy - pos.y) * (1 - Math.exp(-dt * 14));
      root.position.copy(pos);
      ch.yaw.rotation.y = heading;
      ch.animate(dt, Math.min(moved, vel.length() + 0.05), player.onStep);
    },
  };
  return player;
}

function turn(a, b, k) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * Math.min(1, k);
}
