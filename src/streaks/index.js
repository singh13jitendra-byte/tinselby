// Play streaks: reward coming back daily, never punishing (kids and families play). ctx.streaks = createStreaks(ctx)
//
// A "day played" = a door completed (game event door:complete) or a mini-game finished, not quit (minigame:end), on the
// player's LOCAL calendar day. One free snow day per ISO week bridges a single missed day; two missed days in a row
// start a new streak at 1 on the next play, with a friendly "welcome back". 3 / 7 / 14 days unlock a wardrobe piece
// (STREAK_REWARDS in src/progress/doors.js) through progress.rewards + the usual reward card; rewards are never taken away.
// Date logic: ./logic.js (pure, node-tested in ./logic.test.mjs).
//
// Storage: localStorage `tinselby.streak.v1` (versioned JSON, every read/write guarded like src/progress/save.js).
// HUD: src/ui/hud.js shows a mitten chip next to the stats chip when chipValue() ≥ 2; tapping it calls popover(chip).
// Events: streak:day {streak, snowDayUsed}, streak:reward {days, id} (→ analytics streak_day / streak_reward).
// Tests: ?streak=N seeds a streak of N days ending today (after ?reset); ?date=YYYY-MM-DD overrides "today";
//   ctx.streaks.state() / dayPlayed(dateStr?) / reset().
import './streaks.css';
import { play, view, seed, claim, normalize, blankState, dayKey, isDay, THRESHOLDS, SNOW_DAYS_PER_WEEK } from './logic.js';
import { STREAK_REWARDS } from '../progress/doors.js';
import { defaultStorage } from '../progress/save.js';
import { MITTEN, FLAKE } from './icon.js';

