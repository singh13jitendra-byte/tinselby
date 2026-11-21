// Tips: gentle first-time coach marks (one at a time, pointing at the real HUD element) and the "?" help card.
//
//   ctx.tips = createTips(ctx)
//   tips.help()          toggle the help card: one friendly sentence about the current step + "Show me the way" / "OK"
//   tips.closeHelp()     tips.resetAll() forget everything (tests)   tips.skipAll()   tips.current → step id | null
//   tips.enabled         false under ?capture unless &tips (so tools/playthrough.py taps are never blocked); help() always works
//
// Coach marks are remembered in localStorage `tinselby.tips.v1` = { off: bool, done: { id: 1 } }. They only show in free
// play (same rule as src/social/index.js free()) and never cover the joystick.
import './tips.css';

const KEY = 'tinselby.tips.v1';
const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return { off: !!o.off, done: o.done || {} }; } catch (e) { return { off: false, done: {} }; } };

export function createTips(ctx) {
  const { game, player, cam, engine, uiRoot, params } = ctx;
  const S = game.state;
  const store = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };
  const enabled = !params.has('capture') || params.has('tips');
  const data = () => ctx.ui?.data;
  const q = (sel) => { const e = uiRoot.querySelector(sel); return e && !e.hidden && e.getClientRects().length ? e : null; };
  const coarse = () => !!uiRoot.querySelector('.tb-joy') && !!q('.tb-joylayer .tb-joy');

  /** Free play only (not entry, mini-games, finale, rides, photo mode, cinematics, cards or panels). */
  function free() {
    return S.phase === 'play' && player.controllable && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.finale?.running
      && !ctx.ui?.modalOpen?.() && !ctx.photo?.isOpen && !document.body.classList.contains('tb-photo')
      && !uiRoot.classList.contains('tb-house-open') && !ctx.ui?.cards?.busy && !ctx.ui?.hud?.el?.classList.contains('tb-framing'); 
  }
  const freeNow = () => free();

  // ------------------------------------------------------------------ DOM
  const root = document.createElement('div');
  root.className = 'tbt-root';
  root.innerHTML = `
    <div class="tbt-ring"></div>
    <div class="tbt-call knit-card" hidden>
      <div class="tbt-txt"></div>
      <div class="tbt-row"><button class="tbt-skip" type="button">Skip tips</button><button class="knit-btn green tbt-ok" type="button">Got it</button></div>
    </div>
    <div class="tbt-help knit-card" hidden>
      <div class="tbt-txt"></div>
      <div class="tbt-row"><button class="knit-btn cream tbt-way" type="button">Show me the way</button><button class="knit-btn green tbt-hok" type="button">OK</button></div>
    </div>`;
  uiRoot.appendChild(root);
  const ring = root.querySelector('.tbt-ring'), call = root.querySelector('.tbt-call'), callTxt = call.querySelector('.tbt-txt');
  const help = root.querySelector('.tbt-help'), helpTxt = help.querySelector('.tbt-txt'), wayBtn = help.querySelector('.tbt-way');
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const tap = (el, fn) => {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); sfx('ui'); });
  };

  // ------------------------------------------------------------------ steps
  // side: where the callout sits relative to the target. when(): ready to show (polled). Earlier steps win.
  const nearGiver = () => {
    const c = ctx.interact?.current;
    return !!c && /talk/i.test(`${c.icon || ''} ${c.label || ''}`) && !!q('.tb-act');
  };
  const STEPS = [
    { id: 'walk', side: 'above', target: () => (coarse() ? q('.tb-joy') : null), when: () => true, delay: 1.2,
      text: () => (coarse() ? 'Drag here to walk' : 'WASD / arrow keys to walk') },
    { id: 'goal', side: 'below', target: () => q('.tb-goal') || q('.tb-task'), when: () => !!(q('.tb-goal') || q('.tb-task')), delay: 0.5,
      text: () => 'This is your goal. Tap the ? if you ever need help.' },
    { id: 'talk', side: 'above', target: () => q('.tb-act'), when: nearGiver, delay: 0.3,
      text: () => 'Walk up to people and tap to talk.' },
    { id: 'calendar', side: 'below', target: () => q('.tb-cal'), when: () => doneCount() > 0, delay: 1.0,
      text: () => 'Your Advent calendar lives here.' },
    { id: 'wardrobe', side: 'below', target: () => q('.tb-ward'), when: () => rewarded, delay: 0.8,
      text: () => 'New clothes! Open the wardrobe to wear your reward.' },
    { id: 'photo', side: 'below', target: () => q('.tb-photo-btn'), when: () => doneCount() >= 2, delay: 0.8,
      text: () => 'Take a snowy photo of your town.' },
    { id: 'friends', side: 'below', target: () => q('.tbs-friends-btn'), when: () => doneCount() >= 3, delay: 0.8,
      text: () => 'Play with friends here.' },
  ];
  const doneCount = () => { try { return data()?.doneCount?.() || 0; } catch (e) { return 0; } };
  let rewarded = false;
  game.on('reward:grant', () => { rewarded = true; });
  game.on('progress:reset', () => { rewarded = false; });

  // a player who already has progress (new device, cleared storage) skips the basics
  const startedWith = doneCount();
  if (startedWith > 0) for (const id of ['walk', 'goal', 'talk', 'calendar']) store.done[id] = 1;
  game.on('door:complete', () => { for (const id of ['walk', 'goal', 'talk']) if (cur?.id !== id) store.done[id] = 1; save(); });

  let cur = null, wait = 0, quiet = 2.0, walked = 0, lastX = null, lastZ = null, side = 'above';
  const stepById = (id) => STEPS.find((s) => s.id === id);
  function dismiss(markDone = true) {
    if (!cur) return;
    if (markDone) { store.done[cur.id] = 1; save(); }
    cur = null; hideCall(); quiet = 1.2;
  }
  function hideCall() { call.classList.remove('on'); ring.classList.remove('on'); setTimeout(() => { if (!cur) call.hidden = true; }, 260); }
  function skipAll() { store.off = true; save(); dismiss(false); game.emit('tips:skipped', {}); }
  tap(call.querySelector('.tbt-ok'), () => dismiss(true));
  tap(call.querySelector('.tbt-skip'), skipAll);

  // ------------------------------------------------------------------ placement
  const rect = (e) => e.getBoundingClientRect();
  const hits = (a, b, pad = 6) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
  function place(step, t) {
    const vw = innerWidth, vh = innerHeight, m = 10, tr = rect(t);
    const cw = call.offsetWidth, ch = call.offsetHeight, gap = 16;
    const joyEl = q('.tb-joy'), joy = joyEl ? rect(joyEl) : null;
    const tryPlace = (s) => {
      let x = tr.left + tr.width / 2 - cw / 2, y = s === 'above' ? tr.top - ch - gap : tr.bottom + gap;
      x = Math.max(m, Math.min(vw - cw - m, x));
      return { x, y, s, ok: y >= m && y + ch <= vh - m };
    };
    let p = tryPlace(step.side);
    const box = (pp) => ({ left: pp.x, right: pp.x + cw, top: pp.y, bottom: pp.y + ch });
    const bad = (pp) => !pp.ok || (joy && step.id !== 'walk' && hits(box(pp), joy)) || (step.id === 'walk' && false);
    if (bad(p)) { const o = tryPlace(step.side === 'above' ? 'below' : 'above'); if (!bad(o) || !p.ok) p = o; }
    p.y = Math.max(m, Math.min(vh - ch - m, p.y));
    call.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    call.classList.toggle('down', p.s === 'above'); // arrow on the bottom edge when the callout is above the target
    call.classList.toggle('up', p.s === 'below');
    const ax = Math.max(22, Math.min(cw - 22, tr.left + tr.width / 2 - p.x));
    call.style.setProperty('--ax', ax + 'px');
    const pad = 5;
    Object.assign(ring.style, { left: tr.left - pad + 'px', top: tr.top - pad + 'px', width: tr.width + pad * 2 + 'px', height: tr.height + pad * 2 + 'px', borderRadius: Math.min(tr.width, tr.height) / 2 + 'px' });
  }
  function placeCentered() { // no element to point at (desktop "WASD"): bottom-centre, no arrow
    const cw = call.offsetWidth, ch = call.offsetHeight;
    call.style.transform = `translate(${Math.round((innerWidth - cw) / 2)}px, ${Math.round(innerHeight - ch - 36)}px)`;
    call.classList.add('none'); call.classList.remove('up', 'down'); ring.classList.remove('on');
  }

  function show(step) {
    cur = step; walked = 0;
    callTxt.textContent = step.text();
    call.hidden = false; call.classList.remove('none');
    ring.classList.add('on');
    void call.offsetWidth;
    { const t = step.target(); if (t) place(step, t); else placeCentered(); }
    call.classList.add('on');
    sfx('pop');
  }

  // ------------------------------------------------------------------ per frame
  let visible = false;
  engine.addUpdate((dt) => {
    const ok = enabled && !store.off && freeNow();
    if (!ok) {
      if (visible) { visible = false; root.classList.add('tbt-hide'); }
      wait = 0;
      if (!helpHidden()) { if (S.phase !== 'play' || ctx.ui?.modalOpen?.() || ctx.minigames?.active || ctx.rides?.active || ctx.finale?.running || cam.shotActive) closeHelp(); }
      return;
    }
    if (!visible) { visible = true; root.classList.remove('tbt-hide'); }
    if (!helpHidden()) { if (cur) dismiss(false); return; }
    if (lastX !== null) walked += Math.hypot(player.pos.x - lastX, player.pos.z - lastZ);
    lastX = player.pos.x; lastZ = player.pos.z;
    if (cur) {
      const t = cur.target();
      if (!t && cur.id !== 'walk') { dismiss(false); return; }
      if (cur.id === 'walk' && walked > 6) { dismiss(true); return; } // they found it
      if (cur.id === 'talk' && !nearGiver()) { dismiss(false); return; }
      if (t) place(cur, t); else placeCentered();
      return;
    }
    quiet -= dt;
    if (quiet > 0) return;
    for (const s of STEPS) {
      if (store.done[s.id]) continue;
      let ready = false;
      try { ready = s.when(); } catch (e) { /* */ }
      if (!ready) { if (s.id === 'walk' || s.id === 'goal') break; else continue; } // the first three go in order
      if (s.target() === null && s.id !== 'walk') continue;
      wait += dt;
      if (wait >= (s.delay || 0)) { wait = 0; show(s); }
      return;
    }
    wait = 0;
  }, 160);
  addEventListener('resize', () => { if (cur) { const t = cur.target(); if (t) place(cur, t); else placeCentered(); } });
  addEventListener('orientationchange', () => setTimeout(() => { if (cur) { const t = cur.target(); if (t) place(cur, t); } }, 250));

  // ------------------------------------------------------------------ help card
  const helpHidden = () => help.hidden;
  function closeHelp() { help.hidden = true; }
  function helpText() {
    const d = data();
    const c = d?.current?.() ?? null;
    const g = ctx.guide?.target || null;
    const obj = ctx.tasks?.objective || null;
    if (c == null) {
      if (d?.dailyAvailable) return 'Your daily gift is waiting by the Advent board. Walk over and open it!';
      if (d && d.state?.(24) === 'open') return 'Santa is coming tonight! Open door 24 at the Advent board.';
      return 'All done for today. Explore, ride, play with friends!';
    }
    const door = d.door(c) || {};
    const place = g?.place || d.districtName?.(door.district) || 'town';
    const dist = g && Number.isFinite(g.dist) && g.dist > 6 ? ` It is about ${Math.round(g.dist)} m away.` : '';
    const follow = 'Follow the arrow at the edge of the screen';
    const isGiver = !obj || /^door-|^focus-/.test(obj.id || '') || g?.kind === 'person';
    if (isGiver && door.giver) return `${door.giver} is waiting in ${place}. ${follow} and tap to talk.${dist}`;
    const what = (obj?.text || door.title || '').replace(/[.!]+$/, '');
    return `Door ${c}, ${door.title || 'your goal'}: ${what}. ${follow}${g ? ` to ${g.label ? g.label : 'get there'}` : ''}.${dist}`;
  }
  function openHelp() {
    if (!(S.phase === 'play') || ctx.ui?.modalOpen?.()) return false;
    if (cur) dismiss(false);
    helpTxt.textContent = helpText();
    wayBtn.hidden = !ctx.guide?.showTrail;
    help.hidden = false;
    return true;
  }
  tap(help.querySelector('.tbt-hok'), closeHelp);
  tap(wayBtn, () => { try { ctx.guide?.showTrail?.(20); } catch (e) { /* */ } closeHelp(); });

  return {
    enabled,
    help() { if (!help.hidden) { closeHelp(); return false; } return openHelp(); },
    closeHelp, skipAll,
    helpText,
    resetAll() { store.off = false; store.done = {}; save(); },
    get current() { return cur?.id || null; },
    get helpOpen() { return !help.hidden; },
    get state() { return { off: store.off, done: { ...store.done } }; },
  };
}
