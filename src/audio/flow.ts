import type { SoundDef, SoundName } from './names';
import { CAST, LADDER } from './cast';
import { HOME, clamp, clank, coin, crowd, furin, gong, horn, mallet, roll, shower, snare, thud, thump, whistle, wood, yo } from './kit';
import { crash, drum, m, pad, sparkle, whoosh, type Synth } from './synth';

/*
 * The sounds of the v4 flow (docs/v4.md): stages and waves on a football pitch, cash and gems, opening cells,
 * the plain roll, and the evolve. The palette is the arena's: a referee's whistle, a stadium air horn, a marimba,
 * coins, glass bells, brass, a choir and the crowd around the pitch. In G major, like the music.
 */

/** The item-style tier (1..7 = E..SSS) a rung looks like (the same formula as tierOf in data.ts). */
const tierOf = (rung: number) => clamp(Math.round(1 + ((rung - 1) * 6) / 11), 1, 7);

/** G major notes from a degree (0 = G4). */
const G_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const gm = (d: number) => 67 + 12 * Math.floor(d / 7) + G_MAJOR[((d % 7) + 7) % 7];

/** A soft pop: the prize pops out of the spin. */
function pop(s: Synth, t: number, v: number) {
  s.tone({ t, f: [[0, 260], [0.045, 820]], a: 0.002, d: 0.07, v });
  s.noise({ t, filter: 'bandpass', f: 2200, q: 1, a: 0.0005, d: 0.012, v: v * 0.6 });
  s.tone({ t, f: [[0, 140], [0.08, 70]], a: 0.001, d: 0.09, v: v * 0.5 });
}

/** Fireworks over the stadium: a thump up, a crackling burst. */
function firework(s: Synth, t: number, v: number) {
  s.tone({ t, f: [[0, 400], [0.25, 1400]], a: 0.02, d: 0.22, v: v * 0.12 });
  const b = t + 0.26;
  thump(s, b, 90, 0.18, v * 0.8);
  s.noise({ t: b, filter: 'highpass', f: 1500, a: 0.0005, d: 0.05, v: v * 0.6 });
  s.crackle({ t: b + 0.04, density: 160, filter: 'highpass', f: 3000, a: 0.01, d: 0.55, v: v * 0.5 });
}

/** The big finish of rare things: brass on the home chord, a marimba run, the crowd, sparkle. rank 0..2. */
function party(s: Synth, t: number, rank: number, hold: number) {
  drum(s, t, 46, 0.9 + rank * 0.2, 1, 2.4);
  s.tone({ t, f: [[0, 72], [1.2, 30]], a: 0.004, d: 0.9 + rank * 0.4, v: 0.5 });
  s.brass({ t, notes: [HOME - 12, HOME - 5, HOME, HOME + 4, HOME + 7], cut: [[0, 450], [0.1, 3000 + rank * 300], [hold + 1, 850]], a: 0.03, h: hold, d: 1.1, v: 0.45 });
  crash(s, t, 1.3 + rank * 0.3, 0.36);
  for (let i = 0; i < 8 + rank * 2; i++) mallet(s, t + 0.04 + i * 0.045, gm(i), 0.35, 0.3);
  sparkle(s, t + 0.2, 1.1 + rank * 0.4, 0.45, 9 + rank * 3);
  crowd(s, t + 0.05, 1.5 + rank * 0.5, 0.3 + rank * 0.08, 'cheer', 5 + rank * 2);
  if (rank >= 1) s.choir({ t: t + 0.03, notes: [HOME, HOME + 4, HOME + 7, HOME + 12], a: 0.2, h: hold + 0.3, d: 1.2, v: 0.3 });
  if (rank >= 2) {
    s.choir({ t: t + 0.35, notes: [HOME + 16, HOME + 19, HOME + 24], a: 0.4, h: hold, d: 1.3, v: 0.15 });
    gong(s, t, m(HOME - 12), 2.6, 0.45);
    shower(s, t + 0.4, 2, 15, 0.16);
    firework(s, t + 0.6, 0.6);
    firework(s, t + 1.1, 0.5);
  } else shower(s, t + 0.3, 1 + rank * 0.5, 6 + rank * 5, 0.13);
}

/**
 * The reveal sting, growing with the class k 1..7 (E..SSS): E is a pop and two notes; every class adds notes,
 * then a drum and a chord, then brass and the crowd, and SSS climbs three chords into the full party.
 */
