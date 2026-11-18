import * as THREE from 'three';

/**
 * Camera director. Base modes follow the player; shots (cinematics) blend over the top.
 *  - setMode('follow' | 'high' | 'close' | 'attract')   follow = default mid view, high = bird's-eye diorama,
 *    close = low angle behind the action, attract = slow orbit over the city (entry screen)
 *  - toggleView()  cycles the player's view follow → eye → high → follow (UI button / C key), saved in localStorage
 *  - view          the player's chosen gameplay view: 'follow' | 'eye' | 'high' (nextView = what the button switches to)
 *  - setView(v, persist = false)  set the player's view (test hook ?view=, settings)
 *    setMode('follow' | 'high' | 'eye') from game code means "back to the gameplay camera": it resolves to the
 *    player's chosen view, so code that resets to 'follow' after a mini-game / cutscene no longer drops it.
 *
 * EYE VIEW (first person at the doll's eye height, see EYE below): drag / swipe on empty screen looks around (yaw,
 *  pitch ±35°), joystick up = forward, joystick x = turn; keys W/S forward/back, A/D strafe, ←/→ turn; tap-to-walk
 *  still raycasts through the live camera and the view turns gently towards the walk. It is suspended automatically
 *  (blends back to the follow camera) while any playShot runs, outside the 'play' phase (mini-games, finale), and
 *  while the player is not controllable (cable car ride, panels, scripted walks), and returns afterwards facing the
 *  character's heading. The player's doll is hidden while the camera sits in its head.
 *  - playShot({ duration, update(t01, out, ctx), blendIn = 0.7, blendOut = 0.7, skippable = true, tilt = 1 }) → Promise
 *      update() writes out.pos (Vector3) and out.target (Vector3); t01 runs 0 → 1 over duration.
 *      Optional post: { bloom, glow, threshold, band, falloff } = look override for close shots, blended in and out
 *      with the shot (bloom / glow multiply the time-of-day look, threshold is added, band / falloff set the sharp
 *      tilt-shift band in screen heights; see engine.shotPost). The blur amount itself is `tilt`.
 *      Optional portrait: false | { keep, lift } = how the shot adapts to a tall (portrait) screen, see below.
 *      Optional lens: { w, fov, near } (the shot may mutate it every frame) = the lens (vertical FOV, near clip) the camera lerps
 *      towards by w × the shot's blend weight; omitted / w = 0 → the normal lens. Used by the cable car ride's cabin view.
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
export function createCameraDirector(engine, game, input = null) {
  const cam = engine.camera;
  const NEAR = cam.near;
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
  // eye view: camera at the doll's eye height (buildCharacter eyes at y 0.268 × DOLL_K 0.9 × player SCALE 1.15)
  const EYE = {
    y: 0.28, fov: 58, fovPortrait: 26, // vertical FOV: + fovPortrait at cam.portrait = 1 (keeps ~45° across a tall phone)
    near: 0.02, pitchMax: THREE.MathUtils.degToRad(35), pitch0: THREE.MathUtils.degToRad(-2),
    turnRate: 2.0, // rad/s at full joystick / arrow deflection
    lookX: 2.0, lookY: 1.5, // rad per drag of the screen's short side
    bob: 0.006, // head-bob height (world units; the doll is ~0.43 tall)
    blend: 1.9, // eye ↔ third-person blend speed (1 / s)
  };
  const USER_VIEWS = ['follow', 'eye', 'high'];
  const STORE = 'tinselby.cam';
  let pref = 'follow';
  try { const v = localStorage.getItem(STORE); if (USER_VIEWS.includes(v)) pref = v; } catch (e) { /* private mode */ }
  let eyeW = 0, eyeOn = false, susT = 0, eyeYaw = 0, eyeYawGoal = 0, eyePitch = EYE.pitch0, eyePitchGoal = EYE.pitch0, bobPh = 0, bobK = 0;
  let dollHidden = false;
  const eyePos = new THREE.Vector3(), eyeLook = new THREE.Vector3();
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
    /** Base mode; while the gameplay camera is up this is the player's view ('follow' | 'eye' | 'high'). */
    get mode() { return mode === 'follow' ? pref : mode; },
    /** The player's chosen gameplay view and the one the camera button switches to next. */
    get view() { return pref; },
    get nextView() { return USER_VIEWS[(USER_VIEWS.indexOf(pref) + 1) % USER_VIEWS.length]; },
    /** 0..1: how far the camera currently sits in the character's eyes (1 = full first person). */
    get eye() { return eyeW; },
    setView(v, persist = false) {
      if (!USER_VIEWS.includes(v)) return;
      pref = v; mode = 'follow'; closeYaw = null;
      if (persist) { try { localStorage.setItem(STORE, v); } catch (e) { /* ignore */ } }
    },
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
    setMode(m, opts = {}) { mode = USER_VIEWS.includes(m) ? 'follow' : m; closeYaw = opts.yaw ?? null; },
    /** Camera button / C key: follow → eye → high → follow (the choice survives reloads). */
    toggleView() { director.setView(director.nextView, true); game.emit('camera:mode', { mode: pref }); },
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
      // the player's view: eye view needs live control (no shot, play phase, controllable); high waits out mini-games
      const phase = game.state.phase;
      let view = mode;
      if (mode === 'follow') {
        view = pref;
        if (view === 'high' && phase === 'minigame') view = 'follow';
        if (view === 'eye') {
          const sus = !!shot || phase !== 'play' || !subject || subject.controllable === false || (input && input.enabled === false);
          susT = sus ? susT + dt : 0;
          // shots and phase changes leave at once (the shot blends in over the same time); short control blips are ignored
          if (shot || phase !== 'play' || susT > 0.2) view = 'follow';
        }
      }
      const wantEye = view === 'eye';
      if (wantEye && !eyeOn && subject) {
        // (re)entering: look where the character faces, level
        eyeYaw = eyeYawGoal = (subject.heading ?? 0) + Math.PI;
        eyePitch = eyePitchGoal = EYE.pitch0;
        if (input) input.consumeLook?.();
      }
      eyeOn = wantEye;
      eyeW += ((wantEye ? 1 : 0) - eyeW) * (1 - Math.exp(-dt * EYE.blend * 2.2));
      if (Math.abs(eyeW - (wantEye ? 1 : 0)) < 0.002) eyeW = wantEye ? 1 : 0;
      const e = smooth(eyeW);
      if (input) input.eyeView = wantEye && eyeW > 0.5;
      const tpMode = view === 'eye' ? 'follow' : view; // third-person pose under / around the eye view
      const m = goal(MODES[tpMode], tpMode, p);
      const P = PORTRAIT[tpMode] || PORTRAIT.follow;
      cur.dist += (m.dist - cur.dist) * k;
      cur.pitch += (m.pitch - cur.pitch) * k;
      cur.fov += (m.fov - cur.fov) * k;
      cur.tilt += (m.tilt - cur.tilt) * k;
      const yawGoal = tpMode === 'close' && closeYaw != null ? closeYaw : mode === 'attract' ? BASE_YAW + attractT * 0.12 : BASE_YAW;
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
      // ---- eye view: look input, gentle turning, head-bob; blended over the third-person pose by e
      if (eyeW > 0 && subject) {
        if (wantEye && input) {
          const L = input.consumeLook?.() || { x: 0, y: 0 };
          eyeYawGoal -= L.x * EYE.lookX;
          eyePitchGoal = Math.max(-EYE.pitchMax, Math.min(EYE.pitchMax, eyePitchGoal - L.y * EYE.lookY));
          eyeYawGoal -= (input.getTurn?.() || 0) * EYE.turnRate * dt;
          // tap-to-walk: the view turns gently towards the way the character walks
          const v = subject.vel;
          if (input.tapTarget && !input.looking && v && Math.hypot(v.x, v.y) > 0.25) {
            let d = Math.atan2(-v.x, -v.y) - eyeYawGoal; d = Math.atan2(Math.sin(d), Math.cos(d));
            eyeYawGoal += d * (1 - Math.exp(-dt * 2.2));
          }
        }
        const kt = 1 - Math.exp(-dt * 12); // damped turning: no snapping, no overshoot
        let dy = eyeYawGoal - eyeYaw; eyeYaw += dy * kt;
        eyePitch += (eyePitchGoal - eyePitch) * kt;
        // the character faces where its eyes look (remote players and the follow view after leaving see the same)
        if (wantEye && eyeW > 0.5 && subject.controllable) subject.heading = eyeYaw - Math.PI;
        const spd = subject.speed ?? 0, walking = spd > 0.2;
        bobK += ((walking ? Math.min(1, spd / 1.9) : 0) - bobK) * (1 - Math.exp(-dt * 6));
        bobPh += dt * (6 + spd * 2.4); // same step rhythm as the doll's walk cycle
        const bob = Math.abs(Math.sin(bobPh)) * EYE.bob * bobK;
        const cp = Math.cos(eyePitch);
        eyePos.set(subject.pos.x, subject.pos.y + EYE.y + bob, subject.pos.z);
        eyeLook.set(eyePos.x - Math.sin(eyeYaw) * cp * 4, eyePos.y + Math.sin(eyePitch) * 4, eyePos.z - Math.cos(eyeYaw) * cp * 4);
        basePos.lerp(eyePos, e);
        baseLook.lerp(eyeLook, e);
      }
      // the doll hides while the camera is inside its head
      const hide = eyeW > 0.8;
      if (hide !== dollHidden && subject?.setDollVisible) { dollHidden = hide; subject.setDollVisible(!hide); }
      let w = 0, tilt = cur.tilt * (1 - e);
      if (shot) {
        shot.t += dt;
        const d = shot.duration;
        const u = Math.min(1, shot.t / d);
        shot.update(u, shotOut, { dt, t: shot.t });
        w = smooth(Math.min(1, shot.t / shot.blendIn));
        if (shot.skipping) w *= 1 - smooth(Math.min(1, (shot.t - shot.skipT) / 0.4));
        else if (d - shot.t < shot.blendOut) w *= smooth(Math.max(0, (d - shot.t) / shot.blendOut));
        tilt = cur.tilt * (1 - e) + (shot.tilt - cur.tilt * (1 - e)) * w;
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
      const eyeFov = EYE.fov + EYE.fovPortrait * p;
      let fov = cur.fov + (eyeFov - cur.fov) * e * (1 - w);
      let near = NEAR + (EYE.near - NEAR) * e * (1 - w);
      // shot lens hook: shot.lens = { w, fov, near } (mutated by the shot each frame) lerps the lens towards fov / near by
      // lens.w × the shot's blend weight; shots without a lens (or fields) leave the normal lens untouched
      const ln = shot && shot.lens;
      if (ln && w > 0) {
        const lw = Math.min(1, Math.max(0, ln.w ?? 0)) * w;
        if (ln.fov != null) fov += (ln.fov - fov) * lw;
        if (ln.near != null) near += (ln.near - near) * lw;
      }
      if (Math.abs(cam.fov - fov) > 0.01 || Math.abs(cam.near - near) > 1e-4) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
      director.yaw = eyeW > 0.5 && wantEye ? eyeYaw : cur.yaw;
      // shadow box / snow centre: the subject (nudged ahead in portrait, where more ground shows above the player)
      const ah = (P.ahead || 0) * p * (1 - w);
      engine.focus.copy(baseTarget);
      if (e > 0) engine.focus.lerp(tmp.set(eyePos.x - Math.sin(eyeYaw) * 4, eyePos.y - EYE.y, eyePos.z - Math.cos(eyeYaw) * 4), e); // shadows + snow ahead of the eyes
      engine.focus.lerp(shotOut.target, w);
      if (ah > 0) engine.focus.add(tmp.set(-Math.sin(cur.yaw) * ah, 0, -Math.cos(cur.yaw) * ah));
      // tilt-shift band follows the subject (= the look point unless a portrait lift tilted the view)
      fpt.copy(baseTarget).lerp(eyeLook, e * (1 - w)).lerp(shotOut.target, w);
      tmp.copy(fpt).project(cam);
      if (Number.isFinite(tmp.y)) engine.post.focus += ((Math.max(-1, Math.min(1, tmp.y)) + 1) / 2 - engine.post.focus) * (1 - Math.exp(-dt * 6));
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
      // eye view: no tilt-shift (wide sharp band; the blur strength is already faded by e above) and a calmer bloom,
      // since lamps and lit windows fill much more of the screen at eye level
      const ee = e * (1 - w);
      if (ee > 0) {
        const ow = sp.w;
        const band = 0.11 + (sp.band - 0.11) * ow, fall = 0.36 + (sp.falloff - 0.36) * ow;
        const bloom = 1 + (sp.bloom - 1) * ow, glow = 1 + (sp.glow - 1) * ow, thr = sp.threshold * ow;
        sp.w = 1;
        sp.band = band + (0.9 - band) * ee;
        sp.falloff = fall + (0.6 - fall) * ee;
        sp.bloom = bloom + (0.8 - bloom) * ee;
        sp.glow = glow + (0.9 - glow) * ee;
        sp.threshold = thr + (0.08 - thr) * ee;
      }
    },
  };
  return director;
}

const smooth = (x) => x * x * (3 - 2 * x);
