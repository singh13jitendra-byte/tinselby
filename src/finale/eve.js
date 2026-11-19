// Wave 3: the Christmas Eve finale (WAVE3.md §Door 24), a restartable ~63 s timeline. Same structure as sequence.js
// (cues fire once as the timeline passes them; continuous tracks are computed from the timeline every frame; skips and
// jumpTo sub-step through everything silently), but every run starts from reset() and ends in free play via exit().
//
//   0.0  star moment (or, on a replay, straight to the crowd)      21.5  Clover trots into the empty harness (24.2 in)
//   0.8  the town and your friends gather round the tree           25.5  Santa greets you, walks over, gives the gift
//   3.5  Town Spirit banner, sparkles stream up to the star        35.2  the wished-for piece goes on (finaleGift)
//   9.0  Santa's approach over the lantern runway, lands at 21.0   39–48 countdown · 49 Merry Christmas + fireworks
//  50.5  liftoff with the full team · 63.0 end card (Keep exploring / Watch again)
// Without Clover (door 15 not done) every cue from 25.5 runs 4 s earlier (end card at 59).
import * as THREE from 'three';
import { Fireworks } from '../core/fx.js';
import { createFlight } from './rig.js';
import { buildGift } from './gift.js';
import { createCloverDouble, polyline } from './clover.js';
import { treeAt, spiritPose, cloverPose, dressPose, runwayPose, countPose } from './poses.js';
import { backToPlay } from './play.js';
import {
  createCinemaRig, treeStarPose, greetPose, giftClosePose, giftOpenPose, crowdPose, pullbackPose,
} from '../camera/shots.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const easeOut = (x) => { x = Math.min(1, Math.max(0, x)); return 1 - Math.pow(1 - x, 3); };
const GIFT_YAW = Math.PI / 2;
const qGift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), GIFT_YAW);
const EVE_FALLBACK = {
  gather: [], cloverFromRest: [[7.53, 9.19], [6.5, 8.0], [5.0, 7.6], [2.8, 7.3], [1.0, 7.0], [0.4, 6.3], [0.5, 5.3], [1.0, 4.3], [1.55, 3.55]],
  cloverWait: { x: 1.55, z: 3.55 }, cloverPath: [[1.55, 3.55], [0.95, 2.0], [0.6, 1.05], [0.19, 0.88]], teamSlot: 2,
  netRing: { r: 4.4, a0: -1.2, a1: 1.2 },
};
const CLOVER_SPEED = [1.4, 1.3]; // from the Rest to the waiting spot, then into the harness

/** Cue times for one run (seconds from the star). */
export function eveTimes(clover) {
  const s = (t) => (!clover && t >= 25.5 ? t - 4 : t);
  return {
    gather: 0.8, cheer: 1.4, spirit: 3.5, flare: 6.0, spiritHide: 8.5,
    approach: [9.0, 21.0], landed: 21.0, cloverGo: 21.5, cloverIn: 24.2,
    greet: s(25.5), faceSanta: s(26.0), out: [s(26.0), s(27.0)], wave: [s(27.0), s(29.6)], walk: s(27.6), walkForce: s(31.6),
    giftClose: s(31.8), gift: [s(32.0), s(33.0), s(33.6)], openCut: s(33.9), open: [s(34.0), s(34.8)], dress: s(35.2), wear: s(35.6),
    hideTag: s(37.2), crowd: s(37.5), count: s(39.0), christmas: s(49.0), hopIn: [s(49.3), s(50.2)], lift: [s(50.5), s(62.0)],
    fly: s(51.3), fwCalm: s(58.0), end: s(63.0),
    skips: [[0.4, 21.0], [s(55.0), s(63.0)]],
  };
}

