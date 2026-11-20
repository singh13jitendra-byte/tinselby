// Town map base layer: the whole city painted ONCE into an offscreen canvas from the real layout data
// (src/core/layout.js + the exact strips / rects the city builders use in src/city/ground.js, park.js, lakeside.js,
// hill.js, cablecar.js, residential.js, market.js). Rebuilt only when the set of revealed districts changes.
//
//   const base = createBase(layout, { residentialHouses })
//   base.build(revealed: Set<districtId>, pxPerMetre) → canvas   (world (x, z) → canvas px via base.toPx)
//   base.bounds = { x0, z0, x1, z1 } (world rect the canvas covers)

const M = 1.6; // margin round WORLD (metres)

const COL = {
  page: '#e6d8bd', pageDot: '#d8c8aa', snow: '#f8f5ef', thread: '#b8302d',
  road: '#bcc3cc', roadEdge: '#a2abb7', rail: '#5d5550', zebra: '#fff8ec',
  plaza: '#fbf7ef', brick: '#c0473f', pine: '#4f8a58', pineDark: '#2f5e3a', woods: '#dce9d3',
  path: '#ead8b8', pathEdge: '#d6bf97', pavement: '#ece8e1',
  ice: '#cfe7f3', iceHi: '#eef8fd', shore: '#8fb3c8', wood: '#a7774f', woodDark: '#7a5537',
  hillLo: '#f4f6fa', hillHi: '#dfe7f1', contour: '#b9c7d8', sled: '#8aa7c9', cable: '#3b3633',
  fog: '#d9cfbf', fogDot: '#c6b9a4',
  tint: { market: 'rgba(255,236,200,0.55)', residential: 'rgba(240,214,196,0.45)', lakeside: 'rgba(205,228,240,0.45)', park: 'rgba(206,229,196,0.6)', hill: 'rgba(225,233,243,0.5)' },
};
const WALLS = ['#e9b8a8', '#f3dfb0', '#bcd3c0', '#f6efe2', '#c9d6e8', '#e7c6d8'];
const ROOFS = ['#8b2523', '#3f6e45', '#5c4a72', '#7a5537', '#2b4d6e', '#8b2523'];

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const polyDist = (x, z, pts, closed) => {
  let d = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); }
  return d;
};

