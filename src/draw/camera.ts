import { ARENA } from '../data';
import { W } from '../theme';

/*
 * The match camera: flat and straight down. The fight is simulated on an ARENA.w x ARENA.h rectangle (ax across,
 * ay deep: 0 = the far end line at the top, ARENA.h = your end line at the bottom) and an arena point lands on
 * screen by one uniform scale and an offset. The stadium (arena.ts) draws the pitch with it and the battle view
 * draws every fighter and effect with it, so they always line up.
 *
 * The VIEW is the screen rectangle the arena is shown in; the main screen sets it every frame (setView). The pitch
 * is fitted to the view's width, leaving VIEW_PAD.side on each side for the wall and the crowd, and:
 *  - when the view is tall enough for the whole stadium (fitHeight), the pitch is centred in it;
 *  - when it is shorter (the prep view), it shows a band around the focus depth (setFocus), never scrolling past
 *    VIEW_PAD.top above the far end line or VIEW_PAD.bottom below the near one.
 * The two cases meet exactly, so a view whose height is animated moves the pitch smoothly.
 */

/** Room around the pitch in the view, in arena px (times the view scale on screen): the wall and the crowd at the
 * sides, the scoreboard and the referee above, the bench below. */
export const VIEW_PAD = { side: 40, top: 55, bottom: 55 } as const;

/** Kept for code written for the old tilted camera: things are the same size everywhere (1) and the camera looks
 * straight down (1). */
export const FAR_SCALE = 1;
export const TILT = 1;

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Projected {
  x: number;
  y: number;
  /** how big a thing standing here is drawn (multiply every size by it): the view scale, the same everywhere */
  s: number;
}

/** Where the pitch is on screen now (updated by setView / setFocus): its end lines, centre line and half width. */
export const PITCH = {
  /** screen y of the far end line (arena y = 0) */
  top: 0,
  /** screen y of the near end line (arena y = ARENA.h) */
  bottom: 0,
  /** screen x of the centre line */
  cx: W / 2,
  /** half the pitch's width on screen (the same at both ends now) */
  farHalf: 0,
  nearHalf: 0,
};

/** The default focus: your half, so your army standing in its rows is in the prep view. */
export const FOCUS_HOME = ARENA.h - 195;

const view: ViewRect = { x: 0, y: 90, w: W, h: 930 };
let focus = FOCUS_HOME;
let K = 1; // screen px per arena px
let OX = 0; // screen x of arena x 0
let OY = 0; // screen y of arena y 0

function place() {
  // the pitch and its side pads fill the width; the pads scale with the pitch
  K = Math.max(0.05, view.w / (ARENA.w + 2 * VIEW_PAD.side));
  OX = view.x + (view.w - ARENA.w * K) / 2;
  const ph = ARENA.h * K;
  const lo = view.y + view.h - ph - VIEW_PAD.bottom * K; // the near pad's edge on the view's bottom
  const hi = view.y + VIEW_PAD.top * K; // the far pad's edge on the view's top
  if (lo <= hi) OY = Math.min(hi, Math.max(lo, view.y + view.h / 2 - focus * K));
  else OY = (lo + hi) / 2;
  PITCH.top = OY;
  PITCH.bottom = OY + ph;
  PITCH.cx = OX + (ARENA.w * K) / 2;
  PITCH.farHalf = PITCH.nearHalf = (ARENA.w * K) / 2;
}
place();

/** Show the arena in this screen rectangle (call every frame, or whenever it changes). */
export function setView(r: ViewRect) {
  if (r.x === view.x && r.y === view.y && r.w === view.w && r.h === view.h) return;
  view.x = r.x;
  view.y = r.y;
  view.w = r.w;
  view.h = r.h;
  place();
}

/** The arena depth a view shorter than the stadium centres on (default FOCUS_HOME, your half). */
export function setFocus(ay: number) {
  if (ay === focus) return;
  focus = ay;
  place();
}

/** The focus depth set by setFocus. */
export function focusDepth(): number {
  return focus;
}

/** The current view rectangle (do not change it: use setView). */
export function viewRect(): Readonly<ViewRect> {
  return view;
}

/** Screen px per arena px in the current view. */
export function viewScale(): number {
  return K;
}

/** The view height at which the whole stadium (pitch and pads) just fits a view of width w: shorter views show a band. */
export function fitHeight(w: number = W): number {
  return ((ARENA.h + VIEW_PAD.top + VIEW_PAD.bottom) * w) / (ARENA.w + 2 * VIEW_PAD.side);
}

/** The size scale things have: the view scale, the same at every depth (the argument is kept for old callers). */
export function depthScale(_ay?: number): number {
  return K;
}

/** Screen y of arena depth ay. */
export function screenY(ay: number): number {
  return OY + ay * K;
}

/** Screen x of arena x ax. */
export function screenX(ax: number): number {
  return OX + ax * K;
}

/** An arena point (ax across, ay deep) as a screen point and a size scale. */
export function project(ax: number, ay: number): Projected {
  return { x: OX + ax * K, y: OY + ay * K, s: K };
}

/** The same as project(), written into an object you keep, for code that runs for every fighter every frame. */
export function projectInto(out: Projected, ax: number, ay: number): Projected {
  out.x = OX + ax * K;
  out.y = OY + ay * K;
  out.s = K;
  return out;
}

/** An arena direction (radians) as seen on screen: the camera looks straight down, so it is the same angle. */
export function screenAngle(dir: number): number {
  return dir;
}

/** A screen y back to arena depth (for a tap on the pitch). */
export function arenaY(sy: number): number {
  return (sy - OY) / K;
}

/** A screen x back to arena x. */
export function arenaX(sx: number): number {
  return (sx - OX) / K;
}

/** The four corners of an arena rectangle on screen, clockwise from top-left. */
export function quad(ax: number, ay: number, aw: number, ah: number): [number, number][] {
  const x0 = OX + ax * K;
  const y0 = OY + ay * K;
  const x1 = x0 + aw * K;
  const y1 = y0 + ah * K;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Traces an arena circle (or arc, from..to radians) on screen. Leaves the path open for the caller to stroke or fill. */
export function circlePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, from = 0, to = Math.PI * 2, _steps?: number) {
  ctx.beginPath();
  ctx.arc(OX + cx * K, OY + cy * K, Math.max(0, r * K), from, to);
}
