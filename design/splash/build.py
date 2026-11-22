#!/usr/bin/env python3
"""Builds the Tinselby launch trailer snippet (run: python3 design/splash/build.py).

Writes next to this file:
  trailer.html      readable snippet: exactly one <div id="tb-splash"> followed by one <style>
  trailer.min.html  the same snippet minified -> this is what gets inlined into index.html
  demo.html         standalone demo page (simulated boot; ?reduced emulates reduced motion, ?manual = no script)

Rules this follows:
  * every animated piece is an HTML-level box (div / i / root <svg>) animated with transform/opacity only, so the
    compositor keeps it moving while the main thread is busy parsing/compiling the game bundle;
  * every selector starts with #tb-splash; internal classes use the unused prefix "tq", keyframes "tq*",
    ids "tq*" (the game already uses tbs-* for its social wheel, and short global classes like .l/.r/.on).

Class map: tqg backdrop glow | tqs snow layer (tqf = in front), flakes tq7 far / (none) mid / tq9 near |
  tqm centre stack | tqb badge: tqo glow, tqd disc, tqh ring half (tq1 right, tq2 left) > tqr rotator > tqc clip,
  tqt T, tqx star wrap > tqy star svg, tqz sparkle | tqw wordmark, tql letter (tqv cream), tqu stitch underline,
  tqa tagline | tqp progress foot: tqj track > tqn fill > b sheen, tqi runner > tqe yarn ball | tq3 town:
  tq4 box > tq5 pop-up piece, tq6 ferris wheel, tq8 light (tq0 bauble, tqq round window), tqk drift; tqgd ground.
"""
import math, re, gzip, pathlib

HERE = pathlib.Path(__file__).resolve().parent

def n(v):
    s = f"{v:.1f}".rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

# ------------------------------------------------------------------ badge (art from design/icons/c/c.svg)
T_D = ("M112 154A36 36 0 0 1 148 118H364A36 36 0 0 1 400 154V172A36 36 0 0 1 364 208H324A22 22 0 0 0 302 230"
       "V362A42 42 0 0 1 260 404H252A42 42 0 0 1 210 362V230A22 22 0 0 0 188 208H148A36 36 0 0 1 112 172Z")
T_ST = ("M129 154A19 19 0 0 1 148 135H364A19 19 0 0 1 383 154V172A19 19 0 0 1 364 191H324A39 39 0 0 0 285 230"
        "V362A25 25 0 0 1 260 387H252A25 25 0 0 1 227 362V230A39 39 0 0 0 188 191H148A19 19 0 0 1 129 172Z")
S_D = "M399.5 63.9L407 106.7L447.8 121.5L409.4 141.9L408 185.3L376.7 155.1L335 167.1L354.1 128.1L329.7 92.1L372.8 98.2Z"
S_ST = "M393.7 87.2L398.6 113.8L423.9 123.2L400.1 136.1L399 163.1L379.4 144.4L353.4 151.7L365 127.3L350.1 104.8L376.9 108.4Z"
G = 'transform="matrix(.94 0 0 .94 4.1 15.4)"'  # = translate(256 256) scale(.94) translate(-268 -256)
VB = 'viewBox="0 0 512 512"'

