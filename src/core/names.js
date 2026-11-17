// Player-name hygiene for a public, all-ages shared town. Used by the entry screen and by remote name tags.
// Deliberately simple: strip odd characters, cap length, and replace names containing blocked words.
const BLOCK = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'slut', 'whore', 'fag', 'nigg',
  'rape', 'nazi', 'hitler', 'porn', 'sex', 'penis', 'vagina', 'boob', 'kill', 'suicide', 'chutiya', 'madarchod',
  'bhenchod', 'behenchod', 'gandu', 'randi', 'bsdk', 'mc', 'bc',
];
const CUTE = ['Snowflake', 'Pom-pom', 'Gingerbread', 'Mitten', 'Cocoa', 'Tinsel', 'Jingle', 'Sprout', 'Holly', 'Pudding'];

/** Normalise and filter a display name. Returns a safe name (never empty). */
export function cleanName(raw, fallback = 'Traveller') {
  let s = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f<>{}\[\]\\`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  if (!s) return fallback;
  const flat = s.toLowerCase().replace(/[^a-zऀ-ॿ]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
  const words = s.toLowerCase().split(/[^a-z]+/);
  const hit = BLOCK.some((w) => (w.length <= 2 ? words.includes(w) : flat.includes(w)));
  if (hit) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return CUTE[Math.abs(h) % CUTE.length];
  }
  return s;
}
