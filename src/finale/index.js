// Santa + Finale + Cinematics (CONTRACTS.md §Finale). createFinale(ctx) builds the sleigh rig, the sparkle trail,
// play-time teasers and camera shots, and runs the finale timeline on tree:starPlaced.
// Test flags (inside this module): ?finale → emit tree:starPlaced 2 s after game start; &fjump=SECONDS → jump the
// finale timeline forward; ?teaser → first sky teaser 1 s after start; ?noshots → no gameplay camera shots.
// Wave 3 (?w3): eve.js (restartable Christmas Eve timeline, completes door 24 under ?finale when it is open),
// preview.js ("Look up!" flyover), API replay() / preview() / exit(), hook window.__eve (state, times, jumpTo, replay,
// preview, previewJump, exit, budget); &fgift=slot:key = Santa's gift while progress.finaleGift doesn't exist (tests).
import { buildRig } from './rig.js';
import { Trail } from './trail.js';
import { createOverlay } from './overlay.js';
import { createTeasers } from './teasers.js';
import { createSequence } from './sequence.js';
import { createEve } from './eve.js';
import { createPreview } from './preview.js';
import { installGameplayShots } from '../camera/shots.js';
import { W3 } from '../progress/doors.js';

export function createFinale(ctx) {
  const { engine, game, params } = ctx;
  const sfx = (name, opts) => { try { ctx.audio?.sfx?.(name, opts); } catch (e) { /* audio is optional */ } };
  const pxScale = () => Math.max(0.5, engine.renderer.domElement.height / 540);

  const rig = buildRig(engine);
  const trail = new Trail(engine.scene, 900);
  const overlay = createOverlay(ctx.uiRoot);
  const teasers = createTeasers(ctx, rig, trail, sfx, pxScale);
  ctx.teasers = teasers;
  // wave 3 (?w3): the restartable Christmas Eve timeline + the pre-Eve preview; otherwise the wave-1/2 sequence
  const seq = W3 ? createEve(ctx, rig, trail, overlay, sfx, pxScale) : createSequence(ctx, rig, trail, overlay, sfx, pxScale);
  const prev = W3 ? createPreview(ctx, rig, trail, overlay, sfx, pxScale) : null;
  installGameplayShots(ctx);
  // portrait framing for the finale's cinema rig (see src/core/camera.js PORTRAIT): keep more of the 16:9 width so the
  // sleigh, Santa and the player stay in the narrow frame (the camera pulls back up to 2.2× along each pose's view line)
  ctx.cam.setShotPortrait?.('cinema', { keep: 0.75, lift: 0 });
  ctx.cam.setShotPortrait?.('cinemaOut', { keep: 0.75, lift: 0 });

  game.on('tree:starPlaced', () => {
    if (seq.running) return;
    prev?.stop();
    seq.start({ replay: false });
    if (params.has('fjump')) seq.jumpTo(+params.get('fjump') || 0);
  });

  let testAt = -1;
  game.on('game:start', () => { if (params.has('finale')) testAt = engine.time + 2; });

  engine.addUpdate((dt) => {
    if (testAt >= 0 && engine.time >= testAt) {
      testAt = -1;
      const tr = ctx.layout.MARKET.tree;
      ctx.player.teleport(tr.x + 0.9, tr.z + 1.5, 0);
      try { ctx.city?.tree?.placeStar?.(); } catch (e) { /* stub city */ }
      // wave 3: the real "Place the star" completes door 24 first (finaleGift needs it); mirror that when door 24 is open
      if (W3) { try { if (ctx.progress?.state?.(24) === 'open') ctx.progress.complete(24, { stars: 1, score: 0 }); } catch (e) { /* progress */ } }
      game.state.starPlaced = true;
      game.emit('tree:starPlaced', {});
    }
    teasers.update(dt);
    seq.update(dt);
    prev?.update(dt);
    trail.update(engine.time, pxScale());
  }, 50);

  const api = {
    rig, trail,
    get running() { return seq.running; },
    get time() { return seq.time; },
    /** True while the pre-Eve "Look up!" flyover runs. */
    get previewing() { return !!prev?.running; },
    /** Debug: jump the finale timeline forward. */
    jumpTo: (t) => seq.jumpTo(t),
    /** Wave 3: watch Christmas Eve again (star already on the tree; opens on the gathering). Phase 'play' only. */
    replay() {
      if (!W3 || seq.running || prev?.running || game.state.phase !== 'play') return false;
      return seq.start({ replay: true });
    },
    /** Wave 3: the 16 s pre-Eve sleigh flyover (phase 'play' only). */
    preview() { if (!prev || seq.running) return false; return prev.start(); },
    /** Wave 3: leave the finale (or the preview) for free play. */
    exit() { if (prev?.running) return prev.stop(); return W3 ? seq.exit() : false; },
  };
  if (W3) {
    window.__eve = {
      get state() { return { phase: game.state.phase, running: seq.running, preview: prev.running, previewT: +prev.time.toFixed(2), ...seq.state }; },
      get times() { return seq.times; },
      jumpTo: (t) => seq.jumpTo(t),
      replay: () => api.replay(),
      preview: () => api.preview(),
      previewJump: (t) => prev.jumpTo(t),
      exit: () => api.exit(),
      budget: () => { const s = engine.stats(); return { calls: s.calls, tris: s.tris, children: engine.scene.children.length, trail: trail.head }; },
    };
  }
  return api;
}
