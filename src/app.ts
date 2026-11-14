import { sfx } from './audio/engine';
import { Arena } from './draw/arena';
import { Inventory } from './logic/inventory';
import { load, save } from './logic/save';
import type { App, Match, Screen, ScreenName } from './screen';
import { createBattleScreen } from './screens/battle';
import { createLobby } from './screens/lobby';
import { createMatch } from './screens/match';
import { createResult } from './screens/result';
import { createRoll } from './screens/roll';
import { COLOR, H, W } from './theme';
import { easeInOutCubic, type Ctx } from './util';

const MAX_DT = 0.05;
const WIPE_OUT = 0.18; // the curtain closes over the old screen
const WIPE_IN = 0.22; // and opens on the new one
const WIPE_SLANT = 120; // the curtain's leading edge leans this much
const WIPE_EDGE = 12;

/** The one game: canvas, save, screens, the frame loop and the shared screen transition. */
export function createApp(canvas: HTMLCanvasElement): App {
  const ctx = canvas.getContext('2d')!;
  const state = load();
  const inv = new Inventory(state);
  const arena = new Arena();
  let ratio = 1;
  let time = 0;
  let current: Screen | null = null;
  let name: ScreenName = 'lobby';
  // transition: 'out' covers the old screen, then the switch, then 'in' uncovers the new one
  let wipe: { phase: 'out' | 'in'; age: number; to: ScreenName } | null = null;
  let finger: number | null = null;

  const app: App = {
    state,
    inv,
    arena,
    get t() {
      return time;
    },
    get ratio() {
      return ratio;
    },
    match: null as Match | null,
    go(to) {
      if (!current) {
        show(to);
        return;
      }
      if (wipe) {
        if (wipe.phase === 'out') wipe.to = to;
        else {
          show(to);
          wipe = { phase: 'in', age: 0, to };
        }
        return;
      }
      wipe = { phase: 'out', age: 0, to };
      sfx.play('whoosh');
    },
    save() {
      save(state);
    },
  };

  const screens: Record<ScreenName, Screen> = {
    lobby: createLobby(app),
    roll: createRoll(app),
    match: createMatch(app),
    battle: createBattleScreen(app),
    result: createResult(app),
  };

  function show(to: ScreenName) {
    if (current) {
      if (finger !== null) current.pointerCancel?.();
      current.leave?.();
    }
    finger = null;
    name = to;
    current = screens[to];
    current.resize?.(ratio);
    current.enter?.();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const view = Math.min(window.innerWidth / W, window.innerHeight / H);
    ratio = view * dpr;
    canvas.style.width = `${Math.floor(W * view)}px`;
    canvas.style.height = `${Math.floor(H * view)}px`;
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    arena.build(ratio);
    for (const s of Object.values(screens)) s.resize?.(ratio);
  }
  window.addEventListener('resize', resize);
  resize();

  // pointers: one finger at a time, in logical px; none while the curtain moves
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (finger !== null || wipe) return;
    finger = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    current?.pointerDown?.(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== finger) return;
    const p = local(e);
    current?.pointerMove?.(p.x, p.y);
  });
  canvas.addEventListener('pointerup', (e) => {
    // phones only let sound start when a finger lifts
    sfx.unlock();
    if (e.pointerId !== finger) return;
    finger = null;
    const p = local(e);
    current?.pointerUp?.(p.x, p.y);
  });
  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== finger) return;
    finger = null;
    current?.pointerCancel?.();
  });
  canvas.addEventListener('touchend', () => sfx.unlock(), { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // a hidden tab stops the clock: no huge step when it comes back
  let last = performance.now();
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });

  function drawWipe(c: Ctx) {
    if (!wipe) return;
    const k = wipe.phase === 'out' ? easeInOutCubic(Math.min(1, wipe.age / WIPE_OUT)) : 1 - easeInOutCubic(Math.min(1, wipe.age / WIPE_IN));
    if (k <= 0) return;
    // a slanted curtain sweeping in from the right, leaving to the left
    const span = W + WIPE_SLANT;
    const edge = wipe.phase === 'out' ? W - span * k : span * (1 - k) - WIPE_SLANT;
    c.save();
    c.beginPath();
    if (wipe.phase === 'out') {
      c.moveTo(edge + WIPE_SLANT, 0);
      c.lineTo(W + WIPE_SLANT, 0);
      c.lineTo(W + WIPE_SLANT, H);
      c.lineTo(edge, H);
    } else {
      c.moveTo(-WIPE_SLANT, 0);
      c.lineTo(edge + WIPE_SLANT, 0);
      c.lineTo(edge, H);
      c.lineTo(-WIPE_SLANT, H);
    }
    c.closePath();
    c.fillStyle = COLOR.page;
    c.fill();
    // only the leading edge gets the sakura stripe
    c.beginPath();
    c.moveTo(edge + WIPE_SLANT, 0);
    c.lineTo(edge, H);
    c.lineWidth = WIPE_EDGE;
    c.strokeStyle = COLOR.sakura;
    c.stroke();
    c.restore();
  }

  function frame(now: number) {
    const dt = document.hidden ? 0 : Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    if (wipe) {
      wipe.age += dt;
      if (wipe.phase === 'out' && wipe.age >= WIPE_OUT) {
        show(wipe.to);
        wipe = { phase: 'in', age: 0, to: wipe.to };
      } else if (wipe.phase === 'in' && wipe.age >= WIPE_IN) wipe = null;
    }
    arena.update(dt);
    current?.update(dt);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = COLOR.page;
    ctx.fillRect(0, 0, W, H);
    current?.render(ctx);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawWipe(ctx);
    requestAnimationFrame(frame);
  }

  show(name);
  requestAnimationFrame(frame);
  if (import.meta.env.DEV) Object.assign(window as object, { app, sfx, screenName: () => name });
  return app;
}
