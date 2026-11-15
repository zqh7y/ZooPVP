import { CLASS_FX, H, S, TEAM, TYPE, UI, W } from '../theme';
import { CLASSES } from '../data';
import { clamp, font, label, poly, rr, textWidth, type Ctx, type FontWeight, type Rect } from '../util';
import { bolt, iconTint, trophy } from './icons';

/*
 * The interface kit: sunny match day. Warm white and cream surfaces, dark slate text, one sunny gold for the
 * main action. Things that can be touched are soft rounded blocks lit from the upper left (a top face with a
 * light top edge, a deeper side face below it, a short warm shadow falling to the lower right); the rest are
 * warm white plates with a soft shadow. Every screen draws its interface with these.
 */

/** An icon drawer: centre x, y and a box size. */
export type IconFn = (ctx: Ctx, x: number, y: number, size: number) => void;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/** A rounded-rect path on the half pixel, so a 1 px line along it is crisp. */
function hair(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number) {
  rr(ctx, Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1, rad);
}

/**
 * A soft warm shadow (the sun is at the upper left, so it falls a little down and right): a few see-through
 * layers, no blur filter. spread: how far it softens out.
 */
function softShadow(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, spread: number, alpha: number) {
  const n = 3;
  ctx.fillStyle = `rgba(110, 80, 40, ${(alpha / n).toFixed(3)})`;
  for (let i = 0; i < n; i++) {
    const g = (spread * (i + 1)) / n;
    rr(ctx, x - g * 0.6 + g * 0.35, y - g * 0.3, w + g * 1.2, h + g * 0.9, rad + g);
    ctx.fill();
  }
}

/** Mix two #rrggbb colours. */
function mix(a: string, b: string, k: number) {
  const p = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * clamp(k, 0, 1)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * A rounded block lit from the upper left: the side face (depth px deep) under the top face, the top face a soft
 * vertical gradient, a thin light line just inside its top edge. Returns the top face's rect.
 */
function block(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, depth: number, top: string, topLow: string, side: string, rim?: string) {
  rr(ctx, x, y + depth, w, h - depth, rad);
  ctx.fillStyle = side;
  ctx.fill();
  const fh = h - depth;
  const g = ctx.createLinearGradient(0, y, 0, y + fh);
  g.addColorStop(0, top);
  g.addColorStop(1, topLow);
  rr(ctx, x, y, w, fh, rad);
  ctx.fillStyle = g;
  ctx.fill();
  if (rim) {
    hair(ctx, x, y, w, fh, rad);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rim;
    ctx.stroke();
  }
  // the key light along the top edge, fading toward the right
  ctx.save();
  rr(ctx, x, y, w, fh, rad);
  ctx.clip();
  const hl = ctx.createLinearGradient(x, 0, x + w, 0);
  hl.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  hl.addColorStop(1, 'rgba(255, 255, 255, 0.25)');
  ctx.fillStyle = hl;
  ctx.fillRect(x + rad * 0.6, y + 1.5, w - rad * 1.2, 1.5);
  ctx.restore();
  return { x, y, w, h: fh };
}

// ------------------------------------------------------------------ text

/** Plain interface text: dark slate, no outline. */
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

const ticks = new Map<string, { v: number; at: number }>();

/**
 * A number that ticks to its new value instead of jumping: give it a stable key (where it is drawn) and the
 * real value every frame; it returns the value to show. The first time a key is seen it shows the value as is.
 */
export function tickTo(key: string, value: number, speed = 9): number {
  const t = now();
  const s = ticks.get(key);
  if (!s || !Number.isFinite(value)) {
    ticks.set(key, { v: value, at: t });
    return value;
  }
  const dt = clamp(t - s.at, 0, 1 / 30);
  s.at = t;
  const d = value - s.v;
  s.v += d * Math.min(1, dt * speed) + Math.sign(d) * Math.min(Math.abs(d), dt * 6);
  if (Math.abs(value - s.v) < 0.5) s.v = value;
  return Math.round(s.v);
}

// ------------------------------------------------------------------ buttons and pills

/** primary: the screen's one main action, in sunny gold. Every other variant is warm white or cream; danger is the red "drop here" state. */
export type ButtonVariant = 'primary' | 'roll' | 'secondary' | 'quiet' | 'danger';
interface Look {
  top: string;
  low: string;
  side: string;
  rim: string;
  text: string;
}
const VARIANT: Record<ButtonVariant, Look> = {
  primary: { top: '#ffd23f', low: '#ffbb12', side: '#d99200', rim: '', text: UI.accentText },
  roll: { top: '#ffffff', low: '#fbf5ea', side: '#dccbb0', rim: '#eadfcc', text: UI.text },
  secondary: { top: '#ffffff', low: '#fbf5ea', side: '#dccbb0', rim: '#eadfcc', text: UI.text },
  quiet: { top: '#f8f1e6', low: '#f1e8da', side: '#ddd0ba', rim: '#e8dcc8', text: UI.textDim },
  danger: { top: '#ff7a72', low: '#f0564f', side: '#bf3a37', rim: '', text: '#ffffff' },
};
const DISABLED: Look = { top: '#f1ebe1', low: '#ece4d7', side: '#dbd1c1', rim: '#e6ddcf', text: '#b5b0a6' };

/** How deep a button's side face is: the top face travels this far when pressed. */
export const BUTTON_DEPTH = 6;

const presses = new Map<string, { k: number; v: number; at: number }>();

/** 0 up .. 1 fully down, on a quick spring (about 80 ms down, a small bounce on the way back up). */
function pressAmount(key: string, down: boolean) {
  const target = down ? 1 : 0;
  const t = now();
  let s = presses.get(key);
  if (!s) {
    s = { k: target, v: 0, at: t };
    presses.set(key, s);
  }
  let dt = clamp(t - s.at, 0, 0.05);
  s.at = t;
  while (dt > 1e-6) {
    const h = Math.min(dt, 1 / 240);
    s.v += (1400 * (target - s.k) - 46 * s.v) * h;
    s.k += s.v * h;
    dt -= h;
  }
  return clamp(s.k, -0.25, 1);
}

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
  /** a time in seconds: the button breathes a soft gold glow (the screen's main action, while it waits) */
  breathe?: number;
}

/**
 * A button as a soft rounded block lit from the upper left: a top face, a side face BUTTON_DEPTH px deep and a
 * short warm shadow. Pressed, the top face travels down into the side and springs back on release. Returns the
 * face's centre y.
 */