export function createEve(ctx, rig, trail, overlay, sfx, pxScale) {
  const { engine, game, player, layout } = ctx;
  const L = layout.MARKET.landing;
  const E = { ...EVE_FALLBACK, ...(layout.EVE || {}) };
  const heading = L.heading ?? Math.PI;
  const sideX = Math.cos(heading), sideZ = -Math.sin(heading); // rig-local +x in world
  const gyAt = (x, z) => { try { return ctx.colliders?.heightAt?.(x, z) || 0; } catch (e) { return 0; } };
  const gy = () => gyAt(L.x, L.z);
  const treeP = () => { const t = treeAt(ctx); return V(t.x, 0, t.z); };
  const safe = (label, fn) => { try { return fn(); } catch (e) { console.warn('[eve] ' + label, e); return undefined; } };
  const tasks = () => ctx.tasks || null;
  const reindeerApi = () => safe('reindeer', () => tasks()?.reindeer) || null;
  const scratch = { pos: V(), target: V() };
  const cloverDouble = createCloverDouble(engine);
  const path1 = polyline(E.cloverFromRest), path2 = polyline(E.cloverPath);

  let run = null; // per-run state (null = idle)
  let fw = null, fwFade = -1; // fireworks: one pool, faded out and disposed after exit

  // -------------------------------------------------------------- places
  const santaSpot = () => V(L.x - sideX * 0.62, gy(), L.z - sideZ * 0.62 - 0.05);
  const meetSpot = () => { const s = santaSpot(); return V(s.x + sideX * -0.5, 0, s.z - sideZ * 0.5 + 0.12); };
  const sleighPos = V();
  const sleighWorld = () => sleighPos.copy(rig.group.position).add(V(0, 0.3, 0));
  const qTmp = new THREE.Quaternion();
  const giftWorld = (out) => { if (run?.gift) run.gift.getWorldPosition(out); else out.copy(meetSpot()).setY(0.25); return out; };
  const giftFront = (out) => { out.set(0, 0, 1); if (run?.gift) out.applyQuaternion(run.gift.getWorldQuaternion(qTmp)); return out; };
  const giftInside = (out) => { const g = run?.gift; if (g?.userData.inside) g.userData.inside.getWorldPosition(out); else giftWorld(out); return out; };
  const santaHead = () => rig.santa.group.getWorldPosition(V()).add(V(0, 0.62, 0));

  function buildPaths() {
    const g = gy();
    const lp = V(L.x, g, L.z);
    const o = V(L.x, 0, L.z - 2.4);
    // a wide swing round the town, then in over the park gate and low along the lantern runway (x = 0) to the rug
    run.approach = createFlight(new THREE.CatmullRomCurve3([
      V(-22, 9.5, -20), V(-4, 8, -13.5), V(9, 7.2, -8), V(15.5, 6.2, 4), V(10.5, 5.2, 15), V(3.6, 4.2, 20), V(0.25, 3.3, 18.3),
      V(0, 2.3, 14.2), V(0, 1.35, 10.2), V(0, 0.66, 6.4), V(0, g + 0.06, 3.3),
    ].map((v) => v.add(o)).concat([lp]), false, 'centripetal'), g);
    run.liftoff = createFlight(new THREE.CatmullRomCurve3([
      lp.clone(), V(L.x + 0.15, g + 0.12, L.z - 0.7), V(L.x + 0.9, 0.9, L.z - 1.8), V(L.x + 2.8, 2.4, L.z - 3.2), V(L.x + 5, 4.6, L.z - 5.6),
      V(L.x + 4, 7.2, L.z - 11.5), V(L.x - 6, 9.6, L.z - 16.5), V(L.x - 22, 12.5, L.z - 27),
    ], false, 'centripetal'), g);
  }

  // -------------------------------------------------------------- the player's walk to Santa (as sequence.js)
  function startWalk() {
    const m = meetSpot();
    const pts = [];
    const px = player.pos.x, pz = player.pos.z;
    if (Math.abs(px - L.x) < 0.6 && pz > L.z - 2.8 && pz < L.z + 0.6) pts.push([m.x + 0.1, pz]); // keep clear of the team
    pts.push([m.x, m.z]);
    run.walk = { pts, i: 0, t: 0 };
    player.walkTo(pts[0][0], pts[0][1]);
  }
  function updateWalk(dt) {
    const w = run.walk;
    if (!w) return;
    w.t += dt;
    const [x, z] = w.pts[w.i];
    if (Math.hypot(player.pos.x - x, player.pos.z - z) < 0.09) {
      w.i++;
      if (w.i >= w.pts.length) { arrive(); return; }
      player.walkTo(w.pts[w.i][0], w.pts[w.i][1]);
    } else if (w.t > 4.6) { const m = meetSpot(); player.teleport(m.x, m.z); arrive(); }
  }
  function arrive() {
    run.walk = null;
    player.walkTo(player.pos.x, player.pos.z);
    const s = santaSpot();
    player.faceTowards(s.x, s.z);
  }

  // -------------------------------------------------------------- Town Spirit sparkle sources
  function spiritSources() {
    const tp = treeP();
    const src = [];
    const mayor = tasks()?.givers?.[24];
    const seen = new Set();
    for (const g of Object.values(tasks()?.givers || {})) {
      if (!g || seen.has(g) || g === mayor || !g.root) continue;
      seen.add(g);
      if (g.root.visible === false) continue;
      const p = g.root.getWorldPosition(V());
      if (Math.hypot(p.x - tp.x, p.z - tp.z) < 7) src.push(p.setY(p.y + 0.42));
    }
    // remote players' dolls on the net ring (net.gather draws them there)
    const ring = E.netRing;
    const n = Math.min(12, safe('net.players', () => ctx.net?.players?.().length) || 0);
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? (ring.a0 + ring.a1) / 2 : ring.a0 + ((ring.a1 - ring.a0) * i) / (n - 1);
      src.push(V(tp.x + Math.sin(a) * ring.r, 0.45, tp.z + Math.cos(a) * ring.r));
    }
    src.push(player.pos.clone().setY(player.pos.y + 0.5));
    // a thin crowd (no gather API yet / few friends): the town itself sends its sparkles from a ring round the tree
    for (let i = 0; src.length < 10; i++) {
      const a = -1.9 + (i * 3.8) / 7 + 0.15;
      src.push(V(tp.x + Math.sin(a) * 3.4, 0.45, tp.z + Math.cos(a) * 3.4));
    }
    return src.slice(0, 28);
  }

  function spiritStreams(t, dt) {
    const st = run.streams;
    if (!st || run.jumping) return;
    const star = treeAt(ctx).star;
    const rate = Math.min(24, 520 / (st.src.length * 2));
    for (let i = 0; i < st.src.length; i++) {
      const p0 = st.src[i];
      for (let w = 0; w < 2; w++) {
        const t0 = T().spirit + 0.25 + (i % 7) * 0.09 + Math.floor(i / 7) * 0.06 + w * 1.0;
        const u = (t - t0) / 1.9;
        if (u < 0 || u > 1) continue;
        st.acc[i * 2 + w] = (st.acc[i * 2 + w] || 0) + dt * rate;
        const nE = Math.floor(st.acc[i * 2 + w]);
        if (!nE) continue;
        st.acc[i * 2 + w] -= nE;
        const e = easeOut(u * 0.9 + 0.1 * u * u);
        // quadratic arc: up and inwards, bowing outwards from the tree a little
        const cx = (p0.x + star.x) / 2 + (p0.x - star.x) * 0.35, cz = (p0.z + star.z) / 2 + (p0.z - star.z) * 0.35, cy = star.y + 0.4;
        const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
        st.tmp.set(a * p0.x + b * cx + c * star.x, a * p0.y + b * cy + c * star.y, a * p0.z + b * cz + c * star.z);
        trail.emit(engine.time, st.tmp, nE, 0.035, 0.85, null, 0.015);
      }
    }
  }

  // -------------------------------------------------------------- cues
  const T = () => run.T;
  function buildCues(Tm, clover, replay) {
    const c = [
      [0, () => {
        game.state.phase = 'finale';
        player.controllable = false;
        player.vel.set(0, 0);
        player.walkTo(player.pos.x, player.pos.z);
        if (ctx.input) ctx.input.enabled = false;
        ctx.teasers?.stop?.();
        safe('tree lights', () => ctx.city?.tree?.setLights?.(1));
        buildPaths();
        const tp = treeP();
        if (replay && Math.hypot(player.pos.x - tp.x, player.pos.z - tp.z) > 6) player.teleport(tp.x + 0.9, tp.z + 1.5, 0);
        player.faceTowards(tp.x, tp.z);
        run.camRig.start();
        ctx.cam.setShotPortrait?.('cinema', { keep: KEEP, lift: 0 });
        cut(replay ? crowdPose(ctx) : treeStarPose(ctx), 0);
        game.emit('finale:start', { replay, preview: false });
        safe('net.refreshSpirit', () => ctx.net?.refreshSpirit?.());
        sfx('bell', { vol: 0.8 });
      }],
      [Tm.gather, () => {
        const tp = treeP();
        safe('life.gatherAt', () => ctx.life?.gatherAt?.(tp.x, tp.z, 3.5));
        safe('tasks.gather', () => tasks()?.gather?.({ face: { x: tp.x, z: tp.z } }));
        run.netRelease = safe('net.gather', () => ctx.net?.gather?.({ x: tp.x, z: tp.z, ...E.netRing })) || null;
        if (clover) { safe('reindeer.away', () => reindeerApi()?.away?.(true)); cloverDouble.show(true); }
        if (!replay) cut(crowdPose(ctx), 2.0);
      }],
      [Tm.cheer, () => { safe('cheer', () => ctx.life?.cheer?.()); sfx('cheer', { vol: 0.6 }); }],
      [Tm.spirit, () => {
        const ts = safe('townSpirit', () => ctx.net?.townSpirit) || {};
        const mine = safe('doneCount', () => ctx.progress?.doneCount?.()) || 0;
        const doors = Math.max(ts.doors | 0, mine), helpers = Math.max(ts.helpers | 0, 1);
        const together = !!ctx.net?.online && helpers > 1;
        run.spirit = { doors: together ? doors : mine, helpers };
        if (!run.jumping) overlay.spirit({ doors, helpers, mine, together });
        run.streams = { src: spiritSources(), acc: [], tmp: V() };
        cut(spiritPose(ctx), 1.6, 0.3);
        game.emit('town:moment', { doors, helpers });
        sfx('bell', { vol: 0.5 });
      }],
      [Tm.flare, () => {
        if (!run.jumping) {
          const star = treeAt(ctx).star;
          trail.puff(engine.time, star, 70, new THREE.Color('#ffe08a'), 0.9, 1.7);
          trail.puff(engine.time, star, 30, new THREE.Color('#ffffff'), 0.5, 1.2);
        }
        sfx('bell', { vol: 0.9 });
        safe('cheer', () => ctx.life?.cheer?.());
        sfx('cheer', { vol: 0.7 });
      }],
      [Tm.spiritHide, () => overlay.hideSpirit()],
      [Tm.approach[0], () => {
        rig.santaIn(); rig.santa.pose = 'sit';
        rig.group.scale.setScalar(1);
        rig.group.visible = true;
        rig.team.mode = 'fly'; rig.team.blend = 1;
        run.approach.reset();
        if (clover) rig.team.setSlotVisible?.(E.teamSlot, false); // the empty harness
        const runway = safe('lanterns', () => tasks()?.lanterns || tasks()?.activities?.lanterns?.runway);
        if (!run.jumping) safe('runway.chase', () => runway?.chase?.(8));
        if (Math.hypot(player.pos.x - L.x, player.pos.z - L.z) > 5.5) { // make sure the player is at the market for the meeting
          const tp = treeP();
          player.teleport(tp.x + 1.2, tp.z + 1.6);
          player.faceTowards(L.x, L.z);
        }
        game.emit('santa:arrive', {});
        sfx('sleighBells', { vol: 0.9 });
      }],
      [Tm.approach[0] + 1.6, () => sfx('whoosh', { vol: 0.6 })],
      [Tm.approach[0] + 3.5, () => cut(runwayPose(ctx, sleighWorld), 0, 0.26)], // a hard cut: the camera turns round to face the runway
      [Tm.approach[0] + 6.0, () => sfx('sleighBells', { vol: 1 })],
      [Tm.approach[0] + 8.6, () => sfx('whoosh', { vol: 0.8 })],
      [Tm.approach[0] + 10.4, () => { rig.team.mode = 'gallop'; }],
      [Tm.landed, () => {
        rig.team.mode = 'stand';
        run.approach.pose(rig, 1, 1 / 30);
        rig.place(V(L.x, gy(), L.z), heading, 0, 0);
        if (!run.jumping) trail.puff(engine.time, V(L.x, gy() + 0.05, L.z), 60, new THREE.Color('#fff6ea'), 0.7, 1.6);
        game.emit('santa:landed', {});
        sfx('pop', { vol: 0.7 });
      }],
      [Tm.greet, () => cut(greetPose(ctx, santaSpot, () => player.pos), 1.8, 0.4)], // portrait: 0.62 backed the camera into the carousel's sign
      [Tm.faceSanta, () => { const s = santaSpot(); safe('tasks.gather', () => tasks()?.gather?.({ face: { x: s.x, z: s.z } })); }],
      [Tm.out[0], () => {
        rig.santaOut();
        run.santaFrom.copy(rig.santa.group.position);
        run.santaTo.copy(santaSpot());
        rig.santa.pose = 'stand';
      }],
      [Tm.wave[0], () => { rig.santa.pose = 'wave'; sfx('hohoho', { vol: 1 }); }],
      [Tm.walk, () => startWalk()],
      [Tm.wave[1], () => { rig.santa.pose = 'stand'; }],
      [Tm.walkForce, () => { if (run.walk) { const m = meetSpot(); player.teleport(m.x, m.z); arrive(); } }],
      [Tm.giftClose, () => cut(giftClosePose(ctx, giftWorld, () => player.heading), 1.5, 0.55)],
      [Tm.gift[0], () => {
        run.reward = finaleGift();
        const g = run.gift = buildGift(engine.mat, game.state.playerName || 'you');
        g.scale.setScalar(0.01);
        rig.santa.hands.add(g);
        g.position.set(0, 0.01, 0.03);
        rig.santa.pose = 'give';
        sfx('pickup', { vol: 0.6 });
      }],
      [Tm.gift[1], () => {
        engine.scene.attach(run.gift);
        run.giftFrom.copy(run.gift.position);
        run.qFrom.copy(run.gift.quaternion);
        run.giftFlying = true;
      }],
      [Tm.gift[2], () => {
        run.giftFlying = false;
        run.gift.scale.setScalar(1);
        player.carry(run.gift);
        run.gift.rotation.set(0, GIFT_YAW, 0);
        rig.santa.pose = 'stand';
        game.emit('santa:gift', { name: game.state.playerName, reward: run.reward });
        sfx('gift', { vol: 1 });
        if (!run.jumping) {
          trail.puff(engine.time, giftWorld(V()), 30, new THREE.Color('#ffd27a'), 0.35, 0.9);
          overlay.giftTag(game.state.playerName || 'you', run.reward?.label || null);
        }
      }],
      [Tm.openCut, () => cut(giftOpenPose(ctx, giftWorld, giftFront), 1.2, 0.5)],
      [Tm.open[0], () => {
        sfx('bell', { vol: 0.45 });
        if (!run.jumping) trail.puff(engine.time, giftInside(V()), 34, new THREE.Color('#ffd889'), 0.17, 0.13);
      }],
      [Tm.open[0] + 0.45, () => { if (!run.jumping) trail.puff(engine.time, giftInside(V()).add(V(0, 0.03, 0)), 22, new THREE.Color('#fff1c9'), 0.11, 0.1); }],
      [Tm.dress, () => {
        if (!run.reward) return;
        run.dressT0 = run.t;
        cut(dressPose(ctx, () => player.pos, () => player.heading), 1.0, 0.5);
      }],
      [Tm.wear, () => {
        const r = run.reward;
        if (!r) return;
        let worn = false;
        if (ctx.ui?.wear) worn = safe('ui.wear', () => { ctx.ui.wear(r.slot, r.key); return true; });
        if (!worn) safe('setStyle', () => player.setStyle({ [r.slot]: r.key }));
        if (!run.jumping) {
          const p = player.pos;
          trail.puff(engine.time, V(p.x, p.y + 0.3, p.z), 46, new THREE.Color('#ffe08a'), 0.45, 1.0);
          trail.puff(engine.time, V(p.x, p.y + 0.15, p.z), 24, new THREE.Color('#ffffff'), 0.3, 0.8);
        }
        sfx('gift', { vol: 0.9 });
      }],
      [Tm.hideTag, () => overlay.hideTag()],
      [Tm.crowd, () => {
        const tp = treeP();
        cut(countPose(ctx), 2.2);
        safe('tasks.gather', () => tasks()?.gather?.({ face: { x: tp.x, z: tp.z } }));
        run.gift?.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // wide from here on
        player.faceTowards(tp.x, tp.z);
        rig.santa.group.rotation.y = Math.atan2(tp.x - rig.santa.group.position.x, tp.z - rig.santa.group.position.z);
      }],
      [Tm.crowd + 0.6, () => { safe('cheer', () => ctx.life?.cheer?.()); rig.santa.pose = 'cheer'; sfx('cheer', { vol: 0.7 }); }],
      [Tm.count - 0.5, () => { rig.santa.pose = 'stand'; }],
      ...Array.from({ length: 10 }, (_, i) => [Tm.count + i, () => {
        const n = 10 - i;
        game.emit('countdown', { n });
        if (!run.jumping) { overlay.countdown(n); sfx('countdown', { vol: 1, n }); }
      }]),
      [Tm.christmas, () => {
        game.emit('christmas', {});
        overlay.christmas();
        safe('cheer', () => ctx.life?.cheer?.());
        rig.santa.pose = 'cheer';
        sfx('cheer', { vol: 1 });
        fireworksOn();
        for (let i = 0; i < 4; i++) burst(i * 0.18);
        cut(pullbackPose(ctx, () => (rig.group.visible ? rig.group.position : null), 14), 1.2);
      }],
      [Tm.christmas + 5.5, () => overlay.hideChristmas()],
      [Tm.hopIn[0], () => {
        run.santaFrom.copy(rig.santa.group.position);
        rig.seatWorld(run.santaTo);
        rig.santa.pose = 'stand';
      }],
      [Tm.hopIn[1], () => { rig.santaIn(); rig.santa.pose = 'wave'; }],
      [Tm.lift[0], () => {
        run.liftoff.reset();
        rig.team.mode = 'gallop';
        sfx('sleighBells', { vol: 1 }); sfx('hohoho', { vol: 0.8 });
      }],
      [Tm.fly, () => { rig.team.mode = 'fly'; }],
      [Tm.lift[0] + 2.5, () => { safe('cheer', () => ctx.life?.cheer?.()); sfx('cheer', { vol: 0.6 }); }],
      [Tm.lift[0] + 6.5, () => safe('cheer', () => ctx.life?.cheer?.())],
      [Tm.lift[1], () => { rig.group.visible = false; }],
      [Tm.end, () => {
        ctx.cam.setMode('attract'); // slow orbit over the city behind the end card
        run.camRig.release(3.5);
        safe('markEveWatched', () => ctx.progress?.markEveWatched?.());
        run.ended = true;
        overlay.eveCard({
          name: game.state.playerName || 'Traveller', gift: run.reward, doors: run.spirit?.doors || 0,
          onKeep: () => api.exit(),
          onAgain: () => { api.exit(); api.start({ replay: true }); },
        });
        game.emit('game:end', {});
      }],
    ];
    if (clover) {
      c.push([Tm.cloverGo, () => {
        if (!run.jumping) game.emit('dialog', { who: 'Santa', text: 'Ho ho ho! Clover, there you are!', pos: santaHead(), ms: 2800 });
        cut(cloverPose(ctx, () => (cloverDouble.inScene ? cloverDouble.group.position : null)), 1.2, 0.3);
      }]);
      c.push([Tm.cloverIn, () => {
        cloverDouble.show(false);
        rig.team.setSlotVisible?.(E.teamSlot, true);
        const p = rig.world(V(-0.19, 0.25, 1.52));
        if (!run.jumping) trail.puff(engine.time, p, 40, new THREE.Color('#ffe08a'), 0.45, 1.1);
        sfx('sleighBells', { vol: 0.9 });
        sfx('cheer', { vol: 0.6 });
        safe('cheer', () => ctx.life?.cheer?.());
      }]);
    }
    return c.sort((a, b) => a[0] - b[0]);
  }

  function finaleGift() {
    let r = safe('finaleGift', () => ctx.progress?.finaleGift?.()) || null;
    if (!r && ctx.params?.has?.('fgift') && !ctx.progress?.finaleGift) { // test fallback until progress.finaleGift lands
      const [slot, key] = String(ctx.params.get('fgift')).split(':');
      if (slot && key) r = { id: `${slot}:${key}`, slot, key, label: ctx.params.get('fgiftLabel') || 'A Christmas surprise' };
    }
    return r;
  }

  // -------------------------------------------------------------- fireworks (one pool, faded out after exit)
  function fireworksOn() {
    if (!fw) fw = new Fireworks(engine.scene, 2600);
    fwFade = -1;
    run.fwT = run.fwT || 0; run.fwNext = 0; run.fwOn = true;
  }
  function burst(delay = 0) {
    const tp = treeP();
    const x = tp.x + (Math.random() - 0.5) * 11, z = tp.z - 1 - Math.random() * 5, y = 2.9 + Math.random() * 2.4;
    fw.burst(fwClock + delay, x, y, z);
    if (!run?.jumping) sfx('firework', { x, z, vol: 0.55 });
  }
  let fwClock = 0;
  function updateFireworks(dt) {
    if (!fw) return;
    fwClock += dt;
    if (run?.fwOn && fwFade < 0) {
      if (fwClock >= run.fwNext) {
        burst();
        if (Math.random() < 0.35) burst(0.2);
        const t = run.t;
        run.fwNext = fwClock + (t < run.T.fwCalm ? 0.28 + Math.random() * 0.35 : !run.ended ? 0.6 + Math.random() * 0.6 : 1.0 + Math.random() * 1.3);
      }
    }
    const tp = treeP();
    fw.mat.uniforms.uTime.value = fwClock;
    fw.mat.uniforms.uScale.value = 210 * pxScale();
    if (fwFade >= 0) {
      fwFade += dt;
      if (fwFade > 2.4) { // every spark has burnt out (life 1.9 s): drop the pool
        fw.points.removeFromParent();
        fw.geo.dispose(); fw.mat.dispose();
        fw = null; fwFade = -1;
      }
    }
    void tp;
  }

  // -------------------------------------------------------------- budget: the far-away rig in wide shots
  // (the sleigh high in the sky, and the crowd / countdown / fireworks views): low-detail reindeer, no rig shadows
  let wide = false;
  function setWide(on) {
    if (wide === on) return;
    wide = on;
    rig.team.setLod?.(on);
    rig.setShadows(!on);
    rig.santa.group.traverse((o) => { if (o.isMesh) o.castShadow = !on; }); // also when Santa stands outside the rig
  }

  // -------------------------------------------------------------- budget: the gathered crowd out of the shadow pass
  // In the wide views (gathering, Town Spirit, the runway approach, countdown, fireworks, liftoff) ~50 townsfolk and 14
  // friends stand round the tree: their shadows are specks there but cost ~75k triangles in the shadow pass. They cast
  // again for the close shots between Santa's greeting and the countdown (greeting, gift, dressing up), and after exit().
  // Clover's stand-in always keeps her shadow (she is the subject of her shot).
  let crowdOff = false;
  const crowdSaved = [];
  function setCrowdShadows(on) {
    if (crowdOff === !on) return;
    crowdOff = !on;
    if (on) { for (const m of crowdSaved) m.castShadow = true; crowdSaved.length = 0; return; }
    const off = (o) => { if (o.isMesh && o.castShadow) { o.castShadow = false; crowdSaved.push(o); } };
    for (const o of engine.scene.children) if (typeof o.name === 'string' && o.name.startsWith('life-')) off(o);
    const mayor = tasks()?.givers?.[24];
    for (const g of new Set(Object.values(tasks()?.givers || {}))) if (g?.root && g !== mayor) g.root.traverse(off);
  }

  // -------------------------------------------------------------- portrait framing per pose
  // The cinema rig is one long shot named 'cinema' (portrait: pulled back until it keeps `keep` of the 16:9 width). The
  // close / tall poses want less of that pull-back than the wide ones, so each cut sets its keep and it eases over.
  const KEEP = 0.75;
  function cut(gen, blend, keep = KEEP) {
    run.camRig.cut(gen, blend);
    run.keepTo = keep;
    run.keepRate = blend > 0 ? 2.6 / blend : 99;
  }
  function updateKeep(dt) {
    if (run.keep === run.keepTo) return;
    run.keep += (run.keepTo - run.keep) * (1 - Math.exp(-dt * run.keepRate));
    if (Math.abs(run.keep - run.keepTo) < 0.004) run.keep = run.keepTo;
    ctx.cam.setShotPortrait?.('cinema', { keep: run.keep, lift: 0 });
  }

  // -------------------------------------------------------------- per-frame tracks
  function tracks(dt) {
    const t = run.t, Tm = run.T;
    updateKeep(dt);
    setWide((t >= Tm.approach[0] && t < Tm.approach[0] + 6.5) || t >= Tm.crowd);
    safe('crowd shadows', () => setCrowdShadows(t >= Tm.greet && t < Tm.crowd));
    const flying = (t >= Tm.approach[0] && t < Tm.landed) || (t >= Tm.lift[0] && t < Tm.lift[1]);
    if (t >= Tm.approach[0] && t < Tm.landed) {
      const s = (t - Tm.approach[0]) / (Tm.approach[1] - Tm.approach[0]);
      run.approach.pose(rig, 1 - (1 - s) * (1 - s), dt);
    } else if (t >= Tm.landed && t < Tm.lift[0]) {
      const b = t - Tm.landed;
      rig.tilt.position.y = b < 0.8 ? Math.sin(b * 14) * 0.03 * (1 - b / 0.8) : 0;
      rig.tilt.rotation.x = b < 0.8 ? Math.sin(b * 11) * 0.02 * (1 - b / 0.8) : 0;
    } else if (t >= Tm.lift[0] && t < Tm.lift[1]) {
      const s = (t - Tm.lift[0]) / (Tm.lift[1] - Tm.lift[0]);
      rig.tilt.position.y = 0;
      run.liftoff.pose(rig, s * s * (1.6 - 0.6 * s), dt);
    }
    if (rig.group.visible) {
      rig.team.update(dt, flying ? 1.1 : 1);
      if (flying && !run.jumping) {
        run.emitAcc += dt * 80;
        if (run.emitAcc >= 1) {
          const n = Math.floor(run.emitAcc); run.emitAcc -= n;
          trail.emit(engine.time, rig.world(rig.rearLocal), Math.ceil(n * 0.6), 0.12, 1.0, null, 0.02);
          for (const r of rig.runnerLocal) trail.emit(engine.time, rig.world(r), Math.ceil(n * 0.2), 0.05, 0.8, null, 0.0);
        }
      }
    }
    rig.santa.update(dt);
    // Santa hops out / back in
    const sg = rig.santa.group;
    if (t >= Tm.out[0] && t < Tm.out[1] + 0.05 && sg.parent === engine.scene) {
      const k = ss((t - Tm.out[0]) / (Tm.out[1] - Tm.out[0]));
      sg.position.lerpVectors(run.santaFrom, run.santaTo, k);
      sg.position.y += Math.sin(k * Math.PI) * 0.22;
      const m = meetSpot();
      sg.rotation.set(0, lerpAngle(heading, Math.atan2(m.x - run.santaTo.x, m.z - run.santaTo.z), k), 0);
      rig.santa.walk = 1 - k;
    } else if (t >= Tm.hopIn[0] && t < Tm.hopIn[1] && sg.parent === engine.scene) {
      const k = ss((t - Tm.hopIn[0]) / (Tm.hopIn[1] - Tm.hopIn[0]));
      rig.seatWorld(run.santaTo);
      sg.position.lerpVectors(run.santaFrom, run.santaTo, k);
      sg.position.y += Math.sin(k * Math.PI) * 0.25;
      sg.rotation.y = lerpAngle(sg.rotation.y, heading, k);
    }
    if (t >= Tm.walk && t < Tm.crowd && sg.parent === engine.scene && rig.santa.pose !== 'wave') {
      sg.rotation.y = lerpAngle(sg.rotation.y, Math.atan2(player.pos.x - sg.position.x, player.pos.z - sg.position.z), 1 - Math.exp(-dt * 4));
    }
    updateWalk(dt);
    // gift: pop in, then fly from Santa's hands to the player's
    const gift = run.gift;
    if (gift && t >= Tm.gift[0] && t < Tm.gift[1]) gift.scale.setScalar(Math.max(0.01, ss((t - Tm.gift[0]) / 0.35)));
    if (gift && run.giftFlying) {
      const k = ss((t - Tm.gift[1]) / (Tm.gift[2] - Tm.gift[1]));
      const hands = player.character.hands;
      const to = hands.getWorldPosition(V());
      hands.getWorldQuaternion(run.qTo);
      gift.position.lerpVectors(run.giftFrom, to, k);
      gift.position.y += Math.sin(k * Math.PI) * 0.12;
      run.qTo.multiply(qGift);
      gift.quaternion.slerpQuaternions(run.qFrom, run.qTo, k);
    }
    if (gift?.userData.setOpen && t >= Tm.open[0]) {
      gift.userData.setOpen(easeOut((t - Tm.open[0]) / (Tm.open[1] - Tm.open[0])));
      if (!run.jumping && t < Tm.crowd + 1.5) {
        run.giftAcc += dt * (t < Tm.open[1] + 0.6 ? 36 : 20);
        if (run.giftAcc >= 1) {
          const n = Math.floor(run.giftAcc); run.giftAcc -= n;
          trail.emit(engine.time, giftInside(V()), n, 0.07, 0.09, null, 0.17);
        }
      }
    }
    // the wish piece: a helix of sparkles rises from the open box round the player
    if (run.dressT0 != null && !run.jumping) {
      const u = (t - run.dressT0) / 1.1;
      if (u >= 0 && u <= 1) {
        run.dressAcc += dt * 70;
        const n = Math.floor(run.dressAcc); run.dressAcc -= n;
        const p = player.pos, g = giftInside(V());
        for (let i = 0; i < n; i++) {
          const k = u + (i / Math.max(1, n)) * dt / 1.1;
          for (const off of [0, Math.PI]) {
            const a = k * Math.PI * 4 + off, r = 0.24 - 0.06 * k, y = p.y + 0.06 + k * 0.62;
            const q = V(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r);
            if (k < 0.25) q.lerp(g, 1 - k / 0.25);
            trail.emit(engine.time, q, 1, 0.02, 0.6, null, 0.03);
          }
        }
      }
    }
    // Clover's stand-in: the Rest → waiting spot (from the gathering), then into the harness on cue
    if (run.clover && cloverDouble.inScene) {
      let s, path, walking, h;
      const q = run.cq;
      if (t < Tm.cloverGo) {
        s = (t - Tm.gather) * CLOVER_SPEED[0]; path = path1;
        path.at(s, q);
        walking = s < path.len;
        h = walking ? q.h : Math.atan2(L.x - q.x, (L.z - 0.4) - q.z);
      } else {
        s = (t - Tm.cloverGo) * CLOVER_SPEED[1]; path = path2;
        path.at(s, q);
        walking = s < path.len;
        h = walking ? q.h : heading;
      }
      run.cloverH = lerpAngle(run.cloverH ?? h, h, 1 - Math.exp(-dt * 7));
      cloverDouble.pose(q.x, gyAt(q.x, q.z), q.z, run.cloverH, walking, dt);
    }
    spiritStreams(t, dt);
  }

  // -------------------------------------------------------------- skip input
  function skippable() { return run && !run.ended && run.T.skips.find(([a, b]) => run.t >= a && run.t < b - 0.3); }
  function trySkip() { const s = skippable(); if (s) jumpTo(s[1]); }
  window.addEventListener('pointerdown', (e) => { if (!run || e.target?.closest?.('button')) return; trySkip(); });
  window.addEventListener('keydown', (e) => { if (run && [' ', 'Enter', 'Escape', 'e', 'E'].includes(e.key)) trySkip(); });

  function fireUpTo(t) {
    while (run && run.fired < run.cues.length && run.cues[run.fired][0] <= t) {
      const fn = run.cues[run.fired][1];
      run.fired++;
      try { fn(); } catch (e) { console.error('[eve cue]', e); }
    }
  }

  /** Jump the timeline forward to t (fires all cues in between, silently). */
  function jumpTo(t) {
    if (!run || t <= run.t) return;
    run.jumping = true;
    const step = 1 / 15;
    const onStep = player.onStep;
    player.onStep = null; // silent footsteps
    while (run && run.t < t) {
      const d = Math.min(step, t - run.t);
      run.t += d;
      fireUpTo(run.t);
      if (!run) break;
      try { player.update?.(d); } catch (e) { /* player */ }
      engine.scene.updateMatrixWorld(); // hands / gift / Santa world positions for the poses and the gift flight
      tracks(d);
      run.camRig.update(scratch, d);
      overlay.update(d);
      updateFireworks(d);
    }
    player.onStep = onStep;
    if (run) { run.jumping = false; syncOverlays(); }
  }

  /** After a jump (skip / jumpTo), show the overlay that belongs to the landing time (cues fired silently). */
  function syncOverlays() {
    const t = run.t, Tm = run.T, name = game.state.playerName || 'you';
    if (run.ended) return;
    if (t >= Tm.spirit && t < Tm.spiritHide - 0.3 && run.spirit) {
      const ts = run.spirit;
      overlay.spirit({ doors: ts.doors, helpers: ts.helpers, mine: ts.doors, together: ts.helpers > 1 && !!ctx.net?.online });
      overlay.update(t - Tm.spirit);
    }
    if (t >= Tm.gift[2] && t < Tm.hideTag) overlay.giftTag(name, run.reward?.label || null);
    if (t >= Tm.count && t < Tm.christmas) overlay.countdown(10 - Math.floor(t - Tm.count));
    if (t >= Tm.christmas && t < Tm.christmas + 5.5) overlay.christmas();
  }

  // -------------------------------------------------------------- reset / exit
  /** Restore the rig, team slots, Santa, the gift, Clover's stand-in and the overlays (fireworks fade out on their own). */
  function reset() {
    overlay.clear();
    rig.santaIn();
    rig.santa.pose = 'sit';
    rig.santa.walk = 0;
    rig.santa.update(0);
    rig.group.visible = false;
    rig.group.scale.setScalar(1);
    rig.tilt.position.set(0, 0, 0);
    rig.tilt.rotation.set(0, 0, 0);
    setWide(false);
    setCrowdShadows(true);
    rig.setShadows(true);
    ctx.cam.setShotPortrait?.('cinema', { keep: KEEP, lift: 0 });
    rig.team.mode = 'stand'; rig.team.blend = 0;
    rig.team.setSlotVisible?.(E.teamSlot, true);
    cloverDouble.show(false);
    const g = run?.gift;
    if (g) {
      if (player.carrying === g) player.carry(null);
      g.removeFromParent();
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        if (o.material && o.material !== engine.mat) { o.material.map?.dispose(); o.material.emissiveMap?.dispose(); o.material.dispose(); }
      });
    }
    if (fw) fwFade = Math.max(fwFade, 0);
  }

  const api = {
    get running() { return !!run; },
    get time() { return run ? run.t : -1; },
    get state() {
      return run ? { t: +run.t.toFixed(2), replay: run.replay, clover: run.clover, reward: run.reward?.id || null, ended: !!run.ended, spirit: run.spirit || null }
        : { t: -1, fireworks: !!fw };
    },
    get times() { return run?.T || null; },
    /** start({ replay }): replay = the star is already on the tree (no star flight; the run opens on the crowd). */
    start({ replay = false } = {}) {
      if (run) return false;
      const ra = reindeerApi();
      const clover = !!ra?.atRest;
      const Tm = eveTimes(clover);
      run = {
        t: 0, fired: 0, replay, clover, T: Tm, cues: null, jumping: false, ended: false,
        camRig: createCinemaRig(ctx, { tilt: 1.25, blendIn: 0.9 }),
        approach: null, liftoff: null, walk: null, gift: null, giftFlying: false, reward: null, netRelease: null, spirit: null, streams: null,
        santaFrom: V(), santaTo: V(), giftFrom: V(), qFrom: new THREE.Quaternion(), qTo: new THREE.Quaternion(),
        keep: KEEP, keepTo: KEEP, keepRate: 2,
        emitAcc: 0, giftAcc: 0, dressT0: null, dressAcc: 0, cq: { x: 0, z: 0, h: 0 }, cloverH: null, fwOn: false,
      };
      reset();
      // Christmas Eve is a night show: ease to 21:00 if it's light out, and park the tram off the runway.
      const w = ctx.world;
      run.todWas = w && w.phase !== 'night' ? w.timeOfDay : null;
      if (run.todWas != null) safe('world.setTimeOfDay', () => w.setTimeOfDay(21));
      run.tramRelease = safe('life.holdVehicle', () => ctx.life?.holdVehicle?.('tram')) || null;
      run.cues = buildCues(Tm, clover, replay);
      fireUpTo(0);
      return true;
    },
    jumpTo,
    update(dt) {
      if (run) {
        run.t += dt;
        fireUpTo(run.t);
        if (run) {
          tracks(dt);
          overlay.update(dt);
        }
      }
      updateFireworks(dt);
    },
    /** Back to free play (WAVE3.md §Door 24 exit()). The star stays on the tree. */
    exit() {
      if (!run) return false;
      const r = run;
      reset();
      run = null;
      backToPlay(ctx, r.camRig);
      safe('life.release', () => ctx.life?.release?.());
      if (typeof r.tramRelease === 'function') safe('tram.release', () => r.tramRelease());
      if (r.todWas != null) safe('world.setTimeOfDay', () => ctx.world?.setTimeOfDay?.(r.todWas));
      safe('tasks.gather', () => tasks()?.gather?.({ on: false }));
      safe('net.release', () => r.netRelease?.());
      const ra = reindeerApi();
      if (r.clover || ra?.atRest) {
        safe('reindeer.snapHome', () => ra?.snapHome?.());
        safe('reindeer.away', () => ra?.away?.(false));
      }
      if (r.clover && r.ended) game.emit('ui:toast', { text: 'Santa says Clover can stay for the holidays!', ms: 4200 });
      game.emit('finale:exit', {});
      return true;
    },
    reset,
  };
  return api;
}

function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}
