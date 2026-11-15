import type { GearType, PetType, PieceKind, PieceType, RollResult, SquadSpec, WeaponType } from './types';

/*
 * The game's numbers: classes, pets, weapons, gear, rolls, trophies and the balance knobs.
 * Plain data and pure functions only, so the headless simulator and the balance tools read the same table
 * the game does.
 */

// ------------------------------------------------------------------ classes (weapons and gear only)

/** The class of a weapon or gear piece is its level, 1..7 = E..SSS. Pets have no class: they climb the ladder. */
export const MAX_LEVEL = 7;
export const CLASSES = ['E', 'D', 'C', 'B', 'A', 'S', 'SSS'] as const;
export const classOf = (level: number) => CLASSES[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
export const cls = (level: number) => `${classOf(level)}-class`;

/** A pet piece sends 1, 2 or 4 fighters: fusing two identical pet pieces doubles it (and its footprint). */
export const MAX_COUNT = 4;

// ------------------------------------------------------------------ the grid

export const GRID = { cols: 5, rows: 5 } as const;
/** The bench under the grid: one row of slots, each holding one piece of any size. */
export const BENCH_SLOTS = 5;

/**
 * How many grid cells a piece covers, as w x h: weapons and gear 1 x 1; a pet by its count: x1 = 1 x 1,
 * x2 = 2 x 1 lying across (1 x 2 when turned), x4 = 2 x 2.
 */
export function footprint(p: { type: PieceType; count: number; turned?: boolean }): { w: number; h: number } {
  if (!isPet(p.type) || p.count <= 1) return { w: 1, h: 1 };
  if (p.count === 2) return p.turned ? { w: 1, h: 2 } : { w: 2, h: 1 };
  return { w: 2, h: 2 };
}

// ------------------------------------------------------------------ pieces

/** The pets in ladder order, rung 1 (the weakest and most common) to rung 12. The only source of a pet's rung. */
export const PET_TYPES: readonly PetType[] = ['ant', 'bee', 'mouse', 'snail', 'frog', 'crab',
  'grasshopper', 'hedgehog', 'chameleon', 'penguin', 'beetle', 'turtle'];
export const WEAPON_TYPES: readonly WeaponType[] = ['knife', 'bat', 'shield', 'spear'];
export const GEAR_TYPES: readonly GearType[] = ['helmet', 'sneakers', 'chili'];
export const PIECE_TYPES: readonly PieceType[] = [...PET_TYPES, ...WEAPON_TYPES, ...GEAR_TYPES];

const PET_SET: ReadonlySet<string> = new Set(PET_TYPES);
export const isPet = (t: PieceType): t is PetType => PET_SET.has(t);
export const isWeapon = (t: PieceType): t is WeaponType => t === 'knife' || t === 'bat' || t === 'shield' || t === 'spear';
export const isGear = (t: PieceType): t is GearType => t === 'helmet' || t === 'sneakers' || t === 'chili';
export const kindOf = (t: PieceType): PieceKind => (isPet(t) ? 'pet' : isWeapon(t) ? 'weapon' : 'gear');

export const PIECE_NAME: Record<PieceType, string> = {
  ant: 'Ant',
  bee: 'Bee',
  mouse: 'Mouse',
  snail: 'Snail',
  frog: 'Frog',
  crab: 'Crab',
  grasshopper: 'Grasshopper',
  hedgehog: 'Hedgehog',
  chameleon: 'Chameleon',
  penguin: 'Penguin',
  beetle: 'Beetle',
  turtle: 'Turtle',
  knife: 'Knife',
  bat: 'Bat',
  shield: 'Shield',
  spear: 'Spear',
  helmet: 'Helmet',
  sneakers: 'Sneakers',
  chili: 'Chili',
};

/** One short line shown while a piece is dragged. {v} is replaced by the number for its class. */
export const PIECE_DESC: Record<PieceType, string> = {
  ant: 'Bites harder next to other ants.',
  bee: 'Flies over friends. Its sting keeps hurting.',
  mouse: 'Tiny and quick. Dodges almost a third of hits.',
  snail: 'Hides in its shell once when hurt.',
  frog: 'Its tongue slaps foes far away.',
  crab: 'Two pinches every attack.',
  grasshopper: 'Leaps onto the back line at the whistle.',
  hedgehog: 'Spikes hurt whoever hits it.',
  chameleon: 'Hits from afar and reels light foes in.',
  penguin: 'Belly-slides in and bowls foes over.',
  beetle: 'Charges in: its first strike hits huge.',
  turtle: 'Armour cuts every hit. It stomps all round.',
  knife: 'Pets touching it stab very fast.',
  bat: 'Pets touching it swing slow and send foes flying.',
  shield: 'Pets touching it block hits and take the heat.',
  spear: 'Pets touching it poke from behind the front line.',
  helmet: 'Pets touching it get +{v}% health.',
  sneakers: 'Pets touching it move +{v}% faster.',
  chili: 'Pets touching it hit +{v}% harder.',
};

// ------------------------------------------------------------------ pets: the twelve-rung ladder

/** The top rung. Two x4 squads of a pet evolve into one x1 of the next rung's pet; two x4 turtles cannot fuse. */
export const MAX_RUNG = 12;
/** The ladder (the same list as PET_TYPES): PET_LADDER[rung - 1] is the pet on that rung. */
export const PET_LADDER = PET_TYPES;
/** A pet's rung, 1..12. */
export const rungOf = (p: PetType) => PET_TYPES.indexOf(p) + 1;
export const petRung = rungOf;
/** The pet on a rung (undefined outside 1..12). */
export const petAt = (rung: number): PetType | undefined => PET_TYPES[rung - 1];
/** The pet one rung up, or null at the top. */
export const nextPet = (p: PetType): PetType | null => petAt(rungOf(p) + 1) ?? null;
/**
 * The item-style tier (1..7 = E..SSS) a rung looks like: tile frames, classFx, a pet's natural kit, the reveal
 * sound. Rung 1..12 -> E D D C C B B A A S S SSS.
 */
export const tierOf = (rung: number) => Math.max(1, Math.min(MAX_LEVEL, Math.round(1 + ((rung - 1) * 6) / 11)));
/** The tier of a pet's rung (see tierOf). */
export const petTier = (p: PetType) => tierOf(rungOf(p));

/** How a pet gets about. The simulator walks every style but 'hop' and 'leap' (hops) and 'fly' (over its own side). */
export type MoveStyle = 'scurry' | 'fly' | 'dart' | 'glide' | 'hop' | 'scuttle' | 'leap' | 'roll' | 'creep' | 'slide' | 'charge' | 'plod';
/** A pet's band at kick-off. */
export type LineRow = 'front' | 'middle' | 'back';

export interface PetDef {
  /** health of one fighter */
  hp: number;
  /** damage of its own attack */
  dmg: number;
  /** seconds between its own attacks */
  cd: number;
  /** how far its own attack reaches past its body, px */
  reach: number;
  /** px per second */
  speed: number;
  /** body radius in the arena, px */
  radius: number;
  /** how hard it is to push around */
  mass: number;
  move: MoveStyle;
  /** its band at kick-off */
  row: LineRow;
  /** what its trait and body are worth in squadPower (fitted by tools/balance.ts against its ladder neighbours) */
  power: number;
}

/**
 * Every pet doubles the POWER of the rung below: hp and damage both double each rung, so kill times hold. A pet
 * piece covers one cell per fighter, so POWER per cell doubles too. These numbers are internal and never shown.
 */
export const PETS: Record<PetType, PetDef> = {
  ant:         { hp: 58,    dmg: 3.96,  cd: 0.6,  reach: 4,  speed: 56, radius: 16, mass: 1.0, move: 'scurry',  row: 'middle', power: 1.00 },
  bee:         { hp: 89,    dmg: 5.54,  cd: 0.5,  reach: 5,  speed: 74, radius: 13, mass: 0.6, move: 'fly',     row: 'back',   power: 1.25 },
  mouse:       { hp: 177,   dmg: 14.6,  cd: 0.45, reach: 3,  speed: 68, radius: 14, mass: 0.8, move: 'dart',    row: 'middle', power: 1.03 },
  snail:       { hp: 413,   dmg: 61,    cd: 1.1,  reach: 4,  speed: 26, radius: 20, mass: 2.4, move: 'glide',   row: 'front',  power: 1.03 },
  frog:        { hp: 862,   dmg: 86.4,  cd: 1.0,  reach: 9,  speed: 40, radius: 24, mass: 2.6, move: 'hop',     row: 'front',  power: 1.15 },
  crab:        { hp: 1686,  dmg: 146.6, cd: 1.0,  reach: 7,  speed: 48, radius: 23, mass: 2.6, move: 'scuttle', row: 'middle', power: 1.26 },
  grasshopper: { hp: 3616,  dmg: 306,   cd: 0.8,  reach: 6,  speed: 46, radius: 21, mass: 1.6, move: 'leap',    row: 'back',   power: 1.06 },
  hedgehog:    { hp: 7846,  dmg: 447,   cd: 0.9,  reach: 4,  speed: 46, radius: 25, mass: 2.6, move: 'roll',    row: 'front',  power: 1.27 },
  chameleon:   { hp: 15232, dmg: 1400,  cd: 1.1,  reach: 52, speed: 36, radius: 25, mass: 2.2, move: 'creep',   row: 'back',   power: 1.14 },
  penguin:     { hp: 34560, dmg: 2975,  cd: 1.0,  reach: 6,  speed: 34, radius: 28, mass: 3.4, move: 'slide',   row: 'front',  power: 0.99 },
  beetle:      { hp: 65434, dmg: 6103,  cd: 1.3,  reach: 10, speed: 40, radius: 30, mass: 4.2, move: 'charge',  row: 'front',  power: 1.14 },
  turtle:      { hp: 97280, dmg: 15421, cd: 1.4,  reach: 6,  speed: 26, radius: 34, mass: 6.0, move: 'plod',    row: 'front',  power: 1.22 },
};

/** What the UI says about a pet: its name, its role, its trait in one line, and its band at kick-off. */
export interface PetInfo {
  name: string;
  role: string;
  trait: string;
  row: LineRow;
}
export const PET_INFO: Record<PetType, PetInfo> = {
  ant: { name: 'Ant', role: 'Swarm biter', trait: 'Bites +10% per nearby ant (up to +30%)', row: 'middle' },
  bee: { name: 'Bee', role: 'Flying poisoner', trait: 'Stings poison for 80% more over 3 s; flies over its own lines', row: 'back' },
  mouse: { name: 'Mouse', role: 'Evasive skirmisher', trait: 'Dodges 30% of hits', row: 'middle' },
  snail: { name: 'Snail', role: 'Shell tank', trait: 'Once per life, hides in its shell below half health', row: 'front' },
  frog: { name: 'Frog', role: 'Hopping bruiser', trait: 'Tongue slap: +30 knock-back, interrupts lighter foes', row: 'front' },
  crab: { name: 'Crab', role: 'Double-hit brawler', trait: 'Every attack is two pinches of 55%', row: 'middle' },
  grasshopper: { name: 'Grasshopper', role: 'Back-line leaper', trait: 'Leaps onto the enemy back line at the whistle; the landing stuns', row: 'back' },
  hedgehog: { name: 'Hedgehog', role: 'Spiky tank', trait: 'Spikes return 30% of every hit it takes', row: 'front' },
  chameleon: { name: 'Chameleon', role: 'Long-reach puller', trait: 'Tongue reach 52; pulls light foes in', row: 'back' },
  penguin: { name: 'Penguin', role: 'Line-breaker', trait: 'Belly-slides at 3x speed and bowls foes over', row: 'front' },
  beetle: { name: 'Beetle', role: 'Charging heavy', trait: 'After a 90 px run-up, the next strike deals 2.5x with a big shove', row: 'front' },
  turtle: { name: 'Turtle', role: 'Armoured boss', trait: 'Armour cuts 35% of everything; its stomp hits up to 4 foes around it', row: 'front' },
};

/** Every trait number in one table, so tools/balance.ts can sweep them (see docs/pets.md, section 3). */
export const TRAIT = {
  /** +per damage for each other friendly ant within range px, up to max of them */
  ant: { per: 0.1, max: 3, range: 100 },
  /** a landed sting poisons for poison x its damage, drained over time s; a poison event at most every tickEvent s */
  bee: { poison: 0.8, time: 3, tickEvent: 0.5 },
  /** share of hits that miss it */
  mouse: { dodge: 0.3 },
  /** below this share of health it hides for time s: takes this share of damage, regrows regrow x its health, counts as massMul heavier */
  snail: { below: 0.5, time: 2.5, take: 0.15, regrow: 0.15, massMul: 5 },
  /** + knock on every hit; interrupts the wind-up of foes lighter than interruptMass x its mass, for interrupt s */
  frog: { knock: 30, interruptMass: 0.8, interrupt: 0.2 },
  /** every attack is two pinches of share x the damage */
  crab: { share: 0.55 },
  /** the opening leap: flight s, lands gap px short; hits foes within splash px, stun s, knock; target score: spread per teammate aimed, side x |dx|; cdLeft of its cooldown left; the landing marker shows warn s before */
  grasshopper: { flight: 0.8, gap: 2, splash: 30, stun: 0.6, knock: 20, spread: 120, side: 0.3, cdLeft: 0.5, warn: 0.3 },
  /** spikes return thorns x the damage it took */
  hedgehog: { thorns: 0.3 },
  /** hits on foes lighter than pullMass x its mass pull them pull px toward it */
  chameleon: { pull: 28, pullMass: 1.5 },
  /** slides at speed x when its target is over minDist px away, for up to maxTime s; slams the first foe within touch px for slam x damage, knock; shoves others within splash px; stands up standUp s; ready again recharge s after; steer = velocity blend per s */
  penguin: { speed: 3, minDist: 110, maxTime: 1.6, touch: 3, slam: 1.5, knock: 55, splash: 36, standUp: 0.4, recharge: 5, steer: 30 },
  /** after run px walked it is charged: speed x faster; the next strike deals mul x with + knock and a stun of at least stun s */
  beetle: { run: 90, speed: 1.35, mul: 2.5, knock: 70, stun: 0.35 },
  /** armour cuts this share of everything; the stomp hits up to max(stompMax, splash) foes all round */
  turtle: { armour: 0.35, stompMax: 4 },
} as const;

// ------------------------------------------------------------------ weapons

export interface WeaponDef {
  /** x the pet's own damage */
  dmg: number;
  /** x the pet's own attack time */
  cd: number;
  /** px past the pet's body */
  reach: number;
  /** how far a hit shoves the target, px (before mass) */
  knock: number;
  /** x the pet's health */
  hp: number;
  /** share of incoming damage blocked (shield) */
  block: number;
  /** seconds a hit stuns (shield bash) */
  stun: number;
  /** foes one swing can hit (bat: an arc in front) */
  splash: number;
  /** foes one thrust goes through in a line (spear) */
  pierce: number;
}

/** A pet with no weapon uses its own attack: the same as a weapon of all 1s. */
export const NO_WEAPON: WeaponDef = { dmg: 1, cd: 1, reach: 0, knock: 14, hp: 1, block: 0, stun: 0, splash: 1, pierce: 1 };

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  knife: { dmg: 1.1, cd: 0.42, reach: 6, knock: 10, hp: 1, block: 0, stun: 0, splash: 1, pierce: 1 },
  bat: { dmg: 2.2, cd: 1.5, reach: 12, knock: 45, hp: 1, block: 0, stun: 0, splash: 3, pierce: 1 },
  shield: { dmg: 1.0, cd: 1.0, reach: 5, knock: 30, hp: 1.1, block: 0.1, stun: 0.06, splash: 1, pierce: 1 },
  spear: { dmg: 1.25, cd: 1.1, reach: 24, knock: 14, hp: 1, block: 0, stun: 0, splash: 1, pierce: 2 },
};