export function button(ctx: Ctx, r: Rect, o: ButtonOpts = {}) {
  const v = o.disabled ? DISABLED : VARIANT[o.variant ?? 'primary'];
  const rad = Math.min(S.radius.l, r.h * 0.3);
  const D = BUTTON_DEPTH;
  const k = pressAmount(`${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`, !!o.pressed && !o.disabled);
  const travel = (D - 1) * k;
  const fh = r.h - D;
  const fy = r.y + travel;
  if (o.pulse && !o.disabled) {
    const p = clamp(o.pulse, 0, 1);
    rr(ctx, r.x - 3 - 7 * p, r.y - 3 - 7 * p, r.w + 6 + 14 * p, r.h + 6 + 14 * p, rad + 3 + 7 * p);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.globalAlpha *= 1 - p;
    ctx.strokeStyle = UI.accentDim;
    ctx.stroke();
    ctx.restore();
  }
  // the shadow tightens as the block is pressed into the ground
  softShadow(ctx, r.x, r.y + 4, r.w, r.h - 2, rad, 7 - 4 * clamp(k, 0, 1), o.disabled ? 0.12 : 0.32);
  if (o.breathe !== undefined && !o.disabled) {
    ctx.save();
    ctx.shadowColor = `rgba(255, 180, 0, ${(0.35 + 0.2 * Math.sin(o.breathe * 2.2)).toFixed(3)})`;
    ctx.shadowBlur = 24;
    rr(ctx, r.x, r.y + 2, r.w, r.h - 2, rad);
    ctx.fillStyle = v.side;
    ctx.fill();
    ctx.restore();
  }
  rr(ctx, r.x, r.y + D, r.w, r.h - D, rad);
  ctx.fillStyle = v.side;
  ctx.fill();
  block(ctx, r.x, fy, r.w, fh + (D - travel) * 0, rad, 0, v.top, v.low, v.side, v.rim || undefined);
  const cy = fy + fh / 2;
  const big = r.h >= S.btnH - 8;
  const size = big ? TYPE.button : r.h >= 44 ? TYPE.lead : TYPE.label;
  const weight: FontWeight = 700;
  const track = size * 0.06;
  const ty = o.sub ? cy - size * 0.24 : cy;
  const iconSize = Math.min(fh - 20, size * 0.9);
  const gap = Math.round(size * 0.36);
  const pad = 16;
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
    ctx.globalAlpha *= 0.75;
    fitLabel(ctx, o.sub.toUpperCase(), r.x + r.w / 2, cy + size * 0.58, TYPE.tag, r.w - pad * 2, { color: v.text, track: 1 });
    ctx.restore();
  }
  if (o.badge !== undefined && o.badge !== 0) {
    const s = String(o.badge);
    const bh = 28;
    const bw = Math.max(bh, 16 + textWidth(ctx, s, TYPE.body, 700));
    const bx = Math.round(r.x + r.w - bw + 8);
    const by = Math.round(fy - 10);
    const onGold = !o.disabled && (o.variant ?? 'primary') === 'primary';
    softShadow(ctx, bx, by + 2, bw, bh, bh / 2, 3, 0.3);
    rr(ctx, bx - 2.5, by - 2.5, bw + 5, bh + 5, bh / 2 + 2.5);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    rr(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = o.disabled ? UI.borderStrong : onGold ? UI.text : UI.danger;
    ctx.fill();
    label(ctx, s, bx + bw / 2, by + bh / 2 + 1, TYPE.body, { color: '#ffffff', weight: 700, track: 0 });
  }
  return cy;
}

export interface PillOpts {
  icon?: IconFn;
  text: string;
  /** 0..1, a gold edge and value when it changes */
  flash?: number;
  /** numbers tick to a new value (on by default) */
  tick?: boolean;
}

/** A warm white plate with a soft shadow and a hairline edge. */
function plate(ctx: Ctx, r: Rect, fill: string, rad: number = S.radius.m, shadow = 0.22) {
  if (shadow > 0) softShadow(ctx, r.x, r.y + 2, r.w, r.h, rad, 5, shadow);
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = fill;
  ctx.fill();
  hair(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.lineWidth = 1;
  ctx.strokeStyle = UI.border;
  ctx.stroke();
}

/**
 * A stat chip: a rounded white pill, a glyph at the left, the value beside it. "POWER 3314" is drawn as a dim
 * caption and a bold number. A number ticks to its new value and shows in gold while it moves.
 */
export function pill(ctx: Ctx, r: Rect, o: PillOpts) {
  const rad = r.h / 2;
  plate(ctx, r, UI.surface, rad);
  const cap = /^(?:([A-Za-z ]+) )?(-?\d+)$/.exec(o.text);
  let text = o.text;
  let moving = false;
  if (cap && o.tick !== false) {
    const goal = Number(cap[2]);
    const shown = tickTo(`pill:${Math.round(r.x)},${Math.round(r.y)}:${cap[1] ?? ''}`, goal);
    moving = shown !== goal;
    text = cap[1] ? `${cap[1]} ${shown}` : String(shown);
  }
  const bump = Math.max(clamp(o.flash ?? 0, 0, 1), moving ? 1 : 0);
  if (bump > 0) {
    rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad - 1);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.globalAlpha *= bump;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    ctx.restore();
  }
  const cy = r.y + r.h / 2;
  const pad = Math.min(18, r.h * 0.36);
  const size = Math.min(TYPE.h3, r.h * 0.5);
  const color = UI.text;
  const parts = /^([A-Za-z ]+) ([\d.,]+[KMB]?)$/.exec(text);
  const iconSize = o.icon ? Math.min(r.h - 18, 26) : 0;
  let x0 = r.x + pad;
  if (o.icon) {
    o.icon(ctx, x0 + iconSize / 2, cy, iconSize);
    x0 += iconSize + 10;
  }
  const room = r.x + r.w - pad - x0;
  if (parts) {
    const cs = TYPE.small;
    const cw = textWidth(ctx, parts[1].toUpperCase(), cs, 700, 1.5);
    const vw = textWidth(ctx, parts[2], size, 700);
    const total = cw + 8 + vw;
    const k = Math.min(1, room / total);
    const sx = o.icon ? x0 : r.x + (r.w - total * k) / 2;
    label(ctx, parts[1].toUpperCase(), sx, cy + 1, cs * k, { align: 'left', color: UI.textDim, weight: 700, track: 1.5 * k });
    label(ctx, parts[2], sx + (cw + 8) * k, cy + 1, size * k, { align: 'left', color, weight: 700 });
  } else if (o.icon) fitLabel(ctx, text, x0, cy + 1, size, room, { align: 'left', color, weight: 700 });
  else fitLabel(ctx, text, r.x + r.w / 2, cy + 1, size, r.w - pad * 2, { color, weight: 700 });
}

