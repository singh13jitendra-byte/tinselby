// Door 14: Ferris Wheel Gnomes (task). Four felt gnomes hide round Frostmere Lake (GNOMES.hide); coax each one out and it
// joins a conga line behind you (follow.js). Lead all four back to Otto at the ticket booth: they hop onto the wheel one
// by one → taskComplete('gnomes') + completeDoor(14). All four gnomes are ONE InstancedMesh (≈1k tris each) plus one
// instanced sparkle mesh (hint sparkles + the booth pop). Mid-task progress is not saved.
import * as THREE from 'three';
import { cone, sph, torus, xf, merge, FELT, KNIT, GLOSS, GLOW } from '../../core/prims.js';
import { P } from '../../core/yarn.js';
import { GNOMES } from '../../core/layout.js';
import { createFollowers } from './follow.js';

const N = 4;
const NEAR = 3.5; // sparkle + peek distance
const TINTS = ['#ffffff', '#ffe9d4', '#e6efff', '#f1ffdf'];

/** One standing felt gnome, base at y = 0, facing +z, ≈ 0.33 tall, ~1k triangles. */
export function gnomeGeo() {
  const coat = '#4f6f9a', hat = P.red, beard = '#f3efe6', boot = P.woodDark;
  const bead = (r, c, k = FELT) => sph(r, c, k, 6, 4);
  const g = [];
  for (const sx of [-1, 1]) g.push(xf(sph(0.026, boot, FELT, 7, 5), [sx * 0.024, 0.014, 0.012], null, [0.9, 0.6, 1.3])); // boots
  g.push(xf(sph(0.052, coat, FELT, 10, 7), [0, 0.07, 0], null, [1, 1.15, 0.95])); // plump body
  g.push(xf(torus(0.05, 0.008, P.gold, GLOSS, Math.PI * 2, 12, 4), [0, 0.07, 0], [Math.PI / 2, 0, 0])); // belt
  g.push(xf(bead(0.011, P.gold, GLOSS), [0, 0.07, 0.05])); // buckle
  for (const sx of [-1, 1]) {
    g.push(xf(sph(0.016, coat, FELT, 6, 4), [sx * 0.055, 0.085, 0.015], [0.4, 0, sx * 0.5], [0.8, 1.5, 0.8])); // arms
    g.push(xf(bead(0.014, P.pink), [sx * 0.066, 0.065, 0.03])); // mitts
  }
  g.push(xf(sph(0.052, beard, FELT, 10, 7), [0, 0.108, 0.026], null, [1, 1.1, 0.8])); // big beard
  g.push(xf(cone(0.036, 0.06, 8, beard, FELT), [0, 0.07, 0.036], [Math.PI, 0, 0])); // beard tip (points down)
  g.push(xf(bead(0.014, P.pink), [0, 0.128, 0.062], null, [1, 0.9, 1])); // nose
  for (const sx of [-1, 1]) g.push(xf(bead(0.0055, P.ink, GLOSS), [sx * 0.018, 0.145, 0.045])); // eyes
  g.push(xf(torus(0.04, 0.012, hat, KNIT, Math.PI * 2, 12, 4), [0, 0.158, 0], [Math.PI / 2, 0, 0])); // hat band
  g.push(xf(cone(0.043, 0.13, 9, hat, KNIT), [0, 0.22, -0.004], [-0.1, 0, 0])); // hat
  g.push(xf(cone(0.022, 0.07, 7, hat, KNIT), [0, 0.298, -0.02], [-0.55, 0, 0])); // floppy tip
  g.push(xf(bead(0.014, '#f7f3ea'), [0, 0.328, -0.045])); // pom
  return merge(g);
}

/** Tiny sparkle for the hide-spot hint and the booth pop (~200 tris): a ring of glowing beads round a bright core. */
function sparkGeo() {
  const g = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.push(xf(sph(i % 2 ? 0.014 : 0.02, i % 2 ? P.glowSoft : P.gold, GLOW, 5, 4), [Math.cos(a) * 0.17, (i % 3) * 0.05 + 0.04, Math.sin(a) * 0.17]));
  }
  g.push(xf(sph(0.03, P.glowSoft, GLOW, 6, 4), [0, 0.2, 0], null, [1, 1.6, 1]));
  return merge(g);
}

