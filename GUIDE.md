# GUIDE.md — phone UX: calendar scroll, tidy HUD, guidance, tips, mini-map (20 Nov)

User (testing on an Android phone): the Advent calendar doesn't scroll (door details + its button cut off); the door
pill and the goal pill overlap top-left; it's hard to know what to do (hints missing); wants a small map showing where
you are. Ships live (no flag) after the lead's review + e2e. Phone first: 360x780, 390x844, 412x915 portrait;
844x390, 667x375 landscape; desktop 1280x720 must still look right.

## Ownership (only edit your own files; never commit — the lead commits)
| Agent | Owns |
|---|---|
| **Calendar** (Sonnet) | `src/calendar/**` |
| **HUD** (Sonnet) | `src/ui/hud.js`, `src/ui/ui.css` (HUD rules), `src/social/social.css` (only to fix overlaps) |
| **Guide** (Opus) | new `src/guide/**` |
| **Tips** (Sonnet) | new `src/tips/**` |
| **Map** (Opus) | new `src/map/**` |
New modules: add ONE import + ONE `ctx.x = createX(ctx)` line at the end of the module setup in `src/main.js`; don't
touch other lines. Everything hides outside free play (mini-games, finale, rides, photo mode, cinematics, panels) —
copy how `src/social/index.js` / `src/ui/hud.js` decide that.

## Shared API
- **`ctx.guide`** (Guide): `target` → `{x, z, label, place, kind: 'person'|'spot'|'area', dist, id}` | null — what the
  player should head to now (current door's giver / task objective spot / calendar "Go there" hint).
  Event `guide:target` on change. `ctx.guide.showTrail(sec)` lights the footprint trail. `ctx.guide.placeAt(x, z)` →
  district name (for labels). Renders: an edge arrow at the screen border when the target is off-screen; a bouncing
  "!" bubble over the target person (DOM, like name tags); a glowing footprint trail to the target (≤ 1 draw call,
  pooled) automatically for doors 1–5, and for 20 s after `showTrail`.
- **HUD goal card** (HUD): ONE card top-left replacing the separate door pill + hint pill: line 1 "Door 6 · Ornament
  Hunt", line 2 what to do now (task objective / goal text) + "· 40 m" from `ctx.guide?.target?.dist`; a small "?"
  button → `ctx.tips?.help?.()`. No overlaps with the chips (Town Spirit, online), the top-right button row, social
  pills, at any size above. Reserve the mini-map slot (below).
- **`ctx.tips`** (Tips): first-time coach marks, one at a time, pointing at the real element: drag to walk (joystick),
  tap people to talk, your goal card, the calendar button, wardrobe/photo/friends (later, when relevant). Remembered in
  localStorage `tinselby.tips.v1`; "Got it" + skip all. `ctx.tips.help()` → a small card explaining the current step in
  one friendly line + "Show me the way" (→ `ctx.guide.showTrail(20)`).
- **Mini-map slot** (Map): a 104 px circle, top-right, directly under the top-right button row (8 px gap), both
  orientations; tap → full town map overlay (district names, rides, you, goal star, friends) with "Show the way" for a
  tapped place (→ the HUD hint / `ctx.guide`). Canvas 2D, 0 extra WebGL draw calls. Shows: roads/districts drawn once
  from the city layout data, you as an arrow (facing), goal star (`ctx.guide.target`), ride icons, friends as coloured
  dots when in a friends town (`ctx.net.town` + `ctx.net.players()`).

## Done means
Real touch tests (Playwright mobile context: has_touch, is_mobile) at the sizes above; screenshots looked at; 0 console
errors; `ctx.tasks.selfTest({reset:true})` still 359/0; `python3 tools/playthrough.py phone` still green.
