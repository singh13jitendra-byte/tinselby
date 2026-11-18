// Pure rules for the Ornament Hunt (no three.js, no DOM) so sim.mjs can test pacing and stars in node.
export const TIME = 105;       // seconds. 90 s was tight once every ornament has a riddle to read (see sim.mjs)
export const BEAM_T = 20;      // s on the current ornament before a sparkle beam rises from its spot
export const SHOW_T = 40;      // s before the "Show me" button appears
export const SHOW_COST = 40;   // score points per "Show me"
export const SEE = 3.5;        // ground sparkle visibility radius (m)
export const PICK_R = 1.0;

/** 0 (cold) .. 1 (burning) from distance in metres to the ornament being hunted. */
export const heat = (d) => Math.max(0, Math.min(1, 1 - (d - 1.0) / 7.5));
export const heatWord = (w) => (w > 0.88 ? 'Burning hot!' : w > 0.7 ? 'Hot!' : w > 0.45 ? 'Warm' : w > 0.2 ? 'Cool' : 'Cold');
/** Seconds between pulses / chimes: slow when cold, quick when hot. */
export const pulsePeriod = (w) => 2.4 - w * 2.0;

/** found 0-5, secs left, shows = "Show me" hints used. */
export function scoreFor({ found, secs, shows }) {
  const base = found * 100 + Math.floor(secs) * 3 + (found >= 5 ? 50 : 0) - shows * SHOW_COST;
  return Math.max(0, base);
}
export function starsFor({ found, secs, shows }) {
  if (found >= 5) return secs >= 30 && shows <= 1 ? 3 : 2;
  return found >= 3 ? 1 : 0;
}
