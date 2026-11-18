#!/usr/bin/env python3
"""Wave-2 UI check: python3 w2ui_check.py <tag> <w> <h> <touch 0|1>"""
import fcntl, sys, json
from playwright.sync_api import sync_playwright
tag, W, H, touch = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4] == '1'
lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
S = '/home/claude/tinselby/shots/w2ui_'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    cx = b.new_context(viewport={'width': W, 'height': H}, has_touch=touch, is_mobile=touch, device_scale_factor=1)
    pg = cx.new_page(); pg.set_default_timeout(300000)
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto('file:///home/claude/tinselby/dist/index.html?capture&play&net=off&w2&doors=16&tod=18.5&at=10,3')
    pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
    T = 'window.__tinselby'; C = T + '.ctx'
    def st(n): pg.evaluate(f'{T}.step(0.1,{1})')
    def fin(): pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
    def shot(n): pg.screenshot(path=f'{S}{tag}_{n}.png')
    st(8); fin()
    print('keys visible:', pg.evaluate("(() => { const k = document.querySelector('.tb-keys'); return k && getComputedStyle(k).display !== 'none' && !k.hidden; })()"))
    # 1. banner + door toast together
    pg.evaluate(f"{C}.game.emit('district:enter', {{ id: 'lakeside', first: true }}); {C}.ui.toast('Door 9 is open: Figure Skating! Find Ilse by Frostmere Lake', 8000, {{ x: 10.4, z: 4.2 }})")
    pg.wait_for_timeout(450)
    shot('toasts')
    print('banner/toast overlap:', pg.evaluate("(() => { const r = document.querySelector('.tb-banner-ribbon').getBoundingClientRect(), t = document.querySelector('.tb-toast').getBoundingClientRect(); return JSON.stringify({ ribbonBottom: Math.round(r.bottom), toastTop: Math.round(t.top), overlap: r.bottom > t.top && r.top < t.bottom }); })()"))
    pg.wait_for_timeout(3200)
    # 2. doors:new card
    pg.evaluate(f"document.querySelector('.tb-toasts').replaceChildren(); {C}.game.emit('doors:new', {{ from: 9, to: 16 }})")
    st(3); fin(); shot('doorsnew')
    print('doors:new card:', pg.evaluate("document.querySelector('.tb-card .tb-card-title')?.textContent"))
    pg.evaluate("document.querySelector('.tb-card .knit-btn.cream')?.click()"); pg.wait_for_timeout(500)
    if not (len(sys.argv) > 5 and sys.argv[5] == 'cards'):
        pass
    # 3. wave-end card
    pg.evaluate(f"{C}.ui.cards.waveEnd()"); st(3); fin(); shot('waveend')
    print('wave card:', pg.evaluate("document.querySelector('.tb-card.wave .tb-card-title')?.textContent"))
    pg.evaluate("document.querySelector('.tb-card.wave .knit-btn')?.click()"); pg.wait_for_timeout(500)
    # 4. choose card (+ keyboard / cancel)
    pg.evaluate(f"void ({C}.ui.choose({{ title: 'Coach Sasha', text: 'Which game shall we play?', options: [{{ id: 7, label: 'Sledge Hill Race', icon: 'cable' }}, {{ id: 16, label: 'Sledge Hill Race II', icon: 'snowman' }}] }}).then(v => window.__r1 = v))")
    st(2); fin(); pg.wait_for_timeout(400); shot('choose')
    print('hud hidden while choose:', pg.evaluate("document.querySelector('.tb-hud').hidden"))
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    print('choose keyboard result (expect 16):', pg.evaluate('window.__r1'))
    pg.evaluate(f"void {C}.ui.choose({{ title: 'X', options: [{{ id: 1, label: 'A' }}, {{ id: 2, label: 'B' }}] }}).then(v => window.__r2 = v === null ? 'null' : v)")
    st(1); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print('escape result (expect null):', pg.evaluate('window.__r2'))
    pg.evaluate(f"void {C}.ui.choose({{ title: 'X', options: [{{ id: 1, label: 'A' }}, {{ id: 2, label: 'B' }}] }}).then(v => window.__r3 = v)")
    st(1); fin(); pg.wait_for_timeout(300); pg.click('.tb-choose-opt[data-i=\"1\"]'); pg.wait_for_timeout(300)
    print('click result (expect 2):', pg.evaluate('window.__r3'))
    # 5. house open hides HUD
    st(2); print('hud visible before:', pg.evaluate("!document.querySelector('.tb-hud').hidden && getComputedStyle(document.querySelector('.tb-hud')).display !== 'none'"))
    pg.evaluate("document.getElementById('ui').classList.add('tb-house-open')"); st(3)
    print('hud visible with house open:', pg.evaluate("(() => { const h = document.querySelector('.tb-hud'); return !h.hidden && getComputedStyle(h).display !== 'none'; })()"), 'modalOpen', pg.evaluate(f'{C}.ui.modalOpen()'))
    shot('houseopen')
    pg.evaluate("document.getElementById('ui').classList.remove('tb-house-open')"); st(2)
    # 6. wardrobe tray
    pg.evaluate(f"{C}.ui.openWardrobe()"); st(3); fin(); pg.wait_for_timeout(600); shot('wardrobe')
    pg.evaluate("document.querySelectorAll('.tb-scroll').forEach(e => e.scrollTop = 9999)"); pg.wait_for_timeout(300); shot('wardrobe2')
    pg.evaluate(f"{C}.ui.closeWardrobe()"); st(2)
    # 7. calendar (reward glyph tints)
    pg.evaluate(f"{C}.calendar.open()"); st(3); fin(); pg.wait_for_timeout(500); shot('calendar')
    print('errors:', errs or 'none')
    b.close()
