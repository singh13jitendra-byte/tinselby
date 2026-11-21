// Mini-game framework (lead-owned). Each game is a module exporting a definition:
//   export default { id, title, district, icon?, intro: '…how to play…', start(ctx, mg, opts) }
// start() sets up its props/camera/controls, runs, and eventually calls mg.finish({ score, stars, text }).
// The framework owns: phase switching, intro card + 3-2-1, the in-game HUD (score / timer / goal),
// the results card (stars, best, Play again / Done), and automatic cleanup of everything registered via mg.
import './minigames.css';

const params = new URLSearchParams(location.search);

export function createMiniGames(ctx) {
  const { engine, game, player, cam, uiRoot } = ctx;
  const games = new Map();
  let active = null;

  const layer = document.createElement('div');
  layer.className = 'mg-layer';
  uiRoot.appendChild(layer);

  const api = {
    register(def) { games.set(def.id, def); return def; },
    get(id) { return games.get(id); },
    list() { return [...games.values()]; },
    get active() { return active ? active.id : null; },
    /**
     * Play a registered game. Resolves { id, score, stars (0–3), best, completed } when the player
     * presses Done on the results card (or quits). "Play again" restarts without resolving.
     */
    play(id, opts = {}) {
      const def = games.get(id);
      if (!def) return Promise.reject(new Error('unknown mini-game ' + id));
      if (active) return Promise.reject(new Error('a mini-game is already running'));
      return new Promise((resolve) => {
        const prevPhase = game.state.phase === 'minigame' ? 'play' : game.state.phase;
        game.state.phase = 'minigame';
        let bestRun = null; // best completed run this visit: "Play again" then quitting must not lose a won door
        const run = () => {
          const mg = makeSession(def, opts, (result) => {
            if (result.completed && (!bestRun || result.stars > bestRun.stars || (result.stars === bestRun.stars && result.score > bestRun.score))) bestRun = result;
            const finish = () => {
              active = null;
              game.state.phase = prevPhase;
              player.controllable = true;
              ctx.input.enabled = true;
              cam.setMode('follow');
              const out = bestRun && !result.completed ? { ...bestRun, quit: result.quit } : result;
              game.emit('minigame:end', { id, ...out });
              resolve({ id, ...out });
            };
            if (result.quit) { mg._dispose(); finish(); return; } // ✕ leaves straight away, no results card
            showResults(def, result, () => { mg._dispose(); run(); }, () => { mg._dispose(); finish(); });
          });
          active = mg;
          game.emit('minigame:start', { id });
          try {
            const r = def.start(ctx, mg, opts);
            if (r && r.catch) r.catch((e) => { console.error('[minigame ' + id + ']', e); mg.finish({ score: 0, stars: 0, text: 'Oops — something went wrong.' }); });
          } catch (e) {
            console.error('[minigame ' + id + ']', e);
            mg.finish({ score: 0, stars: 0, text: 'Oops — something went wrong.' });
          }
        };
        run();
      });
    },
    /** Abort the running game (counts as not completed). */
    quit() { if (active) active.finish({ score: 0, stars: 0, text: 'Maybe next time!', quit: true }); },
  };

  // ---------------------------------------------------------------- per-run session helper
  function makeSession(def, opts, onFinish) {
    const disposers = [];
    const objects = [];
    let finished = false;
    let hud = null;

    player.controllable = false;
    const mg = {
      id: def.id,
      opts,
      /** Best previous result for this game, if the progress module tracks it. */
      get best() { return ctx.progress?.best?.(def.id) ?? null; },
      /** Show the intro card and the 3-2-1 countdown. Resolves when play should begin. */
      intro({ title = def.title, text = (def.introTouch && (engine.isMobile || matchMedia('(pointer: coarse)').matches)) ? def.introTouch : def.intro, icon = def.icon } = {}) {
        return new Promise((resolve) => {
          const card = el('div', 'knit-card mg-intro interactive', layer);
          if (icon && String(icon).trim().startsWith('<svg')) el('div', 'mg-icon', card).innerHTML = icon; // SVG only (no emoji)
          el('h2', '', card).textContent = title;
          el('p', '', card).textContent = text || '';
          const b = el('button', 'knit-btn green', card);
          b.textContent = 'Start';
          const go = () => {
            card.remove();
            countdown(resolve);
          };
          b.addEventListener('click', (e) => { e.stopPropagation(); ctx.audio?.sfx?.('ui'); go(); });
          const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.removeEventListener('keydown', onKey, true); go(); } };
          window.addEventListener('keydown', onKey, true);
          disposers.push(() => { window.removeEventListener('keydown', onKey, true); card.remove(); });
          if (engine.capture || params.has('mgauto')) setTimeout(go, 50);
        });
      },
      hud: {
        _ensure() {
          if (hud) return hud;
          hud = el('div', 'mg-hud', layer);
          hud.goal = el('div', 'mg-goal knit-card', hud);
          hud.score = el('div', 'mg-score knit-card', hud);
          hud.timer = el('div', 'mg-timer knit-card', hud);
          hud.score.hidden = hud.timer.hidden = hud.goal.hidden = true;
          const quit = el('button', 'knit-btn cream round mg-quit interactive', hud);
          quit.textContent = '✕';
          quit.title = 'Leave';
          quit.addEventListener('click', (e) => { e.stopPropagation(); api.quit(); });
          return hud;
        },
        setScore(v, label = 'Score') { const h = this._ensure(); h.score.hidden = false; h.score.innerHTML = `<small>${label}</small><b>${v}</b>`; },
        setTimer(sec) { const h = this._ensure(); if (sec == null) { h.timer.hidden = true; return; } h.timer.hidden = false; const s = Math.max(0, Math.ceil(sec)); h.timer.innerHTML = `<small>Time</small><b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b>`; h.timer.classList.toggle('low', s <= 5); },
        setGoal(text) { const h = this._ensure(); h.goal.hidden = !text; h.goal.textContent = text || ''; },
        toast(text) { game.emit('ui:toast', { text }); },
      },
      /** Register a per-frame update fn(dt, t); removed automatically. */
      addUpdate(fn, order = 50) { disposers.push(engine.addUpdate((dt, t) => { if (!finished) fn(dt, t); }, order)); },
      /** Add an Object3D to the scene; removed automatically. */
      add(obj) { engine.scene.add(obj); objects.push(obj); return obj; },
      /** Run fn when the game ends (cleanup of colliders, interactions, listeners …). */
      onDispose(fn) { disposers.push(fn); },
      /** Tap/click on the 3D view: cb({ x, y } NDC, event). Tap-to-walk is disabled while a game runs. */
      onTap(cb) {
        const h = (e) => {
          if (finished || e.target !== engine.renderer.domElement) return;
          cb({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, e);
        };
        window.addEventListener('pointerdown', h);
        disposers.push(() => window.removeEventListener('pointerdown', h));
      },
      onKey(cb) {
        const h = (e) => { if (!finished) cb(e); };
        window.addEventListener('keydown', h);
        disposers.push(() => window.removeEventListener('keydown', h));
      },
      /** Hide the player's doll (e.g. for close-up camera games); restored automatically. */
      setPlayerVisible(on) {
        player.object.visible = !!on;
        if (!on && !mg._visRestore) { mg._visRestore = true; disposers.push(() => { player.object.visible = true; }); }
      },
      /** Let the player walk with joystick / keys during the game (default: off). */
      setPlayerControl(on) { player.controllable = !!on; ctx.input.enabled = !!on; if (!on) ctx.input.clearTap(); },
      /** End the run. stars: 0–3 (≥1 counts as completed). */
      finish({ score = 0, stars = 0, text = '', quit = false } = {}) {
        if (finished) return;
        finished = true;
        const best = mg.best;
        const result = { score, stars: Math.max(0, Math.min(3, stars | 0)), text, quit, completed: !quit && stars >= 1 };
        result.newBest = !quit && (best == null || score > (best.score ?? -Infinity));
        ctx.progress?.recordMiniGame?.(def.id, result);
        hud?.remove(); hud = null;
        setTimeout(() => onFinish(result), 350);
      },
      get finished() { return finished; },
      _dispose() {
        for (const d of disposers.splice(0)) { try { d(); } catch (e) { console.error(e); } }
        for (const o of objects.splice(0)) o.removeFromParent();
        hud?.remove(); hud = null;
      },
    };
    ctx.input.clearTap();
    return mg;
  }

  function countdown(done) {
    let n = 3;
    const c = el('div', 'mg-count', layer);
    const tick = () => {
      if (n === 0) { c.textContent = 'Go!'; c.className = 'mg-count go'; ctx.audio?.sfx?.('bell'); setTimeout(() => { c.remove(); done(); }, engine.capture ? 10 : 550); return; }
      c.textContent = String(n);
      c.className = 'mg-count'; void c.offsetWidth; c.className = 'mg-count pop';
      ctx.audio?.sfx?.('countdown');
      n--;
      setTimeout(tick, engine.capture ? 10 : 650);
    };
    tick();
  }

  function showResults(def, r, onAgain, onDone) {
    const card = el('div', 'knit-card mg-results interactive', layer);
    el('h2', '', card).textContent = r.quit ? def.title : r.stars >= 3 ? 'Brilliant!' : r.stars >= 1 ? 'Well done!' : 'So close!';
    const st = el('div', 'mg-stars', card);
    for (let i = 0; i < 3; i++) el('span', i < r.stars ? 'on' : '', st).textContent = '★';
    if (!r.quit) el('div', 'mg-res-score', card).textContent = `Score ${r.score}${r.newBest ? ' · new best!' : ''}`;
    if (r.text) el('p', '', card).textContent = r.text;
    const row = el('div', 'mg-row', card);
    const again = el('button', 'knit-btn cream', row);
    again.textContent = 'Play again';
    const done = el('button', 'knit-btn green', row);
    done.textContent = 'Done';
    again.addEventListener('click', (e) => { e.stopPropagation(); ctx.audio?.sfx?.('ui'); card.remove(); onAgain(); });
    done.addEventListener('click', (e) => { e.stopPropagation(); ctx.audio?.sfx?.('ui'); card.remove(); onDone(); });
    if (r.stars >= 1) ctx.audio?.sfx?.('task');
    if (engine.capture || params.has('mgauto')) setTimeout(() => { if (card.isConnected) { card.remove(); onDone(); } }, 1500);
  }

  // test hook: ?mg=<id> starts that game right after game:start (add &mgauto to skip cards)
  if (params.has('mg')) game.once('game:start', () => setTimeout(() => api.play(params.get('mg')).catch((e) => console.error(e)), 600));

  return api;
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}
