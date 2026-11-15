import { SAMPLE_RATE, YO_SCALE, crash, drum, m, pad, sparkle, type Synth } from './synth';

/*
 * The building blocks the sound effects are made of: hit layers, hand-wired voices, the toy-box instruments
 * (koto, shamisen, taiko, gong, wind bells, a marimba, a referee's whistle), and a little formant voice that
 * gives the twelve characters their chirps and grunts. Shared by sounds.ts, cast.ts and flow.ts.
 *
 * Tuning: tunes use the yo scale on D (D E G A B, which is also G major pentatonic), and the big chords sit
 * on G, so any two sounds that ring together agree (and agree with the music, which is in G major / E minor).
 */

/** D4: the note the yo scale starts from. */
export const ROOT = 62;
/** G3: the home chord of the fanfares. */
export const HOME = 55;
/** A major chord spread wide, from its root. */
export const WIDE = [0, 7, 12, 16, 19];

/** Step i of the yo scale as a MIDI note (5 steps to the octave; step 0 is D4). */
export const yo = (i: number) => ROOT + 12 * Math.floor(i / 5) + YO_SCALE[((i % 5) + 5) % 5];
export const chord = (root: number) => WIDE.map((x) => root + x);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------ hit building blocks
/** The crisp transient: a few milliseconds of bright noise. */
export function click(s: Synth, t: number, f: number, v: number) {
  s.noise({ t, filter: 'highpass', f, a: 0.0002, d: 0.007, v: v * 0.8 });
  s.noise({ t, filter: 'bandpass', f: f * 0.55, q: 1.2, a: 0.0002, d: 0.012, v });
}
/** The body: a sine that drops fast, driven, felt more than heard. */
export function thump(s: Synth, t: number, f: number, d: number, v: number) {
  s.tone({ t, f: [[0, f * 2.2], [0.03, f], [d, f * 0.45]], a: 0.0006, d, v, to: s.drive(2.2) });
}

/** A value, or [time, value] points joined by exponential ramps (as in the synth). */
export type Pts = number | [number, number][];

// ------------------------------------------------------------------ wiring by hand
// A few sounds (the spinning top, the raspberry) need one thing to bend another, which the synth's ready-made
// voices cannot do. These helpers build such voices straight from Web Audio nodes.

export function along(p: AudioParam, t: number, v: Pts) {
  if (typeof v === 'number') {
    p.setValueAtTime(v, t);
    return;
  }
  p.setValueAtTime(v[0][1], t + v[0][0]);
  for (let i = 1; i < v.length; i++) p.exponentialRampToValueAtTime(Math.max(1e-4, v[i][1]), t + v[i][0]);
}

/** A running oscillator whose pitch travels along points. */
export function osc(s: Synth, type: OscillatorType, f: Pts, t: number, stop: number) {
  const o = s.ac.createOscillator();
  o.type = type;
  along(o.frequency, t, f);
  o.start(t);
  o.stop(stop);
  return o;
}

/** A gain that swells, holds and dies like the synth's own voices. */
export function shape(s: Synth, t: number, a: number, h: number, d: number, v: number, to?: AudioNode) {
  const g = s.ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.setValueAtTime(v, t + a + h);
  g.gain.exponentialRampToValueAtTime(1e-4, t + a + h + d);
  g.gain.setValueAtTime(0, t + a + h + d + 0.002);
  g.connect(to ?? s.ac.destination);
  return g;
}

/** A gate that another oscillator opens and shuts: whatever is routed into it flutters. */
export function chopper(s: Synth, by: AudioNode, to?: AudioNode) {
  const g = s.ac.createGain();
  g.gain.value = 0.5;
  const depth = s.ac.createGain();
  depth.gain.value = 0.5;
  by.connect(depth);
  depth.connect(g.gain);
  g.connect(to ?? s.ac.destination);
  return g;
}

export function band(s: Synth, f: number, q: number) {
  const b = s.ac.createBiquadFilter();
  b.type = 'bandpass';
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

// ------------------------------------------------------------------ the instruments

/**
 * A plucked string (Karplus-Strong): a burst of noise going round a delay one period long, losing a little on
 * every turn, the highs fastest. So it starts bright and mellows as it rings, like a real string.
 * bright 0..1: how sharp the pluck is. pos: where along the string it is plucked (near the end = thin and nasal).
 */
export function pluck(s: Synth, o: { t?: number; f: number; d: number; v: number; bright?: number; pos?: number; to?: AudioNode }) {
  const t = o.t ?? 0;
  const bright = o.bright ?? 0.7;
  const N = Math.max(2, Math.round(SAMPLE_RATE / o.f));
  const len = Math.max(N + 2, Math.ceil(o.d * SAMPLE_RATE));
  const buf = s.ac.createBuffer(1, len, SAMPLE_RATE);
  const y = buf.getChannelData(0);
  // the pluck itself: one turn of noise, softened for a duller string, hollowed by the plucking point
  const hit = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += (0.3 + 0.7 * bright) * (s.rnd() * 2 - 1 - lp);
    hit[i] = lp;
  }
  const gap = Math.max(1, Math.round(N * (o.pos ?? 0.15)));
  let peak = 1e-6;
  for (let i = 0; i < N; i++) {
    y[i] = hit[i] - hit[(i + N - gap) % N];
    peak = Math.max(peak, Math.abs(y[i]));
  }
  for (let i = 0; i < N; i++) y[i] /= peak;
  // round and round the string
  const dull = 0.5 - 0.4 * bright;
  const keep = 10 ** (-3 / (o.f * o.d)); // 60 dB down after d seconds
  y[N] = keep * y[0];
  for (let i = N + 1; i < len; i++) y[i] = keep * ((1 - dull) * y[i - N] + dull * y[i - N - 1]);
  const src = s.ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (o.f * (N + dull)) / SAMPLE_RATE; // the loop is N + dull samples long: tune it exactly
  const g = s.ac.createGain();
  g.gain.value = o.v;
  src.connect(g);
  g.connect(o.to ?? s.ac.destination);
  src.start(t);
}

/** A koto note: a bright silk string, the pick's tick, and the long wooden body humming under it. */
export function koto(s: Synth, t: number, note: number, d: number, v: number, bright = 0.7) {
  const f = m(note);
  pluck(s, { t, f, d, v, bright, pos: 0.14 });
  s.tone({ t, f, a: 0.002, d: d * 0.5, v: v * 0.2 });
  s.noise({ t, filter: 'bandpass', f: Math.min(9000, f * 5), q: 1.2, a: 0.0004, d: 0.006, v: v * 0.3 });
}

