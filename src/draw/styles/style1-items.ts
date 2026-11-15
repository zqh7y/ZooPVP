import type { ItemType } from './api';
import { clamp, seeded } from '../../util';
import { BRUSH, EVEN, PRESS, SWELL, arc, begin, cub, dot, dryPattern, emit, pt, quad, type Prof } from './style1-brush';

/*
 * Style 1 (Ink Brush): the weapons, the helmet and the perk icons, in the same brush as the pets. Each item is
 * drawn in its own frame in R50 units (the units a pet of r 50 is drawn in): a weapon has its grip on the
 * origin and points up, the helmet sits with the middle of its rim on the origin. The perk icons place these
 * in a 100 x 100 box and sign it with a small red seal.
 */
type Ctx = CanvasRenderingContext2D;

export const INK = '#17161d';
export const PAPER = '#fbf6ea';
const STEEL = '#c3cfdc';
const WOOD = '#ecb468';
const WOOD_DK = '#b5702f';
const GOLD = '#f6b928';
const SEAL = '#e0412a';
const CHILI = '#ef4b34';
const CHILI_DK = '#b8261a';
const LEAF = '#4f9a3e';
const PAPER_DK = '#e4d4b6';

let G = 1;
let K = 1;
let Q = 2;
/** Sets the ink weight and scale the next items are drawn at (the pet's, or the icon's). */
export function setInk(g: number, k: number, q = 2) {
  G = g;
  K = k;
  Q = q;
}

const st = (l: number) => clamp(Math.round((l * K) / (Q === 2 ? 2.4 : 3.2)), 2, 40);
function ln(x0: number, y0: number, x1: number, y1: number) {
  return Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
}
function C(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  begin();
  pt(x0, y0);
  cub(x1, y1, x2, y2, x3, y3, st((ln(x0, y0, x1, y1) + ln(x1, y1, x2, y2) + ln(x2, y2, x3, y3) + ln(x0, y0, x3, y3)) / 2));
}
function A(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number) {
  begin();
  arc(cx, cy, rx, ry, rot, a0, a1, st((Math.abs(a1 - a0) * (rx + ry)) / 2));
}
const ink = (ctx: Ctx, w: number, p: Prof, seed = 0) => emit(ctx, w * G, p, seed);
const LATE: Prof = { a: 0.15, h: 0.62, b: 0.04, wob: 0.1, cap: false };
const TAIL: Prof = { a: 0.55, h: 0.2, b: 0.0, wob: 0.08, cap: true };

