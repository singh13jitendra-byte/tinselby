#!/usr/bin/env python3
import fcntl
from playwright.sync_api import sync_playwright
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540}); pg.set_default_timeout(300000)
    for tod in (13, 22):
        pg.goto(f'file:///home/claude/tinselby/dist/index.html?capture&net=off&reset&tod={tod}')
        pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
        pg.evaluate('window.__tinselby.step(1/30, 8)')
        pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        pg.screenshot(path=f'/home/claude/tinselby/shots/ui2_entry_{tod}.png', clip={'x': 180, 'y': 0, 'width': 600, 'height': 300})
    b.close()
