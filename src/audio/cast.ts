import type { PetType } from '../types';
import type { PetVoiceName, SoundDef, SoundName } from './names';
import {
  boing,
  bubbles,
  chomp,
  clank,
  click,
  creak,
  crunch,
  eggshell,
  flicker,
  fwoomp,
  glove,
  glug,
  gourd,
  jelly,
  owl,
  pencils,
  peep,
  poof,
  rumble,
  rustle,
  scribble,
  scuttle,
  servo,
  shards,
  skates,
  slap,
  slosh,
  splash,
  sproing,
  squeak,
  squelch,
  thud,
  thump,
  tin,
  tumble,
  twang,
  voice,
  wheels,
  wheeze,
  wood,
  type Vowel,
} from './kit';
import { drum, whoosh, type Synth } from './synth';

/*
 * The twelve characters' voices (docs/v5.md section 1): each one has an attack, a hurt and a death sound that are
 * clearly that character, and a happy hello the roll and the evolve play when it appears. Roo and Cacto are kept
 * from v4; the other ten are v5's weird ones, and each sounds like its strange twist: Chick's eggshell, Scorp's
 * gas mask and flask, Shroom's spring and jelly cap, Tulip's crab legs and metal petals, Dandy's fishbowl on
 * wheels, Spike's pencil quills, Snapper's tin can on skates, Pumpkin's candle, Bamboo's three bickering faces
 * and Oak's creaking trunk and sleepy owl. Voice-like chirps and grunts come from kit.voice (a buzz through vowel
 * formants with pitch glides), never words.
 *
 * Heard dozens of times a fight, so: short tails, four variants each (every variant draws its own pitch), and a
 * gap and a cap per sound so a 20-a-second brawl stays clean. The enemy's are pitched a little deeper by the
 * engine. The internal ids stay (sprout = Chick, buzzy = Scorp, ninja = Shroom, snailor = Tulip, pogo = Dandy,
 * briar = Spike, angler = Snapper, sumo = Pumpkin, rhino = Bamboo, boulder = Oak).
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

/** Bamboo's three segments talking over each other: three short voices, high, middle and low. */
function bamboo3(s: Synth, t: number, p: number, vows: [Vowel, Vowel, Vowel], step: number, v: number) {
  [700, 520, 380].forEach((f, i) =>
    voice(s, { t: t + i * step + s.rand(0, 0.015), f: [[0, f * p], [0.03, f * 1.2 * p], [0.09, f * 0.95 * p]], vow: [[0, vows[i]], [0.04, 'uh']], size: 1.5 - i * 0.25, h0: 0.01, a: 0.004, h: 0.02, d: 0.06, v: v * (1 - i * 0.1) }),
  );
}

/** "ptoo!": lips popping, a short wet "too" (Scorp spitting its glob). */
function ptoo(s: Synth, t: number, p: number, v: number) {
  s.tone({ t, f: [[0, 220], [0.02, 90]], a: 0.0005, d: 0.03, v: v * 0.6 });
  s.noise({ t, filter: 'bandpass', f: 1300, q: 1.2, a: 0.0004, d: 0.018, v: v * 0.7 });
  voice(s, { t: t + 0.012, f: [[0, 560 * p], [0.07, 400 * p]], vow: [[0, 'u'], [0.04, 'o']], size: 1.35, a: 0.004, h: 0.02, d: 0.05, v: v * 0.55, breath: 0.35 });
  squelch(s, t + 0.01, 0.06, v * 0.3);
}

