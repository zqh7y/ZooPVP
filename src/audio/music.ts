import { MUSIC_ALIAS, type LegacyMusicState, type MusicApi, type MusicState } from './names';
import { frand } from '../rng';
import { mallet, voice } from './kit';
import { crash, drum, m, renderRecipe, sparkle, type Synth } from './synth';

export type { MusicState };
export { MUSIC_ALIAS };

/*
 * The soundtrack: an adaptive loop that follows the game. Its instruments are synthesized and rendered once (like
 * the sound effects); a small sequencer then plays the composed parts on a 16th-note grid, a little ahead of time
 * on the audio clock, so the beat never drifts.
 *
 *   lobby     the main screen, most of the time (v4's prep music): 90 BPM, G major, 16 bars. Soft keys, a catchy
 *             marimba tune that leaves room, a round bass, brushed shaker and finger snaps. Warm, never tiring
 *   search    looking for an opponent: 112 BPM, E minor, 4 bars. A clock ticking on the 8ths, a pulsing bass,
 *             a nervous little marimba figure and a sonar chime: light, a little tense
 *   fight     a fight: 124 BPM, E minor, four on the floor; energy adds offbeat brass stabs, the marimba hook,
 *             a horn, the crowd chanting "oh", crashes and fills
 *   champion  a champion match: 132 BPM, E phrygian, big drums and a low ostinato, the crowd chanting, a choir
 *             and brass on every bar; it always plays at least at energy 0.6 (bigger than fight)
 *   victory   a bright, bouncy G major loop, starting 2.4 s after it is set (after the VICTORY stinger)
 *   defeat    a soft, slow, sparse loop (no drums), 1.4 s after it is set (after the DEFEAT stinger)
 *
 * The older names still work (MUSIC_ALIAS): prep plays lobby, wave and battle play fight, boss and overtime play
 * champion, stageClear plays victory.
 * Changes: lobby fades in fresh after 1.2 s (straight away when nothing plays), search after 0.15 s, fight after
 * 0.35 s, champion 0.6 s, victory 2.4 s, defeat 1.4 s; off stops at once.
 * The lobby's instruments are rendered first, and a song starts as soon as its own instruments are ready, so the
 * main screen has music within moments of the first tap.
 * Melodies are written as degrees of a seven-note scale, so a note can never leave its scale (see scaleCheck).
 */

/** The soundtrack's level: under the effects, so every hit cuts through. */
const LEVEL = 0.3;

type Inst = 'keys' | 'mallet' | 'flute' | 'chime' | 'pad' | 'bass' | 'kick' | 'snap' | 'clap' | 'hat' | 'tom' | 'don' | 'stab' | 'horn' | 'chant' | 'choir' | 'shaker' | 'crash' | 'shimmer' | 'block';

interface InstDef {
  bases: number[]; // MIDI notes the instrument is rendered at (the nearest is pitched to each note)
  dur: number;
  vol: number;
  verb?: number;
  pan?: number;
  make: (s: Synth, base: number) => void;
}

