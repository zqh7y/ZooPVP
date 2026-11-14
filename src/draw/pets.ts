import type { GearType, PetType, WeaponType } from '../types';
import type { PetArt, PetLook, PetPose } from './petTypes';
import { CLASS_FX, COLOR, TIER } from '../theme';
import { circle, clamp, ellipse, fillStroke, lerp, poly, smooth } from '../util';
import { cls, drawWeapon, glow, heat, rgba, sparkle, trimOf } from './weapons';
import { drawGear } from './gear';

/*
 * The two pets. Each is drawn from the side in "body units" (1 = its radius r) with its feet on the origin,
 * facing right; drawPet turns the pose into one transform (hop, squash, spin, lean) and a few numbers the
 * body is built from (puff, limp, wind, strike), so every pose is the same drawing bent a different way.
 *
 * Light: one key light from the floodlights at the upper left. Every round part is cel-shaded: its colour, a
 * soft shade band low on the right, a cool rim of light bounced up from the pitch along the lower right edge,
 * and a crisp gloss on the upper left. The parts that look the same every frame are kept as pictures.
 * Team reads from the body: yours are a deep navy ant and a steel-blue frog, the opponent's a deep crimson ant
 * and a brick-red frog. Class reads as material: plain, light marks (D, C), a steel band (B), gold (A),
 * more gold and a glow (S), white-gold armour and a halo (SSS).
 */
type Ctx = CanvasRenderingContext2D;

interface Pal {
  main: string;
  /** the soft step between lit and shade */
  mid: string;
  shade: string;
  /** the marks of D and C */
  light: string;
  /** the crisp gloss */
  spec: string;
  /** the cool bounce light along the lower right edge */
  rim: string;
  belly: string;
  bellyLo: string;
  limb: string;
  /** the far legs, a step darker: they are in the body's shadow */
  far: string;
  /** the outline */
  ink: string;
  /** inner lines, a little lighter than the outline */
  line: string;
  eye: string;
}

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

const RIM = '#c4d8ee';
const EYE = '#f3f0e8';
const PUPIL = '#141820';
function pal(main: string, shade: string, light: string, spec: string, limb: string): Pal {
  return {
    main,
    mid: mix(main, shade, 0.5),
    shade,
    light,
    spec,
    rim: mix(main, RIM, 0.42),
    belly: '#ebe4d4',
    bellyLo: '#c7bda9',
    limb,
    far: mix(limb, COLOR.ink, 0.3),
    ink: COLOR.ink,
    line: mix(COLOR.ink, shade, 0.45),
    eye: EYE,
  };
}
const BASE: Record<PetType, readonly [Pal, Pal]> = {
  ant: [pal('#2f5193', '#1c3468', '#5a80c4', '#dbe7ff', '#22396a'), pal('#a5303c', '#6c1b26', '#cd5965', '#ffe1dc', '#5a1922')],
  frog: [pal('#4a86c4', '#2d5d93', '#80b0e2', '#f0f6ff', '#2d5d93'), pal('#c25540', '#883427', '#e2806a', '#fff1ea', '#883427')],
};
const STONE: Pal = {
  main: '#9ca2aa',
  mid: '#868c95',
  shade: '#6f757e',
  light: '#b8bdc4',
  spec: '#e3e6ea',
  rim: '#b3bac3',
  belly: '#b4b9bf',
  bellyLo: '#8d939b',
  limb: '#5e646c',
  far: '#4c5259',
  ink: '#353a41',
  line: '#4f555d',
  eye: '#c3c8ce',
};
const KEYS = Object.keys(STONE) as (keyof Pal)[];
const WHITE = '#ffffff';
const MOUTH = '#3b1c22';
const TONGUE = '#d58a80';
const AO = 'rgba(8, 11, 18, 0.28)';
const HALO_SOFT = rgba(CLASS_FX.s, 0.32);

const PALS = new Map<string, Pal>();
/** The body colours right now: washed white while hurt, greyed while turning to stone. */
function palette(look: PetLook, pose: PetPose): Pal {
  const base = BASE[look.pet][look.team];
  const st = Math.round(clamp(pose.stone, 0, 1) * 5);
  const hu = Math.round(clamp(pose.hurt, 0, 1) * 4);
  if (!st && !hu) return base;
  const key = look.pet + look.team + (st ? 's' + st : 'h' + hu);
  let p = PALS.get(key);
  if (!p) {
    const k = st ? st / 5 : (hu / 4) * 0.8;
    const q = {} as Pal;
    for (const c of KEYS) q[c] = mix(base[c], st ? STONE[c] : WHITE, k);
    if (!st) q.ink = base.ink;
    p = q;
    PALS.set(key, p);
  }
  return p;
}

// ------------------------------------------------------------------ held and worn pieces, kept as pictures

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
      // turned to stone with its owner
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.82;
      g.fillStyle = STONE.main;
      g.fillRect(x, y, w, h);
    }
    s = { c, x, y, w, h, q };
    SPR.set(key, s);
  }
  return s;
}

/** Draws a weapon or a piece of gear at the origin, `units` body units long. Small ones come from a cached picture. */
function item(ctx: Ctx, kind: WeaponType | GearType, level: number, units: number, r: number, t: number, grey: boolean) {
  const px = units * r;
  if (px > 64 && !grey) {
    ctx.save();
    ctx.scale(1 / r, 1 / r);
    if (isWeapon(kind)) drawWeapon(ctx, kind, level, px, t);
    else drawGear(ctx, kind, level, px, t);
    ctx.restore();
    return;
  }
  const s = sprite(kind, level, px, grey);
  const f = px / s.q / r;
  ctx.drawImage(s.c, s.x * f, s.y * f, s.w * f, s.h * f);
}

const WLEN: Record<PetType, Record<WeaponType, number>> = {
  ant: { knife: 1.5, bat: 2.0, spear: 3.0, shield: 1.5 },
  frog: { knife: 1.25, bat: 1.75, spear: 2.7, shield: 1.35 },
};
/** how far up the weapon the hand grips it */
const GRIP: Record<WeaponType, number> = { knife: 0.12, bat: 0.1, spear: 0.3, shield: 0 };

