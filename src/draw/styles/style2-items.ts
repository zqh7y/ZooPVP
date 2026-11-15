import type { ItemType } from './api';
import type { WeaponType } from '../../types';
import { moon, SUN, type Ctx } from './style2-kit';

/*
 * Style 2's items. Each is a handful of flat shapes with no outlines: long things are cut lengthwise into a
 * lit and a shaded side (a blade's ridge), round things get the same curved terminator as the pets. A weapon is
 * drawn with its grip at the origin, pointing along +x, about 1 unit from grip to tip, so a pet can hold it and
 * the lobby can show it.
 */
const PI = Math.PI;
const TAU = PI * 2;
const S = Math.SQRT1_2;

const STEEL = { lit: '#f3f7fb', shade: '#aab7c7' };
const IRON = { lit: '#cfd8e3', shade: '#8696aa' };
const WOOD = { lit: '#f4b46a', shade: '#c4773a' };
const GOLD = { lit: '#ffd43f', shade: '#e99a00' };
const SLATE = { lit: '#4a5870', shade: '#2b3446' };
const CREAM = { lit: '#fffaf0', shade: '#e4d3b8' };
const CHILI = { lit: '#ff6d2e', shade: '#d23d1a' };
const LIME = { lit: '#bce34c', shade: '#6daa28' };

type Pair = { lit: string; shade: string };

/** the light's direction in the item's own space (a pet turns it to match the way it holds the item) */
let LX = S;
let LY = S;
export function itemLight(lx: number, ly: number) {
  LX = lx;
  LY = ly;
}

/** while set, every part is filled with this one colour: the icon's shadow */
let SIL: string | null = null;

/** a hard lengthwise split along y = y0, the side the light comes from lit */
function bevel(ctx: Ctx, c: Pair, y0 = 0): string | CanvasGradient {
  if (SIL) return SIL;
  const g = ctx.createLinearGradient(0, y0 - 1, 0, y0 + 1);
  const a = LY >= 0 ? c.lit : c.shade;
  const b = LY >= 0 ? c.shade : c.lit;
  g.addColorStop(0, a);
  g.addColorStop(0.496, a);
  g.addColorStop(0.504, b);
  g.addColorStop(1, b);
  return g;
}
/** the curved terminator, for round things */
const round = (ctx: Ctx, c: Pair, cx: number, cy: number, rho: number, k = 0.3) => SIL ?? moon(ctx, cx, cy, rho, LX, LY, c.lit, c.shade, k);

export function capsule(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.moveTo(x1 + r * Math.cos(a - PI / 2), y1 + r * Math.sin(a - PI / 2));
  ctx.arc(x1, y1, r, a - PI / 2, a + PI / 2);
  ctx.arc(x0, y0, r, a + PI / 2, a + (3 * PI) / 2);
  ctx.closePath();
}
function dot(ctx: Ctx, x: number, y: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}
/** a triangle with rounded corners, wound clockwise whatever order the corners come in */
export function tri(ctx: Ctx, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, rad: number) {
  if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) {
    const tx = bx;
    const ty = by;
    bx = cx;
    by = cy;
    cx = tx;
    cy = ty;
  }
  ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
  ctx.arcTo(bx, by, cx, cy, rad);
  ctx.arcTo(cx, cy, ax, ay, rad);
  ctx.arcTo(ax, ay, bx, by, rad);
  ctx.closePath();
}

function knife(ctx: Ctx) {
  ctx.fillStyle = bevel(ctx, WOOD);
  ctx.beginPath();
  capsule(ctx, -0.44, 0, -0.02, 0, 0.105);
  ctx.fill();
  ctx.fillStyle = round(ctx, GOLD, -0.48, 0, 0.1);
  ctx.beginPath();
  dot(ctx, -0.48, 0, 0.1);
  ctx.fill();
  ctx.fillStyle = bevel(ctx, GOLD);
  ctx.beginPath();
  capsule(ctx, 0.06, -0.2, 0.06, 0.2, 0.07);
  ctx.fill();
  // a broad blade: straight spine, the edge sweeping up into the point
  ctx.fillStyle = bevel(ctx, STEEL, 0.03);
  ctx.beginPath();
  ctx.moveTo(0.13, -0.16);
  ctx.lineTo(0.74, -0.16);
  ctx.quadraticCurveTo(1.0, -0.15, 1.12, -0.04);
  ctx.quadraticCurveTo(0.92, 0.2, 0.6, 0.2);
  ctx.lineTo(0.13, 0.2);
  ctx.closePath();
  ctx.fill();
}

