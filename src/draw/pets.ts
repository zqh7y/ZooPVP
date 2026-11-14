import type { GearType, PetType, WeaponType } from '../types';
import type { PetArt, PetLook, PetPose } from './petTypes';
import { CLASS_FX, COLOR, RAINBOW, TEAM } from '../theme';
import { circle, clamp, ellipse, fillStroke, lerp, poly, smooth } from '../util';
import { cls, drawWeapon, flame, glow, sparkle, trimOf } from './weapons';
import { drawGear } from './gear';

/*
 * The two pets. Each is drawn from the side in "body units" (1 = its radius r) with its feet on the origin,
 * facing right; drawPet turns the pose into one transform (hop, squash, spin, lean) and a few numbers the
 * body is built from (puff, limp, wind, strike), so every pose is the same drawing bent a different way.
 * Team reads from the body colour: your ants are dark blue and your frogs teal, the opponent's ants are
 * fire red and its frogs tomato orange. The ant also wears a scarf and the frog a belt in the team colour.
 */
type Ctx = CanvasRenderingContext2D;

interface Pal {
  main: string;
  shade: string;
  light: string;
  belly: string;
  limb: string;
  ink: string;
}

const BASE: Record<PetType, readonly [Pal, Pal]> = {
  ant: [
    { main: '#3a5fd6', shade: '#27409e', light: '#86a6ff', belly: '#a5d6ff', limb: '#1a2562', ink: COLOR.ink },
    { main: '#f04a30', shade: '#b82c22', light: '#ffa184', belly: '#ffd0b8', limb: '#6a1414', ink: COLOR.ink },
  ],
  frog: [
    { main: '#25b9cf', shade: '#1787a6', light: '#9cf0fa', belly: '#e8fcff', limb: '#1787a6', ink: COLOR.ink },
    { main: '#ff8038', shade: '#d6541f', light: '#ffc994', belly: '#fff1d6', limb: '#d6541f', ink: COLOR.ink },
  ],
};
const STONE: Pal = { main: '#aaa5b5', shade: '#857f93', light: '#d2cedb', belly: '#c2bdcc', limb: '#6f697c', ink: '#4a4356' };
const WHITE = '#ffffff';
/** armour by class index (B, A, S, SSS) */
const PLATE = ['', '', '', '#c9cfd9', '#ffc93c', '#b3162f', '#fff6ff'];
/** the halo of an S and an SSS pet */
const AURA = ['', '', '', '', '', '#ff9db0', '#ffb8f4'];
const TONGUE = '#ff7fa3';
const MOUTH = '#7a1f3a';

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
function mix(a: string, b: string, k: number) {
  const x = rgb(a);
  const y = rgb(b);
  return `rgb(${Math.round(lerp(x[0], y[0], k))},${Math.round(lerp(x[1], y[1], k))},${Math.round(lerp(x[2], y[2], k))})`;
}

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
    const to = (c: keyof Pal) => mix(base[c], st ? STONE[c] : WHITE, k);
    p = { main: to('main'), shade: to('shade'), light: to('light'), belly: to('belly'), limb: to('limb'), ink: st ? to('ink') : base.ink };
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

/** A rounded body part: one shade low on the far side, one gloss up top, an ink outline. */
function blob(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, P: Pal, lw: number, hi: boolean) {
  ellipse(ctx, x, y, rx, ry, rot);
  if (!hi) {
    fillStroke(ctx, P.main, lw, P.ink);
    return;
  }
  ctx.fillStyle = P.shade;
  ctx.fill();
  ellipse(ctx, x - rx * 0.09, y - ry * 0.13, rx * 0.84, ry * 0.8, rot);
  ctx.fillStyle = P.main;
  ctx.fill();
  ellipse(ctx, x - rx * 0.36, y - ry * 0.5, rx * 0.25, ry * 0.13, rot - 0.6);
  ctx.fillStyle = P.light;
  ctx.fill();
  ellipse(ctx, x, y, rx, ry, rot);
  ctx.lineWidth = lw;
  ctx.strokeStyle = P.ink;
  ctx.stroke();
}