disc = (
    f'<svg class="tqd" {VB}><defs>'
    '<radialGradient id="tqI1" cy=".4" r=".62"><stop offset="0" stop-color="#4f8a56"/>'
    '<stop offset=".6" stop-color="#3f6e45"/><stop offset="1" stop-color="#244a2c"/></radialGradient>'
    '<pattern id="tqI2" width="24" height="20" patternUnits="userSpaceOnUse">'
    '<path d="M2 1Q4 13 12 19Q9 7 2 1ZM22 1Q20 13 12 19Q15 7 22 1Z" fill="#fff" fill-opacity=".08"/>'
    '<path d="M2 1Q4 13 12 19M22 1Q20 13 12 19" fill="none" stroke="#000" stroke-opacity=".13" stroke-width="1.4"/></pattern>'
    '<linearGradient id="tqI3" x2="0" y2="1"><stop offset="0" stop-color="#e2504a"/>'
    '<stop offset=".55" stop-color="#c83a35"/><stop offset="1" stop-color="#a3262a"/></linearGradient>'
    '<linearGradient id="tqI4" x2="0" y2="1"><stop offset="0" stop-color="#ffd36e"/><stop offset="1" stop-color="#e3aa3a"/></linearGradient>'
    f'<path id="tqT" d="{T_D}"/><path id="tqS" d="{S_D}"/></defs>'
    '<circle cx="256" cy="266" r="244" fill="#16301d" opacity=".6"/>'
    '<circle cx="256" cy="256" r="244" fill="url(#tqI1)"/><circle cx="256" cy="256" r="244" fill="url(#tqI2)"/>'
    '<path d="M128 325v.1M364 358v.1M168 392v.1M404 292v.1M150 152v.1M104 248v.1" '
    'stroke="#fff4e2" stroke-opacity=".7" stroke-width="11"/></svg>'
)
# 36 dash periods fit the circle exactly and a gap is centred at 12 and 6 o'clock (the seams of the two half-ring
# reveals), so the half clips never cut through a dash.
RING_R = 222
per = 2 * math.pi * RING_R / 36
dash = per * .62
ring = (f'<svg {VB}><circle cx="256" cy="256" r="{RING_R}" fill="none" stroke="#fff4e2" stroke-width="11" '
        f'stroke-linecap="round" stroke-dasharray="{n(dash)} {n(per - dash)}" stroke-dashoffset="{n(dash + (per - dash) / 2)}"/></svg>')
half = lambda c: f'<div class="tqh {c}"><div class="tqr"><div class="tqc">{ring}</div></div></div>'
t_svg = (
    f'<svg class="tqt" {VB}><g {G} stroke-width="26">'
    '<use href="#tqT" y="12" fill="#10261a" stroke="#10261a" opacity=".55"/>'
    '<use href="#tqT" y="5" fill="#d8bf93" stroke="#d8bf93"/><use href="#tqT" fill="#fff4e2" stroke="#fff4e2"/>'
    '<use href="#tqT" fill="url(#tqI3)" stroke="none"/>'
    f'<path d="{T_ST}" fill="none" stroke="#fff4e2" stroke-width="6" stroke-dasharray="15 11"/></g></svg>'
)
s_svg = (
    f'<div class="tqx"><svg class="tqy" {VB}><g {G} stroke-width="22">'
    '<use href="#tqS" y="9" fill="#10261a" stroke="#10261a" opacity=".5"/><use href="#tqS" fill="#b9801f" stroke="#b9801f"/>'
    '<use href="#tqS" fill="url(#tqI4)" stroke="url(#tqI4)" stroke-width="12"/>'
    f'<path d="{S_ST}" fill="none" stroke="#fff6dc" stroke-width="4.5" stroke-dasharray="9 8"/></g></svg></div>'
)
spark = ('<svg class="tqz" viewBox="-10 -10 20 20"><path d="M0-10Q1-1 10 0Q1 1 0 10Q-1 1-10 0Q-1-1 0-10Z" fill="#fff6dc"/>'
         '<circle r="1.6" fill="#ffd36e"/></svg>')
badge = f'<div class="tqb"><i class="tqo"></i>{disc}{half("tq1")}{half("tq2")}{t_svg}{s_svg}{spark}</div>'

# ------------------------------------------------------------------ wordmark: rounded yarn letters with a stitch line
SW, GAP = 15, 7.5
LET = [  # centreline path, min x, max x
    ('M5 7H41M23 7V53', 5, 41),
    ('M7 7V53', 7, 7),
    ('M6 53V7L38 53V7', 6, 38),
    ('M36 15C33 9 27 7 21 7C13 7 7 11 7 18C7 26 15 28 21 29C28 30 36 33 36 41C36 49 29 53 21 53C14 53 8 50 6 45', 6, 36),
    ('M35 7H8V53H35M8 30H30', 8, 35),
    ('M8 7V53H33', 8, 33),
    ('M8 30V7H22C30 7 34 11 34 18C34 25 30 30 22 30H8V53H24C32 53 37 48 37 41C37 34 32 30 24 30', 8, 37.5),
    ('M5 7L22 30L39 7M22 30V53', 5, 39),
]
ROT = [-3, 2.5, -2, 3, -2.5, 2, -3, 2.5]
WY0, WH = -1, 62
letters, W = [], 0
for i, (d, a, b) in enumerate(LET):
    x0 = a - SW / 2 - GAP / 2
    w = b - a + SW + GAP
    W += w
    cls = 'tql tqv' if i % 2 else 'tql'
    letters.append(f'<svg class="{cls}" style="--i:{i};--r:{ROT[i]}deg" viewBox="{n(x0)} {WY0} {n(w)} {WH}">'
                   f'<path id="tqL{i}" d="{d}"/><use href="#tqL{i}"/></svg>')
