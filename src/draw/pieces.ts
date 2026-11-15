import type { Ctx, Rect } from '../util';
import type { Piece, PieceType, PetType, WeaponType, GearType } from '../types';
import { footprint, isPet, isWeapon, petTier, rungOf } from '../data';
import { clamp } from '../util';
import { TILE_LIFT, classBadge, classFx, countBadge, rungBadge, tileDepth, tileFrame } from './ui';
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

function petLook(pet: PetType, level: number, seed: number): PetLook {
  return { pet, level, team: 0, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0, seed };
}

/** How a group of `count` stands in a box w x h: columns and rows of the formation. */
function formation(count: number, w: number, h: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return h > w * 1.4 ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 };
  if (count === 4) return w > h * 2.6 ? { cols: 4, rows: 1 } : { cols: 2, rows: 2 };
  return w >= h ? { cols: 4, rows: 2 } : { cols: 2, rows: 4 };
}

/**
 * A group of identical fighters filling a box (centre cx, cy, w x h): one big fighter alone; a pair side by side
 * in a wide box or one above the other in a tall one; four as two rows. The back row stands a little smaller and
 * higher, so the group reads as standing on the ground together.
 */
function drawPetGroup(ctx: Ctx, pet: PetType, level: number, count: number, cx: number, cy: number, w: number, h: number, t: number) {
  const f = formation(count, w, h);
  const cw = w / f.cols;
  const ch = h / f.rows;
  // a square box's pair stands closer, overlapping a little like friends instead of floating apart
  const close = f.cols > 1 && f.rows === 1 && w < h * 1.4;
  const squeeze = close ? 0.78 : 1;
  // fit each by the side that limits it (the cast has big heads on small bodies: about as tall as wide)
  const fitW = (cw / squeeze) * (close ? 0.62 : 1);
  const r1 = Math.min(fitW / 2.45, ch / 2.55) * 0.94;
  let i = 0;
  for (let row = 0; row < f.rows; row++) {
    const back = f.rows > 1 && row < f.rows - 1;
    for (let col = 0; col < f.cols; col++) {
      const look = petLook(pet, level, i * 7 + 3);
      const pose = restPose();
      pose.t = t + i * 0.37;
      pose.face = 1;
      const x = cx + (col - (f.cols - 1) / 2) * cw * squeeze + (f.rows > 1 ? (row % 2 ? 0.06 : -0.06) * cw : 0);
      const y = cy - h / 2 + ch * (row + 0.5) + ch * 0.34;
      const rr1 = r1 * (back ? 0.95 : 1);
      ctx.save();
      ctx.translate(x, y);
      petArt.drawShadow(ctx, look, rr1, 0);
      petArt.drawPet(ctx, look, pose, rr1);
      ctx.restore();
      i++;
    }
  }
}

/**
 * The picture of a piece alone, centred on cx, cy, fitting a box size px across (boxH: a taller or flatter box,
 * for a group of pets that covers several cells).
 */
export function pieceIcon(ctx: Ctx, type: PieceType, level: number, cx: number, cy: number, size: number, t: number, count = 1, boxH = size) {
  if (isPet(type)) {
    drawPetGroup(ctx, type, level, count, cx, cy, size, boxH, t);
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

/**
 * A piece on its class tile: picture, class badge (a unit: its rung), count badge, and the shine of A-class and
 * better (a unit's tile takes the tier its rung looks like). r is the whole tile: a piece covering two or four cells
 * is one wide tile, its fighters posed across it.
 */
export function drawPiece(ctx: Ctx, p: Piece | PieceLike, r: Rect, o: PieceOpts) {
  const count = p.count ?? 1;
  const pet = isPet(p.type);
  const tier = pet ? petTier(p.type as PetType) : p.level;
  const lift = o.lifted ? TILE_LIFT : 0;
  const fp = footprint({ type: p.type, count, turned: (p as Piece).turned });
  // one cell's size inside this tile: the badges are sized by it, so they read the same on every tile
  const unit = Math.min(r.w / fp.w, r.h / fp.h);
  const face = r.h - tileDepth(Math.min(r.w, r.h)); // the top face; the side face is below it
  tileFrame(ctx, r, tier, { idle: o.idle, lifted: o.lifted, t: o.t });
  if (tier >= 5 && !o.idle) classFx(ctx, { x: r.x, y: r.y - lift, w: r.w, h: r.h }, tier, o.t);
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.6;
  const pad = unit * 0.1;
  const bw = r.w - pad * 2;
  const bh = face - pad * 2;
  const cx = r.x + r.w / 2;
  // a lone piece sits a touch low, clear of the class badge in the top-left corner
  const cy = r.y + face / 2 + (isPet(p.type) ? 0 : unit * 0.04) - lift;
  const pop = o.pop ?? 1;
  if (pop !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -cy);
  }
  if (isPet(p.type)) pieceIcon(ctx, p.type, p.level, cx, cy + unit * 0.03, bw, o.t, count, bh);
  else pieceIcon(ctx, p.type, p.level, cx, cy, Math.min(bw, bh) * 0.86, o.t, count);
  ctx.restore();
  if (o.bare) return;
  // a multi-cell piece shrunk onto a bench slot keeps badges big enough to read its class
  const k = clamp(unit / 90, 0.72, 1.1);
  ctx.save();
  if (o.idle) ctx.globalAlpha *= 0.8;
  // the class plate in the top-left corner, the head count in the bottom-right one, both just inside the rim
  if (pet) rungBadge(ctx, rungOf(p.type as PetType), r.x + 6 * k, r.y + 6 * k + 13 * k - lift, k);
  else classBadge(ctx, p.level, r.x + 6 * k, r.y + 6 * k + 13 * k - lift, k, o.t);
  if (pet && count > 1) countBadge(ctx, count, r.x + r.w - 20 * k, r.y + face - 15 * k - lift, k);
  ctx.restore();
}
