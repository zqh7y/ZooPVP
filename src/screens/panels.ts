import { sfx } from '../audio/engine';
import { CLASSES, PET_INFO, PET_TYPES, ROLL_KINDS, formatPower, isPet, petAt, recommendedPower, rungOf, tierOf } from '../data';
import { Fx } from '../draw/fx';
import { cash, gem, star } from '../draw/icons';
import { restPose, type PetLook, type PetMood } from '../draw/petTypes';
import { petArt } from '../draw/pets';
import { button, fitLabel, panel, ribbon, rungBadge } from '../draw/ui';
import { isOwned } from '../logic/inventory';
import { caseOdds } from '../logic/rolls';
import { fpick } from '../rng';
import { CLASS_FX, COLOR, H, S, TIER, TYPE, UI, W } from '../theme';
import type { PetType, SaveState, WaveResult } from '../types';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, inRect, label, rr, starPath, type Ctx, type Rect } from '../util';

/*
 * The main screen's overlays: the wave-clear ribbon, the stage-clear party, the soft defeat panel, the NEW UNIT
 * reveal, the unit ladder (from the stats button) and the evolve moment. Each one draws over the screen and, when
 * it is modal, takes every touch until it closes.
 */

export interface Overlay {
  /** takes every touch until it is done */
  readonly modal: boolean;
  readonly done: boolean;
  update(dt: number): void;
  render(ctx: Ctx, t: number): void;
  down?(x: number, y: number): void;
  up?(x: number, y: number): void;
}

/** A unit standing with its feet on (x, y), body radius r. */
export function drawUnit(ctx: Ctx, pet: PetType, x: number, y: number, r: number, t: number, o: { mood?: PetMood; team?: 0 | 1; boss?: boolean; face?: 1 | -1; hop?: number; seed?: number } = {}) {
  const look: PetLook = { pet, level: 1, team: o.team ?? 0, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0, seed: o.seed ?? 3, boss: o.boss };
  const pose = restPose();
  pose.t = t;
  pose.face = o.face ?? 1;
  pose.mood = o.mood ?? 'idle';
  pose.hop = o.hop ?? 0;
  ctx.save();
  ctx.translate(x, y);
  petArt.drawShadow(ctx, look, r, pose.hop);
  petArt.drawPet(ctx, look, pose, r);
  ctx.restore();
}

