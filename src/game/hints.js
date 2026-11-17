// Objective picking (for the HUD task chip) and the ground chevron that points toward it.
import { GIVERS } from './lines.js';

/** All candidate objectives right now: [{id, text, icon, x, z}]. */
export function candidates(ctx, st) {
  const { game, layout, player } = ctx;
  const T = game.state.tasks;
  const { RESIDENTIAL, PARK, LAKE, HILL, MARKET } = layout;
  const out = [];
  const onTop = HILL.heightAt(player.pos.x, player.pos.z) > 1.6 && player.pos.z < -12;
  const othersDone = T.lights === 'done' && T.bauble === 'done' && T.scarf === 'done';

  // carrying something for a giver? that's the only objective
  if (st.hand) {
    const g = st.hand === 'bauble' ? PARK.giver : LAKE.giver;
    const text = st.hand === 'bauble' ? `Bring the bauble back to ${GIVERS.bauble.who}` : `Return the scarf to ${GIVERS.scarf.who}`;
    return [{ id: st.hand, text, icon: onTop ? 'cable' : 'gift', ...pt(onTop ? HILL.cableTop : g), text2: onTop ? 'Ride the cable car down' : null }].map(fix);
  }

  // up top without the star: the star is the only sensible objective
  if (onTop && !st.hasStar && T.star !== 'done') return [{ id: 'star', text: 'Grab the tree star', icon: 'star', ...pt(HILL.starSpot) }];

  if (T.lights === 'available') out.push({ id: 'lights', text: `Help ${GIVERS.lights.who} on Holly Lane`, icon: 'talk', ...pt(RESIDENTIAL.giver) });
  else if (T.lights === 'active') {
    const n = st.lit.filter(Boolean).length;
    let best = null, bd = Infinity;
    RESIDENTIAL.taskHouses.forEach((h, i) => {
      if (st.lit[i]) return;
      const d = Math.hypot(h.door[0] - player.pos.x, h.door[1] - player.pos.z);
      if (d < bd) { bd = d; best = h; }
    });
    if (best) out.push({ id: 'lights', text: `Switch on the wreath lights (${n}/3)`, icon: 'bulb', x: best.door[0], z: best.door[1] });
  }
  for (const id of ['bauble', 'scarf']) {
    const giver = id === 'bauble' ? PARK.giver : LAKE.giver;
    const item = id === 'bauble' ? PARK.bauble : LAKE.scarf;
    const who = GIVERS[id].who;
    if (T[id] === 'available') out.push({ id, text: id === 'bauble' ? `Help ${who} in Pinecone Park` : `Help ${who} by Frostmere Lake`, icon: 'talk', ...pt(giver) });
    else if (T[id] === 'active') out.push({ id, text: id === 'bauble' ? `Find ${who}'s lost bauble` : `Fetch ${who}'s scarf from the ice`, icon: 'hand', ...pt(item) });
  }
  if (T.star !== 'done') {
    if (st.hasStar) {
      if (othersDone) out.push({ id: 'star', text: 'Place the star on the big tree!', icon: 'star', ...pt(MARKET.tree) });
    } else if (onTop) out.push({ id: 'star', text: 'Grab the tree star', icon: 'star', ...pt(HILL.starSpot) });
    else if (T.star === 'available') out.push({ id: 'star', text: `Talk to ${GIVERS.star.who} at the cable car`, icon: 'talk', ...pt(HILL.giver) });
    else out.push({ id: 'star', text: 'Ride the cable car up Sledge Hill', icon: 'cable', ...pt(HILL.cableBase) });
  }
  // up on the hill top with nothing left up here → ride back down first
  if (onTop) for (const o of out) if (o.id !== 'star' || st.hasStar) { o.text2 = 'Ride the cable car down'; o.icon = 'cable'; o.x = HILL.cableTop.x; o.z = HILL.cableTop.z; }
  if (st.hasStar && !othersDone && !out.length) out.push({ id: 'star', text: 'Carry the star to the big tree', icon: 'star', ...pt(MARKET.tree) });
  return out.map(fix);
}

const pt = (p) => ({ x: p.x, z: p.z });
const fix = (o) => (o.text2 ? { ...o, text: o.text2 } : o);

/** Picks the nearest objective with a little hysteresis so the chip doesn't flicker. */
export function createObjectivePicker(ctx, st) {
  let current = null;
  return function pick() {
    const list = candidates(ctx, st);
    if (!list.length) { current = null; return null; }
    const { x: px, z: pz } = ctx.player.pos;
    const dist = (o) => Math.hypot(o.x - px, o.z - pz);
    let best = list[0];
    for (const o of list) if (dist(o) < dist(best)) best = o;
    const same = current && list.find((o) => o.id === current.id);
    if (same && dist(same) < dist(best) * 1.3 + 0.5) best = same;
    current = best;
    return best;
  };
}

/** Ground chevron circling the player, aimed at the objective; hides when close or not in play. */
export function createHintArrow(ctx, models) {
  const { engine, player, game, cam } = ctx;
  const arrow = models.chevron();
  arrow.renderOrder = 2;
  engine.scene.add(arrow);
  let k = 0;
  return {
    mesh: arrow,
    update(dt, t, obj) {
      const dx = obj ? obj.x - player.pos.x : 0, dz = obj ? obj.z - player.pos.z : 0;
      const d = Math.hypot(dx, dz);
      const show = !!obj && d > 1.4 && game.state.phase === 'play' && player.controllable && !cam.shotActive;
      k += ((show ? 1 : 0) - k) * Math.min(1, dt * 6);
      arrow.visible = k > 0.02;
      if (!arrow.visible || d < 1e-3) return;
      const ux = dx / d, uz = dz / d;
      const r = 0.42 + Math.sin(t * 4) * 0.04;
      arrow.position.set(player.pos.x + ux * r, player.pos.y + 0.025, player.pos.z + uz * r);
      arrow.rotation.y = Math.atan2(-ux, -uz);
      arrow.scale.setScalar(k * (1 + Math.sin(t * 4) * 0.06));
    },
  };
}
