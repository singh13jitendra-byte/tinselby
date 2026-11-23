#!/usr/bin/env python3
"""Secret Santa arrival e2e (src/invite/santa.js): a friend opens /?town=CODE&santa=1&from=Ava.
Pages of one browser share a friends town with ?net=local (BroadcastChannel net + the in-memory Santa mock); each plays as
its own player via ?santaAs=<uuid>. Phone context (touch) at 412x915, landscape shots at 915x412.

  A (Ava) starts Secret Santa in QQARV2 (?play).  B (Bram, new player, no &play): Secret Santa welcome on the name card
  (portrait + landscape, inside the viewport), real taps / typing to play, URL cleaned (santa / from gone, town kept),
  join card → Join → member (sheet + "You're in!" banner + Invite step; A sees Bram after refresh), reload → no
  re-prompt.  C (returning player): no welcome, Continue → join card → Not now → reload with the link → no card.
  D: drawn group (3 members, drawn) → "Names are already drawn".  E (new player, link without from, town with no group)
  → "You're invited to a Secret Santa!" welcome → "This Secret Santa has ended".  Analytics stub: santa_invite_opened
  {has_from}, santa_invite_joined, santa_invite_dismissed; no names / codes in any props.

Build first:  npx vite build --outDir /tmp/santaarr/dist --emptyOutDir   (SANTAARR_DIST / SANTAARR_PORT)
Shots: shots/santaarr_*.png.  NOLOCK=1 skips the shared Chrome lock (run under nice -n 19)."""
import fcntl, functools, http.server, json, os, threading, time
from playwright.sync_api import sync_playwright

DIST = os.environ.get('SANTAARR_DIST', '/tmp/santaarr/dist')
PORT = int(os.environ.get('SANTAARR_PORT', '8794'))
ORIGIN = f'http://localhost:{PORT}'
BASE = ORIGIN + '/index.html?capture&net=local&reveal=all&tod=13'
SHOTS = '/home/claude/tinselby/shots'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
C = 'window.__tinselby.ctx'
TOWN, TOWN_DRAWN, TOWN_NONE = 'QQARV2', 'QQARV3', 'QQARV4'
IDS = {'Ava': '11111111-1111-4111-8111-111111111111', 'Bram': '22222222-2222-4222-8222-222222222222',
       'Cleo': '33333333-3333-4333-8333-333333333333', 'Dot': '44444444-4444-4444-8444-444444444444',
       'Eli': '55555555-5555-4555-8555-555555555555'}
PORTRAIT, LANDSCAPE = {'width': 412, 'height': 915}, {'width': 915, 'height': 412}
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

STUB = "window.__events = []; window.__analyticsStub = { capture(e, p) { window.__events.push([e, p || {}]); } };"
HELPERS = r'''(() => {
  const c = window.__tinselby.ctx;
  if (window.__sa) return true;
  const P = window.__sa = {};
  const r0 = c.engine.post.render.bind(c.engine.post);
  P.fast = (on) => { c.engine.post.render = on ? (s, cam) => { s.updateMatrixWorld(); cam.updateMatrixWorld(); } : r0; return on; };
  P.fast(true);
  P.vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  P.rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  P.text = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  P.inside = (sels) => { const W = innerWidth, H = innerHeight, out = [];
    for (const s of sels) { const e = document.querySelector(s); if (!e) { out.push('missing ' + s); continue; } const r = e.getBoundingClientRect();
      if (r.width < 1 || r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`${s} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)} vs ${W}x${H}`); }
    for (const b of document.querySelectorAll('.tbi-sacard .knit-btn')) { const r = b.getBoundingClientRect(); if (r.height < 40 || r.width < 44) out.push(`small button ${b.textContent} ${Math.round(r.width)}x${Math.round(r.height)}`); if (b.scrollWidth > b.clientWidth + 2) out.push('clipped ' + b.textContent); }
    return out; };
  return true;
})()'''

def ev(pg, js): return pg.evaluate(js)
def step(pg, n=2): pg.evaluate(f'window.__tinselby.step(1/30,{n})')
def tap(pg, sel):
    pg.locator(sel).first.tap(timeout=20000); step(pg, 1)
def wait(pg, js, secs=10.0):
    t = time.time()
    while time.time() - t < secs:
        if ev(pg, js): return True
        time.sleep(0.25)
    return bool(ev(pg, js))

