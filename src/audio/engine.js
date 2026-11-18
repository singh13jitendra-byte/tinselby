// Audio graph + shared procedural buffers. Works with a live AudioContext or an OfflineAudioContext.
//
//   musicBus ─┬──────────────► master ─► compressor ─► soft clip ─► destination
//             └─► musicSend ─► reverb ─┘
//   sfxBus ───┬──────────────► master
//             └─► sfxSend ───► reverb

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Generated stereo impulse response: decaying noise that darkens over time (a soft, woolly room). */
function makeImpulse(ac, sec = 2.6, power = 3.2) {
  const sr = ac.sampleRate, n = Math.floor(sr * sec);
  const buf = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = 0.55 * (1 - t) + 0.04; // lowpass coefficient: bright early reflections, dark tail
      lp += (Math.random() * 2 - 1 - lp) * k;
      const fadeIn = Math.min(1, i / (sr * 0.012));
      d[i] = lp * Math.pow(1 - t, power) * fadeIn;
    }
  }
  return buf;
}

/** Soft-clip curve: linear up to 0.7, then saturates smoothly towards 0.97. */
function makeClipCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    const y = a < 0.7 ? a : 0.7 + 0.27 * Math.tanh((a - 0.7) / 0.27);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// ------------------------------------------------------------------ procedural sample buffers

/** One sleigh-bell "jingle": a cluster of small inharmonic bells struck a few ms apart. */
function makeJingle(ac, seed = 1) {
  const sr = ac.sampleRate, n = Math.floor(sr * 0.32);
  const buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const bells = 5;
  for (let k = 0; k < bells; k++) {
    const t0 = Math.floor(rnd() * 0.022 * sr);
    const f = 2600 + rnd() * 2600;
    const parts = [1, 1.51, 2.13, 2.71];
    const tau = 0.035 + rnd() * 0.07;
    const amp = 0.5 + rnd() * 0.5;
    const ph = parts.map(() => rnd() * 6.28);
    for (let i = t0; i < n; i++) {
      const t = (i - t0) / sr;
      const e = Math.exp(-t / tau) * amp;
      if (e < 0.0005) break;
      let v = 0;
      for (let p = 0; p < parts.length; p++) v += Math.sin(6.2832 * f * parts[p] * t + ph[p]) / (p + 1.4);
      v += (rnd() * 2 - 1) * Math.exp(-t / 0.004) * 0.8; // strike click
      d[i] += v * e;
    }
  }
  normalize(d, 0.8);
  return buf;
}

/** A shaken string of sleigh bells (~1.7 s), built from jingle variants. */
function makeShake(ac, jingles, sec = 1.8) {
  const sr = ac.sampleRate, n = Math.floor(sr * sec);
  const buf = ac.createBuffer(2, n, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const hits = 22;
  for (let h = 0; h < hits; h++) {
    const u = h / hits;
    const t = u * (sec - 0.35) + (h % 2 ? 0.025 : 0) + Math.random() * 0.01;
    const env = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (h % 2 ? 0.6 : 1);
    const j = jingles[h % jingles.length].getChannelData(0);
    const off = Math.floor(t * sr), pan = Math.random() * 0.6 - 0.3;
    for (let i = 0; i < j.length && off + i < n; i++) {
      L[off + i] += j[i] * env * (0.6 - pan);
      R[off + i] += j[i] * env * (0.6 + pan);
    }
  }
  normalize(L, 0.8); normalize(R, 0.8);
  return buf;
}

/** Snow crunch: sparse crackly grains over ~90 ms. */
function makeCrunch(ac) {
  const sr = ac.sampleRate, n = Math.floor(sr * 0.11);
  const buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const grains = 18 + Math.floor(Math.random() * 10);
  for (let g = 0; g < grains; g++) {
    const t0 = Math.floor(Math.pow(Math.random(), 1.6) * n * 0.75);
    const len = Math.floor(sr * (0.002 + Math.random() * 0.006));
    const a = (0.3 + Math.random() * 0.7) * (1 - t0 / n);
    for (let i = 0; i < len && t0 + i < n; i++) d[t0 + i] += (Math.random() * 2 - 1) * a * (1 - i / len);
  }
  normalize(d, 0.9);
  return buf;
}

/** Firework crackle: dozens of tiny pops spread over ~1.1 s. */
function makeCrackle(ac) {
  const sr = ac.sampleRate, n = Math.floor(sr * 1.2);
  const buf = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const pops = 70;
    for (let p = 0; p < pops; p++) {
      const t0 = Math.floor(Math.pow(Math.random(), 0.8) * n * 0.9);
      const len = Math.floor(sr * (0.001 + Math.random() * 0.004));
      const a = (0.2 + Math.random() * 0.8) * (1 - (t0 / n) * 0.7);
      for (let i = 0; i < len && t0 + i < n; i++) d[t0 + i] += (Math.random() * 2 - 1) * a * Math.exp(-i / (len * 0.3));
    }
    normalize(d, 0.85);
  }
  return buf;
}

function normalize(d, target) {
  let pk = 0;
  for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) { const k = target / pk; for (let i = 0; i < d.length; i++) d[i] *= k; }
}

// ------------------------------------------------------------------ graph

/** `lite` (phones): a shorter reverb tail, so the convolver costs ~40 % less on the audio thread. */
export function createGraph(ac, { lite = false } = {}) {
  const master = ac.createGain(); master.gain.value = 1;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3.5;
  comp.attack.value = 0.005; comp.release.value = 0.3;
  const clip = ac.createWaveShaper(); clip.curve = makeClipCurve();
  const out = ac.createGain(); out.gain.value = 0.9;
  master.connect(comp); comp.connect(clip); clip.connect(out); out.connect(ac.destination);

  const reverb = ac.createConvolver(); reverb.buffer = lite ? makeImpulse(ac, 1.5, 2.6) : makeImpulse(ac);
  const reverbReturn = ac.createGain(); reverbReturn.gain.value = 0.55;
  reverb.connect(reverbReturn); reverbReturn.connect(master);

  const musicBus = ac.createGain(); musicBus.gain.value = 0.36;
  const musicSend = ac.createGain(); musicSend.gain.value = 0.45;
  musicBus.connect(master); musicBus.connect(musicSend); musicSend.connect(reverb);

  const sfxBus = ac.createGain(); sfxBus.gain.value = 0.8;
  const sfxSend = ac.createGain(); sfxSend.gain.value = 0.18;
  sfxBus.connect(master); sfxBus.connect(sfxSend); sfxSend.connect(reverb);

  // shared noise (2 s white) and pre-rendered samples
  const sr = ac.sampleRate;
  const noise = ac.createBuffer(1, sr * 2, sr);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const jingles = [1, 2, 3, 4].map((s) => makeJingle(ac, s));
  const buffers = {
    noise,
    jingles,
    shake: makeShake(ac, jingles),
    crunch: [0, 1, 2, 3, 4].map(() => makeCrunch(ac)),
    crackle: makeCrackle(ac),
  };

  return { ac, lite, master, comp, out, reverb, reverbReturn, musicBus, musicSend, sfxBus, sfxSend, buffers };
}

/** iOS / Safari unlock: play a one-sample silent buffer inside the user gesture. */
export function unlockIOS(ac) {
  try {
    const b = ac.createBuffer(1, 1, 22050);
    const s = ac.createBufferSource();
    s.buffer = b; s.connect(ac.destination); s.start(0);
  } catch (e) { /* ignore */ }
}
