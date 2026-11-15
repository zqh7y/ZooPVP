import type { PetType, SquadSpec, Team, WeaponType } from '../types';

/*
 * What the fight simulator shows the rest of the game. The simulator is pure and deterministic: the same
 * two armies and seed always give the same fight, with or without a screen. The battle view only reads units
 * and events; it never changes them.
 */

export type UnitPhase =
  | 'wait' // lined up, before the fight starts (or before its band sets off)
  | 'move' // walking (or hopping) toward its target
  | 'windup' // drawing back for an attack
  | 'recover' // following through after the strike (and a penguin standing up after a slam)
  | 'stun' // knocked silly
  | 'air' // a grasshopper's opening leap: it cannot be targeted, hit, pushed or collided with
  | 'shell' // a snail hiding in its shell: it takes 85% less, cannot be pushed or stunned, and regrows
  | 'slide'; // a penguin's belly slide toward its target

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
  /** its pet's rung, 1..12 */
  rung: number;
  /** a hop (frogs, grasshoppers): 0 on the ground, up to 1 at the top; also the grasshopper's opening leap arc */
  hop: number;
  /** health its poison pools still hold (it will lose this much more unless it dies first), for the view */
  poison: number;
  /** a beetle with its horn down: its next strike is a charge */
  charged: boolean;
  /** distance walked, px (drives leg animation) */
  walked: number;
  /** seconds since it was last hit (large when never) */
  sinceHit: number;
  /** the direction the last hit pushed it in, radians */
  hitDir: number;
}

/** How a unit died: a hit (an attack, a pinch, a landing, a slam), its foe's poison, or a hedgehog's spikes. */
export type DeathCause = 'hit' | 'poison' | 'spike';
/** The special blow that dealt a hit (null for a plain attack). */
export type Blow = 'charge' | 'slam' | 'landing' | 'stomp' | null;

/** A hit as the view sees it: who hit whom, how hard, and which traits took part. */
export interface HitEvent {
  type: 'hit';
  from: number;
  to: number;
  weapon: WeaponType | null;
  dmg: number;
  x: number;
  y: number;
  dir: number;
  /** a bat-sized hit (a bat swing, a penguin slam, a beetle charge) */
  heavy: boolean;
  /** a shield took part of it */
  blocked: boolean;
  /** it stunned the target */
  stun: boolean;
  /** ant: other ants packed around the biter, 0..3 (+10% each) */
  pack: number;
  /** crab: 0 when not a crab, else which of its two pinches (1 or 2; the view draws the 2nd 0.12 s later) */
  pinch: 0 | 1 | 2;
  /** hedgehog spikes biting back: `from` is the hedgehog, `to` the attacker (no push, stun or poison) */
  spike: boolean;
  /** chameleon: the hit pulled the target toward it instead of pushing it */
  pull: boolean;
  /** turtle: its armour cut this hit */
  armour: boolean;
  /** snail: it landed on a hiding snail's shell (85% cut) */
  shell: boolean;
  /** the special blow it was */
  blow: Blow;
  /** frog: its tongue slap (+30 knock) */
  slap: boolean;
  /** it broke off the target's wind-up */
  interrupt: boolean;
}

export type SimEvent =
  /** the fight starts (the countdown is over) */
  | { type: 'start' }
  /** a unit begins an attack (its weapon draws back) */
  | { type: 'windup'; unit: number }
  /** the attack lands or misses now: play the swing */
  | { type: 'swing'; unit: number; weapon: WeaponType | null; hit: boolean }
  /** damage dealt (see HitEvent) */
  | HitEvent
  /**
   * a unit died. dir: the way the killing blow pushed it. power: how hard (0..1+, from the weapon's knock and
   * the overkill). last: it was the last one of its team (the fight is decided). cause: what took its last
   * health; blow: the special blow, when a hit did.
   */
  | { type: 'death'; unit: number; by: number; weapon: WeaponType | null; x: number; y: number; dir: number; power: number; last: boolean; cause: DeathCause; blow: Blow }
  /** a hop lands (frogs, grasshoppers); big: a grasshopper's opening leap landing (its splash hit and stun land now) */
  | { type: 'land'; unit: number; x: number; y: number; big: boolean }
  /** mouse: it dodged a hit from `from` (nothing landed); (x, y) is where the hit would have landed */
  | { type: 'dodge'; unit: number; from: number; x: number; y: number }
  /** snail: it hides in its shell (on) or pops out (off) */
  | { type: 'shell'; unit: number; on: boolean }
  /** grasshopper: its opening leap starts, from (x0, y0) to (x1, y1) in dur s, aimed at `target` */
  | { type: 'leap'; unit: number; target: number; x0: number; y0: number; x1: number; y1: number; dur: number }
  /** penguin: a belly slide starts (on) or ends (off) */
  | { type: 'slide'; unit: number; on: boolean }
  /** penguin: the slide slams into `to` at (x, y); n more foes are shoved by the wave */
  | { type: 'slam'; unit: number; to: number; x: number; y: number; n: number }
  /** beetle: its horn goes down (it is charged; its next strike is a charge) */
  | { type: 'charge'; unit: number }
  /** turtle: a stomp lands round it at (x, y) on n foes */
  | { type: 'stomp'; unit: number; x: number; y: number; n: number }
  /** bee poison: `unit` lost dmg to poison since its last poison event (at most one every 0.5 s per victim); by = the bee of its newest pool */
  | { type: 'poison'; unit: number; by: number; dmg: number }
  /** from now on hits grow stronger every second */
  | { type: 'enrage' }
  /** the fight is over. winner -1 = a draw. byTime: the clock decided it. */
  | { type: 'end'; winner: Team | -1; byTime: boolean };

export interface SimSummary {
  /** -1 = a draw (both armies fell in the same step with exactly equal health left, or the clock found a tie) */
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
