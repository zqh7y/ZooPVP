import { sfx } from '../audio/engine';
import { PET_INFO, rungOf, tierOf, xpToNext } from '../data';
import { Fx } from '../draw/fx';
import { cash, cells, crown, flame, gem, koStar } from '../draw/icons';
import { button, dropLabel, fitLabel, panel, progressBar, ribbon, well } from '../draw/ui';
import { frand } from '../rng';
import { PILL, RARITY, TYPE, UI, W } from '../theme';
import type { MatchResult, Opponent, PetType } from '../types';
import { clamp, easeOutBack, easeOutCubic, inRect, label, rr, textWidth, type Ctx, type Rect } from '../util';
import { Btn, dim, drawUnit, popIn, type Overlay } from './panels';

/*
 * The result panel after a match: VICTORY! (or a gentle DEFEAT), the MVP (the squad with the most knock-outs) on a
 * spotlight, then the rewards counting up (cash, knock-outs, gems) while coins and gems fly up into the top bar's
 * pills, the XP bar filling (a LEVEL UP! burst and fanfare when it levels), the win streak and any grid cell it
 * opened, and CONTINUE. A tap skips the counting to the end. The top bar stays lit over the dim, so the coins land
 * in the real pills: the main screen holds back heldCash / heldGems and the shown level until they arrive.
 */

const R: Rect = { x: 26, y: 140, w: W - 52, h: 830 };
const MVP_AT = 0.55;
const CASH_AT = 1.0;
const CASH_DUR = 0.85;
const KO_AT = 1.35;
const GEM_AT = 1.7;
const XP_AT = 2.0;
const XP_DUR = 1.0; // per bar filled
const COIN_FLY = 0.55;

interface Coin {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bend: number;
  age: number;
  dur: number;
  value: number;
  gem: boolean;
  spin: number;
}

export interface PillTargets {
  cash: { x: number; y: number };
  gems: { x: number; y: number };
}

export class Result implements Overlay {
  readonly modal = true;
  /** the top bar stays lit over this panel (the coins fly into it) */
  readonly keepTop = true;
  /** cash and gems not yet landed in the top bar */
  heldCash: number;
  heldGems: number;
  /** called when a coin or gem lands in its pill */
  onLand: ((gem: boolean) => void) | null = null;
  private age = 0;
  private end: number;
  private closed = false;
  private fx = new Fx();
  private coins: Coin[] = [];
  private cashSent = 0;
  private gemsSent = false;
  private tickAt = 0;
  private mvpShown = false;
  private koShown = false;
  private levelsShown = 0;
  private extrasShown = false;
  private readonly bars: number;
  private readonly fromShare: number;
  private go: Btn;

  /**
   * fly: the cash still to fly into the pill (what the match paid that the fight's knock-out coins did not
   * already bring). targets: where the cash and gems pills are.
   */
  constructor(
    private readonly res: MatchResult,
    private readonly opp: Opponent,
    fly: number,
    private readonly targets: PillTargets,
    private readonly onContinue: () => void,
    /** the clock ran out on a tie (it pays as a loss) */
    private readonly draw = false,
  ) {
    this.heldCash = Math.max(0, Math.min(res.cash, fly));
    this.heldGems = res.gems;
    this.fromShare = clamp(res.from.xp / res.from.need, 0, 1);
    this.bars = res.to.level - res.from.level + clamp(res.to.xp / res.to.need, 0, 1) - this.fromShare;
    this.end = XP_AT + XP_DUR * Math.max(0.6, this.bars) + 0.45;
    this.go = new Btn({ x: R.x + 82, y: R.y + R.h - 104, w: R.w - 164, h: 84 });
    if (res.won) this.fx.confettiCannon();
  }

  get done() {
    return this.closed;
  }

  /** the level and the XP bar's fill as the panel shows them now (the top bar's LEVEL pill follows it) */
  get shown(): { level: number; share: number } {
    const p = clamp((this.age - XP_AT) / XP_DUR, 0, Math.max(0, this.bars));
    const v = this.fromShare + p;
    const level = Math.min(this.res.to.level, this.res.from.level + Math.floor(v + 1e-6));
    const share = level >= this.res.to.level ? Math.min(v - (this.res.to.level - this.res.from.level), 1) : v - Math.floor(v + 1e-6);
    return { level, share: clamp(share, 0, 1) };
  }

