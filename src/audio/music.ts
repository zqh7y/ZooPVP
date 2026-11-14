import type { MusicApi, MusicState } from './names';
import { IN_SCALE, YO_SCALE, crash, drum, m, renderRecipe, sparkle, type Synth } from './synth';

export type { MusicState };

/*
 * The soundtrack: an adaptive loop that follows the game, with a Japanese festival flavour over a bouncy groove.
 * Its instruments are synthesized and rendered once (like the sound effects); a small sequencer then plays the
 * composed parts on a 16th-note grid, a little ahead of time on the audio clock, so the beat never drifts.
 *
 *   lobby     calm and warm, 92 BPM, 16 bars: koto tune, flute answer, a contrasting middle, taiko tapping softly
 *   search    the lobby's chords held in suspense: a ticking woodblock, a pedal bass, shimmer
 *   battle    144 BPM taiko groove + bass; energy adds a shamisen riff, then a flute hook, fills and crashes
 *   overtime  the battle pushed: faster, a rising ostinato, more drums
 *   victory   a bright yo-scale loop, starting 1.5 s after it is set
 *   defeat    the music fades out
 *
 * Changes wait for the next bar, except battle (0.4 s), victory (1.5 s), defeat and off (right away).
 * Melodies are written as steps along a five-note scale, so a note can never leave its scale.
 */

/** The soundtrack's level: under the effects, so every hit cuts through. */
const LEVEL = 0.27;

type Inst = 'koto' | 'shamisen' | 'flute' | 'chime' | 'pad' | 'bass' | 'don' | 'doko' | 'ka' | 'shime' | 'wood' | 'shaker' | 'crash' | 'shimmer';

interface InstDef {
  bases: number[]; // MIDI notes the instrument is rendered at (the nearest is pitched to each note)
  dur: number;
  vol: number;
  verb?: number;
  pan?: number;
  make: (s: Synth, base: number) => void;
}

