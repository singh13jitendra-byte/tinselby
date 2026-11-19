// Finale DOM overlay (in ctx.uiRoot, using theme.css variables / classes): gift tag card,
// big knitted Christmas Eve countdown numbers (10 → 1 to midnight), the "Merry Christmas!" banner and the end card.
const CSS = `
.fin-layer { position: absolute; inset: 0; pointer-events: none; font-family: var(--font); z-index: 40; }
.fin-tag { position: absolute; right: calc(5vw + var(--safe-r)); bottom: calc(10vh + var(--safe-b)); transform: rotate(-4deg); text-align: center;
  padding: 14px 26px 16px; min-width: 170px; animation: finTag .6s cubic-bezier(.2,1.6,.4,1) both; }
.fin-tag .fin-tag-for { font: 600 15px/1 var(--font); letter-spacing: .14em; text-transform: uppercase; color: var(--red); }
.fin-tag .fin-tag-name { font: 700 30px/1.15 var(--font); color: var(--red-dark); margin-top: 4px; word-break: break-word; }
.fin-tag .fin-tag-from { font: 500 13px/1 var(--font); color: var(--ink); opacity: .7; margin-top: 6px; }
.fin-tag::before { content: ''; position: absolute; left: 50%; top: -12px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%;
  border: 3px solid var(--gold); background: transparent; }
@keyframes finTag { from { opacity: 0; transform: translateY(30px) rotate(8deg) scale(.6); } to { opacity: 1; transform: rotate(-4deg); } }
.fin-count { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); display: grid; place-items: center; }
.fin-count span { grid-area: 1 / 1; font: 700 min(38vh, 30vw)/1 var(--font); letter-spacing: -0.02em; }
.fin-count .back { color: var(--cream); -webkit-text-stroke: min(3.2vh, 2.6vw) var(--cream);
  filter: drop-shadow(0 7px 0 var(--red-dark)) drop-shadow(0 18px 28px rgba(10,10,30,.5)); }
.fin-count .front { color: transparent; -webkit-background-clip: text; background-clip: text;
  background-color: var(--red);
  background-image: repeating-linear-gradient(62deg, rgba(255,255,255,0) 0 7px, rgba(255,255,255,.22) 7px 9px, rgba(0,0,0,0) 9px 16px),
    repeating-linear-gradient(-62deg, rgba(255,255,255,0) 0 7px, rgba(255,255,255,.22) 7px 9px, rgba(0,0,0,0) 9px 16px),
    repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 2px, rgba(0,0,0,0) 2px 14px),
    linear-gradient(180deg, #d43a35, #9c2624);
  -webkit-text-stroke: 3px rgba(255,244,226,.6); }
.fin-count.pop { animation: finPop .55s cubic-bezier(.2,1.5,.35,1) both; }
@keyframes finPop { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.3) rotate(-10deg); } 35% { opacity: 1; transform: translate(-50%,-50%) scale(1.08) rotate(2deg); }
  100% { opacity: 1; transform: translate(-50%,-50%) scale(1) rotate(0); } }
.fin-label { position: absolute; left: 50%; top: calc(16px + var(--safe-t)); transform: translateX(-50%); white-space: nowrap;
  padding: 7px 18px 8px; border-radius: 999px; background: rgba(40,22,18,.42); animation: finLab .6s ease both; }
.fin-label .knit-sub { font-size: clamp(11px, 1.7vw, 15px); }
@keyframes finLab { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translateX(-50%); } }
.fin-xmas { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); text-align: center; animation: finXmas 1.2s cubic-bezier(.2,1.4,.4,1) both; white-space: nowrap;
  transition: opacity .9s ease, top .9s ease; }
.fin-xmas.out { opacity: 0; top: 24%; }
.fin-xmas .knit-title { font-size: clamp(40px, 9.5vw, 110px); }
.fin-xmas .stitch { display: flex; gap: 10px; justify-content: center; margin-top: 12px; }
.fin-xmas .stitch i { width: 13px; height: 13px; border-radius: 50%; background: var(--gold); box-shadow: 0 2px 0 rgba(0,0,0,.25), 0 0 12px rgba(255,200,110,.7); }
.fin-xmas .stitch i:nth-child(2n) { background: var(--red); } .fin-xmas .stitch i:nth-child(3n) { background: var(--green); }
@keyframes finXmas { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.5); } 60% { opacity: 1; transform: translate(-50%,-50%) scale(1.05); }
  100% { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
.fin-end { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; max-width: min(92vw, 640px);
  padding: 30px 40px 28px; animation: finEnd .9s cubic-bezier(.2,1.4,.4,1) both; }
.fin-end h1 { margin: 0; font: 700 clamp(26px, 5.4vw, 52px)/1.1 var(--font); color: var(--red); text-shadow: 0 2px 0 rgba(139,37,35,.25); word-break: break-word; }
.fin-end .love { margin: 10px 0 20px; font: 500 clamp(16px, 2.4vw, 22px)/1.2 var(--font); color: var(--ink); }
.fin-end .stitch { display: flex; gap: 8px; justify-content: center; margin: 0 0 14px; }
.fin-end .stitch i { width: 12px; height: 12px; border-radius: 50%; background: var(--gold); box-shadow: 0 2px 0 rgba(0,0,0,.15); }
.fin-end .stitch i:nth-child(2n) { background: var(--red); } .fin-end .stitch i:nth-child(3n) { background: var(--green); }
@keyframes finEnd { from { opacity: 0; transform: translate(-50%, -40%) scale(.7); } to { opacity: 1; transform: translate(-50%, -50%); } }
/* portrait phones: wrap the long lines inside the narrow width, keep the tag clear of the bottom thumb zone */
@media (orientation: portrait) {
  .fin-label { white-space: normal; width: max-content; max-width: 90vw; text-align: center; top: calc(14px + var(--safe-t)); }
  .fin-count { top: 40%; }
  .fin-count span { font-size: min(30vh, 52vw); }
  .fin-count .back { -webkit-text-stroke: min(2.6vh, 4.4vw) var(--cream); }
  .fin-xmas { white-space: normal; width: 92vw; top: 24%; }
  .fin-xmas.out { top: 19%; }
  .fin-xmas .knit-title { font-size: clamp(44px, 15vw, 96px); line-height: 1.02; }
  .fin-tag { right: 50%; bottom: calc(12vh + var(--safe-b)); transform: translateX(50%) rotate(-4deg); animation-name: finTagP; }
  @keyframes finTagP { from { opacity: 0; transform: translateX(50%) translateY(30px) rotate(8deg) scale(.6); } to { opacity: 1; transform: translateX(50%) rotate(-4deg); } }
  .fin-end { width: 90vw; padding: 24px 20px 22px; }
}

/* ---- wave 3: Town Spirit banner, gift label on the tag, preview labels, Christmas Eve end card ---- */
.fin-spirit { position: absolute; left: 50%; top: calc(16px + var(--safe-t)); transform: translateX(-50%); text-align: center;
  padding: 12px 30px 14px; min-width: 300px; max-width: min(92vw, 700px); animation: finSpirit .7s cubic-bezier(.2,1.5,.4,1) both;
  transition: opacity .6s ease, transform .6s ease; }
.fin-spirit.out { opacity: 0; transform: translate(-50%, -14px); }
.fin-spirit .k { font: 600 13px/1 var(--font); letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
.fin-spirit .big { font: 700 clamp(22px, 3.2vw, 34px)/1.1 var(--font); color: var(--red); margin-top: 5px; white-space: nowrap; }
.fin-spirit .big b { display: inline-block; min-width: 1.6ch; font-variant-numeric: tabular-nums; }
.fin-spirit .by { font: 500 clamp(14px, 1.8vw, 18px)/1.25 var(--font); color: var(--ink); margin-top: 4px; }
.fin-spirit .stitch { display: flex; gap: 7px; justify-content: center; margin-top: 9px; }
.fin-spirit .stitch i { width: 9px; height: 9px; border-radius: 50%; background: var(--gold); opacity: .25; transition: opacity .25s, transform .25s; }
.fin-spirit .stitch i.on { opacity: 1; transform: scale(1.15); }
.fin-spirit .stitch i:nth-child(2n) { background: var(--red); } .fin-spirit .stitch i:nth-child(3n) { background: var(--green); }
@keyframes finSpirit { from { opacity: 0; transform: translate(-50%, -30px) scale(.7); } to { opacity: 1; transform: translateX(-50%); } }
.fin-tag .fin-tag-gift { font: 600 17px/1.15 var(--font); color: var(--green); margin-top: 6px; }
.fin-prev { position: absolute; left: 50%; top: calc(16px + var(--safe-t)); transform: translateX(-50%); text-align: center; white-space: nowrap;
  padding: 8px 20px 9px; border-radius: 999px; background: rgba(40,22,18,.42); animation: finLab .6s ease both; transition: opacity .6s ease; }
.fin-prev.out { opacity: 0; }
.fin-prev .knit-sub { font-size: clamp(12px, 1.8vw, 16px); }
.fin-prev.big { top: auto; bottom: calc(16% + var(--safe-b)); background: none; padding: 0; }
.fin-prev.big .knit-title { font-size: clamp(26px, 5vw, 56px); white-space: normal; }
.fin-end .gift { margin: -6px 0 12px; font: 600 clamp(16px, 2.3vw, 21px)/1.25 var(--font); color: var(--green); }
.fin-end .gift small { display: block; font: 500 13px/1.3 var(--font); color: var(--ink); opacity: .7; margin-top: 2px; }
.fin-end .doors { margin: 0 0 18px; font: 500 clamp(14px, 1.9vw, 17px)/1.3 var(--font); color: var(--ink); opacity: .85; }
.fin-end .btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
/* short landscape phones (812 × 375, 667 × 375): compact banner and end card, so the star and both buttons stay in view */
@media (max-height: 520px) and (orientation: landscape) {
  .fin-spirit { top: calc(8px + var(--safe-t)); padding: 7px 22px 9px; min-width: 0; }
  .fin-spirit .k { font-size: 11px; }
  .fin-spirit .big { font-size: clamp(17px, 5.2vh, 24px); margin-top: 3px; }
  .fin-spirit .by { font-size: 13px; margin-top: 2px; }
  .fin-spirit .stitch { display: none; }
  .fin-end { width: min(88vw, 580px); padding: 12px 26px 14px; outline-offset: -7px; }
  .fin-end .stitch { margin: 0 0 6px; }
  .fin-end .stitch i { width: 9px; height: 9px; }
  .fin-end h1 { font-size: clamp(22px, 8.4vh, 36px); }
  .fin-end .love { margin: 4px 0 8px; font-size: 15px; }
  .fin-end .gift { margin: -2px 0 6px; font-size: 15px; }
  .fin-end .gift small { display: inline; margin: 0 0 0 6px; font-size: 12px; }
  .fin-end .doors { margin: 0 0 10px; font-size: 13px; }
  .fin-end .btns { flex-wrap: nowrap; gap: 12px; }
  .fin-end .knit-btn { min-height: 44px; padding: 11px 20px; font-size: 16px; }
  .fin-prev.big { bottom: calc(10% + var(--safe-b)); }
  .fin-prev.big .knit-title { font-size: clamp(22px, 8vh, 40px); }
}
@media (orientation: portrait) {
  .fin-spirit { min-width: 0; width: 90vw; padding: 12px 16px 14px; }
  .fin-spirit .big { white-space: normal; }
  .fin-prev { white-space: normal; width: max-content; max-width: 90vw; }
  .fin-prev.big { width: 90vw; bottom: calc(18% + var(--safe-b)); }
  .fin-end .btns { flex-direction: column; align-items: stretch; gap: 12px; }
}
`;

