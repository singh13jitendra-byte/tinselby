#!/usr/bin/env python3
"""Tinselby app icon - OPTION C "Knit T".

A chunky rounded red-felt "T" with cream running stitch, a gold felt star tucked at its
top-right, on a deep-green knitted background ringed by a cream dashed stitch (like the
game's round buttons). Everything is drawn as SVG paths (no font needed).

Writes into this folder:
  c.svg                  full-bleed master (purpose "any")
  c-maskable.svg         art inside the central 80 % safe zone
  c-favicon.svg          simplified art for tiny sizes
  icon.svg, icon-maskable.svg   copies of c.svg / c-maskable.svg (same naming as options a/b)
  icon-512.png, icon-192.png, icon-maskable-512.png, apple-touch-icon.png (180), favicon-32.png
  check.png              review sheet (512, 192, 48, circle/squircle masks, dark wallpaper, tabs)
Run:  python3 design/icons/c/build_c.py
"""
import os, math, base64
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))

CREAM, CREAM2 = '#fff4e2', '#f3e3c6'
RED, RED_DARK = '#b8302d', '#8b2523'
GREEN, GREEN_DARK, GREEN_DEEP = '#3f6e45', '#2b5132', '#1f3d26'
GOLD, GOLD_DARK, GOLD_LIGHT = '#e3aa3a', '#b9801f', '#ffd36e'


# ------------------------------------------------------------------ geometry
def t_path(d=0.0):
    """Rounded chunky T outline; d > 0 insets the shape (exact offset for this geometry)."""
    L, R, T, B = 112 + d, 400 - d, 118 + d, 208 - d          # crossbar
    sl, sr, sb = 210 + d, 302 - d, 404 - d                   # stem
    r, r2, f = 36 - d, 42 - d, 22 + d                        # bar corner, stem foot, inner fillet
    return (f'M{L},{T + r} A{r},{r} 0 0 1 {L + r},{T} H{R - r} A{r},{r} 0 0 1 {R},{T + r} '
            f'V{B - r} A{r},{r} 0 0 1 {R - r},{B} H{sr + f} A{f},{f} 0 0 0 {sr},{B + f} '
            f'V{sb - r2} A{r2},{r2} 0 0 1 {sr - r2},{sb} H{sl + r2} A{r2},{r2} 0 0 1 {sl},{sb - r2} '
            f'V{B + f} A{f},{f} 0 0 0 {sl - f},{B} H{L + r} A{r},{r} 0 0 1 {L},{B - r} Z')


def star_pts(cx, cy, ro, ri, rot=0.0, n=5):
    pts = []
    for i in range(n * 2):
        rr = ro if i % 2 == 0 else ri
        a = math.radians(rot - 90 + i * 180 / n)
        pts.append(f'{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}')
    return 'M' + ' L'.join(pts) + ' Z'


# ------------------------------------------------------------------ pieces
def defs():
    return f'''
<radialGradient id="bgG" cx="50%" cy="42%" r="72%">
  <stop offset="0" stop-color="#4f8a56"/><stop offset="0.55" stop-color="{GREEN}"/><stop offset="1" stop-color="{GREEN_DEEP}"/>
</radialGradient>
<pattern id="knit" width="24" height="20" patternUnits="userSpaceOnUse">
  <path d="M2,1 Q4,13 12,19 Q9,7 2,1 Z" fill="#fff" fill-opacity="0.075"/>
  <path d="M22,1 Q20,13 12,19 Q15,7 22,1 Z" fill="#fff" fill-opacity="0.075"/>
  <path d="M2,1 Q4,13 12,19 M22,1 Q20,13 12,19" fill="none" stroke="#000" stroke-opacity="0.13" stroke-width="1.4"/>
</pattern>
<pattern id="knitRed" width="18" height="15" patternUnits="userSpaceOnUse">
  <path d="M1.5,1 Q3,10 9,14 Q6.8,5 1.5,1 Z M16.5,1 Q15,10 9,14 Q11.2,5 16.5,1 Z" fill="#fff" fill-opacity="0.10"/>
  <path d="M1.5,1 Q3,10 9,14 M16.5,1 Q15,10 9,14" fill="none" stroke="#3a0c0b" stroke-opacity="0.16" stroke-width="1.1"/>
</pattern>
<linearGradient id="redG" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#e2504a"/><stop offset="0.55" stop-color="#c83a35"/><stop offset="1" stop-color="#a3262a"/>
</linearGradient>
<linearGradient id="goldG" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{GOLD_LIGHT}"/><stop offset="1" stop-color="{GOLD}"/>
</linearGradient>
<clipPath id="tClip"><path d="{t_path()}"/></clipPath>
<radialGradient id="vig" cx="50%" cy="50%" r="71%">
  <stop offset="0.75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/>
</radialGradient>'''


