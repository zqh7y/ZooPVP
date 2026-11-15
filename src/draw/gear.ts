import type { GearType } from '../types';
import { COLOR } from '../theme';
import { Ep, METAL, Pp, RRp, chunky, cls, gleam, heat, outlineFor, seam, setOutline, sparkle, within, type Mat, type Shape } from './weapons';

/*
 * The three pieces of gear, in the units' chunky style and the weapons' class ramp (grey -> silver -> gold, a
 * sparkle at S, two at SSS), each drawn in a unit box (1 = size) centred on the origin. A piece grows a little
 * richer every couple of classes: rivets, a peak, a crest, a wing.
 */
type Ctx = CanvasRenderingContext2D;

const SOLE: Mat = ['#f2efe7', '#ffffff', '#cdc7bb'];
const LACE = '#f7f4ec';
const WING: Mat = ['#f4f1ea', '#ffffff', '#d6d0c4'];
const LEAF: Mat = ['#7aa363', '#9cc285', '#5c8549'];

/** A small white wing (the top classes' helmet and sneakers): root at (x, y), sweeping back and up. */
function wing(x: number, y: number, s: number): Path2D {
  return Pp((p) => {
    p.moveTo(x, y);
    p.quadraticCurveTo(x - 0.1 * s, y - 0.32 * s, x - 0.42 * s, y - 0.4 * s);
    p.quadraticCurveTo(x - 0.3 * s, y - 0.26 * s, x - 0.4 * s, y - 0.2 * s);
    p.quadraticCurveTo(x - 0.26 * s, y - 0.1 * s, x - 0.32 * s, y - 0.02 * s);
    p.quadraticCurveTo(x - 0.14 * s, y + 0.04 * s, x, y);
    p.closePath();
  });
}

// ------------------------------------------------------------------ helmet: a bowl that grows a peak, a crest, wings