function sting(s: Synth, k: number, t: number) {
  if (k <= 4) {
    pop(s, t, 0.7);
    const notes = [[2, 4], [0, 2, 4], [0, 2, 4, 7], [0, 2, 4, 7, 9, 11]][k - 1];
    const step = k === 4 ? 0.045 : 0.06;
    notes.forEach((d, i) => mallet(s, t + 0.03 + i * step, gm(d), 0.5, 0.5 + i * 0.04));
    const end = t + 0.03 + (notes.length - 1) * step;
    furin(s, end, m(gm(notes[notes.length - 1] + 7)), 0.4 + k * 0.08, 0.22);
    if (k >= 2) sparkle(s, end, 0.3 + k * 0.08, 0.25, 2 + k);
    if (k >= 3) {
      drum(s, end, 95, 0.25, 0.6, 2);
      pad(s, [HOME, HOME + 4, HOME + 7, HOME + 12], end, 0.005, 0.15, 0.5 + k * 0.05, 0.3);
    }
    if (k >= 4) {
      s.brass({ t: end, notes: [HOME, HOME + 4, HOME + 7], cut: [[0, 500], [0.1, 2400], [0.9, 700]], a: 0.02, h: 0.2, d: 0.5, v: 0.28 });
      crash(s, end, 0.8, 0.2);
      furin(s, end + 0.1, m(gm(14)), 0.6, 0.2);
    }
    return;
  }
  if (k === 5) return party(s, t, 0, 0.5);
  if (k === 6) {
    // S: a step below home, then home: a lift
    pop(s, t, 0.7);
    drum(s, t, 60, 0.4, 0.8, 2.2);
    s.brass({ t, notes: [HOME - 3, HOME + 2, HOME + 5], cut: [[0, 450], [0.08, 2600], [0.5, 700]], a: 0.02, h: 0.24, d: 0.2, v: 0.4 });
    for (let i = 0; i < 6; i++) mallet(s, t + 0.2 + i * 0.045, gm(i + 2), 0.3, 0.3);
    return party(s, t + 0.5, 1, 0.7);
  }
  // SSS: a drum roll, three chords climbing (C, D, then home), a riser, and everything at once
  pop(s, t, 0.8);
  roll(s, t, 0.5, 0.5);
  for (const [i, root] of [HOME - 7, HOME - 5].entries()) {
    const at = t + 0.5 + i * 0.36;
    drum(s, at, 60, 0.4, 0.9, 2.2);
    s.brass({ t: at, notes: [root, root + 4, root + 7, root + 12], cut: [[0, 450], [0.08, 2800], [0.4, 800]], a: 0.02, h: 0.24, d: 0.12, v: 0.45 });
    crash(s, at, 0.5, 0.16);
  }
  const rise = t + 0.86;
  s.noise({ t: rise, color: 'pink', filter: 'bandpass', f: [[0, 300], [0.36, 7000]], q: 2, a: 0.34, d: 0.015, v: 0.5 });
  for (const detune of [-9, 9]) s.tone({ t: rise, type: 'sawtooth', f: [[0, m(HOME - 12)], [0.36, m(HOME + 12)]], lp: [[0, 500], [0.36, 5200]], a: 0.34, d: 0.015, v: 0.12, detune });
  party(s, t + 1.22, 2, 1.2);
}

/** A unit is revealed: the sting of its rung's tier, and the unit's own hello on top. */
function unitReveal(s: Synth, n: number) {
  const rung = clamp(Math.round(n), 1, 12);
  const k = tierOf(rung);
  sting(s, k, 0);
  CAST[LADDER[rung - 1]].hello(s, k >= 5 ? 0.06 : 0.1, 1);
}

/**
 * The evolve: two x4 squads become the next unit. The eight squeeze together (eight plops climbing faster and
 * faster over a rising rush), a big juicy POP with the floor dropping out under it, then the new unit says hello
 * over a bright chord, and the higher the rung the bigger the party after it.
 */
