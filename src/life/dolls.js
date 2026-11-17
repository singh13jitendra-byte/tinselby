// Instanced knitted dolls: every NPC in the city is drawn by a handful of InstancedMeshes
// (coat, head, hat, gnome hat, beard, scarf, arms, legs, gift). Behaviours write a simple pose
// on each doll object; the pool turns poses into packed instance matrices for the visible ones.
import * as THREE from 'three';
import { P, KNIT, FELT, GLOSS, part, xf, merge } from '../core/yarn.js';

const TAU = Math.PI * 2;
const W = '#ffffff';
const g = (geo, c, k = KNIT) => part(geo, c, k, [3, 2]);

function buildGeos() {
  const coat = merge([
    xf(g(new THREE.CylinderGeometry(0.05, 0.077, 0.14, 9), W), [0, 0.135, 0]),
    xf(g(new THREE.CylinderGeometry(0.079, 0.079, 0.018, 9, 1, true), '#e8e8e8', FELT), [0, 0.072, 0]), // hem
    xf(g(new THREE.SphereGeometry(0.009, 4, 3), '#f4e2b0', GLOSS), [0, 0.15, 0.064]),
    xf(g(new THREE.SphereGeometry(0.009, 4, 3), '#f4e2b0', GLOSS), [0, 0.118, 0.07]),
  ]);
  const head = merge([
    xf(g(new THREE.SphereGeometry(0.058, 9, 6), P.skin, FELT), [0, 0.265, 0]),
    xf(g(new THREE.SphereGeometry(0.0085, 4, 3), P.ink, GLOSS), [-0.02, 0.272, 0.053]),
    xf(g(new THREE.SphereGeometry(0.0085, 4, 3), P.ink, GLOSS), [0.02, 0.272, 0.053]),
    xf(g(new THREE.SphereGeometry(0.011, 4, 2), P.pink, FELT), [-0.034, 0.254, 0.046], null, [1, 0.7, 0.5]),
    xf(g(new THREE.SphereGeometry(0.011, 4, 2), P.pink, FELT), [0.034, 0.254, 0.046], null, [1, 0.7, 0.5]),
    xf(g(new THREE.SphereGeometry(0.04, 5, 3), '#7a4a2c', KNIT), [0, 0.248, -0.03]), // hair at the back
  ]);
  const hat = merge([
    xf(g(new THREE.SphereGeometry(0.063, 9, 4, 0, TAU, 0, Math.PI / 2), W), [0, 0.274, 0]),
    xf(g(new THREE.CylinderGeometry(0.066, 0.066, 0.024, 9, 1, true), '#d8d8d8'), [0, 0.282, 0]),
    xf(g(new THREE.SphereGeometry(0.025, 6, 4), '#f6f6f6', FELT), [0, 0.346, 0]),
  ]);
  const ghat = merge([
    xf(g(new THREE.ConeGeometry(0.068, 0.19, 9, 1, true), W), [0, 0.375, -0.012], [-0.18, 0, 0]),
    xf(g(new THREE.CylinderGeometry(0.068, 0.068, 0.02, 9, 1, true), '#d0d0d0'), [0, 0.282, 0]),
  ]);
  const beard = merge([
    xf(g(new THREE.SphereGeometry(0.052, 7, 5), P.snow, FELT), [0, 0.22, 0.03], null, [1, 1.15, 0.75]),
    xf(g(new THREE.SphereGeometry(0.021, 6, 4), '#e9a99a', FELT), [0, 0.258, 0.06]),
  ]);
  const scarf = merge([
    xf(g(new THREE.TorusGeometry(0.046, 0.015, 4, 9), W), [0, 0.205, 0], [Math.PI / 2, 0, 0]),
    xf(g(new THREE.BoxGeometry(0.026, 0.07, 0.012), W), [0.03, 0.17, 0.05], [0.2, 0, 0.25]),
  ]);
  const arm = merge([
    xf(g(new THREE.CylinderGeometry(0.016, 0.018, 0.075, 5, 1, true), W), [0, -0.038, 0]),
    xf(g(new THREE.SphereGeometry(0.02, 5, 4), '#e2e2e2', FELT), [0, -0.08, 0]),
  ]);
  const leg = merge([
    xf(g(new THREE.CylinderGeometry(0.017, 0.017, 0.056, 5, 1, true), W), [0, -0.028, 0]),
    xf(g(new THREE.SphereGeometry(0.024, 6, 4), '#4a3a32', FELT), [0, -0.06, 0.008], null, [1, 0.7, 1.3]),
  ]);
  const gift = merge([
    g(new THREE.BoxGeometry(0.075, 0.07, 0.06), W),
    g(new THREE.BoxGeometry(0.079, 0.074, 0.016), '#fff2b0', FELT),
    g(new THREE.BoxGeometry(0.016, 0.074, 0.064), '#fff2b0', FELT),
    xf(g(new THREE.SphereGeometry(0.014, 5, 3), '#fff2b0', FELT), [-0.012, 0.042, 0], null, [1.3, 0.8, 0.8]),
    xf(g(new THREE.SphereGeometry(0.014, 5, 3), '#fff2b0', FELT), [0.012, 0.042, 0], null, [1.3, 0.8, 0.8]),
  ]);
  return { coat, head, hat, ghat, beard, scarf, arm, leg, gift };
}

