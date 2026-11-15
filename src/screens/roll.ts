import { sfx } from '../audio/engine';
import { MAX_LEVEL, PET_INFO, PIECE_NAME, PIECE_TYPES, cls, isPet, tierOf } from '../data';
import { Fx } from '../draw/fx';
import { drawPiece, type PieceLike } from '../draw/pieces';
import { classBadge, classBadgeSize, fitLabel } from '../draw/ui';
import { badgeLine } from './panels';
import { fpick, frand } from '../rng';
import { CLASS_FX, COLOR, H, TIER, TYPE, UI, W } from '../theme';
import type { PetType, RollResult } from '../types';
import { clamp, easeOutBack, easeOutCubic, label, rr, textWidth, type Ctx, type Rect } from '../util';

/*
 * The roll: plain, no slot machine and no case art. The screen dims to a soft empty background and the prize spins
 * in the middle like a coin: on every half turn its face flicks to another unit or item, quick at first, then
 * slower and slower (each flick ticks a little higher) until it lands on the prize with a soft thump. A beat later it
 * pops: its name, its rung (a unit) or class (an item), and a burst of sparkles sized to how rare it is. A tap
 * collects it: it flies down into its tray slot. CASE and ELITE both use it.
 */

/** The prize tile in the middle of the screen. */
const PRIZE = { x: W / 2, y: 470, size: 196 };
const FADE = 0.25; // the background dims in
const FIRST = 0.05; // the first flick's length
const SLOW = 1.14; // each flick is this much longer than the one before
const FLICKS = 15;
const LAND = 0.32; // the landing thump, before the pop
const FLY = 0.42; // the prize's flight to its tray slot

type Phase = 'spin' | 'land' | 'shown' | 'fly';

/** How rare a prize is, 1..7: an item's class, a unit's look-alike tier. */
const rarity = (r: RollResult) => (isPet(r.type) ? tierOf(r.rung) : r.level);

export class RollOverlay {
  private res: RollResult | null = null;
  private phase: Phase = 'spin';
  private t = 0;
  private age = 0;
  private faces: PieceLike[] = [];
  private times: number[] = [];
  private ticked = 0;
  private popped = false;
  private fx = new Fx();
  private target: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** called once the prize has landed in its tray slot */
  onDone: ((res: RollResult) => void) | null = null;

  get active(): boolean {
    return this.res !== null;
  }

  /** the piece id that should stay hidden on the tray while it is rolled and flying */
  get hiddenId(): number {
    return this.res ? this.res.piece.id : -1;
  }

  /** Starts the roll of an opened case. `slot` is where its piece waits on the tray (the prize flies there). */
  start(res: RollResult, slot: Rect): void {
    this.res = res;
    this.target = slot;
    this.phase = 'spin';
    this.t = 0;
    this.age = 0;
    this.ticked = 0;
    this.popped = false;
    this.fx.clear();
    // the faces that flick past: random units and items, then the prize
    this.faces = [];
    let last = '';
    for (let i = 0; i < FLICKS; i++) {
      let f: PieceLike;
      do {
        const type = fpick(PIECE_TYPES);
        f = { type, level: isPet(type) ? 1 : Math.min(MAX_LEVEL, 1 + Math.floor(frand(0, 1) ** 2.4 * 6)), count: 1 };
      } while (f.type === last);
      last = f.type;
      this.faces.push(f);
    }
    this.faces.push({ type: res.type, level: res.level, count: 1 });
    this.times = [0];
    let d = FIRST;
    for (let i = 0; i < FLICKS; i++) {
      this.times.push(this.times[i] + d);
      d *= SLOW;
    }
    sfx.play('rollStart', rarity(res));
  }

  private get spinEnd() {
    return FADE + this.times[this.times.length - 1];
  }

  /** A tap: skips the spin to its landing, or collects a shown prize. */
  tap(): void {
    if (!this.res) return;
    if (this.phase === 'spin') {
      this.t = this.spinEnd;
      this.ticked = FLICKS;
      return;
    }
    if (this.phase === 'land') {
      this.age = LAND;
      return;
    }
    if (this.phase === 'shown' && this.age > 0.35) {
      this.phase = 'fly';
      this.age = 0;
      sfx.play('collect', rarity(this.res));
    }
  }

