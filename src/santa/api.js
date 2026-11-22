// Secret Santa RPC layer (PHASE3.md §Secret Santa RPCs). Every call returns {ok, status, code, message} and never throws.
//   createSantaApi(ctx, { now: () => ms | null }) → { mode, status(forTown?), start(), join(), leave(), draw(), give(item), mock }
// mode: 'mock' (?santa=mock, or ?net=local: src/santa/mock.js) · 'server' (Supabase via the net transport) · 'off'.
// Identity = src/net/identity.js getIdentity(ctx) → {player, secret}. p_now (santa_status only) is sent when a test
// clock is set: the mock always honours it, the server only for QQ… test towns, so it's only sent there.
import { getIdentity } from '../net/identity.js';
import { cleanName } from '../core/names.js';
import { createSantaMock, CLOSE_AT, REVEAL_AT } from './mock.js';

/** Server error code → a friendly line for kids (no codes on screen). */
const FRIENDLY = {
  already_started: 'Secret Santa has already started in this town.',
  not_open: 'Sign-ups are closed: the names have been drawn.',
  full: 'Secret Santa is full: 16 friends have joined.',
  not_starter: 'Only the friend who started Secret Santa can draw names early.',
  too_few: 'You need at least 3 friends to draw names.',
  not_drawn: 'The names haven’t been drawn yet.',
  revealed: 'Presents are already open, so it can’t be changed now.',
  not_member: 'Join Secret Santa first.',
  bad_item: 'That present can’t be wrapped. Pick another one.',
  bad_secret: 'This device can’t play as you. Try the device you joined on.',
  bad_identity: 'Something went wrong. Please try again.',
  bad_name: 'Pick a name first, then try again.',
  bad_town: 'Secret Santa only works in a friends town.',
  rate_limited: 'Slow down a little, then try again.',
  offline: 'Couldn’t reach the North Pole. Are you online?',
  unknown: 'Something went wrong. Please try again.',
};
const KNOWN = Object.keys(FRIENDLY);
export function errorCode(err) {
  const s = String((err && (err.message || err.code || err.details || err.hint)) || err || '').toLowerCase();
  for (const k of KNOWN) if (s.includes(k)) return k;
  if (/fetch|network|failed to|timeout|load|offline|connection/.test(s)) return 'offline';
  return 'unknown';
}
export const friendly = (code) => FRIENDLY[code] || FRIENDLY.unknown;

const str = (v, n = 40) => (typeof v === 'string' && v ? v.slice(0, n) : null);
const iso = (v, fb) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : fb);
/** Defensive copy of a santa_status result with every field present. */
export function normStatus(d) {
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  if (Array.isArray(d)) d = d[0];
  if (!d || typeof d !== 'object') return null;
  const state = ['none', 'open', 'drawn', 'revealed'].includes(d.state) ? d.state : 'none';
  const gifts = Array.isArray(d.gifts) ? d.gifts.filter((g) => g && typeof g === 'object').map((g) => ({ from: str(g.from, 24) || 'A friend', to: str(g.to, 24) || 'a friend', item: str(g.item, 32) })) : [];
  const out = {
    state, close_at: iso(d.close_at, CLOSE_AT), reveal_at: iso(d.reveal_at, REVEAL_AT),
    starter: str(d.starter, 24), count: Math.max(0, +d.count | 0), members: Array.isArray(d.members) ? d.members.map((m) => str(typeof m === 'string' ? m : m && m.name, 24)).filter(Boolean) : [],
    joined: !!d.joined, is_starter: !!d.is_starter, my_match: str(d.my_match, 24), my_gift: str(d.my_gift, 32), gifts, late: !!d.late, cancelled: !!d.cancelled,
  };
  if (!out.count && out.members.length) out.count = out.members.length;
  // optional extension (if the server ever sends it): what you received, so names that clash don't matter
  if (d.my_received && typeof d.my_received === 'object') out.my_received = { from: str(d.my_received.from, 24), item: str(d.my_received.item, 32) };
  return out;
}

