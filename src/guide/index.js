// Guide: where should I go now? (GUIDE.md "Guide" row)  ctx.guide = createGuide(ctx)
//
//   guide.target      → { x, z, label, place, kind: 'person'|'spot'|'area', dist, id } | null, resolved every frame:
//                       calendar "Go there" hint (HUD pill) → the task objective (incl. tasks.focusDoor / pointTo) →
//                       the current door's giver → null. Same object while the id is unchanged (x / z / dist update in place).
//   'guide:target'    game event with the new target (or null) whenever its id changes.
//   guide.showTrail(sec = 20)   light the footprint trail for sec seconds (until you arrive). Auto-on for doors 1–5.
//   guide.showWay({ x, z, label, ms })  point everything at a spot (tasks.pointTo) and light the trail (map "Show the way").
//   guide.placeAt(x, z) → district name ('Market Square' …; between districts: the nearest one).
//   guide.free()      true in free play (same rule as src/social): everything here hides otherwise.
//
// Renders: an edge arrow at the screen border when the target is off-screen (tap it → trail), a bouncing "!" bubble over
// the target person / a glowing pin over a spot when it is on screen (DOM, 0 draw calls), and glowing knitted footprints
// along a walkable route (src/guide/route.js A* on a collider grid; ONE instanced mesh = 1 draw call while shown).
import './guide.css';
import * as THREE from 'three';
import { createRoute } from './route.js';
import { createTrail } from './trail.js';
import { createScreen } from './screen.js';

const ARRIVE = 1.6; // metres: you're there (trail off)
const EDGE_MIN = 3; // metres: closer than this, no edge arrow
const AUTO_DOORS = 5; // doors 1..5: trail on by default (new players)
/** Short labels for objective spots (by objective id, then by icon). */
const SPOT_LABELS = {
  lights: 'Wreath lights', bauble: 'Lost bauble', scarf: 'Scarf', tree: 'Big tree', house: 'Your cottage', daily: 'Advent board',
  'gnomes-find': 'Gnome', 'reindeer-find': 'Clover', 'reindeer-trail': 'Hoofprints', 'reindeer-lead': 'Reindeer Rest',
  'letters-catch': 'Letter', 'letters-post': 'Mailbox', 'lanterns-light': 'Lantern', 'post-deliver': 'Card',
};
const ICON_LABELS = { cable: 'Cable car', star: 'Tree star', bulb: 'Lights', hand: 'Item', gift: 'Gift', lantern: 'Lantern', letter: 'Letter', home: 'Home', gnome: 'Gnome', hoof: 'Clover' };

