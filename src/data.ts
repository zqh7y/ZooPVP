import type { GearType, PetType, PieceKind, PieceType, SquadSpec, WeaponType } from './types';

/*
 * The game's numbers: classes, the twelve fighters, weapons, gear, cases, matchmaking, rewards and the player level,
 * the grid's locked cells, the economy and the balance knobs. Plain data and pure functions only, so the headless simulator and the
 * balance tools read the same table the game does.
 */

// ------------------------------------------------------------------ classes (weapons and gear only)

/** The class of a weapon or gear piece is its level, 1..7 = E..SSS. Units have no class: they climb the ladder. */
export const MAX_LEVEL = 7;
export const CLASSES = ['E', 'D', 'C', 'B', 'A', 'S', 'SSS'] as const;
export const classOf = (level: number) => CLASSES[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
export const cls = (level: number) => `${classOf(level)}-class`;

/** A unit piece sends 1, 2 or 4 fighters: fusing two identical unit pieces doubles it (and its footprint). */
export const MAX_COUNT = 4;

// ------------------------------------------------------------------ the grid

export const GRID = { cols: 5, rows: 5 } as const;
/** The tray (bench) under the grid: one row of slots, each holding one piece of any size. */
export const BENCH_SLOTS = 4;

/**
 * How many grid cells a piece covers, as w x h: weapons and gear 1 x 1; a unit by its count: x1 = 1 x 1,
 * x2 = 2 x 1 lying across (1 x 2 when turned), x4 = 2 x 2.
 */
export function footprint(p: { type: PieceType; count: number; turned?: boolean }): { w: number; h: number } {
  if (!isPet(p.type) || p.count <= 1) return { w: 1, h: 1 };
  if (p.count === 2) return p.turned ? { w: 1, h: 2 } : { w: 2, h: 1 };
  return { w: 2, h: 2 };
}

/** How a locked grid cell opens: with cash (each costs more than the last), on reaching a player level, or after enough knock-outs. */
export type CellLock = { kind: 'cash' } | { kind: 'level'; level: number } | { kind: 'ko'; count: number };
/** The bit of a cell in SaveState.open. */
export const cellBit = (col: number, row: number) => 1 << (row * GRID.cols + col);
/** The cells open from the start: the middle 3 x 3. */
export const START_OPEN = (() => {
  let m = 0;
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) m |= cellBit(c, r);
  return m;
})();
/** Every cell outside the middle 3 x 3, keyed "col,row", and how it opens. */
export const CELL_LOCKS: Readonly<Record<string, CellLock>> = {
  '0,1': { kind: 'cash' },
  '4,1': { kind: 'cash' },
  '0,2': { kind: 'cash' },
  '4,2': { kind: 'cash' },
  '0,3': { kind: 'cash' },
  '4,3': { kind: 'cash' },
  '1,0': { kind: 'level', level: 3 },
  '2,0': { kind: 'level', level: 5 },
  '3,0': { kind: 'level', level: 7 },
  '0,0': { kind: 'level', level: 10 },
  '4,0': { kind: 'level', level: 14 },
  '1,4': { kind: 'ko', count: 30 },
  '2,4': { kind: 'ko', count: 80 },
  '3,4': { kind: 'ko', count: 160 },
  '0,4': { kind: 'ko', count: 300 },
  '4,4': { kind: 'ko', count: 500 },
};
/** The cash price of a cell: CELL_PRICE.cost, then CELL_PRICE.step more for every cell already bought. */
export const CELL_PRICE = { cost: 40, step: 40 };

// ------------------------------------------------------------------ pieces

/** The units in ladder order, rung 1 (the weakest and most common) to rung 12. The only source of a unit's rung. */
export const PET_TYPES: readonly PetType[] = ['sprout', 'buzzy', 'ninja', 'snailor', 'roo', 'cacto',
  'pogo', 'briar', 'angler', 'sumo', 'rhino', 'boulder'];
export const WEAPON_TYPES: readonly WeaponType[] = ['knife', 'bat', 'shield', 'spear'];
export const GEAR_TYPES: readonly GearType[] = ['helmet', 'sneakers', 'chili'];
export const PIECE_TYPES: readonly PieceType[] = [...PET_TYPES, ...WEAPON_TYPES, ...GEAR_TYPES];

