#!/usr/bin/env python3
"""End-to-end check: wave 1 (doors 1–8), wave 2 and (with ?w3) wave 3 (doors 17–24).

  desktop: entry screen → name → Enter → selfTest (plays doors 1–8 headless) → calendar / wardrobe / wave-end
  mini-games: each of the 4 real games starts (?mg=<id>&mgauto), runs a little, quits, and must leave the scene clean
  phone: landscape HUD, tap-to-walk, rotate to portrait (HUD, camera framing, tap mapping) and back

Writes shots/e2e_*.png and prints console errors. Uses the shared Chrome lock.
Wave-3 parts (all use ?w3; shots/e2e3_*.png):
  w3games    carols / cocoa / presents / pack: start via the framework, bot plays to the results card, score/stars asserted,
             then a ✕-quit run (no card, scene clean, no console errors). A game id that is not registered is a SKIP.
  w3cal      calendar on 2026-12-10 (door 24 locked + sleeps), ?eve (Tonight!), ?xmas (Christmas mode), portrait + landscape
  w3finale   ?eve&finale runs to the end card, gift awarded, Keep exploring; replay() + exit() early; HUD/town restored
  w3tasks    ctx.tasks.selfTest({reset:true}) without and with ?w3
  w3tris     renderer triangles: market high view, finale reference view, lantern runway shot (cap 580k)
Usage: python3 tools/playthrough.py [desktop|games|phone|w3games|w3cal|w3finale|w3tasks|w3tris ...]   (default: all)"""
import fcntl, json, sys, time
from playwright.sync_api import sync_playwright

BASE = 'file:///home/claude/tinselby/dist/index.html?capture&net=off&tod=17.5'
PARTS = set(sys.argv[1:]) or {'desktop', 'games', 'phone', 'w3games', 'w3cal', 'w3finale', 'w3tasks', 'w3tris'}
GAMES = ['ornaments', 'cookies', 'snowball', 'sled', 'skate', 'tram', 'giftwrap', 'snowman', 'sled2']
W2_GAMES = {'skate', 'tram', 'giftwrap', 'snowman', 'sled2'}
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
errs, fails, skips = [], [], []
W3 = BASE + '&w3'
CTX = 'window.__tinselby.ctx'
W3_GAMES = [('carols', 17), ('cocoa', 19), ('presents', 21), ('pack', 23)]

def attach(pg, tag):
    pg.on('console', lambda m: errs.append(f'[{tag}] {m.type}: {m.text}') if m.type == 'error' and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append(f'[{tag}] PAGEERROR {e}'))

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)

def shot(pg, name, steps=0):
    t = time.time()
    if steps: pg.evaluate(f'window.__tinselby.step(1/30,{steps})')
    pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    pg.screenshot(path=f'/home/claude/tinselby/shots/e2e_{name}.png')
    print(f'  shot {name} ({round(time.time() - t)} s)', pg.evaluate('JSON.stringify(window.__tinselby.stats())'), flush=True)

def shot3(pg, name, steps=0):
    if steps: pg.evaluate(f'window.__tinselby.step(1/30,{steps})')
    pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    pg.screenshot(path=f'/home/claude/tinselby/shots/e2e3_{name}.png')
    print(f'  shot e2e3_{name}', flush=True)

def skip(msg):
    print('SKIP ' + msg, flush=True); skips.append(msg)

def errs_for(tag): return [e for e in errs if e.startswith(f'[{tag}]')]

def wait_ms(pg, ms): pg.evaluate(f'new Promise(r => setTimeout(r, {ms}))')

