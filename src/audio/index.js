// Tinselby audio (CONTRACTS.md §Audio). Procedural Web Audio only: no files, no network.
//   createAudio(ctx) → { start(), sfx(name, {x, z, vol, delay}), setMusicLevel(n), toggleMute() → bool, muted }
//
// Mobile robustness (phones crackled / "chirped"):
//  - the context asks for a bigger output buffer on phones (latencyHint 'playback'), so a busy WebGL frame
//    can't starve the audio thread; override with ?alat=interactive|balanced|playback for A/B tests;
//  - the music is scheduled 0.5 s ahead on phones (0.3 s on desktop) from a 25 ms timer on the AudioContext
//    clock, and never closer to "now" than LEAD; notes missed during a main-thread stall are skipped;
//  - a shared voice budget (voices.js) caps simultaneous oscillators/sources (40 on phones); colour layers
//    and ambient effects give way first, far-away ambient effects are culled;
//  - nothing is scheduled while the context is suspended (hidden tab, mute, iOS interruption), so there is
//    no burst on resume.
import { createGraph, unlockIOS, clamp } from './engine.js';
import { createMusic } from './music.js';
import { createSfx, SFX_NAMES, SFX_MIN_GAP } from './sfx.js';
import { setBudget, room, voiceStats } from './voices.js';
import { glock } from './instruments.js';
import { JINGLE_BELLS, DECK_THE_HALLS, WE_WISH } from './songs.js';

// wave 3: songs the carols game can play part of (audio.playSong), by full name or short id
const SEG_SONGS = { jingle: JINGLE_BELLS, deck: DECK_THE_HALLS, wish: WE_WISH };

const LS_KEY = 'tinselby.muted';
const TICK_MS = 25;
const LEAD = 0.03; // never schedule closer to currentTime than this (the audio thread renders ahead in blocks)
const CAP_MOBILE = 40, CAP_DESKTOP = 96;
// ambient effects that may be dropped when far away or when the voice budget is tight
const AMBIENT = new Set(['step', 'ice', 'car', 'chatter', 'tram', 'pop', 'whoosh', 'fold']);
// approximate peak sources per effect (measured with a mock context), used for the budget check
const SFX_COST = { step: 2, pop: 5, fold: 3, tram: 5, car: 4, chatter: 6, ice: 2, whoosh: 1, cable: 5, firework: 3 };
// effects that always play (one-off story moments)
const ESSENTIAL = new Set(['task', 'gift', 'countdown', 'cheer', 'hohoho', 'sleighBells', 'pickup', 'drop', 'ui', 'bell']);

function detectMobile(ctx) {
  try {
    if (ctx.engine && typeof ctx.engine.isMobile === 'boolean') return ctx.engine.isMobile;
    return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  } catch (e) { return false; }
}
function latencyHintFor(mobile) {
  try {
    const q = new URLSearchParams(location.search).get('alat');
    if (q === 'interactive' || q === 'balanced' || q === 'playback') return q;
  } catch (e) { /* no location */ }
  return mobile ? 'playback' : 'interactive';
}

function loadMuted() { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; } }
function saveMuted(m) { try { localStorage.setItem(LS_KEY, m ? '1' : '0'); } catch (e) { /* private mode */ } }

