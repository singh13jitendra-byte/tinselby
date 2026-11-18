// Snowman Contest (door 13): pure rules + scoring (no THREE / DOM, so it can be unit-tested in Node).
// Three judges ("Tilly's friends") each hold up a felt card 1–10:
//   Rosie  = rolling: how close each ball came to its size band (75 %) + how quickly you rolled (25 %)
//   Theo   = stacking: how centred each upper ball landed
//   Mabel  = style: decorations that go together (one theme: classic / cosy / sparkly)
// card = clamp(round(2 + 8q), 4, 10)  → finishing always gives ≥ 12 / 30 (1★); 2★ ≥ 20, 3★ ≥ 26.

export const BANDS = [
  { name: 'base', label: 'Base', min: 0.19, max: 0.23 },
  { name: 'middle', label: 'Middle', min: 0.14, max: 0.17 },
  { name: 'head', label: 'Head', min: 0.09, max: 0.12 },
];
/** Smallest ball the build ring accepts (below the band: allowed, but Rosie notices). */
export const MIN_R = [0.15, 0.105, 0.07];
export const START_R = 0.05;
export const CAP_R = 0.24;
export const STARS = [12, 20, 26];
export const ROLL_LIMIT = 75; // s; when it runs out the current ball is delivered as it is (and missing ones at minimum size)
export const SPEED_FULL = 30, SPEED_ZERO = 65; // rolling time for full / no speed credit
export const JUDGES = ['Rosie', 'Theo', 'Mabel'];

export const THEMES = ['classic', 'cosy', 'sparkly'];
export const SLOTS = [
  { slot: 'eyes', label: 'Eyes', choices: [
    { key: 'coal', label: 'Coal', theme: 'classic' }, { key: 'buttons', label: 'Buttons', theme: 'cosy' }, { key: 'berries', label: 'Berries', theme: 'sparkly' }] },
  { slot: 'nose', label: 'Nose', choices: [
    { key: 'carrot', label: 'Carrot', theme: 'classic' }, { key: 'pinecone', label: 'Pine cone', theme: 'cosy' }, { key: 'star', label: 'Star', theme: 'sparkly' }] },
  { slot: 'hat', label: 'Hat', choices: [
    { key: 'top', label: 'Top hat', theme: 'classic' }, { key: 'bobble', label: 'Bobble hat', theme: 'cosy' }, { key: 'holly', label: 'Holly crown', theme: 'sparkly' }] },
  { slot: 'scarf', label: 'Scarf', choices: [
    { key: 'red', label: 'Red', theme: 'classic' }, { key: 'striped', label: 'Stripy', theme: 'cosy' }, { key: 'gold', label: 'Gold', theme: 'sparkly' }] },
  { slot: 'arms', label: 'Arms', choices: [
    { key: 'twigs', label: 'Twigs', theme: 'classic' }, { key: 'mittens', label: 'Mittens', theme: 'cosy' }, { key: 'canes', label: 'Candy canes', theme: 'sparkly' }] },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 0..1: 1 inside the band, falling to 0 at 0.035 outside it. */
export function sizeQ(r, i) {
  const b = BANDS[i];
  if (r >= b.min && r <= b.max) return 1;
  const d = r < b.min ? b.min - r : r - b.max;
  return clamp(1 - d / 0.035, 0, 1);
}
export function speedQ(rollTime) { return clamp((SPEED_ZERO - rollTime) / (SPEED_ZERO - SPEED_FULL), 0, 1); }
/** Stack accuracy of one drop: |offset| / swing amplitude → 1 within 10 %, 0 beyond 90 %. */
export function stackAcc(offset, amp) { return clamp(1 - (Math.abs(offset) / amp - 0.1) / 0.8, 0, 1); }
export function themeOf(slot, key) { const s = SLOTS.find((x) => x.slot === slot); return s?.choices.find((c) => c.key === key)?.theme || null; }
/** { q, theme, count }: the theme most of the picks share. */
export function styleQ(picks) {
  const n = {};
  for (const s of SLOTS) { const t = themeOf(s.slot, picks[s.slot]); if (t) n[t] = (n[t] || 0) + 1; }
  let theme = null, count = 0;
  for (const t of THEMES) if ((n[t] || 0) > count) { count = n[t]; theme = t; }
  return { q: [0.3, 0.3, 0.45, 0.65, 0.85, 1][count], theme, count };
}
export function card(q) { return clamp(Math.round(2 + 8 * q), 4, 10); }

/** Everything the judges need. radii[3], offsets/amps[2], picks {slot: key}, rollTime s. */
export function judge({ radii, offsets, amps, picks, rollTime }) {
  const sizes = radii.map((r, i) => sizeQ(r, i));
  const size = sizes.reduce((a, b) => a + b, 0) / 3;
  const speed = speedQ(rollTime);
  const accs = offsets.map((o, i) => stackAcc(o, amps[i]));
  const stack = accs.reduce((a, b) => a + b, 0) / accs.length;
  const st = styleQ(picks);
  const cards = [card(0.75 * size + 0.25 * speed), card(stack), card(st.q)];
  const total = cards[0] + cards[1] + cards[2];
  const stars = total >= STARS[2] ? 3 : total >= STARS[1] ? 2 : 1;
  return { cards, total, stars, sizes, size, speed, accs, stack, style: st };
}

const pickOf = (arr, seed) => arr[Math.abs(seed | 0) % arr.length];
/** Cheerful one-liners per judge (no emoji, Christmas only). */
export function comments(res, seed = 0) {
  const [a, b, c] = res.cards;
  const size = a >= 9 ? (res.speed >= 1 ? ['Perfect sizes, and so quick!', 'Just the right sizes!'] : ['Perfect proportions!', 'Just the right sizes!'])
    : a >= 7 ? ['Lovely round snowballs!', 'Nice and chunky!'] : ['What a funny shape!', 'Wobbly but wonderful!'];
  const stack = b >= 9 ? ['Not a wobble in sight!', 'Straight as a candle!'] : b >= 7 ? ['Nice and steady!', 'Only a tiny lean!'] : ['He leans to say hello!', 'A bit wobbly, very brave!'];
  const T = { classic: 'A proper classic!', cosy: 'So cosy and snug!', sparkly: 'So sparkly and festive!' };
  const style = res.style.count >= 4 ? [T[res.style.theme]] : res.style.count === 3 ? ['Lovely outfit!', 'Very smart!'] : ['What a fun mix!', 'So many ideas!'];
  return [pickOf(size, seed), pickOf(stack, seed + 1), pickOf(style, seed + 2)];
}