function bat(ctx: Ctx) {
  ctx.fillStyle = bevel(ctx, WOOD);
  ctx.beginPath();
  ctx.moveTo(-0.58, -0.07);
  ctx.lineTo(-0.04, -0.075);
  ctx.quadraticCurveTo(0.28, -0.08, 0.5, -0.19);
  ctx.lineTo(0.82, -0.2);
  ctx.arc(0.82, 0, 0.2, -PI / 2, PI / 2);
  ctx.lineTo(0.5, 0.19);
  ctx.quadraticCurveTo(0.28, 0.08, -0.04, 0.075);
  ctx.lineTo(-0.58, 0.07);
  ctx.closePath();
  ctx.fill();
  // grip tape and the knob
  ctx.fillStyle = bevel(ctx, SLATE);
  ctx.beginPath();
  ctx.rect(-0.58, -0.085, 0.36, 0.17);
  ctx.moveTo(-0.56, 0);
  ctx.ellipse(-0.62, 0, 0.07, 0.15, 0, 0, TAU);
  ctx.fill();
}

function spear(ctx: Ctx) {
  ctx.fillStyle = bevel(ctx, WOOD);
  ctx.beginPath();
  capsule(ctx, -0.95, 0, 0.5, 0, 0.075);
  ctx.fill();
  // gold butt cap and collar, a gold tassel hanging from the collar
  ctx.fillStyle = bevel(ctx, GOLD);
  ctx.beginPath();
  dot(ctx, -0.98, 0, 0.1);
  capsule(ctx, 0.44, 0, 0.56, 0, 0.12);
  tri(ctx, 0.4, 0.06, 0.52, 0.08, 0.32, 0.42, 0.03);
  ctx.fill();
  // a big leaf head with a ridge down its middle
  ctx.fillStyle = bevel(ctx, STEEL);
  ctx.beginPath();
  ctx.moveTo(0.58, 0);
  ctx.quadraticCurveTo(0.62, -0.25, 0.84, -0.25);
  ctx.quadraticCurveTo(1.06, -0.22, 1.3, 0);
  ctx.quadraticCurveTo(1.06, 0.22, 0.84, 0.25);
  ctx.quadraticCurveTo(0.62, 0.25, 0.58, 0);
  ctx.closePath();
  ctx.fill();
}

/** a round shield seen face on, radius 1: steel rim, slate face, a gold ring and a steel boss */
function shield(ctx: Ctx) {
  ctx.fillStyle = round(ctx, STEEL, 0, 0, 1);
  ctx.beginPath();
  dot(ctx, 0, 0, 1);
  ctx.fill();
  ctx.fillStyle = round(ctx, SLATE, 0, 0, 1);
  ctx.beginPath();
  dot(ctx, 0, 0, 0.8);
  ctx.fill();
  ctx.fillStyle = round(ctx, GOLD, 0, 0, 1);
  ctx.beginPath();
  dot(ctx, 0, 0, 0.56);
  ctx.fill();
  ctx.fillStyle = round(ctx, SLATE, 0, 0, 1);
  ctx.beginPath();
  dot(ctx, 0, 0, 0.42);
  ctx.fill();
  ctx.fillStyle = round(ctx, STEEL, 0, 0, 0.26);
  ctx.beginPath();
  dot(ctx, 0, 0, 0.24);
  ctx.fill();
  // four gold studs on the rim
  ctx.fillStyle = SIL ?? GOLD.lit;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2;
    dot(ctx, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.065);
  }
  ctx.fill();
}

/** Draws a weapon with its grip at the origin, pointing along +x. */
export function weapon(ctx: Ctx, w: WeaponType) {
  if (w === 'knife') knife(ctx);
  else if (w === 'bat') bat(ctx);
  else if (w === 'spear') spear(ctx);
  else shield(ctx);
}

/**
 * The gladiator helmet from the side, facing right: a steel dome on a gold brow band, a cheek guard hanging at
 * the side with a gap of air between it and the dome, a flared neck guard, and a plume of four stacked rounded
 * triangles swept back along the crown. Its rim sits on y = 0 and spans x -1..1; the dome rises to y -0.9, the
 * plume to about -1.4, the cheek guard hangs to 0.55. The plume takes the team's colours on a pet.
 */
