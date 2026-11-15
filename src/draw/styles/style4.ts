import type { ArtStyle, Pose, SamplePet } from './api';
import type { Team, WeaponType } from '../../types';
import { TEAM } from '../../theme';
import { hashSeed } from '../../rng';
import { begin, crayon, deviceScale, ell, hatch, INK, pencil, path, shade, spline, stamp, strokes, wax, PAPER, type Ctx, type Pts } from './style4-pencil';
import { paintHelmet, paintItem, paintWeapon } from './style4-items';

/*
 * Style sample 4: Pencil & Crayon. A storybook drawing: graphite lines in two wobbly passes that overshoot,
 * hatching and a darker wax on the shade side, and crayon with the paper's tooth showing, slipped a little off
 * the line. The line boils: each look is drawn three ways, cycled 8 times a second.
 * A game-size fighter (shadow, body, weapon) is painted once per look (pet, team, pose, helmet, weapon, boil
 * frame, size) into a trimmed offscreen canvas at the device scale and stamped unsmoothed: one drawImage a frame,
 * plus a small one while it blinks. Big pets (the sheet) are painted directly. No Math.random: all jitter is seeded.
 */

type Pal = { readonly main: string; readonly light: string; readonly dark: string };
const BLUSH = '#ff8fa3';
const WHITE = '#fffdf6';
const MOUTH = '#5a2a3a';
const TONGUE = '#ff7a95';

// ------------------------------------------------------------------ the pose's lean (body space -> local)

interface Lean {
  rot: number;
  dx: number;
  dy: number;
  px: number;
  py: number;
}
const STILL: Lean = { rot: 0, dx: 0, dy: 0, px: 0, py: 0 };
const LEANS: Record<SamplePet, Record<Pose, Lean>> = {
  ant: {
    idle: STILL,
    attack: { rot: 0.17, dx: 0.2, dy: 0, px: 0.5, py: 0 },
    hit: { rot: -0.2, dx: -0.16, dy: 0, px: -0.7, py: 0 },
  },
  frog: {
    idle: STILL,
    attack: { rot: 0.13, dx: 0.24, dy: -0.04, px: 0.8, py: 0 },
    hit: { rot: -0.15, dx: -0.18, dy: 0, px: -0.9, py: 0 },
  },
};

let LN: Lean = STILL;
let RR = 40;
let lc = 1;
let ls = 0;
function setLean(l: Lean, r: number) {
  LN = l;
  RR = r;
  lc = Math.cos(l.rot);
  ls = Math.sin(l.rot);
}
/** body space (r units) -> local pixels, through the lean */
function mx(x: number, y: number): [number, number] {
  const ax = x - LN.px;
  const ay = y - LN.py;
  return [(LN.px + ax * lc - ay * ls + LN.dx) * RR, (LN.py + ax * ls + ay * lc + LN.dy) * RR];
}
function M(p: Pts): Pts {
  const out: Pts = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    const [x, y] = mx(p[i], p[i + 1]);
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}
/** local r units -> local pixels, no lean (things on the ground) */
const G = (p: number[]): Pts => p.map((v) => v * RR);
const E = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 34) => M(ell(cx, cy, rx, ry, rot, n));
const S = (c: number[], seg = 6) => M(spline(c, true, seg));

function inside(g: Ctx, p: Pts, fn: () => void) {
  g.save();
  path(g, p);
  g.clip();
  fn();
  g.restore();
}

/** a crayon stroke along a curve given in body space */
function band(g: Ctx, c: number[], color: string, w: number, paper = false) {
  const p = M(spline(c, false, 5));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = w * RR;
  if (paper) {
    path(g, p, false);
    g.strokeStyle = PAPER;
    g.stroke();
  }
  path(g, p, false);
  g.strokeStyle = wax(color, 0.85);
  g.stroke();
}
/** a pencil line along a curve given in body space */
function pline(g: Ctx, c: number[], w = 1, alpha = 1, passes = 2) {
  pencil(g, M(spline(c, false, 5)), false, { w, alpha, passes });
}
/** a pencil line in local space (r units, no lean) */
function gline(g: Ctx, c: number[], w = 1, alpha = 1, passes = 1) {
  pencil(g, spline(G(c), false, 5), false, { w, alpha, passes });
}
function sheen(g: Ctx, cx: number, cy: number, rx: number, ry: number, w = 0.07) {
  const [x, y] = mx(cx, cy);
  strokes(g, x, y, rx * RR, ry * RR, Math.PI * 1.08, Math.PI * 1.42, WHITE, w * RR, 2, 0.2);
}
function blush(g: Ctx, cx: number, cy: number, rx: number, ry: number) {
  crayon(g, E(cx, cy, rx, ry, 0, 16), BLUSH, { paper: false, wax: 0.7, slip: 0 });
}

