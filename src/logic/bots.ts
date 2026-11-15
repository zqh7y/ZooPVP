import { BOT, MAX_LEVEL, PET_TYPES, WEAPON_TYPES, armyPower, squadPower } from '../data';
import type { Opponent, PetType, SaveState, SquadSpec, WeaponType } from '../types';
import type { Rng } from '../rng';
import { Inventory } from './inventory';

/*
 * The opponent is always a bot, and it is built against the player's own army: about as many fighters
 * (+- BOT.countSpread) and the player's army power x a difficulty factor (see botFactor), within BOT.tolerance.
 * Its squads follow the player's rules (pets of count 1, 2 or 4, one weapon and up to one gear of each kind)
 * and vary from bot to bot: ant swarms, frog walls, mixed crews, big squads or many small ones.
 */

const ADJ = ['Swift', 'Lazy', 'Salty', 'Neon', 'Turbo', 'Sneaky', 'Mighty', 'Fuzzy', 'Cosmic', 'Grumpy', 'Lucky', 'Rapid', 'Silent', 'Wild', 'Cheesy', 'Frosty', 'Dizzy', 'Jolly', 'Brave', 'Pixel', 'Atomic', 'Crispy', 'Spicy', 'Hyper', 'Mellow', 'Rusty', 'Shiny', 'Tiny', 'Giga', 'Funky'];
const NOUN = ['Ninja', 'Wizard', 'Pirate', 'Walrus', 'Toast', 'Falcon', 'Pickle', 'Gamer', 'Robot', 'Badger', 'Noodle', 'Tiger', 'Comet', 'Waffle', 'Hunter', 'Panda', 'Rocket', 'Muffin', 'Viking', 'Goblin', 'Otter', 'Cactus', 'Bandit', 'Captain', 'Racer', 'Mango', 'Yeti', 'Pilot', 'Knight', 'Moose'];
const TAIL = ['', '', 'x', 'xx', 'YT', '_pro', 'HD', 'TV'];

function makeName(rng: Rng): string {
  const num = rng.chance(0.6) ? String(rng.int(1, 999)) : '';
  return rng.pick(ADJ) + rng.pick(NOUN) + num + rng.pick(TAIL);
}

const clampLv = (n: number) => Math.max(1, Math.min(MAX_LEVEL, n));

/** The difficulty: the bot's army power is the player's x this (before the random spread). */
export function botFactor(state: Pick<SaveState, 'matches' | 'trophies' | 'streak'>): number {
  let f = state.matches < BOT.firstMatches.length
    ? BOT.firstMatches[Math.max(0, state.matches)]
    : BOT.easy + (BOT.hard - BOT.easy) * Math.min(1, Math.max(0, state.trophies) / BOT.hardAt);
  if (state.streak <= -2) f *= BOT.mercy;
  if (state.streak >= 3) f *= BOT.heat;
  return f;
}

// ------------------------------------------------------------------ the squads a bot can field

interface Option {
  spec: SquadSpec;
  /** power of one fighter of it */
  pf: number;
  /** how likely a bot is to field it among options of the same power */
  weight: number;
}

let table: Record<PetType, Option[]> | null = null;

/** Every natural kit for every pet and class (weapon and gear within a class of the pet), by power. */
function options(): Record<PetType, Option[]> {
  if (table) return table;
  const out = {} as Record<PetType, Option[]>;
  for (const pet of PET_TYPES) {
    const list: Option[] = [];
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const near = [...new Set([level - 1, level, level + 1].map(clampLv))];
      const gearLv = [0, ...near];
      for (const weapon of [null, ...WEAPON_TYPES] as (WeaponType | null)[]) {
        for (const weaponLevel of weapon ? near : [0]) {
          for (const helmet of gearLv)
            for (const sneakers of gearLv)
              for (const chili of gearLv) {
                const spec: SquadSpec = { key: 0, pet, level, count: 1, weapon, weaponLevel, helmet, sneakers, chili };
                const gear = (helmet ? 1 : 0) + (sneakers ? 1 : 0) + (chili ? 1 : 0);
                list.push({ spec, pf: squadPower(spec), weight: (weapon ? 1 : 0.2) * 0.6 ** gear });
              }
        }
      }
    }
    list.sort((a, b) => a.pf - b.pf);
    out[pet] = list;
  }
  table = out;
  return out;
}