def background(ring_r, ring_w, dash, gap):
    return f'''
<rect width="512" height="512" fill="url(#bgG)"/>
<rect width="512" height="512" fill="url(#knit)"/>
<rect width="512" height="512" fill="url(#vig)"/>
<circle cx="256" cy="256" r="{ring_r}" fill="none" stroke="{CREAM}" stroke-width="{ring_w}"
        stroke-dasharray="{dash} {gap}" stroke-linecap="round" opacity="0.92"/>'''


def letter_t(stitch=True, texture=True, edge=13):
    """Felt T: hard drop shadow, cream felt backing edge, red felt, cream running stitch."""
    tp = t_path()
    tex = f'<rect x="100" y="100" width="320" height="320" fill="url(#knitRed)" clip-path="url(#tClip)"/>' if texture else ''
    st = (f'<path d="{t_path(17)}" fill="none" stroke="{CREAM}" stroke-width="6" stroke-linecap="round" '
          f'stroke-linejoin="round" stroke-dasharray="15 11" opacity="0.95"/>') if stitch else ''
    return f'''
<path d="{tp}" transform="translate(0 12)" fill="#10261a" fill-opacity="0.55" stroke="#10261a" stroke-opacity="0.55"
      stroke-width="{edge * 2}" stroke-linejoin="round"/>
<path d="{tp}" transform="translate(0 5)" fill="#d8bf93" stroke="#d8bf93" stroke-width="{edge * 2}" stroke-linejoin="round"/>
<path d="{tp}" fill="{CREAM}" stroke="{CREAM}" stroke-width="{edge * 2}" stroke-linejoin="round"/>
<path d="{tp}" fill="url(#redG)"/>
{tex}
<path d="{tp}" fill="none" stroke="#6e1a19" stroke-opacity="0.35" stroke-width="7" clip-path="url(#tClip)" transform="translate(0 -3)"/>
{st}'''


def star(cx=384, cy=126, ro=64, ri=30, rot=14, stitch=True):
    outer = star_pts(cx, cy, ro, ri, rot)
    inner = star_pts(cx, cy, ro - 24, ri - 11, rot)
    st = (f'<path d="{inner}" fill="none" stroke="#fff6dc" stroke-width="4.5" stroke-dasharray="9 8" '
          f'stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>') if stitch else ''
    return f'''
<path d="{outer}" transform="translate(0 9)" fill="#10261a" fill-opacity="0.5" stroke="#10261a" stroke-opacity="0.5" stroke-width="22" stroke-linejoin="round"/>
<path d="{outer}" fill="{GOLD_DARK}" stroke="{GOLD_DARK}" stroke-width="22" stroke-linejoin="round"/>
<path d="{outer}" fill="url(#goldG)" stroke="url(#goldG)" stroke-width="12" stroke-linejoin="round"/>
{st}'''


def snow(scale):
    dots = [(130, 330, 7), (166, 392, 5), (112, 250, 4.5), (360, 360, 6.5), (398, 300, 4.5), (330, 418, 4.5), (150, 160, 4)]
    return ''.join(f'<circle cx="{256 + (x - 256) * scale:.1f}" cy="{256 + (y - 256) * scale:.1f}" r="{r * scale:.1f}" '
                   f'fill="{CREAM}" opacity="0.75"/>' for x, y, r in dots)


