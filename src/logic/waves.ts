import { ENEMY, MAX_LEVEL, MAX_RUNG, PET_TYPES, WAVES, WEAPON_TYPES, armyPower, isBossWave, petAt, recommendedPower, rungOf, squadPower, tierOf } from '../data';
import { hashSeed, makeRng, type Rng } from '../rng';
import type { ArmySpec, PetType, SaveState, SquadSpec, WeaponType } from '../types';

/*
 * Stages and waves, like Bunny Brigade: STAGE n has WAVES waves, the last one a boss wave. A wave's enemy army is
 * built from the stage and wave (and the save's seed, for variety): its POWER is recommendedPower(stage, wave) x
 * ENEMY.share, spread over about waveFighters(stage, wave) fighters, so it rises steadily: Sprouts early, higher
 * rungs, better kits and more fighters later, and on the boss wave a giant of a rung above the escort. The same
 * stage, wave and seed always give the same army, so a lost wave is retried against the same army.
 */

/** About how many fighters a wave sends (on the boss wave: the escort, the boss comes on top). */
export function waveFighters(stage: number, wave: number): number {
  const w = Math.max(1, Math.min(WAVES, wave));
  const n = ENEMY.base + ENEMY.perWave * (w - 1) + ENEMY.perStage * (Math.max(1, stage) - 1);
  const normal = Math.min(ENEMY.max, Math.max(1, Math.round(n)));
  return isBossWave(w) ? Math.max(0, Math.round(normal * ENEMY.escort)) : normal;
}

// ------------------------------------------------------------------ the squads a wave can field

interface Option {
  spec: SquadSpec;
  /** power of one fighter of it */
  pf: number;
  /** how likely a wave is to field it among options of about the same power */
  weight: number;
}

const clampLv = (n: number) => Math.max(1, Math.min(MAX_LEVEL, n));
const tables = new Map<string, Option[]>();

/** What an army may be built from: its top rung, the weapons its units may carry, whether its one squad is a boss. */
interface Limits {
  minRung?: number;
  maxRung?: number;
  weapons?: readonly WeaponType[];
}

