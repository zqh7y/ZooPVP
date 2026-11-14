import type { WeaponType } from '../types';
import { CLASS_FX, COLOR, RAINBOW, TIER } from '../theme';
import { circle, clamp, ellipse, fillStroke, poly, rr, starPath } from '../util';

/*
 * The four weapons, each in seven classes: the same object in better materials. One key light from the upper
 * left: every part has a bright upper-left edge and a darker lower-right side. Class shows as metal, not hue:
 * grey steel (E, D, C), silver (B), gold (A), gold with a glow (S), white-gold with a slow glint (SSS).
 * Everything is drawn in a unit box (1 = the weapon's length) so a piece looks the same at any size.
 * The small shared helpers (metal, glow, glint, heat) are used by the gear and the pets too.
 */
type Ctx = CanvasRenderingContext2D;

/** steel: the face, the bright upper-left edge, the darker lower bevel */
export const STEEL = '#c4ccd6';
export const STEEL_HI = '#f3f6f9';
export const STEEL_LO = '#87929f';
/** wood: the face, its lit side, its shade and the grain */
const WOOD = '#a97c52';
const WOOD_HI = '#c99c70';
const WOOD_LO = '#7c5737';
const GRAIN = '#8c6440';
/** leather wraps */
const LEATHER = '#3f3630';
const LEATHER_HI = '#6a5a4e';
/** dark iron (the club from A) */
const IRON = '#3d444e';
const IRON_HI = '#5f6874';
const IRON_LO = '#272c33';

/** class 1..7 as an index 0..6 */
export const cls = (level: number) => clamp(Math.round(level), 1, 7) - 1;

/** The class metal used as trim; an SSS piece slowly shimmers through white-gold (i picks where it starts). */
export const trimOf = (k: number, t: number, i = 0) => (k === 6 ? RAINBOW[(i + Math.floor(t * 1.5)) % RAINBOW.length] : TIER.metal[k]);

/** '#rrggbb' as 'rgba(r,g,b,a)' */
export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Fills the current path with see-through ink: a shade laid over what is there. */
export function shadeFill(ctx: Ctx, a: number) {
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * a;
  ctx.fillStyle = COLOR.ink;
  ctx.fill();
  ctx.globalAlpha = g;
}

/** A metal band of class k: the metal, a light line along its top, a dark one along its bottom. */
export function band(ctx: Ctx, x: number, y: number, w: number, h: number, k: number, t: number, lw: number) {
  rr(ctx, x, y, w, h, Math.min(w, h) * 0.35);
  fillStroke(ctx, trimOf(k, t), lw);
  ctx.fillStyle = TIER.metalLight[k];
  ctx.fillRect(x + lw * 0.5, y + lw * 0.5, w * 0.55, Math.max(h * 0.3, lw * 0.5));
  ctx.fillStyle = TIER.tileDark[k];
  ctx.fillRect(x + w * 0.45, y + h - lw * 0.5 - h * 0.26, w * 0.55 - lw * 0.5, h * 0.26);
}

/** A round metal stud or boss of class k, lit from the upper left. */
export function stud(ctx: Ctx, x: number, y: number, s: number, k: number, t: number, lw: number) {
  circle(ctx, x, y, s);
  fillStroke(ctx, TIER.tileDark[k], lw);
  circle(ctx, x - s * 0.14, y - s * 0.14, s * 0.78);
  ctx.fillStyle = trimOf(k, t);
  ctx.fill();
  circle(ctx, x - s * 0.36, y - s * 0.36, s * 0.26);
  ctx.fillStyle = TIER.metalLight[k];
  ctx.fill();
}

/** A slow four-point glint of white-gold light, s at its largest; dark half the time. */
export function sparkle(ctx: Ctx, x: number, y: number, s: number, t: number, phase = 0) {
  const k = Math.sin(t * 1.9 + phase);
  if (k < 0.15) return;
  const a = s * (k - 0.15) * 1.18;
  starPath(ctx, x, y, a, a * 0.2, 4);
  ctx.fillStyle = CLASS_FX.spark;
  ctx.fill();
}

