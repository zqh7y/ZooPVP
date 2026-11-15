import type { Team } from '../../types';
import type { ArtStyle, PetOpts, Pose, SamplePet } from './api';
import { TEAM } from '../../theme';
import { RIM, RIMH, SH, SHH, TEX, begin, clipTo, flipped, unclip, cut, disc, ellipsePts, end, flat, isHi, mix, part, pop, push, rotate, rotateAt, scale, spline, strip, translate, type Pts } from './style5-paper';
import { PAPER, helmet, itemIcon, weapon } from './style5-items';
import { density, picture, stamp } from './style5-cache';

/*
 * Style sample 5: Paper Cutout. Each pet is a stop-motion puppet of coloured card: every part is cut by hand
 * (style5-paper.ts keeps the cut the same every frame and for both teams), pinned at its joints and laid on the
 * part behind it, so it throws a small soft shadow there, and a sliver of the card's pale core shows on its lit
 * edges. The big parts are two cards, a shade card under the colour, so a crescent of shade shows on the far
 * side. The frog's head is a separate plate hinged at the corner of its mouth: the attack swings it open. Eyes
 * are a cream disc, an ink pupil and an eyelid of the body's card, whose angle is the mood (lazy, cross, shut).
 * Brass split pins hold the joints when drawn big.
 *
 * The idle is a loop of 12 frames over 2.4 s, the way a puppet is moved between exposures, so every look a pet
 * can have is a short list of finished pictures: each is cut and glued once (style5-cache.ts) and a fighter then
 * costs one drawImage. Pets are drawn in units of r (feet on the origin, facing right).
 */
type Ctx = CanvasRenderingContext2D;

interface Pal {
  main: string;
  light: string;
  /** the shade card under a big part */
  shade: string;
  dark: string;
  deep: string;
}
const PAL: Pal[] = TEAM.map((c) => ({ main: c.main, light: c.light, shade: mix(c.main, c.dark, 0.62), dark: c.dark, deep: mix(c.dark, '#141a2a', 0.4) }));
const INK = '#1c2130';
const CREAM = PAPER.cream;
const TONGUE = '#ff86a8';
const BRASS = '#e9b545';
const GROUND = 'rgba(52,44,20,0.15)';
const GROUND_SOFT = 'rgba(52,44,20,0.07)';

// ------------------------------------------------------------------ shapes (built once)

interface Eyes {
  lids: Path2D[];
  squint: Path2D;
  lash: Path2D;
  glint: Path2D;
  pin: Path2D;
  pinGlint: Path2D;
  swoosh: Path2D;
  ground: Path2D;
  groundSoft: Path2D;
}
const LID_STEPS = [0.14, 0.28, 0.42, 0.56, 0.7, 1];

interface Ant {
  abdomen: Path2D;
  abdShine: Path2D;
  petiole: Path2D;
  thorax: Path2D;
  head: Path2D;
  headShine: Path2D;
  legsFar: Path2D;
  legsNear: Path2D;
  frontFar: Path2D;
  frontNear: Path2D;
  armNear: Path2D;
  armFar: Path2D;
  hand: Path2D;
  antNear: Path2D;
  antFar: Path2D;
  mandNear: Path2D;
  mandFar: Path2D;
  whiteNear: Path2D;
  whiteFar: Path2D;
  pupilNear: Path2D;
  pupilFar: Path2D;
}

interface Frog {
  body: Path2D;
  head: Path2D;
  mouth: Path2D[];
  tongueIn: Path2D;
  tongue: Path2D;
  belly: Path2D;
  spots: Path2D;
  thigh: Path2D;
  foot: Path2D;
  footFar: Path2D;
  arm: Path2D;
  hand: Path2D;
  bumpNear: Path2D;
  bumpFar: Path2D;
  whiteNear: Path2D;
  whiteFar: Path2D;
  pupilNear: Path2D;
  pupilFar: Path2D;
}

/** frog mouth openings (radians the head plate swings up), one stored mouth each */
const MOUTH_OPEN = [0, 0.18, 0.42];
const FROG_HINGE: [number, number] = [0.05, -0.98];

