// Voice budget shared by the music and the sound effects (one per AudioContext).
// Every oscillator / buffer source registers its [start, end) span; callers ask `room()` before scheduling
// optional voices so a busy scene can't push a phone's audio thread into underruns (heard as crackle/chirps).
const pools = new WeakMap();

function pool(ac) {
  let p = pools.get(ac);
  if (!p) { p = { spans: [], cap: 96, peak: 0, lite: false }; pools.set(ac, p); }
  return p;
}

/** Set the source budget for this context (mobile ≈ 40, desktop ≈ 96); `lite` = cheaper voice recipes. */
export function setBudget(ac, cap, lite) { const p = pool(ac); p.cap = cap; if (lite !== undefined) p.lite = !!lite; }
export function isLite(ac) { return pool(ac).lite; }
export function budget(ac) { return pool(ac).cap; }

/** Register `n` sources sounding from `start` to `end` (AudioContext seconds). */
export function track(ac, start, end, n = 1) {
  const p = pool(ac);
  for (let i = 0; i < n; i++) p.spans.push(start, end);
  if (p.spans.length > 1200) prune(ac, p);
}

function prune(ac, p) {
  const now = ac.currentTime, s = p.spans;
  let w = 0;
  for (let r = 0; r < s.length; r += 2) if (s[r + 1] > now) { s[w++] = s[r]; s[w++] = s[r + 1]; }
  s.length = w;
}

/** Sources that will be sounding around time t (default: now). */
export function load(ac, t = ac.currentTime) {
  const p = pool(ac); prune(ac, p);
  const s = p.spans, hi = t + 0.05;
  let n = 0;
  for (let r = 0; r < s.length; r += 2) if (s[r] <= hi && s[r + 1] > t) n++;
  if (n > p.peak) p.peak = n;
  return n;
}

/** True if `need` more sources fit under `frac` of the budget at time t. */
export function room(ac, t, need = 1, frac = 1) { return load(ac, t) + need <= pool(ac).cap * frac; }

/** Debug: { load, peak, cap }. */
export function voiceStats(ac) { const n = load(ac); const p = pool(ac); return { load: n, peak: p.peak, cap: p.cap }; }
