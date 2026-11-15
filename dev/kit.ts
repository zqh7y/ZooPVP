import { stage } from './harness';
import { S, TYPE, UI } from '../src/theme';
import { label, type Ctx, type Rect } from '../src/util';
import * as I from '../src/draw/icons';
import * as U from '../src/draw/ui';
import { drawPiece } from '../src/draw/pieces';

const H = 2760;
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const head = (c: Ctx, s: string, y: number) => label(c, s.toUpperCase(), 16, y, TYPE.small, { align: 'left', color: UI.textDim, track: 1.5 });
const tokenIcon = (c: Ctx, x: number, y: number, z: number) => I.rollToken(c, x, y, z);

stage({
  w: 540,
  h: H,
  bg: UI.bg,
  draw(c, t) {
    let y = 14;
    head(c, 'mock top bar', y + 4);
    y += 18;
    U.pill(c, r(12, y, 196, S.barH), { icon: (cx, x, yy, z) => I.cash(cx, x, yy, z), text: '1284' });
    U.pill(c, r(216, y, 170, S.barH), { icon: (cx, x, yy, z) => I.gem(cx, x, yy, z), text: '36', flash: 0.6 });
    U.pill(c, r(394, y, 134, S.barH), { icon: tokenIcon, text: U.shortNumber(12500) });
    y += 70;

    head(c, 'buttons: primary / roll / secondary / quiet', y);
    y += 14;
    U.button(c, r(16, y, 250, S.btnH), { variant: 'case', text: 'CASE', icon: tokenIcon, badge: 3 });
    U.button(c, r(274, y, 250, S.btnH), { variant: 'primary', text: 'START WAVE', pulse: (t * 1.2) % 1 });
    y += 100;
    U.button(c, r(16, y, 250, S.btnSmallH), { variant: 'secondary', text: 'Auto', icon: I.wand });
    U.button(c, r(274, y, 250, S.btnSmallH), { variant: 'quiet', text: 'Trash', icon: I.trash });
    y += 66;
    U.button(c, r(16, y, 160, S.btnSmallH + 8), { variant: 'primary', text: 'Pressed', pressed: true });
    U.button(c, r(190, y, 160, S.btnSmallH + 8), { variant: 'roll', text: 'Disabled', disabled: true });
    U.button(c, r(364, y, 160, S.btnSmallH + 8), { variant: 'secondary', text: 'Retry', sub: 'costs 1 roll' });
    y += 76;
    // pressed (springs on its own clock), and the idle breath of the main action
    U.button(c, r(16, y, 250, S.btnSmallH), { variant: 'secondary', text: 'Press me', pressed: Math.floor(t * 1.5) % 2 === 0 });
    U.button(c, r(274, y, 250, S.btnSmallH), { variant: 'primary', text: 'Breathing', breathe: t });
    y += 72;

    head(c, 'panel, grid frame, cells, veil', y);
    y += 30;
    U.panel(c, r(16, y, 250, 120), { title: 'Rewards' });
    U.gridFrame(c, r(300, y, 220, 110));
    (['empty', 'ok', 'bad', 'fuse'] as const).forEach((s, i) => U.cell(c, r(306 + i * 52, y + 6, 52, 52), s));
    U.cell(c, r(306, y + 56, 52, 52), 'empty');
    y += 150;

    head(c, 'tiles E D C B A S SSS (and idle, lifted)', y);
    y += 14;
    for (let lv = 1; lv <= 7; lv++) {
      const tr = r(12 + (lv - 1) * 74, y, 66, 66);
      U.tileFrame(c, tr, lv, { t });
      U.classFx(c, tr, lv, t);
      U.classBadge(c, lv, tr.x + 5, tr.y + 18, 0.75, t);
    }
    y += 84;
    const t1 = r(16, y, 66, 66);
    U.tileFrame(c, t1, 4, { idle: true });
    U.tileFrame(c, r(96, y, 66, 66), 6, { lifted: true, t });
    U.classFx(c, r(96, y - U.TILE_LIFT, 66, 66), 6, t);
    U.countBadge(c, 4, 190, y + 33, 1.2);
    U.classBadge(c, 7, 220, y + 33, 1.4, t);
    for (let lv = 1; lv <= 7; lv++) label(c, 'Aa', 330 + (lv - 1) * 28, y + 33, 20, { color: U.classColor(lv, t) });
    U.rainbow(c, 0, 0, 1, 1, t);
    y += 90;

    head(c, 'pieces on the grid: 1, 2 (across, standing) and 4 cells', y);
    y += 14;
    drawPiece(c, { type: 'knife', level: 5, count: 1 }, r(16, y, 84, 84), { t });
    drawPiece(c, { type: 'sprout', level: 1, count: 1 }, r(16, y + 92, 84, 84), { t });
    drawPiece(c, { type: 'ninja', level: 1, count: 2 }, r(108, y, 174, 84), { t });
    drawPiece(c, { type: 'pogo', level: 1, count: 2, turned: true } as never, r(290, y, 84, 176), { t });
    drawPiece(c, { type: 'boulder', level: 1, count: 4 }, r(382, y, 146, 146), { t });
    drawPiece(c, { type: 'helmet', level: 1, count: 1 }, r(108, y + 92, 84, 84), { t, idle: true });
    drawPiece(c, { type: 'chili', level: 2, count: 1 }, r(198, y + 92, 84, 84), { t, lifted: true });
    y += 196;

    head(c, 'the POWER plate, the score bug, a power chip', y);
    y += 50;
    U.powerBadge(c, 270, y, 1959 + Math.floor(t / 2) * 37, { w: 280, h: 76, key: 'kit' });
    y += 56;
    U.scoreBug(c, r(12, y, 516, U.SCORE_BUG.h), { home: { name: 'You', score: 17 }, away: { name: 'Wave 4', score: 18 }, clock: '0:54', flash: 0 });
    y += U.SCORE_BUG.h + 12;
    U.scoreBug(c, r(12, y, 516, U.SCORE_BUG.h), { home: { name: 'You', score: 3 }, away: { name: 'Boss wave', score: 3 }, clock: '+0:12', hot: true });
    y += U.SCORE_BUG.h + 20;
    U.powerChip(c, r(16, y, 150, 36), 3314);
    y += 56;

    head(c, 'bars: progress, tug, meter', y);
    y += 14;
    U.progressBar(c, r(16, y, 240, 24), 0.62);
    U.meter(c, r(284, y, 240, 24), 0.55, { ticks: 5 });
    y += 40;
    U.tugBar(c, r(16, y, 508, 30), 0.58 + 0.06 * Math.sin(t), 0.42, t);
    y += 40;
    U.meter(c, r(16, y, 240, 24), 1, { ticks: 5, full: true });
    U.progressBar(c, r(284, y, 240, 24), 0.2, { color: UI.accent });
    y += 60;

    head(c, 'ribbons and toast', y);
    y += 48;
    U.ribbon(c, 270, y, 400, 'STAGE 2 CLEAR!', { color: 'reward', sub: '3 stars  ·  +9 gems' });
    y += 120;
    U.ribbon(c, 140, y, 230, 'SO CLOSE!', { color: 'muted', size: 36 });
    U.ribbon(c, 400, y, 200, 'WAVE 3 CLEAR', { color: 'accent', size: 30 });
    y += 62;
    U.ribbon(c, 270, y, 240, 'FIGHT', { color: 'plain', size: 44 });
    U.toast(c, 'Not enough cash', 270, y + 80, 0.5);
    y += 130;

    head(c, 'hint (a tail when near, an arrow over a far target)', y);
    U.hint(c, r(40, y + 20, 220, 70), 'Tap START WAVE', { x: 150, y: y + 130 }, t);
    U.hint(c, r(280, y + 20, 220, 70), 'Drag a piece onto the grid', { x: 390, y: y + 190 }, t);
    y += 210;

    head(c, 'icons at 40 px', y);
    const names = [
      (x: number, z: number) => I.cash(c, x, y + 40, z),
      (x: number, z: number) => I.gem(c, x, y + 40, z),
      (x: number, z: number) => I.bars(c, x, y + 40, z),
      (x: number, z: number) => I.star(c, x, y + 40, z),
      (x: number, z: number) => I.cycle(c, x, y + 40, z),
      (x: number, z: number) => I.rollToken(c, x, y + 40, z),
      (x: number, z: number) => I.swords(c, x, y + 40, z),
      (x: number, z: number) => I.heart(c, x, y + 40, z),
      (x: number, z: number) => I.clock(c, x, y + 40, z),
      (x: number, z: number) => I.koStar(c, x, y + 40, z),
      (x: number, z: number) => I.speaker(c, x, y + 40, z, false),
      (x: number, z: number) => I.speaker(c, x, y + 40, z, true),
      (x: number, z: number) => I.trash(c, x, y + 40, z),
      (x: number, z: number) => I.wand(c, x, y + 40, z),
      (x: number, z: number) => I.hand(c, x, y + 40, z),
      (x: number, z: number) => I.lock(c, x, y + 40, z),
      (x: number, z: number) => I.check(c, x, y + 40, z),
      (x: number, z: number) => I.arrow(c, x, y + 40, z),
    ];
    names.forEach((f, i) => f(30 + i * 36, 34));
    y += 70;
    head(c, 'icons at 20 px', y);
    names.forEach((f, i) => {
      const yy = y + 18;
      c.save();
      c.translate(0, yy - (y + 40));
      f(30 + i * 36, 20);
      c.restore();
    });
    y += 50;
  },
});
