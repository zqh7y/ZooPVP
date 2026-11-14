import { H, RAINBOW, S, TEAM, TYPE, UI, W } from '../theme';
import { CLASSES } from '../data';
import { clamp, font, label, poly, rr, textWidth, type Ctx, type FontWeight, type Rect } from '../util';
import { iconTint, trophy } from './icons';

/*
 * The interface kit: a match-day scoreboard. Flat slate surfaces, thin borders, small radii, one accent.
 * Every screen draws its interface with these, so the look lives here and in theme UI.
 */

/** An icon drawer: centre x, y and a box size. */
export type IconFn = (ctx: Ctx, x: number, y: number, size: number) => void;

/** Fill the current path, then give it a thin border. */
function surface(ctx: Ctx, fill: string | CanvasGradient, border?: string | CanvasGradient, lw: number = S.line.thin) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (!border) return;
  ctx.lineWidth = lw;
  ctx.strokeStyle = border;
  ctx.stroke();
}

// ------------------------------------------------------------------ text

/** Plain interface text: off-white, no outline. */
export function inkText(ctx: Ctx, s: string, x: number, y: number, size: number, o: { color?: string; align?: CanvasTextAlign; weight?: FontWeight; track?: number } = {}) {
  label(ctx, s, x, y, size, o);
}

/** A label that shrinks (down to 55%) to fit a width. */
export function fitLabel(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  maxW: number,
  o: { color?: string | CanvasGradient; align?: CanvasTextAlign; outline?: string; lw?: number; weight?: FontWeight; track?: number; onPitch?: boolean } = {},
) {
  const wide = textWidth(ctx, s, size, o.weight, o.track);
  const k = wide > maxW ? Math.max(0.55, maxW / wide) : 1;
  label(ctx, s, x, y, size * k, o.track !== undefined ? { ...o, track: o.track * k } : o);
}

/** 1234 -> 1.2K, 1500000 -> 1.5M. */
export function shortNumber(n: number) {
  const a = Math.abs(n);
  if (a < 10000) return String(Math.round(n));
  const f = (v: number, u: string) => `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${u}`;
  if (a < 1e6) return f(n / 1e3, 'K');
  if (a < 1e9) return f(n / 1e6, 'M');
  return f(n / 1e9, 'B');
}

// ------------------------------------------------------------------ buttons and pills

/** primary: the screen's one main action, in the accent. Every other variant is neutral; danger is a warning state. */
export type ButtonVariant = 'primary' | 'roll' | 'secondary' | 'quiet' | 'danger';
const VARIANT = {
  primary: { fill: UI.accent, press: UI.accentDim, border: '', text: UI.accentText },
  roll: { fill: UI.surfaceAlt, press: UI.surface, border: UI.borderStrong, text: UI.text },
  secondary: { fill: UI.surfaceAlt, press: UI.surface, border: UI.border, text: UI.text },
  quiet: { fill: UI.surface, press: UI.bg, border: UI.border, text: UI.textDim },
  danger: { fill: UI.danger, press: UI.danger, border: '', text: UI.text },
};

export interface ButtonOpts {
  variant?: ButtonVariant;
  text?: string;
  /** a small second line under the text */
  sub?: string;
  icon?: IconFn;
  pressed?: boolean;
  disabled?: boolean;
  /** a count in the top-right corner */
  badge?: number | string;
  /** 0..1, a ring that tells the player to press this */
  pulse?: number;
}

