// Saved player profile (name + style) in localStorage, shared by the entry screen and the in-game wardrobe.
import { STYLE_OPTIONS, DEFAULT_STYLE } from '../core/player.js';

const KEY = 'tinselby.profile';

export function loadProfile() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return v; } catch (e) { /* private mode */ }
  return {};
}
export function saveProfile(patch) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadProfile(), ...patch })); } catch (e) { /* ignore */ }
}

/** A complete style: defaults ← saved values that still exist and are unlocked (data.isUnlocked). */
export function validStyle(saved, data) {
  const style = {};
  for (const slot of Object.keys(STYLE_OPTIONS)) {
    const keys = Object.keys(STYLE_OPTIONS[slot]);
    const def = DEFAULT_STYLE[slot] in STYLE_OPTIONS[slot] ? DEFAULT_STYLE[slot] : keys[0];
    const v = saved && saved[slot];
    style[slot] = v in STYLE_OPTIONS[slot] && (!data || data.isUnlocked(slot, v)) ? v : def;
  }
  return style;
}
