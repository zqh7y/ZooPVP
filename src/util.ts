import { COLOR, FONT, UI } from './theme';

export type Ctx = CanvasRenderingContext2D;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeOutElastic = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1);
export const inRect = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Repeatable pseudo-random 0..1 from a number (for twinkles and streaks that need no stored state). */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Rounded rectangle path. */
export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

export function poly(ctx: Ctx, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function starPath(ctx: Ctx, x: number, y: number, outer: number, inner: number, points: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot - Math.PI / 2 + (i * Math.PI) / points;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Fill the current path, then outline it in the ink colour. */
export function fillStroke(ctx: Ctx, fill: string | CanvasGradient, lw = 2.2, stroke: string = COLOR.ink) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export type FontWeight = 600 | 700;

/** A canvas font string in the game's family: 600 for labels, 700 for numbers and titles. */
export function font(size: number, weight: FontWeight = 600) {
  return `${weight} ${Math.round(size)}px ${FONT}`;
}

/** Letter-spacing where the browser's canvas has it (the text is still drawn without). */
function setTrack(ctx: Ctx, px: number) {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px.toFixed(2)}px`;
}

/** The default letter-spacing of a label of this size. */
export const trackOf = (size: number) => size * 0.03;

/** Width of a line of text as label() would draw it. */
export function textWidth(ctx: Ctx, s: string, size: number, weight: FontWeight = 600, track = trackOf(size)) {
  ctx.font = font(size, weight);
  setTrack(ctx, track);
  const w = ctx.measureText(s).width - track;
  setTrack(ctx, 0);
  return w;
}

export interface TextOpts {
  color?: string | CanvasGradient;
  /** colour of the edge, when the text has one */
  outline?: string;
  align?: CanvasTextAlign;
  /** asks for a dark edge around the glyphs (text on the pitch); it is kept thin whatever the value */
  lw?: number;
  /** 600 (labels, the default) or 700 (numbers, titles) */
  weight?: FontWeight;
  /** letter-spacing in px; a little by default */
  track?: number;
  /** the text sits directly on the pitch: give it the thin dark edge */
  onPitch?: boolean;
}

/** true for a dark #rgb / #rrggbb / rgb() colour (relative luminance under about 0.4). */
export function isDark(c: string): boolean {
  let r = 255;
  let g = 255;
  let b = 255;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const q = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(c);
    if (!q) return false;
    r = +q[1];
    g = +q[2];
    b = +q[3];
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 105;
}

/** Clean interface text. No outline, unless it sits on the pitch (onPitch, or a caller that asks for an edge). */
export function label(ctx: Ctx, s: string, x: number, y: number, size: number, o: TextOpts = {}) {
  const track = o.track ?? trackOf(size);
  const align = o.align ?? 'center';
  ctx.font = font(size, o.weight ?? 600);
  setTrack(ctx, track);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  // the spacing after the last letter counts in the advance: take it back so the text stays on its anchor
  const tx = align === 'center' ? x + track / 2 : align === 'right' || align === 'end' ? x + track : x;
  const edge = o.onPitch || (o.lw ?? 0) > 0 ? Math.max(2, Math.min(4, size * 0.09)) : 0;
  // text on the pitch is white by default; whatever its colour, its edge takes the opposite tone so it reads on grass
  const fill = o.color ?? (edge > 0 ? '#ffffff' : UI.text);
  if (edge > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = edge;
    ctx.strokeStyle = o.outline ?? (typeof fill === 'string' && isDark(fill) ? 'rgba(255, 255, 255, 0.9)' : UI.edge);
    ctx.strokeText(s, tx, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(s, tx, y);
  setTrack(ctx, 0);
}

/** Small deterministic random generator, so the scenery looks the same every time. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
