#!/usr/bin/env python3
"""Secret Santa growth loop e2e (src/santa: big-town card, one-tap start, invite step). ?net=local (BroadcastChannel net +
the in-memory Santa mock); each page plays as its own player via ?santaAs=<uuid>; analytics through window.__analyticsStub.

  card    big town: no card before ~50 s of play, then ONE "Secret Santa in Tinselby!" card (step the game clock), Later
          counts (once a day, stop after 3 Laters / after starting one), Friends card always has the row (badge New),
          the row opens the sheet's big-town view
  start   "Start with friends" → new friends town, santa_start, sheet on the invite step; stubbed navigator.share called
          once with the right title / text / url (/?town=CODE&santa=1&from=Ava); B and C join → progress text updates
          ("2 of 3 … invite 1 more" → "Ready to draw!", "Invite more"); B without navigator.share gets WhatsApp + Copy
          link; Friends card "Invite friends to Secret Santa" → share; after the draw no invite buttons (late joiner too)

Build first:  npx vite build --outDir /tmp/santa2/dist --emptyOutDir     Served on http://localhost:8796 (SANTA_DIST / SANTA_PORT).
Shots: shots/santa2_*.png (412x915 + 915x412). NOLOCK=1 skips the shared Chrome lock (run under nice -n 19).
Usage: python3 tools/santa2.py [card] [start]   (default: both)"""
import fcntl, functools, http.server, json, os, re, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.environ.get('SANTA_DIST', '/tmp/santa2/dist')
PORT = int(os.environ.get('SANTA_PORT', '8796'))
ORIGIN = f'http://localhost:{PORT}'
BASE = ORIGIN + '/index.html?capture&play&net=local&santa=mock&reveal=all&tod=13'
SHOTS = '/home/claude/tinselby/shots'
PARTS = set(sys.argv[1:]) or {'card', 'start'}
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
C = 'window.__tinselby.ctx'
IDS = {'Ava': '11111111-1111-4111-8111-111111111111', 'Bram': '22222222-2222-4222-8222-222222222222',
       'Cleo': '33333333-3333-4333-8333-333333333333', 'Dot': '44444444-4444-4444-8444-444444444444'}
PORTRAIT, LANDSCAPE = {'width': 412, 'height': 915}, {'width': 915, 'height': 412}
STUB = "window.__events = []; window.__analyticsStub = { capture(e, p) { window.__events.push([e, p || {}]); } };"
errs, fails = [], []

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/favicon'): self.send_response(204); self.end_headers(); return
        return super().do_GET()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
lock = open('/tmp/tinselby-chrome.lock', 'w')
if os.environ.get('NOLOCK') == '1': print('NOLOCK=1: not taking the shared Chrome lock', flush=True)
else: fcntl.flock(lock, fcntl.LOCK_EX)

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)
    return cond

def attach(pg, tag):
    pg.on('console', lambda m: errs.append(f'[{tag}] {m.type}: {m.text}') if m.type == 'error' and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append(f'[{tag}] PAGEERROR {e}'))

HELPERS = r'''(() => {
  const c = window.__tinselby.ctx;
  if (window.__s2) return true;
  const P = window.__s2 = { ev: [] };
  for (const e of ['santa:started', 'santa:joined', 'santa:invite', 'santa:card']) c.game.on(e, (d) => P.ev.push([e, d || {}]));
  const r0 = c.engine.post.render.bind(c.engine.post);
  P.fast = (on) => { c.engine.post.render = on ? (s, cam) => { s.updateMatrixWorld(); cam.updateMatrixWorld(); } : r0; return on; };
  P.fast(true);
  P.vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  P.text = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  P.card = () => { const e = document.querySelector('.tbsa-cards .tbsa-card:not(.out)'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  P.share = (on) => {
    window.__shares = [];
    if (on) Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: async (d) => { window.__shares.push(JSON.parse(JSON.stringify(d))); } });
    else { try { delete navigator.share; } catch (e) {} try { Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: undefined }); } catch (e) {} }
    return typeof navigator.share;
  };
  // panel + every sheet button on screen, buttons ≥ 40 px, no clipped labels
  P.fit = () => {
    const W = innerWidth, H = innerHeight, out = [];
    const p = document.querySelector('.tbsa-panel').getBoundingClientRect();
    if (p.left < -1 || p.top < -1 || p.right > W + 1 || p.bottom > H + 1) out.push(`panel ${Math.round(p.left)},${Math.round(p.top)},${Math.round(p.right)},${Math.round(p.bottom)}`);
    for (const b of document.querySelectorAll('.tbsa-actions .knit-btn, .tbsa-inv .knit-btn, .tbsa-x')) {
      const r = b.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) out.push(`small ${b.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.left < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`off ${b.className}`);
      if (b.scrollWidth > b.clientWidth + 2) out.push(`clipped ${b.textContent.trim()}`);
    }
    return out;
  };
  return true;
})()'''

