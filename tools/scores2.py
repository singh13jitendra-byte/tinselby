#!/usr/bin/env python3
"""Friends-town scoreboards e2e (PHASE3.md, src/scores): two pages of one browser context in one friends town, ?net=local
(the scores mock is shared between the pages through BroadcastChannel).

  A (412x915 portrait, touch) creates a town, B (915x412 landscape, touch) joins. Cookie Bakery runs are finished
  instantly with a chosen score (def.start is swapped for mg.finish({score}) in the page, so the real framework results
  card + hook run): A 590 → ribbon "New best in your town!"; B 640 → "New best in your town! You beat Ava's 590!";
  A 600 → no ribbon, top 3 = Bram 640 / You 600, "Your best 600 pts · #2". Roster Scores tab: leader per game, expand
  top 5, "You" marked (A sees Bram on top, B sees You). Slow network: loading stitch → 4 s timeout note → late fill-in.
  Public town: no block on the results card, no Scores tab. Analytics stub: town_best {game}, scores_viewed {where}.
  0 console errors. Shots: shots/scores_*.png

Build first:  npx vite build --outDir /tmp/scores/dist --emptyOutDir     (SC_DIST / SC_PORT)
Usage: NOLOCK=1 nice -n 19 python3 -u tools/scores2.py"""
import fcntl, functools, http.server, json, os, threading, time
from playwright.sync_api import sync_playwright

DIST = os.environ.get('SC_DIST', '/tmp/scores/dist')
PORT = int(os.environ.get('SC_PORT', '8797'))
ORIGIN = f'http://localhost:{PORT}'
BASE = ORIGIN + '/index.html?capture&play&net=local&reveal=all&tod=13'
SHOTS = '/home/claude/tinselby/shots'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
C = 'window.__tinselby.ctx'
errs, fails = [], []

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/favicon'): self.send_response(204); self.end_headers(); return
        return super().do_GET()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
lock = open('/tmp/tinselby-chrome.lock', 'w')
if os.environ.get('NOLOCK') != '1': fcntl.flock(lock, fcntl.LOCK_EX)

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)
    return cond

INIT = r'''
window.__events = [];
window.__analyticsStub = { capture(e, p) { window.__events.push([e, p]); } };
// capture mode auto-closes the results card after 1.5 s wall time: hold it while window.__hold (screenshots / checks)
const st0 = window.setTimeout;
window.setTimeout = function (f, ms, ...a) { if (ms === 1500 && window.__hold) return 0; return st0.call(window, f, ms, ...a); };
'''
HELPERS = r'''(() => {
  const c = window.__tinselby.ctx;
  window.__hold = true;
  const r0 = c.engine.post.render.bind(c.engine.post);
  window.__fast = (on) => { c.engine.post.render = on ? (s, cam) => { s.updateMatrixWorld(); cam.updateMatrixWorld(); } : r0; };
  window.__fast(true);
  // finish Cookie Bakery instantly with window.__nextScore (the real framework: results card + scores hook)
  const def = c.minigames.get('cookies');
  def.start = (ctx, mg) => { mg.finish({ score: window.__nextScore, stars: 2, text: 'Test run.' }); };
  window.__play = (score) => { window.__nextScore = score; window.__res = null; c.minigames.play('cookies').then((r) => { window.__res = r; }); return 1; };
  window.__txt = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  window.__vis = (sel) => { const e = document.querySelector(sel); if (!e || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  window.__inView = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
  return true;
})()'''

PAGES = []  # both pages advance together (presence heartbeats / expiry run on each page's frames)
def step(pg, n=2):
    for q in PAGES or [pg]: q.evaluate(f'window.__tinselby.step(1/30,{n})')
def ev(pg, js): return pg.evaluate(js)

def wait(pg, js, secs=15.0, frames=0):
    t = time.time()
    while time.time() - t < secs:
        if ev(pg, js): return True
        if frames: step(pg, frames)
        time.sleep(0.15)
    return bool(ev(pg, js))

