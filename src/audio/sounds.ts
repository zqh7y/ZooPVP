import type { SoundDef, SoundName } from './names';

/*
 * Every sound effect of the game, as a small synth recipe. Each one is rendered once into a buffer when the
 * page loads (see engine.ts), layered the way a sound designer would bounce it: a sharp transient, a body,
 * a low thump where it should feel heavy, a tail, and a little sparkle on rewards.
 *
 * The palette is a toy box with a Japanese accent: pops, boings, squeaks, bonks, plops and whistles for the
 * fight; bamboo and woodblocks, koto and shamisen, glass wind bells, taiko and a gong for the interface and the
 * big moments. Sounds heard many times in a row get a few variants (each render draws its own random numbers).
 *
 * Tuning: tunes use the yo scale on D (D E G A B, which is also G major pentatonic), and the big chords sit
 * on G, so any two sounds that ring together agree.
 *
 * v4 (docs/v4.md): the building blocks now live in kit.ts; the twelve characters' voices and the trait sounds
 * are in cast.ts, the stage / wave / roll / evolve sounds in flow.ts, and all of them join this table. The v3
 * sounds below stay (some are legacy: matchmaking, trophies, leagues).
 *
 * v5 (docs/v5.md): the cast's voices are the new weird cast (cast.ts), and fight.ts adds the boxing night:
 * the bell, READY / FIGHT, punches and crits, the comic impact words, knock-outs and combo calls, the crowd,
 * the matchmaking stings and the result's count-ups. search, found, fight, victory and defeat now live there.
 */

import { YO_SCALE, crash, m, pad, semi, sparkle, whoosh, type Synth } from './synth';
import { HOME, along, band, boing, chopper, clack, clamp, click, clink, drip, furin, glory, gong, koto, osc, run, shami, shape, shards, shime, shower, squeak, stab, taiko, thud, thump, wood, yo } from './kit';
import { CAST_SOUNDS, TRAIT_SOUNDS } from './cast';
import { FLOW_SOUNDS } from './flow';
import { FIGHT_SOUNDS } from './fight';

// ------------------------------------------------------------------ the sounds that grow with their number

/** The roll lands on its prize: one koto note more for every class, then brass, a choir, a gong. */
function reveal(s: Synth, n: number) {
  const k = clamp(Math.round(n), 1, 7);
  if (k === 1) {
    thud(s, 0, 130, 0.7);
    koto(s, 0, yo(8), 0.4, 0.5);
    koto(s, 0.07, yo(10), 0.5, 0.6);
    furin(s, 0.07, m(yo(15)), 0.3, 0.12);
    return;
  }
  if (k === 2) {
    thud(s, 0, 125, 0.7);
    run(s, 0, 7, 2, 0.06, 0.5);
    koto(s, 0.12, yo(10), 0.55, 0.65);
    furin(s, 0.12, m(yo(15)), 0.4, 0.2);
    sparkle(s, 0.13, 0.35, 0.22, 3);
    return;
  }
  if (k === 3) {
    taiko(s, 0, 105, 0.22, 0.6);
    koto(s, 0, yo(5), 0.4, 0.45);
    run(s, 0.055, 7, 2, 0.055, 0.5);
    koto(s, 0.165, yo(10), 0.6, 0.65);
    pad(s, [yo(5), yo(7), yo(9)], 0.165, 0.005, 0.12, 0.5, 0.3);
    furin(s, 0.17, m(yo(12)), 0.5, 0.26);
    furin(s, 0.23, m(yo(15)), 0.5, 0.2);
    sparkle(s, 0.18, 0.5, 0.35, 5);
    return;
  }
  if (k === 4) {
    taiko(s, 0, 92, 0.28, 0.7);
    for (const [i, step] of [2, 4, 5, 7, 9, 10].entries()) koto(s, i * 0.05, yo(step), 0.45, 0.4 + i * 0.04);
    taiko(s, 0.3, 72, 0.4, 0.8);
    pad(s, [yo(2), yo(4), yo(5), yo(7)], 0.3, 0.005, 0.2, 0.7, 0.4);
    s.brass({ t: 0.3, notes: [HOME, HOME + 4, HOME + 7], cut: [[0, 500], [0.1, 2400], [0.9, 700]], a: 0.02, h: 0.2, d: 0.6, v: 0.28 });
    crash(s, 0.3, 0.8, 0.22);
    koto(s, 0.3, yo(12), 0.7, 0.6);
    furin(s, 0.31, m(yo(12)), 0.7, 0.3);
    furin(s, 0.4, m(yo(14)), 0.6, 0.22);
    furin(s, 0.5, m(yo(15)), 0.6, 0.2);
    sparkle(s, 0.32, 0.8, 0.45, 8);
    return;
  }
  if (k === 5) return glory(s, 0, 0, 0.5);
  if (k === 6) {
    // S: two chords, a step below home and then home: a lift
    stab(s, 0, HOME - 14, 0.26, 0.85);
    s.choir({ notes: [HOME - 2, HOME + 2, HOME + 5], a: 0.1, h: 0.2, d: 0.18, v: 0.2 });
    run(s, 0.2, 2, 6, 0.045, 0.25, 0.3);
    return glory(s, 0.5, 1, 0.7);
  }
  // SSS: three chords climbing to home. The second one swells, holds its breath, and then everything lands at once.
  stab(s, 0, HOME - 16, 0.34, 0.95);
  gong(s, 0, m(HOME - 12), 1.6, 0.4);
  s.choir({ notes: [HOME - 4, HOME, HOME + 3, HOME + 8], a: 0.12, h: 0.3, d: 0.2, v: 0.24 });
  stab(s, 0.6, HOME - 14, 0.3, 0.9);
  s.choir({ t: 0.6, notes: [HOME - 2, HOME + 2, HOME + 5, HOME + 10], a: 0.1, h: 0.36, d: 0.08, v: 0.3 });
  s.noise({ t: 0.6, color: 'pink', filter: 'bandpass', f: [[0, 300], [0.56, 7000]], q: 2, a: 0.54, d: 0.015, v: 0.5 });
  for (const detune of [-9, 9]) s.tone({ t: 0.6, type: 'sawtooth', f: [[0, m(HOME - 12)], [0.56, m(HOME + 12)]], lp: [[0, 500], [0.56, 5200]], a: 0.54, d: 0.015, v: 0.12, detune });
  for (let i = 0, t = 0.62, gap = 0.11; i < 8; i++, t += gap, gap *= 0.84) shime(s, t, 0.3 + i * 0.07);
  run(s, 0.84, 2, 8, 0.04, 0.3, 0.25);
  glory(s, 1.22, 2, 1.3);
}