  private get counted() {
    return this.age >= this.end;
  }

  update(dt: number) {
    this.age += dt;
    this.fx.update(dt);
    const res = this.res;
    if (!this.mvpShown && this.age >= MVP_AT) {
      this.mvpShown = true;
      if (res.mvp) {
        sfx.play('mvp');
        this.fx.ring(W / 2, R.y + 210, UI.rewardLight, 30, 150, 0.5);
        this.fx.burst(W / 2, R.y + 200, { colors: [UI.reward, UI.rewardLight, '#ffffff'], n: 18, speed: 300, size: 6, life: 0.7, gravity: 200, shape: 'star', drag: 1.4 });
      }
    }
    // the cash counts up and flies off in coins
    if (this.age >= CASH_AT && this.cashSent < this.heldCash + this.cashSentDone) this.sendCoins();
    if (this.age >= CASH_AT && this.age < CASH_AT + CASH_DUR) {
      this.tickAt -= dt;
      if (this.tickAt <= 0) {
        this.tickAt = 0.075;
        sfx.play('cashCount', clamp((this.age - CASH_AT) / CASH_DUR, 0, 1));
      }
    }
    if (!this.koShown && this.age >= KO_AT) {
      this.koShown = true;
      if (res.kos > 0) sfx.play('count');
    }
    if (!this.gemsSent && this.age >= GEM_AT) {
      this.gemsSent = true;
      if (res.gems > 0) {
        sfx.play('gems', res.gems);
        const from = this.colX(2);
        for (let i = 0; i < res.gems; i++) this.coins.push(this.coin(from, R.y + 410, this.targets.gems, 1, true, i * 0.08));
      }
    }
    // the XP bar fills; each level it crosses bursts
    if (this.age >= XP_AT && this.age < XP_AT + XP_DUR * this.bars) {
      this.tickAt -= dt;
      if (this.tickAt <= 0) {
        this.tickAt = 0.08;
        sfx.play('xpCount', this.shown.share);
      }
    }
    const lv = this.shown.level - res.from.level;
    while (this.levelsShown < lv) {
      this.levelsShown++;
      sfx.play('levelUp');
      const bx = R.x + R.w / 2;
      const by = R.y + 560;
      this.fx.flash('#fff6d8', 0.35, 0.3);
      this.fx.ring(bx, by, UI.rewardLight, 30, 260, 0.6);
      this.fx.burst(bx, by, { colors: [UI.reward, UI.rewardLight, '#ffffff', UI.accentLight], n: 40, speed: 520, size: 8, life: 1.1, gravity: 300, shape: 'star', drag: 1.3 });
      this.fx.burst(bx, by, { colors: [UI.reward, '#ff7ccf', '#4fa3ea', UI.accent], n: 36, speed: 640, size: 7, life: 1.4, gravity: 520, shape: 'confetti', dir: -Math.PI / 2, spread: 1.4, drag: 1 });
      this.fx.shake(5, 0.3);
    }
    if (!this.extrasShown && this.age >= this.end - 0.35) {
      this.extrasShown = true;
      if (res.cells.length) sfx.play('cellUnlock');
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      if (c.age >= c.dur) {
        this.coins.splice(i, 1);
        this.land(c);
      }
    }
  }

  /** cash already handed to coins */
  private cashSentDone = 0;

  private sendCoins() {
    const total = this.heldCash + this.cashSentDone;
    const u = clamp((this.age - CASH_AT) / CASH_DUR, 0, 1);
    const due = Math.round(total * u);
    let left = due - this.cashSent;
    if (left <= 0) return;
    // a coin carries an even share; at most ~14 coins in all
    const per = Math.max(1, Math.ceil(total / 14));
    while (left > 0) {
      const v = Math.min(per, left);
      this.coins.push(this.coin(this.colX(0), R.y + 410, this.targets.cash, v, false, 0));
      this.cashSent += v;
      left -= v;
    }
  }

