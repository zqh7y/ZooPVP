import type { PetType, Team } from '../src/types';
import { TEAM, UI } from '../src/theme';
import { label, rr } from '../src/util';
import type { ArtStyle, ItemType, Pose } from '../src/draw/styles/api';
import { style1 } from '../src/draw/styles/style1';
import { style2 } from '../src/draw/styles/style2';
import { style3 } from '../src/draw/styles/style3';
import { style4 } from '../src/draw/styles/style4';
import { style5 } from '../src/draw/styles/style5';
import { param, stage } from './harness';

/*
 * The art-style samples, for the player to pick one:
 *   ?style=1..5   one style's full sheet (720 x 1300): big pets in every pose and both teams, the game-size
 *                 view on the pitch, the 7 perks on lobby tiles, and pets wearing a knife and a helmet
 *   ?style=all    the 5 side by side (1000 x 1100)
 *   &t=1.2        freezes time (for screenshots)
 */
type Ctx = CanvasRenderingContext2D;
const STYLES: ArtStyle[] = [style1, style2, style3, style4, style5];
const ITEMS: ItemType[] = ['knife', 'bat', 'shield', 'spear', 'helmet', 'sneakers', 'chili'];
const GRASS = ['#7cc95a', '#74c052'];
const which = param('style', '1');

function grass(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  rr(ctx, x, y, w, h, 14);
  ctx.clip();
  const n = 6;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = GRASS[i % 2];
    ctx.fillRect(x, y + (h * i) / n, w, h / n + 1);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.restore();
}

