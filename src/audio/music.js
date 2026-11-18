// Music-box medley with spirit-driven layers and a lookahead scheduler.
// The scheduler itself is time-agnostic: call tick(untilTime) and every event whose time falls before
// untilTime is scheduled on the AudioContext clock. The live engine calls it every 25 ms with a 150 ms
// lookahead; the offline test calls it once for the whole render.
import { MEDLEY, FINALE_SONG } from './songs.js';
import { musicBox, glock, bass, padChord, jingle } from './instruments.js';

// layer index → [name, level gain]
const LAYERS = [
  ['musicbox', 1.0],
  ['sleighbells', 0.22],
  ['bass', 0.75],
  ['choir', 0.6],
  ['glock', 0.55],
];
const FADE = 1.1; // setTargetAtTime constant for layer crossfades (≈3 s to settle)

export function createMusic(ac, graph) {
  const out = ac.createGain(); out.gain.value = 1; out.connect(graph.musicBus);
  const layers = LAYERS.map(([, lv], i) => {
    const g = ac.createGain(); g.gain.value = i === 0 ? lv : 0; g.connect(out); return g;
  });
  // the choir pad shares one formant-ish filter chain
  const padIn = ac.createGain(); padIn.gain.value = 1;
  const padLP = ac.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 1300; padLP.Q.value = 0.5;
  const padF1 = ac.createBiquadFilter(); padF1.type = 'peaking'; padF1.frequency.value = 720; padF1.Q.value = 1.4; padF1.gain.value = 6;
  const padF2 = ac.createBiquadFilter(); padF2.type = 'peaking'; padF2.frequency.value = 1150; padF2.Q.value = 2; padF2.gain.value = 3;
  padIn.connect(padLP); padLP.connect(padF1); padF1.connect(padF2); padF2.connect(layers[3]);

  let level = 0;
  const offAt = [0, -99, -99, -99, -99]; // when each layer was faded out (keep scheduling briefly for the tail)
  const want = (i) => i <= level || ac.currentTime < offAt[i] + 4;

  let medleyIdx = 0;
  let cur = null; // {song, start, spb, i, chord}
  let pendingSpecial = null;
  let onSpecialEnd = null;
  const activePads = [];

  function startSong(song, start) {
    cur = { song, start, spb: 60 / song.bpm, i: 0, chord: null, special: song === FINALE_SONG };
  }

  function setLevel(n, instant = false) {
    const prev = level;
    level = Math.max(0, Math.min(4, n | 0));
    const now = ac.currentTime;
    layers.forEach((g, i) => {
      const target = i <= level ? LAYERS[i][1] : 0;
      if (i > level && i <= prev) offAt[i] = now;
      g.gain.cancelScheduledValues(now);
      if (instant) g.gain.setValueAtTime(target, now);
      else { g.gain.setValueAtTime(g.gain.value, now); g.gain.setTargetAtTime(target, now, FADE); }
    });
  }

  function chordNotes(c, lo = 55, hi = 67) {
    // voice chord tones (skip the 7th for the pad unless it is the only colour) inside [lo, hi]
    return c.tones.map((iv) => {
      let m = c.root + iv;
      while (m < lo) m += 12;
      while (m > hi) m -= 12;
      return m;
    }).sort((a, b) => a - b);
  }

  function play(ev, t) {
    const s = cur.song, spb = cur.spb;
    if (ev.k === 'n') {
      const accent = (ev.b % s.meter) === 0 ? 1.1 : 0.92;
      musicBox(ac, layers[0], ev.m, t, accent);
      // finale doubling: an octave-up music box on long notes once the glockenspiel layer is in
      if (want(4) && ev.d >= 1.5) glock(ac, layers[4], ev.m + 12, t + 0.01, 0.5, 1.4);
    } else if (ev.k === 'c') {
      cur.chord = ev;
      const dur = ev.d * spb;
      if (want(2)) {
        let r = ev.root - 12; if (r < 40) r += 12; // E2..D#3
        const steps = s.meter === 3 ? [[0, 0, 1]] : ev.d >= 4 ? [[0, 0, 1], [2, 7, 0.8]] : ev.d >= 2 ? [[0, 0, 1]] : [[0, 0, 0.9]];
        for (const [beat, iv, v] of steps) {
          if (beat >= ev.d) continue;
          const len = Math.min(ev.d - beat, s.meter === 3 ? ev.d : 2) * spb;
          bass(ac, layers[2], r + (iv === 7 ? -5 : iv), t + beat * spb, len * 0.95, v);
        }
      }
      if (want(3)) {
        const g = padChord(ac, padIn, chordNotes(ev), t, dur + 0.15, cur.special ? 1.25 : 1);
        activePads.push({ g, end: t + dur });
        while (activePads.length > 8) activePads.shift();
      }
    } else if (ev.k === 'b') {
      if (want(1)) {
        const strong = ev.i === 0 || (s.meter === 4 && ev.i === 2);
        jingle(ac, layers[1], graph.buffers, t, strong ? 1 : 0.7);
        if (s.meter === 4) jingle(ac, layers[1], graph.buffers, t + spb * 0.5, 0.45);
      }
      if (want(4) && cur.chord) {
        // glockenspiel counter-melody: chord tones two octaves up on the off-beats
        const offbeat = s.meter === 4 ? (ev.i === 1 || ev.i === 3) : ev.i === 2;
        if (offbeat) {
          const c = cur.chord;
          const tones = chordNotes(c, 79, 91);
          const idx = (ev.bar * 2 + (ev.i === 3 ? 1 : 0)) % tones.length;
          glock(ac, layers[4], tones[(tones.length - 1) - idx], t + spb * 0.5, 0.75);
          if (ev.bar % 2 === 1 && ev.i === (s.meter === 4 ? 3 : 2)) glock(ac, layers[4], tones[idx], t + spb * 0.75, 0.5);
        }
      }
    }
  }

  /** Schedule everything up to `until` (AudioContext seconds). */
  function tick(until) {
    const now = ac.currentTime;
    if (pendingSpecial) {
      const { song, at } = pendingSpecial; pendingSpecial = null;
      // release sustaining pad chords, then jump straight into the special tune
      for (const p of activePads) if (p.end > at) { p.g.gain.cancelScheduledValues(at); p.g.gain.setTargetAtTime(0, at, 0.25); }
      activePads.length = 0;
      startSong(song, at);
    }
    if (!cur) startSong(MEDLEY[medleyIdx], now + 0.1);
    for (let guard = 0; guard < 2000; guard++) {
      const ev = cur.song.events[cur.i];
      if (!ev) {
        const end = cur.start + cur.song.len * cur.spb;
        if (cur.special) {
          medleyIdx = 0;
          const cb = onSpecialEnd; onSpecialEnd = null;
          startSong(MEDLEY[medleyIdx], end);
          if (cb) cb(end);
        } else {
          medleyIdx = (medleyIdx + 1) % MEDLEY.length;
          startSong(MEDLEY[medleyIdx], end);
        }
        continue;
      }
      const t = cur.start + ev.b * cur.spb;
      if (t > until) break;
      if (t < now - 0.2) {
        // we fell behind (tab was throttled): shift the song forward instead of bursting notes
        cur.start += (now - t) + 0.05;
        continue;
      }
      play(ev, Math.max(t, now));
      cur.i++;
    }
  }

  /** Jump to the finale carol (Joy to the World) at time `at`; callback when it ends. */
  function playSpecial(at, cb) {
    pendingSpecial = { song: FINALE_SONG, at };
    onSpecialEnd = cb;
  }

  return {
    tick, setLevel, playSpecial, out,
    /** wave 2: current song timing for beat-synced games (start may lie slightly in the future) */
    get beat() { return cur ? { bpm: cur.song.bpm, meter: cur.song.meter, start: cur.start, spb: cur.spb } : null; },
    get level() { return level; },
    get song() { return cur ? cur.song.name : null; },
  };
}
