// Phones: the "Things to do" round button (bottom-right social stack, via ctx.social.addHudButton) + its sheet.
// Replaces the floating / edge activity signs on touch devices and narrow screens (they took too much of the screen).
//
//   sheet = createActSheet(ctx, { acts, free, wayTo, placeAt, iconOf })
//   sheet.open() / close() / toggle() / isOpen        the "Things to do" sheet (bottom sheet in portrait, centred card in landscape)
//   sheet.rows() → [{ id, name, verb, place, dist, locked, away, door }] as shown (nearest first, unlocked first)
//   sheet.update(dt, on)   per frame from index.js: on = the button is wanted (mobile UI + free play); badge, pulse, live rows
//   sheet.btn              the round button element (null when the social HUD is off: ?w1/w2/w3)
//
// Rows: icon, name, verb, "Market Square · 12 m"; the four tram stops fold into one row (the nearest stop), like the map's
// Things to do tab. Locked rows ("Opens with Door 19") and today's opened daily gift ("Back tomorrow") are greyed, sorted
// after the rest and only toast when tapped. Tapping an open row closes the sheet and lights the way there (index.js wayTo:
// map.wayTo → guide.showWay → tasks.pointTo + the footprint trail; the door goal comes back on arrival or after 45 s).
// Analytics: game events 'activities:open' {} and 'activities:way' { id }.
import { ICONS } from '../ui/icons.js';
import { ACT_ICONS } from './data.js';

const BADGE_R = 15; // metres: the badge counts open activities this close (25 m lit it up with 9 in the compact town centre)
const PULSE_R = 10; // metres: the button pulses once the first time you come this close to each one (where its glow ring shows)
const REFRESH_S = 0.5; // live distances while the sheet is open
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GO = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5c2.6 0 4 1.3 4 3.4S6 11.2 6 13.4 7.6 17 10 17h7"/><path d="M14.5 13.5L18 17l-3.5 3.5"/><circle cx="5" cy="4.5" r="1.4" fill="currentColor"/></svg>';

