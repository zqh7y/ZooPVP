import type { GearType, PetType, PieceKind, PieceType, RollResult, SquadSpec, WeaponType } from './types';

/*
 * The game's numbers: classes, pets, weapons, gear, rolls, trophies and the balance knobs.
 * Plain data and pure functions only, so the headless simulator and the balance tools read the same table
 * the game does.
 */

// ------------------------------------------------------------------ classes

export const MAX_LEVEL = 7;
export const CLASSES = ['E', 'D', 'C', 'B', 'A', 'S', 'SSS'] as const;
export const classOf = (level: number) => CLASSES[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
export const cls = (level: number) => `${classOf(level)}-class`;

/** A pet piece sends 1, 2, 4 or 8 fighters: fusing two identical pet pieces doubles it. */
export const MAX_COUNT = 8;

// ------------------------------------------------------------------ the grid

export const GRID = { cols: 8, rows: 8 } as const;
export const BENCH_SLOTS = 16;

// ------------------------------------------------------------------ pieces

export const PET_TYPES: readonly PetType[] = ['ant', 'frog'];
export const WEAPON_TYPES: readonly WeaponType[] = ['knife', 'bat', 'shield', 'spear'];
export const GEAR_TYPES: readonly GearType[] = ['helmet', 'sneakers', 'chili'];
export const PIECE_TYPES: readonly PieceType[] = [...PET_TYPES, ...WEAPON_TYPES, ...GEAR_TYPES];

export const isPet = (t: PieceType): t is PetType => t === 'ant' || t === 'frog';
export const isWeapon = (t: PieceType): t is WeaponType => t === 'knife' || t === 'bat' || t === 'shield' || t === 'spear';
export const isGear = (t: PieceType): t is GearType => t === 'helmet' || t === 'sneakers' || t === 'chili';
export const kindOf = (t: PieceType): PieceKind => (isPet(t) ? 'pet' : isWeapon(t) ? 'weapon' : 'gear');

export const PIECE_NAME: Record<PieceType, string> = {
  ant: 'Ant',
  frog: 'Frog',
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
  ant: 'Tiny and fast. Gets there first.',
  frog: 'Big and tough. Hops in late and hits hard.',
  knife: 'Pets touching it stab very fast.',
  bat: 'Pets touching it swing slow and send foes flying.',
  shield: 'Pets touching it block hits and take the heat.',
  spear: 'Pets touching it poke from behind the front line.',
  helmet: 'Pets touching it get +{v}% health.',
  sneakers: 'Pets touching it move +{v}% faster.',
  chili: 'Pets touching it hit +{v}% harder.',
};

// ------------------------------------------------------------------ pets

export type MoveStyle = 'scurry' | 'hop';

export interface PetDef {
  /** health of one fighter at E-class */
  hp: number;
  /** damage of its own attack (a bite, or the frog's tongue) at E-class */
  dmg: number;
  /** seconds between its own attacks */
  cd: number;
  /** how far its own attack reaches past its body, px */
  reach: number;
  /** px per second at E-class */
  speed: number;
  /** body radius at E-class, px (in the arena) */
  radius: number;
  /** how hard it is to push around */
  mass: number;
  move: MoveStyle;
}

export const PETS: Record<PetType, PetDef> = {
  ant: { hp: 36, dmg: 5, cd: 0.6, reach: 3, speed: 96, radius: 8, mass: 1, move: 'scurry' },
  frog: { hp: 120, dmg: 13, cd: 1.0, reach: 8, speed: 58, radius: 14, mass: 2.6, move: 'hop' },
};

/** What a pet's class changes: a higher class is bigger, tougher, stronger and a little slower. */
export const PET_CLASS = {
  hp: 1.6, // x per class
  dmg: 1.45, // x per class
  size: 0.11, // + per class (radius)
  speed: 0.95, // x per class
  mass: 1.25, // x per class
};

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
  knife: { dmg: 0.9, cd: 0.5, reach: 4, knock: 8, hp: 1, block: 0, stun: 0, splash: 1, pierce: 1 },
  bat: { dmg: 2.6, cd: 1.6, reach: 9, knock: 120, hp: 1, block: 0, stun: 0, splash: 3, pierce: 1 },
  shield: { dmg: 0.8, cd: 1.2, reach: 4, knock: 50, hp: 1.6, block: 0.4, stun: 0.35, splash: 1, pierce: 1 },
  spear: { dmg: 1.7, cd: 1.1, reach: 30, knock: 20, hp: 1, block: 0, stun: 0, splash: 1, pierce: 2 },
};

