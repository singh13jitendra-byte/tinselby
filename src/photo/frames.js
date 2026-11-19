// Postcard compositing (2D canvas only): knitted frames, greeting label, footer link, colour grades.
// drawPostcard(out, photo, opts) paints a finished card into `out` from an already rendered (and graded) photo canvas.

export const LINK = 'https://tinselby-sepia.vercel.app/';
export const LINK_TEXT = 'tinselby-sepia.vercel.app';
const FONT = "Fredoka, Nunito, 'Trebuchet MS', system-ui, sans-serif";

/** Card shapes: canvas size + the photo window inside it (the 3D render fills the window exactly). */
export const SHAPES = {
  tall: { w: 1080, h: 1350, photo: { x: 62, y: 62, w: 956, h: 1000 }, label: { y: 1084, h: 196 }, foot: 1318, g: 66, n: 44, f: 27 },
  wide: { w: 1600, h: 1067, photo: { x: 56, y: 56, w: 1488, h: 772 }, label: { y: 848, h: 162 }, foot: 1040, g: 62, n: 40, f: 25 },
};
export const photoAspect = (shape) => SHAPES[shape].photo.w / SHAPES[shape].photo.h;

/** Ready-made greetings (no free text): label = chip text, text = the line on the card. Christmas only. */
export const GREETINGS = [
  { id: 'merry', label: 'Merry Christmas', text: 'Merry Christmas from Tinselby!' },
  { id: 'here', label: 'Wish you were here', text: 'Wish you were here in Tinselby!' },
  { id: 'woolly', label: 'Woolly wishes', text: 'Warm and woolly Christmas wishes!' },
  { id: 'hohoho', label: 'Ho ho ho', text: 'Ho ho ho from Tinselby!' },
  { id: 'hugs', label: 'Cosy hugs', text: 'Sending cosy Christmas hugs!' },
  { id: 'jolly', label: 'Holly jolly', text: 'Have a holly jolly Christmas!' },
];

// ---------------------------------------------------------------- knitted frames
const STAR5 = ['..#..', '.###.', '#####', '.###.', '.#.#.'];
const FLAKE = ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'];
const bit = (pat, c, r) => { const row = pat[r]; return !!row && row[c] === '#'; };

/** Frames: knit(col, row) → stitch colour, seam = running stitch round the photo, deco = extra felt bits. */
export const FRAMES = [
  {
    id: 'classic', label: 'Classic', swatch: '#b8302d', seam: '#fff4e2', labelStitch: 'rgba(184,48,45,.55)', ink: '#b8302d', ink2: '#3f6e45',
    knit: (c, r) => (r % 9 === 4 ? '#a12825' : '#b8302d'), deco: 'flakes',
  },
  {
    id: 'candy', label: 'Candy cane', swatch: 'repeating-linear-gradient(135deg,#c8322e 0 7px,#f6efe4 7px 14px)', seam: '#3f6e45', labelStitch: 'rgba(63,110,69,.6)', ink: '#c8322e', ink2: '#3f6e45',
    knit: (c, r) => ((Math.floor((c + r) / 3) % 2) ? '#f3ece0' : '#c8322e'),
  },
  {
    id: 'snow', label: 'Snowflake', swatch: 'radial-gradient(circle at 30% 35%,#fff 0 2px,transparent 3px),radial-gradient(circle at 70% 65%,#fff 0 2px,transparent 3px),#2f4373', seam: '#fff4e2', labelStitch: 'rgba(47,67,115,.55)', ink: '#2f4373', ink2: '#b8302d',
    knit: (c, r) => {
      const fc = ((c % 12) + 12) % 12 - 2, fr = ((r % 11) + 11) % 11 - 2, odd = Math.floor(r / 11) % 2;
      const cc = odd ? (((c + 6) % 12) + 12) % 12 - 2 : fc;
      if (bit(FLAKE, cc, fr)) return '#f4f1ea';
      return (c + r) % 2 === 0 && r % 11 === 9 ? '#8fa8d8' : '#2f4373';
    },
  },
  {
    id: 'gold', label: 'Gold star', swatch: 'radial-gradient(circle at 50% 50%,#e3aa3a 0 5px,transparent 6px),#2f5e3e', seam: '#e9b44c', labelStitch: 'rgba(47,94,62,.55)', ink: '#2f5e3e', ink2: '#b8302d',
    knit: (c, r) => {
      const odd = Math.floor(r / 8) % 2;
      const sc = (((c + (odd ? 5 : 0)) % 10) + 10) % 10 - 2, sr = ((r % 8) + 8) % 8 - 1;
      if (bit(STAR5, sc, sr)) return '#e3aa3a';
      return r % 8 === 7 && c % 2 === 0 ? '#3c7350' : '#2f5e3e';
    },
    deco: 'star',
  },
];
export const frameById = (id) => FRAMES.find((f) => f.id === id) || FRAMES[0];