let EY: Eyes | null = null;
let AN: Ant | null = null;
let FR: Frog | null = null;

function eyesShapes(): Eyes {
  if (EY) return EY;
  const lids = LID_STEPS.map((amt, i) => {
    if (amt >= 1) return disc(0, 0, 1.06, `lid${i}`, 0.5, 0.03);
    // the top of a disc, cut straight across at the lid line
    const yc = -1.06 + 2.12 * amt;
    const a0 = Math.asin(Math.max(-1, Math.min(1, yc / 1.06)));
    const pts: Pts = [];
    const n = 16;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI - a0 + (k / n) * (Math.PI + 2 * a0);
      pts.push(Math.cos(a) * 1.06, Math.sin(a) * 1.06);
    }
    return cut(pts, `lid${i}`, 0.5, 0.025);
  });
  const sw: Pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = -1.75 + (i / N) * 2.1;
    sw.push(Math.cos(a) * 1.0, Math.sin(a) * 1.0);
  }
  for (let i = N; i >= 0; i--) {
    const a = -1.75 + (i / N) * 2.1;
    const w = Math.sin((i / N) * Math.PI) ** 0.8 * 0.2 + 0.01;
    sw.push(Math.cos(a) * (1 - w), Math.sin(a) * (1 - w));
  }
  EY = {
    lids,
    squint: cut(strip([-0.42, -0.56, 0.5, -0.02, -0.42, 0.52], 0.17, 0.17, 3), 'squint', 0.3, 0.02),
    lash: cut(strip(spline([-0.86, 0.12, -0.3, 0.5, 0.3, 0.5, 0.86, 0.12], false, 4), 0.13, 0.13, 3), 'lash', 0.3, 0.02),
    glint: disc(-0.2, -0.22, 0.17, 'glint', 0.12, 0.01),
    pin: disc(0, 0, 1, 'pin', 0.5, 0.04),
    pinGlint: disc(-0.3, -0.3, 0.36, 'pin-g', 0.3, 0.02),
    swoosh: cut(sw, 'swoosh', 0.2, 0.012),
    ground: cut(ellipsePts(0, 0, 1, 1, 0, 32), 'ground', 0.4, 0.02),
    groundSoft: cut(ellipsePts(0, 0, 1.22, 1.5, 0, 32), 'ground2', 0.5, 0.02),
  };
  return EY;
}