  update(dt: number): void {
    if (!this.res) return;
    this.fx.update(dt);
    this.t += dt;
    this.age += dt;
    if (this.phase === 'spin') {
      const s = this.t - FADE;
      while (this.ticked < FLICKS && s >= this.times[this.ticked] + (this.times[this.ticked + 1] - this.times[this.ticked]) / 2) {
        this.ticked++;
        sfx.play('spinTick', this.ticked / FLICKS);
      }
      if (this.t >= this.spinEnd) {
        this.phase = 'land';
        this.age = 0;
        sfx.play('spinLand', rarity(this.res));
        this.fx.ring(PRIZE.x, PRIZE.y + PRIZE.size * 0.4, UI.borderStrong, 20, 130, 0.4);
      }
    } else if (this.phase === 'land' && this.age >= LAND) {
      this.phase = 'shown';
      this.age = 0;
      this.pop();
    } else if (this.phase === 'fly' && this.age >= FLY) {
      const res = this.res;
      this.res = null;
      this.onDone?.(res);
    }
  }

  /** The prize pops: its sound and a burst sized to its rarity. */
  private pop(): void {
    const r = this.res!;
    if (this.popped) return;
    this.popped = true;
    const k = rarity(r);
    const i = k - 1;
    if (isPet(r.type)) sfx.play('unitReveal', r.rung);
    else sfx.play('itemReveal', r.level);
    const colors = i === 6 ? [TIER.metalLight[6], CLASS_FX.sss, COLOR.white] : [TIER.metal[i], TIER.metalLight[i], CLASS_FX.spark];
    this.fx.ring(PRIZE.x, PRIZE.y, TIER.metalLight[i], 30, 120 + i * 22, 0.5);
    this.fx.burst(PRIZE.x, PRIZE.y, { colors, n: 10 + i * 7, speed: 180 + i * 50, size: 6 + i * 0.6, life: 0.8 + i * 0.1, gravity: 120, shape: 'star', drag: 1.6 });
    if (k >= 4) this.fx.burst(PRIZE.x, PRIZE.y, { colors, n: 12 + (k - 4) * 14, speed: 520, size: 7, life: 1.4, gravity: 480, shape: 'confetti', dir: -Math.PI / 2, spread: 1.2, drag: 1 });
    if (k >= 5) this.fx.shake(2 + (k - 5) * 2, 0.35);
  }

