import { fontReady } from '../src/boot';

/*
 * A tiny stage for the developer pages in /dev: one canvas of a given logical size, scaled for sharp
 * screenshots, with a draw loop.
 *
 *   stage({ w: 540, h: 1170, draw(ctx, t, dt) { ... } })
 *
 * URL parameters, so a screenshot can show an exact moment:
 *   ?t=1.5      freeze time at 1.5 s (draw is called with that t and dt = 0)
 *   ?speed=0.25 slow motion
 *   ?bg=%23223  page background
 * The page sets document.title to "ready" after the first frame is drawn.
 */
export interface StageOpts {
  w: number;
  h: number;
  /** canvas background, painted before every draw (default: none) */
  bg?: string;
  draw: (ctx: CanvasRenderingContext2D, t: number, dt: number) => void;
  /** pointer events in logical pixels */
  onDown?: (x: number, y: number) => void;
  onMove?: (x: number, y: number) => void;
  onUp?: (x: number, y: number) => void;
}

export const params = new URLSearchParams(location.search);
export const param = (name: string, fallback = '') => params.get(name) ?? fallback;
export const paramNum = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback);

export async function stage(o: StageOpts): Promise<HTMLCanvasElement> {
  await fontReady();
  document.body.style.margin = '0';
  document.body.style.background = param('bg', '#1b1522');
  const canvas = document.createElement('canvas');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(o.w * dpr);
  canvas.height = Math.round(o.h * dpr);
  canvas.style.width = `${o.w}px`;
  canvas.style.height = `${o.h}px`;
  canvas.style.display = 'block';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * o.w) / r.width, y: ((e.clientY - r.top) * o.h) / r.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e);
    o.onDown?.(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    o.onMove?.(p.x, p.y);
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = local(e);
    o.onUp?.(p.x, p.y);
  });

  const frozen = params.has('t') ? Number(params.get('t')) : null;
  const speed = paramNum('speed', 1);
  let t = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = frozen === null ? Math.min(0.05, (now - last) / 1000) * speed : 0;
    last = now;
    t = frozen === null ? t + dt : frozen;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (o.bg) {
      ctx.fillStyle = o.bg;
      ctx.fillRect(0, 0, o.w, o.h);
    } else ctx.clearRect(0, 0, o.w, o.h);
    o.draw(ctx, t, dt);
    document.title = 'ready';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return canvas;
}
