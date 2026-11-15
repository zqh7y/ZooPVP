import { hashSeed } from '../../rng';
import { seeded } from '../../util';

/*
 * Style 4's drawing kit: a graphite pencil and a box of wax crayons on cream paper.
 *
 *   crayon(g, pts, colour)  wax colour with paper tooth showing through, set a little off-register
 *   pencil(g, pts, closed)  a wobbly graphite line in two passes that overshoot their start
 *   hatch(g, pts)           diagonal graphite hatching on the side away from the sun (upper left)
 *
 * Every shape is a flat list of points (x0, y0, x1, y1, ...). The jitter comes from seeded generators keyed by
 * begin()'s seed and the order shapes are drawn in, so the same drawing is the same every frame; a different
 * seed (the boil frame) draws it again slightly differently. The paper tooth is built once into pattern tiles.
 */
export type Ctx = CanvasRenderingContext2D;
export type Pts = number[];

export const INK = '#2e2a33';
export const PAPER = '#fffaf0';
export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ state of the drawing in progress

let base = 1;
let sid = 0;
/** the size unit of the drawing (a pet's r): wobble and register scale with it */
let U = 40;
/** the main line width */
let LW = 1.6;

/** Starts a drawing: its seed (mix in the boil frame), its size unit, and how heavy the line is. */
export function begin(seed: number, unit: number, weight = 1) {
  base = seed >>> 0;
  sid = 0;
  U = unit;
  LW = (0.7 + unit * 0.03) * weight;
}
export const unit = () => U;
export const lineW = () => LW;
/** a fresh seeded generator for the next shape */
export function rnd(): () => number {
  return seeded(hashSeed(base, ++sid, 0x4c1d));
}

// ------------------------------------------------------------------ paper tooth (built once)

const TEX = 200; // pattern tile in device pixels, shown at half size
let tooth: Float32Array | null = null;
let scratch: CanvasRenderingContext2D | null = null;

function noiseGrid(n: number, R: () => number) {
  const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = R();
  return a;
}
function sample(a: Float32Array, n: number, x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let fx = x - x0;
  let fy = y - y0;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const i0 = ((x0 % n) + n) % n;
  const j0 = ((y0 % n) + n) % n;
  const i1 = (i0 + 1) % n;
  const j1 = (j0 + 1) % n;
  const a00 = a[j0 * n + i0];
  const a10 = a[j0 * n + i1];
  const a01 = a[j1 * n + i0];
  const a11 = a[j1 * n + i1];
  return (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy;
}

/** 0 = bare paper, 1 = full wax. Periodic, so it tiles. Streaks run along "/" like crayon strokes. */
function toothMask(): Float32Array {
  if (tooth) return tooth;
  const n = TEX;
  const m = new Float32Array(n * n);
  const R = seeded(0x5ee4d);
  const coarse = noiseGrid(10, R);
  const fine = noiseGrid(50, R);
  const strokes = noiseGrid(40, R); // 1D along x + y (a 40 x 40 grid, row 0 used)
  const along = noiseGrid(8, R);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = sample(coarse, 10, (x / n) * 10, (y / n) * 10);
      const f = sample(fine, 50, (x / n) * 50, (y / n) * 50);
      const s = sample(strokes, 40, (((x + y) % n) / n) * 40, 0);
      const a = sample(along, 8, (((x - y + n) % n) / n) * 8, 3);
      const v = 0.42 * f + 0.18 * c + 0.22 * s * (0.5 + a) + 0.18 * R();
      const k = (v - 0.27) / 0.2;
      m[y * n + x] = k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
    }
  }
  tooth = m;
  return m;
}

function scratchCtx() {
  if (!scratch) scratch = document.createElement('canvas').getContext('2d')!;
  return scratch;
}

const pats = new Map<string, CanvasPattern>();
const HALF = typeof DOMMatrix !== 'undefined' ? new DOMMatrix([0.5, 0, 0, 0.5, 0, 0]) : null;