/** A shamisen note: a buzzing string that dies fast, and the plectrum slapping the skin. */
export function shami(s: Synth, t: number, note: number, d: number, v: number) {
  pluck(s, { t, f: m(note), d, v: v * 0.8, bright: 0.95, pos: 0.07, to: s.drive(3) });
  s.noise({ t, filter: 'bandpass', f: 420, q: 1.5, a: 0.0005, d: 0.03, v: v * 0.6 });
  s.tone({ t, f: [[0, 230], [0.04, 140]], a: 0.0008, d: 0.05, v: v * 0.5 });
  s.noise({ t, filter: 'highpass', f: 3500, a: 0.0003, d: 0.006, v: v * 0.35 });
}

/** Koto notes running up the yo scale from step `from`, a little louder each. */
export function run(s: Synth, t: number, from: number, count: number, step: number, v: number, d = 0.4) {
  for (let i = 0; i < count; i++) koto(s, t + i * step, yo(from + i), d, v * (0.7 + (0.3 * i) / Math.max(1, count - 1)));
}

/** A wooden clack: a woodblock when high and dry, a bamboo tube when lower, longer and hollow. */
export function wood(s: Synth, t: number, f: number, v: number, d = 0.05, hollow = 0) {
  s.tone({ t, f: [[0, f * 1.06], [d, f]], a: 0.0005, d, v });
  s.tone({ t, f: f * 2.71, a: 0.0005, d: d * 0.4, v: v * 0.3 });
  s.noise({ t, filter: 'bandpass', f: f * 1.6, q: 3, a: 0.0003, d: 0.012, v: v * 0.7 });
  if (hollow) s.noise({ t, filter: 'bandpass', f: f * 0.5, q: 6, a: 0.001, d: d * 1.5, v: v * hollow });
}

/** The kabuki clappers (hyoshigi): two hard sticks, a hair apart. */
export function clack(s: Synth, t: number, v: number) {
  wood(s, t, 1480, v, 0.03);
  wood(s, t + 0.005, 2050, v * 0.7, 0.022);
}

/** A taiko: the stick slaps the skin, the barrel booms and sags. */
export function taiko(s: Synth, t: number, f: number, d: number, v: number) {
  drum(s, t, f, d, v, 2.5);
  s.noise({ t, color: 'pink', filter: 'lowpass', f: [[0, 1500], [d * 0.5, 180]], q: 0.6, a: 0.001, d: d * 0.6, v: v * 0.5 });
  s.tone({ t, f: [[0, f * 1.55], [d * 0.6, f * 1.46]], a: 0.002, d: d * 0.6, v: v * 0.22 });
}

/** The little high drum (shime-daiko): tight and dry. */
export function shime(s: Synth, t: number, v: number) {
  drum(s, t, 290, 0.07, v, 2);
  s.noise({ t, filter: 'bandpass', f: 1900, q: 1.5, a: 0.0005, d: 0.03, v: v * 0.5 });
}

/**
 * A gong: the soft mallet's thump, a cluster of partials that do not quite agree and beat against each other,
 * and the wash of highs that blooms a moment after the strike.
 */
export function gong(s: Synth, t: number, f: number, d: number, v: number) {
  s.tone({ t, f: [[0, f * 1.15], [0.25, f * 0.5]], a: 0.004, d: 0.3, v: v * 0.6 });
  for (const [r, lvl] of [
    [1, 1],
    [1.48, 0.5],
    [2.02, 0.6],
    [2.53, 0.4],
    [3.04, 0.34],
    [4.11, 0.24],
    [5.37, 0.16],
    [6.62, 0.1],
  ]) {
    const ring = d / (0.55 + r * 0.45);
    for (const side of [-1, 1]) s.tone({ t, f: f * r + side * s.rand(0.3, 1.4), a: 0.004 + r * 0.012, d: ring, v: (v * lvl) / 2 });
  }
  s.bell({ t, f: f * 2.76, ratio: 1.41, index: 3, a: 0.1, d: d * 0.6, v: v * 0.28 });
  s.bell({ t, f: f * 5.13, ratio: 1.67, index: 2.4, a: 0.18, d: d * 0.45, v: v * 0.15 });
  s.noise({ t, filter: 'bandpass', f: [[0, 2000], [0.3, 4400], [d, 2600]], q: 0.8, a: 0.25, d: d * 0.5, v: v * 0.13 });
}

/** A furin, the little glass wind bell: one clear note, glassy overtones, a slow shimmer between two close pitches. */
export function furin(s: Synth, t: number, f: number, d: number, v: number) {
  s.tone({ t, f, a: 0.001, d, v: v * 0.6 });
  s.tone({ t, f: f * 1.002 + 1.2, a: 0.001, d: d * 0.9, v: v * 0.35 });
  s.tone({ t, f: Math.min(15000, f * 2.76), a: 0.001, d: d * 0.45, v: v * 0.28 });
  s.tone({ t, f: Math.min(17000, f * 5.4), a: 0.0005, d: d * 0.2, v: v * 0.12 });
  s.noise({ t, filter: 'highpass', f: 6000, a: 0.0003, d: 0.006, v: v * 0.22 });
}

/** Wind bells falling like rain: `count` of them over `span` seconds, thick at first. */
export function shower(s: Synth, t: number, span: number, count: number, v: number) {
  for (let i = 0; i < count; i++) furin(s, t + span * s.rnd() ** 1.4, m(yo(10 + Math.floor(s.rand(0, 10)))), s.rand(0.35, 0.7), v * s.rand(0.5, 1));
}

/** A rubber toy's squeak: a reedy note that jumps up and sags, through a nasal filter. */
export function squeak(s: Synth, t: number, f: number, d: number, v: number) {
  s.tone({ t, type: 'sawtooth', f: [[0, f * 0.6], [d * 0.25, f], [d, f * 0.72]], lp: f * 3.2, q: 6, hp: f * 0.8, a: d * 0.12, d: d * 0.88, v, vib: [38, 35] });
  s.tone({ t, f: [[0, f * 1.2], [d * 0.25, f * 2], [d, f * 1.44]], a: d * 0.12, d: d * 0.7, v: v * 0.35 });
}

/** A spring's boing: a note that wobbles wide and fast as it climbs (a ruler twanged on a desk). */
export function boing(s: Synth, t: number, f: number, d: number, v: number, rate = 24, depth = 450) {
  s.tone({ t, type: 'triangle', f: [[0, f], [d, f * 1.5]], lp: f * 6, a: 0.003, d, v, vib: [rate, depth] });
}

/** Something soft landing: a dull thump with no click. */
export function thud(s: Synth, t: number, f: number, v: number) {
  s.tone({ t, f: [[0, f], [0.08, f * 0.45]], a: 0.002, d: 0.1, v });
  s.noise({ t, color: 'pink', filter: 'lowpass', f: [[0, 800], [0.07, 220]], a: 0.002, d: 0.07, v: v * 0.6 });
}

/** A water drop: a tiny note that leaps up. */
export function drip(s: Synth, t: number, f: number, v: number) {
  s.tone({ t, f: [[0, f], [0.028, f * 2.6]], a: 0.002, d: 0.035, v });
}

