// Splash controller. NOT a module: src/splash/vite-plugin.js minifies this file and inlines it in index.html right
// after the trailer markup (design/splash/trailer.html), so it runs at the very first parse, long before the big game
// script has even downloaded. The game reports boot milestones through window.__splash (see src/splash/index.js).
//
//   window.__splash.step(pct, label)  progress 0..1 (never goes back) → --p on #tb-splash, label → .tbs-status
//   window.__splash.idle()            switch to the gentle idle loop now (also automatic after the 4.5 s intro)
//   window.__splash.done()            game ready: hold until ~1.6 s of trailer has played (short on warm return
//                                     visits, never more than 2.5 s extra), then .tbs-out and remove the node.
//                                     A tap (or Enter / Space / Esc) skips the hold once the game is ready.
//   window.__splash.active            false once the splash is gone (or was never shown)
// ?capture (every automated test) removes it at once, unless &splash is in the URL.
(function () {
  var el = document.getElementById('tb-splash');
  var noop = function () {};
  var api = { step: noop, idle: noop, done: noop, active: false };
  window.__splash = api;
  var q = location.search;
  if (!el) return;
  if (/[?&]capture(=|&|$)/.test(q) && !/[?&]splash(=|&|$)/.test(q)) { el.remove(); return; }

  var KEY = 'tinselby.splash.v1';
  var INTRO = 4500, MIN_PLAY = 1600, WARM_PLAY = 700, MAX_EXTRA = 2500;
  var t0 = performance.now();
  var status = el.querySelector('.tbs-status');
  var reduce = false, seen = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
  try { seen = !!localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  var p = 0, real = false, ready = false, out = false;
  var cancelHold = function () {}, safeT = 0;

  // run fn after ms. Checked every frame as well as by a timer: while the game renders its first frames behind the
  // splash, timer tasks can wait seconds for a turn on a busy phone, frame callbacks don't.
  function after(ms, fn) {
    var end = performance.now() + ms, fired = false;
    function go() { if (!fired) { fired = true; fn(); } }
    function tick() { if (fired) return; if (performance.now() >= end) go(); else requestAnimationFrame(tick); }
    if (ms <= 0) { go(); return function () {}; }
    var t = setTimeout(go, ms);
    requestAnimationFrame(tick);
    return function () { fired = true; clearTimeout(t); };
  }

  function setP(v) {
    if (!(v > p)) return;
    p = v > 1 ? 1 : v;
    el.style.setProperty('--p', p.toFixed(3));
  }
  function setLabel(s) { if (s && status && status.textContent !== s) status.textContent = s; }

  // While the page itself downloads nothing can be measured from in here, so the bar creeps towards 40 % (fast at
  // first, then slower and slower); the game's real milestones take it from there.
  setP(0.02);
  if (status && !status.textContent.trim()) setLabel('Unrolling the yarn…'); // the art brings its own first line
  var creep = setInterval(function () {
    if (real || out) { clearInterval(creep); return; }
    var t = performance.now() - t0;
    setP(0.4 * (1 - Math.exp(-t / 5000)));
    if (t > 9000) setLabel('Still unrolling the yarn…');
  }, 250);

  var cancelIdle = after(INTRO, function () { api.idle(); });
  api.idle = function () { cancelIdle(); if (!out) el.classList.add('tbs-idle'); };

  api.step = function (pct, label) {
    if (out) return;
    real = true;
    setP(+pct || 0);
    setLabel(label);
  };

  api.done = function () {
    if (ready || out) return;
    ready = true;
    clearTimeout(safeT);
    setP(1);
    var played = performance.now() - t0;
    // warm return visit: seen before and the whole load was quick → just a short beat of the trailer
    var min = reduce ? 300 : seen && played < 3000 ? WARM_PLAY : MIN_PLAY;
    // …and always a short beat at 100 % so the full bar and the last line are actually seen
    var hold = Math.max(reduce ? 0 : 300, Math.min(MAX_EXTRA, min - played));
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* */ }
    cancelHold = after(hold, exit);
  };

  function exit() {
    if (out) return;
    out = true;
    cancelHold(); cancelIdle(); clearTimeout(safeT); clearInterval(creep);
    removeEventListener('keydown', onKey, true);
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('tbs-out');
    // the splash keeps catching taps while it fades (a skip tap must not land on the button underneath), then goes
    el.style.pointerEvents = 'auto';
    var ms = 550;
    try {
      var cs = getComputedStyle(el), longest = 0;
      var d = (cs.transitionDuration + ',' + cs.animationDuration).split(','), l = (cs.transitionDelay + ',' + cs.animationDelay).split(',');
      for (var i = 0; i < d.length; i++) longest = Math.max(longest, (parseFloat(d[i]) || 0) + (parseFloat(l[i]) || 0));
      if (longest > 0) ms = Math.min(1200, longest * 1000);
    } catch (e) { /* */ }
    after(ms + 60, remove);
    el.addEventListener('transitionend', function (e) { if (e.target === el && e.propertyName === 'opacity') remove(); });
  }
  function remove() {
    if (!el.parentNode) return;
    el.parentNode.removeChild(el);
    api.active = false;
    try { dispatchEvent(new Event('tinselby:splash-gone')); } catch (e) { /* */ }
  }

  function skip(e) {
    if (!ready || out) return;
    if (e && e.preventDefault) e.preventDefault();
    exit();
  }
  function onKey(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skip(e); }
  el.addEventListener('pointerdown', skip);
  addEventListener('keydown', onKey, true);

  // failsafe: if boot never reports in (a script error, an old browser), don't trap the player behind the splash
  addEventListener('load', function () { safeT = setTimeout(function () { api.done(); }, 15000); });

  api.active = true;
})();
