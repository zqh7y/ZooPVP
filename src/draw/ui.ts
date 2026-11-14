import { CLASS_FX, H, RAINBOW, S, TEAM, TYPE, UI, W } from '../theme';
import { CLASSES } from '../data';
import { clamp, label, poly, rr, textWidth, type Ctx, type FontWeight, type Rect } from '../util';
import { iconTint, trophy } from './icons';

/*
 * The interface kit: a floodlit night match. Slate surfaces, off-white text, one gold. Things that can be
 * touched are small blocks lit from the upper left (a top face, a darker side face, a contact shadow); the
 * rest is flat slate with a 1 px top highlight. Every screen draws its interface with these.
 */

/** An icon drawer: centre x, y and a box size. */
export type IconFn = (ctx: Ctx, x: number, y: number, size: number) => void;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/** A rounded-rect path on the half pixel, so a 1 px line along it is crisp. */
function hair(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number) {
  rr(ctx, Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1, rad);
}

/** A 1 px horizontal line on the pixel grid. */
function hline(ctx: Ctx, x: number, y: number, w: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
}

/** A soft shadow made of a few see-through layers (cheap, no blur filter). spread: how far it softens out. */
function softShadow(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, spread: number, alpha: number) {
  const n = 3;
  ctx.fillStyle = `rgba(0, 0, 0, ${(alpha / n).toFixed(3)})`;
  for (let i = 0; i < n; i++) {
    const g = (spread * (i + 1)) / n;
    rr(ctx, x - g, y - g * 0.4, w + g * 2, h + g, rad + g);
    ctx.fill();
  }
}