export function createSantaApi(ctx, { now = () => null } = {}) {
  const params = ctx.params;
  const netMode = () => (ctx.net && ctx.net.mode) || 'off';
  const wantMock = (params && params.get && params.get('santa') === 'mock') || netMode() === 'local';
  let mock = null, serverRpc = null;
  if (wantMock) mock = createSantaMock({ now: () => now() ?? Date.now() });
  const mode = mock ? 'mock' : netMode() === 'supabase' ? 'server' : 'off';
  // tests: ?santaAs=<uuid> plays as another player (mock only — tabs of one browser share the save)
  const asId = mock && params && params.get && /^[0-9a-f-]{16,64}$/i.test(params.get('santaAs') || '') ? params.get('santaAs') : null;

  async function rpcFn(fn, args) {
    if (mock) return mock.rpc(fn, args);
    if (mode !== 'server') return { data: null, error: { message: 'offline' } };
    if (typeof ctx.net?.rpc === 'function') return ctx.net.rpc(fn, args); // if the net module ever exposes its transport
    if (!serverRpc) {
      const [{ createSupabaseTransport }, cfg] = await Promise.all([import('../net/transport.js'), import('../core/net-config.js')]);
      const t = createSupabaseTransport({ url: cfg.SUPABASE_URL, key: cfg.SUPABASE_KEY });
      serverRpc = (f, a) => t.rpc(f, a);
    }
    return serverRpc(fn, args);
  }

  const town = () => ctx.net?.town?.code || null;
  function ident() {
    const id = getIdentity(ctx);
    if (asId) { id.player = asId; id.secret = asId.split('').reverse().join(''); }
    return id;
  }
  const myName = () => cleanName(ctx.game?.state?.playerName || 'Traveller');

  let inflight = 0;
  async function call(fn, extra = {}, forTown = null) {
    const code = forTown || town();
    if (!code) return { ok: false, code: 'bad_town', message: friendly('bad_town'), town: null };
    if (mode === 'off') return { ok: false, code: 'offline', message: friendly('offline'), town: code };
    const { player, secret } = ident();
    if (!player) return { ok: false, code: 'unknown', message: friendly('unknown'), town: code };
    const args = { p_town: code, p_player: player, p_secret: secret, ...extra };
    inflight++;
    try {
      const res = await rpcFn(fn, args);
      const err = res && res.error;
      const d = res && res.data;
      if (err) { const c = errorCode(err); return { ok: false, code: c, message: friendly(c), town: code, raw: err }; }
      if (d && typeof d === 'object' && !Array.isArray(d) && d.error && !d.state) { const c = errorCode(d.error); return { ok: false, code: c, message: friendly(c), town: code }; }
      const status = normStatus(d);
      if (!status) return { ok: false, code: 'unknown', message: friendly('unknown'), town: code };
      return { ok: true, status, town: code };
    } catch (e) {
      const c = errorCode(e);
      return { ok: false, code: c, message: friendly(c), town: code };
    } finally { inflight--; }
  }

  return {
    mode, mock, CLOSE_AT, REVEAL_AT,
    get busy() { return inflight > 0; },
    myName,
    identity: ident,
    /** santa_status for the town you're in, or for another one (forTown: a remembered group, from the big town). */
    status(forTown = null) {
      const t = now(), code = forTown || town();
      const extra = t != null && (mock || (code && code.startsWith('QQ'))) ? { p_now: new Date(t).toISOString() } : {};
      return call('santa_status', extra, forTown);
    },
    start: () => call('santa_start', { p_name: myName() }),
    join: () => call('santa_join', { p_name: myName() }),
    leave: () => call('santa_leave'),
    draw: () => call('santa_draw'),
    give: (item) => call('santa_give', { p_item: String(item || '') }),
  };
}
