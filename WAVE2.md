# Tinselby: Wave 2 contract (Advent doors 9–16, target live ~2 Dec)

Read `CONTRACTS.md` and `WAVE1.md` first (base modules, ctx, events, yarn material, mini-game framework, door/progress system). This file adds wave 2. **Christmas only. Never mention New Year.** All coordinates below were checked against the city's real colliders and prop anchors (the city was built headless in Node and every spot was probed). The perf pass may move a few props: re-check your spots with `colliders.resolve` once at start-up and nudge them, as givers already do.

## Decisions (lead, 18 Nov): all eight defaults below are ACCEPTED. #6: the lead makes the three small pre-work edits. #7: stretch stays off for wave 2 (revisit after release). #8: yes.
1. **Shared givers:** doors 9 / 10 / 13 / 16 reuse the dolls of doors 3 (Ilse), 24 (Mayor Tinsel), 2 (Pip) and 7 (Coach Sasha). Only 4 new dolls (11, 12, 14, 15). This saves about 14k triangles and 8 draw calls of the 40k permanent budget. Alternative: 8 new dolls, about 28k triangles.
2. **Ferris wheel exists** (lakeside, centre (18.3, −3.7), ticket booth at (19.55, −3.45)), so door 14 keeps its title. No city edit is needed: the gnomes hide around the lake and follow you back in a conga line.
3. **Reindeer Rest** (new permanent prop, ≤ 5k triangles) goes in Pinecone Park's north-east corner at (7.0, 8.6). The market landing has no room: lanterns, canes and gifts surround the rug.
4. **Festive level stays capped at 4** (7+ doors). Levels 5–6 would need city and audio edits during the perf freeze. Wave 2's visible town changes come from the doors themselves: your house, Clover at the Rest, gnomes back on the wheel.
5. **If a game slips:** ship only the doors that are ready in order. Set `available:false` from the first door that isn't ready, so `wave:end` fires at the last ready door. No "free pass" stubs on live.
6. **Lead pre-work touches three files outside the lead's own** (each change is small and additive, exact code in §0): `life/traffic.js` + `life/index.js` (`holdVehicle`), `finale/reindeer.js` (export the reindeer geometry), `audio/music.js` + `audio/index.js` (`beat()`). Approve, or hand them to the tram, trails and skate agents.
7. **Stretch, off by default:** the next-door house shows a nearby online player's decorations (`HOUSE_NEIGHBOUR` flag in `src/house/`). It needs no net changes: the house code rides in `style.house`. Go or no-go?
8. Sled II switches the town to night (`world.setTimeOfDay(21.5)`) for the race and restores the time afterwards. OK?

## What wave 2 adds
- Doors **9–16 become `available:true`**. Doors 17–23 stay "coming soon"; door 24 stays locked until 1–23 are done.
- 5 new mini-games (`skate`, `tram`, `giftwrap`, `snowman`, `sled2`) and 3 new task doors (`house`, `gnomes`, `reindeer`).
- **Your own house:** a cottage on Holly Lane that you decorate (wreath, window lights, door colour, snowman). It's saved, and you can redecorate it at any time.
- **Santa's Reindeer Rest** in the park. Clover the reindeer lives there after door 15 (hook for the wave-3 finale).
- 8 new wardrobe pieces (3 coats, 3 hats, 2 scarves). These are the only wave-2 rewards.
- **Returning players** (wave-1 saves) get a one-time "New Advent doors are open!" card. `wave:end` fires once after door 16, with wave-2 copy.

## Ownership (only edit your own files; ask the lead in your report for anything else)

