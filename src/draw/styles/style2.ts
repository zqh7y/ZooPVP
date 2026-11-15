import type { ArtStyle, PetOpts, Pose } from './api';
import type { PetType, Team, WeaponType } from '../../types';
import { EYE, INK, PAL, shadow, split, type Ctx, type Pal } from './style2-kit';
import { capsule, helmet, icon, weapon } from './style2-items';

/*
 * Style sample 2: Flat Geometric. A poster illustration: every pet is a few clean primitives (circles,
 * ellipses, capsules), no outlines, each part cut by the sun's diagonal into a lit and a shaded tone of its
 * team colour, with a soft long shadow thrown down-right on the grass and big, simple eyes under flat lids.
 *
 * Everything is drawn in the pet's own units (1 = its fight radius r, ground at y = 0, facing +x). The two-tone
 * fills are cached gradients in those units, so a pet costs one save/restore, a shadow blit and a short list of
 * plain fills. The light stays put in the world (upper left) whichever way the pet faces or leans.
 */

const PI = Math.PI;
const S = Math.SQRT1_2;
const POSE: Record<Pose, number> = { idle: 0, attack: 1, hit: 2 };
/** per pose: lean (radians, + = forward) and lunge (units, + = forward) */
const LEAN = [0, 0.2, -0.2];
const LUNGE = [0, 0.24, -0.2];

/** one pet's palette, and the sun's direction in its own (mirrored, leaning) space */
interface Rig {
  P: Pal;
  key: number;
  lx: number;
  ly: number;
}
const rigs: Rig[] = [];
function rigOf(team: Team, face: number, pose: number): Rig {
  const i = (team * 2 + (face > 0 ? 1 : 0)) * 3 + pose;
  let g = rigs[i];
  if (!g) {
    const l = LEAN[pose];
    const fx = face * S;
    const fy = S;
    g = { P: PAL[team], key: i, lx: fx * Math.cos(l) + fy * Math.sin(l), ly: -fx * Math.sin(l) + fy * Math.cos(l) };
    rigs[i] = g;
  }
  return g;
}
/** a part's two-tone fill, cut by the sun's diagonal through (cx, cy) (off > 0 leaves more of it lit) */
const tone = (ctx: Ctx, g: Rig, part: number, cx: number, cy: number, lit: string, shade: string, off = 0) =>
  split(ctx, part * 12 + g.key, cx, cy, g.lx, g.ly, lit, shade, off);

// ------------------------------------------------------------------ shared bits

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, PI * 2);
}
function dot(ctx: Ctx, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, PI * 2);
}
/** Eye states. */
const OPEN = 0;
const SHUT = 1;
const OUCH = 2;

/**
 * Two eyes: e = [x, y, r] near, then far. Open: white, a big pupil looking forward, one glint, and a flat lid in
 * the head's own fill cutting the top (cover 0..1 of the height), tilted into a V by vee. Shut: a short dash.
 * Ouch: > < squeezed shut.
 */
function eyes(ctx: Ctx, e: number[], lid: CanvasGradient, cover: number, vee: number, state: number, look = 1) {
  if (state === OPEN) {
    ctx.fillStyle = EYE;
    ctx.beginPath();
    dot(ctx, e[0], e[1], e[2]);
    dot(ctx, e[3], e[4], e[5]);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 3) dot(ctx, e[i] + look * e[i + 2] * 0.3, e[i + 1] + e[i + 2] * 0.06, e[i + 2] * 0.6);
    ctx.fill();
    ctx.fillStyle = EYE;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 3) dot(ctx, e[i] + look * e[i + 2] * 0.3 - e[i + 2] * 0.17, e[i + 1] - e[i + 2] * 0.17, e[i + 2] * 0.2);
    ctx.fill();
    if (cover > 0) {
      ctx.fillStyle = lid;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 3) {
        const v = i === 0 ? vee : -vee;
        const n = -PI / 2 + v;
        const er = e[i + 2] * 1.04;
        const a = Math.acos(1 - 2 * cover);
        ctx.moveTo(e[i] + er * Math.cos(n - a), e[i + 1] + er * Math.sin(n - a));
        ctx.arc(e[i], e[i + 1], er, n - a, n + a);
        ctx.closePath();
      }
      ctx.fill();
    }
    return;
  }
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i += 3) {
    const x = e[i];
    const y = e[i + 1];
    const r = e[i + 2];
    ctx.lineWidth = r * 0.34;
    if (state === SHUT) {
      ctx.moveTo(x - r * 0.75, y + r * 0.05);
      ctx.quadraticCurveTo(x, y + r * 0.45, x + r * 0.75, y + r * 0.05);
    } else {
      const s = i === 0 ? 1 : -1;
      ctx.moveTo(x - s * r * 0.6, y - r * 0.55);
      ctx.lineTo(x + s * r * 0.5, y);
      ctx.lineTo(x - s * r * 0.6, y + r * 0.55);
    }
  }
  ctx.lineWidth = e[2] * 0.34;
  ctx.stroke();
}