const PET_SET: ReadonlySet<string> = new Set(PET_TYPES);
export const isPet = (t: PieceType): t is PetType => PET_SET.has(t);
export const isWeapon = (t: PieceType): t is WeaponType => t === 'knife' || t === 'bat' || t === 'shield' || t === 'spear';
export const isGear = (t: PieceType): t is GearType => t === 'helmet' || t === 'sneakers' || t === 'chili';
export const kindOf = (t: PieceType): PieceKind => (isPet(t) ? 'pet' : isWeapon(t) ? 'weapon' : 'gear');

/** A unit's band at kick-off. */
export type LineRow = 'front' | 'middle' | 'back';

/** What the UI says about a unit: its name, its role, its trait in one line, its drag line and its band at kick-off. */
export interface PetInfo {
  name: string;
  role: string;
  /** the trait in one line (the NEW UNIT card, the evolve moment, the stats panel) */
  trait: string;
  /** a short line shown while it is dragged */
  desc: string;
  row: LineRow;
}
export const PET_INFO: Readonly<Record<PetType, PetInfo>> = {
  sprout: { name: 'Pea', role: 'Swarm puncher', trait: 'Punches +10% harder per Pea nearby (up to +30%)', desc: 'Tiny but never alone. Hits harder next to other Peas.', row: 'middle' },
  buzzy: { name: 'Stinger', role: 'Flying luchador', trait: 'Its stinger jab poisons for 80% more over 3 s; flies over its own lines', desc: 'Flies over friends. Its sting keeps hurting.', row: 'back' },
  ninja: { name: 'Kit', role: 'Kickboxer', trait: 'Quick feet: dodges 30% of hits', desc: 'Light on its feet. Dodges almost a third of hits.', row: 'middle' },
  snailor: { name: 'Dillo', role: 'Armoured boxer', trait: 'Once per life, curls into its armoured ball below half health', desc: 'Curls into a ball once when hurt, and heals a bit.', row: 'front' },
  roo: { name: 'Roo', role: 'Hopping bruiser', trait: 'Punches knock foes back and interrupt lighter ones', desc: 'Its punches send foes flying.', row: 'front' },
  cacto: { name: 'Cacto', role: 'Double-jab brawler', trait: 'Every attack is two jabs', desc: 'Two jabs every attack.', row: 'middle' },
  pogo: { name: 'Leapo', role: 'Top-rope luchador', trait: 'Leaps onto the enemy back line at the bell; the landing stuns', desc: 'Leaps off the top rope onto the back line.', row: 'back' },
  briar: { name: 'Spike', role: 'Spiky wrestler', trait: 'Thorns return 30% of every hit it takes', desc: 'Its spikes hurt whoever hits it.', row: 'front' },
  angler: { name: 'Inky', role: 'Long-reach boxer', trait: 'Long reach; its gloves pull light foes in', desc: 'Four gloves, long reach. Reels light foes in.', row: 'back' },
  sumo: { name: 'Walrus', role: 'Belly-slide wrestler', trait: 'Belly-slides at 3x speed and bowls foes over', desc: 'Belly-slides in and bowls foes over.', row: 'front' },
  rhino: { name: 'Bull', role: 'Charger', trait: 'After a run-up, the next strike deals 2.5x with a big shove', desc: 'Charges in: its first strike hits huge.', row: 'front' },
  boulder: { name: 'Champ', role: 'Armoured champion', trait: 'Armour cuts 35% of everything; its ground-pound hits up to 4 foes', desc: 'Armour cuts every hit. Its ground-pound hits all round.', row: 'front' },
};

export const PIECE_NAME: Readonly<Record<PieceType, string>> = {
  ...(Object.fromEntries(PET_TYPES.map((p) => [p, PET_INFO[p].name])) as Record<PetType, string>),
  knife: 'Knife',
  bat: 'Bat',
  shield: 'Shield',
  spear: 'Spear',
  helmet: 'Helmet',
  sneakers: 'Sneakers',
  chili: 'Chili',
};