const GLOWS = new Map<string, HTMLCanvasElement>();
/** A soft halo of light behind a piece (S and SSS): a picture made once per colour, so it costs one copy. */
export function glow(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, t: number) {
  let c = GLOWS.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 0.42));
    gr.addColorStop(0.45, rgba(color, 0.2));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    GLOWS.set(color, c);
  }
  const p = 1 + 0.05 * Math.sin(t * 2.2);
  ctx.drawImage(c, x - rx * p, y - ry * p, rx * 2 * p, ry * 2 * p);
}

/** Heat rising off something hot: n faint gold wavy lines, s tall, standing on (x, y). */
export function heat(ctx: Ctx, x: number, y: number, s: number, t: number, lw: number, n = 2) {
  const a = ctx.globalAlpha;
  ctx.lineWidth = lw;
  ctx.strokeStyle = CLASS_FX.s;
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

/** Clips to the current path and runs draw, for light and shade that must stay inside a shape. */
function inside(ctx: Ctx, draw: () => void) {
  ctx.save();
  ctx.clip();
  draw();
  ctx.restore();
}

// ------------------------------------------------------------------ knife: kitchen knife -> tanto

function knife(ctx: Ctx, k: number, t: number, lw: number) {
  const g = k < 2 ? 0 : k < 4 ? 1 : 2;
  const e = [0.15, 0.12, 0.11][g]; // the cutting edge
  const sp = -0.085; // the spine
  if (k >= 5) glow(ctx, 0.02, -0.66, 0.34, 0.46, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // the handle: wood with rivets, then a leather wrap
  rr(ctx, -0.07, -0.4, 0.14, 0.4, 0.05);
  fillStroke(ctx, k < 2 ? WOOD : LEATHER, lw);
  ctx.fillStyle = k < 2 ? WOOD_HI : LEATHER_HI;
  ctx.fillRect(-0.07 + lw * 0.5, -0.38, 0.035, 0.34);
  if (k < 2) {
    ctx.fillStyle = STEEL;
    circle(ctx, 0, -0.12, 0.024);
    ctx.fill();
    circle(ctx, 0, -0.27, 0.024);
    ctx.fill();
  } else {
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = LEATHER_HI;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-0.06, -0.06 - i * 0.08);
      ctx.lineTo(0.06, -0.11 - i * 0.08);
    }
    ctx.stroke();
  }
  // the blade
  ctx.beginPath();
  ctx.moveTo(sp, -0.4);
  if (g === 0) {
    ctx.lineTo(sp, -0.9);
    ctx.quadraticCurveTo(sp + 0.01, -1, sp + 0.08, -0.985);
    ctx.quadraticCurveTo(e + 0.05, -0.8, e, -0.4);
  } else if (g === 1) {
    ctx.lineTo(sp, -0.8);
    ctx.lineTo(sp + 0.06, -1);
    ctx.quadraticCurveTo(e + 0.03, -0.86, e, -0.4);
  } else {
    ctx.lineTo(sp, -0.87);
    ctx.lineTo(sp + 0.08, -1);
    ctx.lineTo(e, -0.82);
    ctx.lineTo(e, -0.4);
  }
  ctx.closePath();
  ctx.fillStyle = STEEL;
  ctx.fill();
  inside(ctx, () => {
    // the bevel toward the edge is darker, the flat by the spine catches the light
    ctx.fillStyle = STEEL_LO;
    ctx.fillRect(e - 0.075, -1.05, 0.2, 0.7);
    ctx.fillStyle = STEEL_HI;
    ctx.fillRect(sp - 0.02, -1.05, 0.055, 0.7);
    if (k >= 4) {
      // a hamon line in the class metal
      ctx.fillStyle = TIER.metalLight[k];
      ctx.fillRect(e - 0.085, -0.9, 0.018, 0.5);
    }
  });
  ctx.lineWidth = lw;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  // guard and pommel in the class metal
  if (g === 0) band(ctx, -0.085, -0.445, 0.17, 0.065, k, t, lw * 0.8);
  else {
    ellipse(ctx, 0.012, -0.41, 0.14 + 0.01 * k, 0.045);
    fillStroke(ctx, trimOf(k, t), lw);
    ellipse(ctx, -0.02, -0.425, 0.08, 0.014);
    ctx.fillStyle = TIER.metalLight[k];
    ctx.fill();
  }
  if (k >= 3) stud(ctx, 0, -0.02, 0.065, k, t, lw);
  if (k === 6) sparkle(ctx, 0.0, -0.84, 0.15, t, 1);
}