/** A flat button: solid fill, thin border, uppercase label. Pressed darkens. Returns the face's centre y. */
export function button(ctx: Ctx, r: Rect, o: ButtonOpts = {}) {
  const v = o.disabled ? { fill: UI.surface, press: UI.surface, border: UI.border, text: UI.textMute } : VARIANT[o.variant ?? 'primary'];
  const rad = S.radius.m;
  const down = !!o.pressed && !o.disabled;
  if (o.pulse && !o.disabled) {
    const k = clamp(o.pulse, 0, 1);
    rr(ctx, r.x - 2 - 5 * k, r.y - 2 - 5 * k, r.w + 4 + 10 * k, r.h + 4 + 10 * k, rad + 2 + 5 * k);
    ctx.lineWidth = S.line.ui;
    ctx.globalAlpha *= 1 - k;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    ctx.globalAlpha /= 1 - k || 1;
  }
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  surface(ctx, down ? v.press : v.fill, v.border || undefined, S.line.ui);
  const cy = r.y + r.h / 2 + (down ? 1 : 0);
  const big = r.h >= S.btnH - 8;
  const size = big ? TYPE.h1 - 4 : r.h >= 44 ? TYPE.body + 3 : TYPE.body - 2;
  const weight: FontWeight = big ? 700 : 600;
  const track = size * 0.07;
  const ty = o.sub ? cy - size * 0.24 : cy;
  const iconSize = Math.min(r.h - 22, size * 0.95);
  const gap = Math.round(size * 0.36);
  const pad = 14;
  const text = o.text?.toUpperCase();
  iconTint(v.text);
  if (o.icon && text) {
    const tw = Math.min(textWidth(ctx, text, size, weight, track), r.w - pad * 2 - iconSize - gap);
    const x0 = r.x + (r.w - (iconSize + gap + tw)) / 2;
    o.icon(ctx, x0 + iconSize / 2, cy, iconSize);
    fitLabel(ctx, text, x0 + iconSize + gap, ty + 1, size, tw, { align: 'left', color: v.text, weight, track });
  } else if (o.icon) o.icon(ctx, r.x + r.w / 2, cy, iconSize * 1.15);
  else if (text) fitLabel(ctx, text, r.x + r.w / 2, ty + 1, size, r.w - pad * 2, { color: v.text, weight, track });
  iconTint(null);
  if (o.sub) {
    ctx.save();
    ctx.globalAlpha *= 0.7;
    fitLabel(ctx, o.sub.toUpperCase(), r.x + r.w / 2, cy + size * 0.58, TYPE.small - 2, r.w - pad * 2, { color: v.text, track: 1 });
    ctx.restore();
  }
  if (o.badge !== undefined && o.badge !== 0) {
    const s = String(o.badge);
    const bw = Math.max(24, 14 + textWidth(ctx, s, TYPE.small + 1, 700));
    const bx = r.x + r.w - bw + 6;
    rr(ctx, bx, r.y - 8, bw, 22, S.radius.s);
    const onAccent = !o.disabled && (o.variant ?? 'primary') === 'primary';
    surface(ctx, o.disabled ? UI.borderStrong : onAccent ? UI.text : UI.accent, UI.bg, 2);
    label(ctx, s, bx + bw / 2, r.y + 4, TYPE.small + 1, { color: UI.accentText, weight: 700 });
  }
  return cy;
}

export interface PillOpts {
  icon?: IconFn;
  text: string;
  /** 0..1, a flash on the value when it changes */
  flash?: number;
}

/**
 * A stat chip: slate plate, a glyph at the left, the value beside it. "POWER 3314" is drawn as a dim caption
 * and a bright number.
 */
export function pill(ctx: Ctx, r: Rect, o: PillOpts) {
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.m);
  surface(ctx, UI.surface, UI.border);
  const bump = clamp(o.flash ?? 0, 0, 1);
  if (bump > 0) {
    rr(ctx, r.x, r.y, r.w, r.h, S.radius.m);
    ctx.lineWidth = S.line.ui;
    ctx.globalAlpha *= bump;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    ctx.globalAlpha /= bump;
  }
  const cy = r.y + r.h / 2;
  const pad = Math.min(14, r.h * 0.3);
  const size = Math.min(TYPE.body + 3, r.h * 0.5);
  const color = bump > 0.4 ? UI.accent : UI.text;
  const cap = /^([A-Za-z ]+) ([\d.,]+[KMB]?)$/.exec(o.text);
  const iconSize = o.icon ? Math.min(r.h - 22, 26) : 0;
  let x0 = r.x + pad;
  if (o.icon) {
    o.icon(ctx, x0 + iconSize / 2, cy, iconSize);
    x0 += iconSize + 9;
  }
  const room = r.x + r.w - pad - x0;
  if (cap) {
    const cs = TYPE.small;
    const cw = textWidth(ctx, cap[1].toUpperCase(), cs, 600, 1.5);
    const vw = textWidth(ctx, cap[2], size, 700);
    const total = cw + 8 + vw;
    const k = Math.min(1, room / total);
    const sx = o.icon ? x0 : r.x + (r.w - total * k) / 2;
    label(ctx, cap[1].toUpperCase(), sx, cy + 1, cs * k, { align: 'left', color: UI.textDim, track: 1.5 * k });
    label(ctx, cap[2], sx + (cw + 8) * k, cy + 1, size * k, { align: 'left', color, weight: 700 });
  } else if (o.icon) fitLabel(ctx, o.text, x0, cy + 1, size, room, { align: 'left', color, weight: 700 });
  else fitLabel(ctx, o.text, r.x + r.w / 2, cy + 1, size, r.w - pad * 2, { color, weight: 700 });
}

