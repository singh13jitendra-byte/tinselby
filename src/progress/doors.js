// Advent door content (WAVE1.md §Doors). Door metadata is plain data so the calendar UI can render it directly.
//   { n, title, giver, district, kind: 'task'|'minigame'|'finale', task?, game?, reward?: {id, slot, key, label}, available, blurb }
// available = playable in this wave. Door 24 is the finale: available:false here, but its state is 'locked' (not 'soon')
// until doors 1–23 are done, then 'open'.

const reward = (slot, key, label) => ({ id: `${slot}:${key}`, slot, key, label });

// Wave 2 doors (9–16) are built behind ?w2 until release; flip W2 to true when they ship (WAVE2.md §Release).
const W2 = typeof location !== 'undefined' && /[?&]w2(&|=|$)/.test(location.search || '');

const SOON = ['Carol Singing', 'Postcard Day', 'Hot Cocoa Delivery', 'Snowball Fight II',
  'Light-up Puzzle', 'Skating Show', 'Letters to Santa'];

export const DOORS = [
  { n: 1, title: 'Lights for Holly Lane', giver: 'Mrs Holly', district: 'residential', kind: 'task', task: 'lights', reward: reward('scarf', 'candycane', 'Candy-cane scarf'), available: true, blurb: 'Help Mrs Holly switch on the wreath lights at three houses.' },
  { n: 2, title: 'The Lost Bauble', giver: 'Pip', district: 'park', kind: 'task', task: 'bauble', reward: reward('hat', 'santa', 'Santa hat'), available: true, blurb: 'Pip dropped a shiny bauble somewhere in the snowy park.' },
  { n: 3, title: "Ilse's Scarf", giver: 'Ilse', district: 'lakeside', kind: 'task', task: 'scarf', reward: reward('coat', 'plum', 'Plum coat'), available: true, blurb: "The wind blew Ilse's scarf out onto the frozen lake." },
  { n: 4, title: 'Star of Sledge Hill', giver: 'Bram', district: 'hill', kind: 'task', task: 'star', reward: reward('hat', 'reindeer', 'Reindeer hat'), available: true, blurb: 'Ride the cable car up for the tree star and keep it safe by the big tree.' },
  { n: 5, title: 'Snowball Fight!', giver: 'Tilly', district: 'park', kind: 'minigame', game: 'snowball', reward: reward('scarf', 'gold', 'Gold scarf'), available: true, blurb: 'A friendly snowball fight with the kids of Pinecone Park.' },
  { n: 6, title: 'Ornament Hunt', giver: 'Mr Pine', district: 'market', kind: 'minigame', game: 'ornaments', reward: reward('coat', 'navy', 'Navy coat'), available: true, blurb: 'Five knitted ornaments are hidden around Market Square.' },
  { n: 7, title: 'Sledge Hill Race', giver: 'Coach Sasha', district: 'hill', kind: 'minigame', game: 'sled', reward: reward('hat', 'elf', 'Elf hat'), available: true, blurb: 'Race a wooden sled down Sledge Hill, collecting stars.' },
  { n: 8, title: 'Cookie Bakery', giver: 'Baker Bea', district: 'market', kind: 'minigame', game: 'cookies', reward: reward('coat', 'gingerbread', 'Gingerbread coat'), available: true, blurb: 'Cut, bake and decorate Christmas cookies with Baker Bea.' },
  { n: 9, title: 'Figure Skating', giver: 'Ilse', district: 'lakeside', kind: 'minigame', game: 'skate', reward: reward('coat','icy','Ice-blue coat'), available: W2, blurb: "Glide glowing patterns across Frostmere Lake in time with the music." },
  { n: 10, title: 'Your Own House', giver: 'Mayor Tinsel', district: 'market', kind: 'task', task: 'house', reward: reward('scarf','holly','Holly scarf'), available: W2, blurb: "The Mayor has a cottage on Holly Lane just for you. Make it cosy!" },
  { n: 11, title: 'Tram Conductor', giver: 'Conductor Clem', district: 'market', kind: 'minigame', game: 'tram', reward: reward('hat', 'conductor', "Conductor's cap"), available: W2, blurb: "Drive the festive tram and stop smoothly for every passenger." },
  { n: 12, title: 'Gift Wrapping', giver: 'Auntie Noor', district: 'market', kind: 'minigame', game: 'giftwrap', reward: reward('hat','bow','Ribbon bow'), available: W2, blurb: "Wrap presents with Auntie Noor: paper, folds, tape and a bow." },
  { n: 13, title: 'Snowman Contest', giver: 'Pip', district: 'park', kind: 'minigame', game: 'snowman', reward: reward('coat','snowy','Snowy coat'), available: W2, blurb: "Roll, stack and dress the best snowman in Pinecone Park." },
  { n: 14, title: 'Ferris Wheel Gnomes', giver: 'Otto', district: 'lakeside', kind: 'task', task: 'gnomes', reward: reward('hat','gnome','Gnome hat'), available: W2, blurb: "The Ferris wheel gnomes are hiding round the lake. Round them up!" },
  { n: 15, title: 'The Lost Reindeer', giver: 'Elf Pepper', district: 'park', kind: 'task', task: 'reindeer', reward: reward('scarf','jingle','Jingle-bell scarf'), available: W2, blurb: "Follow glowing hoofprints to find Clover, one of Santa's reindeer." },
  { n: 16, title: 'Sledge Hill Race II', giver: 'Coach Sasha', district: 'hill', kind: 'minigame', game: 'sled2', reward: reward('coat','midnight','Midnight coat'), available: W2, blurb: "A night race down Sledge Hill through lantern gates and bells." },
  ...SOON.map((title, i) => ({ n: 17 + i, title, giver: '', district: '', kind: 'task', available: false, blurb: 'Coming soon!' })),
  { n: 24, title: 'Christmas Eve', giver: 'Mayor Tinsel', district: 'market', kind: 'finale', available: false, blurb: 'Place the star on the big tree and welcome Santa to Tinselby.' },
];

