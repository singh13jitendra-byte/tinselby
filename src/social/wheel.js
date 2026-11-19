// The emote wheel: 8 emotes + ready-made phrases in 4 tabs. A modal-ish knitted panel (no typing anywhere).
import { PHRASE_TABS, EMOTES } from './phrases.js';

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** Glyphs for the social buttons (same style as src/ui/icons.js). */
export const SOCIAL_ICONS = {
  emoji: svg('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".18"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="M8 14c1 1.8 2.2 2.6 4 2.6s3-.8 4-2.6"/>'),
  wave: svg('<path d="M8 13V7.5a1.4 1.4 0 0 1 2.8 0V12m0-5.5V5a1.4 1.4 0 0 1 2.8 0v6.5m0-4.5a1.4 1.4 0 0 1 2.8 0V13m0-2.5a1.4 1.4 0 0 1 2.8 0V15c0 3.6-2.8 6-6 6s-4.600-1.400-6-3.800L5.200 14a1.300 1.300 0 0 1 2.300-1.200L8 13.500" fill="currentColor" fill-opacity=".18"/><path d="M3 6.500c.7-1.500 1.700-2.500 3-3M21 4.500c-.7-1-1.700-1.700-3-2"/>'),
  cheer: svg('<circle cx="12" cy="7.500" r="2.600" fill="currentColor" fill-opacity=".25"/><path d="M12 10.500v5.500M12 12.500L6 5.500M12 12.500l6-7M12 16l-3.500 5M12 16l3.500 5"/><path d="M3.500 10.500l1.500.7M20.500 10.500l-1.500.7" />'),
  dance: svg('<circle cx="10" cy="5.500" r="2.500" fill="currentColor" fill-opacity=".25"/><path d="M11 8.500l1.500 5-3 2.500-1.500 5M12.500 13.500l3.500 3 .5 4M10.500 10l-5 1M11.500 9.500l5-3.500"/><path d="M18.500 10.500c.8.700 1 1.600.5 2.500M20.500 9c1.400 1.300 1.700 3 .8 4.600"/>'),
  clap: svg('<path d="M9.500 4.500L7 12.500c-.6 2 .4 4 2 5l2 1.200M14.500 4.500L17 12.500c.6 2-.4 4-2 5l-2 1.200" fill="currentColor" fill-opacity=".2"/><path d="M12 3v3M5.500 6l1.500 1.500M18.500 6L17 7.500M3.500 10.500h2M18.500 10.500h2"/>'),
  heart: svg('<path d="M12 20.500S3.500 15.500 3.500 9.200A4.600 4.600 0 0 1 12 6.800a4.600 4.600 0 0 1 8.500 2.400c0 6.300-8.500 11.300-8.500 11.300z" fill="currentColor" fill-opacity=".3"/>'),
  laugh: svg('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".18"/><path d="M7.500 9.500l2 1M16.500 9.500l-2 1"/><path d="M7.500 13.500h9c0 3-2 5-4.500 5s-4.500-2-4.500-5z" fill="currentColor" fill-opacity=".35"/>'),
  bow: svg('<circle cx="16.500" cy="8" r="2.500" fill="currentColor" fill-opacity=".25"/><path d="M14.500 10L8 14.500l-.5 6.500M8 14.500L4 12M14.500 10.500l-2 4.500"/><path d="M4 20.500h16"/>'),
  snowangel: svg('<circle cx="12" cy="5" r="2.200" fill="currentColor" fill-opacity=".25"/><path d="M12 7.500V14M12 9.500L5.500 7M12 9.500l6.500-2.500M12 14l-4 6.500M12 14l4 6.500"/><path d="M4 12.500l1 .5M20 12.500l-1 .5M3.500 16h1.500M19 16h1.500"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  copy: svg('<rect x="8.500" y="8.500" width="11.500" height="11.500" rx="2.500" fill="currentColor" fill-opacity=".18"/><path d="M15.500 8.500V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.500a2 2 0 0 0 2 2h2.500"/>'),
  share: svg('<circle cx="6.500" cy="12" r="2.600" fill="currentColor" fill-opacity=".25"/><circle cx="17.500" cy="6" r="2.600" fill="currentColor" fill-opacity=".25"/><circle cx="17.500" cy="18" r="2.600" fill="currentColor" fill-opacity=".25"/><path d="M8.800 10.800l6.400-3.600M8.800 13.200l6.400 3.600"/>'),
  mute: svg('<path d="M4 9.500h4L13 5v14l-5-4.500H4z" fill="currentColor" fill-opacity=".25"/><path d="M17 9.500l5 5m0-5l-5 5"/>'),
  unmute: svg('<path d="M4 9.500h4L13 5v14l-5-4.500H4z" fill="currentColor" fill-opacity=".25"/><path d="M16.500 9a4 4 0 0 1 0 6M19 6.500a7.500 7.500 0 0 1 0 11"/>'),
  town: svg('<path d="M3.500 11L12 4l8.500 7" /><path d="M5.500 10v10h13V10" fill="currentColor" fill-opacity=".2"/><path d="M9.500 20v-5h5v5"/>'),
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createWheel(ctx, social) {
  const { uiRoot } = ctx;
  const el = document.createElement('div');
  el.className = 'tbs-wheel-layer';
  el.hidden = true;
  el.innerHTML = `
    <div class="tbs-scrim"></div>
    <div class="tbs-wheel knit-card interactive" role="dialog" aria-label="Say something">
      <div class="tb-modal-title"><span class="tbs-title-ico">${SOCIAL_ICONS.emoji}</span>Say something</div>
      <button class="knit-btn cream round tb-modal-close" aria-label="Close">${SOCIAL_ICONS.close}</button>
      <div class="tbs-wheel-body">
        <div class="tbs-emotes" role="group" aria-label="Emotes">
          ${EMOTES.map((e) => `<button class="tbs-emote" data-e="${e.id}" aria-label="${esc(e.label)}"><span class="tbs-emote-ico">${SOCIAL_ICONS[e.id]}</span><span class="tbs-emote-lab">${esc(e.label)}</span></button>`).join('')}
        </div>
        <div class="tbs-says">
          <div class="tbs-tabs" role="tablist">
            ${PHRASE_TABS.map((t, i) => `<button class="tbs-tab" role="tab" data-t="${t.id}" aria-selected="${i === 0}">${esc(t.label)}</button>`).join('')}
          </div>
          <div class="tbs-phrases" role="group"></div>
        </div>
      </div>
    </div>`;
  uiRoot.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const panel = $('.tbs-wheel'), list = $('.tbs-phrases');
  let tab = PHRASE_TABS[0].id;
  let isOpen = false;

  function renderPhrases() {
    const t = PHRASE_TABS.find((x) => x.id === tab) || PHRASE_TABS[0];
    list.innerHTML = t.phrases.map((p) => `<button class="tbs-phrase" data-p="${p.id}">${esc(p.text)}</button>`).join('');
    el.querySelectorAll('.tbs-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === t.id)));
  }
  renderPhrases();

  const stop = (e) => e.stopPropagation();
  panel.addEventListener('pointerdown', stop);
  $('.tbs-scrim').addEventListener('pointerdown', (e) => { e.stopPropagation(); close(); });
  $('.tb-modal-close').addEventListener('click', (e) => { e.stopPropagation(); social.sfx('ui'); close(); });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('tb-modal-close')) return;
    e.stopPropagation();
    if (b.dataset.t) { tab = b.dataset.t; social.sfx('ui'); renderPhrases(); return; }
    let ok = false;
    if (b.dataset.e) ok = social.emote(b.dataset.e);
    else if (b.dataset.p) ok = social.say(b.dataset.p);
    if (ok) { social.sfx('pop'); close(); }
    else { panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake'); } // still cooling down
  });

  function open() {
    if (isOpen || !social.free()) return false;
    social.closeAll('wheel');
    isOpen = true; el.hidden = false;
    social.sfx('ui');
    panel.classList.remove('shake');
    (panel.querySelector('.tbs-emote') || panel).focus?.({ preventScroll: true });
    return true;
  }
  function close() { if (!isOpen) return; isOpen = false; el.hidden = true; }
  return { el, open, close, toggle: () => (isOpen ? close() : open()), get isOpen() { return isOpen; } };
}