/** Where the weapon hand is and how the weapon is turned (0 = upright, a quarter turn = levelled forward). */
const H = { x: 0, y: 0, a: 0, s: 1 };
function hold(w: WeaponType, bx: number, by: number, wind: number, sk: number, aim: number, cheer: number, t: number) {
  // the swing passes the hit and comes back: 1 at the hit, a little more just after
  const ft = sk < 0.7 ? 1.22 * smooth(sk / 0.7) : lerp(1.22, 1, (sk - 0.7) / 0.3);
  const m = Math.max(wind, sk);
  H.s = 1;
  if (w === 'knife') {
    // a quick jab
    H.a = lerp(0.45, 1.5 + aim * 0.5, m);
    H.x = bx - 0.34 * wind + 0.85 * sk;
    H.y = by - 0.14 * m + aim * 0.3 * sk;
  } else if (w === 'bat') {
    // wound up behind the back, then a full swing
    H.a = 0.3 - 2.5 * wind + (1.5 + aim * 0.4) * ft;
    H.x = bx - 0.55 * wind + 0.28 * ft;
    H.y = by - 0.55 * wind + 0.14 * ft;
  } else if (w === 'spear') {
    // levelled, drawn back, thrust
    H.a = lerp(0.5, 1.57 + aim * 0.45, Math.min(1, m * 1.6));
    H.x = bx - 0.15 - 0.5 * wind + 0.95 * sk;
    H.y = by - 0.12 * m + aim * 0.3 * sk;
  } else {
    // held in front, a shove
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

function heldWeapon(ctx: Ctx, look: PetLook, r: number, t: number, grey: boolean) {
  const w = look.weapon!;
  const len = WLEN[look.pet][w];
  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(H.a);
  if (H.s !== 1) ctx.scale(H.s, H.s);
  ctx.translate(0, GRIP[w] * len);
  item(ctx, w, look.weaponLevel || 1, len, r, t, grey);
  ctx.restore();
}

// ------------------------------------------------------------------ shared pieces

/** A round body part under the key light: shade low right with a soft edge, a cool rim, a crisp gloss, an outline. */
function blob(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, P: Pal, lw: number, det: boolean) {
  ellipse(c, x, y, rx, ry, rot);
  if (!det) {
    fillStroke(c, P.main, lw, P.ink);
    return;
  }
  c.fillStyle = P.shade;
  c.fill();
  // the lit part leans toward the light; two steps soften the edge of the shade
  ellipse(c, x - rx * 0.06, y - ry * 0.08, rx * 0.93, ry * 0.91, rot);
  c.fillStyle = P.mid;
  c.fill();
  ellipse(c, x - rx * 0.12, y - ry * 0.15, rx * 0.84, ry * 0.81, rot);
  c.fillStyle = P.main;
  c.fill();
  // the bounce from the pitch along the lower right edge
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx - lw * 1.25), Math.max(0.01, ry - lw * 1.25), rot, -0.1, 1.55);
  c.lineWidth = lw * 0.9;
  c.strokeStyle = P.rim;
  c.stroke();
  // the gloss
  ellipse(c, x - rx * 0.42, y - ry * 0.5, rx * 0.19, ry * 0.095, rot - 0.7);
  c.fillStyle = P.spec;
  c.fill();
  ellipse(c, x, y, rx, ry, rot);
  c.lineWidth = lw;
  c.strokeStyle = P.ink;
  c.stroke();
}

/**
 * An armour plate on the upper side of an oval part (angles a0..a1 of its outline, closed by a chord): the class
 * metal, a lit edge along the top, a darker strip along the chord.
 */
function plate(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, k: number, t: number, lw: number, P: Pal, stony: boolean) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, a0, a1);
  c.closePath();
  fillStroke(c, stony ? P.shade : trimOf(k, t), lw, P.ink);
  c.beginPath();
  c.ellipse(x, y, rx - lw * 1.5, ry - lw * 1.5, rot, a0 + 0.12, a0 + (a1 - a0) * 0.62);
  c.lineWidth = lw * 1.3;
  c.strokeStyle = stony ? P.light : TIER.metalLight[k];
  c.stroke();
  if (k === 3 && !stony) {
    // brushed steel: two fine lines along it
    c.beginPath();
    c.ellipse(x, y, rx * 0.86, ry * 0.86, rot, a0 + 0.2, a1 - 0.25);
    c.ellipse(x, y, rx * 0.76, ry * 0.76, rot, a1 - 0.25, a0 + 0.2, true);
    c.lineWidth = lw * 0.4;
    c.strokeStyle = TIER.tileDark[3];
    c.stroke();
  }
}

/** A band of the class metal across a round part, kept inside its outline (cx..: the arc it follows). */
function bandAcross(c: Ctx, ox: number, oy: number, orx: number, ory: number, rot: number, cx: number, cy: number, crx: number, cry: number, wd: number, k: number, t: number, lw: number, P: Pal, stony: boolean) {
  c.save();
  ellipse(c, ox, oy, orx, ory, rot);
  c.clip();
  c.beginPath();
  c.ellipse(cx, cy, crx, cry, rot, -1.6, 1.6);
  c.lineCap = 'butt';
  c.lineWidth = wd + lw * 2;
  c.strokeStyle = P.ink;
  c.stroke();
  c.lineWidth = wd;
  c.strokeStyle = stony ? P.shade : trimOf(k, t);
  c.stroke();
  c.beginPath();
  c.ellipse(cx - wd * 0.22, cy, crx, cry, rot, -1.6, -0.2);
  c.lineWidth = wd * 0.3;
  c.strokeStyle = stony ? P.light : TIER.metalLight[k];
  c.stroke();
  c.restore();
}

/** A thick limb: an ink line with a coloured line inside. */
function limb(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, fill: string, lw: number, ink: string) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = w + lw * 2;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = fill;
  ctx.stroke();
}

/** The SSS halo: a thin white-gold ring floating over the head, bobbing slowly, with a soft glow. */
function halo(ctx: Ctx, x: number, y: number, w: number, t: number, lw: number) {
  ellipse(ctx, x, y + Math.sin(t * 1.7) * 0.035, w, w * 0.27, -0.12);
  ctx.lineWidth = lw * 3.4;
  ctx.strokeStyle = HALO_SOFT;
  ctx.stroke();
  ctx.lineWidth = lw * 1.35;
  ctx.strokeStyle = CLASS_FX.sss;
  ctx.stroke();
}

type Face = 'open' | 'blink' | 'x' | 'pinch' | 'happy' | 'spiral' | 'wide' | 'stone' | 'droop';
function faceOf(look: PetLook, pose: PetPose): Face {
  if (pose.stone > 0.6) return 'stone';
  if (pose.mood === 'dead') return 'x';
  if (pose.hurt > 0.35 || pose.mood === 'hurt') return 'pinch';
  if (pose.mood === 'dizzy') return 'spiral';
  if (pose.mood === 'cheer') return 'happy';
  if (pose.mood === 'scared' || pose.puff > 0.25) return 'wide';
  if (pose.limp > 0.4) return 'droop';
  // a blink every few seconds, each fighter on its own beat
  if (pose.mood === 'idle' && !pose.wind && (pose.t + (((look.seed * 0.618) % 1) + 1) * 2.9) % 3.7 < 0.13) return 'blink';
  return 'open';
}

/** Where the eyes look: forward and along the aim while attacking (a few steps, so the pictures can be kept). */
function gazeOf(pose: PetPose) {
  const a = Math.max(pose.wind, pose.strike);
  return a > 0.05 ? Math.round(clamp(pose.aimY, -1, 1) * 2) / 2 : 0;
}

