// Shared pieces of the seated vehicle rides (tram + horse carriage): seat the player's doll on a moving vehicle, a short
// hop on / off, the ride camera (one long playShot: glide in through a window to the rider's eyes, eye level with
// drag-to-look and a gentle sway, or an outside chase view), and the small DOM layer (status pill, View, Hop off).
// Modelled on the cable car ride in src/city/cablecar.js. Used by src/rides/tram.js and src/rides/carriage.js.
import * as THREE from 'three';
import { SEAT_DROP } from '../core/player.js';
import { ICONS } from '../ui/icons.js';
import './rides.css';

export const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const bez = (out, p0, p1, p2, s) => { const k = 1 - s; return out.set(k * k * p0.x + 2 * k * s * p1.x + s * s * p2.x, k * k * p0.y + 2 * k * s * p1.y + s * s * p2.y, k * k * p0.z + 2 * k * s * p1.z + s * s * p2.z); };

/**
 * Seat + camera + controls for one ride. spec:
 *  { id, shot (camera shot name), mesh() → the vehicle Object3D (faces +z), seat {x, y, z} (vehicle-local, y = cushion
 *    top), dollMul (doll size × while seated, default 1), eye { yaw0, pitch0, yawMin, yawMax, fov, fovPortrait, dx, dz }
 *    (yaw 0 = vehicle forward, −π/2 = out of the local −x side), approach [x, y, z] + entry [x, y, z] (vehicle-local
 *    points the boarding glide passes: outside, then the window / opening), chase [{ pos [x, y, z], look [x, y, z] }, …]
 *    (vehicle-local candidates for the outside view, best first: the first one with a clear line of sight is used, else
 *    the least blocked one),
 *    chaseFov / chaseFovPortrait (lens of the outside view), chaseSpan (half length checked along local z, default 0.5), sway(T, out) (adds a small eye offset: out.x (local side),
 *    out.y), icon }
 */