const shadeCache = new Map();
function shade(hex, k) {
  const key = hex + k;
  let v = shadeCache.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const f = (x) => Math.max(0, Math.min(255, Math.round(x * k)));
    v = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    shadeCache.set(key, v);
  }
  return v;
}

/** Fill the whole card with knitted V-stitches (rows of two slanted loops), skipping the photo window. */
function drawKnit(g, W, H, frame, hole) {
  const sw = 18, sh = 15; // stitch cell (px)
  g.fillStyle = shade(frame.knit(0, 0).startsWith('#') ? frame.knit(0, 0) : '#888888', 0.62);
  g.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = Math.ceil(W / sw) + 1, rows = Math.ceil(H / sh) + 1;
  for (let r = 0; r < rows; r++) {
    const cy = r * sh + sh / 2;
    for (let c = 0; c < cols; c++) {
      const cx = c * sw + sw / 2;
      if (cx > hole.x + 14 && cx < hole.x + hole.w - 14 && cy > hole.y + 14 && cy < hole.y + hole.h - 14) continue;
      const col = frame.knit(c, r);
      const j = 0.9 + rnd() * 0.16;
      for (const s of [-1, 1]) {
        const ex = cx + s * sw * 0.23;
        g.fillStyle = shade(col, 0.8 * j);
        g.beginPath(); g.ellipse(ex, cy + 1, sw * 0.27, sh * 0.62, s * 0.55, 0, Math.PI * 2); g.fill();
        g.fillStyle = shade(col, 1.04 * j);
        g.beginPath(); g.ellipse(ex - s * 0.6, cy - 1, sw * 0.19, sh * 0.48, s * 0.55, 0, Math.PI * 2); g.fill();
      }
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function seam(g, x, y, w, h, r, col, lw = 5) {
  g.save();
  g.setLineDash([15, 11]); g.lineCap = 'round'; g.lineWidth = lw;
  g.strokeStyle = 'rgba(0,0,0,.28)'; roundRect(g, x + 1.5, y + 2.5, w, h, r); g.stroke();
  g.strokeStyle = col; roundRect(g, x, y, w, h, r); g.stroke();
  g.restore();
}

function flake(g, x, y, r, col) {
  g.save();
  g.translate(x, y); g.strokeStyle = col; g.lineWidth = r * 0.2; g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r);
    g.moveTo(0, -r * 0.55); g.lineTo(-r * 0.28, -r * 0.8); g.moveTo(0, -r * 0.55); g.lineTo(r * 0.28, -r * 0.8);
    g.stroke();
  }
  g.restore();
}

function star(g, x, y, R, fill, line) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.45 : R; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath();
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
  g.fillStyle = fill; g.fill();
  g.shadowColor = 'transparent';
  g.setLineDash([7, 6]); g.lineWidth = 3; g.strokeStyle = line;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = (i % 2 ? R * 0.45 : R) * 0.72; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.stroke();
  g.restore();
}

/** Largest font size ≤ size at which text fits maxW. */
function fit(g, text, weight, size, maxW) {
  let s = size;
  for (; s > 14; s -= 2) { g.font = `${weight} ${s}px ${FONT}`; if (g.measureText(text).width <= maxW) break; }
  return s;
}