const INSTRUMENTS: Record<Inst, InstDef> = {
  koto: {
    // a plucked silk string: a bright strike with a tiny pre-bend, a long singing tail
    bases: [55, 67, 79], dur: 1.5, vol: 0.34, verb: 0.35,
    make: (s, base) => {
      const f = m(base);
      s.tone({ type: 'triangle', f: [[0, f * 1.025], [0.05, f]], a: 0.001, d: 1.2, v: 0.6 });
      s.tone({ f: f * 2, a: 0.001, d: 0.35, v: 0.22 });
      s.bell({ f, ratio: 3, index: 0.45, a: 0.001, d: 0.5, v: 0.3 });
      s.noise({ filter: 'bandpass', f: 3600, q: 1, a: 0.0003, d: 0.012, v: 0.35 });
    },
  },
  shamisen: {
    // a twangy skin-covered lute: a slap, a buzzing saw that closes fast
    bases: [50, 62, 74], dur: 0.6, vol: 0.34, verb: 0.15, pan: -0.15,
    make: (s, base) => {
      const f = m(base);
      s.tone({ type: 'sawtooth', f, lp: [[0, 5200], [0.07, 1500], [0.5, 650]], q: 3, a: 0.001, d: 0.45, v: 0.5 });
      s.tone({ type: 'triangle', f, a: 0.001, d: 0.3, v: 0.4 });
      s.noise({ filter: 'bandpass', f: 2600, q: 1.2, a: 0.0003, d: 0.02, v: 0.8 });
    },
  },
  flute: {
    // a breathy bamboo flute with a little vibrato
    bases: [74, 86], dur: 1.8, vol: 0.3, verb: 0.4, pan: 0.1,
    make: (s, base) => {
      const f = m(base);
      s.tone({ f: [[0, f * 0.985], [0.07, f]], a: 0.045, h: 1.1, d: 0.55, v: 0.6, vib: [5.2, 11] });
      s.tone({ f: f * 2, a: 0.05, h: 1.1, d: 0.5, v: 0.1 });
      s.noise({ filter: 'bandpass', f: f * 2, q: 3, a: 0.04, h: 1.1, d: 0.5, v: 0.14 });
    },
  },
  chime: {
    bases: [84, 96], dur: 1.6, vol: 0.2, verb: 0.55, pan: 0.3,
    make: (s, base) => {
      const f = m(base);
      s.bell({ f, ratio: 2.76, index: 0.5, a: 0.001, d: 1.4, v: 0.6 });
      s.bell({ f: f * 1.5, ratio: 4.1, index: 0.3, a: 0.001, d: 0.5, v: 0.2 });
    },
  },
  pad: {
    bases: [55, 67], dur: 3.4, vol: 0.14, verb: 0.5,
    make: (s, base) => {
      for (const detune of [-9, 0, 8]) s.tone({ type: 'triangle', f: m(base), lp: 1300, a: 0.5, h: 1.8, d: 1, v: 0.4, detune, vib: [0.4, 5] });
    },
  },
  bass: {
    bases: [31, 38, 45], dur: 1, vol: 0.5,
    make: (s, base) => {
      const f = m(base);
      s.tone({ f, a: 0.004, h: 0.5, d: 0.4, v: 0.85 });
      s.tone({ type: 'triangle', f: f * 2, lp: 900, a: 0.004, h: 0.4, d: 0.3, v: 0.28 });
      s.tone({ type: 'sawtooth', f, lp: [[0, 1800], [0.1, 380]], a: 0.003, h: 0.3, d: 0.3, v: 0.16 });
    },
  },
  don: {
    // the big taiko: a deep, round hit
    bases: [0], dur: 0.8, vol: 0.8, verb: 0.2,
    make: (s) => {
      drum(s, 0, 66, 0.6, 1, 2.5);
      s.tone({ f: [[0, 190], [0.2, 120]], a: 0.001, d: 0.25, v: 0.35 });
    },
  },
  doko: {
    bases: [0], dur: 0.45, vol: 0.62, verb: 0.15, pan: 0.1,
    make: (s) => drum(s, 0, 118, 0.32, 0.9, 2),
  },
  ka: {
    // a stick on the drum's rim
    bases: [0], dur: 0.15, vol: 0.4, verb: 0.15, pan: -0.1,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: 2300, q: 2, a: 0.0003, d: 0.05, v: 0.9 });
      s.tone({ f: [[0, 520], [0.03, 380]], a: 0.0003, d: 0.05, v: 0.5 });
    },
  },
  shime: {
    // the small high taiko
    bases: [0], dur: 0.2, vol: 0.3, pan: 0.2,
    make: (s) => {
      s.tone({ f: [[0, 420], [0.04, 290]], a: 0.0005, d: 0.09, v: 0.7 });
      s.noise({ filter: 'bandpass', f: 3800, q: 1.5, a: 0.0003, d: 0.025, v: 0.5 });
    },
  },
  wood: {
    // a wood block tick
    bases: [0], dur: 0.14, vol: 0.34, verb: 0.2, pan: 0.15,
    make: (s) => {
      s.tone({ f: [[0, 1900], [0.012, 1450]], a: 0.0003, d: 0.05, v: 0.7 });
      s.noise({ filter: 'bandpass', f: 2800, q: 4, a: 0.0003, d: 0.015, v: 0.5 });
    },
  },
  shaker: {
    bases: [0], dur: 0.1, vol: 0.14, pan: -0.3,
    make: (s) => s.noise({ filter: 'bandpass', f: 6400, q: 1.2, a: 0.012, d: 0.05, v: 0.8 }),
  },
  crash: {
    bases: [0], dur: 1.8, vol: 0.28, verb: 0.2,
    make: (s) => crash(s, 0, 1.6, 0.8),
  },
  shimmer: {
    bases: [0], dur: 2.4, vol: 0.3, verb: 0.6,
    make: (s) => sparkle(s, 0, 2, 0.8, 8, 2400, 5600),
  },
};

// ------------------------------------------------------------------ the composition

