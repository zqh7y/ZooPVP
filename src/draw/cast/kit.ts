import type { GearType, Team, WeaponType } from '../../types';
import type { PetLook, PetPose } from '../petTypes';
import { COLOR, TEAM } from '../../theme';
import { clamp, lerp, smooth } from '../../util';
import { drawWeapon, heat } from '../weapons';
import { drawGear } from '../gear';

/*
 * THE KIT every fighter is drawn with (docs/v5.md). A fighter lives in its own file in this folder; pets.ts maps
 * the unit ids to them and holds the contract (drawPet, drawShadow, snapshot, headTop). Fighters are drawn from
 * the side with their feet on the origin, facing right, in "units" (1 = the body radius r the caller passes).
 *
 *  - A fighter is a few PARTS (a body, a head with its face, feet, gloves, a tail ...). A part is a picture drawn
 *    ONCE per (fighter, team, part, variant, size step) into a small cached canvas, then placed every frame with a
 *    transform: put(PART, variantKey, x, y, rot, sx, sy). Per frame a unit costs a handful of drawImage calls and
 *    no paths (paths only for chili heat, puff gloss, stone cracks and limp wrinkles).
 *  - part(id, [x, y, w, h], draw) makes a part: its box is in units around its pivot (the origin of `draw`), with
 *    room for the outline (about 0.2). id must be unique across all fighters.
 *  - Inside a part's draw(g): chunk(g, [[path, '#hex', shade], ...]) paints shapes as ONE chunky silhouette: the
 *    thick dark outline of every shape first, then every fill on top, each with its one soft shade (shade = how
 *    far the lit copy is pushed up-left, 0 = flat). Paths: E() ellipse, RR() rounded rect, PATH(p => ...) free.
 *    Details: inner(g, path, k) for a thin inner ink line, clipIn(g, path, () => ...) to paint inside a shape,
 *    eyes(g, x1, x2, y, s, skin), mouth(g, x, y, s), blush(g, x, y, s). Faces follow B.face / B.mouth (picked from
 *    the pose by pickFace / pickMouth), so a head part takes R.fk as its variant key.
 *  - Colours: pass plain '#rrggbb' to chunk (it runs them through C()); call C('#hex') yourself for details.
 *    C() turns a colour white for the hit flash and grey for stone, so every part gets those for free.
 *    accent() is the CORNER colour (blue / red) of the part being built: gloves, wraps, trunks, belts, masks.
 *  - THE CORNER KIT: glovePart (Roo's boxing glove), wrapPart (a taped fist), trunksIn (trunks with a white
 *    waistband, clipped into a body shape). Use them so the roster reads as one.
 *  - Per frame helpers: aimHand(x, y, reach) puts the near hand for the weapon swing or the bare-handed jab
 *    (result in H), armsAndWeapon(HAND) draws the weapon and the hand(s) on it, helmetAt, shoeAt, crownAt,
 *    chiliAt for the gear and the boss crown.
 *  - TO ADD A FIGHTER: a file here with its parts, a draw() that puts them back to front for the pose in R, and
 *    its CharDef from ch(top of head, shadow, middle, colours, draw, options); then map its id in pets.ts.
 */
export type Ctx = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colours

export const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
export const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
export function mix(a: string, b: string, k: number) {
  const x = rgb(a);
  const y = rgb(b);
  return `#${hex2(lerp(x[0], y[0], k))}${hex2(lerp(x[1], y[1], k))}${hex2(lerp(x[2], y[2], k))}`;
}
export function grey(h: string) {
  const [r, g, b] = rgb(h);
  const y = hex2(Math.min(255, (r * 0.299 + g * 0.587 + b * 0.114) * 1.08));
  return `#${y}${y}${y}`;
}

