// Wardrobe pieces as Secret Santa presents. Server items are style ids `slot.key` (PHASE3.md: ^[a-z]+\.[a-z0-9]+$);
// the progress / rewards system uses reward ids `slot:key` (src/progress/doors.js REWARDS).
import { REWARDS, WISH_REWARDS, DAILY_REWARDS, STREAK_REWARDS, DOORS, GATED_SLOTS } from '../progress/doors.js';
import { STYLE_OPTIONS } from '../core/player.js';
import { ICONS, REWARD_GLYPH } from '../ui/icons.js';

const WISH = new Set(WISH_REWARDS.map((r) => r.id));
const GLYPH = {
  hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c0-7 16-7 16 0z" fill="currentColor"/><rect x="3" y="16" width="18" height="4" rx="2" fill="currentColor" opacity=".75"/><circle cx="12" cy="6" r="2.6" fill="currentColor"/></svg>',
  scarf: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="7" rx="8" ry="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M13 9l4 .4 1 11-4 .3zM10 9.5l3 .3-1.5 9.5-3.6-.6z" fill="currentColor"/></svg>',
  coat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l5 3.5.6 6.5-3 .2V21H6.4v-7.8l-3-.2L4 6.5z" fill="currentColor"/></svg>',
};
// hats have names, not colours, in STYLE_OPTIONS: give each a knitted colour for its tile
const HAT_COL = { santa: '#c0302c', reindeer: '#8a5a3c', elf: '#3c8d4a', conductor: '#34486e', bow: '#b5332e', gnome: '#b5332e', tophat: '#3a3236', parcel: '#d9a03a', starlight: '#e3aa3a', bobble: '#b5332e', earflap: '#6f9463', earmuffs: '#ab90d6' };
const SWATCH = { striped: 'repeating-linear-gradient(45deg,#b8302d 0 7px,#f5f1ea 7px 14px)' };

export const itemToReward = (item) => (typeof item === 'string' && /^[a-z]+\.[a-z0-9]+$/.test(item) ? item.replace('.', ':') : null);
export const rewardToItem = (id) => (typeof id === 'string' && /^[a-z]+:[a-z0-9]+$/.test(id) ? id.replace(':', '.') : null);
/** A piece that may be a Secret Santa present: a known coat / hat / scarf reward, never one of Santa's wish gifts. */
export const isPresent = (id) => !!id && !!REWARDS[id] && GATED_SLOTS.includes(REWARDS[id].slot) && !WISH.has(id);

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.3;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
/** {id, item, slot, key, label, glyph, bg (css), ink (glyph colour)} for a reward id or item; null if unknown. */
export function pieceInfo(idOrItem) {
  const id = idOrItem && idOrItem.includes('.') ? itemToReward(idOrItem) : idOrItem;
  const r = id && REWARDS[id];
  if (!r) return null;
  const v = STYLE_OPTIONS[r.slot]?.[r.key];
  let bg = r.slot === 'hat' ? HAT_COL[r.key] || '#b5332e' : SWATCH[r.key] || (typeof v === 'string' && (v.startsWith('#') || v.includes('gradient(')) ? v : '#b5332e');
  const light = bg.startsWith('#') ? luminance(bg) > 0.72 : false;
  return { id, item: rewardToItem(id), slot: r.slot, key: r.key, label: r.label, glyph: REWARD_GLYPH[id] || GLYPH[r.slot] || ICONS.gift, bg, ink: light ? '#7a5a3a' : '#fffaf0' };
}
/** Label for any item string (unknown ones get a friendly fallback). */
export const itemLabel = (item) => pieceInfo(item)?.label || (item ? 'a cosy surprise' : 'a surprise from the elves');

/** Your pieces that can be given: owned, giftable, ordered coat / hat / scarf. */
export function ownedPresents(ctx) {
  let owned = [];
  try { owned = ctx.progress?.rewards?.owned?.() || []; } catch (e) { owned = []; }
  const order = { coat: 0, hat: 1, scarf: 2 };
  return owned.filter(isPresent).map(pieceInfo).filter(Boolean).sort((a, b) => order[a.slot] - order[b.slot] || a.label.localeCompare(b.label));
}
/** Pieces the elves can wrap when you have nothing of your own yet (door + daily pieces). */
export const ELF_POOL = [...DOORS.filter((d) => d.reward).map((d) => d.reward.id), ...DAILY_REWARDS.map((r) => r.id)].filter(isPresent);
/** The town's present: the first piece in this list you don't own yet (null = you have them all). */
const TOWN_POOL = [...DAILY_REWARDS.map((r) => r.id), ...STREAK_REWARDS.map((r) => r.id), ...DOORS.filter((d) => d.reward).map((d) => d.reward.id)].filter(isPresent);
export function townPresent(ctx, avoid = []) {
  const has = (id) => { try { return !!ctx.progress?.rewards?.has?.(id); } catch (e) { return true; } };
  return TOWN_POOL.find((id) => !has(id) && !avoid.includes(id)) || null;
}

/** Tile HTML (the same look in the picker, the match card and the reveal list). */
export function tileHTML(p, { small = false } = {}) {
  if (!p) return `<span class="tbsa-sw${small ? ' sm' : ''}" style="--bg:var(--gold);--ink:#fffaf0">${ICONS.gift}</span>`;
  return `<span class="tbsa-sw${small ? ' sm' : ''}" style="--bg:${p.bg};--ink:${p.ink}">${p.glyph}</span>`;
}
