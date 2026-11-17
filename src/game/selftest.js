// Headless logic test for wave 1: plays Advent doors 1–8 by teleporting the player next to givers / spots and emitting
// 'interact', then checks door states, rewards, wardrobe unlocks, festive levels, the daily gift and persistence.
// Run in the page: await window.__tinselby.ctx.tasks.selfTest()   (best with ?capture&play&noshots)
// Options: { reset: true } wipes progress first (default); { finale: true } also force-opens door 24 and places the
// star (starts the real finale — leave it off unless you want that).
// Mini-games: stub games are really played (intro/results cards are clicked); real games are replaced by a test hook
// that resolves at once with a completed result, so the giver → play → progress.complete path is still exercised.
import { createProgress } from '../progress/index.js';
import { memoryStorage, SAVE_KEY } from '../progress/save.js';

const EXPECT_LEVEL = [0, 1, 1, 2, 2, 3, 3, 4, 4];
const isStub = (def) => !def || def.intro === 'Coming soon' || /Stub game/.test(String(def.start));

export async function runSelfTest(ctx, { reset = true, finale = false } = {}) {
  const { game, player, layout, interact, engine, colliders } = ctx;
  const progress = ctx.progress, tasks = ctx.tasks, S = game.state;
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
  const waitRide = async () => { for (let i = 0; i < 600 && tasks.state.riding; i++) { step(1); await tick(); } step(3); };
  const expectLevel = (k, label) => check(S.spirit === EXPECT_LEVEL[k] && progress.level() === EXPECT_LEVEL[k], `${label}: festive level ${EXPECT_LEVEL[k]} (spirit ${S.spirit}, level ${progress.level()})`);
  function afterDoor(n) {
    const d = progress.door(n);
    check(progress.state(n) === 'done', `door ${n} done (state ${progress.state(n)})`);
    if (d.reward) check(progress.rewards.has(d.reward.id) && progress.wardrobe.unlocked(d.reward.slot).includes(d.reward.key), `door ${n} reward ${d.reward.id} owned + unlocked`);
    if (n < 8) check(progress.state(n + 1) === 'open' && progress.current() === n + 1, `door ${n + 1} opened (current ${progress.current()})`);
    expectLevel(n, `after door ${n}`);
  }

  // skip rendering while the test steps the simulation (fast headless run); restored at the end
  const post = engine.post, realRender = post.render;
  post.render = () => {};
  const realPlay = ctx.minigames?.play;
  try {
    if (reset) progress.reset();
    if (S.phase !== 'play') game.emit('game:start', { name: 'Tester' });
    player.controllable = true;
    step(2);

    // ---------------------------------------------------------------- fresh state
    check(progress.current() === 1, 'fresh save: current door 1');
    check(progress.state(1) === 'open' && [2, 3, 4, 5, 6, 7, 8].every((n) => progress.state(n) === 'locked'), 'door 1 open, 2–8 locked');
    check([9, 15, 23].every((n) => progress.state(n) === 'soon') && progress.state(24) === 'locked', 'doors 9–23 soon, 24 locked');
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

    // ---------------------------------------------------------------- doors 5–8: mini-games
    const stubs = [];
    for (const n of [5, 6, 7, 8]) {
      const gameId = progress.door(n).game;
      const def = ctx.minigames?.get?.(gameId);
      const stub = isStub(def);
      stubs.push(`${gameId}:${stub ? 'stub' : 'real'}`);
      if (!stub) {
        ctx.minigames.play = async (id) => {
          const r = { id, score: 10 * n, stars: 2, text: '', quit: false, completed: true };
          ctx.progress.recordMiniGame(id, r);
          return r;
        };
      }
      await go(...giverAt(n), 'giver-' + n);
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
    }

    // ---------------------------------------------------------------- wave end
    check(progress.current() === null && progress.doneCount() === 8, 'all 8 doors done, no current door');
    check(events['wave:end'] === 1, 'wave:end fired once (' + events['wave:end'] + ')');
    check(progress.state(9) === 'soon' && progress.state(24) === 'locked', 'door 9 soon, door 24 still locked');
    check(events['door:complete'] === 8 && events['reward:grant'] === 8 && events['door:open'] === 7, `events: door:complete ${events['door:complete']}, reward:grant ${events['reward:grant']}, door:open ${events['door:open']}`);
    const owned = progress.rewards.owned();
    check(['scarf:candycane', 'hat:santa', 'coat:plum', 'hat:reindeer', 'scarf:gold', 'coat:navy', 'hat:elf', 'coat:gingerbread'].every((id) => owned.includes(id)), 'all 8 door rewards owned');
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
    check(parsed && parsed.v === 1 && Object.keys(parsed.doors).length === 8, 'save JSON: v1 with 8 doors');
    const p2 = createProgress({}, { storage: memoryStorage({ [SAVE_KEY]: raw || '' }), silent: true });
    check(p2.playerId === progress.playerId && p2.doneCount() === 8 && p2.current() === null && p2.level() === 4, 'reload: same player, 8 doors, level 4');
    check(p2.state(9) === 'soon' && p2.state(24) === 'locked' && p2.rewards.owned().length === owned.length + 1, 'reload: states + rewards');
    check(p2.best('snowball')?.stars === 3 && p2.stars(5) === 3 && !p2.daily.available && p2.daily.streak === 1, 'reload: best scores + daily');
    check(p2.wardrobe.unlocked('coat').includes('gingerbread') && !p2.wardrobe.unlocked('coat').includes('forest'), 'reload: wardrobe');
    const bad = createProgress({}, { storage: memoryStorage({ [SAVE_KEY]: '{not json' }), silent: true });
    check(bad.doneCount() === 0 && bad.current() === 1, 'corrupt save → fresh start');
    const junk = createProgress({}, { storage: memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 7, doors: { 1: { stars: 9 }, x: 1, 30: {}, 2: 'bad' }, rewards: ['hat:santa', 5], best: { sled: 'no' }, daily: { last: 'yesterday' } }) }), silent: true });
    check(junk.doneCount() === 1 && junk.stars(1) === 3 && junk.rewards.has('hat:santa') && junk.best('sled') === null && junk.daily.available, 'future/junk save read field by field');

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
    // ---------------------------------------------------------------- optional: door 24 (starts the real finale)
    if (finale) {
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
    offAny();
    post.render = realRender;
  }
  return { pass: fails.length === 0, fails, log, events };
}
