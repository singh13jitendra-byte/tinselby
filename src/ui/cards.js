// Reward / daily-gift / wave-end cards (queued, one at a time, only during free play) and tiny net join/leave toasts.
import { ICONS } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GLYPH = {
  hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c0-7 16-7 16 0z" fill="currentColor"/><rect x="3" y="16" width="18" height="4" rx="2" fill="currentColor" opacity=".75"/><circle cx="12" cy="6" r="2.6" fill="currentColor"/></svg>',
  scarf: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="7" rx="8" ry="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M13 9l4 .4 1 11-4 .3zM10 9.5l3 .3-1.5 9.5-3.6-.6z" fill="currentColor"/></svg>',
  coat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l5 3.5.6 6.5-3 .2V21H6.4v-7.8l-3-.2L4 6.5z" fill="currentColor"/></svg>',
};

export function createCards(ctx, data, { wear, tint, modalOpen }) {
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
  }

  function rewardIcon(r) {
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
  // ---- wave-end teaser
  let waveShown = false;
  function waveEnd() {
    if (waveShown) return;
    waveShown = true;
    push({
      kind: 'wave', icon: ICONS.sleigh, iconColor: 'var(--red)', sound: 'sleighBells',
      kicker: `All ${data.lastAvailable()} doors opened!`,
      title: 'Santa’s sleigh has been spotted over Tinselby…',
      sub: '…new doors are coming soon!',
      buttons: [{ label: 'Look up!', cls: 'green', fn: () => setTimeout(() => { try { ctx.teasers?.sky?.(); } catch (e) { /* */ } }, 250) }],
    });
  }

  game.on('reward:grant', (r) => { if (performance.now() < suppressGrants) return; reward(r); });
  game.on('wave:end', () => setTimeout(waveEnd, 600));

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
    reward, daily, waveEnd, update,
    /** Fold reward:grant events of the next ms into the card being shown (daily gift). */
    suppressGrants(ms = 800) { suppressGrants = performance.now() + ms; },
    get busy() { return !!active || queue.length > 0; },
    get waveShown() { return waveShown; },
  };
}
