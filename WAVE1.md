# Tinselby — Wave 1 contract (Advent calendar + shared town + doors 1–8)

Read `CONTRACTS.md` first (base modules, ctx, events, yarn material, budgets). This file adds the wave 1 systems. **Christmas only. Never mention New Year.**

## The new game loop
- Tinselby gets a **24-door Advent calendar**. Doors unlock **by progress**: finishing door N opens door N+1. In wave 1, doors **1–8** are playable. Doors 9–24 show as "coming soon".
- Each door = talk to that door's quest giver → do the activity → get a **reward** (wardrobe piece or town decoration) → the next door opens, with a toast and a hint arrow to the next giver.
- **Done doors stay replayable.** A mini-game door can be replayed for stars and best scores by talking to its giver again.
- A **daily gift box** appears beside the Advent board the first time the player visits on a new calendar day. It holds a small bonus and builds a visit **streak**. It never locks content.
- **Shared town:** other online players appear as knitted dolls with name tags, walking live. A town-wide **Town Spirit** counter (doors opened by everyone) shows on the Advent board and in the calendar panel.
- After door 8 in wave 1, the player sees a teaser card: "Santa's sleigh has been spotted over Tinselby… new doors are coming soon!" Door 24 (Christmas Eve: place the star → Santa finale) stays locked until 1–23 are done.

## Ownership (only edit your own files)

| Agent | Owns |
|---|---|
| Lead | `src/main.js`, `src/core/*` (except as noted), `src/minigames/framework.js`, `src/minigames/minigames.css`, `src/minigames/index.js`, `index.html`, `*.md`, `package.json`, `vite.config.js`, `supabase/**` |
| Foundation | `src/progress/**`, `src/game/**`, plus **additive** wardrobe additions in `src/core/player.js` (new entries in `STYLE_OPTIONS` + their geometry in `buildCharacter`; don't change existing looks or the function's signature/return shape) |
| Calendar & UI | `src/ui/**`, `src/calendar/**` |
| Multiplayer | `src/net/**` |
| Snowball fight | `src/minigames/snowball/**` |
| Ornament hunt | `src/minigames/ornaments/**` |
| Sled race | `src/minigames/sled/**` |
| Cookie baking | `src/minigames/cookies/**` |
| World & time of day | `src/world/**`, `src/city/**`, `src/core/engine.js` (lighting), `src/core/post.js`, `src/core/fx.js`, `src/life/{index,tram,cars,traffic}.js` + new `src/life/carriage.js` |

City, life, finale, audio and camera stay as they are. Don't edit them; ask in your report if you need something. Read-only imports across folders are fine.

## ctx additions (build order in main.js)
audio → city → life → **progress** → **minigames** (games registered) → tasks → ui → **calendar** → **net** → finale.

### §Progress (`createProgress(ctx)` → `ctx.progress`), Foundation agent
Save in localStorage key `tinselby.save.v1` (versioned JSON, try/catch, tolerate corrupt/missing data). Anonymous `playerId` (crypto.randomUUID, persisted).

```
progress.playerId                    // uuid string
progress.doors                       // DOORS metadata array (below)
progress.state(n)                    // 'locked' | 'open' | 'done' | 'soon' (soon = not available in this wave)
progress.current()                   // lowest open-not-done door, or null if none available
progress.isOpen(n)                   // open or done
progress.complete(n, {score, stars}) // marks done (idempotent), grants reward, opens n+1 if available,
                                     //   emits door:complete, reward:grant, door:open; calls ctx.net?.recordDoor?.(n)
progress.best(gameId)                // {score, stars} | null
progress.recordMiniGame(gameId, r)   // keeps best score/stars (the framework calls this)
progress.doneCount()                 // number of doors done
progress.rewards.owned() / has(id) / grant(id)
progress.wardrobe.unlocked(slot)     // option keys unlocked for 'coat' | 'hat' | 'scarf' (defaults always unlocked)
progress.daily                       // { available:bool, streak:int, claim() → reward|null }
progress.save()                      // also autosaves on change
progress.reset()                     // debug: wipe save (URL ?reset also does this)
```

