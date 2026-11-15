import type { PetType } from '../types';
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
  | 'search' // v5: one tick of the searching moment (a sonar blip and a clock tick; about once a second)
  | 'found' // v5: the FOUND sting, an opponent is matched
  | 'vsSlam' // the VS badge slams in
  | 'countdown' // 3, 2, 1. n = the number shown
  | 'fight' // v5: FIGHT! the downbeat after READY: a brass hit and the crowd erupting
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
  | 'victory' // v5: the VICTORY stinger, big and joyful
  | 'defeat' // v5: the DEFEAT stinger, soft and gentle, never harsh
  | 'trophyUp' // trophies fly in. n = how many (the more, the richer)
  | 'trophyDown' // trophies lost
  | 'leagueUp' // promoted to a new league. n = the league index
  // ================ v4: stages and waves (the names above stay working; trophies, leagues and matchmaking are legacy)
  // ---------------- the cast: every character's own attack, hurt and death voice (see petVoice below)
  | PetVoiceName
  // ---------------- the traits
  | 'poison' // a poison tick on a stung foe (Buzzy). Heard often: tiny
  | 'dodge' // a hit whiffs past (Ninja)
  | 'shellClose' // Snailor hides in its shell
  | 'shellOpen' // ...and pops back out
  | 'thorns' // a hit on Briar pricks the attacker back
  | 'hookPull' // Angler's hook reels a foe in
  | 'bellySlide' // Sumo belly-slides through the line
  | 'chargeImpact' // Rhino's charged strike lands
  | 'leapLaunch' // Pogo springs off for the back line
  | 'leapLand' // ...and lands (the stun follows)
  | 'doubleJab' // Cacto's two jabs
  | 'armourClank' // armour soaks a hit (Boulder; also any plated unit)
  | 'bossStomp' // the boss (or Boulder) stomps: up to 4 foes around it are hit
  // ---------------- the stage flow
  | 'waveStart' // START WAVE: the referee's whistle and an air horn. Short and punchy
  | 'waveClear' // a wave is won: the final whistle and a bright jingle
  | 'stageClear' // wave 10 is won: the big joyful fanfare with the crowd
  | 'star' // one stage-clear star lands. n = which star, 1..3 (each one higher)
  | 'gems' // gems are paid out
  | 'bossArrives' // the boss walks onto the pitch: a heavy sting
  | 'waveLost' // a wave is lost: the crowd's soft "aww" (never harsh)
  | 'cashKill' // the small cash payout of one knock-out (a single coin; heard many times in a row)
  | 'cashWave' // the wave's cash payout: a pour of coins
  | 'cellUnlock' // a locked grid cell opens
  | 'sell' // TRASH: a piece is sold for a little cash
  // ---------------- the roll (plain: the prize spins in the middle of the screen)
  | 'spinTick' // a prize flicks past. n = the spin's progress 0..1 (it climbs a scale as the spin slows)
  | 'spinLand' // the spin stops on the prize: a soft landing thump
  | 'unitReveal' // the prize pops: a unit. n = its rung 1..12 (bigger every rung, and the unit says hello)
  | 'itemReveal' // the prize pops: a weapon or gear. n = its class 1..7 (E..SSS)
  | 'evolve' // x4 + x4 -> the next unit x1. n = the NEW unit's rung 2..12. The most satisfying sound in the game
  // ================ v5: a boxing night (docs/v5.md). Matched fights, no stages. Redesigned for v5 above:
  // search, found, fight, victory, defeat (now boxing-night sounds); the stage-flow sounds above are legacy.
  // ---------------- the bell and the call
  | 'bellStart' // the boxing bell to start: DING-DING
  | 'bellEnd' // the bell at the end: one long DING
  | 'ready' // "READY ...": a held breath, a drum roll rising (play FIGHT right after it)
  // 'fight' (above) is now FIGHT!: the downbeat, a brass hit, the crowd erupting
  // ---------------- the hits
  | 'punch' // a boxing glove landing: a meaty leather thwack with a low thump (any glove hit)
  | 'crit' // a critical hit: a sharper, bigger, heavier hit (play with the gold CRIT! number)
  | 'pow' // the comic impact words on big blows: POW! a punchy pop and a snare crack
  | 'bonk' // BONK! a hollow cartoon bonk with a boing
  | 'wham' // WHAM! a rush and a heavy slam
  | 'smash' // SMASH! a crash of bits and a boom
  | 'ko' // a knock-out: the punchy launch, a slide whistle as it flies off spinning, a twinkle far away
  | 'doubleKo' // DOUBLE KO! a rising "ba-BAM" call
  | 'tripleKo' // TRIPLE KO! three chords climbing, a crash, the crowd
  | 'rampage' // RAMPAGE! (4 or more): a drum roll, four chords climbing, everything at once
  | 'slowmo' // the last knock-out goes into slow motion: a deep, falling whoosh and a heartbeat
  | 'coins' // a sprinkle of coins flying up to the cash pill
  | 'globSplat' // Scorp's poison glob lands: a wet splat that sizzles
  // ---------------- the crowd
  | 'roar' // the crowd roars and swells on a big moment. n = 1..3, how big (3: the whole stadium)
  | 'ooh' // the crowd's "OOOH!" on a big hit
  // ---------------- matchmaking and the result
  // 'search' (above) is now one tick of the searching moment (the loop itself is the music state 'search')
  // 'found' (above) is now the FOUND sting: an opponent is matched
  | 'champion' // CHAMPION MATCH: the bigger sting (every 5th match)
  | 'cashCount' // one tick of the cash counting up. n = 0..1, how far the count is (it climbs as it goes)
  | 'xpCount' // one tick of the XP bar filling. n = 0..1, how full the bar is (it climbs as it fills)
  | 'levelUp' // LEVEL UP! the player reaches a new level
  | 'mvp'; // the MVP unit is named: a spotlight and a cheer

