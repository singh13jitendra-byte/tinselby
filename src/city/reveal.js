// Pop-up book reveal system.
// Each district is a RevealGroup. Static props are merged into a few big meshes (Batch) — one draw call per batch — but each
// prop keeps its own vertex range + anchor, so during the reveal we animate every prop individually on the CPU
// (scale with overshoot + squash & stretch, ground tiles flip up on a hinge). Once settled the base positions are restored.
// Moving / special objects (tree, carousel, cabins) are registered as node props and animated through their transforms.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FELT, GLOW } from '../core/yarn.js';

/** Damped spring 0 → 1 with ~13% overshoot. */
export const spring = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-5.5 * p) * Math.cos(8.5 * p));
/** Squash & stretch signal: + while shooting up (stretch), − on the overshoot (squash). */
export const squash = (p) => (p <= 0 || p >= 1 ? 0 : Math.exp(-4 * p) * Math.sin(8.5 * p));
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------------ light groups (vertex ranges toggled on / off)
const OFF_TINT = new THREE.Color('#5d554f');
export class Lights {
  constructor() { this.groups = new Map(); this.levels = new Map(); }
  register(name, batch, start, count) {
    if (!this.groups.has(name)) this.groups.set(name, []);
    this.groups.get(name).push({ batch, start, count, on: null });
  }
  /** Called once batches are finalized: capture the "on" colours. */
  capture() {
    for (const list of this.groups.values()) for (const r of list) {
      if (r.on) continue;
      const col = r.batch.geo.attributes.color.array;
      r.on = col.slice(r.start * 3, (r.start + r.count) * 3);
    }
  }
  /** k = 0 (off: dull felt bulbs) … 1 (full glow). */
  set(name, k) {
    const list = this.groups.get(name);
    if (!list) return;
    if (this.levels.get(name) === k) return;
    this.levels.set(name, k);
    for (const r of list) {
      const g = r.batch.geo, col = g.attributes.color.array, mat = g.attributes.aMat.array;
      for (let i = 0; i < r.count; i++) {
        const vi = r.start + i;
        const o = i * 3;
        if (k <= 0.001) {
          mat[vi] = FELT;
          col[vi * 3] = r.on[o] * 0.35 + OFF_TINT.r * 0.4;
          col[vi * 3 + 1] = r.on[o + 1] * 0.35 + OFF_TINT.g * 0.4;
          col[vi * 3 + 2] = r.on[o + 2] * 0.35 + OFF_TINT.b * 0.4;
        } else {
          mat[vi] = GLOW;
          col[vi * 3] = r.on[o] * k; col[vi * 3 + 1] = r.on[o + 1] * k; col[vi * 3 + 2] = r.on[o + 2] * k;
        }
      }
      g.attributes.color.needsUpdate = true;
      g.attributes.aMat.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ batches
export class Batch {
  constructor(group, { cast = true, receive = true, name = '' } = {}) {
    this.group = group; this.cast = cast; this.receive = receive; this.name = name;
    this.geos = []; this.count = 0; this.props = []; this.cur = null; this.mesh = null;
    group.batches.push(this);
  }
  /** Start a new prop. anchor = [x, y, z] (base centre); opts {kind:'pop'|'tile'|'rise', delay, dur, hinge:[x,y,z]} */
  begin(anchor, opts = {}) {
    this._close();
    const p = {
      type: 'v', batch: this, start: this.count, end: this.count, kind: opts.kind || 'pop',
      c: opts.hinge || [anchor[0], anchor[1] || 0, anchor[2]], at: [anchor[0], anchor[1] || 0, anchor[2]],
      delay: opts.delay, dur: opts.dur, st: 1,
    };
    this.cur = p; this.props.push(p); this.group.props.push(p);
    return this;
  }
  /** Add a world-space geometry to the current prop. light = light-group name (GLOW parts that toggle). */
  add(geo, light) {
    if (!geo) return this;
    if (Array.isArray(geo)) { for (const g of geo) this.add(g, light); return this; }
    if (!this.cur) this.begin([0, 0, 0]);
    const n = geo.attributes.position.count;
    if (light) this.group.lights.register(light, this, this.count, n);
    this.geos.push(geo); this.count += n;
    return this;
  }
  _close() { if (this.cur) { this.cur.end = this.count; this.cur = null; } }
  finalize(mat, parent) {
    this._close();
    if (!this.geos.length) return null;
    const g = mergeGeometries(this.geos, false);
    this.geos.forEach((x) => x.dispose());
    this.geos = null;
    g.computeBoundingSphere();
    g.boundingSphere.radius *= 1.08;
    this.geo = g;
    this.pos = g.attributes.position.array;
    this.base = this.pos.slice();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = this.cast; m.receiveShadow = this.receive;
    // optional shadow prefix: vertices [0, shadowEnd) cast, the rest (e.g. fairy lights added last) draw in the main pass only
    if (this.cast && this.shadowEnd != null && this.shadowEnd < this.count) {
      const n = this.shadowEnd;
      m.onBeforeShadow = () => { g.drawRange.count = n; };
      m.onAfterShadow = () => { g.drawRange.count = Infinity; };
    }
    m.matrixAutoUpdate = false; m.updateMatrix();
    m.name = 'city-' + this.group.id + '-' + this.name;
    parent.add(m);
    this.mesh = m;
    return m;
  }
}

// ------------------------------------------------------------------ reveal groups
export class RevealGroup {
  constructor(id, center, lights) {
    this.id = id; this.center = center; this.lights = lights;
    this.props = []; this.batches = []; this.state = 'shown'; this.t0 = 0; this.total = 1.2;
    this.pending = false; this.onRevealed = null; this.root = new THREE.Group(); this.root.name = 'district-' + id;
  }
  batch(opts) { return new Batch(this, opts); }
  /** Animate an Object3D (its origin should be at its base). */
  node(obj, anchor, opts = {}) {
    const p = { type: 'n', obj, kind: opts.kind || 'pop', at: anchor, c: anchor, delay: opts.delay, dur: opts.dur, bs: obj.scale.clone(), st: 1 };
    this.props.push(p);
    return p;
  }
  finalize(mat, parent) {
    parent.add(this.root);
    for (const b of this.batches) b.finalize(mat, this.root);
    // schedule: tiles ripple out from the centre, then props puff up nearest-first
    const [cx, cz] = this.center;
    let dmax = 1;
    for (const p of this.props) { p.d = Math.hypot(p.at[0] - cx, p.at[2] - cz); dmax = Math.max(dmax, p.d); }
    let total = 0;
    for (const p of this.props) {
      const r = p.d / dmax;
      const jit = ((Math.sin(p.at[0] * 12.9 + p.at[2] * 78.2) * 43758.5) % 1 + 1) % 1;
      if (p.delay == null) p.delay = p.kind === 'tile' ? 0.42 * r + jit * 0.06 : p.kind === 'rise' ? 0 : 0.28 + 0.55 * r + jit * 0.12;
      if (p.dur == null) p.dur = p.kind === 'tile' ? 0.42 : p.kind === 'rise' ? 0.75 : 0.55;
      total = Math.max(total, p.delay + p.dur);
    }
    this.total = total;
    this.maxDelay = Math.max(...this.props.map((p) => p.delay), 0);
  }
  reveal(now, instant) {
    if (this.state === 'shown') return;
    for (const b of this.batches) if (b.mesh) b.mesh.visible = true;
    if (instant) { this.state = 'revealing'; this.t0 = now - 100; this.pending = false; this.update(now); return; }
    if (this.state === 'revealing') return;
    if (this.state === 'folding') { this.pending = true; return; }
    this.state = 'revealing'; this.t0 = now;
  }
  fold(now, instant) {
    this.pending = false;
    if (instant) { this.state = 'folding'; this.t0 = now - 100; this.update(now); return; }
    if (this.state === 'folded' || this.state === 'folding') return;
    this.state = 'folding'; this.t0 = now;
  }
  get animating() { return this.state === 'revealing' || this.state === 'folding'; }
  update(now) {
    if (!this.animating) return;
    const t = now - this.t0;
    const rev = this.state === 'revealing';
    const FD = 0.32; // fold duration per prop
    const foldTotal = this.maxDelay * 0.3 + FD;
    const dirty = new Set();
    for (const p of this.props) {
      let f, g = 0, s;
      if (rev) {
        const l = (t - p.delay) / p.dur;
        if (l >= 1) { if (p.st === 1) continue; f = 1; s = 1; p.st = 1; }
        else if (l <= 0) { if (p.st === -1) continue; f = 0; s = 0; p.st = -1; }
        else { f = spring(l); g = squash(l); s = sat(l * 3.5); s = s * s * (3 - 2 * s); p.st = 0; }
      } else {
        const l = 1 - (t - (this.maxDelay - p.delay) * 0.3) / FD;
        if (l >= 1) { if (p.st === 1) continue; f = 1; s = 1; p.st = 1; }
        else if (l <= 0) { if (p.st === -1) continue; f = 0; s = 0; p.st = -1; }
        else { f = l * l * (3 - 2 * l); s = sat(l * 2); g = -0.25 * Math.sin(l * Math.PI); p.st = 0; }
      }
      if (p.type === 'v') { writeProp(p, f, g, s); dirty.add(p.batch); }
      else writeNode(p, f, g, s);
    }
    for (const b of dirty) b.geo.attributes.position.needsUpdate = true;
    if (rev && t >= this.total) {
      this.state = 'shown';
      const cb = this.onRevealed; if (cb) cb(this.id);
    } else if (!rev && t >= foldTotal) {
      this.state = 'folded';
      for (const b of this.batches) if (b.mesh) b.mesh.visible = false;
      if (this.pending) { this.pending = false; this.state = 'folded'; this.reveal(now, false); }
    }
  }
}

/** Squash props vertically about their anchors (s = height scale), e.g. a cut-away so the camera sees past a row. */
export function squashProps(props, s) {
  const dirty = new Set();
  for (const p of props) {
    const B = p.batch.base, O = p.batch.pos, ay = p.at[1];
    for (let i = p.start * 3; i < p.end * 3; i += 3) { O[i] = B[i]; O[i + 1] = ay + (B[i + 1] - ay) * s; O[i + 2] = B[i + 2]; }
    dirty.add(p.batch);
  }
  for (const b of dirty) b.geo.attributes.position.needsUpdate = true;
}

function writeProp(p, f, g, s) {
  const B = p.batch.base, O = p.batch.pos;
  const i0 = p.start * 3, i1 = p.end * 3;
  if (f === 1 && s === 1) { O.set(B.subarray(i0, i1), i0); return; }
  const cx = p.c[0], cy = p.c[1], cz = p.c[2];
  let m00, m01 = 0, m02 = 0, m10 = 0, m11, m12 = 0, m20 = 0, m21 = 0, m22;
  if (p.kind === 'tile') {
    const th = -(1 - f) * 1.35, c = Math.cos(th), sn = Math.sin(th);
    m00 = s; m11 = c * Math.max(s, 0.001); m12 = -sn * s; m21 = sn * Math.max(s, 0.001); m22 = c * s;
    if (s === 0) { m11 = 0; m21 = 0; }
  } else if (p.kind === 'rise') {
    m00 = s; m11 = f; m22 = s;
  } else {
    const sy = f * (1 + 0.34 * g), sx = f * (1 - 0.2 * g);
    m00 = sx; m11 = sy; m22 = sx;
  }
  for (let i = i0; i < i1; i += 3) {
    const x = B[i] - cx, y = B[i + 1] - cy, z = B[i + 2] - cz;
    O[i] = cx + m00 * x + m01 * y + m02 * z;
    O[i + 1] = cy + m10 * x + m11 * y + m12 * z;
    O[i + 2] = cz + m20 * x + m21 * y + m22 * z;
  }
}

function writeNode(p, f, g, s) {
  const o = p.obj;
  const sy = f * (1 + 0.34 * g), sx = f * (1 - 0.2 * g);
  o.scale.set(p.bs.x * Math.max(sx, 1e-4), p.bs.y * Math.max(sy, 1e-4), p.bs.z * Math.max(sx, 1e-4));
  o.visible = f > 0.001;
}
