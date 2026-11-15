import type { PetType, Team } from '../../types';
import type { ArtStyle, ItemType, PetOpts, Pose } from './api';
import { TEAM } from '../../theme';
import { clamp } from '../../util';
import { BRUSH, EVEN, PRESS, SWELL, along, arc, begin, cub, dot, dryPattern, emit, inkGrain, plateGrain, pt, quad, tail, type Prof } from './style1-brush';
import { INK, helmet, itemIcon, sealStamp, setInk, weapon } from './style1-items';

/*
 * Style sample 1: Ink Brush. Sumi-e confidence meets a modern cartoon.
 *
 * Every line is a brush stroke built as a filled shape (style1-brush.ts): it lands, swells and flicks off, and
 * the outline of a round part is two strokes with a gap where the brush lifted (on the lit upper front); the
 * heaviest strokes end in flying white when the pet is drawn big. Under the ink, flat plates of the team colour
 * sit 1-2 px off register, like a print; one dry-brush wash of the team's dark on the shadow side; the team's
 * light as one dry highlight. Eyes are ink dots with a white glint. Nothing else: ink, the team colour and its
 * light.
 *
 * Each pet is drawn in "R50" units (as if r were 50, feet on the origin, facing right), so the drawing is the
 * same at every size; the ink is a little heavier when small so it still reads at game size. The ink of one
 * layer goes into one path and one fill (all strokes wind the same way), so a pet is about a dozen fills, and
 * the textures are tiles built once.
 */
type Ctx = CanvasRenderingContext2D;
type Col = (typeof TEAM)[number];

/** ink weight multiplier (heavier when small) */
let G = 1;
/** detail: 0 at game size (ant), 1 mid (frog at game size), 2 big */
let Q = 2;
/** scale from R50 units to pixels */
let K = 1;

/** steps for a curve of length l (R50 units) */
const st = (l: number) => clamp(Math.round((l * K) / (Q === 2 ? 2.4 : 3.2)), 2, 48);
function ln(x0: number, y0: number, x1: number, y1: number) {
  return Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
}
/** a cubic centreline from (x0,y0) */
function C(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  begin();
  pt(x0, y0);
  cub(x1, y1, x2, y2, x3, y3, st((ln(x0, y0, x1, y1) + ln(x1, y1, x2, y2) + ln(x2, y2, x3, y3) + ln(x0, y0, x3, y3)) / 2));
}
/** an ellipse-arc centreline */
function A(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number) {
  begin();
  arc(cx, cy, rx, ry, rot, a0, a1, st((Math.abs(a1 - a0) * (rx + ry)) / 2));
}
const ink = (ctx: Ctx, w: number, p: Prof, seed = 0) => emit(ctx, w * G, p, seed);
const ell = (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => dot(ctx, x, y, rx, ry, rot);

/** heavy late: the shadow side of an outline drawn from the light */
const LATE: Prof = { a: 0.12, h: 0.6, b: 0.02, wob: 0.1, cap: false };
/** a sweep round a body: lands, presses through the shadow side, runs out dry at the top */
const SWEEP: Prof = { a: 0.3, h: 0.4, b: 0.02, wob: 0.1, cap: true };
/** lands heavy and runs out */
const TAIL: Prof = { a: 0.55, h: 0.2, b: 0.0, wob: 0.08, cap: true };
/** the fat limb of a frog */
const LIMB: Prof = { a: 0.95, h: 0.3, b: 0.75, wob: 0.05, cap: false };

/** Is the pet blinking at time t? A quick blink every few seconds. */
const blinking = (t: number, k: number) => (t * 0.37 + k) % 1 < 0.045;

// ------------------------------------------------------------------ flying white

const tails: Path2D[] = [];
const tailAng: number[] = [];
/** Adds flying white to the end of the centreline just inked (big pets only). */
function addTail(w: number, seed: number, from = 0.55) {
  if (Q < 2 || tails.length >= 4) return;
  const p = new Path2D();
  tailAng.push(tail(p, w * G, from, 0.24, seed));
  tails.push(p);
}
function flushTails(ctx: Ctx) {
  if (!tails.length) return;
  const pat = dryPattern(ctx, INK, 23, -1);
  for (let i = 0; i < tails.length; i++) {
    along(pat, tailAng[i]);
    ctx.fillStyle = pat;
    ctx.fill(tails[i]);
  }
  tails.length = 0;
  tailAng.length = 0;
}

// ------------------------------------------------------------------ pupils

/*
 * Ink-dot pupils stay solid black: when the ink is textured (big pets), they are held back from the textured
 * fill and painted in a fill of their own, else they join the ink path.
 */
const pupils: number[] = [];
function pupil(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  if (Q === 2) pupils.push(x, y, rx, ry, rot);
  else ell(ctx, x, y, rx, ry, rot);
}
function flushPupils(ctx: Ctx) {
  if (!pupils.length) return;
  ctx.beginPath();
  for (let i = 0; i < pupils.length; i += 5) ell(ctx, pupils[i], pupils[i + 1], pupils[i + 2], pupils[i + 3], pupils[i + 4]);
  ctx.fillStyle = INK;
  ctx.fill();
  pupils.length = 0;
}

// ------------------------------------------------------------------ paper and print

/** Over the path just filled with ink: the paper showing through (big pets only). */
function inkTexture(ctx: Ctx) {
  if (Q === 2) inkGrain(ctx);
}
/** Over the path just filled with a colour plate: the grain of the print (big pets only). */
function plateTexture(ctx: Ctx) {
  if (Q === 2) plateGrain(ctx);
}

// ------------------------------------------------------------------ shared bits

/** the ground shadow: one horizontal smear of thin ink */
function shadow(ctx: Ctx, w: number) {
  ctx.beginPath();
  begin();
  pt(-w, 1.2);
  quad(0, 3.4, w * 1.05, 0.6, st(w * 2));
  emit(ctx, 9, { a: 0.5, h: 0.42, b: 0.12, wob: 0.15, cap: true }, 3);
  ctx.fillStyle = 'rgba(28, 44, 22, 0.22)';
  ctx.fill();
}

/** the colour plates are drawn this far up and back of the ink (R50 units), like a print off register */
const offOf = () => clamp(1.7 / K, 1.6, 3.6);

/** a highlight: the team's light dragged on dry when big, flat when small */
function lightFill(ctx: Ctx, c: Col) {
  ctx.fillStyle = Q < 2 ? c.light : dryPattern(ctx, c.light, 17, 2.4);
  ctx.fill();
}
/** the shadow side: the team's dark dragged on dry */
function washFill(ctx: Ctx, c: Col) {
  if (Q < 2) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.dark;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = dryPattern(ctx, c.dark, 5, 1.25);
    ctx.fill();
  }
}

