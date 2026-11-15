import { sfx } from '../audio/engine';
import { MAX_LEVEL, PET_INFO, PET_TYPES, PIECE_NAME, PIECE_TYPES, cls, isPet, rungOf, tierOf } from '../data';
import { Fx } from '../draw/fx';
import { pieceIcon, type PieceLike } from '../draw/pieces';
import { classBadge, classBadgeSize, classColorOnDark, dropLabel, fitLabel, rungBadge } from '../draw/ui';
import { badgeLine, wrap } from './panels';
import { fchance, fpick, frand } from '../rng';
import { CLASS_FX, H, RARITY, TIER, TYPE, UI, W } from '../theme';
import type { PetType, RollResult } from '../types';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, label, rr, textWidth, type Ctx, type Rect } from '../util';

/*
 * THE ROLL, like the roll games on Roblox: a plain, empty deep background, and the prize spins in a VERTICAL REEL
 * from top to bottom. A column of prize cards (units and items, each tinted by its rarity) scrolls downward through a
 * centre marker, very fast at first and slowing down, ticking as each card passes; it overshoots a little and
 * settles back on the prize. The neighbours above and below fade out, the prize card thumps, then pops: its name,
 * its rung (a unit) or class (an item) and a burst sized to its rarity. A tap collects it: it flies down into its tray
 * slot. A tap during the spin skips to the landing. CASE and ELITE both use it.
 */

const CENTER = { x: W / 2, y: 452 };
const CARD = 172; // a reel card, square
const PITCH = 190; // card to card
const FILLERS = 26; // cards that pass before the prize
const FADE = 0.22; // the background dims in
const SPIN = 2.7; // the reel's run, fast then slow
const OVER = 0.24; // it overshoots by this share of a card ...
const SETTLE = 0.34; // ... and settles back over this long
const LAND = 0.24; // the landing thump, before the pop
const FLY = 0.42; // the prize's flight to its tray slot
const SEEN = 2.7; // cards seen above and below the marker (in pitches)

type Phase = 'spin' | 'settle' | 'land' | 'shown' | 'fly';

/** How rare a piece is, 1..7: an item's class, a unit's look-alike tier. */
const rarityOf = (p: PieceLike) => (isPet(p.type) ? tierOf(rungOf(p.type as PetType)) : p.level);
const rarity = (r: RollResult) => (isPet(r.type) ? tierOf(r.rung) : r.level);

/** A filler card: mostly common, now and then a rare one to tease. */
function filler(caseKind: 'case' | 'elite'): PieceLike {
  const roll = frand(0, 1);
  const lv = Math.min(MAX_LEVEL, 1 + Math.floor(roll ** 2.8 * (caseKind === 'elite' ? 6.6 : 6.2)) + (caseKind === 'elite' ? 1 : 0));
  if (fchance(0.4)) {
    // a unit whose rarity is about lv
    const pets = PET_TYPES.filter((p) => Math.abs(tierOf(rungOf(p)) - lv) <= 1);
    return { type: fpick(pets.length ? pets : PET_TYPES), level: 1, count: 1 };
  }
  const items = PIECE_TYPES.filter((t) => !isPet(t));
  return { type: fpick(items), level: lv, count: 1 };
}

export class RollOverlay {
  private res: RollResult | null = null;
  private phase: Phase = 'spin';
  private t = 0;
  private age = 0;
  /** the reel, top to bottom: [three cards above the prize, THE PRIZE, the fillers that pass before it ...] */
  private reel: PieceLike[] = [];
  private prizeIndex = 0;
  private passed = 0;
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

  /** where the roll is (for the play-check script) */
  get state(): Phase | 'off' {
    return this.res ? this.phase : 'off';
  }

