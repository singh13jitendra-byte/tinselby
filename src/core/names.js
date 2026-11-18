// Player-name hygiene for a public, all-ages shared town. Used by the entry screen and by remote name tags.
// Deliberately simple: strip odd characters, cap length, and replace names containing blocked words.
// Matched anywhere in the squashed name (unambiguous):
const ANYWHERE = ['fuck', 'shit', 'bitch', 'cunt', 'pussy', 'asshole', 'whore', 'nigg', 'nazi', 'hitler', 'porn', 'penis', 'vagina',
  'suicide', 'chutiya', 'madarchod', 'bhenchod', 'behenchod', 'gandu', 'bsdk', 'fvck', 'phuck'];
// Matched only as a whole word, so real names survive (Dickens, Essex, Hancock, Skiller, Grape, Brandi, Scunthorpe …):
const WHOLE = ['dick', 'cock', 'slut', 'fag', 'rape', 'sex', 'sexy', 'boob', 'boobs', 'kill', 'killer', 'randi', 'bastard'];
// Hindi abuse abbreviations: only when the whole name is made of them (so 'Mc Donald' is fine)
const ABBR = ['mc', 'bc'];
const CUTE = ['Snowflake', 'Pom-pom', 'Gingerbread', 'Mitten', 'Cocoa', 'Tinsel', 'Jingle', 'Sprout', 'Holly', 'Pudding'];

/** Normalise and filter a display name. Returns a safe name (never empty). */
export function cleanName(raw, fallback = 'Traveller') {
  let s = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f<>{}\[\]\\`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  if (!s) return fallback;
  // leetspeak first (sh1t, b1tch), then squash to letters
  const leet = s.toLowerCase().replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't');
  const flat = leet.replace(/[^a-zऀ-ॿ]/g, '');
  const words = leet.split(/[^a-z]+/).filter(Boolean);
  const hit = ANYWHERE.some((w) => flat.includes(w)) || WHOLE.some((w) => words.includes(w)) || (words.length > 0 && words.every((w) => ABBR.includes(w)));
  if (hit) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return CUTE[Math.abs(h) % CUTE.length];
  }
  return s;
}