export const STREAK_KEY = 'tinselby.streak.v1';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function createStreaks(ctx, opts = {}) {
  const { game } = ctx;
  const params = opts.params || ctx.params || new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const storage = opts.storage || defaultStorage();
  const fixedDay = isDay(params.get?.('date')) ? params.get('date') : null; // same test clock as progress (?date=)
  const today = () => (opts.clock ? dayKey(opts.clock()) : fixedDay || dayKey(new Date()));

  function load() {
    try { const raw = storage.getItem(STREAK_KEY); return raw ? normalize(JSON.parse(raw)) : blankState(); } catch (e) { return blankState(); }
  }
  function persist() { try { storage.setItem(STREAK_KEY, JSON.stringify(S)); } catch (e) { /* private mode / quota: keep going in memory */ } }
  const emit = (evt, d) => { try { game?.emit?.(evt, d); } catch (e) { console.error('[streaks] ' + evt, e); } };

  if (params.has?.('reset')) { try { storage.removeItem(STREAK_KEY); } catch (e) { /* */ } }
  let S = load();
  if (params.has?.('streak')) { S = seed(parseInt(params.get('streak'), 10) || 0, today()); persist(); }

  // ---------------------------------------------------------------- rewards
  const owned = (id) => { try { return !!ctx.progress?.rewards?.has?.(id); } catch (e) { return false; } };
  function giveReward(r) {
    const cards = ctx.ui?.cards;
    try { cards?.suppressGrants?.(600); } catch (e) { /* */ } // our own card below says which streak it was for
    let g = null;
    try { g = ctx.progress?.rewards?.grant?.(r.id) || null; } catch (e) { console.error('[streaks] grant', e); }
    if (!g) return false;
    try { cards?.reward?.({ ...g, kicker: `${r.days}-day streak reward` }); } catch (e) { console.error('[streaks] card', e); }
    emit('streak:reward', { days: r.days, id: r.id });
    return true;
  }

  // ---------------------------------------------------------------- a day played
  let pendingToast = null;
  function dayPlayed(dateStr) {
    const day = dateStr == null ? today() : dateStr;
    const { state, result } = play(S, day);
    if (!result.counted) return { ...result, granted: [] };
    S = state;
    // every threshold reached hands out its piece if it isn't owned yet (also catches up after a wiped save); claimed for good
    const due = STREAK_REWARDS.filter((r) => S.streak >= r.days && !owned(r.id));
    S = claim(S, THRESHOLDS.filter((t) => S.streak >= t));
    persist();
    emit('streak:day', { streak: S.streak, snowDayUsed: !!result.snowUsed });
    const granted = due.filter(giveReward).map((r) => r.days);
    if (result.reset) pendingToast = 'Welcome back! A fresh streak starts today.';
    return { ...result, granted };
  }
  game?.on?.('door:complete', () => dayPlayed());
  game?.on?.('minigame:end', (d = {}) => { if (!d?.quit) dayPlayed(); });

  // ---------------------------------------------------------------- HUD chip + popover
  /** The number on the HUD chip: the live streak when it is 2 or more, else 0 (chip hidden). */
  function chipValue() { const v = view(S, today()); return v.streak >= 2 ? v.streak : 0; }

  let pop = null, popAnchor = null, popLeft = 0; // popLeft: seconds of game time before it folds away by itself
  function closePopover() {
    window.removeEventListener('pointerdown', outside, true);
    if (!pop) return;
    const el = pop; pop = null; popAnchor = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }
  function outside(e) { if (pop && !pop.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closePopover(); }
  function lines(v) {
    const sub = v.playedToday ? 'Come back tomorrow to keep it going.'
      : v.snowPending ? 'Yesterday was a snow day. Play today to keep it going!'
      : 'Open a door or finish a game today to keep it going.';
    const extra = [];
    if (v.snowLeft > 0 && !v.snowPending) extra.push(`${FLAKE}<span>${SNOW_DAYS_PER_WEEK === 1 ? '1 snow day' : plural(v.snowLeft, 'snow day')} left this week</span>`);
    if (v.next) { const r = STREAK_REWARDS.find((x) => x.days === v.next.days); if (r) extra.push(`${MITTEN}<span>${plural(v.next.left, 'more day')} for the ${esc(r.label)}</span>`); }
    return { title: `${v.streak}-day streak!`, sub, extra };
  }
  function place() {
    if (!pop || !popAnchor) return;
    const r = popAnchor.getBoundingClientRect(), W = window.innerWidth;
    const w = pop.offsetWidth;
    const left = Math.max(8, Math.min(W - w - 8, r.left + r.width / 2 - w / 2));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(r.bottom + 9)}px`;
    pop.style.setProperty('--ax', `${Math.round(Math.max(14, Math.min(w - 14, r.left + r.width / 2 - left)))}px`);
  }
  /** Show (or, if open, close) the little "5-day streak!" card under the chip. */
  function popover(anchor) {
    if (pop) { closePopover(); return false; }
    const v = view(S, today());
    if (v.streak < 2 || !anchor) return false;
    const L = lines(v);
    pop = document.createElement('div');
    pop.className = 'tb-streak-pop knit-card interactive';
    pop.setAttribute('role', 'status');
    pop.innerHTML = `<div class="tbk-t">${esc(L.title)}</div><div class="tbk-s">${esc(L.sub)}</div>${L.extra.map((x) => `<div class="tbk-x">${x}</div>`).join('')}`;
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
    pop.addEventListener('click', (e) => { e.stopPropagation(); closePopover(); });
    (ctx.uiRoot || document.body).appendChild(pop);
    popAnchor = anchor;
    place();
    popLeft = 6;
    setTimeout(() => { if (pop) window.addEventListener('pointerdown', outside, true); }, 0);
    try { ctx.audio?.sfx?.('pop'); } catch (e) { /* */ }
    return true;
  }
  window.addEventListener('resize', () => { if (pop) place(); });
  // the popover steps away with the HUD (mini-games, panels, rides, photo mode); the gentle reset toast waits for free play
  ctx.engine?.addUpdate?.((dt) => {
    if (pop && (popLeft -= dt) <= 0) closePopover();
    if (pop && (game.state.phase !== 'play' || ctx.ui?.modalOpen?.() || !popAnchor?.isConnected || popAnchor.closest('[hidden]') || !popAnchor.offsetParent)) closePopover();
    if (pendingToast && game.state.phase === 'play' && !ctx.ui?.modalOpen?.() && !ctx.ui?.cards?.busy) {
      const t = pendingToast; pendingToast = null;
      try { ctx.ui?.toast?.(t, 3600); } catch (e) { /* */ }
    }
  }, 160);

  return {
    /** { streak (0 = none / broken), alive, playedToday, atRisk, snowPending, snowLeft, best, last, next, today, days, claimed } */
    state() { const v = view(S, today()); return { ...v, today: today(), days: S.days, claimed: [...S.claimed], raw: { ...S, snow: { ...S.snow } } }; },
    dayPlayed,
    reset() { closePopover(); S = blankState(); try { storage.removeItem(STREAK_KEY); } catch (e) { /* */ } return true; },
    chipValue,
    popover,
    closePopover,
    get popoverOpen() { return !!pop; },
    rewards: STREAK_REWARDS,
  };
}
