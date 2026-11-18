// Decoration overlay for the player's cottage (WAVE2.md §House). One merged geometry in HOUSE-LOCAL space
// (origin at the house centre on the ground, front = +z, front wall at z = d/2 = 0.65). The mesh is placed at
// (HOUSE.x, 0.035, HOUSE.z). Budget: <= 4k triangles, GLOW bulbs included, shared yarn material.
import { box, cyl, sph, torus, xf, merge, KNIT, FELT, GLOW, GLOSS } from '../core/prims.js';
import { snowmanGeos } from '../city/kit.js';

export const DEFAULT = { wreath: 'holly', lights: 'warm', door: 'red', snowman: 'none' };

export const OPTIONS = {
  wreath: [
    { key: 'classic', label: 'Classic', swatch: '#4a8250' },
    { key: 'holly', label: 'Holly', swatch: '#2f6446' },
    { key: 'berry', label: 'Berry', swatch: '#b8302d' },
    { key: 'gold', label: 'Gold', swatch: '#e3aa3a' },
  ],
  lights: [
    { key: 'warm', label: 'Warm', swatch: '#ffc474' },
    { key: 'multi', label: 'Colour', swatch: 'conic-gradient(#e2574c, #ffc474, #7fc27f, #6fb6e8, #e2574c)' },
    { key: 'icy', label: 'Icy', swatch: '#bfe6ff' },
    { key: 'off', label: 'Off', swatch: '#8d8882' },
  ],
  door: [
    { key: 'teal', label: 'Teal', swatch: '#4f9590' },
    { key: 'red', label: 'Red', swatch: '#b8302d' },
    { key: 'green', label: 'Green', swatch: '#3f6e45' },
    { key: 'navy', label: 'Navy', swatch: '#2b3d6b' },
    { key: 'plum', label: 'Plum', swatch: '#6e3d63' },
  ],
  snowman: [
    { key: 'none', label: 'None', swatch: '#d9d3c8' },
    { key: 'classic', label: 'Classic', swatch: '#6fa8b4' },
    { key: 'scarf', label: 'Scarf', swatch: '#b8302d' },
    { key: 'top', label: 'Top hat', swatch: '#2f2a29' },
  ],
};

const DOOR = { red: '#b8302d', green: '#3f6e45', navy: '#2b3d6b', plum: '#6e3d63' };
const DOOR_LIGHT = { red: '#cf4a44', green: '#548a5a', navy: '#3f5486', plum: '#865280' };
const BULBS = {
  warm: ['#ffc474', '#ffd89a'],
  multi: ['#ff6a55', '#ffc474', '#7fd68a', '#6fb6e8', '#f08fb0'],
  icy: ['#cfeaff', '#9fd0f0'],
};
const CORD = '#2f6446';

