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

/** A lightning bolt: an army's power. Filled, so it reads at a glance. */
export function bolt(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    poly(ctx, [8, -44, -26, 6, -2, 6, -10, 44, 26, -8, 2, -8]);
    ctx.fill();
    ctx.stroke();
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
  glyph(ctx, x, y, size, ink(color ?? UI.text), () => {
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.bezierCurveTo(-8, -38, -42, -34, -42, -8);
    ctx.bezierCurveTo(-42, 14, -16, 26, 0, 38);
    ctx.bezierCurveTo(16, 26, 42, 14, 42, -8);
    ctx.bezierCurveTo(42, -34, 8, -38, 0, -14);
    ctx.closePath();
    ctx.stroke();
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
  glyph(ctx, x, y, size, ink(color ?? UI.text), () => {
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

/** A class-coloured small dot, handy for lists. */
export function classDot(ctx: Ctx, x: number, y: number, size: number, level: number) {
  circle(ctx, x, y, size / 2);
  ctx.fillStyle = UI.tier[Math.max(0, Math.min(6, Math.round(level) - 1))];
  ctx.fill();
}

/** A banknote: cash. Filled, in two tones, so it reads at a glance in the top bar and on the CASE price. */
export function cash(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  const c = tint ?? color ?? '#7fae86';
  glyph(ctx, x, y, size, c, () => {
    ctx.save();
    ctx.rotate(-0.12);
    rr(ctx, -42, -26, 84, 52, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 6;
    rr(ctx, -31, -16, 62, 32, 6);
    ctx.stroke();
    circle(ctx, 0, 0, 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    ctx.restore();
  });
}

/** A cut gem: gems. Filled, with a lighter top facet. */
export function gem(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  const c = tint ?? color ?? UI.gem;
  glyph(ctx, x, y, size, c, () => {
    poly(ctx, [-38, -12, -18, -36, 18, -36, 38, -12, 0, 40]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    poly(ctx, [-38, -12, -18, -36, 18, -36, 38, -12]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 4;
    path(ctx, [-38, -12, 38, -12]);
    path(ctx, [-12, -12, 0, 36, 12, -12]);
  });
}

/** Three rising bars: the stats / unit ladder. */
export function bars(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    rr(ctx, -34, 4, 18, 32, 4);
    ctx.fill();
    rr(ctx, -9, -16, 18, 52, 4);
    ctx.fill();
    rr(ctx, 16, -36, 18, 72, 4);
    ctx.fill();
  });
}

/** A filled star: the LEVEL badge, a reward. */
export function star(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color ?? UI.reward), () => {
    starPath(ctx, 0, 4, 44, 20, 5);
    ctx.fill();
  });
}

/** Two arrows chasing each other round: AUTO (the next match starts by itself). */
export function cycle(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    for (const s of [0, Math.PI]) {
      ctx.save();
      ctx.rotate(s);
      ctx.beginPath();
      ctx.arc(0, 0, 30, Math.PI * 1.08, Math.PI * 1.85);
      ctx.stroke();
      const a = Math.PI * 1.85;
      const px = Math.cos(a) * 30;
      const py = Math.sin(a) * 30;
      poly(ctx, [px + 12, py - 4, px - 8, py - 12, px - 2, py + 10]);
      ctx.fill();
      ctx.restore();
    }
  });
}

/** Crossed swords inside nothing: BATTLE's glyph. */
export function fight(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    for (const s of [-1, 1]) {
      path(ctx, [s * -30, 30, s * 26, -26]);
      path(ctx, [s * 26, -26, s * 34, -34]);
      path(ctx, [s * -36, 14, s * -14, 36]);
    }
  });
}

/** A crown: a CHAMPION match and its boss. Filled, three points with round jewels. */
export function crown(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color ?? UI.reward), () => {
    poly(ctx, [-40, 26, -44, -20, -20, 2, 0, -34, 20, 2, 44, -20, 40, 26]);
    ctx.fill();
    ctx.stroke();
    for (const [px, py] of [[-44, -24], [0, -38], [44, -24]]) {
      circle(ctx, px, py, 8);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    rr(ctx, -36, 12, 72, 9, 4);
    ctx.fill();
  });
}

/** A flame: a win streak. Filled, with a lighter heart. */
export function flame(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color ?? '#ff8a3d'), () => {
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.bezierCurveTo(-34, 42, -40, 10, -26, -8);
    ctx.bezierCurveTo(-20, 4, -12, 6, -10, 4);
    ctx.bezierCurveTo(-16, -18, -2, -34, 6, -44);
    ctx.bezierCurveTo(8, -24, 36, -14, 34, 12);
    ctx.bezierCurveTo(34, 32, 18, 42, 0, 42);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 236, 160, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, 38);
    ctx.bezierCurveTo(-16, 38, -18, 20, -10, 10);
    ctx.bezierCurveTo(-4, 16, 2, 14, 2, 4);
    ctx.bezierCurveTo(12, 12, 18, 22, 14, 30);
    ctx.bezierCurveTo(10, 36, 6, 38, 0, 38);
    ctx.fill();
  });
}

/** A 2 x 2 grid: grid cells (a new cell opened). */
export function cells(ctx: Ctx, x: number, y: number, size: number, color?: string) {
  glyph(ctx, x, y, size, ink(color), () => {
    for (const [px, py] of [[-36, -36], [4, -36], [-36, 4], [4, 4]]) {
      rr(ctx, px, py, 32, 32, 7);
      ctx.fill();
    }
  });
}
