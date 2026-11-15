import { sfx } from './audio/engine';
import { Arena } from './draw/arena';
import { Inventory } from './logic/inventory';
import { load, migratedOldSave, replacedOldSave, save, SAVE_KEY } from './logic/save';
import type { App, Screen } from './screen';
import { createLobby } from './screens/lobby';
import { COLOR, H, W } from './theme';

const MAX_DT = 0.05;

/**
 * What the stored save was, before load() reads it: 'fresh' when it was too old and is replaced (the main screen shows
 * FRESH_START_TOAST once), 'migrated' when it was a v4 save carried over (MIGRATED_TOAST once), else null.
 */
function oldSave(): 'fresh' | 'migrated' | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    return replacedOldSave(data) ? 'fresh' : migratedOldSave(data) ? 'migrated' : null;
  } catch {
    return null;
  }
}

/** The one game: canvas, save, the main screen and the frame loop. */
export function createApp(canvas: HTMLCanvasElement): App {
  const ctx = canvas.getContext('2d')!;
  // the page around the canvas takes the game's deep base, so a wide window frames it in the same colour
  document.body.style.background = COLOR.page;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR.page);
  const old = oldSave();
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

  const screen: Screen = createLobby(app, { freshStart: old === 'fresh', migrated: old === 'migrated' });

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
    // the play-check script can run the game faster (window.__speed = 4): whole extra steps, nothing skipped
    if (import.meta.env.DEV) {
      const extra = Math.max(0, Math.min(15, Math.floor(Number((window as { __speed?: number }).__speed ?? 1)) - 1));
      for (let i = 0; i < extra && dt > 0; i++) {
        time += dt;
        arena.update(dt);
        screen.update(dt);
      }
    }
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