export default function create(ctx, env) {
  const { engine, game, interact, player, colliders, layout } = ctx;
  const { n, models } = env;
  const S = game.state;
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };
  const playing = () => S.phase === 'play';
  const revealed = () => { try { return !!ctx.city?.isRevealed?.('lakeside'); } catch (e) { return true; } };

  // ---- nudge hide spots off colliders (the perf pass may have moved props)
  const spots = GNOMES.hide.map(([x, z, where]) => {
    const p = { x, z };
    try { colliders.resolve(p, 0.1); } catch (e) { /* optional */ }
    return { x: p.x, z: p.z, where };
  });
  const booth = { x: GNOMES.booth.x, z: GNOMES.booth.z };

  // ---- meshes
  const geo = gnomeGeo();
  const mesh = new THREE.InstancedMesh(geo, engine.mat, N);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  TINTS.forEach((c, i) => mesh.setColorAt(i, new THREE.Color(c)));
  const sGeo = sparkGeo();
  const spark = new THREE.InstancedMesh(sGeo, engine.mat, N); // one per gnome: hide-spot hint, later the booth pop
  spark.frustumCulled = false; spark.castShadow = false;
  mesh.visible = false; spark.visible = false;
  engine.scene.add(mesh, spark);
  const dummy = new THREE.Object3D();
  const hideM = new THREE.Matrix4().makeScale(0, 0, 0);

  const fol = createFollowers(ctx, { spacing: 0.35 });
  const gn = spots.map((s, i) => ({
    i, spot: s, state: 'hide', sp: 0, // sparkle scale 0..1
    f: { x: s.x, z: s.z, y: gy(s.x, s.z), h: Math.atan2(-s.x, -s.z), speed: 0, visible: true },
    t: 0, from: null, pop: -1, delay: 0, bob: i * 1.7, peek: 0, scale: 1,
  }));
  let accepted = false, delivering = false, finished = false;
  const found = () => gn.filter((g) => g.state === 'follow' || g.state === 'hop').length;
  const left = () => gn.filter((g) => g.state === 'hide').length;
  const giverPos = () => { const g = env.giver; return g ? { x: g.x, z: g.z } : { x: layout.DOOR_SPOTS[n].x, z: layout.DOOR_SPOTS[n].z }; };

  function resetAll() {
    fol.clear();
    accepted = false; delivering = false; finished = false;
    for (const g of gn) {
      g.state = 'hide'; g.sp = 0; g.pop = -1; g.scale = 1; g.peek = 0;
      g.f.x = g.spot.x; g.f.z = g.spot.z; g.f.y = gy(g.spot.x, g.spot.z); g.f.hold = false; g.f.lift = 0;
    }
  }
  function finalLook() { // door done → the gnomes are back "on the wheel"
    fol.clear();
    for (const g of gn) { g.state = 'gone'; g.pop = -1; }
    accepted = true; delivering = false; finished = true;
  }

  // ---- interact spots (one per gnome)
  const spotsI = gn.map((g) => interact.add({
    id: 'gnome-' + g.i, x: g.spot.x, z: g.spot.z, r: 0.7, label: 'Coax the gnome', icon: 'gnome',
    enabled: () => playing() && accepted && !delivering && g.state === 'hide' && env.ds(n) === 'open' && !ctx.minigames?.active,
    onInteract: () => coax(g),
  }));

  function coax(g) {
    if (g.state !== 'hide') return;
    g.state = 'hop'; g.t = 0; g.from = { x: g.f.x, z: g.f.z };
    g.f.hold = true;
    fol.add(g.f);
    env.sfx('pop', g.spot.x, g.spot.z);
    const k = left();
    const step = N - k;
    game.emit('task:progress', { id: 'gnomes', step, of: N });
    if (k > 0) env.toast(`Gnome found! ${k} to go`, 2200);
    else env.toast('All four found! Back to Otto', 2600);
  }

  function startDelivery() {
    if (delivering || finished) return;
    const order = fol.list.slice();
    if (order.length < N || gn.some((g) => g.state !== 'follow')) return;
    delivering = true;
    gn.filter((g) => g.state === 'follow').forEach((g, k) => { g.state = 'wait'; g.delay = 0.15 + k * 0.55; g.f.hold = true; });
    env.sfx('bell', booth.x, booth.z);
  }

  function finishTask() {
    finished = true; delivering = false;
    env.taskComplete('gnomes');
    env.completeDoor(n);
    env.say(n, 'done');
    try { env.giver?.hop?.(); } catch (e) { /* */ }
  }

  // ---- per-frame
  const rise = (u) => Math.sin(Math.min(1, u) * Math.PI);
  let nSpark = 0;
  function update(dt, t) {
    const s = env.ds(n);
    if (s === 'done' && !finished) finalLook();
    const show = revealed() && (s === 'open' || delivering) && !finished && playing(); // hidden during mini-games (one hides on the skate pier)
    if (!show) {
      if (mesh.visible) { mesh.visible = false; spark.visible = false; }
      fol.update(dt);
      return;
    }
    fol.update(dt);
    mesh.visible = true; spark.visible = true;
    const px = player.pos.x, pz = player.pos.z;
    nSpark = 0;
    for (const g of gn) {
      const f = g.f;
      let vis = f.visible, scl = g.scale, lift = 0, tilt = 0, yaw = f.h;
      if (g.state === 'hide') {
        const d = Math.hypot(px - g.spot.x, pz - g.spot.z);
        const near = d < NEAR;
        g.peek += ((near ? 1 : 0) - g.peek) * Math.min(1, dt * 4);
        g.sp += ((near ? 1 : 0) - g.sp) * Math.min(1, dt * 5);
        f.x = g.spot.x; f.z = g.spot.z;
        f.y = gy(f.x, f.z);
        // turn to look at the player when close; peek up a little (rise) when near
        if (near) { let dy = Math.atan2(px - f.x, pz - f.z) - f.h; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); f.h += dy * Math.min(1, dt * 6); }
        yaw = f.h;
        lift = Math.sin(t * 3 + g.bob) * 0.004 * g.peek;
        scl = 0.9 + 0.1 * g.peek;
        tilt = Math.sin(t * 2.2 + g.bob) * 0.08 * g.peek;
        vis = true;
      } else if (g.state === 'hop') {
        g.t += dt;
        const u = Math.min(1, g.t / 0.6);
        f.x = g.from.x + (f.tx - g.from.x) * u; f.z = g.from.z + (f.tz - g.from.z) * u;
        f.y = gy(f.x, f.z);
        lift = rise(u) * 0.2;
        yaw = Math.atan2(f.tx - g.from.x, f.tz - g.from.z);
        f.h = yaw;
        g.sp += (0 - g.sp) * Math.min(1, dt * 8);
        if (u >= 1) { g.state = 'follow'; f.hold = false; }
      } else if (g.state === 'follow') {
        const w = Math.min(1, f.speed / 1.2);
        const ph = t * 11 + g.bob;
        lift = Math.abs(Math.sin(ph)) * 0.018 * w;
        tilt = Math.sin(ph) * 0.14 * w;
        g.sp += (0 - g.sp) * Math.min(1, dt * 8);
      } else if (g.state === 'wait') {
        g.delay -= dt;
        if (g.delay <= 0) {
          fol.remove(f);
          g.state = 'deliver'; g.t = 0; g.from = { x: f.x, z: f.z, y: f.y };
          env.sfx('whoosh', f.x, f.z);
        }
        tilt = Math.sin(t * 14 + g.bob) * 0.12; lift = Math.abs(Math.sin(t * 9 + g.bob)) * 0.012;
      } else if (g.state === 'deliver') {
        g.t += dt;
        const u = Math.min(1, g.t / 0.95);
        const e = u * u * (3 - 2 * u);
        f.x = g.from.x + (booth.x - g.from.x) * e; f.z = g.from.z + (booth.z - g.from.z) * e;
        const gyb = gy(booth.x, booth.z) + 0.55; // up towards the wheel's cabin
        f.y = g.from.y + (gyb - g.from.y) * e * 0.35;
        lift = rise(u) * 0.55;
        tilt = Math.sin(u * 14) * 0.2;
        f.h = Math.atan2(booth.x - g.from.x, booth.z - g.from.z);
        if (u >= 1) { g.state = 'pop'; g.pop = 0; env.sfx('pop', booth.x, booth.z); }
      } else if (g.state === 'pop') {
        g.pop += dt;
        scl = Math.max(0.001, 1 - g.pop / 0.3);
        f.x = booth.x; f.z = booth.z; f.y = gy(booth.x, booth.z) + 0.33;
        if (g.pop > 0.3) g.state = 'gone';
      } else if (g.state === 'gone') vis = false;

      // instance matrix
      if (vis && g.state !== 'gone') {
        dummy.position.set(f.x, f.y + lift, f.z);
        dummy.rotation.set(0, yaw, tilt);
        dummy.scale.setScalar(scl);
        dummy.updateMatrix();
        mesh.setMatrixAt(g.i, dummy.matrix);
      } else mesh.setMatrixAt(g.i, hideM);
      // hide-spot sparkle (index i) and booth pop sparkle (index 4 + i)
      let popped = false;
      const hid = g.sp > 0.02 && g.state === 'hide';
      if (hid) {
        dummy.position.set(g.spot.x, g.f.y + 0.02, g.spot.z);
        dummy.rotation.set(0, t * 1.4 + g.i, 0);
        dummy.scale.setScalar(g.sp * (1 + Math.sin(t * 5 + g.i) * 0.08));
        dummy.updateMatrix();
        spark.setMatrixAt(g.i, dummy.matrix);
      } else spark.setMatrixAt(g.i, hideM);
      if (g.state === 'pop' || (g.state === 'gone' && g.pop >= 0 && g.pop < 0.9)) {
        if (g.state === 'gone') g.pop += dt;
        const u = Math.min(1, g.pop / 0.9);
        dummy.position.set(booth.x, gy(booth.x, booth.z) + 0.3, booth.z);
        dummy.rotation.set(0, t * 4 + g.i, 0);
        dummy.scale.setScalar(Math.sin(u * Math.PI) * 2.6 + 0.001);
        dummy.updateMatrix();
        spark.setMatrixAt(g.i, dummy.matrix);
        popped = true;
      } else if (!hid) spark.setMatrixAt(g.i, hideM);
    }
    mesh.instanceMatrix.needsUpdate = true;
    spark.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // lead the line home
    if (!delivering && !finished && accepted && gn.every((g) => g.state === 'follow')) {
      const o = giverPos();
      if (playing() && Math.hypot(px - o.x, pz - o.z) < 1.2) startDelivery();
    }
    if (delivering && gn.every((g) => g.state === 'gone' && g.pop > 0.9)) {
      if (!finished) finishTask();
    }
  }

  const act = {
    id: 'gnomes', n,
    get busy() { return delivering; },
    onGiver() {
      if (finished) return;
      if (!accepted) {
        accepted = true;
        env.say(n, 'accept');
        game.emit('task:progress', { id: 'gnomes', step: 0, of: N });
        return;
      }
      if (gn.every((g) => g.state === 'follow')) { startDelivery(); return; }
      env.say(n, 'remind');
    },
    objective() {
      if (!accepted || finished || env.ds(n) !== 'open') return null;
      const o = giverPos();
      if (delivering || gn.every((g) => g.state === 'follow')) return { id: 'gnomes-lead', text: 'Lead the gnomes to Otto', icon: 'gnome', x: o.x, z: o.z };
      let best = null, bd = 1e9;
      for (const g of gn) if (g.state === 'hide') { const d = Math.hypot(player.pos.x - g.spot.x, player.pos.z - g.spot.z); if (d < bd) { bd = d; best = g; } }
      if (!best) return { id: 'gnomes-lead', text: 'Lead the gnomes to Otto', icon: 'gnome', x: o.x, z: o.z };
      return { id: 'gnomes-find', text: `Find the gnomes (${N - left()}/${N})`, icon: 'gnome', x: best.spot.x, z: best.spot.z };
    },
    giverLabel: () => null,
    update,
    sync({ reset } = {}) {
      if (reset) { resetAll(); }
      if (env.ds(n) === 'done') finalLook();
      else if (reset === undefined && finished) { /* nothing */ }
    },
    /** Test / debug state (see window.__w2.gnomes). */
    get state() { return { accepted, found: found(), left: left(), delivering, finished, states: gn.map((g) => g.state), visible: mesh.visible }; },
    visibleCount() { return mesh.visible ? gn.filter((g) => g.state !== 'gone').length : 0; },
    foldGnomes: () => gn,
    foundAll() { // debug: accept, then coax every gnome at once
      if (!accepted) act.onGiver();
      for (const g of gn) if (g.state === 'hide') coax(g);
    },
    budget() { return { calls: 2, gnome: geo.attributes.position.count / 3, sparkle: sGeo.attributes.position.count / 3, tris: (geo.attributes.position.count / 3 + sGeo.attributes.position.count / 3) * N }; },
    async selfTest(T) {
      await T.talk(n); // accept
      T.check(accepted, 'gnomes: Otto accepted the task');
      for (let i = 0; i < N; i++) {
        const sp = gn[i].spot;
        await T.go(sp.x, sp.z, 'gnome-' + i);
        T.step(25);
      }
      T.check(found() === N, `gnomes: all ${N} found (${found()})`);
      T.step(20);
      const o = giverPos();
      await T.go(o.x + 0.3, o.z + 0.4);
      for (let i = 0; i < 200 && env.ds(n) !== 'done'; i++) { T.step(2); await T.tick(0); }
      T.check(env.ds(n) === 'done', 'gnomes: door 14 done after delivering the line');
      T.step(10);
      T.check(act.visibleCount() === 0 && !mesh.visible, 'gnomes: none left visible');
    },
  };
  act.dispose = () => { fol.dispose(); engine.scene.remove(mesh, spark); geo.dispose(); sGeo.dispose(); for (const sp of spotsI) { try { interact.remove(sp); } catch (e) { /* */ } } };
  act.hook = { get state() { return act.state; }, foundAll: () => act.foundAll() };
  try { (window.__w2 = window.__w2 || {}).gnomes = act.hook; } catch (e) { /* no window */ }
  act.sync();
  return act;
}
