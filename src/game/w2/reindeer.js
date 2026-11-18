// Door 15: The Lost Reindeer (task). Glowing felt hoofprints lead along REINDEER.trail to Clover on the ice; Clover follows
// you (follow.js, spacing 0.55) back to Santa's Reindeer Rest (rest.js) and lives there ever after (progress door 15 done).
// Meshes: hoofprints (1 InstancedMesh, ≤ 96 instances, ≈ 16 tris each), Clover (body mesh + 4 instanced legs from the
// finale's reindeerGeos()), the Rest (rest.js). Mid-task progress is not saved.
import * as THREE from 'three';
import { poly, xf, merge, part, FELT, GLOW } from '../../core/prims.js';
import { P } from '../../core/yarn.js';
import { REINDEER } from '../../core/layout.js';
import { reindeerGeos, REINDEER_RIG } from '../../finale/reindeer.js';
import { createFollowers } from './follow.js';
import { buildRest } from './rest.js';

const SPACING = 0.32; // distance between hoofprint pairs
const AHEAD = 8; // prints lit ahead of the furthest reached one
const BEHIND = 2; // prints still lit behind it
const CLOVER_SCALE = 1;

/** One pair of cloven hoofprints (flat on the ground, forward = −z): 4 glowing lobes on a trampled felt patch, 20 tris. */
function printGeo() {
  const lobe = (cx, cy, rx, ry, rot) => {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx * Math.cos(rot) - Math.sin(a) * ry * Math.sin(rot), cy + Math.cos(a) * rx * Math.sin(rot) + Math.sin(a) * ry * Math.cos(rot)]); }
    const geo = new THREE.ShapeGeometry(poly(pts));
    geo.rotateX(-Math.PI / 2);
    return geo;
  };
  const flat = (geo, c, k, y) => { geo.translate(0, y, 0); return part(geo, c, k); };
  const g = [];
  // trampled snow patch (soft, under the hooves)
  const patch = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; patch.push([Math.cos(a) * 0.13, Math.sin(a) * 0.1]); }
  const pg = new THREE.ShapeGeometry(poly(patch)); pg.rotateX(-Math.PI / 2);
  g.push(flat(pg, P.snowShade, FELT, 0.004));
  for (const [sx, dz] of [[-1, -0.035], [1, 0.035]]) {
    for (const sl of [-1, 1]) g.push(flat(lobe(sx * 0.06 + sl * 0.019, dz, 0.0155, 0.036, sl * -0.18 + sx * 0.08), P.glowSoft, GLOW, 0.008));
  }
  return merge(g);
}

