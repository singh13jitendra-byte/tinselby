// Headless logic test: plays Advent doors 1–8 (1–16 with ?w2) by teleporting the player next to givers / spots and emitting
// 'interact', then checks door states, rewards, wardrobe unlocks, festive levels, the daily gift and persistence.
// Wave 3 (?w3): plays doors 1–23 under a test clock (10 Dec), then door 24 on 24 Dec 18:00 (place the star, the finale gives the wish piece,
// exit, replay, exit), the star restore after a reload, and the clock / old-save scenarios. The clock and ui.choose are restored at the end.
// Run in the page: await window.__tinselby.ctx.tasks.selfTest()   (best with ?capture&play&noshots)
// Options: { reset: true } wipes progress first (default); { finale: true } also force-opens door 24 and places the
// star (starts the real finale — leave it off unless you want that).
// Mini-games: stub games are really played (intro/results cards are clicked); real games are replaced by a test hook
// that resolves at once with a completed result, so the giver → play → progress.complete path is still exercised.
import { createProgress } from '../progress/index.js';
import { memoryStorage, SAVE_KEY } from '../progress/save.js';
import { W3 } from '../progress/doors.js';

const EXPECT_LEVEL = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]; // index = doors done (wave 3: 4 up to 24)
const GIVER_BASE = { 17: 5, 21: 11, 23: 12 }; // wave 3 shared dolls
const isStub = (def) => !def || def.intro === 'Coming soon' || /Stub game/.test(String(def.start));