function eye(c: Ctx, x: number, y: number, rad: number, e: Face, P: Pal, lw: number, t: number, brow: boolean, hi: boolean, gy: number) {
  if (e === 'x' || e === 'pinch' || e === 'happy' || e === 'blink') {
    const s = rad * 0.75;
    c.lineWidth = Math.max(lw * 1.2, rad * 0.32);
    c.strokeStyle = P.ink;
    c.beginPath();
    if (e === 'x') {
      c.moveTo(x - s, y - s);
      c.lineTo(x + s, y + s);
      c.moveTo(x + s, y - s);
      c.lineTo(x - s, y + s);
    } else if (e === 'pinch') {
      c.moveTo(x - s, y - s);
      c.lineTo(x + s * 0.7, y);
      c.lineTo(x - s, y + s);
    } else if (e === 'happy') c.arc(x, y + s * 0.45, s, Math.PI * 1.1, Math.PI * 1.9);
    else {
      // shut: a lid line with a little droop
      c.moveTo(x - s, y);
      c.quadraticCurveTo(x, y + s * 0.35, x + s, y);
    }
    c.stroke();
    return;
  }
  const R = rad * (e === 'wide' ? 1.14 : 1);
  circle(c, x, y, R);
  c.fillStyle = P.eye;
  c.fill();
  if (hi && e !== 'stone') {
    // the white is round too: a little shade low right
    c.beginPath();
    c.arc(x, y, R * 0.8, -0.2, Math.PI * 0.75);
    c.lineWidth = R * 0.32;
    c.strokeStyle = mix(P.eye, '#9aa3b0', 0.45);
    c.stroke();
  }
  circle(c, x, y, R);
  c.lineWidth = lw * 0.9;
  c.strokeStyle = P.line;
  c.stroke();
  if (e === 'stone') return;
  if (e === 'spiral') {
    c.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = i * 0.95 - t * 8;
      const d = (R * 0.78 * i) / 12;
      if (i) c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      else c.moveTo(x, y);
    }
    c.lineWidth = Math.max(lw * 0.7, R * 0.16);
    c.strokeStyle = P.ink;
    c.stroke();
    return;
  }
  const pr = R * (e === 'wide' ? 0.3 : 0.52);
  const px = x + (e === 'wide' ? 0 : R * 0.3 + Math.abs(gy) * R * 0.06);
  const py = y + (e === 'droop' ? R * 0.3 : gy * R * 0.3);
  circle(c, px, py, pr);
  c.fillStyle = PUPIL;
  c.fill();
  if (hi) {
    // a crisp catch of the floodlight
    circle(c, px - pr * 0.32, py - pr * 0.38, pr * 0.36);
    c.fillStyle = WHITE;
    c.fill();
  }
  if (e === 'droop') {
    // a heavy lid
    c.beginPath();
    c.arc(x, y, R, Math.PI * 0.95, Math.PI * 0.05);
    c.closePath();
    fillStroke(c, P.shade, lw * 0.85, P.ink);
  }
  if (brow) {
    c.beginPath();
    c.moveTo(x - R * 1.1, y - R * 1.25);
    c.lineTo(x + R * 1.0, y - R * 0.3);
    c.lineWidth = Math.max(lw * 1.2, rad * 0.36);
    c.strokeStyle = P.ink;
    c.stroke();
  }
}

/** How hot a chili of a class makes its eater: one wisp of heat, two from A, three at SSS. */
const heatLines = (level: number) => (level >= 7 ? 3 : level >= 5 ? 2 : 1);

function shoe(ctx: Ctx, x: number, y: number, size: number, look: PetLook, r: number, t: number, grey: boolean) {
  ctx.save();
  ctx.translate(x, y - size * 0.42);
  item(ctx, 'sneakers', look.sneakers, size, r, t, grey);
  ctx.restore();
}

// ------------------------------------------------------------------ parts that look the same every frame

const PIECES = new Map<string, HTMLCanvasElement>();
/** The size a part's picture is made for: steps of about 10%, so a camera that scales fighters does not flood the cache. */
const bucket = (r: number) => Math.round(Math.log(Math.max(1, r)) * 10);
/**
 * Draws a part of a body through a cached picture of it. (x, y, w, h) is the part's box in body units when
 * the pet stands at rest; (dx, dy) is how far the part has moved from there this frame. rb is the size step.
 */
function piece(ctx: Ctx, key: string, rb: number, x: number, y: number, w: number, h: number, dx: number, dy: number, draw: (c: Ctx) => void) {
  let c = PIECES.get(key);
  if (!c) {
    if (PIECES.size > 500) PIECES.clear();
    c = document.createElement('canvas');
    const s = Math.exp(rb / 10) * SPR_SCALE;
    c.width = Math.ceil(w * s);
    c.height = Math.ceil(h * s);
    const g = c.getContext('2d')!;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.scale(s, s);
    g.translate(-x - dx, -y - dy);
    draw(g);
    PIECES.set(key, c);
  }
  ctx.drawImage(c, x + dx, y + dy, w, h);
}

// ------------------------------------------------------------------ the ant

const FEET = [0, 0, 0, 0, 0, 0, 0, 0];
const TIPS = [0, 0, 0, 0];
/** where the thorax and the head rest, so their cached pictures can be moved with them */
const ANT_TY = -0.72;
const ANT_HX = 0.02 + 0.66 * 0.8;
const ANT_HY = ANT_TY - 0.75 * 0.8;

