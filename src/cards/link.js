// Christmas card links (shared with src/invite, which shows "Ava sent you: Merry Christmas!" on the welcome card).
//   cardLink({name, scene, greeting, frame, town}) → `${origin}/?from=Ava&card=tree.g1.f2&town=ABC234`
//   parseCard(search) → {from, scene, greeting, frame, town} | null   (every id validated against the lists below)
//   greetingText(id) → the greeting line ('' when unknown)
// Ready-made greetings only: there is no free text anywhere on a card (all-ages game).
import { normTownCode } from '../net/core.js';

/** Card scenes: the three landmark shots + 'photo' (a photo taken in photo mode). */
export const SCENES = [
  { id: 'tree', label: 'Big tree' },
  { id: 'wheel', label: 'Ferris wheel' },
  { id: 'park', label: 'Snowy park' },
  { id: 'photo', label: 'My photo' },
];
export const GREETINGS = [
  { id: 'g1', text: 'Merry Christmas!' },
  { id: 'g2', text: 'Happy holidays from Tinselby!' },
  { id: 'g3', text: 'Season’s greetings!' },
  { id: 'g4', text: 'Warm wishes!' },
  { id: 'g5', text: 'Ho ho ho!' },
];
export const FRAMES = [
  { id: 'f1', label: 'Red knit' },
  { id: 'f2', label: 'Green knit' },
  { id: 'f3', label: 'Cream holly' },
];
export const NAME_MAX = 20;

const has = (list, id) => list.some((x) => x.id === id);
export const greetingText = (id) => (GREETINGS.find((g) => g.id === id) || {}).text || '';

/** Sender name for a link / welcome: control + bidi-override characters and <> removed, spaces squashed, ≤ 20 chars. */
const badChar = (c) => { // char-code test, not a regex: the bundler writes U+2028 in a regex literal out as a raw line break
  const n = c.charCodeAt(0);
  return n < 32 || (n >= 0x7f && n <= 0x9f) || (n >= 0x200b && n <= 0x200f) || (n >= 0x2028 && n <= 0x202e) || (n >= 0x2066 && n <= 0x2069) || n === 0xfeff || c === '<' || c === '>';
};
export function cleanCardName(raw) {
  let s = '';
  for (const c of String(raw ?? '')) s += badChar(c) ? '' : c;
  return Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();
}

function origin() {
  try { if (location.origin && location.origin !== 'null') return location.origin; } catch (e) { /* */ }
  return 'https://tinselby-sepia.vercel.app';
}

/** The link a card carries. Unknown ids fall back to the first of each list; town only when it is a valid code. */
export function cardLink({ name, scene, greeting, frame, town } = {}) {
  const sc = has(SCENES, scene) ? scene : SCENES[0].id;
  const gr = has(GREETINGS, greeting) ? greeting : GREETINGS[0].id;
  const fr = has(FRAMES, frame) ? frame : FRAMES[0].id;
  const from = cleanCardName(name) || 'A friend';
  let url = `${origin()}/?from=${encodeURIComponent(from)}&card=${sc}.${gr}.${fr}`;
  const code = town ? normTownCode(town) : null;
  if (code) url += `&town=${code}`;
  return url;
}

/**
 * search: '?from=…&card=…' (or a full URL, or URLSearchParams) → null when there is no `card` parameter or none of its
 * three ids is known; else {from: clean name | null, scene, greeting, frame, town} with anything unknown = null.
 */
export function parseCard(search) {
  let p;
  try {
    if (search && typeof search.get === 'function') p = search;
    else {
      let s = String(search ?? '');
      const q = s.indexOf('?');
      if (q >= 0) s = s.slice(q + 1);
      p = new URLSearchParams(s.split('#')[0]);
    }
  } catch (e) { return null; }
  const card = p.get('card');
  if (!card || card.length > 40) return null;
  const [sc, gr, fr] = card.split('.');
  const scene = has(SCENES, sc) ? sc : null, greeting = has(GREETINGS, gr) ? gr : null, frame = has(FRAMES, fr) ? fr : null;
  if (!scene && !greeting && !frame) return null;
  const from = cleanCardName(p.get('from')) || null;
  const t = p.get('town');
  const town = t ? normTownCode(t) : null;
  return { from, scene, greeting, frame, town };
}
