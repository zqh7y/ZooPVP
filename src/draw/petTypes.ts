import type { PetType, Team, WeaponType } from '../types';

/*
 * How the rest of the game asks for a pet to be drawn. A pet is drawn from the side, standing on the ground
 * at the origin, and is fully posable: everything that happens to it in a fight (walking, hopping, swinging,
 * flinching, and all the ways it can die) is a number in PetPose, so the same drawing serves the lobby, the
 * fight and the death animations.
 */

/** What a fighter is: this does not change while it lives. */
export interface PetLook {
  pet: PetType;
  /** class 1..7 (E..SSS): higher classes are fancier (markings, spikes, a crown, an aura); size is the caller's `r` */
  level: number;
  /** 0 = yours (blue accents), 1 = the opponent's (red accents). Whose it is must read at a glance, even tiny. */
  team: Team;
  weapon: WeaponType | null;
  /** class of the weapon it holds, 0 when none */
  weaponLevel: number;
  /** class of the gear it wears, 0 = none. A helmet sits on its head, sneakers on its feet, chili makes it fiery. */
  helmet: number;
  sneakers: number;
  chili: number;
  /** a small number that makes two fighters of the same kind differ a little (a marking, an eye, a tilt) */
  seed: number;
}

export type PetMood = 'idle' | 'angry' | 'hurt' | 'dizzy' | 'cheer' | 'scared' | 'dead';

/** What the fighter is doing right now. Every field has a resting value, given by restPose(). */
export interface PetPose {
  /** seconds: drives breathing, blinking, antenna and ear wobble */
  t: number;
  /** 1 = looks right, -1 = looks left */
  face: 1 | -1;
  /** distance walked in px: drives the leg cycle */
  walk: number;
  /** 0..1: how much it is walking (0 = standing) */
  moving: number;
  /** 0..1: height of a hop (the frog's way of moving): the body lifts and stretches, the shadow stays down */
  hop: number;
  /** 0..1: drawing the weapon (or its jaws, or its tongue) back before a strike */
  wind: number;
  /** 1 at the moment the strike lands, fading to 0 as it recovers: the swing follows through */
  strike: number;
  /** -1..1: the strike aims up (-1) or down (1) the screen rather than straight ahead */
  aimY: number;
  /** 1 when just hit, fading to 0: a flinch and a white flash */
  hurt: number;
  /** body scale about the feet, 1 = none (0.2 high and 1.8 wide = squashed flat) */
  squashX: number;
  squashY: number;
  /** 0..1.5: blown up like a balloon: the body swells round, limbs splay, eyes bulge, the skin goes tight and shiny */
  puff: number;
  /** radians: the whole body turned about its middle (tumbling through the air) */
  spin: number;
  /** 0..1: turned to grey stone (before it shatters) */
  stone: number;
  /** 0..1: let down like a balloon: wrinkled, limp, thin */
  limp: number;
  mood: PetMood;
  /** 0..1 */
  alpha: number;
}

export const restPose = (): PetPose => ({
  t: 0,
  face: 1,
  walk: 0,
  moving: 0,
  hop: 0,
  wind: 0,
  strike: 0,
  aimY: 0,
  hurt: 0,
  squashX: 1,
  squashY: 1,
  puff: 0,
  spin: 0,
  stone: 0,
  limp: 0,
  mood: 'idle',
  alpha: 1,
});

/** What the pets module provides (src/draw/pets.ts). */
export interface PetArt {
  /**
   * Draws the pet with its feet on the origin (0, 0), facing pose.face. r is its body radius in px (the
   * fight passes the simulator's radius; the lobby passes something larger). Draws the weapon it holds and the
   * gear it wears. Does not draw a ground shadow (see drawShadow).
   */
  drawPet(ctx: CanvasRenderingContext2D, look: PetLook, pose: PetPose, r: number): void;
  /** The soft shadow under a pet, at the origin. Shrinks as it hops or flies (lift = 0..1+). */
  drawShadow(ctx: CanvasRenderingContext2D, look: PetLook, r: number, lift: number): void;
  /**
   * The pet as a picture, for effects that cut or break it (sliced in two, shattered). Returns the canvas and
   * where the pet's feet are in it. scale = device pixels per logical pixel.
   */
  snapshot(look: PetLook, pose: PetPose, r: number, scale: number): { canvas: HTMLCanvasElement; ox: number; oy: number; w: number; h: number };
  /** Where the top of the head is above the feet, in px, for a body radius r (hp bars and markers sit above it). */
  headTop(look: PetLook, r: number): number;
}
