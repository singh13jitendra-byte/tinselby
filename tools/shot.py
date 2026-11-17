#!/usr/bin/env python3
"""Headless screenshot helper (shared by all agents; serialised with a lock because the box has 2 CPUs).
Usage: python3 tools/shot.py OUT_PREFIX '<json plan>'
Plan items: ["step", n, "name"] (advance n frames at 1/30 s, then screenshot shots/<prefix>_<name>.png)
            ["js", "<expression>"] (evaluate and print)
Runs dist/index.html?capture&<query>. Build first: npx vite build. Keep plans short (≤ 200 steps total)."""
import sys, json, time, fcntl, os
from playwright.sync_api import sync_playwright
prefix = sys.argv[1]; plan = json.loads(sys.argv[2]); query = sys.argv[3] if len(sys.argv) > 3 else ''
os.makedirs('/home/claude/tinselby/shots', exist_ok=True)
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    logs = []
    pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    pg.goto('file:///home/claude/tinselby/dist/index.html?capture' + ('&' + query if query else ''))
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=30000)
    for cmd in plan:
        if cmd[0] == 'step':
            t = time.time(); pg.evaluate(f'window.__tinselby.step(1/30,{cmd[1]})')
            out = f'/home/claude/tinselby/shots/{prefix}_{cmd[2]}.png'; pg.screenshot(path=out)
            print(out, round(time.time() - t, 1), 's', pg.evaluate('JSON.stringify(window.__tinselby.stats())'))
        elif cmd[0] == 'js':
            print('js>', pg.evaluate(cmd[1]))
    print('\n'.join(logs[:30]) or 'no console errors')
    b.close()
