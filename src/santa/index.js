// Secret Santa for friends towns (PHASE3.md). ctx.santa = createSanta(ctx)
//
//   santa.open() / close() → bool       the knitted sheet (free play, friends town only)
//   santa.status() → last santa_status (normalised, see api.js) | null      santa.refresh() → Promise<status|null>
//   santa.setNow(iso | ms | null)       test clock: sent as p_now (mock always; the server only for QQ… towns)
//   santa.summary() → {state, count, joined, label, badge} | null           (Friends card row / roster badge)
//   santa.peek()                        refresh if the last status is older than 15 s (cards opening)
//   santa.available                     in a friends town with a backend (mock or server)
//   santa.startFromPublic() → bool      big town: create a friends town, move there, santa_start, sheet on the invite step
//   santa.invite()                      sheet on the invite step + the share sheet straight away (Friends card row)
//   santa.join() → Promise<result|null>  santa_join from outside the sheet (src/invite arrival card); same effects as Join
//   santa.startable                     big town, a backend, sign-ups still open (the Friends card shows the row)
//   santa.promo / promoShow(force)      the one-time "Secret Santa in Tinselby!" card in the big town (state / tests)
// Growth loop: everyone sees Secret Santa. In the big town a knitted card appears once at a calm free-play moment ~50 s
// into play (max once a day, never again after starting / joining one or after 3 "Later"s; localStorage
// tinselby.santa.promo.v1; off under ?capture unless &santaCard), and the Friends card always has the row. Members of an
// open group get an "Invite friends" step: navigator.share (WhatsApp / Copy link fallback) with santaInviteLink
// (src/santa/link.js: /?town=CODE&santa=1&from=Name) and a "2 of 3 friends needed" progress line.
// Events: santa:status {state}, santa:open, santa:close; analytics events santa:started {from: public|friends} / joined /
// left / drawn {members} / gift / revealed / invite {method: share|whatsapp|copy} / card {where: public|nudge|away}
// (src/analytics). Entry points: the big-town card, the Friends card row (src/social/invite.js) and a badge in the
// "People in your town" header (src/social/roster.js). Polls santa_status every 30 s while the sheet is open and once a
// minute in the background only while in a friends town that has a group. Presents are granted once per season, town and
// player (localStorage tinselby.santa.v1). Test hooks: ?santa=mock (or ?net=local), ?santaNow=ISO, ?santaAs=<uuid> (mock).
import './santa.css';
import { W4 } from '../net/play-flag.js';
import { ICONS } from '../ui/icons.js';
import { createSantaApi } from './api.js';
import { santaInviteLink, SANTA_LINK_TITLE, SANTA_LINK_TEXT } from './link.js';
import { ownedPresents, pieceInfo, itemLabel, itemToReward, rewardToItem, isPresent, townPresent, tileHTML, ELF_POOL } from './pieces.js';

const STORE = 'tinselby.santa.v1';
const SEASON = 2026;
const POLL_OPEN_MS = 30000, POLL_INVITE_MS = 10000, POLL_BG_MS = 60000, JOIN_RECHECK_MS = 120000, PEEK_MS = 15000;
const MIN_DRAW = 3;
const PROMO = 'tinselby.santa.promo.v1';
const PROMO_AFTER = 50; // s of free play (game time) in the big town before the one-time card may appear
const PROMO_QUIET = 2; // s of nothing else on screen first
const PROMO_MAX_LATER = 3;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const SANTA_ICONS = {
  gift: ICONS.gift,
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor"/></svg>',
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  hush: svg('<path d="M12 4v16"/><circle cx="12" cy="12" r="8.5" stroke-opacity=".35"/>'),
  // same strokes as the card maker's share buttons (src/cards CARD_ICONS)
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>'),
  chat: svg('<path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z" fill="currentColor" fill-opacity=".15"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>'),
  share: svg('<path d="M4 12l16-7-6 16-3-6.5z" fill="currentColor" fill-opacity=".18"/><path d="M11 14.5L20 5"/>'),
};

