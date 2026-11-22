#!/usr/bin/env python3
"""Secret Santa e2e (PHASE3.md): three pages of one browser share a friends town with ?net=local (BroadcastChannel net +
the in-memory Santa mock, src/santa/mock.js). Each page plays as its own player via ?santaAs=<uuid> (tabs of one browser
share the save). Phone context (touch) at 412x915; landscape shots at 915x412; fit checks at 360x640 / 390x844 / 844x390.

  public  big town: Friends card has no Secret Santa row, shows the one-line hint
  flow    A starts (Friends card row → sheet → Start), B gets the join nudge → joins, 2 members can't draw (button
          disabled + server too_few), C joins / leaves / joins, A draws (confirm), everyone sees exactly one match (not
          themselves, all different), presents picked (tile, change, "let the elves choose"), a 4th page in town but not
          in the draw sees "a present from the town", roster badge, then the clock jumps to 25 Dec (?santaNow hook /
          ctx.santa.setNow): Christmas nudge, Open it → granted once (reload → no second grant), same reveal list everywhere

Build first:  npx vite build --outDir /tmp/santa/dist --emptyOutDir     Served on http://localhost:8793 (SANTA_DIST / SANTA_PORT).
Shots: shots/santa_*.png. NOLOCK=1 skips the shared Chrome lock (run under nice -n 19).
Usage: python3 tools/santa3.py [public] [flow]   (default: both)"""
import fcntl, functools, http.server, json, os, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.environ.get('SANTA_DIST', '/tmp/santa/dist')
PORT = int(os.environ.get('SANTA_PORT', '8793'))
ORIGIN = f'http://localhost:{PORT}'
BASE = ORIGIN + '/index.html?capture&play&net=local&reveal=all&tod=13'
SHOTS = '/home/claude/tinselby/shots'
PARTS = set(sys.argv[1:]) or {'public', 'flow'}
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
C = 'window.__tinselby.ctx'
TOWN = 'QQSAN2'
IDS = {'Ava': '11111111-1111-4111-8111-111111111111', 'Bram': '22222222-2222-4222-8222-222222222222',
       'Cleo': '33333333-3333-4333-8333-333333333333', 'Dot': '44444444-4444-4444-8444-444444444444'}
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

HELPERS = r'''(() => {
  const c = window.__tinselby.ctx;
  if (window.__s3) return true;
  const P = window.__s3 = { toasts: [], grants: [], events: [] };
  c.game.on('ui:toast', (d) => P.toasts.push(String(d && d.text)));
  c.game.on('reward:grant', (r) => P.grants.push(r && r.id));
  for (const e of ['santa:started', 'santa:joined', 'santa:left', 'santa:drawn', 'santa:gift', 'santa:revealed']) c.game.on(e, (d) => P.events.push(e));
  const r0 = c.engine.post.render.bind(c.engine.post);
  P.fast = (on) => { c.engine.post.render = on ? (s, cam) => { s.updateMatrixWorld(); cam.updateMatrixWorld(); } : r0; return on; };
  P.fast(true);
  P.vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  P.rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  P.text = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  // every button in the sheet is on screen and fully inside the panel / viewport; panel inside the viewport
  P.fit = () => {
    const W = innerWidth, H = innerHeight, out = [];
    const p = document.querySelector('.tbsa-panel').getBoundingClientRect();
    if (p.left < -1 || p.top < -1 || p.right > W + 1 || p.bottom > H + 1) out.push(`panel ${Math.round(p.left)},${Math.round(p.top)},${Math.round(p.right)},${Math.round(p.bottom)} vs ${W}x${H}`);
    for (const b of document.querySelectorAll('.tbsa-actions .knit-btn, .tbsa-x')) {
      const r = b.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) out.push(`small ${b.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`off ${b.className}`);
      if (b.scrollWidth > b.clientWidth + 2) out.push(`clipped text ${b.textContent.trim()}`);
    }
    const bd = document.querySelector('.tbsa-body');
    if (bd.clientHeight < 60) out.push(`body only ${bd.clientHeight}px tall`);
    return out;
  };
  return true;
})()'''