function evolve(s: Synth, n: number) {
  const rung = clamp(Math.round(n), 2, 12);
  const rank = rung >= 10 ? 2 : rung >= 6 ? 1 : 0;
  // the squeeze: eight plops climbing, closer and closer
  const up = 0.5;
  let t = 0;
  for (let i = 0, gap = 0.085; i < 8; i++, t += gap, gap *= 0.84) {
    const f = m(gm(i - 3));
    s.tone({ t, f: [[0, f * 0.55], [0.03, f]], a: 0.002, d: 0.06, v: 0.45 + i * 0.04 });
    s.noise({ t, filter: 'bandpass', f: f * 2.5, q: 2, a: 0.0005, d: 0.008, v: 0.2 });
    mallet(s, t, gm(i - 3), 0.18, 0.18 + i * 0.02);
  }
  // the rush up, and the rubber stretching
  s.noise({ t: 0.04, color: 'pink', filter: 'bandpass', f: [[0, 300], [up, 5200]], q: 2, a: up * 0.9, d: 0.02, v: 0.45 });
  for (const detune of [-8, 8]) s.tone({ t: 0.04, type: 'sawtooth', f: [[0, m(HOME - 12)], [up - 0.04, m(HOME + 12)]], lp: [[0, 400], [up - 0.04, 4600]], a: up * 0.85, d: 0.02, v: 0.09, detune });
  s.tone({ t: 0.06, type: 'sawtooth', f: [[0, 220], [up - 0.06, 1300]], lp: [[0, 900], [up - 0.06, 4000]], q: 4, a: (up - 0.06) * 0.9, d: 0.015, v: 0.18, vib: [44, 60] });
  // POP
  const b = up;
  s.noise({ t: b, filter: 'highpass', f: 1200, a: 0.0004, d: 0.04, v: 1 });
  s.tone({ t: b, f: [[0, 700], [0.04, 160]], a: 0.0005, d: 0.07, v: 1, to: s.drive(3) });
  s.tone({ t: b, f: [[0, 95], [0.9, 32]], a: 0.002, d: 0.9 + rank * 0.3, v: 0.45, to: s.drive(1.6) });
  drum(s, b, 52, 0.7, 0.7, 2.6);
  s.noise({ t: b, color: 'pink', filter: 'bandpass', f: [[0, 1200], [0.12, 400]], q: 0.8, a: 0.001, d: 0.14, v: 0.7 });
  snare(s, b, 0.6);
  crash(s, b, 1.1 + rank * 0.3, 0.32);
  s.noise({ t: b, color: 'pink', filter: 'lowpass', f: [[0, 6000], [0.2, 500]], a: 0.001, d: 0.22, v: 0.6 });
  // ta-da: the bright chord and a cascade of bells up
  s.brass({ t: b, notes: [HOME - 12, HOME, HOME + 4, HOME + 7, HOME + 12], cut: [[0, 600], [0.06, 3400], [0.9 + rank * 0.4, 800]], a: 0.015, h: 0.35 + rank * 0.25, d: 0.7, v: 0.42 });
  pad(s, [HOME, HOME + 4, HOME + 7, HOME + 12, HOME + 16], b, 0.01, 0.4 + rank * 0.3, 0.9, 0.35);
  for (let i = 0; i < 9 + rank * 3; i++) mallet(s, b + 0.03 + i * 0.038, gm(i + 2), 0.4, 0.32);
  sparkle(s, b + 0.05, 1 + rank * 0.4, 0.5, 9 + rank * 4);
  shower(s, b + 0.12, 0.9 + rank * 0.5, 7 + rank * 4, 0.15);
  // the new unit says hello
  CAST[LADDER[rung - 1]].hello(s, b + 0.14, 1);
  if (rank >= 1) {
    s.choir({ t: b + 0.05, notes: [HOME, HOME + 4, HOME + 7, HOME + 12], a: 0.15, h: 0.4 + rank * 0.3, d: 1, v: 0.28 });
    crowd(s, b + 0.1, 1.4 + rank * 0.4, 0.3, 'cheer', 5 + rank * 2);
  }
  if (rank >= 2) {
    gong(s, b, m(HOME - 12), 2.4, 0.4);
    firework(s, b + 0.5, 0.55);
    firework(s, b + 0.9, 0.45);
  }
}

/** One stage-clear star landing: k 1..3, each higher; the third brings the crowd. */
function star(s: Synth, n: number) {
  const k = clamp(Math.round(n), 1, 3);
  whoosh(s, 0, 600, 3000, 5000, 0.14, 0.4, 2);
  const t = 0.13;
  thump(s, t, 140 - k * 10, 0.12, 0.7);
  wood(s, t, 900 + k * 120, 0.4, 0.03);
  const root = [gm(2), gm(4), gm(7)][k - 1];
  mallet(s, t, root, 0.5, 0.6);
  mallet(s, t, root + 12, 0.4, 0.3);
  coin(s, t, m(root + 24), 0.3, 0.35);
  furin(s, t + 0.02, m(root + 19), 0.5, 0.22);
  sparkle(s, t, 0.35 + k * 0.1, 0.3, 3 + k * 2);
  if (k === 3) {
    pad(s, [HOME, HOME + 4, HOME + 7, HOME + 12], t, 0.005, 0.2, 0.5, 0.35);
    crowd(s, t, 0.9, 0.35, 'cheer', 8);
  }
}

