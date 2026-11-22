#!/usr/bin/env python3
"""Tinselby app icon - OPTION B "Stitched tree".

Hand-written SVG: a green felt tree (3 stacked rounded tiers) with a cream stitched garland,
gold felt star and red felt baubles, on cream knit with the game's red dashed stitch ring.
Writes into this folder:
  b.svg (full-bleed), b-maskable.svg (art in the 80 % safe zone), b-favicon.svg (simplified),
  icon-512.png, icon-192.png, icon-maskable-512.png, apple-touch-icon.png (180), favicon-32.png,
  check.png (self-check sheet: sizes, circle/squircle masks, dark busy wallpaper)
Run:  python3 design/icons/b/build_b.py
"""
import os, math
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))

# Game palette (src/core/theme.css) + felt shades
CREAM, CREAM2 = '#fff4e2', '#f3e3c6'
RED, RED_DARK, RED_LIGHT = '#b8302d', '#8b2523', '#e0574e'
GREEN, GREEN_DARK, GREEN_DEEP, GREEN_LIGHT = '#3f6e45', '#2c5233', '#1f3d25', '#4f8655'
GOLD, GOLD_DARK, GOLD_LIGHT = '#e3aa3a', '#a8701a', '#f7cd62'
BROWN, BROWN_DARK = '#7a4a2c', '#5a3420'
INK = '#3a2a24'


def star_pts(cx, cy, ro, ri, n=5):
    pts = []
    for i in range(n * 2):
        r = ro if i % 2 == 0 else ri
        a = math.radians(-90 + i * 180 / n)
        pts.append(f'{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}')
    return ' '.join(pts)


def tier_path(apex_y, base_y, hw, cx=256, sag=16, bulge=10):
    """Rounded felt tier: slightly convex sides, gently sagging scalloped bottom.
    Corners get rounded by a same-colour round-join stroke where it's drawn."""
    lx, rx = cx - hw, cx + hw
    # sides: quadratic with outward bulge
    mlx, mly = (cx + lx) / 2 - bulge, (apex_y + base_y) / 2
    mrx = (cx + rx) / 2 + bulge
    # bottom: three soft scallops
    w3 = (rx - lx) / 3
    b = base_y
    d = (f'M{cx},{apex_y} Q{mrx:.1f},{mly:.1f} {rx},{b} '
         f'Q{rx - w3 / 2:.1f},{b + sag} {rx - w3:.1f},{b} '
         f'Q{cx:.1f},{b + sag} {lx + w3:.1f},{b} '
         f'Q{lx + w3 / 2:.1f},{b + sag} {lx},{b} '
         f'Q{mlx:.1f},{mly:.1f} {cx},{apex_y} Z')
    return d


def knit_tile(pid, w, h, hi, lo, sw=1.2):
    """Stockinette V-stitch overlay tile (transparent, low contrast)."""
    return f'''<pattern id="{pid}" width="{w}" height="{h}" patternUnits="userSpaceOnUse">
  <ellipse cx="{w*0.29:.2f}" cy="{h*0.5:.2f}" rx="{w*0.19:.2f}" ry="{h*0.43:.2f}" transform="rotate(-28 {w*0.29:.2f} {h*0.5:.2f})" fill="{hi}" stroke="{lo}" stroke-width="{sw}"/>
  <ellipse cx="{w*0.71:.2f}" cy="{h*0.5:.2f}" rx="{w*0.19:.2f}" ry="{h*0.43:.2f}" transform="rotate(28 {w*0.71:.2f} {h*0.5:.2f})" fill="{hi}" stroke="{lo}" stroke-width="{sw}"/>
</pattern>'''


TIERS = [(236, 382, 150), (176, 304, 116), (124, 230, 82)]  # bottom, mid, top: (apex_y, base_y, half_width)
SW = 26  # same-colour round-join stroke that rounds the tier corners


def hem_path(base_y, hw, cx=256, sag=16, up=15, inset=18):
    """Scalloped running-stitch line following a tier's bottom edge, lifted inside the felt."""
    lx, rx = cx - hw + inset, cx + hw - inset
    w3 = (2 * hw) / 3
    b = base_y - up
    return (f'M{lx},{b} Q{cx - hw + w3 / 2:.1f},{b + sag} {cx - hw + w3:.1f},{b} '
            f'Q{cx},{b + sag} {cx + hw - w3:.1f},{b} Q{cx + hw - w3 / 2:.1f},{b + sag} {rx},{b}')


