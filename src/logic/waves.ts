import { hashSeed, makeRng } from '../rng';
import type { ArmySpec } from '../types';
import { buildArmy, findOpponent } from './match';
import { newSave } from './save';

/*
 * The v4 stages and waves are gone (v5 fights matched bots: ./match.ts). This file only keeps old imports
 * resolving while the screens and dev pages are rewritten. TODO(v5): delete once nothing imports it.
 */
export { buildArmy, findOpponent, fightSeed } from './match';

/**
 * TODO(v5) shim for dev pages: a bot army for a stand-in player of about a v4 stage's POWER (wave 10 = a champion
 * team with a boss). Use findOpponent instead.
 */
export function enemyArmy(stage: number, wave: number, seed: number): ArmySpec {
  const s = Math.max(1, Math.floor(stage));
  const target = 20 * 1.7 ** (s - 1) * 1.06 ** (Math.max(1, Math.floor(wave)) - 1);
  const mine: ArmySpec = { squads: buildArmy(target, 1 + s, makeRng(hashSeed(seed, s, wave))) };
  return findOpponent({ ...newSave(seed), matches: wave >= 10 ? 4 : 10 }, seed, mine).army;
}