export function helmet(ctx: Ctx, plume: Pair = GOLD, guard = true) {
  // the plume, behind the dome: each blade rooted under the crown and swept back
  ctx.fillStyle = round(ctx, plume, -0.2, -1.0, 0.7);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const th = 1.18 + i * 0.36; // around the crown, front to back
    const c = Math.cos(th);
    const s = Math.sin(th);
    const reach = 1.32 + i * 0.05;
    const sw = th + 0.42; // the tip swept back
    tri(ctx, Math.cos(th - 0.24) * 0.7, -Math.sin(th - 0.24) * 0.62, Math.cos(th + 0.26) * 0.7, -Math.sin(th + 0.26) * 0.62, c * 0.2 + Math.cos(sw) * reach, -s * 0.2 - Math.sin(sw) * reach * 0.94, 0.07);
  }
  ctx.fill();
  // the neck guard flaring out at the back
  ctx.fillStyle = bevel(ctx, IRON, 0.1);
  ctx.beginPath();
  ctx.moveTo(-0.9, -0.3);
  ctx.quadraticCurveTo(-1.02, 0.02, -1.2, 0.2);
  ctx.quadraticCurveTo(-0.96, 0.28, -0.7, 0.16);
  ctx.lineTo(-0.66, -0.1);
  ctx.closePath();
  ctx.fill();
  // the dome
  ctx.fillStyle = round(ctx, STEEL, 0, -0.45, 0.95);
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.ellipse(0, 0, 1, 0.9, 0, PI, TAU);
  ctx.closePath();
  ctx.fill();
  // the cheek guard, hung below the band with air between
  if (guard) {
    ctx.fillStyle = round(ctx, IRON, -0.4, 0.28, 0.32);
    ctx.beginPath();
    ctx.moveTo(-0.74, 0.12);
    ctx.lineTo(-0.2, 0.12);
    ctx.quadraticCurveTo(-0.18, 0.44, -0.4, 0.56);
    ctx.quadraticCurveTo(-0.7, 0.6, -0.74, 0.34);
    ctx.closePath();
    ctx.fill();
  }
  // the brow band, running out into a short peak at the front
  ctx.fillStyle = bevel(ctx, GOLD, -0.02);
  ctx.beginPath();
  ctx.moveTo(-1.03, -0.15);
  ctx.lineTo(0.92, -0.15);
  ctx.quadraticCurveTo(1.18, -0.12, 1.24, 0.07);
  ctx.lineTo(-1.03, 0.08);
  ctx.closePath();
  ctx.fill();
}

function sneaker(ctx: Ctx) {
  // a gold high-top, heel up at the back
  ctx.fillStyle = round(ctx, GOLD, -0.1, -0.2, 0.75);
  ctx.beginPath();
  ctx.moveTo(-0.92, 0.24);
  ctx.lineTo(-0.9, -0.52);
  ctx.quadraticCurveTo(-0.88, -0.72, -0.68, -0.72);
  ctx.lineTo(-0.26, -0.66);
  ctx.lineTo(0.14, -0.2);
  ctx.quadraticCurveTo(0.98, -0.14, 1.0, 0.24);
  ctx.closePath();
  ctx.fill();
  // cream toe cap and a slate bolt down the side
  ctx.fillStyle = SIL ?? CREAM.lit;
  ctx.beginPath();
  ctx.moveTo(0.4, 0.24);
  ctx.quadraticCurveTo(0.4, -0.12, 0.6, -0.15);
  ctx.quadraticCurveTo(0.96, -0.1, 1.0, 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = SIL ?? SLATE.lit;
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.5);
  ctx.lineTo(-0.16, -0.14);
  ctx.lineTo(-0.36, -0.1);
  ctx.lineTo(-0.02, 0.22);
  ctx.lineTo(-0.6, -0.04);
  ctx.lineTo(-0.4, -0.08);
  ctx.closePath();
  // laces
  for (let i = 0; i < 3; i++) {
    const x = -0.2 + i * 0.13;
    const y = -0.5 + i * 0.13;
    ctx.moveTo(x - 0.12, y - 0.02);
    ctx.lineTo(x + 0.03, y - 0.16);
    ctx.lineTo(x + 0.1, y - 0.09);
    ctx.lineTo(x - 0.05, y + 0.05);
    ctx.closePath();
  }
  ctx.fill();
  // the sole
  ctx.fillStyle = bevel(ctx, CREAM, 0.36);
  ctx.beginPath();
  ctx.moveTo(-0.97, 0.2);
  ctx.lineTo(0.82, 0.2);
  ctx.quadraticCurveTo(1.07, 0.2, 1.07, 0.37);
  ctx.quadraticCurveTo(1.07, 0.54, 0.86, 0.54);
  ctx.lineTo(-0.86, 0.54);
  ctx.quadraticCurveTo(-0.99, 0.54, -0.99, 0.4);
  ctx.closePath();
  ctx.fill();
}

