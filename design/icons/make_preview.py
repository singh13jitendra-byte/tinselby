#!/usr/bin/env python3
"""Composite whichever Tinselby icon options exist in design/icons/{a,b,c}/ into
  preview.png        - mock Android home screen (412 css px wide, DPR 2.6, 56 px squircle icons,
                       maskable art, white "Tinselby" labels) + a 48 dp row (circle / squircle / any / 32 px favicon)
  preview_large.png  - each option at 512 px with its letter, maskable version inset in a circle.
Run: python3 design/icons/make_preview.py
"""
import os, random
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {'a': 'Knitted bauble', 'b': 'Stitched tree', 'c': 'Knit T'}
SLOTS = {'a': (0, 2), 'b': (1, 1), 'c': (2, 3)}  # (row, col) on the home screen

PLACEHOLDERS = [  # neutral, unbranded placeholder apps: (label, bg, glyph svg in a 48 box)
    ('Clock', '#3d4250', '<circle cx="24" cy="24" r="13" fill="none" stroke="#fff" stroke-width="3.2"/><path d="M24 16v9l6 4" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/>'),
    ('Notes', '#e8c447', '<rect x="13" y="12" width="22" height="25" rx="4" fill="#fff"/><path d="M18 20h12M18 25h12M18 30h8" stroke="#c9a52a" stroke-width="2.6" stroke-linecap="round"/>'),
    ('Maps', '#4b8c6b', '<path d="M24 11c-6 0-10 4.5-10 10 0 7 10 16 10 16s10-9 10-16c0-5.5-4-10-10-10z" fill="#fff"/><circle cx="24" cy="21" r="4" fill="#4b8c6b"/>'),
    ('Music', '#c4466a', '<path d="M20 31V15l13-3v16" stroke="#fff" stroke-width="3.2" fill="none"/><circle cx="17" cy="31" r="4" fill="#fff"/><circle cx="30" cy="28" r="4" fill="#fff"/>'),
    ('Camera', '#555b66', '<rect x="11" y="16" width="26" height="19" rx="5" fill="#fff"/><circle cx="24" cy="25.5" r="5.5" fill="#555b66"/><rect x="19" y="12" width="10" height="5" rx="2" fill="#fff"/>'),
    ('Weather', '#3f7cc9', '<circle cx="20" cy="20" r="6" fill="#ffd36e"/><path d="M17 33h15a5 5 0 0 0 0-10 7 7 0 0 0-13 2 4 4 0 0 0-2 8z" fill="#fff"/>'),
    ('Files', '#6b6fd6', '<path d="M12 16h9l3 3h12v15H12z" fill="#fff"/>'),
    ('Mail', '#d0593a', '<rect x="11" y="15" width="26" height="18" rx="3" fill="#fff"/><path d="M12 17l12 9 12-9" stroke="#d0593a" stroke-width="2.6" fill="none"/>'),
    ('Chat', '#2f9e8f', '<path d="M12 14h24v15H20l-6 5v-5h-2z" fill="#fff"/>'),
    ('Calendar', '#f2f2f2', '<rect x="12" y="13" width="24" height="23" rx="4" fill="none" stroke="#5a6070" stroke-width="2.6"/><path d="M12 19h24" stroke="#d0593a" stroke-width="4"/><text x="24" y="33" font-size="11" font-family="Inter, sans-serif" font-weight="700" text-anchor="middle" fill="#5a6070">22</text>'),
    ('Photos', '#ffffff', '<circle cx="19" cy="19" r="6" fill="#e8574a"/><circle cx="29" cy="19" r="6" fill="#f2b33d" opacity=".9"/><circle cx="19" cy="29" r="6" fill="#3f9e5e" opacity=".9"/><circle cx="29" cy="29" r="6" fill="#3f7cc9" opacity=".9"/>'),
    ('Settings', '#6c717c', '<circle cx="24" cy="24" r="9" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="4 3"/><circle cx="24" cy="24" r="4" fill="#fff"/>'),
    ('Wallet', '#2d6e5e', '<rect x="11" y="15" width="26" height="19" rx="4" fill="#fff"/><rect x="27" y="22" width="10" height="6" rx="2" fill="#2d6e5e"/>'),
    ('Phone', '#3aa65a', '<path d="M17 12c2 0 3 4 3 5s-2 2-2 3c1 3 4 6 7 7 1 0 2-2 3-2s5 1 5 3-2 5-5 5c-8 0-16-8-16-16 0-3 3-5 5-5z" fill="#fff"/>'),
    ('Messages', '#3f7cc9', '<path d="M11 15h26v16H22l-7 5v-5h-4z" fill="#fff"/>'),
    ('Browser', '#e9eef6', '<circle cx="24" cy="24" r="12" fill="none" stroke="#3f7cc9" stroke-width="3"/><path d="M12 24h24M24 12c-5 6-5 18 0 24M24 12c5 6 5 18 0 24" stroke="#3f7cc9" stroke-width="2.2" fill="none"/>'),
    ('Store', '#4a5161', '<path d="M15 18h18l-2 16H17z" fill="#fff"/><path d="M19 18a5 5 0 0 1 10 0" stroke="#fff" stroke-width="2.6" fill="none"/>'),
]
SQUIRCLE = 'border-radius:32%'


