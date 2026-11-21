// Christmas card compositing (2D canvas only): 1080 × 1350 portrait, knitted frame, photo window, felt label with the
// greeting (big) + "from <name>", and a small "tinselby" wordmark at the bottom. Same knit look as src/photo/frames.js.
import { greetingText } from './link.js';

export const CARD_W = 1080, CARD_H = 1350;
/** The photo window inside the card (the 3D shot is rendered at this aspect). */
export const PHOTO = { x: 66, y: 66, w: 948, h: 862 };
const LABEL = { x: 66, y: 960, w: 948, h: 296 };
const FONT = "Fredoka, Nunito, 'Trebuchet MS', system-ui, sans-serif";

/** Knitted frame styles. knit(c, r) → stitch colour; seam = running stitch; deco = felt bits round the photo. */
export const FRAME_STYLES = {
  f1: { // red knit, cream seams, felt snowflakes on the corners
    swatch: '#b8302d', seam: '#fff4e2', labelStitch: 'rgba(184,48,45,.55)', ink: '#b8302d', ink2: '#3f6e45', word: '#fff4e2', deco: 'flakes',
    knit: (c, r) => (r % 9 === 4 ? '#a12825' : '#b8302d'),
  },
  f2: { // green knit with a cream Fair Isle band, gold seams and a gold star
    swatch: '#3f6e45', seam: '#e9b44c', labelStitch: 'rgba(63,110,69,.6)', ink: '#2f5e3e', ink2: '#b8302d', word: '#fff4e2', deco: 'star',
    knit: (c, r) => {
      const b = ((r % 14) + 14) % 14;
      if (b === 6 || b === 8) return c % 2 ? '#f1e6d0' : '#3f6e45';
      if (b === 7) return c % 4 === 1 ? '#c8322e' : '#f1e6d0';
      return r % 7 === 3 ? '#376140' : '#3f6e45';
    },
  },
  f3: { // cream knit, red seams, holly sprigs on the corners
    swatch: '#efe3cc', seam: '#b8302d', labelStitch: 'rgba(63,110,69,.55)', ink: '#b8302d', ink2: '#3f6e45', word: '#7a2a24', deco: 'holly',
    knit: (c, r) => (r % 10 === 5 ? '#e2d2b2' : '#efe3cc'),
  },
};
export const frameStyle = (id) => FRAME_STYLES[id] || FRAME_STYLES.f1;

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

