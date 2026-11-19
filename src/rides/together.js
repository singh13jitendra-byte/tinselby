// Ride together (PLAY.md §Ride together; wave 4, only with W4 on). Glue between the free-play rides and the shared town:
//  - presence: while you sit on a ride, net.setPresence({ ride: { k: rideId, s: seatIndex } }); { ride: null } after.
//  - remote riders: every remote player whose presence has a ride is pinned seated in the matching seat of YOUR copy of
//    that ride (net.doll(id).seat(pose) every frame, seat(null) when they leave), so the Ferris cabin swing, the carousel
//    bob and the tram / carriage all carry them. Skate / sled riders keep their streamed position (no seat pose).
//  - joining: rides.joinWith(id) takes you to the ride that player is on (a short walk is left to the ride itself, a long
//    way is a safe teleport) and boards you in the nearest free seat beside them; walking up to a ride somebody is on
//    turns its board prompt into "Join <name>".
//  - rides.ridersOf(rideId) → [{ id, name, s }] for UI; rides.rideOf(id) → { k, s, name } | null.
//
// Each ride module that takes part exposes `seats` (all optional except n / mine):
//   { n, mine() → my seat | null, pose(s, out) → out | null (world pose of a seated doll's root: x, y, z, h (+ roll,
//     pose 'bench' | 'astride', scale)), near(s) → other seats, nearest first, tick(dt, occupied) (smooth seat shifts),
//     join(s, taken, spotIndex) → bool, where(rider) → { x, z, h?, i? } | null, spots: interact spots, remote(on) }
// Seat clashes (two players picked the same seat on different screens): remotes are drawn in a free seat nearby; you
// never board into a seat a remote is drawn in.
import { W4 } from './flag.js';

const POLL = 0.3; // s between net.players() reads (net:presence also updates at once)
const FAR = 6; // further than this from the ride: teleport rather than walk

