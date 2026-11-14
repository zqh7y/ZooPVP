import type { GearType } from '../types';
import { CLASS_FX, COLOR, TIER } from '../theme';
import { circle, ellipse, fillStroke, poly, rr } from '../util';
import { STEEL, STEEL_HI, STEEL_LO, band, cls, glow, heat, sparkle, stud, trimOf } from './weapons';

/*
 * The three pieces of gear, each in seven classes, drawn in a unit box (1 = size) centred on the origin, under
 * the same key light as the weapons (upper left) and in the same class metals: greys, silver, gold, white-gold.
 */
type Ctx = CanvasRenderingContext2D;

/** Clips to the current path and runs draw. */
function inside(ctx: Ctx, draw: () => void) {
  ctx.save();
  ctx.clip();
  draw();
  ctx.restore();
}

// ------------------------------------------------------------------ helmet: acorn cap, pot -> kabuto

/** The bowl of a helmet: flat and open at y0, rounded above. */
function dome(ctx: Ctx, rx: number, ry: number, y0: number) {
  ctx.beginPath();
  ctx.moveTo(-rx, y0);
  ctx.bezierCurveTo(-rx, y0 - ry * 1.32, rx, y0 - ry * 1.32, rx, y0);
  ctx.closePath();
}

/** A dome with volume: its shade to the lower right, a crisp gloss on the upper left. */
function shadedDome(ctx: Ctx, rx: number, ry: number, y0: number, base: string, lo: string, hi: string, lw: number) {
  dome(ctx, rx, ry, y0);
  ctx.fillStyle = lo;
  ctx.fill();
  inside(ctx, () => {
    ellipse(ctx, -rx * 0.2, y0 - ry * 0.55, rx * 1.02, ry * 0.98);
    ctx.fillStyle = base;
    ctx.fill();
    ellipse(ctx, -rx * 0.42, y0 - ry * 0.66, rx * 0.2, ry * 0.08, -0.85);
    ctx.fillStyle = hi;
    ctx.fill();
  });
  dome(ctx, rx, ry, y0);
  ctx.lineWidth = lw;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
}

