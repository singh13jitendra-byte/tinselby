// In-game HUD: ONE goal card (door + what to do now + distance + "?", also shows calendar hints) with the Town Spirit / online chips under it (top-left),
// calendar, wardrobe, camera and mute buttons (top-right), the big interact button and the touch joystick.
// Hidden during mini-games (the framework has its own HUD), the finale and while a panel is open; the joystick stays
// available in mini-games that let the player walk.
import { ICONS } from './icons.js';
import { createJoystick } from './joystick.js';
import { W3 } from '../progress/doors.js';

export function createHUD(ctx, root, data, ui) {
  const { game, interact, player, cam, engine } = ctx;
  const S = game.state;
  const el = document.createElement('div');
  el.className = 'tb-hud';
  el.hidden = true;
  el.innerHTML = `
    <div class="tb-tl">
      <div class="tb-door tb-goal tb-task" role="button" tabindex="0" aria-label="Open the Advent calendar">
        <span class="tb-door-n"></span>
        <span class="tb-door-txt"></span>
        <button class="tb-goal-help" aria-label="Help: what do I do now?" title="What do I do now?">?</button>
        <span class="tb-goal-main"><span class="tb-hint-arrow" hidden>${ICONS.arrow}</span><span class="tb-goal-txt"><span class="tb-goal-t"></span><span class="tb-goal-dist" hidden></span></span></span>
      </div>
      <div class="tb-stats">
        <span class="tb-chip tb-spirit" title="Town Spirit: doors opened by everyone">${ICONS.snowflake}<b></b></span>
        <button class="tb-chip tb-online" hidden title="People in your town" aria-label="People in your town">${ICONS.people}<b></b></button>
      </div>
    </div>
    <div class="tb-tr">
      <button class="knit-btn cream round tb-cal" aria-label="Advent calendar">${ICONS.calendar}<i class="tb-dot" hidden></i></button>
      <button class="knit-btn cream round tb-ward" aria-label="Wardrobe">${ICONS.jumper}</button>
      <button class="knit-btn cream round tb-cam" aria-label="Change camera view">${ICONS.mountain}</button>
      <button class="knit-btn cream round tb-mute" aria-label="Mute">${ICONS.soundOn}</button>
    </div>
    <button class="knit-btn green tb-act" hidden><span class="tb-act-ico"></span><span class="tb-act-lab"></span></button>
    <div class="tb-keys" hidden><b>WASD</b> / arrows or click to walk · <b>E</b> interact · <b>C</b> camera · <b>M</b> mute</div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const goalTxt = $('.tb-goal-txt'), goalT = $('.tb-goal-t'), goalDist = $('.tb-goal-dist'), goalHelp = $('.tb-goal-help'), pillArrow = $('.tb-hint-arrow');
  const doorChip = $('.tb-door'), doorN = $('.tb-door-n'), doorTxt = $('.tb-door-txt');
  const spiritB = $('.tb-spirit b'), online = $('.tb-online'), onlineB = $('.tb-online b');
  const act = $('.tb-act'), actLab = $('.tb-act-lab'), actIco = $('.tb-act-ico');
  const calBtn = $('.tb-cal'), calDot = $('.tb-dot'), wardBtn = $('.tb-ward'), camBtn = $('.tb-cam'), muteBtn = $('.tb-mute');
  const keys = $('.tb-keys');

  // ---- buttons
  const sfx = (n) => { try { ctx.audio?.sfx?.(n); } catch (e) { /* */ } };
  const tap = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); sfx('ui'); };
  act.addEventListener('click', tap(() => game.emit('interact')));
  camBtn.addEventListener('click', tap(() => game.emit('camera:toggle')));
  muteBtn.addEventListener('click', tap(() => game.emit('audio:toggle')));
  calBtn.addEventListener('click', tap(() => ctx.calendar?.open?.()));
  online.addEventListener('click', tap(() => ctx.social?.openRoster?.())); // "People in your town" sheet (src/social/roster.js)
  doorChip.addEventListener('click', tap(() => ctx.calendar?.open?.()));
  doorChip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.calendar?.open?.(); } });
  // "?" → the Tips module's help card; until it exists, briefly show the whole goal text
  let fullT = 0;
  goalHelp.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); sfx('ui');
    if (ctx.tips?.help) { try { ctx.tips.help(); return; } catch (err) { console.error('[hud] tips.help', err); } }
    doorChip.classList.add('full'); fullT = 6;
  });
  goalHelp.addEventListener('pointerdown', (e) => e.stopPropagation());
  wardBtn.addEventListener('click', tap(() => ui.wardrobe?.open()));
  for (const b of [act, camBtn, muteBtn, calBtn, wardBtn, doorChip]) b.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---- joystick: its own layer so it can stay up in walking mini-games while the HUD is hidden
  const joyLayer = document.createElement('div');
  joyLayer.className = 'tb-joylayer';
  joyLayer.hidden = true;
  root.appendChild(joyLayer);
  let joy = null;
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches || engine.isMobile;
  let wantJoy = coarse;
  const ensureJoy = () => { if (!joy) joy = createJoystick(ctx, joyLayer); };
  if (coarse) ensureJoy();
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { wantJoy = true; ensureJoy(); keys.hidden = true; } }, { passive: true });

  // ---- keyboard hint (desktop, first seconds of play)
  let keysT = coarse ? -1 : 0;
  game.on('game:start', () => { if (!coarse) { keysT = 9; keys.hidden = false; } });

  // ---- hint target (calendar taps, newly opened doors)
  let hint = null; // {x, z, text, t}
  function setHint(h) { hint = h ? { ...h, t: 0 } : null; lastTask = null; pillArrow.hidden = !hint; doorChip.classList.toggle('hinted', !!hint); if (hint) { doorChip.classList.remove('flash'); void doorChip.offsetWidth; doorChip.classList.add('flash'); } }

  // ---- per-frame sync (only touches the DOM when something changed)
  let lastDist = null, lastLabel = null, lastIcon = null, lastTask = null, lastMuted = null, lastMode = null, lastShow = null, lastJoy = null, lastRide = false;
  let lastDoor = null, lastSpirit = null, lastOnline = null, lastDot = null, slow = 0;
  function update(dt) {
    const modal = ui.modalOpen();
    const show = S.phase === 'play' && !modal;
    if (show !== lastShow) { el.hidden = !show; lastShow = show; }
    // cable car ride: the eye-level ride shot owns the screen; only the mute button stays (CSS .tb-ride), and the 'Tap to skip' pill lives in overlays
    const ride = cam.shotName === 'cablecarRide' || !!ctx.rides?.active; // free-play rides (src/rides) own the screen too
    if (ride !== lastRide) { lastRide = ride; el.classList.toggle('tb-ride', ride); }
    const joyOn = wantJoy && !ride && ((S.phase === 'play' && !modal) || (S.phase === 'minigame' && player.controllable));
    if (joyOn !== lastJoy) { lastJoy = joyOn; joyLayer.hidden = !joyOn; if (!joyOn) joy?.reset(); }
    if (!show) return;
    // interact button
    const cur = interact.current;
    const can = cur && player.controllable && (!cam.shotActive || cam.shotName === 'advent-frame') && cur.enabled();
    const label = can ? cur.label : null;
    if (label !== lastLabel || (can && cur.icon !== lastIcon)) {
      lastLabel = label;
      if (label) {
        actLab.textContent = label;
        lastIcon = cur.icon;
        actIco.innerHTML = ICONS[cur.icon] || ICONS.hand;
        if (act.hidden) { act.hidden = false; act.classList.remove('pop'); void act.offsetWidth; act.classList.add('pop'); }
      } else act.hidden = true;
    }
    // goal line: the calendar hint ("Go there", newly opened door) wins, else the current door's objective, else a friendly quiet line
    const doorNow = data.current();
    const raw = hint ? hint.text : data.goalText();
    const t = raw || (doorNow ? `Open the calendar to see door ${doorNow}` : QUIET);
    if (t !== lastTask) {
      lastTask = t;
      goalT.textContent = t;
      goalTxt.title = t;
      doorChip.classList.toggle('quiet', !raw && !doorNow);
      goalHelp.hidden = !raw && !doorNow;
      doorChip.classList.remove('flash'); void doorChip.offsetWidth; doorChip.classList.add('flash');
    }
    if (fullT > 0) { fullT -= dt; if (fullT <= 0) doorChip.classList.remove('full'); }
    // hint: live arrow until you get there (or 45 s)
    if (hint) {
      hint.t += dt;
      const d = Math.hypot(hint.x - player.pos.x, hint.z - player.pos.z);
      if (d < 1.7 || hint.t > 45) { const r = hint; setHint(null); void r; }
      else pillArrow.style.transform = `rotate(${ui.screenAngle(hint.x, hint.z).toFixed(3)}rad)`;
    }
    // slower bookkeeping (door chip, spirit, online) ~4×/s
    slow -= dt;
    if (slow <= 0) {
      slow = 0.25;
      const c = data.current();
      // wave 3: with 23 doors done the chip counts the sleeps to Christmas Eve; once door 24 is done there is no 'more soon'
      let dk = c ? `${c}|${data.door(c)?.title}` : data.waveDone() ? 'wave' : '';
      let eveTxt = '';
      if (!c && W3 && dk === 'wave') {
        if (data.state(24) === 'done') dk = 'allDone';
        else if (data.state(24) !== 'open') { const e = data.eve(); eveTxt = e.isEve ? 'Christmas Eve is here' : `Christmas Eve in ${data.sleepsText(e.sleeps)}`; dk = 'eve|' + eveTxt; }
      }
      if (dk !== lastDoor) {
        const changed = lastDoor !== null;
        lastDoor = dk;
        if (c) { doorN.textContent = String(c); doorTxt.innerHTML = `<b>Door ${c}</b> · ${escapeHTML(data.door(c)?.title || '')}`; }
        else if (dk === 'allDone') { doorN.textContent = '★'; doorTxt.innerHTML = '<b>All 24 doors open</b>'; }
        else if (eveTxt) { doorN.textContent = '★'; doorTxt.innerHTML = `<b>${escapeHTML(eveTxt)}</b>`; }
        else if (dk === 'wave') { doorN.textContent = '★'; doorTxt.innerHTML = `<b>${data.doneCount()} doors open</b> · more soon!`; }
        else { doorN.textContent = '★'; doorTxt.innerHTML = '<b>Advent Calendar</b>'; }
        if (changed) { doorChip.classList.remove('flash'); void doorChip.offsetWidth; doorChip.classList.add('flash'); }
      }
      // distance to wherever the goal line points: the guide's target, else the hint / objective spot
      let dd = ctx.guide?.target?.dist;
      if (!Number.isFinite(dd)) {
        const o = hint || ctx.tasks?.objective;
        dd = o && Number.isFinite(o.x) ? Math.hypot(o.x - player.pos.x, o.z - player.pos.z) : null;
      }
      const dt2 = dd == null || doorChip.classList.contains('quiet') ? '' : dd < 3 ? 'here' : `${Math.round(dd / 5) * 5} m`;
      if (dt2 !== lastDist) { lastDist = dt2; goalDist.hidden = !dt2; goalDist.textContent = dt2 ? ' · ' + dt2 : ''; }
      const ts = data.townSpirit().doors;
      if (ts !== lastSpirit) { lastSpirit = ts; spiritB.textContent = ts.toLocaleString(); }
      const on = data.online ? data.playerCount() : 0;
      if (on !== lastOnline) { lastOnline = on; online.hidden = !on; onlineB.textContent = String(on); }
      const dot = data.dailyAvailable;
      if (dot !== lastDot) { lastDot = dot; calDot.hidden = !dot; }
    }
    // mute + camera state
    const muted = !!ctx.audio?.muted;
    if (muted !== lastMuted) { lastMuted = muted; muteBtn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn; muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); muteBtn.classList.toggle('off', muted); }
    // the button shows the NEXT view in the cycle follow → eye → high
    const next = cam.nextView || (cam.mode === 'high' ? 'follow' : 'high');
    if (next !== lastMode) {
      lastMode = next;
      const [ic, label] = next === 'eye' ? [ICONS.eye, 'Eye view'] : next === 'high' ? [ICONS.mountain, 'Bird’s-eye view'] : [ICONS.camera, 'Follow camera'];
      camBtn.innerHTML = ic; camBtn.setAttribute('aria-label', label); camBtn.title = label;
    }
    if (keysT > 0) { keysT -= dt; if (keysT <= 0 || player.speed > 0.3 && keysT < 6) { keys.classList.add('out'); keysT = -1; setTimeout(() => { keys.hidden = true; }, 600); } }
  }
  return { el, update, setHint, get hint() { return hint; } };
}

const QUIET = 'All done for today — explore, ride, play with friends!';
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