const INSTRUMENTS: Record<Inst, InstDef> = {
  keys: {
    // a soft electric piano: a round tine, mellow and warm
    bases: [55, 67, 79], dur: 2.2, vol: 0.2, verb: 0.35,
    make: (s, base) => {
      const f = m(base);
      s.tone({ f, a: 0.003, d: 1.9, v: 0.5 });
      s.bell({ f, ratio: 1, index: 0.8, a: 0.002, d: 1.2, v: 0.35 });
      s.bell({ f: f * 2, ratio: 7, index: 0.15, a: 0.001, d: 0.25, v: 0.05 });
      s.tone({ f: f * 2, a: 0.003, d: 0.6, v: 0.07 });
    },
  },
  mallet: {
    // a marimba
    bases: [60, 72, 84], dur: 1.2, vol: 0.3, verb: 0.3,
    make: (s, base) => mallet(s, 0, base, 1, 0.8),
  },
  flute: {
    // a breathy flute with a little vibrato
    bases: [74, 86], dur: 1.8, vol: 0.26, verb: 0.4, pan: 0.1,
    make: (s, base) => {
      const f = m(base);
      s.tone({ f: [[0, f * 0.985], [0.07, f]], a: 0.045, h: 1.1, d: 0.55, v: 0.6, vib: [5.2, 11] });
      s.tone({ f: f * 2, a: 0.05, h: 1.1, d: 0.5, v: 0.08 });
      s.noise({ filter: 'bandpass', f: f * 2, q: 3, a: 0.04, h: 1.1, d: 0.5, v: 0.1 });
    },
  },
  chime: {
    bases: [84, 96], dur: 1.6, vol: 0.16, verb: 0.55, pan: 0.3,
    make: (s, base) => {
      const f = m(base);
      s.bell({ f, ratio: 2.76, index: 0.5, a: 0.001, d: 1.4, v: 0.6 });
      s.bell({ f: f * 1.5, ratio: 4.1, index: 0.3, a: 0.001, d: 0.5, v: 0.2 });
    },
  },
  pad: {
    bases: [55, 67], dur: 3.4, vol: 0.12, verb: 0.5,
    make: (s, base) => {
      for (const detune of [-9, 0, 8]) s.tone({ type: 'triangle', f: m(base), lp: 1300, a: 0.5, h: 1.8, d: 1, v: 0.4, detune, vib: [0.4, 5] });
    },
  },
  bass: {
    bases: [31, 38, 45], dur: 1, vol: 0.38,
    make: (s, base) => {
      const f = m(base);
      s.tone({ f, a: 0.004, h: 0.5, d: 0.4, v: 0.85 });
      s.tone({ type: 'triangle', f: f * 2, lp: 900, a: 0.004, h: 0.4, d: 0.3, v: 0.28 });
      s.tone({ type: 'sawtooth', f, lp: [[0, 1800], [0.1, 380]], a: 0.003, h: 0.3, d: 0.3, v: 0.16 });
    },
  },
  kick: {
    // a round, soft kick
    bases: [0], dur: 0.45, vol: 0.5,
    make: (s) => drum(s, 0, 52, 0.35, 1, 1.8),
  },
  snap: {
    // a finger snap
    bases: [0], dur: 0.15, vol: 0.22, verb: 0.2, pan: -0.12,
    make: (s) => {
      s.noise({ filter: 'bandpass', f: 2400, q: 2.5, a: 0.0004, d: 0.035, v: 0.9 });
      s.tone({ f: [[0, 1700], [0.02, 1200]], a: 0.0004, d: 0.02, v: 0.3 });
    },
  },
  clap: {
    // a hand clap: three slaps a hair apart and the room after them
    bases: [0], dur: 0.3, vol: 0.3, verb: 0.25,
    make: (s) => {
      for (const t of [0, 0.009, 0.018]) s.noise({ t, filter: 'bandpass', f: 1150, q: 1.1, a: 0.0004, d: 0.012, v: 0.8 });
      s.noise({ t: 0.027, filter: 'bandpass', f: 1300, q: 0.9, a: 0.001, d: 0.13, v: 0.6 });
    },
  },
  hat: {
    bases: [0], dur: 0.08, vol: 0.12, pan: 0.25,
    make: (s) => s.noise({ filter: 'highpass', f: 8000, a: 0.0005, d: 0.03, v: 0.8 }),
  },
  tom: {
    bases: [45, 52, 57], dur: 0.5, vol: 0.45, verb: 0.15,
    make: (s, base) => drum(s, 0, m(base), 0.35, 1, 1.8),
  },
  don: {
    // the big drum: a deep, round hit
    bases: [0], dur: 0.8, vol: 0.7, verb: 0.2,
    make: (s) => {
      drum(s, 0, 62, 0.6, 1, 2.5);
      s.tone({ f: [[0, 180], [0.2, 110]], a: 0.001, d: 0.25, v: 0.3 });
    },
  },
  stab: {
    // a short brass stab
    bases: [55, 67], dur: 0.6, vol: 0.2, verb: 0.25,
    make: (s, base) => s.brass({ notes: [base], cut: [[0, 500], [0.04, 2600], [0.25, 700]], a: 0.008, h: 0.06, d: 0.18, v: 0.7 }),
  },
  horn: {
    // a held brass line
    bases: [62, 74], dur: 1.4, vol: 0.2, verb: 0.3,
    make: (s, base) => s.brass({ notes: [base], cut: [[0, 500], [0.06, 2400], [1.2, 900]], a: 0.025, h: 0.8, d: 0.4, v: 0.7, vib: [5, 10] }),
  },
  chant: {
    // the crowd chanting "oh!"
    bases: [52, 59], dur: 0.9, vol: 0.3, verb: 0.4,
    make: (s, base) => {
      for (let i = 0; i < 8; i++) {
        const f = m(base) * 2 ** (s.rand(-18, 18) / 1200) * (i % 4 === 0 ? 2 : 1);
        voice(s, { t: s.rand(0, 0.02), f: [[0, f * 0.97], [0.05, f]], vow: [[0, 'o'], [0.25, 'u']], size: s.rand(0.95, 1.2), a: 0.03, h: 0.25, d: 0.3, v: 0.25, breath: 0.12, vib: [s.rand(4.5, 5.5), 15] });
      }
    },
  },
  choir: {
    bases: [55, 67], dur: 2.6, vol: 0.14, verb: 0.5,
    make: (s, base) => s.choir({ notes: [base], a: 0.35, h: 1.3, d: 0.9, v: 0.8 }),
  },
  shaker: {
    bases: [0], dur: 0.1, vol: 0.12, pan: -0.3,
    make: (s) => s.noise({ filter: 'bandpass', f: 6000, q: 1.2, a: 0.012, d: 0.05, v: 0.8 }),
  },
  crash: {
    bases: [0], dur: 1.8, vol: 0.24, verb: 0.2,
    make: (s) => crash(s, 0, 1.6, 0.8),
  },
  shimmer: {
    bases: [0], dur: 2.4, vol: 0.26, verb: 0.6,
    make: (s) => sparkle(s, 0, 2, 0.8, 8, 2400, 5600),
  },
  block: {
    // a woodblock: the searching clock's tick-tock
    bases: [76, 88], dur: 0.12, vol: 0.2, verb: 0.2, pan: 0.15,
    make: (s, base) => {
      const f = m(base);
      s.tone({ f: [[0, f * 1.06], [0.03, f]], a: 0.0005, d: 0.04, v: 0.7 });
      s.tone({ f: f * 2.71, a: 0.0005, d: 0.015, v: 0.2 });
      s.noise({ filter: 'bandpass', f: f * 1.6, q: 3, a: 0.0003, d: 0.01, v: 0.6 });
    },
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
  /** the energy it never drops below (champion is always big) */
  floor?: number;
}
/** A seven-note scale on a root: a degree (0 = the root, 7 = an octave up, -7 = an octave down) becomes a MIDI note. */
interface Scale {
  root: number;
  base: number[];
}
const G_MAJOR: Scale = { root: 55, base: [0, 2, 4, 5, 7, 9, 11] }; // degree 0 = G3
const E_MINOR: Scale = { root: 52, base: [0, 2, 3, 5, 7, 8, 10] }; // degree 0 = E3
const E_PHRYGIAN: Scale = { root: 52, base: [0, 1, 3, 5, 7, 8, 10] }; // E F G A B C D
const note = (sc: Scale, d: number) => {
  const L = sc.base.length;
  return sc.root + 12 * Math.floor(d / L) + sc.base[((d % L) + L) % L];
};

type Mel = [number, number, number][]; // [step, degree, length]
const mel = (sc: Scale, i: Inst, tune: Mel, v: number, e = 0): Ev[] => tune.map(([s, d, l]) => ({ s, i, n: note(sc, d), d: l, v, e }));
const hit = (i: Inst, steps: number[], v = 1, e = 0): Ev[] => steps.map((s) => ({ s, i, v, e }));
/** A chord: its bass degree and its chord degrees. */
interface Chord {
  b: number;
  t: number[];
}
const chordEv = (sc: Scale, i: Inst, ch: Chord, s: number, d: number, v: number, e = 0, up = 0): Ev[] => ch.t.map((x) => ({ s, i, n: note(sc, x + up), d, v, e }));

// ---- prep (G major). Gadd9, Em7, Cmaj7, D, Am7: soft and open
const PREP_CH: Record<string, Chord> = {
  G: { b: -7, t: [2, 4, 7, 8] },
  Em: { b: -9, t: [2, 4, 5, 7] },
  C: { b: -4, t: [2, 3, 5, 7] },
  D: { b: -10, t: [1, 4, 6, 8] },
  Am: { b: -6, t: [1, 3, 5, 7] },
};
const PREP_CHORDS = ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am', 'D', 'C', 'G', 'Am', 'Em', 'C', 'G', 'Am', 'D'];
const PREP_TUNE: Mel[] = [
  // A: the marimba tune
  [[0, 9, 3], [3, 8, 1], [4, 7, 4], [10, 8, 2], [12, 9, 4]],
  [[0, 11, 3], [4, 9, 3], [8, 7, 8]],
  [[0, 10, 2], [2, 9, 2], [4, 7, 4], [8, 5, 4], [12, 7, 4]],
  [[0, 8, 6], [8, 6, 2], [10, 8, 2], [12, 11, 4]],
  // B: its answer
  [[0, 9, 3], [3, 8, 1], [4, 7, 4], [10, 9, 2], [12, 11, 4]],
  [[0, 12, 4], [4, 11, 2], [6, 9, 2], [8, 11, 8]],
  [[0, 10, 3], [3, 9, 1], [4, 8, 4], [8, 7, 2], [10, 8, 2], [12, 5, 4]],
  [[0, 6, 4], [4, 8, 4], [8, 4, 8]],
  // C: the flute, long and calm (the marimba rests)
  [[0, 7, 6], [6, 9, 2], [8, 10, 8]],
  [[0, 11, 6], [6, 9, 2], [8, 7, 8]],
  [[0, 8, 6], [6, 10, 2], [8, 12, 8]],
  [[0, 11, 8], [8, 9, 8]],
  // D: a few marimba notes, lots of air
  [[4, 9, 2], [6, 10, 2], [8, 12, 8]],
  [[4, 11, 2], [6, 9, 2], [8, 7, 8]],
  [[4, 8, 2], [6, 10, 2], [8, 12, 4], [12, 11, 4]],
  [[0, 8, 6], [6, 6, 2], [8, 4, 8]],
];

function prepBar(bar: number): Ev[] {
  const sc = G_MAJOR;
  const ch = PREP_CH[PREP_CHORDS[bar]];
  const sec = Math.floor(bar / 4);
  const ev: Ev[] = [];
  // the kit: brushed, soft
  ev.push(...hit('kick', [0], sec === 2 ? 0.32 : 0.45));
  if (sec === 1 || sec === 3) ev.push(...hit('kick', [10], 0.28));
  ev.push(...hit('snap', [4, 12], sec === 0 ? 0.3 : 0.42));
  ev.push(...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ s, i: 'shaker' as Inst, v: s % 4 ? 0.22 : 0.34 })));
  if (bar === 15) ev.push({ s: 12, i: 'tom', n: 57, v: 0.3 }, { s: 14, i: 'tom', n: 52, v: 0.35 });
  // the round bass
  [[0, 0, 6], [8, 4, 4], [12, 0, 2], [14, 4, 2]].forEach(([s, o, d]) => ev.push({ s, i: 'bass', n: note(sc, ch.b + o), d, v: 0.6 }));
  // the keys
  if (sec === 2) ev.push(...chordEv(sc, 'keys', ch, 0, 14, 0.26));
  else {
    ev.push(...chordEv(sc, 'keys', ch, 0, 6, 0.34), ...chordEv(sc, 'keys', ch, 8, 6, 0.25));
    ev.push({ s: 6, i: 'keys', n: note(sc, ch.t[3]), d: 2, v: 0.16 }, { s: 11, i: 'keys', n: note(sc, ch.t[1]), d: 3, v: 0.14 }, { s: 11, i: 'keys', n: note(sc, ch.t[2]), d: 3, v: 0.14 });
  }
  if (sec >= 2) ev.push(...chordEv(sc, 'pad', ch, 0, 16, 0.42));
  // the tune
  const tune = PREP_TUNE[bar];
  if (sec === 2) ev.push(...mel(sc, 'flute', tune, 0.58));
  else ev.push(...mel(sc, 'mallet', tune, sec === 3 ? 0.66 : 0.8));
  if (bar === 3 || bar === 7) ev.push({ s: 12, i: 'chime', n: note(sc, ch.t[3] + 7), d: 4, v: 0.45 });
  if (bar === 12 || bar === 14) ev.push({ s: 0, i: 'chime', n: note(sc, ch.t[2] + 7), d: 8, v: 0.4 });
  return ev;
}