// ------------------------------------------------------------------ bat: wooden bat -> iron club

function bat(ctx: Ctx, k: number, t: number, lw: number) {
  const bw = 0.115 + k * 0.01; // half the barrel
  const wood = k < 4;
  const studs = k < 3 ? 0 : k < 4 ? 2 : k < 6 ? 3 : 4;
  if (k >= 5) glow(ctx, 0, -0.72, 0.36, 0.42, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // side studs first, so only their points stick out of the barrel
  for (let i = 0; i < studs; i++) {
    const y = -0.92 + ((i + 0.5) * 0.36) / studs;
    for (const s of [-1, 1]) {
      poly(ctx, [s * (bw - 0.02), y - 0.045, s * (bw + 0.065), y, s * (bw - 0.02), y + 0.045]);
      fillStroke(ctx, s < 0 ? TIER.metalLight[k] : trimOf(k, t, i), lw * 0.8);
    }
  }
  ctx.beginPath();
  ctx.moveTo(-0.05, -0.02);
  ctx.lineTo(-0.05, -0.34);
  ctx.bezierCurveTo(-0.055, -0.5, -bw, -0.5, -bw, -0.68);
  ctx.lineTo(-bw, -0.9);
  ctx.quadraticCurveTo(-bw, -1, 0, -1);
  ctx.quadraticCurveTo(bw, -1, bw, -0.9);
  ctx.lineTo(bw, -0.68);
  ctx.bezierCurveTo(bw, -0.5, 0.055, -0.5, 0.05, -0.34);
  ctx.lineTo(0.05, -0.02);
  ctx.closePath();
  ctx.fillStyle = wood ? WOOD : IRON;
  ctx.fill();
  inside(ctx, () => {
    // a round barrel: shade down the right, a lit strip down the left, grain along the wood
    ctx.fillStyle = wood ? WOOD_LO : IRON_LO;
    ctx.fillRect(bw * 0.3, -1.05, bw, 1.05);
    ctx.fillStyle = wood ? WOOD_HI : IRON_HI;
    ctx.fillRect(-bw * 0.62, -1.05, bw * 0.28, 1.0);
    if (wood) {
      ctx.lineWidth = lw * 0.4;
      ctx.strokeStyle = GRAIN;
      ctx.beginPath();
      ctx.moveTo(bw * 0.1, -0.56);
      ctx.quadraticCurveTo(bw * 0.2, -0.75, bw * 0.05, -0.93);
      ctx.stroke();
    }
  });
  ctx.lineWidth = lw;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  // knob and grip
  ellipse(ctx, 0, -0.025, 0.08, 0.042);
  fillStroke(ctx, k >= 3 ? trimOf(k, t) : WOOD_LO, lw);
  if (k >= 1) {
    rr(ctx, -0.056, -0.31, 0.112, 0.24, 0.02);
    fillStroke(ctx, LEATHER, lw * 0.8);
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = LEATHER_HI;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-0.05, -0.09 - i * 0.055);
      ctx.lineTo(0.05, -0.12 - i * 0.055);
    }
    ctx.stroke();
  }
  // metal rings from C, stud heads on the face from B
  if (k >= 2) band(ctx, -bw - 0.005, -0.635, bw * 2 + 0.01, 0.05, k, t, lw * 0.8);
  if (k >= 4) band(ctx, -bw - 0.005, -0.965, bw * 2 + 0.01, 0.045, k, t, lw * 0.8);
  for (let i = 0; i < studs; i++) stud(ctx, i % 2 ? 0.035 : -0.035, -0.88 + ((i + 0.5) * 0.24) / studs, 0.03, k, t, lw * 0.6);
  if (k === 6) sparkle(ctx, -bw * 0.4, -0.82, 0.16, t, 2);
}

