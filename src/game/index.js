// Gameplay (wave 1): Advent doors in town. Doors 1–4 are the original tasks (lights, bauble, scarf, star), doors 5–8
// start mini-games, door 24 (Christmas Eve) places the star → finale. Only the current door's giver shows the star
// marker and starts its activity; givers of done doors thank you (mini-game givers offer "Play again").
// Progress lives in ctx.progress (src/progress); this module only reads door states and calls progress.complete.
import { makeModels } from './models.js';
import { createGiver } from './givers.js';
import { GIVERS, LINES, fill } from './lines.js';
import { createHintArrow } from './hints.js';
import { createActivities } from './tasks.js';

export const GIVER_DOORS = [1, 2, 3, 4, 5, 6, 7, 8, 24];
const PREP = { residential: 'on', hill: 'on', lakeside: 'by', park: 'in', market: 'in' };
/** Spots moved from layout.DOOR_SPOTS: (3.2, 10.2) is right behind the park gazebo, whose roof hides Tilly and her
 * marker from the camera; she waits on the open snow just south of it, beside the snowball clearing. */
const SPOT_OVERRIDE = { 5: { x: 3.5, z: 13.0 } };

export function createTasks(ctx) {
  const { engine, game, interact, player, layout } = ctx;
  const S = game.state;
  const models = makeModels(engine.mat);
  const prog = () => ctx.progress || null;
  /** Door state from progress ('locked' | 'open' | 'done' | 'soon'); without progress doors 1–4 are simply open. */
  const ds = (n) => {
    try { const s = prog()?.state?.(n); if (s) return s; } catch (e) { /* stub */ }
    return n <= 4 ? 'open' : 'locked';
  };
  const current = () => { try { const c = prog()?.current?.(); return typeof c === 'number' ? c : null; } catch (e) { return null; } };
  const doorMeta = (n) => { try { return prog()?.door?.(n) || prog()?.doors?.[n - 1] || null; } catch (e) { return null; } };
  const completeDoor = (n, r = { stars: 1, score: 0 }) => { try { return prog()?.complete?.(n, r); } catch (e) { console.error('[tasks] progress.complete', e); return false; } };
  const dailyAvailable = () => { try { return !!prog()?.daily?.available; } catch (e) { return false; } };
  const districtName = (id) => layout.DISTRICTS.find((d) => d.id === id)?.name || 'Tinselby';
  /** "Tilly in Pinecone Park" */
  const whereText = (n) => {
    const g = GIVERS[n], dist = layout.DOOR_SPOTS[n]?.district;
    return g ? `${g.who} ${PREP[dist] || 'in'} ${districtName(dist)}` : '';
  };
  const vars = (extra = {}) => {
    const c = current();
    return { name: S.playerName || 'friend', next: c && GIVERS[c] ? whereText(c) : 'someone else', ...extra };
  };
  function say(n, key, extra) {
    const g = givers[n], text = LINES[n]?.[key];
    if (!g || !text) return;
    game.emit('dialog', { who: g.who, text: fill(text, vars(extra)), pos: g.headPos().clone(), id: n, door: n });
  }
  const toast = (text, ms) => game.emit('ui:toast', { text, ms });
  const sfx = (name, x, z) => { try { ctx.audio?.sfx?.(name, x != null ? { x, z } : undefined); } catch (e) { /* audio optional */ } };

  // ------------------------------------------------------------ quest givers (one per door; the Mayor by the tree)
  const givers = {};
  const tree = layout.MARKET.tree;
  for (const n of GIVER_DOORS) {
    const spot = SPOT_OVERRIDE[n] || layout.DOOR_SPOTS[n] || { x: 0, z: 0 };
    const pos = n === 24 ? { x: tree.x - 0.8, z: tree.z + 1.25 } : spot; // Mayor stands at the tree's front-left; the star stand is front-right
    givers[n] = createGiver(ctx, models, { id: n, ...GIVERS[n], x: pos.x, z: pos.z });
  }

  const acts = createActivities(ctx, { models, givers, say, toast, sfx, ds, completeDoor });

  // ------------------------------------------------------------ mini-game doors (5–8)
  let pending = null; // { n, id, at } — short pause after the giver's line, then the game starts
  let playingDoor = null;
  function startGame(n) {
    if (pending || playingDoor || ctx.minigames?.active) return;
    const id = doorMeta(n)?.game || GIVERS[n].game;
    const mg = ctx.minigames;
    if (!mg?.play || (mg.get && !mg.get(id))) { toast(`${doorMeta(n)?.title || 'This game'} is coming soon!`); return; }
    pending = { n, id, at: engine.time + 1.1 };
    player.controllable = false;
    player.faceTowards(givers[n].x, givers[n].z);
  }
  async function launch({ n, id }) {
    if (S.phase !== 'play') return;
    playingDoor = n;
    let r = null;
    try { r = await ctx.minigames.play(id); } catch (e) { console.error('[tasks] mini-game ' + id, e); }
    playingDoor = null;
    if (S.phase === 'play') player.controllable = true;
    if (!r) return;
    if (r.completed) {
      const first = ds(n) !== 'done';
      completeDoor(n, { score: r.score, stars: r.stars });
      say(n, first ? 'done' : 'replay');
      givers[n].hop();
    } else say(n, 'retry');
  }

  // ------------------------------------------------------------ talking to givers
  function onGiver(n) {
    givers[n].wave();
    const s = ds(n);
    if (n === 24) {
      if (s === 'done' || S.starPlaced) say(24, 'after');
      else if (s === 'open') say(24, 'open');
      else say(24, acts.starHome ? 'resting' : 'greet');
      return;
    }
    if (n <= 4) {
      if (s === 'open') acts.onGiver(n);
      else say(n, s === 'done' ? 'after' : 'locked');
      return;
    }
    if (s === 'open') { say(n, 'accept'); startGame(n); }
    else if (s === 'done') { say(n, 'again'); startGame(n); }
    else say(n, 'locked');
  }
  for (const n of GIVER_DOORS) {
    const g = givers[n];
    g.spot = interact.add({
      id: 'giver-' + n, x: g.x, z: g.z, r: 1.0, label: `Talk to ${g.who}`, icon: 'talk',
      // the Mayor steps aside while you carry the star to the tree, and on Christmas Eve (the tree spot takes over)
      enabled: () => S.phase === 'play' && !pending && !playingDoor && (n !== 24 || (!acts.st.hasStar && !acts.st.placing && ds(24) !== 'open')),
      onInteract: () => onGiver(n),
    });
  }

  // ------------------------------------------------------------ objective (HUD task chip) + hint arrow
  const AB = layout.ADVENT_BOARD;
  const { HILL } = layout;
  let focus = null; // calendar "show me" override: { x, z, text, icon, until }
  function pickObjective() {
    if (S.phase !== 'play') return null;
    if (focus) {
      if (engine.time > focus.until || Math.hypot(focus.x - player.pos.x, focus.z - player.pos.z) < 1.3) focus = null;
      else return focus;
    }
    const n = current();
    let o = null;
    if (acts.st.hand) o = acts.objective(n);
    else if (n != null && (n <= 4 || n === 24)) o = acts.objective(n);
    else if (n != null && givers[n]) o = { id: 'door-' + n, text: `Find ${whereText(n)}`, icon: 'talk', x: givers[n].x, z: givers[n].z };
    else if (n == null && dailyAvailable()) o = { id: 'daily', text: 'Open your daily gift by the Advent board', icon: 'gift', x: AB.x, z: AB.z };
    if (!o) return null;
    o.door = n;
    // up on the hill top with nothing left to do up here → ride back down first
    const wantsTop = n === 4 && !acts.st.hasStar && o.id === 'star' && o.text === 'Grab the tree star';
    if (acts.onTop() && !wantsTop) o = { ...o, text: 'Ride the cable car down', icon: 'cable', x: HILL.cableTop.x, z: HILL.cableTop.z };
    return o;
  }
  const arrow = createHintArrow(ctx, models);
  let objective = null;

  // keep things in step with progress
  acts.sync();
  game.on('progress:reset', () => { pending = null; focus = null; acts.sync({ reset: true }); });
  game.on('door:complete', () => acts.sync());

  // ------------------------------------------------------------ per-frame
  engine.addUpdate((dt, t) => {
    if (pending && engine.time >= pending.at) {
      const p = pending;
      pending = null;
      if (S.phase === 'play') launch(p);
      else player.controllable = S.phase === 'play';
    }
    const pl = S.phase === 'play';
    for (const n of GIVER_DOORS) {
      const g = givers[n], s = ds(n);
      const carryingFor = acts.st.hand && n <= 4 && GIVERS[n].task === acts.st.hand;
      g.showMarker = pl && (s === 'open' || !!carryingFor);
      const over = n <= 4 ? acts.giverLabel(n) : null;
      if (over) { g.spot.label = over.label; g.spot.icon = over.icon; }
      else if (n >= 5 && n <= 8 && s === 'done') { g.spot.label = `Play again with ${g.who}`; g.spot.icon = 'star'; }
      else { g.spot.label = `Talk to ${g.who}`; g.spot.icon = 'talk'; }
      g.update(dt, t);
    }
    acts.update(dt, t);
    objective = pickObjective();
    arrow.update(dt, t, objective);
  }, 5);

  return {
    /** Current objective {id, door, text, icon, x, z} or null (HUD task chip + hint arrow). */
    get objective() { return objective; },
    /** Legacy task state (lit houses, carried item, star …). */
    state: acts.st,
    /** Quest givers by door number (1–8, 24). */
    givers,
    doorGivers: givers,
    /** Where a door's giver stands: {x, z, district, who} (door 24 → the Mayor by the tree). */
    giverPos(n) {
      const g = givers[n];
      return g ? { x: g.x, z: g.z, district: layout.DOOR_SPOTS[n]?.district, who: g.who } : null;
    },
    /** "Tilly in Pinecone Park" */
    whereText,
    /** Point the hint arrow + task chip at a door's giver for a while (calendar "Find {giver}"), until reached. */
    focusDoor(n, ms = 45000) {
      const g = givers[n];
      if (!g) return false;
      focus = { id: 'focus-' + n, door: n, text: `Find ${whereText(n)}`, icon: 'talk', x: g.x, z: g.z, until: engine.time + ms / 1000 };
      return true;
    },
    /** Point the hint arrow anywhere: {x, z, text, icon, ms}. */
    pointTo({ x, z, text = '', icon = 'star', ms = 45000 } = {}) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      focus = { id: 'focus', door: null, text, icon, x, z, until: engine.time + ms / 1000 };
      return true;
    },
    clearFocus() { focus = null; },
    /** Door whose mini-game is running (or null). */
    get playingDoor() { return playingDoor; },
    get pendingGame() { return pending; },
    /** The star stand beside the tree ({x, z}). */
    starStand: acts.stand,
    /** Debug: stand a row of dolls in the given styles (screenshots of wardrobe pieces). Resolves {group, remove, tris}. */
    debugLineup: (styles, opts) => import('./debug.js').then((m) => m.lineup(ctx, styles, opts)),
    /** Self-test: plays doors 1–8 (teleport + 'interact'), checks progress, rewards, festive levels, persistence. */
    selfTest: (opts) => import('./selftest.js').then((m) => m.runSelfTest(ctx, opts)),
  };
}