/** How a picture is painted: n = itself, w = the white hit flash (the outline stays), s = grey stone. */
export type Mode = 'n' | 'w' | 's';
export let MODE: Mode = 'n';
export const WHITE = '#ffffff';
export const STONE = '#a4aab2';
export const STONE_INK = '#3a3f47';
export const MOUTH = '#5b2a31';
export const TONGUE = '#e48c8a';
export const CHEEK = '#ef9d92';
export const MEMO = new Map<string, string>();
/** A colour as the picture being built paints it (flash and stone come from here). */
export function C(hex: string): string {
  if (MODE === 'n') return hex;
  const k = MODE + hex;
  let v = MEMO.get(k);
  if (!v) {
    v = MODE === 'w' ? mix(hex, WHITE, 0.8) : mix(grey(hex), STONE, 0.5);
    MEMO.set(k, v);
  }
  return v;
}
export const inkC = () => (MODE === 's' ? STONE_INK : COLOR.ink);
/** the one shade of a fill: a little darker and cooler */
export const shadeOf = (c: string) => mix(c, '#2e2742', 0.2);

/** Team accents, a touch softer than the interface's team colours: 0 = yours (blue), 1 = theirs (red). */
export const ACCENT = TEAM.map((t) => mix(t.main, '#7f8792', 0.14));

// ------------------------------------------------------------------ what the picture being built is for

export type Face = 'open' | 'blink' | 'angry' | 'pinch' | 'happy' | 'spiral' | 'wide' | 'x' | 'droop' | 'stone';
export type Mouth = 'smile' | 'flat' | 'open' | 'grin' | 'o' | 'tongue' | 'wavy' | 'grit';
export const B = { team: 0 as Team, lw: 0.1, face: 'open' as Face, mouth: 'smile' as Mouth, boss: false, sph: 0 };
/** the team colour of the part being built (raw hex, for chunk) */
export const accent = () => ACCENT[B.team];

// ------------------------------------------------------------------ paths and chunky painting

export function E(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, TAU);
  return p;
}
export function RR(x: number, y: number, w: number, h: number, r: number): Path2D {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const p = new Path2D();
  p.moveTo(x + k, y);
  p.arcTo(x + w, y, x + w, y + h, k);
  p.arcTo(x + w, y + h, x, y + h, k);
  p.arcTo(x, y + h, x, y, k);
  p.arcTo(x, y, x + w, y, k);
  p.closePath();
  return p;
}
export function PATH(f: (p: Path2D) => void): Path2D {
  const p = new Path2D();
  f(p);
  return p;
}

export type Sh = readonly [Path2D, string, number?];
/** One fill with its one shade: the lit copy pushed d up-left, so the shade is a crescent low on the right. */
export function paint(g: Ctx, p: Path2D, fill: string, d: number) {
  const f = C(fill);
  if (!d) {
    g.fillStyle = f;
    g.fill(p);
    return;
  }
  g.fillStyle = shadeOf(f);
  g.fill(p);
  g.save();
  g.clip(p);
  g.translate(-d * 0.45, -d);
  g.fillStyle = f;
  g.fill(p);
  g.restore();
}
/** Shapes as one chunky silhouette: all outlines first (thick ink), then all fills over them, in order. */
export function chunk(g: Ctx, shapes: readonly Sh[]) {
  g.lineWidth = B.lw * 2;
  g.strokeStyle = inkC();
  for (const s of shapes) g.stroke(s[0]);
  for (const s of shapes) paint(g, s[0], s[1], s[2] ?? 0);
}
/** A thin inner ink line along a path (k = width in outlines). */
export function inner(g: Ctx, p: Path2D, k = 0.9) {
  g.lineWidth = B.lw * k;
  g.strokeStyle = inkC();
  g.stroke(p);
}
export function clipIn(g: Ctx, p: Path2D, draw: () => void) {
  g.save();
  g.clip(p);
  draw();
  g.restore();
}
/** A fat line with an ink edge (antennae, stems, ribbon tails). */
export function rope(g: Ctx, p: Path2D, w: number, col: string) {
  g.lineWidth = w + B.lw * 2;
  g.strokeStyle = inkC();
  g.stroke(p);
  g.lineWidth = w;
  g.strokeStyle = C(col);
  g.stroke(p);
}

// ------------------------------------------------------------------ faces