function antShapes(): Ant {
  if (AN) return AN;
  const leg = (pts: Pts, key: string, p: Path2D) => cut(strip(pts, 0.058, 0.046, 3), key, 0.12, 0.006, p);
  // a tidy fan: the back pair splay back, the middle pair stand under the waist, the front pair reach forward
  const legsFar = new Path2D();
  leg([0.14, -0.8, 0.36, -0.56, 0.36, -0.05, 0.46, -0.01], 'a-lf1', legsFar);
  leg([0.0, -0.8, -0.3, -0.58, -0.42, -0.05, -0.32, -0.01], 'a-lf2', legsFar);
  const legsNear = new Path2D();
  leg([0.04, -0.78, 0.2, -0.5, 0.16, -0.05, 0.27, -0.01], 'a-ln1', legsNear);
  leg([-0.1, -0.78, -0.52, -0.52, -0.66, -0.05, -0.56, -0.01], 'a-ln2', legsNear);
  // the front pair, when they are not holding anything, stand on the ground too
  const frontFar = new Path2D();
  leg([0.24, -0.84, 0.74, -0.66, 1.02, -0.05, 1.12, -0.01], 'a-ff', frontFar);
  const frontNear = new Path2D();
  leg([0.16, -0.82, 0.6, -0.62, 0.82, -0.05, 0.93, -0.01], 'a-fn', frontNear);
  const antenna = (pts: Pts, key: string) => {
    const p = new Path2D();
    cut(strip(pts, 0.042, 0.036, 3), key, 0.12, 0.005, p);
    const n = pts.length;
    disc(pts[n - 2], pts[n - 1], 0.078, key + 't', 0.05, 0.004, p);
    return p;
  };
  AN = {
    abdomen: cut(spline([-0.26, -1.02, -0.46, -1.3, -0.82, -1.36, -1.16, -1.14, -1.36, -0.8, -1.14, -0.58, -0.76, -0.56, -0.42, -0.72], true, 8), 'a-abd', 0.15, 0.014),
    abdShine: cut(strip(spline([-0.5, -1.17, -0.8, -1.25, -1.08, -1.1], false, 5), 0.05, 0.03), 'a-abds', 0.12, 0.006),
    petiole: disc(-0.2, -1.0, 0.09, 'a-pet'),
    thorax: cut(ellipsePts(0.02, -1.06, 0.25, 0.17, -0.45), 'a-thx', 0.12, 0.01),
    head: cut(ellipsePts(0.52, -1.45, 0.52, 0.475, -0.12), 'a-head', 0.16, 0.014),
    headShine: cut(strip(spline([0.13, -1.44, 0.21, -1.71, 0.43, -1.82], false, 5), 0.048, 0.03), 'a-heads', 0.12, 0.006),
    legsFar,
    legsNear,
    frontFar,
    frontNear,
    armNear: cut(strip([0, 0, 0.3, 0.22, 0.68, 0.2], 0.056, 0.048, 3), 'a-arm', 0.12, 0.006),
    armFar: cut(strip([0, 0, 0.26, 0.2, 0.56, 0.12], 0.05, 0.044, 3), 'a-arm2', 0.12, 0.006),
    hand: disc(0, 0, 0.082, 'a-hand'),
    antNear: antenna([0, 0, -0.14, -0.36, 0.2, -0.6], 'a-ant1'),
    antFar: antenna([0, 0, 0.0, -0.34, 0.3, -0.48], 'a-ant2'),
    mandNear: cut(strip(spline([0, 0, 0.12, -0.02, 0.19, 0.02, 0.19, 0.09], false, 4), 0.05, 0.016, 3), 'a-mand1', 0.1, 0.005),
    mandFar: cut(strip(spline([0, 0, 0.1, -0.02, 0.16, 0.01, 0.16, 0.07], false, 4), 0.044, 0.014, 3), 'a-mand2', 0.1, 0.005),
    whiteNear: disc(0, 0, 1, 'a-wn', 0.5, 0.03),
    whiteFar: disc(0, 0, 1, 'a-wf', 0.5, 0.03),
    pupilNear: disc(0, 0, 0.56, 'a-pn', 0.3, 0.025),
    pupilFar: disc(0, 0, 0.56, 'a-pf', 0.3, 0.025),
  };
  return AN;
}

/** rotate the points of a flat list about (px, py) */
function rot(pts: Pts, px: number, py: number, a: number): Pts {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: Pts = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] - px;
    const y = pts[i + 1] - py;
    out.push(px + x * c - y * s, py + x * s + y * c);
  }
  return out;
}