type FlowName = Extract<SoundName, 'waveStart' | 'waveClear' | 'stageClear' | 'star' | 'gems' | 'bossArrives' | 'waveLost' | 'cashKill' | 'cashWave' | 'cellUnlock' | 'sell' | 'spinTick' | 'spinLand' | 'unitReveal' | 'itemReveal' | 'evolve'>;

/** The roll's ticks climb this scale (semitones) as the spin slows (G major pentatonic, 1.75 octaves). */
const SPIN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export const FLOW_SOUNDS: Record<FlowName, SoundDef> = {
  waveStart: {
    // START WAVE: the referee's whistle, an air horn, a kick, and the crowd lifting
    dur: 1.1, vol: 0.5, cat: 'ui', verb: 0.3, gap: 0.5, duck: 0.3,
    make: (s) => {
      whistle(s, 0, 0.3, 0.6);
      const t = 0.3;
      horn(s, t, [HOME, HOME + 4, HOME + 7], 0.22, 0.6);
      drum(s, t, 55, 0.4, 0.9, 2.2);
      crash(s, t, 0.6, 0.16);
      crowd(s, t + 0.02, 0.65, 0.3, 'cheer', 6);
    },
  },
  waveClear: {
    // the final whistle (pfweet, pfweet, pfweeeet), a bright marimba jingle, the crowd
    dur: 1.8, vol: 0.48, cat: 'ui', verb: 0.4, gap: 0.5, duck: 0.3,
    make: (s) => {
      whistle(s, 0, 0.1, 0.45);
      whistle(s, 0.16, 0.1, 0.45);
      whistle(s, 0.32, 0.34, 0.5);
      crowd(s, 0.3, 1.2, 0.32, 'cheer', 8);
      [0, 2, 4, 7].forEach((d, i) => mallet(s, 0.4 + i * 0.075, gm(d), 0.45, 0.55 + i * 0.05));
      const t = 0.4 + 3 * 0.075 + 0.075;
      mallet(s, t, gm(9), 0.8, 0.6);
      mallet(s, t, gm(7), 0.8, 0.4);
      pad(s, [HOME, HOME + 4, HOME + 7, HOME + 12], t, 0.005, 0.2, 0.7, 0.35);
      drum(s, t, 90, 0.3, 0.6, 2);
      furin(s, t, m(gm(14)), 0.7, 0.25);
      sparkle(s, t, 0.6, 0.35, 6);
    },
  },
  stageClear: {
    // the big one: a drum roll, a brass fanfare (ta-ta-ta-TAAA, ta-TAAAA), the whole crowd, fireworks
    dur: 5.2, vol: 0.62, cat: 'ui', verb: 0.5, gap: 2, duck: 0.55,
    make: (s) => {
      roll(s, 0, 0.55, 0.55);
      crash(s, 0.55, 0.8, 0.2);
      const lead = (t: number, note: number, hold: number, v: number) => {
        s.brass({ t, notes: [note, note + 12], cut: [[0, 700], [0.04, 3600], [hold + 0.1, 1400]], a: 0.012, h: hold, d: 0.12, v, vib: hold > 0.3 ? [5.5, 14] : undefined });
        mallet(s, t, note + 12, 0.3, 0.3);
      };
      const tune: [number, number, number][] = [
        [0.55, gm(-3), 0.08],
        [0.7, gm(0), 0.08],
        [0.85, gm(2), 0.08],
        [1, gm(4), 0.42],
        [1.58, gm(2), 0.08],
        [1.74, gm(7), 1.1],
      ];
      for (const [t, note, hold] of tune) {
        lead(t, note - 12, hold, 0.42);
        if (hold < 0.2) snare(s, t, 0.5);
      }
      for (const [t, root, hold] of [
        [1, HOME, 0.45],
        [1.58, HOME - 5, 0.1],
      ]) {
        s.brass({ t, notes: [root - 12, root, root + 4, root + 7], cut: [[0, 450], [0.08, 2600], [hold + 0.3, 700]], a: 0.02, h: hold, d: 0.2, v: 0.32 });
        drum(s, t, 60, 0.4, 0.8, 2.2);
      }
      party(s, 1.74, 1, 1.1);
      crowd(s, 1, 3.4, 0.45, 'cheer', 10);
      firework(s, 2.3, 0.5);
      firework(s, 2.7, 0.45);
      firework(s, 3.1, 0.5);
    },
  },
  star: {
    dur: (n) => (n >= 3 ? 1.2 : 0.9),
    levels: [1, 2, 3],
    vol: 0.42, cat: 'ui', verb: 0.4, gap: 0.12,
    make: star,
  },
  gems: {
    // gems: a quick sparkle of glass bells going up, and a crystal "shing"
    dur: 1, vol: 0.38, cat: 'ui', verb: 0.45, gap: 0.2,
    make: (s) => {
      for (let i = 0; i < 7; i++) furin(s, i * 0.05, m(yo(10 + i)), 0.4, 0.35 + i * 0.04);
      s.bell({ t: 0.35, f: m(yo(17)), ratio: 3.01, index: 0.8, d: 0.5, v: 0.3 });
      s.noise({ t: 0.33, filter: 'highpass', f: [[0, 6000], [0.4, 9000]], a: 0.02, d: 0.4, v: 0.15 });
      sparkle(s, 0.35, 0.5, 0.3, 6);
    },
  },
  bossArrives: {
    // two heavy footsteps, the crowd goes "ooh", and a big low brass sting with a gong
    dur: 2.6, vol: 0.66, cat: 'ui', verb: 0.45, gap: 2, duck: 0.5,
    make: (s) => {
      for (const t of [0, 0.42]) {
        drum(s, t, 44, 0.5, 1, 2.6);
        thump(s, t, 55, 0.3, 0.8);
        wood(s, t, 200, 0.8, 0.12, 0.9);
        s.noise({ t, color: 'brown', filter: 'lowpass', f: 600, a: 0.005, d: 0.3, v: 0.6 });
        s.crackle({ t: t + 0.02, density: 200, filter: 'lowpass', f: 1500, a: 0.002, d: 0.15, v: 0.3 });
      }
      crowd(s, 0.55, 1.5, 0.35, 'ooh', 8);
      const t = 0.84;
      s.brass({ t, notes: [40, 47, 52, 53, 59], cut: [[0, 300], [0.3, 2400], [1.4, 450]], a: 0.06, h: 0.5, d: 0.8, v: 0.6, vib: [5, 12] });
      drum(s, t, 42, 1, 1, 2.6);
      gong(s, t, m(40), 1.6, 0.35);
      crash(s, t, 1.2, 0.2);
      s.choir({ t, notes: [52, 55, 59, 64], a: 0.2, h: 0.5, d: 0.8, v: 0.3 });
    },
  },
  waveLost: {
    // the crowd's soft "aww", and three gentle notes sinking: no harsh edge anywhere
    dur: 2.2, vol: 0.4, cat: 'ui', verb: 0.45, gap: 1.5, duck: 0.4,
    make: (s) => {
      crowd(s, 0, 1.6, 0.5, 'aww', 10);
      for (const [i, d] of [4, 2, 0].entries()) mallet(s, 0.15 + i * 0.32, gm(d), 0.9, 0.4);
      pad(s, [52, 59, 64, 67], 0.79, 0.15, 0.4, 0.8, 0.3);
    },
  },
  cashKill: {
    // one coin for a knock-out: a bright little "tink"
    dur: 0.2, vars: 4, vol: 0.15, cat: 'ui', gap: 0.03, max: 4, jitter: 40,
    make: (s) => {
      coin(s, 0, s.rand(2500, 3300), 0.7, 0.16);
      s.noise({ filter: 'bandpass', f: 4000, q: 2, a: 0.0003, d: 0.006, v: 0.3 });
    },
  },
  cashWave: {
    // the wave's pay: coins pouring onto a pile, faster and faster, and a till's "ka-ching"
    dur: 1.3, vol: 0.4, cat: 'ui', verb: 0.3, gap: 0.3,
    make: (s) => {
      for (let i = 0, t = 0, gap = 0.08; i < 14; i++, t += gap, gap = Math.max(0.028, gap * 0.86)) coin(s, t, m(yo(10 + Math.floor(s.rand(0, 7)))), 0.35 + i * 0.02, 0.2);
      const t = 0.62;
      s.noise({ t: t - 0.06, filter: 'bandpass', f: [[0, 1500], [0.06, 3000]], q: 1.2, a: 0.03, d: 0.03, v: 0.3 });
      wood(s, t, 900, 0.4, 0.03);
      s.bell({ t, f: 2350, ratio: 3.5, index: 2, d: 0.5, v: 0.4 });
      s.bell({ t, f: 3150, ratio: 2.1, index: 1.2, d: 0.4, v: 0.25 });
      coin(s, t + 0.04, m(yo(16)), 0.6, 0.4);
      sparkle(s, t, 0.5, 0.3, 5);
    },
  },
  cellUnlock: {
    // a padlock: click-clack, a pop, two notes up, a little sparkle
    dur: 0.8, vol: 0.38, cat: 'ui', verb: 0.35, gap: 0.15,
    make: (s) => {
      clank(s, 0, 0.5, 1300);
      clank(s, 0.07, 0.6, 1050);
      pop(s, 0.14, 0.7);
      mallet(s, 0.16, gm(4), 0.4, 0.5);
      mallet(s, 0.24, gm(7), 0.6, 0.6);
      furin(s, 0.24, m(gm(14)), 0.4, 0.2);
      sparkle(s, 0.24, 0.4, 0.3, 5);
    },
  },
  sell: {
    // TRASH: into the bin (fwoop, clunk), and a coin back
    dur: 0.6, vol: 0.32, cat: 'ui', verb: 0.25, gap: 0.1, max: 2,
    make: (s) => {
      whoosh(s, 0, 2400, 900, 300, 0.14, 0.5, 1.6);
      wood(s, 0.14, 300, 0.7, 0.08, 0.9);
      thud(s, 0.14, 130, 0.6);
      coin(s, 0.26, m(yo(13)), 0.6, 0.25);
      coin(s, 0.32, m(yo(15)), 0.45, 0.25);
    },
  },
  spinTick: {
    // a prize flicks past: a dry little marimba tick. n = the spin's progress 0..1: it climbs the scale as the
    // spin slows, so the last, slow ticks lean upward into the landing
    dur: 0.07, vars: 3, vol: 0.18, cat: 'ui', gap: 0.02, max: 4, jitter: 8,
    rate: (n) => 2 ** (SPIN_STEPS[clamp(Math.round((Number.isFinite(n) ? n : 0) * (SPIN_STEPS.length - 1)), 0, SPIN_STEPS.length - 1)] / 12),
    make: (s) => {
      const f = m(gm(4));
      s.tone({ type: 'triangle', f: [[0, f * 1.02], [0.02, f]], a: 0.0005, d: 0.035, v: 0.7 });
      s.tone({ f: f * 2, a: 0.0004, d: 0.02, v: 0.2 });
      s.tone({ f: f * 3.99, a: 0.0004, d: 0.012, v: 0.18 });
      s.noise({ filter: 'bandpass', f: s.rand(2600, 3400), q: 2.5, a: 0.0003, d: 0.008, v: 0.5 });
    },
  },
  spinLand: {
    // the spin stops: a soft, weighty landing
    dur: 0.4, vol: 0.4, cat: 'ui', verb: 0.2, gap: 0.1,
    make: (s) => {
      thud(s, 0, 140, 0.8);
      wood(s, 0, 420, 0.5, 0.07, 0.6);
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 2500], [0.1, 300]], a: 0.001, d: 0.12, v: 0.4 });
    },
  },
  unitReveal: {
    dur: (n) => [0.8, 0.95, 0.95, 1.1, 1.1, 1.5, 1.5, 2.8, 2.8, 3.6, 3.6, 5.4][clamp(Math.round(n), 1, 12) - 1],
    levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    vol: 0.58, cat: 'ui', verb: 0.45, gap: 0.1,
    duck: (n) => (n >= 12 ? 0.6 : n >= 8 ? 0.45 : 0.2),
    make: unitReveal,
  },
  itemReveal: {
    dur: (n) => [0.7, 0.8, 1, 1.4, 2.6, 3.4, 5.2][clamp(Math.round(n), 1, 7) - 1],
    levels: [1, 2, 3, 4, 5, 6, 7],
    vol: 0.56, cat: 'ui', verb: 0.45, gap: 0.1,
    duck: (n) => (n >= 7 ? 0.6 : n >= 5 ? 0.45 : 0),
    make: (s, n) => sting(s, clamp(Math.round(n), 1, 7), 0),
  },
  evolve: {
    dur: (n) => (n >= 10 ? 3.8 : n >= 6 ? 3 : 2.2),
    levels: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    vol: 0.64, cat: 'ui', verb: 0.45, gap: 0.2,
    duck: (n) => (n >= 10 ? 0.6 : n >= 6 ? 0.5 : 0.4),
    make: evolve,
  },
};
