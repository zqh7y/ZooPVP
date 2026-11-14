import { stage, param } from './harness';
import { Arena } from '../src/draw/arena';
import { W, H, TEAM, S, TYPE } from '../src/theme';
import { ARENA } from '../src/data';
import { project } from '../src/draw/camera';
import { circle, ellipse, fillStroke, label, seeded } from '../src/util';

// ?view=battle|stage|lobby|dusk  &cheer=1 to see the crowd jump
const view = param('view', 'battle');
const arena = new Arena();
arena.build(Math.max(1, window.devicePixelRatio || 1));

const rnd = seeded(9);
const dots = Array.from({ length: 12 }, (_, i) => {
  const team = i < 6 ? 1 : 0;
  return {
    team,
    r: 8 + Math.floor(rnd() * 16),
    // arena points, drawn through the match camera like the real fighters
    ax: 30 + rnd() * (ARENA.w - 60),
    ay: team ? 40 + rnd() * 340 : ARENA.h - 40 - rnd() * 340,
  };
});

// time drawBattle + drawBattleFront over 200 frames on a scratch canvas
let perf = '';
{
  const cv = document.createElement('canvas');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  for (let i = 0; i < 20; i++) {
    arena.drawBattle(c, i / 60);
    arena.drawBattleFront(c, i / 60);
  }
  c.getImageData(0, 0, 1, 1);
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) {
    arena.update(1 / 60);
    arena.drawBattle(c, i / 60);
    arena.drawBattleFront(c, i / 60);
  }
  c.getImageData(0, 0, 1, 1);
  perf = `${((performance.now() - t0) / 200).toFixed(3)} ms/frame`;
  console.log('arena', perf);
}

if (param('cheer') === '1') arena.cheer(1);

stage({
  w: W,
  h: H,
  bg: '#000',
  draw(ctx, t, dt) {
    arena.update(dt);
    if (view === 'stage') {
      arena.drawLobbyBack(ctx, t);
      arena.drawStage(ctx, t);
    } else if (view === 'lobby') arena.drawLobbyBack(ctx, t);
    else if (view === 'dusk') arena.drawDusk(ctx, t);
    else {
      arena.drawBattle(ctx, t);
      for (const d of dots) {
        const p = project(d.ax, d.ay);
        const r = d.r * p.s;
        ellipse(ctx, p.x + r * 0.3, p.y, r, r * 0.35);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();
        circle(ctx, p.x, p.y - r, r);
        fillStroke(ctx, TEAM[d.team].main, S.line.ui);
      }
      arena.drawBattleFront(ctx, t);
      label(ctx, perf, W / 2, H - 14, TYPE.small);
    }
  },
});
