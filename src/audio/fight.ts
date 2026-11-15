import type { SoundDef, SoundName } from './names';
import { HOME, body, boing, chopper, clamp, click, coin, crowd, crunch, fanWhistle, furin, glove, gong, horn, mallet, osc, ringBell, roll, shards, shower, slap, snare, stadium, taiko, thump, wood, yo } from './kit';
import { firework, gm, party } from './flow';
import { crash, drum, m, pad, sparkle, whoosh, type Synth } from './synth';

/*
 * v5 (docs/v5.md sections 2 and 4): a boxing night. Matched fights instead of stages, so: the matchmaking
 * moment (a searching tick, FOUND, CHAMPION MATCH), the boxing bell, READY ... FIGHT!, meaty glove punches and
 * crits, comic impact words (POW / BONK / WHAM / SMASH), knock-outs that launch, combo calls (DOUBLE KO,
 * TRIPLE KO, RAMPAGE), the crowd's roar and "OOOH", coins flying to the cash pill, the last knock-out's slow
 * motion, VICTORY / DEFEAT, and the result panel's count-up ticks and LEVEL UP. In G major like the music.
 *
 * Sounds heard many times a fight (punch, crit, the impact words, ko, coins, the counts) have short tails,
 * several variants and pitch jitter, and a gap and a cap.
 */

// G major triads (MIDI): the combo calls and stings climb these to the home chord
const C_MAJ = [48, 52, 55];
const D_MAJ = [50, 54, 57];
const E_MIN = [52, 55, 59];
const G_MAJ = [55, 59, 62];

/** The count-up ticks climb G major pentatonic (semitones) as n goes 0..1. */
const COUNT_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const countRate = (n: number) => 2 ** (COUNT_STEPS[clamp(Math.round((Number.isFinite(n) ? n : 0) * (COUNT_STEPS.length - 1)), 0, COUNT_STEPS.length - 1)] / 12);

/** One brass chord hit of a call or a sting (a drum and a snare under it); last: the held, bigger one. */
function hit(s: Synth, t: number, notes: number[], last: boolean, big: number, hold: number) {
  drum(s, t, last ? 60 : 72, last ? 0.5 : 0.3, last ? 0.75 : 0.55, 2.4);
  body(s, t, last ? 150 : 180, last ? 0.2 : 0.12, 0.35);
  snare(s, t, last ? 0.7 : 0.5);
  s.brass({ t, notes: [notes[0] - 12, ...notes, notes[0] + 12], cut: [[0, 600], [0.03, 3200 + big * 400], [last ? hold + 0.4 : 0.15, 900]], a: 0.006, h: last ? hold : 0.06, d: last ? 0.5 : 0.08, v: 0.42 });
  mallet(s, t, notes[2] + 12, 0.3, 0.35);
}

/** A combo call: chords climbing, step seconds apart, the last one held. big 0..2. Returns when the last lands. */
function call(s: Synth, t0: number, chords: number[][], step: number, big: number) {
  chords.forEach((c, i) => hit(s, t0 + i * step, c, i === chords.length - 1, big, 0.3 + big * 0.15));
  const end = t0 + (chords.length - 1) * step;
  crash(s, end, 0.9 + big * 0.3, 0.2 + big * 0.05);
  sparkle(s, end, 0.5 + big * 0.2, 0.3, 5 + big * 3);
  return end;
}

type FightName = Extract<
  SoundName,
  | 'bellStart'
  | 'bellEnd'
  | 'ready'
  | 'fight'
  | 'punch'
  | 'crit'
  | 'pow'
  | 'bonk'
  | 'wham'
  | 'smash'
  | 'ko'
  | 'doubleKo'
  | 'tripleKo'
  | 'rampage'
  | 'slowmo'
  | 'coins'
  | 'roar'
  | 'ooh'
  | 'search'
  | 'found'
  | 'champion'
  | 'cashCount'
  | 'xpCount'
  | 'levelUp'
  | 'mvp'
  | 'victory'
  | 'defeat'