/**
 * What a weapon's class changes: fusing two identical weapons makes it hit harder, faster and hold on longer.
 * Each class is worth x1.112 POWER (as before the ladder), split between damage and health, so duels at S and
 * SSS last about as long as at E.
 */
export const WEAPON_CLASS = {
  dmg: 1.1, // x per class
  cd: 0.97, // x per class
  hp: 1.09, // x per class
};

// ------------------------------------------------------------------ gear

/** Bonus in % for each class E..SSS. */
export const GEAR: Record<GearType, { stat: string; pct: readonly number[] }> = {
  helmet: { stat: 'health', pct: [20, 32, 46, 62, 80, 100, 130] },
  sneakers: { stat: 'speed', pct: [12, 18, 24, 30, 36, 42, 50] },
  chili: { stat: 'damage', pct: [18, 28, 40, 54, 70, 88, 110] },
};
/** Sneakers also quicken attacks by this share of their speed bonus. */
export const SNEAKERS_ATTACK_SHARE = 0.5;

export const gearPct = (g: GearType, level: number) => (level <= 0 ? 0 : GEAR[g].pct[Math.min(MAX_LEVEL, level) - 1]);

// ------------------------------------------------------------------ one fighter's numbers

export interface UnitStats {
  hp: number;
  dmg: number;
  /** seconds between attacks */
  cd: number;
  /** px past its body */
  reach: number;
  /** px per second */
  speed: number;
  radius: number;
  mass: number;
  knock: number;
  block: number;
  stun: number;
  splash: number;
  pierce: number;
  move: MoveStyle;
  /** its pet's rung, 1..12 */
  rung: number;
}

