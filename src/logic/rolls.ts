import {
  ECON, MAX_RUNG, PITY, PITY_PET, ROLL_KINDS, ROLL_KIND_ODDS, SCRIPTED_ROLLS, TOP_ODDS,
  classOdds, homeRung, isPet, petAt, petOdds, pityRung, rungOf,
} from '../data';
import { hashSeed, makeRng, type Rng } from '../rng';
import type { CaseKind, PetType, PieceType, RollResult, SaveState } from '../types';
import { Inventory, isOwned } from './inventory';

/*
 * The cases, like Bunny Brigade's: CASE costs cash (its price climbs a little with every CASE opened), ELITE costs
 * gems (never an E-class item, and its units sit ELITE_RUNG rungs higher). The odds improve with the player level. One
 * shared pity counter: the case after PITY in a row without an A-class item or a top unit is guaranteed one.
 */

/** What the next case of this kind costs: cash for a CASE, gems for an ELITE. */
export function casePrice(state: Pick<SaveState, 'cases'>, kind: CaseKind): number {
  return kind === 'elite' ? ECON.eliteCost : ECON.caseCost + Math.floor(ECON.caseStep * state.cases);
}

/** Why this case cannot be opened now ('Not enough cash', 'Not enough gems', 'The tray is full'), or null when it can. */
export function caseBlock(state: SaveState, kind: CaseKind): string | null {
  const price = casePrice(state, kind);
  if (kind === 'case' && state.cash < price) return 'Not enough cash';
  if (kind === 'elite' && state.gems < price) return 'Not enough gems';
  if (new Inventory(state).freeBenchSlot() < 0) return 'The tray is full';
  return null;
}

/** The odds of a case at the player's level, for an odds panel: kinds (% by ROLL_KINDS), item classes E..SSS, unit rungs 1..12. */
export function caseOdds(state: Pick<SaveState, 'level'>, kind: CaseKind): { kinds: number[]; classes: number[]; rungs: number[] } {
  const elite = kind === 'elite';
  return {
    kinds: ROLL_KINDS.map((k) => ROLL_KIND_ODDS[k]),
    classes: classOdds(state.level, elite),
    rungs: petOdds(homeRung(state.level, elite), elite),
  };
}

/** The roll of a case, without paying or adding anything (state is only read). */
export function rollPiece(state: Pick<SaveState, 'level' | 'pity' | 'cases'>, kind: CaseKind, rng: Rng): { type: PieceType; level: number; pity: boolean } {
  if (kind === 'case' && state.cases < SCRIPTED_ROLLS.length) return { ...SCRIPTED_ROLLS[state.cases], pity: false };
  const elite = kind === 'elite';
  const home = homeRung(state.level, elite);
  const pity = state.pity >= PITY;
  const k = ROLL_KINDS[rng.weighted(ROLL_KINDS.map((x) => ROLL_KIND_ODDS[x]))];
  if (k === 'pet') {
    const rung = pity
      ? Math.min(MAX_RUNG, Math.ceil(home) + PITY_PET.above[rng.weighted(PITY_PET.odds)])
      : rng.weighted(petOdds(home, elite)) + 1;
    return { type: petAt(rung)!, level: 1, pity };
  }
  return { type: k, level: rng.weighted(pity ? TOP_ODDS : classOdds(state.level, elite)) + 1, pity };
}

/**
 * Opens a case: pays for it, rolls it (the first CASEs are the guide's scripted ones), puts the piece on the first
 * free tray slot and returns what it gave. Null when it cannot be opened (see caseBlock). The roll is seeded by the
 * save (its seed and the cases opened so far) unless an rng is given. The pity counter resets on an A-class item or
 * better, or on a unit of pityRung or higher, however it came.
 */
export function openCase(state: SaveState, kind: CaseKind, rng?: Rng): RollResult | null {
  if (caseBlock(state, kind)) return null;
  const price = casePrice(state, kind);
  const r = rollPiece(state, kind, rng ?? makeRng(hashSeed(state.seed, state.rolled, kind === 'elite' ? 2 : 1)));
  if (kind === 'case') {
    state.cash -= price;
    state.cases += 1;
  } else {
    state.gems -= price;
    state.elites += 1;
  }
  state.rolled += 1;
  const pet = isPet(r.type);
  const rung = pet ? rungOf(r.type as PetType) : 0;
  const top = pet ? rung >= pityRung(homeRung(state.level, kind === 'elite')) : r.level >= 5;
  state.pity = top ? 0 : state.pity + 1;
  const fresh = pet && !isOwned(state, r.type as PetType);
  const piece = new Inventory(state).add(r.type, r.level)!;
  return { case: kind, type: r.type, level: pet ? 1 : r.level, rung, pity: r.pity, fresh, price, piece };
}
