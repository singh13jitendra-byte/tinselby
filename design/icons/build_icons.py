#!/usr/bin/env python3
"""Tinselby app-icon OPTION A - knitted bauble.

Writes design/icons/a/icon.svg (full-bleed, "any") and icon-maskable.svg (art inside the
80 % safe zone), then renders PNGs with headless Chrome (Playwright):
  icon-512.png, icon-192.png, icon-maskable-512.png, apple-touch-icon.png (180), favicon-32.png
Run:  python3 design/icons/build_icons.py   (then python3 design/icons/make_preview.py)
"""
import os, sys, math
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))

# Game palette (src/core/theme.css)
CREAM, CREAM2 = '#fff4e2', '#f3e3c6'
RED, RED_DARK, RED_LIGHT = '#b8302d', '#8b2523', '#e0514a'
GREEN, GREEN_DARK, GREEN_LIGHT = '#3f6e45', '#2b5132', '#5a9361'
GOLD, GOLD_DARK, GOLD_LIGHT = '#e3aa3a', '#b9801f', '#ffd36e'
NIGHT, INK = '#2b3452', '#3a2a24'


def star_path(cx, cy, ro, ri, rot=0.0, n=5):
    pts = []
    for i in range(n * 2):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot - 90 + i * 180 / n)
        pts.append(f'{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}')
    return 'M' + ' L'.join(pts) + ' Z'


def knit_pattern(pid, base, hi, lo, w=20, h=18):
    """Stockinette 'V' stitch tile: two slanted leaves per stitch, low contrast."""
    return f'''<pattern id="{pid}" width="{w}" height="{h}" patternUnits="userSpaceOnUse">
  <rect width="{w}" height="{h}" fill="{base}"/>
  <ellipse cx="{w*0.29:.1f}" cy="{h*0.5:.1f}" rx="{w*0.2:.1f}" ry="{h*0.44:.1f}" transform="rotate(-30 {w*0.29:.1f} {h*0.5:.1f})" fill="{hi}" stroke="{lo}" stroke-width="1.1"/>
  <ellipse cx="{w*0.71:.1f}" cy="{h*0.5:.1f}" rx="{w*0.2:.1f}" ry="{h*0.44:.1f}" transform="rotate(30 {w*0.71:.1f} {h*0.5:.1f})" fill="{hi}" stroke="{lo}" stroke-width="1.1"/>
</pattern>'''


def overlay_knit(pid, w=20, h=18, op_hi=0.10, op_lo=0.10):
    """Transparent knit overlay so it can sit on top of gradients."""
    return f'''<pattern id="{pid}" width="{w}" height="{h}" patternUnits="userSpaceOnUse">
  <ellipse cx="{w*0.29:.1f}" cy="{h*0.5:.1f}" rx="{w*0.2:.1f}" ry="{h*0.44:.1f}" transform="rotate(-30 {w*0.29:.1f} {h*0.5:.1f})" fill="rgba(255,255,255,{op_hi})" stroke="rgba(0,0,0,{op_lo})" stroke-width="1.2"/>
  <ellipse cx="{w*0.71:.1f}" cy="{h*0.5:.1f}" rx="{w*0.2:.1f}" ry="{h*0.44:.1f}" transform="rotate(30 {w*0.71:.1f} {h*0.5:.1f})" fill="rgba(255,255,255,{op_hi})" stroke="rgba(0,0,0,{op_lo})" stroke-width="1.2"/>
</pattern>'''