/** One note or hit: step in the bar (0..15), instrument, MIDI note, length in steps, loudness, pan, energy needed. */
interface Ev {
  s: number;
  i: Inst;
  n?: number;
  d?: number;
  v?: number;
  p?: number;
  e?: number;
}
interface Song {
  bpm: number;
  bars: Ev[][];
  sc: Scale;
  swing?: number;
}
/** A five-note scale on a root: a degree (0 = the root, 5 = an octave up, -5 = an octave down) becomes a MIDI note. */
interface Scale {
  root: number;
  base: number[];
  full: number[];
}
const YO: Scale = { root: 62, base: YO_SCALE.slice(0, 5), full: YO_SCALE };
const IN: Scale = { root: 62, base: IN_SCALE.slice(0, 5), full: IN_SCALE };
const note = (sc: Scale, d: number) => sc.root + 12 * Math.floor(d / 5) + sc.base[((d % 5) + 5) % 5];

type Mel = [number, number, number][]; // [step, degree, length]
const mel = (sc: Scale, i: Inst, tune: Mel, v: number, e = 0): Ev[] => tune.map(([s, d, l]) => ({ s, i, n: note(sc, d), d: l, v, e }));
const hit = (i: Inst, steps: number[], v = 1, e = 0): Ev[] => steps.map((s) => ({ s, i, v, e }));

// ---- the lobby (D yo scale: D E G A B). Chords stay inside the scale: G6, Em7, Dsus2, Asus4.
interface Chord {
  b: number; // bass degree
  t: number[]; // chord degrees
}
const CH: Record<string, Chord> = {
  G: { b: -8, t: [-3, -1, 0, 1] },
  E: { b: -9, t: [-4, -3, -1, 0] },
  D: { b: -10, t: [-5, -4, -2, 0] },
  A: { b: -7, t: [-2, 0, 1, 3] },
};
const LOBBY_CHORDS = ['G', 'E', 'D', 'A', 'G', 'E', 'D', 'A', 'E', 'G', 'A', 'D', 'G', 'E', 'D', 'A'];

const TUNE_A: Mel[] = [
  [[0, 5, 2], [2, 6, 2], [4, 7, 4], [8, 6, 2], [10, 5, 2], [12, 6, 4]],
  [[0, 7, 3], [3, 6, 1], [4, 5, 4], [8, 4, 4], [12, 5, 4]],
  [[0, 5, 2], [2, 6, 2], [4, 8, 4], [8, 7, 2], [10, 6, 2], [12, 5, 4]],
  [[0, 6, 2], [2, 5, 2], [4, 3, 4], [8, 5, 4], [12, 6, 2], [14, 7, 2]],
];
const TUNE_A2: Mel = [[0, 6, 2], [2, 5, 2], [4, 3, 2], [6, 5, 2], [8, 7, 8]];
const TUNE_B: Mel[] = [
  [[0, 9, 6], [6, 8, 2], [8, 7, 4], [12, 8, 4]],
  [[0, 7, 4], [4, 6, 4], [8, 7, 2], [10, 8, 2], [12, 9, 4]],
  [[0, 10, 6], [6, 9, 2], [8, 8, 4], [12, 7, 4]],
  [[0, 8, 4], [4, 7, 2], [6, 6, 2], [8, 5, 8]],
];

