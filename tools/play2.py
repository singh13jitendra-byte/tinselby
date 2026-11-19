#!/usr/bin/env python3
"""Two-page "Play together" e2e (?w4&play&net=local, BroadcastChannel transport between two pages of one context).

  phone    A portrait 390x844 + B landscape 844x390 (touch): friends town create / join by typing the code / pill /
           reload with ?town=CODE; 8 emotes + phrase + cooldown; real taps on the other doll → people card (both
           orientations), mute / unmute; snowballs (card + HUD button, miss when the target moved away, no stagger);
           gifts (accept / decline / already owned, both directions); layout checks (nothing off screen, over the
           joystick or covering a button / ✕); ride together on the Ferris wheel, carousel, tram and carriage, each
           via the "Join <name>" prompt AND the people card "Ride together"; budget; back to the big town
  desktop  both pages 1280x720 (mouse): town join, emote + phrase, click doll → card, snowball, gift, budget
  w4off    ?w3 (wave 4 off): selfTest({reset:true}) = 359/0, no social HUD, rides unchanged, no console errors

Build first:  npx vite build --outDir /tmp/p4int2/dist      Served on http://localhost:8791 (P4_DIST / P4_PORT).
Shots: shots/p4int2_*.png (P4_SHOT = prefix).  P4_STAGES=emotes,people,snow,gift,portrait,budget,reload,ferris,
carousel,tram,carriage,back limits the phone/desktop stages (town setup always runs).  Uses /tmp/tinselby-chrome.lock.
Usage: python3 tools/play2.py [phone|desktop|w4off ...]   (default: all)"""
import fcntl, functools, http.server, json, os, sys, threading, time
from playwright.sync_api import sync_playwright

DIST = os.environ.get('P4_DIST', '/tmp/p4int2/dist')
PORT = int(os.environ.get('P4_PORT', '8791'))
ORIGIN = f'http://localhost:{PORT}'
BASE = ORIGIN + '/index.html?capture&w4&play&net=local&reveal=all&tod=13'
SHOTS = '/home/claude/tinselby/shots'
SHOT = os.environ.get('P4_SHOT', 'p4int2')
PARTS = set(sys.argv[1:]) or {'phone', 'desktop', 'w4off'}
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
C = 'window.__tinselby.ctx'
errs, fails = [], []
STAGES = set(filter(None, os.environ.get('P4_STAGES', '').split(',')))  # empty = all
def on(stage): return not STAGES or stage in STAGES

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/favicon'): self.send_response(204); self.end_headers(); return
        return super().do_GET()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()