/** The numbers of one fighter of a squad. Speed, radius and mass come from the pet (sneakers add speed). */
export function unitStats(s: SquadSpec): UnitStats {
  const p = PETS[s.pet];
  const w = s.weapon ? WEAPONS[s.weapon] : NO_WEAPON;
  const wl = s.weapon ? Math.max(1, s.weaponLevel) - 1 : 0;
  const speedUp = gearPct('sneakers', s.sneakers) / 100;
  return {
    hp: p.hp * w.hp * WEAPON_CLASS.hp ** wl * (1 + gearPct('helmet', s.helmet) / 100),
    dmg: p.dmg * w.dmg * WEAPON_CLASS.dmg ** wl * (1 + gearPct('chili', s.chili) / 100),
    cd: (p.cd * w.cd * WEAPON_CLASS.cd ** wl) / (1 + speedUp * SNEAKERS_ATTACK_SHARE),
    reach: p.reach + w.reach,
    speed: p.speed * (1 + speedUp),
    radius: p.radius,
    mass: p.mass,
    knock: w.knock,
    block: w.block,
    stun: w.stun,
    splash: w.splash,
    pierce: w.pierce,
    move: p.move,
    rung: rungOf(s.pet),
  };
}

/**
 * How strong a squad is, as one number (the lobby's POWER, and what opponents are matched on).
 * The balance tool keeps this honest: two armies of equal power should win about equally often.
 */
