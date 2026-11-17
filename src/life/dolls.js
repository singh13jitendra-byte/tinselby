// Instanced knitted dolls: every NPC in the city is drawn by a handful of InstancedMeshes
// (coat, head, hat, brim + pom-pom, gnome hat, beard, scarf, arms, mittens, legs, skate blades, gift). Behaviours write a simple pose
// on each doll object; the pool turns poses into packed instance matrices for the visible ones.
import * as THREE from 'three';
import { P, KNIT, FELT, GLOSS, SW, SH, part, boxUV, xf, merge } from '../core/yarn.js';

const TAU = Math.PI * 2;
const W = '#ffffff';
const K = 0.9; // design units → world (same chibi proportions as the player doll in core/player.js)
const g = (geo, c, k = KNIT, uv = [3, 2]) => part(geo, c, k, uv);
const sp = (r, ws, hs, c, k = FELT) => g(new THREE.SphereGeometry(r, ws, hs), c, k, [(TAU * r) / SW, (Math.PI * r) / SH]);
const cy = (rt, rb, h, seg, c, k = KNIT, open = false) => g(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c, k, [(TAU * Math.max(rt, rb)) / SW, h / SH]);
const to = (R, r, rs, ts, c, k = KNIT, arc = TAU) => g(new THREE.TorusGeometry(R, r, rs, ts, arc), c, k, [(R * arc) / SW, (TAU * r) / SH]);
const bx = (w, h, d, c, k = KNIT) => part(boxUV(new THREE.BoxGeometry(w, h, d)), c, k);
const HX = Math.PI / 2;
const fin = (parts) => { const m = merge(parts); m.scale(K, K, K); return m; };

