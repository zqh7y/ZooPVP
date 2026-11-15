import { sfx } from '../audio/engine';
import { fchance, fpick, frand } from '../rng';
import { ARENA } from '../data';
import { COLOR, UI, W } from '../theme';
import type { DeathKind, PetType, WeaponType } from '../types';
import { clamp, easeOutCubic, lerp, smooth, type Ctx } from '../util';
import { PITCH, project, TILT } from './camera';
import { drawShard, GROUND_FLAT, GRASS_SHADE, type Fx } from './fx';
import { restPose, type PetLook, type PetPose } from './petTypes';
import { PET_COLORS, petArt } from './pets';

/*
 * The eight ways a fighter goes. No blood and no comic words: each one is a little joke told with shape,
 * timing, light and sound, with a wind-up, a pay-off frame and a clean end. The dying pet keeps being drawn by
 * petArt.drawPet with a pose driven here; what flies off goes through the shared Fx in the game's one palette
 * (white, gold, the pet's own tones), with a shadow on the grass while it flies.
 *
 * A death happens at an arena point and is placed on screen by the match camera: everything about it is
 * drawn at that depth's scale, and what leaves the ground rises toward screen-up while its shadow stays down.
 *
 * Every knock-out leaves its mark on the pitch for the rest of the fight, painted once into the ground layer
 * (fx.ground): a flat splat in the pet's colours, the pancake a squish leaves, a ring of settled petals, a little
 * pile of stone bits, a skid, a cut in the grass. Small cartoon marks, never gore.
 */

export const DEATH_KINDS: readonly DeathKind[] = ['pop', 'squish', 'launch', 'slice', 'spin', 'deflate', 'shatter', 'petals'];

/** seconds from the start to each kind's pay-off frame (the dev page shows it) */
export const DEATH_PAYOFF: Record<DeathKind, number> = {
  pop: 0.42, squish: 0.13, launch: 0.3, slice: 0.2, spin: 0.4, deflate: 0.4, shatter: 0.27, petals: 0.12,
};

/** the blow that killed it */
export interface DeathHit {
  weapon: WeaponType | null;
  /** the way it was pushed, radians */
  dir: number;
  /** how hard, 0..1+ */
  power: number;
}

const DUR: Record<DeathKind, number> = { pop: 0.44, squish: 1.15, launch: 0.64, slice: 0.82, spin: 1.08, deflate: 1.2, shatter: 0.29, petals: 0.14 };
/** how long after the start the sound begins, so its accent lands on the pay-off frame */
const SOUND_AT: Record<DeathKind, number> = { pop: 0.28, squish: 0.1, launch: 0, slice: 0, spin: 0, deflate: 0, shatter: 0.25, petals: 0.06 };
const OWN: Record<PetType, readonly DeathKind[]> = {
  frog: ['pop', 'pop', 'pop', 'deflate', 'deflate', 'deflate', 'petals', 'spin'],
  ant: ['squish', 'squish', 'squish', 'squish', 'petals', 'pop', 'spin', 'deflate'],
};
/** body tones of the two teams, exactly as the pets are painted: [main, light, shade] */
const BODY = PET_COLORS;
const STONES = ['#b4b9c1', '#8d939c', '#d9dde2'];
/** white and off-white, with a breath of sunny gold: no extra hue */
const PETALS = [COLOR.white, '#fffaf0', '#f6efe0', COLOR.white, '#fff0c4'];
/** the thin outline of a mark lying on the grass: the ink, softened */
const MARK_INK = 'rgba(20, 24, 31, 0.55)';
/** worn, sun-bleached grass (a skid, a swirl, a cut) */
const WORN = 'rgba(246, 242, 200, 0.62)';
const TAU = Math.PI * 2;
const SPARK = [UI.accent, COLOR.white];
const INFLATE = DEATH_PAYOFF.pop;
const ZIP = 0.8; // the let-go balloon zips about this long
const ZIP_LEGS = 7;
const MANY = 26; // more bodies than this at once: the rest go the quick ways
const SPECK = 1.2; // a body drawn smaller than this radius (px) is just a speck
const SMALL = 5; // below this radius a body is drawn at this size and scaled down

/** Picks the death a blow has earned: mostly the weapon's, sometimes the pet's own. */
export function chooseDeath(pet: PetType, hit: DeathHit): DeathKind {
  if (fchance(0.14)) return fpick(OWN[pet]);
  switch (hit.weapon) {
    case 'bat':
      return hit.power >= 0.55 ? 'launch' : 'squish';
    case 'knife':
      return 'slice';
    case 'spear':
      return fchance(0.8) ? 'spin' : fpick(OWN[pet]);
    case 'shield':
      return fchance(0.8) ? 'shatter' : fpick(OWN[pet]);
    default:
      return fpick(OWN[pet]);
  }
}