def present():
    return [k for k in 'abc' if os.path.exists(os.path.join(HERE, k, 'icon-512.png'))
            and os.path.exists(os.path.join(HERE, k, 'icon-maskable-512.png'))]


def url(k, f):
    p = os.path.join(HERE, k, f)
    return f'file://{p}?v={int(os.path.getmtime(p))}' if os.path.exists(p) else ''


def home_html(opts):
    import itertools
    ph = itertools.cycle(PLACEHOLDERS)

    def ph_cell(label=True):
        lab, bg, g = next(ph)
        return (f'<div class="cell"><div class="ic" style="background:{bg}"><svg viewBox="0 0 48 48">{g}</svg></div>'
                + (f'<span>{lab}</span>' if label else '') + '</div>')

    def tb_cell(k):
        return f'<div class="cell"><div class="ic tb" style="background-image:url({url(k, "icon-maskable-512.png")})"></div><span>Tinselby</span></div>'

    rows = []
    for r in range(3):
        row = []
        for c in range(5):
            hit = [k for k in opts if SLOTS[k] == (r, c)]
            row.append(tb_cell(hit[0]) if hit else ph_cell())
        rows.append(row)
    grid = ''.join(f'<div class="row">{"".join(r)}</div>' for r in rows)
    dock = ''.join(ph_cell(False) for _ in range(4))
    random.seed(7)
    bokeh = ''
    for _ in range(28):
        x, y, r = random.randint(-30, 430), random.randint(10, 760), random.randint(14, 64)
        col = random.choice(['255,190,110', '255,160,80', '255,220,160', '120,150,255', '255,120,90'])
        op = random.uniform(0.18, 0.5)
        bokeh += (f'<div class="bk" style="left:{x}px;top:{y}px;width:{r}px;height:{r}px;background:radial-gradient(circle, '
                  f'rgba({col},{op:.2f}) 0%, rgba({col},{op * 0.5:.2f}) 55%, rgba({col},0) 72%)"></div>')
    small = ''
    for k in opts:
        m, f = url(k, 'icon-maskable-512.png'), url(k, 'icon-512.png')
        fav = url(k, 'favicon-32.png')
        small += f'''<div class="sm"><div class="smname"><b>{k.upper()}</b>{NAMES[k]}</div><div class="smrow">
  <div class="smc"><div class="ic48" style="border-radius:50%;background-image:url({m})"></div><i>circle</i></div>
  <div class="smc"><div class="ic48" style="{SQUIRCLE};background-image:url({m})"></div><i>squircle</i></div>
  <div class="smc"><div class="ic48" style="border-radius:22%;background-image:url({f})"></div><i>any</i></div>
  <div class="smc">{f'<img class="px" src="{fav}">' if fav else ''}<i>favicon</i></div>
</div></div>'''
    missing = [k for k in 'abc' if k not in opts]
    note = f'<div class="miss">missing: {", ".join(x.upper() for x in missing)}</div>' if missing else ''
    return f'''<html><head><style>
* {{ box-sizing:border-box }}
body {{ margin:0; width:412px; font-family: Roboto, Inter, 'Liberation Sans', system-ui, sans-serif; }}
.screen {{ position:relative; width:412px; height:760px; overflow:hidden;
  background: radial-gradient(120% 60% at 30% 85%, #3a2a3a 0%, rgba(0,0,0,0) 60%),
              radial-gradient(90% 50% at 80% 20%, #1d2a4a 0%, rgba(0,0,0,0) 70%),
              linear-gradient(180deg, #0b1020 0%, #141a30 45%, #1b1622 75%, #0c0a10 100%); }}
.bk {{ position:absolute; border-radius:50%; filter: blur(2px); }}
.status {{ position:relative; height:30px; color:#fff; font-size:13px; display:flex; justify-content:space-between; padding:8px 20px 0; opacity:.9 }}
.clock {{ position:relative; color:#fff; padding:24px 26px 0 }}
.clock b {{ font-size:58px; font-weight:400; letter-spacing:-1px; display:block; line-height:1 }}
.clock small {{ font-size:14px; opacity:.85 }}
.grid {{ position:absolute; left:0; right:0; bottom:146px; padding:0 8px }}
.row {{ display:flex; justify-content:space-around; margin-top:20px }}
.cell {{ width:78px; display:flex; flex-direction:column; align-items:center }}
.ic {{ width:56px; height:56px; {SQUIRCLE}; display:grid; place-items:center; overflow:hidden }}
.ic svg {{ width:56px; height:56px }}
.ic.tb {{ background-size:cover }}
.cell span {{ color:#fff; font-size:12px; margin-top:6px; text-shadow:0 1px 3px rgba(0,0,0,.8) }}
.dock {{ position:absolute; left:14px; right:14px; bottom:50px; height:80px; border-radius:30px; background:rgba(255,255,255,.12); display:flex; justify-content:space-around; align-items:center }}
.search {{ position:absolute; left:24px; right:24px; bottom:12px; height:30px; border-radius:15px; background:rgba(255,255,255,.18) }}
.panel {{ background:#121521; padding:14px 14px 16px; color:#fff }}
.panel h3 {{ margin:0 0 6px; font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; opacity:.6 }}
.sm {{ display:flex; align-items:center; margin:10px 0 }}
.smname {{ width:130px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px }}
.smname b {{ display:inline-grid; place-items:center; width:22px; height:22px; border-radius:50%; background:#fff4e2; color:#b8302d; font-size:12px }}
.smrow {{ display:flex; gap:16px; align-items:flex-end }}
.smc {{ display:flex; flex-direction:column; align-items:center; gap:3px; width:48px }}
.smc i {{ font-style:normal; font-size:9px; opacity:.55 }}
.ic48 {{ width:48px; height:48px; background-size:cover }}
.px {{ width:32px; height:32px; image-rendering:pixelated; margin-bottom:8px }}
.miss {{ font-size:11px; color:#f5a; margin-top:6px }}
</style></head><body>
<div class="screen">{bokeh}
  <div class="status"><span>9:41</span><span>5G  87%</span></div>
  <div class="clock"><b>9:41</b><small>Sun, 22 Nov</small></div>
  <div class="grid">{grid}</div>
  <div class="dock">{dock}</div>
  <div class="search"></div>
</div>
<div class="panel"><h3>48 dp · maskable in circle / squircle · any · favicon</h3>{small}{note}</div>
</body></html>'''


