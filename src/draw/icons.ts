import { COLOR, TIER } from '../theme';
import { circle, ellipse, fillStroke, line, poly, rr, starPath, type Ctx } from '../util';

/*
 * Small sticker icons. Every one is (ctx, x, y, size, ...): x, y is the centre and size is the box it
 * fills. Thick ink outline, flat colour, one highlight.
 */

const lw = (size: number) => Math.max(1.6, size * 0.085);

/** Run a drawing in a box of 100 x 100 units centred on x, y. */
function unit(ctx: Ctx, x: number, y: number, size: number, fn: (u: number) => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  fn(100 / size); // multiplier so a line is the same on screen at any size
  ctx.restore();
}
const W8 = (size: number) => lw(size) * (100 / size);

export function trophy(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    // handles
    ctx.lineWidth = w * 2.2;
    ctx.strokeStyle = COLOR.ink;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 36, -12, 14, s > 0 ? -1.2 : Math.PI + 1.2, s > 0 ? 1.9 : Math.PI - 1.9, s < 0);
      ctx.stroke();
    }
    ctx.lineWidth = w * 0.9;
    ctx.strokeStyle = COLOR.gold;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 36, -12, 14, s > 0 ? -1.2 : Math.PI + 1.2, s > 0 ? 1.9 : Math.PI - 1.9, s < 0);
      ctx.stroke();
    }
    // foot and stem
    rr(ctx, -26, 34, 52, 15, 5);
    fillStroke(ctx, COLOR.goldDark, w);
    rr(ctx, -9, 16, 18, 22, 3);
    fillStroke(ctx, COLOR.gold, w);
    // cup
    ctx.beginPath();
    ctx.moveTo(-34, -40);
    ctx.lineTo(34, -40);
    ctx.quadraticCurveTo(34, 22, 0, 24);
    ctx.quadraticCurveTo(-34, 22, -34, -40);
    ctx.closePath();
    fillStroke(ctx, COLOR.gold, w);
    ctx.fillStyle = COLOR.goldLight;
    rr(ctx, -25, -33, 9, 38, 4.5);
    ctx.fill();
    starPath(ctx, 6, -10, 12, 5.5, 5);
    ctx.fillStyle = COLOR.goldDark;
    ctx.fill();
  });
}

/** Daruma: this game's lucky token. */
export function rollToken(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    ellipse(ctx, 0, 6, 42, 44);
    fillStroke(ctx, COLOR.vermilion, w);
    ellipse(ctx, 0, 14, 36, 34);
    ctx.fillStyle = COLOR.vermilionDark;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    // white face mask
    ellipse(ctx, 0, -2, 27, 22);
    fillStroke(ctx, COLOR.paper, w * 0.8);
    // eyes
    for (const s of [-1, 1]) {
      circle(ctx, s * 11, -3, 6);
      fillStroke(ctx, COLOR.white, w * 0.6);
      circle(ctx, s * 11, -2, 2.6);
      ctx.fillStyle = COLOR.ink;
      ctx.fill();
      ctx.lineWidth = w * 0.8;
      ctx.strokeStyle = COLOR.ink;
      ctx.beginPath();
      ctx.moveTo(s * 5, -14);
      ctx.quadraticCurveTo(s * 14, -22, s * 24, -13);
      ctx.stroke();
    }
    // moustache and belly mark
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.quadraticCurveTo(-4, 4, 0, 9);
    ctx.quadraticCurveTo(4, 4, 14, 10);
    ctx.stroke();
    ctx.lineWidth = w * 0.7;
    ctx.strokeStyle = COLOR.gold;
    ctx.beginPath();
    ctx.moveTo(-10, 28);
    ctx.lineTo(10, 28);
    ctx.moveTo(-6, 36);
    ctx.lineTo(6, 36);
    ctx.stroke();
    // highlight
    ellipse(ctx, -26, -22, 5, 9, 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  });
}

export function swords(ctx: Ctx, x: number, y: number, size: number, color: string = COLOR.white) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * 0.8);
      poly(ctx, [0, -46, 9, -34, 9, 14, -9, 14, -9, -34]);
      fillStroke(ctx, color, w);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-5, -34, 3.5, 44);
      rr(ctx, -20, 12, 40, 9, 4);
      fillStroke(ctx, COLOR.gold, w);
      rr(ctx, -5, 20, 10, 20, 4);
      fillStroke(ctx, COLOR.vermilion, w);
      ctx.restore();
    }
  });
}

