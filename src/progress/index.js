// Player progress (WAVE1.md §Progress): Advent doors, rewards + wardrobe unlocks, daily gift + streak, best mini-game
// scores, festive level. Persisted in localStorage `tinselby.save.v1` (see save.js). Test flags: ?reset wipes the save,
// ?doors=N marks doors 1..N done on load (quietly; N up to 23 opens the finale door).
//
// Events: door:open {n}, door:complete {n, stars, score}, reward:grant {id, slot, key, label} (door rewards only),
// daily:claim {reward, streak}, wave:end {n, done}, spirit:change {value, max} (also on load), plus the extras
// progress:change {} (anything changed: refresh UI), progress:reset {}, daily:available {} (a new day began mid-session).
import { STYLE_OPTIONS, DEFAULT_STYLE } from '../core/player.js';
import { DOORS, FINALE_DOOR, door, doorForGame, DEFAULT_UNLOCKED, GATED_SLOTS, DAILY_REWARDS, DAILY_TREATS, REWARDS, festiveLevel } from './doors.js';
import { SAVE_KEY, blankSave, defaultStorage, load, store, wipe, dayKey, prevDay } from './save.js';

export { DOORS, REWARDS, DAILY_REWARDS, festiveLevel };
const SPIRIT_MAX = 4;

/**
 * createProgress(ctx, opts?) → progress. opts (tests): { storage, key, silent (no events / timers / net), clock: () => Date }.
 */