// ------------------------------------------------------------------ eyes

type Mood = 'cool' | 'fierce' | 'ouch' | 'shut';

/** An eye at (cx, cy) in body space; lid in the body colour. look: how far the pupil sits forward. */
function eye(g: Ctx, pal: Pal, cx: number, cy: number, rx: number, ry: number, mood: Mood, pupil = 0.55, ouchDir = 1, o: { ring?: boolean; lid?: number; slope?: number } = {}) {
  const white = E(cx, cy, rx, ry, 0, 26);
  if (mood === 'ouch') {
    crayon(g, white, pal.main, { slip: 0.01 });
    const k = ouchDir;
    pline(g, [cx - rx * 0.7 * k, cy - ry * 0.6, cx + rx * 0.5 * k, cy, cx - rx * 0.7 * k, cy + ry * 0.55], 1.25, 1, 1);
    return;
  }
  crayon(g, white, WHITE, { slip: 0.012 });
  if (mood !== 'shut') {
    const pr = rx * pupil;
    const px = cx + rx - pr * 1.05;
    const py = cy + ry * 0.08;
    const pp = E(px, py, pr, pr * 1.12, 0, 18);
    inside(g, white, () => {
      crayon(g, pp, INK, { paper: false, slip: 0.008, wax: 0.95 });
    });
    const [hx, hy] = mx(px - pr * 0.35, py - pr * 0.4);
    g.fillStyle = WHITE;
    g.beginPath();
    g.arc(hx, hy, Math.max(0.6, pr * 0.32 * RR), 0, Math.PI * 2);
    g.fill();
  }
  // the lid: the part of the eye above a slanted line
  const top = mood === 'shut' ? 1.3 : mood === 'fierce' ? 0.05 : (o.lid ?? -0.3);
  const slope = mood === 'fierce' ? 0.75 : mood === 'shut' ? 0 : (o.slope ?? 0.28);
  const lidY = (x: number) => cy + ry * top + (x - cx) * slope;
  const raw = ell(cx, cy, rx * 1.04, ry * 1.04, 0, 26);
  for (let i = 0; i < raw.length; i += 2) raw[i + 1] = Math.min(raw[i + 1], lidY(raw[i]));
  crayon(g, M(raw), pal.main, { slip: 0.01 });
  if (o.ring !== false) pencil(g, white, true, { w: 0.85, passes: 1 });
  if (mood === 'shut') {
    pline(g, [cx - rx * 0.85, cy + ry * 0.05, cx, cy + ry * 0.35, cx + rx * 0.85, cy + ry * 0.05], 1.15, 1, 1);
  } else {
    pline(g, [cx - rx * 1.05, lidY(cx - rx * 1.05), cx + rx * 1.08, lidY(cx + rx * 1.08)], 1.2, 1, 2);
  }
}

// ------------------------------------------------------------------ the ant

interface Leg {
  hip: [number, number];
  /** the knee, in body space (it leans with the body) */
  knee: [number, number];
  /** the foot, on the ground (local) */
  foot: [number, number];
}
const ANT_LEGS: Record<Pose, Leg[]> = {
  idle: [
    { hip: [0.1, -0.64], knee: [0.48, -0.78], foot: [0.66, 0] },
    { hip: [-0.02, -0.62], knee: [-0.2, -0.52], foot: [-0.12, 0] },
    { hip: [-0.14, -0.64], knee: [-0.56, -0.72], foot: [-0.8, 0] },
  ],
  attack: [
    { hip: [0.1, -0.64], knee: [0.5, -0.76], foot: [0.92, 0] },
    { hip: [-0.02, -0.62], knee: [-0.16, -0.52], foot: [0.04, 0] },
    { hip: [-0.14, -0.64], knee: [-0.52, -0.7], foot: [-1.02, 0] },
  ],
  hit: [
    { hip: [0.1, -0.64], knee: [0.48, -0.84], foot: [0.5, -0.08] },
    { hip: [-0.02, -0.62], knee: [-0.22, -0.52], foot: [-0.32, 0] },
    { hip: [-0.14, -0.64], knee: [-0.56, -0.72], foot: [-0.98, 0] },
  ],
};

