// UI: entry screen (name + character), in-game HUD, wardrobe, reward cards, toasts, speech bubbles, portrait overlay.
// See CONTRACTS.md §UI and WAVE1.md §Calendar & UI.
import './ui.css';
import { createEntry } from './entry.js';
import { createHUD } from './hud.js';
import { createOverlays } from './overlays.js';
import { createWardrobe } from './wardrobe.js';
import { createCards } from './cards.js';
import { saveProfile } from './profile.js';
import { createChoose } from './choose.js';
import { createData } from '../calendar/data.js';
import { rewardTint } from '../calendar/board.js';

export function createUI(ctx) {
  const { game, engine, uiRoot } = ctx;
  const data = createData(ctx);
  const overlays = createOverlays(ctx, uiRoot);
  const chooser = createChoose(ctx, uiRoot);
  const ui = {
    modalOpen: () => !!(ctx.calendar?.isOpen || ui.wardrobe?.isOpen || ctx.house?.isOpen || uiRoot.classList.contains('tb-house-open') || chooser?.isOpen),
    screenAngle: overlays.screenAngle,
    wardrobe: null,
  };
  const hud = createHUD(ctx, uiRoot, data, ui);
  ui.wardrobe = createWardrobe(ctx, data);

  function wear(slot, key) {
    if (!slot || !key) return;
    try { ctx.player.setStyle({ ...game.state.style, [slot]: key }); } catch (e) { console.error('[ui] wear', e); }
    saveProfile({ style: { ...game.state.style } });
    try { ctx.net?.setStyle?.({ ...game.state.style }); } catch (e) { /* offline */ }
  }
  const cards = createCards(ctx, data, {
    wear, tint: rewardTint, modalOpen: ui.modalOpen,
    onShowDoors: () => { const c = data.current(); if (c) hint(c, `Door ${c} · ${data.door(c)?.title || ''} — ${data.findText(c)}`, true); },
  });

  /**
   * Point the way to door n's giver: toast with a live arrow + 'hint:target'. focus → also steer the game's arrow and
   * task chip there (tasks.focusDoor; calendar taps), else the game's own objective already leads to the current door.
   */
  let focusedDoor = null;
  function hint(n, text, focus = true) {
    const s = data.spot(n);
    if (!s) return;
    const find = data.findText(n);
    let focused = false;
    if (focus) try { focused = !!ctx.tasks?.focusDoor?.(n); if (focused) focusedDoor = n; } catch (e) { /* game module still a stub */ }
    // the game's arrow + task chip follow focusDoor / its objective; our HUD pill is the fallback when there's neither
    const gameArrow = focused || (!focus && !!ctx.tasks?.objective);
    hud.setHint(gameArrow ? null : { x: s.x, z: s.z, text: find, n });
    game.emit('hint:target', { x: s.x, z: s.z, n, text: find });
    overlays.toast(text || find, 4800, { x: s.x, z: s.z });
  }

  // door flow: newly opened doors get a toast + hint; the wave-end teaser follows the last available door
  game.on('door:open', ({ n } = {}) => {
    if (!n || game.state.phase === 'entry') return;
    setTimeout(() => {
      const d = data.door(n);
      if (!d || data.state(n) !== 'open') return;
      hint(n, `Door ${n} is open: ${d.title}! ${data.findText(n)}`, false);
      try { ctx.audio?.sfx?.('bell'); } catch (e) { /* */ }
    }, cards.busy ? 2400 : 500);
  });
  game.on('door:complete', ({ n } = {}) => {
    if (n && n === focusedDoor) { focusedDoor = null; try { ctx.tasks?.clearFocus?.(); } catch (e) { /* */ } }
    setTimeout(() => { if (data.waveDone()) cards.waveEnd(); }, 1400);
  });

  let entry = null;
  if (game.state.phase === 'entry') entry = createEntry(ctx, uiRoot, data);
  game.on('game:start', () => {
    entry?.hide();
    entry = null;
    // a friendly pointer to the first open door
    setTimeout(() => {
      const c = data.current();
      if (c && game.state.phase === 'play' && !hud.hint) hint(c, `Door ${c} · ${data.door(c)?.title || ''} — ${data.findText(c)}`, false);
    }, 2600);
  });
  engine.addUpdate((dt) => {
    hud.update(dt);
    overlays.update(dt);
    cards.update(dt);
  }, 150);
  return {
    toast: (text, ms, opts) => overlays.toast(text, ms, opts),
    choose: (spec) => chooser.choose(spec),
    say: (d) => overlays.say(d),
    get entry() { return entry; },
    hud, cards, data, hint, wear,
    wardrobe: ui.wardrobe,
    openWardrobe: () => ui.wardrobe.open(),
    closeWardrobe: () => ui.wardrobe.close(),
    modalOpen: ui.modalOpen,
  };
}