export function createTogether(ctx, rides) {
  const { game, player } = ctx;
  const riders = new Map(); // id → { id, name, k, s } (as they report it)
  const shown = new Map(); // id → { k, s, pose } (where they are drawn on this screen)
  const occ = new Map(); // rideId → Set of seats drawn as taken here (you + remotes)
  const pinned = new Set(); // ids whose doll we pinned last frame
  let sent = null, pollT = 0, warned = false;
  const byId = (k) => rides.list.find((r) => r.id === k) || null;
  const toast = (text, ms = 2600) => game.emit('ui:toast', { text, ms });
  const net = () => ctx.net || null;

  // ---------------------------------------------------------------- reading the room
  function valid(ride) {
    if (!ride || typeof ride !== 'object' || typeof ride.k !== 'string') return null;
    const r = byId(ride.k), s = +ride.s;
    if (!r || !r.seats || !Number.isInteger(s) || s < 0 || s >= (r.seats.n || 1)) return null;
    return { k: ride.k, s };
  }
  function refresh() {
    let list = [];
    try { list = net()?.players?.() || []; } catch (e) { list = []; }
    const seen = new Set();
    for (const p of list) {
      const v = p && valid(p.ride);
      if (!v) continue;
      riders.set(p.id, { id: p.id, name: p.name || 'Friend', k: v.k, s: v.s });
      seen.add(p.id);
    }
    for (const id of [...riders.keys()]) if (!seen.has(id)) riders.delete(id);
  }
  game.on('net:presence', (d) => {
    if (!W4 || !d || !d.id) return;
    const v = valid(d.ride);
    if (!v) { riders.delete(d.id); return; }
    let name = riders.get(d.id)?.name;
    if (!name) { try { name = (net()?.players?.() || []).find((p) => p.id === d.id)?.name; } catch (e) { /* keep going */ } }
    riders.set(d.id, { id: d.id, name: name || 'Friend', k: v.k, s: v.s });
  });
  game.on('net:leave', (d) => { if (d && d.id) riders.delete(d.id); });

  // ---------------------------------------------------------------- who sits where on this screen
  function mySeat() {
    const a = rides.active;
    if (!a || !a.seats) return null;
    try { const s = a.seats.mine(); return Number.isInteger(s) ? s : null; } catch (e) { return null; }
  }
  function assign() {
    shown.clear();
    const me = mySeat(), a = rides.active;
    for (const r of rides.list) {
      const set = occ.get(r.id) || new Set();
      set.clear();
      occ.set(r.id, set);
      if (a === r && me != null) set.add(me);
    }
    const list = [...riders.values()].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
    const later = [];
    // those whose own seat is free first, then the rest into the nearest free seat
    for (const p of list) {
      const set = occ.get(p.k);
      if (set.has(p.s)) { later.push(p); continue; }
      set.add(p.s); shown.set(p.id, { k: p.k, s: p.s });
    }
    for (const p of later) {
      const r = byId(p.k), set = occ.get(p.k);
      let near = [];
      try { near = r.seats.near?.(p.s) || []; } catch (e) { near = []; }
      const s = near.find((q) => !set.has(q));
      if (s == null) continue; // ride full here: they stay where they stream
      set.add(s); shown.set(p.id, { k: p.k, s });
    }
  }
  /** Seats drawn as taken by remotes on a ride (you excluded). */
  function takenByOthers(k) {
    const out = new Set();
    for (const v of shown.values()) if (v.k === k) out.add(v.s);
    return out;
  }

  // ---------------------------------------------------------------- per frame (after every ride moved)
  const poses = new Map(); // id → reusable pose object
  function update(dt) {
    if (!W4) return;
    // presence
    const a = rides.active, me = mySeat();
    const key = a && me != null ? a.id + ':' + me : '';
    if (key !== sent) {
      sent = key;
      try { net()?.setPresence?.({ ride: key ? { k: a.id, s: me } : null }); } catch (e) { /* never throw */ }
    }
    if ((pollT -= dt) <= 0) { pollT = POLL; refresh(); }
    assign();
    for (const r of rides.list) {
      try { r.seats?.tick?.(dt, occ.get(r.id)); } catch (e) { warnOnce(e); }
    }
    // pin remote riders
    const now = new Set();
    for (const [id, v] of shown) {
      const r = byId(v.k);
      if (!r?.seats?.pose) continue;
      let out = poses.get(id);
      if (!out) poses.set(id, (out = { x: 0, y: 0, z: 0, h: 0 }));
      out.roll = 0; out.pose = 'bench'; out.scale = 1;
      let p = null;
      try { p = r.seats.pose(v.s, out); } catch (e) { warnOnce(e); }
      if (!p || !Number.isFinite(p.x + p.y + p.z + p.h)) continue;
      let doll = null;
      try { doll = net()?.doll?.(id) || null; } catch (e) { doll = null; }
      if (!doll || typeof doll.seat !== 'function') continue;
      try { doll.seat(p); now.add(id); } catch (e) { warnOnce(e); }
    }
    for (const id of pinned) {
      if (now.has(id)) continue;
      try { net()?.doll?.(id)?.seat?.(null); } catch (e) { /* gone */ }
      poses.delete(id);
    }
    pinned.clear();
    for (const id of now) pinned.add(id);
    // rides with remote riders aboard show their riding body (open tram, carriage without its back passengers)
    for (const r of rides.list) {
      if (!r.seats?.remote) continue;
      let on = false;
      for (const v of shown.values()) if (v.k === r.id) { on = true; break; }
      try { r.seats.remote(on); } catch (e) { warnOnce(e); }
    }
    // join prompts follow their ride's (moving) board spot
    for (const j of joinSpots) { j.spot.x = j.orig.x; j.spot.z = j.orig.z; }
  }
  function warnOnce(e) { if (!warned) { warned = true; console.warn('[rides] together', e); } }

  // ---------------------------------------------------------------- joining
  function canGo() {
    return game.state.phase === 'play' && !ctx.minigames?.active && !ctx.finale?.running;
  }
  /** Board `ride` beside rider p (spotIndex: which of the ride's prompts you stand at, if any). */
  function boardBeside(p, ride, spotIndex) {
    const want = shown.get(p.id)?.s ?? p.s;
    let ok = false;
    try { ok = !!ride.seats.join(want, takenByOthers(ride.id), spotIndex); } catch (e) { console.warn('[rides] join', e); ok = false; }
    if (!ok) toast('No room just now: try again in a moment');
    return ok;
  }
  function joinWith(id) {
    if (!W4) return false;
    refresh();
    const p = riders.get(id);
    if (!p) { toast('They are not on a ride right now'); return false; }
    const ride = byId(p.k);
    if (!ride?.seats?.join || !canGo()) return false;
    if (rides.active) {
      if (rides.active === ride && mySeat() != null) return true; // already aboard together
      try { rides.active.stop(); } catch (e) { /* keep going */ }
      if (rides.active) return false;
    }
    let w = null;
    try { w = ride.seats.where?.(p) || null; } catch (e) { w = null; }
    if (w && Math.hypot(w.x - player.pos.x, w.z - player.pos.z) > FAR) safeTeleport(w);
    return boardBeside(p, ride, w?.i);
  }
  function safeTeleport(w) {
    player.walkTo?.(player.pos.x, player.pos.z); // drop any scripted walk / tap target
    ctx.input?.clearTap?.();
    player.teleport(w.x, w.z, w.h ?? player.heading);
    try { ctx.colliders.resolve?.(player.pos, 0.08); } catch (e) { /* keep the raw spot */ }
    player.pos.y = ctx.colliders.heightAt?.(player.pos.x, player.pos.z) ?? player.pos.y;
    player.object.position.copy(player.pos);
    ctx.cam?.follow?.(player); // snap the follow camera's target (the ride's own shot glides in from where the view was)
    ctx.audio?.sfx?.('pop', { x: player.pos.x, z: player.pos.z, vol: 0.5 });
  }

  // ---------------------------------------------------------------- "Join <name>" prompts
  // Every ride's board prompt gets a twin at the same spot: while somebody rides it, the twin ("Join Pip") is the one
  // offered and the plain prompt steps aside.
  const joinSpots = [];
  function firstRider(k) {
    let best = null;
    for (const p of riders.values()) if (p.k === k && (!best || p.id < best.id)) best = p;
    return best;
  }
  if (W4) {
    for (const ride of rides.list) {
      const list = ride.seats?.spots || [];
      list.forEach((orig, i) => {
        if (!orig || !ride.seats.join) return;
        const base = orig.enabled || (() => true);
        orig.enabled = () => base() && !firstRider(ride.id);
        const spot = ctx.interact.add({
          id: orig.id + '-join', x: orig.x, z: orig.z, r: orig.r, icon: orig.icon, label: 'Join',
          enabled: () => {
            const p = firstRider(ride.id);
            if (!p || !base()) return false;
            spot.label = 'Join ' + p.name; // read by the UI when this prompt becomes the current one
            return true;
          },
          onInteract: () => { const p = firstRider(ride.id); if (p) boardBeside(p, ride, i); },
        });
        joinSpots.push({ spot, orig });
      });
    }
  }

  return {
    update,
    joinWith,
    ridersOf(k) {
      if (!W4) return [];
      const out = [];
      for (const p of riders.values()) if (p.k === k) out.push({ id: p.id, name: p.name, s: p.s });
      return out;
    },
    rideOf(id) { if (!W4) return null; const p = riders.get(id); return p ? { k: p.k, s: p.s, name: p.name } : null; },
    occupied(k) { return occ.get(k) || new Set(); },
    takenByOthers,
    /** Tests / diagnostics. */
    get _state() { return { sent, riders: [...riders.values()], shown: [...shown.entries()], pinned: [...pinned] }; },
  };
}
