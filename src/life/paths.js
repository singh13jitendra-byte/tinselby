// Polyline paths with rounded corners, sampled densely; cheap pointAt(s) via binary search.

export class Path {
  /**
   * @param {number[][]} pts [[x,z],...]
   * @param {{closed?:boolean, radius?:number, pingpong?:boolean, steps?:number}} o
   */
  constructor(pts, o = {}) {
    this.closed = o.closed ?? true;
    this.pingpong = !!o.pingpong;
    const r = o.radius ?? 0;
    const steps = o.steps ?? 8;
    const n = pts.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const isEnd = !this.closed && (i === 0 || i === n - 1);
      if (isEnd || r <= 0) { out.push([p[0], p[1]]); continue; }
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = Math.min(r, la * 0.45, lb * 0.45);
      const A = [p[0] + ((a[0] - p[0]) / la) * rr, p[1] + ((a[1] - p[1]) / la) * rr];
      const B = [p[0] + ((b[0] - p[0]) / lb) * rr, p[1] + ((b[1] - p[1]) / lb) * rr];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        out.push([u * u * A[0] + 2 * u * t * p[0] + t * t * B[0], u * u * A[1] + 2 * u * t * p[1] + t * t * B[1]]);
      }
    }
    if (this.closed) out.push([out[0][0], out[0][1]]);
    this.x = new Float32Array(out.length);
    this.z = new Float32Array(out.length);
    this.cum = new Float32Array(out.length);
    let L = 0;
    for (let i = 0; i < out.length; i++) {
      if (i > 0) L += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
      this.x[i] = out[i][0]; this.z[i] = out[i][1]; this.cum[i] = L;
    }
    this.length = L;
    /** Travel length of one full cycle (pingpong paths go out and back). */
    this.cycle = this.pingpong ? 2 * L : L;
  }

  /** Writes {x, z, dx, dz} (unit tangent in travel direction) for travel distance s. */
  at(s, out) {
    const L = this.length;
    let dir = 1;
    if (this.pingpong) {
      s = ((s % (2 * L)) + 2 * L) % (2 * L);
      if (s > L) { s = 2 * L - s; dir = -1; }
    } else if (this.closed) s = ((s % L) + L) % L;
    else s = Math.max(0, Math.min(L, s));
    const cum = this.cum;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1e-6;
    const t = (s - cum[lo]) / seg;
    const dx = this.x[hi] - this.x[lo], dz = this.z[hi] - this.z[lo];
    const dl = Math.hypot(dx, dz) || 1;
    out.x = this.x[lo] + dx * t;
    out.z = this.z[lo] + dz * t;
    out.dx = (dx / dl) * dir;
    out.dz = (dz / dl) * dir;
    return out;
  }

  /** Path distance of the point on the path closest to (x, z). */
  nearestS(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.x.length - 1; i++) {
      const ax = this.x[i], az = this.z[i], bx = this.x[i + 1] - ax, bz = this.z[i + 1] - az;
      const l2 = bx * bx + bz * bz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)) : 0;
      const d = (ax + bx * t - x) ** 2 + (az + bz * t - z) ** 2;
      if (d < bd) { bd = d; best = this.cum[i] + Math.sqrt(l2) * t; }
    }
    return best;
  }
}

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function turnTo(a, b, k) { return a + wrapAngle(b - a) * Math.min(1, k); }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