/** POWER and its number on a compact chip (each side in match): a gold bolt, the caption, the bold number. */
export function powerChip(ctx: Ctx, r: Rect, power: number) {
  pill(ctx, r, { icon: (c, x, y, s) => bolt(c, x, y, s * 0.9, UI.accentDark), text: `POWER ${Math.round(power)}` });
}

const powers = new Map<string, { goal: number; shown: number; at: number; popAt: number; from: number; delta: number }>();

/**
 * The army's POWER, big: a white block with a gold rim, a gold medallion with a bolt, the caption and a large
 * number. When the value changes it ticks there, the number pops and a +N (or -N) floats up from the plate.
 * Centred on cx, cy; w x h is its size. Returns the plate's rect.
 */
export function powerBadge(ctx: Ctx, cx: number, cy: number, power: number, o: { w?: number; h?: number; key?: string } = {}) {
  const w = o.w ?? 260;
  const h = o.h ?? 74;
  const key = o.key ?? `${Math.round(cx)},${Math.round(cy)}`;
  const t = now();
  const goal = Math.round(power);
  let s = powers.get(key);
  if (!s) {
    s = { goal, shown: goal, at: t - 9, popAt: -9, from: goal, delta: 0 };
    powers.set(key, s);
  }
  if (goal !== s.goal) {
    s.delta = goal - s.goal;
    s.from = s.shown;
    s.goal = goal;
    s.at = t;
    s.popAt = t;
  }
  const u = clamp((t - s.at) / 0.7, 0, 1);
  s.shown = Math.round(s.from + (s.goal - s.from) * (1 - (1 - u) ** 3));
  const pa = t - s.popAt;
  const pop = pa < 0.5 ? 1 + 0.22 * Math.exp(-pa * 7) * Math.cos(pa * 18) : 1;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rad = h * 0.3;
  const D = 6;
  softShadow(ctx, x, y + 5, w, h - 2, rad, 9, 0.3);
  // a gold rim block, then the white face inset in it
  block(ctx, x, y, w, h, rad, D, '#ffd23f', '#ffb80d', '#d18f00');
  const inset = 4;
  rr(ctx, x + inset, y + inset, w - inset * 2, h - D - inset * 2, rad - inset);
  const g = ctx.createLinearGradient(0, y, 0, y + h - D);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#fff6e2');
  ctx.fillStyle = g;
  ctx.fill();
  const fh = h - D;
  const my = y + fh / 2;
  // the medallion
  const mr = fh * 0.36;
  const mx = x + inset + 10 + mr;
  circleFill(ctx, mx + 1, my + 2, mr, 'rgba(180, 120, 0, 0.35)');
  const mg = ctx.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, mr * 0.1, mx, my, mr);
  mg.addColorStop(0, '#ffe680');
  mg.addColorStop(1, '#f2a900');
  circleFill(ctx, mx, my, mr, mg);
  bolt(ctx, mx, my + 1, mr * 1.25, '#ffffff');
  // caption and number
  const tx = mx + mr + 12;
  label(ctx, 'POWER', tx, my - fh * 0.2, TYPE.small, { align: 'left', color: UI.textDim, weight: 700, track: 2.5 });
  const size = Math.min(TYPE.power, fh * 0.6);
  ctx.save();
  const nx = tx;
  const ny = my + fh * 0.12;
  ctx.translate(nx, ny);
  ctx.scale(pop, pop);
  fitLabel(ctx, shortNumber(s.shown), 0, 0, size, x + w - inset - 12 - tx, { align: 'left', color: u < 1 ? '#c98a00' : UI.text, weight: 700, track: 0.5 });
  ctx.restore();
  // the change floats up off the plate
  if (pa < 1.2 && s.delta !== 0) {
    const k = pa / 1.2;
    ctx.save();
    ctx.globalAlpha *= k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    const txt = `${s.delta > 0 ? '+' : ''}${shortNumber(s.delta)}`;
    pillText(ctx, txt, x + w - 34, y - 4 - k * 26, s.delta > 0 ? UI.ok : UI.danger);
    ctx.restore();
  }
  return { x, y, w, h };
}

