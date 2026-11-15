import { TEAM } from '../../theme';

/*
 * Style 2's toolkit: the palette, the curved two-tone fill that gives every form its hard light / shade split,
 * and the sun (which way the long shadows fall). Gradients are made while a sprite is built, never per frame.
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

/** One team's tones. Every form is a pair: the colour in the sun, then in shade. */
export interface Pal {
  body: string;
  bodyS: string;
  /** near limbs, a step down from the body so they read against it */
  limb: string;
  limbS: string;
  /** far limbs and mandibles */
  deep: string;
  spot: string;
  spotS: string;
  belly: string;
  bellyS: string;
  /** the helmet's plume */
  plume: string;
  plumeS: string;
  /** a cast shadow laid over anything (see-through) */
  cast: string;
}
export const PAL: Pal[] = TEAM.map((c, i) => {
  // the sun side leans warm-bright, the shade side cool-deep: a hue shift, not just darker paint
  const blue = i === 0;
  const sun = blue ? '#62d6ff' : '#ff4a3a';
  const dusk = blue ? '#3a3cc6' : '#a3164f';
  const night = blue ? '#121c58' : '#470b28';
  const body = mix(c.main, sun, blue ? 0.2 : 0.3);
  const bodyS = mix(c.dark, dusk, 0.28);
  const cream = '#fff4dc';
  return {
    body,
    bodyS,
    limb: mix(c.dark, c.main, 0.2),
    limbS: mix(c.dark, night, 0.32),
    deep: mix(c.dark, night, 0.58),
    spot: mix(c.dark, dusk, 0.12),
    spotS: mix(c.dark, night, 0.42),
    belly: mix(cream, c.light, 0.16),
    bellyS: mix(mix(cream, c.light, 0.55), c.dark, 0.22),
    plume: body,
    plumeS: bodyS,
    cast: blue ? 'rgba(14, 22, 92, 0.24)' : 'rgba(84, 6, 40, 0.24)',
  };
});

export const INK = '#151c28';
export const EYE = '#fffdf6';
export const EYE_S = '#e4ddd0';
/** swing arcs and impact stars */
export const FX = '#ffd84a';
export const FX_HI = '#fffbe8';

/**
 * The sun, high on the upper left. A point h above the ground throws its shadow kx * h to the right and ky * h
 * down the screen; the shadow is the pet's own silhouette laid down that way, hard edged, `alpha` strong.
 */
export const SUN = { kx: 0.74, ky: 0.28, color: '#26244a', alpha: 0.2 };

/**
 * The curved terminator. A fill that is `lit` inside a circle and `shade` outside it: the circle is 1.35 rho
 * across and its edge crosses the form's centre line k * rho past (cx, cy) along the light (lx, ly), so a round
 * form of radius rho keeps about two thirds lit and a crescent of shade wraps its far side. Every part of one
 * mass shares the same circle, so the terminator runs on unbroken across the parts.
 */
export function moon(ctx: Ctx, cx: number, cy: number, rho: number, lx: number, ly: number, lit: string, shade: string, k = 0.3): CanvasGradient {
  const R = 1.35 * rho;
  const d = R - k * rho;
  const x = cx - lx * d;
  const y = cy - ly * d;
  const out = R + 3 * rho;
  const g = ctx.createRadialGradient(x, y, 0, x, y, out);
  const at = R / out;
  const b = 0.008 / out;
  g.addColorStop(0, lit);
  g.addColorStop(at - b, lit);
  g.addColorStop(at + b, shade);
  g.addColorStop(1, shade);
  return g;
}