# per tier: garland swag (drawn under the tier above, masked to its own tier) and baubles hung on it
SWAGS = [
    ('M118,334 Q262,342 408,380', 16),   # bottom: diagonal, up-left to down-right
    ('M150,258 Q262,270 382,304', 15),   # mid
    ('M176,170 Q262,184 344,218', 13),   # top
]
BAUBLES = [
    [(194, 364, 19, 'r'), (296, 373, 13, 'g')],
    [(204, 290, 18, 'r'), (300, 297, 12, 'g')],
    [(232, 206, 16, 'r')],
]
GARLAND = os.environ.get('GARLAND', 'solid')
HEM = os.environ.get('HEM', '0') == '1'


def tree_art(simple=False):
    """Tree drawn in 512 space, roughly centred on (256, 262)."""
    out = []
    out.append('<ellipse cx="256" cy="432" rx="136" ry="13" fill="#7a4c22" opacity="0.16"/>')
    out.append(f'<rect x="226" y="372" width="60" height="58" rx="10" fill="{BROWN}"/>')
    out.append(f'<rect x="226" y="372" width="60" height="22" fill="{BROWN_DARK}" opacity="0.6"/>')
    if not simple:
        out.append('<path d="M244,404 v14 M268,404 v14" stroke="#a8724a" stroke-width="5" stroke-linecap="round"/>')

    for i, (ay, by, hw) in enumerate(TIERS):
        d = tier_path(ay, by, hw)
        out.append(f'<path d="{d}" transform="translate(0 10)" fill="{GREEN_DEEP}" stroke="{GREEN_DEEP}" stroke-width="{SW}" stroke-linejoin="round"/>')
        out.append(f'<path d="{d}" fill="{GREEN}" stroke="{GREEN}" stroke-width="{SW}" stroke-linejoin="round"/>')
        out.append(f'<g mask="url(#tierMask{i})">')
        if not simple:
            out.append('<rect width="512" height="512" fill="url(#knitGreen)"/>')
            out.append(f'<rect x="{256-hw-20}" y="{ay-20}" width="{2*hw+40}" height="{by-ay+50}" fill="url(#tierLight)"/>')
        if not simple and HEM:
            out.append(f'<path d="{hem_path(by, hw)}" fill="none" stroke="{CREAM}" stroke-opacity="0.6" stroke-width="4.5" stroke-dasharray="12 9" stroke-linecap="round"/>')
        path, w = SWAGS[i]
        out.append(f'<path d="{path}" fill="none" stroke="{GREEN_DEEP}" stroke-opacity="0.45" stroke-width="{w}" stroke-linecap="round" transform="translate(0 6)"/>')
        dash = ' stroke-dasharray="22 11"' if GARLAND == 'dash' else ''
        out.append(f'<path d="{path}" fill="none" stroke="{CREAM}" stroke-width="{w}" stroke-linecap="round"{dash}/>')
        if not simple and GARLAND == 'solid':
            out.append(f'<path d="{path}" fill="none" stroke="#e6cfa8" stroke-width="{w*0.28:.1f}" stroke-linecap="round" transform="translate(0 {w*0.3:.1f})"/>')
            out.append(f'<path d="{path}" fill="none" stroke="#b8935c" stroke-opacity="0.9" stroke-width="3" stroke-dasharray="8 7" stroke-linecap="round" transform="translate(0 -1)"/>')
        out.append('</g>')
        for x, y, r, c in BAUBLES[i]:
            fill, dark = (RED, RED_DARK) if c == 'r' else (GOLD, GOLD_DARK)
            out.append(f'<circle cx="{x}" cy="{y+4}" r="{r}" fill="{GREEN_DEEP}" opacity="0.5"/>')
            out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{dark}" stroke-width="3.5"/>')
            out.append(f'<circle cx="{x - r*0.36:.1f}" cy="{y - r*0.38:.1f}" r="{r*0.3:.1f}" fill="#fff" opacity="0.8"/>')

    # star: gold felt with a dark-gold rim so it separates from the cream background
    pts = star_pts(256, 106, 56, 25)
    out.append(f'<polygon points="{pts}" transform="translate(0 7)" fill="{GREEN_DEEP}" opacity="0.35" stroke="{GREEN_DEEP}" stroke-width="14" stroke-linejoin="round"/>')
    out.append(f'<polygon points="{pts}" fill="{GOLD_DARK}" stroke="{GOLD_DARK}" stroke-width="17" stroke-linejoin="round"/>')
    out.append(f'<polygon points="{pts}" fill="{GOLD}" stroke="{GOLD}" stroke-width="6" stroke-linejoin="round"/>')
    if not simple:
        out.append(f'<polygon points="{pts}" fill="url(#starLight)" stroke="none"/>')
        out.append(f'<polygon points="{star_pts(256, 108, 35, 16)}" fill="none" stroke="{CREAM}" stroke-opacity="0.85" stroke-width="3.5" stroke-dasharray="7 6" stroke-linecap="round" stroke-linejoin="round"/>')
    return '\n'.join(out), TIERS, SW


