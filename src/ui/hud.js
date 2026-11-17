// In-game HUD: Festive Spirit meter, current task chip, interact button, camera + mute buttons, touch joystick.
import { ICONS, spiritStar } from './icons.js';
import { createJoystick } from './joystick.js';

export function createHUD(ctx, root) {
  const { game, interact, player, cam, engine } = ctx;
  const S = game.state;
  const el = document.createElement('div');
  el.className = 'tb-hud';
  el.hidden = true;
  el.innerHTML = `
    <div class="tb-tl"><div class="tb-task" hidden><span class="tb-task-ico"></span><span class="tb-task-txt"></span></div></div>
    <div class="tb-tc">
      <div class="tb-spirit" role="img" aria-label="Festive Spirit">
        <div class="tb-spirit-lab">Festive Spirit</div>
        <div class="tb-stars">${Array.from({ length: S.spiritMax }, () => spiritStar()).join('')}</div>
      </div>
    </div>
    <div class="tb-tr">
      <button class="knit-btn cream round tb-cam" aria-label="Change camera view">${ICONS.mountain}</button>
      <button class="knit-btn cream round tb-mute" aria-label="Mute">${ICONS.soundOn}</button>
    </div>
    <button class="knit-btn green tb-act" hidden><span class="tb-act-ico"></span><span class="tb-act-lab"></span></button>
    <div class="tb-keys" hidden><b>WASD</b> / arrows or click to walk · <b>E</b> interact · <b>C</b> camera · <b>M</b> mute</div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const stars = [...el.querySelectorAll('.tb-sstar')];
  const task = $('.tb-task'), taskTxt = $('.tb-task-txt'), taskIco = $('.tb-task-ico');
  const act = $('.tb-act'), actLab = $('.tb-act-lab'), actIco = $('.tb-act-ico');
  const camBtn = $('.tb-cam'), muteBtn = $('.tb-mute');
  const keys = $('.tb-keys');

  // ---- spirit meter
  function setSpirit(v, pop) {
    stars.forEach((s, i) => {
      const on = i < v;
      if (on && !s.classList.contains('on') && pop) { s.classList.remove('pop'); void s.getBoundingClientRect(); s.classList.add('pop'); }
      s.classList.toggle('on', on);
    });
  }
  setSpirit(S.spirit, false);
  game.on('spirit:change', ({ value }) => setSpirit(value, true));

  // ---- buttons
  const tap = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); try { ctx.audio?.sfx?.('ui'); } catch (er) { /* */ } };
  act.addEventListener('click', tap(() => game.emit('interact')));
  camBtn.addEventListener('click', tap(() => game.emit('camera:toggle')));
  muteBtn.addEventListener('click', tap(() => game.emit('audio:toggle')));
  for (const b of [act, camBtn, muteBtn]) b.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---- joystick (touch devices only; also appears on the first touch)
  let joy = null;
  const coarse = matchMedia('(pointer: coarse)').matches || engine.isMobile;
  const ensureJoy = () => { if (!joy) joy = createJoystick(ctx, el); };
  if (coarse) ensureJoy();
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { ensureJoy(); keys.hidden = true; } }, { passive: true });

  // ---- keyboard hint (desktop, first seconds of play)
  let keysT = coarse ? -1 : 0;
  game.on('game:start', () => { if (!coarse) { keysT = 9; keys.hidden = false; } });

  // ---- per-frame sync (only touches the DOM when something changed)
  let lastLabel = null, lastIcon = null, lastTask = null, lastMuted = null, lastMode = null, lastShow = null;
  function update(dt) {
    const show = S.phase === 'play';
    if (show !== lastShow) { el.hidden = !show; lastShow = show; if (!show) joy?.reset(); }
    if (!show) return;
    // interact button
    const cur = interact.current;
    const can = cur && player.controllable && !cam.shotActive && cur.enabled();
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
    // task chip
    const obj = ctx.tasks?.objective;
    const t = obj ? obj.text : '';
    if (t !== lastTask) {
      lastTask = t;
      task.hidden = !t;
      if (t) {
        taskTxt.textContent = t;
        taskIco.innerHTML = ICONS[obj.icon] || ICONS.star;
        task.classList.remove('flash'); void task.offsetWidth; task.classList.add('flash');
      }
    }
    // mute + camera state
    const muted = !!ctx.audio?.muted;
    if (muted !== lastMuted) { lastMuted = muted; muteBtn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn; muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); muteBtn.classList.toggle('off', muted); }
    const mode = cam.mode;
    if (mode !== lastMode) { lastMode = mode; camBtn.innerHTML = mode === 'high' ? ICONS.camera : ICONS.mountain; camBtn.setAttribute('aria-label', mode === 'high' ? 'Follow camera' : 'Bird’s-eye view'); }
    if (keysT > 0) { keysT -= dt; if (keysT <= 0 || player.speed > 0.3 && keysT < 6) { keys.classList.add('out'); keysT = -1; setTimeout(() => { keys.hidden = true; }, 600); } }
  }
  return { el, update };
}
