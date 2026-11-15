import { sfx } from './audio/engine';
import { Arena } from './draw/arena';
import { Inventory } from './logic/inventory';
import { load, replacedOldSave, save, SAVE_KEY } from './logic/save';
import type { App, Screen } from './screen';
import { createLobby } from './screens/lobby';
import { COLOR, H, W } from './theme';

const MAX_DT = 0.05;

/** true when the stored save was of an older version (the main screen shows FRESH_START_TOAST once). */
function hadOldSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return !!raw && replacedOldSave(JSON.parse(raw));
  } catch {
    return false;
  }
}

/** The one game: canvas, save, the main screen and the frame loop. */
export function createApp(canvas: HTMLCanvasElement): App {
  const ctx = canvas.getContext('2d')!;
  // the page around the canvas takes the game's soft greige, so a wide window never frames it in a dark band
  document.body.style.background = COLOR.page;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR.page);
  const fresh = hadOldSave();
  const state = load();
  const inv = new Inventory(state);
  const arena = new Arena();
  let ratio = 1;
  let time = 0;
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
    save() {
      save(state);
    },
  };

  const screen: Screen = createLobby(app, { freshStart: fresh });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const view = Math.min(window.innerWidth / W, window.innerHeight / H);
    ratio = view * dpr;
    canvas.style.width = `${Math.floor(W * view)}px`;
    canvas.style.height = `${Math.floor(H * view)}px`;
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    arena.build(ratio);
    screen.resize?.(ratio);
  }
  window.addEventListener('resize', resize);
  resize();

  // pointers: one finger at a time, in logical px
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (finger !== null) return;
    finger = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    screen.pointerDown?.(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== finger) return;
    const p = local(e);
    screen.pointerMove?.(p.x, p.y);
  });
  canvas.addEventListener('pointerup', (e) => {
    // phones only let sound start when a finger lifts
    sfx.unlock();
    if (e.pointerId !== finger) return;
    finger = null;
    const p = local(e);
    screen.pointerUp?.(p.x, p.y);
  });
  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== finger) return;
    finger = null;
    screen.pointerCancel?.();
  });
  canvas.addEventListener('touchend', () => sfx.unlock(), { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // a hidden tab stops the clock: no huge step when it comes back
  let last = performance.now();
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });

  function frame(now: number) {
    const dt = document.hidden ? 0 : Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    arena.update(dt);
    screen.update(dt);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = COLOR.page;
    ctx.fillRect(0, 0, W, H);
    screen.render(ctx);
    requestAnimationFrame(frame);
  }

  screen.enter?.();
  requestAnimationFrame(frame);
  if (import.meta.env.DEV) Object.assign(window as object, { app, sfx, screen });
  return app;
}