/** What a weapon's class changes: fusing two identical weapons makes it hit harder and faster. */
export const WEAPON_CLASS = {
  dmg: 1.32, // x per class
  cd: 0.96, // x per class
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
}

/** The numbers of one fighter of a squad. */
export function unitStats(s: SquadSpec): UnitStats {
  const p = PETS[s.pet];
  const w = s.weapon ? WEAPONS[s.weapon] : NO_WEAPON;
  const pl = Math.max(1, s.level) - 1;
  const wl = s.weapon ? Math.max(1, s.weaponLevel) - 1 : 0;
  const speedUp = gearPct('sneakers', s.sneakers) / 100;
  return {
    hp: p.hp * PET_CLASS.hp ** pl * w.hp * (1 + gearPct('helmet', s.helmet) / 100),
    dmg: p.dmg * PET_CLASS.dmg ** pl * w.dmg * WEAPON_CLASS.dmg ** wl * (1 + gearPct('chili', s.chili) / 100),
    cd: (p.cd * w.cd * WEAPON_CLASS.cd ** wl) / (1 + speedUp * SNEAKERS_ATTACK_SHARE),
    reach: p.reach + w.reach,
    speed: p.speed * PET_CLASS.speed ** pl * (1 + speedUp),
    radius: p.radius * (1 + PET_CLASS.size * pl),
    mass: p.mass * PET_CLASS.mass ** pl,
    knock: w.knock,
    block: w.block,
    stun: w.stun,
    splash: w.splash,
    pierce: w.pierce,
    move: p.move,
  };
}

/**
 * How strong a squad is, as one number (the lobby's POWER, and what opponents are matched on).
 * The balance tool keeps this honest: two armies of equal power should win about equally often.
 */
export function squadPower(s: SquadSpec): number {
  const u = unitStats(s);
  const toughness = u.hp / (1 - u.block * 0.6);
  const dps = (u.dmg / u.cd) * (1 + 0.25 * (u.splash - 1)) * (1 + 0.2 * (u.pierce - 1));
  const one = Math.sqrt(toughness * dps);
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
  enrageAt: 30,
  /** + damage per second after enrageAt */
  enrageRamp: 0.12,
  /** the fight is called at this second: the side with more health left (as a share) wins */
  timeLimit: 60,
  /** how far from its own edge a team lines up */
  spawnBand: [40, 190] as const,
};

// ------------------------------------------------------------------ rolls

/** Share of rolls that give each piece (they sum to 100). */
export const ROLL_TYPE_ODDS: Record<PieceType, number> = {
  ant: 20,
  frog: 14,
  knife: 9,
  bat: 9,
  shield: 9,
  spear: 9,
  helmet: 10,
  sneakers: 10,
  chili: 10,
};

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
/** A-class or better: what the guaranteed roll picks from. */
export const TOP_ODDS: readonly number[] = [0, 0, 0, 0, 88, 10.5, 1.5];
/** Every this many rolls without an A-class or better, the next one is guaranteed. */
export const PITY = 30;

/** The first rolls of a new player are fixed, so the guide can teach fusing. */
export const SCRIPTED_ROLLS: readonly RollResult[] = [
  { type: 'ant', level: 1, pity: false },
  { type: 'frog', level: 1, pity: false },
  { type: 'chili', level: 1, pity: false },
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
  /** when set, one of the rolls is at least this class */
  minLevel?: number;
}
export const TROPHY_ROAD: readonly RoadReward[] = Array.from({ length: 40 }, (_, i) => {
  const at = (i + 1) * 50;
  const league = LEAGUES.some((l) => l.at === at);
  return league ? { at, rolls: 4, minLevel: 4 } : { at, rolls: 2 };
});

/**
 * The army power an opponent has at a trophy count. The balance tool tunes this curve to the pace a
 * player's own army grows at, so climbing takes a stronger army, not just more matches.
 */
export function botPowerAt(trophies: number): number {
  return BOT.base * BOT.growth ** (trophies / 100);
}
export const BOT = {
  base: 14,
  growth: 1.9,
  /** the opponent's power is this curve x a random spread */
  spread: [0.82, 1.1] as const,
  /** the first matches are easier: x this for match 0, 1, 2 */
  firstMatches: [0.35, 0.6, 0.8] as const,
  /** after 2 defeats in a row the next opponent is this much weaker */
  mercy: 0.8,
  /** after 3 wins in a row the next opponent is this much stronger */
  heat: 1.1,
};

export const TUTORIAL_DONE = 99;
