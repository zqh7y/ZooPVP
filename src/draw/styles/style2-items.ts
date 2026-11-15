import type { ItemType } from './api';
import type { WeaponType } from '../../types';
import { split, type Ctx } from './style2-kit';

/*
 * Style 2's items. Each is a handful of flat shapes, every one cut lengthwise (or diagonally, for the round
 * ones) into a lit and a shaded tone: no outlines anywhere. A weapon is drawn with its grip at the origin,
 * pointing along +x, about 1 unit from grip to tip, so a pet can hold it and the lobby can show it.
 */
const PI = Math.PI;
const S = 0.70710678;

export const STEEL = { lit: '#f5f8fb', shade: '#b3bfcc', deep: '#7d8a9a' };
export const WOOD = { lit: '#f3b46a', shade: '#c97a3a', deep: '#93542a' };
export const GOLD = { lit: '#ffd43f', shade: '#eb9f00' };
export const SLATE = { lit: '#3f4b5d', shade: '#252e3b' };
const RED = { lit: '#ff5a43', shade: '#cf2b29' };
const HELM = { lit: '#dfe6ee', shade: '#94a2b4' };
const KICK = { lit: '#2fd3a8', shade: '#119777' };
const LEAF = { lit: '#6fd06a', shade: '#2f9a4c' };
const CREAM = { lit: '#fffaf0', shade: '#e8d9c2' };

/** keys for the cached fills (the pets use keys below 4000) */
const K = 4000;

export function capsule(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.arc(x1, y1, r, a - PI / 2, a + PI / 2);
  ctx.arc(x0, y0, r, a + PI / 2, a + (3 * PI) / 2);
  ctx.closePath();
}

/** lengthwise bevel: lit above the axis, shaded below */
const bevel = (ctx: Ctx, k: number, lit: string, shade: string, y = 0) => split(ctx, K + k, 0, y, 0, 1, lit, shade);
/** the sun's diagonal, for round things */
const diag = (ctx: Ctx, k: number, lit: string, shade: string, cx = 0, cy = 0, off = 0) => split(ctx, K + k, cx, cy, S, S, lit, shade, off);

function knife(ctx: Ctx) {
  ctx.fillStyle = bevel(ctx, 1, WOOD.lit, WOOD.shade);
  capsule(ctx, -0.42, 0, 0.02, 0, 0.09);
  ctx.fill();
  ctx.fillStyle = bevel(ctx, 2, GOLD.lit, GOLD.shade);
  capsule(ctx, 0.07, -0.13, 0.07, 0.13, 0.055);
  ctx.fill();
  ctx.fillStyle = bevel(ctx, 3, STEEL.lit, STEEL.shade, 0.01);
  ctx.beginPath();
  ctx.moveTo(0.12, -0.12);
  ctx.lineTo(0.7, -0.12);
  ctx.quadraticCurveTo(0.96, -0.11, 1.05, -0.03);
  ctx.quadraticCurveTo(0.86, 0.15, 0.58, 0.15);
  ctx.lineTo(0.12, 0.15);
  ctx.closePath();
  ctx.fill();
}

function bat(ctx: Ctx) {
  ctx.fillStyle = bevel(ctx, 10, WOOD.lit, WOOD.shade);
  ctx.beginPath();
  ctx.moveTo(-0.56, -0.055);
  ctx.lineTo(-0.02, -0.06);
  ctx.quadraticCurveTo(0.3, -0.07, 0.5, -0.155);
  ctx.lineTo(0.86, -0.16);
  ctx.arc(0.86, 0, 0.16, -PI / 2, PI / 2);
  ctx.lineTo(0.5, 0.155);
  ctx.quadraticCurveTo(0.3, 0.07, -0.02, 0.06);
  ctx.lineTo(-0.56, 0.055);
  ctx.closePath();
  ctx.fill();
  // grip tape and the knob
  ctx.fillStyle = bevel(ctx, 11, SLATE.lit, SLATE.shade);
  ctx.beginPath();
  ctx.rect(-0.56, -0.07, 0.36, 0.14);
  ctx.ellipse(-0.6, 0, 0.055, 0.12, 0, 0, PI * 2);
  ctx.fill();
}