/** A soft wash over the whole screen behind a panel. */
function dim(ctx: Ctx, a: number, color = 'rgba(46, 52, 60, 0.42)') {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** A panel that pops in (scale from 0.9 with a little overshoot). */
function popIn(ctx: Ctx, r: Rect, age: number, draw: () => void) {
  const k = easeOutBack(clamp(age / 0.32, 0, 1));
  const a = clamp(age / 0.18, 0, 1);
  ctx.save();
  ctx.globalAlpha *= a;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}

/** A tap target that tracks its own press. */
class Btn {
  pressed = false;
  constructor(public r: Rect) {}
  down(x: number, y: number) {
    this.pressed = inRect(x, y, this.r);
  }
  up(x: number, y: number): boolean {
    const hit = this.pressed && inRect(x, y, this.r);
    this.pressed = false;
    return hit;
  }
}

// ------------------------------------------------------------------ the wave-clear ribbon

/** WAVE n CLEAR and the cash it paid, over the arena for a moment. Not modal: prep starts under it. */
export class WaveClear implements Overlay {
  readonly modal = false;
  private age = 0;
  constructor(private res: WaveResult, private y: number) {
    sfx.play('waveClear');
    sfx.play('cashWave', res.cash, { delay: 0.45 });
  }
  get done() {
    return this.age > 2.2;
  }
  update(dt: number) {
    this.age += dt;
  }
  render(ctx: Ctx) {
    const a = this.age < 0.2 ? this.age / 0.2 : this.age > 1.8 ? 1 - (this.age - 1.8) / 0.4 : 1;
    const k = easeOutBack(clamp(this.age / 0.35, 0, 1));
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(W / 2, this.y);
    ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    ribbon(ctx, 0, 0, 330, `WAVE ${this.res.wave} CLEAR`, { color: 'accent', size: TYPE.h1 });
    ctx.restore();
    // the cash rises off the ribbon
    const u = clamp((this.age - 0.35) / 0.4, 0, 1);
    if (u > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1) * u;
      const y = this.y + 54 - easeOutCubic(u) * 6;
      const text = `+${this.res.cash}`;
      rr(ctx, W / 2 - 62, y - 20, 124, 40, 20);
      ctx.fillStyle = UI.surface;
      ctx.fill();
      ctx.strokeStyle = UI.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      cash(ctx, W / 2 - 30, y, 26);
      label(ctx, text, W / 2 - 10, y + 1, TYPE.h3, { align: 'left', weight: 700, color: UI.text });
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------ the stage-clear party

const END = { x: 46, y: 230, w: 448, h: 520 };

/** STAGE n CLEAR!: 1 to 3 stars landing one by one, the gems, then NEXT STAGE. */
export class StageClear implements Overlay {
  readonly modal = true;
  private age = 0;
  private fx = new Fx();
  private stars = 0;
  private closed = false;
  private next = new Btn({ x: END.x + 74, y: END.y + END.h - 108, w: END.w - 148, h: 80 });
  constructor(private res: WaveResult, private auto: boolean, private onNext: () => void) {
    sfx.play('stageClear');
    this.fx.confettiCannon();
  }
  get done() {
    return this.closed;
  }
  update(dt: number) {
    this.age += dt;
    this.fx.update(dt);
    const due = [0.7, 1.05, 1.4].filter((t) => this.age >= t).length;
    while (this.stars < Math.min(due, this.res.stars)) {
      this.stars++;
      const sx = END.x + END.w / 2 + (this.stars - 2) * 104;
      const sy = END.y + 150;
      sfx.play('star', this.stars);
      this.fx.burst(sx, sy, { colors: [UI.reward, UI.rewardLight, COLOR.white], n: 16, speed: 260, size: 7, life: 0.7, gravity: 200, shape: 'star', drag: 1.5 });
      this.fx.ring(sx, sy, UI.rewardLight, 20, 70, 0.35);
      if (this.stars === this.res.stars) sfx.play('gems', this.res.gems, { delay: 0.35 });
    }
    if (this.auto && this.age > 4.5) this.close();
  }
  private close() {
    if (this.closed) return;
    this.closed = true;
    sfx.play('click');
    this.onNext();
  }
  down(x: number, y: number) {
    this.next.down(x, y);
  }
  up(x: number, y: number) {
    if (this.next.up(x, y) && this.age > 1.0) this.close();
  }
  render(ctx: Ctx, t: number) {
    dim(ctx, this.age / 0.3, 'rgba(46, 52, 60, 0.35)');
    popIn(ctx, END, this.age, () => {
      panel(ctx, END);
      ribbon(ctx, END.x + END.w / 2, END.y + 4, 360, `STAGE ${this.res.stage} CLEAR!`, { color: 'reward', size: TYPE.h1 });
      // the three star slots and the stars that landed
      for (let i = 0; i < 3; i++) {
        const sx = END.x + END.w / 2 + (i - 1) * 104;
        const sy = END.y + 150 + (i === 1 ? -12 : 0);
        const big = i === 1 ? 92 : 78;
        ctx.save();
        starPath(ctx, sx, sy + 4, big / 2, big / 4.3, 5);
        ctx.fillStyle = UI.track;
        ctx.fill();
        ctx.restore();
        if (i < this.stars) {
          const land = [0.7, 1.05, 1.4][i];
          const k = easeOutBack(clamp((this.age - land) / 0.3, 0, 1));
          ctx.save();
          ctx.translate(sx, sy);
          ctx.scale(k, k);
          ctx.rotate((1 - k) * 0.6);
          star(ctx, 0, 0, big, UI.reward);
          ctx.restore();
        }
      }
      const cy = END.y + 260;
      const show = clamp((this.age - 1.6) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha *= show;
      // gems and cash paid
      const rowW = 330;
      const x0 = END.x + (END.w - rowW) / 2;
      rr(ctx, x0, cy - 30, rowW, 60, 30);
      ctx.fillStyle = UI.surfaceAlt;
      ctx.fill();
      gem(ctx, x0 + 40, cy, 30);
      label(ctx, `+${this.res.gems}`, x0 + 62, cy + 1, TYPE.h2, { align: 'left', weight: 700, color: UI.text });
      cash(ctx, x0 + 190, cy, 30);
      label(ctx, `+${this.res.cash}`, x0 + 212, cy + 1, TYPE.h2, { align: 'left', weight: 700, color: UI.text });
      const n = this.res.next.stage;
      label(ctx, `NEXT: STAGE ${n}`, END.x + END.w / 2, cy + 64, TYPE.lead, { weight: 700, color: UI.text, track: 1.5 });
      label(ctx, `boss wave asks for ${formatPower(recommendedPower(n, 10))} power`, END.x + END.w / 2, cy + 94, TYPE.body, { color: UI.textDim });
      ctx.restore();
      button(ctx, this.next.r, { variant: 'primary', text: 'NEXT STAGE', pressed: this.next.pressed, disabled: this.age < 1.0, breathe: t });
      if (this.auto && this.age > 1.6) label(ctx, 'AUTO goes on by itself', END.x + END.w / 2, END.y + END.h - 14, TYPE.caption, { color: UI.textMute });
    });
    this.fx.drawOver(ctx);
    this.fx.drawScreen(ctx);
  }
}

// ------------------------------------------------------------------ the defeat panel

const TIPS = [
  'Put weapons and gear right next to a unit: it uses the best one of each kind.',
  'Drop a unit on the same unit to double it: x1, x2, x4.',
  'Two x4 squads of one unit evolve into the next unit on the ladder.',
  'Open a CASE between waves: new units and better items.',
  'Fuse two identical items to lift them one class.',
  'Buy a locked cell for more room on the grid.',
  'Every retry sends a slightly softer army.',
  'Front-row units shield the ones behind them.',
];

const LOST = { x: 46, y: 290, w: 448, h: 440 };

/** A soft defeat: nothing is lost, the knock-out cash is kept, a tip, TRY AGAIN. */
export class Defeat implements Overlay {
  readonly modal = true;
  private age = 0;
  private closed = false;
  private tip = fpick(TIPS);
  private again = new Btn({ x: LOST.x + 74, y: LOST.y + LOST.h - 106, w: LOST.w - 148, h: 78 });
  constructor(private res: WaveResult, private onRetry: () => void) {
    sfx.play('waveLost');
  }
  get done() {
    return this.closed;
  }
  update(dt: number) {
    this.age += dt;
  }
  down(x: number, y: number) {
    this.again.down(x, y);
  }
  up(x: number, y: number) {
    if (this.again.up(x, y) && this.age > 0.5 && !this.closed) {
      this.closed = true;
      sfx.play('click');
      this.onRetry();
    }
  }
  render(ctx: Ctx, t: number) {
    dim(ctx, this.age / 0.4, 'rgba(46, 52, 60, 0.32)');
    popIn(ctx, LOST, this.age, () => {
      panel(ctx, LOST);
      ribbon(ctx, LOST.x + LOST.w / 2, LOST.y + 4, 300, 'SO CLOSE!', { color: 'muted', size: TYPE.h1 });
      const cx = LOST.x + LOST.w / 2;
      label(ctx, `Wave ${this.res.wave} held on this time.`, cx, LOST.y + 96, TYPE.lead, { weight: 700, color: UI.text });
      label(ctx, 'Nothing is lost: fight it again when you are ready.', cx, LOST.y + 128, TYPE.body, { color: UI.textDim });
      if (this.res.koCash > 0) {
        const y = LOST.y + 182;
        rr(ctx, cx - 120, y - 24, 240, 48, 24);
        ctx.fillStyle = UI.surfaceAlt;
        ctx.fill();
        cash(ctx, cx - 82, y, 26);
        label(ctx, `+${this.res.koCash} for knock-outs`, cx - 60, y + 1, TYPE.body, { align: 'left', weight: 700, color: UI.text });
      }
      // the tip, on a calm card
      const tr = { x: LOST.x + 28, y: LOST.y + 222, w: LOST.w - 56, h: 92 };
      rr(ctx, tr.x, tr.y, tr.w, tr.h, S.radius.m);
      ctx.fillStyle = UI.sky;
      ctx.fill();
      label(ctx, 'TIP', tr.x + 18, tr.y + 22, TYPE.small, { align: 'left', weight: 700, color: UI.accentDark, track: 2 });
      wrap(ctx, this.tip, tr.x + 18, tr.y + 52, tr.w - 36, TYPE.body, UI.text, 'left');
      button(ctx, this.again.r, { variant: 'primary', text: 'TRY AGAIN', pressed: this.again.pressed, breathe: t });
    });
  }
}

/** Text wrapped to a width, the first line centred on y (lines go down from it). Returns the lines drawn. */
export function wrap(ctx: Ctx, text: string, x: number, y: number, w: number, size: number, color: string, align: CanvasTextAlign = 'center', weight: 600 | 700 = 600): number {
  ctx.font = `${weight} ${size}px "Barlow Condensed", sans-serif`;
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(next).width > w) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  lines.forEach((l, i) => label(ctx, l, x, y + i * (size + 4), size, { align, color, weight }));
  return lines.length;
}

// ------------------------------------------------------------------ NEW UNIT

const CARD = { x: 40, y: 190, w: 460, h: 640 };

/** The first time a unit is owned: the unit big, its name, role and trait, and where it sits on the ladder. */
export class NewUnit implements Overlay {
  readonly modal = true;
  private age = 0;
  private closed = false;
  private fx = new Fx();
  private ok = new Btn({ x: CARD.x + 110, y: CARD.y + CARD.h - 102, w: CARD.w - 220, h: 76 });
  constructor(private pet: PetType, private state: SaveState, sound = true, private onClose?: () => void) {
    if (sound) sfx.play('unitReveal', rungOf(pet));
    const i = tierOf(rungOf(pet)) - 1;
    this.fx.burst(W / 2, CARD.y + 250, { colors: [TIER.metalLight[i], CLASS_FX.spark, COLOR.white, UI.accentLight], n: 26, speed: 300, size: 7, life: 0.9, gravity: 80, shape: 'star', drag: 1.6 });
  }
  get done() {
    return this.closed;
  }
  update(dt: number) {
    this.age += dt;
    this.fx.update(dt);
  }
  down(x: number, y: number) {
    this.ok.down(x, y);
  }
  up(x: number, y: number) {
    if (this.age < 0.6) return;
    if (this.ok.up(x, y) || !inRect(x, y, CARD)) {
      this.closed = true;
      sfx.play('click');
      this.onClose?.();
    }
  }
  render(ctx: Ctx, t: number) {
    dim(ctx, this.age / 0.3);
    const info = PET_INFO[this.pet];
    const rung = rungOf(this.pet);
    popIn(ctx, CARD, this.age, () => {
      panel(ctx, CARD);
      ribbon(ctx, W / 2, CARD.y + 4, 260, 'NEW UNIT!', { color: 'accent', size: TYPE.h2 });
      // the unit on a soft spotlight
      const fy = CARD.y + 300;
      const g = ctx.createRadialGradient(W / 2, fy - 70, 10, W / 2, fy - 70, 170);
      g.addColorStop(0, 'rgba(213, 231, 225, 0.95)');
      g.addColorStop(1, 'rgba(213, 231, 225, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(CARD.x, CARD.y + 40, CARD.w, 300);
      const hop = Math.max(0, Math.sin(t * 3)) * 0.35 * clamp(this.age - 0.4, 0, 1);
      drawUnit(ctx, this.pet, W / 2, fy, 74, t, { mood: 'cheer', hop });
      label(ctx, info.name.toUpperCase(), W / 2, CARD.y + 352, TYPE.title, { weight: 700, color: UI.text, track: 2 });
      rungBadge(ctx, rung, W / 2 - 112, CARD.y + 406, 1.1);
      fitLabel(ctx, `RUNG ${rung}  ·  ${info.role.toUpperCase()}`, W / 2 + 14, CARD.y + 407, TYPE.lead, 220, { weight: 700, color: UI.textDim, track: 1 });
      wrap(ctx, info.trait, W / 2, CARD.y + 450, CARD.w - 80, TYPE.lead, UI.text);
      // the ladder: twelve dots, the owned ones filled, this one ringed
      const n = PET_TYPES.length;
      const gap = 30;
      const x0 = W / 2 - ((n - 1) * gap) / 2;
      const ly = CARD.y + 510;
      for (let i = 0; i < n; i++) {
        const own = isOwned(this.state, PET_TYPES[i]);
        ctx.beginPath();
        ctx.arc(x0 + i * gap, ly, i + 1 === rung ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = i + 1 === rung ? UI.accent : own ? UI.accentDim : UI.track;
        ctx.fill();
        if (i + 1 === rung) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = UI.accentDark;
          ctx.stroke();
        }
      }
      button(ctx, this.ok.r, { variant: 'primary', text: 'GREAT!', pressed: this.ok.pressed, disabled: this.age < 0.6 });
    });
    this.fx.drawOver(ctx);
  }
}

// ------------------------------------------------------------------ the unit ladder

const LADDER = { x: 18, y: 96, w: 504, h: 990 };
const silhouettes = new Map<string, HTMLCanvasElement>();

/** A unit as a dark silhouette (cached per unit and pixel ratio): an unowned unit on the ladder. */
function silhouette(pet: PetType, r: number, ratio: number): { c: HTMLCanvasElement; ox: number; oy: number; w: number; h: number } {
  const key = `${pet}|${r}|${ratio}`;
  const w = r * 4;
  const h = r * 4;
  let c = silhouettes.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(w * ratio);
    c.height = Math.ceil(h * ratio);
    const x = c.getContext('2d')!;
    x.scale(ratio, ratio);
    const look: PetLook = { pet, level: 1, team: 0, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0, seed: 3 };
    x.translate(w / 2, h * 0.78);
    petArt.drawPet(x, look, restPose(), r);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#5b6068';
    x.fillRect(0, 0, c.width, c.height);
    silhouettes.set(key, c);
  }
  return { c, ox: w / 2, oy: h * 0.78, w, h };
}

const pct = (v: number) => (v <= 0 ? '-' : v < 0.1 ? '<0.1%' : v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);

/** The twelve units in ladder order (unowned as dark silhouettes) and what a CASE and an ELITE give on this stage. */
export class Ladder implements Overlay {
  readonly modal = true;
  private age = 0;
  private closed = false;
  private x = new Btn({ x: LADDER.x + LADDER.w - 64, y: LADDER.y + 12, w: 52, h: 48 });
  constructor(private state: SaveState, private ratio: number) {
    sfx.play('click');
  }
  get done() {
    return this.closed;
  }
  update(dt: number) {
    this.age += dt;
  }
  down(x: number, y: number) {
    this.x.down(x, y);
  }
  up(x: number, y: number) {
    if (this.x.up(x, y) || !inRect(x, y, LADDER)) {
      this.closed = true;
      sfx.play('click');
    }
  }
  render(ctx: Ctx, t: number) {
    dim(ctx, this.age / 0.25);
    popIn(ctx, LADDER, this.age, () => {
      panel(ctx, LADDER);
      label(ctx, 'THE UNIT LADDER', LADDER.x + 24, LADDER.y + 38, TYPE.h2, { align: 'left', weight: 700, color: UI.text, track: 1.5 });
      label(ctx, 'Two x4 squads evolve into the next unit', LADDER.x + 24, LADDER.y + 70, TYPE.body, { align: 'left', color: UI.textDim });
      button(ctx, this.x.r, { variant: 'quiet', text: '✕', pressed: this.x.pressed });
      const caseO = caseOdds(this.state, 'case');
      const eliteO = caseOdds(this.state, 'elite');
      const unitShare = (o: { kinds: number[] }) => o.kinds[ROLL_KINDS.indexOf('pet')] / 100;
      const cols = 3;
      const cw = 150;
      const ch = 172;
      const gx = 12;
      const gy = 10;
      const x0 = LADDER.x + (LADDER.w - (cols * cw + (cols - 1) * gx)) / 2;
      const y0 = LADDER.y + 96;
      for (let i = 0; i < PET_TYPES.length; i++) {
        const pet = petAt(i + 1)!;
        const own = isOwned(this.state, pet);
        const cx = x0 + (i % cols) * (cw + gx);
        const cy = y0 + Math.floor(i / cols) * (ch + gy);
        rr(ctx, cx, cy, cw, ch, S.radius.m);
        ctx.fillStyle = own ? UI.surfaceAlt : '#e2dfd8';
        ctx.fill();
        rungBadge(ctx, i + 1, cx + 8, cy + 20, 0.9);
        if (own) drawUnit(ctx, pet, cx + cw / 2, cy + 108, 30, t + i * 0.7);
        else {
          const s = silhouette(pet, 30, this.ratio);
          ctx.save();
          ctx.globalAlpha *= 0.85;
          ctx.drawImage(s.c, cx + cw / 2 - s.ox, cy + 108 - s.oy, s.w, s.h);
          ctx.restore();
        }
        fitLabel(ctx, own ? PET_INFO[pet].name.toUpperCase() : '???', cx + cw / 2, cy + 128, TYPE.body, cw - 16, { weight: 700, color: own ? UI.text : UI.textMute, track: 1 });
        const c = caseO.rungs[i] * unitShare(caseO);
        const e = eliteO.rungs[i] * unitShare(eliteO);
        label(ctx, `CASE ${pct(c)}`, cx + 10, cy + 154, TYPE.small, { align: 'left', color: UI.textDim, weight: 700 });
        label(ctx, `ELITE ${pct(e)}`, cx + cw - 10, cy + 154, TYPE.small, { align: 'right', color: UI.gemDark, weight: 700 });
      }
      // the item classes
      const ry = y0 + 4 * (ch + gy) + 10;
      label(ctx, 'WEAPONS AND GEAR, BY CLASS', LADDER.x + 24, ry, TYPE.small, { align: 'left', weight: 700, color: UI.textDim, track: 1.5 });
      const colW = (LADDER.w - 48 - 70) / CLASSES.length;
      for (let k = 0; k < CLASSES.length; k++) {
        const x = LADDER.x + 24 + 70 + colW * (k + 0.5);
        label(ctx, CLASSES[k], x, ry + 28, TYPE.body, { weight: 700, color: UI.tierText[k] });
        label(ctx, pct(caseO.classes[k]), x, ry + 54, TYPE.small, { color: UI.text });
        label(ctx, pct(eliteO.classes[k]), x, ry + 78, TYPE.small, { color: UI.gemDark });
      }
      label(ctx, 'CASE', LADDER.x + 24, ry + 54, TYPE.small, { align: 'left', weight: 700, color: UI.textDim });
      label(ctx, 'ELITE', LADDER.x + 24, ry + 78, TYPE.small, { align: 'left', weight: 700, color: UI.gemDark });
    });
  }
}

// ------------------------------------------------------------------ the evolve moment

const EVO = { x: W / 2, y: 470 };

/**
 * x4 + x4 -> the next unit x1: the screen dims, the eight fighters spiral into one point, a flash, and the new unit
 * pops out big with its name, then flies down onto its tile.
 */
export class Evolve implements Overlay {
  readonly modal = true;
  private age = 0;
  private fx = new Fx();
  private flashed = false;
  private leaving = -1;
  constructor(private from: PetType, private to: PetType, private tile: Rect, private onDone: () => void) {
    sfx.play('evolve', rungOf(to));
  }
  get done() {
    return this.leaving >= 0.4;
  }
  update(dt: number) {
    this.age += dt;
    this.fx.update(dt);
    if (!this.flashed && this.age >= 1.05) {
      this.flashed = true;
      const i = tierOf(rungOf(this.to)) - 1;
      this.fx.flash(COLOR.white, 0.55, 0.35);
      this.fx.ring(EVO.x, EVO.y - 60, UI.accentLight, 30, 220, 0.6);
      this.fx.ring(EVO.x, EVO.y - 60, TIER.metalLight[i], 20, 160, 0.45);
      this.fx.burst(EVO.x, EVO.y - 60, { colors: [TIER.metalLight[i], CLASS_FX.spark, COLOR.white, UI.accentLight], n: 46, speed: 460, size: 8, life: 1.1, gravity: 160, shape: 'star', drag: 1.4 });
      this.fx.burst(EVO.x, EVO.y - 60, { colors: [UI.accent, UI.accentLight, UI.rewardLight, COLOR.white], n: 40, speed: 600, size: 7, life: 1.5, gravity: 520, shape: 'confetti', dir: -Math.PI / 2, spread: 1.3, drag: 1 });
      this.fx.shake(6, 0.4);
    }
    if (this.leaving >= 0) {
      this.leaving += dt;
      if (this.leaving >= 0.4) this.onDone();
    } else if (this.age > 3.4) this.leaving = 0;
  }
  up() {
    if (this.age > 1.6 && this.leaving < 0) this.leaving = 0;
  }
  render(ctx: Ctx, t: number) {
    const out = this.leaving >= 0 ? clamp(this.leaving / 0.4, 0, 1) : 0;
    dim(ctx, clamp(this.age / 0.25, 0, 1) * (1 - out), 'rgba(40, 46, 54, 0.62)');
    ctx.save();
    ctx.translate(this.fx.camera.x, this.fx.camera.y);
    if (this.age < 1.05) {
      // eight fighters spiral in, faster and smaller
      const u = easeInOutCubic(clamp((this.age - 0.15) / 0.9, 0, 1));
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2;
        const a = a0 + u * Math.PI * 3;
        const rad = 170 * (1 - u);
        const x = EVO.x + Math.cos(a) * rad;
        const y = EVO.y - 40 + Math.sin(a) * rad * 0.6;
        drawUnit(ctx, this.from, x, y, 26 * (1 - u * 0.6), t + i, { mood: 'cheer', face: Math.cos(a) > 0 ? -1 : 1, seed: i });
      }
      // a glow growing in the middle
      const g = ctx.createRadialGradient(EVO.x, EVO.y - 60, 4, EVO.x, EVO.y - 60, 40 + 120 * u);
      g.addColorStop(0, `rgba(255, 255, 255, ${(0.4 + 0.6 * u).toFixed(3)})`);
      g.addColorStop(1, 'rgba(213, 231, 225, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, EVO.y - 260, W, 400);
    } else {
      const k = easeOutBack(clamp((this.age - 1.05) / 0.45, 0, 1));
      let x = EVO.x;
      let y = EVO.y + 40;
      let r = 80 * k;
      if (out > 0) {
        const q = easeInOutCubic(out);
        x += (this.tile.x + this.tile.w / 2 - x) * q;
        y += (this.tile.y + this.tile.h * 0.8 - y) * q;
        r += (this.tile.h * 0.32 - r) * q;
      }
      // rays behind the new unit
      if (out < 1) {
        ctx.save();
        ctx.globalAlpha = 0.35 * (1 - out) * k;
        ctx.translate(EVO.x, EVO.y - 50);
        ctx.rotate(t * 0.4);
        ctx.fillStyle = UI.accentLight;
        for (let i = 0; i < 12; i++) {
          ctx.rotate((Math.PI * 2) / 12);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-22, -260);
          ctx.lineTo(22, -260);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      drawUnit(ctx, this.to, x, y, r, t, { mood: 'cheer', hop: out > 0 ? 0 : Math.max(0, Math.sin(t * 3.4)) * 0.25 });
      const a = clamp((this.age - 1.2) / 0.3, 0, 1) * (1 - out);
      if (a > 0) {
        ctx.save();
        ctx.globalAlpha = a;
        label(ctx, 'EVOLVED!', W / 2, EVO.y - 250, TYPE.title, { weight: 700, color: '#ffffff', track: 3 });
        const info = PET_INFO[this.to];
        label(ctx, `${PET_INFO[this.from].name.toUpperCase()}  →  ${info.name.toUpperCase()}`, W / 2, EVO.y + 100, TYPE.h2, { weight: 700, color: '#ffffff', track: 1.5 });
        wrap(ctx, info.trait, W / 2, EVO.y + 140, W - 100, TYPE.body, 'rgba(255, 255, 255, 0.85)');
        if (this.age > 1.6) {
          ctx.globalAlpha = a * (0.5 + 0.3 * Math.sin(t * 3));
          label(ctx, 'TAP TO GO ON', W / 2, EVO.y + 220, TYPE.body, { weight: 700, color: '#ffffff', track: 3 });
        }
        ctx.restore();
      }
    }
    this.fx.drawOver(ctx);
    ctx.restore();
    this.fx.drawScreen(ctx);
  }
}

/** true for a piece type that is a unit (re-exported for the main screen). */
export const unitType = isPet;
