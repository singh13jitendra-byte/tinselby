#!/usr/bin/env python3
"""Phone layout regression sweep at the user's real phone sizes (Android Chrome, touch, DPR 2.625).

Sizes: 412x915 (Chrome tab), 412x860 (in-app browser / Custom Tab), 915x412 (landscape), 360x780 (small Android).
Screens per size (real taps where reasonable, API fallback otherwise):
  entry, invite, hud, calendar, calendar_scrolled, wardrobe, map, map_todo, photo, photo_result, friends, cardmaker,
  help, mg_intro (cookies), reward
Generic rect audit on every screen (only elements that are visible and on top at their centre take part):
  OFF    interactive element / card / text not fully inside the viewport (after legit scroll-container clipping)
  SAFE   inside the viewport but in the emulated safe-area inset (gesture bar / landscape cutout; SAFE=0 turns it off)
  CUT    control cut off by a non-scrolling overflow:hidden container
  OVER   two interactive elements overlap
  SMALL  tap target < 40 px (min side)
  CLIP   text clipped (scrollWidth > clientWidth with overflow hidden / ellipsis); WRAP = text overflows its box visibly
  ERR    console errors / page errors while on the screen (offline Google Fonts errors ignored)
Areas marked "in progress elsewhere": floating activity tags (.tba-*) and guide markers (.tbg-*).

Screenshots: shots/sweep_<size>_<screen>.png; results: shots/sweep_results.json (sweep_results_partial.json with --screens).
Usage: PT_DIST=/path/to/dist python3 -u tools/phone_sweep.py [412x915 412x860 ...] [--screens=hud,calendar,...]
Env: PT_DIST (dist dir, default ./dist), NOLOCK=1 (skip the shared lock; pair with `nice -n 19`), SAFE=0 (no safe-area emulation), FONT_DIR (Fredoka woff2 cache, default /tmp/sweep_fonts)
Uses the shared Chrome lock (/tmp/tinselby-chrome.lock) like tools/playthrough.py.
"""
import fcntl, glob, json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('PT_DIST', os.path.join(ROOT, 'dist'))
SHOTS = os.path.join(ROOT, 'shots')
FONT_DIR = os.environ.get('FONT_DIR', '/tmp/sweep_fonts')
SAFE_ON = os.environ.get('SAFE', '1') != '0'
DPR = 2.625
ALL_SIZES = [(412, 915), (412, 860), (915, 412), (360, 780)]
ALL_SCREENS = ['entry', 'invite', 'hud', 'calendar', 'calendar_scrolled', 'wardrobe', 'map', 'map_todo', 'photo', 'photo_result',
               'friends', 'cardmaker', 'help', 'mg_intro', 'reward']
args = sys.argv[1:]
SIZES = [tuple(int(v) for v in a.split('x')) for a in args if re.fullmatch(r'\d+x\d+', a)] or ALL_SIZES
SCREENS = next((a.split('=', 1)[1].split(',') for a in args if a.startswith('--screens=')), ALL_SCREENS)
BASE = f'file://{DIST}/index.html?capture&net=off&tod=17.5'
TOWN = '&play&reset&reveal=all&doors=8&streak=5'
CTX = 'window.__tinselby.ctx'
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
os.makedirs(SHOTS, exist_ok=True)

# ---------------------------------------------------------------- fonts: serve Fredoka locally so text metrics match a real phone
def font_css():
    files = {w: os.path.join(FONT_DIR, f'fredoka-latin-{w}-normal.woff2') for w in (400, 500, 600, 700)}
    if not all(os.path.exists(f) for f in files.values()):
        try:  # registry.npmjs.org is reachable; fonts.googleapis.com usually is not
            os.makedirs(FONT_DIR, exist_ok=True)
            subprocess.run(['npm', 'pack', '@fontsource/fredoka', '--pack-destination', FONT_DIR], check=True, capture_output=True, timeout=120)
            tgz = sorted(glob.glob(os.path.join(FONT_DIR, 'fontsource-fredoka-*.tgz')))[-1]
            subprocess.run(['tar', '-xzf', tgz, '-C', FONT_DIR, '--strip-components=2', '--wildcards', 'package/files/fredoka-latin-[4567]00-normal.woff2'], check=True, timeout=60)
        except Exception as e:
            print(f'(fonts: Fredoka not available, falling back to system fonts — text clipping results less exact: {e})'); return None, {}
    css = ''.join(f"@font-face{{font-family:'Fredoka';font-style:normal;font-weight:{w};font-display:swap;src:url(https://fonts.gstatic.com/sweep/fredoka-{w}.woff2) format('woff2');}}" for w in files)
    return css, {f'fredoka-{w}.woff2': open(p, 'rb').read() for w, p in files.items()}

