// Read-only adapters over ctx.progress / ctx.net for the calendar + UI. Door data (titles, givers, districts, kinds,
// rewards, availability) is read from ctx.progress, whose doors come from src/progress/doors.js (the single source of
// truth). Both may be missing or stubs while other modules are built, so every call is guarded; with no progress the
// adapters fall back to the static DOORS export (pure data, no side effects).
import { DISTRICTS, DOOR_SPOTS } from '../core/layout.js';
import { STYLE_OPTIONS } from '../core/player.js';
import { DOORS, DEFAULT_UNLOCKED, GATED_SLOTS, WISH_REWARDS } from '../progress/doors.js';

export { GATED_SLOTS };

const PREP = { residential: 'on', lakeside: 'by', hill: 'on', park: 'in', market: 'in' };
const safe = (fn, fb) => { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb; } };
const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);

// ---- Christmas Eve clock (WAVE3.md §Progress). progress.eve is used when it is there; this is the same computation.
const pad2 = (v) => String(v).padStart(2, '0');
const dayKeyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** Whole days from key a to key b (YYYY-MM-DD), by UTC arithmetic so daylight saving never shifts it. */
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
/** season = this year once the month is July or later, else last year; Eve = 24 Dec of that season. */
function eveFor(today) {
  const y = +today.slice(0, 4);
  const season = +today.slice(5, 7) >= 7 ? y : y - 1;
  const day = `${season}-12-24`;
  const isEve = today >= day;
  return { season, day, isEve, isAfter: today >= `${season}-12-25`, sleeps: isEve ? 0 : dayDiff(today, day) };
}
/** Local today as a key, honouring the same test flags as progress: ?date=YYYY-MM-DD, ?eve (24 Dec), ?xmas (26 Dec). */
function testToday() {
  const q = (typeof location !== 'undefined' && location.search) || '';
  const d = q.match(/[?&]date=(\d{4}-\d{2}-\d{2})(?=&|$)/);
  if (d) return d[1];
  const real = dayKeyOf(new Date());
  const season = eveFor(real).season;
  if (/[?&]eve(?=&|=|$)/.test(q)) return `${season}-12-24`;
  if (/[?&]xmas(?=&|=|$)/.test(q)) return `${season}-12-26`;
  return real;
}