export function createAudio(ctx) {
  const game = ctx.game;
  let ac = null, graph = null, music = null, lib = null, timer = null;
  let muted = loadMuted();
  let level = 0;
  let suspendTimer = null;
  const last = new Map(); // sfx name → last scheduled time
  const mobile = detectMobile(ctx);
  const LOOKAHEAD = mobile ? 0.5 : 0.3; // s of music scheduled ahead of currentTime
  let lowQ = false; // engine fell back to low quality (slow frames): tighten the voice budget too
  let latSmooth = -1;

  // ---------------------------------------------------------------- context lifecycle
  function start() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { ac = new AC({ latencyHint: latencyHintFor(mobile) }); } catch (e) { ac = new AC(); }
        setBudget(ac, mobile ? CAP_MOBILE : CAP_DESKTOP, mobile);
        graph = createGraph(ac, { lite: mobile });
        graph.master.gain.value = muted ? 0 : 1;
        music = createMusic(ac, graph);
        music.setLevel(level, true);
        lib = createSfx(ac, graph);
        timer = setInterval(tick, TICK_MS);
        if (muted) ac.suspend().catch(() => {});
      }
      unlockIOS(ac);
      if (!muted && ac.state !== 'running' && !document.hidden) ac.resume().catch(() => {});
    } catch (e) {
      console.warn('[audio] start failed', e);
    }
  }

  function tick() {
    if (!ac || ac.state !== 'running') return; // suspended / interrupted: schedule nothing (no burst on resume)
    if (!lowQ && !mobile && ctx.engine && ctx.engine.quality === 'low') { lowQ = true; setBudget(ac, 56); }
    const now = ac.currentTime;
    try { music.tick(now + LOOKAHEAD, now + LEAD); } catch (e) { console.warn('[audio] tick', e); clearInterval(timer); }
  }

  // resume on any later gesture too (Safari/iOS may re-suspend; Chrome starts suspended without a gesture)
  const gesture = () => { if (ac) { if (!muted && ac.state !== 'running') { unlockIOS(ac); ac.resume().catch(() => {}); } } else start(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, gesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else if (!muted) ac.resume().catch(() => {});
  });

  // ---------------------------------------------------------------- music
  function setMusicLevel(n) {
    level = clamp(Math.round(n) || 0, 0, 4);
    if (music) music.setLevel(level);
  }

  /** Midnight on Christmas Eve: swell into the finale carol (Joy to the World), then settle back into the medley. */
  function christmasSwell() {
    if (!ac) return;
    setMusicLevel(4);
    const t = ac.currentTime + LOOKAHEAD + 0.1; // after everything already scheduled for the medley
    music.playSpecial(t, (end) => {
      // after Joy to the World: settle into a gentle loop
      const bus = music.out.gain;
      bus.cancelScheduledValues(end); bus.setValueAtTime(1.35, end); bus.setTargetAtTime(1, end, 2);
      // wave 3: the finale ends in free play, so settle back to the town's festive level (the old end screen kept 2)
      setTimeout(() => setMusicLevel(game.state.phase === 'end' ? 2 : (game.state.spirit ?? 2)), Math.max(0, (end - ac.currentTime) * 1000));
    });
    const bus = music.out.gain;
    bus.cancelScheduledValues(t);
    bus.setValueAtTime(bus.value, t);
    bus.linearRampToValueAtTime(1.35, t + 3);
    graph.musicSend.gain.setTargetAtTime(0.6, t, 2);
  }

  // ---------------------------------------------------------------- sfx
  function sfx(name, opts = {}) {
    if (!ac || !lib || muted || ac.state !== 'running') return;
    if (!SFX_NAMES.includes(name)) return;
    const t = ac.currentTime + LEAD + Math.max(0, opts.delay || 0);
    const gap = SFX_MIN_GAP[name] ?? 0.05;
    const prev = last.get(name);
    if (prev !== undefined && Math.abs(t - prev) < gap) return;

    let gain = opts.vol ?? 1, pan = 0;
    const p = ctx.player && ctx.player.pos;
    const positional = p && Number.isFinite(opts.x) && Number.isFinite(opts.z);
    const d = positional ? Math.hypot(opts.x - p.x, opts.z - p.z) : 0;
    // far-away ambience (hooves, horns, chatter across town) only cost voices: cull it
    if (positional && AMBIENT.has(name) && d > (mobile ? 30 : 45)) return;
    // voice budget: ambience gives way first; story moments always play
    if (!ESSENTIAL.has(name) && !room(ac, t, SFX_COST[name] ?? 4, AMBIENT.has(name) ? 0.8 : 1)) return;
    last.set(name, t);
    if (positional) {
      const dx = opts.x - p.x, dz = opts.z - p.z;
      gain *= Math.max(0.15, 1 / (1 + Math.pow(d / 9, 2)));
      const yaw = (ctx.cam && Number.isFinite(ctx.cam.yaw)) ? ctx.cam.yaw : 0;
      // camera sits at target + (sin yaw, cos yaw) → screen-right on the ground is (cos yaw, -sin yaw)
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      pan = clamp((dx * rx + dz * rz) / (d + 2), -0.85, 0.85);
    }
    try {
      // fixed per-call gain / pan, set before the voice starts (nothing is automated later: no zipper noise)
      const g = ac.createGain(); g.gain.value = gain;
      if (pan && ac.createStereoPanner) {
        const sp = ac.createStereoPanner(); sp.pan.value = pan;
        g.connect(sp); sp.connect(graph.sfxBus);
      } else g.connect(graph.sfxBus);
      lib.play(name, t, g, 1);
    } catch (e) { console.warn('[audio] sfx ' + name, e); }
  }

  // ---------------------------------------------------------------- mute
  function toggleMute() {
    muted = !muted;
    saveMuted(muted);
    if (ac) {
      const g = graph.master.gain, now = ac.currentTime;
      clearTimeout(suspendTimer);
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (muted) {
        g.setTargetAtTime(0, now, 0.05);
        suspendTimer = setTimeout(() => { if (muted && ac) ac.suspend().catch(() => {}); }, 300);
      } else {
        ac.resume().catch(() => {});
        g.setTargetAtTime(1, now, 0.08);
      }
    }
    return muted;
  }

  // ---------------------------------------------------------------- game wiring
  game.on('spirit:change', ({ value }) => setMusicLevel(value));
  game.on('task:complete', () => sfx('task'));
  game.on('district:revealed', () => { for (let i = 0; i < 5; i++) sfx('pop', { delay: 0.05 + i * 0.17 + Math.random() * 0.05, vol: 0.7 }); });
  game.on('audio:toggle', () => {
    const m = toggleMute();
    game.emit('ui:toast', { text: m ? 'Sound off' : 'Sound on' });
  });
  game.on('santa:arrive', () => sfx('sleighBells'));
  game.on('santa:gift', () => sfx('gift'));
  game.on('finale:start', () => setMusicLevel(4));
  game.on('christmas', () => { christmasSwell(); sfx('cheer'); });
  game.on('countdown', () => sfx('countdown'));
  game.on('item:pickup', () => sfx('pickup'));
  game.on('item:drop', () => sfx('drop'));
  game.on('cablecar:ride', () => sfx('cable'));
  game.on('cablecar:arrive', () => sfx('cable', { vol: 0.6 }));
  game.on('interact', () => sfx('ui', { vol: 0.6 }));

  if (ctx.player && !ctx.player.onStep) {
    ctx.player.onStep = () => {
      const p = ctx.player.pos;
      const lake = ctx.city && ctx.city.lake;
      if (lake && lake.isIce && p && lake.isIce(p.x, p.z)) sfx('ice', { vol: 0.5 });
      else sfx('step', { vol: 0.8 });
    };
  }

  // ---------------------------------------------------------------- offline self-test (debug only)
  /** Render `sec` seconds of music at `lvl` (and optionally the Christmas finale carol) offline;
   *  returns {rms, peak, maxStep} (maxStep = largest sample-to-sample jump: clicks show up as spikes). */
  async function renderTest({ sec = 8, lvl = 4, special = false, sfxAll = false, lite = false } = {}) {
    const sr = 44100;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oac = new OAC(2, Math.floor(sr * sec), sr);
    setBudget(oac, lite ? CAP_MOBILE : CAP_DESKTOP, lite);
    const g = createGraph(oac, { lite });
    let segs = null;
    if (sfxAll) {
      const s = createSfx(oac, g);
      segs = SFX_NAMES.map((n, i) => { s.play(n, 0.05 + i * (sec / SFX_NAMES.length), g.sfxBus, 1); return n; });
    } else {
      const m = createMusic(oac, g);
      m.setLevel(lvl, true);
      if (special) m.playSpecial(0.05, null);
      m.tick(sec + 0.5);
    }
    const buf = await oac.startRendering();
    const stats = (a, b) => {
      let sum = 0, pk = 0, n = 0, step = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = a; i < b; i++) {
          const v = d[i]; sum += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); n++;
          if (i > a) { const j = Math.abs(v - d[i - 1]); if (j > step) step = j; }
        }
      }
      return { rms: +Math.sqrt(sum / n).toFixed(4), peak: +pk.toFixed(4), maxStep: +step.toFixed(4) };
    };
    const res = stats(0, buf.length);
    if (segs) {
      const L = Math.floor(buf.length / segs.length);
      res.perSfx = Object.fromEntries(segs.map((n, i) => [n, stats(i * L, (i + 1) * L)]));
    }
    return res;
  }

  return {
    start,
    sfx,
    /** wave 2: { bpm, meter, start, spb, now } in AudioContext seconds, or null; phase = ((now - start) / spb) mod 1 */
    // `now` is the AudioContext time being heard right now (currentTime minus the output latency, which is
    // larger with the phone 'playback' buffer), so the beat phase matches what the player hears.
    beat() {
      try {
        const b = music && music.beat;
        if (!b || !ac) return null;
        const lat = clamp((ac.baseLatency || 0) + (ac.outputLatency || 0), 0, 0.35);
        latSmooth = latSmooth < 0 ? lat : latSmooth + (lat - latSmooth) * 0.05;
        return { ...b, now: ac.currentTime - latSmooth, latency: latSmooth };
      } catch (e) { return null; }
    },
    /** wave 3 (carols): play beats [fromBeat, toBeat) of a medley song ('Jingle Bells' | 'Deck the Halls' |
     *  'We Wish You a Merry Christmas', or 'jingle' | 'deck' | 'wish'), then the medley resumes. Beat b sounds at
     *  start + b·spb (AudioContext seconds; subtract the output latency for what is heard, as beat() does). Returns
     *  { start, spb, bpm, meter, end } or null when there is no running audio (not started, muted, hidden tab): then run
     *  your own clock. `at` defaults to just after the music already scheduled; onEnd(endTime) once the last note is queued. */
    playSong(name, { fromBeat = 0, toBeat = Infinity, at, onEnd } = {}) {
      try {
        const s = SEG_SONGS[name] || Object.values(SEG_SONGS).find((x) => x.name === name);
        if (!s || !ac || !music || muted || ac.state !== 'running') return null;
        const from = Math.max(0, +fromBeat || 0), to = Math.min(+toBeat || 0, s.melLen);
        if (!(to > from)) return null;
        const t = Math.max(Number.isFinite(at) ? at : 0, ac.currentTime + LOOKAHEAD + 0.1);
        const r = music.playSegment(s, from, to, t, onEnd);
        return { ...r, end: r.start + to * r.spb };
      } catch (e) { return null; }
    },
    /** wave 3 (carols): one note now: kind 'choir' (soft "ooh", dur seconds) or 'bell' (glockenspiel). */
    note(midi, { dur = 0.45, vol = 0.7, kind = 'choir' } = {}) {
      try {
        if (!ac || !music || muted || ac.state !== 'running' || !Number.isFinite(midi)) return;
        const t = ac.currentTime + LEAD;
        if (kind === 'bell') { if (room(ac, t, 3, 1)) glock(ac, music.out, midi, t, vol); } else music.voice(midi, t, dur, vol);
      } catch (e) { /* audio is optional */ }
    },
    setMusicLevel,
    toggleMute,
    get muted() { return muted; },
    get level() { return level; },
    get context() { return ac; },
    get song() { return music ? music.song : null; },
    /** debug: { load, peak, cap, lookahead, latencyHint, baseLatency, outputLatency, sampleRate, lite } */
    get voices() { return ac ? { ...voiceStats(ac), lookahead: LOOKAHEAD, latencyHint: latencyHintFor(mobile), baseLatency: ac.baseLatency, outputLatency: ac.outputLatency, sampleRate: ac.sampleRate, lite: mobile } : null; },
    names: SFX_NAMES,
    renderTest,
  };
}
