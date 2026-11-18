// Tinselby city map — the single source of truth for where things are.
// Units: metres-ish toy scale (player ≈ 0.42 tall). x = east, z = south (north = −z). Ground y = 0 except the snow hill.
// Camera looks north from the south-south-east.

export const WORLD = { minX: -21, maxX: 21, minZ: -17, maxZ: 16 };

/** Districts as axis-aligned rects. Order matters for districtAt (first match wins). */
export const DISTRICTS = [
  { id: 'market', name: 'Market Square', rect: [-6.2, -5.4, 6.2, 5.4], center: [0, 0] },
  { id: 'residential', name: 'Holly Lane', rect: [-21, -7.5, -8.6, 7.5], center: [-14.5, 0] },
  { id: 'lakeside', name: 'Frostmere Lake', rect: [8.6, -7.5, 21, 9.5], center: [14.5, 1.5] },
  { id: 'park', name: 'Pinecone Park', rect: [-7.5, 7.6, 7.5, 16], center: [0, 11.5] },
  { id: 'hill', name: 'Sledge Hill', rect: [-8.5, -17, 9, -7.6], center: [0, -12] },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return d.id;
  }
  return 'streets';
}

// ---------------------------------------------------------------- roads (centrelines, width)
export const ROADS = [
  { id: 'ring', closed: true, width: 1.8, pts: [[-7.5, -6.5], [7.5, -6.5], [7.5, 6.5], [-7.5, 6.5]] },
  { id: 'west', closed: false, width: 1.6, pts: [[-7.5, 0], [-20.5, 0]] },
  { id: 'east', closed: false, width: 1.4, pts: [[7.5, 0], [9.6, 0]] },
  { id: 'north', closed: false, width: 1.4, pts: [[0, -6.5], [0, -8.2]] },
  { id: 'south', closed: false, width: 1.4, pts: [[0, 6.5], [0, 8.2]] },
];

/** Tram runs clockwise (seen from above) on the inner lane of the ring. Stop near the south side. */
export const TRAM_LOOP = [[-7.05, -6.05], [7.05, -6.05], [7.05, 6.05], [-7.05, 6.05]];
export const TRAM_STOP = [0, 6.05];

/** Car lanes (closed loops, travel in point order). */
export const CAR_LANES = [
  { id: 'ringOuter', pts: [[-7.95, 6.95], [7.95, 6.95], [7.95, -6.95], [-7.95, -6.95]] }, // counter-clockwise outer lane
  { id: 'westStreet', pts: [[-8.4, -0.4], [-19.6, -0.4], [-20.2, 0], [-19.6, 0.4], [-8.4, 0.4]] }, // out and back
];
/** Pedestrian crossings (cars and tram slow/stop here when someone is on them). */
export const CROSSINGS = [[0, 6.5], [0, -6.5], [-7.5, 0], [7.5, 0], [-12, 0]];

/** Pedestrian walking loops (sidewalks / plaza paths). Life agent spawns walkers on these. */
export const WALK_LOOPS = [
  { id: 'plaza', district: 'market', pts: [[-5.3, -4.4], [5.3, -4.4], [5.3, 4.4], [-5.3, 4.4]] },
  { id: 'resNorth', district: 'residential', pts: [[-9, -1.2], [-20, -1.2]], pingpong: true },
  { id: 'resSouth', district: 'residential', pts: [[-9, 1.2], [-20, 1.2]], pingpong: true },
  { id: 'promenade', district: 'lakeside', pts: [[9.6, -4.5], [9.8, 0], [9.9, 5], [11.5, 7.8], [17.5, 7.8], [19.6, 4]], pingpong: true },
  { id: 'parkLoop', district: 'park', pts: [[-5.5, 9], [5.5, 9], [5.8, 14], [-5.8, 14]] },
];

// ---------------------------------------------------------------- landmarks & task spots
export const SPAWN = { x: 0, z: 15.2, heading: Math.PI }; // at the city gate, facing north
export const GATE = { x: 0, z: 15.6, width: 3.2 }; // "Welcome to Tinselby" arch

export const MARKET = {
  tree: { x: 0, z: -1.6, height: 3.2 }, // the big city tree; star sits at the top
  landing: { x: 0, z: 2.4, heading: Math.PI }, // Santa's sleigh lands here (keep clear of props, 3 × 2 area)
  carousel: { x: 4.2, z: 2.8 },
  stalls: [ // market stalls around the plaza edge, each faces the plaza centre
    { x: -4.6, z: -3.6 }, { x: -4.8, z: 0.2 }, { x: -4.4, z: 3.6 }, { x: 4.6, z: -3.6 }, { x: 4.8, z: -0.4 }, { x: -1.8, z: -4.4 }, { x: 2.2, z: -4.4 },
  ],
  countdownClock: { x: -2.6, z: -1.2 },
};

