// Door 20: Lanterns for Santa (task `lanterns`, WAVE3.md §Door 20). Ten iron lanterns line the park path (LANTERNS.spots, gate →
// market). Take Mayor Tinsel's taper and light them in any order; once door 20 is done they stay lit for good (and on reload).
// 2 InstancedMeshes (bodies, flames) + the carried taper. `runway.chase()` twinkles the flames gate → market (the finale calls it).
import * as THREE from 'three';
import { LANTERNS } from '../../core/layout.js';
import { lanternGeos, taperGeo } from './props.js';

const N = LANTERNS.spots.length;
const NEAR = 0.7; // light radius
const CHASE_PASSES = 3;
const FLAME_Y = 0.47; // flame centre height in lanternGeos()
const easeOutBack = (u) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };

export default function create(ctx, env) {
  const { engine, game, interact, player, colliders } = ctx;
  const { n } = env;
  const S = game.state;
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };
  const playing = () => S.phase === 'play';
  const revealed = () => { try { return !!ctx.city?.isRevealed?.('park'); } catch (e) { return true; } };
  const busyElsewhere = () => !!ctx.minigames?.active;
  const say = (key) => { if (env.sayOrToast) env.sayOrToast(n, key); else env.say(n, key); };

  // ---- spots: nudge off colliders first (before our own are added), then add the lantern colliders
  const pts = LANTERNS.spots.map(([x, z]) => {
    const p = { x, z };
    try { colliders.resolve(p, 0.1); } catch (e) { /* optional */ }
    return { x: p.x, z: p.z, y: gy(p.x, p.z) };
  });
  const cols = pts.map((p) => { try { return colliders.addCircle(p.x, p.z, 0.07, 'lantern'); } catch (e) { return null; } });

  // ---- meshes
  const geos = lanternGeos();
  const body = new THREE.InstancedMesh(geos.body, engine.mat, N);
  const flame = new THREE.InstancedMesh(geos.flame, engine.mat, N);
  body.castShadow = true; body.receiveShadow = true; flame.castShadow = false; flame.receiveShadow = false;
  body.frustumCulled = false; flame.frustumCulled = false;
  body.visible = false; flame.visible = false;
  engine.scene.add(body, flame);
  const dummy = new THREE.Object3D();
  const rot = pts.map((p, i) => (i * 2.399) % (Math.PI * 2)); // quarter-turns would look stamped: golden-angle spread
  pts.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, rot[i], 0); dummy.scale.setScalar(1); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix); });
  body.instanceMatrix.needsUpdate = true;

  // ---- carried taper
  const tGeo = taperGeo();
  let taper = null;
  const hands = () => (player.carrying && player.carrying !== taper) || !!S.carrying;
  const dropTaper = () => { if (taper && player.carrying === taper) player.carry(null); taper?.removeFromParent(); taper = null; };

  // ---- state
  const lit = new Array(N).fill(false);
  const litT = new Array(N).fill(1); // seconds since lit (pop animation); 1+ = settled
  let accepted = false, finished = false;
  let chase = null; // { t, dur, onEnd[] }
  let clock = 0;
  const count = () => lit.filter(Boolean).length;
  const allLit = () => lit.every(Boolean);
  const active = () => accepted && !finished && env.ds(n) === 'open';

  function setAllLit() { for (let i = 0; i < N; i++) { lit[i] = true; litT[i] = 1; } }
  function resetAll() { dropTaper(); accepted = false; finished = false; chase = null; lit.fill(false); litT.fill(1); }
  function finalLook() { dropTaper(); accepted = true; finished = true; setAllLit(); }

  /** Flames twinkle in sequence from the gate towards the market, 3 passes over `dur` seconds (no-op unless all lit). */
  function startChase(dur = 8) {
    return new Promise((resolve) => {
      if (!allLit() || chase) { resolve(false); return; }
      chase = { t: 0, dur: Math.max(1, dur), onEnd: [resolve] };
      env.sfx('sleighBells', pts[N - 1].x, pts[N - 1].z);
    });
  }

  function light(i) {
    if (lit[i]) return;
    lit[i] = true; litT[i] = 0;
    env.sfx('bell', pts[i].x, pts[i].z);
    const step = count();
    game.emit('task:progress', { id: 'lanterns', step, of: N });
    const k = N - step;
    if (k > 0) { env.toast(`Lantern lit! ${k} to go`, 2000); return; }
    env.toast('All lit! Santa can find his way', 2600);
    dropTaper();
    startChase(4).then(() => {
      if (finished) return;
      finished = true;
      try { ctx.teasers?.sky?.(); } catch (e) { /* optional */ }
      say('done');
      env.taskComplete('lanterns');
      env.completeDoor(n);
      try { env.giver?.hop?.(); } catch (e) { /* */ }
    });
  }

  // ---- interact spots (one per lantern)
  const spots = pts.map((p, i) => interact.add({
    id: 'lantern-' + i, x: p.x, z: p.z, r: NEAR, label: 'Light the lantern', icon: 'lantern',
    enabled: () => playing() && active() && !lit[i] && !chase && !busyElsewhere(),
    onInteract: () => light(i),
  }));

  function update(dt) {
    clock += dt;
    if (env.ds(n) === 'done' && !finished) finalLook();
    else if (finished && !allLit()) setAllLit();
    if (chase) { // runs on the clock even while hidden, so the door can't hang
      chase.t += dt;
      if (chase.t >= chase.dur) { const cbs = chase.onEnd; chase = null; for (const cb of cbs) cb(true); }
    }
    const show = revealed() && !busyElsewhere();
    for (let i = 0; i < N; i++) if (cols[i]) cols[i].enabled = show;
    if (!show) { if (body.visible) { body.visible = false; flame.visible = false; } return; }
    body.visible = true;
    // flames: scale 0 while unlit, pop with overshoot when lit, gentle flicker, chase twinkle
    let any = false;
    for (let i = 0; i < N; i++) {
      let s = 0;
      if (lit[i]) {
        if (litT[i] < 0.5) litT[i] += dt;
        const u = Math.min(1, litT[i] / 0.45);
        s = litT[i] >= 0.45 ? 1 : Math.max(0, easeOutBack(u));
        s *= 1 + Math.sin(clock * 7 + i * 1.9) * 0.05;
        if (chase) {
          const p = ((chase.t / chase.dur) * CHASE_PASSES) % 1 * (N + 3) - 1.5; // wave position along the runway
          const b = Math.max(0, 1 - Math.abs(i - p) / 2.2);
          s *= 1 + 0.75 * b * b;
        }
      }
      if (s > 0.002) {
        any = true;
        const p = pts[i];
        dummy.position.set(p.x, p.y + FLAME_Y * (1 - s), p.z);
        dummy.rotation.set(0, rot[i], 0);
        dummy.scale.setScalar(s);
      } else { dummy.position.set(pts[i].x, pts[i].y, pts[i].z); dummy.scale.setScalar(0); }
      dummy.updateMatrix();
      flame.setMatrixAt(i, dummy.matrix);
    }
    flame.visible = any;
    flame.instanceMatrix.needsUpdate = true;
  }

  const runway = {
    positions: pts.map((p) => ({ x: p.x, z: p.z })),
    get lit() { return lit.slice(); },
    get allLit() { return allLit(); },
    chase(dur = 8) { return startChase(dur); },
  };

  const nearestUnlit = () => {
    let best = -1, bd = 1e9;
    for (let i = 0; i < N; i++) if (!lit[i]) { const d = Math.hypot(player.pos.x - pts[i].x, player.pos.z - pts[i].z); if (d < bd) { bd = d; best = i; } }
    return best;
  };

  const act = {
    id: 'lanterns', n, runway,
    get busy() { return !!chase && !finished; },
    onGiver() {
      if (finished || env.ds(n) === 'done') return;
      if (!accepted) {
        if (hands()) { env.toast('Your hands are full! Put that down first.', 2600); return; }
        accepted = true;
        taper = new THREE.Mesh(tGeo, engine.mat);
        player.carry(taper);
        env.say(n, 'accept');
        game.emit('task:progress', { id: 'lanterns', step: count(), of: N });
        return;
      }
      if (!allLit()) {
        if (!taper && !hands()) { taper = new THREE.Mesh(tGeo, engine.mat); player.carry(taper); } // lost it to another task: hand it back
        env.say(n, 'remind');
      }
    },
    objective() {
      if (!active() || chase) return null;
      const i = nearestUnlit();
      if (i < 0) return null;
      return { id: 'lanterns-light', text: `Light Santa's lanterns (${count()}/${N})`, icon: 'lantern', x: pts[i].x, z: pts[i].z };
    },
    giverLabel: () => null,
    onDoll: () => false, dollLabel: () => null,
    update,
    sync({ reset } = {}) {
      if (reset) resetAll();
      if (env.ds(n) === 'done') finalLook();
    },
    get state() { return { accepted, finished, lit: count(), chasing: !!chase, visible: body.visible, flames: flame.visible }; },
    lightAll() { // debug: accept, then light every lantern at once
      if (!accepted && env.ds(n) !== 'done') act.onGiver();
      if (env.ds(n) === 'done') return;
      for (let i = 0; i < N; i++) light(i);
    },
    chase(dur) { return startChase(dur); },
    budget() { const b = geos.body.attributes.position.count / 3, f = geos.flame.attributes.position.count / 3; return { calls: 2, body: b, flame: f, tris: (b + f) * N }; },
    async selfTest(T) {
      await T.talk(n); // accept
      T.check(accepted && taper && player.carrying === taper, 'lanterns: Mayor accepted, taper in hand');
      for (let i = 0; i < N; i++) {
        await T.go(pts[i].x + 0.3, pts[i].z + 0.15, 'lantern-' + i);
        T.step(3);
        T.check(lit[i], `lanterns: lantern ${i} lit`);
      }
      T.check(allLit(), 'lanterns: all ten lit');
      for (let k = 0; k < 40 && env.ds(n) !== 'done'; k++) { T.step(10); await T.tick(0); }
      T.check(env.ds(n) === 'done', 'lanterns: door 20 done after the chase');
      T.check(ctx.tasks?.lanterns?.allLit === true || runway.allLit, 'lanterns: runway.allLit');
      T.check(!player.carrying, 'lanterns: taper gone');
    },
  };
  act.dispose = () => {
    dropTaper();
    for (const sp of spots) { try { interact.remove(sp); } catch (e) { /* */ } }
    engine.scene.remove(body, flame);
    geos.body.dispose(); geos.flame.dispose(); tGeo.dispose();
  };
  act.hook = { get state() { return act.state; }, lightAll: () => act.lightAll(), chase: (d) => act.chase(d) };
  try { (window.__w3 = window.__w3 || {}).lanterns = act.hook; } catch (e) { /* no window */ }
  act.sync();
  return act;
}