export function createBase(L, opts = {}) {
  const W = L.WORLD;
  const bounds = { x0: W.minX - M, z0: W.minZ - M, x1: W.maxX + M, z1: W.maxZ + M };
  const canvas = document.createElement('canvas');
  let S = 1;
  const toPx = (x, z) => [(x - bounds.x0) * S, (z - bounds.z0) * S];

  const park = L.WALK_LOOPS.find((w) => w.id === 'parkLoop')?.pts || [];
  const prom = L.WALK_LOOPS.find((w) => w.id === 'promenade')?.pts || [];
  const LK = L.LAKE;
  const inLake = (x, z, m = 0) => ((x - LK.center.x) / (LK.rx + m)) ** 2 + ((z - LK.center.z) / (LK.rz + m)) ** 2 < 1;
  // where the woods glyphs must not go (roads, paths, lake, buildings): a stylised stand-in for the scattered trees
  const clear = (x, z) => {
    if (inLake(x, z, 0.9)) return false;
    if (Math.abs(z) < 1.3 && x < -8 && x > -21) return false; // Holly Lane
    if (x > -8.9 && x < 9.9 && z > -8.2 && z < 8.6) return false; // ring + plaza
    if (Math.abs(x) < 0.9 && z > 7) return false; // park spine
    if (park.length && polyDist(x, z, park, true) < 0.75) return false;
    if (prom.length && polyDist(x, z, prom, false) < 0.8) return false;
    if (x > 16.8 && x < 20.4 && z > -4.8 && z < -2.6) return false; // Ferris wheel
    if (Math.abs(x - 12.8) < 1.2 && Math.abs(z + 5.4) < 1) return false; // cocoa hut
    if (Math.hypot(x - 3.0, z - 11.6) < 1.3) return false; // gazebo
    if (Math.hypot(x - L.REINDEER.rest.x, z - L.REINDEER.rest.z) < 1.1) return false;
    if (x > -8.6 && x < 9 && z < -7.6) return false; // the hill has its own drawing
    if (z > 14.6 && Math.abs(x) < 2.4) return false; // the gate
    return true;
  };

  function build(revealed, pxPerMetre = 24) {
    S = pxPerMetre;
    canvas.width = Math.ceil((bounds.x1 - bounds.x0) * S);
    canvas.height = Math.ceil((bounds.z1 - bounds.z0) * S);
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // ---- felt page + speckle
    g.fillStyle = COL.page; g.fillRect(0, 0, canvas.width, canvas.height);
    const rnd = mulberry32(11);
    g.fillStyle = COL.pageDot;
    for (let i = 0; i < canvas.width * canvas.height / 260; i++) g.fillRect(rnd() * canvas.width, rnd() * canvas.height, S * 0.06, S * 0.06);
    // from here on draw in world units
    g.setTransform(S, 0, 0, S, -bounds.x0 * S, -bounds.z0 * S);
    const px = 1 / S; // one canvas pixel in metres
    // ---- snow sheet + stitched border (as the book page's border, ground.js buildBook)
    g.fillStyle = COL.snow;
    roundRect(g, W.minX - 0.3, W.minZ - 0.3, W.maxX - W.minX + 0.6, W.maxZ - W.minZ + 0.6, 0.6); g.fill();
    g.save(); g.strokeStyle = COL.thread; g.lineWidth = 0.09; g.setLineDash([0.26, 0.24]);
    g.strokeRect(W.minX - 0.55, W.minZ - 0.55, W.maxX - W.minX + 1.1, W.maxZ - W.minZ + 1.1); g.restore();
    // ---- district tints
    for (const d of L.DISTRICTS) {
      const [x0, z0, x1, z1] = d.rect;
      g.fillStyle = COL.tint[d.id] || 'rgba(0,0,0,0)';
      roundRect(g, x0, z0, x1 - x0, z1 - z0, 0.5); g.fill();
    }
    // ---- woods (forest rects from park.js / hill.js / lakeside.js)
    const woods = [[-20.8, -16.8, -8.6, -7.7], [-20.8, 7.7, -7.7, 15.8], [7.7, 9.8, 20.8, 15.8], [9.0, -7.4, 20.8, 9.4], [9.2, -16.8, 20.8, -7.7], [-7.2, 7.8, 7.2, 15.4]];
    const wr = mulberry32(5);
    const trees = [];
    for (const [x0, z0, x1, z1] of woods) {
      const step = 1.45;
      for (let x = x0 + 0.5; x < x1 - 0.3; x += step) for (let z = z0 + 0.5; z < z1 - 0.3; z += step) {
        const jx = x + (wr() - 0.5) * 0.8, jz = z + (wr() - 0.5) * 0.8;
        if (wr() < 0.45 || !clear(jx, jz)) continue;
        trees.push([jx, jz, 0.28 + wr() * 0.2]);
      }
    }
    // ---- the hill: shaded slope with contour stitches, sledge lanes, cable car
    const H = L.HILL;
    {
      const grad = g.createLinearGradient(0, -7.6, 0, -15.5);
      grad.addColorStop(0, COL.hillLo); grad.addColorStop(1, COL.hillHi);
      g.fillStyle = grad; roundRect(g, -8.5, -17, 17.5, 9.4, 0.8); g.fill();
      g.save(); g.strokeStyle = COL.contour; g.lineWidth = 0.06; g.setLineDash([0.22, 0.16]);
      for (const h of [0.5, 1.1, 1.7, 2.3]) { // solve smoothstep(t) * topY = h for t (bisection), z = −7.6 − 7.9 t
        let lo = 0, hi = 1;
        for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2, s = m * m * (3 - 2 * m); if (s * H.topY < h) lo = m; else hi = m; }
        const z = -7.6 - 7.9 * lo;
        g.beginPath(); g.moveTo(-7.6, z); g.quadraticCurveTo(0.25, z - 0.35, 8.1, z); g.stroke();
      }
      g.restore();
      g.save(); g.strokeStyle = COL.sled; g.lineWidth = 0.12; g.setLineDash([0.3, 0.22]);
      for (let i = 0; i < H.sledLanes.length; i += 2) { const a = H.sledLanes[i], b = H.sledLanes[i + 1]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      g.restore();
      // cable car: two cables (cablecar.js lineX = base x ± 0.33) and the two stations
      const b0 = H.cableBase, t0 = H.cableTop;
      g.strokeStyle = COL.cable; g.lineWidth = 0.05;
      for (const o of [-0.33, 0.33]) { g.beginPath(); g.moveTo(b0.x + o, b0.z); g.lineTo(t0.x + o, t0.z); g.stroke(); }
      for (const s of [b0, t0]) { g.fillStyle = COL.wood; roundRect(g, s.x - 0.55, s.z - 0.4, 1.1, 0.8, 0.12); g.fill(); g.fillStyle = COL.thread; g.fillRect(s.x - 0.55, s.z - 0.12, 1.1, 0.24); }
      // chalet at the foot (hill.js addRect ±0.9 × ±0.65): position from its collider comment is not exported, skip
    }
    // ---- trees (under roads so edges stay clean)
    for (const [x, z, r] of trees) pine(g, x, z, r);
    // ---- the lake (LAKE ellipse), pier (lakeside.js pierRect), promenade path
    g.fillStyle = COL.shore; g.beginPath(); g.ellipse(LK.center.x, LK.center.z, LK.rx + 0.22, LK.rz + 0.22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.ice; g.beginPath(); g.ellipse(LK.center.x, LK.center.z, LK.rx, LK.rz, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.strokeStyle = COL.iceHi; g.lineWidth = 0.14;
    for (const [dx, dz, w] of [[-1.6, -1.2, 1.4], [0.6, -0.4, 2.0], [1.2, 1.3, 1.1]]) { g.beginPath(); g.moveTo(LK.center.x + dx, LK.center.z + dz); g.lineTo(LK.center.x + dx + w, LK.center.z + dz - w * 0.28); g.stroke(); }
    g.restore();
    path(g, prom, 0.7, false);
    g.fillStyle = COL.wood; g.fillRect(9.5, LK.pier.z - 0.31, 2.8, 0.62);
    g.strokeStyle = COL.woodDark; g.lineWidth = 0.04;
    for (let x = 9.8; x < 12.3; x += 0.35) { g.beginPath(); g.moveTo(x, LK.pier.z - 0.31); g.lineTo(x, LK.pier.z + 0.31); g.stroke(); }
    // Ferris wheel seen from above (lakeside.js buildFerris(18.3, −3.7); collider x 17.25…19.75, z −4.2…−3.2) + booth
    g.fillStyle = '#f2e6cf'; roundRect(g, 17.25, -4.2, 2.5, 1.0, 0.2); g.fill();
    g.strokeStyle = COL.thread; g.lineWidth = 0.07; g.stroke();
    g.fillStyle = COL.thread; roundRect(g, 19.25, -3.75, 0.6, 0.6, 0.1); g.fill();
    // cocoa hut (12.8, −5.4), 1.4 × 1.12
    house(g, 12.8, -5.4, 1.4, 1.12, '#e9c9a3', COL.woodDark);
    // ---- roads: the exact strips from ground.js buildRoads
    const strips = [[-8.4, -7.4, 8.4, -5.6], [-8.4, 5.6, 8.4, 7.4], [-8.4, -5.6, -6.6, 5.6], [6.6, -5.6, 8.4, 5.6],
      [-8.6, -0.8, -8.4, 0.8], [-20.5, -0.8, -8.6, 0.8], [8.4, -0.7, 9.6, 0.7], [-0.7, -7.75, 0.7, -7.4], [-0.7, 7.4, 0.7, 8.2]];
    g.fillStyle = COL.roadEdge;
    for (const [x0, z0, x1, z1] of strips) g.fillRect(x0 - 0.06, z0 - 0.06, x1 - x0 + 0.12, z1 - z0 + 0.12);
    g.fillStyle = COL.road;
    for (const [x0, z0, x1, z1] of strips) g.fillRect(x0, z0, x1 - x0, z1 - z0);
    // residential pavements
    g.fillStyle = COL.pavement;
    g.fillRect(-20.5, 0.8, 11.9, 1.18); g.fillRect(-20.5, -1.98, 11.9, 1.18);
    // ---- market plaza: cream square, candy-stripe border, brick ring round the tree
    g.fillStyle = COL.plaza; g.fillRect(-6.6, -5.6, 13.2, 11.2);
    g.save(); g.lineWidth = 0.34; g.strokeStyle = COL.thread; g.setLineDash([0.36, 0.36]);
    g.strokeRect(-6.43, -5.43, 12.86, 10.86); g.restore();
    const T = L.MARKET.tree;
    g.strokeStyle = COL.brick; g.lineWidth = 0.22; g.beginPath(); g.arc(T.x, T.z, 1.25, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = COL.pine; g.lineWidth = 0.14; g.beginPath(); g.arc(T.x, T.z, 0.95, 0, Math.PI * 2); g.stroke();
    // landing rug, stalls (facing the centre), carousel disc, Advent board
    g.fillStyle = 'rgba(184,48,45,0.18)'; roundRect(g, L.MARKET.landing.x - 1.5, L.MARKET.landing.z - 1, 3, 2, 0.3); g.fill();
    for (const s of L.MARKET.stalls) {
      g.save(); g.translate(s.x, s.z); g.rotate(-Math.atan2(-s.x, -s.z));
      g.fillStyle = '#fff'; g.fillRect(-0.6, -0.45, 1.2, 0.9);
      g.fillStyle = COL.thread; for (let i = 0; i < 3; i++) g.fillRect(-0.6 + i * 0.4, -0.45, 0.2, 0.9);
      g.restore();
    }
    const C0 = L.MARKET.carousel;
    g.fillStyle = '#f6d58a'; g.beginPath(); g.arc(C0.x, C0.z, 1.0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = COL.thread; g.lineWidth = 0.08; g.setLineDash([]);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.moveTo(C0.x, C0.z); g.lineTo(C0.x + Math.cos(a), C0.z + Math.sin(a)); g.stroke(); }
    // ---- tram rails: the tram loop ± 0.17 (ground.js)
    const [ax, az] = [Math.abs(L.TRAM_LOOP[0][0]), Math.abs(L.TRAM_LOOP[0][1])];
    g.strokeStyle = COL.rail; g.lineWidth = Math.max(0.05, 1.1 * px);
    for (const off of [-0.17, 0.17]) g.strokeRect(-(ax + off), -(az + off), 2 * (ax + off), 2 * (az + off));
    // zebra crossings
    g.fillStyle = COL.zebra;
    for (const [x, z] of L.CROSSINGS) {
      const alongX = Math.abs(z) > 5 || Math.abs(x) > 9, width = Math.abs(x) > 9 ? 1.6 : 1.8;
      for (let i = 0; i < 5; i++) {
        const o = -width / 2 + 0.2 + (i * (width - 0.4)) / 4;
        if (alongX) g.fillRect(x - 0.31, z + o - 0.08, 0.62, 0.16); else g.fillRect(x + o - 0.08, z - 0.31, 0.16, 0.62);
      }
    }
    // ---- park: paths (park.js pathGeos: loop w 0.62, spine w 0.7), gazebo, gate arch, Reindeer Rest
    path(g, park, 0.62, true);
    path(g, [[0, 7.6], [0, 15.9]], 0.7, false);
    g.fillStyle = COL.wood; g.beginPath(); octagon(g, 3.0, 11.6, 0.8); g.fill();
    g.fillStyle = '#f5ead7'; g.beginPath(); octagon(g, 3.0, 11.6, 0.55); g.fill();
    const GT = L.GATE;
    g.strokeStyle = COL.thread; g.lineWidth = 0.22;
    g.beginPath(); g.moveTo(GT.x - GT.width / 2, GT.z); g.lineTo(GT.x + GT.width / 2, GT.z); g.stroke();
    g.fillStyle = COL.woodDark; for (const s of [-1, 1]) { g.beginPath(); g.arc(GT.x + s * GT.width / 2, GT.z, 0.22, 0, Math.PI * 2); g.fill(); }
    const RR = L.REINDEER.rest;
    g.save(); g.translate(RR.x, RR.z); g.rotate(-RR.heading); house(g, 0, 0, 1.2, 0.9, '#c9a27a', COL.woodDark); g.restore();
    // ---- Holly Lane townhouses (residential.js: 1.5 × 1.3 at houseXs on both rows) — your cottage = HOUSE
    const hs = opts.residentialHouses?.length ? opts.residentialHouses : L.RESIDENTIAL.houseXs.flatMap((x) => [{ x, z: L.RESIDENTIAL.rowNorthZ }, { x, z: L.RESIDENTIAL.rowSouthZ }]);
    hs.forEach((h, i) => house(g, h.x, h.z, 1.5, 1.3, WALLS[i % WALLS.length], ROOFS[i % ROOFS.length]));
    // ---- fog over districts not revealed yet (pop-up book still folded)
    const fr = mulberry32(3);
    for (const d of L.DISTRICTS) {
      if (revealed.has(d.id)) continue;
      const [x0, z0, x1, z1] = d.rect;
      g.save();
      g.fillStyle = COL.fog; g.globalAlpha = 0.94;
      roundRect(g, x0 + 0.1, z0 + 0.1, x1 - x0 - 0.2, z1 - z0 - 0.2, 0.9); g.fill();
      g.globalAlpha = 1; g.clip();
      g.fillStyle = COL.fogDot;
      for (let x = x0 + 0.4; x < x1; x += 0.7) for (let z = z0 + 0.4; z < z1; z += 0.7) { g.beginPath(); g.arc(x + (fr() - 0.5) * 0.2, z + (fr() - 0.5) * 0.2, 0.07, 0, Math.PI * 2); g.fill(); }
      g.restore();
      g.save(); g.strokeStyle = '#b3a48c'; g.lineWidth = 0.08; g.setLineDash([0.24, 0.2]);
      roundRect(g, x0 + 0.3, z0 + 0.3, x1 - x0 - 0.6, z1 - z0 - 0.6, 0.7); g.stroke(); g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return canvas;
  }

  function path(g, pts, w, closed) {
    if (!pts.length) return;
    g.save(); g.setLineDash([]);
    const run = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (closed) g.closePath(); g.stroke(); };
    g.strokeStyle = COL.pathEdge; g.lineWidth = w + 0.12; run();
    g.strokeStyle = COL.path; g.lineWidth = w; run();
    g.restore();
  }
  return { canvas, bounds, build, toPx, get scale() { return S; }, inLake };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function octagon(g, x, z, r) {
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; const fn = k ? 'lineTo' : 'moveTo'; g[fn](x + Math.cos(a) * r, z + Math.sin(a) * r); }
  g.closePath();
}
function pine(g, x, z, r) {
  g.fillStyle = 'rgba(60,80,60,0.18)'; g.beginPath(); g.ellipse(x + r * 0.25, z + r * 0.3, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = COL.pine; g.beginPath(); g.arc(x, z, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = COL.pineDark; g.beginPath(); g.arc(x - r * 0.25, z + r * 0.2, r * 0.45, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - r * 0.3, z - r * 0.35, r * 0.22, 0, Math.PI * 2); g.fill();
}
function house(g, x, z, w, d, wall, roof) {
  g.fillStyle = 'rgba(60,40,30,0.18)'; g.fillRect(x - w / 2 + 0.1, z - d / 2 + 0.12, w, d);
  g.fillStyle = roof; g.fillRect(x - w / 2, z - d / 2, w, d);
  g.fillStyle = wall; g.fillRect(x - w / 2 + 0.12, z - d / 2 + 0.12, w - 0.24, d - 0.24);
  g.strokeStyle = roof; g.lineWidth = 0.06; g.beginPath(); g.moveTo(x - w / 2 + 0.12, z); g.lineTo(x + w / 2 - 0.12, z); g.stroke();
}