// ---- wave (E minor), 8 bars: Em C G D Em C Am D
const WAVE_CH: Record<string, Chord> = {
  Em: { b: -7, t: [4, 7, 9] },
  C: { b: -2, t: [5, 7, 9] },
  G: { b: -5, t: [4, 6, 9] },
  D: { b: -1, t: [3, 6, 8] },
  Am: { b: -4, t: [3, 5, 7] },
};
const WAVE_CHORDS = ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'D'];
const WAVE_HOOK: Mel[] = [
  [[0, 7, 2], [2, 7, 2], [4, 9, 2], [6, 7, 2], [8, 11, 4], [12, 10, 2], [14, 9, 2]],
  [[0, 12, 2], [2, 11, 2], [4, 9, 4], [8, 7, 4], [12, 9, 4]],
  [[0, 11, 2], [2, 11, 2], [4, 12, 2], [6, 11, 2], [8, 9, 4], [12, 6, 4]],
  [[0, 8, 4], [4, 9, 2], [6, 8, 2], [8, 6, 8]],
  [[0, 7, 2], [2, 7, 2], [4, 9, 2], [6, 7, 2], [8, 11, 4], [12, 10, 2], [14, 9, 2]],
  [[0, 12, 2], [2, 11, 2], [4, 9, 2], [6, 11, 2], [8, 12, 4], [12, 14, 4]],
  [[0, 10, 2], [2, 10, 2], [4, 12, 2], [6, 10, 2], [8, 9, 4], [12, 7, 4]],
  [[0, 8, 4], [4, 10, 2], [6, 9, 2], [8, 8, 4], [12, 6, 4]],
];
/** The crowd's chant: "oh, oh, oh-OH ... oh-ohhh". */
const CHANT: Mel[] = [
  [[0, 4, 2], [4, 4, 2], [8, 5, 2], [12, 4, 3]],
  [[0, 2, 3], [4, 2, 2], [8, 0, 6]],
];