interface Body {
  kind: DeathKind;
  look: PetLook;
  pose: PetPose;
  /** radius on screen (the fighter's radius times the depth scale) */
  r: number;
  /** where it died: its feet on screen, and the depth scale there */
  x: number;
  y: number;
  s: number;
  dir: number;
  power: number;
  t: number;
  /** pay-off stages already played */
  fired: number;
  /** offset from where it died, and how big it is drawn */
  ox: number;
  oy: number;
  scale: number;
  /** lying on the ground: drawn under the fighters */
  flat: boolean;
  /** off the ground: drawn over the fighters, its shadow at (shx, shy), lifted this much (0 = on the ground) */
  air: boolean;
  shx: number;
  shy: number;
  lift: number;
  /** a launch: where its shadow ends up on screen, and how high and how small it is by then */
  tx: number;
  ty: number;
  ts: number;
  th: number;
  /** per-kind numbers fixed at the start */
  a: number;
  b: number;
  c: number;
  puffT: number;
  path: number[];
  snap: ReturnType<typeof petArt.snapshot> | null;
}

export class Deaths {
  private list: Body[] = [];
  /** the bodies standing on the ground this frame, nearest last, and how many are drawn (see drawUpTo) */
  private queue: Body[] = [];
  private qi = 0;
  private depthOn = false;

  constructor(private fx: Fx, private ratio = 1) {}

  get count(): number {
    return this.list.length;
  }

  setRatio(ratio: number): void {
    this.ratio = ratio;
  }

  clear(): void {
    this.list.length = this.queue.length = 0;
    this.depthOn = false;
  }

