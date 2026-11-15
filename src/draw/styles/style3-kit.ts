/*
 * Style 3, "Bold Sticker": the shared kit. Every shape is drawn in two ways from the same code:
 *
 *   K.sil = true   the shape only adds its outline to the current path (no painting), so a whole pet or item
 *                  becomes one path; stroking that path wide gives the die-cut white border and its drop shadow
 *                  in one draw call each, whatever the number of parts.
 *   K.sil = false  the shape paints itself: a hard cel-shadow band, the lit colour, a crisp rim light on the
 *                  shadow side, a glossy highlight and a thick dark outline.
 *
 * The key light is fixed in the world (upper left), whichever way a pet faces: K.lx / K.ly hold it in the
 * current drawing's own units.
 */
export type Ctx = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;

export interface Tone {
  base: string;
  shade: string;
  rim: string;
}

/** The drawing state shared by every shape of the pet or item being drawn. */
export const K = {
  sil: false,
  /** outline width, in the current units */
  lw: 0.09,
  ink: '#151a2c',
  /** direction toward the key light, in the current units (unit length) */
  lx: -0.6,
  ly: -0.8,
  /** 1 = full detail, 0 = game size (no rim lights, fewer glints) */
  lod: 1,
};

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const hx = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
export function mix(a: string, b: string, k: number) {
  const x = rgb(a);
  const y = rgb(b);
  return `#${hx(x[0] + (y[0] - x[0]) * k)}${hx(x[1] + (y[1] - x[1]) * k)}${hx(x[2] + (y[2] - x[2]) * k)}`;
}

export const tone = (base: string, shade: string, rim: string): Tone => ({ base, shade, rim });

// ------------------------------------------------------------------ silhouette pieces