/** the colour plates sit a little off the ink, like a print */
function off() {
  return clamp(1.5 / K, 1.2, 3.2);
}
function plate(ctx: Ctx, on: boolean) {
  const o = on ? -off() : off();
  ctx.translate(o, o * 0.7);
}
/** a wash: the dry-brush texture when big, a flat tone when small */
function wash(ctx: Ctx, color: string, alpha = 0.6) {
  if (Q === 0) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = dryPattern(ctx, color, 5, 1.2);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ weapons (grip on the origin, pointing up)

function knife(ctx: Ctx) {
  plate(ctx, true);
  ctx.beginPath();
  ctx.moveTo(-3.4, -1);
  ctx.lineTo(-3.4, -31);
  ctx.quadraticCurveTo(-3.1, -37.5, 1, -42);
  ctx.quadraticCurveTo(3.9, -33, 3.9, -24);
  ctx.lineTo(3.9, -1);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.beginPath();
  begin();
  pt(-1.1, -3);
  pt(-1.1, -24);
  quad(-1.1, -33, 0.2, -37, 4);
  emit(ctx, 3.2, EVEN, 1);
  wash(ctx, STEEL, 0.9);
  plate(ctx, false);

  ctx.beginPath();
  // the back of the blade, heavy; the edge, a thin flick from the tip
  begin();
  pt(-3.6, -1);
  pt(-3.6, -16);
  pt(-3.6, -31);
  quad(-3.3, -38, 1.1, -42.6, 4);
  ink(ctx, 3, LATE, 2);
  C(1.2, -42, 4.2, -36, 4.3, -28, 4.1, -14);
  ink(ctx, 2, BRUSH, 3);
  // the guard, the wrapped grip and the pommel
  dot(ctx, 0, 0, 6.8, 2.5);
  begin();
  pt(0, 1);
  pt(0, 8);
  pt(0, 14);
  emit(ctx, 7, EVEN, 4);
  dot(ctx, 0, 15, 3.8, 3.3);
  ctx.fillStyle = INK;
  ctx.fill();
  if (Q > 0) {
    ctx.beginPath();
    for (const y of [4.5, 10]) {
      ctx.moveTo(0, y - 2.2);
      ctx.lineTo(1.9, y);
      ctx.lineTo(0, y + 2.2);
      ctx.lineTo(-1.9, y);
      ctx.closePath();
    }
    ctx.fillStyle = PAPER;
    ctx.fill();
  }
}

function bat(ctx: Ctx) {
  plate(ctx, true);
  ctx.beginPath();
  ctx.moveTo(-2.5, 15);
  ctx.lineTo(-2.8, 2);
  ctx.bezierCurveTo(-3.2, -12, -7.6, -24, -7.6, -40);
  ctx.quadraticCurveTo(-7.6, -52, 0, -52);
  ctx.quadraticCurveTo(7.6, -52, 7.6, -40);
  ctx.bezierCurveTo(7.6, -24, 3.2, -12, 2.8, 2);
  ctx.lineTo(2.5, 15);
  ctx.closePath();
  ctx.fillStyle = WOOD;
  ctx.fill();
  ctx.beginPath();
  C(4.4, -46, 5, -30, 3, -14, 1.4, -2);
  emit(ctx, 5.5, SWELL, 5);
  wash(ctx, WOOD_DK, 0.55);
  if (Q > 0) {
    ctx.beginPath();
    C(-3.4, -42, -3.8, -30, -2.2, -18, -1.2, -8);
    emit(ctx, 2.4, TAIL, 6);
    ctx.fillStyle = '#fbe0b0';
    ctx.fill();
  }
  plate(ctx, false);

  ctx.beginPath();
  // the light side: a thin line that lifts off before the top
  C(-2.8, 10, -3.2, -12, -7.8, -24, -7.8, -40);
  ink(ctx, 2.2, SWELL, 7);
  // the shadow side, heavy, round over the end
  begin();
  pt(-3.5, -49.5);
  quad(0, -52.6, 4.6, -51.2, 3);
  quad(8, -48, 8, -40, 3);
  cub(8, -24, 3.4, -12, 2.9, 6, st(50));
  ink(ctx, 3.6, LATE, 8);
  dot(ctx, 0, 16, 4.8, 2.5);
  // grip tape
  if (Q > 0)
    for (let i = 0; i < 3; i++) {
      begin();
      pt(-2.6, 4 + i * 3.6);
      pt(2.6, 2 + i * 3.6);
      ink(ctx, 1.5, EVEN, i);
    }
  ctx.fillStyle = INK;
  ctx.fill();
}

function spear(ctx: Ctx, icon: boolean) {
  // the shaft: one long stroke of ink
  ctx.beginPath();
  begin();
  pt(0, 52);
  pt(0, 0);
  pt(0, -45);
  emit(ctx, 4.2 * Math.min(G, 1.25), { a: 0.55, h: 0.35, b: 0.85, wob: 0.06, cap: true }, 1);
  ctx.fillStyle = INK;
  ctx.fill();
  // the blade
  plate(ctx, true);
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.quadraticCurveTo(-7.5, -52, 0, -76);
  ctx.quadraticCurveTo(7.5, -52, 0, -44);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.beginPath();
  C(1.8, -48, 4, -53, 3, -60, 0.6, -69);
  emit(ctx, 2.8, EVEN, 2);
  wash(ctx, STEEL, 0.9);
  plate(ctx, false);
  ctx.beginPath();
  begin();
  pt(0.4, -44);
  quad(7.9, -52, 0, -77, st(36));
  ink(ctx, 2.8, LATE, 3);
  begin();
  pt(0, -76);
  quad(-7.6, -53, -1.4, -45.5, st(34));
  ink(ctx, 1.8, BRUSH, 4);
  if (Q > 1) {
    begin();
    pt(0, -50);
    pt(0, -58);
    pt(0, -67);
    ink(ctx, 1.1, BRUSH, 5);
  }
  dot(ctx, 0, -44, 4, 2.4);
  if (!icon) tassel(ctx);
  ctx.fillStyle = INK;
  ctx.fill();
  if (icon) {
    ctx.beginPath();
    tassel(ctx);
    ctx.fillStyle = SEAL;
    ctx.fill();
  }
}

function tassel(ctx: Ctx) {
  C(-0.5, -43, -4, -38, -8, -33, -9, -24);
  ink(ctx, 3.4, PRESS, 6);
  C(-0.5, -43, -2, -37, -3.5, -31, -2.8, -23);
  ink(ctx, 2.8, PRESS, 7);
  C(-0.5, -43, -6, -41, -12, -37, -15, -30);
  ink(ctx, 2.8, PRESS, 8);
}

function shield(ctx: Ctx, team?: string) {
  plate(ctx, true);
  ctx.beginPath();
  dot(ctx, 0, 0, 22, 22);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.beginPath();
  A(0, 0, 17.5, 17.5, 0, -0.3, 2.4);
  emit(ctx, 8, SWELL, 4);
  wash(ctx, PAPER_DK, 0.9);
  plate(ctx, false);
  ctx.beginPath();
  // the rim: heavy round the shadow side, a light stroke over the top, two gaps where the brush lifted
  A(0, 0, 22.3, 22.3, 0, -0.95, 2.75);
  ink(ctx, 4.4, SWELL, 1);
  A(0, 0, 22.3, 22.3, 0, 3.15, 5.0);
  ink(ctx, 2.6, SWELL, 2);
  if (!team) {
    // the ensō, pressed down and dragged round to a dry tail
    A(0, 0, 12.5, 12.5, 0, -1.25, 4.15);
    ink(ctx, Q === 0 ? 7 : 6, PRESS, 3);
  }
  ctx.fillStyle = INK;
  ctx.fill();
  if (team) {
    ctx.beginPath();
    A(0, 0, 12.5, 12.5, 0, -1.25, 4.15);
    ink(ctx, Q === 0 ? 8 : 6.5, PRESS, 3);
    ctx.fillStyle = team;
    ctx.fill();
  }
}

/** A weapon in hand, its grip on the origin, pointing up. team colours the shield's ensō. */
export function weapon(ctx: Ctx, type: string, q: number, team?: string) {
  Q = q;
  if (type === 'knife') knife(ctx);
  else if (type === 'bat') bat(ctx);
  else if (type === 'spear') spear(ctx, false);
  else if (type === 'shield') shield(ctx, team);
}

// ------------------------------------------------------------------ the helmet: a lacquered kabuto with a gold crescent

/**
 * The helmet, the middle of its rim on the origin, facing right. s scales it (1 = an ant's head). small leaves
 * out the lacing.
 */
export function helmet(ctx: Ctx, s: number, q: number, frog: boolean) {
  Q = q;
  ctx.save();
  ctx.scale(s, s);
  // the crest first, behind the dome's front edge
  ctx.beginPath();
  ctx.moveTo(15 + 11 * Math.cos(Math.PI + 0.32), -22 + 11 * Math.sin(Math.PI + 0.32));
  ctx.arc(15, -22, 11, Math.PI + 0.32, -0.32, true);
  ctx.arc(15, -26, 9.2, -0.08, Math.PI + 0.08, false);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.beginPath();
  A(15, -22, 11.2, 11.2, 0, Math.PI + 0.25, Math.PI * 0.5);
  ink(ctx, 1.8, SWELL, 1);
  A(15, -22, 11.2, 11.2, 0, Math.PI * 0.5, -0.25);
  ink(ctx, 1.8, SWELL, 2);
  // the neck guard flaring out behind, the dome, the peak
  ctx.moveTo(-19, -2);
  ctx.quadraticCurveTo(-27, 3, -32, 13);
  ctx.quadraticCurveTo(-18, 9, -6, 8);
  ctx.quadraticCurveTo(8, 7, 16, 4);
  ctx.lineTo(18, -1);
  ctx.closePath();
  ctx.moveTo(-21, 1);
  ctx.ellipse(0, 1, 21, 19, 0, Math.PI, Math.PI * 2, false);
  ctx.lineTo(21, 1);
  ctx.closePath();
  begin();
  pt(14, 0.5);
  quad(22, 0, 30, 4, 4);
  emit(ctx, 5, { a: 1, h: 0.2, b: 0.15, wob: 0, cap: false }, 0);
  ctx.fillStyle = INK;
  ctx.fill();
  // the shine: paper left bare, and the lacing on the neck guard
  ctx.beginPath();
  A(-1, 1, 14.5, 13, 0, -2.75, -1.75);
  emit(ctx, frog ? 3.6 : 3.2, TAIL, 3);
  if (Q > 0) {
    C(-25, 7, -16, 4.5, -4, 4, 12, 2.4);
    emit(ctx, 1.2, SWELL, 4);
  }
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ gear (icons only)

function sneaker(ctx: Ctx) {
  // speed: dry streaks behind
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    begin();
    pt(-52 + i * 4, -6 + i * 9);
    pt(-34 + i * 2, -6 + i * 9);
    emit(ctx, 4 - i * 0.6, { a: 0.1, h: 0.85, b: 0.4, wob: 0.15, cap: false }, i);
  }
  ctx.fillStyle = dryPattern(ctx, INK, 11, 1.1);
  ctx.fill();
  plate(ctx, true);
  ctx.beginPath();
  ctx.moveTo(-30, 12);
  ctx.lineTo(-29, -8);
  ctx.quadraticCurveTo(-22, -12, -13, -9);
  ctx.quadraticCurveTo(-8, -4, -2, -6);
  ctx.lineTo(3, -18);
  ctx.quadraticCurveTo(9, -17, 10, -11);
  ctx.quadraticCurveTo(24, -4, 31, 4);
  ctx.quadraticCurveTo(34, 9, 30, 13);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.beginPath();
  // the side flash, one red flick
  C(-24, 4, -12, 4, 2, -2, 14, -10);
  emit(ctx, 7, PRESS, 2);
  ctx.fillStyle = SEAL;
  ctx.fill();
  ctx.beginPath();
  C(-27, 10, -10, 9, 10, 9, 28, 6);
  emit(ctx, 6, SWELL, 3);
  wash(ctx, PAPER_DK, 0.9);
  plate(ctx, false);
  ctx.beginPath();
  // the upper: heel, collar, tongue, over the laces to the toe
  C(-29.5, 10, -30, 2, -30, -4, -28.5, -9);
  ink(ctx, 3.6, SWELL, 4);
  C(-27, -10.5, -20, -13, -13, -10, -6, -5.5);
  ink(ctx, 2.6, SWELL, 5);
  C(-1.5, -6.5, 1, -13, 3, -19, 10.5, -11.5);
  ink(ctx, 2.6, SWELL, 6);
  C(12, -10, 22, -5, 30, 2, 32.5, 8);
  ink(ctx, 3.4, LATE, 7);
  // laces
  for (let i = 0; i < 3; i++) {
    begin();
    pt(5 + i * 5.5, -11 + i * 3.6);
    pt(9 + i * 5.5, -7 + i * 3.6);
    ink(ctx, 2.2, EVEN, 8 + i);
  }
  // the sole: one heavy stroke, turned up at the toe
  begin();
  pt(-31, 12.5);
  quad(0, 15.5, 25, 14, st(56));
  quad(32, 13, 34, 7, 3);
  ink(ctx, 6, { a: 0.9, h: 0.5, b: 0.4, wob: 0.06, cap: true }, 11);
  ctx.fillStyle = INK;
  ctx.fill();
}

function chili(ctx: Ctx) {
  // ink under, colour over: the outline is the wider stroke showing round the red one
  const body = (w: number, dx: number, dy: number) => {
    begin();
    pt(-10 + dx, -18 + dy);
    cub(12 + dx, -22 + dy, 22 + dx, -4 + dy, 14 + dx, 14 + dy, st(50));
    quad(9 + dx, 24 + dy, -4 + dx, 28 + dy, st(18));
    emit(ctx, w, { a: 0.85, h: 0.22, b: 0, wob: 0.06, cap: true }, 1);
  };
  ctx.beginPath();
  body(23 + 2 * 3.2, 0, 0);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  body(23, -1.4, -1);
  ctx.fillStyle = CHILI;
  ctx.fill();
  ctx.beginPath();
  C(12, -8, 18, 2, 14, 12, 6, 20);
  emit(ctx, 6, SWELL, 2);
  wash(ctx, CHILI_DK, 0.7);
  ctx.beginPath();
  C(-6, -16, 4, -16.5, 10, -13, 13, -7);
  emit(ctx, 3.4, TAIL, 3);
  ctx.fillStyle = '#ffd9c8';
  ctx.fill();
  // the calyx and the stem
  ctx.beginPath();
  ctx.moveTo(-18, -18);
  ctx.quadraticCurveTo(-12, -28, -2, -24);
  ctx.quadraticCurveTo(2, -16, -4, -12);
  ctx.quadraticCurveTo(-10, -16, -18, -18);
  ctx.closePath();
  ctx.fillStyle = LEAF;
  ctx.fill();
  ctx.beginPath();
  C(-18, -18, -12, -28, -2, -25, 1, -21);
  ink(ctx, 2.2, SWELL, 4);
  C(-9, -22, -11, -30, -8, -36, -1, -38);
  ink(ctx, 3.6, PRESS, 5);
  ctx.fillStyle = INK;
  ctx.fill();
  // two hot flicks
  ctx.beginPath();
  C(26, -24, 30, -28, 31, -33, 29, -38);
  ink(ctx, 2.6, BRUSH, 6);
  C(33, -14, 38, -16, 41, -20, 41, -25);
  ink(ctx, 2.2, BRUSH, 7);
  ctx.fillStyle = SEAL;
  ctx.fill();
}

// ------------------------------------------------------------------ the seal and the icons

let sealCanvas: HTMLCanvasElement | null = null;
/** the red seal: a rough square stamp with a white mark, built once */
function seal(): HTMLCanvasElement {
  if (sealCanvas) return sealCanvas;
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const rnd = seeded(4242);
  g.fillStyle = SEAL;
  g.beginPath();
  const m = 8;
  const pts: number[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 6; j++) {
      const s = j / 6;
      const jx = (rnd() - 0.5) * 4;
      const jy = (rnd() - 0.5) * 4;
      const x = i === 0 ? m + s * (S - 2 * m) : i === 1 ? S - m : i === 2 ? S - m - s * (S - 2 * m) : m;
      const y = i === 0 ? m : i === 1 ? m + s * (S - 2 * m) : i === 2 ? S - m : S - m - s * (S - 2 * m);
      pts.push(x + jx, y + jy);
    }
  }
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
  // the mark: a frame and a stylised Z for the zoo, cut out of the red
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeRect(19, 19, S - 38, S - 38);
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(32, 34);
  g.lineTo(64, 33);
  g.lineTo(33, 63);
  g.lineTo(65, 62);
  g.stroke();
  // worn specks where the stamp did not take
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, 0.8 + rnd() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  sealCanvas = c;
  return c;
}

