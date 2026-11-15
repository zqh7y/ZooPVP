/*
 * Style 5's replacement frames. A stop-motion studio keeps a shelf of replacement parts and swaps them between
 * frames; this keeps a shelf of finished pictures. Each look (pet, team, facing, weapon, helmet, pose and idle
 * frame) is cut and glued once, at the screen's pixel density, into its own small canvas cropped to the paper,
 * and from then on a fighter costs one drawImage on whole device pixels. The idle has only a few frames anyway
 * (the puppet is moved a few times a second), so the shelf stays small; the least recently used go first.
 */
type Ctx = CanvasRenderingContext2D;

export interface Pic {
  cv: HTMLCanvasElement;
  /** top left of the picture, relative to its anchor, and its size, in logical px */
  x: number;
  y: number;
  w: number;
  h: number;
}

const SHELF = new Map<string, Pic>();
const MAX = 360;

/**
 * The pixel density to paint pictures at: the context's scale, rounded up to a quarter, so a camera that zooms
 * smoothly reuses a few densities instead of painting new pictures every frame.
 */
export function density(ctx: Ctx) {
  const m = ctx.getTransform();
  return Math.max(0.5, Math.ceil(Math.hypot(m.a, m.b) * 4 - 1e-3) / 4);
}

/** The picture for key, painted (in logical px around its anchor, inside x0..x1, y0..y1) the first time it is asked for. */
export function picture(key: string, x0: number, y0: number, x1: number, y1: number, q: number, paint: (c: Ctx) => void): Pic {
  let p = SHELF.get(key);
  if (p) {
    SHELF.delete(key);
    SHELF.set(key, p);
    return p;
  }
  const pw = Math.max(1, Math.ceil((x1 - x0) * q));
  const ph = Math.max(1, Math.ceil((y1 - y0) * q));
  const big = document.createElement('canvas');
  big.width = pw;
  big.height = ph;
  const c = big.getContext('2d', { willReadFrequently: true })!;
  c.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
  paint(c);
  // crop to the paper, once, so each stamp moves as few pixels as it can
  const a = c.getImageData(0, 0, pw, ph).data;
  let minX = pw;
  let minY = ph;
  let maxX = -1;
  let maxY = -1;
  for (let yy = 0; yy < ph; yy++) {
    const row = yy * pw * 4 + 3;
    for (let xx = 0; xx < pw; xx++) {
      if (a[row + xx * 4] > 1) {
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        maxY = yy;
      }
    }
  }
  if (maxX < 0) minX = minY = maxX = maxY = 0;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  cv.getContext('2d')!.drawImage(big, minX, minY, cw, ch, 0, 0, cw, ch);
  p = { cv, x: x0 + minX / q, y: y0 + minY / q, w: cw / q, h: ch / q };
  SHELF.set(key, p);
  if (SHELF.size > MAX) SHELF.delete(SHELF.keys().next().value as string);
  return p;
}

/** Stamps a picture with its anchor at (x, y) (scaled by k), on whole device pixels when the context only scales. */
export function stamp(ctx: Ctx, p: Pic, x: number, y: number, k = 1) {
  if (k !== 1) {
    ctx.drawImage(p.cv, x + p.x * k, y + p.y * k, p.w * k, p.h * k);
    return;
  }
  const m = ctx.getTransform();
  if (m.b === 0 && m.c === 0 && m.a > 0 && m.d > 0 && Math.abs(m.a * p.w - p.cv.width) < 0.01) {
    const dx = Math.round((x + p.x) * m.a + m.e);
    const dy = Math.round((y + p.y) * m.d + m.f);
    ctx.drawImage(p.cv, (dx - m.e) / m.a, (dy - m.f) / m.d, p.w, p.h);
  } else ctx.drawImage(p.cv, x + p.x, y + p.y, p.w, p.h);
}