function frogShapes(): Frog {
  if (FR) return FR;
  const [hx, hy] = FROG_HINGE;
  // the mouth line (front to the corner) and the lower lip just under it
  const seam: Pts = [1.24, -0.8, 0.72, -0.79, 0.28, -0.86, 0.06, -0.99];
  const lip: Pts = [0.03, -0.99, 0.3, -0.78, 0.72, -0.71, 1.21, -0.72];
  const mouth = MOUTH_OPEN.map((a, i) => {
    // the gap between the lower lip and the swung-up seam, tucked a little under the head plate
    const up = rot(seam, hx, hy, -a).map((v, k) => (k % 2 ? v - 0.06 : v));
    return cut(spline([...lip, ...up], true, 5), `f-mouth${i}`, 0.14, 0.01);
  });
  const foot = cut([-0.44, 0.0, -0.32, -0.12, 0.0, -0.11, 0.2, -0.17, 0.13, -0.07, 0.31, -0.08, 0.17, -0.01, 0.29, 0.03, 0.0, 0.02], 'f-foot', 0.12, 0.008);
  const footFar = cut([0.72, 0.01, 0.8, -0.1, 0.96, -0.12, 0.92, -0.06, 1.06, -0.06, 0.96, 0.0, 1.04, 0.03], 'f-foot2', 0.1, 0.006);
  const spots = new Path2D();
  disc(-0.42, -0.98, 0.115, 'f-s1', 0.06, 0.006, spots);
  disc(-0.74, -0.68, 0.075, 'f-s2', 0.05, 0.005, spots);
  disc(-0.16, -1.14, 0.06, 'f-s3', 0.04, 0.004, spots);
  const arm = cut(strip([0, 0, 0.11, 0.24, 0.16, 0.46], 0.1, 0.066, 3), 'f-arm', 0.12, 0.007);
  const hand = cut([0.07, 0.44, 0.02, 0.55, 0.11, 0.53, 0.13, 0.62, 0.2, 0.54, 0.31, 0.58, 0.27, 0.44], 'f-hand', 0.08, 0.005);
  FR = {
    body: cut(spline([0.0, 0.0, 0.8, -0.03, 1.1, -0.34, 1.2, -0.76, 1.06, -1.12, 0.62, -1.34, 0.02, -1.34, -0.56, -1.13, -0.97, -0.72, -1.08, -0.3, -0.86, -0.04], true, 8), 'f-body', 0.17, 0.016),
    head: cut(spline([...seam, -0.1, -1.18, -0.32, -1.3, 0.04, -1.39, 0.62, -1.39, 1.1, -1.15], true, 7), 'f-head', 0.16, 0.014),
    mouth,
    tongueIn: cut(ellipsePts(0.6, -0.79, 0.3, 0.065, -0.05), 'f-tin', 0.12, 0.008),
    tongue: (() => {
      const p = new Path2D();
      cut(strip(spline([0.42, -0.82, 0.9, -0.86, 1.3, -0.84, 1.52, -0.8], false, 5), 0.06, 0.05, 3), 'f-tg', 0.14, 0.006, p);
      disc(1.56, -0.8, 0.13, 'f-tgt', 0.09, 0.008, p);
      return p;
    })(),
    belly: cut(ellipsePts(0.62, -0.38, 0.44, 0.29, -0.22), 'f-belly', 0.14, 0.012),
    spots,
    thigh: cut(spline([-0.94, -0.6, -0.72, -0.78, -0.3, -0.66, 0.08, -0.38, 0.12, -0.14, -0.1, -0.06, -0.6, -0.14, -0.92, -0.32], true, 6), 'f-thigh', 0.15, 0.013),
    foot,
    footFar,
    arm,
    hand,
    bumpNear: disc(0.34, -1.42, 0.34, 'f-bn', 0.14, 0.011),
    bumpFar: disc(0.87, -1.34, 0.28, 'f-bf', 0.13, 0.01),
    whiteNear: disc(0, 0, 1, 'f-wn', 0.5, 0.03),
    whiteFar: disc(0, 0, 1, 'f-wf', 0.5, 0.03),
    pupilNear: disc(0, 0, 0.56, 'f-pn', 0.3, 0.025),
    pupilFar: disc(0, 0, 0.56, 'f-pf', 0.3, 0.025),
  };
  return FR;
}

// ------------------------------------------------------------------ shared bits

/**
 * A big part as two cards: the shade card cut to the part's shape, and the part's colour on top of it, the
 * same cut moved up and towards the light and trimmed to it, so a crescent of shade shows on the far side
 * (with the top card's shadow along its edge). (cx, cy) is the part's middle, k how far the light card moves.
 */
function shaded(p: Path2D, main: string, shade: string, pcx: number, pcy: number, k: number) {
  part(p, shade, SH | RIM | TEX);
  clipTo(p);
  push();
  translate(pcx - k * 0.55 * flipped(), pcy - k);
  scale(1 - k * 0.35);
  translate(-pcx, -pcy);
  part(p, main, SH | TEX);
  pop();
  unclip();
}