function waveBar(bar: number): Ev[] {
  const sc = E_MINOR;
  const ch = WAVE_CH[WAVE_CHORDS[bar]];
  const ev: Ev[] = [];
  // the groove (always): four on the floor, claps, offbeat hats
  ev.push({ s: 0, i: 'kick', v: 1 }, { s: 4, i: 'kick', v: 0.8 }, { s: 8, i: 'kick', v: 0.95 }, { s: 12, i: 'kick', v: 0.8 });
  ev.push(...hit('clap', [4, 12], 0.8), ...hit('hat', [2, 6, 10, 14], 0.6));
  ev.push(...hit('shaker', [1, 3, 5, 7, 9, 11, 13, 15], 0.6, 0.3));
  [0, 0, 7, 0, 0, 0, 7, 4].forEach((o, k) => ev.push({ s: k * 2, i: 'bass', n: note(sc, ch.b + o), d: 1.6, v: k % 2 ? 0.75 : 1 }));
  // offbeat stabs
  ev.push(...chordEv(sc, 'stab', ch, 6, 1, 0.7, 0.2), ...chordEv(sc, 'stab', ch, 14, 1, 0.6, 0.2));
  // the hook, then a horn doubling it
  ev.push(...mel(sc, 'mallet', WAVE_HOOK[bar], 0.8, 0.4));
  ev.push(...mel(sc, 'horn', WAVE_HOOK[bar], 0.55, 0.7));
  // the crowd
  if (bar % 4 < 2) ev.push(...mel(sc, 'chant', CHANT[bar % 2], 0.9, 0.6));
  // crashes and fills
  if (bar % 4 === 0) ev.push({ s: 0, i: 'crash', v: 0.9, e: 0.75 });
  if (bar % 4 === 3) ev.push(...[12, 13, 14, 15].map((s, k) => ({ s, i: 'tom' as Inst, n: [57, 57, 52, 45][k], v: 0.5 + k * 0.15, e: 0.75 })));
  return ev;
}

