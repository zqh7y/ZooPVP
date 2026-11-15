import { TEAM } from '../../theme';

/*
 * Style 2's toolkit: the palette, the cached two-tone fills that give every part its hard light / shade split,
 * and the soft ground shadow. Nothing here allocates per frame once the caches are warm.
 */
export type Ctx = CanvasRenderingContext2D;

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** a..b by k, as a #rrggbb string */
export function mix(a: string, b: string, k: number): string {
  const A = rgb(a);
  const B = rgb(b);
  const c = (i: number) => Math.round(A[i] + (B[i] - A[i]) * k).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}

/** One team's ladder of tones, lightest first. Every part is two neighbouring rungs. */
export interface Pal {
  hi: string; // the lightest: throats, bellies
  hiShade: string;
  lit: string; // a near limb in the light
  base: string; // the team colour itself
  mid: string; // the body's shade side
  shade: string; // the team's dark
  deep: string; // far limbs, mandibles
}
export const PAL: Pal[] = TEAM.map((c, i) => {
  // the light side leans warm-bright, the shade side leans cool-deep: a hue shift, not just darker paint
  const night = i === 0 ? '#14205a' : '#4a0f2c';
  const sun = i === 0 ? '#5fd0ff' : '#ff8a5c';
  const dusk = i === 0 ? '#3d34b8' : '#b0205a';
  return {
    hi: mix(c.light, '#fff6e4', 0.45),
    hiShade: mix(c.light, c.main, 0.25),
    lit: mix(mix(c.main, c.light, 0.3), sun, 0.15),
    base: mix(c.main, sun, 0.18),
    mid: mix(c.dark, dusk, 0.22),
    shade: mix(mix(c.dark, dusk, 0.3), night, 0.25),
    deep: mix(c.dark, night, 0.55),
  };
});

export const INK = '#151c28';
export const EYE = '#fffdf6';

// ------------------------------------------------------------------ cached hard-split gradients

const caches = new WeakMap<Ctx, Map<number, CanvasGradient>>();
function cacheOf(ctx: Ctx): Map<number, CanvasGradient> {
  let m = caches.get(ctx);
  if (!m) {
    m = new Map();
    caches.set(ctx, m);
  }
  return m;
}

/**
 * A fill that is `lit` on one side of a straight line and `shade` on the other: the line passes `off` units
 * past (cx, cy) along (dx, dy) (the way the light travels), so a positive off leaves more of the part lit.
 * Built once per key and reused; the coordinates are in whatever space the caller fills in.
 */
export function split(ctx: Ctx, key: number, cx: number, cy: number, dx: number, dy: number, lit: string, shade: string, off = 0): CanvasGradient {
  const m = cacheOf(ctx);
  let g = m.get(key);
  if (g) return g;
  const L = 2;
  g = ctx.createLinearGradient(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L);
  const at = 0.5 + off / (2 * L);
  const b = 0.0035;
  g.addColorStop(0, lit);
  g.addColorStop(Math.max(0, at - b), lit);
  g.addColorStop(Math.min(1, at + b), shade);
  g.addColorStop(1, shade);
  m.set(key, g);
  return g;
}

// ------------------------------------------------------------------ the soft long shadow, baked once

let shadowSprite: HTMLCanvasElement | null = null;
/** 144 x 48 (the tail ends near 140): a dark core under the feet at (40, 24), a long soft tail off to the right. */
export function shadow(): HTMLCanvasElement {
  if (shadowSprite) return shadowSprite;
  const c = document.createElement('canvas');
  c.width = 144;
  c.height = 48;
  const g = c.getContext('2d')!;
  const blob = (x: number, y: number, rx: number, ry: number, a: number) => {
    g.save();
    g.translate(x, y);
    g.scale(rx / ry, 1);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    rg.addColorStop(0, `rgba(28, 46, 34, ${a})`);
    rg.addColorStop(0.55, `rgba(28, 46, 34, ${a * 0.75})`);
    rg.addColorStop(1, 'rgba(28, 46, 34, 0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, ry, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  blob(76, 25, 64, 15, 0.42); // the long tail
  blob(42, 24, 38, 14, 0.5); // the core under the body
  blob(40, 24, 24, 8, 0.35); // contact
  shadowSprite = c;
  return c;
}
