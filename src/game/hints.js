// The ground chevron that circles the player and points toward the current objective (see index.js pickObjective).

/** Ground chevron circling the player, aimed at the objective; hides when close or not in play. */
export function createHintArrow(ctx, models) {
  const { engine, player, game, cam } = ctx;
  const arrow = models.chevron();
  arrow.renderOrder = 2;
  arrow.visible = false;
  engine.scene.add(arrow);
  let k = 0;
  return {
    mesh: arrow,
    update(dt, t, obj) {
      const ok = obj && Number.isFinite(obj.x) && Number.isFinite(obj.z);
      const dx = ok ? obj.x - player.pos.x : 0, dz = ok ? obj.z - player.pos.z : 0;
      const d = Math.hypot(dx, dz);
      const show = ok && d > 1.4 && game.state.phase === 'play' && player.controllable && !cam.shotActive;
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