function helmet(ctx: Ctx, k: number, t: number, lw: number) {
  if (k === 0) {
    // an acorn cap with its stalk
    ctx.beginPath();
    ctx.moveTo(0, -0.26);
    ctx.quadraticCurveTo(0, -0.42, -0.12, -0.44);
    ctx.lineWidth = lw * 2.6;
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
    ctx.lineWidth = lw * 1.1;
    ctx.strokeStyle = '#6f4a2a';
    ctx.stroke();
    shadedDome(ctx, 0.42, 0.36, 0.16, '#9a6b3f', '#6f4a2a', '#d0a273', lw);
    ctx.lineWidth = lw * 0.55;
    ctx.strokeStyle = '#5e3d22';
    ctx.beginPath();
    for (const x of [-0.18, 0.04, 0.25]) {
      ctx.moveTo(x - 0.09, -0.01);
      ctx.arc(x, 0.04, 0.1, Math.PI * 1.2, Math.PI * 1.8);
    }
    ctx.stroke();
    rr(ctx, -0.45, 0.1, 0.9, 0.1, 0.05);
    fillStroke(ctx, '#7d5636', lw);
    ctx.fillStyle = '#a97c52';
    ctx.fillRect(-0.4, 0.11, 0.42, 0.03);
    return;
  }
  if (k === 1) {
    // a cooking pot worn upside down: its handle sticks out behind
    rr(ctx, -0.53, -0.02, 0.22, 0.075, 0.03);
    fillStroke(ctx, '#3f3630', lw);
    rr(ctx, -0.36, -0.28, 0.72, 0.44, 0.1);
    ctx.fillStyle = STEEL;
    ctx.fill();
    inside(ctx, () => {
      ctx.fillStyle = STEEL_LO;
      ctx.fillRect(0.14, -0.3, 0.3, 0.5);
      ctx.fillStyle = STEEL_HI;
      ctx.fillRect(-0.27, -0.3, 0.08, 0.5);
    });
    rr(ctx, -0.36, -0.28, 0.72, 0.44, 0.1);
    ctx.lineWidth = lw;
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
    band(ctx, -0.42, 0.09, 0.84, 0.085, 1, t, lw);
    return;
  }
  // from C: one helmet growing into a kabuto
  const gold = k >= 5;
  const base = gold ? TIER.tile[k] : k === 4 ? '#5a636e' : k === 3 ? TIER.metal[3] : STEEL;
  const lo = gold ? TIER.tileDark[k] : k === 4 ? '#363c45' : k === 3 ? TIER.tile[3] : STEEL_LO;
  const hi = gold ? TIER.metalLight[k] : STEEL_HI;
  if (k >= 5) glow(ctx, 0, -0.06, 0.6, 0.54, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // horns rise from the brow (S and SSS)
  if (k >= 5) {
    const s = k === 6 ? 1 : 0.85;
    for (let i = 0; i < 2; i++) {
      const x = i ? 0.3 : 0.12;
      ctx.beginPath();
      ctx.moveTo(x - 0.06, -0.08);
      ctx.quadraticCurveTo(x - 0.1 + i * 0.14, -0.22 * s, x - 0.04 + i * 0.16, -0.5 * s);
      ctx.quadraticCurveTo(x + 0.04 + i * 0.06, -0.24 * s, x + 0.08, -0.06);
      ctx.closePath();
      fillStroke(ctx, i ? trimOf(k, t) : TIER.metalLight[k], lw);
    }
  }
  // neck guard: plates flaring out behind, edged in the class metal
  const lames = Math.min(3, k - 1);
  for (let i = lames - 1; i >= 0; i--) {
    const y = 0.13 + i * 0.09;
    poly(ctx, [-0.34, y - 0.04, 0.0, y - 0.04, 0.0, y + 0.08, -0.43 - i * 0.03, y + 0.1]);
    fillStroke(ctx, lo, lw);
    ctx.fillStyle = trimOf(k, t, i);
    ctx.fillRect(-0.4 - i * 0.025, y + 0.05, 0.38 + i * 0.025, 0.03);
  }
  // the peak in front
  poly(ctx, [0.26, 0.06, 0.52, 0.15, 0.26, 0.19]);
  fillStroke(ctx, k >= 4 ? trimOf(k, t) : lo, lw);
  shadedDome(ctx, 0.4, 0.37, 0.14, base, lo, hi, lw);
  if (k === 3) {
    // a raised comb from the nape over the crown
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.18);
    ctx.quadraticCurveTo(-0.12, -0.44, 0.1, -0.4);
    ctx.quadraticCurveTo(0.2, -0.36, 0.24, -0.26);
    ctx.quadraticCurveTo(0.0, -0.32, -0.3, -0.18);
    ctx.closePath();
    fillStroke(ctx, trimOf(k, t), lw * 0.8);
  }
  // the brow band in the class metal, its rivets
  band(ctx, -0.43, 0.06, 0.86, 0.1, k, t, lw);
  if (k < 4) {
    ctx.fillStyle = TIER.tileDark[k];
    for (const x of [-0.26, 0.0, 0.26]) {
      circle(ctx, x, 0.11, 0.018);
      ctx.fill();
    }
  }
  if (k === 4) {
    // a gold crescent on the brow
    ctx.beginPath();
    ctx.arc(0.27, -0.12, 0.16, Math.PI * 0.05, Math.PI * 0.95, true);
    ctx.quadraticCurveTo(0.27, -0.05, 0.43, -0.1);
    ctx.closePath();
    fillStroke(ctx, trimOf(k, t), lw);
  }
  if (k >= 4) stud(ctx, 0.27, 0.0, 0.07, k, t, lw);
  if (k === 6) sparkle(ctx, -0.16, -0.22, 0.2, t, 5);
}

// ------------------------------------------------------------------ sneakers: canvas shoe -> gold-striped high-top

