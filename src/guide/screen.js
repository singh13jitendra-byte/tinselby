// Guide DOM layer: the edge arrow (target off-screen: a knitted badge pinned to the screen border, pointing at it, with
// a tiny "who / what · 24 m" label) and the bouncing "!" bubble over the target person (or a glowing pin + ring over a
// spot) when it is on screen. No marker ever covers a HUD piece (goal card, stat chips, round buttons, mini-map,
// joystick, action button, social corner, toasts, cards): their rects are read ~4×/s into a flat array; the "!" is pushed
// the shortest way out with a pointer still aiming at the target (or turns into the edge badge when that's too far), the
// badge and its label pick free spots. DOM only (0 draw calls); transforms are written only when they change.
import { ICONS } from '../ui/icons.js';

const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M4 21c0-4.6 3.6-7.6 8-7.6s8 3 8 7.6z" fill="currentColor"/></svg>';
/**
 * Elements no guide marker (edge badge + label, "!" bubble, pin) may cover; other modules can opt in with data-guide-avoid.
 * Round buttons are matched generically (HUD row, emote / friends / activities in the bottom-right corner, later ones).
 * Hidden elements measure 0×0 and drop out by themselves.
 */
const AVOID = [
  '.tb-hud:not([hidden]) .tb-goal', '.tb-hud:not([hidden]) .tb-stats > *', '.tb-hud:not([hidden]) .tb-tc', '.tb-hud:not([hidden]) .tb-tr',
  '.tb-act:not([hidden])', '.tb-joylayer:not([hidden]) .tb-joy', '.tb-keys:not([hidden])',
  '.knit-btn.round', '.tbs-corner .knit-btn', '.tbs-root .tbs-pill', '.tbs-root .tbs-extra > *',
  '.tbm-mini:not([hidden])', '.tb-minimap', '.tbm-root .tbm-btn', '[data-guide-avoid]',
  '.tb-toast', '.tb-cards > *', '.sn-cards > .tb-card:not(.out)', '.tbt-call:not([hidden])', '.tbt-help:not([hidden])',
].join(',');
const MAXR = 48;
const BADGE = 46; // badge diameter (px)
const EDGE = 37; // badge centre ↔ screen border: the arrowhead (11 px past the rim) stays on screen
const GAP = 6; // px: clear space kept between a marker and a HUD piece
/** "!" / pin footprint relative to its anchor (bottom centre) at scale 1: l, t, r, b — incl. the bob, glow ring and tail. */
const MARK_BOX = { person: [-24, -48, 24, 11], spot: [-28, -59, 28, 13] }; // pointer reaches 27 px from the bubble's centre
const MARK_MAXD = 150; // px: a marker pushed further than this off its target switches to the edge-badge form…
const MARK_BACK = 110; // …and comes back as a marker once the push needed is under this (hysteresis)

