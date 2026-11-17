// Walk collisions + ground height. Modules register obstacles; the player (and NPC code, optionally) resolves against them.
import { WORLD } from './layout.js';

export function createColliders() {
  const circles = []; // {x, z, r, tag}
  const segments = []; // {ax, az, bx, bz, r, tag}
  const heightFns = []; // fn(x, z) → number | null (highest wins)
  const blockFns = []; // fn(x, z) → true if not walkable (e.g. open water, deep snow walls)
  const groundMeshes = []; // meshes used to raycast taps onto the ground
  const GRID = 4;
  const grid = new Map();
  const cellKey = (i, j) => i + ',' + j;
  function index(o, x0, z0, x1, z1) {
    for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++)
      for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++) {
        const k = cellKey(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(o);
      }
  }
  return {
    groundMeshes,
    addCircle(x, z, r, tag = '') {
      const o = { type: 'c', x, z, r, tag, enabled: true };
      circles.push(o);
      index(o, x - r, z - r, x + r, z + r);
      return o; // set o.enabled = false to switch off
    },
    addSegment(ax, az, bx, bz, r, tag = '') {
      const o = { type: 's', ax, az, bx, bz, r, tag, enabled: true };
      segments.push(o);
      index(o, Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r);
      return o;
    },
    /** Axis-aligned box as 4 segments. */
    addRect(x0, z0, x1, z1, tag = '') {
      return [
        this.addSegment(x0, z0, x1, z0, 0.02, tag), this.addSegment(x1, z0, x1, z1, 0.02, tag),
        this.addSegment(x1, z1, x0, z1, 0.02, tag), this.addSegment(x0, z1, x0, z0, 0.02, tag),
      ];
    },
    addHeightFn(fn) { heightFns.push(fn); },
    addBlockFn(fn) { blockFns.push(fn); },
    heightAt(x, z) {
      let h = 0;
      for (const f of heightFns) { const v = f(x, z); if (v != null && v > h) h = v; }
      return h;
    },
    blocked(x, z) { return blockFns.some((f) => f(x, z)); },
    /** Push pos (Vector3 or {x,z}) out of obstacles; keeps it inside the world. Returns pos. */
    resolve(pos, radius = 0.08, prevX = pos.x, prevZ = pos.z) {
      if (this.blocked(pos.x, pos.z)) {
        if (!this.blocked(pos.x, prevZ)) pos.z = prevZ;
        else if (!this.blocked(prevX, pos.z)) pos.x = prevX;
        else { pos.x = prevX; pos.z = prevZ; }
      }
      for (let it = 0; it < 2; it++) {
        const near = grid.get(cellKey(Math.floor(pos.x / GRID), Math.floor(pos.z / GRID))) || [];
        for (const o of near) {
          if (!o.enabled) continue;
          let cx, cz;
          if (o.type === 'c') { cx = o.x; cz = o.z; }
          else {
            const abx = o.bx - o.ax, abz = o.bz - o.az, l2 = abx * abx + abz * abz;
            const t = l2 > 0 ? Math.max(0, Math.min(1, ((pos.x - o.ax) * abx + (pos.z - o.az) * abz) / l2)) : 0;
            cx = o.ax + abx * t; cz = o.az + abz * t;
          }
          const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz), min = o.r + radius;
          if (d < min && d > 1e-6) { pos.x = cx + (dx / d) * min; pos.z = cz + (dz / d) * min; }
        }
      }
      pos.x = Math.max(WORLD.minX + 0.3, Math.min(WORLD.maxX - 0.3, pos.x));
      pos.z = Math.max(WORLD.minZ + 0.3, Math.min(WORLD.maxZ - 0.3, pos.z));
      return pos;
    },
  };
}