function circleFill(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A small white text on a coloured pill, centred on x, y. */
function pillText(ctx: Ctx, s: string, x: number, y: number, fill: string) {
  const size = TYPE.body;
  const w = textWidth(ctx, s, size, 700, 0) + 18;
  const h = 28;
  rr(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  label(ctx, s, x, y + 1, size, { color: '#ffffff', weight: 700, track: 0 });
}

// ------------------------------------------------------------------ panels and cells

/** A warm white panel with a soft shadow; 'dark' is the see-through one for panels over the pitch. A title sits on a tab on the top edge. */
export function panel(ctx: Ctx, r: Rect, o: { title?: string; tone?: 'paper' | 'dark' } = {}) {
  plate(ctx, r, o.tone === 'dark' ? UI.glass : UI.surface, S.radius.l, 0.26);
  if (o.title) {
    const s = o.title.toUpperCase();
    const w = Math.min(r.w - 40, textWidth(ctx, s, TYPE.small, 700, 2) + 36);
    const tr = { x: Math.round(r.x + r.w / 2 - w / 2), y: Math.round(r.y - 14), w: Math.round(w), h: 28 };
    block(ctx, tr.x, tr.y, tr.w, tr.h, 14, 3, '#ffffff', '#f6eee1', '#e0d3bd', UI.border);
    fitLabel(ctx, s, r.x + r.w / 2, tr.y + 13, TYPE.small, w - 20, { color: UI.textDim, weight: 700, track: 2 });
  }
}

/**
 * The tray the grid and the bench sit in: a sand-coloured block with thickness, its inner floor recessed (the
 * top and left inner edges fall into soft shadow, the lower lip catches the sun).
 */
export function gridFrame(ctx: Ctx, r: Rect) {
  const m = 8;
  const x = r.x - m;
  const y = r.y - m;
  const w = r.w + m * 2;
  const h = r.h + m * 2;
  const rad = S.radius.l + 4;
  const D = 7;
  softShadow(ctx, x, y + 6, w, h + D, rad, 10, 0.26);
  block(ctx, x, y, w, h + D, rad, D, '#f3e7d3', '#ecdec7', '#d6c3a3');
  // the recessed floor
  const fx = r.x - 2;
  const fy = r.y - 2;
  const fw = r.w + 4;
  const fh = r.h + 4;
  const frad = S.radius.l - 2;
  rr(ctx, fx, fy, fw, fh, frad);
  ctx.fillStyle = '#e8d9c0';
  ctx.fill();
  ctx.save();
  rr(ctx, fx, fy, fw, fh, frad);
  ctx.clip();
  const top = ctx.createLinearGradient(0, fy, 0, fy + 12);
  top.addColorStop(0, 'rgba(120, 88, 44, 0.28)');
  top.addColorStop(1, 'rgba(120, 88, 44, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(fx, fy, fw, 12);
  const left = ctx.createLinearGradient(fx, 0, fx + 9, 0);
  left.addColorStop(0, 'rgba(120, 88, 44, 0.2)');
  left.addColorStop(1, 'rgba(120, 88, 44, 0)');
  ctx.fillStyle = left;
  ctx.fillRect(fx, fy, 9, fh);
  ctx.restore();
  hair(ctx, fx, fy + 1, fw, fh, frad);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.stroke();
}

/** One slot in the tray: a softly sunken cream square. ok / bad / fuse tint it green / red / gold for a drop. */
export function cell(ctx: Ctx, r: Rect, state: 'empty' | 'ok' | 'bad' | 'fuse' = 'empty') {
  const x = Math.round(r.x + 3);
  const y = Math.round(r.y + 3);
  const w = Math.round(r.w - 6);
  const h = Math.round(r.h - 6);
  const rad = S.radius.m;
  rr(ctx, x, y, w, h, rad);
  ctx.fillStyle = '#f2e7d5';
  ctx.fill();
  ctx.save();
  rr(ctx, x, y, w, h, rad);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + 7);
  g.addColorStop(0, 'rgba(120, 88, 44, 0.16)');
  g.addColorStop(1, 'rgba(120, 88, 44, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, 7);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillRect(x + rad, y + h - 1.5, w - rad * 2, 1.5);
  ctx.restore();
  if (state === 'empty') return;
  const c = state === 'ok' ? UI.ok : state === 'bad' ? UI.danger : UI.accent;
  ctx.save();
  rr(ctx, x, y, w, h, rad);
  ctx.globalAlpha *= state === 'fuse' ? 0.35 : 0.22;
  ctx.fillStyle = c;
  ctx.fill();
  ctx.globalAlpha = 1;
  rr(ctx, x + 1, y + 1, w - 2, h - 2, rad - 1);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = state === 'fuse' ? UI.accentDark : c;
  ctx.stroke();
  ctx.restore();
}

/** A light wash over the whole screen behind a panel. */
export function veil(ctx: Ctx, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha, 0, 1);
  ctx.fillStyle = UI.scrim;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ------------------------------------------------------------------ classes

/** The slow white-gold shimmer of SSS, as a gradient that drifts along the line x0,y0 -> x1,y1, deep enough to read on white. */
export function rainbow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = ['#f5b300', '#ffe27a', '#fffaf0', '#ffd23f', '#e8a300'];
  const n = stops.length;
  const sh = (((t * 0.25) % 1) + 1) % 1;
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const c = Math.floor(((u + sh) % 1) * n);
    g.addColorStop(u, stops[c % n]);
  }
  return g;
}

/** Text colour for a class (level 1..7), readable on the light surfaces: greys, steel, gold; SSS breathes in gold. */
export function classColor(level: number, t: number) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  return i === 6 ? mix('#b8860b', '#f0a800', 0.5 + 0.5 * Math.sin(t * 1.4)) : UI.tierText[i];
}

/** How deep a tile's side face is, for a tile h px tall. */
export const tileDepth = (h: number) => clamp(Math.round(h * 0.075), 3, 8);
/** How far a lifted tile rises. */
export const TILE_LIFT = 7;

// the side face of a tile: warm grey for the common classes, steel for B, gold from A
const TILE_SIDE = ['#d8cfc1', '#cdc4b6', '#bfb6a9', '#a9b6c4', '#d39410', '#e09f00', '#e6b23a'];
// the top face, from its upper edge to its lower one: warm white, faintly gold from A
const TILE_TOP = [
  ['#ffffff', '#f8f2e8'],
  ['#ffffff', '#f6f0e6'],
  ['#ffffff', '#f3ede3'],
  ['#ffffff', '#eef2f6'],
  ['#fffdf5', '#fdf0cf'],
  ['#fffcf0', '#ffeab0'],
  ['#ffffff', '#fff3cf'],
];

/**
 * The tile a piece sits on (level 1..7 = E..SSS): a soft block lit from the upper left. A warm white top face, a
 * side face below it in the class tone, a short shadow; the class is the rim around the top face. Any size: a
 * piece covering two or four cells sits on one wide tile. A lifted tile rises: its shadow spreads and falls away.
 */
export function tileFrame(ctx: Ctx, r: Rect, level: number, o: { idle?: boolean; lifted?: boolean; t?: number } = {}) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const small = Math.min(r.w, r.h);
  const rad = clamp(small * 0.16, 5, S.radius.l);
  const D = tileDepth(small);
  const L = o.lifted ? TILE_LIFT : 0;
  const fy = r.y - L;
  const fh = r.h - D;
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.55;
  if (o.lifted) softShadow(ctx, r.x + 6, r.y + 8, r.w - 6, r.h - 4, rad, 12, 0.34);
  else softShadow(ctx, r.x, r.y + 3, r.w, r.h - 2, rad, 4, 0.3);
  // side face
  rr(ctx, r.x, fy + D, r.w, fh, rad);
  ctx.fillStyle = TILE_SIDE[i];
  ctx.fill();
  // top face
  const g = ctx.createLinearGradient(r.x, fy, r.x + r.w * 0.3, fy + fh);
  g.addColorStop(0, TILE_TOP[i][0]);
  g.addColorStop(1, TILE_TOP[i][1]);
  rr(ctx, r.x, fy, r.w, fh, rad);
  ctx.fillStyle = g;
  ctx.fill();
  // the class rim around the top face
  const lw = i >= 4 ? 3 : i >= 3 ? 2.5 : 2;
  rr(ctx, r.x + lw / 2, fy + lw / 2, r.w - lw, fh - lw, rad - lw / 2);
  ctx.lineWidth = lw;
  ctx.strokeStyle = i === 6 ? rainbow(ctx, r.x, fy, r.x + r.w, fy + fh, o.t ?? 0) : UI.tier[i];
  ctx.stroke();
  // the key light just inside the rim's upper left
  ctx.beginPath();
  ctx.moveTo(r.x + lw + 1, fy + fh * 0.55);
  ctx.lineTo(r.x + lw + 1, fy + rad);
  ctx.arcTo(r.x + lw + 1, fy + lw + 1, r.x + rad, fy + lw + 1, rad - lw - 1);
  ctx.lineTo(r.x + r.w * 0.6, fy + lw + 1);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.stroke();
  ctx.restore();
}

