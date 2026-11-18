# Tinselby: Wave 3 contract (Advent doors 17–24 + Christmas Eve, target live ~9 Dec, polish to 24 Dec)

Read `CONTRACTS.md` (incl. Portrait and Eye view), `WAVE1.md` and `WAVE2.md` first (base modules, ctx, events, yarn material, mini-game framework, door/progress system, activity plug-ins, shared dolls). This file adds wave 3, the last one. **Christmas only. Never mention New Year** (the finale counts down to Christmas midnight, nothing after). No emoji, SVG icons only. All coordinates below were checked against the city's real colliders and prop anchors: the city was built headless in Node (`/tmp/w2probe/probe2.mjs`) and every spot was probed together with the runtime colliders (givers, Advent board, star stand, Reindeer Rest). Re-check your spots with `colliders.resolve` once at start-up and nudge them, as givers already do.

## Decisions (lead, 18 Nov): all recommended defaults below are ACCEPTED (door 24 date-gated to 24 Dec local once door 4 is done; wish picks 1 of 3 gifts; 2 new dolls; new titles 18–23; finale ends in free play; lead pre-work in audio; festive level capped at 4).
1. **Door 24 is date-gated: it opens on 24 Dec (player's local date) once door 4 is done** (the star must be resting by the tree). Doors 5–23 are not required, so a late starter on Christmas Eve plays doors 1–4 (about 8 min) and gets the finale. Before 24 Dec, a player who finishes 1–23 gets the wave-3 end card with a **"Look up!" preview** (a 16 s sleigh flyover round the tree, no landing) and a sleep countdown. Alternative: open 24 as soon as 1–23 are done, on any date. Why the default: waiting is what Advent is about, the finale stays a shared Christmas Eve moment for the whole town, and nobody is locked out on the night itself.
2. **Post-Christmas (local date ≥ 25 Dec): the one-by-one unlock is lifted.** Doors 1–23 are all open, in any order, and done doors stay replayable. Door 24 still needs door 4. The calendar switches to "Christmas mode".
3. **Wish → gift:** at door 22 the player writes to Santa and picks 1 of 3 special pieces (`coat:santa`, `hat:starlight`, `scarf:aurora`). Santa brings that piece in the finale. Each "Watch again" brings the next missing piece, then just the music box. Alternative: one fixed gift for everyone (`coat:santa`), and the letter's wish only changes Santa's line.
4. **Shared givers:** 17 Tilly (doll 5), 20 Mayor Tinsel (doll 24), 21 Conductor Clem (doll 11), 22 Elf Pepper (doll 15), 23 Auntie Noor (doll 12). Only **2 new dolls** (18 Postie Percy, 19 Nana Marigold), about 7.4k triangles. Alternative: 7 new dolls, about 26k triangles, which uses nearly the whole permanent budget.
5. **Door titles 18–23 change** from the "coming soon" list: 17 Carol Singing (kept) · 18 Christmas Cards (was Postcard Day) · 19 Hot Cocoa Hut (was Hot Cocoa Delivery) · 20 Lanterns for Santa (was Snowball Fight II) · 21 Present Delivery (was Light-up Puzzle) · 22 Letters to Santa (was Skating Show; the title moves up from 23) · 23 Pack the Sleigh (new). Rationale: no repeat-variant games in the last week, and every door builds towards Christmas Eve.
6. **The finale ends in free play** ("Keep exploring" / "Watch again" on the end card; no page reload). Clover goes back to the Reindeer Rest afterwards ("Santa says Clover can stay for the holidays"), so replays work.
7. **Lead pre-work touches `src/audio/music.js` + `src/audio/index.js`** (song segments for the carols rhythm game, one-note voice, music level after the Christmas swell). Exact code is in §0. Alternative: hand these to the Carols agent.
8. **Festive level stays capped at 4.** No city or life edits in wave 3. The Christmas Eve sparkle comes from the lantern runway, the gathering and the finale.

## What wave 3 adds
- Doors **17–23 become available** behind `?w3` until release: 4 mini-games (`carols`, `cocoa`, `presents`, `pack`) and 3 task doors (`post`, `lanterns`, `letters`).
- **Door 24 Christmas Eve, rebuilt as a restartable finale:** the town and your friends gather at the tree, you place the star, a **Town Spirit** moment, Santa lands guided by your lantern runway, Clover rejoins the team, Santa gives you your wished-for piece, countdown, Merry Christmas, fireworks, liftoff, end card. Then free play, plus "Watch again".
- **Lantern runway** through Pinecone Park (permanent, lit after door 20), the **post box** in the market, **Santa's mailbox** at the Reindeer Rest.
- 10 new wardrobe pieces: 7 door rewards + 3 wish pieces.
- Returning wave-2 saves get the one-time "New Advent doors are open!" card (17–23). There's a wave-3 end card after door 23 (before Christmas Eve), a Christmas Eve card, and a post-Christmas "Merry Christmas" card.

## Ownership (only edit your own files; ask the lead in your report for anything else)

| Agent | Model | Owns (new files in **bold**) |
|---|---|---|
| Lead | – | `src/main.js`, `src/core/layout.js`, `src/progress/doors.js`, `src/minigames/index.js`, `src/minigames/framework.js`, `src/minigames/minigames.css`, `src/audio/music.js` + `src/audio/index.js` (§0 edits only), `CONTRACTS.md`, `WAVE3.md`, `README.md`, `LOG.md`, `index.html`, `package.json`, `tools/**`, plus the §0 stubs (each stub then belongs to its builder) |
| Doors | Sonnet | `src/game/index.js`, `givers.js`, `lines.js`, `hints.js`, `models.js`, `tasks.js`, `selftest.js`, `debug.js`, `src/game/w2/reindeer.js` (additive Clover API only), `src/progress/index.js`, `src/progress/save.js` |
| Tasks | Sonnet | **`src/game/w3/post.js`**, **`src/game/w3/lanterns.js`**, **`src/game/w3/letters.js`** |
| Props & Wardrobe | Fable | **`src/game/w3/props.js`** (geometry builders only), `src/core/player.js`: **additive only** (new `STYLE_OPTIONS` entries + their geometry; no change to existing looks, the signature or the return shape) |
| UI & Net | Sonnet | `src/ui/**`, `src/calendar/**` except `data.js`, `src/net/**` |
| Calendar data | Haiku | `src/calendar/data.js` |
| Finale | Opus | `src/finale/**` (incl. **`eve.js`**, **`poses.js`**, **`preview.js`**) |
| Carols | Opus | **`src/minigames/carols/**`** |
| Presents | Opus | **`src/minigames/presents/**`** |
| Cocoa | Sonnet | **`src/minigames/cocoa/**`** |
| Pack | Sonnet | **`src/minigames/pack/**`** |

Everything else stays as it is: city, life, world, camera, the 9 existing games and the other `game/w2/*` files. `src/camera/**` belongs to the running camera follow-up agent until it merges (then the lead); everyone else only imports from it (`createCinemaRig`, the pose functions). Read-only imports across folders are fine: `life/tram.js` `buildTramMesh`, `TRAM_LEN`; `life/paths.js` `Path`; `minigames/sled/props.js` `crowdDollGeo`; `finale/reindeer.js` `reindeerGeos`, `REINDEER_RIG`; `audio/songs.js` (`JINGLE_BELLS`, `DECK_THE_HALLS`, `WE_WISH`); `city/kit.js` builders; `minigames/view.js`; `game/w3/props.js`.

**Batches** (2 CPUs, one Chrome at a time): **A** = Doors, Props & Wardrobe, Finale, Carols, Presents, Tasks. **B** = UI & Net, Calendar data, Cocoa, Pack. Start B when two agents from A have finished, or start everything at once if the Chrome lock queue stays short. Each agent: ≤ 6 Chrome runs, ≤ 150 steps each. Prefer JS logic tests (Node sims, `selfTest`, test hooks) over screenshots. Everybody builds and tests with `?w3`.

## §0 Lead pre-work (one commit "wave 3 scaffolding"; build must pass; selftest 1–16 stays green without `?w3`)
1. **`layout.js`**: add the block in §Layout.
2. **`doors.js`**:
   - flag: `export const W3 = typeof location !== 'undefined' && /[?&]w3(&|=|$)/.test(location.search || '');`
   - replace the `SOON` spread with the 7 entries in §Doors (`available: W3`), and give door 24 the new blurb (it keeps `available: false`, see §Progress);
   - add `export const WISH_REWARDS = [reward('coat', 'santa', 'Santa coat'), reward('hat', 'starlight', 'Starlight crown'), reward('scarf', 'aurora', 'Aurora scarf')];` and include them in `REWARDS`: `[...doorRewards, ...DAILY_REWARDS, ...WISH_REWARDS]`.
3. **Stubs**, so every door is playable before its builder lands:
   - `src/minigames/{carols,cocoa,presents,pack}/index.js`: the wave-2 stub pattern (`intro: 'Coming soon'`, `mg.finish({ score: 1, stars: 1, text: 'Stub game' })`) with id / title / district from §Doors.
   - `src/game/w3/{post,lanterns,letters}.js`: the wave-2 activity stub (`onGiver() { env.say(env.n, 'accept'); env.taskComplete('<id>'); env.completeDoor(env.n); }`, `objective: () => null`, `giverLabel: () => null`, `update() {}`, `sync() {}`, `selfTest: async (T) => { await T.talk(env.n); }`).
   - `src/game/w3/props.js`: every builder in §Props returning a plain box / cylinder `merge([...])` of the right size (Fable replaces them).
4. **`minigames/index.js`**: `import carols from './carols/index.js'; import cocoa from './cocoa/index.js'; import presents from './presents/index.js'; import pack from './pack/index.js';` then append them to `MINIGAMES`.
5. **Audio** (`music.js` + `index.js`, additive):
   ```js
   // music.js: play part of a song, then resume the medley. Beat b of the song sounds at start + b·spb (start may be in the past).
   let pendingSeg = null;
   function playSegment(song, fromBeat, toBeat, at, cb) { pendingSeg = { song, fromBeat, toBeat, at, cb }; const spb = 60 / song.bpm; return { start: at - fromBeat * spb, spb, bpm: song.bpm, meter: song.meter }; }
   // in tick(), before `if (!cur) …`: if (pendingSeg) { const s = pendingSeg; pendingSeg = null; release sustaining pads at s.at (as playSpecial does);
   //   startSong(s.song, s.at - s.fromBeat * 60 / s.song.bpm); cur.i = s.song.events.findIndex((e) => e.b >= s.fromBeat); cur.segEnd = s.toBeat; cur.segCb = s.cb; }
   // in the loop: if (cur.segEnd != null && (!ev || ev.b >= cur.segEnd)) { const end = cur.start + cur.segEnd * cur.spb + cur.spb; const cb = cur.segCb;
   //   startSong(MEDLEY[medleyIdx], end); if (cb) cb(end); continue; }
   // return { …, playSegment, voice(midi, t, dur, vol) { padChord(ac, padIn, [midi], t, dur, vol); } }   (padChord with one note = a soft choir "ooh")
   // index.js returned object:
   playSong(name, { fromBeat = 0, toBeat = Infinity, at, onEnd } = {}) { try { const s = [JINGLE_BELLS, DECK_THE_HALLS, WE_WISH].find((x) => x.name === name); if (!s || !ac || !music) return null; return music.playSegment(s, fromBeat, Math.min(toBeat, s.melLen), at ?? ac.currentTime + 0.15, onEnd); } catch (e) { return null; } },
   note(midi, { dur = 0.45, vol = 0.7, kind = 'choir' } = {}) { try { if (!ac || !music) return; const t = ac.currentTime + 0.01; if (kind === 'bell') glock(ac, music.out, midi, t, vol); else music.voice(midi, t, dur, vol); } catch (e) { /* audio optional */ } },
   // christmasSwell(): replace setMusicLevel(2) with setMusicLevel(game.state.phase === 'end' ? 2 : (game.state.spirit ?? 2))
   ```
   `playSong` returns `{ start, spb, bpm, meter }` in AudioContext seconds, or `null` when there is no audio. `audio.beat()` keeps working during a segment. Muted audio still schedules (the master gain is 0), so timing stays valid.
6. **`CONTRACTS.md`**: add a "Wave 3 additions" section: the events and APIs in §Events, `progress.eve` / `wish` / `finaleGift` / `flags`, `audio.playSong` / `note`, `tasks.gather` / `setGiverHidden` / `reindeer.*` / `lanterns`, `finale.replay` / `preview` / `exit`, `net.gather`, `ui.wear`, the flags `?w3`, `?date=`, `?eve`, `?xmas`.
7. Measure the baseline reference views (§Budgets) and log them before any builder merges.

## §Layout (add to `src/core/layout.js`, verbatim)
```js
// ---------------------------------------------------------------- Wave 3 (doors 17–24)
// DOOR_SPOTS entries 17–23 (add inside DOOR_SPOTS). Shared givers stand where their doll already stands.
// 17: { district: 'park', x: 3.5, z: 13.0 },        // Carol Singing: Tilly (door 5's doll), south-east of the gazebo
// 18: { district: 'market', x: 0.95, z: -3.0 },     // Christmas Cards: Postie Percy beside the post box (new doll)
// 19: { district: 'lakeside', x: 11.65, z: -4.25 }, // Hot Cocoa Hut: Nana Marigold, west of the cocoa hut's front (new doll)
// 20: { district: 'market', x: -0.8, z: -0.35 },    // Lanterns for Santa: Mayor Tinsel (door 24's doll)
// 21: { district: 'market', x: 0, z: 5.0 },         // Present Delivery: Conductor Clem (door 11's doll)
// 22: { district: 'park', x: 6.25, z: 8.25 },       // Letters to Santa: Elf Pepper (door 15's doll)
// 23: { district: 'market', x: -3.55, z: -1.0 },    // Pack the Sleigh: Auntie Noor (door 12's doll)

// ARENAS entries (add inside ARENAS):
//   carols: { x: 3.0, z: 11.6, stageY: 0.2, cam: { x: 3.0, y: 1.35, z: 14.6 }, target: { x: 3.0, y: 0.5, z: 11.7 },
//             player: [0, 0.42], choir: [[-0.42, 0.22], [0.42, 0.22], [-0.22, -0.05], [0.22, -0.05], [0, -0.25]] },
//             // gazebo stage (floor top y 0.2, r 0.72, pillars at r 0.68); player/choir are stage-local [x east, z south], all
//             // ≥ 0.2 from a pillar; the low camera keeps the back row under the roof ring (y 1.08) and over the crowd ring r 2.0
//   cocoa: { x: 12.8, z: -4.45, heading: 0, barista: { x: 12.8, z: -4.69 }, cam: { x: 13.35, y: 1.05, z: -3.35 }, target: { x: 12.8, y: 0.38, z: -4.5 },
//            queue: [[12.35, -3.95], [11.9, -3.7], [11.45, -3.5], [11.0, -3.3]] },
//            // counter in front of the hut (front wall z −4.84, awning y 0.95); queue[0] = the customer being served; tree at (11.86, −3.01)
//   pack: { x: 0, z: 2.4, heading: 0, cam: { x: 0, y: 1.9, z: 4.75 }, target: { x: 0, y: 0.45, z: 2.3 } },
//            // the landing rug (clear 3 × 2); Clem (0, 5.0) is behind the camera; the tree, Mayor and star stand sit in the background
//   (presents runs on TRAM_LOOP with PRESENTS below)

/** Door 18: the post box (front faces the plaza centre) and the friends who get a card (their dolls: doors 1–4). */
export const POST = {
  box: { x: 1.45, z: -3.35, heading: -0.41 }, // collider r 0.15; snowman (2.5, −3.05) 0.87 away, plaza walk loop 0.7 away
  to: [1, 2, 3, 4], // Mrs Holly (Holly Lane), Pip (park), Ilse (lake), Bram (hill): use tasks.giverPos(n) (nudged positions)
};

/** Door 20: Santa's lantern runway along the park path (path x = 0, half-width 0.35), ordered gate → market.
 *  Each ≥ 0.25 from the nearest collider (park lamps at (−0.6, 10.4) and (0.6, 12.8), pom-pom trees); collider r 0.07 each. */
export const LANTERNS = {
  spots: [[-0.95, 14.75], [0.95, 14.75], [-0.95, 13.2], [0.95, 13.2], [-0.9, 11.8], [0.95, 11.6], [-0.95, 10.0], [0.95, 10.0], [-0.95, 8.25], [0.95, 8.25]],
};

/** Door 22: five runaway letters (each flutters from a to b once when you come within 1.0, then waits at b) and
 *  Santa's mailbox beside the Reindeer Rest (front faces the park; Pepper 0.7 away, the Rest's west wall 0.3 away). */
export const LETTERS = {
  flutter: [[[-4.7, 9.4], [-5.2, 10.9]], [[-3.2, 13.4], [-1.7, 14.4]], [[2.3, 9.4], [1.8, 8.4]], [[4.3, 13.4], [4.8, 12.4]], [[4.8, 10.4], [4.3, 9.4]]],
  mailbox: { x: 6.75, z: 7.75, heading: -0.52 },
};

/** Door 21: Present Delivery. The tram starts at the Park Gate stop heading west and drives 1.5 laps of TRAM_LOOP (ends at
 *  the Sledge Hill stop). Catchers in route order; side 'R' = right of travel = plaza side (≈ 0.65 from the rails, behind the
 *  low fence), 'L' = outer pavement (≈ 1.6 from the rails). All clear of colliders; visits 16–19 reuse spots on lap 2. */
export const PRESENTS = {
  speed: 1.25, cornerSpeed: 0.85,
  catchers: [[-3.2, 5.45, 'R'], [-4.6, 8.6, 'L'], [-8.75, 3.2, 'L'], [-6.35, 1.6, 'R'], [-6.35, -2.8, 'R'], [-8.75, -3.2, 'L'],
    [-4.6, -8.5, 'L'], [-2.6, -5.45, 'R'], [0.9, -5.45, 'R'], [2.9, -8.45, 'L'], [8.75, -3.0, 'L'], [6.35, -1.6, 'R'],
    [6.35, 2.0, 'R'], [4.6, 8.6, 'L'], [3.2, 5.45, 'R'],
    [-3.2, 5.45, 'R'], [-8.75, 3.2, 'L'], [-6.35, -2.8, 'R'], [-1.2, -8.5, 'L']],
};

/** Door 24: Christmas Eve. gather = where your friends (giver dolls) stand round the tree, facing it (all clear; the aisle
 *  |x| < 0.75 between the tree and the landing stays free for the sleigh and team; the player's walk to Santa stays clear).
 *  Clover walks from the Rest to cloverWait during the gathering, then on cue into the empty harness (team slot 2 = rig-local
 *  (−0.19, 1.52) → world (0.19, 0.88) with the sleigh at MARKET.landing, heading π). netRing: remote players' dolls (radius
 *  round the tree, angle range from +z). */
export const EVE = {
  gather: [[-1.3, -0.65], [-1.3, 0.4], [-1.3, 1.45], [-2.0, -1.0], [-2.0, 0.75], [-2.35, -0.3], [-2.0, 1.8],
    [1.5, -0.65], [1.5, 0.4], [-0.95, 2.15], [2.2, -1.0], [2.2, 0.05], [1.85, 1.1], [2.9, -0.3]],
  cloverFromRest: [[7.53, 9.19], [6.9, 9.2], [6.45, 8.6], [6.5, 8.0], [5.0, 7.6], [2.8, 7.3], [1.0, 7.0], [0.4, 6.3], [0.5, 5.3], [1.0, 4.3], [1.55, 3.55]],
  cloverWait: { x: 1.55, z: 3.55 },
  cloverPath: [[1.55, 3.55], [0.95, 2.0], [0.6, 1.05], [0.19, 0.88]],
  teamSlot: 2,
  netRing: { r: 4.4, a0: -1.2, a1: 1.2 },
};
```

## §Doors (lead writes in `doors.js`)
| # | Title | Giver (doll) | `district` | Kind / id | Reward id → label |
|---|---|---|---|---|---|
| 17 | Carol Singing | Tilly (doll 5) | park | minigame `carols` | `hat:tophat` → Caroller's top hat |
| 18 | Christmas Cards | Postie Percy (new) | market | task `post` | `scarf:postal` → Postie's scarf |
| 19 | Hot Cocoa Hut | Nana Marigold (new) | lakeside | minigame `cocoa` | `coat:cocoa` → Cocoa coat |
| 20 | Lanterns for Santa | Mayor Tinsel (doll 24) | market | task `lanterns` | `coat:lantern` → Lantern coat |
| 21 | Present Delivery | Conductor Clem (doll 11) | market | minigame `presents` | `hat:parcel` → Present hat |
| 22 | Letters to Santa | Elf Pepper (doll 15) | park | task `letters` | `scarf:frost` → Snowflake scarf |
| 23 | Pack the Sleigh | Auntie Noor (doll 12) | market | minigame `pack` | `coat:elf` → Elf tunic |
| 24 | Christmas Eve | Mayor Tinsel | market | finale | Santa's gift: the wish piece (`progress.finaleGift()`) |

Blurbs (≤ 80 chars): 17 "Sing carols at the park bandstand: tap along in time with the music." · 18 "Deliver Christmas cards to four old friends all round Tinselby." · 19 "Pour, top and serve cosy mugs of cocoa at the lakeside hut." · 20 "Light a lantern path through the park so Santa can find his way." · 21 "Ride the tram and toss presents to every waving neighbour." · 22 "Catch the runaway letters for Santa and write a wish of your own." · 23 "Stack the town's presents neatly, ready for Santa's sleigh." · 24 "Gather the town, place the star and welcome Santa to Tinselby." Rewards use `reward(slot, key, label)` → id `${slot}:${key}`.

## §Progress (Doors agent: `progress/index.js`, `save.js`)
- **Eve clock.** `progress.eve` (getter, recomputed from the progress clock): `{ season, day, isEve, isAfter, sleeps }`. `season` = the year when the local month ≥ July, else the year − 1. `day` = `${season}-12-24`. `isEve` = today ≥ day. `isAfter` = today ≥ `${season}-12-25`. `sleeps` = whole local days from today to day (0 on and after Eve). Compare `dayKey` strings.
- **Test clock.** `?date=YYYY-MM-DD` (noon that day) · `?eve` (24 Dec of the season, 18:00) · `?xmas` (26 Dec). Implement with `api._clock`. They also apply to `daily`.
- **Door states with `W3`** (without `W3` everything stays exactly as it is now):
  - 24: done → `'done'`; `eve.isEve && isDone(4)` → `'open'`; else `'locked'`. Door 24 keeps `available: false`, so `lastAvailable()` = 23 and `wave:end` never fires for 24.
  - 1–23 when `eve.isAfter`: every available door that isn't done is `'open'` (no sequential locks).
  - `current()`: if `state(24) === 'open'` → **24** (Christmas Eve comes first), else the lowest open door as now.
- **Date flips mid-session.** The existing 30 s daily timer also re-checks `state(24)` and `eve.isAfter`. On a change it emits `door:open {n: 24}` (when 24 opens) and `progress:change {eve: true}`.
- **Wish.** Save `wish: null | id`, where the id must be in `WISH_REWARDS`. API `progress.wish = { options: WISH_REWARDS, get() → id | null, set(id) → id | null }`; `set` persists and emits `wish:set {id}`.
- **`progress.finaleGift()`** → reward info or `null`. Only when `state(24) === 'done'`. Picks the wish if it isn't owned, else the first unowned of `WISH_REWARDS`, else `null`. It grants with `notify: false` (no reward card mid-cinematic) and returns `{ id, slot, key, label }`.
- **`progress.wardrobe.source(slot, k)`** returns `{ santa: true, label }` for wish pieces (the tray shows "Santa's gift").
- **Flags.** Save `flags: string[]` (≤ 32 entries, each `/^[a-z0-9-]{1,24}$/`). API `progress.flags = { has(k), set(k) }` for one-time cards (`eve-card`, `xmas-card`). Save `eveWatched: int`, with `progress.markEveWatched()` (the finale calls it at its end card).
- `S.wave`: brand-new saves get `lastAvailable()` (23 with `?w3`). On `game:start` a returning save with `wave` 16 emits `doors:new {from: 17, to: 23}` once (the existing logic, unchanged).
- `?doors=N` is unchanged (N ≤ 23). `festiveLevel` and `spiritMax` stay as they are (level 4 for doors 7–24).

## §Doors agent: givers, hooks, door 24 flow, selftest
**New givers** (`lines.js` `GIVERS`; until Wardrobe lands, unknown keys fall back as in wave 2):
- 18 `{ who: 'Postie Percy', task: 'post', style: { coat: 'red', outfit: 'duffle', hat: 'earflap', scarf: 'postal', hair: 'long', hairColor: 'blonde', skin: 'tan' }, opts: {}, scale: 1.08 }`
- 19 `{ who: 'Nana Marigold', game: 'cocoa', style: { coat: 'cocoa', outfit: 'dress', hat: 'earmuffs', scarf: 'berry', hair: 'bob', skin: 'light' }, opts: { hair: '#d9d4cc' }, scale: 1.0 }`
- Shared: 17 `{ who: 'Tilly', doll: 5, game: 'carols' }`, 20 `{ who: 'Mayor Tinsel', doll: 24, task: 'lanterns' }`, 21 `{ who: 'Conductor Clem', doll: 11, game: 'presents' }`, 22 `{ who: 'Elf Pepper', doll: 15, task: 'letters' }`, 23 `{ who: 'Auntie Noor', doll: 12, game: 'pack' }`. Add 17–23 to `GIVER_DOORS`. Build new dolls only while their door is available (as now). `W3_ACTIVITIES = { post, lanterns, letters }` from `./w3/*.js`, registered like the wave-2 ones.

**Generic hooks in `game/index.js`** (wave 3 needs them, and they stay tiny):
- Before `resolve(doll)` in `onDoll`: `for (const a of actList) if (a.onDoll?.(doll)) return;`. In the label code: `const o = actList.map((a) => a.dollLabel?.(doll)).find(Boolean)` wins over `labelFor`. Neither runs for the activity's own giver (that one still goes through `onGiver`).
- `actEnv` additions: `sayOrToast(n, key, extra)` (a bubble if the giver is within 6 units of the player, else toast `{who}: "{line}"`), `giverPos(n)`, `dolls` (the unique doll list), `fill`, `GIVERS`.
- `tasks.setGiverHidden(n, hidden) → restore()`: hides the doll's root and marker and disables its spot (ref-counted, like `holdVehicle`).
- `tasks.gather({ on = true, face = MARKET.tree })`: puts every unique doll except the Mayor onto `layout.EVE.gather`, in ascending order of the doll's first door (14 slots for 14 dolls; extra dolls take no slot and stay put). Each doll turns to `face`, with a staggered hop and `pop` (0.08 s apart). Calling again with a new `face` only turns them. `on: false` restores spots, yaw and the normal "face the player" behaviour. Their colliders and spots stay where they were (the player isn't controllable during the finale).
- **Clover API** (in `w2/reindeer.js`, additive; `tasks.reindeer` gains these): `trotTo(path, speed = 1.4) → Promise` (a new mode `'script'`: walks the polyline with the walk cycle, ignores the task logic, resolves on arrival or when cancelled), `away(on)` (hide / show Clover while in the Rest), `snapHome()` (cancel, back in the Rest, visible). Door 15's own flow must behave exactly as before.
- `tasks.lanterns` getter → `activities.lanterns?.runway || null` (see §Door 20).
- **Door 24 flow.** `tasks.js` `placeStar` is unchanged (it completes 24, then emits `tree:starPlaced` → finale). Changes:
  1. **Star restore.** On load / `sync` with door 24 done: call `city.tree.placeStar()` once, instantly, and set `S.starPlaced = true`. Today the star wrongly reappears on the stand after a reload.
  2. **The Mayor's spot on Eve.** Disabled when `ds(24) === 'open'` **unless** door 10 or 20 is open (the nearest spot centre wins, so standing by the Mayor talks to her and anywhere else round the tree places the star).
  3. **Mayor lines and labels by state:**
     - 24 locked with 1–23 done, before Eve → `soon` (`{sleeps}`), label `Peek at Christmas Eve` (icon `star`) → `ctx.finale?.preview?.()`.
     - Eve, door 4 not done → `needStar`.
     - 24 done → `after`, label `Watch Christmas Eve again` → `ui.choose({ title: 'Watch Christmas Eve again?', options: [{ label: 'Yes, please!', value: 1 }] })` → `ctx.finale?.replay?.()`.
     - Post-Christmas, 24 done → `xmas`.
  4. vars gain `sleeps` ("3 sleeps", "1 sleep") from `progress.eve`.
