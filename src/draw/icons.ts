import { UI } from '../theme';
import { circle, poly, rr, starPath, type Ctx } from '../util';

/*
 * The interface's glyphs. Every one is (ctx, x, y, size, ...): x, y is the centre and size is the box it
 * fills. One colour each, an even stroke with round ends, no fills-plus-outlines, no gradients, no faces.
 */

let tint: string | null = null;

/** Draw every glyph in this colour until it is reset with null (a button uses it so its glyph matches its label). */
export function iconTint(color: string | null) {
  tint = color;
}

const ink = (color?: string) => tint ?? color ?? UI.textDim;

/** Run a drawing in a box of 100 x 100 units centred on x, y, with the stroke set up. */
function glyph(ctx: Ctx, x: number, y: number, size: number, color: string, fn: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // about 8% of the box, never thinner than 1.5 px on screen
  ctx.lineWidth = Math.max(1.5, size * 0.08) * (100 / size);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  fn();
  ctx.restore();
}

function path(ctx: Ctx, pts: number[], close = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (close) ctx.closePath();
  ctx.stroke();
}

/** A cup: trophies. */
export function trophy(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    ctx.beginPath();
    ctx.moveTo(-22, -34);
    ctx.lineTo(22, -34);
    ctx.lineTo(22, -12);
    ctx.arc(0, -12, 22, 0, Math.PI);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-22, -18, 13, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(22, -18, 13, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();
    path(ctx, [0, 10, 0, 30]);
    path(ctx, [-18, 34, 18, 34]);
  });
}

/** A die: one roll. */
export function rollToken(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    rr(ctx, -34, -34, 68, 68, 14);
    ctx.stroke();
    for (const [px, py] of [[-15, -15], [15, -15], [0, 0], [-15, 15], [15, 15]]) {
      circle(ctx, px, py, 6);
      ctx.fill();
    }
  });
}

/** Crossed blades: a fight, an army's power. */
export function swords(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    for (const s of [-1, 1]) {
      path(ctx, [s * -34, 34, s * 34, -34]);
      path(ctx, [s * -30, 6, s * -6, 30]);
    }
  });
}

export function heart(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color ?? UI.danger), () => {
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.bezierCurveTo(-8, -38, -42, -34, -42, -8);
    ctx.bezierCurveTo(-42, 14, -16, 26, 0, 38);
    ctx.bezierCurveTo(16, 26, 42, 14, 42, -8);
    ctx.bezierCurveTo(42, -34, 8, -38, 0, -14);
    ctx.closePath();
    ctx.fill();
  });
}

export function clock(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    circle(ctx, 0, 0, 36);
    ctx.stroke();
    path(ctx, [0, -20, 0, 0, 15, 9]);
  });
}

/** A star: one knock-out. */
export function koStar(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    starPath(ctx, 0, 2, 38, 17, 5);
    ctx.stroke();
  });
}

export function speaker(ctx: Ctx, x: number, y: number, size: number, muted = false, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    path(ctx, [-38, -12, -22, -12, -2, -28, -2, 28, -22, 12, -38, 12], true);
    if (muted) {
      path(ctx, [14, -13, 40, 13]);
      path(ctx, [40, -13, 14, 13]);
      return;
    }
    for (const r of [15, 31]) {
      ctx.beginPath();
      ctx.arc(2, 0, r, -0.85, 0.85);
      ctx.stroke();
    }
  });
}

export function trash(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    path(ctx, [-32, -22, 32, -22]);
    path(ctx, [-11, -22, -11, -34, 11, -34, 11, -22]);
    path(ctx, [-23, -22, -19, 36, 19, 36, 23, -22]);
    path(ctx, [-7, -6, -7, 20]);
    path(ctx, [7, -6, 7, 20]);
  });
}

/** A wand with a spark: arrange for me. */
export function wand(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    path(ctx, [-34, 34, 6, -6]);
    starPath(ctx, 22, -22, 18, 5, 4);
    ctx.fill();
    path(ctx, [-20, -30, -20, -16]);
    path(ctx, [-27, -23, -13, -23]);
    path(ctx, [30, 14, 30, 26]);
    path(ctx, [24, 20, 36, 20]);
  });
}

/** A pointer: an arrow pointing up at something to touch. */
export function hand(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color ?? UI.accent), () => {
    poly(ctx, [0, -34, 26, 6, -26, 6]);
    ctx.fill();
  });
}

export function lock(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    rr(ctx, -26, -6, 52, 42, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-15, -6);
    ctx.lineTo(-15, -20);
    ctx.arc(0, -20, 15, Math.PI, 0);
    ctx.lineTo(15, -6);
    ctx.stroke();
    path(ctx, [0, 10, 0, 20]);
  });
}

export function check(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color ?? UI.ok), () => {
    path(ctx, [-30, 2, -9, 23, 31, -21]);
  });
}

/** An arrow; dir in radians, 0 points right. */
export function arrow(ctx: Ctx, x: number, y: number, size: number, dir = 0, color?: string) {
  glyph(ctx, x, y, size, ink(color ?? UI.text), () => {
    ctx.rotate(dir);
    path(ctx, [-34, 0, 34, 0]);
    path(ctx, [12, -22, 34, 0, 12, 22]);
  });
}

/**
 * League mark: 0 Sprout, 1 Bronze, 2 Silver, 3 Gold, 4 Platinum, 5 Diamond, 6 Legend. A shield that reads as
 * a rank: an open shield with one, two, three chevrons, then a solid shield with one, two, three, then a
 * solid shield with a star. One muted colour per league.
 */
export function leagueBadge(ctx: Ctx, x: number, y: number, size: number, index: number) {
  const i = Math.max(0, Math.min(6, Math.round(index)));
  const color = tint ?? UI.league[i];
  glyph(ctx, x, y, size, color, () => {
    const solid = i >= 3;
    ctx.beginPath();
    ctx.moveTo(-34, -40);
    ctx.lineTo(34, -40);
    ctx.lineTo(34, 2);
    ctx.quadraticCurveTo(34, 30, 0, 44);
    ctx.quadraticCurveTo(-34, 30, -34, 2);
    ctx.closePath();
    if (solid) ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ctx.fillStyle = solid ? UI.bg : color;
    if (i === 6) {
      starPath(ctx, 0, -2, 22, 9.5, 5);
      ctx.fill();
      return;
    }
    const n = (i % 3) + 1;
    for (let k = 0; k < n; k++) {
      const cy = (k - (n - 1) / 2) * 17 + 2;
      path(ctx, [-16, cy + 5, 0, cy - 7, 16, cy + 5]);
    }
  });
}

/** A class-coloured small dot, handy for lists. */
export function classDot(ctx: Ctx, x: number, y: number, size: number, level: number) {
  circle(ctx, x, y, size / 2);
  ctx.fillStyle = UI.tier[Math.max(0, Math.min(6, Math.round(level) - 1))];
  ctx.fill();
}