function drawAnt(ctx: Ctx, look: PetLook, pose: PetPose, r: number, P: Pal, lw: number, lt: number) {
  const k = cls(look.level);
  const t = pose.t;
  const p = clamp(pose.puff, 0, 1.5);
  const L = clamp(pose.limp, 0, 1);
  const m = pose.moving;
  const q = Math.min(1, p * 1.6);
  const stony = pose.stone > 0.5;
  const e = faceOf(look, pose);
  const gy = gazeOf(pose);
  const angry = pose.mood === 'angry';
  // a plain frame at a fight size: the body and the head come from cached pictures
  const cached = r <= 26 && !p && !L && e !== 'spiral' && P === BASE.ant[look.team];
  const det = cached || r >= 12;
  const big = r >= 12;
  const w = look.weapon;
  const bw = w ? 0 : pose.wind;
  const bs = w ? 0 : pose.strike;
  const cheer = pose.mood === 'cheer' ? 1 : 0;
  const ph = pose.walk / (r * 0.55);

  // the parts: thorax (the ball it blows up into), abdomen behind, head in front
  const trx = 0.36 * (1 + 1.6 * p);
  const tryy = 0.33 * (1 + 1.75 * p);
  const tx = 0.02;
  const ty = lerp(ANT_TY, -0.16 - tryy, q) - Math.abs(Math.sin(ph)) * 0.05 * m;
  const ax = tx - Math.max(0.6, trx * 0.98);
  const ay = ty + 0.1 - 0.12 * q;
  const arx = 0.56 * (1 + 0.2 * p);
  const ary = 0.47 * (1 + 0.2 * p);
  const hd = Math.max(0.8, trx * 0.92);
  const hr = 0.57 * (1 + 0.24 * p);
  const hx = tx + 0.66 * hd - 0.16 * bw + 0.24 * bs;
  const hy = ty - 0.75 * hd - 0.06 * bw + 0.12 * bs + L * 0.45;

  if (k >= 5 && !stony) glow(ctx, -0.12, ty - 0.2, 1.75, 1.45, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);

  // one walking leg added to the current path; blown up, it sticks straight out of the ball
  const leg = (i: number, hip: number, foot: number, off: number, a: number) => {
    let x0 = tx + hip;
    let y0 = ty + 0.2;
    let x1 = foot * (1 + 0.35 * L) + Math.sin(ph + off) * 0.26 * m;
    let y1 = -Math.max(0, Math.cos(ph + off)) * 0.2 * m;
    if (q > 0) {
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      x0 = lerp(x0, tx + ux * trx, q);
      y0 = lerp(y0, ty + uy * tryy, q);
      x1 = lerp(x1, tx + ux * (trx + 0.3), q);
      y1 = lerp(y1, ty + uy * (tryy + 0.3), q);
    }
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2 + (foot < 0 ? -0.2 : 0.2) * (1 - q), (y0 + y1) / 2 - 0.22 * (1 - q), x1, y1);
    if (!q && big) ctx.lineTo(x1 + 0.13, y1);
    FEET[i * 2] = x1;
    FEET[i * 2 + 1] = y1;
  };
  ctx.beginPath();
  leg(0, -0.06, -0.3, Math.PI, 2.4);
  leg(1, 0.22, 0.7, 0, 0.75);

  // hands
  let two = true;
  let h2x = 0;
  let h2y = 0;
  if (w) {
    hold(w, tx + 0.76, ty - 0.04, pose.wind, pose.strike, pose.aimY, cheer, t);
    two = w === 'bat' || w === 'spear';
    const d = w === 'bat' ? -0.22 : 0.5;
    h2x = H.x - Math.sin(H.a) * d;
    h2y = H.y + Math.cos(H.a) * d;
  } else {
    H.x = tx + 0.6 - 0.25 * bw + 0.3 * bs;
    H.y = ty + 0.2 - 0.6 * bw - 0.05 * bs - 1.0 * cheer + Math.sin(t * 9) * 0.08 * cheer;
    h2x = H.x + 0.16;
    h2y = H.y - 0.1;
  }
  if (q > 0) {
    H.x = lerp(H.x, tx + (trx + 0.32) * 0.9, q);
    H.y = lerp(H.y, ty + (tryy + 0.32) * 0.42, q);
    h2x = lerp(h2x, tx + (trx + 0.3) * 0.98, q);
    h2y = lerp(h2y, ty - (tryy + 0.3) * 0.1, q);
  }
  const shx = lerp(tx + 0.2, tx + trx * 0.85, q);
  const shy = ty - 0.04 + 0.3 * tryy * q;
  // far legs and the far arm in one stroke, a step darker: they are in the body's shadow
  if (two || q > 0) {
    ctx.moveTo(shx + 0.08, shy - 0.04);
    ctx.quadraticCurveTo((shx + h2x) / 2, (shy + h2y) / 2 + 0.12, h2x, h2y);
  }
  ctx.lineWidth = lt * 1.3;
  ctx.strokeStyle = P.far;
  ctx.stroke();
  if (look.sneakers && big && !q) for (let i = 0; i < 2; i++) shoe(ctx, FEET[i * 2] + 0.07, FEET[i * 2 + 1], 0.52, look, r, t, stony);

  // abdomen and thorax, with the class on them
  const body = (c: Ctx) => {
    blob(c, ax, ay, arx, ary, -0.3, P, lw, det);
    if (k === 1 || k === 2) {
      // D and C: one or two clean stripes in a lighter tone of the shell
      c.save();
      ellipse(c, ax, ay, arx, ary, -0.3);
      c.clip();
      c.beginPath();
      c.ellipse(ax - arx * 0.3, ay + ary * 0.06, arx * 0.3, ary * 0.95, -0.3, -1.6, 1.6);
      if (k === 2) {
        c.moveTo(ax + arx * 0.28, ay - ary * 0.95);
        c.ellipse(ax + arx * 0.05, ay - ary * 0.02, arx * 0.3, ary * 0.95, -0.3, -1.6, 1.6);
      }
      c.lineWidth = lt * 1.5;
      c.strokeStyle = P.light;
      c.stroke();
      c.restore();
    } else if (k === 3 || k === 4) {
      // B: a brushed-steel band; A: a gold one
      bandAcross(c, ax, ay, arx, ary, -0.3, ax - arx * 0.12, ay + ary * 0.04, arx * 0.32, ary * 0.98, 0.17, k, t, lw, P, stony);
    } else if (k >= 5) {
      // S: a gold shell over the back; SSS: white-gold
      plate(c, ax, ay, arx * 1.03, ary * 1.05, -0.3, Math.PI * 1.0, Math.PI * 1.92, k, t, lw, P, stony);
    }
    blob(c, tx, ty, trx, tryy, 0, P, lw, det);
    if (k >= 5) plate(c, tx, ty, trx * 1.06, tryy * 1.08, 0, Math.PI * 1.02, Math.PI * 1.85, k, t, lw, P, stony);
    if (det && !q) {
      // where the head meets the thorax, a little shadow
      ellipse(c, tx + trx * 0.55, ty - tryy * 0.55, trx * 0.42, tryy * 0.36, 0.6);
      c.fillStyle = AO;
      c.fill();
    }
    if (p > 0.2) {
      // tight and shiny
      c.fillStyle = WHITE;
      ellipse(c, tx - trx * 0.42, ty - tryy * 0.45, trx * 0.3, tryy * 0.13, -0.7);
      c.fill();
      circle(c, tx - trx * 0.66, ty - tryy * 0.08, trx * 0.07);
      c.fill();
    }
  };
  const rb = bucket(r);
  if (cached) piece(ctx, `ab${look.team}${k}|${rb}`, rb, -1.55, -1.6, 2.1, 1.65, 0, ty - ANT_TY, body);
  else body(ctx);

  // near legs
  ctx.beginPath();
  leg(2, -0.2, -0.7, 0, 2.05);
  leg(3, 0.1, 0.34, Math.PI, 1.15);
  ctx.lineWidth = lt * 1.7;
  ctx.strokeStyle = P.limb;
  ctx.stroke();
  if (big) {
    // a thin sheen down the near legs: they are round too
    ctx.lineWidth = lt * 0.5;
    ctx.strokeStyle = P.mid;
    ctx.stroke();
  }
  if (look.sneakers && !q) for (let i = 2; i < 4; i++) shoe(ctx, FEET[i * 2] + 0.07, FEET[i * 2 + 1], 0.64, look, r, t, stony);

  // feelers: they wobble on their own and trail a beat behind the walk
  const sway = Math.sin(ph - 1.2) * 0.1 * m;
  const bob = Math.cos(ph * 2 - 1.0) * 0.05 * m;
  const aw = Math.sin(t * 2.3 + look.seed) * 0.05 + Math.sin(t * 5.3 + look.seed * 2) * 0.018 + sway - 0.3 * clamp(pose.hurt, 0, 1) - m * 0.16 - bw * 0.2 + bs * 0.24;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const x0 = hx - hr * 0.15 + i * hr * 0.4;
    const y0 = hy - hr * 0.85;
    TIPS[i * 2] = x0 + 0.4 + i * 0.1 + aw * (1 + i * 0.25) - L * 0.1;
    TIPS[i * 2 + 1] = y0 - 0.5 + i * 0.1 + L * 1.0 + bob - cheer * 0.08;
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 - 0.05 + aw * 0.35, y0 - 0.56 + L * 0.3, TIPS[i * 2], TIPS[i * 2 + 1]);
  }
  ctx.lineWidth = lt * 0.95;
  ctx.strokeStyle = P.limb;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    ctx.moveTo(TIPS[i * 2] + 0.08, TIPS[i * 2 + 1]);
    ctx.arc(TIPS[i * 2], TIPS[i * 2 + 1], 0.08, 0, Math.PI * 2);
  }
  ctx.fillStyle = k >= 3 && !stony ? trimOf(k, t, 1) : P.limb;
  ctx.fill();
  if (big) {
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = P.ink;
    ctx.stroke();
  }

  // jaws under the head
  const mo = 0.15 + 1.0 * bw - 0.15 * bs + (e === 'wide' ? 0.35 : 0);
  const mx = hx + hr * 0.6;
  const my = hy + hr * 0.62;
  const ua = 0.2 - mo * 0.75;
  const la = 0.85 + mo * 0.45;
  ctx.beginPath();
  ctx.moveTo(mx, my - 0.06);
  ctx.quadraticCurveTo(mx + 0.3 * Math.cos(ua - 0.5), my + 0.3 * Math.sin(ua - 0.5), mx + 0.4 * Math.cos(ua), my + 0.4 * Math.sin(ua));
  ctx.moveTo(mx - 0.1, my);
  ctx.quadraticCurveTo(mx + 0.22 * Math.cos(la + 0.5), my + 0.22 * Math.sin(la + 0.5), mx + 0.32 * Math.cos(la), my + 0.32 * Math.sin(la));
  ctx.lineWidth = lt * 1.4;
  ctx.strokeStyle = P.limb;
  if (k >= 4 && big && !stony) {
    // gold-tipped jaws from A
    ctx.lineWidth = lt * 1.4 + lw * 2;
    ctx.strokeStyle = P.ink;
    ctx.stroke();
    ctx.lineWidth = lt * 1.1;
    ctx.strokeStyle = trimOf(k, t);
  }
  ctx.stroke();

  // the head: crest (A and S) behind it, face, then a helmet or the SSS brow plate
  const head = (c: Ctx) => {
    if ((k === 4 || k === 5) && !look.helmet) {
      // a swept-back gold crest
      c.beginPath();
      c.moveTo(hx - hr * 0.7, hy - hr * 0.5);
      c.quadraticCurveTo(hx - hr * 0.62, hy - hr * (k === 5 ? 1.55 : 1.35), hx + hr * 0.12, hy - hr * (k === 5 ? 1.32 : 1.18));
      c.quadraticCurveTo(hx - hr * 0.2, hy - hr * 1.0, hx - hr * 0.1, hy - hr * 0.8);
      c.closePath();
      fillStroke(c, stony ? P.shade : trimOf(k, t), lw, P.ink);
      c.beginPath();
      c.moveTo(hx - hr * 0.6, hy - hr * 0.72);
      c.quadraticCurveTo(hx - hr * 0.56, hy - hr * (k === 5 ? 1.4 : 1.22), hx - hr * 0.05, hy - hr * (k === 5 ? 1.26 : 1.12));
      c.lineWidth = lw * 1.1;
      c.strokeStyle = stony ? P.light : TIER.metalLight[k];
      c.stroke();
    }
    blob(c, hx, hy, hr, hr * 0.96, 0, P, lw, det);
    if (k === 6 && !look.helmet) plate(c, hx, hy, hr * 1.04, hr, 0, Math.PI * 1.08, Math.PI * 1.62, k, t, lw, P, stony);
    const fierce = (k >= 5 || angry) && e === 'open';
    const es = 1 + 0.3 * p;
    eye(c, hx + hr * 0.76, hy - hr * 0.12, hr * 0.2 * es, e, P, lw, t, fierce, det, gy);
    eye(c, hx + hr * 0.2, hy - hr * 0.02, hr * 0.39 * es, e, P, lw, t, fierce, det, gy);
    if (e === 'x' || e === 'pinch' || e === 'happy' || e === 'wide') {
      circle(c, hx + hr * 0.56, hy + hr * 0.52, hr * (e === 'happy' ? 0.2 : 0.14));
      c.fillStyle = stony ? P.shade : MOUTH;
      c.fill();
      if (e === 'x') {
        ellipse(c, hx + hr * 0.62, hy + hr * 0.74, hr * 0.13, hr * 0.24, -0.2);
        fillStroke(c, TONGUE, lw * 0.7, P.ink);
      }
    } else if (det) {
      c.beginPath();
      if (angry) c.arc(hx + hr * 0.56, hy + hr * 0.64, hr * 0.16, Math.PI * 1.15, Math.PI * 1.85);
      else c.arc(hx + hr * 0.54, hy + hr * 0.4, hr * 0.15, Math.PI * 0.1, Math.PI * 0.8);
      c.lineWidth = lw * 0.9;
      c.strokeStyle = P.ink;
      c.stroke();
    }
    if (look.helmet) {
      c.save();
      c.translate(hx - hr * 0.06, hy - hr * 0.62);
      c.rotate(-0.14);
      item(c, 'helmet', look.helmet, hr * 2.75, r, t, stony);
      c.restore();
    }
  };
  if (cached) piece(ctx, `ah${look.team}${k}|${look.helmet}|${e}${angry ? 1 : 0}${gy}|${rb}`, rb, ANT_HX - 1.0, ANT_HY - 1.35, 1.9, 2.2, hx - ANT_HX, hy - ANT_HY, head);
  else head(ctx);
  if (look.chili && !stony) heat(ctx, hx - hr * 0.1, hy - hr * 1.0, 1.1, t, lt * 0.75, heatLines(look.chili));

  // weapon, then the near arm over its grip
  if (w && w !== 'shield') heldWeapon(ctx, look, r, t, stony);
  ctx.beginPath();
  ctx.moveTo(shx, shy);
  ctx.quadraticCurveTo((shx + H.x) / 2 - 0.05, (shy + H.y) / 2 + 0.16, H.x, H.y);
  ctx.lineWidth = lt * 1.7;
  ctx.strokeStyle = P.limb;
  ctx.stroke();
  circle(ctx, H.x, H.y, 0.12);
  ctx.fillStyle = P.limb;
  ctx.fill();
  if (w === 'shield') heldWeapon(ctx, look, r, t, stony);

  if (k === 6 && !stony) {
    if (!look.helmet) halo(ctx, hx - hr * 0.12, hy - hr * 1.38, hr * 0.62, t, lw);
    // a slow glint runs over the white-gold
    const g = (t * 0.35 + look.seed * 0.13) % 1;
    sparkle(ctx, ax - arx * 0.6 + g * arx * 1.0, ay - ary * 0.92 + Math.abs(g - 0.5) * ary * 0.5, 0.32, t, look.seed);
  }
  if (pose.stone > 0.25 || L > 0.3) marks(ctx, pose, lw, P, ax, ay, arx, ary, hx, hy, hr);
}