/** Two eyes for B.face: the near one at x1, the far one (a little smaller) at x2; s = half the eye's height. */
export function eyes(g: Ctx, x1: number, x2: number, y: number, s: number, skin: string) {
  eye(g, x1, y, s, skin, 0);
  eye(g, x2, y - s * 0.06, s * 0.9, skin, 1);
}
export function eye(g: Ctx, x: number, y: number, s: number, skin: string, i: number) {
  const f = B.face;
  const ink = inkC();
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = Math.max(s * 0.42, B.lw * 0.9);
  g.beginPath();
  switch (f) {
    case 'blink':
      g.moveTo(x - s * 0.7, y + s * 0.1);
      g.quadraticCurveTo(x, y + s * 0.5, x + s * 0.7, y + s * 0.1);
      g.stroke();
      return;
    case 'happy':
      g.moveTo(x - s * 0.75, y + s * 0.3);
      g.quadraticCurveTo(x, y - s * 0.8, x + s * 0.75, y + s * 0.3);
      g.stroke();
      return;
    case 'pinch': {
      const d = i ? -1 : 1;
      g.moveTo(x - d * s * 0.6, y - s * 0.7);
      g.lineTo(x + d * s * 0.55, y);
      g.lineTo(x - d * s * 0.6, y + s * 0.7);
      g.stroke();
      return;
    }
    case 'x':
      g.moveTo(x - s * 0.6, y - s * 0.6);
      g.lineTo(x + s * 0.6, y + s * 0.6);
      g.moveTo(x + s * 0.6, y - s * 0.6);
      g.lineTo(x - s * 0.6, y + s * 0.6);
      g.stroke();
      return;
    case 'spiral':
      for (let k = 0; k <= 16; k++) {
        const a = k * 0.85 + i * 2 - B.sph * 1.5708;
        const d = (s * 0.95 * k) / 16;
        if (k) g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        else g.moveTo(x, y);
      }
      g.lineWidth = Math.max(s * 0.26, B.lw * 0.7);
      g.stroke();
      return;
    case 'wide':
      g.arc(x, y, s * 1.12, 0, TAU);
      g.fillStyle = C(WHITE);
      g.fill();
      g.lineWidth = B.lw;
      g.stroke();
      g.beginPath();
      g.arc(x + s * 0.12, y, s * 0.42, 0, TAU);
      g.fillStyle = ink;
      g.fill();
      return;
  }
  // a dot with a catch of light: open, angry, droop, stone
  g.ellipse(x, y, s * 0.68, s, 0, 0, TAU);
  g.fillStyle = f === 'stone' ? C('#7d838c') : ink;
  g.fill();
  if (f === 'stone') return;
  g.beginPath();
  g.arc(x - s * 0.2, y - s * 0.4, s * 0.3, 0, TAU);
  g.fillStyle = C(WHITE);
  g.fill();
  if (f === 'angry') {
    // the brow cuts the top of the eye, slanting down toward the front
    g.beginPath();
    g.moveTo(x - s * 1.2, y - s * 1.7);
    g.lineTo(x + s * 1.2, y - s * 1.7);
    g.lineTo(x + s * 1.2, y - s * 0.55);
    g.lineTo(x - s * 1.2, y - s * 1.15);
    g.closePath();
    g.fillStyle = C(skin);
    g.fill();
    g.beginPath();
    g.moveTo(x - s * 1.0, y - s * 1.15);
    g.lineTo(x + s * 0.95, y - s * 0.6);
    g.lineWidth = s * 0.5;
    g.stroke();
  } else if (f === 'droop') {
    g.fillStyle = C(skin);
    g.fillRect(x - s, y - s * 1.2, s * 2, s * 1.1);
    g.beginPath();
    g.moveTo(x - s * 0.8, y - s * 0.1);
    g.lineTo(x + s * 0.8, y - s * 0.1);
    g.lineWidth = s * 0.4;
    g.stroke();
  }
}