/**
 * What the top classes add over their tile: A a slow faint sheen, S a soft gold glow, SSS a white-gold sheen and
 * glow. r is the tile's rect (raised already if the tile is lifted).
 */
export function classFx(ctx: Ctx, r: Rect, level: number, t: number) {
  const lv = Math.round(level);
  if (lv < 5) return;
  const small = Math.min(r.w, r.h);
  const rad = clamp(small * 0.16, 5, S.radius.l);
  const fh = r.h - tileDepth(small);
  if (lv >= 6) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    ctx.save();
    rr(ctx, r.x - 1, r.y - 1, r.w + 2, fh + 2, rad + 1);
    ctx.shadowColor = lv >= 7 ? 'rgba(255, 214, 90, 0.95)' : 'rgba(255, 190, 0, 0.9)';
    ctx.shadowBlur = 12 + 6 * pulse;
    ctx.lineWidth = 2;
    ctx.strokeStyle = lv >= 7 ? CLASS_FX.sss : CLASS_FX.s;
    ctx.globalAlpha *= 0.45 + 0.3 * pulse;
    ctx.stroke();
    ctx.restore();
  }
  const period = lv === 5 ? 5 : lv === 6 ? 4 : 3.2;
  const u = (t / period) % 1;
  if (u > 0.45) return;
  ctx.save();
  rr(ctx, r.x + 2, r.y + 2, r.w - 4, fh - 4, rad - 2);
  ctx.clip();
  const span = r.w + fh + 40;
  const sx = r.x - 20 + (u / 0.45) * span;
  const band = ctx.createLinearGradient(sx - 20, 0, sx + 20, 0);
  const c = lv >= 7 ? '255, 236, 160' : '255, 222, 110';
  const a = lv === 5 ? 0.22 : lv === 6 ? 0.3 : 0.45;
  band.addColorStop(0, `rgba(${c}, 0)`);
  band.addColorStop(0.5, `rgba(${c}, ${a})`);
  band.addColorStop(1, `rgba(${c}, 0)`);
  ctx.fillStyle = band;
  poly(ctx, [sx - 20, r.y, sx + 20, r.y, sx + 20 - fh * 0.6, r.y + fh, sx - 20 - fh * 0.6, r.y + fh]);
  ctx.fill();
  ctx.restore();
}

/** The size of a class badge drawn at scale k: its plate's width and height. */
export function classBadgeSize(level: number, k = 1) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const h = Math.round(26 * k);
  return { w: Math.round((CLASSES[i].length > 1 ? 46 : 26) * k), h };
}

/**
 * The class letter, bold, on a small plate in the class tone (E, D, C greys, B silver, A and S gold, SSS
 * white-gold with a sheen). Left edge at x, centred on y; at k = 1 the letter is TYPE.badge and the plate 26 px tall.
 */
export function classBadge(ctx: Ctx, level: number, x: number, y: number, k: number, t = 0) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const letter = CLASSES[i];
  const { w, h } = classBadgeSize(level, k);
  const size = Math.max(TYPE.tiny, TYPE.badge * k);
  const rad = Math.max(3, 7 * k);
  const top = y - h / 2;
  const [c0, c1, ink] = UI.tierPlate[i];
  // a short shadow and a 1 px deeper edge under the plate, so it sits on the tile like a sticker with thickness
  ctx.fillStyle = 'rgba(80, 60, 30, 0.22)';
  rr(ctx, x + 0.5, top + 1.5 * k + 0.5, w, h, rad);
  ctx.fill();
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  rr(ctx, x, top, w, h, rad);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, k);
  ctx.strokeStyle = i >= 4 ? 'rgba(150, 95, 0, 0.55)' : i === 3 ? 'rgba(90, 110, 135, 0.5)' : 'rgba(60, 66, 78, 0.28)';
  ctx.stroke();
  if (i >= 3) {
    // the metals catch the sun: a bright line along the top, and a passing sheen on SSS
    ctx.save();
    rr(ctx, x, top, w, h, rad);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(x + rad * 0.6, top + 1.2 * k, w - rad * 1.2, 1.4 * k);
    if (i === 6) {
      const u = ((t * 0.45) % 1) * (w + 30) - 15;
      const sg = ctx.createLinearGradient(x + u - 10, 0, x + u + 10, 0);
      sg.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sg.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
      sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x, top, w, h);
    }
    ctx.restore();
  }
  label(ctx, letter, x + w / 2, y + 1 * k, size, { color: ink, weight: 700, track: letter.length > 1 ? 0.5 * k : 0 });
}