function loadStore() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (o && typeof o === 'object') return { opened: o.opened || {}, nudged: o.nudged || {}, drawn: o.drawn || {}, names: o.names || {}, mine: o.mine || {} };
  } catch (e) { /* private mode */ }
  return { opened: {}, nudged: {}, drawn: {}, names: {}, mine: {} };
}
function saveStore(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* private mode */ } }
/** Big-town card memory: {day: 'YYYY-MM-DD' last shown, later: "Later" taps, stop: 1 once they started / joined one} */
function loadPromo() {
  try { const o = JSON.parse(localStorage.getItem(PROMO) || 'null'); if (o && typeof o === 'object') return { day: String(o.day || ''), later: +o.later | 0, stop: o.stop ? 1 : 0 }; } catch (e) { /* */ }
  return { day: '', later: 0, stop: 0 };
}
function savePromo(o) { try { localStorage.setItem(PROMO, JSON.stringify(o)); } catch (e) { /* private mode */ } }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** "in 28 days" / "in 5 hours" / "very soon" */
function countdown(ts, now) {
  const ms = ts - now;
  if (!(ms > 0)) return 'very soon';
  if (ms < 3600e3) return 'in under an hour';
  if (ms < 86400e3) { const h = Math.ceil(ms / 3600e3); return `in ${h} hour${h === 1 ? '' : 's'}`; }
  const d = Math.ceil(ms / 86400e3);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

const DEAD = {
  available: false, isOpen: false, open: () => false, close() {}, status: () => null, refresh: async () => null, setNow() {},
  summary: () => null, peek() {}, startable: false, startFromPublic: () => false, invite: () => false, promo: null, promoShow: () => false,
};

export function createSanta(ctx) {
  if (!W4) return { ...DEAD };
  try { return build(ctx); } catch (e) { console.warn('[santa] disabled after a setup error:', e); return { ...DEAD }; }
}

function build(ctx) {
  const { game, uiRoot, engine } = ctx;
  let nowOverride = null;
  const q = ctx.params?.get?.('santaNow');
  if (q && Number.isFinite(Date.parse(q))) nowOverride = Date.parse(q);
  const now = () => nowOverride ?? Date.now();
  const api = createSantaApi(ctx, { now: () => nowOverride });
  const social = () => ctx.social;
  const town = () => { try { return ctx.net?.town?.code || null; } catch (e) { return null; } };
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const toast = (text, ms = 3000) => { try { if (ctx.ui?.toast) ctx.ui.toast(text, ms); else game.emit('ui:toast', { text, ms }); } catch (e) { /* */ } };
  const free = () => { try { return social()?.free ? !!social().free() : game.state.phase === 'play'; } catch (e) { return false; } };
  const key = () => `${SEASON}|${town()}|${api.identity().player}`;
  const has = (id) => { try { return !!ctx.progress?.rewards?.has?.(id); } catch (e) { return false; } };

  let st = null, stTown = null, fetchedAt = -1e9, seq = 0, loading = false, lastErr = null;
  let isOpen = false, view = 'main', msg = '', busy = false, confirmDraw = false, animList = false;
  let sessionXmas = false, awayDone = false, openWhenIn = null;
  let shareFallback = typeof navigator === 'undefined' || typeof navigator.share !== 'function', copiedT = 0, justStarted = false;
  let pendingStart = null; // big town → new friends town: its code until santa_start has answered
  const pendingCards = []; // reward cards shown after the sheet closes: {id, kicker}

  // ---------------------------------------------------------------- status
  function setStatus(s, code) {
    const prev = st;
    st = s; stTown = s ? code : null;
    if (s && code) {
      // remember the groups you're in: friends towns are only remembered for 12 h, so the big town can point you back
      const o = loadStore(), k = key();
      if (s.joined && !o.mine[k]) { o.mine[k] = 1; saveStore(o); } else if (!s.joined && o.mine[k] && (s.state === 'none' || s.state === 'open')) { delete o.mine[k]; saveStore(o); }
      // santa_drawn: once per group, from the starter's device (the explicit draw or the lazy draw at close)
      if (s.is_starter && (s.state === 'drawn' || s.state === 'revealed')) {
        const o = loadStore(), k = key();
        if (!o.drawn[k]) { o.drawn[k] = 1; saveStore(o); game.emit('santa:drawn', { members: s.count }); }
      }
    }
    if (prev?.state !== s?.state || prev?.count !== s?.count || prev?.joined !== s?.joined) game.emit('santa:status', { state: s ? s.state : null, count: s ? s.count : 0 });
    if (isOpen) render();
    checkNudges();
  }
  async function refresh() {
    if (busy) return st; // an action is in flight and answers with a fresh status
    const code = town();
    if (!code || api.mode === 'off') { if (st) setStatus(null, null); return null; }
    const my = ++seq;
    loading = true;
    if (isOpen && !st) render();
    const res = await api.status();
    if (my !== seq) return st; // a newer call (or an action) answered for us
    loading = false;
    fetchedAt = performance.now();
    if (res.town !== town()) return st;
    if (res.ok) { lastErr = null; setStatus(res.status, res.town); } else { lastErr = res; if (isOpen) render(); }
    if (openWhenIn && openWhenIn === res.town) { openWhenIn = null; if (res.ok && !isOpen) open(); }
    return st;
  }

  // ---------------------------------------------------------------- DOM: sheet
  const el = document.createElement('div');
  el.className = 'tb-modal tbsa-layer interactive';
  el.hidden = true;
  el.innerHTML = `
    <div class="tbsa-panel knit-card interactive" role="dialog" aria-modal="true" aria-label="Secret Santa">
      <div class="tbsa-head">
        <div class="tb-modal-title tbsa-title"><span class="tbsa-tico">${SANTA_ICONS.gift}</span>Secret Santa</div>
        <button class="knit-btn cream round tb-modal-close tbsa-x" aria-label="Close">${SANTA_ICONS.close}</button>
      </div>
      <div class="tbsa-body"></div>
      <div class="tbsa-msg" role="status" hidden></div>
      <div class="tbsa-actions"></div>
    </div>`;
  uiRoot.appendChild(el);
  const panel = el.querySelector('.tbsa-panel'), body = el.querySelector('.tbsa-body'), msgEl = el.querySelector('.tbsa-msg'), actions = el.querySelector('.tbsa-actions');
  const stop = (e) => e.stopPropagation();
  panel.addEventListener('pointerdown', stop);
  el.addEventListener('pointerdown', (e) => { stop(e); if (e.target === el) { sfx('ui'); close(); } });
  el.addEventListener('click', (e) => {
    stop(e);
    const b = e.target.closest('button');
    if (!b || !el.contains(b) || b.disabled) return;
    if (b.classList.contains('tbsa-x')) { sfx('ui'); close(); return; }
    const a = b.dataset.act;
    if (a) onAct(a, b.dataset);
  });

  const btn = (act, label, cls = 'cream', extra = '') => `<button class="knit-btn ${cls} tbsa-b tbsa-${act}" data-act="${act}"${busy ? ' disabled' : ''} ${extra}>${label}</button>`;
  const hero = (icon, tone = 'red') => `<div class="tbsa-hero ${tone}">${icon}</div>`;
  const myJoinName = () => loadStore().names[key()] || api.myName(); // the name you joined with (per season, town, player)
  const whenLine = (text) => `<div class="tbsa-when">${SANTA_ICONS.clock}<span>${esc(text)}</span></div>`;

  function memberChips(s) {
    const me = s.joined ? myJoinName() : null;
    let meDone = false;
    return `<ul class="tbsa-members" aria-label="Who's playing">${s.members.map((n) => {
      const isMe = !meDone && me && n === me; if (isMe) meDone = true;
      const star = n === s.starter;
      return `<li class="tbsa-chip${isMe ? ' me' : ''}">${star ? `<i class="tbsa-star" title="Started it">${SANTA_ICONS.star}</i>` : ''}<span>${esc(n)}</span>${isMe ? '<em>you</em>' : ''}</li>`;
    }).join('')}</ul>`;
  }
  function picker(s) {
    const list = ownedPresents(ctx);
    const who = esc(s.my_match || 'your friend');
    if (!list.length) {
      return `<div class="tbsa-lab">A present for ${who}</div>
        <p class="tbsa-note">You haven’t unlocked any wardrobe pieces to give yet. Open Advent doors to earn some, or let the elves wrap one for you.</p>
        <div class="tbsa-row">${btn('elves', `${ICONS.gift}<span>Let the elves choose</span>`, 'green')}</div>`;
    }
    return `<div class="tbsa-lab">Pick a present for ${who} from your wardrobe</div>
      <div class="tbsa-grid" role="list">${list.map((p) => `<button class="tbsa-tile${s.my_gift === p.item ? ' on' : ''}" data-act="give" data-item="${esc(p.item)}" role="listitem" aria-pressed="${s.my_gift === p.item}"${busy ? ' disabled' : ''}>${tileHTML(p)}<span>${esc(p.label)}</span></button>`).join('')}</div>
      <p class="tbsa-fine">You keep yours too!</p>`;
  }
  /** What you received: {from, item} | null (by your name in the reveal list, or the server's my_received). */
  function received(s) {
    if (s.my_received && (s.my_received.from || s.my_received.item)) return s.my_received;
    const me = myJoinName();
    return s.gifts.find((g) => g.to === me) || null;
  }

  function viewNone(s) {
    const closed = now() >= Date.parse(s.close_at);
    let b = hero(SANTA_ICONS.gift) + '<p class="tbsa-lead">Everyone secretly gives one friend a present. Names are drawn on 20 Dec, gifts open on Christmas Day.</p>';
    let a = '';
    if (closed) {
      b += `<p class="tbsa-note">${s.cancelled ? 'Not enough friends joined before 20 Dec, so no names were drawn this year.' : 'Sign-ups closed on 20 Dec.'} See you next Christmas!</p>`;
    } else {
      b += '<p class="tbsa-fine">Needs at least 3 friends in this town.</p>';
      a = btn('start', `${ICONS.gift}<span>Start Secret Santa</span>`, 'green');
    }
    return [b, a];
  }
  /** "1 of 3 friends needed — invite 2 more" / "Ready to draw!" with three knitted stitches. */
  function progress(s) {
    const n = Math.min(s.count, MIN_DRAW), ready = s.count >= MIN_DRAW, left = MIN_DRAW - s.count;
    const dots = Array.from({ length: MIN_DRAW }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    const text = ready ? 'Ready to draw!' : `${s.count} of ${MIN_DRAW} friends needed — invite ${left} more`;
    return `<div class="tbsa-prog${ready ? ' ready' : ''}" role="status"><span class="tbsa-dots" aria-hidden="true">${dots}</span><span class="tbsa-prog-t">${esc(text)}</span></div>`;
  }
  /** The big "Invite friends" button (share sheet), or WhatsApp + Copy link where there's no share sheet. */
  function inviteRow(s) {
    const more = s.count >= MIN_DRAW;
    if (!shareFallback) return `<div class="tbsa-inv">${btn('share', `${SANTA_ICONS.share}<span>${more ? 'Invite more' : 'Invite friends'}</span>`, 'green big')}</div>`;
    return `<div class="tbsa-inv two">${btn('wa', `${SANTA_ICONS.chat}<span>WhatsApp</span>`, 'green big')}${btn('copy', `${SANTA_ICONS.link}<span>${copiedT ? 'Copied!' : 'Copy link'}</span>`, `cream big${copiedT ? ' done' : ''}`)}</div>`;
  }
  function viewOpen(s) {
    let b = whenLine(`Names drawn ${countdown(Date.parse(s.close_at), now())}`);
    if (s.joined && s.count < MIN_DRAW && (view === 'invite' || justStarted)) b += `<div class="tbsa-step"><div class="tbsa-kick">${s.is_starter ? 'You started Secret Santa!' : 'You’re in!'}</div><div class="tbsa-big">Invite your friends</div></div>`;
    else b += `<div class="tbsa-kick">${s.count} joined${s.starter ? ` · started by ${esc(s.starter)}` : ''}</div>`;
    b += memberChips(s);
    b += progress(s);
    b += inviteRow(s);
    if (s.count >= MIN_DRAW && s.is_starter) b += '<p class="tbsa-fine">You can draw names now, or they’re drawn on 20 Dec.</p>';
    else if (s.count >= MIN_DRAW) b += `<p class="tbsa-fine">Names are drawn on 20 Dec${s.starter ? `, or earlier if ${esc(s.starter)} draws them` : ''}.</p>`;
    else if (s.joined) b += '<p class="tbsa-fine">Friends who open your link walk into this town and can join in.</p>';
    else b += '<p class="tbsa-fine">Join in, then invite more friends.</p>';
    let a = '';
    if (confirmDraw && s.is_starter && s.count >= MIN_DRAW) {
      b += '<p class="tbsa-note warn">After the draw nobody else can join. Ready?</p>';
      a = btn('nodraw', 'Not yet') + btn('draw', 'Yes, draw names!', 'green');
    } else {
      a = s.joined ? btn('leave', 'Leave') : btn('join', 'Join', 'green');
      if (s.is_starter) a += btn('askdraw', 'Draw names now', 'green', s.count < MIN_DRAW ? 'disabled' : '');
    }
    return [b, a];
  }
  function viewDrawn(s) {
    const when = whenLine(`Presents open ${countdown(Date.parse(s.reveal_at), now())}`);
    if (!s.joined || !s.my_match) {
      return [when + hero(SANTA_ICONS.gift, 'green') + '<div class="tbsa-big">The names have been drawn!</div><p class="tbsa-lead">You’ll get a present from the town!</p><p class="tbsa-fine">Come back on Christmas Day to open it.</p>', ''];
    }
    let b = when + `<div class="tbsa-match"><div class="tbsa-kick">Shh! It’s a secret</div><div class="tbsa-big">You’re Secret Santa for <b>${esc(s.my_match)}</b>!</div></div>`;
    let a = '';
    if (view === 'pick' || !s.my_gift) {
      b += picker(s);
      if (s.my_gift) a = btn('back', 'Keep my present');
    } else {
      const p = pieceInfo(s.my_gift);
      b += `<div class="tbsa-gift">${tileHTML(p)}<div><div class="tbsa-lab">Your present for ${esc(s.my_match)}</div><div class="tbsa-gname">${esc(itemLabel(s.my_gift))}</div><div class="tbsa-fine">Wrapped and under the tree</div></div></div>`;
      a = btn('change', 'Change present');
    }
    return [b, a];
  }
  function giftRows(s) {
    return `<div class="tbsa-lab">Everyone’s presents</div><ol class="tbsa-list${animList ? ' anim' : ''}">${s.gifts.map((g, i) => {
      const p = pieceInfo(g.item);
      return `<li style="--i:${i}">${tileHTML(p, { small: true })}<span class="tbsa-ft"><b>${esc(g.from)}</b> <i>→</i> <b>${esc(g.to)}</b></span><span class="tbsa-it">${esc(itemLabel(g.item))}</span></li>`;
    }).join('')}</ol>`;
  }
  function viewRevealed(s) {
    const eligible = s.joined || s.late;
    const opened = loadStore().opened[key()];
    if (eligible && !opened) {
      const b = `<div class="tbsa-present"><button class="tbsa-box" data-act="unwrap" aria-label="Open your present"${busy ? ' disabled' : ''}>${SANTA_ICONS.gift}</button>
        <div class="tbsa-kick">Merry Christmas!</div><div class="tbsa-big">${s.joined ? 'A present from your Secret Santa!' : 'The town has a present for you!'}</div></div>`;
      return [b, btn('unwrap', `${ICONS.gift}<span>Open it!</span>`, 'green')];
    }
    let b = '';
    if (eligible && opened) {
      const p = opened.main ? pieceInfo(opened.main) : null;
      const from = opened.kind === 'town' ? 'From everyone in Tinselby' : `From your Secret Santa: ${opened.from || 'a friend'}`;
      const label = p ? p.label : 'A mug of hot cocoa';
      const extra = opened.extra ? pieceInfo(opened.extra) : null;
      const sub = opened.kind === 'elves' ? 'The elves wrapped this one for you.'
        : extra ? `You had one already, so the elves added a ${extra.label} too!`
          : p && opened.had ? 'You had one already: now you can wear it with pride!' : 'It’s in your wardrobe now.';
      b += `<div class="tbsa-got${animList ? ' pop' : ''}">${tileHTML(p)}<div><div class="tbsa-kick">${esc(from)}</div><div class="tbsa-big">${esc(label)}!</div><div class="tbsa-fine">${esc(sub)}</div></div></div>`;
    } else if (!eligible) {
      b += '<p class="tbsa-lead">Presents are open! Join a Secret Santa next Christmas.</p>';
    }
    b += s.gifts.length ? giftRows(s) : '<p class="tbsa-fine">No presents were swapped in this town.</p>';
    const wearId = opened && (opened.main && isPresent(opened.main) ? opened.main : null);
    const a = (wearId ? btn('wear', 'Wear it', 'green', `data-id="${esc(wearId)}"`) : '') + btn('done', 'Merry Christmas!', wearId ? 'cream' : 'green');
    return [b, a];
  }

  /** The big town: what Secret Santa is + one tap to start it with friends. */
  function viewPublic() {
    let b = hero(SANTA_ICONS.gift) + '<div class="tbsa-big">Secret Santa in Tinselby!</div><p class="tbsa-lead">Swap secret presents with your friends on Christmas Day.</p>';
    if (api.mode === 'off' || typeof ctx.net?.joinTown !== 'function') return [b + '<p class="tbsa-note">Secret Santa needs an internet connection.</p>', ''];
    if (now() >= Date.parse(api.CLOSE_AT)) return [b + '<p class="tbsa-note">Sign-ups closed on 20 Dec. See you next Christmas!</p>', ''];
    b += `<ol class="tbsa-steps"><li><b>1</b><span>Start a friends town</span></li><li><b>2</b><span>Invite ${MIN_DRAW - 1} or more friends</span></li><li><b>3</b><span>Names drawn 20 Dec, presents open 25 Dec</span></li></ol>`;
    return [b, btn('startpublic', `${ICONS.gift}<span>Start with friends</span>`, 'green')];
  }

  let lastHTML = '';
  function render() {
    if (!isOpen) return;
    let b = '', a = '';
    const s = st && stTown === town() ? st : null;
    if (!town()) [b, a] = viewPublic();
    else if (api.mode === 'off') { b = hero(SANTA_ICONS.gift) + '<p class="tbsa-lead">Secret Santa needs an internet connection.</p>'; }
    else if (!s) {
      b = (pendingStart ? '<div class="tbsa-step"><div class="tbsa-kick">Your friends town is ready</div><div class="tbsa-big">Starting Secret Santa…</div></div>' : '') + hero(SANTA_ICONS.gift) + (lastErr && !loading ? `<p class="tbsa-lead">${esc(lastErr.message)}</p>` : '<p class="tbsa-lead tbsa-wait">Checking with the North Pole…</p>');
      if (lastErr && !loading) a = btn('retry', 'Try again', 'green');
    } else if (s.state === 'none') [b, a] = viewNone(s);
    else if (s.state === 'open') [b, a] = viewOpen(s);
    else if (s.state === 'drawn') [b, a] = viewDrawn(s);
    else [b, a] = viewRevealed(s);
    const html = b + '\u0000' + a + '\u0000' + (s ? s.state : '-');
    if (html !== lastHTML) {
      lastHTML = html;
      body.innerHTML = b;
      actions.innerHTML = a;
      actions.hidden = !a;
      el.dataset.state = s ? s.state : town() ? 'loading' : 'notown';
    }
    msgEl.textContent = msg || '';
    msgEl.hidden = !msg;
  }

  // ---------------------------------------------------------------- actions
  async function act(fn, after) {
    if (busy) return null;
    busy = true; msg = ''; lastHTML = ''; render();
    const my = ++seq; loading = false;
    let res;
    try { res = await fn(); } catch (e) { res = { ok: false, message: 'Something went wrong. Please try again.' }; }
    busy = false; lastHTML = '';
    if (res.ok && res.town === town()) {
      fetchedAt = performance.now();
      if (my === seq) setStatus(res.status, res.town);
      try { after?.(res.status); } catch (e) { console.warn('[santa]', e); }
    } else if (!res.ok) {
      msg = res.message;
      if (!isOpen) toast(res.message);
      if (['already_started', 'not_open', 'full', 'too_few', 'not_starter', 'not_drawn', 'revealed', 'not_member'].includes(res.code)) refresh();
    }
    render();
    return res;
  }
  const rememberName = () => { const o = loadStore(); o.names[key()] = api.myName(); saveStore(o); };
  /** santa_join for the town you're in (the sheet's Join, and src/invite's "Join Ava's Secret Santa?" card) → result | null */
  const join = () => act(() => api.join(), () => { rememberName(); promoStop(); view = 'invite'; game.emit('santa:joined', {}); sfx('pop'); });
  function onAct(a, data) {
    sfx('ui');
    if (a === 'start') act(() => api.start(), () => { rememberName(); promoStop(); justStarted = true; view = 'invite'; game.emit('santa:started', { from: 'friends' }); sfx('gift'); });
    else if (a === 'join') join();
    else if (a === 'startpublic') startFromPublic();
    else if (a === 'share') shareInvite();
    else if (a === 'wa') whatsapp();
    else if (a === 'copy') copyLink();
    else if (a === 'leave') act(() => api.leave(), () => { game.emit('santa:left', {}); });
    else if (a === 'askdraw') { confirmDraw = true; lastHTML = ''; render(); }
    else if (a === 'nodraw') { confirmDraw = false; lastHTML = ''; render(); }
    else if (a === 'draw') { confirmDraw = false; act(() => api.draw(), () => sfx('bell')); }
    else if (a === 'give' && data.item) act(() => api.give(data.item), () => { view = 'main'; game.emit('santa:gift', {}); sfx('pop'); });
    else if (a === 'elves') {
      const pool = ELF_POOL.length ? ELF_POOL : [];
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (id) act(() => api.give(rewardToItem(id)), () => { view = 'main'; game.emit('santa:gift', {}); sfx('pop'); });
    } else if (a === 'change') { view = 'pick'; lastHTML = ''; render(); }
    else if (a === 'back') { view = 'main'; lastHTML = ''; render(); }
    else if (a === 'unwrap') unwrap();
    else if (a === 'wear' && data.id) {
      const p = pieceInfo(data.id);
      if (p) try { if (ctx.ui?.wear) ctx.ui.wear(p.slot, p.key); else ctx.player?.setStyle?.({ [p.slot]: p.key }); } catch (e) { /* */ }
      toast(`You’re wearing your ${p ? p.label : 'present'}!`, 2400);
      close();
    } else if (a === 'done') close();
    else if (a === 'invite') { close(); try { social()?.openInvite?.(); } catch (e) { /* */ } }
    else if (a === 'retry') refresh();
  }

  // ---------------------------------------------------------------- invite friends (share sheet / WhatsApp / Copy link)
  const inviteLink = () => santaInviteLink({ town: town(), name: myJoinName() });
  const shared = (method) => { try { game.emit('santa:invite', { method }); } catch (e) { /* */ } };
  const rerender = () => { lastHTML = ''; render(); };
  async function shareInvite() {
    const url = inviteLink();
    if (!url) return false;
    if (typeof navigator.share !== 'function') { shareFallback = true; rerender(); return false; }
    try {
      await navigator.share({ title: SANTA_LINK_TITLE, text: SANTA_LINK_TEXT, url });
      shared('share');
      return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false; // the player closed the share sheet
      shareFallback = true;
      msg = 'Sharing isn’t working here. Try WhatsApp or Copy link instead.';
      rerender();
      return false;
    }
  }
  function whatsapp() {
    const url = inviteLink();
    if (!url) return;
    const wa = `https://wa.me/?text=${encodeURIComponent(`${SANTA_LINK_TEXT} ${url}`)}`;
    let w = null;
    try { w = window.open(wa, '_blank', 'noopener'); } catch (e) { w = null; }
    if (!w) { // pop-up blocked (or noopener returned null): a plain link click
      try { const l = document.createElement('a'); l.href = wa; l.target = '_blank'; l.rel = 'noopener'; document.body.appendChild(l); l.click(); l.remove(); } catch (e) { /* */ }
    }
    shared('whatsapp');
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  async function copyLink() {
    const url = inviteLink();
    if (!url) return;
    if (await copyText(url)) {
      shared('copy');
      copiedT = 1; rerender();
      clearTimeout(copyLink.t);
      copyLink.t = setTimeout(() => { copiedT = 0; rerender(); }, 1800);
    } else { msg = 'Couldn’t copy here. Try WhatsApp instead.'; rerender(); }
  }
  /** The Friends card's "Invite friends to Secret Santa": the sheet on the invite step + the share sheet right away. */
  function invite() {
    if (!town()) return false;
    if (!isOpen && !open()) return false;
    view = 'invite'; rerender();
    const s = st && stTown === town() ? st : null;
    if (s && s.state === 'open') shareInvite(); // still inside the tap, so the browser allows the share sheet
    return true;
  }

  // ---------------------------------------------------------------- start from the big town (one tap)
  const startable = () => !town() && api.mode !== 'off' && typeof ctx.net?.joinTown === 'function' && typeof ctx.net?.newTownCode === 'function'
    && now() < Date.parse(api.CLOSE_AT);
  /** Create a friends town (the Friends card's flow: newTownCode + joinTown), move there, santa_start, invite step. */
  function startFromPublic() {
    if (!startable() || busy || !free()) return false;
    let code = null;
    try {
      code = ctx.net.newTownCode();
      pendingStart = code; // before joinTown: its net:town event must not reset the sheet or refresh over santa_start
      if (ctx.net.joinTown(code) === false) code = null;
    } catch (e) { code = null; }
    if (!code || town() !== code) { pendingStart = null; toast('Couldn’t make a friends town. Are you online?'); return false; }
    promoStop();
    if (!isOpen) open();
    view = 'invite'; justStarted = true; rerender();
    (async () => {
      const res = await act(() => api.start(), () => { rememberName(); game.emit('santa:started', { from: 'public' }); sfx('gift'); });
      if (pendingStart === code) pendingStart = null;
      view = 'invite'; rerender();
      if (!res && town() === code) refresh();
    })();
    return true;
  }

  // ---------------------------------------------------------------- the one-time card in the big town
  const promoOn = !(ctx.params?.has?.('capture')) || !!ctx.params?.has?.('santaCard');
  let promo = loadPromo(), promoT = 0, promoQuiet = 0, promoSession = false, promoCheckT = -1, promoOk = false;
  function promoStop() { if (!promo.stop) { promo.stop = 1; savePromo(promo); } }
  /** A Secret Santa group this season remembered on this device (started / joined one). */
  const inGroup = () => { const o = loadStore(), pre = `${SEASON}|`, post = `|${api.identity().player}`; return Object.keys(o.mine).some((k) => k.startsWith(pre) && k.endsWith(post)); };
  function promoEligible() {
    if (!promoOn || promoSession || !startable()) return false;
    promo = loadPromo();
    if (promo.stop || promo.later >= PROMO_MAX_LATER || promo.day === today()) return false;
    return !inGroup();
  }
  const vis = (sel) => { const e = uiRoot.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; };
  /** Free play with nothing else on screen: no reward / door cards, coach marks, install card, panels or interact button. */
  function calm() {
    if (!free() || isOpen || cardActive || cardQueue.length || ctx.ui?.cards?.busy) return false;
    if (ctx.ui?.modalOpen?.() || ctx.cards?.isOpen || ctx.map?.isOpen || ctx.photo?.isOpen || ctx.house?.isOpen) return false;
    if (ctx.pwa?.cardShown || ctx.pwa?.state?.pending) return false;
    return !['.tbt-call', '.tbt-help', '.tbs-invite-layer', '.tbs-roster-layer', '.tbs-wheel-layer', '.tbs-person', '.tb-hud .tb-act', '.tb-pwa-layer .tb-card'].some(vis);
  }
  function showPromo(force = false) {
    if (!force && !promoEligible()) return false;
    if (force && !startable()) return false;
    promoSession = true;
    promo = loadPromo(); promo.day = today(); savePromo(promo);
    card({
      kind: 'santa-promo', sound: 'bell', kicker: 'Secret Santa', title: 'Secret Santa in Tinselby!', sub: 'Swap secret presents with your friends on Christmas Day.',
      buttons: [{ label: 'Start with friends', cls: 'green', fn: () => startFromPublic() }, { label: 'Later', cls: 'cream', fn: () => { promo = loadPromo(); promo.later += 1; savePromo(promo); } }],
      ms: 15000, where: 'public',
    });
    return true;
  }
  engine.addUpdate((dt) => {
    if (game.state.phase !== 'play' || promoSession || !promoOn) return;
    if (town()) { promoQuiet = 0; return; }
    promoT += dt;
    if (promoT < PROMO_AFTER) return;
    const sec = Math.floor(promoT);
    if (sec !== promoCheckT) { promoCheckT = sec; promoOk = promoEligible(); } // localStorage about once a game-second
    if (!promoOk) { promoQuiet = 0; return; }
    if (calm()) { promoQuiet += dt; if (promoQuiet >= PROMO_QUIET) showPromo(); } else promoQuiet = 0;
  }, 167);

  /** Open your present (revealed): grant it once (+ a town piece when you already had it / nothing came), list animates. */
  function unwrap() {
    const s = st;
    if (!s || s.state !== 'revealed' || !(s.joined || s.late)) return;
    const o = loadStore(), k = key();
    if (o.opened[k]) { view = 'main'; lastHTML = ''; render(); return; }
    let main = null, extra = null, kind = 'santa', had = false, from = null;
    const rec = s.joined ? received(s) : null;
    if (s.joined && rec) {
      from = rec.from || null;
      const rid = itemToReward(rec.item);
      if (rid && isPresent(rid)) { main = rid; if (has(rid)) { had = true; extra = townPresent(ctx, [rid]); } }
      else { main = townPresent(ctx); kind = 'elves'; }
    } else { main = townPresent(ctx); kind = 'town'; }
    o.opened[k] = { main, extra, from, kind, had, at: Date.now() };
    saveStore(o); // the flag first: a reload can never grant twice
    try { ctx.ui?.cards?.suppressGrants?.(1500); } catch (e) { /* */ } // our own card below says who it's from
    for (const id of [main, extra]) {
      if (!id || has(id)) continue;
      let ok = null;
      try { ok = ctx.progress?.rewards?.grant?.(id); } catch (e) { ok = null; }
      if (ok) pendingCards.push({ id, kicker: id === extra ? 'From the town elves' : kind === 'town' ? 'From everyone in Tinselby' : 'From your Secret Santa' });
    }
    game.emit('santa:revealed', {});
    sfx('gift');
    animList = true; view = 'main'; lastHTML = '';
    render();
    setTimeout(() => { animList = false; }, 4000);
  }

  // ---------------------------------------------------------------- nudges + our reward cards (tb-card look, bottom centre)
  const cardsEl = document.createElement('div');
  cardsEl.className = 'tb-cards tbsa-cards';
  uiRoot.appendChild(cardsEl);
  const cardQueue = [];
  let cardActive = null;
  function card(spec) { cardQueue.push(spec); pumpCards(); }
  function pumpCards() {
    if (cardActive || !cardQueue.length || isOpen || !free() || ctx.ui?.cards?.busy) return;
    const spec = cardQueue.shift();
    const c = document.createElement('div');
    c.className = `tb-card knit-card interactive tbsa-card ${spec.kind || ''}`;
    c.setAttribute('role', 'status');
    c.innerHTML = `<div class="tb-card-ico" style="--ic:${spec.color || 'var(--red)'}">${spec.icon || SANTA_ICONS.gift}</div>
      <div class="tb-card-body"><div class="tb-card-kicker">${esc(spec.kicker || '')}</div><div class="tb-card-title">${esc(spec.title)}</div>${spec.sub ? `<div class="tb-card-sub">${esc(spec.sub)}</div>` : ''}</div>
      <div class="tb-card-btns"></div>`;
    const btns = c.querySelector('.tb-card-btns');
    let timer = 0;
    const done = () => {
      if (!c.isConnected || c.classList.contains('out')) return;
      clearTimeout(timer);
      c.classList.add('out');
      setTimeout(() => { c.remove(); if (cardActive === c) cardActive = null; pumpCards(); }, 320);
    };
    for (const b of spec.buttons || [{ label: 'OK', cls: 'green' }]) {
      const be = document.createElement('button');
      be.className = `knit-btn ${b.cls || 'cream'}`;
      be.textContent = b.label;
      be.addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); done(); try { b.fn?.(); } catch (er) { console.warn('[santa]', er); } });
      btns.appendChild(be);
    }
    c.addEventListener('pointerdown', stop);
    cardsEl.appendChild(c);
    cardActive = c;
    if (spec.sound) sfx(spec.sound);
    if (spec.where) game.emit('santa:card', { where: spec.where });
    timer = setTimeout(done, spec.ms || 10000);
  }
  function dropNudges() {
    for (let i = cardQueue.length - 1; i >= 0; i--) if (cardQueue[i].kind === 'santa-nudge') cardQueue.splice(i, 1);
    if (cardActive && cardActive.classList.contains('santa-nudge')) { const c = cardActive; cardActive = null; c.remove(); }
  }
  function rewardCard({ id, kicker }) {
    const p = pieceInfo(id);
    if (!p) return;
    card({
      kind: 'reward', icon: p.glyph, color: p.bg.startsWith('#') ? p.bg : 'var(--red)', sound: 'gift', kicker, title: `New: ${p.label}!`, sub: 'It’s in your wardrobe now.',
      buttons: [{ label: 'Wear it', cls: 'green', fn: () => { try { if (ctx.ui?.wear) ctx.ui.wear(p.slot, p.key); } catch (e) { /* */ } } }, { label: 'Later', cls: 'cream' }], ms: 9000,
    });
  }
  /** In the big town: one look per session at the groups you joined (another friends town). Points you back when you
   *  still have to pick a present, or when your present is waiting. "Go there" joins that town and opens the sheet. */
  async function awayCheck() {
    if (awayDone || town() || api.mode === 'off' || !free() || isOpen) return;
    awayDone = true;
    const o = loadStore(), me = api.identity().player, pre = `${SEASON}|`, post = `|${me}`;
    const codes = Object.keys(o.mine).filter((k) => k.startsWith(pre) && k.endsWith(post)).map((k) => k.slice(pre.length, -post.length)).filter((c) => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(c) && !o.opened[`${SEASON}|${c}|${me}`]);
    for (const code of codes.slice(-3).reverse()) {
      const res = await api.status(code);
      if (!res.ok || town()) continue;
      const s = res.status, k = `${SEASON}|${code}|${me}`;
      const go = { label: 'Go there', cls: 'green', fn: () => { openWhenIn = code; try { ctx.net?.joinTown?.(code); } catch (e) { /* */ } } };
      if (s.state === 'revealed' && (s.joined || s.late) && !o.opened[k]) {
        card({ kind: 'santa-away', sound: 'sleighBells', kicker: 'Merry Christmas!', title: 'Your Secret Santa present is waiting!', sub: `It’s in friends town ${code}.`, buttons: [go, { label: 'Later', cls: 'cream' }], ms: 12000, where: 'away' });
        return;
      }
      if (s.state === 'drawn' && s.joined && s.my_match && !s.my_gift) {
        card({ kind: 'santa-away', sound: 'bell', kicker: 'Secret Santa', title: `Pick a present for ${s.my_match}!`, sub: `In friends town ${code}, before Christmas Day.`, buttons: [go, { label: 'Later', cls: 'cream' }], ms: 12000, where: 'away' });
        return;
      }
    }
  }
  function checkNudges() {
    const s = st;
    if (!s || stTown !== town() || isOpen) return;
    const k = key();
    if (s.state === 'open' && !s.joined) {
      const o = loadStore();
      if (!o.nudged[k]) {
        o.nudged[k] = 1; saveStore(o);
        card({ kind: 'santa-nudge', sound: 'bell', kicker: 'Secret Santa', title: `${s.starter || 'A friend'} started Secret Santa here!`, sub: 'Join in to swap presents on Christmas Day.', buttons: [{ label: 'Have a look', cls: 'green', fn: () => open() }, { label: 'Later', cls: 'cream' }], where: 'nudge' });
      }
    }
    if (s.state === 'revealed' && (s.joined || s.late) && !sessionXmas && !loadStore().opened[k]) {
      sessionXmas = true;
      card({ kind: 'santa-nudge', sound: 'sleighBells', kicker: 'Merry Christmas!', title: 'Your Secret Santa present is waiting!', sub: 'Open it in the Friends card.', buttons: [{ label: 'Open it', cls: 'green', fn: () => open() }, { label: 'Later', cls: 'cream' }], ms: 12000, where: 'nudge' });
    }
  }

  // ---------------------------------------------------------------- open / close
  function open() {
    if (isOpen) return true;
    if (!free()) return false;
    try { social()?.closeAll?.(); } catch (e) { /* */ }
    isOpen = true; view = 'main'; msg = ''; confirmDraw = false; lastHTML = '';
    if (!pendingStart) justStarted = false;
    dropNudges(); // "have a look" / "present waiting" cards are answered by opening the sheet
    el.hidden = false;
    document.body.classList.add('tbsa-open');
    render();
    sfx('ui');
    if (!st || stTown !== town() || performance.now() - fetchedAt > 3000) refresh();
    game.emit('santa:open', {});
    return true;
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    el.hidden = true;
    document.body.classList.remove('tbsa-open');
    view = 'main'; confirmDraw = false;
    while (pendingCards.length) rewardCard(pendingCards.shift());
    game.emit('santa:close', {});
    setTimeout(pumpCards, 400);
  }
  game.on('ui:escape', () => close());
  for (const e of ['reward:grant', 'progress:change', 'progress:reset']) game.on(e, () => { if (isOpen) { lastHTML = ''; render(); } }); // the picker lists owned pieces
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if ((e.key || '').toLowerCase() === 'escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, { capture: true });
  // leave the sheet when something else takes over (mini-game, ride, finale, photo, a panel)
  engine.addUpdate(() => { if (isOpen && !free()) close(); }, 166);

  // ---------------------------------------------------------------- polling + triggers
  setInterval(() => {
    try {
      if (!town()) { if (st) setStatus(null, null); pumpCards(); awayCheck(); return; }
      if (typeof document !== 'undefined' && document.hidden) return;
      const t = performance.now();
      if (isOpen) { if (t - fetchedAt > (st && st.state === 'open' ? POLL_INVITE_MS : POLL_OPEN_MS)) refresh(); } // an open group: watch friends arrive
      else if (st && st.state !== 'none' && !(st.state === 'revealed' && loadStore().opened[key()]) && t - fetchedAt > POLL_BG_MS) refresh();
      checkNudges();
      pumpCards();
    } catch (e) { /* never throw */ }
  }, 5000);
  let townTimer = 0;
  let townCode = town();
  game.on('net:town', () => {
    clearTimeout(townTimer);
    const code = town();
    if (code && code === townCode) { // same town, the head count changed: someone came or went → a fresh look soon
      if (!pendingStart) townTimer = setTimeout(refresh, 1500);
      return;
    }
    townCode = code;
    if (st) setStatus(null, null);
    lastErr = null; fetchedAt = -1e9; shareFallback = typeof navigator.share !== 'function'; copiedT = 0;
    if (pendingStart && pendingStart !== code) pendingStart = null;
    if (!pendingStart) justStarted = false;
    if (code) for (let i = cardQueue.length - 1; i >= 0; i--) if (cardQueue[i].kind === 'santa-promo') cardQueue.splice(i, 1);
    if (isOpen) { lastHTML = ''; render(); }
    if (code && !pendingStart) townTimer = setTimeout(refresh, 800);
  });
  game.on('game:start', () => { if (town()) setTimeout(() => { if (performance.now() - fetchedAt > 2000) refresh(); }, 2500); else setTimeout(awayCheck, 6000); });
  game.on('net:join', () => { if (town() && (!st || st.state === 'none') && performance.now() - fetchedAt > JOIN_RECHECK_MS) refresh(); });
  if (game.state.phase === 'play' && town()) setTimeout(refresh, 1500);

  const santa = {
    open, close, refresh,
    icon: SANTA_ICONS.gift,
    get isOpen() { return isOpen; },
    get available() { return !!town() && api.mode !== 'off'; },
    get mode() { return api.mode; },
    status: () => (st && stTown === town() ? JSON.parse(JSON.stringify(st)) : null),
    setNow(v) {
      const ms = v == null ? null : typeof v === 'number' ? v : Date.parse(v);
      nowOverride = Number.isFinite(ms) ? ms : null;
      lastHTML = '';
      return refresh();
    },
    now,
    peek() { if (town() && performance.now() - fetchedAt > PEEK_MS) refresh(); },
    summary() {
      if (!town() || api.mode === 'off') return null;
      const s = st && stTown === town() ? st : null;
      if (!s) return { state: null, count: 0, joined: false, label: 'Secret Santa', badge: '' };
      const badge = s.state === 'open' ? `${s.count} joined` : s.state === 'drawn' ? (s.joined ? 'Names drawn' : 'Drawn') : s.state === 'revealed' ? 'Presents!' : 'New';
      const label = s.state === 'none' ? 'Secret Santa' : s.state === 'open' ? `Secret Santa · ${s.count}` : s.state === 'drawn' ? 'Secret Santa · drawn' : 'Secret Santa · presents!';
      return { state: s.state, count: s.count, joined: s.joined, label, badge };
    },
    get startable() { return startable(); },
    startFromPublic, invite, join,
    inviteLink: () => (town() ? inviteLink() : null),
    get promo() { return { ...loadPromo(), on: promoOn, session: promoSession, t: +promoT.toFixed(1), eligible: promoEligible(), calm: calm() }; },
    promoShow: (force = true) => showPromo(force),
    promoReset() { promo = { day: '', later: 0, stop: 0 }; savePromo(promo); promoSession = false; promoT = 0; promoQuiet = 0; promoCheckT = -1; },
    api, // tests: api.mock.reset() / dump()
    _debug: () => ({ view, busy, msg, fetchedAt, cards: cardQueue.length + (cardActive ? 1 : 0), pending: pendingCards.length }),
  };
  return santa;
}
