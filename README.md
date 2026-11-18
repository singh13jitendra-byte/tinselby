# Tinselby — a knitted Christmas town

A 5-minute browser game in Three.js. Type your name, restyle your little knitted traveller, and step into **Tinselby**, a cosy knitted and felted town that pops up out of a giant book. Help four townsfolk get the town ready for Christmas. Then Santa's sleigh lands in the market square, he hands you a music box with your name on it, and the town counts down to Christmas midnight under fireworks.

Live: https://tinselby-sepia.vercel.app/

## Play

- **Desktop:** WASD or arrow keys to walk (or click where to go), **E / Space** to interact, **C** to switch the camera view, **M** to mute.
- **Phone:** play in landscape. Tap to walk or use the joystick, and tap the big button to interact.

The four tasks can be done in any order:

| Who | Where | Task |
|---|---|---|
| Mrs Holly | Holly Lane (residential) | Switch on the lights at three houses |
| Pip | Pinecone Park | Find the bauble lost in the snow |
| Ilse | Frostmere Lake | Fetch the scarf lost on the ice |
| Bram | Sledge Hill | Ride the cable car up for the tree star, then place it on the big tree (once the other three are done) |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/index.html (single self-contained file)
npm run preview
```

Requires Node 18+. Deploys: Vercel builds every push to `main` (Vite preset, `npm run build`, output `dist`).

### Test URL flags

`?play` skips the entry screen · `?at=x,z` teleports · `?view=follow|high|close` · `?doors=n` marks Advent doors 1..n done · `?reset` wipes the save · `?tod=HOURS` sets the time of day (`&todspeed=N` speeds it up) · `?net=off|local` disables or fakes the shared town · `?mg=<id>&mgauto` starts a mini-game (ornaments, cookies, snowball, sled) · `?reveal=all` reveals every district · `?finale` starts the finale 2 s in (`&fjump=SECONDS` jumps ahead) · `?teaser` shows a sky sleigh early · `?noshots` disables gameplay camera shots · `?capture` steps frames manually via `window.__tinselby.step(dt, n)`.

`await window.__tinselby.ctx.tasks.selfTest({ reset: true })` plays Advent doors 1–8 headlessly (it wipes the save in that browser). `python3 tools/playthrough.py` runs the full end-to-end check in headless Chrome.

## How it's built

Everything is procedural: no 3D model files, no textures, no audio files.

| Folder | What lives there |
|---|---|
| `src/core/` | Engine (renderer, twilight lighting, quality scaling), the shared yarn material (knit stitches, felt fuzz, glow, gloss in one shader), primitives, camera director, player and character builder, input, colliders, interactions, the city map (`layout.js`) and the event bus |
| `src/city/` | The five districts and their pop-up reveal: market square (tree, carousel, stalls), Holly Lane, Pinecone Park, Frostmere Lake (Ferris wheel, fenced ice), Sledge Hill (cable car) |
| `src/life/` | Instanced townsfolk, kids, skaters, sledders and gnomes, the festive tram and cars |
| `src/game/` | Quest givers, tasks, items and hints |
| `src/ui/` | Entry screen with style tray, HUD, joystick, toasts and speech bubbles, portrait overlay |
| `src/finale/` + `src/camera/` | Santa, sleigh, reindeer, music-box gift, finale timeline and overlays, sky teasers, cinematic camera shots |
| `src/audio/` | Web Audio music-box carol medley that grows with progress (Jingle Bells, Deck the Halls, We Wish You a Merry Christmas; Joy to the World at the finale; all public domain) and procedural sound effects |

`CONTRACTS.md` documents the module APIs and events. Read it before changing how the modules talk to each other.
