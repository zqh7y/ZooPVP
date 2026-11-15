import {
  BOT_NAMES, CHAMPION, CHAMPION_NAMES, HARD_THEMES, MATCH, MATCH_THEMES, MAX_LEVEL, MAX_RUNG, THEMES, WEAPON_TYPES,
  armyPower, isChampionMatch, petAt, rungOf, squadPower, tierOf,
} from '../data';
import { hashSeed, makeRng, type Rng } from '../rng';
import type { ArmySpec, GearType, Opponent, PetType, SaveState, SquadSpec, ThemeId, WeaponType } from '../types';
import { Inventory } from './inventory';

/*
 * Matchmaking: BATTLE finds a bot built to the player's own army. Its POWER is the player's x difficulty() (gentle
 * for the first fights, easing after losses, a little harder on a win streak), with about the player's fighter
 * count, from the cast near the player's own rungs, shaped by a THEME so fights stay interesting:
 * - mixed: your lineup's shape (the same squad sizes) with neighbouring units (a rung either way) and its own kit
 * - swarm: more, smaller fighters (lower rungs), quick knives
 * - heavy: half as many, bigger fighters (higher rungs), bats and chili
 * - glass: hits hard, falls fast: chili and no helmets, no shields
 * - tanks: shields and helmets, no chili
 * - mirror: your own lineup, unit for unit; only the kit is retuned to its POWER
 * Every CHAMPION.every-th match is a CHAMPION match: a crowned boss (SquadSpec.boss, a rung above its escort) leads a
 * smaller crew, CHAMPION.power x tougher, for CHAMPION.rewards x the rewards (applyMatch).
 * The same save (its seed and match count) and the same army always find the same opponent.
 */

// ------------------------------------------------------------------ the squads an army can field

interface Option {
  spec: SquadSpec;
  /** power of one fighter of it */
  pf: number;
  /** how likely an army is to field it among options of about the same power */
  weight: number;
}

/** What an army may be built from: its rungs, the weapons its units may carry, the gear it never / rather wears. */
export interface Limits {
  minRung?: number;
  maxRung?: number;
  weapons?: readonly WeaponType[];
  /** no weapon at all is allowed too (default true) */
  bare?: boolean;
  noGear?: readonly GearType[];
  favour?: readonly (GearType | WeaponType)[];
}

const clampLv = (n: number) => Math.max(1, Math.min(MAX_LEVEL, n));
const tables = new Map<string, Option[]>();