function lobbyBar(bar: number): Ev[] {
  const ch = CH[LOBBY_CHORDS[bar]];
  const ev: Ev[] = [];
  const sec = bar < 4 ? 0 : bar < 8 ? 1 : bar < 12 ? 2 : 3;
  ev.push(...hit('don', [0], 0.6), ...hit('doko', [10], 0.42), ...hit('ka', [4, 12], 0.3));
  ev.push(...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ s, i: 'shaker' as Inst, v: s % 4 ? 0.35 : 0.6 })));
  if (bar % 4 === 3) ev.push(...hit('shime', [14, 15], 0.5));
  [[0, 0, 3], [3, 5, 1], [6, 0, 2], [8, 0, 3], [11, 5, 1], [14, 0, 2]].forEach(([s, o, d]) => ev.push({ s, i: 'bass', n: note(YO, ch.b + o), d, v: 0.8 }));
  [0, 1, 2, 3, 2, 1, 2, 3].forEach((k, j) => ev.push({ s: j * 2, i: 'koto', n: note(YO, ch.t[k]), d: 3, v: j % 2 ? 0.28 : 0.42, p: j % 2 ? 0.25 : -0.25 }));
  for (const d of ch.t) ev.push({ s: 0, i: 'pad', n: note(YO, d), d: 16, v: 0.6 });
  if (sec === 0) ev.push(...mel(YO, 'koto', TUNE_A[bar], 0.9));
  if (sec === 1) {
    const t = bar === 7 ? [TUNE_A2] : [TUNE_A[bar - 4]];
    ev.push(...mel(YO, 'flute', t[0], 0.85), ...mel(YO, 'koto', t[0], 0.35));
  }
  if (sec === 2) ev.push(...mel(YO, 'flute', TUNE_B[bar - 8], 0.9));
  if (sec === 3) ev.push(...mel(YO, 'koto', TUNE_A[bar - 12], 0.8), ...mel(YO, 'flute', TUNE_A[bar - 12], 0.5));
  if (bar % 2 === 1) ev.push({ s: 8, i: 'chime', n: note(YO, ch.t[2] + 10), d: 8, v: 0.8 });
  if (bar === 8) ev.push({ s: 0, i: 'chime', n: note(YO, 14), d: 8, v: 0.9 });
  return ev;
}

function searchBar(bar: number): Ev[] {
  const ch = CH[LOBBY_CHORDS[Math.floor(bar / 2) % 4]];
  const ev: Ev[] = [];
  ev.push({ s: 0, i: 'bass', n: note(YO, -10), d: 16, v: 0.7 });
  for (const d of ch.t) ev.push({ s: 0, i: 'pad', n: note(YO, d), d: 16, v: 0.75 });
  for (let s = 0; s < 16; s += 2) ev.push({ s, i: 'wood', v: s % 8 === 0 ? 0.8 : s % 4 === 0 ? 0.5 : 0.28 });
  if (bar % 2 === 1) ev.push({ s: 8, i: 'shimmer', v: 0.9 });
  if (bar % 2 === 0) ev.push({ s: 0, i: 'koto', n: note(YO, ch.t[3] + 5), d: 4, v: 0.4 }, { s: 6, i: 'koto', n: note(YO, ch.t[1] + 5), d: 4, v: 0.3 });
  if (bar === 3 || bar === 7) ev.push({ s: 12, i: 'chime', n: note(YO, 13), d: 4, v: 0.7 });
  return ev;
}

// ---- the battle (D "in" scale: D Eb G A Bb), 8 bars: D D Bb A D D G A
const BATTLE_ROOT = [0, 0, 4, 3, 0, 0, 2, 3]; // the chord's root as a degree
const BATTLE_BASS = [-10, -10, -6, -7, -10, -10, -8, -7];
const HOOK: Mel[] = [
  [[0, 5, 2], [2, 7, 2], [4, 8, 4], [8, 7, 2], [10, 5, 2], [12, 7, 4]],
  [[0, 8, 2], [2, 9, 2], [4, 8, 4], [8, 7, 4], [12, 8, 4]],
  [[0, 9, 2], [2, 9, 2], [4, 8, 2], [6, 7, 2], [8, 6, 4], [12, 5, 4]],
  [[0, 6, 2], [2, 7, 2], [4, 8, 8], [12, 7, 2], [14, 6, 2]],
  [[0, 5, 2], [2, 7, 2], [4, 8, 4], [8, 7, 2], [10, 5, 2], [12, 7, 4]],
  [[0, 8, 2], [2, 9, 2], [4, 10, 4], [8, 9, 2], [10, 8, 2], [12, 7, 4]],
  [[0, 10, 4], [4, 9, 2], [6, 8, 2], [8, 7, 4], [12, 5, 4]],
  [[0, 8, 6], [6, 7, 2], [8, 6, 4], [12, 5, 4]],
];
const RIFF: [number, number][] = [[0, 0], [2, 0], [3, 2], [4, 1], [6, 0], [8, 0], [10, 3], [11, 2], [12, 1], [14, 2]]; // [step, steps up from the root]
const FLY = [0, 1, 2, 3, 0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5]; // the overtime ostinato climbs