export function squadPower(s: SquadSpec): number {
  const u = unitStats(s);
  const toughness = u.hp / (1 - u.block);
  const dps = (u.dmg / u.cd) * (1 + 0.25 * (u.splash - 1)) * (1 + 0.2 * (u.pierce - 1)) * (1 + 2 * u.stun);
  const one = Math.sqrt(toughness * dps) * PETS[s.pet].power;
  return one * s.count ** POWER.countExp * POWER.scale;
}
export const POWER = { scale: 0.6, countExp: 1 };

export const armyPower = (squads: readonly SquadSpec[]) => Math.round(squads.reduce((a, s) => a + squadPower(s), 0));

// ------------------------------------------------------------------ the fight

/** The arena in the simulator's own pixels. You hold the bottom, the opponent the top. */
export const ARENA = { w: 460, h: 820 } as const;

export const FIGHT = {
  /** seconds of "3, 2, 1" before anyone moves */
  countdown: 1.6,
  /** from this second on every hit grows stronger, so a fight always ends */
  enrageAt: 50,
  /** + damage per second after enrageAt */
  enrageRamp: 0.25,
  /** the fight is called at this second: the side with more health left (as a share) wins */
  timeLimit: 75,
  /**
   * The line-up (see lineUp in src/sim/battle.ts): the front row stands this far from its own end line, the
   * rows behind it are spaced by body size, and no row stands closer to the end line than lineBack.
   */
  lineFront: 130,
  lineBack: 26,
  /** px between the bodies of neighbours in a row, and between rows */
  lineGap: 8,
  /** seconds between one kick-off band (front, middle, back) setting off and the next one that has fighters */
  wave: 2.5,
  /** a foe already fought by others looks this much farther per attacker, so fights spread along the line */
  crowd: 2,
  /** how hard a stuck fighter slips sideways around what blocks it */
  sidestep: 0.45,
  /** seconds a fighter pauses after scoring a knock-out */
  cheer: 0.8,
};