export function mouth(g: Ctx, x: number, y: number, s: number) {
  const ink = inkC();
  g.strokeStyle = ink;
  g.lineWidth = Math.max(s * 0.42, B.lw * 0.9);
  g.beginPath();
  const filled = (open: () => void, tongue: boolean) => {
    g.beginPath();
    open();
    g.fillStyle = C(MOUTH);
    g.fill();
    if (tongue) {
      g.save();
      g.clip();
      g.beginPath();
      g.ellipse(x + s * 0.1, y + s * 0.75, s * 0.5, s * 0.42, 0, 0, TAU);
      g.fillStyle = C(TONGUE);
      g.fill();
      g.restore();
    }
    g.beginPath();
    open();
    g.lineWidth = B.lw;
    g.stroke();
  };
  switch (B.mouth) {
    case 'smile':
      g.arc(x, y - s * 0.55, s * 0.75, Math.PI * 0.22, Math.PI * 0.78);
      g.stroke();
      return;
    case 'flat':
      g.moveTo(x - s * 0.45, y);
      g.lineTo(x + s * 0.45, y);
      g.stroke();
      return;
    case 'wavy':
      g.moveTo(x - s * 0.7, y);
      for (let i = 1; i <= 4; i++) g.lineTo(x - s * 0.7 + i * s * 0.35, y + (i % 2 ? -s * 0.22 : s * 0.12));
      g.lineWidth = Math.max(s * 0.3, B.lw * 0.8);
      g.stroke();
      return;
    case 'open':
      filled(() => g.ellipse(x, y + s * 0.15, s * 0.6, s * 0.75, 0, 0, TAU), true);
      return;
    case 'grin':
      filled(() => {
        g.moveTo(x - s * 0.85, y - s * 0.3);
        g.lineTo(x + s * 0.85, y - s * 0.3);
        g.ellipse(x, y - s * 0.3, s * 0.85, s * 0.95, 0, 0, Math.PI);
        g.closePath();
      }, true);
      return;
    case 'o':
      filled(() => g.ellipse(x, y + s * 0.1, s * 0.34, s * 0.44, 0, 0, TAU), false);
      return;
    case 'grit': {
      const p = RR(x - s * 0.75, y - s * 0.3, s * 1.5, s * 0.62, s * 0.24);
      g.fillStyle = C(WHITE);
      g.fill(p);
      g.lineWidth = B.lw;
      g.stroke(p);
      g.beginPath();
      g.moveTo(x - s * 0.7, y + s * 0.01);
      g.lineTo(x + s * 0.7, y + s * 0.01);
      g.moveTo(x, y - s * 0.28);
      g.lineTo(x, y + s * 0.3);
      g.lineWidth = B.lw * 0.6;
      g.stroke();
      return;
    }
    case 'tongue':
      g.moveTo(x - s * 0.5, y);
      g.lineTo(x + s * 0.5, y);
      g.stroke();
      g.beginPath();
      g.ellipse(x + s * 0.18, y + s * 0.42, s * 0.28, s * 0.4, -0.2, 0, Math.PI);
      g.closePath();
      g.fillStyle = C(TONGUE);
      g.fill();
      g.lineWidth = B.lw * 0.8;
      g.stroke();
      return;
  }
}

