import { seeded } from '../../util';

/*
 * The brush of style 1 (Ink Brush). A stroke is never a constant-width line: its centreline is sampled into a
 * scratch buffer, then turned into a filled outline whose width swells and tapers along it (the brush lands,
 * presses, lifts). Every stroke winds the same way, so many strokes go into one path and one fill() paints
 * them all as a union. Dots wind the same way too. Nothing here allocates per frame.
 *
 *   ctx.beginPath();
 *   begin(); pt(0, 0); cub(10, -5, 20, -5, 30, 0, 8); emit(ctx, 4, BRUSH);
 *   dot(ctx, 40, 0, 2, 2);
 *   ctx.fill();
 */
type Ctx = CanvasRenderingContext2D;
/** anything a brush outline can be added to: the context's current path, or a Path2D */
export type PathLike = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'arc' | 'ellipse' | 'closePath'>;

const MAX = 256;
const P = new Float64Array(MAX * 2);
const R = new Float64Array(MAX * 2);
let n = 0;
const HALF_PI = Math.PI / 2;

/** Starts a new centreline. */
export function begin() {
  n = 0;
}

export function pt(x: number, y: number) {
  if (n >= MAX) return;
  P[n * 2] = x;
  P[n * 2 + 1] = y;
  n++;
}

/** A quadratic from the last point, in k steps. */
export function quad(x1: number, y1: number, x2: number, y2: number, k: number) {
  const x0 = P[n * 2 - 2];
  const y0 = P[n * 2 - 1];
  for (let i = 1; i <= k; i++) {
    const s = i / k;
    const u = 1 - s;
    pt(u * u * x0 + 2 * u * s * x1 + s * s * x2, u * u * y0 + 2 * u * s * y1 + s * s * y2);
  }
}

/** A cubic from the last point, in k steps. */
export function cub(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, k: number) {
  const x0 = P[n * 2 - 2];
  const y0 = P[n * 2 - 1];
  for (let i = 1; i <= k; i++) {
    const s = i / k;
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    pt(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
  }
}

/** Points along an ellipse from angle a0 to a1 (either way round), in k steps. */
export function arc(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, k: number) {
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i <= k; i++) {
    const a = a0 + ((a1 - a0) * i) / k;
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    pt(cx + ex * cr - ey * sr, cy + ex * sr + ey * cr);
  }
}

/**
 * The shape of a stroke along its length: it lands at width a (of the full width), presses to full width at h
 * (0..1 of the length), and lifts to width b. wob is the slight unevenness of a hand, seed which unevenness.
 * cap rounds the landing end.
 */
export interface Prof {
  a: number;
  h: number;
  b: number;
  wob: number;
  cap: boolean;
}

/** A plain confident stroke: lands softly, presses early, flicks off to a point. */
export const BRUSH: Prof = { a: 0.35, h: 0.3, b: 0, wob: 0.12, cap: true };
/** Thick through the middle, thin at both ends (an outline). */
export const SWELL: Prof = { a: 0.08, h: 0.5, b: 0.05, wob: 0.1, cap: false };
/** Starts heavy and drags off (a pressed blot and a dry tail). */
export const PRESS: Prof = { a: 0.9, h: 0.12, b: 0, wob: 0.14, cap: true };
/** Even, for short marks. */
export const EVEN: Prof = { a: 0.7, h: 0.5, b: 0.55, wob: 0.06, cap: true };

/** Adds the brush outline of the current centreline (max width w) to ctx's current path. */
export function emit(ctx: PathLike, w: number, p: Prof, seed = 0) {
  const m = n;
  if (m < 2) return;
  const { a, h, b, wob } = p;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  let sa = 0;
  for (let i = 0; i < m; i++) {
    const i0 = i > 0 ? i - 1 : 0;
    const i1 = i < m - 1 ? i + 1 : m - 1;
    let tx = P[i1 * 2] - P[i0 * 2];
    let ty = P[i1 * 2 + 1] - P[i0 * 2 + 1];
    const l = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= l;
    ty /= l;
    const s = i / (m - 1);
    let f = s < h ? a + (1 - a) * Math.sin((s / h) * HALF_PI) : b + (1 - b) * Math.cos(((s - h) / (1 - h)) * HALF_PI);
    if (wob) f *= 1 + wob * Math.sin(s * 9.7 + seed * 5.31);
    const hw = (w * f) / 2;
    const x = P[i * 2];
    const y = P[i * 2 + 1];
    const nx = -ty * hw;
    const ny = tx * hw;
    if (i === 0) {
      ctx.moveTo(x + nx, y + ny);
      sx = x;
      sy = y;
      sw = hw;
      sa = Math.atan2(-tx, ty);
    } else ctx.lineTo(x + nx, y + ny);
    R[i * 2] = x - nx;
    R[i * 2 + 1] = y - ny;
  }
  for (let i = m - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
  if (p.cap && sw > 0.2) ctx.arc(sx, sy, sw, sa, sa - Math.PI, true);
  ctx.closePath();
}

/** An ellipse wound the same way as the strokes, so it joins their union. */
export function dot(ctx: PathLike, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2, true);
}