/** The three things every character says. */
export type VoiceKind = 'attack' | 'hurt' | 'death';
/** One sound per character and voice: sproutAttack, sproutHurt, sproutDeath, buzzyAttack ... boulderDeath. */
export type PetVoiceName = `${PetType}${'Attack' | 'Hurt' | 'Death'}`;

const KIND: Record<VoiceKind, 'Attack' | 'Hurt' | 'Death'> = { attack: 'Attack', hurt: 'Hurt', death: 'Death' };

/** The sound of a character's voice: sfx.play(petVoice('sprout', 'attack'), 0, { x, enemy }). */
export function petVoice(pet: PetType, kind: VoiceKind): SoundName {
  return `${pet}${KIND[kind]}`;
}

export type MusicState =
  | 'off'
  | 'lobby' // the main screen (the PREP music, most of the time): warm, catchy, never tiring
  | 'search' // looking for an opponent: light, ticking, a little tense
  | 'fight' // a fight: driving (music.energy adds layers)
  | 'champion' // a champion match: bigger and tenser
  | 'victory' // after the victory stinger: a bright, bouncy loop
  | 'defeat' // after the defeat stinger: a soft, slow, sparse loop
  | LegacyMusicState;

/** The older state names. They keep working: each one plays its v5 state (see MUSIC_ALIAS). */
export type LegacyMusicState = 'prep' | 'wave' | 'boss' | 'stageClear' | 'battle' | 'overtime';

/** What each older state name plays now. */
export const MUSIC_ALIAS: Record<LegacyMusicState, Exclude<MusicState, LegacyMusicState>> = {
  prep: 'lobby', // v4 between waves
  wave: 'fight', // v4 a wave
  boss: 'champion', // v4 the boss wave
  stageClear: 'victory', // v4 stage clear
  battle: 'fight', // v3
  overtime: 'champion', // v3
};

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