const lowest = (pet: PetType) => options()[pet][0].pf;
const highest = (pet: PetType) => options()[pet][options()[pet].length - 1].pf;

/**
 * A squad of `count` fighters whose fighters have about `pf` power each, of the wanted pet when it can
 * (and with the wanted weapon when one is given and it can).
 */
function pickSquad(pet: PetType, count: number, pf: number, rng: Rng, weapon?: WeaponType | null): SquadSpec {
  const other: PetType = pet === 'ant' ? 'frog' : 'ant';
  if (pf < lowest(pet) * 0.97 && lowest(other) < lowest(pet)) pet = other;
  else if (pf > highest(pet) * 1.03 && highest(other) > highest(pet)) pet = other;
  let list = options()[pet];
  if (weapon !== undefined) {
    const only = list.filter((o) => o.spec.weapon === weapon);
    if (only.length) list = only;
  }
  const lo = lowerBound(list, pf * 0.97);
  const hi = lowerBound(list, pf * 1.03);
  let chosen: Option;
  if (hi > lo) {
    const pool = list.slice(lo, hi);
    chosen = pool[rng.weighted(pool.map((o) => o.weight))];
  } else {
    const i = Math.min(list.length - 1, lo);
    const j = Math.max(0, lo - 1);
    chosen = Math.abs(list[i].pf - pf) <= Math.abs(list[j].pf - pf) ? list[i] : list[j];
  }
  return { ...chosen.spec, count };
}

function lowerBound(list: readonly Option[], v: number): number {
  let a = 0;
  let b = list.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (list[m].pf < v) a = m + 1;
    else b = m;
  }
  return a;
}

/** The squad sizes (1, 2 or 4 each) of `fighters` fighters, in one of a few styles. */
function splitCounts(fighters: number, rng: Rng): number[] {
  const style = rng.pick([[5, 3, 1], [2, 3, 2], [1, 2, 3]] as const); // big squads, even, many small ones
  const counts: number[] = [];
  let left = fighters;
  while (left > 0) {
    const fit = [4, 2, 1].filter((k) => k <= left);
    // never more than BOT.maxSquads squads: the bot's grid is the player's 5 x 5 too
    const tight = counts.length + Math.ceil(left / 4) >= BOT.maxSquads;
    const k = tight ? fit[0] : fit[rng.weighted(fit.map((x) => style[[4, 2, 1].indexOf(x)]))];
    counts.push(k);
    left -= k;
  }
  return counts.sort((a, b) => b - a);
}

/**
 * One try at an army of exactly these fighters near the target power. Against a small army (up to
 * BOT.mirrorUpTo fighters) the bot fields the same kinds of pets, and in a one-on-one the same weapon, so
 * early fights are fair duels (its power can then miss the target by more than BOT.tolerance).
 */
