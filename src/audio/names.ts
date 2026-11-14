import type { Synth } from './synth';

/*
 * The names the game calls sounds and music by. The game plays a sound with sfx.play(name, n, at) and sets
 * the music with music.set(state); what each one sounds like is designed in sounds.ts and music.ts.
 * n is the sound's number (a class 1..7, a kill-streak count, a countdown second...).
 */

export type SoundName =
  // ---------------- interface
  | 'click' // any button press
  | 'pick' // a piece is lifted off the grid or the bench
  | 'drop' // a piece is put down in a cell
  | 'denied' // that cannot be done (a full bench, no rolls, a wrong drop)
  | 'link' // a pet connects to a weapon or gear next to it
  | 'unlink' // the connection breaks
  | 'merge' // two weapons or gear fuse into the next class. n = the new class 1..7
  | 'stack' // two pets fuse and double. n = the new count: 2, 4 or 8
  | 'whoosh' // a screen slides in or out
  | 'hint' // the guide points at the next thing to do
  | 'count' // one tick of a number counting up (trophies, rolls). Very short
  // ---------------- rolls
  | 'rollStart' // the roll begins: the charm drops in and bursts open
  | 'tick' // the medallion flicks to the next piece. Very short, heard dozens of times in a row
  | 'tock' // the last, slowing flicks: a deeper tick
  | 'reveal' // the roll lands on its prize. n = class 1..7, from a ding (E) to a full epic (SSS)
  | 'crack' // a rare prize cracks before breaking through to a higher class
  | 'breakthrough' // it shatters and comes back a class higher. n = the new class
  | 'collect' // the prize flies to the bench
  // ---------------- matchmaking
  | 'search' // one pulse of "searching for an opponent" (a soft sonar ping, loops about once a second)
  | 'found' // an opponent is found
  | 'vsSlam' // the VS badge slams in
  | 'countdown' // 3, 2, 1. n = the number shown
  | 'fight' // FIGHT! (a gong)
  // ---------------- the fight: attacks
  | 'deploy' // a squad pops onto the field
  | 'bite' // a pet's own attack (an ant's nip, a frog's tongue snap)
  | 'knife' // a knife stab (quick, light)
  | 'knifeHit'
  | 'bat' // a bat swing (a heavy whoosh)
  | 'batHit' // the bat connects: a huge cartoon bonk
  | 'spear' // a spear thrust
  | 'spearHit'
  | 'shieldBash'
  | 'block' // a hit lands on a shield: a clang
  | 'hop' // a frog lands a hop (soft, heard often)
  | 'stun' // dizzy stars
  // ---------------- the fight: deaths. Each one must be a joy to hear over and over.
  | 'pop' // a pet blows up like a balloon and bursts
  | 'squish' // flattened: a wet splat and a squeak
  | 'launch' // sent flying: a rising whistle, then a tiny twinkle far away
  | 'slice' // cut clean in two: a sharp shing and two soft thuds
  | 'spin' // spun like a top until it drops: a whirl, a wobble, a bump
  | 'deflate' // zips around like a let-go balloon: a long raspberry
  | 'shatter' // turns to stone and breaks: a crack, then glassy pieces
  | 'petals' // bursts into cherry petals: a soft shimmer
  | 'combo' // a knock-out streak. n = the streak count; climbs a scale
  | 'lastKill' // the knock-out that decides the fight (it plays in slow motion)
  | 'meter' // a knock-out's star flies into the roll meter
  | 'rollEarned' // the roll meter fills: +1 roll
  | 'enrage' // overtime: everyone hits harder from now on
  | 'cheer' // the crowd around the arena cheers
  // ---------------- the result
  | 'victory' // the victory fanfare
  | 'defeat' // the defeat sting (sad but funny, not harsh)
  | 'trophyUp' // trophies fly in. n = how many (the more, the richer)
  | 'trophyDown' // trophies lost
  | 'leagueUp'; // promoted to a new league. n = the league index

export type MusicState =
  | 'off'
  | 'lobby' // calm and catchy: you could arrange your grid to it for an hour
  | 'search' // looking for an opponent: suspended, expectant
  | 'battle' // the fight
  | 'overtime' // the fight after it turns to overtime: faster, more urgent
  | 'victory' // after the victory fanfare
  | 'defeat'; // the music fades out

/** One sound effect's recipe and how it sits in the mix. */
export interface SoundDef {
  /** seconds rendered (the silent tail is trimmed) */
  dur: number | ((n: number) => number);
  make: (s: Synth, n: number) => void;
  vol: number;
  cat: 'battle' | 'ui';
  /** variants rendered (a different one is picked each time) */
  vars?: number;
  /** rendered once per level (n picks the nearest) */
  levels?: number[];
  /** reverb send */
  verb?: number;
  /** minimum seconds between two plays */
  gap?: number;
  /** most copies playing at once */
  max?: number;
  /** random detune in cents */
  jitter?: number;
  /** pitch from n (scales) */
  rate?: (n: number) => number;
  /** how much it dips everything else while it plays */
  duck?: number | ((n: number) => number);
}

export interface PlayAt {
  /** where on the screen it happens (0..540): sets left / right */
  x?: number;
  /** the opponent's fighter did it: a little deeper and quieter than yours */
  enemy?: boolean;
  /** seconds from now */
  delay?: number;
}

/** What the game needs from the soundtrack. */
export interface MusicApi {
  /** wires the music into the mix (called once sound is unlocked) */
  attach(ac: AudioContext, dest: AudioNode, verb: AudioNode | null, muted: () => boolean): void;
  /** what the game is doing; the music follows */
  set(state: MusicState): void;
  /** muffled during a roll and behind panels */
  muffle(on: boolean): void;
  /** dips under a big sound effect */
  duck(amount: number, hold: number): void;
  /** 0..1: how heated the fight is right now (more fighters swinging = more layers playing) */
  energy(v: number): void;
}