def defs_common(tiers, sw):
    masks = ''.join(f'<mask id="tierMask{i}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">'
                    f'<path d="{tier_path(*t)}" fill="#fff" stroke="#fff" stroke-width="{sw}" stroke-linejoin="round"/></mask>'
                    for i, t in enumerate(tiers))
    return (knit_tile('knitBg', 22, 19, 'rgba(255,255,255,0.55)', 'rgba(140,96,50,0.10)')
            + knit_tile('knitGreen', 16, 14, 'rgba(255,255,255,0.05)', 'rgba(10,30,15,0.16)', 1.0)
            + f'''
<radialGradient id="bgVig" cx="50%" cy="44%" r="70%">
  <stop offset="0.55" stop-color="#8a5a2a" stop-opacity="0"/><stop offset="1" stop-color="#8a5a2a" stop-opacity="0.20"/>
</radialGradient>
<linearGradient id="tierLight" x1="0" y1="0" x2="1" y2="0.3">
  <stop offset="0" stop-color="{GREEN_LIGHT}" stop-opacity="0.75"/><stop offset="0.5" stop-color="{GREEN_LIGHT}" stop-opacity="0"/>
  <stop offset="1" stop-color="{GREEN_DARK}" stop-opacity="0.35"/>
</linearGradient>
{masks}
<linearGradient id="starLight" x1="0" y1="0" x2="0.6" y2="1">
  <stop offset="0" stop-color="{GOLD_LIGHT}" stop-opacity="0.9"/><stop offset="0.55" stop-color="{GOLD_LIGHT}" stop-opacity="0"/>
</linearGradient>''')


def background(ring_r, ring_w, texture=True):
    s = f'<rect width="512" height="512" fill="{CREAM}"/>'
    if texture:
        s += '<rect width="512" height="512" fill="url(#knitBg)"/>'
    s += '<rect width="512" height="512" fill="url(#bgVig)"/>'
    if ring_r:
        circ = 2 * math.pi * ring_r
        n = 30
        seg = circ / n
        s += (f'<circle cx="256" cy="256" r="{ring_r}" fill="none" stroke="{RED}" stroke-width="{ring_w}" '
              f'stroke-dasharray="{seg*0.6:.2f} {seg*0.4:.2f}" stroke-linecap="round" transform="rotate(-90 256 256)"/>')
    return s


def build_svg(kind):
    simple = kind == 'favicon'
    art, tiers, sw = tree_art(simple)
    defs = defs_common(tiers, sw)
    if kind == 'full':
        bg, scale, dy = background(230, 11), 1.0, 6
    elif kind == 'mask':
        bg, scale, dy = background(188, 10), 0.80, 5
    else:  # favicon: bigger tree, no texture, no dashes (they'd be mush at 32 px)
        bg, scale, dy = background(0, 0, texture=False), 1.12, 0
    cy = 262
    body = f'{bg}\n<g transform="translate(256 {cy + dy}) scale({scale}) translate(-256 -{cy})">\n{art}\n</g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<title>Tinselby - stitched tree</title>
<defs>{defs}</defs>
{body}
</svg>
'''


def render(page, svg_text, out, size):
    page.set_viewport_size({'width': size, 'height': size})
    sized = svg_text.replace('width="512" height="512"', f'width="{size}" height="{size}"', 1)  # root only
    page.set_content(f'<html><body style="margin:0;background:#fff">'
                     f'<div style="width:{size}px;height:{size}px">{sized}</div></body></html>')
    page.screenshot(path=out, clip={'x': 0, 'y': 0, 'width': size, 'height': size})


def check_sheet(page):
    """Self-check: 512, 192, 48 dp (1x + 3x), circle / squircle masks, maskable crop, dark busy wallpaper."""
    def uri(name):
        return 'file://' + os.path.join(HERE, name)
    i512, imask, ifav = uri('icon-512.png'), uri('icon-maskable-512.png'), uri('favicon-32.png')
    sq = "path('M24,0 C6,0 0,6 0,24 L0,24 C0,42 6,48 24,48 C42,48 48,42 48,24 C48,6 42,0 24,0 Z')"
    def cell(src, size, shape, extra=''):
        r = {'circle': '50%', 'square': '0', 'round': '22%', 'squircle': '30%'}[shape]
        return f'<img src="{src}" style="width:{size}px;height:{size}px;border-radius:{r};{extra}">'
    wall = ('background: radial-gradient(circle at 20% 30%, #3b5bdb 0, transparent 30%),'
            'radial-gradient(circle at 80% 20%, #e8590c 0, transparent 25%),'
            'radial-gradient(circle at 60% 80%, #2b8a3e 0, transparent 30%),'
            'radial-gradient(circle at 30% 85%, #862e9c 0, transparent 25%), #101423;')
    row48 = ''.join(f'<div style="display:flex;flex-direction:column;align-items:center;gap:4px">{cell(s, 48, sh)}'
                    f'<span style="font:10px sans-serif;color:#ddd">{lab}</span></div>'
                    for s, sh, lab in [(imask, 'circle', 'mask circle'), (imask, 'squircle', 'mask squircle'),
                                       (imask, 'round', 'mask rounded'), (i512, 'circle', 'any circle'),
                                       (i512, 'round', 'any rounded'), (i512, 'square', 'any square')])
    # fake app grid neighbours to judge legibility on a busy home screen
    neigh = ''.join(f'<div style="width:48px;height:48px;border-radius:50%;background:{c}"></div>' for c in ['#1a73e8', '#34a853', '#ea4335'])
    html = f'''<html><body style="margin:0;background:#1d1d24;font-family:sans-serif;color:#eee">