wordmark = f'<div class="tqw">{"".join(letters)}</div><i class="tqu"></i>'
WORD_RATIO = f'{WH / W:.4f}'.lstrip('0')

# ------------------------------------------------------------------ pop-up town (viewBox 0 0 360 120; ground at 120)
CR, RD, RDK, GR, GRD, GD, WD, SN, WIN = '#fff4e2', '#b8302d', '#8b2523', '#3f6e45', '#335c3a', '#e3aa3a', '#5a3b2a', '#f3e7d3', '#3b1f22'
tri = lambda cx, top, hw, base: f'M{n(cx)} {n(top)}L{n(cx + hw)} {n(base)}H{n(cx - hw)}Z'
TV = 'viewBox="0 0 360 120"'
gond = ''.join('<path d="' + ''.join(f'M{n(38 * math.cos(k * math.pi / 4))} {n(38 * math.sin(k * math.pi / 4))}h0' for k in (c, c + 4))
               + f'" stroke="{col}" stroke-width="12.4"/>' for c, col in enumerate([RD, GR, CR, GD]))
PIECES = [  # (x of the pop-up hinge in %, inner svg)
    (6.4, f'<path d="{tri(23,67,12,87)}{tri(23,79,16,104)}" fill="{GRD}" stroke="{GRD}" stroke-width="4"/>'
          f'<path d="M23 100V117" stroke="{WD}" stroke-width="6"/>'),
    (24.4, '<path d="M70 117L88 56L106 117M76 96H100" fill="none" stroke="#6b4630" stroke-width="5"/>'),
    (49.4, f'<path d="M195 49V70" stroke="{RDK}" stroke-width="10"/><rect x="150" y="70" width="56" height="50" rx="3" fill="{RD}"/>'
           f'<rect x="154.5" y="75" width="47" height="38" rx="2" fill="none" stroke="{CR}" stroke-opacity=".45" stroke-width="1.4" stroke-dasharray="3.5 3"/>'
           f'<path d="M146 73L178 46L210 73Z" fill="{SN}" stroke="{SN}" stroke-width="7"/>'
           f'<path d="M157 82h12v11h-12zM187 82h12v11h-12z" fill="{WIN}"/><circle cx="178" cy="63" r="4.5" fill="{WIN}"/>'
           '<path d="M178 104V112" stroke="#6b3020" stroke-width="14"/>'),
    (68.3, f'<path d="M246 98V115" stroke="{WD}" stroke-width="10"/>'
           f'<path d="{tri(246,31,15,55)}{tri(246,45,21,78)}{tri(246,63,27,101)}" fill="{GR}" stroke="{GR}" stroke-width="5"/>'
           f'<path d="M233 70Q246 77 260 66M227 93Q246 100 266 88" fill="none" stroke="{CR}" stroke-opacity=".65" stroke-width="1.6" stroke-dasharray="3 3"/>'
           f'<path d="M246 17l2.6 6.4 6.9.5-5.3 4.4 1.7 6.7-5.9-3.7-5.9 3.7 1.7-6.7-5.3-4.4 6.9-.5z" fill="{GD}" stroke="{GD}" stroke-width="2"/>'),
    (85.3, '<rect x="286" y="80" width="42" height="40" rx="3" fill="#b9783f"/>'
           f'<path d="M288 108q4-4 8 0t8 0 8 0 8 0 8 0" fill="none" stroke="{CR}" stroke-width="1.6" opacity=".8"/>'
           f'<path d="M282 83L307 60L332 83Z" fill="{SN}" stroke="{SN}" stroke-width="6"/>'
           f'<path d="M292 88h12v11h-12zM311 88h12v11h-12z" fill="{WIN}"/>'),
    (96.1, f'<path d="{tri(346,75,9,92)}{tri(346,85,12,106)}" fill="{GRD}" stroke="{GRD}" stroke-width="3.5"/>'
           f'<path d="M346 104V117.5" stroke="{WD}" stroke-width="5"/>'),
]
WHEEL = (f'<div class="tq6"><svg viewBox="-45 -45 90 90"><circle r="38" fill="none" stroke="{GD}" stroke-width="3.5"/>'
         f'<circle r="31" fill="none" stroke="{CR}" stroke-width="1.6" stroke-dasharray="4 3.3" opacity=".8"/>'
         f'<path d="M-38 0H38M0-38V38M-27-27L27 27M-27 27L27-27" stroke="{GD}" stroke-width="1.6"/>'
         f'{gond}<circle r="5" fill="{RD}" stroke="{CR}" stroke-width="1.5"/></svg></div>')