  render(ctx: Ctx, t: number): void {
    const r = this.res;
    if (!r) return;
    const fade = this.phase === 'fly' ? 1 - easeOutCubic(clamp(this.age / FLY, 0, 1)) : clamp(this.t / FADE, 0, 1);
    // the soft empty background: a calm wash, lighter in the middle
    ctx.save();
    ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(PRIZE.x, PRIZE.y, 40, PRIZE.x, PRIZE.y, H * 0.7);
    g.addColorStop(0, '#f8f6f2');
    g.addColorStop(1, '#d8d4cc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    ctx.translate(this.fx.camera.x, this.fx.camera.y);
    this.fx.drawUnder(ctx);
    const k = rarity(r);
    // a soft halo behind a rare prize, once it is shown
    if (this.phase === 'shown' && k >= 4) {
      const a = clamp(this.age / 0.4, 0, 1) * (0.55 + 0.15 * Math.sin(t * 2.4));
      const hg = ctx.createRadialGradient(PRIZE.x, PRIZE.y, 20, PRIZE.x, PRIZE.y, 190 + k * 8);
      hg.addColorStop(0, `rgba(245, 230, 190, ${a.toFixed(3)})`);
      hg.addColorStop(1, 'rgba(245, 230, 190, 0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, PRIZE.y - 320, W, 640);
    }
    this.drawPrize(ctx, t);
    if (this.phase === 'shown') this.drawCaption(ctx, t);
    this.fx.drawOver(ctx);
    ctx.restore();
    this.fx.drawScreen(ctx);
  }

  private drawPrize(ctx: Ctx, t: number): void {
    const r = this.res!;
    let face: PieceLike;
    let sx = 1;
    let sy = 1;
    let x = PRIZE.x;
    let y = PRIZE.y;
    let size = PRIZE.size;
    if (this.phase === 'spin') {
      const s = Math.max(0, this.t - FADE);
      let i = 0;
      while (i < FLICKS - 1 && s >= this.times[i + 1]) i++;
      const d = this.times[i + 1] - this.times[i];
      const u = clamp((s - this.times[i]) / d, 0, 1);
      // a coin turning a half turn: the face changes when it is edge-on
      sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * u)));
      face = u < 0.5 ? this.faces[i] : this.faces[i + 1];
      // it comes up from small as the background dims in
      const grow = easeOutBack(clamp(this.t / (FADE + 0.15), 0, 1));
      sx *= grow;
      sy = grow;
      y += Math.sin(this.t * 9) * 3 * (1 - s / this.times[FLICKS]);
    } else {
      face = { type: r.type, level: r.level, count: 1 };
      if (this.phase === 'land') {
        // the thump: a squash that springs back
        const u = clamp(this.age / LAND, 0, 1);
        const q = Math.sin(u * Math.PI) * (1 - u) * 0.9;
        sx = 1 + q * 0.22;
        sy = 1 - q * 0.2;
      } else if (this.phase === 'shown') {
        const u = clamp(this.age / 0.4, 0, 1);
        const pop = 1 + 0.16 * Math.sin(u * Math.PI) * (1 - u * 0.5);
        sx = sy = pop * (1 + 0.015 * Math.sin(t * 2.2));
        y += Math.sin(t * 1.8) * 4;
      } else {
        // the flight to the tray slot: down and smaller, along a soft arc
        const u = easeOutCubic(clamp(this.age / FLY, 0, 1));
        const tx = this.target.x + this.target.w / 2;
        const ty = this.target.y + this.target.h / 2;
        x = PRIZE.x + (tx - PRIZE.x) * u;
        y = PRIZE.y + (ty - PRIZE.y) * u - Math.sin(u * Math.PI) * 60;
        size = PRIZE.size + (this.target.w - PRIZE.size) * u;
      }
    }
    // the shadow on the empty floor
    if (this.phase !== 'fly') {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#3c372e';
      ctx.beginPath();
      ctx.ellipse(PRIZE.x, PRIZE.y + size * 0.56, size * 0.4 * Math.max(0.35, sx), size * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    drawPiece(ctx, face, { x: -size / 2, y: -size / 2, w: size, h: size }, { t, bare: this.phase === 'spin' });
    ctx.restore();
  }

  private drawCaption(ctx: Ctx, t: number): void {
    const r = this.res!;
    const a = clamp((this.age - 0.08) / 0.25, 0, 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    const top = PRIZE.y + PRIZE.size / 2 + 52;
    const lift = (1 - easeOutCubic(a)) * 14;
    const name = PIECE_NAME[r.type].toUpperCase();
    if (r.fresh) {
      // NEW on a small accent tag above the prize
      const tw = 78;
      rr(ctx, PRIZE.x - tw / 2, PRIZE.y - PRIZE.size / 2 - 52, tw, 30, 15);
      ctx.fillStyle = UI.accent;
      ctx.fill();
      label(ctx, 'NEW!', PRIZE.x, PRIZE.y - PRIZE.size / 2 - 36, TYPE.body, { color: UI.accentText, weight: 700, track: 2 });
    }
    fitLabel(ctx, name, PRIZE.x, top + lift, TYPE.title, W - 60, { color: UI.text, weight: 700, track: 2 });
    const y2 = top + 52 + lift;
    if (isPet(r.type)) {
      const info = PET_INFO[r.type as PetType];
      badgeLine(ctx, r.rung, `RUNG ${r.rung} OF 12  ·  ${info.role.toUpperCase()}`, PRIZE.x, y2, W - 60);
      fitLabel(ctx, info.trait, PRIZE.x, y2 + 40, TYPE.body, W - 80, { color: UI.text });
    } else {
      const bs = classBadgeSize(r.level, 1.3);
      const text = cls(r.level).toUpperCase();
      const tw = textWidth(ctx, text, TYPE.lead, 700, 1.5);
      const x0 = PRIZE.x - (bs.w + 10 + tw) / 2;
      classBadge(ctx, r.level, x0, y2, 1.3, t);
      label(ctx, text, x0 + bs.w + 10, y2 + 1, TYPE.lead, { align: 'left', color: UI.tierText[Math.min(6, r.level - 1)], weight: 700, track: 1.5 });
    }
    if (r.pity) label(ctx, 'LUCKY ROLL', PRIZE.x, top - 18 + lift, TYPE.caption, { color: UI.rewardDark, weight: 700, track: 2 });
    // tap to collect, breathing
    if (this.age > 0.5) {
      ctx.globalAlpha = a * (0.55 + 0.35 * Math.sin(t * 3));
      label(ctx, 'TAP TO COLLECT', PRIZE.x, H - 150, TYPE.lead, { color: UI.textDim, weight: 700, track: 3 });
    }
    ctx.restore();
  }
}