/** Mix two #rrggbb colours. */
function mix(a: string, b: string, k: number) {
  const p = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * clamp(k, 0, 1)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
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

/** primary: the screen's one main action, in gold. Every other variant is neutral slate; danger is the light "drop here" state. */
export type ButtonVariant = 'primary' | 'roll' | 'secondary' | 'quiet' | 'danger';
const VARIANT = {
  primary: { top: UI.accent, side: '#a8860a', hi: 'rgba(255, 255, 255, 0.5)', border: '', text: UI.accentText },
  roll: { top: '#262e3a', side: '#0a0d12', hi: 'rgba(255, 255, 255, 0.12)', border: UI.border, text: UI.text },
  secondary: { top: '#262e3a', side: '#0a0d12', hi: 'rgba(255, 255, 255, 0.12)', border: UI.border, text: UI.text },
  quiet: { top: '#1b222b', side: '#080a0e', hi: 'rgba(255, 255, 255, 0.07)', border: UI.border, text: UI.textDim },
  danger: { top: '#e9ecef', side: '#8b949e', hi: 'rgba(255, 255, 255, 0.6)', border: '', text: UI.accentText },
};
const DISABLED = { top: '#141920', side: '#0b0e12', hi: 'rgba(255, 255, 255, 0.03)', border: UI.border, text: UI.textMute };

/** How deep a button's side face is: the top face travels this far when pressed. */
export const BUTTON_DEPTH = 4;

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
 * A button as a small block lit from the upper left: a top face, a side face BUTTON_DEPTH px deep and a contact
 * shadow. Pressed, the top face travels down into the side and springs back on release. Returns the face's
 * centre y.
 */
export function button(ctx: Ctx, r: Rect, o: ButtonOpts = {}) {
  const v = o.disabled ? DISABLED : VARIANT[o.variant ?? 'primary'];
  const rad = S.radius.m;
  const D = BUTTON_DEPTH;
  const k = pressAmount(`${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`, !!o.pressed && !o.disabled);
  const travel = D * k;
  const fh = r.h - D;
  const fy = r.y + travel;
  if (o.pulse && !o.disabled) {
    const p = clamp(o.pulse, 0, 1);
    rr(ctx, r.x - 2 - 6 * p, r.y - 2 - 6 * p, r.w + 4 + 12 * p, r.h + 4 + 12 * p, rad + 2 + 6 * p);
    ctx.save();
    ctx.lineWidth = S.line.ui;
    ctx.globalAlpha *= 1 - p;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    ctx.restore();
  }
  // the contact shadow tightens as the block is pressed into the ground
  softShadow(ctx, r.x, r.y + 3, r.w, r.h, rad, 6 - 3 * clamp(k, 0, 1), 0.45);
  if (o.breathe !== undefined && !o.disabled) {
    ctx.save();
    ctx.shadowColor = `rgba(255, 210, 31, ${(0.22 + 0.16 * Math.sin(o.breathe * 2.2)).toFixed(3)})`;
    ctx.shadowBlur = 22;
    rr(ctx, r.x, r.y + 2, r.w, r.h - 2, rad);
    ctx.fillStyle = v.side;
    ctx.fill();
    ctx.restore();
  }
  // side face, then the top face on it
  rr(ctx, r.x, r.y + D, r.w, r.h - D, rad);
  ctx.fillStyle = v.side;
  ctx.fill();
  rr(ctx, r.x, fy, r.w, fh, rad);
  ctx.fillStyle = v.top;
  ctx.fill();
  if (v.border) {
    hair(ctx, r.x, fy, r.w, fh, rad);
    ctx.lineWidth = 1;
    ctx.strokeStyle = v.border;
    ctx.stroke();
  }
  // the key light catches the top edge
  hline(ctx, r.x + rad, fy + 1, r.w - rad * 2, v.hi);
  const cy = fy + fh / 2;
  const big = r.h >= S.btnH - 8;
  const size = big ? TYPE.button : r.h >= 44 ? TYPE.lead : TYPE.label;
  const weight: FontWeight = big ? 700 : 600;
  const track = size * 0.07;
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
    ctx.globalAlpha *= 0.7;
    fitLabel(ctx, o.sub.toUpperCase(), r.x + r.w / 2, cy + size * 0.58, TYPE.tag, r.w - pad * 2, { color: v.text, track: 1 });
    ctx.restore();
  }
  if (o.badge !== undefined && o.badge !== 0) {
    const s = String(o.badge);
    const bw = Math.max(24, 14 + textWidth(ctx, s, TYPE.caption, 700));
    const bx = Math.round(r.x + r.w - bw + 6);
    const by = Math.round(fy - 8);
    const onGold = !o.disabled && (o.variant ?? 'primary') === 'primary';
    rr(ctx, bx - 2, by - 2, bw + 4, 26, S.radius.s + 2);
    ctx.fillStyle = UI.bg;
    ctx.fill();
    rr(ctx, bx, by, bw, 22, S.radius.s);
    ctx.fillStyle = o.disabled ? UI.borderStrong : onGold ? UI.text : UI.accent;
    ctx.fill();
    label(ctx, s, bx + bw / 2, by + 12, TYPE.caption, { color: UI.accentText, weight: 700 });
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

/** A flat slate plate with a 1 px top highlight. */
function plate(ctx: Ctx, r: Rect, fill: string, rad: number = S.radius.m) {
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = fill;
  ctx.fill();
  hair(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.lineWidth = 1;
  ctx.strokeStyle = UI.border;
  ctx.stroke();
  hline(ctx, r.x + rad, r.y + 1, r.w - rad * 2, 'rgba(255, 255, 255, 0.06)');
}

/**
 * A stat chip: a glyph at the left, the value beside it. "POWER 3314" is drawn as a dim caption and a bright
 * number. A number ticks to its new value and shows in gold while it moves.
 */
export function pill(ctx: Ctx, r: Rect, o: PillOpts) {
  plate(ctx, r, UI.surface);
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
    hair(ctx, r.x, r.y, r.w, r.h, S.radius.m);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.globalAlpha *= bump;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    ctx.restore();
  }
  const cy = r.y + r.h / 2;
  const pad = Math.min(16, r.h * 0.32);
  const size = Math.min(TYPE.h3, r.h * 0.5);
  const color = bump > 0.4 ? UI.accent : UI.text;
  const parts = /^([A-Za-z ]+) ([\d.,]+[KMB]?)$/.exec(text);
  const iconSize = o.icon ? Math.min(r.h - 22, 24) : 0;
  let x0 = r.x + pad;
  if (o.icon) {
    o.icon(ctx, x0 + iconSize / 2, cy, iconSize);
    x0 += iconSize + 10;
  }
  const room = r.x + r.w - pad - x0;
  if (parts) {
    const cs = TYPE.small;
    const cw = textWidth(ctx, parts[1].toUpperCase(), cs, 600, 1.5);
    const vw = textWidth(ctx, parts[2], size, 700);
    const total = cw + 8 + vw;
    const k = Math.min(1, room / total);
    const sx = o.icon ? x0 : r.x + (r.w - total * k) / 2;
    label(ctx, parts[1].toUpperCase(), sx, cy + 1, cs * k, { align: 'left', color: UI.textDim, track: 1.5 * k });
    label(ctx, parts[2], sx + (cw + 8) * k, cy + 1, size * k, { align: 'left', color, weight: 700 });
  } else if (o.icon) fitLabel(ctx, text, x0, cy + 1, size, room, { align: 'left', color, weight: 700 });
  else fitLabel(ctx, text, r.x + r.w / 2, cy + 1, size, r.w - pad * 2, { color, weight: 700 });
}

/** POWER and its number: the one chip every screen shows an army's strength with (the lobby's stage, each side in match). */
export function powerChip(ctx: Ctx, r: Rect, power: number) {
  pill(ctx, r, { text: `POWER ${Math.round(power)}` });
}

// ------------------------------------------------------------------ panels and cells

/** A flat slate panel with a 1 px top highlight; 'dark' is see-through slate for panels over the pitch. A title sits on the top edge. */
export function panel(ctx: Ctx, r: Rect, o: { title?: string; tone?: 'paper' | 'dark' } = {}) {
  plate(ctx, r, o.tone === 'dark' ? UI.glass : UI.surface, S.radius.l);
  if (o.title) {
    const s = o.title.toUpperCase();
    const w = Math.min(r.w - 40, textWidth(ctx, s, TYPE.small, 600, 2) + 28);
    plate(ctx, { x: Math.round(r.x + r.w / 2 - w / 2), y: Math.round(r.y - 12), w: Math.round(w), h: 24 }, UI.surfaceAlt, S.radius.s);
    fitLabel(ctx, s, r.x + r.w / 2, r.y + 1, TYPE.small, w - 16, { color: UI.textDim, track: 2 });
  }
}

/** The well the grid and the bench sit in: recessed, so its top and left edges fall into shadow and its lower lips catch the light. */
export function gridFrame(ctx: Ctx, r: Rect) {
  const m = 6;
  const x = r.x - m;
  const y = r.y - m;
  const w = r.w + m * 2;
  const h = r.h + m * 2;
  const rad = S.radius.l;
  rr(ctx, x, y, w, h, rad);
  ctx.fillStyle = '#080b0f';
  ctx.fill();
  ctx.save();
  rr(ctx, x, y, w, h, rad);
  ctx.clip();
  const top = ctx.createLinearGradient(0, y, 0, y + 14);
  top.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
  top.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(x, y, w, 14);
  const left = ctx.createLinearGradient(x, 0, x + 10, 0);
  left.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  left.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = left;
  ctx.fillRect(x, y, 10, h);
  ctx.restore();
  // the lips: dark where the light cannot reach, a faint highlight on the lower and right ones
  hair(ctx, x, y, w, h, rad);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();
  hline(ctx, x + rad, y + h - 1, w - rad * 2, 'rgba(255, 255, 255, 0.09)');
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(Math.round(x + w - 1), Math.round(y + rad), 1, Math.round(h - rad * 2));
}

/** One slot in the well: a faint square with a shadowed top edge and a lit lower edge. */
export function cell(ctx: Ctx, r: Rect, state: 'empty' | 'ok' | 'bad' | 'fuse' = 'empty') {
  const x = Math.round(r.x + 2);
  const y = Math.round(r.y + 2);
  const w = Math.round(r.w - 4);
  const h = Math.round(r.h - 4);
  rr(ctx, x, y, w, h, S.radius.s);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.028)';
  ctx.fill();
  hline(ctx, x + 3, y, w - 6, 'rgba(0, 0, 0, 0.45)');
  hline(ctx, x + 3, y + h - 1, w - 6, 'rgba(255, 255, 255, 0.04)');
  if (state === 'empty') return;
  const c = state === 'ok' ? UI.text : state === 'bad' ? UI.danger : UI.accent;
  ctx.save();
  rr(ctx, x, y, w, h, S.radius.s);
  ctx.globalAlpha *= 0.14;
  ctx.fillStyle = c;
  ctx.fill();
  ctx.globalAlpha /= 0.14;
  hair(ctx, x, y, w, h, S.radius.s);
  ctx.lineWidth = 1;
  ctx.strokeStyle = c;
  ctx.stroke();
  ctx.restore();
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

/** The slow white-gold shimmer of SSS, as a gradient that drifts along the line x0,y0 -> x1,y1 (the name is historical). */
export function rainbow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const n = RAINBOW.length;
  const sh = (((t * 0.25) % 1) + 1) % 1;
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const c = Math.floor(((u + sh) % 1) * n);
    g.addColorStop(u, RAINBOW[c % n]);
  }
  return g;
}