# ---------------------------------------------------------------- the audit (runs in the page)
AUDIT = r"""(o) => {
  const W = innerWidth, H = innerHeight, VA = W * H;
  const pr = document.createElement('div');
  pr.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(pr); const pc = getComputedStyle(pr);
  const safe = { t: parseFloat(pc.paddingTop) || 0, r: parseFloat(pc.paddingRight) || 0, b: parseFloat(pc.paddingBottom) || 0, l: parseFloat(pc.paddingLeft) || 0 }; pr.remove();
  const cssCache = new Map(); const cs = (e) => { let c = cssCache.get(e); if (!c) { c = getComputedStyle(e); cssCache.set(e, c); } return c; };
  const visible = (e, inter) => {
    if (e.closest('[hidden]')) return false;
    const c = cs(e); if (c.display === 'none' || c.visibility === 'hidden' || inter && c.pointerEvents === 'none') return false;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    let op = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const k = cs(n); if (k.display === 'none') return false; op *= +k.opacity; }
    return op > 0.05;
  };
  const desc = (e) => {
    const cls = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const txt = (e.getAttribute('aria-label') || e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 22);
    return e.tagName.toLowerCase() + (cls ? '.' + cls : '') + (txt ? ` "${txt}"` : '');
  };
  const chain = (e) => { const a = []; for (let n = e; n && n.nodeType === 1 && a.length < 12; n = n.parentElement) if (typeof n.className === 'string' && n.className) a.push(n.className); return a.join(' | '); };
  // clip by ancestors: scroll containers (legit) vs overflow:hidden (cut)
  const clipInfo = (e) => {
    const r = e.getBoundingClientRect(); let v = { l: r.left, t: r.top, r: r.right, b: r.bottom }, cut = null, scrolled = false;
    for (let n = e.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const c = cs(n); const ox = c.overflowX, oy = c.overflowY;
      if (ox === 'visible' && oy === 'visible') continue;
      const q = n.getBoundingClientRect();
      const scrollX = /auto|scroll/.test(ox) && n.scrollWidth > n.clientWidth + 1, scrollY = /auto|scroll/.test(oy) && n.scrollHeight > n.clientHeight + 1;
      const cl = { l: ox === 'visible' ? -1e9 : q.left, r: ox === 'visible' ? 1e9 : q.right, t: oy === 'visible' ? -1e9 : q.top, b: oy === 'visible' ? 1e9 : q.bottom };
      const outside = v.r <= cl.l + 1 || v.l >= cl.r - 1 || v.b <= cl.t + 1 || v.t >= cl.b - 1;
      const partial = v.l < cl.l - 1.5 || v.r > cl.r + 1.5 || v.t < cl.t - 1.5 || v.b > cl.b + 1.5;
      if (scrollX || scrollY) { if (outside) return { gone: true }; if (partial) scrolled = true; }
      else if (partial && !cut) cut = { by: desc(n), px: Math.round(Math.max(cl.l - v.l, v.r - cl.r, cl.t - v.t, v.b - cl.b)) };
      v = { l: Math.max(v.l, cl.l), t: Math.max(v.t, cl.t), r: Math.min(v.r, cl.r), b: Math.min(v.b, cl.b) };
    }
    return { v, cut, scrolled, r };
  };
  const big = (n) => { const q = n.getBoundingClientRect(); return q.width * q.height > VA * 0.6; };
  const onTop = (e, v) => {  // the element (or its subtree) is what a finger hits at the centre of its visible part
    const hit = document.elementFromPoint(Math.min(Math.max((v.l + v.r) / 2, 0), W - 1), Math.min(Math.max((v.t + v.b) / 2, 0), H - 1));
    if (!hit || e === hit || e.contains(hit) || hit.contains(e) && !big(hit)) return true;
    return cs(e).pointerEvents === 'none' && (hit.tagName === 'CANVAS' && big(hit) || hit.contains(e));  // click-through labels over the game
  };
  const INTER = 'button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=link],[role=checkbox],[role=switch],[tabindex]:not([tabindex="-1"])';
  const all = [...document.body.querySelectorAll('*')];
  const set = new Set(document.querySelectorAll(INTER));
  for (const e of all) { if (cs(e).cursor === 'pointer' && (!e.parentElement || cs(e.parentElement).cursor !== 'pointer')) set.add(e); }
  const items = [], issues = [], covered = [];
  const push = (k, e, extra) => issues.push({ k, el: desc(e), chain: chain(e), ...extra });
  const inV = (v) => v.l >= -1 && v.t >= -1 && v.r <= W + 1 && v.b <= H + 1;
  const inS = (v) => v.l >= safe.l - 1 && v.t >= safe.t - 1 && v.r <= W - safe.r + 1 && v.b <= H - safe.b + 1;
  const rnd = (v) => ({ x: Math.round(v.l), y: Math.round(v.t), w: Math.round(v.r - v.l), h: Math.round(v.b - v.t) });
  for (const e of set) {
    if (e.tagName === 'CANVAS' && e.closest('.tb-root,body') && e.getBoundingClientRect().width * e.getBoundingClientRect().height > VA * 0.6) continue;
    if (!visible(e, true)) continue;
    const ci = clipInfo(e); if (ci.gone) continue;
    const r = ci.r; if (r.width * r.height > VA * 0.6) continue;  // backdrops, drag layers
    const v = ci.v; if (v.r - v.l < 1 || v.b - v.t < 1) continue;
    if (!onTop(e, v) && inV(v)) { covered.push(desc(e)); continue; }  // behind a modal etc. (an offscreen centre can't be hit-tested: keep it)
    const it = { e, v, r };
    items.push(it);
    if (!inV(v)) push('OFF', e, { rect: rnd(v) });
    else if (o.safe && !inS(v)) push('SAFE', e, { rect: rnd(v), safe });
    if (ci.cut) push('CUT', e, { rect: rnd({ l: r.left, t: r.top, r: r.right, b: r.bottom }), by: ci.cut.by, px: ci.cut.px });
    const mn = Math.min(r.width, r.height);
    if (mn < 40 && e.tagName !== 'INPUT' || e.tagName === 'INPUT' && r.height < 40) push('SMALL', e, { size: `${Math.round(r.width)}x${Math.round(r.height)}` });
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const ix = Math.min(a.v.r, b.v.r) - Math.max(a.v.l, b.v.l), iy = Math.min(a.v.b, b.v.b) - Math.max(a.v.t, b.v.t);
    if (ix > 1 && iy > 1) {
      const hx = Math.max(a.v.l, b.v.l) + ix / 2, hy = Math.max(a.v.t, b.v.t) + iy / 2, h = document.elementFromPoint(Math.min(hx, W - 1), Math.min(hy, H - 1));
      const top = h && (a.e.contains(h) ? 'first' : b.e.contains(h) ? 'second' : desc(h));
      issues.push({ k: 'OVER', el: desc(a.e) + ' x ' + desc(b.e), chain: chain(a.e) + ' || ' + chain(b.e), px: `${Math.round(ix)}x${Math.round(iy)}`, tapGoesTo: top });
    }
  }
  // cards (panels) fully inside the viewport
  for (const e of document.querySelectorAll('.knit-card')) {
    if (!visible(e)) continue; const ci = clipInfo(e); if (ci.gone) continue;
    if (!onTop(e, ci.v) && inV(ci.v)) continue;  // behind something
    if (!inV(ci.v)) push('OFF', e, { rect: rnd(ci.v), card: true });
  }
  // text: clipped / overflowing labels, text outside the viewport
  for (const e of all) {
    let own = ''; for (const n of e.childNodes) if (n.nodeType === 3) own += n.textContent; own = own.trim();
    if (!own || /^(SCRIPT|STYLE|svg|OPTION)$/.test(e.tagName)) continue;
    const c = cs(e); if (c.display === 'inline' || c.display === 'contents') {  // check the nearest block box instead
      continue;
    }
    if (!visible(e)) continue; const ci = clipInfo(e); if (ci.gone) continue;
    if (!onTop(e, ci.v) && inV(ci.v)) continue;
    const scrolls = /auto|scroll/.test(c.overflowX);
    if (!scrolls && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
      const hidden = c.overflowX !== 'visible' || c.textOverflow === 'ellipsis';
      push(hidden ? 'CLIP' : 'WRAP', e, { text: own.slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth });
    } else if (!/auto|scroll/.test(c.overflowY) && c.overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0) {
      push('CLIP', e, { text: own.slice(0, 30), sh: e.scrollHeight, ch: e.clientHeight, vertical: true });
    }
    if (!inV(ci.v)) push('OFF', e, { rect: rnd(ci.v), text: own.slice(0, 30) });
    else if (o.safe && !inS(ci.v)) push('SAFE', e, { rect: rnd(ci.v), text: own.slice(0, 30) });
    if (ci.cut && ci.cut.px > 2) push('CUT', e, { text: own.slice(0, 30), by: ci.cut.by, px: ci.cut.px });
  }
  // de-duplicate (same kind + element)
  const seen = new Set(), out = [];
  for (const i of issues) { const key = i.k + '|' + i.el; if (seen.has(key)) continue; seen.add(key); out.push(i); }
  return { W, H, safe, n: items.length, covered: covered.length, pageScroll: document.scrollingElement.scrollHeight > H + 2 || document.scrollingElement.scrollWidth > W + 2, issues: out };
}"""

