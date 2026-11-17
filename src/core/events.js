// Game state + event bus. Every module talks through this; see CONTRACTS.md for the event list.
export function createGame() {
  const handlers = new Map();
  const game = {
    state: {
      phase: 'entry', // entry | play | finale | end
      playerName: '',
      style: { coat: 'red', hat: 'bobble', scarf: 'green' },
      spirit: 0,
      spiritMax: 4,
      tasks: { lights: 'available', bauble: 'available', scarf: 'available', star: 'available' }, // available | active | done
      carrying: null, // item id the player holds
      visited: new Set(),
      starPlaced: false,
    },
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(fn);
      return () => handlers.get(evt).delete(fn);
    },
    once(evt, fn) {
      const off = game.on(evt, (d) => { off(); fn(d); });
      return off;
    },
    emit(evt, data = {}) {
      const hs = handlers.get(evt);
      if (hs) for (const fn of [...hs]) {
        try { fn(data); } catch (e) { console.error('[event ' + evt + ']', e); }
      }
      const any = handlers.get('*');
      if (any) for (const fn of [...any]) fn({ evt, data });
    },
    /** Mark a task done, bump spirit, emit task:complete and spirit:change. */
    completeTask(id) {
      if (game.state.tasks[id] === 'done') return;
      game.state.tasks[id] = 'done';
      game.state.spirit = Math.min(game.state.spiritMax, game.state.spirit + 1);
      game.emit('task:complete', { id });
      game.emit('spirit:change', { value: game.state.spirit, max: game.state.spiritMax });
    },
    allTasksDone() {
      return Object.values(game.state.tasks).every((s) => s === 'done');
    },
  };
  return game;
}