/** A metal cup clinking (trophies): a hard bright bell on a yo note. */
export function clink(s: Synth, t: number, note: number, v: number, d = 0.3) {
  const f = m(note);
  s.bell({ t, f, ratio: 2.4, index: 1.3, d, v });
  s.bell({ t, f: f * 2.01, ratio: 2, index: 0.6, d: d * 0.6, v: v * 0.35 });
  s.noise({ t, filter: 'highpass', f: 5000, a: 0.0003, d: 0.006, v: v * 0.4 });
}

/** Something hard breaking into bits: a snap, then shards ringing and skittering away. */
export function shards(s: Synth, t: number, span: number, v: number, count = 10) {
  s.noise({ t, filter: 'highpass', f: [[0, 6500], [span * 0.8, 3200]], q: 0.6, a: 0.001, d: span * 0.8, v: v * 0.7 });
  s.noise({ t, filter: 'bandpass', f: [[0, 2600], [0.25, 1100]], q: 1, a: 0.0005, d: 0.22, v: v * 0.5 });
  for (let i = 0; i < count; i++) s.bell({ t: t + s.rand(0, span * 0.8), f: s.rand(2500, 7000), ratio: s.rand(1.3, 2.9), index: 1, d: s.rand(0.07, 0.28), v: v * s.rand(0.06, 0.16) });
  s.crackle({ t: t + 0.02, density: 170, filter: 'highpass', f: 3500, a: 0.004, d: span, v: v * 0.45 });
}

/** One chord of a fanfare: a drum, brass opening up, a cymbal. */
export function stab(s: Synth, t: number, root: number, hold: number, v: number) {
  taiko(s, t, 58, 0.5, v);
  s.brass({ t, notes: chord(root), cut: [[0, 450], [0.08, 2800], [hold + 0.35, 700]], a: 0.022, h: hold, d: 0.3, v: v * 0.45 });
  crash(s, t, 0.6, v * 0.2);
}

/**
 * The big finish that rare things share, on the home chord. rank 0 (A class): brass, a deep drum, a cymbal, a
 * run up the koto. rank 1 (S): a choir joins. rank 2 (SSS): a gong, high voices and a long rain of glass bells.
 */
export function glory(s: Synth, t: number, rank: number, hold: number) {
  taiko(s, t, 46, 0.9 + rank * 0.2, 1);
  s.tone({ t, f: [[0, 72], [1.2, 30]], a: 0.004, d: 0.9 + rank * 0.4, v: 0.55 });
  s.brass({ t, notes: chord(HOME - 12), cut: [[0, 450], [0.1, 3200 + rank * 300], [hold + 1, 850]], a: 0.03, h: hold, d: 1.2, v: 0.45 });
  crash(s, t, 1.4 + rank * 0.3, 0.42);
  run(s, t + 0.05, 2, 8 + rank * 2, 0.048, 0.32);
  sparkle(s, t + 0.25, 1.2 + rank * 0.4, 0.5, 10 + rank * 3);
  if (rank >= 1) s.choir({ t: t + 0.03, notes: [HOME, HOME + 4, HOME + 7, HOME + 12], a: 0.22, h: hold + 0.3, d: 1.3, v: 0.34 });
  if (rank >= 2) {
    gong(s, t, m(HOME - 12), 3.2, 0.7);
    s.choir({ t: t + 0.35, notes: [HOME + 16, HOME + 19, HOME + 24], a: 0.4, h: hold, d: 1.4, v: 0.16 });
    shower(s, t + 0.4, 2.2, 26, 0.17);
    furin(s, t + hold + 1.1, m(yo(15)), 1.2, 0.3);
  } else shower(s, t + 0.3, 1 + rank * 0.5, 7 + rank * 5, 0.15);
}

// ------------------------------------------------------------------ v4: the cast's voices and the arena's toys

/** Vowel formants F1, F2, F3 (Hz) of a grown-up voice. 'm' is a closed-mouth hum (hm, hngh, mmph). */
export const VOWELS = {
  a: [780, 1180, 2700],
  ae: [680, 1700, 2550],
  e: [500, 1850, 2550],
  i: [300, 2280, 3000],
  o: [520, 880, 2450],
  u: [330, 820, 2300],
  uh: [620, 1180, 2450],
  m: [260, 1050, 2300],
} as const;
export type Vowel = keyof typeof VOWELS;

/**
 * A little voice: a buzzing source (the vocal folds) with a pitch path, through three formant filters that glide
 * from vowel to vowel, so it says "hup", "eep", "hyah" or "hngh" without any words.
 * size scales the formants: above 1 is small and cute (a seedling, a bee), below 1 is big (a sumo, a rock).
 * h0: seconds of breath alone before the vowel (an "h"). rough 0..1: a growl (the voice flutters ~40 times a
 * second). breath: air riding along with the voice. Times in f and vow start where the vowel starts.
 */
export function voice(
  s: Synth,
  o: {
    t?: number;
    f: Pts;
    vow: Vowel | [number, Vowel][];
    a?: number;
    h?: number;
    d: number;
    v: number;
    size?: number;
    src?: OscillatorType;
    vib?: [number, number];
    h0?: number;
    breath?: number;
    rough?: number;
    to?: AudioNode;
  },
) {
  const t0 = o.t ?? 0;
  const h0 = o.h0 ?? 0;
  const t = t0 + h0;
  const a = o.a ?? 0.01;
  const h = o.h ?? 0;
  const stop = t + a + h + o.d + 0.05;
  const size = o.size ?? 1;
  const path: [number, Vowel][] = typeof o.vow === 'string' ? [[0, o.vow]] : o.vow;
  const out = s.ac.createGain();
  out.gain.value = o.v;
  out.connect(o.to ?? s.ac.destination);
  // the mouth: three formants, plus a little of the plain buzz for body
  const mouth = s.ac.createGain();
  const LV = [1, 0.6, 0.24];
  const Q = [5, 8, 10];
  for (let k = 0; k < 3; k++) {
    const bp = s.ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = Q[k];
    path.forEach(([pt, vw], i) => {
      const f = Math.min(10000, VOWELS[vw][k] * size);
      if (i === 0) bp.frequency.setValueAtTime(f, t + pt);
      else bp.frequency.linearRampToValueAtTime(f, t + pt);
    });
    const g = s.ac.createGain();
    g.gain.value = LV[k] * 1.6;
    mouth.connect(bp);
    bp.connect(g);
    g.connect(out);
  }
  const body = s.ac.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 600 * size;
  const bodyLvl = s.ac.createGain();
  bodyLvl.gain.value = 0.28;
  mouth.connect(body);
  body.connect(bodyLvl);
  bodyLvl.connect(out);
  // a growl: the voice's level flutters
  let into: AudioNode = mouth;
  if (o.rough) {
    const r = s.ac.createGain();
    r.gain.value = 1 - o.rough * 0.5;
    const lfo = s.ac.createOscillator();
    lfo.frequency.value = s.rand(34, 48);
    const depth = s.ac.createGain();
    depth.gain.value = o.rough * 0.5;
    lfo.connect(depth);
    depth.connect(r.gain);
    lfo.start(t0);
    lfo.stop(stop);
    r.connect(mouth);
    into = r;
  }
  s.tone({ t, type: o.src ?? 'sawtooth', f: o.f, a, h, d: o.d, v: 1, vib: o.vib, to: into });
  if (h0 > 0) s.noise({ t: t0, a: h0 * 0.4, h: h0 * 0.4, d: h0 * 0.5 + a, v: 0.55, to: mouth });
  if (o.breath) s.noise({ t, a, h, d: o.d, v: o.breath, to: mouth });
}