// ------------------------------------------------------------------ shield: a round shield with a boss

function shield(ctx: Ctx, k: number, t: number, lw: number) {
  const R = 0.47;
  const fr = 0.38; // the face inside the rim
  const wood = k < 3;
  const face = wood ? WOOD : k === 3 ? TIER.metal[3] : k === 4 ? IRON : TIER.tile[k];
  const faceLo = wood ? WOOD_LO : k === 3 ? TIER.tile[3] : k === 4 ? IRON_LO : TIER.tileDark[k];
  const faceHi = wood ? WOOD_HI : k === 4 ? IRON_HI : TIER.metalLight[k];
  if (k >= 5) glow(ctx, 0, 0, 0.66, 0.66, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // the rim: a ring of the class metal, lit on the upper left
  circle(ctx, 0, 0, R);
  fillStroke(ctx, TIER.tileDark[k], lw);
  ctx.beginPath();
  ctx.arc(-0.02, -0.02, R - lw * 0.5 - 0.015, 0, Math.PI * 2);
  ctx.fillStyle = trimOf(k, t);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, R - 0.035, Math.PI * 0.95, Math.PI * 1.55);
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = TIER.metalLight[k];
  ctx.stroke();
  // the face: its shade falls to the lower right
  circle(ctx, 0, 0, fr);
  ctx.fillStyle = faceLo;
  ctx.fill();
  inside(ctx, () => {
    circle(ctx, -0.045, -0.05, fr * 0.95);
    ctx.fillStyle = face;
    ctx.fill();
    if (wood) {
      // planks
      ctx.lineWidth = lw * 0.6;
      ctx.strokeStyle = GRAIN;
      ctx.beginPath();
      for (const x of [-0.14, 0.12]) {
        ctx.moveTo(x, -0.4);
        ctx.lineTo(x, 0.4);
      }
      ctx.stroke();
    } else if (k === 3) {
      // brushed steel: fine lines across
      ctx.lineWidth = 0.012;
      ctx.strokeStyle = TIER.metalLight[3];
      ctx.beginPath();
      for (let i = -3; i <= 3; i++) {
        ctx.moveTo(-0.36, i * 0.09 - 0.02);
        ctx.lineTo(0.2, i * 0.09 - 0.05);
      }
      ctx.stroke();
    }
    // a soft sheen on the upper left
    ellipse(ctx, -0.17, -0.19, 0.13, 0.06, -0.75);
    ctx.fillStyle = faceHi;
    ctx.fill();
  });
  circle(ctx, 0, 0, fr);
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  // rivets round the rim from D
  if (k >= 1) {
    ctx.fillStyle = TIER.metalLight[k];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + 0.5;
      circle(ctx, Math.cos(a) * 0.425, Math.sin(a) * 0.425, 0.018);
      ctx.fill();
    }
  }
  // the raised boss: a contact shadow to the lower right, then the dome catching the light
  circle(ctx, 0.03, 0.035, 0.14);
  shadeFill(ctx, 0.3);
  stud(ctx, 0, 0, 0.125 + (k >= 4 ? 0.015 : 0), wood ? Math.max(k, 1) : k, t, lw);
  if (k === 6) sparkle(ctx, -0.2, -0.22, 0.2, t, 3);
}

// ------------------------------------------------------------------ spear: sharpened pole -> long yari

