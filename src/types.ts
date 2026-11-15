/*
 * The shared vocabulary of the game: pieces, the saved state, and the army a grid produces.
 * Everything here is plain data (no drawing, no browser APIs) so the fight simulator and the balance
 * tools can use it headless.
 */

/** 0 = you (the bottom of the arena, blue), 1 = the enemy wave (the top, red). */
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
 * One piece the player owns. Weapons and gear cover one cell; a unit covers 1, 2 or 4 cells by its count (see
 * footprint() in data.ts), with col / row its top-left cell.
 * - level: for a weapon or gear it is its class, 1..7 = E, D, C, B, A, S, SSS. A unit has no class (its rung comes
 *   from its type, see rungOf in data.ts): its level is always 1, kept only so the save keeps its shape.
 * - count is how many fighters a unit piece sends (1, 2 or 4); always 1 for weapons and gear.
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
   * Only for a unit of count 2 (it covers two cells): false = lying across (2 wide, 1 tall), true = standing up
   * (1 wide, 2 tall). Ignored for every other piece. See footprint() in data.ts.
   */
  turned?: boolean;
}

/** One group of identical fighters: what a unit piece on the grid becomes, with everything it touches. */
export interface SquadSpec {
  /** id of the unit piece it comes from (0 for an enemy wave's squads) */
  key: number;
  /** the unit (its rung on the ladder comes from it: rungOf in data.ts) */
  pet: PetType;
  /** fighters in the squad: 1, 2 or 4 (more only in tools and tests) */
  count: number;
  /** the best weapon the unit touches, or null (it uses its own attack) */
  weapon: WeaponType | null;
  /** class of that weapon, 0 when none */
  weaponLevel: number;
  /** class of the best touching gear of each kind, 0 when none */
  helmet: number;
  sneakers: number;
  chili: number;
  /** a boss (wave 10): a giant of its unit, BOSS.radius x its size, with much more health and a harder hit */
  boss?: boolean;
}

export interface ArmySpec {
  squads: SquadSpec[];
}

/** A link the lobby draws between two touching cells (a unit and something that boosts it). */
export interface LinkEdge {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
  /** true when this is the link the unit actually uses (its best weapon, its best gear of that kind) */
  active: boolean;
}

/** CASE costs cash; ELITE costs gems (never E-class items, units a step up the ladder). */
export type CaseKind = 'case' | 'elite';

/** What one opened case gave. The piece is already on the bench when this comes back. */
export interface RollResult {
  case: CaseKind;
  type: PieceType;
  /** the class of a weapon or gear (1..7 = E..SSS); always 1 for a unit */
  level: number;
  /** a unit's rung (1..12); 0 for a weapon or gear */
  rung: number;
  /** true when it came from the guaranteed (pity) roll */
  pity: boolean;
  /** true when it is a unit the player has never owned before (show the NEW UNIT reveal) */
  fresh: boolean;
  /** what it cost: cash for a CASE, gems for an ELITE */
  price: number;
  /** the new piece (on the bench) */
  piece: Piece;
}

/** How a fought wave went, as applyWave reads it (outcomeOf in src/logic/progress.ts makes one from a SimSummary). */
export interface WaveOutcome {
  won: boolean;
  /** enemy fighters knocked out (the boss included) */
  kos: number;
  /** the boss was knocked out */
  boss: boolean;
  /** share of your fighters still standing at the end, 0..1 (gives the stage-clear stars) */
  survived: number;
}

/** What applyWave gave. */
export interface WaveResult {
  won: boolean;
  /** the wave that was fought */
  stage: number;
  wave: number;
  /** cash for the knock-outs (paid win or lose) */
  koCash: number;
  /** cash for clearing the wave (0 on a loss) */
  clearCash: number;
  /** koCash + clearCash */
  cash: number;
  /** wave 10 won: the stage is cleared */
  stageClear: boolean;
  /** 1..3 on a stage clear, else 0 */
  stars: number;
  /** gems earned (stage clears) */
  gems: number;
  /** grid cells this opened (by reaching a stage or by knock-outs), for a reveal */
  cells: { col: number; row: number }[];
  /** where the player is now (the next wave to fight) */
  next: { stage: number; wave: number };
}

/** Everything that is saved between sessions. */
export interface SaveState {
  /** 4 since stages and waves; any older save is replaced by a fresh start */
  version: 4;
  cash: number;
  gems: number;
  /** the stage being played, 1.. */
  stage: number;
  /** the next wave to fight in it, 1..WAVES (WAVES is the boss wave) */
  wave: number;
  /** losses in a row on this wave (a retry rolls a new, slightly softer army: ENEMY.mercy) */
  tries: number;
  /** best stars of each stage cleared: stars[stage - 1] = 1..3 */
  stars: number[];
  /** CASEs opened (the CASE price climbs with it) */
  cases: number;
  /** ELITEs opened */
  elites: number;
  /** cases opened since the last A-class item or top unit (the guaranteed roll counts up on it) */
  pity: number;
  /** cases of both kinds opened in total (the first ones are scripted by the guide) */
  rolled: number;
  /** bitmask of the open grid cells (bit row * GRID.cols + col); the middle 3 x 3 is open from the start */
  open: number;
  /** cells bought with cash (the next one costs more) */
  cellBuys: number;
  /** enemy fighters knocked out in total (some cells open on these) */
  kos: number;
  /** bitmask of the rungs ever owned (bit rung - 1): the NEW UNIT reveal shows the first time a bit is set */
  owned: number;
  /** evolves done so far (two x4 squads into the next rung's unit) */
  evolves: number;
  /** AUTO: the wave starts by itself after a few untouched seconds of prep */
  auto: boolean;
  /** step of the first-time guide; TUTORIAL_DONE once finished */
  tutorial: number;
  /** bitmask of the one-time tips already shown */
  tips: number;
  /** waves fought and won in total */
  fights: number;
  wins: number;
  /** this save's own seed: the waves' armies, the rolls and the fights come from it */
  seed: number;
  pieces: Piece[];
  nextId: number;
}

/** The ways a fighter can die. Chosen by the battle view from the unit and the weapon that killed it. */
export type DeathKind = 'pop' | 'squish' | 'launch' | 'slice' | 'spin' | 'deflate' | 'shatter' | 'petals';