def ev(pg, js): return pg.evaluate(js)
def step(pg, n=2): pg.evaluate(f'window.__tinselby.step(1/30,{n})')
def tap(pg, sel):
    pg.locator(sel).first.tap(timeout=15000)
    step(pg, 1)
def status(pg): return ev(pg, f'{C}.santa.status()')
def refresh(pg): return ev(pg, f'(async () => {{ await {C}.santa.refresh(); return {C}.santa.status(); }})()')
def wait(pg, js, secs=8.0):
    t = time.time()
    while time.time() - t < secs:
        if ev(pg, js): return True
        time.sleep(0.15)
    return bool(ev(pg, js))
def sheet_state(pg): return ev(pg, 'document.querySelector(".tbsa-layer").dataset.state || ""')

def shot(pg, name, orient=None):
    for o in (orient or ('p', 'l')):
        pg.set_viewport_size(PORTRAIT if o == 'p' else LANDSCAPE)
        pg.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)')
        pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        f = ev(pg, 'window.__s3.vis(".tbsa-panel") ? window.__s3.fit() : []')
        check(not f, f'layout {name} {"412x915" if o == "p" else "915x412"}: {f}')
        pg.screenshot(path=f'{SHOTS}/santa_{name}_{"412x915" if o == "p" else "915x412"}.png')
        pg.evaluate('window.__s3.fast(true)')
    pg.set_viewport_size(PORTRAIT)
    print(f'  shot santa_{name}', flush=True)

def fit_sweep(pg, label):
    for vp in ({'width': 360, 'height': 640}, {'width': 390, 'height': 844}, {'width': 844, 'height': 390}):
        pg.set_viewport_size(vp); step(pg, 1)
        pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        f = ev(pg, 'window.__s3.fit()')
        check(not f, f'fit {label} {vp["width"]}x{vp["height"]}: {f}')
    pg.set_viewport_size(PORTRAIT)

def load(ctxt, name, extra='', vp=PORTRAIT):
    pg = ctxt.new_page(); pg.set_viewport_size(vp); pg.set_default_timeout(300000); attach(pg, name)
    pg.goto(BASE + f'&santaAs={IDS[name]}' + extra, wait_until='commit')
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
    pg.evaluate(f'{C}.net.setName({json.dumps(name)}); {C}.game.state.playerName = {json.dumps(name)};')
    pg.evaluate(HELPERS)
    step(pg, 2)
    return pg

def close_sheet(pg):
    if ev(pg, 'window.__s3.vis(".tbsa-panel")'): tap(pg, '.tbsa-x')

def open_from_friends(pg, who):
    tap(pg, '.tbs-friends-btn'); step(pg, 2)
    if not check(ev(pg, 'window.__s3.vis(".tbsa-from-invite")'), f'{who}: Friends card shows the Secret Santa row'): return False
    tap(pg, '.tbsa-from-invite'); step(pg, 2)
    ok = wait(pg, 'window.__s3.vis(".tbsa-panel") && !["loading", "notown"].includes(document.querySelector(".tbsa-layer").dataset.state)')
    return check(ok, f'{who}: Secret Santa sheet opens from the Friends card ({sheet_state(pg)})')

