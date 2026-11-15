/*
 * The shared vocabulary of the game: pieces, the saved state, and the army a grid produces.
 * Everything here is plain data (no drawing, no browser APIs) so the fight simulator and the balance
 * tools can use it headless.
 */

/** 0 = you (the bottom of the arena, blue), 1 = the opponent (the top, red). */
export type Team = 0 | 1;

/** The twelve units, one per rung of the ladder (see PET_TYPES in data.ts for the order: sprout is rung 1, boulder 12). */
export type PetType =
  | 'sprout' | 'buzzy' | 'ninja' | 'snailor' | 'roo' | 'cacto'
  | 'pogo' | 'briar' | 'angler' | 'sumo' | 'rhino' | 'boulder';
export type WeaponType = 'knife' | 'bat' | 'shield' | 'spear';
export type GearType = 'helmet' | 'sneakers' | 'chili';
export type PieceType = PetType | WeaponType | GearType;
export type PieceKind = 'pet' | 'weapon' | 'gear';

/**
 * One piece the player owns. Weapons and gear cover one cell; a pet covers 1, 2 or 4 cells by its count (see
 * footprint() in data.ts), with col / row its top-left cell.
 * - level: for a weapon or gear it is its class, 1..7 = E, D, C, B, A, S, SSS. A pet has no class (its rung comes
 *   from its type, see rungOf in data.ts): its level is always 1, kept only so the save keeps its shape.
 * - count is how many fighters a pet piece sends (1, 2 or 4); always 1 for weapons and gear.
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
  /**
   * Only for a pet of count 2 (it covers two cells): false = lying across (2 wide, 1 tall), true = standing up
   * (1 wide, 2 tall). Ignored for every other piece. See footprint() in data.ts.
   */
  turned?: boolean;
}

/** One group of identical fighters: what a pet piece on the grid becomes, with everything it touches. */
export interface SquadSpec {
  /** id of the pet piece it comes from (0 for a bot's squads). */
  key: number;
  /** the pet (its rung on the ladder comes from it: rungOf in data.ts) */
  pet: PetType;
  /** fighters in the squad: 1, 2 or 4 (more only in tools and tests) */
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
  /** the class of a weapon or gear (1..7); always 1 for a pet */
  level: number;
  /** true when it came from the guaranteed (pity) roll */
  pity: boolean;
  /** true for a trophy-road pet handed out like a roll (it spends no roll) */
  gift?: boolean;
  /** true when it is a pet the player has never owned before (show the NEW PET reveal) */
  fresh?: boolean;
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
  /** both armies fell in the same step with exactly equal health left: no trophies either way */
  draw: boolean;
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
  /** 3 since the twelve-pet ladder; an older save is replaced by a fresh start */
  version: 3;
  name: string;
  trophies: number;
  bestTrophies: number;
  /** rolls waiting to be opened */
  rolls: number;
  /** the roll meter: the share (0..1) of the next roll already earned by knock-outs */
  rollMeter: number;
  /** rolls opened since the last A-class item or high pet (the guaranteed roll counts up on it) */
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
  /** trophy-road pets waiting to be opened on the roll screen (they spend no roll) */
  gifts: PetType[];
  /** bitmask of the rungs ever owned (bit rung - 1): the NEW PET reveal shows the first time a bit is set */
  seen: number;
  /** bitmask of the one-time tips already shown */
  tips: number;
  /** evolves done so far (two x4 squads into the next rung's pet) */
  evolves: number;
}

/** The ways a fighter can die. Chosen by the battle view from the pet and the weapon that killed it. */
export type DeathKind = 'pop' | 'squish' | 'launch' | 'slice' | 'spin' | 'deflate' | 'shatter' | 'petals';