// ------------------------------------------------------------------ panels and cells

/** A flat panel with a thin border; 'dark' is see-through slate for panels over the pitch. A title sits on the top edge. */
export function panel(ctx: Ctx, r: Rect, o: { title?: string; tone?: 'paper' | 'dark' } = {}) {
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.l);
  surface(ctx, o.tone === 'dark' ? UI.glass : UI.surface, UI.border);
  if (o.title) {
    const s = o.title.toUpperCase();
    const w = Math.min(r.w - 40, textWidth(ctx, s, TYPE.small, 600, 2) + 28);
    rr(ctx, r.x + r.w / 2 - w / 2, r.y - 13, w, 26, S.radius.s);
    surface(ctx, UI.surfaceAlt, UI.border);
    fitLabel(ctx, s, r.x + r.w / 2, r.y + 1, TYPE.small, w - 16, { color: UI.textDim, track: 2 });
  }
}

/** The slate inset the grid and the bench sit in. */
export function gridFrame(ctx: Ctx, r: Rect) {
  rr(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, S.radius.l);
  surface(ctx, UI.surface, UI.border);
}

/** One grid slot. */
export function cell(ctx: Ctx, r: Rect, state: 'empty' | 'ok' | 'bad' | 'fuse' = 'empty') {
  rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, S.radius.s);
  ctx.fillStyle = UI.bg;
  ctx.fill();
  if (state === 'empty') return;
  const c = state === 'ok' ? UI.ok : state === 'bad' ? UI.danger : UI.accent;
  ctx.globalAlpha *= 0.2;
  ctx.fillStyle = c;
  ctx.fill();
  ctx.globalAlpha /= 0.2;
  ctx.lineWidth = S.line.ui;
  ctx.strokeStyle = c;
  ctx.stroke();
}

/** A dim layer over the whole screen behind a panel. */
export function veil(ctx: Ctx, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha, 0, 1);
  ctx.fillStyle = UI.scrim;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ------------------------------------------------------------------ classes

/** Moving rainbow gradient (SSS). */
export function rainbow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const n = RAINBOW.length;
  const sh = (((t * 0.6) % 1) + 1) % 1;
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const c = Math.floor(((u + sh) % 1) * n);
    g.addColorStop(u, RAINBOW[c % n]);
  }
  return g;
}

/** Text colour for a class (level 1..7), readable on slate; SSS cycles hue slowly. */
export function classColor(level: number, t: number) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  return i === 6 ? `hsl(${(t * 60) % 360}, 85%, 76%)` : UI.tierText[i];
}

/**
 * The tile a piece sits on (level 1..7 = E..SSS): the same dark tile for every class, with the class as a
 * thin border. SSS has a rainbow border.
 */
export function tileFrame(ctx: Ctx, r: Rect, level: number, o: { idle?: boolean; lifted?: boolean; t?: number } = {}) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const y = r.y - (o.lifted ? 4 : 0);
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.5;
  rr(ctx, r.x + 1.5, y + 1.5, r.w - 3, r.h - 3, S.radius.m);
  surface(ctx, o.lifted ? UI.tileHi : UI.tile, i === 6 ? rainbow(ctx, r.x, y, r.x + r.w, y + r.h, (o.t ?? 0) * 0.5) : UI.tier[i], i >= 5 ? 2 : S.line.ui);
  ctx.restore();
}

/** What the high classes add over a tile: a slow sheen for A and better, and a restrained glow for S and SSS. */
export function classFx(ctx: Ctx, r: Rect, level: number, t: number) {
  const lv = Math.round(level);
  if (lv < 5) return;
  const rad = S.radius.m;
  ctx.save();
  if (lv >= 6) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    rr(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, rad + 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = lv >= 7 ? rainbow(ctx, r.x, r.y, r.x + r.w, r.y + r.h, t * 0.5) : UI.tier[5];
    ctx.globalAlpha *= 0.14 + 0.14 * pulse;
    ctx.stroke();
  }
  ctx.restore();
  // the sheen: one soft band crossing the tile now and then
  const period = lv === 5 ? 4.5 : lv === 6 ? 3.6 : 2.8;
  const u = (t / period) % 1;
  if (u > 0.4) return;
  ctx.save();
  rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, rad);
  ctx.clip();
  const sw = (u / 0.4) * (r.w + r.h + 30) - 15;
  ctx.globalAlpha *= lv === 5 ? 0.1 : 0.14;
  ctx.fillStyle = '#ffffff';
  poly(ctx, [r.x + sw, r.y, r.x + sw + 14, r.y, r.x + sw + 14 - r.h, r.y + r.h, r.x + sw - r.h, r.y + r.h]);
  ctx.fill();
  ctx.restore();
}