function helmet(ctx: Ctx, k: number, t: number) {
  const m = METAL[k];
  const dome = Pp((p) => {
    p.moveTo(-0.41, 0.12);
    p.bezierCurveTo(-0.42, -0.4, 0.42, -0.4, 0.41, 0.12);
    p.closePath();
  });
  const brim = RRp(-0.45, 0.05, 0.9, 0.12, 0.055);
  const shapes: Shape[] = [];
  // a ridge over the top from B, in the darker metal so it reads apart from the bowl
  if (k >= 3) {
    shapes.push([Pp((p) => {
      p.moveTo(-0.32, -0.08);
      p.quadraticCurveTo(-0.2, -0.4, 0.1, -0.39);
      p.quadraticCurveTo(0.24, -0.37, 0.28, -0.24);
      p.quadraticCurveTo(0.06, -0.31, -0.32, -0.08);
      p.closePath();
    }), [m[2], m[0], m[2]], 0]);
  }
  // a peak over the brow from C
  if (k >= 2) {
    shapes.push([Pp((p) => {
      p.moveTo(0.28, 0.07);
      p.quadraticCurveTo(0.5, 0.08, 0.58, 0.17);
      p.lineTo(0.3, 0.17);
      p.closePath();
    }), m, 0]);
  }
  shapes.push([dome, m, 0.06], [brim, m, 0.02]);
  chunky(ctx, shapes);
  gleam(ctx, dome, -0.17, -0.1, 0.11, 0.05, -0.7, m[1]);
  // rivets on the band from D
  if (k >= 1) {
    ctx.fillStyle = m[2];
    for (const x of [-0.26, 0.0, 0.26]) {
      ctx.beginPath();
      ctx.arc(x, 0.11, 0.026, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // a little wing on the side from A
  if (k >= 4) {
    const w = wing(-0.12, -0.02, 0.8 + 0.06 * (k - 4));
    chunky(ctx, [[w, WING, 0.03]]);
    seam(ctx, Pp((p) => { p.moveTo(-0.17, -0.07); p.lineTo(-0.36, -0.2); }), 0.6);
  }
  if (k >= 5) sparkle(ctx, 0.2, -0.22, 0.13, t, 1);
  if (k >= 6) sparkle(ctx, -0.38, 0.02, 0.09, t, 3);
}

// ------------------------------------------------------------------ sneakers: a low-top that becomes a winged high-top

function sneaker(ctx: Ctx, k: number, t: number) {
  const m = METAL[k];
  const top = k >= 3 ? -0.3 : -0.16;
  const sole = RRp(-0.48, 0.3, 0.98, 0.2, 0.1);
  const upper = Pp((p) => {
    p.moveTo(-0.45, 0.34);
    p.lineTo(-0.46, top + 0.08);
    p.quadraticCurveTo(-0.45, top, -0.36, top);
    p.lineTo(-0.1, top + 0.02);
    p.quadraticCurveTo(-0.02, top + 0.2, 0.14, 0.04);
    p.quadraticCurveTo(0.5, 0.06, 0.5, 0.34);
    p.closePath();
  });
  const shapes: Shape[] = [];
  if (k >= 4) shapes.push([wing(-0.34, top + 0.22, 0.66 + 0.04 * (k - 4)), WING, 0.03]);
  shapes.push([upper, m, 0.06], [sole, SOLE, 0.03]);
  chunky(ctx, shapes);
  within(ctx, upper, () => {
    // a toe cap, and a stripe in the darker metal from C
    ctx.beginPath();
    ctx.ellipse(0.42, 0.3, 0.2, 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = SOLE[0];
    ctx.fill();
    if (k >= 2) {
      const st = Pp((p) => {
        p.moveTo(-0.28, 0.34);
        p.lineTo(-0.12, top + 0.12);
        p.lineTo(0.0, top + 0.2);
        p.lineTo(-0.12, 0.34);
        p.closePath();
      });
      ctx.fillStyle = m[2];
      ctx.fill(st);
      seam(ctx, st, 0.6);
    }
  });
  seam(ctx, Pp((p) => { p.moveTo(0.3, 0.12); p.quadraticCurveTo(0.26, 0.24, 0.3, 0.32); }), 0.7);
  gleam(ctx, upper, 0.18, 0.1, 0.08, 0.03, 0.25, m[1]);
  // laces
  seam(ctx, Pp((p) => {
    for (let i = 0; i < 2; i++) {
      const y = top + 0.22 + (k >= 3 ? 0.1 : 0) + i * 0.06;
      p.moveTo(0.0 + i * 0.08, y);
      p.lineTo(0.09 + i * 0.08, y - 0.07);
    }
  }), 1.1, LACE);
  if (k >= 5) sparkle(ctx, 0.3, -0.1, 0.13, t, 2);
  if (k >= 6) sparkle(ctx, -0.2, 0.12, 0.09, t, 4);
}

// ------------------------------------------------------------------ chili: one pepper in the class metal

function chili(ctx: Ctx, k: number, t: number) {
  const m = METAL[k];
  const s = 0.8 + k * 0.03;
  if (k >= 4) heat(ctx, 0.0, -0.3 * s, 0.6, t, 0.045, k >= 5 ? 3 : 2);
  ctx.save();
  ctx.scale(s, s);
  // the bent stalk standing out of the cap
  const stalk = Pp((p) => {
    p.moveTo(-0.16, -0.34);
    p.quadraticCurveTo(-0.2, -0.52, -0.02, -0.58);
  });
  ctx.lineWidth = 0.075 + outlineNow * 2;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke(stalk);
  ctx.lineWidth = 0.075;
  ctx.strokeStyle = LEAF[2];
  ctx.stroke(stalk);
  const pod = Pp((p) => {
    p.moveTo(-0.38, -0.2);
    p.bezierCurveTo(-0.5, 0.26, 0.0, 0.6, 0.48, 0.3);
    p.bezierCurveTo(0.16, 0.32, 0.12, -0.02, 0.06, -0.26);
    p.closePath();
  });
  const cap = Pp((p) => {
    p.moveTo(-0.45, -0.15);
    p.quadraticCurveTo(-0.34, -0.44, -0.08, -0.42);
    p.quadraticCurveTo(0.12, -0.38, 0.13, -0.24);
    p.quadraticCurveTo(0.12, -0.12, 0.07, -0.1);
    p.quadraticCurveTo(0.02, -0.15, -0.03, -0.2);
    p.quadraticCurveTo(-0.08, -0.08, -0.13, -0.07);
    p.quadraticCurveTo(-0.18, -0.14, -0.22, -0.2);
    p.quadraticCurveTo(-0.28, -0.1, -0.34, -0.09);
    p.quadraticCurveTo(-0.42, -0.1, -0.45, -0.15);
    p.closePath();
  });
  chunky(ctx, [[pod, m, 0.08], [cap, LEAF, 0.03]]);
  within(ctx, pod, () => {
    ctx.beginPath();
    ctx.moveTo(-0.28, -0.04);
    ctx.quadraticCurveTo(-0.29, 0.16, -0.12, 0.28);
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = m[1];
    ctx.stroke();
  });
  ctx.restore();
  if (k >= 5) sparkle(ctx, 0.24, -0.06, 0.13, t, 5);
  if (k >= 6) sparkle(ctx, -0.34, 0.24, 0.09, t, 6);
}

/** the outline of the piece being drawn (the stalk is a stroke, not a shape) */
let outlineNow = 0.06;

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
  outlineNow = outlineFor(size);
  setOutline(outlineNow);
  if (type === 'helmet') helmet(ctx, k, t);
  else if (type === 'sneakers') sneaker(ctx, k, t);
  else chili(ctx, k, t);
  ctx.restore();
}
