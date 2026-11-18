// One 1024² canvas atlas for every flat label on the Advent board: door numbers 1–24, counter digits, reward icons,
// cross-stitches for "coming soon" doors, star rows and two text banners. Icons are drawn light so vertex colours tint them.
import * as THREE from 'three';

const S = 1024, C = 128; // atlas size, cell size (8 × 8 cells)
export const CELL = {
  num: (n) => n - 1, // 0..23
  digit: (d) => 24 + d, // 24..33
  star: 34, hat: 35, scarf: 36, coat: 37, gift: 38, flake: 39, stitch: 40,
  stars: (k) => 41 + Math.max(0, Math.min(2, k - 1)), // 41..43 (1–3 stars)
  header: 48, // 4 cells wide (row 6)
  spirit: 52, // 4 cells wide (row 6)
};

/** UV rect [u0, v0, u1, v1] of a cell (w cells wide). Canvas textures are flipped, so v grows upward. */
export function cellUV(i, w = 1) {
  const cx = i % 8, cy = Math.floor(i / 8);
  return [(cx * C) / S, 1 - ((cy + 1) * C) / S, ((cx + w) * C) / S, 1 - (cy * C) / S];
}

const FONT = "'Fredoka', 'Nunito', 'Trebuchet MS', system-ui, sans-serif";
const INK = '#3a2a24';

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  draw(g);
  tex.needsUpdate = true;
  // redraw once the web font is in (falls back silently when offline)
  try {
    document.fonts?.load?.(`700 64px Fredoka`).then(() => { draw(g); tex.needsUpdate = true; }).catch(() => {});
  } catch (e) { /* no font loading API */ }
  return { canvas, tex };
}

function at(i) { return [(i % 8) * C, Math.floor(i / 8) * C]; }

