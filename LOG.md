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
