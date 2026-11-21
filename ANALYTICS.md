# Analytics (PostHog only)

Code: `src/analytics/` (config.js, client.js, index.js). One line in `src/main.js`; three one-line emits (`photo:taken`, `photo:shared` in src/photo/index.js, `tips:skipped` in src/tips/index.js).

## How it loads
- Only on the production host (hostname ends with `vercel.app`, see `PROD_HOST_SUFFIX` / `PROD_EXTRA_HOSTS`). Never on file://, localhost, `?capture`, or when Do Not Track / Global Privacy Control is on. Those runs make zero PostHog requests.
- posthog-js is NOT bundled: the official build is loaded from `https://us-assets.i.posthog.com/static/array.js` on first event. Bundle cost is the ~3 KB wrapper.
- Key + host: `config.js` (KEY = project key, HOST = https://us.i.posthog.com). Override with Vercel env vars `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` + redeploy. Empty key = silent no-op.

## Privacy
Anonymous only: persistence `memory` (no cookies, no PostHog storage), our own random device id in localStorage `tinselby.anon` used as distinct_id, `person_profiles: 'never'`, autocapture / session recording / heatmaps / dead clicks / surveys / feature flags / exception autocapture all OFF. No names, chat or phrase text, friend codes or stack traces are sent (phrases and emotes by id only; errors are 120-char messages with URLs and paths removed, max 5 per session). A one-line note is shown on the entry card.
PostHog project settings to flip: Settings > Project > "Discard client IP data" ON (country is resolved first), session replay OFF, set data retention to what you want.

## Events
`$pageview`, `$pageleave` (posthog-js, for Web analytics: visitors, referrers, UTMs, devices, countries), plus:
session_start {device, orientation, viewport, returning, lang, referrer_domain, town_link, utm_*}, name_entered, door_opened {n} (door unlocked), door_completed {n, stars, secs}, minigame_start {id}, minigame_end {id, score, stars, quit, secs}, ride_start {id}, ride_end {id, secs}, photo_taken, photo_shared, friend_town_created, friend_town_joined, emote_sent {id}, phrase_sent {id}, snowball_thrown, gift_sent, gift_accepted, map_opened, show_way {source: map|other}, tips_skipped, finale_watched {secs, replay}, perf {fps_bucket, fps, load_ms} (5 s window after 25 s), error {message}, session_end {minutes visible, final} (sent on every hide; take the max per session).

## Suggested dashboard
1. Funnel (Insights > Funnel, unique users, 1 day window): session_start > name_entered > door_completed where n = 1 > door_completed where n = 5.
2. Retention: first event session_start, returning event session_start, daily.
3. Doors per day: Trends, door_completed, total count, interval day, breakdown by `n`.
4. Mini-game quits: Trends, minigame_end where quit = true, breakdown by `id` (compare to minigame_start).
5. Rides: Trends, ride_start, breakdown by `id`.
6. Play together: Trends of friend_town_created, friend_town_joined, emote_sent, phrase_sent, snowball_thrown, gift_sent (unique users).
7. Performance: Trends, perf, average of `fps`, breakdown by `fps_bucket`; second series average `load_ms`.
8. Sessions: session_end, max of `minutes` per session (formula/avg); errors: Trends of error, breakdown by `message`.
9. Web analytics tab: referrers, UTMs, devices, countries, no setup needed.

## Tests
`window.__analyticsStub = { capture(event, props, meta) {} }` set before load replaces PostHog entirely (no network, no key needed).
