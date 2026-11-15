import {
  CELL_LOCKS, CELL_PRICE, CHAMPION, GRID, LEVEL, REWARD, cellBit, champGems, isChampionMatch, koCash, lossCash, streakCash,
  winCash, xpToNext, type CellLock,
} from '../data';
import { hashSeed, makeRng } from '../rng';
import type { ArmySpec, MatchOutcome, MatchResult, SaveState, SquadScore } from '../types';
import type { SimSummary } from '../sim/types';

/*
 * Rewards, the player level and the grid's locked cells. A won match pays cash (a base by level, a share per
 * knock-out and a win-streak bonus), XP and sometimes gems; a champion win pays CHAMPION.rewards x the cash and XP
 * and always gems. A lost match pays a little cash and XP; nothing is ever taken away. XP fills the player level
 * (xpToNext in data.ts). Cells locked by a level or by knock-outs open by themselves once earned; cash cells are
 * bought (each costs more than the last).
 */

/**
 * The MatchOutcome of a finished fight (team 0 is the player). With the player's army (the one the fight was
 * created with) it also says what each of its squads did, so applyMatch can name the MVP.
 */
export function outcomeOf(summary: SimSummary, mine?: ArmySpec): MatchOutcome {
  const out: MatchOutcome = {
    won: summary.winner === 0,
    kos: summary.size[1] - summary.alive[1],
    boss: summary.bossKos[0] > 0,
    survived: summary.size[0] > 0 ? summary.alive[0] / summary.size[0] : 0,
  };
  if (mine) {
    // the simulator numbers team 0's units first, squad by squad, in army order
    let id = 0;
    out.squads = mine.squads.map((q) => {
      const s: SquadScore = { key: q.key, pet: q.pet, kos: 0, dmg: 0 };
      for (let k = 0; k < q.count; k++, id++) {
        s.kos += summary.kos[id] ?? 0;
        s.dmg += summary.dealt[id] ?? 0;
      }
      return s;
    });
  }
  return out;
}

/** The MVP of a match: the squad with the most knock-outs, then the most damage, then the first; null when none scored. */
export function mvpOf(squads: readonly SquadScore[] | undefined): SquadScore | null {
  let best: SquadScore | null = null;
  for (const s of squads ?? []) {
    if (s.kos <= 0 && s.dmg <= 0) continue;
    if (!best || s.kos > best.kos || (s.kos === best.kos && s.dmg > best.dmg)) best = s;
  }
  return best ? { ...best } : null;
}

/** The player level as the top bar shows it: the level, the XP into it, what it needs, and the bar's fill 0..1. */
export function levelProgress(state: Pick<SaveState, 'level' | 'xp'>): { level: number; xp: number; need: number; share: number } {
  const need = xpToNext(state.level);
  const xp = Math.max(0, Math.min(need, state.xp));
  return { level: state.level, xp, need, share: state.level >= LEVEL.max ? 1 : xp / need };
}

/** Adds XP to the save, levelling up as far as it reaches (at most LEVEL.max). Returns the levels gained. */
export function addXp(state: SaveState, xp: number): number {
  const was = state.level;
  state.xp += Math.max(0, Math.floor(xp));
  while (state.level < LEVEL.max && state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level += 1;
  }
  if (state.level >= LEVEL.max) state.xp = Math.min(state.xp, xpToNext(LEVEL.max));
  return state.level - was;
}

/** Books a fought match into the save (see the top of this file) and says what it gave. */
export function applyMatch(state: SaveState, outcome: MatchOutcome): MatchResult {
  const match = state.matches + 1;
  const champion = outcome.champion ?? isChampionMatch(match);
  const level = state.level;
  const from = { level, xp: state.xp, need: xpToNext(level) };
  const won = outcome.won;
  const kos = Math.max(0, Math.floor(outcome.kos));
  const per = koCash(level);
  const koPaid = kos * per + (outcome.boss ? per * (REWARD.bossKo - 1) : 0);
  const streak = won ? state.streak + 1 : 0;
  const base = won ? winCash(level) : lossCash(level);
  const streakPaid = won ? streakCash(level, streak) : 0;
  const mult = champion && won ? CHAMPION.rewards : 1;
  const cash = (base + koPaid + streakPaid) * mult;
  const rng = makeRng(hashSeed(state.seed, match, 0x6e35));
  const gems = champion && won ? champGems(level) : won && rng.chance(REWARD.gemChance) ? rng.int(REWARD.gems[0], REWARD.gems[1]) : 0;
  const xp = ((won ? REWARD.xpWin : REWARD.xpLoss) + REWARD.xpKo * kos) * mult;

  state.cash += cash;
  state.gems += gems;
  state.kos += kos;
  state.matches = match;
  state.streak = streak;
  state.slump = won ? 0 : state.slump + 1;
  state.bestStreak = Math.max(state.bestStreak, streak);
  if (won) state.wins += 1;
  if (won && champion) state.champs += 1;
  const gained = addXp(state, xp);
  const cells = openEarned(state);
  return {
    won, champion, match, baseCash: base * mult, koCash: koPaid * mult, streakCash: streakPaid * mult, cash, gems, xp, kos,
    from, to: { level: state.level, xp: state.xp, need: xpToNext(state.level) },
    levelUp: gained > 0 ? state.level : null,
    streak,
    mvp: mvpOf(outcome.squads),
    cells,
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

/** How far a locked cell is from opening, for its label: 'cash' (have cash / price), 'level' (level / the level it needs), 'ko' (have / need). */
export function cellProgress(state: SaveState, col: number, row: number): { lock: CellLock; have: number; need: number } | null {
  const lock = cellLock(state, col, row);
  if (!lock) return null;
  if (lock.kind === 'cash') return { lock, have: state.cash, need: cellPrice(state) };
  if (lock.kind === 'level') return { lock, have: state.level, need: lock.level };
  return { lock, have: state.kos, need: lock.count };
}

/** true when the player has earned a level or knock-out cell (it opens at the next openEarned). */
const earned = (state: SaveState, lock: CellLock) =>
  (lock.kind === 'level' && state.level >= lock.level) || (lock.kind === 'ko' && state.kos >= lock.count);

/** Opens every level and knock-out cell already earned; returns the cells it opened. */
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
 * Opens a locked cell: a cash cell for cellPrice (refused without the cash), a level or knock-out cell once earned.
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
  if (!earned(state, lock)) return { ok: false, cost: 0, reason: lock.kind === 'level' ? `Opens at level ${lock.level}` : `Opens after ${lock.count} knock-outs` };
  state.open |= cellBit(col, row);
  return { ok: true, cost: 0 };
}

/** The open cells, as a count (for a stats panel). */
export function openCells(state: Pick<SaveState, 'open'>): number {
  let n = 0;
  for (let i = 0; i < GRID.cols * GRID.rows; i++) if (state.open & (1 << i)) n++;
  return n;
}