// ---- boss (E phrygian), 8 bars: Em Em F F Em Em G F
const BOSS_CH: Record<string, Chord> = {
  Em: { b: -7, t: [4, 7, 9] },
  F: { b: -6, t: [3, 5, 8] },
  G: { b: -5, t: [4, 6, 9] },
};
const BOSS_CHORDS = ['Em', 'Em', 'F', 'F', 'Em', 'Em', 'G', 'F'];
const BOSS_HORN: Mel[] = [
  [[0, 7, 8], [8, 8, 8]],
  [[0, 7, 12], [12, 6, 4]],
  [[0, 8, 8], [8, 9, 8]],
  [[0, 10, 8], [8, 8, 8]],
  [[0, 11, 8], [8, 12, 8]],
  [[0, 11, 12], [12, 9, 4]],
  [[0, 9, 8], [8, 11, 8]],
  [[0, 12, 8], [8, 8, 8]],
];

function bossBar(bar: number): Ev[] {
  const sc = E_PHRYGIAN;
  const ch = BOSS_CH[BOSS_CHORDS[bar]];
  const ev: Ev[] = [];
  // big drums (always)
  ev.push({ s: 0, i: 'don', v: 1 }, { s: 6, i: 'don', v: 0.7 }, { s: 8, i: 'don', v: 0.9 });
  ev.push(...hit('kick', [0, 4, 8, 12], 0.85), ...hit('clap', [4, 12], 0.7), ...hit('hat', [2, 6, 10, 14], 0.55));
  if (bar % 2 === 1) ev.push({ s: 14, i: 'tom', n: 52, v: 0.6 }, { s: 15, i: 'tom', n: 45, v: 0.7 });
  // the low ostinato, with the menacing half step
  [0, 0, 7, 0, 1, 0, 7, 0].forEach((o, k) => ev.push({ s: k * 2, i: 'bass', n: note(sc, ch.b + o), d: 1.6, v: k % 2 ? 0.8 : 1 }));
  // stabs: dun - dun - dun
  for (const s of [0, 3, 6]) ev.push(...chordEv(sc, 'stab', ch, s, 1.5, 0.75, 0.2, -7));
  ev.push(...mel(sc, 'horn', BOSS_HORN[bar], 0.7, 0.45));
  if (bar % 2 === 0) ev.push(...chordEv(sc, 'choir', ch, 0, 16, 0.85, 0.6));
  // a ticking marimba, tense
  for (let k = 0; k < 8; k++) ev.push({ s: k * 2, i: 'mallet', n: note(sc, ch.t[k % 2 ? 1 : 2] + 7), d: 1, v: k % 2 ? 0.35 : 0.5, e: 0.7 });
  if (bar % 2 === 0) ev.push({ s: 0, i: 'crash', v: 0.85, e: 0.8 });
  if (bar % 4 === 3) ev.push(...[8, 10, 11, 12, 13, 14, 15].map((s, k) => ({ s, i: 'tom' as Inst, n: [57, 57, 52, 52, 45, 45, 45][k], v: 0.4 + k * 0.1, e: 0.8 })));
  return ev;
}