/** A colour as wax on paper: the colour where the tooth caught it, see-through where it did not (strength 0..1). */
export function wax(color: string, strength = 1): CanvasPattern | string {
  const key = `${color}|${strength}`;
  let p = pats.get(key);
  if (p) return p;
  if (typeof document === 'undefined') return color;
  const m = toothMask();
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, TEX, TEX);
  const img = g.getImageData(0, 0, TEX, TEX);
  const d = img.data;
  for (let i = 0; i < m.length; i++) d[i * 4 + 3] = d[i * 4 + 3] * (1 - strength * (1 - m[i]));
  g.putImageData(img, 0, 0);
  p = scratchCtx().createPattern(c, 'repeat')!;
  if (HALF) p.setTransform(HALF);
  pats.set(key, p);
  return p;
}

// ------------------------------------------------------------------ shapes

/** An ellipse as points. */
export function ell(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 34): Pts {
  const out: Pts = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI * 0.75;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

/** A smooth curve through control points (Catmull-Rom), closed or open. */
export function spline(c: number[], closed: boolean, seg = 6): Pts {
  const n = c.length / 2;
  const out: Pts = [];
  const m = closed ? n : n - 1;
  const at = (i: number) => (closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  for (let i = 0; i < m; i++) {
    const a = at(i - 1) * 2;
    const b = at(i) * 2;
    const d = at(i + 1) * 2;
    const e = at(i + 2) * 2;
    for (let s = 0; s < seg; s++) {
      const t = s / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let k = 0; k < 2; k++) {
        const p0 = c[a + k];
        const p1 = c[b + k];
        const p2 = c[d + k];
        const p3 = c[e + k];
        out.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
      }
    }
  }
  if (!closed) out.push(c[(n - 1) * 2], c[(n - 1) * 2 + 1]);
  return out;
}

/** Scales and moves points: p * k + (dx, dy). */
export function xf(p: Pts, k: number, dx = 0, dy = 0): Pts {
  const out: Pts = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    out[i] = p[i] * k + dx;
    out[i + 1] = p[i + 1] * k + dy;
  }
  return out;
}

export function path(g: Ctx, p: Pts, closed = true) {
  g.beginPath();
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  if (closed) g.closePath();
}

function normalAt(p: Pts, i: number, n: number, closed: boolean): [number, number] {
  const ip = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
  const inx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  const nx = p[inx * 2 + 1] - p[ip * 2 + 1];
  const ny = -(p[inx * 2] - p[ip * 2]);
  const l = Math.hypot(nx, ny) || 1;
  return [nx / l, ny / l];
}

/** The points pushed along their normals by a slow hand wobble, plus a shift. */
function wobbled(p: Pts, closed: boolean, amp: number, R: () => number, dx = 0, dy = 0): Pts {
  const n = p.length / 2;
  const ph1 = R() * TAU;
  const ph2 = R() * TAU;
  const out: Pts = new Array(p.length);
  for (let i = 0; i < n; i++) {
    const u = closed ? i / n : i / Math.max(1, n - 1);
    const [nx, ny] = normalAt(p, i, n, closed);
    const o = amp * (0.6 * Math.sin(TAU * 2 * u + ph1) + 0.4 * Math.sin(TAU * 3 * u + ph2));
    out[i * 2] = p[i * 2] + nx * o + dx;
    out[i * 2 + 1] = p[i * 2 + 1] + ny * o + dy;
  }
  return out;
}

// ------------------------------------------------------------------ marks

export interface CrayonOpts {
  /** lay cream paper under the wax first (default true), so the tooth shows paper, not what is behind */
  paper?: boolean;
  /** how far the colour slips off the line, in units (default 0.035) */
  slip?: number;
  /** wax strength 0..1 (default 0.9) */
  wax?: number;
}

/** Wax colour in a shape: paper under it, the colour wobbled and slipped a little down-right of the line. */
export function crayon(g: Ctx, p: Pts, color: string, o: CrayonOpts = {}) {
  const R = rnd();
  if (o.paper !== false) {
    path(g, p);
    g.fillStyle = PAPER;
    g.fill();
  }
  const slip = (o.slip ?? 0.035) * U;
  const dx = slip * (0.6 + R() * 0.7);
  const dy = slip * (0.2 + R() * 0.6);
  path(g, wobbled(p, true, U * 0.02, R, dx, dy));
  g.fillStyle = wax(color, o.wax ?? 0.9);
  g.fill();
}

export interface PencilOpts {
  /** line weight multiplier */
  w?: number;
  /** passes (default 2) */
  passes?: number;
  /** wobble multiplier */
  amp?: number;
  alpha?: number;
  color?: string;
}

