import * as THREE from 'three';
import { P, KNIT, FELT, GLOSS, SW, SH, part, boxUV, xf, merge } from './yarn.js';
import { SPAWN } from './layout.js';

const TAU = Math.PI * 2;
const sph = (r, c, k = FELT, ws = 14, hs = 10) => part(new THREE.SphereGeometry(r, ws, hs), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);
const cyl = (rt, rb, h, c, k = KNIT, seg = 12) => part(new THREE.CylinderGeometry(rt, rb, h, seg), c, k, [(TAU * Math.max(rt, rb)) / SW, h / SH]);

/** Character style options shown in the "Change style" tray. Keys are stored in game.state.style. */
export const STYLE_OPTIONS = {
  coat: { red: '#b5332e', teal: '#4b8f8b', cream: '#ecdcc0', mustard: '#d59f3c', green: '#6f9463' },
  hat: { bobble: 'Bobble beanie', earflap: 'Ear-flap hat', earmuffs: 'Earmuffs', none: 'No hat' },
  scarf: { green: '#5d8a58', red: '#b5332e', white: P.snow, striped: 'striped' },
};
export const DEFAULT_STYLE = { coat: 'red', hat: 'bobble', scarf: 'green' };

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
  const scarf = striped ? STYLE_OPTIONS.scarf.red : STYLE_OPTIONS.scarf[scarfKey] || scarfKey || P.green;
  const isCream = s.coat === 'cream';
  const hatCol = isCream ? STYLE_OPTIONS.coat.red : '#f0e4cc';
  const trim = striped ? P.snow : scarf; // hat brim / pom accents echo the scarf
  const brimCol = scarfKey === 'white' && !isCream ? coat : new THREE.Color(trim).equals(new THREE.Color(hatCol)) ? STYLE_OPTIONS.coat.mustard : trim;
  const mitt = isCream ? '#8a5a3c' : '#f0e4cc';
  const button = isCream || s.coat === 'mustard' ? '#7a4f33' : '#f6e7c4';
  const skin = opts.skin || P.skin;
  const hair = opts.hair || '#7a4a2c';

  const group = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  yaw.scale.setScalar(DOLL_K);
  group.add(yaw);
  yaw.add(body);
  const g = [];
  // --- coat: flared knit body, rounded shoulders, rolled hem, button placket
  g.push(xf(cyl(0.052, 0.083, 0.125, coat, KNIT, 14), [0, 0.128, 0]));
  g.push(xf(sph(0.054, coat, KNIT, 12, 6), [0, 0.186, 0], null, [1, 0.5, 1]));
  g.push(xf(torusN(0.081, 0.013, shade(coat, 0.86), KNIT, 6, 16), [0, 0.068, 0], [Math.PI / 2, 0, 0]));
  g.push(xf(boxp(0.016, 0.112, 0.006, shade(coat, 0.84)), [0, 0.128, 0.0685], [-0.24, 0, 0]));
  for (const y of [0.098, 0.128, 0.158]) g.push(xf(sph(0.0095, button, GLOSS, 6, 4), [0, y, 0.0795 - (y - 0.098) * 0.24]));
  // --- scarf: chunky ring, a knot, one tail in front and one flying out behind (reads from the follow camera)
  g.push(xf(torusN(0.058, 0.024, scarf, KNIT, 8, 16), [0, 0.193, 0], [Math.PI / 2, 0, 0]));
  if (striped) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; g.push(xf(sph(0.0255, P.snow, KNIT, 6, 4), [Math.cos(a) * 0.058, 0.193, Math.sin(a) * 0.058])); }
  g.push(xf(sph(0.024, scarf, KNIT, 8, 6), [0.046, 0.186, 0.052]));
  scarfTail(g, scarf, [0.045, 0.186, 0.066], [-0.22, 0, 0.14], 0.085, striped ? P.snow : null);
  scarfTail(g, scarf, [-0.03, 0.2, -0.062], [1.05, 0, -0.25], 0.105, striped ? P.snow : null);
  // --- head: big felt ball, bead eyes, rosy cheeks, a little smile
  g.push(xf(sph(0.085, skin, FELT, 18, 12), [0, 0.265, 0]));
  for (const sx of [-1, 1]) {
    g.push(xf(sph(0.0095, P.ink, GLOSS, 8, 6), [sx * 0.03, 0.268, 0.0795]));
    g.push(xf(sph(0.016, '#e9938f', FELT, 8, 6), [sx * 0.052, 0.246, 0.0625], [0, sx * 0.65, 0], [1, 0.7, 0.35]));
  }
  g.push(xf(torusN(0.015, 0.0028, P.ink, FELT, 4, 8, 2.1), [0, 0.256, 0.084], [0, 0, -Math.PI / 2 - 1.05]));
  const hairCap = () => g.push(xf(sph(0.089, hair, KNIT, 12, 8), [0, 0.268, -0.013]));
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
    hairCap();
    g.push(xf(halfN(0.091, hair, KNIT, 14, 6), [0, 0.268, -0.006], [-0.25, 0, 0]));
    g.push(xf(sph(0.03, hair, KNIT, 8, 6), [0, 0.352, -0.03])); // top-knot
    g.push(xf(torusN(0.092, 0.008, P.ink, FELT, 5, 14, Math.PI), [0, 0.268, 0], [0, 0, 0]));
    const mc = s.coat === 'red' ? P.snow : '#e7a1a3';
    for (const sx of [-1, 1]) {
      g.push(xf(sph(0.04, mc, FELT, 10, 8), [sx * 0.088, 0.266, 0], null, [0.6, 1, 1]));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.push(xf(sph(0.018, mc, FELT, 6, 4), [sx * 0.094, 0.266 + Math.sin(a) * 0.03, Math.cos(a) * 0.03])); }
    }
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

  const armGeo = merge([
    xf(sph(0.022, coat, KNIT, 8, 4), [0, 0, 0]),
    xf(cyl(0.02, 0.025, 0.072, coat, KNIT, 8), [0, -0.036, 0]),
    xf(cyl(0.028, 0.028, 0.016, shade(mitt, 0.9), KNIT, 8), [0, -0.072, 0]),
    xf(sph(0.028, mitt, KNIT, 10, 7), [0, -0.094, 0], null, [1, 1.12, 1]),
    xf(sph(0.012, mitt, KNIT, 6, 4), [0, -0.088, 0.024]),
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
  const legGeo = merge([
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
