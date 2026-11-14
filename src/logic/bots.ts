import { BOT, MAX_LEVEL, GEAR_TYPES, PET_TYPES, WEAPON_TYPES, armyPower, botPowerAt, squadPower } from '../data';
import type { Opponent, SaveState, SquadSpec } from '../types';
import type { Rng } from '../rng';

const ADJ = ['Swift', 'Lazy', 'Salty', 'Neon', 'Turbo', 'Sneaky', 'Mighty', 'Fuzzy', 'Cosmic', 'Grumpy', 'Lucky', 'Rapid', 'Silent', 'Wild', 'Cheesy', 'Frosty', 'Dizzy', 'Jolly', 'Brave', 'Pixel', 'Atomic', 'Crispy', 'Spicy', 'Hyper', 'Mellow', 'Rusty', 'Shiny', 'Tiny', 'Giga', 'Funky'];
const NOUN = ['Ninja', 'Wizard', 'Pirate', 'Walrus', 'Toast', 'Falcon', 'Pickle', 'Gamer', 'Robot', 'Badger', 'Noodle', 'Tiger', 'Comet', 'Waffle', 'Hunter', 'Panda', 'Rocket', 'Muffin', 'Viking', 'Goblin', 'Otter', 'Cactus', 'Bandit', 'Captain', 'Racer', 'Mango', 'Yeti', 'Pilot', 'Knight', 'Moose'];
const TAIL = ['', '', 'x', 'xx', 'YT', '_pro', 'HD', 'TV'];

function makeName(rng: Rng): string {
  const num = rng.chance(0.6) ? String(rng.int(1, 999)) : '';
  return rng.pick(ADJ) + rng.pick(NOUN) + num + rng.pick(TAIL);
}

const COUNTS = [1, 2, 4, 8];
const clamp = (n: number) => Math.max(1, Math.min(MAX_LEVEL, n));

function randomSquad(rng: Rng): SquadSpec {
  const level = rng.int(1, MAX_LEVEL);
  const armed = rng.chance(0.85);
  const gear = (): number => (rng.chance(0.5) ? clamp(level + rng.int(-1, 1)) : 0);
  const [helmet, sneakers, chili] = GEAR_TYPES.map(gear);
  return {
    key: 0,
    pet: rng.pick(PET_TYPES),
    level,
    count: rng.pick(COUNTS),
    weapon: armed ? rng.pick(WEAPON_TYPES) : null,
    weaponLevel: armed ? clamp(level + rng.int(-1, 0)) : 0,
    helmet,
    sneakers,
    chili,
  };
}

const MAX_SQUADS = 10;

/** One greedy try: keeps adding random squads that fit in what is left of the target. */
function buildArmy(target: number, rng: Rng): SquadSpec[] {
  const squads: SquadSpec[] = [];
  let left = target;
  const tol = target * 0.06;
  while (squads.length < MAX_SQUADS && left > 0) {
    const fits = [];
    for (let i = 0; i < 90; i++) {
      const s = randomSquad(rng);
      const p = squadPower(s);
      if (p <= left + tol) fits.push({ s, p });
    }
    if (fits.length === 0) break;
    const finishers = fits.filter((f) => Math.abs(f.p - left) <= tol);
    const big = fits.filter((f) => f.p >= left * 0.3);
    const last = squads.length >= MAX_SQUADS - 1;
    let pool = finishers.length > 0 ? finishers : big;
    if (pool.length === 0 || last) pool = [fits.reduce((a, b) => (Math.abs(b.p - left) < Math.abs(a.p - left) ? b : a))];
    const f = rng.pick(pool);
    squads.push(f.s);
    left -= f.p;
  }
  if (squads.length === 0) {
    // the target is below the weakest squad: send the weakest one
    const ant: SquadSpec = { key: 0, pet: 'ant', level: 1, count: 1, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0 };
    squads.push(ant);
  }
  return squads;
}

/** The opponent for the next match: a bot whose army power is close to the target for this player. */
export function makeOpponent(state: SaveState, rng: Rng): Opponent {
  let target = botPowerAt(state.trophies) * rng.range(BOT.spread[0], BOT.spread[1]);
  if (state.matches < BOT.firstMatches.length) target *= BOT.firstMatches[state.matches];
  if (state.streak <= -2) target *= BOT.mercy;
  if (state.streak >= 3) target *= BOT.heat;
  const name = makeName(rng);
  const trophies = Math.max(0, state.trophies + rng.int(-25, 25));
  let best: SquadSpec[] = [];
  let bestErr = Infinity;
  for (let i = 0; i < 25 && bestErr > target * 0.02; i++) {
    const army = buildArmy(target, rng);
    const err = Math.abs(armyPower(army) - target);
    if (err < bestErr) {
      best = army;
      bestErr = err;
    }
  }
  return { name, trophies, army: { squads: best }, power: armyPower(best), seed: rng.int(1, 2147483646) };
}