export function blush(g: Ctx, x: number, y: number, s: number) {
  if (MODE === 's') return;
  g.globalAlpha = 0.55;
  g.fillStyle = C(CHEEK);
  g.beginPath();
  g.ellipse(x, y, s * 1.25, s * 0.7, 0, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

export function pickFace(look: PetLook, pose: PetPose): Face {
  if (pose.stone > 0.6) return 'stone';
  if (pose.mood === 'dead') return 'x';
  if (pose.hurt > 0.35 || pose.mood === 'hurt') return 'pinch';
  if (pose.mood === 'dizzy') return 'spiral';
  if (pose.mood === 'cheer') return 'happy';
  if (pose.mood === 'scared' || pose.puff > 0.25) return 'wide';
  if (pose.limp > 0.4) return 'droop';
  if (pose.mood === 'angry' || look.boss || pose.strike > 0.05 || pose.wind > 0.25) return 'angry';
  // a blink every few seconds, each fighter on its own beat
  if (pose.mood === 'idle' && (pose.t + (((look.seed * 0.618) % 1) + 1) * 2.9) % 3.7 < 0.13) return 'blink';
  return 'open';
}
export function pickMouth(look: PetLook, pose: PetPose, f: Face): Mouth {
  if (f === 'stone' || f === 'droop') return 'flat';
  if (f === 'x') return 'tongue';
  if (f === 'pinch') return 'o';
  if (f === 'spiral' || f === 'wide') return 'wavy';
  if (f === 'happy') return 'grin';
  if (pose.strike > 0.05 || pose.wind > 0.5) return 'open';
  if (f === 'angry') return look.boss || pose.mood === 'angry' ? 'grit' : 'flat';
  return 'smile';
}

// ------------------------------------------------------------------ parts: pictures made once, placed each frame

export interface Part {
  id: string;
  /** x, y, w, h in units around the pivot */
  box: readonly [number, number, number, number];
  draw: (g: Ctx) => void;
}
export const part = (id: string, box: readonly [number, number, number, number], draw: (g: Ctx) => void): Part => ({ id, box, draw });

/** Everything about the fighter being drawn this frame (one object, reused: no garbage per frame). */
export const R = {
  ctx: null as unknown as Ctx,
  look: null as unknown as PetLook,
  pose: null as unknown as PetPose,
  r: 1,
  /** size step of the cached pictures */
  rb: 0,
  lw: 0.1,
  /** prefix of every picture's key: character, team, boss */
  pre: '',
  t: 0,
  seed: 0,
  /** walk phase (radians) and how much it is walking */
  ph: 0,
  mv: 0,
  wind: 0,
  strike: 0,
  aim: 0,
  cheer: 0,
  hurt: 0,
  weapon: null as WeaponType | null,
  face: 'open' as Face,
  mouth: 'smile' as Mouth,
  /** the spin step (0..3) of dizzy spiral eyes */
  sph: 0,
  /** the face's key: pass it as the variant of a head part */
  fk: '',
  stoneA: 0,
  flashA: 0,
  grey: false,
};
export type Rig = typeof R;

export const CACHE = new Map<string, HTMLCanvasElement>();
/** device pixels per logical pixel the pictures are made for */
export const SS = 3;
export const STEP = Math.log(1.25);
export const bucketOf = (r: number) => Math.ceil(Math.log(Math.max(2, r)) / STEP - 1e-6);

export function picture(p: Part, extra: string, mode: Mode): HTMLCanvasElement {
  const key = R.pre + p.id + extra + mode + R.rb;
  let c = CACHE.get(key);
  if (!c) {
    if (CACHE.size > 1500) CACHE.clear();
    const s = Math.pow(1.25, R.rb) * SS;
    const [x, y, w, h] = p.box;
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * s));
    c.height = Math.max(1, Math.ceil(h * s));
    const g = c.getContext('2d')!;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.scale(c.width / w, c.height / h);
    g.translate(-x, -y);
    MODE = mode;
    B.team = R.look.team;
    B.lw = R.lw;
    B.boss = !!R.look.boss;
    B.face = mode === 's' ? 'stone' : R.face;
    B.mouth = mode === 's' ? 'flat' : R.mouth;
    B.sph = R.sph;
    p.draw(g);
    MODE = 'n';
    CACHE.set(key, c);
  }
  return c;
}

/** Places a part with its pivot at (x, y), turned rot, scaled (sx, sy); flash and stone are laid over it. */
export function put(p: Part, extra: string, x: number, y: number, rot = 0, sx = 1, sy = 1) {
  const ctx = R.ctx;
  const [bx, by, bw, bh] = p.box;
  sx = Math.abs(sx) < 0.01 ? 0.01 : sx;
  sy = Math.abs(sy) < 0.01 ? 0.01 : sy;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  const sc = sx !== 1 || sy !== 1;
  if (sc) ctx.scale(sx, sy);
  if (R.stoneA < 1) ctx.drawImage(picture(p, extra, 'n'), bx, by, bw, bh);
  if (R.stoneA > 0 || R.flashA > 0) {
    const a = ctx.globalAlpha;
    if (R.stoneA > 0) {
      ctx.globalAlpha = a * Math.min(1, R.stoneA);
      ctx.drawImage(picture(p, extra, 's'), bx, by, bw, bh);
    }
    if (R.flashA > 0) {
      ctx.globalAlpha = a * R.flashA;
      ctx.drawImage(picture(p, extra, 'w'), bx, by, bw, bh);
    }
    ctx.globalAlpha = a;
  }
  if (sc) ctx.scale(1 / sx, 1 / sy);
  if (rot) ctx.rotate(-rot);
  ctx.translate(-x, -y);
}