  /** Starts the roll of an opened case. `slot` is where its piece waits on the tray (the prize flies there). */
  start(res: RollResult, slot: Rect): void {
    this.res = res;
    this.target = slot;
    this.phase = 'spin';
    this.t = 0;
    this.age = 0;
    this.passed = 0;
    this.popped = false;
    this.fx.clear();
    // the reel scrolls DOWN, so the cards that pass the marker before the prize are below it in the column (the
    // nearest passes last), and a few above it come into view as it settles
    const above = [filler(res.case), filler(res.case), filler(res.case)];
    const below: PieceLike[] = [];
    let last = res.type as string;
    for (let i = 0; i < FILLERS + 4; i++) {
      let f = filler(res.case);
      while (f.type === last) f = filler(res.case);
      last = f.type;
      below.push(f);
    }
    this.reel = [...above, { type: res.type, level: res.level, count: 1 }, ...below];
    this.prizeIndex = above.length;
    sfx.play('rollStart', rarity(res));
  }

  /**
   * How far the reel has scrolled, in px: 0 at the start (the card FILLERS above the prize sits on the marker), and
   * FILLERS x PITCH when the prize does. It runs fast and slows (an ease-out), passes the mark by OVER, settles back.
   */
  private scroll(): number {
    const dist = FILLERS * PITCH;
    const over = OVER * PITCH;
    const s = this.t - FADE * 0.5;
    if (s <= 0) return 0;
    if (s < SPIN) {
      const u = s / SPIN;
      return (dist + over) * (1 - (1 - u) ** 4);
    }
    const v = clamp((s - SPIN) / SETTLE, 0, 1);
    return dist + over * (1 - easeInOutCubic(v));
  }

  private get spinEnd() {
    return FADE * 0.5 + SPIN + SETTLE;
  }