- Talking rules for shared dolls are unchanged from wave 2. The choose card lists every done mini-game door of that doll (Tilly 5/17, Clem 11/21, Noor 12/23).

**Lines** (Doors writes all giver lines: warm, short, `{name}`, no emoji). Mini-game doors 17 / 19 / 21 / 23 → `accept, done, replay, retry, again, locked`. Task doors 18 / 20 / 22 → `accept, remind, done, after, locked`, plus 18 `back` ("All delivered? Pop back to Percy!"), 22 `wish` ("Would you like to write to Santa too?") and `posted`. Doors 1–4 dolls get a `card` line (each friend reads Percy's card: "A card for me? Merry Christmas to you too, {name}!"). Door 24 adds `soon`, `needStar`, `xmas`. Activities write their own progress toasts. Mini-game agents write their in-game text. The Finale agent writes Santa's lines and the overlays. UI writes the cards.

**Selftest** (`tasks.selfTest({ reset: true })`, with `?w3`): plays doors **1–23**, then 24 under a test clock. Real games are swapped for an instant completed result, as before. 18 / 20 / 22 use their activities' `selfTest`. `ui.choose` is stubbed to the first option (wish `coat:santa`). `EXPECT_LEVEL` = 4 for doors 9–24. Checks:
- after each door: done, reward owned and unlocked, next door open, level 4; post: the four `Give a card to …` labels appear; lanterns: `tasks.lanterns.allLit`; letters: `progress.wish.get() === 'coat:santa'`;
- clock 10 Dec: after 23, `wave:end` exactly once, `current()` null, `state(24) === 'locked'`, `eve.sleeps === 14`, Mayor label `Peek at Christmas Eve`;
- clock 24 Dec 18:00 (`progress._clock`, then the timer check): `door:open {n: 24}`, `current() === 24`; "Place the star" → door 24 done, `finale.running`; `finale.jumpTo(70)` → `rewards.has('coat:santa')` and `game.state.style.coat === 'santa'`; `finale.exit()` → phase `play`, controllable, every doll back on its spot (±0.01), `tasks.reindeer.atRest`, rig hidden;
- `finale.replay()` → jump to the end → `hat:starlight` owned → exit;
- reload with the same storage: doors 1–24, star on the tree (`S.starPlaced`), wish and lantern runway kept;
- fresh save, clock 24 Dec, `doors=4` equivalent → `state(24) === 'open'`, `current() === 24`;
- fresh save, clock 26 Dec, doors 1–8 → doors 9–23 all `open`;
- an old-format save (doors 1–16, `wave` 16) emits `doors:new {from: 17, to: 23}` once.

## §Activity interface additions (Tasks agent, `src/game/w3/<id>.js`, same `create(ctx, env)` shape as WAVE2)
`activity.onDoll(doll) → bool` and `activity.dollLabel(doll) → { label, icon } | null` (optional, see the hooks). Mid-task progress is **not** saved: after a reload, talking to the giver restarts the task (the WAVE2 rule). Props come from `game/w3/props.js`, one `InstancedMesh` per kind, everything hidden while the district isn't revealed. Every activity implements `selfTest(T)` and `window.__w3.<id>` debug helpers. Toasts: "Card delivered! 2 to go", "Lantern lit! 7 to go", "Letter caught! 3 to go".

### Door 18: Christmas Cards (task `post`)
- Post box at `POST.box` (permanent while `W3` and the market is revealed; ≤ 1.2k tris; collider r 0.15).
- Percy `accept` → 4 cards (the player carries `bundleGeo()` with `player.carry`; refuse politely if the hands are full). Objective `Deliver Christmas cards (k/4)` → the nearest remaining friend from `POST.to` (`env.giverPos(n)`).
- `dollLabel(doll)` → `Give a card to {who}` (icon `letter`) when that doll's door is in `POST.to` and its card is still in the bundle. `onDoll` → `say(n, 'card')`, the doll hops, `gift` sfx, `task:progress {id: 'post', step, of: 4}`. This works whatever that doll's own doors are doing (it beats Play again).
- After 4 → objective `Tell Postie Percy` → Percy `done` → `taskComplete('post')`, `completeDoor(18)`, bundle removed. Run ≈ 90–120 s.

### Door 20: Lanterns for Santa (task `lanterns`)
- 10 runway lanterns at `LANTERNS.spots`: 2 `InstancedMesh` (body, flame) from `lanternGeos()`, collider r 0.07 each, permanent while `W3` and the park is revealed. Flames are scale 0 while unlit. Once door 20 is done they stay lit forever.
- Mayor `accept` ("Santa needs a path of lanterns through the park to land safely on Christmas Eve.") → the player carries `taperGeo()`. Objective `Light Santa's lanterns (k/10)` → the nearest unlit lantern. A spot within 0.7 (`Light the lantern`, icon `lantern`) → flame pops in with an overshoot, `bell`. Any order.
- After 10: the runway "chase" plays (flames twinkle in sequence from the gate towards the market, 3 passes, 4 s) with `sleighBells`, then `ctx.teasers?.sky?.()` (tiny sky sleigh) → `env.sayOrToast(20, 'done')`, `taskComplete('lanterns')`, `completeDoor(20)`. Run ≈ 60–90 s.
- `activity.runway = { positions, get lit() → bool[10], get allLit(), chase(dur = 8) }` (the finale calls `chase` while the sleigh comes in over the park). `chase` is a no-op unless every lantern is lit.

### Door 22: Letters to Santa (task `letters`)
- Pepper `accept` ("Santa's mail sack burst and the wind blew the children's letters all over the park!") → 5 letters (`letterGeo()`, one `InstancedMesh`, faint GLOW seal) flutter at `LETTERS.flutter[i][0]`: bob 0.25–0.4 high, spin, drift r 0.15.
- When the player first comes within 1.0, a letter flutters to `[i][1]` on a 1.2 s arc (`whoosh`) and waits there. Within 0.7 there: `Catch the letter` (icon `letter`) → `pickup`, `task:progress`. Objective `Catch the runaway letters (k/5)` → nearest.
- After 5 → objective `Bring the letters to Elf Pepper` → Pepper `wish` → `ui.choose({ title: 'Dear Santa, for Christmas I wish for…', options: [{ label: 'A cosy Santa coat', value: 'coat:santa' }, { label: 'A starlight crown', value: 'hat:starlight' }, { label: 'A shimmering aurora scarf', value: 'scarf:aurora' }] })`. A null answer re-asks on the next talk. Then `progress.wish.set(v)`.
- Objective `Post the letters in Santa's mailbox` → spot at `LETTERS.mailbox` (`Post the letters`, icon `letter`) → letters fly into the mailbox, its flag pops up, Clover hops in the Rest (if there), `sleighBells` → `say(22, 'posted')`, `taskComplete('letters')`, `completeDoor(22)`.
- The mailbox (`mailboxGeo()`, ≤ 1k, collider r 0.14) is permanent from the moment door 22 opens (or is done) while the park is revealed. Run ≈ 90–120 s.

## §Per-door mini-game specs
All mini-games follow WAVE1 §Mini-games + WAVE2:
- default export `{ id, title, district, icon (SVG), intro, start(ctx, mg) }`; `await mg.intro()` first; `mg.finish({ score, stars, text })`;
- **1★ = finished** (cosy, reachable by everyone); run **55–75 s**;
- **one thumb** (big DOM buttons in `ctx.uiRoot` + tap anywhere where sensible), plus keys;
- portrait + landscape: pull shots back with `aspectK()`, pass `portrait: false` to your shots if you handle aspect yourself, and keep DOM clear of the framework HUD and ✕ (portrait: bottom thumb zone);
- yarn material + `core/prims.js`, existing sfx names only (plus `audio.note` / `audio.playSong` for carols);
- everything through `mg`, so dispose leaves the scene child count unchanged;
- a Node-testable `sim.js` with a bot (`perfect | good | sloppy | none`); `mgauto` plays `good` and reaches ≥ 1★; thresholds may move ±10 % on bot evidence (report the numbers);
- test with `?play&reveal=all&w3&mg=<id>&mgauto`.

### Door 17: Carol Singing (`carols`, Opus) at the gazebo, `ARENAS.carols`
- **Stage.** `const show = ctx.life.hideDistrict('park')`, `ctx.life.gatherAt(3.0, 11.6, 2.0)` (audience ring), `const unhide = ctx.tasks?.setGiverHidden?.(5, true)` (Tilly sings in the choir instead). `mg.setPlayerVisible(false)`.
- Build: the player's own doll (`buildCharacter(game.state.style)`, holding a little felt songbook) at `player`; 5 choir kids (one `InstancedMesh` of `crowdDollGeo`, one of them in Tilly's style) at `choir`, all at `stageY`, facing +z.
- **Songs.** Three carols back to back through `audio.playSong`:
  1. Jingle Bells chorus, beats 64–96;
  2. Deck the Halls, beats 0–32;
  3. We Wish You a Merry Christmas, beats 0–51.
  About 64 s plus a 2 s title card between carols ("Deck the Halls").