/**
 * Paint a postcard into `out` (resized to the shape). photo = canvas with the graded 3D render (any size, the photo
 * window's aspect). opts = { shape: 'tall'|'wide', frame: id, greeting: id, name }.
 */
export function drawPostcard(out, photo, opts) {
  const S = SHAPES[opts.shape] || SHAPES.tall;
  const F = frameById(opts.frame);
  const G = GREETINGS.find((x) => x.id === opts.greeting) || GREETINGS[0];
  out.width = S.w; out.height = S.h;
  const g = out.getContext('2d');
  const P = S.photo;
  drawKnit(g, S.w, S.h, F, P);
  // outer running stitch
  seam(g, 20, 20, S.w - 40, S.h - 40, 30, F.seam, 4);
  // photo: rounded window with a soft inner shadow and a stitched seam round it
  g.save();
  roundRect(g, P.x, P.y, P.w, P.h, 24); g.clip();
  g.drawImage(photo, P.x, P.y, P.w, P.h);
  const ish = g.createLinearGradient(0, P.y, 0, P.y + 26);
  ish.addColorStop(0, 'rgba(30,15,10,.32)'); ish.addColorStop(1, 'rgba(30,15,10,0)');
  g.fillStyle = ish; g.fillRect(P.x, P.y, P.w, 26);
  g.lineWidth = 6; g.strokeStyle = 'rgba(30,15,10,.25)'; roundRect(g, P.x, P.y, P.w, P.h, 24); g.stroke();
  g.restore();
  seam(g, P.x - 12, P.y - 12, P.w + 24, P.h + 24, 32, F.seam, 5);
  // felt label with the greeting and the sender
  const L = { x: P.x, y: S.label.y, w: P.w, h: S.label.h };
  g.save();
  g.shadowColor = 'rgba(20,10,5,.35)'; g.shadowBlur = 16; g.shadowOffsetY = 6;
  g.fillStyle = '#fff4e2'; roundRect(g, L.x, L.y, L.w, L.h, 26); g.fill();
  g.restore();
  g.save();
  roundRect(g, L.x, L.y, L.w, L.h, 26); g.clip();
  g.globalAlpha = 0.05; g.fillStyle = '#5a3a20';
  for (let x = L.x; x < L.x + L.w; x += 12) g.fillRect(x, L.y, 6, L.h);
  g.restore();
  seam(g, L.x + 11, L.y + 11, L.w - 22, L.h - 22, 18, F.labelStitch, 3.5);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = L.x + L.w / 2;
  const gs = fit(g, G.text, 700, S.g, L.w - 80);
  g.font = `700 ${gs}px ${FONT}`;
  g.fillStyle = shade(F.ink, 0.7);
  g.fillText(G.text, cx, L.y + L.h * 0.4 + 3);
  g.fillStyle = F.ink;
  g.fillText(G.text, cx, L.y + L.h * 0.4);
  const sign = `— ${opts.name || 'Traveller'}`;
  const ns = fit(g, sign, 600, S.n, L.w - 120);
  g.font = `600 ${ns}px ${FONT}`;
  g.fillStyle = F.ink2;
  g.fillText(sign, cx, L.y + L.h * 0.74);
  // footer: where to play
  const foot = `Play at ${LINK_TEXT}`;
  g.font = `600 ${S.f}px ${FONT}`;
  const fw = g.measureText(foot).width + 54;
  g.fillStyle = 'rgba(30,20,30,.55)'; roundRect(g, cx - fw / 2, S.foot - S.f * 0.85, fw, S.f * 1.7, S.f * 0.85); g.fill();
  g.fillStyle = '#fff4e2'; g.fillText(foot, cx, S.foot + 1);
  // felt decorations
  if (F.deco === 'flakes') {
    for (const [x, y] of [[P.x - 26, P.y - 26], [P.x + P.w + 26, P.y - 26], [P.x - 26, P.y + P.h + 4], [P.x + P.w + 26, P.y + P.h + 4]]) {
      g.fillStyle = '#b8302d'; g.beginPath(); g.arc(x, y, 25, 0, Math.PI * 2); g.fill();
      flake(g, x, y, 19, '#fff4e2');
    }
  } else if (F.deco === 'star') {
    star(g, S.w / 2, P.y + 6, 48, '#e9b44c', '#fff1c4');
  }
  return out;
}

