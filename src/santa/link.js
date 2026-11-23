// Secret Santa invite links (shared contract with src/invite, which welcomes the friend who opens one):
//   santaInviteLink({town, name}) → `${origin}/?town=ABC234&santa=1&from=Ava`   (null without a valid town code)
// name: the sender's player name, cleaned like a card sender (src/cards/link.js cleanCardName: no control / bidi
// characters, no <>, ≤ 20 chars); 'A friend' when nothing is left. Never free text beyond the player's own name.
import { cleanCardName } from '../cards/link.js';
import { normTownCode } from '../net/core.js';

export const SANTA_LINK_TITLE = 'Secret Santa in Tinselby';
export const SANTA_LINK_TEXT = 'Join my Secret Santa in Tinselby! 🎁 We swap secret presents on Christmas Day.';

function origin() {
  try { if (location.origin && location.origin !== 'null' && /^https?:/.test(location.origin)) return location.origin; } catch (e) { /* */ }
  return 'https://tinselby-sepia.vercel.app';
}

export function santaInviteLink({ town, name } = {}) {
  const code = town ? normTownCode(town) : null;
  if (!code) return null;
  const from = cleanCardName(name) || 'A friend';
  return `${origin()}/?town=${code}&santa=1&from=${encodeURIComponent(from)}`;
}