- **Chart** from the melody events (read-only `audio/songs.js`, `k === 'n'`): keep on-beat notes plus every note with `d ≥ 2`; drop any note < 0.42 s after the previous one; notes with `d ≥ 2` become **holds** ending at `b + d − 0.5`. Target 0.9–1.4 taps/s.
- **Lane** (DOM/SVG): knitted felt notes glide from the right to a wreath target. Landscape: lane in the bottom 20 %, target at 22 % from the left. Portrait: lane at 66–80 % height, full width.
- **Control.** Tap anywhere / Space / Enter = sing; hold for hold notes. Every hit calls `audio.note(m, { kind: 'choir' })` at the note's pitch, so your voice joins the melody.
- **Timing.** Note time = `start + b·spb` from `playSong`, minus `(ac.outputLatency || ac.baseLatency || 0)`. Without audio (`null`, capture), run your own clock at the song's bpm and pulse the target visibly.
- **Score.** Perfect (±0.11 s) 10, Good (±0.22 s) 5, hold 2 per held beat. Streaks of 8 → `ctx.life.cheer()` + a sparkle burst over the choir. **Stars: 1★ = all three carols finished, 2★ ≥ 60 % of max, 3★ ≥ 85 %.**
- **Camera.** One long non-skippable shot from `cam` to `target` (gentle sway, choir bobbing on the beat); portrait via `aspectK`. In dispose: `ctx.life.release(); show(); unhide?.();`.
- Budget ≈ player doll 3.6k + choir 5 × 3.6k (instanced, cast shadow) + sparkles ≤ 1k; ≤ 12 calls.

