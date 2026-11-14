/*
 * The shared vocabulary of the game: pieces, the saved state, and the army a grid produces.
 * Everything here is plain data (no drawing, no browser APIs) so the fight simulator and the balance
 * tools can use it headless.
 */

/** 0 = you (the bottom of the arena, blue), 1 = the opponent (the top, red). */
export type Team = 0 | 1;

export type PetType = 'ant' | 'frog';
export type WeaponType = 'knife' | 'bat' | 'shield' | 'spear';
export type GearType = 'helmet' | 'sneakers' | 'chili';
export type PieceType = PetType | WeaponType | GearType;
export type PieceKind = 'pet' | 'weapon' | 'gear';

/**
 * One piece the player owns. Every piece is one cell (1x1).
 * - level is its class: 1..7 = E, D, C, B, A, S, SSS.
 * - count is how many fighters a pet piece sends (1, 2, 4 or 8); always 1 for weapons and gear.
 * - on the grid: col/row are its cell and slot is -1. On the bench: slot is its bench slot and col/row are -1.
 */
export interface Piece {
  id: number;
  type: PieceType;
  level: number;
  count: number;
  col: number;
  row: number;
  slot: number;
}

/** One group of identical fighters: what a pet piece on the grid becomes, with everything it touches. */
export interface SquadSpec {
  /** id of the pet piece it comes from (0 for a bot's squads). */
  key: number;
  pet: PetType;
  /** the pet's class, 1..7 */
  level: number;
  /** fighters in the squad: 1, 2, 4 or 8 */
  count: number;
  /** the best weapon the pet touches, or null (it bites) */
  weapon: WeaponType | null;
  /** class of that weapon, 0 when none */
  weaponLevel: number;
  /** class of the best touching gear of each kind, 0 when none */
  helmet: number;
  sneakers: number;
  chili: number;
}

export interface ArmySpec {
  squads: SquadSpec[];
}

/** A link the lobby draws between two touching cells (a pet and something that boosts it). */
export interface LinkEdge {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
  /** true when this is the link the pet actually uses (its best weapon, its best gear of that kind) */
  active: boolean;
}

/** What one roll gave. */
export interface RollResult {
  type: PieceType;
  level: number;
  /** true when it came from the guaranteed (pity) roll */
  pity: boolean;
}

/** The opponent a match is played against. Always a bot, and always shown with a BOT tag. */
export interface Opponent {
  name: string;
  trophies: number;
  army: ArmySpec;
  power: number;
  /** seed of the fight, so a match can be replayed exactly */
  seed: number;
}

/** What a finished match gives. */
export interface MatchResult {
  won: boolean;
  /** signed trophy change */
  trophies: number;
  kills: number;
  /** fighters you lost */
  losses: number;
  /** rolls earned this match (kills banked through the roll meter + the win bonus) */
  rolls: number;
  /** seconds the fight took */
  time: number;
  /** league index after the match when it went up, else -1 */
  leagueUp: number;
}

/** Everything that is saved between sessions. */
export interface SaveState {
  version: 1;
  name: string;
  trophies: number;
  bestTrophies: number;
  /** rolls waiting to be opened */
  rolls: number;
  /** the roll meter: the share (0..1) of the next roll already earned by knock-outs */
  rollMeter: number;
  /** rolls opened since the last A-class or better (the guaranteed roll counts up on it) */
  pity: number;
  /** rolls opened in total (the first ones are scripted by the guide) */
  rolled: number;
  pieces: Piece[];
  nextId: number;
  matches: number;
  wins: number;
  /** wins in a row (positive) or defeats in a row (negative) */
  streak: number;
  /** step of the first-time guide; TUTORIAL_DONE once finished */
  tutorial: number;
  /** trophy-road rewards already collected (index into TROPHY_ROAD) */
  claimed: number;
  /** advances every match, so opponents differ from match to match but are repeatable */
  seed: number;
}

/** The ways a fighter can die. Chosen by the battle view from the pet and the weapon that killed it. */
export type DeathKind = 'pop' | 'squish' | 'launch' | 'slice' | 'spin' | 'deflate' | 'shatter' | 'petals';
