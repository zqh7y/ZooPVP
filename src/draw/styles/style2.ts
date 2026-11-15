import type { ArtStyle, PetOpts, Pose } from './api';
import type { PetType, Team, WeaponType } from '../../types';
import { EYE, EYE_S, FX, FX_HI, INK, PAL, SUN, moon, type Ctx, type Pal } from './style2-kit';
import { helmet, icon, itemLight, tri, weapon } from './style2-items';

/*
 * Style sample 2: Flat Geometric. A poster illustration: every pet is a few clean primitives (circles,
 * ellipses, capsules, teardrops, rounded triangles), no outlines. Each mass is cut by one curved terminator into
 * a lit and a shaded tone of its team colour (head and body of the frog share one, so it runs on unbroken), parts
 * that sit in front of a mass throw a darker cast shape on it, and the whole pet lays a hard long shadow of its
 * own silhouette down-right on the grass, away from a high sun on the upper left.
 *
 * Everything is drawn in the pet's own units (1 = its fight radius r, ground at y = 0, facing +x). The upper body
 * leans about a pivot in a "body frame"; the legs are solved from it to feet planted in the ground frame, so a
 * lunge plants the back feet and reaches the front ones. Every look is painted once into a sprite (pet and its
 * shadow together) and then only blitted, so a fighter costs one drawImage per frame.
 */

const PI = Math.PI;
const TAU = PI * 2;
const S = Math.SQRT1_2;
const POSE: Record<Pose, number> = { idle: 0, attack: 1, hit: 2 };
/** per pose: stretch along x and y (the lunge stretches along the attack, the flinch squashes) */
const STRETCH = [
  [1, 1],
  [1.08, 0.93],
  [1.05, 0.93],
];

// ------------------------------------------------------------------ light and frames

/** the sun's direction in the frame being drawn (the pet is mirrored and its body leans, the sun does not) */
let LX = S;
let LY = S;
let FACE = 1;
function light(rot: number) {
  const fx = FACE * S;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  LX = fx * c + S * s;
  LY = -fx * s + S * c;
}
const lit = (ctx: Ctx, cx: number, cy: number, rho: number, a: string, b: string, k = 0.3) => moon(ctx, cx, cy, rho, LX, LY, a, b, k);

/** the body frame: lunge (x, y), lean, pivot */
let BX = 0;
let BY = 0;
let BL = 0;
let PX = 0;
let PY = 0;
function frame(lunge: number, dy: number, lean: number, px: number, py: number) {
  BX = lunge;
  BY = dy;
  BL = lean;
  PX = px;
  PY = py;
}
/** a body-frame point, in the ground frame */
function bf(x: number, y: number): [number, number] {
  const c = Math.cos(BL);
  const s = Math.sin(BL);
  const dx = x - PX;
  const dy = y - PY;
  return [PX + BX + dx * c - dy * s, PY + BY + dx * s + dy * c];
}
function enter(ctx: Ctx) {
  ctx.save();
  ctx.translate(PX + BX, PY + BY);
  ctx.rotate(BL);
  ctx.translate(-PX, -PY);
  light(BL);
}
function leave(ctx: Ctx) {
  ctx.restore();
  light(0);
}

// ------------------------------------------------------------------ path bits (they add to the current path)

function dot(ctx: Ctx, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}
function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}
function cap(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.moveTo(x1 + r * Math.cos(a - PI / 2), y1 + r * Math.sin(a - PI / 2));
  ctx.arc(x1, y1, r, a - PI / 2, a + PI / 2);
  ctx.arc(x0, y0, r, a + PI / 2, a + (3 * PI) / 2);
  ctx.closePath();
}
/** a teardrop: the circle (cx, cy, R) drawn out to a point d away in direction a */
function drop(ctx: Ctx, cx: number, cy: number, R: number, a: number, d: number) {
  const b = Math.acos(R / d);
  ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  ctx.arc(cx, cy, R, a + b, a - b + TAU);
  ctx.closePath();
}