/** Text colour for a class (level 1..7), readable on slate: greys, silver, gold; SSS breathes between white and gold. */
export function classColor(level: number, t: number) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  return i === 6 ? mix(UI.tierText[6], UI.accent, 0.5 + 0.5 * Math.sin(t * 1.4)) : UI.tierText[i];
}

/** How deep a tile's side face is, for a tile h px tall. */
export const tileDepth = (h: number) => clamp(Math.round(h * 0.07), 3, 8);
/** How far a lifted tile rises. */
export const TILE_LIFT = 6;

// the side face of a tile: dark slate, warming to dark gold for A and above
const TILE_SIDE = ['#191f27', '#1a2029', '#1b222b', '#1d242e', '#40351f', '#56420f', '#62542c'];

/**
 * The tile a piece sits on (level 1..7 = E..SSS): a small block lit from the upper left. A top face on
 * UI.tile, a side face below it, a contact shadow on the ground; the class is the thin line around the top
 * face. A lifted tile rises: its side grows and its shadow spreads, softens and falls away.
 */
export function tileFrame(ctx: Ctx, r: Rect, level: number, o: { idle?: boolean; lifted?: boolean; t?: number } = {}) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const rad = S.radius.m;
  const D = tileDepth(r.h);
  const L = o.lifted ? TILE_LIFT : 0;
  const side = D + L * 0.5;
  const fy = r.y - L;
  const fh = r.h - D;
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.5;
  // the shadow stays on the ground
  if (o.lifted) softShadow(ctx, r.x + 3, r.y + 6, r.w - 6, r.h - 2, rad, 10, 0.4);
  else softShadow(ctx, r.x, r.y + 2, r.w, r.h - 1, rad, 2.5, 0.55);
  // side face
  rr(ctx, r.x, fy + side, r.w, fh, rad);
  ctx.fillStyle = TILE_SIDE[i];
  ctx.fill();
  // top face
  rr(ctx, r.x, fy, r.w, fh, rad);
  ctx.fillStyle = o.lifted ? UI.tileHi : UI.tile;
  ctx.fill();
  // a faint pool of the key light on the top face, up and left of centre, so a dark picture still lifts off it
  const lx = r.x + r.w * 0.42;
  const ly = fy + fh * 0.4;
  const spot = ctx.createRadialGradient(lx, ly, 0, lx, ly, r.w * 0.62);
  spot.addColorStop(0, 'rgba(255, 255, 255, 0.075)');
  spot.addColorStop(1, 'rgba(255, 255, 255, 0)');
  rr(ctx, r.x, fy, r.w, fh, rad);
  ctx.fillStyle = spot;
  ctx.fill();
  // the key light: a faint highlight along the top and left edges (gold on A and above)
  ctx.beginPath();
  ctx.moveTo(r.x + 0.5, fy + fh - rad);
  ctx.lineTo(r.x + 0.5, fy + rad);
  ctx.arcTo(r.x + 0.5, fy + 0.5, r.x + rad, fy + 0.5, rad - 0.5);
  ctx.lineTo(r.x + r.w - rad, fy + 0.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = i >= 4 ? 'rgba(255, 214, 90, 0.55)' : 'rgba(255, 255, 255, 0.13)';
  ctx.stroke();
  // the class line around the top face
  rr(ctx, r.x + 1, fy + 1, r.w - 2, fh - 2, rad - 1);
  ctx.lineWidth = i >= 5 ? 2 : i >= 3 ? 1.5 : 1;
  ctx.strokeStyle = i === 6 ? rainbow(ctx, r.x, fy, r.x + r.w, fy + fh, o.t ?? 0) : UI.tier[i];
  ctx.globalAlpha *= i === 0 ? 0.8 : 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * What the top classes add over their tile: A a slow faint sheen, S a soft gold glow, SSS a slow white-gold
 * sheen and a white-gold glow. r is the tile's rect (raised already if the tile is lifted).
 */
export function classFx(ctx: Ctx, r: Rect, level: number, t: number) {
  const lv = Math.round(level);
  if (lv < 5) return;
  const rad = S.radius.m;
  const fh = r.h - tileDepth(r.h);
  if (lv >= 6) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    ctx.save();
    rr(ctx, r.x - 1, r.y - 1, r.w + 2, fh + 2, rad + 1);
    ctx.shadowColor = lv >= 7 ? CLASS_FX.sss : CLASS_FX.s;
    ctx.shadowBlur = 10 + 4 * pulse;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = lv >= 7 ? CLASS_FX.sss : CLASS_FX.s;
    ctx.globalAlpha *= 0.3 + 0.25 * pulse;
    ctx.stroke();
    ctx.restore();
  }
  // the sheen: one soft band crossing the top face now and then
  const period = lv === 5 ? 5 : lv === 6 ? 4 : 3.2;
  const u = (t / period) % 1;
  if (u > 0.45) return;
  ctx.save();
  rr(ctx, r.x + 1, r.y + 1, r.w - 2, fh - 2, rad - 1);
  ctx.clip();
  const span = r.w + fh + 40;
  const sx = r.x - 20 + (u / 0.45) * span;
  const band = ctx.createLinearGradient(sx - 18, 0, sx + 18, 0);
  const c = lv >= 7 ? '255, 246, 214' : '255, 255, 255';
  const a = lv === 5 ? 0.1 : lv === 6 ? 0.14 : 0.3;
  band.addColorStop(0, `rgba(${c}, 0)`);
  band.addColorStop(0.5, `rgba(${c}, ${a})`);
  band.addColorStop(1, `rgba(${c}, 0)`);
  ctx.fillStyle = band;
  poly(ctx, [sx - 18, r.y, sx + 18, r.y, sx + 18 - fh * 0.6, r.y + fh, sx - 18 - fh * 0.6, r.y + fh]);
  ctx.fill();
  ctx.restore();
}