/** a crescent smear behind a swing, centred on (cx, cy), thickening toward a1 where the weapon is */
function smear(ctx: Ctx, color: string, cx: number, cy: number, R: number, a0: number, a1: number, th: number) {
  const n = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    const k = i / n;
    const rr = R - th * k * k * (3 - 2 * k);
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** the 4-point flash of a blow landing */
function flash(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = EYE;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s * 0.8, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s * 0.8, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

/** where a held weapon points (radians) and how big it is, per pose */
const AIM: Record<WeaponType, number[]> = {
  knife: [-0.95, 0.5, -2.0],
  bat: [-1.25, 0.3, -2.2],
  spear: [-1.42, 0.04, -1.9],
  shield: [0, 0, 0],
};

function held(ctx: Ctx, w: WeaponType, x: number, y: number, pose: number, k: number) {
  ctx.save();
  ctx.translate(x, y);
  if (w === 'shield') {
    ctx.scale(k * 0.74, k);
  } else {
    ctx.rotate(AIM[w][pose]);
    ctx.scale(k, k);
  }
  weapon(ctx, w);
  ctx.restore();
}

/** the helmet on a head: its rim centred at (x, y), half as wide as w, tipped back by tilt */
function hat(ctx: Ctx, x: number, y: number, w: number, tilt: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(w, w);
  helmet(ctx);
  ctx.restore();
}

// ------------------------------------------------------------------ the ant

const ANT_HEAD = 1;
const ANT_THORAX = 2;
const ANT_GASTER = 3;
const ANT_WAIST = 4;

/** a teardrop: the circle (cx, cy, R) drawn out to a point d away in direction a */
function drop(ctx: Ctx, cx: number, cy: number, R: number, a: number, d: number) {
  const b = Math.acos(R / d);
  ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  ctx.arc(cx, cy, R, a + b, a - b + PI * 2);
  ctx.closePath();
}

/** a straight segment from (x0, y0) to (x1, y1), w0 wide at its start tapering to w1 (half widths) */
function taper(ctx: Ctx, x0: number, y0: number, w0: number, x1: number, y1: number, w1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  // wound clockwise like arc(), so the knee dots add to the fill instead of punching holes in it
  const nx = dy / l;
  const ny = -dx / l;
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
  ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
  ctx.closePath();
}

/**
 * Jointed limbs [hip x, y, knee x, y, foot x, y]: a thigh tapering into a round knee, then a shin tapering to a
 * sharp point (or, with a fist, to the round hand at its end). w is the thigh's half width. One fill for all.
 */
function limbs(ctx: Ctx, color: string, w: number, pts: number[][], fist = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const p of pts) {
    taper(ctx, p[0], p[1], w, p[2], p[3], w * 0.75);
    dot(ctx, p[2], p[3], w * 0.78);
    taper(ctx, p[2], p[3], w * 0.75, p[4], p[5], fist ? w * 0.6 : w * 0.2);
    if (fist) dot(ctx, p[4], p[5], fist);
  }
  ctx.fill();
}

/** a curved pincer from (x, y) pointing along a, curling down at its tip */
function pincer(ctx: Ctx, x: number, y: number, a: number, L: number, w: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  ctx.moveTo(x + s * w, y - c * w);
  ctx.quadraticCurveTo(x + c * L * 0.75 + s * w * 1.3, y + s * L * 0.75 - c * w * 1.3, x + c * L - s * w * 0.6, y + s * L + c * w * 0.6);
  ctx.quadraticCurveTo(x + c * L * 0.45 - s * w * 0.1, y + s * L * 0.45 + c * w * 0.1, x - s * w, y + c * w);
  ctx.closePath();
}

const ANT_FAR_LEGS = [
  [0.16, -1.1, 0.5, -0.62, 0.6, 0],
  [0.02, -1.04, -0.24, -0.58, -0.14, 0],
];
const ANT_NEAR_LEGS = [
  [0.1, -1.08, 0.34, -0.6, 0.3, 0],
  [0.0, -1.04, -0.42, -0.6, -0.46, 0],
];
/** the arms per pose: far arm, then near arm (shoulder, elbow, hand) */
const ANT_ARMS = [
  [0.3, -1.38, 0.56, -1.2, 0.86, -1.34, 0.24, -1.32, 0.48, -1.04, 0.8, -1.12],
  [0.3, -1.4, 0.64, -1.36, 0.98, -1.5, 0.26, -1.34, 0.64, -1.18, 1.0, -1.24],
  [0.3, -1.38, 0.48, -1.18, 0.66, -1.46, 0.24, -1.32, 0.42, -1.04, 0.6, -1.34],
];

function ant(ctx: Ctx, g: Rig, pose: number, ph: number, o: PetOpts, blink: boolean) {
  const P = g.P;
  const w = o.weapon ?? null;
  const b = pose === 0 ? Math.sin(ph) : 0;
  const hx = 0.52 + (pose === 1 ? 0.05 : 0);
  const hy = -1.7 + b * 0.025 + (pose === 2 ? 0.05 : 0);
  const hr = 0.56;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // antennae, behind the head: long curls ending in a bead, swept back in the lunge
  const sway = pose === 0 ? Math.sin(ph + 1.3) * 0.035 : 0;
  const bk = pose === 1 ? 0.3 : pose === 2 ? -0.08 : 0;
  ctx.strokeStyle = P.shade;
  ctx.lineWidth = 0.075;
  ctx.beginPath();
  ctx.moveTo(hx + 0.16, hy - 0.5);
  ctx.quadraticCurveTo(hx + 0.08 - bk * 0.5, hy - 1.0, hx + 0.5 - bk, hy - 0.86 + sway + bk * 0.3);
  ctx.moveTo(hx - 0.12, hy - 0.48);
  ctx.quadraticCurveTo(hx - 0.3 - bk * 0.5, hy - 1.0, hx + 0.12 - bk, hy - 0.9 - sway + bk * 0.3);
  ctx.stroke();
  ctx.fillStyle = P.shade;
  ctx.beginPath();
  dot(ctx, hx + 0.5 - bk, hy - 0.86 + sway + bk * 0.3, 0.085);
  dot(ctx, hx + 0.12 - bk, hy - 0.9 - sway + bk * 0.3, 0.095);
  ctx.fill();

  // far legs and far arm
  const A = ANT_ARMS[pose];
  limbs(ctx, P.deep, 0.065, ANT_FAR_LEGS);
  limbs(ctx, P.deep, 0.06, [A], 0.085);

  // the body: a teardrop abdomen, a bead of waist, a capsule of thorax, with air between them
  const gb = 1 + b * 0.035;
  ctx.fillStyle = tone(ctx, g, ANT_GASTER, -0.7, -0.92, P.base, P.mid, 0.12);
  ctx.beginPath();
  drop(ctx, -0.68, -0.92, 0.5 * gb, 2.55, 0.58 * gb);
  ctx.fill();
  ctx.fillStyle = tone(ctx, g, ANT_WAIST, -0.11, -1.08, P.mid, P.shade);
  ctx.beginPath();
  dot(ctx, -0.11, -1.08, 0.075);
  ctx.fill();
  ctx.fillStyle = tone(ctx, g, ANT_THORAX, 0.17, -1.25, P.base, P.mid, 0.02);
  capsule(ctx, 0.08, -1.12, 0.26, -1.38, 0.15);
  ctx.fill();

  limbs(ctx, P.shade, 0.07, ANT_NEAR_LEGS);

  // the head
  const headFill = tone(ctx, g, ANT_HEAD, hx, hy, P.base, P.mid, 0.14);
  ctx.fillStyle = headFill;
  ctx.beginPath();
  dot(ctx, hx, hy, hr);
  ctx.fill();

  // pincers: a small V at rest, gaping for a bite
  // pincers only come out for a bite
  if (pose === 1 && !w) {
    ctx.fillStyle = P.shade;
    ctx.beginPath();
    pincer(ctx, hx + 0.46, hy + 0.2, -0.2, 0.3, 0.065);
    pincer(ctx, hx + 0.42, hy + 0.28, 1.0, 0.28, 0.06);
    ctx.fill();
  }

  // a little smirk at rest, a shout when it swings
  if (pose === 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.055;
    ctx.beginPath();
    ctx.moveTo(hx + 0.2, hy + 0.27);
    ctx.quadraticCurveTo(hx + 0.32, hy + 0.36, hx + 0.47, hy + 0.22);
    ctx.stroke();
  } else if (pose === 1 && w) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(hx + 0.22, hy + 0.24);
    ctx.quadraticCurveTo(hx + 0.36, hy + 0.48, hx + 0.52, hy + 0.2);
    ctx.closePath();
    ctx.fill();
  }

  const state = pose === 2 ? OUCH : blink ? SHUT : OPEN;
  eyes(ctx, [hx + 0.1, hy - 0.04, 0.22, hx + 0.44, hy - 0.06, 0.16], headFill, pose === 1 ? 0.36 : 0.16, pose === 1 ? 0.42 : 0.1, state);

  if (o.helmet) hat(ctx, hx - 0.02, hy - 0.2, 0.62, pose === 2 ? -0.28 : -0.12);

  // the near arm and what it holds
  let fx = A[10];
  const fy = A[11] + b * 0.02;
  if (w === 'shield') fx += 0.12;
  if (pose === 1 && (w === 'knife' || w === 'bat')) smear(ctx, P.hi, fx, fy, w === 'bat' ? 1.0 : 0.9, -1.75, AIM[w][1] - 0.1, 0.32);
  if (pose === 1 && w === 'spear') {
    ctx.fillStyle = P.hi;
    capsule(ctx, fx - 0.3, fy - 0.24, fx + 0.5, fy - 0.22, 0.045);
    ctx.fill();
    capsule(ctx, fx - 0.5, fy + 0.22, fx + 0.3, fy + 0.24, 0.045);
    ctx.fill();
  }
  limbs(ctx, P.shade, 0.07, [[A[6], A[7], A[8], A[9], fx, fy]]);
  if (w) held(ctx, w, fx, fy, pose, w === 'shield' ? 0.52 : w === 'spear' ? 0.86 : 0.86);
  ctx.fillStyle = P.mid;
  ctx.beginPath();
  dot(ctx, fx, fy, 0.1);
  ctx.fill();

  if (pose === 2) flash(ctx, hx + 0.66, hy - 0.5, 0.3);
}

