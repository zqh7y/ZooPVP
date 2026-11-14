import type { Arena } from './draw/arena';
import type { Inventory } from './logic/inventory';
import type { SimSummary } from './sim/types';
import type { ArmySpec, MatchResult, Opponent, SaveState } from './types';
import type { Ctx } from './util';

/*
 * How the screens plug into the game. Each screen is a module in src/screens that exports
 * create<Name>(app): Screen. The app (src/app.ts) owns the canvas, the saved state and the one current
 * screen, and moves between screens with app.go().
 */

export type ScreenName = 'lobby' | 'roll' | 'match' | 'battle' | 'result';

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

/** The match being played: made by the matchmaking screen, fought by the battle screen, shown by the result. */
export interface Match {
  opponent: Opponent;
  /** your army as it was when the match was made */
  army: ArmySpec;
  /** set by the battle screen when the fight ends */
  summary: SimSummary | null;
  /** set once the match has been applied to the saved state */
  result: MatchResult | null;
}

export interface App {
  readonly state: SaveState;
  readonly inv: Inventory;
  readonly arena: Arena;
  /** seconds since the game started */
  readonly t: number;
  /** device pixels per logical pixel */
  readonly ratio: number;
  match: Match | null;
  /** moves to another screen (with the shared transition) */
  go(to: ScreenName): void;
  /** writes the saved state */
  save(): void;
}
