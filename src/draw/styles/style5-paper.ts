import { clamp, seeded } from '../../util';

/*
 * The paper kit for style 5 (Paper Cutout).
 *
 * Shapes are built ONCE: an outline is sampled densely, then re-cut the way scissors cut it (straight facets of
 * uneven length, the corners kept, every cut point nudged a hair off the line, all from a seed named after the
 * part), and stored as a Path2D in the part's own units. So a cut edge is the same every frame and the same for
 * both teams; only the fill colour changes.
 *
 * Drawing a part is a few fills of its stored path under a transform this kit keeps itself (no save/restore,
 * no path building): the part's shadow on the layer below (two offset fills, the further one fainter, so the
 * shadow's edge is soft), a thin cream sliver of paper core on the lit (upper-left) edges, the colour, and the
 * paper-fibre pattern, a tile drawn once. Style 5 paints each look once into a cached picture (style5-cache.ts),
 * so none of this runs per frame in a battle.
 */
type Ctx = CanvasRenderingContext2D;
export type Pts = number[];

// ------------------------------------------------------------------ building shapes (once)

/** a seeded 0..1 generator named after a part, so its cut never changes */
export function keyRng(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return seeded(h >>> 0);
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 40): Pts {
  const out: Pts = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

/** a smooth curve through control points (Catmull-Rom), sampled */
export function spline(ctrl: Pts, closed = true, per = 10): Pts {
  const n = ctrl.length / 2;
  const out: Pts = [];
  const P = (i: number) => {
    const k = closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);
    return [ctrl[k * 2], ctrl[k * 2 + 1]];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = P(i - 1);
    const [x1, y1] = P(i);
    const [x2, y2] = P(i + 1);
    const [x3, y3] = P(i + 2);
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(f(x0, x1, x2, x3), f(y0, y1, y2, y3));
    }
  }
  if (!closed) out.push(ctrl[ctrl.length - 2], ctrl[ctrl.length - 1]);
  return out;
}

/** a closed polygon from corner points, kept sharp */
export const polyPts = (pts: Pts) => pts.slice();

/**
 * The outline of a strip of paper along an open line: half-width w0 at the start to w1 at the end, round ends
 * (capN points each), mitred at the bends.
 */
