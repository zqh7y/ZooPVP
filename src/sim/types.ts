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
  | 'recover' // following through after the strike (and a Sumo standing up after a slam)
  | 'stun' // knocked silly
  | 'air' // a Pogo's opening leap: it cannot be targeted, hit, pushed or collided with
  | 'shell' // a Snailor hiding in its shell: it takes 85% less, cannot be pushed or stunned, and regrows
  | 'slide'; // a Sumo's belly slide toward its target

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
  /** its unit's rung, 1..12 */
  rung: number;
  /** a boss (wave 10): draw it as a giant (r is already BOSS.radius x) with a crown */
  boss: boolean;
  /** a hop (Roos, Pogos): 0 on the ground, up to 1 at the top; also the Pogo's opening leap arc */
  hop: number;
  /** health its poison pools still hold (it will lose this much more unless it dies first), for the view */
  poison: number;
  /** a Rhino with its horn down: its next strike is a charge */
  charged: boolean;
  /** distance walked, px (drives leg animation) */
  walked: number;
  /** seconds since it was last hit (large when never) */
  sinceHit: number;
  /** the direction the last hit pushed it in, radians */
  hitDir: number;
}

/** How a unit died: a hit (an attack, a jab, a landing, a slam, a stomp), a Buzzy's poison, or a Briar's thorns. */
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
  /** a bat-sized hit (a bat swing, a Sumo slam, a Rhino charge) */
  heavy: boolean;
  /** a shield took part of it */
  blocked: boolean;
  /** it stunned the target */
  stun: boolean;
  /** sprout: other Sprouts packed around the biter, 0..3 (+10% each) */
  pack: number;
  /** cacto (the double hit): 0 when not a Cacto, else which of its two jabs (1 or 2; the view draws the 2nd 0.12 s later) */
  pinch: 0 | 1 | 2;
  /** briar thorns biting back: `from` is the Briar, `to` its attacker (no push, stun or poison) */
  spike: boolean;
  /** angler: the hook pulled the target toward it instead of pushing it */
  pull: boolean;
  /** boulder: its armour cut this hit */
  armour: boolean;
  /** snailor: it landed on a hiding Snailor's shell (85% cut) */
  shell: boolean;
  /** the special blow it was: 'charge' a Rhino's charge hit, 'slam' a Sumo's slam, 'landing' a Pogo's landing, 'stomp' a Boulder's stomp */
  blow: Blow;
  /** roo: its punch (+30 knock) */
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
  /** a hop lands (Roos, Pogos); big: a Pogo's opening leap landing (its splash hit and stun land now) */
  | { type: 'land'; unit: number; x: number; y: number; big: boolean }
  /** ninja: it dodged a hit from `from` (nothing landed); (x, y) is where the hit would have landed */
  | { type: 'dodge'; unit: number; from: number; x: number; y: number }
  /** snailor: it hides in its shell (on) or pops out (off), at (x, y) */
  | { type: 'shell'; unit: number; on: boolean; x: number; y: number }
  /** pogo: its opening leap starts, from (x0, y0) to (x1, y1) in dur s, aimed at `target` */
  | { type: 'leap'; unit: number; target: number; x0: number; y0: number; x1: number; y1: number; dur: number }
  /** sumo: a belly slide starts (on) or ends (off), at (x, y) */
  | { type: 'slide'; unit: number; on: boolean; x: number; y: number }
  /** sumo: the slide slams into `to` at (x, y); n more foes are shoved by the wave */
  | { type: 'slam'; unit: number; to: number; x: number; y: number; n: number }
  /** rhino: its horn goes down at (x, y) (it is charged; its next strike is a charge: a hit with blow 'charge') */
  | { type: 'charge'; unit: number; x: number; y: number }
  /** boulder: a stomp lands round it at (x, y) on n foes */
  | { type: 'stomp'; unit: number; x: number; y: number; n: number }
  /** buzzy poison: `unit` (at x, y) lost dmg to poison since its last poison event (at most one every 0.5 s per victim); by = the Buzzy of its newest pool */
  | { type: 'poison'; unit: number; by: number; dmg: number; x: number; y: number }
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
  /** fighters each team still has standing */
  alive: [number, number];
  /** bosses each team knocked out */
  bossKos: [number, number];
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
