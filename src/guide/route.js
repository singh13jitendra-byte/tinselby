// Guide route planner: a coarse walkability grid sampled from the colliders (lazily, refreshed now and then) and an A*
// search with string-pulling, all on preallocated typed arrays (no allocations per plan). Used by the footprint trail.
//
//   const r = createRoute(ctx); r.tick(now) each frame while needed (builds / refreshes the grid in slices);
//   r.plan(ax, az, bx, bz) → number of waypoints (r.wx / r.wz), 0 when there is no way (or the grid isn't ready yet).
import { WORLD } from '../core/layout.js';

const C = 0.3; // cell size (m): smaller than the 0.4 m band round a house wall, so walls always block
const R = 0.15; // clearance radius used when sampling
const MAXW = 256; // max waypoints after smoothing

export function createRoute(ctx) {
  const { colliders } = ctx;
  const NX = Math.ceil((WORLD.maxX - WORLD.minX) / C), NZ = Math.ceil((WORLD.maxZ - WORLD.minZ) / C), N = NX * NZ;
  let occ = new Uint8Array(N), next = new Uint8Array(N); // 1 = blocked; `next` is filled a slice per frame, then swapped in
  const g = new Float32Array(N), f = new Float32Array(N), came = new Int32Array(N);
  const seen = new Uint32Array(N), shut = new Uint32Array(N); // generation stamps (no clearing between searches)
  const heap = new Int32Array(N * 2); let hn = 0;
  const raw = new Int32Array(N); // cells start → goal
  const wx = new Float32Array(MAXW), wz = new Float32Array(MAXW);
  let gen = 0, built = -1e9, nw = 0;
  const p = { x: 0, z: 0 };
  const cx = (i) => WORLD.minX + (i + 0.5) * C, cz = (j) => WORLD.minZ + (j + 0.5) * C;
  const ci = (x) => Math.max(0, Math.min(NX - 1, Math.floor((x - WORLD.minX) / C)));
  const cj = (z) => Math.max(0, Math.min(NZ - 1, Math.floor((z - WORLD.minZ) / C)));

  function freeAt(x, z) {
    if (colliders.blocked(x, z)) return false;
    p.x = x; p.z = z;
    colliders.resolve(p, R);
    return Math.abs(p.x - x) < 1e-3 && Math.abs(p.z - z) < 1e-3;
  }
  /** Sample the colliders into the grid (≈ 15k cheap lookups), spread over frames: tick(now) does `cells` per call and
   *  restarts every 15 s so moved props are picked up. ready = a full grid exists. */
  let cursor = -1, ready = false, startedAt = 0;
  function tick(now, cells = 2400) {
    if (cursor < 0) { if (ready && now - built < 15) return; cursor = 0; startedAt = now; }
    const end = Math.min(N, cursor + cells);
    for (let c = cursor; c < end; c++) next[c] = freeAt(cx(c % NX), cz((c / NX) | 0)) ? 0 : 1;
    cursor = end;
    if (cursor >= N) { const t = occ; occ = next; next = t; cursor = -1; ready = true; built = startedAt; }
  }
  /** Nearest free cell to (x, z) within 6 cells, or -1. */
  function nearestFree(x, z) {
    const i0 = ci(x), j0 = cj(z);
    if (!occ[j0 * NX + i0]) return j0 * NX + i0;
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NZ || occ[j * NX + i]) continue;
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        const d = (cx(i) - x) ** 2 + (cz(j) - z) ** 2;
        if (d < bd) { bd = d; best = j * NX + i; }
      }
    }
    return best;
  }
  // binary min-heap of cell ids keyed by f
  function push(c) {
    let k = hn++; heap[k] = c;
    while (k > 0) { const q = (k - 1) >> 1; if (f[heap[q]] <= f[heap[k]]) break; const t = heap[q]; heap[q] = heap[k]; heap[k] = t; k = q; }
  }
  function pop() {
    const top = heap[0]; heap[0] = heap[--hn];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1; let m = k;
      if (l < hn && f[heap[l]] < f[heap[m]]) m = l;
      if (r < hn && f[heap[r]] < f[heap[m]]) m = r;
      if (m === k) break;
      const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m;
    }
    return top;
  }
  const SQ2 = Math.SQRT2;
  const hEst = (a, gi, gj) => { const dx = Math.abs((a % NX) - gi), dz = Math.abs(((a / NX) | 0) - gj); return (dx + dz) + (SQ2 - 2) * Math.min(dx, dz); };
  /** Clear straight walk between two world points on the grid (sampled every half cell). */
  function los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (C * 0.5)));
    for (let k = 1; k < n; k++) { const t = k / n; if (occ[cj(az + (bz - az) * t) * NX + ci(ax + (bx - ax) * t)]) return false; }
    return true;
  }

  /** Plan a walk from (ax, az) to (bx, bz). Returns the number of waypoints in wx / wz (first = start, last = goal), 0 = none. */
  function plan(ax, az, bx, bz, maxExpand = 9000) {
    nw = 0;
    if (!ready) return 0;
    const s = nearestFree(ax, az), t = nearestFree(bx, bz);
    if (s < 0 || t < 0) return 0;
    gen++; hn = 0;
    const gi = t % NX, gj = (t / NX) | 0;
    g[s] = 0; f[s] = hEst(s, gi, gj); came[s] = -1; seen[s] = gen; push(s);
    let found = false, exp = 0;
    while (hn > 0) {
      const c = pop();
      if (shut[c] === gen) continue;
      shut[c] = gen;
      if (c === t) { found = true; break; }
      if (++exp > maxExpand) break;
      const i = c % NX, j = (c / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
        const n = nj * NX + ni;
        if (occ[n] || shut[n] === gen) continue;
        if (di && dj && (occ[j * NX + ni] || occ[nj * NX + i])) continue; // no corner cutting
        const ng = g[c] + (di && dj ? SQ2 : 1);
        if (seen[n] === gen && ng >= g[n]) continue;
        seen[n] = gen; g[n] = ng; f[n] = ng + hEst(n, gi, gj) * 1.05; came[n] = c;
        push(n);
      }
    }
    if (!found) return 0;
    let m = 0;
    for (let c = t; c >= 0 && m < N; c = came[c]) raw[m++] = c;
    // raw is goal → start; string-pull from the real start towards the real goal
    let px = ax, pz = az;
    wx[nw] = px; wz[nw] = pz; nw++;
    let k = m - 1;
    while (k > 0 && nw < MAXW - 1) {
      // furthest raw cell visible from the current point
      let best = k - 1; // greedy: walk towards the goal while the straight line stays clear
      for (let q = k - 2; q >= 0; q--) { const c = raw[q]; if (!los(px, pz, cx(c % NX), cz((c / NX) | 0))) break; best = q; }
      const c = raw[best];
      px = cx(c % NX); pz = cz((c / NX) | 0);
      if (best === 0) break;
      wx[nw] = px; wz[nw] = pz; nw++;
      k = best;
    }
    wx[nw] = bx; wz[nw] = bz; nw++;
    return nw;
  }
  return {
    plan, wx, wz, tick,
    get count() { return nw; },
    get ready() { return ready; },
    /** Sample everything now (tests / first use). */
    buildNow(now = 0) { cursor = -1; built = -1e9; tick(now, N); },
    /** Walkable at (x, z) per the last grid sample (tests). */
    walkable: (x, z) => !occ[cj(z) * NX + ci(x)],
    get cells() { return N; },
  };
}