/** "×4" on a small slate chip, centred on x, y. */
export function countBadge(ctx: Ctx, count: number, x: number, y: number, k = 1) {
  const s = `×${count}`;
  const size = Math.max(TYPE.tiny, TYPE.label * k);
  const q = size / TYPE.label;
  const w = textWidth(ctx, s, size, 700, 0) + 12 * q;
  const h = 22 * q;
  rr(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = UI.text;
  ctx.fill();
  label(ctx, s, x, y + 1 * q, size, { color: '#ffffff', weight: 700, track: 0 });
}

// ------------------------------------------------------------------ battle bars

/**
 * The opponent's or your own name plate: a team bar on the outer edge, the name, the trophies. The opponent's
 * always shows a BOT tag. body: the plate goes on this many px below r as one panel (r is its header row, a
 * hairline divides them, the team bar runs the whole height), for what belongs to that player.
 */
export function namePlate(ctx: Ctx, r: Rect, o: { name: string; trophies: number; team: 0 | 1; bot?: boolean; align?: 'left' | 'right'; body?: number }) {
  const right = o.align === 'right';
  const full = { x: r.x, y: r.y, w: r.w, h: r.h + Math.max(0, o.body ?? 0) };
  const rad = S.radius.l;
  plate(ctx, full, UI.surface, rad, 0.26);
  ctx.save();
  rr(ctx, full.x, full.y, full.w, full.h, rad);
  ctx.clip();
  // the team's colour: a band along the outer edge and a soft wash of it across the header
  const wash = ctx.createLinearGradient(right ? r.x + r.w : r.x, 0, right ? r.x + r.w * 0.4 : r.x + r.w * 0.6, 0);
  wash.addColorStop(0, o.team === 0 ? 'rgba(63, 162, 255, 0.16)' : 'rgba(255, 90, 90, 0.16)');
  wash.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = TEAM[o.team].main;
  ctx.fillRect(Math.round(right ? r.x + r.w - 7 : r.x), r.y, 7, full.h);
  ctx.restore();
  if (full.h > r.h) {
    ctx.fillStyle = UI.border;
    ctx.fillRect(Math.round(r.x + 18), Math.round(r.y + r.h - 1), Math.round(r.w - 36), 1);
  }
  const pad = 20;
  const dir = right ? -1 : 1;
  const ax = right ? r.x + r.w - pad : r.x + pad;
  const al: CanvasTextAlign = right ? 'right' : 'left';
  const tag = o.bot ? 44 : 0;
  const mid = r.y + r.h / 2;
  const two = r.h > 44;
  const nameY = two ? mid - 11 : mid;
  const nameW = Math.min(r.w - pad * 2 - (tag ? tag + 10 : 0), textWidth(ctx, o.name, TYPE.lead, 700));
  fitLabel(ctx, o.name, ax, nameY + 1, TYPE.lead, nameW, { align: al, weight: 700, color: UI.text });
  if (two) {
    trophy(ctx, ax + dir * 8, mid + 14, 16, '#d99400');
    label(ctx, shortNumber(o.trophies), ax + dir * 22, mid + 15, TYPE.caption, { align: al, color: UI.textDim, weight: 700 });
  }
  // the BOT tag sits right after the name
  if (o.bot) botTag(ctx, right ? ax - nameW - 10 - tag : ax + nameW + 10, nameY, tag);
}

/** The BOT tag the opponent's name always carries: a small slate chip, left edge at x, centred on y. */
export function botTag(ctx: Ctx, x: number, y: number, w = 40) {
  rr(ctx, Math.round(x), Math.round(y - 11), w, 22, 11);
  ctx.fillStyle = UI.text;
  ctx.fill();
  label(ctx, 'BOT', x + w / 2, y + 1, TYPE.tag + 1, { weight: 700, track: 1.5, color: '#ffffff' });
}

export interface ScoreSide {
  name: string;
  /** the big number beside the clock (fighters left, a score) */
  score: number | string;
  bot?: boolean;
}

/** The score bug's size: pass SCORE_BUG.h as its rect's height, wherever it is drawn. */
export const SCORE_BUG = { h: 44 };

/**
 * A friendly score bar: [team bar | NAME | score | clock | score | NAME BOT | team bar] on one white strip.
 * home is your side (blue), away the opponent (red). flash 0..1 lights the clock in gold for a moment; hot keeps
 * it gold (overtime).
 */
export function scoreBug(ctx: Ctx, r: Rect, o: { home: ScoreSide; away: ScoreSide; clock: string; flash?: number; hot?: boolean }) {
  const rad = r.h / 2;
  plate(ctx, r, UI.surface, rad, 0.3);
  const clockW = 80;
  const scoreW = 52;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.clip();
  ctx.fillStyle = TEAM[0].main;
  ctx.fillRect(Math.round(r.x), r.y, 8, r.h);
  ctx.fillStyle = TEAM[1].main;
  ctx.fillRect(Math.round(r.x + r.w - 8), r.y, 8, r.h);
  ctx.fillStyle = UI.surfaceAlt;
  ctx.fillRect(Math.round(cx - clockW / 2 - scoreW), r.y, scoreW, r.h);
  ctx.fillRect(Math.round(cx + clockW / 2), r.y, scoreW, r.h);
  ctx.restore();
  const f = clamp(o.flash ?? 0, 0, 1);
  const hot = o.hot || f > 0.4;
  rr(ctx, cx - clockW / 2, r.y + 4, clockW, r.h - 8, (r.h - 8) / 2);
  ctx.fillStyle = hot ? UI.accent : UI.text;
  ctx.fill();
  label(ctx, o.clock, cx, cy + 1, TYPE.lead, { color: hot ? UI.accentText : '#ffffff', weight: 700, track: 1 });
  const size = TYPE.h2;
  label(ctx, String(o.home.score), cx - clockW / 2 - scoreW / 2, cy + 1, size, { weight: 700, color: TEAM[0].dark });
  label(ctx, String(o.away.score), cx + clockW / 2 + scoreW / 2, cy + 1, size, { weight: 700, color: TEAM[1].dark });
  const room = r.w / 2 - clockW / 2 - scoreW - 24;
  fitLabel(ctx, o.home.name.toUpperCase(), r.x + 18, cy + 1, TYPE.body, room - (o.home.bot ? 46 : 0), { align: 'left', weight: 700, track: 1, color: UI.text });
  const tag = o.away.bot ? 46 : 0;
  fitLabel(ctx, o.away.name.toUpperCase(), r.x + r.w - 18, cy + 1, TYPE.body, room - tag, { align: 'right', weight: 700, track: 1, color: UI.text });
  if (o.away.bot) botTag(ctx, cx + clockW / 2 + scoreW + 8, cy);
  if (o.home.bot) botTag(ctx, cx - clockW / 2 - scoreW - 48, cy);
}

/** A rounded fill bar, 0..1, in a sunken cream track, with a light line along the fill's top and a slow sheen. */
export function progressBar(ctx: Ctx, r: Rect, value: number, o: { color?: string; light?: string; back?: string } = {}) {
  const v = clamp(value, 0, 1);
  const rad = r.h / 2;
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = o.back ?? UI.track;
  ctx.fill();
  if (v <= 0.001) return;
  const fw = Math.max(r.h, r.w * v);
  ctx.save();
  rr(ctx, r.x, r.y, fw, r.h, rad);
  ctx.clip();
  ctx.fillStyle = o.color ?? UI.accent;
  ctx.fillRect(r.x, r.y, fw, r.h);
  if (r.h >= 4) {
    ctx.fillStyle = o.light ?? 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(r.x, r.y + Math.max(1, r.h * 0.15), fw, Math.max(1, r.h * 0.2));
  }
  const u = (now() / 3.2) % 1;
  if (u < 0.5) {
    const sx = r.x - 30 + (u / 0.5) * (fw + 60);
    const g = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, fw, r.h);
  }
  ctx.restore();
}

