// Town map (GUIDE.md "Mini-map slot"): a knitted 104 px mini-map under the top-right button row + a full town map card.
//
//   ctx.map = createMap(ctx)
//   map.open() / map.close() / map.isOpen   full town map overlay
//   map.select(placeId) / map.showWay(placeId?)   (tests) pick a place on the full map / point the way there
//   map.places → [{ id, kind, name, x, z, gx, gz, district }]   map.state() → diagnostics
//
// Canvas 2D only (0 WebGL draw calls). The city is painted once into an offscreen canvas (base.js) from the layout data
// and repainted only when a district's pop-up reveal changes; the mini-map redraws at ~15 fps while visible.
// Mini-map: map-up = the way the camera looks (so pushing the joystick up walks "up" the map); a stitched N on the rim.
// Hidden outside free play (mini-games, finale, rides, photo mode, cinematics, panels), like src/social/index.js.
import './map.css';
import { ICONS } from '../ui/icons.js';
import { createBase } from './base.js';
import { buildPlaces, badge, BADGE, star, friendColour, initials } from './places.js';

const VIEW_R = 11; // metres from the centre to the mini-map's rim
const FPS = 15;
const MINI_ICON = 15; // css px
const GOLD = '#e3aa3a';

export function createMap(ctx) {
  const { game, player, cam, uiRoot, layout: L } = ctx;
  const S = game.state;
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const base = createBase(L, { residentialHouses: ctx.city?.residential?.houses });
  const places = buildPlaces(L, ctx);
  const DIDS = L.DISTRICTS.map((d) => d.id);

  // ------------------------------------------------------------------ DOM
  const mini = document.createElement('button');
  mini.className = 'tbm-mini';
  mini.type = 'button';
  mini.setAttribute('aria-label', 'Town map');
  mini.hidden = true;
  mini.innerHTML = '<canvas></canvas>';
  uiRoot.appendChild(mini);
  const mc = mini.querySelector('canvas'), mg = mc.getContext('2d');

  const full = document.createElement('div');
  full.className = 'tbm-full';
  full.hidden = true;
  full.innerHTML = `
    <div class="tbm-card knit-card" role="dialog" aria-label="Town map">
      <div class="tbm-title">${ICONS.mountain}<span>Tinselby</span></div>
      <button class="knit-btn cream round tbm-x" aria-label="Close map">${ICONS.close}</button>
      <div class="tbm-stage"><canvas class="tbm-canvas"></canvas></div>
      <div class="tbm-foot">
        <div class="tbm-tip">Tap a place to find your way</div>
        <div class="tbm-info" hidden>
          <div class="tbm-info-txt"><b></b><span></span></div>
          <button class="knit-btn green tbm-go">${ICONS.arrow}<span>Show the way</span></button>
        </div>
      </div>
    </div>`;
  uiRoot.appendChild(full);
  const card = full.querySelector('.tbm-card'), stage = full.querySelector('.tbm-stage');
  const fc = full.querySelector('.tbm-canvas'), fg = fc.getContext('2d');
  const tip = full.querySelector('.tbm-tip'), info = full.querySelector('.tbm-info');
  const infoName = full.querySelector('.tbm-info-txt b'), infoSub = full.querySelector('.tbm-info-txt span');
  const goBtn = full.querySelector('.tbm-go'), xBtn = full.querySelector('.tbm-x');

  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const stop = (e) => e.stopPropagation();
  for (const el of [mini, full]) { el.addEventListener('pointerdown', stop); el.addEventListener('touchstart', stop, { passive: true }); }
  mini.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (visible) { sfx('ui'); open(); } });
  xBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sfx('ui'); close(); });
  full.addEventListener('click', (e) => { if (e.target === full) { e.stopPropagation(); close(); } });
  goBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sfx('ui'); showWay(); });
  fc.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); tapFull(e.clientX, e.clientY); });
  window.addEventListener('keydown', (e) => { if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); } }, true);

  // ------------------------------------------------------------------ base map (rebuilt when reveals change)
  let revealKey = '';
  const revealed = new Set();
  function readReveals() {
    const set = [];
    for (const id of DIDS) {
      let r = true;
      try { if (ctx.city?.isRevealed) r = !!ctx.city.isRevealed(id); } catch (e) { /* */ }
      if (r) set.push(id);
    }
    return set;
  }
  function refreshBase(force) {
    const set = readReveals(), key = set.join(',');
    if (!force && key === revealKey) return false;
    revealKey = key;
    revealed.clear(); set.forEach((id) => revealed.add(id));
    base.build(revealed, 24); // 24 px per metre: crisp in the mini-map on a phone and in the full map on a desktop
    fullDirty = true;
    return true;
  }

  // ------------------------------------------------------------------ helpers
  /** True when the map HUD is allowed: free play only (copy of social.free()). */
  function free() {
    return S.phase === 'play' && player.controllable && !cam.shotActive
      && !ctx.rides?.active && !ctx.minigames?.active && !ctx.finale?.running
      && !ctx.ui?.modalOpen?.() && !ctx.photo?.isOpen && !document.body.classList.contains('tb-photo')
      && !uiRoot.classList.contains('tb-house-open');
  }
  function goal() {
    const t = ctx.guide?.target;
    if (t && Number.isFinite(t.x) && Number.isFinite(t.z)) return t;
    const h = ctx.ui?.hud?.hint;
    if (h && Number.isFinite(h.x)) return { x: h.x, z: h.z, label: h.text };
    const o = ctx.tasks?.objective;
    if (o && Number.isFinite(o.x) && Number.isFinite(o.z)) return { x: o.x, z: o.z, label: o.text };
    return null;
  }
  function friends() {
    if (!ctx.net?.town) return []; // public town: nobody else is drawn
    try { return ctx.net.players?.() || []; } catch (e) { return []; }
  }
  const placeName = (x, z) => {
    try { const n = ctx.guide?.placeAt?.(x, z); if (n) return n; } catch (e) { /* */ }
    const d = L.DISTRICTS.find((q) => q.id === L.districtAt(x, z));
    return d ? d.name : 'the streets';
  };
  const placeOn = (p) => (p.when ? p.when() : true);

  // ------------------------------------------------------------------ mini-map placement (under the top-right row)
  let size = 104, lastRect = '';
  function layoutMini() {
    const vw = window.innerWidth, vh = window.innerHeight;
    size = vw < 380 ? 88 : 104;
    const tr = uiRoot.querySelector('.tb-hud .tb-tr');
    const r = tr && tr.getBoundingClientRect();
    let top, right;
    if (r && r.width > 0 && r.height > 0) { top = r.bottom + 8; right = Math.max(4, vw - r.right); } else { top = 72; right = 12; }
    // keep clear of the goal card (top-left) and the top-centre chips if they ever reach this far right
    const x0 = vw - right - size;
    for (const sel of ['.tb-hud .tb-tl > *:not([hidden])', '.tb-hud .tb-tc']) {
      for (const el of uiRoot.querySelectorAll(sel)) {
        const q = el.getBoundingClientRect();
        if (q.width && q.right > x0 - 6 && q.left < vw - right && q.bottom > top - 4 && q.top < top + size) top = Math.max(top, q.bottom + 8);
      }
    }
    // short landscape: stay above the bottom-right social stack / interact button
    let floor = vh - 8;
    for (const sel of ['.tbs-corner', '.tb-hud .tb-act:not([hidden])']) {
      const el = uiRoot.querySelector(sel);
      const q = el && el.getBoundingClientRect();
      if (q && q.height && q.left < vw - right && q.right > x0) floor = Math.min(floor, q.top - 8);
    }
    if (top + size > floor) size = Math.max(64, Math.floor(floor - top));
    const key = `${top}|${right}|${size}`;
    if (key !== lastRect) {
      lastRect = key;
      mini.style.top = `${Math.round(top)}px`; mini.style.right = `${Math.round(right)}px`;
      mini.style.width = mini.style.height = `${size}px`;
      const px = Math.round(size * dpr());
      mc.width = mc.height = px;
    }
  }
  let layoutT = 0;
  const relayout = () => { layoutT = 0; lastRect = ''; if (isOpen) sizeFull(); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 120));

  // ------------------------------------------------------------------ mini-map drawing
  function drawMini() {
    const W = mc.width, c = W / 2, d = dpr();
    const rIn = c - 3.5 * d; // inside the stitched rim
    const k = (rIn - 2 * d) / VIEW_R; // device px per metre
    const yaw = cam.yaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
    // view centre: the player, kept a little inside the town so the rim isn't half empty page at the gate / edges
    const WL = L.WORLD, m = VIEW_R * 0.5;
    const px = Math.min(WL.maxX - m, Math.max(WL.minX + m, player.pos.x)), pz = Math.min(WL.maxZ - m, Math.max(WL.minZ + m, player.pos.z));
    const w2s = (x, z) => { const dx = x - px, dz = z - pz; return [c + k * (cs * dx - sn * dz), c + k * (sn * dx + cs * dz)]; };
    const g = mg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(c, c, rIn, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#e6d8bd'; g.fillRect(0, 0, W, W);
    // world → device: screen = C + k·Rot(yaw)·(w − p)
    const a = k * cs, b = k * sn, cc = -k * sn, dd = k * cs;
    g.setTransform(a, b, cc, dd, c - (a * px + cc * pz), c - (b * px + dd * pz));
    g.imageSmoothingEnabled = true;
    const B = base.bounds;
    g.drawImage(base.canvas, B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // icons stay upright: rides + the big tree (only in revealed districts)
    const lim = rIn - MINI_ICON * d * 0.4;
    for (const p of places) {
      if (!(p.kind === 'ride' || p.id === 'tree') || !placeOn(p)) continue;
      if (p.district !== 'streets' && !revealed.has(p.district)) continue;
      const [sx, sy] = w2s(p.x, p.z);
      if (Math.hypot(sx - c, sy - c) > lim) continue;
      badge(g, sx, sy, (p.id === 'tree' ? MINI_ICON + 3 : MINI_ICON) * d, p.icon, p.id === 'tree' ? BADGE.tree : BADGE.ride);
    }
    g.restore();
    // stitched rim + N marker (north = world −z → screen angle yaw from up)
    g.save();
    g.strokeStyle = '#b8302d'; g.lineWidth = 1.6 * d; g.setLineDash([4 * d, 3 * d]);
    g.beginPath(); g.arc(c, c, rIn - 2 * d, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    const nx = c + Math.sin(yaw) * (rIn - 1 * d), ny = c - Math.cos(yaw) * (rIn - 1 * d);
    g.fillStyle = '#b8302d'; g.beginPath(); g.arc(nx, ny, 5.5 * d, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4e2'; g.font = `700 ${7.5 * d}px Fredoka, Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', nx, ny + 0.5 * d);
    g.restore();
    // friends (friends town only), clamped to the rim
    for (const f of friends()) {
      if (!Number.isFinite(f.x)) continue;
      let [sx, sy] = w2s(f.x, f.z);
      const dx = sx - c, dy = sy - c, dist = Math.hypot(dx, dy), maxR = rIn - 8 * d;
      if (dist > maxR) { sx = c + (dx / dist) * maxR; sy = c + (dy / dist) * maxR; }
      dot(g, sx, sy, 7.5 * d, friendColour(f.id || f.name), initials(f.name), d);
    }
    // goal star (clamped to the rim with a little arrow when outside)
    const t = goal();
    if (t) {
      const [sx, sy] = w2s(t.x, t.z);
      const dx = sx - c, dy = sy - c, dist = Math.hypot(dx, dy), maxR = rIn - 9 * d;
      if (dist <= maxR) goldStar(g, sx, sy, 8.5 * d, d);
      else {
        const ux = dx / dist, uy = dy / dist, ex = c + ux * maxR, ey = c + uy * maxR;
        goldStar(g, ex - ux * 2 * d, ey - uy * 2 * d, 7 * d, d);
        g.save(); g.translate(c + ux * (rIn - 1.5 * d), c + uy * (rIn - 1.5 * d)); g.rotate(Math.atan2(uy, ux));
        g.fillStyle = GOLD; g.strokeStyle = '#7a4d10'; g.lineWidth = d;
        g.beginPath(); g.moveTo(3 * d, 0); g.lineTo(-3 * d, -4.5 * d); g.lineTo(-3 * d, 4.5 * d); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
    }
    // you: arrow where the doll stands, pointing where it faces
    const [ax2, ay2] = w2s(player.pos.x, player.pos.z);
    arrow(g, ax2, ay2, 9 * d, Math.PI - (player.heading || 0) + yaw, d);
    frames++;
  }

  // ------------------------------------------------------------------ full map
  let isOpen = false, fullDirty = true, sel = null, fs = { x: 0, y: 0, k: 1, w: 0, h: 0 };
  function sizeFull() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const B = base.bounds, bw = B.x1 - B.x0, bh = B.z1 - B.z0;
    let aw, ah;
    if (vw > vh && vh <= 500) { aw = vw - 16 - 20 - 170 - 10; ah = vh - 22 - 24 - 6; } // map left, info right
    else if (vh >= vw) { aw = Math.min(880, vw - 20) - 20; ah = vh - 28 - 32 - 60 - 24; } // info under the map
    else { fc.style.width = fc.style.height = '0px'; const r = stage.getBoundingClientRect(); aw = r.width; ah = r.height; }
    const k = Math.max(1, Math.min(aw / bw, ah / bh));
    const w = Math.floor(bw * k), h = Math.floor(bh * k);
    fc.style.width = `${w}px`; fc.style.height = `${h}px`;
    fc.width = Math.round(w * dpr()); fc.height = Math.round(h * dpr());
    fs = { k, w, h };
    fullDirty = true;
  }
  const f2s = (x, z) => [(x - base.bounds.x0) * fs.k, (z - base.bounds.z0) * fs.k]; // css px within the canvas
  function drawFull() {
    const d = dpr(), g = fg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, fc.width, fc.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(base.canvas, 0, 0, fc.width, fc.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    const small = fs.w < 420;
    // landmarks + rides
    const sz = small ? 17 : 22;
    for (const p of places) {
      if (p.kind === 'district' || !placeOn(p)) continue;
      const [sx, sy] = f2s(p.x, p.z);
      const fog = p.district !== 'streets' && !revealed.has(p.district);
      g.globalAlpha = fog ? 0.55 : 1;
      if (sel === p) { g.fillStyle = 'rgba(227,170,58,0.55)'; g.beginPath(); g.arc(sx, sy, sz * 0.85, 0, Math.PI * 2); g.fill(); }
      badge(g, sx, sy, p.ride === 'tram' ? sz * 0.75 : p.kind === 'ride' ? sz * 0.9 : sz, p.icon, p.kind === 'ride' ? BADGE.ride : p.id === 'tree' ? BADGE.tree : BADGE.landmark);
      g.globalAlpha = 1;
    }
    // district names
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of places) {
      if (p.kind !== 'district') continue;
      const [sx, sy] = f2s(p.x, p.z + (p.district === 'market' ? 4.0 : p.district === 'lakeside' ? 5.8 : p.district === 'park' ? 2.4 : p.district === 'hill' ? -2.5 : -3.6));
      const on = revealed.has(p.district);
      label(g, p.name + (on ? '' : ' ?'), sx, sy, small ? 10.5 : 13, on ? '#3a2a24' : '#7d6c58', sel === p);
    }
    // friends
    for (const f of friends()) {
      if (!Number.isFinite(f.x)) continue;
      const [sx, sy] = f2s(f.x, f.z);
      dot(g, sx, sy, small ? 8 : 10, friendColour(f.id || f.name), initials(f.name), 1);
    }
    // goal star + the selected place's walk spot
    const t = goal();
    if (t) { const [sx, sy] = f2s(t.x, t.z); goldStar(g, sx, sy, small ? 9 : 11, 1); }
    // you
    const [ux, uy] = f2s(player.pos.x, player.pos.z);
    g.fillStyle = 'rgba(255,255,255,0.65)'; g.beginPath(); g.arc(ux, uy, small ? 11 : 14, 0, Math.PI * 2); g.fill();
    arrow(g, ux, uy, small ? 9 : 11, Math.PI - (player.heading || 0), 1);
    const below = uy + (small ? 17 : 21) < fs.h - 8;
    label(g, 'You', ux, below ? uy + (small ? 17 : 21) : uy - (small ? 17 : 21), small ? 10 : 12, '#b8302d', false);
    fullDirty = false;
  }
  function hitPlace(cx, cy) {
    let best = null, bd = 1e9;
    const rad = fs.w < 420 ? 20 : 24;
    for (const p of places) {
      if (p.kind === 'district' || !placeOn(p)) continue;
      const [sx, sy] = f2s(p.x, p.z), dd = Math.hypot(sx - cx, sy - cy);
      if (dd < rad && dd < bd) { bd = dd; best = p; }
    }
    if (best) return best;
    // else: the district under the finger
    const x = cx / fs.k + base.bounds.x0, z = cy / fs.k + base.bounds.z0;
    const id = L.districtAt(x, z);
    return places.find((p) => p.kind === 'district' && p.district === id) || null;
  }
  function tapFull(clientX, clientY) {
    const r = fc.getBoundingClientRect();
    const p = hitPlace(clientX - r.left, clientY - r.top);
    select(p ? p.id : null);
    sfx('ui');
  }
  function select(id) {
    sel = places.find((p) => p.id === id) || null;
    info.hidden = !sel; tip.hidden = !!sel;
    if (sel) {
      infoName.textContent = sel.name;
      const where = sel.kind === 'district' ? (revealed.has(sel.district) ? 'District' : 'Not explored yet') : placeName(sel.x, sel.z);
      const dist = Math.hypot(sel.gx - player.pos.x, sel.gz - player.pos.z);
      infoSub.textContent = `${where} · ${dist < 2 ? 'right here' : Math.round(dist) + ' m'}`;
    }
    fullDirty = true;
    return !!sel;
  }
  /** Point the way to a place, the way the calendar's "Go there" does (ui.hint → tasks.focusDoor, else the HUD pill):
   *  guide.showWay when the Guide offers it, else tasks.pointTo (the game's arrow + goal card follow it), else the HUD
   *  hint pill; plus 'hint:target', an arrow toast and the Guide's footprint trail. Closes the map. */
  function showWay(id) {
    const p = id ? places.find((q) => q.id === id) : sel;
    if (!p) return false;
    const text = `Head to ${p.name}`;
    const h = { x: p.gx, z: p.gz, text, label: p.name, place: p.name, kind: 'place', id: 'map-' + p.id };
    close();
    let how = '';
    try { if (typeof ctx.guide?.showWay === 'function' && ctx.guide.showWay({ x: h.x, z: h.z, label: p.name, ms: 45000 }) !== false) how = 'guide'; } catch (e) { console.warn('[map] guide.showWay', e); }
    try { if (!how && ctx.tasks?.pointTo?.({ x: h.x, z: h.z, text, icon: 'star', ms: 45000 })) how = 'pointTo'; } catch (e) { console.warn('[map] pointTo', e); }
    try { if (!how && ctx.ui?.hud?.setHint) { ctx.ui.hud.setHint(h); how = 'hint'; } } catch (e) { console.warn('[map] setHint', e); }
    game.emit('hint:target', h);
    try { ctx.ui?.toast?.(text, 4200, { x: h.x, z: h.z }); } catch (e) { /* */ }
    if (how !== 'guide') try { ctx.guide?.showTrail?.(20); } catch (e) { /* */ }
    lastWay = { ...h, how };
    return true;
  }
  let lastWay = null;
  function open() {
    if (isOpen) return;
    refreshBase(false);
    isOpen = true;
    full.hidden = false;
    mini.classList.remove('on');
    select(null);
    sizeFull();
    drawFull();
    game.emit('map:open', {});
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    full.hidden = true;
    sel = null;
    game.emit('map:close', {});
  }

  // ------------------------------------------------------------------ per frame
  let visible = false, acc = 1, revealT = 0, frames = 0, fullT = 0;
  ctx.engine.addUpdate((dt) => {
    // close the full map when free play ends (a door cinematic, a ride, the finale…)
    const canShow = free();
    if (isOpen && (S.phase !== 'play' || ctx.minigames?.active || ctx.finale?.running || ctx.rides?.active)) close();
    revealT -= dt;
    if (revealT <= 0) { revealT = 0.5; if (refreshBase(false)) acc = 1; }
    const show = canShow && !isOpen;
    if (show !== visible) {
      visible = show;
      if (show) { mini.hidden = false; layoutT = 0; acc = 1; layoutMini(); void mini.offsetWidth; mini.classList.add('on'); }
      else { mini.classList.remove('on'); setTimeout(() => { if (!visible) mini.hidden = true; }, 260); }
    }
    if (isOpen) { fullT -= dt; if (fullT <= 0 || fullDirty) { fullT = 0.25; drawFull(); } return; }
    if (!visible) return;
    layoutT -= dt;
    if (layoutT <= 0) { layoutT = 0.5; layoutMini(); }
    acc += dt;
    if (acc >= 1 / FPS) { acc = 0; drawMini(); }
  }, 160);
  game.on('game:start', () => { revealKey = ''; });

  const api = {
    open, close, select, showWay, places,
    get isOpen() { return isOpen; },
    get visible() { return visible; },
    get selected() { return sel?.id || null; },
    get lastWay() { return lastWay; },
    /** Tests: client (css px) point of a place on the open full map. */
    fullPoint(id) {
      const p = places.find((q) => q.id === id), r = fc.getBoundingClientRect();
      if (!p || !isOpen) return null;
      const [x, y] = f2s(p.x, p.z);
      return [Math.round(r.left + x), Math.round(r.top + y)];
    },
    /** Diagnostics / tests. */
    state() {
      const r = mini.getBoundingClientRect();
      const why = { phase: S.phase, ctl: player.controllable, shot: cam.shotActive ? cam.shotName : false, ride: !!ctx.rides?.active, mg: !!ctx.minigames?.active, fin: !!ctx.finale?.running, modal: !!ctx.ui?.modalOpen?.(), photo: !!ctx.photo?.isOpen };
      return { visible, why, open: isOpen, size, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], frames, revealed: [...revealed], base: [base.canvas.width, base.canvas.height], goal: goal(), selected: sel?.id || null };
    },
  };
  return api;
}

// ------------------------------------------------------------------ small drawing helpers
function arrow(g, x, y, s, ang, d) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = 'rgba(40,20,10,0.3)'; g.beginPath(); g.arc(0, d * 1.2, s * 0.95, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff4e2'; g.beginPath(); g.arc(0, 0, s * 0.95, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b8302d'; g.strokeStyle = '#7d1f1d'; g.lineWidth = d;
  g.beginPath(); g.moveTo(0, -s * 0.92); g.lineTo(s * 0.52, s * 0.62); g.lineTo(0, s * 0.36); g.lineTo(-s * 0.52, s * 0.62); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
function goldStar(g, x, y, r, d) {
  g.save();
  g.fillStyle = 'rgba(40,20,10,0.3)'; star(g, x, y + d * 1.2, r); g.fill();
  g.fillStyle = GOLD; g.strokeStyle = '#fff4e2'; g.lineWidth = 1.5 * d; star(g, x, y, r); g.fill(); g.stroke();
  g.restore();
}
function dot(g, x, y, r, col, txt, d) {
  g.save();
  g.fillStyle = col; g.strokeStyle = '#fff4e2'; g.lineWidth = 1.5 * d;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = `700 ${r * (txt.length > 1 ? 0.95 : 1.15)}px Fredoka, Nunito, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y + r * 0.06);
  g.restore();
}
function label(g, text, x, y, px, col, hi) {
  g.save();
  g.font = `700 ${px}px Fredoka, Nunito, 'Trebuchet MS', system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = px * 0.36; g.strokeStyle = hi ? GOLD : 'rgba(255,248,236,0.95)';
  g.strokeText(text, x, y); g.fillStyle = col; g.fillText(text, x, y);
  g.restore();
}