/** where the weapon's grip sits (local r units, face right) and its angle (0 = up, + = tipped forward) */
const HAND: Record<SamplePet, Record<Pose, [number, number, number]>> = {
  ant: { idle: [1.12, -0.5, 0.8], attack: [1.45, -0.6, 1.5], hit: [0.6, -0.95, -0.45] },
  frog: { idle: [1.12, -0.36, 0.7], attack: [1.5, -0.6, 1.5], hit: [0.72, -0.86, -0.4] },
};
/** the swing's angle at the moment of the lunge, by weapon: a slash, a club coming down, a level stab */
const SWING: Record<WeaponType, number> = { knife: 1.45, bat: 1.2, spear: 1.5, shield: 0.12 };
const SHIELD_AT: Record<SamplePet, Record<Pose, [number, number, number]>> = {
  ant: { idle: [1.2, -0.6, 0.08], attack: [1.6, -0.82, 0.12], hit: [0.95, -0.95, -0.2] },
  frog: { idle: [1.3, -0.55, 0.06], attack: [1.72, -0.72, 0.1], hit: [1.0, -0.85, -0.2] },
};
const reachFor = (type: SamplePet, pose: Pose, w: WeaponType) => (w === 'shield' ? SHIELD_AT : HAND)[type][pose];
/** the weapon's length in r */
const WL: Record<SamplePet, number> = { ant: 1.2, frog: 1.0 };

function seg(out: number[], ax: number, ay: number, bx: number, by: number, n: number) {
  for (let i = out.length ? 1 : 0; i <= n; i++) out.push(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
}

/** an insect leg: up and out to a sharp knee, down to a little foot that flicks outward */
function leg(g: Ctx, pal: Pal, l: Leg, far: boolean, hand?: [number, number, number]) {
  const [hx, hy] = mx(l.hip[0], l.hip[1]);
  let [kx, ky] = mx(l.knee[0], l.knee[1]);
  const fx = (hand ? hand[0] : l.foot[0]) * RR;
  const fy = (hand ? hand[1] : l.foot[1]) * RR;
  if (hand) {
    kx = (hx + fx) / 2 - RR * 0.05;
    ky = Math.max(hy, fy) + RR * 0.16;
  }
  const p: number[] = [];
  seg(p, hx, hy, kx, ky, 3);
  seg(p, kx, ky, fx, fy, 4);
  if (!hand) p.push(fx + (fx >= kx ? 1 : -1) * RR * 0.12, fy + RR * 0.01);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = RR * 0.11;
  path(g, p, false);
  g.strokeStyle = far ? pal.dark : PAPER;
  g.stroke();
  if (!far) {
    g.strokeStyle = wax(pal.dark, 0.85);
    g.stroke();
  }
  pencil(g, p, false, { passes: far ? 1 : 2, w: 0.75, alpha: far ? 0.7 : 1 });
}

function antenna(g: Ctx, pal: Pal, c: number[]) {
  pline(g, c, 1.05, 1, 2);
  const n = c.length;
  const [x, y] = mx(c[n - 2], c[n - 1]);
  const p = ell(x, y, RR * 0.085, RR * 0.085, 0, 14);
  crayon(g, p, pal.dark, { slip: 0.015 });
  pencil(g, p, true, { passes: 1, w: 0.8 });
}

/** a curved pincer from (bx, by) in body space: heading a, bending by curl over its length */
function pincer(g: Ctx, pal: Pal, bx: number, by: number, a: number, curl: number, len: number, w: number) {
  const outer: number[] = [];
  const inner: number[] = [];
  let x = bx;
  let y = by;
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = a + curl * t;
    const half = w * 0.5 * (1 - t * 0.92);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    outer.push(x + nx * half, y + ny * half);
    inner.push(x - nx * half, y - ny * half);
    x += (Math.cos(ang) * len) / n;
    y += (Math.sin(ang) * len) / n;
  }
  const pts: number[] = outer.slice();
  for (let i = inner.length - 2; i >= 0; i -= 2) pts.push(inner[i], inner[i + 1]);
  const p = M(pts);
  crayon(g, p, pal.dark, { slip: 0.015 });
  pencil(g, p, true, { passes: 1, w: 0.8 });
}