export function createSeat(ctx, spec) {
  const { player, engine, cam } = ctx;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const seatW = new THREE.Vector3(), eyeW = new THREE.Vector3(), headW = new THREE.Vector3(), gaze = new THREE.Vector3();
  const sway = { x: 0, y: 0 };
  const st = {
    seated: false, baseScale: 1.15,
    yaw: 0, pitch: 0, cyaw: 0, cpitch: 0, // eye look offsets (smoothed) / chase orbit offsets
    yawGoal: 0, pitchGoal: 0, cyawGoal: 0, cpitchGoal: 0, idle: 0,
    view: 0, viewGoal: 0, // 0 = eye level, 1 = outside chase
    T: 0, boardT: -1, // ride clock; boarding glide clock (−1 = none)
    shotOn: false,
  };
  const dollK = () => { const ch = player.character; return (ch?.group?.scale.x || 1.15) * (ch?.yaw?.scale.x || 0.9); };
  const local = (out, x, y, z) => { const m = spec.mesh(); m.updateWorldMatrix(true, false); return m.localToWorld(out.set(x, y, z)); };
  const localDir = (out, x, y, z) => { const m = spec.mesh(); return out.set(x, y, z).transformDirection(m.matrixWorld); };
  /** The seated doll's root in world space. */
  function seatPos(out) { const s = spec.seat; return local(out, s.x, s.y - SEAT_DROP * dollK(), s.z); }
  function eyePos(out, withSway) {
    const s = spec.seat, k = dollK(), e = spec.eye;
    sway.x = 0; sway.y = 0;
    if (withSway && spec.sway) spec.sway(st.T, sway);
    return local(out, s.x + (e.dx || 0) + sway.x, s.y - SEAT_DROP * k + 0.268 * k + sway.y, s.z + (e.dz || 0.02));
  }
  function headPos(out) { const s = spec.seat, k = dollK(); return local(out, s.x, s.y - SEAT_DROP * k + 0.265 * k, s.z); }
  function gazeDir(out) {
    const e = spec.eye, y = e.yaw0 + st.yaw + Math.sin(st.T * 0.5) * 0.02, p = e.pitch0 + st.pitch + Math.sin(st.T * 0.7) * 0.01;
    return localDir(out, Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).normalize();
  }

  // ---------------------------------------------------------------- seat the doll
  function sit() {
    const ch = player.character;
    if (!st.seated) { st.baseScale = ch?.group?.scale.x || 1.15; if (ch && spec.dollMul) ch.group.scale.setScalar(st.baseScale * spec.dollMul); }
    st.seated = true;
    if (ch) ch.seated = true;
  }
  /** Put the doll on the seat (call every frame after the vehicle moved). */
  function place() {
    const m = spec.mesh();
    seatPos(seatW);
    setPlayer(seatW, m.rotation.y);
  }
  function setPlayer(p, heading) {
    player.pos.copy(p);
    player.vel.set(0, 0);
    player.heading = heading;
    player.object.position.copy(p);
    const ch = player.character;
    if (ch) ch.yaw.rotation.y = heading;
  }
  function unsit() {
    const ch = player.character;
    if (ch) { ch.seated = false; ch.yaw.visible = true; if (spec.dollMul) ch.group.scale.setScalar(st.baseScale); }
    st.seated = false;
  }

  // ---------------------------------------------------------------- hop tween (arc between two moving points)
  /** from / to: () => Vector3 (re-read every frame, the vehicle may move); returns a stepper (dt) → done. */
  function hop(from, to, dur, h = 0.14, headingFn = null) {
    let t = 0;
    return (dt) => {
      t += dt;
      const u = Math.min(1, t / dur), e = ss(u);
      _a.copy(from()).lerp(to(), e);
      _a.y += Math.sin(Math.PI * u) * h;
      setPlayer(_a, headingFn ? headingFn() : player.heading);
      return u >= 1;
    };
  }

  // ---------------------------------------------------------------- the ride camera
  const HIDE = 0.3; // the doll hides while the camera is this close to its head
  const c0 = new THREE.Vector3(), l0 = new THREE.Vector3();
  const post = { band: 0.3, falloff: 0.5 };
  const lens = { w: 0, fov: 56, near: 0.02 };
  const chaseFov = () => (spec.chaseFov || 40) + (spec.chaseFovPortrait ?? 30) * (cam?.portrait || 0);
  /** Pull outside poses back on narrow screens so the vehicle keeps its width in frame (for the outside lens). */
  const pull = () => {
    const c = engine.camera, half = Math.tan(THREE.MathUtils.degToRad(chaseFov() / 2)) * c.aspect;
    return Math.min(2.2, Math.max(1, 0.62 / (half * 2.0)));
  };
  // outside view: candidates checked for a clear line of sight now and then (stalls, trees, houses), blended smoothly
  const chase = { pos: [...spec.chase[0].pos], look: [...spec.chase[0].look] };
  let pick = 0, pickT = 0;
  const ray = new THREE.Raycaster();
  const ignoreHit = (o) => {
    if (o.isPoints || o.isLine || o.isSprite || !o.visible) return true;
    const m = spec.mesh();
    for (let p = o; p; p = p.parent) { if (p === player.object || p === m || p.name === 'net-remotes') return true; if (!p.visible) return true; }
    return false;
  };
  /** Is the segment from vehicle-local point (x, y, z) to the camera spot cam clear of scenery? */
  function clearTo(cam, x, y, z) {
    local(_c, x, y, z);
    _d.copy(cam).sub(_c);
    const len = _d.length();
    ray.set(_c, _d.normalize());
    ray.near = 0.3; ray.far = len + 0.15;
    try { return !ray.intersectObjects(engine.scene.children, true).some((h) => !ignoreHit(h.object)); } catch (e) { return true; }
  }
  /** Nothing right beside the camera spot (a lamp or a tree at the edge of the frame): a short level ray to its side. */
  const _e = new THREE.Vector3(), _f = new THREE.Vector3();
  function sideClear(cam, target, sgn) {
    _f.copy(target).sub(cam); _f.y = 0;
    if (_f.lengthSq() < 1e-6) return true;
    _f.normalize();
    ray.set(cam, _e.set(-_f.z * sgn, 0, _f.x * sgn));
    ray.near = 0; ray.far = 0.5;
    try { return !ray.intersectObjects(engine.scene.children, true).some((h) => !ignoreHit(h.object)); } catch (e) { return true; }
  }
  // A candidate must see the look point, both ends of the vehicle at window height and the upper middle (a tree or a
  // candy cane beside the line of sight still fills half the frame otherwise), with nothing right beside the camera.
  // Raycasts against the whole town cost a few ms each, so the checks are spread out: one ray every other frame, cycling
  // through the candidates (a full cycle of 5 candidates × 7 rays takes ~1.2 s at 60 fps).
  const span = spec.chaseSpan ?? 0.5;
  // [dy, dz] from the look point; [null, ±1] = the side rays
  const RAYS = [[0, 0], [0.12, span], [0.12, -span], [0.28, span * 0.5], [0.28, -span * 0.5], [null, 1], [null, -1]];
  // blocked[i] = how many of candidate i's rays hit something in its last check (0 = clear)
  const scan = { i: 0, r: 0, hits: 0, skip: 0, blocked: spec.chase.map(() => 0) };
  function scanStep() {
    if ((scan.skip ^= 1)) return;
    const c = spec.chase[scan.i], L = c.look;
    chasePose(_b, _c, c);
    const cp = _a.copy(_b);
    const o = RAYS[scan.r];
    if (o[0] === null ? !sideClear(cp, _c, o[1]) : !clearTo(cp, L[0], L[1] + o[0], L[2] + o[1])) scan.hits++;
    if (++scan.r >= RAYS.length) {
      scan.blocked[scan.i] = scan.hits;
      scan.i = (scan.i + 1) % spec.chase.length; scan.r = 0; scan.hits = 0;
    }
  }
  /** The first clear candidate; if none is, the least blocked one (earlier wins ties). */
  function choose() {
    let best = 0;
    for (let i = 0; i < spec.chase.length; i++) {
      if (scan.blocked[i] === 0) return i;
      if (scan.blocked[i] < scan.blocked[best]) best = i;
    }
    return best;
  }
  function chasePose(outPos, outTarget, c = chase) {
    const ch = c, m = spec.mesh();
    const cy = st.cyaw, cp = st.cpitch, pf = pull();
    // orbit the chase offset about the vehicle's vertical axis through the look point, then lift by the pitch offset
    const ox = ch.pos[0] - ch.look[0], oz = ch.pos[2] - ch.look[2];
    const rx = ox * Math.cos(cy) + oz * Math.sin(cy), rz = -ox * Math.sin(cy) + oz * Math.cos(cy);
    const r = Math.hypot(rx, rz), yUp = ch.pos[1] - ch.look[1];
    const el = Math.max(0.05, Math.min(1.2, Math.atan2(yUp, r) + cp)), L = Math.hypot(r, yUp) * pf;
    const hk = Math.cos(el) * L / (r || 1);
    local(outTarget, ch.look[0], ch.look[1], ch.look[2]);
    local(outPos, ch.look[0] + rx * hk, ch.look[1] + Math.sin(el) * L, ch.look[2] + rz * hk);
    // keep above the snow / ground
    const gy = (ctx.colliders?.heightAt?.(outPos.x, outPos.z) || 0) + 0.25;
    if (outPos.y < gy) outPos.y = gy;
    return m;
  }
  function shotUpdate(_u, out, info) {
    const dt = Math.min(0.1, info?.dt || 1 / 60);
    const ch = player.character;
    // smooth the look + view
    const kt = 1 - Math.exp(-dt * 10);
    st.yaw += (st.yawGoal - st.yaw) * kt; st.pitch += (st.pitchGoal - st.pitch) * kt;
    st.cyaw += (st.cyawGoal - st.cyaw) * kt; st.cpitch += (st.cpitchGoal - st.cpitch) * kt;
    st.view += (st.viewGoal - st.view) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(st.view - st.viewGoal) < 1e-3) st.view = st.viewGoal;
    eyePos(eyeW, true);
    headPos(headW);
    gazeDir(gaze);
    let eyeK = 1;
    // outside view: re-check the line of sight every 0.7 s, glide to the chosen spot
    if (st.viewGoal > 0.5 || st.view > 0.02) {
      scanStep();
      if ((pickT -= dt) <= 0) { pickT = 0.25; pick = choose(); }
      const c = spec.chase[pick], kc = 1 - Math.exp(-dt * 2.2);
      for (let i = 0; i < 3; i++) { chase.pos[i] += (c.pos[i] - chase.pos[i]) * kc; chase.look[i] += (c.look[i] - chase.look[i]) * kc; }
    } else { pickT = 0; scan.blocked.fill(0); scan.i = 0; scan.r = 0; scan.hits = 0; }
    if (st.boardT >= 0 && st.boardT < BOARD) {
      // current camera → outside the window → through it → the rider's eyes
      const T = st.boardT / BOARD, ap = spec.approach, en = spec.entry;
      local(_b, ap[0], ap[1], ap[2]);
      if (pull() > 1) _b.sub(headW).multiplyScalar(pull()).add(headW);
      local(_c, en[0], en[1], en[2]);
      const s1 = T < 0.45 ? ss(T / 0.45) : 1, s2 = ss((T - 0.45) / 0.55);
      if (s2 <= 0) out.pos.copy(c0).lerp(_b, s1);
      else bez(out.pos, _b, _c, eyeW, s2);
      _d.copy(headW).sub(out.pos);
      if (_d.lengthSq() < 1e-4) _d.copy(gaze);
      _d.normalize();
      if (s2 <= 0) _a.copy(l0).lerp(_d, ss(s1 / 0.8));
      else _a.copy(_d).lerp(gaze, ss((s2 - 0.1) / 0.6));
      out.target.copy(out.pos).addScaledVector(_a.normalize(), 3);
      eyeK = s2;
    } else {
      out.pos.copy(eyeW);
      out.target.copy(eyeW).addScaledVector(gaze, 4);
      if (st.view > 0) {
        chasePose(_b, _c);
        const v = ss(st.view);
        // eye → chase: back out through the entry opening so the move never cuts through the roof
        if (v < 1) { local(_d, spec.entry[0], spec.entry[1] + 0.05, spec.entry[2]); bez(out.pos, eyeW, _d, _b, v); }
        else out.pos.copy(_b);
        _a.copy(out.target).lerp(_c, ss(st.view * 1.4));
        out.target.copy(_a);
        eyeK = 1 - v;
      }
    }
    if (!Number.isFinite(out.pos.x + out.pos.y + out.pos.z + out.target.x + out.target.y + out.target.z)) { out.pos.copy(eyeW); out.target.copy(eyeW).addScaledVector(gaze, 4); }
    if (ch) ch.yaw.visible = out.pos.distanceTo(headW) > HIDE;
    post.band = 0.3 + 0.75 * eyeK; // no tilt-shift blur at eye level
    post.falloff = 0.5 + 0.2 * eyeK;
    const eyeFov = spec.eye.fov + spec.eye.fovPortrait * (cam?.portrait || 0);
    const boarding = st.boardT >= 0 && st.boardT < BOARD;
    lens.w = boarding ? eyeK : 1; // seated: always the ride's lens (eye level wide, outside a little wider than usual)
    lens.fov = chaseFov() + (eyeFov - chaseFov()) * eyeK;
  }
  const BOARD = spec.boardTime || 1.5;
  function startShot(board) {
    c0.copy(engine.camera.position);
    engine.camera.getWorldDirection(l0);
    st.boardT = board ? 0 : -1;
    st.shotOn = true;
    cam.playShot({ name: spec.shot, duration: 1e6, blendIn: board ? 0.05 : 0.7, blendOut: 0.9, skippable: false, tilt: 0.7, portrait: false, post, lens, update: shotUpdate });
  }
  /** Every frame while riding: keep the clocks running, re-take the camera if another shot replaced ours. */
  function tick(dt) {
    st.T += dt;
    if (st.boardT >= 0) st.boardT += dt;
    st.idle += dt;
    if (keys.size) {
      const k = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
      const kp = (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
      if (k || kp) look(k * dt * 1.4, kp * dt * 0.9);
    }
    // after a while without looking around, drift back to the window view
    if (st.idle > 6 && st.view < 0.5) { st.yawGoal *= 1 - Math.min(1, dt * 0.35); st.pitchGoal *= 1 - Math.min(1, dt * 0.35); }
    if (st.shotOn && cam.shotName !== spec.shot && !cam.shotActive) startShot(false);
  }
  function endShot() {
    if (!st.shotOn) return;
    st.shotOn = false;
    if (cam.shotName === spec.shot) cam.release(spec.shot);
  }
  function look(dx, dy) {
    st.idle = 0;
    if (st.view < 0.5) {
      const e = spec.eye;
      st.yawGoal = Math.max(e.yawMin, Math.min(e.yawMax, st.yawGoal - dx)); // drag / key right = look right (yaw + = left)
      st.pitchGoal = Math.max(-0.45 - e.pitch0, Math.min(0.4 - e.pitch0, st.pitchGoal + dy));
    } else {
      st.cyawGoal += dx;
      st.cpitchGoal = Math.max(-0.5, Math.min(0.6, st.cpitchGoal - dy));
    }
  }

  // ---------------------------------------------------------------- drag / swipe + keys to look around
  const canvas = engine.renderer.domElement;
  const drags = new Map();
  const keys = new Set();
  const onDown = (e) => { if (e.button > 0) return; drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } };
  const onMove = (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    const s = Math.max(1, Math.min(window.innerWidth, window.innerHeight));
    look(((e.clientX - d.x) / s) * 2.2, -((e.clientY - d.y) / s) * 1.6);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onUp = (e) => drags.delete(e.pointerId);
  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown' && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) keys.add(k);
    else keys.delete(k);
  };
  function attachLook() {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
  }
  function detachLook() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    drags.clear(); keys.clear();
  }
  function resetLook() {
    st.yaw = st.yawGoal = st.pitch = st.pitchGoal = 0;
    st.cyaw = st.cyawGoal = st.cpitch = st.cpitchGoal = 0;
    st.view = st.viewGoal = 0; st.T = 0; st.idle = 0;
  }

  return { st, sit, place, unsit, setPlayer, hop, seatPos, local, startShot, endShot, tick, attachLook, detachLook, resetLook, dollK,
    get boarding() { return st.boardT >= 0 && st.boardT < BOARD; } };
}

