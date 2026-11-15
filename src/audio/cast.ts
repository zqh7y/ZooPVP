import type { PetType } from '../types';
import type { PetVoiceName, SoundDef, SoundName } from './names';
import { boing, buzz, clank, click, crunch, drip, furin, glove, poof, rumble, rustle, shards, slap, splash, sproing, squeak, squelch, thud, thump, voice, whirr, wood } from './kit';
import { drum, whoosh, type Synth } from './synth';

/*
 * The twelve characters' voices (docs/v4.md): each one has an attack, a hurt and a death sound that are clearly
 * that character, and a happy hello the roll and the evolve play when it appears. Voice-like chirps and grunts
 * come from kit.voice (a buzz through vowel formants with pitch glides), never words, mixed with the
 * character's own props: leaves, wings, gloves, a shell, a spring, a reel, armour, rock.
 *
 * Heard dozens of times a fight, so: short tails, four variants each (every variant draws its own pitch), and a
 * gap and a cap per sound so a 20-a-second brawl stays clean. The enemy's are pitched a little deeper by the
 * engine.
 */

/** p: the variant's own pitch (each render draws one), t: when it starts. */
type Recipe = (s: Synth, t: number, p: number) => void;

interface Character {
  attack: Recipe;
  hurt: Recipe;
  death: Recipe;
  /** a happy hello when it is revealed or evolved into */
  hello: Recipe;
  /** seconds rendered: attack, hurt, death */
  dur: [number, number, number];
  /** mix: attack, hurt, death */
  vol: [number, number, number];
}

/** A light boxing jab (Cacto's little arms). */
const jab = (s: Synth, t: number, v: number, p: number) => glove(s, t, v, 175 * p);

/** A heavy snort: two puffs of air through a big nose. */
function snort(s: Synth, t: number, v: number, p: number) {
  for (const [dt, lv] of [
    [0, 0.6],
    [0.085, 1],
  ]) {
    s.noise({ t: t + dt, filter: 'bandpass', f: [[0, 760 * p], [0.07, 430 * p]], q: 2.4, a: 0.006, d: 0.075, v: v * lv * 1.4 });
    s.noise({ t: t + dt, filter: 'bandpass', f: 1500 * p, q: 3, a: 0.006, d: 0.05, v: v * lv * 0.5 });
    s.noise({ t: t + dt, color: 'brown', filter: 'lowpass', f: 420, a: 0.006, d: 0.07, v: v * lv * 0.4 });
  }
}