| Agent | Model | Owns (new files in **bold**) |
|---|---|---|
| Lead | – | `src/main.js`, `src/core/layout.js`, `src/progress/doors.js`, `src/minigames/index.js`, `src/minigames/framework.js`, `src/minigames/minigames.css`, `CONTRACTS.md`, `WAVE2.md`, `README.md`, `LOG.md`, `index.html`, `package.json`, `tools/**`, plus the one-off pre-work edits in §0 |
| Doors | Sonnet | `src/game/index.js`, `givers.js`, `lines.js`, `hints.js`, `models.js`, `tasks.js` (minimal), `selftest.js`, `debug.js`, **`src/game/w2/house.js`**, `src/progress/index.js`, `src/progress/save.js` |
| Trails | Sonnet | **`src/game/w2/gnomes.js`**, **`src/game/w2/reindeer.js`**, **`src/game/w2/follow.js`**, **`src/game/w2/rest.js`** |
| House | Sonnet | **`src/house/**`** (`index.js`, `decor.js`, `panel.js`, `house.css`) |
| Wardrobe | Fable | `src/core/player.js`: **additive only** (new `STYLE_OPTIONS` entries + their geometry in `buildCharacter`; don't change existing looks, the signature or the return shape) |
| UI | Sonnet | `src/ui/**`, `src/calendar/**` except `data.js` |
| Calendar data | Haiku | `src/calendar/data.js` |
| Skate | Opus | **`src/minigames/skate/**`** |
| Tram | Opus | **`src/minigames/tram/**`** |
| Snowman | Opus | **`src/minigames/snowman/**`** |
| Gift wrap | Sonnet | **`src/minigames/giftwrap/**`** |
| Sled II | Sonnet | `src/minigames/sled/**` (incl. **`night.js`**) |

Everything else (city, life, world, finale, camera, audio, net, the other wave-1 games) stays as it is. The perf pass (running now) owns `src/city/**`, `src/life/**`, `src/core/prims.js`, engine shadows and `ui/preview.js` until it is merged. Read-only imports across folders are fine (e.g. `life/tram.js` `buildTramMesh`, `life/paths.js` `Path`, `city/kit.js` `snowmanGeos`, `minigames/sled/props.js` `crowdDollGeo`).

**Batches** (2 CPUs, one Chrome at a time): **A** = Doors, Trails, House, Wardrobe, Skate, Tram. **B** = UI (once the running UI-fixes agent is done), Calendar data, Snowman, Gift wrap, Sled II. Start B when two agents from A have finished, or start everything at once if the Chrome lock queue stays short. Each agent: ≤ 6 Chrome runs, ≤ 150 steps each. Prefer JS logic tests over screenshots.

## §0 Lead pre-work (after the perf pass is merged; one commit "wave 2 scaffolding"; build must pass)
1. **`layout.js`**: add the block in §Layout below.
2. **`doors.js`**: replace doors 9–16 with the metadata in §Doors. `SOON` becomes the 7 titles for 17–23. `festiveLevel` stays unchanged (it already caps at 4).
3. **Stubs** so every door is playable before its builder lands. Each builder then owns its stub.
   - `src/minigames/{skate,tram,giftwrap,snowman}/index.js`:
     ```js
     // STUB (wave 2 scaffolding), replaced by the <id> builder.
     export default { id: '<id>', title: '<Door title>', district: '<district>', intro: 'Coming soon',
       async start(ctx, mg) { await mg.intro(); mg.finish({ score: 1, stars: 1, text: 'Stub game' }); } };
     ```
     The same goes for `src/minigames/sled/night.js` with `id: 'sled2'`, `title: 'Sledge Hill Race II'`, `district: 'hill'`. `selftest` already treats `intro === 'Coming soon'` as a stub.
   - `src/game/w2/{house,gnomes,reindeer}.js`: an activity stub that matches §Activity interface:
     `export default function create(ctx, env) { return { id: '<id>', n: env.n, busy: false, onGiver() { env.say(env.n, 'accept'); env.taskComplete('<id>'); env.completeDoor(env.n); }, objective: () => null, giverLabel: () => null, update() {}, sync() {}, async selfTest(T) { await T.talk(env.n); } }; }`
   - `src/house/index.js`: `export function createHouse(ctx) { const DEFAULT = { wreath: 'holly', lights: 'warm', door: 'red', snowman: 'none' }; return { OPTIONS: {}, DEFAULT, get owned() { return ctx.progress?.state?.(10) === 'done'; }, get style() { return { ...DEFAULT }; }, isOpen: false, async decorate() { return { ...DEFAULT }; }, setStyle() {} }; }`
4. **`minigames/index.js`**: `import skate from './skate/index.js'; import tram from './tram/index.js'; import giftwrap from './giftwrap/index.js'; import snowman from './snowman/index.js'; import sled2 from './sled/night.js';` then `MINIGAMES = [snowball, ornaments, sled, cookies, skate, tram, giftwrap, snowman, sled2]`.
5. **`main.js`**: `import { createHouse } from './house/index.js';` and `ctx.house = createHouse(ctx);` right after the mini-game registration loop, before `ctx.tasks`. New build order: audio → city → world → life → progress → minigames → **house** → tasks → ui → calendar → net → finale.
6. **`life/traffic.js` + `life/index.js`**: `holdVehicle(kind) → release()`:
   ```js
   // traffic.js, inside createTraffic: in update() change the show line to
   const show = W.isRevealed(v.district) && !v.held;
   // and add
   function hold(kind) { const v = vehicles.find((x) => x.kind === kind); if (!v) return () => {}; v.held = (v.held || 0) + 1; let done = false; return () => { if (done) return; done = true; v.held = Math.max(0, v.held - 1); }; }
   // return { vehicles, tram, carriage, update, vehicleNear, hold };
   // life/index.js return object: holdVehicle: (kind) => traffic.hold(kind),
   ```
7. **`finale/reindeer.js`**: move the inline leg `merge([...])` of `buildTeam` into `function legGeo() { return merge([...]); }`, use it in `buildTeam`, then add `export const REINDEER_RIG = { HIP_Y, LEGS }; export function reindeerGeos() { return { body: bodyGeo(false), leg: legGeo() }; }`. The finale must look the same.
8. **`audio/music.js` + `audio/index.js`**: in music's returned object add `get beat() { return cur ? { bpm: cur.song.bpm, meter: cur.song.meter, start: cur.start, spb: cur.spb } : null; }`. In audio's returned object add `beat() { try { const b = music && music.beat; return b && ac ? { ...b, now: ac.currentTime } : null; } catch (e) { return null; } }`. Beat phase = `((now − start) / spb) mod 1`. `start` may lie slightly in the future.
9. **`CONTRACTS.md`**: build order, new ctx key `house`, the events in §Events, `life.holdVehicle`, `audio.beat`.

## §Layout (add to `src/core/layout.js`, verbatim)
```js
// ---------------------------------------------------------------- Wave 2 (doors 9–16)
// DOOR_SPOTS entries 9–16 (add inside DOOR_SPOTS). Shared givers stand where their doll already stands.
//  9: { district: 'lakeside', x: 10.4, z: 4.2 },   // Figure Skating: Ilse (door 3's doll, LAKE.giver)
// 10: { district: 'market', x: -0.8, z: -0.35 },   // Your Own House: Mayor Tinsel (door 24's doll, tree front-left)
// 11: { district: 'market', x: 0, z: 5.0 },        // Tram Conductor: Conductor Clem at the south tram stop (lamps at x ±1.25)
// 12: { district: 'market', x: -3.55, z: -1.0 },   // Gift Wrapping: Auntie Noor, north of her counter by the west stall
// 13: { district: 'park', x: -2.2, z: 10.6 },      // Snowman Contest: Pip (door 2's doll, PARK.giver)
// 14: { district: 'lakeside', x: 19.3, z: -2.8 },  // Ferris Wheel Gnomes: Otto, in front of the ticket booth
// 15: { district: 'park', x: 6.25, z: 8.25 },      // The Lost Reindeer: Elf Pepper beside the Reindeer Rest
// 16: { district: 'hill', x: -2.6, z: -8.6 },      // Sledge Hill Race II: Coach Sasha (door 7's doll)

// ARENAS entries (add inside ARENAS):
//   skate: { x: 14.6, z: 1.6, rx: 3.5, rz: 2.5 },   // usable ellipse inside the ice (LAKE rx 4.3 / rz 3.3); no colliders inside
//   giftwrap: { x: -3.75, z: 0.2, heading: Math.PI / 2, cam: { x: -2.55, y: 1.75, z: 0.2 }, target: { x: -3.85, y: 0.82, z: 0.2 } },
//             // counter in front of the west stall (stall front x ≈ −4.36); the counter's front faces +x (towards the camera)
//   snowman: { x: -4.45, z: 12.25, r: 1.0, build: { x: -4.5, z: 12.8 } }, // rolling lawn west of Pip; build spot = PARK.snowmanSpot
//   (sled2 reuses ARENAS.sled)

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
```

## §Doors (lead writes in `doors.js`)
| # | Title | Giver (doll) | `district` | Kind / id | Reward id → label |
|---|---|---|---|---|---|
| 9 | Figure Skating | Ilse (doll 3) | lakeside | minigame `skate` | `coat:icy` → Ice-blue coat |
| 10 | Your Own House | Mayor Tinsel (doll 24) | market | task `house` | `scarf:holly` → Holly scarf |
| 11 | Tram Conductor | Conductor Clem (new) | market | minigame `tram` | `hat:conductor` → Conductor's cap |
| 12 | Gift Wrapping | Auntie Noor (new) | market | minigame `giftwrap` | `hat:bow` → Ribbon bow |
| 13 | Snowman Contest | Pip (doll 2) | park | minigame `snowman` | `coat:snowy` → Snowy coat |
| 14 | Ferris Wheel Gnomes | Otto (new) | lakeside | task `gnomes` | `hat:gnome` → Gnome hat |
| 15 | The Lost Reindeer | Elf Pepper (new) | park | task `reindeer` | `scarf:jingle` → Jingle-bell scarf |
| 16 | Sledge Hill Race II | Coach Sasha (doll 7) | hill | minigame `sled2` | `coat:midnight` → Midnight coat |

`district` is the **giver's** district (the calendar says "Find Mayor Tinsel in Market Square"). Blurbs (≤ 80 chars): 9 "Glide glowing patterns across Frostmere Lake in time with the music." · 10 "The Mayor has a cottage on Holly Lane just for you. Make it cosy!" · 11 "Drive the festive tram and stop smoothly for every passenger." · 12 "Wrap presents with Auntie Noor: paper, folds, tape and a bow." · 13 "Roll, stack and dress the best snowman in Pinecone Park." · 14 "The Ferris wheel gnomes are hiding round the lake. Round them up!" · 15 "Follow glowing hoofprints to find Clover, one of Santa's reindeer." · 16 "A night race down Sledge Hill through lantern gates and bells." Door 17–23 titles are unchanged. Rewards use the existing `reward(slot, key, label)` → id `${slot}:${key}`.

**Progress (Doors agent):** `festiveLevel` stays as it is, so the level is 4 for doors 7–16. `spiritMax` stays 4. `wave:end` already fires when the current door is completed and `current()` becomes null, so it fires once, after door 16. Calendar duplication: Haiku removes `FALLBACK_DOORS`, `SOON_TITLES` and `BASE_KEYS` from `calendar/data.js` and imports `DOORS`, `DEFAULT_UNLOCKED` and `GATED_SLOTS` from `src/progress/doors.js` (pure data, no side effects) as the fallback. **After that, door titles exist only in `doors.js`.**

## §Doors agent: givers, shared dolls, activity plugins, progress
**New givers** (`lines.js` `GIVERS`; styles may use wave-2 keys; until Wardrobe lands, unknown hats simply render no hat):
- 11 `{ who: 'Conductor Clem', game: 'tram', style: { coat: 'navy', outfit: 'coat', hat: 'conductor', scarf: 'red', hair: 'none', skin: 'deep' }, opts: { hair: '#2b211c' }, scale: 1.12 }`
- 12 `{ who: 'Auntie Noor', game: 'giftwrap', style: { coat: 'plum', outfit: 'dress', hat: 'bow', scarf: 'gold', hair: 'long', hairColor: 'dark', skin: 'brown' }, opts: {}, scale: 1.08 }`
- 14 `{ who: 'Otto', task: 'gnomes', style: { coat: 'mustard', outfit: 'jumper', hat: 'earflap', scarf: 'striped', hair: 'tousled', hairColor: 'ginger' }, opts: {}, scale: 1.1 }`
- 15 `{ who: 'Elf Pepper', task: 'reindeer', style: { coat: 'green', outfit: 'duffle', hat: 'elf', scarf: 'candycane', hair: 'bob', hairColor: 'blonde', skin: 'tan' }, opts: {}, scale: 0.9 }`
- Shared: 9 `{ who: 'Ilse', doll: 3, game: 'skate' }`, 10 `{ who: 'Mayor Tinsel', doll: 24, task: 'house' }`, 13 `{ who: 'Pip', doll: 2, game: 'snowman' }`, 16 `{ who: 'Coach Sasha', doll: 7, game: 'sled2' }`.

**Dolls:** one doll per GIVERS entry without `doll`. `givers[n]` for a shared door points to the same doll object (so `tasks.givers[9] === tasks.givers[3]` and `giverPos(9)` works). Use one interact spot per doll. Talking to a doll resolves like this:
1. The first of its doors (ascending) whose state is `open` handles the talk: door 1–4 → existing `acts.onGiver`; door 24 → existing logic; mini-game door → `accept` + start; task door 10 / 14 / 15 → `activity.onGiver()`.
2. Otherwise, if the doll has done mini-game doors: one → `again` + play; two or more → `const n = await ctx.ui?.choose?.({ title: who, options: doors.map(n => ({ label: title(n), value: n })) })`. If `choose` is missing, fall back to the highest door. `null` means cancelled: say nothing.
3. Otherwise → the `after` line of the highest done door, or the `locked` line of the lowest locked door.
- Marker: shown if any of the doll's doors is `open` (or wave-1 carrying rules). Label: `Talk to {who}`, or `Play again with {who}` when step 2 applies.
- While any activity is `busy` (house panel open) or has followers (gnomes / reindeer), mini-game givers still work. Followers hide during a mini-game and reappear behind the player afterwards (Trails handles this).
- The door-24 enabled rule (star carrying) stays. Door 10 never needs the star.
- Mini-games start with `ctx.minigames.play(doorMeta(n).game)`, exactly like wave 1.
- Each new task door finishes with `env.taskComplete(id)` (emits `task:complete {id}` for the chime, **not** `game.completeTask`) and then `completeDoor(n)`.

**§Activity interface** (`src/game/w2/<id>.js`, default export `create(ctx, env)`; Doors writes `house.js`, Trails writes `gnomes.js` + `reindeer.js`):
```js
env = { n, models, giver /* the door's doll */, givers, say(n, key, extra), toast(text, ms), sfx(name, x, z), ds(n), completeDoor(n, r), taskComplete(id) }
activity = {
  id, n,
  onGiver(),        // talk while ds(n) === 'open' (accept / remind / deliver)
  objective(),      // while open: { id, text, icon, x, z } or null → index shows "Find {who}"
  giverLabel(),     // optional { label, icon } | null
  busy,             // true while the activity holds the player (other activities' spots disabled)
  update(dt, t),    // every frame; cheap when idle
  sync({ reset }),  // after load / door:complete / progress:reset: rebuild visible state from progress (done → final look)
  selfTest: async (T) => {}, // complete door n headlessly. T = { talk(n), go(x, z, expectId), teleport(x, z), step(k), tick(ms), check(cond, msg) }
}
```
`tasks` additions: `tasks.activities` (`{ house, gnomes, reindeer }`), `tasks.reindeer` (getter → `{ atRest, home: {x, z}, object }`, the wave-3 finale hook), `tasks.playDoor(n)` (starts door n's game; for tests).

**Door 10 activity (`w2/house.js`):** Mayor `accept` → objective `Visit your cottage on Holly Lane` (icon `home`, at `HOUSE.door`) → interact spot `{ id: 'house-unlock', x: HOUSE.door.x, z: HOUSE.door.z, r: 0.8, label: 'Open your cottage', icon: 'home', enabled: ds(10) === 'open' && accepted && !ctx.house.isOpen }` → `await ctx.house.decorate({ first: true })` → `taskComplete('house')`, `completeDoor(10)`. Then Mrs Holly (doll 1) says `LINES[1].neighbour` if she is within 7 units (she is: (−9.6, 1.6)), otherwise toast it. After the door is done, the house module's own spot handles redecorating.

**Lines** (Doors agent writes all of them, warm, short, using `{name}`, no emoji): mini-game doors 9 / 11 / 12 / 13 / 16 → `accept, done, replay, retry, again, locked`. Task doors 10 / 14 / 15 → `accept, remind, done, after, locked`. Plus `LINES[1].neighbour` ("Hello, neighbour {name}! …"). Trails writes its own progress toasts inside its modules ("Gnome found! 3 to go", "Clover is following you!").

**Progress changes** (`progress/index.js`, `save.js`):
- Save gets `house: null | { wreath, lights, door, snowman }` (each value `/^[a-z]{1,12}$/`, else dropped) and `wave: int`, the highest available door the player has been told about. Brand-new players get the current `lastAvailable()` (they never see the card). Loaded saves without the field get **8**.
- API: `progress.house = { get() → style | null, set(style) }` (persist + `progress:change {house: true}`); `progress.lastAvailable()` → 16.
- On `game:start`: if `S.wave < lastAvailable()` and `doneCount() > 0`, emit **`doors:new {from: S.wave + 1, to: lastAvailable()}`** 1.5 s later, then set `S.wave = lastAvailable()` and persist (so it fires once per save per wave).
- `?doors=N` is unchanged (up to 23). With door 10 done but no saved style, the house shows `ctx.house.DEFAULT`.

## §Per-door specs
All mini-games follow WAVE1 §Mini-games: default-export `{ id, title, district, icon (SVG string), intro, start(ctx, mg, opts) }`, `await mg.intro()` first, `mg.finish({score, stars, text})`, **1★ = completed and reachable by most players on a first try**, 45–90 s per run, phones in landscape with **one-thumb** controls (big DOM buttons in `ctx.uiRoot`, removed on dispose) plus keys/mouse, yarn material + `core/prims.js`, existing sfx names only, everything through `mg` so dispose leaves the scene child count unchanged. Test: `?play&reveal=all&mg=<id>&mgauto`. With `mgauto`, a built-in bot plays and reaches ≥ 1★ within the normal run time.

### Door 9: Figure Skating (`skate`, Opus) on Frostmere Lake, `ARENAS.skate`
- Hide the player (`mg.setPlayerVisible(false)`) and build **your own skater doll** in `game.state.style` (`buildCharacter`, skating pose: arms out, legs still, tiny steel blades), starting at (14.6, 3.6). The player's real position doesn't change.
- **Control:** the skater glides automatically at tempo speed. Steering: drag horizontally anywhere / joystick x / ← → / A D. A **quick tap** (< 180 ms, < 12 px) or Space = twirl. One thumb does both.
- **Routine:** 3 patterns drawn as glowing dashed ribbons on the ice, about 18 s each: figure-eight (lemniscate, a = 3.0, b = 1.9), heart, 3-petal snowflake loop (r = cos 3θ, scaled). All inside the arena ellipse. Beat stars sit along each pattern, one per beat, timed with `ctx.audio.beat?.()` (lead pre-work). If it returns null (audio off), run your own 100 bpm clock and pulse the stars visually. Twirl rings appear every 8 beats.
- **Score:** star passed ≤ 0.12 from its centre within ±120 ms of the beat = Perfect 10, within ±250 ms = Good 5. Twirl in a ring = 15. On-line ratio bonus up to 50 per pattern. **Stars by score / max: 0.30 / 0.60 / 0.85.**
- **Audience:** `const show = ctx.life.hideDistrict('lakeside')` (skaters and walkers away), `ctx.life.gatherAt(14.6, 1.6, 4.6)` (spectator ring just outside the ice rim, facing the centre), `ctx.life.cheer()` on 4-Perfect streaks and at the end. In dispose: `ctx.life.release(); show();`.
- Camera: one long non-skippable shot, high-ish from the south shore (about (14.6, 3.2, 8.4) looking at the skater), smoothly following. Fading glow trail behind the blades (≤ 600 tris). sfx: `ice` (glide loop), `bell` (Perfect), `whoosh` (twirl), `cheer`.
- Budget ≈ skater 3.6k + ribbons ≤ 3k + stars (instanced) ≤ 1k + trail ≤ 0.6k.

### Door 10: Your Own House (task `house`). Activity in `w2/house.js` (Doors), decoration in `src/house/` (House)
See §House. Flow: Mayor → walk to the cottage → "Open your cottage" → decorate panel (first time) → door done → Mrs Holly greets her new neighbour.

### Door 11: Tram Conductor (`tram`, Opus) on `TRAM_LOOP` / `TRAM_STOPS`
- `const release = ctx.life.holdVehicle?.('tram')` hides the ambient tram (release on dispose; tolerate a missing API). Build your own tram with `buildTramMesh(engine)` (3.6k tris) on `new Path(layout.TRAM_LOOP, { closed: true, radius: 1.0 })` (same rounding as `life/traffic.js`). Stop s = `path.nearestS(...stop.pos)`.
- Start standing at the Park Gate stop with its first passengers boarding. Route = **6 stops**: holly, hill, lake, park, holly, hill. Passengers waiting: 2, 3, 2, 3, 2, 2 (14 total).
- **Control (one input):** hold anywhere / Space / S / ↓ = brake (−1.6 u/s²). Release = power (+0.8 u/s², vmax 1.8). No reverse.
- **Stopping:** a glowing felt platform strip on the rails marks each stop. Tram centre within ±0.25 of the stop s at v < 0.05 = **Perfect** (30), within ±0.6 = **Good** (15). Overshooting past +0.6 = **missed**: those passengers wave sadly and stay behind. When stopped well: doors open, passengers hop aboard on an arc and vanish (10 each), ding `tram`, auto-depart after about 1.2 s.
- **Score:** max 6 × 30 + 14 × 10 = 320. **Stars: 1★ = route finished (any score), 2★ ≥ 190, 3★ ≥ 260.** Run ≈ 70 s (1.5 laps).
- Passengers: one `InstancedMesh` of `crowdDollGeo(engine.mat, style)` (read-only import from `minigames/sled/props.js`), tinted per instance, ≤ 6 visible, no shadow cast. Player hidden (`mg.setPlayerVisible(false)`).
- Camera: chase rig behind and above the tram (like the sled rig), ≥ 2 s look-ahead around corners. HUD: next stop name + passengers.
- Ignore pedestrians and cars (cars use the outer lane, so the lanes never cross).

### Door 12: Gift Wrapping (`giftwrap`, Sonnet) at `ARENAS.giftwrap`
- Copy the **cookies pattern**: a counter group at the arena origin with `rotation.y = heading` (π/2: local +z → world +x, facing the camera); `mg.setPlayerVisible(false)`; one long non-skippable `cam.playShot` from `cam` to `target` (tune ±0.3) with a **post override** like `CLOSE_POST` in cookies (`{ bloom: 0.42, glow: 0.6, threshold: 0.35, band: 0.3, falloff: 0.3 }`); ease out with a short shot in dispose. Behind the camera sit a barrel (−2.3, 0.45), a basket (−2.6, 0.75), gifts (−1.95, 0.2) and a cane (−2.65, 0.15): keep them out of frame (camera high, pitch ≥ 35°). Auntie Noor (−3.55, −1.0) and Mr Pine (−3.4, 2.4) stay outside the frame.
- **3 gifts** at rising speed, one tap input (tap / Space / Enter / big DOM button), ≈ 65 s total. Per gift:
  1. **Paper:** 3 rolls slide past and an order card shows the wanted pattern. Tap when it's centred.
  2. **Fold** ×2: a flap swings. Tap when it lines up with the crease.
  3. **Tape** ×2: the dispenser glides. Tap over the marked spots.
  4. **Bow:** a ribbon loop shrinks. Tap when it matches the bow outline.
- Each tap scores 0…1 accuracy. **Stars by mean accuracy 0.40 / 0.65 / 0.85.** sfx: `ui`, `pop`, `gift`, `task`.
- Budget ≤ 16 draw calls, ≤ 20k tris. Test hook mirrors `window.__cookies` (`auto`, `speed`, `log`, `stage`, `score`).

### Door 13: Snowman Contest (`snowman`, Opus) at `ARENAS.snowman`
- `const show = ctx.life.hideDistrict('park')` (the park kids play right there). Nearby: a pom-pom tree (−3.3, 12.07), snowball props (−3.9, 13.1) and the park path at x ≈ −5.5, all outside the circle.
- **Roll (≈ 40 s):** `mg.setPlayerControl(true)`. The player pushes a snowball in front of them (ball centre = player + heading × (0.12 + r)). The ball grows with distance rolled (r 0.05 → cap 0.24), and sparkly fresh-snow patches grow it faster. The ball stays inside the arena circle (soft push-back) and stops at colliders. Three balls with target size bands, shown by a ring gauge: base 0.19–0.23, middle 0.14–0.17, head 0.09–0.12. Roll each into the glowing build ring at `build` to drop it.
- **Stack (≈ 10 s):** each upper ball swings. Tap when it's centred (accuracy).
- **Decorate (≈ 15 s):** pick from 3 chips each: eyes (coal / buttons / berries), nose (carrot / pine cone / star), hat (bobble / top hat / none), scarf (red / striped / gold). Tap only. DOM chips are fine.
- **Judges:** "Tilly's friends", 3 kids (one `InstancedMesh` of `crowdDollGeo`) in front of the snowman. They hold up felt score cards 1–10 (size match, stack accuracy, style: all four picked + colours that go together). Total /30. **Stars: 1★ = any finished snowman (≥ 12 points guaranteed for finishing), 2★ ≥ 20, 3★ ≥ 26.** Run ≈ 75 s.
- Camera: `cam.setMode('close')` while rolling, then a short close shot of the build spot for stack, decorate and judging. sfx: `step`, `pop`, `bell`, `cheer`.
- Budget ≈ balls ≤ 3k, judges 3 × 3.6k (+ shadow), decorations ≤ 2k.

### Door 14: Ferris Wheel Gnomes (task `gnomes`, Trails)
- Otto: "The Ferris wheel gnomes hopped off for a snack and now they're hiding all round Frostmere Lake!" → accept.
- 4 gnomes at `GNOMES.hide`, each a small standing felt gnome (≤ 1.2k tris; all 4 in one `InstancedMesh`) peeking out with a faint sparkle (`models.sparkle`) when the player is within 3.5. Objective: `Find the gnomes (k/4)` pointing to the nearest unfound one.
- Within 0.7: interact spot `Coax the gnome` (icon `gnome`) → hop + `pop` → it joins a **conga line** behind the player (`follow.js`, spacing 0.35). Toast `Gnome found! {left} to go`.
- When all 4 are found: objective `Lead the gnomes back to Otto`. Talking to Otto with fewer than 4 → `remind`. Within 1.2 of Otto with 4 → one by one each gnome hops towards the booth (19.55, −3.45) on an arc, pops into sparkle, `whoosh` → `taskComplete('gnomes')`, `completeDoor(14)`. After that the gnomes are gone (they're "on the wheel").
- Gnomes are visible only while door 14 is `open` and their district is revealed (`ctx.city.isRevealed('lakeside')`).

### Door 15: The Lost Reindeer (task `reindeer`, Trails)
- **Reindeer Rest** (`rest.js`, permanent from game start, ≤ 5k tris, 1 merged mesh): small open-front knitted stable about 1.0 wide × 0.7 deep × 0.95 tall at `REINDEER.rest`, front facing (sin 0.3, cos 0.3). Snowy roof, hay bale, water trough, felt sign "REINDEER REST", short twig fence. Collider: rect around the back and sides (front open). Hidden until the park is revealed: use `ctx.city.isRevealed('park')` and pop it in with a quick scale.
- **Clover** (≤ 3.5k tris): body + 4 instanced legs from `reindeerGeos()` / `REINDEER_RIG` (lead pre-work), with your own small leg-swing animator (stand / walk). Before door 15 is done Clover isn't in the Rest. After it's done Clover stands in the Rest (idle bob, ear flick) forever (`tasks.reindeer.atRest = true`).
- Flow: Pepper → accept → glowing felt **hoofprints** (pairs every 0.32 along `REINDEER.trail`, one `InstancedMesh` ≤ 96 instances, GLOW, ≤ 2.5k tris). Only the next 8 prints past the furthest reached point are lit, and they fade in as you go. Objective `Follow the glowing hoofprints` → next waypoint. At the trail end Clover stands at `REINDEER.find` on the ice. Within 0.8 → `Say hello to Clover` → hop, `sleighBells` → Clover follows (spacing 0.55, walk cycle by speed). Objective `Lead Clover back to the Reindeer Rest`. Within 1.2 of the Rest → Clover trots in, `sleighBells` + `cheer` → `taskComplete('reindeer')`, `completeDoor(15)`. The prints vanish.
- **`follow.js`** (shared by 14 and 15): breadcrumbs every 0.15 of player movement. Followers sit k × spacing back along the crumbs, at ground height `colliders.heightAt`. They hide on `minigame:start` and when the phase isn't `play`, and reappear right behind the player afterwards. If the player jumps more than 3 units (teleport, cable car), followers snap behind them. Mid-task progress is **not** saved: after a reload, talking to the giver restarts the task.

### Door 16: Sledge Hill Race II (`sled2`, Sonnet) as a variant of `src/minigames/sled`
- **No copy:** `night.js` default-exports `{ ...sled, id: 'sled2', title: 'Sledge Hill Race II', icon, intro, start: (ctx, mg) => startSled(ctx, mg, { variant: 'night' }) }`. Parametrise `startSled` / `layoutRun` / `props.js` for the variant. Door 7 must behave exactly as before (best scores stay separate because the game id differs).
- Night: on start save `h0 = ctx.world.timeOfDay`, call `ctx.world.setTimeOfDay(21.5)` (the sky eases in during the intro). In dispose call `setTimeOfDay(h0 + elapsed / 3600)`.
- Same two heats (`RUN_DEFS`), a different item seed (23), and denser gates (min spacing 1.9 instead of 2.35). Gates become **lantern gates** (two posts with GLOW lanterns and a bell on a felt rope). Passing through rings `bell` and scores; missing one dims it. The gold stars become fewer and brighter.
- **Stars: 1★ = both heats finished, 2★ ≥ 70 % of the lantern gates, 3★ ≥ 90 % of the gates and total time ≤ (clean autopilot time + 3.5 s).** Measure with `__sled.auto`. `window.__sled.variant` = `'night'`.

## §Wardrobe (Fable; `src/core/player.js`, additive)
`STYLE_OPTIONS` additions: coat `icy: '#a9cfe0'`, `snowy: '#f3efe6'`, `midnight: '#26305a'`; hat `conductor: "Conductor's cap"`, `bow: 'Ribbon bow'`, `gnome: 'Gnome hat'`; scarf `holly: '#3f7a4a'`, `jingle: '#b5332e'`. Scarf and coat values **must stay plain hex** (they are used as colours). Accents go in the geometry. Each piece adds ≤ 400 tris, and the player doll stays ≤ 4.5k.
- `icy`: white fluffy trim at the hem and cuffs (like the Santa trim).
- `snowy`: treated like cream for contrast (hat colour, mitts, buttons), with 3 coal-black felt buttons.
- `midnight`: 6–8 small gold GLOSS star beads (not GLOW).
- `conductor`: navy felt cap, slightly wider crown, stiff front brim, gold band and badge bead. Ears visible.
- `bow`: big red GLOSS satin bow (two loops, knot, two tails) set at a jaunty angle on a thin headband. Hair is not covered.
- `gnome`: tall red felt cone with a soft floppy tip (2–3 bent segments). It covers the ears and the hair down to the brow, so add it to the `showEars` exclusions.
- `holly`: the green scarf's fringe ends in red berry beads, with two small felt holly leaves on the knot.
- `jingle`: red scarf with 3 tiny gold bell beads on each tail.

Check with `tasks.debugLineup(styles)` and the entry style tray. Remote dolls get the pieces automatically (`net` keeps unknown-but-valid keys).

## §House (House agent, `src/house/`; `ctx.house`)
```js
ctx.house = {
  OPTIONS,       // { wreath, lights, door, snowman }: each [{ key, label, swatch }]
  DEFAULT,       // { wreath: 'holly', lights: 'warm', door: 'red', snowman: 'none' }
  get owned(),   // progress.house.get() != null || progress.state(10) === 'done'
  get style(),   // saved style, or DEFAULT when owned without one
  get isOpen(),
  decorate({ first = false, auto = false }) → Promise<style>, // panel + close-up; Done saves; ✕ keeps the previous style
                                                              // (on first: saves DEFAULT); auto: resolve DEFAULT at once (tests)
  setStyle(style),  // apply + progress.house.set + ctx.net?.setStyle?.({ house: code })
  houseRef,         // the city.residential.houses entry
};
// events: house:open {first}, house:close {style, first}, house:change {style}
```
- **Options:** wreath `classic` (no overlay: the house's own small wreath), `holly`, `berry`, `gold`. Lights `warm`, `multi`, `icy`, `off`. `off` also turns the roofline off via `houseRef.setLights(false)`; the others turn it on. Door `teal` (the original), `red`, `green`, `navy`, `plum`. Snowman `none`, `classic`, `scarf`, `top` (built from `snowmanGeos` in `city/kit.js` + extras).
- **Overlay**, not a new house: one merged mesh (GLOW bulbs included), **≤ 4k tris**, rebuilt on change (< 5 ms). It's placed at `(HOUSE.x, 0.035, HOUSE.z)` with the house-local front at +z (d/2 = 0.65). Pieces:
  - door panel 0.36 × 0.57 × 0.012, centre (0.30, 0.40, 0.688), plus an arch disc r 0.175 at y 0.68 (keep inside the baked trim torus r 0.2), plus a knob bead;
  - wreath centre (0.30, 0.55, 0.72), outer r ≤ 0.13;
  - bulb strings 0.05 outside the frames of the ground window (−0.32, 0.585; opening 0.40 × 0.42) and the upper windows (±0.31, 1.595; 0.32 × 0.42) at z 0.67;
  - snowman at `HOUSE.snowman` (local (−0.55, 0.86)), ≤ 0.45 tall, collider circle r 0.15 enabled only while shown.
- Visible only when `owned` and `ctx.city.isRevealed('residential')`. The north row never folds (only the south row's cut-away does), so no squash handling is needed.
- **Interact spot:** `{ id: 'house-decorate', x: HOUSE.door.x, z: HOUSE.door.z, r: 0.8, label: 'Decorate your house', icon: 'home', enabled: phase === 'play' && owned && !isOpen && !ctx.minigames.active }`.
- **Panel:** DOM in `ctx.uiRoot` (`house.css`, knitted look, landscape right-side sheet ≤ 42 % width, 4 rows of big chips ≥ 44 px, Done button). While open: add class `tb-house-open` on `uiRoot` (the UI hides the HUD and holds cards), set `player.controllable = false` and `ctx.input.enabled = false`, put the player at `HOUSE.door` facing the camera, and run `cam.playShot({ name: 'house', duration: 1e5, skippable: false, blendIn: 0.9, blendOut: 0.6, tilt: 0.5, post: { bloom: 0.6, glow: 0.8, threshold: 0.1, band: 0.34, falloff: 0.5 } })` from about (−13.1, 1.5, 1.05) looking at (−13.5, 0.9, −1.95). End it with `cam.release('house')`. Tapping a chip previews it live.
- **Net stretch** (`HOUSE_NEIGHBOUR = false` until the lead says go): style code = 4 option indices, e.g. `'w1l2d3s0'`, sent as `style.house`. The neighbour overlay on `HOUSE.neighbour` (same builder, h 2.55) shows the decor of the nearest online player with a code, plus a tiny felt sign "{name}'s house" (canvas texture). Never break offline play.
- Test hook `window.__house = { open(first), set(style), get style(), get owned(), budget() }`.

## §UI (UI agent) and §Calendar data (Haiku)
- `ui.choose({ title, options: [{ label, value }] }) → Promise<value | null>`: a small knitted card with one big button per option plus ✕ (`null`). Selftest stubs it.
- **`doors:new {from, to}` card**: kicker `New Advent doors!`, title `Doors {from}–{to} are open`, buttons `Show me` (`ctx.tasks.focusDoor(progress.current())`) and `Later`.
- **Wave-end card** by `lastAvailable()`: at 16 → kicker `All 16 doors opened!`, title `Clover is resting and the sleigh bells are ringing…`, sub `…the last doors open soon!`, button `Look up!` (sky teaser, as in wave 1). The wave-1 copy stays for 8.
- `modalOpen()` also returns true while `ctx.house?.isOpen` or `uiRoot.classList.contains('tb-house-open')`, and the HUD hides then.
- Icons (`ui/icons.js`, SVG, same style): `home`, `tram`, `skate`, `ribbon`, `snowman`, `gnome`, `hoof`. Unknown icon names fall back to `hand`.
- Wardrobe tray `SHORT` labels `conductor: 'Conductor'`, `bow: 'Bow'`, `gnome: 'Gnome'`. Board `HAT_TINT` `conductor: '#34486e'`, `bow: '#c4362f'`, `gnome: '#b5332e'`.
- Haiku (`calendar/data.js` only): drop the duplicated door, title and wardrobe lists and import them from `progress/doors.js`. `lastAvailable()` falls back to `progress.lastAvailable?.()`.

## §Events and APIs (new in wave 2)
`doors:new {from, to}` (progress) · `house:open {first}`, `house:close {style, first}`, `house:change {style}` (house) · `task:progress {id: 'gnomes' | 'reindeer', step, of}` (trails) · `task:complete {id: 'house' | 'gnomes' | 'reindeer'}` (chime only) · existing `door:*`, `reward:grant`, `wave:end`, `minigame:*`.
APIs: `ctx.house` · `progress.house`, `progress.lastAvailable()` · `tasks.activities`, `tasks.reindeer`, `tasks.playDoor(n)` · `ui.choose()` · `life.holdVehicle(kind)` · `audio.beat()` · `reindeerGeos()`, `REINDEER_RIG` · layout `TRAM_STOPS`, `HOUSE`, `REINDEER`, `GNOMES`, DOOR_SPOTS 9–16, ARENAS `skate`, `giftwrap`, `snowman`.

## §Budgets (measure with `window.__tinselby.stats()`, which includes the shadow pass)
- **Scene:** worst high view ≤ **580k triangles** (the perf pass aims for ≤ 480k). Reference views: `?play&reveal=all&noshots&net=off&tod=21&at=0,2&view=high` with `&doors=13` (gnomes out) and `&doors=16` (house + Clover), 60 steps in. The lead measures before and after each merge.
- **Permanent wave-2 props ≤ 40k triangles** (main-pass geometry of meshes that stay in the scene; the shadow pass is covered by the scene total). Allocation: 4 new givers ≈ 14k · house overlay ≤ 4k · Reindeer Rest ≤ 5k · Clover ≤ 3.5k · gnomes ≤ 5k (only while door 14 is open) · hoofprints ≤ 2.5k (only while door 15 is open) · neighbour overlay ≤ 4k (stretch). Draw calls ≤ +16 in `stats()`.
- **Each mini-game while running: ≤ 25 draw calls and ≤ 60k triangles**, counted like `__snowball.budget()` (shadow casters ×2). Zero left after dispose (scene child count unchanged; geometry, textures and DOM disposed).
- Per-frame update ≤ 1 ms (desktop) for each wave-2 module when idle. No new textures except small canvas labels (≤ 512 px).

## §Test hooks (every builder)
- Mini-games: `window.__<id>` (`__skate`, `__tram`, `__giftwrap`, `__snowman`; Sled II extends `__sled`) with at least `{ state (getter), bot(mode) | auto, ff(sec, step = 1/30), budget() → { calls, tris } }`. The hook is removed on dispose. `mgauto` runs the bot.
- House: `window.__house` (above). Trails: `window.__w2 = { gnomes: { state, foundAll() }, reindeer: { state, toClover(), home() } }` (debug helpers that teleport). Activities also implement `selfTest(T)`.
- **Selftest** (Doors agent): `tasks.selfTest({ reset: true })` plays **doors 1–16**. `EXPECT_LEVEL` extends with 4 for doors 9–16. Real games are swapped for an instant completed result, as in wave 1. Door 10 calls `ctx.house.decorate({ first: true, auto: true })`. Doors 14 and 15 use their activities' `selfTest`. `ui.choose` is stubbed to the first option. Checks:
  - after each door: done, reward owned and unlocked, next door open, level 4;
  - `progress.house.get()` is set after door 10;
  - no gnome left visible after 14;
  - `tasks.reindeer.atRest` after 15;
  - `wave:end` exactly once after 16, door 17 `soon`, `current()` null, door 24 `locked`;
  - shared-giver labels (`Play again with Ilse` after 9; `choose` is called for Sasha once 7 and 16 are done);
  - reload with the same storage keeps doors 1–16, the house style and `wave === 16`;
  - an old-format save (doors 1–8, no `wave`) emits `doors:new {from: 9, to: 16}` once.

## §Acceptance checklist (each builder, before reporting done)
- [ ] `npx vite build` passes. No console errors in entry, play, your feature start/quit/finish, and `selfTest`.
- [ ] Only your own files changed (list them in your report).
- [ ] Phones in landscape at 812×375 and 667×375: controls reachable with one thumb, nothing overlaps the framework HUD or the ✕.
- [ ] Budget numbers measured and reported (calls / tris, idle and peak).
- [ ] Works offline and with `?net=local`; `?reset` and `?doors=N` behave.
- [ ] Mini-games: start → quit (✕) → start again → finish → Play again → Done all leave the scene clean. The `mgauto` bot gets ≥ 1★, and 3★ is reachable by its best mode. Durations 45–90 s.
- [ ] Copy: Christmas only, warm, short, `{name}` where natural, no emoji, SVG icons only.
- [ ] A returning wave-1 save (doors 1–8 done) gets door 9 open, keeps festive level 4, sees the `doors:new` card once, and its wardrobe still works.

## §Release plan (lead)
1. **Scaffolding** (§0) once the perf pass is merged → commit; selftest 1–16 green with stubs.
2. **Wardrobe** → commit (reward pieces must exist before the doors grant them; new givers wear them).
3. **Doors** (plumbing, shared dolls, progress, door-10 activity on the house stub, selftest 1–16) → commit.
4. **Calendar data (Haiku) + UI** (`choose`, icons, `doors:new` and wave-end cards, house modal) → commit.
5. **House** → re-run door 10 in selftest and in Chrome (decorate, reload, redecorate) → commit.
6. **Trails** (doors 14, 15, Reindeer Rest) → selftest + one Chrome pass each → commit.
7. **Mini-games as they land:** sled2 → giftwrap → skate → tram → snowman. Each: `mg=<id>&mgauto` run, start/quit/cleanup e2e, budget → commit.
8. Extend `tools/playthrough.py` to all 9 games, doors 1–16 and phone layouts. Measure the reference views (≤ 580k). Spawn Sonnet QA (report only) + a Fable polish pass (house close-up, night race, skate ribbons) + Haiku small fixes from the QA report.
9. **Ship by 1 Dec:** full e2e green → push `main` → Vercel. If a game isn't ready, apply open decision 5 (doors from the first unready one stay `available:false`). Log everything in `LOG.md`.
