// Play together: the Social UI (PLAY.md "Social UI"). Everything is gated by W4; with W4 off nothing is created or visible.
//
//   ctx.social = createSocial(ctx)
//
// What you can hook into (all safe to call when W4 is off: they just do nothing visible):
//
//   social.addPersonAction({ id, label, icon, when(person) → bool, run(person), closes? }) → remove()
//       Adds a button to the people card (tap a remote doll / name tag, or E next to someone). `icon` is a key of
//       src/ui/icons.js ICONS (or a social glyph name) or a raw '<svg…>' string. `when` is polled while the card is open.
//       The card closes after `run` unless `closes === false`. Re-registering the same id replaces it.
//       person = { id, name, x, z, dist (metres from you), ride ({k, s} | null), muted, style, doll (net.doll(id) | null) }
//
//   social.addHudButton({ id, label, icon, run(), when?() → bool, where?: 'br' | 'tr', order? }) → remove()
//       Round button in the bottom-right social stack ('br', above the emote button; default) or the top-right row
//       ('tr', before the mute button). `when` is polled ~4×/s to show/hide it. Hidden with the rest of the social HUD.
//
//   Helpers: social.free() (true when the social HUD is allowed: free play, no mini-game / ride / finale / photo / panel),
//   social.nearby(maxDist = 12) → person[] nearest first, social.person(id), social.openPerson(id), social.openInvite(),
//   social.openWheel(), social.closeAll(), social.emote(id), social.say(phraseId), social.toast(text),
//   social.rideWith(person), social.townCount() (players here incl. you), social.enabled.
//   Exports: phrases.js (PHRASE_TABS, phraseText, EMOTES, …) for anything that needs to read a phrase id.
import './social.css';
import { ICONS } from '../ui/icons.js';
import { createWheel, SOCIAL_ICONS } from './wheel.js';
import { createPeople } from './people.js';
import { createInvite } from './invite.js';
import { phraseText, isEmote } from './phrases.js';
import { W4 } from '../net/play-flag.js';
import { createSnowball } from './snowball.js';
import { createGifts } from './gift.js';


const COOLDOWN_MS = 1200;
const TALK_RANGE = 2.5; // metres: E opens the people card
const iconHTML = (ic) => (typeof ic === 'string' && ic.trim().startsWith('<') ? ic : ICONS[ic] || SOCIAL_ICONS[ic] || ICONS.hand);