/** Two weapons or gear fuse: a squeeze, a juicy pop, and a tune that grows with the new class. */
function merge(s: Synth, n: number) {
  const k = clamp(Math.round(n), 1, 7);
  // squeezed together...
  s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 500], [0.04, 3200]], q: 2, a: 0.035, d: 0.012, v: 0.4 });
  // ...pop
  const t = 0.04;
  s.tone({ t, f: [[0, 240], [0.05, 760]], a: 0.002, d: 0.07, v: 0.7 });
  s.noise({ t, filter: 'bandpass', f: 2100, q: 1, a: 0.0005, d: 0.01, v: 0.45 });
  taiko(s, t, 135 - k * 8, 0.12 + k * 0.03, 0.4 + k * 0.05);
  if (k >= 5) {
    // the rare ones: a quick step up to the home chord, then the works
    if (k === 7) {
      stab(s, t, HOME - 14, 0.16, 0.8);
      run(s, t + 0.03, 2, 6, 0.04, 0.3, 0.25);
    }
    return glory(s, k === 7 ? t + 0.3 : t, k - 5, [0.3, 0.5, 0.9][k - 5]);
  }
  // one koto note more for every class, each class starting a step higher
  const notes = k + 1;
  run(s, t + 0.015, k + 4, notes, 0.05, 0.5, 0.3 + k * 0.05);
  const last = t + 0.015 + (notes - 1) * 0.05;
  furin(s, last, m(yo(k + 4 + notes - 1 + 5)), 0.3 + k * 0.1, 0.22);
  if (k >= 2) sparkle(s, last, 0.25 + k * 0.08, 0.25, 1 + k);
  if (k >= 3) pad(s, [yo(k + 4), yo(k + 6), yo(k + 7)], last, 0.005, 0.1, 0.35 + k * 0.05, 0.3);
  if (k >= 4) crash(s, last, 0.6, 0.16);
}

/** A rare prize shatters and comes back a class higher: the break, a rush upward, and the new class ringing out. */
function breakthrough(s: Synth, n: number) {
  const k = clamp(Math.round(n), 2, 7);
  shards(s, 0, 0.5, 0.9, 8 + k);
  taiko(s, 0, 95 - k * 5, 0.25 + k * 0.04, 0.8);
  // the rush upward
  const up = 0.22;
  whoosh(s, 0.02, 400, 2200, 5200, up, 0.5, 1.8);
  for (const detune of [-8, 8]) s.tone({ t: 0.02, type: 'sawtooth', f: [[0, m(HOME - 12)], [up, m(HOME + 12)]], lp: [[0, 500], [up, 4500]], a: up * 0.9, d: 0.03, v: 0.1, detune });
  const t = up + 0.03;
  if (k >= 5) return glory(s, t, k - 5, [0.3, 0.45, 0.7][k - 5]);
  // the new class: a bright chord, a step higher and a note richer each time
  const top = k + 5;
  taiko(s, t, 80, 0.3, 0.7);
  for (const [i, step] of [top - 5, top - 3, top - 2, top].entries()) koto(s, t + i * 0.012, yo(step), 0.5, 0.45);
  pad(s, [yo(top - 5), yo(top - 3), yo(top - 2), yo(top)], t, 0.005, 0.12, 0.5, 0.4);
  furin(s, t + 0.04, m(yo(top + 5)), 0.6, 0.3);
  sparkle(s, t + 0.03, 0.4 + k * 0.1, 0.35, 3 + k);
  if (k >= 3) run(s, t + 0.08, top, k, 0.045, 0.3, 0.3);
  if (k >= 4) {
    s.brass({ t, notes: [HOME, HOME + 4, HOME + 7], cut: [[0, 500], [0.08, 2400], [0.7, 700]], a: 0.02, h: 0.18, d: 0.5, v: 0.3 });
    crash(s, t, 0.7, 0.2);
  }
}

/** Two pets fuse and double: one plop for every fighter in the new squad, climbing, and a ta-da. */
function stack(s: Synth, n: number) {
  const count = n >= 8 ? 8 : n >= 4 ? 4 : 2;
  const step = count === 8 ? 0.045 : count === 4 ? 0.065 : 0.09;
  s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 500], [0.035, 2600]], q: 2, a: 0.03, d: 0.01, v: 0.35 });
  for (let i = 0; i < count; i++) {
    const t = 0.035 + i * step;
    const f = m(yo(i + 3));
    s.tone({ t, f: [[0, f * 0.5], [0.035, f]], a: 0.002, d: 0.06, v: 0.6 });
    s.noise({ t, filter: 'bandpass', f: f * 2.5, q: 2, a: 0.0005, d: 0.008, v: 0.25 });
    koto(s, t, yo(i + 3), 0.2, 0.25);
  }
  // ta-da
  const t = 0.035 + count * step;
  taiko(s, t, 120 - count * 4, 0.14 + count * 0.02, 0.5 + count * 0.04);
  boing(s, t, 330, 0.22, 0.2);
  const top = count + 3;
  koto(s, t, yo(top), 0.5, 0.6);
  furin(s, t, m(yo(top + 5)), 0.45, 0.3);
  if (count >= 4) koto(s, t, yo(top - 3), 0.5, 0.4);
  if (count >= 8) {
    pad(s, [yo(top - 5), yo(top - 3), yo(top)], t, 0.005, 0.12, 0.4, 0.3);
    crash(s, t, 0.5, 0.14);
  }
  sparkle(s, t + 0.02, 0.3 + count * 0.03, 0.3, 2 + count);
}

/** Trophies fly in: metal cups clinking up the scale. rich 0..2 with how many. */
function trophies(s: Synth, n: number) {
  const rich = n >= 32 ? 2 : n >= 19 ? 1 : 0;
  const count = [3, 5, 8][rich];
  const step = [0.08, 0.065, 0.05][rich];
  for (let i = 0; i < count; i++) {
    clink(s, i * step, yo(8 + i), 0.5 + (0.3 * i) / count);
    koto(s, i * step, yo(3 + i), 0.25, 0.25);
  }
  const t = count * step;
  clink(s, t, yo(8 + count + 1), 0.9, 0.6);
  furin(s, t, m(yo(8 + count + 1)), 0.7, 0.3);
  taiko(s, t, 110, 0.2, 0.4 + rich * 0.15);
  sparkle(s, t, 0.4 + rich * 0.2, 0.35, 4 + rich * 3);
  if (rich >= 1) pad(s, [yo(7), yo(9), yo(10)], t, 0.005, 0.15, 0.6, 0.3);
  if (rich >= 2) {
    s.brass({ t, notes: [HOME, HOME + 4, HOME + 7, HOME + 12], cut: [[0, 500], [0.08, 2600], [0.8, 800]], a: 0.02, h: 0.2, d: 0.6, v: 0.3 });
    crash(s, t, 0.7, 0.18);
  }
}

/** Promoted to a new league: drums rolling in, the home fanfare, more of everything the higher the league. */
function leagueUp(s: Synth, n: number) {
  const k = clamp(Math.round(n), 1, 6);
  // the roll: little drum, faster and louder
  for (let i = 0, t = 0, gap = 0.1; i < 9; i++, t += gap, gap *= 0.87) shime(s, t, 0.3 + i * 0.07);
  clack(s, 0, 0.6);
  run(s, 0.3, 2, 6, 0.045, 0.3, 0.25);
  // three rising calls, then home
  stab(s, 0.62, HOME - 12 - 5, 0.1, 0.8);
  stab(s, 0.84, HOME - 12 - 3, 0.1, 0.85);
  const rank = k >= 6 ? 2 : k >= 3 ? 1 : 0;
  glory(s, 1.06, rank, 0.6 + k * 0.1);
  // the league's own signature: one high bell for every league climbed
  for (let i = 0; i < k; i++) clink(s, 1.2 + i * 0.09, yo(10 + i), 0.35, 0.5);
  if (k >= 4 && rank < 2) gong(s, 1.06, m(HOME - 12), 2.4, 0.4);
}