// ------------------------------------------------------------------ rolls

/** Share of rolls that give each kind of piece (they sum to 100). A pet roll then picks a rung (petOdds). */
export const ROLL_KIND_ODDS: Record<'pet' | WeaponType | GearType, number> = {
  pet: 40,
  knife: 8,
  bat: 8,
  shield: 8,
  spear: 8,
  helmet: 9,
  sneakers: 9,
  chili: 10,
};
/** The kinds ROLL_KIND_ODDS picks from, in a fixed order. */
export const ROLL_KINDS: readonly ('pet' | WeaponType | GearType)[] = ['pet', 'knife', 'bat', 'shield', 'spear', 'helmet', 'sneakers', 'chili'];

/**
 * Each league's home rung (Sprout .. Legend): a pet roll's rung weighs PET_ODDS_STEP.up ^ (rung - home) above it
 * and PET_ODDS_STEP.down ^ (home - rung) below it. The up step must stay steep (well under 1/8), so evolving
 * stays cheaper than rolling the next rung.
 */
export const PET_HOME: readonly number[] = [1, 2, 3, 4.5, 6, 7.5, 9];
export const PET_ODDS_STEP = { up: 0.2, down: 0.3 };
/** The % chance of each rung 1..12 on a pet roll in this league (sums to 100). */
export function petOdds(league: number): number[] {
  const home = PET_HOME[Math.max(0, Math.min(PET_HOME.length - 1, league))];
  const w = PET_TYPES.map((_, i) => {
    const rung = i + 1;
    return rung >= home ? PET_ODDS_STEP.up ** (rung - home) : PET_ODDS_STEP.down ** (home - rung);
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / sum) * 100);
}
/** A pity pet is this many rungs above ceil(home), at these % (capped at the top rung). */
export const PITY_PET = { above: [2, 3, 4] as const, odds: [88, 10.5, 1.5] as const };
/** The lowest rung that counts as a top pet in this league: rolling one (however) resets the pity counter. */
export const pityRung = (league: number) => Math.ceil(PET_HOME[Math.max(0, Math.min(PET_HOME.length - 1, league))]) + PITY_PET.above[0];
/** While the player has never evolved and has played fewer matches than this, a normal pet roll is an ant. */
export const ANT_SEASON = 12;

