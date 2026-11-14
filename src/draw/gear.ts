import type { GearType } from '../types';
import { COLOR, RAINBOW, TIER } from '../theme';
import { circle, ellipse, fillStroke, poly, rr } from '../util';
import { cls, flame, glow, rainbowStroke, sparkle, trimOf } from './weapons';

/*
 * The three pieces of gear, each in seven classes, drawn in a unit box (1 = size) centred on the origin.
 */
type Ctx = CanvasRenderingContext2D;

// ------------------------------------------------------------------ helmet: acorn cap, pot -> horned kabuto

/** The bowl of a helmet: flat and open at y0, rounded above. */
function dome(ctx: Ctx, rx: number, ry: number, y0: number) {
  ctx.beginPath();
  ctx.moveTo(-rx, y0);
  ctx.bezierCurveTo(-rx, y0 - ry * 1.32, rx, y0 - ry * 1.32, rx, y0);
  ctx.closePath();
}

function helmet(ctx: Ctx, k: number, t: number, lw: number) {
  const tr = trimOf(k, t);
  if (k === 0) {
    // an acorn cap with its stalk
    ctx.lineWidth = lw * 2.4;
    ctx.strokeStyle = COLOR.ink;
    ctx.beginPath();
    ctx.moveTo(0, -0.26);
    ctx.quadraticCurveTo(0, -0.42, -0.12, -0.44);
    ctx.stroke();
    ctx.lineWidth = lw * 0.9;
    ctx.strokeStyle = COLOR.woodDark;
    ctx.stroke();
    dome(ctx, 0.42, 0.36, 0.16);
    fillStroke(ctx, '#b98548', lw);
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = COLOR.woodDark;
    for (const x of [-0.2, 0.02, 0.24]) {
      ctx.beginPath();
      ctx.arc(x, 0.02, 0.1, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - 0.11, -0.12, 0.09, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    rr(ctx, -0.45, 0.1, 0.9, 0.1, 0.05);
    fillStroke(ctx, COLOR.woodDark, lw);
    return;
  }
  if (k === 1) {
    // a cooking pot worn upside down: its handle sticks out behind
    rr(ctx, -0.52, -0.02, 0.2, 0.08, 0.03);
    fillStroke(ctx, COLOR.woodDark, lw);
    rr(ctx, -0.36, -0.28, 0.72, 0.44, 0.1);
    fillStroke(ctx, '#aeb7c4', lw);
    ctx.fillStyle = '#e4e9f0';
    rr(ctx, -0.27, -0.21, 0.09, 0.24, 0.03);
    ctx.fill();
    ctx.fillStyle = tr;
    ctx.fillRect(-0.36 + lw / 2, -0.04, 0.72 - lw, 0.07);
    rr(ctx, -0.42, 0.09, 0.84, 0.09, 0.04);
    fillStroke(ctx, '#8f99a8', lw);
    circle(ctx, 0, -0.31, 0.06);
    fillStroke(ctx, COLOR.woodDark, lw);
    return;
  }
  // from C: one helmet growing into a kabuto
  const bowl = ['', '', '#a3acbb', '#7a7391', '#3d3550', '#c2203d', '#f6f0ff'][k];
  const dark = ['', '', '#7d8696', '#58516e', '#2a2438', '#8a1228', '#d9cdf0'][k];
  const gold = k >= 4;
  if (k >= 5) glow(ctx, 0, -0.05, 0.56, 0.5, TIER.metalLight[k], t);
  // horns rise from the brow (S and SSS)
  if (k >= 5) {
    const s = k === 6 ? 1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(0.14, -0.1);
    ctx.quadraticCurveTo(-0.06, -0.2 * s - 0.05, -0.04, -0.5 * s);
    ctx.quadraticCurveTo(0.12, -0.34 * s, 0.28, -0.14);
    ctx.closePath();
    fillStroke(ctx, COLOR.gold, lw);
    ctx.beginPath();
    ctx.moveTo(0.26, -0.12);
    ctx.quadraticCurveTo(0.44, -0.22 * s - 0.04, 0.48, -0.5 * s);
    ctx.quadraticCurveTo(0.54, -0.22 * s, 0.4, -0.04);
    ctx.closePath();
    fillStroke(ctx, COLOR.gold, lw);
  }
  // neck guard: plates flaring out behind
  const lames = k - 2 > 3 ? 3 : k - 2;
  for (let i = lames - 1; i >= 0; i--) {
    const y = 0.13 + i * 0.1;
    poly(ctx, [-0.34, y - 0.04, 0.0, y - 0.04, 0.0, y + 0.09, -0.44 - i * 0.03, y + 0.11]);
    fillStroke(ctx, dark, lw);
    ctx.fillStyle = trimOf(k, t, i);
    ctx.fillRect(-0.4 - i * 0.02, y + 0.045, 0.38 + i * 0.02, 0.035);
  }
  // the peak in front
  poly(ctx, [0.26, 0.06, 0.53, 0.15, 0.26, 0.19]);
  fillStroke(ctx, gold ? COLOR.gold : dark, lw);
  dome(ctx, 0.4, 0.37, 0.14);
  fillStroke(ctx, bowl, lw);
  // one shade behind, one gloss in front, two ribs
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-0.4 + lw / 2, 0.13);
  ctx.bezierCurveTo(-0.4, -0.3, -0.15, -0.33, -0.1, -0.33);
  ctx.bezierCurveTo(-0.26, -0.2, -0.26, 0, -0.24, 0.13);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ellipse(ctx, 0.17, -0.2, 0.1, 0.045, -0.5);
  ctx.fill();
  if (k >= 3) {
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = gold ? COLOR.goldDark : dark;
    ctx.beginPath();
    ctx.moveTo(0, -0.33);
    ctx.lineTo(0, 0.08);
    ctx.stroke();
  }
  // the brow band in the class colour
  rr(ctx, -0.43, 0.06, 0.86, 0.1, 0.04);
  fillStroke(ctx, tr, lw);
  if (k === 6) {
    rr(ctx, -0.43, 0.06, 0.86, 0.1, 0.04);
    rainbowStroke(ctx, 0.05, t, 0.14);
    rr(ctx, -0.43, 0.06, 0.86, 0.1, 0.04);
    ctx.lineWidth = lw * 0.5;
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
  }
  // top knob, then the gold crest on the brow (A and up)
  circle(ctx, 0, -0.34, 0.055);
  fillStroke(ctx, gold ? COLOR.gold : tr, lw);
  if (gold) {
    if (k === 4) {
      // a crescent
      ctx.beginPath();
      ctx.arc(0.26, -0.12, 0.17, Math.PI * 0.05, Math.PI * 0.95, true);
      ctx.quadraticCurveTo(0.26, -0.04, 0.428, -0.094);
      ctx.closePath();
      fillStroke(ctx, COLOR.gold, lw);
    }
    circle(ctx, 0.27, 0.0, 0.085);
    fillStroke(ctx, k === 4 ? COLOR.goldLight : tr, lw);
    sparkle(ctx, 0.36, -0.3, k === 6 ? 0.2 : 0.13, t, 5);
  }
}

// ------------------------------------------------------------------ sneakers: plain -> winged

function sneaker(ctx: Ctx, k: number, t: number, lw: number) {
  const tr = trimOf(k, t);
  const top = k >= 3 ? -0.36 : -0.22; // high-tops from B
  const upper = k === 0 ? '#efe9dd' : k === 1 ? COLOR.white : k === 6 ? '#fff6ff' : TIER.tile[k];
  if (k >= 5) glow(ctx, 0, 0.05, 0.6, 0.48, TIER.metalLight[k], t);
  if (k >= 4) {
    // a wing at the heel: small at A, full at SSS
    const n = k === 4 ? 2 : 3;
    const s = k === 6 ? 1.15 : k === 5 ? 0.95 : 0.75;
    const fl = Math.sin(t * 6) * 0.12;
    for (let i = n - 1; i >= 0; i--) {
      const a = -0.5 - i * 0.42 - fl;
      const l = (0.3 - i * 0.045) * s;
      ellipse(ctx, -0.3 - Math.cos(a) * l * 0.55, -0.12 + Math.sin(a) * l * 0.75, l * 0.62, 0.075 * s, -a);
      fillStroke(ctx, k === 6 ? RAINBOW[i + 1] : COLOR.white, lw * 0.85);
    }
  }
  // sole
  rr(ctx, -0.48, 0.3, 0.98, 0.2, 0.1);
  fillStroke(ctx, k === 0 ? '#d8d2c4' : COLOR.white, lw);
  if (k >= 2) {
    ctx.fillStyle = tr;
    ctx.fillRect(-0.4, 0.385, 0.82, 0.045);
  }
  // upper
  ctx.beginPath();
  ctx.moveTo(-0.45, 0.33);
  ctx.lineTo(-0.47, top + 0.06);
  ctx.quadraticCurveTo(-0.46, top, -0.38, top);
  ctx.lineTo(-0.12, top + 0.04);
  ctx.quadraticCurveTo(-0.02, top + 0.2, 0.14, 0.02);
  ctx.quadraticCurveTo(0.5, 0.06, 0.49, 0.33);
  ctx.closePath();
  fillStroke(ctx, upper, lw);
  // toe cap
  ctx.beginPath();
  ctx.moveTo(0.27, 0.33);
  ctx.quadraticCurveTo(0.24, 0.16, 0.33, 0.07);
  ctx.quadraticCurveTo(0.5, 0.1, 0.49, 0.33);
  ctx.closePath();
  fillStroke(ctx, k === 0 ? '#c9cfd9' : k < 4 ? COLOR.white : COLOR.goldLight, lw * 0.8);
  // one slanted band in the class colour
  if (k >= 1) {
    poly(ctx, [-0.25, 0.3, -0.12, top + 0.14, 0.0, top + 0.2, -0.1, 0.3]);
    fillStroke(ctx, tr, lw * 0.8);
  }
  // heel tab and laces
  ctx.fillStyle = k === 0 ? '#b9b3c2' : tr;
  ctx.fillRect(-0.47 + lw / 2, top + 0.08, 0.1, 0.12);
  ctx.lineWidth = lw * 0.9;
  ctx.strokeStyle = k < 2 ? COLOR.ink : COLOR.white;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(0.04 + i * 0.1, top + 0.24 + (k >= 3 ? 0.14 : 0) + i * 0.05);
    ctx.lineTo(0.13 + i * 0.1, top + 0.16 + (k >= 3 ? 0.14 : 0) + i * 0.05);
    ctx.stroke();
  }
  if (k === 6) {
    rr(ctx, -0.48, 0.3, 0.98, 0.2, 0.1);
    rainbowStroke(ctx, 0.045, t, 0.14);
  }
  if (k >= 4) sparkle(ctx, 0.34, -0.14, k === 6 ? 0.2 : 0.13, t, 6);
}