/** Class letter on a small dark chip, in the class tone. Left edge at x, centred on y; k scales it. */
export function classBadge(ctx: Ctx, level: number, x: number, y: number, k: number, t = 0) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const letter = CLASSES[i];
  const size = Math.max(TYPE.tiny, TYPE.tag * k);
  const q = size / TYPE.tag; // the chip follows its letter, so a small tile still gets a readable one
  const h = 16 * q;
  const w = letter.length > 1 ? 30 * q : 16 * q;
  rr(ctx, x, y - h / 2, w, h, 3 * q);
  ctx.fillStyle = UI.scrim;
  ctx.fill();
  const color = i === 6 ? rainbow(ctx, x, y, x + w, y, t) : UI.tierText[i];
  label(ctx, letter, x + w / 2, y + 0.8 * q, size, { color, weight: 700, track: letter.length > 1 ? 0.6 * q : 0 });
}

/** "×4" on a small dark chip, centred on x, y. */
export function countBadge(ctx: Ctx, count: number, x: number, y: number, k = 1) {
  const s = `×${count}`;
  const size = Math.max(TYPE.tiny, TYPE.tag * k);
  const q = size / TYPE.tag;
  const w = textWidth(ctx, s, size, 700, 0) + 9 * q;
  const h = 16 * q;
  rr(ctx, x - w / 2, y - h / 2, w, h, 3 * q);
  ctx.fillStyle = UI.scrim;
  ctx.fill();
  label(ctx, s, x, y + 0.8 * q, size, { color: UI.text, weight: 700, track: 0 });
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
  plate(ctx, full, UI.glass, full.h > r.h ? S.radius.l : S.radius.m);
  ctx.save();
  rr(ctx, full.x, full.y, full.w, full.h, full.h > r.h ? S.radius.l : S.radius.m);
  ctx.clip();
  ctx.fillStyle = TEAM[o.team].main;
  ctx.fillRect(Math.round(right ? r.x + r.w - 4 : r.x), r.y, 4, full.h);
  ctx.restore();
  if (full.h > r.h) hline(ctx, r.x + 16, r.y + r.h - 1, r.w - 32, UI.border);
  const pad = 16;
  const dir = right ? -1 : 1;
  const ax = right ? r.x + r.w - pad : r.x + pad;
  const al: CanvasTextAlign = right ? 'right' : 'left';
  const tag = o.bot ? 36 : 0;
  const mid = r.y + r.h / 2;
  const two = r.h > 44;
  const nameY = two ? mid - 10 : mid;
  fitLabel(ctx, o.name, ax, nameY + 1, TYPE.lead, r.w - pad * 2 - (tag ? tag + 8 : 0), { align: al, weight: 700 });
  if (two) {
    trophy(ctx, ax + dir * 7, mid + 13, 14);
    label(ctx, shortNumber(o.trophies), ax + dir * 20, mid + 14, TYPE.caption, { align: al, color: UI.textDim });
  }
  if (o.bot) botTag(ctx, right ? r.x + pad - 4 : r.x + r.w - pad - tag + 4, nameY, tag);
}