# lights: (x, y, kind) in town units — '' window 12x11, tq0 bauble 5.5, tqq round window 9
LIGHTS = [(157, 82, ''), (187, 82, ''), (173.5, 58.5, 'tqq'),
          (236, 48, 'tq0'), (251, 59, 'tq0'), (232, 72, 'tq0'), (256, 80, 'tq0'), (242, 87, 'tq0'), (229, 94, 'tq0'), (260, 95, 'tq0'),
          (292, 88, ''), (311, 88, '')]
town = []
for i, (ox, inner) in enumerate(PIECES):
    st = f'--i:{i};transform-origin:{n(ox)}% 100%'
    if i == 1:
        town.append(f'<div class="tq5" style="{st}"><svg {TV}>{inner}</svg>{WHEEL}</div>')
    else:
        town.append(f'<svg class="tq5" style="{st}" {TV}>{inner}</svg>')
for i, (x, y, k) in enumerate(LIGHTS):
    town.append(f'<i class="tq8{(" " + k) if k else ""}" style="--i:{i};left:{n(x / 3.6)}%;top:{n(y / 1.2)}%"></i>')
town.append(f'<svg class="tqk" {TV}><path d="M0 120C30 116 52 108 86 109S140 104 180 106S250 102 290 106S336 114 360 120Z" fill="{SN}"/>'
            '<path d="M30 119C52 113 70 113 90 114S140 110 180 111.5S250 108 290 111.5S322 116 334 119" fill="none" stroke="#d6c2a0" '
            'stroke-width="1.8" stroke-dasharray="5 4"/></svg>')
town_html = f'<div class="tq3"><div class="tq4">{"".join(town)}</div><i class="tqgd"></i></div>'

# ------------------------------------------------------------------ snow (3 depths; a few near flakes pass in front)
def rnd(s):
    v = math.sin(s * 12.9898) * 43758.5453
    return v - math.floor(v)
back, front = [], []
for i in range(20):
    layer = i % 3  # 0 far, 1 mid, 2 near
    xp = (i * 37 + rnd(i) * 11) % 96 + 2
    t = [14, 10, 7][layer]
    d = rnd(i + 7) * t
    cls = ['tq7', '', 'tq9'][layer]
    f = f'<i style="left:{int(xp)}%;--d:{n(d)}"></i>'
    (front if layer == 2 and i % 2 == 0 else back).append(f)

progress = ('<div class="tqp"><div class="tqj"><i class="tqn"><b></b></i></div><div class="tqi"><svg class="tqe" viewBox="-11 -11 22 22">'
            '<circle cy="1.5" r="9" fill="#0005"/><circle r="9" fill="#c83a35" stroke="#8b2523" stroke-width="1.2"/>'
            '<path d="M-8-3.5Q0-9 8-3.5M-9 1.5Q0-4.5 9 1.5M-7.5 6Q0 1 7.5 6M-2-8.6Q5 0-2 8.6" fill="none" stroke="#fff4e2" stroke-width="1.3" opacity=".85"/>'
            '</svg></div><p class="tbs-status" role="status" aria-live="polite">Unrolling the yarn…</p></div>')

html = ('<div id="tb-splash" aria-label="Loading Tinselby"><i class="tqg"></i>'
        f'<div class="tqs">{"".join(back)}</div>'
        f'<div class="tqm" aria-hidden="true">{badge}{wordmark}<p class="tqa">a knitted Christmas town</p></div>'
        f'{progress}{town_html}<div class="tqs tqf">{"".join(front)}</div></div>')

