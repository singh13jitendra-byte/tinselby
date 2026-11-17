// The finale timeline (seconds from tree:starPlaced). Driven by engine time (works with manual stepping), not promises.
// Cues fire once when the timeline passes them; continuous tracks are computed from the timeline every frame.
// Skippable spans jump the timeline forward (all cues in between still fire, silently).
import * as THREE from 'three';
import { Fireworks } from '../core/fx.js';
import { createFlight } from './rig.js';
import { buildGift } from './sleigh.js';
import {
  createCinemaRig, treeStarPose, landingPose, greetPose, giftClosePose, crowdPose, pullbackPose,
} from '../camera/shots.js';

const T = {
  approach: [2.0, 14.0], landed: 14.0, out: [15.0, 16.0], wave: [16.0, 18.6], walk: 16.6, gift: [21.0, 22.0, 22.6],
  gather: 26.5, count: 28.0, newyear: 38.0, hopIn: [38.3, 39.2], lift: [39.5, 51.0], end: 52.0,
};
const SKIPS = [[0.4, T.landed], [44.0, T.end]];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export function createSequence(ctx, rig, trail, overlay, sfx, pxScale) {
  const { engine, game, player, layout } = ctx;
  const L = layout.MARKET.landing;
  const treeP = () => (ctx.city?.tree?.pos ? V(ctx.city.tree.pos.x, 0, ctx.city.tree.pos.z) : V(layout.MARKET.tree.x, 0, layout.MARKET.tree.z));
  const gy = () => ctx.colliders?.heightAt?.(L.x, L.z) || 0;
  let seqT = -1, running = false, jumping = false, fired = 0, fw = null, fwT = 0, fwNext = 0;
  const camRig = createCinemaRig(ctx, { tilt: 1.25, blendIn: 0.9 });
  const scratch = { pos: V(), target: V() };

  // flight paths (world)
  let approach = null, liftoff = null;
  function buildPaths() {
    const g = gy();
    const lp = V(L.x, g, L.z);
    approach = createFlight(new THREE.CatmullRomCurve3([
      V(-27, 9.5, -24), V(-4, 7.2, -14.5), V(6, 7, -11), V(15, 6, 3), V(8, 4, 13), V(-1.4, 1.7, 9.0),
      V(-0.1, 0.45, 5.0), V(0, g + 0.06, 3.3), lp,
    ].map((v, i, a) => (i < a.length - 1 ? v.add(V(L.x, 0, L.z - 2.4)) : v)), false, 'centripetal'), g);
    liftoff = createFlight(new THREE.CatmullRomCurve3([
      lp.clone(), V(L.x + 0.15, g + 0.12, L.z - 0.7), V(L.x + 0.9, 0.9, L.z - 1.8), V(L.x + 2.8, 2.4, L.z - 3.2), V(L.x + 5, 4.6, L.z - 5.6),
      V(L.x + 4, 7.2, L.z - 11.5), V(L.x - 6, 9.6, L.z - 16.5), V(L.x - 22, 12.5, L.z - 27),
    ], false, 'centripetal'), g);
  }

  // positions
  const heading = L.heading ?? Math.PI;
  const sideX = Math.cos(heading), sideZ = -Math.sin(heading); // rig-local +x in world
  const santaSpot = () => V(L.x - sideX * 0.62, gy(), L.z - sideZ * 0.62 - 0.05);
  const meetSpot = () => { const s = santaSpot(); return V(s.x + sideX * -0.5, 0, s.z - sideZ * 0.5 + 0.12); };
  const sleighPos = V();
  const santaFrom = V(), santaTo = V(), giftFrom = V(), qFrom = new THREE.Quaternion(), qTo = new THREE.Quaternion();
  let gift = null, giftFlying = false, walk = null, emitAcc = 0;

  function sleighWorld() { return sleighPos.copy(rig.group.position).add(V(0, 0.3, 0)); }
  function giftWorld(out) { if (gift) gift.getWorldPosition(out); else out.copy(meetSpot()).setY(0.25); return out; }

  function startWalk() {
    const m = meetSpot();
    const pts = [];
    const px = player.pos.x, pz = player.pos.z;
    // keep clear of the reindeer team (it lies along x = L.x, north of the sleigh)
    if (Math.abs(px - L.x) < 0.6 && pz > L.z - 2.8 && pz < L.z + 0.6) pts.push([m.x + 0.1, pz]);
    pts.push([m.x, m.z]);
    walk = { pts, i: 0, t: 0 };
    player.walkTo(pts[0][0], pts[0][1]);
  }
  function updateWalk(dt) {
    if (!walk) return;
    walk.t += dt;
    const [x, z] = walk.pts[walk.i];
    if (Math.hypot(player.pos.x - x, player.pos.z - z) < 0.09) {
      walk.i++;
      if (walk.i >= walk.pts.length) { arrive(); return; }
      player.walkTo(walk.pts[walk.i][0], walk.pts[walk.i][1]);
    } else if (walk.t > 4.6) { // blocked by a collider: just place the player
      const m = meetSpot();
      player.teleport(m.x, m.z);
      arrive();
    }
  }
  function arrive() {
    walk = null;
    const m = meetSpot();
    player.walkTo(player.pos.x, player.pos.z); // cancel any script cleanly
    const s = santaSpot();
    player.faceTowards(s.x, s.z);
    void m;
  }

  // -------------------------------------------------------------- cues
  const cues = [
    [0, () => {
      game.state.phase = 'finale';
      player.controllable = false;
      player.vel.set(0, 0);
      player.walkTo(player.pos.x, player.pos.z);
      ctx.teasers?.stop();
      buildPaths();
      const tp = treeP();
      player.faceTowards(tp.x, tp.z);
      camRig.start();
      camRig.cut(treeStarPose(ctx), 0);
      game.emit('finale:start', {});
      sfx('bell', { vol: 0.8 });
    }],
    [T.approach[0], () => {
      rig.santaIn(); rig.santa.pose = 'sit';
      rig.group.scale.setScalar(1);
      rig.group.visible = true;
      rig.team.mode = 'fly'; rig.team.blend = 1;
      approach.reset();
      game.emit('santa:arrive', {});
      sfx('sleighBells', { vol: 0.9 });
    }],
    [3.6, () => sfx('whoosh', { vol: 0.6 })],
    [5.5, () => camRig.cut(landingPose(ctx, sleighWorld, 9), 1.6)],
    [6.0, () => { // make sure the player is at the market for the meeting
      if (Math.hypot(player.pos.x - L.x, player.pos.z - L.z) > 5.5) {
        const tp = treeP();
        player.teleport(tp.x + 1.2, tp.z + 1.6);
        player.faceTowards(L.x, L.z);
      }
    }],
    [8.0, () => sfx('sleighBells', { vol: 1 })],
    [10.6, () => sfx('whoosh', { vol: 0.8 })],
    [12.4, () => { rig.team.mode = 'gallop'; }],
    [T.landed, () => {
      rig.team.mode = 'stand';
      approach.pose(rig, 1, 1 / 30);
      rig.place(V(L.x, gy(), L.z), heading, 0, 0);
      if (!jumping) trail.puff(engine.time, V(L.x, gy() + 0.05, L.z), 60, new THREE.Color('#fff6ea'), 0.7, 1.6);
      game.emit('santa:landed', {});
      sfx('pop', { vol: 0.7 });
    }],
    [14.5, () => camRig.cut(greetPose(ctx, santaSpot, () => player.pos), 1.8)],
    [T.out[0], () => {
      rig.santaOut();
      santaFrom.copy(rig.santa.group.position);
      santaTo.copy(santaSpot());
      rig.santa.pose = 'stand';
    }],
    [T.wave[0], () => { rig.santa.pose = 'wave'; sfx('hohoho', { vol: 1 }); }],
    [T.walk, () => startWalk()],
    [T.wave[1], () => { rig.santa.pose = 'stand'; }],
    [20.6, () => { if (walk) { const m = meetSpot(); player.teleport(m.x, m.z); arrive(); } }],
    [20.8, () => camRig.cut(giftClosePose(ctx, giftWorld, () => player.heading), 1.5)],
    [T.gift[0], () => {
      gift = buildGift(engine.mat, game.state.playerName || 'you');
      gift.scale.setScalar(0.01);
      rig.santa.hands.add(gift);
      gift.position.set(0, 0.0, 0.0);
      rig.santa.pose = 'give';
      sfx('pickup', { vol: 0.6 });
    }],
    [T.gift[1], () => {
      engine.scene.attach(gift);
      giftFrom.copy(gift.position);
      qFrom.copy(gift.quaternion);
      giftFlying = true;
    }],
    [T.gift[2], () => {
      giftFlying = false;
      gift.scale.setScalar(1);
      player.carry(gift);
      gift.rotation.set(0, 0, 0);
      rig.santa.pose = 'stand';
      game.emit('santa:gift', { name: game.state.playerName });
      sfx('gift', { vol: 1 });
      if (!jumping) trail.puff(engine.time, giftWorld(V()), 30, new THREE.Color('#ffd27a'), 0.35, 0.9);
      if (!jumping) overlay.giftTag(game.state.playerName || 'you');
    }],
    [T.gather - 0.3, () => overlay.hideTag()],
    [T.gather, () => {
      const tp = treeP();
      try { ctx.life?.gatherAt?.(tp.x, tp.z, 3.5); } catch (e) { console.warn(e); }
      camRig.cut(crowdPose(ctx), 2.2);
      player.faceTowards(tp.x, tp.z);
      rig.santa.group.rotation.y = Math.atan2(tp.x - rig.santa.group.position.x, tp.z - rig.santa.group.position.z);
    }],
    [T.gather + 0.6, () => { try { ctx.life?.cheer?.(); } catch (e) { /* */ } rig.santa.pose = 'cheer'; sfx('cheer', { vol: 0.7 }); }],
    [T.count - 0.5, () => { rig.santa.pose = 'stand'; }],
    ...Array.from({ length: 10 }, (_, i) => [T.count + i, () => {
      const n = 10 - i;
      game.emit('countdown', { n });
      if (!jumping) { overlay.countdown(n); sfx('countdown', { vol: 1, n }); }
    }]),
    [T.newyear, () => {
      game.emit('newyear', {});
      overlay.newYear('2027');
      try { ctx.life?.cheer?.(); } catch (e) { /* */ }
      rig.santa.pose = 'cheer';
      sfx('cheer', { vol: 1 });
      fw = fw || new Fireworks(engine.scene, 2600);
      fwT = 0; fwNext = 0;
      for (let i = 0; i < 4; i++) burst(i * 0.18);
      camRig.cut(pullbackPose(ctx, () => (rig.group.visible ? rig.group.position : null), 14), 1.2);
    }],
    [T.hopIn[0], () => {
      santaFrom.copy(rig.santa.group.position);
      rig.seatWorld(santaTo);
      rig.santa.pose = 'stand';
    }],
    [T.hopIn[1], () => { rig.santaIn(); rig.santa.pose = 'wave'; }],
    [T.lift[0], () => {
      liftoff.reset();
      rig.team.mode = 'gallop';
      sfx('sleighBells', { vol: 1 }); sfx('hohoho', { vol: 0.8 });
    }],
    [40.3, () => { rig.team.mode = 'fly'; }],
    [42.0, () => { try { ctx.life?.cheer?.(); } catch (e) { /* */ } sfx('cheer', { vol: 0.6 }); }],
    [46.0, () => { try { ctx.life?.cheer?.(); } catch (e) { /* */ } }],
    [T.lift[1], () => { rig.group.visible = false; }],
    [T.end, () => {
      ctx.cam.setMode('attract'); // slow orbit over the city behind the end card (no cinematic shot left running)
      camRig.release(3.5);
      game.state.phase = 'end';
      overlay.endCard(game.state.playerName || 'Traveller', () => location.reload());
      game.emit('game:end', {});
    }],
  ].sort((a, b) => a[0] - b[0]);

  function burst(delay = 0) {
    const tp = treeP();
    const x = tp.x + (Math.random() - 0.5) * 11, z = tp.z - 1 - Math.random() * 5, y = 2.9 + Math.random() * 2.4;
    fw.burst(fwT + delay, x, y, z);
    if (!jumping) sfx('firework', { x, z, vol: 0.55 });
  }

  function fireUpTo(t) {
    while (fired < cues.length && cues[fired][0] <= t) {
      const fn = cues[fired][1];
      fired++;
      try { fn(); } catch (e) { console.error('[finale cue]', e); }
    }
  }

  // -------------------------------------------------------------- per-frame tracks
  function tracks(dt) {
    const t = seqT;
    // sleigh flight
    const flying = (t >= T.approach[0] && t < T.landed) || (t >= T.lift[0] && t < T.lift[1]);
    if (t >= T.approach[0] && t < T.landed) {
      const s = (t - T.approach[0]) / (T.approach[1] - T.approach[0]);
      approach.pose(rig, 1 - (1 - s) * (1 - s), dt);
    } else if (t >= T.landed && t < T.lift[0]) {
      const b = t - T.landed;
      rig.tilt.position.y = b < 0.8 ? Math.sin(b * 14) * 0.03 * (1 - b / 0.8) : 0;
      rig.tilt.rotation.x = b < 0.8 ? Math.sin(b * 11) * 0.02 * (1 - b / 0.8) : 0;
    } else if (t >= T.lift[0] && t < T.lift[1]) {
      const s = (t - T.lift[0]) / (T.lift[1] - T.lift[0]);
      rig.tilt.position.y = 0;
      liftoff.pose(rig, s * s * (1.6 - 0.6 * s), dt);
    }
    if (rig.group.visible) {
      rig.team.update(dt, flying ? 1.1 : 1);
      if (flying && !jumping) {
        emitAcc += dt * 80;
        if (emitAcc >= 1) {
          const n = Math.floor(emitAcc); emitAcc -= n;
          trail.emit(engine.time, rig.world(rig.rearLocal), Math.ceil(n * 0.6), 0.12, 1.0, null, 0.02);
          for (const r of rig.runnerLocal) trail.emit(engine.time, rig.world(r), Math.ceil(n * 0.2), 0.05, 0.8, null, 0.0);
        }
      }
    }
    rig.santa.update(dt);
    // santa hops out / back in
    const sg = rig.santa.group;
    if (t >= T.out[0] && t < T.out[1] + 0.05 && sg.parent === engine.scene) {
      const k = ss((t - T.out[0]) / (T.out[1] - T.out[0]));
      sg.position.lerpVectors(santaFrom, santaTo, k);
      sg.position.y += Math.sin(k * Math.PI) * 0.22;
      const m = meetSpot();
      sg.rotation.set(0, lerpAngle(heading, Math.atan2(m.x - santaTo.x, m.z - santaTo.z), k), 0);
      rig.santa.walk = 1 - k;
    } else if (t >= T.hopIn[0] && t < T.hopIn[1] && sg.parent === engine.scene) {
      const k = ss((t - T.hopIn[0]) / (T.hopIn[1] - T.hopIn[0]));
      rig.seatWorld(santaTo);
      sg.position.lerpVectors(santaFrom, santaTo, k);
      sg.position.y += Math.sin(k * Math.PI) * 0.25;
      sg.rotation.y = lerpAngle(sg.rotation.y, heading, k);
    }
    if (t >= T.walk && t < T.gather && sg.parent === engine.scene && rig.santa.pose !== 'wave') {
      sg.rotation.y = lerpAngle(sg.rotation.y, Math.atan2(player.pos.x - sg.position.x, player.pos.z - sg.position.z), 1 - Math.exp(-dt * 4));
    }
    updateWalk(dt);
    // gift: pop in, then fly from Santa's hands to the player's
    if (gift && t >= T.gift[0] && t < T.gift[1]) gift.scale.setScalar(Math.max(0.01, ss((t - T.gift[0]) / 0.35)));
    if (gift && giftFlying) {
      const k = ss((t - T.gift[1]) / (T.gift[2] - T.gift[1]));
      const hands = player.character.hands;
      const to = hands.getWorldPosition(V());
      hands.getWorldQuaternion(qTo);
      gift.position.lerpVectors(giftFrom, to, k);
      gift.position.y += Math.sin(k * Math.PI) * 0.12;
      gift.quaternion.slerpQuaternions(qFrom, qTo, k);
    }
    // fireworks
    if (fw) {
      fwT += dt;
      if (fwT >= fwNext) {
        burst();
        if (Math.random() < 0.35) burst(0.2);
        fwNext = fwT + (t < 47 ? 0.28 + Math.random() * 0.35 : t < T.end ? 0.6 + Math.random() * 0.6 : 1.0 + Math.random() * 1.3);
      }
      const tp = treeP();
      fw.update(fwT, tp.x, tp.z, pxScale());
    }
  }

  // -------------------------------------------------------------- skip input
  function skippable() { return SKIPS.find(([a, b]) => seqT >= a && seqT < b - 0.3); }
  function trySkip() {
    const s = running && skippable();
    if (s) jumpTo(s[1]);
  }
  window.addEventListener('pointerdown', (e) => { if (e.target?.closest?.('button')) return; trySkip(); });
  window.addEventListener('keydown', (e) => { if ([' ', 'Enter', 'Escape', 'e', 'E'].includes(e.key)) trySkip(); });

  /** Jump the timeline forward to t (fires all cues in between, without sfx/overlays). */
  function jumpTo(t) {
    if (!running || t <= seqT) return;
    jumping = true;
    const step = 1 / 15;
    while (seqT < t) { // coarse sub-steps so tracks (flight smoothing, hops, camera poses) end in the right state
      const d = Math.min(step, t - seqT);
      seqT += d;
      fireUpTo(seqT);
      tracks(d);
      camRig.update(scratch, d);
    }
    jumping = false;
  }

  return {
    get running() { return running; },
    get time() { return seqT; },
    start() {
      if (running) return;
      running = true; seqT = 0; fired = 0;
      fireUpTo(0);
    },
    jumpTo,
    update(dt) {
      if (!running) return;
      seqT += dt;
      fireUpTo(seqT);
      tracks(dt);
    },
  };
}

function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}