### Door 19: Hot Cocoa Hut (`cocoa`, Sonnet) at the lakeside hut, `ARENAS.cocoa`
- Copy the **giftwrap/cookies pattern**: counter cart group at (`x`, `z`) facing +z (≤ 2.5k: counter, cocoa pot, 4 topping jars, mug), the player's own doll as barista at `barista` facing +z, `mg.setPlayerVisible(false)`, one long non-skippable `cam.playShot` from `cam` to `target` (tune ±0.3) with a close post override (`{ bloom: 0.42, glow: 0.6, threshold: 0.35, band: 0.3, falloff: 0.3 }`), ease out in dispose.
- The player's real position doesn't change. The giver stands south-west of the hut, so the lakeside hut fold never triggers. Check the hut stays upright on screen.
- **6 customers** (one `InstancedMesh` of `crowdDollGeo`, ≤ 4 visible) shuffle along `queue` → `queue[0]`. Each has an order bubble (DOM, anchored to the projected head): mug + pour mark + 1–2 toppings from marshmallows / cream / cinnamon / candy cane.
- **Pour:** hold the big POUR button / Space; level rises 0.45/s; release in the band (centre 0.6 / 0.75 / 0.9, shown ±0.06 on a DOM gauge); accuracy = clamp(1 − |level − c| / 0.25, 0, 1); over 1.0 = splash, 0 for pour.
- **Toppings:** 4 big chips (keys 1–4); score = clamp(correct / needed − 0.34 · wrong, 0, 1). Auto-serve when the needed count is reached; the customer sips, a steam heart, hop.
- **Score.** Per order `round(100 · (0.6 · pour + 0.4 · toppings))` + speed bonus ≤ 20 (full under 5 s, 0 at 10 s); max 720. **Stars: 1★ = all 6 served, 2★ ≥ 430, 3★ ≥ 610.** A 90 s safety cap (the rest leave happily). sfx: `ui`, `pop`, `pickup`, `task`.
- Budget ≤ 16 calls, ≤ 25k tris. Hook `window.__cocoa = { state, bot(mode), auto, ff(sec, step), budget(), log }`.

