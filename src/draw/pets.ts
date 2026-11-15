import type { GearType, PetType, Team, WeaponType } from '../types';
import type { PetArt, PetLook, PetPose } from './petTypes';
import { COLOR, TEAM } from '../theme';
import { clamp, ellipse, lerp, smooth } from '../util';
import { drawWeapon, heat } from './weapons';
import { drawGear } from './gear';

/*
 * THE UNITS: twelve chunky cartoon characters (docs/v4.md), drawn from the side with their feet on the origin,
 * facing right, in "units" (1 = the body radius r the caller passes).
 *
 * THE KIT (everything below the contract types, shared by every character)
 *  - A character is a few PARTS (a body, a head with its face, feet, hands, a tail, wings, leaves ...). A part is
 *    a picture drawn ONCE per (character, team, part, variant, size step) into a small cached canvas, then placed
 *    every frame with a transform: put(R, PART, variantKey, x, y, rot, sx, sy). Per frame a unit costs a handful
 *    of drawImage calls and no paths (paths only for chili heat, puff gloss, stone cracks and limp wrinkles).
 *  - part(id, [x, y, w, h], draw) makes a part: its box is in units around its pivot (the origin of `draw`), with
 *    room for the outline (about 0.2). id must be unique across all characters.
 *  - Inside a part's draw(g): chunk(g, [[path, '#hex', shade], ...]) paints shapes as ONE chunky silhouette: the
 *    thick dark outline of every shape first, then every fill on top, each with its one soft shade (shade = how
 *    far the lit copy is pushed up-left, 0 = flat). Paths: E() ellipse, RR() rounded rect, PATH(p => ...) free.
 *    Details: inner(g, path, k) for a thin inner ink line, clipIn(g, path, () => ...) to paint inside a shape,
 *    eyes(g, x1, x2, y, s, skin), mouth(g, x, y, s), blush(g, x, y, s). Faces follow B.face / B.mouth (picked from
 *    the pose by pickFace / pickMouth), so a head part takes R.fk as its variant key.
 *  - Colours: pass plain '#rrggbb' to chunk (it runs them through C()); call C('#hex') yourself for details.
 *    C() turns a colour white for the hit flash and grey for stone, so every part gets those for free.
 *    accent() is the team colour (blue / red) of the part being built: use it on a scarf, cap, headband, gloves.
 *  - Per frame helpers: aimHand(R, x, y, reach) puts the near hand for the weapon swing or the bare-handed jab
 *    (result in H), armsAndWeapon(R, HAND) draws the weapon and the hand(s) on it, helmetAt, shoesAt, crownAt,
 *    chiliAt for the gear and the boss crown.
 *  - TO ADD A CHARACTER: write its parts (see sprout), a draw(R) that puts them back to front for the pose in R,
 *    and its row in CHARS (top of head, shadow, hop height, lean, weapon size, body middle, colours).
 */
type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colours

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
function mix(a: string, b: string, k: number) {
  const x = rgb(a);
  const y = rgb(b);
  return `#${hex2(lerp(x[0], y[0], k))}${hex2(lerp(x[1], y[1], k))}${hex2(lerp(x[2], y[2], k))}`;
}
function grey(h: string) {
  const [r, g, b] = rgb(h);
  const y = hex2(Math.min(255, (r * 0.299 + g * 0.587 + b * 0.114) * 1.08));
  return `#${y}${y}${y}`;
}

/** How a picture is painted: n = itself, w = the white hit flash (the outline stays), s = grey stone. */
type Mode = 'n' | 'w' | 's';
let MODE: Mode = 'n';
const WHITE = '#ffffff';
const STONE = '#a4aab2';
const STONE_INK = '#3a3f47';
const MOUTH = '#5b2a31';
const TONGUE = '#e48c8a';
const CHEEK = '#ef9d92';
const MEMO = new Map<string, string>();
/** A colour as the picture being built paints it (flash and stone come from here). */
function C(hex: string): string {
  if (MODE === 'n') return hex;
  const k = MODE + hex;
  let v = MEMO.get(k);
  if (!v) {
    v = MODE === 'w' ? mix(hex, WHITE, 0.8) : mix(grey(hex), STONE, 0.5);
    MEMO.set(k, v);
  }
  return v;
}
const inkC = () => (MODE === 's' ? STONE_INK : COLOR.ink);
/** the one shade of a fill: a little darker and cooler */
const shadeOf = (c: string) => mix(c, '#2e2742', 0.2);

/** Team accents, a touch softer than the interface's team colours: 0 = yours (blue), 1 = theirs (red). */
const ACCENT = TEAM.map((t) => mix(t.main, '#7f8792', 0.14));

// ------------------------------------------------------------------ what the picture being built is for

type Face = 'open' | 'blink' | 'angry' | 'pinch' | 'happy' | 'spiral' | 'wide' | 'x' | 'droop' | 'stone';
type Mouth = 'smile' | 'flat' | 'open' | 'grin' | 'o' | 'tongue' | 'wavy' | 'grit';
const B = { team: 0 as Team, lw: 0.1, face: 'open' as Face, mouth: 'smile' as Mouth, boss: false, sph: 0 };
/** the team colour of the part being built (raw hex, for chunk) */
const accent = () => ACCENT[B.team];

// ------------------------------------------------------------------ paths and chunky painting

