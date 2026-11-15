import type { WeaponType } from '../types';
import { COLOR } from '../theme';
import { clamp } from '../util';

/*
 * The four weapons, in the units' chunky style (docs/v4.md): one thick dark outline round the whole shape, flat
 * colours with one soft shade, a little gleam on the metal, very few details.
 * A class is the same object in a better material, read through ONE ramp (METAL): dull iron (E), grey steel (D),
 * steel (C), silver (B), gold (A), gold (S), pale gold (SSS); S adds a small sparkle, SSS two. The shape grows a
 * little richer every couple of classes (a guard, a grip wrap, studs, a gem).
 * Everything is drawn in a unit box (1 = the weapon's length) so a piece looks the same at any size.
 * The shared kit below (METAL, chunky, gleam, sparkle, heat) serves the gear and the units too.
 */
type Ctx = CanvasRenderingContext2D;

/** class 1..7 as an index 0..6 */
export const cls = (level: number) => clamp(Math.round(level), 1, 7) - 1;

/** [face, light, shade] of a material */
export type Mat = readonly [string, string, string];

/** THE CLASS RAMP, E..SSS: grey -> silver -> gold, soft, never neon */
export const METAL: readonly Mat[] = [
  ['#8d939b', '#b4b9c0', '#6a7078'], // E dull iron
  ['#a1a8b1', '#c8cdd4', '#7b838d'], // D grey steel
  ['#b7c0ca', '#e0e5ea', '#8b95a2'], // C steel
  ['#d3dae2', '#f6f8fa', '#9fabba'], // B silver
  ['#dbb35b', '#f2d88f', '#ac8335'], // A gold
  ['#e4bc50', '#f8e39c', '#b5892c'], // S gold
  ['#edcf7c', '#fff4d0', '#c29c49'], // SSS pale gold
];
export const WOOD: Mat = ['#a97c52', '#c99c70', '#7f5a39'];
/** grip wraps and handles */
export const WRAP: Mat = ['#4f4b55', '#77727e', '#37343c'];
/** a soft teal gem on the top classes */
export const GEM: Mat = ['#7cc0c4', '#c9eef0', '#53959a'];

/** The visible outline width (in the piece's units) of the piece being drawn; set by drawWeapon / drawGear. */
let LW = 0.06;
export const setOutline = (w: number) => {
  LW = w;
};

export function RRp(x: number, y: number, w: number, h: number, r: number): Path2D {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const p = new Path2D();
  p.moveTo(x + k, y);
  p.arcTo(x + w, y, x + w, y + h, k);
  p.arcTo(x + w, y + h, x, y + h, k);
  p.arcTo(x, y + h, x, y, k);
  p.arcTo(x, y, x + w, y, k);
  p.closePath();
  return p;
}
export function Ep(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, Math.PI * 2);
  return p;
}
export function Pp(f: (p: Path2D) => void): Path2D {
  const p = new Path2D();
  f(p);
  return p;
}

export type Shape = readonly [Path2D, Mat, number?];
/**
 * Shapes as one chunky silhouette, like the units: every outline first (thick ink), then every fill over them,
 * each with its one shade (the lit copy pushed d up-left leaves a shade crescent low on the right).
 */