/** grip: 0 empty-handed, 1 a weapon, 2 a shield */
function paintAnt(g: Ctx, pal: Pal, r: number, pose: Pose, helmet: boolean, grip: number) {
  setLean(LEANS.ant[pose], r);
  const legs = ANT_LEGS[pose];
  const hand = grip ? (grip === 2 ? SHIELD_AT : HAND).ant[pose] : null;

  if (pose === 'attack') {
    for (let i = 0; i < 3; i++) gline(g, [-1.82 + i * 0.12, -0.5 - i * 0.4, -1.32 + i * 0.12, -0.5 - i * 0.4], 0.9, 0.7);
  }
  // far legs, a shade darker and behind
  for (const l of legs) {
    leg(g, pal, { hip: [l.hip[0] + 0.1, l.hip[1] - 0.04], knee: [l.knee[0] + 0.1, l.knee[1] - 0.05], foot: [l.foot[0] + 0.15, l.foot[1] - 0.025] }, true);
  }

  // abdomen: a big egg with two bands
  const gc: [number, number] = [-0.8, -0.8];
  const grot = 0.32;
  const gaster = E(gc[0], gc[1], 0.62, 0.5, grot);
  crayon(g, gaster, pal.main);
  inside(g, gaster, () => {
    const ca = Math.cos(grot);
    const sa = Math.sin(grot);
    for (const s of [-0.12, -0.36]) {
      const c: number[] = [];
      for (let k = -1; k <= 1.001; k += 0.5) {
        const along = s + 0.12 * (1 - k * k);
        const across = k * 0.55;
        c.push(gc[0] + along * ca - across * sa, gc[1] + along * sa + across * ca);
      }
      band(g, c, pal.dark, 0.11);
    }
  });
  shade(g, gaster, pal.dark, 0.16);
  hatch(g, gaster, { from: 0.12 });
  sheen(g, gc[0] - 0.05, gc[1] + 0.02, 0.42, 0.34);
  pencil(g, gaster, true);

  // waist and thorax
  const thorax = E(-0.04, -0.8, 0.27, 0.22, -0.3, 24);
  crayon(g, thorax, pal.main);
  shade(g, thorax, pal.dark, 0.1);
  hatch(g, thorax, { from: 0.0 });
  pencil(g, thorax, true);

  // near legs (the front one holds the weapon, drawn after the head)
  leg(g, pal, legs[2], false);
  leg(g, pal, legs[1], false);

  // head
  const hc: [number, number] = [0.62, -1.2];
  const head = E(hc[0], hc[1], 0.56, 0.52, 0.05, 36);
  crayon(g, head, pal.main);
  shade(g, head, pal.dark, 0.14);
  hatch(g, head, { from: 0.3 });
  sheen(g, hc[0] - 0.02, hc[1] + 0.02, 0.4, 0.36);
  pencil(g, head, true);

  // mandibles: two curved pincers, shut, or wide open for the bite
  if (pose === 'attack' && grip === 0) {
    pincer(g, pal, 1.0, -1.02, -0.5, 1.6, 0.44, 0.15);
    pincer(g, pal, 0.98, -0.84, 0.62, -1.6, 0.42, 0.14);
  } else {
    pincer(g, pal, 1.04, -0.96, -0.15, 1.6, 0.34, 0.13);
    pincer(g, pal, 0.99, -0.8, 0.2, -1.6, 0.31, 0.12);
  }

  // face
  const mood: Mood = pose === 'idle' ? 'cool' : pose === 'attack' ? 'fierce' : 'ouch';
  eye(g, pal, 0.56, -1.26, 0.18, 0.22, mood, 0.6, 1, { lid: -0.6, slope: 0.1 });
  eye(g, pal, 0.92, -1.24, 0.15, 0.21, mood, 0.62, -1, { lid: -0.6, slope: 0.1 });
  if (pose === 'idle') pline(g, [0.78, -0.95, 0.88, -0.93, 0.97, -0.97, 1.0, -1.02], 0.95, 1, 1);
  else if (pose === 'attack') {
    const mouth = S([0.84, -0.96, 1.0, -0.98, 0.98, -0.84, 0.88, -0.86], 4);
    crayon(g, mouth, MOUTH, { slip: 0.01 });
    pencil(g, mouth, true, { passes: 1, w: 0.8 });
  } else pline(g, [0.8, -0.92, 0.86, -0.96, 0.92, -0.91, 0.98, -0.95], 0.85, 1, 1);
  blush(g, 0.66, -0.98, 0.1, 0.06);

  // antennae
  const hit = pose === 'hit';
  const atk = pose === 'attack';
  const top = helmet ? 0.18 : 0;
  antenna(g, pal, hit ? [0.42, -1.62 - top, 0.12, -1.98, -0.25, -2.04] : [0.42, -1.62 - top, 0.3, -2.0, atk ? 0.62 : 0.5, -2.32]);
  antenna(g, pal, hit ? [0.74, -1.66 - top, 0.5, -2.1, 0.18, -2.25] : [0.74, -1.66 - top, 0.86, -2.06, atk ? 1.24 : 1.1, -2.2]);

  if (helmet) {
    const [bx, by] = mx(0.6, -1.5);
    paintHelmet(g, bx, by, RR * 1.12, LN.rot + 0.06);
  }

  // the front leg: on the ground, or holding the weapon
  leg(g, pal, legs[0], false, hand ?? undefined);

  if (hit) impact(g, 1.42, -1.55);
}