function E(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, TAU);
  return p;
}
function RR(x: number, y: number, w: number, h: number, r: number): Path2D {
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
function PATH(f: (p: Path2D) => void): Path2D {
  const p = new Path2D();
  f(p);
  return p;
}

type Sh = readonly [Path2D, string, number?];
/** One fill with its one shade: the lit copy pushed d up-left, so the shade is a crescent low on the right. */
function paint(g: Ctx, p: Path2D, fill: string, d: number) {
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
function chunk(g: Ctx, shapes: readonly Sh[]) {
  g.lineWidth = B.lw * 2;
  g.strokeStyle = inkC();
  for (const s of shapes) g.stroke(s[0]);
  for (const s of shapes) paint(g, s[0], s[1], s[2] ?? 0);
}
/** A thin inner ink line along a path (k = width in outlines). */
function inner(g: Ctx, p: Path2D, k = 0.9) {
  g.lineWidth = B.lw * k;
  g.strokeStyle = inkC();
  g.stroke(p);
}
function clipIn(g: Ctx, p: Path2D, draw: () => void) {
  g.save();
  g.clip(p);
  draw();
  g.restore();
}
/** A fat line with an ink edge (antennae, stems, ribbon tails). */
function rope(g: Ctx, p: Path2D, w: number, col: string) {
  g.lineWidth = w + B.lw * 2;
  g.strokeStyle = inkC();
  g.stroke(p);
  g.lineWidth = w;
  g.strokeStyle = C(col);
  g.stroke(p);
}

// ------------------------------------------------------------------ faces

/** Two eyes for B.face: the near one at x1, the far one (a little smaller) at x2; s = half the eye's height. */
function eyes(g: Ctx, x1: number, x2: number, y: number, s: number, skin: string) {
  eye(g, x1, y, s, skin, 0);
  eye(g, x2, y - s * 0.06, s * 0.9, skin, 1);
}
function eye(g: Ctx, x: number, y: number, s: number, skin: string, i: number) {
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

function mouth(g: Ctx, x: number, y: number, s: number) {
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

function blush(g: Ctx, x: number, y: number, s: number) {
  if (MODE === 's') return;
  g.globalAlpha = 0.55;
  g.fillStyle = C(CHEEK);
  g.beginPath();
  g.ellipse(x, y, s * 1.25, s * 0.7, 0, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

function pickFace(look: PetLook, pose: PetPose): Face {
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
function pickMouth(look: PetLook, pose: PetPose, f: Face): Mouth {
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

interface Part {
  id: string;
  /** x, y, w, h in units around the pivot */
  box: readonly [number, number, number, number];
  draw: (g: Ctx) => void;
}
const part = (id: string, box: readonly [number, number, number, number], draw: (g: Ctx) => void): Part => ({ id, box, draw });

/** Everything about the fighter being drawn this frame (one object, reused: no garbage per frame). */
const R = {
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
type Rig = typeof R;

const CACHE = new Map<string, HTMLCanvasElement>();
/** device pixels per logical pixel the pictures are made for */
const SS = 3;
const STEP = Math.log(1.25);
const bucketOf = (r: number) => Math.ceil(Math.log(Math.max(2, r)) / STEP - 1e-6);

function picture(p: Part, extra: string, mode: Mode): HTMLCanvasElement {
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
function put(p: Part, extra: string, x: number, y: number, rot = 0, sx = 1, sy = 1) {
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

interface Spr {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  q: number;
}
const SPR = new Map<string, Spr>();
const SPR_SCALE = 2.5;
const isWeapon = (k: string): k is WeaponType => k === 'knife' || k === 'bat' || k === 'spear' || k === 'shield';

function sprite(kind: WeaponType | GearType, level: number, px: number, grey: boolean): Spr {
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
function item(kind: WeaponType | GearType, level: number, units: number) {
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
const WLEN: Record<WeaponType, number> = { knife: 1.25, bat: 1.8, spear: 2.6, shield: 1.3 };
/** how far up the weapon the hand grips it */
const GRIP: Record<WeaponType, number> = { knife: 0.12, bat: 0.1, spear: 0.3, shield: 0 };

/** Where the near hand is (x, y), the weapon's angle (a: 0 = upright, a quarter turn = levelled forward) and size. */
const H = { x: 0, y: 0, a: 0, s: 1 };
/** the second hand on a two-handed weapon */
const H2 = { x: 0, y: 0, on: false };

function hold(w: WeaponType, bx: number, by: number, wind: number, sk: number, aim: number, cheer: number, t: number) {
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
function aimHand(x: number, y: number, reach: number) {
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
const twoH = () => R.weapon === 'bat' || R.weapon === 'spear';

/** The weapon at H and the hand(s) on it (the hand under a shield, over a grip). hand turns with `rot`. */
function armsAndWeapon(hand: Part, rot = 0) {
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

function helmetAt(x: number, y: number, size: number, rot = 0) {
  if (!R.look.helmet) return;
  const ctx = R.ctx;
  ctx.translate(x, y);
  ctx.rotate(rot);
  item('helmet', R.look.helmet, size);
  ctx.rotate(-rot);
  ctx.translate(-x, -y);
}
function shoeAt(x: number, y: number, size: number) {
  const ctx = R.ctx;
  ctx.translate(x, y - size * 0.42);
  item('sneakers', R.look.sneakers, size);
  ctx.translate(-x, -(y - size * 0.42));
}
function chiliAt(x: number, y: number, s: number) {
  const c = R.look.chili;
  if (!c || R.grey) return;
  heat(R.ctx, x, y, s, R.t, 0.075, c >= 7 ? 3 : c >= 5 ? 2 : 1);
}

const CROWN = part('crown', [-0.55, -0.75, 1.1, 0.95], (g) => {
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
function crownAt(x: number, y: number, rot = -0.12) {
  if (R.look.boss) put(CROWN, '', x, y, rot);
}

/** a round hand of a colour */
function handPart(id: string, col: string, rad = 0.13): Part {
  return part(id, [-0.35, -0.35, 0.7, 0.7], (g) => chunk(g, [[E(0, 0, rad, rad * 0.95), col, rad * 0.35]]));
}
/** a boxing glove in the team colour, with a little forearm of `arm` colour behind it (or none) */
function glovePart(id: string, arm: string | null, size = 1): Part {
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

interface CharDef {
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
let D: CharDef;

/** A walk step: how far a foot moves forward and how high it lifts, for a foot off by `off` in the cycle. */
const stepX = (off: number, len: number) => Math.sin(R.ph + off) * len * R.mv;
const stepY = (off: number, h: number) => -Math.max(0, Math.cos(R.ph + off)) * h * R.mv;

// ---------------------------------------------------------------- 1 sprout: a tiny seedling kid

const SP = { head: '#f1dfb6', body: '#8fbd70', foot: '#66955a', leaf: '#82bf6a', vein: '#5f9a52', stem: '#6aa45a' };
const SP_FOOT = part('spF', [-0.38, -0.38, 0.8, 0.5], (g) => chunk(g, [[E(0.03, -0.11, 0.2, 0.12), SP.foot, 0.05]]));
const SP_HAND = handPart('spH', SP.body, 0.12);
const SP_BODY = part('spB', [-0.7, -1.18, 1.4, 1.1], (g) => {
  chunk(g, [[E(0, -0.48, 0.4, 0.4), SP.body, 0.1], [E(0.03, -0.86, 0.47, 0.19), accent(), 0.06]]);
});
/** the end of the scarf, hanging from its knot at the back */
const SP_TAIL = part('spT', [-0.3, -0.25, 0.6, 0.85], (g) => {
  chunk(g, [[RR(-0.13, -0.06, 0.26, 0.5, 0.12), accent(), 0.05]]);
  inner(g, PATH((p) => { p.moveTo(-0.13, 0.3); p.lineTo(0.13, 0.3); }), 0.7);
});
const SP_HEAD = part('spHd', [-0.95, -1.55, 2.0, 1.75], (g) => {
  chunk(g, [[E(0.05, -0.66, 0.8, 0.72), SP.head, 0.14]]);
  blush(g, 0.1, -0.44, 0.1);
  blush(g, 0.74, -0.44, 0.07);
  eyes(g, 0.27, 0.62, -0.66, 0.14, SP.head);
  mouth(g, 0.46, -0.38, 0.11);
});
const SP_LEAVES = part('spL', [-0.7, -0.75, 1.45, 1.0], (g) => {
  const l = E(-0.24, -0.34, 0.27, 0.12, -0.55);
  const rgt = E(0.28, -0.4, 0.31, 0.14, 0.6);
  const stem = PATH((p) => {
    p.moveTo(0, 0.1);
    p.quadraticCurveTo(-0.02, -0.12, 0.02, -0.24);
  });
  rope(g, stem, 0.09, SP.stem);
  chunk(g, [[l, SP.leaf, 0.05], [rgt, SP.leaf, 0.05]]);
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = C(SP.vein);
  g.beginPath();
  g.moveTo(-0.04, -0.24);
  g.lineTo(-0.4, -0.45);
  g.moveTo(0.06, -0.26);
  g.lineTo(0.5, -0.54);
  g.stroke();
});

function drawSprout() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.07 * R.mv;
  const sway = Math.sin(R.ph) * 0.05 * R.mv;
  // far side: hand, foot
  const fx = -0.15 + stepX(Math.PI, 0.2);
  const nx = 0.15 + stepX(0, 0.2);
  put(SP_FOOT, '', fx, stepY(Math.PI, 0.13));
  if (R.look.sneakers) shoeAt(fx + 0.04, stepY(Math.PI, 0.13), 0.5);
  if (!twoH()) put(SP_HAND, '', -0.34, -0.5 + bob);
  put(SP_TAIL, '', -0.3, -0.84 + bob, 0.25 + 0.75 * R.mv + Math.sin(t * 3 + R.seed) * 0.08);
  put(SP_BODY, '', 0, bob, sway);
  put(SP_FOOT, '', nx, stepY(0, 0.13));
  if (R.look.sneakers) shoeAt(nx + 0.04, stepY(0, 0.13), 0.56);
  // the head lunges into a bite when it has no weapon
  const lunge = R.weapon ? 0 : 0.18 * R.strike - 0.1 * R.wind;
  const hx = lunge;
  const hy = -0.86 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02 + 0.06 * R.strike;
  const tilt = sway * 0.6 + (R.weapon ? 0 : 0.12 * R.strike - 0.08 * R.wind);
  put(SP_LEAVES, '', hx + 0.06 + tilt * 1.3, hy - 1.34, Math.sin(t * 2.1 + R.seed) * 0.1 - R.mv * 0.25 + tilt - R.hurt * 0.3);
  put(SP_HEAD, R.fk, hx, hy, tilt);
  helmetAt(hx + 0.05, hy - 1.02, 1.85, -0.08);
  crownAt(hx + 0.06, hy - 1.3);
  chiliAt(hx + 0.2, hy - 1.45, 0.9);
  aimHand(0.36, -0.52 + bob, 0.55);
  armsAndWeapon(SP_HAND);
}

// ---------------------------------------------------------------- 2 buzzy: a round bee in a pilot cap and goggles

const BZ = { body: '#f0c766', stripe: '#5d4a3b', wing: '#e6f1f5', lens: '#bfe0e8', brass: '#c9a35f', hand: '#5d4a3b' };
const BZ_WING = part('bzW', [-0.95, -0.95, 1.15, 1.15], (g) => {
  // a wing standing up and back from its root at the pivot
  const w = E(-0.3, -0.36, 0.42, 0.22, 0.9);
  chunk(g, [[w, BZ.wing, 0.05]]);
  inner(g, PATH((p) => { p.moveTo(-0.06, -0.06); p.quadraticCurveTo(-0.22, -0.34, -0.5, -0.56); }), 0.6);
});
const BZ_HAND = handPart('bzH', BZ.body, 0.11);
const BZ_LEGS = part('bzLg', [-0.4, -0.3, 0.85, 0.55], (g) => {
  chunk(g, [[E(-0.12, 0, 0.08, 0.13, 0.2), BZ.stripe, 0], [E(0.18, 0.02, 0.08, 0.13, 0.1), BZ.stripe, 0]]);
});
const BZ_TAIL = part('bzT', [-0.95, -0.35, 1.1, 0.7], (g) => {
  // the end of the scarf, streaming back from under the cap
  const p = PATH((p) => {
    p.moveTo(0.05, -0.1);
    p.quadraticCurveTo(-0.35, -0.2, -0.75, 0.0);
    p.lineTo(-0.7, 0.16);
    p.quadraticCurveTo(-0.35, 0.02, 0.05, 0.1);
    p.closePath();
  });
  chunk(g, [[p, accent(), 0.04]]);
});
const BZ_BODY = part('bzB', [-1.25, -2.4, 2.4, 2.25], (g) => {
  const cy = -1.05;
  const body = E(0, cy, 0.84, 0.78);
  const sting = PATH((p) => {
    p.moveTo(-0.78, cy - 0.12);
    p.lineTo(-1.08, cy + 0.04);
    p.lineTo(-0.76, cy + 0.14);
    p.closePath();
  });
  // antennae poke out of the cap
  for (const [x0, x1, y1] of [[-0.05, 0.08, -2.12], [0.22, 0.42, -2.04]] as const) {
    rope(g, PATH((p) => { p.moveTo(x0, -1.7); p.quadraticCurveTo(x0 + 0.02, y1 + 0.12, x1, y1); }), 0.05, BZ.stripe);
    chunk(g, [[E(x1, y1, 0.075, 0.075), BZ.stripe, 0]]);
  }
  chunk(g, [[sting, BZ.stripe, 0], [body, BZ.body, 0.14]]);
  clipIn(g, body, () => {
    // stripes round the back half, then the cap over the top
    g.fillStyle = C(BZ.stripe);
    g.beginPath();
    g.ellipse(-0.3, cy + 0.05, 0.12, 0.9, 0.08, 0, TAU);
    g.ellipse(-0.66, cy + 0.05, 0.1, 0.9, 0.12, 0, TAU);
    g.fill();
    const cap = E(-0.08, cy - 0.6, 0.84, 0.5, -0.12);
    paint(g, cap, accent(), 0.06);
    inner(g, cap, 1.1);
    // the ear flap at the back
    const flap = RR(-0.7, cy - 0.32, 0.26, 0.42, 0.12);
    paint(g, flap, accent(), 0);
    inner(g, flap, 0.9);
  });
  inner(g, body, 0);
  // goggles on the brim
  for (const [x, y, s] of [[0.1, cy - 0.52, 0.15], [0.42, cy - 0.47, 0.13]] as const) {
    const ring = E(x, y, s, s);
    chunk(g, [[ring, BZ.brass, 0]]);
    const lens = E(x, y, s * 0.62, s * 0.62);
    paint(g, lens, BZ.lens, 0);
    g.beginPath();
    g.arc(x - s * 0.22, y - s * 0.22, s * 0.18, 0, TAU);
    g.fillStyle = C(WHITE);
    g.fill();
  }
  blush(g, 0.18, cy + 0.24, 0.09);
  eyes(g, 0.32, 0.62, cy - 0.04, 0.13, BZ.body);
  mouth(g, 0.5, cy + 0.26, 0.1);
});

function drawBuzzy() {
  const t = R.t;
  const ctx = R.ctx;
  const hv = D.hover + Math.sin(t * 4.2 + R.seed) * 0.06;
  // a dive: nose up on the wind-up, nose down into the sting
  const dive = R.weapon ? 0 : -0.3 * R.wind + 0.45 * R.strike;
  const cy = -1.05;
  ctx.translate(0, -hv);
  if (dive) {
    ctx.translate(0, cy);
    ctx.rotate(dive);
    ctx.translate(0, -cy);
  }
  const flap = Math.sin(t * 31 + R.seed) * 0.3;
  put(BZ_WING, '', -0.38, cy - 0.5, 0.1 + flap, 1, 1 - 0.3 * Math.abs(flap));
  put(BZ_WING, '', -0.22, cy - 0.58, -0.25 + flap, 1, 1 - 0.3 * Math.abs(flap));
  put(BZ_TAIL, '', -0.6, cy + 0.0, Math.sin(t * 6 + R.seed) * 0.12 + 0.15 - 0.25 * R.mv);
  if (!twoH()) put(BZ_HAND, '', -0.62, cy + 0.3);
  put(BZ_LEGS, '', 0, -0.28 + 0.02 * Math.sin(t * 4.2), R.mv * 0.35);
  if (R.look.sneakers) {
    shoeAt(-0.1, -0.06, 0.38);
    shoeAt(0.2, -0.05, 0.42);
  }
  put(BZ_BODY, R.fk, 0, 0);
  helmetAt(0.0, cy - 0.98, 1.95, -0.1);
  crownAt(0.05, cy - 1.3);
  chiliAt(0.15, cy - 1.45, 0.9);
  aimHand(0.64, cy + 0.36, 0.5);
  armsAndWeapon(BZ_HAND);
  if (dive) {
    ctx.translate(0, cy);
    ctx.rotate(-dive);
    ctx.translate(0, -cy);
  }
  ctx.translate(0, hv);
}

// ---------------------------------------------------------------- 3 ninja: a small hooded ninja kid

const NJ = { suit: '#545a78', dark: '#41455f', skin: '#f0cca4' };
const NJ_FOOT = part('njF', [-0.38, -0.36, 0.8, 0.48], (g) => chunk(g, [[E(0.04, -0.1, 0.19, 0.11), NJ.dark, 0.04]]));
const NJ_HAND = handPart('njH', NJ.suit, 0.12);
const NJ_BODY = part('njB', [-0.68, -1.08, 1.36, 1.0], (g) => {
  const body = E(0, -0.5, 0.38, 0.38);
  chunk(g, [[E(-0.38, -0.46, 0.09, 0.07), accent(), 0], [body, NJ.suit, 0.1]]);
  clipIn(g, body, () => {
    const sash = RR(-0.5, -0.56, 1.0, 0.15, 0.02);
    paint(g, sash, accent(), 0);
    inner(g, sash, 0.8);
  });
});
const NJ_TAILS = part('njT', [-0.9, -0.3, 1.0, 0.65], (g) => {
  // the two ends of the headband
  rope(g, PATH((p) => { p.moveTo(0, -0.02); p.quadraticCurveTo(-0.3, -0.12, -0.62, -0.02); }), 0.11, accent());
  rope(g, PATH((p) => { p.moveTo(0, 0.04); p.quadraticCurveTo(-0.26, 0.08, -0.5, 0.2); }), 0.1, accent());
});
const NJ_HEAD = part('njHd', [-1.0, -1.55, 2.05, 1.75], (g) => {
  const hood = E(0.03, -0.62, 0.78, 0.72);
  chunk(g, [[E(-0.74, -0.86, 0.13, 0.1), accent(), 0], [hood, NJ.suit, 0.14]]);
  clipIn(g, hood, () => {
    const slit = RR(-0.02, -0.82, 1.0, 0.36, 0.17);
    paint(g, slit, NJ.skin, 0);
    inner(g, slit, 0.9);
    const band = RR(-0.9, -1.08, 1.9, 0.17, 0.02);
    paint(g, band, accent(), 0);
    inner(g, band, 0.9);
  });
  inner(g, hood, 0);
  eyes(g, 0.34, 0.64, -0.64, 0.12, NJ.skin);
});

function drawNinja() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.08 * R.mv;
  const fx = -0.14 + stepX(Math.PI, 0.26);
  const nx = 0.14 + stepX(0, 0.26);
  put(NJ_FOOT, '', fx, stepY(Math.PI, 0.18));
  if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.18), 0.5);
  if (!twoH()) put(NJ_HAND, '', -0.36 - 0.1 * R.mv, -0.52 + bob);
  put(NJ_BODY, '', 0, bob);
  put(NJ_FOOT, '', nx, stepY(0, 0.18));
  if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.18), 0.55);
  const hy = -0.86 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02;
  const tilt = R.weapon ? 0 : 0.08 * R.strike - 0.06 * R.wind;
  put(NJ_TAILS, '', -0.72, hy - 0.88, lerp(-1.0, -0.15, R.mv) + Math.sin(t * 5 + R.seed) * 0.12 - 0.3 * R.hurt);
  put(NJ_HEAD, R.fk, 0, hy, tilt);
  helmetAt(0.05, hy - 1.0, 1.85, -0.08);
  crownAt(0.06, hy - 1.3);
  chiliAt(0.2, hy - 1.45, 0.9);
  // a chop: the hand goes up and back, then down and forward
  if (!R.weapon && !R.cheer && (R.wind > 0 || R.strike > 0)) {
    const sk = R.strike;
    H2.on = false;
    H.a = 0;
    H.s = 1;
    H.x = lerp(0.38, 0.05, R.wind) + 0.6 * sk;
    H.y = lerp(-0.55 + bob, -1.1, R.wind) + (0.05 + R.aim * 0.3) * sk;
  } else aimHand(0.38, -0.55 + bob, 0.5);
  armsAndWeapon(NJ_HAND);
}

// ---------------------------------------------------------------- 4 snailor: a snail in a sailor hat, its shell a sea-chest

const SN = { body: '#c5b2d6', wood: '#bd8f63', lid: '#a87a52', band: '#6f5240', brass: '#d6b25f', hat: '#f2efe7' };
const SN_HAND = handPart('snH', SN.body, 0.11);
const SN_BODY = part('snB', [-1.25, -1.35, 2.45, 1.55], (g) => {
  const foot = RR(-1.04, -0.32, 1.98, 0.32, 0.16);
  const neck = E(0.58, -0.62, 0.3, 0.5, 0.16);
  chunk(g, [[foot, SN.body, 0.06], [neck, SN.body, 0.08]]);
  // the neckerchief, knotted in front
  const kerchief = PATH((p) => {
    p.moveTo(0.3, -0.92);
    p.quadraticCurveTo(0.62, -0.78, 0.92, -0.92);
    p.lineTo(0.7, -0.52);
    p.closePath();
  });
  chunk(g, [[kerchief, accent(), 0.05]]);
});
const SN_SHELL = part('snS', [-1.2, -1.75, 1.85, 1.75], (g) => {
  // a sea-chest: a box with a domed lid, two iron straps, a brass lock on the seam
  const box = RR(-0.92, -0.95, 1.3, 0.72, 0.1);
  const lid = PATH((p) => {
    p.moveTo(-0.96, -0.9);
    p.lineTo(-0.96, -1.08);
    p.bezierCurveTo(-0.96, -1.58, 0.42, -1.58, 0.42, -1.08);
    p.lineTo(0.42, -0.9);
    p.closePath();
  });
  chunk(g, [[box, SN.wood, 0.1], [lid, SN.lid, 0.1]]);
  for (const sh of [box, lid]) {
    clipIn(g, sh, () => {
      g.fillStyle = C(SN.band);
      for (const x of [-0.62, 0.06]) g.fillRect(x, -1.7, 0.13, 1.6);
      g.fillStyle = C(mix(SN.wood, '#2e2742', 0.22));
      g.fillRect(-1, -0.62, 1.5, 0.035);
    });
    inner(g, sh, 0);
  }
  chunk(g, [[RR(0.22, -1.04, 0.2, 0.24, 0.05), SN.brass, 0]]);
  g.fillStyle = inkC();
  g.fillRect(0.3, -0.95, 0.04, 0.08);
});
/** the head, with the sailor hat unless a helmet takes its place (variant 'h') */
const SN_HEAD = part('snHd', [-0.75, -1.15, 1.55, 1.35], (g) => {
  const head = E(0.1, -0.32, 0.54, 0.49);
  chunk(g, [[head, SN.body, 0.1]]);
  eyes(g, 0.24, 0.48, -0.32, 0.11, SN.body);
  mouth(g, 0.4, -0.1, 0.09);
});
const SN_HAT = part('snHt', [-0.65, -0.55, 1.2, 0.8], (g) => {
  const dome = E(0, -0.12, 0.34, 0.24);
  const brim = RR(-0.44, -0.06, 0.86, 0.15, 0.075);
  const ribbon = PATH((p) => {
    p.moveTo(-0.32, -0.02);
    p.lineTo(-0.5, 0.18);
    p.lineTo(-0.38, 0.2);
    p.lineTo(-0.24, 0.02);
    p.closePath();
  });
  chunk(g, [[ribbon, accent(), 0], [dome, SN.hat, 0.05], [brim, SN.hat, 0.04]]);
  clipIn(g, dome, () => {
    const band = RR(-0.4, -0.12, 0.8, 0.09, 0);
    paint(g, band, accent(), 0);
  });
});

function drawSnailor() {
  const t = R.t;
  const ripple = Math.sin(R.ph * 2) * R.mv;
  const lunge = R.weapon ? 0 : 0.26 * R.strike - 0.14 * R.wind;
  if (!twoH()) put(SN_HAND, '', 0.3, -0.62);
  put(SN_BODY, '', 0, 0, 0, 1 + 0.04 * ripple, 1 - 0.03 * ripple);
  if (R.look.sneakers) {
    shoeAt(0.55, 0.02, 0.5);
    shoeAt(-0.6, 0.02, 0.5);
  }
  put(SN_SHELL, '', 0.02, -0.04 - 0.03 * Math.abs(ripple), -0.05 + Math.sin(t * 2.6 + R.seed) * 0.015);
  const hx = 0.58 + lunge;
  const hy = -0.98 + Math.sin(t * 2.6 + R.seed + 0.8) * 0.025 + 0.04 * R.strike;
  const tilt = 0.1 * R.strike - 0.08 * R.wind;
  put(SN_HEAD, R.fk, hx, hy, tilt);
  if (!R.look.helmet) put(SN_HAT, '', hx + 0.05, hy - 0.7, -0.18 + tilt);
  helmetAt(hx + 0.08, hy - 0.65, 1.3, -0.1);
  crownAt(hx + 0.1, hy - (R.look.helmet ? 0.95 : 0.98));
  chiliAt(hx + 0.15, hy - 1.05, 0.8);
  aimHand(0.92, -0.58, 0.45);
  armsAndWeapon(SN_HAND);
}

// ---------------------------------------------------------------- 5 roo: a kangaroo in boxing gloves

const RO = { fur: '#cf9d6e', light: '#f2ddbf', ear: '#e7b4a2', nose: '#5b3d35' };
const RO_FOOT = part('roF', [-0.5, -0.35, 1.05, 0.48], (g) => chunk(g, [[E(0.1, -0.09, 0.3, 0.1), RO.fur, 0.04]]));
const RO_TAIL = part('roT', [-1.05, -0.35, 1.3, 1.0], (g) => {
  const p = PATH((p) => {
    p.moveTo(0.1, -0.16);
    p.quadraticCurveTo(-0.55, -0.05, -0.82, 0.36);
    p.quadraticCurveTo(-0.84, 0.46, -0.72, 0.44);
    p.quadraticCurveTo(-0.4, 0.22, 0.08, 0.14);
    p.closePath();
  });
  chunk(g, [[p, RO.fur, 0.06]]);
});
const RO_BODY = part('roB', [-0.75, -1.32, 1.45, 1.35], (g) => {
  const body = E(0.02, -0.66, 0.42, 0.5);
  const haunch = E(-0.14, -0.3, 0.32, 0.25);
  chunk(g, [[haunch, RO.fur, 0.06], [body, RO.fur, 0.1]]);
  clipIn(g, body, () => paint(g, E(0.2, -0.72, 0.24, 0.36), RO.light, 0));
  const trunks = PATH((p) => {
    p.moveTo(-0.44, -0.44);
    p.lineTo(0.42, -0.44);
    p.quadraticCurveTo(0.44, -0.2, 0.3, -0.14);
    p.lineTo(-0.36, -0.12);
    p.quadraticCurveTo(-0.48, -0.24, -0.44, -0.44);
    p.closePath();
  });
  chunk(g, [[trunks, accent(), 0.07]]);
  const waist = RR(-0.44, -0.47, 0.86, 0.08, 0.03);
  chunk(g, [[waist, '#f2ede3', 0]]);
});
const RO_HEAD = part('roHd', [-0.75, -1.65, 1.8, 1.85], (g) => {
  const head = E(0.06, -0.4, 0.5, 0.45);
  const earB = E(-0.3, -0.98, 0.14, 0.38, -0.38);
  const earF = E(0.0, -1.04, 0.14, 0.38, -0.12);
  const snout = E(0.5, -0.28, 0.3, 0.21, 0.08);
  chunk(g, [[earB, RO.fur, 0.05], [earF, RO.fur, 0.05], [head, RO.fur, 0.12], [snout, RO.light, 0.05]]);
  for (const [x, y, rot] of [[-0.27, -0.98, -0.38], [0.02, -1.03, -0.12]] as const) {
    g.beginPath();
    g.ellipse(x, y, 0.07, 0.25, rot, 0, TAU);
    g.fillStyle = C(RO.ear);
    g.fill();
  }
  chunk(g, [[E(0.78, -0.37, 0.085, 0.065), RO.nose, 0]]);
  blush(g, 0.2, -0.2, 0.08);
  eyes(g, 0.22, 0.46, -0.52, 0.11, RO.fur);
  mouth(g, 0.6, -0.14, 0.09);
});
const RO_GLOVE = glovePart('roG', RO.fur, 1.05);

function drawRoo() {
  const t = R.t;
  // it hops when it walks: both feet together
  const hp = Math.abs(Math.sin(R.ph * 0.6)) * 0.28 * R.mv;
  const air = Math.min(1, hp * 6);
  const bob = -hp;
  put(RO_TAIL, '', -0.36, -0.42 + bob * 0.5, -0.1 * air + Math.sin(t * 2.6 + R.seed) * 0.03);
  put(RO_FOOT, '', -0.06, bob, 0.2 * air);
  if (R.look.sneakers) shoeAt(0.0, bob, 0.55);
  // the far glove up by the chin, the guard
  const gx = 0.48 + 0.04 * Math.sin(t * 2.6 + R.seed);
  put(RO_GLOVE, '', twoH() ? 0.3 : gx, -1.18 + bob, -0.5);
  put(RO_BODY, '', 0, bob);
  put(RO_FOOT, '', 0.06, bob, 0.2 * air);
  if (R.look.sneakers) shoeAt(0.14, bob, 0.6);
  const hx = 0.04 + (R.weapon ? 0 : 0.06 * R.strike - 0.05 * R.wind);
  const hy = -1.06 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02;
  put(RO_HEAD, R.fk, hx, hy, -0.05 * air);
  helmetAt(hx + 0.08, hy - 0.72, 1.55, -0.08);
  crownAt(hx + 0.06, hy - 1.02);
  chiliAt(hx + 0.2, hy - 1.5, 0.9);
  aimHand(0.5, -0.9 + bob, 0.7);
  armsAndWeapon(RO_GLOVE, R.weapon ? -0.6 : -0.15 + 0.2 * R.strike);
}

// ---------------------------------------------------------------- 6 cacto: a potted cactus with two little boxing arms

const CA = { green: '#80ad6b', rib: '#6a9758', pot: '#c98364', rim: '#d6967a' };
const CA_POT = part('caP', [-0.85, -0.98, 1.7, 1.15], (g) => {
  const pot = PATH((p) => {
    p.moveTo(-0.44, 0);
    p.lineTo(0.44, 0);
    p.lineTo(0.54, -0.56);
    p.lineTo(-0.54, -0.56);
    p.closePath();
  });
  const rim = RR(-0.63, -0.76, 1.26, 0.24, 0.08);
  chunk(g, [[pot, CA.pot, 0.1], [rim, CA.rim, 0.06]]);
  clipIn(g, pot, () => {
    const band = RR(-0.7, -0.38, 1.4, 0.15, 0);
    paint(g, band, accent(), 0);
    inner(g, band, 0.8);
  });
});
const CA_BODY = part('caB', [-0.75, -1.72, 1.5, 1.92], (g) => {
  const col = RR(-0.48, -1.46, 0.96, 1.52, 0.48);
  chunk(g, [[col, CA.green, 0.14]]);
  clipIn(g, col, () => {
    g.lineWidth = B.lw * 1.1;
    g.strokeStyle = C(CA.rib);
    g.beginPath();
    g.moveTo(-0.22, -1.3);
    g.quadraticCurveTo(-0.3, -0.6, -0.24, 0.1);
    g.moveTo(-0.02, -1.42);
    g.lineTo(-0.02, -1.2);
    g.stroke();
  });
  // a few spines
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = inkC();
  g.beginPath();
  for (const [x, y, dx] of [[-0.48, -1.0, -1], [-0.5, -0.55, -1], [-0.48, -0.15, -1], [0.48, -0.25, 1], [0.0, -1.46, 0]] as const) {
    if (dx) {
      g.moveTo(x, y);
      g.lineTo(x + dx * 0.13, y - 0.04);
      g.moveTo(x, y);
      g.lineTo(x + dx * 0.13, y + 0.06);
    } else {
      g.moveTo(-0.08, y);
      g.lineTo(-0.12, y - 0.13);
      g.moveTo(0.06, y);
      g.lineTo(0.1, y - 0.13);
    }
  }
  g.stroke();
  blush(g, 0.0, -0.78, 0.08);
  eyes(g, 0.1, 0.34, -0.98, 0.12, CA.green);
  mouth(g, 0.24, -0.72, 0.1);
});
const CA_GLOVE = glovePart('caG', CA.green, 0.9);

function drawCacto() {
  const t = R.t;
  const ctx = R.ctx;
  const hp = Math.abs(Math.sin(R.ph)) * 0.12 * R.mv;
  const wob = Math.sin(R.ph) * 0.07 * R.mv;
  ctx.translate(0, -hp);
  if (wob) ctx.rotate(wob);
  if (R.look.sneakers) {
    shoeAt(-0.22, hp, 0.48);
    shoeAt(0.24, hp, 0.52);
  }
  // two jabs: the near glove on the first half of the strike, the far glove on the second
  const sk = R.strike;
  const jab2 = !R.weapon && sk > 0 && sk <= 0.5 ? Math.sin((sk / 0.5) * Math.PI) : 0;
  const by = -0.66;
  const sway = Math.sin(t * 2.6 + R.seed) * 0.02;
  const fgx = 0.56 + 0.62 * jab2;
  const fgy = -1.36 + 0.08 * jab2 + R.aim * 0.3 * jab2;
  if (!twoH()) put(CA_GLOVE, '', fgx, fgy, -0.4 + 0.3 * jab2);
  put(CA_POT, '', 0, 0);
  const tilt = (R.weapon ? 0 : 0.08 * Math.max(0, sk - 0.5) - 0.06 * R.wind) + sway;
  put(CA_BODY, R.fk, 0, by, tilt);
  helmetAt(0.04 + tilt * 1.4, by - 1.42, 1.5, -0.08);
  crownAt(0.05 + tilt * 1.4, by - 1.62);
  chiliAt(0.15, by - 1.85, 0.9);
  if (!R.weapon && sk > 0.5) {
    R.strike = (sk - 0.5) / 0.5;
    aimHand(0.6, -1.08, 0.6);
    R.strike = sk;
  } else if (!R.weapon && sk > 0) aimHand(0.6, -1.08, 0);
  else aimHand(0.6, -1.08, 0.6);
  armsAndWeapon(CA_GLOVE, R.weapon ? -0.6 : -0.2);
  if (wob) ctx.rotate(-wob);
  ctx.translate(0, hp);
}

// ---------------------------------------------------------------- 7 pogo: a kid in a crash helmet on a pogo stick

const PG = { skin: '#f0cca4', hair: '#8a5f42', helm: '#e49b5d', stripe: '#f4efe4', pants: '#5f6f8c', pole: '#b3bbc5', dark: '#4a4f5c', spring: '#8f98a4', shoe: '#f2efe7' };
/** the spring and its rubber foot: pivot = the tip on the ground, 0.5 tall (squeezed by scaling y) */
const PG_SPRING = part('pgS', [-0.32, -0.68, 0.64, 0.82], (g) => {
  const coil = RR(-0.13, -0.52, 0.26, 0.42, 0.08);
  const tip = RR(-0.09, -0.14, 0.18, 0.16, 0.07);
  chunk(g, [[coil, PG.spring, 0.04], [tip, PG.dark, 0]]);
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = inkC();
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const y = -0.2 - i * 0.1;
    g.moveTo(-0.13, y + 0.03);
    g.lineTo(0.13, y - 0.03);
  }
  g.stroke();
});
/** the pole with its foot bar (the pivot) and handlebar */
const PG_STICK = part('pgK', [-0.48, -1.0, 0.96, 1.18], (g) => {
  const pole = RR(-0.055, -0.76, 0.11, 0.8, 0.05);
  const peg = RR(-0.3, -0.04, 0.6, 0.11, 0.055);
  const bar = RR(-0.22, -0.8, 0.44, 0.1, 0.05);
  chunk(g, [[pole, PG.pole, 0.03], [bar, PG.pole, 0], [peg, PG.dark, 0], [E(0.22, -0.75, 0.075, 0.075), PG.dark, 0]]);
});
const PG_FOOT = part('pgF', [-0.38, -0.36, 0.8, 0.48], (g) => {
  const shoe = E(0.04, -0.1, 0.2, 0.11);
  chunk(g, [[shoe, PG.shoe, 0.04]]);
  clipIn(g, shoe, () => paint(g, RR(-0.3, -0.06, 0.7, 0.2, 0), '#c7c2b8', 0));
});
const PG_HAND = handPart('pgH', PG.skin, 0.11);
/** shorts and the team shirt; pivot = the foot bar */
const PG_BODY = part('pgB', [-0.62, -1.05, 1.24, 1.15], (g) => {
  const shorts = RR(-0.3, -0.44, 0.56, 0.32, 0.13);
  const shirt = E(-0.02, -0.66, 0.34, 0.31);
  chunk(g, [[shorts, PG.pants, 0.05], [shirt, accent(), 0.08]]);
  clipIn(g, shirt, () => {
    // a white stripe round the chest, a jersey
    const st = RR(-0.5, -0.74, 1, 0.09, 0);
    paint(g, st, PG.stripe, 0);
  });
});
/** the head and its crash helmet (hair instead when gear sits there); pivot = the neck */
const PG_HEAD = part('pgHd', [-0.98, -1.45, 2.0, 1.65], (g) => {
  const head = E(0.04, -0.52, 0.6, 0.55);
  const own = !R.look.helmet;
  chunk(g, [own ? [E(-0.5, -0.34, 0.16, 0.14), PG.hair, 0] : [E(-0.12, -0.82, 0.5, 0.3, -0.3), PG.hair, 0.04], [head, PG.skin, 0.1]]);
  blush(g, 0.2, -0.28, 0.09);
  eyes(g, 0.3, 0.58, -0.47, 0.12, PG.skin);
  mouth(g, 0.46, -0.22, 0.1);
  if (!own) return;
  const dome = PATH((p) => {
    p.moveTo(-0.67, -0.48);
    p.bezierCurveTo(-0.72, -1.34, 0.74, -1.38, 0.69, -0.64);
    p.quadraticCurveTo(0.0, -0.74, -0.67, -0.48);
    p.closePath();
  });
  const peak = PATH((p) => {
    p.moveTo(0.48, -0.7);
    p.quadraticCurveTo(0.82, -0.74, 0.92, -0.62);
    p.lineTo(0.6, -0.6);
    p.closePath();
  });
  chunk(g, [[peak, PG.helm, 0], [dome, PG.helm, 0.08]]);
  clipIn(g, dome, () => {
    g.beginPath();
    g.ellipse(-0.08, -0.7, 0.13, 0.75, 0.3, 0, TAU);
    g.fillStyle = C(PG.stripe);
    g.fill();
  });
});

function drawPogo() {
  const t = R.t;
  // it never stands still: a little bounce at rest, real bounces as it moves; the spring squeezes as it lands
  const s = Math.abs(Math.sin(R.ph * 0.6));
  const up = s * 0.3 * R.mv;
  const sq = R.mv * (1 - Math.min(1, s * 4)) * 0.13 + (1 - R.mv) * (0.035 + 0.03 * Math.sin(t * 5 + R.seed));
  const peg = -0.5 - up + sq;
  const kx = 0.2;
  const tilt = 0.06 * Math.sin(R.ph * 0.6) * R.mv;
  if (!twoH()) put(PG_HAND, '', kx - 0.1, peg - 0.8);
  put(PG_FOOT, '', kx - 0.24, peg - 0.05);
  if (R.look.sneakers) shoeAt(kx - 0.2, peg - 0.05, 0.5);
  put(PG_SPRING, '', kx, -up, 0, 1, (0.5 - sq) / 0.5);
  put(PG_BODY, '', -0.04, peg, tilt * 0.5);
  put(PG_STICK, '', kx, peg, tilt);
  put(PG_FOOT, '', kx + 0.08, peg - 0.05);
  if (R.look.sneakers) shoeAt(kx + 0.12, peg - 0.05, 0.55);
  // the head bonks forward when it has no weapon
  const hx = -0.04 + (R.weapon ? 0 : 0.14 * R.strike - 0.08 * R.wind);
  const hy = peg - 0.82 + Math.sin(t * 2.6 + R.seed + 0.8) * 0.015;
  const ht = R.weapon ? 0 : 0.14 * R.strike - 0.1 * R.wind;
  put(PG_HEAD, R.fk, hx, hy, ht);
  helmetAt(hx + 0.05, hy - 0.8, 1.42, -0.08 + ht);
  crownAt(hx + 0.04, hy - (R.look.helmet ? 1.15 : 1.08));
  chiliAt(hx + 0.18, hy - 1.25, 0.9);
  aimHand(kx + 0.14, peg - 0.78, 0.55);
  armsAndWeapon(PG_HAND);
}

// ---------------------------------------------------------------- 8 briar: a round thorny rose bush with a grumpy face

const BR = { leaf: '#77a37d', vein: '#5c8865', rose: '#f0a3b0', thorn: '#ece1c4', root: '#8d6b4d' };
const BR_FOOT = part('brF', [-0.42, -0.4, 0.88, 0.52], (g) => chunk(g, [[E(0.04, -0.12, 0.23, 0.13), BR.root, 0.05]]));
/** a little leaf of a hand with a thorn on its back */
const BR_HAND = part('brH', [-0.4, -0.45, 0.8, 0.85], (g) => {
  const th = PATH((p) => {
    p.moveTo(-0.08, -0.1);
    p.lineTo(-0.03, -0.29);
    p.lineTo(0.06, -0.11);
    p.closePath();
  });
  chunk(g, [[th, BR.thorn, 0], [E(0, 0, 0.16, 0.14), BR.leaf, 0.05]]);
});
/** the knot of the band and its two ends, behind */
const BR_TAIL = part('brT', [-0.42, -0.32, 0.84, 0.95], (g) => {
  chunk(g, [[E(-0.1, 0.22, 0.1, 0.27, 0.35), accent(), 0.04], [E(0.1, 0.2, 0.1, 0.24, -0.3), accent(), 0.04], [E(0, -0.02, 0.14, 0.12), accent(), 0.03]]);
});
const BR_BODY = part('brB', [-1.42, -2.4, 2.88, 2.48], (g) => {
  const cy = -1.02;
  // thorns poking out all round, under the leaves
  const sh: Sh[] = [];
  for (const a of [-2.75, -2.15, -1.6, -1.0, -0.42, 0.4, 2.5, 3.05]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = c * 0.9;
    const y = cy + s * 0.86;
    sh.push([PATH((p) => {
      p.moveTo(x - s * 0.1, y + c * 0.1);
      p.lineTo(x + c * 0.24, y + s * 0.24);
      p.lineTo(x + s * 0.1, y - c * 0.1);
      p.closePath();
    }), BR.thorn, 0]);
  }
  // leafy clumps round a big round bush: one silhouette
  sh.push([E(-0.55, cy - 0.48, 0.45, 0.42), BR.leaf, 0.06]);
  sh.push([E(0.12, cy - 0.64, 0.48, 0.4), BR.leaf, 0.06]);
  sh.push([E(-0.8, cy + 0.14, 0.36, 0.38), BR.leaf, 0.06]);
  const body = E(0, cy, 0.92, 0.86);
  sh.push([body, BR.leaf, 0.15]);
  chunk(g, sh);
  // a few leaf marks
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = C(BR.vein);
  g.beginPath();
  for (const [x, y] of [[-0.55, cy - 0.12], [-0.3, cy + 0.42], [-0.05, cy - 0.5], [-0.72, cy + 0.42]] as const) {
    g.moveTo(x - 0.08, y - 0.06);
    g.lineTo(x, y + 0.02);
    g.lineTo(x + 0.08, y - 0.06);
  }
  g.stroke();
  // the band round its middle
  clipIn(g, body, () => {
    const band = RR(-1.0, cy + 0.42, 2.0, 0.24, 0.04);
    paint(g, band, accent(), 0);
    inner(g, band, 0.9);
  });
  // roses crowning the bush: a bloom with a curl of petals drawn in, two leaves under it
  for (const [x, y, s] of [[-0.4, cy - 0.86, 0.24], [0.3, cy - 0.92, 0.2], [-0.94, cy - 0.12, 0.18]] as const) {
    chunk(g, [[E(x - s * 0.8, y + s * 0.55, s * 0.5, s * 0.24, 0.5), BR.vein, 0], [E(x + s * 0.8, y + s * 0.55, s * 0.5, s * 0.24, -0.5), BR.vein, 0], [E(x, y, s, s * 0.9), BR.rose, s * 0.28]]);
    g.lineWidth = B.lw * 0.75;
    g.strokeStyle = inkC();
    g.beginPath();
    g.arc(x - s * 0.04, y + s * 0.02, s * 0.5, Math.PI * 0.75, Math.PI * 2.05);
    g.moveTo(x + s * 0.18, y + s * 0.02);
    g.arc(x + s * 0.02, y + s * 0.02, s * 0.18, 0, Math.PI * 1.3);
    g.stroke();
  }
  // a grumpy face: low brows and a frown when it is calm
  eyes(g, 0.36, 0.68, cy - 0.06, 0.13, BR.leaf);
  if (B.face === 'open' || B.face === 'blink') {
    g.lineWidth = 0.075;
    g.strokeStyle = inkC();
    g.beginPath();
    g.moveTo(0.2, cy - 0.33);
    g.lineTo(0.46, cy - 0.24);
    g.moveTo(0.6, cy - 0.26);
    g.lineTo(0.82, cy - 0.32);
    g.stroke();
  }
  if (B.mouth === 'smile') {
    g.lineWidth = Math.max(0.046, B.lw * 0.9);
    g.strokeStyle = inkC();
    g.beginPath();
    g.arc(0.54, cy + 0.34, 0.12, Math.PI * 1.18, Math.PI * 1.82);
    g.stroke();
  } else mouth(g, 0.54, cy + 0.24, 0.11);
});

function drawBriar() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.07 * R.mv;
  const sway = Math.sin(R.ph) * 0.06 * R.mv + Math.sin(t * 2.6 + R.seed) * 0.012;
  const fx = -0.3 + stepX(Math.PI, 0.2);
  const nx = 0.3 + stepX(0, 0.2);
  put(BR_FOOT, '', fx, stepY(Math.PI, 0.12));
  if (R.look.sneakers) shoeAt(fx + 0.04, stepY(Math.PI, 0.12), 0.55);
  if (!twoH()) put(BR_HAND, '', -0.98, -0.88 + bob);
  put(BR_TAIL, '', -0.84, -0.5 + bob, 0.3 + 0.6 * R.mv + Math.sin(t * 3 + R.seed) * 0.08);
  // it bristles as it lashes out
  const br = R.weapon ? 0 : 0.05 * R.strike;
  put(BR_BODY, R.fk, 0, bob, sway, 1 + br, 1 + br);
  put(BR_FOOT, '', nx, stepY(0, 0.12));
  if (R.look.sneakers) shoeAt(nx + 0.04, stepY(0, 0.12), 0.6);
  helmetAt(0.04 + sway * 1.4, bob - 1.42, 2.1, -0.06 + sway);
  crownAt(0.14 + sway * 2, bob - (R.look.helmet ? 2.02 : 1.98), -0.12 + sway);
  chiliAt(0.2, bob - 2.2, 1.0);
  aimHand(0.92, -0.86 + bob, 0.55);
  armsAndWeapon(BR_HAND);
}

// ---------------------------------------------------------------- 9 angler: a fisherman in a rain hat with a rod

const AN = { coat: '#dfbc5f', skin: '#f0cca4', beard: '#eeebe4', boot: '#5a7680', rod: '#9a6a44', reel: '#aab2bd', nose: '#e8a291', hair: '#d4d0c8', dark: '#4a4f5c' };
const AN_FOOT = part('anF', [-0.42, -0.44, 0.9, 0.56], (g) => chunk(g, [[RR(-0.17, -0.27, 0.42, 0.27, 0.11), AN.boot, 0.05]]));
const AN_HAND = handPart('anH', AN.skin, 0.12);
const AN_TAIL = part('anT', [-0.32, -0.25, 0.64, 0.9], (g) => {
  chunk(g, [[RR(-0.13, -0.06, 0.26, 0.5, 0.12), accent(), 0.05]]);
  inner(g, PATH((p) => { p.moveTo(-0.13, 0.3); p.lineTo(0.13, 0.3); }), 0.7);
});
/** the raincoat and the scarf; pivot = the feet */
const AN_BODY = part('anB', [-0.75, -1.38, 1.5, 1.48], (g) => {
  const coat = PATH((p) => {
    p.moveTo(-0.3, -1.04);
    p.quadraticCurveTo(0.0, -1.14, 0.32, -1.04);
    p.quadraticCurveTo(0.52, -0.5, 0.5, -0.22);
    p.quadraticCurveTo(0.0, -0.1, -0.48, -0.22);
    p.quadraticCurveTo(-0.52, -0.5, -0.3, -1.04);
    p.closePath();
  });
  chunk(g, [[coat, AN.coat, 0.1]]);
  inner(g, PATH((p) => { p.moveTo(0.24, -0.98); p.quadraticCurveTo(0.32, -0.6, 0.28, -0.16); }), 0.8);
  g.fillStyle = inkC();
  for (const y of [-0.74, -0.46]) {
    g.beginPath();
    g.arc(0.38, y, 0.045, 0, TAU);
    g.fill();
  }
  chunk(g, [[E(0.0, -1.06, 0.4, 0.18), accent(), 0.06]]);
});
/** the head with its white beard and sou'wester (thin hair instead when gear sits there); pivot = the neck */
const AN_HEAD = part('anHd', [-1.02, -1.5, 2.04, 1.8], (g) => {
  const head = E(0.04, -0.5, 0.56, 0.52);
  const own = !R.look.helmet;
  chunk(g, own ? [[head, AN.skin, 0.1]] : [[E(-0.2, -0.78, 0.38, 0.26, -0.4), AN.hair, 0.03], [head, AN.skin, 0.1]]);
  chunk(g, [[E(-0.08, -0.22, 0.26, 0.24), AN.beard, 0.04], [E(0.48, -0.25, 0.24, 0.22), AN.beard, 0.04], [E(0.2, -0.14, 0.36, 0.3), AN.beard, 0.06]]);
  chunk(g, [[E(0.58, -0.44, 0.1, 0.085), AN.nose, 0.02]]);
  eyes(g, 0.28, 0.52, -0.6, 0.11, AN.skin);
  mouth(g, 0.42, -0.2, 0.09);
  if (!own) return;
  // the sou'wester: a round crown and a brim that slopes down long at the back
  const crown = PATH((p) => {
    p.moveTo(-0.5, -0.74);
    p.bezierCurveTo(-0.5, -1.32, 0.56, -1.36, 0.56, -0.8);
    p.closePath();
  });
  const brim = PATH((p) => {
    p.moveTo(0.8, -0.86);
    p.quadraticCurveTo(0.1, -0.88, -0.56, -0.76);
    p.quadraticCurveTo(-0.8, -0.64, -0.84, -0.36);
    p.quadraticCurveTo(-0.62, -0.42, -0.5, -0.58);
    p.quadraticCurveTo(0.1, -0.72, 0.8, -0.72);
    p.closePath();
  });
  chunk(g, [[crown, AN.coat, 0.07], [brim, AN.coat, 0.04]]);
});
/** the rod: pivot at the grip, pointing up, 1.9 long */
const AN_ROD = part('anR', [-0.24, -2.05, 0.5, 2.25], (g) => {
  rope(g, PATH((p) => { p.moveTo(0, 0.06); p.lineTo(0, -1.92); }), 0.06, AN.rod);
  chunk(g, [[RR(-0.065, -0.32, 0.13, 0.4, 0.05), AN.dark, 0], [E(0.1, -0.2, 0.09, 0.09), AN.reel, 0]]);
});
/** the float with the hook under it */
const AN_BOB = part('anBb', [-0.25, -0.25, 0.5, 0.6], (g) => {
  g.lineWidth = B.lw * 0.9;
  g.strokeStyle = inkC();
  g.beginPath();
  g.moveTo(0, 0.08);
  g.lineTo(0, 0.2);
  g.arc(-0.05, 0.2, 0.05, 0, Math.PI * 0.9);
  g.stroke();
  const f = E(0, 0, 0.1, 0.1);
  chunk(g, [[f, '#f2efe7', 0.03]]);
  clipIn(g, f, () => paint(g, RR(-0.12, -0.12, 0.24, 0.11, 0), '#e39a58', 0));
});

function drawAngler() {
  const t = R.t;
  const ctx = R.ctx;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  const fx = -0.16 + stepX(Math.PI, 0.22);
  const nx = 0.16 + stepX(0, 0.22);
  // armed, it slings the rod on its back
  if (R.weapon) put(AN_ROD, '', -0.28, -0.55 + bob, -0.5);
  put(AN_FOOT, '', fx, stepY(Math.PI, 0.14));
  if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.14), 0.55);
  if (R.weapon && !twoH()) put(AN_HAND, '', -0.42, -0.62 + bob);
  put(AN_TAIL, '', -0.32, -1.04 + bob, 0.3 + 0.7 * R.mv + Math.sin(t * 3 + R.seed) * 0.08);
  put(AN_BODY, '', 0, bob);
  put(AN_FOOT, '', nx, stepY(0, 0.14));
  if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.14), 0.6);
  const hx = 0.02 + (R.weapon ? 0 : 0.06 * R.strike - 0.05 * R.wind);
  const hy = -1.08 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02;
  put(AN_HEAD, R.fk, hx, hy, R.weapon ? 0 : 0.06 * R.strike - 0.06 * R.wind);
  helmetAt(hx + 0.05, hy - 0.78, 1.36, -0.08);
  crownAt(hx + 0.04, hy - (R.look.helmet ? 1.1 : 1.2));
  chiliAt(hx + 0.15, hy - 1.38, 0.9);
  if (R.weapon) {
    aimHand(0.42, -0.62 + bob, 0.5);
    armsAndWeapon(AN_HAND);
    return;
  }
  // the cast: the rod goes back over the shoulder on the wind-up and whips forward; the hook flies out
  const sk = R.strike;
  const ft = sk < 0.7 ? 1.15 * smooth(sk / 0.7) : lerp(1.15, 1, (sk - 0.7) / 0.3);
  const gx = 0.4 - 0.2 * R.wind + 0.18 * ft;
  const gy = -0.64 + bob - 0.22 * R.wind + R.aim * 0.1 * ft;
  let a = 0.5 - 1.45 * R.wind + (0.7 + R.aim * 0.35) * ft;
  if (R.cheer) a = -0.1 + Math.sin(t * 9) * 0.2;
  const L = 1.9;
  const tx = gx + Math.sin(a) * L;
  const ty = gy - Math.cos(a) * L;
  const out = Math.min(1, sk * 1.3);
  const sw = Math.sin(t * 2.2 + R.seed) * 0.06 * (1 - out);
  const ex = tx + sw + 0.55 * out;
  const ey = lerp(ty + 0.75, ty + 0.2 + R.aim * 0.5, out);
  // the far hand on the butt, the rod, the near hand on the grip
  put(AN_HAND, '', gx - Math.sin(a) * 0.3, gy + Math.cos(a) * 0.3);
  put(AN_ROD, '', gx, gy, a);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(lerp(tx, ex, 0.5) + 0.1 * out, lerp(ty, ey, 0.5) - 0.25 * out + 0.08, ex, ey - 0.08);
  ctx.lineWidth = R.lw * 0.7;
  ctx.strokeStyle = R.grey ? STONE_INK : COLOR.ink;
  ctx.stroke();
  put(AN_BOB, '', ex, ey);
  put(AN_HAND, '', gx, gy);
}

// ---------------------------------------------------------------- 10 sumo: a big sumo wrestler

const SU = { skin: '#efc19e', hair: '#3e3844' };
const SU_FOOT = part('suF', [-0.45, -0.44, 0.96, 0.56], (g) => chunk(g, [[E(0.06, -0.13, 0.28, 0.15), SU.skin, 0.05]]));
const SU_HAND = handPart('suH', SU.skin, 0.17);
/** the belly in its belt (the team colour), the knot behind; pivot = the feet */
const SU_BODY = part('suB', [-1.2, -1.95, 2.4, 2.0], (g) => {
  const belly = E(0, -0.92, 0.9, 0.8);
  chunk(g, [[E(-0.9, -0.44, 0.17, 0.15), accent(), 0.03], [belly, SU.skin, 0.16]]);
  clipIn(g, belly, () => {
    const belt = PATH((p) => {
      p.moveTo(-1, -0.56);
      p.quadraticCurveTo(0, -0.38, 1, -0.62);
      p.lineTo(1, 0.1);
      p.lineTo(-1, 0.1);
      p.closePath();
    });
    paint(g, belt, accent(), 0.05);
    inner(g, belt, 0.9);
  });
  // the belly button
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = inkC();
  g.beginPath();
  g.arc(0.66, -0.78, 0.05, Math.PI * 0.6, Math.PI * 1.5);
  g.stroke();
});
const SU_HEAD = part('suHd', [-0.85, -1.38, 1.75, 1.58], (g) => {
  const head = E(0.05, -0.42, 0.5, 0.47);
  const own = !R.look.helmet;
  chunk(g, own ? [[E(-0.12, -0.96, 0.16, 0.13), SU.hair, 0.04], [head, SU.skin, 0.1]] : [[head, SU.skin, 0.1]]);
  const hair = E(-0.16, -0.82, 0.56, 0.36, -0.12);
  clipIn(g, head, () => {
    paint(g, hair, SU.hair, 0.04);
    inner(g, hair, 0.8);
  });
  if (own) inner(g, PATH((p) => { p.moveTo(-0.2, -0.86); p.lineTo(-0.04, -0.9); }), 0.8);
  blush(g, 0.2, -0.24, 0.09);
  eyes(g, 0.26, 0.48, -0.4, 0.1, SU.skin);
  mouth(g, 0.38, -0.18, 0.09);
});

function drawSumo() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.05 * R.mv;
  const sway = Math.sin(R.ph) * 0.07 * R.mv + Math.sin(t * 2.6 + R.seed) * 0.012;
  // the belly push: it bumps forward on the strike, both palms out
  const bare = !R.weapon;
  const push = bare ? 0.24 * R.strike - 0.12 * R.wind : 0;
  const shove = bare && !R.cheer && (R.strike > 0 || R.wind > 0);
  const fx = -0.42 + stepX(Math.PI, 0.16);
  const nx = 0.42 + stepX(0, 0.16);
  put(SU_FOOT, '', fx, stepY(Math.PI, 0.22));
  if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.22), 0.62);
  if (!twoH() && !shove) put(SU_HAND, '', -0.9, -1.0 + bob);
  put(SU_BODY, '', push, bob, sway, 1 + 0.05 * R.strike * (bare ? 1 : 0), 1 - 0.03 * R.strike * (bare ? 1 : 0));
  put(SU_FOOT, '', nx, stepY(0, 0.22));
  if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.22), 0.66);
  const hx = 0.2 + push * 0.6 + sway * 1.5;
  const hy = -1.55 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.015;
  put(SU_HEAD, R.fk, hx, hy, sway * 0.5);
  helmetAt(hx + 0.05, hy - 0.65, 1.2, -0.08);
  crownAt(hx + 0.06, hy - (R.look.helmet ? 1.02 : 0.92));
  chiliAt(hx + 0.15, hy - 1.25, 0.9);
  aimHand(0.84 + push, -1.0 + bob, 0.45);
  if (shove) put(SU_HAND, '', H.x - 0.1, H.y - 0.34);
  armsAndWeapon(SU_HAND);
}

// ---------------------------------------------------------------- 11 rhino: a rhino in plated armour

const RH = { skin: '#b3aaa6', plate: '#6d7b91', rivet: '#e2cd96', horn: '#efe6d0', ear: '#d9a7a5' };
const RH_FOOT = part('rhF', [-0.45, -0.44, 0.96, 0.56], (g) => chunk(g, [[E(0.06, -0.13, 0.27, 0.15), RH.skin, 0.05]]));
/** an armoured fist */
const RH_HAND = handPart('rhH', RH.plate, 0.15);
/** the body in its breastplate, a sash across it, a plate on the shoulder; pivot = the feet */
const RH_BODY = part('rhB', [-0.9, -1.65, 1.8, 1.7], (g) => {
  const torso = E(0, -0.78, 0.52, 0.56);
  const plate = PATH((p) => {
    p.moveTo(-0.5, -0.66);
    p.bezierCurveTo(-0.58, -1.44, 0.6, -1.48, 0.55, -0.64);
    p.quadraticCurveTo(0.02, -0.48, -0.5, -0.66);
    p.closePath();
  });
  chunk(g, [[torso, RH.skin, 0.1], [plate, RH.plate, 0.08]]);
  clipIn(g, plate, () => {
    const sash = PATH((p) => {
      p.moveTo(-0.62, -1.22);
      p.lineTo(-0.42, -1.4);
      p.lineTo(0.64, -0.74);
      p.lineTo(0.44, -0.56);
      p.closePath();
    });
    paint(g, sash, accent(), 0);
    inner(g, sash, 0.8);
  });
  g.fillStyle = C(RH.rivet);
  for (const [x, y] of [[0.36, -1.1], [-0.3, -0.76]] as const) {
    g.beginPath();
    g.arc(x, y, 0.05, 0, TAU);
    g.fill();
  }
  chunk(g, [[E(-0.14, -1.24, 0.32, 0.2, -0.25), RH.plate, 0.06]]);
});
const RH_HEAD = part('rhHd', [-0.78, -1.42, 1.98, 1.62], (g) => {
  const skull = E(0.05, -0.45, 0.5, 0.45);
  const snout = RR(0.1, -0.7, 0.84, 0.62, 0.28);
  const ear = E(-0.26, -0.86, 0.11, 0.2, -0.45);
  const horn = PATH((p) => {
    p.moveTo(0.68, -0.66);
    p.quadraticCurveTo(0.86, -0.8, 0.86, -1.14);
    p.quadraticCurveTo(1.02, -0.82, 0.92, -0.58);
    p.closePath();
  });
  const horn2 = PATH((p) => {
    p.moveTo(0.48, -0.68);
    p.quadraticCurveTo(0.55, -0.78, 0.55, -0.9);
    p.quadraticCurveTo(0.66, -0.78, 0.64, -0.66);
    p.closePath();
  });
  chunk(g, [[ear, RH.skin, 0.03], [skull, RH.skin, 0.1], [snout, RH.skin, 0.1]]);
  g.beginPath();
  g.ellipse(-0.25, -0.86, 0.05, 0.12, -0.45, 0, TAU);
  g.fillStyle = C(RH.ear);
  g.fill();
  chunk(g, [[horn2, RH.horn, 0.03], [horn, RH.horn, 0.05]]);
  g.fillStyle = inkC();
  g.beginPath();
  g.ellipse(0.84, -0.36, 0.045, 0.035, 0, 0, TAU);
  g.fill();
  eyes(g, 0.22, 0.42, -0.56, 0.1, RH.skin);
  mouth(g, 0.66, -0.2, 0.09);
});

function drawRhino() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.07 * R.mv;
  const fx = -0.2 + stepX(Math.PI, 0.24);
  const nx = 0.2 + stepX(0, 0.24);
  put(RH_FOOT, '', fx, stepY(Math.PI, 0.16));
  if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.16), 0.6);
  if (!twoH()) put(RH_HAND, '', -0.56, -0.72 + bob);
  put(RH_BODY, '', 0, bob);
  put(RH_FOOT, '', nx, stepY(0, 0.16));
  if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.16), 0.64);
  // the horn leads the charge: head down and forward on the strike, reared back on the wind-up
  const gore = R.weapon ? 0 : 1;
  const hx = 0.12 + gore * (0.26 * R.strike - 0.1 * R.wind);
  const hy = -1.3 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02 + gore * (0.1 * R.strike - 0.06 * R.wind);
  const tilt = gore * (0.35 * R.strike - 0.22 * R.wind);
  put(RH_HEAD, R.fk, hx, hy, tilt);
  helmetAt(hx + 0.02 + tilt * 0.4, hy - 0.68, 1.2, -0.12 + tilt);
  crownAt(hx + 0.04 + tilt * 0.5, hy - (R.look.helmet ? 1.06 : 0.92), -0.12 + tilt);
  chiliAt(hx + 0.2, hy - 1.25, 0.9);
  aimHand(0.5, -0.82 + bob, 0.35);
  armsAndWeapon(RH_HAND);
}