// ---------------------------------------------------------------- colour grades (filters)
// Each look = CSS filter functions (live preview on the canvas) + a tinted overlay with a blend mode, and the same
// maths applied to the captured pixels (CanvasRenderingContext2D.filter is not available everywhere, e.g. Safari).
// env = small time-of-day look tweaks applied in 3D (key light / sky fill / glow / vignette), see index.js.
export const FILTERS = [
  { id: 'cosy', label: 'Cosy', fx: [], tint: null, env: null, swatch: 'linear-gradient(135deg,#f3b45a,#b8302d)' },
  {
    id: 'snowy', label: 'Snowy night', fx: [['saturate', 0.86], ['brightness', 1.02]], tint: { col: '#6f98ff', mode: 'soft-light', a: 0.6 },
    env: { key: '#9fbcff', keyK: 0.65, sky: '#a8c0ff', skyK: 0.5, exposure: 0.95, glow: 1.25, bloom: 1.2, vignette: -0.06 },
    swatch: 'linear-gradient(135deg,#cfe0ff,#3c5aa8)',
  },
  {
    id: 'golden', label: 'Golden hour', fx: [['saturate', 1.12], ['sepia', 0.1]], tint: { col: '#ffad52', mode: 'soft-light', a: 0.55 },
    env: { key: '#ffb768', keyK: 0.6, sky: '#ffd9b0', skyK: 0.35, exposure: 1.04, glow: 1.1, bloom: 1.1, vignette: 0 },
    swatch: 'linear-gradient(135deg,#ffe2a6,#e07a2c)',
  },
  {
    id: 'vintage', label: 'Vintage knit', fx: [['sepia', 0.6], ['saturate', 0.85], ['contrast', 0.92], ['brightness', 1.05]], tint: { col: '#c9a27a', mode: 'multiply', a: 0.16 },
    env: { vignette: -0.24, bloom: 0.9 },
    swatch: 'linear-gradient(135deg,#efe0c2,#8a6a48)',
  },
  {
    // dreamy portrait: much stronger background blur, brighter glow, and on the saved photo the out-of-focus lights
    // turn into soft round discs (see bokehDiscs)
    id: 'bokeh', label: 'Bokeh', fx: [['saturate', 1.08], ['brightness', 1.03]], tint: { col: '#ffcf8a', mode: 'soft-light', a: 0.22 },
    env: { exposure: 1.02, glow: 1.7, bloom: 1.55, vignette: -0.08 }, bokeh: { blur: 1.9, band: 0.55 },
    swatch: 'radial-gradient(circle at 30% 35%,#fff3c4 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,#ffd27a 0 22%,transparent 23%),linear-gradient(135deg,#7a4a8c,#2b2346)',
  },
];
export const filterById = (id) => FILTERS.find((f) => f.id === id) || FILTERS[0];
export const filterCSS = (f) => f.fx.map(([n, v]) => (n === 'hue' ? `hue-rotate(${v}deg)` : `${n}(${v})`)).join(' ') || 'none';

/** 3×4 colour matrix (rows r, g, b; last column = offset) for the filter functions, composed in order. */
function matrixOf(fx) {
  let M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const mul = (A, B) => { // A ∘ B (apply B first, then A)
    const o = new Array(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) o[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c];
      o[r * 4 + 3] = A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11] + A[r * 4 + 3];
    }
    return o;
  };
  for (const [n, v] of fx) {
    let F;
    if (n === 'saturate') F = [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v, 0];
    else if (n === 'sepia') { const a = 1 - v; F = [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a, 0]; }
    else if (n === 'brightness') F = [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    else if (n === 'contrast') { const o = (0.5 - 0.5 * v) * 255; F = [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o]; }
    else continue;
    M = mul(F, M);
  }
  return M;
}