def shot(pg, name, sels=(), orient=('p', 'l')):
    for o in orient:
        vp = PORTRAIT if o == 'p' else LANDSCAPE
        pg.set_viewport_size(vp)
        pg.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 120)))')
        pg.evaluate('window.__sa && window.__sa.fast(false); window.__tinselby.step(1/30, 2)')
        pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        tag = f'{vp["width"]}x{vp["height"]}'
        if sels:
            f = ev(pg, f'window.__sa.inside({json.dumps(list(sels))})')
            check(not f, f'layout {name} {tag}: {f}')
        pg.screenshot(path=f'{SHOTS}/santaarr_{name}_{tag}.png')
        pg.evaluate('window.__sa && window.__sa.fast(true)')
    pg.set_viewport_size(PORTRAIT)
    print(f'  shot santaarr_{name}', flush=True)

def load(ctxt, name, q, play=False):
    pg = ctxt.new_page(); pg.set_viewport_size(PORTRAIT); pg.set_default_timeout(300000); attach(pg, name)
    pg.add_init_script(STUB)
    pg.goto(BASE + ('&play' if play else '') + f'&santaAs={IDS[name]}' + q, wait_until='commit')
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
    pg.evaluate(HELPERS); step(pg, 2)
    if play: pg.evaluate(f'{C}.net.setName({json.dumps(name)}); {C}.game.state.playerName = {json.dumps(name)};')
    return pg

def reload(pg, q):
    pg.goto(BASE + q, wait_until='commit')
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
    pg.evaluate(HELPERS); step(pg, 2)

def events(pg): return ev(pg, 'window.__events.filter(e => e[0].startsWith("santa"))')
def card_kind(pg):
    return ev(pg, '(() => { const c = document.querySelector(".tbi-sacard:not(.out)"); return c && !c.hidden ? [...c.classList].find(k => k.startsWith("tbi-") && k !== "tbi-sacard") : null; })()')
def in_play(pg): return ev(pg, f'{C}.game.state.phase') == 'play'
def clear_invite_store(pg): pg.evaluate("localStorage.removeItem('tinselby.santaInvite.v1')")
def clear_profile(pg): pg.evaluate("localStorage.removeItem('tinselby.profile')")