export const CAST: Record<PetType, Character> = {
  // a tiny seedling kid: squeaky and leafy
  sprout: {
    dur: [0.24, 0.2, 0.66],
    vol: [0.2, 0.2, 0.27],
    attack: (s, t, p) => {
      // "hup!"
      voice(s, { t, f: [[0, 760 * p], [0.035, 1000 * p], [0.09, 860 * p]], vow: [[0, 'u'], [0.05, 'uh']], size: 1.55, src: 'sawtooth', h0: 0.016, a: 0.008, h: 0.03, d: 0.06, v: 0.8 });
      s.tone({ t: t + 0.11, f: [[0, 500 * p], [0.014, 1300 * p]], a: 0.001, d: 0.02, v: 0.22 });
      rustle(s, t, 0.09, 0.45, 4300);
      click(s, t + 0.012, 5200 * p, 0.25);
    },
    hurt: (s, t, p) => {
      // "eep!"
      voice(s, { t, f: [[0, 1050 * p], [0.03, 1500 * p], [0.13, 1000 * p]], vow: [[0, 'i'], [0.08, 'e']], size: 1.5, src: 'sawtooth', a: 0.005, h: 0.025, d: 0.09, v: 0.85, vib: [28, 45] });
      rustle(s, t, 0.07, 0.25, 4800);
    },
    death: (s, t, p) => {
      // "wheee-ooo", leaves fluttering down, a soft pomf
      voice(s, { t, f: [[0, 1250 * p], [0.07, 1550 * p], [0.46, 480 * p]], vow: [[0, 'i'], [0.22, 'u']], size: 1.5, src: 'sawtooth', h0: 0.02, a: 0.012, h: 0.16, d: 0.3, v: 0.75, vib: [9, 60] });
      rustle(s, t + 0.05, 0.5, 0.32, 3400);
      thud(s, t + 0.45, 190 * p, 0.45);
    },
    hello: (s, t, p) => {
      // "yay!"
      voice(s, { t, f: [[0, 880 * p], [0.06, 1300 * p], [0.2, 1180 * p]], vow: [[0, 'i'], [0.05, 'ae']], size: 1.5, src: 'sawtooth', a: 0.01, h: 0.09, d: 0.12, v: 0.8, vib: [7, 30] });
      rustle(s, t + 0.02, 0.15, 0.3, 4300);
    },
  },
  // a round little bee in a pilot cap: a buzz and a tiny pop
  buzzy: {
    dur: [0.22, 0.18, 0.84],
    vol: [0.2, 0.2, 0.27],
    attack: (s, t, p) => {
      buzz(s, t, [[0, 230 * p], [0.12, 340 * p]], 0.12, 0.55);
      const at = t + 0.12;
      s.tone({ t: at, f: [[0, 900 * p], [0.018, 2300 * p]], a: 0.0008, d: 0.028, v: 0.6 });
      click(s, at, 6500, 0.45);
    },
    hurt: (s, t, p) => {
      // "bzzt!"
      buzz(s, t, [[0, 320 * p], [0.035, 560 * p], [0.11, 400 * p]], 0.11, 0.6, [16, 80]);
      voice(s, { t: t + 0.01, f: [[0, 1500 * p], [0.08, 1850 * p]], vow: 'i', size: 1.7, src: 'sawtooth', a: 0.004, h: 0.02, d: 0.06, v: 0.45 });
    },
    death: (s, t, p) => {
      // spirals down like a little plane, a tiny "whee-oo", and a pop when it lands
      buzz(s, t, [[0, 380 * p], [0.62, 110 * p]], 0.62, 0.55, [7, 220]);
      voice(s, { t: t + 0.02, f: [[0, 1400 * p], [0.45, 600 * p]], vow: [[0, 'i'], [0.3, 'u']], size: 1.7, src: 'sawtooth', a: 0.02, h: 0.2, d: 0.22, v: 0.3, vib: [8, 50] });
      const at = t + 0.66;
      s.tone({ t: at, f: [[0, 650 * p], [0.03, 260]], a: 0.0006, d: 0.05, v: 0.6 });
      click(s, at, 3500, 0.5);
      s.noise({ t: at, color: 'pink', filter: 'lowpass', f: [[0, 3000], [0.08, 400]], a: 0.001, d: 0.09, v: 0.3 });
    },
    hello: (s, t, p) => {
      buzz(s, t, [[0, 280 * p], [0.08, 360 * p]], 0.14, 0.4);
      voice(s, { t: t + 0.08, f: [[0, 1300 * p], [0.05, 1700 * p], [0.18, 1600 * p]], vow: [[0, 'a'], [0.07, 'i']], size: 1.7, src: 'sawtooth', h0: 0.01, a: 0.008, h: 0.07, d: 0.1, v: 0.6 });
      furin(s, t + 0.16, 2600 * p, 0.3, 0.2);
    },
  },
  // a small hooded ninja kid: a sharp "hyah!" and a whoosh
  ninja: {
    dur: [0.22, 0.16, 0.74],
    vol: [0.22, 0.2, 0.28],
    attack: (s, t, p) => {
      voice(s, { t, f: [[0, 400 * p], [0.035, 560 * p], [0.12, 430 * p]], vow: [[0, 'e'], [0.035, 'a']], size: 1.2, h0: 0.022, a: 0.006, h: 0.04, d: 0.07, v: 0.8, breath: 0.08 });
      s.noise({ t: t + 0.015, color: 'pink', filter: 'bandpass', f: [[0, 1400 * p], [0.1, 6800 * p]], q: 2.2, a: 0.04, d: 0.06, v: 0.65 });
      s.noise({ t: t + 0.03, filter: 'highpass', f: 7000, a: 0.02, d: 0.05, v: 0.15 });
    },
    hurt: (s, t, p) => {
      // "ngh!" and the cloth flapping
      voice(s, { t, f: [[0, 380 * p], [0.08, 290 * p]], vow: [[0, 'uh'], [0.05, 'm']], size: 1.2, a: 0.004, h: 0.02, d: 0.07, v: 0.85, rough: 0.35 });
      s.noise({ t, color: 'pink', filter: 'bandpass', f: 2200, q: 1, a: 0.002, d: 0.04, v: 0.25 });
    },
    death: (s, t, p) => {
      // "aaah...", gone in a puff of smoke, a shuriken tinkling down
      voice(s, { t, f: [[0, 520 * p], [0.42, 250 * p]], vow: [[0, 'a'], [0.3, 'o']], size: 1.2, h0: 0.015, a: 0.01, h: 0.12, d: 0.3, v: 0.7, vib: [6, 30] });
      poof(s, t + 0.28, 0.35, 0.5);
      furin(s, t + 0.33, 3300 * p, 0.25, 0.14);
    },
    hello: (s, t, p) => {
      // "hai!"
      voice(s, { t, f: [[0, 460 * p], [0.04, 620 * p], [0.17, 540 * p]], vow: [[0, 'a'], [0.09, 'i']], size: 1.2, h0: 0.02, a: 0.006, h: 0.07, d: 0.1, v: 0.8 });
      s.noise({ t: t + 0.02, color: 'pink', filter: 'bandpass', f: [[0, 1600], [0.12, 7000]], q: 2.2, a: 0.05, d: 0.07, v: 0.5 });
    },
  },
  // a snail in a sailor hat: a squelch and a shell clack
  snailor: {
    dur: [0.24, 0.2, 0.78],
    vol: [0.22, 0.2, 0.28],
    attack: (s, t, p) => {
      squelch(s, t, 0.1, 0.55);
      wood(s, t + 0.075, 640 * p, 0.6, 0.045, 0.6);
      voice(s, { t: t + 0.01, f: [[0, 250 * p], [0.09, 300 * p]], vow: [[0, 'o'], [0.07, 'i']], size: 1.05, src: 'square', a: 0.008, h: 0.03, d: 0.06, v: 0.3 });
    },
    hurt: (s, t, p) => {
      // "oof", and the shell knocks
      voice(s, { t, f: [[0, 300 * p], [0.12, 220 * p]], vow: [[0, 'u'], [0.05, 'uh']], size: 1.05, h0: 0.012, a: 0.01, h: 0.025, d: 0.09, v: 0.75 });
      wood(s, t + 0.02, 560 * p, 0.45, 0.04, 0.6);
    },
    death: (s, t, p) => {
      // a sad wobbly "ohhh", the sea-chest shell clattering, a few bubbles
      voice(s, { t, f: [[0, 330 * p], [0.12, 300 * p], [0.55, 170 * p]], vow: [[0, 'o'], [0.4, 'u']], size: 1, a: 0.02, h: 0.25, d: 0.28, v: 0.6, vib: [5.5, 70] });
      for (const [dt, f, v] of [
        [0.3, 700, 0.5],
        [0.38, 560, 0.4],
        [0.44, 820, 0.3],
      ]) wood(s, t + dt, f * p, v, 0.04, 0.5);
      for (let i = 0; i < 4; i++) drip(s, t + 0.1 + i * 0.09 + s.rand(0, 0.04), s.rand(380, 720), 0.25);
    },
    hello: (s, t, p) => {
      // "a-hoy!"
      voice(s, { t, f: [[0, 240 * p], [0.06, 230 * p]], vow: 'a', size: 1.05, h0: 0.012, a: 0.008, h: 0.03, d: 0.04, v: 0.6 });
      voice(s, { t: t + 0.12, f: [[0, 260 * p], [0.06, 360 * p], [0.2, 330 * p]], vow: [[0, 'o'], [0.08, 'i']], size: 1.05, a: 0.01, h: 0.08, d: 0.1, v: 0.7 });
      wood(s, t + 0.12, 700 * p, 0.35, 0.04, 0.6);
    },
  },
  // a kangaroo in boxing gloves: a glove thump and a boing
  roo: {
    dur: [0.26, 0.2, 0.7],
    vol: [0.27, 0.2, 0.29],
    attack: (s, t, p) => {
      glove(s, t, 0.9, 115 * p);
      boing(s, t + 0.03, 250 * p, 0.17, 0.3, 22, 380);
    },
    hurt: (s, t, p) => {
      // "hoo!"
      voice(s, { t, f: [[0, 320 * p], [0.04, 400 * p], [0.13, 310 * p]], vow: [[0, 'u'], [0.06, 'o']], size: 1, h0: 0.02, a: 0.006, h: 0.03, d: 0.08, v: 0.75 });
      glove(s, t, 0.3, 150);
    },
    death: (s, t, p) => {
      // the spring runs out of bounce, "owww", a thud
      s.tone({ t, type: 'triangle', f: [[0, 500 * p], [0.42, 150 * p]], lp: 2600, a: 0.003, d: 0.42, v: 0.35, vib: [18, 520] });
      voice(s, { t: t + 0.05, f: [[0, 380 * p], [0.35, 210 * p]], vow: [[0, 'a'], [0.16, 'u']], size: 1, a: 0.01, h: 0.12, d: 0.24, v: 0.6 });
      thud(s, t + 0.48, 120, 0.7);
    },
    hello: (s, t, p) => {
      // glove pat-pat, "hey!", boing
      glove(s, t, 0.35, 160);
      glove(s, t + 0.09, 0.4, 150);
      voice(s, { t: t + 0.16, f: [[0, 360 * p], [0.04, 450 * p], [0.18, 400 * p]], vow: [[0, 'e'], [0.1, 'i']], size: 1, h0: 0.02, a: 0.006, h: 0.07, d: 0.1, v: 0.75 });
      boing(s, t + 0.2, 300 * p, 0.18, 0.25);
    },
  },
  // a potted cactus with two boxing arms: a quick double jab and a prickly crackle
  cacto: {
    dur: [0.22, 0.2, 0.86],
    vol: [0.24, 0.2, 0.28],
    attack: (s, t, p) => {
      jab(s, t, 0.7, p);
      jab(s, t + 0.075, 0.85, p * 0.94);
      s.crackle({ t: t + 0.02, density: 900, filter: 'highpass', f: 5200, a: 0.004, d: 0.1, v: 0.35 });
    },
    hurt: (s, t, p) => {
      // "ow-ow!"
      for (const [i, dt] of [0, 0.085].entries()) voice(s, { t: t + dt, f: [[0, 700 * p * (1 + i * 0.08)], [0.05, 560 * p]], vow: [[0, 'a'], [0.03, 'u']], size: 1.35, src: 'sawtooth', a: 0.004, h: 0.015, d: 0.045, v: 0.7 });
      s.crackle({ t, density: 700, filter: 'highpass', f: 5500, a: 0.003, d: 0.08, v: 0.3 });
    },
    death: (s, t, p) => {
      // a prickly burst, "ohh", and the flowerpot cracks
      s.crackle({ t, density: 1200, filter: 'highpass', f: 4800, a: 0.003, d: 0.2, v: 0.4 });
      voice(s, { t, f: [[0, 620 * p], [0.4, 300 * p]], vow: [[0, 'o'], [0.25, 'u']], size: 1.3, src: 'sawtooth', a: 0.01, h: 0.12, d: 0.26, v: 0.6, vib: [7, 40] });
      const at = t + 0.42;
      s.bell({ t: at, f: 1700 * p, ratio: 1.53, index: 1.4, d: 0.12, v: 0.3 });
      shards(s, at, 0.25, 0.4, 5);
      thud(s, at, 150, 0.6);
    },
    hello: (s, t, p) => {
      // jab-jab, "hah!"
      jab(s, t, 0.4, p);
      jab(s, t + 0.07, 0.45, p);
      voice(s, { t: t + 0.14, f: [[0, 560 * p], [0.04, 700 * p], [0.16, 640 * p]], vow: [[0, 'a'], [0.1, 'ae']], size: 1.3, src: 'sawtooth', h0: 0.02, a: 0.006, h: 0.06, d: 0.1, v: 0.75 });
      s.crackle({ t: t + 0.14, density: 500, filter: 'highpass', f: 6000, a: 0.01, d: 0.15, v: 0.25 });
    },
  },
  // a kid in a helmet on a pogo stick: boing-g-g
  pogo: {
    dur: [0.36, 0.26, 0.82],
    vol: [0.24, 0.2, 0.28],
    attack: (s, t, p) => {
      thud(s, t, 200, 0.3);
      sproing(s, t, 280 * p, 0.3, 0.6, 1.5, 24);
      voice(s, { t, f: [[0, 520 * p], [0.03, 640 * p], [0.09, 560 * p]], vow: [[0, 'u'], [0.05, 'uh']], size: 1.25, h0: 0.015, a: 0.006, h: 0.02, d: 0.06, v: 0.45 });
    },
    hurt: (s, t, p) => {
      // "whoa!"
      voice(s, { t, f: [[0, 440 * p], [0.06, 600 * p], [0.2, 420 * p]], vow: [[0, 'u'], [0.05, 'o'], [0.12, 'a']], size: 1.25, a: 0.008, h: 0.05, d: 0.12, v: 0.75 });
      sproing(s, t + 0.02, 420 * p, 0.16, 0.25, 1.2, 30);
    },
    death: (s, t, p) => {
      // "wooaaah", the spring twangs down, helmet and stick clatter
      voice(s, { t, f: [[0, 620 * p], [0.5, 240 * p]], vow: [[0, 'u'], [0.14, 'a'], [0.45, 'o']], size: 1.25, a: 0.012, h: 0.2, d: 0.26, v: 0.65, vib: [7, 50] });
      sproing(s, t + 0.05, 600 * p, 0.45, 0.3, 0.45, 20);
      wood(s, t + 0.55, 900, 0.4, 0.03);
      wood(s, t + 0.63, 760, 0.3, 0.03);
      thud(s, t + 0.55, 150, 0.6);
    },
    hello: (s, t, p) => {
      // "wheee!"
      sproing(s, t, 300 * p, 0.3, 0.45, 1.8, 24);
      voice(s, { t: t + 0.04, f: [[0, 700 * p], [0.08, 1000 * p], [0.25, 900 * p]], vow: [[0, 'u'], [0.04, 'i']], size: 1.25, h0: 0.02, a: 0.01, h: 0.12, d: 0.12, v: 0.7, vib: [7, 30] });
    },
  },
  // a round thorny rose bush with a grumpy face: a rustle, a grumble and a thorn prick
  briar: {
    dur: [0.24, 0.26, 0.88],
    vol: [0.24, 0.2, 0.28],
    attack: (s, t, p) => {
      rustle(s, t, 0.13, 0.7, 2200);
      voice(s, { t, f: [[0, 190 * p], [0.1, 165 * p]], vow: [[0, 'm'], [0.04, 'uh'], [0.09, 'm']], size: 0.95, h0: 0.014, a: 0.01, h: 0.03, d: 0.07, v: 0.65, rough: 0.5 });
      const pt = t + 0.08;
      s.tone({ t: pt, f: [[0, 5400], [0.012, 3800]], a: 0.0004, d: 0.016, v: 0.5 });
      click(s, pt, 7200, 0.4);
    },
    hurt: (s, t, p) => {
      // "grrr!"
      voice(s, { t, f: [[0, 230 * p], [0.15, 200 * p]], vow: [[0, 'uh'], [0.09, 'm']], size: 0.95, a: 0.01, h: 0.06, d: 0.09, v: 0.75, rough: 0.85 });
      rustle(s, t, 0.1, 0.35, 2400);
    },
    death: (s, t, p) => {
      // a big rustle, a sinking "hrrmmph...", petals drifting
      rustle(s, t, 0.45, 0.55, 2000);
      voice(s, { t, f: [[0, 260 * p], [0.55, 130 * p]], vow: [[0, 'uh'], [0.25, 'm']], size: 0.95, h0: 0.03, a: 0.02, h: 0.22, d: 0.3, v: 0.6, rough: 0.6 });
      for (const [i, f] of [3200, 2700, 2900].entries()) furin(s, t + 0.35 + i * 0.11, f * p, 0.3, 0.16 - i * 0.03);
    },
    hello: (s, t, p) => {
      // a grudging "hmph." and one rose bell
      voice(s, { t, f: [[0, 210 * p], [0.12, 175 * p]], vow: [[0, 'm'], [0.06, 'uh'], [0.1, 'm']], size: 0.95, h0: 0.03, a: 0.01, h: 0.05, d: 0.08, v: 0.6, rough: 0.4 });
      rustle(s, t, 0.12, 0.3, 2400);
      furin(s, t + 0.2, 2900, 0.4, 0.2);
    },
  },
  // a fisherman in a rain hat: a reel whirr and a plop
  angler: {
    dur: [0.3, 0.2, 0.95],
    vol: [0.24, 0.2, 0.28],
    attack: (s, t, p) => {
      whirr(s, t, 0.16, 0.5, 34 * p, 64 * p);
      const at = t + 0.17;
      s.tone({ t: at, f: [[0, 380 * p], [0.04, 1150 * p]], a: 0.002, d: 0.05, v: 0.6 });
      s.noise({ t: at, color: 'pink', filter: 'lowpass', f: [[0, 2200], [0.06, 400]], a: 0.002, d: 0.06, v: 0.3 });
    },
    hurt: (s, t, p) => {
      // "oi!"
      voice(s, { t, f: [[0, 190 * p], [0.05, 250 * p], [0.14, 215 * p]], vow: [[0, 'o'], [0.06, 'i']], size: 0.92, h0: 0.008, a: 0.006, h: 0.03, d: 0.08, v: 0.75 });
    },
    death: (s, t, p) => {
      // "whoaa", the reel spinning loose, a splash
      voice(s, { t, f: [[0, 230 * p], [0.42, 140 * p]], vow: [[0, 'o'], [0.1, 'a'], [0.35, 'o']], size: 0.92, a: 0.012, h: 0.15, d: 0.26, v: 0.6, vib: [5, 40] });
      whirr(s, t + 0.05, 0.3, 0.25, 60, 20);
      splash(s, t + 0.45, 0.55);
    },
    hello: (s, t, p) => {
      // reel in, "yeah!"
      whirr(s, t, 0.12, 0.35, 40, 70);
      voice(s, { t: t + 0.1, f: [[0, 200 * p], [0.05, 280 * p], [0.2, 250 * p]], vow: [[0, 'i'], [0.04, 'e'], [0.1, 'ae']], size: 0.92, a: 0.008, h: 0.08, d: 0.11, v: 0.75 });
    },
  },
  // a big sumo wrestler: a deep "hngh!" and a belly slap
  sumo: {
    dur: [0.26, 0.24, 1],
    vol: [0.3, 0.24, 0.34],
    attack: (s, t, p) => {
      voice(s, { t, f: [[0, 130 * p], [0.03, 160 * p], [0.14, 118 * p]], vow: [[0, 'uh'], [0.05, 'm']], size: 0.78, h0: 0.02, a: 0.008, h: 0.04, d: 0.09, v: 0.8, rough: 0.5 });
      slap(s, t + 0.05, 0.9, 1500 * p);
      thump(s, t + 0.05, 100, 0.12, 0.3);
    },
    hurt: (s, t, p) => {
      // "ooff!"
      voice(s, { t, f: [[0, 150 * p], [0.12, 108 * p]], vow: [[0, 'o'], [0.06, 'u']], size: 0.78, h0: 0.03, a: 0.008, h: 0.03, d: 0.1, v: 0.8, rough: 0.3 });
      slap(s, t, 0.35, 1200);
    },
    death: (s, t, p) => {
      // "hoooo...", the big body lands, the belly wobbles
      voice(s, { t, f: [[0, 175 * p], [0.6, 88 * p]], vow: [[0, 'o'], [0.4, 'u']], size: 0.78, h0: 0.04, a: 0.02, h: 0.3, d: 0.3, v: 0.7, vib: [5, 40], rough: 0.2 });
      const at = t + 0.62;
      thump(s, at, 70, 0.3, 0.5);
      slap(s, at, 0.8, 1100);
      s.noise({ t: at, color: 'pink', filter: 'bandpass', f: [[0, 900], [0.15, 300]], q: 0.8, a: 0.002, d: 0.18, v: 1 });
      s.tone({ t: at + 0.03, f: [[0, 130], [0.25, 80]], a: 0.004, d: 0.25, v: 0.35, vib: [9, 200] });
    },
    hello: (s, t, p) => {
      // "hoh!" and two proud belly slaps
      voice(s, { t, f: [[0, 140 * p], [0.05, 175 * p], [0.18, 150 * p]], vow: [[0, 'o'], [0.1, 'uh']], size: 0.78, h0: 0.03, a: 0.008, h: 0.06, d: 0.1, v: 0.8, rough: 0.25 });
      slap(s, t + 0.18, 0.6);
      slap(s, t + 0.3, 0.7, 1300);
    },
  },
  // a rhino in plated armour: a heavy snort and an armour clank
  rhino: {
    dur: [0.32, 0.22, 1.02],
    vol: [0.3, 0.24, 0.34],
    attack: (s, t, p) => {
      snort(s, t, 0.7, p);
      clank(s, t + 0.12, 0.8, 380 * p);
      thump(s, t + 0.12, 90, 0.14, 0.3);
    },
    hurt: (s, t, p) => {
      // a grunt, and the plates knock
      voice(s, { t, f: [[0, 110 * p], [0.1, 95 * p]], vow: [[0, 'uh'], [0.06, 'm']], size: 0.75, a: 0.006, h: 0.03, d: 0.08, v: 0.75, rough: 0.7 });
      clank(s, t + 0.01, 0.4, 470 * p);
    },
    death: (s, t, p) => {
      // a long groan, then the armour comes down in a heap
      voice(s, { t, f: [[0, 125 * p], [0.6, 70 * p]], vow: [[0, 'o'], [0.4, 'm']], size: 0.75, a: 0.03, h: 0.3, d: 0.3, v: 0.7, rough: 0.5 });
      for (const [i, dt] of [0.55, 0.66, 0.74, 0.8].entries()) clank(s, t + dt, 0.6 - i * 0.12, (520 - i * 40) * p);
      thump(s, t + 0.55, 65, 0.3, 0.45);
      s.noise({ t: t + 0.55, color: 'pink', filter: 'bandpass', f: [[0, 900], [0.15, 300]], q: 0.8, a: 0.002, d: 0.18, v: 0.8 });
    },
    hello: (s, t, p) => {
      // a snort and a proud shake of the armour
      snort(s, t, 0.6, p);
      clank(s, t + 0.16, 0.5, 400 * p);
      clank(s, t + 0.24, 0.4, 520 * p);
    },
  },
  // a mossy rock golem with a tiny flower on top: rock crunch and a deep rumble
  boulder: {
    dur: [0.34, 0.28, 1.16],
    vol: [0.32, 0.26, 0.36],
    attack: (s, t, p) => {
      // a stone fist: a hard knock, gravel, and the ground answering
      wood(s, t, 290 * p, 1, 0.07, 0.7);
      crunch(s, t, 0.14, 1.2);
      thump(s, t, 95 * p, 0.14, 0.3);
      rumble(s, t, 0.28, 0.35, 52 * p);
    },
    hurt: (s, t, p) => {
      // a crack, and a stony grumble
      s.noise({ t, filter: 'highpass', f: 2600, a: 0.0004, d: 0.014, v: 0.8 });
      crunch(s, t, 0.08, 0.9);
      wood(s, t, 360 * p, 0.6, 0.05, 0.5);
      voice(s, { t: t + 0.02, f: [[0, 95 * p], [0.15, 80 * p]], vow: [[0, 'o'], [0.08, 'm']], size: 0.7, a: 0.01, h: 0.04, d: 0.12, v: 0.7, rough: 0.6 });
    },
    death: (s, t, p) => {
      // it crumbles with a rumble, stones tumble, and the little flower lands last: ting
      crunch(s, t, 0.4, 1.2);
      wood(s, t, 250 * p, 0.9, 0.09, 0.8);
      rumble(s, t, 0.8, 0.45, 46 * p);
      for (let i = 0; i < 7; i++) wood(s, t + 0.08 + s.rand(0, 0.5), s.rand(260, 520), s.rand(0.3, 0.55), 0.05, 0.4);
      furin(s, t + 0.75, 3500 * p, 0.35, 0.22);
    },
    hello: (s, t, p) => {
      // a deep, content "hmmm" and the flower's ting
      voice(s, { t, f: [[0, 95 * p], [0.2, 105 * p], [0.3, 100 * p]], vow: [[0, 'o'], [0.1, 'm']], size: 0.7, a: 0.02, h: 0.15, d: 0.15, v: 0.8, rough: 0.3 });
      wood(s, t, 300, 0.4, 0.06, 0.6);
      furin(s, t + 0.2, 3500 * p, 0.4, 0.25);
    },
  },
};

