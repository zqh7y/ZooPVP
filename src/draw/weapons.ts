import type { WeaponType } from '../types';
import { CLASS_FX, COLOR, RAINBOW, TIER } from '../theme';
import { circle, clamp, ellipse, fillStroke, poly, rr, starPath } from '../util';

/*
 * The four weapons, each in seven classes: the same object growing richer, with the class colour as trim.
 * Everything is drawn in a unit box (1 = the weapon's length) so a piece looks the same at any size.
 * The small shared helpers (trim colour, sparkle, glow, flame, rainbow rim) are used by the gear and pets too.
 */
type Ctx = CanvasRenderingContext2D;

const STEEL = '#e8eef5';
const STEEL_SHADE = '#aab4c6';
const WOOD_LIGHT = '#e0a868';

/** class 1..7 as an index 0..6 */
export const cls = (level: number) => clamp(Math.round(level), 1, 7) - 1;

/** The class colour used as trim; an SSS piece runs through the rainbow (i picks where it starts). */
export const trimOf = (k: number, t: number, i = 0) => (k === 6 ? RAINBOW[(i + Math.floor(t * 4)) % 5] : TIER.metal[k]);

/** A four-point twinkle, s px at its largest. */
export function sparkle(ctx: Ctx, x: number, y: number, s: number, t: number, phase = 0) {
  const k = 0.55 + 0.45 * Math.sin(t * 5 + phase);
  starPath(ctx, x, y, s * k, s * k * 0.3, 4);
  ctx.fillStyle = CLASS_FX.spark;
  ctx.fill();
  ctx.lineWidth = s * 0.1;
  ctx.strokeStyle = '#e89a1c';
  ctx.stroke();
}

/** A soft halo without blur: two see-through ovals. */
export function glow(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, t: number) {
  const p = 1 + 0.07 * Math.sin(t * 4);
  const a = ctx.globalAlpha;
  ctx.fillStyle = color;
  ctx.globalAlpha = a * 0.2;
  ellipse(ctx, x, y, rx * p, ry * p);
  ctx.fill();
  ctx.globalAlpha = a * 0.28;
  ellipse(ctx, x, y, rx * 0.7 * p, ry * 0.7 * p);
  ctx.fill();
  ctx.globalAlpha = a;
}

/** A flickering flame standing on (x, y), s tall. lw > 0 outlines it. */
export function flame(ctx: Ctx, x: number, y: number, s: number, t: number, outer = '#ff8a1e', inner = '#ffe066', lw = 0) {
  const w = Math.sin(t * 9 + x * 3) * 0.16 * s;
  for (let i = 0; i < 2; i++) {
    const k = i ? 0.55 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 0.62 * s * k, y - 0.08 * s * k, x - 0.42 * s * k, y - 0.6 * s * k, x + w * k, y - s * k);
    ctx.bezierCurveTo(x + 0.08 * s * k + w * 0.4, y - 0.6 * s * k, x + 0.62 * s * k, y - 0.32 * s * k, x, y);
    ctx.fillStyle = i ? inner : outer;
    ctx.fill();
    if (!i && lw) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = COLOR.ink;
      ctx.stroke();
    }
  }
}