/** An armour plate hugging one side of an oval part: a band of trim under a plate. */
function plate(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, fill: string, trim: string, lw: number, ink: string) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, a0, a1);
  ctx.closePath();
  fillStroke(ctx, trim, lw, ink);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, a0 + 0.3, a1 - 0.3);
  ctx.closePath();
  fillStroke(ctx, fill, lw * 0.8, ink);
}

function spike(ctx: Ctx, x: number, y: number, a: number, w: number, len: number, fill: string, lw: number, ink: string) {
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  poly(ctx, [x - cy * w, y + cx * w, x + cx * len, y + cy * len, x + cy * w, y - cx * w]);
  fillStroke(ctx, fill, lw, ink);
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

function crown(ctx: Ctx, x: number, y: number, w: number, rot: number, lw: number, t: number, ink: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const h = w * 0.5;
  poly(ctx, [-h, 0, -h * 1.1, -w * 0.6, -h * 0.45, -w * 0.3, 0, -w * 0.78, h * 0.45, -w * 0.3, h * 1.1, -w * 0.6, h, 0]);
  fillStroke(ctx, COLOR.gold, lw, ink);
  ctx.fillStyle = COLOR.goldDark;
  ctx.fillRect(-h + lw * 0.5, -w * 0.14, w - lw, w * 0.1);
  for (let i = 0; i < 3; i++) {
    circle(ctx, (i - 1) * h * 1.1, i === 1 ? -w * 0.78 : -w * 0.6, w * 0.09);
    fillStroke(ctx, RAINBOW[(i * 2 + Math.floor(t * 4)) % 5], lw * 0.6, ink);
  }
  ctx.restore();
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
  if (pose.mood === 'idle' && (pose.t * 0.9 + Math.abs(look.seed) * 0.37) % 3 < 0.11) return 'blink';
  return 'open';
}

function eye(ctx: Ctx, x: number, y: number, rad: number, e: Face, P: Pal, lw: number, t: number, brow: boolean, hi: boolean) {
  if (e === 'x' || e === 'pinch' || e === 'happy' || e === 'blink') {
    const s = rad * 0.75;
    ctx.lineWidth = Math.max(lw, rad * 0.36);
    ctx.strokeStyle = P.ink;
    ctx.beginPath();
    if (e === 'x') {
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
    } else if (e === 'pinch') {
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s * 0.7, y);
      ctx.lineTo(x - s, y + s);
    } else if (e === 'happy') ctx.arc(x, y + s * 0.45, s, Math.PI * 1.1, Math.PI * 1.9);
    else {
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
    }
    ctx.stroke();
    return;
  }
  const R = rad * (e === 'wide' ? 1.14 : 1);
  circle(ctx, x, y, R);
  ctx.fillStyle = e === 'stone' ? P.light : WHITE;
  ctx.fill();
  ctx.lineWidth = lw * 0.85;
  ctx.strokeStyle = P.ink;
  ctx.stroke();
  if (e === 'stone') return;
  if (e === 'spiral') {
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = i * 0.95 - t * 8;
      const d = (R * 0.78 * i) / 12;
      if (i) ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      else ctx.moveTo(x, y);
    }
    ctx.lineWidth = Math.max(lw * 0.7, R * 0.16);
    ctx.stroke();
    return;
  }
  const pr = R * (e === 'wide' ? 0.3 : 0.54);
  const px = x + (e === 'wide' ? 0 : R * 0.3);
  const py = y + (e === 'droop' ? R * 0.3 : 0);
  circle(ctx, px, py, pr);
  ctx.fillStyle = P.ink;
  ctx.fill();
  if (hi) {
    circle(ctx, px - pr * 0.3, py - pr * 0.4, pr * 0.38);
    ctx.fillStyle = WHITE;
    ctx.fill();
  }
  if (e === 'droop') {
    // a heavy lid
    ctx.beginPath();
    ctx.arc(x, y, R, Math.PI * 0.95, Math.PI * 0.05);
    ctx.closePath();
    fillStroke(ctx, P.shade, lw * 0.85, P.ink);
  }
  if (brow) {
    ctx.beginPath();
    ctx.moveTo(x - R * 1.1, y - R * 1.25);
    ctx.lineTo(x + R * 1.0, y - R * 0.3);
    ctx.lineWidth = Math.max(lw, rad * 0.4);
    ctx.stroke();
  }
}