type EyeMood = 'open' | 'squint';

/**
 * An eye centred at (ex, ey), radius er: the cream disc, the pupil looking along (lx, ly), the lid of lidCol
 * down to lid (0 open .. 1 shut) tipped by tilt; 'squint' is a pinched ink chevron instead (mirror for the left one).
 */
function eye(ex: number, ey: number, er: number, white: Path2D, pupil: Path2D, lidCol: string, lid: number, tilt: number, lx: number, ly: number, mood: EyeMood, mirror: boolean) {
  const E = eyesShapes();
  push();
  translate(ex, ey);
  scale(er);
  if (mood === 'squint') {
    // pinched shut: the two chevrons point at each other, each pulled a little away from the other eye
    if (mirror) scale(-1, 1);
    translate(-0.18, 0);
    scale(0.82);
    part(E.squint, INK, SHH);
    pop();
    return;
  }
  part(white, CREAM, SH);
  if (lid < 0.99) {
    push();
    translate(lx * 0.34, ly * 0.34 + lid * 0.22);
    part(pupil, INK, 0);
    flat(E.glint, CREAM);
    pop();
  }
  if (lid > 0.04) {
    let k = 0;
    while (k < LID_STEPS.length - 1 && LID_STEPS[k] < lid - 0.07) k++;
    push();
    rotate(tilt);
    part(E.lids[k], lidCol, SH | RIMH);
    pop();
    if (lid >= 0.99) part(E.lash, INK, 0);
  }
  pop();
}

/** a brass split pin through a joint (only when drawn big) */
function pin(x: number, y: number, s: number) {
  if (!isHi()) return;
  const E = eyesShapes();
  push();
  translate(x, y);
  scale(s);
  part(E.pin, BRASS, SH);
  flat(E.pinGlint, '#fff1c2');
  pop();
}

function ground(w: number) {
  const E = eyesShapes();
  push();
  scale(w, 0.13);
  if (isHi()) flat(E.groundSoft, GROUND_SOFT);
  flat(E.ground, GROUND);
  pop();
}

/**
 * The idle is a loop of IDLE_N stop-motion frames over IDLE_T seconds (the puppet is moved five times a
 * second), so it has only a few pictures to keep.
 */
const IDLE_T = 2.4;
const IDLE_N = 12;
/** a short blink every few seconds: 0 open, 1 half shut, 2 shut */
function blinkAt(t: number) {
  const p = (((t + 0.37) % 3.3) + 3.3) % 3.3;
  return p < 0.09 ? 2 : p < 0.17 ? 1 : 0;
}

/** a swing mark: a cream paper crescent the weapon has just cut through (in the hand's units) */
function swoosh(hx: number, hy: number, rad: number, ang: number) {
  push();
  translate(hx, hy);
  rotate(ang);
  scale(rad);
  part(eyesShapes().swoosh, 'rgba(255,251,240,0.82)', SHH);
  pop();
}

// ------------------------------------------------------------------ the ant

const ANT_SCALE = { knife: 0.95, bat: 0.88, spear: 0.9, shield: 0.95 } as const;
/** the ant's body sits this much lower than its shapes are drawn (shorter legs) */
const DROP = 0.18;