// ------------------------------------------------------------------ held and worn pieces

export interface Spr {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  q: number;
}
export const SPR = new Map<string, Spr>();
export const SPR_SCALE = 2.5;
export const isWeapon = (k: string): k is WeaponType => k === 'knife' || k === 'bat' || k === 'spear' || k === 'shield';

export function sprite(kind: WeaponType | GearType, level: number, px: number, grey: boolean): Spr {
  const q = Math.max(4, Math.round(px * 2) / 2);
  const key = kind + level + (grey ? 'g' : '_') + q;
  let s = SPR.get(key);
  if (!s) {
    if (SPR.size > 300) SPR.clear();
    const long = isWeapon(kind) && kind !== 'shield';
    const x = long ? -0.5 * q : -0.66 * q;
    const y = long ? -1.14 * q : -0.66 * q;
    const w = long ? q : 1.32 * q;
    const h = long ? 1.26 * q : 1.32 * q;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SPR_SCALE);
    c.height = Math.ceil(h * SPR_SCALE);
    const g = c.getContext('2d')!;
    g.scale(SPR_SCALE, SPR_SCALE);
    g.translate(-x, -y);
    if (isWeapon(kind)) drawWeapon(g, kind, level, q, 0.4);
    else drawGear(g, kind, level, q, 0.4);
    if (grey) {
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.82;
      g.fillStyle = STONE;
      g.fillRect(x, y, w, h);
    }
    s = { c, x, y, w, h, q };
    SPR.set(key, s);
  }
  return s;
}

/** A weapon or a piece of gear at the origin, `units` long. Small ones come from a cached picture. */
export function item(kind: WeaponType | GearType, level: number, units: number) {
  const ctx = R.ctx;
  const r = R.r;
  const px = units * r;
  if (px > 64 && !R.grey) {
    ctx.save();
    ctx.scale(1 / r, 1 / r);
    if (isWeapon(kind)) drawWeapon(ctx, kind, level, px, R.t);
    else drawGear(ctx, kind, level, px, R.t);
    ctx.restore();
    return;
  }
  const s = sprite(kind, level, px, R.grey);
  const f = px / s.q / r;
  ctx.drawImage(s.c, s.x * f, s.y * f, s.w * f, s.h * f);
}

/** weapon lengths in units for a character of weapon scale 1 */
export const WLEN: Record<WeaponType, number> = { knife: 1.25, bat: 1.8, spear: 2.6, shield: 1.3 };
/** how far up the weapon the hand grips it */
export const GRIP: Record<WeaponType, number> = { knife: 0.12, bat: 0.1, spear: 0.3, shield: 0 };

/** Where the near hand is (x, y), the weapon's angle (a: 0 = upright, a quarter turn = levelled forward) and size. */
export const H = { x: 0, y: 0, a: 0, s: 1 };
/** the second hand on a two-handed weapon */
export const H2 = { x: 0, y: 0, on: false };