def fresh_storage(ctxt):
    pg = ctxt.new_page(); pg.goto(ORIGIN + '/index.html?net=off&capture', wait_until='commit')
    pg.wait_for_function('document.readyState !== "loading"'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.close()

# ------------------------------------------------------------------------------------------------------------- parts
def public_part(b):
    ctxt = b.new_context(is_mobile=True, has_touch=True)
    fresh_storage(ctxt)
    pg = load(ctxt, 'Ava', '&town=')
    check(ev(pg, f'{C}.net.town === null && {C}.santa.available === false && {C}.santa.summary() === null'), 'public: big town, Santa unavailable, no summary')
    tap(pg, '.tbs-friends-btn'); step(pg, 2)
    check(ev(pg, 'window.__s3.vis(".tbs-invite") && !window.__s3.vis(".tbsa-from-invite")'), 'public: Friends card has no Secret Santa row')
    check(ev(pg, 'window.__s3.vis(".tbsa-fi-hint")') and 'Secret Santa' in ev(pg, 'window.__s3.text(".tbsa-fi-hint")'), 'public: one-line hint "Make a friends town to play Secret Santa"')
    pg.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)'); pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    pg.screenshot(path=f'{SHOTS}/santa_public_friends_412x915.png'); pg.evaluate('window.__s3.fast(true)')
    tap(pg, '.tbs-invite .tb-modal-close')
    check(ev(pg, f'{C}.social.openRoster() && !window.__s3.vis(".tbsa-ro-badge")'), 'public: roster has no Santa badge')
    ctxt.close()