export function createActSheet(ctx, { acts, free, wayTo, placeAt, iconOf }) {
  const { uiRoot, game, engine, player } = ctx;
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const toast = (t, ms = 3200) => { try { ctx.ui?.toast?.(t, ms); } catch (e) { /* */ } };
  const stop = (e) => e.stopPropagation();

  // ------------------------------------------------------------------ the sheet
  const el = document.createElement('div');
  el.className = 'tb-modal tba-sheet-layer interactive';
  el.hidden = true;
  el.innerHTML = `
    <div class="tba-sheet knit-card interactive" role="dialog" aria-label="Things to do">
      <div class="tb-modal-title"><span class="tbs-title-ico">${ACT_ICONS.ferris}</span>Things to do</div>
      <button class="knit-btn cream round tb-modal-close tba-sh-x" aria-label="Close">${ICONS.close}</button>
      <div class="tba-sh-head">Nearest first · tap one to see the way</div>
      <div class="tba-sh-list" role="list"></div>
    </div>`;
  uiRoot.appendChild(el);
  const card = el.querySelector('.tba-sheet'), list = el.querySelector('.tba-sh-list');
  card.addEventListener('pointerdown', stop);
  el.addEventListener('pointerdown', stop);
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('click', (e) => { if (e.target === el) { e.preventDefault(); stop(e); close(); } });
  el.querySelector('.tba-sh-x').addEventListener('click', (e) => { e.preventDefault(); stop(e); sfx('ui'); close(); });

  /** One row per activity (the tram stops fold into the nearest one), open ones first, then nearest first. */
  function collect() {
    const px = player.pos.x, pz = player.pos.z, out = [];
    let tram = null;
    for (const a of acts) {
      const d = Math.hypot(a.x - px, a.z - pz);
      const locked = !a.unlocked();
      const away = !locked && !!a.available && !a.available();
      const r = { a, d, locked, away };
      if (a.group === 'tram') { if (!tram || d < tram.d) tram = r; continue; }
      out.push(r);
    }
    if (tram) out.push(tram);
    const rank = (r) => (r.locked ? 2 : r.away ? 1 : 0);
    out.sort((p, q) => rank(p) - rank(q) || p.d - q.d);
    return out;
  }
  const nameOf = (a) => (a.group === 'tram' ? `Tram · ${a.sub}` : a.name);
  const distText = (d) => (d < 2 ? 'right here' : `${Math.round(d)} m`);

  const rowEls = new Map(); // activity id → { el, s: {} } (tram rows keyed 'tram': the stop it points at can change)
  let shown = []; // last collect()
  function makeRow(key) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tba-row';
    b.setAttribute('role', 'listitem');
    b.innerHTML = '<span class="tba-ri"></span><span class="tba-rt"><b class="tba-rn"></b><span class="tba-rs"><em class="tba-rv"></em><i class="tba-rp"></i></span></span><span class="tba-rgo"></span>';
    const o = { el: b, key, ri: b.querySelector('.tba-ri'), rn: b.querySelector('.tba-rn'), rv: b.querySelector('.tba-rv'), rp: b.querySelector('.tba-rp'), go: b.querySelector('.tba-rgo'), s: {}, r: null };
    b.addEventListener('pointerdown', stop);
    b.addEventListener('click', (e) => { e.preventDefault(); stop(e); if (o.r) pick(o.r); });
    return o;
  }
  const set = (o, k, v, fn) => { if (o.s[k] !== v) { o.s[k] = v; fn(v); } };
  function render() {
    const rows = collect();
    shown = rows;
    const keys = rows.map((r) => (r.a.group === 'tram' ? 'tram' : r.a.id));
    const keep = new Set(keys);
    for (const [k, o] of rowEls) if (!keep.has(k)) { o.el.remove(); rowEls.delete(k); }
    let prev = null;
    rows.forEach((r, i) => {
      const k = keys[i];
      let o = rowEls.get(k);
      if (!o) { o = makeRow(k); rowEls.set(k, o); }
      o.r = r;
      const a = r.a;
      // (re)order only when needed: the same nodes stay under the finger
      const want = prev ? prev.nextSibling : list.firstChild;
      if (want !== o.el) list.insertBefore(o.el, want);
      prev = o.el;
      const st = r.locked ? 'locked' : r.away ? 'away' : '';
      set(o, 'st', st, () => { o.el.classList.toggle('locked', r.locked); o.el.classList.toggle('away', r.away); o.go.innerHTML = r.locked ? ICONS.lock : r.away ? '' : GO; });
      set(o, 'id', a.id, (v) => { o.el.dataset.id = v; });
      set(o, 'ic', a.icon, (v) => { o.ri.innerHTML = iconOf(v); });
      set(o, 'n', nameOf(a), (v) => { o.rn.textContent = v; o.el.setAttribute('aria-label', r.locked ? `${v}: opens with Door ${a.door}` : `Show the way to ${v}`); });
      const verb = r.locked ? `Opens with Door ${a.door}` : r.away ? 'Back tomorrow' : a.verb;
      set(o, 'v', verb, (v) => { o.rv.textContent = v; });
      set(o, 'p', `${placeAt(a.x, a.z)} · ${distText(r.d)}`, (v) => { o.rp.textContent = v; });
    });
  }
  function pick(r) {
    const a = r.a;
    sfx('ui');
    if (r.locked) { toast(`${a.name} opens with Door ${a.door}. Keep opening doors on the Advent calendar!`, 3600); return; }
    if (r.away) { toast('You’ve opened today’s gift. A new one waits tomorrow!', 3200); return; }
    close();
    game.emit('activities:way', { id: a.id });
    wayTo(a);
  }

  let isOpen = false, acc = 0;
  function open() {
    if (isOpen || !free()) return false;
    try { ctx.social?.closeAll?.(); } catch (e) { /* */ }
    isOpen = true; acc = 0;
    el.hidden = false;
    render();
    list.scrollTop = 0;
    btn?.classList.remove('pulse');
    game.emit('activities:open', {});
    return true;
  }
  function close() { if (!isOpen) return; isOpen = false; el.hidden = true; }
  window.addEventListener('keydown', (e) => { if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); } }, true);
  game.on('ui:escape', close);

  // ------------------------------------------------------------------ the round button (bottom-right social stack)
  let want = false, btn = null;
  try {
    ctx.social?.addHudButton?.({ id: 'acts', label: 'Things to do', icon: ACT_ICONS.ferris, order: 50, when: () => want, run: () => (isOpen ? close() : open()) });
    btn = uiRoot.querySelector('.tbs-x-acts');
  } catch (e) { console.warn('[activities] button', e); }
  let badge = null;
  if (btn) {
    badge = document.createElement('i');
    badge.className = 'tba-bdg';
    badge.hidden = true;
    btn.appendChild(badge);
    btn.addEventListener('animationend', () => btn.classList.remove('pulse'));
  }
  const pulsed = new Set(); // activity ids that already pulsed the button this visit
  let slow = 0, lastN = -1;
  function pulse() {
    if (!btn) return;
    btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
  }

  /** Per frame (index.js): on = the button is wanted right now (phone UI + free play). */
  function update(dt, on) {
    want = !!btn && on;
    if (!on) { if (isOpen) close(); return; }
    if (isOpen) {
      if (!free()) { close(); return; }
      acc += dt;
      if (acc >= REFRESH_S) { acc = 0; try { render(); } catch (e) { console.warn('[activities] sheet', e); } }
      return;
    }
    slow -= dt;
    if (slow > 0 || !btn) return;
    slow = 0.25;
    let n = 0, fresh = false;
    for (const a of acts) {
      if (!a.on || a.locked) continue;
      if (a.available && !a.available()) continue;
      const d = Number.isFinite(a.dist) ? a.dist : Math.hypot(a.x - player.pos.x, a.z - player.pos.z);
      if (d <= BADGE_R) n++;
      const key = a.group === 'tram' ? 'tram' : a.id;
      if (d <= PULSE_R && !pulsed.has(key)) { pulsed.add(key); fresh = true; }
    }
    if (n !== lastN) { lastN = n; badge.hidden = !n; badge.textContent = n ? String(Math.min(n, 9)) : ''; btn.setAttribute('aria-label', n ? `Things to do: ${n} nearby` : 'Things to do'); }
    if (fresh && !btn.hidden && engine.time > 2) pulse();
  }
  game.on('game:start', () => { pulsed.clear(); lastN = -1; });

  return {
    open, close, toggle: () => (isOpen ? close() : open()), update, pulse,
    get isOpen() { return isOpen; },
    get btn() { return btn; },
    get badge() { return badge && !badge.hidden ? +badge.textContent : 0; },
    rows() {
      if (!isOpen) shown = collect();
      return shown.map((r) => ({ id: r.a.id, name: nameOf(r.a), verb: r.a.verb, place: placeAt(r.a.x, r.a.z), dist: +r.d.toFixed(1), locked: r.locked, away: r.away, door: r.a.door || null }));
    },
  };
}