  /**
   * A fighter dies at arena point (ax, ay) (its feet; the match camera puts it on screen). r is its radius in
   * arena px. Give `kind` to force one (the dev page does); otherwise it is chosen from the pet and the blow.
   * Returns the kind that plays.
   */
  start(look: PetLook, radius: number, ax: number, ay: number, face: 1 | -1, hit: DeathHit, kind?: DeathKind): DeathKind {
    let k = kind ?? chooseDeath(look.pet, hit);
    if (!kind) {
      if (this.list.length > MANY) k = fchance(0.5) ? 'petals' : 'pop';
      else if (k === 'slice' && this.list.reduce((n, b) => n + (b.kind === 'slice' ? 1 : 0), 0) >= 6) k = fpick(OWN[look.pet]);
    }
    const at = project(ax, ay);
    const { x, y, s } = at;
    const r = radius * s;
    const pose = restPose();
    pose.face = face;
    pose.t = look.seed;
    pose.mood = 'hurt';
    const b: Body = {
      kind: k, look, pose, r, x, y, s, dir: hit.dir, power: clamp(hit.power, 0, 1.5), t: 0, fired: 0,
      ox: 0, oy: 0, scale: 1, flat: false, air: false, shx: x, shy: y, lift: 0, tx: x, ty: y, ts: s, th: 0,
      a: 0, b: fchance(0.5) ? 1 : -1, c: 0, puffT: 0, path: [], snap: null,
    };
    const fx = this.fx;
    if (k === 'launch') {
      // up and away along the blow, its shadow racing over the grass (and off it, toward the stands)
      const gx = clamp(ax + Math.cos(hit.dir) * (90 + 70 * b.power), -26, ARENA.w + 26);
      const gy = clamp(ay + Math.sin(hit.dir) * (60 + 40 * b.power), -24, ARENA.h + 16);
      const end = project(gx, gy);
      b.tx = clamp(end.x, 26, W - 26);
      b.ty = end.y;
      b.ts = end.s;
      // high enough to read as gone, never up into the score bar
      b.th = Math.min((170 + 60 * b.power) * end.s, end.y - (PITCH.top - 150));
      b.b = Math.cos(hit.dir) >= 0 ? 1 : -1;
      fx.streak(x, y - r, Math.atan2(b.ty - b.th - y, b.tx - x), (70 + 40 * b.power) * s, COLOR.white, r * 0.4, 0.22);
      // where it took off: a skid along the blow and a few drops of its colour
      const g = fx.ground.paint();
      skid(g, x, y, r * 1.2 + 3 * s, r * 0.6, hit.dir);
      drops(g, x + Math.cos(hit.dir) * r * 0.6, y, r * 0.9 + 2 * s, hit.dir, BODY[look.pet][look.team]);
    } else if (k === 'slice') {
      pose.mood = 'scared';
      b.a = b.b * frand(0.18, 0.5);
      b.snap = petArt.snapshot(look, pose, r, this.ratio);
      // a bright edge where the cut goes, only on the pet's own pixels
      const c = b.snap.canvas.getContext('2d')!;
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = COLOR.white;
      c.lineWidth = r * 0.16;
      c.beginPath();
      c.moveTo(-Math.cos(b.a) * r * 5, -r - Math.sin(b.a) * r * 5);
      c.lineTo(Math.cos(b.a) * r * 5, -r + Math.sin(b.a) * r * 5);
      c.stroke();
      fx.streak(x - Math.cos(b.a) * r * 2.8, y - r - Math.sin(b.a) * r * 2.8, b.a, r * 5.6, COLOR.white, r * 0.3, 0.24);
      fx.burst(x, y - r, { colors: [COLOR.white, COLOR.goldLight], n: 3, speed: 120 * s, size: r * 0.45 + 2, life: 0.3, gravity: 0, shape: 'star' });
    } else if (k === 'deflate') {
      // a zig-zag over the pitch (never past its edges at this depth), each leg shorter than the last
      const half = (ARENA.w / 2) * s;
      const x0 = PITCH.cx - half + 18 * s;
      const x1 = PITCH.cx + half - 18 * s;
      let px = 0;
      let py = -r * 1.2;
      let side = b.b;
      b.path.push(px, py);
      for (let i = 0; i < ZIP_LEGS; i++) {
        const len = r * lerp(5.5, 2.4, i / ZIP_LEGS) + 14 * s;
        px = clamp(x + px + side * len * frand(0.7, 1), x0, x1) - x;
        py = clamp(py + frand(-1, 0.75) * len * 0.7, -r * 7 - 30 * s, -r * 0.8);
        b.path.push(px, py);
        side = -side;
      }
    }
    sfx.play(k, 0, { x, enemy: look.team === 0, delay: SOUND_AT[k] });
    this.list.push(b);
    return k;
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.t += dt;
      b.pose.t += dt;
      b.air = false;
      b.lift = 0;
      this.step(b, dt);
      if (!b.air) {
        b.shx = b.x + b.ox;
        b.shy = b.y + (b.kind === 'spin' ? b.oy : 0);
      }
      if (b.t >= DUR[b.kind]) this.list.splice(i, 1);
    }
  }

  /** shadows and the bodies lying on the ground */
  drawUnder(ctx: Ctx): void {
    for (const b of this.list) {
      const a = b.kind === 'slice' ? clamp((DUR.slice - b.t) / 0.2, 0, 1) : b.pose.alpha;
      if (a > 0.02 && b.scale > 0.3 && !b.flat) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(b.shx, b.shy);
        petArt.drawShadow(ctx, b.look, b.r * (b.kind === 'launch' ? lerp(1, b.ts / b.s, smooth(Math.min(1, b.t / 0.5))) : b.scale), b.lift);
        ctx.restore();
      }
      if (b.flat) this.drawBody(ctx, b);
    }
  }

  /**
   * For drawing in depth with the fighters: call once a frame before them, then drawUpTo(y) before each
   * fighter whose feet are at screen y. A body still standing is then drawn behind the ones nearer the camera.
   */
  beginDepth(): void {
    this.queue.length = 0;
    for (const b of this.list) if (!b.flat && !b.air) this.queue.push(b);
    this.queue.sort((p, q) => p.y - q.y);
    this.qi = 0;
    this.depthOn = true;
  }

  /** the standing bodies whose feet are above screen y and not drawn yet (see beginDepth) */
  drawUpTo(ctx: Ctx, y: number): void {
    const q = this.queue;
    while (this.qi < q.length && q[this.qi].y <= y) this.drawBody(ctx, q[this.qi++]);
  }

  /** the bodies in the air, and any standing ones drawUpTo has not drawn yet */
  drawOver(ctx: Ctx): void {
    if (this.depthOn) {
      const q = this.queue;
      while (this.qi < q.length) this.drawBody(ctx, q[this.qi++]);
      for (const b of this.list) if (b.air && !b.flat) this.drawBody(ctx, b);
      this.depthOn = false;
    } else for (const b of this.list) if (!b.flat) this.drawBody(ctx, b);
  }

  // ------------------------------------------------------------------ the eight

  private step(b: Body, dt: number): void {
    const fx = this.fx;
    const p = b.pose;
    const { t, r, x, y, s } = b;
    const [main, light, shade] = BODY[b.look.pet][b.look.team];
    const cy = y - r * 1.1;
    const few = this.list.length > 12 ? 0.6 : 1;
    switch (b.kind) {
      case 'pop': {
        // swells tight, strains, then pops into shreds of itself
        const k = Math.min(1, t / INFLATE);
        p.puff = 1.5 * k ** 0.75;
        p.mood = 'scared';
        p.squashX = 1 + Math.sin(t * 52) * 0.06 * k * k;
        p.squashY = 1 - Math.sin(t * 52) * 0.06 * k * k;
        b.ox = Math.sin(t * 83) * r * 0.08 * k * k;
        if (t >= INFLATE && !b.fired) {
          b.fired = 1;
          p.alpha = 0;
          fx.impact(x, cy - r * 0.3, r * 1.25 + 4 * s, COLOR.white, 0.12);
          fx.ring(x, cy, COLOR.white, r * 0.8, r * 2.5 + 5 * s, 0.24);
          fx.burst(x, cy, {
            colors: [main, light, shade, main], n: Math.round(10 * few), speed: (330 + 90 * b.power) * s, size: r * 0.4 + 2.2, life: 0.9, gravity: 560 * s, shape: 'shard', drag: 2.6, ink: true,
            floor: y, depth: r * 0.9, shadow: true, stay: 0.5,
          });
          fx.burst(x, cy, { colors: [COLOR.white, light], n: Math.round(6 * few), speed: 250 * s, size: r * 0.22 + 2.5, life: 0.9, gravity: 380 * s, shape: 'confetti', drag: 2.2, floor: y, depth: r, shadow: true });
          fx.shake(2, 0.15);
          // a flat splat of its colour where it stood
          splat(fx.ground.paint(), x, y, r * 2.2 + 3 * s, b.dir, BODY[b.look.pet][b.look.team]);
        }
        break;
      }
      case 'squish': {
        // a gasp upward, slammed paper-flat, a wobble, and it stays there
        if (t < 0.08) {
          const k = t / 0.08;
          p.squashY = 1 + 0.32 * k;
          p.squashX = 1 - 0.2 * k;
          p.mood = 'scared';
        } else if (t < DEATH_PAYOFF.squish) {
          const k = ((t - 0.08) / (DEATH_PAYOFF.squish - 0.08)) ** 2;
          p.squashY = lerp(1.32, 0.16, k);
          p.squashX = lerp(0.8, 1.9, k);
        } else {
          const w = t - DEATH_PAYOFF.squish;
          const wob = Math.sin(w * 36) * Math.exp(-w * 7);
          p.squashY = 0.18 + 0.1 * wob;
          p.squashX = 1.85 - 0.35 * wob;
          p.mood = 'dead';
          b.flat = true;
          p.alpha = clamp((DUR.squish - t) / 0.3, 0, 1);
          if (!b.fired) {
            b.fired = 1;
            // the grass stays pressed flat where it landed and the pancake stays on it, for the rest of the fight
            // (the body wobbles on top of it, then fades into it)
            fx.stampMark('flat', x, y, r * 4.4 + 4 * s);
            pancake(fx.ground.paint(), x, y, r, BODY[b.look.pet][b.look.team], b.look.pet, false);
            fx.ring(x, y, COLOR.white, r, r * 3.2 + 6 * s, 0.28, 0);
            fx.dust(x, y - 2, Math.round(7 * few), r * 0.5 + 3 * s);
            fx.burst(x, y - 3, { colors: [COLOR.white, light], n: Math.round(5 * few), speed: 190 * s, size: r * 0.2 + 1.6, life: 0.45, gravity: 700 * s, dir: -Math.PI / 2, spread: 1.3, floor: y, depth: r * 0.6, shadow: true });
            fx.shake(1.5 + 1.5 * b.power, 0.18);
          }
        }
        break;
      }
      case 'launch': {
        // a squeeze, then spinning away into the blue sky, and a tiny twinkle where it went
        if (t < 0.05) {
          p.hurt = 1;
          p.squashX = 0.72;
          p.squashY = 1.22;
        } else {
          const k = Math.min(1, (t - 0.05) / 0.48);
          const e = 1 - (1 - k) ** 2;
          // the shadow runs along the ground; the body rises above it and shrinks into the distance
          const gx = lerp(x, b.tx, e);
          const gy = lerp(y, b.ty, e);
          const h = b.th * e;
          b.ox = gx - x;
          b.oy = gy - h - y;
          b.scale = lerp(1, b.ts / s, e) * lerp(1, 0.1, k ** 1.4);
          b.air = true;
          b.shx = gx;
          b.shy = gy;
          b.lift = h / (r * 2.2);
          p.spin = b.b * (t - 0.05) * 26;
          p.squashX = p.squashY = 1;
          p.hurt = 0;
          p.mood = 'scared';
          p.alpha = k >= 1 ? 0 : 1;
          b.puffT -= dt;
          if (b.puffT <= 0 && k < 0.75) {
            b.puffT = 0.035;
            fx.burst(x + b.ox, y + b.oy - r * b.scale, { colors: [COLOR.white], n: 1, speed: 12, size: r * 0.5 * b.scale + 1.5, life: 0.3, gravity: 0, shape: 'puff' });
          }
        }
        if (t >= 0.6 && !b.fired) {
          b.fired = 1;
          const tx = b.tx;
          const ty = b.ty - b.th;
          fx.burst(tx, ty, { colors: [COLOR.white], n: 1, speed: 0, size: 14, life: 0.4, gravity: 0, shape: 'star' });
          fx.burst(tx, ty, { colors: [COLOR.goldLight], n: 3, speed: 50, size: 3.5, life: 0.35, gravity: 0, shape: 'star' });
          fx.ring(tx, ty, COLOR.white, 2, 14, 0.3);
        }
        break;
      }
      case 'slice': {
        // the cut hangs for a beat, then the top slides off and the rest keels over
        if (t >= 0.27 && b.fired < 1) {
          b.fired = 1;
          fx.dust(x + b.b * r * 1.5, y, 3, r * 0.35 + 2 * s);
          // a soft stain of its colour, and the cut carried on into the grass
          const g = fx.ground.paint();
          splat(g, x + b.b * r * 0.4, y, r * 1.5 + 2 * s, b.a, BODY[b.look.pet][b.look.team], 0.55);
          cut(g, x, y, r * 3.2 + 4 * s, b.a);
        }
        if (t >= 0.38 && b.fired < 2) {
          b.fired = 2;
          fx.dust(x - b.b * r * 0.9, y, 3, r * 0.35 + 2 * s);
        }
        break;
      }
      case 'spin': {
        // whirls like a top, slower and wider, then tips over with a bump
        const END = 0.68;
        if (t < END) {
          const k = t / END;
          b.a += lerp(44, 9, k) * dt;
          const c = Math.cos(b.a);
          p.face = c >= 0 ? 1 : -1;
          p.squashX = Math.max(0.2, Math.abs(c));
          p.spin = Math.sin(b.a * 0.5) * (0.05 + 0.42 * k * k);
          p.mood = 'dizzy';
          // it skids over the grass the way it was hit, foreshortened up the pitch
          const d = (16 + 26 * b.power) * s * easeOutCubic(k);
          b.ox = Math.cos(b.dir) * d + Math.sin(b.a * 0.5) * r * 0.45 * k;
          b.oy = Math.sin(b.dir) * d * TILT * 0.7;
          b.puffT -= dt;
          if (b.puffT <= 0) {
            b.puffT = 0.13;
            fx.ring(x + b.ox, y + b.oy, COLOR.white, r * 0.5, r * 1.9 + 3 * s, 0.25, 0);
          }
        } else if (t < 0.8) {
          const k = ((t - END) / 0.12) ** 2;
          p.squashX = 1;
          p.spin = b.b * lerp(0.47, 1.5, k);
          b.c = r * 0.45 * k;
        } else {
          const w = t - 0.8;
          p.spin = b.b * (1.5 + 0.12 * Math.sin(w * 30) * Math.exp(-w * 12));
          p.mood = 'dead';
          b.c = r * 0.45;
          if (!b.fired) {
            b.fired = 1;
            // the swirl it spun into the grass, and a soft stain of its colour where it fell
            const g = fx.ground.paint();
            swirl(g, x + b.ox * 0.5, y + b.oy * 0.5, r * 1.5 + 3 * s, b.b);
            splat(g, x + b.ox + b.b * r * 0.5, y + b.oy, r * 1.6 + 2 * s, b.dir, BODY[b.look.pet][b.look.team], 0.7);
            fx.dust(x + b.ox + b.b * r * 0.6, y + b.oy, Math.round(5 * few), r * 0.4 + 3 * s);
            fx.burst(x + b.ox, y + b.oy - r * 1.6, { colors: SPARK, n: 3, speed: 110 * s, size: r * 0.28 + 3, life: 0.5, gravity: 240, shape: 'star', dir: -Math.PI / 2, spread: 0.9 });
            fx.shake(1.2, 0.12);
          }
          p.alpha = clamp((DUR.spin - t) / 0.2, 0, 1);
        }
        break;
      }
      case 'deflate': {
        // let go like a balloon: zips about in a zig-zag, then flutters down flat
        const end = b.path.length - 2;
        if (t < ZIP) {
          const f = (t / ZIP) * ZIP_LEGS;
          const i = Math.min(ZIP_LEGS - 1, Math.floor(f)) * 2;
          const k = smooth(f - i / 2);
          const dx = b.path[i + 2] - b.path[i];
          const dy = b.path[i + 3] - b.path[i + 1];
          b.ox = b.path[i] + dx * k;
          b.oy = b.path[i + 1] + dy * k + r * 0.9;
          p.face = dx >= 0 ? 1 : -1;
          p.spin = clamp(Math.atan2(dy, Math.abs(dx)), -1, 1) * p.face;
          p.limp = Math.min(1, t / 0.45);
          p.squashX = 1.15;
          p.squashY = 0.9;
          b.scale = lerp(1, 0.78, t / ZIP);
          p.mood = 'scared';
          b.puffT -= dt;
          if (b.puffT <= 0) {
            b.puffT = 0.04;
            fx.burst(x + b.ox - p.face * r * 0.9, y + b.oy - r * 0.9, { colors: [COLOR.white], n: 1, speed: 26 * s, size: r * 0.28 + 2, life: 0.34, gravity: 0, shape: 'puff' });
          }
          if (Math.floor(f) > b.fired && f < ZIP_LEGS) {
            b.fired = Math.floor(f);
            fx.dust(x + b.ox, y + b.oy - r, 3, r * 0.35 + 2 * s);
          }
        } else {
          const k = Math.min(1, (t - ZIP) / 0.25);
          b.ox = b.path[end] + Math.sin(k * 11) * r * 0.9 * (1 - k);
          b.oy = lerp(b.path[end + 1] + r * 0.9, 0, k * k);
          p.spin = Math.sin(k * 12) * 0.5 * (1 - k);
          p.limp = 1;
          p.squashY = lerp(0.9, 0.3, k);
          p.squashX = lerp(1.15, 1.45, k);
          p.mood = 'dead';
          if (k >= 1) {
            b.flat = true;
            if (b.fired < 99) {
              b.fired = 99;
              fx.dust(x + b.ox, y, 3, r * 0.3 + 2 * s, true);
              // the let-down skin stays where it lands
              pancake(fx.ground.paint(), x + b.ox, y, r * 0.95, BODY[b.look.pet][b.look.team], b.look.pet, true);
            }
          }
          p.alpha = clamp((DUR.deflate - t) / 0.14, 0, 1);
        }
        if (!b.flat) {
          // up in the air over its own shadow
          b.air = true;
          b.shx = x + b.ox;
          b.shy = y;
          b.lift = Math.max(0, -b.oy) / (r * 3);
        }
        break;
      }
      case 'shatter': {
        // stone in a snap, a shudder, a crack, and it falls to bits
        if (t < 0.07) {
          const k = t / 0.07;
          p.stone = k;
          p.hurt = 1 - k;
          p.squashY = 1.14 - 0.14 * k;
        } else {
          p.stone = 1;
          p.hurt = 0;
          p.squashY = 1;
          b.ox = Math.sin(t * 95) * r * 0.05 * clamp((t - 0.12) / 0.1, 0, 1);
          b.a = clamp((t - 0.12) / 0.12, 0, 1);
        }
        if (t >= DEATH_PAYOFF.shatter && !b.fired) {
          b.fired = 1;
          p.alpha = 0;
          fx.burst(x, cy, {
            colors: STONES, n: Math.round(13 * few), speed: (250 + 60 * b.power) * s, size: r * 0.4 + 2.5, life: 1.1, gravity: 950 * s, shape: 'shard', ink: true,
            dir: -Math.PI / 2, spread: 1.7, scatter: r * 0.7, floor: y + 2, depth: r * 0.8, shadow: true, stay: 0.4,
          });
          pile(fx.ground.paint(), x, y, r * 0.55 + 1.5 * s);
          fx.dust(x, y - r * 0.5, Math.round(5 * few), r * 0.5 + 3 * s);
          fx.ring(x, cy, COLOR.white, r * 0.5, r * 1.8 + 4 * s, 0.2);
          fx.shake(1.8, 0.15);
        }
        break;
      }
      case 'petals': {
        // a soft swell, then nothing but blossom drifting down to the grass
        const k = Math.min(1, t / DEATH_PAYOFF.petals);
        p.puff = 0.4 * k;
        p.hurt = k;
        p.mood = 'idle';
        if (k >= 1 && !b.fired) {
          b.fired = 1;
          p.alpha = 0;
          fx.ring(x, cy, COLOR.white, r * 0.6, r * 2.1 + 5 * s, 0.3);
          fx.burst(x, cy, { colors: PETALS, n: Math.round(16 * few), speed: 210 * s, size: Math.max(3, r * 0.4), life: 1.5, gravity: 110, shape: 'petal', scatter: r * 0.6, floor: y + 1, depth: r * 1.2, shadow: true, stay: 0.6 });
          // a soft stain of its colour in the middle of the ring the petals settle in
          splat(fx.ground.paint(), x, y, r * 1.5 + 2 * s, b.dir, BODY[b.look.pet][b.look.team], 0.5);
          fx.burst(x, cy, { colors: [COLOR.white], n: 4, speed: 80 * s, size: r * 0.5 + 3, life: 0.4, gravity: -20, shape: 'puff' });
        }
        break;
      }
    }
  }

  private drawBody(ctx: Ctx, b: Body): void {
    if (b.kind === 'slice') return this.drawSlice(ctx, b);
    if (b.pose.alpha <= 0.01) return;
    const r = b.r * b.scale;
    if (r < SPECK) {
      // far off in the sky it is only a speck of its own colour
      ctx.globalAlpha = b.pose.alpha;
      ctx.fillStyle = BODY[b.look.pet][b.look.team][0];
      ctx.beginPath();
      ctx.arc(b.x + b.ox, b.y + b.oy - r, Math.max(0.7, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    ctx.translate(b.x + b.ox, b.y + b.oy + (b.kind === 'spin' ? b.c : 0));
    if (r < SMALL) {
      // the pet art wants some room for its details: draw it at a workable size and shrink the picture
      ctx.scale(r / SMALL, r / SMALL);
      petArt.drawPet(ctx, b.look, b.pose, SMALL);
    } else petArt.drawPet(ctx, b.look, b.pose, r);
    if (b.kind === 'shatter' && b.a > 0) {
      // the crack runs from the head down: a dark line with a lit lower-right lip
      const top = -petArt.headTop(b.look, r) * 0.92;
      const zig = [0.1, -0.22, 0.2, -0.16, 0.12, -0.05];
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.05, top);
      const n = Math.max(1, Math.ceil(b.a * zig.length));
      for (let i = 0; i < n; i++) ctx.lineTo(r * zig[i] * 1.6, top - (top * (i + 1)) / zig.length);
      ctx.lineWidth = Math.max(1.4, r * 0.14);
      ctx.strokeStyle = '#3c4048';
      ctx.stroke();
      ctx.translate(Math.max(0.6, r * 0.05), Math.max(0.6, r * 0.05));
      ctx.lineWidth = Math.max(0.6, r * 0.045);
      ctx.strokeStyle = COLOR.white;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSlice(ctx: Ctx, b: Body): void {
    const s = b.snap;
    if (!s) return;
    const { t, r } = b;
    const dx = Math.cos(b.a);
    const dy = Math.sin(b.a);
    const L = r * 6;
    const k1 = clamp((t - 0.1) / 0.17, 0, 1);
    const k2 = clamp((t - 0.24) / 0.14, 0, 1) ** 2;
    const alpha = clamp((DUR.slice - t) / 0.2, 0, 1);
    for (let half = 0; half < 2; half++) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(b.x, b.y);
      if (half === 0) {
        // what is left standing keels over the other way
        ctx.rotate(-b.b * 1.45 * k2);
        if (k2 >= 1) ctx.translate(0, -r * 0.1);
      } else {
        // the top slides down the cut and drops
        ctx.translate(b.b * r * 1.6 * easeOutCubic(k1), r * 0.95 * k1 * k1 + dy * b.b * r * 0.5 * k1);
        ctx.translate(0, -r);
        ctx.rotate(b.b * 1.25 * k1 * k1);
        ctx.translate(0, r);
      }
      const n = half === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(-dx * L, -r - dy * L);
      ctx.lineTo(dx * L, -r + dy * L);
      ctx.lineTo(dx * L - dy * L * n, -r + dy * L + dx * L * n);
      ctx.lineTo(-dx * L - dy * L * n, -r - dy * L + dx * L * n);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(s.canvas, -s.ox, -s.oy, s.w, s.h);
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------ marks left on the pitch

type Tones = readonly [string, string, string];

/**
 * A flat cartoon splat of a pet's colours lying on the grass: round lobes about a middle and a few drops thrown
 * along the blow (dir, radians in the arena), with thickness (its shade showing on the lower right), a soft ink
 * outline and a highlight from the sun at the upper left. soft (0..1) instead: a soft stain, no outline.
 */
function splat(g: Ctx, x: number, y: number, size: number, dir: number, tones: Tones, soft = 1): void {
  const [main, light] = tones;
  const blobs: number[] = [0, 0, size * 0.48];
  const n = 6;
  const turn = frand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * TAU + frand(-0.3, 0.3);
    const d = size * frand(0.34, 0.5);
    blobs.push(Math.cos(a) * d, Math.sin(a) * d, size * frand(0.15, 0.25));
  }
  for (let i = 0; i < 4; i++) {
    const a = dir + frand(-0.75, 0.75);
    const d = size * frand(0.72, 1.1);
    blobs.push(Math.cos(a) * d, Math.sin(a) * d, size * frand(0.05, 0.1));
  }
  const fill = (color: string, grow: number, dx: number, dy: number, also = false) => {
    g.fillStyle = color;
    g.beginPath();
    for (let pass = 0; pass < (also ? 2 : 1); pass++) {
      const ox = pass ? 0 : dx;
      const oy = pass ? 0 : dy;
      for (let i = 0; i < blobs.length; i += 3) {
        const r = Math.max(0.3, blobs[i + 2] + grow);
        g.moveTo(blobs[i] + ox + r, blobs[i + 1] + oy);
        g.arc(blobs[i] + ox, blobs[i + 1] + oy, r, 0, TAU);
      }
    }
    g.fill();
  };
  g.save();
  g.translate(x, y);
  g.scale(1, GROUND_FLAT);
  if (soft < 1) {
    // a stain: the pet's light tone (nearly opaque, so it stays pastel on the green), its middle paler
    g.globalAlpha = 0.8 + 0.15 * soft;
    fill(light, 0, 0, 0);
    g.globalAlpha = 0.5;
    fill(COLOR.white, -size * 0.14, -size * 0.04, -size * 0.06);
    g.restore();
    return;
  }
  // a pastel splat with thickness: the pet's colour as its lower-right lip, its light tone on top
  const lip = Math.max(0.8, size * 0.07);
  fill(MARK_INK, 1, lip * 0.5, lip, true);
  fill(main, 0, lip * 0.5, lip);
  fill(light, 0, 0, 0);
  // the sun on its upper left
  g.fillStyle = 'rgba(255, 255, 255, 0.6)';
  g.beginPath();
  g.ellipse(-size * 0.16, -size * 0.17, size * 0.22, size * 0.12, -0.3, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.85)';
  g.beginPath();
  g.arc(-size * 0.24, -size * 0.22, Math.max(0.7, size * 0.05), 0, TAU);
  g.fill();
  g.restore();
}

/**
 * What a squished pet leaves: flattened into a pancake of its colour lying on the grass, a few little legs poking
 * out at the sides, with a lip of thickness, a soft outline and the sun's highlight. let-down: a deflated skin,
 * a little smaller and crumpled.
 */
function pancake(g: Ctx, x: number, y: number, r: number, tones: Tones, pet: PetType, letDown: boolean): void {
  const [main, light, shade] = tones;
  const rx = r * (pet === 'frog' ? 1.75 : 1.55) * (letDown ? 0.85 : 1);
  const ry = rx * GROUND_FLAT * 0.6;
  const lip = Math.max(0.8, r * 0.14);
  g.save();
  g.translate(x, y);
  // the little legs: short rounded strokes out of each side
  g.lineCap = 'round';
  const legs = pet === 'frog' ? [-0.35, 0.45] : [-0.45, 0.05, 0.5];
  for (const pass of [0, 1]) {
    g.strokeStyle = pass ? shade : MARK_INK;
    g.lineWidth = Math.max(1.2, r * 0.24) + (pass ? 0 : 1.6);
    g.beginPath();
    for (const side of [-1, 1]) {
      for (const a of legs) {
        const c = Math.cos(a);
        const sn = Math.sin(a);
        g.moveTo(side * c * rx * 0.8, sn * ry * 0.8);
        g.lineTo(side * c * rx * 1.18, sn * ry * 1.45 + ry * 0.1);
      }
    }
    g.stroke();
  }
  // the body: an outline, a lip of its colour, its light tone on top, a highlight
  const body = (dx: number, dy: number, grow: number) => {
    g.beginPath();
    if (letDown) {
      // crumpled: a few soft bumps round the edge
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * TAU;
        const k = 1 + (i % 2 ? -0.08 : 0.05);
        const px = dx + Math.cos(a) * (rx * k + grow);
        const py = dy + Math.sin(a) * (ry * k + grow);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
    } else g.ellipse(dx, dy, rx + grow, ry + grow, 0, 0, TAU);
  };
  body(lip * 0.3, lip * 0.6, 1);
  g.fillStyle = MARK_INK;
  g.fill();
  body(lip * 0.3, lip * 0.6, 0);
  g.fillStyle = main;
  g.fill();
  body(0, 0, 0);
  g.fillStyle = light;
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.6)';
  g.beginPath();
  g.ellipse(-rx * 0.32, -ry * 0.3, rx * 0.3, ry * 0.26, -0.15, 0, TAU);
  g.fill();
  if (letDown) {
    // a crease across it
    g.strokeStyle = main;
    g.lineWidth = Math.max(0.8, r * 0.1);
    g.beginPath();
    g.moveTo(-rx * 0.35, ry * 0.15);
    g.quadraticCurveTo(0, -ry * 0.25, rx * 0.4, ry * 0.2);
    g.stroke();
  }
  g.restore();
}

/** A few round drops of a pet's light tone with a lip of its colour, thrown along dir (arena radians). */
function drops(g: Ctx, x: number, y: number, size: number, dir: number, tones: Tones): void {
  const [main, light] = tones;
  for (let i = 0; i < 3; i++) {
    const a = dir + frand(-0.6, 0.6);
    const d = size * frand(0.2, 1);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d * GROUND_FLAT;
    const r = Math.max(0.9, size * frand(0.1, 0.17));
    g.fillStyle = MARK_INK;
    g.beginPath();
    g.ellipse(px + r * 0.15, py + r * 0.2, r + 0.8, r * GROUND_FLAT + 0.8, 0, 0, TAU);
    g.fill();
    g.fillStyle = main;
    g.beginPath();
    g.ellipse(px + r * 0.15, py + r * 0.2, r, r * GROUND_FLAT, 0, 0, TAU);
    g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.ellipse(px, py, r * 0.85, r * GROUND_FLAT * 0.85, 0, 0, TAU);
    g.fill();
  }
}

/** A skid of worn grass along dir (arena radians), len long and w wide, from (x, y). */
function skid(g: Ctx, x: number, y: number, len: number, w: number, dir: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, GROUND_FLAT);
  g.rotate(dir);
  g.fillStyle = WORN;
  g.beginPath();
  g.moveTo(-w * 0.3, -w * 0.5);
  g.quadraticCurveTo(len * 0.5, -w * 0.62, len, 0);
  g.quadraticCurveTo(len * 0.5, w * 0.62, -w * 0.3, w * 0.5);
  g.arc(-w * 0.3, 0, w * 0.5, Math.PI / 2, -Math.PI / 2);
  g.fill();
  // a few blades combed along it, in the deeper green of the grass
  g.strokeStyle = 'rgba(46, 120, 52, 0.45)';
  g.lineWidth = Math.max(0.8, w * 0.1);
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const o = frand(-0.3, 0.3) * w;
    const a = frand(0, 0.5) * len;
    g.moveTo(a, o);
    g.lineTo(a + len * frand(0.2, 0.4), o * 0.8);
  }
  g.stroke();
  g.restore();
}

/** A cut carried on into the grass at angle a (screen radians): a thin bright scratch with its shadow under it. */
function cut(g: Ctx, x: number, y: number, len: number, a: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, GROUND_FLAT);
  g.rotate(a);
  const w = Math.max(1, len * 0.035);
  for (const [dy, color] of [[w * 0.9, 'rgba(18, 58, 34, 0.28)'], [0, 'rgba(255, 253, 236, 0.92)']] as const) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(-len / 2, dy);
    g.quadraticCurveTo(0, dy - w, len / 2, dy);
    g.quadraticCurveTo(0, dy + w, -len / 2, dy);
    g.fill();
  }
  g.restore();
}