def art(scale, cy_shift=0, stitch=True, texture=True, star_stitch=True):
    # centre of the T+star group is roughly (262, 258); keep it optically centred
    return f'''
<g transform="translate(256 {256 + cy_shift}) scale({scale}) translate(-268 -256)">
{letter_t(stitch, texture)}
{star(stitch=star_stitch)}
</g>'''


def svg(body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">\n'
            f'<title>{title}</title>\n<defs>{defs()}\n</defs>\n{body}\n</svg>\n')


def build_svgs():
    full = svg(background(230, 10, 23, 15) + snow(1.0) + art(0.94), 'Tinselby - Knit T')
    mask = svg(background(196, 9, 20, 13) + snow(0.84) + art(0.775), 'Tinselby - Knit T (maskable)')
    fav = svg(f'<rect width="512" height="512" rx="112" fill="url(#bgG)"/>'
              + art(1.02, 4, stitch=False, texture=False, star_stitch=False), 'Tinselby - Knit T (favicon)')
    return full, mask, fav


# ------------------------------------------------------------------ render
def data_url(s):
    return 'data:image/svg+xml;base64,' + base64.b64encode(s.encode()).decode()


def render(page, svg_text, size, out):
    page.set_viewport_size({'width': size, 'height': size})
    page.set_content(f'<html><body style="margin:0;background:transparent">'
                     f'<img src="{data_url(svg_text)}" width="{size}" height="{size}" style="display:block"></body></html>')
    page.wait_for_timeout(60)
    page.screenshot(path=out, omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})


def check_sheet(page, full, mask, fav):
    f, m, v = data_url(full), data_url(mask), data_url(fav)
    p = lambda n: 'data:image/png;base64,' + base64.b64encode(open(os.path.join(HERE, n), 'rb').read()).decode()
    i512, i192, im, ifav = p('icon-512.png'), p('icon-192.png'), p('icon-maskable-512.png'), p('favicon-32.png')
    wall = ('background: radial-gradient(circle at 20% 30%, #6a3d7a 0, transparent 40%),'
            'radial-gradient(circle at 80% 70%, #1d4d6b 0, transparent 45%),'
            'radial-gradient(circle at 60% 20%, #7a5a2a 0, transparent 30%),'
            'repeating-linear-gradient(45deg,#15151d 0 6px,#20202b 6px 12px), #111;')
    def cell(src, size, shape, label):
        rad = {'sq': '0', 'circle': '50%', 'squircle': '28%', 'rr': '18%'}[shape]
        return (f'<div class="cell"><img src="{src}" style="width:{size}px;height:{size}px;border-radius:{rad}">'
                f'<span>{label}</span></div>')
    html = f'''<html><head><style>
 body{{margin:0;font:600 14px system-ui;color:#eee;background:#1a1a22;width:1400px}}
 .row{{display:flex;gap:28px;align-items:flex-end;padding:22px 28px}}
 .cell{{display:flex;flex-direction:column;align-items:center;gap:8px}}
 .cell img{{display:block;image-rendering:auto}}
 .wall{{{wall}}}
 .pix img{{image-rendering:pixelated}}
 .tab{{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px 10px 0 0;font:500 13px system-ui}}
 h3{{margin:0;padding:16px 28px 0;font:700 15px system-ui;color:#ffd36e}}
</style></head><body>
<h3>Option C "Knit T" - masters</h3>
<div class="row">{cell(i512, 512, 'sq', 'icon-512 (any)')}{cell(im, 360, 'sq', 'maskable-512 (80% zone dashed)')}
 <div class="cell" style="position:relative"><span></span></div></div>
<h3>Launcher masks on busy dark wallpaper (maskable art) - 192 / 96 / 48 px</h3>
<div class="row wall">{cell(im, 192, 'circle', 'circle 192')}{cell(im, 192, 'squircle', 'squircle 192')}{cell(im, 192, 'rr', 'rounded 192')}
 {cell(im, 96, 'circle', 'circle 96')}{cell(im, 96, 'squircle', 'squircle 96')}
 {cell(im, 48, 'circle', '48')}{cell(im, 48, 'squircle', '48')}{cell(i192, 48, 'circle', 'any@48 circle')}{cell(i192, 48, 'rr', 'any@48 rr')}</div>
<h3>48 px rendered then magnified 4x (pixel check)</h3>
<div class="row wall pix" id="pix"></div>
<h3>Favicon 32 in browser tabs + apple-touch 180</h3>
<div class="row">
 <div class="tab" style="background:#fff;color:#222"><img src="{ifav}" width="16" height="16">Tinselby</div>
 <div class="tab" style="background:#35363a;color:#eee"><img src="{ifav}" width="16" height="16">Tinselby</div>
 <div class="tab" style="background:#fff;color:#222"><img src="{ifav}" width="32" height="32">32px</div>
 <div class="tab" style="background:#35363a;color:#eee"><img src="{ifav}" width="32" height="32">32px</div>
 {cell(p('apple-touch-icon.png'), 180, 'squircle', 'apple-touch 180 (iOS mask)')}
 {cell(i192, 120, 'sq', 'icon-192 raw')}
</div>
<script>
 const pix=document.getElementById('pix');
 for (const [src,shape] of [['{im}','50%'],['{im}','28%'],['{i192}','50%'],['{ifav}','0']]) {{
   const img=new Image(); img.onload=()=>{{ const s=shape==='0'?32:48; const c=document.createElement('canvas'); c.width=s;c.height=s;
     const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(img,0,0,s,s);
     const out=new Image(); out.src=c.toDataURL(); out.style.width=(s*4)+'px'; out.style.height=(s*4)+'px'; out.style.borderRadius=shape;
     const d=document.createElement('div'); d.className='cell'; d.appendChild(out); pix.appendChild(d); }}; img.src=src; }}
</script>
</body></html>'''
    # overlay the 80% safe-zone guide on the maskable preview
    html = html.replace("<span>maskable-512 (80% zone dashed)</span>",
                        "<span>maskable-512 (80% zone dashed)</span>")
    page.set_viewport_size({'width': 1400, 'height': 900})
    page.set_content(html)
    page.evaluate('''() => { const imgs=[...document.images]; const m=imgs[1]; const w=m.parentElement; w.style.position='relative';
      const g=document.createElement('div'); g.style.cssText='position:absolute;left:0;top:0;width:360px;height:360px;pointer-events:none';
      g.innerHTML='<svg width="360" height="360"><circle cx="180" cy="180" r="144" fill="none" stroke="#0ff" stroke-width="1.5" stroke-dasharray="6 5"/></svg>';
      w.appendChild(g); }''')
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(HERE, 'check.png'), full_page=True)