// ---- stage clear (G major), 8 bars, bright and bouncy
const CLEAR_CH: Record<string, Chord> = {
  G: { b: -7, t: [0, 2, 4] },
  D: { b: -10, t: [1, 4, 6] },
  Em: { b: -9, t: [0, 2, 5] },
  C: { b: -4, t: [0, 3, 5] },
};
const CLEAR_CHORDS = ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'];
const CLEAR_TUNE: Mel[] = [
  [[0, 7, 2], [2, 9, 2], [4, 11, 4], [8, 12, 2], [10, 11, 2], [12, 9, 4]],
  [[0, 8, 2], [2, 9, 2], [4, 11, 6], [10, 9, 2], [12, 8, 4]],
  [[0, 9, 2], [2, 11, 2], [4, 12, 4], [8, 11, 2], [10, 9, 2], [12, 7, 4]],
  [[0, 10, 4], [4, 9, 2], [6, 8, 2], [8, 7, 4], [12, 8, 2], [14, 9, 2]],
  [[0, 7, 2], [2, 9, 2], [4, 11, 4], [8, 14, 2], [10, 12, 2], [12, 11, 4]],
  [[0, 11, 2], [2, 12, 2], [4, 13, 6], [10, 12, 2], [12, 11, 4]],
  [[0, 12, 2], [2, 11, 2], [4, 10, 4], [8, 9, 2], [10, 10, 2], [12, 12, 4]],
  [[0, 11, 4], [4, 8, 4], [8, 6, 4], [12, 8, 4]],
];

function clearBar(bar: number): Ev[] {
  const sc = G_MAJOR;
  const ch = CLEAR_CH[CLEAR_CHORDS[bar]];
  const ev: Ev[] = [];
  ev.push(...hit('kick', [0, 8], 0.85), ...hit('kick', [10], 0.45), ...hit('clap', [4, 12], 0.65), ...hit('hat', [2, 6, 10, 14], 0.5));
  ev.push(...hit('shaker', [1, 3, 5, 7, 9, 11, 13, 15], 0.6));
  [[0, 0, 2], [3, 0, 1], [4, 7, 2], [6, 0, 2], [8, 0, 2], [11, 4, 1], [12, 7, 2], [14, 4, 2]].forEach(([s, o, d]) => ev.push({ s, i: 'bass', n: note(sc, ch.b + o), d, v: 0.8 }));
  for (let j = 0; j < 8; j++) ev.push({ s: j * 2, i: 'mallet', n: note(sc, ch.t[[0, 1, 2, 1][j % 4]] + 7), d: 2, v: j % 2 ? 0.3 : 0.42, p: j % 2 ? 0.3 : -0.3 });
  ev.push(...chordEv(sc, 'keys', ch, 0, 14, 0.25));
  ev.push(...mel(sc, 'flute', CLEAR_TUNE[bar], 0.8), ...mel(sc, 'chime', CLEAR_TUNE[bar], 0.32).map((x) => ({ ...x, n: (x.n ?? 0) + 12 })));
  if (bar % 4 === 0) ev.push({ s: 0, i: 'crash', v: 0.7 });
  return ev;
}

// ---- defeat (G major / E minor), 4 slow bars: Em7 Cmaj7 Am7 Dsus
const DEFEAT_CH: Chord[] = [
  { b: -9, t: [2, 4, 5, 7] },
  { b: -4, t: [2, 3, 5, 7] },
  { b: -6, t: [1, 3, 5, 7] },
  { b: -10, t: [1, 4, 5, 8] },
];
const DEFEAT_TUNE: Mel[] = [
  [[4, 9, 4], [8, 7, 8]],
  [[4, 9, 4], [8, 7, 8]],
  [[4, 8, 4], [8, 5, 8]],
  [[4, 8, 4], [8, 11, 8]],
];

function defeatBar(bar: number): Ev[] {
  const sc = G_MAJOR;
  const ch = DEFEAT_CH[bar];
  return [
    { s: 0, i: 'bass', n: note(sc, ch.b), d: 14, v: 0.45 },
    ...chordEv(sc, 'keys', ch, 0, 15, 0.38),
    { s: 8, i: 'keys', n: note(sc, ch.t[3]), d: 6, v: 0.2 },
    ...chordEv(sc, 'pad', ch, 0, 16, 0.6),
    ...mel(sc, 'mallet', DEFEAT_TUNE[bar], 0.6),
  ];
}

// ---- search (E minor), 4 bars: Em C Am Bm. A clock, a pulse, a nervous figure: light, a little tense
const SEARCH_CH: Record<string, Chord> = {
  Em: { b: -7, t: [4, 7, 9] },
  C: { b: -2, t: [5, 7, 9] },
  Am: { b: -4, t: [3, 5, 7] },
  Bm: { b: -3, t: [4, 6, 8] },
};
const SEARCH_CHORDS = ['Em', 'C', 'Am', 'Bm'];