export const CAST: Record<PetType, Character> = {
  // Chick: a tiny chick still half inside its cracked eggshell (the shell is its shorts), in huge boxing gloves.
  // A tiny fierce peep on every punch; the eggshell crackles when it is hit.
  sprout: {
    dur: [0.22, 0.2, 0.72],
    vol: [0.22, 0.2, 0.27],
    attack: (s, t, p) => {
      // the big glove (bigger than the chick) and a fierce little "pip!"
      glove(s, t, 0.85, 165 * p);
      peep(s, t + 0.012, 2600 * p, 0.075, 0.55, 0.7);
      eggshell(s, t + 0.02, 0.04, 0.18);
    },
    hurt: (s, t, p) => {
      // "cheep!" and the shell crackles
      peep(s, t, 3100 * p, 0.1, 0.85, 0.3);
      eggshell(s, t, 0.08, 0.5);
    },
    death: (s, t, p) => {
      // a long falling "piiii-yuu", the shell cracks apart, a tiny bounce
      s.tone({ t, f: [[0, 3200 * p], [0.05, 3900 * p], [0.45, 1400 * p]], a: 0.004, h: 0.15, d: 0.3, v: 0.6, vib: [11, 60] });
      voice(s, { t, f: [[0, 1100 * p], [0.05, 1300 * p], [0.45, 480 * p]], vow: [[0, 'i'], [0.3, 'u']], size: 1.9, a: 0.006, h: 0.15, d: 0.28, v: 0.3, rough: 0.3 });
      eggshell(s, t + 0.42, 0.18, 0.9);
      s.tone({ t: t + 0.42, f: [[0, 2400], [0.02, 1500]], a: 0.0005, d: 0.03, v: 0.2 });
      thud(s, t + 0.44, 260 * p, 0.4);
      thud(s, t + 0.56, 300 * p, 0.2);
    },
    hello: (s, t, p) => {
      // the gloves pat together, "peep-peep!"
      glove(s, t, 0.35, 180);
      peep(s, t + 0.06, 2800 * p, 0.08, 0.7, 0.3);
      peep(s, t + 0.17, 3300 * p, 0.12, 0.8, 0.3);
      eggshell(s, t + 0.06, 0.06, 0.25);
    },
  },
  // Scorp: a scorpion in a gas mask whose tail ends in a bubbling chemistry flask. It wheezes, the flask goes
  // glug-glug, and it lobs the glob with a wet "ptoo!" (the sizzling splat where it lands is globSplat).
  buzzy: {
    dur: [0.46, 0.26, 0.95],
    vol: [0.22, 0.2, 0.28],
    attack: (s, t, p) => {
      wheeze(s, t, 0.12, 0.45, true);
      glug(s, t + 0.06, 2, 0.45, 240 * p);
      ptoo(s, t + 0.21, p, 1);
      // the glob arcs away
      s.tone({ t: t + 0.26, f: [[0, 900 * p], [0.08, 1350 * p], [0.18, 700 * p]], a: 0.02, d: 0.16, v: 0.07 });
    },
    hurt: (s, t, p) => {
      // a muffled "hmf!" inside the mask, the valve puffs, the flask clinks
      voice(s, { t, f: [[0, 330 * p], [0.1, 250 * p]], vow: [[0, 'uh'], [0.04, 'm']], size: 1.15, a: 0.004, h: 0.02, d: 0.08, v: 0.7, rough: 0.4 });
      wheeze(s, t + 0.04, 0.12, 0.35, false);
      s.bell({ t: t + 0.01, f: 2400 * p, ratio: 2.4, index: 0.9, d: 0.12, v: 0.25 });
    },
    death: (s, t, p) => {
      // the mask wheezes out like a deflating balloon, the flask shatters, glug-glug, it fizzes away
      wheeze(s, t, 0.45, 0.6, false);
      voice(s, { t, f: [[0, 420 * p], [0.45, 200 * p]], vow: [[0, 'u'], [0.3, 'm']], size: 1.15, a: 0.02, h: 0.15, d: 0.28, v: 0.45, vib: [7, 60] });
      const at = t + 0.45;
      shards(s, at, 0.25, 0.5, 6);
      glug(s, at + 0.04, 3, 0.4, 220 * p);
      s.crackle({ t: at + 0.05, density: 1200, filter: 'highpass', f: 4500, a: 0.02, d: 0.35, v: 0.3 });
      bubbles(s, at + 0.1, 0.3, 5, 0.25, 900, 1900);
    },
    hello: (s, t, p) => {
      // a wheeze, the flask bubbling, a muffled "heh-heh"
      wheeze(s, t, 0.14, 0.4, true);
      bubbles(s, t + 0.05, 0.25, 5, 0.3);
      for (const dt of [0.18, 0.3]) voice(s, { t: t + dt, f: [[0, 380 * p], [0.07, 330 * p]], vow: [[0, 'e'], [0.04, 'uh']], size: 1.15, h0: 0.02, a: 0.004, h: 0.02, d: 0.05, v: 0.55 });
    },
  },
  // Shroom: a toadstool with a wobbly jelly cap and sunglasses, hopping on one big spring-loaded sneaker.
  // Every move is a BOING, every hit makes the cap wobble; cool and unbothered.
  ninja: {
    dur: [0.36, 0.28, 0.9],
    vol: [0.24, 0.2, 0.28],
    attack: (s, t, p) => {
      // BOING in, and the jelly cap bonks the foe
      sproing(s, t, 150 * p, 0.3, 0.55, 2.2, 21);
      thud(s, t, 210, 0.35);
      jelly(s, t + 0.1, 230 * p, 0.22, 0.55, 12);
      slap(s, t + 0.1, 0.35, 1100);
    },
    hurt: (s, t, p) => {
      // the cap goes blblblbl, a cool "whoa"
      jelly(s, t, 300 * p, 0.22, 0.75, 14);
      voice(s, { t: t + 0.02, f: [[0, 260 * p], [0.12, 220 * p]], vow: [[0, 'o'], [0.06, 'a']], size: 1.05, h0: 0.02, a: 0.008, h: 0.03, d: 0.08, v: 0.45 });
    },
    death: (s, t, p) => {
      // the spring gives out (boi-oi-oing, down), a laid-back "duuude...", the cap splats, spores puff
      sproing(s, t, 420 * p, 0.5, 0.5, 0.35, 18);
      voice(s, { t: t + 0.05, f: [[0, 250 * p], [0.45, 150 * p]], vow: [[0, 'u'], [0.3, 'uh']], size: 1.05, h0: 0.02, a: 0.02, h: 0.18, d: 0.25, v: 0.5, vib: [5, 25] });
      const at = t + 0.55;
      squelch(s, at, 0.14, 0.6);
      jelly(s, at, 180, 0.25, 0.5, 9);
      poof(s, at + 0.04, 0.3, 0.45);
    },
    hello: (s, t, p) => {
      // boing, boing, a cool "yeahh"
      sproing(s, t, 200 * p, 0.2, 0.4, 1.8, 22);
      sproing(s, t + 0.18, 240 * p, 0.2, 0.35, 1.8, 22);
      voice(s, { t: t + 0.3, f: [[0, 230 * p], [0.08, 270 * p], [0.25, 240 * p]], vow: [[0, 'i'], [0.05, 'e'], [0.12, 'ae']], size: 1.05, a: 0.01, h: 0.1, d: 0.14, v: 0.6, vib: [5, 20] });
    },
  },
  // Tulip: a tulip in a flowerpot walking on little mechanical crab legs; its petals are metal plates.
  // Clicky legs, a servo whine, petals that clank like armour (the armoured bud is shellClose / shellOpen).
  snailor: {
    dur: [0.3, 0.24, 1.02],
    vol: [0.22, 0.2, 0.28],
    attack: (s, t, p) => {
      // tik-tik-tik-tik in, a whirr, and a metal petal swats
      scuttle(s, t, 4, 0.028, 0.5, 3300 * p);
      servo(s, t + 0.02, 0.1, 0.12, 600 * p, 1100 * p);
      s.noise({ t: t + 0.11, color: 'pink', filter: 'bandpass', f: [[0, 1500], [0.03, 4500]], q: 2, a: 0.02, d: 0.02, v: 0.25 });
      clank(s, t + 0.13, 0.75, 560 * p);
    },
    hurt: (s, t, p) => {
      // the plates rattle, the servo glitches ("bzzt"), a tiny "ow!"
      clank(s, t, 0.5, 640 * p);
      s.tone({ t: t + 0.02, type: 'square', f: [[0, 900 * p], [0.03, 1400 * p], [0.06, 700 * p]], lp: 2600, a: 0.003, d: 0.06, v: 0.12 });
      voice(s, { t: t + 0.03, f: [[0, 800 * p], [0.08, 620 * p]], vow: [[0, 'a'], [0.04, 'u']], size: 1.4, a: 0.004, h: 0.02, d: 0.06, v: 0.45 });
    },
    death: (s, t, p) => {
      // the motor winds down, the legs give way one by one, the petals clang down, the pot cracks
      servo(s, t, 0.45, 0.22, 1000 * p, 180 * p);
      voice(s, { t: t + 0.02, f: [[0, 760 * p], [0.4, 380 * p]], vow: [[0, 'o'], [0.25, 'u']], size: 1.4, a: 0.01, h: 0.12, d: 0.25, v: 0.35, vib: [6, 40] });
      scuttle(s, t + 0.2, 4, 0.07, 0.4, 2600 * p);
      for (const [i, dt] of [0.5, 0.58, 0.64].entries()) clank(s, t + dt, 0.55 - i * 0.12, (480 + i * 70) * p);
      wood(s, t + 0.62, 420, 0.5, 0.06, 0.7);
      shards(s, t + 0.62, 0.2, 0.3, 4);
    },
    hello: (s, t, p) => {
      // a happy scuttle, the motor spins up, the petals spread with a bright ring
      scuttle(s, t, 6, 0.03, 0.45, 3400 * p);
      servo(s, t + 0.1, 0.14, 0.16, 500 * p, 1200 * p);
      s.bell({ t: t + 0.26, f: 1760 * p, ratio: 2.76, index: 1.2, d: 0.35, v: 0.35 });
      s.bell({ t: t + 0.3, f: 2350 * p, ratio: 1.41, index: 0.8, d: 0.3, v: 0.25 });
    },
  },
  // Roo (kept from v4): a kangaroo in boxing gloves: a glove thump and a boing
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
  // Cacto (kept from v4): a potted cactus with two boxing arms: a quick double jab and a prickly crackle
  cacto: {
    dur: [0.27, 0.2, 0.86],
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
  // Dandy: a dandelion living in a round fishbowl aquarium mounted on two squeaky wheels. Water sloshes, bubbles
  // rise, the wheels squeak; for its leap the seed-puff opens like a parachute (leapLaunch / leapLand).
  pogo: {
    dur: [0.37, 0.26, 1.05],
    vol: [0.24, 0.2, 0.28],
    attack: (s, t, p) => {
      // squeak-squeak, rolling in, and the bowl bumps the foe: a glassy bonk and a slosh
      wheels(s, t, 3, 0.05, 0.25, 2700 * p);
      const at = t + 0.14;
      s.tone({ t: at, f: [[0, 780 * p], [0.08, 740 * p]], a: 0.0008, d: 0.12, v: 0.4 });
      s.tone({ t: at, f: 1850 * p, a: 0.0006, d: 0.06, v: 0.15 });
      thud(s, at, 200, 0.45);
      slosh(s, at, 0.16, 0.55);
      bubbles(s, at + 0.04, 0.12, 2, 0.2);
    },
    hurt: (s, t, p) => {
      // the glass tinks, the water sloshes, a bubbly little "blub!"
      s.bell({ t, f: 2100 * p, ratio: 2.3, index: 0.8, d: 0.12, v: 0.35 });
      slosh(s, t, 0.14, 0.45);
      voice(s, { t: t + 0.02, f: [[0, 600 * p], [0.1, 460 * p]], vow: [[0, 'u'], [0.05, 'uh']], size: 1.35, a: 0.005, h: 0.03, d: 0.07, v: 0.5, vib: [26, 90] });
    },
    death: (s, t, p) => {
      // the wheels squeal, the bowl tips over: a big slosh, a glass clunk, glug-glug, bubbles, the seeds blow away
      wheels(s, t, 5, 0.04, 0.3, 3000 * p);
      voice(s, { t: t + 0.05, f: [[0, 640 * p], [0.45, 280 * p]], vow: [[0, 'u'], [0.3, 'o']], size: 1.35, a: 0.01, h: 0.15, d: 0.25, v: 0.4, vib: [20, 100] });
      const at = t + 0.3;
      thud(s, at, 160, 0.6);
      s.tone({ t: at, f: [[0, 700 * p], [0.1, 640 * p]], a: 0.0008, d: 0.18, v: 0.35 });
      splash(s, at, 0.55);
      glug(s, at + 0.08, 3, 0.35, 250 * p);
      bubbles(s, at + 0.15, 0.4, 5, 0.25);
      fwoomp(s, at + 0.25, 0.25);
    },
    hello: (s, t, p) => {
      // squeaky wheels, a slosh, a bubbly "wheee!"
      wheels(s, t, 4, 0.045, 0.25, 2800 * p);
      slosh(s, t + 0.1, 0.18, 0.35);
      voice(s, { t: t + 0.16, f: [[0, 700 * p], [0.08, 950 * p], [0.26, 880 * p]], vow: [[0, 'u'], [0.04, 'i']], size: 1.35, h0: 0.015, a: 0.01, h: 0.12, d: 0.12, v: 0.6, vib: [18, 60] });
      bubbles(s, t + 0.2, 0.25, 4, 0.2);
    },
  },
  // Spike: a porcupine wrestler in a luchador mask whose quills are sharpened coloured pencils. Prickly grunts,
  // a pencil scratch on every move, the pencils rattling when it is hit (and jabbing back: thorns).
  briar: {
    dur: [0.28, 0.24, 0.95],
    vol: [0.25, 0.2, 0.28],
    attack: (s, t, p) => {
      // "hrah!", a wrestler's slap, the quills scratch
      voice(s, { t, f: [[0, 200 * p], [0.04, 250 * p], [0.13, 190 * p]], vow: [[0, 'uh'], [0.04, 'a']], size: 0.95, h0: 0.02, a: 0.008, h: 0.03, d: 0.08, v: 0.65, rough: 0.6 });
      slap(s, t + 0.06, 0.6, 1500 * p);
      scribble(s, t + 0.05, 0.14, 0.35, 2);
    },
    hurt: (s, t, p) => {
      // "grrk!" and the pencils rattle
      voice(s, { t, f: [[0, 240 * p], [0.12, 200 * p]], vow: [[0, 'uh'], [0.07, 'm']], size: 0.95, a: 0.006, h: 0.04, d: 0.08, v: 0.7, rough: 0.85 });
      pencils(s, t, 0.12, 5, 0.35);
    },
    death: (s, t, p) => {
      // a dramatic luchador "nooo...", the pencils scatter everywhere, a wrestler's flop
      voice(s, { t, f: [[0, 280 * p], [0.08, 300 * p], [0.6, 150 * p]], vow: [[0, 'u'], [0.12, 'o']], size: 0.95, h0: 0.02, a: 0.02, h: 0.25, d: 0.3, v: 0.6, vib: [6, 45], rough: 0.3 });
      scribble(s, t + 0.05, 0.3, 0.25, 3);
      pencils(s, t + 0.5, 0.35, 10, 0.4);
      thud(s, t + 0.55, 130, 0.7);
      slap(s, t + 0.55, 0.4, 1100);
    },
    hello: (s, t, p) => {
      // a proud "HAH!", a flourish of pencils
      voice(s, { t, f: [[0, 220 * p], [0.05, 290 * p], [0.2, 250 * p]], vow: [[0, 'a'], [0.12, 'ae']], size: 0.95, h0: 0.03, a: 0.008, h: 0.08, d: 0.1, v: 0.75, rough: 0.3 });
      scribble(s, t + 0.18, 0.18, 0.3, 3);
      pencils(s, t + 0.2, 0.2, 5, 0.3);
    },
  },
  // Snapper: a Venus flytrap growing out of a rusty tin can on roller skates, with a vine that stretches far.
  // The skates whirr, the can clanks, the jaws SNAP; the vine's stretch and twang is hookPull.
  angler: {
    dur: [0.32, 0.22, 1.05],
    vol: [0.25, 0.2, 0.28],
    attack: (s, t, p) => {
      skates(s, t, 0.13, 0.35, 330 * p);
      tin(s, t + 0.1, 0.4, 820 * p);
      chomp(s, t + 0.13, 0.9, p);
    },
    hurt: (s, t, p) => {
      // the can clonks, a gurgly "ack!"
      tin(s, t, 0.7, 700 * p);
      voice(s, { t: t + 0.01, f: [[0, 360 * p], [0.1, 280 * p]], vow: [[0, 'ae'], [0.05, 'uh']], size: 1.1, a: 0.004, h: 0.02, d: 0.08, v: 0.6, rough: 0.5 });
    },
    death: (s, t, p) => {
      // a choked "glrrk", the jaws snap shut, the can tumbles over and over, the skates roll away
      voice(s, { t, f: [[0, 400 * p], [0.35, 200 * p]], vow: [[0, 'a'], [0.15, 'uh'], [0.3, 'm']], size: 1.1, a: 0.01, h: 0.12, d: 0.22, v: 0.5, rough: 0.8 });
      chomp(s, t + 0.3, 0.5, 0.85);
      for (const [i, dt] of [0.42, 0.55, 0.66, 0.74].entries()) tin(s, t + dt, 0.6 - i * 0.12, (760 - i * 40) * p);
      skates(s, t + 0.45, 0.5, 0.25, 420, 180);
    },
    hello: (s, t, p) => {
      // chomp-chomp, a skate twirl, a gurgly giggle
      chomp(s, t, 0.6, p);
      chomp(s, t + 0.12, 0.7, p * 1.08);
      skates(s, t + 0.2, 0.2, 0.25, 360, 520);
      voice(s, { t: t + 0.24, f: [[0, 380 * p], [0.08, 450 * p], [0.18, 400 * p]], vow: [[0, 'e'], [0.08, 'i']], size: 1.1, a: 0.008, h: 0.05, d: 0.09, v: 0.5, rough: 0.4, vib: [9, 60] });
    },
  },
  // Pumpkin: a carved jack-o'-lantern with a candle glowing in its grin and a tiny top hat. Hollow thunks, a
  // fluttering candle, a deep jolly "ho"; it rolls through the lines like a bowling ball (bellySlide).
  sumo: {
    dur: [0.28, 0.26, 1.05],
    vol: [0.3, 0.24, 0.32],
    attack: (s, t, p) => {
      // "HO!" and a heavy hollow head-butt
      voice(s, { t, f: [[0, 150 * p], [0.03, 175 * p], [0.12, 140 * p]], vow: [[0, 'o'], [0.06, 'u']], size: 0.82, h0: 0.025, a: 0.008, h: 0.03, d: 0.08, v: 0.65 });
      gourd(s, t + 0.05, 150 * p, 0.9);
      thump(s, t + 0.05, 95, 0.12, 0.3);
      flicker(s, t + 0.06, 0.14, 0.2);
    },
    hurt: (s, t, p) => {
      // a hollow knock, "oho!", the candle flutters
      gourd(s, t, 175 * p, 0.7);
      voice(s, { t: t + 0.02, f: [[0, 170 * p], [0.06, 210 * p], [0.15, 160 * p]], vow: [[0, 'o'], [0.08, 'u']], size: 0.82, h0: 0.02, a: 0.006, h: 0.03, d: 0.08, v: 0.6 });
      flicker(s, t, 0.18, 0.35);
    },
    death: (s, t, p) => {
      // "ohhh...", the pumpkin cracks open with a squelch, the candle blows out (fff... pff), the hat flops down
      voice(s, { t, f: [[0, 180 * p], [0.5, 100 * p]], vow: [[0, 'o'], [0.35, 'u']], size: 0.82, h0: 0.03, a: 0.02, h: 0.2, d: 0.3, v: 0.55, vib: [5, 30] });
      const at = t + 0.45;
      gourd(s, at, 130, 1);
      crunch(s, at, 0.1, 0.5);
      squelch(s, at + 0.02, 0.18, 0.6);
      s.noise({ t: at + 0.2, filter: 'bandpass', f: [[0, 1800], [0.2, 900]], q: 0.9, a: 0.03, d: 0.18, v: 0.35 });
      poof(s, at + 0.4, 0.15, 0.2);
      thud(s, at + 0.48, 320, 0.25);
      wood(s, at + 0.5, 640, 0.15, 0.03);
    },
    hello: (s, t, p) => {
      // a jolly "ho-ho-ho", the candle flickers, a pat on the pumpkin
      for (const [i, dt] of [0, 0.13, 0.26].entries()) voice(s, { t: t + dt, f: [[0, (150 + i * 12) * p], [0.08, (135 + i * 12) * p]], vow: [[0, 'o'], [0.05, 'u']], size: 0.82, h0: 0.03, a: 0.006, h: 0.03, d: 0.06, v: 0.6 });
      flicker(s, t + 0.1, 0.4, 0.25);
      gourd(s, t + 0.4, 160, 0.5);
    },
  },
  // Bamboo: a stack of three bamboo segments with a face on each (they bicker), in a kung-fu headband, with a
  // staff. Hollow "tok"s, a sharp "hyah!", three little voices; the dashing strike is chargeImpact.
  rhino: {
    dur: [0.28, 0.3, 1.05],
    vol: [0.28, 0.22, 0.3],
    attack: (s, t, p) => {
      // the staff whips round, TOK, "hyah!"
      s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 900 * p], [0.07, 3600 * p]], q: 2, a: 0.04, d: 0.03, v: 0.45 });
      voice(s, { t: t + 0.04, f: [[0, 430 * p], [0.03, 560 * p], [0.12, 440 * p]], vow: [[0, 'e'], [0.03, 'a']], size: 1.2, h0: 0.02, a: 0.005, h: 0.03, d: 0.07, v: 0.6, breath: 0.08 });
      wood(s, t + 0.07, 520 * p, 1, 0.06, 0.9);
      thump(s, t + 0.07, 140, 0.08, 0.3);
    },
    hurt: (s, t, p) => {
      // three voices at once ("ow!" "hey!" "oi!") and the segments knock together
      bamboo3(s, t, p, ['u', 'e', 'i'], 0.07, 0.55);
      wood(s, t, 600 * p, 0.6, 0.05, 0.8);
      wood(s, t + 0.06, 480 * p, 0.4, 0.05, 0.8);
    },
    death: (s, t, p) => {
      // the stack topples: tok, tok, tok, each segment lower, all three wailing "aaah" together
      for (const [i, f] of [640, 520, 400].entries()) voice(s, { t: t + i * 0.03, f: [[0, f * p], [0.55, f * 0.55 * p]], vow: [[0, 'a'], [0.4, 'u']], size: 1.5 - i * 0.25, a: 0.02, h: 0.2, d: 0.3, v: 0.32, vib: [6, 40] });
      for (const [i, dt] of [0.5, 0.64, 0.76].entries()) wood(s, t + dt, (560 - i * 90) * p, 0.8 - i * 0.15, 0.07, 0.9);
      thud(s, t + 0.64, 150, 0.4);
      wood(s, t + 0.85, 900, 0.3, 0.03);
    },
    hello: (s, t, p) => {
      // they bicker ("hm?" "heh!" "oi!"), then agree: tok-tok, "HYAH!"
      bamboo3(s, t, p, ['m', 'e', 'o'], 0.09, 0.5);
      wood(s, t + 0.32, 560, 0.6, 0.05, 0.9);
      wood(s, t + 0.4, 560, 0.7, 0.05, 0.9);
      for (const [i, sz] of [1.5, 1.25, 1].entries()) voice(s, { t: t + 0.48, f: [[0, (520 - i * 90) * p], [0.04, (660 - i * 110) * p], [0.18, (560 - i * 95) * p]], vow: [[0, 'e'], [0.03, 'a']], size: sz, h0: 0.02, a: 0.005, h: 0.06, d: 0.1, v: 0.35 });
    },
  },
  // Oak: an ancient oak giant with a birdhouse in its chest (a sleepy owl peeks out), mushroom shoulder pads and
  // root fists. Deep creaking groans, root thuds, and now and then the owl's sleepy "hoo?".
  boulder: {
    dur: [0.42, 0.5, 1.3],
    vol: [0.32, 0.26, 0.36],
    attack: (s, t, p) => {
      // the trunk creaks as it swings, the root fist lands: a deep thud, soil and grit
      creak(s, t, 0.16, 0.45, 55 * p);
      const at = t + 0.12;
      wood(s, at, 230 * p, 1, 0.08, 0.9);
      thump(s, at, 80 * p, 0.16, 0.4);
      thud(s, at, 120, 0.6);
      crunch(s, at, 0.1, 0.5);
      rumble(s, at, 0.24, 0.3, 48 * p);
    },
    hurt: (s, t, p) => {
      // a bark knock, a low groan; in half the variants the owl wakes up: "hoo?"
      wood(s, t, 300 * p, 0.8, 0.07, 0.8);
      creak(s, t + 0.01, 0.16, 0.4, 70 * p);
      voice(s, { t: t + 0.02, f: [[0, 90 * p], [0.15, 78 * p]], vow: [[0, 'o'], [0.08, 'm']], size: 0.65, a: 0.01, h: 0.04, d: 0.12, v: 0.6, rough: 0.5 });
      if (s.rnd() < 0.5) owl(s, t + 0.16, 0.45, p);
    },
    death: (s, t, p) => {
      // TIMBER: a long creaking groan, the giant crashes down (thud, rumble, leaves), and the owl: "hoo?!"
      creak(s, t, 0.6, 0.6, 50 * p);
      voice(s, { t, f: [[0, 100 * p], [0.6, 62 * p]], vow: [[0, 'o'], [0.4, 'u']], size: 0.65, a: 0.04, h: 0.25, d: 0.3, v: 0.55, rough: 0.5 });
      const at = t + 0.6;
      wood(s, at, 200, 1, 0.12, 1);
      thump(s, at, 60, 0.35, 0.5);
      rumble(s, at, 0.55, 0.5, 42);
      crunch(s, at, 0.2, 0.5);
      rustle(s, at, 0.4, 0.5, 2600);
      owl(s, at + 0.3, 0.5, p * 1.1);
      rustle(s, at + 0.32, 0.12, 0.3, 4200);
    },
    hello: (s, t, p) => {
      // a deep, content "hmmm", a creak, and the owl's sleepy "hoo?"
      voice(s, { t, f: [[0, 85 * p], [0.25, 95 * p], [0.35, 90 * p]], vow: [[0, 'o'], [0.12, 'm']], size: 0.65, a: 0.03, h: 0.18, d: 0.15, v: 0.7, rough: 0.3 });
      creak(s, t + 0.05, 0.3, 0.3, 60);
      owl(s, t + 0.4, 0.5, p);
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

// ------------------------------------------------------------------ the traits (the names stay; the sounds follow the v5 cast)

type TraitName = Extract<SoundName, 'poison' | 'globSplat' | 'dodge' | 'shellClose' | 'shellOpen' | 'thorns' | 'hookPull' | 'bellySlide' | 'chargeImpact' | 'leapLaunch' | 'leapLand' | 'doubleJab' | 'armourClank' | 'bossStomp'>;

export const TRAIT_SOUNDS: Record<TraitName, SoundDef> = {
  poison: {
    // Scorp's poison working on a foe: a tiny fizz and a sickly bubble popping. Heard often: tiny
    dur: 0.16, vars: 3, vol: 0.13, cat: 'battle', gap: 0.05, max: 3, jitter: 120,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      s.crackle({ density: 1800, filter: 'highpass', f: 5000, a: 0.005, d: 0.1, v: 0.5 });
      s.tone({ t: 0.02, f: [[0, 480 * p], [0.03, 1100 * p]], a: 0.002, d: 0.04, v: 0.6 });
      s.tone({ t: 0.06, f: [[0, 640 * p], [0.025, 1400 * p]], a: 0.002, d: 0.03, v: 0.35 });
      s.noise({ filter: 'highpass', f: 6000, a: 0.01, d: 0.1, v: 0.15 });
    },
  },
  globSplat: {
    // Scorp's glob lands: a wet splat, then it sizzles and fizzes
    dur: 0.5, vars: 3, vol: 0.26, cat: 'battle', verb: 0.08, gap: 0.05, max: 3, jitter: 90,
    make: (s) => {
      const p = s.rand(0.88, 1.12);
      s.noise({ color: 'pink', filter: 'lowpass', f: [[0, 3200], [0.08, 500]], a: 0.001, d: 0.1, v: 0.9, to: s.drive(2) });
      s.tone({ f: [[0, 260 * p], [0.07, 90]], a: 0.001, d: 0.08, v: 0.5 });
      s.noise({ filter: 'bandpass', f: [[0, 800 * p], [0.04, 2000 * p], [0.1, 700]], q: 5, a: 0.002, d: 0.12, v: 0.5 });
      s.crackle({ t: 0.03, density: 2400, filter: 'highpass', f: 4200, a: 0.02, h: 0.08, d: 0.3, v: 0.55 });
      s.noise({ t: 0.03, filter: 'highpass', f: 5500, a: 0.02, h: 0.06, d: 0.3, v: 0.22 });
      bubbles(s, 0.08, 0.25, 4, 0.25, 900, 1800);
    },
  },
  dodge: {
    // Shroom boings aside: a whiff, a quick boing, a puff of spores
    dur: 0.34, vars: 3, vol: 0.22, cat: 'battle', gap: 0.05, max: 3, jitter: 100,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 4200 * p], [0.1, 1100 * p]], q: 1.8, a: 0.015, d: 0.08, v: 0.6 });
      sproing(s, 0.02, 260 * p, 0.2, 0.55, 1.9, 24);
      s.noise({ t: 0.06, color: 'pink', filter: 'bandpass', f: [[0, 2500], [0.2, 5000]], q: 0.9, a: 0.02, d: 0.2, v: 0.3 });
      s.crackle({ t: 0.06, density: 300, filter: 'highpass', f: 5000, a: 0.02, d: 0.18, v: 0.2 });
    },
  },
  shellClose: {
    // Tulip folds into its armoured bud: the motor whirs, three metal petals CLANK shut, the latch locks
    dur: 0.65, vol: 0.36, cat: 'battle', verb: 0.12, gap: 0.2, max: 2,
    make: (s) => {
      servo(s, 0, 0.16, 0.25, 500, 1100);
      for (const [i, f] of [520, 600, 440].entries()) clank(s, 0.14 + i * 0.055, 0.8 + i * 0.1, f);
      const t = 0.32;
      thump(s, t, 110, 0.12, 0.6);
      click(s, t, 3500, 0.8);
      s.bell({ t, f: 330, ratio: 2.76, index: 1.6, d: 0.3, v: 0.35 });
      wood(s, t + 0.02, 900, 0.3, 0.02);
    },
  },
  shellOpen: {
    // ...and opens again: the latch clicks, the motor spins up, the petals spring open with a ring
    dur: 0.5, vol: 0.3, cat: 'battle', verb: 0.12, gap: 0.2, max: 2,
    make: (s) => {
      click(s, 0, 4200, 0.7);
      wood(s, 0, 1200, 0.3, 0.02);
      servo(s, 0.03, 0.14, 0.22, 700, 1300);
      sproing(s, 0.16, 520, 0.2, 0.4, 1.4, 26);
      s.bell({ t: 0.17, f: 1760, ratio: 2.76, index: 1.2, d: 0.3, v: 0.35 });
      s.bell({ t: 0.2, f: 2350, ratio: 1.41, index: 0.8, d: 0.25, v: 0.22 });
    },
  },
  thorns: {
    // a hit on Spike: the attacker gets jabbed by a sharp pencil quill (a scratch, a "tik", a tiny "ow")
    dur: 0.16, vars: 3, vol: 0.2, cat: 'battle', gap: 0.06, max: 3, jitter: 80,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      scribble(s, 0, 0.05, 0.6, 1);
      wood(s, 0.035, 2400 * p, 0.6, 0.015);
      click(s, 0.035, 7000, 0.4);
      squeak(s, 0.06, 1700 * p, 0.07, 0.25);
    },
  },
  hookPull: {
    // Snapper's vine grabs and reels in: a chomp, the vine straining and TWANG, the skates whirr back, a tug
    dur: 0.6, vars: 2, vol: 0.32, cat: 'battle', verb: 0.08, gap: 0.1, max: 2, jitter: 50,
    make: (s) => {
      const p = s.rand(0.92, 1.08);
      chomp(s, 0, 0.45, p);
      twang(s, 0.02, 330 * p, 0.3, 0.6);
      skates(s, 0.2, 0.22, 0.3, 300, 480);
      thump(s, 0.42, 140, 0.1, 0.6);
      s.noise({ t: 0.42, filter: 'bandpass', f: 900, q: 1.2, a: 0.001, d: 0.04, v: 0.4 });
    },
  },
  bellySlide: {
    // Pumpkin rolls through the lines like a bowling ball: a rolling rumble, a hollow thump every turn, the candle whooshing
    dur: 0.8, vars: 2, vol: 0.34, cat: 'battle', verb: 0.1, gap: 0.3, max: 2, jitter: 60,
    make: (s) => {
      gourd(s, 0, 160, 0.6);
      tumble(s, 0.02, 0.65, 0.7, 7);
      flicker(s, 0.05, 0.55, 0.25);
      whoosh(s, 0.05, 300, 900, 500, 0.6, 0.3, 1.2);
    },
  },
  chargeImpact: {
    // Bamboo's dashing strike lands: a rush, all three faces shout "HYAH!", a huge hollow TOK, a heavy shove
    dur: 0.62, vars: 3, vol: 0.55, cat: 'battle', verb: 0.12, gap: 0.08, max: 2, jitter: 60, duck: 0.15,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      whoosh(s, 0, 300, 1500, 600, 0.08, 0.5);
      for (const [i, sz] of [1.5, 1.25, 1].entries()) voice(s, { t: 0.01, f: [[0, (500 - i * 90) * p], [0.03, (660 - i * 110) * p], [0.14, (520 - i * 90) * p]], vow: [[0, 'e'], [0.03, 'a']], size: sz, h0: 0.012, a: 0.004, h: 0.05, d: 0.08, v: 0.3 });
      const t = 0.06;
      click(s, t, 3000, 1);
      wood(s, t, 380 * p, 1.2, 0.1, 1);
      thump(s, t, 85 * p, 0.22, 0.6);
      s.noise({ t, color: 'pink', filter: 'bandpass', f: [[0, 1500], [0.06, 450]], q: 0.8, a: 0.0008, d: 0.09, v: 1 });
      crunch(s, t, 0.1, 0.35);
      s.noise({ t, color: 'brown', filter: 'lowpass', f: 300, a: 0.005, d: 0.3, v: 0.5 });
    },
  },
  leapLaunch: {
    // Dandy pops its seed-puff open like a parachute: FWOOMP, the bowl sloshes, it floats up and away
    dur: 0.7, vars: 2, vol: 0.32, cat: 'battle', verb: 0.2, gap: 0.08, max: 2, jitter: 60,
    make: (s) => {
      const p = s.rand(0.92, 1.08);
      wheels(s, 0, 2, 0.04, 0.25, 3000 * p);
      fwoomp(s, 0.05, 0.9);
      slosh(s, 0.1, 0.3, 0.4);
      whoosh(s, 0.1, 400, 1800, 3500, 0.5, 0.35);
      s.tone({ t: 0.15, f: [[0, 700 * p], [0.45, 1300 * p]], a: 0.1, h: 0.15, d: 0.25, v: 0.06, vib: [5, 30] });
    },
  },
  leapLand: {
    // ...and lands on the back line: a heavy glass-bowl THUMP, a splash, the glass ringing, the wheels squeak (the stun follows)
    dur: 0.5, vars: 2, vol: 0.46, cat: 'battle', verb: 0.12, gap: 0.08, max: 2, jitter: 60,
    make: (s) => {
      const p = s.rand(0.92, 1.08);
      thump(s, 0, 110 * p, 0.16, 0.6);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 1400], [0.12, 400]], q: 0.8, a: 0.001, d: 0.14, v: 0.9 });
      s.tone({ f: [[0, 720 * p], [0.15, 690 * p]], a: 0.0008, d: 0.25, v: 0.3 });
      s.bell({ f: 1650 * p, ratio: 2.3, index: 0.8, d: 0.2, v: 0.15 });
      splash(s, 0.01, 0.6);
      wheels(s, 0.12, 2, 0.06, 0.2, 2600 * p);
    },
  },
  doubleJab: {
    // Cacto's pap-pap
    dur: 0.28, vars: 3, vol: 0.3, cat: 'battle', gap: 0.06, max: 3, jitter: 80,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      glove(s, 0, 0.7, 180 * p);
      glove(s, 0.075, 0.85, 165 * p);
    },
  },
  armourClank: {
    // a hit glances off armour: Oak's thick bark knocking, with a dull clank (any armoured unit)
    dur: 0.28, vars: 3, vol: 0.28, cat: 'battle', verb: 0.08, gap: 0.06, max: 3, jitter: 80,
    make: (s) => {
      const p = s.rand(0.9, 1.1);
      wood(s, 0, 280 * p, 1, 0.07, 0.9);
      clank(s, 0, 0.45, 300 * p);
      s.crackle({ density: 700, filter: 'bandpass', f: 1800, a: 0.001, d: 0.06, v: 0.35 });
    },
  },
  bossStomp: {
    // Oak's root ground-pound (and the boss's stomp): a huge boom, roots tearing through the soil, a rumble, clods falling
    dur: 1.1, vars: 2, vol: 0.8, cat: 'battle', verb: 0.2, gap: 0.25, max: 2, jitter: 40, duck: 0.3,
    make: (s) => {
      drum(s, 0, 48, 0.6, 0.25, 2.5);
      thump(s, 0, 60, 0.4, 0.35);
      wood(s, 0, 210, 1, 0.12, 0.9);
      s.noise({ color: 'pink', filter: 'bandpass', f: [[0, 700], [0.25, 280]], q: 0.8, a: 0.001, d: 0.3, v: 1 });
      rumble(s, 0, 0.9, 0.6, 40);
      crunch(s, 0, 0.3, 0.9);
      creak(s, 0.08, 0.3, 0.3, 75);
      s.crackle({ t: 0.08, density: 120, filter: 'bandpass', f: 1800, a: 0.01, d: 0.6, v: 0.35 });
      for (let i = 0; i < 4; i++) wood(s, 0.15 + s.rand(0, 0.45), s.rand(300, 700), s.rand(0.15, 0.3), 0.04, 0.4);
    },
  },
};