// Chibi knitted doll in instanced pieces. Everything tinted per instance is modelled white / grey.
function buildGeos() {
  const coat = fin([ // tint: coat
    xf(cy(0.052, 0.083, 0.125, 10, W), [0, 0.128, 0]),
    xf(cy(0.088, 0.088, 0.022, 10, '#d6d6d6', KNIT, true), [0, 0.074, 0]), // rolled hem
    xf(bx(0.016, 0.112, 0.006, '#cfcfcf'), [0, 0.128, 0.0685], [-0.24, 0, 0]), // button placket
  ]);
  const head = fin([ // untinted: big felt head, bead eyes, rosy cheeks, smile, hair peeking out at the back
    xf(sp(0.085, 12, 8, P.skin), [0, 0.265, 0]),
    xf(sp(0.0098, 5, 4, P.ink, GLOSS), [-0.03, 0.268, 0.0795]),
    xf(sp(0.0098, 5, 4, P.ink, GLOSS), [0.03, 0.268, 0.0795]),
    xf(sp(0.016, 5, 3, '#e9938f'), [-0.052, 0.246, 0.0625], [0, -0.65, 0], [1, 0.7, 0.35]),
    xf(sp(0.016, 5, 3, '#e9938f'), [0.052, 0.246, 0.0625], [0, 0.65, 0], [1, 0.7, 0.35]),
    xf(to(0.015, 0.003, 3, 4, P.ink, FELT, 2.1), [0, 0.256, 0.084], [0, 0, -HX - 1.05]),
    xf(sp(0.089, 8, 5, '#7a4a2c', KNIT), [0, 0.268, -0.013]),
  ]);
  const hat = fin([ // tint: hat — tall ribbed beanie dome
    xf(g(new THREE.SphereGeometry(0.093, 10, 4, 0, TAU, 0, HX), W, KNIT, [8, 2.5]), [0, 0.3, -0.006], [-0.1, 0, 0], [1, 1.1, 1]),
  ]);
  const pom = fin([ // tint: accent — chunky rolled brim + big pom-pom
    xf(to(0.09, 0.019, 5, 11, W), [0, 0.306, -0.005], [HX - 0.1, 0, 0]),
    xf(sp(0.045, 7, 5, W), [0, 0.434, -0.02]),
    xf(sp(0.024, 4, 3, '#ececec'), [0.032, 0.447, -0.02]),
    xf(sp(0.024, 4, 3, '#ececec'), [-0.028, 0.453, -0.006]),
    xf(sp(0.024, 4, 3, '#ececec'), [-0.006, 0.447, -0.052]),
  ]);
  const ghat = fin([ // tint: gnome hat — tall floppy knit cone pulled down over the eyes, striped band, pom on the tip
    xf(to(0.091, 0.019, 5, 11, '#d2d2d2'), [0, 0.27, 0], [HX, 0, 0]),
    xf(cy(0.046, 0.095, 0.13, 10, W, KNIT, true), [0, 0.335, 0]),
    xf(cy(0.07, 0.083, 0.03, 10, '#b9b9b9', KNIT, true), [0, 0.317, 0]),
    xf(cy(0.053, 0.064, 0.024, 10, '#b9b9b9', KNIT, true), [0, 0.366, 0]),
    xf(g(new THREE.ConeGeometry(0.052, 0.17, 9, 1, true), W, KNIT, [4, 3]), [0, 0.375 + 0.085 * Math.cos(0.4), -0.085 * Math.sin(0.4)], [-0.4, 0, 0]),
    xf(sp(0.026, 6, 4, '#e6e6e6', FELT), [0, 0.375 + 0.172 * Math.cos(0.4), -0.172 * Math.sin(0.4)]),
  ]);
  const beard = fin([ // untinted
    xf(sp(0.07, 8, 6, P.snow), [0, 0.2, 0.04], null, [1.05, 1.2, 0.72]),
    xf(sp(0.03, 5, 4, P.snow), [-0.04, 0.236, 0.07]),
    xf(sp(0.03, 5, 4, P.snow), [0.04, 0.236, 0.07]),
    xf(sp(0.025, 6, 4, '#e9a290'), [0, 0.248, 0.094]),
  ]);
  const tail = (pos, rot, len) => [bx(0.038, len, 0.016, W), xf(bx(0.012, 0.024, 0.012, '#c8c8c8'), [-0.012, -len / 2 - 0.01, 0]), xf(bx(0.012, 0.024, 0.012, '#c8c8c8'), [0.012, -len / 2 - 0.01, 0])]
    .map((p) => xf(xf(p, [0, -len / 2, 0]), pos, rot));
  const scarf = fin([ // tint: scarf — chunky ring, fringed tails front and back, plus the coat buttons
    xf(to(0.058, 0.024, 5, 10, W), [0, 0.193, 0], [HX, 0, 0]),
    xf(sp(0.024, 5, 3, W, KNIT), [0.046, 0.186, 0.052]),
    ...tail([0.045, 0.186, 0.066], [-0.22, 0, 0.14], 0.085),
    ...tail([-0.03, 0.2, -0.062], [1.05, 0, -0.25], 0.1),
    xf(sp(0.0098, 4, 3, W, GLOSS), [0, 0.104, 0.079]),
    xf(sp(0.0098, 4, 3, W, GLOSS), [0, 0.146, 0.069]),
  ]);
  const arm = fin([ // tint: coat
    sp(0.022, 5, 3, W, KNIT),
    xf(cy(0.02, 0.025, 0.072, 6, W, KNIT, true), [0, -0.036, 0]),
  ]);
  const mitt = fin([ // tint: mittens
    xf(cy(0.028, 0.028, 0.016, 6, '#d8d8d8', KNIT, true), [0, -0.072, 0]),
    xf(sp(0.028, 6, 4, W, KNIT), [0, -0.094, 0], null, [1, 1.12, 1]),
    xf(sp(0.012, 4, 2, W, KNIT), [0, -0.088, 0.024]),
  ]);
  const leg = fin([ // tint: trousers; the chunky boot is a darker shade with a pale cuff
    xf(cy(0.023, 0.023, 0.05, 6, W, KNIT, true), [0, -0.022, 0]),
    xf(cy(0.03, 0.03, 0.014, 6, '#f2f2f2', FELT, true), [0, -0.036, 0.003]),
    xf(sp(0.031, 7, 4, '#8f7466'), [0, -0.05, 0.012], null, [1, 0.8, 1.38]),
  ]);
  const skate = fin([ // untinted: little steel blades under the boots (skaters only), curled up at the toe
    xf(bx(0.007, 0.012, 0.1, '#dfe7ec', GLOSS), [0, -0.089, 0.012]),
    xf(bx(0.007, 0.012, 0.03, '#dfe7ec', GLOSS), [0, -0.08, 0.072], [-0.9, 0, 0]),
    xf(bx(0.01, 0.014, 0.012, '#9aa4ab', GLOSS), [0, -0.078, -0.014]),
    xf(bx(0.01, 0.014, 0.012, '#9aa4ab', GLOSS), [0, -0.078, 0.04]),
  ]);
  const gift = merge([
    g(new THREE.BoxGeometry(0.08, 0.074, 0.064), W),
    g(new THREE.BoxGeometry(0.084, 0.078, 0.016), '#fff2b0', FELT),
    g(new THREE.BoxGeometry(0.016, 0.078, 0.068), '#fff2b0', FELT),
    xf(g(new THREE.SphereGeometry(0.015, 5, 3), '#fff2b0', FELT), [-0.013, 0.045, 0], null, [1.3, 0.8, 0.8]),
    xf(g(new THREE.SphereGeometry(0.015, 5, 3), '#fff2b0', FELT), [0.013, 0.045, 0], null, [1.3, 0.8, 0.8]),
  ]);
  return { coat, head, hat, pom, ghat, beard, scarf, arm, mitt, leg, skate, gift };
}

