# PLAY.md — Play together (wave 4)

User decisions (LOG.md 18 Nov): audience = friends, family AND strangers; chat = **ready-made phrases only** (no free
typing, for everyone). Features: invite links into the same town, emotes, snowballs, riding together, gifting a
wardrobe piece. Everything is cosmetic/social — no scores or progress depend on other players.

Ships behind `?w4` until release (flag `W4` exported from `src/net/play-flag.js`, owned by Net; at release
`W4 = !/[?&]w[123](&|=|$)/`). With the flag off, nothing new is visible and the net protocol is unchanged.

## Ownership (only edit your own files)
| Agent | Owns |
|---|---|
| **Net** (Opus) | `src/net/**` (incl. new `play-flag.js`, `bubbles.js`), `supabase/**` if needed |
| **Social UI** (Sonnet) | new `src/social/index.js`, `invite.js`, `wheel.js`, `phrases.js`, `people.js`, `social.css`; the *emote* section of `src/core/player.js` (add `player.emote(name)` only); one import + `ctx.social = createSocial(ctx)` line in `src/main.js` |
| **Snow & gifts** (Sonnet) | new `src/social/snowball.js`, `src/social/gift.js`, `src/social/snow.css` |
| **Ride together** (Opus) | `src/rides/**` |
Anything else: ask the lead. Never commit; the lead commits after a build + screenshot look.

## Net API (Net agent implements; everyone else codes against it, guarding with `?.`)
All calls never throw; offline / `?net=off` returns no-ops.
- **Friend towns.** `?town=CODE` joins private channel `friends:CODE` instead of public `town:N` rooms (cap 16).
  CODE = 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Remembered in localStorage `tinselby.town` for 12 h so a
  reload stays in the town; `?town=` with no value or `net.leaveTown()` returns to public rooms.
  - `net.town` → `{code, url, count}` | null · `net.newTownCode()` → string · `net.joinTown(code)` · `net.leaveTown()`
  - `net.inviteUrl(code)` → `https://tinselby-sepia.vercel.app/?town=CODE` (origin of the current page)
  - event `net:town {code|null, count}`; Town Spirit stays global.
- **Messages.** `net.send(type, data)` broadcasts to the current room. Allowed types + payloads (validated on receive,
  anything else dropped; per-sender limit 4 msgs/s per type, excess dropped):
  - `emote` `{e}` — e ∈ `wave, cheer, dance, clap, heart, laugh, bow, snowangel`
  - `say` `{p}` — phrase id `/^[a-z0-9-]{1,24}$/`; receivers map id → text with `src/social/phrases.js` (never send text)
  - `snow` `{t, x, z, tx, tz}` — throw id t, from (x,z) to target point (tx,tz); `hit` `{t, id}` — throw t hit player id
  - `gift` `{g, to, r}` — gift offer id g to player id `to`, reward id r · `gift-ok` `{g, to}` · `gift-no` `{g, to}`
  - Received → `game.emit('net:msg', {type, from, name, data})` (from = sender id, name = their clean name).
- **Presence extras.** `net.setPresence({ride})` where ride = `{k: rideId, s: seatIndex}` | null. Remote entries in
  `net.players()` gain `ride`. Event `net:presence {id, ride}` when it changes.
- **Muting (safety).** `net.mute(id, on)`, `net.isMuted(id)`; persisted in `tinselby.net.v1`. Muted players' messages are
  dropped before `net:msg`, their bubbles hidden, their doll still drawn.
- **Remote dolls.** `net.doll(id)` → `{x, z, h, visible, emote(e), bubble(text, ms), stagger(dirX, dirZ), seat(pose|null)}`
  or null. `seat({x,y,z,h})` pins the doll seated at a world pose each frame until `seat(null)` (Ride together
  drives this). `net.dollAt(screenX, screenY)` → id | null (tap picking). `net.selfBubble(text, ms)` shows a bubble
  over the local player (same style as remotes).
- **Bubbles** (`src/net/bubbles.js`): DOM pills above heads like name tags, max 1 per player, fade after ms
  (default 3500), hidden during mini-games/finale like tags.

## Social UI
- HUD: a "Friends" button (people icon) in the top-right row (`.tb-tr`, like the photo button) + an emote button
  bottom-right (above the joystick on phones). Hidden in mini-games, finale, rides (rides show their own buttons).
- **Invite card**: "Play with friends" → creates a code, shows the link + big code, Copy link and Share
  (`navigator.share` when available), "Join with a code" (6-char input, the only typing anywhere, letters only),
  "Back to the big town". In a friend town the Friends pill shows `CODE · n here`.
- **Wheel**: 8 emotes + ready-made phrases in tabs (Hello / Fun / Christmas / Help) — ~20 short, warm, all-ages
  phrases (e.g. "Merry Christmas!", "Follow me!", "Race you to the sledge hill!", "Nice hat!", "Thank you!",
  "Want to ride the Ferris wheel?"). Picking one: local player emotes / shows bubble via `net.selfBubble`, and
  `net.send`. 1.2 s cooldown.
- **People card**: tap a remote doll (or its name tag) → card with their name + Wave, Throw snowball, Give a gift,
  Ride together (if they're on a ride), Mute/Unmute. Keyboard: E on nearest player within 2.5 m opens it too.
- Receiving `say`/`emote`: bubble + doll emote; a small toast for `wave` aimed nearby is fine, nothing modal.
- `player.emote(name)` plays a 1.5–2.5 s knitted-doll animation (arms/body), interrupts on move.

## Snow & gifts
- **Snowballs**: from the people card or a snowball button while near players (≤ 12 m). Arc projectile (≤ 1 draw call
  pooled), splat puff on hit, target doll `stagger`. Thrower decides hit/miss (simple distance test at landing) and sends
  `hit`; receiver's own player gets a little snow puff + toast "Pip got you with a snowball!" (no damage, no score).
  Cooldown 1 s. Not in mini-games/finale/rides.
- **Gifts**: pick one of *your owned* wardrobe pieces (`progress.rewards.owned()`, gated slots only, not Santa's wish
  gifts) → offer to that player. They get a card "Bram wants to give you a Red scarf · Accept / No thanks". Accept →
  `progress.rewards.grant(id)` (if not already owned) + toast "Gift from Bram!", reply `gift-ok`; the giver keeps
  theirs. Limits: 3 gifts received per day (localStorage), offers expire after 30 s, one pending offer at a time.

## Ride together
- On ride start/end call `net.setPresence({ride: {k, s}})` / `{ride: null}`. For remote players with `ride`, pin their
  doll seated in the matching seat of *your* copy of the ride (ferris cabin s, carousel horse s, tram/carriage seat s,
  skate/sled: follow their streamed position but use the skate/sled pose). Fixes the known "remote riders appear
  standing" TODO.
- "Ride together": from the people card when they're on a ride, or a "Join Pip" button when you walk up to a ride a
  friend is on → you board the same ride, nearest free seat beside them. Tram: ride timing is per-client, so just board
  the local tram with them seated next to you.

## Done means
Two tabs with `?w4&net=local` (and the real Supabase in one quick check): invite → join → see each other, emotes,
phrases, snowball hit, gift accepted, riding the Ferris wheel together; portrait 390×844, landscape 844×390, desktop;
0 console errors; budget +≤ 6 draw calls in the busiest view; `ctx.tasks.selfTest` unchanged (359/0).