/** Every kit of a unit around its rung's natural tier t (a weapon at t - 1..t + 1 or none, each gear none or t - 1..t + 1), by power. */
function options(pet: PetType, boss: boolean, lim: Limits = {}): Option[] {
  const weapons = lim.weapons ?? WEAPON_TYPES;
  const bare = lim.bare ?? true;
  const no = lim.noGear ?? [];
  const fav = lim.favour ?? [];
  const key = `${pet}${boss ? '!' : ''}|${weapons.join()}|${bare}|${no.join()}|${fav.join()}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const t = tierOf(rungOf(pet));
  const near = [...new Set([t - 1, t, t + 1].map(clampLv))];
  const gearLv = (g: GearType) => (no.includes(g) ? [0] : [0, ...near]);
  const list: Option[] = [];
  const kits = [...(bare || weapons.length === 0 ? [null] : []), ...weapons] as (WeaponType | null)[];
  for (const weapon of kits) {
    for (const weaponLevel of weapon ? near : [0]) {
      for (const helmet of gearLv('helmet'))
        for (const sneakers of gearLv('sneakers'))
          for (const chili of gearLv('chili')) {
            const spec: SquadSpec = { key: 0, pet, count: 1, weapon, weaponLevel, helmet, sneakers, chili };
            if (boss) spec.boss = true;
            const gear = (helmet ? 1 : 0) + (sneakers ? 1 : 0) + (chili ? 1 : 0);
            let weight = (weapon ? 1 : 0.2) * 0.6 ** gear;
            if (weapon && fav.includes(weapon)) weight *= 4;
            for (const g of ['helmet', 'sneakers', 'chili'] as const) if (spec[g] > 0 && fav.includes(g)) weight *= 4 / 0.6;
            list.push({ spec, pf: squadPower(spec), weight });
          }
    }
  }
  list.sort((a, b) => a.pf - b.pf);
  tables.set(key, list);
  return list;
}
const lowest = (pet: PetType, boss = false, lim?: Limits) => options(pet, boss, lim)[0].pf;
const highest = (pet: PetType, boss = false, lim?: Limits) => {
  const o = options(pet, boss, lim);
  return o[o.length - 1].pf;
};
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
function rungFor(pf: number, jitter: number, boss = false, lim: Limits = {}): number {
  let best = 1;
  let bd = Infinity;
  for (let r = Math.max(1, lim.minRung ?? 1); r <= Math.min(MAX_RUNG, lim.maxRung ?? MAX_RUNG); r++) {
    const d = Math.abs(Math.log2(pf / natural(petAt(r)!, boss)) - jitter);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  // a rung that cannot reach pf even with its best kit steps up; one that is too strong bare steps down
  while (best < Math.min(MAX_RUNG, lim.maxRung ?? MAX_RUNG) && highest(petAt(best)!, boss, lim) < pf * 0.97) best++;
  while (best > Math.max(1, lim.minRung ?? 1) && lowest(petAt(best)!, boss, lim) > pf * 1.03) best--;
  return best;
}

/** A squad of `count` fighters of about pf power each, of this unit (stepping to a neighbour when it cannot reach). */
function pickSquad(pet: PetType, count: number, pf: number, rng: Rng, boss = false, lim: Limits = {}): SquadSpec {
  const top = Math.min(MAX_RUNG, lim.maxRung ?? MAX_RUNG);
  let r = Math.min(top, rungOf(pet));
  while (r < top && highest(petAt(r)!, boss, lim) < pf * 0.97) r++;
  while (r > Math.max(1, lim.minRung ?? 1) && lowest(petAt(r)!, boss, lim) > pf * 1.03) r--;
  const list = options(petAt(r)!, boss, lim);
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

/** The fewest squads of 4, 2 and 1 that hold n fighters. */
const fewest = (n: number) => Math.floor(n / 4) + [0, 1, 1, 2][n % 4];

/** The squad sizes (1, 2 or 4 each) of `fighters` fighters, in one of a few styles, at most maxSquads squads (when they fit). */
function splitCounts(fighters: number, rng: Rng, maxSquads: number, style?: readonly [number, number, number]): number[] {
  const st = style ?? rng.pick([[5, 3, 1], [2, 3, 2], [1, 2, 3]] as const); // big squads, even, many small ones
  const counts: number[] = [];
  let left = fighters;
  while (left > 0) {
    const all = [4, 2, 1].filter((k) => k <= left);
    // only sizes that still leave room for the rest within maxSquads (else the biggest)
    const ok = all.filter((k) => counts.length + 1 + fewest(left - k) <= maxSquads);
    const fit = ok.length ? ok : [all[0]];
    const k = fit[rng.weighted(fit.map((x) => st[[4, 2, 1].indexOf(x)]))];
    counts.push(k);
    left -= k;
  }
  return counts.sort((a, b) => b - a);
}

const near = (total: number, target: number, tol: number) => Math.abs(total - target) <= target * tol;

/** A few passes that retune each squad's kit (on its own unit, or a neighbour when it cannot reach) toward the target total. */
function tune(squads: SquadSpec[], target: number, rng: Rng, lim: Limits, keepPet = false): void {
  const power = squads.map(squadPower);
  for (let pass = 0; pass < 4; pass++) {
    let total = power.reduce((a, b) => a + b, 0);
    if (near(total, target, MATCH.tolerance * 0.5)) return;
    const order = squads.map((_, i) => i);
    for (let k = order.length - 1; k > 0; k--) {
      const j = rng.int(0, k);
      [order[k], order[j]] = [order[j], order[k]];
    }
    for (const i of order) {
      if (squads[i].boss) continue;
      const others = total - power[i];
      const want = (target - others) / squads[i].count;
      if (want <= 0) continue;
      const r = rungOf(squads[i].pet);
      const l = keepPet ? { ...lim, minRung: r, maxRung: r } : lim;
      squads[i] = { ...pickSquad(squads[i].pet, squads[i].count, want, rng, false, l), key: squads[i].key };
      power[i] = squadPower(squads[i]);
      total = others + power[i];
      if (near(total, target, MATCH.tolerance * 0.5)) return;
    }
  }
}

/**
 * An army of `fighters` fighters (squads of 1, 2 and 4) of about `target` POWER, from the cast: each squad's rung is
 * the one whose natural kit fits its share of the power (jittered half a rung either way, so an army mixes
 * neighbouring rungs), then a few passes tune the kits until the total is within MATCH.tolerance. Fewer fighters
 * when even bare Chicks would be too strong; more when Oaks could not carry it. Exported for the balance tool.
 */
export function buildArmy(target: number, fighters: number, rng: Rng, maxSquads = MATCH.maxSquads, lim: Limits = {}, style?: readonly [number, number, number]): SquadSpec[] {
  const minPf = lowest(petAt(Math.max(1, lim.minRung ?? 1))!, false, lim);
  const maxPf = highest(petAt(Math.min(MAX_RUNG, lim.maxRung ?? MAX_RUNG))!, false, lim);
  let n = Math.max(1, Math.round(fighters));
  if (target / n < minPf) n = Math.max(1, Math.floor(target / minPf));
  if (target / n > maxPf) n = Math.ceil(target / maxPf);
  n = Math.min(n, Math.max(MATCH.maxFighters, Math.ceil(target / maxPf)));
  let best: SquadSpec[] = [];
  let bestErr = Infinity;
  for (let attempt = 0; attempt < 12 && bestErr > target * MATCH.tolerance * 0.5; attempt++) {
    const counts = splitCounts(n, rng, maxSquads, style);
    const weights = counts.map((c) => c * rng.range(0.7, 1.3));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const squads = counts.map((c, i) => {
      const pf = (target * weights[i]) / wsum / c;
      return pickSquad(petAt(rungFor(pf, rng.range(-0.5, 0.5), false, lim))!, c, pf, rng, false, lim);
    });
    tune(squads, target, rng, lim);
    const err = Math.abs(squads.reduce((a, q) => a + squadPower(q), 0) - target);
    if (err < bestErr) {
      best = squads;
      bestErr = err;
    }
  }
  return best;
}

/**
 * The 'mixed' army: the shape of the player's lineup (the same squad sizes, at most maxSquads of them), each squad a
 * unit a rung either side of the player's squad it echoes, with its share of the target POWER; then tuned.
 */
function shadowArmy(mine: readonly SquadSpec[], target: number, rng: Rng, lim: Limits): SquadSpec[] {
  const total = mine.reduce((a, q) => a + squadPower(q), 0);
  if (mine.length === 0 || mine.length > MATCH.maxSquads || total <= 0) return buildArmy(target, fightersOf(mine), rng, MATCH.maxSquads, lim);
  let best: SquadSpec[] = [];
  let bestErr = Infinity;
  for (let attempt = 0; attempt < 8 && bestErr > target * MATCH.tolerance * 0.5; attempt++) {
    const squads = mine.map((q) => {
      const share = (squadPower(q) / total) * target * rng.range(0.85, 1.15);
      const pf = share / q.count;
      const jitter = rng.pick([-1, 0, 0, 1]);
      const r = Math.max(1, Math.min(MAX_RUNG, rungOf(q.pet) + jitter));
      return pickSquad(petAt(r)!, q.count, pf, rng, false, lim);
    });
    tune(squads, target, rng, lim);
    const err = Math.abs(squads.reduce((a, q) => a + squadPower(q), 0) - target);
    if (err < bestErr) {
      best = squads;
      bestErr = err;
    }
  }
  return best;
}

/** The 'mirror' army: the player's own squads, unit for unit and count for count, with the kit retuned toward the target. */
function mirrorArmy(mine: readonly SquadSpec[], target: number, rng: Rng): SquadSpec[] {
  const squads = mine.map((q) => ({ ...q, key: 0 }));
  tune(squads, target, rng, {}, true);
  return squads;
}

/**
 * A champion's army: a crowned boss (SquadSpec.boss) and a crew of `escort` fighters at least a rung below it. The
 * boss's rung is the one whose natural kit carries about CHAMPION.bossPart of the POWER; the crew takes the rest, as
 * much as `escort` fighters below the boss can carry (so a small crew leaves more to its boss, never more fighters).
 */
function championArmy(target: number, escort: number, rng: Rng, lim: Limits): SquadSpec[] {
  let rung = rungFor(target * CHAMPION.bossPart, 0, true);
  while (rung > 1 && lowest(petAt(rung)!, true) > target * 0.85) rung--;
  const crewCap = rung > 1 ? escort * highest(petAt(rung - 1)!, false, lim) * 0.9 : 0;
  const bossWant = target - Math.min(target * (1 - CHAMPION.bossPart), crewCap);
  while (rung < MAX_RUNG && highest(petAt(rung)!, true) < bossWant * 0.97) rung++;
  const big = pickSquad(petAt(rung)!, 1, bossWant, rng, true, { ...lim, minRung: rung, maxRung: rung });
  const rest = target - squadPower(big);
  const below = { ...lim, maxRung: Math.max(1, rung - 1) };
  const crew = escort > 0 && rung > 1 && rest > lowest('sprout') * 0.9 ? buildArmy(rest, escort, rng, MATCH.maxSquads - 1, below) : [];
  return [big, ...crew];
}

// ------------------------------------------------------------------ matchmaking

const fightersOf = (squads: readonly SquadSpec[]) => squads.reduce((a, q) => a + q.count, 0);

/**
 * How hard the next match is, as a share of the player's POWER: MATCH.intro for the first fights, else MATCH.base;
 * MATCH.slump less per loss in a row, MATCH.hot more per win of a streak beyond the first; never below MATCH.floor.
 * A champion match is championFactor() x this.
 */
export function difficulty(state: Pick<SaveState, 'matches' | 'streak' | 'slump'>): number {
  const n = Math.max(0, state.matches);
  let d = n < MATCH.intro.length ? MATCH.intro[n] : MATCH.base;
  d -= MATCH.slump * Math.min(MATCH.slumpMax, Math.max(0, state.slump));
  d += MATCH.hot * Math.min(MATCH.hotMax, Math.max(0, state.streak - 1));
  return Math.max(MATCH.floor, d);
}

/** How much tougher a champion team is: CHAMPION.power, easing to 1 over the first MATCH.easeAfter losses in a row. */
export function championFactor(state: Pick<SaveState, 'slump'>): number {
  return 1 + (CHAMPION.power - 1) * Math.max(0, 1 - Math.max(0, state.slump) / MATCH.easeAfter);
}

/** true when the player's next match is a CHAMPION match. */
export const nextIsChampion = (state: Pick<SaveState, 'matches'>) => isChampionMatch(state.matches + 1);
/** Matches until the next champion match (0 = the next one is). */
export const matchesToChampion = (state: Pick<SaveState, 'matches'>) => {
  const n = state.matches + 1;
  return (CHAMPION.every - (n % CHAMPION.every)) % CHAMPION.every;
};

/** The seed findOpponent uses by default: the save's seed and its match count. */
export const matchSeed = (state: Pick<SaveState, 'seed' | 'matches'>) => hashSeed(state.seed, state.matches, 0x0b07);
/** The seed of the next fight. */
export const fightSeed = (state: Pick<SaveState, 'seed' | 'matches'>) => hashSeed(state.seed, state.matches, 0xf1);

/** The themes a match can draw for this army (the first fights keep to 'mixed'; a slump leaves out the trickiest). */
function themesFor(state: Pick<SaveState, 'matches' | 'slump'>, mine: readonly SquadSpec[]): ThemeId[] {
  if (state.matches < MATCH.intro.length) return ['mixed'];
  const n = fightersOf(mine);
  const easy = state.slump >= MATCH.easeAfter;
  return MATCH_THEMES.filter((t) => (t !== 'heavy' || n >= 2) && (t !== 'swarm' || n < MATCH.maxFighters) && (t !== 'mirror' || mine.length > 0) && !(easy && HARD_THEMES.includes(t)));
}

/** The kit limits of a theme (the first fights only see bare units and knives: a bat's or shield's shove keeps a lone Chick away). */
function limitsOf(theme: ThemeId, gentle: boolean): Limits {
  const lim: Limits =
    theme === 'swarm' ? { favour: ['knife', 'sneakers'] }
    : theme === 'heavy' ? { favour: ['bat', 'chili'] }
    : theme === 'glass' ? { weapons: ['knife', 'bat', 'spear'], bare: false, noGear: ['helmet'], favour: ['chili'] }
    : theme === 'tanks' ? { weapons: ['shield'], bare: false, noGear: ['chili'], favour: ['helmet'] }
    : {};
  if (gentle) return { ...lim, weapons: ['knife'], bare: true };
  return lim;
}

/** Builds the army of one theme; null when this army cannot make it (so another theme is tried). */
function armyOf(theme: ThemeId, mine: readonly SquadSpec[], target: number, rng: Rng, lim: Limits): SquadSpec[] | null {
  const n = Math.max(1, fightersOf(mine));
  switch (theme) {
    case 'mixed':
      return shadowArmy(mine, target, rng, lim);
    case 'swarm': {
      const army = buildArmy(target, Math.min(MATCH.maxFighters, Math.max(n + 1, Math.round(n * THEMES.swarm.fighters))), rng, MATCH.maxSquads, lim, [1, 3, 3]);
      return fightersOf(army) > n ? army : null;
    }
    case 'heavy': {
      const army = buildArmy(target, Math.max(1, Math.min(n - 1, Math.round(n * THEMES.heavy.fighters))), rng, MATCH.maxSquads, lim, [1, 2, 3]);
      return fightersOf(army) < n ? army : null;
    }
    case 'glass':
    case 'tanks':
      return buildArmy(target, n, rng, MATCH.maxSquads, lim);
    case 'mirror': {
      const army = mirrorArmy(mine, target, rng);
      return near(army.reduce((a, q) => a + squadPower(q), 0), target, MATCH.tolerance * 2) ? army : null;
    }
    default:
      return null;
  }
}

/** A fun bot name: "Punchy Panda". */
function botName(rng: Rng): string {
  return `${rng.pick(BOT_NAMES.first)} ${rng.pick(BOT_NAMES.last)}`;
}

/**
 * The opponent BATTLE finds for the player's next match (see the top of this file). mine: the player's army (by
 * default the save's own grid). The same state, seed and army always give the same opponent.
 */
export function findOpponent(state: SaveState, seed = matchSeed(state), mine: ArmySpec = new Inventory(state).army()): Opponent {
  const rng = makeRng(hashSeed(seed, 0x6a7c));
  const match = state.matches + 1;
  const champion = isChampionMatch(match);
  const d = difficulty(state) * (champion ? championFactor(state) : 1);
  const own = mine.squads;
  const target = Math.max(1, armyPower(own) * d);
  const gentle = state.matches < MATCH.intro.length;
  const n = fightersOf(own);
  let theme: ThemeId = 'mixed';
  let squads: SquadSpec[];
  if (champion) {
    theme = 'champion';
    squads = championArmy(target, Math.max(0, Math.round(n * CHAMPION.escort)), rng, limitsOf('mixed', gentle));
  } else {
    const pool = themesFor(state, own);
    let pick = pool[rng.weighted(pool.map((t) => THEMES[t].weight))];
    let built = armyOf(pick, own, target * THEMES[pick].power, rng, limitsOf(pick, gentle));
    if (!built) {
      pick = 'mixed';
      built = armyOf('mixed', own, target * THEMES.mixed.power, rng, limitsOf('mixed', gentle))!;
    }
    theme = pick;
    squads = built;
  }
  if (squads.length === 0) squads = [{ key: 0, pet: 'sprout', count: 1, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0 }];
  const army: ArmySpec = { squads: squads.map((q) => ({ ...q, key: 0 })) };
  const t = THEMES[theme];
  return {
    name: champion ? rng.pick(CHAMPION_NAMES) : botName(rng),
    bot: true,
    theme: { id: theme, name: t.name, blurb: t.blurb },
    army,
    power: armyPower(army.squads),
    fighters: fightersOf(army.squads),
    champion,
    match,
    difficulty: d,
  };
}