/** A leafy rustle: twigs and leaves brushing (lower f = thicker leaves). */
export function rustle(s: Synth, t: number, d: number, v: number, f = 3600) {
  s.crackle({ t, density: 520, filter: 'bandpass', f, q: 0.9, a: d * 0.2, d: d * 0.8, v });
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, f * 0.6], [d, f * 1.1]], q: 1.2, a: d * 0.25, d: d * 0.75, v: v * 0.35 });
}

/**
 * A boxing glove landing, meaty: the leather's hard thwack, the padded smack, the body of the blow (a driven drop
 * that rings in the low mids, where a phone speaker still hears it) and a low thump under it you feel on headphones.
 * f: the glove's size (lower = a bigger glove).
 */
export function glove(s: Synth, t: number, v: number, f = 120) {
  // the leather: a hard, short thwack
  s.noise({ t, filter: 'bandpass', f: 2200, q: 0.8, a: 0.0003, d: 0.02, v: v * 1.1 });
  s.noise({ t, filter: 'highpass', f: 4500, a: 0.0002, d: 0.008, v: v * 0.45 });
  // the padded smack
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 1600], [0.06, 500]], q: 0.9, a: 0.0008, d: 0.08, v: v * 2.2 });
  s.noise({ t, filter: 'bandpass', f: 900, q: 1.2, a: 0.0006, d: 0.035, v: v * 0.9 });
  // the body of the blow, and the low thump
  s.tone({ t, f: [[0, f * 3], [0.02, f * 1.6], [0.12, f * 0.7]], a: 0.0008, d: 0.12, v: v * 0.55, to: s.drive(3.5) });
  s.tone({ t, f: [[0, f * 6], [0.04, f * 3.6]], a: 0.0008, d: 0.05, v: v * 0.35 });
  s.tone({ t, f: [[0, 95], [0.04, 62], [0.16, 42]], a: 0.0015, d: 0.16, v: v * 0.3 });
}

/** The heavy body of a big blow, pitched where phones hear it: a driven drop from the low mids. */
export function body(s: Synth, t: number, f: number, d: number, v: number) {
  s.tone({ t, f: [[0, f * 2.4], [0.025, f], [d, f * 0.5]], a: 0.0008, d, v, to: s.drive(3) });
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, f * 6], [d * 0.6, f * 2]], q: 1, a: 0.0008, d: d * 0.7, v: v * 0.9 });
}

/** A fleshy slap (a belly, a cheek): a bright smack and a wobble under it. */
export function slap(s: Synth, t: number, v: number, f = 1500) {
  s.noise({ t, filter: 'bandpass', f, q: 1.1, a: 0.0004, d: 0.03, v });
  s.noise({ t, filter: 'highpass', f: 3500, a: 0.0003, d: 0.008, v: v * 0.5 });
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 900], [0.06, 400]], q: 1, a: 0.0006, d: 0.07, v: v * 0.7 });
  s.tone({ t, f: [[0, 220], [0.08, 90]], a: 0.001, d: 0.1, v: v * 0.4, vib: [16, 120] });
}

/** Plate armour knocking: a dull metal clank, a short inharmonic ring. */
export function clank(s: Synth, t: number, v: number, f = 420) {
  click(s, t, 4200, v * 0.7);
  s.bell({ t, f, ratio: 2.76, index: 1.6, d: 0.16, v: v * 0.45 });
  s.bell({ t, f: f * 2.37, ratio: 1.41, index: 1.1, d: 0.09, v: v * 0.25 });
  s.tone({ t, f: [[0, 260], [0.05, 140]], a: 0.0006, d: 0.06, v: v * 0.5 });
}

/** Something wet: a squelch with a gurgle in it. */
export function squelch(s: Synth, t: number, d: number, v: number) {
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 700], [d * 0.3, 1900], [d * 0.6, 600], [d, 1300]], q: 5, a: 0.004, d, v });
  s.tone({ t, f: [[0, 180], [d * 0.5, 320], [d, 140]], lp: 900, a: 0.004, d, v: v * 0.4, vib: [24, 200] });
  drip(s, t + d * 0.7, s.rand(500, 800), v * 0.3);
}

/** A fishing reel paying out or winding in: a ratchet that speeds up. */
export function whirr(s: Synth, t: number, d: number, v: number, r0 = 30, r1 = 60) {
  const stop = t + d + 0.05;
  const rate = osc(s, 'square', [[0, r0], [d, r1]], t, stop);
  s.noise({ t, filter: 'bandpass', f: [[0, 2600], [d, 3600]], q: 2.5, a: 0.01, h: d * 0.6, d: d * 0.4, v, to: chopper(s, rate) });
  s.tone({ t, type: 'triangle', f: [[0, 700], [d, 1300]], a: 0.01, h: d * 0.5, d: d * 0.5, v: v * 0.12 });
}

/** Rock grinding and breaking: a quick run of gritty noise bursts, crackle and grit (mid-heavy, so a phone hears it). */
export function crunch(s: Synth, t: number, d: number, v: number) {
  const n = Math.max(3, Math.round(d * 45));
  for (let i = 0; i < n; i++) {
    const at = t + d * 0.8 * (i / n) ** 1.3 + s.rand(0, 0.006);
    s.noise({ t: at, filter: 'bandpass', f: s.rand(450, 2600), q: s.rand(0.8, 2), a: 0.0005, d: s.rand(0.01, 0.03), v: v * s.rand(0.45, 1) * (1 - (0.5 * i) / n) });
  }
  s.crackle({ t, density: 1400, filter: 'bandpass', f: 1300, q: 0.5, a: 0.002, d, v: v * 1.4 });
  s.noise({ t, color: 'brown', filter: 'lowpass', f: [[0, 1400], [d, 350]], a: 0.002, d, v: v * 0.5 });
}