OWNERS = [('tb-ph', 'src/photo'), ('tbc-', 'src/cards'), ('cal-', 'src/calendar'), ('tbm-', 'src/map'), ('tbt-', 'src/tips'),
          ('tbs-', 'src/social'), ('tbi-', 'src/invite'), ('mg-', 'src/minigames'), ('tba-', 'src/activities'), ('tbg-', 'src/guide'),
          ('tb-streak', 'src/streaks'), ('tbk-', 'src/streaks'), ('tb-pwa', 'src/pwa'), ('tb-card', 'src/ui/cards.js'),
          ('tb-tray', 'src/ui/wardrobe.js'), ('tb-modal', 'src/ui/wardrobe.js'), ('tb-swatch', 'src/ui/wardrobe.js'),
          ('tb-entry', 'src/ui/entry.js'), ('tb-toast', 'src/ui'), ('tb-', 'src/ui')]
ELSEWHERE = {'src/activities': 'activity tags', 'src/guide': 'guide markers'}

def owner(chain):  # nearest element first: its first class with a known prefix names the module
    for part in chain.split(' || ')[0].split(' | '):
        for t in part.split():
            for pre, mod in OWNERS:
                if t.startswith(pre): return mod
    return '?'

# ---------------------------------------------------------------- run
if os.environ.get('NOLOCK') == '1':  # the lock can starve for an hour+ when several agents queue; then run niced instead: nice -n 19
    print('NOLOCK=1: not taking the shared Chrome lock', flush=True)