// ------------------------------------------------------------------ the frog

const FROG_BODY = 20;
const FROG_THIGH = 21;
const FROG_BELLY = 22;
const FROG_EYE_N = 23;
const FROG_EYE_F = 24;
const FROG_FOOT = 25;

function frog(ctx: Ctx, g: Rig, pose: number, ph: number, o: PetOpts, blink: boolean) {
  const P = g.P;
  const w = o.weapon ?? null;
  const b = pose === 0 ? Math.sin(ph) : 0;
  const puff = pose === 0 ? Math.max(0, Math.sin(ph - 1)) ** 2 : 0;
  const tongue = pose === 1 && !w;

  // body and head: one mass, one cut of light across it
  const hy = -1.26 + b * 0.02;
  const bodyFill = tone(ctx, g, FROG_BODY, 0.12, -1.0, P.base, P.mid, 0.1);
  ctx.fillStyle = bodyFill;
  ctx.beginPath();
  ell(ctx, -0.12, -0.7, 1.05, 0.68, -0.18);
  ell(ctx, 0.42, hy, 0.84, 0.54, -0.05);
  dot(ctx, 0.12, hy - 0.46, 0.34);
  dot(ctx, 0.74, hy - 0.5, 0.29);
  ctx.fill();
  // the eye domes get their own cut, so they stand off the head
  ctx.fillStyle = tone(ctx, g, FROG_EYE_N, 0.12, hy - 0.46, P.base, P.mid, 0.08);
  ctx.beginPath();
  dot(ctx, 0.12, hy - 0.46, 0.34);
  ctx.fill();
  const farDome = tone(ctx, g, FROG_EYE_F, 0.74, hy - 0.5, P.base, P.mid, 0.08);
  ctx.fillStyle = farDome;
  ctx.beginPath();
  dot(ctx, 0.74, hy - 0.5, 0.29);
  ctx.fill();

  // spots on the back
  ctx.fillStyle = P.mid;
  ctx.beginPath();
  dot(ctx, -0.46, -1.1, 0.13);
  dot(ctx, -0.8, -0.86, 0.085);
  dot(ctx, -0.16, -1.0, 0.075);
  ctx.fill();

  // pale belly and throat; the throat puffs while it idles
  const hiFill = tone(ctx, g, FROG_BELLY, 0.5, -0.8, P.hi, P.hiShade, 0.05);
  ctx.fillStyle = hiFill;
  ctx.beginPath();
  ell(ctx, 0.46, -0.5, 0.5, 0.44);
  const jawDrop = tongue ? 0.16 : pose === 2 ? 0.06 : 0;
  ell(ctx, 0.62, hy + 0.26 + jawDrop + puff * 0.03, 0.6 + puff * 0.04, 0.26 + puff * 0.08);
  ctx.fill();

  // the mouth: a long dark wedge that curls up at the corner (open for the tongue)
  ctx.fillStyle = INK;
  ctx.beginPath();
  const my = hy + 0.06;
  ctx.moveTo(-0.06, my - 0.08);
  ctx.quadraticCurveTo(0.0, my + 0.04, 0.2, my + 0.06);
  ctx.quadraticCurveTo(0.8, my + 0.14, 1.25, my + 0.02);
  ctx.lineTo(1.24, my + 0.06 + jawDrop * 1.4);
  ctx.quadraticCurveTo(0.8, my + 0.2 + jawDrop, 0.2, my + 0.1);
  ctx.quadraticCurveTo(0.0, my + 0.08, -0.06, my - 0.08);
  ctx.fill();
  if (tongue) {
    ctx.fillStyle = '#ff7fa8';
    capsule(ctx, 0.9, my + 0.12, 1.72, my + 0.04, 0.07);
    ctx.fill();
    ctx.fillStyle = tone(ctx, g, 30, 1.78, my, '#ff9ec0', '#e0578f');
    ctx.beginPath();
    dot(ctx, 1.78, my + 0.04, 0.16);
    ctx.fill();
  }

  // the haunch: a big circle of thigh over a long flat foot
  ctx.fillStyle = tone(ctx, g, FROG_FOOT, -0.3, -0.08, P.mid, P.shade);
  capsule(ctx, -0.5, -0.09, 0.14, -0.09, 0.09);
  ctx.fill();
  ctx.beginPath();
  dot(ctx, 0.22, -0.12, 0.065);
  dot(ctx, 0.27, -0.03, 0.065);
  ctx.fill();
  ctx.fillStyle = tone(ctx, g, FROG_THIGH, -0.6, -0.54, P.lit, P.base, 0.06);
  ctx.beginPath();
  dot(ctx, -0.6, -0.54 + b * 0.01, 0.46);
  ctx.fill();

  // eyes on top
  const state = pose === 2 ? OUCH : blink ? SHUT : OPEN;
  if (o.helmet) hat(ctx, 0.44, hy - 0.42, 0.46, pose === 2 ? -0.25 : -0.08);
  eyes(ctx, [0.13, hy - 0.5, 0.24, 0.76, hy - 0.53, 0.2], farDome, pose === 1 ? 0.34 : 0.1, pose === 1 ? 0.4 : 0.06, state);

  // the near arm and what it holds
  let fx = 0.74;
  let fy = -0.07;
  if (w) {
    if (pose === 1) {
      fx = 0.98;
      fy = -0.98;
    } else if (pose === 2) {
      fx = 0.78;
      fy = -0.9;
    } else {
      fx = 0.98;
      fy = -0.7 + b * 0.02;
    }
  }
  if (w === 'shield') {
    fx += 0.1;
    fy -= 0.08;
  }
  if (pose === 1 && (w === 'knife' || w === 'bat')) smear(ctx, P.hi, fx, fy, w === 'bat' ? 0.76 : 0.68, -1.75, AIM[w][1] - 0.1, 0.26);
  if (pose === 1 && w === 'spear') {
    ctx.fillStyle = P.hi;
    capsule(ctx, fx - 0.2, fy - 0.2, fx + 0.5, fy - 0.18, 0.04);
    ctx.fill();
    capsule(ctx, fx - 0.4, fy + 0.18, fx + 0.3, fy + 0.2, 0.04);
    ctx.fill();
  }
  const armFill = tone(ctx, g, 26, 0.7, -0.5, P.base, P.mid, 0.04);
  ctx.fillStyle = armFill;
  capsule(ctx, 0.52, -0.72, fx, fy, 0.1);
  ctx.fill();
  if (w) held(ctx, w, fx, fy, pose, w === 'shield' ? 0.5 : w === 'spear' ? 0.78 : 0.64);
  ctx.fillStyle = armFill;
  ctx.beginPath();
  if (w) dot(ctx, fx, fy, 0.12);
  else {
    dot(ctx, fx + 0.06, fy - 0.03, 0.075);
    dot(ctx, fx + 0.16, fy, 0.075);
    dot(ctx, fx + 0.22, fy + 0.04, 0.07);
  }
  ctx.fill();

  if (pose === 2) flash(ctx, 1.3, -1.9, 0.34);
}