/** The BOT tag the opponent's name always carries: a small grey chip, left edge at x, centred on y. */
export function botTag(ctx: Ctx, x: number, y: number, w = 36) {
  rr(ctx, Math.round(x), Math.round(y - 9), w, 19, S.radius.s);
  ctx.fillStyle = UI.borderStrong;
  ctx.fill();
  label(ctx, 'BOT', x + w / 2, y + 1.5, TYPE.tag, { weight: 700, track: 1.5 });
}

export interface ScoreSide {
  name: string;
  /** the big number beside the clock (fighters left, a score) */
  score: number | string;
  bot?: boolean;
}

/** The score bug's size: pass SCORE_BUG.h as its rect's height, wherever it is drawn. */
export const SCORE_BUG = { h: 40 };

/**
 * A broadcast score bug: [team bar | NAME | score | clock | score | NAME BOT | team bar], in one slate strip.
 * home is your side (blue), away the opponent (red). flash 0..1 lights the clock in gold for a moment; hot keeps
 * it gold with a gold line under it (overtime).
 */
export function scoreBug(ctx: Ctx, r: Rect, o: { home: ScoreSide; away: ScoreSide; clock: string; flash?: number; hot?: boolean }) {
  const rad = S.radius.m;
  softShadow(ctx, r.x, r.y + 2, r.w, r.h, rad, 4, 0.35);
  plate(ctx, r, UI.surface);
  const clockW = 76;
  const scoreW = 52;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.clip();
  ctx.fillStyle = TEAM[0].main;
  ctx.fillRect(Math.round(r.x), r.y, 4, r.h);
  ctx.fillStyle = TEAM[1].main;
  ctx.fillRect(Math.round(r.x + r.w - 4), r.y, 4, r.h);
  // the score cells, a shade lighter, and the clock in the middle
  ctx.fillStyle = UI.surfaceAlt;
  ctx.fillRect(Math.round(cx - clockW / 2 - scoreW), r.y, scoreW, r.h);
  ctx.fillRect(Math.round(cx + clockW / 2), r.y, scoreW, r.h);
  ctx.fillStyle = UI.bg;
  ctx.fillRect(Math.round(cx - clockW / 2), r.y, clockW, r.h);
  if (o.hot) {
    ctx.fillStyle = UI.accent;
    ctx.fillRect(Math.round(cx - clockW / 2), Math.round(r.y + r.h - 2), clockW, 2);
  }
  ctx.restore();
  const f = clamp(o.flash ?? 0, 0, 1);
  label(ctx, o.clock, cx, cy + 1, TYPE.lead, { color: o.hot || f > 0.4 ? UI.accent : UI.text, weight: 700, track: 1 });
  const size = TYPE.h2;
  label(ctx, String(o.home.score), cx - clockW / 2 - scoreW / 2, cy + 1, size, { weight: 700 });
  label(ctx, String(o.away.score), cx + clockW / 2 + scoreW / 2, cy + 1, size, { weight: 700 });
  const room = r.w / 2 - clockW / 2 - scoreW - 20;
  fitLabel(ctx, o.home.name.toUpperCase(), r.x + 14, cy + 1, TYPE.body, room - (o.home.bot ? 42 : 0), { align: 'left', track: 1 });
  const tag = o.away.bot ? 42 : 0;
  fitLabel(ctx, o.away.name.toUpperCase(), r.x + r.w - 14, cy + 1, TYPE.body, room - tag, { align: 'right', track: 1 });
  if (o.away.bot) botTag(ctx, cx + clockW / 2 + scoreW + 8, cy);
  if (o.home.bot) botTag(ctx, cx - clockW / 2 - scoreW - 44, cy);
}