/**
 * Flying white: the dry end of a heavy stroke, where the brush runs out of ink and the bristles split. Takes the
 * last part of the current centreline, carries it on a little past the end, and adds that as a stroke that is
 * thin where the solid ink is thick and stays wide where the solid ink has lifted. Returns the angle the
 * stroke runs at there, so the bristle texture can be laid along it.
 */
export function tail(path: PathLike, w: number, from = 0.55, ext = 0.22, seed = 0): number {
  const m = n;
  if (m < 3) return 0;
  const i0 = Math.floor((m - 1) * from);
  const lx = P[(m - 1) * 2];
  const ly = P[(m - 1) * 2 + 1];
  const dx = lx - P[(m - 2) * 2];
  const dy = ly - P[(m - 2) * 2 + 1];
  const steps = Math.max(2, Math.round((m - 1 - i0) * ext * 2.5));
  // copy the tail into the front of the buffer, then extend it
  let k = 0;
  for (let i = i0; i < m; i++, k++) {
    P[k * 2] = P[i * 2];
    P[k * 2 + 1] = P[i * 2 + 1];
  }
  n = k;
  const span = (m - 1 - i0) * ext;
  for (let j = 1; j <= steps; j++) pt(lx + (dx * span * j) / steps, ly + (dy * span * j) / steps);
  emit(path, w, { a: 0.15, h: 0.55, b: 0.35, wob: 0.25, cap: false }, seed);
  return Math.atan2(dy, dx);
}

// ------------------------------------------------------------------ dry brush

/*
 * A dry-brush texture: a thin even tone with bristle streaks dragged through it, in one colour, built once per
 * colour into a tile and used as a repeating pattern (so a wash costs one fill).
 */
const dryCache = new Map<string, HTMLCanvasElement>();
export function dryTile(color: string, seed = 7, density = 1): HTMLCanvasElement {
  const key = `${color}|${seed}|${density}`;
  let c = dryCache.get(key);
  if (c) return c;
  const W = 256;
  const H = 128;
  c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rnd = seeded(seed * 7919 + 13);
  g.fillStyle = color;
  const bristle = density < 0;
  const d = Math.abs(density);
  if (!bristle) {
    g.globalAlpha = 0.28 * d;
    g.fillRect(0, 0, W, H);
  }
  for (let i = 0; i < (bristle ? 120 : 260); i++) {
    const y = rnd() * H;
    const x = rnd() * W;
    const len = bristle ? 80 + rnd() * 200 : 24 + rnd() * 170;
    const th = bristle ? 1.2 + rnd() * 3.5 : 0.7 + rnd() * rnd() * 4.5;
    g.globalAlpha = bristle ? 0.75 + rnd() * 0.25 : Math.min(1, (0.25 + rnd() * 0.75) * d);
    for (let dx = -W; dx <= 0; dx += W)
      for (let dy = -H; dy <= H; dy += H) {
        const yy = y + dy;
        const xx = x + dx;
        g.beginPath();
        g.moveTo(xx, yy);
        g.quadraticCurveTo(xx + len * 0.15, yy - th, xx + len * 0.5, yy - th * 0.45);
        g.lineTo(xx + len, yy + th * 0.1);
        g.quadraticCurveTo(xx + len * 0.4, yy + th * 0.7, xx, yy);
        g.fill();
      }
  }
  dryCache.set(key, c);
  return c;
}

const patCache = new WeakMap<Ctx, Map<string, CanvasPattern>>();
/**
 * The dry-brush tile as a pattern for this context (texels at half size, so it stays fine on sharp screens).
 * A negative density makes bristle streaks with bare paper between them (for flying white and swooshes).
 */
export function dryPattern(ctx: Ctx, color: string, seed = 7, density = 1): CanvasPattern | string {
  let m = patCache.get(ctx);
  if (!m) {
    m = new Map();
    patCache.set(ctx, m);
  }
  const key = `${color}|${seed}|${density}`;
  let p = m.get(key);
  if (!p) {
    const made = ctx.createPattern(dryTile(color, seed, density), 'repeat');
    if (!made) return color;
    made.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, 0, 0]));
    p = made;
    m.set(key, p);
  }
  return p;
}

/** Lays a pattern's streaks along angle a (radians, in the space it is filled in). */
export function along(p: CanvasPattern | string, a: number) {
  if (typeof p === 'string') return;
  const c = Math.cos(a) * 0.5;
  const s = Math.sin(a) * 0.5;
  p.setTransform(new DOMMatrix([c, s, -s, c, 0, 0]));
}
