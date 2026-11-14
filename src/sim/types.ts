import type { PetType, SquadSpec, Team, WeaponType } from '../types';

/*
 * What the fight simulator shows the rest of the game. The simulator is pure and deterministic: the same
 * two armies and seed always give the same fight, with or without a screen. The battle view only reads units
 * and events; it never changes them.
 */

export type UnitPhase =
  | 'wait' // lined up, before the fight starts
  | 'move' // walking (or hopping) toward its target
  | 'windup' // drawing back for an attack
  | 'recover' // following through after the strike
  | 'stun'; // knocked silly

export interface SimUnit {
  id: number;
  team: Team;
  /** index of its squad in its army */
  squad: number;
  spec: SquadSpec;
  pet: PetType;
  weapon: WeaponType | null;

  /** position in arena pixels (0..ARENA.w, 0..ARENA.h); y grows downward, team 0 starts at the bottom */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** body radius, px */
  r: number;
  /** which way it looks: 1 = right, -1 = left */
  face: 1 | -1;
  /** the direction it is heading or attacking in, radians */
  aim: number;

  hp: number;
  maxHp: number;
  alive: boolean;

  phase: UnitPhase;
  /** seconds spent in the current phase */
  phaseT: number;
  /** length of the current phase in seconds, when it has one (windup, recover, stun), else 0 */
  phaseDur: number;
  /** id of the unit it is going for, or -1 */
  target: number;
  /** a frog's hop: 0 on the ground, up to 1 at the top of the hop (ants stay 0) */
  hop: number;
  /** distance walked, px (drives leg animation) */
  walked: number;
  /** seconds since it was last hit (large when never) */
  sinceHit: number;
  /** the direction the last hit pushed it in, radians */
  hitDir: number;
}

export type SimEvent =
  /** the fight starts (the countdown is over) */
  | { type: 'start' }
  /** a unit begins an attack (its weapon draws back) */
  | { type: 'windup'; unit: number }
  /** the attack lands or misses now: play the swing */
  | { type: 'swing'; unit: number; weapon: WeaponType | null; hit: boolean }
  /** damage dealt. heavy: a bat-sized hit. blocked: a shield took part of it. */
  | { type: 'hit'; from: number; to: number; weapon: WeaponType | null; dmg: number; x: number; y: number; dir: number; heavy: boolean; blocked: boolean; stun: boolean }
  /**
   * a unit died. dir: the way the killing blow pushed it. power: how hard (0..1+, from the weapon's knock and
   * the overkill). last: it was the last one of its team (the fight is decided).
   */
  | { type: 'death'; unit: number; by: number; weapon: WeaponType | null; x: number; y: number; dir: number; power: number; last: boolean }
  /** a frog lands a hop */
  | { type: 'land'; unit: number; x: number; y: number }
  /** from now on hits grow stronger every second */
  | { type: 'enrage' }
  /** the fight is over. winner -1 = a draw. byTime: the clock decided it. */
  | { type: 'end'; winner: Team | -1; byTime: boolean };

export interface SimSummary {
  winner: Team | -1;
  byTime: boolean;
  /** seconds, not counting the countdown */
  time: number;
  /** knock-outs scored by each team */
  kills: [number, number];
  /** fighters each team started with */
  size: [number, number];
  /** share of its total health each team has left, 0..1 */
  hpLeft: [number, number];
}

export interface Battle {
  /** every unit, dead ones included (alive = false); ids are indexes into this list */
  readonly units: readonly SimUnit[];
  /** seconds since the fight began; negative during the countdown */
  readonly time: number;
  readonly over: boolean;
  /** null until the fight is over */
  readonly summary: SimSummary | null;
  /** total health left / total starting health, per team (0..1) */
  readonly hpShare: readonly [number, number];
  /** fighters still alive, per team */
  readonly alive: readonly [number, number];
  /**
   * Advances the fight by dt seconds (any dt; it runs fixed 1/60 s steps inside) and returns the events
   * that happened, in order.
   */
  step(dt: number): SimEvent[];
}
