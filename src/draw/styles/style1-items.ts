import type { ItemType } from './api';
import { clamp, seeded } from '../../util';
import { BRUSH, EVEN, PRESS, SWELL, arc, begin, cub, dot, dryPattern, emit, inkGrain, plateGrain, pt, quad, type Prof } from './style1-brush';

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
/** fills the current path with ink, and with the paper showing through it when big */
function inkFill(ctx: Ctx) {
  ctx.fillStyle = INK;
  ctx.fill();
  if (Q === 2) inkGrain(ctx);
}
/** fills the current path with a flat colour plate, grained when big */
function plateFill(ctx: Ctx, color: string) {
  ctx.fillStyle = color;
  ctx.fill();
  if (Q === 2) plateGrain(ctx);
}
/** a wash: the dry-brush texture when big, a flat tone when small */
function wash(ctx: Ctx, color: string, alpha = 0.6) {
  if (Q < 2) {
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
  plateFill(ctx, PAPER);
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
  inkFill(ctx);
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
  plateFill(ctx, WOOD);
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
  inkFill(ctx);
}

function spear(ctx: Ctx, icon: boolean) {
  // the shaft: one long stroke of ink
  ctx.beginPath();
  begin();
  pt(0, 36);
  pt(0, 0);
  pt(0, -38);
  emit(ctx, (icon ? 5.4 : 4.2) * Math.min(G, 1.25), { a: 0.55, h: 0.35, b: 0.85, wob: 0.06, cap: true }, 1);
  inkFill(ctx);
  // the blade
  plate(ctx, true);
  ctx.beginPath();
  ctx.moveTo(0, -37);
  ctx.quadraticCurveTo(-7.5, -44, 0, -64);
  ctx.quadraticCurveTo(7.5, -44, 0, -37);
  ctx.closePath();
  plateFill(ctx, PAPER);
  ctx.beginPath();
  C(1.8, -41, 4, -45, 3, -51, 0.6, -58);
  emit(ctx, 2.8, EVEN, 2);
  wash(ctx, STEEL, 0.9);
  plate(ctx, false);
  ctx.beginPath();
  begin();
  pt(0.4, -37);
  quad(7.9, -44, 0, -65, st(32));
  ink(ctx, 2.8, LATE, 3);
  begin();
  pt(0, -64);
  quad(-7.6, -45, -1.4, -38.5, st(30));
  ink(ctx, 1.8, BRUSH, 4);
  if (Q > 1) {
    begin();
    pt(0, -42);
    pt(0, -49);
    pt(0, -56);
    ink(ctx, 1.1, BRUSH, 5);
  }
  dot(ctx, 0, -37, 4, 2.4);
  if (!icon) tassel(ctx);
  inkFill(ctx);
  if (icon) {
    ctx.beginPath();
    tassel(ctx);
    ctx.fillStyle = SEAL;
    ctx.fill();
  }
}

function tassel(ctx: Ctx) {
  C(-0.5, -36, -4, -31, -8, -26, -9, -17);
  ink(ctx, 3.4, PRESS, 6);
  C(-0.5, -36, -2, -30, -3.5, -24, -2.8, -16);
  ink(ctx, 2.8, PRESS, 7);
  C(-0.5, -36, -6, -34, -12, -30, -15, -23);
  ink(ctx, 2.8, PRESS, 8);
}

function shield(ctx: Ctx, team?: string) {
  plate(ctx, true);
  ctx.beginPath();
  dot(ctx, 0, 0, 22, 22);
  plateFill(ctx, PAPER);
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
  inkFill(ctx);
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

/** the gold crescent crest's outline, its lowest point on the origin (d shifts it, for the ink under it) */
function crescent(ctx: Ctx, d: number) {
  ctx.moveTo(d + 11 * Math.cos(Math.PI + 0.3), d - 11 + 11 * Math.sin(Math.PI + 0.3));
  ctx.arc(d, d - 11, 11, Math.PI + 0.3, -0.3, true);
  ctx.arc(d, d - 15, 9, -0.1, Math.PI + 0.1, false);
  ctx.closePath();
}

/**
 * The helmet, the middle of its rim on the origin, facing right: a bowl of black lacquer (the ink itself) with a
 * shine left bare, a gold rim, the neck guard flaring out behind, a peak in front and a gold crescent (crest
 * scales it, 0 leaves it off). s scales the whole helmet (1 = an ant's head). Three fills: ink, gold, shine.
 */
export function helmet(ctx: Ctx, s: number, q: number, crest: number) {
  Q = q;
  ctx.save();
  ctx.scale(s, s);
  const crestAt = (d: number) => {
    if (crest <= 0) return;
    ctx.save();
    ctx.translate(11, -13);
    ctx.rotate(0.12);
    ctx.scale(crest, crest);
    crescent(ctx, d);
    ctx.restore();
  };
  ctx.beginPath();
  // the crest's ink: the same crescent a little down and back, like a print's key plate
  crestAt(1.6 / crest);
  // the neck guard
  ctx.moveTo(-17, -2);
  ctx.quadraticCurveTo(-27, 3, -31, 13);
  ctx.quadraticCurveTo(-20, 11, -10, 8);
  ctx.quadraticCurveTo(-2, 5, 4, 1);
  ctx.closePath();
  // the bowl
  ctx.moveTo(-21, 1);
  ctx.ellipse(0, 1, 21, 20, 0, Math.PI, Math.PI * 2, false);
  ctx.closePath();
  // the peak
  begin();
  pt(12, 0.5);
  quad(21, 0.5, 29, 4.5, 4);
  emit(ctx, 5.4, { a: 1, h: 0.2, b: 0.2, wob: 0, cap: false }, 0);
  inkFill(ctx);
  // gold: the crest and the rim
  ctx.beginPath();
  crestAt(0);
  begin();
  pt(-20.5, 0.4);
  quad(0, 2.6, 20.5, 0.4, st(42));
  emit(ctx, 2.6, { a: 0.4, h: 0.5, b: 0.6, wob: 0.05, cap: false }, 3);
  ctx.fillStyle = GOLD;
  ctx.fill();
  // the shine: paper left bare, and the lacing of the neck guard
  ctx.beginPath();
  A(-1, 1, 14.5, 13.5, 0, -2.75, -1.7);
  emit(ctx, 3.6, TAIL, 3);
  if (Q > 0) {
    C(-26, 8.5, -18, 6, -8, 5, 1, 2.6);
    emit(ctx, 1.3, SWELL, 4);
  }
  plateFill(ctx, PAPER);
  ctx.restore();
}

// ------------------------------------------------------------------ gear (icons only)

function sneaker(ctx: Ctx) {
  // speed: three quick strokes behind the heel
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    begin();
    pt(-38 - i * 2, -8 + i * 8);
    pt(-46 - i * 2, -8 + i * 8);
    pt(-54 + i * 2, -8 + i * 8);
    emit(ctx, 3.4 - i * 0.4, { a: 0.9, h: 0.15, b: 0, wob: 0.1, cap: true }, i);
  }
  inkFill(ctx);
  plate(ctx, true);
  // the shoe: upper and sole in one piece of paper
  ctx.beginPath();
  ctx.moveTo(-32, 14);
  ctx.lineTo(-33, -4);
  ctx.quadraticCurveTo(-33, -16, -26, -17);
  ctx.quadraticCurveTo(-18, -16, -14, -12);
  ctx.lineTo(-9, -22);
  ctx.quadraticCurveTo(-3, -26, 1, -22);
  ctx.quadraticCurveTo(10, -10, 24, -6);
  ctx.quadraticCurveTo(37, -2, 37, 8);
  ctx.lineTo(36, 14);
  ctx.closePath();
  plateFill(ctx, PAPER);
  ctx.beginPath();
  C(-28, 3, -10, 4, 14, 3, 33, 2);
  emit(ctx, 5, SWELL, 3);
  wash(ctx, PAPER_DK, 0.9);
  // the side flash: one red stroke swept forward like a wing
  ctx.beginPath();
  C(-28, -2, -16, -1, -4, -6, 10, -14);
  emit(ctx, 8.5, PRESS, 2);
  ctx.fillStyle = SEAL;
  ctx.fill();
  plate(ctx, false);
  ctx.beginPath();
  // the opening of the shoe, dark inside
  dot(ctx, -21, -15.5, 7.5, 2.8, 0.12);
  // heel: down the back, heavy
  C(-26.5, -18, -33, -16, -34, -4, -33, 13);
  ink(ctx, 4.4, SWELL, 4);
  // the tongue and over the laces to the toe, heavy round the toe
  C(-10, -21, -6, -27, 0, -26, 3, -21);
  ink(ctx, 2.6, SWELL, 5);
  C(3, -21, 10, -10, 22, -7.5, 31, -3);
  quad(38.5, 1, 37.5, 9, 4);
  ink(ctx, 4, LATE, 7);
  // the line of the sole
  C(-31, 6.5, -10, 7.5, 14, 7.5, 36, 6);
  ink(ctx, 1.8, SWELL, 6);
  // laces
  for (let i = 0; i < 3; i++) {
    begin();
    pt(-2 + i * 6, -17 + i * 3.6);
    pt(3 + i * 6, -13 + i * 3.6);
    ink(ctx, 2.6, EVEN, 8 + i);
  }
  // the tread: one heavy stroke along the ground, turned up at the toe
  begin();
  pt(-34, 14);
  quad(0, 17, 28, 15.5, st(64));
  quad(35, 15, 37.5, 10, 3);
  ink(ctx, 5.6, { a: 0.95, h: 0.45, b: 0.5, wob: 0.06, cap: true }, 11);
  inkFill(ctx);
}

function chili(ctx: Ctx) {
  // ink under, colour over: the outline is the wider stroke showing round the red one
  const body = (w: number, dx: number, dy: number) => {
    begin();
    pt(-14 + dx, -16 + dy);
    cub(6 + dx, -22 + dy, 24 + dx, -10 + dy, 20 + dx, 10 + dy, st(50));
    quad(16 + dx, 26 + dy, -2 + dx, 34 + dy, st(26));
    emit(ctx, w, { a: 0.9, h: 0.2, b: 0, wob: 0.05, cap: true }, 1);
  };
  ctx.beginPath();
  body(20 + 2 * 3.4, 0, 0);
  inkFill(ctx);
  ctx.beginPath();
  body(20, -1.5, -1);
  plateFill(ctx, CHILI);
  ctx.beginPath();
  C(16, -8, 22, 2, 18, 14, 8, 24);
  emit(ctx, 6, SWELL, 2);
  wash(ctx, CHILI_DK, 0.7);
  ctx.beginPath();
  C(-8, -17, 2, -19, 10, -16, 14, -10);
  emit(ctx, 3.6, TAIL, 3);
  ctx.fillStyle = '#ffd9c8';
  ctx.fill();
  // the calyx and the stem
  ctx.beginPath();
  ctx.moveTo(-22, -14);
  ctx.quadraticCurveTo(-18, -26, -6, -24);
  ctx.quadraticCurveTo(-1, -16, -6, -9);
  ctx.quadraticCurveTo(-14, -13, -22, -14);
  ctx.closePath();
  ctx.fillStyle = LEAF;
  ctx.fill();
  ctx.beginPath();
  C(-22, -14, -18, -26, -6, -25, -2, -19);
  ink(ctx, 2.4, SWELL, 4);
  C(-13, -21, -15, -30, -12, -37, -4, -40);
  ink(ctx, 3.8, PRESS, 5);
  inkFill(ctx);
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
  ctx.save();
  let s = 1;
  if (type === 'knife') {
    s = 1.66;
    ctx.translate(-3, 3);
    ctx.rotate(Math.PI / 4);
    ctx.scale(s, s);
    ctx.translate(0, 12);
  } else if (type === 'bat') {
    s = 1.38;
    ctx.translate(-3, 2);
    ctx.rotate(Math.PI / 4);
    ctx.scale(s, s);
    ctx.translate(0, 17);
  } else if (type === 'spear') {
    s = 1.04;
    ctx.translate(-3, 2);
    ctx.rotate(Math.PI / 4);
    ctx.scale(s, s);
    ctx.translate(0, 14);
  } else if (type === 'shield') {
    s = 1.9;
    ctx.translate(-3, -3);
    ctx.scale(s, s);
  } else if (type === 'helmet') {
    s = 1.55;
    ctx.translate(-1, 16);
    ctx.scale(s, s);
  } else if (type === 'sneakers') {
    s = 1.15;
    ctx.translate(3, 0);
    ctx.scale(s, s);
  } else {
    s = 1.42;
    ctx.translate(0, -3);
    ctx.scale(s, s);
  }
  K = k0 * s;
  if (type === 'knife') knife(ctx);
  else if (type === 'bat') bat(ctx);
  else if (type === 'spear') spear(ctx, true);
  else if (type === 'shield') shield(ctx);
  else if (type === 'helmet') helmet(ctx, 1, 2, 1);
  else if (type === 'sneakers') sneaker(ctx);
  else chili(ctx);
  K = k0;
  ctx.restore();
}