/** Cracks while turning to stone, wrinkles while let down. (ax, ay) is the big part, (hx, hy) the head. */
function marks(ctx: Ctx, pose: PetPose, lw: number, P: Pal, ax: number, ay: number, arx: number, ary: number, hx: number, hy: number, hr: number) {
  ctx.beginPath();
  if (pose.stone > 0.25) {
    ctx.moveTo(ax - arx * 0.15, ay - ary * 0.96);
    ctx.lineTo(ax + arx * 0.1, ay - ary * 0.4);
    ctx.lineTo(ax - arx * 0.2, ay - ary * 0.05);
    ctx.lineTo(ax + arx * 0.05, ay + ary * 0.45);
    ctx.moveTo(ax + arx * 0.1, ay - ary * 0.4);
    ctx.lineTo(ax + arx * 0.45, ay - ary * 0.3);
    if (pose.stone > 0.6) {
      ctx.moveTo(hx - hr * 0.3, hy - hr * 0.95);
      ctx.lineTo(hx - hr * 0.45, hy - hr * 0.35);
      ctx.lineTo(hx - hr * 0.1, hy + hr * 0.05);
      ctx.moveTo(ax - arx * 0.2, ay - ary * 0.05);
      ctx.lineTo(ax - arx * 0.6, ay + ary * 0.2);
    }
  }
  if (pose.limp > 0.3) {
    for (let i = 0; i < 3; i++) {
      const x = ax + (i - 1) * arx * 0.42;
      ctx.moveTo(x - arx * 0.14, ay - ary * 0.1 + (i % 2) * ary * 0.3);
      ctx.quadraticCurveTo(x, ay - ary * 0.36 + (i % 2) * ary * 0.3, x + arx * 0.14, ay - ary * 0.1 + (i % 2) * ary * 0.3);
    }
  }
  ctx.lineWidth = lw * 1.05;
  ctx.strokeStyle = P.ink;
  ctx.stroke();
}