  private coin(x: number, y: number, to: { x: number; y: number }, value: number, isGem: boolean, delay: number): Coin {
    return { x0: x + frand(-18, 18), y0: y + frand(-10, 10), x1: to.x, y1: to.y, bend: frand(-90, 90), age: -delay, dur: COIN_FLY + frand(0, 0.15), value, gem: isGem, spin: frand(0, 6) };
  }

  private land(c: Coin) {
    if (c.gem) this.heldGems = Math.max(0, this.heldGems - c.value);
    else {
      this.heldCash = Math.max(0, this.heldCash - c.value);
      this.cashSentDone += c.value;
    }
    sfx.play(c.gem ? 'gems' : 'coins', 1);
    this.onLand?.(c.gem);
  }

  /** jump to the end: everything counted, every coin landed */
  private skip() {
    if (this.counted) return;
    this.age = Math.max(this.age, this.end);
    this.mvpShown = this.koShown = this.gemsSent = this.extrasShown = true;
    for (const c of this.coins) this.land(c);
    this.coins.length = 0;
    if (this.heldCash > 0 || this.heldGems > 0) {
      this.heldCash = 0;
      this.heldGems = 0;
      this.onLand?.(false);
    }
    this.cashSent = this.cashSentDone;
    // the level-ups still burst (next update), so a skipped count still celebrates
  }

  private close() {
    if (this.closed) return;
    this.skip();
    this.closed = true;
    sfx.play('click');
    this.onContinue();
  }

  down(x: number, y: number) {
    this.go.down(x, y);
  }

  up(x: number, y: number) {
    if (this.go.up(x, y)) {
      if (this.age > 0.5) this.close();
      return;
    }
    if (!inRect(x, y, this.go.r)) this.skip();
  }

  /** the centre x of reward column i (cash, knock-outs, gems) */
  private colX(i: number) {
    return R.x + 30 + ((R.w - 60) / 3) * (i + 0.5);
  }

  render(ctx: Ctx, t: number) {
    const res = this.res;
    dim(ctx, this.age / 0.3, 'rgba(20, 14, 46, 0.72)');
    ctx.save();
    ctx.translate(this.fx.camera.x, this.fx.camera.y);
    popIn(ctx, R, this.age, () => {
      panel(ctx, R);
      // the header
      const hk = easeOutBack(clamp((this.age - 0.15) / 0.35, 0, 1));
      ctx.save();
      ctx.translate(W / 2, R.y + 6);
      ctx.scale(0.5 + 0.5 * hk, 0.5 + 0.5 * hk);
      const title = res.won ? 'VICTORY!' : this.draw ? 'DRAW' : 'DEFEAT';
      ribbon(ctx, 0, 0, res.won ? 340 : 280, title, { color: res.won ? 'reward' : 'muted', size: TYPE.title, sub: res.champion && res.won ? 'CHAMPION BEATEN!' : undefined });
      ctx.restore();
      const vy = R.y + (res.champion && res.won ? 106 : 84);
      this.vsLine(ctx, vy);
      this.drawMvp(ctx, t);
      this.drawRewards(ctx, t);
      this.drawXp(ctx, t);
      this.drawExtras(ctx, t);
      button(ctx, this.go.r, { variant: 'primary', text: 'CONTINUE', pressed: this.go.pressed, breathe: this.counted ? t : undefined, pulse: this.counted ? (t * 1.1) % 1 : 0 });
    });
    this.fx.drawOver(ctx);
    ctx.restore();
    this.drawCoins(ctx, t);
    this.fx.drawScreen(ctx);
  }

  private vsLine(ctx: Ctx, y: number) {
    const name = this.opp.name.toUpperCase();
    const pre = 'VS ';
    const size = TYPE.body;
    const w = textWidth(ctx, pre + name, size, 700, 1) + 50;
    let x = W / 2 - w / 2;
    label(ctx, pre, x, y, size, { align: 'left', color: UI.hiMute, weight: 700, track: 1 });
    x += textWidth(ctx, pre, size, 700, 1) + 4;
    if (this.opp.champion) {
      crown(ctx, x + 10, y - 1, 20);
      x += 24;
    }
    label(ctx, name, x, y, size, { align: 'left', color: UI.hiDim, weight: 700, track: 1 });
    x += textWidth(ctx, name, size, 700, 1) + 8;
    rr(ctx, x, y - 10, 36, 20, 6);
    ctx.fillStyle = 'rgba(16, 10, 40, 0.7)';
    ctx.fill();
    label(ctx, 'BOT', x + 18, y + 1, TYPE.tiny, { color: UI.hiDim, weight: 700, track: 1 });
  }