/** the ant in a pose; ph is the idle frame's phase (radians round the loop), blink 0..2 */
function drawAnt(team: Team, pose: Pose, ph: number, blink: number, o: PetOpts | undefined) {
  const S = antShapes();
  const P = PAL[team];
  const wpn = o?.weapon ?? null;

  let dx = 0;
  let bob = Math.sin(ph) * 0.028;
  let lean = 0;
  let headA = Math.sin(ph + 0.8) * 0.035;
  let antA = Math.sin(ph * 2 + 0.5) * 0.06 + Math.sin(ph) * 0.04;
  let armA = (wpn ? 0 : 0.5) + Math.sin(ph + 0.4) * 0.05;
  let armFarA = wpn ? 0 : 0.45;
  let wAng = -0.72;
  let mand = 0.05;
  let lid = blink === 2 ? 1 : blink === 1 ? 0.6 : 0.14;
  let tilt = 0;
  let mood: EyeMood = 'open';
  let look = 1;
  if (pose === 'attack') {
    dx = 0.24;
    bob = -0.03;
    lean = 0.13;
    headA = 0.06;
    antA = 0.3;
    armA = wpn ? -0.32 : -0.55;
    armFarA = wpn ? -0.3 : -0.7;
    wAng = wpn === 'spear' ? -0.05 : wpn === 'shield' ? -0.2 : 0.3;
    mand = wpn ? 0.25 : 0.65;
    lid = 0.36;
    tilt = 0.32;
  } else if (pose === 'hit') {
    dx = -0.18;
    bob = 0.02;
    lean = -0.2;
    headA = -0.14;
    antA = -0.45;
    armA = -0.75;
    armFarA = -0.6;
    wAng = wpn === 'spear' ? -1.45 : -1.6;
    mand = 0.3;
    mood = 'squint';
    look = -1;
  }

  ground(1.2);

  // the far side: legs, arm, antenna (darkest card, behind everything)
  // without a weapon the front pair stand on the ground too (the bite is all jaws)
  const arms = !!wpn;
  push();
  translate(dx, 0);
  part(S.legsFar, P.deep, SH);
  if (!arms) part(S.frontFar, P.deep, SH);
  pop();

  push();
  translate(dx, bob + DROP);
  rotateAt(0, -1.0, lean);

  // far antenna and far arm sit behind the body
  push();
  rotateAt(0.24, -1.2, headA);
  push();
  translate(0.64, -1.86);
  rotate(antA * 0.8 + 0.05);
  part(S.antFar, P.deep, SH);
  pop();
  pop();
  if (arms) {
    push();
    translate(0.2, -1.12);
    rotate(armFarA);
    part(S.armFar, P.deep, SH);
    pop();
  }

  push();
  translate(-0.26, -1.0);
  scale(0.92);
  translate(0.26, 1.0);
  shaded(S.abdomen, P.main, P.shade, -0.8, -0.95, 0.16);
  part(S.abdShine, P.light, 0);
  pop();
  part(S.petiole, P.dark, SH);
  part(S.thorax, P.main, SH | RIM | TEX);
  pop();

  // near legs over the body's underside
  push();
  translate(dx, 0);
  part(S.legsNear, P.dark, SH | RIMH);
  if (!arms) part(S.frontNear, P.dark, SH | RIMH);
  pop();

  push();
  translate(dx, bob + DROP);
  rotateAt(0, -1.0, lean);
  // the head, nodding on its neck
  push();
  rotateAt(0.24, -1.2, headA);
  // mandibles under the head's chin
  if (mand > 0.2) {
    push();
    translate(0.92, -1.16);
    rotate(-mand * 0.6);
    part(S.mandFar, P.deep, SH);
    pop();
  }
  if (mand > 0.2) {
    // the mandibles only show when they open (a bite, a gasp)
    push();
    translate(0.88, -1.14);
    rotate(mand * 0.7 - 0.2);
    part(S.mandNear, P.dark, SH);
    pop();
  }
  shaded(S.head, P.main, P.shade, 0.52, -1.45, 0.13);
  part(S.headShine, P.light, 0);
  eye(0.93, -1.46, 0.18, S.whiteFar, S.pupilFar, P.main, lid, -tilt, look, 0.1, mood, true);
  eye(0.62, -1.5, 0.25, S.whiteNear, S.pupilNear, P.main, lid, tilt, look, 0.1, mood, false);
  push();
  translate(0.36, -1.86);
  rotate(antA);
  part(S.antNear, P.dark, SH | RIMH);
  pop();
  if (o?.helmet) helmet(0.5, -1.63, 0.55, 0.12);
  pop();

  // the near arm and what it holds
  const sx = 0.14;
  const sy = -1.1;
  const c = Math.cos(armA);
  const s = Math.sin(armA);
  const hx = sx + 0.68 * c - 0.2 * s;
  const hy = sy + 0.68 * s + 0.2 * c;
  if (wpn && pose === 'attack' && (wpn === 'knife' || wpn === 'bat')) swoosh(hx, hy, wpn === 'bat' ? 0.95 : 0.75, -0.2);
  if (!wpn && pose === 'attack') {
    // the snap of the jaws: a small cream crescent in front of them
    push();
    rotateAt(0.24, -1.2, headA);
    swoosh(0.98, -1.12, 0.3, 0.1);
    pop();
  }
  if (arms) {
    push();
    translate(sx, sy);
    rotate(armA);
    part(S.armNear, P.dark, SH | RIMH);
    pop();
    pin(sx, sy, 0.04);
  }
  if (wpn) weapon(wpn, hx, hy, wAng, ANT_SCALE[wpn]);
  if (wpn && wpn !== 'shield') {
    push();
    translate(hx, hy);
    part(S.hand, P.dark, SH);
    pop();
  }
  pop();
}