else:
    lock = open('/tmp/tinselby-chrome.lock', 'w')
    print('waiting for the shared Chrome lock…', flush=True); fcntl.flock(lock, fcntl.LOCK_EX); print('got the lock', flush=True)
T0 = time.time()
results = []  # {size, screen, status, reason?, n, issues, errs, secs, shot}
cur = {'screen': '-'}
errbuf = []

def wait_ms(pg, ms): pg.evaluate(f'new Promise(r => setTimeout(r, {ms}))')
def cstep(pg, n=4):
    pg.evaluate(f'window.__tinselby.step(1/30,{n})'); pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
RECT = """(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05 || e.closest('[hidden]')) ? null : { x: r.left, y: r.top, w: r.width, h: r.height }; }"""
def rect(pg, sel): return pg.evaluate(f'({RECT})({json.dumps(sel)})')
def tap_el(pg, sel, fallback_click=True):
    """Real touch tap at the element's centre if it is on top there; else (optionally) a DOM click. Returns 'tap' | 'click' | None."""
    pg.evaluate(f'document.querySelector({json.dumps(sel)})?.scrollIntoView({{ block: "nearest", inline: "nearest" }})')
    r = rect(pg, sel)
    if not r: return None
    x, y = r['x'] + r['w'] / 2, r['y'] + r['h'] / 2
    W, H = pg.evaluate('[innerWidth, innerHeight]')
    on_top = 0 <= x < W and 0 <= y < H and pg.evaluate(f'(() => {{ const t = document.elementFromPoint({x}, {y}); return !!t && !!t.closest({json.dumps(sel)}); }})()')
    if on_top:
        pg.touchscreen.tap(x, y); wait_ms(pg, 150); cstep(pg, 2); return 'tap'
    if fallback_click:
        pg.evaluate(f'document.querySelector({json.dumps(sel)}).click()'); wait_ms(pg, 150); cstep(pg, 2); return 'click'
    return None