export async function runSelfTest(ctx, { reset = true, finale = false } = {}) {
  const { game, player, layout, interact, engine, colliders } = ctx;
  const progress = ctx.progress, tasks = ctx.tasks, S = game.state;
  const W = progress.lastAvailable(); // 16 with ?w2, else 8
  const { HILL, MARKET, RESIDENTIAL, PARK, LAKE } = layout;
  const log = [], fails = [];
  const events = {};
  const offAny = game.on('*', ({ evt }) => { events[evt] = (events[evt] || 0) + 1; });
  const step = (n = 2) => { for (let i = 0; i < n; i++) engine.step(1 / 30); };
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const check = (cond, msg) => { (cond ? log : fails).push((cond ? 'ok   ' : 'FAIL ') + msg); return !!cond; };
  const near = (x, z) => { const p = { x, z }; try { colliders.resolve(p, 0.09); } catch (e) { /* */ } return p; };
  async function go(x, z, expectId) {
    const p = near(x, z);
    player.teleport(p.x, p.z);
    step(3);
    const cur = interact.current;
    if (expectId) check(cur && cur.id === expectId, `spot ${expectId} at (${p.x.toFixed(2)},${p.z.toFixed(2)}) → got ${cur ? cur.id : 'none'}`);
    game.emit('interact');
    await tick();
    step(2);
    await tick();
    return cur;
  }
  const giverAt = (n) => { const g = tasks.giverPos(n); return [g.x + 0.32, g.z + 0.22]; };
  const spotOf = (n) => 'giver-' + tasks.givers[n].id; // shared dolls: the doll's own door id
  // helpers handed to the wave-2 activities' selfTest (WAVE2.md §Activity interface)
  const T = {
    talk: (n) => go(...giverAt(n), spotOf(n)),
    go, step, tick, check,
    teleport: (x, z) => { const p = near(x, z); player.teleport(p.x, p.z); step(3); },
  };
  const waitRide = async () => { for (let i = 0; i < 600 && tasks.state.riding; i++) { step(1); await tick(); } step(3); };
  const expectLevel = (k, label) => check(S.spirit === EXPECT_LEVEL[k] && progress.level() === EXPECT_LEVEL[k], `${label}: festive level ${EXPECT_LEVEL[k]} (spirit ${S.spirit}, level ${progress.level()})`);
  function afterDoor(n) {
    const d = progress.door(n);
    check(progress.state(n) === 'done', `door ${n} done (state ${progress.state(n)})`);
    if (d.reward) check(progress.rewards.has(d.reward.id) && progress.wardrobe.unlocked(d.reward.slot).includes(d.reward.key), `door ${n} reward ${d.reward.id} owned + unlocked`);
    if (n < W) check(progress.state(n + 1) === 'open' && progress.current() === n + 1, `door ${n + 1} opened (current ${progress.current()})`);
    expectLevel(n, `after door ${n}`);
  }

  // skip rendering while the test steps the simulation (fast headless run); restored at the end
  const post = engine.post, realRender = post.render;
  post.render = () => {};
  const realPlay = ctx.minigames?.play;
  // wave 3: a fixed test clock (10 Dec: 14 sleeps to Christmas Eve) so the run gives the same result on any real date
  const realClock = progress._clock;
  const season = progress.eve?.season ?? new Date().getFullYear();
  const clockAt = (d, h = 12) => () => new Date(season, 11, d, h);
  const setClock = (c) => { progress._clock = c; progress._checkEve?.(true); };
  // ui.choose is stubbed to the first option for the whole run (shared-giver replays, the wish at door 22, "Watch again")
  const ui = ctx.ui, hadChoose = !!ui && Object.prototype.hasOwnProperty.call(ui, 'choose'), realChoose = ui && ui.choose;
  const chooseCalls = [];
  if (ui) ui.choose = async (o) => { chooseCalls.push(o); return o.options[0].value; };
  let open24 = 0;
  const offOpen = game.on('door:open', (d) => { if (d && d.n === 24) open24++; });
  const isStubAct = (a) => String(a.selfTest).length < 90; // the scaffolding stub: `async selfTest(T) { await T.talk(env.n); }`
  try {
    if (W3) setClock(clockAt(10));
    if (reset) progress.reset();
    if (S.phase !== 'play') game.emit('game:start', { name: 'Tester' });
    player.controllable = true;
    step(2);

    // ---------------------------------------------------------------- fresh state
    check(progress.current() === 1, 'fresh save: current door 1');
    check(progress.state(1) === 'open' && Array.from({ length: W - 1 }, (_, i) => i + 2).every((n) => progress.state(n) === 'locked'), `door 1 open, 2–${W} locked`);
    check(Array.from({ length: 23 - W }, (_, i) => W + 1 + i).every((n) => progress.state(n) === 'soon') && progress.state(24) === 'locked', `doors ${W + 1}–23 soon, 24 locked`);
    check(progress.house.get() === null && progress.wave === W, `fresh save: no house style, wave ${W}`);
    check(S.spirit === 0 && progress.level() === 0, 'festive level 0');
    check(progress.wardrobe.unlocked('hat').join() === 'bobble,earflap,earmuffs,none', 'only default hats unlocked');
    check(progress.wardrobe.unlocked('hair').length === 5 && progress.wardrobe.unlocked('outfit').length === 4, 'character keys always unlocked');
    check(tasks.givers[1].showMarker && !tasks.givers[2].showMarker && !tasks.givers[5].showMarker && !tasks.givers[24].showMarker, 'only the door 1 giver has the marker');
    check(tasks.objective && tasks.objective.door === 1, 'objective points at door 1 (' + (tasks.objective && tasks.objective.text) + ')');
    // a locked giver only chats
    await go(...giverAt(2), 'giver-2');
    check(S.tasks.bauble === 'available' && progress.state(2) === 'locked', "locked Pip doesn't start door 2");
    await go(...giverAt(5), 'giver-5');
    check(!tasks.pendingGame && !tasks.playingDoor, "locked Tilly doesn't start a mini-game");
    await go(PARK.bauble.x - 0.3, PARK.bauble.z + 0.2);
    check(S.carrying !== 'bauble', "door 2's bauble can't be picked up before door 2 opens");

    // ---------------------------------------------------------------- door 1: lights
    await go(...giverAt(1), 'giver-1');
    check(S.tasks.lights === 'active', 'lights accepted');
    for (let i = 0; i < 3; i++) { const d = RESIDENTIAL.taskHouses[i].door; await go(d[0], d[1], 'door-' + i); }
    afterDoor(1);
    step(1);
    check(!tasks.givers[1].showMarker && tasks.givers[2].showMarker, 'marker moved to Pip');

    // ---------------------------------------------------------------- door 2: bauble
    await go(...giverAt(2), 'giver-2');
    await go(PARK.bauble.x - 0.3, PARK.bauble.z + 0.2, 'pickup-bauble');
    check(S.carrying === 'bauble', 'carrying bauble');
    await go(...giverAt(2), 'giver-2');
    afterDoor(2);

    // ---------------------------------------------------------------- door 3: scarf (picked up before talking to Ilse)
    await go(LAKE.scarf.x - 0.3, LAKE.scarf.z, 'pickup-scarf');
    await go(...giverAt(3), 'giver-3');
    afterDoor(3);

    // ---------------------------------------------------------------- door 4: star → stand by the tree (no finale)
    let starPlaced = 0;
    const offStar = game.on('tree:starPlaced', () => { starPlaced++; });
    await go(...giverAt(4), 'giver-4');
    check(S.tasks.star === 'active', 'star accepted');
    await go(HILL.cableBase.x, HILL.cableBase.z + 0.3, 'cable-up');
    await waitRide();
    check(Math.hypot(player.pos.x - HILL.cableTop.x, player.pos.z - HILL.cableTop.z) < 2.5, 'arrived at the top station');
    await go(HILL.starSpot.x + 0.2, HILL.starSpot.z + 0.3, 'star-pickup');
    check(S.carrying === 'star', 'carrying star');
    await go(HILL.cableTop.x, HILL.cableTop.z + 0.3, 'cable-down');
    await waitRide();
    await go(MARKET.tree.x + 0.3, MARKET.tree.z + 1.55, 'tree-rest');
    step(45); await tick();
    afterDoor(4);
    check(starPlaced === 0 && !S.starPlaced && S.phase === 'play', 'door 4 did not start the finale');
    check(tasks.state.starHome && !ctx.city?.tree?.star?.visible, 'star rests on the stand; tree socket stays empty');
    await go(MARKET.tree.x + 0.3, MARKET.tree.z + 1.55);
    check(!interact.current || interact.current.id !== 'tree-star', '"Place the star" (door 24) not offered in wave 1');

    // ---------------------------------------------------------------- doors 5–W: mini-games and (wave 2) task activities
    const stubs = [];
    const instantPlay = (n) => async (id) => {
      const r = { id, score: 10 * n, stars: 2, text: '', quit: false, completed: true };
      ctx.progress.recordMiniGame(id, r);
      return r;
    };
    for (let n = 5; n <= W; n++) {
      const meta = progress.door(n);
      if (meta.kind === 'task') {
        // wave-2 task doors (10 house, 14 gnomes, 15 reindeer) run their activity's own selfTest
        const act = tasks.activities?.[meta.task];
        if (!check(!!act, `door ${n}: activity ${meta.task} exists`)) continue;
        stubs.push(`${meta.task}:activity`);
        await act.selfTest(T);
        step(2);
        afterDoor(n);
        if (n === 20) check(!!tasks.lanterns && tasks.lanterns.allLit === true, 'door 20: every runway lantern is lit (tasks.lanterns.allLit)');
        if (n === 22) {
          if (isStubAct(act)) log.push('skip  door 22: wish (the letters activity is still the scaffolding stub)');
          else check(progress.wish.get() === 'coat:santa', `door 22: the wish is saved (${progress.wish.get()})`);
        }
        if (n === 10) {
          const hs = progress.house.get();
          check(hs && Object.keys(hs).length === 4, 'door 10: house style saved (' + JSON.stringify(hs) + ')');
          check(S.phase === 'play' && !ctx.house?.isOpen, 'door 10: back in play, panel closed');
        }
        if (n === 14) {
          const left = act.visibleCount ? act.visibleCount() : window.__w2?.gnomes?.state?.visible;
          if (typeof left === 'number') check(left === 0, `door 14: no gnome left visible (${left})`);
          else log.push('skip  door 14: gnome visibility (the activity exposes no visibleCount)');
        }
        if (n === 15) check(tasks.reindeer.atRest === true, 'door 15: Clover is in the Reindeer Rest (tasks.reindeer.atRest)');
        continue;
      }
      const gameId = meta.game;
      const def = ctx.minigames?.get?.(gameId);
      const stub = isStub(def);
      stubs.push(`${gameId}:${stub ? 'stub' : 'real'}`);
      if (!stub) ctx.minigames.play = instantPlay(n);
      await go(...giverAt(n), spotOf(n));
      check(tasks.pendingGame && tasks.pendingGame.n === n, `door ${n}: ${tasks.givers[n].who} starts ${gameId}`);
      for (let i = 0; i < 60 && tasks.pendingGame; i++) step(1);
      const t0 = performance.now();
      while ((tasks.playingDoor || ctx.minigames.active) && performance.now() - t0 < 20000) {
        if (stub) {
          // capture mode auto-starts the intro card; otherwise press Start, then Done on the results card
          const b = (!engine.capture && document.querySelector('.mg-intro button')) || document.querySelector('.mg-results .knit-btn.green');
          if (b) b.click();
        }
        step(1);
        await tick(40);
      }
      check(!tasks.playingDoor && !ctx.minigames.active && S.phase === 'play', `door ${n}: ${gameId} finished, back in play`);
      if (realPlay) ctx.minigames.play = realPlay;
      afterDoor(n);
      check(progress.best(gameId) != null, `door ${n}: best score recorded for ${gameId}`);
      const SHARED = { 17: 'Tilly', 21: 'Conductor Clem', 23: 'Auntie Noor' }; // wave 3: two done mini-games on one doll → "Play again", asks which
      if (SHARED[n]) {
        const [x, z] = giverAt(n); T.teleport(x, z);
        const base = GIVER_BASE[n];
        check(interact.current && interact.current.label === `Play again with ${SHARED[n]}`, `shared giver: "Play again with ${SHARED[n]}" after door ${n} (${interact.current && interact.current.label})`);
        check(tasks.givers[n] === tasks.givers[base], `shared doll: givers[${n}] is the doll of door ${base}`);
      }
      if (n === 18 || n === 19) check(!!tasks.givers[n] && tasks.givers[n] !== tasks.givers[5] && tasks.givers[n].who === (n === 18 ? 'Postie Percy' : 'Nana Marigold'), `door ${n}: ${n === 18 ? 'Postie Percy' : 'Nana Marigold'} is a new doll`);
      if (n === 9) {
        // shared giver: Ilse (door 3's doll) now offers a replay of door 9
        { const [x, z] = giverAt(9); T.teleport(x, z); }
        check(interact.current && interact.current.label === 'Play again with Ilse', `shared giver: "Play again with Ilse" after door 9 (${interact.current && interact.current.label})`);
        check(tasks.givers[9] === tasks.givers[3] && tasks.givers[13] === tasks.givers[2] && tasks.givers[16] === tasks.givers[7] && tasks.givers[10] === tasks.givers[24], 'shared dolls: givers[9/10/13/16] are the dolls of 3/24/2/7');
      }
    }

    // ---------------------------------------------------------------- wave end
    check(progress.current() === null && progress.doneCount() === W, `all ${W} doors done, no current door`);
    check(events['wave:end'] === 1, 'wave:end fired once (' + events['wave:end'] + ')');
    if (W3 && W >= 23) {
      check(progress.state(24) === 'locked', 'door 24 still locked before Christmas Eve');
      check(progress.eve.sleeps === 14 && !progress.eve.isEve && !progress.eve.isAfter, `clock 10 Dec: eve ${JSON.stringify(progress.eve)}`);
      { const [x, z] = giverAt(24); T.teleport(x, z); }
      check(interact.current && interact.current.label === 'Peek at Christmas Eve', `Mayor offers "Peek at Christmas Eve" (${interact.current && interact.current.label})`);
    } else check(progress.state(W + 1) === 'soon' && progress.state(24) === 'locked', `door ${W + 1} soon, door 24 still locked`);
    check(events['door:complete'] === W && events['reward:grant'] === W && events['door:open'] === W - 1, `events: door:complete ${events['door:complete']}, reward:grant ${events['reward:grant']}, door:open ${events['door:open']}`);
    const owned = progress.rewards.owned();
    const wantRewards = ['scarf:candycane', 'hat:santa', 'coat:plum', 'hat:reindeer', 'scarf:gold', 'coat:navy', 'hat:elf', 'coat:gingerbread'];
    if (W >= 16) wantRewards.push('coat:icy', 'scarf:holly', 'hat:conductor', 'hat:bow', 'coat:snowy', 'hat:gnome', 'scarf:jingle', 'coat:midnight');
    if (W >= 23) wantRewards.push('hat:tophat', 'scarf:postal', 'coat:cocoa', 'coat:lantern', 'hat:parcel', 'scarf:frost', 'coat:elf');
    check(wantRewards.every((id) => owned.includes(id)), `all ${W} door rewards owned`);
    step(1);
    check(tasks.objective && tasks.objective.id === 'daily', 'objective → daily gift at the Advent board');

    // replay a done mini-game door: "Play again", keeps the best, no new door events
    const doneBefore = events['door:complete'];
    ctx.minigames.play = async (id) => { const r = { id, score: 999, stars: 3, text: '', quit: false, completed: true }; ctx.progress.recordMiniGame(id, r); return r; };
    { const [x, z] = giverAt(5); player.teleport(...Object.values(near(x, z))); step(3); }
    check(interact.current && interact.current.label === 'Play again with Tilly', 'done giver offers "Play again"');
    game.emit('interact'); await tick(); step(2);
    for (let i = 0; i < 60 && tasks.pendingGame; i++) step(1);
    for (let i = 0; i < 20 && tasks.playingDoor; i++) await tick(10);
    if (realPlay) ctx.minigames.play = realPlay;
    check(events['door:complete'] === doneBefore && progress.state(5) === 'done', 'replay: no new door:complete');
    check(progress.stars(5) === 3 && progress.best('snowball').score >= 999, `replay: best kept (stars ${progress.stars(5)}, best ${JSON.stringify(progress.best('snowball'))})`);

    // shared giver with two done mini-games (Sasha: doors 7 + 16) asks which one to replay (ui.choose stubbed to the first option)
    if (W >= 16) {
      const c0 = chooseCalls.length;
      ctx.minigames.play = async (id) => { const r = { id, score: 50, stars: 1, text: '', quit: false, completed: true }; ctx.progress.recordMiniGame(id, r); return r; };
      T.teleport(...giverAt(16));
      check(interact.current && interact.current.label === 'Play again with Coach Sasha', 'Sasha (doors 7 + 16 done) offers "Play again" (' + (interact.current && interact.current.label) + ')');
      game.emit('interact'); await tick(); step(2);
      for (let i = 0; i < 60 && tasks.pendingGame; i++) step(1);
      for (let i = 0; i < 20 && (tasks.playingDoor || tasks.choosing); i++) await tick(10);
      const calls = chooseCalls.slice(c0);
      check(!ui || (calls.length === 1 && calls[0].title === 'Coach Sasha' && calls[0].options.length === 2 && calls[0].options[0].value === 7), 'ui.choose asked Sasha which door (' + JSON.stringify(calls[0] && calls[0].options) + ')');
      if (realPlay) ctx.minigames.play = realPlay;
      check(progress.state(16) === 'done' && events['door:complete'] === W, 'choose → replay: no new door:complete');
    }

    // daily gift on the live save
    const reward = progress.daily.claim();
    check(reward && reward.id === 'scarf:berry' && progress.rewards.has('scarf:berry') && events['daily:claim'] === 1, 'daily claim → Berry scarf');
    check(progress.daily.streak === 1 && !progress.daily.available && progress.daily.claim() === null, 'daily: streak 1, claimed for today');
    step(1);
    check(tasks.objective === null, 'nothing left to point at');

    // ---------------------------------------------------------------- persistence: a second instance from the saved JSON
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* private mode */ }
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* */ }
    check(parsed && parsed.v === 1 && Object.keys(parsed.doors).length === W, `save JSON: v1 with ${W} doors`);
    check(parsed && parsed.wave === W && (W < 10 || (parsed.house && parsed.house.wreath)), `save JSON: wave ${W}${W >= 10 ? ' + house style' : ''}`);
    const p2 = createProgress({}, { storage: memoryStorage({ [SAVE_KEY]: raw || '' }), silent: true, clock: W3 ? clockAt(10) : undefined });
    check(p2.playerId === progress.playerId && p2.doneCount() === W && p2.current() === null && p2.level() === 4, `reload: same player, ${W} doors, level 4`);
    check((W >= 23 || p2.state(W + 1) === 'soon') && p2.state(24) === 'locked' && p2.rewards.owned().length === owned.length + 1, 'reload: states + rewards');
    if (W3) {
      check(p2.wish.get() === progress.wish.get() && JSON.stringify(p2.flags) === JSON.stringify(progress.flags) && parsed && Array.isArray(parsed.flags) && parsed.eveWatched === 0, `reload: wish ${p2.wish.get()}, flags + eveWatched in the save`);
      check(p2.eve.sleeps === 14, 'reload: eve clock follows the injected clock');
    }
    check(p2.wave === W && JSON.stringify(p2.house.get()) === JSON.stringify(progress.house.get()), `reload: wave ${p2.wave}, house style ${JSON.stringify(p2.house.get())}`);
    check(p2.best('snowball')?.stars === 3 && p2.stars(5) === 3 && !p2.daily.available && p2.daily.streak === 1, 'reload: best scores + daily');
    check(p2.wardrobe.unlocked('coat').includes('gingerbread') && !p2.wardrobe.unlocked('coat').includes('forest'), 'reload: wardrobe');
    const bad = createProgress({}, { storage: memoryStorage({ [SAVE_KEY]: '{not json' }), silent: true });
    check(bad.doneCount() === 0 && bad.current() === 1, 'corrupt save → fresh start');
    const junk = createProgress({}, { storage: memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 7, doors: { 1: { stars: 9 }, x: 1, 30: {}, 2: 'bad' }, rewards: ['hat:santa', 5], best: { sled: 'no' }, daily: { last: 'yesterday' } }) }), silent: true });
    check(junk.doneCount() === 1 && junk.stars(1) === 3 && junk.rewards.has('hat:santa') && junk.best('sled') === null && junk.daily.available, 'future/junk save read field by field');

    // an old-format save hears about the new doors exactly once: doors 1–8 without `wave` (wave 1 → 2, with ?w3 → 9–23) and,
    // with ?w3, a wave-2 save (doors 1–16, wave 16 → 17–23)
    {
      const WAVE1_REWARDS = ['scarf:candycane', 'hat:santa', 'coat:plum', 'hat:reindeer', 'scarf:gold', 'coat:navy', 'hat:elf', 'coat:gingerbread'];
      const WAVE2_REWARDS = [...WAVE1_REWARDS, 'coat:icy', 'scarf:holly', 'hat:conductor', 'hat:bow', 'coat:snowy', 'hat:gnome', 'scarf:jingle', 'coat:midnight'];
      const mkOld = (keep, wave) => {
        const old = JSON.parse(JSON.stringify(parsed || {}));
        for (let n = keep + 1; n <= 24; n++) delete old.doors[n];
        if (wave == null) delete old.wave; else old.wave = wave;
        if (keep < 10) delete old.house;
        old.rewards = (old.rewards || []).filter((id) => (keep >= 16 ? WAVE2_REWARDS : WAVE1_REWARDS).includes(id));
        delete old.wish;
        return memoryStorage({ [SAVE_KEY]: JSON.stringify(old) });
      };
      const fake = () => { const h = {}, seen = []; return { seen, h, state: { phase: 'play', style: null }, emit(e, d) { seen.push([e, d]); }, on(e, f) { (h[e] = h[e] || []).push(f); return () => {}; } }; };
      const run = async (g, p) => { (g.h['game:start'] || []).forEach((f) => f({ name: 'T' })); await tick(160); const ev = g.seen.filter(([e]) => e === 'doors:new'); p._dispose(); return ev; };
      const scenario = async (store) => {
        const g1 = fake(), pa = createProgress({ game: g1 }, { storage: store, newDoorsDelay: 60 });
        const wave0 = pa.wave, ev1 = await run(g1, pa);
        const g2 = fake(), pb = createProgress({ game: g2 }, { storage: store, newDoorsDelay: 60 });
        const ev2 = await run(g2, pb);
        return { wave0, ev1, ev2, wave1: pb.wave };
      };
      if (W >= 16) {
        const r = await scenario(mkOld(8, null));
        check(r.wave0 === 8 && r.ev1.length === 1 && r.ev1[0][1].from === 9 && r.ev1[0][1].to === W, `old save (no wave): doors:new ${JSON.stringify(r.ev1.map((e) => e[1]))} once`);
        check(r.wave1 === W && r.ev2.length === 0, 'old save: not told again after a reload');
      } else {
        const r = await scenario(mkOld(8, null));
        check(r.ev1.length === 0 && r.wave0 === 8, 'old save without ?w2: no doors:new card');
      }
      if (W >= 23) {
        const r = await scenario(mkOld(16, 16));
        check(r.wave0 === 16 && r.ev1.length === 1 && r.ev1[0][1].from === 17 && r.ev1[0][1].to === 23, `old wave-2 save (doors 1–16, wave 16): doors:new ${JSON.stringify(r.ev1.map((e) => e[1]))} once`);
        check(r.wave1 === 23 && r.ev2.length === 0, 'old wave-2 save: not told again');
        const p16 = createProgress({}, { storage: mkOld(16, 16), silent: true, clock: clockAt(10) });
        check(p16.current() === 17 && p16.state(17) === 'open' && p16.level() === 4 && p16.wardrobe.unlocked('coat').includes('midnight'), 'old wave-2 save: door 17 open, level 4, wardrobe kept');
      }
      const fresh = fake(), pf = createProgress({ game: fresh }, { storage: memoryStorage(), newDoorsDelay: 60 });
      check(pf.wave === W && (await run(fresh, pf)).length === 0, 'brand-new save: wave = lastAvailable, no card');
    }

    // daily streak logic with a fake clock (separate in-memory save)
    let day = new Date(2026, 11, 1, 10);
    const pd = createProgress({}, { storage: memoryStorage(), silent: true, clock: () => day });
    const c1 = pd.daily.claim();
    day = new Date(2026, 11, 2, 9);
    const avail2 = pd.daily.available, c2 = pd.daily.claim(), s2 = pd.daily.streak;
    day = new Date(2026, 11, 4, 20);
    const s3before = pd.daily.streak, c3 = pd.daily.claim(), s3 = pd.daily.streak;
    check(c1.id === 'scarf:berry' && avail2 && c2.id === 'coat:forest' && s2 === 2, 'daily: consecutive days build the streak');
    check(s3before === 0 && c3.id === 'scarf:sky' && s3 === 1, 'daily: a missed day resets the streak');
    pd.daily.claim(); day = new Date(2026, 11, 5, 8); pd.daily.claim();
    day = new Date(2026, 11, 6, 8);
    check(pd.daily.claim().id.startsWith('treat:'), 'daily: treats once every bonus colour is owned');

    offStar();
    // ---------------------------------------------------------------- wave 3: door 24, Christmas Eve (date-gated; the finale gives the wish piece)
    if (W3 && W >= 23) {
      const tree = MARKET.tree;
      const fin = ctx.finale;
      const hasEve = typeof fin?.exit === 'function' && typeof fin?.replay === 'function';
      // 23 Dec: still closed. 24 Dec 18:00 (the 30 s timer check): door 24 opens, current is 24.
      setClock(clockAt(23, 20));
      check(progress.state(24) === 'locked' && progress.eve.sleeps === 1 && progress.current() === null, `clock 23 Dec: door 24 locked, 1 sleep (${progress.state(24)}, ${progress.eve.sleeps})`);
      const o0 = open24, pc0 = events['progress:change'] || 0;
      progress._clock = clockAt(24, 18);
      progress._checkEve();
      check(progress.state(24) === 'open' && progress.current() === 24 && open24 === o0 + 1, `clock 24 Dec 18:00: door:open {n: 24} (${open24 - o0}x), current ${progress.current()}`);
      check((events['progress:change'] || 0) > pc0, 'date flip emitted progress:change {eve}');
      step(2);
      check(tasks.objective && tasks.objective.door === 24, 'objective points at door 24 (' + (tasks.objective && tasks.objective.text) + ')');
      check(tasks.givers[24].showMarker, 'the Mayor shows the marker on Christmas Eve');
      // the Mayor's spot steps aside on Eve (doors 10 / 20 done): standing by her places the star
      { const [x, z] = giverAt(24); T.teleport(x, z); check(interact.current && interact.current.id === 'tree-star', `Eve: the tree spot beats the Mayor (${interact.current && interact.current.id})`); }
      // place the star
      let placed = 0;
      const offPlaced = game.on('tree:starPlaced', () => { placed++; });
      const doneBefore24 = progress.doneCount();
      await go(tree.x + 0.3, tree.z + 1.55, 'tree-star');
      step(45); await tick();
      offPlaced();
      check(placed === 1 && progress.state(24) === 'done' && progress.doneCount() === doneBefore24 + 1 && S.starPlaced, 'Place the star: door 24 done, tree:starPlaced once');
      check(ctx.city?.tree?.star?.visible !== false && !tasks.state.starHome, 'star is on the tree, not on the stand');
      if (!hasEve) {
        log.push('skip  finale: exit / replay API not present yet (the Finale agent adds finale.exit / replay): gift, exit and replay checks skipped');
        check(fin?.running, 'finale running after the star was placed');
      } else {
        check(fin.running, 'finale.running after Place the star');
        fin.jumpTo(70); step(10); await tick();
        check(progress.rewards.has('coat:santa'), 'finale gift: the wished Santa coat is owned (coat:santa)');
        check(S.style && S.style.coat === 'santa', `finale gift: the player wears it (style.coat ${S.style && S.style.coat})`);
        fin.exit(); step(10); await tick();
        check(S.phase === 'play' && player.controllable && !fin.running, `finale.exit(): phase ${S.phase}, controllable ${player.controllable}`);
        let maxd = 0;
        for (const g of tasks.dolls) maxd = Math.max(maxd, Math.hypot(g.root.position.x - g.x, g.root.position.z - g.z));
        check(maxd < 0.01, `finale.exit(): every doll is back on its spot (max ${maxd.toFixed(3)})`);
        check(tasks.reindeer.atRest, 'finale.exit(): Clover is back in the Reindeer Rest');
        check(fin.rig && fin.rig.group && fin.rig.group.visible === false, 'finale.exit(): the sleigh rig is hidden');
        check(progress.eveWatched >= 1, `the finale marked Christmas Eve watched (${progress.eveWatched})`);
        // Watch again: the next missing wish piece
        fin.replay(); step(4); await tick();
        check(fin.running && S.phase === 'finale', 'finale.replay() runs');
        fin.jumpTo(70); step(10); await tick();
        check(progress.rewards.has('hat:starlight'), 'Watch again: the next missing piece (hat:starlight) is owned');
        fin.exit(); step(10); await tick();
        check(S.phase === 'play' && player.controllable && tasks.reindeer.atRest, 'second exit: back in play, Clover home');
      }
      // reload: the saved game has door 24 done → the star belongs on the tree (it used to reappear on the stand)
      if (S.phase === 'play') {
        const t = ctx.city?.tree;
        S.starPlaced = false; if (t?.star) t.star.visible = false;
        tasks.resync();
        step(2);
        check(S.starPlaced && (!t?.star || t.star.visible) && !tasks.state.starHome, 'reload: the star is restored on the tree (S.starPlaced, not on the stand)');
        const raw24 = (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })();
        const p3 = createProgress({}, { storage: memoryStorage({ [SAVE_KEY]: raw24 || '' }), silent: true, clock: progress._clock });
        check(p3.doneCount() === 24 && p3.state(24) === 'done' && p3.wish.get() === progress.wish.get() && p3.current() === null, `reload: doors 1–24, wish ${p3.wish.get()}`);
        check(tasks.lanterns ? tasks.lanterns.allLit === true : true, 'reload: the lantern runway stays lit');
      }
      // scenarios on fresh in-memory saves
      const fresh24 = createProgress({}, { storage: memoryStorage(), silent: true, clock: clockAt(24, 18) });
      for (let n = 1; n <= 4; n++) fresh24.complete(n, { stars: 1 });
      check(fresh24.state(24) === 'open' && fresh24.current() === 24, 'fresh save on 24 Dec, doors 1–4: door 24 open, current 24');
      const fresh23 = createProgress({}, { storage: memoryStorage(), silent: true, clock: clockAt(23, 23) });
      for (let n = 1; n <= 4; n++) fresh23.complete(n, { stars: 1 });
      check(fresh23.state(24) === 'locked' && fresh23.eve.sleeps === 1, 'fresh save on 23 Dec, doors 1–4: door 24 locked');
      const x26 = createProgress({}, { storage: memoryStorage(), silent: true, clock: clockAt(26) });
      for (let n = 1; n <= 8; n++) x26.complete(n, { stars: 1 });
      check(x26.eve.isAfter && Array.from({ length: 15 }, (_, i) => i + 9).every((n) => x26.state(n) === 'open'), 'fresh save on 26 Dec, doors 1–8: doors 9–23 all open (any order)');
      check(x26.state(24) === 'open' && x26.current() === 24, '26 Dec: door 24 still opens once door 4 is done');
      const x26b = createProgress({}, { storage: memoryStorage(), silent: true, clock: clockAt(26) });
      check(x26b.state(1) === 'open' && x26b.state(23) === 'open' && x26b.state(24) === 'locked', '26 Dec, nothing done: doors 1–23 open, door 24 needs door 4');
    }
    // ---------------------------------------------------------------- optional: door 24 (starts the real finale)
    if (finale && !W3) {
      for (let n = 9; n <= 23; n++) progress.complete(n, {}, { force: true });
      check(progress.state(24) === 'open' && progress.current() === 24, 'doors 1–23 done → door 24 open');
      step(1);
      let placed = 0;
      const off = game.on('tree:starPlaced', () => { placed++; });
      await go(MARKET.tree.x + 0.3, MARKET.tree.z + 1.55, 'tree-star');
      step(45); await tick();
      off();
      check(placed === 1 && progress.state(24) === 'done' && S.starPlaced, 'door 24: star placed → tree:starPlaced');
    }
    log.push('mini-games: ' + stubs.join(', '));
  } catch (e) {
    fails.push('FAIL exception: ' + (e && e.stack || e));
  } finally {
    if (realPlay) ctx.minigames.play = realPlay;
    if (W3) setClock(realClock || null);
    if (ui) { if (hadChoose) ui.choose = realChoose; else delete ui.choose; }
    offOpen();
    offAny();
    post.render = realRender;
  }
  return { pass: fails.length === 0, fails, log, events };
}
