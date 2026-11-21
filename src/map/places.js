// Places on the town map: districts, landmarks and rides (positions from src/core/layout.js, the ride modules'
// interact spots and the city builders), plus small vector glyphs drawn in canvas 2D (no emoji: fonts vary on phones).
import { CARRIAGE_STOP } from '../life/carriage.js';

/** kind: 'district' | 'landmark' | 'ride'. ride = the ride id in ctx.rides.list (for the mini-map's ride icons). */
export function buildPlaces(L, ctx) {
  const P = [];
  const add = (p) => { P.push({ district: L.districtAt(p.x, p.z), ...p }); };
  for (const d of L.DISTRICTS) add({ id: 'd-' + d.id, kind: 'district', name: d.name, x: d.center[0], z: d.center[1], district: d.id });
  // where to stand for each district (center can be in a building / on a slope edge): use a walkable spot
  const go = { market: [0, 2.6], residential: [-14.5, 0.4], lakeside: [10.2, 3.0], park: [0, 11.0], hill: [-1.0, -8.6] };
  for (const p of P) if (go[p.district]) { p.gx = go[p.district][0]; p.gz = go[p.district][1]; }
  const T = L.MARKET.tree;
  add({ id: 'tree', kind: 'landmark', icon: 'tree', name: 'The Big Tree', x: T.x, z: T.z, gx: T.x, gz: T.z + 1.5 });
  add({ id: 'advent', kind: 'landmark', icon: 'calendar', name: 'Advent Calendar', x: L.ADVENT_BOARD.x, z: L.ADVENT_BOARD.z, gx: L.ADVENT_BOARD.x + 0.6, gz: L.ADVENT_BOARD.z + 0.8 });
  add({ id: 'gate', kind: 'landmark', icon: 'gate', name: 'Town Gate', x: L.GATE.x, z: L.GATE.z - 0.2, gx: 0, gz: 15.0 });
  add({ id: 'gazebo', kind: 'landmark', icon: 'gazebo', name: 'Bandstand', x: 3.0, z: 11.6, gx: 3.0, gz: 12.8 });
  add({ id: 'rest', kind: 'landmark', icon: 'hoofprint', name: 'Reindeer Rest', x: L.REINDEER.rest.x, z: L.REINDEER.rest.z, gx: 6.4, gz: 8.0 });
  add({ id: 'pier', kind: 'landmark', icon: 'pier', name: 'The Pier', x: 11.4, z: L.LAKE.pier.z, gx: 10.0, gz: L.LAKE.pier.z });
  add({ id: 'cocoa', kind: 'landmark', icon: 'cocoa', name: 'Cocoa Hut', x: 12.8, z: -5.4, gx: 12.35, gz: -3.95 });
  add({ id: 'post', kind: 'landmark', icon: 'post', name: 'Post Box', x: L.POST.box.x, z: L.POST.box.z, gx: L.POST.box.x - 0.3, gz: L.POST.box.z + 0.6 });
  add({ id: 'home', kind: 'landmark', icon: 'house', name: 'Your Cottage', x: L.HOUSE.x, z: L.HOUSE.z, gx: L.HOUSE.door.x, gz: L.HOUSE.door.z, when: () => !!ctx.house?.owned });
  add({ id: 'cabletop', kind: 'landmark', icon: 'star', name: 'Hilltop Station', x: L.HILL.cableTop.x, z: L.HILL.cableTop.z, gx: L.HILL.starSpot.x, gz: L.HILL.starSpot.z + 0.3 });
  // rides (src/rides): spots match each module's interact.add
  add({ id: 'carousel', kind: 'ride', ride: 'carousel', icon: 'carousel', name: 'Carousel', x: L.MARKET.carousel.x, z: L.MARKET.carousel.z, gx: L.MARKET.carousel.x + 0.15, gz: L.MARKET.carousel.z + 1.4 });
  add({ id: 'ferris', kind: 'ride', ride: 'ferris', icon: 'wheel', name: 'Ferris Wheel', x: 18.3, z: -3.7, gx: 18.25, gz: -2.6 });
  add({ id: 'skate', kind: 'ride', ride: 'skate', icon: 'skate', name: 'Ice Skating', x: 14.6, z: 1.6, gx: 10.0, gz: 2.6 });
  add({ id: 'sled', kind: 'ride', ride: 'sled', icon: 'sled', name: 'Sledging', x: -2.0, z: -13.2, gx: 0.4, gz: -15.35 });
  add({ id: 'cable', kind: 'ride', ride: 'cablecar', icon: 'cable', name: 'Cable Car', x: L.HILL.cableBase.x, z: L.HILL.cableBase.z, gx: L.HILL.giver.x + 0.6, gz: L.HILL.giver.z + 0.2 });
  add({ id: 'carriage', kind: 'ride', ride: 'carriage', icon: 'carriage', name: 'Carriage Stop', x: CARRIAGE_STOP.pos[0], z: CARRIAGE_STOP.pos[1] - 1.0, gx: CARRIAGE_STOP.wait[0], gz: CARRIAGE_STOP.wait[1] });
  for (const st of L.TRAM_STOPS || []) {
    // icon on the rails; walk spot = tram.js spotOf(): 20 % of the way from the stop towards the plaza centre
    const wx = st.pos[0] * 0.8, wz = st.pos[1] * 0.8;
    add({ id: 'tram-' + st.id, kind: 'ride', ride: 'tram', icon: 'tram', name: `Tram Stop · ${st.name}`, x: st.pos[0], z: st.pos[1], gx: wx, gz: wz, district: 'streets' });
  }
  for (const p of P) { if (p.gx == null) { p.gx = p.x; p.gz = p.z; } }
  return P;
}

