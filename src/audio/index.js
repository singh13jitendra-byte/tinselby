// Tinselby audio (CONTRACTS.md §Audio). Procedural Web Audio only: no files, no network.
//   createAudio(ctx) → { start(), sfx(name, {x, z, vol, delay}), setMusicLevel(n), toggleMute() → bool, muted }
import { createGraph, unlockIOS, clamp } from './engine.js';
import { createMusic } from './music.js';
import { createSfx, SFX_NAMES, SFX_MIN_GAP } from './sfx.js';

const LS_KEY = 'tinselby.muted';
const LOOKAHEAD = 0.15; // s scheduled ahead
const TICK_MS = 25;

function loadMuted() { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; } }
function saveMuted(m) { try { localStorage.setItem(LS_KEY, m ? '1' : '0'); } catch (e) { /* private mode */ } }

export function createAudio(ctx) {
  const game = ctx.game;
  let ac = null, graph = null, music = null, lib = null, timer = null;
  let muted = loadMuted();
  let level = 0;
  let suspendTimer = null;
  const last = new Map(); // sfx name → last scheduled time

  // ---------------------------------------------------------------- context lifecycle
  function start() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC({ latencyHint: 'interactive' });
        graph = createGraph(ac);
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
    if (!ac || ac.state !== 'running') return;
    try { music.tick(ac.currentTime + LOOKAHEAD); } catch (e) { console.warn('[audio] tick', e); clearInterval(timer); }
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

  function newYearSwell() {
    if (!ac) return;
    setMusicLevel(4);
    const t = ac.currentTime + 0.35;
    music.playSpecial(t, (end) => {
      // after Auld Lang Syne: settle into a gentle loop
      const bus = music.out.gain;
      bus.cancelScheduledValues(end); bus.setValueAtTime(1.35, end); bus.setTargetAtTime(1, end, 2);
      setTimeout(() => setMusicLevel(2), Math.max(0, (end - ac.currentTime) * 1000));
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
    const t = ac.currentTime + 0.01 + Math.max(0, opts.delay || 0);
    const gap = SFX_MIN_GAP[name] ?? 0.05;
    const prev = last.get(name);
    if (prev !== undefined && Math.abs(t - prev) < gap) return;
    last.set(name, t);

    let gain = opts.vol ?? 1, pan = 0;
    const p = ctx.player && ctx.player.pos;
    if (p && Number.isFinite(opts.x) && Number.isFinite(opts.z)) {
      const dx = opts.x - p.x, dz = opts.z - p.z;
      const d = Math.hypot(dx, dz);
      gain *= Math.max(0.15, 1 / (1 + Math.pow(d / 9, 2)));
      const yaw = (ctx.cam && Number.isFinite(ctx.cam.yaw)) ? ctx.cam.yaw : 0;
      // camera sits at target + (sin yaw, cos yaw) → screen-right on the ground is (cos yaw, -sin yaw)
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      pan = clamp((dx * rx + dz * rz) / (d + 2), -0.85, 0.85);
    }
    try {
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
  game.on('newyear', () => { newYearSwell(); sfx('cheer'); });
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
  /** Render `sec` seconds of music at `lvl` (and optionally the New Year swell) offline; returns {rms, peak}. */
  async function renderTest({ sec = 8, lvl = 4, special = false, sfxAll = false } = {}) {
    const sr = 44100;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oac = new OAC(2, Math.floor(sr * sec), sr);
    const g = createGraph(oac);
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
      let sum = 0, pk = 0, n = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = a; i < b; i++) { const v = d[i]; sum += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); n++; }
      }
      return { rms: +Math.sqrt(sum / n).toFixed(4), peak: +pk.toFixed(4) };
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
    setMusicLevel,
    toggleMute,
    get muted() { return muted; },
    get level() { return level; },
    get context() { return ac; },
    get song() { return music ? music.song : null; },
    names: SFX_NAMES,
    renderTest,
  };
}