def large_html(opts):
    big = ''
    for k in opts:
        big += f'''<div class="opt"><div class="pair"><img src="{url(k, 'icon-512.png')}"><img class="m" src="{url(k, 'icon-maskable-512.png')}"></div>
<div class="cap"><b>{k.upper()}</b>{NAMES[k]}</div></div>'''
    return f'''<html><head><style>
body {{ margin:0; background:#1a1f33; font-family: Inter, sans-serif; color:#fff; display:inline-block }}
.wrap {{ display:flex; gap:48px; padding:40px 48px 36px }}
.opt {{ display:flex; flex-direction:column; align-items:center; gap:26px }}
.pair {{ position:relative }}
.pair img {{ width:512px; height:512px; border-radius:22%; display:block; box-shadow:0 10px 30px rgba(0,0,0,.4) }}
.pair img.m {{ position:absolute; right:-16px; bottom:-16px; width:150px; height:150px; border-radius:50%; border:5px solid #1a1f33 }}
.cap {{ font-size:34px; font-weight:600; display:flex; align-items:center; gap:14px }}
.cap b {{ display:inline-grid; place-items:center; width:60px; height:60px; border-radius:50%; background:#fff4e2; color:#b8302d; outline:3px dashed #b8302d; outline-offset:-8px }}
</style></head><body><div class="wrap">{big}</div></body></html>'''


def main():
    opts = present()
    if not opts:
        print('no options found'); return opts
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--allow-file-access-from-files'])
        os.makedirs('/tmp/tbicons', exist_ok=True)
        open('/tmp/tbicons/preview.html', 'w').write(home_html(opts))
        pg = b.new_page(device_scale_factor=2.6, viewport={'width': 412, 'height': 800})
        pg.goto('file:///tmp/tbicons/preview.html'); pg.wait_for_load_state('load')
        pg.screenshot(path=os.path.join(HERE, 'preview.png'), full_page=True)
        open('/tmp/tbicons/preview_large.html', 'w').write(large_html(opts))
        w = 96 + len(opts) * 512 + (len(opts) - 1) * 48
        pg2 = b.new_page(device_scale_factor=1, viewport={'width': w, 'height': 700})
        pg2.goto('file:///tmp/tbicons/preview_large.html'); pg2.wait_for_load_state('load')
        pg2.screenshot(path=os.path.join(HERE, 'preview_large.png'), full_page=True)
        b.close()
    print('preview built with', ','.join(opts))
    return opts


if __name__ == '__main__':
    main()
