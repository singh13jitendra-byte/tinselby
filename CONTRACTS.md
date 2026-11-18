# Tinselby — module contracts

A 5-minute browser game in Three.js. The player types a name, optionally restyles a knitted character, enters **Tinselby**, a small knitted/felted city that pops up out of a giant book. They help the city get ready for Christmas with 4 light tasks; then Santa lands and the Christmas Eve countdown + fireworks finale plays. **Christmas only — no New Year wishes anywhere.** It must run on desktop and on phones (portrait and landscape).

**Look:** knitted and needle-felted miniature diorama, twilight, warm glowing windows, string lights, cotton snow, tilt-shift macro blur. Reference images: `/mnt/user-data/uploads/*.jpg` (view a few with the Read tool before modelling).

## Ownership (only edit your own files)

| Agent | Owns |
|---|---|
| Lead (integration) | `src/main.js`, `src/core/*`, `index.html`, `CONTRACTS.md`, `vite.config.js`, `package.json` |
| City | `src/city/**` |
| Life | `src/life/**` |
| Gameplay + UI | `src/game/**`, `src/ui/**` |
| Santa + Finale + Cinematics | `src/finale/**`, `src/camera/**` |
| Audio | `src/audio/**` |

Need something in core? Don't edit it. Work around it inside your module and put the request in your final report.

## Shared context `ctx` (passed to every factory)

`{ THREE, engine, game, colliders, interact, input, player, cam, layout, uiRoot, params, audio, city, life, tasks, ui, finale }`. It is filled in this order: audio → city → life → tasks → ui → finale. So `ctx.city` exists when Life / Tasks / UI / Finale are built, but `ctx.life` does not exist yet when City is built. Read other modules lazily, inside event handlers or update functions.

- **engine** (`src/core/engine.js`): `scene`, `camera`, `renderer`, `mat` (THE shared yarn material: use it for everything you model), `addUpdate(fn(dt, t), order)` (returns an unregister function), `setEvening(k)`, `isMobile`, `quality` ('high'|'medium'|'low'), `time`, `focus`.
- **Modelling** (`src/core/prims.js`, `src/core/yarn.js`): `cone, cyl, sph, dot, box, rbox, torus, extrude, tube, flatShape, recolor, xf, merge, poly, circlePts, starPts` and surface kinds `KNIT, FELT, GLOW, GLOSS`; colours `P` in yarn.js (you may add local colours). **Merge each prop into ONE geometry → ONE mesh** (`new THREE.Mesh(merge(parts), engine.mat)`). `GLOW` parts are emissive (windows, fairy lights, lanterns); they twinkle and bloom. Set `castShadow` / `receiveShadow` on props. For many copies use `THREE.InstancedMesh(geo, engine.mat, n)`; `setColorAt` tints.
- **game** (`src/core/events.js`): `state` {phase, playerName, style, spirit, spiritMax=4, tasks{lights,bauble,scarf,star: 'available'|'active'|'done'}, carrying, visited, starPlaced}, `on(evt, fn)` (returns an off function), `once`, `emit(evt, data)`, `completeTask(id)` (marks it done, bumps spirit, emits task:complete + spirit:change), `allTasksDone()`.
- **colliders**: `addCircle(x,z,r)`, `addSegment(ax,az,bx,bz,r)`, `addRect(x0,z0,x1,z1)`, `addHeightFn(fn(x,z)→y|null)`, `addBlockFn(fn(x,z)→bool)`, `heightAt(x,z)`, `resolve(pos, r)`, `groundMeshes` (push ground meshes so tap-to-walk raycasts hit them).
- **interact**: `add({id, x, z, r=0.9, label, icon?, enabled:()=>bool, onInteract})` → spot; `remove(spot)`. The UI shows a big button while the player is in range; E/Space/Enter or the button emits `'interact'`.
- **input**: `getMove(yaw,px,pz)`, `setJoystick(x,y)`, `setTap(x,z)`, `clearTap()`, `enabled`.
- **player**: `object` (Group), `pos` (Vector3), `vel` (Vector2), `heading`, `speed`, `controllable` (bool), `setStyle(style)`, `teleport(x,z,heading)`, `carry(obj|null)`, `carrying`, `walkTo(x,z)` → Promise, `faceTowards(x,z)`, `onStep` callback. `buildCharacter(mat, style, {skin, hair})` and `STYLE_OPTIONS`, `DEFAULT_STYLE` are exported from `src/core/player.js` for previews and NPCs.
- **cam** (`src/core/camera.js`): `setMode('follow'|'high'|'close'|'attract', {yaw?})`, `toggleView()`, `playShot({name, duration, update(t01, out:{pos,target}), blendIn, blendOut, skippable, tilt})` → Promise, `skip()`, `shotActive`, `mode`, `yaw`.
- **layout** (`src/core/layout.js`): the city map. Districts, roads, tram loop, car lanes, crossings, walk loops, and all landmark / task coordinates. **Use these numbers; don't invent new positions for shared things.**