def main():
    full, mask, fav = build_svgs()
    for name, s in (('c.svg', full), ('c-maskable.svg', mask), ('c-favicon.svg', fav),
                    ('icon.svg', full), ('icon-maskable.svg', mask)):  # icon*.svg mirror options a/b naming
        open(os.path.join(HERE, name), 'w').write(s)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        page = b.new_page(device_scale_factor=1)
        render(page, full, 512, os.path.join(HERE, 'icon-512.png'))
        render(page, full, 192, os.path.join(HERE, 'icon-192.png'))
        render(page, mask, 512, os.path.join(HERE, 'icon-maskable-512.png'))
        render(page, full, 180, os.path.join(HERE, 'apple-touch-icon.png'))
        render(page, fav, 32, os.path.join(HERE, 'favicon-32.png'))
        # full-bleed icons carry no transparency: flatten to RGB (apple-touch must be opaque)
        from PIL import Image
        for n in ('icon-512.png', 'icon-192.png', 'icon-maskable-512.png', 'apple-touch-icon.png'):
            fp = os.path.join(HERE, n)
            im = Image.open(fp).convert('RGBA')
            assert im.getextrema()[3][0] == 255, n + ' has transparent pixels'
            # 256-colour palette + dither: visually identical, ~55 % smaller
            im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT,
                                       dither=Image.Dither.FLOYDSTEINBERG).save(fp, optimize=True)
        check_sheet(page, full, mask, fav)
        b.close()
    print('ok')


if __name__ == '__main__':
    main()