lock = open('/tmp/tinselby-chrome.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)
    return cond

def attach(pg, tag):
    pg.on('console', lambda m: errs.append(f'[{tag}] {m.type}: {m.text}') if m.type == 'error' and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append(f'[{tag}] PAGEERROR {e}'))

# Installed in each page: toast / message recorders and a screen projector for tap picking.
HELPERS = r'''(() => {
  const c = window.__tinselby.ctx;
  if (window.__p2) return true;
  const P = window.__p2 = { toasts: [], msgs: [] };
  c.game.on('ui:toast', (d) => P.toasts.push(String(d && d.text)));
  const t0 = c.ui.toast; c.ui.toast = (text, ms, o) => { P.toasts.push(String(text)); return t0(text, ms, o); };
  c.game.on('net:msg', (m) => P.msgs.push({ type: m.type, from: m.from, data: m.data }));
  P.fx = []; // doll handle calls (emote / stagger) and their results: evidence that remote dolls animate
  const d0 = c.net.doll.bind(c.net);
  c.net.doll = (id) => { const h = d0(id); if (!h) return h;
    const e0 = h.emote, s0 = h.stagger;
    h.emote = (e) => { const r = e0(e); P.fx.push({ k: 'emote', id, e, r }); return r; };
    h.stagger = (x, z) => { const r = s0(x, z); P.fx.push({ k: 'stagger', id, r }); return r; };
    return h; };
  P.screenOf = (id, lift = 0.25) => {
    const d = c.net.doll(id); if (!d || !d.visible) return null;
    const y = (Number.isFinite(d.y) ? d.y : c.colliders.heightAt(d.x, d.z)) + lift;
    const v = new c.THREE.Vector3(d.x, y, d.z).project(c.engine.camera);
    const r = c.engine.renderer.domElement.getBoundingClientRect();
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (0.5 - v.y * 0.5) * r.height };
  };
  // fast mode (tests): skip the GPU render while stepping, but keep scene + camera matrices current (tap picking,
  // tags and bubbles project with them). Shots and draw-call checks render for real.
  const r0 = c.engine.post.render.bind(c.engine.post);
  P.fast = (on) => { c.engine.post.render = on ? (s, cam) => { s.updateMatrixWorld(); cam.updateMatrixWorld(); } : r0; return on; };
  P.fast(true);
  P.other = () => (c.net.players()[0] || {}).id || null;
  P.bubbles = () => [...document.querySelectorAll('.tb-bub.on')].map((e) => e.textContent);
  P.selfBubble = () => [...document.querySelectorAll('.tb-bub.self.on')].map((e) => e.textContent);
  P.vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  P.rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  return true;
})()'''

class Two:
    """Two pages that advance together (both step, so presence never expires and timers progress)."""
    def __init__(self, ctxt, va, vb, tag):
        self.ctx, self.tag = ctxt, tag
        self.A = ctxt.new_page(); self.B = ctxt.new_page()
        self.A.set_viewport_size(va); self.B.set_viewport_size(vb)
        for pg, t in ((self.A, tag + 'A'), (self.B, tag + 'B')): pg.set_default_timeout(300000); attach(pg, t)
        self.touch = tag == 'ph'

    def load(self, pg, extra, name):
        pg.goto(BASE + extra); pg.wait_for_function('window.__tinselby && window.__tinselby.ready', timeout=300000)
        pg.evaluate(f'{C}.net.setName({json.dumps(name)}); {C}.game.state.playerName = {json.dumps(name)};')
        if name == 'Bram': pg.evaluate(f'{C}.player.setStyle({{coat: "navy", hat: "elf", scarf: "gold"}}); {C}.net.setStyle({{coat: "navy", hat: "elf", scarf: "gold"}})')
        pg.evaluate(HELPERS)
        pg.evaluate('window.__tinselby.step(1/30, 2)')

    def adv(self, frames=10, chunk=5, wall=0.0):
        n = 0
        while n < frames:
            k = min(chunk, frames - n)
            self.A.evaluate(f'window.__tinselby.step(1/30,{k})'); self.B.evaluate(f'window.__tinselby.step(1/30,{k})')
            n += k
        if wall: time.sleep(wall)

    def until(self, pg, js, frames=600, chunk=5, sleep=0.0):
        n = 0
        while n < frames:
            try:
                if pg.evaluate(js): return True
            except Exception as e: print('   until err', e)
            self.adv(chunk, chunk)
            if sleep: time.sleep(sleep)
            n += chunk
        return bool(pg.evaluate(js))

    def tap_el(self, pg, sel):
        loc = pg.locator(sel).first
        if self.touch: loc.tap(timeout=10000)
        else: loc.click(timeout=10000)

    def tap_xy(self, pg, x, y):
        if self.touch: pg.touchscreen.tap(x, y)
        else: pg.mouse.click(x, y)

    def shot(self, pg, name, frames=2):
        if frames: self.adv(frames, frames)
        pg.evaluate('window.__p2.fast(false); window.__tinselby.step(1/30, 1)')
        pg.evaluate('document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })')
        pg.screenshot(path=f'{SHOTS}/{SHOT}_{name}.png'); print(f'  shot {SHOT}_{name}', flush=True)
        pg.evaluate('window.__p2.fast(true)')

def ev(pg, js): return pg.evaluate(js)
def toasts(pg): return ev(pg, 'window.__p2.toasts')
def clear_rec(pg): ev(pg, 'window.__p2.toasts.length = 0; window.__p2.msgs.length = 0')
def calls(pg): return ev(pg, 'window.__p2.fast(false), window.__tinselby.step(1/30, 2), window.__p2.fast(true), window.__tinselby.stats().calls')

def wait_cool(t): t.adv(10, 5); time.sleep(1.3)

def fresh_storage(b_ctx):
    pg = b_ctx.new_page(); pg.goto(ORIGIN + '/index.html?net=off&capture'); pg.evaluate('localStorage.clear(); sessionStorage.clear()'); pg.close()

# -------------------------------------------------------------------------------------------------------------- parts
def town_flow(t, P):
    A, B = t.A, t.B
    # 1. A creates a friends town through the invite card; B joins by typing the code
    t.tap_el(A, '.tbs-friends-btn'); t.adv(4)
    check(ev(A, 'window.__p2.vis(".tbs-invite")'), f'{P}: A invite card opens from the Friends button')
    t.tap_el(A, '.tbs-create'); t.adv(6)
    code = ev(A, 'document.querySelector(".tbs-code").textContent.trim()')
    check(len(code) == 6 and ev(A, f'{C}.net.town && {C}.net.town.code') == code, f'{P}: A created town, code shown ({code})')
    t.shot(A, f'{P}_A_invite_code')
    t.tap_el(B, '.tbs-friends-btn'); t.adv(4)
    B.locator('#tbs-code-in').first.type(code.lower(), delay=20)
    check(ev(B, 'document.querySelector("#tbs-code-in").value') == code and ev(B, '!document.querySelector(".tbs-join").disabled'), f'{P}: B code input upper-cases and enables Join')
    t.tap_el(B, '.tbs-join')
    ok = t.until(B, f'{C}.net.town?.code === "{code}" && {C}.net.players().length === 1', 900, 5, 0.05)
    ok = ok and t.until(A, f'{C}.net.players().length === 1', 600, 5, 0.05)
    check(ok, f'{P}: A and B see each other in {code}')
    t.adv(30)
    t.shot(B, f'{P}_B_joined_invite')
    for pg, n in ((A, 'A'), (B, 'B')):
        if ev(pg, 'window.__p2.vis(".tbs-invite")'): t.tap_el(pg, '.tbs-invite .tb-modal-close')
    t.adv(10)
    for pg, n in ((A, 'A'), (B, 'B')):
        txt = ev(pg, 'document.querySelector(".tbs-pill-txt").textContent')
        check(txt == f'{code} · 2 here' and ev(pg, 'window.__p2.vis(".tbs-pill")'), f'{P}: {n} pill "{txt}"')
        r = ev(pg, 'window.__p2.rect(".tbs-pill-txt")'); sw = ev(pg, 'document.querySelector(".tbs-pill-txt").scrollWidth')
        check(r and sw <= r['w'] + 1, f'{P}: {n} pill text not truncated (scroll {sw} / box {r and round(r["w"])})')
    return code

def reload_b(t, P, code, bname, at):
    A, B = t.A, t.B
    old = ev(B, f'{C}.net.id')
    t.load(B, f'&at={at}&town={code}', bname)
    ok = t.until(B, f'{C}.net.town?.code === "{code}" && {C}.net.players().length === 1', 900, 5, 0.05)
    check(ok, f'{P}: B reloaded with ?town={code} → back in, sees A')
    ok = t.until(A, f'{C}.net.players().length === 1 && {C}.net.players()[0].id !== {json.dumps(old)}', 900, 5, 0.05)
    check(ok, f'{P}: A sees the reloaded B once (old id gone)')
    t.adv(30)

def emotes_flow(t, P):
    A, B = t.A, t.B
    aid = ev(A, f'{C}.net.id')
    clear_rec(B)
    emos = ev(A, f'{C}.net.EMOTES')
    for i, e in enumerate(emos):
        t.tap_el(A, '.tbs-emote-btn'); t.adv(3)
        t.tap_el(A, f'.tbs-emote[data-e="{e}"]')
        t.adv(3)
        ok = t.until(B, f'window.__p2.msgs.some(m => m.type === "emote" && m.data.e === "{e}" && m.from === "{aid}")', 60, 3, 0.03)
        fx = ev(B, f'window.__p2.fx.some(f => f.k === "emote" && f.e === "{e}" && f.id === "{aid}" && f.r)')
        check(ok and fx, f'{P}: emote {e}: B got it, A\'s doll emotes on B')
        if e in ('dance', 'snowangel'): t.shot(B, f'{P}_B_sees_{e}', 8)
        wait_cool(t)
    # phrase: bubble over A on B's screen and over self on A
    t.tap_el(A, '.tbs-emote-btn'); t.adv(3)
    t.tap_el(A, '.tbs-tab[data-t="christmas"]'); t.adv(1)
    t.tap_el(A, '.tbs-phrase[data-p="merry-xmas"]'); t.adv(4)
    ok = t.until(B, 'window.__p2.bubbles().includes("Merry Christmas!")', 60, 3, 0.03)
    check(ok, f'{P}: phrase bubble over A on B ({ev(B, "window.__p2.bubbles()")})')
    check('Merry Christmas!' in ev(A, 'window.__p2.selfBubble()'), f'{P}: phrase bubble over self on A')
    t.shot(B, f'{P}_B_phrase_bubble', 2); t.shot(A, f'{P}_A_self_bubble', 0)
    # cooldown: a second pick right after one is refused (wheel stays open and shakes), allowed again after 1.2 s
    wait_cool(t)
    t.tap_el(A, '.tbs-emote-btn'); t.tap_el(A, '.tbs-emote[data-e="cheer"]')
    n0 = len([m for m in ev(B, 'window.__p2.msgs') if m['type'] == 'emote'])
    t.tap_el(A, '.tbs-emote-btn'); t.tap_el(A, '.tbs-emote[data-e="clap"]')
    refused = ev(A, 'window.__p2.vis(".tbs-wheel") && document.querySelector(".tbs-wheel").classList.contains("shake")')
    t.adv(6, 3, 0.1)
    emos_b = [m['data']['e'] for m in ev(B, 'window.__p2.msgs') if m['type'] == 'emote']
    check(refused and emos_b[-1:] == ['cheer'], f'{P}: cooldown refuses a 2nd pick within 1.2 s (wheel shakes; B got {emos_b[-2:]})')
    t.shot(A, f'{P}_A_wheel', 0)
    time.sleep(1.3)
    t.tap_el(A, '.tbs-emote[data-e="clap"]'); t.adv(6, 3, 0.05)
    check(not ev(A, 'window.__p2.vis(".tbs-wheel")') and t.until(B, 'window.__p2.msgs.some(m => m.type === "emote" && m.data.e === "clap")', 30, 3, 0.03), f'{P}: after the cooldown the pick goes through')
    if ev(A, 'window.__p2.vis(".tbs-wheel")'): t.tap_el(A, '.tbs-wheel .tb-modal-close')
    wait_cool(t)

def tap_doll(t, pg, other_id, P, label):
    t.adv(6)
    xy = ev(pg, f'window.__p2.screenOf({json.dumps(other_id)})')
    if not check(xy is not None, f'{P}: {label}: other doll on screen ({xy})'): return False
    t.tap_xy(pg, xy['x'], xy['y']); t.adv(3)
    return ev(pg, 'window.__p2.vis(".tbs-person")')

def card_btn(pg, label):
    return f'.tbs-person-btns button:has-text("{label}")'

def people_mute_flow(t, P):
    A, B = t.A, t.B
    aid = ev(A, f'{C}.net.id')
    opened = tap_doll(t, B, aid, P, 'B taps A')
    check(opened and ev(B, 'document.querySelector(".tbs-person-name").textContent') == ev(A, f'{C}.game.state.playerName'), f'{P}: real tap on A\'s doll opens the people card on B')
    labels = ev(B, '[...document.querySelectorAll(".tbs-person-btns button")].map(b => b.textContent.trim())')
    check(all(x in labels for x in ('Wave', 'Throw snowball', 'Give a gift', 'Mute')), f'{P}: card buttons {labels}')
    t.shot(B, f'{P}_B_people_card', 1)
    layout(B, P, 'B people card')
    # card must not cover the joystick / bottom-left controls or the emote button
    card = ev(B, 'window.__p2.rect(".tbs-person")')
    for sel in ('.tb-joy, .tb-joystick, .joystick', '.tbs-emote-btn'):
        r = ev(B, f'(() => {{ const e = [...document.querySelectorAll("{sel}")].find(e => e.offsetParent); if (!e) return null; const r = e.getBoundingClientRect(); return {{l:r.left,t:r.top,r:r.right,b:r.bottom}}; }})()')
        if r and card:
            ov = not (card['r'] <= r['l'] or card['l'] >= r['r'] or card['b'] <= r['t'] or card['t'] >= r['b'])
            check(not ov, f'{P}: people card does not overlap {sel.split(",")[0]}')
    t.tap_el(B, card_btn(B, 'Mute')); t.adv(4)
    check(ev(B, f'{C}.net.isMuted("{aid}")'), f'{P}: Mute → muted')
    wait_cool(t); clear_rec(B)
    ev(A, 'window.__social.say("hello")'); t.adv(10, 5, 0.2); t.adv(6)
    check('Hello!' not in ev(B, 'window.__p2.bubbles()') and not any(m['type'] == 'say' for m in ev(B, 'window.__p2.msgs')), f'{P}: muted: A\'s phrase not shown on B')
    if not ev(B, 'window.__p2.vis(".tbs-person")'): tap_doll(t, B, aid, P, 'B taps A again')
    t.tap_el(B, card_btn(B, 'Unmute')); t.adv(4)
    check(not ev(B, f'{C}.net.isMuted("{aid}")'), f'{P}: Unmute → not muted')
    wait_cool(t)
    ev(A, 'window.__social.say("thank-you")')
    ok = t.until(B, 'window.__p2.bubbles().includes("Thank you!")', 60, 3, 0.03)
    check(ok, f'{P}: unmuted: A\'s phrase shows on B again')
    if ev(B, 'window.__p2.vis(".tbs-person")'): t.tap_el(B, '.tbs-person-x')
    t.adv(4)

def snow_flow(t, P):
    A, B = t.A, t.B
    aid, bid = ev(A, f'{C}.net.id'), ev(B, f'{C}.net.id')
    clear_rec(A); clear_rec(B)
    # from the people card
    opened = tap_doll(t, B, aid, P, 'B taps A for snowball')
    check(opened, f'{P}: card open for snowball')
    if opened:
        t.tap_el(B, card_btn(B, 'Throw snowball'))
        t.adv(2)
        check(ev(B, f'{C}.snowball.flying') >= 1, f'{P}: card throw: ball in flight on B')
        ok = t.until(A, f'{C}.snowball.flying >= 1 || window.__p2.msgs.some(m => m.type === "snow")', 30, 1, 0.02)
        check(ok, f'{P}: card throw: arc on A')
        t.shot(B, f'{P}_B_snowball_arc', 0)
        ok = t.until(A, 'window.__p2.toasts.some(s => /got you with a snowball/.test(s))', 120, 3, 0.02)
        check(ok, f'{P}: card throw: hit toast on A ({[s for s in toasts(A) if "snow" in s]})')
        check(ev(B, f'window.__p2.fx.some(f => f.k === "stagger" && f.id === "{aid}" && f.r)'), f'{P}: stagger of A on B\'s view')
        t.shot(A, f'{P}_A_hit_splat', 0)
    time.sleep(1.1); t.adv(6)
    # HUD snowball button (≤ 12 m)
    vis = t.until(B, 'window.__p2.vis(".tbs-x-snowball")', 30, 3)
    check(vis, f'{P}: HUD snowball button visible near A')
    clear_rec(A)
    if vis:
        t.tap_el(B, '.tbs-x-snowball'); t.adv(2)
        check(ev(B, f'{C}.snowball.flying') >= 1, f'{P}: HUD throw: ball in flight')
        ok = t.until(A, 'window.__p2.toasts.some(s => /got you with a snowball/.test(s))', 120, 3, 0.02)
        check(ok, f'{P}: HUD throw: hit toast on A')
    time.sleep(1.1); t.adv(6)
    # target moves away mid-flight → miss (no hit message)
    clear_rec(A)
    ax, az = ev(A, f'[{C}.player.pos.x, {C}.player.pos.z]')
    ok = ev(B, f'{C}.snowball.throwAt("{aid}")')
    check(ok, f'{P}: throwAt returns true on the real net')
    ev(B, 'window.__p2.fx.length = 0')
    ev(A, f'{C}.player.teleport({ax + 5}, {az})')
    t.adv(60, 5, 0.02)
    check(not any(m['type'] == 'hit' for m in ev(A, 'window.__p2.msgs')) and not any('snowball' in s for s in toasts(A)), f'{P}: target moved away mid-flight → miss (no hit message, no toast on A)')
    check(not ev(B, 'window.__p2.fx.some(f => f.k === "stagger")'), f'{P}: miss → no stagger of A on B')
    ev(A, f'{C}.player.teleport({ax}, {az})'); t.adv(40, 5, 0.02)
    # out of range: HUD button hides beyond 12 m
    ev(A, f'{C}.player.teleport({ax}, {az - 14})'); t.adv(60, 5, 0.05)
    check(t.until(B, '!window.__p2.vis(".tbs-x-snowball")', 30, 3), f'{P}: HUD snowball button hidden beyond 12 m')
    ev(A, f'{C}.player.teleport({ax}, {az})'); t.adv(60, 5, 0.05)

def gift_flow(t, P):
    A, B = t.A, t.B
    aid = ev(A, f'{C}.net.id')
    PR = f'{C}.progress.rewards'
    ev(A, "localStorage.removeItem('tinselby.gifts.v1')")
    piece, piece2 = 'scarf:holly', 'hat:gnome'
    for r in (piece, piece2): ev(B, f'{PR}.grant("{r}")')
    check(ev(B, f'{PR}.has("{piece}") && !{PR}.has ? true : {PR}.has("{piece}")') and not ev(A, f'{PR}.has("{piece}")'), f'{P}: B owns {piece}, A does not')
    def offer(r):
        clear_rec(A); clear_rec(B)
        if not tap_doll(t, B, aid, P, 'B taps A for gift'): return False
        t.tap_el(B, card_btn(B, 'Give a gift')); t.adv(3)
        if not check(ev(B, 'window.__p2.vis(".sn-picker")'), f'{P}: gift picker open'): return False
        if r == piece2: t.shot(B, f'{P}_B_gift_picker', 0)
        idx = ev(B, f'{C}.gifts.pieces().findIndex(p => p.id === "{r}")')
        B.locator('.sn-picker .sn-item').nth(idx).click() if not t.touch else B.locator('.sn-picker .sn-item').nth(idx).tap()
        t.adv(3)
        return t.until(A, 'window.__p2.vis(".sn-cards .gift")', 60, 3, 0.03)
    # accept
    got = offer(piece)
    check(got, f'{P}: A gets the gift card')
    if got:
        t.shot(A, f'{P}_A_gift_card', 0)
        t.tap_el(A, '.sn-cards .gift [data-y]'); t.adv(3)
        check(ev(A, f'{PR}.has("{piece}")'), f'{P}: Accept → A owns {piece}')
        check(any(s.startswith('Gift from') for s in toasts(A)), f'{P}: A toast "Gift from …"')
        ok = t.until(B, 'window.__p2.toasts.some(s => /accepted your/.test(s))', 60, 3, 0.03)
        check(ok, f'{P}: B toast "… accepted your …"')
        check(ev(B, f'{PR}.has("{piece}")'), f'{P}: giver keeps the piece')
    t.adv(12, 6, 0.4)
    # decline
    got = offer(piece2)
    if check(got, f'{P}: second offer card on A'):
        t.tap_el(A, '.sn-cards .gift [data-n]'); t.adv(3)
        check(not ev(A, f'{PR}.has("{piece2}")'), f'{P}: No thanks → A does not get {piece2}')
        ok = t.until(B, 'window.__p2.toasts.some(s => /said no thanks/.test(s))', 60, 3, 0.03)
        check(ok, f'{P}: B toast "… said no thanks …"')
    t.adv(12, 6, 0.4)
    # already owned
    got = offer(piece)
    if check(got, f'{P}: third offer (already owned) card on A'):
        t.tap_el(A, '.sn-cards .gift [data-y]'); t.adv(3)
        check(any('already have' in s for s in toasts(A)), f'{P}: already-owned toast on A')
        ok = t.until(B, 'window.__p2.toasts.some(s => /accepted your|said no thanks/.test(s))', 60, 3, 0.03)
        check(ok, f'{P}: B gets an answer for the already-owned gift ({[s for s in toasts(B) if "your" in s or "thanks" in s]})')
    t.adv(12, 6, 0.4)

def board(pg, rid):
    """Teleport next to ride rid's board spot and trigger its interact (as pressing the prompt)."""
    return ev(pg, f'''(() => {{ const c = {C}; const r = c.rides.list.find(q => q.id === "{rid}"); if (!r) return 'no ride';
      const w = r.seats.where(); if (!w) return 'no where';
      c.player.teleport(w.x, w.z, w.h ?? c.player.heading);
      const sp = r.seats.spots[w.i ?? 0]; if (!sp) return 'no spot';
      if (sp.enabled && !sp.enabled()) return 'spot disabled';
      sp.onInteract(); return c.rides.active ? c.rides.active.id : 'not active'; }})()''')

def seated(pg):
    return ev(pg, f'(() => {{ const r = {C}.rides.active; const s = r && r.seats ? r.seats.mine() : null; return s == null ? null : s; }})()')

def b_view_of(t, pg, other_id, dist=2.4):
    """Stand south-south-east of the other doll (the follow camera looks north-north-west), camera snapped, at the
    nearest distance where the doll shows on the open canvas (not under a HUD chip), as a player would walk up."""
    for d in (dist, dist - 1.2, dist - 2.4, dist - 3.6, dist - 4.8, dist - 6.0):
        ev(pg, f"""(() => {{ const c = {C}; const o = c.net.doll({json.dumps(other_id)}); if (!o) return;
          c.player.teleport(o.x + Math.sin(0.28) * {d}, o.z + Math.cos(0.28) * {d}, Math.PI + 0.28);
          try {{ c.colliders.resolve(c.player.pos, 0.08); c.player.object.position.copy(c.player.pos); }} catch (e) {{}}
          c.cam.follow(c.player); }})()""")
        t.adv(20)
        if ev(pg, f"""(() => {{ const p = window.__p2.screenOf({json.dumps(other_id)}); if (!p) return false;
          const e = document.elementFromPoint(p.x, p.y); return !!e && e === {C}.engine.renderer.domElement && p.y > innerHeight * 0.15; }})()"""): return True
        print('    view try', d, ev(pg, VIEWDBG % json.dumps(other_id)))
    return False
CAMDBG = """((id) => { const c = window.__tinselby.ctx, T = c.THREE, cam = c.engine.camera, d = c.net.doll(id); if (!d || !d.visible) return 'not drawn';
  const fw = new T.Vector3(); cam.getWorldDirection(fw); const to = new T.Vector3(d.x, d.y + 0.3, d.z).sub(cam.position);
  const r = c.rides.active, f3 = (o) => o && [o.x, o.y, o.z].map(v => +(+v).toFixed(3)); const sh = c.rides._together._state.shown.map(e => e[1].s);
  return { headDist: +to.length().toFixed(2), offAxisDeg: +(fw.angleTo(to.clone().normalize()) * 57.3).toFixed(1), vfov: Math.round(cam.fov), aspect: +cam.aspect.toFixed(2),
    mine: r && r.seats.mine(), shownB: sh, doll: f3(d), cam: f3(cam.position), poseB: sh.length && r ? f3(r.seats.pose(sh[0], {})) : null, poseMine: r && r.seats.mine() != null ? f3(r.seats.pose(r.seats.mine(), {})) : null }; })(%s)"""
VIEWDBG = """(() => { const c = window.__tinselby.ctx, p = window.__p2.screenOf(%s); const e = p && document.elementFromPoint(p.x, p.y);
  return [p, e && String(e.className || e.tagName).slice(0, 40), c.rides.active && c.rides.active.id, [c.player.pos.x, c.player.pos.z].map(v => +v.toFixed(2))]; })()"""

def close_panels(pg):
    ev(pg, f'{C}.social.closeAll(); {C}.game.emit("ui:escape")')
    if ev(pg, 'window.__p2.vis(".cal-wrap") || window.__p2.vis(".tb-modal")'): pg.keyboard.press('Escape')

def board_note(t, P, rid, sa, sb, ok, how):
    near = ev(t.B, f'{C}.rides.active?.seats?.near?.({sa if sa is not None else 0})') or []
    if rid == 'ferris': good = sa is not None and sb is not None and sa // 2 == sb // 2 and sa != sb; want = 'same gondola'
    elif rid == 'carousel': good = sb is not None and sb in near[:2]; want = 'neighbouring horse'
    elif rid == 'tram': good = sb is not None and sb != sa and sb in near[:2]; want = 'bench beside / across'
    else: good = sb is not None and sb != sa; want = 'the other place'
    check(ok and good, f'{P}: {rid} via {how}: {want} (A seat {sa}, B seat {sb}, near(A) {near[:3]})')

def a_on_ride(t, P, rid, aid, wait_frames):
    A, B = t.A, t.B
    if seated(A) is not None and ev(A, f'{C}.rides.active.id') == rid: return True
    for pg in (A,): ev(pg, f'{C}.rides.active && {C}.rides.active.stop()')
    t.until(A, f'!{C}.rides.active', 600, 10)
    for _ in range(20):
        r = board(A, rid)
        if r != 'spot disabled': break
        t.adv(15)
    check(r == rid, f'{P}: {rid}: A boards ({r})')
    ok = t.until(A, f'(() => {{ const r = {C}.rides.active; return r && r.seats && r.seats.mine() != null; }})()', wait_frames, 10, 0.0)
    check(ok, f'{P}: {rid}: A seated (seat {seated(A)})')
    ok = t.until(B, f'{C}.rides.rideOf("{aid}")?.k === "{rid}"', 300, 5, 0.03)
    check(ok, f'{P}: {rid}: B sees A on the ride ({ev(B, f"JSON.stringify({C}.rides.rideOf(\"{aid}\"))")})')
    t.adv(10)
    return ok

def b_hop_off(t):
    ev(t.B, f'{C}.rides.active && {C}.rides.active.stop()')
    t.until(t.B, f'!{C}.rides.active', 600, 10); t.adv(10)

def ride_flow(t, P, rid, wait_frames=900, shots=True):
    A, B = t.A, t.B
    aid = ev(A, f'{C}.net.id')
    if not a_on_ride(t, P, rid, aid, wait_frames): return
    check(ev(B, f'{C}.rides._together._state.pinned.includes("{aid}")'), f'{P}: {rid}: A\'s doll pinned seated on B')
    # 1. "Join <name>": B walks up to the ride's board prompt (tram: the stop B's own tram reaches first) and taps it
    ev(B, f"""(() => {{ const c = {C}; const r = c.rides.list.find(q => q.id === "{rid}");
      const w = "{rid}" === 'tram' ? r.seats.where() : null; const sp = r.seats.spots[w ? w.i : 0];
      c.player.teleport(sp.x, sp.z); c.cam.follow(c.player); }})()""")
    ok = t.until(B, f'window.__p2.vis(".tb-act") && /^Join /.test(document.querySelector(".tb-act").textContent.trim())', 60, 5)
    txt = ev(B, '(document.querySelector(".tb-act") || {}).textContent')
    check(ok and 'Join Ava' in (txt or ''), f'{P}: {rid}: B at the ride sees the prompt "{(txt or "").strip()}"')
    if shots: t.shot(B, f'{P}_B_join_prompt_{rid}', 2)
    if ok:
        t.tap_el(B, '.tb-act'); t.adv(4)
        check(ev(B, f'{C}.rides.active?.id') == rid, f'{P}: {rid}: tapping "Join Ava" boards B')
        ok = t.until(B, f'(() => {{ const r = {C}.rides.active; return r && r.seats && r.seats.mine() != null; }})()', wait_frames, 10, 0.0)
        board_note(t, P, rid, seated(A), seated(B), ok, 'Join prompt')
        bid = ev(B, f'{C}.net.id')
        # A learns B's seat from presence (wall-time paced): wait for it, then let the seat shuffle settle
        t.until(A, f'{C}.rides._together._state.pinned.includes("{bid}")', 300, 5, 0.05)
        t.adv(45, 5, 0.03)
        cd = ev(A, CAMDBG % json.dumps(bid))
        print(f'  info {rid}: B\'s doll seen from A\'s camera', cd, flush=True)
        if isinstance(cd, dict) and rid != 'carousel': check(cd['headDist'] >= 0.12, f'{P}: {rid}: B\'s seated doll is not inside A\'s eye camera (head {cd["headDist"]} m away)')
        if shots: t.shot(B, f'{P}_B_together_{rid}', 2); t.shot(A, f'{P}_A_together_{rid}', 0)
        if shots and rid == 'ferris':
            ev(A, f'{C}.engine.scene.getObjectByName("net-remotes").visible = false'); t.shot(A, f'{P}_A_together_{rid}_noremotes', 0)
            ev(A, f'{C}.engine.scene.getObjectByName("net-remotes").visible = true')
        check(ev(A, f'{C}.rides._together._state.pinned.length') >= 1, f'{P}: {rid}: B\'s doll pinned seated on A')
        b_hop_off(t)
    # 2. people card: B looks at A seated on the ride, taps A's doll, "Ride together"
    if not a_on_ride(t, P, rid, aid, wait_frames): return
    if not check(b_view_of(t, B, aid), f'{P}: {rid}: A\'s seated doll on B\'s screen'): return
    if shots and rid in ('ferris', 'carousel'): t.shot(B, f'{P}_B_sees_seated_A_{rid}', 2)
    opened = tap_doll(t, B, aid, P, f'{rid}: B taps seated A')
    labels = ev(B, '[...document.querySelectorAll(".tbs-person-btns button")].map(b => b.textContent.trim())') if opened else []
    if not check(opened and 'Ride together' in labels, f'{P}: {rid}: tap on seated A opens the card with "Ride together" ({labels})'):
        xy = ev(B, f'window.__p2.screenOf("{aid}")')
        if xy: print('    at tap:', ev(B, f'(() => {{ const e = document.elementFromPoint({xy["x"]}, {xy["y"]}); return [e && (e.className || e.tagName), {C}.net.dollAt({xy["x"]}, {xy["y"]}), {C}.social.free()]; }})()'))
        return
    if shots and rid == 'carousel': t.shot(B, f'{P}_B_people_card_ride', 0)
    t.tap_el(B, card_btn(B, 'Ride together')); t.adv(4)
    check(ev(B, f'{C}.rides.active?.id') == rid, f'{P}: {rid}: "Ride together" boards B')
    ok = t.until(B, f'(() => {{ const r = {C}.rides.active; return r && r.seats && r.seats.mine() != null; }})()', wait_frames, 10, 0.0)
    board_note(t, P, rid, seated(A), seated(B), ok, 'people card')
    t.adv(20)
    for pg in (A, B): ev(pg, f'{C}.rides.active && {C}.rides.active.stop()')
    t.until(A, f'!{C}.rides.active', 600, 10); t.until(B, f'!{C}.rides.active', 600, 10)
    ok = t.until(B, f'!{C}.rides.rideOf("{aid}")', 300, 5, 0.03)
    t.adv(4)
    check(ok and not ev(B, f'{C}.rides._together._state.pinned.length') and not ev(A, f'{C}.rides._together._state.pinned.length'), f'{P}: {rid}: after hop off nobody is pinned')
    t.adv(20)


LAYOUT = r"""(() => {
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const shown = (e) => { if (!e || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    let op = 1; for (let a = e; a && a.nodeType === 1; a = a.parentElement) op *= +getComputedStyle(a).opacity; // stepped-aside parents count
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && op > 0.05 && cs.display !== 'none'; };
  const all = (sel) => [...document.querySelectorAll(sel)].filter(shown);
  const ov = (a, b) => !(a.r <= b.l + 1 || a.l >= b.r - 1 || a.b <= b.t + 1 || a.t >= b.b - 1);
  const W = innerWidth, H = innerHeight, bad = [], notes = [];
  const social = ['.tbs-friends-btn', '.tbs-pill', '.tbs-emote-btn', '.tbs-xbtn', '.tbs-person', '.tbs-wheel', '.tbs-invite', '.sn-cards .tb-card', '.sn-picker .knit-card'];
  const nonModal = ['.tbs-pill', '.tbs-emote-btn', '.tbs-xbtn', '.tbs-person', '.sn-cards .tb-card'];
  const joy = all('.tb-joy').map(R);
  for (const sel of social) for (const e of all(sel)) {
    const r = R(e);
    if (r.l < -1 || r.t < -1 || r.r > W + 1 || r.b > H + 1) bad.push(sel + ' off screen ' + [r.l, r.t, r.r, r.b].map(Math.round));
    if (nonModal.includes(sel)) for (const j of joy) if (ov(r, j)) bad.push(sel + ' overlaps the joystick');
  }
  // every visible close / hop-off / act button must be the topmost element at its centre (nothing covers it)
  // with a modal sheet open (wheel, invite card, gift picker) only its own close button counts; HUD buttons sit under it
  const modal = ['.tbs-wheel', '.tbs-invite', '.sn-picker .knit-card'].some((q) => window.__p2.vis(q));
  const btns = modal ? '.tbs-wheel .tb-modal-close, .tbs-invite .tb-modal-close, .sn-picker button' : '.tb-modal-close, .tbs-person-x, .tb-act, .tbs-emote-btn, .tbs-xbtn, .tbs-pill, .tbs-friends-btn, .sn-cards [data-y], .sn-cards [data-n]';
  for (const e of all(btns)) {
    const r = R(e), x = (r.l + r.r) / 2, y = (r.t + r.b) / 2, top = document.elementFromPoint(x, y);
    if (!top || !(e === top || e.contains(top))) {
      const who = top ? (top.className && top.className.baseVal === undefined ? String(top.className) : top.tagName) : 'nothing';
      const msg = (e.className || '').toString().split(' ').filter(c => /^tb/.test(c) || c === 'knit-btn').slice(-1)[0] + ' covered by ' + who.slice(0, 40);
      // a gift card (30 s) may sit over the corner stack in portrait: note, not a failure
      if (/sn-|tb-card/.test(who) || (top && top.closest && top.closest('.sn-cards'))) notes.push(msg); else bad.push(msg);
    }
  }
  return { bad, notes };
})()"""

def layout(pg, P, label):
    time.sleep(0.35)  # let CSS transitions (corner stack stepping aside, card pop) finish: they run on wall time
    r = ev(pg, LAYOUT)
    if not check(not r['bad'], f'{P}: layout {label}: nothing off screen / over the joystick / covering a button {r["bad"]}'):
        pg.screenshot(path=f'{SHOTS}/{SHOT}_layoutfail_{P}_{label.replace(" ", "_")}.png')
    if r['notes']: print(f'  note {P}: layout {label}: {r["notes"]}', flush=True)

def portrait_flow(t, P):
    """A (portrait) side: tap B's doll → people card, emote wheel already shot; A gives B a gift (B landscape card)."""
    A, B = t.A, t.B
    bid = ev(B, f'{C}.net.id')
    layout(A, P, 'A HUD'); layout(B, P, 'B HUD')
    ax, az = ev(A, f'[{C}.player.pos.x, {C}.player.pos.z]')
    ev(B, f'{C}.player.teleport({ax + 0.4}, {az - 2.4})'); t.adv(40, 5, 0.03)
    opened = tap_doll(t, A, bid, P, 'A taps B')
    check(opened and ev(A, 'document.querySelector(".tbs-person-name").textContent') == 'Bram', f'{P}: real tap on B\'s doll opens the people card on A (portrait)')
    if opened:
        layout(A, P, 'A people card'); t.shot(A, f'{P}_A_people_card', 1)
    check(t.until(A, 'window.__p2.vis(".tbs-x-snowball")', 30, 3), f'{P}: A (portrait) HUD snowball button visible near B')
    # gift A → B
    PR = f'{C}.progress.rewards'
    ev(B, "localStorage.removeItem('tinselby.gifts.v1')")
    piece = 'hat:gnome'
    ev(A, f'{PR}.grant("{piece}")')
    had = ev(B, f'{PR}.has("{piece}")')
    if opened:
        clear_rec(A); clear_rec(B)
        t.tap_el(A, card_btn(A, 'Give a gift')); t.adv(3)
        if check(ev(A, 'window.__p2.vis(".sn-picker")'), f'{P}: A (portrait) gift picker open'):
            layout(A, P, 'A gift picker'); t.shot(A, f'{P}_A_gift_picker', 0)
            idx = ev(A, f'{C}.gifts.pieces().findIndex(p => p.id === "{piece}")')
            A.locator('.sn-picker .sn-item').nth(idx).tap(); t.adv(3)
            got = t.until(B, 'window.__p2.vis(".sn-cards .gift")', 60, 3, 0.03)
            if check(got, f'{P}: B (landscape) gets the gift card'):
                layout(B, P, 'B gift card'); t.shot(B, f'{P}_B_gift_card', 0)
                t.tap_el(B, '.sn-cards .gift [data-y]'); t.adv(3)
                check(ev(B, f'{PR}.has("{piece}")') or had, f'{P}: B accepted → owns {piece}' + (' (already had it)' if had else ''))
                t.adv(6, 3, 0.4)
                check(ev(B, 'document.querySelectorAll(".sn-cards .tb-card").length') == 0, f'{P}: B gift card gone after Accept')
                check(t.until(A, 'window.__p2.toasts.some(s => /accepted your/.test(s))', 60, 3, 0.03), f'{P}: A toast "… accepted your …"')
    if ev(A, 'window.__p2.vis(".tbs-person")'): t.tap_el(A, '.tbs-person-x')
    # B (landscape) emote wheel
    t.tap_el(B, '.tbs-emote-btn'); t.adv(3)
    if check(ev(B, 'window.__p2.vis(".tbs-wheel")'), f'{P}: B (landscape) emote wheel opens'):
        layout(B, P, 'B wheel'); t.shot(B, f'{P}_B_wheel', 0)
        t.tap_el(B, '.tbs-wheel .tb-modal-close'); t.adv(3)
    # A (portrait) invite card layout (already shot), B landscape invite layout
    for pg, n in ((A, 'A'), (B, 'B')):
        t.tap_el(pg, '.tbs-friends-btn'); t.adv(3)
        layout(pg, P, f'{n} invite card')
        t.tap_el(pg, '.tbs-invite .tb-modal-close'); t.adv(3)
    t.adv(12, 6, 0.4)

def budget_flow(t, P, base_calls):
    """Busiest play-together view: 2 players, both emoting, a phrase bubble and a snowball in flight. Same frame with
    the remote dolls / name tags / snow fx hidden = base; the difference must be ≤ 6 draw calls."""
    A, B = t.A, t.B
    aid = ev(A, f'{C}.net.id')
    time.sleep(1.3)
    ev(A, 'window.__social.emote("dance")'); ev(B, 'window.__social.emote("heart")')
    t.adv(4)
    ev(B, f'{C}.snowball.throwAt("{aid}")'); t.adv(3)
    MEAS = """(() => { const c = window.__tinselby.ctx, P = window.__p2; const names = ['net-remotes', 'net-nametags', 'snow-fx'];
      const objs = names.map(n => c.engine.scene.getObjectByName(n)).filter(Boolean);
      P.fast(false); window.__tinselby.step(0, 1); const full = c.engine.renderer.info.render.calls;
      const vis = objs.map(o => o.visible); objs.forEach(o => { o.visible = false; });
      window.__tinselby.step(0, 1); const base = c.engine.renderer.info.render.calls;
      objs.forEach((o, i) => { o.visible = vis[i]; }); P.fast(true);
      return { full, base, flying: c.snowball.flying, dolls: c.net.stats().dolls }; })()"""
    for pg, n in ((B, 'B'), (A, 'A')):
        m = ev(pg, MEAS)
        check(m['full'] - m['base'] <= 6 and m['dolls'] >= 1, f'{P}: budget {n}: {m["full"]} calls with play-together vs {m["base"]} without (+{m["full"] - m["base"]} ≤ 6; dolls {m["dolls"]}, balls {m["flying"]})')
    t.shot(B, f'{P}_B_budget_view', 0)
    t.adv(40, 10, 0.05)

def back_to_big(t, P, code):
    A, B = t.A, t.B
    t.tap_el(A, '.tbs-friends-btn'); t.adv(4)
    check(ev(A, 'window.__p2.vis(".tbs-back")'), f'{P}: "Back to the big town" visible in the invite card')
    t.tap_el(A, '.tbs-back')
    ok = t.until(A, f'!{C}.net.town && {C}.net.players().length === 0', 600, 5, 0.05)
    check(ok, f'{P}: Back to the big town → public room, B gone from A')
    t.adv(20)
    check(not ev(A, 'window.__p2.vis(".tbs-pill")'), f'{P}: pill hidden in the big town')
    check(ev(A, "localStorage.getItem('tinselby.town')") is None, f'{P}: remembered town cleared')
    t.shot(A, f'{P}_A_back_big_town', 0)
    t.tap_el(A, '.tbs-invite .tb-modal-close'); t.adv(4)
    ok = t.until(B, f'{C}.net.players().length === 0', 900, 5, 0.05)
    check(ok, f'{P}: B sees A leave')

def baseline_calls(pg):
    return calls(pg)

AT_A, AT_B = '-1.3,9.6', '1.3,9.8'

def run_pair(b, P, va, vb, touch):
    opts = dict(is_mobile=True, has_touch=True) if touch else {}
    c = b.new_context(**opts)
    fresh_storage(c)
    t = Two(c, va, vb, 'ph' if touch else 'dt')
    t.load(t.A, f'&at={AT_A}', 'Ava')
    t.load(t.B, f'&at={AT_B}', 'Bram')
    t.adv(20)
    base = {'A': calls(t.A), 'B': calls(t.B)}  # before the friend town: nobody else here, no emotes
    print(f'  base calls A {base["A"]} B {base["B"]}', flush=True)
    code = town_flow(t, P)
    if touch and on('reload'): reload_b(t, P, code, 'Bram', AT_B)
    t.shot(t.B, f'{P}_B_sees_A'); t.shot(t.A, f'{P}_A_sees_B', 0)
    stages = [('emotes', emotes_flow), ('people', people_mute_flow), ('snow', snow_flow), ('gift', gift_flow)]
    if touch: stages.append(('portrait', portrait_flow))
    for name, fn in stages:
        if on(name):
            try: fn(t, P)
            except Exception as e: check(False, f'{P}: {name}: exception {str(e)[:300]}')
    if on('budget'): budget_flow(t, P, base)
    if touch:
        for rid in ('ferris', 'carousel', 'tram', 'carriage'):
            if not on(rid): continue
            try: ride_flow(t, P, rid, 2400 if rid in ('tram', 'carriage') else 900, True)
            except Exception as e: check(False, f'{P}: {rid}: exception {str(e)[:300]}')
            for pg in (t.A, t.B): ev(pg, f'{C}.rides.active && {C}.rides.active.stop()'); close_panels(pg)
            t.until(t.A, f'!{C}.rides.active', 600, 10); t.until(t.B, f'!{C}.rides.active', 600, 10); t.adv(20)
        if on('back'): back_to_big(t, P, code)
    c.close()

def w4off(b):
    pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.set_default_timeout(600000); attach(pg, 'w4off')
    pg.goto(ORIGIN + '/index.html?capture&play&net=local&tod=13&w3'); pg.wait_for_function(  # W4 is live: ?w3 turns it off
        'window.__tinselby && window.__tinselby.ready', timeout=300000)
    pg.evaluate('window.__tinselby.step(1/30, 20)')
    check(ev(pg, '!document.querySelector(".tbs-root") && !document.querySelector(".tbs-friends-btn")'), 'w4off: no social HUD in the DOM')
    check(ev(pg, f'!{C}.social.enabled && {C}.net.town === null && {C}.net.send("emote", {{e: "wave"}}) === false'), 'w4off: social disabled, net wave-4 API inert')
    check(ev(pg, f'{C}.rides.list.map(r => r.id).join(",")') == 'tram,carriage,ferris,carousel,skate,sled', 'w4off: rides list unchanged')
    check(ev(pg, f'{C}.rides.joinWith("x") === false && {C}.rides.ridersOf("ferris").length === 0'), 'w4off: ride-together API inert')
    check(ev(pg, f'!{C}.interact.spots || ![...({C}.interact.spots || [])].some(s => /-join$/.test(s.id))'), 'w4off: no "Join" ride prompts')
    r = json.loads(pg.evaluate(f'(async () => JSON.stringify(await {C}.tasks.selfTest({{ reset: true }})))()'))
    nf = len(r.get('fails', [])); npass = len(r.get('log', []))
    check(nf == 0 and npass == 359, f'w4off: selfTest {npass} pass / {nf} fail')
    for f in (r.get('fails') or [])[:10]: print('   ', f)
    pg.screenshot(path=f'{SHOTS}/{SHOT}_w4off_after_selftest.png')
    pg.close()

t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    if 'phone' in PARTS: run_pair(b, 'ph', {'width': 390, 'height': 844}, {'width': 844, 'height': 390}, True)
    if 'desktop' in PARTS: run_pair(b, 'dt', {'width': 1280, 'height': 720}, {'width': 1280, 'height': 720}, False)
    if 'w4off' in PARTS: w4off(b)
    b.close()
srv.shutdown()
print(f'\n{len(fails)} FAILS' + (':' if fails else ''), flush=True)
for f in fails: print('  - ' + f)
print(f'{len(errs)} CONSOLE ERRORS' + (':' if errs else ''))
for e in errs[:30]: print('  ' + e)
print(f'({round(time.time() - t0)} s)')