## Events (name → payload, who emits)

| Event | Payload | Emitted by |
|---|---|---|
| `input:gesture` | — | core (first key/tap, start audio here) |
| `game:start` | {name, style} | UI entry screen |
| `district:enter` | {id, first, prev} | core |
| `district:revealed` | {id} | City (after its pop-up animation) |
| `task:accepted` | {id} | Tasks |
| `task:progress` | {id, step, of, text?} | Tasks |
| `task:complete` | {id} | `game.completeTask` |
| `spirit:change` | {value, max} | `game.completeTask` |
| `item:pickup` / `item:drop` | {id} | Tasks |
| `tree:starPlaced` | — | Tasks (starts the finale) |
| `cablecar:ride` | {dir:'up'|'down', duration, cabin:Object3D} | City |
| `cablecar:arrive` | {dir} | City |
| `finale:start`, `santa:arrive`, `santa:landed`, `santa:gift`, `countdown` {n}, `christmas` (midnight, fireworks), `game:end` | | Finale |
| `interact`, `interact:available` {id,label,icon}, `interact:none`, `interact:done` {id} | | core / UI |
| `camera:toggle`, `camera:mode`, `camera:shot`, `camera:shotEnd` | | core |
| `audio:toggle` | — | UI / M key |
| `ui:toast` | {text, ms?} | anyone → UI shows a toast |
| `dialog` | {who, text, ms?} | Tasks → UI shows a speech bubble |

## Game flow

1. **Entry** (`phase='entry'`): camera `attract` orbit over the fully revealed city (`city.revealDistrict(id, true)` for all). UI: knitted "Welcome to Tinselby" title, name input, **Enter Tinselby** button, optional **Change style** tray with live 3D preview. Emits `game:start`.
2. On `game:start`: core teleports the player to the gate (`layout.SPAWN`) and switches to the follow camera. City folds everything flat (`foldAll()`); each district then pops up on its first `district:enter` (the park immediately, since the gate is in it).
3. **Play**: 4 tasks in any order (see §Tasks). Each completion → spirit +1 → `engine.setEvening` darker and more festive; `city.setFestive(n)`, `life.setFestive(n)`, audio adds a music layer.
4. The tree star can be fetched anytime. **Placing it on the big tree is enabled only after the other 3 tasks are done.** Placing it calls `completeTask('star')`, then emits `tree:starPlaced`.
5. **Finale**: Santa's sleigh arrives, lands at `layout.MARKET.landing`, gives the player a gift tagged with their name. Crowd gathers, Christmas Eve countdown 10→1, `christmas` ("Merry Christmas!" banner), fireworks, end card "Merry Christmas, {name}! — love, Tinselby" with a Play again button. About 60–75 s total.

## §City (`buildCity(ctx)` → city)

Static world built district by district, positions from `layout`. The ground: oatmeal felt book page outside the city; snowy felt ground (cotton snow) inside; knitted cobbles / road surfaces; tram tracks on the ring. Districts:
- **market**: big tree (height 3.2, spiral fairy lights, baubles, empty star socket), stalls with striped awnings and string lights, carousel (rotating), countdown clock, bead garlands.
- **residential**: two rows of tall narrow knitted townhouses (red / teal / cream / mustard, snow roofs, glowing windows, chimneys with smoke).
- **park**: pom-pom trees, benches, snowy paths, snowman spot, the "Welcome to Tinselby" gate arch at the south edge with knitted letters.
- **lakeside**: frozen lake (walkable ice), pier, benches, lamps, reeds, pebble banks.
- **hill**: snow slope using `layout.HILL.heightAt`, pines, cable car (base and top stations, cable, 2 cabins).