/** The cast in rung order (rung 1 = sprout). */
export const LADDER: PetType[] = ['sprout', 'buzzy', 'ninja', 'snailor', 'roo', 'cacto', 'pogo', 'briar', 'angler', 'sumo', 'rhino', 'boulder'];

const KINDS = [
  ['Attack', 'attack', 0.07, 3],
  ['Hurt', 'hurt', 0.09, 2],
  ['Death', 'death', 0.07, 3],
] as const;

/** The 36 voice sounds, named `${pet}Attack`, `${pet}Hurt`, `${pet}Death`. */
export const CAST_SOUNDS = Object.fromEntries(
  LADDER.flatMap((pet) =>
    KINDS.map(([suffix, kind, gap, max], i): [PetVoiceName, SoundDef] => {
      const c = CAST[pet];
      const rec = c[kind];
      return [
        `${pet}${suffix}`,
        { dur: c.dur[i], vars: 4, vol: c.vol[i], cat: 'battle', verb: kind === 'death' ? 0.15 : 0.05, gap, max, jitter: 70, make: (s) => rec(s, 0, s.rand(0.93, 1.07)) },
      ];
    }),
  ),
) as Record<PetVoiceName, SoundDef>;

// ------------------------------------------------------------------ the traits

type TraitName = Extract<SoundName, 'poison' | 'dodge' | 'shellClose' | 'shellOpen' | 'thorns' | 'hookPull' | 'bellySlide' | 'chargeImpact' | 'leapLaunch' | 'leapLand' | 'doubleJab' | 'armourClank' | 'bossStomp'>;