export function heart(ctx: Ctx, x: number, y: number, size: number, color: string = COLOR.hpBad) {
  unit(ctx, x, y, size, () => {
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.bezierCurveTo(-56, 6, -42, -42, -18, -38);
    ctx.bezierCurveTo(-8, -37, -2, -30, 0, -24);
    ctx.bezierCurveTo(2, -30, 8, -37, 18, -38);
    ctx.bezierCurveTo(42, -42, 56, 6, 0, 40);
    ctx.closePath();
    fillStroke(ctx, color, W8(size));
    ellipse(ctx, -22, -18, 7, 11, 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  });
}

export function clock(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    circle(ctx, 0, 0, 42);
    fillStroke(ctx, COLOR.paper, w);
    circle(ctx, 0, 0, 42);
    ctx.lineWidth = w * 0.8;
    ctx.strokeStyle = COLOR.indigo;
    ctx.stroke();
    ctx.lineWidth = w * 1.1;
    ctx.strokeStyle = COLOR.ink;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(0, 0);
    ctx.lineTo(17, 9);
    ctx.stroke();
    circle(ctx, 0, 0, 5);
    ctx.fillStyle = COLOR.vermilion;
    ctx.fill();
  });
}

export function koStar(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    starPath(ctx, 0, 2, 48, 26, 8, 0.2);
    fillStroke(ctx, COLOR.gold, W8(size));
    starPath(ctx, 0, 2, 36, 20, 8, 0.2);
    ctx.fillStyle = COLOR.goldLight;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    // an X over it
    ctx.lineWidth = W8(size) * 1.3;
    ctx.strokeStyle = COLOR.ink;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(14, 16);
    ctx.moveTo(14, -12);
    ctx.lineTo(-14, 16);
    ctx.stroke();
  });
}

export function speaker(ctx: Ctx, x: number, y: number, size: number, muted = false) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    poly(ctx, [-40, -14, -22, -14, -2, -34, -2, 34, -22, 14, -40, 14]);
    fillStroke(ctx, COLOR.paper, w);
    ctx.lineWidth = w;
    ctx.strokeStyle = COLOR.ink;
    if (muted) {
      ctx.strokeStyle = COLOR.vermilion;
      ctx.lineWidth = w * 1.4;
      ctx.beginPath();
      ctx.moveTo(14, -16);
      ctx.lineTo(40, 16);
      ctx.moveTo(40, -16);
      ctx.lineTo(14, 16);
      ctx.stroke();
    } else {
      for (const r of [16, 30]) {
        ctx.beginPath();
        ctx.arc(-2, 0, r, -0.9, 0.9);
        ctx.stroke();
      }
    }
  });
}

export function trash(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    poly(ctx, [-30, -22, 30, -22, 25, 42, -25, 42]);
    fillStroke(ctx, COLOR.stone, w);
    ctx.lineWidth = w * 0.7;
    ctx.strokeStyle = COLOR.stoneDark;
    for (const s of [-12, 0, 12]) line(ctx, s, -10, s * 0.85, 32);
    rr(ctx, -38, -36, 76, 14, 6);
    fillStroke(ctx, COLOR.stoneDark, w);
    rr(ctx, -10, -46, 20, 12, 5);
    fillStroke(ctx, COLOR.stoneDark, w);
  });
}

/** Auto-arrange: a magic wand with sparkles. */
export function wand(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    ctx.save();
    ctx.rotate(-0.8);
    rr(ctx, -8, -18, 16, 66, 7);
    fillStroke(ctx, COLOR.indigo, w);
    rr(ctx, -8, -18, 16, 20, 7);
    fillStroke(ctx, COLOR.gold, w);
    ctx.restore();
    for (const [sx, sy, r] of [[18, -26, 20], [-30, -26, 11], [32, 6, 9]]) {
      starPath(ctx, sx, sy, r, r * 0.4, 4);
      fillStroke(ctx, COLOR.goldLight, w * 0.8);
    }
  });
}

/** A pointing hand (finger up) for the guide. */
export function hand(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    ctx.beginPath();
    ctx.moveTo(-8, -44);
    ctx.arcTo(2, -52, 12, -44, 10);
    ctx.lineTo(12, -6);
    ctx.lineTo(16, -6);
    ctx.arcTo(26, -12, 32, -4, 7);
    ctx.arcTo(42, -8, 44, 2, 7);
    ctx.arcTo(54, 2, 52, 18, 8);
    ctx.lineTo(46, 40);
    ctx.arcTo(44, 50, 32, 50, 8);
    ctx.lineTo(-2, 50);
    ctx.arcTo(-12, 50, -16, 42, 8);
    ctx.lineTo(-36, 6);
    ctx.arcTo(-42, -4, -30, -4, 6);
    ctx.lineTo(-8, 18);
    ctx.closePath();
    fillStroke(ctx, COLOR.paper, w);
    ctx.lineWidth = w * 0.6;
    ctx.strokeStyle = COLOR.paperEdge;
    ctx.beginPath();
    ctx.moveTo(26, -4);
    ctx.lineTo(26, 14);
    ctx.moveTo(40, 2);
    ctx.lineTo(40, 16);
    ctx.stroke();
  });
}

