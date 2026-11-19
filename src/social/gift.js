// Gifting a wardrobe piece to another player (PLAY.md §Snow & gifts). Owned by the Snow & gifts agent.
//   createGifts(ctx) → { give(personId), pieces(), register(social), actions, limit, dispose() }
// Giver: people-card "Give a gift" → picker of YOUR owned gated pieces (coat / hat / scarf; never Santa's wish gifts) →
//   net.send('gift', {g, to, r}). One pending offer at a time; no answer in 30 s = expired (toast).
// Receiver (data.to === net.id): card "<name> wants to give you a <label> · Accept / No thanks", 30 s. Accept →
//   progress.rewards.grant(r) (if not owned; else "You already have one — thanks anyway!"), toast "Gift from <name>!",
//   net.send('gift-ok', {g, to: giverId}); No / timeout → 'gift-no'. At most 3 accepted gifts a day (localStorage
//   `tinselby.gifts.v1`), one pending offer at a time (extra offers are answered 'gift-no'), r must be a real gated reward id.
//   Replies: giver gets a toast for either answer.
// Off unless W4; never throws; net / social calls are `?.`-guarded.
import { W4 } from '../net/play-flag.js';
import { GATED_SLOTS, WISH_REWARDS, REWARDS } from '../progress/doors.js';
import { STYLE_OPTIONS } from '../core/player.js';
import { ICONS, REWARD_GLYPH } from '../ui/icons.js';
import './snow.css';