/** the white glints of ink-dot eyes */
function glints(ctx: Ctx, pts: number[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 3) {
    const g = Math.max(pts[i + 2], 0.8 / K);
    ell(ctx, pts[i], pts[i + 1], g, g);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** a squinting eye: a ">" (or "<" when dir is -1) of two quick strokes */
function squint(ctx: Ctx, x: number, y: number, s: number, dir: number) {
  begin();
  pt(x - s * dir, y - s * 0.9);
  quad(x + s * 0.2 * dir, y - s * 0.15, x + s * 0.55 * dir, y + 0.1 * s, 3);
  ink(ctx, 3.4, BRUSH, 1);
  begin();
  pt(x - s * dir, y + s * 0.85);
  quad(x + s * 0.2 * dir, y + s * 0.2, x + s * 0.55 * dir, y + 0.05 * s, 3);
  ink(ctx, 3.4, BRUSH, 2);
}

/** a closed eye: one curved stroke */
function shut(ctx: Ctx, x: number, y: number, s: number) {
  begin();
  pt(x - s, y - s * 0.1);
  quad(x, y + s * 0.55, x + s, y - s * 0.15, 4);
  ink(ctx, 3.2, SWELL, 4);
}

/** quick impact flicks in front of a pet that is hit */
function impact(ctx: Ctx, x: number, y: number) {
  const a = [-0.55, 0, 0.55];
  for (let i = 0; i < 3; i++) {
    const c = Math.cos(a[i]);
    const s = Math.sin(a[i]);
    begin();
    pt(x + c * 7, y + s * 7);
    pt(x + c * 13, y + s * 13);
    pt(x + c * 20, y + s * 20);
    ink(ctx, 3.2, BRUSH, i);
  }
}

/** a sweep of dry ink: the trail of a swing or a thrust */
function trail(ctx: Ctx) {
  ctx.fillStyle = Q < 2 ? 'rgba(23, 22, 29, 0.3)' : dryPattern(ctx, INK, 11, 1.1);
  ctx.fill();
}

// ------------------------------------------------------------------ a pet's pose

interface Look {
  c: Col;
  pose: Pose;
  br: number;
  weapon: PetOpts['weapon'];
  helmet: boolean;
  blink: boolean;
  /** body transform of the pose: shift, lean, stretch */
  dx: number;
  rot: number;
  sx: number;
  sy: number;
}

/** a ground point (gx, 0) in the leaning body frame, so feet stay planted while the body lunges or flinches */
let FX = 0;
let FY = 0;
function foot(L: Look, gx: number) {
  const x = gx - L.dx;
  const c = Math.cos(-L.rot);
  const s = Math.sin(-L.rot);
  FX = (x * c) / L.sx;
  FY = (x * s) / L.sy;
}

/** an ant leg: hip, a knee bent up and out, a planted foot, a flick of a toe (dir: which way it points) */
function leg(ctx: Ctx, L: Look, hx: number, hy: number, kx: number, ky: number, gx: number, w: number, seed: number) {
  foot(L, gx);
  const dir = gx < hx ? -1 : 1;
  begin();
  pt(hx, hy);
  quad((hx + kx) / 2, Math.min(hy, ky) - 6, kx, ky, st(ln(hx, hy, kx, ky)));
  quad(kx + (FX - kx) * 0.12 + dir * 5, ky + (FY - ky) * 0.45, FX, FY, st(ln(kx, ky, FX, FY)));
  ink(ctx, w, BRUSH, seed);
  begin();
  pt(FX - dir, FY);
  pt(FX + dir * 4, FY + 0.6);
  pt(FX + dir * 9, FY + 0.3);
  ink(ctx, w * 0.85, EVEN, seed + 1);
}

// ------------------------------------------------------------------ the ant

function ant(ctx: Ctx, L: Look) {
  const { c, pose } = L;
  const atk = pose === 'attack';
  const hit = pose === 'hit';
  const hb = pose === 'idle' ? L.br * 1.4 : 0;
  // gaster (abdomen), thorax, head
  const gx = -26;
  const gy = -30 + L.br * 0.4;
  const grx = 27 + L.br * 0.5;
  const gry = 21 + L.br * 0.4;
  const gr = -0.5;
  const tx = 7;
  const ty = -51 + hb * 0.3;
  const trx = 12.5;
  const tr_ = 9.5;
  const tr = -0.85;
  const hx = 24;
  const hy = -84 + hb;
  const hrx = 28;
  const hry = 25.5;
  const hr = 0.12;
  const off = offOf();
  const hand = atk ? [44, -62] : hit ? [24, -46] : [39, -50];
  const elbow = atk ? [30, -56] : hit ? [22, -40] : [27, -40];

  // ---- far limbs, behind the body: the team's dark
  ctx.beginPath();
  leg(ctx, L, 7, -47, -3, -45, atk ? -13 : hit ? -3 : -7, 3.2, 1);
  leg(ctx, L, 12, -48, 37, -49, atk ? 50 : hit ? 39 : 45, 3.2, 3);
  if (atk) C(8, -58, -2, -62, -10, -56, -14, -48);
  else if (hit) C(14, -58, 24, -66, 32, -74, 36, -80);
  else C(16, -58, 26, -62, 34, -60, 42, -58);
  ink(ctx, 3, BRUSH, 5);
  // the far antenna
  if (hit) C(30, hy - 21, 26, hy - 32, 16, hy - 40, 4, hy - 42);
  else if (L.helmet) C(26, hy - 30, 32, hy - 40, 40, hy - 46, 50, hy - 46);
  else C(32, hy - 21, 33, hy - 32, 32, hy - 40, 40, hy - 42);
  if (!hit && !L.helmet) cub(46, hy - 44, 52, hy - 40, 57, hy - 35, st(14));
  if (!hit && L.helmet) cub(56, hy - 46, 60, hy - 42, 62, hy - 37, st(14));
  ink(ctx, 2.8, BRUSH, 6);
  ctx.fillStyle = c.dark;
  ctx.fill();
  // the near hind leg comes out from behind the abdomen
  ctx.beginPath();
  leg(ctx, L, 2, -44, -12, -38, atk ? -27 : hit ? -15 : -21, 4, 9);
  ctx.fillStyle = INK;
  ctx.fill();

  // ---- the colour plate, off register
  ctx.translate(-off, -off * 0.7);
  ctx.beginPath();
  ell(ctx, gx, gy, grx, gry, gr);
  ell(ctx, tx, ty, trx, tr_, tr);
  ell(ctx, hx, hy, hrx, hry, hr);
  ctx.fillStyle = c.main;
  ctx.fill();
  plateTexture(ctx);
  // the light: one dry highlight on the brow, one along the abdomen
  ctx.beginPath();
  A(hx, hy, hrx - 8, hry - 8, hr, -0.25, -1.85);
  emit(ctx, 9, TAIL, 2);
  A(gx, gy, grx - 7.5, gry - 7.5, gr, -0.6, -2.1);
  emit(ctx, 7.5, TAIL, 5);
  lightFill(ctx, c);
  // the shadow side: one dry wash under the abdomen and the jaw
  ctx.beginPath();
  A(gx, gy, grx - 6.5, gry - 6.5, gr, 2.85, 0.95);
  emit(ctx, 12, SWELL, 6);
  A(hx, hy, hrx - 6, hry - 6, hr, 2.9, 1.3);
  emit(ctx, 10, SWELL, 7);
  washFill(ctx, c);
  ctx.translate(off, off * 0.7);

  // ---- ink
  ctx.beginPath();
  // abdomen: a heavy stroke round the back and under, a light one along the top, two segment marks
  A(gx, gy, grx, gry, gr, -5.3, -1.95);
  ink(ctx, 6.2, SWEEP, 1);
  addTail(6.2, 1, 0.6);
  A(gx, gy, grx, gry, gr, -0.42, -1.6);
  ink(ctx, 2.8, SWELL, 2);
  if (Q > 0) {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(gr);
    C(3, -20, -3, -12, -4, -4, -2, 4);
    ink(ctx, 2.6, BRUSH, 3);
    C(-10, -19, -15, -11, -16, -3, -14, 3);
    ink(ctx, 2.2, BRUSH, 4);
    ctx.restore();
  }
  // thorax: its back, and a short stroke under it
  A(tx, ty, trx, tr_, tr, -2.75, -0.95);
  ink(ctx, 3.4, SWELL, 5);
  A(tx, ty, trx, tr_, tr, 0.5, 2.2);
  ink(ctx, 2.6, SWELL, 6);
  // head: heavy round the back and under the chin, light over the brow
  A(hx, hy, hrx, hry, hr, -5.4, -2.1);
  ink(ctx, 6.4, SWEEP, 7);
  addTail(6.4, 7, 0.62);
  A(hx, hy, hrx, hry, hr, 0.12, -1.42);
  ink(ctx, 2.8, SWELL, 8);
  // near legs
  leg(ctx, L, 9, -46, 29, -44, atk ? 38 : hit ? 27 : 33, 4, 11);
  // mandibles: open wide in a bite, else a neat closed pincer
  if (atk && !L.weapon) {
    C(43, hy + 14, 52, hy + 7, 61, hy + 8, 64, hy + 14);
    ink(ctx, 4, BRUSH, 13);
    C(41, hy + 20, 49, hy + 28, 58, hy + 30, 62, hy + 25);
    ink(ctx, 4, BRUSH, 14);
  } else {
    // the mandibles: two little fangs at the chin, tips turned in
    C(39, hy + 19, 43, hy + 22, 44, hy + 26, 47, hy + 29);
    ink(ctx, 3.4, BRUSH, 13);
    C(47, hy + 16, 52, hy + 19, 53, hy + 24, 50.5, hy + 28.5);
    ink(ctx, 3.2, BRUSH, 14);
  }
  // near antenna: up from the brow, a sharp elbow, a club at the tip
  if (hit) {
    C(17, hy - 22, 10, hy - 32, 0, hy - 38, -12, hy - 35);
    ink(ctx, 3.2, BRUSH, 15);
    ell(ctx, -13, hy - 35, 3, 2.6);
    ell(ctx, 3, hy - 42, 2.6, 2.2);
  } else if (L.helmet) {
    // through the helmet like the horns of a kabuto
    C(14, hy - 34, 9, hy - 41, 12, hy - 47, 21, hy - 48.5);
    cub(29, hy - 50, 36, hy - 47, 39, hy - 41, st(20));
    ink(ctx, 3.4, BRUSH, 15);
    ell(ctx, 39.5, hy - 40, 3.2, 2.8, 0.4);
    ell(ctx, 62.5, hy - 36, 2.7, 2.3, 0.6);
  } else {
    C(18, hy - 22, 13, hy - 32, 9, hy - 40, 15, hy - 44);
    cub(21, hy - 47, 29, hy - 45, 35, hy - 41, st(20));
    ink(ctx, 3.4, BRUSH, 15);
    ell(ctx, 36.5, hy - 40, 3.2, 2.8, 0.4);
    ell(ctx, 58, hy - 34, 2.7, 2.3, 0.6);
  }
  // eyes
  const ex = 35;
  const ey = hy;
  if (hit) {
    squint(ctx, ex - 1, ey, 6.5, 1);
    squint(ctx, ex + 13, ey - 1, 4.5, -1);
  } else if (L.blink) {
    shut(ctx, ex, ey + 2, 7.5);
    shut(ctx, ex + 12.5, ey, 4.5);
  } else {
    pupil(ctx, ex, ey, 8.4, 11, 0.12);
    pupil(ctx, ex + 12.5, ey - 1.5, 4.4, 8.8, 0.1);
  }
  // brows (under a helmet its rim is the brow): level and cool, or knitted for the attack
  if (!L.helmet && !hit) {
    if (atk) {
      C(26, hy - 19, 31, hy - 19, 37, hy - 16, 42, hy - 11.5);
      ink(ctx, 3.4, BRUSH, 16);
      C(53, hy - 16, 51, hy - 14, 49, hy - 12, 47.5, hy - 9.5);
      ink(ctx, 2.6, BRUSH, 17);
    } else {
      C(27, hy - 15.5, 31, hy - 19, 37, hy - 19.5, 42, hy - 17);
      ink(ctx, 3, BRUSH, 16);
    }
  }
  if (!L.weapon) arm(ctx, elbow, hand);
  if (hit) impact(ctx, 60, hy - 4);
  ctx.fillStyle = INK;
  ctx.fill();
  inkTexture(ctx);
  flushTails(ctx);
  flushPupils(ctx);

  if (!hit && !L.blink) glints(ctx, [ex - 2.6, ey - 4.4, 3, ex + 2, ey + 4.4, 1.2, ex + 11.6, ey - 5.2, 1.6]);

  if (L.helmet) {
    ctx.save();
    ctx.translate(hx - 3, hy - 16);
    ctx.rotate(hit ? -0.28 : 0.04);
    helmet(ctx, 1.06, Q, 0.62);
    ctx.restore();
  }

  if (L.weapon) {
    held(ctx, L, hand[0], hand[1]);
    ctx.beginPath();
    arm(ctx, elbow, hand);
    ell(ctx, hand[0], hand[1], 4.4, 4);
    ctx.fillStyle = INK;
    ctx.fill();
  }
}

/** an ant's arm: shoulder, elbow, hand, in one stroke with a pressed paw */
function arm(ctx: Ctx, e: number[], h: number[]) {
  C(13, -57, e[0] - 2, e[1] - 4, e[0], e[1], h[0], h[1]);
  ink(ctx, 3.8, BRUSH, 20);
  ell(ctx, h[0], h[1], 3.8, 3.4);
}

// ------------------------------------------------------------------ the weapon in hand

/** the angle the weapon is held at (0 = straight up, + = forward), by weapon and pose */
function grip(w: string, pose: Pose) {
  if (w === 'knife') return pose === 'attack' ? 1.7 : pose === 'hit' ? -0.5 : 0.5;
  if (w === 'bat') return pose === 'attack' ? 2.3 : pose === 'hit' ? -1.0 : -0.5;
  if (w === 'spear') return pose === 'attack' ? 1.5 : pose === 'hit' ? -0.35 : 0.1;
  return 0;
}

function held(ctx: Ctx, L: Look, x: number, y: number) {
  const w = L.weapon!;
  const a = grip(w, L.pose);
  if (L.pose === 'attack' && w !== 'shield') {
    ctx.beginPath();
    if (w === 'spear') {
      // a thrust: dry streaks along the shaft
      begin();
      pt(x - 40, y - 7);
      pt(x + 34, y - 4);
      emit(ctx, 5, { a: 0.05, h: 0.8, b: 0.1, wob: 0.2, cap: false }, 3);
      begin();
      pt(x - 26, y + 6);
      pt(x + 26, y + 5);
      emit(ctx, 3.5, { a: 0.05, h: 0.8, b: 0.1, wob: 0.2, cap: false }, 4);
    } else {
      // a swing: a dry arc round the hand from where the weapon was
      const reach = w === 'bat' ? 42 : 31;
      const to = a - Math.PI / 2 + 0.05;
      A(x, y, reach, reach, 0, to - 1.75, to);
      emit(ctx, w === 'bat' ? 13 : 10, { a: 0.02, h: 0.8, b: 0.3, wob: 0.2, cap: false }, 9);
    }
    trail(ctx);
  }
  ctx.save();
  ctx.translate(x, y);
  if (w === 'shield') {
    ctx.translate(L.pose === 'attack' ? 10 : 4, L.pose === 'hit' ? -4 : 6);
    ctx.scale(0.64, 1);
    ctx.rotate(L.pose === 'hit' ? -0.2 : 0);
  } else {
    ctx.rotate(a);
    // a spear is gripped near its blade when thrusting, so it does not reach across the pitch
    if (w === 'spear' && L.pose === 'attack') ctx.translate(0, 12);
  }
  weapon(ctx, w, Q, L.c.main);
  ctx.restore();
}

// ------------------------------------------------------------------ the frog

function frog(ctx: Ctx, L: Look) {
  const { c, pose } = L;
  const atk = pose === 'attack';
  const hit = pose === 'hit';
  const b = L.br;
  const off = offOf();
  const tongue = atk && !L.weapon;
  const top = -66 - b * 1.2;
  const ney = -68 - b * 1.2;
  const fey = -70 - b * 1.2;
  const throat = 1 + (pose === 'idle' ? 0.05 * (b + 1) : 0);
  const hand = atk ? [50, -46] : hit ? [44, -54] : [48, -30];

  // ---- the colour plate
  ctx.translate(-off, -off * 0.7);
  ctx.beginPath();
  ctx.moveTo(55, -42);
  ctx.bezierCurveTo(57, -56, 42, top, 26, top);
  ctx.bezierCurveTo(6, top - 2, -30, -56, -40, -36);
  ctx.bezierCurveTo(-48, -18, -42, -1, -24, -1);
  ctx.bezierCurveTo(-4, 0, 22, 1, 34, -6);
  ctx.bezierCurveTo(48, -14, 54, -28, 55, -42);
  ctx.closePath();
  ell(ctx, -20, -20, 23, 15.5, -0.32);
  if (!L.helmet) {
    ell(ctx, 14, ney, 14.5, 14.5);
    ell(ctx, 37, fey, 11, 11);
  }
  ctx.fillStyle = c.main;
  ctx.fill();
  plateTexture(ctx);
  // light: the throat, a dry stroke along the crown
  ctx.beginPath();
  begin();
  pt(48, -30);
  cub(44, -14 * throat, 30, -4, 16, -6, st(40));
  emit(ctx, 15 * throat, { a: 0.6, h: 0.35, b: 0.25, wob: 0.08, cap: true }, 9);
  C(-26, -48, -16, -58, -4, -63, 4, -62);
  emit(ctx, 7, TAIL, 2);
  lightFill(ctx, c);
  // the shadow side: a dry wash down the rump and under the haunch
  ctx.beginPath();
  C(-31, -44, -38, -30, -36, -14, -27, -7);
  emit(ctx, 10, SWELL, 4);
  A(-20, -20, 17, 10, -0.32, 2.7, 1.0);
  emit(ctx, 8, SWELL, 5);
  washFill(ctx, c);
  // spots: three deliberate dabs of the dark
  ctx.beginPath();
  ell(ctx, -9, -52, 5.4, 4.4, 0.4);
  ell(ctx, -5, -50, 3.6, 3, 0.2);
  ell(ctx, -25, -40, 3.6, 3.1, 0.3);
  ell(ctx, 4, -59, 2.8, 2.3);
  ctx.fillStyle = c.dark;
  ctx.fill();
  ctx.translate(off, off * 0.7);

  // ---- ink
  ctx.beginPath();
  // the back: one long confident stroke from behind the eye down round the rump
  C(2, top + 1, -18, top + 4, -34, -52, -40, -34);
  cub(-46, -18, -42, -2, -26, -1, st(40));
  ink(ctx, 6.2, LATE, 1);
  addTail(6.2, 1, 0.6);
  // the face: down the snout
  C(46, fey + 6, 54, -58, 57, -50, 55, -42);
  ink(ctx, 3.2, SWELL, 2);
  // the throat
  C(53, -33, 51, -22, 45, -12, 34, -6);
  ink(ctx, 4.6, SWELL, 3);
  // the belly line, under the foot
  C(28, -3, 14, 0, -2, 0, -14, -1);
  ink(ctx, 2.6, SWELL, 4);
  // the haunch: one big swell over the top
  A(-20, -20, 23, 15.5, -0.32, -3.1, 0.15);
  ink(ctx, 5.6, SWELL, 5);
  // the foot along the ground and its toes
  C(-30, -2, -18, -3, -6, -3, 5, -2);
  ink(ctx, 5, PRESS, 6);
  toes(ctx, 5, -2, 1);
  // mouth: a wide grin from the snout back past the eye, flicked up at the corner; open for the tongue
  if (tongue) {
    C(56, -43, 46, -40, 28, -40, 12, -44);
    quad(8, -46, 7, -50, 3);
    ink(ctx, 4.2, SWELL, 7);
    C(52, -30, 44, -31, 28, -36, 14, -42);
    ink(ctx, 3.6, SWELL, 8);
  } else if (hit) {
    C(52, -38, 46, -36, 40, -40, 34, -37);
    cub(28, -34, 22, -38, 16, -38, st(20));
    ink(ctx, 3.6, SWELL, 7);
  } else {
    C(56, -41, 46, -35, 26, -37, 10, -42);
    quad(6, -44, 5, -48, 3);
    ink(ctx, 4.8, SWELL, 7);
  }
  ell(ctx, 50, -50, 1.7, 1.3, 0.3);
  if (!L.helmet) eyeInk(ctx, L, ney, fey);
  if (hit) impact(ctx, 64, -48);
  ctx.fillStyle = INK;
  ctx.fill();
  inkTexture(ctx);
  flushTails(ctx);
  flushPupils(ctx);
  if (!L.helmet) eyeGlints(ctx, L, ney, fey);

  if (tongue) {
    // the tongue: a lash of pink with an ink edge
    const T: Prof = { a: 0.5, h: 0.9, b: 0.85, wob: 0.05, cap: false };
    ctx.beginPath();
    C(30, -38, 56, -40, 76, -50, 98, -44);
    emit(ctx, 8.5 * G, T, 1);
    ell(ctx, 99, -44, 6.8, 6.2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    C(31, -38.5, 56, -40.5, 76, -50.5, 97.5, -44.5);
    emit(ctx, 5.4, T, 1);
    ell(ctx, 98.6, -44.6, 4.7, 4.2);
    ctx.fillStyle = '#ff8597';
    ctx.fill();
  }

  if (L.helmet) {
    ctx.save();
    ctx.translate(22, top - 7);
    ctx.rotate(hit ? -0.3 : -0.06);
    helmet(ctx, 1, Q, 1);
    ctx.restore();
    // the eyes bulge in front of the helmet's rim
    ctx.translate(-off, -off * 0.7);
    ctx.beginPath();
    ell(ctx, 14, ney, 14.5, 14.5);
    ell(ctx, 37, fey, 11, 11);
    ctx.fillStyle = c.main;
    ctx.fill();
    ctx.translate(off, off * 0.7);
    ctx.beginPath();
    eyeInk(ctx, L, ney, fey);
    ctx.fillStyle = INK;
    ctx.fill();
    inkTexture(ctx);
    flushPupils(ctx);
    eyeGlints(ctx, L, ney, fey);
  }

  // the near front arm: a fat limb, ink underneath and colour on top
  const sx = 33;
  const sy = -30;
  const limb = (w: number, d: number) => {
    if (L.weapon) {
      const ex = (sx + hand[0]) / 2 + 1;
      const ey = Math.max(sy, hand[1]) + 7;
      C(sx - d, sy - d, ex - d, ey - d, ex + 2 - d, ey - d, hand[0] - d, hand[1] - d);
    } else if (tongue) C(sx - d, sy - d, 44 - d, -26 - d, 52 - d, -16 - d, 52 - d, -6 - d);
    else C(sx - d, sy - d, 42 - d, -26 - d, 47 - d, -14 - d, 42 - d, -4 - d);
    emit(ctx, w, LIMB, 2);
  };
  if (L.weapon) held(ctx, L, hand[0], hand[1]);
  ctx.beginPath();
  limb(10.5 * G, 0);
  if (L.weapon) ell(ctx, hand[0], hand[1], 6.4 + G, 5.8 + G);
  else toes(ctx, tongue ? 52 : 42, tongue ? -5 : -3, 0.85);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  limb(6, off * 0.4);
  if (L.weapon) ell(ctx, hand[0] - 0.7, hand[1] - 0.7, 5.6, 5);
  ctx.fillStyle = c.main;
  ctx.fill();
}

/** the frog's eye domes: the lid strokes over the top (the far one lighter) and the pupils */
function eyeInk(ctx: Ctx, L: Look, ney: number, fey: number) {
  const back = L.helmet ? 2.65 : 3.3;
  A(14, ney, 14.5, 14.5, 0, back, 6.15);
  ink(ctx, 4.4, SWELL, 9);
  A(37, fey, 11, 11, 0, L.helmet ? 3.4 : 3.75, 6.45);
  ink(ctx, 3.2, SWELL, 10);
  if (L.pose === 'hit') {
    squint(ctx, 15, ney + 1, 5.5, 1);
    squint(ctx, 39, fey + 1, 4, -1);
  } else if (L.blink) {
    shut(ctx, 15, ney + 1, 7);
    shut(ctx, 38, fey + 1, 5);
  } else {
    pupil(ctx, 18, ney + 1, 7, 8);
    if (L.pose === 'attack') {
      // knitted brows across the domes
      C(5, ney - 12, 11, ney - 11, 17, ney - 9, 24, ney - 5);
      ink(ctx, 3.6, BRUSH, 11);
      C(46, fey - 9, 43, fey - 8, 40, fey - 6, 36, fey - 3);
      ink(ctx, 2.8, BRUSH, 12);
    }
    pupil(ctx, 40, fey + 1, 4.9, 6.1);
  }
}
function eyeGlints(ctx: Ctx, L: Look, ney: number, fey: number) {
  if (L.pose !== 'hit' && !L.blink) glints(ctx, [15.4, ney - 2.6, 2.6, 20.6, ney + 4.6, 1.1, 38.4, fey - 2.2, 1.7]);
}

/** three webbed toes fanned out from (x, y), each ending in a dab */
function toes(ctx: Ctx, x: number, y: number, s: number) {
  const tips = [8, -5, 10, 0, 6, 3];
  for (let i = 0; i < 6; i += 2) {
    begin();
    pt(x, y);
    pt(x + tips[i] * s * 0.5, y + tips[i + 1] * s * 0.5);
    pt(x + tips[i] * s, y + tips[i + 1] * s);
    ink(ctx, 2.6, EVEN, i);
    ell(ctx, x + tips[i] * s, y + tips[i + 1] * s, 2.1 * s + 0.3, 1.8 * s + 0.3);
  }
}

// ------------------------------------------------------------------ the style

export const style1: ArtStyle = {
  NAME: 'Ink Brush',
  BLURB: 'sumi-e brush strokes, flat print colour slightly off register, a red seal',

  drawPet(ctx, type: PetType, team: Team, x, y, r, pose, t, o = {}) {
    const face = o.face ?? 1;
    K = r / 50;
    G = clamp(1 + 0.62 * (1 - K), 1, 1.5);
    Q = r >= 34 ? 2 : r >= 22 ? 1 : 0;
    setInk(G, K, Q);
    const br = Math.sin(t * 2.6 + (type === 'frog' ? 1.3 : 0));
    const L: Look = {
      c: TEAM[team],
      pose,
      br: pose === 'idle' ? br : 0,
      weapon: o.weapon ?? null,
      helmet: !!o.helmet,
      blink: pose === 'idle' && blinking(t, type === 'frog' ? 0.52 : 0.1),
      dx: 0,
      rot: 0,
      sx: 1,
      sy: 1,
    };
    if (pose === 'attack') {
      L.dx = type === 'ant' ? 8 : 7;
      L.rot = type === 'ant' ? 0.2 : 0.12;
      L.sx = 1.05;
      L.sy = 0.96;
    } else if (pose === 'hit') {
      L.dx = -7;
      L.rot = -0.16;
      L.sx = 0.96;
      L.sy = 1.03;
    } else {
      L.sy = 1 + 0.018 * br;
      L.sx = 1 - 0.01 * br;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face * K, K);
    shadow(ctx, type === 'ant' ? 34 : 44);
    ctx.translate(L.dx, 0);
    ctx.rotate(L.rot);
    ctx.scale(L.sx, L.sy);
    if (type === 'ant') ant(ctx, L);
    else frog(ctx, L);
    ctx.restore();
  },

  drawItem(ctx, type: ItemType, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 100, size / 100);
    setInk(1, size / 100, 2);
    itemIcon(ctx, type);
    sealStamp(ctx, 34, 34, 15);
    ctx.restore();
  },
};