function battleBar(bar: number, over: boolean): Ev[] {
  const ev: Ev[] = [];
  const r = BATTLE_ROOT[bar];
  // the groove (always)
  ev.push(...hit('don', over ? [0, 3, 6, 8, 10, 12, 14] : [0, 6, 8, 10], 1));
  ev.push(...hit('ka', [4, 12], 0.7), ...hit('doko', over ? [2, 7, 11, 15] : [3, 11], 0.55));
  ev.push(...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ s, i: 'shime' as Inst, v: s % 4 ? 0.4 : 0.7 })));
  [0, 0, 5, 0, 0, 0, 5, 0].forEach((o, k) => ev.push({ s: k * 2, i: 'bass', n: note(IN, BATTLE_BASS[bar] + o), d: 1.6, v: k % 2 ? 0.75 : 1 }));
  ev.push(...hit('shaker', [1, 3, 5, 7, 9, 11, 13, 15], 0.8, over ? 0 : 0.5));
  // the shamisen riff and the sparkle (mid energy)
  const re = over ? 0 : 0.35;
  for (const [s, o] of RIFF) ev.push({ s, i: 'shamisen', n: note(IN, r + 5 + o), d: 1, v: s % 4 ? 0.8 : 1, e: re });
  ev.push({ s: 0, i: 'shamisen', n: note(IN, r), d: 2, v: 0.9, e: re });
  if (bar % 2 === 0) ev.push({ s: 0, i: 'chime', n: note(IN, r + 15), d: 8, v: 0.8, e: over ? 0 : 0.5 });
  // the hook (high energy)
  ev.push(...mel(IN, 'flute', HOOK[bar], 1, over ? 0 : 0.65));
  // fills and crashes
  if (bar % 4 === 0) ev.push({ s: 0, i: 'crash', v: 1, e: over ? 0 : 0.8 });
  if (bar % 4 === 3) ev.push(...[12, 13, 14, 15].map((s, k) => ({ s, i: 'doko' as Inst, v: 0.5 + k * 0.17, e: over ? 0 : 0.8 })));
  if (over) {
    FLY.forEach((o, s) => ev.push({ s, i: 'shamisen', n: note(IN, r + 5 + o + (bar % 2) * 2), d: 1, v: 0.55 + s / 40 }));
    ev.push(...hit('don', [1, 5, 9, 13], 0.55));
    if (bar % 2 === 0) ev.push({ s: 0, i: 'crash', v: 0.9 });
    if (bar % 4 === 3) ev.push(...[8, 10, 11, 12, 13, 14, 15].map((s, k) => ({ s, i: 'doko' as Inst, v: 0.4 + k * 0.1 })));
  }
  return ev;
}

// ---- the victory (D yo scale), 8 bars, bright and bouncy
const VICTORY_CHORDS = ['G', 'D', 'E', 'A', 'G', 'D', 'E', 'A'];
const VICTORY: Mel[] = [
  [[0, 5, 2], [2, 7, 2], [4, 9, 4], [8, 8, 2], [10, 7, 2], [12, 5, 4]],
  [[0, 6, 2], [2, 7, 2], [4, 8, 6], [10, 7, 2], [12, 6, 4]],
  [[0, 7, 2], [2, 9, 2], [4, 10, 4], [8, 9, 2], [10, 8, 2], [12, 7, 4]],
  [[0, 8, 4], [4, 7, 2], [6, 6, 2], [8, 5, 4], [12, 6, 2], [14, 7, 2]],
  [[0, 5, 2], [2, 7, 2], [4, 9, 4], [8, 10, 2], [10, 9, 2], [12, 7, 4]],
  [[0, 8, 2], [2, 9, 2], [4, 10, 6], [10, 9, 2], [12, 8, 4]],
  [[0, 9, 2], [2, 10, 2], [4, 11, 4], [8, 10, 2], [10, 9, 2], [12, 8, 4]],
  [[0, 8, 2], [2, 7, 2], [4, 5, 4], [8, 5, 8]],
];