// ------------------------------------------------------------------ chili: small pepper -> a blazing one

function chili(ctx: Ctx, k: number, t: number, lw: number) {
  const tr = trimOf(k, t);
  // it ripens as it rises: green, amber, red, then burning
  const body = ['#7cc24a', '#f2a52c', '#f0452e', '#e8322a', '#e02828', '#c4122e', '#ff3b2e'][k];
  const lite = ['#c4ee9a', '#ffd98a', '#ff9a7a', '#ff8a6b', '#ff8a6b', '#ff6a7e', '#ffd84a'][k];
  const s = 0.74 + k * 0.045;
  if (k >= 5) glow(ctx, 0, 0, 0.6, 0.6, k === 6 ? '#ffd84a' : TIER.metalLight[k], t);
  if (k >= 5) {
    // it burns: flames lick up behind it
    flame(ctx, -0.22, 0.2, 0.5, t, '#ff5a1e', '#ffb02e', lw);
    flame(ctx, 0.22, 0.26, k === 6 ? 0.66 : 0.5, t + 1, '#ff5a1e', '#ffb02e', lw);
    if (k === 6) flame(ctx, 0, 0.0, 0.52, t + 2, '#ff7a1e', '#ffe066', lw);
  }
  ctx.save();
  ctx.scale(s, s);
  // the curled stalk
  ctx.lineWidth = lw * 2.6;
  ctx.strokeStyle = COLOR.ink;
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.3);
  ctx.quadraticCurveTo(-0.26, -0.48, -0.1, -0.5);
  ctx.stroke();
  ctx.lineWidth = lw * 1.1;
  ctx.strokeStyle = '#4f9a3a';
  ctx.stroke();
  // the pepper
  ctx.beginPath();
  ctx.moveTo(-0.36, -0.2);
  ctx.bezierCurveTo(-0.46, 0.24, 0.02, 0.56, 0.42, 0.42);
  ctx.bezierCurveTo(0.14, 0.3, 0.12, -0.02, 0.02, -0.28);
  ctx.closePath();
  fillStroke(ctx, body, lw);
  ctx.strokeStyle = lite;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-0.24, -0.06);
  ctx.quadraticCurveTo(-0.22, 0.2, -0.04, 0.33);
  ctx.stroke();
  // the green cap
  ctx.beginPath();
  ctx.moveTo(-0.4, -0.16);
  ctx.quadraticCurveTo(-0.28, -0.4, -0.02, -0.36);
  ctx.quadraticCurveTo(0.1, -0.3, 0.06, -0.2);
  ctx.quadraticCurveTo(-0.04, -0.26, -0.12, -0.16);
  ctx.quadraticCurveTo(-0.22, -0.24, -0.4, -0.16);
  ctx.closePath();
  fillStroke(ctx, '#5fae4a', lw);
  // a ring in the class colour around the stalk
  if (k >= 1) {
    ellipse(ctx, -0.2, -0.36, 0.085, 0.04, -0.2);
    fillStroke(ctx, tr, lw * 0.8);
  }
  ctx.restore();
  if (k === 3 || k === 4) flame(ctx, -0.04, -0.3, k === 4 ? 0.3 : 0.22, t, '#ff7a1e', '#ffe066', lw * 0.8);
  if (k >= 4) sparkle(ctx, 0.3, -0.1, k === 6 ? 0.2 : 0.13, t, 7);
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
  const lw = Math.max(1.15 / size, 0.05);
  if (type === 'helmet') helmet(ctx, k, t, lw);
  else if (type === 'sneakers') sneaker(ctx, k, t, lw);
  else chili(ctx, k, t, lw);
  ctx.restore();
}