function spear(ctx: Ctx) {
  ctx.fillStyle = bevel(ctx, 20, WOOD.lit, WOOD.shade);
  capsule(ctx, -1.0, 0, 0.5, 0, 0.06);
  ctx.fill();
  // a red ribbon tied under the head
  ctx.fillStyle = bevel(ctx, 23, RED.lit, RED.shade, 0.1);
  ctx.beginPath();
  ctx.moveTo(0.46, 0.02);
  ctx.quadraticCurveTo(0.3, 0.1, 0.16, 0.3);
  ctx.lineTo(0.3, 0.26);
  ctx.lineTo(0.3, 0.38);
  ctx.quadraticCurveTo(0.44, 0.18, 0.5, 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bevel(ctx, 21, GOLD.lit, GOLD.shade);
  ctx.beginPath();
  ctx.ellipse(0.48, 0, 0.07, 0.1, 0, 0, PI * 2);
  ctx.arc(-1.0, 0, 0.08, 0, PI * 2);
  ctx.fill();
  ctx.fillStyle = bevel(ctx, 22, STEEL.lit, STEEL.shade);
  ctx.beginPath();
  ctx.moveTo(0.52, 0);
  ctx.quadraticCurveTo(0.62, -0.25, 1.1, 0);
  ctx.quadraticCurveTo(0.62, 0.25, 0.52, 0);
  ctx.closePath();
  ctx.fill();
}

/** a round shield seen face on, radius 1 */
function shield(ctx: Ctx) {
  ctx.fillStyle = diag(ctx, 30, HELM.lit, HELM.shade, 0, 0, 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, PI * 2);
  ctx.fill();
  ctx.fillStyle = diag(ctx, 31, WOOD.lit, WOOD.shade, 0, 0, 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, 0.78, 0, PI * 2);
  ctx.fill();
  // a gold band across, then the boss
  ctx.fillStyle = diag(ctx, 32, GOLD.lit, GOLD.shade, 0, 0, 0.12);
  ctx.beginPath();
  ctx.rect(-0.78, -0.13, 1.56, 0.26);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 0.3, 0, PI * 2);
  ctx.fill();
  ctx.fillStyle = diag(ctx, 33, STEEL.lit, STEEL.shade, 0, 0, 0.0);
  ctx.beginPath();
  ctx.arc(0, 0, 0.14, 0, PI * 2);
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
 * The helmet from the side, facing right: a steel bowl, a gold brow band with a nose guard hanging at the front,
 * and a gold brush crest. Its rim sits on y = 0 and spans x -1..1; the bowl rises to y -0.9, the crest to -1.3.
 */
export function helmet(ctx: Ctx) {
  // the crest: a fan of brush rooted in the bowl (the bowl covers its root)
  ctx.fillStyle = diag(ctx, 40, GOLD.lit, GOLD.shade, -0.25, -1.0, 0.0);
  ctx.beginPath();
  ctx.moveTo(-0.1, -0.3);
  ctx.arc(-0.1, -0.3, 1.04, PI * 1.08, PI * 1.56);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = diag(ctx, 41, HELM.lit, HELM.shade, 0.05, -0.45, 0.12);
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.95, 0.92, 0, PI, PI * 2);
  ctx.closePath();
  ctx.fill();
  // the brow band, running out into a short peak at the front
  ctx.fillStyle = bevel(ctx, 42, GOLD.lit, GOLD.shade, -0.03);
  ctx.beginPath();
  ctx.moveTo(-1.0, -0.14);
  ctx.lineTo(0.9, -0.14);
  ctx.quadraticCurveTo(1.2, -0.12, 1.22, 0.06);
  ctx.lineTo(-1.0, 0.1);
  ctx.closePath();
  ctx.fill();
}