/** Merge the pieces of one style into a single geometry (house-local), or null when nothing is shown. */
export function buildDecor(style) {
  const s = { ...DEFAULT, ...style };
  const g = [];

  // ---- door colour: panel over the baked door (teal = the original, no overlay)
  if (DOOR[s.door]) {
    const c = DOOR[s.door];
    g.push(xf(box(0.36, 0.57, 0.012, c, FELT), [0.3, 0.4, 0.688]));
    g.push(xf(cyl(0.175, 0.175, 0.012, 12, c, FELT), [0.3, 0.68, 0.688], [Math.PI / 2, 0, 0]));
    g.push(xf(box(0.2, 0.17, 0.008, DOOR_LIGHT[s.door], FELT), [0.3, 0.25, 0.696]));
    g.push(xf(sph(0.022, '#e3aa3a', GLOSS, 8, 5), [0.41, 0.4, 0.704]));
  }

  // ---- wreath (classic = the house's own small wreath, no overlay)
  if (s.wreath !== 'classic') {
    const cx = 0.3, cy = 0.55, cz = 0.72, R = 0.1;
    g.push(xf(torus(R, 0.03, '#2f6446', KNIT, Math.PI * 2, 14, 6), [cx, cy, cz]));
    const bead = (a, r, c, k = FELT, rr = R) => xf(sph(r, c, k, 6, 4), [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, cz + 0.026]);
    const bow = (c, c2) => {
      g.push(xf(sph(0.03, c, GLOSS, 6, 4), [cx - 0.032, cy - R - 0.004, cz + 0.03], [0, 0, 0.3], [1.3, 0.8, 0.6]));
      g.push(xf(sph(0.03, c, GLOSS, 6, 4), [cx + 0.032, cy - R - 0.004, cz + 0.03], [0, 0, -0.3], [1.3, 0.8, 0.6]));
      g.push(xf(sph(0.014, c2 || c, GLOSS, 6, 4), [cx, cy - R, cz + 0.036]));
      g.push(xf(box(0.016, 0.065, 0.008, c, FELT), [cx - 0.016, cy - R - 0.05, cz + 0.03], [0, 0, 0.25]));
      g.push(xf(box(0.016, 0.065, 0.008, c, FELT), [cx + 0.016, cy - R - 0.05, cz + 0.03], [0, 0, -0.25]));
    };
    if (s.wreath === 'holly') {
      for (let i = 0; i < 5; i++) g.push(bead(0.5 + i * 0.5, 0.014, '#c9302c'));
      for (const a of [1.2, 3.6]) g.push(xf(sph(0.03, '#3f7a4a', FELT, 6, 4), [cx + Math.cos(a) * R, cy + Math.sin(a) * R, cz + 0.03], [0, 0, a], [1.6, 0.6, 0.4]));
      bow('#b8302d');
    } else if (s.wreath === 'berry') {
      for (let i = 0; i < 9; i++) g.push(bead(i * 0.7 + 0.3, 0.017, i % 3 === 2 ? '#7a3d6e' : '#d63a46'));
      bow('#fbf9f4', '#d63a46');
    } else if (s.wreath === 'gold') {
      for (let i = 0; i < 6; i++) g.push(bead(i * 1.05 + 0.4, 0.02, '#e3aa3a', GLOSS));
      g.push(xf(torus(R, 0.009, '#e3aa3a', KNIT, Math.PI * 2, 14, 4), [cx, cy, cz + 0.03]));
      bow('#e3aa3a', '#b8302d');
    }
  }

  // ---- window lights: top + sides of each frame, 0.05 outside it, at z 0.67
  if (s.lights !== 'off') {
    const cols = BULBS[s.lights] || BULBS.warm;
    let bi = 0;
    const wins = [[-0.32, 0.585, 0.4, 0.42], [-0.31, 1.595, 0.32, 0.42], [0.31, 1.595, 0.32, 0.42]];
    const Z = 0.67;
    for (const [x, y, ww, wh] of wins) {
      const hw = ww / 2 + 0.095, top = y + wh / 2 + 0.095, bot = y - wh / 2 - 0.02;
      const path = [[x - hw, bot], [x - hw, top], [x + hw, top], [x + hw, bot]];
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const [ax, ay] = path[i], [bx, by] = path[i + 1];
        const L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(L / 0.11));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
      }
      for (let k = 0; k < pts.length; k++) {
        const [px, py] = pts[k];
        g.push(xf(sph(0.024, cols[bi++ % cols.length], GLOW, 5, 3), [px, py, Z], null, [1, 1.25, 1]));
        if (k) {
          const [qx, qy] = pts[k - 1];
          g.push(xf(box(Math.hypot(px - qx, py - qy) + 0.004, 0.006, 0.006, CORD, FELT), [(px + qx) / 2, (py + qy) / 2 + 0.014, Z - 0.004], [0, 0, Math.atan2(py - qy, px - qx)]));
        }
      }
    }
  }

  // ---- snowman at local (-0.55, 0.86), <= 0.45 tall
  if (s.snowman !== 'none') {
    const k = 0.62;
    let parts;
    if (s.snowman === 'classic') parts = snowmanGeos();
    else if (s.snowman === 'scarf') parts = snowmanGeos('#b8302d', '#fbf9f4', '#fbf9f4');
    else {
      parts = snowmanGeos('#2f2a29', '#b8302d', '#2f2a29');
      parts.splice(-3).forEach((q) => q.dispose()); // drop the beanie (ball, brim, pom) for the top hat
      parts.push(xf(cyl(0.1, 0.1, 0.016, 10, '#2f2a29', FELT), [0, 0.565, 0]));
      parts.push(xf(cyl(0.062, 0.064, 0.115, 10, '#2f2a29', KNIT), [0, 0.62, 0]));
      parts.push(xf(cyl(0.066, 0.066, 0.026, 10, '#b8302d', FELT), [0, 0.592, 0]));
    }
    for (const q of parts) g.push(xf(q, [-0.55, 0.03, 0.86], [0, 0.35, 0], k));
  }

  return g.length ? merge(g) : null;
}