export const TRAIT_SOUNDS: Record<TraitName, SoundDef> = {
  poison: {
    // a sickly little bubble going "blip-blip" with a hiss
    dur: 0.14, vars: 3, vol: 0.13, cat: 'battle', gap: 0.05, max: 3, jitter: 120,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      s.tone({ f: [[0, 420 * p], [0.035, 1000 * p]], a: 0.002, d: 0.045, v: 0.6 });
      s.tone({ t: 0.045, f: [[0, 600 * p], [0.03, 1300 * p]], a: 0.002, d: 0.035, v: 0.35 });
      s.noise({ filter: 'highpass', f: 5000, a: 0.01, d: 0.08, v: 0.12 });
    },
  },
  dodge: {
    // fwip: a hit whiffs past, and a tiny "zip" as it steps aside
    dur: 0.2, vars: 3, vol: 0.2, cat: 'battle', gap: 0.05, max: 3, jitter: 100,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 4200 * p], [0.1, 1100 * p]], q: 1.8, a: 0.015, d: 0.09, v: 0.8 });
      s.tone({ f: [[0, 900 * p], [0.08, 2400 * p]], a: 0.01, d: 0.06, v: 0.12 });
    },
  },
  shellClose: {
    // in it goes: a suck of air, a hollow clack, a "thup"
    dur: 0.36, vol: 0.32, cat: 'battle', verb: 0.1, gap: 0.2, max: 2,
    make: (s) => {
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 2500], [0.08, 600]], q: 1.5, a: 0.02, d: 0.06, v: 0.5 });
      wood(s, 0.08, 520, 0.8, 0.06, 0.8);
      thud(s, 0.08, 160, 0.6);
      s.tone({ t: 0.08, f: [[0, 400], [0.1, 250]], a: 0.002, d: 0.1, v: 0.3 });
    },
  },
  shellOpen: {
    // out it pops: a creak, then a "bip"
    dur: 0.34, vol: 0.28, cat: 'battle', verb: 0.1, gap: 0.2, max: 2,
    make: (s) => {
      s.tone({ type: 'sawtooth', f: [[0, 120], [0.12, 170]], lp: 1200, q: 4, a: 0.01, d: 0.12, v: 0.3, vib: [40, 60] });
      s.tone({ t: 0.13, f: [[0, 350], [0.04, 900]], a: 0.002, d: 0.06, v: 0.6 });
      wood(s, 0.13, 700, 0.4, 0.03);
    },
  },
  thorns: {
    // the attacker gets pricked: a needle-thin "tsik" and a tiny "ow"
    dur: 0.14, vars: 3, vol: 0.18, cat: 'battle', gap: 0.06, max: 3, jitter: 80,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      s.tone({ f: [[0, 5200 * p], [0.012, 3600 * p]], a: 0.0004, d: 0.018, v: 0.6 });
      click(s, 0, 7500, 0.5);
      s.crackle({ density: 800, filter: 'highpass', f: 5000, a: 0.002, d: 0.05, v: 0.3 });
      squeak(s, 0.02, 1700 * p, 0.06, 0.18);
    },
  },
  hookPull: {
    // the reel winds in fast, the line zips, a tug
    dur: 0.42, vars: 2, vol: 0.3, cat: 'battle', gap: 0.1, max: 2, jitter: 50,
    make: (s) => {
      whirr(s, 0, 0.28, 0.5, 40, 75);
      s.tone({ f: [[0, 600], [0.28, 1800]], a: 0.02, h: 0.18, d: 0.08, v: 0.1 });
      thump(s, 0.28, 140, 0.1, 0.6);
      s.noise({ t: 0.28, filter: 'bandpass', f: 900, q: 1.2, a: 0.001, d: 0.04, v: 0.4 });
    },
  },
  bellySlide: {
    // a big belly squeaking across the grass with a rush of air
    dur: 0.75, vars: 2, vol: 0.3, cat: 'battle', verb: 0.1, gap: 0.3, max: 2, jitter: 60,
    make: (s) => {
      const p = s.rand(0.92, 1.08);
      slap(s, 0, 0.6);
      s.tone({ type: 'sawtooth', f: [[0, 700 * p], [0.5, 520 * p]], lp: 2400, q: 6, a: 0.02, h: 0.35, d: 0.2, v: 0.22, vib: [17, 90] });
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 400], [0.3, 900], [0.6, 500]], q: 1, a: 0.04, h: 0.35, d: 0.25, v: 0.6 });
    },
  },
  chargeImpact: {
    // the charged strike lands: a rush, a huge thump, plates ringing, grit
    dur: 0.6, vars: 3, vol: 0.55, cat: 'battle', verb: 0.12, gap: 0.08, max: 2, jitter: 60, duck: 0.15,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      whoosh(s, 0, 300, 1500, 600, 0.08, 0.5);
      const t = 0.06;
      click(s, t, 3000, 1);
      thump(s, t, 85 * p, 0.22, 0.6);
      s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 1500], [0.06, 450]], q: 0.8, a: 0.0008, d: 0.09, v: 1 });
      clank(s, t, 0.7, 330 * p);
      crunch(s, t, 0.12, 0.4);
      s.noise({ t, color: 'brown', filter: 'lowpass', f: 300, a: 0.005, d: 0.3, v: 0.5 });
    },
  },
  leapLaunch: {
    // the pogo stick fires off: a big sproing and a rush up into the air
    dur: 0.46, vars: 2, vol: 0.3, cat: 'battle', verb: 0.15, gap: 0.08, max: 2, jitter: 60,
    make: (s) => {
      const p = s.rand(0.92, 1.08);
      thud(s, 0, 180, 0.5);
      sproing(s, 0, 240 * p, 0.32, 0.55, 2.2, 26);
      whoosh(s, 0.04, 500, 2500, 5000, 0.3, 0.4);
    },
  },
  leapLand: {
    // and lands on the back line: a heavy thump, the stick hitting the ground, dust
    dur: 0.4, vars: 2, vol: 0.46, cat: 'battle', verb: 0.1, gap: 0.08, max: 2, jitter: 60,
    make: (s) => {
      const p = s.rand(0.92, 1.08);
      thump(s, 0, 110 * p, 0.16, 0.6);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1400], [0.12, 400]], q: 0.8, a: 0.001, d: 0.14, v: 1 });
      crunch(s, 0.005, 0.08, 0.3);
      wood(s, 0.01, 500 * p, 0.4, 0.05, 0.5);
    },
  },
  doubleJab: {
    // pap-pap
    dur: 0.22, vars: 3, vol: 0.3, cat: 'battle', gap: 0.06, max: 3, jitter: 80,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      glove(s, 0, 0.7, 180 * p);
      glove(s, 0.075, 0.85, 165 * p);
    },
  },
  armourClank: {
    // a hit glances off armour
    dur: 0.28, vars: 3, vol: 0.26, cat: 'battle', verb: 0.08, gap: 0.06, max: 3, jitter: 80,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      clank(s, 0, 0.9, 300 * p);
      s.crackle({ density: 600, filter: 'lowpass', f: 2500, a: 0.001, d: 0.05, v: 0.3 });
    },
  },
  bossStomp: {
    // the ground shakes: a huge boom, a rumble, gravel and bits flying
    dur: 1.1, vars: 2, vol: 0.8, cat: 'battle', verb: 0.2, gap: 0.25, max: 2, jitter: 40, duck: 0.3,
    make: (s) => {
      drum(s, 0, 48, 0.6, 0.25, 2.5);
      thump(s, 0, 60, 0.4, 0.35);
      wood(s, 0, 210, 1, 0.12, 0.9);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 700], [0.25, 280]], q: 0.8, a: 0.001, d: 0.3, v: 1 });
      rumble(s, 0, 0.9, 0.6, 40);
      crunch(s, 0, 0.25, 0.9);
      s.crackle({ t: 0.08, density: 120, filter: 'bandpass', f: 1800, a: 0.01, d: 0.6, v: 0.35 });
      for (let i = 0; i < 4; i++) wood(s, 0.15 + s.rand(0, 0.45), s.rand(300, 700), s.rand(0.15, 0.3), 0.04, 0.4);
    },
  },
};