const KEY = 'tinselby.gifts.v1';
const DAILY_MAX = 3;
const OFFER_MS = 30000;
const GLYPH = {
  hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c0-7 16-7 16 0z" fill="currentColor"/><rect x="3" y="16" width="18" height="4" rx="2" fill="currentColor" opacity=".75"/><circle cx="12" cy="6" r="2.6" fill="currentColor"/></svg>',
  scarf: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="7" rx="8" ry="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M13 9l4 .4 1 11-4 .3zM10 9.5l3 .3-1.5 9.5-3.6-.6z" fill="currentColor"/></svg>',
  coat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l5 3.5.6 6.5-3 .2V21H6.4v-7.8l-3-.2L4 6.5z" fill="currentColor"/></svg>',
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WISH_IDS = new Set(WISH_REWARDS.map((w) => w.id));
/** A real gated reward id that may be gifted: a known reward in coat / hat / scarf and not one of Santa's wish gifts. */
export const isGiftable = (r) => typeof r === 'string' && r.length < 40 && !WISH_IDS.has(r) && !!REWARDS[r] && GATED_SLOTS.includes(REWARDS[r].slot);

export function createGifts(ctx) {
  const dead = { give: () => false, pieces: () => [], register() {}, actions: [], limit: { left: () => 0 }, dispose() {} };
  if (!W4) return dead;
  try { return build(ctx); } catch (e) { console.warn('[gifts] disabled after a setup error:', e); return dead; }
}

function build(ctx) {
  const { game } = ctx;
  const net = () => ctx.net;
  const toast = (text, ms = 3200) => { try { game.emit('ui:toast', { text, ms }); } catch (e) { /* */ } };
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const prog = () => ctx.progress;
  const ready = () => typeof net()?.send === 'function' && !!net()?.id;
  const send = (type, data) => { try { net()?.send?.(type, data); } catch (e) { /* */ } };
  const newId = () => Math.floor(Math.random() * 1e9) + 1;

  // ---------------------------------------------------------------- daily limit (accepted gifts per local day)
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const limit = {
    used() {
      try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); return o && o.day === dayKey() ? Math.max(0, o.n | 0) : 0; } catch (e) { return 0; }
    },
    left() { return Math.max(0, DAILY_MAX - limit.used()); },
    bump() { try { localStorage.setItem(KEY, JSON.stringify({ day: dayKey(), n: limit.used() + 1 })); } catch (e) { /* private mode */ } },
  };

  // ---------------------------------------------------------------- helpers
  const label = (r) => { try { return prog()?.rewards?.info?.(r)?.label || REWARDS[r]?.label || 'gift'; } catch (e) { return 'gift'; } };
  function visual(r) {
    const info = REWARDS[r] || prog()?.rewards?.info?.(r) || {};
    const glyph = REWARD_GLYPH[r] || GLYPH[info.slot] || ICONS.gift;
    const c = STYLE_OPTIONS[info.slot]?.[info.key];
    return { icon: glyph, color: typeof c === 'string' ? c : '#b8302d' };
  }
  /** Your giftable pieces: [{ id, slot, key, label }] */
  function pieces() {
    try { return (prog()?.rewards?.owned?.() || []).filter(isGiftable).map((id) => ({ id, slot: REWARDS[id].slot, key: REWARDS[id].key, label: label(id) })); } catch (e) { return []; }
  }
  const canShow = () => {
    try {
      if (game.state.phase !== 'play' || ctx.minigames?.active || ctx.finale?.running) return false;
      return !document.body.classList.contains('tb-photo');
    } catch (e) { return false; }
  };
  const nameOf = (id, fb = 'Someone') => { try { return net()?.players?.().find((p) => p.id === id)?.name || fb; } catch (e) { return fb; } };

  // ---------------------------------------------------------------- giver: picker + pending offer
  let pendingOut = null; // { g, to, name, r, timer }
  let picker = null;
  function closePicker() { picker?.remove(); picker = null; }
  function give(who) {
    const to = who && typeof who === 'object' ? who.id : who;
    if (!to || !ready()) return false;
    if (pendingOut) { toast('Wait for your last gift to be answered first.', 2600); return false; }
    const list = pieces();
    if (!list.length) { toast('You have no spare pieces to give yet: play Advent doors to earn some!', 3600); return false; }
    openPicker(to, (who && who.name) || nameOf(to), list);
    return true;
  }
  function openPicker(to, name, list) {
    closePicker();
    const host = ctx.uiRoot;
    if (!host) return;
    picker = document.createElement('div');
    picker.className = 'sn-picker';
    picker.innerHTML = `<div class="knit-card"><h3>Give a gift to ${esc(name)}</h3><p>Pick one of your pieces. You keep yours!</p><div class="sn-grid"></div><button class="knit-btn cream" data-x>Cancel</button></div>`;
    const grid = picker.querySelector('.sn-grid');
    for (const it of list) {
      const v = visual(it.id);
      const b = document.createElement('button');
      b.className = 'sn-item';
      b.style.setProperty('--ic', v.color);
      b.innerHTML = `${v.icon}<span>${esc(it.label)}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); closePicker(); offer(to, name, it); });
      grid.appendChild(b);
    }
    picker.querySelector('[data-x]').addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); closePicker(); });
    picker.addEventListener('pointerdown', (e) => e.stopPropagation());
    picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
    host.appendChild(picker);
  }
  function offer(to, name, it) {
    if (pendingOut || !isGiftable(it.id) || !ready()) return;
    const g = newId();
    pendingOut = { g, to, name, r: it.id, timer: setTimeout(() => { if (pendingOut?.g === g) { pendingOut = null; toast(`${name} didn't answer your gift this time.`); } }, OFFER_MS + 3000) };
    send('gift', { g, to, r: it.id });
    toast(`Offered ${name} a ${it.label}.`, 2400);
  }

  // ---------------------------------------------------------------- receiver: offer card
  let layer = null, card = null; // card: { el, g, from, r, name, timer, answered }
  function ensureLayer() {
    if (layer || !ctx.uiRoot) return;
    layer = document.createElement('div');
    layer.className = 'sn-cards';
    ctx.uiRoot.appendChild(layer);
  }
  function showCard(from, name, g, r) {
    ensureLayer();
    if (!layer) return false;
    const v = visual(r), lab = label(r);
    const el = document.createElement('div');
    el.className = 'tb-card knit-card interactive gift';
    el.setAttribute('role', 'alertdialog');
    el.style.setProperty('--ms', `${OFFER_MS}ms`);
    el.innerHTML = `
      <div class="tb-card-ico" style="--ic:${v.color}">${v.icon}</div>
      <div class="tb-card-body"><div class="tb-card-kicker">A gift for you</div>
        <div class="tb-card-title">${esc(name)} wants to give you a ${esc(lab)}</div>
        <div class="sn-bar"><i></i></div></div>
      <div class="tb-card-btns"><button class="knit-btn green" data-y>Accept</button><button class="knit-btn cream" data-n>No thanks</button></div>`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelector('[data-y]').addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); answer(true); });
    el.querySelector('[data-n]').addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); answer(false); });
    layer.appendChild(el);
    card = { el, g, from, r, name, answered: false, timer: setTimeout(() => answer(false, true), OFFER_MS) };
    sfx('gift');
    return true;
  }
  function closeCard() {
    if (!card) return;
    const c = card; card = null;
    clearTimeout(c.timer);
    c.el.classList.add('out');
    setTimeout(() => c.el.remove(), 320);
  }
  function answer(yes, expired = false) {
    const c = card;
    if (!c || c.answered) return;
    c.answered = true;
    if (yes && limit.left() <= 0) { toast('That is 3 gifts today: come back tomorrow!'); yes = false; }
    if (yes) {
      let had = false;
      try { had = !!prog()?.rewards?.has?.(c.r); } catch (e) { /* */ }
      if (had) toast('You already have one — thanks anyway!', 3400);
      else {
        let ok = null;
        // a gift is not a door reward: skip the HUD's door reward card, the "Gift from …" toast says it
        try { ctx.ui?.cards?.suppressGrants?.(800); } catch (e) { /* */ }
        try { ok = prog()?.rewards?.grant?.(c.r); } catch (e) { /* */ }
        if (ok) { limit.bump(); toast(`Gift from ${c.name}!`, 3400); sfx('gift'); }
        else { toast('Something went wrong with that gift.', 2600); yes = false; }
      }
    }
    send(yes ? 'gift-ok' : 'gift-no', { g: c.g, to: c.from });
    closeCard();
  }
  // a card on screen steps aside (hidden) when a mini-game / finale / photo mode takes over, and comes back after
  function syncCard() {
    if (!layer) return;
    layer.style.display = canShow() ? '' : 'none';
    if (picker) picker.style.display = canShow() ? '' : 'none';
  }

  // ---------------------------------------------------------------- incoming messages
  const offMsg = game.on('net:msg', (m) => { try { onMsg(m || {}); } catch (e) { console.warn('[gifts]', e); } });
  function onMsg({ type, from, name, data }) {
    if (!data) return;
    const me = net()?.id;
    if (!me) return;
    if (type === 'gift') {
      if (data.to !== me || !from || from === me) return;
      const g = data.g, r = data.r;
      if (!Number.isFinite(+g) || !isGiftable(r)) return; // not a real gated reward: drop silently
      if (card || !canShow() || limit.left() <= 0) { send('gift-no', { g, to: from }); return; } // busy / in a game / 3 today
      showCard(from, name || nameOf(from), g, r);
    } else if ((type === 'gift-ok' || type === 'gift-no') && data.to === me && pendingOut && data.g === pendingOut.g) {
      const p = pendingOut; pendingOut = null; clearTimeout(p.timer);
      toast(type === 'gift-ok' ? `${p.name} accepted your ${label(p.r)}!` : `${p.name} said no thanks, that's fine!`, 3200);
    }
  }

  // ---------------------------------------------------------------- people-card registration
  const actions = [{
    id: 'gift', label: 'Give a gift', icon: ICONS.gift,
    when: () => ready(),
    run: (p) => { give(p); },
  }];
  let registered = false, waited = 0;
  function register(social) {
    if (registered || !social) return;
    registered = true;
    for (const a of actions) { try { social.addPersonAction?.(a); } catch (e) { console.warn('[gifts] addPersonAction', e); } }
  }
  const off = ctx.engine.addUpdate((dt) => {
    if (!registered) { if (ctx.social) register(ctx.social); else if ((waited += dt) > 6) registered = true; }
    syncCard();
  }, 56);

  return {
    give, pieces, register, actions, limit,
    get pending() { return pendingOut ? { ...pendingOut, timer: undefined } : null; },
    get card() { return card ? { g: card.g, from: card.from, r: card.r, name: card.name } : null; },
    dispose() { try { off?.(); offMsg?.(); } catch (e) { /* */ } clearTimeout(pendingOut?.timer); closeCard(); closePicker(); layer?.remove(); },
  };
}