/** the little pencil burst of a hit, in local r units */
function impact(g: Ctx, x: number, y: number) {
  for (let i = 0; i < 4; i++) {
    const a = -0.9 + i * 0.55;
    gline(g, [x + Math.cos(a) * 0.1, y + Math.sin(a) * 0.1, x + Math.cos(a) * 0.32, y + Math.sin(a) * 0.32], 1, 0.9);
  }
}

// ------------------------------------------------------------------ the frog

/** a limb along a polyline (local px) as an outlined, tapered crayon shape with round ends */
function limb(g: Ctx, p: number[], w0: number, w1: number, color: string, weight = 0.85) {
  const n = p.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  const nrm = (i: number): [number, number] => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = p[b * 2] - p[a * 2];
    const dy = p[b * 2 + 1] - p[a * 2 + 1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  for (let i = 0; i < n; i++) {
    const [nx, ny] = nrm(i);
    const w = (w0 + ((w1 - w0) * i) / Math.max(1, n - 1)) / 2;
    left.push(p[i * 2] + nx * w, p[i * 2 + 1] + ny * w);
    right.push(p[i * 2] - nx * w, p[i * 2 + 1] - ny * w);
  }
  const out = left.slice();
  const cap = (i: number, w: number, dir: number) => {
    const [nx, ny] = nrm(i);
    const tx = ny * dir;
    const ty = -nx * dir;
    for (let k = 1; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      const c = Math.cos(a) * dir;
      out.push(p[i * 2] + (nx * c + tx * Math.sin(a)) * w, p[i * 2 + 1] + (ny * c + ty * Math.sin(a)) * w);
    }
  };
  cap(n - 1, w1 / 2, 1);
  for (let i = right.length - 2; i >= 0; i -= 2) out.push(right[i], right[i + 1]);
  cap(0, w0 / 2, -1);
  crayon(g, out, color, { slip: 0.02 });
  pencil(g, out, true, { w: weight });
  return out;
}

/** three round toes fanned at (x, y) local r units */
function toes(g: Ctx, pal: Pal, x: number, y: number, dir: number, s = 1) {
  for (let i = 0; i < 3; i++) {
    const p = ell((x + dir * (0.03 - i * 0.02) + (i - 1) * 0.07 * s) * RR, (y - Math.abs(i - 1) * 0.015) * RR, RR * 0.058 * s, RR * 0.042 * s, 0, 12);
    crayon(g, p, pal.main, { slip: 0.01 });
    pencil(g, p, true, { passes: 1, w: 0.7 });
  }
}

function paintFrog(g: Ctx, pal: Pal, r: number, pose: Pose, helmet: boolean, grip: number) {
  setLean(LEANS.frog[pose], r);
  const atk = pose === 'attack';
  const hit = pose === 'hit';
  const hand = grip ? (grip === 2 ? SHIELD_AT : HAND).frog[pose] : null;
  const mood: Mood = pose === 'idle' ? 'cool' : atk ? 'fierce' : 'ouch';

  if (atk) {
    for (let i = 0; i < 3; i++) gline(g, [-1.55 + i * 0.1, -0.55 - i * 0.36, -1.1 + i * 0.1, -0.55 - i * 0.36], 0.9, 0.7);
  }

  // the far eye bump peeks over the head
  const far = E(0.12, -1.5, 0.27, 0.26, 0, 26);
  crayon(g, far, pal.main);
  pencil(g, far, true, { passes: 1 });
  eye(g, pal, 0.14, -1.51, 0.2, 0.19, mood, 0.6, 1, { ring: false });

  // the far front arm, mostly hidden
  if (!atk && !hit) {
    const farArm = spline(G(hit ? [0.9, -0.5, 1.0, -0.3, 1.04, -0.1] : [0.92, -0.45, 1.0, -0.25, 1.02, -0.03]), false, 4);
    g.lineCap = 'round';
    g.lineWidth = RR * 0.13;
    path(g, farArm, false);
    g.strokeStyle = pal.dark;
    g.stroke();
  }

  // the back foot, flat on the ground under the thigh (in the lunge the leg kicks out behind)
  if (atk) {
    const [kx, ky] = mx(-1.0, -0.2);
    limb(g, [kx, ky, -1.12 * RR, -0.22 * RR, -1.3 * RR, -0.06 * RR], 0.26 * RR, 0.13 * RR, pal.main);
    toes(g, pal, -1.36, -0.02, -1, 0.95);
  } else {
    const foot = spline(G([-0.98, -0.08, -0.9, -0.22, -0.45, -0.12, -0.08, -0.07, -0.04, 0.02, -0.5, 0.03, -0.95, 0.03]), true, 5);
    crayon(g, foot, pal.main);
    hatch(g, foot, { from: 0.0, alpha: 0.4 });
    pencil(g, foot, true);
    toes(g, pal, -0.02, -0.01, 1);
  }

  // body: a sitting lump, highest at the head
  const body = S([-0.95, -0.12, -1.08, -0.5, -0.88, -0.95, -0.36, -1.24, 0.3, -1.38, 0.88, -1.28, 1.2, -0.98, 1.18, -0.58, 0.9, -0.16, 0.3, -0.02, -0.45, -0.02], 6);
  crayon(g, body, pal.main);
  inside(g, body, () => {
    crayon(g, E(0.74, -0.3, 0.66, 0.42, -0.2, 28), pal.light, { paper: false, slip: 0.02 });
    for (const [sx, sy, sr] of [
      [-0.3, -1.02, 0.13],
      [-0.7, -0.86, 0.09],
      [0.04, -1.18, 0.075],
      [-0.58, -1.1, 0.06],
    ]) {
      crayon(g, E(sx, sy, sr * 1.2, sr, 0.3, 16), pal.dark, { paper: false, slip: 0.01 });
    }
  });
  shade(g, body, pal.dark, 0.16);
  hatch(g, body, { from: 0.32 });
  sheen(g, -0.05, -0.62, 0.78, 0.66, 0.08);
  pencil(g, body, true, { w: 1.1 });

  // the thigh, chunky, with two stripes
  const tc: [number, number] = [-0.52, -0.42];
  const trot = atk ? -0.25 : -0.35;
  const thigh = E(tc[0], tc[1], 0.5, 0.35, trot, 30);
  crayon(g, thigh, pal.main);
  inside(g, thigh, () => {
    for (const s of [-0.12, 0.14]) {
      const ca = Math.cos(trot);
      const sa = Math.sin(trot);
      const c: number[] = [];
      for (let k = -1; k <= 1.001; k += 0.5) {
        const along = s + 0.08 * (1 - k * k);
        const across = k * 0.4;
        c.push(tc[0] + along * ca - across * sa, tc[1] + along * sa + across * ca);
      }
      band(g, c, pal.dark, 0.08);
    }
  });
  shade(g, thigh, pal.dark, 0.12);
  hatch(g, thigh, { from: 0.15 });
  pencil(g, thigh, true);

  // mouth
  if (atk && grip === 0) {
    const open = S([1.22, -1.0, 0.6, -0.84, 1.2, -0.6], 4);
    crayon(g, open, MOUTH, { slip: 0.01 });
    pencil(g, open, true, { passes: 1 });
    // the tongue lash
    const [ax, ay] = mx(0.85, -0.8);
    const tng = spline([ax, ay, 1.55 * RR, -1.05 * RR, 2.15 * RR, -1.0 * RR], false, 6);
    limb(g, tng, 0.15 * RR, 0.11 * RR, TONGUE, 0.75);
    const blob = ell(2.22 * RR, -1.0 * RR, RR * 0.17, RR * 0.15, 0, 16);
    crayon(g, blob, TONGUE);
    pencil(g, blob, true, { passes: 2, w: 0.85 });
  } else if (atk) {
    const open = S([1.2, -0.92, 0.66, -0.82, 0.95, -0.6, 1.14, -0.66], 4);
    crayon(g, open, MOUTH, { slip: 0.01 });
    crayon(g, S([0.86, -0.7, 1.0, -0.74, 1.06, -0.66, 0.95, -0.64], 3), TONGUE, { paper: false, slip: 0 });
    pencil(g, open, true, { passes: 1 });
  } else if (hit) {
    pline(g, [1.18, -0.78, 1.02, -0.86, 0.88, -0.76, 0.72, -0.86, 0.56, -0.78], 1.1, 1, 2);
  } else {
    // the wide, pleased grin, curling up at the back
    pline(g, [1.19, -0.86, 1.0, -0.76, 0.72, -0.74, 0.5, -0.8, 0.4, -0.94], 1.25, 1, 2);
  }
  blush(g, 0.68, -0.62, 0.13, 0.07);
  if (!atk) {
    // nostril
    const [nx, ny] = mx(1.08, -1.1);
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(nx, ny, RR * 0.032, RR * 0.022, 0, 0, Math.PI * 2);
    g.fill();
  }

  // the near eye bump and eye
  const near = E(0.6, -1.46, 0.31, 0.3, 0, 28);
  crayon(g, near, pal.main);
  shade(g, near, pal.dark, 0.1);
  hatch(g, near, { from: 0.35, alpha: 0.4 });
  pencil(g, near, true, { w: 1.05 });
  eye(g, pal, 0.63, -1.47, 0.24, 0.225, mood, 0.56, -1, { ring: false });

  if (helmet) {
    const [bx, by] = mx(0.38, -1.58);
    paintHelmet(g, bx, by, RR * 1.08, LN.rot + 0.08);
  }

  // the near front arm: to the ground, or to the weapon
  const [sx, sy] = mx(0.5, -0.52);
  const hx = hand ? hand[0] : atk ? 1.2 : hit ? 0.92 : 0.84;
  const hy = hand ? hand[1] : atk ? -0.06 : hit ? -0.94 : -0.02;
  const ex = (sx + hx * RR) / 2 + RR * (hit ? 0.14 : 0.08);
  const ey = (sy + hy * RR) / 2 + RR * (hit ? 0.26 : 0.06);
  limb(g, spline([sx, sy, ex, ey, hx * RR, hy * RR], false, 4), 0.2 * RR, 0.14 * RR, pal.main, 0.8);
  if (!hand) toes(g, pal, hx + 0.02, hy, 1, hit ? 1.1 : 1);

  if (hit) impact(g, 1.42, -1.5);
}

// ------------------------------------------------------------------ assembly

const POSES: Pose[] = ['idle', 'attack', 'hit'];
/** room for the painting before it is trimmed: x, y, w, h in r (a spear's lunge reaches furthest) */
const ROOM: [number, number, number, number] = [-2.3, -3.0, 5.9, 3.7];

function shadow(g: Ctx, type: SamplePet, r: number) {
  const rx = (type === 'ant' ? 1.08 : 1.1) * r;
  const ry = (type === 'ant' ? 0.18 : 0.22) * r;
  const cx = type === 'ant' ? -0.1 * r : 0.05 * r;
  const p = ell(cx, ry * 0.15, rx, ry, 0, 26);
  path(g, p);
  g.fillStyle = wax('rgba(46, 52, 40, 0.2)', 0.7);
  g.fill();
  hatch(g, p, { from: -1, alpha: 0.14, angle: -0.5, gap: Math.max(2, r * 0.1) });
}

function blinkAt(t: number) {
  const p = (((t + 0.6) % 3.4) + 3.4) % 3.4;
  return p < 0.13 || (p > 0.32 && p < 0.42 && Math.floor((t + 0.6) / 3.4) % 3 === 1);
}

function lids(g: Ctx, type: SamplePet, pal: Pal, r: number) {
  setLean(STILL, r);
  if (type === 'ant') {
    eye(g, pal, 0.56, -1.26, 0.18, 0.22, 'shut');
    eye(g, pal, 0.92, -1.24, 0.15, 0.21, 'shut');
  } else {
    eye(g, pal, 0.14, -1.51, 0.2, 0.19, 'shut', 0, 1, { ring: false });
    eye(g, pal, 0.63, -1.47, 0.24, 0.225, 'shut', 0, 1, { ring: false });
  }
}

function hand(g: Ctx, type: SamplePet, pal: Pal, r: number) {
  const p = ell(0.02 * r, 0.02 * r, r * (type === 'ant' ? 0.1 : 0.12), r * (type === 'ant' ? 0.09 : 0.11), 0, 14);
  crayon(g, p, type === 'ant' ? pal.dark : pal.main, { slip: 0.015 });
  pencil(g, p, true, { passes: 1, w: 0.8 });
}

/** The whole fighter facing right at (0, 0): shadow, body, weapon in hand. */
function paintPet(g: Ctx, type: SamplePet, pal: Pal, r: number, pose: Pose, helmet: boolean, weapon: WeaponType | null, boil: number) {
  const tid = type === 'ant' ? 1 : 2;
  begin(hashSeed(tid, 9, boil), r);
  shadow(g, type, r);
  const grip = weapon ? (weapon === 'shield' ? 2 : 1) : 0;
  begin(hashSeed(tid, POSES.indexOf(pose), boil), r);
  if (type === 'ant') paintAnt(g, pal, r, pose, helmet, grip);
  else paintFrog(g, pal, r, pose, helmet, grip);
  if (!weapon) return;
  const [hx, hy, a0] = reachFor(type, pose, weapon);
  const L = WL[type] * r * (weapon === 'spear' ? 0.8 : 1);
  g.save();
  g.translate(hx * r, hy * r);
  g.save();
  g.rotate(pose === 'attack' ? SWING[weapon] : a0);
  begin(hashSeed(7, boil, weapon.length), L * 0.75);
  paintWeapon(g, weapon, L, pose === 'attack');
  g.restore();
  if (weapon !== 'shield') {
    begin(hashSeed(tid, 5, boil), r);
    hand(g, type, pal, r);
  }
  g.restore();
}

export const style4: ArtStyle = {
  NAME: 'Pencil & Crayon',
  BLURB: 'a storybook sketch: wobbly graphite, hatching, waxy crayon on paper',
  drawPet(ctx, type, team, x, y, r, pose, t, o = {}) {
    const face = o.face ?? 1;
    const weapon = o.weapon ?? null;
    const helmet = !!o.helmet;
    const pal = TEAM[team as Team];
    // the line boils: three drawings, cycled 8 times a second
    const boil = ((Math.floor(t * 8) % 3) + 3) % 3;
    const big = r > 34;
    const rk = Math.round(r * 2) / 2;

    ctx.save();
    ctx.translate(x, y);
    // the sprite is made at the scale before the breath, so breathing does not make new ones
    const sc = big ? 1 : deviceScale(ctx);
    if (pose === 'idle') {
      const b = Math.sin(t * 2.4 + x * 0.05);
      ctx.scale(face * (1 - 0.018 * b), 1 + 0.032 * b);
    } else ctx.scale(face, 1);

    // big (the sheet): painted directly. Game size: painted once per look into a trimmed sprite, then stamped
    if (big) paintPet(ctx, type, pal, r, pose, helmet, weapon, boil);
    else {
      const key = `${type}|${team}|${pose}|${helmet ? 1 : 0}|${weapon ?? '-'}|${boil}|${rk}`;
      stamp(ctx, key, ROOM[0] * r, ROOM[1] * r, ROOM[2] * r, ROOM[3] * r, sc, (g) => paintPet(g, type, pal, r, pose, helmet, weapon, boil));
    }

    if (pose === 'idle' && blinkAt(t)) {
      const paint = (g: Ctx) => {
        begin(hashSeed(type === 'ant' ? 1 : 2, 6, boil), r);
        lids(g, type, pal, r);
      };
      if (big) paint(ctx);
      else stamp(ctx, `blink|${type}|${team}|${boil}|${rk}`, -0.2 * r, -1.9 * r, 1.4 * r, 0.9 * r, sc, paint);
    }
    ctx.restore();
  },
  drawItem(ctx, type, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    begin(hashSeed(3, type.length, type.charCodeAt(0)), size * 0.42, 1.15);
    paintItem(ctx, type, size);
    ctx.restore();
  },
};
