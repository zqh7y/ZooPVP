import type { Arena } from './draw/arena';
import type { Inventory } from './logic/inventory';
import type { SaveState } from './types';
import type { Ctx } from './util';

/*
 * How the screens plug into the game. Since v4 there is one main screen (src/screens/lobby.ts, like Bunny Brigade's):
 * the top bar, the arena (it owns the battle view: prep, then the wave fought in a view that grows), the grid, the
 * tray and the cases, with the roll and every panel as overlays on it. The app (src/app.ts) owns the canvas, the
 * saved state and the frame loop.
 */

export type ScreenName = 'main';

export interface Screen {
  /** it becomes the current screen */
  enter?(): void;
  leave?(): void;
  update(dt: number): void;
  /** draws the whole 540 x 1170 screen */
  render(ctx: Ctx): void;
  /** pointer events in logical pixels (one finger at a time) */
  pointerDown?(x: number, y: number): void;
  pointerMove?(x: number, y: number): void;
  pointerUp?(x: number, y: number): void;
  pointerCancel?(): void;
  /** the device resolution changed: rebuild cached pictures */
  resize?(ratio: number): void;
}

export interface App {
  readonly state: SaveState;
  readonly inv: Inventory;
  readonly arena: Arena;
  /** seconds since the game started */
  readonly t: number;
  /** device pixels per logical pixel */
  readonly ratio: number;
  /** writes the saved state */
  save(): void;
}
