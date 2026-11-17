// Interaction spots: when the player stands near one, the UI shows a big button with its label.
// Pressing E / Space / Enter or tapping the button emits 'interact' → the nearest enabled spot's onInteract runs.
export function createInteractions(game) {
  const spots = [];
  let current = null;
  const api = {
    /**
     * add({ id, x, z, r = 0.9, label, icon?, enabled: () => bool, onInteract: () => void, y? })
     * Returns the spot; set spot.removed = true (or call api.remove(spot)) to drop it.
     */
    add(spot) {
      spots.push({ r: 0.9, enabled: () => true, ...spot });
      return spots[spots.length - 1];
    },
    remove(spot) { const i = spots.indexOf(spot); if (i >= 0) spots.splice(i, 1); if (current === spot) current = null; },
    get current() { return current; },
    /** Called every frame by main with the player position. */
    update(px, pz, enabled) {
      let best = null, bd = Infinity;
      if (enabled) for (const s of spots) {
        if (s.removed || !s.enabled()) continue;
        const d = Math.hypot(s.x - px, s.z - pz);
        if (d < s.r && d < bd) { bd = d; best = s; }
      }
      if (best !== current) {
        current = best;
        game.emit(best ? 'interact:available' : 'interact:none', best ? { id: best.id, label: best.label, icon: best.icon } : {});
      }
    },
    trigger() {
      if (current && current.enabled()) {
        const s = current;
        s.onInteract();
        game.emit('interact:done', { id: s.id });
      }
    },
  };
  game.on('interact', () => api.trigger());
  return api;
}
