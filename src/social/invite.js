// "Play with friends": create a private friends town, copy / share the link, join with a 6-character code, or go back
// to the big (public) town. The code box is the ONLY text input in the whole game.
import { SOCIAL_ICONS } from './wheel.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // same as the net's town codes
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createInvite(ctx, social) {
  const { uiRoot, game } = ctx;
  const el = document.createElement('div');
  el.className = 'tb-modal tbs-invite-layer';
  el.hidden = true;
  el.innerHTML = `
    <div class="tbs-invite knit-card interactive" role="dialog" aria-label="Play with friends">
      <div class="tb-modal-title"><span class="tbs-title-ico">${SOCIAL_ICONS.town}</span>Play with friends</div>
      <button class="knit-btn cream round tb-modal-close" aria-label="Close">${SOCIAL_ICONS.close}</button>
      <div class="tbs-invite-grid">
        <section class="tbs-inv-a">
          <div class="tbs-inv-make">
            <p class="tbs-lead">Make a private town, then share the link. Friends who open it walk in right beside you.</p>
            <button class="knit-btn green tbs-create">Create a friends town</button>
          </div>
          <div class="tbs-inv-have" hidden>
            <div class="tbs-kicker">Your friends town</div>
            <div class="tbs-code" aria-live="polite"></div>
            <div class="tbs-link"></div>
            <div class="tbs-share-row">
              <button class="knit-btn green tbs-copy">${SOCIAL_ICONS.copy}<span>Copy link</span></button>
              <button class="knit-btn cream tbs-share" hidden>${SOCIAL_ICONS.share}<span>Share</span></button>
            </div>
            <div class="tbs-here"></div>
          </div>
        </section>
        <section class="tbs-inv-b">
          <label class="tbs-kicker" for="tbs-code-in">Join with a code</label>
          <div class="tbs-join-row">
            <input id="tbs-code-in" class="tbs-code-in" type="text" maxlength="6" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="Friend code, 6 letters or numbers">
            <button class="knit-btn green tbs-join" disabled>Join</button>
          </div>
          <div class="tbs-msg" role="status"></div>
          <button class="knit-btn cream tbs-back" hidden>${SOCIAL_ICONS.town}<span>Back to the big town</span></button>
        </section>
      </div>
    </div>`;
  uiRoot.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const card = $('.tbs-invite'), make = $('.tbs-inv-make'), have = $('.tbs-inv-have');
  const codeEl = $('.tbs-code'), linkEl = $('.tbs-link'), hereEl = $('.tbs-here');
  const input = $('.tbs-code-in'), joinBtn = $('.tbs-join'), msg = $('.tbs-msg'), back = $('.tbs-back');
  const copyBtn = $('.tbs-copy'), shareBtn = $('.tbs-share'), createBtn = $('.tbs-create');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  shareBtn.hidden = !canShare;
  let isOpen = false, pending = null, pendingT = 0, copiedT = 0, lastKey = '';

  const net = () => ctx.net;
  const hasNet = () => typeof net()?.joinTown === 'function' && typeof net()?.newTownCode === 'function';
  /** The friends town we are in (or about to be in): {code, url, count} | null */
  function town() {
    const t = net()?.town;
    if (t?.code) return { code: t.code, url: t.url || net()?.inviteUrl?.(t.code) || '', count: social.townCount() };
    if (pending && performance.now() - pendingT < 6000) return { code: pending, url: net()?.inviteUrl?.(pending) || '', count: 1 };
    return null;
  }
  const setMsg = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); };

  function render() {
    const t = town();
    const key = t ? `${t.code}|${t.count}|${t.url}` : '';
    const offline = !hasNet();
    const k2 = `${key}|${offline}|${copiedT > 0}`;
    if (k2 === lastKey) return;
    lastKey = k2;
    make.hidden = !!t;
    have.hidden = !t;
    back.hidden = !t;
    createBtn.disabled = offline;
    if (offline) { $('.tbs-lead').textContent = 'Friends towns need an online connection, and it isn’t available right now.'; }
    else $('.tbs-lead').textContent = 'Make a private town, then share the link. Friends who open it walk in right beside you.';
    if (t) {
      codeEl.textContent = t.code;
      linkEl.textContent = (t.url || '').replace(/^https?:\/\//, '');
      hereEl.textContent = `${t.count} here now`;
    }
    copyBtn.querySelector('span').textContent = copiedT > 0 ? 'Copied!' : 'Copy link';
    copyBtn.classList.toggle('done', copiedT > 0);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try { // older / insecure contexts
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  const stop = (e) => e.stopPropagation();
  card.addEventListener('pointerdown', stop);
  el.addEventListener('pointerdown', (e) => { stop(e); if (e.target === el) close(); });
  $('.tb-modal-close').addEventListener('click', (e) => { stop(e); social.sfx('ui'); close(); });

  createBtn.addEventListener('click', (e) => {
    stop(e);
    if (!hasNet()) { setMsg('Not available right now.', true); return; }
    social.sfx('ui');
    let code = null;
    try { code = net().newTownCode(); if (net().joinTown(code) === false) code = null; } catch (err) { code = null; }
    if (!code) { setMsg('Couldn’t make a town. Are you online?', true); return; }
    pending = code; pendingT = performance.now();
    setMsg('');
    lastKey = ''; render();
    social.toast(`Friends town ${code} is ready. Share the link!`);
  });
  copyBtn.addEventListener('click', async (e) => {
    stop(e);
    const t = town(); if (!t?.url) return;
    social.sfx('ui');
    if (await copy(t.url)) { copiedT = 2; lastKey = ''; render(); setTimeout(() => { copiedT = 0; lastKey = ''; render(); }, 1800); }
    else setMsg('Couldn’t copy. Press and hold the link instead.', true);
  });
  shareBtn.addEventListener('click', async (e) => {
    stop(e);
    const t = town(); if (!t?.url) return;
    social.sfx('ui');
    try { await navigator.share({ title: 'Tinselby', text: 'Come and play in my Tinselby town!', url: t.url }); } catch (err) { /* cancelled */ }
  });
  back.addEventListener('click', (e) => {
    stop(e);
    social.sfx('ui');
    try { net()?.leaveTown?.(); } catch (err) { /* */ }
    pending = null; lastKey = '';
    setMsg('You’re back in the big town.');
    render();
    social.toast('Back in the big town');
  });

  const clean = (s) => String(s || '').toUpperCase().split('').filter((c) => ALPHABET.includes(c)).join('').slice(0, 6);
  input.addEventListener('input', () => {
    const v = clean(input.value);
    if (v !== input.value) input.value = v;
    joinBtn.disabled = v.length !== 6;
    if (msg.classList.contains('bad')) setMsg('');
  });
  function join() {
    const code = clean(input.value);
    if (code.length !== 6) { setMsg('A code has 6 letters or numbers.', true); return; }
    if (typeof net()?.joinTown !== 'function') { setMsg('Not available right now.', true); return; }
    social.sfx('ui');
    if (net().town?.code === code) { setMsg('You’re already in that town.'); return; }
    try { if (net().joinTown(code) === false) throw new Error('refused'); } catch (err) { setMsg('Couldn’t join that code. Are you online?', true); return; }
    pending = code; pendingT = performance.now();
    input.value = ''; joinBtn.disabled = true; input.blur();
    setMsg(`Joining ${code}…`);
    lastKey = ''; render();
  }
  joinBtn.addEventListener('click', (e) => { stop(e); join(); });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); join(); } else if (e.key === 'Escape') { input.blur(); close(); } });
  input.addEventListener('keyup', (e) => e.stopPropagation());

  function open() {
    if (isOpen || !social.free()) return false;
    social.closeAll('invite');
    isOpen = true; el.hidden = false; lastKey = '';
    setMsg('');
    render();
    social.sfx('ui');
    return true;
  }
  function close() { if (!isOpen) return; isOpen = false; el.hidden = true; input.blur(); }
  game.on('net:town', () => { pending = null; lastKey = ''; if (isOpen) { if (msg.textContent.startsWith('Joining')) setMsg(''); render(); } });
  return { el, open, close, render, toggle: () => (isOpen ? close() : open()), get isOpen() { return isOpen; } };
}