// ------------------------------------------------------------------ the style

// ------------------------------------------------------------------ painting

/** idle breaths per second, as a phase rate (radians per second) */
const RATE = { ant: 3.2, frog: 2.6 };
const TAU = PI * 2;

/** The pet itself (no shadow), standing on (x, y). ph is the idle breath's phase in radians. */
function paint(ctx: Ctx, type: PetType, team: Team, x: number, y: number, r: number, p: number, ph: number, blink: boolean, o: PetOpts) {
  const face = o.face ?? 1;
  const b = p === 0 ? Math.sin(ph) : 0;
  ctx.save();
  ctx.translate(x, y);
  const sx = p === 1 ? 1.05 : p === 2 ? 0.96 : 1 - b * 0.012;
  const sy = p === 1 ? 0.97 : p === 2 ? 1.02 : 1 + b * 0.025;
  ctx.scale(face * r * sx, r * sy);
  ctx.translate(LUNGE[p], 0);
  if (LEAN[p]) ctx.rotate(LEAN[p]);
  const g = rigOf(team, face, p);
  if (type === 'frog') frog(ctx, g, p, ph, o, blink);
  else ant(ctx, g, p, ph, o, blink);
  ctx.restore();
}

/** where the shadow's dark core sits (x offset from the ground point) and its scale, both for radius r */
const shadowK = (type: PetType, r: number) => (r * (type === 'frog' ? 2.4 : 2.0)) / 76;
const shadowX = (type: PetType, p: number, face: number, r: number) => (LUNGE[p] + (type === 'frog' ? -0.05 : -0.18)) * face * r;
/** the shadow sprite is squashed to this much of its height on the ground */
const FLAT = 0.7;