export function createSocial(ctx) {
  const { game, player, cam, engine, uiRoot } = ctx;
  const S = game.state;
  const actions = [];
  const hudButtons = [];

  function addPersonAction(def) {
    if (!def || !def.id || typeof def.run !== 'function') return () => {};
    const a = { icon: 'hand', label: def.id, when: () => true, ...def };
    const i = actions.findIndex((x) => x.id === a.id);
    if (i >= 0) actions[i] = a; else actions.push(a);
    return () => { const j = actions.indexOf(a); if (j >= 0) actions.splice(j, 1); };
  }
  const api = {
    enabled: W4,
    addPersonAction,
    personActions: () => actions,
    addHudButton: (def) => (W4 ? addHudButton(def) : () => {}),
    free: () => false,
    nearby: () => [], person: () => null,
    openPerson() { return false; }, openInvite() { return false; }, openWheel() { return false; }, closeAll() {},
    emote() { return false; }, say() { return false; }, toast() {}, rideWith() {}, townCount: () => 1,
  };
  if (!W4) return api;

  // ------------------------------------------------------------------ small helpers
  const net = () => ctx.net;
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const toast = (text, ms = 2800) => { try { if (ctx.ui?.toast) ctx.ui.toast(text, ms); else game.emit('ui:toast', { text, ms }); } catch (e) { /* */ } };
  const myName = () => game.state.playerName || 'Traveller';

  /** The social HUD is allowed: free play only (not entry, mini-games, finale, rides, photo mode, cinematics or panels). */
  function free() {
    return S.phase === 'play' && player.controllable && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.finale?.running
      && !ctx.ui?.modalOpen?.() && !ctx.photo?.isOpen && !document.body.classList.contains('tb-photo')
      && !uiRoot.classList.contains('tb-house-open');
  }

  function townCount() {
    let n = 1;
    try { n = (net()?.players?.()?.length || 0) + 1; } catch (e) { /* */ }
    return Math.max(n, net()?.town?.count || 0, 1);
  }
  function person(id) {
    let p = null;
    try { p = net()?.players?.()?.find((q) => q.id === id); } catch (e) { /* */ }
    if (!p) return null;
    let doll = null;
    try { doll = net()?.doll?.(id) || null; } catch (e) { /* */ }
    const x = doll?.x ?? p.x ?? 0, z = doll?.z ?? p.z ?? 0;
    let muted = false;
    try { muted = !!net()?.isMuted?.(id); } catch (e) { /* */ }
    return { id, name: p.name || 'Friend', x, z, dist: Math.hypot(x - player.pos.x, z - player.pos.z), ride: p.ride || ctx.rides?.rideOf?.(id) || null, muted, style: p.style, doll };
  }
  function nearby(maxDist = 12) {
    let list = [];
    try { list = net()?.players?.() || []; } catch (e) { /* */ }
    return list.map((p) => person(p.id)).filter((p) => p && p.dist <= maxDist).sort((a, b) => a.dist - b.dist);
  }

  // ------------------------------------------------------------------ doing things (cooldown 1.2 s for emotes + phrases)
  let coolUntil = 0;
  const cooled = () => performance.now() >= coolUntil;
  function emote(id) {
    if (!isEmote(id) || !cooled()) return false;
    coolUntil = performance.now() + COOLDOWN_MS;
    try { player.emote?.(id); } catch (e) { /* */ }
    try { net()?.send?.('emote', { e: id }); } catch (e) { /* */ }
    return true;
  }
  function say(id) {
    const text = phraseText(id);
    if (!text || !cooled()) return false;
    coolUntil = performance.now() + COOLDOWN_MS;
    try { if (!net()?.selfBubble?.(text, 3500)) toast(`${myName()}: ${text}`, 2400); } catch (e) { /* */ }
    try { net()?.send?.('say', { p: id }); } catch (e) { /* */ }
    return true;
  }
  function waveAt(p) {
    if (p) try { player.faceTowards?.(p.x, p.z); } catch (e) { /* */ }
    if (!emote('wave')) { try { player.emote?.('wave'); } catch (e) { /* */ } } // a wave aimed at someone ignores the cooldown locally
  }
  function rideWith(p) {
    try { if (ctx.rides?.joinWith) ctx.rides.joinWith(p.id); else toast(`${p.name} is on a ride. Walk up to it to join!`); } catch (e) { console.warn('[social] rideWith', e); }
  }
  function toggleMute(p) {
    try {
      const on = !net()?.isMuted?.(p.id);
      net()?.mute?.(p.id, on);
      toast(on ? `Muted ${p.name}. You won’t see their messages.` : `Unmuted ${p.name}.`);
    } catch (e) { /* */ }
  }

  const social = Object.assign(api, {
    free, townCount, person, nearby, emote, say, waveAt, rideWith, toggleMute, toast, sfx,
    closeAll(except) {
      if (except !== 'wheel') wheel.close();
      if (except !== 'person') people.close();
      if (except !== 'invite') invite.close();
    },
    openPerson: (id) => people.open(id),
    openInvite: () => invite.open(),
    openWheel: () => wheel.open(),
  });

  // ------------------------------------------------------------------ DOM
  const root = document.createElement('div');
  root.className = 'tbs-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="tbs-corner">
      <div class="tbs-extra"></div>
      <div class="tbs-main">
        <button class="tbs-pill knit-card interactive" hidden aria-label="Friends town: open invite card"><span class="tbs-pill-ico">${ICONS.people}</span><span class="tbs-pill-txt"></span></button>
        <button class="knit-btn cream round tbs-emote-btn interactive" aria-label="Emotes and phrases">${SOCIAL_ICONS.emoji}</button>
      </div>
    </div>`;
  uiRoot.appendChild(root);
  const extra = root.querySelector('.tbs-extra'), pill = root.querySelector('.tbs-pill'), pillTxt = root.querySelector('.tbs-pill-txt');
  const emoteBtn = root.querySelector('.tbs-emote-btn');

  const wheel = createWheel(ctx, social);
  const people = createPeople(ctx, social);
  const invite = createInvite(ctx, social);

  const swallow = (b) => b.addEventListener('pointerdown', (e) => e.stopPropagation());
  const tap = (b, fn) => { swallow(b); b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }); };
  tap(emoteBtn, () => wheel.toggle());
  tap(pill, () => invite.open());

  // Friends button in the HUD's top-right row (same injection pattern as the photo button)
  const friendsBtn = document.createElement('button');
  friendsBtn.className = 'knit-btn cream round tbs-friends-btn';
  friendsBtn.setAttribute('aria-label', 'Play with friends');
  friendsBtn.title = 'Play with friends';
  friendsBtn.innerHTML = ICONS.people;
  tap(friendsBtn, () => invite.toggle());
  function injectTR(btn, before) {
    const tr = uiRoot.querySelector('.tb-hud .tb-tr');
    if (!tr) return false;
    if (btn.parentNode !== tr) tr.insertBefore(btn, before === 'mute' ? tr.querySelector('.tb-mute') : null);
    return true;
  }
  injectTR(friendsBtn, 'mute');

  /** Extra HUD buttons from other modules (see header). */
  function addHudButton(def) {
    if (!def || !def.id || typeof def.run !== 'function') return () => {};
    const old = hudButtons.find((h) => h.def.id === def.id);
    if (old) old.remove();
    const b = document.createElement('button');
    const where = def.where === 'tr' ? 'tr' : 'br';
    b.className = `knit-btn cream round tbs-xbtn tbs-x-${def.id}`;
    b.setAttribute('aria-label', def.label || def.id);
    b.title = def.label || def.id;
    b.innerHTML = iconHTML(def.icon);
    tap(b, () => { sfx('ui'); try { def.run(); } catch (e) { console.error('[social] hud button', def.id, e); } });
    const h = { def, el: b, where, order: def.order || 0, remove() { b.remove(); const i = hudButtons.indexOf(h); if (i >= 0) hudButtons.splice(i, 1); } };
    hudButtons.push(h);
    if (where === 'br') { extra.appendChild(b); sortExtra(); } else injectTR(b, 'mute');
    h.vis = null; pollButton(h);
    return h.remove;
  }
  function sortExtra() { [...hudButtons].filter((h) => h.where === 'br').sort((a, b) => a.order - b.order).forEach((h) => extra.appendChild(h.el)); }
  function pollButton(h) {
    let on = true;
    try { on = h.def.when ? !!h.def.when() : true; } catch (e) { on = false; }
    if (on !== h.vis) { h.vis = on; h.el.hidden = !on; }
  }

  // ------------------------------------------------------------------ world input: tap a doll / name tag, E near someone
  const canvas = document.getElementById('c') || engine.renderer.domElement;
  window.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas || (e.button != null && e.button > 0)) return;
    if (!free()) return;
    let id = null;
    try { id = net()?.dollAt?.(e.clientX, e.clientY) || null; } catch (err) { /* */ }
    if (id && people.open(id)) { e.stopPropagation(); e.preventDefault(); return; }
    if (people.isOpen) people.close(); // a tap elsewhere dismisses the card (and still walks)
    if (wheel.isOpen || invite.isOpen) social.closeAll();
  }, { capture: true });

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    if (k !== 'e' || !free()) return;
    if (people.isOpen) { people.close(); return; }
    const cur = ctx.interact?.current;
    if (cur && cur.enabled?.()) return; // a real interaction spot wins
    const n = nearby(TALK_RANGE)[0];
    if (n) people.open(n.id);
  });
  game.on('ui:escape', () => social.closeAll());

  // ------------------------------------------------------------------ receiving: say / emote → doll bubble / animation
  const waveSeen = new Map(); // sender id → last wave toast time
  game.on('net:msg', (m) => {
    if (!m || !m.type) return;
    const id = m.from;
    try { if (id && net()?.isMuted?.(id)) return; } catch (e) { /* */ }
    const d = m.data || {};
    if (m.type === 'say') {
      const text = phraseText(d.p);
      if (text) try { net()?.doll?.(id)?.bubble?.(text, 3500); } catch (e) { /* */ }
    } else if (m.type === 'emote') {
      if (!isEmote(d.e)) return;
      let doll = null;
      try { doll = net()?.doll?.(id) || null; doll?.emote?.(d.e); } catch (e) { /* */ }
      if (d.e === 'wave' && doll && free()) {
        const dist = Math.hypot(doll.x - player.pos.x, doll.z - player.pos.z);
        const now = performance.now();
        if (dist < 8 && now - (waveSeen.get(id) || 0) > 6000) { waveSeen.set(id, now); toast(`${m.name || 'Someone'} waved at you!`, 2400); }
      }
    }
  });

  // ------------------------------------------------------------------ per-frame sync (DOM only touched on change)
  let lastFree = null, lastPill = '', lastOn = null, slow = 0, hinted = false;
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
  engine.addUpdate((dt) => {
    const f = free();
    if (f !== lastFree) {
      lastFree = f;
      root.hidden = !f;
      if (!f) social.closeAll();
    }
    if (!f) return;
    if (!friendsBtn.isConnected) injectTR(friendsBtn, 'mute');
    people.refresh(dt);
    slow -= dt;
    if (slow > 0) return;
    slow = 0.25;
    const t = net()?.town;
    const txt = t?.code ? `${t.code} · ${townCount()} here` : '';
    if (txt !== lastPill) { lastPill = txt; pill.hidden = !txt; pillTxt.textContent = txt; }
    const on = !!t?.code;
    if (on !== lastOn) { lastOn = on; friendsBtn.classList.toggle('on', on); root.classList.toggle('tbs-in-town', on); }
    for (const h of hudButtons) pollButton(h);
    if (!hinted && !people.isOpen && nearby(3)[0]) { hinted = true; toast(coarse ? 'Tap a friend to say hi!' : 'Click a friend, or press E next to them, to say hi!', 3600); }
  }, 160);

  // arriving through an invite link / a remembered friends town: say so once
  game.on('game:start', () => {
    setTimeout(() => { const c = net()?.town?.code; if (c) toast(`You’re in friends town ${c}`, 3200); }, 2200);
  });

  // Snow & gifts plug into the people card / HUD through the hooks above (they pick up ctx.social once main.js stores it)
  if (!ctx.snowball) ctx.snowball = createSnowball(ctx);
  if (!ctx.gifts) ctx.gifts = createGifts(ctx);
  ctx.snowball.register?.(social); ctx.gifts.register?.(social);
  window.__social = social; // debugging / tests
  return social;
}
