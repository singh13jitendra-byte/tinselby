// Procedural sound effects. Each recipe is (t, out, vel) → schedules nodes on the AudioContext.
// `out` is a per-call gain/panner chain that ends in graph.sfxBus.
import { midiToHz } from './engine.js';
import { glock, fmBell, musicBox } from './instruments.js';

export const SFX_NAMES = ['step', 'pop', 'fold', 'bell', 'pickup', 'drop', 'task', 'ui', 'tram', 'car', 'chatter',
  'ice', 'cable', 'sleighBells', 'hohoho', 'whoosh', 'countdown', 'firework', 'cheer', 'gift'];

/** Minimum seconds between two plays of the same effect (also de-duplicates events + direct calls). */
export const SFX_MIN_GAP = {
  step: 0.11, pop: 0.035, fold: 0.15, bell: 0.15, pickup: 0.25, drop: 0.25, task: 0.6, ui: 0.05, tram: 0.8,
  car: 0.6, chatter: 1.2, ice: 0.2, cable: 1.0, sleighBells: 1.5, hohoho: 3.0, whoosh: 0.25, countdown: 0.5,
  firework: 0.07, cheer: 2.0, gift: 1.0,
};

export function createSfx(ac, graph) {
  const B = graph.buffers;

  // ---------------------------------------------------------------- helpers
  function env(g, t, a, peak, tau, hold = 0) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0, t + a + hold, tau);
  }
  /** Oscillator with optional pitch glide; exponential-ish decay envelope. */
  function tone(out, t, { type = 'sine', f = 440, f2 = null, glide = 0.1, a = 0.005, peak = 0.2, tau = 0.1, hold = 0, dur = null }) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + glide);
    const g = ac.createGain(); env(g, t, a, peak, tau, hold);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + (dur ?? a + hold + tau * 7));
    return { o, g };
  }
  /** Filtered noise burst with optional filter sweep. */
  function noise(out, t, { type = 'bandpass', f = 1000, f2 = null, sweep = 0.2, q = 1, a = 0.005, peak = 0.2, tau = 0.08, hold = 0, dur = null, rate = 1 }) {
    const s = ac.createBufferSource(); s.buffer = B.noise; s.loop = true;
    s.playbackRate.value = rate;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + sweep);
    const g = ac.createGain(); env(g, t, a, peak, tau, hold);
    s.connect(fl); fl.connect(g); g.connect(out);
    const d = dur ?? a + hold + tau * 7;
    s.start(t, Math.random() * 1.5); s.stop(t + d);
    return { s, fl, g };
  }
  function sample(out, t, buf, { vel = 1, rate = 1, filter = null, f = 2000, q = 0.7 } = {}) {
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = vel;
    if (filter) {
      const fl = ac.createBiquadFilter(); fl.type = filter; fl.frequency.value = f; fl.Q.value = q;
      s.connect(fl); fl.connect(g);
    } else s.connect(g);
    g.connect(out); s.start(t);
    return s;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const G_PENTA = [67, 69, 71, 74, 76, 79, 81, 83, 86, 88, 91]; // G major pentatonic

  // ---------------------------------------------------------------- recipes
  const R = {
    step(t, out, v) {
      sample(out, t, pick(B.crunch), { vel: 0.45 * v, rate: rnd(0.75, 1.05), filter: 'bandpass', f: rnd(1400, 2600), q: 0.6 });
      noise(out, t, { type: 'lowpass', f: 500, peak: 0.05 * v, a: 0.004, tau: 0.03 });
    },
    pop(t, out, v) {
      // plush puff + tiny bell
      noise(out, t, { type: 'lowpass', f: 1600, f2: 220, sweep: 0.14, q: 0.8, a: 0.006, peak: 0.28 * v, tau: 0.05 });
      tone(out, t, { f: rnd(260, 340), f2: 110, glide: 0.12, peak: 0.24 * v, a: 0.004, tau: 0.05 });
      glock(ac, out, pick(G_PENTA.slice(4)), t + 0.03, 0.55 * v, 0.6);
    },
    fold(t, out, v) {
      noise(out, t, { type: 'bandpass', f: 2400, f2: 380, sweep: 0.35, q: 1.1, a: 0.06, peak: 0.22 * v, tau: 0.09, hold: 0.18 });
      tone(out, t + 0.3, { f: 140, f2: 70, glide: 0.1, peak: 0.18 * v, tau: 0.05 });
      noise(out, t + 0.3, { type: 'lowpass', f: 400, peak: 0.12 * v, tau: 0.05 });
    },
    bell(t, out, v) {
      fmBell(ac, out, midiToHz(81), t, { vel: v, decay: 2.0, ratio: 3.5, index: 1.2, peak: 0.2 });
      fmBell(ac, out, midiToHz(93), t + 0.002, { vel: 0.3 * v, decay: 0.9, ratio: 2.76, index: 0.8, peak: 0.2 });
    },
    pickup(t, out, v) {
      noise(out, t, { type: 'lowpass', f: 900, f2: 300, sweep: 0.1, peak: 0.12 * v, tau: 0.04 });
      glock(ac, out, 76, t + 0.01, 0.9 * v, 0.7);
      glock(ac, out, 83, t + 0.09, 0.9 * v, 0.9);
    },
    drop(t, out, v) {
      glock(ac, out, 71, t, 0.7 * v, 0.6);
      glock(ac, out, 64, t + 0.08, 0.7 * v, 0.7);
      tone(out, t + 0.12, { f: 180, f2: 70, glide: 0.1, peak: 0.25 * v, tau: 0.05 });
      noise(out, t + 0.12, { type: 'lowpass', f: 700, f2: 200, sweep: 0.1, peak: 0.16 * v, tau: 0.05 });
    },
    task(t, out, v) {
      // happy arpeggio G B D G B + shimmer
      [79, 83, 86, 91, 95].forEach((m, i) => {
        musicBox(ac, out, m - 12, t + i * 0.075, 1.0 * v);
        glock(ac, out, m, t + i * 0.075 + 0.01, 0.6 * v, 1.1);
      });
      noise(out, t + 0.1, { type: 'highpass', f: 6000, q: 0.5, a: 0.25, peak: 0.05 * v, tau: 0.3 });
    },
    ui(t, out, v) {
      tone(out, t, { f: 1700, f2: 1100, glide: 0.02, peak: 0.12 * v, a: 0.001, tau: 0.012 });
      noise(out, t, { type: 'bandpass', f: 3500, q: 2, peak: 0.05 * v, a: 0.001, tau: 0.008 });
    },
    tram(t, out, v) {
      for (const dt of [0, 0.28]) {
        fmBell(ac, out, 1180, t + dt, { vel: v, decay: 1.1, ratio: 1.41, index: 1.6, peak: 0.16 });
        noise(out, t + dt, { type: 'highpass', f: 3000, peak: 0.05 * v, a: 0.001, tau: 0.006 });
      }
    },
    car(t, out, v) {
      // soft toy horn "meep meep"
      for (const dt of [0, 0.22]) {
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 2; lp.connect(out);
        tone(lp, t + dt, { type: 'square', f: 415, peak: 0.07 * v, a: 0.015, hold: 0.09, tau: 0.03 });
        tone(lp, t + dt, { type: 'sawtooth', f: 523, peak: 0.05 * v, a: 0.015, hold: 0.09, tau: 0.03 });
      }
    },
    chatter(t, out, v) {
      // murmur of tiny voices: short formant-filtered blips with wandering pitch
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.2;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      bp.connect(lp); lp.connect(out);
      for (let i = 0; i < 9; i++) {
        const tt = t + rnd(0, 1.1), f = rnd(240, 420);
        tone(bp, tt, { type: 'sawtooth', f, f2: f * rnd(0.8, 1.25), glide: 0.12, a: 0.02, hold: rnd(0.03, 0.1), peak: 0.06 * v, tau: 0.04 });
      }
      noise(out, t, { type: 'bandpass', f: 900, q: 0.8, a: 0.3, hold: 0.5, peak: 0.025 * v, tau: 0.25 });
    },
    ice(t, out, v) {
      noise(out, t, { type: 'bandpass', f: 2500, f2: 6500, sweep: 0.25, q: 2.5, a: 0.12, hold: 0.08, peak: 0.12 * v, tau: 0.1 });
      noise(out, t, { type: 'highpass', f: 5000, a: 0.1, peak: 0.04 * v, tau: 0.12 });
    },
    cable(t, out, v) {
      // clunk + metallic tick + motor hum swell
      noise(out, t, { type: 'lowpass', f: 300, peak: 0.3 * v, a: 0.002, tau: 0.06 });
      fmBell(ac, out, 1900, t + 0.01, { vel: 0.4 * v, decay: 0.3, ratio: 2.3, index: 2, peak: 0.15 });
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.connect(out);
      tone(lp, t + 0.05, { type: 'sawtooth', f: 55, a: 0.4, hold: 0.8, peak: 0.11 * v, tau: 0.3 });
      tone(lp, t + 0.05, { type: 'sawtooth', f: 110.6, a: 0.4, hold: 0.8, peak: 0.06 * v, tau: 0.3 });
    },
    sleighBells(t, out, v) {
      sample(out, t, B.shake, { vel: 0.5 * v, rate: rnd(0.95, 1.05) });
    },
    hohoho(t, out, v) {
      // three low "ho"s: glottal saw pulses through "o" formants (≈450 Hz, ≈800 Hz)
      const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 450; f1.Q.value = 5;
      const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 820; f2.Q.value = 6;
      const g2 = ac.createGain(); g2.gain.value = 0.5;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const sum = ac.createGain(); sum.gain.value = 2.6;
      f1.connect(sum); f2.connect(g2); g2.connect(sum); sum.connect(lp); lp.connect(out);
      const src = ac.createGain(); src.connect(f1); src.connect(f2);
      [[0, 118], [0.34, 112], [0.7, 98]].forEach(([dt, f], i) => {
        const tt = t + dt;
        const o = ac.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 1.08, tt); o.frequency.exponentialRampToValueAtTime(f * 0.88, tt + 0.26);
        const g = ac.createGain(); env(g, tt, 0.035, 0.5 * v, 0.07, i === 2 ? 0.2 : 0.12);
        o.connect(g); g.connect(src); o.start(tt); o.stop(tt + 0.8);
        noise(lp, tt, { type: 'bandpass', f: 700, q: 1, a: 0.02, peak: 0.03 * v, tau: 0.05 }); // breath "h"
      });
    },
    whoosh(t, out, v) {
      noise(out, t, { type: 'bandpass', f: 300, f2: 1800, sweep: 0.35, q: 1.3, a: 0.3, peak: 0.2 * v, tau: 0.15, dur: 1.2 });
    },
    countdown(t, out, v) {
      noise(out, t, { type: 'highpass', f: 2500, peak: 0.12 * v, a: 0.001, tau: 0.006 });
      fmBell(ac, out, midiToHz(88), t + 0.005, { vel: v, decay: 0.7, ratio: 3.5, index: 1, peak: 0.2 });
    },
    firework(t, out, v) {
      // boom
      tone(out, t, { f: 95, f2: 32, glide: 0.5, peak: 0.55 * v, a: 0.004, tau: 0.22 });
      noise(out, t, { type: 'lowpass', f: 900, f2: 120, sweep: 0.6, q: 0.7, peak: 0.45 * v, a: 0.003, tau: 0.2 });
      // crackle
      sample(out, t + rnd(0.2, 0.32), B.crackle, { vel: 0.3 * v, rate: rnd(0.85, 1.15), filter: 'highpass', f: 1500 });
    },
    cheer(t, out, v) {
      // crowd "yay": formant-filtered noise swell + a handful of rising voices
      const fa = ac.createBiquadFilter(); fa.type = 'bandpass'; fa.frequency.value = 750; fa.Q.value = 1.5;
      const fb = ac.createBiquadFilter(); fb.type = 'bandpass'; fb.frequency.value = 1800; fb.Q.value = 2;
      const sum = ac.createGain(); sum.gain.value = 1.6; fa.connect(sum); fb.connect(sum); sum.connect(out);
      for (let i = 0; i < 10; i++) {
        const tt = t + rnd(0, 0.25), f = rnd(200, 480);
        const o = ac.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * rnd(1.25, 1.5), tt + 0.35);
        o.frequency.exponentialRampToValueAtTime(f * 0.9, tt + 1.3);
        const vib = ac.createOscillator(); vib.frequency.value = rnd(4, 7);
        const vg = ac.createGain(); vg.gain.value = f * 0.02; vib.connect(vg); vg.connect(o.frequency);
        const g = ac.createGain(); env(g, tt, 0.15, 0.04 * v, 0.35, 0.35);
        o.connect(g); g.connect(fa); g.connect(fb);
        o.start(tt); o.stop(tt + 2.6); vib.start(tt); vib.stop(tt + 2.6);
      }
      noise(out, t, { type: 'bandpass', f: 1200, q: 0.6, a: 0.25, hold: 0.4, peak: 0.12 * v, tau: 0.45, dur: 3 });
    },
    gift(t, out, v) {
      // sparkly reveal: rising pentatonic glissando + shimmer + final chord
      G_PENTA.forEach((m, i) => glock(ac, out, m, t + i * 0.055, 0.55 * v, 0.8));
      noise(out, t, { type: 'highpass', f: 5500, a: 0.5, peak: 0.06 * v, tau: 0.3, dur: 2 });
      const tc = t + G_PENTA.length * 0.055 + 0.05;
      [67, 71, 74, 79].forEach((m) => musicBox(ac, out, m + 12, tc, 0.9 * v));
      fmBell(ac, out, midiToHz(91), tc, { vel: 0.6 * v, decay: 1.8, ratio: 3.5, index: 1, peak: 0.15 });
    },
  };

  return {
    names: SFX_NAMES,
    /** Play recipe `name` at AudioContext time t into node `out` with velocity v. Returns false if unknown. */
    play(name, t, out, v = 1) {
      const fn = R[name];
      if (!fn) return false;
      fn(t, out, v);
      return true;
    },
  };
}