/** Class letter on a small dark chip, in the class colour. Left edge at x, centred on y; k scales it. */
export function classBadge(ctx: Ctx, level: number, x: number, y: number, k: number, t = 0) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const letter = CLASSES[i];
  const h = 17 * k;
  const w = letter.length > 1 ? 30 * k : 17 * k;
  rr(ctx, x, y - h / 2, w, h, 3 * k);
  ctx.fillStyle = UI.bg;
  ctx.fill();
  const color = i === 6 ? rainbow(ctx, x, y, x + w, y, t * 0.5) : UI.tierText[i];
  label(ctx, letter, x + w / 2, y + 0.8 * k, 13 * k, { color, weight: 700, track: letter.length > 1 ? 0.6 * k : 0 });
}

/** "x4" on a small dark chip, centred on x, y. */
export function countBadge(ctx: Ctx, count: number, x: number, y: number, k = 1) {
  const s = `×${count}`;
  const size = TYPE.small * k;
  const w = textWidth(ctx, s, size, 700, 0) + 9 * k;
  const h = 17 * k;
  rr(ctx, x - w / 2, y - h / 2, w, h, 3 * k);
  ctx.fillStyle = UI.bg;
  ctx.fill();
  label(ctx, s, x, y + 0.8 * k, size, { color: UI.text, weight: 700, track: 0 });
}

// ------------------------------------------------------------------ battle bars

/** The opponent's or your own name plate: a team bar on the outer edge, the name, the trophies. The opponent's always shows a BOT tag. */
export function namePlate(ctx: Ctx, r: Rect, o: { name: string; trophies: number; team: 0 | 1; bot?: boolean; align?: 'left' | 'right' }) {
  const right = o.align === 'right';
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.m);
  surface(ctx, UI.glass, UI.border);
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.m);
  ctx.clip();
  ctx.fillStyle = TEAM[o.team].main;
  ctx.fillRect(right ? r.x + r.w - 4 : r.x, r.y, 4, r.h);
  ctx.restore();
  const pad = 16;
  const dir = right ? -1 : 1;
  const ax = right ? r.x + r.w - pad : r.x + pad;
  const al: CanvasTextAlign = right ? 'right' : 'left';
  const tag = o.bot ? 36 : 0;
  const mid = r.y + r.h / 2;
  const two = r.h > 44;
  const nameY = two ? mid - 10 : mid;
  const size = TYPE.body + 2;
  fitLabel(ctx, o.name, ax, nameY + 1, size, r.w - pad * 2 - (tag ? tag + 8 : 0), { align: al, weight: 700 });
  if (two) {
    trophy(ctx, ax + dir * 7, mid + 13, 15);
    label(ctx, shortNumber(o.trophies), ax + dir * 20, mid + 14, TYPE.small + 1, { align: al, color: UI.textDim });
  }
  if (o.bot) {
    // the tag sits on the name's line, at the end away from the name, so it never covers it
    const bx = right ? r.x + pad - 4 : r.x + r.w - pad - tag + 4;
    rr(ctx, bx, nameY - 9, tag, 19, S.radius.s);
    ctx.fillStyle = UI.borderStrong;
    ctx.fill();
    label(ctx, 'BOT', bx + tag / 2, nameY + 1.5, TYPE.small - 1, { weight: 700, track: 1.5 });
  }
}

/** A plain fill bar, 0..1. */
export function progressBar(ctx: Ctx, r: Rect, value: number, o: { color?: string; light?: string; back?: string } = {}) {
  const v = clamp(value, 0, 1);
  const rad = Math.min(3, r.h / 2);
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = o.back ?? UI.track;
  ctx.fill();
  if (v <= 0.001) return;
  ctx.save();
  ctx.clip();
  ctx.fillStyle = o.color ?? UI.ok;
  ctx.fillRect(r.x, r.y, r.w * v, r.h);
  ctx.restore();
}

/** Tug-of-war health: blue grows from the left, red from the right, a white marker at the seam. */
export function tugBar(ctx: Ctx, r: Rect, share0: number, share1: number, _t: number) {
  const tot = Math.max(1e-6, share0 + share1);
  const f = clamp(share0 / tot, 0.04, 0.96);
  const sx = Math.round(r.x + r.w * f);
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, 3);
  ctx.clip();
  ctx.fillStyle = TEAM[0].main;
  ctx.fillRect(r.x, r.y, sx - r.x, r.h);
  ctx.fillStyle = TEAM[1].main;
  ctx.fillRect(sx, r.y, r.x + r.w - sx, r.h);
  ctx.restore();
  ctx.fillStyle = UI.bg;
  ctx.fillRect(sx - 3, r.y - 3, 6, r.h + 6);
  ctx.fillStyle = UI.text;
  ctx.fillRect(sx - 1, r.y - 3, 2, r.h + 6);
}

