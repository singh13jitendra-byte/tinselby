// Invite / card link parsing for the welcome (src/invite). Links look like  /?from=Ava&card=tree.g1.f2&town=ABC234
// The card format and greeting texts belong to the card maker (src/cards/link.js); this only adds the invite bits.
import { cleanName } from '../core/names.js';
import { normTownCode } from '../net/core.js';
import { parseCard, greetingText, cleanCardName } from '../cards/link.js';

const toParams = (search) => (search && typeof search.get === 'function' ? search : new URLSearchParams(String(search || '')));

/**
 * search (string or URLSearchParams) → null when there's no ?from, else
 * {from (clean, ≤ 20 chars, all-ages filtered), hasCard, scene, greeting, greetingText, frame, town (valid code | null)}
 */
export function parseInvite(search) {
  const p = toParams(search);
  if (!p.has('from')) return null;
  let card = null;
  try { card = parseCard(p); } catch (e) { card = null; }
  // bidi / control characters out (card module), then the game's own name filter (odd characters, rude words)
  const from = cleanName(cleanCardName(p.get('from')), 'A friend').slice(0, 20);
  return {
    from,
    hasCard: !!card,
    scene: card?.scene || null,
    greeting: card?.greeting || null,
    greetingText: card?.greeting ? String(greetingText(card.greeting) || '').slice(0, 60) : '',
    frame: card?.frame || null,
    town: normTownCode(p.get('town') || ''),
  };
}
