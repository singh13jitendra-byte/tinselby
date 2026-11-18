import * as THREE from 'three';

/**
 * Camera director. Base modes follow the player; shots (cinematics) blend over the top.
 *  - setMode('follow' | 'high' | 'close' | 'attract')   follow = default mid view, high = bird's-eye diorama,
 *    close = low angle behind the action, attract = slow orbit over the city (entry screen)
 *  - toggleView()  follow ↔ high (UI button / C key)
 *  - playShot({ duration, update(t01, out, ctx), blendIn = 0.7, blendOut = 0.7, skippable = true, tilt = 1 }) → Promise
 *      update() writes out.pos (Vector3) and out.target (Vector3); t01 runs 0 → 1 over duration.
 *      Optional post: { bloom, glow, threshold, band, falloff } = look override for close shots, blended in and out
 *      with the shot (bloom / glow multiply the time-of-day look, threshold is added, band / falloff set the sharp
 *      tilt-shift band in screen heights; see engine.shotPost). The blur amount itself is `tilt`.
 *      Optional portrait: false | { keep, lift } = how the shot adapts to a tall (portrait) screen, see below.
 *  - skip()        ends the current skippable shot (tap / any key during a cinematic)
 *  - yaw           current ground yaw used for camera-relative controls
 *
 * PORTRAIT (phones held upright, tablets in portrait, narrow windows): the director is aspect-aware.
 *  - cam.portrait      0..1, smoothed: 0 for aspect ≥ 1 (landscape / desktop: everything exactly as before),
 *                      1 for aspect ≤ 0.5 (390×844 phones), 0.5 for a 768×1024 tablet. Blends over ~1 s on rotate.
 *  - cam.isPortrait    true while the screen is taller than wide (instant, no smoothing)
 *  - cam.aspect        current camera aspect (w / h)
 *  - Base modes: in portrait each mode widens its vertical FOV, raises its pitch, pulls back until about
 *    PORTRAIT[mode].half world units are visible either side of the subject, and tilts up so the subject sits a
 *    little below the screen centre (`lift`, in half screen heights). The tilt-shift band is re-centred on the
 *    subject (not the look point), widened slightly, and the blur scaled down for the tall screen.
 *  - Shots: in portrait every playShot pose is pulled back along its view line so it keeps about `keep` (default
 *    0.62) of the horizontal framing a 16:9 screen would show (bounded to 2.2×), and can be tilted with `lift`
 *    (default 0). Pass `portrait: { keep, lift }` to tune a shot, or `portrait: false` to use the pose as written;
 *    cam.setShotPortrait(name, { keep, lift }) does the same for shots built in code you don't own (by shot name).
 *  - DOM: <body> gets `tb-portrait` or `tb-landscape` (kept in sync on resize / rotate), and the game emits
 *    `view:orientation { portrait: bool }` when it flips. CSS can also use `@media (orientation: portrait)`.
 *  Input needs nothing: joystick / keys map through cam.yaw and tap-to-walk raycasts through the live camera.
 */