function tile(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = UI.shadow;
  rr(ctx, x, y + 4, s, s, 10);
  ctx.fill();
  ctx.fillStyle = UI.tile;
  rr(ctx, x, y, s, s, 10);
  ctx.fill();
  ctx.strokeStyle = UI.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

const cap = (ctx: Ctx, s: string, x: number, y: number) => label(ctx, s, x, y, 15, { color: UI.textDim });

function sheet(ctx: Ctx, st: ArtStyle, n: number, t: number) {
  label(ctx, `${n} · ${st.NAME}`, 360, 40, 40, { color: UI.text, weight: 700 });
  label(ctx, st.BLURB, 360, 76, 18, { color: UI.textDim });

  // the big pets: ants, then frogs; three poses, the last in red
  const rows: [PetType, number, number][] = [
    ['ant', 250, 50],
    ['frog', 455, 56],
  ];
  const poses: [Pose, Team][] = [
    ['idle', 0],
    ['attack', 0],
    ['hit', 1],
  ];
  for (const [pet, gy, r] of rows) {
    poses.forEach(([pose, team], i) => {
      const x = 130 + i * 230;
      st.drawPet(ctx, pet, team, x, gy, r, pose, t, { face: team === 0 ? 1 : -1 });
      cap(ctx, `${pet} · ${pose}${team ? ' · red' : ''}`, x, gy + 30);
    });
  }

  // the game-size view: red at the top, blue at the bottom, fight radius ant 16 / frog 26
  label(ctx, 'AT GAME SIZE', 360, 510, 16, { color: UI.text, weight: 700 });
  grass(ctx, 30, 524, 660, 300);
  const fighters: [PetType, Team, number, number, Pose][] = [
    ['frog', 1, 150, 628, 'idle'],
    ['frog', 1, 300, 618, 'attack'],
    ['ant', 1, 430, 598, 'idle'],
    ['ant', 1, 500, 610, 'hit'],
    ['ant', 1, 570, 598, 'attack'],
    ['ant', 0, 130, 758, 'attack'],
    ['ant', 0, 200, 770, 'idle'],
    ['ant', 0, 270, 758, 'idle'],
    ['frog', 0, 420, 778, 'idle'],
    ['frog', 0, 560, 768, 'attack'],
  ];
  for (const [pet, team, x, y, pose] of fighters) {
    st.drawPet(ctx, pet, team, x, y, pet === 'ant' ? 16 : 26, pose, t + x * 0.01, {
      face: team === 0 ? 1 : -1,
      weapon: x % 3 === 0 ? 'knife' : x % 3 === 1 ? 'bat' : null,
      helmet: x % 2 === 0,
    });
  }

  // the perks on lobby tiles
  label(ctx, 'PERKS', 360, 860, 16, { color: UI.text, weight: 700 });
  ITEMS.forEach((it, i) => {
    const s = 84;
    const x = 30 + i * 95;
    tile(ctx, x, 878, s);
    st.drawItem(ctx, it, x + s / 2, 878 + s / 2, 64);
    cap(ctx, it, x + s / 2, 982);
  });

  // dressed: a knife and a helmet, and a spear / shield pair
  label(ctx, 'EQUIPPED', 360, 1020, 16, { color: UI.text, weight: 700 });
  const dressed: [PetType, Team, Pose, 'knife' | 'bat' | 'spear' | 'shield'][] = [
    ['ant', 0, 'idle', 'knife'],
    ['frog', 0, 'attack', 'bat'],
    ['ant', 1, 'attack', 'spear'],
    ['frog', 1, 'idle', 'shield'],
  ];
  dressed.forEach(([pet, team, pose, weapon], i) => {
    const x = 105 + i * 170;
    st.drawPet(ctx, pet, team, x, 1200, pet === 'ant' ? 44 : 50, pose, t, { weapon, helmet: true, face: team === 0 ? 1 : -1 });
    cap(ctx, `${pet} · ${weapon} · helmet`, x, 1226);
  });

  // team swatches, so the colours can be judged
  TEAM.forEach((c, i) => {
    ctx.fillStyle = c.main;
    rr(ctx, 290 + i * 80, 1262, 60, 22, 11);
    ctx.fill();
  });
}

function overview(ctx: Ctx, t: number) {
  label(ctx, 'ZooPVP · 5 art styles', 500, 44, 38, { color: UI.text, weight: 700 });
  STYLES.forEach((st, i) => {
    const cx = 100 + i * 200;
    label(ctx, `${i + 1}`, cx, 98, 34, { color: UI.accentDark, weight: 700 });
    label(ctx, st.NAME, cx, 128, 18, { color: UI.text, weight: 700 });
    st.drawPet(ctx, 'ant', 0, cx, 270, 44, 'idle', t);
    st.drawPet(ctx, 'frog', 0, cx, 450, 50, 'idle', t);
    st.drawPet(ctx, 'frog', 1, cx, 610, 46, 'attack', t, { face: -1, weapon: 'bat', helmet: true });
    grass(ctx, cx - 92, 650, 184, 170);
    st.drawPet(ctx, 'ant', 1, cx - 40, 712, 16, 'idle', t, { face: -1, weapon: 'knife' });
    st.drawPet(ctx, 'frog', 1, cx + 36, 716, 26, 'attack', t, { face: -1 });
    st.drawPet(ctx, 'frog', 0, cx - 34, 800, 26, 'idle', t, { helmet: true });
    st.drawPet(ctx, 'ant', 0, cx + 44, 790, 16, 'attack', t, { weapon: 'spear' });
    (['knife', 'helmet', 'chili'] as ItemType[]).forEach((it, j) => {
      const y = 850 + j * 78;
      tile(ctx, cx - 34, y, 68);
      st.drawItem(ctx, it, cx, y + 34, 52);
    });
  });
}

const overviewMode = which === 'all';
const n = overviewMode ? 0 : Math.min(5, Math.max(1, Number(which) || 1));
stage({
  w: overviewMode ? 1000 : 720,
  h: overviewMode ? 1100 : 1300,
  bg: UI.bg,
  draw(ctx, t) {
    if (overviewMode) overview(ctx, t);
    else sheet(ctx, STYLES[n - 1], n, t);
  },
});