API:
- `revealDistrict(id, instant=false)`: pop-up animation (tiles flip up from the page, props puff up with squash & stretch, staggered, about 1.2 s) → emit `district:revealed`. Idempotent. Auto-reveal on the first `district:enter`.
- `foldAll(instant=false)`: fold every district back into the page (used at game start).
- `setFestive(level 0..4)`: progressively more lights and garlands (e.g. street garlands light up, stall lights on).
- `residential.houses`: [{x, z, door:[x,z], taskHouse:bool, setLights(on)}]. Task houses match `layout.RESIDENTIAL.taskHouses` (same order); `setLights(true)` turns on their string lights + door wreath glow.
- `tree`: {pos:Vector3, starSocket:Vector3 (world), placeStar() (shows the star with a pop and glow), setLights(k 0..1)}.
- `cableCar`: {base:Vector3, top:Vector3 (y = hill top), ride(dir:'up'|'down') → Promise}. It moves the player inside a cabin (player.controllable false during the ride, re-enabled after), emits `cablecar:ride` / `cablecar:arrive`.
- `lake`: {isIce(x,z)} (Life uses this for skaters, Tasks / player for slide feel).
- `landing`: Vector3 (keep a clear 3 × 2 area there).
- Register colliders for buildings, stalls, tree, benches, lamp posts; add height fns (hill, ice, pavements); push ground meshes into `colliders.groundMeshes`.
- Budget: ≤ 220 draw calls with all districts revealed, ≤ 350k triangles.

## §Life (`buildLife(ctx)` → life)

Ambient city life, all cheap (instancing, or a few merged meshes animated by transforms):
- pedestrians on `layout.WALK_LOOPS` (knitted dolls, varied coats / hats, some carrying gifts, pairs holding hands), visible only once their district is revealed (`district:revealed`);
- kids in the park (snowball throwing, building a snowman, running in circles);
- skaters gliding loops on the lake ice;
- sledders and gnomes on sleds going down `layout.HILL.sledLanes`, walking back up;
- a knitted tram (red / cream, glowing windows, pantograph) running `layout.TRAM_LOOP`, pausing at `TRAM_STOP`, ding (`ctx.audio.sfx('tram')`);
- 3–5 knitted cars with glowing headlights on `layout.CAR_LANES`; cars and tram slow / stop when the player or a pedestrian is ahead (≤ 1.2 units) or at an occupied crossing;
- market browsers standing at stalls, a stall keeper behind each.
- API: `gatherAt(x, z, radius)` (move nearby NPCs to form a crowd facing the point, for the finale), `release()`, `cheer()` (hop + arms up), `setFestive(level)`.
- Budget: ≤ 40 draw calls total, ≤ 120k triangles; update cost ≤ 1.5 ms/frame on desktop.

## §Tasks (`createTasks(ctx)`) + §UI (`createUI(ctx)`)