function buildArmy(target: number, fighters: number, rng: Rng, kinds: readonly Kind[]): SquadSpec[] {
  const counts = splitCounts(fighters, rng);
  const antShare = rng.pick([0.85, 0.5, 0.15, 0.65, 0.35]); // ant swarm .. frog wall
  const mirror = kinds.length > 0 && kinds.length <= BOT.mirrorUpTo && fighters <= BOT.mirrorUpTo;
  const pets: PetType[] = counts.map((_, i) => (mirror ? kinds[i % kinds.length].pet : rng.chance(antShare) ? 'ant' : 'frog'));
  // the weapons too in a one-on-one, so the first duel is the same fight on both sides
  const arms = counts.map((_, i) => (mirror && fighters === 1 ? kinds[i % kinds.length].weapon : undefined));
  const weights = counts.map((c) => c * rng.range(0.65, 1.35));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const squads = counts.map((c, i) => pickSquad(pets[i], c, (target * weights[i]) / wsum / c, rng, arms[i]));
  const power = squads.map(squadPower);
  for (let pass = 0; pass < 4; pass++) {
    let total = power.reduce((a, b) => a + b, 0);
    if (Math.abs(total - target) <= target * BOT.tolerance * 0.4) break;
    const order = squads.map((_, i) => i);
    for (let k = order.length - 1; k > 0; k--) {
      const j = rng.int(0, k);
      [order[k], order[j]] = [order[j], order[k]];
    }
    for (const i of order) {
      const others = total - power[i];
      const want = (target - others) / squads[i].count;
      if (want <= 0) continue;
      squads[i] = pickSquad(squads[i].pet, squads[i].count, want, rng, arms[i]);
      power[i] = squadPower(squads[i]);
      total = others + power[i];
      if (Math.abs(total - target) <= target * BOT.tolerance * 0.4) break;
    }
  }
  return squads;
}

/** A fighter's pet and weapon, what a bot copies against a small army. */
export type Kind = { pet: PetType; weapon: WeaponType | null };
/** The kind of every fighter of these squads. */
export const kindsOf = (squads: readonly SquadSpec[]): Kind[] =>
  squads.flatMap((s) => Array.from({ length: s.count }, () => ({ pet: s.pet, weapon: s.weapon })));

/** The player's fighters and army power, from the pets on their grid. */
export function playerArmy(state: SaveState): { fighters: number; power: number; squads: SquadSpec[] } {
  const squads = new Inventory(state).squads();
  return { fighters: squads.reduce((a, s) => a + s.count, 0), power: armyPower(squads), squads };
}

/**
 * A bot army against a player army of `fighters` fighters and `power` army power: the power x `factor` x the
 * random spread, about as many fighters (more, weaker ones or fewer, stronger ones only when one fighter
 * cannot carry its share). Never empty.
 */
export function matchArmy(fighters: number, power: number, factor: number, rng: Rng, kinds: readonly Kind[] = []): { squads: SquadSpec[]; target: number } {
  const minPf = Math.min(...PET_TYPES.map(lowest));
  const maxPf = Math.max(...PET_TYPES.map(highest));
  const base = fighters > 0 ? power : minPf;
  const target = Math.max(1, base * factor * rng.range(1 - BOT.spread, 1 + BOT.spread));
  const me = Math.max(1, fighters);
  const lo = Math.max(1, Math.ceil(me * (1 - BOT.countSpread) - 1e-9));
  const hi = Math.max(lo, Math.floor(me * (1 + BOT.countSpread) + 1e-9));
  let n = rng.int(lo, hi);
  if (target / n < minPf) n = Math.max(1, Math.floor(target / minPf));
  if (target / n > maxPf) n = Math.ceil(target / maxPf);
  n = Math.min(n, BOT.maxFighters);
  let best: SquadSpec[] = [];
  let bestErr = Infinity;
  for (let i = 0; i < 24 && bestErr > target * BOT.tolerance * 0.4; i++) {
    const army = buildArmy(target, n, rng, kinds);
    const err = Math.abs(armyPower(army) - target);
    if (err < bestErr) {
      best = army;
      bestErr = err;
    }
  }
  return { squads: best, target };
}

/** The opponent for the next match: a bot matched to the player's own army on the grid (see matchArmy). */
export function makeOpponent(state: SaveState, rng: Rng): Opponent {
  const name = makeName(rng);
  const trophies = Math.max(0, state.trophies + rng.int(-25, 25));
  const me = playerArmy(state);
  const kinds = kindsOf(me.squads);
  const { squads } = matchArmy(me.fighters, me.power, botFactor(state), rng, kinds);
  return { name, trophies, army: { squads }, power: armyPower(squads), seed: rng.int(1, 2147483646) };
}