/** The swirl a pet spun into the grass: two open rings of worn grass, turning the way it spun (side). */
function swirl(g: Ctx, x: number, y: number, r: number, side: number): void {
  g.save();
  g.translate(x, y);
  g.scale(side, GROUND_FLAT);
  g.strokeStyle = WORN;
  g.lineCap = 'round';
  const a0 = frand(0, TAU);
  g.lineWidth = Math.max(1.2, r * 0.22);
  g.beginPath();
  g.arc(0, 0, r, a0, a0 + TAU * 0.72);
  g.stroke();
  g.lineWidth = Math.max(1, r * 0.15);
  g.beginPath();
  g.arc(r * 0.12, 0, r * 0.55, a0 + 2, a0 + 2 + TAU * 0.6);
  g.stroke();
  g.restore();
}

/** A little pile of stone bits: a few chunky chips leaning together, lit from the upper left, with a soft shadow. */
function pile(g: Ctx, x: number, y: number, size: number): void {
  g.fillStyle = GRASS_SHADE;
  g.globalAlpha = 0.2;
  g.beginPath();
  g.ellipse(x + size * 0.3, y + size * 0.15, size * 1.5, size * 1.5 * GROUND_FLAT * 0.7, 0, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
  const bits = [
    [-0.8, 0.1, 0.7, 1],
    [0.75, 0.15, 0.65, 0],
    [0, -0.3, 0.9, 2],
    [-0.25, 0.35, 0.55, 1],
    [0.4, 0.4, 0.5, 2],
  ];
  for (const [dx, dy, k, c] of bits) drawShard(g, x + dx * size, y + dy * size - size * 0.3, size * k, frand(0, TAU), STONES[c], true);
}
