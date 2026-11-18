// STUB (wave 3 scaffolding), replaced by the Finale builder (WAVE3.md §Door 24: the restartable Christmas Eve timeline).
// Same shape as sequence.js (start / update / jumpTo / running / time) plus reset(). Until the builder lands it simply wraps
// the wave-2 sequence, and nothing imports it yet: index.js keeps using sequence.js (the builder switches to `W3 ? eve : sequence`).
import { createSequence } from './sequence.js';

export function createEve(ctx, rig, trail, overlay, sfx, pxScale) {
  const seq = createSequence(ctx, rig, trail, overlay, sfx, pxScale);
  return {
    get running() { return seq.running; },
    get time() { return seq.time; },
    /** start({ replay }) — replay = the star is already on the tree (stub: same as a first run). */
    start() { seq.start(); },
    jumpTo: (t) => seq.jumpTo(t),
    update: (dt) => seq.update(dt),
    /** Restore rig, team slots, Santa, fireworks, gift and overlays for the next run (stub: nothing to restore). */
    reset() {},
  };
}
