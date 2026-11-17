// Teasers during play:
//  1) every 45–70 s a small sleigh crosses the sky, locked to the camera so it reads as far away (no parallax),
//     with a sparkle trail and sleigh bells;
//  2) a one-off cameo: the first time the player enters the hill, a little Santa waves from the idle cable car cabin
//     (only if the city exposes cabins), removed after ~12 s.
import * as THREE from 'three';
import { buildSanta } from './santa.js';
import { cone, cyl, dot, xf, merge, KNIT, FELT, GLOW, GLOSS } from '../core/prims.js';
import { P } from '../core/yarn.js';

export function createTeasers(ctx, rig, trail, sfx, pxScale) {
  const { engine, game, params } = ctx;
  const cam = engine.camera;
  let next = Infinity, active = null;
  const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();

  game.on('game:start', () => { next = engine.time + (params.has('teaser') ? 1 : 30 + Math.random() * 15); });

  function begin() {
    if (rig.group.visible) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    active = { t: 0, dur: 7.5, dir, y0: 0.36 + Math.random() * 0.14, y1: 0.46 + Math.random() * 0.14, emitAcc: 0 };
    rig.santaIn();
    rig.santa.pose = 'sit';
    rig.team.mode = 'fly';
    rig.team.blend = 1;
    rig.group.scale.setScalar(0.2);
    rig.group.visible = true;
    rig.setShadows(false);
    sfx('sleighBells', { vol: 0.5 });
  }
  function end() {
    active = null;
    rig.group.visible = false;
    rig.group.scale.setScalar(1);
    rig.setShadows(true);
  }

  const teaser = {
    get active() { return !!active; },
    stop() { next = Infinity; if (active) end(); removeCameo(); },
    update(dt) {
      if (game.state.phase !== 'play') { if (active) end(); return; }
      if (!active && engine.time >= next) {
        next = engine.time + 45 + Math.random() * 25;
        if (!ctx.cam.shotActive) begin();
      }
      if (active) {
        const a = active;
        a.t += dt;
        const u = a.t / a.dur;
        if (u >= 1) { end(); return; }
        cam.updateMatrixWorld();
        const e = cam.matrixWorld.elements;
        right.set(e[0], e[1], e[2]); up.set(e[4], e[5], e[6]); fwd.set(-e[8], -e[9], -e[10]);
        const D = 6, hh = D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), hw = hh * cam.aspect;
        const x = (-1.25 + u * 2.5) * a.dir * hw;
        const y = (a.y0 + (a.y1 - a.y0) * u + Math.sin(u * Math.PI * 3) * 0.04) * hh;
        p.copy(cam.position).addScaledVector(fwd, D).addScaledVector(right, x).addScaledVector(up, y);
        q.copy(right).multiplyScalar(a.dir);
        rig.place(p, Math.atan2(q.x, q.z), 0.12 + Math.cos(u * Math.PI * 3) * 0.06, -0.08 * a.dir);
        rig.team.update(dt, 1.2);
        rig.santa.update(dt);
        a.emitAcc += dt * 45;
        if (a.emitAcc >= 1) {
          const n = Math.floor(a.emitAcc); a.emitAcc -= n;
          trail.emit(engine.time, rig.world(rig.rearLocal), n, 0.03, 0.32, null, 0.01);
        }
      }
      updateCameo(dt);
    },
  };

  // ---------------------------------------------------------------- cable car cameo
  let cameo = null, cameoDone = false;
  function findCabin() {
    const cc = ctx.city?.cableCar;
    if (!cc) return null;
    const list = cc.cabins || (cc.cabin ? [cc.cabin] : null);
    if (!Array.isArray(list) || !list.length) return null;
    // prefer a cabin the player is not riding in
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i]?.object || list[i]?.group || list[i];
      if (c && c.isObject3D && !isAncestor(c, ctx.player.object)) return c;
    }
    return null;
  }
  function isAncestor(a, o) { for (let x = o; x; x = x.parent) if (x === a) return true; return false; }
  function addCameo() {
    const cabin = findCabin();
    if (!cabin) return;
    const box = new THREE.Box3().setFromObject(cabin);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const ws = new THREE.Vector3(); cabin.getWorldScale(ws);
    const g = new THREE.Group();
    const santa = buildSanta(engine.mat);
    santa.pose = 'wave';
    g.add(santa.group);
    const tree = new THREE.Mesh(merge([
      xf(cyl(0.012, 0.014, 0.04, 6, P.woodDark, KNIT), [0, 0.02, 0]),
      xf(cone(0.09, 0.14, 10, P.pine, KNIT), [0, 0.1, 0]),
      xf(cone(0.065, 0.11, 10, P.pine, KNIT), [0, 0.18, 0]),
      xf(cone(0.04, 0.08, 10, P.pine, KNIT), [0, 0.25, 0]),
      xf(dot(0.016, P.gold, GLOW), [0, 0.3, 0]),
      ...[[0.05, 0.08, 0.06, P.red], [-0.06, 0.1, 0.03, P.gold], [0.03, 0.17, 0.05, P.glowSoft], [-0.03, 0.2, 0.03, P.red], [0.06, 0.12, -0.04, P.glowSoft]]
        .map(([x, y, z, c]) => xf(dot(0.011, c, c === P.glowSoft ? GLOW : GLOSS), [x, y, z])),
    ]), engine.mat);
    tree.position.set(0.17, 0, -0.03);
    tree.scale.setScalar(1.45);
    g.add(tree);
    // fit inside the cabin: Santa ≈ 45% of the cabin's full height (incl. hanger), standing on the floor (cabin local frame)
    const h = size.y / ws.y;
    const s = Math.max(0.15, Math.min(1.2, (h * 0.45) / 0.52));
    g.scale.setScalar(s);
    const lb = new THREE.Box3();
    // compute floor in cabin-local space
    cabin.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(cabin.matrixWorld).invert();
    lb.copy(box).applyMatrix4(inv);
    g.position.set((lb.min.x + lb.max.x) / 2 - 0.08 * s, lb.min.y + h * 0.065, (lb.min.z + lb.max.z) / 2);
    // face the camera side (east / south) as well as we can
    g.rotation.y = 0.9;
    cabin.add(g);
    cameo = { g, santa, t: 0, cabin };
    sfx('hohoho', { vol: 0.5 });
  }
  function removeCameo() { if (cameo) { cameo.g.removeFromParent(); cameo = null; } }
  function updateCameo(dt) {
    if (!cameo) return;
    cameo.t += dt;
    cameo.santa.update(dt);
    if (cameo.t > 12 || isAncestor(cameo.cabin, ctx.player.object)) removeCameo();
  }
  game.on('district:enter', ({ id }) => {
    if (id !== 'hill' || cameoDone || game.state.phase !== 'play') return;
    cameoDone = true;
    try { addCameo(); } catch (e) { cameo = null; }
  });
  game.on('cablecar:ride', ({ cabin, duration = 7.5 } = {}) => {
    if (!cameo) return;
    if (cabin === cameo.cabin || !cabin) removeCameo();
    else cameo.t = Math.min(cameo.t, 11.5 - duration); // keep waving from the other cabin as it passes the player
  });

  return teaser;
}