def ev(pg, js): return pg.evaluate(js)
def step(pg, n=2, dt='1/30'): pg.evaluate(f'window.__tinselby.step({dt},{n})')
def tap(pg, sel):
    pg.locator(sel).first.tap(timeout=15000)
    step(pg, 1)
def status(pg): return ev(pg, f'{C}.santa.status()')
def refresh(pg): return ev(pg, f'(async () => {{ await {C}.santa.refresh(); return {C}.santa.status(); }})()')
def wait(pg, js, secs=8.0, tick=False):
    t = time.time()
    while time.time() - t < secs:
        if ev(pg, js): return True
        if tick: step(pg, 1)
        time.sleep(0.15)
    return bool(ev(pg, js))

def shot(pg, name, orient=('p', 'l'), fit=True):
    for o in orient:
        lab = '412x915' if o == 'p' else '915x412'
        pg.set_viewport_size(PORTRAIT if o == 'p' else LANDSCAPE)
        pg.evaluate('window.__s2.fast(false); window.__tinselby.step(1/30, 1)')
        pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        if fit and ev(pg, 'window.__s2.vis(".tbsa-panel")'):
            f = ev(pg, 'window.__s2.fit()')
            check(not f, f'layout {name} {lab}: {f}')
        pg.screenshot(path=f'{SHOTS}/santa2_{name}_{lab}.png')
        pg.evaluate('window.__s2.fast(true)')
    pg.set_viewport_size(PORTRAIT)
    print(f'  shot santa2_{name}', flush=True)

def load(ctxt, name, extra='', vp=PORTRAIT):
    pg = ctxt.new_page(); pg.set_viewport_size(vp); pg.set_default_timeout(300000); attach(pg, name)
    pg.goto(BASE + f'&santaAs={IDS[name]}' + extra, wait_until='commit')
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
    pg.evaluate(f'{C}.net.setName({json.dumps(name)}); {C}.game.state.playerName = {json.dumps(name)};')
    pg.evaluate(HELPERS)
    step(pg, 2)
    return pg