export function createGuide(ctx) {
  const { engine, game, player, cam, layout, uiRoot } = ctx;
  const S = game.state;
  const route = createRoute(ctx);
  const trail = createTrail(ctx);
  const screen = createScreen(ctx);

  // ------------------------------------------------------------ helpers
  function placeAt(x, z) {
    const id = layout.districtAt(x, z);
    let d = layout.DISTRICTS.find((q) => q.id === id);
    if (!d) { // between districts: the nearest centre
      let bd = Infinity;
      for (const q of layout.DISTRICTS) { const e = (q.center[0] - x) ** 2 + (q.center[1] - z) ** 2; if (e < bd) { bd = e; d = q; } }
    }
    return d ? d.name : 'Tinselby';
  }
  function free() {
    return S.phase === 'play' && player.controllable && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.finale?.running && !ctx.finale?.previewing
      && !ctx.tasks?.playingDoor && !ctx.tasks?.pendingGame
      && !ctx.ui?.modalOpen?.() && !ctx.photo?.isOpen && !document.body.classList.contains('tb-photo')
      && !uiRoot.classList.contains('tb-house-open') && !ctx.map?.isOpen;
  }
  const currentDoor = () => { try { const c = ctx.progress?.current?.(); return typeof c === 'number' ? c : null; } catch (e) { return null; } };
  /** The giver doll standing at (x, z) (its spot or where it stands now), or null. */
  function dollAt(x, z) {
    const dolls = ctx.tasks?.dolls;
    if (!dolls) return null;
    for (const g of dolls) {
      if (Math.abs(g.x - x) < 0.35 && Math.abs(g.z - z) < 0.35) return g;
      const p = g.root.position;
      if (Math.abs(p.x - x) < 0.35 && Math.abs(p.z - z) < 0.35) return g;
    }
    return null;
  }

  // ------------------------------------------------------------ target resolution (cheap; allocates only when the id changes)
  let target = null, doll = null, iconKey = 'star';
  let srcKey = '', srcSub = '', srcQX = 1e9, srcQZ = 1e9, srcDoll = null; // identity of the current target
  let evHint = null; // last 'hint:target' (fallback when nothing else leads)
  game.on('hint:target', (h) => { if (h && Number.isFinite(h.x)) evHint = { x: h.x, z: h.z, n: h.n, text: h.text, until: engine.time + 45 }; });
  game.on('progress:reset', () => { evHint = null; });

  function setTarget(key, sub, x, z, g, label, kind, icon) {
    const qx = Math.round(x * 2), qz = Math.round(z * 2);
    const same = target && key === srcKey && sub === srcSub && g === srcDoll && (g || (qx === srcQX && qz === srcQZ));
    if (same) { target.x = g ? g.root.position.x : x; target.z = g ? g.root.position.z : z; return; }
    srcKey = key; srcSub = sub; srcQX = qx; srcQZ = qz; srcDoll = g;
    doll = g; iconKey = icon || 'star';
    const tx = g ? g.root.position.x : x, tz = g ? g.root.position.z : z;
    target = { x: tx, z: tz, label, place: placeAt(tx, tz), kind, dist: 0, id: g ? `person:${g.id}` : `${kind}:${sub || key}:${qx},${qz}` };
    emitTarget();
  }
  function clearTarget() {
    if (!target) return;
    target = null; doll = null; srcKey = ''; srcDoll = null;
    emitTarget();
  }
  let pendingEmit = false;
  function emitTarget() { pendingEmit = true; }

  function spotLabel(o) {
    return SPOT_LABELS[o.id] || (o.id === 'star' && /tree/i.test(o.text || '') && /Rest/.test(o.text || '') ? 'Star stand' : null)
      || ICON_LABELS[o.icon] || 'Goal';
  }
  function resolve() {
    if (S.phase !== 'play') { clearTarget(); return; }
    // 1. calendar "Go there" (the HUD pill, shown when the game has no objective of its own)
    const h = ctx.ui?.hud?.hint;
    if (h && Number.isFinite(h.x) && Number.isFinite(h.z)) {
      const g = (h.n && ctx.tasks?.givers?.[h.n]) || dollAt(h.x, h.z);
      if (g) setTarget('hint', '', h.x, h.z, g, g.who, 'person', 'talk');
      else setTarget('hint', '', h.x, h.z, null, h.label || placeAt(h.x, h.z), 'area', 'star');
      return;
    }
    // 2. the task objective (includes calendar focusDoor / pointTo)
    const o = ctx.tasks?.objective;
    if (o && Number.isFinite(o.x) && Number.isFinite(o.z)) {
      const g = dollAt(o.x, o.z);
      if (g && !(o.id === 'star' && o.icon !== 'talk')) setTarget('obj', o.id || '', o.x, o.z, g, g.who, 'person', 'talk');
      else if (o.id === 'focus') setTarget('obj', 'focus', o.x, o.z, null, o.label || o.text || placeAt(o.x, o.z), 'area', o.icon);
      else setTarget('obj', o.id || '', o.x, o.z, null, spotLabel(o), 'spot', o.icon);
      return;
    }
    // 3. the current door's giver
    const c = currentDoor();
    const gp = c != null ? ctx.tasks?.giverPos?.(c) : null;
    if (gp) {
      const g = ctx.tasks.givers?.[c] || dollAt(gp.x, gp.z);
      setTarget('door', String(c), gp.x, gp.z, g || null, gp.who || g?.who || 'Friend', g ? 'person' : 'spot', 'talk');
      return;
    }
    // 4. the last calendar hint, while it lasts
    if (evHint && engine.time < evHint.until && Math.hypot(evHint.x - player.pos.x, evHint.z - player.pos.z) > ARRIVE) {
      const g = (evHint.n && ctx.tasks?.givers?.[evHint.n]) || dollAt(evHint.x, evHint.z);
      setTarget('ev', '', evHint.x, evHint.z, g || null, g ? g.who : placeAt(evHint.x, evHint.z), g ? 'person' : 'area', 'talk');
      return;
    }
    clearTarget();
  }

  // ------------------------------------------------------------ talking: hide the "!" while its person speaks
  let talkWho = '', talkUntil = 0;
  game.on('dialog', ({ who, text, ms } = {}) => { talkWho = who || ''; talkUntil = engine.time + (ms || Math.min(7000, 2200 + (text || '').length * 45)) / 1000; });

  // ------------------------------------------------------------ trail control
  let planReady = false, trailUntil = 0, planT = 0, planId = '', planGX = NaN, planGZ = NaN, wanted = false, lastFree = false;
  function showTrail(sec = 20) {
    trailUntil = engine.time + Math.max(1, +sec || 20);
    planId = ''; // force a fresh route
    return !!target;
  }
  const ww = new Float32Array(2), wz2 = new Float32Array(2);
  function replan() {
    planT = engine.time; planId = target.id; planGX = target.x; planGZ = target.z;
    let n = route.plan(player.pos.x, player.pos.z, target.x, target.z);
    if (n >= 2) { trail.lay(route.wx, route.wz, n); return; }
    ww[0] = player.pos.x; wz2[0] = player.pos.z; ww[1] = target.x; wz2[1] = target.z; n = 2; // no way found: straight line
    trail.lay(ww, wz2, n);
  }

  // ------------------------------------------------------------ per frame
  const v = new THREE.Vector3();
  engine.addUpdate(() => {
    const prev = target;
    resolve();
    // the target was swapped out as you reached it (e.g. a "Show the way" spot cleared on arrival before we saw dist < ARRIVE):
    // that still counts as arriving, so the lit trail ends instead of running on to the next goal
    if (prev && target !== prev && Math.hypot(prev.x - player.pos.x, prev.z - player.pos.z) < ARRIVE + 1.5) trailUntil = 0;
    if (target) target.dist = Math.hypot(target.x - player.pos.x, target.z - player.pos.z);
    if (pendingEmit) { pendingEmit = false; game.emit('guide:target', target); }
  }, 6); // after tasks (5) picked the objective, before the HUD (150) reads target.dist

  engine.addUpdate((dt, t) => {
    const W = window.innerWidth, H = window.innerHeight;
    const isFree = free();
    lastFree = isFree;
    // trail
    const c = currentDoor();
    const auto = c != null && c <= AUTO_DOORS && target && !(target.id || '').includes('reindeer-trail');
    if (target && target.dist < ARRIVE) trailUntil = 0;
    wanted = !!(isFree && target && target.dist >= ARRIVE && (auto || engine.time < trailUntil));
    if (wanted) {
      route.tick(engine.time); // grid sampled a slice per frame (and refreshed every 15 s) only while a trail is wanted
      const moved = Math.hypot(target.x - planGX, target.z - planGZ) > 1;
      if (route.ready && (target.id !== planId || !planReady || ((moved || trail.offBy > 1.8) && engine.time - planT > 0.6))) { replan(); planReady = true; }
    } else planReady = false;
    trail.update(dt, t, wanted);

    if (!isFree || !target) { screen.hideAll(); return; }
    screen.refreshRects(dt, W, H);
    const camera = engine.camera;
    camera.updateMatrixWorld();
    const scale = doll ? doll.scale || 1 : 1;
    const gy = doll ? doll.root.position.y + 0.44 * scale + 0.62 : ctx.colliders.heightAt(target.x, target.z);
    // on screen?
    v.set(target.x, gy, target.z).project(camera);
    const inFront = v.z < 1 && v.z > -1;
    const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    const onScreen = inFront && sx > 12 && sx < W - 12 && sy > 12 && sy < H - 12;
    // "!" / pin
    const talking = (doll && talkWho === doll.who && engine.time < talkUntil) || !!ctx.tasks?.choosing;
    let covered = false; // on screen, but its spot is under the HUD: the edge badge points at it from a clear place
    if (onScreen && !talking && target.dist > 0.9 && !(doll && doll.hidden)) {
      const far = Math.min(1, Math.max(0, (target.dist - 12) / 20));
      covered = !screen.placeMark(sx, sy, target.kind, 1 - 0.22 * far, W, H); // kept on screen and off the HUD
    } else screen.hideMark();
    // edge arrow
    if (covered) {
      if (screen.showEdge(dt, W, H, sx - W / 2, sy - H / 2, true, sx, sy, t)) { screen.edgeOn(); screen.setLabel(target, iconKey); }
      else screen.hideEdge();
    } else if (!onScreen && target.dist > EDGE_MIN) {
      let dx, dy;
      if (inFront) { v.set(target.x, gy, target.z).applyMatrix4(camera.matrixWorldInverse); dx = v.x; dy = -v.y; } // = towards the projected point
      else { // behind the camera: the ground bearing from you, relative to the camera's heading (down = behind you)
        const yaw = cam.yaw || 0, ox = target.x - player.pos.x, oz = target.z - player.pos.z;
        const f = -ox * Math.sin(yaw) - oz * Math.cos(yaw), r = ox * Math.cos(yaw) - oz * Math.sin(yaw);
        const a = Math.atan2(r, f); dx = Math.sin(a); dy = -Math.cos(a);
      }
      if (screen.showEdge(dt, W, H, dx, dy, inFront, sx, sy, t)) { screen.edgeOn(); screen.setLabel(target, iconKey); }
      else screen.hideEdge();
    } else screen.hideEdge();
  }, 160); // after the camera (100) moved this frame

  // tap the edge arrow → light the way
  screen.badge.addEventListener('pointerdown', (e) => e.stopPropagation());
  screen.badge.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showTrail(20); try { ctx.audio?.sfx?.('ui'); } catch (er) { /* */ } });

  return {
    get target() { return target; },
    showTrail,
    /** Point everything at a spot and light the trail (map "Show the way"). */
    showWay({ x, z, label = '', icon = 'star', ms = 45000, trail: tr = 20 } = {}) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const ok = ctx.tasks?.pointTo?.({ x, z, text: label || placeAt(x, z), icon, ms });
      if (!ok) evHint = { x, z, n: null, text: label, until: engine.time + ms / 1000 };
      resolve();
      showTrail(tr);
      return true;
    },
    placeAt,
    free,
    /** Test / debug snapshot. */
    get state() {
      const s = screen.st;
      return {
        free: lastFree, target: target && { ...target },
        arrow: s.edge ? { x: Math.round(s.ex), y: Math.round(s.ey), angle: +s.angle.toFixed(3), side: s.side } : null,
        mark: s.mark ? { x: Math.round(s.mx), y: Math.round(s.my), kind: s.kind, push: Math.round(s.push) } : null,
        trail: { wanted, laid: trail.laid, shown: trail.shown, left: +trail.left.toFixed(1), until: Math.max(0, +(trailUntil - engine.time).toFixed(1)) },
        avoid: screen.rects,
      };
    },
    budget() { return { calls: trail.shown ? 1 : 0, prints: trail.shown, tris: trail.shown * 2 }; },
    route,
  };
}