/** A deep rumble from the ground, with a growl in the low mids so small speakers still feel it. */
export function rumble(s: Synth, t: number, d: number, v: number, f = 55) {
  s.tone({ t, f: [[0, f * 1.6], [0.06, f], [d, f * 0.7]], a: 0.004, d, v: v * 0.4, to: s.drive(1.6) });
  s.noise({ t, color: 'brown', filter: 'lowpass', f: 260, a: 0.02, d, v: v * 0.35 });
  s.noise({ t, color: 'brown', filter: 'bandpass', f: [[0, 480], [d, 240]], q: 1.2, a: 0.01, d: d * 0.8, v: v * 0.9 });
}

/** A bee's buzz: a reedy hum with a wing-beat flutter. */
export function buzz(s: Synth, t: number, f: Pts, d: number, v: number, vib: [number, number] = [11, 40]) {
  const stop = t + d + 0.05;
  const wings = osc(s, 'sine', s.rand(26, 34), t, stop);
  const g = chopper(s, wings);
  s.tone({ t, type: 'sawtooth', f, lp: 2600, q: 2, a: 0.012, h: d * 0.5, d: d * 0.5, v, vib, to: g });
  s.noise({ t, filter: 'bandpass', f: 3200, q: 1.5, a: 0.012, h: d * 0.5, d: d * 0.5, v: v * 0.12, to: g });
}

/** A spring sproing: a twang whose wobble dies away (boing-g-g). up: how far the pitch climbs. */
export function sproing(s: Synth, t: number, f: number, d: number, v: number, up = 1.6, rate = 22) {
  const stop = t + d + 0.05;
  const o = osc(s, 'triangle', [[0, f], [d * 0.3, f * up], [d, f * up * 0.9]], t, stop);
  const lfo = osc(s, 'sine', rate, t, stop);
  const depth = s.ac.createGain();
  along(depth.gain, t, [[0, 700], [d, 30]]);
  lfo.connect(depth);
  depth.connect(o.detune);
  const lp = s.ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = f * 6;
  o.connect(lp);
  lp.connect(shape(s, t, 0.003, d * 0.15, d * 0.85, v));
}

/** A splash into water. */
export function splash(s: Synth, t: number, v: number) {
  s.noise({ t, filter: 'bandpass', f: [[0, 3800], [0.25, 900]], q: 0.8, a: 0.004, d: 0.3, v });
  s.noise({ t, color: 'pink', filter: 'lowpass', f: [[0, 1800], [0.2, 300]], a: 0.002, d: 0.18, v: v * 0.6 });
  for (let i = 0; i < 4; i++) drip(s, t + 0.06 + s.rand(0, 0.25), s.rand(450, 1100), v * 0.25);
}

/** A puff of smoke. */
export function poof(s: Synth, t: number, d: number, v: number) {
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 500], [d * 0.3, 2200], [d, 1200]], q: 0.9, a: d * 0.15, d: d * 0.85, v });
  s.tone({ t, f: [[0, 160], [0.06, 80]], a: 0.003, d: 0.08, v: v * 0.4 });
}

/** A marimba note: a round wooden bar, its bright fourth overtone dying first, and the mallet's tap. */
export function mallet(s: Synth, t: number, note: number, d: number, v: number) {
  const f = m(note);
  s.tone({ t, f, a: 0.001, d, v });
  s.tone({ t, f: Math.min(14000, f * 3.99), a: 0.0008, d: d * 0.16, v: v * 0.22 });
  s.tone({ t, f: Math.min(16000, f * 9.8), a: 0.0005, d: d * 0.05, v: v * 0.07 });
  s.noise({ t, filter: 'bandpass', f: Math.min(8000, f * 2.5), q: 1.5, a: 0.0003, d: 0.008, v: v * 0.16 });
}

/** A coin: a bright metal ring with a little shimmer between two close pitches. */
export function coin(s: Synth, t: number, f: number, v: number, d = 0.22) {
  s.bell({ t, f, ratio: 2.41, index: 0.9, d, v });
  s.tone({ t, f: f * 1.5, a: 0.0006, d: d * 0.8, v: v * 0.35 });
  s.tone({ t, f: f * 1.507 + 3, a: 0.0006, d: d * 0.7, v: v * 0.25 });
  s.noise({ t, filter: 'highpass', f: 7000, a: 0.0003, d: 0.005, v: v * 0.5 });
}

/** A referee's whistle: the pea rattling inside makes it trill. */
export function whistle(s: Synth, t: number, d: number, v: number, f = 2900) {
  const stop = t + d + 0.08;
  const pea = osc(s, 'sine', s.rand(26, 32), t, stop);
  const g = chopper(s, pea);
  s.tone({ t, f: [[0, f * 0.93], [0.03, f], [d, f * 0.99]], a: 0.012, h: d * 0.75, d: d * 0.25, v, vib: [30, 60], to: g });
  s.noise({ t, filter: 'bandpass', f: f * 1.02, q: 4, a: 0.012, h: d * 0.75, d: d * 0.25, v: v * 0.35, to: g });
  s.noise({ t, filter: 'highpass', f: 5000, a: 0.008, h: d * 0.5, d: d * 0.5, v: v * 0.08 });
}

/**
 * The crowd around the pitch: a wash of voices, and single voices on top. mood 'cheer' climbs and claps,
 * 'aww' sags gently, 'ooh' rises and falls (an "ooooh" of anticipation).
 */
export function crowd(s: Synth, t: number, d: number, v: number, mood: 'cheer' | 'aww' | 'ooh', count = 12) {
  const wash: Pts = mood === 'aww' ? [[0, 1100], [d, 600]] : mood === 'ooh' ? [[0, 600], [d * 0.5, 900], [d, 700]] : [[0, 800], [d * 0.3, 1400], [d, 1000]];
  s.noise({ t, color: 'pink', filter: 'bandpass', f: wash, q: 1, a: d * 0.18, h: d * 0.3, d: d * 0.52, v: v * 0.45 });
  for (let i = 0; i < count; i++) {
    const st = t + s.rand(0, d * 0.25);
    const len = d * s.rand(0.55, 0.85);
    const p = s.rand(170, 420);
    if (mood === 'aww') voice(s, { t: st, f: [[0, p * 1.12], [len * 0.3, p * 1.18], [len, p * 0.78]], vow: [[0, 'a'], [len * 0.6, 'u']], size: s.rand(0.95, 1.25), a: len * 0.2, h: len * 0.3, d: len * 0.5, v: v * s.rand(0.12, 0.22), vib: [s.rand(4.5, 6), 25], breath: 0.15 });
    else if (mood === 'ooh') voice(s, { t: st, f: [[0, p], [len * 0.5, p * 1.25], [len, p * 1.05]], vow: [[0, 'u'], [len * 0.4, 'o']], size: s.rand(0.95, 1.25), a: len * 0.3, h: len * 0.3, d: len * 0.4, v: v * s.rand(0.12, 0.2), vib: [s.rand(4.5, 6), 25], breath: 0.15 });
    else voice(s, { t: st, f: [[0, p * 1.1], [len * 0.25, p * 1.5], [len, p * 1.2]], vow: [[0, 'e'], [len * 0.2, 'a'], [len * 0.8, 'ae']], size: s.rand(0.95, 1.3), a: 0.03, h: len * 0.35, d: len * 0.6, v: v * s.rand(0.1, 0.2), vib: [s.rand(5, 8), 40], breath: 0.15 });
  }
  if (mood === 'cheer') s.crackle({ t: t + 0.05, density: 60, filter: 'bandpass', f: 2200, q: 0.9, a: d * 0.15, h: d * 0.35, d: d * 0.5, v: v * 0.6 });
}