function spear(ctx: Ctx, k: number, t: number, lw: number) {
  const w = 0.038 + k * 0.003; // half the shaft
  const bl = 0.25 + k * 0.02; // blade length
  const by = -1 + bl;
  const bw = 0.1 + k * 0.01;
  if (k >= 5) glow(ctx, 0, -0.84, 0.28, 0.32, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // the shaft
  if (k === 0) poly(ctx, [-w, 0, -w, -0.86, w * 0.4, -1, w, -0.84, w, 0]);
  else rr(ctx, -w, by, w * 2, -by, w);
  ctx.fillStyle = k >= 4 ? IRON : WOOD;
  ctx.fill();
  inside(ctx, () => {
    ctx.fillStyle = k >= 4 ? IRON_LO : WOOD_LO;
    ctx.fillRect(w * 0.2, -1.05, w, 1.1);
    ctx.fillStyle = k >= 4 ? IRON_HI : WOOD_HI;
    ctx.fillRect(-w * 0.7, -1.05, w * 0.45, 1.1);
    if (k === 0) {
      // the fire-hardened point
      poly(ctx, [-w, -0.84, w * 0.4, -1, w, -0.8]);
      ctx.fillStyle = WOOD_LO;
      ctx.fill();
    }
  });
  ctx.lineWidth = lw;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  if (k >= 5) {
    // the tassel swings under the collar
    const sw = Math.sin(t * 2.6) * 0.03;
    ctx.beginPath();
    ctx.moveTo(w, by + 0.05);
    ctx.quadraticCurveTo(0.18 + sw, by + 0.1, 0.12 + sw * 2, by + 0.3);
    ctx.quadraticCurveTo(0.03 + sw, by + 0.18, -w, by + 0.05);
    fillStroke(ctx, trimOf(k, t, 1), lw * 0.8);
  }
  if (k >= 1) {
    if (k >= 4) {
      // side blades
      const s = k === 4 ? 0.7 : 1;
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(d * w, by + 0.01);
        ctx.quadraticCurveTo(d * 0.19 * s, by, d * 0.22 * s, by - 0.14 * s);
        ctx.quadraticCurveTo(d * 0.1 * s, by - 0.07, d * w, by - 0.08);
        ctx.closePath();
        fillStroke(ctx, d < 0 ? STEEL_HI : STEEL_LO, lw * 0.8);
      }
    }
    // the blade: a leaf with a ridge, its left face lit and its right face in shade
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.quadraticCurveTo(bw * 1.25, -1 + bl * 0.5, bw * 0.55, by);
    ctx.lineTo(-bw * 0.55, by);
    ctx.quadraticCurveTo(-bw * 1.25, -1 + bl * 0.5, 0, -1);
    ctx.closePath();
    ctx.fillStyle = STEEL;
    ctx.fill();
    inside(ctx, () => {
      ctx.fillStyle = STEEL_LO;
      ctx.fillRect(0, -1.02, bw * 1.5, bl + 0.04);
      ctx.fillStyle = STEEL_HI;
      ctx.fillRect(-bw * 0.62, -1.02, bw * 0.3, bl + 0.04);
    });
    ctx.lineWidth = lw;
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
    // the collar that binds blade to shaft, and a butt cap
    band(ctx, -w * 1.7, by - 0.005, w * 3.4, 0.06, k, t, lw * 0.8);
    if (k >= 2) band(ctx, -w * 1.4, -0.055, w * 2.8, 0.055, k, t, lw * 0.8);
    if (k >= 3) band(ctx, -w * 1.15, -0.4, w * 2.3, 0.035, k, t, lw * 0.6);
  }
  if (k === 6) sparkle(ctx, -0.02, -0.9, 0.16, t, 4);
}

/**
 * A weapon drawn upright with its grip at the origin and its tip pointing up (-y), len px long.
 * The shield faces the viewer, centred on the origin, len px tall. t animates the shine of high classes.
 */
export function drawWeapon(ctx: Ctx, type: WeaponType, level: number, len: number, t = 0): void {
  const k = cls(level);
  ctx.save();
  ctx.scale(len, len);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const lw = Math.max(0.8 / len, 0.035);
  if (type === 'knife') knife(ctx, k, t, lw);
  else if (type === 'bat') bat(ctx, k, t, lw);
  else if (type === 'shield') shield(ctx, k, t, lw);
  else spear(ctx, k, t, lw * 0.9);
  ctx.restore();
}
