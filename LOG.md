# Tinselby — build and decision log

Decisions made while working autonomously (the user asked me to keep going without waiting for approval). Newest at the bottom.

## Wave 1 (Advent calendar, shared town, doors 1–8)
- 2026-11-18 03:12 IST: started wave 1 with 7 agents (Foundation, Calendar & UI, Shared town, Snowball, Sled, Ornaments, Cookies), plus World & time of day after the new references.
- Doors unlock by progress (user's choice). 24 doors (user's choice). Release in waves (my recommendation, user said "you suggest"): wave 1 doors 1–8, wave 2 9–16, wave 3 17–24.
- Shared town on Supabase Realtime (user approved). Project `tinselby`, Mumbai region (user picked). Rooms of 25, presence + 8 Hz position broadcast, no chat, filtered names.
- Time of day follows the player's local clock by default (my call), `?tod=` overrides. Festive progress adds lights instead of darkening the sky.
- Character choice (hair, hair colour, skin, outfit) is identity and always unlocked; hats, scarves and coats are door rewards (my call).
- Ornament hunt done (Sonnet). To fix at merge: tray icons are emoji; replace with knitted SVG icons.
- 04:35 IST: all 7 agents hit the 5-hour usage limit around 03:40; resumed after the 4am reset.
- Cookie bakery done (Sonnet). Merge fixes: no emoji on intro cards (framework renders SVG icons only), player doll hidden during the counter close-up (new mg.setPlayerVisible). For the polish pass: cookie close-up bloom/blur is too strong (the oven meter is hard to read); lower glow and tilt there.
- 05:35 IST: Shared town done (Opus) and committed. Tested with two local tabs; the real Supabase connection can't be exercised from the sandboxes (both block supabase.co).
  - **For you:** (1) Supabase dashboard → Realtime → Settings: keep "Allow public access" on. (2) The Free plan allows ~100 realtime messages/s per project, which means about 6–8 players moving at the same time before Supabase starts disconnecting people (they reconnect automatically). For bigger crowds upgrade the plan and raise `TUNING.roomMsgBudget` in `src/net/core.js`. (3) After the next deploy, open the live site and check the browser console shows `[net] connected to town:1 via supabase`.
  - Verified the database functions through the Supabase connector: a door counts once per player. A test entry (player 00000000-0000-4000-8000-0000000000aa, door 1) is still in `door_opens`: deleting it needed your confirmation while you were asleep. Town Spirit starts at 1 instead of 0. Remove it with `delete from door_opens where player_id = '00000000-0000-4000-8000-0000000000aa';` if you like.
  - Name tags show through buildings on purpose (helps find friends); they fade with distance.
- 05:50 IST: Foundation done (Opus), 106/106 selftest checks. Committed. Moved Tilly's door spot to (3.5, 13.0) because the gazebo roof hid her (the agent's call, I agreed). New test flag `?doors=N` marks doors 1..N done. The selftest wipes the save in its browser (`progress.reset()` first): only for testing.
- 05:25 IST: World & time of day done (Fable). Committed. Scene at the high view: 181 draw calls, 552k triangles (limit 600k), so little headroom left for waves 2–3: new content must replace, not add. Lowered the entry (attract) camera to 13° pitch so the sky, hills and stars show behind the title card; checked at 22:00, looks right.
- 05:30 IST: Snowball (door 5, Opus) done. Committed. Arena moved east of the gazebo (gazebo + trees sat on the old centre); ARENAS.snowball updated. Replaced its poke at life internals with a proper `life.hideDistrict(id)` API.
- 05:32 IST: `?spirit` retired in favour of `?doors=N`. tools/playthrough.py rewritten for wave 1 (selfTest doors 1–8, each mini-game start/quit/cleanup, phone layouts).
- 05:34 IST: The cloud environment restarted and killed running processes (my background capture, the agents' Chrome runs). Files intact. Asked the UI and sled agents to resume.
- Holding the GitHub push until UI + sled are in and the e2e passes, so the live site never shows a half-built wave.
