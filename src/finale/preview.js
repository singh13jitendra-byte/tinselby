// Wave 3: the pre-Eve "Look up!" preview (WAVE3.md §Door 24 "Preview"): a 16 s sleigh flyover, 1.3 loops round the big
// tree at height 4–6 and radius 6, then a climb away into the night. No landing, no gathering. Mayor Tinsel's
// "Peek at Christmas Eve" and the wave-3 end card's "Look up!" call it (ctx.finale.preview(), phase 'play' only).
import * as THREE from 'three';
import { createFlight } from './rig.js';
import { createCinemaRig } from '../camera/shots.js';
import { previewPose, treeAt } from './poses.js';
import { backToPlay } from './play.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const PREVIEW_DUR = 16;
const LABEL2 = 10.2; // "See you on Christmas Eve, {name}!"

/** Whole sleeps from today to 24 Dec (progress.eve when it exists). */
function sleepsLeft(ctx) {
  const e = (() => { try { return ctx.progress?.eve; } catch (err) { return null; } })();
  if (e && Number.isFinite(e.sleeps)) return e.sleeps;
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), b = Date.UTC(y, 11, 24);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function createPreview(ctx, rig, trail, overlay, sfx) {
  const { engine, game, player } = ctx;
  let run = null;

  function buildCurve() {
    const tr = treeAt(ctx);
    const pts = [V(tr.x - 24, 10, tr.z + 14), V(tr.x - 12, 7.2, tr.z + 9)];
    // 1.3 loops anticlockwise (seen from above) starting south-west of the tree, gently bobbing between 4 and 6
    const a0 = -2.3, loops = 1.3, n = 30;
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + u * loops * Math.PI * 2;
      pts.push(V(tr.x + Math.sin(a) * 6, 5 + Math.sin(u * Math.PI * 2.6) * 0.9 - u * 0.4, tr.z + Math.cos(a) * 6));
    }
    const last = pts[pts.length - 1], dir = V(last.x - pts[pts.length - 2].x, 0, last.z - pts[pts.length - 2].z).normalize();
    pts.push(V(last.x + dir.x * 6, 7.5, last.z + dir.z * 6), V(last.x + dir.x * 13, 11.5, last.z + dir.z * 13), V(last.x + dir.x * 22, 16, last.z + dir.z * 22));
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }

  const cues = [
    [0, () => {
      game.state.phase = 'finale';
      player.controllable = false;
      player.vel.set(0, 0);
      player.walkTo(player.pos.x, player.pos.z);
      if (ctx.input) ctx.input.enabled = false;
      ctx.teasers?.stop?.();
      rig.santaIn(); rig.santa.pose = 'sit';
      rig.group.scale.setScalar(1);
      rig.setShadows(true);
      rig.team.mode = 'fly'; rig.team.blend = 1;
      rig.team.setSlotVisible?.(2, true);
      rig.team.setLod?.(true); // always ≥ 6 units from the camera: the far-away reindeer bodies
      rig.group.visible = true;
      run.camRig.start();
      run.camRig.cut(previewPose(ctx, () => (rig.group.visible ? rig.group.position : null)), 0);
      const k = sleepsLeft(ctx);
      overlay.previewLabel(k > 0 ? `Christmas Eve \u00b7 ${k} sleep${k === 1 ? '' : 's'} to go` : 'Christmas Eve is tonight!');
      game.emit('finale:start', { replay: false, preview: true });
      sfx('sleighBells', { vol: 0.9 });
    }],
    [2.4, () => sfx('whoosh', { vol: 0.6 })],
    [4.2, () => sfx('hohoho', { vol: 0.9 })],
    [7.0, () => { rig.santa.pose = 'wave'; sfx('sleighBells', { vol: 1 }); }],
    [9.5, () => { rig.santa.pose = 'sit'; sfx('whoosh', { vol: 0.7 }); }],
    [LABEL2, () => overlay.previewLabel(`See you on Christmas Eve, ${game.state.playerName || 'friend'}!`, { big: true })],
    [12.2, () => sfx('hohoho', { vol: 0.7 })],
    [13.0, () => sfx('sleighBells', { vol: 0.7 })],
    [PREVIEW_DUR - 0.6, () => overlay.hidePreview()],
    [PREVIEW_DUR, () => api.stop()],
  ];

  function fire(t) {
    while (run && run.fired < cues.length && cues[run.fired][0] <= t) {
      const fn = cues[run.fired][1];
      run.fired++;
      try { fn(); } catch (e) { console.error('[preview cue]', e); }
    }
  }

  function track(dt) {
    const u = Math.min(1, run.t / PREVIEW_DUR);
    if (rig.group.visible) {
      run.flight.pose(rig, u * (0.86 + 0.14 * u), dt); // speeds up a little on the climb away
      rig.team.update(dt, 1.15);
      rig.santa.update(dt);
      run.acc += dt * 70;
      if (run.acc >= 1) {
        const n = Math.floor(run.acc); run.acc -= n;
        trail.emit(engine.time, rig.world(rig.rearLocal), Math.ceil(n * 0.6), 0.12, 1.0, null, 0.02);
        for (const r of rig.runnerLocal) trail.emit(engine.time, rig.world(r), Math.ceil(n * 0.2), 0.05, 0.8, null, 0.0);
      }
    }
  }

  window.addEventListener('pointerdown', (e) => { if (run && !e.target?.closest?.('button') && run.t > 0.4) api.stop(); });
  window.addEventListener('keydown', (e) => { if (run && run.t > 0.4 && [' ', 'Enter', 'Escape', 'e', 'E'].includes(e.key)) api.stop(); });

  const api = {
    get running() { return !!run; },
    get time() { return run ? run.t : -1; },
    /** Start the flyover (phase 'play' only) → true when it started. */
    start() {
      if (run || game.state.phase !== 'play' || rig.group.visible && !ctx.teasers?.active) return false;
      if (ctx.teasers?.active) ctx.teasers.stop();
      run = { t: 0, fired: 0, acc: 0, camRig: createCinemaRig(ctx, { tilt: 1.1, blendIn: 1.2 }), flight: createFlight(buildCurve(), 0) };
      fire(0);
      return true;
    },
    update(dt) {
      if (!run) return;
      run.t += dt;
      fire(run.t);
      if (run) track(dt);
    },
    /** Debug: run the flyover forward to t (sub-steps, like the finale's jumpTo). */
    jumpTo(t) {
      while (run && run.t < t) { const d = Math.min(1 / 15, t - run.t); api.update(d); run?.camRig.update({ pos: V(), target: V() }, d); }
    },
    /** End (or skip) the flyover: back to play exactly as the finale's exit() does, without a gathering. */
    stop() {
      if (!run) return false;
      const r = run;
      run = null;
      overlay.clear();
      rig.group.visible = false;
      rig.santa.pose = 'sit';
      rig.team.mode = 'stand'; rig.team.blend = 0;
      rig.team.setLod?.(false);
      backToPlay(ctx, r.camRig, { dropCarry: false });
      game.emit('finale:exit', { preview: true });
      return true;
    },
  };
  return api;
}
