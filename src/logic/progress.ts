import {
  CELL_LOCKS, CELL_PRICE, ECON, GRID, WAVES, cellBit, clearCash, isBossWave, koCash, stageGems, starsFor, type CellLock,
} from '../data';
import type { SaveState, WaveOutcome, WaveResult } from '../types';
import type { SimSummary } from '../sim/types';

/*
 * Progress through the stages, and the grid's locked cells. A won wave pays cash for its knock-outs and a
 * wave-clear bonus and moves on to the next wave; winning wave WAVES (the boss) clears the stage: 1 to 3 stars (by
 * how much of your army survived), gems, and the next stage. A lost wave pays its knock-outs and keeps the same
 * wave (nothing is taken away). Cells locked by a stage or by knock-outs open by themselves once earned; cash
 * cells are bought (each costs more than the last).
 */

/** The WaveOutcome of a finished fight (team 0 is the player). */
export function outcomeOf(summary: SimSummary): WaveOutcome {
  return {
    won: summary.winner === 0,
    kos: summary.size[1] - summary.alive[1],
    boss: summary.bossKos[0] > 0,
    survived: summary.size[0] > 0 ? summary.alive[0] / summary.size[0] : 0,
  };
}

/** Books a fought wave into the save (see the top of this file) and says what it gave. */
export function applyWave(state: SaveState, outcome: WaveOutcome): WaveResult {
  const stage = state.stage;
  const wave = state.wave;
  const kos = Math.max(0, Math.floor(outcome.kos));
  const per = koCash(stage);
  const koPaid = kos * per + (outcome.boss ? per * (ECON.bossKo - 1) : 0);
  const won = outcome.won;
  const clearPaid = won ? clearCash(stage, wave) : 0;
  state.cash += koPaid + clearPaid;
  state.kos += kos;
  state.fights += 1;
  let stars = 0;
  let gems = 0;
  const stageClear = won && isBossWave(wave);
  state.tries = won ? 0 : state.tries + 1;
  if (won) {
    state.wins += 1;
    if (stageClear) {
      stars = starsFor(Math.max(0, Math.min(1, outcome.survived)));
      gems = stageGems(stage, stars);
      state.gems += gems;
      while (state.stars.length < stage) state.stars.push(0);
      state.stars[stage - 1] = Math.max(state.stars[stage - 1] ?? 0, stars);
      state.stage += 1;
      state.wave = 1;
    } else {
      state.wave = Math.min(WAVES, wave + 1);
    }
  }
  const cells = openEarned(state);
  return {
    won, stage, wave, koCash: koPaid, clearCash: clearPaid, cash: koPaid + clearPaid, stageClear, stars, gems, cells,
    next: { stage: state.stage, wave: state.wave },
  };
}

// ------------------------------------------------------------------ cells

const keyOf = (col: number, row: number) => `${col},${row}`;

/** How this cell opens, or null when it is open (or not a cell). */
export function cellLock(state: Pick<SaveState, 'open'>, col: number, row: number): CellLock | null {
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
  if (state.open & cellBit(col, row)) return null;
  return CELL_LOCKS[keyOf(col, row)] ?? null;
}

/** The cash price of the next cash cell. */
export const cellPrice = (state: Pick<SaveState, 'cellBuys'>) => CELL_PRICE.cost + CELL_PRICE.step * state.cellBuys;

/** How far a locked cell is from opening, for its label: 'cash' (price), 'stage' (the stage it needs), 'ko' (have / need). */
export function cellProgress(state: SaveState, col: number, row: number): { lock: CellLock; have: number; need: number } | null {
  const lock = cellLock(state, col, row);
  if (!lock) return null;
  if (lock.kind === 'cash') return { lock, have: state.cash, need: cellPrice(state) };
  if (lock.kind === 'stage') return { lock, have: state.stage, need: lock.stage };
  return { lock, have: state.kos, need: lock.count };
}

/** true when the player has earned a stage or knock-out cell (it opens at the next openEarned). */
const earned = (state: SaveState, lock: CellLock) =>
  (lock.kind === 'stage' && state.stage >= lock.stage) || (lock.kind === 'ko' && state.kos >= lock.count);

/** Opens every stage and knock-out cell already earned; returns the cells it opened. */
export function openEarned(state: SaveState): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  for (let row = 0; row < GRID.rows; row++)
    for (let col = 0; col < GRID.cols; col++) {
      const lock = cellLock(state, col, row);
      if (lock && earned(state, lock)) {
        state.open |= cellBit(col, row);
        out.push({ col, row });
      }
    }
  return out;
}

/**
 * Opens a locked cell: a cash cell for cellPrice (refused without the cash), a stage or knock-out cell once earned.
 * cost: the cash it took.
 */
export function unlockCell(state: SaveState, col: number, row: number): { ok: boolean; cost: number; reason?: string } {
  const lock = cellLock(state, col, row);
  if (!lock) return { ok: false, cost: 0, reason: 'That cell is open' };
  if (lock.kind === 'cash') {
    const cost = cellPrice(state);
    if (state.cash < cost) return { ok: false, cost: 0, reason: 'Not enough cash' };
    state.cash -= cost;
    state.cellBuys += 1;
    state.open |= cellBit(col, row);
    return { ok: true, cost };
  }
  if (!earned(state, lock)) return { ok: false, cost: 0, reason: lock.kind === 'stage' ? `Opens at stage ${lock.stage}` : `Opens after ${lock.count} knock-outs` };
  state.open |= cellBit(col, row);
  return { ok: true, cost: 0 };
}

/** The open cells, as a count (for a stats panel). */
export function openCells(state: Pick<SaveState, 'open'>): number {
  let n = 0;
  for (let i = 0; i < GRID.cols * GRID.rows; i++) if (state.open & (1 << i)) n++;
  return n;
}