// ------------------------------------------------------------------ glyphs (drawn centred at 0,0 in a box of size s)
const INK = '#3a2a24';
export const BADGE = { ride: '#3f6e45', landmark: '#b8302d', tree: '#2f5e3a' };

/** Round felt badge with a glyph. */
export function badge(g, x, y, s, icon, fill, opts = {}) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(40,20,10,0.28)'; g.beginPath(); g.arc(0, s * 0.08, s / 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = fill; g.beginPath(); g.arc(0, 0, s / 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = opts.ring || '#fff4e2'; g.lineWidth = Math.max(1, s * 0.09); g.stroke();
  glyph(g, icon, s * 0.62, '#fff4e2');
  g.restore();
}

export function glyph(g, icon, s, col = INK) {
  const h = s / 2;
  g.save();
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(1, s * 0.12); g.lineCap = 'round'; g.lineJoin = 'round';
  const B = () => g.beginPath();
  switch (icon) {
    case 'tree':
      B(); g.moveTo(0, -h); g.lineTo(h * 0.75, h * 0.55); g.lineTo(-h * 0.75, h * 0.55); g.closePath(); g.fill();
      g.fillRect(-h * 0.14, h * 0.5, h * 0.28, h * 0.45);
      g.fillStyle = '#e3aa3a'; star(g, 0, -h * 0.95, h * 0.38); g.fill();
      break;
    case 'star': star(g, 0, 0, h); g.fill(); break;
    case 'calendar':
      g.strokeRect(-h * 0.8, -h * 0.7, h * 1.6, h * 1.5);
      B(); g.moveTo(-h * 0.8, -h * 0.25); g.lineTo(h * 0.8, -h * 0.25); g.moveTo(0, -h * 0.25); g.lineTo(0, h * 0.8); g.moveTo(-h * 0.8, h * 0.28); g.lineTo(h * 0.8, h * 0.28); g.stroke();
      break;
    case 'gate':
      B(); g.moveTo(-h * 0.8, h * 0.9); g.lineTo(-h * 0.8, -h * 0.1); g.arc(0, -h * 0.1, h * 0.8, Math.PI, 0); g.lineTo(h * 0.8, h * 0.9); g.stroke();
      break;
    case 'gazebo':
      B(); g.moveTo(-h, -h * 0.1); g.lineTo(0, -h); g.lineTo(h, -h * 0.1); g.closePath(); g.fill();
      B(); g.moveTo(-h * 0.7, 0); g.lineTo(-h * 0.7, h * 0.9); g.moveTo(h * 0.7, 0); g.lineTo(h * 0.7, h * 0.9); g.moveTo(-h, h * 0.9); g.lineTo(h, h * 0.9); g.stroke();
      break;
    case 'hoofprint':
      for (const sx of [-1, 1]) { B(); g.ellipse(sx * h * 0.32, h * 0.1, h * 0.28, h * 0.6, sx * 0.25, 0, Math.PI * 2); g.fill(); }
      break;
    case 'pier':
      g.fillRect(-h, -h * 0.25, h * 2, h * 0.5);
      B(); for (const x of [-0.6, 0, 0.6]) { g.moveTo(x * h, h * 0.25); g.lineTo(x * h, h * 0.8); } g.stroke();
      break;
    case 'cocoa':
      B(); g.moveTo(-h * 0.7, -h * 0.3); g.lineTo(h * 0.5, -h * 0.3); g.lineTo(h * 0.4, h * 0.8); g.lineTo(-h * 0.6, h * 0.8); g.closePath(); g.fill();
      B(); g.arc(h * 0.6, h * 0.2, h * 0.3, -Math.PI / 2, Math.PI / 2); g.stroke();
      B(); g.moveTo(-h * 0.2, -h * 0.6); g.quadraticCurveTo(0, -h * 0.85, -h * 0.1, -h); g.stroke();
      break;
    case 'post':
      g.fillRect(-h * 0.55, -h * 0.5, h * 1.1, h * 1.4); B(); g.arc(0, -h * 0.5, h * 0.55, Math.PI, 0); g.fill();
      g.fillStyle = BADGE.landmark; g.fillRect(-h * 0.35, -h * 0.3, h * 0.7, h * 0.14);
      break;
    case 'house':
      B(); g.moveTo(-h, 0); g.lineTo(0, -h); g.lineTo(h, 0); g.closePath(); g.fill();
      g.fillRect(-h * 0.7, 0, h * 1.4, h * 0.9);
      break;
    case 'carousel': // round striped canopy on a pole, a horse post either side, round base
      B(); g.moveTo(-h, -h * 0.25); g.quadraticCurveTo(0, -h * 1.25, h, -h * 0.25); g.closePath(); g.fill();
      B(); g.moveTo(0, -h * 0.95); g.lineTo(0, -h * 1.15); g.stroke();
      B(); g.moveTo(0, -h * 0.25); g.lineTo(0, h * 0.75); g.moveTo(-h * 0.65, -h * 0.25); g.lineTo(-h * 0.65, h * 0.75); g.moveTo(h * 0.65, -h * 0.25); g.lineTo(h * 0.65, h * 0.75); g.stroke();
      B(); g.arc(-h * 0.65, h * 0.2, h * 0.2, 0, Math.PI * 2); g.arc(h * 0.65, h * 0.35, h * 0.2, 0, Math.PI * 2); g.fill();
      g.fillRect(-h, h * 0.72, h * 2, h * 0.22);
      break;
    case 'wheel':
      B(); g.arc(0, -h * 0.1, h * 0.8, 0, Math.PI * 2); g.stroke();
      B(); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; g.moveTo(Math.cos(a) * h * 0.8, -h * 0.1 + Math.sin(a) * h * 0.8); g.lineTo(-Math.cos(a) * h * 0.8, -h * 0.1 - Math.sin(a) * h * 0.8); } g.stroke();
      B(); g.moveTo(-h * 0.5, h); g.lineTo(0, -h * 0.1); g.lineTo(h * 0.5, h); g.stroke();
      break;
    case 'skate':
      B(); g.moveTo(-h * 0.6, -h); g.lineTo(-h * 0.6, h * 0.25); g.lineTo(h * 0.8, h * 0.25); g.quadraticCurveTo(h * 0.8, -h * 0.25, h * 0.1, -h * 0.3); g.lineTo(h * 0.1, -h); g.closePath(); g.fill();
      B(); g.moveTo(-h * 0.9, h * 0.7); g.lineTo(h, h * 0.7); g.stroke();
      break;
    case 'sled':
      g.fillRect(-h * 0.8, -h * 0.35, h * 1.5, h * 0.45);
      B(); g.moveTo(-h, h * 0.55); g.lineTo(h * 0.7, h * 0.55); g.quadraticCurveTo(h, h * 0.55, h, h * 0.1); g.moveTo(-h * 0.5, h * 0.1); g.lineTo(-h * 0.5, h * 0.55); g.moveTo(h * 0.4, h * 0.1); g.lineTo(h * 0.4, h * 0.55); g.stroke();
      break;
    case 'cable':
      B(); g.moveTo(-h, -h * 0.75); g.lineTo(h, -h * 0.35); g.stroke();
      g.fillRect(-h * 0.55, -h * 0.25, h * 1.1, h * 1.05);
      B(); g.moveTo(0, -h * 0.55); g.lineTo(0, -h * 0.25); g.stroke();
      break;
    case 'carriage':
      g.fillRect(-h * 0.8, -h * 0.6, h * 1.4, h * 0.9);
      B(); g.arc(-h * 0.45, h * 0.55, h * 0.35, 0, Math.PI * 2); g.arc(h * 0.35, h * 0.55, h * 0.35, 0, Math.PI * 2); g.stroke();
      break;
    case 'tram':
      roundRect(g, -h * 0.75, -h * 0.85, h * 1.5, h * 1.5, h * 0.3); g.fill();
      g.fillStyle = '#3f6e45'; g.fillRect(-h * 0.5, -h * 0.6, h, h * 0.45);
      B(); g.moveTo(-h * 0.5, h * 0.65); g.lineTo(-h * 0.8, h); g.moveTo(h * 0.5, h * 0.65); g.lineTo(h * 0.8, h); g.stroke();
      break;
    case 'gift':
      g.fillRect(-h * 0.8, -h * 0.25, h * 1.6, h * 1.1);
      g.fillRect(-h * 0.9, -h * 0.55, h * 1.8, h * 0.35);
      g.fillStyle = BADGE.landmark; g.fillRect(-h * 0.14, -h * 0.55, h * 0.28, h * 1.4);
      B(); g.ellipse(-h * 0.35, -h * 0.8, h * 0.32, h * 0.2, 0.5, 0, Math.PI * 2); g.ellipse(h * 0.35, -h * 0.8, h * 0.32, h * 0.2, -0.5, 0, Math.PI * 2); g.fill();
      break;
    default:
      B(); g.arc(0, 0, h * 0.45, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

export function star(g, x, y, r, inner = 0.45) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/** Stable friend colour + initials from a name / id. */
const FRIEND_COLS = ['#d9534f', '#2b7bb9', '#8e5bb5', '#e08a1e', '#2a9d8f', '#c2457a', '#5b8c2a', '#a0522d'];
export function friendColour(key) {
  let h = 0;
  for (const c of String(key || '')) h = (h * 31 + c.charCodeAt(0)) | 0;
  return FRIEND_COLS[Math.abs(h) % FRIEND_COLS.length];
}
export function initials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const s = w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2);
  return s.toUpperCase();
}