/** Apply a look to a 2D canvas in place (pixel matrix + blended tint). */
/** Bokeh: bright spots outside the sharp band (fairy lights, lanterns, windows) become soft round light discs.
 *  focusY = the sharp band's centre (0 = top, 1 = bottom of the photo), band = its half-height (photo heights). */
export function bokehDiscs(cv, { focusY = 0.55, band = 0.1 } = {}) {
  const W = cv.width, H = cv.height;
  if (!W || !H) return;
  const S = 6, sw = Math.max(1, Math.round(W / S)), shh = Math.max(1, Math.round(H / S));
  const sm = document.createElement('canvas'); sm.width = sw; sm.height = shh;
  const sg = sm.getContext('2d', { willReadFrequently: true });
  sg.drawImage(cv, 0, 0, sw, shh);
  const d = sg.getImageData(0, 0, sw, shh).data;
  const cand = [];
  for (let y = 1; y < shh - 1; y++) {
    const away = Math.abs(y / shh - focusY) - band; // how far outside the sharp band
    if (away <= 0.02) continue;
    for (let x = 1; x < sw - 1; x++) {
      const i = (y * sw + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat0 = Math.max(r, g, b) - Math.min(r, g, b);
      // coloured lights only (fairy lights, lanterns, windows): white snow and falling flakes never make discs
      if (lum < 165 || sat0 < 46) continue;
      // a local peak only (light sources, not big bright snow fields)
      let peak = true, flat = 0;
      for (let oy = -1; oy <= 1 && peak; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const j = ((y + oy) * sw + x + ox) * 4, l2 = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
        if (l2 > lum) { peak = false; break; }
        if (l2 > lum - 10) flat++;
      }
      if (!peak || flat > 5) continue;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (away < 0.06) continue; // just outside the sharp band stays clean
      cand.push({ x: (x + 0.5) / sw, y: (y + 0.5) / shh, r, g, b, score: lum + sat * 0.6 + Math.min(1, away * 3) * 40, away });
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const picked = [], minD = 0.035;
  for (const c of cand) {
    if (picked.length >= 45) break;
    if (picked.some((p) => (p.x - c.x) ** 2 + ((p.y - c.y) * H / W) ** 2 < minD * minD)) continue;
    picked.push(c);
  }
  const g = cv.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'screen';
  for (const c of picked) {
    const rad = W * (0.024 + Math.min(1, c.away * 2.5) * 0.04);
    const cx = c.x * W, cy = c.y * H;
    const col = `${Math.min(255, c.r + 20)},${Math.min(255, c.g + 14)},${Math.min(255, c.b + 6)}`;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, `rgba(${col},0.42)`);
    gr.addColorStop(0.7, `rgba(${col},0.34)`);
    gr.addColorStop(0.88, `rgba(${col},0.5)`); // brighter rim, like a real lens disc
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

export function gradeCanvas(cv, f, opts) {
  if (f?.bokeh) { try { bokehDiscs(cv, opts); } catch (e) { console.warn('[photo] bokeh', e); } }
  if (!f || (!f.fx.length && !f.tint)) return;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (f.fx.length) {
    const M = matrixOf(f.fx);
    const img = g.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      d[i] = M[0] * r + M[1] * gg + M[2] * b + M[3];
      d[i + 1] = M[4] * r + M[5] * gg + M[6] * b + M[7];
      d[i + 2] = M[8] * r + M[9] * gg + M[10] * b + M[11];
    }
    g.putImageData(img, 0, 0);
  }
  if (f.tint) {
    g.save();
    g.globalCompositeOperation = f.tint.mode; g.globalAlpha = f.tint.a; g.fillStyle = f.tint.col;
    g.fillRect(0, 0, cv.width, cv.height);
    g.restore();
  }
}
