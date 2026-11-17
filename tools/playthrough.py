#!/usr/bin/env python3
"""End-to-end check: entry screen → name → play → all tasks (selfTest) → finale moments; then phone layouts.
Writes shots/e2e_*.png and prints console errors. Uses the shared Chrome lock."""
import fcntl, json, time
from playwright.sync_api import sync_playwright
BASE = 'file:///home/claude/tinselby/dist/index.html?capture'
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
errs = []
def attach(pg, tag):
    pg.on('console', lambda m: errs.append(f'[{tag}] {m.type}: {m.text}') if m.type in ('error',) and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append(f'[{tag}] PAGEERROR {e}'))
def shot(pg, name, steps=0):
    t = time.time()
    if steps: pg.evaluate(f'window.__tinselby.step(1/30,{steps})')
    pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    pg.screenshot(path=f'/home/claude/tinselby/shots/e2e_{name}.png')
    print(name, round(time.time()-t), 's', pg.evaluate('JSON.stringify(window.__tinselby.stats())'), flush=True)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    # ---- desktop
    pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(240000); attach(pg, 'desktop')
    pg.goto(BASE); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=240000)
    shot(pg, 'entry', 20)
    pg.fill('input', 'Jitendra')
    pg.get_by_text('Enter Tinselby').first.click()
    print('phase after Enter:', pg.evaluate('window.__tinselby.ctx.game.state.phase'), pg.evaluate('window.__tinselby.ctx.game.state.playerName'))
    shot(pg, 'start', 60)
    res = pg.evaluate('(async () => { const r = await window.__tinselby.ctx.tasks.selfTest(); return JSON.stringify(r).slice(0, 600); })()')
    print('selfTest:', res)
    print('spirit/phase:', pg.evaluate('JSON.stringify([window.__tinselby.ctx.game.state.spirit, window.__tinselby.ctx.game.state.phase])'))
    fin = 'window.__tinselby.ctx.finale'
    for t, name in [(15, 'landed'), (25, 'gift'), (33, 'countdown'), (39.5, 'christmas'), (53, 'end')]:
        pg.evaluate(f'{fin}.jumpTo && {fin}.jumpTo({t})')
        shot(pg, name, 30)
    print('final phase:', pg.evaluate('window.__tinselby.ctx.game.state.phase'))
    pg.close()
    # ---- phone landscape + portrait
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=2)
    mp = ctx.new_page(); mp.set_default_timeout(240000); attach(mp, 'phone')
    mp.goto(BASE + '&play'); mp.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=240000)
    shot(mp, 'phone_hud', 40)
    mp.touchscreen.tap(422, 150); shot(mp, 'phone_tapwalk', 20)
    mp.set_viewport_size({'width': 390, 'height': 844}); shot(mp, 'phone_portrait', 5)
    ctx.close(); b.close()
print('CONSOLE ERRORS:', len(errs)); print('\n'.join(errs[:20]))
