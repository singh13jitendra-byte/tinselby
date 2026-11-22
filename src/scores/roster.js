// "Scores" tab in the People-in-your-town sheet (src/social/roster.js calls ctx.scores.onRosterOpen(card) when it opens).
// Friends towns only: a People | Scores switch under the sheet's header; Scores lists every mini-game with its town
// leader ("You" marked) and expands to the top 5 (+ your own place when you're further down). The public town shows
// no tab at all. Loading stitch while town_scores is fetched (cached 30 s), 4 s timeout with a Try again button.
import { ICONS } from '../ui/icons.js';
import { GAMES, format } from './games.js';
import { rowsFor, withTimeout, TIMEOUT_MS } from './api.js';
import { stitch } from './results.js';

const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};
const CHEV = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function createRosterScores(ctx, api) {
  const { game } = ctx;
  let card = null, tabs = null, panel = null, tab = 'people', seq = 0;
  const open = new Set(); // expanded game ids (kept while the page lives)
  const sfx = () => { try { ctx.audio?.sfx?.('ui'); } catch (e) { /* */ } };
  const stop = (e) => e.stopPropagation();

  function mount(c) {
    card = c;
    tabs = el('div', 'sc-tabs', null);
    tabs.setAttribute('role', 'tablist');
    for (const [t, label] of [['people', 'People'], ['scores', 'Scores']]) {
      const b = el('button', 'sc-tab', tabs);
      b.type = 'button'; b.dataset.t = t; b.setAttribute('role', 'tab');
      b.innerHTML = (t === 'people' ? ICONS.people : ICONS.crown) + `<span>${label}</span>`;
      b.addEventListener('click', (e) => { stop(e); if (tab !== t) { sfx(); setTab(t); } });
    }
    panel = el('div', 'sc-panel', null);
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    const head = card.querySelector('.tbs-ro-head');
    if (head && head.parentNode === card) head.after(tabs); else card.insertBefore(tabs, card.firstChild);
    const list = card.querySelector('.tbs-ro-list');
    if (list && list.parentNode === card) list.after(panel); else card.appendChild(panel);
  }

  function setTab(t) {
    tab = t;
    for (const b of tabs.children) { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    card.classList.toggle('sc-on', t === 'scores');
    panel.hidden = t !== 'scores';
    if (t === 'scores') { load(false); game.emit('scores:viewed', { where: 'roster' }); }
  }

  function load(force) {
    const my = ++seq;
    if (!panel.childElementCount || force) { panel.textContent = ''; const w = el('div', 'sc-p-wait', panel); stitch(w); el('span', '', w, 'Fetching town scores…'); }
    withTimeout(api.list({ force }), TIMEOUT_MS).then(
      (rows) => { if (my === seq && tab === 'scores') render(rows); },
      () => {
        if (my !== seq || tab !== 'scores') return;
        panel.textContent = '';
        const w = el('div', 'sc-p-wait', panel);
        el('span', '', w, 'Town scores are snowed in.');
        const b = el('button', 'knit-btn cream sc-retry', w, 'Try again');
        b.addEventListener('click', (e) => { stop(e); sfx(); load(true); });
      },
    );
  }

  function titleOf(id, fallback) { try { return ctx.minigames?.get?.(id)?.title || fallback; } catch (e) { return fallback; } }

  function render(rows) {
    panel.textContent = '';
    const known = GAMES.filter((g) => !ctx.minigames?.get || ctx.minigames.get(g.id));
    const played = known.filter((g) => rowsFor(rows, g.id).length), fresh = known.filter((g) => !rowsFor(rows, g.id).length);
    if (!played.length) el('p', 'sc-p-none', panel, 'No scores in this town yet. Play a mini-game to set the first one!');
    for (const g of played) {
      const board = rowsFor(rows, g.id);
      const lead = board[0];
      const box = el('div', 'sc-g' + (lead.me ? ' me' : ''), panel);
      const main = el('button', 'sc-g-main', box);
      main.type = 'button';
      main.setAttribute('aria-expanded', open.has(g.id) ? 'true' : 'false');
      const ic = el('span', 'sc-g-ico', main); ic.innerHTML = ICONS.crown;
      const tx = el('span', 'sc-g-txt', main);
      el('span', 'sc-g-title', tx, titleOf(g.id, g.title));
      el('span', 'sc-g-lead', tx, `${lead.me ? 'You' : lead.name} · ${format(g.id, lead.best)}`);
      const ch = el('span', 'sc-g-chev', main); ch.innerHTML = CHEV;
      const ol = el('ol', 'sc-g-top', box);
      ol.hidden = !open.has(g.id);
      board.slice(0, 5).forEach((x, i) => {
        const li = el('li', x.me ? 'me' : '', ol);
        el('i', '', li, String(i + 1));
        el('span', 'sc-name', li, x.me ? 'You' : x.name);
        el('b', '', li, format(g.id, x.best));
      });
      const mi = board.findIndex((x) => x.me);
      if (mi >= 5) {
        const li = el('li', 'me', ol);
        el('i', '', li, String(mi + 1));
        el('span', 'sc-name', li, 'You');
        el('b', '', li, format(g.id, board[mi].best));
      }
      box.classList.toggle('open', open.has(g.id));
      main.addEventListener('click', (e) => {
        stop(e); sfx();
        const on = !open.has(g.id);
        if (on) open.add(g.id); else open.delete(g.id);
        ol.hidden = !on; box.classList.toggle('open', on); main.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    }
    if (fresh.length) {
      const f = el('div', 'sc-fresh', panel);
      el('b', '', f, 'No scores yet: ');
      el('span', '', f, fresh.map((g) => titleOf(g.id, g.title)).join(' · '));
    }
  }

  game.on('net:town', () => { // moved town while the sheet is open: no Scores tab in the public town
    if (!card) return;
    const on = api.enabled();
    tabs.hidden = !on;
    if (!on && tab === 'scores') setTab('people');
    else if (on && tab === 'scores') load(true);
  });

  /** roster.open() → called every time the sheet opens (the first call mounts the tab bar). */
  return function onRosterOpen(c) {
    if (!c) return;
    if (!card) mount(c);
    const on = api.enabled();
    tabs.hidden = !on;
    seq++;
    panel.textContent = '';
    setTab('people'); // every opening starts on People
    if (on) api.list().catch(() => {}); // warm the cache so the Scores tab is instant
  };
}