// ------------------------------------------------------------------ the frog

function drawFrog(ctx: Ctx, look: PetLook, pose: PetPose, r: number, P: Pal, lw: number, lt: number) {
  const k = cls(look.level);
  const t = pose.t;
  const p = clamp(pose.puff, 0, 1.5);
  const L = clamp(pose.limp, 0, 1);
  const q = Math.min(1, p * 1.6);
  const stony = pose.stone > 0.5;
  const e = faceOf(look, pose);
  const gy = gazeOf(pose);
  const angry = pose.mood === 'angry';
  const w = look.weapon;
  const tw = w ? 0 : pose.wind;
  const ts = w ? 0 : pose.strike;
  // a plain frame at a fight size: the whole trunk comes from one cached picture
  const cached = r <= 26 && !p && !L && e !== 'spiral' && P === BASE.frog[look.team];
  // at fight sizes the wind-up goes in four steps, so each step's picture can be kept
  const twv = r <= 26 ? Math.round(tw * 4) / 4 : tw;
  const det = cached || r >= 11;
  const cheer = pose.mood === 'cheer' ? 1 : 0;
  const air = smooth(clamp((clamp(pose.hop, 0, 1) - 0.15) / 0.85, 0, 1));

  const brx = 0.98 * (1 + 0.5 * p);
  const bry = 0.86 * (1 + 0.65 * p);
  const bx = 0;
  const by = -bry - 0.04;
  const at = (a: number, s: number, o: number[]) => {
    o[0] = bx + Math.cos(a) * brx * s;
    o[1] = by + Math.sin(a) * bry * s;
  };
  const es = 1 + 0.25 * p;
  const dnx = bx + 0.2 * brx;
  const dny = by - bry * 0.84 + L * 0.2;
  const dfx = bx + 0.74 * brx;
  const dfy = by - bry * 0.7 + L * 0.25;
  const m0x = bx + 0.1 * brx;
  const m1x = bx + 0.96 * brx;
  const my = by - 0.26 * bry;
  const mmx = (m0x + m1x) / 2 + 0.1;

  if (k >= 5 && !stony) glow(ctx, 0, by, brx * 1.65, bry * 1.7, k === 6 ? CLASS_FX.sss : CLASS_FX.s, t);
  // far foot peeking out in front
  if (!q) limb(ctx, 0.2, -0.07 + air * 0.3, 0.52 - air * 0.3, -0.07 + air * 0.5, 0.16, P.shade, lw, P.ink);

  const body = (c: Ctx) => {
    // eye domes: the far one stays behind the head, the near one is joined to it below
    const fierce = (k >= 5 || angry) && e === 'open';
    circle(c, dfx, dfy, 0.27 * es);
    fillStroke(c, P.mid, lw, P.ink);
    eye(c, dfx + 0.05, dfy - 0.03, 0.17 * es, e, P, lw, t, fierce, det, gy);
    circle(c, dnx, dny, 0.34 * es);
    fillStroke(c, P.main, lw, P.ink);

    blob(c, bx, by, brx, bry, 0, P, lw, det);
    // belly: cream, round, it swells as the tongue winds up
    const bex = bx + 0.22 * brx;
    const bey = by + 0.24 * bry;
    const berx = brx * (0.6 + 0.06 * twv);
    const bery = bry * (0.6 + 0.06 * twv);
    c.save();
    ellipse(c, bx, by, brx - lw * 0.5, bry - lw * 0.5);
    c.clip();
    ellipse(c, bex, bey, berx, bery);
    c.fillStyle = det ? P.bellyLo : P.belly;
    c.fill();
    if (det) {
      ellipse(c, bex - berx * 0.1, bey - bery * 0.14, berx * 0.86, bery * 0.82);
      c.fillStyle = P.belly;
      c.fill();
    }
    // the hip, where the thigh sits on the body, in a little shadow
    if (det && !q) {
      ellipse(c, -0.5, -0.46, 0.46, 0.3, -0.35);
      c.fillStyle = AO;
      c.fill();
    }
    c.restore();
    if (k === 1 || k === 2) {
      // D and C: clean marks in a lighter tone of the skin
      c.fillStyle = P.light;
      circle(c, bx - 0.52 * brx, by - 0.4 * bry, 0.11);
      c.fill();
      circle(c, bx - 0.72 * brx, by - 0.04 * bry, 0.075);
      c.fill();
      if (k === 2) {
        circle(c, bx - 0.24 * brx, by - 0.66 * bry, 0.08);
        c.fill();
        circle(c, bx - 0.36 * brx, by - 0.14 * bry, 0.06);
        c.fill();
      }
    }
    if (p > 0.2) {
      c.fillStyle = WHITE;
      ellipse(c, bx - brx * 0.45, by - bry * 0.5, brx * 0.26, bry * 0.11, -0.7);
      c.fill();
      circle(c, bx - brx * 0.7, by - bry * 0.14, brx * 0.06);
      c.fill();
    }
    // a shell plate on the back from B: steel, gold, white-gold
    if (k >= 3) plate(c, bx, by, brx * 1.03, bry * 1.03, 0, Math.PI * (k >= 5 ? 0.86 : 0.9), Math.PI * (k >= 5 ? 1.46 : 1.42), k, t, lw, P, stony);
    ellipse(c, bx, by, brx, bry);
    c.lineWidth = lw;
    c.strokeStyle = P.ink;
    c.stroke();

    if (look.helmet) {
      c.save();
      c.translate(bx - 0.2 * brx, by - bry * 0.98 + L * 0.2);
      c.rotate(-0.16);
      item(c, 'helmet', look.helmet, 1.5, r, t, stony);
      c.restore();
    }

    // the near eye, joined to the head
    circle(c, dnx, dny, 0.34 * es - lw * 0.5);
    c.fillStyle = P.main;
    c.fill();
    if (det) {
      c.beginPath();
      c.arc(dnx, dny, 0.34 * es - lw * 1.3, Math.PI * 1.1, Math.PI * 1.55);
      c.lineWidth = lw * 0.9;
      c.strokeStyle = P.spec;
      c.stroke();
    }
    eye(c, dnx + 0.05, dny - 0.02, 0.24 * es, e, P, lw, t, fierce, det, gy);

    // mouth: a wide line that opens into a maw
    let open = twv * 0.7 + (ts > 0.02 ? 0.45 : 0);
    if (e === 'happy') open = 0.5;
    else if (e === 'pinch' || e === 'x') open = 0.35;
    else if (e === 'wide' && !q) open = 0.3;
    c.beginPath();
    c.moveTo(m0x, my);
    if (open > 0.02) {
      c.quadraticCurveTo(mmx, my + 0.14 + open * 0.75, m1x, my - 0.02);
      c.quadraticCurveTo(mmx, my - 0.05 - open * 0.1, m0x, my);
      fillStroke(c, stony ? P.shade : MOUTH, lw, P.ink);
      if (e === 'x') {
        ellipse(c, mmx + 0.12, my + 0.34, 0.15, 0.3, -0.15);
        fillStroke(c, stony ? P.light : TONGUE, lw * 0.8, P.ink);
      }
    } else {
      c.quadraticCurveTo(mmx, my + (angry || k >= 5 ? -0.06 : q ? 0 : 0.2), m1x, my - 0.02);
      c.lineWidth = lw * 1.25;
      c.strokeStyle = P.ink;
      c.stroke();
    }
    // nostril
    circle(c, bx + 0.84 * brx, by - 0.45 * bry, 0.032);
    c.fillStyle = P.ink;
    c.fill();
  };
  const rb = bucket(r);
  if (cached) piece(ctx, `f${look.team}${k}|${look.helmet}|${e}${angry ? 1 : 0}${twv * 4}${ts > 0.02 ? 1 : 0}${gy}|${rb}`, rb, -1.7, -2.8, 3.4, 3.35, 0, 0, body);
  else body(ctx);

  // the throat pulses while it sits and breathes
  if (det && !q && !L && air < 0.05 && !tw && !ts && !stony && (pose.mood === 'idle' || pose.mood === 'scared')) {
    const th = Math.pow(Math.max(0, Math.sin(t * 2.1 + look.seed * 1.7)), 3) * (pose.mood === 'scared' ? 1.3 : 1);
    if (th > 0.06) {
      const sx = bx + 0.74 * brx + 0.03 * th;
      const sy = by + 0.1 + 0.04 * th;
      ellipse(ctx, sx, sy, 0.09 + 0.09 * th, 0.07 + 0.08 * th, 0.3);
      fillStroke(ctx, P.belly, lw * 0.8, P.line);
      ellipse(ctx, sx - 0.05 * th, sy - 0.04 * th, 0.04 * th, 0.02 * th, -0.4);
      ctx.fillStyle = WHITE;
      ctx.fill();
    }
  }

  // near hind leg: folded when sitting, trailing in the air, a stub on a blown-up body
  let thx = lerp(-0.52, -0.78, air);
  let thy = lerp(-0.4, -0.16, air);
  const thr = lerp(-0.35, -1.0, air);
  let f0x = lerp(-0.66, -0.9, air);
  let f0y = lerp(-0.08, 0.1, air);
  let f1x = lerp(0.04, -1.1, air) - L * 0.3;
  let f1y = lerp(-0.08, 0.52, air);
  const ls = 1 - 0.35 * q;
  if (q > 0) {
    const ux = Math.cos(2.5);
    const uy = Math.sin(2.5);
    const cx = bx + ux * brx * 0.95;
    const cy = by + uy * bry * 0.95;
    thx = lerp(thx, cx, q);
    thy = lerp(thy, cy, q);
    f0x = lerp(f0x, cx + ux * 0.2, q);
    f0y = lerp(f0y, cy + uy * 0.2, q);
    f1x = lerp(f1x, cx + ux * 0.6, q);
    f1y = lerp(f1y, cy + uy * 0.6, q);
  }
  limb(ctx, f0x, f0y, f1x, f1y, 0.2 * ls, P.mid, lw, P.ink);
  const thigh = (c: Ctx) => {
    blob(c, 0, 0, 0.5 * ls, 0.36 * ls, 0, P, lw, det);
    if (k >= 5) plate(c, 0, 0, 0.52 * ls, 0.38 * ls, 0, Math.PI * 1.0, Math.PI * 1.7, k, t, lw, P, stony);
  };
  ctx.save();
  ctx.translate(thx, thy);
  ctx.rotate(thr);
  if (cached) piece(ctx, `ft${look.team}${k}|${rb}`, rb, -0.68, -0.54, 1.36, 1.08, 0, 0, thigh);
  else thigh(ctx);
  ctx.restore();
  if (look.sneakers && !q) shoe(ctx, f1x - 0.12, f1y + 0.04, 0.82, look, r, t, stony);

  if (look.chili && !stony) heat(ctx, bx + 0.3 * brx, by - bry * 1.12, 1.15, t, lt * 0.75, heatLines(look.chili));

  // the tongue lashes out
  if (ts > 0.02) {
    const len = 2.3 * Math.pow(ts, 0.6);
    const a = pose.aimY * 0.6;
    const ex = m1x - 0.1 + Math.cos(a) * len;
    const ey = my + 0.12 + Math.sin(a) * len;
    limb(ctx, m1x - 0.2, my + 0.12, ex, ey, 0.17, stony ? P.light : TONGUE, lw, P.ink);
    circle(ctx, ex, ey, 0.17);
    fillStroke(ctx, stony ? P.light : TONGUE, lw, P.ink);
  }

  // arm and weapon
  let sx = bx + 0.42 * brx;
  let sy = by + 0.3 * bry;
  if (w) hold(w, bx + 0.96, by + 0.26, pose.wind, pose.strike, pose.aimY, cheer, t);
  else {
    H.x = 0.5 + 0.3 * air + 0.4 * cheer - 0.1 * tw;
    H.y = -0.1 + 0.2 * air - 1.25 * cheer + Math.sin(t * 9) * 0.08 * cheer;
  }
  if (q > 0) {
    at(0.6, 1, TIPS);
    sx = lerp(sx, TIPS[0], q);
    sy = lerp(sy, TIPS[1], q);
    H.x = lerp(H.x, TIPS[0] + 0.32, q);
    H.y = lerp(H.y, TIPS[1] + 0.2, q);
  }
  if (w && w !== 'shield') heldWeapon(ctx, look, r, t, stony);
  limb(ctx, sx, sy, H.x, H.y, 0.18 * ls, P.main, lw, P.ink);
  if (w || q || cheer || air > 0.1) circle(ctx, H.x, H.y, 0.15 * ls);
  else ellipse(ctx, H.x + 0.08, H.y + 0.02, 0.22, 0.11);
  fillStroke(ctx, P.main, lw, P.ink);
  if (w === 'shield') heldWeapon(ctx, look, r, t, stony);

  if (k === 6 && !stony) {
    if (!look.helmet) halo(ctx, bx + 0.05 * brx, by - bry * 1.42, 0.5, t, lw);
    const g = (t * 0.35 + look.seed * 0.13) % 1;
    sparkle(ctx, bx - brx * (0.9 - g * 0.5), by - bry * (0.35 + g * 0.5), 0.3, t, look.seed);
  }
  if (pose.stone > 0.25 || L > 0.3) marks(ctx, pose, lw, P, bx - 0.1, by, brx * 0.9, bry * 0.9, dnx, dny, 0.34);
}