/** A plain fill bar, 0..1, with a hairline of light along its top and a slow sheen passing over the fill. */
export function progressBar(ctx: Ctx, r: Rect, value: number, o: { color?: string; light?: string; back?: string } = {}) {
  const v = clamp(value, 0, 1);
  const rad = Math.min(3, r.h / 2);
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = o.back ?? UI.track;
  ctx.fill();
  if (v <= 0.001) return;
  const fw = r.w * v;
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.clip();
  ctx.fillStyle = o.color ?? UI.accent;
  ctx.fillRect(r.x, r.y, fw, r.h);
  if (r.h >= 4) {
    ctx.fillStyle = o.light ?? 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(r.x, r.y, fw, 1);
  }
  const u = (now() / 3.2) % 1;
  if (u < 0.5) {
    const sx = r.x - 30 + (u / 0.5) * (fw + 60);
    const g = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, fw, r.h);
  }
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(r.x, Math.round(r.y), r.w, 1);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(r.x, Math.round(r.y + r.h - 2), r.w, 2);
  ctx.restore();
  ctx.fillStyle = UI.bg;
  ctx.fillRect(sx - 3, r.y - 3, 6, r.h + 6);
  ctx.fillStyle = UI.text;
  ctx.fillRect(sx - 1, r.y - 3, 2, r.h + 6);
}

