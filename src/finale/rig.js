// The flying rig: sleigh + reindeer team + Santa in one group (+z = direction of travel), and flight-path helpers.
import * as THREE from 'three';
import { buildSleigh, SLEIGH } from './sleigh.js';
import { buildTeam } from './reindeer.js';
import { buildSanta } from './santa.js';

export function buildRig(engine) {
  const group = new THREE.Group(); // position + heading (rotation.y)
  const tilt = new THREE.Group(); // pitch / roll / landing bounce
  group.add(tilt);
  const sleigh = buildSleigh(engine.mat);
  tilt.add(sleigh);
  const team = buildTeam(engine.mat);
  tilt.add(team.group);
  const santa = buildSanta(engine.mat);
  santa.group.position.copy(SLEIGH.seat);
  tilt.add(santa.group);
  group.visible = false;
  engine.scene.add(group);

  const tmpV = new THREE.Vector3();
  const rig = {
    group, tilt, sleigh, team, santa,
    rearLocal: new THREE.Vector3(0, 0.18, -0.58),
    runnerLocal: [new THREE.Vector3(-0.2, 0.02, -0.5), new THREE.Vector3(0.2, 0.02, -0.5)],
    noseLocal: new THREE.Vector3(0, 0.4, 2.33),
    heading: 0, pitch: 0, roll: 0,
    /** World position of a rig-local point. */
    world(local, out = new THREE.Vector3()) { group.updateMatrixWorld(true); return tilt.localToWorld(out.copy(local)); },
    seatWorld(out = new THREE.Vector3()) { return rig.world(SLEIGH.seat, out); },
    place(pos, heading, pitch = 0, roll = 0) {
      group.position.copy(pos);
      rig.heading = heading; rig.pitch = pitch; rig.roll = roll;
      group.rotation.set(0, heading, 0);
      tilt.rotation.set(-pitch, 0, roll);
    },
    /** Santa: get out (attach to scene, keep world transform) / back into the seat. */
    santaOut() { if (santa.group.parent !== engine.scene) engine.scene.attach(santa.group); },
    santaIn() { if (santa.group.parent !== tilt) { tilt.attach(santa.group); santa.group.position.copy(SLEIGH.seat); santa.group.rotation.set(0, 0, 0); santa.group.scale.setScalar(1); } },
    _tmp: tmpV,
    /** Toggle shadow casting (off for the tiny far-away teaser so it doesn't drop a shadow next to the player). */
    setShadows(on) { group.traverse((o) => { if (o.isMesh) o.castShadow = on; }); },
  };
  return rig;
}

/**
 * Fly the rig along a curve: u in 0..1 (already eased). Smooth heading, pitch from the climb, bank from the turn rate.
 * Returns the world position. Keeps its own smoothing state.
 */
export function createFlight(curve, groundY = 0) {
  const p = new THREE.Vector3(), tan = new THREE.Vector3();
  let lastH = null, roll = 0;
  return {
    curve,
    pose(rig, u, dt) {
      u = Math.min(1, Math.max(0, u));
      curve.getPointAt(u, p);
      curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)), tan);
      p.y = Math.max(groundY, p.y);
      const h = Math.atan2(tan.x, tan.z);
      let dh = lastH == null ? 0 : Math.atan2(Math.sin(h - lastH), Math.cos(h - lastH));
      lastH = h;
      const targetRoll = THREE.MathUtils.clamp(-dh / Math.max(dt, 1e-3) * 0.22, -0.5, 0.5);
      roll += (targetRoll - roll) * (1 - Math.exp(-dt * 4));
      const pitch = Math.asin(THREE.MathUtils.clamp(tan.y, -1, 1)) * 0.7;
      rig.place(p, h, pitch, roll);
      return p;
    },
    reset() { lastH = null; roll = 0; },
  };
}