### Door 21: Present Delivery (`presents`, Opus) on `TRAM_LOOP` with `PRESENTS`
- `const release = ctx.life.holdVehicle?.('tram')` (hides the ambient tram). Your own tram from `buildTramMesh(engine)` on `new Path(layout.TRAM_LOOP, { closed: true, radius: 1.0 })`, **auto-driven** from the Park Gate stop (`path.nearestS(0, 6.05)`) heading west, `speed` on straights, `cornerSpeed` within 1.2 of a corner, 1.5 laps (≈ 70 s). `mg.setPlayerVisible(false)`. A sack of presents rides on the tram's rear platform.
- **Catchers** (one `InstancedMesh` of `crowdDollGeo`, tinted, ≤ 8 visible, spawned 6 units ahead) wave on their spots, each with a felt target ring on the ground. The ring glows **gold** while a throw right now would be Perfect (an all-ages aim aid).
- **Control:** two big DOM buttons (THROW ◀ left / THROW ▶ right, bottom corners), tap the left / right half of the 3D view, ← → / A D. A present (instanced box, ≤ 6 in flight) arcs to that side in 0.5 s, keeping 90 % of the tram's forward velocity. It lands on the side's line (R 0.65, L 1.6 from the rails).
- **Score.** Landing ≤ 0.18 from a catcher = Perfect 20 (catch + hop + `pop`); ≤ 0.4 = Good 10; else it lands in the snow (puff) and the catcher shrugs. Max 380 (19 catchers). **Stars: 1★ = route finished, 2★ ≥ 190, 3★ ≥ 300.**
- **Camera:** chase rig behind and above the tram (like door 11), ≥ 2 s look-ahead in corners, portrait via `aspectK`. HUD: presents delivered k/19.
- Ignore cars and walkers. Budget ≤ 12 calls, ≤ 40k (tram 3.6k + catchers + presents). Hook `window.__presents = { state, bot(mode), ff(sec, step), budget(), log }`.

