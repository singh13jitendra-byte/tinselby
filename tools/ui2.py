#!/usr/bin/env python3
"""UI wave-2 checks: small-phone layout rects (667x375, 844x390) + calendar detail stability. Usage: ui2.py W H tag"""
import fcntl, json, sys
from playwright.sync_api import sync_playwright
W, H, tag = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
RECTS = '''(() => { const o = {}; for (const s of ['.tb-tc','.tb-tr','.tb-door','.tb-chips','.tb-joy','.tb-card','.tb-act','.tb-bubble','.tb-task','.cal-panel','.tb-toasts'])
  { const e = document.querySelector(s); if (e && e.offsetParent !== null) { const r = e.getBoundingClientRect(); o[s] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), e.scrollWidth > e.clientWidth + 1 ? 'TRUNC' : ''].join(','); } }
  const d = document.querySelector('.tb-door-txt'); if (d) o.doorTxtTrunc = d.scrollWidth > d.clientWidth + 1;
  o.vh = innerHeight; return JSON.stringify(o); })()'''
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    c = b.new_context(viewport={'width': W, 'height': H}, is_mobile=True, has_touch=True)
    pg = c.new_page(); pg.set_default_timeout(300000)
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto('file:///home/claude/tinselby/dist/index.html?capture&play&net=off&doors=3&tod=17.5&at=6,6')
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
    T = 'window.__tinselby'
    pg.evaluate(f'{T}.step(0.1, 6)')
    # reward card + bubble together (worst case)
    pg.evaluate(f'{T}.ctx.ui.cards.reward({{slot:"hat",key:"santa",label:"Santa hat"}})')
    pg.evaluate(f'{T}.ctx.game.emit("dialog",{{who:"Mrs Holly",text:"Thank you so much, the lights look lovely!",ms:60000,pos:{{x:6,y:1.4,z:5}}}})')
    pg.evaluate(f'{T}.step(0.1, 4)')
    pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    print('HUD', pg.evaluate(RECTS))
    pg.screenshot(path=f'/home/claude/tinselby/shots/ui2_{tag}_hud.png')
    pg.evaluate(f'{T}.ctx.calendar.open(4)')
    pg.evaluate(f'{T}.step(0.1, 2)')
    pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    print('CAL', pg.evaluate(RECTS))
    # detail strip must survive the 1.5 s poll
    pg.evaluate("window.__go = document.querySelector('.cal-go')")
    pg.evaluate(f'{T}.step(0.5, 8)')
    print('detail button kept across polls:', pg.evaluate("!!window.__go && window.__go === document.querySelector('.cal-go') && document.contains(window.__go)"))
    pg.screenshot(path=f'/home/claude/tinselby/shots/ui2_{tag}_cal.png')
    print('errors:', errs or 'none')
    b.close()
