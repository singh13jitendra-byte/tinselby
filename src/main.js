import './core/theme.css';
import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createGame } from './core/events.js';
import { createColliders } from './core/colliders.js';
import { createInteractions } from './core/interact.js';
import { createInput } from './core/input.js';
import { createPlayer } from './core/player.js';
import { createCameraDirector } from './core/camera.js';
import * as layout from './core/layout.js';
import { buildCity } from './city/index.js';
import { buildLife } from './life/index.js';
import { createTasks } from './game/index.js';
import { createUI } from './ui/index.js';
import { createFinale } from './finale/index.js';
import { createAudio } from './audio/index.js';
import { createProgress } from './progress/index.js';
import { createMiniGames } from './minigames/framework.js';
import { MINIGAMES } from './minigames/index.js';
import { createHouse } from './house/index.js';
import { createCalendar } from './calendar/index.js';
import { createNet } from './net/index.js';
import { createWorld } from './world/index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const uiRoot = document.getElementById('ui');

const engine = createEngine(canvas);
const game = createGame();
const colliders = createColliders();
const interact = createInteractions(game);
const input = createInput(canvas, engine, game, colliders);
const cam = createCameraDirector(engine, game, input); // input: eye-view look / turn controls
const player = createPlayer(engine, input, colliders, game, cam);
cam.follow(player);

/** Shared context handed to every module (see CONTRACTS.md). */
const ctx = { THREE, engine, game, colliders, interact, input, player, cam, layout, uiRoot, params };
ctx.audio = createAudio(ctx);
ctx.city = buildCity(ctx);
ctx.world = createWorld(ctx);
ctx.life = buildLife(ctx);
ctx.progress = createProgress(ctx);
ctx.minigames = createMiniGames(ctx);
for (const def of MINIGAMES) ctx.minigames.register(def);
ctx.house = createHouse(ctx); // wave 2: the player's own cottage (door 10)
ctx.tasks = createTasks(ctx);
ctx.ui = createUI(ctx);
ctx.calendar = createCalendar(ctx);
ctx.net = createNet(ctx);
ctx.finale = createFinale(ctx);
// the wave-end card asks for a sky teaser: use the world's moon fly-by
ctx.teasers = ctx.teasers || {};
if (!ctx.teasers.sky) ctx.teasers.sky = () => ctx.world?.flyby?.();
window.__ctx = ctx; // handy for debugging

// ---------------------------------------------------------------- core loop wiring
let district = null;
engine.addUpdate((dt) => {
  player.update(dt);
  if (game.state.phase === 'play' || game.state.phase === 'finale' || game.state.phase === 'minigame') {
    const d = layout.districtAt(player.pos.x, player.pos.z);
    if (d !== district) {
      const first = !game.state.visited.has(d);
      game.state.visited.add(d);
      const prev = district;
      district = d;
      game.emit('district:enter', { id: d, first, prev });
    }
  }
  interact.update(player.pos.x, player.pos.z, player.controllable);
}, -10);
engine.addUpdate((dt) => cam.update(dt), 100);

game.on('camera:toggle', () => { if (!cam.shotActive) cam.toggleView(); });
game.on('input:gesture', () => ctx.audio.start?.());
game.on('spirit:change', ({ value, max }) => engine.setEvening(value / max));

// entry screen → play
cam.setMode('attract');
game.on('game:start', ({ name, style }) => {
  game.state.playerName = (name || 'Traveller').slice(0, 18);
  if (style) player.setStyle(style);
  game.state.phase = 'play';
  player.teleport(layout.SPAWN.x, layout.SPAWN.z, layout.SPAWN.heading);
  cam.setMode('follow');
  player.controllable = true;
});

// ---------------------------------------------------------------- test / capture hooks
// ?capture  → manual stepping via window.__tinselby.step(dt, n)
// ?play     → skip the entry screen (name "Tester")      ?at=x,z → teleport after start
// ?view=high|close|follow|eye                               ?doors=n → doors 1..n done (progress module)
// ?reveal=all → reveal every district immediately
window.__tinselby = {
  ready: false,
  step(dt = 1 / 30, n = 1) {
    const gl = engine.renderer.getContext(), px = new Uint8Array(4);
    for (let i = 0; i < n; i++) {
      engine.step(dt);
      if (i % 5 === 4) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // keep the GPU queue short in capture mode
    }
    return engine.stats();
  },
  stats() { return { ...engine.stats(), phase: game.state.phase, spirit: game.state.spirit, pos: [+player.pos.x.toFixed(2), +player.pos.z.toFixed(2)], district }; },
  ctx,
};
function applyTestParams() {
  if (params.has('play')) game.emit('game:start', { name: 'Tester' });
  if (params.has('at')) { const [x, z] = params.get('at').split(',').map(Number); player.teleport(x, z); }
  if (params.has('view')) { const v = params.get('view'); if (v === 'follow' || v === 'eye' || v === 'high') cam.setView(v); else cam.setMode(v); }
  if (params.has('reveal')) for (const d of layout.DISTRICTS) ctx.city.revealDistrict?.(d.id, true);
  // ?spirit=n is the old name for ?doors=n (handled by the progress module): festive level n needs doors 1..2n-1
  if (params.has('spirit') && !params.has('doors')) console.warn('[tinselby] ?spirit is retired, use ?doors=N');
}
applyTestParams();
window.__tinselby.ready = true;
engine.start();