export const PALETTE = {
  coat: [P.red, P.teal, P.cream, '#d9a23a', P.green, P.blueGrey, P.deepRed, '#c9773a', P.pink, P.pine, '#7d5a8c', P.mint],
  hat: [P.red, P.cream, P.snow, P.green, P.gold, P.teal, P.mint, P.pink, P.deepRed],
  scarf: [P.red, P.green, P.snow, P.gold, P.teal, P.cream, P.pink],
  legs: [P.ink, '#3d4a63', P.woodDark, '#5a5a62', '#6b4a3a'],
  gift: [P.red, P.green, P.gold, P.teal, P.snow, P.pink],
  gnomeHat: [P.teal, P.orange, P.red, P.green, P.blueGrey],
};

const m0 = new THREE.Matrix4(), bodyL = new THREE.Matrix4(), bodyW = new THREE.Matrix4();
const headL = new THREE.Matrix4(), headW = new THREE.Matrix4(), tmpL = new THREE.Matrix4(), tmpW = new THREE.Matrix4();
const eul = new THREE.Euler();
const stackScale = new THREE.Vector3(0.78, 0.8, 0.78);

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
  mk('ghat', geos.ghat, 24, true, false);
  mk('beard', geos.beard, 24, false, false);
  mk('scarf', geos.scarf, max, true, false);
  mk('arm', geos.arm, max * 2, true, false);
  mk('leg', geos.leg, max * 2, true, false);
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
      gift: false, cheerT: 0, cheerDelay: 0, stagger: rnd() * 0.7, gather: null, alwaysVis: false,
      col: {
        coat: o.coat ? new THREE.Color(o.coat) : pickC(PALETTE.coat),
        hat: o.hat ? new THREE.Color(o.hat) : pickC(o.gnome ? PALETTE.gnomeHat : PALETTE.hat),
        scarf: o.scarfC ? new THREE.Color(o.scarfC) : pickC(PALETTE.scarf),
        legs: pickC(PALETTE.legs),
        gift: pickC(PALETTE.gift),
        gift2: pickC(PALETTE.gift),
      },

    };
    if (d.col.hat.equals(d.col.coat)) d.col.hat.set(P.snow);
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
    const py = 0.08, ty = bob - sit * 0.05;
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
    if (d.hold < 0) { aLx = -0.1; aLz = 0.45; } else if (d.hold > 0) { aRx = -0.1; aRz = 0.45; }
    if (d.cheerT > 0 && d.cheerDelay <= 0) {
      const w = Math.sin(t * 11 + d.id) * 0.25;
      aLx = aRx = -0.3; aLz = 2.5 + w; aRz = 2.5 - w;
    }
    for (let side = -1; side <= 1; side += 2) {
      const ax = side < 0 ? aLx : aRx, az = side < 0 ? aLz : aRz;
      eul.set(ax, 0, side * (0.25 + az), 'ZXY');
      tmpL.makeRotationFromEuler(eul);
      const e = tmpL.elements;
      e[12] = side * 0.062; e[13] = 0.19; e[14] = 0;
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
      e[12] = side * 0.028; e[13] = 0.08 + bob * 0.5 - sit * 0.05; e[14] = 0;
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
      let n = 0, nh = 0, ng = 0, nf = 0;
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
          M.ghat.instanceMatrix.array.set(M.head.instanceMatrix.array.subarray(off, off + 16), ng * 16);
          M.beard.instanceMatrix.array.set(M.head.instanceMatrix.array.subarray(off, off + 16), ng * 16);
          if (sigChanged) M.ghat.setColorAt(ng, d.col.hat);
          ng++;
        } else {
          const off = n * 16;
          M.hat.instanceMatrix.array.set(M.head.instanceMatrix.array.subarray(off, off + 16), nh * 16);
          if (sigChanged) M.hat.setColorAt(nh, d.col.hat);
          nh++;
        }
        if (hasGift) {
          // gift held in front of the chest, attached to the body
          tmpL.makeTranslation(0, 0.155, 0.085);
          tmpW.multiplyMatrices(bodyW, tmpL);
          tmpW.toArray(M.gift.instanceMatrix.array, nf * 16);
          if (sigChanged) M.gift.setColorAt(nf, d.col.gift);
          nf++;
          if (d.gift === 2) { // a stack: a smaller second present on top, turned a little
            tmpL.makeRotationY(0.5).scale(stackScale).setPosition(0.004, 0.218, 0.08);
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
          M.leg.setColorAt(n * 2, d.col.legs); M.leg.setColorAt(n * 2 + 1, d.col.legs);
        }
        n++;
      }
      if (si !== sig.length) { sig.length = si; sigChanged = true; }
      M.coat.count = M.head.count = M.scarf.count = n;
      M.arm.count = M.leg.count = n * 2;
      M.hat.count = nh; M.ghat.count = M.beard.count = ng; M.gift.count = nf;
      for (const k in M) {
        M[k].instanceMatrix.needsUpdate = true;
        if (sigChanged && M[k].instanceColor) M[k].instanceColor.needsUpdate = true;
      }
      return n;
    },
  };
}
