// Player progress (WAVE1.md §Progress): Advent doors, rewards + wardrobe unlocks, daily gift + streak, best mini-game
// scores, festive level. Persisted in localStorage `tinselby.save.v1` (see save.js). Test flags: ?reset wipes the save,
// ?doors=N marks doors 1..N done on load (quietly; N up to 23 opens the finale door).
//
// Events: door:open {n}, door:complete {n, stars, score}, reward:grant {id, slot, key, label} (door rewards only),
// daily:claim {reward, streak}, wave:end {n, done}, spirit:change {value, max} (also on load), plus the extras
// progress:change {} (anything changed: refresh UI; {house:true} when the house style was saved), progress:reset {},
// daily:available {} (a new day began mid-session), doors:new {from, to} (wave 2: a returning save is told once that more
// doors opened; `wave` in the save is the highest door it has been told about).
// Wave 3 (?w3, WAVE3.md §Progress): progress.eve (clock-driven Christmas Eve state), the test clock (?date=YYYY-MM-DD, ?eve,
// ?xmas → api._clock), date-gated door 24, post-Christmas unlock of doors 1–23, wish / finaleGift / flags / markEveWatched,
// events wish:set {id}, progress:change {eve:true}, door:open {n:24} (date flip, 30 s timer + _checkEve()).
import { STYLE_OPTIONS, DEFAULT_STYLE } from '../core/player.js';
import { DOORS, FINALE_DOOR, W3, WISH_REWARDS, door, doorForGame, DEFAULT_UNLOCKED, GATED_SLOTS, DAILY_REWARDS, DAILY_TREATS, REWARDS, festiveLevel } from './doors.js';
import { SAVE_KEY, blankSave, defaultStorage, load, store, wipe, dayKey, prevDay, cleanHouse, isWishId, FLAG_RE, MAX_FLAGS } from './save.js';

