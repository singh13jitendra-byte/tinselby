// "People in your town": the sheet opened by the online chip (.tb-chip.tb-online in the HUD). Lists you + everyone in
// your room (net.players()) with what they are doing (ride presence, else the nearest district), the distance, a tap
// target that opens their people card and a "Show the way" button (ctx.guide.showWay). Live while open (~2×/s).
//
// Global "online in Tinselby" total: NOT done. Town Spirit is a DB rpc (no global realtime channel exists), so an
// approximate total would need either a new channel per client (a second websocket subscription + presence) or a new
// SQL function; both are more load/risk than this is worth right now (see the agent report).
import './roster.css';
import { ICONS } from '../ui/icons.js';
import { SOCIAL_ICONS } from './wheel.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOING = { ferris: 'on the Ferris wheel', wheel: 'on the Ferris wheel', carousel: 'on the carousel', tram: 'on the tram', carriage: 'in a carriage', skate: 'ice skating', skating: 'ice skating', sled: 'sledging', sledge: 'sledging' };
const rideText = (r) => DOING[String(r?.k ?? r?.id ?? '').toLowerCase()] || 'on a ride';
const REFRESH_S = 0.5;

export function createRoster(ctx, social) {
  const { uiRoot, game, engine, player } = ctx;
  const el = document.createElement('div');
  el.className = 'tb-modal tbs-roster-layer';
  el.hidden = true;
  el.innerHTML = `
    <div class="tbs-roster knit-card interactive" role="dialog" aria-label="People in your town">
      <div class="tb-modal-title"><span class="tbs-title-ico">${ICONS.people}</span>People in your town</div>
      <button class="knit-btn cream round tb-modal-close" aria-label="Close">${SOCIAL_ICONS.close}</button>
      <div class="tbs-ro-head"><b class="tbs-ro-town"></b></div>
      <div class="tbs-ro-list" role="list"></div>
      <div class="tbs-ro-empty" hidden>
        <p>Just you here — invite friends!</p>
        <button class="knit-btn green tbs-ro-invite">${SOCIAL_ICONS.share}<span>Invite friends</span></button>
      </div>
    </div>`;
  uiRoot.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const card = $('.tbs-roster'), townEl = $('.tbs-ro-town'), list = $('.tbs-ro-list'), empty = $('.tbs-ro-empty');
  const stop = (e) => e.stopPropagation();
  card.addEventListener('pointerdown', stop);
  el.addEventListener('pointerdown', (e) => { stop(e); if (e.target === el) close(); });

  let isOpen = false, acc = 0, order = '', lastTown = '';
  const rows = new Map(); // id → {el, name, doing, dist, state}
  const net = () => ctx.net;

  function placeText(x, z) {
    let p = '';
    try { p = ctx.guide?.placeAt?.(x, z) || ''; } catch (e) { /* */ }
    return p ? `near ${p}` : 'in the town';
  }
  /** Everyone here: you first, then the others nearest first. */
  function collect() {
    const out = [{ id: '__me', me: true, name: game.state.playerName || 'You', x: player.pos.x, z: player.pos.z, dist: 0, ride: null }];
    let others = [];
    try { others = net()?.players?.() || []; } catch (e) { /* */ }
    for (const q of others) {
      const p = social.person(q.id);
      if (p) out.push(p);
    }
    const mine = out.shift();
    out.sort((a, b) => a.dist - b.dist);
    out.unshift(mine);
    return out;
  }
  function doing(p) {
    if (p.me) {
      if (ctx.rides?.active) return rideText(ctx.rides.active);
      return placeText(p.x, p.z);
    }
    if (p.ride) return rideText(p.ride);
    return placeText(p.x, p.z);
  }
  const distText = (p) => (p.me ? '' : p.dist < 2 ? 'next to you' : `${Math.round(p.dist)} m`);

  function makeRow(p) {
    const r = document.createElement('div');
    r.className = 'tbs-ro-row' + (p.me ? ' me' : '');
    r.setAttribute('role', 'listitem');
    r.dataset.id = p.id;
    r.innerHTML = `
      <${p.me ? 'div' : 'button'} class="tbs-ro-main"${p.me ? '' : ` aria-label="Open ${esc(p.name)}"`}>
        <span class="tbs-ro-av">${ICONS.people}</span>
        <span class="tbs-ro-txt"><span class="tbs-ro-name"></span><span class="tbs-ro-doing"></span></span>
        <span class="tbs-ro-dist"></span>
      </${p.me ? 'div' : 'button'}>
      ${p.me ? '' : `<button class="knit-btn cream tbs-ro-way" aria-label="Show the way to ${esc(p.name)}">${ICONS.arrow}<span>Show the way</span></button>`}`;
    const o = { el: r, nameEl: r.querySelector('.tbs-ro-name'), doingEl: r.querySelector('.tbs-ro-doing'), distEl: r.querySelector('.tbs-ro-dist'), s: {} };
    if (!p.me) {
      r.querySelector('.tbs-ro-main').addEventListener('click', (e) => { stop(e); social.sfx('ui'); const id = p.id; close(); social.openPerson(id); });
      r.querySelector('.tbs-ro-way').addEventListener('click', (e) => {
        stop(e); social.sfx('ui');
        const q = social.person(p.id);
        close();
        if (!q) return;
        let ok = false;
        try { ok = !!ctx.guide?.showWay?.({ x: q.x, z: q.z, label: q.name }); } catch (err) { console.warn('[roster] showWay', err); }
        social.toast(ok ? `Follow the trail to ${q.name}` : `${q.name} is ${Math.round(q.dist)} m away`, 2600);
      });
    }
    return o;
  }
  function setText(o, key, node, v) { if (o.s[key] !== v) { o.s[key] = v; node.textContent = v; } }

  function update() {
    const all = collect();
    const others = all.length - 1;
    const code = net()?.town?.code;
    const t = code ? `Friends town ${code} · ${all.length} here` : `Big town · ${all.length} here`;
    if (t !== lastTown) { lastTown = t; townEl.textContent = t; }
    // rows: rebuild structure only when the set of people changes (so taps never land on a re-rendered node)
    const key = all.map((p) => p.id).join(',');
    if (key !== order) {
      order = key;
      const keep = new Set(all.map((p) => p.id));
      for (const [id, o] of rows) if (!keep.has(id)) { o.el.remove(); rows.delete(id); }
      for (const p of all) if (!rows.has(p.id)) rows.set(p.id, makeRow(p));
      for (const p of all) list.appendChild(rows.get(p.id).el); // (re)order
    }
    for (const p of all) {
      const o = rows.get(p.id);
      setText(o, 'n', o.nameEl, p.me ? `You` : p.name + (p.muted ? ' (muted)' : ''));
      if (p.me && o.s.sub !== p.name) { o.s.sub = p.name; o.nameEl.title = p.name; }
      setText(o, 'd', o.doingEl, p.me ? `${p.name} · ${doing(p)}` : doing(p));
      setText(o, 'm', o.distEl, distText(p));
    }
    empty.hidden = others > 0;
  }

  function open() {
    if (isOpen || !social.free()) return false;
    social.closeAll('roster');
    isOpen = true; acc = 0; order = ''; lastTown = '';
    list.textContent = ''; rows.clear();
    el.hidden = false;
    update();
    social.sfx('ui');
    game.emit('social:roster', { open: true });
    return true;
  }
  function close() { if (!isOpen) return; isOpen = false; el.hidden = true; game.emit('social:roster', { open: false }); }
  $('.tb-modal-close').addEventListener('click', (e) => { stop(e); social.sfx('ui'); close(); });
  $('.tbs-ro-invite').addEventListener('click', (e) => { stop(e); social.sfx('ui'); close(); social.openInvite(); });

  // live: throttled ~2×/s, and straight away when somebody joins / leaves / changes ride or the town changes
  const nudge = () => { if (isOpen) acc = REFRESH_S; };
  for (const ev of ['net:join', 'net:leave', 'net:presence', 'net:town', 'net:status']) game.on(ev, nudge);
  engine.addUpdate((dt) => {
    if (!isOpen) return;
    if (!social.free()) { close(); return; }
    acc += dt;
    if (acc < REFRESH_S) return;
    acc = 0;
    try { update(); } catch (e) { console.warn('[roster] update', e); }
  }, 165);
  return { el, open, close, toggle: () => (isOpen ? close() : open()), get isOpen() { return isOpen; } };
}
