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
  ux         phone UX (touch, 390x844 / 844x390 / 360x780): calendar tap+swipe, HUD overlaps, goal card + ? help, guide arrow,
             mini-map + full map + Show the way, roster, activities (skips if absent), 0 console errors; shots/rqa_*.png
  p1         phase 1/2 on a phone (touch, 390x844 + 844x390 layout): Christmas card maker from the Friends card (every scene /
             greeting / frame by tap, stubbed Web Share → one 1080x1350 JPEG + greeting + card link, no-share fallback, ✕),
             invite welcome (?from=Ava&card=… entry card → taps/typing → play, URL cleaned, toast; junk name injects nothing),
             install card (Android UA + faked beforeinstallprompt, door 1 → card, Not now), streak chip (?streak=5, skips if
             ctx.streaks missing) clear of the HUD, 0 console errors; shots/p1_*.png
Usage: python3 tools/playthrough.py [desktop|games|phone|w3games|w3cal|w3finale|w3tasks|w3tris|ux|p1 ...]   (default: all)"""
import fcntl, json, os, sys, time
from playwright.sync_api import sync_playwright

DIST = os.environ.get('PT_DIST', '/home/claude/tinselby/dist')  # point at another build (npx vite build --outDir ...)
BASE = f'file://{DIST}/index.html?capture&net=off&tod=17.5'
PARTS = set(sys.argv[1:]) or {'desktop', 'games', 'phone', 'w3games', 'w3cal', 'w3finale', 'w3tasks', 'w3tris', 'ux', 'p1'}
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
        check(pg.evaluate(f'Array.from({{length: 23}}, (_, i) => i + 1).every(n => {P}.state(n) === "done")'), 'doors 1–23 done after selfTest (wave 3 live)')
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

    # ------------------------------------------------------------------ phone touch helpers (ux, p1)
    RECT = """(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05 || e.closest('[hidden]')) ? null : { x: r.left, y: r.top, w: r.width, h: r.height }; }"""
    HUDJS = """(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && !e.closest('[hidden]'); };
      const out = []; const add = (n, e) => { if (!e || !vis(e)) return; const r = e.getBoundingClientRect(); out.push({ n, x: r.left, y: r.top, w: r.width, h: r.height }); };
      add('goal', document.querySelector('.tb-goal'));
      document.querySelectorAll('.tb-stats .tb-chip').forEach((e, i) => add('chip' + i, e));
      document.querySelectorAll('.tb-tr > *').forEach((e, i) => add('btn' + i, e));
      add('act', document.querySelector('.tb-act')); add('joy', document.querySelector('.tb-joy'));
      add('minimap', document.querySelector('.tbm-mini:not([hidden])')); add('social', document.querySelector('.tbs-corner'));
      return JSON.stringify(out); })()"""
    def overl(a, b): return a['x'] < b['x'] + b['w'] - .5 and b['x'] < a['x'] + a['w'] - .5 and a['y'] < b['y'] + b['h'] - .5 and b['y'] < a['y'] + a['h'] - .5
    def inside(r, w, h): return r['x'] >= -.5 and r['y'] >= -.5 and r['x'] + r['w'] <= w + .5 and r['y'] + r['h'] <= h + .5
    def rect(pg, sel): return pg.evaluate(f'({RECT})({json.dumps(sel)})')
    def cstep(pg, n=8):
        pg.evaluate(f'window.__tinselby.step(1/30,{n})'); pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    def tap_el(pg, sel, label):  # a real touch tap at the element's centre (hit-tested: the element or a child must be under the finger)
        r = rect(pg, sel)
        if not r: return False
        x, y = r['x'] + r['w'] / 2, r['y'] + r['h'] / 2
        top = pg.evaluate(f'(() => {{ const t = document.elementFromPoint({x}, {y}); return !!t && !!t.closest({json.dumps(sel)}); }})()')
        if not top: print(f'  (tap {label}: something else is on top of {sel} at {x:.0f},{y:.0f})'); return False
        pg.touchscreen.tap(x, y); wait_ms(pg, 150); cstep(pg, 4); return True
    def swipe(pg, cdp, x, y0, y1, steps=8):  # real touch drag through CDP
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y0, 'id': 1}]})
        for i in range(1, steps + 1):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y0 + (y1 - y0) * i / steps, 'id': 1}]}); wait_ms(pg, 25)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); wait_ms(pg, 250)
    def new_phone(w, h, tag, init=None, **kw):  # kw: extra context options (user_agent, ...); init: an init script
        c = b.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True, device_scale_factor=1, **kw)
        if init: c.add_init_script(init)
        pg = c.new_page(); pg.set_default_timeout(120000); attach(pg, tag); return c, pg

    # ------------------------------------------------------------------ phone UX (touch)
    if 'ux' in PARTS:
        UXURL = f'file://{DIST}/index.html?capture&net=off&tod=17.5&play&reset&reveal=all&doors='
        SH = '/home/claude/tinselby/shots/rqa_'
        def uxload(pg, doors, w, h):
            pg.set_viewport_size({'width': w, 'height': h})
            pg.goto(UXURL + str(doors), wait_until='commit'); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
            cstep(pg, 30)

        # ---- 1. calendar: tap open, detail strip + main button inside the viewport; touch-swipe scrolls on 360x640
        for (w, h) in ((390, 844), (844, 390), (360, 640)):
            tag = f'ux_cal_{w}x{h}'; c, pg = new_phone(w, h, tag); uxload(pg, 7, w, h); print(f'[ux] calendar {w}x{h}', flush=True)
            check(tap_el(pg, '.tb-cal', 'calendar button'), f'calendar {w}x{h}: HUD calendar button tapped')
            opened = pg.evaluate('!!document.querySelector(".cal-wrap") && getComputedStyle(document.querySelector(".cal-wrap")).display !== "none"')
            check(opened, f'calendar {w}x{h}: opens on a real tap')
            cstep(pg, 10); wait_ms(pg, 400)
            det, go = rect(pg, '.cal-detail'), rect(pg, '.cal-go')
            if not (det and go):  # select a door whose detail shows a button
                pg.evaluate('document.querySelector(\'.cal-door[data-n="8"]\')?.click()'); cstep(pg, 4); det, go = rect(pg, '.cal-detail'), rect(pg, '.cal-go')
            check(bool(det) and inside(det, w, h), f'calendar {w}x{h}: detail strip inside the viewport ({det})')
            check(bool(go) and inside(go, w, h), f'calendar {w}x{h}: main button inside the viewport ({go})')
            if (w, h) == (360, 640):
                g = pg.evaluate('(() => { const g = document.querySelector(".cal-grid"); return { sh: g.scrollHeight, ch: g.clientHeight, st: g.scrollTop }; })()')
                print('  grid', g)
                check(g['sh'] > g['ch'] + 4, f'calendar {w}x{h}: grid overflows (forced) {g}')
                gr = rect(pg, '.cal-grid'); cdp = c.new_cdp_session(pg)
                swipe(pg, cdp, gr['x'] + gr['w'] / 2, gr['y'] + gr['h'] * 0.8, gr['y'] + gr['h'] * 0.1)
                st = pg.evaluate('document.querySelector(".cal-grid").scrollTop')
                check(st > 20, f'calendar {w}x{h}: touch swipe scrolls the grid (scrollTop {st})')
                pg.evaluate('document.querySelector(".cal-grid").scrollTo(0, 1e5)'); pg.evaluate('new Promise(r => setTimeout(r, 200))')
                t24 = rect(pg, '.cal-door[data-n="24"]'); gr = rect(pg, '.cal-grid')
                check(bool(t24) and bool(gr) and t24['y'] >= gr['y'] - 1 and t24['y'] + t24['h'] <= gr['y'] + gr['h'] + 1, f'calendar {w}x{h}: door 24 tile visible after scrolling ({t24})')
                pg.screenshot(path=SH + 'cal_360x640.png')
            else: pg.screenshot(path=SH + f'cal_{w}x{h}.png')
            tap_el(pg, '.cal-close', 'close'); cstep(pg, 6)
            check(not rect(pg, '.cal-wrap'), f'calendar {w}x{h}: closes')
            check(not errs_for(tag), f'calendar {w}x{h}: no console errors ({errs_for(tag)[:2]})')
            c.close()

        # ---- 2-6 on the main phone page (390x844 portrait, then landscape)
        tag = 'ux_main'; c, pg = new_phone(390, 844, tag); uxload(pg, 7, 390, 844); print('[ux] main page loaded', flush=True)
        G = f'{CTX}.guide'
        # 2. HUD layout at the three sizes
        for (w, h) in ((390, 844), (844, 390), (360, 780)):
            pg.set_viewport_size({'width': w, 'height': h}); pg.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 80)))'); cstep(pg, 12)
            pg.evaluate("document.querySelectorAll('.tbs-corner [hidden]').forEach(e => { e.hidden = false; }); document.querySelectorAll('.tb-online').forEach(o => { o.hidden = false; })")
            cstep(pg, 2)
            R = json.loads(pg.evaluate(HUDJS)); bad = []
            for i in range(len(R)):
                for j in range(i + 1, len(R)):
                    if overl(R[i], R[j]): bad.append(R[i]['n'] + 'x' + R[j]['n'])
            bad += [r['n'] + ' offscreen' for r in R if not inside(r, w, h)]
            names = {r['n'] for r in R}
            check(not bad and {'goal', 'joy'} <= names, f'HUD {w}x{h}: no overlaps / all inside viewport ({sorted(names)}) {bad}')
            pg.screenshot(path=SH + f'hud_{w}x{h}.png')
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 80)))'); cstep(pg, 12)
        pg.evaluate("document.querySelectorAll('.tb-online').forEach(o => { o.hidden = true; })")
        # 3. goal card
        gt = pg.evaluate('document.querySelector(".tb-goal")?.innerText.replace(/\\s+/g, " ") || ""'); print('  goal:', gt)
        check('Door 8 · Cookie Bakery' in gt, f'goal card: "Door 8 · Cookie Bakery" ({gt!r})')
        import re
        check(re.search(r' · \d+ ?m\b', gt) is not None, f'goal card: distance " · N m" ({gt!r})')
        if pg.evaluate(f'!!{CTX}.tips'):
            check(tap_el(pg, '.tb-goal-help', '?'), 'goal card: "?" tapped')
            wait_ms(pg, 300); cstep(pg, 4)
            op = rect(pg, '.tbt-help'); check(bool(op), 'goal card: "?" opens the help card'); pg.screenshot(path=SH + 'help.png')
            if op:
                check(inside(op, 390, 844), f'help card inside the viewport ({op})')
                tap_el(pg, '.tbt-hok', 'help OK'); wait_ms(pg, 300); cstep(pg, 4)
                check(not rect(pg, '.tbt-help'), 'goal card: help card closes (OK)')
        else: skip('help card: ctx.tips missing')
        # 4. guide: target = door 8 / Baker Bea, edge arrow far away, hidden next to her
        pg.evaluate('window.__tinselby.step(1/30,10)')
        t = pg.evaluate(f'JSON.stringify({G}?.target || null)'); print('  target', t); t = json.loads(t)
        check(bool(t) and t.get('kind') == 'person' and 'Bea' in (t.get('label') or ''), f'guide: target is Baker Bea, kind person ({t and (t["label"], t["kind"])})')
        if t:
            far = (t['x'] + 45, t['z'] + 5)
            pg.evaluate(f'{CTX}.player.teleport({far[0]}, {far[1]})'); cstep(pg, 25)
            edge = rect(pg, '.tbg-badge'); check(bool(edge), f'guide: edge arrow visible when far away ({edge})'); pg.screenshot(path=SH + 'guide_far.png')
            if edge: check(inside(edge, 390, 844), f'guide: edge arrow inside the viewport ({edge})')
            pg.evaluate(f'{CTX}.player.teleport({t["x"]}, {t["z"] + 1.6})'); cstep(pg, 25)
            check(not rect(pg, '.tbg-badge'), 'guide: edge arrow hidden when standing next to her'); pg.screenshot(path=SH + 'guide_near.png')
        # 5. mini-map + full map
        mm = rect(pg, '.tbm-mini'); check(bool(mm) and mm['x'] < 40 and mm['y'] < 140, f'mini-map visible top-left ({mm})')
        if mm:
            tap_el(pg, '.tbm-mini', 'mini-map'); wait_ms(pg, 300); cstep(pg, 4)
            check(pg.evaluate(f'!!{CTX}.map.isOpen') and bool(rect(pg, '.tbm-card')), 'mini-map: a real tap opens the full map')
            pg.screenshot(path=SH + 'map_full.png')
            pid = pg.evaluate(f'(() => {{ const p = {CTX}.map.places.find(p => p.kind !== "door" && /Ferris|Market|Cocoa|Bakery/i.test(p.name)) || {CTX}.map.places[0]; return p.id; }})()')
            pl = pg.evaluate(f'(() => {{ const p = {CTX}.map.places.find(p => p.id === {json.dumps(pid)}); return [p.name, p.gx, p.gz]; }})()'); print('  place', pid, pl)
            # tap the place on the canvas: map pixel from the place's own grid coordinates via the map's select() when canvas mapping is private
            ok = False
            cv = rect(pg, '.tbm-canvas')
            sel = pg.evaluate(f'(() => {{ try {{ return {CTX}.map.select({json.dumps(pid)}); }} catch (e) {{ return String(e); }} }})()')
            cstep(pg, 3)
            info_open = bool(rect(pg, '.tbm-info'))
            check(info_open, f'map: selecting a place shows the info + Show the way ({pl[0]})')
            if info_open:
                tap_el(pg, '.tbm-go', 'Show the way'); wait_ms(pg, 300); cstep(pg, 6)
                tg = pg.evaluate(f'JSON.stringify({G}.target)'); print('  target after way', tg); tg = json.loads(tg)
                check(bool(tg) and (pl[0].lower() in (tg.get('label') or '').lower() or str(pid) in (tg.get('id') or '') or abs(tg['x'] - pl[1]) < 12 and abs(tg['z'] - pl[2]) < 12),
                      f'map: Show the way sets ctx.guide.target to the place ({tg and tg.get("label")}, id {tg and tg.get("id")})')
            pg.screenshot(path=SH + 'map_way.png')
            if pg.evaluate(f'!!{CTX}.map.isOpen'):
                tap_el(pg, '.tbm-x', 'map close'); wait_ms(pg, 300); cstep(pg, 4)
            check(not pg.evaluate(f'!!{CTX}.map.isOpen') and not rect(pg, '.tbm-card'), 'map: close (x) closes it')
        # 6. roster
        pg.evaluate('window.__tinselby.step(1/30,6)')
        if rect(pg, '.tb-online'):
            tap_el(pg, '.tb-online', 'online chip'); wait_ms(pg, 300); cstep(pg, 4)
            check(bool(rect(pg, '.tbs-roster')), 'roster: online chip opens the sheet'); pg.screenshot(path=SH + 'roster.png')
            pg.keyboard.press('Escape'); cstep(pg, 4)
            if rect(pg, '.tbs-roster'):
                pg.evaluate('document.querySelector(".tbs-roster-layer")?.click()'); cstep(pg, 4)
            check(not rect(pg, '.tbs-roster'), 'roster: sheet closes')
        else: skip('roster: online chip hidden with net=off')
        # 7. activities
        if pg.evaluate(f'!!{CTX}.activities'):
            lst = json.loads(pg.evaluate(f'JSON.stringify({CTX}.activities.list())')); print('  activities', len(lst), [a['id'] for a in lst][:12])
            check(len(lst) > 0, f'activities: list() non-empty ({len(lst)})')
            fw = next((a for a in lst if 'ferris' in a['id'].lower() or 'ferris' in a['name'].lower() or 'wheel' in a['name'].lower()), None)
            if fw and not fw.get('locked'):
                # approach from several sides (outside the 2.5 m "here" radius) until the sign's anchor is on screen and clear of the HUD
                sg = None
                for dx, dz in ((0, 3.5), (3.5, 0), (-3.5, 0), (0, 5.5), (0, -3.5)):
                    pg.evaluate(f'{CTX}.player.teleport({fw["x"] + dx}, {fw["z"] + dz})'); cstep(pg, 25); wait_ms(pg, 300); cstep(pg, 15)
                    sg = pg.evaluate(f'(() => {{ const e = [...document.querySelectorAll(".tba-sign")].find(e => e.dataset.id === {json.dumps(fw["id"])} && !e.hidden); if (!e) return null; const r = e.getBoundingClientRect(); return {{ x: r.left, y: r.top, w: r.width, h: r.height, op: +getComputedStyle(e).opacity }}; }})()')
                    if sg and sg['op'] > 0.2: print(f'  ferris sign seen from offset {dx},{dz}'); break
                check(bool(sg) and sg['op'] > 0.2, f'activities: sign for {fw["name"]} visible near it ({sg})')
                pg.screenshot(path=SH + 'activity_sign.png')
                if sg:
                    R = json.loads(pg.evaluate(HUDJS)); sg['n'] = 'sign'
                    bad = [r['n'] for r in R if overl(sg, r)]
                    check(not bad and inside(sg, 390, 844), f'activities: sign does not overlap the HUD ({bad})')
            else: skip('activities: no unlocked Ferris wheel activity in list()')
            # locked with ?doors=0
            pg.evaluate('window.__tinselby.step(1/30,2)'); pg.close(); c.close()
            c, pg = new_phone(390, 844, 'ux_locked'); uxload(pg, 0, 390, 844)
            lk = json.loads(pg.evaluate(f'JSON.stringify({CTX}.activities.list().filter(a => a.locked))'))
            check(len(lk) > 0, f'activities: some are locked with ?doors=0 ({len(lk)})')
            if lk:
                a = lk[0]; sg = None
                for dx, dz in ((0, 3.5), (3.5, 0), (-3.5, 0), (0, 5.5), (0, -3.5)):
                    pg.evaluate(f'{CTX}.player.teleport({a["x"] + dx}, {a["z"] + dz})'); cstep(pg, 25); wait_ms(pg, 300); cstep(pg, 15)
                    sg = pg.evaluate(f'(() => {{ const e = [...document.querySelectorAll(".tba-sign.locked")].find(e => !e.hidden && e.dataset.id === {json.dumps(a["id"])}); return e ? {{ lock: !!e.querySelector("svg"), txt: e.textContent.trim(), id: e.dataset.id }} : null; }})()')
                    if sg: print(f'  locked sign seen from offset {dx},{dz}'); break
                check(bool(sg) and sg['lock'], f'activities: locked sign shows a lock ({a["name"]}: {sg})'); pg.screenshot(path=SH + 'activity_locked.png')
            tag = 'ux_locked'
        else: skip('activities: ctx.activities missing')
        # 8. console errors across the whole part
        pg.close(); c.close()
        ue = [e for e in errs if e.startswith('[ux')]
        check(not ue, f'ux: 0 console errors ({len(ue)}) {ue[:3]}')

    # ------------------------------------------------------------------ Phase 1/2: card maker, invite welcome, install card, streaks
    if 'p1' in PARTS:
        import re
        from urllib.parse import quote
        T1 = time.time()
        SH1 = '/home/claude/tinselby/shots/p1_'
        P1URL = f'file://{DIST}/index.html?capture&net=off&tod=17.5'
        def p1load(pg, q, steps=12):
            pg.goto(P1URL + q, wait_until='commit'); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
            if steps: cstep(pg, steps)
        def relayout(pg, w, h):
            pg.set_viewport_size({'width': w, 'height': h}); pg.evaluate('new Promise(r => requestAnimationFrame(() => setTimeout(r, 80)))'); cstep(pg, 8)
        def card_ready(pg, label):
            try: pg.wait_for_function(f'{CTX}.cards.isOpen && !!{CTX}.cards.file', timeout=300000, polling=300); return True
            except Exception as e: check(False, f'{label}: card picture never finished ({str(e)[:80]})'); return False
        def ptap(pg, sel, label):  # scroll the element into view inside its panel (as a finger would), then a real tap
            pg.evaluate(f'document.querySelector({json.dumps(sel)})?.scrollIntoView({{ block: "nearest", inline: "nearest" }})'); return tap_el(pg, sel, label)
        SHARE_STUB = r"""window.__shares = []; window.__opens = [];
          Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { const f = (d.files || [])[0];
            const bm = f ? await createImageBitmap(f) : null;
            window.__shares.push({ files: (d.files || []).length, type: f && f.type, w: bm && bm.width, h: bm && bm.height, text: d.text, url: d.url }); } });
          Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
          window.open = (u) => { window.__opens.push(String(u)); return {}; };"""

        # ---- 1. Christmas card maker (Friends card → Send a Christmas card), 390x844 then 844x390; same page: streak chip (4.)
        tag = 'p1_card'; c, pg = new_phone(390, 844, tag, init=SHARE_STUB)
        p1load(pg, '&play&reset&reveal=all&doors=7&streak=5', 30); print('[p1] card page loaded', flush=True)
        check(tap_el(pg, '.tb-tr .tbs-friends-btn', 'Friends'), 'card: Friends button tapped')
        check(bool(rect(pg, '.tbs-invite')), 'card: Friends card opens')
        tapped = tap_el(pg, '.tbc-from-invite', 'Send a Christmas card'); check(tapped, 'card: "Send a Christmas card" tapped')
        if tapped:
            check(pg.evaluate(f'{CTX}.cards.isOpen && {CTX}.cards.state.where === "friends"') and bool(rect(pg, '.tbc-panel')), 'card: card maker panel opens')
            check(not rect(pg, '.tbs-invite'), 'card: Friends card closed behind it')
            card_ready(pg, 'card first')
            for sc, gr, fr in (('wheel', 'g2', 'f2'), ('park', 'g3', 'f1'), ('tree', 'g5', 'f3')):  # every scene, then the final design
                okt = all([ptap(pg, f'.tbc-chip[data-g="scene"][data-id="{sc}"]', sc), ptap(pg, f'.tbc-chip[data-g="greeting"][data-id="{gr}"]', gr),
                           ptap(pg, f'.tbc-chip[data-g="frame"][data-id="{fr}"]', fr)])
                card_ready(pg, f'card {sc}')
                st = pg.evaluate(f'{CTX}.cards.state')
                check(okt and (st['scene'], st['greeting'], st['frame']) == (sc, gr, fr), f'card: tapped scene/greeting/frame {sc}/{gr}/{fr} → {st["scene"]}/{st["greeting"]}/{st["frame"]}')
            pg.screenshot(path=SH1 + 'card_390x844.png')
            pr = rect(pg, '.tbc-panel'); check(bool(pr) and inside(pr, 390, 844), f'card 390x844: panel inside the viewport ({pr})')
            # Send → Web Share: one 1080x1350 JPEG, greeting in the text, card link
            check(ptap(pg, '.tbc-send', 'Send'), 'card: Send tapped')
            try: pg.wait_for_function('window.__shares.length > 0', timeout=15000, polling=200)
            except Exception: pass
            sh = pg.evaluate('window.__shares'); print('  shares', sh)
            check(len(sh) == 1 and sh[0]['files'] == 1 and sh[0]['type'] == 'image/jpeg' and (sh[0]['w'], sh[0]['h']) == (1080, 1350), f'card: Send → one navigator.share call with one 1080x1350 JPEG ({sh})')
            if sh:
                check('Ho ho ho!' in (sh[0]['text'] or ''), f'card: share text has the greeting ({sh[0]["text"]!r})')
                check(re.search(r'\?from=.+&card=(tree|wheel|park)\.g[1-5]\.f[1-3]', sh[0]['url'] or '') is not None and 'card=tree.g5.f3' in sh[0]['url'], f'card: share url {sh[0]["url"]}')
            # no Web Share → WhatsApp / Copy link / Save picture
            pg.evaluate("Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })")
            check(ptap(pg, '.tbc-send', 'Send (no share)'), 'card: Send tapped without navigator.share'); wait_ms(pg, 300); cstep(pg, 2)
            fb = {k: bool(rect(pg, s)) for k, s in (('wa', '.tbc-wa'), ('copy', '.tbc-copy'), ('save', '.tbc-save'), ('send', '.tbc-send'))}
            check(fb['wa'] and fb['copy'] and fb['save'] and not fb['send'], f'card: fallback WhatsApp + Copy link + Save picture shown ({fb})')
            pg.screenshot(path=SH1 + 'card_fallback_390x844.png')
            relayout(pg, 844, 390); wait_ms(pg, 200)
            pr = rect(pg, '.tbc-panel'); check(bool(pr) and inside(pr, 844, 390), f'card 844x390: panel inside the viewport ({pr})')
            acts = [rect(pg, s) for s in ('.tbc-wa', '.tbc-copy', '.tbc-save', '.tbc-x')]
            check(all(a and inside(a, 844, 390) for a in acts), f'card 844x390: action buttons + close inside the viewport ({acts})')
            pg.screenshot(path=SH1 + 'card_844x390.png')
            relayout(pg, 390, 844)
            check(tap_el(pg, '.tbc-x', 'close'), 'card: ✕ tapped'); cstep(pg, 4)
            check(pg.evaluate(f'!{CTX}.cards.isOpen && {CTX}.player.controllable && {CTX}.input.enabled !== false') and not rect(pg, '.tbc-panel'), 'card: ✕ closes, player controllable again')
            # a real tap on open ground sets a walk target
            pg.evaluate(f'{CTX}.input.clearTap?.()')
            onCanvas = pg.evaluate('document.elementFromPoint(195, 330)?.tagName')
            pg.touchscreen.tap(195, 330); cstep(pg, 2)
            tt = pg.evaluate(f'!!{CTX}.input.tapTarget')
            check(onCanvas == 'CANVAS' and tt, f'card: after closing, a tap on the ground walks (element {onCanvas}, tapTarget {tt})')
        # ---- 4. streak chip (?streak=5): shows 5, clear of goal card / stats chip / round buttons / mini-map
        if pg.evaluate(f'!!{CTX}.streaks'):
            STREAKJS = HUDJS.replace("document.querySelectorAll('.tb-stats .tb-chip')", "document.querySelectorAll('.tb-stats .tb-chip:not(.tb-streak)')").replace(
                "return JSON.stringify(out);", "add('streak', document.querySelector('.tb-streak')); return JSON.stringify(out);")
            for (w, h) in ((390, 844), (844, 390)):
                relayout(pg, w, h); cstep(pg, 6)
                R = json.loads(pg.evaluate(STREAKJS)); sk = next((r for r in R if r['n'] == 'streak'), None)
                txt = pg.evaluate('document.querySelector(".tb-streak b")?.textContent || ""')
                check(bool(sk) and txt == '5', f'streak {w}x{h}: chip visible with 5 ({txt!r}, {sk})')
                if sk:
                    bad = [r['n'] for r in R if r['n'] != 'streak' and overl(sk, r)]
                    names = sorted(r['n'] for r in R)
                    check(not bad and inside(sk, w, h) and {'goal', 'minimap'} <= set(names), f'streak {w}x{h}: chip clear of the HUD ({names}) overlaps {bad}')
                pg.screenshot(path=SH1 + f'streak_{w}x{h}.png')
        else: skip('streaks: ctx.streaks missing')
        c.close()

        # ---- 2. invite welcome (entry card, no &play): text inside the viewport, real taps through to play, URL cleaned, toast
        tag = 'p1_invite'; c, pg = new_phone(390, 844, tag); dialogs = []
        pg.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
        p1load(pg, '&reset&from=Ava&card=tree.g1.f2', 2); print('[p1] invite page loaded', flush=True)
        wt = pg.evaluate("document.querySelector('.tbi-welcome')?.innerText.replace(/\\s+/g, ' ') || ''")
        check('Ava invited you to Tinselby' in wt and 'Ava sent you: Merry Christmas!' in wt, f'invite: welcome text ({wt!r})')
        for s in ('.tbi-welcome', '.tbi-l1', '.tbi-l2', '#tb-name', '.tb-enter'):
            r = rect(pg, s); check(bool(r) and inside(r, 390, 844), f'invite: {s} inside the viewport ({r})')
        pg.screenshot(path=SH1 + 'invite_390x844.png')
        relayout(pg, 844, 390)
        lr = [rect(pg, s) for s in ('.tbi-welcome', '#tb-name', '.tb-enter')]
        check(all(r and inside(r, 844, 390) for r in lr), f'invite 844x390: welcome, name field, button inside the viewport ({lr})')
        pg.screenshot(path=SH1 + 'invite_844x390.png'); relayout(pg, 390, 844)
        check(tap_el(pg, '#tb-name', 'name field'), 'invite: name field tapped'); pg.keyboard.type('Mia')
        check(tap_el(pg, '.tb-enter', 'Next'), 'invite: "Next" tapped'); wait_ms(pg, 500); cstep(pg, 4)
        # toasts live ~3.6 s of real time and Chrome here renders ~1 frame/s: record every toast as it appears (text + rect)
        pg.evaluate("""(() => { window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.classList.contains('tb-toast')) setTimeout(() => { const r = n.getBoundingClientRect();
            window.__toasts.push({ t: n.textContent, x: r.left, y: r.top, w: r.width, h: r.height }); }, 60); } })
          .observe(document.body, { childList: true, subtree: true }); })()""")
        check(tap_el(pg, '.tb-entry .tb-primary', 'wardrobe primary'), 'invite: wardrobe primary button tapped')
        st = pg.evaluate(f'[{CTX}.game.state.phase, {CTX}.game.state.playerName, location.search]')
        check(st[0] == 'play' and st[1] == 'Mia', f'invite: in play as Mia ({st[:2]})')
        check('from=' not in st[2] and 'card=' not in st[2], f'invite: URL no longer has from / card ({st[2]})')
        toast = None
        for _ in range(20):  # the toast comes ~1.6 s (real time) after game:start
            toast = pg.evaluate("window.__toasts.find(t => t.t.includes('Ava is waving hello!')) || null")
            if toast: break
            wait_ms(pg, 300)
        if toast: pg.screenshot(path=SH1 + 'invite_toast_390x844.png')
        check(bool(toast) and inside(toast, 390, 844), f'invite: toast "Ava is waving hello!" shown ({toast}; all toasts {pg.evaluate("window.__toasts.map(t => t.t)")})')
        # junk sender name: no element injected
        p1load(pg, '&reset&from=' + quote('<img src=x onerror=alert(1)>'), 2)
        wait_ms(pg, 400)
        j = pg.evaluate("""(() => { const w = document.querySelector('.tbi-welcome');
          return { welcome: !!w, name: w ? w.querySelector('.tbi-l1 b')?.textContent : null, imgInWelcome: w ? w.querySelectorAll('img').length : -1,
                   imgX: [...document.images].filter(i => i.getAttribute('src') === 'x').length }; })()""")
        check(j['welcome'] and j['imgInWelcome'] == 0 and j['imgX'] == 0 and not dialogs and '<' not in (j['name'] or ''), f'invite: junk ?from=<img …> injects no img ({j}, dialogs {dialogs})')
        pg.screenshot(path=SH1 + 'invite_junk_390x844.png')
        c.close()

        # ---- 3. install card: Android UA + a faked beforeinstallprompt, door 1 done → card in free play; "Not now" hides it
        UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
        tag = 'p1_pwa'; c, pg = new_phone(390, 844, tag, user_agent=UA_ANDROID)
        p1load(pg, '&play&reset&reveal=all&doors=0&pwa', 6); print('[p1] pwa page loaded', flush=True)
        if pg.evaluate(f'!!{CTX}.pwa'):
            pg.evaluate("""(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve();
              e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' }); window.dispatchEvent(e); })()""")
            check(pg.evaluate(f'{CTX}.pwa.platform') == 'android' and not pg.evaluate(f'{CTX}.pwa.cardShown'), 'install: android platform, no card before a door is done')
            pg.evaluate(f'{CTX}.progress.complete(1, {{ stars: 3 }})'); cstep(pg, 5)
            for _ in range(6):  # tap through the door reward card(s)
                if not pg.evaluate(f'!!{CTX}.ui.cards.busy'): break
                if not tap_el(pg, '.tb-cards:not(.tb-pwa-layer) .tb-card:not(.out) .knit-btn', 'reward card'):
                    pg.evaluate("document.querySelector('.tb-cards:not(.tb-pwa-layer) .tb-card:not(.out) .knit-btn')?.click()")
                wait_ms(pg, 400); cstep(pg, 3)
            for _ in range(14):
                cstep(pg, 4); wait_ms(pg, 500)
                if pg.evaluate(f'{CTX}.pwa.cardShown'): break
            shown = pg.evaluate(f'{CTX}.pwa.cardShown'); cr = rect(pg, '.tb-pwa-card')
            check(shown and bool(cr) and inside(cr, 390, 844), f'install: card shown in free play after door 1, inside the viewport ({cr}, {pg.evaluate(f"JSON.stringify({CTX}.pwa.state)")})')
            pg.screenshot(path=SH1 + 'install_390x844.png')
            if shown:
                check(tap_el(pg, '.tb-pwa-later', 'Not now'), 'install: "Not now" tapped'); wait_ms(pg, 450); cstep(pg, 3)
                check(not pg.evaluate(f'{CTX}.pwa.cardShown') and not rect(pg, '.tb-pwa-card'), 'install: "Not now" hides the card')
        else: skip('install: ctx.pwa missing')
        c.close()

        # ---- 5. console errors across the part (Google Fonts can't load here: no network for file:// runs)
        pe = [e for e in errs if e.startswith('[p1') and not re.search(r'fonts\.(googleapis|gstatic)\.com', e)]
        ign = len([e for e in errs if e.startswith('[p1')]) - len(pe)
        check(not pe, f'p1: 0 console errors ({len(pe)}; {ign} offline Google Fonts errors ignored) {pe[:3]}')
        print(f'[p1] {round(time.time() - T1)} s', flush=True)

    b.close()

print('\nSKIPS:', len(skips)); print('\n'.join(skips))
print('\nFAILS:', len(fails)); print('\n'.join(fails))
print('CONSOLE ERRORS:', len(errs)); print('\n'.join(errs[:30]))
