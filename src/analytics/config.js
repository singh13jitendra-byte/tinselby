// Analytics settings. Safe to commit: a PostHog *project* key (phc_...) is public by design.
// Everything (visits, referrers, UTMs, devices, countries + in-game events) goes to PostHog. Nothing is sent from file://,
// localhost, ?capture runs, previews on other hosts, or when Do Not Track / Global Privacy Control is on.

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** PostHog project API key (phc_...). Override with the VITE_POSTHOG_KEY env var (Vercel) + redeploy. '' = silent no-op. */
export const KEY = (env.VITE_POSTHOG_KEY || '').trim() || 'phc_yAJYtwarFFckLUdwdGfHJ5Nf3MpqhFwQNyeykpbyQvje';

/** US: https://us.i.posthog.com   EU: https://eu.i.posthog.com (ingestion host, not the app.posthog.com dashboard URL). */
export const HOST = ((env.VITE_POSTHOG_HOST || '').trim() || 'https://us.i.posthog.com').replace(/\/+$/, '');

/** posthog-js is loaded lazily from PostHog's CDN (never bundled) and only on hosts ending with this suffix. */
export const PROD_HOST_SUFFIX = 'vercel.app';
/** Extra production hostnames (a custom domain later). */
export const PROD_EXTRA_HOSTS = [];
