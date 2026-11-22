# Phase 3 · Together — Secret Santa + friends-town scoreboards

Shared contract for the three Phase 3 agents (backend, Secret Santa client, scoreboards client). Change it only by telling the lead.

## Ground rules
- Friends towns only (a valid town code from `ctx.net`, channel `friends:CODE`, max 16 players). The big public town gets neither feature.
- Kids play: no free text anywhere. Names are the existing player names (already cleaned by `cleanName`, max 18 chars). No names in analytics.
- Server = the existing Supabase project `zuibyfukfyouqxljgqgz`. Same pattern as `supabase/migrations/20261118000000_town_spirit.sql`: tables with RLS on and **no** policies (no direct table access), all access through `security definer` RPCs granted to `anon`. Called from the client via the net transport: `transport.rpc(fn, args)` (see `src/net/transport.js`), which exists in `?net=supabase`/production; `?net=local` and `?net=off` have no server.
- Identity: `p_player uuid` = `progress.playerId` (already used by `open_door`) **plus** `p_secret uuid` = a per-device secret kept in localStorage `tinselby.secret.v1` (create with `crypto.randomUUID()` on first use). The server stores only `sha256(secret)` and requires it to match on every call for that player, so another player who learns your player id cannot act as you. Shared helper: `src/net/identity.js` exporting `getIdentity(ctx) → { player, secret }` (the Secret Santa agent creates it; the scoreboards agent imports it — if it doesn't exist yet when you need it, create it with exactly this signature).
- All times are server time (`now()`); the server returns ISO timestamps; clients display them in local time.

## Secret Santa RPCs (all return `json`)
Season constants (server side): `close_at = 2026-12-20T18:30:00Z` (21 Dec 00:00 IST, sign-ups close and names are drawn), `reveal_at = 2026-12-24T18:30:00Z` (25 Dec 00:00 IST).
- `santa_status(p_town text, p_player uuid, p_secret uuid)` →
  `{ state: 'none'|'open'|'drawn'|'revealed', close_at, reveal_at, starter: name|null, count, members: [name…], joined: bool, is_starter: bool, my_match: name|null (only after draw, only yours), my_gift: item|null (what you chose to give), gifts: [{from, to, item}] (only once revealed, everyone in the town), late: bool (joined too late / not drawn) }`
  If `now() >= close_at` and the group is still `open` with ≥ 3 members, this call performs the draw first (lazy draw). With < 3 members at close, state becomes `'none'` again with `cancelled: true`.
- `santa_start(p_town, p_player, p_secret, p_name text)` → status. Creates the town's group for the 2026 season (one per town) and joins the starter. Error `already_started` if one exists.
- `santa_join(p_town, p_player, p_secret, p_name)` → status. Only while `open`; max 16; errors `not_open`, `full`.
- `santa_leave(p_town, p_player, p_secret)` → status. Only while `open` (the starter leaving hands the group to the earliest other member, or deletes it if empty).
- `santa_draw(p_town, p_player, p_secret)` → status. Starter only, ≥ 3 members, while `open`: draws early. Errors `not_starter`, `too_few`.
- `santa_give(p_town, p_player, p_secret, p_item text)` → status. After draw, before reveal; `p_item` is a wardrobe style id like `scarf.lilac` (validate format `^[a-z]+\.[a-z0-9]+$`, ≤ 32 chars); can be changed until reveal.
- Draw = one random single cycle over the members (nobody draws themselves; with 3+ members every giver has exactly one receiver and vice versa).
- Test towns: codes starting with `QQ` accept an extra optional `p_now timestamptz` argument on `santa_status` (and the server uses it instead of `now()` for that call) so tests can jump to after close/reveal. For any other code `p_now` is ignored.

## Scoreboard RPCs
- `score_submit(p_town text, p_player uuid, p_secret uuid, p_name text, p_game text, p_score int)` → `json { best, prev_best, town_best: bool, prev_top: name|null, rank }`. Keeps each player's best per game per town (higher is better; games where lower is better send a converted score — the client decides). Validate `p_game` `^[a-z0-9_]{2,24}$`, `0 ≤ p_score ≤ 1000000`, name ≤ 18. Rate limit: ignore more than 30 submits per player per hour.
- `town_scores(p_town text, p_player uuid)` → `json [{ game, name, best, me: bool, at }]` (top 10 per game, best first).

## Client side
- Secret Santa: `src/santa/**` (`ctx.santa`). Scoreboards: `src/scores/**` (`ctx.scores`). One import + one `ctx.x = createX(ctx)` line each in `src/main.js` (re-read main.js right before editing — two agents add a line).
- Both need a mock backend for tests: `?santa=mock` / `?scores=mock` (or automatically under `?net=local`) — an in-memory implementation of the same RPCs in `src/santa/mock.js` / `src/scores/mock.js`, shared between tabs through `BroadcastChannel` so `tools/play2.py`-style two/three-page tests work.
- Analytics events (add to `src/analytics/index.js` + `ANALYTICS.md`, re-read before editing): `santa_started`, `santa_joined`, `santa_left`, `santa_drawn {members}`, `santa_gift_chosen`, `santa_revealed`, `town_best {game}`, `scores_viewed {where}`.