export function createData(ctx) {
  const pr = () => ctx.progress || {};
  const real = () => Array.isArray(pr().doors) && pr().doors.length > 0;

  const data = {
    /** All 24 door metadata objects. */
    doors() { return real() ? pr().doors : DOORS; },
    door(n) { return data.doors().find((d) => d && d.n === n) || DOORS[n - 1] || null; },
    /** Lowest open-not-done door number, or null. */
    current() {
      const c = safe(() => pr().current?.(), undefined);
      if (c === null) return null;
      if (typeof c === 'number') return c;
      if (c && typeof c.n === 'number') return c.n;
      return real() ? null : 1;
    },
    /** 'locked' | 'open' | 'done' | 'soon' */
    state(n) {
      if (real()) {
        const s = safe(() => pr().state?.(n), null);
        if (s === 'locked' || s === 'open' || s === 'done' || s === 'soon') return s;
      }
      // door 24 (Christmas Eve): open on 24 Dec once door 4 is done, else locked (WAVE3.md §Progress)
      if (n === 24) return data.eve().isEve && data.state(4) === 'done' ? 'open' : 'locked';
      const d = data.door(n);
      if (!d || !d.available) return 'soon';
      // after Christmas every door is open for replay (the one-by-one unlock is lifted)
      if (data.eve().isAfter) return 'open';
      const cur = data.current();
      if (cur == null) return 'done';
      return n < cur ? 'done' : n === cur ? 'open' : 'locked';
    },
    /** Christmas Eve clock: { season, day, isEve, isAfter, sleeps } (progress.eve, or the same computation). */
    eve() {
      const p = safe(() => pr().eve, null);
      if (p && typeof p.day === 'string' && typeof p.isEve === 'boolean') {
        return { season: num(p.season), day: p.day, isEve: p.isEve, isAfter: !!p.isAfter, sleeps: num(p.sleeps) };
      }
      return eveFor(testToday());
    },
    /** "3 sleeps" / "1 sleep" / "Tonight!" */
    sleepsText(k) {
      const s = num(k);
      return s === 0 ? 'Tonight!' : s === 1 ? '1 sleep' : `${s} sleeps`;
    },
    /** Door 24's gift: the wish piece's label, else "A surprise from Santa". */
    giftLabel() {
      const id = safe(() => pr().wish?.get?.(), null);
      if (id) {
        const opts = safe(() => pr().wish?.options, null);
        const r = (Array.isArray(opts) ? opts : []).find((o) => o && o.id === id) || WISH_REWARDS.find((o) => o.id === id);
        if (r?.label) return r.label;
      }
      return 'A surprise from Santa';
    },
    /** True from 25 Dec (local) on: the Christmas-mode calendar. */
    isChristmas() { return !!data.eve().isAfter; },
    /** Status line for door 24's tile: locked "3 sleeps · opens Christmas Eve", open "Tonight!", done the gift label. */
    door24Text() {
      const s = data.state(24);
      if (s === 'done') return data.giftLabel();
      if (s === 'open') return data.eve().isAfter ? 'Play any time' : 'Tonight!';
      if (s !== 'locked') return '';
      const e = data.eve();
      if (e.isEve) return 'Help Bram bring the star to the tree first';
      return `${data.sleepsText(e.sleeps)} · opens Christmas Eve`;
    },
    doneCount() {
      const v = safe(() => pr().doneCount?.(), undefined);
      if (Number.isFinite(v)) return v;
      let c = 0;
      for (let n = 1; n <= 24; n++) if (data.state(n) === 'done') c++;
      return c;
    },
    /** Highest door number available in this wave (progress knows the wave; the door list is the fallback). */
    lastAvailable() {
      const v = safe(() => pr().lastAvailable?.(), undefined);
      if (Number.isFinite(v) && v > 0) return v;
      let m = 0;
      for (const d of data.doors()) if (d && d.available && d.n > m) m = d.n;
      return m || 8;
    },
    /** True when every available door is done (wave end). */
    waveDone() {
      const last = data.lastAvailable();
      for (let n = 1; n <= last; n++) if (data.door(n)?.available && data.state(n) !== 'done') return false;
      return last > 0;
    },
    best(gameId) { return gameId ? safe(() => pr().best?.(gameId), null) : null; },
    /** Stars earned for a door (mini-games keep their best; tasks count as 1 once done). */
    stars(n) {
      const ps = safe(() => pr().stars?.(n), undefined);
      if (Number.isFinite(ps)) return Math.max(0, Math.min(3, ps | 0));
      const d = data.door(n);
      if (!d) return 0;
      const b = d.game ? data.best(d.game) : null;
      if (b && Number.isFinite(b.stars)) return Math.max(0, Math.min(3, b.stars | 0));
      return data.state(n) === 'done' ? 1 : 0;
    },
    get streak() { return num(safe(() => pr().daily?.streak, 0)); },
    get dailyAvailable() { return !!safe(() => pr().daily?.available, false); },
    claimDaily() { return safe(() => pr().daily?.claim?.(), null); },
    /** Spot where a door's giver stands (layout.DOOR_SPOTS, or the live giver position if the game exposes one). */
    spot(n) {
      const live = safe(() => ctx.tasks?.giverPos?.(n), null) || safe(() => { const g = ctx.tasks?.doorGivers?.[n]; return g?.pos || g; }, null);
      if (live && Number.isFinite(live.x) && Number.isFinite(live.z)) return { x: live.x, z: live.z, district: data.door(n)?.district };
      const s = DOOR_SPOTS[n];
      return s ? { x: s.x, z: s.z, district: s.district } : null;
    },
    /** Friendly place names come from layout.DISTRICTS (Pinecone Park, Frostmere Lake, Market Square, Holly Lane, Sledge Hill). */
    districtName(id) { return DISTRICTS.find((d) => d.id === id)?.name || (id ? 'Tinselby' : ''); },
    /** "Tilly in Pinecone Park", "Ilse by Frostmere Lake" (the game's own phrasing when it has one) */
    whereText(n) {
      const w = safe(() => ctx.tasks?.whereText?.(n), '');
      if (w) return w;
      const d = data.door(n);
      if (!d?.giver) return '';
      const dist = d.district || data.spot(n)?.district;
      return `${d.giver} ${PREP[dist] || 'in'} ${data.districtName(dist)}`;
    },
    /** "Find Tilly in Pinecone Park" */
    findText(n) {
      const d = data.door(n);
      if (!d) return '';
      const w = data.whereText(n);
      return w ? `Find ${w}` : d.title;
    },
    /** Current door's goal for the HUD task chip (the game's objective text if it has one). */
    goalText() {
      const o = safe(() => ctx.tasks?.objective, null);
      if (o && o.text) return o.text;
      const c = data.current();
      return c ? data.findText(c) : '';
    },

    // ---- wardrobe
    /** Option keys unlocked for a slot (non-gated slots: all of them). */
    unlocked(slot) {
      const all = Object.keys(STYLE_OPTIONS[slot] || {});
      if (!GATED_SLOTS.includes(slot)) return all;
      const v = safe(() => pr().wardrobe?.unlocked?.(slot), null);
      if (Array.isArray(v) && v.length) return v.filter((k) => all.includes(k));
      // stub: default keys + rewards of done doors
      const out = new Set((DEFAULT_UNLOCKED[slot] || []).filter((k) => all.includes(k)));
      for (const d of data.doors()) if (d?.reward?.slot === slot && data.state(d.n) === 'done') out.add(d.reward.key);
      return all.filter((k) => out.has(k));
    },
    isUnlocked(slot, key) { return data.unlocked(slot).includes(key); },
    /** Where a locked option comes from: {door: n, title} | {daily: true} | null if unlocked. */
    lockInfo(slot, key) {
      if (data.isUnlocked(slot, key)) return null;
      const src = safe(() => pr().wardrobe?.source?.(slot, key), undefined);
      if (src?.santa) return { santa: true };
      if (src && (src.door || src.daily)) return src.door ? { door: src.door, title: src.title } : { daily: true };
      const d = data.doors().find((x) => x?.reward?.slot === slot && x.reward.key === key);
      if (d) return { door: d.n, title: d.title };
      return WISH_REWARDS.some((x) => x.slot === slot && x.key === key) ? { santa: true } : { daily: true };
    },
    rewardLabel(slot, key) {
      const d = data.doors().find((x) => x?.reward?.slot === slot && x.reward.key === key);
      if (d?.reward?.label) return d.reward.label;
      const w = WISH_REWARDS.find((x) => x.slot === slot && x.key === key);
      if (w) return w.label;
      const v = STYLE_OPTIONS[slot]?.[key];
      const nice = key.charAt(0).toUpperCase() + key.slice(1);
      if (slot === 'hat') return typeof v === 'string' && !v.startsWith('#') ? v : `${nice} hat`;
      return `${nice} ${slot}`;
    },

    // ---- net
    townSpirit() {
      const t = safe(() => ctx.net?.townSpirit, null) || {};
      // the town total always includes your own doors (offline, or before the first server count arrives)
      const mine = data.doneCount();
      return { doors: Math.max(num(t.doors), mine), helpers: Math.max(num(t.helpers), mine ? 1 : 0) };
    },
    get online() { return !!safe(() => ctx.net?.online, false); },
    /** Players in your town including you. */
    playerCount() { const p = safe(() => ctx.net?.players?.(), []); return (Array.isArray(p) ? p.length : 0) + 1; },
  };
  return data;
}
