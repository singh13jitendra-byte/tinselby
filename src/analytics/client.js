// PostHog wrapper. posthog-js is NOT in the bundle: on the production host only, the official build is loaded from PostHog's
// asset CDN (<host>-assets, same as PostHog's own snippet) and initialised with everything optional switched off.
// Events captured before it has loaded are queued and replayed. In tests window.__analyticsStub replaces all of it.
//
// Privacy: persistence 'memory' (no cookies, no PostHog localStorage), our own random device id 'tinselby.anon' as distinct_id,
// person_profiles 'never' (anonymous events), autocapture / session recording / heatmaps / dead clicks / surveys / flags OFF.
// IPs: set "Discard client IP data" in the PostHog project (country still resolves first). See ANALYTICS.md.

const uuid = () => {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* */ }
  const a = new Uint8Array(16);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 16; i++) a[i] = Math.random() * 256; }
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export function privacyOptOut() {
  try {
    const n = navigator;
    return n.doNotTrack === '1' || n.doNotTrack === 'yes' || window.doNotTrack === '1' || n.msDoNotTrack === '1' || n.globalPrivacyControl === true;
  } catch (e) { return false; }
}

/** Stable anonymous device id kept by us. Returns {id, returning}. */
export function anonId() {
  const K = 'tinselby.anon';
  try {
    const v = localStorage.getItem(K);
    if (v && /^[a-z0-9-]{8,64}$/.test(v)) return { id: v, returning: true };
    const id = uuid();
    localStorage.setItem(K, id);
    return { id, returning: false };
  } catch (e) { return { id: uuid(), returning: false }; }
}

export const phConfig = (distinctId) => ({
  api_host: undefined, // filled by caller
  persistence: 'memory',
  bootstrap: { distinctID: distinctId },
  person_profiles: 'never',
  autocapture: false,
  capture_pageview: true,   // $pageview with url / referrer / utm / device / browser for PostHog Web analytics
  capture_pageleave: true,  // $pageleave (session duration for Web analytics)
  disable_session_recording: true,
  capture_heatmaps: false,
  capture_dead_clicks: false,
  capture_exceptions: false,
  disable_surveys: true,
  disable_web_experiments: true,
  advanced_disable_flags: true,
  advanced_disable_toolbar_metrics: true,
  respect_dnt: true,
  disable_external_dependency_loading: true,
  save_campaign_params: false,
  save_referrer: false,
});

/**
 * createClient({key, host, stub, distinctId, sessionId})  → { live, capture(event, props), flush(unload) }
 *   stub: window.__analyticsStub = { capture(event, props, meta) }  (tests; no network, no key needed)
 */
export function createClient({ key, host, stub = null, distinctId, sessionId }) {
  const queue = [];
  let ph = null, loading = false;
  const live = !!stub || !!key;
  const load = () => {
    if (loading || !key) return;
    loading = true;
    try {
      const s = document.createElement('script');
      s.async = true;
      s.src = host.replace(/\.i\.posthog\.com$/, '-assets.i.posthog.com') + '/static/array.js';
      s.onload = () => {
        try {
          const p = window.posthog;
          if (!p || typeof p.init !== 'function') return;
          const cfg = phConfig(distinctId); cfg.api_host = host;
          p.init(key, cfg);
          ph = p;
          for (const [e, pr] of queue.splice(0)) p.capture(e, pr);
        } catch (e) { /* analytics must never throw */ }
      };
      s.onerror = () => { queue.length = 0; };
      document.head.appendChild(s);
    } catch (e) { /* */ }
  };
  const api = {
    live,
    sent: 0,
    capture(event, props = {}) {
      if (!live) return;
      api.sent++;
      if (stub) { try { stub.capture(event, { ...props }, { distinct_id: distinctId, $session_id: sessionId }); } catch (e) { /* */ } return; }
      try { if (ph) ph.capture(event, props); else { if (queue.length < 100) queue.push([event, props]); load(); } } catch (e) { /* */ }
    },
    flush() { /* posthog-js flushes itself on pagehide */ },
    pending: () => queue.length,
    get loaded() { return !!ph; },
  };
  return api;
}