// ------------------------------------------------------------------ the sprite cache

/*
 * A battle draws ~50 pets 60 times a second, so each look is painted once, at the device's own scale, into a
 * sprite, and then only blitted, snapped to whole device pixels (a pixel-aligned blit is several times cheaper
 * than a resampled one). The idle breath is cut into FRAMES phases. Anything a sprite cannot match exactly (a
 * rotated, skewed or mirrored context, a huge pet, or a burst of new looks in one frame) is painted directly.
 */
interface Sprite {
  c: HTMLCanvasElement;
  ox: number;
  oy: number;
  n: number;
}
const FRAMES = 8;
const SPRITES = new Map<string, Sprite>();
const CAP = 12e6; // device pixels kept, all sprites together
let held_px = 0;
let burstAt = 0;
let burst = 0;
/** sprite bounds around the ground point, in r, per pet and pose: back, front, up, down (for a pet facing right) */
const BOUNDS: Record<PetType, number[][]> = {
  ant: [
    [1.45, 1.6, 2.85, 0.15],
    [1.35, 2.7, 2.9, 0.32],
    [1.75, 1.65, 3.0, 0.22],
  ],
  frog: [
    [1.3, 1.65, 2.5, 0.15],
    [1.3, 2.7, 2.6, 0.32],
    [1.6, 1.8, 2.65, 0.22],
  ],
};

