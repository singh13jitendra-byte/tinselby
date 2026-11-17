// Santa + Finale + Cinematics (CONTRACTS.md §Finale). createFinale(ctx) builds the sleigh rig, the sparkle trail,
// play-time teasers and camera shots, and runs the finale timeline on tree:starPlaced.
// Test flags (inside this module): ?finale → emit tree:starPlaced 2 s after game start; &fjump=SECONDS → jump the
// finale timeline forward; ?teaser → first sky teaser 1 s after start; ?noshots → no gameplay camera shots.
import { buildRig } from './rig.js';
import { Trail } from './trail.js';
import { createOverlay } from './overlay.js';
import { createTeasers } from './teasers.js';
import { createSequence } from './sequence.js';
import { installGameplayShots } from '../camera/shots.js';

export function createFinale(ctx) {
  const { engine, game, params } = ctx;
  const sfx = (name, opts) => { try { ctx.audio?.sfx?.(name, opts); } catch (e) { /* audio is optional */ } };
  const pxScale = () => Math.max(0.5, engine.renderer.domElement.height / 540);

  const rig = buildRig(engine);
  const trail = new Trail(engine.scene, 900);
  const overlay = createOverlay(ctx.uiRoot);
  const teasers = createTeasers(ctx, rig, trail, sfx, pxScale);
  ctx.teasers = teasers;
  const seq = createSequence(ctx, rig, trail, overlay, sfx, pxScale);
  installGameplayShots(ctx);

  game.on('tree:starPlaced', () => {
    if (seq.running) return;
    seq.start();
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
      game.state.starPlaced = true;
      game.emit('tree:starPlaced', {});
    }
    teasers.update(dt);
    seq.update(dt);
    trail.update(engine.time, pxScale());
  }, 50);

  return {
    rig, trail,
    get running() { return seq.running; },
    get time() { return seq.time; },
    /** Debug: jump the finale timeline forward. */
    jumpTo: (t) => seq.jumpTo(t),
  };
}
