// The player's own name tag: produces one extra entry for the shared name-tag mesh (tags.js, flagged `self` so it
// gets the gold border + star and a constant screen-space size). Pure data: entry(dt) → tag | null.
import { cleanName } from '../core/names.js';

export function createSelfTag(ctx, getName) {
  const { game, player } = ctx;
  let wanted = true, k = 0;
  const tag = { id: '__self', name: '', coat: '#ffd25a', x: 0, y: 0, z: 0, k: 0, self: true };
  const hiddenNow = () => {
    const S = game.state;
    return !wanted || S.phase !== 'play' || !player.dollVisible || (ctx.cam?.eye || 0) >= 0.5
      || !!ctx.minigames?.active || !!ctx.house?.isOpen || !!ctx.cam?.shotActive;
  };
  return {
    setVisible(b) { wanted = !!b; },
    get visible() { return wanted; },
    /** Per-frame: fade in/out; returns the tag entry (or null once fully faded). */
    entry(dt) {
      k += ((hiddenNow() ? 0 : 1) - k) * Math.min(1, dt * 9);
      if (k < 0.02) { if (hiddenNow()) k = 0; return null; }
      const p = player.object.position; // follows the cabin while seated
      tag.name = cleanName(getName());
      tag.x = p.x; tag.y = p.y; tag.z = p.z; tag.k = k;
      return tag;
    },
  };
}