def svg_doc(defs, body, title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<title>{title}</title>
<defs>
{defs}
</defs>
{body}
</svg>
'''


def bg_cream(ring_r, ring_color=RED, ring_w=None):
    defs = knit_pattern('knitBg', CREAM, '#fff9ee', 'rgba(150,110,60,0.09)') + f'''
<radialGradient id="bgVig" cx="50%" cy="45%" r="65%">
  <stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#8a5a2a" stop-opacity="0.16"/>
</radialGradient>'''
    body = f'''<rect width="512" height="512" fill="url(#knitBg)"/>
<rect width="512" height="512" fill="url(#bgVig)"/>
<circle cx="256" cy="256" r="{ring_r}" fill="none" stroke="{ring_color}" stroke-width="{ring_w or ring_r*0.045:.1f}" stroke-dasharray="{ring_r*0.1:.1f} {ring_r*0.075:.1f}" stroke-linecap="round" opacity="0.92"/>'''
    return defs, body


# ----------------------------------------------------------------------------- A: bauble
def option_a(mask, fav=False):
    # mask: art inside the 80 % safe zone; fav: no ring, bauble fills the frame, minimal detail
    s = 1.18 if fav else (0.93 if mask else 1.0)
    ring_r = 200 if mask else 232
    dbg, bbg = bg_cream(ring_r, ring_w=12 if mask else 12)
    if fav:
        bbg = bbg[:bbg.index('<circle')]
    defs = dbg + overlay_knit('knitRed', 22, 20, 0.08, 0.10) + overlay_knit('knitBand', 22, 20, 0.35, 0.10) + f'''
<radialGradient id="ballG" cx="36%" cy="30%" r="75%">
  <stop offset="0" stop-color="#ef6a5f"/><stop offset="0.45" stop-color="{RED}"/><stop offset="1" stop-color="#7a1d1c"/>
</radialGradient>
<linearGradient id="bandG" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ead6b3"/>
</linearGradient>
<linearGradient id="capG" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="{GOLD_DARK}"/><stop offset="0.35" stop-color="{GOLD_LIGHT}"/><stop offset="1" stop-color="{GOLD_DARK}"/>
</linearGradient>
<clipPath id="ballClip"><circle cx="256" cy="292" r="146"/></clipPath>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>'''
    # zig-zag fair-isle motif on the band
    zz = ' '.join(f'L{110 + i * 22},{(270 if i % 2 else 300)}' for i in range(15))
    art = f'''
<g transform="translate(256 {270 if fav else 262}) scale({s}) translate(-256 -262)">
  <ellipse cx="256" cy="452" rx="120" ry="16" fill="#6b4022" opacity="0.18" filter="url(#soft)"/>
  <!-- hanger loop + cap -->
  <circle cx="256" cy="104" r="20" fill="none" stroke="{GOLD_DARK}" stroke-width="13"/>
  <circle cx="256" cy="102" r="20" fill="none" stroke="{GOLD}" stroke-width="10"/>
  <circle cx="256" cy="302" r="146" fill="#c9a77a"/>
  <!-- body -->
  <circle cx="256" cy="292" r="146" fill="url(#ballG)"/>
  <g clip-path="url(#ballClip)">
    <rect x="100" y="140" width="320" height="310" fill="url(#knitRed)"/>
    <!-- knitted band -->
    <rect x="100" y="250" width="320" height="72" fill="url(#bandG)"/>
    <rect x="100" y="250" width="320" height="72" fill="url(#knitBand)" opacity="0.6"/>
    <path d="M100,300 {zz}" fill="none" stroke="{RED}" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="100" y="322" width="320" height="7" fill="#5a1514" opacity="0.35"/>
    <!-- cream running stitches either side of the band -->
    <line x1="100" y1="236" x2="420" y2="236" stroke="{CREAM}" stroke-width="7" stroke-dasharray="16 12" stroke-linecap="round"/>
    <line x1="100" y1="344" x2="420" y2="344" stroke="{CREAM}" stroke-width="7" stroke-dasharray="16 12" stroke-linecap="round"/>
    <!-- felt rim shading -->
    <circle cx="256" cy="292" r="146" fill="none" stroke="#5a1514" stroke-width="10" opacity="0.25"/>
  </g>
  <!-- shine -->
  <ellipse cx="196" cy="200" rx="40" ry="22" transform="rotate(-38 196 200)" fill="#fff" opacity="0.55"/>
  <circle cx="160" cy="246" r="9" fill="#fff" opacity="0.45"/>
  <!-- cap -->
  <rect x="216" y="128" width="80" height="40" rx="9" fill="url(#capG)" stroke="{GOLD_DARK}" stroke-width="4"/>
  <path d="M232,134 v28 M248,134 v28 M264,134 v28 M280,134 v28" stroke="{GOLD_DARK}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
</g>'''
    return svg_doc(defs, bbg + art, 'Tinselby - knitted bauble')


OPTIONS = {'a': option_a}  # B and C are built by separate scripts in b/ and c/


def render(page, svg_path, out, size):
    html = f'''<html><body style="margin:0;background:#000">
<img src="{os.path.basename(svg_path)}" style="display:block;width:{size}px;height:{size}px"></body></html>'''
    tmp = os.path.join(os.path.dirname(svg_path), '.render.html')
    open(tmp, 'w').write(html)
    page.set_viewport_size({'width': size, 'height': size})
    page.goto('file://' + tmp)
    page.wait_for_function('document.images[0].complete && document.images[0].naturalWidth > 0')
    page.screenshot(path=out, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
    os.remove(tmp)


def build():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--allow-file-access-from-files'])
        pg = b.new_page(device_scale_factor=1)
        for k, fn in OPTIONS.items():
            d = os.path.join(HERE, k)
            os.makedirs(d, exist_ok=True)
            full, mask = os.path.join(d, 'icon.svg'), os.path.join(d, 'icon-maskable.svg')
            open(full, 'w').write(fn(False))
            open(mask, 'w').write(fn(True))
            render(pg, full, os.path.join(d, 'icon-512.png'), 512)
            render(pg, full, os.path.join(d, 'icon-192.png'), 192)
            render(pg, full, os.path.join(d, 'apple-touch-icon.png'), 180)
            fav = os.path.join(d, 'favicon.svg')
            open(fav, 'w').write(fn(False, fav=True))
            render(pg, fav, os.path.join(d, 'favicon-32.png'), 32)
            render(pg, mask, os.path.join(d, 'icon-maskable-512.png'), 512)
            print('built', k)
        b.close()


if __name__ == '__main__':
    build()
