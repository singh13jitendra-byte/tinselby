import * as THREE from 'three';

/**
 * Camera director. Base modes follow the player; shots (cinematics) blend over the top.
 *  - setMode('follow' | 'high' | 'close' | 'attract')   follow = default mid view, high = bird's-eye diorama,
 *    close = low angle behind the action, attract = slow orbit over the city (entry screen)
 *  - toggleView()  follow ↔ high (UI button / C key)
 *  - playShot({ duration, update(t01, out, ctx), blendIn = 0.7, blendOut = 0.7, skippable = true, tilt = 1 }) → Promise
 *      update() writes out.pos (Vector3) and out.target (Vector3); t01 runs 0 → 1 over duration.
 *  - skip()        ends the current skippable shot (tap / any key during a cinematic)
 *  - yaw           current ground yaw used for camera-relative controls
 */
export function createCameraDirector(engine, game) {
  const cam = engine.camera;
  const MODES = {
    follow: { dist: 6.7, pitch: 36, fov: 32, tilt: 1.0, lead: 0.35 },
    high: { dist: 21, pitch: 60, fov: 32, tilt: 0.7, lead: 0.2 },
    close: { dist: 3.3, pitch: 16, fov: 36, tilt: 1.6, lead: 0.1 },
    attract: { dist: 24, pitch: 48, fov: 32, tilt: 0.8, lead: 0 },
  };
  const BASE_YAW = 0.28; // camera sits south-south-east, looking north
  const cur = { ...MODES.follow, yaw: BASE_YAW };
  const target = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let mode = 'follow';
  let subject = null; // { pos: Vector3, vel?: Vector2 }
  let shot = null;
  const shotOut = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const basePos = new THREE.Vector3(), baseTarget = new THREE.Vector3();
  let attractT = 0;
  let closeYaw = null;

  const director = {
    yaw: BASE_YAW,
    get mode() { return mode; },
    get shotActive() { return !!shot; },
    /** True while a shot the player may skip is running (UI shows 'Tap to skip'). */
    get shotSkippable() { return !!shot && shot.skippable && !shot.skipping; },
    follow(obj) { subject = obj; if (obj) target.copy(obj.pos); },
    setMode(m, opts = {}) { mode = m; closeYaw = opts.yaw ?? null; },
    toggleView() { director.setMode(mode === 'high' ? 'follow' : 'high'); game.emit('camera:mode', { mode }); },
    playShot(spec) {
      if (shot) shot.resolve();
      return new Promise((resolve) => {
        shot = { blendIn: 0.7, blendOut: 0.7, skippable: true, tilt: 1, ...spec, t: 0, resolve, skipping: false };
        game.emit('camera:shot', { name: spec.name || '', skippable: spec.skippable !== false });
      });
    },
    skip() { if (shot && shot.skippable && !shot.skipping) { shot.skipping = true; shot.skipT = shot.t; } },
    update(dt) {
      const m = MODES[mode];
      const k = 1 - Math.exp(-dt * 2.5);
      cur.dist += (m.dist - cur.dist) * k;
      cur.pitch += (m.pitch - cur.pitch) * k;
      cur.fov += (m.fov - cur.fov) * k;
      cur.tilt += (m.tilt - cur.tilt) * k;
      const yawGoal = mode === 'close' && closeYaw != null ? closeYaw : mode === 'attract' ? BASE_YAW + attractT * 0.12 : BASE_YAW;
      let dy = yawGoal - cur.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cur.yaw += dy * k;
      if (mode === 'attract') { attractT += dt; target.lerp(tmp.set(Math.sin(attractT * 0.15) * 4, 0, Math.cos(attractT * 0.11) * 3), 1 - Math.exp(-dt)); }
      else if (subject) {
        const v = subject.vel || { x: 0, y: 0 };
        tmp.set(subject.pos.x + v.x * m.lead, subject.pos.y, subject.pos.z + v.y * m.lead);
        target.lerp(tmp, 1 - Math.exp(-dt * 3.4));
      }
      const pr = THREE.MathUtils.degToRad(cur.pitch), hd = Math.cos(pr) * cur.dist;
      basePos.set(target.x + Math.sin(cur.yaw) * hd, target.y + Math.sin(pr) * cur.dist, target.z + Math.cos(cur.yaw) * hd);
      baseTarget.set(target.x, target.y + (mode === 'close' ? 0.25 : 0.15), target.z);
      let w = 0, tilt = cur.tilt;
      if (shot) {
        shot.t += dt;
        const d = shot.duration;
        const u = Math.min(1, shot.t / d);
        shot.update(u, shotOut, { dt, t: shot.t });
        w = smooth(Math.min(1, shot.t / shot.blendIn));
        if (shot.skipping) w *= 1 - smooth(Math.min(1, (shot.t - shot.skipT) / 0.4));
        else if (d - shot.t < shot.blendOut) w *= smooth(Math.max(0, (d - shot.t) / shot.blendOut));
        tilt = cur.tilt + (shot.tilt - cur.tilt) * w;
        if (shot.t >= d || (shot.skipping && shot.t - shot.skipT >= 0.4)) {
          const r = shot.resolve; shot = null; w = 0; r();
          game.emit('camera:shotEnd', {});
        }
      }
      cam.position.copy(basePos).lerp(shotOut.pos, w);
      look.copy(baseTarget).lerp(shotOut.target, w);
      cam.lookAt(look);
      if (Math.abs(cam.fov - cur.fov) > 0.01) { cam.fov = cur.fov; cam.updateProjectionMatrix(); }
      director.yaw = cur.yaw;
      engine.focus.copy(look);
      // tilt-shift band follows what we look at
      tmp.copy(look).project(cam);
      engine.post.focus += ((tmp.y + 1) / 2 - engine.post.focus) * (1 - Math.exp(-dt * 6));
      engine.post.strength = tilt;
    },
  };
  return director;
}

const smooth = (x) => x * x * (3 - 2 * x);
