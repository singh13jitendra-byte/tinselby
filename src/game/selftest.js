// Headless logic test: walks through all 4 tasks by teleporting the player and emitting 'interact'.
// Run in the page: await window.__tinselby.ctx.tasks.selfTest()  (best with ?capture&play)
export async function runSelfTest(ctx) {
  const { game, player, layout, interact } = ctx;
  const { RESIDENTIAL, PARK, LAKE, HILL, MARKET } = layout;
  const log = [];
  const fails = [];
  const events = {};
  const offAny = game.on('*', ({ evt }) => { events[evt] = (events[evt] || 0) + 1; });
  const step = (n = 2) => { for (let i = 0; i < n; i++) ctx.engine.step(1 / 30); };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const check = (cond, msg) => { (cond ? log : fails).push((cond ? 'ok   ' : 'FAIL ') + msg); };
  async function go(x, z, expectId) {
    player.teleport(x, z);
    step(3);
    const cur = interact.current;
    if (expectId) check(cur && cur.id === expectId, `spot ${expectId} available at (${x},${z}) → got ${cur ? cur.id : 'none'}`);
    game.emit('interact');
    await tick();
    step(2);
    await tick();
  }
  // skip rendering while the test steps the simulation (fast headless run); restored at the end
  const post = ctx.engine.post, realRender = post.render;
  post.render = () => {};
  const waitRide = async () => { for (let i = 0; i < 600 && ctx.tasks.state.riding; i++) { step(1); await tick(); } step(3); };
  if (game.state.phase !== 'play') game.emit('game:start', { name: 'Tester' });
  player.controllable = true;
  let starPlaced = false;
  const offStar = game.on('tree:starPlaced', () => { starPlaced = true; });

  // 1) star first: ride up, grab it, try to place → refused (other tasks not done)
  await go(HILL.giver.x + 0.35, HILL.giver.z + 0.35, 'giver-star');
  check(game.state.tasks.star === 'active', 'star accepted');
  await go(HILL.cableBase.x, HILL.cableBase.z + 0.3, 'cable-up');
  await waitRide();
  check(Math.hypot(player.pos.x - HILL.cableTop.x, player.pos.z - HILL.cableTop.z) < 2.5, 'arrived at the top station');
  await go(HILL.starSpot.x + 0.2, HILL.starSpot.z + 0.3, 'star-pickup');
  check(game.state.carrying === 'star', 'carrying star');
  await go(HILL.cableTop.x, HILL.cableTop.z + 0.3, 'cable-down');
  await waitRide();
  await go(MARKET.tree.x, MARKET.tree.z + 1.5, 'tree-star');
  check(!starPlaced && game.state.tasks.star !== 'done', 'star placement refused before other tasks');

  // 2) lights
  await go(RESIDENTIAL.giver.x + 0.35, RESIDENTIAL.giver.z, 'giver-lights');
  check(game.state.tasks.lights === 'active', 'lights accepted');
  for (let i = 0; i < 3; i++) { const d = RESIDENTIAL.taskHouses[i].door; await go(d[0], d[1], 'door-' + i); }
  check(game.state.tasks.lights === 'done', 'lights done');

  // 3) bauble
  await go(PARK.giver.x + 0.35, PARK.giver.z, 'giver-bauble');
  await go(PARK.bauble.x - 0.3, PARK.bauble.z + 0.2, 'pickup-bauble');
  check(game.state.carrying === 'bauble', 'carrying bauble');
  await go(PARK.giver.x + 0.35, PARK.giver.z, 'giver-bauble');
  check(game.state.tasks.bauble === 'done', 'bauble done');

  // 4) scarf (picked up before talking to Ilse — allowed)
  await go(LAKE.scarf.x - 0.3, LAKE.scarf.z, 'pickup-scarf');
  await go(LAKE.giver.x + 0.35, LAKE.giver.z, 'giver-scarf');
  check(game.state.tasks.scarf === 'done', 'scarf done');

  // 5) place the star
  await go(MARKET.tree.x, MARKET.tree.z + 1.5, 'tree-star');
  step(45); await tick();
  check(starPlaced, 'tree:starPlaced fired');
  check(game.state.spirit === 4, 'spirit is 4 (got ' + game.state.spirit + ')');
  check(game.state.starPlaced === true, 'state.starPlaced');
  offStar(); offAny();
  post.render = realRender;
  return { pass: fails.length === 0, fails, log, events };
}