/** The knitted background for a frame style (cached: it never changes). */
const knitCache = new Map();
function knitBackground(id) {
  if (knitCache.has(id)) return knitCache.get(id);
  const F = frameStyle(id);
  const cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const g = cv.getContext('2d');
  const sw = 18, sh = 15;
  g.fillStyle = shade(F.knit(0, 0), 0.62);
  g.fillRect(0, 0, CARD_W, CARD_H);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const P = PHOTO;
  const cols = Math.ceil(CARD_W / sw) + 1, rows = Math.ceil(CARD_H / sh) + 1;
  for (let r = 0; r < rows; r++) {
    const cy = r * sh + sh / 2;
    for (let c = 0; c < cols; c++) {
      const cx = c * sw + sw / 2;
      if (cx > P.x + 14 && cx < P.x + P.w - 14 && cy > P.y + 14 && cy < P.y + P.h - 14) continue;
      const col = F.knit(c, r), j = 0.9 + rnd() * 0.16;
      for (const s of [-1, 1]) {
        const ex = cx + s * sw * 0.23;
        g.fillStyle = shade(col, 0.8 * j);
        g.beginPath(); g.ellipse(ex, cy + 1, sw * 0.27, sh * 0.62, s * 0.55, 0, Math.PI * 2); g.fill();
        g.fillStyle = shade(col, 1.04 * j);
        g.beginPath(); g.ellipse(ex - s * 0.6, cy - 1, sw * 0.19, sh * 0.48, s * 0.55, 0, Math.PI * 2); g.fill();
      }
    }
  }
  knitCache.set(id, cv);
  return cv;
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
  const path = (k) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = (i % 2 ? R * 0.45 : R) * k; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
  path(1);
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
  g.fillStyle = fill; g.fill();
  g.shadowColor = 'transparent';
  g.setLineDash([7, 6]); g.lineWidth = 3; g.strokeStyle = line;
  path(0.72); g.stroke();
  g.restore();
}
/** A felt holly leaf (pointy lobes) along angle a, length L. */
function hollyLeaf(g, x, y, a, L) {
  g.save();
  g.translate(x, y); g.rotate(a);
  const W = L * 0.36, n = 3;
  g.beginPath();
  g.moveTo(0, 0);
  for (let i = 1; i <= n; i++) { // upper edge: scallops between spikes
    const t0 = (i - 1) / n, t1 = i / n, tm = (t0 + t1) / 2;
    const w = (t) => Math.sin(Math.PI * t) * W;
    g.quadraticCurveTo(L * tm, -w(tm) * 0.55, L * t1, -w(t1) - (i < n ? W * 0.28 : 0));
  }
  for (let i = n; i >= 1; i--) {
    const t0 = (i - 1) / n, t1 = i / n, tm = (t0 + t1) / 2;
    const w = (t) => Math.sin(Math.PI * t) * W;
    g.quadraticCurveTo(L * tm, w(tm) * 0.55, L * t0, i > 1 ? w(t0) + W * 0.28 : 0);
  }
  g.closePath();
  g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  g.fillStyle = '#2f6b3c'; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#8fc59a'; g.lineWidth = 3; g.setLineDash([8, 7]);
  g.beginPath(); g.moveTo(L * 0.08, 0); g.lineTo(L * 0.9, 0); g.stroke();
  g.restore();
}
function holly(g, x, y, a) {
  hollyLeaf(g, x, y, a - 0.55, 74);
  hollyLeaf(g, x, y, a + 0.55, 74);
  for (const [dx, dy] of [[-9, -4], [9, -6], [0, 9]]) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    g.fillStyle = '#c8322e'; g.beginPath(); g.arc(x + dx, y + dy, 13, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x + dx - 4, y + dy - 4, 3.5, 0, Math.PI * 2); g.fill();
  }
}

/** Largest font size ≤ size at which text fits maxW. */
function fit(g, text, weight, size, maxW, min = 20) {
  let s = size;
  for (; s > min; s -= 2) { g.font = `${weight} ${s}px ${FONT}`; if (g.measureText(text).width <= maxW) break; }
  return s;
}
/** Split a greeting into two balanced lines (at a space), or null if it has no space. */
function twoLines(text) {
  const words = text.split(' ');
  if (words.length < 2) return null;
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const d = Math.abs(a.length - b.length);
    if (!best || d < best.d) best = { a, b, d };
  }
  return [best.a, best.b];
}
function inked(g, text, x, y, col) {
  g.fillStyle = shade(col, 0.68); g.fillText(text, x, y + 4);
  g.fillStyle = col; g.fillText(text, x, y);
}

/**
 * Paint a card into `out` (resized to 1080 × 1350). photo = canvas (any size; drawn cover-fit into the photo window).
 * opts = { greeting: 'g1'…, frame: 'f1'…, name }.
 */