/** A segmented meter (the roll meter). value 0..1; `ticks` equal segments; gold when full. */
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

/** A title slab's tone: accent is the gold (a win, a reward), plain off-white, muted grey (a loss). */
export type RibbonTone = 'accent' | 'plain' | 'muted';
/** The tone names from the old palette, still read: gold and jade are accent, red plain, indigo muted. */
type OldRibbonTone = 'red' | 'gold' | 'indigo' | 'jade';
const RIBBON_TONE: Record<RibbonTone | OldRibbonTone, RibbonTone> = { accent: 'accent', plain: 'plain', muted: 'muted', gold: 'accent', jade: 'accent', red: 'plain', indigo: 'muted' };

/**
 * A title slab (VICTORY, DEFEAT, FIGHT!, +1 ROLL): a flat dark plate with a thin rule under big letters, centred
 * on cx, cy. sub: a quiet caption line inside the plate under the title (the plate grows down for it).
 */
export function ribbon(ctx: Ctx, cx: number, cy: number, w: number, text: string, o: { color?: RibbonTone | OldRibbonTone; size?: number; sub?: string } = {}) {
  const tone = RIBBON_TONE[o.color ?? 'plain'];
  const hot = tone === 'accent';
  const size = o.size ?? TYPE.title;
  const subH = o.sub ? TYPE.caption + S.pad + S.base : 0;
  const h = Math.round(size * 1.3) + subH;
  const x0 = cx - w / 2;
  const y0 = cy - Math.round(size * 1.3) / 2;
  ctx.save();
  rr(ctx, x0, y0, w, h, S.radius.s);
  ctx.fillStyle = UI.glass;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(x0, y0, w, 1);
  ctx.fillStyle = hot ? UI.accent : tone === 'plain' ? UI.text : UI.textDim;
  ctx.fillRect(x0, y0 + h - 3, w, 3);
  ctx.restore();
  fitLabel(ctx, text.toUpperCase(), cx, cy + 1, size, w - 32, { color: hot ? UI.accent : UI.text, weight: 700, track: size * 0.06 });
  if (o.sub) fitLabel(ctx, o.sub.toUpperCase(), cx, y0 + h - 3 - subH / 2 - 2, TYPE.caption, w - 32, { color: UI.textDim, track: 1.5 });
}