/**
 * The ride's DOM layer: status pill (top), "View" toggle (bottom-left), big "Hop off" (bottom-right).
 * opts { icon, onOff, onView } → { el, status(text), offLabel(text, pending), view(outside), showButtons(on), showView(on),
 *   hint(text, ms), destroy() }
 */
export function createRideLayer(ctx, opts) {
  const el = document.createElement('div');
  el.className = 'rd-seat';
  el.innerHTML = `
    <div class="rd-seat-top"><div class="rd-seat-status"><span class="rd-seat-ico">${ICONS[opts.icon] || ICONS.hand}</span><span class="rd-seat-txt"></span></div>
    <div class="rd-seat-hint" hidden></div></div>
    <button class="knit-btn cream rd-seat-view" aria-label="Switch view"><span class="rd-seat-bico">${ICONS.camera}</span><span class="rd-seat-vlab">Outside</span></button>
    <button class="knit-btn green rd-seat-off"><span class="rd-seat-bico">${ICONS.back}</span><span class="rd-seat-olab">Hop off</span></button>`;
  const txt = el.querySelector('.rd-seat-txt'), hintEl = el.querySelector('.rd-seat-hint');
  const viewBtn = el.querySelector('.rd-seat-view'), vlab = el.querySelector('.rd-seat-vlab'), vico = viewBtn.querySelector('.rd-seat-bico');
  const offBtn = el.querySelector('.rd-seat-off'), olab = el.querySelector('.rd-seat-olab');
  const stop = (e) => { e.stopPropagation(); };
  for (const b of [viewBtn, offBtn]) { b.addEventListener('pointerdown', stop); }
  offBtn.addEventListener('click', (e) => { e.stopPropagation(); ctx.audio?.sfx?.('ui'); opts.onOff?.(); });
  viewBtn.addEventListener('click', (e) => { e.stopPropagation(); ctx.audio?.sfx?.('ui'); opts.onView?.(); });
  ctx.uiRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let lastS = null, lastO = null, hintT = null;
  return {
    el,
    status(s) { if (s !== lastS) { lastS = s; txt.textContent = s; } },
    offLabel(s, pending = false) { const k = s + pending; if (k !== lastO) { lastO = k; olab.textContent = s; offBtn.classList.toggle('pending', !!pending); } },
    view(outside) { vlab.textContent = outside ? 'Window' : 'Outside'; vico.innerHTML = outside ? ICONS.eye : ICONS.camera; },
    showButtons(on) { el.classList.toggle('rd-seat-nobtn', !on); },
    /** Show / hide just the View toggle (e.g. while waiting at a stop). */
    showView(on) { viewBtn.classList.toggle('rd-seat-hide', !on); },
    hint(s, ms = 3800) {
      clearTimeout(hintT);
      hintEl.textContent = s; hintEl.hidden = false; hintEl.classList.remove('out');
      hintT = setTimeout(() => { hintEl.classList.add('out'); hintT = setTimeout(() => { hintEl.hidden = true; }, 500); }, ms);
    },
    destroy() { clearTimeout(hintT); el.classList.remove('in'); el.classList.add('gone'); setTimeout(() => el.remove(), 260); },
  };
}