def shot(pg, name):
    ev(pg, 'window.__fast(false)'); step(pg, 1)
    ev(pg, 'document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    pg.screenshot(path=f'{SHOTS}/scores_{name}.png'); print(f'  shot scores_{name}', flush=True)
    ev(pg, 'window.__fast(true)')

def run_game(pg, score):
    ev(pg, f'window.__play({score})')
    return wait(pg, '!!document.querySelector(".mg-results")', 20, 1)

def done(pg):
    pg.locator('.mg-results .knit-btn.green').first.tap(timeout=10000)
    ok = wait(pg, f'window.__res !== null && {C}.game.state.phase === "play"', 15, 1)
    step(pg, 3)
    return ok

def results_town(pg):
    return ev(pg, '''(() => { const b = document.querySelector(".mg-results .sc-town"); if (!b) return null;
      return { wait: b.classList.contains("sc-wait"), off: b.classList.contains("sc-off"), ribbon: window.__txt(".mg-results .sc-ribbon"),
               mine: window.__txt(".mg-results .sc-mine"), top: [...b.querySelectorAll(".sc-top li")].map(li => li.textContent.replace(/\\s+/g, " ").trim()),
               note: window.__txt(".mg-results .sc-note"), stitch: !!b.querySelector(".sc-stitch") }; })()''')

def roster_scores(pg):
    ev(pg, f'{C}.social.openRoster ? {C}.social.openRoster() : window.__social.openRoster()'); step(pg, 2)
    if not check(ev(pg, 'window.__vis(".tbs-roster .sc-tabs")'), 'roster: People | Scores tabs shown in a friends town'): return None
    pg.locator('.sc-tab[data-t="scores"]').first.tap(timeout=10000); step(pg, 1)
    wait(pg, '!!document.querySelector(".sc-panel .sc-g")', 8, 1)
    return ev(pg, '[...document.querySelectorAll(".sc-panel .sc-g")].map(g => ({ title: g.querySelector(".sc-g-title").textContent, lead: g.querySelector(".sc-g-lead").textContent, me: g.classList.contains("me") }))')

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        cx = b.new_context(has_touch=True, is_mobile=True)
        cx.add_init_script(INIT)
        pre = cx.new_page(); pre.goto(ORIGIN + '/index.html?net=off&capture', wait_until='commit')
        pre.wait_for_function('document.readyState !== "loading"'); pre.evaluate('localStorage.clear(); sessionStorage.clear()'); pre.close()
        A = cx.new_page(); A.set_viewport_size({'width': 412, 'height': 915})
        B = cx.new_page(); B.set_viewport_size({'width': 915, 'height': 412})
        for pg, tag in ((A, 'A'), (B, 'B')):
            pg.set_default_timeout(300000)
            pg.on('console', lambda m, tag=tag: errs.append(f'[{tag}] {m.type}: {m.text}') if m.type == 'error' and 'GPU stall' not in m.text else None)
            pg.on('pageerror', lambda e, tag=tag: errs.append(f'[{tag}] PAGEERROR {e}'))
        for pg, name in ((A, 'Ava'), (B, 'Bram')):
            pg.goto(BASE, wait_until='commit'); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
            ev(pg, f'{C}.net.setName({json.dumps(name)}); {C}.game.state.playerName = {json.dumps(name)};')
            ev(pg, HELPERS)
        PAGES.extend([A, B])
        # one browser context = one localStorage = one progress.playerId: give B its own player id
        ev(B, f'Object.defineProperty({C}.progress, "playerId", {{ get: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", configurable: true }})')
        check(ev(A, f'{C}.scores.mode') == 'mock' and not ev(A, f'{C}.scores.enabled'), f'net=local → scores mock, disabled in the public town')
        code = ev(A, f'{C}.net.newTownCode()')
        ev(A, f'{C}.net.joinTown("{code}")'); ev(B, f'{C}.net.joinTown("{code}")')
        ok = wait(A, f'{C}.net.players().length === 1', 60, 2) and wait(B, f'{C}.net.players().length === 1', 30, 2)
        check(ok and ev(A, f'{C}.scores.enabled') and ev(B, f'{C}.scores.enabled'), f'A and B in friends town {code}, scores enabled ({ok}, {ev(A, f"{C}.net.players().length")}, {ev(B, f"{C}.net.players().length")}, {ev(A, f"{C}.scores.enabled")}, {ev(B, f"{C}.scores.enabled")})')

        # 1. A scores 590: first in the town → ribbon without "You beat"
        check(run_game(A, 590), 'A: results card for 590')
        wait(A, '!!document.querySelector(".mg-results .sc-top li")', 8)
        r = results_town(A)
        check(r and r['ribbon'] == 'New best in your town!' and r['top'] == ['1You590 pts'] and r['mine'] == 'Your best 590 pts · #1', f'A 590: {r}')
        check(ev(A, 'window.__inView(".mg-results .knit-btn.green")'), 'A 412x915: Done button on screen with the town block')
        shot(A, 'results_first_412x915')
        check(done(A), 'A: Done → back to play')

        # 2. B scores 640 → "You beat Ava's 590!"
        check(run_game(B, 640), 'B: results card for 640')
        wait(B, '!!document.querySelector(".mg-results .sc-top li")', 8)
        r = results_town(B)
        check(r and r['ribbon'] == "New best in your town!You beat Ava's 590!" and r['top'][:2] == ['1You640 pts', '2Ava590 pts'] and r['mine'] == 'Your best 640 pts · #1', f'B 640: {r}')
        check(ev(B, 'window.__inView(".mg-results .knit-btn.green")') and ev(B, 'document.querySelector(".mg-results").scrollHeight <= document.querySelector(".mg-results").clientHeight + 1'),
              'B 915x412: results card fits (no scroll), Done on screen')
        shot(B, 'results_beat_915x412')
        check(done(B), 'B: Done')

        # 3. A scores 600: not a town best → no ribbon, Bram on top, A #2 (board refetched after the cache went stale)
        ev(A, f'{C}.scores._api.invalidate()')
        check(run_game(A, 600), 'A: results card for 600')
        wait(A, '(() => { const t = [...document.querySelectorAll(".mg-results .sc-top li")].map(l => l.textContent); return t.length >= 2 && t[0].includes("Bram"); })()', 10)
        r = results_town(A)
        check(r and not r['ribbon'] and r['top'][:2] == ['1Bram640 pts', '2You600 pts'] and r['mine'] == 'Your best 600 pts · #2', f'A 600: {r}')
        shot(A, 'results_second_412x915')
        check(done(A), 'A: Done')

        # 4. roster Scores tab
        g = roster_scores(A)
        ck = [x for x in (g or []) if x['title'] == 'Cookie Bakery']
        check(ck and ck[0]['lead'] == 'Bram · 640 pts' and not ck[0]['me'], f'A roster Scores: Cookie Bakery leader Bram ({g})')
        check(ev(A, '!window.__vis(".tbs-ro-list")') and ev(A, 'window.__vis(".sc-fresh")'), 'A roster: people list hidden on the Scores tab, unplayed games listed')
        A.locator('.sc-g-main').first.tap(timeout=10000); step(A, 1)
        top = ev(A, '[...document.querySelectorAll(".sc-g.open .sc-g-top li")].map(l => l.textContent.replace(/\\s+/g, " ").trim())')
        check(top[:2] == ['1Bram640 pts', '2You600 pts'] and ev(A, 'document.querySelector(".sc-g.open .sc-g-top li.me .sc-name").textContent') == 'You', f'A roster expand: top 5 {top}')
        check(ev(A, 'window.__inView(".tbs-roster")'), 'A roster 412x915 fits the screen')
        shot(A, 'roster_412x915')
        ev(A, 'document.querySelector(".tbs-roster .tb-modal-close").click()'); step(A, 2)
        g = roster_scores(B)
        ck = [x for x in (g or []) if x['title'] == 'Cookie Bakery']
        check(ck and ck[0]['lead'] == 'You · 640 pts' and ck[0]['me'], f'B roster Scores: Cookie Bakery leader You ({g})')
        B.locator('.sc-g-main').first.tap(timeout=10000); step(B, 1)
        check(ev(B, 'window.__inView(".tbs-roster")') and ev(B, 'window.__inView(".sc-tabs")'), 'B roster 915x412 fits the screen')
        shot(B, 'roster_915x412')
        ev(B, 'document.querySelector(".tbs-roster .tb-modal-close").click()'); step(B, 2)
        # reopening starts on People
        ev(B, f'window.__social.openRoster()'); step(B, 1)
        check(ev(B, 'window.__vis(".tbs-ro-list") && !window.__vis(".sc-panel")'), 'B roster reopens on the People tab')
        ev(B, 'document.querySelector(".tbs-roster .tb-modal-close").click()'); step(B, 2)

        # 5. slow network: stitch → 4 s timeout note → late answer fills in
        ev(A, f'{C}.scores._api._setDelay(7500)')
        check(run_game(A, 610), 'A: results card for 610 (slow network)')
        r = results_town(A)
        check(r and r['wait'] and r['stitch'], f'slow: loading stitch shown at once ({r})')
        time.sleep(4.4)
        r = results_town(A)
        check(r and r['off'] and r['note'] and 'snowed in' in r['note'], f'slow: graceful note after 4 s ({r and r["note"]})')
        A.screenshot(path=f'{SHOTS}/scores_results_slow_412x915.png'); print('  shot scores_results_slow_412x915 (no stepping: the late answer lands ~3 s later)', flush=True)
        ok = wait(A, '!!document.querySelector(".mg-results .sc-top li")', 12)
        r = results_town(A)
        check(ok and r['mine'] == 'Your best 610 pts · #2', f'slow: late answer fills the block in ({r})')
        ev(A, f'{C}.scores._api._setDelay(0)')
        check(done(A), 'A: Done')

        # 5b. every phone size: results card (Done reachable, block inside the card) + roster Scores tab inside the screen
        SIZES = [(360, 640), (390, 844), (412, 915), (844, 390), (915, 412)]
        check(run_game(A, 605), 'A: results card for 605 (size sweep)')
        wait(A, '!!document.querySelector(".mg-results .sc-top li")', 8)
        for w, h in SIZES:
            A.set_viewport_size({'width': w, 'height': h}); step(A, 1)
            ev(A, 'document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
            ok = ev(A, '''(() => { const c = document.querySelector(".mg-results"), d = c.querySelector(".knit-btn.green"); c.scrollTop = c.scrollHeight;
              const r = d.getBoundingClientRect(), k = c.getBoundingClientRect(), b = c.querySelector(".sc-town").getBoundingClientRect();
              return r.bottom <= innerHeight && r.top >= 0 && b.left >= k.left && b.right <= k.right && k.bottom <= innerHeight + 1; })()''')
            fit = ev(A, 'document.querySelector(".mg-results").scrollHeight <= document.querySelector(".mg-results").clientHeight + 1')
            check(ok, f'{w}x{h}: results card with town block fits, Done reachable (no scroll needed: {fit})')
        A.set_viewport_size({'width': 412, 'height': 915}); step(A, 1)
        check(done(A), 'A: Done')
        roster_scores(A)
        A.locator('.sc-g-main').first.tap(timeout=10000) if not ev(A, '!!document.querySelector(".sc-g.open")') else None
        for w, h in SIZES:
            A.set_viewport_size({'width': w, 'height': h}); step(A, 1)
            ev(A, 'document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
            ok = ev(A, 'window.__inView(".tbs-roster") && window.__inView(".sc-tabs") && window.__inView(".tbs-roster .tb-modal-close")')
            p = ev(A, '(() => { const p = document.querySelector(".sc-panel").getBoundingClientRect(); const r = document.querySelector(".tbs-roster").getBoundingClientRect(); return p.bottom <= r.bottom + 1 && p.height >= 60; })()')
            sw = ev(A, '(() => { const p = document.querySelector(".sc-panel"); return p.scrollWidth <= p.clientWidth + 1; })()')
            check(ok and p and sw, f'{w}x{h}: roster Scores tab inside the screen, panel inside the sheet (>= 60 px), no sideways scroll')
            if (w, h) in ((360, 640), (844, 390)): shot(A, f'roster_{w}x{h}')
        A.set_viewport_size({'width': 412, 'height': 915}); step(A, 1)
        ev(A, 'document.querySelector(".tbs-roster .tb-modal-close").click()'); step(A, 2)

        # 6. public town: nothing
        ev(A, f'{C}.net.leaveTown()'); wait(A, f'!{C}.net.town', 20, 2); step(A, 4)
        check(run_game(A, 900), 'A (public town): results card for 900')
        time.sleep(0.6)
        check(ev(A, '!document.querySelector(".mg-results .sc-town")'), 'public town: no "Your town" block')
        check(done(A), 'A: Done')
        ev(A, 'window.__social.openRoster()'); step(A, 2)
        check(ev(A, '!window.__vis(".sc-tabs")') and ev(A, 'window.__vis(".tbs-ro-list")'), 'public town: no Scores tab in the roster')
        ev(A, 'document.querySelector(".tbs-roster .tb-modal-close").click()'); step(A, 2)
        n = ev(B, f'{C}.scores.list({{ force: true }}).then(r => r.filter(x => x.game === "cookies").map(x => x.name + ":" + x.best))')
        check(n == ['Bram:640', 'Ava:610'], f'public-town run was not submitted to the friends board ({n})')

        # 7. analytics
        ea = ev(A, 'window.__events.filter(e => e[0] === "town_best" || e[0] === "scores_viewed")')
        eb = ev(B, 'window.__events.filter(e => e[0] === "town_best" || e[0] === "scores_viewed")')
        check(['town_best', {'game': 'cookies'}] in ea and ['town_best', {'game': 'cookies'}] in eb, f'analytics town_best {{game}} on A and B')
        check(['scores_viewed', {'where': 'results'}] in ea and ['scores_viewed', {'where': 'roster'}] in ea, f'analytics scores_viewed results + roster ({len(ea)} events on A)')
        check(not any('Ava' in json.dumps(e) or 'Bram' in json.dumps(e) for e in ea + eb), 'analytics carry no names')
        b.close()
    print(f'\nconsole errors: {len(errs)}')
    for e in errs[:20]: print('  ', e)
    check(not errs, 'no console errors')
    print(f'\n{len(fails)} FAIL(s)' if fails else '\nALL OK')

if __name__ == '__main__':
    main()