def load(pg, q, steps=6):
    pg.goto(BASE + q, wait_until='commit'); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000, polling=500)
    if steps: cstep(pg, steps)

def reset_ui(pg):
    pg.evaluate(f"""(() => {{ const c = {CTX}; const t = (f) => {{ try {{ f(); }} catch (e) {{}} }};
      t(() => c.calendar.isOpen && c.calendar.close()); t(() => c.ui.wardrobe?.isOpen && c.ui.wardrobe.close()); t(() => c.ui.closeWardrobe?.());
      t(() => c.map.isOpen && c.map.close()); t(() => c.photo.isOpen && c.photo.close()); t(() => c.cards.isOpen && c.cards.close());
      t(() => c.tips.helpOpen && c.tips.closeHelp()); t(() => c.social.closeAll()); }})()""")
    cstep(pg, 3)

class Skip(Exception): pass

def audit(pg, size, screen, t0, note=''):
    W, H = size
    shot = os.path.join(SHOTS, f'sweep_{W}x{H}_{screen}.png')
    pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    pg.screenshot(path=shot, scale='css')
    a = pg.evaluate(f'({AUDIT})({{ safe: {json.dumps(SAFE_ON)} }})')
    errs = [e for e in errbuf if e[0] == screen]; errbuf[:] = [e for e in errbuf if e[0] != screen]
    iss = a['issues'] + [{'k': 'ERR', 'el': e[1][:160], 'chain': ''} for e in errs]
    for i in iss: i['owner'] = owner(i.get('chain', ''))
    rec = {'size': f'{W}x{H}', 'screen': screen, 'status': 'OK' if not iss else 'ISSUES', 'n': a['n'], 'covered': a['covered'],
           'pageScroll': a['pageScroll'], 'safe': a['safe'], 'issues': iss, 'secs': round(time.time() - t0), 'shot': os.path.relpath(shot, ROOT), 'note': note}
    results.append(rec)
    kinds = {}
    for i in iss: kinds[i['k']] = kinds.get(i['k'], 0) + 1
    print(f'  {W}x{H} {screen:18s} {rec["status"]:6s} n={a["n"]:3d} {kinds} ({rec["secs"]} s){" " + note if note else ""}', flush=True)
    return rec

def skip(size, screen, reason, t0):
    results.append({'size': f'{size[0]}x{size[1]}', 'screen': screen, 'status': 'SKIP', 'reason': reason, 'issues': [], 'secs': round(time.time() - t0)})
    print(f'  {size[0]}x{size[1]} {screen:18s} SKIP   {reason}', flush=True)

def run_screen(pg, size, screen, fn):
    if screen not in SCREENS: return
    cur['screen'] = screen; t0 = time.time()
    try:
        note = fn() or ''
        audit(pg, size, screen, t0, note)
    except Skip as e: skip(size, screen, str(e), t0)
    except Exception as e: skip(size, screen, f'{type(e).__name__}: {str(e).splitlines()[0][:140]}', t0)

def safe_insets(w, h):
    if not SAFE_ON: return None
    # edge-to-edge Android (Chrome 135+ / installed PWA with viewport-fit=cover): gesture bar at the bottom; landscape adds a cutout side
    return {'top': 0, 'left': 32 if w > h else 0, 'bottom': 24 if h > w else 20, 'right': 0}

