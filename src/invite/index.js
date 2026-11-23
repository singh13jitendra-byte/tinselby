// Invite welcome (card / invite links). ctx.invite = createInvite(ctx)
//   Link: /?from=Ava[&card=tree.g1.f2][&town=ABC234]
//   - the start card gets a warm line at the top: "Ava invited you to Tinselby" (+ "Ava sent you: Merry Christmas!")
//   - from / card are removed from the address bar right after start-up (town stays: src/net keeps it in step), so a
//     reload or a re-shared URL doesn't greet again
//   - after the name is entered: a "Ava is waving hello!" toast; if Ava is online in the same friends town, her doll
//     waves too. Joining the town itself is src/net's job: ?town=CODE is joined on load (initialTown), never twice.
//   - game events for analytics: 'invite:open' {hasCard, hasTown} on load, 'invite:played' on the first game:start
//   ctx.invite.data → the parsed invite (see parse.js) | null
// Secret Santa links /?town=CODE&santa=1[&from=Ava] (src/santa/link.js): see santa.js. The Secret Santa welcome replaces the
// line above (new players only), santa=1 is cleaned from the address bar too, and the join card replaces the
// "waving hello" toast (the sender's doll still waves).   ctx.invite.santa → the arrival (santa.js) | null
import './invite.css';
import { ICONS } from '../ui/icons.js';
import { parseInvite } from './parse.js';
import { parseSantaInvite, createSantaArrival } from './santa.js';

// knitted envelope with a little heart seal (stroke/fill use currentColor, like src/ui/icons.js)
const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<rect x="2.5" y="5.5" width="19" height="13.5" rx="2.4" fill="currentColor" fill-opacity=".16"/>'
  + '<path d="M3.2 6.6L12 13l8.8-6.4" stroke-dasharray="2.2 1.6"/>'
  + '<path d="M12 18.6c-2.6-1.7-3.9-3-3.9-4.4a1.8 1.8 0 0 1 3.4-.9h1a1.8 1.8 0 0 1 3.4.9c0 1.4-1.3 2.7-3.9 4.4z" fill="var(--red, #b8302d)" stroke="var(--red-dark, #8b2523)" stroke-width="1.2"/>'
  + '</svg>';

export function createInvite(ctx) {
  const { game } = ctx;
  let data = null;
  try { data = parseInvite(ctx.params); } catch (e) { data = null; }
  let santa = null;
  try { santa = createSantaArrival(ctx, parseSantaInvite(ctx.params)); } catch (e) { console.warn('[invite] santa', e); santa = null; }
  const santaOn = !!(santa && santa.active);
  const api = { data, active: !!data, welcomeEl: null, santa: santaOn ? santa : null };
  window.__invite = api; // debugging / tests
  cleanUrl();
  if (!data && !santaOn) return api;

  if (data) game.emit('invite:open', { hasCard: !!data.hasCard, hasTown: !!data.town });

  // ---- welcome line on the start / name card
  function addWelcome() {
    const card = document.querySelector('.tb-entry-card');
    if (!card || card.querySelector('.tbi-welcome')) return;
    const returning = !!card.querySelector('.tb-namebox')?.hidden; // "Welcome back, Mia!" (src/ui/entry.js)
    if (santaOn) {
      // Secret Santa link: festive welcome for new players; returning players go straight on to the join card
      santa.returning = returning;
      if (!returning && santa.addWelcome(card)) api.welcomeEl = card.querySelector('.tbi-welcome');
      return;
    }
    const box = document.createElement('div');
    box.className = 'tbi-welcome';
    box.setAttribute('role', 'status');
    const ico = document.createElement('span');
    ico.className = 'tbi-ico';
    ico.innerHTML = ENVELOPE; // static markup, no user text
    const txt = document.createElement('div');
    txt.className = 'tbi-txt';
    const l1 = document.createElement('div');
    l1.className = 'tbi-l1';
    const nm = document.createElement('b');
    nm.textContent = data.from;
    l1.append(nm, document.createTextNode(' invited you to Tinselby'));
    txt.appendChild(l1);
    if (data.hasCard) {
      const l2 = document.createElement('div');
      l2.className = 'tbi-l2';
      if (data.greetingText) {
        const q = document.createElement('span');
        q.className = 'tbi-greet';
        q.textContent = data.greetingText;
        l2.append(document.createTextNode(data.from + ' sent you: '), q);
      } else l2.textContent = data.from + ' sent you a Christmas card!';
      txt.appendChild(l2);
    }
    box.append(ico, txt);
    card.insertBefore(box, card.firstChild);
    card.closest('.tb-entry')?.classList.add('tbi-invited');
    api.welcomeEl = box;
  }
  if (game.state.phase === 'entry') addWelcome();
  else if (santaOn) santa.returning = true;

  // ---- after the name: analytics + "Ava is waving hello!"
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  function waveSender() {
    try {
      if (!data.town || ctx.net?.town?.code !== data.town) return false;
      const p = (ctx.net.players?.() || []).find((r) => sameName(r.name, data.from));
      if (!p) return false;
      return !!ctx.net.doll?.(p.id)?.emote?.('wave');
    } catch (e) { return false; }
  }
  function toast() {
    try {
      const text = `${data.from} is waving hello!`;
      if (ctx.ui?.toast) ctx.ui.toast(text, 3600); else game.emit('ui:toast', { text, ms: 3600 });
      // give our toast the knitted hand icon (toasts are plain text in src/ui/overlays.js)
      const list = document.querySelector('.tb-toasts');
      const t = list && [...list.children].reverse().find((el) => el.textContent === text);
      if (t) {
        t.classList.add('tbi-toast');
        t.textContent = '';
        const i = document.createElement('span');
        i.className = 'tbi-toast-ico';
        i.innerHTML = ICONS.hand;
        const s = document.createElement('span');
        s.textContent = text;
        t.append(i, s);
      }
    } catch (e) { /* cosmetic */ }
  }
  if (!data) return api; // Secret Santa link without ?from: santa.js does the rest
  let played = false;
  game.on('game:start', () => {
    if (played) return;
    played = true;
    api.welcomeEl = null;
    game.emit('invite:played', {});
    const free = () => game.state.phase === 'play' && !ctx.minigames?.active && !ctx.cam?.shotActive;
    // after the friends-town toast (src/social, 2.2 s) so the two don't fight for the same spot
    setTimeout(() => { if (free() && !santaOn) toast(); waveSender(); }, data.town ? 3800 : 1600);
    setTimeout(waveSender, 8000); // presence may still be syncing at the first try
  });
  return api;
}

// ---- clean URL: drop from / card / santa=1 once every module has read the start-up params (main.js builds them
// synchronously). The rest stays exactly as it was (town: src/net keeps it in step; test flags such as santa=mock).
function cleanUrl() {
  setTimeout(() => {
    try {
      const parts = location.search.replace(/^\?/, '').split('&').filter(Boolean);
      const keep = parts.filter((kv) => !/^(from|card)(=|$)/.test(kv) && kv !== 'santa=1');
      if (keep.length === parts.length) return;
      history.replaceState(history.state, '', location.pathname + (keep.length ? '?' + keep.join('&') : '') + location.hash);
    } catch (e) { /* file:// or sandboxed */ }
  }, 0);
}
