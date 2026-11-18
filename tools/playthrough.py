#!/usr/bin/env python3
"""Wave-1 end-to-end check (Advent doors 1–8).

  desktop: entry screen → name → Enter → selfTest (plays doors 1–8 headless) → calendar / wardrobe / wave-end
  mini-games: each of the 4 real games starts (?mg=<id>&mgauto), runs a little, quits, and must leave the scene clean
  phone: landscape HUD, tap-to-walk, portrait hint

Writes shots/e2e_*.png and prints console errors. Uses the shared Chrome lock.
Usage: python3 tools/playthrough.py [desktop|games|phone ...]   (default: all)"""
import fcntl, json, sys, time
from playwright.sync_api import sync_playwright

BASE = 'file:///home/claude/tinselby/dist/index.html?capture&net=off&tod=17.5'
PARTS = set(sys.argv[1:]) or {'desktop', 'games', 'phone'}
GAMES = ['ornaments', 'cookies', 'snowball', 'sled']
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
errs, fails = [], []

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
            ready(pg, BASE + f'&play&doors=8&mg={gid}&mgauto')
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
        mp.set_viewport_size({'width': 390, 'height': 844}); shot(mp, 'phone_portrait', 5)
        c.close()
    b.close()

print('\nFAILS:', len(fails)); print('\n'.join(fails))
print('CONSOLE ERRORS:', len(errs)); print('\n'.join(errs[:30]))
