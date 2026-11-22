// "Your town" block on the mini-game results card (friends towns only; the public town shows nothing, there is no global
// board). Called by the framework's showResults() via ctx.scores.resultsBlock(card, def, result) for every finished
// (not quit) run: submits the score, then shows the town's top 3 for that game, your best + rank, and a "New best in
// your town!" ribbon (+ "You beat Ava's 590!") when town_best. Never blocks the card: a small loading stitch, 4 s timeout.
import { ICONS } from '../ui/icons.js';
import { rowsFor, withTimeout, TIMEOUT_MS } from './api.js';
import { toServer, validGame, format, formatShort } from './games.js';
import { cleanName } from '../core/names.js';

const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};
export const stitch = (parent) => { const s = el('span', 'sc-stitch', parent); s.setAttribute('aria-label', 'Loading'); for (let i = 0; i < 3; i++) el('i', '', s); return s; };

/** rows of one game + my submit result → the board as it is now (my best in, re-sorted). */
function merge(rows, res, game, myName) {
  const out = rows.map((r) => ({ ...r }));
  const me = out.find((r) => r.me);
  if (me) { me.best = Math.max(me.best, res.best); me.name = myName; } else out.push({ game, name: myName, best: res.best, me: true, at: '' });
  return out.sort((a, b) => b.best - a.best).slice(0, 10);
}

export function createResultsBlock(ctx, api) {
  const { game } = ctx;
  return function resultsBlock(card, def, r) {
    if (!card || !def || !r || r.quit || !api.enabled() || !validGame(def.id)) return null;
    const gid = def.id, town = api.town();
    const box = el('div', 'sc-town', card);
    box.setAttribute('aria-live', 'polite');
    const head = el('div', 'sc-head', box);
    el('span', 'sc-label', head, 'Your town');
    stitch(head);
    const sendable = (toServer(gid, r.score) || 0) > 0;
    const myName = cleanName(game.state.playerName);
    // the board before this run: cached / in flight since minigame:start (prefetch), so usually no extra round trip
    const beforeP = api.list().catch(() => api.last());
    let prevAll = api.last();

    const work = (async () => {
      const res = sendable ? await api.submit(gid, r.score) : null;
      const before = await beforeP;
      if (before) prevAll = before;
      let rows;
      if (res && res.best != null && before) rows = merge(rowsFor(before, gid), res, gid, myName);
      else rows = res ? rowsFor(await api.list({ force: true }), gid) : rowsFor(before || [], gid);
      return { res, rows };
    })();

    let shown = false;
    const render = ({ res, rows }, again = false) => {
      if (!box.isConnected || api.town() !== town) return;
      box.textContent = '';
      box.classList.remove('sc-wait', 'sc-off');
      if (res && res.town_best && !again) {
        const rib = el('div', 'sc-ribbon', box);
        const ic = el('span', 'sc-rib-ico', rib); ic.innerHTML = ICONS.crown;
        const tx = el('span', 'sc-rib-txt', rib);
        el('b', '', tx, 'New best in your town!');
        if (res.prev_top) {
          const was = rowsFor(prevAll, gid).find((x) => !x.me && x.name === res.prev_top);
          el('span', '', tx, was ? `You beat ${res.prev_top}'s ${formatShort(gid, was.best)}!` : `You beat ${res.prev_top}!`);
        }
        box._ribbon = rib;
        try { ctx.audio?.sfx?.('bell'); } catch (e) { /* */ }
        game.emit('scores:town_best', { game: gid });
      } else if (again && box._ribbon) box.appendChild(box._ribbon);
      const h = el('div', 'sc-head', box);
      el('span', 'sc-label', h, 'Your town');
      const meRow = rows.find((x) => x.me);
      const best = res && res.best != null ? res.best : meRow ? meRow.best : null;
      const rank = res && res.rank != null ? res.rank : meRow ? rows.indexOf(meRow) + 1 : null;
      if (best != null) el('span', 'sc-mine', h, `Your best ${format(gid, best)}${rank ? ` · #${rank}` : ''}`);
      if (!rows.length) { el('p', 'sc-empty', box, 'No town scores yet.'); return; }
      const ol = el('ol', 'sc-top', box);
      rows.slice(0, 3).forEach((x, i) => {
        const li = el('li', x.me ? 'me' : '', ol);
        el('i', '', li, String(i + 1));
        el('span', 'sc-name', li, x.me ? 'You' : x.name);
        el('b', '', li, format(gid, x.best));
      });
      if (!shown) { shown = true; game.emit('scores:viewed', { where: 'results' }); }
    };
    box.classList.add('sc-wait');
    withTimeout(work, TIMEOUT_MS).then(
      (v) => {
        render(v);
        // background refresh: the real order (someone else may have scored meanwhile); re-render if it changed
        if (v.res) api.list({ force: true }).then((rows) => {
          const now = rowsFor(rows, gid);
          const k = (a) => a.slice(0, 3).map((x) => x.name + ':' + x.best + ':' + x.me).join('|');
          if (k(now) !== k(v.rows)) render({ res: v.res, rows: now }, true);
        }).catch(() => {});
      },
      (e) => {
        if (!box.isConnected) return;
        console.info('[scores] town board unavailable:', e && e.message);
        box.classList.remove('sc-wait'); box.classList.add('sc-off');
        box.textContent = '';
        el('span', 'sc-label', box, 'Your town');
        el('span', 'sc-note', box, 'Town scores are snowed in. Try again later!');
        work.then((v) => render(v), () => {}); // a late answer still fills the block in
      },
    );
    return box;
  };
}