// ------------------------------------------------------------------ the frog

const FROG_SCALE = { knife: 0.8, bat: 0.86, spear: 0.8, shield: 0.95 } as const;

/** the frog in a pose; ph is the idle frame's phase (radians round the loop), blink 0..2 */
function drawFrog(team: Team, pose: Pose, ph: number, blink: number, o: PetOpts | undefined) {
  const S = frogShapes();
  const P = PAL[team];
  const wpn = o?.weapon ?? null;

  let dx = 0;
  const br = Math.sin(ph);
  let squash = 1 + br * 0.028;
  let belly = 1 + br * 0.06;
  let lean = 0;
  let open = 0;
  let armA = wpn ? -1.0 + Math.sin(ph + 0.6) * 0.05 : 0;
  let wAng = -0.72;
  let lid = blink === 2 ? 1 : blink === 1 ? 0.7 : 0.32;
  let tilt = 0.06;
  let mood: EyeMood = 'open';
  let look = 1;
  let tongue = false;
  if (pose === 'attack') {
    dx = 0.2;
    squash = 1.04;
    belly = 1;
    lean = 0.07;
    open = wpn ? 1 : 2;
    tongue = !wpn;
    armA = wpn ? -1.35 : -0.3;
    wAng = wpn === 'spear' ? -0.06 : wpn === 'shield' ? -0.2 : 0.35;
    lid = 0.4;
    tilt = 0.38;
  } else if (pose === 'hit') {
    dx = -0.16;
    squash = 0.95;
    lean = -0.12;
    open = 1;
    armA = wpn ? -1.9 : -1.2;
    wAng = -1.7;
    mood = 'squint';
    look = -1;
  }

  ground(1.25);

  push();
  translate(dx, 0);
  rotateAt(lean > 0 ? 0.9 : -0.9, 0, lean);
  scale(1, squash);

  part(S.footFar, P.deep, SH);
  shaded(S.body, P.main, P.shade, 0.05, -0.7, 0.17);
  part(S.spots, P.dark, SHH);
  push();
  translate(0.62, -0.36);
  scale(belly);
  translate(-0.62, 0.36);
  part(S.belly, P.light, SH | RIMH | TEX);
  pop();

  // the mouth: open gap (dark card) and the tongue, under the head plate
  part(S.mouth[open], P.deep, 0);
  if (open) part(S.tongueIn, TONGUE, 0);
  if (tongue) part(S.tongue, TONGUE, SH | RIMH);

  // the head plate, hinged at the corner of the mouth, with the eyes on top
  push();
  rotateAt(FROG_HINGE[0], FROG_HINGE[1], -MOUTH_OPEN[open]);
  part(S.head, P.main, SH | RIM | TEX);
  pin(FROG_HINGE[0] + 0.02, FROG_HINGE[1] + 0.01, 0.045);
  part(S.bumpFar, P.main, SH | RIMH);
  part(S.bumpNear, P.main, SH | RIM);
  eye(0.89, -1.37, 0.2, S.whiteFar, S.pupilFar, P.main, lid, -tilt, look, 0.05, mood, true);
  eye(0.36, -1.46, 0.25, S.whiteNear, S.pupilNear, P.main, lid, tilt, look, 0.05, mood, false);
  if (o?.helmet) helmet(0.54, -1.72, 0.47, 0.1);
  pop();

  // the big back leg: thigh pinned at the hip, webbed foot on the ground
  part(S.foot, P.dark, SH | RIMH);
  shaded(S.thigh, P.main, P.shade, -0.42, -0.4, 0.11);
  pin(-0.66, -0.52, 0.05);

  // the front arm and what it holds
  const sx = 0.5;
  const sy = -0.56;
  const c = Math.cos(armA);
  const s = Math.sin(armA);
  const hx = sx + 0.17 * c - 0.5 * s;
  const hy = sy + 0.17 * s + 0.5 * c;
  if (wpn && pose === 'attack' && (wpn === 'knife' || wpn === 'bat')) swoosh(hx, hy, wpn === 'bat' ? 0.8 : 0.62, -0.2);
  // a blade or club is gripped (the paw over it); a shield is strapped on (over the paw)
  if (wpn && wpn !== 'shield') weapon(wpn, hx, hy, wAng, FROG_SCALE[wpn]);
  push();
  translate(sx, sy);
  rotate(armA);
  part(S.arm, P.main, SH | RIM);
  part(S.hand, P.dark, SH);
  pop();
  pin(sx, sy, 0.04);
  if (wpn === 'shield') weapon(wpn, hx, hy, wAng, FROG_SCALE[wpn]);
  pop();
}