export function strip(line: Pts, w0: number, w1 = w0, capN = 4, cap0 = true, cap1 = true): Pts {
  const n = line.length / 2;
  const L: Pts = [];
  const R: Pts = [];
  let total = 0;
  const cum = [0];
  for (let i = 1; i < n; i++) {
    total += Math.hypot(line[i * 2] - line[i * 2 - 2], line[i * 2 + 1] - line[i * 2 - 1]);
    cum.push(total);
  }
  const dir = (i: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = 0;
    let dy = 0;
    if (i > 0) {
      const lx = line[i * 2] - line[a * 2];
      const ly = line[i * 2 + 1] - line[a * 2 + 1];
      const l = Math.hypot(lx, ly) || 1;
      dx += lx / l;
      dy += ly / l;
    }
    if (i < n - 1) {
      const lx = line[b * 2] - line[i * 2];
      const ly = line[b * 2 + 1] - line[i * 2 + 1];
      const l = Math.hypot(lx, ly) || 1;
      dx += lx / l;
      dy += ly / l;
    }
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const segDir = (i: number) => {
    const lx = line[i * 2 + 2] - line[i * 2];
    const ly = line[i * 2 + 3] - line[i * 2 + 1];
    const l = Math.hypot(lx, ly) || 1;
    return [lx / l, ly / l];
  };
  for (let i = 0; i < n; i++) {
    const [dx, dy] = dir(i);
    const w = w0 + (w1 - w0) * (total ? cum[i] / total : 0);
    // mitre: widen at a bend so the strip keeps its width
    let m = 1;
    if (i > 0 && i < n - 1) {
      const [ax, ay] = segDir(i - 1);
      m = 1 / Math.max(0.5, ax * dx + ay * dy);
    }
    L.push(line[i * 2] - dy * w * m, line[i * 2 + 1] + dx * w * m);
    R.push(line[i * 2] + dy * w * m, line[i * 2 + 1] - dx * w * m);
  }
  const out: Pts = [];
  for (let i = 0; i < n; i++) out.push(L[i * 2], L[i * 2 + 1]);
  // end cap
  {
    const [dx, dy] = dir(n - 1);
    const x = line[n * 2 - 2];
    const y = line[n * 2 - 1];
    if (cap1) {
      const a0 = Math.atan2(dx, -dy); // direction of L side normal
      for (let k = 1; k < capN; k++) {
        const a = a0 - (k / capN) * Math.PI;
        out.push(x + Math.cos(a) * w1, y + Math.sin(a) * w1);
      }
    }
  }
  for (let i = n - 1; i >= 0; i--) out.push(R[i * 2], R[i * 2 + 1]);
  {
    const [dx, dy] = dir(0);
    const x = line[0];
    const y = line[1];
    if (cap0) {
      const a0 = Math.atan2(-dx, dy);
      for (let k = 1; k < capN; k++) {
        const a = a0 - (k / capN) * Math.PI;
        out.push(x + Math.cos(a) * w0, y + Math.sin(a) * w0);
      }
    }
  }
  return out;
}

/** re-cut a closed outline like scissors: uneven straight facets, corners kept, each cut a hair off the line */
export function recut(d: Pts, step: number, amp: number, rnd: () => number): Pts {
  const n = d.length / 2;
  const corner: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const ip = (i - 1 + n) % n;
    const inx = (i + 1) % n;
    const ax = d[i * 2] - d[ip * 2];
    const ay = d[i * 2 + 1] - d[ip * 2 + 1];
    const bx = d[inx * 2] - d[i * 2];
    const by = d[inx * 2 + 1] - d[i * 2 + 1];
    if (Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) > 0.55) corner[i] = true;
  }
  let start = corner.indexOf(true);
  if (start < 0) {
    start = Math.floor(rnd() * n);
    corner[start] = true;
  }
  const out: Pts = [];
  let i = start;
  let guard = 0;
  do {
    const run = [i];
    let j = (i + 1) % n;
    while (!corner[j]) {
      run.push(j);
      j = (j + 1) % n;
    }
    run.push(j);
    const cum = [0];
    for (let k = 1; k < run.length; k++) cum.push(cum[k - 1] + Math.hypot(d[run[k] * 2] - d[run[k - 1] * 2], d[run[k] * 2 + 1] - d[run[k - 1] * 2 + 1]));
    const L = cum[cum.length - 1];
    const cuts = Math.max(1, Math.round(L / step));
    out.push(d[i * 2] + (rnd() - 0.5) * amp * 0.6, d[i * 2 + 1] + (rnd() - 0.5) * amp * 0.6);
    let seg = 1;
    for (let m = 1; m < cuts; m++) {
      const pos = ((m + (rnd() - 0.5) * 0.75) / cuts) * L;
      while (seg < cum.length - 1 && cum[seg] < pos) seg++;
      const a = run[seg - 1];
      const b = run[seg];
      const f = (pos - cum[seg - 1]) / Math.max(1e-6, cum[seg] - cum[seg - 1]);
      const x = d[a * 2] + (d[b * 2] - d[a * 2]) * f;
      const y = d[a * 2 + 1] + (d[b * 2 + 1] - d[a * 2 + 1]) * f;
      const sl = Math.hypot(d[b * 2] - d[a * 2], d[b * 2 + 1] - d[a * 2 + 1]) || 1;
      const nx = -(d[b * 2 + 1] - d[a * 2 + 1]) / sl;
      const ny = (d[b * 2] - d[a * 2]) / sl;
      const o = (rnd() * 2 - 1) * amp;
      out.push(x + nx * o, y + ny * o);
    }
    i = j;
  } while (i !== start && ++guard < 10000);
  return out;
}

/** a closed path; every outline is wound the same way, so pieces sharing one path add up instead of punching holes */
export function toPath(pts: Pts, into?: Path2D): Path2D {
  const p = into ?? new Path2D();
  let area = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  if (area >= 0) {
    p.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) p.lineTo(pts[i * 2], pts[i * 2 + 1]);
  } else {
    p.moveTo(pts[n * 2 - 2], pts[n * 2 - 1]);
    for (let i = n - 2; i >= 0; i--) p.lineTo(pts[i * 2], pts[i * 2 + 1]);
  }
  p.closePath();
  return p;
}

/** a hand-cut piece: outline -> scissor facets -> Path2D (step and amp in the outline's units) */
export function cut(outline: Pts, key: string, step = 0.13, amp = 0.012, into?: Path2D): Path2D {
  return toPath(recut(outline, step, amp, keyRng(key)), into);
}

/** a hand-cut disc */
export const disc = (cx: number, cy: number, r: number, key: string, step = Math.max(0.05, r * 0.42), amp = r * 0.035, into?: Path2D) =>
  cut(ellipsePts(cx, cy, r, r, 0, 36), key, step, amp, into);