CSS = r"""
#tb-splash{--p:0;--q:clamp(0,var(--p),1);--b:clamp(92px,min(44vw,26vh),210px);--w:min(82vw,350px,calc(var(--b)*2.2));--h:clamp(64px,min(33vw,20vh),170px);
  --e:cubic-bezier(.3,.7,.4,1);--o:cubic-bezier(.22,.8,.3,1);position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;
  overflow:hidden;contain:strict;box-sizing:border-box;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px);
  background:#2b3452;color:#fff4e2;font:600 13px/1.3 ui-rounded,"SF Pro Rounded",Fredoka,Nunito,system-ui,sans-serif;-webkit-user-select:none;user-select:none;
  transition:opacity .5s,transform .5s cubic-bezier(.4,0,.2,1)}
#tb-splash.tbs-out{opacity:0;transform:scale(1.035);pointer-events:none}
#tb-splash svg{overflow:visible;stroke-linecap:round;stroke-linejoin:round}
#tb-splash .tqg,#tb-splash .tqs,#tb-splash .tqb>*,#tb-splash .tqx>svg,#tb-splash .tq5,#tb-splash .tq5>svg,#tb-splash .tqk{position:absolute;top:0;left:0;width:100%;height:100%}
#tb-splash .tqg,#tb-splash .tqs{animation:tqF 1.2s both}
#tb-splash .tqg{background:radial-gradient(70% 55% at 50% 38%,#3b4873,#2b345200 70%)}
#tb-splash .tqf{z-index:3}
#tb-splash .tqs i{position:absolute;top:-12px;width:5px;height:5px;border-radius:50%;background:radial-gradient(#fffaf0 35%,#fffaf000 72%);opacity:.75;
  animation:tqA 10s linear calc(var(--d)*-1s) infinite}
#tb-splash .tqs i:nth-child(2n){animation-name:tqB}
#tb-splash .tqs i:nth-child(3n+1){width:3.5px;height:3.5px;opacity:.45;animation-duration:14s}
#tb-splash .tqs i:nth-child(3n),#tb-splash .tqf i{width:9px;height:9px;opacity:.9;animation-duration:7s}

#tb-splash .tqm{position:relative;z-index:1;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3vh 0 2vh}
#tb-splash .tqb{position:relative;flex:none;width:var(--b);height:var(--b)}
#tb-splash .tqo{inset:-55%;width:auto;height:auto;border-radius:50%;background:radial-gradient(#ffce803d,#ffce8014 38%,#ffce8000 66%);animation:tqF 1.2s .3s both}
#tb-splash .tqd{animation:tqP .62s .3s var(--e) both}
#tb-splash .tqh,#tb-splash .tqc{width:50%;overflow:hidden}
#tb-splash .tq1,#tb-splash .tq1 .tqc{left:50%}
#tb-splash .tqr,#tb-splash .tqc,#tb-splash .tqc svg{position:absolute;top:0;left:0;height:100%}
#tb-splash .tqr,#tb-splash .tqc svg{width:200%}
#tb-splash .tqr{animation:tqH .36s .55s cubic-bezier(.5,0,1,1) both}
#tb-splash .tq2 .tqr{animation-delay:.91s;animation-timing-function:cubic-bezier(0,0,.5,1)}
#tb-splash .tq1 .tqr,#tb-splash .tq1 .tqc svg{left:-100%}
#tb-splash .tqt{transform-origin:50% 80%;animation:tqD .7s .72s both}
#tb-splash .tqx,#tb-splash .tqy{transform-origin:72% 26%}
#tb-splash .tqx{animation:tqS .75s 1s var(--e) both}
#tb-splash .tqz{left:71%;top:3%;width:24%;height:24%;opacity:0;animation:tqK .8s 1.5s both}

#tb-splash .tqw{display:flex;justify-content:center;flex:none;width:var(--w);height:calc(var(--w)*RATIO);margin-top:clamp(10px,2.8vh,30px);
  filter:drop-shadow(0 3.5px 0 #6e1a19) drop-shadow(0 6px 4px #0a0c2059)}
#tb-splash .tql{flex:none;height:100%;fill:none;stroke:#c83a35;stroke-width:15;transform:rotate(var(--r));transform-origin:50% 100%;
  animation:tqL .56s calc(1.4s + var(--i)*.09s) var(--e) both}
#tb-splash .tql use{stroke:#fff4e2;stroke-width:2.4;stroke-dasharray:4.4 4;opacity:.9}
#tb-splash .tqv{stroke:#fff4e2}
#tb-splash .tqv use{stroke:#c49a5e}
#tb-splash .tqu{width:calc(var(--w)*.76);height:3px;margin-top:clamp(6px,1.4vh,13px);opacity:.85;
  background:repeating-linear-gradient(90deg,#e3aa3a 0 9px,#0000 0 15px);transform-origin:0;animation:tqX .95s 1.5s cubic-bezier(.6,0,.2,1) both}
#tb-splash .tqa{display:flex;align-items:center;gap:.6em;margin:clamp(8px,1.8vh,16px) 0 0;font-size:clamp(13px,3.6vw,17px);letter-spacing:.08em;
  color:#fff4e2e6;text-shadow:0 2px 8px #0a0c1e80;white-space:nowrap;animation:tqU .65s 3s var(--e) both}
#tb-splash .tqa:before,#tb-splash .tqa:after{content:"";width:5px;height:5px;border-radius:50%;background:#e3aa3a;box-shadow:0 0 8px 1px #ffbe5ab3}

#tb-splash .tqp{position:relative;z-index:2;flex:none;width:min(66vw,280px);margin:1vh 0 clamp(10px,2.6vh,26px);animation:tqF .6s .15s both}
#tb-splash .tqj{position:relative;height:10px;border-radius:9px;overflow:hidden;background:#0c102680;box-shadow:inset 0 1px 2px #0006,0 0 0 1.5px #fff4e221}
#tb-splash .tqj:before,#tb-splash .tqn:after{content:"";position:absolute;left:7px;right:7px;top:4px;height:2px;
  background:repeating-linear-gradient(90deg,#fff4e229 0 5px,#0000 0 9px)}
#tb-splash .tqn{position:absolute;inset:0;border-radius:9px;overflow:hidden;transform:translateX(calc((var(--q) - 1)*100%));
  background:repeating-linear-gradient(118deg,#ffffff2b 0 3px,#0000 0 7px),linear-gradient(#e2504a,#a3262a)}
#tb-splash .tqn:after{background:repeating-linear-gradient(90deg,#fff4e299 0 5px,#0000 0 9px)}
#tb-splash .tqn b{position:absolute;top:0;bottom:0;width:45%;opacity:0;background:linear-gradient(90deg,#fff0,#fff0dc73,#fff0)}
#tb-splash .tqi{position:absolute;top:0;left:0;right:0;height:10px;transform:translateX(calc(var(--q)*100%))}
#tb-splash .tqe{position:absolute;left:-11px;top:-6px;width:22px;height:22px;transform:rotate(calc(var(--q)*3turn))}
#tb-splash .tqn,#tb-splash .tqi,#tb-splash .tqe{transition:transform .7s var(--o)}
#tb-splash .tbs-status{margin:12px 0 0;min-height:1.3em;text-align:center;letter-spacing:.03em;color:#fff4e2bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

#tb-splash .tq3{position:relative;z-index:1;flex:none;width:100%;display:flex;flex-direction:column;align-items:center;animation:tqR .6s 2.2s var(--o) both}
#tb-splash .tq4{position:relative;height:var(--h);width:calc(var(--h)*3)}
#tb-splash .tq5{animation:tqV .55s calc(2.35s + var(--i)*.11s) var(--e) both}
#tb-splash .tq6{position:absolute;left:11.94%;top:7.5%;width:25%;height:75%;animation:tqW 18s linear infinite}
#tb-splash .tq8{position:absolute;width:3.33%;height:9.17%;border-radius:2px;background:#ffcf66;box-shadow:0 0 6px 1px #ffba54bf;
  animation:tqO .4s calc(3.05s + var(--i)*.055s) both}
#tb-splash .tq0,#tb-splash .tqq{width:1.53%;height:4.58%;border-radius:50%;background:#ffd36e}
#tb-splash .tqq{width:2.5%;height:7.5%}
#tb-splash .tq0:nth-child(3n){background:#ff7466;box-shadow:0 0 6px 1px #ff6e5abf}
#tb-splash .tq0:nth-child(3n+1){background:#fff1c9;box-shadow:0 0 6px 1px #fff0c8bf}
#tb-splash .tqgd{width:100%;height:calc(14px + env(safe-area-inset-bottom,0px));margin-top:-1px;
  background:repeating-linear-gradient(90deg,#d6c2a0 0 6px,#0000 0 11px) 0 5px/100% 2px no-repeat,#f3e7d3}

#tb-splash.tbs-idle .tqb{animation:tqY 4.6s ease-in-out infinite}
#tb-splash.tbs-idle .tqo{animation:tqF 1.2s .3s both,tqZ 4.6s ease-in-out infinite}
#tb-splash.tbs-idle .tqy{animation:tqG 4.2s .8s infinite}
#tb-splash.tbs-idle .tqz{animation:tqK .8s 1.5s both,tqJ 4.2s .8s infinite}
#tb-splash.tbs-idle .tq8{animation:tqO .4s calc(3.05s + var(--i)*.055s) both,tqT 2.8s calc(.3s + var(--i)*.29s) ease-in-out infinite}
#tb-splash.tbs-idle .tqn b{animation:tqQ 2.6s .3s ease-in-out infinite}

@keyframes tqF{0%{opacity:0}}
@keyframes tqU{0%{opacity:0;transform:translateY(10px)}}
@keyframes tqA{25%{transform:translate3d(9px,27vh,0)}50%{transform:translate3d(-5px,54vh,0)}75%{transform:translate3d(7px,81vh,0)}to{transform:translate3d(0,calc(100vh + 24px),0)}}
@keyframes tqB{25%{transform:translate3d(-8px,27vh,0)}50%{transform:translate3d(6px,54vh,0)}75%{transform:translate3d(-7px,81vh,0)}to{transform:translate3d(0,calc(100vh + 24px),0)}}
@keyframes tqP{0%{transform:scale(0)}55%{transform:scale(1.09)}76%{transform:scale(.965)}90%{transform:scale(1.012)}}
@keyframes tqH{0%{transform:rotate(-180deg)}}
@keyframes tqD{0%{opacity:0;transform:translateY(-55%) scale(.9,1.12);animation-timing-function:cubic-bezier(.5,0,.9,.6)}12%{opacity:1}
  42%{transform:translateY(3%) scale(1.1,.86);animation-timing-function:var(--e)}62%{transform:translateY(-4%) scale(.96,1.05)}80%{transform:translateY(.8%) scale(1.015,.985)}}
@keyframes tqS{0%{opacity:0;transform:rotate(-220deg) scale(0)}55%{opacity:1;transform:rotate(14deg) scale(1.22)}78%{transform:rotate(-5deg) scale(.94)}}
@keyframes tqK{0%{opacity:0;transform:scale(.2)}35%{opacity:1;transform:scale(1.1) rotate(45deg)}to{opacity:0;transform:scale(.3) rotate(90deg)}}
@keyframes tqJ{0%,78%{opacity:0;transform:scale(.2)}86%{opacity:1;transform:scale(1) rotate(45deg)}96%,to{opacity:0;transform:scale(.3) rotate(90deg)}}
@keyframes tqG{0%,74%,to{transform:none}82%{transform:rotate(16deg) scale(1.13)}91%{transform:rotate(-4deg) scale(.98)}}
@keyframes tqL{0%{opacity:0;transform:translateY(38%) scale(.35)}50%{opacity:1;transform:translateY(-14%) scale(1.12)}72%{transform:translateY(3%) scale(.95)}88%{transform:translateY(-1%) scale(1.01)}}
@keyframes tqX{0%{transform:scaleX(0)}}
@keyframes tqR{0%{transform:translateY(100%)}}
@keyframes tqV{0%{transform:scaleY(0)}58%{transform:scaleY(1.09)}80%{transform:scaleY(.96)}}
@keyframes tqW{to{transform:rotate(1turn)}}
@keyframes tqO{0%{opacity:0}30%,66%{opacity:1}48%{opacity:.2}}
@keyframes tqT{50%{opacity:.42}}
@keyframes tqY{50%{transform:translateY(-5px)}}
@keyframes tqZ{50%{transform:scale(1.08)}}
@keyframes tqQ{0%{opacity:1;transform:translateX(-100%)}70%,to{opacity:1;transform:translateX(240%)}}

@media (prefers-reduced-motion:reduce){
  #tb-splash{transition:opacity .4s!important}
  #tb-splash.tbs-out{transform:none}
  #tb-splash *,#tb-splash :before,#tb-splash :after{animation:none!important;transition:none!important}
  #tb-splash .tqm,#tb-splash .tqp,#tb-splash .tq3,#tb-splash .tqs{animation:tqF .8s both!important}
  #tb-splash .tqs i{animation:tqA 10s linear calc(var(--d)*-1s) infinite paused!important}
}
""".replace('RATIO', WORD_RATIO)