function sneaker(ctx: Ctx) {
  // the upper: a high-top, heel up at the back
  ctx.fillStyle = diag(ctx, 50, KICK.lit, KICK.shade, -0.05, -0.1, 0.12);
  ctx.beginPath();
  ctx.moveTo(-0.9, 0.24);
  ctx.lineTo(-0.88, -0.5);
  ctx.quadraticCurveTo(-0.86, -0.68, -0.68, -0.68);
  ctx.lineTo(-0.26, -0.62);
  ctx.lineTo(0.16, -0.18);
  ctx.quadraticCurveTo(0.96, -0.12, 0.98, 0.24);
  ctx.closePath();
  ctx.fill();
  // cream toe cap, laces and a bolt down the side
  ctx.fillStyle = CREAM.lit;
  ctx.beginPath();
  ctx.moveTo(0.42, 0.24);
  ctx.quadraticCurveTo(0.42, -0.1, 0.6, -0.13);
  ctx.quadraticCurveTo(0.95, -0.08, 0.98, 0.24);
  ctx.closePath();
  for (let i = 0; i < 3; i++) {
    const x = -0.2 + i * 0.13;
    const y = -0.48 + i * 0.13;
    ctx.moveTo(x - 0.11, y - 0.02);
    ctx.lineTo(x + 0.03, y - 0.14);
    ctx.lineTo(x + 0.09, y - 0.08);
    ctx.lineTo(x - 0.05, y + 0.04);
    ctx.closePath();
  }
  ctx.moveTo(-0.46, -0.44);
  ctx.lineTo(-0.16, -0.12);
  ctx.lineTo(-0.34, -0.08);
  ctx.lineTo(-0.04, 0.2);
  ctx.lineTo(-0.56, -0.02);
  ctx.lineTo(-0.38, -0.06);
  ctx.closePath();
  ctx.fill();
  // the sole
  ctx.fillStyle = bevel(ctx, 51, CREAM.lit, CREAM.shade, 0.35);
  ctx.beginPath();
  ctx.moveTo(-0.95, 0.2);
  ctx.lineTo(0.8, 0.2);
  ctx.quadraticCurveTo(1.04, 0.2, 1.04, 0.35);
  ctx.quadraticCurveTo(1.04, 0.5, 0.84, 0.5);
  ctx.lineTo(-0.85, 0.5);
  ctx.quadraticCurveTo(-0.97, 0.5, -0.97, 0.38);
  ctx.closePath();
  ctx.fill();
}

function chili(ctx: Ctx) {
  // the pod: a fat crescent tapering to a curled tip
  ctx.fillStyle = diag(ctx, 60, RED.lit, RED.shade, -0.05, 0.0, 0.08);
  ctx.beginPath();
  ctx.moveTo(-0.62, -0.5);
  ctx.bezierCurveTo(-0.95, 0.15, -0.35, 0.85, 0.72, 0.62);
  ctx.quadraticCurveTo(0.95, 0.56, 0.86, 0.5);
  ctx.bezierCurveTo(0.1, 0.48, -0.12, 0.0, -0.14, -0.5);
  ctx.closePath();
  ctx.fill();
  // the green cap and stalk
  ctx.fillStyle = diag(ctx, 61, LEAF.lit, LEAF.shade, -0.38, -0.56, 0.0);
  ctx.beginPath();
  ctx.ellipse(-0.38, -0.54, 0.3, 0.14, 0.08, 0, PI * 2);
  ctx.fill();
  capsule(ctx, -0.36, -0.6, -0.12, -0.92, 0.065);
  ctx.fill();
}

/** An item's lobby icon, centred at (x, y) in a size x size box. */
export function icon(ctx: Ctx, type: ItemType, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  const h = size / 2;
  if (type === 'knife') {
    ctx.rotate(-PI / 4);
    ctx.scale(h * 1.2, h * 1.2);
    ctx.translate(-0.31, 0);
    knife(ctx);
  } else if (type === 'bat') {
    ctx.rotate(-PI / 4);
    ctx.scale(h * 1.12, h * 1.12);
    ctx.translate(-0.2, 0);
    bat(ctx);
  } else if (type === 'spear') {
    ctx.rotate(-PI / 4);
    ctx.scale(h * 0.88, h * 0.88);
    ctx.translate(-0.05, 0);
    spear(ctx);
  } else if (type === 'shield') {
    ctx.scale(h * 0.88, h * 0.88);
    shield(ctx);
  } else if (type === 'helmet') {
    ctx.translate(-h * 0.04, h * 0.32);
    ctx.scale(h * 0.74, h * 0.74);
    helmet(ctx);
  } else if (type === 'sneakers') {
    ctx.translate(0, -h * 0.02);
    ctx.scale(h * 0.86, h * 0.86);
    sneaker(ctx);
  } else {
    ctx.scale(h * 0.95, h * 0.95);
    chili(ctx);
  }
  ctx.restore();
}