FONT_CSS, FONT_FILES = font_css()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for size in SIZES:
        W, H = size
        print(f'[{W}x{H}]', flush=True)
        c = b.new_context(viewport={'width': W, 'height': H}, is_mobile=True, has_touch=True, device_scale_factor=DPR, user_agent=UA)
        def route_fonts(route):
            u = route.request.url
            if FONT_CSS is not None and 'fonts.googleapis.com/css' in u: return route.fulfill(status=200, content_type='text/css', body=FONT_CSS)
            m = re.search(r'fredoka-\d+\.woff2', u)
            if m and m.group(0) in FONT_FILES: return route.fulfill(status=200, content_type='font/woff2', body=FONT_FILES[m.group(0)], headers={'access-control-allow-origin': '*'})
            return route.abort()
        c.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), route_fonts)
        pg = c.new_page(); pg.set_default_timeout(90000)
        pg.on('console', lambda m: errbuf.append((cur['screen'], f'{m.type}: {m.text}')) if m.type == 'error' and 'GPU stall' not in m.text and not re.search(r'fonts\.(googleapis|gstatic)', m.text) else None)
        pg.on('pageerror', lambda e: errbuf.append((cur['screen'], f'PAGEERROR {e}')))
        ins = safe_insets(W, H)
        if ins:
            try:
                cdp = c.new_cdp_session(pg)
                cdp.send('Emulation.setSafeAreaInsetsOverride', {'insets': {**ins, **{k + 'Max': v for k, v in ins.items()}}})
            except Exception as e:
                print(f'  (safe-area emulation unavailable: {str(e)[:80]})'); ins = None

        # ---- entry (name card) and invite welcome: before play
        def s_entry():
            load(pg, '&reset', 4)
            if not rect(pg, '#tb-name') and not rect(pg, '.tb-entry'): raise Skip('entry card not shown')
            tap_el(pg, '#tb-name'); cstep(pg, 2)  # focus the field like a finger would (no on-screen keyboard in headless)
        run_screen(pg, size, 'entry', s_entry)
        def s_invite():
            load(pg, '&reset&from=Ava&card=tree.g1.f2', 4)
            if not rect(pg, '.tbi-welcome'): raise Skip('invite welcome (.tbi-welcome) not shown')
        run_screen(pg, size, 'invite', s_invite)

        # ---- town
        cur['screen'] = 'hud'; t0 = time.time()
        try:
            load(pg, TOWN, 10)
            town_ok = pg.evaluate(f'{CTX}.game.state.phase') == 'play'
        except Exception as e:
            town_ok = False; town_err = str(e).splitlines()[0][:120]
        if not town_ok:
            for s in ALL_SCREENS[2:]:
                if s in SCREENS: skip(size, s, 'town did not load', t0)
            c.close(); continue
        run_screen(pg, size, 'hud', lambda: None)

        def s_cal():
            how = tap_el(pg, '.tb-cal')
            if not how: raise Skip('no calendar button (.tb-cal)')
            cstep(pg, 3); wait_ms(pg, 300)
            if not pg.evaluate(f'{CTX}.calendar.isOpen'): raise Skip('calendar did not open')
            return '' if how == 'tap' else '(opened by DOM click: button not on top)'
        run_screen(pg, size, 'calendar', s_cal)
        def s_cal_scroll():
            if not pg.evaluate(f'{CTX}.calendar.isOpen'): raise Skip('calendar not open')
            g = pg.evaluate("""(() => { const g = document.querySelector('.cal-grid'); if (!g) return null;
              let s = g; while (s && !(s.scrollHeight > s.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
              if (!s || s === document.body) return { sh: g.scrollHeight, ch: g.clientHeight, scrolls: false };
              s.scrollTo(0, 1e5); return { sh: s.scrollHeight, ch: s.clientHeight, st: s.scrollTop, scrolls: true }; })()""")
            if not g: raise Skip('no .cal-grid')
            pg.evaluate('document.querySelector(\'.cal-door[data-n="24"]\')?.scrollIntoView({ block: "nearest" })')
            wait_ms(pg, 200); cstep(pg, 2)
            return '' if g.get('scrolls') else '(grid fits: nothing to scroll)'
        run_screen(pg, size, 'calendar_scrolled', s_cal_scroll)
        reset_ui(pg)

        def s_ward():
            how = tap_el(pg, '.tb-ward')
            if not how: raise Skip('no wardrobe button (.tb-ward)')
            cstep(pg, 3); wait_ms(pg, 300)
            if not rect(pg, '.tb-wardrobe'): raise Skip('wardrobe did not open')
            return '' if how == 'tap' else '(opened by DOM click)'
        run_screen(pg, size, 'wardrobe', s_ward)
        reset_ui(pg)

        def s_map():
            how = tap_el(pg, '.tbm-mini')
            if not how or not pg.evaluate(f'!!{CTX}.map.isOpen'):
                pg.evaluate(f'{CTX}.map.open()'); cstep(pg, 3); how = 'api'
            if not pg.evaluate(f'!!{CTX}.map.isOpen'): raise Skip('map did not open')
            cstep(pg, 4)
            return '' if how == 'tap' else f'(opened by {how})'
        run_screen(pg, size, 'map', s_map)
        def s_todo():
            if not pg.evaluate(f'!!{CTX}.map.isOpen'): raise Skip('map not open')
            how = tap_el(pg, '.tbm-tab[data-tab="todo"]')
            cstep(pg, 3)
            if pg.evaluate(f'{CTX}.map.tab') != 'todo': raise Skip('Things to do tab not available (ctx.activities missing?)')
            return '' if how == 'tap' else '(tab by DOM click)'
        run_screen(pg, size, 'map_todo', s_todo)
        reset_ui(pg)

        def s_photo():
            how = tap_el(pg, '.tb-photo-btn')
            if not how or not pg.evaluate(f'{CTX}.photo.isOpen'):
                pg.evaluate(f'{CTX}.photo.open()'); how = 'api'
            cstep(pg, 3)
            if not pg.evaluate(f'{CTX}.photo.isOpen'): raise Skip('photo mode did not open')
            return '' if how == 'tap' else f'(opened by {how})'
        run_screen(pg, size, 'photo', s_photo)
        def s_photo_res():
            if not pg.evaluate(f'{CTX}.photo.isOpen'): raise Skip('photo mode not open')
            how = tap_el(pg, '.tb-ph-shutter')
            if not how: pg.evaluate(f'{CTX}.photo.shoot()')
            pg.wait_for_function(f'{CTX}.photo.state.result', timeout=120000, polling=500)
            wait_ms(pg, 400); cstep(pg, 3)
            return '' if how == 'tap' else '(shutter by API)'
        run_screen(pg, size, 'photo_result', s_photo_res)
        reset_ui(pg)

        def s_friends():
            how = tap_el(pg, '.tb-tr .tbs-friends-btn') or tap_el(pg, '.tbs-friends-btn')
            if not rect(pg, '.tbs-invite'):
                pg.evaluate(f'{CTX}.social.openInvite()'); cstep(pg, 3); how = 'api'
            if not rect(pg, '.tbs-invite'): raise Skip('Friends card (.tbs-invite) did not open')
            cstep(pg, 3)
            return '' if how == 'tap' else f'(opened by {how})'
        run_screen(pg, size, 'friends', s_friends)
        def s_cardmaker():
            how = tap_el(pg, '.tbc-from-invite') if rect(pg, '.tbc-from-invite') else None
            if not pg.evaluate(f'{CTX}.cards.isOpen'):
                pg.evaluate(f'{CTX}.cards.open?.("friends")'); how = 'api'
            if not pg.evaluate(f'{CTX}.cards.isOpen'): raise Skip('card maker did not open')
            try: pg.wait_for_function(f'!!{CTX}.cards.file', timeout=90000, polling=500); n = ''
            except Exception: n = '(card picture still rendering after 90 s)'
            cstep(pg, 2)
            return ' '.join(x for x in (n, '' if how == 'tap' else f'(opened by {how})') if x)
        run_screen(pg, size, 'cardmaker', s_cardmaker)
        reset_ui(pg)

        def s_help():
            how = tap_el(pg, '.tb-goal-help')
            if not pg.evaluate(f'{CTX}.tips?.helpOpen'):
                pg.evaluate(f'{CTX}.tips?.help?.()'); how = 'api'
            cstep(pg, 3)
            if not rect(pg, '.tbt-help'): raise Skip('help card (.tbt-help) did not open')
            return '' if how == 'tap' else f'(opened by {how})'
        run_screen(pg, size, 'help', s_help)
        reset_ui(pg)

        def s_mg():
            if not pg.evaluate(f'!!{CTX}.minigames.get?.("cookies")'): raise Skip('cookies mini-game not registered')
            # capture mode auto-starts the intro after 50 ms: hold that one timer so the card stays up for the audit
            pg.evaluate("""(() => { const st = window.__origST || window.setTimeout; window.__origST = st; window.__heldIntro = [];
              window.setTimeout = function (f, ms, ...a) {
                if (ms === 50 && document.querySelector('.mg-intro')) { window.__heldIntro.push(f); window.setTimeout = st; return 0; }  // the intro's auto-Start in capture mode
                return st.call(this, f, ms, ...a); }; })()""")
            pg.evaluate(f'window.__mgres = null; {CTX}.minigames.play("cookies").then(r => {{ window.__mgres = r || {{}}; }}, e => {{ window.__mgres = {{ error: String(e) }}; }}); 1')
            for _ in range(40):
                cstep(pg, 2)
                if rect(pg, '.mg-intro'): break
                wait_ms(pg, 300)
            if not rect(pg, '.mg-intro'): raise Skip('cookies intro card (.mg-intro) never appeared')
            cstep(pg, 2)
        run_screen(pg, size, 'mg_intro', s_mg)
        if 'mg_intro' in SCREENS:
            try:
                pg.evaluate('window.__origST && (window.setTimeout = window.__origST); 1')
                if pg.evaluate(f'!!{CTX}.minigames.active'):
                    pg.evaluate(f'{CTX}.minigames.quit()'); wait_ms(pg, 1500); cstep(pg, 10)
                for _ in range(10):
                    if pg.evaluate(f'{CTX}.game.state.phase') == 'play' and not rect(pg, '.mg-results'): break
                    pg.evaluate('document.querySelector(".mg-results .knit-btn")?.click()'); wait_ms(pg, 500); cstep(pg, 6)
            except Exception as e: print('  (mini-game cleanup:', str(e)[:80], ')')

        def s_reward():
            n = pg.evaluate(f'(() => {{ const P = {CTX}.progress; for (let i = 1; i <= 24; i++) if (P.state(i) === "open") return i; return 0; }})()')
            if not n: raise Skip('no open door to complete (doors=8: next door not open yet)')
            # the card is pushed synchronously and auto-closes after 8 s of real time (~8 frames here): keep it up for the audit
            pg.evaluate(f'{CTX}.progress.complete({n}, {{ stars: 3 }})')
            CARD = '.tb-cards:not(.tb-pwa-layer) .tb-card:not(.out)'
            pg.evaluate(f'document.querySelectorAll({json.dumps(CARD)}).forEach(e => clearTimeout(e._timer))')
            for _ in range(10):
                if rect(pg, CARD): break
                cstep(pg, 1); pg.evaluate(f'document.querySelectorAll({json.dumps(CARD)}).forEach(e => clearTimeout(e._timer))')
            if not rect(pg, CARD):
                d = pg.evaluate(f'JSON.stringify({{ phase: {CTX}.game.state.phase, busy: {CTX}.ui.cards.busy, modal: {CTX}.ui.modalOpen?.(), st: {CTX}.progress.state({n}) }})')
                raise Skip(f'no reward card after completing door {n} ({d})')
            cstep(pg, 2); pg.evaluate(f'document.querySelectorAll({json.dumps(CARD)}).forEach(e => clearTimeout(e._timer))')
            kick = pg.evaluate(f'document.querySelector({json.dumps(CARD)} + " .tb-card-kicker")?.textContent || ""')
            if 'reward' not in kick.lower(): n = f'{n}, card shown: {kick!r}'
            return f'(door {n})'
        run_screen(pg, size, 'reward', s_reward)
        c.close()
    b.close()