/** Chance (in %) of each class E..SSS, per league: the higher your league, the better the rolls. */
export const ROLL_CLASS_ODDS: readonly (readonly number[])[] = [
  [70, 22, 6.4, 1.3, 0.25, 0.04, 0.01],
  [62, 26, 8.8, 2.5, 0.55, 0.12, 0.03],
  [54, 29, 11.5, 4, 1.2, 0.24, 0.06],
  [46, 31, 14.5, 6, 2, 0.4, 0.1],
  [38, 32, 18, 8.4, 2.9, 0.55, 0.15],
  [30, 32, 21.5, 11, 4.4, 0.85, 0.25],
  [22, 31, 24.5, 14.5, 6.3, 1.3, 0.4],
];
/** A-class or better: what a guaranteed (pity) item roll picks from. */
export const TOP_ODDS: readonly number[] = [0, 0, 0, 0, 88, 10.5, 1.5];
/** Every this many rolls without an A-class or better, the next one is guaranteed. */
export const PITY = 30;

/** The first rolls of a new player are fixed, so the guide can teach fusing. */
export const SCRIPTED_ROLLS: readonly RollResult[] = [
  { type: 'ant', level: 1, pity: false },
  { type: 'chili', level: 1, pity: false },
  { type: 'ant', level: 1, pity: false },
];

