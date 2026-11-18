// Entry screen: knitted title, then
//   first visit:  name → pick your character (style tray) → Enter Tinselby
//   returning:    "Welcome back, {name}!" → Continue (or Change style / use a different name)
import { cleanName } from '../core/names.js';
import { createStyleTray } from './wardrobe.js';
import { loadProfile, saveProfile, validStyle } from './profile.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createEntry(ctx, root, data) {
  const { game, engine } = ctx;
  const saved = loadProfile();
  const progName = (() => { try { return ctx.progress?.name || ctx.progress?.profile?.name || ''; } catch (e) { return ''; } })();
  const knownName = saved.name || progName ? cleanName(saved.name || progName, '') : '';
  const returning = !!knownName;
  let style = validStyle(saved.style, data);

  const el = document.createElement('div');
  el.className = 'tb-entry';
  const NB = 17;
  const bulbs = Array.from({ length: NB }, (_, i) => `<i style="--i:${i};--y:${(Math.sin((i / (NB - 1)) * Math.PI) * 14).toFixed(1)}px"></i>`).join('');
  const letters = [...'Tinselby'].map((c, i) => `<b class="${i % 2 ? 'cr' : 'rd'}" style="--r:${((i * 37) % 7 - 3) * 1.2}deg">${c}</b>`).join('');
  el.innerHTML = `
    <div class="tb-entry-head fade-in">
      <div class="tb-garland" aria-hidden="true">${bulbs}</div>
      <h1 class="tb-title" aria-label="Welcome to Tinselby"><span class="tb-welcome">Welcome to</span><span class="tb-word">${letters}</span></h1>
      <div class="knit-sub">A cosy knitted Christmas town</div>
    </div>
    <div class="tb-entry-body">
      <form class="knit-card tb-entry-card fade-in" autocomplete="off">
        <div class="tb-back-hello" ${returning ? '' : 'hidden'}>
          <div class="tb-hello">Welcome back, <span class="tb-hello-name">${esc(knownName)}</span>!</div>
          <div class="tb-hello-sub">${helloSub()}</div>
        </div>
        <div class="tb-namebox" ${returning ? 'hidden' : ''}>
          <label class="tb-label" for="tb-name">What should Tinselby call you?</label>
          <input id="tb-name" class="tb-input" type="text" maxlength="18" placeholder="Your name" enterkeyhint="next" spellcheck="false" value="${esc(knownName)}" />
        </div>
        <button type="submit" class="knit-btn tb-enter">${returning ? 'Continue' : 'Next: choose your look'}</button>
        <button type="button" class="knit-btn cream tb-style-toggle" ${returning ? '' : 'hidden'}>Change style</button>
        <button type="button" class="tb-link tb-rename" ${returning ? '' : 'hidden'}>Not ${esc(knownName)}? Use another name</button>
      </form>
    </div>`;
  root.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const body = $('.tb-entry-body');
  const form = $('.tb-entry-card');
  const input = $('#tb-name');
  const enterBtn = $('.tb-enter');
  let renaming = !returning;
  let step = 'name'; // 'name' | 'style'

  function helloSub() {
    try {
      const done = data.doneCount();
      const cur = data.current();
      if (cur) return done ? `${done} door${done === 1 ? '' : 's'} opened so far · Door ${cur} is waiting` : `Door ${cur} is waiting for you`;
      if (done) return `${done} doors opened · new doors are coming soon`;
    } catch (e) { /* stub */ }
    return 'Tinselby missed you';
  }

  const tray = createStyleTray(ctx, data, {
    style,
    primary: returning ? 'Continue' : 'Enter Tinselby',
    back: true,
    onChange: (s) => { style = s; },
    onPrimary: (s) => { style = s; start(); },
    onBack: () => showStep('name'),
  });
  tray.hide();
  body.appendChild(tray.el);

  function showStep(s) {
    step = s;
    const st = s === 'style';
    el.classList.toggle('tray-open', st);
    form.hidden = st;
    if (st) { tray.show(); tray.el.classList.remove('fade-in'); void tray.el.offsetWidth; tray.el.classList.add('fade-in'); }
    else { tray.hide(); }
  }
  function currentName() {
    const raw = renaming ? input.value : knownName;
    return cleanName(raw);
  }
  function start() {
    const name = currentName();
    saveProfile({ name, style });
    input.blur();
    try { ctx.net?.setName?.(name); } catch (e) { /* net may still be starting */ }
    game.emit('game:start', { name, style: { ...style } });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try { ctx.audio?.sfx?.('ui'); } catch (er) { /* */ }
    if (renaming && !returning) { if (!input.value.trim()) { input.focus(); input.classList.remove('nope'); void input.offsetWidth; input.classList.add('nope'); return; } showStep('style'); input.blur(); return; }
    start();
  });
  $('.tb-style-toggle').addEventListener('click', () => { try { ctx.audio?.sfx?.('ui'); } catch (er) { /* */ } showStep('style'); });
  $('.tb-rename').addEventListener('click', () => {
    renaming = true;
    $('.tb-back-hello').hidden = true;
    $('.tb-namebox').hidden = false;
    $('.tb-rename').hidden = true;
    input.value = '';
    enterBtn.textContent = 'Continue';
    input.focus();
  });
  game.on('ui:escape', () => { if (step === 'style') showStep('name'); });

  let gone = false;
  function hide() {
    if (gone) return;
    gone = true;
    tray.hide();
    const done = () => el.remove();
    if (engine.capture) { done(); return; } // headless capture: no fade
    el.classList.add('tb-leaving');
    setTimeout(done, 600);
  }
  return { el, hide, showStep, get style() { return style; }, returning, tray };
}
