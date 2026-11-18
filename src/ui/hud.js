// In-game HUD: current-door goal chip + hint pill (top-left), door progress / Town Spirit / online chips (top-centre),
// calendar, wardrobe, camera and mute buttons (top-right), the big interact button and the touch joystick.
// Hidden during mini-games (the framework has its own HUD), the finale and while a panel is open; the joystick stays
// available in mini-games that let the player walk.
import { ICONS } from './icons.js';
import { createJoystick } from './joystick.js';

export function createHUD(ctx, root, data, ui) {
  const { game, interact, player, cam, engine } = ctx;
  const S = game.state;
  const el = document.createElement('div');
  el.className = 'tb-hud';
  el.hidden = true;
  el.innerHTML = `
    <div class="tb-tl">
      <div class="tb-task" hidden><span class="tb-task-ico"></span><span class="tb-task-txt"></span></div>
      <div class="tb-hintpill" hidden><span class="tb-hint-arrow">${ICONS.arrow}</span><span class="tb-hint-txt"></span></div>
    </div>
    <div class="tb-tc">
      <button class="tb-door" aria-label="Open the Advent calendar"><span class="tb-door-n"></span><span class="tb-door-txt"></span></button>
      <div class="tb-chips">
        <span class="tb-chip tb-spirit" title="Town Spirit: doors opened by everyone">${ICONS.snowflake}<b></b></span>
        <span class="tb-chip tb-online" hidden title="Players in your town">${ICONS.people}<b></b></span>
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
  const task = $('.tb-task'), taskTxt = $('.tb-task-txt'), taskIco = $('.tb-task-ico');
  const pill = $('.tb-hintpill'), pillArrow = $('.tb-hint-arrow'), pillTxt = $('.tb-hint-txt');
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
  doorChip.addEventListener('click', tap(() => ctx.calendar?.open?.()));
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
  function setHint(h) { hint = h ? { ...h, t: 0 } : null; pill.hidden = !hint; if (hint) { pillTxt.textContent = hint.text; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); } }

  // ---- per-frame sync (only touches the DOM when something changed)
  let lastLabel = null, lastIcon = null, lastTask = null, lastMuted = null, lastMode = null, lastShow = null, lastJoy = null;
  let lastDoor = null, lastSpirit = null, lastOnline = null, lastDot = null, slow = 0;
  function update(dt) {
    const modal = ui.modalOpen();
    const show = S.phase === 'play' && !modal;
    if (show !== lastShow) { el.hidden = !show; lastShow = show; }
    const joyOn = wantJoy && ((S.phase === 'play' && !modal) || (S.phase === 'minigame' && player.controllable));
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
    // task chip: the current door's goal
    const obj = ctx.tasks?.objective;
    const t = data.goalText();
    if (t !== lastTask) {
      lastTask = t;
      task.hidden = !t;
      if (t) {
        taskTxt.textContent = t;
        taskIco.innerHTML = ICONS[obj?.icon] || ICONS.star;
        task.classList.remove('flash'); void task.offsetWidth; task.classList.add('flash');
      }
    }
    // hint pill: live arrow until you get there (or 45 s)
    if (hint) {
      hint.t += dt;
      const d = Math.hypot(hint.x - player.pos.x, hint.z - player.pos.z);
      if (d < 1.7 || hint.t > 45) setHint(null);
      else pillArrow.style.transform = `rotate(${ui.screenAngle(hint.x, hint.z).toFixed(3)}rad)`;
    }
    // slower bookkeeping (door chip, spirit, online) ~4×/s
    slow -= dt;
    if (slow <= 0) {
      slow = 0.25;
      const c = data.current();
      const dk = c ? `${c}|${data.door(c)?.title}` : data.waveDone() ? 'wave' : '';
      if (dk !== lastDoor) {
        const changed = lastDoor !== null;
        lastDoor = dk;
        if (c) { doorN.textContent = String(c); doorTxt.innerHTML = `<b>Door ${c}</b> · ${escapeHTML(data.door(c)?.title || '')}`; }
        else if (dk === 'wave') { doorN.textContent = '★'; doorTxt.innerHTML = `<b>${data.doneCount()} doors open</b> · more soon!`; }
        else { doorN.textContent = '★'; doorTxt.innerHTML = '<b>Advent Calendar</b>'; }
        if (changed) { doorChip.classList.remove('flash'); void doorChip.offsetWidth; doorChip.classList.add('flash'); }
      }
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

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