// Warm Christmas yarn palette: red, cream, mustard, teal, sage, brown, grey.
const C = { red: '#b5332e', deepRed: '#8f2a28', cream: '#ecdcc0', snow: '#f5f1ea', mustard: '#d59f3c', teal: '#4b8f8b', sage: '#8fae86', pine: '#4f7a58', brown: '#8a5a3c', tan: '#b98a62', grey: '#9a9a9c', blueGrey: '#7b93a8', rose: '#d99a94' };
export const PALETTE = {
  coat: [C.red, C.cream, C.mustard, C.teal, C.sage, C.brown, C.grey, C.red, C.deepRed, C.tan, C.blueGrey, C.pine, C.cream, C.rose],
  hat: [C.red, C.cream, C.mustard, C.teal, C.sage, C.grey, C.brown, C.blueGrey, C.deepRed, C.red, C.pine, C.rose],
  scarf: [C.red, C.cream, C.snow, C.mustard, C.teal, C.sage, C.pine, C.tan, C.rose],
  mitt: [C.cream, C.brown, C.snow, C.red, C.mustard, C.tan],
  legs: ['#7d7f88', '#5b6d8c', '#8a6248', '#5c5654', '#b9ab92', '#6f7f6a'],
  gift: [C.red, C.pine, C.mustard, C.teal, C.snow, C.rose],
  gnomeHat: [C.red, C.teal, C.mustard, C.sage, C.blueGrey, C.deepRed],
};

const m0 = new THREE.Matrix4(), bodyL = new THREE.Matrix4(), bodyW = new THREE.Matrix4();
const headL = new THREE.Matrix4(), headW = new THREE.Matrix4(), tmpL = new THREE.Matrix4(), tmpW = new THREE.Matrix4();
const eul = new THREE.Euler();
const stackScale = new THREE.Vector3(0.78, 0.8, 0.78);
const cp = (src, so, dst, to, n) => { for (let i = 0; i < n; i++) dst[to + i] = src[so + i]; }; // allocation-free matrix copy