function victoryBar(bar: number): Ev[] {
  const ch = CH[VICTORY_CHORDS[bar]];
  const ev: Ev[] = [];
  ev.push(...hit('don', [0, 8], 0.8), ...hit('doko', [6, 14], 0.5), ...hit('ka', [4, 12], 0.5));
  ev.push(...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ s, i: 'shime' as Inst, v: s % 4 ? 0.35 : 0.6 })));
  ev.push(...hit('shaker', [1, 3, 5, 7, 9, 11, 13, 15], 0.8));
  [[0, 0, 3], [3, 5, 1], [6, 0, 2], [8, 0, 3], [11, 5, 1], [14, 0, 2]].forEach(([s, o, d]) => ev.push({ s, i: 'bass', n: note(YO, ch.b + o), d, v: 0.85 }));
  for (let j = 0; j < 8; j++) ev.push({ s: j * 2, i: 'koto', n: note(YO, ch.t[[0, 2, 3, 2][j % 4]] + 5), d: 2, v: j % 2 ? 0.3 : 0.45, p: j % 2 ? 0.3 : -0.3 });
  for (const d of ch.t) ev.push({ s: 0, i: 'pad', n: note(YO, d), d: 16, v: 0.5 });
  ev.push(...mel(YO, 'flute', VICTORY[bar], 0.9), ...mel(YO, 'chime', VICTORY[bar], 0.5).map((x) => ({ ...x, n: (x.n ?? 0) + 12 })));
  if (bar % 4 === 0) ev.push({ s: 0, i: 'crash', v: 0.8 });
  return ev;
}

const bars = (n: number, f: (b: number) => Ev[]) => Array.from({ length: n }, (_, b) => f(b));

const SONGS: Record<Exclude<MusicState, 'off' | 'defeat'>, Song> = {
  lobby: { bpm: 92, bars: bars(16, lobbyBar), sc: YO, swing: 0.14 },
  search: { bpm: 92, bars: bars(8, searchBar), sc: YO },
  battle: { bpm: 144, bars: bars(8, (b) => battleBar(b, false)), sc: IN },
  overtime: { bpm: 156, bars: bars(8, (b) => battleBar(b, true)), sc: IN },
  victory: { bpm: 128, bars: bars(8, victoryBar), sc: YO },
};

const MELODIC: Inst[] = ['koto', 'shamisen', 'flute', 'chime', 'pad', 'bass'];

/** For checking: every melodic note of every song against its scale. Returns notes counted and notes outside the scale. */
export function scaleCheck(): { state: string; notes: number; bad: number }[] {
  return Object.entries(SONGS).map(([state, song]) => {
    let notes = 0;
    let bad = 0;
    for (const bar of song.bars) {
      for (const e of bar) {
        if (e.n === undefined || !MELODIC.includes(e.i)) continue;
        notes++;
        const pc = (((e.n - song.sc.root) % 12) + 12) % 12;
        if (!song.sc.full.some((x) => x % 12 === pc)) bad++;
      }
    }
    return { state, notes, bad };
  });
}

// ------------------------------------------------------------------ the player

interface Voice {
  g: GainNode;
  src: AudioBufferSourceNode;
  end: number;
}
type Playable = keyof typeof SONGS;