// ------------------------------------------------------------------ the table

export const SOUNDS: Record<SoundName, SoundDef> = {
  // ---------------- interface
  click: {
    // a small woodblock tap
    dur: 0.12, vars: 2, vol: 0.26, cat: 'ui', gap: 0.03, jitter: 25,
    make: (s) => {
      wood(s, 0, 1250 * s.rand(0.96, 1.04), 0.6, 0.03);
      s.tone({ f: [[0, 640], [0.03, 520]], a: 0.0005, d: 0.035, v: 0.3 });
      s.noise({ filter: 'highpass', f: 5000, a: 0.0003, d: 0.005, v: 0.35 });
    },
  },
  pick: {
    // lifted: a plip that leaps up, and a breath of air
    dur: 0.2, vars: 2, vol: 0.28, cat: 'ui', gap: 0.03, jitter: 40,
    make: (s) => {
      const r = s.rand(0.95, 1.06);
      s.tone({ f: [[0, 500 * r], [0.05, 940 * r]], a: 0.002, d: 0.07, v: 0.7 });
      s.tone({ f: [[0, 1000 * r], [0.05, 1880 * r]], a: 0.002, d: 0.04, v: 0.15 });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1500], [0.08, 4500]], q: 1.5, a: 0.02, d: 0.07, v: 0.22 });
      s.noise({ filter: 'bandpass', f: 3200, q: 1.5, a: 0.0005, d: 0.008, v: 0.3 });
    },
  },
  drop: {
    // put down like a shogi piece snapped onto the board: pachi
    dur: 0.25, vars: 3, vol: 0.32, cat: 'ui', gap: 0.03, jitter: 50,
    make: (s) => {
      const r = s.rand(0.9, 1.1);
      wood(s, 0, 780 * r, 0.7, 0.045, 0.5);
      s.tone({ f: [[0, 300 * r], [0.05, 190]], a: 0.0008, d: 0.08, v: 0.8 });
      s.tone({ f: [[0, 120], [0.08, 70]], a: 0.001, d: 0.09, v: 0.45 });
      s.noise({ filter: 'highpass', f: 4500, a: 0.0003, d: 0.006, v: 0.4 });
    },
  },
  denied: {
    // nuh-uh: two low, muted shamisen notes a half step apart, falling
    dur: 0.45, vol: 0.3, cat: 'ui', gap: 0.15,
    make: (s) => {
      shami(s, 0, 52, 0.1, 0.8);
      shami(s, 0.105, 51, 0.2, 0.9);
      wood(s, 0, 310, 0.4, 0.04);
      wood(s, 0.105, 260, 0.5, 0.05);
    },
  },
  link: {
    // plugged in: a snap, and two koto notes a fifth apart, rising
    dur: 0.55, vars: 2, vol: 0.3, cat: 'ui', verb: 0.25, gap: 0.05, max: 3, jitter: 20,
    make: (s) => {
      wood(s, 0, 1500 * s.rand(0.94, 1.06), 0.5, 0.025);
      s.tone({ f: [[0, 400], [0.04, 800]], a: 0.001, d: 0.05, v: 0.3 });
      koto(s, 0.012, yo(5), 0.3, 0.55);
      koto(s, 0.08, yo(8), 0.45, 0.7);
      furin(s, 0.085, m(yo(13)), 0.3, 0.16);
    },
  },
  unlink: {
    // unplugged: the same two notes falling, duller, and a small "pt"
    dur: 0.4, vol: 0.24, cat: 'ui', verb: 0.15, gap: 0.05, max: 3, jitter: 20,
    make: (s) => {
      koto(s, 0, yo(8), 0.16, 0.55, 0.45);
      koto(s, 0.07, yo(5), 0.3, 0.6, 0.3);
      s.tone({ t: 0.07, f: [[0, 620], [0.05, 260]], a: 0.002, d: 0.06, v: 0.35 });
      s.noise({ filter: 'bandpass', f: 1600, q: 2, a: 0.0005, d: 0.012, v: 0.3 });
    },
  },
  merge: {
    dur: (n) => [0.5, 0.6, 0.75, 1, 2.3, 2.9, 4.2][clamp(Math.round(n), 1, 7) - 1],
    levels: [1, 2, 3, 4, 5, 6, 7],
    vol: 0.5, cat: 'ui', verb: 0.4, gap: 0.05,
    duck: (n) => (n >= 7 ? 0.5 : n >= 5 ? 0.3 : 0),
    make: merge,
  },
  stack: {
    dur: (n) => (n >= 8 ? 1.15 : n >= 4 ? 1 : 0.85),
    levels: [2, 4, 8],
    vol: 0.45, cat: 'ui', verb: 0.3, gap: 0.05,
    make: stack,
  },
  whoosh: {
    // a paper screen sliding
    dur: 0.42, vars: 2, vol: 0.2, cat: 'ui', gap: 0.1, max: 2, jitter: 60,
    make: (s) => {
      whoosh(s, 0, 300, 2400 * s.rand(0.88, 1.12), 700, 0.32, 0.9, 1.4);
      s.noise({ filter: 'highpass', f: 5000, a: 0.12, d: 0.18, v: 0.12 });
    },
  },
  hint: {
    // over here: two wind bells, the second higher, and a soft koto note under them
    dur: 1, vol: 0.26, cat: 'ui', verb: 0.5, gap: 0.3,
    make: (s) => {
      furin(s, 0, m(yo(12)), 0.5, 0.5);
      furin(s, 0.13, m(yo(14)), 0.75, 0.6);
      koto(s, 0, yo(7), 0.35, 0.22);
    },
  },
  count: {
    // one bead of an abacus
    dur: 0.07, vars: 4, vol: 0.16, cat: 'ui', gap: 0.028, max: 3, jitter: 30,
    make: (s) => {
      const f = 2100 * s.rand(0.86, 1.16);
      s.tone({ f: [[0, f * 1.05], [0.02, f]], a: 0.0004, d: 0.028, v: 0.6 });
      s.tone({ f: f * 2.71, a: 0.0004, d: 0.012, v: 0.2 });
      s.noise({ filter: 'bandpass', f: f * 1.5, q: 3, a: 0.0003, d: 0.007, v: 0.6 });
    },
  },

  // ---------------- rolls
  rollStart: {
    // the charm drops in, lands on the drum, and bursts open with a sweep up the koto
    dur: 1.1, vol: 0.45, cat: 'ui', verb: 0.35, gap: 0.3,
    make: (s) => {
      s.tone({ f: [[0, 1500], [0.13, 380]], a: 0.01, d: 0.13, v: 0.25 });
      whoosh(s, 0, 2400, 900, 300, 0.14, 0.5, 1.6);
      taiko(s, 0.14, 85, 0.3, 0.9);
      wood(s, 0.14, 620, 0.6, 0.07, 0.8);
      s.noise({ t: 0.27, filter: 'highpass', f: 1800, a: 0.0005, d: 0.04, v: 0.6 });
      s.tone({ t: 0.27, f: [[0, 300], [0.05, 900]], a: 0.002, d: 0.07, v: 0.5 });
      s.noise({ t: 0.27, filter: 'highpass', f: [[0, 2500], [0.4, 7000]], a: 0.02, d: 0.4, v: 0.2 });
      run(s, 0.28, 3, 8, 0.035, 0.42, 0.35);
      sparkle(s, 0.42, 0.5, 0.35, 6);
    },
  },
  tick: {
    // the medallion flicks on: a bamboo peg, never quite the same twice
    dur: 0.07, vars: 5, vol: 0.2, cat: 'ui', gap: 0.022, max: 4, jitter: 50,
    make: (s) => {
      const f = 2300 * s.rand(0.84, 1.18);
      s.noise({ filter: 'bandpass', f: f * 1.4, q: 2.5, a: 0.0004, d: 0.011, v: 0.9 });
      s.tone({ type: 'triangle', f: [[0, f * 1.05], [0.02, f * 0.8]], a: 0.0004, d: 0.024, v: 0.4 });
      s.tone({ f: f * 0.5, a: 0.0004, d: 0.015, v: 0.2 });
    },
  },
  tock: {
    // the last slow flicks: a temple block, with weight under it
    dur: 0.3, vars: 3, vol: 0.32, cat: 'ui', gap: 0.05, max: 3, jitter: 30,
    make: (s) => {
      const r = s.rand(0.93, 1.07);
      wood(s, 0, 540 * r, 0.9, 0.09, 0.6);
      s.tone({ f: [[0, 200], [0.1, 120]], a: 0.001, d: 0.13, v: 0.5 });
      s.noise({ filter: 'bandpass', f: 1400, q: 4, a: 0.0005, d: 0.02, v: 0.4 });
    },
  },
  reveal: {
    dur: (n) => [0.65, 0.8, 1.05, 1.5, 2.6, 3.4, 5][clamp(Math.round(n), 1, 7) - 1],
    levels: [1, 2, 3, 4, 5, 6, 7],
    vol: 0.6, cat: 'ui', verb: 0.5, gap: 0.1,
    duck: (n) => (n >= 7 ? 0.6 : n >= 5 ? 0.45 : 0),
    make: reveal,
  },
  crack: {
    // the medallion cracks: a snap, grit, and weight behind it
    dur: 0.4, vars: 3, vol: 0.36, cat: 'ui', verb: 0.25, gap: 0.05, max: 3, jitter: 60,
    make: (s) => {
      s.noise({ filter: 'highpass', f: 3200, a: 0.0005, d: 0.014, v: 0.9 });
      s.crackle({ density: 240, filter: 'bandpass', f: 3800 * s.rand(0.85, 1.15), q: 0.8, a: 0.001, d: 0.18, v: 0.7 });
      s.bell({ f: 3100 * s.rand(0.85, 1.2), ratio: 1.83, index: 1.2, d: 0.12, v: 0.15 });
      s.tone({ f: [[0, 800], [0.03, 300]], a: 0.0005, d: 0.04, v: 0.3 });
      s.tone({ f: [[0, 120], [0.1, 60]], a: 0.001, d: 0.1, v: 0.4 });
    },
  },
  breakthrough: {
    dur: (n) => [1.2, 1.2, 1.4, 1.6, 2.6, 3.1, 4.4][clamp(Math.round(n), 1, 7) - 1],
    levels: [2, 3, 4, 5, 6, 7],
    vol: 0.58, cat: 'ui', verb: 0.45, gap: 0.1,
    duck: (n) => (n >= 7 ? 0.6 : n >= 5 ? 0.45 : 0.3),
    make: breakthrough,
  },
  collect: {
    // the prize flies off (fwip) and lands on the bench with a pluck
    dur: 0.62, vars: 2, vol: 0.3, cat: 'ui', verb: 0.3, gap: 0.05, max: 3, jitter: 30,
    make: (s) => {
      whoosh(s, 0, 600, 3000, 5200, 0.2, 0.5, 2.2);
      s.tone({ f: [[0, 500], [0.2, 2400]], a: 0.05, d: 0.16, v: 0.12 });
      wood(s, 0.2, 900 * s.rand(0.94, 1.06), 0.4, 0.03);
      koto(s, 0.2, yo(10), 0.3, 0.6);
      furin(s, 0.2, m(yo(15)), 0.25, 0.25);
      sparkle(s, 0.2, 0.2, 0.2, 3);
    },
  },

  // ---------------- matchmaking (v3; search and found are redesigned for v5 in fight.ts)
  vsSlam: {
    // it flies in and slams: sticks, a great drum, iron ringing, dust
    dur: 1.6, vol: 0.62, cat: 'ui', verb: 0.4, gap: 0.3, duck: 0.45,
    make: (s) => {
      whoosh(s, 0, 300, 1200, 4200, 0.12, 0.5, 1.5);
      const t = 0.12;
      taiko(s, t, 52, 0.7, 1);
      s.tone({ t, f: [[0, 92], [0.5, 32]], a: 0.002, d: 0.6, v: 0.7 });
      clack(s, t, 0.8);
      s.noise({ t, filter: 'bandpass', f: [[0, 2600], [0.12, 700]], q: 0.9, a: 0.0005, d: 0.14, v: 0.8, to: s.drive(3) });
      s.bell({ t, f: 196, ratio: 2.76, index: 2.4, d: 0.9, v: 0.3 });
      s.bell({ t, f: 523, ratio: 1.41, index: 1.8, d: 0.6, v: 0.18 });
      s.brass({ t, notes: [HOME - 24, HOME - 17, HOME - 12], cut: [[0, 300], [0.04, 1800], [0.5, 300]], a: 0.01, h: 0.08, d: 0.45, v: 0.4 });
      crash(s, t, 0.9, 0.25);
      s.crackle({ t: t + 0.04, density: 70, filter: 'highpass', f: 1500, a: 0.02, d: 0.6, v: 0.3 });
    },
  },
  countdown: {
    // 3, 2, 1: a drum, the clappers and a koto note, each number higher and harder than the last
    dur: 0.7, levels: [1, 2, 3], vol: 0.45, cat: 'ui', verb: 0.3, gap: 0.2,
    make: (s, n) => {
      const i = 3 - clamp(Math.round(n), 1, 3); // 0, 1, 2 as it counts 3, 2, 1
      const note = yo([5, 6, 8][i]);
      taiko(s, 0, 88 + i * 10, 0.22, 0.7 + i * 0.12);
      clack(s, 0, 0.5 + i * 0.12);
      koto(s, 0, note, 0.4, 0.6);
      koto(s, 0, note - 12, 0.4, 0.4);
      s.bell({ f: m(note + 12), ratio: 2, index: 1, d: 0.3, v: 0.25 });
      if (i === 2) {
        // "1" leans into the fight: a second stroke and the air drawing in
        shime(s, 0.11, 0.6);
        whoosh(s, 0.2, 500, 1500, 4000, 0.4, 0.25, 1.4);
      }
    },
  },
  // ---------------- the fight: attacks
  deploy: {
    // a squad pops onto the field: bloop, a puff, a little spring
    dur: 0.32, vars: 4, vol: 0.2, cat: 'battle', gap: 0.04, max: 4, jitter: 100,
    make: (s) => {
      const r = s.rand(0.84, 1.2);
      s.tone({ f: [[0, 280 * r], [0.06, 880 * r]], a: 0.003, d: 0.08, v: 0.7 });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 800], [0.1, 2600]], q: 1, a: 0.01, d: 0.12, v: 0.35 });
      s.tone({ f: [[0, 150], [0.07, 70]], a: 0.001, d: 0.08, v: 0.5 });
      boing(s, 0.05, 420 * r, 0.14, 0.18, 30, 300);
    },
  },
  bite: {
    // a wet slap: crisp click, a squishy chomp, a low thump that drops fast
    dur: 0.2, vars: 5, vol: 0.3, cat: 'battle', gap: 0.035, max: 4, jitter: 180,
    make: (s) => {
      const r = s.rand(0.82, 1.22);
      thump(s, 0, 190 * r, 0.09, 0.95);
      click(s, 0, 4200 * r, 0.75);
      s.noise({ t: 0.004, filter: 'bandpass', f: [[0, 1500 * r], [0.05, 380]], q: 4, a: 0.001, d: 0.06, v: 0.8 });
      s.tone({ t: 0.004, f: [[0, 520 * r], [0.05, 210 * r]], lp: 1400, a: 0.001, d: 0.06, v: 0.45 });
      s.tone({ t: 0.03, f: [[0, 900 * r], [0.04, 1500 * r]], a: 0.002, d: 0.035, v: 0.12 });
    },
  },
  knife: {
    // a short whoosh only
    dur: 0.14, vars: 4, vol: 0.14, cat: 'battle', gap: 0.04, max: 3, jitter: 120,
    make: (s) => {
      const r = s.rand(0.82, 1.22);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 2200 * r], [0.07, 6800 * r]], q: 2.2, a: 0.02, d: 0.05, v: 0.9 });
      s.noise({ filter: 'highpass', f: 7000, a: 0.012, d: 0.04, v: 0.22 });
    },
  },
  knifeHit: {
    // tik-THUD: a sharp tick, a bright steel ting and a meaty thud
    dur: 0.22, vars: 5, vol: 0.34, cat: 'battle', gap: 0.035, max: 4, jitter: 120,
    make: (s) => {
      const r = s.rand(0.84, 1.2);
      click(s, 0, 6200 * r, 1);
      thump(s, 0, 170 * r, 0.1, 1);
      s.noise({ t: 0.002, filter: 'bandpass', f: [[0, 2600 * r], [0.03, 900]], q: 1.8, a: 0.0006, d: 0.04, v: 0.7 });
      s.bell({ f: 3600 * r, ratio: 1.53, index: 1.2, d: 0.07, v: 0.16 });
      s.tone({ t: 0.002, f: [[0, 300 * r], [0.06, 110]], lp: 900, a: 0.001, d: 0.07, v: 0.6 });
    },
  },
  bat: {
    // a short heavy whoosh only
    dur: 0.28, vars: 3, vol: 0.2, cat: 'battle', gap: 0.06, max: 3, jitter: 100,
    make: (s) => {
      const r = s.rand(0.86, 1.16);
      whoosh(s, 0, 220 * r, 1300 * r, 300, 0.22, 0.9, 1.6);
      s.noise({ color: 'brown', filter: 'lowpass', f: [[0, 200], [0.1, 600], [0.22, 150]], a: 0.07, d: 0.12, v: 0.45 });
    },
  },
  batHit: {
    // BONK: wooden crack, a huge hollow bonk, a deep thump and a short bouncy boing
    dur: 0.46, vars: 5, vol: 0.6, cat: 'battle', verb: 0.1, gap: 0.05, max: 4, jitter: 70,
    make: (s) => {
      const r = s.rand(0.88, 1.14);
      const hot = s.drive(2.6);
      click(s, 0, 3800 * r, 1);
      thump(s, 0, 150 * r, 0.16, 1.1);
      s.tone({ type: 'triangle', f: [[0, 480 * r], [0.03, 360 * r], [0.16, 290 * r]], a: 0.0006, d: 0.15, v: 1, to: hot });
      s.noise({ filter: 'bandpass', f: 760 * r, q: 7, a: 0.0005, d: 0.08, v: 0.8 });
      s.noise({ filter: 'bandpass', f: 1900 * r, q: 1.8, a: 0.0004, d: 0.018, v: 0.8 });
      boing(s, 0.04, 240 * r, 0.2, 0.2, 21, 420);
    },
  },
  spear: {
    // a quick whistling whoosh only
    dur: 0.18, vars: 3, vol: 0.15, cat: 'battle', gap: 0.05, max: 3, jitter: 100,
    make: (s) => {
      const r = s.rand(0.86, 1.16);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 900 * r], [0.07, 4600 * r]], q: 3.5, a: 0.03, d: 0.06, v: 0.9 });
      s.tone({ f: [[0, 1100 * r], [0.08, 2600 * r]], a: 0.03, d: 0.04, v: 0.1 });
    },
  },
  spearHit: {
    // a rush into a firm THUNK, the shaft quivering a moment
    dur: 0.26, vars: 5, vol: 0.4, cat: 'battle', verb: 0.05, gap: 0.04, max: 4, jitter: 90,
    make: (s) => {
      const r = s.rand(0.86, 1.16);
      s.noise({ filter: 'bandpass', f: [[0, 800 * r], [0.015, 3800 * r]], q: 3, a: 0.006, d: 0.012, v: 0.45 });
      click(s, 0.014, 3200 * r, 0.9);
      thump(s, 0.014, 140 * r, 0.12, 1.1);
      s.noise({ t: 0.016, filter: 'bandpass', f: [[0, 1500 * r], [0.04, 500]], q: 1.5, a: 0.0005, d: 0.05, v: 0.8 });
      s.tone({ t: 0.03, type: 'triangle', f: [[0, 600 * r], [0.12, 520 * r]], lp: 2200, a: 0.002, d: 0.12, v: 0.2, vib: [42, 240] });
    },
  },
  shieldBash: {
    // a heavy iron clonk with weight
    dur: 0.4, vars: 4, vol: 0.45, cat: 'battle', verb: 0.1, gap: 0.06, max: 3, jitter: 70,
    make: (s) => {
      const r = s.rand(0.88, 1.12);
      click(s, 0, 3000 * r, 0.9);
      thump(s, 0, 120 * r, 0.16, 1.1);
      s.bell({ f: 330 * r, ratio: 2.76, index: 1.8, d: 0.22, v: 0.5 });
      s.bell({ f: 870 * r, ratio: 1.41, index: 1.2, d: 0.1, v: 0.22 });
      wood(s, 0, 420 * r, 0.5, 0.05, 0.5);
    },
  },
  block: {
    // a metallic CLANG with a ringing tail
    dur: 0.42, vars: 4, vol: 0.38, cat: 'battle', verb: 0.15, gap: 0.05, max: 3, jitter: 90,
    make: (s) => {
      const r = s.rand(0.86, 1.16);
      click(s, 0, 7000 * r, 1);
      thump(s, 0, 130 * r, 0.08, 0.8);
      s.bell({ f: 560 * r, ratio: 2.76, index: 2.2, d: 0.34, v: 0.5 });
      s.bell({ f: 1400 * r, ratio: 1.41, index: 1.6, d: 0.24, v: 0.3 });
      s.bell({ f: 3000 * r, ratio: 1.83, index: 1, d: 0.12, v: 0.14 });
      s.noise({ filter: 'bandpass', f: 2400, q: 1.2, a: 0.0005, d: 0.035, v: 0.5 });
    },
  },
  hop: {
    // a frog lands: soft feet, and a rubbery little "bwip"
    dur: 0.16, vars: 4, vol: 0.11, cat: 'battle', gap: 0.07, max: 3, jitter: 140,
    make: (s) => {
      const r = s.rand(0.84, 1.2);
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 900], [0.06, 250]], a: 0.002, d: 0.06, v: 0.7 });
      s.tone({ f: [[0, 170 * r], [0.07, 75]], a: 0.002, d: 0.08, v: 0.9 });
      s.tone({ t: 0.01, f: [[0, 240 * r], [0.05, 430 * r]], a: 0.004, d: 0.05, v: 0.22 });
    },
  },
  stun: {
    // little birds going round its head: a warbling whistle and a ring of tiny bells
    dur: 0.8, vars: 2, vol: 0.2, cat: 'battle', verb: 0.3, gap: 0.2, max: 2, jitter: 60,
    make: (s) => {
      const r = s.rand(0.93, 1.08);
      s.tone({ f: [[0, 1500 * r], [0.6, 1150 * r]], a: 0.02, h: 0.3, d: 0.3, v: 0.25, vib: [9, 280] });
      for (let i = 0; i < 6; i++) s.bell({ t: i * 0.085, f: m(yo(i % 2 ? 13 : 14)) * r * (1 - i * 0.012), ratio: 2, index: 0.6, d: 0.14, v: 0.3 - i * 0.03 });
    },
  },

  // ---------------- the fight: deaths
  pop: {
    // blown up like a balloon: rubber stretching tighter and tighter (0.14 s), then the snap of the burst
    dur: 0.55, vars: 4, vol: 0.32, cat: 'battle', verb: 0.15, gap: 0.045, max: 4, jitter: 90,
    make: (s) => {
      const r = s.rand(0.86, 1.16);
      const at = 0.14;
      s.tone({ type: 'sawtooth', f: [[0, 250 * r], [at, 1300 * r]], lp: [[0, 900], [at, 4200]], q: 4, a: at * 0.85, d: 0.012, v: 0.4, vib: [48, 70] });
      s.noise({ filter: 'bandpass', f: [[0, 650 * r], [at, 3400 * r]], q: 8, a: at * 0.85, d: 0.012, v: 0.5 });
      // the burst
      s.noise({ t: at, filter: 'highpass', f: 1200, a: 0.0004, d: 0.035, v: 1 });
      s.tone({ t: at, f: [[0, 640 * r], [0.035, 150]], a: 0.0005, d: 0.06, v: 0.9, to: s.drive(3) });
      s.noise({ t: at, color: 'pink', filter: 'lowpass', f: [[0, 5000], [0.12, 400]], a: 0.001, d: 0.14, v: 0.7 });
      s.tone({ t: at, f: [[0, 130], [0.12, 55]], a: 0.001, d: 0.13, v: 0.6 });
      // scraps of rubber fluttering down, and a last tiny "pyu"
      s.crackle({ t: at + 0.03, density: 90, filter: 'bandpass', f: 2600, q: 1, a: 0.005, d: 0.2, v: 0.25 });
      s.tone({ t: at + 0.05, f: [[0, 2100 * r], [0.14, 700 * r]], a: 0.004, d: 0.14, v: 0.07 });
    },
  },
  squish: {
    // flattened: a wet splat, bubbles, and the squeak of a stepped-on toy
    dur: 0.55, vars: 4, vol: 0.32, cat: 'battle', verb: 0.12, gap: 0.045, max: 4, jitter: 90,
    make: (s) => {
      const r = s.rand(0.86, 1.16);
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 3800], [0.1, 450]], a: 0.001, d: 0.14, v: 1, to: s.drive(2) });
      s.tone({ f: [[0, 150], [0.1, 55]], a: 0.001, d: 0.12, v: 0.8 });
      s.noise({ filter: 'bandpass', f: [[0, 900], [0.04, 2300], [0.09, 700], [0.14, 1700], [0.2, 500]], q: 5, a: 0.002, d: 0.2, v: 0.7 });
      for (const t of [0.03, 0.065 + s.rand(0, 0.02), 0.11 + s.rand(0, 0.03)]) drip(s, t, s.rand(320, 620) * r, 0.3);
      squeak(s, 0.15, 1900 * r, 0.11, 0.3);
    },
  },
  launch: {
    // sent flying: a kick, a slide whistle climbing out of sight, and a star winking where it went
    dur: 1.05, vars: 3, vol: 0.3, cat: 'battle', verb: 0.3, gap: 0.06, max: 3, jitter: 80,
    make: (s) => {
      const r = s.rand(0.88, 1.14);
      const up = s.rand(0.4, 0.5);
      s.tone({ f: [[0, 220], [0.07, 70]], a: 0.001, d: 0.09, v: 0.8, to: s.drive(2) });
      s.noise({ filter: 'bandpass', f: [[0, 1800], [0.05, 600]], q: 1.2, a: 0.0005, d: 0.05, v: 0.6 });
      s.tone({ f: [[0, 520 * r], [up, 3300 * r]], a: 0.02, h: up * 0.45, d: up * 0.6, v: 0.55, vib: [7, 22] });
      s.tone({ f: [[0, 1040 * r], [up, 6600 * r]], a: 0.02, h: up * 0.3, d: up * 0.5, v: 0.06 });
      s.noise({ filter: 'bandpass', f: [[0, 1000 * r], [up, 6000 * r]], q: 4, a: 0.03, h: up * 0.4, d: up * 0.5, v: 0.12 });
      const wink = up + 0.16;
      furin(s, wink, 3500 * r, 0.28, 0.3);
      s.bell({ t: wink, f: 5200 * r, ratio: 2, index: 0.5, d: 0.2, v: 0.12 });
      s.bell({ t: wink + 0.06, f: 7000 * r, ratio: 2, index: 0.4, d: 0.15, v: 0.07 });
    },
  },
  slice: {
    // cut clean in two: shing, and the two halves dropping one after the other
    dur: 0.65, vars: 3, vol: 0.3, cat: 'battle', verb: 0.2, gap: 0.05, max: 3, jitter: 70,
    make: (s) => {
      const r = s.rand(0.9, 1.12);
      s.noise({ filter: 'bandpass', f: [[0, 3000], [0.07, 9000]], q: 2.5, a: 0.004, d: 0.09, v: 0.7 });
      s.tone({ f: [[0, 2400 * r], [0.06, 5200 * r]], a: 0.003, d: 0.2, v: 0.2 });
      s.bell({ t: 0.01, f: 3650 * r, ratio: 1.53, index: 1.6, d: 0.3, v: 0.3 });
      s.bell({ t: 0.015, f: 5480 * r, ratio: 1.31, index: 1.1, d: 0.22, v: 0.15 });
      s.noise({ t: 0.01, filter: 'highpass', f: 8000, a: 0.004, d: 0.2, v: 0.15 });
      const first = 0.25 + s.rand(-0.02, 0.02);
      thud(s, first, 150 * r, 0.6);
      thud(s, first + s.rand(0.1, 0.14), 118 * r, 0.45);
    },
  },
  spin: {
    // spun like a top: a whirr that slows and lurches wider and wider, then tips over with a knock and a rattle
    dur: 1.05, vars: 3, vol: 0.3, cat: 'battle', verb: 0.15, gap: 0.06, max: 3, jitter: 70,
    make: (s) => {
      const r = s.rand(0.88, 1.14);
      const end = 0.68;
      // the wobble: fast and tight at first, slower and wider as the top loses its balance
      const wob = osc(s, 'sine', [[0, 30 * r], [0.4, 13], [end, 5]], 0, end + 0.06);
      const hum = osc(s, 'triangle', [[0, 640 * r], [0.4, 430 * r], [end, 180 * r]], 0, end + 0.06);
      const lurch = s.ac.createGain();
      along(lurch.gain, 0, [[0, 60], [0.4, 220], [end, 600]]);
      wob.connect(lurch);
      lurch.connect(hum.detune);
      hum.connect(shape(s, 0, 0.01, end - 0.12, 0.11, 0.4));
      // the air it whips round: whup-whup-whup
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1700 * r], [end, 500]], q: 1.4, a: 0.01, h: end - 0.1, d: 0.09, v: 0.8, to: chopper(s, wob) });
      // over it goes
      const t = end + 0.02;
      wood(s, t, 520 * r, 0.7, 0.05, 0.5);
      s.tone({ t, f: [[0, 190], [0.1, 70]], a: 0.001, d: 0.13, v: 0.9, to: s.drive(2) });
      for (const [dt, v] of [
        [0.1, 0.4],
        [0.16, 0.25],
        [0.2, 0.15],
      ]) wood(s, t + dt, 640 * r, v, 0.03);
    },
  },
  deflate: {
    // let go like a balloon: a raspberry that darts up and down as it zips about, then sputters out of air
    dur: 1.2, vars: 3, vol: 0.3, cat: 'battle', verb: 0.12, gap: 0.08, max: 2, jitter: 60,
    make: (s) => {
      const r = s.rand(0.85, 1.18);
      const len = s.rand(0.8, 0.95);
      // the flapping neck of the balloon: its speed is the pitch
      const pts: [number, number][] = [[0, 130 * r]];
      for (let t = s.rand(0.06, 0.1), up = true; t < len - 0.28; t += s.rand(0.07, 0.13), up = !up) pts.push([t, (up ? s.rand(210, 300) : s.rand(85, 140)) * r]);
      pts.push([len - 0.2, 70 * r], [len - 0.08, 26], [len, 13]);
      const buzz = osc(s, 'sawtooth', pts, 0, len + 0.05);
      // no two flaps alike
      const rough = s.ac.createGain();
      rough.gain.value = 260;
      s.noise({ color: 'brown', filter: 'lowpass', f: 60, a: 0.01, h: len, d: 0.05, v: 1, to: rough });
      rough.connect(buzz.detune);
      // rubber lips: two hollow resonances and some bite
      const out = shape(s, 0, 0.012, len - 0.06, 0.05, 0.5, s.drive(2));
      for (const [f, q, lvl] of [
        [480 * r, 3, 1],
        [1250 * r, 4, 0.7],
        [2700, 3, 0.25],
      ]) {
        const bp = band(s, f, q);
        const l = s.ac.createGain();
        l.gain.value = lvl;
        buzz.connect(bp);
        bp.connect(l);
        l.connect(out);
      }
      // the air rushing out, chopped by the same flapping
      s.noise({ filter: 'highpass', f: 1800, a: 0.01, h: len - 0.12, d: 0.1, v: 0.35, to: chopper(s, buzz) });
      // the thin squeal of the neck, following every dart
      s.tone({ f: pts.slice(0, -2).map(([t, f]) => [t, f * 9] as [number, number]), a: 0.02, h: len - 0.3, d: 0.08, v: 0.05 });
    },
  },
  shatter: {
    // turned to stone: it cracks through, and falls in glassy bits
    dur: 0.9, vars: 3, vol: 0.3, cat: 'battle', verb: 0.25, gap: 0.05, max: 3, jitter: 80,
    make: (s) => {
      const r = s.rand(0.88, 1.14);
      s.noise({ filter: 'bandpass', f: [[0, 1500 * r], [0.05, 500]], q: 0.9, a: 0.0004, d: 0.06, v: 1, to: s.drive(3) });
      s.noise({ filter: 'highpass', f: 2500, a: 0.0003, d: 0.012, v: 0.7 });
      s.crackle({ density: 500, filter: 'lowpass', f: 1800, a: 0.001, d: 0.1, v: 0.6 });
      s.tone({ f: [[0, 140], [0.1, 55]], a: 0.001, d: 0.12, v: 0.7 });
      for (let i = 0; i < 9; i++) {
        const t = 0.05 + s.rand(0, 0.42);
        s.bell({ t, f: s.rand(2600, 7200), ratio: s.rand(1.3, 2.9), index: 1, d: s.rand(0.05, 0.2), v: s.rand(0.1, 0.24) * (1 - t) });
      }
      s.crackle({ t: 0.04, density: 130, filter: 'highpass', f: 4200, a: 0.01, d: 0.55, v: 0.4 });
    },
  },
  petals: {
    // bursts into cherry petals: a soft puff of air, and glass wind bells drifting down
    dur: 1.05, vars: 3, vol: 0.28, cat: 'battle', verb: 0.45, gap: 0.05, max: 3, jitter: 50,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 700], [0.12, 2800], [0.6, 1500]], q: 0.8, a: 0.025, d: 0.45, v: 0.6 });
      s.tone({ f: [[0, 180], [0.08, 90]], a: 0.004, d: 0.09, v: 0.3 });
      s.noise({ filter: 'highpass', f: 7000, a: 0.08, d: 0.6, v: 0.12 });
      const from = 9 + Math.floor(s.rand(0, 3));
      let t = 0.03;
      for (const [i, step] of [4, 2, 3, 0, 1].entries()) {
        furin(s, t, m(yo(from + step)), 0.4, 0.32 - i * 0.035);
        t += s.rand(0.06, 0.1);
      }
    },
  },

  // ---------------- the fight: streaks and rewards
  combo: {
    // a knock-out streak: one bright koto note with a bell in it, a step up the yo scale for every knock-out
    dur: 0.55, vol: 0.26, cat: 'ui', verb: 0.35, gap: 0.04, max: 4,
    rate: (n) => semi(YO_SCALE[clamp(Math.round(n) - 2, 0, YO_SCALE.length - 1)]),
    make: (s) => {
      const f = m(yo(5));
      koto(s, 0, yo(5), 0.45, 0.7);
      s.bell({ f, ratio: 1, index: 1.1, d: 0.4, v: 0.4 });
      s.tone({ f: f * 2, a: 0.001, d: 0.18, v: 0.18 });
      wood(s, 0, 1800, 0.22, 0.02);
    },
  },
  lastKill: {
    // the knock-out that decides it, in slow motion: a huge drum, time winding down, one clear bell hanging over it
    dur: 2.8, vol: 0.62, cat: 'ui', verb: 0.5, gap: 1, duck: 0.6,
    make: (s) => {
      taiko(s, 0, 48, 1.1, 1);
      s.tone({ f: [[0, 110], [1.2, 26]], a: 0.003, d: 1.4, v: 0.8 });
      s.noise({ filter: 'bandpass', f: [[0, 2400], [0.2, 500]], q: 0.8, a: 0.0005, d: 0.25, v: 0.8, to: s.drive(3) });
      s.tone({ type: 'sawtooth', f: [[0, 520], [1.1, 55]], lp: [[0, 2600], [1.1, 300]], a: 0.01, d: 1.1, v: 0.22 });
      whoosh(s, 0.02, 1800, 500, 120, 1.2, 0.5, 1.2);
      const f = m(yo(10));
      s.bell({ t: 0.02, f, ratio: 2, index: 1.4, d: 2, v: 0.45 });
      furin(s, 0.02, f, 2.2, 0.4);
      s.bell({ t: 0.06, f: f * 1.5, ratio: 2, index: 0.8, d: 1.4, v: 0.2 });
      crash(s, 0, 1.4, 0.3);
      shower(s, 0.5, 1.2, 8, 0.12);
    },
  },
  meter: {
    // a knock-out's star lands in the roll meter: bling, two quick notes up
    dur: 0.4, vars: 4, vol: 0.2, cat: 'ui', verb: 0.25, gap: 0.045, max: 3, jitter: 25,
    make: (s) => {
      const step = 8 + Math.floor(s.rand(0, 4));
      const bright = s.rand(0.5, 0.9);
      koto(s, 0, yo(step), 0.2, 0.5, bright);
      koto(s, 0.05, yo(step + 2), 0.3, 0.6, bright);
      s.bell({ t: 0.05, f: m(yo(step + 2) + 12), ratio: 2, index: s.rand(0.5, 1), d: 0.25, v: 0.3 });
      s.noise({ filter: 'highpass', f: 6000, a: 0.0003, d: 0.006, v: 0.3 });
    },
  },
  rollEarned: {
    // the meter fills, +1 roll: a clack, four notes climbing, and a shower of sparks
    dur: 1.2, vol: 0.45, cat: 'ui', verb: 0.4, gap: 0.3,
    make: (s) => {
      wood(s, 0, 800, 0.6, 0.05, 0.5);
      taiko(s, 0, 110, 0.2, 0.5);
      for (const [i, step] of [5, 7, 8, 10].entries()) {
        koto(s, 0.02 + i * 0.07, yo(step), 0.4, 0.5 + i * 0.06);
        s.bell({ t: 0.02 + i * 0.07, f: m(yo(step) + 12), ratio: 2, index: 0.8, d: 0.3, v: 0.22 });
      }
      const t = 0.3;
      pad(s, [yo(7), yo(9), yo(10), yo(12)], t, 0.005, 0.15, 0.6, 0.35);
      furin(s, t, m(yo(12)), 0.7, 0.3);
      furin(s, t + 0.06, m(yo(15)), 0.6, 0.25);
      s.crackle({ t, density: 110, filter: 'highpass', f: 4500, a: 0.004, d: 0.35, v: 0.2 });
      sparkle(s, t, 0.6, 0.4, 7);
    },
  },
  enrage: {
    // overtime: the kabuki clappers, faster and faster, then the drums come down and the horns growl
    dur: 2, vol: 0.5, cat: 'ui', verb: 0.35, gap: 1, duck: 0.3,
    make: (s) => {
      let t = 0;
      for (let i = 0, gap = 0.16; i < 9; i++, gap *= 0.78) {
        clack(s, t, 0.4 + i * 0.06);
        t += gap;
      }
      taiko(s, t, 50, 0.8, 1);
      taiko(s, t + 0.18, 60, 0.6, 0.8);
      s.brass({ t, notes: [HOME - 24, HOME - 17, HOME - 12, HOME - 9], cut: [[0, 250], [0.2, 2200], [0.9, 400]], a: 0.04, h: 0.35, d: 0.6, v: 0.5, vib: [8, 30] });
      whoosh(s, t - 0.2, 300, 2500, 5000, 0.5, 0.4, 1.4);
      crash(s, t, 0.9, 0.25);
      for (let i = 0; i < 6; i++) shami(s, t + 0.04 + i * 0.07, HOME + (i % 2 ? 3 : 0), 0.12, 0.35);
    },
  },
  cheer: {
    // a crowd of small animals: a wash of voices, a dozen little "yay!"s, clapping paws
    dur: 1.9, vars: 2, vol: 0.28, cat: 'battle', verb: 0.35, gap: 1, max: 2,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 700], [0.3, 1300], [1.5, 900]], q: 0.9, a: 0.15, h: 0.5, d: 0.9, v: 0.35 });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1800], [0.3, 2600], [1.5, 2000]], q: 1.2, a: 0.2, h: 0.4, d: 0.9, v: 0.2 });
      for (let i = 0; i < 12; i++) {
        const t = s.rand(0, 0.7);
        const f = s.rand(380, 1100);
        const d = s.rand(0.18, 0.4);
        s.tone({ t, type: 'sawtooth', f: [[0, f * 0.7], [d * 0.35, f * 1.25], [d, f]], lp: [[0, f * 2], [d * 0.4, f * 4.5], [d, f * 2.5]], q: 3, a: 0.03, h: d * 0.3, d: d * 0.7, v: s.rand(0.08, 0.16), vib: [s.rand(5, 8), 40] });
      }
      s.crackle({ t: 0.05, density: 55, filter: 'bandpass', f: 2200, q: 0.9, a: 0.2, h: 0.5, d: 0.9, v: 0.5 });
    },
  },

  // ---------------- the result (v3; victory and defeat are redesigned for v5 in fight.ts)
  trophyUp: {
    dur: (n) => (n >= 32 ? 1.6 : n >= 19 ? 1.3 : 1),
    levels: [10, 28, 34],
    vol: 0.42, cat: 'ui', verb: 0.4, gap: 0.2,
    make: trophies,
  },
  trophyDown: {
    // trophies lost: cups tumbling down the scale, a thud, a small sinking whistle
    dur: 1, vol: 0.36, cat: 'ui', verb: 0.3, gap: 0.3,
    make: (s) => {
      for (const [i, n] of [HOME + 27, HOME + 22, HOME + 20, HOME + 15].entries()) clink(s, i * 0.085, n, 0.6 - i * 0.08, 0.22);
      thud(s, 0.36, 120, 0.8);
      wood(s, 0.36, 300, 0.4, 0.07, 0.7);
      s.tone({ t: 0.3, f: [[0, 900], [0.4, 330]], a: 0.03, h: 0.15, d: 0.25, v: 0.12, vib: [6, 25] });
    },
  },
  leagueUp: {
    dur: (n) => (n >= 6 ? 5 : n >= 3 ? 4.2 : 3.6),
    levels: [1, 2, 3, 4, 5, 6],
    vol: 0.62, cat: 'ui', verb: 0.5, gap: 1, duck: 0.55,
    make: leagueUp,
  },

  // ================ v4
  ...CAST_SOUNDS, // the twelve characters' attack, hurt and death voices (cast.ts)
  ...TRAIT_SOUNDS, // the traits (cast.ts)
  ...FLOW_SOUNDS, // stages and waves, cash, cells, the roll, the evolve (flow.ts)

  // ================ v5
  ...FIGHT_SOUNDS, // the boxing night: bell, READY / FIGHT, punches, crits, impact words, KOs, combo calls, the crowd, matchmaking, the result (fight.ts)
};
