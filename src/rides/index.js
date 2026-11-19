// Free-play rides (lead-owned registry). Anyone can hop on, any time in free play, no score, no door needed.
//
// Contract for each ride module (src/rides/<id>.js → create<Name>Ride(ctx)):
// - registers its own interact spot(s) via ctx.interact.add({ id: 'ride-<id>…', label: 'Ride the …', icon, enabled, onInteract })
//   enabled only when ctx.game.state.phase === 'play' and no other ride is active (ctx.rides.active === null)
// - on board: ctx.rides.begin(ride) ; player.controllable = false ; own camera via ctx.cam.playShot (eye-level from the seat with
//   drag-to-look where it makes sense; pass lens { w, fov, near } for a wide eye lens; portrait-aware); own small DOM layer with a
//   big "Hop off" button (+ optional "Look"/"View" toggle), thumb-sized, safe-area insets, portrait + landscape
// - on exit (Hop off, ride end, phase change, game:start, minigame:start): put the player down at a sensible safe spot,
//   restore controllable / doll visibility / camera, remove DOM, ctx.rides.end(ride)
// - returns { id, active, update(dt, t), stop() }
// - events: game.emit('ride:start', { id }) / game.emit('ride:end', { id })
// - wave 4 (W4, src/rides/together.js): `seats` (stable seat indices, remote rider poses, joining) for riding together;
//   rides.joinWith(id), rides.ridersOf(rideId) → [{ id, name, s }], rides.rideOf(id) → { k, s, name } | null
import { createTramRide } from './tram.js';
import { createCarriageRide } from './carriage.js';
import { createFerrisWheelRide } from './ferris.js';
import { createCarouselRide } from './carousel.js';
import { createSkatingRide } from './skate.js';
import { createSledgingRide } from './sled.js';
import { createTogether } from './together.js';

export function createRides(ctx) {
  const api = {
    active: null,
    list: [],
    begin(ride) { api.active = ride; ctx.game.emit('ride:start', { id: ride.id }); },
    end(ride) { if (api.active === ride) api.active = null; ctx.game.emit('ride:end', { id: ride.id }); },
    stopAll() { for (const r of api.list) { try { if (r.active) r.stop(); } catch (e) { console.warn('[rides] stop', e); } } },
    update(dt, t) {
      for (const r of api.list) { try { r.update(dt, t); } catch (e) { console.warn('[rides]', r.id, e); } }
      try { together?.update(dt); } catch (e) { console.warn('[rides] together', e); }
    },
    // riding together (no-ops unless W4)
    joinWith: (id) => together?.joinWith(id) ?? false,
    ridersOf: (k) => together?.ridersOf(k) ?? [],
    rideOf: (id) => together?.rideOf(id) ?? null,
    /** Seats drawn as taken on ride k on this screen (you + remote riders). */
    occupied: (k) => together?.occupied(k) ?? new Set(),
    /** Seats remote riders are drawn in on ride k (boarding never picks these). */
    takenByOthers: (k) => together?.takenByOthers(k) ?? new Set(),
  };
  let together = null;
  ctx.rides = api;
  for (const make of [createTramRide, createCarriageRide, createFerrisWheelRide, createCarouselRide, createSkatingRide, createSledgingRide]) {
    try { api.list.push(make(ctx)); } catch (e) { console.warn('[rides] create', e); }
  }
  try { together = createTogether(ctx, api); api._together = together; } catch (e) { console.warn('[rides] together', e); }
  ctx.game.on('minigame:start', () => api.stopAll());
  ctx.game.on('finale:start', () => api.stopAll());
  return api;
}