T0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctxt = b.new_context(viewport=PORTRAIT, is_mobile=True, has_touch=True, device_scale_factor=1)
    pre = ctxt.new_page(); pre.goto(ORIGIN + '/index.html?net=off&capture', wait_until='commit')
    pre.wait_for_function('document.readyState !== "loading"'); pre.evaluate('localStorage.clear(); sessionStorage.clear()'); pre.close()

    # ---- A starts Secret Santa in the QQ test town
    A = load(ctxt, 'Ava', f'&town={TOWN}', play=True)
    check(wait(A, f'{C}.net.town && {C}.net.town.code === "{TOWN}"', 20), f'A: in friends town {TOWN}')
    r = ev(A, f'(async () => {{ const r = await {C}.santa.api.start(); await {C}.santa.refresh(); return {C}.santa.status(); }})()')
    check(r and r['state'] == 'open' and r['members'] == ['Ava'], f'A: Secret Santa started ({r and r["state"]}, {r and r["members"]})')
    print(f'[A ready {round(time.time() - T0)} s]', flush=True)

    # ---- B: new player opens the link without &play
    B = load(ctxt, 'Bram', f'&reset&town={TOWN}&santa=1&from=Ava')  # &reset: tabs share the save (A's name)
    wt = ev(B, 'window.__sa.text(".tbi-welcome")')
    check('Ava invited you to Secret Santa!' in wt and 'Swap secret presents with friends on Christmas Day' in wt, f'B: Secret Santa welcome text ({wt!r})')
    check(ev(B, '!!document.querySelector(".tbi-welcome.tbi-santa .tbi-ico svg") && !document.querySelector(".tbi-welcome img")'), 'B: knitted present icon (SVG)')
    check('invited you to Tinselby' not in wt, 'B: replaces the normal invite line')
    check(ev(B, '!/santa=1|from=/.test(location.search) && /town=QQARV2/.test(location.search) && /santaAs=/.test(location.search)'), f'B: URL cleaned, town kept ({ev(B, "location.search")})')
    shot(B, 'welcome', ('.tbi-welcome', '#tb-name', '.tb-enter'))
    ev_b = events(B)
    check(['santa_invite_opened', {'has_from': True}] in ev_b, f'B: santa_invite_opened {{has_from: true}} ({ev_b})')
    tap(B, '#tb-name'); B.keyboard.type('Bram')
    tap(B, '.tb-enter'); time.sleep(0.6); step(B, 4)
    tap(B, '.tb-entry .tb-primary'); step(B, 2)
    check(in_play(B) and ev(B, f'{C}.game.state.playerName') == 'Bram', 'B: in play as Bram (real taps + typing)')
    check(wait(B, f'{C}.net.town && {C}.net.town.code === "{TOWN}"', 15), f'B: already in Ava\'s friends town')
    check(wait(B, '!!document.querySelector(".tbi-sacard.tbi-join:not([hidden])")', 40), 'B: join card shown')
    jt = ev(B, 'window.__sa.text(".tbi-sacard")')
    check("Join Ava’s Secret Santa?" in jt and 'Join' in jt and 'Not now' in jt, f'B: join card text ({jt!r})')
    check(ev(B, '!document.querySelector(".tbsa-cards > .tb-card")'), 'B: no santa-module nudge on top of it')
    shot(B, 'joincard', ('.tbi-sacard', '.tbi-b-join', '.tbi-b-later'))
    tap(B, '.tbi-b-join')
    check(wait(B, 'window.__sa.vis(".tbsa-panel") && !!document.querySelector(".tbi-sa-banner, .tbsa-step")', 20), 'B: Join → Secret Santa sheet opens with "You\'re in!"')
    st = ev(B, f'{C}.santa.status()')
    check(st and st['joined'] and st['members'] == ['Ava', 'Bram'], f'B: is a member ({st and st["members"]})')
    bt = ev(B, 'window.__sa.text(".tbi-sa-banner")')
    check(bt == 'You’re in! 2 friends so far' or 'You’re in!' in ev(B, 'window.__sa.text(".tbsa-step")'), f'B: "You\'re in!" ({bt!r})')
    inv = ev(B, '[".tbsa-invite", ".tbsa-share", ".tbsa-wa", ".tbsa-copy"].some(s => window.__sa.vis(s))')
    check(inv and ev(B, 'window.__sa.vis(".tbsa-members")'), f'B: member list + invite step (< 3) ({ev(B, "window.__sa.text(\".tbsa-body\")")[:120]!r})')
    check(not card_kind(B), 'B: join card gone')
    shot(B, 'joined', ('.tbsa-panel', '.tbi-sa-banner'))
    ev_b = [e[0] for e in events(B)]
    check('santa_invite_joined' in ev_b and 'santa_joined' in ev_b, f'B: santa_invite_joined + santa_joined ({ev_b})')
    allp = json.dumps(ev(B, 'window.__events.map(e => e[1])'))
    check('Ava' not in allp and 'Bram' not in allp and TOWN not in allp, 'B: no names / codes in analytics props')
    tap(B, '.tbsa-x')
    check(not ev(B, '!!document.querySelector(".tbi-sa-banner")') and not ev(B, 'window.__sa.vis(".tbsa-panel")'), 'B: sheet closed, banner removed')
    a2 = ev(A, f'(async () => {{ await {C}.santa.refresh(); {C}.santa.open(); return {C}.santa.status(); }})()')
    check(a2 and 'Bram' in a2['members'], f'A: sheet shows Bram after refresh ({a2 and a2["members"]})')
    wait(A, 'window.__sa.text(".tbsa-members").includes("Bram")', 8)
    shot(A, 'starter_sees_b', ('.tbsa-panel',), orient=('p',))
    ev(A, f'{C}.santa.close()')
    # reload B (address bar has no santa / from any more) → returning, Continue → no prompt
    reload(B, f'&santaAs={IDS["Bram"]}&town={TOWN}')
    check(not ev(B, '!!document.querySelector(".tbi-welcome")'), 'B reload: no welcome')
    tap(B, '.tb-enter'); step(B, 2)
    time.sleep(7)
    check(in_play(B) and not card_kind(B), f'B reload: no re-prompt ({card_kind(B)})')
    # the original link again → still nothing
    reload(B, f'&santaAs={IDS["Bram"]}&town={TOWN}&santa=1&from=Ava')
    tap(B, '.tb-enter'); step(B, 2); time.sleep(6)
    check(not card_kind(B), f'B reopens the link: no re-prompt ({card_kind(B)})')
    print(f'[B done {round(time.time() - T0)} s]', flush=True)

    # ---- C: returning player (name saved) → no welcome, Continue → join card → Not now
    clear_invite_store(B); B.close()
    Cp = load(ctxt, 'Cleo', f'&town={TOWN}&santa=1&from=Ava')
    check(not ev(Cp, '!!document.querySelector(".tbi-welcome")') and ev(Cp, 'window.__sa.vis(".tb-back-hello")'), 'C (returning): no welcome, "Welcome back"')
    shot(Cp, 'returning_entry', orient=('p',))
    tap(Cp, '.tb-enter'); step(Cp, 2)
    check(in_play(Cp), 'C: Continue → play')
    check(wait(Cp, '!!document.querySelector(".tbi-sacard.tbi-join:not([hidden])")', 30), 'C: straight to the join card')
    sub = ev(Cp, 'window.__sa.text(".tbi-sacard .tb-card-sub")')
    check('2 friends have joined' in sub, f'C: card counts members ({sub!r})')
    shot(Cp, 'returning_joincard', ('.tbi-sacard',), orient=('p',))
    tap(Cp, '.tbi-b-later'); time.sleep(0.5)
    check(not card_kind(Cp) and not ev(Cp, f'{C}.santa.status()')['joined'], 'C: Not now → card gone, not a member')
    check('santa_invite_dismissed' in [e[0] for e in events(Cp)], 'C: santa_invite_dismissed')
    reload(Cp, f'&santaAs={IDS["Cleo"]}&town={TOWN}&santa=1&from=Ava')
    tap(Cp, '.tb-enter'); step(Cp, 2); time.sleep(7)
    check(not card_kind(Cp), f'C: link again after Not now → no card ({card_kind(Cp)})')
    clear_invite_store(Cp); Cp.close()
    print(f'[C done {round(time.time() - T0)} s]', flush=True)

    # ---- D: the group is already drawn (3 members, drawn) → friendly fallback
    ev(A, f'{C}.net.joinTown("{TOWN_DRAWN}")')
    check(wait(A, f'{C}.net.town && {C}.net.town.code === "{TOWN_DRAWN}"', 20), f'A: moved to {TOWN_DRAWN}')
    dr = ev(A, f'''(async () => {{
      const s = {C}.santa.api; await s.start();
      for (const [id, n] of [['66666666-6666-4666-8666-666666666666', 'Finn'], ['77777777-7777-4777-8777-777777777777', 'Gus']])
        await s.mock.rpc('santa_join', {{ p_town: '{TOWN_DRAWN}', p_player: id, p_secret: id.split('').reverse().join(''), p_name: n }});
      const r = await s.draw(); return r.ok ? r.status.state : r.code; }})()''')
    check(dr == 'drawn', f'A: group drawn ({dr})')
    D = load(ctxt, 'Dot', f'&town={TOWN_DRAWN}&santa=1&from=Ava')
    tap(D, '.tb-enter'); step(D, 2)
    check(wait(D, '!!document.querySelector(".tbi-sacard.tbi-drawn:not([hidden])")', 30), 'D: drawn fallback card')
    dt = ev(D, 'window.__sa.text(".tbi-sacard")')
    check('Names are already drawn' in dt and 'present from the town' in dt and 'Join' not in dt, f'D: fallback text ({dt!r})')
    shot(D, 'drawn', ('.tbi-sacard',))
    tap(D, '.tbi-b-ok'); time.sleep(0.4)
    check(not card_kind(D), 'D: OK closes it')
    clear_invite_store(D); clear_profile(D); D.close()

    # ---- E: new player, link without from, town with no Secret Santa → welcome without a name → "has ended"
    E = load(ctxt, 'Eli', f'&reset&town={TOWN_NONE}&santa=1')
    wt = ev(E, 'window.__sa.text(".tbi-welcome")')
    check('You’re invited to a Secret Santa!' in wt, f'E: welcome without from ({wt!r})')
    check(['santa_invite_opened', {'has_from': False}] in events(E), f'E: santa_invite_opened {{has_from: false}} ({events(E)})')
    shot(E, 'welcome_nofrom', ('.tbi-welcome', '#tb-name', '.tb-enter'), orient=('p',))
    tap(E, '#tb-name'); E.keyboard.type('Eli')
    tap(E, '.tb-enter'); time.sleep(0.6); step(E, 4)
    tap(E, '.tb-entry .tb-primary'); step(E, 2)
    check(wait(E, '!!document.querySelector(".tbi-sacard.tbi-ended:not([hidden])")', 30), 'E: ended card')
    check('This Secret Santa has ended' in ev(E, 'window.__sa.text(".tbi-sacard")'), 'E: ended text')
    shot(E, 'ended', ('.tbi-sacard',), orient=('p',))
    E.close(); A.close()
    b.close()

print(f'\n{len(fails)} fail(s), {len(errs)} console error(s), {round(time.time() - T0)} s')
for f in fails: print('  FAIL', f)
for e in errs[:12]: print('  ', e)