export function hold(w: WeaponType, bx: number, by: number, wind: number, sk: number, aim: number, cheer: number, t: number) {
  // the swing passes the hit and comes back: 1 at the hit, a little more just after
  const ft = sk < 0.7 ? 1.22 * smooth(sk / 0.7) : lerp(1.22, 1, (sk - 0.7) / 0.3);
  const m = Math.max(wind, sk);
  H.s = 1;
  if (w === 'knife') {
    H.a = lerp(0.45, 1.5 + aim * 0.5, m);
    H.x = bx - 0.34 * wind + 0.85 * sk;
    H.y = by - 0.14 * m + aim * 0.3 * sk;
  } else if (w === 'bat') {
    H.a = 0.3 - 2.5 * wind + (1.5 + aim * 0.4) * ft;
    H.x = bx - 0.55 * wind + 0.28 * ft;
    H.y = by - 0.55 * wind + 0.14 * ft;
  } else if (w === 'spear') {
    H.a = lerp(0.5, 1.57 + aim * 0.45, Math.min(1, m * 1.6));
    H.x = bx - 0.15 - 0.5 * wind + 0.95 * sk;
    H.y = by - 0.12 * m + aim * 0.3 * sk;
  } else {
    H.a = -0.14 * wind + 0.2 * sk + aim * 0.2 * sk;
    H.x = bx + 0.1 - 0.24 * wind + 0.65 * sk;
    H.y = by - 0.12 + aim * 0.3 * sk;
    H.s = 1 + 0.14 * sk;
  }
  if (cheer) {
    H.y -= 0.6;
    H.a = -0.25 + Math.sin(t * 9) * 0.25;
  }
}

/**
 * Puts the near hand for this frame. With a weapon: where the swing puts it (and H.a, the weapon's angle; H2 is
 * the second hand of a bat or spear). Without: a jab from (x, y) that reaches `reach` forward along the aim.
 */
export function aimHand(x: number, y: number, reach: number) {
  H2.on = false;
  const w = R.weapon;
  if (w) {
    hold(w, x, y, R.wind, R.strike, R.aim, R.cheer, R.t);
    if (w === 'bat' || w === 'spear') {
      const d = w === 'bat' ? -0.2 : 0.5;
      H2.x = H.x - Math.sin(H.a) * d;
      H2.y = H.y + Math.cos(H.a) * d;
      H2.on = true;
    }
    return;
  }
  const sk = R.strike;
  const ft = sk < 0.7 ? 1.15 * smooth(sk / 0.7) : lerp(1.15, 1, (sk - 0.7) / 0.3);
  H.a = 0;
  H.s = 1;
  H.x = x - 0.28 * R.wind + reach * ft;
  H.y = y - 0.1 * R.wind + R.aim * 0.4 * ft;
  if (R.cheer) {
    H.x = x - 0.05;
    H.y = y - 0.75 + Math.sin(R.t * 9) * 0.08;
  }
}

/** both hands on the weapon (bat, spear): the far hand is not drawn on its own */
export const twoH = () => R.weapon === 'bat' || R.weapon === 'spear';

/** The weapon at H and the hand(s) on it (the hand under a shield, over a grip). hand turns with `rot`. */
export function armsAndWeapon(hand: Part, rot = 0) {
  const w = R.weapon;
  const look = R.look;
  const ctx = R.ctx;
  if (w === 'shield') put(hand, '', H.x, H.y, rot);
  if (w) {
    const len = WLEN[w] * D.wl;
    ctx.save();
    ctx.translate(H.x, H.y);
    ctx.rotate(H.a);
    if (H.s !== 1) ctx.scale(H.s, H.s);
    ctx.translate(0, GRIP[w] * len);
    item(w, look.weaponLevel || 1, len);
    ctx.restore();
  }
  if (w !== 'shield') put(hand, '', H.x, H.y, rot);
  if (H2.on) put(hand, '', H2.x, H2.y, rot);
}

export function helmetAt(x: number, y: number, size: number, rot = 0) {
  if (!R.look.helmet) return;
  const ctx = R.ctx;
  ctx.translate(x, y);
  ctx.rotate(rot);
  item('helmet', R.look.helmet, size);
  ctx.rotate(-rot);
  ctx.translate(-x, -y);
}
export function shoeAt(x: number, y: number, size: number) {
  const ctx = R.ctx;
  ctx.translate(x, y - size * 0.42);
  item('sneakers', R.look.sneakers, size);
  ctx.translate(-x, -(y - size * 0.42));
}
export function chiliAt(x: number, y: number, s: number) {
  const c = R.look.chili;
  if (!c || R.grey) return;
  heat(R.ctx, x, y, s, R.t, 0.075, c >= 7 ? 3 : c >= 5 ? 2 : 1);
}

