// Calendar panel (DOM): a knitted 6×4 grid of doors with their states, the visit streak, Town Spirit and players online.
// Tapping an open door points the way to its giver ("Find Tilly in Pinecone Park").
import { ICONS } from '../ui/icons.js';

const FELTS = [['#b8302d', '#fff4e2'], ['#3f6e45', '#fff4e2'], ['#efe1c6', '#3a2a24'], ['#4f9590', '#fff4e2'], ['#d59f3c', '#3a2a24'], ['#8a4f7d', '#fff4e2']];
const SLOT_ICON = { hat: 'hat', scarf: 'scarf', coat: 'coat' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const starsHTML = (k) => `<span class="cal-stars" aria-label="${k} of 3 stars">${[0, 1, 2].map((i) => `<i class="${i < k ? 'on' : ''}">★</i>`).join('')}</span>`;

// small inline reward glyphs (match the board's atlas icons)
const GLYPH = {
  hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c0-7 16-7 16 0z" fill="currentColor"/><rect x="3" y="16" width="18" height="4" rx="2" fill="currentColor" opacity=".7"/><circle cx="12" cy="6" r="2.6" fill="currentColor"/></svg>',
  scarf: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="7" rx="8" ry="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M13 9l4 .4 1 11-4 .3zM10 9.5l3 .3-1.5 9.5-3.6-.6z" fill="currentColor"/></svg>',
  coat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l5 3.5.6 6.5-3 .2V21H6.4v-7.8l-3 -.2L4 6.5z" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="#fff8"/><circle cx="12" cy="14" r="1" fill="#fff8"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="currentColor"/></svg>',
};

export function createPanel(ctx, data, { onHint, rewardTint }) {
  const { game } = ctx;
  const wrap = document.createElement('div');
  wrap.className = 'cal-wrap interactive';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="cal-panel knit-card" role="dialog" aria-modal="true" aria-label="Advent calendar">
      <div class="cal-head">
        <div class="cal-title"><span class="cal-title-ico">${ICONS.calendar}</span><h2>Advent Calendar</h2></div>
        <div class="cal-stats">
          <span class="cal-chip cal-streak" title="Visit streak">${ICONS.candle}<span></span></span>
          <span class="cal-chip cal-spirit" title="Town Spirit: doors opened by everyone">${ICONS.snowflake}<span></span></span>
          <span class="cal-chip cal-players" title="Players in your town">${ICONS.people}<span></span></span>
        </div>
        <button class="knit-btn cream round cal-close" aria-label="Close calendar">${ICONS.close}</button>
      </div>
      <div class="cal-grid"></div>
      <div class="cal-detail" aria-live="polite"></div>
    </div>`;
  ctx.uiRoot.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const grid = $('.cal-grid'), detail = $('.cal-detail');
  const streakEl = $('.cal-streak span'), spiritEl = $('.cal-spirit span'), playersEl = $('.cal-players span');
  const tiles = [];
  for (let n = 1; n <= 24; n++) {
    const b = document.createElement('button');
    b.className = 'cal-door';
    b.dataset.n = n;
    const [bg, fg] = FELTS[((n - 1) * 5 + Math.floor((n - 1) / 6)) % FELTS.length];
    b.style.setProperty('--dc', bg);
    b.style.setProperty('--tc', fg);
    grid.appendChild(b);
    tiles.push(b);
  }
  let selected = null, sig = '', isOpen = false;

  function tileHTML(n, st) {
    const d = data.door(n) || { title: '' };
    const where = d.district ? data.districtName(d.district) : '';
    const sub = st === 'soon' ? 'Coming soon' : [d.giver, where].filter(Boolean).join(' · ');
    let badge = '';
    if (st === 'open') badge = '<span class="cal-badge open">Open!</span>';
    else if (st === 'locked') badge = `<span class="cal-badge lock">${ICONS.lock}</span>`;
    else if (st === 'done') {
      const r = d.reward;
      const glyph = r ? `<span class="cal-glyph" style="color:${rewardTint(r.slot, r.key)}">${GLYPH[SLOT_ICON[r.slot]] || GLYPH.star}</span>` : `<span class="cal-glyph" style="color:#e3aa3a">${GLYPH.star}</span>`;
      badge = `<span class="cal-badge done">${glyph}${d.game ? starsHTML(data.stars(n)) : `<span class="cal-check" aria-label="done">${ICONS.check}</span>`}</span>`;
    }
    return `<span class="cal-n">${n}</span><span class="cal-t">${esc(d.title)}</span><span class="cal-g">${esc(sub)}</span>${badge}`;
  }

  function render(force) {
    const states = [];
    for (let n = 1; n <= 24; n++) states.push(data.state(n));
    const s = states.join(',') + states.map((st, i) => (st === 'done' ? data.stars(i + 1) : '')).join('');
    if (s !== sig || force) {
      sig = s;
      tiles.forEach((b, i) => {
        const st = states[i];
        b.className = `cal-door s-${st}`;
        b.innerHTML = tileHTML(i + 1, st);
        const d = data.door(i + 1);
        b.setAttribute('aria-label', `Door ${i + 1}: ${d?.title || ''} (${st === 'soon' ? 'coming soon' : st})`);
      });
    }
    // stats
    const streak = data.streak;
    streakEl.innerHTML = streak > 0 ? `<b>${streak}</b>-day streak` : 'First visit!';
    const ts = data.townSpirit();
    spiritEl.innerHTML = `<b>${ts.doors.toLocaleString()}</b> door${ts.doors === 1 ? '' : 's'}${ts.helpers ? ` · <b>${ts.helpers.toLocaleString()}</b> helper${ts.helpers === 1 ? '' : 's'}` : ''}`;
    const pc = data.playerCount();
    playersEl.innerHTML = data.online ? `<b>${pc}</b> in your town` : 'Playing offline';
    $('.cal-players').classList.toggle('off', !data.online);
    tiles.forEach((b, i) => b.classList.toggle('sel', selected === i + 1));
    showDetail(selected);
  }

  let detailSig = null;
  // Re-render only when the content changes: the board poll refreshes every ~1.5 s, and rebuilding the strip mid-tap lost the button press.
  function setDetail(html, n) {
    const sg = n + '|' + html;
    if (sg === detailSig) return;
    detailSig = sg;
    detail.innerHTML = html;
    detail.querySelector('.cal-go')?.addEventListener('click', (e) => { e.stopPropagation(); point(n); });
  }

  function showDetail(n) {
    if (!n) { setDetail('', 0); return; }
    const d = data.door(n) || {};
    const st = data.state(n);
    let line = '', btn = '';
    if (st === 'open') { line = `${esc(data.findText(n))} — ${esc(d.blurb || '')}`; btn = `<button class="knit-btn green cal-go">${ICONS.arrow}<span>Show me the way</span></button>`; }
    else if (st === 'done') {
      const best = d.game ? data.best(d.game) : null;
      line = d.game ? `Done! ${starsHTML(data.stars(n))}${best && Number.isFinite(best.score) ? ` Best ${best.score}.` : ''} Talk to ${esc(d.giver)} to play again.` : `Done! ${esc(d.giver)} says thank you.`;
      if (d.reward?.label) line += ` <span class="cal-reward">Reward: ${esc(d.reward.label)}</span>`;
      if (d.game) btn = `<button class="knit-btn cream cal-go">${ICONS.arrow}<span>Play again</span></button>`;
    } else if (st === 'locked') line = n === 24 ? 'Christmas Eve opens when doors 1–23 are done.' : `Opens after door ${n - 1}. ${esc(d.blurb || '')}`;
    else line = 'This door is stitched shut for now — new doors are coming soon!';
    const daily = data.dailyAvailable ? `<span class="cal-daily">${ICONS.gift} A daily gift is waiting by the board!</span>` : '';
    setDetail(`<div class="cal-dtxt"><b class="cal-dtitle">Door ${n} · ${esc(d.title || '')}</b><span>${line}</span>${daily}</div>${btn}`, n);
  }

  function point(n) {
    sfx('ui');
    api.close();
    onHint(n);
  }

  function sfx(n) { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.cal-door');
    if (!b) return;
    const n = +b.dataset.n;
    const st = data.state(n);
    selected = n;
    sfx(st === 'soon' || st === 'locked' ? 'ui' : 'bell');
    if (st === 'open') { // straight to the hint: highlight briefly, then close and point the way
      render();
      b.classList.add('tap');
      setTimeout(() => { if (isOpen) point(n); }, 260);
      return;
    }
    render();
  });
  $('.cal-close').addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); api.close(); });
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  wrap.addEventListener('click', (e) => { if (e.target === wrap) api.close(); });
  game.on('ui:escape', () => { if (isOpen) api.close(); });

  let restore = null;
  const api = {
    el: wrap,
    get isOpen() { return isOpen; },
    open(n) {
      if (isOpen) { if (n) { selected = n; render(); } return; }
      if (game.state.phase !== 'play') return;
      isOpen = true;
      selected = n || data.current() || null;
      render(true);
      wrap.hidden = false;
      wrap.classList.remove('in'); void wrap.offsetWidth; wrap.classList.add('in');
      // freeze walking while the panel is up
      const { player, input } = ctx;
      restore = { ctrl: player.controllable, input: input.enabled };
      player.controllable = false;
      input.enabled = false;
      input.clearTap?.();
      input.setJoystick?.(0, 0);
      game.emit('calendar:open', { n: selected });
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      wrap.hidden = true;
      if (restore && game.state.phase === 'play' && (!ctx.cam.shotActive || ctx.cam.shotName === 'advent-frame')) {
        ctx.player.controllable = true;
        ctx.input.enabled = restore.input !== false;
      }
      restore = null;
      game.emit('calendar:close', {});
    },
    refresh() { if (isOpen) render(); },
  };
  return api;
}