function text(g, s, x, y, size, fill = '#fff4e2', stroke = INK, lw = 10) {
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  g.strokeText(s, x, y);
  g.fillStyle = fill;
  g.fillText(s, x, y);
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function starPath(g, cx, cy, r, ri) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : r;
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

/** Light felt shape with a dark outline and a dashed running stitch inside (tinted later by vertex colour). */
function felt(g, path, { fill = '#ffffff', stitch = true, c = null } = {}) {
  g.lineJoin = 'round';
  path(); g.lineWidth = 9; g.strokeStyle = INK; g.stroke();
  path(); g.fillStyle = fill; g.fill();
  if (stitch && c) { // the same outline shrunk towards the shape's centre, dashed
    g.save(); g.translate(c[0], c[1]); g.scale(0.78, 0.78); g.translate(-c[0], -c[1]);
    g.setLineDash([8, 7]); g.lineWidth = 3.6; g.strokeStyle = 'rgba(110,92,84,0.6)';
    path(); g.stroke();
    g.restore(); g.setLineDash([]);
  }
}

function draw(g) {
  g.clearRect(0, 0, S, S);
  // ---- door numbers: stitched border + chunky felt number
  for (let n = 1; n <= 24; n++) {
    const [x, y] = at(CELL.num(n));
    g.save();
    g.setLineDash([11, 8]); g.lineWidth = 5; g.strokeStyle = 'rgba(255,244,226,0.95)';
    rrect(g, x + 10, y + 10, C - 20, C - 20, 16); g.stroke();
    g.restore();
    text(g, String(n), x + C / 2, y + C / 2 + 4, n > 9 ? 62 : 70, '#fff4e2', INK, 11);
  }
  // ---- counter digits
  for (let d = 0; d <= 9; d++) { const [x, y] = at(CELL.digit(d)); text(g, String(d), x + C / 2, y + C / 2 + 5, 104, '#ffffff', INK, 14); }
  // ---- reward icons (white felt; tinted per reward)
  { const [x, y] = at(CELL.star); felt(g, () => starPath(g, x + 64, y + 68, 56, 24), { c: [x + 64, y + 68] }); }
  { // beanie hat with pom-pom
    const [x, y] = at(CELL.hat);
    felt(g, () => { g.beginPath(); g.moveTo(x + 18, y + 92); g.bezierCurveTo(x + 16, y + 30, x + 112, y + 30, x + 110, y + 92); g.closePath(); }, { c: [x + 64, y + 72] });
    felt(g, () => { rrect(g, x + 12, y + 86, 104, 26, 12); }, { fill: '#e8e0d8' });
    felt(g, () => { g.beginPath(); g.arc(x + 64, y + 26, 17, 0, Math.PI * 2); }, { stitch: false });
  }
  { // scarf: loop + two fringed tails
    const [x, y] = at(CELL.scarf);
    felt(g, () => { g.beginPath(); g.ellipse(x + 64, y + 38, 44, 22, 0, 0, Math.PI * 2); g.moveTo(x + 64 + 26, y + 38); g.ellipse(x + 64, y + 38, 26, 10, 0, 0, Math.PI * 2, true); });
    felt(g, () => { g.beginPath(); g.moveTo(x + 70, y + 50); g.lineTo(x + 92, y + 52); g.lineTo(x + 98, y + 112); g.lineTo(x + 76, y + 114); g.closePath(); });
    felt(g, () => { g.beginPath(); g.moveTo(x + 50, y + 52); g.lineTo(x + 70, y + 54); g.lineTo(x + 62, y + 106); g.lineTo(x + 40, y + 102); g.closePath(); });
  }
  { // coat
    const [x, y] = at(CELL.coat);
    felt(g, () => {
      g.beginPath(); g.moveTo(x + 46, y + 14); g.lineTo(x + 82, y + 14); g.lineTo(x + 112, y + 34); g.lineTo(x + 116, y + 70); g.lineTo(x + 98, y + 72);
      g.lineTo(x + 98, y + 116); g.lineTo(x + 30, y + 116); g.lineTo(x + 30, y + 72); g.lineTo(x + 12, y + 70); g.lineTo(x + 16, y + 34); g.closePath();
    }, { c: [x + 64, y + 66] });
    g.fillStyle = INK; for (const yy of [48, 72, 96]) { g.beginPath(); g.arc(x + 64, y + yy, 5, 0, Math.PI * 2); g.fill(); }
  }
  { // gift box
    const [x, y] = at(CELL.gift);
    felt(g, () => rrect(g, x + 18, y + 48, 92, 70, 8), { c: [x + 64, y + 83] });
    felt(g, () => rrect(g, x + 12, y + 34, 104, 22, 6), { fill: '#efe8e0' });
    felt(g, () => { g.beginPath(); g.ellipse(x + 48, y + 26, 18, 10, -0.5, 0, Math.PI * 2); }, { stitch: false });
    felt(g, () => { g.beginPath(); g.ellipse(x + 80, y + 26, 18, 10, 0.5, 0, Math.PI * 2); }, { stitch: false });
    g.fillStyle = 'rgba(58,42,36,0.25)'; g.fillRect(x + 58, y + 36, 12, 80);
  }
  { // snowflake
    const [x, y] = at(CELL.flake);
    const arms = (w, col) => {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
        const px = (r) => x + 64 + ca * r, py = (r) => y + 64 + sa * r;
        g.beginPath(); g.moveTo(px(0), py(0)); g.lineTo(px(50), py(50)); g.stroke();
        for (const r of [24, 38]) {
          for (const s of [-1, 1]) {
            const b = a + s * 0.75;
            g.beginPath(); g.moveTo(px(r), py(r)); g.lineTo(px(r) + Math.cos(b) * 14, py(r) + Math.sin(b) * 14); g.stroke();
          }
        }
      }
    };
    arms(17, INK); arms(8, '#ffffff');
  }
  { // cross-stitches sewing a door shut (along the right-hand seam)
    const [x, y] = at(CELL.stitch);
    for (const yy of [26, 64, 102]) {
      for (const [w, col] of [[11, INK], [6, '#ffffff']]) {
        g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x + 92, y + yy - 13); g.lineTo(x + 118, y + yy + 13); g.moveTo(x + 118, y + yy - 13); g.lineTo(x + 92, y + yy + 13); g.stroke();
      }
    }
  }
  // ---- 1–3 star rows (gold = earned, pale = not yet)
  for (let k = 1; k <= 3; k++) {
    const [x, y] = at(CELL.stars(k));
    for (let i = 0; i < 3; i++) {
      const cx = x + 22 + i * 42, cy = y + 64;
      starPath(g, cx, cy, 20, 9); g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      starPath(g, cx, cy, 20, 9); g.fillStyle = i < k ? '#f2b640' : '#d8cfc0'; g.fill();
    }
  }
  // ---- banners
  { const [x, y] = at(CELL.header); text(g, 'Advent Calendar', x + 256, y + 66, 64, '#fff4e2', '#6e1d1b', 12); }
  { const [x, y] = at(CELL.spirit); text(g, 'Town Spirit', x + 256, y + 66, 70, '#3a2a24', '#fff4e2', 10); }
}