class Music implements MusicApi {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null; // mute and ducking
  private tone: BiquadFilterNode | null = null; // muffling
  private level: GainNode | null = null;
  private verb: AudioNode | null = null;
  private muted: () => boolean = () => false;
  private samples = new Map<Inst, { base: number; buf: AudioBuffer }[]>();
  private state: MusicState = 'off';
  private playing: Playable | null = null;
  private pending: Playable | null = null;
  private delay = 0; // seconds before a fresh start, kept until the clock exists
  private bar = 0;
  private step = 0;
  private nextT = 0;
  private voices: Voice[] = [];
  private muffled = false;
  private silent = true;
  private target = 0.3; // energy asked for
  private heat = 0.3; // energy heard, eased on the beat
  private rendered = false;

  constructor() {
    if (typeof OfflineAudioContext !== 'undefined') setTimeout(() => void this.renderAll(), 60);
  }

  private async renderAll() {
    for (const [name, def] of Object.entries(INSTRUMENTS) as [Inst, InstDef][]) {
      const list: { base: number; buf: AudioBuffer }[] = [];
      for (const base of def.bases) {
        try {
          list.push({ base, buf: await renderRecipe(`music:${name}:${base}`, def.dur, (s) => def.make(s, base)) });
        } catch {
          /* that instrument stays silent */
        }
      }
      if (list.length) this.samples.set(name, list);
    }
    this.rendered = true;
  }

  /** True once every instrument is rendered. */
  get ready() {
    return this.rendered;
  }

  /** How many instruments are rendered, out of how many. */
  get progress() {
    return { done: this.samples.size, total: Object.keys(INSTRUMENTS).length };
  }

  attach(ac: AudioContext, dest: AudioNode, verb: AudioNode | null, muted: () => boolean) {
    try {
      if (this.ac) return;
      this.ac = ac;
      this.muted = muted;
      this.verb = verb;
      const level = ac.createGain();
      level.gain.value = LEVEL;
      const tone = ac.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 20000;
      tone.Q.value = 0.5;
      const out = ac.createGain();
      out.gain.value = muted() ? 0 : 1;
      level.connect(tone);
      tone.connect(out);
      out.connect(dest);
      this.level = level;
      this.tone = tone;
      this.out = out;
      if (this.muffled) {
        this.muffled = false;
        this.muffle(true);
      }
      setInterval(() => this.tick(), 25);
    } catch {
      /* the game goes on without music */
    }
  }

  set(state: MusicState) {
    try {
      if (state === this.state) return;
      this.state = state;
      if (state === 'off' || state === 'defeat') this.start(null, 0, 0.6);
      else if (state === 'battle') this.start(state, 0.4, 0.15);
      else if (state === 'victory') this.start(state, 1.5, 0.5);
      else this.pending = state; // lobby, search, overtime: on the next bar
      if (this.playing === null && this.pending) this.start(this.pending, 0, 0.1); // nothing is playing: no bar to wait for
    } catch {
      /* ignore */
    }
  }

  muffle(on: boolean) {
    try {
      if (on === this.muffled) return;
      this.muffled = on;
      if (!this.ac || !this.tone || !this.level) return;
      const now = this.ac.currentTime;
      this.tone.frequency.setTargetAtTime(on ? 750 : 20000, now, on ? 0.08 : 0.25);
      this.level.gain.setTargetAtTime(on ? LEVEL * 0.7 : LEVEL, now, 0.15);
    } catch {
      /* ignore */
    }
  }

  duck(amount: number, hold: number) {
    try {
      if (!this.ac || !this.out || this.silent) return;
      const g = this.out.gain;
      const now = this.ac.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(1 - amount * 0.8, now + 0.05);
      g.setTargetAtTime(1, now + hold, 0.4);
    } catch {
      /* ignore */
    }
  }

  energy(v: number) {
    this.target = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  }

  /** Starts a song from its first bar after a delay (null: silence). */
  private start(song: Playable | null, delay: number, fade: number) {
    this.fadeOut(fade);
    this.playing = song;
    this.pending = null;
    this.bar = 0;
    this.step = 0;
    this.heat = this.target;
    this.delay = delay;
    this.nextT = this.ac ? this.ac.currentTime + delay : 0;
  }