Tasks (quest givers built with `buildCharacter`, with a glowing star marker bobbing above them while their task is available; positions in layout):
- `lights` (residential): neighbour asks for help. Visit the 3 task-house doors (interact spot at each) → `city.residential.houses[i].setLights(true)` one by one → complete.
- `bauble` (park): kid lost a bauble. It's at `PARK.bauble` in a snow pile (sparkle hint). Pick it up (carry it), bring it back → complete.
- `scarf` (lakeside): skater lost a scarf on the ice at `LAKE.scarf`. Fetch it, return it → complete.
- `star` (hill): the operator says the tree star is at the top. Ride the cable car up (`city.cableCar.ride('up')`), pick up the star (`HILL.starSpot`), ride down (or walk down the slope), carry it to the big tree; "Place the star" spot at the tree base is enabled only when the other 3 are done (otherwise a toast tells you what's left) → `city.tree.placeStar()`, `completeTask('star')`, emit `tree:starPlaced`.
- Short, warm dialog lines (`dialog` event) using the player's name. A hint arrow / compass toward the nearest unfinished task.

UI (DOM in `ctx.uiRoot`, using classes from `src/core/theme.css`; mobile-first, landscape):
- Entry screen: title "Welcome to Tinselby", subtitle "A cosy knitted Christmas town", name input, Enter button, Change style tray (coat / hat / scarf from `STYLE_OPTIONS`, randomise, live rotating preview: render `buildCharacter` into a small separate WebGL canvas or a corner of the main view), saved to localStorage (try/catch).
- HUD: Festive Spirit meter (4 knitted hearts or stars) top-centre, current task chip, interact button (large, bottom-right), on-screen joystick (bottom-left, touch devices only), camera toggle and mute buttons (top-right), toasts and speech bubbles.
- Tap during a skippable cinematic → `cam.skip()`.

## §Finale (`createFinale(ctx)`) + §Camera shots (`src/camera/shots.js`)

- Knitted Santa (red knit suit, white felt beard and trim, black boots), sleigh (red / gold trim, piled gifts), 4–6 reindeer (felt, red yarn antlers, Rudolph's glowing nose, flying leg cycle), sparkle trail.
- Teasers during play: every 45–70 s a tiny sleigh crosses the sky far away (bells via `audio.sfx('sleighBells')`).
- On `tree:starPlaced`: phase 'finale', player not controllable; camera shot up the tree; sleigh swoops in a wide arc and lands at `layout.MARKET.landing`; Santa steps out, waves (`audio.sfx('hohoho')`), hands a gift with a knitted tag "For {name}" (close camera); `life.gatherAt(tree)`; Christmas Eve countdown overlay 10→1 (big knitted numbers) with `countdown` events; at 0 → `christmas` ("Merry Christmas!" banner), fireworks (`src/core/fx.js` Fireworks, bursts above the market), sleigh lifts off through the fireworks, camera pulls up and back; end card with Play again (reload).
- Camera shot library: district reveal (first `district:enter` → short sweep to a high angle and back), cable car ride (follow the cabin, on `cablecar:ride`), tree star moment, Santa landing, gift close-up, finale pull-back. Play them through `cam.playShot`.

## §Audio (`createAudio(ctx)` → audio)

Procedural Web Audio only (no files). `start()` (on the first gesture), `sfx(name, {x, z, vol})` (positional falloff from the player), `setMusicLevel(n)`, `toggleMute()` → bool, `muted`.
- Music: a music-box arrangement of public-domain carols (Jingle Bells, Deck the Halls, We Wish You a Merry Christmas), looping. Layers join with spirit: 0 music box, 1 + sleigh bells, 2 + warm bass, 3 + choir pad, 4 + glockenspiel. Finale: full arrangement, then a public-domain Christmas tune swell (Joy to the World or O Christmas Tree) at `christmas`.
- SFX names (all must exist, even if simple): `step`, `pop`, `fold`, `bell`, `pickup`, `drop`, `task`, `ui`, `tram`, `car`, `chatter`, `ice`, `cable`, `sleighBells`, `hohoho`, `whoosh`, `countdown`, `firework`, `cheer`, `gift`.
- Listens itself to `spirit:change`, `task:complete` (chime), `district:revealed` (pops), `christmas`, `audio:toggle`.

## Testing

- `npx vite build` must succeed (other agents' modules may still be stubs; that's fine).
- Screenshots: `python3 tools/shot.py <prefix> '[["step",60,"a"]]' 'play&reveal=all&at=-14,0&view=follow'` writes `shots/<prefix>_a.png`, then look at it with Read. **Chrome runs one at a time (lock) on a 2-CPU box: keep it to a handful of runs, ≤ 150 steps each.** URL flags: `play`, `reveal=all`, `at=x,z`, `view=high|close|follow`, `spirit=n`.
- No console errors. Check `stats()` draw calls and triangles against your budget.

## Wave 2 additions (see WAVE2.md)
- Build order: audio → city → world → life → progress → minigames → **house** → tasks → ui → calendar → net → finale.
- `ctx.house` (src/house): `{ OPTIONS, DEFAULT, owned, style, isOpen, decorate() → Promise<style>, setStyle(style) }`.
- `audio.beat()` → `{ bpm, meter, start, spb, now, latency } | null` (AudioContext seconds; `now` = currentTime − output latency, i.e. what the player hears; phase = ((now − start) / spb) mod 1).
- `finale/reindeer.js` exports `REINDEER_RIG` and `reindeerGeos()` for a standalone reindeer (door 15).
- `life.holdVehicle(kind) → release()` hides one ambient vehicle (e.g. the tram during Tram Conductor). Added by the lead after the perf pass merges; until then guard with `ctx.life.holdVehicle?.(...)`.
- Wave-2 doors are behind `?w2` until release (`W2` flag in src/progress/doors.js). Test with `?w2`.

## Portrait (18 Nov)
- `ctx.cam.portrait` 0..1 (smoothed), `ctx.cam.isPortrait`, `ctx.cam.aspect`; `playShot({ portrait: { keep, lift } | false })`, `cam.setShotPortrait(name, opts)`; `<body>` gets `tb-portrait`/`tb-landscape`; event `view:orientation {portrait}`.
- Mini-games: `src/minigames/view.js` (`aspectK`, `zoomOut`, `isPortrait`); games that handle aspect themselves pass `portrait: false` to their shots.

## Eye view (18 Nov)
- Camera views cycle follow → eye → high (camera button / C key), saved in localStorage `tinselby.cam`; `?view=follow|eye|high`.
- `cam.view`, `cam.nextView`, `cam.eye` (0..1 blend), `cam.setView(v, persist)`; `createCameraDirector(engine, game, input)`.
- Eye view suspends itself during any playShot, when phase ≠ play, or when the player isn't controllable; `setMode('follow')` from game code means "back to the player's view".
- `input.eyeView`, `input.consumeLook()`, `input.getTurn()`, `input.looking`; `player.setDollVisible(v)` / `player.dollVisible`.
- Holly Lane cut-away folds the houses next to the player to 7% (rest of the south row 26%); fades out in eye view.

## Wave 3 additions (see WAVE3.md)
- Doors 17–23 are behind `?w3` until release (`W3` exported from src/progress/doors.js; at release it becomes `!/[?&]w[12](&|=|$)/…`). Test with `?w3`. Door 24 keeps `available: false`; `doors.js` also exports `WISH_REWARDS` (`coat:santa`, `hat:starlight`, `scarf:aurora`, included in `REWARDS`).
- Test flags: `?w3`, `?date=YYYY-MM-DD` (noon that day), `?eve` (24 Dec of the season, 18:00), `?xmas` (26 Dec). They drive the progress clock (`progress._clock`), so `daily` follows them too.
- Layout (src/core/layout.js): `DOOR_SPOTS` 17–23, `ARENAS.carols` / `cocoa` / `pack`, `POST`, `LANTERNS`, `LETTERS`, `PRESENTS` (Present Delivery on `TRAM_LOOP`), `EVE` (gathering slots, Clover's paths, team slot, net ring).
- Progress: `progress.eve` → `{ season, day, isEve, isAfter, sleeps }`; `progress.wish = { options, get(), set(id) }`; `progress.finaleGift()` → `{ id, slot, key, label } | null`; `progress.flags = { has(k), set(k) }`; `progress.markEveWatched()`; `wardrobe.source()` → `{ santa: true, label }` for wish pieces. With `W3`: door 24 opens on 24 Dec once door 4 is done, and from 25 Dec doors 1–23 are all open.
- Audio: `audio.playSong(name, { fromBeat, toBeat, at, onEnd })` → `{ start, spb, bpm, meter, end } | null` plays part of 'Jingle Bells' / 'Deck the Halls' / 'We Wish You a Merry Christmas' (or `jingle` / `deck` / `wish`), then the medley resumes; beat b sounds at `start + b·spb` (AudioContext s; subtract the output latency for what is heard). `null` = no running audio (not started, muted, hidden tab): run your own clock. `audio.note(midi, { dur, vol, kind: 'choir' | 'bell' })` = one note now (the choir "ooh" is heard at every festive level). Both use the shared voice budget (voices.js). After Joy to the World the music settles back to the festive level (`game.state.spirit`).
- Tasks: `tasks.gather({ on, face })`, `tasks.setGiverHidden(n, hidden) → restore()`, `tasks.reindeer.{ trotTo(path, speed) → Promise, away(on), snapHome() }`, `tasks.lanterns` (→ `activities.lanterns.runway = { positions, lit, allLit, chase(dur) }`), `tasks.activities.{ post, lanterns, letters }`. Activities may add `onDoll(doll) → bool` and `dollLabel(doll) → { label, icon } | null`; `actEnv` gains `sayOrToast`, `giverPos`, `dolls`, `fill`, `GIVERS`.
- Finale: `finale.{ replay(), preview(), exit() }` (plus `running`, `time`, `jumpTo`, `rig`, `trail`); `team.setSlotVisible(i, on)`. New files `finale/eve.js` (restartable timeline), `poses.js`, `preview.js`. Net / UI: `net.gather({ x, z, r, a0, a1 }) → release()` (local only), `ui.wear(slot, key)`.
- Events: `wish:set {id}`, `progress:change {eve: true}`, `door:open {n: 24}` (date flip), `task:progress {id, step, of}`, `task:complete {id}` (post / lanterns / letters), `finale:start {replay, preview}`, `finale:exit {}`, `town:moment {doors, helpers}`, `santa:gift {name, reward}`.
- Mini-games `carols`, `cocoa`, `presents`, `pack` (registered in src/minigames/index.js) with test hooks `window.__carols` / `__cocoa` / `__presents` / `__pack`; tasks `window.__w3`; finale `window.__eve`.
- Scaffolding stubs (each now belongs to its builder): src/minigames/{carols,cocoa,presents,pack}/index.js, src/game/w3/{post,lanterns,letters,props}.js, src/finale/{eve,poses,preview}.js.
- Wave 3 host extras: `tasks.dolls`, `tasks.resync()`, `tasks.setGiverHidden(n, hidden) → restore()`, `tasks.gather({ on, face })`, `tasks.lanterns` (runway), `tasks.reindeer.{trotTo, away, snapHome, hop}`; `progress.eve`, `progress._checkEve(quiet)`, `progress.wish`, `progress.finaleGift()`, `progress.flags`, `progress.markEveWatched()`.
