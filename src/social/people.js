// The people card: tap a remote doll / name tag (or press E next to someone) → name + Wave, Ride together, Mute, and any
// actions other modules registered with social.addPersonAction (snowball, gift ...).
import { ICONS } from '../ui/icons.js';
import { SOCIAL_ICONS } from './wheel.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RIDE_NAMES = { ferris: 'the Ferris wheel', wheel: 'the Ferris wheel', carousel: 'the carousel', tram: 'the tram', carriage: 'a carriage', skate: 'the ice', skating: 'the ice', sled: 'a sledge', sledge: 'a sledge' };
const rideName = (r) => (r?.name ? String(r.name) : RIDE_NAMES[String(r?.k || '').toLowerCase()] || 'a ride');
const iconHTML = (ic) => (typeof ic === 'string' && ic.trim().startsWith('<') ? ic : ICONS[ic] || SOCIAL_ICONS[ic] || ICONS.hand);

export function createPeople(ctx, social) {
  const { uiRoot, game } = ctx;
  const el = document.createElement('div');
  el.className = 'tbs-person knit-card interactive';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  uiRoot.appendChild(el);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());

  let id = null, shown = null, idle = 0, lastKey = '';

  const builtin = (p) => [
    { id: 'wave', label: 'Wave', icon: 'wave', cls: 'green', run: () => social.waveAt(p) },
  ];
  /** Buttons for this person right now: built-ins first, then registered actions, then ride + mute. */
  function buttonsFor(p) {
    const out = builtin(p).map((b) => ({ ...b, key: b.id }));
    for (const a of social.personActions()) {
      let ok = false;
      try { ok = !!a.when(p); } catch (e) { console.warn('[social] action', a.id, e); }
      if (ok) out.push({ id: a.id, label: a.label, icon: a.icon, cls: 'cream', run: () => a.run(p), key: a.id, close: a.closes !== false });
    }
    if (p.ride) out.push({ id: 'ride', label: 'Ride together', icon: 'tram', cls: 'cream', run: () => social.rideWith(p), key: 'ride', close: true });
    out.push({ id: 'mute', label: p.muted ? 'Unmute' : 'Mute', icon: p.muted ? 'unmute' : 'mute', cls: 'cream quiet', run: () => social.toggleMute(p), key: p.muted ? 'unmute' : 'mute', close: false });
    return out;
  }

  function render(p) {
    const btns = buttonsFor(p);
    const key = [p.name, p.muted, !!p.ride, btns.map((b) => b.key).join(',')].join('|');
    if (key === lastKey) return;
    lastKey = key;
    el.innerHTML = `
      <button class="knit-btn cream round tbs-person-x" aria-label="Close">${SOCIAL_ICONS.close}</button>
      <div class="tbs-person-head">
        <span class="tbs-person-ico">${ICONS.people}</span>
        <span class="tbs-person-txt"><b class="tbs-person-name">${esc(p.name)}</b>
        <span class="tbs-person-sub">${p.muted ? 'Muted: you won’t see their messages' : p.ride ? `On ${rideName(p.ride)}` : 'Here in the town'}</span></span>
      </div>
      <div class="tbs-person-btns">${btns.map((b, i) => `<button class="knit-btn ${b.cls}" data-i="${i}"><span class="tbs-b-ico">${iconHTML(b.icon)}</span>${esc(b.label)}</button>`).join('')}</div>`;
    el._btns = btns;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    idle = 0;
    if (b.classList.contains('tbs-person-x')) { social.sfx('ui'); close(); return; }
    const def = el._btns?.[+b.dataset.i];
    if (!def) return;
    social.sfx('ui');
    const p = id && social.person(id);
    if (!p) { close(); return; }
    try { def.run(); } catch (err) { console.error('[social] person action', def.id, err); }
    if (def.close === undefined ? def.id === 'wave' : def.close) close(); else { lastKey = ''; refresh(0); }
  });

  function open(pid) {
    const p = social.person(pid);
    if (!p || !social.free()) return false;
    social.closeAll('person');
    id = pid; idle = 0; lastKey = '';
    render(p);
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    shown = p.name;
    game.emit('social:person', { id: pid });
    return true;
  }
  function close() { if (id === null) return; id = null; el.hidden = true; lastKey = ''; }
  function refresh(dt) {
    if (id === null) return;
    const p = social.person(id);
    if (!p || !social.free() || p.dist > 40) { close(); return; }
    idle += dt;
    if (idle > 25) { close(); return; }
    render(p);
  }
  return { el, open, close, refresh, get isOpen() { return id !== null; }, get id() { return id; } };
}