/** Doll pool. create(opts) → doll; update(dt, t, focus, radius) packs visible dolls into the instanced meshes. */
export function createDollPool(engine, max = 110) {
  const geos = buildGeos();
  const meshes = {};
  const mk = (name, geo, count, tint, shadow) => {
    const m = new THREE.InstancedMesh(geo, engine.mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tint) { m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.count = 0;
    m.name = 'life-' + name;
    engine.scene.add(m);
    meshes[name] = m;
    return m;
  };
  mk('coat', geos.coat, max, true, true);
  mk('head', geos.head, max, false, true);
  mk('hat', geos.hat, max, true, false);
  mk('pom', geos.pom, max, true, false);
  mk('ghat', geos.ghat, 24, true, false);
  mk('beard', geos.beard, 24, false, false);
  mk('scarf', geos.scarf, max, true, false);
  mk('arm', geos.arm, max * 2, true, false);
  mk('mitt', geos.mitt, max * 2, true, false);
  mk('leg', geos.leg, max * 2, true, false);
  mk('skate', geos.skate, 24, false, false);
  mk('gift', geos.gift, 64, true, false);

  const dolls = [];
  let prevSig = [];
  const cTmp = new THREE.Color();

  function create(o = {}) {
    const rnd = o.rnd || Math.random;
    const pickC = (arr) => new THREE.Color(arr[Math.floor(rnd() * arr.length)]);
    const d = {
      id: dolls.length, district: o.district || 'market', gnome: !!o.gnome, active: true, vis: false,
      x: 0, y: 0, z: 0, yaw: 0, s: o.scale ?? 1, pop: 1,
      phase: rnd() * TAU, amp: 0, pitch: 0, lean: 0, sway: 0, bob: 0, sit: 0, headYaw: 0, hop: 0,
      armMode: 'swing', aLx: 0, aLz: 0, aRx: 0, aRz: 0, hold: 0,
      legMode: 'walk', lLx: 0, lRx: 0,
      gift: false, skates: !!o.skates, holdSpread: o.holdSpread ?? 0.1, cheerT: 0, cheerDelay: 0, stagger: rnd() * 0.7, gather: null, alwaysVis: false,
      col: {
        coat: o.coat ? new THREE.Color(o.coat) : pickC(PALETTE.coat),
        hat: o.hat ? new THREE.Color(o.hat) : pickC(o.gnome ? PALETTE.gnomeHat : PALETTE.hat),
        scarf: o.scarfC ? new THREE.Color(o.scarfC) : pickC(PALETTE.scarf),
        pom: pickC(PALETTE.hat),
        mitt: pickC(PALETTE.mitt),
        legs: pickC(PALETTE.legs),
        gift: pickC(PALETTE.gift),
        gift2: pickC(PALETTE.gift),
      },

    };
    if (d.col.hat.equals(d.col.coat)) d.col.hat.set(PALETTE.hat[(PALETTE.hat.findIndex((c) => d.col.hat.equals(new THREE.Color(c))) + 2 + Math.floor(rnd() * 3)) % 9]);
    if (d.col.scarf.equals(d.col.coat)) d.col.scarf.set(d.col.coat.equals(new THREE.Color(C.cream)) ? C.pine : C.cream);
    if (d.gnome) d.col.pom.copy(d.col.hat);
    else if (d.col.pom.equals(d.col.hat) || rnd() < 0.45) d.col.pom.copy(d.col.scarf.equals(d.col.hat) ? new THREE.Color(C.snow) : d.col.scarf); // brim + pom often match the scarf
    if (d.col.pom.equals(d.col.hat)) d.col.pom.set(d.col.hat.equals(new THREE.Color(C.snow)) ? C.red : C.snow);
    if (d.col.gift2.equals(d.col.gift)) d.col.gift2.set(d.col.gift.equals(new THREE.Color(P.gold)) ? P.red : P.gold);
    dolls.push(d);
    return d;
  }

  function writeDoll(d, idx, t) {
    // root: position + yaw + scale (with pop-in squash)
    const sc = d.s * d.pop;
    const c = Math.cos(d.yaw), sn = Math.sin(d.yaw);
    const te = m0.elements;
    const sy = sc * (d.pop < 1 ? 1 + (1 - d.pop) * 0.6 : 1);
    te[0] = c * sc; te[1] = 0; te[2] = -sn * sc; te[3] = 0;
    te[4] = 0; te[5] = sy; te[6] = 0; te[7] = 0;
    te[8] = sn * sc; te[9] = 0; te[10] = c * sc; te[11] = 0;
    te[12] = d.x; te[13] = d.y + d.hop; te[14] = d.z; te[15] = 1;
    if (d.pitch) { tmpL.makeRotationX(d.pitch); m0.multiply(tmpL); }

    // derived walk cycle
    const sw = Math.sin(d.phase), amp = d.amp;
    const bob = Math.abs(sw) * 0.02 * amp + d.bob;
    const sit = d.sit;
    // body: pivot at the hip (y 0.08)
    eul.set(d.lean, 0, d.sway + sw * 0.07 * amp, 'XYZ');
    bodyL.makeRotationFromEuler(eul);
    let be = bodyL.elements;
    const py = 0.075 * K, ty = bob - sit * 0.045;
    be[12] = -be[4] * py; be[13] = py + ty - be[5] * py; be[14] = -be[6] * py;
    bodyW.multiplyMatrices(m0, bodyL);
    // head turn (pivot at the neck)
    if (d.headYaw !== 0) {
      headL.makeRotationY(d.headYaw); // head sits on the body axis, so no pivot offset is needed
      headW.multiplyMatrices(bodyW, headL);
    } else headW.copy(bodyW);

    const M = meshes;
    bodyW.toArray(M.coat.instanceMatrix.array, idx * 16);
    headW.toArray(M.head.instanceMatrix.array, idx * 16);
    bodyW.toArray(M.scarf.instanceMatrix.array, idx * 16);

    // arms
    let aLx, aLz, aRx, aRz;
    switch (d.armMode) {
      case 'out': aLx = aRx = -0.25 + sw * 0.1 * amp; aLz = aRz = 1.1 + Math.sin(t * 1.3 + d.id) * 0.12; break;
      case 'carry': aLx = aRx = -1.15; aLz = aRz = -0.2; break;
      case 'custom': aLx = d.aLx; aLz = d.aLz; aRx = d.aRx; aRz = d.aRz; break;
      default: aLx = -sw * 0.6 * amp; aRx = sw * 0.6 * amp; aLz = aRz = 0;
    }
    if (d.hold < 0) { aLx = -0.1; aLz = d.holdSpread; } else if (d.hold > 0) { aRx = -0.1; aRz = d.holdSpread; }
    if (d.cheerT > 0 && d.cheerDelay <= 0) {
      const w = Math.sin(t * 11 + d.id) * 0.25;
      aLx = aRx = -0.3; aLz = 2.5 + w; aRz = 2.5 - w;
    }
    for (let side = -1; side <= 1; side += 2) {
      const ax = side < 0 ? aLx : aRx, az = side < 0 ? aLz : aRz;
      eul.set(ax, 0, side * (0.25 + az), 'ZXY');
      tmpL.makeRotationFromEuler(eul);
      const e = tmpL.elements;
      e[12] = side * 0.076 * K; e[13] = 0.178 * K; e[14] = 0;
      tmpW.multiplyMatrices(bodyW, tmpL);
      tmpW.toArray(M.arm.instanceMatrix.array, (idx * 2 + (side > 0 ? 1 : 0)) * 16);
    }
    // legs (hang from the root, not the leaning body)
    let lL, lR;
    if (sit > 0.5) { lL = lR = -1.45; }
    else if (d.legMode === 'custom') { lL = d.lLx; lR = d.lRx; }
    else { lL = sw * 0.7 * amp; lR = -sw * 0.7 * amp; }
    for (let side = -1; side <= 1; side += 2) {
      tmpL.makeRotationX(side < 0 ? lL : lR);
      const e = tmpL.elements;
      e[12] = side * 0.034 * K; e[13] = 0.075 * K + bob * 0.5 - sit * 0.045; e[14] = 0;
      tmpW.multiplyMatrices(m0, tmpL);
      tmpW.toArray(M.leg.instanceMatrix.array, (idx * 2 + (side > 0 ? 1 : 0)) * 16);
    }
  }

  return {
    meshes, dolls, create,
    /** Pack visible dolls. focus: Vector3, radius: cull distance. */
    update(dt, t, focus, radius) {
      const r2 = radius * radius;
      const M = meshes;
      let n = 0, nh = 0, ng = 0, nf = 0, nk = 0;
      let sigChanged = false;
      const sig = prevSig;
      let si = 0;
      for (let i = 0; i < dolls.length; i++) {
        const d = dolls[i];
        if (d.cheerT > 0) {
          if (d.cheerDelay > 0) d.cheerDelay -= dt;
          else { d.cheerT -= dt; d.hop = Math.abs(Math.sin(d.cheerT * 7)) * 0.07 * d.s; if (d.cheerT <= 0) d.hop = 0; }
        }
        if (!d.vis || d.pop <= 0.001) continue;
        if (!d.alwaysVis) { const dx = d.x - focus.x, dz = d.z - focus.z; if (dx * dx + dz * dz > r2) continue; }
        if (n >= M.coat.instanceMatrix.count) break;
        writeDoll(d, n, t);
        const hasGift = d.gift && nf < 62;
        const key = d.id * 3 + (hasGift ? (d.gift === 2 ? 2 : 1) : 0);
        if (sig[si] !== key) { sig[si] = key; sigChanged = true; }
        si++;
        if (d.gnome && ng < 24) {
          const off = n * 16;
          cp(M.head.instanceMatrix.array, off, M.ghat.instanceMatrix.array, ng * 16, 16);
          cp(M.head.instanceMatrix.array, off, M.beard.instanceMatrix.array, ng * 16, 16);
          if (sigChanged) M.ghat.setColorAt(ng, d.col.hat);
          ng++;
        } else {
          const off = n * 16;
          cp(M.head.instanceMatrix.array, off, M.hat.instanceMatrix.array, nh * 16, 16);
          cp(M.head.instanceMatrix.array, off, M.pom.instanceMatrix.array, nh * 16, 16);
          if (sigChanged) { M.hat.setColorAt(nh, d.col.hat); M.pom.setColorAt(nh, d.col.pom); }
          nh++;
        }
        if (d.skates && nk < 23) {
          cp(M.leg.instanceMatrix.array, n * 32, M.skate.instanceMatrix.array, nk * 16, 32);
          nk += 2;
        }
        if (hasGift) {
          // gift held in front of the chest, attached to the body
          tmpL.makeTranslation(0, 0.128, 0.108);
          tmpW.multiplyMatrices(bodyW, tmpL);
          tmpW.toArray(M.gift.instanceMatrix.array, nf * 16);
          if (sigChanged) M.gift.setColorAt(nf, d.col.gift);
          nf++;
          if (d.gift === 2) { // a stack: a smaller second present on top, turned a little
            tmpL.makeRotationY(0.5).scale(stackScale).setPosition(0.004, 0.196, 0.104);
            tmpW.multiplyMatrices(bodyW, tmpL);
            tmpW.toArray(M.gift.instanceMatrix.array, nf * 16);
            if (sigChanged) M.gift.setColorAt(nf, d.col.gift2 || d.col.scarf);
            nf++;
          }
        }
        if (sigChanged) {
          M.coat.setColorAt(n, d.col.coat);
          M.scarf.setColorAt(n, d.col.scarf);
          M.arm.setColorAt(n * 2, d.col.coat); M.arm.setColorAt(n * 2 + 1, d.col.coat);
          M.mitt.setColorAt(n * 2, d.col.mitt); M.mitt.setColorAt(n * 2 + 1, d.col.mitt);
          M.leg.setColorAt(n * 2, d.col.legs); M.leg.setColorAt(n * 2 + 1, d.col.legs);
        }
        n++;
      }
      if (si !== sig.length) { sig.length = si; sigChanged = true; }
      M.coat.count = M.head.count = M.scarf.count = n;
      M.arm.count = M.mitt.count = M.leg.count = n * 2;
      cp(M.arm.instanceMatrix.array, 0, M.mitt.instanceMatrix.array, 0, n * 32);
      M.hat.count = M.pom.count = nh; M.skate.count = nk; M.ghat.count = M.beard.count = ng; M.gift.count = nf;
      for (const k in M) {
        M[k].instanceMatrix.needsUpdate = true;
        if (sigChanged && M[k].instanceColor) M[k].instanceColor.needsUpdate = true;
      }
      return n;
    },
  };
}