export function createScreen(ctx) {
  const { uiRoot } = ctx;
  const root = document.createElement('div');
  root.className = 'tbg-root';
  root.innerHTML = `
    <div class="tbg-mark" hidden><div class="tbg-bob"><div class="tbg-bang">!</div><span class="tbg-mrot"><i class="tbg-mtip"></i></span></div><div class="tbg-ring"></div></div>
    <div class="tbg-edge" hidden>
      <button class="tbg-badge" aria-label="Show the way"><span class="tbg-rot"><i class="tbg-tip"></i></span><span class="tbg-ico"></span></button>
      <div class="tbg-lab"><b class="tbg-who"></b><span class="tbg-dist"></span></div>
    </div>
    <div class="tbg-safe" aria-hidden="true"></div>`;
  uiRoot.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const mark = $('.tbg-mark'), bang = $('.tbg-bang'), mrot = $('.tbg-mrot');
  const edge = $('.tbg-edge'), badge = $('.tbg-badge'), rot = $('.tbg-rot'), ico = $('.tbg-ico'), who = $('.tbg-who'), distEl = $('.tbg-dist');
  const probe = $('.tbg-safe');

  // ---- obstacle rects (refreshed ~4×/s into a flat array: l, t, r, b)
  const rects = new Float32Array(MAXR * 4);
  let nRects = 0, rectT = 0, els = [], elsT = 0;
  const safe = { l: 0, t: 0, r: 0, b: 0 };
  function readSafe() {
    const cs = getComputedStyle(probe);
    safe.l = parseFloat(cs.paddingLeft) || 0; safe.t = parseFloat(cs.paddingTop) || 0;
    safe.r = parseFloat(cs.paddingRight) || 0; safe.b = parseFloat(cs.paddingBottom) || 0;
  }
  readSafe();
  window.addEventListener('resize', () => { readSafe(); rectT = 0; elsT = 0; });
  function refreshRects(dt, W, H) {
    elsT -= dt; rectT -= dt;
    if (elsT <= 0) { elsT = 0.5; els = uiRoot.querySelectorAll(AVOID); } // new buttons / toasts / cards are picked up within 0.5 s
    if (rectT > 0) return;
    rectT = 0.25;
    nRects = 0;
    for (let i = 0; i < els.length && nRects < MAXR; i++) {
      const r = els[i].getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.width * r.height > W * H * 0.5) continue; // hidden, or a full-screen overlay
      if (r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) continue;
      const o = nRects * 4; rects[o] = r.left; rects[o + 1] = r.top; rects[o + 2] = r.right; rects[o + 3] = r.bottom; nRects++;
    }
  }
  const PAD = Math.ceil(BADGE / 2 * 1.09) + GAP; // badge radius at the top of its pulse + gap
  function clear(x, y) {
    for (let i = 0; i < nRects; i++) {
      const o = i * 4;
      if (x > rects[o] - PAD && x < rects[o + 2] + PAD && y > rects[o + 1] - PAD && y < rects[o + 3] + PAD) return false;
    }
    return true;
  }
  /** Index of the first obstacle the box (l, t, r, b) comes within GAP of, or -1. */
  function hit(l, t, r, b) {
    for (let i = 0; i < nRects; i++) {
      const o = i * 4;
      if (r > rects[o] - GAP && l < rects[o + 2] + GAP && b > rects[o + 1] - GAP && t < rects[o + 3] + GAP) return i;
    }
    return -1;
  }

  // ---- perimeter of the safe rect (clockwise from top-left) → point
  let L = 0, T = 0, R = 0, B = 0, Wr = 0, Hr = 0, P = 0, px = 0, py = 0;
  function perim(s) {
    s = ((s % P) + P) % P;
    if (s < Wr) { px = L + s; py = T; return; }
    s -= Wr; if (s < Hr) { px = R; py = T + s; return; }
    s -= Hr; if (s < Wr) { px = R - s; py = B; return; }
    s -= Wr; px = L; py = B - s;
  }
  function sOf(x, y) {
    if (Math.abs(y - T) < 0.5) return x - L;
    if (Math.abs(x - R) < 0.5) return Wr + (y - T);
    if (Math.abs(y - B) < 0.5) return Wr + Hr + (R - x);
    return 2 * Wr + Hr + (B - y);
  }

  // ---- label placement: does the label fit on this side of the badge without covering an obstacle?
  const SIDES = ['l', 'r', 't', 'b'];
  let lw = 80, lh = 22;
  function labelFits(side, x, y, W, H) {
    let l, t;
    if (side === 'l') { l = x + 30; t = y - 11; } else if (side === 'r') { l = x - 30 - lw; t = y - 11; }
    else { l = x < 90 ? x - 20 : x > W - 90 ? x + 20 - lw : x - lw / 2; t = side === 't' ? y + 30 : y - 30 - lh; }
    const r = l + lw, b = t + lh;
    if (l < 2 || t < 2 || r > W - 2 || b > H - 2) return false;
    for (let i = 0; i < nRects; i++) {
      const o = i * 4;
      if (r > rects[o] && l < rects[o + 2] && b > rects[o + 1] && t < rects[o + 3]) return false;
    }
    return true;
  }

  // ---- edge arrow state
  const st = { edge: false, ex: 0, ey: 0, angle: 0, side: '', mark: false, mx: 0, my: 0, kind: '', push: 0 };
  let ex = -1, ey = -1, lastEX = NaN, lastEY = NaN, lastRot = NaN, lastSide = '', lastKind = '', lastIcon = '', lastWho = '', lastDist = -1, edgeOn = false;
  let lastMX = NaN, lastMY = NaN, lastMS = NaN, markOn = false, markKind = '';

  /**
   * Place the edge arrow. dirX/dirY = screen direction from the centre to the target (unnormalised);
   * aimX/aimY = projected target pixel (only meaningful when inFront).
   */
  function showEdge(dt, W, H, dirX, dirY, inFront, aimX, aimY, t) {
    L = safe.l + EDGE; T = safe.t + EDGE; R = W - safe.r - EDGE; B = H - safe.b - EDGE;
    Wr = Math.max(1, R - L); Hr = Math.max(1, B - T); P = 2 * (Wr + Hr);
    const cx = W / 2, cy = H / 2, d = Math.hypot(dirX, dirY) || 1, dx = dirX / d, dy = dirY / d;
    const tx = dx > 1e-6 ? (R - cx) / dx : dx < -1e-6 ? (L - cx) / dx : Infinity;
    const ty = dy > 1e-6 ? (B - cy) / dy : dy < -1e-6 ? (T - cy) / dy : Infinity;
    const k = Math.min(tx, ty);
    let gx = Math.max(L, Math.min(R, cx + dx * k)), gy = Math.max(T, Math.min(B, cy + dy * k));
    let inward = false;
    if (!clear(gx, gy)) { // walk in along the ray (just inside the HUD that covers this bit of border)
      const k0 = Math.hypot(gx - cx, gy - cy), kMin = Math.min(W, H) * 0.22;
      for (let kk = k0 - 6; kk > kMin; kk -= 6) {
        if (clear(cx + dx * kk, cy + dy * kk)) { gx = cx + dx * kk; gy = cy + dy * kk; inward = true; break; }
      }
    }
    if (!inward && !clear(gx, gy)) { // else slide along the border to the nearest free spot
      const s0 = sOf(gx, gy);
      let found = false;
      for (let step = 8; step < P / 2 && !found; step += 8) {
        perim(s0 + step); if (clear(px, py)) { found = true; break; }
        perim(s0 - step); if (clear(px, py)) { found = true; break; }
      }
      if (!found) return false;
      gx = px; gy = py;
    }
    if (ex < 0 || !edgeOn) { ex = gx; ey = gy; } else {
      const a = Math.min(1, dt * 10); ex += (gx - ex) * a; ey += (gy - ey) * a;
      if (!clear(ex, ey)) { ex = gx; ey = gy; } // never glide across a HUD piece: jump to the free spot instead
    }
    // aim: from the badge at the target's screen point when it is in front, else along the centre ray
    let ax = dx, ay = dy;
    if (inFront) { ax = aimX - ex; ay = aimY - ey; }
    st.angle = Math.atan2(ax, -ay); // clockwise from screen-up
    // label towards the middle of the screen, else the first side where it covers no HUD
    const ox = ex - cx, oy = (ey - cy) * (W / H);
    let side = Math.abs(oy) >= Math.abs(ox) ? (oy < 0 ? 't' : 'b') : (ox < 0 ? 'l' : 'r');
    const prev = lastSide.charAt(0);
    if (prev && prev !== 'n' && prev !== side && labelFits(prev, ex, ey, W, H)) side = prev; // keep the label where it is while it fits (no flip-flop)
    else if (!labelFits(side, ex, ey, W, H)) {
      let found = false;
      for (let i = 0; i < 4; i++) if (labelFits(SIDES[i], ex, ey, W, H)) { side = SIDES[i]; found = true; break; }
      if (!found) side = 'n'; // nowhere clear: badge only (the label never covers the HUD)
    }
    st.edge = true; st.ex = ex; st.ey = ey; st.side = side;
    const qx = Math.round(ex * 2) / 2, qy = Math.round(ey * 2) / 2, qa = Math.round(st.angle * 57.2958);
    if (qx !== lastEX || qy !== lastEY) { edge.style.transform = `translate(${qx}px,${qy}px)`; lastEX = qx; lastEY = qy; }
    if (qa !== lastRot) { rot.style.transform = `rotate(${qa}deg)`; lastRot = qa; }
    const sk = side + (ex < 90 ? '<' : ex > W - 90 ? '>' : '');
    if (sk !== lastSide) { edge.dataset.side = side; edge.dataset.align = sk.slice(1); lastSide = sk; }
    return true;
  }
  function setLabel(target, iconKey) {
    if (target.kind !== lastKind || iconKey !== lastIcon) {
      lastKind = target.kind; lastIcon = iconKey;
      ico.innerHTML = target.kind === 'person' ? PERSON : ICONS[iconKey] || ICONS.star;
      edge.dataset.kind = target.kind;
    }
    let changed = false;
    if (target.label !== lastWho) { lastWho = target.label; who.textContent = target.label; changed = true; }
    const dm = Math.round(target.dist);
    if (dm !== lastDist) { if (String(dm).length !== String(lastDist).length) changed = true; lastDist = dm; distEl.textContent = `${dm} m`; }
    if (changed) { const lab = edge.querySelector('.tbg-lab'); lw = lab.offsetWidth || lw; lh = lab.offsetHeight || lh; }
  }
  function hideEdge() { if (edgeOn) { edgeOn = false; edge.hidden = true; } st.edge = false; }
  function hideMark() { if (markOn) { markOn = false; mark.hidden = true; } st.mark = false; }

  // ---- "!" / pin: keep its whole footprint off the HUD. Pushed the shortest way out (down below the top band, sideways
  // off a column, up off the bottom buttons), with a small pointer still aiming at the target; too far → edge badge.
  let fx = 0, fy = 0, fDir = 0, mDir = 0, moved = false, blocked = false, lastPA = NaN;
  /** Fit the footprint (offsets ol..ob, already scaled) near anchor (ax, ay): sets fx / fy / fDir, returns the push in px or -1. */
  function fitMark(ax, ay, ol, ot, or, ob, W, H) {
    const minX = safe.l + 4 - ol, maxX = W - safe.r - 4 - or, minY = safe.t + 4 - ot, maxY = H - safe.b - 4 - ob;
    const x0 = Math.max(minX, Math.min(maxX, ax)), y0 = Math.max(minY, Math.min(maxY, ay));
    if (hit(x0 + ol, y0 + ot, x0 + or, y0 + ob) < 0) { fx = x0; fy = y0; fDir = 0; return Math.abs(x0 - ax) + Math.abs(y0 - ay); }
    let best = Infinity;
    for (let d = 1; d <= 4; d++) { // 1 down, 2 left, 3 right, 4 up
      let x = x0, y = y0, ok = false;
      for (let it = 0; it < 6; it++) {
        const i = hit(x + ol, y + ot, x + or, y + ob);
        if (i < 0) { ok = true; break; }
        const o = i * 4;
        if (d === 1) y = rects[o + 3] + GAP + 0.5 - ot; else if (d === 2) x = rects[o] - GAP - 0.5 - or;
        else if (d === 3) x = rects[o + 2] + GAP + 0.5 - ol; else y = rects[o + 1] - GAP - 0.5 - ob;
        if (x < minX || x > maxX || y < minY || y > maxY) break;
      }
      if (!ok) continue;
      const cost = Math.abs(x - ax) + Math.abs(y - ay) - (d === mDir ? 24 : 0); // stick with the last way out (no jitter)
      if (cost < best) { best = cost; fx = x; fy = y; fDir = d; }
    }
    return best === Infinity ? -1 : Math.abs(fx - ax) + Math.abs(fy - ay);
  }

  /** Show the "!" (person) / pin (spot, area) for anchor (x, y). Returns false when it can't sit near its target clear of
   * the HUD (the caller then shows the edge badge instead). */
  function placeMark(x, y, kind, scale, W, H) {
    const box = MARK_BOX[kind === 'person' ? 'person' : 'spot'];
    const push = fitMark(x, y, box[0] * scale, box[1] * scale, box[2] * scale, box[3] * scale, W, H);
    if (push < 0 || push > (blocked ? MARK_BACK : MARK_MAXD)) { blocked = true; mDir = 0; hideMark(); return false; }
    blocked = false; mDir = fDir;
    if (kind !== markKind) { markKind = kind; mark.dataset.kind = kind; bang.textContent = kind === 'person' ? '!' : ''; if (kind !== 'person') bang.innerHTML = ICONS.star; }
    // pointer: on once pushed > 14 px, off again under 8 px
    const mv = moved ? push > 8 : push > 14;
    if (mv !== moved) { moved = mv; if (mv) mark.dataset.moved = ''; else delete mark.dataset.moved; lastPA = NaN; }
    if (moved) { // aim from the bubble's centre at the real anchor
      const cy = fy - (17 + (kind === 'person' ? 0 : 14)) * scale;
      const qa = Math.round(Math.atan2(x - fx, -(y - cy)) * 57.2958);
      if (qa !== lastPA) { mrot.style.transform = `rotate(${qa}deg)`; lastPA = qa; }
    }
    const qx = Math.round(fx * 2) / 2, qy = Math.round(fy * 2) / 2, qs = Math.round(scale * 50) / 50;
    if (qx !== lastMX || qy !== lastMY || qs !== lastMS) { mark.style.transform = `translate(${qx}px,${qy}px) scale(${qs})`; lastMX = qx; lastMY = qy; lastMS = qs; }
    if (!markOn) { markOn = true; mark.hidden = false; }
    st.mark = true; st.mx = fx; st.my = fy; st.kind = kind; st.push = push;
    return true;
  }

  return {
    root, badge, st, refreshRects, showEdge, setLabel, placeMark, hideEdge, hideMark,
    edgeOn() { if (!edgeOn) { edgeOn = true; edge.hidden = false; } },
    hideAll() { hideEdge(); hideMark(); },
    get rects() { const out = []; for (let i = 0; i < nRects; i++) out.push([...rects.slice(i * 4, i * 4 + 4)].map(Math.round)); return out; },
  };
}