/** One short line shown while a piece is dragged. {v} is replaced by the number for its class. */
export const PIECE_DESC: Readonly<Record<PieceType, string>> = {
  ...(Object.fromEntries(PET_TYPES.map((p) => [p, PET_INFO[p].desc])) as Record<PetType, string>),
  knife: 'Units touching it stab very fast.',
  bat: 'Units touching it swing slow and send foes flying.',
  shield: 'Units touching it block hits and take the heat.',
  spear: 'Units touching it poke from behind the front line.',
  helmet: 'Units touching it get +{v}% health.',
  sneakers: 'Units touching it move +{v}% faster.',
  chili: 'Units touching it hit +{v}% harder.',
};

// ------------------------------------------------------------------ units: the twelve-rung ladder

/** The top rung. Two x4 squads of a unit evolve into one x1 of the next rung's unit; two x4 Boulders cannot fuse. */
export const MAX_RUNG = 12;
/** A unit's rung, 1..12. */
export const rungOf = (p: PetType) => PET_TYPES.indexOf(p) + 1;
/** The unit on a rung (undefined outside 1..12). */
export const petAt = (rung: number): PetType | undefined => PET_TYPES[rung - 1];
/** The unit one rung up, or null at the top. */
export const nextPet = (p: PetType): PetType | null => petAt(rungOf(p) + 1) ?? null;
/**
 * The item-style tier (1..7 = E..SSS) a rung looks like: tile frames, classFx, a unit's natural kit, the reveal
 * sound. Rung 1..12 -> E D D C C B B A A S S SSS.
 */
export const tierOf = (rung: number) => Math.max(1, Math.min(MAX_LEVEL, Math.round(1 + ((rung - 1) * 6) / 11)));
/** The tier of a unit's rung (see tierOf). */
export const petTier = (p: PetType) => tierOf(rungOf(p));

/** How a unit gets about. The simulator walks every style but 'hop' and 'leap' (hops) and 'fly' (over its own side). */
export type MoveStyle = 'scurry' | 'fly' | 'dart' | 'glide' | 'hop' | 'scuttle' | 'leap' | 'roll' | 'creep' | 'slide' | 'charge' | 'plod';

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
  /** what its trait and body are worth in squadPower (fitted against its ladder neighbours, docs/pets.md 4.2) */
  power: number;
}

/**
 * Every unit doubles the POWER of the rung below: hp and damage both double each rung, so kill times hold. A unit
 * piece covers one cell per fighter, so POWER per cell doubles too. These numbers are internal and never shown.
 */
export const PETS: Readonly<Record<PetType, PetDef>> = {
  sprout:  { hp: 58,    dmg: 3.96,  cd: 0.6,  reach: 4,  speed: 56, radius: 16, mass: 1.0, move: 'scurry',  row: 'middle', power: 1.00 },
  buzzy:   { hp: 89,    dmg: 5.54,  cd: 0.5,  reach: 5,  speed: 74, radius: 13, mass: 0.6, move: 'fly',     row: 'back',   power: 1.25 },
  ninja:   { hp: 177,   dmg: 14.6,  cd: 0.45, reach: 3,  speed: 68, radius: 14, mass: 0.8, move: 'dart',    row: 'middle', power: 1.03 },
  snailor: { hp: 413,   dmg: 61,    cd: 1.1,  reach: 4,  speed: 26, radius: 20, mass: 2.4, move: 'glide',   row: 'front',  power: 1.03 },
  roo:     { hp: 862,   dmg: 86.4,  cd: 1.0,  reach: 9,  speed: 40, radius: 24, mass: 2.6, move: 'hop',     row: 'front',  power: 1.15 },
  cacto:   { hp: 1686,  dmg: 146.6, cd: 1.0,  reach: 7,  speed: 48, radius: 23, mass: 2.6, move: 'scuttle', row: 'middle', power: 1.26 },
  pogo:    { hp: 3616,  dmg: 306,   cd: 0.8,  reach: 6,  speed: 46, radius: 21, mass: 1.6, move: 'leap',    row: 'back',   power: 1.06 },
  briar:   { hp: 7846,  dmg: 447,   cd: 0.9,  reach: 4,  speed: 46, radius: 25, mass: 2.6, move: 'roll',    row: 'front',  power: 1.27 },
  angler:  { hp: 15232, dmg: 1400,  cd: 1.1,  reach: 52, speed: 36, radius: 25, mass: 2.2, move: 'creep',   row: 'back',   power: 1.14 },
  sumo:    { hp: 34560, dmg: 2975,  cd: 1.0,  reach: 6,  speed: 34, radius: 28, mass: 3.4, move: 'slide',   row: 'front',  power: 0.99 },
  rhino:   { hp: 65434, dmg: 6103,  cd: 1.3,  reach: 10, speed: 40, radius: 30, mass: 4.2, move: 'charge',  row: 'front',  power: 1.14 },
  boulder: { hp: 97280, dmg: 15421, cd: 1.4,  reach: 6,  speed: 26, radius: 34, mass: 6.0, move: 'plod',    row: 'front',  power: 1.22 },
};

