// Gameplay: Advent doors in town. Doors 1–4 are the original tasks (lights, bauble, scarf, star), doors 5–8 start
// mini-games, door 24 (Christmas Eve) places the star → finale. Wave 2 (?w2): doors 9–16 (mini-games 9/11/12/13/16, task
// activities 10/14/15 from ./w2/*) with 4 new dolls and shared dolls (doors 9/10/13/16 reuse dolls 3/24/2/7). Only the current door's giver shows the star
// marker and starts its activity; givers of done doors thank you (mini-game givers offer "Play again").
// Progress lives in ctx.progress (src/progress); this module only reads door states and calls progress.complete.
import { makeModels } from './models.js';
import { createGiver } from './givers.js';
import { GIVERS, LINES, fill } from './lines.js';
import { createHintArrow } from './hints.js';
import { createActivities } from './tasks.js';
import createHouseActivity from './w2/house.js';
import createGnomesActivity from './w2/gnomes.js';
import createReindeerActivity from './w2/reindeer.js';

export const GIVER_DOORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 24];
const W2_ACTIVITIES = { house: createHouseActivity, gnomes: createGnomesActivity, reindeer: createReindeerActivity };
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

  // ------------------------------------------------------------ quest givers (one doll per giver; shared dolls serve several doors)
  // Doors 9 / 10 / 13 / 16 reuse the dolls of doors 3 / 24 / 2 / 7 (`doll` in GIVERS); givers[9] === givers[3].
  // New wave-2 dolls (11, 12, 14, 15) are only built while their door is available (no ?w2 → exactly wave 1).
  const givers = {};
  const dolls = []; // unique dolls: the giver object, with .doors = every door it serves (ascending)
  const tree = layout.MARKET.tree;
  for (const n of GIVER_DOORS) {
    if (GIVERS[n].doll) continue;
    if (n >= 9 && n < 24 && !doorMeta(n)?.available) continue;
    const spot = SPOT_OVERRIDE[n] || layout.DOOR_SPOTS[n] || { x: 0, z: 0 };
    const pos = n === 24 ? { x: tree.x - 0.8, z: tree.z + 1.25 } : spot; // Mayor stands at the tree's front-left; the star stand is front-right
    const g = createGiver(ctx, models, { id: n, ...GIVERS[n], x: pos.x, z: pos.z });
    g.doors = [n];
    givers[n] = g;
    dolls.push(g);
  }
  for (const n of GIVER_DOORS) {
    const base = GIVERS[n].doll;
    if (!base || !givers[base]) continue;
    givers[n] = givers[base];
    givers[base].doors.push(n);
  }
  for (const g of dolls) g.doors.sort((a, b) => a - b);

  // wave-2 task doors (10 house, 14 gnomes, 15 reindeer) are plug-in activities (WAVE2.md §Activity interface)
  const taskComplete = (id) => game.emit('task:complete', { id });
  const activities = {};
  const actEnv = { models, givers, say, toast, sfx, ds, completeDoor, taskComplete };
  for (const n of GIVER_DOORS) {
    const id = n >= 9 ? GIVERS[n].task : null;
    if (!id || !W2_ACTIVITIES[id] || !doorMeta(n)?.available) continue;
    try { activities[id] = W2_ACTIVITIES[id](ctx, { ...actEnv, n, giver: givers[n] }); } catch (e) { console.error('[tasks] activity ' + id, e); }
  }
  const actList = Object.values(activities);
  const actFor = (n) => activities[GIVERS[n]?.task] || null;
  const w2Busy = () => actList.some((a) => a.busy);

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
  let choosing = false;
  /** What talking to this doll does right now (WAVE2.md §Doors agent): { type, n, key?, doors? }. */
  function resolve(doll) {
    const list = doll.doors;
    // 1. the first of its doors (ascending) that is open handles the talk
    const open = list.find((n) => ds(n) === 'open');
    if (open != null) {
      if (open === 24) return { type: 'line', n: 24, key: 'open' };
      if (open <= 4) return { type: 'task1', n: open };
      if (GIVERS[open].task) return { type: 'activity', n: open };
      return { type: 'game', n: open };
    }
    // 2. replay: mini-game doors this doll has done (one → play again, several → ask which)
    const doneGames = list.filter((n) => n !== 24 && ds(n) === 'done' && GIVERS[n].game);
    if (doneGames.length === 1) return { type: 'again', n: doneGames[0] };
    if (doneGames.length > 1) return { type: 'choose', doors: doneGames };
    // 3. a line: the Mayor's wave-1 logic, else the `after` of the highest done door, else the `locked` of the lowest locked door
    if (list.includes(24)) {
      if (ds(24) === 'done' || S.starPlaced) return { type: 'line', n: 24, key: 'after' };
      if (ds(10) === 'done' && !acts.starHome) return { type: 'line', n: 10, key: 'after' };
      if (ds(10) === 'locked' && prog()?.doneCount?.() > 0) return { type: 'line', n: 10, key: 'locked' };
      return { type: 'line', n: 24, key: acts.starHome ? 'resting' : 'greet' };
    }
    const done = list.filter((n) => ds(n) === 'done');
    if (done.length) { const n = done[done.length - 1]; return { type: 'line', n, key: LINES[n]?.after ? 'after' : 'again' }; }
    const locked = list.find((n) => ds(n) === 'locked');
    return locked != null ? { type: 'line', n: locked, key: 'locked' } : { type: 'none' };
  }
  async function onDoll(doll) {
    doll.wave();
    const a = resolve(doll);
    switch (a.type) {
      case 'task1': acts.onGiver(a.n); break;
      case 'activity': { const act = actFor(a.n); if (act) act.onGiver(); else toast(`${doorMeta(a.n)?.title || 'This'} is coming soon!`); break; }
      case 'game': say(a.n, 'accept'); startGame(a.n); break;
      case 'again': say(a.n, 'again'); startGame(a.n); break;
      case 'choose': {
        const options = a.doors.map((n) => ({ label: doorMeta(n)?.title || `Door ${n}`, value: n }));
        let n = a.doors[a.doors.length - 1]; // no ui.choose → the highest door
        if (typeof ctx.ui?.choose === 'function') {
          choosing = true;
          try { n = await ctx.ui.choose({ title: doll.who, options }); } catch (e) { console.warn('[tasks] choose', e); n = null; } finally { choosing = false; }
        }
        if (n == null || !a.doors.includes(n) || S.phase !== 'play') break; // cancelled: say nothing
        say(n, 'again');
        startGame(n);
        break;
      }
      case 'line': say(a.n, a.key); break;
      default: break;
    }
  }
  /** Spot label for a doll: the activity's / task's own label, "Play again with …", or "Talk to …". */
  function labelFor(doll, a) {
    if (a.type === 'task1') { const o = acts.giverLabel(a.n); if (o) return o; }
    if (a.type === 'activity') { const o = actFor(a.n)?.giverLabel?.(); if (o) return o; }
    if (a.type === 'again' || a.type === 'choose') return { label: `Play again with ${doll.who}`, icon: 'star' };
    return { label: `Talk to ${doll.who}`, icon: 'talk' };
  }
  for (const g of dolls) {
    g.spot = interact.add({
      id: 'giver-' + g.id, x: g.x, z: g.z, r: 1.0, label: `Talk to ${g.who}`, icon: 'talk',
      // the Mayor steps aside while you carry the star to the tree, and on Christmas Eve (the tree spot takes over)
      enabled: () => {
        if (S.phase !== 'play' || pending || playingDoor || choosing) return false;
        if (g.doors.includes(24) && (acts.st.hasStar || acts.st.placing || ds(24) === 'open')) return false;
        if (w2Busy()) { const t = resolve(g).type; return t === 'game' || t === 'again' || t === 'choose'; } // mini-games still work
        return true;
      },
      onInteract: () => { onDoll(g); },
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
    else if (n != null && actFor(n) && (o = actFor(n).objective?.() || null)) { /* the activity leads the way */ }
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
  const syncActs = (opts) => { for (const a of actList) { try { a.sync?.(opts); } catch (e) { console.error('[tasks] sync ' + a.id, e); } } };
  acts.sync();
  syncActs();
  game.on('progress:reset', () => { pending = null; focus = null; acts.sync({ reset: true }); syncActs({ reset: true }); });
  game.on('door:complete', () => { acts.sync(); syncActs(); });

  // ------------------------------------------------------------ per-frame
  engine.addUpdate((dt, t) => {
    if (pending && engine.time >= pending.at) {
      const p = pending;
      pending = null;
      if (S.phase === 'play') launch(p);
      else player.controllable = S.phase === 'play';
    }
    const pl = S.phase === 'play';
    for (const g of dolls) {
      const carryingFor = acts.st.hand && g.doors.some((n) => n <= 4 && GIVERS[n].task === acts.st.hand);
      g.showMarker = pl && (g.doors.some((n) => ds(n) === 'open') || !!carryingFor);
      const over = labelFor(g, resolve(g));
      g.spot.label = over.label; g.spot.icon = over.icon;
      g.update(dt, t);
    }
    for (const a of actList) { try { a.update?.(dt, t); } catch (e) { console.error('[tasks] update ' + a.id, e); } }
    acts.update(dt, t);
    objective = pickObjective();
    arrow.update(dt, t, objective);
  }, 5);

  return {
    /** Current objective {id, door, text, icon, x, z} or null (HUD task chip + hint arrow). */
    get objective() { return objective; },
    /** Legacy task state (lit houses, carried item, star …). */
    state: acts.st,
    /** Quest givers by door number (1–16, 24). Shared dolls: givers[9] === givers[3], [10] === [24], [13] === [2], [16] === [7]. */
    givers,
    /** Wave-2 task activities { house, gnomes, reindeer } (only those whose door is available). */
    activities,
    /** The Reindeer Rest + Clover (wave-3 finale hook): { atRest, home: {x, z}, object }. */
    get reindeer() {
      const a = activities.reindeer, r = a && a.reindeer;
      return { atRest: r && r.atRest != null ? !!r.atRest : ds(15) === 'done', home: (r && r.home) || { ...layout.REINDEER.rest }, object: (r && r.object) || null };
    },
    /** Start door n's mini-game right now (tests): resolves the framework's result, completes the door like a normal play. */
    playDoor(n) {
      const id = doorMeta(n)?.game;
      if (!id || pending || playingDoor || ctx.minigames?.active) return Promise.resolve(null);
      return launch({ n, id });
    },
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
    /** Talking to a doll is in progress (waiting for ui.choose). */
    get choosing() { return choosing; },
    get pendingGame() { return pending; },
    /** The star stand beside the tree ({x, z}). */
    starStand: acts.stand,
    /** Debug: stand a row of dolls in the given styles (screenshots of wardrobe pieces). Resolves {group, remove, tris}. */
    debugLineup: (styles, opts) => import('./debug.js').then((m) => m.lineup(ctx, styles, opts)),
    /** Self-test: plays doors 1–8 (1–16 with ?w2) by teleporting + 'interact', checks progress, rewards, festive levels, persistence. */
    selfTest: (opts) => import('./selftest.js').then((m) => m.runSelfTest(ctx, opts)),
  };
}