// ---------------------------------------------------------------- 12 boulder: a mossy rock golem with a tiny flower on top

const BO = { rock: '#a8a294', moss: '#8aa86a', petal: '#f6f1e4', heart: '#e8c46a', stem: '#6aa45a' };
const BO_FOOT = part('boF', [-0.45, -0.46, 0.98, 0.6], (g) => chunk(g, [[RR(-0.22, -0.3, 0.52, 0.3, 0.13), BO.rock, 0.05]]));
const BO_HAND = part('boH', [-0.46, -0.46, 0.92, 0.92], (g) => {
  const fist = RR(-0.23, -0.21, 0.46, 0.42, 0.16);
  chunk(g, [[fist, BO.rock, 0.08]]);
  inner(g, PATH((p) => { p.moveTo(0.06, -0.2); p.lineTo(0.1, -0.06); }), 0.7);
});
/** the cape (the team colour): pivot at the top of its back, hanging down behind */
const BO_CAPE = part('boC', [-1.05, -0.3, 1.25, 1.85], (g) => {
  const p = PATH((p) => {
    p.moveTo(0.0, -0.06);
    p.quadraticCurveTo(-0.46, 0.4, -0.78, 1.3);
    p.quadraticCurveTo(-0.44, 1.44, -0.1, 1.32);
    p.quadraticCurveTo(0.02, 0.62, 0.1, 0.06);
    p.closePath();
  });
  chunk(g, [[p, accent(), 0.08]]);
  inner(g, PATH((p) => { p.moveTo(-0.1, 0.3); p.quadraticCurveTo(-0.3, 0.8, -0.42, 1.3); }), 0.7);
});
const BO_BODY = part('boB', [-1.32, -2.32, 2.64, 2.4], (g) => {
  const cy = -1.05;
  // a lumpy rock: a smooth curve round eight points
  const pts = [[0.95, -0.08], [0.8, -0.74], [0.16, -1.0], [-0.52, -0.9], [-0.97, -0.34], [-0.92, 0.44], [-0.38, 0.86], [0.52, 0.84]];
  const n = pts.length;
  const rock = PATH((p) => {
    const mid = (i: number) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, cy + (pts[i][1] + pts[(i + 1) % n][1]) / 2];
    const m0 = mid(n - 1);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(i);
      p.quadraticCurveTo(pts[i][0], cy + pts[i][1], m[0], m[1]);
    }
    p.closePath();
  });
  chunk(g, [[rock, BO.rock, 0.16]]);
  clipIn(g, rock, () => {
    // the moss cap, its edge hanging in drips
    const moss = PATH((p) => {
      p.moveTo(-1.1, cy - 0.46);
      for (let i = 0; i < 6; i++) {
        const x0 = -1.1 + i * 0.38;
        p.quadraticCurveTo(x0 + 0.19, cy - 0.46 + (i % 2 ? 0.2 : 0.32), x0 + 0.38, cy - 0.5 + (i % 2 ? 0 : 0.04));
      }
      p.lineTo(1.2, cy - 1.3);
      p.lineTo(-1.2, cy - 1.3);
      p.closePath();
    });
    paint(g, moss, BO.moss, 0.05);
    inner(g, moss, 0.9);
    // a crack and a pebble or two
    inner(g, PATH((p) => {
      p.moveTo(-0.7, cy + 0.2);
      p.lineTo(-0.5, cy + 0.36);
      p.lineTo(-0.56, cy + 0.56);
    }), 0.8);
    g.fillStyle = C(mix(BO.rock, '#2e2742', 0.14));
    for (const [x, y, s] of [[-0.3, cy + 0.6, 0.07], [0.12, cy + 0.68, 0.05], [-0.62, cy - 0.12, 0.05]] as const) {
      g.beginPath();
      g.ellipse(x, y, s * 1.3, s, 0, 0, TAU);
      g.fill();
    }
  });
  // a heavy brow over small kind eyes
  inner(g, PATH((p) => { p.moveTo(0.22, cy - 0.3); p.quadraticCurveTo(0.55, cy - 0.36, 0.88, cy - 0.3); }), 1.1);
  eyes(g, 0.42, 0.72, cy - 0.08, 0.12, BO.rock);
  blush(g, 0.3, cy + 0.12, 0.08);
  mouth(g, 0.6, cy + 0.22, 0.11);
});
const BO_FLOWER = part('boFl', [-0.42, -0.8, 0.84, 0.92], (g) => {
  rope(g, PATH((p) => { p.moveTo(0, 0.06); p.quadraticCurveTo(0.05, -0.2, 0, -0.42); }), 0.06, BO.stem);
  chunk(g, [[E(0.13, -0.18, 0.11, 0.055, -0.5), BO.moss, 0]]);
  const petals: Sh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 - Math.PI / 2;
    petals.push([E(Math.cos(a) * 0.13, -0.5 + Math.sin(a) * 0.13, 0.1, 0.1), BO.petal, 0]);
  }
  chunk(g, petals);
  chunk(g, [[E(0, -0.5, 0.075, 0.075), BO.heart, 0]]);
});