/** Every trait number in one table, so tools/balance.ts can sweep them (docs/pets.md, section 3; rung k there = rung k here). */
export const TRAIT = {
  /** +per damage for each other friendly Sprout within range px, up to max of them */
  sprout: { per: 0.1, max: 3, range: 100 },
  /** a landed sting poisons for poison x its damage, drained over time s; a poison event at most every tickEvent s */
  buzzy: { poison: 0.8, time: 3, tickEvent: 0.5 },
  /** share of hits that miss it */
  ninja: { dodge: 0.3 },
  /** below this share of health it hides for time s: takes this share of damage, regrows regrow x its health, counts as massMul heavier */
  snailor: { below: 0.5, time: 2.5, take: 0.15, regrow: 0.15, massMul: 5 },
  /** + knock on every punch; interrupts the wind-up of foes lighter than interruptMass x its mass, for interrupt s */
  roo: { knock: 30, interruptMass: 0.8, interrupt: 0.2 },
  /** every attack is two jabs of share x the damage */
  cacto: { share: 0.55 },
  /** the opening leap: flight s, lands gap px short; hits foes within splash px, stun s, knock; target score: spread per teammate aimed, side x |dx|; cdLeft of its cooldown left; the landing marker shows warn s before */
  pogo: { flight: 0.8, gap: 2, splash: 30, stun: 0.6, knock: 20, spread: 120, side: 0.3, cdLeft: 0.5, warn: 0.3 },
  /** thorns return thorns x the damage it took */
  briar: { thorns: 0.3 },
  /** hits on foes lighter than pullMass x its mass pull them pull px toward it (the hook) */
  angler: { pull: 28, pullMass: 1.5 },
  /** slides at speed x when its target is over minDist px away, for up to maxTime s; slams the first foe within touch px for slam x damage, knock; shoves others within splash px; stands up standUp s; ready again recharge s after; steer = velocity blend per s */
  sumo: { speed: 3, minDist: 110, maxTime: 1.6, touch: 3, slam: 1.5, knock: 55, splash: 36, standUp: 0.4, recharge: 5, steer: 30 },
  /** after run px walked it is charged: speed x faster; the next strike deals mul x with + knock and a stun of at least stun s */
  rhino: { run: 90, speed: 1.35, mul: 2.5, knock: 70, stun: 0.35 },
  /** armour cuts this share of everything; the stomp hits up to max(stompMax, splash) foes all round */
  boulder: { armour: 0.35, stompMax: 4 },
} as const;

/**
 * A boss (the leader of a CHAMPION match): a giant of a high-rung unit. radius / mass / reach scale its body, hp / dmg its
 * numbers, speed its walk. power is what squadPower counts it as on top of sqrt(hp x dmg) (its big body is easier
 * to surround), fitted by tools/balance.ts.
 */
export const BOSS = { radius: 1.8, mass: 3, reach: 1.5, speed: 0.8, hp: 16, dmg: 0.8, power: 1.55 };

// ------------------------------------------------------------------ weapons