export function createOverlay(root) {
  if (!document.getElementById('fin-style')) {
    const st = document.createElement('style');
    st.id = 'fin-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const layer = document.createElement('div');
  layer.className = 'fin-layer';
  (root || document.body).appendChild(layer);
  let tag = null, count = null, label = null, xmas = null;
  let spiritEl = null, spiritN = null, spiritDots = [], spiritC = null, prevEl = null, endEl = null;
  const fadeOut = (e, cls = 'out', ms = 700) => { if (!e) return; e.classList.add(cls); setTimeout(() => e.remove(), ms); };

  return {
    layer,
    giftTag(name, giftLabel = null) {
      tag?.remove();
      tag = el('div', 'knit-card fin-tag', layer);
      el('div', 'fin-tag-for', tag).textContent = 'For';
      el('div', 'fin-tag-name', tag).textContent = name;
      if (giftLabel) el('div', 'fin-tag-gift', tag).textContent = giftLabel;
      el('div', 'fin-tag-from', tag).textContent = '— with love, Santa';
    },
    /** Wave 3: the Town Spirit banner. Online with friends: "{doors} Advent doors opened" / "by {helpers} friends in
     *  Tinselby"; on your own: "You opened {mine} Advent doors!". The number counts up over 2.5 s (driven by update(dt)). */
    spirit({ doors = 0, helpers = 1, mine = 0, together = helpers > 1 } = {}) {
      spiritEl?.remove();
      spiritEl = el('div', 'knit-card fin-spirit', layer);
      el('div', 'k', spiritEl).textContent = 'Town Spirit';
      const big = el('div', 'big', spiritEl);
      const target = together ? doors : mine;
      if (together) {
        spiritN = el('b', '', big); big.append(' Advent doors opened');
        el('div', 'by', spiritEl).textContent = `by ${helpers} friends in Tinselby`;
      } else {
        big.append('You opened '); spiritN = el('b', '', big); big.append(` Advent door${target === 1 ? '' : 's'}!`);
      }
      spiritN.textContent = '0';
      const st = el('div', 'stitch', spiritEl);
      spiritDots = Array.from({ length: 9 }, () => el('i', '', st));
      spiritC = { t: 0, dur: 2.5, target: Math.max(0, Math.round(target)) };
    },
    hideSpirit() { fadeOut(spiritEl); spiritEl = null; spiritC = null; },
    /** Advance timeline-driven overlay animations (Town Spirit count-up). */
    update(dt) {
      if (!spiritC || !spiritN) return;
      spiritC.t = Math.min(spiritC.dur, spiritC.t + dt);
      const k = spiritC.t / spiritC.dur, e = 1 - Math.pow(1 - k, 3);
      spiritN.textContent = String(Math.round(spiritC.target * e));
      const on = Math.round(e * spiritDots.length);
      spiritDots.forEach((d, i) => d.classList.toggle('on', i < on));
      if (k >= 1) spiritC = null;
    },
    /** Wave 3 preview: a small pill label at the top, or (big) a knitted title low on the screen. */
    previewLabel(text, { big = false } = {}) {
      fadeOut(prevEl);
      prevEl = el('div', 'fin-prev' + (big ? ' big' : ''), layer);
      el('div', big ? 'knit-title' : 'knit-sub', prevEl).textContent = text;
    },
    hidePreview() { fadeOut(prevEl); prevEl = null; },
    /** Wave 3 end card: stitches, greeting, Santa's gift, doors opened together, Keep exploring / Watch again. */
    eveCard({ name, gift = null, doors = 0, onKeep, onAgain }) {
      xmas?.remove(); xmas = null;
      count?.remove(); count = null;
      label?.remove(); label = null;
      endEl?.remove();
      const card = endEl = el('div', 'knit-card fin-end interactive', layer);
      const st = el('div', 'stitch', card);
      for (let i = 0; i < 7; i++) el('i', '', st);
      el('h1', '', card).textContent = `Merry Christmas, ${name}!`;
      el('div', 'love', card).textContent = '\u2014 love, Tinselby';
      if (gift?.label) {
        const g = el('div', 'gift', card);
        g.append(`Santa's gift: ${gift.label}`);
        el('small', '', g).textContent = "You're wearing it!";
      }
      if (doors > 0) el('div', 'doors', card).textContent = `${doors} Advent door${doors === 1 ? '' : 's'} opened together`;
      const btns = el('div', 'btns', card);
      const keep = el('button', 'knit-btn green', btns);
      keep.textContent = 'Keep exploring';
      keep.addEventListener('click', (e) => { e.stopPropagation(); onKeep?.(); });
      const again = el('button', 'knit-btn cream', btns);
      again.textContent = 'Watch again';
      again.addEventListener('click', (e) => { e.stopPropagation(); onAgain?.(); });
      setTimeout(() => { try { if (keep.isConnected) keep.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 900);
      return card;
    },
    /** Remove every overlay at once (finale exit / reset). */
    clear() {
      for (const e of [tag, count, label, xmas, spiritEl, prevEl, endEl]) e?.remove();
      tag = count = label = xmas = spiritEl = prevEl = endEl = null;
      spiritC = null;
    },
    hideTag() { if (tag) { tag.style.transition = 'opacity .5s'; tag.style.opacity = '0'; const t = tag; tag = null; setTimeout(() => t.remove(), 600); } },
    countdown(n) {
      if (!label) {
        label = el('div', 'fin-label', layer);
        el('div', 'knit-sub', label).textContent = 'Christmas Eve \u00b7 countdown to midnight';
      }
      count?.remove();
      count = el('div', 'fin-count pop', layer);
      el('span', 'back', count).textContent = String(n);
      el('span', 'front', count).textContent = String(n);
    },
    christmas() {
      count?.remove(); count = null;
      label?.remove(); label = null;
      xmas?.remove();
      xmas = el('div', 'fin-xmas', layer);
      el('div', 'knit-title', xmas).textContent = 'Merry Christmas!';
      const st = el('div', 'stitch', xmas);
      for (let i = 0; i < 9; i++) el('i', '', st);
    },
    /** Fade the banner out (driven by the finale timeline, so it also behaves with stepped / paused time). */
    hideChristmas() {
      if (!xmas) return;
      const x = xmas; xmas = null;
      x.classList.add('out');
      setTimeout(() => x.remove(), 1000);
    },
    endCard(name, onReplay) {
      xmas?.remove(); xmas = null;
      count?.remove(); count = null;
      label?.remove(); label = null;
      const card = el('div', 'knit-card fin-end interactive', layer);
      const st = el('div', 'stitch', card);
      for (let i = 0; i < 7; i++) el('i', '', st);
      el('h1', '', card).textContent = `Merry Christmas, ${name}!`;
      el('div', 'love', card).textContent = '— love, Tinselby';
      const b = el('button', 'knit-btn green', card);
      b.textContent = 'Play again';
      b.addEventListener('click', (e) => { e.stopPropagation(); onReplay?.(); });
      setTimeout(() => { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 900);
      return card;
    },
  };
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}