function drawBoulder() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  const sway = Math.sin(R.ph) * 0.05 * R.mv + Math.sin(t * 2.6 + R.seed) * 0.01;
  const sk = R.strike;
  put(BO_CAPE, '', -0.55, -1.72 + bob, 0.12 + 0.35 * R.mv + Math.sin(t * 2.2 + R.seed) * 0.05 + 0.12 * R.hurt);
  const fx = -0.36 + stepX(Math.PI, 0.18);
  const nx = 0.36 + stepX(0, 0.18);
  put(BO_FOOT, '', fx, stepY(Math.PI, 0.14));
  if (R.look.sneakers) shoeAt(fx + 0.06, stepY(Math.PI, 0.14), 0.62);
  if (!twoH()) put(BO_HAND, '', -0.98, -0.9 + bob);
  const sq = R.weapon ? 0 : 0.06 * sk;
  put(BO_BODY, R.fk, 0, bob, sway, 1 + sq, 1 - sq);
  put(BO_FOOT, '', nx, stepY(0, 0.14));
  if (R.look.sneakers) shoeAt(nx + 0.06, stepY(0, 0.14), 0.66);
  if (!R.look.helmet) put(BO_FLOWER, '', 0.12 + sway * 2, bob - 1.98, sway + Math.sin(t * 2.1 + R.seed) * 0.12 - R.mv * 0.2 - R.hurt * 0.3);
  helmetAt(0.04 + sway * 1.4, bob - 1.46, 2.15, -0.06 + sway);
  crownAt(0.12 + sway * 2, bob - (R.look.helmet ? 2.05 : 1.98), -0.12 + sway);
  chiliAt(0.2, bob - 2.25, 1.0);
  // the smash: the fist goes up high on the wind-up and comes down ahead
  if (!R.weapon && !R.cheer && (R.wind > 0 || sk > 0)) {
    H2.on = false;
    H.a = 0;
    H.s = 1;
    H.x = lerp(0.9, 0.45, R.wind) + 0.42 * sk;
    H.y = lerp(-0.92 + bob, -2.05, R.wind) + (0.3 + R.aim * 0.3) * sk;
  } else aimHand(0.9, -0.92 + bob, 0.45);
  armsAndWeapon(BO_HAND);
}