/** several cut pieces in one path (they are filled together, in one go) */
export function many(...parts: [Pts, string, number?, number?][]): Path2D {
  const p = new Path2D();
  for (const [o, k, s, a] of parts) cut(o, k, s, a, p);
  return p;
}

// ------------------------------------------------------------------ the paper texture (built once)

let texPat: CanvasPattern | null | undefined;
/** paper fibre, specks and a faint mottle on a transparent 256 px tile (drawn at half scale, so 128 logical px) */
export function paperTexture(ctx: Ctx): CanvasPattern | null {
  if (texPat !== undefined) return texPat;
  texPat = null;
  if (typeof document === 'undefined') return null;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return null;
  const rnd = seeded(5150);
  const wrap = (x: number, y: number, r: number, f: (x: number, y: number) => void) => {
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const X = x + ox;
        const Y = y + oy;
        if (X + r < 0 || X - r > S || Y + r < 0 || Y - r > S) continue;
        f(X, Y);
      }
  };
  // a faint mottle, like dyed pulp
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 18 + rnd() * 46;
    const light = rnd() < 0.5;
    const c = light ? '255,250,238' : '70,45,20';
    const a = light ? 0.07 : 0.05;
    wrap(x, y, r, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r);
      gr.addColorStop(0, `rgba(${c},${a})`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      g.fillRect(X - r, Y - r, r * 2, r * 2);
    });
  }
  // fibres: short curling hairs, mostly light (the pulp), some dark
  g.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 3 + rnd() * 10;
    const a = rnd() * Math.PI * 2;
    const bend = (rnd() - 0.5) * 1.8;
    const dark = rnd() < 0.35;
    g.strokeStyle = dark ? `rgba(60,40,25,${0.04 + rnd() * 0.05})` : `rgba(255,252,240,${0.05 + rnd() * 0.09})`;
    g.lineWidth = 0.6 + rnd() * 0.7;
    wrap(x, y, len, (X, Y) => {
      g.beginPath();
      g.moveTo(X, Y);
      const mx = X + Math.cos(a) * len * 0.5 + Math.cos(a + 1.57) * bend * len * 0.3;
      const my = Y + Math.sin(a) * len * 0.5 + Math.sin(a + 1.57) * bend * len * 0.3;
      g.quadraticCurveTo(mx, my, X + Math.cos(a) * len, Y + Math.sin(a) * len);
      g.stroke();
    });
  }
  // specks
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 0.35 + rnd() * rnd() * 1.2;
    g.fillStyle = rnd() < 0.55 ? `rgba(50,35,20,${0.06 + rnd() * 0.1})` : `rgba(255,252,240,${0.12 + rnd() * 0.22})`;
    wrap(x, y, r, (X, Y) => {
      g.beginPath();
      g.arc(X, Y, r, 0, Math.PI * 2);
      g.fill();
    });
  }
  texPat = ctx.createPattern(cv, 'repeat');
  return texPat;
}

// ------------------------------------------------------------------ drawing (every frame)

/** the part casts its shadow on the layer below */
export const SH = 1;
/** a sliver of paper core shows on its lit edges */
export const RIM = 2;
/** paper fibre */
export const TEX = 4;
/** shadow only when drawn big (for parts too small to show one at game size) */
export const SHH = 8;
/** core sliver only when drawn big */
export const RIMH = 16;

const SHADOW_1 = 'rgba(48,30,14,0.15)';
const SHADOW_2 = 'rgba(48,30,14,0.1)';
const CORE = 'rgba(255,251,240,0.92)';

let cx: Ctx;
let A = 1;
let B = 0;
let C = 0;
let D = 1;
let E = 0;
let F = 0;
const stack = new Float64Array(6 * 32);
let sp = 0;
let base: DOMMatrix | null = null;
let s1x = 0;
let s1y = 0;
let s2x = 0;
let s2y = 0;
let rx = 0;
let ry = 0;
let hi = false;
let tex: CanvasPattern | null = null;
let PM: DOMMatrix | null = null;
let fl = 1;

/**
 * Start drawing a figure: (x, y) and scale s (the figure's units -> logical px), flip -1 to mirror. detail is
 * the figure's size in logical px (its r), which sets how far the shadows fall and whether the smallest
 * touches (split pins, glints, the shadows of tiny parts) are worth drawing.
 */