Also: map doors done → the existing festive level so city, audio and evening keep working. Emit `spirit:change {value: level, max: 4}` with level = 0 (0 doors), 1 (1–2), 2 (3–4), 3 (5–6), 4 (7+). Restore the level on load, so a returning player's town is already festive. `game.state.spirit` should mirror it.

### Doors (Foundation implements `src/progress/doors.js`, content below)
| # | Title | Giver (name) | Where (`layout.DOOR_SPOTS[n]`) | Activity | Reward |
|---|---|---|---|---|---|
| 1 | Lights for Holly Lane | Mrs Holly | residential | existing task `lights` | scarf `candycane` |
| 2 | The Lost Bauble | Pip | park | existing task `bauble` | hat `santa` |
| 3 | Ilse's Scarf | Ilse | lakeside | existing task `scarf` | coat `plum` |
| 4 | Star of Sledge Hill | Bram | hill | existing task `star`: fetch the star by cable car and bring it to the tree, where it's *kept safe until Christmas Eve* (no finale yet) | hat `reindeer` |
| 5 | Snowball Fight! | Tilly | park | mini-game `snowball` | scarf `gold` |
| 6 | Ornament Hunt | Mr Pine | market | mini-game `ornaments` | coat `navy` |
| 7 | Sledge Hill Race | Coach Sasha | hill | mini-game `sled` | hat `elf` |
| 8 | Cookie Bakery | Baker Bea | market | mini-game `cookies` | coat `gingerbread` |
| 9–23 | (titles below, `available:false`) | | | coming soon | |
| 24 | Christmas Eve | Mayor Tinsel | market (tree) | place the star → existing Santa finale | — |

Titles for 9–23: Figure Skating, Your Own House, Tram Conductor, Gift Wrapping, Snowman Contest, Ferris Wheel Gnomes, The Lost Reindeer, Sledge Hill Race II, Carol Singing, Postcard Day, Hot Cocoa Delivery, Snowball Fight II, Light-up Puzzle, Skating Show, Letters to Santa.

Door metadata shape: `{ n, title, giver, district, kind: 'task'|'minigame'|'finale', game?: 'snowball'…, task?: 'lights'…, reward?: {slot, key, label}, available: bool, blurb }`.

**Tasks → doors** (src/game): only the current door's giver shows the bobbing star marker and can start its activity. Givers of done doors stay in town, say a thank-you line, and offer **Play again** if their door is a mini-game. Doors 5–8 givers are new `buildCharacter` dolls at `DOOR_SPOTS` (nudged off colliders), with their own warm lines. Starting a mini-game: `const r = await ctx.minigames.play(game)`, then if `r.completed` call `progress.complete(n, r)`. Door 4 no longer triggers the finale: the "place the star" spot becomes door 24's activity. After door 4, keep the tree's socket empty and show the star glowing on a small knitted cushion/stand beside the tree until door 24 places it. The `?finale` test flag must keep working.

**Wardrobe additions** (player.js, additive): coat `plum`, `navy`, `gingerbread` (brown with white icing trim); hat `santa` (red, white trim + pom), `reindeer` (brown beanie with small felt antlers + ears), `elf` (green pointy hat with red band + bell); scarf `candycane` (red/white stripes), `gold`. Daily-gift bonus colours (Foundation decides which slots): e.g. scarf `berry`, `sky`, `mint`; coat `forest`. Locked options must be visible but marked locked in the UI.