const ch = (top: number, shadow: number, mid: number, colors: readonly [string, string, string], draw: () => void, o: Partial<CharDef> = {}): CharDef => ({
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

const CHARS: Record<PetType, CharDef> = {
  sprout: ch(2.45, 0.95, 1.0, [SP.body, SP.head, SP.foot], drawSprout, { wl: 0.95 }),
  buzzy: ch(2.55, 0.9, 1.05, [BZ.body, '#f8e3a6', BZ.stripe], drawBuzzy, { hover: 0.38 }),
  ninja: ch(2.2, 0.95, 1.0, [NJ.suit, '#7d82a1', NJ.dark], drawNinja, { lean: 0.16 }),
  snailor: ch(2.2, 1.25, 0.8, [SN.body, '#e0d3ea', SN.band], drawSnailor, { wl: 1.05 }),
  roo: ch(2.55, 1.05, 1.0, [RO.fur, RO.light, '#9c6f48'], drawRoo, { hop: 1.5, lean: 0.12, wl: 1.05 }),
  cacto: ch(2.15, 1.0, 1.1, [CA.green, '#b4d39f', CA.rib], drawCacto, { wl: 1.0 }),
  pogo: ch(2.5, 0.85, 1.15, [PG.helm, PG.skin, PG.pants], drawPogo, { hop: 1.5, lean: 0.06 }),
  briar: ch(2.15, 1.1, 1.0, [BR.leaf, BR.rose, BR.vein], drawBriar, { lean: 0.05, wl: 1.05 }),
  angler: ch(2.3, 0.95, 0.95, [AN.coat, AN.beard, AN.boot], drawAngler),
  sumo: ch(2.5, 1.25, 1.0, [SU.skin, '#f7dcc6', SU.hair], drawSumo, { lean: 0.04, wl: 1.1 }),
  rhino: ch(2.35, 1.05, 1.0, [RH.skin, RH.plate, '#7b7476'], drawRhino, { lean: 0.1, wl: 1.1 }),
  boulder: ch(2.15, 1.2, 1.05, [BO.rock, BO.moss, '#77736a'], drawBoulder, { lean: 0.04, wl: 1.15 }),
};

/**
 * The colours of each unit as [main, light, shade], for the pieces that fly off it (the shreds of a pop, a burst
 * of its colour). Both teams wear the same body; only the accent differs. Yours first, then the opponent's.
 */
export const PET_COLORS = Object.fromEntries(
  (Object.keys(CHARS) as PetType[]).map((p) => [p, [CHARS[p].colors, CHARS[p].colors] as const]),
) as Record<PetType, readonly [readonly [string, string, string], readonly [string, string, string]]>;

// ------------------------------------------------------------------ the contract

/** Below this radius the drawing is made at it and scaled down. */
const MIN_R = 5;

function drawPet(ctx: Ctx, look: PetLook, pose: PetPose, r: number): void {
  if (r < MIN_R) {
    if (!(r > 0)) return;
    ctx.save();
    ctx.scale(r / MIN_R, r / MIN_R);
    drawPetAt(ctx, look, pose, MIN_R);
    ctx.restore();
    return;
  }
  drawPetAt(ctx, look, pose, r);
}

function drawPetAt(ctx: Ctx, look: PetLook, pose: PetPose, r: number): void {
  if (pose.alpha <= 0.01 || r <= 0) return;
  D = CHARS[look.pet] ?? CHARS.sprout;
  const jumper = D.hop > 1;
  const t = pose.t;
  const mood = pose.mood;
  // a hop: a crouch as it leaves and lands, a stretch in the air
  const h = clamp(pose.hop, 0, 1.5);
  const crouch = h < 0.3 ? Math.sin((h / 0.3) * Math.PI) : 0;
  const air = smooth(clamp((h - 0.15) / 0.85, 0, 1));
  const amt = jumper ? 1 : 0.35;
  const br = mood === 'dead' || pose.stone > 0.5 ? 0 : Math.sin(t * 2.6 + look.seed) * 0.022;
  const hu = clamp(pose.hurt, 0, 1);
  const L = clamp(pose.limp, 0, 1);
  const p = clamp(pose.puff, 0, 1.5);
  const sx = pose.squashX * (1 + 0.18 * crouch * amt - 0.1 * air * amt - br * 0.5 + 0.1 * hu) * (1 - 0.22 * L);
  const sy = pose.squashY * (1 - 0.22 * crouch * amt + 0.2 * air * amt + br - 0.12 * hu) * (1 - 0.42 * L);
  let lift = h * r * D.hop;
  const big = look.weapon === 'bat' ? 1.4 : !look.weapon ? 1.2 : 1;
  let lean = (-0.2 * pose.wind + 0.24 * pose.strike) * big - 0.3 * hu;
  let dx = (0.3 * pose.strike - 0.14 * pose.wind) * big - 0.18 * hu;
  lean += jumper ? 0.12 * air - 0.05 * crouch : D.lean * pose.moving;
  if (mood === 'cheer') lift += Math.abs(Math.sin(t * 7 + look.seed)) * r * 0.35;
  else if (mood === 'scared') {
    dx += Math.sin(t * 47) * 0.035;
    lean -= 0.12;
  } else if (mood === 'dizzy') lean += Math.sin(t * 4.5) * 0.14;
  else if (mood === 'angry') lean += 0.06;
  if (pose.puff > 1.1) dx += Math.sin(t * 61) * 0.08 * (pose.puff - 1.1);

  // what the pictures of this frame are
  const rb = bucketOf(r);
  R.ctx = ctx;
  R.look = look;
  R.pose = pose;
  R.r = r;
  R.rb = rb;
  R.lw = clamp(1.25 / Math.pow(1.25, rb), 0.085, 0.16);
  R.pre = look.pet + look.team + (look.boss ? 'B' : '');
  R.t = t;
  R.seed = look.seed;
  R.ph = pose.walk / (r * 0.5);
  R.mv = clamp(pose.moving, 0, 1);
  R.wind = clamp(pose.wind, 0, 1);
  R.strike = clamp(pose.strike, 0, 1.2);
  R.aim = clamp(pose.aimY, -1, 1);
  R.cheer = mood === 'cheer' ? 1 : 0;
  R.hurt = hu;
  R.weapon = look.weapon;
  R.face = pickFace(look, pose);
  R.mouth = pickMouth(look, pose, R.face);
  R.sph = R.face === 'spiral' ? Math.floor(t * 9) % 4 : 0;
  R.fk = R.face + (R.sph || '') + R.mouth + (look.helmet ? 'h' : '');
  R.stoneA = clamp(pose.stone * 1.25, 0, 1);
  R.flashA = hu > 0.02 ? hu * 0.8 : 0;
  R.grey = pose.stone > 0.5;
  H2.on = false;

  ctx.save();
  if (pose.alpha < 1) ctx.globalAlpha *= pose.alpha;
  ctx.translate(0, -lift);
  ctx.scale(sx, sy);
  if (pose.spin) {
    ctx.translate(0, -r * D.mid);
    ctx.rotate(pose.spin);
    ctx.translate(0, r * D.mid);
  }
  ctx.scale(pose.face * r, r);
  // let down: it flops from side to side
  if (L > 0) ctx.transform(1, 0, (0.25 + Math.sin(t * 2.4 + look.seed) * 0.3) * L, 1, 0, 0);
  if (lean) ctx.rotate(lean);
  if (dx) ctx.translate(dx, 0);
  // blown up like a balloon: it swells round about its middle
  if (p > 0) {
    ctx.translate(0, -D.mid * 0.4);
    ctx.scale(1 + 0.45 * p, 1 + 0.3 * p);
    ctx.translate(0, D.mid * 0.4);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  D.draw(R);
  if (p > 0.2 || pose.stone > 0.25 || L > 0.3) marks(ctx, pose, p, L);
  ctx.restore();
}

/** Per-frame marks over the body: a balloon's gloss, stone cracks, the wrinkles of a let-down body. */
function marks(ctx: Ctx, pose: PetPose, p: number, L: number) {
  const m = -D.mid - D.hover;
  if (p > 0.2 && pose.stone < 0.5) {
    ctx.fillStyle = WHITE;
    ctx.globalAlpha *= 0.85;
    ellipse(ctx, -0.42, m - 0.5, 0.24, 0.1, -0.7);
    ctx.fill();
    ellipse(ctx, -0.66, m - 0.18, 0.06, 0.06);
    ctx.fill();
    ctx.globalAlpha /= 0.85;
  }
  ctx.beginPath();
  if (pose.stone > 0.25) {
    ctx.moveTo(-0.1, m - 0.75);
    ctx.lineTo(0.08, m - 0.35);
    ctx.lineTo(-0.15, m - 0.05);
    ctx.lineTo(0.05, m + 0.35);
    ctx.moveTo(0.08, m - 0.35);
    ctx.lineTo(0.38, m - 0.28);
    if (pose.stone > 0.6) {
      ctx.moveTo(-0.3, m - 1.15);
      ctx.lineTo(-0.42, m - 0.75);
      ctx.lineTo(-0.15, m - 0.5);
      ctx.moveTo(-0.15, m - 0.05);
      ctx.lineTo(-0.5, m + 0.15);
    }
  }
  if (L > 0.3) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.32;
      const y = m + (i % 2) * 0.25;
      ctx.moveTo(x - 0.12, y);
      ctx.quadraticCurveTo(x, y - 0.2, x + 0.12, y);
    }
  }
  ctx.lineWidth = R.lw * 1.1;
  ctx.strokeStyle = pose.stone > 0.25 ? STONE_INK : COLOR.ink;
  ctx.stroke();
}

/** the contact shadow's ink */
const SHADE = 'rgb(18, 26, 22)';

function drawShadow(ctx: Ctx, look: PetLook, r: number, lift: number): void {
  const d = CHARS[look.pet] ?? CHARS.sprout;
  const k = 1 / (1 + Math.max(0, lift + d.hover) * 0.7);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * (0.08 + 0.16 * k);
  const rx = r * d.shadow * k;
  const ry = r * 0.34 * k;
  ctx.fillStyle = SHADE;
  ellipse(ctx, r * 0.04, r * 0.02, rx, ry);
  ctx.fill();
  ellipse(ctx, r * 0.06, r * 0.03, rx * 0.62, ry * 0.6);
  ctx.fill();
  ctx.globalAlpha = a;
}

function snapshot(look: PetLook, pose: PetPose, r: number, scale: number) {
  // room for a blown-up body, a hop and a levelled spear on either side
  const w = Math.ceil(r * 9);
  const h = Math.ceil(r * 6.6);
  const ox = w / 2;
  const oy = Math.ceil(r * 5.4);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(ox, oy);
  drawPet(ctx, look, pose, r);
  return { canvas, ox, oy, w, h };
}

function headTop(look: PetLook, r: number): number {
  const d = CHARS[look.pet] ?? CHARS.sprout;
  return r * (d.top + d.hover + (look.helmet ? 0.25 : 0) + (look.boss ? 0.35 : 0));
}

export const petArt: PetArt = { drawPet, drawShadow, snapshot, headTop };
