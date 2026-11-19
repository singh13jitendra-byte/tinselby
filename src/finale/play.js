// Wave 3: hand the town back to the player after the Christmas Eve finale or the "Look up!" preview
// (WAVE3.md §Door 24 exit()): the camera returns to the player's saved view (follow / eye / high), controls come back.
export function backToPlay(ctx, camRig, { dropCarry = true } = {}) {
  const { game, player } = ctx;
  try { ctx.cam.setMode('follow'); } catch (e) { /* camera */ }
  try { camRig?.release?.(1.2); } catch (e) { /* camera */ }
  game.state.phase = 'play';
  player.walkTo(player.pos.x, player.pos.z);
  player.controllable = true;
  if (ctx.input) ctx.input.enabled = true;
  if (dropCarry) { try { player.carry(null); } catch (e) { /* nothing carried */ } }
  try { ctx.teasers?.resume?.(); } catch (e) { /* teasers */ }
  try { ctx.audio?.setMusicLevel?.(game.state.spirit ?? 2); } catch (e) { /* audio is optional */ }
}
