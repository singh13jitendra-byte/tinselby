// Reward / daily-gift / wave-end cards (queued, one at a time, only during free play) and tiny net join/leave toasts.
import { ICONS, REWARD_GLYPH } from './icons.js';
import { W3 } from '../progress/doors.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GLYPH = {
  hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c0-7 16-7 16 0z" fill="currentColor"/><rect x="3" y="16" width="18" height="4" rx="2" fill="currentColor" opacity=".75"/><circle cx="12" cy="6" r="2.6" fill="currentColor"/></svg>',
  scarf: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="7" rx="8" ry="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M13 9l4 .4 1 11-4 .3zM10 9.5l3 .3-1.5 9.5-3.6-.6z" fill="currentColor"/></svg>',
  coat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l5 3.5.6 6.5-3 .2V21H6.4v-7.8l-3-.2L4 6.5z" fill="currentColor"/></svg>',
};

export function createCards(ctx, data, { wear, tint, modalOpen, onShowDoors }) {
  const { game } = ctx;
  const layer = document.createElement('div');
  layer.className = 'tb-cards';
  const net = document.createElement('div');
  net.className = 'tb-nettoasts';
  ctx.uiRoot.append(layer, net);
  const queue = [];
  let active = null;
  let suppressGrants = 0; // timestamp until which reward:grant is folded into another card
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const canShow = () => game.state.phase === 'play' && !modalOpen();

  /** spec: { kind, icon (html), iconColor, kicker, title, sub, buttons: [{label, cls, fn}], ms } */
  function push(spec) { queue.push(spec); pump(); }
  // a card already on screen steps aside when a mini-game, the finale or a panel takes over, and comes back later
  function park() {
    if (!active || canShow() || active.classList.contains('out')) return;
    const a = active; active = null;
    clearTimeout(a._timer);
    a.remove();
    queue.unshift(a._spec);
  }
  function pump() {
    if (active || !queue.length || !canShow()) return;
    const spec = queue.shift();
    const el = document.createElement('div');
    el.className = `tb-card knit-card interactive ${spec.kind || ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="tb-card-ico" style="--ic:${spec.iconColor || 'var(--gold)'}">${spec.icon || ICONS.gift}</div>
      <div class="tb-card-body">
        ${spec.kicker ? `<div class="tb-card-kicker">${esc(spec.kicker)}</div>` : ''}
        <div class="tb-card-title">${esc(spec.title)}</div>
        ${spec.sub ? `<div class="tb-card-sub">${esc(spec.sub)}</div>` : ''}
      </div>
      <div class="tb-card-btns"></div>`;
    const btns = el.querySelector('.tb-card-btns');
    const close = () => {
      if (!el.isConnected || el.classList.contains('out')) return;
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => { el.remove(); if (active === el) active = null; pump(); }, 320);
      spec.onClose?.();
    };
    for (const b of spec.buttons || [{ label: 'OK', cls: 'green' }]) {
      const be = document.createElement('button');
      be.className = `knit-btn ${b.cls || 'cream'}`;
      be.textContent = b.label;
      be.addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); try { b.fn?.(); } catch (er) { console.error(er); } close(); });
      btns.appendChild(be);
    }
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    layer.appendChild(el);
    active = el;
    if (spec.sound) sfx(spec.sound);
    const timer = spec.ms ? setTimeout(close, spec.ms) : 0;
    el._spec = spec; el._timer = timer;
  }

  function rewardIcon(r) {
    if (r && REWARD_GLYPH[`${r.slot}:${r.key}`]) return { icon: REWARD_GLYPH[`${r.slot}:${r.key}`], iconColor: tint(r.slot, r.key) };
    if (r && GLYPH[r.slot]) return { icon: GLYPH[r.slot], iconColor: tint(r.slot, r.key) };
    return { icon: ICONS.gift, iconColor: 'var(--red)' };
  }
  const wearable = (r) => r && r.slot && r.key;

  // ---- reward card ("New: Santa hat!")
  function reward(r) {
    if (!r) return;
    const door = data.doors().find((d) => d?.reward && ((r.id && d.reward.id === r.id) || (d.reward.slot === r.slot && d.reward.key === r.key)));
    const label = r.label || (wearable(r) ? data.rewardLabel(r.slot, r.key) : 'A little surprise');
    push({
      kind: 'reward', ...rewardIcon(r), sound: 'gift',
      kicker: door ? `Door ${door.n} reward` : 'A present for you',
      title: `New: ${label}!`,
      sub: wearable(r) ? 'It’s in your wardrobe now.' : '',
      buttons: wearable(r) ? [{ label: 'Wear it', cls: 'green', fn: () => wear(r.slot, r.key) }, { label: 'Later', cls: 'cream' }] : [{ label: 'Yay!', cls: 'green' }],
      ms: 8000,
    });
  }
  // ---- daily gift card
  function daily({ reward: r, streak } = {}) {
    const label = r ? r.label || (wearable(r) ? data.rewardLabel(r.slot, r.key) : '') : '';
    push({
      kind: 'daily', ...rewardIcon(wearable(r) ? r : null), sound: 'task',
      kicker: streak > 1 ? `Daily gift · ${streak}-day streak!` : 'Daily gift',
      title: label ? (wearable(r) ? `New: ${label}!` : `${label}!`) : 'A cosy hello from Tinselby!',
      sub: wearable(r) ? 'Come back tomorrow for another gift.' : 'Come back tomorrow for another gift.',
      buttons: wearable(r) ? [{ label: 'Wear it', cls: 'green', fn: () => wear(r.slot, r.key) }, { label: 'Thanks!', cls: 'cream' }] : [{ label: 'Thanks!', cls: 'green' }],
      ms: 9000,
    });
  }
  // ---- wave-end teaser (copy by the last available door: wave 1 = 8, wave 2 = 16)
  let waveShown = false;
  const lookUp = () => setTimeout(() => { try { ctx.teasers?.sky?.(); } catch (e) { /* */ } }, 250);
  const eve = () => (data.eve ? data.eve() : (ctx.progress?.eve || { isEve: false, isAfter: false, sleeps: 0 }));
  const sleeps = (k) => (data.sleepsText ? data.sleepsText(k) : k === 1 ? '1 sleep' : `${k} sleeps`);
  const pname = () => game.state.playerName || 'friend';
  const flags = {
    has: (k) => { try { return !!ctx.progress?.flags?.has?.(k); } catch (e) { return false; } },
    set: (k) => { try { ctx.progress?.flags?.set?.(k); } catch (e) { /* */ } },
  };
  const lookUpW3 = () => setTimeout(() => { try { if (ctx.finale?.preview) ctx.finale.preview(); else ctx.teasers?.sky?.(); } catch (e) { /* */ } }, 250);
  function waveEnd() {
    if (waveShown) return;
    const last = data.lastAvailable();
    if (W3 && data.state(24) === 'done') { waveShown = true; return; } // the finale has been played: no end card
    if (W3 && last >= 23) {
      const e = eve();
      // on Christmas Eve itself the Christmas Eve card takes over (door 24 is open or waiting for the star)
      if (e.isEve && !e.isAfter) { waveShown = true; eveCard(true); return; }
      waveShown = true;
      if (e.isAfter) {
        flags.set('xmas-card');
        push({ kind: 'wave xmas', icon: ICONS.tree, iconColor: 'var(--green)', sound: 'sleighBells', kicker: data.state(24) === 'done' ? 'Every Advent door is open!' : 'Merry Christmas!', title: `Merry Christmas, ${pname()}!`, sub: data.state(24) === 'done' ? 'Play any door again, any time you like.' : 'Door 24 is still waiting at the big tree.', buttons: [{ label: 'Thank you!', cls: 'green' }] });
        return;
      }
      push({
        kind: 'wave', icon: ICONS.sleigh, iconColor: 'var(--red)', sound: 'sleighBells',
        kicker: 'All 23 doors opened!',
        title: 'Santa’s sleigh is nearly here…',
        sub: `Christmas Eve opens on 24 December: ${sleeps(e.sleeps)} to go!`,
        buttons: [{ label: 'Look up!', cls: 'green', fn: lookUpW3 }, { label: 'Later', cls: 'cream' }],
      });
      return;
    }
    waveShown = true;
    const w2 = last > 8;
    push({
      kind: 'wave', icon: w2 ? ICONS.bell : ICONS.sleigh, iconColor: 'var(--red)', sound: 'sleighBells',
      kicker: `All ${last} doors opened!`,
      title: w2 ? 'Clover is resting and the sleigh bells are ringing…' : 'Santa’s sleigh has been spotted over Tinselby…',
      sub: w2 ? `…doors ${last + 1}–24 open soon, in time for Christmas Eve!` : '…new doors are coming soon!',
      buttons: [{ label: 'Look up!', cls: 'green', fn: lookUp }],
    });
  }
  // ---- Christmas Eve card (door 24 open; or waiting for the star) + the post-Christmas card; both once per save (progress flags)
  let eveQueued = false;
  function eveCard(force) {
    if (!W3 || game.state.phase === 'entry') return;
    const e = eve();
    if (!e.isEve || e.isAfter || data.state(24) === 'done') return;
    const open = data.state(24) === 'open';
    if (open && flags.has('eve-card') && !force) return;
    if (eveQueued) return;
    eveQueued = true;
    const cur = data.current();
    push({
      kind: 'eve', icon: ICONS.star, iconColor: 'var(--gold)', sound: 'bell',
      kicker: 'Christmas Eve',
      title: 'Santa is on his way to Tinselby!',
      sub: open ? 'Meet Mayor Tinsel at the big tree' : 'Help Bram bring the star to the big tree first',
      buttons: [{ label: 'Show me', cls: 'green', fn: () => { try { if (open) ctx.tasks?.focusDoor?.(24); else if (cur) onShowDoors?.(cur, cur); } catch (er) { /* */ } } }, { label: 'Later', cls: 'cream' }],
      onClose: () => { eveQueued = false; if (open) flags.set('eve-card'); },
    });
  }
  function xmasCard() {
    if (!W3 || game.state.phase === 'entry' || !eve().isAfter || flags.has('xmas-card') || waveShown && flags.has('xmas-card')) return;
    flags.set('xmas-card');
    const all = data.state(24) === 'done'; // door 24 still unplayed: nudge to it instead of claiming everything is done
    push({ kind: 'xmas', icon: ICONS.tree, iconColor: 'var(--green)', sound: 'sleighBells', kicker: 'Merry Christmas', title: `Merry Christmas, ${pname()}!`, sub: all ? 'Every Advent door is open: play them again any time.' : 'Door 24 is still waiting: meet Mayor Tinsel at the big tree.', buttons: all ? [{ label: 'Thank you!', cls: 'green' }] : [{ label: 'Show me', cls: 'green', fn: () => { try { ctx.tasks?.focusDoor?.(24); } catch (er) { /* */ } } }, { label: 'Later', cls: 'cream' }] });
  }
  const checkSeasonal = () => { eveCard(false); xmasCard(); };
  game.on('game:start', () => setTimeout(checkSeasonal, 2500));
  game.on('door:open', ({ n } = {}) => { if (n === 24) setTimeout(() => eveCard(false), 1200); });
  game.on('door:complete', ({ n } = {}) => { if (n === 4) setTimeout(() => eveCard(false), 1800); });
  game.on('progress:change', (d) => { if (d && d.eve) setTimeout(checkSeasonal, 800); });
  // ---- "New Advent doors are open!" for returning players (progress emits doors:new once per save per wave)
  let newDoorsKey = '';
  function doorsNew({ from, to } = {}) {
    if (!(from >= 1 && to >= from)) return;
    const key = `${from}-${to}`;
    if (key === newDoorsKey) return;
    newDoorsKey = key;
    push({
      kind: 'newdoors', icon: ICONS.calendar, iconColor: 'var(--gold)', sound: 'bell',
      kicker: 'New Advent doors!',
      title: from === to ? `Door ${from} is open` : `Doors ${from}–${to} are open`,
      sub: W3 && to >= 17 ? 'Christmas Eve is coming!' : 'Fresh games, a cosy cottage and a few surprises are waiting.',
      buttons: [
        { label: 'Show me', cls: 'green', fn: () => onShowDoors?.(from, to) },
        { label: 'Later', cls: 'cream' },
      ],
    });
  }

  game.on('reward:grant', (r) => { if (performance.now() < suppressGrants) return; reward(r); });
  game.on('wave:end', () => setTimeout(waveEnd, 600));
  game.on('doors:new', (d) => doorsNew(d));

  // ---- tiny net toasts (rate-limited + coalesced)
  const pend = { join: [], leave: [] };
  let lastNet = 0;
  game.on('net:join', ({ name } = {}) => { if (name) pend.join.push(name); });
  game.on('net:leave', ({ name } = {}) => { if (name) pend.leave.push(name); });
  function netToast(text) {
    const t = document.createElement('div');
    t.className = 'tb-nettoast';
    t.innerHTML = `${ICONS.people}<span>${esc(text)}</span>`;
    net.appendChild(t);
    while (net.children.length > 2) net.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
  }
  const who = (list, verb) => (list.length === 1 ? `${list[0]} ${verb}` : `${list[0]} and ${list.length - 1} other${list.length > 2 ? 's' : ''} ${verb}`);

  function update() {
    park();
    if (!active && queue.length) pump();
    const now = performance.now();
    if (now - lastNet > 4500 && (pend.join.length || pend.leave.length)) {
      if (game.state.phase !== 'play') { if (pend.join.length + pend.leave.length > 12) pend.join.length = pend.leave.length = 0; return; }
      lastNet = now;
      if (pend.join.length) { netToast(who(pend.join.splice(0), 'joined your town')); }
      else netToast(who(pend.leave.splice(0), 'left for home'));
    }
  }

  return {
    reward, daily, waveEnd, doorsNew, update, eveCard, xmasCard,
    /** Fold reward:grant events of the next ms into the card being shown (daily gift). */
    suppressGrants(ms = 800) { suppressGrants = performance.now() + ms; },
    get busy() { return !!active || queue.length > 0; },
    get waveShown() { return waveShown; },
  };
}
