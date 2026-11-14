import type { Ctx, Rect } from '../util';
import type { Piece, PieceType, PetType, WeaponType, GearType } from '../types';
import { isPet, isWeapon } from '../data';
import { classBadge, classFx, countBadge, tileFrame } from './ui';
import { petArt } from './pets';
import { restPose } from './petTypes';
import type { PetLook } from './petTypes';
import { drawWeapon } from './weapons';
import { drawGear } from './gear';

/*
 * The shared piece tile: every place a piece is shown draws it through drawPiece, so a piece looks the same
 * on the grid, on the bench, under the finger and in the roll.
 */

export interface PieceLike {
  type: PieceType;
  level: number;
  count?: number;
}

export interface PieceOpts {
  /** touches nothing useful: drawn dimmed */
  idle?: boolean;
  /** lifted under the finger */
  lifted?: boolean;
  t: number;
  /** pop scale of the picture (1 = none), for fuse and hop animations */
  pop?: number;
  /** hide the badges (a big medallion draws its own) */
  bare?: boolean;
}

// where the members of a group stand inside the picture box (x, y as share of size, and their scale)
const GROUP: Record<number, readonly (readonly [number, number, number])[]> = {
  1: [[0, 0.36, 1]],
  2: [[-0.2, 0.3, 0.72], [0.2, 0.38, 0.72]],
  4: [[-0.24, 0.1, 0.6], [0.24, 0.1, 0.6], [-0.24, 0.44, 0.6], [0.24, 0.44, 0.6]],
  8: [
    [-0.3, 0.04, 0.4], [-0.1, 0.06, 0.4], [0.1, 0.04, 0.4], [0.3, 0.06, 0.4],
    [-0.3, 0.4, 0.4], [-0.1, 0.42, 0.4], [0.1, 0.4, 0.4], [0.3, 0.42, 0.4],
  ],
};

function petLook(pet: PetType, level: number, seed: number): PetLook {
  return { pet, level, team: 0, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0, seed };
}

function drawPetGroup(ctx: Ctx, pet: PetType, level: number, count: number, cx: number, cy: number, size: number, t: number) {
  const spots = GROUP[count] ?? GROUP[1];
  // one fighter's body radius that fits the box (a pet is about 2.4 r tall)
  const r1 = size / (pet === 'frog' ? 2.5 : 2.7);
  spots.forEach(([dx, dy, k], i) => {
    const look = petLook(pet, level, i * 7 + 3);
    const pose = restPose();
    pose.t = t + i * 0.37;
    pose.face = i % 2 === 0 ? 1 : -1;
    if (count === 1) pose.face = 1;
    ctx.save();
    ctx.translate(cx + dx * size, cy + dy * size);
    petArt.drawShadow(ctx, look, r1 * k, 0);
    petArt.drawPet(ctx, look, pose, r1 * k);
    ctx.restore();
  });
}

/** The picture of a piece alone, centred on cx, cy, fitting a box size px across. */
export function pieceIcon(ctx: Ctx, type: PieceType, level: number, cx: number, cy: number, size: number, t: number, count = 1) {
  if (isPet(type)) {
    drawPetGroup(ctx, type, level, count, cx, cy, size, t);
    return;
  }
  ctx.save();
  if (isWeapon(type)) {
    const w = type as WeaponType;
    if (w === 'shield') {
      ctx.translate(cx, cy);
      drawWeapon(ctx, w, level, size * 0.92, t);
    } else {
      // diagonal, grip at the lower left
      ctx.translate(cx - size * 0.32, cy + size * 0.36);
      ctx.rotate(Math.PI / 4);
      drawWeapon(ctx, w, level, size * (w === 'spear' ? 1.15 : 1.0), t);
    }
  } else {
    ctx.translate(cx, cy);
    drawGear(ctx, type as GearType, level, size * 0.92, t);
  }
  ctx.restore();
}

/** A piece on its class tile: picture, class badge, count badge, and the shine of A-class and better. */
export function drawPiece(ctx: Ctx, p: Piece | PieceLike, r: Rect, o: PieceOpts) {
  const count = p.count ?? 1;
  const lift = o.lifted ? 4 : 0;
  tileFrame(ctx, r, p.level, { idle: o.idle, lifted: o.lifted, t: o.t });
  if (p.level >= 5 && !o.idle) classFx(ctx, { x: r.x, y: r.y - lift, w: r.w, h: r.h }, p.level, o.t);
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.6;
  const size = r.w * 0.78;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * 0.46 - lift;
  const pop = o.pop ?? 1;
  if (pop !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -cy);
  }
  pieceIcon(ctx, p.type, p.level, cx, cy, size, o.t, count);
  ctx.restore();
  if (o.bare) return;
  const k = r.w / 58;
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.75;
  classBadge(ctx, p.level, r.x + 3 * k, r.y + 11 * k - lift, 0.8 * k, o.t);
  if (isPet(p.type) && count > 1) countBadge(ctx, count, r.x + r.w - 15 * k, r.y + r.h - 13 * k - lift, 0.85 * k);
  ctx.restore();
}