>;

export const FIGHT_SOUNDS: Record<FightName, SoundDef> = {
  // ---------------- the bell and the call
  bellStart: {
    // the boxing bell: DING-DING
    dur: 2, vol: 0.5, cat: 'ui', verb: 0.35, gap: 0.6,
    make: (s) => {
      ringBell(s, 0, 1, 1.2);
      ringBell(s, 0.24, 1, 1.6);
    },
  },
  bellEnd: {
    // the bell at the end: one long DING
    dur: 2.2, vol: 0.5, cat: 'ui', verb: 0.4, gap: 0.6,
    make: (s) => ringBell(s, 0, 1, 1.9),
  },
  ready: {
    // READY...: a drum, the crowd going "ooh", a drum roll and the air drawing in on a held chord that leans into FIGHT!
    dur: 1.25, vol: 0.42, cat: 'ui', verb: 0.35, gap: 0.6,
    make: (s) => {
      taiko(s, 0, 70, 0.4, 0.8);
      thump(s, 0, 90, 0.2, 0.5);
      roll(s, 0.12, 0.9, 0.35);
      s.noise({ t: 0.1, color: 'pink', filter: 'bandpass', f: [[0, 300], [1, 4000]], q: 2, a: 0.95, d: 0.04, v: 0.35 });
      for (const detune of [-8, 8]) s.tone({ t: 0.1, type: 'sawtooth', f: [[0, m(HOME - 12)], [1, m(HOME - 5)]], lp: [[0, 400], [1, 2600]], a: 0.95, d: 0.04, v: 0.08, detune });
      s.brass({ t: 0.05, notes: [50, 55, 57], cut: [[0, 300], [1, 1600]], a: 0.6, h: 0.35, d: 0.08, v: 0.2 });
      crowd(s, 0.05, 1.1, 0.25, 'ooh', 7);
    },
  },
  fight: {
    // FIGHT!: the downbeat. A whoosh in, a huge drum and a glove smack, brass on the home chord, the crowd erupting
    dur: 2.1, vol: 0.62, cat: 'ui', verb: 0.4, gap: 0.5, duck: 0.4,
    make: (s) => {
      whoosh(s, 0, 400, 2500, 1200, 0.06, 0.4);
      const t = 0.05;
      drum(s, t, 55, 0.7, 0.8, 2.6);
      body(s, t, 110, 0.3, 0.6);
      glove(s, t, 0.9, 100);
      snare(s, t, 0.7);
      s.brass({ t, notes: [HOME - 12, HOME - 5, HOME, HOME + 4, HOME + 7], cut: [[0, 600], [0.04, 3800], [0.6, 900]], a: 0.008, h: 0.22, d: 0.45, v: 0.5 });
      horn(s, t, [HOME, HOME + 4, HOME + 7], 0.25, 0.3);
      crash(s, t, 1.4, 0.32);
      stadium(s, t + 0.02, 1.8, 0.4, 14, 2);
    },
  },

  // ---------------- the hits
  punch: {
    // a boxing glove landing: a meaty leather thwack with a low thump. The everyday hit
    dur: 0.24, vars: 5, vol: 0.42, cat: 'battle', gap: 0.03, max: 4, jitter: 90,
    make: (s) => {
      const r = s.rand(0.86, 1.16);
      glove(s, 0, 1, 115 * r);
      body(s, 0, 150 * r, 0.1, 0.35);
      slap(s, 0.002, 0.3, 1700 * r);
    },
  },
  crit: {
    // a critical hit: a rush in, a harder crack, a bigger glove, a deep boom and a bright "shing" on top
    dur: 0.6, vars: 3, vol: 0.6, cat: 'battle', verb: 0.15, gap: 0.06, max: 2, jitter: 60, duck: 0.15,
    make: (s) => {
      const r = s.rand(0.9, 1.1);
      whoosh(s, 0, 600, 3200, 1500, 0.05, 0.35);
      const t = 0.04;
      s.noise({ t, filter: 'highpass', f: 2000, a: 0.0002, d: 0.02, v: 1, to: s.drive(3) });
      glove(s, t, 1.1, 95 * r);
      body(s, t, 120 * r, 0.22, 0.7);
      drum(s, t, 60, 0.35, 0.45, 2.8);
      s.bell({ t, f: 2349 * r, ratio: 1.41, index: 1.4, d: 0.3, v: 0.3 });
      s.bell({ t: t + 0.005, f: 3520 * r, ratio: 1.53, index: 1, d: 0.22, v: 0.18 });
      crash(s, t, 0.35, 0.14);
    },
  },
  pow: {
    // POW!: a punchy pop, a snare crack and a short brass blast
    dur: 0.45, vars: 2, vol: 0.4, cat: 'battle', verb: 0.12, gap: 0.1, max: 2, jitter: 50,
    make: (s) => {
      s.tone({ f: [[0, 1400], [0.06, 260]], a: 0.0005, d: 0.08, v: 0.7, to: s.drive(3) });
      body(s, 0, 170, 0.14, 0.6);
      drum(s, 0, 80, 0.25, 0.5, 2.5);
      snare(s, 0, 0.8);
      s.brass({ notes: [HOME + 7, HOME + 12], cut: [[0, 800], [0.03, 4000], [0.2, 900]], a: 0.005, h: 0.05, d: 0.15, v: 0.35 });
      crash(s, 0, 0.35, 0.12);
    },
  },
  bonk: {
    // BONK!: a hollow cartoon bonk dropping in pitch, and a boing
    dur: 0.5, vars: 2, vol: 0.42, cat: 'battle', verb: 0.1, gap: 0.1, max: 2, jitter: 60,
    make: (s) => {
      click(s, 0, 3500, 0.8);
      s.tone({ type: 'triangle', f: [[0, 620], [0.03, 440], [0.2, 300]], a: 0.0006, d: 0.2, v: 1, to: s.drive(2.4) });
      wood(s, 0, 440, 0.8, 0.1, 1);
      thump(s, 0, 120, 0.14, 0.5);
      boing(s, 0.06, 220, 0.3, 0.3, 20, 450);
    },
  },
  wham: {
    // WHAM!: a rush in and a heavy slam: a big drum, a smack, a ring of metal
    dur: 0.6, vars: 2, vol: 0.46, cat: 'battle', verb: 0.15, gap: 0.1, max: 2, jitter: 50,
    make: (s) => {
      whoosh(s, 0, 300, 1800, 800, 0.08, 0.6);
      const t = 0.07;
      body(s, t, 110, 0.3, 0.8);
      drum(s, t, 55, 0.45, 0.5, 2.8);
      slap(s, t, 0.9, 1300);
      glove(s, t, 0.7, 90);
      s.bell({ t, f: 392, ratio: 2.76, index: 2, d: 0.35, v: 0.28 });
      crash(s, t, 0.5, 0.18);
    },
  },
  smash: {
    // SMASH!: a boom, things breaking into bits, grit raining down
    dur: 0.8, vars: 2, vol: 0.46, cat: 'battle', verb: 0.18, gap: 0.1, max: 2, jitter: 50,
    make: (s) => {
      body(s, 0, 140, 0.25, 0.85);
      drum(s, 0, 55, 0.4, 0.35, 3);
      s.noise({ filter: 'bandpass', f: [[0, 2200], [0.1, 600]], q: 0.8, a: 0.0004, d: 0.12, v: 0.9, to: s.drive(3) });
      crunch(s, 0, 0.25, 0.8);
      shards(s, 0.01, 0.5, 0.6, 10);
      crash(s, 0, 0.7, 0.2);
    },
  },
  ko: {
    // a knock-out: the punchy launch, a slide whistle climbing as it flies off spinning (whup-whup), a star far away
    dur: 1.15, vars: 3, vol: 0.46, cat: 'battle', verb: 0.25, gap: 0.06, max: 3, jitter: 70,
    make: (s) => {
      const r = s.rand(0.9, 1.12);
      glove(s, 0, 1, 100 * r);
      body(s, 0, 130 * r, 0.16, 0.5);
      s.noise({ filter: 'highpass', f: 1800, a: 0.0003, d: 0.03, v: 0.7 });
      const up = s.rand(0.45, 0.55);
      const t = 0.04;
      s.tone({ t, f: [[0, 600 * r], [up, 3000 * r]], a: 0.02, h: up * 0.5, d: up * 0.5, v: 0.5, vib: [9, 45] });
      s.noise({ t, filter: 'bandpass', f: [[0, 1200 * r], [up, 6000 * r]], q: 4, a: 0.03, h: up * 0.4, d: up * 0.5, v: 0.1 });
      const spin = osc(s, 'sine', [[0, 13], [up, 7]], t, t + up + 0.1);
      s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 1600], [up, 3200]], q: 1.4, a: 0.02, h: up * 0.5, d: up * 0.4, v: 0.35, to: chopper(s, spin) });
      const wink = t + up + 0.12;
      furin(s, wink, 3520 * r, 0.3, 0.3);
      s.bell({ t: wink, f: 5274 * r, ratio: 2, index: 0.5, d: 0.2, v: 0.12 });
    },
  },
  doubleKo: {
    // DOUBLE KO!: "ba-BAM!", two chords climbing home, a clap
    dur: 1.3, vol: 0.5, cat: 'ui', verb: 0.35, gap: 0.3, duck: 0.15,
    make: (s) => {
      const end = call(s, 0, [D_MAJ, G_MAJ], 0.13, 0);
      for (const t of [end, end + 0.009, end + 0.018]) s.noise({ t, filter: 'bandpass', f: 1150, q: 1.1, a: 0.0004, d: 0.012, v: 0.5 });
    },
  },
  tripleKo: {
    // TRIPLE KO!: three chords climbing, a crash, the crowd
    dur: 1.8, vol: 0.56, cat: 'ui', verb: 0.4, gap: 0.3, duck: 0.2,
    make: (s) => {
      const end = call(s, 0, [C_MAJ, D_MAJ, G_MAJ], 0.12, 1);
      for (let i = 0; i < 6; i++) mallet(s, end + 0.03 + i * 0.04, gm(i + 4), 0.3, 0.3);
      crowd(s, end, 1.2, 0.3, 'cheer', 8);
    },
  },
  rampage: {
    // RAMPAGE!: a drum roll, four chords climbing, a gong, a horn, the whole stadium roaring
    dur: 2.8, vol: 0.62, cat: 'ui', verb: 0.45, gap: 0.5, duck: 0.3,
    make: (s) => {
      roll(s, 0, 0.3, 0.5);
      const end = call(s, 0.3, [E_MIN, C_MAJ, D_MAJ, G_MAJ], 0.12, 2);
      gong(s, end, m(HOME - 12), 2, 0.35);
      horn(s, end + 0.02, [HOME, HOME + 4, HOME + 7, HOME + 12], 0.5, 0.3);
      for (let i = 0; i < 8; i++) mallet(s, end + 0.03 + i * 0.035, gm(i + 4), 0.3, 0.3);
      stadium(s, end, 2, 0.45, 14, 2);
    },
  },
  slowmo: {
    // the last knock-out in slow motion: a deep falling whoosh, the world's pitch sagging, two slow heartbeats
    dur: 2, vol: 0.5, cat: 'ui', verb: 0.45, gap: 1, duck: 0.35,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 2400], [0.3, 1200], [1.6, 160]], q: 1.2, a: 0.12, h: 0.3, d: 1.3, v: 0.9 });
      s.noise({ color: 'brown', filter: 'bandpass', f: [[0, 600], [1.4, 120]], q: 1.5, a: 0.1, h: 0.3, d: 1.1, v: 0.6 });
      s.tone({ f: [[0, 220], [1.4, 38]], a: 0.04, h: 0.3, d: 1.2, v: 0.5, to: s.drive(1.6) });
      for (const detune of [-14, 14]) s.tone({ type: 'sawtooth', f: [[0, m(HOME)], [1.5, m(HOME - 24)]], lp: [[0, 1800], [1.5, 200]], a: 0.05, h: 0.3, d: 1.2, v: 0.08, detune });
      for (const t of [0.55, 1.15]) {
        thump(s, t, 60, 0.18, 0.6);
        thump(s, t + 0.16, 55, 0.16, 0.4);
      }
    },
  },
  coins: {
    // a sprinkle of coins flying up to the cash pill: a whoosh up, coins tinkling and climbing
    dur: 0.75, vars: 3, vol: 0.26, cat: 'ui', verb: 0.25, gap: 0.08, max: 3, jitter: 30,
    make: (s) => {
      whoosh(s, 0, 800, 3500, 6000, 0.3, 0.25, 2);
      for (let i = 0; i < 7; i++) coin(s, 0.04 + i * 0.05 + s.rand(0, 0.02), m(yo(9 + i + Math.floor(s.rand(0, 2)))), 0.4 + i * 0.05, 0.18);
    },
  },

  // ---------------- the crowd
  roar: {
    // the crowd roars and swells. n = 1 a cheer, 2 a roar with whistles, 3 the whole stadium on its feet
    dur: (n) => [1.7, 2.3, 3.1][clamp(Math.round(n), 1, 3) - 1],
    levels: [1, 2, 3],
    vars: 2,
    vol: 0.36, cat: 'ui', verb: 0.35, gap: 0.6, max: 2,
    make: (s, n) => {
      const k = clamp(Math.round(n), 1, 3);
      stadium(s, 0, [1.4, 2, 2.8][k - 1], 0.5 + k * 0.1, 8 + k * 5, k);
      if (k === 3) for (let i = 0; i < 2; i++) fanWhistle(s, s.rand(0.6, 1.6), 0.08, s.rand(0.9, 1.15));
    },
  },
  ooh: {
    // the crowd's "OOOH!" on a big hit
    dur: 1.2, vars: 2, vol: 0.32, cat: 'ui', verb: 0.35, gap: 0.5, max: 1,
    make: (s) => {
      crowd(s, 0, 1, 0.55, 'ooh', 12);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 400], [0.4, 800], [1, 550]], q: 1.4, a: 0.25, h: 0.25, d: 0.5, v: 0.25 });
    },
  },

  // ---------------- matchmaking
  search: {
    // one tick of the searching moment: a clock's tick-tock and a soft sonar blip (about once a second; the loop is music 'search')
    dur: 0.9, vol: 0.2, cat: 'ui', verb: 0.5, gap: 0.3, max: 2,
    make: (s) => {
      wood(s, 0, 1760, 0.5, 0.025);
      wood(s, 0.5, 1320, 0.4, 0.025);
      const f = m(yo(10)); // D6
      s.tone({ f: [[0, f * 1.03], [0.04, f]], a: 0.003, d: 0.45, v: 0.5 });
      s.tone({ f: f * 2.005, a: 0.003, d: 0.2, v: 0.12 });
      s.tone({ t: 0.25, f, a: 0.003, d: 0.25, v: 0.12 });
    },
  },
  found: {
    // FOUND: an opponent! A whoosh, "dun-DUN!" (two chords climbing home), a cymbal and sparkle
    dur: 1.3, vol: 0.5, cat: 'ui', verb: 0.4, gap: 0.3, duck: 0.2,
    make: (s) => {
      whoosh(s, 0, 400, 2400, 1200, 0.1, 0.35);
      hit(s, 0.08, D_MAJ, false, 0, 0);
      hit(s, 0.24, G_MAJ, true, 0, 0.2);
      crash(s, 0.24, 0.8, 0.2);
      furin(s, 0.26, m(gm(14)), 0.6, 0.25);
      sparkle(s, 0.24, 0.5, 0.3, 6);
    },
  },
  champion: {
    // CHAMPION MATCH: a drum roll, three big chords climbing to home with a choir, a gong, the stadium roaring, a crown of bells
    dur: 3.2, vol: 0.62, cat: 'ui', verb: 0.45, gap: 1, duck: 0.45,
    make: (s) => {
      roll(s, 0, 0.5, 0.55);
      [C_MAJ, D_MAJ, G_MAJ].forEach((c, i) => {
        const t = 0.5 + i * 0.26;
        const last = i === 2;
        drum(s, t, last ? 44 : 58, last ? 0.9 : 0.4, 1, 2.6);
        s.brass({ t, notes: [c[0] - 12, ...c, c[0] + 12], cut: [[0, 450], [0.06, 3000], [last ? 1.4 : 0.25, 800]], a: 0.015, h: last ? 0.8 : 0.16, d: last ? 0.8 : 0.08, v: 0.45, vib: last ? [5, 10] : undefined });
        crash(s, t, last ? 1.6 : 0.4, last ? 0.3 : 0.14);
      });
      const t = 1.02;
      s.choir({ t, notes: [HOME, HOME + 4, HOME + 7, HOME + 12], a: 0.12, h: 0.8, d: 1, v: 0.32 });
      gong(s, t, m(HOME - 12), 2, 0.4);
      stadium(s, t, 2, 0.4, 12, 2);
      shower(s, t + 0.1, 1.4, 14, 0.15);
    },
  },

  // ---------------- the result
  cashCount: {
    // one tick of the cash counting up: a tiny coin. n = 0..1, how far the count is: it climbs as it goes
    dur: 0.14, vars: 3, vol: 0.15, cat: 'ui', gap: 0.028, max: 3, jitter: 12,
    rate: countRate,
    make: (s) => {
      coin(s, 0, m(yo(7)) * s.rand(0.995, 1.005), 0.7, 0.1);
      s.noise({ filter: 'bandpass', f: 4000, q: 2, a: 0.0003, d: 0.005, v: 0.25 });
    },
  },
  xpCount: {
    // one tick of the XP bar filling: a round, bubbly blip. n = 0..1, how full the bar is: it climbs as it fills
    dur: 0.1, vars: 3, vol: 0.14, cat: 'ui', gap: 0.028, max: 3, jitter: 10,
    rate: countRate,
    make: (s) => {
      const f = m(yo(5)); // D5
      s.tone({ f: [[0, f * 0.7], [0.025, f]], a: 0.001, d: 0.06, v: 0.7 });
      s.tone({ type: 'triangle', f: f * 2, a: 0.001, d: 0.03, v: 0.2 });
      s.noise({ filter: 'bandpass', f: 2600, q: 3, a: 0.0003, d: 0.006, v: 0.25 });
    },
  },
  levelUp: {
    // LEVEL UP!: a rush up a marimba, brass "ta-ta-ta-TAAA", then the party: chord, choir, bells raining, the crowd
    dur: 3.2, vol: 0.6, cat: 'ui', verb: 0.45, gap: 1, duck: 0.45,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 300], [0.32, 6000]], q: 2, a: 0.3, d: 0.02, v: 0.4 });
      for (let i = 0; i < 6; i++) mallet(s, i * 0.05, gm(i), 0.3, 0.3 + i * 0.04);
      const tune: [number, number, number][] = [
        [0.34, gm(4), 0.07],
        [0.46, gm(4), 0.07],
        [0.58, gm(4), 0.07],
        [0.7, gm(7), 0.9],
      ];
      for (const [t, n, hold] of tune) {
        s.brass({ t, notes: [n - 12, n], cut: [[0, 700], [0.04, 3600], [hold + 0.1, 1400]], a: 0.01, h: hold, d: 0.15, v: 0.42, vib: hold > 0.3 ? [5.5, 14] : undefined });
        snare(s, t, hold > 0.3 ? 0.7 : 0.45);
      }
      party(s, 0.7, 1, 0.9);
    },
  },
  mvp: {
    // the MVP is named: a spotlight thumps on, a bright chord rings, the crowd cheers
    dur: 1.8, vol: 0.44, cat: 'ui', verb: 0.45, gap: 0.5,
    make: (s) => {
      thump(s, 0, 70, 0.3, 0.8);
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 400], [0.1, 3000], [0.5, 800]], a: 0.004, d: 0.5, v: 0.3 });
      [0, 2, 4, 7].forEach((d, i) => mallet(s, 0.04 + i * 0.05, gm(d + 7), 0.5, 0.4 + i * 0.05));
      pad(s, [HOME, HOME + 4, HOME + 7, HOME + 12], 0.2, 0.01, 0.3, 0.8, 0.35);
      furin(s, 0.2, m(gm(14)), 0.8, 0.3);
      sparkle(s, 0.2, 0.6, 0.3, 6);
      crowd(s, 0.1, 1.4, 0.35, 'cheer', 8);
    },
  },
  victory: {
    // VICTORY!: a drum roll, the brass fanfare (ta-ta-ta-TAAA, ta-ta-ta-TAAAAA) up to the home chord, the party with
    // a gong and fireworks, and the whole stadium on its feet. Big and joyful
    dur: 4.4, vol: 0.62, cat: 'ui', verb: 0.5, gap: 2, duck: 0.5,
    make: (s) => {
      roll(s, 0, 0.4, 0.5);
      const beat = 0.13;
      const t0 = 0.4;
      // [beat, G major degree, length in beats]: D D D G . . F# G A B (held)
      const tune: [number, number, number][] = [
        [0, 4, 1],
        [1, 4, 1],
        [2, 4, 1],
        [3, 7, 3],
        [6, 6, 1],
        [7, 7, 1],
        [8, 8, 1],
        [9, 9, 6],
      ];
      for (const [b, d, len] of tune) {
        const t = t0 + b * beat;
        const hold = len * beat * 0.7;
        s.brass({ t, notes: [gm(d) - 12, gm(d)], cut: [[0, 700], [0.04, 3600], [hold + 0.1, 1400]], a: 0.01, h: hold, d: len > 3 ? 0.6 : 0.1, v: 0.42, vib: len > 3 ? [5.5, 14] : undefined });
        mallet(s, t, gm(d), 0.3, 0.3);
        if (len === 1) snare(s, t, 0.45);
      }
      for (const [b, notes] of [
        [3, [HOME - 12, HOME - 5, HOME, HOME + 4]],
        [6, [50, 57, 62, 66]],
      ] as [number, number[]][]) {
        s.brass({ t: t0 + b * beat, notes, cut: [[0, 450], [0.08, 2600], [0.4, 700]], a: 0.02, h: 0.3, d: 0.15, v: 0.3 });
        drum(s, t0 + b * beat, 60, 0.4, 0.8, 2.2);
      }
      const home = t0 + 9 * beat;
      party(s, home, 2, 1);
      stadium(s, home, 2.4, 0.4, 14, 3);
      firework(s, home + 1.5, 0.45);
    },
  },
  defeat: {
    // DEFEAT: soft and kind, never harsh: the crowd's gentle "aww", marimba notes sinking onto a warm chord, a little "boop"
    dur: 2.8, vol: 0.42, cat: 'ui', verb: 0.45, gap: 2, duck: 0.4,
    make: (s) => {
      crowd(s, 0, 1.6, 0.45, 'aww', 10);
      [4, 2, 1].forEach((d, i) => mallet(s, 0.15 + i * 0.3, gm(d), 0.9, 0.42));
      mallet(s, 1.05, gm(-2), 1.4, 0.45);
      pad(s, [48, 55, 59, 64], 1.05, 0.2, 0.5, 1, 0.32);
      s.tone({ t: 1.05, type: 'triangle', f: m(36), a: 0.1, h: 0.3, d: 0.8, v: 0.2 });
      s.tone({ t: 2.05, f: [[0, 520], [0.12, 330]], a: 0.004, d: 0.15, v: 0.22 });
    },
  },
};