function silEll(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number) {
  c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function silDot(c: Ctx, x: number, y: number, h: number) {
  c.moveTo(x + h, y);
  c.arc(x, y, h, 0, TAU);
}

/** A thick line as filled pieces (a quad per segment, a disc per joint), wound like arcs. */
function silLine(c: Ctx, p: readonly number[], h: number) {
  for (let i = 0; i + 3 < p.length; i += 2) {
    const x0 = p[i];
    const y0 = p[i + 1];
    const x1 = p[i + 2];
    const y1 = p[i + 3];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * h;
    const ny = (dx / l) * h;
    c.moveTo(x0 - nx, y0 - ny);
    c.lineTo(x1 - nx, y1 - ny);
    c.lineTo(x1 + nx, y1 + ny);
    c.lineTo(x0 + nx, y0 + ny);
    c.closePath();
  }
  for (let i = 0; i + 1 < p.length; i += 2) silDot(c, p[i], p[i + 1], h);
}

// ------------------------------------------------------------------ painted pieces

function outline(c: Ctx, k = 1) {
  c.lineWidth = K.lw * k;
  c.strokeStyle = K.ink;
  c.stroke();
}

/**
 * A round part (ellipse) with the full sticker shading. gl: how much gloss (0 none, 1 full).
 */
export function ell(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, T: Tone, gl = 1) {
  if (K.sil) {
    silEll(c, x, y, rx, ry, rot);
    return;
  }
  // the light in the ellipse's own frame
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const ex = K.lx * cs + K.ly * sn;
  const ey = -K.lx * sn + K.ly * cs;
  // the shade fills the part, the lit colour is the same ellipse pulled toward the light and shrunk to stay inside
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fillStyle = T.shade;
  c.fill();
  const k = 0.2;
  const ox = ex * k * rx;
  const oy = ey * k * ry;
  c.beginPath();
  c.ellipse(x + ox * cs - oy * sn, y + ox * sn + oy * cs, rx * (1 - k * 1.08), ry * (1 - k * 1.08), rot, 0, TAU);
  c.fillStyle = T.base;
  c.fill();
  const m = Math.min(rx, ry);
  // a crisp rim of bounced light just inside the edge, on the shadow side
  if (m > 0.14) {
    const ta = Math.atan2(-ey * rx, -ex * ry);
    const ins = K.lw * 0.5 + m * 0.07;
    c.beginPath();
    c.ellipse(x, y, rx - ins, ry - ins, rot, ta - 0.72, ta + 0.5);
    c.lineWidth = m * 0.085;
    c.strokeStyle = T.rim;
    c.stroke();
  }
  // the gloss: a white bean and a dot
  if (gl > 0) {
    const tg = Math.atan2(ey * rx, ex * ry);
    c.beginPath();
    c.ellipse(x, y, rx * 0.66, ry * 0.66, rot, tg - 0.62, tg + 0.12);
    c.lineWidth = m * 0.17 * gl;
    c.strokeStyle = 'rgba(255,255,255,0.92)';
    c.stroke();
    if (K.lod) {
      const a = tg + 0.5;
      const px = Math.cos(a) * rx * 0.66;
      const py = Math.sin(a) * ry * 0.66;
      c.beginPath();
      c.arc(x + px * cs - py * sn, y + px * sn + py * cs, m * 0.075 * gl, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.fill();
    }
  }
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  outline(c);
}

/** A flat ellipse: one colour and the outline (eyes, bellies, small bits). */
export function flat(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, fill: string, line = 1) {
  if (K.sil) {
    silEll(c, x, y, rx, ry, rot);
    return;
  }
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fillStyle = fill;
  c.fill();
  if (line > 0) outline(c, line);
}

/** A limb: a thick round-jointed line with the outline around it. p = x0, y0, x1, y1, ... */
export function limb(c: Ctx, p: readonly number[], w: number, fill: string, hi?: string) {
  if (K.sil) {
    silLine(c, p, w / 2);
    return;
  }
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.lineWidth = w + K.lw * 0.9;
  c.strokeStyle = K.ink;
  c.stroke();
  c.lineWidth = Math.max(0.001, w - K.lw * 0.9);
  c.strokeStyle = fill;
  c.stroke();
  if (hi && K.lod) {
    // a thin catch-light along the upper side of the first segment
    const dx = p[2] - p[0];
    const dy = p[3] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l;
    let ny = dx / l;
    if (nx * K.lx + ny * K.ly < 0) {
      nx = -nx;
      ny = -ny;
    }
    const o = w * 0.18;
    c.beginPath();
    c.moveTo(p[0] + dx * 0.2 + nx * o, p[1] + dy * 0.2 + ny * o);
    c.lineTo(p[0] + dx * 0.75 + nx * o, p[1] + dy * 0.75 + ny * o);
    c.lineWidth = w * 0.2;
    c.strokeStyle = hi;
    c.stroke();
  }
}

/** A path part built by the caller (it must close its own shape): base fill and outline, shading clipped inside. */
export function pathPart(c: Ctx, build: (c: Ctx) => void, fill: string, shade?: (c: Ctx) => void, line = 1) {
  if (K.sil) {
    build(c);
    return;
  }
  c.beginPath();
  build(c);
  c.fillStyle = fill;
  c.fill();
  if (shade) {
    c.save();
    c.clip();
    shade(c);
    c.restore();
    c.beginPath();
    build(c);
  }
  if (line > 0) outline(c, line);
}

/** A white gloss stroke (round caps) along a polyline, painted only. */
export function glint(c: Ctx, p: readonly number[], w: number, a = 0.92) {
  if (K.sil) return;
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.lineWidth = w;
  c.strokeStyle = `rgba(255,255,255,${a})`;
  c.stroke();
}

/** An ink line (mouths, lids, squints), painted only. */
export function ink(c: Ctx, p: readonly number[], w: number, color = K.ink) {
  if (K.sil) return;
  c.beginPath();
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

/** An ink curve through a quadratic control point, painted only. */
export function inkCurve(c: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, color = K.ink) {
  if (K.sil) return;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(cx, cy, x1, y1);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

// ------------------------------------------------------------------ the sticker

/** The drop shadow under every sticker: a cool, see-through slate. */
const SHADOW_NEAR = 'rgba(28, 40, 62, 0.2)';
const SHADOW_FAR = 'rgba(28, 40, 62, 0.09)';

/**
 * Draws geom (which sets up its own transforms from the current one) as a die-cut sticker: a soft drop shadow,
 * a white border b px wide around the whole silhouette (outline included, ol px), then the painted art.
 * d: how far down the shadow falls, px.
 */
export function sticker(c: Ctx, geom: (c: Ctx) => void, b: number, ol: number, d: number, soft: boolean) {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  K.sil = true;
  // the drop shadow: the same silhouette, a little lower, stroked wide (its hollow middle is under the art)
  c.save();
  c.translate(0, d);
  c.beginPath();
  geom(c);
  c.restore();
  if (soft) {
    c.lineWidth = ol + b * 2 + d * 1.6;
    c.strokeStyle = SHADOW_FAR;
    c.stroke();
  }
  c.lineWidth = ol + b * 2 + d * 0.5;
  c.strokeStyle = SHADOW_NEAR;
  c.stroke();
  // the white die-cut border
  c.beginPath();
  geom(c);
  c.lineWidth = ol + b * 2;
  c.strokeStyle = '#ffffff';
  c.stroke();
  K.sil = false;
  geom(c);
}

/**
 * Runs fn in a frame moved to (x, y), turned by rot and scaled by s, keeping the key light fixed in the world
 * and the outline the same width on screen.
 */
export function frame(c: Ctx, x: number, y: number, rot: number, s: number, fn: (c: Ctx) => void) {
  c.save();
  c.translate(x, y);
  if (rot) c.rotate(rot);
  if (s !== 1) c.scale(s, s);
  const lx = K.lx;
  const ly = K.ly;
  const lw = K.lw;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  K.lx = lx * cs + ly * sn;
  K.ly = -lx * sn + ly * cs;
  K.lw = lw / s;
  fn(c);
  K.lx = lx;
  K.ly = ly;
  K.lw = lw;
  c.restore();
}
