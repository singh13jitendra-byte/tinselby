// Advent calendar (WAVE1.md §Calendar & UI): the 3D knitted board in Market Square with its Town Spirit counter,
// the daily gift box beside it, and the DOM calendar panel. createCalendar(ctx) → ctx.calendar.
// Draw calls: board 3 (static + doors + labels) + gift 1 (while available) + sparkle burst 1 (only while bursting).
import * as THREE from 'three';
import './calendar.css';
import { createData } from './data.js';
import { createBoard, rewardTint } from './board.js';
import { createBurst } from './burst.js';
import { createGift } from './gift.js';
import { createPanel } from './panel.js';

export function createCalendar(ctx) {
  const { game, engine, interact, colliders, layout } = ctx;
  const data = ctx.ui?.data || createData(ctx);
  const board = createBoard(ctx, data);
  const burst = createBurst(ctx);
  const hint = (n) => { if (ctx.ui?.hint) ctx.ui.hint(n); else { const s = data.spot(n); if (s) game.emit('hint:target', { x: s.x, z: s.z, n, text: data.findText(n) }); } };
  const panel = createPanel(ctx, data, { onHint: hint, rewardTint });

  // ---- daily gift
  function claimDaily() {
    let evt = null;
    const off = game.on('daily:claim', (d) => { evt = d; });
    ctx.ui?.cards?.suppressGrants?.(900); // a reward:grant fired by the claim is shown on the gift card instead
    const r = data.claimDaily();
    off();
    const reward = evt?.reward ?? (r && typeof r === 'object' ? r : null);
    const streak = evt?.streak ?? data.streak;
    setTimeout(() => ctx.ui?.cards?.daily?.({ reward, streak }), 900);
    return reward;
  }
  const gift = createGift(ctx, data, board, burst, claimDaily);

  // ---- collider + interaction
  const [l, r] = board.legs;
  colliders.addSegment(l[0], l[1], r[0], r[1], 0.13, 'advent');
  colliders.addCircle(l[0], l[1], 0.16, 'advent');
  colliders.addCircle(r[0], r[1], 0.16, 'advent');
  const spot = interact.add({
    id: 'advent-board', x: board.front[0], z: board.front[1], r: 1.0, label: 'Open the calendar', icon: 'calendar',
    enabled: () => game.state.phase === 'play' && !panel.isOpen,
    onInteract: () => panel.open(),
  });

  // ---- framing shot: standing at the board eases the camera to a front-on view with the door grid mid-screen and in focus
  const FRAME = 'advent-frame';
  const frame = { on: false, dwell: 0, armed: true, shot: null };
  const fp = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  function framePose() {
    const B = layout.ADVENT_BOARD, h = B.heading || 0, gy = board.group.position.y;
    const yaw = h + 0.16; // a touch off-axis so the player's back doesn't sit square in front of the grid
    fp.tgt.set(B.x, gy + 0.96, B.z);
    fp.pos.set(B.x + Math.sin(yaw) * 3.9, gy + 1.55, B.z + Math.cos(yaw) * 3.9);
  }
  function startFrame() {
    frame.on = true;
    framePose();
    ctx.uiRoot.classList.add('tb-framing');
    const mine = ctx.cam.playShot({
      name: FRAME, duration: 1e5, blendIn: 0.8, blendOut: 0.5, skippable: false, tilt: 0.45,
      post: { bloom: 0.8, glow: 0.85, threshold: 0.04, band: 0.34, falloff: 0.5 },
      update(u, out) { out.pos.copy(fp.pos); out.target.copy(fp.tgt); },
    });
    frame.shot = mine;
    mine.then(() => { if (frame.shot === mine) { frame.shot = null; endFrame(); } });
  }
  function endFrame() {
    if (frame.on) { frame.on = false; ctx.cam.release(FRAME); }
    ctx.uiRoot.classList.remove('tb-framing');
  }
  game.on('calendar:open', () => { frame.armed = false; endFrame(); });
  engine.addUpdate((dt) => {
    const p = ctx.player?.pos;
    if (!p) return;
    const d = Math.hypot(p.x - board.front[0], p.z - board.front[1]);
    const here = game.state.phase === 'play' && !panel.isOpen && (d < 1.4 || interact.current?.id === 'advent-board');
    if (d > 2.0 && !here) frame.armed = true;
    if (!frame.on) {
      const free = !ctx.cam.shotActive && ctx.player.controllable !== false;
      frame.dwell = here && frame.armed && free ? frame.dwell + dt : 0;
      if (frame.dwell > 0.35) { frame.dwell = 0; startFrame(); }
    } else if (!here && d > 1.9 || game.state.phase !== 'play' || ctx.cam.shotName !== FRAME) endFrame();
  }, 61);

  // ---- state sync: door:* events + a slow poll (progress may load or reset after we're built)
  function sync(sparkle) {
    const changed = board.applyStates();
    if (sparkle) for (const c of changed) if (c.from && (c.to === 'open' || c.to === 'done')) {
      burst.play(board.doorWorld(c.n), { up: 1.2, spread: 0.6 });
      break;
    }
    board.setSpirit(data.townSpirit().doors);
    panel.refresh();
  }
  board.applyStates(true);
  board.setSpirit(data.townSpirit().doors);
  for (const e of ['door:open', 'door:complete', 'game:start', 'reward:grant', 'progress:change', 'progress:reset', 'daily:available']) game.on(e, () => sync(e === 'door:open' || e === 'door:complete'));
  game.on('town:spirit', (t) => { board.setSpirit(t?.doors ?? data.townSpirit().doors); panel.refresh(); });
  game.on('net:status', () => panel.refresh());
  let poll = 0;
  engine.addUpdate((dt, t) => {
    board.update(dt, t);
    gift.update(dt, t);
    burst.update(dt);
    poll -= dt;
    if (poll <= 0) { poll = 1.5; sync(false); }
  }, 60);

  return {
    open: (n) => panel.open(n),
    close: () => panel.close(),
    toggle: () => (panel.isOpen ? panel.close() : panel.open()),
    get isOpen() { return panel.isOpen; },
    hint,
    data, board, gift, panel, burst, spot,
    /** Draw calls / triangles this module adds when everything is visible. */
    stats() {
      const b = board.stats();
      const gt = gift.mesh.geometry.attributes.position.count / 3;
      return { boardCalls: b.meshes, boardTris: b.tris, giftTris: Math.round(gt), burstTris: Math.round(burst.mesh.geometry.attributes.position.count / 3) * burst.mesh.count };
    },
  };
}