function chili(ctx: Ctx) {
  // the pod: a fat crescent tapering to a curled tip
  ctx.fillStyle = round(ctx, CHILI, -0.1, 0.05, 0.75);
  ctx.beginPath();
  ctx.moveTo(-0.66, -0.5);
  ctx.bezierCurveTo(-1.0, 0.18, -0.36, 0.9, 0.74, 0.64);
  ctx.quadraticCurveTo(0.98, 0.58, 0.88, 0.5);
  ctx.bezierCurveTo(0.1, 0.46, -0.1, 0.0, -0.1, -0.5);
  ctx.closePath();
  ctx.fill();
  // the lime cap and stalk
  ctx.fillStyle = round(ctx, LIME, -0.38, -0.6, 0.3);
  ctx.beginPath();
  ctx.ellipse(-0.38, -0.56, 0.34, 0.15, 0.08, 0, TAU);
  capsule(ctx, -0.36, -0.62, -0.1, -0.95, 0.075);
  ctx.fill();
}

function place(ctx: Ctx, type: ItemType, h: number) {
  if (type === 'knife') {
    ctx.rotate(-PI / 4);
    ctx.scale(h * 1.2, h * 1.2);
    ctx.translate(-0.32, 0);
    knife(ctx);
  } else if (type === 'bat') {
    ctx.rotate(-PI / 4);
    ctx.scale(h * 1.14, h * 1.14);
    ctx.translate(-0.12, 0);
    bat(ctx);
  } else if (type === 'spear') {
    ctx.rotate(-PI / 4);
    ctx.scale(h * 0.98, h * 0.98);
    ctx.translate(-0.17, 0);
    spear(ctx);
  } else if (type === 'shield') {
    ctx.scale(h * 0.8, h * 0.8);
    shield(ctx);
  } else if (type === 'helmet') {
    ctx.translate(h * 0.04, h * 0.2);
    ctx.scale(h * 0.66, h * 0.66);
    helmet(ctx);
  } else if (type === 'sneakers') {
    ctx.translate(0, -h * 0.04);
    ctx.scale(h * 0.84, h * 0.84);
    sneaker(ctx);
  } else {
    ctx.scale(h * 0.92, h * 0.92);
    chili(ctx);
  }
}

/** each icon's shadow silhouette, filled opaque once so overlapping parts do not stack, then laid down see-through */
const SILS = new Map<string, { c: HTMLCanvasElement; s: number; half: number }>();
function silhouette(type: ItemType, size: number, s: number) {
  const key = `${type}${size}${s}`;
  let v = SILS.get(key);
  if (v) return v;
  const half = Math.ceil(size * 0.62 * s);
  const c = document.createElement('canvas');
  c.width = c.height = half * 2;
  const g = c.getContext('2d')!;
  g.translate(half, half);
  g.scale(s, s);
  SIL = '#5c4634';
  place(g, type, size / 2);
  SIL = null;
  v = { c, s, half };
  if (SILS.size > 64) SILS.clear();
  SILS.set(key, v);
  return v;
}

/**
 * An item's lobby icon, centred at (x, y) in a size x size box. Like the pets it throws a hard shadow away
 * from the sun (to the right and a little down), as if it hovered just over the tile.
 */
export function icon(ctx: Ctx, type: ItemType, x: number, y: number, size: number) {
  const m = ctx.getTransform();
  const s = Math.round(Math.hypot(m.a, m.b) * 4) / 4 || 1;
  const v = silhouette(type, size, s);
  const dx = size * SUN.kx * 0.08;
  const dy = size * (SUN.ky * 0.08 + 0.025);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.2;
  ctx.drawImage(v.c, x + dx - v.half / s, y + dy - v.half / s, (v.half * 2) / s, (v.half * 2) / s);
  ctx.globalAlpha = a;
  itemLight(S, S);
  ctx.save();
  ctx.translate(x, y);
  place(ctx, type, size / 2);
  ctx.restore();
}