function searchBar(bar: number): Ev[] {
  const sc = E_MINOR;
  const ch = SEARCH_CH[SEARCH_CHORDS[bar]];
  const ev: Ev[] = [];
  // the clock: tick (B5) - tock (E5) on the 8ths, a whisper of shaker between
  for (let k = 0; k < 8; k++) ev.push({ s: k * 2, i: 'block', n: note(sc, k % 2 ? 14 : 18), v: k % 2 ? 0.55 : 0.75 });
  ev.push(...hit('shaker', [3, 7, 11, 15], 0.35));
  ev.push(...hit('kick', [0], 0.38), ...hit('kick', [8], 0.26));
  // the pulse: the bass on every 8th, leaning on the downbeats
  for (let k = 0; k < 8; k++) ev.push({ s: k * 2, i: 'bass', n: note(sc, ch.b), d: 1, v: k % 4 === 0 ? 0.5 : 0.3 });
  ev.push(...chordEv(sc, 'pad', ch, 0, 16, 0.4));
  // a nervous little figure: chord tones on dotted 8ths, an octave up
  [0, 3, 6, 10, 13].forEach((s, k) => ev.push({ s, i: 'mallet', n: note(sc, ch.t[[0, 1, 2, 1, 0][k]] + 7), d: 2, v: k === 0 ? 0.42 : 0.32, p: k % 2 ? 0.25 : -0.25 }));
  // the sonar ping, every other bar
  if (bar % 2 === 0) ev.push({ s: 0, i: 'chime', n: note(sc, ch.t[2] + 14), d: 8, v: 0.35 });
  return ev;
}

// ---- champion (E phrygian): the boss music, bigger. The crowd chants, a choir and brass on every bar, a crash
// on every bar, and a second big drum
function championBar(bar: number): Ev[] {
  const sc = E_PHRYGIAN;
  const ch = BOSS_CH[BOSS_CHORDS[bar]];
  const ev = bossBar(bar).filter((e) => !(e.i === 'choir' || (e.i === 'crash' && e.s === 0)));
  ev.push(...chordEv(sc, 'choir', ch, 0, 16, 0.85));
  ev.push({ s: 0, i: 'crash', v: 0.75 }, { s: 12, i: 'don', v: 0.75 });
  if (bar % 4 < 2) ev.push(...mel(sc, 'chant', CHANT[bar % 2], 0.95));
  if (bar === 0) ev.push({ s: 0, i: 'shimmer', v: 0.6 });
  return ev;
}

const bars = (n: number, f: (b: number) => Ev[]) => Array.from({ length: n }, (_, b) => f(b));

type Playable = Exclude<MusicState, 'off' | LegacyMusicState>;

/** The songs, in the order their instruments are rendered (the lobby first). */
const SONGS: Record<Playable, Song> = {
  lobby: { bpm: 90, bars: bars(16, prepBar), sc: G_MAJOR, swing: 0.12 },
  search: { bpm: 112, bars: bars(4, searchBar), sc: E_MINOR },
  fight: { bpm: 124, bars: bars(8, waveBar), sc: E_MINOR },
  champion: { bpm: 132, bars: bars(8, championBar), sc: E_PHRYGIAN, floor: 0.6 },
  victory: { bpm: 128, bars: bars(8, clearBar), sc: G_MAJOR },
  defeat: { bpm: 70, bars: bars(4, defeatBar), sc: G_MAJOR },
};

/** Seconds before each state's song starts, and how fast the one before it fades. */
const ENTRY: Record<Playable, [number, number]> = {
  lobby: [1.2, 0.8],
  search: [0.15, 0.4],
  fight: [0.35, 0.2],
  champion: [0.6, 0.3],
  victory: [2.4, 0.5],
  defeat: [1.4, 0.6],
};

/** The instruments a song uses. */
const instsOf = (song: Song) => new Set(song.bars.flatMap((b) => b.map((e) => e.i)));
const SONG_INSTS = Object.fromEntries(Object.entries(SONGS).map(([k, song]) => [k, [...instsOf(song)]])) as Record<Playable, Inst[]>;
/** Every instrument, the lobby's first, then the order the songs are listed in. */
const RENDER_ORDER: Inst[] = [...new Set([...Object.values(SONG_INSTS).flat(), ...(Object.keys(INSTRUMENTS) as Inst[])])];

const MELODIC: Inst[] = ['keys', 'mallet', 'flute', 'chime', 'pad', 'bass', 'stab', 'horn', 'chant', 'choir'];

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
        if (!song.sc.base.some((x) => x % 12 === pc)) bad++;
      }
    }
    return { state, notes, bad };
  });
}

// ------------------------------------------------------------------ the player

type Samples = Map<Inst, { base: number; buf: AudioBuffer }[]>;

