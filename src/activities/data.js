// Activities in town (rides + other things you can do), with the spot where each one starts and its real unlock rule.
// Spots mirror the interact.add() calls of the modules that own them (src/rides/*, src/game/tasks.js cable car,
// src/calendar/gift.js, src/house, the door-19 giver), so the glow ring sits exactly where the green button appears.
//
// Unlock rules found in the code (21 Nov):
// - tram, carriage, Ferris wheel, carousel, skating, sledging, cable car: free in free play from the start (no door).
//   The Ferris wheel / carousel / tram / carriage pop up with their district (walking into it reveals it).
// - daily gift: only while progress.daily is available (one a day); hidden otherwise.
// - Hot Cocoa Hut (Nana Marigold, door 19 mini-game): playable once door 19 is open (doors open one by one), replayable
//   ("Play again") once done → locked "Opens with Door 19" before that.
// - your cottage (decorate): owned once door 10 is done → locked "Opens with Door 10" before that.
import { ICONS } from '../ui/icons.js';
import { getFerris } from '../city/lakeside.js';
import { getCarousel } from '../city/market.js';
import { CARRIAGE_STOP } from '../life/carriage.js';

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** Two glyphs the shared icon set doesn't have (same stroke style as src/ui/icons.js). */
export const ACT_ICONS = {
  ferris: svg('<circle cx="12" cy="10" r="7"/><path d="M12 3v14M5 10h14M7.1 5.1l9.8 9.8M16.9 5.1l-9.8 9.8"/><path d="M8 21l4-11 4 11"/><circle cx="12" cy="10" r="1.6" fill="currentColor"/>'),
  carousel: svg('<path d="M3.5 9.5L12 4l8.5 5.5z" fill="currentColor" fill-opacity=".25"/><path d="M12 2.5V4M6 9.5V18M12 9.5V18M18 9.5V18M3.5 19.5h17"/><circle cx="6" cy="14" r="1.6" fill="currentColor"/><circle cx="18" cy="12.5" r="1.6" fill="currentColor"/>'),
};
export const iconOf = (k) => ACT_ICONS[k] || ICONS[k] || ICONS.star;

/**
 * buildActivities(ctx) → [{ id, name, sub, verb, icon, glyph (map canvas glyph), place (map place id), x, z (start spot),
 *   r (spot radius: ring size), lift (sign height above the ground), door (unlock door, 0 = free), unlocked(), present(),
 *   tip, tipKey, group }]
 */