/** A short air-horn blast, the stadium kind (a friendly major chord, punchy). */
export function horn(s: Synth, t: number, notes: number[], hold: number, v: number) {
  s.brass({ t, notes, cut: [[0, 700], [0.03, 3600], [hold + 0.1, 1500]], q: 1.6, a: 0.008, h: hold, d: 0.12, v, to: s.drive(1.8) });
  s.tone({ t, type: 'square', f: [[0, m(notes[0]) * 0.94], [0.04, m(notes[0])]], lp: 2400, a: 0.008, h: hold, d: 0.1, v: v * 0.18 });
}

/** A short drum roll on a snare: hits getting faster and louder (for fanfares). */
export function roll(s: Synth, t: number, len: number, v: number) {
  for (let x = 0, gap = 0.07; x < len; x += gap, gap = Math.max(0.03, gap * 0.9)) snare(s, t + x, v * (0.35 + (0.65 * x) / len));
}

/** A snare hit: the skin, and the wires buzzing under it. */
export function snare(s: Synth, t: number, v: number) {
  s.tone({ t, f: [[0, 330], [0.03, 190]], a: 0.0006, d: 0.06, v: v * 0.6 });
  s.noise({ t, filter: 'bandpass', f: 3800, q: 0.7, a: 0.0006, d: 0.11, v });
  s.noise({ t, filter: 'highpass', f: 6500, a: 0.0004, d: 0.05, v: v * 0.4 });
}

// ------------------------------------------------------------------ v5: the weird cast's props and the boxing night

/** A chick's peep: a tiny whistle that leaps up and falls. fierce 0..1 adds a tiny scratchy shout under it. */
export function peep(s: Synth, t: number, f: number, d: number, v: number, fierce = 0) {
  s.tone({ t, f: [[0, f * 0.78], [d * 0.25, f * 1.15], [d, f * 0.8]], a: 0.002, h: d * 0.25, d: d * 0.75, v });
  s.tone({ t, f: [[0, f * 1.56], [d * 0.25, f * 2.3], [d, f * 1.6]], a: 0.002, d: d * 0.6, v: v * 0.1 });
  if (fierce > 0) voice(s, { t, f: [[0, f * 0.3], [d * 0.25, f * 0.42], [d, f * 0.3]], vow: [[0, 'i'], [d * 0.5, 'e']], size: 1.9, a: 0.003, h: d * 0.2, d: d * 0.7, v: v * fierce * 0.9, rough: 0.6 });
}

/** An eggshell cracking: dry little snaps and brittle crumbs. */
export function eggshell(s: Synth, t: number, d: number, v: number) {
  s.crackle({ t, density: 900, filter: 'bandpass', f: 3600, q: 0.8, a: 0.001, d, v });
  for (let i = 0; i < 3; i++) {
    const at = t + s.rand(0, d * 0.6);
    s.noise({ t: at, filter: 'bandpass', f: s.rand(2200, 4800), q: 2.5, a: 0.0003, d: s.rand(0.006, 0.014), v: v * s.rand(0.7, 1.2) });
    s.tone({ t: at, f: s.rand(3500, 6000), a: 0.0003, d: 0.012, v: v * 0.12 });
  }
}

/** Breath through a gas mask: a hollow, rubbery hiss with the valve fluttering. inhale rises, an exhale falls. */
export function wheeze(s: Synth, t: number, d: number, v: number, inhale = true) {
  const valve = osc(s, 'sine', s.rand(20, 28), t, t + d + 0.05);
  s.noise({ t, color: 'pink', filter: 'bandpass', f: inhale ? [[0, 650], [d, 1250]] : [[0, 1200], [d, 560]], q: 4, a: d * 0.35, h: d * 0.25, d: d * 0.4, v, to: chopper(s, valve) });
  s.noise({ t, filter: 'bandpass', f: inhale ? [[0, 2300], [d, 3200]] : [[0, 3000], [d, 2100]], q: 6, a: d * 0.35, h: d * 0.25, d: d * 0.4, v: v * 0.3 });
  s.noise({ t, color: 'pink', filter: 'bandpass', f: 420, q: 5, a: d * 0.3, h: d * 0.3, d: d * 0.4, v: v * 0.45 });
}

/** Liquid glugging out of a bottle: a few hollow, rising gulps. */
export function glug(s: Synth, t: number, n: number, v: number, f = 260) {
  let at = t;
  for (let i = 0; i < n; i++) {
    const p = f * s.rand(0.9, 1.12) * (1 + i * 0.07);
    s.tone({ t: at, f: [[0, p], [0.05, p * 2.1]], lp: 1600, a: 0.004, d: 0.06, v: v * (1 - i * 0.12) });
    s.noise({ t: at, filter: 'bandpass', f: p * 2.4, q: 6, a: 0.003, d: 0.04, v: v * 0.35 });
    at += s.rand(0.07, 0.09);
  }
}

/** Little bubbles rising in water. */
export function bubbles(s: Synth, t: number, d: number, n: number, v: number, lo = 700, hi = 1600) {
  for (let i = 0; i < n; i++) drip(s, t + s.rand(0, d), s.rand(lo, hi), v * s.rand(0.5, 1));
}

/** Water sloshing in a bowl: a wash that swings back and forth. */
export function slosh(s: Synth, t: number, d: number, v: number) {
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 450], [d * 0.3, 1300], [d * 0.6, 520], [d, 900]], q: 2.2, a: d * 0.15, d: d * 0.85, v });
  s.noise({ t, filter: 'bandpass', f: [[0, 1800], [d * 0.35, 3400], [d, 1500]], q: 1.5, a: d * 0.2, d: d * 0.7, v: v * 0.25 });
  s.tone({ t, f: [[0, 160], [d * 0.4, 260], [d, 140]], lp: 700, a: d * 0.2, d: d * 0.8, v: v * 0.3, vib: [9, 160] });
}