  private fadeOut(time: number) {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    for (const v of this.voices) {
      if (v.end <= now) continue;
      try {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setTargetAtTime(0, now, time / 3);
        v.src.stop(now + time + 0.1);
      } catch {
        /* already stopped */
      }
    }
    this.voices = [];
  }

  private tick() {
    try {
      const ac = this.ac;
      if (!ac || !this.out) return;
      const quiet = this.muted() || ac.state !== 'running' || (typeof document !== 'undefined' && document.hidden);
      if (quiet !== this.silent) {
        this.silent = quiet;
        this.out.gain.cancelScheduledValues(ac.currentTime);
        this.out.gain.setTargetAtTime(quiet ? 0 : 1, ac.currentTime, 0.08);
      }
      if (quiet || !this.rendered) {
        this.nextT = 0; // pick up again when it comes back
        return;
      }
      const now = ac.currentTime;
      if (this.nextT <= 0 || this.nextT < now - 0.1) {
        // fell behind (hidden tab, or just unlocked): start cleanly on a fresh step, no burst of missed notes
        this.fadeOut(0.05);
        this.nextT = now + 0.06 + this.delay;
        this.delay = 0;
        this.step = 0;
        if (this.pending) {
          this.playing = this.pending;
          this.pending = null;
          this.bar = 0;
        }
      }
      while (this.nextT < now + 0.15) {
        if (this.step === 0 && this.pending) {
          this.playing = this.pending;
          this.pending = null;
          this.bar = 0;
        }
        const song = this.playing ? SONGS[this.playing] : null;
        if (song) this.playStep(song, this.nextT);
        this.nextT += 60 / (song?.bpm ?? 120) / 4;
        if (this.step % 4 === 0) this.heat += (this.target - this.heat) * 0.4;
        if (++this.step === 16) {
          this.step = 0;
          this.bar++;
        }
      }
      this.voices = this.voices.filter((v) => v.end > now);
    } catch {
      /* the beat goes on at the next tick */
    }
  }

  private playStep(song: Song, t: number) {
    if (this.bar >= song.bars.length) this.bar = 0;
    const stepLen = 60 / song.bpm / 4;
    const swing = song.swing && this.step % 2 ? song.swing * stepLen : 0;
    for (const e of song.bars[this.bar]) {
      if (e.s !== this.step || (e.e ?? 0) > this.heat) continue;
      this.note(e, t + swing + (Math.random() - 0.5) * 0.004, stepLen);
    }
  }

  private note(e: Ev, t: number, stepLen: number) {
    const ac = this.ac!;
    t = Math.max(t, ac.currentTime); // the jitter never schedules a note in the past
    const def = INSTRUMENTS[e.i];
    const list = this.samples.get(e.i);
    if (!list) return;
    let smp = list[0];
    if (e.n !== undefined) for (const x of list) if (Math.abs(x.base - e.n) < Math.abs(smp.base - e.n)) smp = x;
    const rate = e.n !== undefined && smp.base ? 2 ** ((e.n - smp.base) / 12) : 1;
    const src = ac.createBufferSource();
    src.buffer = smp.buf;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    const vol = def.vol * (e.v ?? 1) * (0.93 + Math.random() * 0.1);
    g.gain.setValueAtTime(vol, t);
    let end = t + smp.buf.duration / rate;
    if (e.d !== undefined) {
      const off = t + e.d * stepLen;
      if (off < end) {
        g.gain.setValueAtTime(vol, off);
        g.gain.setTargetAtTime(0, off, 0.03);
        end = off + 0.2;
      }
    }
    src.connect(g);
    let node: AudioNode = g;
    const pan = e.p ?? def.pan;
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    node.connect(this.level!);
    if (def.verb && this.verb) {
      const send = ac.createGain();
      send.gain.value = def.verb * LEVEL;
      node.connect(send);
      send.connect(this.verb);
    }
    src.start(t);
    src.stop(end + 0.05);
    this.voices.push({ g, src, end });
  }
}

export const music: MusicApi = new Music();