<div style="display:flex;gap:24px;padding:20px;align-items:flex-start">
  <div><div style="font:12px sans-serif;margin-bottom:6px">icon-512 (any)</div>{cell(i512, 512, 'square')}</div>
  <div style="display:flex;flex-direction:column;gap:18px">
    <div><div style="font:12px sans-serif;margin-bottom:6px">maskable 512 in circle (safe zone)</div>{cell(imask, 240, 'circle')}</div>
    <div><div style="font:12px sans-serif;margin-bottom:6px">maskable in squircle / any 192</div>
      <div style="display:flex;gap:12px">{cell(imask, 160, 'squircle')}{cell(uri('icon-192.png'), 192, 'square')}</div></div>
  </div>
  <div style="display:flex;flex-direction:column;gap:18px">
    <div style="padding:18px;border-radius:16px;{wall}">
      <div style="font:12px sans-serif;margin-bottom:10px">48 dp on busy dark wallpaper (1x)</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;width:420px">{row48}</div>
      <div style="display:flex;gap:22px;margin-top:14px;align-items:center">{neigh}{cell(imask, 48, 'circle')}{neigh}</div>
    </div>
    <div style="padding:18px;border-radius:16px;{wall}">
      <div style="font:12px sans-serif;margin-bottom:10px">48 px, zoomed 3x (pixelated) - circle / squircle / favicon-32 at 1x + 4x</div>
      <div style="display:flex;gap:16px;align-items:center">
        <div style="width:144px;height:144px;border-radius:50%;overflow:hidden">{cell(imask, 48, 'square', 'transform:scale(3);transform-origin:0 0;image-rendering:pixelated')}</div>
        <div style="width:144px;height:144px;border-radius:30%;overflow:hidden">{cell(i512, 48, 'square', 'transform:scale(3);transform-origin:0 0;image-rendering:pixelated')}</div>
        {cell(ifav, 32, 'square')}
        <div style="width:128px;height:128px;overflow:hidden">{cell(ifav, 32, 'square', 'transform:scale(4);transform-origin:0 0;image-rendering:pixelated')}</div>
      </div>
    </div>
  </div>
</div></body></html>'''
    tmp = os.path.join(HERE, '.check.html')
    open(tmp, 'w').write(html)
    page.set_viewport_size({'width': 1260, 'height': 560})
    page.goto('file://' + tmp)
    page.wait_for_load_state('load')
    page.screenshot(path=os.path.join(HERE, 'check.png'), full_page=True)
    os.remove(tmp)


def main():
    full, mask, fav = build_svg('full'), build_svg('mask'), build_svg('favicon')
    open(os.path.join(HERE, 'b.svg'), 'w').write(full)
    open(os.path.join(HERE, 'b-maskable.svg'), 'w').write(mask)
    open(os.path.join(HERE, 'b-favicon.svg'), 'w').write(fav)
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--allow-file-access-from-files'])
        pg = br.new_page(device_scale_factor=1)
        render(pg, full, os.path.join(HERE, 'icon-512.png'), 512)
        render(pg, full, os.path.join(HERE, 'icon-192.png'), 192)
        render(pg, full, os.path.join(HERE, 'apple-touch-icon.png'), 180)
        render(pg, mask, os.path.join(HERE, 'icon-maskable-512.png'), 512)
        render(pg, fav, os.path.join(HERE, 'favicon-32.png'), 32)
        check_sheet(pg)
        br.close()
    print('built option B')


if __name__ == '__main__':
    main()
