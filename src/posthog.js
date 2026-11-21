import posthogClient from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST;

if (!key && import.meta.env.DEV) {
  console.error(new Error('VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured'));
}

if (!host && import.meta.env.DEV) {
  console.error(new Error('VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured'));
}

const posthog = key && host
  ? (posthogClient.init(key, {
    api_host: host,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: 'tinselby-web',
      environment: import.meta.env.MODE,
    },
  }), posthogClient)
  : null;

export const posthogLogger = posthog?.logger ?? null;

export default posthog;
