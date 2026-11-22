// Friends-town scoreboards: how each mini-game's result becomes the one number the server keeps (PHASE3.md
// §Scoreboard RPCs). score_submit keeps the HIGHEST p_score per player / game / town, so every game must send an
// integer 0..1,000,000 where MORE IS BETTER. Two mappings:
//
//   points(unit)       p_score = the game's own score, as is (rounded, clamped). Shown back as "640 pts".
//   fasterTime(capSec) for games where a LOWER time is better: p_score = round((capSec - sec) * 10), i.e. tenths of a
//                      second under a fixed cap (a 72.4 s run with a 600 s cap → 5276). Shown back as the time, "1:12.4".
//                      Runs slower than the cap send nothing. The cap is part of the board: never change it for a
//                      game that already has scores (old and new numbers would no longer compare).
//
// Per game (door → id: mapping, what the number is):
//   5  snowball   points  hits / streak / snowman points in 60 s
//   6  ornaments  points  100 per ornament + 3 per second left + 50 for all five − hints
//   7  sled       points  500 + stars·30 + gates·20 + 15 per second under 75 s (the race time is already folded in,
//                         higher = faster and cleaner, so it is NOT sent as a lower-is-better time)
//   8  cookies    points  cut / bake / decorate timing accuracy
//   9  skate      points  Perfect / Good beats + twirls
//  11  tram       points  boarding accuracy at each stop
//  12  giftwrap   points  mean wrap accuracy × 1000
//  13  snowman    points  the three judges' cards added up
//  16  sled2      points  as sled, with lantern gates and bells
//  17  carols     points  note timing (Perfect / Good / holds)
//  19  cocoa      points  tips for the six orders
//  21  presents   points  catches + streak bonus
//  23  pack       points  packing score (cells, rows, no tumbles)
// No current game is purely time-based, so fasterTime is not used yet; it is here (and checked by the tests) so a
// future timed game only needs one line below.
// A game id that is not listed falls back to points() if it matches the server's ^[a-z0-9_]{2,24}$.

const MAX = 1000000;
const clampInt = (n) => Math.max(0, Math.min(MAX, Math.round(n)));

/** Higher-is-better points, sent unchanged. */
export function points(unit = 'pts') {
  return {
    kind: 'points',
    toServer: (raw) => (Number.isFinite(+raw) ? clampInt(+raw) : null),
    fromServer: (n) => n,
    short: (n) => String(Math.round(+n || 0)),
    format: (n) => `${Math.round(+n || 0)} ${unit}`,
  };
}

/** Lower-is-better time in seconds → tenths of a second under capSec (higher is better on the server). */
export function fasterTime(capSec = 600) {
  const fmt = (sec) => {
    const t = Math.max(0, Math.round(sec * 10)) / 10;
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  };
  const back = (n) => capSec - (+n || 0) / 10;
  return {
    kind: 'time',
    toServer: (sec) => (Number.isFinite(+sec) && +sec > 0 && +sec < capSec ? clampInt((capSec - +sec) * 10) : null),
    fromServer: back,
    short: (n) => fmt(back(n)),
    format: (n) => fmt(back(n)),
  };
}

/** Door order (as the calendar and the mini-game registry). Titles are a fallback for ctx.minigames.get(id).title. */
export const GAMES = [
  { id: 'snowball', title: 'Snowball Fight!', door: 5, map: points() },
  { id: 'ornaments', title: 'Ornament Hunt', door: 6, map: points() },
  { id: 'sled', title: 'Sledge Hill Race', door: 7, map: points() },
  { id: 'cookies', title: 'Cookie Bakery', door: 8, map: points() },
  { id: 'skate', title: 'Figure Skating', door: 9, map: points() },
  { id: 'tram', title: 'Tram Conductor', door: 11, map: points() },
  { id: 'giftwrap', title: 'Gift Wrapping', door: 12, map: points() },
  { id: 'snowman', title: 'Snowman Contest', door: 13, map: points() },
  { id: 'sled2', title: 'Sledge Hill Race II', door: 16, map: points() },
  { id: 'carols', title: 'Carol Singing', door: 17, map: points() },
  { id: 'cocoa', title: 'Hot Cocoa Hut', door: 19, map: points() },
  { id: 'presents', title: 'Present Delivery', door: 21, map: points() },
  { id: 'pack', title: 'Pack the Sleigh', door: 23, map: points() },
];
const BY_ID = new Map(GAMES.map((g) => [g.id, g]));
const ID_RE = /^[a-z0-9_]{2,24}$/;
const FALLBACK = points();

export const validGame = (id) => typeof id === 'string' && ID_RE.test(id);
export const gameInfo = (id) => BY_ID.get(id) || null;
const mapOf = (id) => (BY_ID.get(id) || {}).map || FALLBACK;

/** The game's raw result (mg.finish score, or seconds for a time game) → server p_score, or null (nothing to send). */
export function toServer(id, raw) { return validGame(id) ? mapOf(id).toServer(raw) : null; }
/** Server number → display with unit ("640 pts", "1:12.4"). */
export function format(id, n) { return mapOf(id).format(n); }
/** Server number → display without unit ("640", "1:12.4"), for "You beat Ava's 590!". */
export function formatShort(id, n) { return mapOf(id).short(n); }
