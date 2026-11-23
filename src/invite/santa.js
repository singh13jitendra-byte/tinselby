// Secret Santa arrival (src/invite): what a friend sees when they open  /?town=CODE&santa=1&from=Ava  (built by
// src/santa/link.js santaInviteLink). ctx.invite.santa = createSantaArrival(ctx, info)
//   - new players: a festive welcome on the start / name card ("Ava invited you to Secret Santa!")
//   - after the name (returning players: straight after Continue, no welcome): they're already in Ava's friends town
//     (src/net joins ?town on load); a knitted card "Join Ava's Secret Santa?" [Join] [Not now]
//       Join → santa_join (ctx.santa.join() if the santa module has it, else ctx.santa.api.join()), then the Secret Santa
//       sheet opens on the member list with a "You're in! N friends so far" banner (the sheet itself shows the
//       "Invite friends" step while the group has < 3)
//       drawn / revealed / cancelled / full → a friendly card instead; already a member → nothing
//   - remembered per town in localStorage `tinselby.santaInvite.v1`: pending (survives a reload before the name is
//     entered: santa / from are gone from the address bar by then), joined, dismissed, ended → no second prompt
//   - game events (src/analytics): santaInvite:open {hasFrom} on a link open, santaInvite:joined, santaInvite:dismissed
import { ICONS } from '../ui/icons.js';
import { cleanName } from '../core/names.js';
import { normTownCode } from '../net/core.js';
import { cleanCardName } from '../cards/link.js';

const STORE = 'tinselby.santaInvite.v1';
const PENDING_TTL = 14 * 86400e3, KEEP_TTL = 90 * 86400e3;
const SANTA_STORE = 'tinselby.santa.v1', SANTA_SEASON = 2026; // src/santa/index.js (its "X started Secret Santa here!" nudge)

// knitted present: wrapped box with a dashed (stitched) ribbon and a bow (stroke uses currentColor like src/ui/icons.js)
export const PRESENT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<rect x="3.5" y="9.5" width="17" height="11" rx="1.8" fill="var(--red, #b8302d)" fill-opacity=".9" stroke="var(--red-dark, #8b2523)"/>'
  + '<rect x="2.5" y="7" width="19" height="3.6" rx="1.2" fill="var(--red, #b8302d)" stroke="var(--red-dark, #8b2523)"/>'
  + '<path d="M12 7v13.5" stroke="var(--gold, #e3aa3a)" stroke-width="2.6"/>'
  + '<path d="M12 7.4v13" stroke="#fff6e4" stroke-width=".9" stroke-dasharray="1.2 1.4"/>'
  + '<path d="M5.4 13.4h4.4M14.2 16.6h4.4" stroke="#fff6e4" stroke-width="1.1" stroke-dasharray="1.2 1.5" stroke-opacity=".8"/>'
  + '<path d="M12 7C10.2 3.2 6.4 4 7.6 6.3 8.4 7.6 12 7 12 7zm0 0c1.8-3.8 5.6-3 4.4-.7C15.6 7.6 12 7 12 7z" fill="var(--gold, #e3aa3a)" stroke="#b07b1c" stroke-width="1.3"/>'
  + '</svg>';

const toParams = (search) => (search && typeof search.get === 'function' ? search : new URLSearchParams(String(search || '')));
/** search → {from (clean name | null), town} for a ?santa=1 link with a valid town code, else null. */
export function parseSantaInvite(search) {
  const p = toParams(search);
  if (p.get('santa') !== '1') return null; // ?santa=mock is the test backend, not a link
  const town = normTownCode(p.get('town') || '');
  if (!town) return null;
  const raw = p.has('from') ? cleanName(cleanCardName(p.get('from')), '').slice(0, 20) : '';
  return { from: raw || null, town };
}

