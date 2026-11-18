// Daily gift box beside the Advent board: shown while progress.daily.available; interact → claim → pop + sparkle → card.
import * as THREE from 'three';
import { P } from '../core/yarn.js';
import { rbox, box, torus, sph, cyl, xf, merge, KNIT, FELT, GLOSS } from '../core/prims.js';

export function createGift(ctx, data, board, burst, onClaim) {
  const { engine, game, interact } = ctx;
  const [gx, gz] = board.toWorld(1.35, 0.5);
  const parts = [
    xf(rbox(0.22, 0.17, 0.22, 0.025, P.red, KNIT), [0, 0.085, 0]),
    xf(rbox(0.245, 0.05, 0.245, 0.02, '#a32a27', KNIT), [0, 0.185, 0]),
    xf(box(0.04, 0.172, 0.226, P.gold, FELT), [0, 0.086, 0]),
    xf(box(0.226, 0.172, 0.04, P.gold, FELT), [0, 0.086, 0]),
    xf(box(0.042, 0.054, 0.25, P.gold, FELT), [0, 0.186, 0]),
    xf(box(0.25, 0.054, 0.042, P.gold, FELT), [0, 0.186, 0]),
    xf(torus(0.042, 0.014, P.gold, FELT, Math.PI * 2, 14), [-0.04, 0.24, 0], [0, 0.3, 0.55]),
    xf(torus(0.042, 0.014, P.gold, FELT, Math.PI * 2, 14), [0.04, 0.24, 0], [0, -0.3, -0.55]),
    xf(sph(0.022, '#c98a2a', FELT, 8, 6), [0, 0.225, 0]),
    // knitted tag on a string
    xf(cyl(0.003, 0.003, 0.06, 4, P.thread, KNIT), [0.1, 0.19, 0.1], [0.5, 0, -0.5]),
    xf(rbox(0.05, 0.035, 0.008, 0.006, P.cream, FELT), [0.13, 0.16, 0.135], [0, 0.6, 0.2]),
    xf(sph(0.006, P.ink, GLOSS, 6, 4), [0.13, 0.16, 0.14]),
  ];
  const mesh = new THREE.Mesh(merge(parts), engine.mat);
  mesh.castShadow = mesh.receiveShadow = true;
  const holder = new THREE.Group();
  holder.position.set(gx, ctx.colliders?.heightAt?.(gx, gz) || 0, gz);
  holder.rotation.y = board.group.rotation.y - 0.35;
  holder.add(mesh);
  holder.visible = false;
  engine.scene.add(holder);

  let pop = -1; // seconds since claim, -1 = idle
  let claimed = false;
  const shown = () => data.dailyAvailable && !claimed && game.state.phase === 'play';
  ctx.colliders?.addBlockFn?.((x, z) => holder.visible && pop < 0 && Math.hypot(x - gx, z - gz) < 0.14);
  const spot = interact.add({
    id: 'daily-gift', x: gx, z: gz, r: 0.75, label: 'Open your daily gift', icon: 'gift',
    enabled: () => shown() && pop < 0,
    onInteract: () => claim(),
  });

  function claim() {
    if (pop >= 0 || claimed) return;
    claimed = true;
    pop = 0;
    let reward = null;
    try { reward = onClaim(); } catch (e) { console.error('[calendar] daily claim', e); }
    try { ctx.audio?.sfx?.('gift', { x: gx, z: gz }); } catch (e) { /* */ }
    setTimeout(() => {
      burst.play(new THREE.Vector3(gx, holder.position.y + 0.25, gz), { up: 1.8, spread: 1.0 });
      try { ctx.audio?.sfx?.('pop', { x: gx, z: gz }); } catch (e) { /* */ }
    }, 320);
    return reward;
  }

  function update(dt, t) {
    if (claimed && pop < 0 && !data.dailyAvailable) claimed = false; // progress took it; a new day can bring it back
    if (pop >= 0) {
      pop += dt;
      // wind-up squash, big stretch, then shrink away
      const k = pop;
      let sx = 1, sy = 1;
      if (k < 0.3) { const u = k / 0.3; sy = 1 - 0.25 * Math.sin(u * Math.PI / 2); sx = 1 + 0.15 * Math.sin(u * Math.PI / 2); }
      else if (k < 0.55) { const u = (k - 0.3) / 0.25; sy = 0.75 + u * 0.75; sx = 1.15 - u * 0.25; }
      else { const u = Math.min(1, (k - 0.55) / 0.3); sy = sx = (1 - u) * 1.2; }
      mesh.scale.set(sx, sy, sx);
      mesh.rotation.y = k * 6;
      if (k > 0.9) { holder.visible = false; pop = -1; mesh.scale.setScalar(1); mesh.rotation.set(0, 0, 0); }
      return;
    }
    const vis = shown();
    if (vis !== holder.visible) holder.visible = vis;
    if (!vis) return;
    // idle: a little hop + wiggle every few seconds so it catches the eye
    const c = t % 3.2;
    if (c < 0.5) { const u = c / 0.5; mesh.position.y = Math.sin(u * Math.PI) * 0.05; mesh.rotation.z = Math.sin(u * Math.PI * 4) * 0.08; }
    else { mesh.position.y = 0; mesh.rotation.z = 0; }
  }

  return {
    holder, mesh, spot, update, claim,
    get visible() { return holder.visible; },
    pos: { x: gx, z: gz },
  };
}