function sneaker(ctx: Ctx, k: number, t: number, lw: number) {
  const top = k >= 3 ? -0.36 : -0.22; // high-tops from B
  const upper = k === 0 ? '#e2ddd2' : '#f3f4f6';
  const upperLo = k === 0 ? '#b9b2a4' : '#c6ccd4';
  if (k >= 5) glow(ctx, 0, 0.05, 0.62, 0.5, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // sole: light on top, grey where it meets the ground
  rr(ctx, -0.48, 0.3, 0.98, 0.2, 0.1);
  fillStroke(ctx, k === 0 ? '#cfc9bc' : '#e7eaee', lw);
  ctx.fillStyle = k === 0 ? '#a49d8f' : '#aab2bc';
  ctx.fillRect(-0.44, 0.42, 0.9, 0.05);
  // upper
  ctx.beginPath();
  ctx.moveTo(-0.45, 0.33);
  ctx.lineTo(-0.47, top + 0.06);
  ctx.quadraticCurveTo(-0.46, top, -0.38, top);
  ctx.lineTo(-0.12, top + 0.04);
  ctx.quadraticCurveTo(-0.02, top + 0.2, 0.14, 0.02);
  ctx.quadraticCurveTo(0.5, 0.06, 0.49, 0.33);
  ctx.closePath();
  ctx.fillStyle = upper;
  ctx.fill();
  inside(ctx, () => {
    // the shade low on the toe and down the heel
    ellipse(ctx, 0.3, 0.36, 0.34, 0.14);
    ctx.fillStyle = upperLo;
    ctx.fill();
    ctx.fillRect(-0.5, 0.24, 0.98, 0.1);
    // a crisp gloss at the top of the toe
    ellipse(ctx, 0.25, 0.08, 0.08, 0.025, 0.25);
    ctx.fillStyle = COLOR.white;
    ctx.fill();
    // the stripe in the class metal from D
    if (k >= 1) {
      poly(ctx, [-0.27, 0.32, -0.12, top + 0.13, 0.01, top + 0.2, -0.12, 0.32]);
      ctx.fillStyle = trimOf(k, t);
      ctx.fill();
      ctx.lineWidth = lw * 0.6;
      ctx.strokeStyle = COLOR.ink;
      ctx.stroke();
      poly(ctx, [-0.25, 0.3, -0.12, top + 0.15, -0.08, top + 0.17, -0.21, 0.3]);
      ctx.fillStyle = TIER.metalLight[k];
      ctx.fill();
    }
  });
  ctx.beginPath();
  ctx.moveTo(-0.45, 0.33);
  ctx.lineTo(-0.47, top + 0.06);
  ctx.quadraticCurveTo(-0.46, top, -0.38, top);
  ctx.lineTo(-0.12, top + 0.04);
  ctx.quadraticCurveTo(-0.02, top + 0.2, 0.14, 0.02);
  ctx.quadraticCurveTo(0.5, 0.06, 0.49, 0.33);
  ctx.closePath();
  ctx.lineWidth = lw;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  // heel tab and laces
  rr(ctx, -0.48, top + 0.07, 0.1, 0.13, 0.03);
  fillStroke(ctx, k >= 4 ? trimOf(k, t) : k === 0 ? '#a49d8f' : '#d4d9df', lw * 0.7);
  ctx.lineWidth = lw * 0.9;
  ctx.strokeStyle = '#3a4350';
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const y = top + 0.24 + (k >= 3 ? 0.14 : 0) + i * 0.05;
    ctx.moveTo(0.03 + i * 0.1, y);
    ctx.lineTo(0.12 + i * 0.1, y - 0.08);
  }
  ctx.stroke();
  if (k === 6) sparkle(ctx, 0.3, -0.06, 0.2, t, 6);
}

// ------------------------------------------------------------------ chili: one glossy red pepper