### §Mini-games (framework is lead-owned: `src/minigames/framework.js`, read it)
Each game folder default-exports `{ id, title, district, icon?, intro, start(ctx, mg, opts) }`. In `start`: build props with `mg.add()`, register per-frame logic with `mg.addUpdate()`, cleanup with `mg.onDispose()`, input with `mg.onTap()` / `mg.onKey()` / `ctx.input.getMove(cam.yaw, …)` plus `mg.setPlayerControl(true)` if the player walks. Camera via `ctx.cam.playShot` (long, non-skippable for the game's duration) or `ctx.cam.setMode('close'|'high')`. Call `await mg.intro()` first. Update `mg.hud.setScore/setTimer/setGoal`. End with `mg.finish({score, stars, text})`: **stars 1 = completed** (should be achievable by most players on a first try), 2 = good, 3 = great. Each run lasts **45–90 s**. Everything must work on **phones in landscape** (tap / joystick / big on-screen buttons via your own DOM inside `ctx.uiRoot`, removed on dispose) and on desktop (keys / mouse). Cheap: ≤ 25 extra draw calls and ≤ 60k extra triangles while running, zero after dispose. Use the yarn material (`engine.mat`) and `src/core/prims.js` for all props, in the knitted/felted style. Sounds via `ctx.audio.sfx(name)` using existing names (see CONTRACTS.md §Audio). Test: `?play&mg=<id>&mgauto&reveal=all` starts your game right away.

Game briefs:
- **snowball** (Pinecone Park, `layout.ARENAS.snowball`): a friendly snowball fight with knitted kids popping up behind snow forts and snowmen. Tap or click where to throw (arcing snowball), hit kids for points, avoid hitting the friendly snowman, and dodge incoming snowballs by moving left/right behind cover (joystick/keys). 60 s. Stars by score.
- **ornaments** (Market Square, `layout.ARENAS.ornaments`): 5 knitted ornaments are hidden around the plaza (behind stalls, on lamp posts, under the tree, in gift piles…). The player walks freely (`mg.setPlayerControl(true)`). A warm/cold sparkle hint and a gentle chime grow stronger as they get near. Interact (E / tap the button) to collect. 90 s. Stars by time left. Ornaments placed from a seeded set of spots validated against colliders.
- **sled** (Sledge Hill, `layout.ARENAS.sled` + `layout.HILL.heightAt`): the player rides a wooden sled from the hilltop down a snowy course. Steer left/right (keys / joystick / tap left or right half). Collect gold stars and dodge gnomes, pines and snow lumps (slow down when hit). Timed run. Stars by time + stars collected. Camera behind and above the sled.
- **cookies** (Market bakery stall, `layout.ARENAS.cookies`): close-up camera on a knitted bakery counter. Rounds: cut cookie shapes as the dough slides past (tap at the right moment), bake (stop the oven when the glow is golden: timing bar), decorate (tap sprinkles onto marked spots). 3 short rounds, about 60 s total. Stars by accuracy.

### §Calendar & UI (`createCalendar(ctx)` → `ctx.calendar`, plus updates in `src/ui/**`)
- **3D Advent board** in the market at `layout.ADVENT_BOARD`: a knitted calendar on a stand, 24 little doors (numbered, open ones swing ajar and glow, done ones show their reward icon). It also shows the Town Spirit total (knitted counter/meter), from `ctx.net.townSpirit` (poll it, or listen to `town:spirit`). Interaction spot "Open the calendar" opens the calendar panel. Add a collider.
- **Daily gift box** prop beside the board when `progress.daily.available`. Interact to claim: pop and sparkle, then a reward card.
- **Calendar panel** (DOM, knitted): a 6×4 grid of doors with states (locked / open / done with stars / coming soon), each showing title, giver and where. Tapping an open door shows "Find {giver} in {district}" and points the hint arrow there. Shows the streak, Town Spirit, and how many players are in your town (`ctx.net.players().length + 1`). Opened with a new HUD button (calendar icon) and the board.
- **HUD changes:** replace the 4-star Festive Spirit meter with a compact door-progress chip ("Door 5 · Snowball Fight!") and a small Town Spirit chip. The task chip shows the current door's goal. The joystick also shows when `phase === 'minigame' && player.controllable`. The HUD hides during mini-games (the framework has its own HUD) and during the finale.
- **Wardrobe:** extend the entry-screen style tray: options from `STYLE_OPTIONS`, locked ones greyed with a lock and "Door N" label (`progress.wardrobe.unlocked`). Add an in-game wardrobe button that opens the same tray. Changing style calls `player.setStyle` and also notifies the net layer (`ctx.net?.setStyle?.(style)`).
- **Reward / door cards:** on `reward:grant` a small card ("New: Santa hat!"); on `door:open` a toast plus the hint arrow pointing to the giver. Wave 1 end: after door 8, the "Santa's sleigh has been spotted… new doors coming soon!" card (trigger a sky teaser via `ctx.teasers?.sky?.()` if it exists).
- Entry screen: use `cleanName` from `src/core/names.js`. Returning players see "Welcome back, {name}!" and Continue.

### §Net (`createNet(ctx)` → `ctx.net`), Multiplayer agent
Supabase (`@supabase/supabase-js` v2, already installed). Config in `src/core/net-config.js` (URL + publishable key). DB functions: `rpc('open_door', {p_player, p_door})` → new total; `rpc('town_spirit')` → `[{doors, helpers}]`.
- **Rooms:** Realtime channels `town:<n>`. Join the lowest-numbered room with < 25 players: check presence on join; if full, try the next. Presence payload `{id, name (cleanName), style, door}`. Broadcast `pos` events about 8 Hz while moving and about 1 Hz while idle: `{id, x, z, h, s}` (heading, speed). Use compact numbers.
- **Remote players:** render up to 12 nearest as knitted dolls in their style, using `buildCharacter` (merge each remote doll into ≤ 2 meshes, or instance), with interpolated movement, walk animation from speed, and a floating name tag (canvas sprite, cleanName). Fade in/out on join/leave. Hide players in a different district during the player's own mini-game? Keep it simple: always show. Budget ≤ 25 draw calls and ≤ 45k triangles for all remotes.
- **API:** `net.online` (bool), `net.players()` → `[{id, name, style, x, z}]`, `net.townSpirit` `{doors, helpers}` (refresh every 30 s plus after recordDoor), `net.recordDoor(n)` (rpc, fire and forget), `net.setStyle(style)`, `net.setName(name)`. Emit `net:status {online, room, count}`, `town:spirit {doors, helpers}`, `net:join {name}`, `net:leave {name}`.
- Must never break the game offline: catch everything, back off and retry, run fine with no network. Pause sending when the tab is hidden. No chat, no free text besides the filtered name.
- Test: two Playwright pages in one run (same lock) seeing each other. The shell cannot reach supabase.co (sandbox allowlist), so **test against a local mock**: write a tiny in-page fake transport behind the same interface (`src/net/transport.js` with `supabase` and `local` (BroadcastChannel) implementations; choose `local` when URL has `?net=local`). Two tabs in one Chrome context then sync via BroadcastChannel. The real Supabase path must still be written carefully against the supabase-js v2 Realtime API (channel().on('presence'…)/on('broadcast'…)/track()/send()).

## §World & time of day (`createWorld(ctx)` → `ctx.world`)
The town follows the **player's local clock** by default: morning (bright snowy day), afternoon (golden), evening (twilight, lights on), night (deep blue, moon and stars). URL `?tod=HOURS` overrides it for testing. Festive progress still adds decorations and lights, but no longer darkens the sky. API: `world.timeOfDay` (0–24), `world.setTimeOfDay(h)`, `world.phase` ('morning'|'day'|'evening'|'night'), event `world:phase {phase}`.

## New events
`door:open {n}`, `door:complete {n, stars, score}`, `reward:grant {id, slot, key, label}`, `daily:claim {reward, streak}`, `minigame:start {id}`, `minigame:end {id, score, stars, completed}`, `net:status`, `net:join`, `net:leave`, `town:spirit`, `calendar:open`, `calendar:close`, `wave:end` (after the last available door is done).

## Testing (shared, 2 CPUs, software WebGL ~1.3 s/frame)
- `npx vite build` must pass. Other agents' modules may still be stubs.
- `tools/shot.py` serialises Chrome with a lock, so keep runs few (≤ 6 each) and short. Useful flags: `play`, `reveal=all`, `at=x,z`, `view=`, `noshots`, `mg=<id>&mgauto`, `reset`, `net=local`. Prefer driving state through JS (`window.__tinselby.ctx`) and logic tests over screenshots.
- No console errors. Report draw calls / triangles for anything you add.
