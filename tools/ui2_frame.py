#!/usr/bin/env python3
"""Advent-board framing shot check: evening + night glow, release on walk-away and on calendar open."""
import fcntl, sys
from playwright.sync_api import sync_playwright
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(300000)
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto('file:///home/claude/tinselby/dist/index.html?capture&play&net=off&doors=3&tod=18.5&at=-2.4,-2.3')
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
    T = 'window.__tinselby'; C = T + '.ctx'
    def st(n): pg.evaluate(f'{T}.step(0.1,{n})')
    def fin(): pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    st(14); fin()
    print('shot', pg.evaluate(f'{C}.cam.shotName'), 'framing class', pg.evaluate("document.getElementById('ui').classList.contains('tb-framing')"))
    pg.screenshot(path='/home/claude/tinselby/shots/ui2_frame_1850.png')
    pg.evaluate(f'{C}.world.setTimeOfDay(22, true)'); st(3); fin()
    pg.screenshot(path='/home/claude/tinselby/shots/ui2_frame_2200.png')
    # walk away -> release
    pg.evaluate(f'{C}.player.teleport(2.5,2.5,0)'); st(14)
    print('after walk-away shot=', repr(pg.evaluate(f'{C}.cam.shotName')), 'active', pg.evaluate(f'{C}.cam.shotActive'), 'class', pg.evaluate("document.getElementById('ui').classList.contains('tb-framing')"))
    # return, frame again, open the calendar -> released, then close and stay near board: no immediate re-frame
    pg.evaluate(f'{C}.player.teleport(-2.4,-2.3,0)'); st(14)
    print('re-framed', pg.evaluate(f'{C}.cam.shotName'))
    pg.evaluate(f'{C}.calendar.open()'); st(10)
    print('calendar open: shot=', repr(pg.evaluate(f'{C}.cam.shotName')))
    pg.evaluate(f'{C}.calendar.close()'); st(14)
    print('after close (still at board): shot=', repr(pg.evaluate(f'{C}.cam.shotName')), 'controllable', pg.evaluate(f'{C}.player.controllable'))
    print('errors:', errs or 'none')
    b.close()