export function createCameraDirector(engine, game) {
  const cam = engine.camera;
  const MODES = {
    follow: { dist: 6.7, pitch: 36, fov: 32, tilt: 1.0, lead: 0.35 },
    high: { dist: 21, pitch: 60, fov: 32, tilt: 0.7, lead: 0.2 },
    close: { dist: 3.3, pitch: 16, fov: 36, tilt: 1.6, lead: 0.1 },
    attract: { dist: 26, pitch: 13, fov: 32, tilt: 0.6, lead: 0, lookUp: 2.4 }, // low enough to show sky, moon and hills
  };
  // portrait adjustments at full strength (cam.portrait = 1): + degrees of FOV / pitch, half-width in world units
  // kept visible beside the subject, lift = subject sits this many half screen heights below the centre
  const PORTRAIT = {
    follow: { fov: 12, pitch: 12, half: 2.15, lift: 0.17, ahead: 2.0 },
    high: { fov: 12, pitch: 6, half: 6.0, lift: 0.08, ahead: 1.5 },
    close: { fov: 14, pitch: 8, half: 1.35, lift: 0.1, ahead: 0.5 },
    attract: { fov: 20, pitch: 3, half: 7.5, lift: 0.44, ahead: 0 },
  };
  const SHOT_REF = Math.tan(THREE.MathUtils.degToRad(16)) * (16 / 9); // horizontal half-extent per unit distance of a 16:9 follow view
  const BASE_YAW = 0.28; // camera sits south-south-east, looking north
  const portraitOf = (a) => Math.min(1, Math.max(0, (1 - a) / 0.5));
  let pS = portraitOf(cam.aspect); // smoothed portrait factor
  const cur = { ...MODES.follow, yaw: BASE_YAW };
  const target = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fpt = new THREE.Vector3(); // tilt-shift focus point (the subject)
  let mode = 'follow';
  let subject = null; // { pos: Vector3, vel?: Vector2 }
  let shot = null;
  const shotOut = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const basePos = new THREE.Vector3(), baseTarget = new THREE.Vector3(), baseLook = new THREE.Vector3();
  const shotPos = new THREE.Vector3(), shotLook = new THREE.Vector3();
  let attractT = 0;
  let closeYaw = null;
  const shotPortrait = {}; // name → { keep, lift } | false, for shots built elsewhere (see setShotPortrait)

  /** Mode parameters for the current portrait factor (p = 0 returns the landscape values untouched). */
  function goal(m, name, p) {
    if (p <= 0) return m;
    const a = Math.max(0.2, cam.aspect), P = PORTRAIT[name] || PORTRAIT.follow;
    const fov = m.fov + P.fov * p, pitch = m.pitch + P.pitch * p;
    const t0 = Math.tan(THREE.MathUtils.degToRad(m.fov / 2)), t1 = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const half = m.dist * t0 + (P.half - m.dist * t0) * p; // = the square-screen half-width at p = 0 (continuous)
    const dist = Math.max(m.dist, half / (t1 * a));
    return { ...m, fov, pitch, dist };
  }
  /** Turn the view line pos → tgt up by `lift` half screen heights (subject drops below centre); writes out. */
  function lifted(pos, tgt, lift, fovDeg, out) {
    out.copy(tgt);
    if (!(lift > 0)) return out;
    const dx = tgt.x - pos.x, dy = tgt.y - pos.y, dz = tgt.z - pos.z;
    const hd = Math.hypot(dx, dz) || 1e-6, L = Math.hypot(hd, dy);
    const ang = Math.atan2(-dy, hd) - Math.atan(lift * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)));
    return out.set(pos.x + (dx / hd) * Math.cos(ang) * L, pos.y - Math.sin(ang) * L, pos.z + (dz / hd) * Math.cos(ang) * L);
  }
  let lastPortrait = null;
  function syncBody() {
    const pt = cam.aspect < 1;
    if (pt === lastPortrait) return;
    lastPortrait = pt;
    const b = document.body;
    if (b) { b.classList.toggle('tb-portrait', pt); b.classList.toggle('tb-landscape', !pt); }
    game.emit('view:orientation', { portrait: pt });
  }
  window.addEventListener('resize', syncBody);
  syncBody();

  const director = {
    yaw: BASE_YAW,
    get mode() { return mode; },
    get shotActive() { return !!shot; },
    /** Smoothed portrait factor 0 (landscape) .. 1 (tall phone), see the header. */
    get portrait() { return pS; },
    get isPortrait() { return cam.aspect < 1; },
    get aspect() { return cam.aspect; },
    /** Portrait framing for every shot with this name that doesn't pass its own `portrait` ({ keep, lift } or false). */
    setShotPortrait(name, opts) { shotPortrait[name] = opts; },
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
    /** Name of the running shot ('' if unnamed or none). */
    get shotName() { return shot ? shot.name || '' : ''; },
    /** Ends the running shot (optionally only if it has this name) with its normal blend-out, even if not skippable. */
    release(name) { if (shot && (name == null || shot.name === name)) shot.duration = Math.min(shot.duration, shot.t + shot.blendOut); },
    skip() { if (shot && shot.skippable && !shot.skipping) { shot.skipping = true; shot.skipT = shot.t; } },
    update(dt) {
      const k = 1 - Math.exp(-dt * 2.5);
      const pRaw = portraitOf(cam.aspect);
      pS += (pRaw - pS) * (1 - Math.exp(-dt * 3));
      if (Math.abs(pRaw - pS) < 1e-3) pS = pRaw;
      const p = pS;
      const m = goal(MODES[mode], mode, p);
      const P = PORTRAIT[mode] || PORTRAIT.follow;
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
      baseTarget.set(target.x, target.y + (mode === 'close' ? 0.25 : mode === 'attract' ? m.lookUp : 0.15), target.z);
      lifted(basePos, baseTarget, P.lift * p, cur.fov, baseLook);
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
      // portrait: pull the shot pose back along its view line to keep part of the 16:9 framing, then lift it
      shotPos.copy(shotOut.pos); shotLook.copy(shotOut.target);
      const sp0 = shot && (shot.portrait !== undefined ? shot.portrait : shotPortrait[shot.name || '']);
      if (p > 0 && w > 0 && sp0 !== false) {
        const keep = sp0?.keep ?? 0.62, lift = sp0?.lift ?? 0;
        const have = Math.tan(THREE.MathUtils.degToRad(cur.fov / 2)) * cam.aspect;
        const pull = 1 + (Math.min(2.2, Math.max(1, (SHOT_REF * keep) / have)) - 1) * p;
        shotPos.sub(shotOut.target).multiplyScalar(pull).add(shotOut.target);
        lifted(shotPos, shotOut.target, lift * p, cur.fov, shotLook);
      }
      cam.position.copy(basePos).lerp(shotPos, w);
      look.copy(baseLook).lerp(shotLook, w);
      cam.lookAt(look);
      if (Math.abs(cam.fov - cur.fov) > 0.01) { cam.fov = cur.fov; cam.updateProjectionMatrix(); }
      director.yaw = cur.yaw;
      // shadow box / snow centre: the subject (nudged ahead in portrait, where more ground shows above the player)
      const ah = (P.ahead || 0) * p * (1 - w);
      engine.focus.copy(baseTarget).lerp(shotOut.target, w);
      if (ah > 0) engine.focus.add(tmp.set(-Math.sin(cur.yaw) * ah, 0, -Math.cos(cur.yaw) * ah));
      // tilt-shift band follows the subject (= the look point unless a portrait lift tilted the view)
      fpt.copy(baseTarget).lerp(shotOut.target, w);
      tmp.copy(fpt).project(cam);
      engine.post.focus += ((tmp.y + 1) / 2 - engine.post.focus) * (1 - Math.exp(-dt * 6));
      engine.post.strength = tilt * (1 - 0.42 * p); // the blur radius scales with screen height: tall screens need less
      // per-shot look override (engine.shotPost): fades with the shot weight, back to neutral when no shot runs
      const sp = engine.shotPost, o = shot && shot.post;
      if (p > 0) {
        // portrait: always active (w = 1) with the shot's override pre-blended, so the band can widen without a shot
        const ow = o ? w : 0;
        const bb = 0.11 + 0.05 * p, bf = 0.36 + 0.1 * p;
        sp.w = 1;
        sp.bloom = 1 + ((o?.bloom ?? 1) - 1) * ow;
        sp.glow = 1 + ((o?.glow ?? 1) - 1) * ow;
        sp.threshold = (o?.threshold ?? 0) * ow;
        sp.band = bb + ((o?.band ?? 0.11) * (1 + 0.25 * p) - bb) * ow;
        sp.falloff = bf + ((o?.falloff ?? 0.36) - bf) * ow;
      } else {
        sp.w = o ? w : 0;
        if (o) { sp.bloom = o.bloom ?? 1; sp.glow = o.glow ?? 1; sp.threshold = o.threshold ?? 0; sp.band = o.band ?? 0.11; sp.falloff = o.falloff ?? 0.36; }
      }
    },
  };
  return director;
}

const smooth = (x) => x * x * (3 - 2 * x);
