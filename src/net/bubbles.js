// Speech bubbles (wave 4, PLAY.md §Bubbles): DOM pills floating above heads — no draw calls. One bubble per player
// (a new one replaces the old text), fades in, holds `ms` (default 3500), fades out. Styled like the name tags in
// tags.js, inverted: a cream felt pill with a red running stitch and a little tail, above the red name-tag patch.
// The caller passes the anchor (world point at the top of the name tag) each frame; text is set with textContent.
import * as THREE from 'three';

const DEFAULT_MS = 3500, FADE_MS = 260, MAX_CHARS = 60;
const CSS = `
.tb-bubbles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 4; }
.tb-bub { position: absolute; left: 0; top: 0; will-change: transform, opacity; opacity: 0; transition: opacity ${FADE_MS}ms ease-out;
  font-family: Fredoka, "Trebuchet MS", system-ui, sans-serif; font-weight: 600; }
.tb-bub.on { opacity: 1; }
.tb-bub > span { display: block; position: relative; transform: translate(-50%, -100%) scale(0.7); transform-origin: 50% 100%;
  transition: transform ${FADE_MS + 60}ms cubic-bezier(.3,1.6,.5,1); max-width: min(190px, 46vw); padding: 6px 13px 7px;
  background: #fff6e6; color: #5a1d17; font-size: 15px; line-height: 1.15; text-align: center; white-space: normal; overflow-wrap: anywhere;
  border-radius: 16px; box-shadow: 0 2px 5px rgba(20,10,20,0.35), inset 0 -3px 0 rgba(120,60,40,0.12);
  outline: 2px dashed #b73a32; outline-offset: -5px; }
.tb-bub.on > span { transform: translate(-50%, -100%) scale(1); }
.tb-bub > span::after { content: ''; position: absolute; left: 50%; bottom: -6px; width: 12px; height: 12px; margin-left: -6px;
  background: #fff6e6; transform: rotate(45deg); border-radius: 0 0 3px 0; box-shadow: 2px 2px 3px rgba(20,10,20,0.18); }
.tb-bub.self > span { outline-color: #d99a1e; }
@media (max-width: 520px), (max-height: 420px) { .tb-bub > span { font-size: 13px; padding: 5px 11px 6px; } }
`;

export function createBubbles(ctx) {
  const { engine } = ctx;
  const host = ctx.uiRoot || (typeof document !== 'undefined' ? document.body : null);
  if (!host) return { show() {}, hide() {}, clear() {}, clearExcept() {}, update() {}, get count() { return 0; } };
  if (!document.getElementById('tb-bubbles-css')) {
    const st = document.createElement('style');
    st.id = 'tb-bubbles-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'tb-bubbles';
  host.appendChild(root);
  const items = new Map(); // id → {el, span, until, on, gone}
  const v = new THREE.Vector3();

  function show(id, text, ms = DEFAULT_MS, self = false) {
    if (typeof id !== 'string' || !id) return false;
    let t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
    if (!t) return false;
    if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS - 1) + '…';
    let it = items.get(id);
    if (!it) {
      const el = document.createElement('div');
      el.className = 'tb-bub' + (self ? ' self' : '');
      const span = document.createElement('span');
      el.appendChild(span);
      root.appendChild(el);
      it = { el, span, until: 0, on: false, gone: 0, shown: false };
      items.set(id, it);
    }
    it.span.textContent = t;
    const d = Number.isFinite(+ms) ? Math.max(600, Math.min(15000, +ms)) : DEFAULT_MS;
    it.until = performance.now() + d;
    it.gone = 0;
    if (it.on) { it.el.classList.remove('on'); void it.el.offsetWidth; } // replay the pop for a new phrase
    it.on = false;
    return true;
  }
  function remove(id) {
    const it = items.get(id);
    if (!it) return;
    it.el.remove();
    items.delete(id);
  }
  function hide(id) { const it = items.get(id); if (it) it.until = 0; }
  function clear(id) { if (id === undefined) { for (const k of [...items.keys()]) remove(k); } else remove(id); }
  function clearExcept(keep) { for (const k of [...items.keys()]) if (k !== keep) remove(k); }

  /**
   * Per frame, after the camera moved. anchors: Map id → {x, y, z, k} (world point just above the name tag, k = 0..1
   * visibility) or nothing when that player can't show a bubble right now (hidden, muted, not drawn).
   */
  function update(anchors, hiddenAll) {
    if (!items.size) return;
    const now = performance.now();
    const cam = engine.camera, cv = engine.renderer.domElement;
    const W = cv.clientWidth || innerWidth, H = cv.clientHeight || innerHeight;
    const hr = root.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    const ox = cr.left - hr.left, oy = cr.top - hr.top;
    for (const [id, it] of items) {
      const a = !hiddenAll && anchors.get(id);
      const live = now < it.until;
      let show = false;
      if (live && a && a.k > 0.3) {
        v.set(a.x, a.y, a.z).project(cam);
        if (v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.2) {
          const px = ox + (v.x * 0.5 + 0.5) * W, py = oy + (0.5 - v.y * 0.5) * H - 6;
          it.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
          show = true;
        }
      }
      if (show !== it.on) { it.on = show; it.el.classList.toggle('on', show); }
      if (!live) { if (!it.gone) it.gone = now; else if (now - it.gone > FADE_MS + 80) remove(id); }
    }
  }
  return { show, hide, clear, clearExcept, update, get count() { return items.size; }, root };
}
