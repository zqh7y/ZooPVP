import { stage, param, paramNum } from './harness';
import { Arena } from '../src/draw/arena';
import { W, H, TEAM } from '../src/theme';
import { project, setView, setFocus, viewRect, viewScale, FOCUS_HOME, fitHeight } from '../src/draw/camera';
import { circle, ellipse, fillStroke, font, smooth } from '../src/util';

/*
 * The arena in the main screen's two views, with test circles standing on known arena points so the camera's
 * mapping can be checked by eye.
 *   ?view=prep   the prep view: a 540 x 470 rect under a 90 px top bar (default)
 *   ?view=wave   the wave view: 540 x 930 under the top bar
 *   ?view=grow   the prep view growing into the wave view and back, over and over
 *   ?view=full   the whole screen
 *   &focus=ay    the prep view's focus depth
 *   &cheer=0|1|-1  set that team's fans off (every 2.5 s)
 */
const view = param('view', 'prep');
const BAR = 90;
const PREP = { x: 0, y: BAR, w: W, h: 470 };
const WAVE = { x: 0, y: BAR, w: W, h: fitHeight(W) };
const FULL = { x: 0, y: 0, w: W, h: H };
setFocus(paramNum('focus', FOCUS_HOME));

const arena = new Arena();
const ratio = Math.max(1, window.devicePixelRatio || 1);
const b0 = performance.now();
arena.build(ratio);
const buildMs = performance.now() - b0;

// test points: corners, centre, penalty spots, and two armies in their rows
const points: { ax: number; ay: number; team: number; r: number; tag?: string }[] = [
  { ax: 20, ay: 20, team: 1, r: 9, tag: '20,20' },
  { ax: 440, ay: 20, team: 1, r: 9, tag: '440,20' },
  { ax: 20, ay: 800, team: 0, r: 9, tag: '20,800' },
  { ax: 440, ay: 800, team: 0, r: 9, tag: '440,800' },
  { ax: 230, ay: 410, team: 0, r: 7, tag: 'centre' },
  { ax: 230, ay: 100, team: 1, r: 7, tag: 'spot' },
  { ax: 230, ay: 720, team: 0, r: 7, tag: 'spot' },
];
for (let row = 0; row < 3; row++)
  for (let k = 0; k < 5; k++) {
    const r = 14 - row * 2;
    points.push({ ax: 230 + (k - 2) * 62, ay: 690 + row * 40, team: 0, r });
    points.push({ ax: 230 + (k - 2) * 62, ay: 130 - row * 40, team: 1, r });
  }

function rectFor(t: number) {
  if (view === 'wave') return WAVE;
  if (view === 'full') return FULL;
  if (view === 'grow') {
    const p = (t % 4) / 4;
    const k = smooth(Math.min(1, Math.max(0, p < 0.5 ? (p - 0.1) / 0.3 : 1 - (p - 0.6) / 0.3)));
    return { x: 0, y: BAR, w: W, h: PREP.h + (WAVE.h - PREP.h) * k };
  }
  return PREP;
}

// time drawBack + drawFront over 200 frames on a scratch canvas, each frame read back (one pixel) so it is really
// painted; the read-back's own cost is measured the same way and taken off
let perf = '';
{
  const cv = document.createElement('canvas');
  cv.width = W * ratio;
  cv.height = H * ratio;
  const c = cv.getContext('2d')!;
  c.scale(ratio, ratio);
  setView(WAVE);
  arena.cheer(0);
  for (let i = 0; i < 20; i++) {
    arena.drawBack(c, i / 60);
    arena.drawFront(c, i / 60);
    c.getImageData(0, 0, 1, 1);
  }
  const N = 200;
  let t0 = performance.now();
  for (let i = 0; i < N; i++) {
    c.fillStyle = i % 2 ? '#fff' : '#000';
    c.fillRect(0, 0, 1, 1);
    c.getImageData(0, 0, 1, 1);
  }
  const base = (performance.now() - t0) / N;
  t0 = performance.now();
  for (let i = 0; i < N; i++) {
    if (i % 60 === 0) arena.cheer(i % 120 ? 1 : 0);
    arena.update(1 / 60);
    arena.drawBack(c, i / 60);
    arena.drawFront(c, i / 60);
    c.getImageData(0, 0, 1, 1);
  }
  const ms = (performance.now() - t0) / N - base;
  perf = `${ms.toFixed(3)} ms/frame (ratio ${ratio}), build ${buildMs.toFixed(0)} ms`;
  console.log('arena', perf);
  arena.update(10);
}

const cheerTeam = param('cheer');
let nextCheer = 0.3;

stage({
  w: W,
  h: H,
  bg: '#efe9de',
  draw(ctx, t, dt) {
    arena.update(dt);
    if (cheerTeam && (t >= nextCheer || dt === 0)) {
      arena.cheer(Number(cheerTeam));
      nextCheer = t + 2.5;
    }
    const r = rectFor(t);
    setView(r);
    arena.drawBack(ctx, t);
    const s = viewScale();
    const v = viewRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    for (const d of points) {
      const p = project(d.ax, d.ay);
      const rad = d.r * s;
      ellipse(ctx, p.x, p.y, rad * 0.95, rad * 0.4);
      ctx.fillStyle = 'rgba(30, 44, 30, 0.22)';
      ctx.fill();
      circle(ctx, p.x, p.y - rad, rad);
      fillStroke(ctx, TEAM[d.team].main, 2.4, '#2a313c');
      // the exact arena point
      circle(ctx, p.x, p.y, 1.6);
      ctx.fillStyle = '#20262f';
      ctx.fill();
      if (d.tag) {
        ctx.font = font(12, 700);
        ctx.fillStyle = '#20262f';
        ctx.textAlign = 'center';
        ctx.fillText(d.tag, p.x, p.y + 13);
      }
    }
    ctx.restore();
    arena.drawFront(ctx, t);

    // the main screen's frame: a top bar, and what lies under the view
    ctx.fillStyle = '#f7f3ec';
    ctx.fillRect(0, 0, W, BAR);
    ctx.fillStyle = '#e4ddd0';
    ctx.fillRect(0, BAR - 1, W, 1);
    ctx.font = font(15, 600);
    ctx.fillStyle = '#5d6672';
    ctx.textAlign = 'left';
    ctx.fillText(`${view}  view ${v.w}x${Math.round(v.h)}  scale ${s.toFixed(3)}  ${perf}`, 12, BAR - 12);
    const under = v.y + v.h;
    if (under < H) {
      ctx.fillStyle = '#f2ece2';
      ctx.fillRect(0, under, W, H - under);
      ctx.fillStyle = '#e4ddd0';
      ctx.fillRect(0, under, W, 1);
      ctx.fillStyle = '#9aa1ab';
      ctx.textAlign = 'center';
      ctx.fillText('(the grid and the tray)', W / 2, under + 40);
    }
  },
});
Object.assign(window as object, { arena, setView });