def flow_part(b):
    ctxt = b.new_context(is_mobile=True, has_touch=True)
    fresh_storage(ctxt)
    A = load(ctxt, 'Ava', f'&town={TOWN}'); B = load(ctxt, 'Bram', f'&town={TOWN}'); Cc = load(ctxt, 'Cleo', f'&town={TOWN}')
    pages = {'Ava': A, 'Bram': B, 'Cleo': Cc}
    for n, pg in pages.items(): check(ev(pg, f'{C}.net.town?.code === "{TOWN}" && {C}.santa.available && {C}.santa.mode === "mock"'), f'{n}: in friends town {TOWN}, Santa mock')
    s = refresh(A)
    check(s and s['state'] == 'none', f'A: status none at start ({s and s["state"]})')

    # --- none → start
    if not open_from_friends(A, 'A'): return
    check(sheet_state(A) == 'none' and 'Names are drawn on 20 Dec' in ev(A, 'window.__s3.text(".tbsa-body")'), 'A: "none" explains in one line')
    shot(A, 'none')
    fit_sweep(A, 'none')
    tap(A, '.tbsa-start')
    ok = wait(A, f'{C}.santa.status()?.state === "open"')
    s = status(A)
    check(ok and s['count'] == 1 and s['joined'] and s['is_starter'] and s['starter'] == 'Ava', f'A: started → open, 1 joined, starter Ava ({s})')
    check('Names drawn in' in ev(A, 'window.__s3.text(".tbsa-when")'), f'A: countdown "{ev(A, "window.__s3.text(\".tbsa-when\")")}"')
    check(ev(A, '!!document.querySelector(".tbsa-askdraw")?.disabled'), 'A: "Draw names now" disabled with 1 member')

    # --- B: join nudge → join
    s = refresh(B)
    ok = wait(B, 'window.__s3.vis(".tbsa-cards .tbsa-card")', 6)
    check(ok and 'started Secret Santa' in ev(B, 'window.__s3.text(".tbsa-cards .tbsa-card")'), f'B: one-time join nudge ({ev(B, "window.__s3.text(\".tbsa-cards\")")})')
    if ok:
        B.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)'); B.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        B.screenshot(path=f'{SHOTS}/santa_nudge_join_412x915.png'); B.evaluate('window.__s3.fast(true)')
        tap(B, '.tbsa-cards .tbsa-card .knit-btn.green')
    else: ev(B, f'{C}.santa.open()')
    ok = wait(B, 'window.__s3.vis(".tbsa-join")')
    check(ok, 'B: "Have a look" opens the sheet with Join')
    tap(B, '.tbsa-join')
    check(wait(B, f'{C}.santa.status()?.joined === true && {C}.santa.status()?.count === 2'), 'B: joined (2)')
    check(ev(B, 'window.__s3.vis(".tbsa-leave") && !document.querySelector(".tbsa-askdraw")'), 'B: Leave shown, no draw button (not the starter)')
    # nudge only once: re-check status → no second card
    close_sheet(B); refresh(B); time.sleep(0.5)
    check(ev(B, '!document.querySelector(".tbsa-cards .tbsa-card:not(.out)")'), 'B: no nudge once joined / already nudged')

    # --- 2 members can't draw
    s = refresh(A)
    check(s['count'] == 2 and ev(A, '!!document.querySelector(".tbsa-askdraw")?.disabled'), f'A: 2 members, draw still disabled')
    r = ev(A, f'{C}.santa.api.draw()')
    check(not r['ok'] and r['code'] == 'too_few' and 'at least 3' in r['message'], f'A: server refuses to draw with 2 ({r.get("code")}: {r.get("message")})')

    # --- C joins, leaves (before the draw), joins again
    ev(Cc, f'{C}.santa.open()'); wait(Cc, 'window.__s3.vis(".tbsa-join")')
    ev(Cc, f'{C}.santa.refresh()'); wait(Cc, 'window.__s3.vis(".tbsa-join")')
    tap(Cc, '.tbsa-join'); check(wait(Cc, f'{C}.santa.status()?.count === 3'), 'C: joined (3)')
    tap(Cc, '.tbsa-leave'); check(wait(Cc, f'{C}.santa.status()?.count === 2 && !{C}.santa.status().joined'), 'C: left before the draw (2)')
    check(sorted(refresh(A)['members']) == ['Ava', 'Bram'], 'A: member list after C left')
    tap(Cc, '.tbsa-join'); check(wait(Cc, f'{C}.santa.status()?.count === 3'), 'C: joined again (3)')
    shot(Cc, 'open_member')
    close_sheet(Cc)

    # --- A sees 3 and draws (confirm step)
    s = refresh(A)
    check(s['count'] == 3 and sorted(s['members']) == ['Ava', 'Bram', 'Cleo'], f'A: 3 members {s["members"]}')
    check(ev(A, '!document.querySelector(".tbsa-askdraw")?.disabled'), 'A: "Draw names now" enabled at 3')
    shot(A, 'open_starter')
    fit_sweep(A, 'open')
    tap(A, '.tbsa-askdraw')
    check(ev(A, 'window.__s3.vis(".tbsa-draw") && window.__s3.vis(".tbsa-nodraw")'), 'A: draw asks to confirm')
    tap(A, '.tbsa-draw')
    check(wait(A, f'{C}.santa.status()?.state === "drawn"'), 'A: names drawn')
    matches = {}
    for n, pg in pages.items():
        s = refresh(pg)
        matches[n] = s and s['my_match']
        check(s and s['state'] == 'drawn' and s['my_match'] and s['my_match'] != n and not s['gifts'], f'{n}: drawn, one match: {s and s["my_match"]}')
    check(sorted(matches.values()) == ['Ava', 'Bram', 'Cleo'], f'matches are all different and cover everyone: {matches}')
    check(ev(A, 'window.__s3.events.includes("santa:drawn")') and not ev(B, 'window.__s3.events.includes("santa:drawn")'), 'santa:drawn emitted by the starter only')

    # --- the Friends card in a friends town: the Secret Santa row with its badge
    close_sheet(A)
    tap(A, '.tbs-friends-btn'); step(A, 2)
    check(ev(A, 'window.__s3.vis(".tbsa-from-invite")') and ev(A, 'window.__s3.text(".tbsa-fi-badge")') == 'Names drawn', f'A: Friends card row badge "{ev(A, "window.__s3.text(\'.tbsa-fi-badge\')")}"')
    for o, vp in (('412x915', PORTRAIT), ('915x412', LANDSCAPE), ('360x640', {'width': 360, 'height': 640})):
        A.set_viewport_size(vp); A.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)'); A.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        r = ev(A, 'window.__s3.rect(".tbsa-from-invite")')
        check(r and r['b'] <= vp['height'] and r['t'] >= 0 or ev(A, 'document.querySelector(".tbs-invite-grid").scrollHeight > document.querySelector(".tbs-invite-grid").clientHeight'), f'A: Santa row reachable in the Friends card at {o} ({r})')
        A.screenshot(path=f'{SHOTS}/santa_friends_card_{o}.png'); A.evaluate('window.__s3.fast(true)')
    A.set_viewport_size(PORTRAIT)
    tap(A, '.tbs-invite .tb-modal-close')

    # --- a 4th page in town that never joined: "a present from the town"
    D = load(ctxt, 'Dot', f'&town={TOWN}')
    s = refresh(D)
    check(s['state'] == 'drawn' and not s['joined'] and s['late'] and s['my_match'] is None, f'D: not in the draw (late={s["late"]})')
    ev(D, f'{C}.santa.open()'); wait(D, 'document.querySelector(".tbsa-layer").dataset.state === "drawn"')
    check('present from the town' in ev(D, 'window.__s3.text(".tbsa-body")'), 'D: "You\'ll get a present from the town!"')
    shot(D, 'drawn_late')
    close_sheet(D)

    # --- presents: A has two pieces (picks, then changes), B has one, C has none → the elves choose
    close_sheet(A)
    ev(A, f'{C}.progress.rewards.grant("scarf:gold"); {C}.progress.rewards.grant("coat:plum")')
    ev(B, f'{C}.progress.rewards.grant("hat:santa")')
    check(ev(Cc, f'{C}.progress.rewards.owned().length') == 0, 'C: owns no giftable pieces')
    ev(A, f'{C}.santa.open()'); wait(A, 'window.__s3.vis(".tbsa-tile")')
    check(f'Secret Santa for {matches["Ava"]}' in ev(A, 'window.__s3.text(".tbsa-match")'), f'A: "You\'re Secret Santa for {matches["Ava"]}!"')
    check(ev(A, 'document.querySelectorAll(".tbsa-tile").length') == 2, 'A: picker lists the 2 owned pieces')
    shot(A, 'drawn_pick')
    fit_sweep(A, 'drawn_pick')
    tap(A, '.tbsa-tile[data-item="scarf.gold"]')
    check(wait(A, f'{C}.santa.status()?.my_gift === "scarf.gold" && window.__s3.vis(".tbsa-change")'), 'A: gave Gold scarf, "Change present" shown')
    shot(A, 'drawn_chosen')
    tap(A, '.tbsa-change'); wait(A, 'window.__s3.vis(".tbsa-tile")')
    check(ev(A, 'document.querySelector(".tbsa-tile.on")?.dataset.item') == 'scarf.gold', 'A: change shows the current present selected')
    tap(A, '.tbsa-tile[data-item="coat.plum"]')
    check(wait(A, f'{C}.santa.status()?.my_gift === "coat.plum"'), 'A: changed present to the Plum coat')
    close_sheet(A)
    ev(B, f'{C}.santa.open()'); wait(B, 'window.__s3.vis(".tbsa-tile")'); tap(B, '.tbsa-tile[data-item="hat.santa"]')
    check(wait(B, f'{C}.santa.status()?.my_gift === "hat.santa"'), 'B: gave the Santa hat')
    close_sheet(B)
    # C goes back to the big town before picking: the big town points back to the group ("Go there" → sheet)
    ev(Cc, f'{C}.net.leaveTown()')
    ok = wait(Cc, f'!{C}.net.town && window.__s3.vis(".tbsa-cards .tbsa-card")', 15)
    check(ok and 'Pick a present for Ava' in ev(Cc, 'window.__s3.text(".tbsa-cards .tbsa-card")') or ok and 'Pick a present for' in ev(Cc, 'window.__s3.text(".tbsa-cards .tbsa-card")'), f'C (big town): nudge back to the group "{ev(Cc, "window.__s3.text(\'.tbsa-cards\')")}"')
    if ok:
        Cc.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)'); Cc.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        Cc.screenshot(path=f'{SHOTS}/santa_nudge_away_412x915.png'); Cc.evaluate('window.__s3.fast(true)')
        tap(Cc, '.tbsa-cards .tbsa-card .knit-btn.green')
        check(wait(Cc, f'{C}.net.town?.code === "{TOWN}" && window.__s3.vis(".tbsa-elves")', 15), 'C: "Go there" → back in the friends town, sheet open on the picker')
    else: ev(Cc, f'{C}.net.joinTown("{TOWN}")'); wait(Cc, f'{C}.net.town?.code === "{TOWN}"')
    if not ev(Cc, 'window.__s3.vis(".tbsa-panel")'): ev(Cc, f'{C}.santa.open()')
    wait(Cc, 'window.__s3.vis(".tbsa-elves")')
    shot(Cc, 'drawn_elves', ('p',))
    tap(Cc, '.tbsa-elves')
    check(wait(Cc, f'/^(coat|hat|scarf)\\.[a-z]+$/.test({C}.santa.status()?.my_gift || "")'), f'C: the elves chose {ev(Cc, f"{C}.santa.status()?.my_gift")}')
    close_sheet(Cc)
    gifts_given = {n: status(pg)['my_gift'] for n, pg in pages.items()}

    # --- roster badge
    ev(A, f'{C}.social.openRoster()'); step(A, 2)
    ok = wait(A, 'window.__s3.vis(".tbsa-ro-badge")')
    check(ok and 'Secret Santa' in ev(A, 'window.__s3.text(".tbsa-ro-badge")'), f'A: roster header badge "{ev(A, "window.__s3.text(\".tbsa-ro-badge\")")}"')
    A.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)'); A.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    A.screenshot(path=f'{SHOTS}/santa_roster_badge_412x915.png'); A.evaluate('window.__s3.fast(true)')
    if ok:
        tap(A, '.tbsa-ro-badge')
        check(wait(A, 'window.__s3.vis(".tbsa-panel")'), 'A: roster badge opens the sheet')
    close_sheet(A)
    check(ev(B, f'{C}.santa.api.give("scarf.gold")')['ok'], 'B: give still allowed before reveal')
    ev(B, f'{C}.santa.api.give("hat.santa")')

    # --- 25 Dec: reveal
    for n, pg in {**pages, 'Dot': D}.items(): ev(pg, f'{C}.santa.setNow("2026-12-25T10:00:00Z")')
    for n, pg in {**pages, 'Dot': D}.items(): wait(pg, f'{C}.santa.status()?.state === "revealed"')
    lists = {n: status(pg)['gifts'] for n, pg in {**pages, 'Dot': D}.items()}
    check(all(l == lists['Ava'] for l in lists.values()) and len(lists['Ava']) == 3, f'all 4 pages see the same reveal list: {lists["Ava"]}')
    for g in lists['Ava']:
        check(matches[g['from']] == g['to'] and gifts_given[g['from']] == g['item'], f'reveal row {g["from"]} → {g["to"]}: {g["item"]}')
    r = ev(B, f'{C}.santa.api.give("scarf.gold")')
    check(not r['ok'] and r['code'] == 'revealed', f'B: present can\'t change after the reveal ({r.get("code")})')
    ok = wait(A, 'window.__s3.vis(".tbsa-cards .tbsa-card")', 6)
    check(ok and 'present is waiting' in ev(A, 'window.__s3.text(".tbsa-cards")'), f'A: Christmas nudge "{ev(A, "window.__s3.text(\".tbsa-cards\")")}"')
    if ok:
        A.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)'); A.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        A.screenshot(path=f'{SHOTS}/santa_nudge_xmas_412x915.png'); A.evaluate('window.__s3.fast(true)')
        tap(A, '.tbsa-cards .tbsa-card .knit-btn.green')
    expect = {g['to']: g for g in lists['Ava']}
    for n, pg in {**pages, 'Dot': D}.items():
        if not ev(pg, 'window.__s3.vis(".tbsa-panel")'): ev(pg, f'{C}.santa.open()')
        if not check(wait(pg, 'window.__s3.vis(".tbsa-box")'), f'{n}: present box waiting'): continue
        if n == 'Ava': shot(pg, 'revealed_box')
        g0 = len(ev(pg, 'window.__s3.grants'))
        tap(pg, '.tbsa-unwrap')
        wait(pg, 'window.__s3.vis(".tbsa-got")')
        got = ev(pg, 'window.__s3.text(".tbsa-got")')
        grants = ev(pg, 'window.__s3.grants')[g0:]
        if n in expect:
            item = expect[n]['item']; rid = item.replace('.', ':'); frm = expect[n]['from']
            check(f'From your Secret Santa: {frm}' in got, f'{n}: "{got}"')
            check(ev(pg, f'{C}.progress.rewards.has("{rid}")'), f'{n}: received {rid} is in the wardrobe (grants {grants})')
        else:
            check('From everyone in Tinselby' in got and len(grants) == 1, f'{n} (not in the draw): town present "{got}" grants {grants}')
        check(ev(pg, 'window.__s3.events.filter(e => e === "santa:revealed").length') == 1, f'{n}: santa:revealed once')
        if n == 'Ava':
            shot(pg, 'revealed_list')
            fit_sweep(pg, 'revealed')
        check(ev(pg, 'document.querySelectorAll(".tbsa-list li").length') == 3, f'{n}: reveal list has 3 rows')
        close_sheet(pg)
        ok = wait(pg, 'window.__s3.vis(".tbsa-cards .tbsa-card") && /^New: /.test(window.__s3.text(".tbsa-cards .tb-card-title"))', 4)
        check(ok, f'{n}: reward card after closing ("{ev(pg, "window.__s3.text(\".tbsa-cards .tbsa-card\")")}")')
        if n == 'Ava' and ok:
            pg.evaluate('window.__s3.fast(false); window.__tinselby.step(1/30, 1)'); pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
            pg.screenshot(path=f'{SHOTS}/santa_reward_card_412x915.png'); pg.evaluate('window.__s3.fast(true)')
        # opening again: no box, no new grants
        g1 = len(ev(pg, 'window.__s3.grants'))
        ev(pg, f'{C}.santa.open()'); wait(pg, 'window.__s3.vis(".tbsa-got")')
        check(not ev(pg, 'window.__s3.vis(".tbsa-box")') and len(ev(pg, 'window.__s3.grants')) == g1, f'{n}: reopening shows the opened present, nothing granted again')
        close_sheet(pg)
    # reload B: still no second grant (flag per season / town / player)
    B.close()
    B = load(ctxt, 'Bram', f'&town={TOWN}&santaNow=2026-12-25T10:00:00Z')
    s = refresh(B)
    check(s['state'] == 'revealed', 'B (reloaded with ?santaNow): revealed')
    time.sleep(1)
    check(not ev(B, 'window.__s3.vis(".tbsa-cards .tbsa-card")'), 'B (reloaded): no Christmas nudge (already opened)')
    ev(B, f'{C}.santa.open()'); wait(B, 'window.__s3.vis(".tbsa-got")')
    check(not ev(B, 'window.__s3.vis(".tbsa-box")') and ev(B, 'window.__s3.grants.length') == 0, 'B (reloaded): opened present shown, no grant')
    close_sheet(B)
    for n, pg in (('Ava', A), ('Cleo', Cc), ('Dot', D), ('Bram', B)):
        ev_list = ev(pg, 'window.__s3.events')
        print(f'  {n} events {ev_list}')
    ctxt.close()

t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    if 'public' in PARTS:
        try: public_part(b)
        except Exception as e: check(False, f'public: exception {str(e)[:400]}')
    if 'flow' in PARTS:
        try: flow_part(b)
        except Exception as e: check(False, f'flow: exception {str(e)[:400]}')
    b.close()
srv.shutdown()
print(f'\n{len(fails)} FAILS' + (':' if fails else ''), flush=True)
for f in fails: print('  - ' + f)
print(f'{len(errs)} CONSOLE ERRORS' + (':' if errs else ''))
for e in errs[:30]: print('  ' + e)
print(f'({round(time.time() - t0)} s)')
