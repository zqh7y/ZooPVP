import {
  ANT_SEASON, MAX_RUNG, PET_HOME, PITY, PITY_PET, ROLL_CLASS_ODDS, ROLL_KINDS, ROLL_KIND_ODDS, SCRIPTED_ROLLS, TOP_ODDS,
  isPet, leagueOf, petAt, petOdds, pityRung, rungOf,
} from '../data';
import type { RollResult, SaveState } from '../types';
import type { Rng } from '../rng';
import { seenPet } from './inventory';

/** The % chance of each class E..SSS of a weapon or gear roll, for this player's league. */
export function classOdds(state: SaveState): number[] {
  return [...ROLL_CLASS_ODDS[leagueOf(state.trophies)]];
}

/**
 * Ant season: while the player has never evolved and has played fewer than ANT_SEASON matches, every normal pet
 * roll is an ant (so the first evolve comes around match 6). Pity rolls are not affected.
 */
export const antSeason = (state: Pick<SaveState, 'evolves' | 'matches'>) => state.evolves === 0 && state.matches < ANT_SEASON;

/** The % chance of each rung 1..12 on a pet roll for this player (index rung - 1), ant season included. */
export function petOddsFor(state: SaveState): number[] {
  if (antSeason(state)) return Array.from({ length: MAX_RUNG }, (_, i) => (i === 0 ? 100 : 0));
  return petOdds(leagueOf(state.trophies));
}

/** Rolls the player can open now: rolls waiting plus trophy-road pets waiting (gifts spend no roll). */
export const rollsWaiting = (state: Pick<SaveState, 'rolls' | 'gifts'>) => state.rolls + state.gifts.length;

/**
 * Opens one roll and returns what it gave (the caller adds the piece). Order: the scripted first rolls, then the
 * trophy-road gifts waiting (a gift spends no roll and leaves pity and rolled alone), then the pity roll, then the
 * league's odds. A roll picks its kind by ROLL_KIND_ODDS first; an item then picks its class by the league's
 * ROLL_CLASS_ODDS (TOP_ODDS on a pity roll), a pet its rung by petOdds (ant season: always an ant; a pity pet is
 * 2, 3 or 4 rungs above the league's home). The pity counter resets on an A-class item or better, or on a pet of
 * pityRung or higher, however it came. fresh: a pet the player has never owned. Null when nothing is waiting.
 */
export function rollOnce(state: SaveState, rng: Rng): RollResult | null {
  let res: RollResult;
  const league = leagueOf(state.trophies);
  if (state.rolls > 0 && state.rolled < SCRIPTED_ROLLS.length) {
    res = { ...SCRIPTED_ROLLS[state.rolled] };
  } else if (state.gifts.length > 0) {
    const type = state.gifts.shift()!;
    return { type, level: 1, pity: false, gift: true, fresh: !seenPet(state, type) };
  } else if (state.rolls <= 0) {
    return null;
  } else {
    const pity = state.pity >= PITY;
    const kind = ROLL_KINDS[rng.weighted(ROLL_KINDS.map((k) => ROLL_KIND_ODDS[k]))];
    if (kind === 'pet') {
      let rung: number;
      if (pity) {
        const home = Math.ceil(PET_HOME[league]);
        rung = Math.min(MAX_RUNG, home + PITY_PET.above[rng.weighted(PITY_PET.odds)]);
      } else if (antSeason(state)) {
        rung = 1;
      } else {
        rung = rng.weighted(petOdds(league)) + 1;
      }
      res = { type: petAt(rung)!, level: 1, pity };
    } else {
      res = { type: kind, level: rng.weighted(pity ? TOP_ODDS : ROLL_CLASS_ODDS[league]) + 1, pity };
    }
  }
  state.rolls -= 1;
  state.rolled += 1;
  const top = isPet(res.type) ? rungOf(res.type) >= pityRung(league) : res.level >= 5;
  state.pity = top ? 0 : state.pity + 1;
  if (isPet(res.type)) res.fresh = !seenPet(state, res.type);
  return res;
}