/** Every kit of a unit around its rung's natural tier t (a weapon at t - 1..t + 1 or none, each gear none or t - 1..t + 1), by power. */
function options(pet: PetType, boss: boolean, weapons: readonly WeaponType[] = WEAPON_TYPES): Option[] {
  const key = `${pet}${boss ? '!' : ''}${weapons.join()}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const t = tierOf(rungOf(pet));
  const near = [...new Set([t - 1, t, t + 1].map(clampLv))];
  const gearLv = [0, ...near];
  const list: Option[] = [];
  for (const weapon of [null, ...weapons] as (WeaponType | null)[]) {
    for (const weaponLevel of weapon ? near : [0]) {
      for (const helmet of gearLv)
        for (const sneakers of gearLv)
          for (const chili of gearLv) {
            const spec: SquadSpec = { key: 0, pet, count: 1, weapon, weaponLevel, helmet, sneakers, chili };
            if (boss) spec.boss = true;
            const gear = (helmet ? 1 : 0) + (sneakers ? 1 : 0) + (chili ? 1 : 0);
            list.push({ spec, pf: squadPower(spec), weight: (weapon ? 1 : 0.2) * 0.6 ** gear });
          }
    }
  }
  list.sort((a, b) => a.pf - b.pf);
  tables.set(key, list);
  return list;
}
const lowest = (pet: PetType, boss = false, w?: readonly WeaponType[]) => options(pet, boss, w)[0].pf;
const highest = (pet: PetType, boss = false, w?: readonly WeaponType[]) => options(pet, boss, w)[options(pet, boss, w).length - 1].pf;
/** the power of a fighter with its rung's natural kit (a knife, helmet and chili of its natural tier) */
const natural = (pet: PetType, boss = false) => {
  const t = tierOf(rungOf(pet));
  return squadPower({ key: 0, pet, count: 1, weapon: 'knife', weaponLevel: t, helmet: t, sneakers: 0, chili: t, boss });
};

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

/** The rung whose natural kit is closest to pf (in log), moved by jitter rungs; the lowest rung that can carry pf at least. */
function rungFor(pf: number, jitter: number, boss = false): number {
  let best = 1;
  let bd = Infinity;
  for (let r = 1; r <= MAX_RUNG; r++) {
    const d = Math.abs(Math.log2(pf / natural(petAt(r)!, boss)) - jitter);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  // a rung that cannot reach pf even with its best kit steps up; one that is too strong bare steps down
  while (best < MAX_RUNG && highest(petAt(best)!, boss) < pf * 0.97) best++;
  while (best > 1 && lowest(petAt(best)!, boss) > pf * 1.03) best--;
  return best;
}

/** A squad of `count` fighters of about pf power each, of this unit (stepping to a neighbour when it cannot reach). */
function pickSquad(pet: PetType, count: number, pf: number, rng: Rng, boss = false, lim: Limits = {}): SquadSpec {
  const top = Math.min(MAX_RUNG, lim.maxRung ?? MAX_RUNG);
  let r = Math.min(top, rungOf(pet));
  while (r < top && highest(petAt(r)!, boss, lim.weapons) < pf * 0.97) r++;
  while (r > Math.max(1, lim.minRung ?? 1) && lowest(petAt(r)!, boss, lim.weapons) > pf * 1.03) r--;
  const list = options(petAt(r)!, boss, lim.weapons);
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

/** The squad sizes (1, 2 or 4 each) of `fighters` fighters, in one of a few styles, at most maxSquads squads. */
function splitCounts(fighters: number, rng: Rng, maxSquads: number): number[] {
  const style = rng.pick([[5, 3, 1], [2, 3, 2], [1, 2, 3]] as const); // big squads, even, many small ones
  const counts: number[] = [];
  let left = fighters;
  while (left > 0) {
    const fit = [4, 2, 1].filter((k) => k <= left);
    const tight = counts.length + Math.ceil(left / 4) >= maxSquads;
    const k = tight ? fit[0] : fit[rng.weighted(fit.map((x) => style[[4, 2, 1].indexOf(x)]))];
    counts.push(k);
    left -= k;
  }
  return counts.sort((a, b) => b - a);
}

/**
 * An army of `fighters` fighters (squads of 1, 2 and 4) of about `target` POWER, from the cast: each squad's rung is
 * the one whose natural kit fits its share of the power (jittered half a rung either way, so an army mixes
 * neighbouring rungs), then a few passes tune the kits until the total is within ENEMY.tolerance. Fewer fighters
 * when even bare Sprouts would be too strong; more when Boulders could not carry it. Exported for the balance tool.
 */
export function buildArmy(target: number, fighters: number, rng: Rng, maxSquads = ENEMY.maxSquads, lim: Limits = {}): SquadSpec[] {
  const minPf = lowest('sprout');
  const maxPf = highest('boulder');
  let n = Math.max(1, Math.round(fighters));
  if (target / n < minPf) n = Math.max(1, Math.floor(target / minPf));
  if (target / n > maxPf) n = Math.ceil(target / maxPf);
  let best: SquadSpec[] = [];
  let bestErr = Infinity;
  for (let attempt = 0; attempt < 12 && bestErr > target * ENEMY.tolerance * 0.5; attempt++) {
    const counts = splitCounts(n, rng, maxSquads);
    const weights = counts.map((c) => c * rng.range(0.7, 1.3));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const squads = counts.map((c, i) => {
      const pf = (target * weights[i]) / wsum / c;
      return pickSquad(petAt(rungFor(pf, rng.range(-0.5, 0.5)))!, c, pf, rng, false, lim);
    });
    const power = squads.map(squadPower);
    for (let pass = 0; pass < 4; pass++) {
      let total = power.reduce((a, b) => a + b, 0);
      if (Math.abs(total - target) <= target * ENEMY.tolerance * 0.5) break;
      const order = squads.map((_, i) => i);
      for (let k = order.length - 1; k > 0; k--) {
        const j = rng.int(0, k);
        [order[k], order[j]] = [order[j], order[k]];
      }
      for (const i of order) {
        const others = total - power[i];
        const want = (target - others) / squads[i].count;
        if (want <= 0) continue;
        squads[i] = pickSquad(squads[i].pet, squads[i].count, want, rng, false, lim);
        power[i] = squadPower(squads[i]);
        total = others + power[i];
        if (Math.abs(total - target) <= target * ENEMY.tolerance * 0.5) break;
      }
    }
    const err = Math.abs(power.reduce((a, b) => a + b, 0) - target);
    if (err < bestErr) {
      best = squads;
      bestErr = err;
    }
  }
  return best;
}

/** What START WAVE fights: the enemy army of a wave and its numbers. */
export interface WaveInfo {
  stage: number;
  wave: number;
  /** wave 10: the army has a boss */
  boss: boolean;
  army: ArmySpec;
  /** the army's POWER (armyPower of its squads) */
  power: number;
  /** the POWER this wave is comfortable at (on the START WAVE button) */
  recommended: number;
  /** fighters in the army, the boss included */
  fighters: number;
}

/**
 * The enemy army of a wave: recommendedPower(stage, wave) x ENEMY.share of POWER over about waveFighters(stage,
 * wave) fighters (low rungs early, higher rungs and more fighters later). On the boss wave (wave 10) one squad is a
 * boss: a giant of a rung above the escort's top rung (squad 0, SquadSpec.boss), worth about ENEMY.bossPart of the
 * POWER; which unit it is depends only on the stage. tries = losses in a row on this wave: each makes the army
 * ENEMY.mercy weaker (at most ENEMY.mercyMax times) and rolls it anew. The same stage, wave, seed and tries always
 * give the same army.
 */
export function enemyArmy(stage: number, wave: number, seed: number, tries = 0): ArmySpec {
  const t = Math.max(0, Math.floor(tries));
  const rng = makeRng(hashSeed(seed, stage, wave, t, 0x5eed));
  const boss = isBossWave(wave);
  const mercy = 1 - ENEMY.mercy * Math.min(ENEMY.mercyMax, t);
  const full = recommendedPower(stage, wave) * (boss ? ENEMY.bossShare : ENEMY.share);
  const target = full * mercy;
  const n = waveFighters(stage, wave);
  const lim: Limits = stage <= 1 && wave <= ENEMY.gentle ? { weapons: ['knife'] } : {};
  if (!boss) return { squads: buildArmy(target, n, rng, ENEMY.maxSquads, lim) };
  // the boss first: a rung above where the escort's fighters would stand, carrying about bossPart of the power
  // (its unit comes from the full wave, so mercy softens its kit but never changes who it is)
  const part = n > 0 ? ENEMY.bossPart : 1;
  const top = rungFor(n > 0 ? (full * (1 - ENEMY.bossPart)) / n : full, 0);
  let rung = Math.min(MAX_RUNG, Math.max(top + 1, rungFor(full * part, 0, true)));
  // never much more than the whole wave: a rung lower while even its weakest kit is too strong
  while (rung > 1 && lowest(petAt(rung)!, true) > full * 1.1) rung--;
  const want = target * part;
  const big = pickSquad(petAt(rung)!, 1, want, rng, true, { minRung: rung, maxRung: rung });
  const rest = target - squadPower(big);
  // the escort stands at least a rung below its boss
  const escort = n > 0 && rest > lowest('sprout') * 0.9 ? buildArmy(rest, n, rng, ENEMY.maxSquads - 1, { maxRung: Math.max(1, rungOf(big.pet) - 1) }) : [];
  return { squads: [big, ...escort] };
}

/** The player's next wave (their stage, wave and tries, their save's seed): what START WAVE fights. */
export function nextWave(state: Pick<SaveState, 'stage' | 'wave' | 'seed' | 'tries'>): WaveInfo {
  return waveInfo(state.stage, state.wave, state.seed, state.tries);
}

export function waveInfo(stage: number, wave: number, seed: number, tries = 0): WaveInfo {
  const army = enemyArmy(stage, wave, seed, tries);
  return {
    stage, wave, boss: isBossWave(wave), army, power: armyPower(army.squads), recommended: recommendedPower(stage, wave),
    fighters: army.squads.reduce((a, s) => a + s.count, 0),
  };
}

/** The seed of the next fight: a retry of the same wave plays a new fight against the same army. */
export const fightSeed = (state: Pick<SaveState, 'seed' | 'stage' | 'wave' | 'fights'>) => hashSeed(state.seed, state.stage, state.wave, state.fights, 0xf1);

/** The unit a stage's boss is (for the WAVE bar's boss head): the boss of that stage's wave 10. */
export const stageBoss = (stage: number, seed: number): PetType => enemyArmy(stage, WAVES, seed).squads.find((s) => s.boss)?.pet ?? PET_TYPES[0];