export function drawCard(out, photo, opts = {}) {
  const F = frameStyle(opts.frame);
  out.width = CARD_W; out.height = CARD_H;
  const g = out.getContext('2d');
  g.drawImage(knitBackground(opts.frame in FRAME_STYLES ? opts.frame : 'f1'), 0, 0);
  seam(g, 22, 22, CARD_W - 44, CARD_H - 44, 30, F.seam, 4);
  // photo (cover-fit, centred) in a rounded window
  const P = PHOTO;
  g.save();
  roundRect(g, P.x, P.y, P.w, P.h, 26); g.clip();
  g.fillStyle = '#2b3452'; g.fillRect(P.x, P.y, P.w, P.h);
  if (photo && photo.width && photo.height) {
    const k = Math.max(P.w / photo.width, P.h / photo.height);
    const sw = P.w / k, sh = P.h / k;
    g.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, P.x, P.y, P.w, P.h);
  }
  const ish = g.createLinearGradient(0, P.y, 0, P.y + 28);
  ish.addColorStop(0, 'rgba(30,15,10,.32)'); ish.addColorStop(1, 'rgba(30,15,10,0)');
  g.fillStyle = ish; g.fillRect(P.x, P.y, P.w, 28);
  g.lineWidth = 6; g.strokeStyle = 'rgba(30,15,10,.25)'; roundRect(g, P.x, P.y, P.w, P.h, 26); g.stroke();
  g.restore();
  seam(g, P.x - 12, P.y - 12, P.w + 24, P.h + 24, 34, F.seam, 5);

  // felt label: greeting (big) + "from <name>"
  const L = LABEL;
  g.save();
  g.shadowColor = 'rgba(20,10,5,.35)'; g.shadowBlur = 16; g.shadowOffsetY = 6;
  g.fillStyle = '#fff4e2'; roundRect(g, L.x, L.y, L.w, L.h, 28); g.fill();
  g.restore();
  g.save();
  roundRect(g, L.x, L.y, L.w, L.h, 28); g.clip();
  g.globalAlpha = 0.05; g.fillStyle = '#5a3a20';
  for (let x = L.x; x < L.x + L.w; x += 12) g.fillRect(x, L.y, 6, L.h);
  g.restore();
  seam(g, L.x + 12, L.y + 12, L.w - 24, L.h - 24, 18, F.labelStitch, 3.5);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = L.x + L.w / 2, maxW = L.w - 96;
  const text = greetingText(opts.greeting) || greetingText('g1');
  const one = fit(g, text, 700, 112, maxW);
  const split = one < 84 ? twoLines(text) : null;
  if (split) { // two lines, then the sender a little smaller so all three fit the label
    const s = Math.min(fit(g, split[0], 700, 80, maxW), fit(g, split[1], 700, 80, maxW));
    g.font = `700 ${s}px ${FONT}`;
    inked(g, split[0], cx, L.y + 66, F.ink);
    inked(g, split[1], cx, L.y + 66 + s * 0.98, F.ink);
  } else {
    g.font = `700 ${one}px ${FONT}`;
    inked(g, text, cx, L.y + 116, F.ink);
  }
  const from = `from ${opts.name || 'a friend'}`;
  const ns = fit(g, from, 600, split ? 46 : 56, L.w - 140);
  g.font = `600 ${ns}px ${FONT}`;
  g.fillStyle = F.ink2;
  g.fillText(from, cx, L.y + L.h - (split ? 46 : 58));

  // small wordmark at the bottom
  g.font = `700 34px ${FONT}`;
  const word = 'tinselby';
  const ww = g.measureText(word).width;
  g.fillStyle = 'rgba(30,20,30,.38)'; roundRect(g, cx - ww / 2 - 26, CARD_H - 70, ww + 52, 46, 23); g.fill();
  g.fillStyle = F.word === '#7a2a24' ? '#fff4e2' : F.word; g.fillText(word, cx, CARD_H - 46);
  star(g, cx - ww / 2 - 8, CARD_H - 47, 9, '#e9b44c', 'rgba(255,241,196,0)');

  // felt decorations
  if (F.deco === 'flakes') {
    for (const [x, y] of [[P.x - 24, P.y - 24], [P.x + P.w + 24, P.y - 24], [P.x - 24, P.y + P.h + 6], [P.x + P.w + 24, P.y + P.h + 6]]) {
      g.save(); g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
      g.fillStyle = '#9e2522'; g.beginPath(); g.arc(x, y, 27, 0, Math.PI * 2); g.fill(); g.restore();
      flake(g, x, y, 20, '#fff4e2');
    }
  } else if (F.deco === 'star') {
    star(g, CARD_W / 2, P.y + 4, 50, '#e9b44c', '#fff1c4');
  } else if (F.deco === 'holly') {
    holly(g, P.x + 10, P.y + 10, Math.PI * 0.25);
    holly(g, P.x + P.w - 10, P.y + 10, Math.PI * 0.75);
    holly(g, P.x + 10, P.y + P.h - 6, -Math.PI * 0.25);
    holly(g, P.x + P.w - 10, P.y + P.h - 6, -Math.PI * 0.75);
  }
  return out;
}