// ------------------------------------------------------------------ the contract

function drawPet(ctx: Ctx, look: PetLook, pose: PetPose, r: number): void {
  if (pose.alpha <= 0.01 || r <= 0) return;
  const frog = look.pet === 'frog';
  const t = pose.t;
  const mood = pose.mood;
  // a hop: a crouch as it leaves and lands, a stretch in the air
  const h = clamp(pose.hop, 0, 1.5);
  const crouch = h < 0.3 ? Math.sin((h / 0.3) * Math.PI) : 0;
  const air = smooth(clamp((h - 0.15) / 0.85, 0, 1));
  const amt = frog ? 1 : 0.35;
  const br = mood === 'dead' || pose.stone > 0.5 ? 0 : Math.sin(t * 2.6 + look.seed) * 0.022;
  const hu = clamp(pose.hurt, 0, 1);
  const L = clamp(pose.limp, 0, 1);
  const sx = pose.squashX * (1 + 0.18 * crouch * amt - 0.1 * air * amt - br * 0.5 + 0.1 * hu) * (1 - 0.22 * L);
  const sy = pose.squashY * (1 - 0.22 * crouch * amt + 0.2 * air * amt + br - 0.12 * hu) * (1 - 0.42 * L);
  let lift = h * r * (frog ? 1.5 : 0.8);
  const big = look.weapon === 'bat' ? 1.4 : !look.weapon ? 1.2 : 1;
  let lean = (-0.2 * pose.wind + 0.24 * pose.strike) * big - 0.3 * hu;
  let dx = (0.3 * pose.strike - 0.14 * pose.wind) * big - 0.18 * hu;
  // a little lean into the walk, and forward through the air on a hop
  lean += frog ? 0.12 * air - 0.05 * crouch : 0.07 * pose.moving;
  if (mood === 'cheer') lift += Math.abs(Math.sin(t * 7 + look.seed)) * r * 0.35;
  else if (mood === 'scared') {
    dx += Math.sin(t * 47) * 0.035;
    lean -= 0.12;
  } else if (mood === 'dizzy') lean += Math.sin(t * 4.5) * 0.14;
  else if (mood === 'angry') lean += 0.06;
  // about to burst: it shakes
  if (pose.puff > 1.1) dx += Math.sin(t * 61) * 0.08 * (pose.puff - 1.1);
  ctx.save();
  if (pose.alpha < 1) ctx.globalAlpha *= pose.alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.translate(0, -lift);
  ctx.scale(sx, sy);
  if (pose.spin) {
    ctx.translate(0, -r);
    ctx.rotate(pose.spin);
    ctx.translate(0, r);
  }
  ctx.scale(pose.face * r, r);
  // let down: it flops from side to side
  if (L > 0) ctx.transform(1, 0, (0.25 + Math.sin(t * 2.4 + look.seed) * 0.3) * L, 1, 0, 0);
  if (lean) ctx.rotate(lean);
  if (dx) ctx.translate(dx, 0);
  // outlines a little thinner than limbs used to be; limbs keep their weight
  const lt = Math.max(1.2 / r, 0.1);
  const lw = Math.max(0.85 / r, 0.07);
  const P = palette(look, pose);
  if (frog) drawFrog(ctx, look, pose, r, P, lw, lt);
  else drawAnt(ctx, look, pose, r, P, lw, lt);
  ctx.restore();
}

