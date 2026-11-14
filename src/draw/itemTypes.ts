import type { GearType, WeaponType } from '../types';

/*
 * How the rest of the game asks for a weapon or a piece of gear to be drawn. The same drawing is used in a
 * pet's hands (or on its head and feet) and on the piece's tile in the lobby, so a knife is always the same
 * knife. Higher classes look richer (better metal, the class colour, a glow at S, a rainbow sheen at SSS).
 */
export interface ItemArt {
  /**
   * A weapon drawn upright with its grip at the origin and its business end pointing up (-y), `len` px long
   * from the bottom of the grip to the tip. The shield is drawn facing the viewer, centred on the origin,
   * `len` px tall. t (seconds) animates the shine of high classes.
   */
  drawWeapon(ctx: CanvasRenderingContext2D, type: WeaponType, level: number, len: number, t?: number): void;
  /**
   * Gear drawn centred on the origin, fitting a box `size` px across.
   * helmet: seen from the side, facing right, open at the bottom, so it can be set on a head.
   * sneakers: one shoe from the side, toe to the right, its sole on y = +size/2.
   * chili: one pepper.
   */
  drawGear(ctx: CanvasRenderingContext2D, type: GearType, level: number, size: number, t?: number): void;
}
