import { CLASS_FX, COLOR, FONT, RAINBOW, S, TEAM, TIER, TYPE } from '../theme';
import { CLASSES } from '../data';
import { clamp, fillStroke, hash, label, poly, rr, starPath, type Ctx, type Rect } from '../util';
import { hand } from './icons';

/** An icon drawer: centre x, y and a box size. */
export type IconFn = (ctx: Ctx, x: number, y: number, size: number) => void;

const INK = COLOR.ink;

// ------------------------------------------------------------------ text

/** Plain text on paper: ink-brown, no outline. */
export function inkText(ctx: Ctx, s: string, x: number, y: number, size: number, o: { color?: string; align?: CanvasTextAlign } = {}) {
  ctx.font = `${Math.round(size)}px ${FONT}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color ?? COLOR.textInk;
  ctx.fillText(s, x, y);
}

/** Outlined label that shrinks (down to 55%) to fit a width. */
export function fitLabel(ctx: Ctx, s: string, x: number, y: number, size: number, maxW: number, o: { color?: string; align?: CanvasTextAlign; outline?: string; lw?: number } = {}) {
  ctx.font = `${Math.round(size)}px ${FONT}`;
  const wide = ctx.measureText(s).width;
  const k = wide > maxW ? Math.max(0.55, maxW / wide) : 1;
  label(ctx, s, x, y, size * k, o);
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

export type ButtonVariant = 'primary' | 'roll' | 'secondary' | 'quiet';
const VARIANT = {
  primary: { top: COLOR.vermilion, light: COLOR.vermilionLight, lip: COLOR.vermilionDark, text: COLOR.white },
  roll: { top: COLOR.jade, light: COLOR.jadeLight, lip: COLOR.jadeDark, text: COLOR.white },
  secondary: { top: COLOR.indigo, light: COLOR.indigoLight, lip: COLOR.indigoDark, text: COLOR.white },
  quiet: { top: COLOR.paper, light: COLOR.white, lip: COLOR.paperEdge, text: COLOR.textInk },
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
  /** 0..1, a throb that tells the player to press this */
  pulse?: number;
}

/** Candy button with a darker lip below; pressed sinks onto the lip. Returns the face's centre y. */
export function button(ctx: Ctx, r: Rect, o: ButtonOpts = {}) {
  const v = o.disabled ? { top: '#b9b3c2', light: '#d8d3df', lip: '#8d869a', text: '#efeaf3' } : VARIANT[o.variant ?? 'primary'];
  const lip = Math.min(8, r.h * 0.1);
  const sink = o.pressed && !o.disabled ? lip * 0.7 : 0;
  const rad = Math.min(S.radius.l, r.h * 0.3);
  const lw = S.line.bold;
  if (o.pulse) {
    const k = clamp(o.pulse, 0, 1);
    rr(ctx, r.x - 6 * k, r.y - 6 * k, r.w + 12 * k, r.h + 12 * k, rad + 6);
    ctx.lineWidth = 5;
    ctx.strokeStyle = `rgba(255, 240, 168, ${0.9 - 0.6 * k})`;
    ctx.stroke();
  }
  rr(ctx, r.x, r.y + lip, r.w, r.h - lip, rad);
  fillStroke(ctx, v.lip, lw);
  const fy = r.y + sink;
  const fh = r.h - lip;
  rr(ctx, r.x, fy, r.w, fh, rad);
  fillStroke(ctx, v.top, lw);
  if (!o.disabled) {
    rr(ctx, r.x + 7, fy + 5, r.w - 14, fh * 0.34, rad * 0.55);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  const cy = fy + fh / 2;
  const big = r.h >= S.btnH - 8;
  const size = big ? TYPE.h1 : r.h >= 44 ? TYPE.h2 : TYPE.body;
  const ty = o.sub ? cy - size * 0.28 : cy;
  const iconSize = Math.min(fh - 14, size * 1.5);
  const pad = 14;
  const textColor = v.text;
  const outline = o.variant === 'quiet' && !o.disabled ? 'rgba(0,0,0,0)' : INK;
  const lwText = o.variant === 'quiet' && !o.disabled ? 0 : undefined;
  const draw = (s: string, x: number, y: number, sz: number, maxW: number, align: CanvasTextAlign) => {
    if (lwText === 0) {
      ctx.font = `${sz}px ${FONT}`;
      const k = Math.min(1, maxW / ctx.measureText(s).width);
      inkText(ctx, s, x, y, sz * k, { align, color: textColor });
    } else fitLabel(ctx, s, x, y, sz, maxW, { align, color: textColor, outline });
  };
  if (o.icon && o.text) {
    ctx.font = `${size}px ${FONT}`;
    const tw = Math.min(ctx.measureText(o.text).width + 6, r.w - pad * 2 - iconSize - 8);
    const total = iconSize + 8 + tw;
    const x0 = r.x + (r.w - total) / 2;
    o.icon(ctx, x0 + iconSize / 2, cy, iconSize);
    draw(o.text, x0 + iconSize + 8, ty, size, tw, 'left');
  } else if (o.icon) o.icon(ctx, r.x + r.w / 2, cy, iconSize);
  else if (o.text) draw(o.text, r.x + r.w / 2, ty, size, r.w - pad * 2, 'center');
  if (o.sub) draw(o.sub, r.x + r.w / 2, cy + size * 0.62, TYPE.small, r.w - pad * 2, 'center');
  if (o.badge !== undefined && o.badge !== 0) {
    const s = String(o.badge);
    const bw = Math.max(26, 14 + s.length * 11);
    rr(ctx, r.x + r.w - bw + 8, r.y - 9, bw, 26, 13);
    fillStroke(ctx, COLOR.gold, S.line.ui);
    label(ctx, s, r.x + r.w - bw / 2 + 8, r.y + 4.5, TYPE.small + 2, { color: COLOR.ink, outline: 'rgba(0,0,0,0)', lw: 0 });
  }
  return cy;
}

export interface PillOpts {
  icon?: IconFn;
  text: string;
  /** 0..1, a white flash on the number well when it changes */
  flash?: number;
}

/** Top-bar pill: paper body, icon at the left, the value in a recessed well. */
export function pill(ctx: Ctx, r: Rect, o: PillOpts) {
  const h = r.h;
  rr(ctx, r.x, r.y + 3, r.w, h - 3, h / 2);
  fillStroke(ctx, COLOR.paperEdge, S.line.ui);
  rr(ctx, r.x, r.y, r.w, h - 4, h / 2);
  fillStroke(ctx, COLOR.paper, S.line.ui);
  const cy = r.y + (h - 4) / 2;
  const iw = h - 4;
  const win = { x: r.x + iw - 2, y: cy - 15, w: r.w - iw - 8, h: 30 };
  rr(ctx, win.x, win.y, win.w, win.h, 15);
  fillStroke(ctx, COLOR.well, S.line.thin + 0.5);
  rr(ctx, win.x + 4, win.y + 3, win.w - 8, 5, 2.5);
  ctx.fillStyle = COLOR.wellShade;
  ctx.fill();
  if (o.flash) {
    rr(ctx, win.x, win.y, win.w, win.h, 15);
    ctx.fillStyle = `rgba(255,255,255,${0.6 * clamp(o.flash, 0, 1)})`;
    ctx.fill();
  }
  if (o.icon) o.icon(ctx, r.x + iw / 2 + 2, cy, iw - 8);
  const bump = clamp(o.flash ?? 0, 0, 1);
  ctx.font = `${TYPE.body + 2}px ${FONT}`;
  const k = Math.min(1, (win.w - 14) / ctx.measureText(o.text).width);
  inkText(ctx, o.text, win.x + win.w / 2, cy + 1, (TYPE.body + 2) * k * (1 + bump * 0.18), { color: bump > 0.4 ? COLOR.goldDark : COLOR.textInk });
}

// ------------------------------------------------------------------ panels and cells

/** Washi-paper panel with a plum outline; an optional title sits on a tab above. */
export function panel(ctx: Ctx, r: Rect, o: { title?: string; tone?: 'paper' | 'dark' } = {}) {
  const dark = o.tone === 'dark';
  rr(ctx, r.x, r.y + 5, r.w, r.h, S.radius.l);
  fillStroke(ctx, dark ? COLOR.gridInnerEdge : COLOR.paperEdge, S.line.bold);
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.l);
  fillStroke(ctx, dark ? COLOR.gridInner : COLOR.paper, S.line.bold);
  rr(ctx, r.x + 6, r.y + 6, r.w - 12, r.h - 12, S.radius.m);
  ctx.lineWidth = 2;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(201,173,134,0.55)';
  ctx.setLineDash([2, 7]);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.setLineDash([]);
  if (o.title) {
    ctx.font = `${TYPE.h2}px ${FONT}`;
    const w = Math.min(r.w - 40, ctx.measureText(o.title).width + 44);
    const t = { x: r.x + r.w / 2 - w / 2, y: r.y - 20, w, h: 40 };
    rr(ctx, t.x, t.y + 4, t.w, t.h, 14);
    fillStroke(ctx, COLOR.indigoDark, S.line.ui);
    rr(ctx, t.x, t.y, t.w, t.h, 14);
    fillStroke(ctx, COLOR.indigo, S.line.ui);
    fitLabel(ctx, o.title, t.x + t.w / 2, t.y + t.h / 2 + 1, TYPE.h2, t.w - 24);
  }
}

/** The dark wooden inset the grid and the bench sit in. */
export function gridFrame(ctx: Ctx, r: Rect) {
  rr(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, S.radius.l);
  fillStroke(ctx, COLOR.gridFrame, S.line.bold);
  rr(ctx, r.x - 6, r.y - 6, r.w + 12, 8, S.radius.m);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.m);
  fillStroke(ctx, COLOR.gridInner, S.line.ui);
  rr(ctx, r.x + 2, r.y + 2, r.w - 4, 8, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
}

/** One grid slot. */
export function cell(ctx: Ctx, r: Rect, state: 'empty' | 'ok' | 'bad' | 'fuse' = 'empty') {
  rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, S.radius.s);
  ctx.fillStyle = COLOR.cell;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR.cellLight;
  ctx.stroke();
  if (state === 'empty') return;
  rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, S.radius.s);
  ctx.fillStyle = state === 'ok' ? COLOR.valid : state === 'bad' ? COLOR.invalid : 'rgba(255, 224, 102, 0.45)';
  ctx.fill();
  ctx.lineWidth = S.line.ui;
  ctx.strokeStyle = state === 'ok' ? '#6ee678' : state === 'bad' ? '#ff5050' : COLOR.fuse;
  ctx.stroke();
}

/** A dim layer over the whole screen behind a panel. */
export function veil(ctx: Ctx, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha, 0, 1);
  ctx.fillStyle = COLOR.shade;
  ctx.fillRect(0, 0, 540, 1170);
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

/** Text colour for a class (level 1..7): its light colour; SSS cycles hue. */
export function classColor(level: number, t: number) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  return i === 6 ? `hsl(${(t * 140) % 360}, 95%, 72%)` : TIER.metalLight[i];
}

/** Tile a piece sits on, coloured by class (level 1..7 = E..SSS). */
export function tileFrame(ctx: Ctx, r: Rect, level: number, o: { idle?: boolean; lifted?: boolean; t?: number } = {}) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const rad = S.radius.m;
  const lift = o.lifted ? 4 : 0;
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.62;
  const y = r.y - lift;
  const lip = Math.max(4, r.h * 0.09);
  rr(ctx, r.x, y + lip, r.w, r.h - lip, rad);
  fillStroke(ctx, TIER.tileDark[i], S.line.ui);
  rr(ctx, r.x, y, r.w, r.h - lip, rad);
  let fill: string | CanvasGradient = TIER.tile[i];
  if (i === 6) fill = rainbow(ctx, r.x, y, r.x + r.w, y + r.h, (o.t ?? 0) * 0.5);
  fillStroke(ctx, fill, S.line.ui);
  if (i === 6) {
    rr(ctx, r.x + 3, y + 3, r.w - 6, r.h - lip - 6, rad - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }
  rr(ctx, r.x + 4, y + 4, r.w - 8, (r.h - lip) * 0.3, rad * 0.6);
  ctx.fillStyle = i === 6 ? 'rgba(255,255,255,0.35)' : TIER.tileLight[i];
  ctx.globalAlpha *= 0.85;
  ctx.fill();
  ctx.restore();
}

/** The shine of high classes, over a tile: A sweeps, S glows and twinkles, SSS has a rainbow rim and sparkles. */
export function classFx(ctx: Ctx, r: Rect, level: number, t: number) {
  const lv = Math.round(level);
  if (lv < 5) return;
  const rad = S.radius.m;
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  if (lv >= 6) {
    rr(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
    ctx.lineWidth = lv >= 7 ? 5 : 4;
    ctx.strokeStyle = lv >= 7 ? rainbow(ctx, r.x, r.y, r.x + r.w, r.y + r.h, t * 2) : CLASS_FX.s;
    ctx.globalAlpha *= 0.55 + 0.45 * pulse;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // soft halo made of two wider faint strokes
    rr(ctx, r.x - 5, r.y - 5, r.w + 10, r.h + 10, rad + 5);
    ctx.lineWidth = 4;
    ctx.strokeStyle = lv >= 7 ? CLASS_FX.sss : CLASS_FX.s;
    ctx.globalAlpha = 0.18 + 0.2 * pulse;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // the light sweep
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.clip();
  const period = lv === 5 ? 3 : lv === 6 ? 2.2 : 1.5;
  const sw = ((t / period) % 1) * (r.w + r.h + 40) - 20;
  ctx.globalAlpha = lv === 5 ? 0.4 : 0.55;
  ctx.fillStyle = '#ffffff';
  poly(ctx, [r.x + sw, r.y, r.x + sw + 12, r.y, r.x + sw + 12 - r.h, r.y + r.h, r.x + sw - r.h, r.y + r.h]);
  ctx.fill();
  ctx.restore();
  if (lv < 6) return;
  const n = lv >= 7 ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const ph = t * 1.2 + i / n;
    const cyc = Math.floor(ph);
    const a = Math.sin((ph - cyc) * Math.PI);
    const px = r.x + r.w * (0.12 + 0.76 * hash(cyc * 7.1 + i * 3.3));
    const py = r.y + r.h * (0.12 + 0.76 * hash(cyc * 5.3 + i * 9.1));
    const sz = (3 + 5 * a) * (r.w / 60);
    starPath(ctx, px, py, sz, sz * 0.3, 4);
    ctx.fillStyle = CLASS_FX.spark;
    ctx.globalAlpha = a;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Class letter badge, left edge at x, centred on y. k scales it. */
export function classBadge(ctx: Ctx, level: number, x: number, y: number, k: number, t = 0) {
  const i = clamp(Math.round(level) - 1, 0, 6);
  const letter = CLASSES[i];
  const h = 18 * k;
  const w = letter.length > 1 ? 34 * k : h + 2 * k;
  rr(ctx, x, y - h / 2, w, h, h / 2);
  let fill: string | CanvasGradient = TIER.tileDark[i];
  if (i === 6) fill = rainbow(ctx, x, y, x + w, y, t);
  else if (i === 4) fill = TIER.metal[4];
  else if (i === 5) fill = CLASS_FX.s;
  fillStroke(ctx, fill, Math.max(1.5, 2.2 * k));
  label(ctx, letter, x + w / 2, y + 0.5 * k, (letter.length > 1 ? 11 : 13) * k, { lw: Math.max(2, 3 * k) });
}

/** "x4" in a small gold bubble, centred on x, y. */
export function countBadge(ctx: Ctx, count: number, x: number, y: number, k = 1) {
  const s = `x${count}`;
  const w = (12 + s.length * 8) * k;
  const h = 18 * k;
  rr(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  fillStroke(ctx, COLOR.gold, Math.max(1.5, 2.2 * k));
  label(ctx, s, x, y + 0.5 * k, 12 * k, { color: COLOR.ink, lw: 0 });
}

// ------------------------------------------------------------------ battle bars

/** The opponent's or your own name card. The opponent's always shows a BOT tag. */
export function namePlate(ctx: Ctx, r: Rect, o: { name: string; trophies: number; team: 0 | 1; bot?: boolean; align?: 'left' | 'right' }) {
  const tm = TEAM[o.team];
  const right = o.align === 'right';
  rr(ctx, r.x, r.y + 3, r.w, r.h - 3, S.radius.m);
  fillStroke(ctx, tm.dark, S.line.ui);
  rr(ctx, r.x, r.y, r.w, r.h - 4, S.radius.m);
  fillStroke(ctx, COLOR.paper, S.line.ui);
  // team stripe on the outer edge
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h - 4, S.radius.m);
  ctx.clip();
  ctx.fillStyle = tm.main;
  ctx.fillRect(right ? r.x + r.w - 10 : r.x, r.y, 10, r.h);
  ctx.restore();
  rr(ctx, r.x, r.y, r.w, r.h - 4, S.radius.m);
  ctx.lineWidth = S.line.ui;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const pad = 20;
  const ax = right ? r.x + r.w - pad : r.x + pad;
  const al: CanvasTextAlign = right ? 'right' : 'left';
  const tag = o.bot ? 46 : 0;
  const mid = r.y + (r.h - 4) / 2;
  const nameY = r.h > 44 ? mid - 9 : mid;
  ctx.font = `${TYPE.body}px ${FONT}`;
  const maxW = r.w - pad - 14 - (r.h <= 44 ? tag + 8 : 0);
  const k = Math.min(1, maxW / ctx.measureText(o.name).width);
  inkText(ctx, o.name, ax, nameY, TYPE.body * k, { align: al });
  if (r.h > 44) inkText(ctx, `${shortNumber(o.trophies)} trophies`, ax, mid + 11, TYPE.small, { align: al, color: COLOR.textInk });
  if (o.bot) {
    const bx = right ? r.x + r.w - pad - tag : r.x + pad;
    const by = r.h > 44 ? r.y - 9 : r.y + 4;
    const bxx = r.h > 44 ? (right ? r.x + r.w - pad - tag : r.x + pad) : right ? r.x + 18 : r.x + r.w - pad - tag + 6;
    rr(ctx, r.h > 44 ? bx : bxx, by, tag, 20, 8);
    fillStroke(ctx, COLOR.bot, S.line.thin + 0.5);
    label(ctx, 'BOT', (r.h > 44 ? bx : bxx) + tag / 2, by + 10.5, TYPE.small, { lw: 3 });
  }
}

/** A plain fill bar, 0..1. */
export function progressBar(ctx: Ctx, r: Rect, value: number, o: { color?: string; light?: string; back?: string } = {}) {
  const v = clamp(value, 0, 1);
  rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  fillStroke(ctx, o.back ?? COLOR.hpBack, S.line.ui);
  if (v <= 0.001) return;
  const w = Math.max(r.h - 6, (r.w - 6) * v);
  ctx.save();
  rr(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, (r.h - 6) / 2);
  ctx.clip();
  rr(ctx, r.x + 3, r.y + 3, w, r.h - 6, (r.h - 6) / 2);
  ctx.fillStyle = o.color ?? COLOR.hpGood;
  ctx.fill();
  ctx.fillStyle = o.light ?? 'rgba(255,255,255,0.35)';
  ctx.fillRect(r.x + 3, r.y + 4, w, (r.h - 6) * 0.35);
  ctx.restore();
}

/** Tug-of-war health: blue grows from the left, red from the right, a bright seam between. */
export function tugBar(ctx: Ctx, r: Rect, share0: number, share1: number, t: number) {
  const tot = Math.max(1e-6, share0 + share1);
  const f = clamp(share0 / tot, 0.04, 0.96);
  rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  fillStroke(ctx, COLOR.hpBack, S.line.bold);
  ctx.save();
  rr(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, (r.h - 6) / 2);
  ctx.clip();
  const ix = r.x + 3;
  const iw = r.w - 6;
  const sx = ix + iw * f;
  ctx.fillStyle = TEAM[1].main;
  ctx.fillRect(ix, r.y, iw, r.h);
  ctx.fillStyle = TEAM[0].main;
  ctx.fillRect(ix, r.y, sx - ix, r.h);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(ix, r.y + 4, iw, (r.h - 6) * 0.32);
  ctx.fillStyle = TEAM[0].dark;
  ctx.fillRect(ix, r.y + r.h - 8, sx - ix, 5);
  ctx.fillStyle = TEAM[1].dark;
  ctx.fillRect(sx, r.y + r.h - 8, ix + iw - sx, 5);
  // the seam
  const pulse = 0.7 + 0.3 * Math.sin(t * 8);
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  poly(ctx, [sx - 3, r.y, sx + 6, r.y, sx + 3, r.y + r.h, sx - 6, r.y + r.h]);
  ctx.fill();
  ctx.restore();
  rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.lineWidth = S.line.bold;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** A segmented gold meter (the roll meter). value 0..1; `ticks` equal segments. */
export function meter(ctx: Ctx, r: Rect, value: number, o: { ticks?: number; color?: string; full?: boolean } = {}) {
  const n = o.ticks ?? 5;
  progressBar(ctx, r, value, { color: o.full ? COLOR.gold : (o.color ?? COLOR.jade), back: COLOR.hpBack });
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(27,21,34,0.7)';
  for (let i = 1; i < n; i++) {
    const x = r.x + (r.w * i) / n;
    ctx.beginPath();
    ctx.moveTo(x, r.y + 4);
    ctx.lineTo(x, r.y + r.h - 4);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ banners, toasts, hints

/** A banner ribbon with notched ends (VICTORY, DEFEAT, FIGHT!, +1 ROLL). */
export function ribbon(ctx: Ctx, cx: number, cy: number, w: number, text: string, o: { color?: 'red' | 'gold' | 'indigo' | 'jade'; size?: number } = {}) {
  const c = {
    red: [COLOR.vermilion, COLOR.vermilionDark, COLOR.vermilionLight],
    gold: [COLOR.gold, COLOR.goldDark, COLOR.goldLight],
    indigo: [COLOR.indigo, COLOR.indigoDark, COLOR.indigoLight],
    jade: [COLOR.jade, COLOR.jadeDark, COLOR.jadeLight],
  }[o.color ?? 'red'];
  const size = o.size ?? TYPE.title;
  const h = size * 1.25;
  const tail = h * 0.45;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  // tails behind the body
  for (const s of [-1, 1]) {
    const ex = s < 0 ? x0 + 8 : x0 + w - 8;
    const out = s * (tail + 16);
    poly(ctx, [ex, y0 + 12, ex + out, y0 + 12, ex + out - s * 16, y0 + h / 2 + 12, ex + out, y0 + h + 12, ex, y0 + h + 12]);
    fillStroke(ctx, c[1], S.line.bold);
  }
  rr(ctx, x0, y0, w, h, 10);
  fillStroke(ctx, c[0], S.line.bold);
  rr(ctx, x0 + 6, y0 + 5, w - 12, h * 0.3, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  fitLabel(ctx, text, cx, cy + 2, size, w - 28, { lw: size * 0.16 });
}

/** A floating line of text that rises and fades; age in seconds (about 0..1.4). */
export function toast(ctx: Ctx, text: string, x: number, y: number, age: number) {
  const a = age < 0.15 ? age / 0.15 : clamp(1 - (age - 0.9) / 0.5, 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  const pop = age < 0.2 ? 0.7 + 1.5 * age : 1;
  ctx.translate(x, y - age * 36);
  ctx.scale(pop, pop);
  label(ctx, text, 0, 0, TYPE.h2, { color: COLOR.toast });
  ctx.restore();
}

/** A speech bubble inside rect r with a pointing hand aimed at (pointAt.x, pointAt.y). */
export function hint(ctx: Ctx, r: Rect, text: string, pointAt: { x: number; y: number }, t = 0) {
  const bob = Math.sin(t * 6) * 4;
  const cx = r.x + r.w / 2;
  const below = pointAt.y > r.y + r.h / 2;
  const tipX = clamp(pointAt.x, r.x + 30, r.x + r.w - 30);
  rr(ctx, r.x, r.y + 4, r.w, r.h, S.radius.l);
  fillStroke(ctx, COLOR.paperEdge, S.line.ui);
  // tail toward the target
  const ty = below ? r.y + r.h : r.y;
  const dir = below ? 1 : -1;
  poly(ctx, [tipX - 12, ty - dir, tipX + 12, ty - dir, tipX, ty + dir * 16]);
  fillStroke(ctx, COLOR.paper, S.line.ui);
  rr(ctx, r.x, r.y, r.w, r.h, S.radius.l);
  fillStroke(ctx, COLOR.paper, S.line.ui);
  poly(ctx, [tipX - 9, ty - dir * 2, tipX + 9, ty - dir * 2, tipX, ty + dir * 11]);
  ctx.fillStyle = COLOR.paper;
  ctx.fill();
  ctx.save();
  ctx.font = `${TYPE.body}px ${FONT}`;
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && ctx.measureText(`${cur} ${w}`).width > r.w - 36) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  lines.push(cur);
  ctx.restore();
  const lh = TYPE.body + 4;
  lines.forEach((l, i) => inkText(ctx, l, cx, r.y + r.h / 2 + (i - (lines.length - 1) / 2) * lh, TYPE.body));
  // the hand, beyond the tail, pointing at the target
  ctx.save();
  ctx.translate(pointAt.x, pointAt.y + (below ? -36 + bob : 36 - bob));
  if (below) ctx.rotate(Math.PI);
  hand(ctx, 0, 0, 46);
  ctx.restore();
}
