// Play streak date logic (pure, no DOM; unit-tested in logic.test.mjs with a fake clock).
//
// A "day played" = at least one door completed or one mini-game finished on that LOCAL calendar day (YYYY-MM-DD).
// streak = consecutive days played. One free "snow day" per ISO week: a single missed day does not break the streak if
// the player comes back the next day (the snow day is charged to the ISO week of the missed day). Two or more missed
// days in a row: the next play gently starts a new streak at 1. Going backwards in time (clock change, travel west
// across midnight) is ignored: it never counts, never breaks anything. Rewards are never taken away.

export const STATE_VERSION = 1;
export const SNOW_DAYS_PER_WEEK = 1;
/** Streak lengths that unlock a wardrobe piece (data in src/progress/doors.js STREAK_REWARDS). */
export const THRESHOLDS = [3, 7, 14];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;
const MS_DAY = 86400000;

/** Local calendar day of a Date as YYYY-MM-DD (the player's own time zone). */
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** True for a real calendar date string (2026-02-30 is false). */
export function isDay(s) {
  const m = typeof s === 'string' && DAY_RE.exec(s);
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
}
const utc = (day) => { const m = DAY_RE.exec(day); return Date.UTC(+m[1], +m[2] - 1, +m[3]); };
/** Whole days from a to b (b later → positive). Pure calendar maths in UTC, so DST never makes a day 23 or 25 h. */
export function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / MS_DAY); }
export function addDays(day, n) {
  const t = new Date(utc(day) + n * MS_DAY);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
/** ISO-8601 week of a day: 'YYYY-Www' (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(day) {
  const t = new Date(utc(day));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow); // the Thursday of this week decides the year
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / MS_DAY + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

export function blankState() {
  return { v: STATE_VERSION, streak: 0, best: 0, last: '', days: 0, snow: {}, claimed: [] };
}
const int = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : d);

/** Whatever was stored → a valid state (bad fields fall back to defaults; never throws). */
export function normalize(raw) {
  const s = blankState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  s.streak = int(raw.streak, 0, 100000);
  s.best = Math.max(s.streak, int(raw.best, 0, 100000));
  s.last = isDay(raw.last) ? raw.last : '';
  if (!s.last) s.streak = 0;
  s.days = int(raw.days, 0, 100000);
  if (raw.snow && typeof raw.snow === 'object' && !Array.isArray(raw.snow)) {
    for (const [k, v] of Object.entries(raw.snow)) if (WEEK_RE.test(k)) { const n = int(v, 0, 7); if (n) s.snow[k] = n; }
  }
  if (Array.isArray(raw.claimed)) s.claimed = [...new Set(raw.claimed.filter((d) => THRESHOLDS.includes(d)))].sort((a, b) => a - b);
  return s;
}

const snowUsed = (s, week) => s.snow[week] | 0;
const snowFree = (s, week) => snowUsed(s, week) < SNOW_DAYS_PER_WEEK;
/** Keep only the last ~10 weeks of snow-day bookkeeping. */
function pruneSnow(s, today) {
  const keep = new Set();
  for (let i = 0; i <= 70; i += 7) keep.add(isoWeek(addDays(today, -i)));
  for (const k of Object.keys(s.snow)) if (!keep.has(k)) delete s.snow[k];
}

/**
 * Record that the player played on `today` (YYYY-MM-DD). Pure: returns { state (new object), result }.
 * result: { counted (a new streak day), streak, prev, snowUsed (a snow day bridged yesterday's gap), reset (a broken
 * streak of ≥ 2 started over), ignored ('same-day' | 'backwards' | 'bad-date' | null), rewards: thresholds newly reached }.
 */
export function play(state, today) {
  const s = normalize(state);
  const res = { counted: false, streak: s.streak, prev: s.streak, snowUsed: false, reset: false, ignored: null, rewards: [] };
  if (!isDay(today)) { res.ignored = 'bad-date'; return { state: s, result: res }; }
  if (s.last) {
    const d = daysBetween(s.last, today);
    if (d === 0) { res.ignored = 'same-day'; return { state: s, result: res }; }
    if (d < 0) { res.ignored = 'backwards'; return { state: s, result: res }; }
    if (d === 1) s.streak += 1;
    else if (d === 2 && snowFree(s, isoWeek(addDays(s.last, 1)))) {
      const wk = isoWeek(addDays(s.last, 1)); // the missed day's week pays for it
      s.snow[wk] = snowUsed(s, wk) + 1;
      s.streak += 1;
      res.snowUsed = true;
    } else {
      res.reset = s.streak >= 2;
      s.streak = 1;
    }
  } else s.streak = 1;
  s.last = today;
  s.days += 1;
  s.best = Math.max(s.best, s.streak);
  pruneSnow(s, today);
  res.counted = true;
  res.streak = s.streak;
  res.rewards = THRESHOLDS.filter((t) => s.streak >= t && !s.claimed.includes(t));
  return { state: s, result: res };
}

/** Mark thresholds as handed out (they stay claimed for good: a later reset never takes them back). */
export function claim(state, thresholds) {
  const s = normalize(state);
  s.claimed = [...new Set([...s.claimed, ...thresholds.filter((t) => THRESHOLDS.includes(t))])].sort((a, b) => a - b);
  return s;
}

/** Seed a streak of n days ending on `today` (test hook ?streak=N). Does not claim rewards. */
export function seed(n, today) {
  const s = blankState();
  n = int(n, 0, 3650);
  if (!n || !isDay(today)) return s;
  s.streak = n; s.best = n; s.days = n; s.last = today;
  return s;
}

/**
 * How the streak looks on `today` without playing: { streak (0 when broken), alive, playedToday, atRisk (not yet played
 * today, still alive), snowPending (yesterday was missed; a free snow day will bridge it if they play today), snowLeft
 * (free snow days left in today's ISO week), best, last, next: {days, left} | null }.
 */
export function view(state, today) {
  const s = normalize(state);
  const out = { streak: 0, alive: false, playedToday: false, atRisk: false, snowPending: false, snowLeft: 0, best: s.best, last: s.last || null, next: null };
  if (!isDay(today)) return out;
  out.snowLeft = Math.max(0, SNOW_DAYS_PER_WEEK - snowUsed(s, isoWeek(today)));
  if (s.last && s.streak > 0) {
    const d = daysBetween(s.last, today);
    if (d <= 0) { out.alive = true; out.playedToday = true; } // d < 0: the clock went back; keep showing it, never nag
    else if (d === 1) { out.alive = true; out.atRisk = true; }
    else if (d === 2 && snowFree(s, isoWeek(addDays(s.last, 1)))) { out.alive = true; out.atRisk = true; out.snowPending = true; }
  }
  if (out.alive) out.streak = s.streak;
  const t = THRESHOLDS.find((x) => x > out.streak && !s.claimed.includes(x));
  if (t) out.next = { days: t, left: t - out.streak };
  return out;
}
