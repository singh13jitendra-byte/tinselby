// STUB (wave 3 scaffolding), replaced by the Finale builder (WAVE3.md §Door 24 "Preview"): the 16 s pre-Eve sleigh flyover.
// Until then start() does nothing and reports false, so callers (Mayor "Peek at Christmas Eve", the wave-3 end card) are safe.
export function createPreview(/* ctx, rig, trail, overlay, sfx, pxScale */) {
  return {
    get running() { return false; },
    /** Start the flyover (only in phase 'play'); stub → false. */
    start() { return false; },
    update() {},
    stop() {},
  };
}