function shoe(ctx: Ctx, x: number, y: number, size: number, look: PetLook, r: number, t: number, grey: boolean) {
  ctx.save();
  ctx.translate(x, y - size * 0.42);
  item(ctx, 'sneakers', look.sneakers, size, r, t, grey);
  ctx.restore();
}

// ------------------------------------------------------------------ parts that look the same every frame

const PIECES = new Map<string, HTMLCanvasElement>();
/**
 * Draws a part of a body through a cached picture of it. (x, y, w, h) is the part's box in body units when
 * the pet stands at rest; (dx, dy) is how far the part has moved from there this frame.
 */
function piece(ctx: Ctx, key: string, r: number, x: number, y: number, w: number, h: number, dx: number, dy: number, draw: (c: Ctx) => void) {
  let c = PIECES.get(key);
  if (!c) {
    if (PIECES.size > 400) PIECES.clear();
    c = document.createElement('canvas');
    const s = r * SPR_SCALE;
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

function drawAnt(ctx: Ctx, look: PetLook, pose: PetPose, r: number, P: Pal, lw: number) {
  const k = cls(look.level);
  const t = pose.t;
  const p = clamp(pose.puff, 0, 1.5);
  const L = clamp(pose.limp, 0, 1);
  const m = pose.moving;
  const q = Math.min(1, p * 1.6);
  const stony = pose.stone > 0.5;
  const e = faceOf(look, pose);
  const angry = pose.mood === 'angry';
  // a plain frame at a fight size: the body and the head come from cached pictures
  const cached = r <= 26 && !p && !L && e !== 'spiral' && P === BASE.ant[look.team];
  const det = cached || r >= 12;
  const big = r >= 12;
  const w = look.weapon;
  const bw = w ? 0 : pose.wind;
  const bs = w ? 0 : pose.strike;
  const cheer = pose.mood === 'cheer' ? 1 : 0;
  const tr = stony ? P.shade : trimOf(k, t);
  const tc = stony ? P.light : TEAM[look.team].light;
  const pl = stony ? P.light : PLATE[k];
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

  if (k >= 5 && !stony && big) glow(ctx, 0, ty - 0.25, 1.5, 1.35, AURA[k], t);

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
    if (!q && big) ctx.lineTo(x1 + 0.14, y1);
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
  // far legs and the far arm in one stroke
  if (two || q > 0) {
    ctx.moveTo(shx + 0.08, shy - 0.04);
    ctx.quadraticCurveTo((shx + h2x) / 2, (shy + h2y) / 2 + 0.12, h2x, h2y);
  }
  ctx.lineWidth = lw * 1.3;
  ctx.strokeStyle = P.limb;
  ctx.stroke();
  if (look.sneakers && big && !q) for (let i = 0; i < 2; i++) shoe(ctx, FEET[i * 2] + 0.07, FEET[i * 2 + 1], 0.52, look, r, t, stony);

  if (k === 6 && !stony) flame(ctx, ax - arx * 0.9, ay - ary * 0.2, 0.55, t, CLASS_FX.sss, CLASS_FX.spark, lw * 0.8);
  // abdomen and thorax: stinger and spikes behind, stripes and armour on top
  const body = (c: Ctx) => {
    if (k >= 2) spike(c, ax - arx * 0.86, ay - ary * 0.3, Math.PI + 0.5, 0.1, 0.3, tr, lw, P.ink);
    if (k >= 5) {
      for (let i = 0; i < 3; i++) {
        const a = -2.45 + i * 0.5;
        spike(c, ax + Math.cos(a) * arx * 0.85, ay + Math.sin(a) * ary * 0.85, a + 0.15, 0.12, k === 6 ? 0.36 : 0.3, stony ? P.shade : trimOf(k, t, i), lw, P.ink);
      }
    }
    blob(c, ax, ay, arx, ary, -0.3, P, lw, det);
    if (k >= 1) {
      c.beginPath();
      c.ellipse(ax - arx * 0.32, ay + ary * 0.08, arx * 0.3, ary * 0.86, -0.3, -1.15, 1.25);
      if (k >= 2) {
        c.moveTo(ax + arx * 0.42, ay - ary * 0.72);
        c.ellipse(ax + arx * 0.12, ay, arx * 0.3, ary * 0.9, -0.3, -1.15, 1.25);
      }
      c.lineWidth = lw * 1.7;
      c.strokeStyle = P.light;
      c.stroke();
    }
    if (k >= 3) plate(c, ax, ay, arx * 1.03, ary * 1.05, -0.3, Math.PI * 1.02, Math.PI * 1.9, pl, tr, lw, P.ink);
    if (k === 2) spike(c, tx - trx * 0.45, ty - tryy * 0.8, -2.0, 0.1, 0.26, tr, lw, P.ink);
    blob(c, tx, ty, trx, tryy, 0, P, lw, det);
    if (k >= 3) plate(c, tx, ty, trx * 1.08, tryy * 1.1, 0, Math.PI * 1.0, Math.PI * 1.86, pl, stony ? P.shade : trimOf(k, t, 2), lw, P.ink);
    if (p > 0.2) {
      // tight and shiny
      c.fillStyle = WHITE;
      ellipse(c, tx - trx * 0.42, ty - tryy * 0.45, trx * 0.3, tryy * 0.13, -0.7);
      c.fill();
      circle(c, tx - trx * 0.66, ty - tryy * 0.08, trx * 0.07);
      c.fill();
    }
  };
  const rk = r.toFixed(1);
  if (cached) piece(ctx, `ab${look.team}${k}|${rk}`, r, -1.55, -1.6, 2.1, 1.65, 0, ty - ANT_TY, body);
  else body(ctx);

  // near legs
  ctx.beginPath();
  leg(2, -0.2, -0.7, 0, 2.05);
  leg(3, 0.1, 0.34, Math.PI, 1.15);
  ctx.lineWidth = lw * 1.7;
  ctx.strokeStyle = P.limb;
  ctx.stroke();
  if (look.sneakers && !q) for (let i = 2; i < 4; i++) shoe(ctx, FEET[i * 2] + 0.07, FEET[i * 2 + 1], 0.64, look, r, t, stony);

  // the scarf in the team colour: two tails streaming back from the knot (the band goes on with the head)
  const nx = hx - hr * 0.6;
  const ny = hy + hr * 0.68;
  const fl = Math.sin(t * 7 + look.seed) * 0.07 * (0.4 + m) + L * 0.3;
  poly(ctx, [nx - 0.14, ny - 0.22, nx - 0.62, ny - 0.4 + fl, nx - 0.46, ny - 0.2 + fl, nx - 0.64, ny - 0.02 + fl * 1.5, nx - 0.1, ny - 0.02]);
  fillStroke(ctx, tc, lw, P.ink);

  // feelers
  const aw = Math.sin(t * 3.1 + look.seed) * 0.08 - 0.3 * clamp(pose.hurt, 0, 1) - m * 0.12 - bw * 0.2 + bs * 0.2;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const x0 = hx - hr * 0.15 + i * hr * 0.4;
    const y0 = hy - hr * 0.85;
    TIPS[i * 2] = x0 + 0.4 + i * 0.1 + aw - L * 0.1;
    TIPS[i * 2 + 1] = y0 - 0.5 + i * 0.1 + L * 1.0 + cheer * -0.08;
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 - 0.04, y0 - 0.56 + L * 0.3, TIPS[i * 2], TIPS[i * 2 + 1]);
  }
  ctx.lineWidth = lw * 1.1;
  ctx.strokeStyle = P.limb;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    ctx.moveTo(TIPS[i * 2] + 0.09, TIPS[i * 2 + 1]);
    ctx.arc(TIPS[i * 2], TIPS[i * 2 + 1], 0.09, 0, Math.PI * 2);
  }
  ctx.fillStyle = k >= 2 ? tr : P.limb;
  ctx.fill();
  if (big) ctx.stroke();

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
  ctx.lineWidth = lw * 1.5;
  ctx.strokeStyle = P.limb;
  if (k >= 4 && big) {
    ctx.lineWidth = lw * 2.6;
    ctx.strokeStyle = P.ink;
    ctx.stroke();
    ctx.lineWidth = lw * 1.1;
    ctx.strokeStyle = stony ? P.shade : tr;
  }
  ctx.stroke();

  // the head: crest (A and S) behind it, scarf band, face, helmet or crown
  const head = (c: Ctx) => {
    if ((k === 4 || k === 5) && !look.helmet) {
      for (let i = 0; i < 3; i++) {
        const a = -2.75 + i * 0.5;
        spike(c, hx + Math.cos(a) * hr * 0.86, hy + Math.sin(a) * hr * 0.86, a + 0.25, 0.14, 0.42 - Math.abs(i - 1) * 0.1, stony ? P.shade : k === 4 ? COLOR.gold : tr, lw, P.ink);
      }
    }
    blob(c, hx, hy, hr, hr * 0.96, 0, P, lw, det);
    ellipse(c, nx, ny, 0.4, 0.15, 0.72);
    fillStroke(c, tc, lw, P.ink);
    if (look.chili && !stony) {
      circle(c, hx + hr * 0.02, hy + hr * 0.46, hr * 0.2);
      c.fillStyle = '#ff7a2a';
      c.fill();
    }
    const fierce = (k >= 5 || angry) && e === 'open';
    const es = 1 + 0.3 * p;
    eye(c, hx + hr * 0.76, hy - hr * 0.12, hr * 0.2 * es, e, P, lw, t, fierce, det);
    eye(c, hx + hr * 0.2, hy - hr * 0.02, hr * 0.39 * es, e, P, lw, t, fierce, det);
    if (e === 'x' || e === 'pinch' || e === 'happy' || e === 'wide') {
      circle(c, hx + hr * 0.56, hy + hr * 0.52, hr * (e === 'happy' ? 0.22 : 0.15));
      c.fillStyle = stony ? P.shade : MOUTH;
      c.fill();
      if (e === 'x') {
        ellipse(c, hx + hr * 0.62, hy + hr * 0.74, hr * 0.13, hr * 0.24, -0.2);
        fillStroke(c, TONGUE, lw * 0.7, P.ink);
      }
    } else if (det) {
      c.beginPath();
      if (angry) c.arc(hx + hr * 0.56, hy + hr * 0.64, hr * 0.16, Math.PI * 1.15, Math.PI * 1.85);
      else c.arc(hx + hr * 0.54, hy + hr * 0.4, hr * 0.16, Math.PI * 0.1, Math.PI * 0.8);
      c.lineWidth = lw * 0.8;
      c.strokeStyle = P.ink;
      c.stroke();
    }
    if (look.helmet) {
      c.save();
      c.translate(hx - hr * 0.06, hy - hr * 0.62);
      c.rotate(-0.14);
      item(c, 'helmet', look.helmet, hr * 2.75, r, t, stony);
      c.restore();
    } else if (k === 6) crown(c, hx - hr * 0.2, hy - hr * 0.86, hr * 1.0, -0.22, lw, t, P.ink);
  };
  if (cached) piece(ctx, `ah${look.team}${k}|${look.helmet}|${look.chili ? 1 : 0}|${e}${angry ? 1 : 0}|${rk}`, r, ANT_HX - 1.0, ANT_HY - 1.35, 1.9, 2.2, hx - ANT_HX, hy - ANT_HY, head);
  else head(ctx);
  if (look.chili && !stony) flame(ctx, hx - hr * 0.75, hy - hr * 0.55, 0.34 + look.chili * 0.045, t, '#ff7a1e', '#ffe066', lw * 0.7);

  // weapon, then the near arm over its grip
  if (w && w !== 'shield') heldWeapon(ctx, look, r, t, stony);
  ctx.beginPath();
  ctx.moveTo(shx, shy);
  ctx.quadraticCurveTo((shx + H.x) / 2 - 0.05, (shy + H.y) / 2 + 0.16, H.x, H.y);
  ctx.lineWidth = lw * 1.7;
  ctx.strokeStyle = P.limb;
  ctx.stroke();
  circle(ctx, H.x, H.y, 0.12);
  ctx.fillStyle = P.limb;
  ctx.fill();
  if (w === 'shield') heldWeapon(ctx, look, r, t, stony);

  if (!stony && big) {
    if (k === 4 && !look.helmet) sparkle(ctx, hx - hr * 0.5, hy - hr * 1.3, 0.3, t, look.seed);
    if (k === 6) for (let i = 0; i < 3; i++) sparkle(ctx, Math.cos(t * 1.3 + i * 2.1) * 1.3, ty - 0.3 + Math.sin(t * 1.3 + i * 2.1) * 1.0, 0.26, t, i * 2);
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
  ctx.lineWidth = lw * 0.75;
  ctx.strokeStyle = P.ink;
  ctx.stroke();
}