/** the knee (or elbow) of a two-bone limb from hip to foot; bend +1 puts it behind (toward -x), -1 in front */
function joint(hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number): [number, number] {
  const dx = fx - hx;
  const dy = fy - hy;
  const d = Math.hypot(dx, dy) || 1e-6;
  const dd = Math.min(d, l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  return [hx + ux * a - uy * h * bend, hy + uy * a + ux * h * bend];
}
/** a jointed limb as two capsules (adds to the path) */
function limb(ctx: Ctx, h: number[], k: number[], f: number[], w0: number, w1: number) {
  cap(ctx, h[0], h[1], k[0], k[1], w0);
  cap(ctx, k[0], k[1], f[0], f[1], w1);
}

// ------------------------------------------------------------------ faces

const OPEN = 0;
const SHUT = 1;
const OUCH = 2;

/**
 * Two eyes: e = [x, y, r] near, then far. Open: white, a big pupil looking forward, one glint, and a flat lid in
 * the head's own fill cutting the top (cover 0..1 of the height), tilted into a scowl by vee. Shut: a lash
 * curve. Ouch: > < squeezed shut.
 */
function eyes(ctx: Ctx, e: number[], lid: string | CanvasGradient, cover: number, vee: number, state: number) {
  if (state === OPEN) {
    for (let i = 0; i < 6; i += 3) {
      ctx.fillStyle = lit(ctx, e[i], e[i + 1], e[i + 2], EYE, EYE_S, 0.45);
      ctx.beginPath();
      dot(ctx, e[i], e[i + 1], e[i + 2]);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 3) dot(ctx, e[i] + e[i + 2] * 0.3, e[i + 1] + e[i + 2] * 0.08, e[i + 2] * 0.6);
    ctx.fill();
    ctx.fillStyle = EYE;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 3) dot(ctx, e[i] + e[i + 2] * 0.14, e[i + 1] - e[i + 2] * 0.1, e[i + 2] * 0.21);
    ctx.fill();
    if (cover > 0) {
      ctx.fillStyle = lid;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 3) {
        const v = i === 0 ? vee : -vee;
        const n = -PI / 2 + v;
        const er = e[i + 2] * 1.06;
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
  ctx.lineWidth = e[2] * 0.34;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 3) {
    const x = e[i];
    const y = e[i + 1];
    const r = e[i + 2];
    if (state === SHUT) {
      ctx.moveTo(x - r * 0.75, y + r * 0.1);
      ctx.quadraticCurveTo(x, y + r * 0.55, x + r * 0.75, y + r * 0.1);
    } else {
      const s = i === 0 ? 1 : -1;
      ctx.moveTo(x - s * r * 0.55, y - r * 0.55);
      ctx.lineTo(x + s * r * 0.45, y);
      ctx.lineTo(x - s * r * 0.55, y + r * 0.55);
    }
  }
  ctx.stroke();
}

/** a little window of sky on the lit side of a round head: a crescent wedge */
function glint(ctx: Ctx, x: number, y: number, R: number) {
  const a = Math.atan2(-LY, -LX);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.beginPath();
  ctx.arc(x, y, R * 0.8, a - 0.5, a + 0.3);
  ctx.arc(x - LX * R * 0.12, y - LY * R * 0.12, R * 0.58, a + 0.3, a - 0.5, true);
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------------ effects (drawn over the sprite, no shadow)

/** a swing: three stacked arcs sweeping from a0 to a1 round (cx, cy), fattest at the weapon's end */
function swoosh(ctx: Ctx, cx: number, cy: number, R: number, a0: number, a1: number, th: number) {
  const n = 12;
  for (let j = 0; j < 3; j++) {
    const rr = R - j * th * 1.5;
    const w = th * (1 - j * 0.25);
    const s0 = a0 + (a1 - a0) * j * 0.18;
    ctx.fillStyle = j === 0 ? FX : FX_HI;
    ctx.globalAlpha = 0.95 - j * 0.15;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = s0 + ((a1 - s0) * i) / n;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const a = s0 + ((a1 - s0) * i) / n;
      const k = i / n;
      const q = rr - w * k * k;
      ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** speed streaks trailing behind a thrust or a lunge: n bars ending at x, stacked down from y */
function streaks(ctx: Ctx, x: number, y: number, len: number, gap: number, n: number, th: number) {
  ctx.fillStyle = FX;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const l = len * (1 - Math.abs(i - (n - 1) / 2) * (n > 2 ? 0.35 : 0) - (n === 2 ? i * 0.3 : 0));
    cap(ctx, x - l, y + i * gap, x, y + i * gap, th);
  }
  ctx.fill();
}

/** the impact: a fat gold five-point star with a white heart and two chips flying off */
function impact(ctx: Ctx, x: number, y: number, s: number) {
  const star = (R: number, rot: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.46 : R;
      const a = rot - PI / 2 + (i * PI) / 5;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = FX;
  star(s, 0.2);
  ctx.fillStyle = FX_HI;
  star(s * 0.5, 0.2);
  ctx.fillStyle = FX;
  ctx.beginPath();
  tri(ctx, x + s * 1.05, y - s * 0.75, x + s * 1.4, y - s * 0.95, x + s * 1.25, y - s * 0.55, s * 0.06);
  tri(ctx, x + s * 1.1, y + s * 0.55, x + s * 1.45, y + s * 0.6, x + s * 1.2, y + s * 0.85, s * 0.06);
  ctx.fill();
}

// ------------------------------------------------------------------ weapons in hand

/**
 * Where a held weapon points (radians: 0 = forward, + = down), per pet and pose. Idle weapons point forward and
 * down, away from the face. The ant's attack slashes down from above; the frog's is an uppercut from below, so
 * its weapon stays clear of its wide face.
 */
const AIM: Record<'ant' | 'frog', Record<WeaponType, number[]>> = {
  ant: { knife: [0.62, 0.25, 1.25], bat: [0.8, 0.3, 1.3], spear: [0.3, 0.06, 0.95], shield: [0, 0, 0] },
  frog: { knife: [0.62, -0.62, 1.25], bat: [0.8, -0.86, 1.3], spear: [0.3, -0.12, 0.95], shield: [0, 0, 0] },
};
let PET: 'ant' | 'frog' = 'ant';

function held(ctx: Ctx, w: WeaponType, x: number, y: number, pose: number, k: number) {
  ctx.save();
  ctx.translate(x, y);
  if (w === 'shield') {
    itemLight(LX, LY);
    ctx.scale(k * 0.74, k);
  } else {
    const a = AIM[PET][w][pose];
    const c = Math.cos(a);
    const s = Math.sin(a);
    itemLight(LX * c + LY * s, -LX * s + LY * c);
    ctx.rotate(a);
    ctx.scale(k, k);
  }
  weapon(ctx, w);
  ctx.restore();
}

/** the helmet on a head: its rim centred at (x, y), half width w, squashed to sy of its height, tipped by tilt */
function hat(ctx: Ctx, P: Pal, x: number, y: number, w: number, sy: number, tilt: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(w, w * sy);
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  itemLight(LX * c + LY * s, -LX * s + LY * c);
  helmet(ctx, { lit: P.plume, shade: P.plumeS });
  ctx.restore();
}

/** the swing or thrust behind a held weapon, from its grip at (x, y): from above (dir -1) or below (+1) */
function swing(ctx: Ctx, w: WeaponType | null, x: number, y: number, k: number, dir: number) {
  if (w === 'knife' || w === 'bat') {
    const a1 = AIM[PET][w][1];
    const len = (w === 'bat' ? 1.0 : 1.08) * k;
    swoosh(ctx, x, y, len * 0.86, a1 + dir * 1.8, a1 + dir * 0.14, len * 0.16);
  } else if (w === 'spear') {
    const a = AIM[PET].spear[1];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    streaks(ctx, -0.18, -0.2, 0.5, 0.4, 2, 0.035);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ the ant

/*
 * Head circle, thorax capsule, waist bead and a teardrop gaster tipped up and back, with air between the beads.
 * Three legs a side on the thorax: two pairs stand, the front pair are the arms. Elbowed antennae (an ant's
 * signature), mandibles that are two rounded triangles, and a glint of sky on the head.
 */
const AG = { x: -0.84, y: -0.74, R: 0.43, tip: -2.55, d: 0.6 };
const AW = { x: -0.33, y: -0.8, r: 0.095 };
const AT = [-0.12, -0.82, 0.14, -1.08, 0.22];
const AH = { x: 0.5, y: -1.56, r: 0.52 };
/** hips in the body frame: near hind, near mid, far hind, far mid */
const ANT_HIPS = [
  [-0.08, -0.8],
  [0.06, -0.86],
  [0.04, -0.86],
  [0.16, -0.92],
];
const ANT_SHOULDER = [0.18, -1.06];
const ANT_FAR_SHOULDER = [0.28, -1.1];
interface AntPose {
  lean: number;
  lunge: number;
  feet: number[][];
  hand: number[];
  farHand: number[];
  head: number[];
}
const ANT: AntPose[] = [
  {
    lean: 0,
    lunge: 0,
    feet: [
      [-0.6, 0],
      [0.46, 0],
      [-0.36, 0],
      [0.7, 0],
    ],
    hand: [0.8, -0.86],
    farHand: [0.86, -0.98],
    head: [0, 0],
  },
  {
    lean: 0.3,
    lunge: 0.34,
    feet: [
      [-0.66, 0],
      [0.96, 0],
      [-0.42, 0],
      [1.16, 0],
    ],
    hand: [1.04, -0.88],
    farHand: [1.16, -1.0],
    head: [0.02, 0],
  },
  {
    lean: -0.24,
    lunge: -0.26,
    feet: [
      [-0.76, 0],
      [0.18, -0.12],
      [-0.52, 0],
      [0.42, 0],
    ],
    hand: [0.6, -0.98],
    farHand: [0.68, -1.12],
    head: [-0.06, 0.1],
  },
];
const ANT_THIGH = 0.48;
const ANT_SHIN = 0.6;

function ant(ctx: Ctx, P: Pal, p: number, ph: number, o: PetOpts, blink: boolean, fx: boolean) {
  PET = 'ant';
  const A = ANT[p];
  const w = o.weapon ?? null;
  const b = p === 0 ? Math.sin(ph) : 0;
  frame(A.lunge, -b * 0.03, A.lean, -0.1, -0.85);
  const hx = AH.x + A.head[0];
  const hy = AH.y + A.head[1];
  const hand = [A.hand[0], A.hand[1] + b * 0.01];
  if (w === 'shield') {
    hand[0] += 0.06;
    hand[1] += 0.12;
  }
  const sh = bf(ANT_SHOULDER[0], ANT_SHOULDER[1]);
  const k = w === 'shield' ? 0.46 : w === 'spear' ? 0.6 : w === 'bat' ? 0.76 : 0.72;

  if (fx) {
    if (p === 1) {
      swing(ctx, w, hand[0], hand[1], k, -1);
      if (!w) {
        // a chomp: three ticks fanning out in front of the open jaws
        const [jx, jy] = bf(hx + 0.9, hy + 0.32);
        ctx.strokeStyle = FX;
        ctx.lineWidth = 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          const a = i * 0.6;
          ctx.moveTo(jx + Math.cos(a) * 0.16, jy + Math.sin(a) * 0.16);
          ctx.lineTo(jx + Math.cos(a) * 0.38, jy + Math.sin(a) * 0.38);
        }
        ctx.stroke();
      }
      streaks(ctx, -1.2, -1.32, 0.46, 0.2, 2, 0.04);
    } else if (p === 2) {
      const [ix, iy] = bf(hx + 0.62, hy - 0.4);
      impact(ctx, ix + 0.32, iy, 0.34);
    }
    return;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  light(0);

  // far legs and the far arm, deepest tone
  ctx.fillStyle = P.deep;
  ctx.beginPath();
  for (let i = 2; i < 4; i++) {
    const h = bf(ANT_HIPS[i][0], ANT_HIPS[i][1]);
    const f = A.feet[i];
    limb(ctx, h, joint(h[0], h[1], f[0], f[1], ANT_THIGH, ANT_SHIN, i === 2 ? 1 : -1), f, 0.07, 0.06);
  }
  const fs = bf(ANT_FAR_SHOULDER[0], ANT_FAR_SHOULDER[1]);
  const fh = A.farHand;
  limb(ctx, fs, joint(fs[0], fs[1], fh[0], fh[1], 0.32, 0.34, 1), fh, 0.062, 0.054);
  dot(ctx, fh[0], fh[1], 0.09);
  ctx.fill();

  // the body frame: antennae, gaster, waist, thorax
  enter(ctx);
  const sway = p === 0 ? Math.sin(ph + 1.3) * 0.03 : 0;
  const bk = p === 1 ? 0.14 : p === 2 ? -0.06 : 0;
  /** an elbowed antenna from (x0, y0): a stalk up to the elbow (dx, dy away), then a whip forward to the club */
  const antenna = (x0: number, y0: number, dx: number, dy: number, near: boolean) => {
    ctx.strokeStyle = near ? P.limbS : P.deep;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 0.08;
    const ex = x0 + dx - bk * 0.3;
    const ey = y0 + dy;
    const cx = ex + 0.3 - bk;
    const cy = ey - 0.04 + (near ? sway : -sway) + bk * 0.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(ex, ey);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.beginPath();
    dot(ctx, cx, cy, 0.09);
    ctx.fill();
  };
  if (!o.helmet) {
    antenna(hx + 0.2, hy - 0.44, -0.08, -0.3, false);
    antenna(hx - 0.06, hy - 0.42, -0.1, -0.3, true);
  }

  const gb = 1 + b * 0.035;
  const gaster = () => {
    ctx.beginPath();
    drop(ctx, AG.x, AG.y, AG.R * gb, AG.tip, AG.d * gb);
  };
  ctx.fillStyle = lit(ctx, AG.x, AG.y, AG.R * 1.1, P.body, P.bodyS);
  gaster();
  ctx.fill();
  // one segment band across the gaster
  ctx.save();
  gaster();
  ctx.clip();
  ctx.fillStyle = P.cast;
  ctx.beginPath();
  ctx.ellipse(AG.x + 0.48, AG.y - 0.04, 0.34, 0.6, 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = lit(ctx, AW.x, AW.y, AW.r, P.limb, P.limbS);
  ctx.beginPath();
  dot(ctx, AW.x, AW.y, AW.r);
  ctx.fill();

  const thorax = () => {
    ctx.beginPath();
    cap(ctx, AT[0], AT[1], AT[2], AT[3], AT[4]);
  };
  ctx.fillStyle = lit(ctx, (AT[0] + AT[2]) / 2, (AT[1] + AT[3]) / 2, 0.3, P.body, P.bodyS);
  thorax();
  ctx.fill();
  // the head's shadow cast down on the thorax
  ctx.save();
  thorax();
  ctx.clip();
  ctx.fillStyle = P.cast;
  ctx.beginPath();
  dot(ctx, hx + LX * 0.12, hy + LY * 0.12, AH.r);
  ctx.fill();
  ctx.restore();
  leave(ctx);

  // the near legs: one terminator for the pair
  ctx.fillStyle = lit(ctx, 0, -0.5, 0.6, P.limb, P.limbS);
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const h = bf(ANT_HIPS[i][0], ANT_HIPS[i][1]);
    const f = A.feet[i];
    limb(ctx, h, joint(h[0], h[1], f[0], f[1], ANT_THIGH, ANT_SHIN, i === 0 ? 1 : -1), f, 0.078, 0.066);
  }
  ctx.fill();

  // the head
  enter(ctx);
  const headFill = lit(ctx, hx, hy, AH.r, P.body, P.bodyS);
  ctx.fillStyle = headFill;
  ctx.beginPath();
  dot(ctx, hx, hy, AH.r);
  ctx.fill();
  glint(ctx, hx, hy, AH.r);

  // mandibles: two rounded triangles jutting from under the face, closed to a V, gaping for a bite
  const gape = p === 1 ? (w ? 0.5 : 1) : p === 2 ? 0.3 : 0;
  /** a mandible: a rounded triangle rooted at (x, y), pointing along a, L long, its base 2 hw across */
  const jaw = (x: number, y: number, a: number, L: number, hw: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    tri(ctx, x - s * hw, y + c * hw, x + s * hw, y - c * hw, x + c * L, y + s * L, 0.06);
  };
  // at rest two small fangs under the chin; they swing forward and apart as the jaw opens
  ctx.fillStyle = P.limbS;
  ctx.beginPath();
  jaw(hx + 0.36, hy + 0.3, 0.95 - gape * 1.4, 0.28 + gape * 0.18, 0.1);
  jaw(hx + 0.22, hy + 0.4, 1.3 - gape * 0.62, 0.26 + gape * 0.14, 0.09);
  ctx.fill();
  if (p === 0) {
    // a little smirk
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(hx + 0.16, hy + 0.22);
    ctx.quadraticCurveTo(hx + 0.28, hy + 0.3, hx + 0.42, hy + 0.2);
    ctx.stroke();
  }

  const state = p === 2 ? OUCH : blink ? SHUT : OPEN;
  eyes(ctx, [hx + 0.1, hy - 0.04, 0.21, hx + 0.42, hy - 0.06, 0.15], headFill, p === 1 ? 0.36 : 0.14, p === 1 ? 0.42 : 0.08, state);

  if (o.helmet) {
    hat(ctx, P, hx - 0.03, hy - 0.2, 0.58, 0.8, p === 2 ? -0.2 : -0.05);
    // the antennae come out at the front of the crown
    antenna(hx + 0.34, hy - 0.5, 0.06, -0.24, false);
    antenna(hx + 0.14, hy - 0.56, 0.04, -0.24, true);
  }
  leave(ctx);

  // the near arm and what it holds
  const el = joint(sh[0], sh[1], hand[0], hand[1], 0.34, 0.36, 1);
  ctx.fillStyle = lit(ctx, (sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2, 0.4, P.limb, P.limbS);
  ctx.beginPath();
  limb(ctx, sh, el, hand, 0.072, 0.062);
  ctx.fill();
  if (w) held(ctx, w, hand[0], hand[1], p, k);
  if (w !== 'shield') {
    ctx.fillStyle = P.limb;
    ctx.beginPath();
    dot(ctx, hand[0], hand[1], 0.105);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ the frog

/*
 * One mass of body and head (an ellipse each, unioned) with two eye domes on top, all under one terminator; a
 * cream belly and throat cut by the same curve; a folded hind leg (a teardrop thigh over a shin and a long foot
 * with three toe pads); a bent arm from the shoulder with a three-pad hand; a nostril punched out of the snout.
 */
const FB = { x: -0.24, y: -0.66, rx: 1.0, ry: 0.64, rot: -0.22 };
const FH = { x: 0.34, y: -1.18, rx: 0.8, ry: 0.5, rot: -0.04 };
const FDN = [0.06, -1.6, 0.33];
const FDF = [0.66, -1.64, 0.28];
/** the one terminator for the frog's mass */
const FM = [0.05, -1.02, 1.12];
const THIGH = { x: -0.7, y: -0.46, R: 0.38, a: 0.4, d: 0.78 };
const FROG_SHOULDER = [0.3, -0.84];
const FROG_FAR_SHOULDER = [0.66, -0.8];
interface FrogPose {
  lean: number;
  lunge: number;
  px: number;
  py: number;
  heel: number[];
  toes: number[];
  hand: number[];
  arm: number[];
  farHand: number[];
  jaw: number;
}
const FROG: FrogPose[] = [
  { lean: 0, lunge: 0, px: 0.6, py: -0.9, heel: [-0.5, -0.08], toes: [0.18, -0.08], hand: [0.6, -0.08], arm: [0.98, -0.6], farHand: [0.94, -0.08], jaw: 0 },
  { lean: 0.22, lunge: 0.1, px: 0.6, py: -0.9, heel: [-1.0, -0.08], toes: [-0.38, -0.06], hand: [0.98, -0.08], arm: [0.84, -0.46], farHand: [1.16, -0.08], jaw: 0.2 },
  { lean: -0.2, lunge: -0.16, px: -0.8, py: 0, heel: [-0.62, -0.08], toes: [0.06, -0.08], hand: [0.66, -0.5], arm: [0.8, -0.74], farHand: [0.9, -0.22], jaw: 0.08 },
];

/** a three-pad frog hand at (x, y), the pads fanned forward with air between them */
function pads(ctx: Ctx, x: number, y: number, s: number) {
  dot(ctx, x, y, 0.1 * s);
  for (let i = 0; i < 3; i++) {
    const a = -0.6 + i * 0.52;
    dot(ctx, x + Math.cos(a) * 0.17 * s, y + Math.sin(a) * 0.12 * s, 0.072 * s);
  }
}

function frog(ctx: Ctx, P: Pal, p: number, ph: number, o: PetOpts, blink: boolean, fx: boolean) {
  PET = 'frog';
  const F = FROG[p];
  const w = o.weapon ?? null;
  const b = p === 0 ? Math.sin(ph) : 0;
  const puff = p === 0 ? Math.max(0, Math.sin(ph - 1)) ** 2 : 0;
  const tongue = p === 1 && !w;
  frame(F.lunge, -b * 0.02, F.lean, F.px, F.py);
  const hand = w ? [F.arm[0], F.arm[1] + b * 0.015] : F.hand;
  if (w === 'shield') hand[1] += 0.06;
  const k = w === 'shield' ? 0.52 : w === 'spear' ? 0.66 : w === 'bat' ? 0.66 : 0.64;

  if (fx) {
    if (p === 1) {
      swing(ctx, w, hand[0], hand[1], k, 1);
      streaks(ctx, -1.24, -1.2, 0.5, 0.22, 2, 0.045);
    } else if (p === 2) {
      const [ix, iy] = bf(1.2, -1.66);
      impact(ctx, ix + 0.12, iy, 0.4);
    }
    return;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  light(0);

  // the far arm, mostly behind the belly, its hand planted beyond it
  const fs = bf(FROG_FAR_SHOULDER[0], FROG_FAR_SHOULDER[1]);
  const fh = F.farHand;
  ctx.fillStyle = P.limbS;
  ctx.beginPath();
  limb(ctx, fs, joint(fs[0], fs[1], fh[0], fh[1], 0.4, 0.42, 1), fh, 0.09, 0.075);
  pads(ctx, fh[0] + 0.04, fh[1] - 0.01, 0.9);
  ctx.fill();

  // the hind leg's shin and foot, under the thigh
  enter(ctx);
  const knee = bf(THIGH.x + Math.cos(THIGH.a) * THIGH.d * 0.92, THIGH.y + Math.sin(THIGH.a) * THIGH.d * 0.92);
  leave(ctx);
  ctx.fillStyle = lit(ctx, -0.2, -0.3, 0.6, P.limb, P.limbS);
  ctx.beginPath();
  cap(ctx, knee[0], knee[1], F.heel[0], F.heel[1], 0.1);
  cap(ctx, F.heel[0], F.heel[1], F.toes[0], F.toes[1], 0.075);
  pads(ctx, F.toes[0] + 0.04, F.toes[1] - 0.01, 1);
  ctx.fill();

  enter(ctx);
  // body, head and eye domes: one mass, one terminator
  const mass = (c: Ctx) => {
    c.beginPath();
    ell(c, FB.x, FB.y, FB.rx, FB.ry, FB.rot);
    ell(c, FH.x, FH.y + b * 0.01, FH.rx, FH.ry, FH.rot);
    dot(c, FDN[0], FDN[1], FDN[2]);
    dot(c, FDF[0], FDF[1], FDF[2]);
  };
  const massFill = lit(ctx, FM[0], FM[1], FM[2], P.body, P.bodyS, 0.34);
  ctx.fillStyle = massFill;
  mass(ctx);
  ctx.fill();

  ctx.save();
  mass(ctx);
  ctx.clip();
  // spots on the back, under the same terminator
  ctx.fillStyle = lit(ctx, FM[0], FM[1], FM[2], P.spot, P.spotS, 0.34);
  ctx.beginPath();
  dot(ctx, -0.6, -1.0, 0.14);
  dot(ctx, -0.92, -0.72, 0.09);
  dot(ctx, -0.3, -1.12, 0.075);
  ctx.fill();
  // cream belly and throat, cut by the same curve; the throat puffs while it idles
  const jaw = F.jaw;
  ctx.fillStyle = lit(ctx, FM[0], FM[1], FM[2], P.belly, P.bellyS, 0.34);
  ctx.beginPath();
  ell(ctx, 0.36, -0.5, 0.52, 0.46);
  ell(ctx, 0.54, -0.96 + jaw * 0.5 + puff * 0.03, 0.58 + puff * 0.04, 0.24 + puff * 0.08 + jaw * 0.2);
  ctx.fill();
  // the thigh's shadow on the body, then the arm's on the belly
  ctx.fillStyle = P.cast;
  ctx.beginPath();
  drop(ctx, THIGH.x + LX * 0.1, THIGH.y + LY * 0.1, THIGH.R, THIGH.a, THIGH.d);
  ctx.fill();
  ctx.restore();

  // the mouth: a long dark wedge that curls up at the corner (open for the tongue)
  const my = -1.12;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-0.16, my - 0.12);
  ctx.quadraticCurveTo(-0.1, my + 0.0, 0.1, my + 0.02);
  ctx.quadraticCurveTo(0.7, my + 0.08, 1.12, my - 0.04);
  ctx.lineTo(1.1, my + 0.0 + jaw * 1.1);
  ctx.quadraticCurveTo(0.7, my + 0.14 + jaw, 0.1, my + 0.07);
  ctx.quadraticCurveTo(-0.1, my + 0.06, -0.16, my - 0.12);
  ctx.fill();
  if (tongue) {
    ctx.fillStyle = '#ff7aa6';
    ctx.beginPath();
    cap(ctx, 0.84, my + 0.1, 1.62, my + 0.06, 0.075);
    ctx.fill();
    ctx.fillStyle = lit(ctx, 1.7, my + 0.06, 0.16, '#ff9cc0', '#de4f88');
    ctx.beginPath();
    dot(ctx, 1.7, my + 0.06, 0.16);
    ctx.fill();
  }

  // the thigh: a teardrop folded down toward the knee
  ctx.fillStyle = lit(ctx, THIGH.x, THIGH.y, THIGH.R * 1.05, P.body, P.bodyS, 0.4);
  ctx.beginPath();
  drop(ctx, THIGH.x, THIGH.y, THIGH.R, THIGH.a, THIGH.d);
  ctx.fill();

  // eyes in the domes, then the helmet seated on both domes like a pot lid
  const state = p === 2 ? OUCH : blink ? SHUT : OPEN;
  eyes(ctx, [FDN[0] + 0.04, FDN[1] - 0.02, 0.24, FDF[0] + 0.03, FDF[1] - 0.02, 0.2], massFill, p === 1 ? 0.36 : 0.12, p === 1 ? 0.42 : 0.06, state);
  if (o.helmet) hat(ctx, P, 0.36, -1.86, 0.74, 0.64, p === 2 ? -0.14 : -0.04);
  leave(ctx);

  // the near arm: upper arm from the shoulder, forearm, a three-pad hand; its shadow falls on the belly
  const sh = bf(FROG_SHOULDER[0], FROG_SHOULDER[1]);
  const el = joint(sh[0], sh[1], hand[0], hand[1], 0.5, 0.48, 1);
  const arm = (c: Ctx, dx: number, dy: number) => {
    c.beginPath();
    limb(c, [sh[0] + dx, sh[1] + dy], [el[0] + dx, el[1] + dy], [hand[0] + dx, hand[1] + dy], 0.1, 0.085);
  };
  ctx.save();
  enter(ctx);
  ctx.beginPath();
  ell(ctx, FB.x, FB.y, FB.rx, FB.ry, FB.rot);
  ell(ctx, FH.x, FH.y, FH.rx, FH.ry, FH.rot);
  leave(ctx);
  ctx.clip();
  ctx.fillStyle = P.cast;
  arm(ctx, LX * 0.1, LY * 0.1);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = lit(ctx, (sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2, 0.5, P.body, P.bodyS);
  arm(ctx, 0, 0);
  ctx.fill();
  if (w) held(ctx, w, hand[0], hand[1], p, k);
  if (w !== 'shield') {
    ctx.fillStyle = P.limb;
    ctx.beginPath();
    if (w) dot(ctx, hand[0], hand[1], 0.11);
    else pads(ctx, hand[0] + 0.04, hand[1] - 0.01, 1);
    ctx.fill();
  }
}

/** the frog's nostril, a notch punched clean through the snout (the sprite is its own canvas) */
function nostril(ctx: Ctx) {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  enter(ctx);
  ell(ctx, 1.0, -1.42, 0.05, 0.035, -0.4);
  leave(ctx);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ painting

/** idle breaths per second, as a phase rate (radians per second) */
const RATE = { ant: 3.2, frog: 2.6 };

/** The pet (fx false) or its effects (fx true), standing on (x, y). ph is the idle breath's phase in radians. */
function paint(ctx: Ctx, type: PetType, team: Team, x: number, y: number, r: number, p: number, ph: number, blink: boolean, o: PetOpts, fx: boolean) {
  FACE = o.face ?? 1;
  ctx.save();
  ctx.translate(x, y);
  const b = p === 0 ? Math.sin(ph) : 0;
  ctx.scale(FACE * r * STRETCH[p][0] * (1 - b * 0.012), r * STRETCH[p][1] * (1 + b * 0.022));
  const P = PAL[team];
  if (type === 'frog') {
    frog(ctx, P, p, ph, o, blink, fx);
    if (!fx) nostril(ctx);
  } else ant(ctx, P, p, ph, o, blink, fx);
  ctx.restore();
}

// ------------------------------------------------------------------ the sprite cache

/*
 * A battle draws ~50 pets 60 times a second, so each look is painted once, at the device's own scale, into a
 * sprite that holds the pet, its effects and its long shadow, and then only blitted, snapped to whole device
 * pixels. The idle breath is cut into FRAMES phases. A rotated or skewed context, or a huge pet, gets a sprite
 * made for that one call and drawn through the context's transform.
 */
interface Sprite {
  c: HTMLCanvasElement;
  ox: number;
  oy: number;
  n: number;
  look?: string;
}
const FRAMES = 8;
const SPRITES = new Map<string, Sprite>();
/** the newest sprite of each look (any breath phase), to stand in while the build budget is spent */
const LOOKS = new Map<string, Sprite>();
/** ms of sprite building allowed per frame before a look falls back to another of its cached phases */
const BUDGET = 4;
let frameAt = 0;
let spent = 0;
const CAP = 14e6; // device pixels kept, all sprites together
let heldPx = 0;
/** sprite bounds around the ground point, in r, per pet and pose: back, front, up, down (facing right) */
const BOUNDS: Record<'ant' | 'frog', number[][]> = {
  ant: [
    [1.42, 1.85, 2.72, 0.16],
    [1.5, 2.3, 2.75, 0.18],
    [1.62, 2.1, 2.8, 0.2],
  ],
  frog: [
    [1.36, 1.85, 2.66, 0.16],
    [1.52, 2.1, 2.7, 0.18],
    [1.5, 2.0, 2.8, 0.2],
  ],
};

let scratchA: HTMLCanvasElement | null = null;
let scratchB: HTMLCanvasElement | null = null;
function scratch(i: number, w: number, h: number): Ctx {
  let c = i ? scratchB : scratchA;
  if (!c) {
    c = document.createElement('canvas');
    if (i) scratchB = c;
    else scratchA = c;
  }
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
  }
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  return g;
}

/** paints one look at R device pixels per r: the pet, its long shadow laid down behind it, its effects on top */
function render(type: PetType, team: Team, p: number, ph: number, blink: boolean, o: PetOpts, R: number): Sprite {
  const face = o.face ?? 1;
  const bd = BOUNDS[type === 'frog' ? 'frog' : 'ant'][p];
  const L = Math.ceil(R * (face > 0 ? bd[0] : bd[1])) + 2;
  const Rt = Math.ceil(R * (face > 0 ? bd[1] : bd[0])) + 2;
  const T = Math.ceil(R * bd[2]) + 2;
  const B = Math.ceil(R * bd[3]) + 2;
  const W = L + Rt;
  const H = T + B;
  // the body's own height is under 2.5 r (the rest of T is room for plumes and stars), so its shadow is too
  const SX = Math.ceil(SUN.kx * R * 2.5) + 2;
  const SY = Math.ceil(SUN.ky * R * 2.5) + 2;
  const CW = W + SX;
  const CH = T + Math.max(B, SY);

  const a = scratch(0, W, H);
  paint(a, type, team, L, T, R, p, ph, blink, o, false);

  // the shadow: the silhouette sheared down onto the ground, filled flat, fading out only at its far end
  const s = scratch(1, CW, CH);
  s.setTransform(1, 0, -SUN.kx, -SUN.ky, SUN.kx * T, T * (1 + SUN.ky));
  s.drawImage(a.canvas, 0, 0, W, H, 0, 0, W, H);
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = SUN.color;
  s.fillRect(0, 0, CW, CH);
  s.globalCompositeOperation = 'destination-out';
  const fade = s.createLinearGradient(0, T + R * 1.3 * SUN.ky, 0, T + R * 2.5 * SUN.ky);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.9)');
  s.fillStyle = fade;
  s.fillRect(0, 0, CW, CH);
  s.globalCompositeOperation = 'source-over';

  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d')!;
  g.globalAlpha = SUN.alpha;
  g.drawImage(s.canvas, 0, 0, CW, CH, 0, 0, CW, CH);
  g.globalAlpha = 1;
  g.drawImage(a.canvas, 0, 0, W, H, 0, 0, W, H);
  if (p !== 0) paint(g, type, team, L, T, R, p, ph, blink, o, true);
  return { c, ox: L, oy: T, n: CW * CH };
}

function cached(type: PetType, team: Team, p: number, q: number, blink: boolean, o: PetOpts, R: number): Sprite {
  const look = `${type}${team}${p}${o.weapon ?? '-'}${o.helmet ? 1 : 0}${o.face ?? 1}${R}`;
  const key = `${look}|${q}${blink ? 1 : 0}`;
  const hit = SPRITES.get(key);
  if (hit) {
    SPRITES.delete(key);
    SPRITES.set(key, hit);
    return hit;
  }
  const now = performance.now();
  if (now - frameAt > 12) {
    frameAt = now;
    spent = 0;
  }
  const stand = LOOKS.get(look);
  if (stand && spent > BUDGET) return stand;
  const s = render(type, team, p, ((q + 0.5) * TAU) / FRAMES, blink, o, R);
  spent += performance.now() - now;
  s.look = look;
  SPRITES.set(key, s);
  LOOKS.set(look, s);
  heldPx += s.n;
  while (heldPx > CAP && SPRITES.size > 1) {
    const old = SPRITES.keys().next().value as string;
    const o2 = SPRITES.get(old)!;
    heldPx -= o2.n;
    SPRITES.delete(old);
    if (o2.look && LOOKS.get(o2.look) === o2) LOOKS.delete(o2.look);
  }
  return s;
}

// ------------------------------------------------------------------ the style

export const style2: ArtStyle = {
  NAME: 'Flat Geometric',
  BLURB: 'No outlines: clean shapes under one curved cut of sun, laying a long hard shadow',
  drawPet(ctx, type: PetType, team: Team, x, y, r, pose, t, o: PetOpts = {}) {
    if (!(r > 0)) return;
    const p = POSE[pose];
    const ph = t * RATE[type === 'frog' ? 'frog' : 'ant'];
    const blink = p === 0 && (t + 0.6) % 3.3 < 0.14;
    // the flinch shakes (a deliberate boil, from t)
    const shake = p === 2 ? Math.sin(t * 53) * 0.05 * r * (o.face ?? 1) : 0;

    const m = ctx.getTransform();
    if (m.b === 0 && m.c === 0 && m.a > 0 && Math.abs(m.a - m.d) < 1e-6 && r * m.a < 200) {
      // the fast path: one cached sprite, blitted at whole device pixels
      const R = Math.round(r * m.a * 2) / 2;
      const q = p === 0 && !blink ? Math.floor(((((ph / TAU) % 1) + 1) % 1) * FRAMES) % FRAMES : 0;
      const s = cached(type, team, p, q, blink, o, R);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(s.c, Math.round(m.a * (x + shake) + m.e - s.ox), Math.round(m.d * y + m.f - s.oy));
      ctx.restore();
      return;
    }
    // the slow path: a sprite for this call alone, drawn through the transform
    const k = Math.hypot(m.a, m.b) || 1;
    const s = render(type, team, p, ph, blink, o, r * k);
    ctx.drawImage(s.c, x + shake - s.ox / k, y - s.oy / k, s.c.width / k, s.c.height / k);
  },
  drawItem(ctx, type, x, y, size) {
    icon(ctx, type, x, y, size);
  },
};