/** Squeaky little wheels going round: a rusty "eek" every turn. */
export function wheels(s: Synth, t: number, n: number, gap: number, v: number, f = 2600) {
  for (let i = 0; i < n; i++) {
    const at = Math.max(0, t + i * gap + s.rand(-0.004, 0.004));
    const p = f * s.rand(0.94, 1.06);
    s.tone({ t: at, type: 'sawtooth', f: [[0, p * 0.85], [0.02, p], [0.05, p * 0.9]], lp: p * 2.2, q: 4, hp: p * 0.6, a: 0.006, d: 0.045, v: v * s.rand(0.7, 1), vib: [60, 40] });
  }
}

/** A puffy seed-head popping open like a parachute: a soft "fwoomp" of air, and fluff drifting. */
export function fwoomp(s: Synth, t: number, v: number) {
  s.noise({ t, color: 'pink', filter: 'lowpass', f: [[0, 300], [0.06, 1600], [0.3, 400]], q: 1.5, a: 0.02, d: 0.3, v });
  s.tone({ t, f: [[0, 90], [0.05, 160], [0.25, 80]], a: 0.015, d: 0.25, v: v * 0.6 });
  s.noise({ t: t + 0.04, filter: 'highpass', f: 5000, a: 0.08, d: 0.35, v: v * 0.12 });
  for (let i = 0; i < 4; i++) furin(s, t + 0.08 + i * 0.07, s.rand(3000, 4600), 0.25, v * 0.08);
}

/** A jelly wobble: a round, rubbery note that shivers and settles (blbl-bl), with a squelchy skin. */
export function jelly(s: Synth, t: number, f: number, d: number, v: number, rate = 11) {
  const stop = t + d + 0.05;
  const o = osc(s, 'sine', [[0, f * 1.3], [0.04, f], [d, f * 0.92]], t, stop);
  const lfo = osc(s, 'sine', rate, t, stop);
  const depth = s.ac.createGain();
  along(depth.gain, t, [[0, 600], [d, 30]]);
  lfo.connect(depth);
  depth.connect(o.detune);
  o.connect(shape(s, t, 0.004, d * 0.1, d * 0.85, v));
  s.noise({ t, color: 'pink', filter: 'bandpass', f: f * 3, q: 5, a: 0.004, d: d * 0.6, v: v * 0.5, to: chopper(s, lfo) });
}

/** Clicky mechanical legs: quick little metal ticks, like a wind-up crab scuttling. */
export function scuttle(s: Synth, t: number, n: number, gap: number, v: number, f = 3200) {
  for (let i = 0; i < n; i++) {
    const at = t + i * gap * s.rand(0.85, 1.15);
    const p = f * s.rand(0.85, 1.15) * (i % 2 ? 0.8 : 1);
    s.noise({ t: at, filter: 'bandpass', f: p, q: 4, a: 0.0002, d: 0.006, v });
    s.tone({ t: at, f: p * 1.3, a: 0.0002, d: 0.014, v: v * 0.25 });
    s.tone({ t: at, f: p * 0.31, a: 0.0002, d: 0.01, v: v * 0.3 });
  }
}

/** A little servo motor whining as it moves. */
export function servo(s: Synth, t: number, d: number, v: number, f0 = 500, f1 = 900) {
  s.tone({ t, type: 'square', f: [[0, f0], [d * 0.7, f1], [d, f1 * 0.95]], lp: 2200, q: 2, a: 0.01, h: d * 0.6, d: d * 0.4, v, vib: [70, 25] });
  s.noise({ t, filter: 'bandpass', f: 4200, q: 3, a: 0.01, h: d * 0.6, d: d * 0.4, v: v * 0.15 });
}

/** A pencil scribbling hard: scratchy strokes back and forth. */
export function scribble(s: Synth, t: number, d: number, v: number, strokes = 3) {
  const len = d / strokes;
  for (let i = 0; i < strokes; i++) {
    const at = t + i * len;
    const f = s.rand(2600, 3800) * (i % 2 ? 1.15 : 1);
    s.noise({ t: at, filter: 'bandpass', f: [[0, f], [len, f * (i % 2 ? 0.8 : 1.25)]], q: 3, a: len * 0.2, d: len * 0.8, v });
    s.crackle({ t: at, density: 2200, filter: 'bandpass', f: f * 1.3, q: 1.2, a: len * 0.2, d: len * 0.8, v: v * 0.8 });
  }
}

/** Pencils rattling together: dry little wooden clicks. */
export function pencils(s: Synth, t: number, d: number, n: number, v: number) {
  for (let i = 0; i < n; i++) wood(s, t + s.rand(0, d), s.rand(1700, 2900), v * s.rand(0.5, 1), 0.016);
}

/** An empty tin can knocked: a thin, rattly, hollow ring. */
export function tin(s: Synth, t: number, v: number, f = 820) {
  click(s, t, 5200, v * 0.6);
  s.bell({ t, f, ratio: 1.47, index: 1.8, d: 0.12, v: v * 0.5 });
  s.bell({ t, f: f * 2.13, ratio: 1.31, index: 1.2, d: 0.07, v: v * 0.3 });
  s.noise({ t, filter: 'bandpass', f: f * 1.9, q: 7, a: 0.0005, d: 0.08, v: v * 0.6 });
  s.crackle({ t: t + 0.005, density: 600, filter: 'bandpass', f: 3000, q: 1, a: 0.001, d: 0.05, v: v * 0.4 });
}

/** Roller skates rolling: the wheels' hum and the bearings' grainy rattle. */
export function skates(s: Synth, t: number, d: number, v: number, f = 340, f1 = f * 1.3) {
  const turn = osc(s, 'sine', s.rand(28, 36), t, t + d + 0.05);
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, f * 2], [d, f1 * 2]], q: 1.4, a: d * 0.2, h: d * 0.4, d: d * 0.4, v, to: chopper(s, turn) });
  s.tone({ t, type: 'triangle', f: [[0, f], [d, f1]], lp: 1500, a: d * 0.2, h: d * 0.4, d: d * 0.4, v: v * 0.35 });
  s.crackle({ t, density: 700, filter: 'bandpass', f: 2200, q: 1, a: d * 0.2, h: d * 0.4, d: d * 0.4, v: v * 0.4 });
}

/** Jaws snapping shut: a hard, wet SNAP with a chomp under it. */
export function chomp(s: Synth, t: number, v: number, p = 1) {
  s.noise({ t, filter: 'highpass', f: 2500, a: 0.0002, d: 0.01, v });
  s.noise({ t, filter: 'bandpass', f: 1800 * p, q: 2, a: 0.0003, d: 0.025, v: v * 0.9 });
  s.tone({ t, f: [[0, 900 * p], [0.03, 220 * p]], a: 0.0005, d: 0.04, v: v * 0.6, to: s.drive(2.5) });
  s.noise({ t: t + 0.01, color: 'pink', filter: 'bandpass', f: [[0, 1200], [0.06, 400]], q: 3, a: 0.001, d: 0.07, v: v * 0.6 });
  s.tone({ t, f: [[0, 160], [0.08, 70]], a: 0.001, d: 0.09, v: v * 0.5 });
}

