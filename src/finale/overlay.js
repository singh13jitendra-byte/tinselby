// Finale DOM overlay (in ctx.uiRoot, using theme.css variables / classes): gift tag card,
// big knitted countdown numbers, "Happy New Year" banner and the end card.
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
.fin-label { position: absolute; left: 50%; top: calc(14px + var(--safe-t)); transform: translateX(-50%); }
.fin-ny { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); text-align: center; animation: finNY 6s ease both; white-space: nowrap; }
.fin-ny .knit-title { font-size: clamp(34px, 8vw, 92px); }
.fin-ny .year { font: 700 clamp(28px, 6vw, 72px)/1 var(--font); color: var(--gold); text-shadow: 0 3px 0 var(--red-dark), 0 8px 24px rgba(0,0,0,.45); margin-top: 6px; letter-spacing: .12em; }
@keyframes finNY { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.5); } 12% { opacity: 1; transform: translate(-50%,-50%) scale(1.05); }
  20% { transform: translate(-50%,-50%) scale(1); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-60%) scale(1); } }
.fin-end { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; max-width: min(92vw, 640px);
  padding: 30px 40px 28px; animation: finEnd .9s cubic-bezier(.2,1.4,.4,1) both; }
.fin-end h1 { margin: 0; font: 700 clamp(26px, 5.4vw, 52px)/1.1 var(--font); color: var(--red); text-shadow: 0 2px 0 rgba(139,37,35,.25); word-break: break-word; }
.fin-end .love { margin-top: 10px; font: 500 clamp(16px, 2.4vw, 22px)/1.2 var(--font); color: var(--ink); }
.fin-end .yr { margin: 6px 0 18px; font: 600 13px/1 var(--font); letter-spacing: .3em; color: var(--green); text-transform: uppercase; }
.fin-end .stitch { display: flex; gap: 8px; justify-content: center; margin: 0 0 14px; }
.fin-end .stitch i { width: 12px; height: 12px; border-radius: 50%; background: var(--gold); box-shadow: 0 2px 0 rgba(0,0,0,.15); }
.fin-end .stitch i:nth-child(2n) { background: var(--red); } .fin-end .stitch i:nth-child(3n) { background: var(--green); }
@keyframes finEnd { from { opacity: 0; transform: translate(-50%, -40%) scale(.7); } to { opacity: 1; transform: translate(-50%, -50%); } }
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
  let tag = null, count = null, ny = null;

  return {
    layer,
    giftTag(name) {
      tag?.remove();
      tag = el('div', 'knit-card fin-tag', layer);
      el('div', 'fin-tag-for', tag).textContent = 'For';
      el('div', 'fin-tag-name', tag).textContent = name;
      el('div', 'fin-tag-from', tag).textContent = '— with love, Santa';
    },
    hideTag() { if (tag) { tag.style.transition = 'opacity .5s'; tag.style.opacity = '0'; const t = tag; tag = null; setTimeout(() => t.remove(), 600); } },
    countdown(n) {
      count?.remove();
      count = el('div', 'fin-count pop', layer);
      el('span', 'back', count).textContent = String(n);
      el('span', 'front', count).textContent = String(n);
    },
    newYear(year = '2027') {
      count?.remove(); count = null;
      ny?.remove();
      ny = el('div', 'fin-ny', layer);
      el('div', 'knit-title', ny).textContent = 'Happy New Year!';
      el('div', 'year', ny).textContent = year;
    },
    endCard(name, onReplay) {
      ny?.remove(); ny = null;
      const card = el('div', 'knit-card fin-end interactive', layer);
      const st = el('div', 'stitch', card);
      for (let i = 0; i < 7; i++) el('i', '', st);
      el('h1', '', card).textContent = `Happy New Year, ${name}!`;
      el('div', 'love', card).textContent = '— love, Tinselby';
      el('div', 'yr', card).textContent = 'Christmas & New Year 2027';
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