/** Tug-of-war health: blue grows from the left, red from the right, a white marker with a slate edge at the seam. */
export function tugBar(ctx: Ctx, r: Rect, share0: number, share1: number, _t: number) {
  const tot = Math.max(1e-6, share0 + share1);
  const f = clamp(share0 / tot, 0.04, 0.96);
  const sx = Math.round(r.x + r.w * f);
  const rad = r.h / 2;
  ctx.save();
  rr(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.clip();
  ctx.fillStyle = TEAM[0].main;
  ctx.fillRect(r.x, r.y, sx - r.x, r.h);
  ctx.fillStyle = TEAM[1].main;
  ctx.fillRect(sx, r.y, r.x + r.w - sx, r.h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillRect(r.x, Math.round(r.y + 1), r.w, Math.max(1, r.h * 0.22));
  ctx.restore();
  rr(ctx, sx - 4, r.y - 4, 8, r.h + 8, 4);
  ctx.fillStyle = UI.text;
  ctx.fill();
  rr(ctx, sx - 2, r.y - 2, 4, r.h + 4, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** A segmented meter (the roll meter). value 0..1; `ticks` equal segments; gold when full. */
export function meter(ctx: Ctx, r: Rect, value: number, o: { ticks?: number; color?: string; full?: boolean } = {}) {
  const n = Math.max(1, o.ticks ?? 5);
  const gap = 3;
  const w = (r.w - gap * (n - 1)) / n;
  const v = clamp(value, 0, 1) * n;
  for (let i = 0; i < n; i++) {
    const x = r.x + i * (w + gap);
    rr(ctx, x, r.y, w, r.h, Math.min(4, r.h / 2));
    ctx.fillStyle = UI.track;
    ctx.fill();
    const part = clamp(v - i, 0, 1);
    if (part <= 0.001) continue;
    ctx.save();
    ctx.clip();
    ctx.fillStyle = o.full ? UI.accent : (o.color ?? '#4a5463');
    ctx.fillRect(x, r.y, w * part, r.h);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ banners, toasts, hints

/** A title slab's tone: accent is the gold (a win, a reward), plain warm white, muted slate (a loss). */
export type RibbonTone = 'accent' | 'plain' | 'muted';
/** The tone names from the old palette, still read: gold and jade are accent, red plain, indigo muted. */
type OldRibbonTone = 'red' | 'gold' | 'indigo' | 'jade';
const RIBBON_TONE: Record<RibbonTone | OldRibbonTone, RibbonTone> = { accent: 'accent', plain: 'plain', muted: 'muted', gold: 'accent', jade: 'accent', red: 'plain', indigo: 'muted' };
const RIBBON_LOOK: Record<RibbonTone, Look> = {
  accent: { top: '#ffd23f', low: '#ffb80d', side: '#d18f00', rim: '', text: UI.accentText },
  plain: { top: '#ffffff', low: '#fbf4e8', side: '#d8c6a8', rim: '', text: UI.text },
  muted: { top: '#6b7584', low: '#5a6372', side: '#3c4450', rim: '', text: '#ffffff' },
};

/**
 * A title slab (VICTORY, DEFEAT, FIGHT!, +1 ROLL): a chunky rounded block with big letters, centred on cx, cy.
 * sub: a caption line under the title inside the block (the block grows down for it).
 */
export function ribbon(ctx: Ctx, cx: number, cy: number, w: number, text: string, o: { color?: RibbonTone | OldRibbonTone; size?: number; sub?: string } = {}) {
  const tone = RIBBON_TONE[o.color ?? 'plain'];
  const v = RIBBON_LOOK[tone];
  const size = o.size ?? TYPE.title;
  const D = Math.max(5, Math.round(size * 0.12));
  const subH = o.sub ? TYPE.caption + S.pad + S.base : 0;
  const titleH = Math.round(size * 1.3);
  const h = titleH + subH + D;
  const x0 = cx - w / 2;
  const y0 = cy - titleH / 2;
  const rad = Math.min(S.radius.l + 6, titleH * 0.35);
  softShadow(ctx, x0, y0 + 6, w, h, rad, 10, 0.3);
  block(ctx, x0, y0, w, h, rad, D, v.top, v.low, v.side);
  fitLabel(ctx, text.toUpperCase(), cx, cy + 2, size, w - 36, { color: v.text, weight: 700, track: size * 0.05 });
  if (o.sub) {
    ctx.fillStyle = tone === 'muted' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(120, 80, 20, 0.14)';
    ctx.fillRect(Math.round(x0 + 24), Math.round(y0 + titleH), Math.round(w - 48), 1);
    ctx.save();
    ctx.globalAlpha *= 0.8;
    fitLabel(ctx, o.sub.toUpperCase(), cx, y0 + titleH + subH / 2, TYPE.caption, w - 36, { color: v.text, weight: 700, track: 1.5 });
    ctx.restore();
  }
}

/** A floating message that rises and fades: a slate pill with white text; age in seconds (about 0..1.4). */
export function toast(ctx: Ctx, text: string, x: number, y: number, age: number) {
  const a = age < 0.15 ? age / 0.15 : clamp(1 - (age - 0.9) / 0.5, 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  const size = TYPE.body;
  const w = Math.min(W - 40, textWidth(ctx, text, size, 700) + 36);
  const h = 40;
  const k = age < 0.15 ? 0.9 + 0.1 * (age / 0.15) : 1;
  const yy = y - age * 24;
  ctx.translate(x, yy);
  ctx.scale(k, k);
  softShadow(ctx, -w / 2, -h / 2 + 3, w, h, h / 2, 6, 0.3);
  rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = UI.text;
  ctx.fill();
  fitLabel(ctx, text, 0, 1, size, w - 28, { color: '#ffffff', weight: 700 });
  ctx.restore();
}

/** A rounded rect with a small tail on its top (dir -1) or bottom (dir 1) edge at tipX; dir 0 for none. */
function calloutPath(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, tipX: number, dir: number) {
  const tail = 10;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  if (dir < 0) {
    ctx.lineTo(tipX - tail, y);
    ctx.lineTo(tipX, y - tail);
    ctx.lineTo(tipX + tail, y);
  }
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  if (dir > 0) {
    ctx.lineTo(tipX + tail, y + h);
    ctx.lineTo(tipX, y + h + tail);
    ctx.lineTo(tipX - tail, y + h);
  }
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

/**
 * A callout inside rect r that points at (pointAt.x, pointAt.y) one way only: with a small tail when the target
 * is just past its edge, else with a gold arrow bobbing over the target. A white bubble with a gold edge.
 */
export function hint(ctx: Ctx, r: Rect, text: string, pointAt: { x: number; y: number }, t = 0) {
  const below = pointAt.y > r.y + r.h / 2;
  const dir = below ? 1 : -1;
  const gap = below ? pointAt.y - (r.y + r.h) : r.y - pointAt.y;
  const near = gap <= 72 && pointAt.x > r.x && pointAt.x < r.x + r.w;
  const tipX = Math.round(clamp(pointAt.x, r.x + 30, r.x + r.w - 30)) + 0.5;
  const rad = Math.min(S.radius.l, r.h / 2);
  softShadow(ctx, r.x, r.y + 4, r.w, r.h, rad, 8, 0.3);
  calloutPath(ctx, Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1, rad, tipX, near ? dir : 0);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = UI.accent;
  ctx.stroke();
  const size = TYPE.lead;
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (cur && textWidth(ctx, `${cur} ${w}`, size, 700) > r.w - 36) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  lines.push(cur);
  const lh = size + 4;
  lines.forEach((l, i) => fitLabel(ctx, l, r.x + r.w / 2, r.y + r.h / 2 + 1 + (i - (lines.length - 1) / 2) * lh, size, r.w - 24, { color: UI.text, weight: 700 }));
  if (near) return;
  // the target is further off: a gold arrow bobs over it, pointing at it from the callout's side
  const bob = Math.sin(t * 5) * 4;
  const my = pointAt.y - dir * (34 - bob);
  ctx.fillStyle = UI.text;
  poly(ctx, [pointAt.x - 15, my - dir * 12, pointAt.x + 15, my - dir * 12, pointAt.x, my + dir * 12]);
  ctx.fill();
  ctx.fillStyle = UI.accent;
  poly(ctx, [pointAt.x - 10, my - dir * 8.5, pointAt.x + 10, my - dir * 8.5, pointAt.x, my + dir * 7]);
  ctx.fill();
}

// ------------------------------------------------------------------ the VS bar

export interface VsSide {
  name: string;
  trophies?: number;
  bot?: boolean;
}

/**
 * The friendly framed VS bar: your half in team blue on the left, the opponent's in red on the right, meeting on
 * a slanted seam, both names in bold white, a big VS in the middle, the trophies on small tabs hanging under each
 * end. slide 0..1 brings the halves in from the sides (1 = joined); vs 0..1 pops the VS in.
 */
export function vsBar(ctx: Ctx, r: Rect, o: { left: VsSide; right: VsSide; slide?: number; vs?: number; only?: 0 | 1 }) {
  const slide = clamp(o.slide ?? 1, 0, 1);
  const vsK = clamp(o.vs ?? 1, 0, 1);
  const rad = Math.min(22, r.h * 0.32);
  const cx = r.x + r.w / 2;
  const sk = r.h * 0.16; // half the seam's slant
  const ink = '#26303d';
  const half = (side: 0 | 1) => {
    const off = (1 - slide) * (side === 0 ? -1 : 1) * (W / 2 + 40);
    ctx.save();
    ctx.translate(off, 0);
    // the trophies on a tab hanging under the outer end
    const s = side === 0 ? o.left : o.right;
    if (s.trophies !== undefined) {
      const tw = 104;
      const tx = side === 0 ? r.x + 18 : r.x + r.w - 18 - tw;
      const ty = r.y + r.h - 12;
      rr(ctx, tx, ty, tw, 44, 12);
      ctx.fillStyle = ink;
      ctx.fill();
      rr(ctx, tx + 3, ty, tw - 6, 38, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      trophy(ctx, tx + 24, ty + 24, 18, '#d99400');
      label(ctx, shortNumber(s.trophies), tx + 40, ty + 25, TYPE.body, { align: 'left', weight: 700, color: UI.text });
    }
    // the half itself: a framed block, lit from above
    ctx.beginPath();
    if (side === 0) {
      ctx.moveTo(cx + sk, r.y);
      ctx.lineTo(cx - sk, r.y + r.h);
      ctx.lineTo(r.x + rad, r.y + r.h);
      ctx.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - rad, rad);
      ctx.lineTo(r.x, r.y + rad);
      ctx.arcTo(r.x, r.y, r.x + rad, r.y, rad);
    } else {
      ctx.moveTo(cx + sk, r.y);
      ctx.lineTo(r.x + r.w - rad, r.y);
      ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + rad, rad);
      ctx.lineTo(r.x + r.w, r.y + r.h - rad);
      ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h, rad);
      ctx.lineTo(cx - sk, r.y + r.h);
    }
    ctx.closePath();
    const tm = TEAM[side];
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, tm.light);
    g.addColorStop(0.42, tm.main);
    g.addColorStop(1, tm.dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(r.x, r.y + 4, r.w, r.h * 0.3);
    ctx.restore();
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.stroke();
    // the name, and the BOT tag beside the opponent's
    const al: CanvasTextAlign = side === 0 ? 'left' : 'right';
    const room = r.w / 2 - 60 - (s.bot ? 52 : 0);
    const nx = side === 0 ? r.x + 22 : r.x + r.w - 22;
    const nw = Math.min(room, textWidth(ctx, s.name, TYPE.h3, 700));
    fitLabel(ctx, s.name, nx, r.y + r.h / 2 + 1, TYPE.h3, room, { align: al, weight: 700, color: '#ffffff', outline: 'rgba(20, 30, 50, 0.55)', lw: 1 });
    if (s.bot) botTag(ctx, side === 0 ? nx + nw + 10 : nx - nw - 10 - 44, r.y + r.h / 2, 44);
    ctx.restore();
  };
  if (o.only !== 1) half(0);
  if (o.only !== 0) half(1);
  if (vsK > 0) {
    const k = vsK < 1 ? 1.6 - 0.6 * (1 - (1 - vsK) ** 3) : 1;
    ctx.save();
    ctx.translate(cx, r.y + r.h / 2 + 2);
    ctx.scale(k, k);
    ctx.globalAlpha *= Math.min(1, vsK * 2);
    ctx.font = font(TYPE.h1 + 4, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = ink;
    ctx.strokeText('VS', 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('VS', 0, 0);
    ctx.restore();
  }
}