export const RESIDENTIAL = {
  street: { z: 0, x0: -8.6, x1: -20.5 },
  rowNorthZ: -2.6, rowSouthZ: 2.6, // townhouse front walls face the street
  houseXs: [-10, -11.8, -13.6, -15.4, -17.2, -19],
  taskHouses: [ // houses whose string lights the player switches on (door spot = where the player stands)
    { x: -11.8, z: -2.6, door: [-11.8, -1.75] },
    { x: -15.4, z: 2.6, door: [-15.4, 1.75] },
    { x: -19, z: -2.6, door: [-19, -1.75] },
  ],
  giver: { x: -9.6, z: 1.6 }, // neighbour who asks for help
};

export const PARK = {
  giver: { x: -2.2, z: 10.6 }, // kid who lost the bauble
  bauble: { x: 5.2, z: 12.6 }, // hidden in a snow pile
  snowmanSpot: { x: -4.5, z: 12.8 },
  pond: null,
};

export const LAKE = {
  center: { x: 14.6, z: 1.6 }, rx: 4.3, rz: 3.3, // frozen, walkable ice
  giver: { x: 10.4, z: 4.2 }, // skater on the shore who lost the scarf
  scarf: { x: 17.2, z: 2.2 }, // on the ice
  pier: { x: 10.2, z: 1.2 },
};

export const HILL = {
  // ground height rises from z = −7.6 (0) to z = −15.5 (top plateau). x ∈ [−8.5, 9].
  topY: 2.6,
  heightAt(x, z) {
    if (x < -8.5 || x > 9 || z > -7.6) return 0;
    const t = Math.min(1, Math.max(0, (-7.6 - z) / 7.9));
    const s = t * t * (3 - 2 * t);
    const edge = Math.min(1, Math.min(x + 8.5, 9 - x) / 1.5); // soften the sides
    return HILL.topY * s * edge;
  },
  cableBase: { x: 6.2, z: -8.4 },
  cableTop: { x: 6.2, z: -15.4 },
  giver: { x: 4.6, z: -8.0 }, // cable-car operator
  starSpot: { x: 5.2, z: -15.6 }, // the tree star waits at the top station
  sledLanes: [[-5.5, -15], [-5, -8.2], [-2.5, -15], [-2, -8.2], [0.5, -15], [1, -8.2]], // pairs: top → bottom
};

/** Order the player usually meets things (for hint arrows). */
export const TASK_ORDER = ['lights', 'bauble', 'scarf', 'star'];

// ---------------------------------------------------------------- Advent (wave 1+)
/** The knitted Advent calendar board in the market (players open doors here). Keep clear of the landing rug. */
export const ADVENT_BOARD = { x: -3.0, z: -3.0, heading: 0.6 };

/**
 * Where each door's quest giver stands (doors 1–4 reuse the existing givers; 24 = the big tree).
 * Spots are suggestions: the door system nudges a giver off any collider it lands on.
 */
export const DOOR_SPOTS = {
  1: { district: 'residential', x: RESIDENTIAL.giver.x, z: RESIDENTIAL.giver.z },
  2: { district: 'park', x: PARK.giver.x, z: PARK.giver.z },
  3: { district: 'lakeside', x: LAKE.giver.x, z: LAKE.giver.z },
  4: { district: 'hill', x: HILL.giver.x, z: HILL.giver.z },
  5: { district: 'park', x: 3.5, z: 13.0 }, // snowball fight — Tilly (clear of the gazebo roof)
  6: { district: 'market', x: -3.4, z: 2.4 }, // ornament hunt — Mr Pine the decorator
  7: { district: 'hill', x: -2.6, z: -8.6 }, // sled race — Coach Sasha
  8: { district: 'market', x: 3.9, z: -0.4 }, // cookie baking — Baker Bea (by the bakery stall)
  // wave 2 (WAVE2.md §Layout); shared givers stand where their doll already stands
  9: { district: 'lakeside', x: 10.4, z: 4.2 },   // Figure Skating: Ilse (door 3's doll)
  10: { district: 'market', x: -0.8, z: -0.35 },  // Your Own House: Mayor Tinsel (door 24's doll)
  11: { district: 'market', x: 0, z: 5.0 },       // Tram Conductor: Conductor Clem at the south tram stop
  12: { district: 'market', x: -3.55, z: -1.0 },  // Gift Wrapping: Auntie Noor by the west stall
  13: { district: 'park', x: -2.2, z: 10.6 },     // Snowman Contest: Pip (door 2's doll)
  14: { district: 'lakeside', x: 19.3, z: -2.8 }, // Ferris Wheel Gnomes: Otto at the ticket booth
  15: { district: 'park', x: 6.25, z: 8.25 },     // The Lost Reindeer: Elf Pepper beside the Reindeer Rest
  16: { district: 'hill', x: -2.6, z: -8.6 },     // Sledge Hill Race II: Coach Sasha (door 7's doll)
  24: { district: 'market', x: MARKET.tree.x, z: MARKET.tree.z + 1.5 },
};

