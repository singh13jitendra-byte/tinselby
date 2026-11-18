// The 16 hiding places. x, z in world metres (Market Square); each rhyme names a landmark that really stands next to the spot
// (checked against src/city/market.js and src/calendar/index.js). {orn} becomes the ornament's name.
export const SPOTS = [
  { id: 'nwStall', x: -5.35, z: -4.15, at: 'behind the red-striped north-west stall', clue: ['Behind the red-striped stall, in the north-west nook,', 'a {orn} is hiding. Go and take a look!'] },
  { id: 'neStall', x: 5.35, z: -4.15, at: 'behind the teal-striped north-east stall', clue: ['Behind the teal-striped stall in its snowy hat,', 'a {orn} is hiding there. Fancy that!'] },
  { id: 'westStall', x: -5.6, z: 0.25, at: 'behind the green-striped west stall', clue: ['Green stripes on the west side, snug and tall:', 'a {orn} is hiding behind the stall.'] },
  { id: 'backStall', x: 2.4, z: -5.15, at: 'behind the red stall at the back', clue: ['Round the back of the red stall, far to the north,', 'a {orn} is tucked away. Come on, sally forth!'] },
  { id: 'bakery', x: 5.7, z: -0.4, at: 'behind the Warm Cookies stall', clue: ['Follow your nose to the cookies, warm and sweet;', 'a {orn} hides behind them, a secret treat.'] },
  { id: 'advent', x: -2.3, z: -3.75, at: 'at the foot of the Advent calendar', clue: ['Twenty-four little doors, all knitted and neat,', 'a {orn} sits beside the calendar\'s feet.'] },
  { id: 'clock', x: -2.1, z: -0.9, at: 'by the countdown clock post', clue: ['Tick-tock, the clock counts down to the day;', 'a {orn} waits by its post, not far away.'] },
  { id: 'tree', x: 1.3, z: -0.6, at: 'in the big tree\'s knitted skirt', clue: ['Beneath the great tree, where the golden star shines bright,', 'a {orn} is nestled in its skirt, snug and tight.'] },
  { id: 'eastBench', x: 3.25, z: -1.0, at: 'beside the bench by the tree', clue: ['Tired feet can rest on the bench by the tree;', 'a {orn} is hiding close. Can you see?'] },
  { id: 'westBench', x: -3.2, z: 1.45, at: 'by the bench where Mr Pine stands', clue: ['By the bench where Mr Pine likes to sit,', 'a {orn} is hiding. Go and find it!'] },
  { id: 'fir', x: -2.8, z: 4.15, at: 'at the little fir with the presents', clue: ['A little fir stands tall with presents at its feet;', 'a {orn} hides there too, tucked in, snug and neat.'] },
  { id: 'barrel', x: 3.35, z: 1.5, at: 'by the barrel and basket', clue: ['Beside the barrel and the basket, with gifts piled high,', 'a {orn} sits quietly, hoping you\'ll come by.'] },
  { id: 'carousel', x: 3.0, z: 3.8, at: 'by the carousel', clue: ['Where carousel horses go round and round,', 'a {orn} is hiding, waiting to be found.'] },
  { id: 'lamp', x: -1.4, z: 4.8, at: 'at the left lamp of the south gate', clue: ['By the south-gate lamp on the left as you stroll in,', 'a {orn} hides in the snow. Let the search begin!'] },
  { id: 'snowman', x: 2.0, z: -3.6, at: 'by the snowman in the teal hat', clue: ['A snowman in a teal hat stands guard, round and tall;', 'a {orn} sits at his feet, the smallest of all.'] },
  { id: 'seGifts', x: 4.55, z: 4.6, at: 'by the south-east gift pile', clue: ['In the south-east corner, where parcels wait in bows,', 'a {orn} is hiding. Nobody knows!'] },
];