// ------------------------------------------------------------------ the style

/** how far ahead of its ground point (in r) a pet can reach with each weapon, lunge included */
const REACH = { none: 2.1, knife: 2.3, bat: 2.5, spear: 3.0, shield: 2.0 } as const;

function paintPet(c: Ctx, type: SamplePet, team: Team, r: number, pose: Pose, frame: number, blink: number, o: PetOpts | undefined, face: number) {
  begin(c, 0, 0, r, face, r);
  const ph = (frame / IDLE_N) * Math.PI * 2;
  if (type === 'ant') drawAnt(team, pose, ph, blink, o);
  else drawFrog(team, pose, ph, blink, o);
  end();
}

export const style5: ArtStyle = {
  NAME: 'Paper Cutout',
  BLURB: 'hand-cut card puppets on brass pins, moved like stop-motion',
  drawPet(ctx: Ctx, type: SamplePet, team: Team, x: number, y: number, r: number, pose: Pose, t: number, o?: PetOpts) {
    const face = o?.face ?? 1;
    const w = o?.weapon ?? null;
    let frame = 0;
    let blink = 0;
    if (pose === 'idle') {
      blink = blinkAt(t + (type === 'frog' ? 1.3 : 0));
      frame = blink ? 0 : Math.floor(((((t % IDLE_T) + IDLE_T) % IDLE_T) / IDLE_T) * IDLE_N) % IDLE_N;
    }
    const q = density(ctx);
    // radii come in half-pixel steps, so a pet that grows a little reuses its pictures
    const rq = Math.max(1, Math.round(r * 2) / 2);
    const key = `${type}${team}${face}${pose}${frame}${blink}${w}${o?.helmet ? 1 : 0}|${rq}|${q}`;
    const reach = REACH[w ?? 'none'];
    const x0 = face > 0 ? -1.8 : -reach;
    const x1 = face > 0 ? reach : 1.8;
    const pic = picture(key, x0 * rq, -2.9 * rq, x1 * rq, 0.5 * rq, q, (c) => paintPet(c, type, team, rq, pose, frame, blink, o, face));
    stamp(ctx, pic, x, y, r / rq);
  },
  drawItem(ctx, type, x, y, size) {
    const q = density(ctx);
    const h = size * 0.8;
    stamp(ctx, picture(`item${type}|${size}|${q}`, -h, -h, h, h, q, (c) => itemIcon(c, type, 0, 0, size)), x, y);
  },
};