function canBuild(): boolean {
  const now = performance.now();
  if (now - burstAt > 12) {
    burstAt = now;
    burst = 0;
  }
  return burst++ < 10;
}

function keep(key: string, s: Sprite) {
  SPRITES.set(key, s);
  held_px += s.n;
  while (held_px > CAP) {
    const old = SPRITES.keys().next().value as string;
    held_px -= SPRITES.get(old)!.n;
    SPRITES.delete(old);
  }
}

function bodySprite(type: PetType, team: Team, p: number, q: number, blink: boolean, o: PetOpts, face: number, R: number): Sprite | null {
  const key = `${type}${team}${p}${q}${blink ? 1 : 0}${o.weapon ?? '-'}${o.helmet ? 1 : 0}${face}${R}`;
  const hit = SPRITES.get(key);
  if (hit) {
    SPRITES.delete(key);
    SPRITES.set(key, hit);
    return hit;
  }
  if (!canBuild()) return null;
  const bd = BOUNDS[type][p];
  const L = Math.ceil(R * (face > 0 ? bd[0] : bd[1]));
  const Rt = Math.ceil(R * (face > 0 ? bd[1] : bd[0]));
  const T = Math.ceil(R * bd[2]);
  const B = Math.ceil(R * bd[3]);
  const c = document.createElement('canvas');
  c.width = L + Rt;
  c.height = T + B;
  const cx = c.getContext('2d');
  if (!cx) return null;
  paint(cx, type, team, L, T, R, p, ((q + 0.5) * TAU) / FRAMES, blink, o);
  const s = { c, ox: L, oy: T, n: c.width * c.height };
  keep(key, s);
  return s;
}