export function createProgress(ctx = {}, opts = {}) {
  const game = ctx.game || null;
  const params = opts.params || ctx.params || new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const storage = opts.storage || defaultStorage();
  const key = opts.key || SAVE_KEY;
  const silent = !!opts.silent;
  let quiet = false;
  if (!opts.storage && params.has('reset')) {
    wipe(storage, key);
    // a full reset also forgets the name/look (ui profile) and the shared-town id, so the entry screen starts fresh
    for (const k of ['tinselby.profile', 'tinselby.net.v1']) { try { storage.removeItem?.(k); } catch (e) { /* */ } }
  }
  const loaded = load(storage, key);
  let S = loaded.save;
  if (loaded.corrupt && !silent) console.warn('[progress] save was unreadable; starting fresh');

  const now = () => (api._clock ? api._clock() : opts.clock ? opts.clock() : new Date());
  const today = () => dayKey(now());
  const emit = (evt, data = {}) => {
    if (silent || quiet || !game?.emit) return;
    try { game.emit(evt, data); } catch (e) { console.error('[progress] ' + evt, e); }
  };
  function persist() {
    S.updated = Date.now();
    if (game?.state?.style && game.state.phase && game.state.phase !== 'entry') S.profile.style = { ...game.state.style };
    store(storage, S, key);
  }
  const changed = (data = {}) => emit('progress:change', data);

  // ---------------------------------------------------------------- doors
  const isDone = (n) => !!S.doors[n];
  function state(n) {
    const d = door(n);
    if (!d) return 'locked';
    if (isDone(n)) return 'done';
    if (n === FINALE_DOOR) {
      for (let i = 1; i < FINALE_DOOR; i++) if (!isDone(i)) return 'locked';
      return 'open';
    }
    if (!d.available) return 'soon';
    if (n === 1 || isDone(n - 1)) return 'open';
    return 'locked';
  }
  function current() {
    for (const d of DOORS) if (state(d.n) === 'open') return d.n;
    return null;
  }
  const openSet = () => DOORS.filter((d) => state(d.n) === 'open').map((d) => d.n);
  const doneCount = () => Object.keys(S.doors).length;

  /** Mark door n done (idempotent: on a done door it only keeps the best stars / score). Returns true if newly done. */
  function complete(n, r = {}, { force = false } = {}) {
    n = n | 0;
    const d = door(n);
    if (!d) return false;
    const stars = Math.max(1, Math.min(3, (r && r.stars) | 0 || 1));
    const score = Number.isFinite(+r?.score) ? +r.score : 0;
    const st = state(n);
    if (st === 'done') {
      const rec = S.doors[n];
      let ch = false;
      if (stars > rec.stars) { rec.stars = stars; ch = true; }
      if (score > rec.score) { rec.score = score; ch = true; }
      if (ch) { persist(); changed({ n }); }
      return false;
    }
    if (st !== 'open' && !force) {
      console.warn(`[progress] door ${n} is ${st}; not completing it`);
      return false;
    }
    const wasCurrent = current() === n;
    const before = new Set(openSet());
    S.doors[n] = { stars, score, at: Date.now() };
    persist();
    emit('door:complete', { n, stars, score });
    if (d.reward) grant(d.reward.id);
    syncSpirit();
    for (const m of openSet()) if (!before.has(m)) emit('door:open', { n: m });
    if (wasCurrent && d.available && current() === null) emit('wave:end', { n, done: doneCount() });
    if (!silent && !quiet) { try { ctx.net?.recordDoor?.(n); } catch (e) { console.warn('[progress] net.recordDoor', e); } }
    changed({ n });
    return true;
  }

  // ---------------------------------------------------------------- festive level ↔ spirit
  const level = () => festiveLevel(doneCount());
  function syncSpirit(force = false) {
    const v = level();
    if (!game?.state) return v;
    game.state.spiritMax = SPIRIT_MAX;
    if (force || game.state.spirit !== v) {
      game.state.spirit = v;
      if (!silent) { try { game.emit?.('spirit:change', { value: v, max: SPIRIT_MAX }); } catch (e) { console.error(e); } }
    }
    return v;
  }

  // ---------------------------------------------------------------- rewards + wardrobe
  function rewardInfo(id) {
    if (REWARDS[id]) return REWARDS[id];
    const [slot, k] = String(id).split(':');
    return STYLE_OPTIONS[slot] && k in STYLE_OPTIONS[slot] ? { id, slot, key: k, label: k } : null;
  }
  function grant(id, { notify = true } = {}) {
    const info = rewardInfo(id);
    if (!info || S.rewards.includes(id)) return null;
    S.rewards.push(id);
    persist();
    if (notify) emit('reward:grant', { ...info });
    changed({ reward: id });
    return { ...info };
  }
  const rewards = {
    owned: () => [...S.rewards],
    has: (id) => S.rewards.includes(id),
    grant: (id) => grant(id),
    info: rewardInfo,
  };
  const wardrobe = {
    /** Option keys unlocked for a slot, in STYLE_OPTIONS order. Ungated slots (hair, skin, outfit …) are all unlocked. */
    unlocked(slot) {
      const all = Object.keys(STYLE_OPTIONS[slot] || {});
      if (!GATED_SLOTS.includes(slot)) return all;
      const own = new Set(DEFAULT_UNLOCKED[slot]);
      for (const id of S.rewards) { const r = rewardInfo(id); if (r && r.slot === slot) own.add(r.key); }
      return all.filter((k) => own.has(k));
    },
    isUnlocked(slot, k) { return wardrobe.unlocked(slot).includes(k); },
    /** Where an option comes from: {door, title, label} | {daily: true, label} | null (always available). */
    source(slot, k) {
      if (!GATED_SLOTS.includes(slot) || DEFAULT_UNLOCKED[slot]?.includes(k)) return null;
      const d = DOORS.find((x) => x.reward && x.reward.slot === slot && x.reward.key === k);
      if (d) return { door: d.n, title: d.title, label: d.reward.label };
      const dr = DAILY_REWARDS.find((x) => x.slot === slot && x.key === k);
      return dr ? { daily: true, label: dr.label } : null;
    },
    /** Copy of style with any locked gated key swapped for its default. */
    sanitize(style = {}) {
      const out = { ...style };
      for (const slot of GATED_SLOTS) if (out[slot] != null && !wardrobe.isUnlocked(slot, out[slot])) out[slot] = DEFAULT_STYLE[slot];
      return out;
    },
  };

  // ---------------------------------------------------------------- best scores
  function best(gameId) {
    const b = S.best[gameId];
    return b ? { score: b.score, stars: b.stars, plays: b.plays } : null;
  }
  function recordMiniGame(gameId, r) {
    if (!gameId || !r || r.quit) return;
    const b = S.best[gameId] || { score: -Infinity, stars: 0, plays: 0 };
    const score = Number.isFinite(+r.score) ? +r.score : 0;
    b.score = Math.max(b.score, score);
    b.stars = Math.max(b.stars, Math.max(0, Math.min(3, r.stars | 0)));
    b.plays = (b.plays | 0) + 1;
    S.best[gameId] = b;
    const d = doorForGame(gameId);
    if (d && S.doors[d.n] && b.stars > S.doors[d.n].stars) S.doors[d.n].stars = b.stars;
    persist();
    changed({ game: gameId });
  }

  // ---------------------------------------------------------------- daily gift
  function nextDailyReward() {
    const n = DAILY_REWARDS.length;
    for (let i = 0; i < n; i++) {
      const r = DAILY_REWARDS[(S.daily.claims + i) % n];
      if (!S.rewards.includes(r.id)) return { ...r };
    }
    return { ...DAILY_TREATS[S.daily.claims % DAILY_TREATS.length] };
  }
  const daily = {
    /** True the first time the player is here on a new local calendar day (until claimed). */
    get available() { return S.daily.last !== today(); },
    /** Consecutive days with a claimed gift (0 once a day was missed). */
    get streak() { const t = today(); return S.daily.last === t || S.daily.last === prevDay(t) ? S.daily.streak : 0; },
    get last() { return S.daily.last || null; },
    /** What the box holds right now (without opening it). */
    peek: () => nextDailyReward(),
    /** Open today's gift → reward {id, slot, key, label} (wardrobe colour or a treat) or null if already claimed today. */
    claim() {
      if (!daily.available) return null;
      const t = today();
      S.daily.streak = S.daily.last === prevDay(t) ? S.daily.streak + 1 : 1;
      S.daily.last = t;
      const reward = nextDailyReward();
      S.daily.claims++;
      if (reward.slot) grant(reward.id, { notify: false });
      persist();
      emit('daily:claim', { reward, streak: S.daily.streak });
      changed({ daily: true });
      return reward;
    },
  };

  // ---------------------------------------------------------------- profile (name + style, for "Welcome back")
  const profile = {
    get name() { return S.profile.name || ''; },
    get style() { return S.profile.style ? { ...S.profile.style } : null; },
    get returning() { return !!(S.profile.name || doneCount() || S.daily.claims); },
    set({ name, style } = {}) {
      if (typeof name === 'string') S.profile.name = name.slice(0, 24);
      if (style && typeof style === 'object') S.profile.style = { ...style };
      persist();
    },
  };

  const api = {
    get playerId() { return S.playerId; },
    doors: DOORS,
    door,
    state,
    current,
    isOpen: (n) => { const s = state(n); return s === 'open' || s === 'done'; },
    complete,
    /** Stars for a done door (best of door record and mini-game best), 0 if not done. */
    stars: (n) => { const r = S.doors[n]; if (!r) return 0; const d = door(n); const b = d?.game ? S.best[d.game] : null; return Math.max(r.stars, b ? b.stars : 0); },
    best,
    recordMiniGame,
    doneCount,
    level,
    rewards,
    wardrobe,
    daily,
    profile,
    save() { persist(); },
    /** Debug: wipe the save and start over (new playerId). */
    reset() {
      wipe(storage, key);
      S = blankSave();
      persist();
      syncSpirit(true);
      emit('progress:reset', {});
      changed({ reset: true });
    },
    /** Deep copy of the save data (debug / tests). */
    toJSON: () => JSON.parse(JSON.stringify(S)),
    _clock: null,
    _syncSpirit: syncSpirit,
  };

  // ?doors=N → doors 1..N done (quietly) for testing
  if (!opts.storage && params.has('doors')) {
    const N = Math.max(0, Math.min(23, parseInt(params.get('doors'), 10) || 0));
    quiet = true;
    for (let n = 1; n <= N; n++) if (!isDone(n)) complete(n, { stars: 1 }, { force: true });
    quiet = false;
  }

  if (!silent && game) {
    syncSpirit(true);
    // main.js wires engine.setEvening after all modules exist: announce the level again once construction is over
    queueMicrotask(() => syncSpirit(true));
    game.on?.('game:start', ({ name, style } = {}) => {
      profile.set({ name: typeof name === 'string' ? name : undefined, style: style || game.state?.style });
      syncSpirit(true);
    });
    let wasAvail = daily.available;
    setInterval(() => {
      const a = daily.available;
      if (a && !wasAvail) { emit('daily:available', {}); changed({ daily: true }); }
      wasAvail = a;
    }, 30000);
  }
  return api;
}
