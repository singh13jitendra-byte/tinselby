// Small synth voices shared by the music and the sound effects. Every voice schedules itself at time t
// on the given AudioContext and cleans up (oscillators are stopped once the envelope has died away, ~-40 dB:
// stopping later only keeps idle oscillators alive, which is what makes phones underrun and crackle).
// Every source registers itself with the shared voice budget (voices.js).
import { midiToHz, clamp } from './engine.js';
import { track, isLite } from './voices.js';

const cents = (c) => Math.pow(2, c / 1200);

function osc(ac, type, f, t, stop, dest, gain = 1) {
  const o = ac.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t);
  let node = o;
  if (gain !== 1) { const g = ac.createGain(); g.gain.value = gain; o.connect(g); node = g; }
  node.connect(dest);
  o.start(t); o.stop(stop);
  track(ac, t, stop);
  return o;
}

/** Music-box tine: sine fundamental + octave + bright FM "ping" on the attack + an inharmonic tine partial. */
export function musicBox(ac, dest, m, t, vel = 1) {
  const f = midiToHz(m) * cents((Math.random() * 2 - 1) * 5); // slight detune per note
  const decay = clamp(2.3 - (m - 60) * 0.05, 0.7, 2.6);
  const stop = t + decay * 1.25; // envelope tau = decay/4 → 5 tau ≈ -43 dB
  const g = ac.createGain(); g.connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, decay / 4);

  const car = osc(ac, 'sine', f, t, stop, g);
  // FM modulator for the plucky attack
  const mod = ac.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(f * 4, t);
  const mg = ac.createGain();
  mg.gain.setValueAtTime(f * 1.1, t); mg.gain.setTargetAtTime(0, t, 0.05);
  mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(t + 0.32); track(ac, t, t + 0.32);

  const g2 = ac.createGain(); g2.connect(g);
  g2.gain.setValueAtTime(0.28, t); g2.gain.setTargetAtTime(0, t, decay / 9);
  osc(ac, 'sine', f * 2.003, t, t + decay * 0.6, g2);

  if (isLite(ac)) return; // phones: skip the tiny inharmonic tine partial
  const g3 = ac.createGain(); g3.connect(g);
  g3.gain.setValueAtTime(0.09, t); g3.gain.setTargetAtTime(0, t, 0.04);
  osc(ac, 'sine', f * 5.93, t, t + 0.3, g3);
}

/** Glockenspiel bar: partials 1 : 2.76 : 5.40, short and sparkly. */
export function glock(ac, dest, m, t, vel = 1, decay = 0.9) {
  const f = midiToHz(m) * cents((Math.random() * 2 - 1) * 3);
  const g = ac.createGain(); g.connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.13 * vel, t + 0.002);
  g.gain.setTargetAtTime(0, t + 0.002, decay / 4);
  const stop = t + decay * 1.25;
  osc(ac, 'sine', f, t, stop, g);
  const g2 = ac.createGain(); g2.connect(g);
  g2.gain.setValueAtTime(0.32, t); g2.gain.setTargetAtTime(0, t, decay / 10);
  osc(ac, 'sine', f * 2.76, t, t + decay * 0.5, g2);
  if (isLite(ac)) return;
  const g3 = ac.createGain(); g3.connect(g);
  g3.gain.setValueAtTime(0.12, t); g3.gain.setTargetAtTime(0, t, 0.03);
  osc(ac, 'sine', f * 5.4, t, t + 0.2, g3);
}

/** FM bell (tram bell, hand bell, countdown tick). ratio ~1.4 gives a clangy inharmonic spectrum. */
export function fmBell(ac, dest, f, t, { vel = 1, decay = 1.6, ratio = 1.41, index = 2.2, peak = 0.22 } = {}) {
  const g = ac.createGain(); g.connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak * vel, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.003, decay / 4);
  const stop = t + decay * 1.4;
  const car = osc(ac, 'sine', f, t, stop, g);
  const mod = ac.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(f * ratio, t);
  const mg = ac.createGain();
  mg.gain.setValueAtTime(f * index, t); mg.gain.setTargetAtTime(f * index * 0.15, t, decay / 5);
  mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(stop); track(ac, t, stop);
}

/** Warm bass pluck: triangle + sine through a lowpass. */
export function bass(ac, dest, m, t, dur, vel = 1) {
  const f = midiToHz(m);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.6;
  const g = ac.createGain(); lp.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.012);
  g.gain.setTargetAtTime(0.16 * vel, t + 0.012, 0.18);
  g.gain.setTargetAtTime(0, t + Math.max(0.05, dur - 0.08), 0.09);
  const stop = t + dur + 0.45; // release starts at dur - 0.08 with tau 0.09
  osc(ac, 'triangle', f, t, stop, lp);
  if (!isLite(ac)) osc(ac, 'sine', f, t, stop, lp, 0.8);
}

/** Choir-ish pad voice: two detuned saws per note into a shared (filtered) pad input. Returns the envelope gain. */
export function padChord(ac, dest, notes, t, dur, vel = 1) {
  const lite = isLite(ac);
  const g = ac.createGain(); g.connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.setTargetAtTime(0.045 * vel * (lite ? 1.35 : 1), t, 0.32); // slow attack (one saw per note on phones)
  g.gain.setTargetAtTime(0, t + dur - 0.05, 0.38); // release
  const stop = t + dur + 1.7; // ≈ 4.5 release taus
  for (const m of notes) {
    const f = midiToHz(m);
    for (const c of (lite ? [-4] : [-9, 8])) {
      const o = osc(ac, 'sawtooth', f * cents(c + (Math.random() - 0.5) * 3), t, stop, g);
      o.frequency.setTargetAtTime(f * cents(c * 0.6), t + 0.5, 1.5); // a little drift so it breathes
    }
  }
  return g;
}

/** One sleigh-bell jingle from the shared samples. */
export function jingle(ac, dest, buffers, t, vel = 1, rate = 1) {
  const s = ac.createBufferSource();
  s.buffer = buffers.jingles[Math.floor(Math.random() * buffers.jingles.length)];
  s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  const g = ac.createGain(); g.gain.value = vel;
  s.connect(g); g.connect(dest);
  s.start(t);
  track(ac, t, t + s.buffer.duration / s.playbackRate.value);
}