export function lock(ctx: Ctx, x: number, y: number, size: number) {
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    ctx.lineWidth = w * 3;
    ctx.strokeStyle = COLOR.ink;
    ctx.beginPath();
    ctx.arc(0, -10, 18, Math.PI, 0);
    ctx.lineTo(18, 0);
    ctx.moveTo(-18, -10);
    ctx.lineTo(-18, 0);
    ctx.stroke();
    ctx.lineWidth = w * 1.2;
    ctx.strokeStyle = COLOR.stone;
    ctx.beginPath();
    ctx.arc(0, -10, 18, Math.PI, 0);
    ctx.lineTo(18, 0);
    ctx.moveTo(-18, -10);
    ctx.lineTo(-18, 0);
    ctx.stroke();
    rr(ctx, -30, -4, 60, 46, 10);
    fillStroke(ctx, COLOR.gold, w);
    circle(ctx, 0, 14, 6.5);
    ctx.fillStyle = COLOR.ink;
    ctx.fill();
    ctx.fillRect(-2.2, 14, 4.4, 12);
  });
}

export function check(ctx: Ctx, x: number, y: number, size: number, color: string = COLOR.jade) {
  unit(ctx, x, y, size, () => {
    const pts = [-34, 2, -12, 26, 36, -26];
    ctx.lineWidth = W8(size) * 3.4;
    ctx.strokeStyle = COLOR.ink;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.lineTo(pts[2], pts[3]);
    ctx.lineTo(pts[4], pts[5]);
    ctx.stroke();
    ctx.lineWidth = W8(size) * 1.7;
    ctx.strokeStyle = color;
    ctx.stroke();
  });
}

/** An arrow; dir in radians, 0 points right. */
export function arrow(ctx: Ctx, x: number, y: number, size: number, dir = 0, color: string = COLOR.white) {
  unit(ctx, x, y, size, () => {
    ctx.rotate(dir);
    poly(ctx, [-40, -14, 6, -14, 6, -32, 42, 0, 6, 32, 6, 14, -40, 14]);
    fillStroke(ctx, color, W8(size));
  });
}

const LEAGUE = [
  ['#7fd77c', '#3a9a45'], // Sprout
  ['#e0a070', '#a8683a'], // Bronze
  ['#e1e6ef', '#8f99a8'], // Silver
  ['#ffe27a', '#d9951a'], // Gold
  ['#c9f3ff', '#5ab8d8'], // Platinum
  ['#a3cdff', '#3a78cc'], // Diamond
  ['#ffb0f0', '#9b2fd0'], // Legend
];

/** League badge: 0 Sprout, 1 Bronze, 2 Silver, 3 Gold, 4 Platinum, 5 Diamond, 6 Legend. */
export function leagueBadge(ctx: Ctx, x: number, y: number, size: number, index: number) {
  const i = Math.max(0, Math.min(6, Math.round(index)));
  const [light, dark] = LEAGUE[i];
  unit(ctx, x, y, size, () => {
    const w = W8(size);
    if (i === 0) {
      // a sprout on a green disc
      circle(ctx, 0, 0, 42);
      fillStroke(ctx, light, w);
      ctx.lineWidth = w * 1.2;
      ctx.strokeStyle = dark;
      ctx.beginPath();
      ctx.moveTo(0, 28);
      ctx.lineTo(0, -4);
      ctx.stroke();
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 15, -12, 16, 9, s * -0.6);
        fillStroke(ctx, COLOR.jade, w * 0.8);
      }
      return;
    }
    // shield with a point, rim in the league colour
    const shield = () => {
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(38, -34);
      ctx.quadraticCurveTo(42, 14, 0, 48);
      ctx.quadraticCurveTo(-42, 14, -38, -34);
      ctx.closePath();
    };
    shield();
    fillStroke(ctx, dark, w);
    ctx.save();
    ctx.scale(0.8, 0.82);
    ctx.translate(0, 1);
    shield();
    fillStroke(ctx, light, w * 0.7);
    ctx.restore();
    // pips: one per step above bronze
    const n = Math.min(3, i);
    const gem = i >= 5 ? COLOR.sakura : dark;
    if (i >= 3) {
      starPath(ctx, 0, 2, 18, 8, i === 6 ? 8 : 5);
      fillStroke(ctx, gem, w * 0.7);
    } else {
      for (let k = 0; k < n; k++) {
        circle(ctx, (k - (n - 1) / 2) * 17, 2, 6);
        fillStroke(ctx, dark, w * 0.6);
      }
    }
    ellipse(ctx, -17, -22, 4, 9, 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  });
}

/** A class-coloured small dot, handy for lists. */
export function classDot(ctx: Ctx, x: number, y: number, size: number, level: number) {
  circle(ctx, x, y, size / 2);
  fillStroke(ctx, TIER.tile[Math.max(0, Math.min(6, level - 1))], lw(size));
}
