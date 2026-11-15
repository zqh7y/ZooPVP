import type { GearType, PetType, Team, WeaponType } from '../../types';

/*
 * The shape every art-style sample (style1..style5) has, so the one the player picks can replace the live pet,
 * weapon and gear art without changing its callers' idea of what to ask for. Samples only: the game does not
 * import these yet.
 */
export type Pose = 'idle' | 'attack' | 'hit';
export type ItemType = WeaponType | GearType;

export interface PetOpts {
  /** the weapon it holds, or none */
  weapon?: WeaponType | null;
  /** wears the helmet */
  helmet?: boolean;
  /** 1 = looks right (default), -1 = looks left */
  face?: 1 | -1;
}

export interface ArtStyle {
  NAME: string;
  /** one line on what the style is */
  BLURB: string;
  /**
   * A pet standing on the grass. (x, y) is the ground point under its body (where its shadow sits), r its fight
   * radius (ant 16 / frog 26 at game size; the sheet also draws them at about 50-60). Draws its own shadow.
   * t is seconds, for idle breathing / blinking; pose 'attack' is the moment of the lunge, 'hit' the flinch.
   */
  drawPet(ctx: CanvasRenderingContext2D, type: PetType, team: Team, x: number, y: number, r: number, pose: Pose, t: number, o?: PetOpts): void;
  /** An item's icon centred at (x, y), fitting a size x size box (the lobby tile is drawn by the caller). */
  drawItem(ctx: CanvasRenderingContext2D, type: ItemType, x: number, y: number, size: number): void;
}