export function buildActivities(ctx) {
  const L = ctx.layout;
  const A = [];
  const always = () => true;
  const add = (a) => A.push({ door: 0, unlocked: always, present: always, lift: 0.95, r: 0.9, sub: '', group: a.id, tipKey: a.id, ...a });

  // trams: one spot per stop (src/rides/tram.js spotOf: 20 % of the way from the first waiting point to the stop)
  for (const st of L.TRAM_STOPS || []) {
    const [mx, mz] = st.wait[0];
    const x = mx + (st.pos[0] - mx) * 0.2 - (st.pos[0] === 0 ? 0.1 : 0), z = mz + (st.pos[1] - mz) * 0.2 - (st.pos[0] !== 0 ? 0.1 : 0);
    add({ id: 'tram-' + st.id, group: 'tram', tipKey: 'tram', name: 'Tram stop', sub: st.name, verb: 'Ride', icon: 'tram', glyph: 'tram', place: 'tram-' + st.id, x, z, r: 1.0,
      tip: 'Tram stop! Tap “Wait for the tram” and hop on when it pulls in.' });
  }
  add({ id: 'carriage', name: 'Carriage', verb: 'Ride', icon: 'hoof', glyph: 'carriage', place: 'carriage', x: CARRIAGE_STOP.wait[0], z: CARRIAGE_STOP.wait[1],
    tip: 'Carriage stop! Tap “Wait for the carriage” for a horse-drawn ride round town.' });
  const f = getFerris();
  if (f?.toWorld) {
    const [x, z] = f.toWorld(-0.05, 1.12);
    add({ id: 'ferris', name: 'Ferris wheel', verb: 'Ride', icon: 'ferris', glyph: 'wheel', place: 'ferris', x, z, r: 0.75,
      tip: 'Hop on! Tap “Ride the Ferris wheel” for a spin above the lake.' });
  }
  const c = getCarousel();
  if (c) add({ id: 'carousel', name: 'Carousel', verb: 'Ride', icon: 'carousel', glyph: 'carousel', place: 'carousel', x: c.x + 0.15, z: c.z + 1.4, r: 0.8,
    tip: 'Tap “Ride the carousel” to hop on a knitted horse.' });
  add({ id: 'skate', name: 'Ice rink', verb: 'Skate', icon: 'skate', glyph: 'skate', place: 'skate', x: 10.0, z: 2.6, r: 1.05, // src/rides/skate.js SPOT
    tip: 'Tap “Put on skates” to glide across Frostmere Lake.' });
  add({ id: 'sled', name: 'Sledge Hill', verb: 'Sledge', icon: 'sleigh', glyph: 'sled', place: 'sled', x: 0.4, z: -15.35, r: 1.15, // src/rides/sled.js SPOT
    tip: 'Tap “Grab a sledge” and whoosh down Sledge Hill.' });
  add({ id: 'cable-up', group: 'cable', tipKey: 'cable', name: 'Cable car', verb: 'Ride up', icon: 'cable', glyph: 'cable', place: 'cable', x: L.HILL.cableBase.x, z: L.HILL.cableBase.z,
    tip: 'Tap “Ride the cable car up” to float to the top of Sledge Hill.' });
  add({ id: 'cable-down', group: 'cable', tipKey: 'cable-down', name: 'Cable car', verb: 'Ride down', icon: 'cable', glyph: 'cable', place: 'cabletop', x: L.HILL.cableTop.x, z: L.HILL.cableTop.z,
    tip: 'Tap “Ride the cable car down” to glide back into town.' });

  // daily gift beside the Advent board (only while today's gift waits)
  const gift = ctx.calendar?.gift;
  if (gift?.pos) add({ id: 'gift', name: 'Daily gift', verb: 'Open', icon: 'gift', glyph: 'gift', place: 'advent', x: gift.pos.x, z: gift.pos.z, r: 0.75, lift: 0.8,
    present: () => !!gift.visible, available: () => !!ctx.calendar?.data?.dailyAvailable,
    tip: 'A gift for you! Tap “Open your daily gift”. A new one waits every day.' });

  // Hot Cocoa Hut: Nana Marigold's mini-game (door 19)
  const ds = (n) => { try { return ctx.progress?.state?.(n) || 'locked'; } catch (e) { return 'locked'; } };
  const g19 = ctx.tasks?.givers?.[19] || L.DOOR_SPOTS?.[19];
  if (g19) add({ id: 'cocoa', name: 'Cocoa hut', verb: 'Make cocoa', icon: 'cocoa', glyph: 'cocoa', place: 'cocoa', x: g19.x, z: g19.z, r: 1.0, door: 19,
    unlocked: () => { const s = ds(19); return s === 'open' || s === 'done'; },
    tip: 'Nana Marigold’s cocoa hut! Talk to her to pour, top and serve cosy mugs of cocoa.' });

  // your cottage on Holly Lane (door 10)
  if (L.HOUSE) add({ id: 'cottage', name: 'Your cottage', verb: 'Decorate', icon: 'home', glyph: 'house', place: 'home', x: L.HOUSE.door.x, z: L.HOUSE.door.z, r: 0.8, door: 10,
    unlocked: () => !!ctx.house?.owned,
    tip: 'Home sweet home! Tap “Decorate your house” to change the wreath, lights and door.' });

  for (const a of A) {
    a.district = L.districtAt(a.x, a.z);
    a.dist = Infinity; a.rank = Infinity; a.locked = false; a.on = false; // live fields (refreshed by index.js)
  }
  return A;
}
