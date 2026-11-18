// Tinselby city — static knitted world built district by district, with pop-up book reveal.
// See CONTRACTS.md §City for the API returned by buildCity(ctx).
import * as THREE from 'three';
import { RevealGroup, Lights } from './reveal.js';
import { merge, mulberry32, GLOW, lampSpots } from './kit.js';
import { buildBook, buildGroundTiles, buildRoads } from './ground.js';
import { buildMarket } from './market.js';
import { buildResidential } from './residential.js';
import { buildPark } from './park.js';
import { buildLakeside } from './lakeside.js';
import { buildHill } from './hill.js';
import { buildCableCar } from './cablecar.js';
import { buildFestive } from './festive.js';

const GROUP_IDS = ['market', 'residential', 'park', 'lakeside', 'hill', 'streets'];
const CELL = 9;

export function buildCity(ctx) {
  const { engine, game, colliders, layout } = ctx;
  const lights = new Lights();
  const G = {};
  for (const id of GROUP_IDS) {
    const d = layout.DISTRICTS.find((x) => x.id === id);
    const g = new RevealGroup(id, d ? d.center : [0, 0], lights);
    const cells = new Map();
    G[id] = {
      group: g, ground: g.batch({ cast: false, name: 'ground' }),
      /** Spatial cells so the main and shadow cameras can cull far parts of a district. */
      cell(x, z) {
        const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
        let c = cells.get(k);
        if (!c) { c = { props: g.batch({ cast: true, name: 'props' + k }), deco: g.batch({ cast: false, name: 'deco' + k }) }; cells.set(k, c); }
        return c;
      },
    };
    Object.defineProperty(G[id], 'props', { get() { const d = layout.DISTRICTS.find((x) => x.id === id); const c = d ? d.center : [0, 0]; return G[id].cell(c[0], c[1]).props; } });
  }

  // tiny parts (beads, trims, berries) don't need to cast shadows: keeps the shadow pass cheap. Same for flat parts
  // lying on the ground (mats, trays, plinth slabs): their shadow falls under themselves.
  const small = (g) => {
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    if (b.max.y - b.min.y < 0.05 && b.max.y < 0.12) return true;
    return Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 0.14;
  };
  // ---------------------------------------------------------------- shared build context
  const keepSegs = [], keepCircles = [];
  const K = {
    ctx, engine, game, colliders, layout, lights, G, merge, THREE,
    rnd: mulberry32(2027),
    /** Which reveal group owns a ground point. */
    groupAt(x, z) {
      const d = layout.districtAt(x, z);
      if (d !== 'streets') return d;
      if (Math.abs(x) < 9.6 && Math.abs(z) < 8.4) return 'streets';
      let best = 'park', bd = 1e9;
      for (const dd of layout.DISTRICTS) {
        const [x0, z0, x1, z1] = dd.rect;
        const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
        const dist = Math.hypot(dx, dz);
        if (dist < bd) { bd = dist; best = dd.id; }
      }
      return best;
    },
    /** Add a static prop (array of world-space geos) to a group. Returns the batch (more parts can be .add()ed, e.g. lights). */
    prop(gid, anchor, geos, opts = {}) {
      const cell = G[gid].cell(anchor[0], anchor[2]);
      const castB = opts.cast === false ? cell.deco : cell.props, glowB = cell.deco;
      const begun = new Set();
      const ref = {
        props: [],
        add(gs, light) {
          for (const g of [gs].flat(3)) {
            if (!g) continue;
            const b = g.attributes.aMat.array[0] === GLOW || g.userData.noCast || small(g) ? glowB : castB;
            if (!begun.has(b)) { b.begin(anchor, opts); begun.add(b); ref.props.push(b.cur); }
            b.add(g, light);
          }
          return ref;
        },
      };
      return ref.add(geos);
    },
    keepSeg(ax, az, bx, bz, r) { keepSegs.push([ax, az, bx, bz, r]); },
    keepCircle(x, z, r) { keepCircles.push([x, z, r]); },
    /** True if a prop of radius r at (x,z) stays clear of roads, paths, landmarks. */
    free(x, z, r = 0.3) {
      const W = layout.WORLD;
      if (x < W.minX + r || x > W.maxX - r || z < W.minZ + r || z > W.maxZ - r) return false;
      for (const [cx, cz, cr] of keepCircles) if (Math.hypot(x - cx, z - cz) < cr + r) return false;
      for (const [ax, az, bx, bz, sr] of keepSegs) {
        const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / l2)) : 0;
        if (Math.hypot(x - ax - abx * t, z - az - abz * t) < sr + r) return false;
      }
      const lk = layout.LAKE;
      if (((x - lk.center.x) / (lk.rx + 0.5)) ** 2 + ((z - lk.center.z) / (lk.rz + 0.5)) ** 2 < 1) return false;
      return true;
    },
    /** Scatter n items with fn(x,z,i) inside rect, respecting free(). */
    scatter(rect, n, r, fn, tries = 30) {
      let placed = 0;
      for (let i = 0; i < n * tries && placed < n; i++) {
        const x = rect[0] + K.rnd() * (rect[2] - rect[0]), z = rect[1] + K.rnd() * (rect[3] - rect[1]);
        if (!K.free(x, z, r)) continue;
        fn(x, z, placed++);
        K.keepCircle(x, z, r * 0.8);
      }
      return placed;
    },
    updates: [],
  };

  // keep-out: roads, walk loops, crossings, task spots
  for (const r of layout.ROADS) {
    const pts = r.pts, n = r.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; K.keepSeg(a[0], a[1], b[0], b[1], r.width / 2 + 0.25); }
  }
  for (const w of layout.WALK_LOOPS) {
    const pts = w.pts, n = w.pingpong ? pts.length - 1 : pts.length;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; K.keepSeg(a[0], a[1], b[0], b[1], 0.42); }
  }
  const M = layout.MARKET, R = layout.RESIDENTIAL, PK = layout.PARK, LK = layout.LAKE, H = layout.HILL;
  for (const p of [PK.giver, PK.bauble, PK.snowmanSpot, LK.giver, H.giver, H.starSpot, R.giver]) K.keepCircle(p.x, p.z, 0.6);
  K.keepCircle(layout.SPAWN.x, layout.SPAWN.z, 0.8);
  K.keepCircle(M.landing.x, M.landing.z, 1.9);
  K.keepCircle(M.tree.x, M.tree.z, 1.3);
  for (let i = 0; i < H.sledLanes.length; i += 2) { const a = H.sledLanes[i], b = H.sledLanes[i + 1]; K.keepSeg(a[0], a[1], b[0], b[1], 0.55); }
  K.keepSeg(H.cableBase.x, H.cableBase.z, H.cableTop.x, H.cableTop.z, 0.9);

  // ---------------------------------------------------------------- build
  buildBook(K);
  buildGroundTiles(K);
  buildRoads(K);
  const market = buildMarket(K);
  const residential = buildResidential(K);
  const park = buildPark(K);
  const lakeside = buildLakeside(K);
  buildHill(K);
  const cableCar = buildCableCar(K);
  buildFestive(K);

  for (const id of GROUP_IDS) G[id].group.finalize(engine.mat, engine.scene);
  lights.capture();
  for (const h of residential.houses) h.setLights(h.lit);
  if (K.hillSlope?.mesh) colliders.groundMeshes.push(K.hillSlope.mesh);

  // ---------------------------------------------------------------- warm light pools on the snow
  // Lamps, doorways, stalls and the big tree spill soft lantern light on the ground: additive decals, one instanced
  // mesh per district (hidden until that district has popped up). No real lights, so it stays cheap on phones.
  const pools = buildPools();
  function buildPools() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cg = cv.getContext('2d');
    const grd = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.62)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = grd;
    cg.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const pmat = new THREE.MeshBasicMaterial({ map: tex, color: '#ffae5c', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const spots = {}; // gid → [x, y, z, radius, strength]
    const add = (x, y, z, r, k = 1) => { const gid = K.groupAt(x, z); (spots[gid] ||= []).push([x, Math.max(y, 0.07) + 0.022, z, r, k]); };
    for (const [x, y, z, sc] of lampSpots) add(x, y, z, 1.55 * sc, 1);
    for (const h of residential.houses) add(h.door[0], 0.07, h.door[1], 1.15, 0.7);
    for (const st of M.stalls) { const d = Math.hypot(st.x, st.z) || 1; add(st.x - (st.x / d) * 0.75, 0.07, st.z - (st.z / d) * 0.75, 1.5, 0.8); }
    add(M.tree.x, 0.07, M.tree.z, 3.3, 0.9);
    add(M.carousel.x, 0.07, M.carousel.z, 2.5, 0.7);
    const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v0 = new THREE.Vector3(), s0 = new THREE.Vector3(), c0 = new THREE.Color();
    const out = [];
    for (const gid of Object.keys(spots)) {
      const list = spots[gid];
      const im = new THREE.InstancedMesh(quad, pmat, list.length);
      list.forEach(([x, y, z, r, k], i) => { im.setMatrixAt(i, m4.compose(v0.set(x, y, z), q0, s0.set(r, 1, r))); im.setColorAt(i, c0.setScalar(k)); });
      im.frustumCulled = false; im.renderOrder = 2; im.name = 'city-pools-' + gid;
      engine.scene.add(im);
      out.push({ im, group: G[gid].group });
    }
    return { list: out, mat: pmat };
  }

  // ---------------------------------------------------------------- walk physics: heights
  const inRect = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  const pier = lakeside.pierRect;
  const pavements = [[-20.5, 0.8, -8.6, 1.98], [-20.5, -1.98, -8.6, -0.8], [-6.6, -5.6, 6.6, 5.6]];
  const W = layout.WORLD;
  colliders.addHeightFn((x, z) => {
    if (inRect(x, z, pier)) return 0.15;
    if (lakeside.isIce(x, z)) return 0.05;
    for (const p of pavements) if (inRect(x, z, p)) return 0.06;
    if (x > W.minX && x < W.maxX && z > W.minZ && z < W.maxZ) return 0.035;
    return null;
  });
  colliders.addHeightFn((x, z) => (x >= -8.5 && x <= 9 && z <= -7.6 ? H.heightAt(x, z) + 0.03 : null));

  // ---------------------------------------------------------------- state & API
  const revealed = new Set(GROUP_IDS);
  for (const id of GROUP_IDS) {
    G[id].group.onRevealed = (gid) => {
      revealed.add(gid);
      if (gid !== 'streets') game.emit('district:revealed', { id: gid });
    };
  }
  const now = () => engine.time;
  function revealDistrict(id, instant = false) {
    const g = G[id]?.group;
    if (!g) return;
    if (id !== 'streets' && G.streets.group.state !== 'shown') revealDistrict('streets', instant);
    if (g.state === 'shown') return;
    g.reveal(now(), instant);
  }
  function foldAll(instant = false) {
    for (const id of GROUP_IDS) { revealed.delete(id); G[id].group.fold(now(), instant); }
  }

  let festive = -1;
  function setFestive(level) {
    level = Math.max(0, Math.min(4, Math.round(level)));
    if (level === festive) return;
    festive = level;
    for (let i = 1; i <= 4; i++) lights.set('festive' + i, level >= i ? 1 : 0);
    market.tree.setLights(Math.min(1, 0.7 + level * 0.075));
  }
  setFestive(0);

  game.on('district:enter', ({ id }) => { if (G[id]) revealDistrict(id); });
  game.on('game:start', () => foldAll(false));
  game.on('spirit:change', ({ value }) => setFestive(value));

  engine.addUpdate((dt, t) => {
    for (const id of GROUP_IDS) G[id].group.update(t);
    for (const fn of K.updates) fn(dt, t);
    for (const p of pools.list) p.im.visible = p.group.state === 'shown';
    // light pools only read once it gets dark (time of day); festive progress makes them a little stronger
    pools.mat.opacity = (0.3 + 0.26 * engine._evening) * engine.env.lamp;
    for (const p of pools.list) if (engine.env.lamp < 0.02) p.im.visible = false;
  }, 5);

  return {
    revealDistrict,
    foldAll,
    setFestive,
    isRevealed: (id) => revealed.has(id) && G[id]?.group.state === 'shown',
    residential,
    tree: market.tree,
    cableCar,
    lake: { isIce: lakeside.isIce, center: new THREE.Vector3(LK.center.x, 0.05, LK.center.z) },
    landing: new THREE.Vector3(M.landing.x, 0.06, M.landing.z),
    groups: G,
  };
}