export interface WeaponDef {
  /** x the unit's own damage */
  dmg: number;
  /** x the unit's own attack time */
  cd: number;
  /** px past the unit's body */
  reach: number;
  /** how far a hit shoves the target, px (before mass) */
  knock: number;
  /** x the unit's health */
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

/** A unit with no weapon uses its own attack: the same as a weapon of all 1s. */
export const NO_WEAPON: WeaponDef = { dmg: 1, cd: 1, reach: 0, knock: 14, hp: 1, block: 0, stun: 0, splash: 1, pierce: 1 };

export const WEAPONS: Readonly<Record<WeaponType, WeaponDef>> = {
  knife: { dmg: 1.1, cd: 0.42, reach: 6, knock: 10, hp: 1, block: 0, stun: 0, splash: 1, pierce: 1 },
  bat: { dmg: 2.2, cd: 1.5, reach: 12, knock: 45, hp: 1, block: 0, stun: 0, splash: 3, pierce: 1 },
  shield: { dmg: 1.0, cd: 1.0, reach: 5, knock: 30, hp: 1.1, block: 0.1, stun: 0.06, splash: 1, pierce: 1 },
  spear: { dmg: 1.25, cd: 1.1, reach: 24, knock: 14, hp: 1, block: 0, stun: 0, splash: 1, pierce: 2 },
};

/**
 * What a weapon's class changes: fusing two identical weapons makes it hit harder, faster and hold on longer.
 * Each class is worth x1.112 POWER, split between damage and health, so duels at S and SSS last about as long as at E.
 */
export const WEAPON_CLASS = {
  dmg: 1.1, // x per class
  cd: 0.97, // x per class
  hp: 1.09, // x per class
};

// ------------------------------------------------------------------ gear

/** Bonus in % for each class E..SSS. */
export const GEAR: Readonly<Record<GearType, { stat: string; pct: readonly number[] }>> = {
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
  /** its unit's rung, 1..12 */
  rung: number;
  boss: boolean;
}

/** The numbers of one fighter of a squad. Speed, radius and mass come from the unit (sneakers add speed; a boss is a giant). */
export function unitStats(s: SquadSpec): UnitStats {
  const p = PETS[s.pet];
  const w = s.weapon ? WEAPONS[s.weapon] : NO_WEAPON;
  const wl = s.weapon ? Math.max(1, s.weaponLevel) - 1 : 0;
  const speedUp = gearPct('sneakers', s.sneakers) / 100;
  const boss = !!s.boss;
  return {
    hp: p.hp * w.hp * WEAPON_CLASS.hp ** wl * (1 + gearPct('helmet', s.helmet) / 100) * (boss ? BOSS.hp : 1),
    dmg: p.dmg * w.dmg * WEAPON_CLASS.dmg ** wl * (1 + gearPct('chili', s.chili) / 100) * (boss ? BOSS.dmg : 1),
    cd: (p.cd * w.cd * WEAPON_CLASS.cd ** wl) / (1 + speedUp * SNEAKERS_ATTACK_SHARE),
    reach: (p.reach + w.reach) * (boss ? BOSS.reach : 1),
    speed: p.speed * (1 + speedUp) * (boss ? BOSS.speed : 1),
    radius: p.radius * (boss ? BOSS.radius : 1),
    mass: p.mass * (boss ? BOSS.mass : 1),
    knock: w.knock,
    block: w.block,
    stun: w.stun,
    splash: w.splash,
    pierce: w.pierce,
    move: p.move,
    rung: rungOf(s.pet),
    boss,
  };
}

/**
 * How strong a squad is, as one number (the POWER tab, and what matchmaking matches on).
 * The balance tool keeps this honest: two armies of equal power should win about equally often.
 */
export function squadPower(s: SquadSpec): number {
  const u = unitStats(s);
  const toughness = u.hp / (1 - u.block);
  const dps = (u.dmg / u.cd) * (1 + 0.25 * (u.splash - 1)) * (1 + 0.2 * (u.pierce - 1)) * (1 + 2 * u.stun);
  const one = Math.sqrt(toughness * dps) * PETS[s.pet].power * (u.boss ? BOSS.power : 1);
  return one * s.count ** POWER.countExp * POWER.scale;
}
export const POWER = { scale: 0.6, countExp: 1 };

export const armyPower = (squads: readonly SquadSpec[]) => Math.round(squads.reduce((a, s) => a + squadPower(s), 0));

/** POWER as the UI shows it: 950, 12.3k, 1.61M. */
export function formatPower(p: number): string {
  const v = Math.round(p);
  if (v < 10000) return String(v);
  if (v < 1e6) return `${(v / 1000).toFixed(v < 1e5 ? 1 : 0)}k`;
  return `${(v / 1e6).toFixed(v < 1e7 ? 2 : 1)}M`;
}

// ------------------------------------------------------------------ the fight

/** The arena in the simulator's own pixels. You hold the bottom (the blue corner), the opponent the top (red). */
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

/**
 * Critical hits: a hit that lands (not dodged; not thorns or poison) is a crit with this chance and deals mul x.
 * Decided by a seeded hash of the fight, the step, the attacker, the victim and the hit, so it is deterministic and
 * never depends on the order units are looked at. Both teams roll the same odds.
 */
export const CRIT = { chance: 0.08, mul: 1.6 };

// ------------------------------------------------------------------ matched fights

/** Rounds to 2 significant figures (3 from 1000), so the numbers on buttons look friendly. */
export const friendly = (p: number) => {
  if (p <= 0) return 0;
  const digits = p >= 1000 ? 3 : 2;
  const k = 10 ** (Math.floor(Math.log10(p)) - digits + 1);
  return Math.max(1, Math.round(p / k) * k);
};

/**
 * Matchmaking (src/logic/match.ts): BATTLE finds a bot whose army is built to the player's. Its POWER is the
 * player's x difficulty(): `intro[n]` for the first fights (so the starter army wins them), else `base`; minus
 * `slump` per loss in a row (at most slumpMax), plus `hot` per win in the streak beyond the first (at most hotMax),
 * never below `floor`. Its fighters are about the player's (the theme scales them), at most maxSquads squads.
 */
export const MATCH = {
  base: 0.9,
  intro: [0.6, 0.72, 0.82] as readonly number[],
  slump: 0.08,
  slumpMax: 4,
  hot: 0.025,
  hotMax: 4,
  floor: 0.55,
  /** the army's POWER lands within this share of its target */
  tolerance: 0.06,
  maxSquads: 8,
  /** never more fighters than a full 5 x 5 grid holds */
  maxFighters: 25,
};

/** Every `every`-th match is a CHAMPION match: a boss (SquadSpec.boss) leads a tougher team (power x the usual), for `rewards` x the rewards. */
export const CHAMPION = {
  every: 5,
  power: 1.1,
  /** the share of the champion team's POWER that is the boss */
  bossPart: 0.5,
  /** the escort: this share of the player's fighters (the boss comes on top) */
  escort: 0.6,
  rewards: 2,
};
/** true when match number n (1 = the first match) is a champion match. */
export const isChampionMatch = (n: number) => n >= CHAMPION.every && n % CHAMPION.every === 0;

/**
 * The opponent themes, so fights stay interesting. fighters: x the player's fighter count; rungs: where its units
 * sit against the player's own (-1 a rung lower ...); kit: the kit it favours. weight: how often it comes up.
 */
export type ThemeId = 'mixed' | 'swarm' | 'heavy' | 'glass' | 'tanks' | 'mirror' | 'champion';
export interface ThemeDef {
  name: string;
  /** one line for the matchmaking card */
  blurb: string;
  fighters: number;
  weight: number;
}
export const THEMES: Readonly<Record<ThemeId, ThemeDef>> = {
  mixed: { name: 'Mixed', blurb: 'A bit of everything', fighters: 1, weight: 3 },
  swarm: { name: 'Swarm', blurb: 'Lots of little fighters', fighters: 1.75, weight: 2 },
  heavy: { name: 'Heavy Hitters', blurb: 'A few big bruisers', fighters: 0.5, weight: 2 },
  glass: { name: 'Glass Cannons', blurb: 'Hit hard, fall fast', fighters: 1, weight: 2 },
  tanks: { name: 'Tanks', blurb: 'Shields up, hard to knock down', fighters: 1, weight: 2 },
  mirror: { name: 'Mirror', blurb: 'Your own lineup!', fighters: 1, weight: 1.5 },
  champion: { name: 'Champion', blurb: 'A crowned champion and its crew', fighters: 1, weight: 0 },
};
/** The themes a normal match picks from, in a fixed order. */
export const MATCH_THEMES: readonly ThemeId[] = ['mixed', 'swarm', 'heavy', 'glass', 'tanks', 'mirror'];

/** Fun bot names (the UI shows a BOT tag next to them: bots must be clearly AI). Champions take CHAMPION_NAMES. */
export const BOT_NAMES = {
  first: ['Punchy', 'Rumble', 'Jab', 'Bonk', 'Knuckle', 'Thunder', 'Turbo', 'Sir', 'Captain', 'Lil', 'Big', 'Mighty', 'Fuzzy', 'Banana', 'Bouncy', 'Sneaky', 'Wobbly', 'Grumpy'],
  last: ['Panda', 'Koala', 'Gloves', 'Hooks', 'Paws', 'Bean', 'Noodle', 'Potato', 'Pickle', 'Muffin', 'Badger', 'Wombat', 'Mango', 'Turnip', 'Pretzel', 'Waffle', 'Jabsalot', 'Uppercut'],
};
export const CHAMPION_NAMES: readonly string[] = [
  'King Knockout', 'The Golden Glove', 'Iron Belly', 'Champ Kong', 'Big Belt Bertha', 'The Undefeated', 'Mister Uppercut', 'Queen of the Ring',
];

// ------------------------------------------------------------------ rewards and the player level

/**
 * What a match pays (applyMatch in src/logic/progress.ts). A win: win + winPerLevel x (level - 1) cash, plus every
 * knock-out (ko + koPerLevel x (level - 1), rounded down; the boss counts bossKo), plus a streak bonus of streak x
 * the base for each win in the streak beyond the first (at most streakMax); XP xpWin + xpKo per knock-out; gems
 * (gems[0]..gems[1]) with gemChance. A loss: loss + lossPerLevel x (level - 1) cash plus the knock-outs, xpLoss +
 * xpKo per knock-out; nothing is taken away. A champion win pays CHAMPION.rewards x the cash and XP, and always
 * champGems + floor(level / champGemsLevels) gems.
 */
export const REWARD = {
  win: 10,
  winPerLevel: 3,
  loss: 4,
  lossPerLevel: 1,
  ko: 2,
  koPerLevel: 0.5,
  bossKo: 5,
  streak: 0.2,
  streakMax: 5,
  xpWin: 25,
  xpLoss: 10,
  xpKo: 1,
  gemChance: 0.3,
  gems: [1, 2] as readonly [number, number],
  champGems: 5,
  champGemsLevels: 3,
};
export const winCash = (level: number) => REWARD.win + REWARD.winPerLevel * (Math.max(1, level) - 1);
export const lossCash = (level: number) => REWARD.loss + REWARD.lossPerLevel * (Math.max(1, level) - 1);
/** Cash for one enemy knocked out at this level (a boss counts REWARD.bossKo). */
export const koCash = (level: number) => Math.floor(REWARD.ko + REWARD.koPerLevel * (Math.max(1, level) - 1));
/** The win-streak bonus on a win that makes the streak this long (0 for a streak of 1). */
export const streakCash = (level: number, streak: number) =>
  Math.round(winCash(level) * REWARD.streak * Math.max(0, Math.min(REWARD.streakMax, streak - 1)));
/** Gems for a champion win at this level. */
export const champGems = (level: number) => REWARD.champGems + Math.floor(Math.max(1, level) / REWARD.champGemsLevels);

/** The player level: from level L to L + 1 takes base + step x (L - 1) XP. */
export const LEVEL = { base: 50, step: 25, max: 99 };
/** XP from this level to the next. */
export const xpToNext = (level: number) => LEVEL.base + LEVEL.step * (Math.max(1, level) - 1);
/** Total XP from level 1 to reach this level. */
export const xpForLevel = (level: number) => {
  let t = 0;
  for (let l = 1; l < Math.min(LEVEL.max, Math.max(1, level)); l++) t += xpToNext(l);
  return t;
};
/** The level a version-4 save's stage maps to (so its case odds and its level cells carry over). */
export const levelForStage = (stage: number) => {
  const s = Math.max(1, Math.floor(stage));
  return Math.min(LEVEL.max, Math.max(1, 2 * s - 1 - Math.floor((s - 1) / 4)));
};

// ------------------------------------------------------------------ the economy

export const ECON = {
  /** a new save: enough cash for the guide's first three cases */
  startCash: 30,
  startGems: 5,
  /** CASE price: caseCost + floor(caseStep x CASEs opened) */
  caseCost: 9,
  caseStep: 0.6,
  /** ELITE price in gems */
  eliteCost: 6,
};
/** TRASH: a weapon or gear sells for this by class; a unit for its rung x its count. */
export const ITEM_SELL: readonly number[] = [1, 2, 4, 6, 10, 16, 25];
export const sellValue = (p: { type: PieceType; level: number; count: number }) =>
  isPet(p.type) ? rungOf(p.type) * p.count : ITEM_SELL[Math.max(1, Math.min(MAX_LEVEL, p.level)) - 1];

// ------------------------------------------------------------------ cases

/** Share of rolls that give each kind of piece (they sum to 100). A unit roll then picks a rung (petOdds). */
export const ROLL_KIND_ODDS: Readonly<Record<'pet' | WeaponType | GearType, number>> = {
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
 * A unit roll's rung weighs PET_ODDS_STEP.up ^ (rung - home) above the level's home rung and PET_ODDS_STEP.down ^
 * (home - rung) below it. The up step must stay steep (well under 1/8), so evolving stays the main way up.
 */
export const PET_ODDS_STEP = { up: 0.2, down: 0.3 };
/** The home rung of a CASE's unit at this player level (an ELITE's is ELITE_RUNG higher): 1 at level 1, then up by perLevel, at most max. */
export const PET_HOME = { start: 1, perLevel: 0.2, max: 10 };
export const ELITE_RUNG = 1.5;
export const homeRung = (level: number, elite = false) =>
  Math.min(PET_HOME.max, PET_HOME.start + PET_HOME.perLevel * (Math.max(1, level) - 1)) + (elite ? ELITE_RUNG : 0);
/** The % chance of each rung 1..12 on a unit roll around this home rung (sums to 100; an ELITE never gives rung 1). */
export function petOdds(home: number, elite = false): number[] {
  const w = PET_TYPES.map((_, i) => {
    const rung = i + 1;
    if (elite && rung === 1) return 0;
    return rung >= home ? PET_ODDS_STEP.up ** (rung - home) : PET_ODDS_STEP.down ** (home - rung);
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / sum) * 100);
}
/** A pity unit is this many rungs above ceil(home), at these % (capped at the top rung). */
export const PITY_PET = { above: [2, 3, 4] as const, odds: [88, 10.5, 1.5] as const };
/** The lowest rung that counts as a top unit around this home: rolling one resets the pity counter. */
export const pityRung = (home: number) => Math.ceil(home) + PITY_PET.above[0];

/** Chance (in %) of each class E..SSS of a CASE's weapon or gear: the row for the level (row = floor((level - 1) / CLASS_ODDS_LEVELS), at most the last). */
export const ROLL_CLASS_ODDS: readonly (readonly number[])[] = [
  [70, 22, 6.4, 1.3, 0.25, 0.04, 0.01],
  [62, 26, 8.8, 2.5, 0.55, 0.12, 0.03],
  [54, 29, 11.5, 4, 1.2, 0.24, 0.06],
  [46, 31, 14.5, 6, 2, 0.4, 0.1],
  [38, 32, 18, 8.4, 2.9, 0.55, 0.15],
  [30, 32, 21.5, 11, 4.4, 0.85, 0.25],
  [22, 31, 24.5, 14.5, 6.3, 1.3, 0.4],
];
export const CLASS_ODDS_LEVELS = 6;
/** The class odds of a CASE at this player level; an ELITE's are one class better (never E). */
export function classOdds(level: number, elite = false): number[] {
  const row = ROLL_CLASS_ODDS[Math.min(ROLL_CLASS_ODDS.length - 1, Math.floor((Math.max(1, level) - 1) / CLASS_ODDS_LEVELS))];
  if (!elite) return [...row];
  const out = [0, ...row.slice(0, MAX_LEVEL - 1)];
  out[MAX_LEVEL - 1] += row[MAX_LEVEL - 1];
  return out;
}
/** A-class or better: what a guaranteed (pity) item roll picks from. */
export const TOP_ODDS: readonly number[] = [0, 0, 0, 0, 88, 10.5, 1.5];
/** The case after this many in a row without an A-class item or a top unit is guaranteed one. */
export const PITY = 25;

/** The first cases of a new player are fixed, so the guide can teach fusing (Pea + Pea -> x2). */
export const SCRIPTED_ROLLS: readonly { type: PieceType; level: number }[] = [
  { type: 'sprout', level: 1 },
  { type: 'chili', level: 1 },
  { type: 'sprout', level: 1 },
];

/** What a new player starts with, on the bench. */
export const STARTER_KIT: readonly { type: PieceType; level: number }[] = [
  { type: 'sprout', level: 1 },
  { type: 'knife', level: 1 },
  { type: 'helmet', level: 1 },
];

/** Seconds of untouched prep before AUTO starts the next match. */
export const AUTO_START = 3;

export const TUTORIAL_DONE = 99;
