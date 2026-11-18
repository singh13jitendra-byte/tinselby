// Music-box medley with spirit-driven layers and a lookahead scheduler.
// The scheduler itself is time-agnostic: call tick(untilTime) and every event whose time falls before
// untilTime is scheduled on the AudioContext clock. The live engine calls it from a 25 ms timer with a
// 0.3 s (desktop) / 0.5 s (phone) lookahead; the offline test calls it once for the whole render.
// Nothing is ever scheduled before `minT` (≈ now + 30 ms): an event that is already late because the main
// thread stalled is skipped (chords start late with their remaining length) instead of being fired at
// "now", where its attack ramp would already be over (click) and several notes would bunch up (chirp).
import { MEDLEY, FINALE_SONG } from './songs.js';
import { musicBox, glock, bass, padChord, jingle } from './instruments.js';
import { room, track, isLite } from './voices.js';
import { midiToHz } from './engine.js';

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
  // wave 3: a one-note choir "ooh" (the player's voice in the carols game) on its own small formant chain, so it is heard
  // at every festive level (the choir layer above is silent below level 3)
  const voiceIn = ac.createGain(); voiceIn.gain.value = 1;
  const voiceLP = ac.createBiquadFilter(); voiceLP.type = 'lowpass'; voiceLP.frequency.value = 1500; voiceLP.Q.value = 0.5;
  const voiceF1 = ac.createBiquadFilter(); voiceF1.type = 'peaking'; voiceF1.frequency.value = 720; voiceF1.Q.value = 1.4; voiceF1.gain.value = 6;
  voiceIn.connect(voiceLP); voiceLP.connect(voiceF1); voiceF1.connect(out);

  let level = 0;
  const offAt = [0, -99, -99, -99, -99]; // when each layer was faded out (keep scheduling briefly for the tail)
  const want = (i) => i <= level || ac.currentTime < offAt[i] + 4;

  let medleyIdx = 0;
  let cur = null; // {song, start, spb, i, chord}
  let pendingSpecial = null;
  let onSpecialEnd = null;
  let pendingSeg = null; // wave 3: { song, fromBeat, toBeat, at, cb } — play part of a song, then resume the medley
  const activePads = [];

  function startSong(song, start) {
    cur = { song, start, spb: 60 / song.bpm, i: 0, chord: null, special: song === FINALE_SONG, segEnd: null, segCb: null };
  }
  /** Fade out pad chords still sustaining after time `at` (before a jump to another tune). */
  function releasePads(at) {
    for (const p of activePads) if (p.end > at) { p.g.gain.cancelScheduledValues(at); p.g.gain.setTargetAtTime(0, at, 0.25); }
    activePads.length = 0;
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

  // voice-budget gates: the melody always plays; colour layers give way first when the scene is busy
  const fits = (t, need, frac) => room(ac, t, need, frac);

  /** Schedule event `ev` due at time t. minT = earliest safe time (only chords can arrive late). */
  function play(ev, t, minT = t) {
    const s = cur.song, spb = cur.spb;
    if (ev.k === 'n') {
      const accent = (ev.b % s.meter) === 0 ? 1.1 : 0.92;
      if (fits(t, 3, 1)) musicBox(ac, layers[0], ev.m, t, accent);
      // finale doubling: an octave-up music box on long notes once the glockenspiel layer is in
      if (want(4) && ev.d >= 1.5 && fits(t, 3, 0.7)) glock(ac, layers[4], ev.m + 12, t + 0.01, 0.5, 1.4);
    } else if (ev.k === 'c') {
      cur.chord = ev;
      const late = Math.max(0, minT - t);
      const dur = ev.d * spb - late;
      if (want(2)) {
        let r = ev.root - 12; if (r < 40) r += 12; // E2..D#3
        const steps = s.meter === 3 ? [[0, 0, 1]] : ev.d >= 4 ? [[0, 0, 1], [2, 7, 0.8]] : ev.d >= 2 ? [[0, 0, 1]] : [[0, 0, 0.9]];
        for (const [beat, iv, v] of steps) {
          if (beat >= ev.d) continue;
          const tb = t + beat * spb;
          if (tb < minT) continue; // missed this bass note: skip it rather than fire it late
          const len = Math.min(ev.d - beat, s.meter === 3 ? ev.d : 2) * spb;
          if (fits(tb, 2, 0.85)) bass(ac, layers[2], r + (iv === 7 ? -5 : iv), tb, len * 0.95, v);
        }
      }
      if (want(3) && dur > 0.4 && fits(t + late, 8, 0.85)) {
        // the pad has a slow attack, so a late start is inaudible: start it now with the remaining length
        const g = padChord(ac, padIn, chordNotes(ev), t + late, dur + 0.15, cur.special ? 1.25 : 1);
        activePads.push({ g, end: t + late + dur });
        while (activePads.length > 8) activePads.shift();
      }
    } else if (ev.k === 'b') {
      if (want(1) && fits(t, 1, 0.75)) {
        const strong = ev.i === 0 || (s.meter === 4 && ev.i === 2);
        jingle(ac, layers[1], graph.buffers, t, strong ? 1 : 0.7);
        if (s.meter === 4 && fits(t, 2, 0.6)) jingle(ac, layers[1], graph.buffers, t + spb * 0.5, 0.45);
      }
      if (want(4) && cur.chord && fits(t, 3, 0.7)) {
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

  /** Schedule everything up to `until` (AudioContext seconds), never earlier than `minT`. */
  function tick(until, minT = ac.currentTime) {
    const now = ac.currentTime;
    if (pendingSpecial) {
      const { song, at } = pendingSpecial; pendingSpecial = null;
      // release sustaining pad chords, then jump straight into the special tune
      releasePads(at);
      startSong(song, at);
    }
    if (pendingSeg) {
      // wave 3 song segment: beat b of the song sounds at at + (b − fromBeat)·spb; events before fromBeat are skipped
      const sg = pendingSeg; pendingSeg = null;
      releasePads(sg.at);
      startSong(sg.song, sg.at - sg.fromBeat * 60 / sg.song.bpm);
      const ev = sg.song.events;
      const i = ev.findIndex((e) => e.b >= sg.fromBeat);
      cur.i = i < 0 ? ev.length : i;
      for (let j = cur.i - 1; j >= 0; j--) if (ev[j].k === 'c') { cur.chord = ev[j]; break; } // glock layer keeps its harmony
      cur.segEnd = sg.toBeat;
      cur.segCb = sg.cb;
    }
    if (!cur) startSong(MEDLEY[medleyIdx], Math.max(now + 0.1, minT));
    for (let guard = 0; guard < 2000; guard++) {
      const ev = cur.song.events[cur.i];
      if (cur.segEnd != null && (!ev || ev.b >= cur.segEnd)) {
        // end of a song segment: one beat of air, then back to the medley (the song that was due next)
        const end = cur.start + cur.segEnd * cur.spb + cur.spb;
        const cb = cur.segCb;
        releasePads(end);
        startSong(MEDLEY[medleyIdx], end);
        if (cb) { try { cb(end); } catch (e) { console.warn('[audio] segment onEnd', e); } }
        continue;
      }
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
      if (t < minT) {
        if (minT - t > 2) {
          // a long gap (timer starved, device asleep with the context running): pick the song up again from
          // here instead of racing through everything we missed
          cur.start += (minT - t) + 0.05;
          continue;
        }
        // a short main-thread stall: drop the missed note / beat on the floor (keeps the beat grid that
        // audio.beat() reports); a missed chord still starts its pad late with the remaining length
        if (ev.k === 'c') play(ev, t, minT);
        cur.i++;
        continue;
      }
      play(ev, t);
      cur.i++;
    }
  }

  /** Jump to the finale carol (Joy to the World) at time `at`; callback when it ends. */
  function playSpecial(at, cb) {
    pendingSpecial = { song: FINALE_SONG, at };
    onSpecialEnd = cb;
  }

  /** Wave 3: play beats [fromBeat, toBeat) of `song` from time `at` (taken over at the next tick, so pass an `at` past what
   *  is already scheduled: currentTime + lookahead), then resume the medley; cb(endTime) is called when the segment's last
   *  event has been scheduled (endTime lies a little in the future). Returns the timing: beat b sounds at start + b·spb. */
  function playSegment(song, fromBeat, toBeat, at, cb) {
    pendingSeg = { song, fromBeat, toBeat, at, cb };
    const spb = 60 / song.bpm;
    return { start: at - fromBeat * spb, spb, bpm: song.bpm, meter: song.meter };
  }

  /** Wave 3: one soft choir "ooh" at midi pitch m from time t (the player's voice joining the carol). Counts against the
   *  shared voice budget like the melody (skipped only when the budget is full); returns false when skipped. */
  function voice(m, t, dur = 0.45, vol = 0.7) {
    const lite = isLite(ac), n = lite ? 1 : 2;
    if (!room(ac, t, n, 1)) return false;
    const f = midiToHz(m), hold = Math.max(0.08, dur);
    const g = ac.createGain(); g.connect(voiceIn);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * vol * (lite ? 1.35 : 1), t + 0.06); // quick, soft onset (a tap needs to be heard)
    g.gain.setTargetAtTime(0, t + hold, 0.18);
    const stop = t + hold + 0.9; // ≈ 5 release taus
    for (const c of (lite ? [-3] : [-7, 7])) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * Math.pow(2, c / 1200), t);
      o.connect(g); o.start(t); o.stop(stop);
    }
    track(ac, t, stop, n);
    return true;
  }

  return {
    tick, setLevel, playSpecial, out,
    playSegment, voice, // wave 3 (carols)
    /** wave 2: current song timing for beat-synced games (start may lie slightly in the future) */
    get beat() { return cur ? { bpm: cur.song.bpm, meter: cur.song.meter, start: cur.start, spb: cur.spb } : null; },
    get level() { return level; },
    get song() { return cur ? cur.song.name : null; },
  };
}