# ---------------------------------------------------------------- report
json.dump({'dist': DIST, 'secs': round(time.time() - T0), 'safe_emulated': SAFE_ON, 'results': results}, open(os.path.join(SHOTS, 'sweep_results.json' if SCREENS == ALL_SCREENS else 'sweep_results_partial.json'), 'w'), indent=1)
print(f'\n=== phone sweep: {round(time.time() - T0)} s, dist {DIST}, safe-area emulation {"on" if SAFE_ON else "off"} ===')
print(f'{"size":8s} {"screen":18s} {"status":6s}  findings')
for r in results:
    if r['status'] == 'SKIP': print(f'{r["size"]:8s} {r["screen"]:18s} SKIP    {r["reason"]}'); continue
    if not r['issues']: print(f'{r["size"]:8s} {r["screen"]:18s} OK      ({r["n"]} controls) {r.get("note", "")}'); continue
    print(f'{r["size"]:8s} {r["screen"]:18s} ISSUES  ({r["n"]} controls) {r.get("note", "")}  -> {r["shot"]}')
    groups = {}  # same kind + module + element (minus its text) → one line with a count
    for i in r['issues']:
        sig = (i['k'], i['owner'], i['el'].split(' "')[0] if i['k'] != 'ERR' else i['el'])
        groups.setdefault(sig, []).append(i)
    for (k, own, sig), lst in groups.items():
        i = lst[0]
        tag = f' [in progress elsewhere: {ELSEWHERE[own]}]' if own in ELSEWHERE else ''
        extra = {kk: v for kk, v in i.items() if kk not in ('k', 'el', 'chain', 'owner', 'safe')}
        cnt = f' x{len(lst)}' if len(lst) > 1 else ''
        print(f'    {k:5s} {own:18s} {i["el"] if len(lst) == 1 else sig + cnt + " e.g. " + i["el"][len(sig):].strip()}  {json.dumps(extra, ensure_ascii=False) if extra else ""}{tag}')