/** Strokes the current path as a moving rainbow (the SSS rim). seg = the length of one colour. */
export function rainbowStroke(ctx: Ctx, lw: number, t: number, seg: number) {
  ctx.lineWidth = lw;
  ctx.setLineDash([seg, seg * 4]);
  for (let i = 0; i < 5; i++) {
    ctx.lineDashOffset = -i * seg - t * seg * 3;
    ctx.strokeStyle = RAINBOW[i];
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ------------------------------------------------------------------ knife: kitchen knife -> legendary tanto

function knife(ctx: Ctx, k: number, t: number, lw: number) {
  const g = k < 2 ? 0 : k < 4 ? 1 : 2;
  const e = [0.18, 0.13, 0.115][g]; // the cutting edge
  const sp = -0.09; // the spine
  const tr = trimOf(k, t);
  if (k >= 5) glow(ctx, 0.02, -0.68, 0.3, 0.42, TIER.metalLight[k], t);
  // handle
  rr(ctx, -0.075, -0.4, 0.15, 0.4, 0.06);
  fillStroke(ctx, g === 0 ? COLOR.wood : g === 1 ? '#5a4664' : '#2f2a45', lw);
  if (g === 0) {
    ctx.fillStyle = tr;
    if (k === 1) ctx.fillRect(-0.075 + lw / 2, -0.3, 0.15 - lw, 0.07);
    circle(ctx, 0, -0.12, 0.028);
    ctx.fill();
    circle(ctx, 0, -0.22 - k * 0.14, 0.028);
    ctx.fill();
  } else {
    ctx.fillStyle = TIER.metalLight[k];
    for (let i = 0; i < 3; i++) {
      poly(ctx, [0, -0.09 - i * 0.1, 0.04, -0.13 - i * 0.1, 0, -0.17 - i * 0.1, -0.04, -0.13 - i * 0.1]);
      ctx.fill();
    }
  }
  // blade
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
  fillStroke(ctx, STEEL, lw);
  ctx.fillStyle = STEEL_SHADE;
  ctx.fillRect(sp + lw * 0.5, -0.8, 0.05, 0.38);
  // the edge: plain steel shine, the class colour from A up
  ctx.lineWidth = 0.034;
  ctx.strokeStyle = k >= 4 ? TIER.metalLight[k] : COLOR.white;
  ctx.beginPath();
  ctx.moveTo(e - 0.045, -0.45);
  ctx.lineTo(e - 0.045, -0.78);
  ctx.stroke();
  if (k === 6) {
    ctx.beginPath();
    ctx.moveTo(e - 0.045, -0.45);
    ctx.lineTo(e - 0.045, -0.8);
    rainbowStroke(ctx, 0.04, t, 0.07);
  }
  // guard and pommel
  if (g === 0) {
    rr(ctx, -0.085, -0.44, 0.17, 0.07, 0.02);
    fillStroke(ctx, TIER.metalLight[0], lw * 0.8);
  } else {
    ellipse(ctx, 0.012, -0.41, 0.15 + 0.012 * k, 0.048);
    fillStroke(ctx, tr, lw);
  }
  if (k >= 3) {
    circle(ctx, 0, -0.02, 0.075);
    fillStroke(ctx, tr, lw);
  }
  if (k >= 4) sparkle(ctx, 0.06, -0.92, k === 6 ? 0.16 : 0.11, t, 1);
}

// ------------------------------------------------------------------ bat: wooden bat -> studded kanabo

function bat(ctx: Ctx, k: number, t: number, lw: number) {
  const bw = 0.115 + k * 0.012; // half the barrel
  const wood = k < 3;
  const body = wood ? WOOD_LIGHT : k === 3 ? '#96643f' : k === 6 ? '#5a45b0' : k === 5 ? '#4b2534' : '#4a4458';
  const shade = wood ? '#b9793f' : k === 3 ? '#6b4227' : k === 6 ? '#3d2c84' : k === 5 ? '#301520' : '#2f2a3a';
  const tr = trimOf(k, t);
  const studs = k < 3 ? 0 : k < 4 ? 2 : k < 6 ? 3 : 4;
  if (k >= 5) glow(ctx, 0, -0.74, 0.34, 0.36, TIER.metalLight[k], t);
  // side studs first, so only their points stick out of the barrel
  for (let i = 0; i < studs; i++) {
    const y = -0.92 + ((i + 0.5) * 0.36) / studs;
    for (const s of [-1, 1]) {
      poly(ctx, [s * (bw - 0.02), y - 0.05, s * (bw + 0.075), y, s * (bw - 0.02), y + 0.05]);
      fillStroke(ctx, trimOf(k, t, i), lw * 0.8);
    }
  }
  if (k >= 5) {
    poly(ctx, [-0.05, -0.97, 0, -1.09, 0.05, -0.97]);
    fillStroke(ctx, tr, lw * 0.8);
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
  fillStroke(ctx, body, lw);
  // one shade down the right, one gloss down the left
  ctx.fillStyle = shade;
  rr(ctx, bw * 0.35, -0.93, bw * 0.5, 0.36, 0.03);
  ctx.fill();
  ctx.fillStyle = wood ? '#f6d29c' : 'rgba(255,255,255,0.3)';
  rr(ctx, -bw * 0.72, -0.92, bw * 0.3, 0.3, 0.02);
  ctx.fill();
  // knob and grip tape
  ellipse(ctx, 0, -0.025, 0.085, 0.045);
  fillStroke(ctx, k >= 3 ? tr : shade, lw);
  if (k >= 1) {
    rr(ctx, -0.058, -0.32, 0.116, 0.22, 0.02);
    fillStroke(ctx, k >= 3 ? TIER.metalLight[k] : tr, lw * 0.8);
  }
  // iron rings from C, stud heads on the face from B
  if (k >= 2) {
    ctx.fillStyle = tr;
    ctx.fillRect(-bw + lw / 2, -0.62, bw * 2 - lw, 0.05);
    if (k >= 4) ctx.fillRect(-bw + lw / 2, -0.955, bw * 2 - lw, 0.04);
  }
  for (let i = 0; i < studs; i++) {
    circle(ctx, i % 2 ? 0.04 : -0.04, -0.9 + ((i + 0.5) * 0.3) / studs, 0.032);
    ctx.fillStyle = trimOf(k, t, i + 2);
    ctx.fill();
  }
  if (k >= 4) sparkle(ctx, -bw - 0.03, -0.9, k === 6 ? 0.16 : 0.11, t, 2);
}

// ------------------------------------------------------------------ shield: wooden lid -> crested war shield

function shieldPath(ctx: Ctx, g: number) {
  if (g === 0) {
    circle(ctx, 0, 0, 0.47);
    return;
  }
  ctx.beginPath();
  if (g === 1) {
    ctx.moveTo(-0.41, -0.42);
    ctx.quadraticCurveTo(0, -0.54, 0.41, -0.42);
  } else {
    ctx.moveTo(-0.45, -0.44);
    ctx.lineTo(-0.2, -0.36);
    ctx.lineTo(0, -0.5);
    ctx.lineTo(0.2, -0.36);
    ctx.lineTo(0.45, -0.44);
  }
  ctx.lineTo(0.41, 0.04);
  ctx.quadraticCurveTo(0.36, 0.36, 0, 0.5);
  ctx.quadraticCurveTo(-0.36, 0.36, -0.41, 0.04);
  ctx.closePath();
}

function shield(ctx: Ctx, k: number, t: number, lw: number) {
  const g = k < 3 ? 0 : k < 5 ? 1 : 2;
  const tr = trimOf(k, t);
  const rim = k === 0 ? COLOR.woodDark : k >= 5 ? COLOR.gold : tr;
  const face = k < 2 ? WOOD_LIGHT : k === 4 ? COLOR.paper : k === 5 ? '#d92447' : k === 6 ? '#fff0ff' : TIER.tile[k];
  if (k >= 5) glow(ctx, 0, 0, 0.6, 0.6, TIER.metalLight[k], t);
  shieldPath(ctx, g);
  fillStroke(ctx, rim, lw);
  if (k === 6) {
    shieldPath(ctx, g);
    rainbowStroke(ctx, 0.07, t, 0.16);
    shieldPath(ctx, g);
    ctx.lineWidth = lw;
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
  }
  ctx.save();
  ctx.scale(0.76, 0.76);
  shieldPath(ctx, g);
  fillStroke(ctx, face, lw * 0.9);
  // one shade on the right half
  ctx.clip();
  ctx.globalAlpha *= 0.14;
  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, -0.7, 0.7, 1.4);
  ctx.restore();
  if (k < 2) {
    // planks and nails
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = COLOR.woodDark;
    for (const x of [-0.13, 0.13]) {
      ctx.beginPath();
      ctx.moveTo(x, -0.32);
      ctx.lineTo(x, 0.32);
      ctx.stroke();
    }
  }
  if (k === 0) {
    // a lid: its handle
    rr(ctx, -0.17, -0.06, 0.34, 0.12, 0.06);
    fillStroke(ctx, COLOR.wood, lw);
  } else if (k < 3) {
    circle(ctx, 0, 0, 0.1 + k * 0.02);
    fillStroke(ctx, k === 1 ? tr : TIER.metalLight[k], lw);
  } else {
    // a five-petal flower as the crest
    const pc = k === 4 ? COLOR.gold : k === 5 ? COLOR.goldLight : tr;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      circle(ctx, Math.cos(a) * 0.12, Math.sin(a) * 0.12 - 0.02, 0.075);
      fillStroke(ctx, k === 6 ? RAINBOW[i] : pc, lw * 0.7);
    }
    circle(ctx, 0, -0.02, 0.055);
    fillStroke(ctx, k >= 5 ? COLOR.white : TIER.metalLight[k], lw * 0.7);
  }
  if (g === 2) {
    // gold studs on the corners
    ctx.fillStyle = COLOR.goldLight;
    for (const x of [-0.33, 0.33]) {
      circle(ctx, x, -0.33, 0.035);
      ctx.fill();
    }
  }
  if (k >= 4) sparkle(ctx, -0.26, -0.26, k === 6 ? 0.2 : 0.14, t, 3);
}

// ------------------------------------------------------------------ spear: bamboo pole -> great yari

function spear(ctx: Ctx, k: number, t: number, lw: number) {
  const w = 0.04 + k * 0.003; // half the shaft
  const bl = 0.25 + k * 0.022; // blade length
  const by = -1 + bl;
  const bw = 0.105 + k * 0.012;
  const tr = trimOf(k, t);
  const shaft = k < 2 ? '#cfd66e' : k === 5 ? '#8c1f33' : k === 6 ? '#f1e9ff' : k === 4 ? '#5a3a2a' : COLOR.wood;
  if (k >= 5) glow(ctx, 0, -0.84, 0.26, 0.3, TIER.metalLight[k], t);
  if (k === 0) {
    // a pole cut to a point
    poly(ctx, [-w, 0, -w, -0.86, w * 0.5, -1, w, -0.8, w, 0]);
    fillStroke(ctx, shaft, lw);
    poly(ctx, [-w, -0.86, w * 0.5, -1, w, -0.8]);
    fillStroke(ctx, '#f3f0c0', lw * 0.7);
  } else {
    rr(ctx, -w, by, w * 2, -by, w);
    fillStroke(ctx, shaft, lw);
  }
  if (k < 2) {
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = '#7f8a2c';
    for (const y of [-0.2, -0.42, -0.64]) {
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  if (k >= 5) {
    // the tassel swings under the collar
    const sw = Math.sin(t * 3) * 0.03;
    const n = k === 6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = i ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(s * w, by + 0.05);
      ctx.quadraticCurveTo(s * 0.2 + sw, by + 0.1, s * 0.13 + sw * 2, by + 0.33);
      ctx.quadraticCurveTo(s * 0.04 + sw, by + 0.2, s * w, by + 0.05);
      fillStroke(ctx, trimOf(k, t, i * 2), lw * 0.8);
    }
  }
  if (k >= 1) {
    if (k >= 4) {
      // side blades
      const s = k === 4 ? 0.7 : 1;
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(d * w, by + 0.01);
        ctx.quadraticCurveTo(d * 0.2 * s, by, d * 0.23 * s, by - 0.15 * s);
        ctx.quadraticCurveTo(d * 0.1 * s, by - 0.07, d * w, by - 0.08);
        ctx.closePath();
        fillStroke(ctx, STEEL, lw * 0.85);
      }
    }
    // the blade: a leaf with a ridge
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.quadraticCurveTo(bw * 1.25, -1 + bl * 0.5, bw * 0.55, by);
    ctx.lineTo(-bw * 0.55, by);
    ctx.quadraticCurveTo(-bw * 1.25, -1 + bl * 0.5, 0, -1);
    ctx.closePath();
    fillStroke(ctx, k === 1 ? '#c8ccd4' : STEEL, lw);
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = k >= 4 ? TIER.metal[k] : STEEL_SHADE;
    ctx.beginPath();
    ctx.moveTo(0, -1 + bl * 0.25);
    ctx.lineTo(0, by);
    ctx.stroke();
    // the collar that binds blade to shaft, and a butt cap
    rr(ctx, -w * 1.7, by - 0.005, w * 3.4, 0.065, 0.02);
    fillStroke(ctx, tr, lw * 0.9);
    if (k >= 2) {
      rr(ctx, -w * 1.4, -0.06, w * 2.8, 0.06, 0.02);
      fillStroke(ctx, tr, lw * 0.9);
    }
    if (k >= 3) {
      ctx.fillStyle = TIER.metalLight[k];
      ctx.fillRect(-w + lw / 2, -0.4, w * 2 - lw, 0.03);
      ctx.fillRect(-w + lw / 2, -0.33, w * 2 - lw, 0.03);
    }
  }
  if (k >= 4) sparkle(ctx, 0.04, -0.93, k === 6 ? 0.16 : 0.1, t, 4);
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
  const lw = Math.max(1.15 / len, 0.05);
  if (type === 'knife') knife(ctx, k, t, lw);
  else if (type === 'bat') bat(ctx, k, t, lw);
  else if (type === 'shield') shield(ctx, k, t, lw);
  else spear(ctx, k, t, lw * 0.9);
  ctx.restore();
}