export const CROWN = part('crown', [-0.55, -0.75, 1.1, 0.95], (g) => {
  const p = PATH((p) => {
    p.moveTo(-0.34, 0.02);
    p.lineTo(-0.38, -0.36);
    p.lineTo(-0.18, -0.2);
    p.lineTo(0, -0.46);
    p.lineTo(0.18, -0.2);
    p.lineTo(0.38, -0.36);
    p.lineTo(0.34, 0.02);
    p.closePath();
  });
  chunk(g, [[p, '#e5b956', 0.08]]);
  for (const [x, y, c] of [[-0.2, -0.08, '#d9676b'], [0.02, -0.1, '#6f9fd6'], [0.22, -0.08, '#d9676b']] as const) {
    g.beginPath();
    g.arc(x, y, 0.055, 0, TAU);
    g.fillStyle = C(c);
    g.fill();
  }
});
export function crownAt(x: number, y: number, rot = -0.12) {
  if (R.look.boss) put(CROWN, '', x, y, rot);
}

/** a round hand of a colour */
export function handPart(id: string, col: string, rad = 0.13): Part {
  return part(id, [-0.35, -0.35, 0.7, 0.7], (g) => chunk(g, [[E(0, 0, rad, rad * 0.95), col, rad * 0.35]]));
}
/** a boxing glove in the team colour, with a little forearm of `arm` colour behind it (or none) */
export function glovePart(id: string, arm: string | null, size = 1): Part {
  return part(id, [-0.6 * size, -0.45 * size, 1.05 * size, 0.9 * size], (g) => {
    const s = size;
    const shapes: Sh[] = [];
    if (arm) shapes.push([E(-0.3 * s, 0.02 * s, 0.17 * s, 0.1 * s), arm, 0.03]);
    shapes.push([RR(-0.3 * s, -0.13 * s, 0.16 * s, 0.26 * s, 0.05 * s), '#f2ede3', 0.03]);
    shapes.push([E(0.04 * s, 0.0, 0.25 * s, 0.22 * s), accent(), 0.08 * s]);
    shapes.push([E(0.0, -0.16 * s, 0.11 * s, 0.08 * s, -0.3), accent(), 0]);
    chunk(g, shapes);
    inner(g, PATH((p) => p.ellipse(0.05 * s, 0.0, 0.17 * s, 0.13 * s, 0, Math.PI * 1.05, Math.PI * 1.6)), 0.8);
    g.beginPath();
    g.ellipse(-0.04 * s, -0.08 * s, 0.07 * s, 0.035 * s, -0.5, 0, TAU);
    g.fillStyle = C(mix(accent(), WHITE, 0.55));
    g.fill();
  });
}

// ------------------------------------------------------------------ the characters

export interface CharDef {
  /** top of the head above the feet, units (no helmet, no crown) */
  top: number;
  /** half-width of the ground shadow, units */
  shadow: number;
  /** how high a hop (pose.hop = 1) lifts it, units; above 1 it squashes and stretches like a jumper */
  hop: number;
  /** how far it leans into a walk */
  lean: number;
  /** weapon size */
  wl: number;
  /** the middle of its body (puff and spin swell around it), units above the feet */
  mid: number;
  /** it hovers this high (the shadow stays on the ground) */
  hover: number;
  /** [main, light, shade] of its body, for the pieces that fly off it */
  colors: readonly [string, string, string];
  draw(R: Rig): void;
}
export let D: CharDef;
/** the character being drawn this frame (pets.ts sets it) */
export function setChar(d: CharDef) {
  D = d;
}

/** A walk step: how far a foot moves forward and how high it lifts, for a foot off by `off` in the cycle. */
export const stepX = (off: number, len: number) => Math.sin(R.ph + off) * len * R.mv;
export const stepY = (off: number, h: number) => -Math.max(0, Math.cos(R.ph + off)) * h * R.mv;

export const ch = (top: number, shadow: number, mid: number, colors: readonly [string, string, string], draw: () => void, o: Partial<CharDef> = {}): CharDef => ({
  top,
  shadow,
  hop: 0.8,
  lean: 0.07,
  wl: 1,
  mid,
  hover: 0,
  colors,
  draw,
  ...o,
});
