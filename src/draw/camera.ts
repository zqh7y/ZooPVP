import { ARENA } from '../data';
import { FIELD, W } from '../theme';

/*
 * The match camera: a broadcast view from behind the player's end, so the pitch is a trapezoid that narrows
 * toward the far (opponent's) end and everything on it shrinks with distance. The fight is simulated on a flat
 * ARENA.w x ARENA.h rectangle; this is the one place that turns an arena point into a screen point. The stadium
 * (arena.ts) draws the pitch with it and the battle screen draws every fighter and effect with it, so they
 * always line up.
 *
 * Depth is linear in arena y: scale s goes from FAR_SCALE at the far end line (arena y = 0) to 1 at the near end
 * line (arena y = ARENA.h). Screen y is the running sum of s, flattened by TILT because the camera looks down at
 * an angle, so rows bunch up toward the far end and a circle on the grass reads as an ellipse.
 */

/** How big things are at the far end line compared with the near one. */
export const FAR_SCALE = 0.82;
/** How much the camera's tilt flattens distances up the pitch (1 = straight down). */
export const TILT = 0.88;

const SPAN = TILT * ARENA.h * (FAR_SCALE + 1) * 0.5; // the pitch's height on screen
const NEAR_LINE = 952; // screen y of the near end line

/** Where the pitch sits on screen. */
export const PITCH = {
  /** screen y of the far end line */
  top: NEAR_LINE - Math.round(SPAN),
  /** screen y of the near end line */
  bottom: NEAR_LINE,
  /** screen x of the centre line */
  cx: W / 2,
  /** half the pitch's width on screen at the far and at the near end line */
  farHalf: (ARENA.w / 2) * FAR_SCALE,
  nearHalf: ARENA.w / 2,
};

/** The scale things have at arena depth ay (0 = far end line, ARENA.h = near end line). Works past both ends. */
export function depthScale(ay: number): number {
  return FAR_SCALE + (1 - FAR_SCALE) * (ay / ARENA.h);
}

/** Screen y of arena depth ay. */
export function screenY(ay: number): number {
  return PITCH.top + TILT * (FAR_SCALE * ay + ((1 - FAR_SCALE) * ay * ay) / (2 * ARENA.h));
}

export interface Projected {
  x: number;
  y: number;
  /** how big a thing standing here is drawn (multiply every size by it) */
  s: number;
}

/** An arena point (ax across, ay deep) as a screen point and a size scale. */
export function project(ax: number, ay: number): Projected {
  const s = depthScale(ay);
  return { x: PITCH.cx + (ax - ARENA.w / 2) * s, y: screenY(ay), s };
}

/** The same as project(), written into an object you keep, for code that runs for every fighter every frame. */
export function projectInto(out: Projected, ax: number, ay: number): Projected {
  const s = depthScale(ay);
  out.x = PITCH.cx + (ax - ARENA.w / 2) * s;
  out.y = screenY(ay);
  out.s = s;
  return out;
}

/**
 * An arena direction (radians, in the flat arena) as seen on screen at depth ay: movement up the pitch looks
 * shorter than movement across it. Use it for things that point (a swing, a hit's push, a streak).
 */
export function screenAngle(dir: number): number {
  // across, a step of 1 is drawn s long; up the pitch, s x TILT long: only the tilt changes the angle
  return Math.atan2(Math.sin(dir) * TILT, Math.cos(dir));
}

/** The screen y back to arena depth (for a tap on the pitch). */
export function arenaY(sy: number): number {
  const a = (TILT * (1 - FAR_SCALE)) / (2 * ARENA.h);
  const b = TILT * FAR_SCALE;
  const c = PITCH.top - sy;
  return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
}

/** The four corners of an arena rectangle on screen, clockwise from far-left (for drawing the pitch and its lines). */
export function quad(ax: number, ay: number, aw: number, ah: number): [number, number][] {
  const a = project(ax, ay);
  const b = project(ax + aw, ay);
  const c = project(ax + aw, ay + ah);
  const d = project(ax, ay + ah);
  return [
    [a.x, a.y],
    [b.x, b.y],
    [c.x, c.y],
    [d.x, d.y],
  ];
}

/**
 * Traces an arena circle (centre cx, cy and radius r, in arena px) on screen, as the ellipse-like shape the
 * camera makes of it. Leaves the path open for the caller to stroke or fill.
 */
export function circlePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, from = 0, to = Math.PI * 2, steps = 48) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const p = project(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

// theme.ts keeps FIELD as the pitch's box on screen; it cannot import this module, so check they agree here
if (import.meta.env?.DEV && (FIELD.y !== PITCH.top || FIELD.y + FIELD.h !== PITCH.bottom || FIELD.w !== PITCH.nearHalf * 2)) {
  console.warn('theme FIELD no longer matches the camera PITCH', FIELD, PITCH);
}