let SHADOW: HTMLCanvasElement | null = null;
/** The contact shadow, made once: a soft dark oval with a darker core. */
function shadowPic(): HTMLCanvasElement {
  if (!SHADOW) {
    SHADOW = document.createElement('canvas');
    SHADOW.width = 96;
    SHADOW.height = 32;
    const g = SHADOW.getContext('2d')!;
    g.scale(1, 32 / 96);
    const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, 'rgba(6, 10, 14, 0.62)');
    gr.addColorStop(0.32, 'rgba(6, 10, 14, 0.46)');
    gr.addColorStop(0.7, 'rgba(6, 10, 14, 0.2)');
    gr.addColorStop(1, 'rgba(6, 10, 14, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 96, 96);
  }
  return SHADOW;
}

function drawShadow(ctx: Ctx, look: PetLook, r: number, lift: number): void {
  const k = 1 / (1 + Math.max(0, lift) * 0.7);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * (0.35 + 0.65 * k);
  const rx = r * (look.pet === 'frog' ? 1.2 : 1.12) * k;
  const ry = r * 0.36 * k;
  // a touch to the lower right, away from the floodlights
  ctx.drawImage(shadowPic(), -rx + r * 0.08, -ry + r * 0.03, rx * 2, ry * 2);
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
  const top = look.pet === 'frog' ? 2.0 : 2.4;
  return r * (top + (look.helmet ? 0.3 : look.level >= 7 ? 0.25 : 0));
}

export const petArt: PetArt = { drawPet, drawShadow, snapshot, headTop };
