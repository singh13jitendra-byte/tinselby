import * as THREE from 'three';
import { P, KNIT, FELT, GLOSS, SW, SH, part, boxUV, xf, merge } from './yarn.js';
import { SPAWN } from './layout.js';

const TAU = Math.PI * 2;
const sph = (r, c, k = FELT, ws = 14, hs = 10) => part(new THREE.SphereGeometry(r, ws, hs), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);
const cyl = (rt, rb, h, c, k = KNIT, seg = 12) => part(new THREE.CylinderGeometry(rt, rb, h, seg), c, k, [(TAU * Math.max(rt, rb)) / SW, h / SH]);

/** Character style options shown in the "Change style" tray. Keys are stored in game.state.style.
 * coat / scarf values are CSS colours (candycane: a CSS stripe gradient for swatches), hat / hair / outfit values are labels.
 * Wave 1 rewards (Advent doors + daily gifts, gated by ctx.progress.wardrobe): coat plum, navy, gingerbread, forest;
 * hat santa, reindeer, elf; scarf candycane, gold, berry, sky, mint. Character keys (hair, hairColor, skin, outfit) are never gated. */
export const STYLE_OPTIONS = {
  coat: { red: '#b5332e', teal: '#4b8f8b', cream: '#ecdcc0', mustard: '#d59f3c', green: '#6f9463', plum: '#7b3b63', navy: '#34486e', gingerbread: '#a3653a', forest: '#2f5e3e' },
  hat: { bobble: 'Bobble beanie', earflap: 'Ear-flap hat', earmuffs: 'Earmuffs', none: 'No hat', santa: 'Santa hat', reindeer: 'Reindeer hat', elf: 'Elf hat' },
  scarf: { green: '#5d8a58', red: '#b5332e', white: P.snow, striped: 'striped', candycane: 'repeating-linear-gradient(135deg,#b5332e 0 6px,#f5f1ea 6px 12px)', gold: '#e3aa3a', berry: '#9c2f55', sky: '#86b4d8', mint: '#9fd3b4' },
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
  const showEars = hat !== 'earflap' && hat !== 'earmuffs' && hat !== 'reindeer' && hat !== 'elf';
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

/** Outfit bodies other than the classic coat: duffle (long, toggles, hood, pockets), dress (A-line, cream bands), jumper (turtleneck, chest band). */
function outfitBody(g, outfit, coat, trimCol, isCream) {
  if (outfit === 'duffle') {
    const rAt = (y) => 0.089 - ((y - 0.043) / 0.15) * 0.035;
    g.push(xf(cyl(0.054, 0.089, 0.15, coat, KNIT, 14), [0, 0.118, 0]));
    g.push(xf(sph(0.056, coat, KNIT, 12, 6), [0, 0.186, 0], null, [1, 0.5, 1]));
    g.push(xf(torusN(0.087, 0.013, trimCol || shade(coat, 0.86), KNIT, 6, 16), [0, 0.044, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(halfN(0.064, shade(coat, 0.93), KNIT, 10, 5), [0, 0.198, -0.06], [-1.95, 0, 0], [1, 0.8, 0.85])); // hood resting on the back
    for (const y of [0.09, 0.125, 0.16]) {
      const z = rAt(y) + 0.004;
      g.push(xf(boxp(0.034, 0.004, 0.004, '#5c3a26'), [0, y, z - 0.002])); // rope loop
      g.push(xf(cyl(0.0055, 0.0055, 0.028, '#ead8b0', GLOSS, 6), [0.004, y, z + 0.002], [0, 0, Math.PI / 2])); // horn toggle
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
  const isCream = s.coat === 'cream';
  const ging = s.coat === 'gingerbread';
  const hatCol = isCream ? STYLE_OPTIONS.coat.red : '#f0e4cc';
  const trim = striped ? P.snow : scarf; // hat brim / pom accents echo the scarf
  const brimCol = scarfKey === 'white' && !isCream ? coat : new THREE.Color(trim).equals(new THREE.Color(hatCol)) ? STYLE_OPTIONS.coat.mustard : trim;
  const mitt = isCream ? '#8a5a3c' : '#f0e4cc';
  const button = isCream || s.coat === 'mustard' ? '#7a4f33' : '#f6e7c4';
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
    g.push(xf(torusN(0.081, 0.013, ging ? icing : shade(coat, 0.86), KNIT, 6, 16), [0, 0.068, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(boxp(0.016, 0.112, 0.006, ging ? icing : shade(coat, 0.84)), [0, 0.128, 0.0685], [-0.24, 0, 0]));
    const gum = ['#c8322e', '#3f8f4f', '#c8322e'];
    [0.098, 0.128, 0.158].forEach((y, i) => g.push(xf(sph(0.0095, ging ? gum[i] : button, GLOSS, 6, 4), [0, y, 0.0795 - (y - 0.098) * 0.24])));
  } else outfitBody(g, outfit, coat, ging ? icing : null, isCream);
  // --- scarf: chunky ring, a knot, one tail in front and one flying out behind (reads from the follow camera)
  if (candy) for (let i = 0; i < 8; i++) g.push(xf(xf(torusN(0.058, 0.024, i % 2 ? P.snow : scarf, KNIT, 8, 2, TAU / 8 + 0.01), [0, 0, 0], [0, 0, (i / 8) * TAU]), [0, 0.193, 0], [Math.PI / 2, 0, 0]));
  else g.push(xf(torusN(0.058, 0.024, scarf, KNIT, 8, 16), [0, 0.193, 0], [Math.PI / 2, 0, 0]));
  if (striped) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; g.push(xf(sph(0.0255, P.snow, KNIT, 6, 4), [Math.cos(a) * 0.058, 0.193, Math.sin(a) * 0.058])); }
  g.push(xf(sph(0.024, scarf, KNIT, 8, 6), [0.046, 0.186, 0.052]));
  scarfTail(g, scarf, [0.045, 0.186, 0.066], [-0.22, 0, 0.14], 0.085, striped || candy ? P.snow : null);
  scarfTail(g, scarf, [-0.03, 0.2, -0.062], [1.05, 0, -0.25], 0.105, striped || candy ? P.snow : null);
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
  const cuffCol = ging ? icing : outfit === 'jumper' ? shade(coat, 0.8) : outfit === 'duffle' ? '#e0782c' : shade(mitt, 0.9);
  const mittCol = outfit === 'duffle' ? '#3d6db0' : mitt;
  const thumbCol = outfit === 'duffle' ? '#e0782c' : mitt;
  const armGeo = merge([
    xf(sph(0.022, coat, KNIT, 8, 4), [0, 0, 0]),
    xf(cyl(0.02, 0.025, 0.072, coat, KNIT, 8), [0, -0.036, 0]),
    xf(cyl(0.028, 0.028, 0.016, cuffCol, KNIT, 8), [0, -0.072, 0]),
    xf(sph(0.028, mittCol, KNIT, 10, 7), [0, -0.094, 0], null, [1, 1.12, 1]),
    xf(sph(0.012, thumbCol, KNIT, 6, 4), [0, -0.088, 0.024]),
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
  };
}

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
      root.add(ch.group);
      player.character = ch;
      if (carried) ch.hands.add(carried);
    },
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