/** A segmented meter (the roll meter). value 0..1; `ticks` equal segments; the accent when full. */
export function meter(ctx: Ctx, r: Rect, value: number, o: { ticks?: number; color?: string; full?: boolean } = {}) {
  const n = Math.max(1, o.ticks ?? 5);
  const gap = 3;
  const w = (r.w - gap * (n - 1)) / n;
  const v = clamp(value, 0, 1) * n;
  for (let i = 0; i < n; i++) {
    const x = r.x + i * (w + gap);
    rr(ctx, x, r.y, w, r.h, 2);
    ctx.fillStyle = UI.track;
    ctx.fill();
    const part = clamp(v - i, 0, 1);
    if (part <= 0.001) continue;
    ctx.save();
    ctx.clip();
    ctx.fillStyle = o.full ? UI.accent : (o.color ?? UI.text);
    ctx.fillRect(x, r.y, w * part, r.h);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ banners, toasts, hints

/**
 * A title slab (VICTORY, DEFEAT, FIGHT!, +1 ROLL): a flat dark plate with a thin rule under big letters.
 * gold and jade are the accent (a win, a reward); red and indigo stay neutral.
 */
export function ribbon(ctx: Ctx, cx: number, cy: number, w: number, text: string, o: { color?: 'red' | 'gold' | 'indigo' | 'jade'; size?: number } = {}) {
  const tone = o.color ?? 'red';
  const hot = tone === 'gold' || tone === 'jade';
  const size = o.size ?? TYPE.title;
  const h = Math.round(size * 1.3);
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  ctx.save();
  rr(ctx, x0, y0, w, h, S.radius.s);
  ctx.fillStyle = UI.glass;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = hot ? UI.accent : tone === 'red' ? UI.text : UI.textDim;
  ctx.fillRect(x0, y0 + h - 3, w, 3);
  ctx.restore();
  fitLabel(ctx, text.toUpperCase(), cx, cy + 1, size, w - 32, { color: hot ? UI.accent : UI.text, weight: 700, track: size * 0.06 });
}

/** A floating line of text that rises and fades; age in seconds (about 0..1.4). */
export function toast(ctx: Ctx, text: string, x: number, y: number, age: number) {
  const a = age < 0.15 ? age / 0.15 : clamp(1 - (age - 0.9) / 0.5, 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  label(ctx, text, x, y - age * 30, TYPE.h2 - 3, { color: UI.accent, weight: 700, onPitch: true });
  ctx.restore();
}

/** A callout inside rect r with a small arrow toward (pointAt.x, pointAt.y), and a marker bobbing at the target. */
export function hint(ctx: Ctx, r: Rect, text: string, pointAt: { x: number; y: number }, t = 0) {
  const below = pointAt.y > r.y + r.h / 2;
  const dir = below ? 1 : -1;
  const tipX = clamp(pointAt.x, r.x + 24, r.x + r.w - 24);
  const ty = below ? r.y + r.h : r.y;
  ctx.fillStyle = UI.text;
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.m);
  ctx.fill();
  poly(ctx, [tipX - 9, ty - dir, tipX + 9, ty - dir, tipX, ty + dir * 9]);
  ctx.fill();
  const size = TYPE.body;
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (cur && textWidth(ctx, `${cur} ${w}`, size) > r.w - 36) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  lines.push(cur);
  const lh = size + 5;
  lines.forEach((l, i) => label(ctx, l, r.x + r.w / 2, r.y + r.h / 2 + 1 + (i - (lines.length - 1) / 2) * lh, size, { color: UI.accentText }));
  // the marker at the target: a small accent arrow, pointing at it from the callout's side
  const bob = Math.sin(t * 5) * 3;
  const my = pointAt.y - dir * (30 - bob);
  ctx.fillStyle = UI.bg;
  poly(ctx, [pointAt.x - 12, my - dir * 10, pointAt.x + 12, my - dir * 10, pointAt.x, my + dir * 10]);
  ctx.fill();
  ctx.fillStyle = UI.accent;
  poly(ctx, [pointAt.x - 8, my - dir * 7, pointAt.x + 8, my - dir * 7, pointAt.x, my + dir * 6]);
  ctx.fill();
}
