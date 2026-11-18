// Door 10, "Your Own House" (task `house`): Mayor Tinsel gives you the cottage on Holly Lane → walk there → "Open your
// cottage" → first-time decorate panel (ctx.house.decorate, owned by src/house) → door done → Mrs Holly greets her new
// neighbour. After that the house module's own spot handles redecorating. (WAVE2.md §Door 10, §Activity interface.)
import { HOUSE } from '../../core/layout.js';
import { LINES, fill } from '../lines.js';

export default function create(ctx, env) {
  const { game, interact, player } = ctx;
  const S = game.state;
  const n = env.n;
  let accepted = false; // not saved: after a reload the Mayor offers the cottage again
  let opening = false;
  let auto = false; // selftest: decorate resolves at once

  const playing = () => S.phase === 'play';
  const houseOpen = () => !!ctx.house?.isOpen;
  const name = () => S.playerName || 'friend';

  function greetNeighbour() {
    const holly = env.givers[1];
    const near = holly && Math.hypot(holly.x - player.pos.x, holly.z - player.pos.z) <= 7;
    if (near) env.say(1, 'neighbour');
    else env.toast(fill(LINES[1].neighbour, { name: name() }), 4200);
  }

  async function open() {
    if (opening || !playing() || env.ds(n) !== 'open' || !accepted) return;
    opening = true;
    try {
      let style = null;
      try { style = await ctx.house?.decorate?.({ first: true, auto }); } catch (e) { console.error('[house] decorate', e); }
      // the house module saves on Done / ✕; make sure a style is stored even if it is the stub or it was skipped
      try {
        const store = ctx.progress?.house;
        if (store && !store.get?.()) store.set(style || ctx.house?.DEFAULT || { wreath: 'holly', lights: 'warm', door: 'red', snowman: 'none' });
      } catch (e) { console.warn('[house] save style', e); }
      if (env.ds(n) !== 'open') return; // reset or completed meanwhile
      env.toast(fill(LINES[n].done, { name: name() }), 3600);
      env.taskComplete('house');
      env.completeDoor(n);
      greetNeighbour();
    } finally {
      opening = false;
    }
  }

  interact.add({
    id: 'house-unlock', x: HOUSE.door.x, z: HOUSE.door.z, r: 0.8, label: 'Open your cottage', icon: 'home',
    enabled: () => playing() && env.ds(n) === 'open' && accepted && !houseOpen() && !opening,
    onInteract: () => { open(); },
  });

  return {
    id: 'house', n,
    get busy() { return opening || houseOpen(); },
    get accepted() { return accepted; },
    onGiver() {
      if (!accepted) { accepted = true; env.say(n, 'accept'); } else env.say(n, 'remind');
    },
    objective() {
      if (!accepted || env.ds(n) !== 'open') return null;
      return { id: 'house', text: 'Visit your cottage on Holly Lane', icon: 'home', x: HOUSE.door.x, z: HOUSE.door.z };
    },
    giverLabel: () => null,
    update() {},
    sync({ reset = false } = {}) {
      if (reset || env.ds(n) !== 'open') accepted = false;
    },
    async selfTest(T) {
      await T.talk(n);
      T.check(accepted, 'house: Mayor offered the cottage (accepted)');
      T.check(ctx.tasks.objective && ctx.tasks.objective.id === 'house', 'house: objective → visit your cottage (' + (ctx.tasks.objective && ctx.tasks.objective.text) + ')');
      auto = true;
      await T.go(HOUSE.door.x, HOUSE.door.z, 'house-unlock');
      for (let i = 0; i < 100 && env.ds(n) !== 'done'; i++) { T.step(1); await T.tick(20); }
      auto = false;
      T.check(env.ds(n) === 'done', 'house: cottage opened, door done');
    },
  };
}
