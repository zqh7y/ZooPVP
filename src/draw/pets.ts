import type { PetType } from '../types';
import type { PetArt, PetLook, PetPose } from './petTypes';
import { COLOR } from '../theme';
import { clamp, ellipse, smooth } from '../util';
import { D, H2, R, STONE_INK, WHITE, bucketOf, pickFace, pickMouth, setChar, type CharDef, type Ctx } from './cast/kit';
import { chick } from './cast/chick';
import { scorp } from './cast/scorp';
import { tabby } from './cast/tabby';
import { dillo } from './cast/dillo';
import { roo } from './cast/roo';
import { cacto } from './cast/cacto';
import { zip } from './cast/zip';
import { briar } from './cast/briar';
import { angler } from './cast/angler';
import { sumo } from './cast/sumo';
import { rhino } from './cast/rhino';
import { boulder } from './cast/boulder';

/*
 * THE UNITS (docs/v5.md section 1): twelve fighters, one file each in src/draw/cast/, all drawn with the kit in
 * src/draw/cast/kit.ts (read its header first). This file maps the unit ids to them and is the contract the rest
 * of the game draws through (petArt). The ids are the old ones; the fighters are new:
 *   sprout = Chick, buzzy = Scorp, ninja = Tabby, snailor = Dillo, roo = Roo, cacto = Cacto, pogo = Zip,
 *   briar = Spike, angler = Inky, sumo = Waddles, rhino = Ram, boulder = Champ.
 */
const CHARS: Record<PetType, CharDef> = {
  sprout: chick,
  buzzy: scorp,
  ninja: tabby,
  snailor: dillo,
  roo,
  cacto,
  pogo: zip,
  briar,
  angler,
  sumo,
  rhino,
  boulder,
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
  const D = CHARS[look.pet] ?? CHARS.sprout;
  setChar(D);
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