export default function create(ctx, env) {
  const { engine, game, interact, player, colliders } = ctx;
  const { n, models } = env;
  const S = game.state;
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };
  const playing = () => S.phase === 'play';
  const revealed = (id) => { try { return !!ctx.city?.isRevealed?.(id); } catch (e) { return true; } };

  // ---------------------------------------------------------------- Rest (permanent prop)
  const rest = buildRest(ctx);
  const find = { x: REINDEER.find.x, z: REINDEER.find.z };
  const trail = REINDEER.trail;

  // ---------------------------------------------------------------- hoofprints along the trail
  const pts = []; // {x, z, a}
  {
    let carry = 0;
    pts.push({ x: trail[0][0], z: trail[0][1] });
    for (let i = 1; i < trail.length; i++) {
      const ax = trail[i - 1][0], az = trail[i - 1][1], bx = trail[i][0], bz = trail[i][1];
      const L = Math.hypot(bx - ax, bz - az);
      let d = SPACING - carry;
      while (d <= L) { pts.push({ x: ax + ((bx - ax) * d) / L, z: az + ((bz - az) * d) / L }); d += SPACING; }
      carry = L - (d - SPACING);
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.min(i + 1, pts.length - 1)], b = pts[Math.max(i - 1, 0)];
      const dx = (a.x - b.x) || 0.001, dz = (a.z - b.z) || 0.001;
      pts[i].a = Math.atan2(-dx, -dz);
    }
  }
  const NP = Math.min(96, pts.length);
  const pGeo = printGeo();
  const prints = new THREE.InstancedMesh(pGeo, engine.mat, NP);
  prints.frustumCulled = false; prints.castShadow = false; prints.receiveShadow = false;
  prints.visible = false;
  engine.scene.add(prints);
  const psc = new Float32Array(NP); // current scale per print
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let furthest = -1;
  let printsOn = false; // trail active
  let printsAnim = false;

  // ---------------------------------------------------------------- Clover
  const geos = reindeerGeos();
  const cBody = new THREE.Mesh(geos.body, engine.mat);
  cBody.castShadow = true;
  const cLegs = new THREE.InstancedMesh(geos.leg, engine.mat, 4);
  cLegs.castShadow = true; cLegs.frustumCulled = false;
  const clover = new THREE.Group();
  clover.add(cBody, cLegs);
  clover.scale.setScalar(CLOVER_SCALE);
  clover.visible = false;
  engine.scene.add(clover);
  const cf = { x: find.x, z: find.z, y: 0, h: Math.atan2(-find.x, -find.z), speed: 0, visible: true }; // follower record
  const fol = createFollowers(ctx, { spacing: 0.55 });
  const cState = { mode: 'off', t: 0, ph: 0, hop: 0, from: null, path: null, seg: 0 }; // off | ice | follow | trot | rest
  let accepted = false, finished = false;
  const homeCol = (() => { try { const c = colliders.addCircle(rest.home.x, rest.home.z, 0.11, 'clover'); c.enabled = false; return c; } catch (e) { return null; } })();
  const mBody = new THREE.Matrix4(), mLeg = new THREE.Matrix4(), bd = new THREE.Object3D(), lg = new THREE.Object3D();

  function poseClover(dt, t, speed, idle) {
    cState.ph += dt * (3.5 + speed * 5.5);
    const k = Math.min(1, speed / 1.0);
    const ph = cState.ph;
    const bob = Math.abs(Math.sin(ph)) * 0.03 * k + (1 - k) * Math.sin(t * 1.5) * 0.003;
    bd.position.set(0, bob, 0);
    bd.rotation.set(-Math.cos(ph) * 0.1 * k + (idle && k < 0.1 ? Math.sin(t * 0.9) * 0.015 : 0), (1 - k) * Math.sin(t * 0.55) * 0.07, 0); // idle: small head turn/ear flick sway
    bd.updateMatrix();
    mBody.copy(bd.matrix);
    cBody.position.copy(bd.position); cBody.rotation.copy(bd.rotation);
    REINDEER_RIG.LEGS.forEach(([lx, lz, lph], j) => {
      lg.position.set(lx, REINDEER_RIG.HIP_Y, lz);
      lg.rotation.set(Math.sin(ph + lph) * 0.75 * k, 0, 0);
      lg.updateMatrix();
      mLeg.multiplyMatrices(mBody, lg.matrix);
      cLegs.setMatrixAt(j, mLeg);
    });
    cLegs.instanceMatrix.needsUpdate = true;
  }
  const setClover = (x, y, z, h, lift = 0) => { clover.position.set(x, y + lift, z); clover.rotation.y = h; };

  function resetAll() {
    fol.clear();
    accepted = false; finished = false; furthest = -1; printsOn = false;
    cState.mode = 'off'; cState.hop = 0;
    Object.assign(cf, { x: find.x, z: find.z, y: gy(find.x, find.z), h: Math.atan2(-find.x, -find.z), speed: 0, hold: false });
    if (homeCol) homeCol.enabled = false;
    clover.visible = false;
  }
  function finalLook() {
    fol.clear();
    accepted = true; finished = true; printsOn = false; furthest = -1;
    cState.mode = 'rest';
    cf.x = rest.home.x; cf.z = rest.home.z; cf.y = gy(cf.x, cf.z); cf.h = rest.heading; cf.speed = 0; cf.hold = false;
    if (homeCol) homeCol.enabled = true;
  }

  // ---------------------------------------------------------------- interactions
  const helloSpot = interact.add({
    id: 'clover-hello', x: find.x, z: find.z, r: 0.8, label: 'Say hello to Clover', icon: 'hoof',
    enabled: () => playing() && accepted && cState.mode === 'ice' && env.ds(n) === 'open' && !ctx.minigames?.active,
    onInteract: hello,
  });
  function hello() {
    if (cState.mode !== 'ice') return;
    cState.mode = 'follow'; cState.hop = 0.55; cState.t = 0;
    fol.add(cf);
    printsOn = false; // the trail has done its job: the prints fade away
    env.sfx('sleighBells', cf.x, cf.z);
    game.emit('task:progress', { id: 'reindeer', step: 2, of: 3 });
    env.toast('Clover is following you!', 2400);
  }
  function startTrot() {
    fol.remove(cf);
    cState.mode = 'trot'; cState.seg = 0;
    cState.path = [{ x: rest.door.x, z: rest.door.z }, { x: rest.home.x, z: rest.home.z }];
    env.sfx('sleighBells', rest.home.x, rest.home.z);
  }
  function arrive() {
    finished = true;
    cState.mode = 'rest'; cf.h = rest.heading; cf.speed = 0; cState.hop = 0.8;
    if (homeCol) homeCol.enabled = true;
    env.sfx('sleighBells', rest.home.x, rest.home.z);
    env.sfx('cheer', rest.home.x, rest.home.z);
    env.taskComplete('reindeer');
    env.completeDoor(n);
    env.say(n, 'done');
    try { env.giver?.hop?.(); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------- per-frame
  const turnTo = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); };
  function updatePrints(dt, t) {
    const want = printsOn && revealed('park');
    if (!want && !printsAnim) { if (prints.visible) prints.visible = false; return; }
    prints.visible = true;
    const px = player.pos.x, pz = player.pos.z;
    if (printsOn) {
      // furthest reached: the nearest print to the player (within 1.1), never going backwards by more than it has
      let bi = -1, bdist = 1.1;
      for (let i = Math.max(0, furthest - 2); i < Math.min(NP, furthest + 14); i++) {
        const d = Math.hypot(pts[i].x - px, pts[i].z - pz);
        if (d < bdist) { bdist = d; bi = i; }
      }
      if (bi > furthest) furthest = bi;
    }
    let moving = false;
    const kk = Math.min(1, dt * 6);
    for (let i = 0; i < NP; i++) {
      const lit = printsOn && i >= furthest - BEHIND && i <= furthest + AHEAD;
      const target = lit ? 1 - Math.max(0, i - furthest - AHEAD + 3) * 0.12 : 0; // the furthest ones are faint (smaller)
      psc[i] += (target - psc[i]) * kk;
      if (Math.abs(target - psc[i]) > 0.01) moving = true;
      if (psc[i] < 0.02) { prints.setMatrixAt(i, zero); continue; }
      const p = pts[i];
      dummy.position.set(p.x, gy(p.x, p.z), p.z);
      dummy.rotation.set(0, p.a, 0);
      dummy.scale.setScalar(psc[i] * (1.15 + Math.sin(t * 4 - i * 0.8) * 0.1));
      dummy.updateMatrix();
      prints.setMatrixAt(i, dummy.matrix);
    }
    prints.instanceMatrix.needsUpdate = true;
    printsAnim = printsOn || moving;
    if (!printsAnim) prints.visible = false;
  }

  function update(dt, t) {
    rest.update(dt);
    const s = env.ds(n);
    if (s === 'done' && !finished) finalLook();
    // Clover's visibility: on the ice while the task runs, in the Rest afterwards
    let show = false;
    if (cState.mode === 'off' && accepted && s === 'open' && revealed('lakeside')) { cState.mode = 'ice'; cf.x = find.x; cf.z = find.z; cf.y = gy(find.x, find.z); }
    if (cState.mode === 'ice' || cState.mode === 'follow' || cState.mode === 'trot') show = revealed('lakeside') || cState.mode !== 'ice';
    if (cState.mode === 'rest') show = rest.shown;
    if (cState.mode === 'ice' && !playing()) show = false; // never stand on the skate ice (or anywhere) during a mini-game
    updatePrints(dt, t);
    fol.update(dt);
    if (!show) { if (clover.visible) clover.visible = false; return; }
    const px = player.pos.x, pz = player.pos.z;
    let speed = 0, idle = true;
    if (cState.mode === 'ice') {
      const d = Math.hypot(px - cf.x, pz - cf.z);
      if (d < 3.5) cf.h = turnTo(cf.h, Math.atan2(px - cf.x, pz - cf.z), dt * 3);
    } else if (cState.mode === 'follow') {
      clover.visible = cf.visible;
      speed = cf.speed; idle = false;
      if (playing() && !fol.hidden && Math.hypot(px - rest.pos.x, pz - rest.pos.z) < 1.2) startTrot();
    } else if (cState.mode === 'trot') {
      const tgt = cState.path[cState.seg];
      const dx = tgt.x - cf.x, dz = tgt.z - cf.z, d = Math.hypot(dx, dz);
      const v = 1.25;
      if (d < v * dt + 0.01) { cf.x = tgt.x; cf.z = tgt.z; cState.seg++; if (cState.seg >= cState.path.length) arrive(); }
      else { cf.x += (dx / d) * v * dt; cf.z += (dz / d) * v * dt; cf.h = turnTo(cf.h, Math.atan2(dx, dz), dt * 8); }
      cf.y = gy(cf.x, cf.z); speed = v; idle = false;
    } else if (cState.mode === 'rest') {
      cf.x = rest.home.x; cf.z = rest.home.z; cf.y = gy(cf.x, cf.z);
      const d = Math.hypot(px - cf.x, pz - cf.z);
      cf.h = turnTo(cf.h, d < 2.2 ? Math.atan2(px - cf.x, pz - cf.z) * 0.35 + rest.heading * 0.65 : rest.heading, dt * 2); // friendly little head-turn towards you
    }
    if (cState.mode !== 'follow') clover.visible = true;
    let lift = 0;
    if (cState.hop > 0) { cState.hop -= dt; lift = Math.abs(Math.sin(Math.max(0, cState.hop) * 8)) * 0.07 * Math.min(1, cState.hop * 2); }
    setClover(cf.x, cf.y, cf.z, cf.h, lift);
    poseClover(dt, t, speed, idle);
  }

  // ---------------------------------------------------------------- activity
  const nextPrint = () => pts[Math.min(NP - 1, Math.max(0, furthest) + 4)];
  const act = {
    id: 'reindeer', n,
    get busy() { return cState.mode === 'trot'; },
    onGiver() {
      if (finished) return;
      if (!accepted) {
        accepted = true; printsOn = true; furthest = -1;
        env.say(n, 'accept');
        game.emit('task:progress', { id: 'reindeer', step: 1, of: 3 });
        return;
      }
      env.say(n, 'remind');
    },
    objective() {
      if (!accepted || finished || env.ds(n) !== 'open') return null;
      if (cState.mode === 'follow' || cState.mode === 'trot') return { id: 'reindeer-lead', text: 'Lead Clover to the Rest', icon: 'hoof', x: rest.door.x, z: rest.door.z };
      if (furthest >= NP - 8) return { id: 'reindeer-find', text: 'Find Clover on the ice', icon: 'hoof', x: find.x, z: find.z };
      const p = nextPrint();
      return { id: 'reindeer-trail', text: 'Follow the hoofprints', icon: 'hoof', x: p.x, z: p.z };
    },
    giverLabel: () => null,
    update,
    sync({ reset } = {}) {
      if (reset) resetAll();
      if (env.ds(n) === 'done') finalLook();
    },
    /** The wave-3 finale hook: tasks.reindeer → this object. */
    reindeer: {
      get atRest() { return cState.mode === 'rest' && finished; },
      home: { x: rest.home.x, z: rest.home.z },
      get object() { return clover; },
    },
    get state() { return { accepted, mode: cState.mode, furthest, prints: pts.length, finished, atRest: act.reindeer.atRest, clover: clover.visible, restShown: rest.shown }; },
    rest,
    budget() {
      return {
        calls: 4 + (prints.visible ? 1 : 0),
        tris: { rest: rest.triangles, clover: (geos.body.attributes.position.count + geos.leg.attributes.position.count * 4) / 3, prints: (pGeo.attributes.position.count / 3) * NP },
      };
    },
    toClover() { player.teleport(find.x - 0.5, find.z + 0.2, 0); },
    home() { player.teleport(rest.door.x, rest.door.z, Math.PI); },
    async selfTest(T) {
      await T.talk(n); // accept
      T.check(accepted && printsOn, 'reindeer: Pepper accepted, trail lit');
      T.step(4);
      // walk the prints: the furthest reached advances and the objective points ahead
      const mid = pts[Math.floor(NP / 2)];
      for (let i = 0; i < NP; i += 6) { const p = pts[i]; T.teleport(p.x, p.z); T.step(2); }
      T.teleport(mid.x, mid.z); T.step(3);
      T.check(furthest > 10, `reindeer: furthest print advanced (${furthest})`);
      T.teleport(find.x - 0.6, find.z); T.step(45); // let the lakeside pop up
      await T.go(find.x - 0.4, find.z, 'clover-hello');
      T.step(30);
      T.check(cState.mode === 'follow', `reindeer: Clover follows (${cState.mode})`);
      await T.go(rest.door.x, rest.door.z);
      for (let i = 0; i < 200 && env.ds(n) !== 'done'; i++) { T.step(2); await T.tick(0); }
      T.check(env.ds(n) === 'done', 'reindeer: door 15 done after Clover trots into the Rest');
      T.step(10);
      T.check(act.reindeer.atRest, 'reindeer: tasks.reindeer.atRest');
    },
  };
  act.hook = act.reindeer;
  act.dispose = () => { fol.dispose(); engine.scene.remove(prints, clover); rest.dispose(); pGeo.dispose(); try { interact.remove(helloSpot); } catch (e) { /* */ } };
  try {
    (window.__w2 = window.__w2 || {}).reindeer = { get state() { return act.state; }, toClover: () => act.toClover(), home: () => act.home() };
  } catch (e) { /* no window */ }
  act.sync();
  return act;
}