/** Mini-game play areas (centre + rough radius) so games keep their props inside a known space. */
export const ARENAS = {
  snowball: { x: 5.45, z: 12.2, r: 1.6 } /* open clearing east of the gazebo */,
  ornaments: { x: 0, z: 0, r: 5.6 }, // whole plaza
  sled: { top: { x: -1.0, z: -15.2 }, bottom: { x: -1.0, z: -8.4 } },
  cookies: { x: 4.4, z: -0.4, r: 1.2 },
  skate: { x: 14.6, z: 1.6, rx: 3.5, rz: 2.5 }, // usable ellipse inside the ice; no colliders inside
  giftwrap: { x: -3.75, z: 0.2, heading: Math.PI / 2, cam: { x: -2.55, y: 1.75, z: 0.2 }, target: { x: -3.85, y: 0.82, z: 0.2 } },
  snowman: { x: -4.45, z: 12.25, r: 1.0, build: { x: -4.5, z: 12.8 } }, // rolling lawn west of Pip
  // sled2 reuses ARENAS.sled
};

// ---------------------------------------------------------------- Wave 2 (doors 9–16), WAVE2.md §Layout
/** Tram Conductor stops in the tram's travel order (clockwise from the south stop). pos = where the tram's centre stops
 *  on TRAM_LOOP; wait = two passenger spots on the plaza side (checked clear). */
export const TRAM_STOPS = [
  { id: 'park', name: 'Park Gate', pos: [0, 6.05], wait: [[-0.6, 5.3], [0.6, 5.3]] },
  { id: 'holly', name: 'Holly Lane', pos: [-7.05, 0], wait: [[-6.35, -0.5], [-6.35, 0.5]] },
  { id: 'hill', name: 'Sledge Hill', pos: [0, -6.05], wait: [[-0.6, -5.3], [0.6, -5.3]] },
  { id: 'lake', name: 'Frostmere', pos: [7.05, 0], wait: [[6.35, -0.5], [6.35, 0.5]] },
];

/** Door 10: the player's cottage = the cream north-row townhouse at x −13.6 (shortest house, h 2.1, teal door, roofline
 *  lights on; not a task house). Find it with city.residential.houses.find(h => |h.x − x| < .01 && |h.z − z| < .01). */
export const HOUSE = {
  x: -13.6, z: -2.6, heading: 0, w: 1.5, d: 1.3, h: 2.1, // front wall at z −1.95, faces +z (the street)
  door: { x: -13.3, z: -1.75 }, // where the player stands (interact spot)
  snowman: { x: -14.15, z: -1.74 }, // decoration snowman (collider r 0.15 while shown; walkers pass 0.5 away)
  neighbour: { x: -15.4, z: -2.6, h: 2.55 }, // next door (north row, not a task house): stretch only
};

/** Door 15: Santa's Reindeer Rest (heading: open front faces (sin h, cos h), i.e. towards the camera) and Clover's trail. */
export const REINDEER = {
  rest: { x: 7.0, z: 8.6, heading: 0.3 }, // clear radius 0.75; nearest: tree (6.6, 9.48), ring road 1.2 north
  find: { x: 15.3, z: 2.3 }, // Clover on the ice
  trail: [[6.5, 8.0], [5.0, 7.6], [2.8, 7.3], [1.0, 7.0], [0.4, 6.3], [0.5, 5.3], [1.0, 4.3], [2.9, 3.9], [4.6, 4.4],
    [5.4, 3.6], [5.7, 2.3], [5.95, 0.9], [7.4, 0.3], [8.6, 0.15], [9.7, 0.3], [10.8, 0.4], [12.4, 0.5], [14.0, 1.4]],
};

/** Door 14: where the four Ferris-wheel gnomes hide (all checked clear; each sits 0.2–0.4 beyond the nearest collider). */
export const GNOMES = {
  booth: { x: 19.55, z: -3.45 }, // Ferris ticket booth (wheel collider rect x 17.25…19.75, z −4.2…−3.2)
  hide: [[12.8, -6.3, 'behind the cocoa hut'], [12.55, 1.2, 'at the end of the pier'], [20.0, 1.55, 'behind the snowman'], [18.3, -4.6, 'behind the Ferris wheel']],
};