/** Plays one event of a song at time t: the nearest rendered sample, pitched, cut at its length, panned, into the mix. */
function playNote(ac: BaseAudioContext, samples: Samples, e: Ev, t: number, stepLen: number, dest: AudioNode, verb: AudioNode | null): Voice | null {
  const def = INSTRUMENTS[e.i];
  const list = samples.get(e.i);
  if (!list) return null;
  let smp = list[0];
  if (e.n !== undefined) for (const x of list) if (Math.abs(x.base - e.n) < Math.abs(smp.base - e.n)) smp = x;
  const rate = e.n !== undefined && smp.base ? 2 ** ((e.n - smp.base) / 12) : 1;
  const src = ac.createBufferSource();
  src.buffer = smp.buf;
  src.playbackRate.value = rate;
  const g = ac.createGain();
  const vol = def.vol * (e.v ?? 1) * frand(0.93, 1.03);
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
  node.connect(dest);
  if (def.verb && verb) {
    const send = ac.createGain();
    send.gain.value = def.verb * LEVEL;
    node.connect(send);
    send.connect(verb);
  }
  src.start(t);
  src.stop(end + 0.05);
  return { g, src, end };
}

/** For checking (tools): renders the first `seconds` of a state's song offline, at an energy, dry, at its game level. */
export async function renderSong(state: MusicState, seconds: number, energy = 0.5): Promise<AudioBuffer> {
  const st = resolve(state);
  if (st === 'off') throw new Error('off has no song');
  const song = SONGS[st];
  const samples: Samples = new Map();
  for (const [name, def] of Object.entries(INSTRUMENTS) as [Inst, InstDef][]) {
    samples.set(name, await Promise.all(def.bases.map(async (base) => ({ base, buf: await renderRecipe(`music:${name}:${base}`, def.dur, (s) => def.make(s, base)) }))));
  }
  const ac = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
  const level = ac.createGain();
  level.gain.value = LEVEL;
  level.connect(ac.destination);
  const stepLen = 60 / song.bpm / 4;
  const heat = Math.max(energy, song.floor ?? 0);
  for (let k = 0, t = 0.02; t < seconds; k++, t += stepLen) {
    const step = k % 16;
    const swing = song.swing && step % 2 ? song.swing * stepLen : 0;
    for (const e of song.bars[Math.floor(k / 16) % song.bars.length]) if (e.s === step && (e.e ?? 0) <= heat) playNote(ac, samples, e, t + swing, stepLen, level, null);
  }
  return ac.startRendering();
}


interface Voice {
  g: GainNode;
  src: AudioBufferSourceNode;
  end: number;
}
/** An older state name becomes the v5 state it plays. */
const resolve = (st: MusicState): Exclude<MusicState, LegacyMusicState> => (st in MUSIC_ALIAS ? MUSIC_ALIAS[st as LegacyMusicState] : (st as Exclude<MusicState, LegacyMusicState>));

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
  private tried = new Set<Inst>(); // instruments rendered so far (or failed)

  constructor() {
    if (typeof OfflineAudioContext !== 'undefined') setTimeout(() => void this.renderAll(), 60);
  }

  private async renderAll() {
    for (const name of RENDER_ORDER) {
      const def = INSTRUMENTS[name];
      const list: { base: number; buf: AudioBuffer }[] = [];
      for (const base of def.bases) {
        try {
          list.push({ base, buf: await renderRecipe(`music:${name}:${base}`, def.dur, (s) => def.make(s, base)) });
        } catch {
          /* that instrument stays silent */
        }
      }
      if (list.length) this.samples.set(name, list);
      this.tried.add(name);
    }
    this.rendered = true;
  }

  /** True once every instrument a song uses has been rendered (or has failed and stays silent). */
  private songReady(song: Playable) {
    return this.rendered || SONG_INSTS[song].every((i) => this.tried.has(i));
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
      const st = resolve(state);
      if (st === this.state) return;
      this.state = st;
      if (st === 'off') this.start(null, 0, 0.6);
      else if (this.playing === null) this.start(st, 0, 0.1); // nothing is playing: straight in
      else this.start(st, ...ENTRY[st]);
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
      const want = this.pending ?? this.playing;
      if (quiet || (want && !this.songReady(want))) {
        this.nextT = 0; // pick up again when it comes back (or when its instruments are ready)
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
    const heat = Math.max(this.heat, song.floor ?? 0);
    for (const e of song.bars[this.bar]) {
      if (e.s !== this.step || (e.e ?? 0) > heat) continue;
      this.note(e, t + swing + frand(-0.002, 0.002), stepLen);
    }
  }

  private note(e: Ev, t: number, stepLen: number) {
    const ac = this.ac!;
    const v = playNote(ac, this.samples, e, Math.max(t, ac.currentTime), stepLen, this.level!, this.verb); // the jitter never schedules a note in the past
    if (v) this.voices.push(v);
  }
}

export const music: MusicApi = new Music();