export const FINALE_DOOR = 24;
export const door = (n) => DOORS[n - 1] || null;
export const doorForGame = (gameId) => DOORS.find((d) => d.game === gameId) || null;
export const doorForTask = (taskId) => DOORS.find((d) => d.task === taskId) || null;

/** Wardrobe keys everyone owns from the start (rewards add to these). */
export const DEFAULT_UNLOCKED = {
  coat: ['red', 'teal', 'cream', 'mustard', 'green'],
  hat: ['bobble', 'earflap', 'earmuffs', 'none'],
  scarf: ['green', 'red', 'white', 'striped'],
};
export const GATED_SLOTS = ['coat', 'hat', 'scarf'];

/** Daily-gift bonus colours, handed out in this order (first one not yet owned, starting at the claim count). */
export const DAILY_REWARDS = [
  reward('scarf', 'berry', 'Berry scarf'),
  reward('coat', 'forest', 'Forest coat'),
  reward('scarf', 'sky', 'Sky-blue scarf'),
  reward('scarf', 'mint', 'Mint scarf'),
];
/** Once every bonus colour is owned, the box holds a little treat instead (not stored). */
export const DAILY_TREATS = [
  { id: 'treat:cocoa', slot: null, key: null, label: 'A mug of hot cocoa' },
  { id: 'treat:gingerbread', slot: null, key: null, label: 'A gingerbread biscuit' },
  { id: 'treat:candycane', slot: null, key: null, label: 'A candy cane' },
  { id: 'treat:clementine', slot: null, key: null, label: 'A sweet clementine' },
];

/** Every wardrobe reward by id. */
export const REWARDS = Object.fromEntries([...DOORS.filter((d) => d.reward).map((d) => d.reward), ...DAILY_REWARDS].map((r) => [r.id, r]));

/** Doors done → the festive level (0–4) that drives city lights, music layers and the evening sky. */
export function festiveLevel(done) {
  if (done <= 0) return 0;
  if (done <= 2) return 1;
  if (done <= 4) return 2;
  if (done <= 6) return 3;
  return 4;
}
