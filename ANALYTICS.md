# Analytics (PostHog only)

Code: `src/analytics/` (config.js, client.js, index.js). One line in `src/main.js` (`ctx.invite` must come after it: invite_opened is emitted while the modules are built); three one-line emits (`photo:taken`, `photo:shared` in src/photo/index.js, `tips:skipped` in src/tips/index.js).

## How it loads
- Only on the production host (hostname ends with `vercel.app`, see `PROD_HOST_SUFFIX` / `PROD_EXTRA_HOSTS`). Never on file://, localhost, `?capture`, or when Do Not Track / Global Privacy Control is on. Those runs make zero PostHog requests.
- posthog-js is NOT bundled: the official build is loaded from `https://us-assets.i.posthog.com/static/array.js` on first event. Bundle cost is the ~3 KB wrapper.
- Key + host: `config.js` (KEY = project key, HOST = https://us.i.posthog.com). Override with Vercel env vars `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` + redeploy. Empty key = silent no-op.

## Privacy
Anonymous only: persistence `memory` (no cookies, no PostHog storage), our own random device id in localStorage `tinselby.anon` used as distinct_id, `person_profiles: 'never'`, autocapture / session recording / heatmaps / dead clicks / surveys / feature flags / exception autocapture all OFF. No names, chat or phrase text, friend codes or stack traces are sent (phrases and emotes by id only; errors are 120-char messages with URLs and paths removed, max 5 per session). A one-line note is shown on the entry card.
PostHog project settings to flip: Settings > Project > "Discard client IP data" ON (country is resolved first), session replay OFF, set data retention to what you want.

## Events
`$pageview`, `$pageleave` (posthog-js, for Web analytics: visitors, referrers, UTMs, devices, countries), plus:
session_start {device, orientation, viewport, returning, lang, referrer_domain, town_link, utm_*}, name_entered, door_opened {n} (door unlocked), door_completed {n, stars, secs}, minigame_start {id}, minigame_end {id, score, stars, quit, secs}, ride_start {id}, ride_end {id, secs}, photo_taken, photo_shared, friend_town_created, friend_town_joined, emote_sent {id}, phrase_sent {id}, snowball_thrown, gift_sent, gift_accepted, map_opened, show_way {source: map|other}, activities_opened (phones: the round "Things to do" button opened its sheet), activity_way {id} (a row in that sheet was tapped and the way there lit up; id = activity id such as ferris, skate, tram-park), tips_skipped, finale_watched {secs, replay}, perf {fps_bucket, fps, load_ms} (5 s window after 25 s), error {message}, session_end {minutes visible, final} (sent on every hide; take the max per session).
Christmas cards (src/cards): card_opened {where: friends|photo}, card_created {scene: tree|wheel|park|photo, greeting: g1..g5, frame: f1..f3} (first Send / WhatsApp / Copy / Save of a design in that sitting), card_shared {method: share|whatsapp|copy|save} (share = the share sheet finished; whatsapp = wa.me opened). Ids only, never the sender name.
Invite links (src/invite): invite_opened {has_card, has_town} (page opened from a link with `?from=`; has_card = a valid `card=`, has_town = a valid `town=` code), invite_played (that visitor entered their name, once per page load). Never the sender's name or the code.
Install as an app (src/pwa): install_prompt_shown {platform: android|ios|desktop, trigger, guide} (the "Add Tinselby to your home screen" card appeared in free play, or the help row opened the prompt/guide directly; automatic card max 3 times, 3 days apart, once per session), install_accepted {platform, trigger, guide} (prompt: the browser's install dialog was accepted; ios / android_menu: Add tapped and the 2-step picture guide was shown), install_dismissed {platform, native, trigger, guide} (Not now; native = the browser dialog was dismissed), installed {via: prompt|launch} (appinstalled event, or the first launch as an app with ?source=pwa / display-mode standalone; once per device). trigger: door (a few seconds after a door) | returning (a player with ≥1 door done, ~45 s into a session) | help (the "Add Tinselby to your home screen" row in the "?" help card). guide: prompt (the browser's own install dialog) | ios (Share → Add to Home Screen) | android_menu (no install prompt on this Android browser, e.g. a WhatsApp / Custom Tab in-app browser, Samsung Internet, Firefox: ⋮ → Open in Chrome, then ⋮ → Add to Home screen) | desktop_hint (help row on desktop without a prompt: "use the install icon in the address bar"). session_start also carries standalone: true|false.
Play streaks (src/streaks): streak_day {streak, snow_day_used} (the first door completed or mini-game finished on a new local day; snow_day_used = a free snow day bridged one missed day), streak_reward {days: 3|7|14} (a streak wardrobe piece was handed out). Numbers only, no names.

## Suggested dashboard
1. Funnel (Insights > Funnel, unique users, 1 day window): session_start > name_entered > door_completed where n = 1 > door_completed where n = 5.
2. Retention: first event session_start, returning event session_start, daily. Streaks: Trends, streak_day, breakdown by `streak`; streak_reward count by `days`.
3. Doors per day: Trends, door_completed, total count, interval day, breakdown by `n`.
4. Mini-game quits: Trends, minigame_end where quit = true, breakdown by `id` (compare to minigame_start).
5. Rides: Trends, ride_start, breakdown by `id`.
6. Play together: Trends of friend_town_created, friend_town_joined, emote_sent, phrase_sent, snowball_thrown, gift_sent (unique users).
7. Performance: Trends, perf, average of `fps`, breakdown by `fps_bucket`; second series average `load_ms`.
8. Sessions: session_end, max of `minutes` per session (formula/avg); errors: Trends of error, breakdown by `message`.
9. Web analytics tab: referrers, UTMs, devices, countries, no setup needed.

## Tests
`window.__analyticsStub = { capture(event, props, meta) {} }` set before load replaces PostHog entirely (no network, no key needed).
