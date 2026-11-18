// Shared follower helper (doors 14 gnomes + 15 Clover): followers trail the player along a breadcrumb path.
//   const fol = createFollowers(ctx, { spacing: 0.35 });
//   const f = fol.add({ x, z });      // f: { x, z, y, h (heading), speed, visible, hold, lift, tx, tz }
//   fol.update(dt)                    // call every frame (cheap and early-out when there are no followers)
// The helper moves f.x / f.z / f.y / f.h / f.speed and sets f.visible; owners turn those into instance matrices.
// `hold = true` freezes a follower's own movement (the owner animates it: hop in, hop out) but keeps its slot in the
// line; f.tx / f.tz always hold the slot target. Followers hide on minigame:start, during the cable car ride and
// whenever the phase isn't 'play' (finale, entry), and reappear in a straight line right behind the player.
// Followers are never colliders, so they can't block the player; they are pushed out of obstacles with colliders.resolve.

const CRUMB = 0.15; // player movement per breadcrumb
const MAX_CRUMBS = 360;
const JUMP = 3; // a bigger one-frame player move (teleport, cable car) snaps the line
const MAX_SPEED = 3.6; // follower chase speed cap (the player walks at 1.9)

export function createFollowers(ctx, { spacing = 0.35, lead = spacing } = {}) {
  const { game, player, colliders } = ctx;
  const S = game.state;
  const list = [];
  let crumbs = []; // oldest → newest {x, z}
  let lastX = 0, lastZ = 0, have = false;
  let suspended = 0; // minigame / cable car
  let hidden = false;
  let snapPending = false;

  const turn = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); };
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };
  const resolve = (p, px, pz) => { try { colliders.resolve(p, 0.07, px, pz); } catch (e) { /* optional */ } };

  /** Straight breadcrumb line behind the player (used on start, after teleports and after hiding). */
  function reseed() {
    const px = player.pos.x, pz = player.pos.z, h = player.heading;
    const bx = -Math.sin(h), bz = -Math.cos(h);
    crumbs = [];
    const need = lead + (list.length + 1) * spacing + 0.3;
    // walk backwards from the player, stopping the line at obstacles so followers never spawn inside walls
    let x = px, z = pz;
    const back = [];
    for (let d = CRUMB; d <= need; d += CRUMB) {
      const p = { x: px + bx * d, z: pz + bz * d };
      resolve(p, x, z);
      if (Math.hypot(p.x - (px + bx * d), p.z - (pz + bz * d)) > 0.04) { // pushed → keep the previous good point
        back.push({ x, z });
      } else { x = p.x; z = p.z; back.push({ x, z }); }
    }
    for (let i = back.length - 1; i >= 0; i--) crumbs.push(back[i]);
    crumbs.push({ x: px, z: pz });
    lastX = px; lastZ = pz; have = true;
    placeAll(true);
  }

  /** Slot targets for every follower along the crumb chain (player first, then crumbs newest → oldest). */
  function placeAll(snap) {
    let ax = player.pos.x, az = player.pos.z;
    let acc = 0, k = 0, want = lead;
    for (let i = crumbs.length - 1; i >= 0 && k < list.length; i--) {
      const bx = crumbs[i].x, bz = crumbs[i].z;
      const seg = Math.hypot(bx - ax, bz - az);
      if (seg < 1e-6) continue;
      while (k < list.length && acc + seg >= want - 1e-6) {
        const u = (want - acc) / seg;
        list[k].tx = ax + (bx - ax) * u; list[k].tz = az + (bz - az) * u;
        k++;
        want = lead + k * spacing;
      }
      acc += seg; ax = bx; az = bz;
    }
    for (; k < list.length; k++) { list[k].tx = ax; list[k].tz = az; } // chain too short → oldest crumb
    if (snap) {
      for (const f of list) {
        f.x = f.tx; f.z = f.tz; f.y = gy(f.x, f.z);
        f.h = player.heading; f.speed = 0;
      }
    }
  }

  const offs = [
    game.on('minigame:start', () => { suspended++; }),
    game.on('minigame:end', () => { suspended = Math.max(0, suspended - 1); }),
    game.on('cablecar:ride', () => { suspended++; }),
    game.on('cablecar:arrive', () => { suspended = Math.max(0, suspended - 1); snapPending = true; }),
  ];

  const api = {
    list,
    spacing,
    get count() { return list.length; },
    get hidden() { return hidden; },
    /** Add a follower; it joins the end of the line. */
    add(f) {
      f.x = f.x ?? player.pos.x; f.z = f.z ?? player.pos.z;
      f.y = f.y ?? gy(f.x, f.z);
      f.h = f.h ?? 0; f.speed = 0; f.lift = f.lift || 0;
      f.visible = !hidden; f.hold = !!f.hold;
      f.tx = f.x; f.tz = f.z; f.px = f.x; f.pz = f.z;
      list.push(f);
      if (!have) reseed();
      return f;
    },
    remove(f) { const i = list.indexOf(f); if (i >= 0) list.splice(i, 1); },
    clear() { list.length = 0; crumbs = []; have = false; },
    /** Put the whole line in a straight row behind the player now. */
    snap() { if (list.length) reseed(); },
    update(dt) {
      if (!list.length) { have = false; return; }
      const playing = S.phase === 'play' && !suspended;
      if (!playing) {
        if (!hidden) { hidden = true; for (const f of list) f.visible = false; }
        have = false; // the player may move a lot while we're away
        return;
      }
      if (hidden || snapPending || !have) {
        hidden = false; snapPending = false;
        reseed();
        for (const f of list) f.visible = true;
        return;
      }
      const px = player.pos.x, pz = player.pos.z;
      const moved = Math.hypot(px - lastX, pz - lastZ);
      if (moved > JUMP) { reseed(); return; }
      if (moved >= CRUMB) {
        const n = Math.floor(moved / CRUMB);
        for (let i = 1; i <= n; i++) {
          const u = (i * CRUMB) / moved;
          crumbs.push({ x: lastX + (px - lastX) * u, z: lastZ + (pz - lastZ) * u });
        }
        const last = crumbs[crumbs.length - 1];
        lastX = last.x; lastZ = last.z;
        if (crumbs.length > MAX_CRUMBS) crumbs.splice(0, crumbs.length - MAX_CRUMBS);
      }
      placeAll(false);
      const cap = MAX_SPEED * dt, kk = 1 - Math.exp(-dt * 11);
      for (const f of list) {
        f.visible = true;
        if (f.hold) { f.speed = 0; continue; } // owner animates it
        const ox = f.x, oz = f.z;
        let dx = (f.tx - f.x) * kk, dz = (f.tz - f.z) * kk;
        const d = Math.hypot(dx, dz);
        if (d > cap) { dx *= cap / d; dz *= cap / d; }
        f.x += dx; f.z += dz;
        resolve(f, ox, oz);
        const mv = Math.hypot(f.x - ox, f.z - oz);
        const sp = mv / Math.max(dt, 1e-4);
        f.speed += (sp - f.speed) * (1 - Math.exp(-dt * 10));
        if (mv > 0.0015) f.h = turn(f.h, Math.atan2(f.x - ox, f.z - oz), dt * 10);
        else f.h = turn(f.h, player.heading, dt * 3);
        const y = gy(f.x, f.z);
        f.y += (y - f.y) * (1 - Math.exp(-dt * 14));
      }
    },
    dispose() { for (const o of offs) { try { o(); } catch (e) { /* */ } } list.length = 0; },
  };
  return api;
}