export { DOORS, REWARDS, DAILY_REWARDS, WISH_REWARDS, festiveLevel };
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
  /** Highest door number that is playable in this build (16 with ?w2, else 8); the finale door never counts. */
  const lastAvailable = () => DOORS.reduce((m, d) => (d.available && d.kind !== 'finale' && d.n > m ? d.n : m), 0);
  if (loaded.fresh) S.wave = lastAvailable(); // brand-new players never see the "new doors" card
  if (loaded.corrupt && !silent) console.warn('[progress] save was unreadable; starting fresh');

  /** Test clock from the URL (WAVE3.md §Progress): ?date=YYYY-MM-DD (noon that day), ?eve (24 Dec of the season, 18:00), ?xmas (26 Dec). Keeps ticking. */
  function paramClock() {
    let at = null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get?.('date') || '');
    if (m) at = new Date(+m[1], +m[2] - 1, +m[3], 12);
    else if (params.has?.('eve') || params.has?.('xmas')) {
      const r = new Date();
      const season = r.getMonth() >= 6 ? r.getFullYear() : r.getFullYear() - 1;
      at = params.has('eve') ? new Date(season, 11, 24, 18) : new Date(season, 11, 26, 12);
    }
    if (!at || isNaN(at.getTime())) return null;
    const t0 = Date.now(), base = at.getTime();
    return () => new Date(base + (Date.now() - t0));
  }
  const clockFromParams = opts.clock ? null : paramClock();
  const now = () => (api._clock ? api._clock() : opts.clock ? opts.clock() : clockFromParams ? clockFromParams() : new Date());
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
  // ---------------------------------------------------------------- Christmas Eve clock (wave 3)
  let eveCache = null; // recomputed when the minute changes (state() runs many times per frame)
  /** { season, day, isEve, isAfter, sleeps } for the progress clock: season = the year when the local month ≥ July, else year − 1. */
  function computeEve() {
    const d = now(), ms = d.getTime(), mk = Math.floor(ms / 60000);
    if (eveCache && eveCache.mk === mk) return eveCache.v;
    const season = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
    const day = `${season}-12-24`, t = dayKey(d);
    const sleeps = Math.max(0, Math.round((Date.UTC(season, 11, 24) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000));
    const v = Object.freeze({ season, day, isEve: t >= day, isAfter: t >= `${season}-12-25`, sleeps });
    eveCache = { mk, v };
    return v;
  }
  function state(n) {
    const d = door(n);
    if (!d) return 'locked';
    if (isDone(n)) return 'done';
    if (n === FINALE_DOOR) {
      // wave 3: opens on 24 Dec (the player's local date) once door 4 is done (the star is resting by the tree)
      if (W3) return computeEve().isEve && isDone(4) ? 'open' : 'locked';
      for (let i = 1; i < FINALE_DOOR; i++) if (!isDone(i)) return 'locked';
      return 'open';
    }
    if (!d.available) return 'soon';
    if (W3 && computeEve().isAfter) return 'open'; // from 25 Dec the one-by-one unlock is lifted
    if (n === 1 || isDone(n - 1)) return 'open';
    return 'locked';
  }
  function current() {
    if (W3 && state(FINALE_DOOR) === 'open') return FINALE_DOOR; // Christmas Eve comes first
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
      const wr = WISH_REWARDS.find((x) => x.slot === slot && x.key === k);
      if (wr) return { santa: true, label: wr.label };
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

  // ---------------------------------------------------------------- your house (wave 2, door 10)
  const house = {
    /** Saved style { wreath, lights, door, snowman } or null (never decorated). */
    get: () => (S.house ? { ...S.house } : null),
    set(style) {
      const clean = cleanHouse(style);
      if (!clean) return null;
      S.house = clean;
      persist();
      changed({ house: true });
      return { ...clean };
    },
  };

  // ---------------------------------------------------------------- wave 3: wish, Santa's gift, one-time flags
  const wish = {
    options: WISH_REWARDS,
    get: () => S.wish,
    set(id) {
      if (!isWishId(id)) return null;
      S.wish = id;
      persist();
      emit('wish:set', { id });
      changed({ wish: true });
      return id;
    },
  };
  /** Santa's gift in the finale: the wish if it isn't owned yet, else the first unowned wish piece, else null. Only once door 24 is done. */
  function finaleGift() {
    if (state(FINALE_DOOR) !== 'done') return null;
    const id = S.wish && !S.rewards.includes(S.wish) ? S.wish : WISH_REWARDS.find((r) => !S.rewards.includes(r.id))?.id;
    if (!id) return null;
    const g = grant(id, { notify: false });
    return g ? { id: g.id, slot: g.slot, key: g.key, label: g.label } : null;
  }
  const flags = {
    has: (k) => S.flags.includes(k),
    set(k) {
      if (typeof k !== 'string' || !FLAG_RE.test(k)) return false;
      if (!S.flags.includes(k)) {
        if (S.flags.length >= MAX_FLAGS) S.flags.shift();
        S.flags.push(k);
        persist();
      }
      return true;
    },
  };
  function markEveWatched() {
    S.eveWatched = Math.min(9999, (S.eveWatched | 0) + 1);
    persist();
    changed({ eveWatched: true });
    return S.eveWatched;
  }

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

  let dailyTimer = null, waveTimer = null;
  // date flips mid-session (wave 3): door 24 opening and the post-Christmas unlock are announced like a normal change
  let eveSeen = null;
  function checkEve(silentInit = false) {
    if (!W3) return;
    const k = { s24: state(FINALE_DOOR), after: computeEve().isAfter, cur: current() };
    const prev = eveSeen;
    eveSeen = k;
    if (silentInit || !prev) return;
    if (k.s24 === prev.s24 && k.after === prev.after) return;
    if (k.s24 === 'open' && prev.s24 !== 'open') emit('door:open', { n: FINALE_DOOR });
    changed({ eve: true });
  }
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
    house,
    wish,
    flags,
    finaleGift,
    markEveWatched,
    get eveWatched() { return S.eveWatched | 0; },
    /** { season, day, isEve, isAfter, sleeps } from the progress clock (WAVE3.md §Progress). */
    get eve() { return computeEve(); },
    lastAvailable,
    /** Highest door the player has been told about (doors:new fires while this is below lastAvailable()). */
    get wave() { return S.wave; },
    save() { persist(); },
    /** Debug: wipe the save and start over (new playerId). */
    reset() {
      wipe(storage, key);
      S = blankSave();
      S.wave = lastAvailable();
      persist();
      syncSpirit(true);
      emit('progress:reset', {});
      changed({ reset: true });
    },
    /** Deep copy of the save data (debug / tests). */
    toJSON: () => JSON.parse(JSON.stringify(S)),
    _clock: null,
    _syncSpirit: syncSpirit,
    _checkEve: (quiet = false) => checkEve(!!quiet),
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
    // wave 2: a returning save hears once that new doors opened (1.5 s after the game starts), then remembers it
    game.on?.('game:start', () => {
      if (S.wave >= lastAvailable() || doneCount() === 0) { if (doneCount() === 0 && S.wave < lastAvailable()) { S.wave = lastAvailable(); persist(); } return; }
      waveTimer = setTimeout(() => {
        waveTimer = null;
        const to = lastAvailable();
        if (S.wave >= to) return;
        emit('doors:new', { from: S.wave + 1, to });
        S.wave = to;
        persist();
      }, opts.newDoorsDelay ?? 1500);
    });
    let wasAvail = daily.available;
    checkEve(true); // remember the starting date state (no events)
    dailyTimer = setInterval(() => {
      const a = daily.available;
      if (a && !wasAvail) { emit('daily:available', {}); changed({ daily: true }); }
      wasAvail = a;
      checkEve();
    }, 30000);
  }
  /** Stop the timers (tests that build extra non-silent instances). */
  api._dispose = () => { clearInterval(dailyTimer); clearTimeout(waveTimer); };
  return api;
}