// ------------------------------------------------------------------ the frog

function drawFrog(ctx: Ctx, look: PetLook, pose: PetPose, r: number, P: Pal, lw: number) {
  const k = cls(look.level);
  const t = pose.t;
  const p = clamp(pose.puff, 0, 1.5);
  const L = clamp(pose.limp, 0, 1);
  const q = Math.min(1, p * 1.6);
  const stony = pose.stone > 0.5;
  const e = faceOf(look, pose);
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
  const tr = stony ? P.shade : trimOf(k, t);
  const tc = stony ? P.shade : TEAM[look.team].dark;
  const pl = stony ? P.light : PLATE[k];

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

  if (k === 6 && !stony) {
    at(3.05, 1, TIPS);
    flame(ctx, TIPS[0], TIPS[1] + 0.1, 0.6, t, CLASS_FX.sss, CLASS_FX.spark, lw * 0.8);
  }
  // far foot peeking out in front
  if (!q) limb(ctx, 0.2, -0.07 + air * 0.3, 0.52 - air * 0.3, -0.07 + air * 0.5, 0.16, P.shade, lw, P.ink);

  const body = (c: Ctx) => {
    if (k >= 5 && !stony) glow(c, 0, by, brx * 1.5, bry * 1.55, AURA[k], cached ? 0 : t);
    // along the back: bumps (C), a gold fin (A), spikes (S, SSS)
    if (k >= 2 && k !== 3) {
      const n = k >= 4 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const a = 3.25 + i * 0.36;
        at(a, 0.97, TIPS);
        if (k === 2) {
          circle(c, TIPS[0], TIPS[1], 0.12);
          fillStroke(c, tr, lw, P.ink);
        } else spike(c, TIPS[0], TIPS[1], a + 0.25, 0.16, (k === 4 ? 0.34 : 0.44) - Math.abs(i - 1.5) * 0.06, stony ? P.shade : k === 4 ? COLOR.gold : trimOf(k, t, i), lw, P.ink);
      }
    }
    // eye domes: the far one stays behind the head, the near one is joined to it below
    const fierce = (k >= 5 || angry) && e === 'open';
    circle(c, dfx, dfy, 0.27 * es);
    fillStroke(c, P.shade, lw, P.ink);
    eye(c, dfx + 0.05, dfy - 0.03, 0.17 * es, e, P, lw, t, fierce, det);
    circle(c, dnx, dny, 0.34 * es);
    fillStroke(c, P.main, lw, P.ink);

    blob(c, bx, by, brx, bry, 0, P, lw, det);
    // belly: it swells as the tongue winds up
    ellipse(c, bx + 0.22 * brx, by + 0.24 * bry, brx * (0.6 + 0.06 * twv), bry * (0.6 + 0.06 * twv));
    c.fillStyle = P.belly;
    c.fill();
    if (k >= 1) {
      c.fillStyle = P.shade;
      circle(c, bx - 0.5 * brx, by - 0.42 * bry, 0.13);
      c.fill();
      circle(c, bx - 0.74 * brx, by - 0.05 * bry, 0.09);
      c.fill();
      if (k >= 2) {
        circle(c, bx - 0.26 * brx, by - 0.66 * bry, 0.08);
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
    // the belt in the team colour
    c.lineCap = 'butt';
    c.beginPath();
    c.ellipse(bx, by + 0.08 * bry, brx * 0.9, bry * 0.4, 0, 0, Math.PI);
    c.lineWidth = 0.2 + lw;
    c.strokeStyle = P.ink;
    c.stroke();
    c.lineWidth = 0.2 - lw;
    c.strokeStyle = tc;
    c.stroke();
    c.lineCap = 'round';
    // armour on the back from B
    if (k >= 3) {
      c.beginPath();
      c.ellipse(bx, by, brx * 1.02, bry * 1.02, 0, Math.PI * 0.98, Math.PI * 1.42);
      c.ellipse(bx, by, brx * 0.62, bry * 0.62, 0, Math.PI * 1.42, Math.PI * 0.98, true);
      c.closePath();
      fillStroke(c, tr, lw, P.ink);
      c.beginPath();
      c.ellipse(bx, by, brx * 1.02, bry * 1.02, 0, Math.PI * 1.04, Math.PI * 1.37);
      c.ellipse(bx, by, brx * 0.74, bry * 0.74, 0, Math.PI * 1.37, Math.PI * 1.04, true);
      c.closePath();
      fillStroke(c, pl, lw * 0.8, P.ink);
    }
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
    } else if (k === 6) crown(c, bx - 0.3 * brx, by - bry * 0.9, 0.62, -0.3, lw, t, P.ink);

    // the near eye, joined to the head
    circle(c, dnx, dny, 0.34 * es - lw * 0.5);
    c.fillStyle = P.main;
    c.fill();
    eye(c, dnx + 0.05, dny - 0.02, 0.24 * es, e, P, lw, t, fierce, det);

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
      c.lineWidth = lw * 1.1;
      c.strokeStyle = P.ink;
      c.stroke();
    }
    // nostril and cheek
    circle(c, bx + 0.84 * brx, by - 0.45 * bry, 0.035);
    c.fillStyle = P.ink;
    c.fill();
    if ((look.chili || k >= 1) && !stony) {
      ellipse(c, bx + 0.2 * brx, by - 0.1 * bry, 0.15, 0.1);
      c.fillStyle = look.chili ? '#ff5a1e' : look.team ? '#ffb0a8' : '#ffb7d0';
      c.fill();
    }
  };
  if (cached) piece(ctx, `f${look.team}${k}|${look.helmet}|${look.chili ? 1 : 0}|${e}${angry ? 1 : 0}${twv * 4}${ts > 0.02 ? 1 : 0}|${r.toFixed(1)}`, r, -1.7, -2.8, 3.4, 3.35, 0, 0, body);
  else body(ctx);

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
  limb(ctx, f0x, f0y, f1x, f1y, 0.2 * ls, P.main, lw, P.ink);
  const thigh = (c: Ctx) => {
    blob(c, 0, 0, 0.5 * ls, 0.36 * ls, 0, P, lw, det);
    if (k >= 3) plate(c, 0, 0, 0.52 * ls, 0.38 * ls, 0, Math.PI * 1.0, Math.PI * 1.7, pl, stony ? P.shade : trimOf(k, t, 3), lw, P.ink);
  };
  ctx.save();
  ctx.translate(thx, thy);
  ctx.rotate(thr);
  if (cached) piece(ctx, `ft${look.team}${k}|${r.toFixed(1)}`, r, -0.68, -0.54, 1.36, 1.08, 0, 0, thigh);
  else thigh(ctx);
  ctx.restore();
  if (look.sneakers && !q) shoe(ctx, f1x - 0.12, f1y + 0.04, 0.82, look, r, t, stony);

  if (look.chili && !stony) flame(ctx, bx + 0.9 * brx, by - 0.52 * bry, 0.36 + look.chili * 0.05, t, '#ff7a1e', '#ffe066', lw * 0.7);

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

  if (!stony) {
    if (k === 4 && !look.helmet) sparkle(ctx, bx - 0.6 * brx, by - bry * 1.25, 0.3, t, look.seed);
    if (k === 6) for (let i = 0; i < 3; i++) sparkle(ctx, Math.cos(t * 1.3 + i * 2.1) * 1.45, by + Math.sin(t * 1.3 + i * 2.1) * 1.1, 0.26, t, i * 2);
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
  const lw = Math.max(1.2 / r, 0.1);
  const P = palette(look, pose);
  if (frog) drawFrog(ctx, look, pose, r, P, lw);
  else drawAnt(ctx, look, pose, r, P, lw);
  ctx.restore();
}

function drawShadow(ctx: Ctx, look: PetLook, r: number, lift: number): void {
  const k = 1 / (1 + Math.max(0, lift) * 0.7);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * (0.1 + 0.14 * k);
  ctx.fillStyle = COLOR.ink;
  ellipse(ctx, 0, 0, r * (look.pet === 'frog' ? 1.05 : 0.98) * k, r * 0.3 * k);
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
  const top = look.pet === 'frog' ? 2.0 : 2.4;
  return r * (top + (look.helmet ? 0.3 : look.level >= 7 ? 0.25 : 0));
}

export const petArt: PetArt = { drawPet, drawShadow, snapshot, headTop };