### Door 23: Pack the Sleigh (`pack`, Sonnet) on the landing rug, `ARENAS.pack`
- `const show = ctx.life.hideDistrict('market')` (plaza walkers would cross right in front of the camera). `mg.setPlayerVisible(false)`.
- Build: a big knitted **sleigh basket** (the cargo bed Santa's sleigh picks up; ≤ 4k) with a **5 × 3 grid** bed (cell 0.16 wide, 0.12 tall), a candy-cane rail above it, and presents (instanced boxes, tinted, ribbon cross; widths 1 or 2 cells).
- **12 presents**, seeded widths `[1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1]` (sum 15 = a perfect pack). Each slides along the rail ping-pong at 1.0 + 0.06·i cells/s.
- **Control:** tap / Space / big DROP button. The present snaps to the column under it and drops to rest on the highest filled cell in its footprint (a 2-wide over uneven heights leaves a gap = wobble). A present that would stick out above row 3 tumbles into the snow ("Oops!", no fail).
- **Score.** +10 per cell filled, +25 per completed row (sparkle, "Neat!"), −5 per gap left under a present, +50 for a perfect pack (15 cells, 0 gaps); max 275. **Stars: 1★ = all 12 dropped, 2★ ≥ 160, 3★ ≥ 240.** At the end the basket gets a big ribbon bow (`gift`, `cheer`).
- **Camera:** one long non-skippable shot from `cam` to `target` (tree behind, portrait via `aspectK`). sfx: `ui`, `drop`, `pop`, `bell`, `gift`.
- Budget ≤ 12 calls, ≤ 20k. Hook `window.__pack = { state, bot(mode), ff(sec, step), budget(), grid, log }`.

## §Door 24: Christmas Eve finale (Finale agent, Opus, `src/finale/**`)
**Reuse as is:** `rig.js` (sleigh + team + Santa, `createFlight`), `sleigh.js`, `santa.js` (poses `sit`, `stand`, `wave`, `give`, `cheer`), `trail.js`, `gift.js` (the music box with the name tag stays Santa's gift box), `core/fx.js` `Fireworks`, `camera/shots.js` poses (`treeStarPose`, `landingPose`, `greetPose`, `giftClosePose`, `giftOpenPose`, `crowdPose`, `pullbackPose`, `endOrbitPose`) and `createCinemaRig` (read-only), `setShotPortrait('cinema' | 'cinemaOut', { keep: 0.75 })`.

**Extend:**
- `reindeer.js`: `team.setSlotVisible(i, on)` hides one team body and its 4 legs. The static reins stay, so the empty harness reads.
- `overlay.js`: `spirit({ doors, helpers, mine })` banner with a 2.5 s count-up, `hideSpirit()`, a gift tag with the item label, `previewLabel(text)`, and the new end card (below). All portrait-safe.
- `teasers.js`: `resume()` (after `stop()`).

**Rebuild:**
- **`eve.js`**: a new timeline. It keeps `sequence.js`'s structure (cues + tracks + `jumpTo`), but it is **restartable** (`reset()` restores the rig, team slots, Santa in the seat, fireworks, gift and overlays). `sequence.js` stays for the non-`W3` path.
- **`poses.js`**: `spiritPose` (low, among the crowd, looking up at the star), `cloverPose` (low, beside the team, following Clover), `previewPose`.
- **`preview.js`**: the pre-Eve flyover.
- `index.js` picks `W3 ? eve : sequence` (import `W3` from `progress/doors.js`). `?finale` / `&fjump` keep working.

**API** (`ctx.finale`): `running`, `time`, `jumpTo(t)`, `replay()` (star already on the tree; starts at the gathering), `preview()` (16 s, only in phase `play`), `exit()`, `rig`, `trail`. Hook `window.__eve = { get state(), jumpTo, replay, preview, exit, budget() }`.

**Trigger:** `tree:starPlaced` (the player's "Place the star"; `placeStar` already completed door 24) → `start({ replay: false })`. **Timeline** (seconds; star in the socket at 0; times shown for the Clover case; without Clover every cue from 25.5 moves 4 s earlier):

| t | Cue |
|---|---|
| 0.0 | phase `finale`, `player.controllable = false`, `ctx.input.enabled = false`, `teasers.stop()`, `city.tree.setLights(1)`, `camRig.start()`, cut `treeStarPose`, `bell`, emit `finale:start {replay}`, `ctx.net?.refreshSpirit?.()` |
| 0.8 | **Gathering:** `life.gatherAt(tree, 3.5)`, `tasks.gather({ face: tree })`, `netRelease = ctx.net?.gather?.({ x: tree.x, z: tree.z, ...EVE.netRing })`; if `tasks.reindeer.atRest`: `clover = true`, `trotTo(EVE.cloverFromRest)` (off camera); cut `crowdPose` (blend 2.0) |
| 1.4 | `life.cheer()`, `cheer` |
| 3.5 | **Town Spirit:** `doors = max(net.townSpirit.doors, progress.doneCount())`, `helpers = max(net.townSpirit.helpers, 1)`; `overlay.spirit(...)`: kicker "Town Spirit", "{doors} Advent doors opened", "by {helpers} friends in Tinselby" (offline: "You opened {mine} Advent doors!"); sparkles stream from every gathered friend and remote doll up to the star (`trail.emit` on arcs); cut `spiritPose`; emit `town:moment {doors, helpers}` |
| 6.0 | star flare (`trail.puff` at the socket), `bell`, `cheer` |
| 8.5 | `overlay.hideSpirit()` |
| 9.0 | **Santa:** approach as in `sequence.js` (old 2.0 + 7); `tasks.lanterns?.chase?.(8)`; if `clover`: `team.setSlotVisible(EVE.teamSlot, false)` (empty harness) |
| 10.6 / 12.5 / 15 / 17.6 / 19.4 | `whoosh` / cut `landingPose` / `sleighBells` / `whoosh` / team `gallop` (old cues + 7) |
| 21.0 | landed (old 14 + 7) |
| 21.5 | **Clover** (if `clover`): `dialog {who: 'Santa', text: 'Ho ho ho! Clover, there you are!'}`, cut `cloverPose`, `trotTo(EVE.cloverPath)` (≈ 2.4 s) |
| 24.2 | at the slot: `tasks.reindeer.away(true)`, `team.setSlotVisible(EVE.teamSlot, true)`, `trail.puff`, `sleighBells`, `cheer` |
| 25.5 → 37.5 | greet → Santa out → wave + `hohoho` → walk → gift (old 14.5 … 26.5, + 11); `tasks.gather({ face: santaSpot })` at 26.0 |
| 32.0 / 33.6 | `const gift = ctx.progress?.finaleGift?.()`; tag "For {name}" + `gift?.label` + "with love, Santa"; emit `santa:gift {name, reward: gift}` |
| 35.2 | (lid open + 0.4) if `gift`: sparkles fly from the box to the player, `ctx.ui?.wear?.(gift.slot, gift.key)` (fallback `player.setStyle`), `trail.puff` round the player, `gift` sfx |
| 37.5 | crowd pose, `tasks.gather({ face: tree })`, `cheer` |
| 39 – 48 | countdown 10 → 1 (old 28 + 11), "Christmas Eve · countdown to midnight" |
| 49.0 | `christmas` (old 38 + 11): "Merry Christmas!", fireworks, Joy to the World (audio listens itself) |
| 49.3 – 62 | Santa hops in, liftoff with the full team (Clover included), fireworks (old 38.3 … 51, + 11) |
| 63.0 | end card, `cam.setMode('attract')`, `camRig.release(3.5)`, `progress.markEveWatched()`, emit `game:end {}` (phase stays `finale` until exit) |

Skippable spans: [0.4, 21.0] and [55, 63] (tap, Space, Enter, Esc, E; cues in between fire silently, as now).

**End card** ("knit-card", portrait: 90vw, buttons stacked):
- stitches, "Merry Christmas, {name}!", "— love, Tinselby";
- if a gift: "Santa's gift: {label}", with a small "You're wearing it!";
- "{doors} Advent doors opened together";
- buttons **Keep exploring** (green) → `exit()` and **Watch again** (cream) → `exit()` then `replay()`.

**`exit()`:**
- removes overlays; `cam.setMode('follow')` + `camRig.release(1.2)`;
- phase `play`, `player.controllable = true`, `ctx.input.enabled = true`, `player.carry(null)`;
- `life.release()`, `tasks.gather({ on: false })`, `netRelease?.()`, `tasks.reindeer.snapHome()` + `away(false)`;
- rig hidden, team slots visible, Santa back in the seat; fireworks fade out over ≤ 15 s, then dispose;
- `teasers.resume()`, `ctx.audio?.setMusicLevel?.(game.state.spirit)`; emit `finale:exit {}`.

The star stays on the tree.

**Replay:** `replay()` = `start({ replay: true })` from phase `play`: no star flight; cue 0 cuts straight to `crowdPose`, everything else is identical (the next wish piece, or no item).

**Preview** (`preview()`, before Eve; Mayor "Peek at Christmas Eve" or the wave-3 end card):
- phase `finale` for 16 s; the rig (full size, shadows on) flies 1.3 loops round the tree at height 4–6, radius 6, then climbs away; sparkle trail, `sleighBells`, `hohoho`;
- cinema rig `previewPose`; `overlay.previewLabel('Christmas Eve · {k} sleeps to go')`, then "See you on Christmas Eve, {name}!";
- skippable; back to phase `play` exactly as `exit()` does (no gathering).

**Eye view and portrait:**
- the finale and the preview run in phase `finale` with a `playShot`, so eye view suspends itself and the doll shows again (the director un-hides it once `cam.eye` < 0.8; check the gift close-up from a start in eye view);
- after `exit()` the saved view (follow / eye / high) comes back;
- every new overlay has portrait rules; poses use `ctx.cam.portrait` like the existing ones (`keep 0.75`).

**Budget:** finale peak (countdown + fireworks, everyone gathered) ≤ 580k triangles in `stats()`, ≤ +25 draw calls over the same view in play. Nothing left after `exit()` (scene child count and `trail` / fireworks pools back to idle).

## §Wardrobe (Fable; `src/core/player.js`, additive)
`STYLE_OPTIONS` additions:
- coat `cocoa: '#6b4130'`, `lantern: '#d9822b'`, `elf: '#3c8d4a'`, `santa: '#c4262e'`;
- hat `tophat: "Caroller's top hat"`, `parcel: 'Present hat'`, `starlight: 'Starlight crown'`;
- scarf `postal: '#c0392b'`, `frost: '#dce8f2'`, `aurora: '#4fb3a6'`.

Scarf and coat values **stay plain hex**; accents go in the geometry. Each piece ≤ 400 tris; the player doll stays ≤ 4.5k.
- `cocoa`: fluffy cream "whipped" collar, 3 pink/white marshmallow buttons.
- `lantern`: dark toggle buttons, a tiny GLOW lantern charm on the belt.
- `elf`: red/white felt zigzag hem, black belt with a gold GLOSS buckle.
- `santa`: white fluffy trim at the hem, cuffs and placket (like the Santa hat trim), black belt with a gold buckle. It must read clearly apart from `red`.
- `tophat`: black felt top hat, red band, holly sprig (2 leaves + 3 berry beads), slight tilt. Ears visible.
- `parcel`: small red felt gift box hat, gold ribbon cross and bow on top, jaunty tilt. Ears visible.
- `starlight`: gold felt headband with a GLOW five-point star at the front (echoing the tree star) and 2 small GLOW side beads. Hair visible.
- `postal`: a tiny cream felt envelope charm with a red heart seal on one tail.
- `frost`: 3 small white felt snowflake charms (6 points) on the tails.
- `aurora`: violet and pink accent bands (the `scarfTail` stripe) and tiny GLOW beads in the fringe.

Check with `tasks.debugLineup(styles)` and the style tray. Remote dolls get them automatically.

## §Props (Fable; `src/game/w3/props.js`, pure geometry, origin at the base centre, front +z, yarn material)
`postBoxGeo()` ≤ 1.2k (red felt pillar box: domed cap, gold slot band, little wreath) · `lanternGeos()` → `{ body ≤ 300 (dark iron post 0.55 tall, cage, snow cap), flame ≤ 80 (GLOW, at y 0.47) }` · `mailboxGeo()` ≤ 1k (red felt mailbox on a candy-cane post, gold star, flag on a pivot: export `MAILBOX_FLAG = { x, y, z }`) · `letterGeo()` ≤ 120 (cream envelope, red seal) · `taperGeo()` ≤ 200 (carried taper with a GLOW flame) · `bundleGeo()` ≤ 200 (cards tied with ribbon). The Tasks agent owns placement, instancing, colliders and animation.

## §UI & Net (UI & Net agent) and §Calendar data (Haiku)
- **Cards** (held while phase ≠ `play`, as now):
  - `doors:new` for 17–23 → sub "Christmas Eve is coming!";
  - **wave-3 end card** on `wave:end` with `lastAvailable() === 23`. Before Eve: kicker `All 23 doors opened!`, title `Santa's sleigh is nearly here…`, sub `Christmas Eve opens on 24 December: {k} sleeps to go!`, buttons `Look up!` (`ctx.finale.preview()`) / `Later`. After Christmas: kicker `Every Advent door is open!`, title `Merry Christmas, {name}!`;
  - **Christmas Eve card** on `game:start` + 2.5 s (or on `door:open {24}`) when `state(24) === 'open'` and `!flags.has('eve-card')`: kicker `Christmas Eve`, title `Santa is on his way to Tinselby!`, sub `Meet Mayor Tinsel at the big tree`, buttons `Show me` (`tasks.focusDoor(24)`) / `Later`, then `flags.set('eve-card')`. If it is Eve but door 4 isn't done: sub `Help Bram bring the star to the big tree first`;
  - **Merry Christmas card** once (`xmas-card`) when `eve.isAfter`: `Merry Christmas, {name}!` / `Every Advent door is open: play them again any time.`
- **Calendar panel:**
  - door 24 tile: locked → `Opens on Christmas Eve · {k} sleeps`; open → `Tonight!` (gold glow); done → the gift label + `Watch again` (`ctx.finale.replay()` when phase `play`);
  - post-Christmas header `Merry Christmas, {name}!`, every open tile reads `Play any time`.
- **Board:** door 24 glows gold while open and shows a star once done.
- **Wardrobe tray:** lock label `Santa's gift` for `source().santa`; `SHORT` labels `tophat: 'Top hat'`, `parcel: 'Present'`, `starlight: 'Crown'`; board `HAT_TINT` `tophat: '#2b2523'`, `parcel: '#c4362f'`, `starlight: '#e3aa3a'`.
- **Icons** (`ui/icons.js`, SVG, same style): `note`, `letter`, `cocoa`, `lantern`, `parcel`, `sleigh`, `tree`.
- **`ui.wear(slot, key)`** already exists; the finale uses it.
- **Net:** `net.gather({ x, z, r, a0, a1 }) → release()`. While it's active, each remote doll (≤ 12) is drawn locally on a slot of that arc (angle from +z, slots spread evenly, each pushed off colliders with `colliders.resolve(p, 0.15)`), facing (x, z), with an idle bob; name tags follow. `release()` blends them back to their live interpolated positions over 1 s. It is local only: no protocol or DB changes, and it never throws (the offline stub returns a no-op).
- **Haiku (`calendar/data.js` only):** `eve()` (`progress.eve` or the same computation as the fallback), `sleepsText(k)` ("3 sleeps" / "1 sleep" / "Tonight!"), `giftLabel()` (door 24: `progress.wish.get()` label, else "A surprise from Santa"), `isChristmas()` (`eve().isAfter`), `door24Text()`.

## §Events and APIs (new in wave 3)
- **Events:**
  - progress: `wish:set {id}`, `progress:change {eve: true}`, `door:open {n: 24}` (on the date flip);
  - tasks: `task:progress {id: 'post' | 'lanterns' | 'letters', step, of}`, `task:complete {id: 'post' | 'lanterns' | 'letters'}` (chime only);
  - finale: `finale:start {replay, preview}`, `finale:exit {}`, `town:moment {doors, helpers}`, `santa:gift {name, reward}` (payload extended);
  - existing: `door:*`, `reward:grant`, `wave:end` (fires after 23 when `current()` is null), `minigame:*`, `christmas`, `game:end`.
- **APIs:**
  - progress: `progress.eve`, `wish`, `finaleGift()`, `flags`, `markEveWatched()`;
  - audio: `audio.playSong(name, opts)`, `audio.note(midi, opts)`;
  - tasks: `tasks.gather(opts)`, `setGiverHidden(n, h)`, `reindeer.{trotTo, away, snapHome}`, `lanterns`, `activities.{post, lanterns, letters}`;
  - finale: `finale.{replay, preview, exit}`, `team.setSlotVisible`;
  - net and UI: `net.gather`, `ui.wear`;
  - layout: `POST`, `LANTERNS`, `LETTERS`, `PRESENTS`, `EVE`, DOOR_SPOTS 17–23, ARENAS `carols`, `cocoa`, `pack`;
  - doors.js: `W3`, `WISH_REWARDS`.
- **Flags:** `?w3`, `?date=YYYY-MM-DD`, `?eve`, `?xmas`.

## §Budgets (measure with `window.__tinselby.stats()`, shadow pass included)
- **Scene:** worst high view ≤ **580k triangles**. Reference views: `?play&reveal=all&noshots&net=off&tod=21&at=0,2&view=high&w3` with `&doors=23` (runway lit, post box, mailbox, new givers), and `&doors=23&eve&finale&fjump=42` (finale countdown, everyone gathered), 60 steps in. The lead measures before and after each merge.
- **Permanent wave-3 props ≤ 30k triangles** (main pass). Allocation:
  - 2 new givers ≈ 7.4k · post box ≤ 1.2k · runway 10 × ≤ 380 = 3.8k · mailbox ≤ 1k;
  - letters ≤ 0.6k (only while door 22 is open) · carried taper / bundle ≤ 0.4k (only while carried);
  - reserve ≈ 15k for Fable polish (Christmas-mode touches).
  - Draw calls ≤ +8 in `stats()`.
- **Each mini-game while running: ≤ 25 draw calls and ≤ 60k triangles** (shadow casters ×2, like `__snowball.budget()`); zero left after dispose.
- **Finale:** see §Door 24.
- Per-frame update ≤ 1 ms (desktop) per wave-3 module when idle. No new textures except small canvas labels (≤ 512 px).

## §Test hooks (every builder)
- Mini-games: `window.__carols`, `__cocoa`, `__presents`, `__pack` with at least `{ state (getter), bot(mode) | auto, ff(sec, step = 1/30), budget() → { calls, tris } }`, removed on dispose. `mgauto` runs the bot.
- Tasks: `window.__w3 = { post: { state, deliverAll() }, lanterns: { state, lightAll(), chase() }, letters: { state, catchAll(), post() } }` (teleporting helpers). Each activity also implements `selfTest(T)`.
- Finale: `window.__eve`. Doors: `tasks.selfTest()` as specified. UI: `ctx.ui.cards` test helpers as in wave 2.

## §Acceptance checklist (each builder, before reporting done)
- [ ] `npx vite build` passes. No console errors in entry, play, your feature start/quit/finish, `selfTest`, and with `?w3` on and off.
- [ ] Only your own files changed (list them in your report).
- [ ] Phones in **portrait (390×844, 360×740) and landscape (812×375, 667×375)**: one-thumb controls reachable, nothing overlaps the framework HUD, the ✕, toasts or the safe areas. Rotating mid-run adapts.
- [ ] **Eye view:** your feature starts and ends cleanly from `?view=eye` (shots suspend it; the saved view returns afterwards).
- [ ] Budget numbers measured and reported (calls / tris, idle and peak).
- [ ] Works offline and with `?net=local`; `?reset`, `?doors=N`, `?date=`, `?eve`, `?xmas` behave.
- [ ] Mini-games: start → quit (✕) → start again → finish → Play again → Done all leave the scene clean. The `mgauto` bot gets ≥ 1★ and the `perfect` bot 3★ (Node sim numbers in the report). Durations 55–75 s.
- [ ] Finale: first run, `Watch again` and `Keep exploring` all leave phase `play` with a clean scene; reload keeps the star on the tree; works with and without Clover (door 15 done / not done) and without door 20 (no runway chase).
- [ ] Copy: Christmas only (never New Year), warm, short, `{name}` where natural, no emoji, SVG icons only.
- [ ] A returning wave-2 save (doors 1–16 done, `wave` 16) gets door 17 open, the `doors:new` card once, festive level 4, and its wardrobe and house still work.

## §Release plan (lead)
1. **Scaffolding** (§0) → commit. Selftest 1–16 green without `?w3`; with `?w3` doors 17–23 run on stubs.
2. **Props & Wardrobe** (Fable) → commit (reward pieces and prop builders must exist before the doors grant or place them; Percy and Marigold wear `postal` and `cocoa`).
3. **Doors** (progress eve / wish / flags, givers 18/19, hooks, gather, Clover API, door 24 flow + star restore, lines, selftest 1–24) → commit.
4. **Calendar data (Haiku) + UI & Net** (cards, calendar Christmas mode, icons, `net.gather`) → commit.
5. **Tasks** (post, lanterns, letters) → selftest + one Chrome pass each → commit.
6. **Finale** → `?w3&doors=23&eve&finale` run (+ `fjump`), `Watch again`, `Keep exploring`, preview, portrait + eye view → commit.
7. **Mini-games as they land:** pack → cocoa → carols → presents. Each: `mg=<id>&mgauto` run, start/quit/cleanup e2e, budget → commit.
8. Extend `tools/playthrough.py`: 13 games, doors 1–24 (test clock), finale replay / exit, phone layouts. Measure the reference views (≤ 580k). Spawn Sonnet QA (report only) + a Fable polish pass (finale framing, runway at night, carols stage, cocoa close-up) + Haiku small fixes from the QA report.
9. **Ship ~9 Dec:** full e2e green → flip `W3` to live (`W3 = !/[?&]w[12](&|=|$)/.test(...)`, so `?w2` previews the wave-2 calendar and `?w1` wave 1) → push `main` → Vercel. If a game isn't ready, apply WAVE2 decision 5: doors from the first unready one stay `available: false`, so `wave:end` fires at the last ready door. On or after Eve, door 24 still opens (it only needs door 4).
10. **Polish window to 24 Dec:** small fixes only. Feature freeze 20 Dec. On 23 Dec, verify `?eve` and `?xmas` on the live build. No deploys on 24–25 Dec except P1 fixes. Log everything in `LOG.md`.

## Product decisions (user, 18 Nov) that affect wave 3
- Audience: friends, family and strangers. Next features after/alongside wave 3: (1) Photo mode + shareable postcards, (2) Play together with friends via invite links (same town), emotes, snowballs, riding together, gifting a wardrobe piece.
- Chat: READY-MADE PHRASES ONLY, for everyone (friends and strangers). No free typing anywhere.
- Free-play rides exist (src/rides/**: tram, carriage, Ferris wheel, carousel, skating, sledging); rides stop on minigame:start / finale:start.
