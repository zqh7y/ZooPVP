import { PIECE_TYPES, PITY, ROLL_CLASS_ODDS, ROLL_TYPE_ODDS, SCRIPTED_ROLLS, TOP_ODDS, leagueOf } from '../data';
import type { RollResult, SaveState } from '../types';
import type { Rng } from '../rng';

/** The % chance of each class E..SSS to show for this player's league. */
export function classOdds(state: SaveState): number[] {
  return [...ROLL_CLASS_ODDS[leagueOf(state.trophies)]];
}

/**
 * Opens one roll: spends it, updates pity and rolled, and returns what it gave (the caller adds the piece).
 * Order: scripted first rolls, then the pity roll, then the league's odds. Null when no roll is waiting.
 */
export function rollOnce(state: SaveState, rng: Rng): RollResult | null {
  if (state.rolls <= 0) return null;
  let res: RollResult;
  if (state.rolled < SCRIPTED_ROLLS.length) {
    res = { ...SCRIPTED_ROLLS[state.rolled] };
  } else {
    const pity = state.pity >= PITY;
    const type = PIECE_TYPES[rng.weighted(PIECE_TYPES.map((t) => ROLL_TYPE_ODDS[t]))];
    const level = rng.weighted(pity ? TOP_ODDS : ROLL_CLASS_ODDS[leagueOf(state.trophies)]) + 1;
    res = { type, level, pity };
  }
  state.rolls -= 1;
  state.rolled += 1;
  state.pity = res.level >= 5 ? 0 : state.pity + 1;
  return res;
}