/** The red seal centred at (x, y), s across. */
export function sealStamp(ctx: Ctx, x: number, y: number, s: number) {
  ctx.globalAlpha = 0.92;
  ctx.drawImage(seal(), x - s / 2, y - s / 2, s, s);
  ctx.globalAlpha = 1;
}

/** A perk icon in a 100 x 100 box centred on the origin. */
export function itemIcon(ctx: Ctx, type: ItemType) {
  const k0 = K;
  // a pale dry swash behind, like the brush was cleaned on the paper first
  ctx.beginPath();
  begin();
  pt(-40, 18);
  quad(0, 4, 42, -14, st(90));
  emit(ctx, 26, { a: 0.4, h: 0.3, b: 0.2, wob: 0.18, cap: true }, 9);
  ctx.fillStyle = dryPattern(ctx, PAPER_DK, 3, 1);
  ctx.fill();

  ctx.save();
  let s = 1;
  if (type === 'knife') {
    s = 1.42;
    ctx.translate(-4, 8);
    ctx.rotate(Math.PI / 4);
    ctx.scale(s, s);
    ctx.translate(0, 13);
  } else if (type === 'bat') {
    s = 1.12;
    ctx.translate(-2, 4);
    ctx.rotate(Math.PI / 4);
    ctx.scale(s, s);
    ctx.translate(0, 18);
  } else if (type === 'spear') {
    s = 0.86;
    ctx.translate(-2, 2);
    ctx.rotate(Math.PI / 4);
    ctx.scale(s, s);
    ctx.translate(0, 12);
  } else if (type === 'shield') {
    s = 1.62;
    ctx.translate(-2, -2);
    ctx.scale(s, s);
  } else if (type === 'helmet') {
    s = 1.42;
    ctx.translate(2, 14);
    ctx.scale(s, s);
  } else if (type === 'sneakers') {
    s = 1.05;
    ctx.translate(4, 0);
    ctx.scale(s, s);
  } else {
    s = 1.3;
    ctx.translate(-2, 0);
    ctx.scale(s, s);
  }
  K = k0 * s;
  if (type === 'knife') knife(ctx);
  else if (type === 'bat') bat(ctx);
  else if (type === 'spear') spear(ctx, true);
  else if (type === 'shield') shield(ctx);
  else if (type === 'helmet') helmet(ctx, 1, 2, false);
  else if (type === 'sneakers') sneaker(ctx);
  else chili(ctx);
  K = k0;
  ctx.restore();
}