  /** A tap: skips the spin to its landing, or collects a shown prize. */
  tap(): void {
    if (!this.res) return;
    if (this.phase === 'spin' || this.phase === 'settle') {
      this.t = Math.max(this.t, this.spinEnd);
      this.passed = FILLERS;
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
    if (this.phase === 'spin' || this.phase === 'settle') {
      // a tick each time a card crosses the marker
      const crossed = Math.min(FILLERS, Math.floor((this.scroll() + PITCH / 2) / PITCH));
      while (this.passed < crossed) {
        this.passed++;
        sfx.play('spinTick', this.passed / FILLERS);
      }
      if (this.phase === 'spin' && this.t - FADE * 0.5 >= SPIN) this.phase = 'settle';
      if (this.t >= this.spinEnd) {
        this.phase = 'land';
        this.age = 0;
        sfx.play('spinLand', rarity(this.res));
        const i = rarity(this.res) - 1;
        this.fx.ring(CENTER.x, CENTER.y, RARITY.light[i], CARD * 0.4, CARD * 0.9, 0.3);
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
    const colors = i === 6 ? [RARITY.main[6], RARITY.light[4], CLASS_FX.sss, '#ffffff'] : [RARITY.main[i], RARITY.light[i], TIER.metalLight[i], '#ffffff'];
    this.fx.flash('#ffffff', 0.12 + i * 0.04, 0.25);
    this.fx.ring(CENTER.x, CENTER.y, RARITY.light[i], 40, 140 + i * 24, 0.5);
    this.fx.burst(CENTER.x, CENTER.y, { colors, n: 12 + i * 7, speed: 200 + i * 50, size: 6 + i * 0.6, life: 0.8 + i * 0.1, gravity: 120, shape: 'star', drag: 1.6 });
    if (k >= 4) this.fx.burst(CENTER.x, CENTER.y, { colors, n: 14 + (k - 4) * 14, speed: 540, size: 7, life: 1.4, gravity: 480, shape: 'confetti', dir: -Math.PI / 2, spread: 1.2, drag: 1 });
    if (k >= 5) this.fx.shake(2 + (k - 5) * 2, 0.35);
  }

  render(ctx: Ctx, t: number): void {
    const r = this.res;
    if (!r) return;
    const fade = this.phase === 'fly' ? 1 - easeOutCubic(clamp(this.age / FLY, 0, 1)) : clamp(this.t / FADE, 0, 1);
    // the plain, empty background: deep, a little lighter behind the marker
    ctx.save();
    ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(CENTER.x, CENTER.y, 40, CENTER.x, CENTER.y, H * 0.72);
    g.addColorStop(0, '#3b2e7a');
    g.addColorStop(0.5, '#251d52');
    g.addColorStop(1, '#141030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    ctx.translate(this.fx.camera.x, this.fx.camera.y);
    this.fx.drawUnder(ctx);
    const k = rarity(r);
    // a soft halo behind the prize once it is shown, in its rarity's colour
    if (this.phase === 'shown') {
      const a = clamp(this.age / 0.4, 0, 1) * (0.5 + 0.12 * Math.sin(t * 2.4)) * (0.5 + k * 0.08);
      const hg = ctx.createRadialGradient(CENTER.x, CENTER.y, 20, CENTER.x, CENTER.y, 190 + k * 10);
      hg.addColorStop(0, RARITY.main[k - 1]);
      hg.addColorStop(1, `${RARITY.main[k - 1]}00`);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.fillStyle = hg;
      ctx.fillRect(0, CENTER.y - 330, W, 660);
      if (k >= 4) this.rays(ctx, t, RARITY.light[k - 1], a);
      ctx.restore();
    }
    if (this.phase === 'fly') this.drawFlying(ctx, t);
    else this.drawReel(ctx, t, fade);
    if (this.phase === 'shown') this.drawCaption(ctx, t);
    this.fx.drawOver(ctx);
    ctx.restore();
    this.fx.drawScreen(ctx);
  }

  private rays(ctx: Ctx, t: number, color: string, a: number) {
    ctx.save();
    ctx.globalAlpha = a * 0.45;
    ctx.translate(CENTER.x, CENTER.y);
    ctx.rotate(t * 0.35);
    ctx.fillStyle = color;
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-20, -300);
      ctx.lineTo(20, -300);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** the reel: the cards around the marker, the far ones fading out; then the marker over it */
  private drawReel(ctx: Ctx, t: number, fade: number) {
    const s = this.phase === 'spin' || this.phase === 'settle' ? this.scroll() : FILLERS * PITCH;
    // card i sits at CENTER.y + (i - top) x PITCH + s: the whole column moves DOWN as s grows
    const top = this.prizeIndex + FILLERS; // the card on the marker at s = 0
    const shown = this.phase === 'land' || this.phase === 'shown';
    const away = shown ? clamp((this.phase === 'shown' ? LAND + this.age : this.age) / 0.35, 0, 1) : 0;
    const speed = this.phase === 'spin' ? clamp(1 - (this.t - FADE * 0.5) / SPIN, 0, 1) : 0;
    // the column's track: a soft dark lane behind the cards
    ctx.save();
    ctx.globalAlpha = fade * (1 - away);
    const lane = ctx.createLinearGradient(0, CENTER.y - PITCH * SEEN, 0, CENTER.y + PITCH * SEEN);
    lane.addColorStop(0, 'rgba(12, 8, 32, 0)');
    lane.addColorStop(0.5, 'rgba(12, 8, 32, 0.45)');
    lane.addColorStop(1, 'rgba(12, 8, 32, 0)');
    ctx.fillStyle = lane;
    rr(ctx, CENTER.x - CARD / 2 - 18, CENTER.y - PITCH * SEEN, CARD + 36, PITCH * SEEN * 2, 30);
    ctx.fill();
    ctx.restore();
    const first = Math.floor(top - s / PITCH - SEEN - 1);
    const last = Math.ceil(top - s / PITCH + SEEN + 1);
    for (let i = Math.max(0, first); i <= Math.min(this.reel.length - 1, last); i++) {
      const y = CENTER.y + (i - top) * PITCH + s;
      const d = Math.abs(y - CENTER.y);
      if (d > PITCH * SEEN) continue;
      const prize = i === this.prizeIndex && shown;
      let a = clamp(1 - (d - PITCH * 0.55) / (PITCH * (SEEN - 0.55)), 0, 1) * fade;
      if (!prize) a *= 1 - away;
      if (a <= 0.01) continue;
      let sc = 1 - 0.16 * clamp(d / (PITCH * 2), 0, 1);
      let sx = 1;
      let sy = 1;
      if (prize && this.phase === 'land') {
        const u = clamp(this.age / LAND, 0, 1);
        const q = Math.sin(u * Math.PI) * (1 - u) * 0.9;
        sx = 1 + q * 0.2;
        sy = 1 - q * 0.18;
      } else if (prize) {
        const u = clamp(this.age / 0.4, 0, 1);
        sc = 1 + 0.12 * easeOutBack(u) + 0.015 * Math.sin(t * 2.2);
      }
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(CENTER.x, y + (prize && this.phase === 'shown' ? Math.sin(t * 1.8) * 3 : 0));
      ctx.scale(sc * sx, sc * sy * (1 + speed * 0.1));
      this.card(ctx, this.reel[i], t, speed);
      ctx.restore();
    }
    // the marker: two chevrons pointing at the centre card and a glowing frame round it
    const ma = fade * (1 - away);
    if (ma > 0) {
      ctx.save();
      ctx.globalAlpha *= ma;
      const fw = CARD + 22;
      ctx.shadowColor = 'rgba(255, 220, 120, 0.8)';
      ctx.shadowBlur = 16;
      rr(ctx, CENTER.x - fw / 2, CENTER.y - fw / 2, fw, fw, 26);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffe08a';
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (const side of [-1, 1]) {
        const x = CENTER.x + side * (fw / 2 + 26);
        const bob = Math.sin(t * 8) * 3 * side;
        ctx.beginPath();
        ctx.moveTo(x - bob + side * 14, CENTER.y - 20);
        ctx.lineTo(x - bob - side * 12, CENTER.y);
        ctx.lineTo(x - bob + side * 14, CENTER.y + 20);
        ctx.closePath();
        ctx.fillStyle = '#ffe08a';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#a8700f';
        ctx.stroke();
      }
      ctx.restore();
    }
    // the case kind, quietly under the reel while it spins
    if (!shown) {
      ctx.save();
      ctx.globalAlpha *= fade * 0.9;
      const kind = this.res!.case;
      dropLabel(ctx, kind === 'elite' ? 'ELITE ROLL' : 'CASE ROLL', W / 2, H - 150, TYPE.h2, W - 40, { color: kind === 'elite' ? '#d6bffb' : '#ffc27a', drop: 'rgba(8, 4, 24, 0.7)', track: 4 });
      ctx.restore();
    }
  }

  /** a reel card centred on (0, 0): its rarity's colours, the piece, its badge and a rarity strip */
  private card(ctx: Ctx, p: PieceLike, t: number, blur: number) {
    const i = rarityOf(p) - 1;
    const h = CARD / 2;
    rr(ctx, -h, -h + 6, CARD, CARD, 22);
    ctx.fillStyle = 'rgba(8, 4, 24, 0.6)';
    ctx.fill();
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, RARITY.light[i]);
    g.addColorStop(0.55, RARITY.main[i]);
    g.addColorStop(1, RARITY.dark[i]);
    rr(ctx, -h, -h, CARD, CARD, 22);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    rr(ctx, -h, -h, CARD, CARD, 22);
    ctx.clip();
    // a soft light from the top and the rarity strip along the bottom
    const sg = ctx.createRadialGradient(0, -h * 0.4, 6, 0, -h * 0.4, CARD * 0.7);
    sg.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-h, -h, CARD, CARD);
    ctx.fillStyle = 'rgba(8, 4, 24, 0.32)';
    ctx.fillRect(-h, h - 30, CARD, 30);
    if (i === 6) {
      const u = ((t * 0.6) % 1) * (CARD + 80) - 40;
      const sh = ctx.createLinearGradient(-h + u - 30, 0, -h + u + 30, 0);
      sh.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sh.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)');
      sh.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sh;
      ctx.fillRect(-h, -h, CARD, CARD);
    }
    ctx.restore();
    rr(ctx, -h + 2, -h + 2, CARD - 4, CARD - 4, 20);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();
    // the piece (stretched a touch while the reel is fast)
    ctx.save();
    if (blur > 0.3) ctx.globalAlpha *= 0.85;
    if (isPet(p.type)) pieceIcon(ctx, p.type, 1, 0, -12, CARD * 0.7, t, 1, CARD * 0.7);
    else pieceIcon(ctx, p.type, p.level, 0, -12, CARD * 0.56, t);
    ctx.restore();
    label(ctx, RARITY.name[i], 0, h - 14, TYPE.small, { color: '#ffffff', weight: 700, track: 2 });
    if (isPet(p.type)) rungBadge(ctx, rungOf(p.type as PetType), -h + 10, -h + 24, 1.05);
    else classBadge(ctx, p.level, -h + 10, -h + 24, 1.05, t);
  }

  private drawFlying(ctx: Ctx, t: number) {
    const r = this.res!;
    // the flight to the tray slot: down and smaller, along a soft arc
    const u = easeOutCubic(clamp(this.age / FLY, 0, 1));
    const tx = this.target.x + this.target.w / 2;
    const ty = this.target.y + this.target.h / 2;
    const x = CENTER.x + (tx - CENTER.x) * u;
    const y = CENTER.y + (ty - CENTER.y) * u - Math.sin(u * Math.PI) * 60;
    const sc = 1.12 + (this.target.w / CARD - 1.12) * u;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    this.card(ctx, { type: r.type, level: r.level, count: 1 }, t, 0);
    ctx.restore();
  }

  private drawCaption(ctx: Ctx, t: number): void {
    const r = this.res!;
    const a = clamp((this.age - 0.08) / 0.25, 0, 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    const i = rarity(r) - 1;
    const top = CENTER.y + CARD / 2 + 74;
    const lift = (1 - easeOutCubic(a)) * 14;
    const name = PIECE_NAME[r.type].toUpperCase();
    // the rarity word over the card, NEW! beside it
    const rw = RARITY.name[i];
    const above = CENTER.y - CARD / 2 - 44;
    dropLabel(ctx, rw, W / 2, above - lift, TYPE.h2, W - 80, { color: RARITY.light[i], drop: 'rgba(8, 4, 24, 0.8)', track: 4 });
    if (r.fresh) {
      const tw = 72;
      const x = W / 2 + textWidth(ctx, rw, TYPE.h2, 700, 4) / 2 + 14;
      rr(ctx, x, above - 15 - lift, tw, 30, 15);
      ctx.fillStyle = UI.accent;
      ctx.fill();
      label(ctx, 'NEW!', x + tw / 2, above + 1 - lift, TYPE.body, { color: '#ffffff', weight: 700, track: 2 });
    }
    dropLabel(ctx, name, W / 2, top + lift, TYPE.title, W - 60, { drop: 'rgba(8, 4, 24, 0.8)', track: 2 });
    const y2 = top + 54 + lift;
    if (isPet(r.type)) {
      const info = PET_INFO[r.type as PetType];
      badgeLine(ctx, r.rung, `RUNG ${r.rung} OF 12  ·  ${info.role.toUpperCase()}`, W / 2, y2, W - 60);
      wrap(ctx, info.trait, W / 2, y2 + 40, W - 100, TYPE.lead, UI.hi);
    } else {
      const bs = classBadgeSize(r.level, 1.3);
      const text = cls(r.level).toUpperCase();
      const tw = textWidth(ctx, text, TYPE.lead, 700, 1.5);
      const x0 = W / 2 - (bs.w + 10 + tw) / 2;
      classBadge(ctx, r.level, x0, y2, 1.3, t);
      label(ctx, text, x0 + bs.w + 10, y2 + 1, TYPE.lead, { align: 'left', color: classColorOnDark(r.level, t), weight: 700, track: 1.5 });
    }
    if (r.pity) label(ctx, 'LUCKY ROLL', W / 2, above - 40 - lift, TYPE.caption, { color: UI.reward, weight: 700, track: 2 });
    // tap to collect, breathing
    if (this.age > 0.5) {
      ctx.globalAlpha = a * (0.55 + 0.35 * Math.sin(t * 3));
      label(ctx, 'TAP TO COLLECT', W / 2, H - 150, TYPE.lead, { color: UI.hiDim, weight: 700, track: 3 });
    }
    ctx.restore();
  }
}