export function begin(ctx: Ctx, x: number, y: number, s: number, flip: number, detail: number) {
  cx = ctx;
  base = ctx.getTransform();
  A = base.a;
  B = base.b;
  C = base.c;
  D = base.d;
  E = base.e;
  F = base.f;
  sp = 0;
  fl = flip;
  hi = detail >= 30;
  // the shadow falls down and a little right (light from the upper left), further for a bigger figure; the
  // second, fainter pass twice as far softens its edge
  const k = clamp(detail * 0.05, 0.8, 3);
  const ox = 0.4 * k;
  const oy = k;
  s1x = A * ox + C * oy;
  s1y = B * ox + D * oy;
  s2x = s1x * 2.1;
  s2y = s1y * 2.1;
  const rk = clamp(detail * 0.02, 0.55, 1.2);
  rx = A * -0.55 * rk + C * -0.75 * rk;
  ry = B * -0.55 * rk + D * -0.75 * rk;
  translate(x, y);
  scale(s * flip, s);
  tex = paperTexture(ctx);
  if (tex) {
    PM ??= new DOMMatrix();
    // the tile is 256 px for 128 logical px, whatever the figure's scale
    PM.a = 0.5 / s;
    PM.d = 0.5 / s;
    PM.b = PM.c = PM.e = PM.f = 0;
    tex.setTransform(PM);
  }
}

export function end() {
  if (base) cx.setTransform(base);
  base = null;
}

export const isHi = () => hi;
/** -1 when the figure is mirrored (so a screen-space offset can be turned into the figure's units) */
export const flipped = () => fl;

/** clip what follows to a path (in the current units), until unclip() */
export function clipTo(p: Path2D) {
  cx.save();
  cx.setTransform(A, B, C, D, E, F);
  cx.clip(p);
}
export function unclip() {
  cx.restore();
}

export function push() {
  const o = sp * 6;
  stack[o] = A;
  stack[o + 1] = B;
  stack[o + 2] = C;
  stack[o + 3] = D;
  stack[o + 4] = E;
  stack[o + 5] = F;
  sp++;
}
export function pop() {
  sp--;
  const o = sp * 6;
  A = stack[o];
  B = stack[o + 1];
  C = stack[o + 2];
  D = stack[o + 3];
  E = stack[o + 4];
  F = stack[o + 5];
}
export function translate(x: number, y: number) {
  E += A * x + C * y;
  F += B * x + D * y;
}
export function rotate(a: number) {
  if (!a) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const a2 = A * c + C * s;
  const b2 = B * c + D * s;
  const c2 = C * c - A * s;
  const d2 = D * c - B * s;
  A = a2;
  B = b2;
  C = c2;
  D = d2;
}
export function scale(x: number, y = x) {
  A *= x;
  B *= x;
  C *= y;
  D *= y;
}
/** rotate by a about the point (px, py) */
export function rotateAt(px: number, py: number, a: number) {
  if (!a) return;
  translate(px, py);
  rotate(a);
  translate(-px, -py);
}

/** one paper part: its shadow on the layer below, a sliver of core on the lit edges, the colour, the fibre */
export function part(p: Path2D, col: string, f = SH | RIM) {
  const c = cx;
  if (f & SH || (hi && f & SHH)) {
    c.fillStyle = SHADOW_2;
    c.setTransform(A, B, C, D, E + s2x, F + s2y);
    c.fill(p);
    c.fillStyle = SHADOW_1;
    c.setTransform(A, B, C, D, E + s1x, F + s1y);
    c.fill(p);
  }
  if (f & RIM || (hi && f & RIMH)) {
    c.fillStyle = CORE;
    c.setTransform(A, B, C, D, E + rx, F + ry);
    c.fill(p);
  }
  c.setTransform(A, B, C, D, E, F);
  c.fillStyle = col;
  c.fill(p);
  if (tex && f & TEX) {
    c.fillStyle = tex;
    c.fill(p);
  }
}

/** a flat fill with no paper effects (a shadow on the ground, a glint) */
export function flat(p: Path2D, col: string) {
  cx.setTransform(A, B, C, D, E, F);
  cx.fillStyle = col;
  cx.fill(p);
}

// ------------------------------------------------------------------ colour

const hex = (c: string) => {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
/** mix two #rrggbb colours */
export function mix(a: string, b: string, t: number) {
  const x = hex(a);
  const y = hex(b);
  const m = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `#${((1 << 24) | (m(0) << 16) | (m(1) << 8) | m(2)).toString(16).slice(1)}`;
}