/** A stretchy vine: it pulls tight (straining upward), then lets go with a rubbery twang. */
export function twang(s: Synth, t: number, f: number, d: number, v: number) {
  s.tone({ t, type: 'sawtooth', f: [[0, f * 0.5], [d * 0.45, f]], lp: f * 4, q: 3, a: d * 0.4, d: d * 0.08, v: v * 0.25, vib: [30, 20] });
  sproing(s, t + d * 0.45, f, d * 0.55, v, 0.6, 26);
}

/** Knocking on a big hollow pumpkin: a soft, deep, boxy thunk. */
export function gourd(s: Synth, t: number, f: number, v: number) {
  s.tone({ t, f: [[0, f * 1.5], [0.02, f], [0.14, f * 0.85]], a: 0.0008, d: 0.14, v, to: s.drive(1.5) });
  s.noise({ t, color: 'pink', filter: 'bandpass', f: f * 2.2, q: 9, a: 0.001, d: 0.12, v: v * 1.1 });
  s.noise({ t, filter: 'bandpass', f: f * 5, q: 3, a: 0.0004, d: 0.015, v: v * 0.5 });
  s.tone({ t, f: f * 2.7, a: 0.001, d: 0.05, v: v * 0.15 });
}

/** A candle flame fluttering: a soft breathy flutter and a tiny crackle of the wick. */
export function flicker(s: Synth, t: number, d: number, v: number) {
  const flame = osc(s, 'sine', [[0, s.rand(9, 13)], [d, s.rand(5, 8)]], t, t + d + 0.05);
  s.noise({ t, color: 'pink', filter: 'lowpass', f: 900, a: d * 0.2, h: d * 0.3, d: d * 0.5, v, to: chopper(s, flame) });
  s.crackle({ t, density: 40, filter: 'highpass', f: 2500, a: d * 0.2, h: d * 0.3, d: d * 0.5, v: v * 0.8 });
}

/** Something big and round rolling fast: a rumble, with a lumpy hollow thump every turn. */
export function tumble(s: Synth, t: number, d: number, v: number, turns = 6) {
  rumble(s, t, d, v * 0.8, 50);
  for (let i = 0; i < turns; i++) gourd(s, t + (d * 0.85 * i) / turns, 120 * s.rand(0.9, 1.1), v * 0.35 * (0.6 + 0.4 * Math.sin((Math.PI * (i + 0.5)) / turns)));
  s.noise({ t, color: 'brown', filter: 'bandpass', f: [[0, 300], [d, 600]], q: 1, a: d * 0.2, h: d * 0.5, d: d * 0.3, v: v * 0.6 });
}

/** Old wood creaking: a slow stick-slip rasp ringing in the hollow of a trunk. */
export function creak(s: Synth, t: number, d: number, v: number, f = 60) {
  const stop = t + d + 0.05;
  const src = osc(s, 'sawtooth', [[0, f], [d * 0.35, f * 1.8], [d * 0.7, f * 1.1], [d, f * 1.5]], t, stop);
  const rough = s.ac.createGain();
  rough.gain.value = 300;
  s.noise({ t, color: 'brown', filter: 'lowpass', f: 40, a: 0.01, h: d, d: 0.05, v: 1, to: rough });
  rough.connect(src.detune);
  const out = shape(s, t, d * 0.2, d * 0.4, d * 0.4, v);
  for (const [bf, q, lvl] of [
    [420, 6, 1],
    [980, 7, 0.7],
    [2100, 5, 0.3],
  ]) {
    const bp = band(s, bf, q);
    const l = s.ac.createGain();
    l.gain.value = lvl;
    src.connect(bp);
    bp.connect(l);
    l.connect(out);
  }
}

/** A sleepy owl: a soft, breathy "hoo?" that lifts at the end like a question. */
export function owl(s: Synth, t: number, v: number, p = 1) {
  const f: Pts = [[0, 410 * p], [0.12, 390 * p], [0.27, 520 * p]];
  voice(s, { t, f, vow: 'u', size: 1.15, src: 'triangle', a: 0.04, h: 0.12, d: 0.12, v, vib: [5, 15], breath: 0.25 });
  s.tone({ t, f, a: 0.04, h: 0.12, d: 0.12, v: v * 0.3 });
}

/** The boxing bell: a hammer striking a brass dome, ringing bright and long (on D6, in tune with the music). */
export function ringBell(s: Synth, t: number, v: number, d = 1.5, f = 1174.7) {
  click(s, t, 6500, v * 0.8);
  s.noise({ t, filter: 'bandpass', f: f * 2, q: 2, a: 0.0003, d: 0.02, v: v * 0.6 });
  for (const [r, lvl, dd] of [
    [1, 1, 1],
    [1.98, 0.5, 0.75],
    [2.76, 0.4, 0.55],
    [4.07, 0.22, 0.35],
    [5.4, 0.12, 0.22],
  ]) {
    for (const side of [-1, 1]) s.tone({ t, f: Math.min(16000, f * r + side * s.rand(1, 2.6)), a: 0.0008, d: d * dd, v: (v * lvl) / 2 });
  }
  s.bell({ t, f: f * 0.5, ratio: 2.76, index: 1, d: d * 0.35, v: v * 0.18 });
}

/** A fan's whistle in the stands: two fingers in the mouth, up and down. */
export function fanWhistle(s: Synth, t: number, v: number, p = 1) {
  s.tone({ t, f: [[0, 1500 * p], [0.12, 2900 * p], [0.22, 2500 * p], [0.42, 1700 * p]], a: 0.02, h: 0.2, d: 0.2, v, vib: [6, 20] });
  s.noise({ t, filter: 'bandpass', f: 2600 * p, q: 6, a: 0.02, h: 0.2, d: 0.2, v: v * 0.15 });
}

/** A whole stadium roaring: a wash of voices swelling, single shouts, clapping and whistles. d: the swell. */
export function stadium(s: Synth, t: number, d: number, v: number, voices = 14, whistles = 1) {
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 500], [d * 0.35, 1150], [d, 750]], q: 0.8, a: d * 0.3, h: d * 0.2, d: d * 0.5, v: v * 0.6 });
  s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 1400], [d * 0.35, 2300], [d, 1600]], q: 1.2, a: d * 0.3, h: d * 0.2, d: d * 0.5, v: v * 0.25 });
  crowd(s, t, d, v, 'cheer', voices);
  s.crackle({ t: t + d * 0.1, density: 90, filter: 'bandpass', f: 2000, q: 0.8, a: d * 0.25, h: d * 0.25, d: d * 0.5, v: v * 0.8 });
  for (let i = 0; i < whistles; i++) fanWhistle(s, t + d * s.rand(0.1, 0.4), v * 0.12, s.rand(0.9, 1.1));
}
