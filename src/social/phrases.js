// Ready-made phrases and emotes for Play together. The ONLY chat in Tinselby: players pick from this table, the net
// sends the phrase id (`say {p}`), and every receiver turns the id back into text here (never send text).
// Ids are kebab-case, ≤ 24 chars (the net validates /^[a-z0-9-]{1,24}$/). All lines are short, warm and all-ages.
// Receivers: `phraseText(id)` → string | null (unknown ids are ignored, so old clients stay safe).

/** The 4 wheel tabs, ~20 phrases. */
export const PHRASE_TABS = [
  { id: 'hello', label: 'Hello', phrases: [
    { id: 'hello', text: 'Hello!' },
    { id: 'hi-friend', text: 'Hi, friend!' },
    { id: 'nice-to-meet', text: 'Nice to meet you!' },
    { id: 'nice-hat', text: 'Nice hat!' },
    { id: 'thank-you', text: 'Thank you!' },
  ] },
  { id: 'fun', label: 'Fun', phrases: [
    { id: 'follow-me', text: 'Follow me!' },
    { id: 'race-sledge', text: 'Race you to the sledge hill!' },
    { id: 'ride-ferris', text: 'Want to ride the Ferris wheel?' },
    { id: 'snowball-fight', text: 'Snowball fight?' },
    { id: 'well-done', text: 'Well done!' },
  ] },
  { id: 'christmas', label: 'Christmas', phrases: [
    { id: 'merry-xmas', text: 'Merry Christmas!' },
    { id: 'love-lights', text: 'I love the lights!' },
    { id: 'cocoa-time', text: 'Hot cocoa time!' },
    { id: 'ho-ho-ho', text: 'Ho ho ho!' },
    { id: 'feeling-festive', text: 'Feeling festive!' },
  ] },
  { id: 'help', label: 'Help', phrases: [
    { id: 'can-you-help', text: 'Can you help me?' },
    { id: 'im-lost', text: 'I’m a little lost!' },
    { id: 'wait-for-me', text: 'Wait for me!' },
    { id: 'sorry', text: 'Sorry!' },
    { id: 'bye-see-you', text: 'Bye, see you soon!' },
  ] },
];

/** id → text for every phrase. */
export const PHRASE_TEXT = Object.freeze(Object.fromEntries(PHRASE_TABS.flatMap((t) => t.phrases.map((p) => [p.id, p.text]))));
export const PHRASE_IDS = Object.freeze(Object.keys(PHRASE_TEXT));
export const isPhrase = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PHRASE_TEXT, id);
/** Text for a phrase id, or null when unknown (receivers drop unknown ids). */
export const phraseText = (id) => (isPhrase(id) ? PHRASE_TEXT[id] : null);

/** The 8 emotes (ids match the net `emote {e}` payload and `player.emote(name)`). `icon` is a key into wheel.js's glyphs. */
export const EMOTES = [
  { id: 'wave', label: 'Wave' },
  { id: 'cheer', label: 'Cheer' },
  { id: 'dance', label: 'Dance' },
  { id: 'clap', label: 'Clap' },
  { id: 'heart', label: 'Heart' },
  { id: 'laugh', label: 'Laugh' },
  { id: 'bow', label: 'Bow' },
  { id: 'snowangel', label: 'Snow angel' },
];
export const EMOTE_IDS = Object.freeze(EMOTES.map((e) => e.id));
export const isEmote = (id) => EMOTE_IDS.includes(id);
