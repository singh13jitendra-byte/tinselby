// Door 1–4 activities (wave 1): lights (Holly Lane), bauble (park), scarf (lake), star (hill → star stand by the big tree),
// plus the tree star itself: it rests on a knitted stand beside the tree after door 4 and is placed in the socket by
// door 24 (Christmas Eve → finale). Every ctx.city call is guarded: the city may be a stub.
import * as THREE from 'three';
import { GIVERS } from './lines.js';

export const TASK_DOOR = { lights: 1, bauble: 2, scarf: 3, star: 4 };
const TASK_IDS = ['lights', 'bauble', 'scarf', 'star'];

export function createActivities(ctx, env) {
  const { engine, game, interact, player, layout, colliders } = ctx;
  const { models, givers, say, toast, sfx, ds, completeDoor } = env;
  const S = game.state;
  const { RESIDENTIAL, PARK, LAKE, HILL, MARKET } = layout;
  const city = () => ctx.city || {};
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };
  const playing = () => S.phase === 'play';

  const st = {
    lit: [false, false, false],
    hand: null, // 'bauble' | 'scarf' held in the hands
    hasStar: false, // star rides on the player's back
    starHome: false, // star rests on the stand beside the tree
    riding: false,
    placing: false,
    own: false, // our own task:complete emits
  };
  const syncCarrying = () => { S.carrying = st.hand || (st.hasStar ? 'star' : null); };
  function accept(id) {
    if (S.tasks[id] !== 'available') return false;
    S.tasks[id] = 'active';
    game.emit('task:accepted', { id });
    return true;
  }
  /** Finish a task door: legacy task:complete (chime) + progress door completion. */
  function finish(id) {
    S.tasks[id] = 'done';
    st.own = true;
    game.emit('task:complete', { id });
    st.own = false;
    completeDoor(TASK_DOOR[id]);
  }

  // ------------------------------------------------------------ items
  const bauble = { id: 'bauble', home: PARK.bauble, state: 'ground' };
  bauble.pile = models.snowPile();
  bauble.pile.position.set(bauble.home.x, gy(bauble.home.x, bauble.home.z), bauble.home.z);
  bauble.mesh = models.bauble();
  bauble.mesh.position.set(bauble.home.x + 0.05, bauble.pile.position.y + 0.1, bauble.home.z + 0.06);
  bauble.mesh.rotation.z = 0.5;
  bauble.carry = models.bauble();
  engine.scene.add(bauble.pile, bauble.mesh);
  const scarf = { id: 'scarf', home: LAKE.scarf, state: 'ground' };
  scarf.mesh = models.scarfGround();
  scarf.mesh.position.set(scarf.home.x, gy(scarf.home.x, scarf.home.z), scarf.home.z);
  scarf.mesh.rotation.y = 0.6;
  scarf.carry = models.scarfCarry();
  engine.scene.add(scarf.mesh);
  const fetchItems = { bauble, scarf };
  // star on a cushion at the top station (hill)
  const star = { id: 'star', home: HILL.starSpot };
  const sy = Math.max(gy(star.home.x, star.home.z), 0);
  star.cushion = models.cushion();
  star.cushion.position.set(star.home.x, sy, star.home.z);
  star.mesh = models.star();
  star.mesh.position.set(star.home.x, sy + 0.3, star.home.z);
  star.back = models.star();
  star.back.scale.setScalar(0.62);
  engine.scene.add(star.cushion, star.mesh);
  // knitted stand beside the big tree (south-east of the trunk, clear of the gifts, the landing rug and the Mayor)
  const treeP = () => { const t = city().tree; return { x: t?.pos?.x ?? MARKET.tree.x, z: t?.pos?.z ?? MARKET.tree.z }; };
  const tp = treeP();
  const STAND = { x: tp.x + 0.82, z: tp.z + 1.16 };
  const stand = models.stand();
  stand.position.set(STAND.x, gy(STAND.x, STAND.z) - 0.004, STAND.z);
  stand.rotation.y = -0.5;
  engine.scene.add(stand);
  try { colliders.addCircle(STAND.x, STAND.z, 0.16, 'starStand'); } catch (e) { /* optional */ }
  const STAND_TOP = 0.53; // star centre above the stand's base
  const homeStar = models.star();
  homeStar.scale.setScalar(0.8);
  homeStar.position.set(STAND.x, stand.position.y + STAND_TOP, STAND.z);
  homeStar.visible = false;
  engine.scene.add(homeStar);

  // sparkles over items that are waiting to be picked up (and a glow ring round the resting star)
  const sparkles = [bauble, scarf, star, { id: 'home' }].map((it) => {
    const m = models.mesh(models.sparkleGeo, false);
    m.visible = false;
    engine.scene.add(m);
    return { it, m };
  });
  // little markers above unlit task-house doors while the lights task is active
  const doorMarkers = RESIDENTIAL.taskHouses.map((h) => {
    const m = models.mesh(models.markerGeo, false);
    m.position.set(h.door[0], 0.75, h.door[1]);
    m.scale.setScalar(0.8);
    m.visible = false;
    engine.scene.add(m);
    return m;
  });

  // ------------------------------------------------------------ door 1: lights
  function taskHouse(i) {
    const hs = city().residential?.houses;
    if (!Array.isArray(hs)) return null;
    const want = RESIDENTIAL.taskHouses[i];
    const byPos = hs.find((h) => h && h.taskHouse && Math.abs(h.x - want.x) < 0.1 && Math.abs(h.z - want.z) < 0.1);
    if (byPos) return byPos;
    return hs.filter((h) => h && h.taskHouse)[i] || null;
  }
  function lightHouse(i, on = true) {
    try { taskHouse(i)?.setLights?.(on); } catch (e) { console.warn('[tasks] setLights', e); }
  }
  RESIDENTIAL.taskHouses.forEach((h, i) => {
    interact.add({
      id: 'door-' + i, x: h.door[0], z: h.door[1], r: 0.85, label: 'Switch on the lights', icon: 'bulb',
      enabled: () => playing() && ds(1) === 'open' && !st.lit[i],
      onInteract: () => {
        if (accept('lights')) toast(`${GIVERS[1].who} will be thrilled!`);
        st.lit[i] = true;
        lightHouse(i, true);
        sfx('bell', h.door[0], h.door[1]);
        const n = st.lit.filter(Boolean).length;
        game.emit('task:progress', { id: 'lights', step: n, of: 3, text: `Lights on: ${n}/3` });
        if (n >= 3) {
          say(1, 'done');
          givers[1].hop();
          finish('lights');
        } else toast(`Lights on! ${n} of 3`);
      },
    });
  });

  // ------------------------------------------------------------ doors 2 + 3: bauble and scarf
  for (const it of [bauble, scarf]) {
    const n = TASK_DOOR[it.id];
    interact.add({
      id: 'pickup-' + it.id, x: it.home.x, z: it.home.z, r: 0.8,
      label: it.id === 'bauble' ? 'Pick up the bauble' : 'Pick up the scarf', icon: 'hand',
      enabled: () => playing() && ds(n) === 'open' && it.state === 'ground',
      onInteract: () => {
        if (st.hand) { toast(`Your hands are full! Bring the ${st.hand} back first.`); return; }
        it.state = 'carried';
        st.hand = it.id;
        syncCarrying();
        player.carry(it.carry);
        accept(it.id);
        sfx('pickup', it.home.x, it.home.z);
        game.emit('item:pickup', { id: it.id });
        const who = GIVERS[n].who;
        game.emit('task:progress', { id: it.id, step: 1, of: 2, text: `Bring it to ${who}` });
        toast(it.id === 'bauble' ? `Found it! Bring the bauble back to ${who}.` : `Got the scarf! Take it back to ${who}.`);
      },
    });
  }
  function deliver(id) {
    const n = TASK_DOOR[id], g = givers[n], it = fetchItems[id];
    player.carry(null);
    st.hand = null;
    it.state = 'returned';
    syncCarrying();
    accept(id);
    game.emit('item:drop', { id });
    game.emit('task:progress', { id, step: 2, of: 2, text: 'Returned!' });
    sfx('drop', g.x, g.z);
    // the giver holds it up for a moment, then tucks it away
    it.carry.position.set(0, 0, 0);
    g.ch.hands.add(it.carry);
    g.ch.armsUp = true;
    setTimeout(() => { g.ch.armsUp = false; it.carry.removeFromParent(); }, 1800);
    say(n, 'done');
    g.hop();
    finish(id);
  }

  // ------------------------------------------------------------ door 4: star (cable car, top station, stand by the tree)
  async function ride(dir) {
    if (st.riding) return;
    st.riding = true;
    const dest = dir === 'up' ? HILL.cableTop : HILL.cableBase;
    let ok = true;
    try {
      const cc = city().cableCar;
      if (cc && typeof cc.ride === 'function') await cc.ride(dir);
    } catch (e) {
      ok = false;
      console.warn('[tasks] cable car ride failed', e);
    }
    // fallback when the city did not move the player (stub / failure): step off just downhill of the station
    if (Math.hypot(player.pos.x - dest.x, player.pos.z - dest.z) > 2.2) player.teleport(dest.x, dest.z + (dir === 'up' ? 0.95 : 1.0), Math.PI);
    if (!ok && S.phase === 'play') player.controllable = true;
    st.riding = false;
  }
  interact.add({
    id: 'cable-up', x: HILL.cableBase.x, z: HILL.cableBase.z, r: 0.9, label: 'Ride the cable car up', icon: 'cable',
    enabled: () => !st.riding && playing(),
    onInteract: () => { ride('up'); },
  });
  interact.add({
    id: 'cable-down', x: HILL.cableTop.x, z: HILL.cableTop.z, r: 0.9, label: 'Ride the cable car down', icon: 'cable',
    enabled: () => !st.riding && playing(),
    onInteract: () => { ride('down'); },
  });
  function attachStarToBack() {
    // in the cable car the star rests on the bench beside the rider (on the back it would poke through the cabin wall)
    let stow = null;
    try { stow = st.riding ? city().cableCar?.stowAnchor : null; } catch (e) { stow = null; }
    if (stow) {
      if (star.back.parent !== stow) stow.add(star.back);
      star.back.position.set(0, 0, 0);
      star.back.rotation.set(0, 0, 0);
      star.back.scale.setScalar(0.45);
      star.back.visible = true;
      return;
    }
    const body = player.character?.body;
    if (!body) return;
    if (star.back.parent !== body) body.add(star.back);
    star.back.position.set(0, 0.2, -0.1);
    star.back.rotation.set(0, Math.PI, 0.2);
    star.back.scale.setScalar(0.62);
    star.back.visible = true;
  }
  const starAtTop = () => !st.hasStar && !st.starHome && ds(4) !== 'done' && !S.starPlaced;
  interact.add({
    id: 'star-pickup', x: HILL.starSpot.x, z: HILL.starSpot.z, r: 0.85, label: 'Take the tree star', icon: 'star',
    enabled: () => playing() && ds(4) === 'open' && starAtTop(),
    onInteract: () => {
      st.hasStar = true;
      attachStarToBack();
      syncCarrying();
      accept('star');
      sfx('pickup', HILL.starSpot.x, HILL.starSpot.z);
      game.emit('item:pickup', { id: 'star' });
      game.emit('task:progress', { id: 'star', step: 1, of: 2, text: 'Carry it to the big tree' });
      toast("You've got the star! Carry it to the big tree in Market Square.", 4200);
    },
  });
  interact.add({
    id: 'tree-rest', x: tp.x, z: tp.z, r: 2.0, label: 'Rest the star by the tree', icon: 'star',
    enabled: () => playing() && ds(4) === 'open' && st.hasStar && !st.placing,
    onInteract: () => {
      const from = new THREE.Vector3();
      star.back.getWorldPosition(from);
      st.hasStar = false;
      syncCarrying();
      fly(from, homeStar.position.clone(), 0.62, 0.8, () => {
        st.starHome = true;
        sfx('pop', STAND.x, STAND.z);
        game.emit('task:progress', { id: 'star', step: 2, of: 2, text: 'The star is safe until Christmas Eve' });
        say(24, 'starHome');
        givers[24]?.wave();
        finish('star');
      });
      game.emit('item:drop', { id: 'star' });
    },
  });
  // door 24: Christmas Eve — place the star from the stand into the tree's socket → tree:starPlaced → finale
  interact.add({
    id: 'tree-star', x: tp.x, z: tp.z, r: 2.0, label: 'Place the star', icon: 'star',
    enabled: () => playing() && ds(24) === 'open' && st.starHome && !S.starPlaced && !st.placing,
    onInteract: () => placeStar(),
  });
  function placeStar() {
    const t = city().tree;
    const sock = t?.starSocket ? t.starSocket.clone() : new THREE.Vector3(MARKET.tree.x, MARKET.tree.height + 0.1, MARKET.tree.z);
    player.controllable = false;
    player.faceTowards(sock.x, sock.z);
    st.starHome = false;
    fly(homeStar.position.clone(), sock, 0.8, 1.1, () => {
      try { city().tree?.placeStar?.(); } catch (e) { console.warn('[tasks] placeStar', e); }
      S.starPlaced = true;
      completeDoor(24);
      game.emit('tree:starPlaced', {});
      if (S.phase === 'play') player.controllable = true; // no finale took over (stub)
    });
  }

  // star flight (back → stand, stand → socket)
  let flight = null;
  function fly(from, to, s0, s1, done) {
    st.placing = true;
    star.back.removeFromParent();
    star.back.position.copy(from);
    star.back.rotation.set(0, 0, 0);
    star.back.scale.setScalar(s0);
    star.back.visible = true;
    engine.scene.add(star.back);
    sfx('whoosh', to.x, to.z);
    flight = { t: 0, dur: 1.1, from, to, s0, s1, done };
  }

  // ------------------------------------------------------------ giver talk (doors 1–4, door is open)
  function onGiver(n) {
    const id = GIVERS[n].task;
    if ((id === 'bauble' || id === 'scarf') && st.hand === id) { deliver(id); return; }
    const s = S.tasks[id];
    if (s === 'available') { accept(id); say(n, 'accept'); return; }
    if (id === 'lights') say(n, 'remind', { left: 3 - st.lit.filter(Boolean).length });
    else if (id === 'star' && st.hasStar) say(n, 'carrying');
    else say(n, 'remind');
  }
  const giverLabel = (n) => {
    const id = GIVERS[n].task;
    return st.hand === id && ds(n) === 'open' ? { label: `Give the ${id} to ${GIVERS[n].who}`, icon: 'gift' } : null;
  };

  // ------------------------------------------------------------ keep visuals in step with progress
  /** Derive item / house / star state from progress (on load, after progress.reset, after external completions). */
  function sync({ reset = false } = {}) {
    const done = (n) => ds(n) === 'done';
    // lights
    if (done(1)) { st.lit = [true, true, true]; for (let i = 0; i < 3; i++) lightHouse(i, true); S.tasks.lights = 'done'; }
    else if (reset || S.tasks.lights === 'done') { st.lit = [false, false, false]; for (let i = 0; i < 3; i++) lightHouse(i, false); S.tasks.lights = 'available'; }
    // bauble + scarf
    for (const it of [bauble, scarf]) {
      const n = TASK_DOOR[it.id];
      if (done(n)) {
        if (st.hand === it.id) { player.carry(null); st.hand = null; }
        it.state = 'returned';
        S.tasks[it.id] = 'done';
      } else if (reset || S.tasks[it.id] === 'done') {
        if (st.hand === it.id) { player.carry(null); st.hand = null; }
        it.state = 'ground';
        S.tasks[it.id] = 'available';
      }
    }
    // star
    if (done(4)) {
      if (st.hasStar) { star.back.removeFromParent(); st.hasStar = false; }
      st.starHome = !S.starPlaced;
      S.tasks.star = 'done';
    } else if (reset || S.tasks.star === 'done') {
      if (st.hasStar) star.back.removeFromParent();
      st.hasStar = false;
      st.starHome = false;
      S.tasks.star = 'available';
    }
    syncCarrying();
  }

  // tasks completed by other means (e.g. main.js ?spirit=n → game.completeTask): complete the matching door too
  game.on('task:complete', ({ id }) => {
    if (st.own || !(id in TASK_DOOR)) return;
    S.tasks[id] = 'done';
    queueMicrotask(() => {
      const n = TASK_DOOR[id];
      if (ds(n) === 'open') completeDoor(n);
      ctx.progress?._syncSpirit?.(); // game.completeTask bumped spirit by one; progress owns the level now
      sync();
    });
  });
  // the finale's ?finale test flag (or anyone) placing the star: hide the resting star
  game.on('tree:starPlaced', () => { S.starPlaced = true; st.starHome = false; });

  // ------------------------------------------------------------ per-frame
  function update(dt, t) {
    const pl = playing();
    bauble.mesh.visible = ds(2) === 'open' && bauble.state === 'ground';
    scarf.mesh.visible = ds(3) === 'open' && scarf.state === 'ground';
    star.mesh.visible = starAtTop();
    homeStar.visible = st.starHome && !S.starPlaced;
    bauble.mesh.rotation.y = t * 0.6;
    star.mesh.rotation.y = t * 1.2;
    star.mesh.position.y = sy + 0.3 + Math.sin(t * 2) * 0.03;
    if (homeStar.visible) {
      homeStar.rotation.y = Math.sin(t * 0.7) * 0.6;
      homeStar.position.y = stand.position.y + STAND_TOP + Math.sin(t * 1.6) * 0.015;
    }
    for (const s of sparkles) {
      const it = s.it;
      let show = false, x = 0, y = 0, z = 0;
      if (it === star) { show = star.mesh.visible && ds(4) === 'open'; x = star.home.x; z = star.home.z; y = sy + 0.12; }
      else if (it.id === 'home') { show = homeStar.visible; x = STAND.x; z = STAND.z; y = homeStar.position.y - 0.2; }
      else { show = it.mesh.visible; x = it.home.x; z = it.home.z; y = gy(x, z) + 0.08; }
      s.m.visible = show && pl;
      if (s.m.visible) {
        s.m.position.set(x, y + Math.sin(t * 3) * 0.02, z);
        s.m.rotation.y = t * 1.3;
        const k = (it.id === 'home' ? 0.9 : 0.85) + Math.sin(t * 5) * 0.15;
        s.m.scale.set(k, 1, k);
      }
    }
    doorMarkers.forEach((m, i) => {
      m.visible = pl && ds(1) === 'open' && S.tasks.lights === 'active' && !st.lit[i];
      if (m.visible) { m.position.y = 0.75 + Math.sin(t * 2.6 + i) * 0.05; m.rotation.y = t * 1.6; }
    });
    if (st.hasStar) attachStarToBack(); // survives player.setStyle rebuilds
    if (flight) {
      flight.t += dt;
      const u = Math.min(1, flight.t / flight.dur);
      const e = u * u * (3 - 2 * u);
      star.back.position.lerpVectors(flight.from, flight.to, e);
      star.back.position.y += Math.sin(u * Math.PI) * (flight.to.y > 2 ? 1.2 : 0.5);
      star.back.rotation.y = u * Math.PI * 4;
      star.back.scale.setScalar(flight.s0 + e * (flight.s1 - flight.s0));
      if (u >= 1) {
        const f = flight;
        flight = null;
        star.back.removeFromParent();
        st.placing = false;
        f.done();
      }
    }
  }

  // ------------------------------------------------------------ objective for the current door (1–4, 24)
  const onTop = () => HILL.heightAt(player.pos.x, player.pos.z) > 1.6 && player.pos.z < -12;
  const P = (p) => ({ x: p.x, z: p.z });
  function objective(n) {
    const T = S.tasks;
    if (st.hand) {
      const g = givers[TASK_DOOR[st.hand]];
      return { id: st.hand, text: st.hand === 'bauble' ? `Bring the bauble back to ${g.who}` : `Return the scarf to ${g.who}`, icon: 'gift', x: g.x, z: g.z };
    }
    if (n === 1) {
      if (T.lights !== 'active') return { id: 'lights', text: `Help ${GIVERS[1].who} on Holly Lane`, icon: 'talk', x: givers[1].x, z: givers[1].z };
      let best = null, bd = Infinity;
      RESIDENTIAL.taskHouses.forEach((h, i) => {
        if (st.lit[i]) return;
        const d = Math.hypot(h.door[0] - player.pos.x, h.door[1] - player.pos.z);
        if (d < bd) { bd = d; best = h; }
      });
      const k = st.lit.filter(Boolean).length;
      return best ? { id: 'lights', text: `Switch on the wreath lights (${k}/3)`, icon: 'bulb', x: best.door[0], z: best.door[1] } : null;
    }
    if (n === 2 || n === 3) {
      const id = n === 2 ? 'bauble' : 'scarf', g = givers[n], who = GIVERS[n].who;
      if (T[id] !== 'active') return { id, text: n === 2 ? `Help ${who} in Pinecone Park` : `Help ${who} by Frostmere Lake`, icon: 'talk', x: g.x, z: g.z };
      return { id, text: n === 2 ? `Find ${who}'s lost bauble` : `Fetch ${who}'s scarf from the ice`, icon: 'hand', ...P(fetchItems[id].home) };
    }
    if (n === 4) {
      if (st.hasStar || st.placing) return { id: 'star', text: 'Rest the star by the big tree', icon: 'star', ...P(STAND) };
      if (onTop()) return { id: 'star', text: 'Grab the tree star', icon: 'star', ...P(HILL.starSpot) };
      if (T.star !== 'active') return { id: 'star', text: `Talk to ${GIVERS[4].who} at the cable car`, icon: 'talk', x: givers[4].x, z: givers[4].z };
      return { id: 'star', text: 'Ride the cable car up Sledge Hill', icon: 'cable', ...P(HILL.cableBase) };
    }
    if (n === 24) return { id: 'tree', text: 'Place the star on the big tree', icon: 'star', ...P(tp) };
    return null;
  }

  return {
    st, onGiver, giverLabel, sync, update, objective, onTop,
    stand: STAND, homeStar, star,
    get busy() { return st.riding || st.placing || !!flight; },
    get starHome() { return st.starHome; },
    TASK_IDS,
  };
}
