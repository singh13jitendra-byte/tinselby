// Who you are to the Phase 3 RPCs (PHASE3.md §Ground rules): the progress player id plus a per-device secret.
//   getIdentity(ctx) → { player, secret }   (both uuid strings; never throws)
// The secret lives in localStorage `tinselby.secret.v1` (crypto.randomUUID() on first use). The server keeps only
// sha256(secret) and requires it on every call for that player, so knowing someone's player id is not enough.
// Shared by Secret Santa (src/santa) and the friends-town scoreboards (src/scores).
const SECRET_KEY = 'tinselby.secret.v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let memSecret = null; // private mode / storage blocked: one secret for this page's lifetime

function newUuid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* insecure context */ }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** This device's secret (created and stored on first use). */
export function getSecret() {
  try {
    const s = localStorage.getItem(SECRET_KEY);
    if (s && UUID_RE.test(s)) return s;
    const n = newUuid();
    localStorage.setItem(SECRET_KEY, n);
    if (localStorage.getItem(SECRET_KEY) === n) return n;
  } catch (e) { /* private mode */ }
  if (!memSecret) memSecret = newUuid();
  return memSecret;
}

/** { player: progress.playerId, secret } — player is null before progress exists (callers should then skip the RPC). */
export function getIdentity(ctx) {
  let player = null;
  try { player = ctx && ctx.progress && ctx.progress.playerId; } catch (e) { /* stub */ }
  return { player: typeof player === 'string' && player ? player : null, secret: getSecret() };
}