/**
 * A graphite line along the points. A closed shape is drawn the way a hand draws it: the first pass goes all the
 * way round and a little past its start (drifting off as it goes), the second is a lighter, shorter re-trace.
 */
export function pencil(g: Ctx, p: Pts, closed: boolean, o: PencilOpts = {}) {
  const R = rnd();
  const n = p.length / 2;
  const passes = o.passes ?? 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = wax(o.color ?? INK, 0.4);
  for (let k = 0; k < passes; k++) {
    const ph1 = R() * TAU;
    const ph2 = R() * TAU;
    const A = (o.amp ?? 1) * U * (k === 0 ? 0.014 : 0.026);
    const drift = (R() - 0.5) * U * 0.07;
    let start = 0;
    let len = n;
    if (closed) {
      start = Math.floor(R() * n);
      len = Math.floor(n * (k === 0 ? 1.07 + R() * 0.08 : 0.45 + R() * 0.4));
    } else if (k > 0) {
      start = Math.floor(R() * n * 0.2);
      len = n - start - Math.floor(R() * n * 0.2);
    }
    g.beginPath();
    for (let j = 0; j < len; j++) {
      const i = closed ? (start + j) % n : start + j;
      const u = closed ? i / n : i / Math.max(1, n - 1);
      const [nx, ny] = normalAt(p, i, n, closed);
      const off = A * (0.6 * Math.sin(TAU * 2 * u + ph1) + 0.4 * Math.sin(TAU * 3 * u + ph2)) + drift * (j / len) + (R() - 0.5) * U * 0.006;
      const x = p[i * 2] + nx * off;
      const y = p[i * 2 + 1] + ny * off;
      if (j === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.lineWidth = LW * (o.w ?? 1) * (k === 0 ? 1 : 0.62);
    g.globalAlpha = (o.alpha ?? 1) * (k === 0 ? 0.92 : 0.5);
    g.stroke();
  }
  g.globalAlpha = 1;
}

export interface HatchOpts {
  /** where the shade starts, from the shape's centre toward its lower right, as a fraction of its reach (0.1) */
  from?: number;
  /** gap between strokes in px */
  gap?: number;
  alpha?: number;
  color?: string;
  /** stroke direction (default -0.8 rad: "/") */
  angle?: number;
  w?: number;
}

/** Diagonal graphite strokes in the part of a shape away from the light, clipped to it. */
export function hatch(g: Ctx, p: Pts, o: HatchOpts = {}) {
  const R = rnd();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const reach = Math.hypot(x1 - x0, y1 - y0) / 2;
  const a = o.angle ?? -0.8;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // across the strokes, toward the shade (lower right)
  let nx = -dy;
  let ny = dx;
  if (nx + ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const gap = o.gap ?? Math.max(1.5, U * 0.075);
  g.save();
  path(g, p);
  g.clip();
  g.strokeStyle = wax(o.color ?? INK, 0.5);
  g.lineCap = 'round';
  g.lineWidth = Math.max(0.6, LW * 0.55) * (o.w ?? 1);
  const s0 = (o.from ?? 0.1) * reach;
  for (let s = s0; s < reach; s += gap * (0.8 + R() * 0.4)) {
    const k = (s - s0) / Math.max(1, reach - s0);
    const px = cx + nx * s;
    const py = cy + ny * s;
    const half = reach * (0.55 + R() * 0.5);
    const sh = (R() - 0.5) * reach * 0.5;
    const bend = (R() - 0.5) * gap * 0.8;
    g.beginPath();
    g.moveTo(px + dx * (-half + sh), py + dy * (-half + sh));
    g.quadraticCurveTo(px + dx * sh + nx * bend, py + dy * sh + ny * bend, px + dx * (half + sh), py + dy * (half + sh));
    g.globalAlpha = (o.alpha ?? 0.5) * (0.45 + 0.55 * Math.min(1, k * 1.6));
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
}

/**
 * Darker wax laid along the shade side (lower right): the shape minus itself nudged toward the light, twice, so
 * the shade deepens toward the edge. d is the nudge in units.
 */
export function shade(g: Ctx, p: Pts, color: string, d = 0.12, alpha = 0.55) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  g.save();
  path(g, p);
  g.clip();
  g.fillStyle = wax(color, 0.75);
  for (const k of [1, 0.5]) {
    const dx = -d * U * k * 0.75;
    const dy = -d * U * k;
    g.beginPath();
    g.rect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    g.moveTo(p[0] + dx, p[1] + dy);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] + dx, p[i + 1] + dy);
    g.closePath();
    g.globalAlpha = alpha * 0.6;
    g.fill('evenodd');
  }
  g.restore();
  g.globalAlpha = 1;
}

/** A few short crayon strokes following an ellipse's arc (a sheen, a stripe, a blush). */
export function strokes(g: Ctx, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, color: string, w: number, count = 3, gap = 0.16) {
  const R = rnd();
  g.strokeStyle = wax(color, 0.85);
  g.lineCap = 'round';
  g.lineWidth = w;
  for (let i = 0; i < count; i++) {
    const k = 1 - i * gap;
    const b0 = a0 + (R() - 0.5) * 0.25;
    const b1 = a1 + (R() - 0.5) * 0.25;
    g.beginPath();
    g.ellipse(cx, cy, Math.max(0.1, rx * k), Math.max(0.1, ry * k), 0, b0, b1);
    g.stroke();
  }
}

/** A wobbly open line through control points (the spline is made here). */
export function line(g: Ctx, c: number[], o: PencilOpts = {}) {
  pencil(g, spline(c, false, 5), false, o);
}

/** A round crayon dot with its pencil ring. */
export function dot(g: Ctx, x: number, y: number, r: number, color: string, ring = true) {
  const p = ell(x, y, r, r, 0, 18);
  crayon(g, p, color, { slip: 0.02 });
  if (ring) pencil(g, p, true, { passes: 1, w: 0.8 });
}

// ------------------------------------------------------------------ sprite cache

interface Sprite {
  c: HTMLCanvasElement | null;
  x: number;
  y: number;
  w: number;
  h: number;
}
const sprites = new Map<string, Sprite>();
const MAX_SPRITES = 320;

/**
 * A drawing painted once into an offscreen canvas at the context's device scale, trimmed to what was drawn, then
 * stamped. The room (x, y, w, h) is in the drawing's local logical units; paint draws at local (0, 0). The stamp
 * is drawn without smoothing: it is made at the device scale, so it lands about 1:1, and an unsmoothed copy is
 * several times cheaper than a filtered one on a software canvas.
 */
export function stamp(g: Ctx, key: string, x: number, y: number, w: number, h: number, scale: number, paint: (s: Ctx) => void) {
  const k = `${key}@${scale}`;
  let s = sprites.get(k);
  if (!s) {
    if (sprites.size >= MAX_SPRITES) sprites.delete(sprites.keys().next().value as string);
    s = make(x, y, w, h, scale, paint);
    sprites.set(k, s);
  }
  if (!s.c) return;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(s.c, s.x, s.y, s.w, s.h);
  g.imageSmoothingEnabled = smooth;
}

/** The device pixels per logical pixel of a context's current transform, to 2 decimals. */
export function deviceScale(g: Ctx) {
  const m = g.getTransform();
  return Math.max(0.5, Math.round(Math.hypot(m.a, m.b) * 100) / 100);
}

function make(x: number, y: number, w: number, h: number, scale: number, paint: (s: Ctx) => void): Sprite {
  const c = document.createElement('canvas');
  const cw = Math.ceil(w * scale);
  const ch = Math.ceil(h * scale);
  c.width = cw;
  c.height = ch;
  const sg = c.getContext('2d', { willReadFrequently: true })!;
  sg.scale(scale, scale);
  sg.translate(-x, -y);
  paint(sg);
  // trim to the painted pixels (once, when the sprite is made)
  const d = sg.getImageData(0, 0, cw, ch).data;
  let x0 = cw;
  let y0 = ch;
  let x1 = -1;
  let y1 = -1;
  for (let j = 0; j < ch; j++) {
    const row = j * cw * 4 + 3;
    for (let i = 0; i < cw; i++) {
      if (d[row + i * 4] > 2) {
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        y1 = j;
      }
    }
  }
  if (x1 < 0) return { c: null, x: 0, y: 0, w: 0, h: 0 };
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const t = document.createElement('canvas');
  t.width = tw;
  t.height = th;
  t.getContext('2d')!.drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
  return { c: t, x: x + x0 / scale, y: y + y0 / scale, w: tw / scale, h: th / scale };
}