function shadowSprite(type: PetType, R: number): Sprite | null {
  const key = `s${type}${R}`;
  const hit = SPRITES.get(key);
  if (hit) return hit;
  if (!canBuild()) return null;
  const k = shadowK(type, R);
  const c = document.createElement('canvas');
  c.width = Math.ceil(144 * k) + 2;
  c.height = Math.ceil(48 * k * FLAT) + 2;
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.drawImage(shadow(), 1, 1, 144 * k, 48 * k * FLAT);
  const s = { c, ox: Math.round(40 * k) + 1, oy: Math.round(24 * k * FLAT) + 1, n: c.width * c.height };
  keep(key, s);
  return s;
}

// ------------------------------------------------------------------ the style

export const style2: ArtStyle = {
  NAME: 'Flat Geometric',
  BLURB: 'No outlines: clean shapes cut by one hard diagonal of sun, with a long soft shadow',
  drawPet(ctx, type: PetType, team: Team, x, y, r, pose, t, o: PetOpts = {}) {
    if (!(r > 0)) return;
    const face = o.face ?? 1;
    const p = POSE[pose];
    const ph = t * RATE[type];
    const blink = p === 0 && (t + 0.6) % 3.3 < 0.14;

    // the fast path: blit cached sprites at whole device pixels
    const m = ctx.getTransform();
    if (m.b === 0 && m.c === 0 && m.a > 0 && Math.abs(m.a - m.d) < 1e-6 && r * m.a < 160) {
      const R = Math.round(r * m.a * 2) / 2;
      const q = p === 0 && !blink ? Math.floor((((ph / TAU) % 1) + 1) % 1 * FRAMES) % FRAMES : 0;
      const sh = shadowSprite(type, R);
      const bo = sh && bodySprite(type, team, p, q, blink, o, face, R);
      if (sh && bo) {
        const X = m.a * x + m.e;
        const Y = m.d * y + m.f;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(sh.c, Math.round(X + shadowX(type, p, face, R) - sh.ox), Math.round(Y - sh.oy));
        ctx.drawImage(bo.c, Math.round(X - bo.ox), Math.round(Y - bo.oy));
        ctx.restore();
        return;
      }
    }

    // the slow path: paint it all now
    const k = shadowK(type, r);
    ctx.drawImage(shadow(), x + shadowX(type, p, face, r) - 40 * k, y - 24 * k * FLAT, 144 * k, 48 * k * FLAT);
    paint(ctx, type, team, x, y, r, p, ph, blink, o);
  },
  drawItem(ctx, type, x, y, size) {
    icon(ctx, type, x, y, size);
  },
};