def fresh_storage(ctxt):
    pg = ctxt.new_page(); pg.goto(ORIGIN + '/index.html?net=off&capture', wait_until='commit')
    pg.wait_for_function('document.readyState !== "loading"'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.close()

def play_until(pg, secs):
    """Step the game clock (free play, fast render) until the promo timer reaches secs."""
    for _ in range(200):
        if ev(pg, f'{C}.santa.promo.t') >= secs: return True
        step(pg, 10, '1/10')
    return False

def tracked(pg, name): return [p for e, p in ev(pg, 'window.__events') if e == name]

# ------------------------------------------------------------------------------------------------------------- parts
def card_part(b):
    ctxt = b.new_context(is_mobile=True, has_touch=True); ctxt.add_init_script(STUB)
    fresh_storage(ctxt)
    A = load(ctxt, 'Ava', '&town=&santaCard')
    check(ev(A, f'{C}.net.town === null && {C}.santa.startable === true && {C}.santa.available === false'), 'big town: Santa startable (not "available")')
    p = ev(A, f'{C}.santa.promo')
    check(p['on'] and p['eligible'] and not p['session'], f'promo on + eligible at start {p}')
    play_until(A, 35)
    check(not ev(A, 'window.__s2.card()'), f'no card at ~35 s of play (t={ev(A, f"{C}.santa.promo.t")})')
    play_until(A, 50)
    ok = False
    for _ in range(40):
        if ev(A, 'window.__s2.card()'): ok = True; break
        step(A, 5, '1/10')
    t = ev(A, f'{C}.santa.promo.t')
    check(ok and 50 <= t <= 62, f'card appears ~50 s into play at a calm moment (t={t}, calm={ev(A, f"{C}.santa.promo.calm")})')
    txt = ev(A, 'window.__s2.card()')
    check('Secret Santa in Tinselby!' in txt and 'Swap secret presents with your friends on Christmas Day.' in txt and 'Start with friends' in txt and 'Later' in txt, f'card text "{txt}"')
    check(['santa:card', {'where': 'public'}] in ev(A, 'window.__s2.ev') and tracked(A, 'santa_card_shown') == [{'where': 'public'}], f'santa_card_shown {{where: public}} tracked: {tracked(A, "santa_card_shown")}')
    if ok: shot(A, 'card', fit=False)
    # Later → gone, counted, once a day
    if ok: tap(A, '.tbsa-cards .tbsa-card .knit-btn.cream')
    wait(A, '!window.__s2.card()', 3, tick=True)
    p = ev(A, f'{C}.santa.promo')
    check(not ev(A, 'window.__s2.card()') and p['later'] == 1 and p['day'] and not p['eligible'], f'Later: card gone, later=1, shown today → not again today {p}')
    for _ in range(25): step(A, 10, '1/10')  # 25 more seconds of play
    check(not ev(A, 'window.__s2.card()'), 'no second card in the same session / day')
    ev(A, f'{C}.santa.promoReset()')  # a new session: only the stored rules decide
    for store, want, why in (({'day': '', 'later': 2, 'stop': 0}, True, 'a new day, 2 Laters → eligible'), ({'day': '', 'later': 3, 'stop': 0}, False, '3 Laters → never again'),
                             ({'day': '', 'later': 0, 'stop': 1}, False, 'started / joined one → never again')):
        ev(A, f'localStorage.setItem("tinselby.santa.promo.v1", {json.dumps(json.dumps(store))})')
        check(ev(A, f'{C}.santa.promo.eligible') == want, f'promo rules: {why}')
    ev(A, f'localStorage.setItem("tinselby.santa.promo.v1", {json.dumps(json.dumps({"day": "2026-01-01", "later": 0, "stop": 0}))})')
    check(ev(A, f'{C}.santa.promo.eligible'), 'promo rules: shown on another day → eligible again')

    # Friends card: the Secret Santa row is always there (badge New), no hint line
    tap(A, '.tbs-friends-btn'); step(A, 2)
    check(ev(A, 'window.__s2.vis(".tbsa-from-invite") && !window.__s2.vis(".tbsa-fi-hint") && !window.__s2.vis(".tbsa-inv-from-invite")'), 'big town: Friends card shows the Secret Santa row (no hint, no invite row)')
    check(ev(A, 'window.__s2.text(".tbsa-fi-badge")') == 'New', f'row badge "{ev(A, "window.__s2.text(\'.tbsa-fi-badge\')")}"')
    shot(A, 'friends_public', fit=False)
    tap(A, '.tbsa-from-invite')
    ok = wait(A, 'window.__s2.vis(".tbsa-panel") && window.__s2.vis(".tbsa-startpublic")')
    check(ok and 'Secret Santa in Tinselby!' in ev(A, 'window.__s2.text(".tbsa-body")'), 'the row opens the sheet: what it is + "Start with friends"')
    shot(A, 'public_sheet')
    tap(A, '.tbsa-x')
    ctxt.close()

def start_part(b):
    ctxt = b.new_context(is_mobile=True, has_touch=True); ctxt.add_init_script(STUB)
    ctxt.grant_permissions(['clipboard-read', 'clipboard-write'], origin=ORIGIN)
    fresh_storage(ctxt)
    A = load(ctxt, 'Ava', '&town=&santaCard')
    check(ev(A, 'window.__s2.share(true)') == 'function', 'A: navigator.share stubbed')
    ev(A, f'{C}.santa.promoShow(true)')
    ok = wait(A, 'window.__s2.card().includes("Start with friends")', 5, tick=True)
    check(ok, 'A: big-town card up (forced)')
    tap(A, '.tbsa-cards .tbsa-card .knit-btn.green')
    ok = wait(A, f'/^[A-Z2-9]{{6}}$/.test({C}.net.town?.code || "") && {C}.santa.status()?.state === "open"', 10, tick=True)
    code = ev(A, f'{C}.net.town?.code')
    s = status(A)
    check(ok and s['is_starter'] and s['joined'] and s['count'] == 1 and s['starter'] == 'Ava', f'A: "Start with friends" → friends town {code}, Secret Santa started ({s and s["state"]}, {s and s["count"]})')
    check(ev(A, 'window.__s2.vis(".tbsa-panel") && window.__s2.vis(".tbsa-share")') and 'Invite your friends' in ev(A, 'window.__s2.text(".tbsa-body")'), 'A: sheet open on the "Invite your friends" step with the big button')
    check(ev(A, 'window.__s2.text(".tbsa-prog")') == '1 of 3 friends needed — invite 2 more', f'A: progress "{ev(A, "window.__s2.text(\'.tbsa-prog\')")}"')
    check(['santa:started', {'from': 'public'}] in ev(A, 'window.__s2.ev') and tracked(A, 'santa_started') == [{'from': 'public'}], f'santa_started {{from: public}}: {tracked(A, "santa_started")}')
    check(any(e == 'friend_town_created' for e, _ in ev(A, 'window.__events')), 'friend_town_created tracked (the create-town flow)')
    check(ev(A, f'{C}.santa.promo.stop') == 1, 'A: promo stops after starting one')
    shot(A, 'invite_step')
    tap(A, '.tbsa-share'); step(A, 2); time.sleep(0.3)
    sh = ev(A, 'window.__shares')
    check(len(sh) == 1, f'A: navigator.share called once ({len(sh)})')
    if sh:
        d = sh[0]
        check(d.get('title') == 'Secret Santa in Tinselby' and d.get('text') == 'Join my Secret Santa in Tinselby! 🎁 We swap secret presents on Christmas Day.', f'share title/text {d.get("title")!r} {d.get("text")!r}')
        check(bool(re.search(r'\?town=[A-Z2-9]{6}&santa=1&from=', d.get('url', ''))) and f'town={code}&' in d['url'] and d['url'].endswith('from=Ava') and d['url'].startswith(ORIGIN + '/?'), f'share url {d.get("url")}')
    check(tracked(A, 'santa_invite_shared') == [{'method': 'share'}], f'santa_invite_shared {{method: share}}: {tracked(A, "santa_invite_shared")}')
    lk = ev(A, f'{C}.santa.inviteLink()')
    check(not any(code in json.dumps(p) or 'Ava' in json.dumps(p) for e, p in ev(A, 'window.__events') if e.startswith('santa')), 'no names / codes in santa analytics')

    # B arrives (no Web Share on this page → WhatsApp + Copy link) and joins; A's progress updates
    B = load(ctxt, 'Bram', f'&town={code}')
    ev(B, 'window.__s2.share(false)')
    wait(B, f'{C}.santa.status()?.state === "open"', 10)
    refresh(B)
    ev(B, f'{C}.santa.open()'); wait(B, 'window.__s2.vis(".tbsa-join")')
    tap(B, '.tbsa-join')
    check(wait(B, f'{C}.santa.status()?.joined && {C}.santa.status()?.count === 2'), 'B: joined (2)')
    check(ev(B, 'window.__s2.vis(".tbsa-wa") && window.__s2.vis(".tbsa-copy") && !document.querySelector(".tbsa-share")'), 'B (no navigator.share): WhatsApp + Copy link instead of the share button')
    check(ev(B, 'window.__s2.text(".tbsa-prog")') == '2 of 3 friends needed — invite 1 more', f'B: progress "{ev(B, "window.__s2.text(\'.tbsa-prog\')")}"')
    shot(B, 'fallback')
    ev(B, 'window.__wa = null; window.open = (u) => { window.__wa = u; return {}; }')
    tap(B, '.tbsa-wa'); time.sleep(0.2)
    wa = ev(B, 'window.__wa') or ''
    check(wa.startswith('https://wa.me/?text=') and 'Join%20my%20Secret%20Santa' in wa and f'town%3D{code}%26santa%3D1%26from%3DBram' in wa, f'B: WhatsApp link {wa[:160]}')
    tap(B, '.tbsa-copy'); time.sleep(0.4)
    clip = ev(B, 'navigator.clipboard.readText().catch(() => "")')
    check(clip.endswith(f'/?town={code}&santa=1&from=Bram') and 'Copied!' in ev(B, 'window.__s2.text(".tbsa-copy")'), f'B: Copy link → clipboard {clip!r}, "{ev(B, "window.__s2.text(\'.tbsa-copy\')")}"')
    check([p['method'] for p in tracked(B, 'santa_invite_shared')] == ['whatsapp', 'copy'], f'B: santa_invite_shared methods {tracked(B, "santa_invite_shared")}')
    ok = wait(A, 'window.__s2.text(".tbsa-prog") === "2 of 3 friends needed — invite 1 more"', 16, tick=True)
    check(ok, f'A: progress updates when B joins ("{ev(A, "window.__s2.text(\'.tbsa-prog\')")}")')

    Cc = load(ctxt, 'Cleo', f'&town={code}')
    wait(Cc, f'{C}.santa.status()?.state === "open"', 10)
    r = ev(Cc, f'(async () => {{ const r = await {C}.santa.join(); return r && r.ok; }})()')
    check(r and status(Cc)['count'] == 3, 'C: joined via santa.join() (3)')
    ok = wait(A, 'window.__s2.text(".tbsa-prog") === "Ready to draw!"', 16, tick=True)
    check(ok and 'Invite more' in ev(A, 'window.__s2.text(".tbsa-share")') and not ev(A, '!!document.querySelector(".tbsa-askdraw")?.disabled'), f'A: "Ready to draw!", "Invite more", draw enabled ("{ev(A, "window.__s2.text(\'.tbsa-prog\')")}")')
    shot(A, 'ready')
    tap(A, '.tbsa-x')

    # Friends card in the friends town: "Invite friends to Secret Santa" → sheet + share sheet
    tap(A, '.tbs-friends-btn'); step(A, 2)
    check(ev(A, 'window.__s2.vis(".tbsa-from-invite") && window.__s2.vis(".tbsa-inv-from-invite")'), 'A: Friends card has the Santa row + "Invite friends to Secret Santa"')
    shot(A, 'friends_town', fit=False)
    tap(A, '.tbsa-inv-from-invite'); step(A, 2); time.sleep(0.3)
    check(len(ev(A, 'window.__shares')) == 2 and ev(A, 'window.__s2.vis(".tbsa-panel")'), f'A: invite row → share sheet again ({len(ev(A, "window.__shares"))} calls) with the sheet open')

    # draw → no invite buttons anywhere; late joiner sees none either
    tap(A, '.tbsa-askdraw'); tap(A, '.tbsa-draw')
    check(wait(A, f'{C}.santa.status()?.state === "drawn"'), 'A: names drawn')
    check(ev(A, '!document.querySelector(".tbsa-share, .tbsa-wa, .tbsa-copy, .tbsa-prog")'), 'A: no invite buttons after the draw')
    refresh(B)
    check(ev(B, '!document.querySelector(".tbsa-share, .tbsa-wa, .tbsa-copy")'), 'B: no invite buttons after the draw')
    tap(A, '.tbsa-x'); tap(A, '.tbs-friends-btn'); step(A, 2)
    check(not ev(A, 'window.__s2.vis(".tbsa-inv-from-invite")'), 'A: Friends card invite row hidden after the draw')
    tap(A, '.tbs-invite .tb-modal-close')
    D = load(ctxt, 'Dot', f'&town={code}')
    s = refresh(D)
    ev(D, f'{C}.santa.open()'); wait(D, 'document.querySelector(".tbsa-layer").dataset.state === "drawn"')
    check(s['late'] and ev(D, '!document.querySelector(".tbsa-share, .tbsa-wa, .tbsa-copy")'), 'D (late joiner): no invite buttons')
    ctxt.close()

t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    if 'card' in PARTS:
        try: card_part(b)
        except Exception as e: check(False, f'card: exception {str(e)[:400]}')
    if 'start' in PARTS:
        try: start_part(b)
        except Exception as e: check(False, f'start: exception {str(e)[:400]}')
    b.close()
srv.shutdown()
print(f'\n{len(fails)} FAILS' + (':' if fails else ''), flush=True)
for f in fails: print('  - ' + f)
print(f'{len(errs)} CONSOLE ERRORS' + (':' if errs else ''))
for e in errs[:30]: print('  ' + e)
print(f'({round(time.time() - t0)} s)')
