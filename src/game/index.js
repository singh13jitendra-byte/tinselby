// Gameplay: the 4 festive tasks (lights, bauble, scarf, star), quest givers, items and the hint arrow.
// See CONTRACTS.md §Tasks. Every ctx.city call is guarded: the city may be a stub.
import * as THREE from 'three';
import { makeModels } from './models.js';
import { createGiver } from './givers.js';
import { GIVERS, LINES, fill } from './lines.js';
import { createObjectivePicker, createHintArrow } from './hints.js';

const TASK_NAMES = { lights: 'the wreath lights on Holly Lane', bauble: "Pip's bauble", scarf: "Ilse's scarf" };

export function createTasks(ctx) {
  const { engine, game, interact, player, layout, colliders, cam } = ctx;
  const S = game.state;
  const { RESIDENTIAL, PARK, LAKE, HILL, MARKET } = layout;
  const models = makeModels(engine.mat);
  const city = () => ctx.city || {};
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };

  const st = {
    lit: [false, false, false],
    hand: null, // 'bauble' | 'scarf' held in the hands
    hasStar: false, // star rides on the player's back
    riding: false,
    placing: false,
    ownCompletion: false,
  };
  const syncCarrying = () => { S.carrying = st.hand || (st.hasStar ? 'star' : null); };

  // ------------------------------------------------------------ helpers
  const vars = (extra = {}) => ({ name: S.playerName || 'friend', ...extra });
  function say(id, key, extra) {
    const g = givers[id];
    game.emit('dialog', { who: GIVERS[id].who, text: fill(LINES[id][key], vars(extra)), pos: g.headPos().clone(), id });
  }
  const toast = (text, ms) => game.emit('ui:toast', { text, ms });
  function accept(id) {
    if (S.tasks[id] !== 'available') return false;
    S.tasks[id] = 'active';
    game.emit('task:accepted', { id });
    return true;
  }
  function complete(id) {
    st.ownCompletion = true;
    game.completeTask(id);
    st.ownCompletion = false;
  }
  const sfx = (name, x, z) => { try { ctx.audio?.sfx?.(name, x != null ? { x, z } : undefined); } catch (e) { /* audio optional */ } };

  // ------------------------------------------------------------ quest givers
  const givers = {};
  const giverPos = { lights: RESIDENTIAL.giver, bauble: PARK.giver, scarf: LAKE.giver, star: HILL.giver };
  for (const id of Object.keys(giverPos)) {
    const p = giverPos[id];
    givers[id] = createGiver(ctx, models, { id, ...GIVERS[id], x: p.x, z: p.z });
  }

  // ------------------------------------------------------------ items
  // bauble in a snow pile (park)
  const bauble = { id: 'bauble', home: PARK.bauble, state: 'ground' };
  bauble.pile = models.snowPile();
  bauble.pile.position.set(bauble.home.x, gy(bauble.home.x, bauble.home.z), bauble.home.z);
  bauble.mesh = models.bauble();
  bauble.mesh.position.set(bauble.home.x + 0.05, bauble.pile.position.y + 0.1, bauble.home.z + 0.06);
  bauble.mesh.rotation.z = 0.5;
  bauble.carry = models.bauble();
  engine.scene.add(bauble.pile, bauble.mesh);
  // scarf lying on the ice (lake)
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

  // sparkles over items that are waiting to be picked up
  const sparkles = [bauble, scarf, star].map((it) => {
    const m = models.mesh(models.sparkleGeo, false);
    engine.scene.add(m);
    return { it, m };
  });
  // little markers above unlit task-house doors while the lights task is active
  const doorMarkers = RESIDENTIAL.taskHouses.map((h) => {
    const m = models.mesh(models.markerGeo, false);
    m.position.set(h.door[0], 0.75, h.door[1]);
    m.scale.setScalar(0.8);
    engine.scene.add(m);
    return m;
  });

  // ------------------------------------------------------------ interaction spots
  for (const id of Object.keys(givers)) {
    const g = givers[id];
    g.spot = interact.add({
      id: 'giver-' + id, x: g.x, z: g.z, r: 1.0, label: `Talk to ${g.who}`, icon: 'talk',
      onInteract: () => onGiver(id),
    });
  }

  function onGiver(id) {
    const g = givers[id];
    g.wave();
    // delivering a fetched item
    if ((id === 'bauble' || id === 'scarf') && st.hand === id) {
      const it = fetchItems[id];
      player.carry(null);
      st.hand = null;
      it.state = 'returned';
      syncCarrying();
      accept(id);
      game.emit('item:drop', { id });
      game.emit('task:progress', { id, step: 2, of: 2, text: 'Returned!' });
      sfx('drop', g.x, g.z);
      // the giver now holds it
      it.carry.position.set(0, 0, 0);
      g.ch.hands.add(it.carry);
      g.ch.armsUp = true;
      setTimeout(() => { g.ch.armsUp = false; }, 1800);
      complete(id);
      say(id, 'done');
      g.hop();
      return;
    }
    const s = S.tasks[id];
    if (s === 'available') {
      accept(id);
      say(id, 'accept');
    } else if (s === 'active') {
      if (id === 'lights') say(id, 'remind', { left: 3 - st.lit.filter(Boolean).length });
      else if (id === 'star' && st.hasStar) say(id, 'carrying');
      else say(id, 'remind');
    } else say(id, 'after');
  }

  // lights: three task-house doors
  function taskHouse(i) {
    const hs = city().residential?.houses;
    if (!Array.isArray(hs)) return null;
    const want = RESIDENTIAL.taskHouses[i];
    const byPos = hs.find((h) => h && h.taskHouse && Math.abs(h.x - want.x) < 0.1 && Math.abs(h.z - want.z) < 0.1);
    if (byPos) return byPos;
    const t = hs.filter((h) => h && h.taskHouse);
    return t[i] || null;
  }
  function lightHouse(i, on = true) {
    try { taskHouse(i)?.setLights?.(on); } catch (e) { console.warn('[tasks] setLights', e); }
  }
  RESIDENTIAL.taskHouses.forEach((h, i) => {
    interact.add({
      id: 'door-' + i, x: h.door[0], z: h.door[1], r: 0.85, label: 'Switch on the lights', icon: 'bulb',
      enabled: () => S.tasks.lights !== 'done' && !st.lit[i],
      onInteract: () => {
        if (accept('lights')) toast(`${GIVERS.lights.who} will be thrilled!`);
        st.lit[i] = true;
        lightHouse(i, true);
        sfx('bell', h.door[0], h.door[1]);
        const n = st.lit.filter(Boolean).length;
        game.emit('task:progress', { id: 'lights', step: n, of: 3, text: `Lights on: ${n}/3` });
        if (n >= 3) {
          complete('lights');
          say('lights', 'done');
          givers.lights.hop();
        } else toast(`Lights on! ${n} of 3`);
      },
    });
  });

  // bauble + scarf pickups
  for (const it of [bauble, scarf]) {
    interact.add({
      id: 'pickup-' + it.id, x: it.home.x, z: it.home.z, r: 0.8,
      label: it.id === 'bauble' ? 'Pick up the bauble' : 'Pick up the scarf', icon: 'hand',
      enabled: () => it.state === 'ground' && S.tasks[it.id] !== 'done',
      onInteract: () => {
        if (st.hand) {
          toast(`Your hands are full! Bring the ${st.hand} back first.`);
          return;
        }
        it.state = 'carried';
        it.mesh.visible = false;
        st.hand = it.id;
        syncCarrying();
        player.carry(it.carry);
        accept(it.id);
        sfx('pickup', it.home.x, it.home.z);
        game.emit('item:pickup', { id: it.id });
        const who = GIVERS[it.id].who;
        game.emit('task:progress', { id: it.id, step: 1, of: 2, text: `Bring it to ${who}` });
        toast(it.id === 'bauble' ? `Found it! Bring the bauble back to ${who}.` : `Got the scarf! Take it back to ${who}.`);
      },
    });
  }

  // star: cable car (base + top), pick up, place on the tree
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
    enabled: () => !st.riding && S.phase === 'play',
    onInteract: () => { ride('up'); },
  });
  interact.add({
    id: 'cable-down', x: HILL.cableTop.x, z: HILL.cableTop.z, r: 0.9, label: 'Ride the cable car down', icon: 'cable',
    enabled: () => !st.riding && S.phase === 'play',
    onInteract: () => { ride('down'); },
  });
  function attachStarToBack() {
    const body = player.character?.body;
    if (!body) return;
    if (star.back.parent !== body) body.add(star.back);
    star.back.position.set(0, 0.2, -0.1);
    star.back.rotation.set(0, Math.PI, 0.2);
  }
  interact.add({
    id: 'star-pickup', x: HILL.starSpot.x, z: HILL.starSpot.z, r: 0.85, label: 'Take the tree star', icon: 'star',
    enabled: () => !st.hasStar && S.tasks.star !== 'done' && star.mesh.visible,
    onInteract: () => {
      st.hasStar = true;
      star.mesh.visible = false;
      attachStarToBack();
      syncCarrying();
      accept('star');
      sfx('pickup', HILL.starSpot.x, HILL.starSpot.z);
      game.emit('item:pickup', { id: 'star' });
      game.emit('task:progress', { id: 'star', step: 1, of: 2, text: 'Carry it to the big tree' });
      const left = remaining();
      toast(left.length ? `You've got the star! The tree needs ${listText(left)} first.` : 'You\'ve got the star! Carry it to the big tree in Market Square.', 4200);
    },
  });
  const remaining = () => ['lights', 'bauble', 'scarf'].filter((id) => S.tasks[id] !== 'done');
  const listText = (ids) => {
    const n = ids.map((id) => TASK_NAMES[id]);
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0];
  };
  const treePos = () => {
    const t = city().tree;
    return { x: t?.pos?.x ?? MARKET.tree.x, z: t?.pos?.z ?? MARKET.tree.z };
  };
  const tp = treePos();
  interact.add({
    id: 'tree-star', x: tp.x, z: tp.z, r: 2.0, label: 'Place the star', icon: 'star',
    enabled: () => st.hasStar && !S.starPlaced && !st.placing,
    onInteract: () => {
      const left = remaining();
      if (left.length) {
        toast(`Almost! The tree is still waiting for ${listText(left)}.`, 4200);
        return;
      }
      placeStar();
    },
  });

  // star flies from the player's back up to the socket, then the city shows it
  let flight = null;
  function placeStar() {
    st.placing = true;
    const t = city().tree;
    const sock = t?.starSocket ? t.starSocket.clone() : new THREE.Vector3(MARKET.tree.x, MARKET.tree.height + 0.1, MARKET.tree.z);
    const from = new THREE.Vector3();
    star.back.getWorldPosition(from);
    star.back.removeFromParent();
    star.back.scale.setScalar(0.62);
    star.back.position.copy(from);
    star.back.rotation.set(0, 0, 0);
    engine.scene.add(star.back);
    st.hasStar = false;
    syncCarrying();
    player.controllable = false;
    player.faceTowards(sock.x, sock.z);
    game.emit('item:drop', { id: 'star' });
    sfx('whoosh', sock.x, sock.z);
    flight = { t: 0, dur: 1.1, from, to: sock };
  }
  function finishStar() {
    star.back.visible = false;
    try { city().tree?.placeStar?.(); } catch (e) { console.warn('[tasks] placeStar', e); }
    S.starPlaced = true;
    st.placing = false;
    complete('star');
    game.emit('task:progress', { id: 'star', step: 2, of: 2, text: 'The star is on the tree!' });
    game.emit('tree:starPlaced', {});
    // if no finale took over (stub), give control back
    if (S.phase === 'play') player.controllable = true;
  }

  // keep things consistent when tasks are completed by other means (e.g. ?spirit=n test param)
  game.on('task:complete', ({ id }) => {
    if (st.ownCompletion) return;
    if (id === 'lights') { st.lit = [true, true, true]; for (let i = 0; i < 3; i++) lightHouse(i, true); }
    if (id === 'bauble' || id === 'scarf') {
      const it = fetchItems[id];
      if (st.hand === id) { player.carry(null); st.hand = null; }
      it.state = 'returned';
      it.mesh.visible = false;
      syncCarrying();
    }
    if (id === 'star' && !S.starPlaced) {
      star.mesh.visible = false;
      if (st.hasStar) { star.back.removeFromParent(); st.hasStar = false; syncCarrying(); }
      try { city().tree?.placeStar?.(); } catch (e) { /* stub */ }
    }
  });

  // ------------------------------------------------------------ per-frame
  const pickObjective = createObjectivePicker(ctx, st);
  const arrow = createHintArrow(ctx, models);
  let objective = null;
  engine.addUpdate((dt, t) => {
    const T = S.tasks;
    for (const id in givers) {
      const g = givers[id];
      g.showMarker = S.phase === 'play' && (T[id] === 'available' || st.hand === id);
      g.spot.label = st.hand === id ? `Give the ${id} to ${g.who}` : `Talk to ${g.who}`;
      g.spot.icon = st.hand === id ? 'gift' : 'talk';
      g.update(dt, t);
    }
    // items bob / sparkle
    bauble.mesh.rotation.y = t * 0.6;
    star.mesh.rotation.y = t * 1.2;
    star.mesh.position.y = sy + 0.3 + Math.sin(t * 2) * 0.03;
    for (const s of sparkles) {
      const it = s.it;
      const waiting = it === star ? star.mesh.visible && T.star !== 'done' : it.state === 'ground' && T[it.id] !== 'done';
      s.m.visible = waiting && S.phase === 'play';
      if (s.m.visible) {
        s.m.position.set(it.home.x, (it === star ? sy + 0.12 : gy(it.home.x, it.home.z) + 0.08) + Math.sin(t * 3) * 0.02, it.home.z);
        s.m.rotation.y = t * 1.3;
        const k = 0.85 + Math.sin(t * 5) * 0.15;
        s.m.scale.set(k, 1, k);
      }
    }
    doorMarkers.forEach((m, i) => {
      m.visible = T.lights === 'active' && !st.lit[i];
      if (m.visible) { m.position.y = 0.75 + Math.sin(t * 2.6 + i) * 0.05; m.rotation.y = t * 1.6; }
    });
    if (st.hasStar) attachStarToBack(); // survives player.setStyle rebuilds
    if (flight) {
      flight.t += dt;
      const u = Math.min(1, flight.t / flight.dur);
      const e = u * u * (3 - 2 * u);
      star.back.position.lerpVectors(flight.from, flight.to, e);
      star.back.position.y += Math.sin(u * Math.PI) * 1.2;
      star.back.rotation.y = u * Math.PI * 4;
      star.back.scale.setScalar(0.62 + e * 0.5);
      if (u >= 1) { flight = null; finishStar(); }
    }
    objective = S.phase === 'play' ? pickObjective() : null;
    arrow.update(dt, t, objective);
  }, 5);

  return {
    /** Current objective {id, text, icon, x, z} or null (HUD task chip). */
    get objective() { return objective; },
    state: st,
    givers,
    /** Self-test: walks all 4 tasks by teleporting + emitting 'interact'. Resolves to a report. */
    selfTest: () => import('./selftest.js').then((m) => m.runSelfTest(ctx)),
  };
}
