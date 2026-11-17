import * as THREE from 'three';
import { P, KNIT, FELT, GLOSS, SW, SH, part, xf, merge } from './yarn.js';
import { SPAWN } from './layout.js';

const TAU = Math.PI * 2;
const sph = (r, c, k = FELT, ws = 14, hs = 10) => part(new THREE.SphereGeometry(r, ws, hs), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);
const cyl = (rt, rb, h, c, k = KNIT, seg = 12) => part(new THREE.CylinderGeometry(rt, rb, h, seg), c, k, [(TAU * Math.max(rt, rb)) / SW, h / SH]);
const torus = (R, r, c, k = KNIT) => part(new THREE.TorusGeometry(R, r, 8, 20), c, k, [(TAU * R) / SW, (TAU * r) / SH]);
const half = (r, c, k) => part(new THREE.SphereGeometry(r, 14, 8, 0, TAU, 0, Math.PI / 2), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);

/** Character style options shown in the "Change style" tray. Keys are stored in game.state.style. */
export const STYLE_OPTIONS = {
  coat: { red: P.red, teal: P.teal, cream: P.cream, mustard: '#d9a23a', green: P.green },
  hat: { bobble: 'Bobble beanie', earflap: 'Ear-flap hat', earmuffs: 'Earmuffs', none: 'No hat' },
  scarf: { green: P.green, red: P.red, white: P.snow, striped: 'striped' },
};
export const DEFAULT_STYLE = { coat: 'red', hat: 'bobble', scarf: 'green' };

/**
 * Build a knitted doll (~0.37 tall, faces +z, feet at y = 0).
 * Returns { group, body, legs[2], arms[2], hands: Object3D (carry anchor), animate(dt, speed) }.
 * Also used by the entry-screen preview and for quest-giver NPCs (pass any style).
 */
export function buildCharacter(mat, style = DEFAULT_STYLE, opts = {}) {
  const s = { ...DEFAULT_STYLE, ...style };
  const coat = STYLE_OPTIONS.coat[s.coat] || s.coat || P.red;
  const hatCol = coat === P.cream ? P.red : P.cream;
  const scarfKey = s.scarf;
  const scarf = scarfKey === 'striped' ? P.red : STYLE_OPTIONS.scarf[scarfKey] || scarfKey || P.green;
  const skin = opts.skin || P.skin;
  const hair = opts.hair || '#7a4a2c';

  const group = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  group.add(yaw);
  yaw.add(body);
  const g = [];
  g.push(xf(cyl(0.05, 0.075, 0.13, coat), [0, 0.135, 0]));
  g.push(xf(torus(0.073, 0.012, P.snow, FELT), [0, 0.072, 0], [Math.PI / 2, 0, 0]));
  for (const y of [0.11, 0.145, 0.18]) g.push(xf(sph(0.008, P.gold, GLOSS, 8, 6), [0, y, 0.062 - (y - 0.11) * 0.2]));
  g.push(xf(torus(0.045, 0.016, scarf), [0, 0.205, 0], [Math.PI / 2, 0, 0]));
  if (scarfKey === 'striped') for (const a of [0.5, 2.1, 3.7, 5.3]) g.push(xf(sph(0.017, P.snow, KNIT, 8, 6), [Math.cos(a) * 0.045, 0.205, Math.sin(a) * 0.045]));
  g.push(xf(part(new THREE.BoxGeometry(0.026, 0.07, 0.012), scarf, KNIT, [1, 1]), [0.03, 0.17, 0.05], [0.2, 0, 0.25]));
  g.push(xf(sph(0.058, skin), [0, 0.265, 0]));
  for (const sx of [-1, 1]) {
    g.push(xf(sph(0.008, P.ink, GLOSS, 8, 6), [sx * 0.02, 0.272, 0.052]));
    g.push(xf(sph(0.011, P.pink, FELT, 8, 6), [sx * 0.033, 0.254, 0.046], null, [1, 0.7, 0.5]));
  }
  if (s.hat === 'bobble') {
    g.push(xf(half(0.062, hatCol, KNIT), [0, 0.278, 0]));
    g.push(xf(torus(0.058, 0.014, coat === P.red ? P.green : P.red), [0, 0.282, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(sph(0.026, P.snow), [0, 0.355, 0]));
  } else if (s.hat === 'earflap') {
    g.push(xf(half(0.064, P.wood, KNIT), [0, 0.272, 0]));
    for (const sx of [-1, 1]) g.push(xf(sph(0.03, P.wood, KNIT, 10, 8), [sx * 0.056, 0.25, 0], null, [0.5, 1.1, 0.9]));
    g.push(xf(torus(0.06, 0.012, P.cream, FELT), [0, 0.275, 0], [Math.PI / 2, 0, 0]));
    g.push(xf(sph(0.02, P.cream), [0, 0.34, 0]));
  } else if (s.hat === 'earmuffs') {
    g.push(xf(half(0.06, hair, FELT), [0, 0.27, -0.004]));
    g.push(xf(torus(0.062, 0.007, P.ink, FELT), [0, 0.268, 0], [0, Math.PI / 2, 0]));
    for (const sx of [-1, 1]) g.push(xf(sph(0.026, P.pink === coat ? P.snow : P.pink, FELT, 10, 8), [sx * 0.06, 0.262, 0]));
  } else {
    g.push(xf(half(0.062, hair, KNIT), [0, 0.27, -0.006]));
    g.push(xf(sph(0.03, hair, KNIT, 10, 8), [0, 0.3, -0.04]));
  }
  g.push(xf(part(new THREE.BoxGeometry(0.07, 0.08, 0.04), P.wood, KNIT, [1.5, 2]), [0, 0.15, -0.065]));
  const bodyMesh = new THREE.Mesh(merge(g), mat);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  body.add(bodyMesh);

  const armGeo = merge([xf(cyl(0.016, 0.018, 0.08, coat, KNIT, 8), [0, -0.04, 0]), xf(sph(0.02, scarf), [0, -0.085, 0])]);
  const arms = [-1, 1].map((sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.062, 0.19, 0);
    piv.rotation.z = sx * 0.25;
    const m = new THREE.Mesh(armGeo, mat);
    m.castShadow = true;
    piv.add(m);
    body.add(piv);
    return piv;
  });
  const legGeo = merge([xf(cyl(0.017, 0.017, 0.06, P.ink, KNIT, 8), [0, -0.03, 0]), xf(sph(0.024, P.woodDark), [0, -0.062, 0.008], null, [1, 0.7, 1.3])]);
  const legs = [-1, 1].map((sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.028, 0.08, 0);
    const m = new THREE.Mesh(legGeo, mat);
    m.castShadow = true;
    piv.add(m);
    body.add(piv);
    return piv;
  });
  const hands = new THREE.Object3D(); // carry anchor: in front of the chest
  hands.position.set(0, 0.17, 0.09);
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
      else { arms[0].rotation.x = arms[1].rotation.x = -1.2; }
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