def minify_css(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{};,>])\s*', r'\1', css)
    css = re.sub(r':\s+', ':', css)
    return css.replace(';}', '}').strip()

def minify_html(h):
    # unquote attribute values that need no quotes; keep a space before "/>" so the slash isn't read into the value
    def unq(m):
        v, tail = m.group(1), m.group(2) or ''
        if re.fullmatch(r'[^\s"\'=<>`]+', v):
            return '=' + v + (' ' + tail if tail else '')
        return m.group(0)
    return re.sub(r'="([^"]*)"(/>)?', unq, h)

readable = re.sub(r'(<div class="tq[mps3b]|<svg class="tq[dtk]|<div class="tq[hx]|<p |<i class="tq8)', r'\n\1', html)
mhtml = minify_html(html)
mcss = minify_css(CSS)
minified = mhtml + '<style>' + mcss + '</style>'
(HERE / 'trailer.html').write_text(readable + '\n<style>' + CSS + '</style>\n')
(HERE / 'trailer.min.html').write_text(minified)

DEMO = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2b3452"><title>Tinselby splash trailer - demo</title>
<style>
html,body{margin:0;height:100%;background:#2b3452}
.game{position:fixed;inset:0;display:grid;place-items:center;font:600 20px system-ui;color:#2b3452;text-align:center;
  background:linear-gradient(#5d7bb3,#9ec1e6 62%,#f3e7d3 62%)}
.game button{font:inherit;padding:12px 22px;border-radius:99px;border:0;background:#b8302d;color:#fff;cursor:pointer}
</style></head><body>
<div class="game"><div>(game canvas)<br><br><button onclick="location.reload()">Replay trailer</button></div></div>
<!--SNIPPET-->
<script>
(function () {
  var q = new URLSearchParams(location.search);
  if (q.has('reduced')) { // demo-only emulation of prefers-reduced-motion
    var st = document.querySelector('#tb-splash + style');
    st.textContent = st.textContent.replace(/@media ?\\(prefers-reduced-motion: ?reduce\\)/, '@media all');
  }
  if (q.has('manual')) return; // capture scripts drive the state themselves
  var el = document.getElementById('tb-splash'), status = el.querySelector('.tbs-status');
  var steps = [[250, .05], [900, .12], [1500, .22, 'Knitting the town\\u2026'], [2300, .34], [2900, .41],
    [3600, .55, 'Hanging the lights\\u2026'], [4300, .63], [5200, .72, 'Wrapping the presents\\u2026'], [6000, .86],
    [6800, .94, 'Lighting the tree\\u2026'], [7500, 1, 'Ready!']];
  steps.forEach(function (s) { setTimeout(function () { el.style.setProperty('--p', s[1]); if (s[2]) status.textContent = s[2]; }, s[0]); });
  setTimeout(function () { el.classList.add('tbs-idle'); }, 4500);
  setTimeout(function () { el.classList.add('tbs-out'); }, 8000);
  setTimeout(function () { el.remove(); }, 8550);
})();
</script>
</body></html>
"""
(HERE / 'demo.html').write_text(DEMO.replace('<!--SNIPPET-->', minified))
print(f'trailer.min.html: {len(minified.encode())} B (html {len(mhtml.encode())}, css {len(mcss)}), gzip {len(gzip.compress(minified.encode(), 9))} B')
