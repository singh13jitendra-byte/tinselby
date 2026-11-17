// UI: entry screen, in-game HUD, toasts, speech bubbles, portrait overlay. See CONTRACTS.md §UI.
import './ui.css';
import { createEntry } from './entry.js';
import { createHUD } from './hud.js';
import { createOverlays } from './overlays.js';

export function createUI(ctx) {
  const { game, engine, uiRoot } = ctx;
  const overlays = createOverlays(ctx, uiRoot);
  const hud = createHUD(ctx, uiRoot);
  let entry = null;
  if (game.state.phase === 'entry') entry = createEntry(ctx, uiRoot);
  game.on('game:start', () => {
    entry?.hide();
    entry = null;
  });
  engine.addUpdate((dt) => {
    hud.update(dt);
    overlays.update(dt);
  }, 150);
  return {
    toast: (text, ms) => overlays.toast(text, ms),
    say: (d) => overlays.say(d),
    get entry() { return entry; },
    hud,
  };
}