function chili(ctx: Ctx, k: number, t: number, lw: number) {
  const s = 0.76 + k * 0.035;
  if (k >= 5) glow(ctx, 0, 0.04, 0.58, 0.58, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // it gets hotter as it rises: a faint shimmer of heat above it from A
  if (k >= 4) heat(ctx, 0.0, -0.3 * s, 0.62, t, Math.max(lw * 1.2, 0.035), k >= 5 ? 3 : 2);
  ctx.save();
  ctx.scale(s, s);
  // the curled stalk
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.3);
  ctx.quadraticCurveTo(-0.26, -0.48, -0.1, -0.5);
  ctx.lineWidth = lw * 2.6;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  ctx.lineWidth = lw * 1.1;
  ctx.strokeStyle = '#5b8f3e';
  ctx.stroke();
  // the pepper: deep red, its shade low on the curve, a crisp wet gloss on top
  ctx.beginPath();
  ctx.moveTo(-0.36, -0.2);
  ctx.bezierCurveTo(-0.46, 0.24, 0.02, 0.56, 0.42, 0.42);
  ctx.bezierCurveTo(0.14, 0.3, 0.12, -0.02, 0.02, -0.28);
  ctx.closePath();
  ctx.fillStyle = '#c9352a';
  ctx.fill();
  inside(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.05);
    ctx.bezierCurveTo(-0.2, 0.36, 0.1, 0.4, 0.5, 0.36);
    ctx.lineTo(0.5, 0.6);
    ctx.lineTo(-0.5, 0.6);
    ctx.closePath();
    ctx.fillStyle = '#8f1d18';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.26, -0.1);
    ctx.quadraticCurveTo(-0.27, 0.14, -0.1, 0.27);
    ctx.lineWidth = 0.065;
    ctx.strokeStyle = '#f2b2a6';
    ctx.stroke();
    circle(ctx, -0.13, -0.17, 0.035);
    ctx.fillStyle = COLOR.white;
    ctx.fill();
  });
  ctx.beginPath();
  ctx.moveTo(-0.36, -0.2);
  ctx.bezierCurveTo(-0.46, 0.24, 0.02, 0.56, 0.42, 0.42);
  ctx.bezierCurveTo(0.14, 0.3, 0.12, -0.02, 0.02, -0.28);
  ctx.closePath();
  ctx.lineWidth = lw;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  // the green cap
  ctx.beginPath();
  ctx.moveTo(-0.4, -0.16);
  ctx.quadraticCurveTo(-0.28, -0.4, -0.02, -0.36);
  ctx.quadraticCurveTo(0.1, -0.3, 0.06, -0.2);
  ctx.quadraticCurveTo(-0.04, -0.26, -0.12, -0.16);
  ctx.quadraticCurveTo(-0.22, -0.24, -0.4, -0.16);
  ctx.closePath();
  fillStroke(ctx, '#4d8238', lw);
  ellipse(ctx, -0.2, -0.3, 0.1, 0.03, -0.3);
  ctx.fillStyle = '#7fb062';
  ctx.fill();
  // a ring of the class metal around the stalk from D
  if (k >= 1) {
    ellipse(ctx, -0.2, -0.37, 0.085, 0.04, -0.2);
    fillStroke(ctx, trimOf(k, t), lw * 0.8);
  }
  ctx.restore();
  if (k === 6) sparkle(ctx, 0.2, -0.05, 0.2, t, 7);
}

/**
 * Gear drawn centred on the origin, fitting a box size px across. helmet: from the side, facing right, open
 * below. sneakers: one shoe, toe to the right, sole on y = +size / 2. chili: one pepper.
 */
export function drawGear(ctx: Ctx, type: GearType, level: number, size: number, t = 0): void {
  const k = cls(level);
  ctx.save();
  ctx.scale(size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const lw = Math.max(0.8 / size, 0.035);
  if (type === 'helmet') helmet(ctx, k, t, lw);
  else if (type === 'sneakers') sneaker(ctx, k, t, lw);
  else chili(ctx, k, t, lw);
  ctx.restore();
}