export function chunky(ctx: Ctx, shapes: readonly Shape[]) {
  ctx.lineWidth = LW * 2;
  ctx.strokeStyle = COLOR.ink;
  for (const s of shapes) ctx.stroke(s[0]);
  for (const [p, m, d = 0] of shapes) {
    if (!d) {
      ctx.fillStyle = m[0];
      ctx.fill(p);
      continue;
    }
    ctx.fillStyle = m[2];
    ctx.fill(p);
    ctx.save();
    ctx.clip(p);
    ctx.translate(-d * 0.45, -d);
    ctx.fillStyle = m[0];
    ctx.fill(p);
    ctx.restore();
  }
}
/** a thin ink line (k = width in outlines), or a line of a colour */
export function seam(ctx: Ctx, p: Path2D, k = 0.8, color: string = COLOR.ink) {
  ctx.lineWidth = LW * k;
  ctx.strokeStyle = color;
  ctx.stroke(p);
}
/** paints inside a shape */
export function within(ctx: Ctx, p: Path2D, draw: () => void) {
  ctx.save();
  ctx.clip(p);
  draw();
  ctx.restore();
}
/** the little catch of light on metal: a soft streak inside the shape */
export function gleam(ctx: Ctx, shape: Path2D, x: number, y: number, rx: number, ry: number, rot: number, color: string) {
  within(ctx, shape, () => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

/** A small four-point sparkle with an ink edge, s at its largest; it breathes slowly but never vanishes. */
export function sparkle(ctx: Ctx, x: number, y: number, s: number, t: number, phase = 0) {
  const a = s * (0.82 + 0.18 * Math.sin(t * 2.4 + phase));
  const w = a * 0.16;
  ctx.beginPath();
  ctx.moveTo(x, y - a);
  ctx.quadraticCurveTo(x + w, y - w, x + a, y);
  ctx.quadraticCurveTo(x + w, y + w, x, y + a);
  ctx.quadraticCurveTo(x - w, y + w, x - a, y);
  ctx.quadraticCurveTo(x - w, y - w, x, y - a);
  ctx.closePath();
  ctx.lineWidth = LW * 1.4;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  ctx.fillStyle = '#fffbea';
  ctx.fill();
}
/** the sparkles of the top classes: one at S, two at SSS */
function shine(ctx: Ctx, k: number, t: number, x: number, y: number, s: number, x2: number, y2: number) {
  if (k >= 5) sparkle(ctx, x, y, s, t, x * 7);
  if (k >= 6) sparkle(ctx, x2, y2, s * 0.68, t, 2 + y2 * 5);
}

/** Heat rising off something hot: n faint warm wavy lines, s tall, standing on (x, y). */
export function heat(ctx: Ctx, x: number, y: number, s: number, t: number, lw: number, n = 2) {
  const a = ctx.globalAlpha;
  ctx.lineWidth = lw;
  ctx.strokeStyle = '#efb35e';
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.8 + i / n) % 1;
    const y0 = y - ph * s * 0.45;
    const x0 = x + (i - (n - 1) / 2) * s * 0.34;
    const wv = s * 0.09;
    ctx.globalAlpha = a * Math.sin(ph * Math.PI) * 0.7;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + wv, y0 - s * 0.15, x0 - wv, y0 - s * 0.3, x0 + wv * 0.5, y0 - s * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = a;
}

// ------------------------------------------------------------------ knife: kitchen knife -> dagger -> big gem dagger

function knife(ctx: Ctx, k: number, t: number) {
  const m = METAL[k];
  const g = k < 2 ? 0 : k < 4 ? 1 : 2;
  const handle = RRp(-0.075, -0.4, 0.15, 0.42, 0.065);
  const blade =
    g === 0
      ? Pp((p) => {
          p.moveTo(-0.085, -0.42);
          p.lineTo(-0.085, -0.9);
          p.quadraticCurveTo(-0.08, -1.0, 0.0, -0.99);
          p.quadraticCurveTo(0.16, -0.8, 0.15, -0.42);
          p.closePath();
        })
      : g === 1
        ? Pp((p) => {
            p.moveTo(-0.1, -0.44);
            p.quadraticCurveTo(-0.14, -0.76, 0, -1.0);
            p.quadraticCurveTo(0.14, -0.76, 0.1, -0.44);
            p.closePath();
          })
        : Pp((p) => {
            p.moveTo(-0.12, -0.44);
            p.quadraticCurveTo(-0.17, -0.8, 0.02, -1.0);
            p.quadraticCurveTo(0.19, -0.78, 0.12, -0.44);
            p.closePath();
          });
  const guard =
    g === 0
      ? RRp(-0.095, -0.47, 0.19, 0.075, 0.03)
      : g === 1
        ? RRp(-0.18, -0.48, 0.36, 0.08, 0.04)
        : Pp((p) => {
            p.moveTo(-0.23, -0.54);
            p.quadraticCurveTo(0, -0.4, 0.23, -0.54);
            p.lineTo(0.21, -0.45);
            p.quadraticCurveTo(0, -0.33, -0.21, -0.45);
            p.closePath();
          });
  const shapes: Shape[] = [[handle, g === 0 ? WOOD : WRAP, 0.03], [blade, m, 0.06], [guard, m, 0]];
  if (g >= 1) shapes.push([Ep(0, 0.02, 0.075, 0.065), m, 0]);
  chunky(ctx, shapes);
  gleam(ctx, blade, -0.045, -0.72, 0.026, 0.2, 0.05, m[1]);
  // a fuller down the blade from C, handle rivets on the kitchen knife, a wrap on the rest
  if (g >= 1) seam(ctx, Pp((p) => { p.moveTo(0.01, -0.52); p.lineTo(0.01, -0.84); }), 0.8, m[2]);
  if (g === 0) {
    ctx.fillStyle = METAL[2][0];
    for (const y of [-0.12, -0.27]) {
      ctx.beginPath();
      ctx.arc(0, y, 0.026, 0, Math.PI * 2);
      ctx.fill();
    }
  } else seam(ctx, Pp((p) => { for (const y of [-0.12, -0.24]) { p.moveTo(-0.06, y + 0.03); p.lineTo(0.06, y - 0.03); } }), 0.7, WRAP[1]);
  if (g === 2) chunky(ctx, [[Ep(0, -0.455, 0.045, 0.045), GEM, 0.01]]);
  shine(ctx, k, t, 0.12, -0.84, 0.13, -0.15, -0.6);
}

// ------------------------------------------------------------------ bat: a metal bat that grows studs

function bat(ctx: Ctx, k: number, t: number) {
  const m = METAL[k];
  const bw = 0.13 + (k >= 4 ? 0.015 : 0);
  const body = Pp((p) => {
    p.moveTo(-0.045, -0.03);
    p.lineTo(-0.045, -0.36);
    p.bezierCurveTo(-0.05, -0.52, -bw, -0.52, -bw, -0.7);
    p.lineTo(-bw, -0.9);
    p.quadraticCurveTo(-bw, -1, 0, -1);
    p.quadraticCurveTo(bw, -1, bw, -0.9);
    p.lineTo(bw, -0.7);
    p.bezierCurveTo(bw, -0.52, 0.05, -0.52, 0.045, -0.36);
    p.lineTo(0.045, -0.03);
    p.closePath();
  });
  const shapes: Shape[] = [];
  // studs poke out of the barrel from B
  const ys = k < 3 ? [] : k < 4 ? [-0.86] : [-0.9, -0.74];
  for (const y of ys) {
    for (const s of [-1, 1]) {
      shapes.push([Pp((p) => {
        p.moveTo(s * (bw - 0.01), y - 0.055);
        p.lineTo(s * (bw + 0.085), y);
        p.lineTo(s * (bw - 0.01), y + 0.055);
        p.closePath();
      }), m, 0]);
    }
  }
  shapes.push([body, m, 0.07], [Ep(0, -0.025, 0.088, 0.048), m, 0]);
  chunky(ctx, shapes);
  gleam(ctx, body, -bw * 0.5, -0.8, bw * 0.17, 0.17, 0, m[1]);
  // the grip wrap from D, a ring round the barrel from C
  if (k >= 1) {
    const grip = RRp(-0.058, -0.34, 0.116, 0.28, 0.03);
    ctx.fillStyle = WRAP[0];
    ctx.fill(grip);
    seam(ctx, grip, 0.8);
    seam(ctx, Pp((p) => { for (let i = 0; i < 3; i++) { p.moveTo(-0.055, -0.1 - i * 0.075); p.lineTo(0.055, -0.14 - i * 0.075); } }), 0.6, WRAP[1]);
  }
  if (k >= 2) {
    const ring = RRp(-bw - 0.01, -0.64, bw * 2 + 0.02, 0.06, 0.025);
    ctx.fillStyle = m[2];
    ctx.fill(ring);
    seam(ctx, ring, 0.8);
  }
  shine(ctx, k, t, -0.02, -0.9, 0.13, 0.14, -0.6);
}

// ------------------------------------------------------------------ shield: a round shield with a boss

function shield(ctx: Ctx, k: number, t: number) {
  const m = METAL[k];
  const rim = Ep(0, 0, 0.47, 0.47);
  chunky(ctx, [[rim, m, 0.05]]);
  // the face: planks on the low classes, a darker plate of the class metal from C
  const face = Ep(0, 0, 0.35, 0.35);
  within(ctx, face, () => {
    ctx.fillStyle = k < 2 ? WOOD[2] : m[2];
    ctx.fillRect(-0.4, -0.4, 0.8, 0.8);
    ctx.beginPath();
    ctx.ellipse(-0.035, -0.045, 0.34, 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = k < 2 ? WOOD[0] : mixHex(m[2], m[0], 0.35);
    ctx.fill();
    if (k < 2) seam(ctx, Pp((p) => { for (const x of [-0.13, 0.13]) { p.moveTo(x, -0.4); p.lineTo(x, 0.4); } }), 0.7, WOOD[2]);
    if (k >= 4) {
      // a cross of the class metal behind the boss
      ctx.fillStyle = m[0];
      const a = RRp(-0.4, -0.065, 0.8, 0.13, 0);
      const b = RRp(-0.065, -0.4, 0.13, 0.8, 0);
      ctx.fill(a);
      ctx.fill(b);
      seam(ctx, a, 0.7);
      seam(ctx, b, 0.7);
    }
  });
  seam(ctx, face, 1.0);
  // rivets on the rim from D
  if (k >= 1) {
    ctx.fillStyle = m[2];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 0.41, Math.sin(a) * 0.41, 0.028, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the light along the upper-left of the rim
  ctx.beginPath();
  ctx.arc(0, 0, 0.415, Math.PI * 1.02, Math.PI * 1.42);
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = m[1];
  ctx.stroke();
  const boss = Ep(0, 0, 0.13 + (k >= 4 ? 0.015 : 0), 0.13 + (k >= 4 ? 0.015 : 0));
  chunky(ctx, [[boss, m, 0.04]]);
  gleam(ctx, boss, -0.045, -0.05, 0.04, 0.025, -0.7, m[1]);
  if (k >= 6) chunky(ctx, [[Ep(0, 0, 0.055, 0.055), GEM, 0.015]]);
  shine(ctx, k, t, -0.25, -0.27, 0.14, 0.3, 0.22);
}

// ------------------------------------------------------------------ spear: a wooden shaft with a metal head

function spear(ctx: Ctx, k: number, t: number) {
  const m = METAL[k];
  const g = k < 2 ? 0 : k < 4 ? 1 : 2;
  const w = 0.042;
  const bl = [0.24, 0.27, 0.31][g];
  const by = -1 + bl;
  const bw = [0.085, 0.1, 0.12][g];
  const shaft = RRp(-w, by, w * 2, 0.05 - by, w);
  const head = Pp((p) => {
    p.moveTo(0, -1);
    p.quadraticCurveTo(bw * 1.35, -1 + bl * 0.55, bw * 0.5, by);
    p.lineTo(-bw * 0.5, by);
    p.quadraticCurveTo(-bw * 1.35, -1 + bl * 0.55, 0, -1);
    p.closePath();
  });
  const shapes: Shape[] = [[shaft, WOOD, 0.02]];
  if (g === 2) {
    // two little barbs at the foot of the blade
    for (const d of [-1, 1]) {
      shapes.push([Pp((p) => {
        p.moveTo(d * w, by + 0.04);
        p.quadraticCurveTo(d * 0.17, by + 0.03, d * 0.2, by - 0.1);
        p.quadraticCurveTo(d * 0.1, by - 0.05, d * w, by - 0.04);
        p.closePath();
      }), m, 0]);
    }
  }
  shapes.push([head, m, 0.04], [RRp(-w * 1.9, by - 0.01, w * 3.8, 0.075, 0.03), m, 0]);
  if (k >= 2) shapes.push([RRp(-w * 1.5, -0.03, w * 3, 0.075, 0.03), m, 0]);
  chunky(ctx, shapes);
  gleam(ctx, head, -bw * 0.32, -1 + bl * 0.58, bw * 0.16, bl * 0.28, 0.1, m[1]);
  seam(ctx, Pp((p) => { p.moveTo(0, -0.95); p.lineTo(0, by + 0.02); }), 0.7, m[2]);
  // a grip wrap where the hand holds it, from D
  if (k >= 1) {
    const grip = RRp(-w - 0.006, -0.4, w * 2 + 0.012, 0.18, 0.02);
    ctx.fillStyle = WRAP[0];
    ctx.fill(grip);
    seam(ctx, grip, 0.8);
  }
  shine(ctx, k, t, 0.1, -0.92, 0.11, -0.1, -0.7);
}

/** two colours mixed (k = how much of b) */
export function mixHex(a: string, b: string, k: number) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => {
    const u = (x >> s) & 255;
    const v = (y >> s) & 255;
    return Math.round(u + (v - u) * k)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** the outline for a piece `px` pixels big: chunky like the units, never hair-thin */
export const outlineFor = (px: number) => Math.max(1.5 / px, 0.045);

/**
 * A weapon drawn upright with its grip at the origin and its tip pointing up (-y), len px long.
 * The shield faces the viewer, centred on the origin, len px tall. t animates the sparkle of S and SSS.
 */
export function drawWeapon(ctx: Ctx, type: WeaponType, level: number, len: number, t = 0): void {
  const k = cls(level);
  ctx.save();
  ctx.scale(len, len);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  setOutline(outlineFor(len));
  if (type === 'knife') knife(ctx, k, t);
  else if (type === 'bat') bat(ctx, k, t);
  else if (type === 'shield') shield(ctx, k, t);
  else spear(ctx, k, t);
  ctx.restore();
}
