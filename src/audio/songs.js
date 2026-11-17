// Note data for the music-box medley. All tunes are public domain:
//   Jingle Bells (James Lord Pierpont, 1857), Deck the Halls (traditional Welsh),
//   We Wish You a Merry Christmas (traditional English), Auld Lang Syne (traditional Scottish).
// Transcribed by hand into G major so the medley flows without key changes.
//
// Melody tokens: NOTE[:beats]  (e.g. "F#4:1.5"), "r" = rest, "|" = bar line (ignored, for readability).
// Chord tokens:  NAME[:beats]  where NAME = root (+#/b) + '' | 'm' | '7';  "N" = no chord.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10] };

function parseMelody(str) {
  const out = []; let b = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, d] = tok.split(':');
    const dur = d ? parseFloat(d) : 1;
    if (n !== 'r') out.push({ b, m: noteToMidi(n), d: dur });
    b += dur;
  }
  return { notes: out, len: b };
}

function parseChords(str) {
  const out = []; let b = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, d] = tok.split(':');
    const dur = d ? parseFloat(d) : 1;
    if (n !== 'N') {
      const m = /^([A-G])([#b]?)(m|7)?$/.exec(n);
      if (!m) throw new Error('bad chord ' + n);
      const root = 48 + ((PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12); // C3..B3
      out.push({ b, root, tones: QUAL[m[3] || ''], d: dur });
    }
    b += dur;
  }
  return { chords: out, len: b };
}

/** Compile a song into a sorted event list: chords (order 0), beats (1), notes (2). */
function compile(def) {
  const mel = parseMelody(def.melody);
  const ch = parseChords(def.chords);
  const len = Math.max(mel.len, ch.len) + (def.tail || 0);
  const ev = [];
  for (const c of ch.chords) ev.push({ b: c.b, k: 'c', o: 0, root: c.root, tones: c.tones, d: c.d });
  const playedBeats = Math.max(mel.len, ch.len);
  for (let i = 0; i < playedBeats; i++) ev.push({ b: i, k: 'b', o: 1, i: i % def.meter, bar: Math.floor(i / def.meter) });
  for (const n of mel.notes) ev.push({ b: n.b, k: 'n', o: 2, m: n.m, d: n.d });
  ev.sort((a, b) => a.b - b.b || a.o - b.o);
  return { name: def.name, bpm: def.bpm, meter: def.meter, len, events: ev, melLen: mel.len, chordLen: ch.len };
}

export const JINGLE_BELLS = compile({
  name: 'Jingle Bells', bpm: 100, meter: 4, tail: 2,
  melody: `
    D4 B4 A4 G4 | D4:3 D4:.5 D4:.5 | D4 B4 A4 G4 | E4:4 |
    E4 C5 B4 A4 | F#4:4 | D5 D5 C5 A4 | B4:4 |
    D4 B4 A4 G4 | D4:4 | D4 B4 A4 G4 | E4:3 E4 |
    E4 C5 B4 A4 | D5 D5 D5 D5 | E5 D5 C5 A4 | G4:2 D5:2 |
    B4 B4 B4:2 | B4 B4 B4:2 | B4 D5 G4:1.5 A4:.5 | B4:4 |
    C5 C5 C5:1.5 C5:.5 | C5 B4 B4 B4:.5 B4:.5 | B4 A4 A4 B4 | A4:2 D5:2 |
    B4 B4 B4:2 | B4 B4 B4:2 | B4 D5 G4:1.5 A4:.5 | B4:4 |
    C5 C5 C5:1.5 C5:.5 | C5 B4 B4 B4:.5 B4:.5 | D5 D5 C5 A4 | G4:4 |`,
  chords: `
    G:4 G:4 G:4 C:4 | Am:4 D:4 D7:4 G:4 | G:4 G:4 G:4 C:4 | Am:4 D:4 D7:4 G:2 D7:2 |
    G:4 G:4 G:4 G:4 | C:4 G:4 A7:4 D7:4 | G:4 G:4 G:4 G:4 | C:4 G:4 D7:4 G:4 |`,
});

export const DECK_THE_HALLS = compile({
  name: 'Deck the Halls', bpm: 98, meter: 4, tail: 2,
  melody: `
    D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | A4:.5 B4:.5 C5:.5 A4:.5 B4:1.5 A4:.5 | G4 F#4 G4:2 |
    D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | A4:.5 B4:.5 C5:.5 A4:.5 B4:1.5 A4:.5 | G4 F#4 G4:2 |
    A4:1.5 B4:.5 C5 A4 | B4:1.5 C5:.5 D5 A4 | B4:.5 C#5:.5 D5 E5:.5 F#5:.5 G5 | F#5 E5 D5:2 |
    D5:1.5 C5:.5 B4 A4 | G4 A4 B4 G4 | E5:.5 E5:.5 E5:.5 E5:.5 D5:1.5 C5:.5 | B4 A4 G4:2 |`,
  chords: `
    G:4 | G:4 | Am:2 G:2 | D7:2 G:2 |
    G:4 | G:4 | Am:2 G:2 | D7:2 G:2 |
    D7:4 | G:2 D:2 | A7:2 D:2 | A7:2 D:2 |
    G:4 | G:4 | C:2 D7:2 | G:1 D7:1 G:2 |`,
});

export const WE_WISH = compile({
  name: 'We Wish You a Merry Christmas', bpm: 120, meter: 3, tail: 3,
  melody: `
    r:2 D4 |
    G4 G4:.5 A4:.5 G4:.5 F#4:.5 | E4 E4 E4 | A4 A4:.5 B4:.5 A4:.5 G4:.5 | F#4 D4 D4 |
    B4 B4:.5 C5:.5 B4:.5 A4:.5 | G4 E4 D4:.5 D4:.5 | E4 A4 F#4 | G4:2 D4 |
    G4 G4 G4 | F#4:2 F#4 | G4 F#4 E4 | D4:2 A4 |
    B4 A4 G4 | D5 D4 D4:.5 D4:.5 | E4 A4 F#4 | G4:3 |`,
  chords: `
    N:2 D:1 |
    G:3 | C:3 | A7:3 | D:3 |
    B7:3 | Em:3 | C:1 D:2 | G:3 |
    G:3 | D:3 | A7:3 | D:3 |
    G:3 | D7:3 | C:1 D:2 | G:3 |`,
});

export const AULD_LANG_SYNE = compile({
  name: 'Auld Lang Syne', bpm: 72, meter: 4, tail: 4,
  melody: `
    r:3 D4 |
    G4:1.5 G4:.5 G4 B4 | A4:1.5 G4:.5 A4 B4 | G4:1.5 G4:.5 B4 D5 | E5:3 E5 |
    D5:1.5 B4:.5 B4 G4 | A4:1.5 G4:.5 A4 B4 | G4:1.5 E4:.5 E4 D4 | G4:3 E5 |
    D5:1.5 B4:.5 B4 G4 | A4:1.5 G4:.5 A4 E5 | D5:1.5 B4:.5 B4 D5 | E5:3 G5 |
    D5:1.5 B4:.5 B4 G4 | A4:1.5 G4:.5 A4 B4 | G4:1.5 E4:.5 E4 D4 | G4:4 |`,
  chords: `
    N:3 D:1 |
    G:4 | D:4 | G:4 | C:4 |
    G:4 | D:4 | Em:2 C:1 D:1 | G:4 |
    G:4 | D:4 | G:4 | C:4 |
    G:4 | D:4 | Em:2 C:1 D:1 | G:4 |`,
});

/** The looping medley, in order. */
export const MEDLEY = [JINGLE_BELLS, DECK_THE_HALLS, WE_WISH];