/** A floating line of text that rises and fades; age in seconds (about 0..1.4). */
export function toast(ctx: Ctx, text: string, x: number, y: number, age: number) {
  const a = age < 0.15 ? age / 0.15 : clamp(1 - (age - 0.9) / 0.5, 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  label(ctx, text, x, y - age * 30, TYPE.h3, { color: UI.accent, weight: 700, onPitch: true });
  ctx.restore();
}

/** A rounded rect with a small tail on its top (dir -1) or bottom (dir 1) edge at tipX; dir 0 for none. */
function calloutPath(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, tipX: number, dir: number) {
  const tail = 8;
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
 * is just past its edge, else with a gold arrow bobbing over the target. A slate plate with a gold hairline.
 */
export function hint(ctx: Ctx, r: Rect, text: string, pointAt: { x: number; y: number }, t = 0) {
  const below = pointAt.y > r.y + r.h / 2;
  const dir = below ? 1 : -1;
  const gap = below ? pointAt.y - (r.y + r.h) : r.y - pointAt.y;
  const near = gap <= 72 && pointAt.x > r.x && pointAt.x < r.x + r.w;
  const tipX = Math.round(clamp(pointAt.x, r.x + 24, r.x + r.w - 24)) + 0.5;
  softShadow(ctx, r.x, r.y + 3, r.w, r.h, S.radius.m, 6, 0.45);
  calloutPath(ctx, Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1, S.radius.m, tipX, near ? dir : 0);
  ctx.fillStyle = UI.surface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = UI.accent;
  ctx.stroke();
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
  const lh = size + 4;
  lines.forEach((l, i) => fitLabel(ctx, l, r.x + r.w / 2, r.y + r.h / 2 + 1 + (i - (lines.length - 1) / 2) * lh, size, r.w - 24, { color: UI.text }));
  if (near) return;
  // the target is further off: a small gold arrow bobs over it, pointing at it from the callout's side
  const bob = Math.sin(t * 5) * 3;
  const my = pointAt.y - dir * (30 - bob);
  ctx.fillStyle = UI.bg;
  poly(ctx, [pointAt.x - 12, my - dir * 10, pointAt.x + 12, my - dir * 10, pointAt.x, my + dir * 10]);
  ctx.fill();
  ctx.fillStyle = UI.accent;
  poly(ctx, [pointAt.x - 8, my - dir * 7, pointAt.x + 8, my - dir * 7, pointAt.x, my + dir * 6]);
  ctx.fill();
}
