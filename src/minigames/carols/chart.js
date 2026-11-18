// Carol Singing (door 17): the note charts. Pure (no three.js, no DOM) so sim.js / tune.mjs run in node.
// Built from the real melody events in audio/songs.js (read-only), WAVE3.md §Door 17:
//  - keep the on-beat notes plus every note with d ≥ 2; drop any note < 0.42 s after the previous kept one;
//  - notes with d ≥ 2 become holds ending at b + d − 0.5 (half a beat to lift the thumb before the next note);
//  - 3/4 songs faster than 0.55 s a beat also drop the middle beat of each bar (We Wish would be 1.7 taps/s otherwise);
//  - three lanes by pitch (low / middle / high), split so each lane gets about a third of the song's notes.
// Times are song-local seconds from the segment's first beat (fromBeat).
import { JINGLE_BELLS, DECK_THE_HALLS, WE_WISH } from '../../audio/songs.js';

export const LANES = 3;
export const MIN_GAP = 0.42; // s
export const SONGS = [
  { id: 'jingle', song: JINGLE_BELLS, title: 'Jingle Bells', from: 64, to: 96 },
  { id: 'deck', song: DECK_THE_HALLS, title: 'Deck the Halls', from: 0, to: 32 },
  { id: 'wish', song: WE_WISH, title: 'We Wish You a Merry Christmas', from: 0, to: 51 },
];

const EPS = 1e-6;

/** One song's chart: { id, title, name, bpm, spb, meter, from, to, len, end, notes[], melody[] }. */
export function buildChart(def) {
  const s = def.song, spb = 60 / s.bpm, from = def.from, to = Math.min(def.to, s.melLen);
  const mel = s.events.filter((e) => e.k === 'n' && e.b >= from - EPS && e.b < to - EPS);
  const thinBar = s.meter === 3 && spb < 0.55;
  const notes = [];
  let last = -1e9;
  for (const n of mel) {
    const onBeat = Math.abs(n.b - Math.round(n.b)) < EPS;
    const long = n.d >= 2 - EPS;
    if (!onBeat && !long) continue;
    if (thinBar && !long && Math.round(n.b) % 3 === 1) continue;
    if ((n.b - last) * spb < MIN_GAP - EPS) continue;
    last = n.b;
    const t = (n.b - from) * spb;
    const hold = long;
    const endB = hold ? n.b + n.d - 0.5 : n.b;
    notes.push({ i: notes.length, b: n.b, t, m: n.m, d: n.d, hold, endT: (endB - from) * spb, holdBeats: hold ? endB - n.b : 0, lane: 1 });
  }
  assignLanes(notes);
  const lastEnd = notes.reduce((a, n) => Math.max(a, n.endT), 0);
  const len = (to - from) * spb;
  return {
    id: def.id, title: def.title, name: s.name, bpm: s.bpm, spb, meter: s.meter, from, to, len,
    end: Math.max(lastEnd + 0.25, len - spb * 0.5), // when the song's play phase is over (s)
    notes,
    melody: mel.map((n) => ({ t: (n.b - from) * spb, m: n.m, d: n.d * spb })), // every sung note (the choir's mouths)
  };
}

/** Lanes by pitch: distinct pitches sorted, cut into 3 contiguous groups with about equal note counts. */
function assignLanes(notes) {
  const count = new Map();
  for (const n of notes) count.set(n.m, (count.get(n.m) || 0) + 1);
  const pitches = [...count.keys()].sort((a, b) => a - b);
  const total = notes.length, laneOf = new Map();
  let acc = 0;
  for (const p of pitches) {
    const mid = acc + count.get(p) / 2; // the pitch's centre of mass in the cumulative count
    laneOf.set(p, Math.min(LANES - 1, Math.floor((mid / total) * LANES)));
    acc += count.get(p);
  }
  // with very few distinct pitches keep the order strict: a higher note never sits in a lower lane
  for (const n of notes) n.lane = laneOf.get(n.m);
}

export function buildCharts() { return SONGS.map(buildChart); }

export function chartStats(charts = buildCharts()) {
  return charts.map((c) => ({
    id: c.id, notes: c.notes.length, holds: c.notes.filter((n) => n.hold).length, secs: +c.len.toFixed(1),
    tapsPerSec: +(c.notes.length / c.len).toFixed(2), lanes: [0, 1, 2].map((l) => c.notes.filter((n) => n.lane === l).length),
  }));
}