/** What a new player starts with, on the bench. */
export const STARTER_KIT: readonly { type: PieceType; level: number }[] = [
  { type: 'ant', level: 1 },
  { type: 'knife', level: 1 },
  { type: 'helmet', level: 1 },
];

// ------------------------------------------------------------------ rewards and trophies

export const REWARD = {
  /** rolls for knocking out the whole enemy army (a share of it fills the same share of the roll meter) */
  rollsForKills: 2,
  /** extra rolls for winning */
  rollsForWin: 1,
  trophiesWin: 30,
  trophiesLose: 20,
  /** below this many trophies a defeat costs less (nothing at 0, the full amount from here up) */
  gentleBelow: 100,
  /** +- on the trophy change, so numbers are not always the same */
  trophyJitter: 3,
};

export interface League {
  name: string;
  /** trophies it starts at */
  at: number;
}
export const LEAGUES: readonly League[] = [
  { name: 'Sprout', at: 0 },
  { name: 'Bronze', at: 100 },
  { name: 'Silver', at: 250 },
  { name: 'Gold', at: 450 },
  { name: 'Platinum', at: 700 },
  { name: 'Diamond', at: 1000 },
  { name: 'Legend', at: 1400 },
];
export const leagueOf = (trophies: number) => {
  let i = 0;
  while (i + 1 < LEAGUES.length && trophies >= LEAGUES[i + 1].at) i++;
  return i;
};

/** Rewards for reaching a trophy count for the first time. */
export interface RoadReward {
  at: number;
  rolls: number;
  /** a welcome pet, handed out on the roll screen like a roll (see SaveState.gifts) */
  pet?: PetType;
}
/** The welcome pets: one rung above each league's home rung, then a beetle, and a turtle at the end of the road. */
const ROAD_PETS: Readonly<Record<number, { rolls: number; pet: PetType }>> = {
  100: { rolls: 3, pet: 'mouse' },
  250: { rolls: 3, pet: 'snail' },
  450: { rolls: 3, pet: 'crab' },
  700: { rolls: 3, pet: 'grasshopper' },
  1000: { rolls: 3, pet: 'chameleon' },
  1400: { rolls: 3, pet: 'penguin' },
  1700: { rolls: 2, pet: 'beetle' },
  2000: { rolls: 2, pet: 'turtle' },
};
export const TROPHY_ROAD: readonly RoadReward[] = Array.from({ length: 40 }, (_, i) => {
  const at = (i + 1) * 50;
  const special = ROAD_PETS[at];
  return special ? { at, rolls: special.rolls, pet: special.pet } : { at, rolls: 2 };
});

/**
 * The opponent is a bot built against the player's own army (src/logic/bots.ts): about as many fighters and
 * the player's army power x a difficulty factor that starts easy and climbs gently with trophies.
 */
export const BOT = {
  /** x the player's power for match 0, 1, 2 */
  firstMatches: [0.8, 0.9, 0.9] as const,
  /** from then on x this at 0 trophies, rising evenly to `hard` at `hardAt` trophies */
  easy: 0.88,
  hard: 1.03,
  hardAt: 1500,
  /** +- this share of random spread on the target power */
  spread: 0.06,
  /** after 2 defeats in a row the next opponent is this much weaker */
  mercy: 0.85,
  /** after 3 wins in a row the next opponent is this much stronger */
  heat: 1.08,
  /** the bot fields the player's fighter count x 1 +- this */
  countSpread: 0.25,
  /** its army power lands within this share of the target */
  tolerance: 0.06,
  /** at most this many squads and fighters (what a 5 x 5 grid can hold) */
  maxSquads: 10,
  maxFighters: 25,
  /** against at most this many fighters the bot fields the player's own kinds of pets (and weapon in a 1 v 1) */
  mirrorUpTo: 3,
  /**
   * How a bot shadows each player squad of rung k and count c: the same pet and count, rung k + 1 at half the
   * count (c >= 2), or rung k - 1 at double the count (c <= 2). All three have the same bare POWER.
   */
  shapes: { same: 3, up: 1, down: 1 },
};

export const TUTORIAL_DONE = 99;