  private drawMvp(ctx: Ctx, t: number) {
    const res = this.res;
    const cy = R.y + 222;
    const k = easeOutBack(clamp((this.age - MVP_AT) / 0.4, 0, 1));
    if (k <= 0) return;
    const pet: PetType | null = res.mvp?.pet ?? null;
    if (!pet) {
      ctx.save();
      ctx.globalAlpha *= clamp((this.age - MVP_AT) / 0.3, 0, 1);
      label(ctx, res.won ? 'A clean sweep!' : 'No knock-outs this time', W / 2, cy - 10, TYPE.h3, { color: UI.hi, weight: 700 });
      label(ctx, res.won ? 'Your army won without a single knock-out.' : 'Fuse and open cases to grow stronger.', W / 2, cy + 22, TYPE.body, { color: UI.hiDim });
      ctx.restore();
      return;
    }
    const ri = tierOf(rungOf(pet)) - 1;
    // the spotlight: soft rays in the unit's rarity tone
    ctx.save();
    ctx.globalAlpha *= 0.5 * k;
    ctx.translate(W / 2, cy - 10);
    ctx.rotate(t * 0.3);
    ctx.fillStyle = RARITY.light[ri];
    for (let i = 0; i < 10; i++) {
      ctx.rotate((Math.PI * 2) / 10);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-16, -120);
      ctx.lineTo(16, -120);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const g = ctx.createRadialGradient(W / 2, cy - 10, 10, W / 2, cy - 10, 110);
    g.addColorStop(0, `${RARITY.main[ri]}aa`);
    g.addColorStop(1, `${RARITY.main[ri]}00`);
    ctx.fillStyle = g;
    ctx.fillRect(R.x, cy - 120, R.w, 220);
    ctx.save();
    ctx.translate(W / 2, cy + 40);
    ctx.scale(k, k);
    drawUnit(ctx, pet, 0, 0, 45, t, { mood: res.won ? 'cheer' : 'idle', hop: res.won ? Math.max(0, Math.sin(t * 3.2)) * 0.2 : 0 });
    ctx.restore();
    // the MVP tag, the name and what it did
    const ty = cy - 90;
    rr(ctx, W / 2 - 34, ty - 14, 68, 28, 9);
    ctx.fillStyle = UI.reward;
    ctx.fill();
    label(ctx, 'MVP', W / 2, ty + 1, TYPE.body, { color: '#5a3a00', weight: 700, track: 2 });
    const a = clamp((this.age - MVP_AT - 0.15) / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha *= a;
    dropLabel(ctx, PET_INFO[pet].name.toUpperCase(), W / 2, cy + 70, TYPE.h2, R.w - 60, { drop: 'rgba(10, 6, 30, 0.7)', track: 2 });
    const m = res.mvp!;
    const kos = `${m.kos} KNOCK-OUT${m.kos === 1 ? '' : 'S'}`;
    label(ctx, `${kos}  ·  ${Math.round(m.dmg)} DAMAGE`, W / 2, cy + 98, TYPE.caption, { color: UI.hiDim, weight: 700, track: 1.5 });
    ctx.restore();
  }

  private drawRewards(ctx: Ctx, t: number) {
    const res = this.res;
    const wr = { x: R.x + 24, y: R.y + 346, w: R.w - 48, h: 130 };
    well(ctx, wr, 16);
    const cy = wr.y + 58;
    // cash
    const cu = easeOutCubic(clamp((this.age - CASH_AT) / CASH_DUR, 0, 1));
    const cashShown = Math.round(res.cash * cu);
    const c0 = this.colX(0);
    cash(ctx, c0, cy - 30, 34);
    this.number(ctx, `+${cashShown}`, c0, cy + 8, cu > 0 && cu < 1);
    const why = res.won ? `WIN ${res.baseCash}  ·  KO ${res.koCash}${res.streakCash ? `  ·  STREAK ${res.streakCash}` : ''}` : `FOR TRYING ${res.baseCash}  ·  KO ${res.koCash}`;
    fitLabel(ctx, why, c0, cy + 42, TYPE.tiny, (wr.w / 3) - 8, { color: UI.hiMute, weight: 700, track: 0.5 });
    // knock-outs
    const c1 = this.colX(1);
    const kk = clamp((this.age - KO_AT) / 0.3, 0, 1);
    koStar(ctx, c1, cy - 30, 32, UI.reward);
    ctx.save();
    const ks = 1 + 0.25 * Math.sin(kk * Math.PI);
    ctx.translate(c1, cy + 8);
    ctx.scale(ks, ks);
    this.number(ctx, kk > 0 ? String(res.kos) : '0', 0, 0, false);
    ctx.restore();
    label(ctx, 'KNOCK-OUTS', c1, cy + 42, TYPE.tiny, { color: UI.hiMute, weight: 700, track: 1 });
    // gems
    const c2 = this.colX(2);
    const gk = clamp((this.age - GEM_AT) / 0.3, 0, 1);
    gem(ctx, c2, cy - 30, 32);
    ctx.save();
    const gs = res.gems ? 1 + 0.3 * Math.sin(gk * Math.PI) : 1;
    ctx.translate(c2, cy + 8);
    ctx.scale(gs, gs);
    this.number(ctx, res.gems ? `+${gk > 0 ? res.gems : 0}` : '-', 0, 0, false, res.gems ? undefined : UI.hiMute);
    ctx.restore();
    label(ctx, res.champion && res.won ? 'CHAMPION GEMS' : res.gems ? 'LUCKY GEMS' : 'GEMS', c2, cy + 42, TYPE.tiny, { color: UI.hiMute, weight: 700, track: 1 });
    // the column dividers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (const i of [1, 2]) ctx.fillRect(Math.round(wr.x + (wr.w / 3) * i), wr.y + 18, 1.5, wr.h - 36);
    void t;
  }

  private number(ctx: Ctx, s: string, x: number, y: number, moving: boolean, color?: string) {
    dropLabel(ctx, s, x, y, TYPE.h1, 140, { color: color ?? (moving ? UI.rewardLight : UI.hi), drop: 'rgba(8, 4, 24, 0.7)', track: 0.5 });
  }

  private drawXp(ctx: Ctx, t: number) {
    const res = this.res;
    const top = R.y + 512;
    const sh = this.shown;
    const up = sh.level > res.from.level;
    // LEVEL n, popping when it rises
    // seconds since the last level was crossed (the bar crosses level k at k - fromShare bars in)
    const since = this.levelsShown > 0 ? Math.max(0, this.age - (XP_AT + XP_DUR * (this.levelsShown - this.fromShare))) : 9;
    const pop = since >= 0 && since < 0.5 ? 1 + 0.35 * Math.exp(-since * 7) * Math.cos(since * 16) : 1;
    ctx.save();
    ctx.translate(R.x + 30, top);
    ctx.scale(pop, pop);
    dropLabel(ctx, `LEVEL ${sh.level}`, 0, 0, TYPE.h2, 200, { align: 'left', color: up ? UI.rewardLight : UI.hi, drop: 'rgba(8, 4, 24, 0.7)', track: 1.5 });
    ctx.restore();
    const xa = clamp((this.age - XP_AT + 0.3) / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha *= xa;
    label(ctx, `+${res.xp} XP`, R.x + R.w - 30, top, TYPE.lead, { align: 'right', color: UI.reward, weight: 700, track: 1 });
    ctx.restore();
    const bar = { x: R.x + 30, y: top + 24, w: R.w - 60, h: 28 };
    rr(ctx, bar.x - 3, bar.y - 3, bar.w + 6, bar.h + 6, (bar.h + 6) / 2);
    ctx.fillStyle = 'rgba(8, 4, 24, 0.5)';
    ctx.fill();
    progressBar(ctx, bar, sh.share, { color: PILL.xp, back: UI.track, light: 'rgba(255, 255, 255, 0.45)' });
    const need = sh.level === res.to.level ? res.to.need : sh.level === res.from.level ? res.from.need : xpToNext(sh.level);
    if (up) {
      // LEVEL UP! bursts over the bar
      const k = clamp(since / 0.2, 0, 1);
      ctx.save();
      ctx.globalAlpha *= k;
      const s = 0.5 + 0.5 * easeOutBack(clamp(since / 0.35, 0, 1)) + 0.03 * Math.sin(t * 5);
      ctx.translate(W / 2, bar.y + bar.h / 2);
      ctx.scale(s, s);
      dropLabel(ctx, 'LEVEL UP!', 0, 0, TYPE.title, 300, { color: '#ffffff', drop: 'rgba(150, 80, 0, 0.95)', track: 3 });
      ctx.restore();
    } else label(ctx, `${Math.round(sh.share * need)} / ${need} XP`, bar.x + bar.w / 2, bar.y + bar.h / 2 + 1, TYPE.caption, { color: '#ffffff', weight: 700, track: 1, onPitch: true });
    void t;
  }

  private drawExtras(ctx: Ctx, t: number) {
    const res = this.res;
    const a = clamp((this.age - (this.end - 0.35)) / 0.3, 0, 1);
    if (a <= 0) return;
    const chips: { text: string; icon: (c: Ctx, x: number, y: number, s: number) => void; color: string }[] = [];
    if (res.won && res.streak >= 2) chips.push({ text: `${res.streak} WIN STREAK!`, icon: (c, x, y, s) => flame(c, x, y, s), color: '#ffb36b' });
    if (res.cells.length) chips.push({ text: res.cells.length > 1 ? `${res.cells.length} NEW GRID CELLS!` : 'NEW GRID CELL!', icon: (c, x, y, s) => cells(c, x, y, s, UI.accentLight), color: UI.accentLight });
    if (!res.won) chips.push({ text: 'Your next opponent will go easier', icon: (c, x, y, s) => koStar(c, x, y, s, UI.hiDim), color: UI.hiDim });
    if (res.won && !chips.length && res.match % 5 === 4) chips.push({ text: 'NEXT: CHAMPION MATCH!', icon: (c, x, y, s) => crown(c, x, y, s), color: UI.reward });
    let y = R.y + 618;
    const k = easeOutBack(a);
    for (const c of chips) {
      const w = Math.min(R.w - 60, textWidth(ctx, c.text, TYPE.lead, 700, 1) + 76);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(W / 2, y);
      ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
      rr(ctx, -w / 2, -24, w, 48, 24);
      ctx.fillStyle = 'rgba(16, 10, 40, 0.55)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `${c.color}66`;
      ctx.stroke();
      c.icon(ctx, -w / 2 + 30, 0, 28);
      fitLabel(ctx, c.text, -w / 2 + 54, 1, TYPE.lead, w - 70, { align: 'left', color: c.color, weight: 700, track: 1 });
      ctx.restore();
      y += 58;
    }
    void t;
  }

  private drawCoins(ctx: Ctx, t: number) {
    for (const c of this.coins) {
      if (c.age < 0) continue;
      const u = easeOutCubic(clamp(c.age / c.dur, 0, 1));
      const mx = (c.x0 + c.x1) / 2 + c.bend;
      const my = Math.min(c.y0, c.y1) - 80;
      const x = (1 - u) * (1 - u) * c.x0 + 2 * (1 - u) * u * mx + u * u * c.x1;
      const y = (1 - u) * (1 - u) * c.y0 + 2 * (1 - u) * u * my + u * u * c.y1;
      const s = 1 - 0.35 * u;
      if (c.gem) {
        gem(ctx, x, y, 26 * s);
        continue;
      }
      const sq = Math.abs(Math.cos(t * 9 + c.spin));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(Math.max(0.25, sq) * s, s);
      ctx.beginPath();
      ctx.arc(0, 1.5, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#b77d14';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd25a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e8a628';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(-4, -6, 3, 8);
      ctx.restore();
    }
  }
}