def ready(pg, url):
    pg.goto(url); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)

ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)

    if 'desktop' in PARTS:
        pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(300000); attach(pg, 'desktop')
        ready(pg, BASE + '&reset')
        shot(pg, 'entry', 20)
        pg.fill('input', 'Jitendra')
        pg.get_by_text('Next: choose your look').first.click()
        pg.evaluate('new Promise(r => setTimeout(r, 600))')
        shot(pg, 'tray', 6)
        pg.get_by_text('Enter Tinselby').first.click()
        pg.evaluate('new Promise(r => setTimeout(r, 300))')
        S = 'window.__tinselby.ctx.game.state'
        check(pg.evaluate(f'{S}.phase') == 'play', 'Enter → play phase')
        check(pg.evaluate(f'{S}.playerName') == 'Jitendra', 'player name kept')
        shot(pg, 'start', 50)
        r = json.loads(pg.evaluate('(async () => JSON.stringify(await window.__tinselby.ctx.tasks.selfTest({ reset: true })))()'))
        nf = len(r.get('fails', [])) if isinstance(r, dict) else -1
        check(nf == 0, f'selfTest: {len(r.get("log", []))} passed, {nf} failed')
        for f in (r.get('fails') or [])[:10]: print('   ', f)
        P = 'window.__tinselby.ctx.progress'
        check(pg.evaluate(f'[1,2,3,4,5,6,7,8].every(n => {P}.state(n) === "done")'), 'doors 1–8 done after selfTest')
        check(pg.evaluate(f'{P}.state(24)') != 'done', 'door 24 still closed (finale is wave 3)')
        shot(pg, 'after8', 40)
        # calendar board + wardrobe through the UI, if exposed
        C = 'window.__tinselby.ctx.calendar'
        if pg.evaluate(f'!!({C}?.open || {C}?.toggle)'):
            pg.evaluate(f'({C}.open || {C}.toggle)()'); shot(pg, 'calendar', 30)
            pg.evaluate(f'({C}.close || {C}.toggle)()'); pg.evaluate('window.__tinselby.step(1/30,10)')
        if pg.evaluate('!!window.__tinselby.ctx.ui?.openWardrobe'):
            pg.evaluate('window.__tinselby.ctx.ui.openWardrobe()'); shot(pg, 'wardrobe', 10)
            pg.evaluate('window.__tinselby.ctx.ui.closeWardrobe?.()')
        # reload: progress must persist
        ready(pg, BASE + '&play')
        check(pg.evaluate(f'{P}.state(8)') == 'done', 'progress survives reload')
        pg.close()

    if 'games' in PARTS:
        for gid in GAMES:
            pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(300000); attach(pg, gid)
            ready(pg, BASE + f'&play&doors={16 if gid in W2_GAMES else 8}&mg={gid}&mgauto' + ('&w2' if gid in W2_GAMES else ''))
            base_children = pg.evaluate('window.__tinselby.ctx.engine.scene.children.length')
            pg.wait_for_function('window.__tinselby.ctx.minigames.active', timeout=60000)
            pg.wait_for_function(f'window.__tinselby.ctx.game.state.phase === "minigame"', timeout=60000)
            pg.evaluate('new Promise(r => setTimeout(r, 400))')  # intro auto-start + 3-2-1 timers
            pg.evaluate('window.__tinselby.step(1/30, 30)')
            pg.evaluate('new Promise(r => setTimeout(r, 3500))')
            shot(pg, f'mg_{gid}', 30)
            pg.evaluate('window.__tinselby.ctx.minigames.quit()')
            pg.evaluate('new Promise(r => setTimeout(r, 2200))')  # results card auto-closes in capture mode
            pg.evaluate('window.__tinselby.step(1/30, 20)')
            after = pg.evaluate('window.__tinselby.ctx.engine.scene.children.length')
            ph = pg.evaluate('window.__tinselby.ctx.game.state.phase')
            check(ph == 'play', f'{gid}: back to play after quit (phase {ph})')
            check(after <= base_children, f'{gid}: scene clean after quit ({base_children} → {after})')
            check(pg.evaluate('!window.__tinselby.ctx.minigames.active'), f'{gid}: no active game after quit')
            pg.close()

    if 'phone' in PARTS:
        c = b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=2)
        mp = c.new_page(); mp.set_default_timeout(300000); attach(mp, 'phone')
        ready(mp, BASE + '&play&doors=3')
        shot(mp, 'phone_hud', 40)
        mp.touchscreen.tap(422, 150); shot(mp, 'phone_tapwalk', 20)
        # portrait is a first-class layout: rotate mid-play, the HUD stays up, no rotate overlay, the camera re-frames
        CAMQ = """(() => { const c = window.__tinselby.ctx, v = c.player.pos.clone(); v.y += 0.3; v.project(c.engine.camera);
          const vis = (s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; };
          return JSON.stringify({ p: c.cam.portrait, fov: c.engine.camera.fov, sx: (v.x + 1) / 2, sy: (1 - v.y) / 2,
            hud: vis('.tb-hud') && vis('.tb-tr') && vis('.tb-door'), joy: vis('.tb-joy'), overlay: !!document.querySelector('.tb-portrait-card'),
            body: document.body.className, tris: window.__tinselby.stats().tris }); })()"""
        mp.set_viewport_size({'width': 390, 'height': 844}); mp.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)))')  # let the resize event land before stepping
        shot(mp, 'phone_portrait', 40)
        q = json.loads(mp.evaluate(CAMQ)); print('  portrait camera', q)
        check(q['hud'] and q['joy'], 'portrait: HUD + joystick visible')
        check(not q['overlay'], 'portrait: no rotate overlay')
        check('tb-portrait' in q['body'], 'portrait: body.tb-portrait set')
        check(q['p'] > 0.9 and q['fov'] > 40, f'portrait: camera re-framed (portrait {q["p"]:.2f}, fov {q["fov"]:.1f})')
        check(0.25 < q['sx'] < 0.75 and 0.45 < q['sy'] < 0.72, f'portrait: player on screen, a bit below centre ({q["sx"]:.2f}, {q["sy"]:.2f})')
        check(q['tris'] < 560000, f'portrait: triangles {q["tris"]}')
        mp.touchscreen.tap(195, 330); mp.evaluate('window.__tinselby.step(1/30,2)')
        tt = mp.evaluate('(() => { const t = window.__tinselby.ctx.input.tapTarget, p = window.__tinselby.ctx.player.pos; return t ? t.z - p.z : null; })()')
        check(tt is not None and tt < 0, 'portrait: tap above the player walks forward (north)')
        mp.set_viewport_size({'width': 844, 'height': 390}); mp.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)))')  # let the resize event land before stepping
        mp.evaluate('window.__tinselby.step(1/30,60)')  # the director blends back over ~1.5 s
        q = json.loads(mp.evaluate(CAMQ))
        check(q['p'] < 0.03 and abs(q['fov'] - 32) < 1.0 and 'tb-landscape' in q['body'], f'back to landscape: camera + layout restored (portrait {q["p"]:.3f}, fov {q["fov"]:.1f})')
        c.close()
    # ------------------------------------------------------------------ wave 3
    if 'w3games' in PARTS:
        for gid, door in W3_GAMES:
            tag = 'w3_' + gid
            pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(300000); attach(pg, tag)
            ready(pg, W3 + f'&play&doors={door - 1}&mgauto')
            if not pg.evaluate(f'!!{CTX}.minigames.get("{gid}")'):
                skip(f'{gid}: not registered as a mini-game yet'); pg.close(); continue
            check(pg.evaluate(f'{CTX}.progress.state({door}) !== "locked"'), f'{gid}: door {door} is playable with ?w3&doors={door - 1}')
            base_children = pg.evaluate(f'{CTX}.engine.scene.children.length')
            # --- full run: the bot plays to the results card
            pg.evaluate(f'window.__res = null; {CTX}.minigames.play("{gid}").then(r => {{ window.__res = r; }}, e => {{ window.__res = {{ error: String(e) }}; }}); 1')
            pg.wait_for_function(f'{CTX}.game.state.phase === "minigame"', timeout=60000)
            wait_ms(pg, 500)
            pg.evaluate(f'window.__{gid} && window.__{gid}.bot && window.__{gid}.bot("good"); 1')
            pg.evaluate('window.__tinselby.step(1/30, 30)'); wait_ms(pg, 3600)  # intro + 3-2-1 timers run on real time
            shot3(pg, f'mg_{gid}', 30)
            got = False
            for i in range(80):  # up to ~800 simulated seconds
                if pg.evaluate('!!document.querySelector(".mg-results") || window.__res !== null'): got = True; break
                if pg.evaluate(f'!!(window.__{gid} && window.__{gid}.ff)'): pg.evaluate(f'window.__{gid}.ff(10)')
                else: pg.evaluate('window.__tinselby.step(1/30, 150)')
                pg.evaluate('window.__tinselby.step(1/30, 3)'); wait_ms(pg, 60)
            check(got, f'{gid}: bot reaches the results card')
            if got:
                pg.evaluate('window.__tinselby.step(1/30, 6)'); shot3(pg, f'mg_{gid}_results')
                try: pg.wait_for_function('window.__res !== null', timeout=15000)
                except Exception: pass
                r = pg.evaluate('window.__res')
                ok = isinstance(r, dict) and isinstance(r.get('score'), (int, float)) and isinstance(r.get('stars'), (int, float)) and 0 <= r['stars'] <= 3
                check(ok, f'{gid}: result has score + stars ({r})')
                check(bool(r) and not r.get('quit') and r.get('stars', 0) >= 1, f'{gid}: bot run completed with >= 1 star')
                pg.evaluate('window.__tinselby.step(1/30, 20)')
                check(pg.evaluate(f'{CTX}.game.state.phase') == 'play', f'{gid}: back to play after the results card')
                check(not pg.evaluate('document.querySelector(".mg-results")'), f'{gid}: no results card left after Done')
            # --- ✕ quit: straight out, no card
            pg.evaluate(f'window.__res = null; {CTX}.minigames.play("{gid}").then(r => {{ window.__res = r; }}); 1')
            pg.wait_for_function(f'{CTX}.game.state.phase === "minigame"', timeout=60000)
            wait_ms(pg, 500); pg.evaluate('window.__tinselby.step(1/30, 30)'); wait_ms(pg, 3600)
            pg.evaluate('window.__tinselby.step(1/30, 20)')
            pg.click('.mg-quit'); wait_ms(pg, 600); pg.evaluate('window.__tinselby.step(1/30, 30)')
            check(not pg.evaluate('document.querySelector(".mg-results")'), f'{gid}: ✕ leaves no results card')
            check(pg.evaluate(f'{CTX}.game.state.phase') == 'play', f'{gid}: ✕ returns to play')
            check(pg.evaluate(f'!{CTX}.minigames.active'), f'{gid}: no active game after ✕')
            check(bool(pg.evaluate('window.__res && window.__res.quit')), f'{gid}: ✕ resolves with quit:true')
            after = pg.evaluate(f'{CTX}.engine.scene.children.length')
            check(after <= base_children, f'{gid}: scene clean after full run + ✕ ({base_children} → {after})')
            check(pg.evaluate(f'typeof window.__{gid} === "undefined"'), f'{gid}: test hook window.__{gid} released')
            check(not errs_for(tag), f'{gid}: no console errors ({len(errs_for(tag))})')
            pg.close()

    if 'w3cal' in PARTS:
        CASES = [('d1210', 'date=2026-12-10&doors=23'), ('eve', 'eve&doors=23'), ('xmas', 'xmas&doors=23')]
        pg = b.new_page(viewport={'width': 390, 'height': 844}); pg.set_default_timeout(300000)
        for label, q in CASES:
            tag = 'w3cal_' + label; attach(pg, tag)
            ready(pg, W3 + f'&play&reset&{q}')
            pg.evaluate(f'{CTX}.progress.state(1)')
            info = pg.evaluate(f'JSON.stringify({CTX}.progress.eve)'); print(f'  [{label}] progress.eve = {info}')
            pg.evaluate(f'{CTX}.calendar.open()'); pg.evaluate('window.__tinselby.step(1/30, 20)'); wait_ms(pg, 400)
            T = '(() => { const t = document.querySelector(\'.cal-door[data-n="24"]\'); return t ? JSON.stringify({ cls: t.className, txt: t.textContent.replace(/\\s+/g, " ") }) : null; })()'
            for vp, nm in (((390, 844), 'p'), ((844, 390), 'l')):
                pg.set_viewport_size({'width': vp[0], 'height': vp[1]}); pg.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 80)))')
                pg.evaluate('window.__tinselby.step(1/30, 12)')
                pg.evaluate('document.querySelector(\'.cal-door[data-n="24"]\')?.scrollIntoView({ block: "center" })')
                shot3(pg, f'cal_{label}_{nm}', 6)
            t = json.loads(pg.evaluate(T) or 'null'); print(f'  [{label}] door 24 tile: {t}')
            check(t is not None, f'{label}: calendar shows door 24')
            if label == 'd1210':
                check(bool(t) and 's-locked' in t['cls'], f'{label}: door 24 locked')
                check(bool(t) and '14 sleeps' in t['txt'], f'{label}: door 24 shows "14 sleeps" countdown')
            elif label == 'eve':
                check(bool(t) and 's-open' in t['cls'], f'{label}: door 24 open')
                check(bool(t) and 'tonight!' in t['txt'].lower(), f'{label}: door 24 says "Tonight!"')
            else:
                x = json.loads(pg.evaluate('JSON.stringify({ x: !!document.querySelector(\'[class*="cal"].xmas\'), h: document.querySelector(".cal-title h2")?.textContent })'))
                check(x['x'] and 'Christmas' in (x['h'] or ''), f'{label}: calendar in Christmas mode ({x["h"]})')
            check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'{label}: no horizontal overflow (landscape)')
            pg.evaluate(f'{CTX}.calendar.close()')
            pg.set_viewport_size({'width': 390, 'height': 844})
        check(not [e for e in errs if e.startswith('[w3cal_')], 'w3cal: no console errors')
        pg.close()

    if 'w3finale' in PARTS:
        tag = 'w3finale'
        pg = b.new_page(viewport={'width': 844, 'height': 390}); pg.set_default_timeout(300000); attach(pg, tag)
        ready(pg, W3 + '&play&reset&doors=23&eve&finale')
        F = f'{CTX}.finale'; P = f'{CTX}.progress'
        HUD = '(() => { const vis = (s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }; return vis(".tb-hud") && vis(".tb-tr"); })()'
        check(pg.evaluate(f'{P}.state(24)') == 'open', 'finale: door 24 open on Eve')
        check(pg.evaluate(f'{P}.finaleGift()') is None, 'finale: no gift before the finale')
        tris, t0 = {}, time.time()
        for i in range(60):  # wait for the 2 s auto-start
            pg.evaluate('window.__tinselby.step(1/30, 15)')
            if pg.evaluate('window.__eve.state.running'): break
        check(pg.evaluate('window.__eve.state.running'), 'finale: timeline started (?eve&finale)')
        check(pg.evaluate(f'{CTX}.game.state.phase') == 'finale', 'finale: phase is finale')
        # sample reference views while it plays: ~60 steps after start (reference view), runway during the approach (9–21 s)
        pg.evaluate('window.__tinselby.step(1/30, 60)'); tris['ref'] = pg.evaluate('window.__tinselby.stats().tris'); shot3(pg, 'finale_ref')
        end = False; runway = 0; shots_at = [(12, 'runway'), (36, 'santa'), (44, 'count'), (58, 'lift')]; skipto = [(14, 33.0), (38.5, 56.0)]
        for i in range(120):
            pg.evaluate('window.__tinselby.step(1/30, 30)')
            st = json.loads(pg.evaluate('JSON.stringify(window.__eve.state)'))
            ft = pg.evaluate(f'{F}.time')
            if 9 < ft < 21: runway = max(runway, pg.evaluate('window.__tinselby.stats().tris'))
            # swiftshader runs ~1 s per step, so the quiet stretches are skipped with the timeline's own jumpTo (cues still fire silently);
            # the gift cue (35.2), the countdown end and the end card are stepped for real
            for k, to in list(skipto):
                if ft >= k: pg.evaluate(f'window.__eve.jumpTo({to})'); skipto.remove((k, to)); print(f'  jumpTo({to}) from {ft:.1f}')
            for k, nm in list(shots_at):
                if ft >= k: shot3(pg, f'finale_{nm}'); shots_at.remove((k, nm))
            if pg.evaluate('[...document.querySelectorAll("button")].some(b => /Keep exploring/.test(b.textContent))'): end = True; break
        tris['runway'] = runway
        print(f'  finale run took {round(time.time() - t0)} s wall; timeline {pg.evaluate(f"{F}.time"):.1f}')
        check(end, 'finale: ran to the end card (Keep exploring / Watch again)')
        shot3(pg, 'finale_endcard', 10)
        g = pg.evaluate(f'JSON.stringify({P}.finaleGift())'); print('  finaleGift', g)
        check(g not in (None, 'null'), 'finale: gift awarded (progress.finaleGift())')
        check(pg.evaluate(f'{P}.state(24)') == 'done', 'finale: door 24 done')
        check(pg.evaluate(f'{P}.eveWatched') >= 1, 'finale: Eve marked watched')
        pg.evaluate('[...document.querySelectorAll("button")].find(b => /Keep exploring/.test(b.textContent)).click()')
        wait_ms(pg, 1200); pg.evaluate('window.__tinselby.step(1/30, 60)')
        check(pg.evaluate(f'{CTX}.game.state.phase') == 'play' and not pg.evaluate(f'{F}.running'), 'finale: Keep exploring → free play')
        check(pg.evaluate(HUD), 'finale: HUD visible after Keep exploring')
        shot3(pg, 'finale_keep', 10)
        # replay, then leave early
        check(pg.evaluate(f'{F}.replay()'), 'finale: replay() starts')
        pg.evaluate('window.__tinselby.step(1/30, 90)')
        check(pg.evaluate(f'{F}.running') and pg.evaluate(f'{CTX}.game.state.phase') == 'finale', 'finale: replay is running')
        check(not pg.evaluate(HUD), 'finale: HUD hidden during replay')
        shot3(pg, 'finale_replay')
        pg.evaluate(f'{F}.exit()'); wait_ms(pg, 800); pg.evaluate('window.__tinselby.step(1/30, 90)')
        check(pg.evaluate(f'{CTX}.game.state.phase') == 'play' and not pg.evaluate(f'{F}.running'), 'finale: early exit → back in town (phase play)')
        check(pg.evaluate(HUD), 'finale: HUD restored after early exit')
        pos = pg.evaluate(f'(() => {{ const p = {CTX}.player.pos; return [p.x, p.z]; }})()'); print('  player after exit', pos)
        check(pg.evaluate(f'{CTX}.player.object.visible !== false'), 'finale: player visible again')
        check(pg.evaluate(f'{P}.finaleGift()') is not None, 'finale: gift still owned after replay')
        shot3(pg, 'finale_after_exit', 20)
        check(not errs_for(tag), f'finale: no console errors ({len(errs_for(tag))})')
        pg.close()
        FIN_TRIS = tris
    else:
        FIN_TRIS = {}

    if 'w3tasks' in PARTS:
        for label, base in (('?w2 (wave 3 off)', BASE + '&w2'), ('?w3', W3)):
            tag = 'w3tasks ' + label
            pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(600000); attach(pg, tag)
            ready(pg, base + '&play&reset')
            r = json.loads(pg.evaluate(f'(async () => JSON.stringify(await {CTX}.tasks.selfTest({{ reset: true }})))()'))
            nf = len(r.get('fails', [])) if isinstance(r, dict) else -1; npass = len(r.get('log', []))
            print(f'  selfTest {label}: {npass} passed, {nf} failed', flush=True)
            for f in (r.get('fails') or [])[:15]: print('   ', f)
            if label.startswith('?w2'): check(nf == 0 and npass == 197, f'selfTest {label}: {npass} pass / {nf} fail (expect 197 / 0)')
            else: check(nf == 0, f'selfTest {label}: {npass} pass / {nf} fail')
            check(not errs_for(tag), f'selfTest {label}: no console errors ({len(errs_for(tag))})')
            pg.close()

    if 'w3tris' in PARTS:
        CAP = 580000
        pg = b.new_page(viewport={'width': 844, 'height': 390}); pg.set_default_timeout(300000); attach(pg, 'w3tris')
        ready(pg, W3 + '&play&doors=23&view=high&tod=17.5')
        pg.evaluate('window.__tinselby.step(1/30, 60)')
        mh = pg.evaluate('window.__tinselby.stats().tris'); view = pg.evaluate(f'{CTX}.cam.view')
        print(f'  TRIS market high view ({view}): {mh}', flush=True); shot3(pg, 'tris_market_high')
        check(mh < CAP, f'triangles: market high view {mh} < {CAP}')
        pg.close()
        if not FIN_TRIS:  # no w3finale run in this invocation: measure the two finale views on a short run (jumpTo to the runway)
            pg = b.new_page(viewport={'width': 844, 'height': 390}); pg.set_default_timeout(300000); attach(pg, 'w3tris_fin')
            ready(pg, W3 + '&play&reset&doors=23&eve&finale&tod=17.5')
            for i in range(60):
                pg.evaluate('window.__tinselby.step(1/30, 15)')
                if pg.evaluate('window.__eve.state.running'): break
            pg.evaluate('window.__tinselby.step(1/30, 60)'); ref = pg.evaluate('window.__tinselby.stats().tris'); shot3(pg, 'tris_finale_ref')
            rw = 0
            for jt in (12, 15, 18, 20.5):  # the approach over the lantern runway spans 9-21 s; keep the worst frame
                pg.evaluate(f'window.__eve.jumpTo({jt})')
                for i in range(3):
                    pg.evaluate('window.__tinselby.step(1/30, 12)'); rw = max(rw, pg.evaluate('window.__tinselby.stats().tris'))
                shot3(pg, f'tris_runway_{int(jt)}')
            pg.close(); FIN_TRIS = {'ref': ref, 'runway': rw}
        if FIN_TRIS:
            print(f'  TRIS finale reference view (60 steps after start): {FIN_TRIS["ref"]}; lantern runway shot (max 9–21 s): {FIN_TRIS["runway"]}')
            check(FIN_TRIS['ref'] < CAP, f'triangles: finale reference view {FIN_TRIS["ref"]} < {CAP}')
            check(FIN_TRIS['runway'] < CAP, f'triangles: lantern runway {FIN_TRIS["runway"]} < {CAP}')
        else: skip('triangles: finale reference / runway need the w3finale part')

    b.close()

print('\nSKIPS:', len(skips)); print('\n'.join(skips))
print('\nFAILS:', len(fails)); print('\n'.join(fails))
print('CONSOLE ERRORS:', len(errs)); print('\n'.join(errs[:30]))