function load() {
  try { const o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (o && typeof o === 'object' && o.towns && typeof o.towns === 'object') return o; } catch (e) { /* private mode */ }
  return { towns: {} };
}
function save(o) {
  const t = Date.now();
  for (const [k, v] of Object.entries(o.towns)) if (!v || typeof v !== 'object' || !(t - (+v.at || 0) < (v.s === 'pending' ? PENDING_TTL : KEEP_TTL))) delete o.towns[k];
  try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* private mode */ }
}
const getTown = (code) => { const v = load().towns[code]; return v && typeof v === 'object' ? v : null; };
function setTown(code, s, from) {
  const o = load();
  const prev = o.towns[code] || {};
  o.towns[code] = { s, from: from ?? prev.from ?? null, at: Date.now() };
  save(o);
}

/**
 * info: parseSantaInvite(ctx.params) | null. Also resumes a pending invite for the ?town in the address bar.
 * → { active, data: {from, town} | null, addWelcome(card) → bool, state(), cardEl, _debug }
 */
export function createSantaArrival(ctx, info) {
  const { game } = ctx;
  let data = null, fromLink = false;
  if (info) {
    fromLink = true;
    game.emit('santaInvite:open', { hasFrom: !!info.from });
    const prev = getTown(info.town);
    if (!prev || prev.s === 'pending') { data = { ...info, from: info.from || prev?.from || null }; setTown(info.town, 'pending', data.from); }
  } else {
    // a reload after the address bar was cleaned (name not entered yet): pick the invite back up for this town
    const code = normTownCode(ctx.params?.get?.('town') || '');
    const prev = code ? getTown(code) : null;
    if (prev && prev.s === 'pending') data = { from: prev.from ? cleanName(prev.from, '').slice(0, 20) || null : null, town: code };
  }
  const api = { active: !!data, fromLink, data, cardEl: null, addWelcome, state: () => (data ? getTown(data.town)?.s || null : null) };
  if (!data) return api;

  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const toast = (text, ms = 3000) => { try { if (ctx.ui?.toast) ctx.ui.toast(text, ms); else game.emit('ui:toast', { text, ms }); } catch (e) { /* */ } };
  const free = () => { try { return ctx.social?.free ? !!ctx.social.free() : game.state.phase === 'play'; } catch (e) { return false; } };
  const santa = () => ctx.santa || null;
  const inTown = () => { try { return ctx.net?.town?.code === data.town; } catch (e) { return false; } };
  const handled = () => { const s = getTown(data.town)?.s; return !!s && s !== 'pending'; };

  // ---- 1. welcome on the start / name card (new players; returning players skip it)
  function addWelcome(card) {
    if (!card || card.querySelector('.tbi-welcome')) return false;
    const box = document.createElement('div');
    box.className = 'tbi-welcome tbi-santa';
    box.setAttribute('role', 'status');
    const ico = document.createElement('span');
    ico.className = 'tbi-ico';
    ico.innerHTML = PRESENT; // static markup, no user text
    const txt = document.createElement('div');
    txt.className = 'tbi-txt';
    const l1 = document.createElement('div');
    l1.className = 'tbi-l1';
    if (data.from) {
      const nm = document.createElement('b');
      nm.textContent = data.from;
      l1.append(nm, document.createTextNode(' invited you to Secret Santa!'));
    } else l1.textContent = 'You’re invited to a Secret Santa!';
    const l2 = document.createElement('div');
    l2.className = 'tbi-l2';
    l2.textContent = 'Swap secret presents with friends on Christmas Day';
    txt.append(l1, l2);
    box.append(ico, txt);
    card.insertBefore(box, card.firstChild);
    card.closest('.tb-entry')?.classList.add('tbi-invited');
    return true;
  }

  // keep the santa module's own "X started Secret Santa here!" nudge quiet in this town: our card asks instead
  setTimeout(() => {
    try {
      const player = santa()?.api?.identity?.()?.player;
      if (!player) return;
      const o = JSON.parse(localStorage.getItem(SANTA_STORE) || 'null') || {};
      o.nudged = o.nudged && typeof o.nudged === 'object' ? o.nudged : {};
      const k = `${SANTA_SEASON}|${data.town}|${player}`;
      if (!o.nudged[k]) { o.nudged[k] = 1; localStorage.setItem(SANTA_STORE, JSON.stringify(o)); }
    } catch (e) { /* private mode */ }
  }, 0);

  // ---- 2. the join card (after the name)
  const layer = document.createElement('div');
  layer.className = 'tb-cards tbi-cards';
  ctx.uiRoot.appendChild(layer);
  let card = null, spec = null, busy = false, decided = false, banner = null;

  function showCard(s) {
    spec = s;
    if (card) card.remove();
    const c = document.createElement('div');
    c.className = `tb-card knit-card interactive tbi-sacard ${s.kind}`;
    c.setAttribute('role', 'dialog');
    c.setAttribute('aria-label', 'Secret Santa');
    const ico = document.createElement('div');
    ico.className = 'tb-card-ico';
    ico.style.setProperty('--ic', 'var(--red)');
    ico.innerHTML = PRESENT;
    const body = document.createElement('div');
    body.className = 'tb-card-body';
    const kick = document.createElement('div'); kick.className = 'tb-card-kicker'; kick.textContent = 'Secret Santa';
    const title = document.createElement('div'); title.className = 'tb-card-title'; title.textContent = s.title;
    body.append(kick, title);
    if (s.sub) { const sub = document.createElement('div'); sub.className = 'tb-card-sub'; sub.textContent = s.sub; body.appendChild(sub); }
    const btns = document.createElement('div');
    btns.className = 'tb-card-btns';
    for (const b of s.buttons) {
      const be = document.createElement('button');
      be.type = 'button';
      be.className = `knit-btn ${b.cls || 'cream'} tbi-b-${b.id}`;
      be.textContent = b.label;
      be.addEventListener('click', (e) => { e.stopPropagation(); if (busy || be.disabled) return; sfx('ui'); b.fn(be); });
      btns.appendChild(be);
    }
    c.append(ico, body, btns);
    c.addEventListener('pointerdown', (e) => e.stopPropagation());
    layer.appendChild(c);
    card = c; api.cardEl = c;
    c.hidden = !free();
    if (!c.hidden && s.sound) sfx(s.sound);
  }
  function hideCard() {
    const c = card;
    card = null; spec = null; api.cardEl = null;
    if (!c) return;
    c.classList.add('out');
    setTimeout(() => c.remove(), 320);
  }
  // step aside while a mini-game, ride, panel or the photo mode takes over; come back after
  setInterval(() => { if (card && !card.classList.contains('out')) { const h = !free(); if (card.hidden !== h) card.hidden = h; } }, 400);

  const who = () => (data.from ? `${data.from}’s` : 'this town’s');
  const friends = (n) => `${n} friend${n === 1 ? '' : 's'}`;
  function ended(kind, title, sub) {
    setTown(data.town, 'ended');
    decided = true;
    showCard({ kind, title, sub, buttons: [{ id: 'ok', label: 'OK', cls: 'green', fn: () => hideCard() }] });
  }
  /** Pick the card for this status (null when there's nothing to ask). */
  function decide(s) {
    if (decided || handled()) return;
    if (s.joined) { decided = true; setTown(data.town, 'joined'); return; } // already in (another device, or the Friends card)
    if (s.state === 'drawn' || s.state === 'revealed') {
      // revealed: the santa module's own "present waiting" card follows (late players get a town present)
      ended('tbi-drawn', 'Names are already drawn', s.state === 'revealed' ? 'The town has a present for you!' : 'You’ll get a present from the town!');
      return;
    }
    if (s.state !== 'open') { ended('tbi-ended', 'This Secret Santa has ended', 'Have fun exploring Tinselby with your friends!'); return; }
    if (s.count >= 16) { ended('tbi-ended', 'This Secret Santa is full', '16 friends have already joined.'); return; }
    decided = true;
    const n = s.count | 0;
    showCard({
      kind: 'tbi-join', sound: 'bell',
      title: `Join ${who()} Secret Santa?`,
      sub: n > 0 ? `Swap secret presents on Christmas Day. ${n === 1 ? '1 friend has' : `${n} friends have`} joined.` : 'Swap secret presents with friends on Christmas Day.',
      buttons: [{ id: 'join', label: 'Join', cls: 'green', fn: join }, { id: 'later', label: 'Not now', cls: 'cream', fn: dismiss }],
    });
  }

  function dismiss() {
    setTown(data.town, 'dismissed');
    game.emit('santaInvite:dismissed', {});
    hideCard();
  }
  async function join(btn) {
    const sa = santa();
    if (!sa) return;
    busy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
    let res = null;
    try {
      if (typeof sa.join === 'function') res = await sa.join(); // the santa module's own join (sheet state, name, analytics)
      else if (sa.api?.join) {
        res = await sa.api.join();
        if (res && res.ok) game.emit('santa:joined', {}); // what the sheet's Join button counts (santa_joined)
      }
    } catch (e) { res = null; }
    busy = false;
    if (!card) return;
    if (res && res.ok !== false && (res.status ? res.status.joined : true)) {
      setTown(data.town, 'joined');
      game.emit('santaInvite:joined', {});
      sfx('pop');
      hideCard();
      let st = null;
      try { st = (await sa.refresh?.()) || res.status || sa.status?.(); } catch (e) { st = res.status || null; }
      openSheet(st);
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Join'; }
    const code = res && res.code;
    if (code === 'not_open' || code === 'full') {
      decided = false;
      let st = null;
      try { st = await sa.refresh?.(); } catch (e) { /* */ }
      if (st && !st.joined && st.state === 'open' && code === 'full') { ended('tbi-ended', 'This Secret Santa is full', '16 friends have already joined.'); return; }
      if (st) { decide(st); return; }
      ended('tbi-ended', 'This Secret Santa has ended', 'Have fun exploring Tinselby with your friends!');
      return;
    }
    toast((res && res.message) || 'Couldn’t reach the North Pole. Are you online?', 3200);
  }
  function openSheet(st) {
    const sa = santa();
    let ok = false;
    try { ok = !!sa?.open?.({ view: 'invite', from: 'invite' }); } catch (e) { ok = false; }
    const n = st && st.count ? st.count : 0;
    const text = n ? `You’re in! ${friends(n)} so far` : 'You’re in!';
    if (!ok) { toast(text, 3200); return; }
    // a banner at the top of the sheet (the sheet re-renders only its body, so this stays until it closes)
    try {
      const panel = document.querySelector('.tbsa-panel');
      const head = panel && panel.querySelector('.tbsa-head');
      if (!panel || panel.querySelector('.tbi-sa-banner') || panel.querySelector('.tbsa-step')) return; // the sheet's own "You're in!" step
      banner = document.createElement('div');
      banner.className = 'tbi-sa-banner';
      banner.setAttribute('role', 'status');
      const i = document.createElement('span'); i.className = 'tbi-sa-bico'; i.innerHTML = ICONS.check || PRESENT;
      const t = document.createElement('span'); t.textContent = text;
      banner.append(i, t);
      if (head && head.nextSibling) panel.insertBefore(banner, head.nextSibling); else panel.appendChild(banner);
    } catch (e) { /* cosmetic */ }
  }
  game.on('santa:close', () => { if (banner) { banner.remove(); banner = null; } });

  // after the name: wait to be in the link's town (src/net joined it on load), ask santa_status, then show a card
  let started = false;
  async function arrive() {
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      if (decided || handled()) return;
      const sa = santa();
      if (sa && inTown() && free() && !ctx.ui?.cards?.busy && !document.querySelector('.tbsa-cards > .tb-card')) {
        let st = null;
        try { st = await sa.refresh?.(); } catch (e) { st = null; }
        if (st && inTown()) { decide(st); return; }
        await new Promise((r) => setTimeout(r, 2500)); // no answer yet: don't hammer the server
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    // not in the town (full → the big town) or no answer: leave it pending, the Friends card still has Secret Santa
  }
  game.on('game:start', () => {
    if (started) return;
    started = true;
    setTimeout(arrive, api.returning ? 500 : 1200);
  });

  api._debug = () => ({ decided, busy, spec: spec ? spec.kind : null, state: api.state() });
  return api;
}
