"""HUD overlap audit: python3 tools/hud5_check.py [doors=5 ...]  -> shots/hud5_*.png, asserts no HUD rect overlaps."""
import json, sys, time
from playwright.sync_api import sync_playwright
SIZES = [(360,780),(390,844),(412,915),(844,390),(667,375),(1280,720)]
import os
if os.environ.get('SIZES'): SIZES = [tuple(map(int, x.split('x'))) for x in os.environ['SIZES'].split(',')]
STATES = [a for a in sys.argv[1:] if '=' in a] or ['doors=5']
URL = 'file:///tmp/hud5/dist/index.html?capture&net=off&play&reset&reveal=all&'
JS = """(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const out = [];
  const add = (n, e) => { if (!e || !vis(e)) return; const r = e.getBoundingClientRect(); out.push({ n, x: r.left, y: r.top, w: r.width, h: r.height }); };
  add('goal', document.querySelector('.tb-goal'));
  document.querySelectorAll('.tb-stats .tb-chip').forEach((e, i) => add('chip' + i, e));
  document.querySelectorAll('.tb-tr > *').forEach((e, i) => add('btn' + i, e));
  add('act', document.querySelector('.tb-act'));
  add('joy', document.querySelector('.tb-joy'));
  document.querySelectorAll('.tbs-corner button, .tbs-corner .tbs-pill').forEach((e, i) => add('soc' + i, e));
  document.querySelectorAll('.tb-toast, .tb-nettoast').forEach((e, i) => add('toast' + i, e));
  const tr = document.querySelector('.tb-tr').getBoundingClientRect(), W = innerWidth;
  const m = innerHeight < 430 ? 12 : 10;
  out.push({ n: 'MAPSLOT', x: W - m - 104, y: tr.bottom + 8, w: 104, h: 104 });
  const g = document.querySelector('.tb-goal');
  return JSON.stringify({ rects: out, goal: g ? g.innerText.replace(/\\n/g, ' | ') : null, W, H: innerHeight });
})()"""
errs = []
def overl(a, b):
    return a['x'] < b['x'] + b['w'] - .5 and b['x'] < a['x'] + a['w'] - .5 and a['y'] < b['y'] + b['h'] - .5 and b['y'] < a['y'] + a['h'] - .5
fails = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for st in STATES:
        c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        pg = c.new_page(); pg.set_default_timeout(300000)
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'GPU stall' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.goto(URL + st, wait_until='commit'); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
        print('loaded', st, flush=True)
        pg.evaluate('window.__tinselby.step(1/30, 30)')
        if st == 'doors=24' and 'QUIET' in os.environ: print('claim', pg.evaluate('(() => { try { return JSON.stringify(window.__tinselby.ctx.progress.daily.claim()); } catch (e) { return String(e); } })()'))
        if os.environ.get('HINT') == '1': pg.evaluate("window.__tinselby.ctx.ui.hud.setHint({x: 12, z: 8, text: 'Go there: Find Mr Pine in Market Square', n: 6})")
        if os.environ.get('HINT') == '2': pg.evaluate("window.__tinselby.ctx.ui.hint(6, 'Door 6 · Ornament Hunt — Find Mr Pine in Market Square', true)")
        # play-together on: show friends pill + emote/snowball + online chip
        pg.evaluate("""(() => { document.querySelectorAll('.tbs-corner [hidden]').forEach(e => { e.hidden = false; });
          const t = document.querySelector('.tbs-pill-txt'); if (t) t.textContent = 'CODE · 3';
          const o = document.querySelector('.tb-online'); if (o) { o.hidden = false; o.querySelector('b').textContent = '3'; } })()""")
        for (w, h) in SIZES:
            pg.set_viewport_size({'width': w, 'height': h}); pg.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 80)))')
            pg.evaluate('window.__tinselby.step(1/30, 12)')
            pg.evaluate("document.querySelectorAll('.tb-online').forEach(o => { o.hidden = false; })")
            pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
            d = json.loads(pg.evaluate(JS)); R = d['rects']; bad = []
            for i in range(len(R)):
                for j in range(i + 1, len(R)):
                    if overl(R[i], R[j]): bad.append(R[i]['n'] + '×' + R[j]['n'])
            for r in R:
                if r['x'] < -.5 or r['y'] < -.5 or r['x'] + r['w'] > w + .5 or r['y'] + r['h'] > h + .5: bad.append(r['n'] + ' offscreen')
            fails += len(bad)
            print(f"{st} {w}x{h}: {'OK' if not bad else 'OVERLAP ' + str(bad)}  goal=[{d['goal']}]", flush=True)
            pg.screenshot(path=f"/home/claude/tinselby/shots/hud5_{st.replace('=','')}{os.environ.get('TAG','')}_{w}x{h}.png")
        c.close()
    b.close()
print('console errors:', errs); print('FAILS', fails)
sys.exit(1 if fails or errs else 0)
