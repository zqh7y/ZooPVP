import { music, petVoice, sfx, type SoundName, type VoiceKind } from '../audio/engine';
import { ARENA, PET_INFO } from '../data';
import { screenX, screenY, viewRect, viewScale, type ViewRect } from '../draw/camera';
import { Deaths } from '../draw/deaths';
import { Fx, GROUND_FLAT, NUMBER_STYLE, STICKER_FONT, STICKER_WEIGHT, setStickerRes, sticker, stickerCached, type StickerStyle } from '../draw/fx';
import { restPose, type PetLook, type PetPose } from '../draw/petTypes';
import { petArt } from '../draw/pets';
import { tugBar } from '../draw/ui';
import { mvpOf, outcomeOf } from '../logic/progress';
import { fchance, frand } from '../rng';
import type { App } from '../screen';
import { createBattle } from '../sim/battle';
import type { Battle, HitEvent, SimEvent, SimSummary, SimUnit } from '../sim/types';
import { COLOR, TYPE } from '../theme';
import type { ArmySpec, MatchOutcome, PetType, SquadScore, Team, WeaponType } from '../types';
import { clamp, easeOutBack, easeOutCubic, label, lerp, rr, type Ctx } from '../util';

/*
 * THE BATTLE VIEW: the arena part of the main screen. It has no screen of its own: the main screen owns it, sets
 * the camera's view rectangle every frame (a short PREP band or a tall FIGHT view, animated between the two) and
 * calls showPrep / start / update / render. The simulator decides everything; the view only shows it.
 *
 * Everything on the pitch is drawn in ARENA px: render() puts the camera's flat transform on the context once
 * (screen = origin + arena x viewScale), so units, shadows, effects and the marks a fight leaves on the grass stay
 * glued to the pitch however the view moves or grows. The HUD (tug bar, KO counter, boss bar), the banners and the
 * flashes are drawn in screen px, inside the view; the KO coins fly in screen px to the cash pill, outside it.
 *
 * v5, a boxing night (docs/v5.md section 4). START: a CHAMPION banner on a champion match; both corners pop in
 * (your rows lit blue from below, theirs red from above); "READY..." with a drum roll; then "FIGHT!" with the bell's
 * DING-DING and the crowd. Every hit lands: a white flash and a squash on the victim, a stretch on the attacker,
 * the shove with a dust puff, a hit-stop and camera shake scaled to the blow, a popping damage number (gold with
 * CRIT! on a crit), and on big blows a comic word (POW! BONK! WHAM! SMASH! STRIKE!). A knock-out launches the loser
 * spinning with stars (some into the crowd), coins burst out and fly to the cash pill, your KO counter pops, and KOs
 * in quick succession call DOUBLE KO! / TRIPLE KO! / RAMPAGE!. Small health bars over the hurt, a tug bar of both
 * teams' health at the top. The last knock-out plays in slow motion with a zoom toward it, then VICTORY! / DEFEAT
 * and an MVP tag over your best fighter. Traits: Scorp lobs poison globs (an arc with a trail and a shadow, a
 * sizzling splat, a puddle left on the grass), Tulip closes into its armoured bud (pose.shell), Dandy floats over
 * on its seed parachute, Snapper's vine reels foes in, Pumpkin bowls through the line (STRIKE!).
 *
 * THE API (v4's stays; v5 additions marked +):
 *   new BattleView(app); showPrep(player, enemy); start(setup); update(dt); render(ctx); outcome(); phase(); live;
 *   onKo(team, x, y, boss); time / marks / load (dev).
 *   + WaveSetup.champion (CHAMPION banner, boss bar, champion music; default: the enemy has a boss), .names
 *     ([yours, theirs] for the tug bar); stage / wave / boss are optional now. MatchSetup is the same type.
 *   + outcome(): .draw, .match (a MatchOutcome with your squads' KOs and damage and .champion, ready for
 *     applyMatch), .mvp (Mvp: your best unit, in the squad progress.mvpOf names; null if nobody scored), .crits.
 *   + live.hp: [yours, theirs] health shares 0..1 (what the tug bar shows).
 *   + coinTarget: where the KO coins fly (screen px; the cash pill's middle); onCoin(): one coin arrived (bump the
 *     pill). coinsOnTop: set true and call renderCoins(ctx) after the HUD so the coins fly over it (else render()
 *     draws them last).
 *   + hud: { tug, kos, boss, top }: turn the view's own HUD parts off, or move them down `top` px from the view's top.
 *   + Sounds it plays itself: champion, ready, bellStart, fight, roar, ooh, punch, crit, pow / bonk / wham / smash,
 *     ko (via deaths), coins, doubleKo / tripleKo / rampage / combo, globSplat, slowmo, bellEnd, victory / defeat.
 *     The host sets the music after the outcome (victory / defeat / lobby).
 */

export interface WaveSetup {
  player: ArmySpec;
  enemy: ArmySpec;
  seed: number;
  /** a champion match: the CHAMPION intro banner, the boss bar, the champion music (default: the enemy has a boss) */
  champion?: boolean;
  /** the two corners' names on the tug bar: [yours, theirs] (default YOU and RIVAL) */
  names?: [string, string];
  /** v4: a boss wave (read as champion when champion is not given) */
  boss?: boolean;
  /** v4, unused */
  stage?: number;
  /** v4, unused */
  wave?: number;
}
/** v5 name of the setup */
export type MatchSetup = WaveSetup;

/** The MVP: your unit with the most knock-outs, in the squad progress.mvpOf names (the result panel's MVP). */
export interface Mvp {
  /** its unit id in the fight */
  id: number;
  /** its squad: SquadSpec.key (the piece) */
  key: number;
  pet: PetType;
  /** the squad's knock-outs and damage (as SquadScore) */
  kos: number;
  dmg: number;
  /** this unit's own knock-outs */
  unitKos: number;
  /** it was still standing at the end */
  alive: boolean;
}

/**
 * How a fight went. kills / losses / survived / time are the HUD's; kos and boss make it a v4 WaveOutcome too;
 * match is the v5 MatchOutcome for applyMatch; summary is the simulator's own.
 */
export interface WaveOutcome {
  won: boolean;
  /** neither side won (the clock found a tie) */
  draw: boolean;
  /** enemy fighters you knocked out (the boss included) */
  kills: number;
  /** your fighters knocked out */
  losses: number;
  /** share 0..1 of your fighters still standing */
  survived: number;
  /** seconds the fight took */
  time: number;
  /** = kills */
  kos: number;
  /** the boss was knocked out */
  boss: boolean;
  /** for applyMatch: outcomeOf(summary, your army) with champion set */
  match: MatchOutcome;
  mvp: Mvp | null;
  /** your critical hits */
  crits: number;
  summary: SimSummary;
}
/** v5 name of the outcome */
export type FightOutcome = WaveOutcome;

type Mode = 'prep' | 'intro' | 'fight' | 'end' | 'over';

// ---- timing (seconds)
const POP_IN = 0.3; // a fighter popping onto the pitch
const INTRO_LEAD = 0.1; // before the first row pops in
const ROWS_SPAN = 0.6; // every row is in within this long
const ROW_GAP = { min: 0.07, max: 0.16 };
const RIPPLE = 0.12; // within a row they pop from the middle out
const CHAMP_LEAD = 1.0; // a champion match: the CHAMPION banner first
const READY_HOLD = 0.85; // READY... until FIGHT!
const READY_HOP = 0.36; // a ready hop (or an idle hop in prep)
const END_BANNER = 0.95; // from the deciding blow until VICTORY / DEFEAT
const END_HOLD = 2.3; // from the deciding blow until outcome() is ready
const END_MAX = 4; // ... at the latest, even if a death is still playing
const SLOW = { factor: 0.2, secs: 1.05 }; // the last knock-out's slow motion (real seconds)
const ZOOM = 0.38; // the end zoom: 1 + this
const JAB_GAP = 0.12; // the second of a Cacto's two jabs
const VINE_LIFE = 0.42; // a vine that reels a foe in
const SNAP_LIFE = 0.22; // the vine of a plain snap
const BONK_GAP = 0.16; // at least this long between two big impacts (hit-stop and shake)
const WORD_GAP = 0.28; // ... between two comic words
const COMBO_GAP = 1.25; // your knock-outs this close together make a combo
const MARKS_FADE = 0.5; // the old fight's marks fade this long when prep comes back

// ---- look (arena px unless said)
/** units are drawn this much larger than their body radius, so the characters read at fight size */
const DRAW = 1.12;
const GHOST = 0.42; // the coming opponent, in prep
const LEAP_LIFT = 70; // Dandy's opening float rises this high at its top (over its own hop)
const HP = { w: 18, h: 4 };
const CROWDED = 60; // more fighters: the small sparks are left out
const QUIET = 30; // fewer fighters: even a plain hop gets its puff
const PREP_SEED = 1;
const COINS = 48; // coins flying at once
const COIN_R = 7; // screen px

/** The battle palette: juicy, warm and saturated, never neon. Team colours as the art paints them. */
const PAL = {
  white: '#ffffff',
  cream: '#fff3d6',
  ink: '#1d1a2b',
  dust: ['#fbf6ea', '#eadfca'],
  star: ['#ffe066', '#ffffff', '#ffd23f'],
  poison: ['#b7e84a', '#e2ff8a', '#8fcf3a'],
  glob: { main: '#a8d94a', light: '#e2ff8a', dark: '#6f9e2a', puddle: 'rgba(160, 214, 70, 0.75)', rim: 'rgba(90, 140, 30, 0.8)' },
  pencils: ['#ffcf3f', '#ff7b9c', '#5fb3ff', '#7ed16b'],
  plates: ['#d9e1ea', '#f5f8fb', '#e86f92'],
  spores: ['#f3b6e6', '#d9b8ff', '#fff0fb'],
  feather: ['#ffe27a', '#fff4c2'],
  seed: ['#ffffff', '#f8f3e5'],
  vine: { main: '#5fae45', light: '#9bd66f', leaf: '#7cc35a' },
  impact: '#ffe27a',
  jab: '#fff3c4',
  tink: '#eef3f8',
  team: [
    { main: '#4f9bff', light: '#bcdcff', dark: '#2f6ad0', glow: 'rgba(79, 155, 255, 0.34)' },
    { main: '#ff5f57', light: '#ffc4bf', dark: '#c8382f', glow: 'rgba(255, 95, 87, 0.3)' },
  ],
  bar: { ink: '#1d1a2b', track: '#4a4458', lag: '#ffffff', fill: ['#55d06a', '#ff5f57'] as const },
} as const;

/** the comic words and their looks (the sound each one plays) */
const WORDS: Record<string, { style: StickerStyle; sound: SoundName }> = {
  'POW!': { style: { fill: '#fff07a', fill2: '#ffb21f', burst: '#ff5a3c', rim: null }, sound: 'pow' },
  'BONK!': { style: { fill: '#c9f1ff', fill2: '#5ab8ff', burst: '#ffd23f', rim: null }, sound: 'bonk' },
  'WHAM!': { style: { fill: '#fff07a', fill2: '#ffa63d', burst: '#a35cff', rim: null }, sound: 'wham' },
  'SMASH!': { style: { fill: '#ffffff', fill2: '#ffd2b0', burst: '#ff4d6a', rim: null }, sound: 'smash' },
  // Pumpkin bowling the line over (a word of our own; the closest sound is the smash)
  'STRIKE!': { style: { fill: '#fff07a', fill2: '#ff9d2e', burst: '#30b673', rim: null }, sound: 'smash' },
};
const MISS: StickerStyle = { fill: '#efe9ff', ink: PAL.ink, rim: null, shadow: 0.25 };
const MVP_TAG: StickerStyle = { fill: '#fff07a', fill2: '#ffb21f', ink: PAL.ink, rim: '#ffffff' };
const KO_TAG: StickerStyle = { fill: '#ffffff', fill2: '#ffe08a', ink: PAL.ink, rim: null, shadow: 0.3 };

type BannerKind = 'champion' | 'ready' | 'fight' | 'time' | 'overtime' | 'victory' | 'defeat' | 'draw' | 'call';
interface Banner { kind: BannerKind; text: string; age: number; life: number; size: number; style: StickerStyle; fit: number; sub: string }

const BANNER: Record<Exclude<BannerKind, 'call'>, { size: number; at: number; style: StickerStyle; rot: number }> = {
  champion: { size: 54, at: 0.4, rot: -0.04, style: { fill: '#fff3a1', fill2: '#f5b52e', burst: '#7b3fe0', rim: null } },
  ready: { size: 54, at: 0.45, rot: -0.03, style: { fill: '#ffffff', fill2: '#cfe2ff', rim: null, shadow: 0.4 } },
  fight: { size: 80, at: 0.45, rot: -0.06, style: { fill: '#fff07a', fill2: '#ff8a1f', burst: '#ff4040', rim: null } },
  time: { size: 54, at: 0.4, rot: 0.03, style: { fill: '#ffffff', fill2: '#ffc56b', rim: null } },
  overtime: { size: 46, at: 0.32, rot: -0.03, style: { fill: '#fff07a', fill2: '#ff7a3d', rim: null } },
  victory: { size: 66, at: 0.4, rot: -0.04, style: { fill: '#fff38a', fill2: '#ffa51f', burst: '#3d8bff', rim: null } },
  defeat: { size: 62, at: 0.4, rot: 0.04, style: { fill: '#eef2fb', fill2: '#97a6cc', rim: null, shadow: 0.45 } },
  draw: { size: 62, at: 0.4, rot: 0, style: { fill: '#ffffff', fill2: '#c9ccd6', rim: null } },
};
const CALLS = [
  { text: 'DOUBLE KO!', burst: '#3d8bff', sound: 'doubleKo' as SoundName },
  { text: 'TRIPLE KO!', burst: '#a35cff', sound: 'tripleKo' as SoundName },
  { text: 'RAMPAGE!', burst: '#ff4040', sound: 'rampage' as SoundName },
];

const SWING: Record<WeaponType, SoundName> = { knife: 'knife', bat: 'bat', spear: 'spear', shield: 'shieldBash' };
/** Scorp's lob: no sound of its own; its voice's attack is the wet "ptoo!" of the throw */
const THROW_VOICE: VoiceKind = 'attack';
const TAU = Math.PI * 2;

interface View {
  u: SimUnit;
  /** which piece it is, so a prep re-draw keeps the ones that did not change */
  key: string;
  look: PetLook;
  pose: PetPose;
  /** 1 as its strike lands, fading */
  strike: number;
  moving: number;
  /** seconds since it popped onto the pitch, < 0 while it has not */
  born: number;
  /** intro: when it pops in (or gives its ready hop) */
  popAt: number;
  /** it was standing in prep: a ready hop instead of a pop */
  ready: boolean;
  /** an idle hop: its progress 0..1, < 0 when none; and the countdown to the next one in prep */
  hopK: number;
  nextHop: number;
  /** 1 as it dodges, fading; the way it steps */
  dodge: number;
  dodgeDir: number;
  /** a Tulip's bud, 0..1; a rolling Pumpkin's lean, 0..1 */
  shell: number;
  slide: number;
  /** the white hit flash, 1 -> 0 */
  flash: number;
  /** squash and stretch: a spring (+ = squashed wide, - = stretched tall) and its speed */
  sq: number;
  sqV: number;
  /** its health bar: how much shows (fades in once hurt) and the white lag of the health it just lost */
  barA: number;
  lag: number;
  /** the health it had as the last number showed: a number never shows more than it had left (no overkill) */
  hpSeen: number;
  /** seconds until it may say something again */
  voice: number;
  /** seconds until its next trail puff */
  trail: number;
}

interface Vine { from: number; to: number; age: number; life: number; pull: boolean }
interface Leap { unit: number; x1: number; y1: number; age: number; dur: number }
interface Glob { unit: number; x0: number; y0: number; x1: number; y1: number; h0: number; h1: number; arc: number; age: number; dur: number }
interface Coin { x: number; y: number; vx: number; vy: number; age: number; fly: number; x0: number; y0: number; cx: number; cy: number; dur: number; spin: number; arrived: number }

export class BattleView {
  /** live counters for the HUD (kills fuel the cash ticker); hp = each side's health share 0..1 */
  readonly live = { kills: 0, losses: 0, time: 0, mine: 0, theirs: 0, hp: [1, 1] as [number, number] };
  /** optional: called on every knock-out with the side that lost the fighter, where it fell on screen and if it was a boss */
  onKo: ((team: Team, x: number, y: number, boss: boolean) => void) | null = null;
  /** where the KO coins fly to, in screen px (the cash pill's middle) */
  coinTarget: { x: number; y: number } = { x: 64, y: 38 };
  /** one coin reached coinTarget: bump the cash pill */
  onCoin: (() => void) | null = null;
  /** true: render() leaves the coins out and the host calls renderCoins(ctx) after its HUD */
  coinsOnTop = false;
  /** the view's own HUD: the tug bar, your KO counter, the boss bar; top = px below the view's top edge */
  readonly hud = { tug: true, kos: true, boss: true, top: 6 };

  private readonly fx = new Fx();
  private readonly deaths: Deaths;
  private readonly ball = new Ball();
  private mode: Mode = 'prep';
  private battle: Battle | null = null;
  private setup: WaveSetup | null = null;
  private champion = false;
  private names: [string, string] = ['YOU', 'RIVAL'];
  private views: View[] = [];
  /** the views on the pitch, far to near */
  private order: View[] = [];
  private t = 0;
  private introT = 0;
  private readyAt = 0;
  private introEnd = 0;
  private readyShown = false;
  private endT = 0;
  private endShown = false;
  private byTime = false;
  private winner: Team | -1 | null = null;
  private result: WaveOutcome | null = null;
  private mvp: Mvp | null = null;
  private later: { t: number; run: () => void }[] = [];
  private vines: Vine[] = [];
  private leaps: Leap[] = [];
  private globs: Glob[] = [];
  private banners: Banner[] = [];
  private call: Banner | null = null;
  private coins: Coin[] = Array.from({ length: COINS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, fly: 0, x0: 0, y0: 0, cx: 0, cy: 0, dur: 0, spin: 0, arrived: -1 }));
  private coinN = 0;
  private bonk = 0;
  private wordT = 0;
  private roarT = 0;
  private oohT = 0;
  private scuffs = 3;
  /** root cracks painted this fight (a few at most) */
  private cracksN = 0;
  private streak = 0;
  private streakT = 9;
  private kos = 0;
  private koPop = 0;
  private energy = 0;
  /** the end zoom: 0..1 and the arena point it closes in on */
  private zoomK = 0;
  private zoomOn = false;
  private zoomX = ARENA.w / 2;
  private zoomY = ARENA.h / 2;
  /** the old fight's marks on the grass fading out (1 = shown) */
  private marksA = 1;
  private fading = false;
  private bossId = -1;
  private bossA = 0;
  private bossHp = 1;
  private tugK = 0.5;
  private tugA = 0;
  private ghostCv: HTMLCanvasElement | null = null;

  constructor(private readonly app: App) {
    this.deaths = new Deaths(this.fx, app.ratio);
    this.deaths.onCrowd = (x, y) => this.intoCrowd(x, y);
  }

  // ------------------------------------------------------------------ the contract

  /** PREP: your army standing in its kick-off rows (and, faded at the far end, the coming opponent). Call again when the grid changes. */
  showPrep(player: ArmySpec, enemy: ArmySpec | null): void {
    const after = this.mode !== 'prep';
    const old = new Map<string, View>();
    if (!after) for (const v of this.views) old.set(v.key, v);
    if (after) {
      // the fight is over: its marks fade, everything else goes
      this.fading = this.fx.ground.count > 0;
      this.marksA = 1;
      this.deaths.clear();
      this.later.length = this.vines.length = this.leaps.length = this.globs.length = this.banners.length = 0;
      this.call = null;
      this.bossId = -1;
      this.bossA = this.tugA = 0;
      this.zoomK = 0;
      this.zoomOn = false;
      this.mvp = null;
    }
    const b = createBattle([player, enemy ?? { squads: [] }], PREP_SEED);
    this.battle = null;
    this.setup = null;
    this.mode = 'prep';
    this.result = null;
    this.winner = null;
    const keys = keysOf(b.units);
    this.views = b.units.map((u, i) => {
      const v = makeView(u, keys[i]);
      const was = old.get(v.key);
      if (was && Math.abs(was.u.x - u.x) < 3 && Math.abs(was.u.y - u.y) < 3 && was.born >= 0) {
        // the same piece standing in the same spot: it just carries on
        v.born = was.born;
        v.pose.t = was.pose.t;
        v.nextHop = was.nextHop;
      } else {
        // new (or moved): it pops in, the near rows a moment before the far ones
        v.born = -(after ? 0.1 + (Math.abs(u.y - ARENA.h / 2) / ARENA.h) * 0.4 + frand(0, 0.12) : frand(0, 0.12));
      }
      return v;
    });
    this.order = this.views.slice().sort((p, q) => p.u.y - q.u.y);
    this.live.kills = this.live.losses = this.live.time = 0;
    this.live.mine = b.alive[0];
    this.live.theirs = b.alive[1];
    this.live.hp[0] = this.live.hp[1] = 1;
  }

  /** starts the fight: the CHAMPION banner (a champion match), both corners popping in, READY..., then FIGHT! */
  start(setup: WaveSetup): void {
    const standing = new Map<string, View>();
    if (this.mode === 'prep') for (const v of this.views) if (v.u.team === 0 && v.born >= POP_IN) standing.set(v.key, v);
    const b = createBattle([setup.player, setup.enemy], setup.seed);
    this.battle = b;
    this.setup = setup;
    this.fx.clear();
    this.deaths.clear();
    this.deaths.setRatio(this.app.ratio);
    this.ball.reset();
    this.fading = false;
    this.marksA = 1;
    this.later.length = this.vines.length = this.leaps.length = this.globs.length = this.banners.length = 0;
    this.call = null;
    this.mode = 'intro';
    this.introT = this.endT = this.energy = 0;
    this.readyShown = this.endShown = this.byTime = false;
    this.streak = this.kos = this.koPop = this.cracksN = 0;
    this.streakT = 9;
    this.wordT = this.roarT = this.oohT = 0;
    this.zoomK = 0;
    this.zoomOn = false;
    this.winner = null;
    this.result = null;
    this.mvp = null;
    this.tugK = 0.5;
    this.tugA = 0;
    this.bossId = b.units.find((u) => u.boss && u.team === 1)?.id ?? b.units.find((u) => u.boss)?.id ?? -1;
    this.champion = setup.champion ?? (setup.boss || this.bossId >= 0);
    this.names = setup.names ?? ['YOU', 'RIVAL'];
    const keys = keysOf(b.units);
    this.views = b.units.map((u, i) => {
      const v = makeView(u, keys[i]);
      const was = standing.get(v.key);
      if (was) {
        v.ready = true;
        v.born = was.born;
        v.pose.t = was.pose.t;
      }
      return v;
    });
    // both corners pop in: row by row from the halfway line back, both sides together; in a row from the middle out
    const lead = INTRO_LEAD + (this.champion ? CHAMP_LEAD : 0);
    const rows: SimUnit[][][] = [[], []];
    for (const team of [0, 1] as Team[]) {
      const mine = b.units.filter((u) => u.team === team).sort((p, q) => Math.abs(p.y - ARENA.h / 2) - Math.abs(q.y - ARENA.h / 2));
      for (const u of mine) {
        const list = rows[team];
        const last = list[list.length - 1];
        if (last && Math.abs(last[0].y - u.y) < Math.max(4, u.r * 0.5)) last.push(u);
        else list.push([u]);
      }
    }
    const n = Math.max(rows[0].length, rows[1].length);
    const gap = clamp(ROWS_SPAN / Math.max(1, n), ROW_GAP.min, ROW_GAP.max);
    let last = lead;
    for (let i = 0; i < n; i++) {
      for (const team of [0, 1] as Team[]) {
        for (const u of rows[team][i] ?? []) {
          const v = this.views[u.id];
          v.popAt = lead + i * gap + (Math.abs(u.x - ARENA.w / 2) / (ARENA.w / 2)) * RIPPLE;
          last = Math.max(last, v.popAt);
        }
      }
    }
    this.readyAt = Math.max(last + POP_IN * 0.6, lead + 0.45);
    this.introEnd = this.readyAt + READY_HOLD;
    this.order = [];
    for (const v of this.views) if (v.born >= 0) this.order.push(v);
    this.bossA = 0;
    this.bossHp = 1;
    this.live.kills = this.live.losses = this.live.time = 0;
    this.live.mine = b.alive[0];
    this.live.theirs = b.alive[1];
    this.live.hp[0] = this.live.hp[1] = 1;
    music.set(this.champion ? 'champion' : 'fight');
    music.energy(0);
    if (this.champion) {
      this.banner('champion', 'CHAMPION', lead + 0.1, 'MATCH');
      sfx.play('champion');
    }
  }

  update(dt: number): void {
    this.t += dt;
    const fx = this.fx;
    fx.update(dt);
    const sdt = dt * fx.timeScale;
    const b = this.battle;

    if (this.mode === 'intro' && b) {
      this.introT += dt;
      for (const v of this.views) {
        if (this.introT < v.popAt) continue;
        if (v.born < 0) this.popIn(v);
        else if (v.ready) {
          v.ready = false;
          v.hopK = 0;
        }
      }
      if (!this.readyShown && this.introT >= this.readyAt) {
        this.readyShown = true;
        this.banner('ready', 'READY...', READY_HOLD + 0.02);
        sfx.play('ready');
        this.app.arena.cheer(2, 0.35);
      }
      if (this.introT >= this.introEnd) {
        this.mode = 'fight';
        // the simulator's own countdown has been the line-up: run it out at once (the fight is the same either way)
        for (const ev of b.step(Math.max(0, -b.time))) this.onEvent(ev);
      }
    } else if (this.mode === 'fight' && b) {
      for (const ev of b.step(sdt)) this.onEvent(ev);
    } else if (this.mode === 'end' && b) {
      this.endT += dt;
      if (!this.endShown && this.endT >= (this.zoomOn ? END_BANNER : this.byTime ? 0.8 : 0.4)) this.showEnd();
      if ((this.endT >= END_HOLD && this.deaths.count === 0) || this.endT >= END_MAX) this.finish(b);
    } else if (this.mode === 'prep') {
      for (const v of this.views) {
        if (v.born >= 0) continue;
        v.born += dt;
        if (v.born >= 0) this.popIn(v, v.born);
      }
    }

    // effects waiting their turn (a Cacto's second jab)
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      l.t -= sdt;
      if (l.t <= 0) {
        this.later.splice(i, 1);
        l.run();
      }
    }
    for (let i = this.vines.length - 1; i >= 0; i--) if ((this.vines[i].age += sdt) >= this.vines[i].life) this.vines.splice(i, 1);
    for (let i = this.leaps.length - 1; i >= 0; i--) if ((this.leaps[i].age += sdt) >= this.leaps[i].dur + 0.1) this.leaps.splice(i, 1);
    for (let i = this.globs.length - 1; i >= 0; i--) if ((this.globs[i].age += sdt) >= this.globs[i].dur + 0.12) this.globs.splice(i, 1);
    for (let i = this.banners.length - 1; i >= 0; i--) if ((this.banners[i].age += dt) >= this.banners[i].life) this.banners.splice(i, 1);
    if (this.call && (this.call.age += dt) >= this.call.life) this.call = null;
    this.updateCoins(dt);
    this.bonk -= dt;
    this.wordT -= dt;
    this.roarT -= dt;
    this.oohT -= dt;
    this.koPop = Math.max(0, this.koPop - dt * 3);
    this.streakT += sdt;
    this.scuffs = Math.min(3, this.scuffs + dt * 2.5);
    if (this.fading) {
      this.marksA -= dt / MARKS_FADE;
      if (this.marksA <= 0) {
        fx.ground.clear();
        this.fading = false;
        this.marksA = 1;
      }
    }
    // the end zoom closes in during the slow motion and eases back out for the result
    const zoomWant = this.zoomOn && this.endT < END_BANNER + 0.05 ? 1 : 0;
    this.zoomK += (zoomWant - this.zoomK) * Math.min(1, dt * (zoomWant ? 6 : 2.6));
    this.deaths.update(sdt);
    this.pose(dt, sdt);
    if (b) {
      this.ball.update(sdt, this.order);
      this.live.time = Math.max(0, b.time);
      this.live.mine = b.alive[0];
      this.live.theirs = b.alive[1];
      this.live.hp[0] = b.hpShare[0];
      this.live.hp[1] = b.hpShare[1];
      const tot = b.hpShare[0] + b.hpShare[1];
      this.tugK += ((tot > 0 ? b.hpShare[0] / tot : 0.5) - this.tugK) * Math.min(1, dt * 6);
      // the HUD steps aside for the last knock-out's close-up, and is back with the result
      const closeUp = this.zoomOn && this.endT < END_BANNER;
      const tugWant = this.mode !== 'prep' && this.mode !== 'over' && !closeUp && (this.mode !== 'intro' || this.introT > this.readyAt - 0.2) ? 1 : 0;
      this.tugA += (tugWant - this.tugA) * Math.min(1, dt * 6);
      if (this.bossId >= 0) {
        const boss = b.units[this.bossId];
        const shown = this.views[this.bossId].born >= 0;
        this.bossHp += (clamp(boss.hp / boss.maxHp, 0, 1) - this.bossHp) * Math.min(1, dt * 10);
        const want = shown && (boss.alive || this.bossHp > 0.01) && this.mode !== 'over' && !(this.zoomOn && this.endT < END_BANNER) ? 1 : 0;
        this.bossA += (want - this.bossA) * Math.min(1, dt * (want ? 6 : 2.5));
      }
    }
  }

  /** draws the arena backdrop (app.arena.drawBack), the units and effects and app.arena.drawFront, through the camera view the main screen set with camera.setView(rect) this frame */
  render(ctx: CanvasRenderingContext2D): void {
    const arena = this.app.arena;
    const v = viewRect();
    const K = viewScale();
    const ox = screenX(0);
    const oy = screenY(0);
    const fx = this.fx;
    fx.ground.setRatio(this.app.ratio * K);
    setStickerRes(this.app.ratio * K);
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    // the end zoom: everything grows about the last knock-out, which drifts toward the middle (never past the view)
    const zk = easeOutCubic(clamp(this.zoomK, 0, 1));
    const zoomed = zk > 0.002;
    if (zoomed) {
      const z = 1 + ZOOM * zk;
      const px = screenX(this.zoomX);
      const py = screenY(this.zoomY);
      let tx = lerp(px, v.x + v.w / 2, 0.4 * zk) - px * z;
      let ty = lerp(py, v.y + v.h / 2, 0.4 * zk) - py * z;
      tx = clamp(tx, (v.x + v.w) * (1 - z), v.x * (1 - z));
      ty = clamp(ty, (v.y + v.h) * (1 - z), v.y * (1 - z));
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(z, z);
    }
    // the field shakes with the camera; the still backdrop under it keeps the uncovered strip filled
    const cx = Math.round(fx.camera.x * K);
    const cy = Math.round(fx.camera.y * K);
    if (cx || cy) arena.drawBack(ctx, this.t);
    ctx.save();
    ctx.translate(cx, cy);
    arena.drawBack(ctx, this.t);
    if (this.mode === 'prep') this.drawGhosts(ctx, v, K, ox, oy);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(K, K);
    fx.ground.draw(ctx, this.marksA);
    fx.drawUnder(ctx);
    this.drawLeapMarks(ctx);
    this.drawGlobShadows(ctx);
    this.deaths.drawUnder(ctx);
    this.drawField(ctx, K, false);
    this.drawVines(ctx);
    this.drawGlobs(ctx);
    this.drawTags(ctx, K);
    fx.drawOver(ctx);
    this.drawMvp(ctx);
    ctx.restore();
    arena.drawFront(ctx, this.t);
    ctx.restore();
    if (zoomed) ctx.restore();
    // over the pitch, unshaken and unzoomed: the corner lights, flashes, the HUD, the banners
    this.drawCorners(ctx, v);
    fx.drawScreen(ctx);
    this.drawHud(ctx, v);
    this.drawBanners(ctx, v);
    ctx.restore();
    if (!this.coinsOnTop) this.renderCoins(ctx);
  }

  /** the KO coins flying to coinTarget (screen px, not clipped to the view): render() draws them unless coinsOnTop */
  renderCoins(ctx: CanvasRenderingContext2D): void {
    if (!this.coinN) return;
    const tx = this.coinTarget.x;
    const ty = this.coinTarget.y;
    for (let i = 0; i < this.coinN; i++) {
      const c = this.coins[i];
      if (c.arrived >= 0) {
        // a sparkle ring where it went in
        const k = c.arrived / 0.25;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 2.5 * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(tx, ty, 6 + 18 * easeOutCubic(k), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      if (c.age < 0) continue;
      drawCoin(ctx, c.x, c.y, COIN_R * (c.age < 0.1 ? 0.5 + 5 * c.age : 1), c.spin + c.age * 14);
    }
  }

  /** non-null once the fight is over and its last effects have played */
  outcome(): WaveOutcome | null {
    return this.result;
  }

  phase(): 'prep' | 'fight' | 'over' {
    return this.mode === 'prep' ? 'prep' : this.mode === 'over' ? 'over' : 'fight';
  }

  // ---- for the dev page
  /** the fight's clock: -99 before the bell, then the simulator's seconds */
  get time(): number {
    return !this.battle || this.mode === 'intro' || this.mode === 'prep' ? -99 : this.battle.time;
  }
  /** marks the fight has left on the grass */
  get marks(): number {
    return this.fx.ground.count;
  }
  /** particles flying */
  get load(): number {
    return this.fx.load;
  }
  /** what the dev page fast-forwards to: the current combo call, the end clock, words and numbers up, coins flying */
  get debug(): { call: string; endT: number; mode: Mode; pops: number; coins: number; kos: number; glob: number } {
    let glob = 0;
    for (const g of this.globs) glob = Math.max(glob, g.age / g.dur);
    return { call: this.call?.text ?? '', endT: this.endT, mode: this.mode, pops: this.fx.popping, coins: this.coinN, kos: this.kos, glob };
  }

  // ------------------------------------------------------------------ the line-up

  /** a fighter pops onto the pitch with a puff and a ring of its corner's colour */
  private popIn(v: View, late = 0): void {
    v.born = Math.max(0, late);
    if (!this.order.includes(v)) this.order.push(v);
    const u = v.u;
    if (this.mode === 'prep' && u.team === 1) return; // the coming opponent appears quietly
    const r = u.r * DRAW;
    this.fx.dust(u.x, u.y - r * 0.2, 2, r * 0.4 + 3, true);
    this.fx.ring(u.x, u.y, PAL.team[u.team].light, r * 0.6, r * 1.7 + 4, 0.32, 0);
    v.sqV -= 3; // it lands with a stretch
    if (v.popAt >= 0 && this.mode === 'intro') sfx.play('deploy', 0, { x: screenX(u.x), enemy: u.team === 1 });
    if (u.boss && this.mode === 'intro') {
      sfx.play('bossStomp', 0, { x: screenX(u.x) });
      this.fx.ring(u.x, u.y, PAL.white, r, r * 3.4, 0.5, 0);
      this.fx.dust(u.x, u.y, 8, r * 0.5 + 4, true);
      this.fx.shake(4, 0.35);
      this.app.arena.cheer(1, 0.8);
    }
  }

  // ------------------------------------------------------------------ the fight's events

  private onEvent(ev: SimEvent): void {
    const b = this.battle!;
    const fx = this.fx;
    switch (ev.type) {
      case 'start':
        // FIGHT!: the bell, the brass hit, the crowd up
        this.banner('fight', 'FIGHT!', 0.85);
        sfx.play('bellStart');
        sfx.play('fight');
        this.roar(2);
        fx.ring(ARENA.w / 2, ARENA.h / 2, PAL.white, 10, 160, 0.5, 0);
        fx.shake(4, 0.3);
        fx.flash(PAL.white, 0.14, 0.22);
        this.app.arena.cheer(2, 1);
        break;
      case 'swing': {
        const u = b.units[ev.unit];
        const v = this.views[u.id];
        v.strike = 1;
        v.sqV -= 2.2; // a stretch into the blow
        const at = this.at(u.x, u.team);
        if (ev.weapon) {
          sfx.play(SWING[ev.weapon], 0, at);
          if (fchance(0.25)) this.voice(u, 'attack');
        } else this.voice(u, 'attack', true);
        break;
      }
      case 'throw':
        this.onThrow(ev);
        break;
      case 'splat':
        this.onSplat(ev);
        break;
      case 'hit':
        this.onHit(ev);
        break;
      case 'death':
        this.onDeath(ev);
        break;
      case 'land': {
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        if (ev.big) {
          // Dandy comes down off its seeds: a ring on the grass as wide as its splash, a puff, a jolt
          fx.ring(ev.x, ev.y, PAL.white, r * 0.6, r + 38, 0.4, 0);
          fx.ring(ev.x, ev.y, PAL.team[u.team].light, r * 0.4, r + 24, 0.3, 0);
          fx.dust(ev.x, ev.y, 7, r * 0.45 + 4, true);
          fx.burst(ev.x, ev.y - r, { colors: PAL.seed, n: 6, speed: 90, size: 3.2, life: 0.9, gravity: 30, shape: 'petal', dir: -Math.PI / 2, spread: 1.4, drag: 2 });
          fx.groundMark('scuff', ev.x, ev.y + 1, r * 2.8, 12);
          this.views[u.id].sqV += 6;
          this.bigHit(3, 0.03);
          this.word('BONK!', ev.x, ev.y - r * 2);
          sfx.play('leapLand', 0, this.at(ev.x, u.team));
          this.ball.bump(ev.x, ev.y, 60, 220);
        } else {
          if (b.alive[0] + b.alive[1] <= QUIET) fx.dust(ev.x, ev.y, 1, r * 0.35 + 2, true);
          if (this.scuffs >= 1) {
            this.scuffs--;
            fx.groundMark('scuff', ev.x, ev.y + 1, r * 2.2, frand(9, 13));
          }
          this.views[u.id].sqV += 3;
          sfx.play('hop', 0, this.at(ev.x, u.team));
          this.ball.bump(ev.x, ev.y, 26, 110);
        }
        break;
      }
      case 'dodge': {
        // Shroom boings aside on its spring in a puff of spores: MISS
        const u = b.units[ev.unit];
        const a = b.units[ev.from];
        const v = this.views[u.id];
        const r = u.r * DRAW;
        const across = Math.atan2(u.y - a.y, u.x - a.x) + (fchance(0.5) ? 1 : -1) * Math.PI / 2;
        v.dodge = 1;
        v.dodgeDir = across;
        v.sqV -= 5;
        fx.burst(ev.x, ev.y - r * 0.9, { colors: PAL.spores, n: 6, speed: 70, size: r * 0.3 + 2, life: 0.5, gravity: -24, shape: 'puff' });
        fx.burst(ev.x, ev.y - r * 1.2, { colors: PAL.spores, n: 4, speed: 50, size: 2.2, life: 0.7, gravity: -30, shape: 'dot', drag: 1.5, scatter: r * 0.5 });
        fx.comic(ev.x, ev.y - r * 2.2, 'MISS', MISS, { size: 13, life: 0.5, rise: 14 });
        sfx.play('dodge', 0, this.at(ev.x, u.team));
        break;
      }
      case 'shell': {
        // Tulip folds its metal petals into an armoured bud (the art closes it from pose.shell), or opens again
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        fx.ring(ev.x, ev.y - r * 0.9, PAL.plates[0], r * 0.6, r * 1.7, 0.3);
        fx.burst(ev.x, ev.y - r * 1.2, { colors: PAL.plates, n: ev.on ? 5 : 3, speed: 120, size: 3.5, life: 0.35, gravity: 200, shape: 'star', ink: true });
        fx.dust(ev.x, ev.y, 3, r * 0.3 + 2, true);
        this.views[u.id].sqV += ev.on ? 6 : -4;
        sfx.play(ev.on ? 'shellClose' : 'shellOpen', 0, this.at(ev.x, u.team));
        break;
      }
      case 'leap': {
        // Dandy pops its seed-puff open and floats for the back line: a puff where it took off, a ring where it lands
        const u = b.units[ev.unit];
        fx.dust(ev.x0, ev.y0, 4, u.r * 0.4 + 3, true);
        fx.ring(ev.x0, ev.y0, PAL.white, u.r * 0.5, u.r * 1.8, 0.3, 0);
        fx.burst(ev.x0, ev.y0 - u.r * 2, { colors: PAL.seed, n: 5, speed: 70, size: 3, life: 0.9, gravity: 20, shape: 'petal', drag: 2 });
        this.leaps.push({ unit: ev.unit, x1: ev.x1, y1: ev.y1, age: 0, dur: ev.dur });
        sfx.play('leapLaunch', 0, this.at(ev.x0, u.team));
        break;
      }
      case 'slide': {
        // Pumpkin tucks in and bowls (the art rolls it from pose.spin)
        const u = b.units[ev.unit];
        fx.dust(ev.x, ev.y, ev.on ? 4 : 3, u.r * 0.4 + 3, true);
        if (ev.on) sfx.play('bellySlide', 0, this.at(ev.x, u.team));
        break;
      }
      case 'slam': {
        // Pumpkin bowls into the line: a ring as wide as the shove, a burst of dust, STRIKE! when it bowls several
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        fx.ring(ev.x, ev.y, PAL.white, r * 0.5, r * 1.6 + 16 + ev.n * 8, 0.35, 0);
        fx.burst(ev.x, ev.y - r * 0.3, { colors: PAL.dust, n: 6 + ev.n * 2, speed: 150, size: r * 0.3 + 3, life: 0.5, gravity: -20, shape: 'puff', dir: u.aim, spread: 1.1 });
        fx.impact(ev.x, ev.y - r * 0.8, r * 0.8 + 12, PAL.impact, 0.2);
        this.bigHit(3 + ev.n, 0.04, u.aim, 4);
        this.word(ev.n >= 1 ? 'STRIKE!' : 'BONK!', ev.x, ev.y - r * 2.2, true);
        sfx.play('batHit', 0, this.at(ev.x, u.team));
        this.ball.kick(ev.x, ev.y, u.aim, 1);
        break;
      }
      case 'charge': {
        // Bamboo sets for its dash: a huff and a scrape
        const u = b.units[ev.unit];
        fx.burst(ev.x + u.face * u.r * 0.9, ev.y - u.r * 0.9, { colors: [PAL.white], n: 2, speed: 40, size: u.r * 0.25 + 2, life: 0.4, gravity: -30, shape: 'puff', dir: u.face > 0 ? 0 : Math.PI, spread: 0.5 });
        fx.dust(ev.x, ev.y, 2, u.r * 0.35 + 2, true);
        this.views[u.id].sqV += 4;
        break;
      }
      case 'stomp': {
        // Oak's root ground-pound (or a boss's stomp): a ring rolls out, the grass cracks, dust all round
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        const reach = r + 30;
        fx.ring(ev.x, ev.y, PAL.cream, r * 0.6, reach + 10, 0.45, 0);
        fx.ring(ev.x, ev.y, PAL.white, r * 0.4, reach, 0.32, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + frand(-0.3, 0.3);
          fx.dust(ev.x + Math.cos(a) * reach * 0.7, ev.y + Math.sin(a) * reach * 0.4, 1, r * 0.25 + 3, true);
        }
        fx.groundMark('divot', ev.x, ev.y + 2, r * 1.6, 12);
        if (this.cracksN++ < 8) cracks(fx.ground.paint(), ev.x, ev.y, reach * 0.7);
        this.views[u.id].sqV += 7;
        this.bigHit(u.boss ? 5 : 3, u.boss ? 0.05 : 0.035);
        if (ev.n > 0) this.word('SMASH!', ev.x, ev.y - r * 2.3, true);
        sfx.play('bossStomp', 0, this.at(ev.x, u.team));
        this.ball.bump(ev.x, ev.y, reach + 30, 260);
        break;
      }
      case 'poison': {
        // Scorp's poison working: lime bubbles rise off the victim, and a small lime number
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        fx.burst(ev.x, ev.y - r * 1.2, { colors: PAL.poison, n: 3, speed: 30, size: r * 0.16 + 2, life: 0.8, gravity: -70, shape: 'bubble', drag: 1.4, scatter: r * 0.5 });
        const view = this.views[u.id];
        const lost = Math.min(ev.dmg, Math.max(0, view.hpSeen));
        view.hpSeen -= lost;
        if (lost >= 0.5) fx.number(ev.x, ev.y - this.headOf(u) - 6, lost, { key: u.id + 100000, style: NUMBER_STYLE.poison, size: 12 });
        sfx.play('poison', 0, this.at(ev.x, u.team));
        break;
      }
      case 'enrage':
        this.banner('overtime', 'OVERTIME!', 1.3);
        sfx.play('enrage');
        this.app.arena.cheer(2, 0.7);
        break;
      case 'end':
        this.winner = ev.winner;
        this.mode = 'end';
        this.endT = 0;
        this.byTime = ev.byTime;
        music.energy(0);
        if (ev.byTime) {
          this.banner('time', 'TIME!', 0.9);
          fx.flash(PAL.white, 0.14, 0.3);
          sfx.play('bellEnd');
        }
        break;
      default:
        break;
    }
  }

  private onHit(ev: HitEvent): void {
    const b = this.battle!;
    const fx = this.fx;
    const v = b.units[ev.to];
    const a = b.units[ev.from];
    const view = this.views[v.id];
    const r = v.r * DRAW;
    const x = ev.x;
    const y = ev.y - r * 0.9; // the middle of its body
    const dir = ev.dir;
    const c = Math.cos(dir);
    const sn = Math.sin(dir);
    const at = this.at(x, a.team);
    const crowded = b.alive[0] + b.alive[1] > CROWDED;
    // how big the blow is: its share of the victim's health, a crit, a heavy or special blow, the shove
    const big = clamp((ev.dmg / Math.max(1, v.maxHp)) * 2.2 + (ev.crit ? 0.45 : 0) + (ev.heavy ? 0.3 : 0) + (ev.blow ? 0.35 : 0) + ev.knock / 70, 0, 1.5);

    // every hit lands: a flash, a squash on the victim, the number (what it really lost: no overkill)
    if (ev.dmg > 0) {
      view.flash = 1;
      view.sqV += 3 + 5 * Math.min(1, big);
      const lost = Math.min(ev.dmg, Math.max(0, view.hpSeen));
      view.hpSeen -= lost;
      if (lost >= 0.5 || ev.crit) {
        const style = ev.glob ? NUMBER_STYLE.poison : v.team === 1 ? NUMBER_STYLE.mine : NUMBER_STYLE.theirs;
        fx.number(ev.x, ev.y - this.headOf(v) - 4, Math.max(1, lost), { key: v.id, crit: ev.crit, style });
      }
    }
    // the shove: a dust puff kicked up at its feet
    if (ev.knock > 7) {
      fx.burst(ev.x - c * r * 0.3, ev.y, { colors: PAL.dust, n: ev.knock > 20 ? 3 : 2, speed: 40 + ev.knock * 1.5, size: r * 0.28 + 2, life: 0.4, gravity: -20, shape: 'puff', dir, spread: 0.7, under: true });
      if (ev.knock > 24 && this.scuffs >= 1) {
        this.scuffs--;
        fx.groundMark('scuff', ev.x, ev.y + 1, r * 2.2, 10);
      }
    }

    if (ev.spike) {
      // Spike's pencil quills bite back: coloured pencil tips spring off at the attacker
      fx.burst(x, y, { colors: PAL.pencils, n: crowded ? 3 : 5, speed: 160, size: r * 0.2 + 2.5, life: 0.34, gravity: 120, shape: 'shard', dir: dir, spread: 0.9, ink: true });
      sfx.play('thorns', 0, at);
      this.voice(v, 'hurt');
      return;
    }
    if (ev.glob) {
      // a Scorp's glob splatting on it: the splat itself is the 'splat' event; here a green drip
      fx.burst(x, y, { colors: PAL.poison, n: 3, speed: 70, size: 2.6, life: 0.4, gravity: 260, shape: 'dot', floor: ev.y, depth: r * 0.4 });
      if (ev.crit) this.critHit(x, y, dir, big, at);
      if (ev.dmg > 0) this.voice(v, 'hurt');
      return;
    }
    if (ev.pinch === 2) {
      // a Cacto's second jab lands a beat after the first
      this.later.push({ t: JAB_GAP, run: () => this.jab(x, y, r, dir, -1) });
      if (ev.crit) this.critHit(x, y, dir, big, at);
      return;
    }
    if (ev.pinch === 1) {
      this.jab(x, y, r, dir, 1);
      sfx.play('doubleJab', 0, at);
    } else if (ev.blow === 'charge') {
      // Bamboo's dashing strike: an impact, dust thrown along the blow, a jolt, WHAM!
      fx.impact(x, y, r * 0.9 + 16, PAL.impact, 0.22);
      fx.ring(x, y, PAL.white, r * 0.6, r * 2.3 + 12, 0.3);
      fx.burst(ev.x, ev.y, { colors: PAL.dust, n: 7, speed: 170, size: r * 0.3 + 3, life: 0.5, gravity: -20, shape: 'puff', dir, spread: 0.7 });
      this.bigHit(4, 0.05, dir, 5);
      this.word('WHAM!', x + c * r * 0.5, y - r);
      sfx.play('chargeImpact', 0, at);
      this.ball.kick(ev.x, ev.y, dir, 1);
    } else if (ev.blow === 'slam' || ev.blow === 'stomp' || ev.blow === 'landing') {
      // the big ring is the slam's / stomp's / landing's own event: here only a small puff on each one hit
      fx.dust(ev.x, ev.y, 1, r * 0.3 + 2, true);
    } else if (a.pet === 'angler') {
      // Snapper's vine: it lashes out to the foe; a pull reels it in
      this.vines.push({ from: a.id, to: v.id, age: 0, life: ev.pull ? VINE_LIFE : SNAP_LIFE, pull: ev.pull });
      fx.burst(x, y, { colors: [PAL.white, PAL.vine.light], n: 3, speed: 80, size: 3, life: 0.25, gravity: 0, shape: 'star' });
      if (ev.pull) sfx.play('hookPull', 0, at);
      else if (ev.weapon) sfx.play(hitSound(ev.weapon), 0, at);
      else sfx.play('punch', 0, at);
    } else if (ev.blocked) {
      // a clang on the shield: a ring and sparks thrown back
      sfx.play('block', 0, at);
      if (!crowded) fx.ring(x - c * r, y - sn * r, PAL.white, r * 0.4, r * 1.4 + 4, 0.2);
      fx.burst(x - c * r, y - sn * r, { colors: [PAL.cream, PAL.white], n: 3, speed: 150, size: 3.5, life: 0.26, gravity: 260, shape: 'star', dir: dir + Math.PI, spread: 0.9 });
    } else if (ev.weapon === 'bat') {
      sfx.play('batHit', 0, at);
      fx.dust(ev.x + c * r, ev.y, 2, r * 0.35 + 3, true);
      this.ball.kick(ev.x, ev.y, dir, ev.heavy ? 1 : 0.7);
      fx.ring(x, y, PAL.white, r * 0.5, r * 2 + 8, 0.24);
      fx.impact(x + c * r * 0.4, y, r * 0.7 + (ev.heavy ? 14 : 9), PAL.impact, 0.18);
      if (big > 0.5) this.word('BONK!', x, y - r * 1.2);
    } else if (ev.weapon === 'knife') {
      sfx.play('knifeHit', 0, at);
      const s = dir + Math.PI / 2 + (ev.from % 2 ? 0.5 : -0.5);
      const len = r * 1.8 + 10;
      fx.streak(x - (Math.cos(s) * len) / 2, y - (Math.sin(s) * len) / 2, s, len, PAL.white, 2.8, 0.14);
    } else if (ev.weapon === 'spear') {
      sfx.play('spearHit', 0, at);
      fx.streak(x - c * (r + 16), y - sn * (r + 16), dir, r * 2 + 28, PAL.white, 2.4, 0.16);
    } else if (ev.weapon === 'shield') {
      sfx.play('shieldBash', 0, at);
      if (!crowded) fx.ring(x, y, PAL.white, r * 0.5, r * 1.5 + 4, 0.2);
      fx.dust(ev.x + c * r, ev.y, 2, r * 0.3 + 2, true);
    } else {
      // a glove landing: a meaty thwack and a little pow of light
      sfx.play('punch', 0, at);
      if (!crowded || big > 0.4) fx.impact(x - c * r * 0.3, y - sn * r * 0.3, r * 0.45 + 6 + 10 * Math.min(1, big), PAL.jab, 0.13);
      if (!crowded) fx.burst(x, y, { colors: [PAL.white, PAL.impact], n: 2, speed: 90, size: 2.6, life: 0.2, gravity: 160, dir, spread: 0.8, shape: 'star' });
    }

    if (ev.pack > 0 && !crowded) {
      // Chicks swarming together: a feather for every friend helping
      fx.burst(x, y, { colors: PAL.feather, n: ev.pack, speed: 90, size: 3.2, life: 0.5, gravity: 60, shape: 'petal', dir: -Math.PI / 2, spread: 1.2 });
    }
    if (ev.slap) {
      // a Roo's knock-back punch: a round pow, and POW! when it really lands
      fx.impact(x - c * r * 0.3, y - sn * r * 0.3, r * 0.7 + 10, PAL.jab, 0.16);
      if (!crowded) fx.ring(x, y, PAL.white, r * 0.3, r * 1.4 + 4, 0.18);
      if (big > 0.55) this.word('POW!', x, y - r * 1.2);
    }
    if (ev.armour) {
      // Oak's bark: a clank of chips
      fx.burst(x - c * r * 0.6, y - sn * r * 0.6, { colors: ['#c9a27a', '#f1dcc0', '#8f6a48'], n: 3, speed: 130, size: 3.2, life: 0.25, gravity: 220, shape: 'shard', dir: dir + Math.PI, spread: 1, ink: true });
      sfx.play('armourClank', 0, at);
    }
    if (ev.shell) {
      // landed on a Tulip's closed bud: a tink off its metal petals
      fx.burst(x, y + r * 0.3, { colors: [PAL.white, PAL.tink], n: 3, speed: 120, size: 3, life: 0.2, gravity: 200, shape: 'star', dir: -Math.PI / 2, spread: 1.2 });
      sfx.play('block', 0, at);
    }
    if (ev.stun) sfx.play('stun', 0, at);
    if (ev.crit) this.critHit(x, y, dir, big, at);
    else if (big > 0.35) this.bigHit(1 + 3.5 * big, big > 0.7 ? 0.035 : 0.018, dir, 1 + 3 * big);
    if (ev.dmg > 0) this.voice(v, 'hurt');
  }

  /** a critical hit: the crit sound, a gold burst, a bigger shake and hit-stop, a comic word, now and then the crowd's OOOH */
  private critHit(x: number, y: number, dir: number, big: number, at: { x: number; enemy: boolean }): void {
    const fx = this.fx;
    sfx.play('crit', 0, at);
    fx.impact(x, y, 22 + 10 * Math.min(1, big), '#ffd23f', 0.22);
    fx.burst(x, y, { colors: PAL.star, n: 5, speed: 170, size: 4.5, life: 0.4, gravity: 200, shape: 'star', ink: true });
    this.bigHit(2.5 + 3 * Math.min(1, big), 0.045, dir, 3);
    if (big > 0.7) this.word(fchance(0.5) ? 'POW!' : 'WHAM!', x, y - 24);
    if (this.oohT <= 0 && big > 0.6) {
      this.oohT = 2.5;
      sfx.play('ooh');
      this.app.arena.cheer(2, 0.5);
    }
  }

  /** one of a Cacto's two jabs: a quick pow and a short thrust, the second one a little lower */
  private jab(x: number, y: number, r: number, dir: number, side: number): void {
    const fx = this.fx;
    const ox = -Math.sin(dir) * r * 0.35 * side;
    const oy = Math.cos(dir) * r * 0.35 * side;
    fx.impact(x + ox, y + oy, r * 0.5 + 7, PAL.jab, 0.12);
    fx.streak(x + ox - Math.cos(dir) * (r + 8), y + oy - Math.sin(dir) * (r + 8), dir, r + 14, PAL.white, 2.2, 0.12);
    if (side < 0) sfx.play('punch', 0, { x: screenX(x) });
  }

  /** a Scorp lobs a glob of poison from its tail flask */
  private onThrow(ev: Extract<SimEvent, { type: 'throw' }>): void {
    const b = this.battle!;
    const u = b.units[ev.unit];
    const view = this.views[u.id];
    const r = u.r * DRAW;
    const d = Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0);
    const tg = b.units[ev.target];
    view.strike = 1;
    view.sqV -= 2.5;
    // from the flask's mouth, up over its back, to the foe's middle
    this.globs.push({
      unit: u.id, x0: ev.x0 - u.face * r * 0.2, y0: ev.y0, x1: ev.x1, y1: ev.y1,
      h0: r * 1.9, h1: tg ? tg.r * DRAW * 0.8 : 6, arc: 24 + d * 0.3, age: 0, dur: Math.max(0.12, ev.dur),
    });
    if (this.globs.length > 40) this.globs.shift();
    this.fx.burst(ev.x0, ev.y0 - r * 1.9, { colors: PAL.poison, n: 2, speed: 50, size: 2.4, life: 0.3, gravity: 200, shape: 'dot' });
    this.voice(u, THROW_VOICE, true);
  }

  /** the glob lands: a sizzling splat, a puddle left on the grass (a miss too) */
  private onSplat(ev: Extract<SimEvent, { type: 'splat' }>): void {
    const fx = this.fx;
    const b = this.battle!;
    const u = b.units[ev.unit];
    // the glob of this Scorp nearest its end lands now
    let best = -1;
    for (let i = 0; i < this.globs.length; i++) if (this.globs[i].unit === ev.unit && (best < 0 || this.globs[i].dur - this.globs[i].age < this.globs[best].dur - this.globs[best].age)) best = i;
    const g = best >= 0 ? this.globs.splice(best, 1)[0] : null;
    const hy = ev.hit.length && g ? g.h1 : 2;
    fx.burst(ev.x, ev.y - hy, { colors: PAL.poison, n: ev.hit.length ? 8 : 6, speed: 120, size: 2.8, life: 0.5, gravity: 420, shape: 'dot', floor: ev.y, depth: 6, shadow: true });
    fx.burst(ev.x, ev.y - hy * 0.5, { colors: PAL.poison, n: 4, speed: 18, size: 2.6, life: 0.7, gravity: -50, shape: 'bubble', drag: 1.2, scatter: 7, stagger: 0.35 });
    fx.ring(ev.x, ev.y, PAL.glob.main, 3, 18, 0.3, 0);
    fx.impact(ev.x, ev.y - hy, 12, PAL.glob.light, 0.14);
    puddle(fx.ground.paint(), ev.x, ev.y + 1, ev.hit.length ? 8 : 7);
    sfx.play('globSplat', 0, this.at(ev.x, u.team));
    if (!ev.hit.length) fx.comic(ev.x, ev.y - 18, 'MISS', MISS, { size: 13, life: 0.45, rise: 12 });
  }

  private onDeath(ev: Extract<SimEvent, { type: 'death' }>): void {
    const b = this.battle!;
    const fx = this.fx;
    const u = b.units[ev.unit];
    const v = this.views[u.id];
    const i = this.order.indexOf(v);
    if (i >= 0) this.order.splice(i, 1);
    const r = u.r * DRAW;
    this.deaths.start(v.look, r, ev.x, ev.y, u.face, { weapon: ev.weapon, dir: ev.dir, power: ev.power, cause: ev.cause, blow: ev.blow });
    this.voice(u, 'death', true);
    this.ball.bump(ev.x, ev.y, 52, 240 + 120 * Math.min(1, ev.power));
    // KO!: a ring of stars bursts off it
    fx.burst(ev.x, ev.y - r, { colors: PAL.star, n: CROWDED < b.alive[0] + b.alive[1] ? 4 : 7, speed: 190, size: r * 0.22 + 3.5, life: 0.5, gravity: 160, shape: 'star', ink: true, drag: 1.5 });
    fx.ring(ev.x, ev.y - r, PAL.white, r * 0.5, r * 2.2 + 8, 0.28);
    if (u.team === 1) this.live.kills++;
    else this.live.losses++;
    this.onKo?.(u.team, screenX(ev.x), screenY(ev.y - r), u.boss);
    if (u.team === 1) {
      // your knock-out: coins for the cash pill, the KO counter, and a combo when they come quickly
      this.spawnCoins(ev.x, ev.y - r, u.boss ? 9 : 3);
      this.kos++;
      this.koPop = 1;
      this.streak = this.streakT < COMBO_GAP ? this.streak + 1 : 1;
      this.streakT = 0;
      if (!ev.last) this.combo(this.streak);
      if (this.bonk <= 0) this.bigHit(2 + Math.min(3, ev.power * 2), 0.03, ev.dir, 2);
    }
    if (u.boss) {
      fx.ring(ev.x, ev.y - r, PAL.white, r * 0.8, r * 3.2, 0.6);
      fx.ring(ev.x, ev.y, PAL.cream, r, r * 3.6, 0.7, 0);
      fx.flash(PAL.white, 0.16, 0.35);
      this.bonk = 0;
      this.bigHit(6, 0.07);
      this.roar(3);
      this.app.arena.cheer(u.team === 1 ? 0 : 1, 1);
    }
    if (ev.last) {
      // the blow that decides it: slow motion and a zoom toward it, a swell of light, the crowd up
      fx.slowMo(SLOW.factor, SLOW.secs);
      fx.flash(PAL.white, 0.18, 0.4);
      fx.ring(ev.x, ev.y - r, PAL.white, r, r * 4 + 60, 0.6);
      fx.shake(4, 0.5);
      this.zoomOn = true;
      this.zoomX = ev.x;
      this.zoomY = ev.y - r;
      sfx.play('slowmo');
      music.duck(0.6, 1.2);
      if (u.team === 1 && this.streak >= 2) this.combo(this.streak);
    }
  }

  /** your knock-outs in quick succession: DOUBLE KO!, TRIPLE KO!, RAMPAGE! (then RAMPAGE xN every other one) */
  private combo(n: number): void {
    if (n < 2) return;
    const i = Math.min(2, n - 2);
    const shout = n <= 4 || n % 2 === 0;
    if (!shout) {
      sfx.play('combo', n);
      return;
    }
    const c = CALLS[i];
    const text = n > 4 ? `RAMPAGE x${n}` : c.text;
    this.call = { kind: 'call', text, age: 0, life: 1.05, size: 42, style: { fill: '#fff38a', fill2: '#ffa51f', burst: c.burst, rim: null }, fit: 0, sub: '' };
    sfx.play(n > 4 && n % 4 !== 0 ? 'combo' : c.sound, n);
    if (n >= 3) {
      this.roar(n >= 4 ? 2 : 1);
      this.app.arena.cheer(0, n >= 4 ? 1 : 0.7);
    }
  }

  /** a launched body came down in the crowd at the side: those fans jump and go OOOH */
  private intoCrowd(x: number, _y: number): void {
    this.app.arena.cheer(x < ARENA.w / 2 ? 2 : 2, 0.7);
    if (this.oohT <= 0) {
      this.oohT = 1.6;
      sfx.play('ooh', 0, { x: screenX(x) });
    }
  }

  /** VICTORY! / DEFEAT / DRAW, the bell, the stinger, confetti for a win, the MVP tag */
  private showEnd(): void {
    this.endShown = true;
    const w = this.winner;
    const kind = w === 0 ? 'victory' : w === 1 ? 'defeat' : 'draw';
    this.banner(kind, kind === 'victory' ? 'VICTORY!' : kind === 'defeat' ? 'DEFEAT' : 'DRAW', 99);
    if (!this.byTime) sfx.play('bellEnd');
    sfx.play(kind === 'victory' ? 'victory' : 'defeat', 0, { delay: 0.05 });
    this.mvp = this.findMvp();
    if (kind === 'victory') {
      this.roar(3);
      this.app.arena.cheer(0, 1);
      const v = viewRect();
      for (const side of [0, 1]) {
        this.fx.burst(side ? v.x + v.w - 10 : v.x + 10, v.y + v.h * 0.85, {
          colors: ['#ffe066', '#4f9bff', '#ffffff', '#ff7b9c', '#7ed16b'], n: 40, speed: 900, size: 7, life: 2.2, gravity: 620, shape: 'confetti',
          dir: side ? -Math.PI * 0.64 : -Math.PI * 0.36, spread: 0.32, drag: 1.5, screen: true, stagger: 0.2,
        });
      }
    } else if (kind === 'defeat') this.app.arena.cheer(1, 1);
    if (this.mvp?.alive) {
      const u = this.battle!.units[this.mvp.id];
      this.fx.ring(u.x, u.y, '#ffe066', u.r, u.r * 3.2, 0.6, 0);
      this.fx.burst(u.x, u.y - u.r * 2.4, { colors: PAL.star, n: 6, speed: 120, size: 4, life: 0.6, gravity: 120, shape: 'star', ink: true });
    }
  }

  /** your best fighter: in the squad mvpOf names (most KOs, then damage), the unit with the most KOs */
  private findMvp(): Mvp | null {
    const b = this.battle;
    if (!b) return null;
    const bySquad = new Map<number, SquadScore>();
    for (const u of b.units) {
      if (u.team !== 0) continue;
      let s = bySquad.get(u.squad);
      if (!s) bySquad.set(u.squad, (s = { key: u.spec.key, pet: u.pet, kos: 0, dmg: 0 }));
      s.kos += u.kos;
      s.dmg += u.dealt;
    }
    const best = mvpOf([...bySquad.values()]);
    if (!best) return null;
    let unit: SimUnit | null = null;
    for (const u of b.units) {
      if (u.team !== 0 || u.spec.key !== best.key) continue;
      if (!unit || u.kos > unit.kos || (u.kos === unit.kos && (u.alive && !unit.alive || (u.alive === unit.alive && u.dealt > unit.dealt)))) unit = u;
    }
    if (!unit) return null;
    return { id: unit.id, key: best.key, pet: best.pet, kos: best.kos, dmg: best.dmg, unitKos: unit.kos, alive: unit.alive };
  }

  /** a heavy blow: a short hit-stop, a shake and a shove of the camera, at most every BONK_GAP (longer in a crowd) */
  private bigHit(shake: number, stop: number, dir?: number, kick = 0): void {
    if (this.bonk > 0) return;
    const b = this.battle;
    this.bonk = BONK_GAP * (1 + (b ? (b.alive[0] + b.alive[1]) / 40 : 0));
    this.fx.shake(Math.min(7, shake), 0.2);
    this.fx.hitStop(stop);
    if (dir !== undefined && kick) this.fx.kick(dir, Math.min(6, kick));
  }

  /** a comic word beside a big blow, so the number above it stays clear (one at a time, WORD_GAP apart unless forced) */
  private word(text: string, x: number, y: number, force = false): void {
    if (this.wordT > 0 && !force) return;
    const w = WORDS[text];
    if (!w) return;
    const b = this.battle;
    this.wordT = WORD_GAP * (1 + (b ? (b.alive[0] + b.alive[1]) / 50 : 0));
    const side = x < ARENA.w / 2 ? 1 : -1;
    this.fx.comic(clamp(x + side * 34, 50, ARENA.w - 50), Math.max(30, y + 16), text, w.style, { size: 26, life: 0.6, rise: 12, rot: side * frand(0.05, 0.16) });
    sfx.play(w.sound, 0, { x: screenX(x) });
  }

  /** the crowd roars (n 1..3), not too often */
  private roar(n: number): void {
    if (this.roarT > 0 && n < 3) return;
    this.roarT = 1.4;
    sfx.play('roar', n);
  }

  private banner(kind: BannerKind, text: string, life: number, sub = ''): void {
    if (kind !== 'call') {
      const d = BANNER[kind];
      // a new big banner takes the place of the last one (FIGHT! replaces READY...)
      this.banners.length = 0;
      this.banners.push({ kind, text, age: 0, life, size: d.size, style: d.style, fit: 0, sub });
    }
  }

  /** a character's voice, now and then (never two from one fighter close together) */
  private voice(u: SimUnit, kind: VoiceKind, always = false): void {
    const v = this.views[u.id];
    if (kind !== 'death' && (v.voice > 0 || (!always && !fchance(kind === 'hurt' ? 0.3 : 1)))) return;
    v.voice = kind === 'attack' ? frand(0.7, 1.4) : frand(0.9, 1.6);
    sfx.play(petVoice(u.pet, kind), 0, this.at(u.x, u.team));
  }

  private at(ax: number, team: Team): { x: number; enemy: boolean } {
    return { x: screenX(ax), enemy: team === 1 };
  }

  /** how high a fighter's head is above its feet, arena px */
  private headOf(u: SimUnit): number {
    return petArt.headTop(this.views[u.id].look, u.r * DRAW);
  }

  private finish(b: Battle): void {
    const s = b.summary;
    this.mode = 'over';
    if (!s) return;
    const kills = s.size[1] - s.alive[1];
    const match = outcomeOf(s, this.setup?.player);
    match.champion = this.champion;
    this.result = {
      won: s.winner === 0,
      draw: s.winner === -1,
      kills,
      losses: s.size[0] - s.alive[0],
      survived: s.size[0] > 0 ? s.alive[0] / s.size[0] : 0,
      time: s.time,
      kos: kills,
      boss: s.bossKos[0] > 0,
      match,
      mvp: this.mvp ?? this.findMvp(),
      crits: s.crits[0],
      summary: s,
    };
  }

  // ------------------------------------------------------------------ the coins

  /** coins burst out of a knock-out (arena point) and, a moment later, fly to coinTarget */
  private spawnCoins(ax: number, ay: number, n: number): void {
    const sx = screenX(ax);
    const sy = screenY(ay);
    for (let i = 0; i < n; i++) {
      if (this.coinN >= COINS) break;
      const c = this.coins[this.coinN++];
      c.x = sx;
      c.y = sy;
      c.vx = frand(-120, 120);
      c.vy = frand(-300, -170);
      c.age = -i * 0.03;
      c.fly = frand(0.3, 0.42) + i * 0.05;
      c.dur = 0;
      c.spin = frand(0, TAU);
      c.arrived = -1;
    }
    sfx.play('coins', 0, { x: sx });
  }

  private updateCoins(dt: number): void {
    const tx = this.coinTarget.x;
    const ty = this.coinTarget.y;
    for (let i = 0; i < this.coinN; ) {
      const c = this.coins[i];
      let done = false;
      if (c.arrived >= 0) {
        c.arrived += dt;
        done = c.arrived >= 0.25;
      } else {
        c.age += dt;
        if (c.age < 0) {
          i++;
          continue;
        }
        if (c.age < c.fly) {
          // the burst: up and out, falling back
          c.vy += 900 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
        } else {
          if (c.dur === 0) {
            // off to the pill on a curve, speeding up
            c.x0 = c.x;
            c.y0 = c.y;
            c.cx = c.x + (tx - c.x) * 0.15 + (c.vx > 0 ? 50 : -50);
            c.cy = Math.min(c.y, ty) - 40;
            c.dur = 0.4 + Math.hypot(tx - c.x, ty - c.y) / 1500;
          }
          const k = Math.min(1, (c.age - c.fly) / c.dur);
          const e = k * k;
          c.x = bez(c.x0, c.cx, tx, e);
          c.y = bez(c.y0, c.cy, ty, e);
          if (k >= 1) {
            c.arrived = 0;
            this.onCoin?.();
          }
        }
      }
      if (done) {
        this.coins[i] = this.coins[--this.coinN];
        this.coins[this.coinN] = c;
      } else i++;
    }
  }

  // ------------------------------------------------------------------ poses

  private pose(dt: number, sdt: number): void {
    const b = this.battle;
    const fighting = this.mode === 'fight' || this.mode === 'end';
    const started = fighting && !!b && b.time >= 0;
    const fx = this.fx;
    let swinging = 0;
    const springK = Math.exp(-sdt * 9);
    for (const v of this.order) {
      const u = v.u;
      const p = v.pose;
      if (v.born >= 0) v.born += dt;
      v.voice -= sdt;
      p.t += sdt;
      v.strike = Math.max(0, v.strike - sdt / 0.3);
      v.flash = Math.max(0, v.flash - sdt / 0.16);
      v.moving += ((u.phase === 'move' ? 1 : 0) - v.moving) * Math.min(1, sdt * 12);
      v.dodge = Math.max(0, v.dodge - sdt * 4);
      v.shell += ((u.phase === 'shell' ? 1 : 0) - v.shell) * Math.min(1, sdt * 14);
      v.slide += ((u.phase === 'slide' ? 1 : 0) - v.slide) * Math.min(1, sdt * 12);
      // squash and stretch: a stiff, damped spring
      v.sqV += -v.sq * 520 * sdt;
      v.sqV *= springK;
      v.sq = clamp(v.sq + v.sqV * sdt, -0.32, 0.36);
      // the health bar: in once hurt; the lost part lags a moment, then drains
      const share = clamp(u.hp / u.maxHp, 0, 1);
      if (u.hp > v.hpSeen) v.hpSeen = u.hp; // a bud regrowing
      v.barA += ((share < 0.999 && u.alive ? 1 : 0) - v.barA) * Math.min(1, dt * 10);
      if (v.lag < share) v.lag = share;
      else if (u.sinceHit > 0.25) v.lag += (share - v.lag) * Math.min(1, sdt * 5);
      const attacking = u.phase === 'windup' || u.phase === 'recover';
      if (attacking) swinging++;
      // before the bell they look in toward the middle of the pitch; then the way the simulator says
      p.face = started ? u.face : u.x < ARENA.w / 2 ? 1 : -1;
      p.walk = u.walked;
      p.moving = v.moving;
      p.hop = u.phase === 'air' ? this.floatHop(u) : u.hop;
      if (this.mode === 'prep' && v.born >= POP_IN) {
        v.nextHop -= dt;
        if (v.nextHop <= 0) {
          v.nextHop = frand(3, 9);
          v.hopK = 0;
        }
      }
      if (v.hopK >= 0) {
        v.hopK += dt / READY_HOP;
        if (v.hopK >= 1) v.hopK = -1;
        else p.hop = Math.max(p.hop, Math.sin(Math.PI * v.hopK) * 0.35);
      }
      p.wind = u.phase === 'windup' && u.phaseDur > 0 ? clamp(u.phaseT / u.phaseDur, 0, 1) : 0;
      p.strike = v.strike;
      p.aimY = started ? Math.sin(u.aim) * 0.6 : 0;
      p.hurt = Math.max(v.flash, clamp(1 - u.sinceHit / 0.22, 0, 1) * 0.6);
      p.shell = v.shell;
      const pop = v.born < POP_IN ? Math.max(0.05, easeOutBack(Math.max(0, v.born) / POP_IN)) : 1;
      p.squashX = pop * (1 + 0.12 * v.slide + v.sq);
      p.squashY = pop * (1 - 0.1 * v.slide - v.sq * 0.85);
      p.spin = v.slide * u.face * 1.15;
      p.mood =
        this.winner !== null && this.winner !== -1 ? (this.winner === u.team ? 'cheer' : 'scared')
        : u.phase === 'stun' ? 'dizzy'
        : u.phase === 'shell' ? 'scared'
        : attacking || u.phase === 'slide' || u.charged ? 'angry'
        : 'idle';

      if (!fighting || !u.alive || sdt <= 0) continue;
      // trails: a Pumpkin's bowling roll, a dashing Bamboo's dust, Dandy's seeds, a poisoned fighter's bubbles
      v.trail -= sdt;
      if (v.trail > 0) continue;
      const r = u.r * DRAW;
      if (u.phase === 'slide') {
        v.trail = 0.05;
        const back = Math.atan2(u.vy, u.vx) + Math.PI;
        fx.burst(u.x + Math.cos(back) * r * 0.8, u.y, { colors: PAL.dust, n: 1, speed: 30, size: r * 0.3 + 2, life: 0.4, gravity: -10, shape: 'puff', under: true });
        fx.streak(u.x + Math.cos(back) * r * 0.4, u.y - r * 0.35, back, r * 2.4, PAL.white, 2.6, 0.22);
        if (this.scuffs >= 1) {
          this.scuffs -= 0.5;
          fx.groundMark('scuff', u.x, u.y + 1, r * 2, 8);
        }
      } else if (u.phase === 'air') {
        v.trail = 0.07;
        const f = this.feet(v);
        fx.burst(f.x + frand(-r, r), f.y - f.lift - r * 2.6, { colors: PAL.seed, n: 1, speed: 25, size: 2.8, life: 0.9, gravity: 25, shape: 'petal', drag: 1.5 });
      } else if (u.pet === 'rhino' && u.charged && v.moving > 0.5) {
        v.trail = 0.08;
        fx.burst(u.x - u.face * r * 0.7, u.y, { colors: PAL.dust, n: 1, speed: 25, size: r * 0.25 + 2, life: 0.35, gravity: -10, shape: 'puff', under: true });
        fx.streak(u.x - u.face * r * 1.2, u.y - r * frand(0.5, 1.3), u.face > 0 ? Math.PI : 0, r * 1.4, PAL.white, 1.8, 0.18);
      } else if (u.poison > 0) {
        v.trail = frand(0.35, 0.6);
        fx.burst(u.x + frand(-0.4, 0.4) * r, u.y - r * 1.4, { colors: PAL.poison, n: 1, speed: 15, size: r * 0.12 + 1.8, life: 0.7, gravity: -60, shape: 'bubble', drag: 1.2 });
      } else v.trail = 0.1;
    }
    // nearly sorted from the last frame: an insertion sort is the cheap way (far to near)
    const o = this.order;
    for (let i = 1; i < o.length; i++) {
      const v = o[i];
      let j = i - 1;
      while (j >= 0 && o[j].u.y > v.u.y) {
        o[j + 1] = o[j];
        j--;
      }
      o[j + 1] = v;
    }
    if (this.mode === 'fight' && started) {
      this.energy += (clamp(swinging / Math.max(5, o.length * 0.45), 0, 1) - this.energy) * Math.min(1, dt * 3);
      music.energy(this.energy);
    }
  }

  /** Dandy's float: the leap's progress 0..1, or -1 when it is not floating */
  private leapK(u: SimUnit): number {
    for (const l of this.leaps) if (l.unit === u.id) return clamp(l.age / l.dur, 0, 1);
    return -1;
  }

  /** while Dandy floats, its seed parachute stays open (the art opens it for any hop) */
  private floatHop(u: SimUnit): number {
    const k = this.leapK(u);
    if (k < 0) return Math.min(1, u.hop * 1.2);
    return clamp(Math.sin(Math.PI * k) * 2.4, 0, 1);
  }

  // ------------------------------------------------------------------ drawing (arena px)

  /** where a unit's feet are drawn this frame (a dodge steps it aside, Dandy's float lifts and sways it) */
  private feet(v: View): { x: number; y: number; lift: number } {
    const u = v.u;
    let x = u.x;
    let y = u.y;
    if (v.dodge > 0) {
      const k = Math.sin(Math.PI * v.dodge) * u.r * 0.8;
      x += Math.cos(v.dodgeDir) * k;
      y += Math.sin(v.dodgeDir) * k * 0.6;
    }
    let lift = 0;
    if (u.phase === 'air') {
      const k = this.leapK(u);
      if (k >= 0) {
        // up quickly as the puff opens, then a slow drift down on the seeds, swaying
        lift = LEAP_LIFT * (k < 0.25 ? easeOutCubic(k / 0.25) : 1 - ((k - 0.25) / 0.75) ** 2);
        x += Math.sin(k * Math.PI * 3) * 7 * (1 - k);
      } else lift = u.hop * LEAP_LIFT;
    }
    return { x, y, lift };
  }

  /** the shadows (one path), then the bodies far to near with the dying ones and the ball in their places */
  private drawField(ctx: Ctx, K: number, ghosts: boolean): void {
    const list = this.order;
    const prep = this.mode === 'prep';
    ctx.beginPath();
    for (const v of list) {
      if (v.born < 0 || (prep && (v.u.team === 1) !== ghosts)) continue;
      const u = v.u;
      const f = this.feet(v);
      const r = u.r * DRAW * Math.min(1, v.pose.squashX);
      const up = u.phase === 'air' ? f.lift / 30 : u.hop * 0.6;
      const k = 1 / (1 + up);
      const rx = r * 0.95 * k * (1 + 0.15 * v.slide);
      const ry = r * 0.32 * k;
      ctx.moveTo(f.x + r * 0.06 + rx, f.y + r * 0.03);
      ctx.ellipse(f.x + r * 0.06, f.y + r * 0.03, rx, ry, 0, 0, TAU);
    }
    ctx.fillStyle = SHADOW;
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!ghosts) this.ball.drawShadow(ctx);
    if (!ghosts) this.deaths.beginDepth();
    let ballDrawn = ghosts;
    for (const v of list) {
      if (v.born < 0 || (prep && (v.u.team === 1) !== ghosts)) continue;
      const u = v.u;
      const f = this.feet(v);
      if (!ballDrawn && this.ball.y <= u.y) {
        this.ball.draw(ctx);
        ballDrawn = true;
      }
      if (!ghosts) this.deaths.drawUpTo(ctx, u.y);
      const r = u.r * DRAW;
      ctx.save();
      ctx.translate(f.x, f.y - f.lift);
      ctx.scale(1 / K, 1 / K);
      petArt.drawPet(ctx, v.look, v.pose, r * K);
      ctx.restore();
    }
    if (!ballDrawn) this.ball.draw(ctx);
    if (!ghosts) this.deaths.drawOver(ctx);
  }

  /** PREP: the coming opponent stands faded at the far end (drawn whole into a layer, then laid down see-through) */
  private drawGhosts(ctx: Ctx, v: Readonly<ViewRect>, K: number, ox: number, oy: number): void {
    let any = false;
    for (const g of this.order) {
      if (g.u.team !== 1 || g.born < 0) continue;
      const sy = oy + g.u.y * K;
      if (sy > v.y - 10 && sy - g.u.r * 4 * K < v.y + v.h) {
        any = true;
        break;
      }
    }
    if (!any) return;
    const R = Math.max(1, this.app.ratio);
    const w = Math.max(1, Math.ceil(v.w * R));
    const h = Math.max(1, Math.ceil(v.h * R));
    if (!this.ghostCv || this.ghostCv.width !== w || this.ghostCv.height !== h) {
      this.ghostCv = document.createElement('canvas');
      this.ghostCv.width = w;
      this.ghostCv.height = h;
    }
    const g = this.ghostCv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(R * K, 0, 0, R * K, (ox - v.x) * R, (oy - v.y) * R);
    this.drawField(g, K, true);
    ctx.globalAlpha = GHOST;
    ctx.drawImage(this.ghostCv, v.x, v.y, v.w, v.h);
    ctx.globalAlpha = 1;
  }

  /** where each floating Dandy will land: a ring on the grass that firms up as it comes down */
  private drawLeapMarks(ctx: Ctx): void {
    if (!this.leaps.length) return;
    const b = this.battle!;
    ctx.lineWidth = 2;
    for (const l of this.leaps) {
      const u = b.units[l.unit];
      const k = clamp(l.age / l.dur, 0, 1);
      const a = clamp(l.age / 0.15, 0, 1) * clamp((l.dur + 0.1 - l.age) / 0.1, 0, 1);
      const rad = (u.r * DRAW + 22) * (1.25 - 0.25 * k);
      ctx.globalAlpha = a * (0.4 + 0.5 * k);
      ctx.strokeStyle = PAL.team[u.team].light;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -l.age * 30;
      ctx.beginPath();
      ctx.ellipse(l.x1, l.y1, rad, rad * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = a * 0.18 * k;
      ctx.fillStyle = PAL.team[u.team].main;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** a glob in the air: where it is on the ground (its shadow) and how high */
  private globAt(g: Glob, k: number): { x: number; y: number; h: number } {
    return { x: lerp(g.x0, g.x1, k), y: lerp(g.y0, g.y1, k), h: lerp(g.h0, g.h1, k) + g.arc * 4 * k * (1 - k) };
  }

  private drawGlobShadows(ctx: Ctx): void {
    if (!this.globs.length) return;
    ctx.fillStyle = SHADOW;
    for (const g of this.globs) {
      const p = this.globAt(g, clamp(g.age / g.dur, 0, 1));
      const s = 1 / (1 + p.h / 45);
      ctx.globalAlpha = 0.28 * s;
      ctx.beginPath();
      ctx.ellipse(p.x + p.h * 0.08, p.y + 1, 5.5 * s + 1.5, (5.5 * s + 1.5) * GROUND_FLAT, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** the globs: a lime blob with an ink rim and a shine, stretched along its flight, a fading trail behind it */
  private drawGlobs(ctx: Ctx): void {
    if (!this.globs.length) return;
    for (const g of this.globs) {
      const k = clamp(g.age / g.dur, 0, 1);
      // the trail: lime drops left behind, smaller and fainter
      ctx.fillStyle = PAL.glob.main;
      for (let i = 5; i >= 1; i--) {
        const q = k - i * 0.05;
        if (q <= 0) continue;
        const p = this.globAt(g, q);
        ctx.globalAlpha = 0.8 * (1 - i / 6);
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.h, 4.6 - i * 0.65, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const p = this.globAt(g, k);
      const n = this.globAt(g, Math.min(1, k + 0.02));
      const ang = Math.atan2(n.y - n.h - (p.y - p.h), n.x - p.x);
      const wob = 1 + 0.12 * Math.sin(g.age * 40);
      ctx.save();
      ctx.translate(p.x, p.y - p.h);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.4 * wob, 5.8 / wob, 0, 0, TAU);
      ctx.fillStyle = PAL.glob.main;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = PAL.ink;
      ctx.stroke();
      ctx.rotate(-ang);
      ctx.fillStyle = PAL.glob.dark;
      ctx.beginPath();
      ctx.ellipse(1, 2.2, 4, 1.8, 0, 0, TAU);
      ctx.fill();
      // a bubble on it
      ctx.fillStyle = PAL.glob.light;
      ctx.beginPath();
      ctx.arc(2.6, -1.8, 1.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(-2.4, -2.2, 1.7, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Snapper's vine: from its trap to the foe, a green stalk with leaves, pulled taut as it reels the foe in */
  private drawVines(ctx: Ctx): void {
    if (!this.vines.length) return;
    const b = this.battle!;
    ctx.lineCap = 'round';
    for (const h of this.vines) {
      const a = b.units[h.from];
      const t = b.units[h.to];
      if (!a.alive) continue;
      const ar = a.r * DRAW;
      const tr = t.r * DRAW;
      const k = h.age / h.life;
      // it lashes out fast, holds, and is gone
      const out = easeOutCubic(clamp(k / 0.3, 0, 1));
      const x0 = a.x + a.face * ar * 0.6;
      const y0 = a.y - ar * 1.7;
      const x1 = lerp(x0, t.x, out);
      const y1 = lerp(y0, t.y - tr * 0.9, out);
      const sag = (h.pull ? 16 * (1 - k) : 9) + 2;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2 + sag;
      ctx.globalAlpha = clamp((1 - k) / 0.25, 0, 1);
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(mx, my, x1, y1);
      };
      path();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 4.4;
      ctx.stroke();
      path();
      ctx.strokeStyle = PAL.vine.main;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      // two leaves along it
      for (const q of [0.35, 0.68]) {
        const lx = bez(x0, mx, x1, q);
        const ly = bez(y0, my, y1, q);
        const dx = bez(x0, mx, x1, q + 0.02) - lx;
        const dy = bez(y0, my, y1, q + 0.02) - ly;
        const ang = Math.atan2(dy, dx) + (q < 0.5 ? -0.9 : 0.9);
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(4, 0, 4.2, 2.1, 0, 0, TAU);
        ctx.fillStyle = PAL.vine.leaf;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = PAL.ink;
        ctx.stroke();
        ctx.restore();
      }
      // a curl round the foe
      ctx.strokeStyle = PAL.vine.light;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x1, y1 + 2, 3.2, -0.3, Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** over the bodies: small health bars over the hurt (one pass per colour), sparkles round a dizzy head */
  private drawTags(ctx: Ctx, K: number): void {
    if (this.mode === 'prep') return;
    const fighting = this.winner === null;
    const h = HP.h / Math.max(0.7, K);
    for (const v of this.order) {
      const u = v.u;
      if (v.born < 0 || !u.alive) continue;
      const bar = fighting && !u.boss && v.barA > 0.02;
      const stun = u.phase === 'stun';
      if (!bar && !stun) continue;
      const r = u.r * DRAW;
      const f = this.feet(v);
      const head = f.y - f.lift - petArt.headTop(v.look, r) * Math.min(1.15, v.pose.squashY) - u.hop * r * 0.8;
      if (bar) {
        const w = Math.round(clamp(r * 1.3, HP.w, 34));
        const x = Math.round(f.x - w / 2);
        const y = Math.round(head - h - 5);
        const share = clamp(u.hp / u.maxHp, 0, 1);
        ctx.globalAlpha = v.barA;
        ctx.fillStyle = PAL.bar.ink;
        ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
        ctx.fillStyle = PAL.bar.track;
        ctx.fillRect(x, y, w, h);
        if (v.lag > share) {
          ctx.fillStyle = PAL.bar.lag;
          ctx.fillRect(x, y, w * v.lag, h);
        }
        ctx.fillStyle = u.poison > 0 ? PAL.glob.main : PAL.bar.fill[u.team];
        ctx.fillRect(x, y, Math.max(1, w * share), h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillRect(x, y, Math.max(1, w * share), Math.max(1, h * 0.35));
      }
      ctx.globalAlpha = 1;
      if (stun) this.fx.orbitStars(ctx, f.x, head - 3, r * 0.75 + 3, this.t + u.id);
    }
    ctx.globalAlpha = 1;
  }

  /** after the fight: MVP over your best fighter still standing, with a little bob */
  private drawMvp(ctx: Ctx): void {
    const m = this.mvp;
    if (!m || !m.alive || !this.endShown || !this.battle) return;
    const v = this.views[m.id];
    if (!v || v.born < 0) return;
    const r = v.u.r * DRAW;
    const head = v.u.y - petArt.headTop(v.look, r) - 14 - Math.abs(Math.sin(this.t * 4)) * 4;
    const k = clamp(this.endT - END_BANNER, 0, 0.3) / 0.3;
    if (k <= 0) return;
    ctx.globalAlpha = k;
    stickerCached(ctx, 'MVP', v.u.x, head, 17, MVP_TAG, Math.sin(this.t * 3) * 0.06, 0.6 + 0.4 * easeOutBack(k), 0.6 + 0.4 * easeOutBack(k));
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ drawing (screen px)

  /** the intro: your corner lit blue from below, theirs red from above, as they pop in */
  private drawCorners(ctx: Ctx, v: Readonly<ViewRect>): void {
    if (this.mode !== 'intro') return;
    const k = this.introT;
    const a = clamp(k / 0.25, 0, 1) * clamp((this.readyAt + 0.3 - k) / 0.4, 0, 1);
    if (a <= 0.01) return;
    const h = v.h * 0.32;
    for (const team of [0, 1] as Team[]) {
      const y0 = team === 0 ? v.y + v.h : v.y;
      const g = ctx.createLinearGradient(0, y0, 0, team === 0 ? y0 - h : y0 + h);
      g.addColorStop(0, PAL.team[team].glow);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(v.x, team === 0 ? y0 - h : y0, v.w, h);
    }
    ctx.globalAlpha = 1;
  }

  /** the HUD at the top of the view: the tug bar of both teams' health, your KO counter, the boss bar */
  private drawHud(ctx: Ctx, v: Readonly<ViewRect>): void {
    const top = v.y + this.hud.top;
    if (this.hud.tug && this.tugA > 0.02 && this.battle) {
      const a = this.tugA;
      const w = Math.min(420, v.w - 32);
      const r = { x: Math.round(v.x + (v.w - w) / 2), y: Math.round(top + 2 - (1 - a) * 10), w, h: 18 };
      ctx.globalAlpha = a;
      // a dark plate under it so it reads on the stands
      ctx.fillStyle = 'rgba(29, 26, 43, 0.55)';
      rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, (r.h + 8) / 2);
      ctx.fill();
      tugBar(ctx, r, this.tugK, 1 - this.tugK, this.t);
      label(ctx, this.names[0].toUpperCase(), r.x + 10, r.y + r.h / 2 + 1, TYPE.tag, { align: 'left', weight: 700, onPitch: true, track: 1 });
      label(ctx, this.names[1].toUpperCase(), r.x + r.w - 10, r.y + r.h / 2 + 1, TYPE.tag, { align: 'right', weight: 700, onPitch: true, track: 1 });
      if (this.hud.kos && this.kos > 0) {
        // your knock-outs: a KO sticker under the bar's left end, popping on each one
        const s = 1 + 0.35 * easeOutCubic(this.koPop);
        stickerCached(ctx, `KO ${this.kos}`, r.x + 28, r.y + r.h + 18, 20, KO_TAG, -0.05, s, s);
      }
      ctx.globalAlpha = 1;
    }
    if (this.hud.boss) this.drawBossBar(ctx, v, top + (this.hud.tug ? 26 : 0));
  }

  /** the champion's health, under the tug bar while it is in the fight */
  private drawBossBar(ctx: Ctx, v: Readonly<ViewRect>, top: number): void {
    if (this.bossId < 0 || this.bossA < 0.02 || !this.battle) return;
    const boss = this.battle.units[this.bossId];
    const w = Math.min(280, v.w - 170);
    const h = 22;
    const x = v.x + (v.w - w) / 2;
    const y = top + 1 - (1 - easeOutCubic(this.bossA)) * 12;
    ctx.globalAlpha = this.bossA;
    ctx.fillStyle = 'rgba(29, 26, 43, 0.25)';
    rr(ctx, x + 1.5, y + 3, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#2b2440';
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    crown(ctx, x + 15, y + h / 2, 6.5);
    const name = (PET_INFO[boss.pet]?.name ?? '').toUpperCase();
    label(ctx, name, x + 28, y + h / 2 + 1, TYPE.tag, { align: 'left', weight: 700, color: '#ffe066', track: 0.5 });
    const bx = x + 38 + Math.max(40, name.length * 7.5);
    const bw = x + w - 10 - bx;
    const by = y + h / 2 - 4.5;
    ctx.fillStyle = PAL.bar.track;
    rr(ctx, bx, by, bw, 9, 4.5);
    ctx.fill();
    const k = clamp(this.bossHp, 0, 1);
    if (k > 0.005) {
      ctx.fillStyle = PAL.team[1].main;
      rr(ctx, bx, by, Math.max(9, bw * k), 9, 4.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      rr(ctx, bx + 3, by + 1.5, Math.max(4, bw * k - 6), 3, 1.5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** the big chunky banners (CHAMPION, READY..., FIGHT!, TIME!, VICTORY! ...) and the combo call */
  private drawBanners(ctx: Ctx, v: Readonly<ViewRect>): void {
    for (const bn of this.banners) {
      if (bn.kind === 'call') continue;
      const d = BANNER[bn.kind];
      this.drawBanner(ctx, v, bn, v.y + v.h * d.at, d.rot);
    }
    if (this.call) this.drawBanner(ctx, v, this.call, v.y + v.h * 0.27, -0.05);
  }

  private drawBanner(ctx: Ctx, v: Readonly<ViewRect>, bn: Banner, y: number, rot: number): void {
    const age = bn.age;
    if (age < 0) return;
    if (!bn.fit) {
      // fitted to the view once: the word (and its burst) stay inside it
      ctx.font = `${STICKER_WEIGHT} ${bn.size}px ${STICKER_FONT}`;
      const w = ctx.measureText(bn.text).width * (bn.style.burst ? 1.3 : 1.05) + bn.size * (bn.style.burst ? 0.85 : 0.3);
      bn.fit = Math.min(bn.size, (bn.size * (v.w - 24)) / Math.max(1, w));
    }
    const size = bn.fit;
    const inK = clamp(age / 0.22, 0, 1);
    let s = 0.2 + 0.8 * easeOutBack(inK);
    const wob = Math.sin(age * 26) * Math.exp(-age * 7) * 0.14;
    const out = bn.life < 50 ? clamp((age - (bn.life - 0.2)) / 0.2, 0, 1) : 0;
    if (bn.kind === 'ready') s *= 1 + 0.035 * Math.sin(age * 9);
    s *= 1 + 0.25 * out;
    const sx = s * (1 + wob + (1 - inK) * 0.3);
    const sy = s * (1 - wob - (1 - inK) * 0.25);
    let yy = y;
    if (bn.kind === 'defeat') yy -= (1 - easeOutBack(inK)) * 40;
    const x = v.x + v.w / 2;
    if (bn.kind === 'victory') this.drawRays(ctx, x, yy, size * 3.4, inK, age);
    ctx.globalAlpha = 1 - out;
    sticker(ctx, bn.text, x, yy, size, bn.style, rot, sx, sy);
    if (bn.sub) sticker(ctx, bn.sub, x, yy + size * 0.95, size * 0.5, { fill: '#ffffff', fill2: '#e8dcff', rim: null }, rot, sx, sy);
    if (bn.kind === 'champion') crown(ctx, x, yy - size * 1.05, size * 0.38 * s);
    ctx.globalAlpha = 1;
  }

  /** slow turning light rays behind VICTORY! */
  private drawRays(ctx: Ctx, x: number, y: number, R: number, k: number, age: number): void {
    const n = 12;
    const half = (Math.PI / n) * 0.45;
    const rad = R * easeOutCubic(k);
    ctx.globalAlpha = 0.3 * k;
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = age * 0.5 + (i / n) * TAU;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a - half) * rad, y + Math.sin(a - half) * rad * 0.7);
      ctx.lineTo(x + Math.cos(a + half) * rad, y + Math.sin(a + half) * rad * 0.7);
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ helpers

const SHADOW = 'rgb(28, 44, 34)';

const hitSound = (w: WeaponType): SoundName => (w === 'knife' ? 'knifeHit' : w === 'bat' ? 'batHit' : w === 'spear' ? 'spearHit' : 'block');

const bez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

function makeView(u: SimUnit, key: string): View {
  const pose = restPose();
  pose.t = u.id * 0.37;
  return {
    u,
    key,
    look: {
      pet: u.pet, level: 1, boss: u.boss, team: u.team, weapon: u.spec.weapon, weaponLevel: u.spec.weaponLevel,
      helmet: u.spec.helmet, sneakers: u.spec.sneakers, chili: u.spec.chili, seed: (u.id * 7.31) % 10,
    },
    pose, strike: 0, moving: 0, born: -1, popAt: -1, ready: false, hopK: -1, nextHop: frand(1.5, 7),
    dodge: 0, dodgeDir: 0, shell: 0, slide: 0, flash: 0, sq: 0, sqV: 0, barA: 0, lag: 1, hpSeen: u.maxHp, voice: 0, trail: frand(0, 0.3),
  };
}

/** A key per fighter that stays the same while its piece and its place in its squad do (yours by piece id). */
function keysOf(units: readonly SimUnit[]): string[] {
  const seen = new Map<string, number>();
  return units.map((u) => {
    const s = u.spec;
    const base = `${u.team}|${u.team === 0 ? s.key : u.squad}|${s.pet}|${s.weapon ?? '-'}${s.weaponLevel}|${s.helmet}${s.sneakers}${s.chili}|${s.boss ? 'B' : ''}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}

/** A coin seen spinning: a gold disc with a rim, an ink edge and a shine, narrowed by its turn. */
function drawCoin(ctx: Ctx, x: number, y: number, r: number, spin: number): void {
  const w = Math.max(0.25, Math.abs(Math.cos(spin)));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w, 1);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = '#f2b51f';
  ctx.fill();
  ctx.lineWidth = 1.6 / w;
  ctx.strokeStyle = '#1d1a2b';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, TAU);
  ctx.fillStyle = '#ffd84a';
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.25, r * 0.16, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A little gold crown (the champion's mark) centred on (x, y), s = its half width. */
function crown(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.6);
  ctx.lineTo(x - s, y - s * 0.4);
  ctx.lineTo(x - s * 0.5, y + s * 0.05);
  ctx.lineTo(x, y - s * 0.75);
  ctx.lineTo(x + s * 0.5, y + s * 0.05);
  ctx.lineTo(x + s, y - s * 0.4);
  ctx.lineTo(x + s, y + s * 0.6);
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, s * 0.18);
  ctx.strokeStyle = '#1d1a2b';
  ctx.stroke();
}

/** A Scorp's glob left on the grass: a small lime puddle with a darker rim, a shine and a few drops round it. */
function puddle(g: Ctx, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, GROUND_FLAT);
  const lobes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + frand(-0.4, 0.4);
    lobes.push(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * frand(0.45, 0.62));
  }
  const fill = (color: string, grow: number) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(r * 0.7 + grow, 0);
    g.arc(0, 0, r * 0.7 + grow, 0, TAU);
    for (let i = 0; i < lobes.length; i += 3) {
      g.moveTo(lobes[i] + lobes[i + 2] + grow, lobes[i + 1]);
      g.arc(lobes[i], lobes[i + 1], lobes[i + 2] + grow, 0, TAU);
    }
    g.fill();
  };
  fill(PAL.glob.rim, 1.2);
  fill(PAL.glob.puddle, 0);
  g.fillStyle = 'rgba(240, 255, 200, 0.6)';
  g.beginPath();
  g.ellipse(-r * 0.25, -r * 0.25, r * 0.3, r * 0.16, -0.3, 0, TAU);
  g.fill();
  g.fillStyle = PAL.glob.rim;
  for (let i = 0; i < 3; i++) {
    const a = frand(0, TAU);
    const d = r * frand(1.2, 1.7);
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, frand(0.8, 1.5), 0, TAU);
    g.fill();
  }
  g.restore();
}

/** The cracks a root ground-pound leaves in the grass: a few dark zig-zag lines out from the middle. */
function cracks(g: Ctx, x: number, y: number, reach: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, GROUND_FLAT);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const n = 4;
  const a0 = frand(0, TAU);
  for (const [w, color] of [[2.4, 'rgba(60, 40, 22, 0.38)'], [1, 'rgba(255, 246, 220, 0.4)']] as const) {
    g.lineWidth = w;
    g.strokeStyle = color;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      let px = Math.cos(a) * reach * 0.25;
      let py = Math.sin(a) * reach * 0.25;
      g.moveTo(px, py);
      for (let j = 1; j <= 2; j++) {
        const d = reach * (0.25 + j * 0.3);
        const off = (j % 2 ? 0.2 : -0.2) * (1 + (i % 2) * 0.4);
        px = Math.cos(a + off) * d;
        py = Math.sin(a + off) * d;
        g.lineTo(px, py);
      }
    }
    g.stroke();
  }
  g.restore();
}

// ------------------------------------------------------------------ the ball

/** The twelve panels of a football (the corners of an icosahedron), each as its middle and five corners. */
const PANELS: number[][] = (() => {
  const g = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g],
    [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1],
  ];
  return raw.map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    const c = [v[0] / l, v[1] / l, v[2] / l];
    const ref = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let a = [c[1] * ref[2] - c[2] * ref[1], c[2] * ref[0] - c[0] * ref[2], c[0] * ref[1] - c[1] * ref[0]];
    const al = Math.hypot(a[0], a[1], a[2]);
    a = [a[0] / al, a[1] / al, a[2] / al];
    const b = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
    const out = [...c];
    for (let i = 0; i < 5; i++) {
      const th = (i / 5) * TAU;
      const px = c[0] + 0.36 * (Math.cos(th) * a[0] + Math.sin(th) * b[0]);
      const py = c[1] + 0.36 * (Math.cos(th) * a[1] + Math.sin(th) * b[1]);
      const pz = c[2] + 0.36 * (Math.cos(th) * a[2] + Math.sin(th) * b[2]);
      const pl = Math.hypot(px, py, pz);
      out.push(px / pl, py / pl, pz / pl);
    }
    return out;
  });
})();

const BALL_R = 6;
const GRAVITY = 980;
const ROLL_DRAG = 0.9;
const ROLL_STOP = 26;
const BOUNCE = 0.48;
const WALL = 0.55;

/**
 * One football on the pitch, only for the eye: it never touches the simulator or its random numbers. It sits on
 * the centre spot, rolls, is nudged by fighters that walk into it and sent up by a big blow nearby. Arena px; z = up.
 */
class Ball {
  x = ARENA.w / 2;
  y = ARENA.h / 2;
  z = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private wx = 0;
  private wy = 0;
  private wz = 0;
  private m = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  reset(): void {
    this.x = ARENA.w / 2;
    this.y = ARENA.h / 2;
    this.z = this.vx = this.vy = this.vz = this.wx = this.wy = this.wz = 0;
    this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.turn(0.6, 0.3, 0.2, 1);
  }

  kick(ax: number, ay: number, dir: number, power: number): void {
    const d = Math.hypot(this.x - ax, this.y - ay);
    if (d > 48 || this.z > 30) return;
    const k = power * (1 - (d / 48) * 0.5);
    this.vz = Math.max(this.vz, frand(280, 400) * k);
    this.vx += Math.cos(dir) * frand(120, 200) * k;
    this.vy += Math.sin(dir) * frand(120, 200) * k;
    this.spinUp();
  }

  bump(ax: number, ay: number, reach: number, up: number): void {
    const dx = this.x - ax;
    const dy = this.y - ay;
    const d = Math.hypot(dx, dy);
    if (d > reach || this.z > 20) return;
    const k = 1 - (d / reach) * 0.6;
    const nx = d > 0.01 ? dx / d : frand(-1, 1);
    const ny = d > 0.01 ? dy / d : frand(-1, 1);
    this.vz = Math.max(this.vz, up * k * frand(0.8, 1.1));
    this.vx += nx * up * 0.45 * k;
    this.vy += ny * up * 0.45 * k;
    if (up > 150) this.spinUp();
  }

  private spinUp(): void {
    this.wx = frand(-14, 14);
    this.wy = frand(-14, 14);
    this.wz = frand(-6, 6);
  }

  update(dt: number, fighters: readonly View[]): void {
    if (dt <= 0) return;
    for (const f of fighters) {
      const u = f.u;
      if (!u.alive || u.phase === 'air') continue;
      const dx = this.x - u.x;
      const dy = this.y - u.y;
      const min = u.r * 0.8 + BALL_R;
      if (dx > min || dx < -min || dy > min || dy < -min || this.z > u.r * 1.4) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = d > 0.01 ? dx / d : 1;
      const ny = d > 0.01 ? dy / d : 0;
      this.x = u.x + nx * min;
      this.y = u.y + ny * min;
      const into = this.vx * nx + this.vy * ny;
      if (into < 0) {
        this.vx -= 1.5 * into * nx;
        this.vy -= 1.5 * into * ny;
      }
      const push = Math.max(36, (u.vx * nx + u.vy * ny) * 1.5 + 30);
      const along = this.vx * nx + this.vy * ny;
      if (along < push) {
        this.vx += (push - along) * nx;
        this.vy += (push - along) * ny;
      }
      if (fchance(0.03)) this.vz = Math.max(this.vz, 70);
    }
    if (this.z > 0 || this.vz > 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = -this.vz * BOUNCE;
        if (this.vz < 70) this.vz = 0;
        this.vx *= 0.82;
        this.vy *= 0.82;
        this.wx *= 0.5;
        this.wy *= 0.5;
        this.wz *= 0.5;
      }
      this.turn(this.wx, this.wy, this.wz, dt);
    } else {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 0) {
        const k = Math.max(0, sp * Math.exp(-ROLL_DRAG * dt) - ROLL_STOP * dt) / sp;
        this.vx *= k;
        this.vy *= k;
      }
      this.turn(-this.vy / BALL_R, this.vx / BALL_R, 0, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < BALL_R) {
      this.x = BALL_R;
      this.vx = Math.abs(this.vx) * WALL;
    } else if (this.x > ARENA.w - BALL_R) {
      this.x = ARENA.w - BALL_R;
      this.vx = -Math.abs(this.vx) * WALL;
    }
    if (this.y < BALL_R) {
      this.y = BALL_R;
      this.vy = Math.abs(this.vy) * WALL;
    } else if (this.y > ARENA.h - BALL_R) {
      this.y = ARENA.h - BALL_R;
      this.vy = -Math.abs(this.vy) * WALL;
    }
  }

  private turn(wx: number, wy: number, wz: number, dt: number): void {
    const w = Math.hypot(wx, wy, wz);
    const a = w * dt;
    if (a < 1e-5) return;
    const kx = wx / w;
    const ky = wy / w;
    const kz = wz / w;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const v = 1 - c;
    const r = [
      c + kx * kx * v, kx * ky * v - kz * s, kx * kz * v + ky * s,
      ky * kx * v + kz * s, c + ky * ky * v, ky * kz * v - kx * s,
      kz * kx * v - ky * s, kz * ky * v + kx * s, c + kz * kz * v,
    ];
    const m = this.m;
    const o = new Array<number>(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
    const n0 = Math.hypot(o[0], o[3], o[6]);
    o[0] /= n0;
    o[3] /= n0;
    o[6] /= n0;
    const d = o[0] * o[1] + o[3] * o[4] + o[6] * o[7];
    o[1] -= d * o[0];
    o[4] -= d * o[3];
    o[7] -= d * o[6];
    const n1 = Math.hypot(o[1], o[4], o[7]);
    o[1] /= n1;
    o[4] /= n1;
    o[7] /= n1;
    o[2] = o[3] * o[7] - o[6] * o[4];
    o[5] = o[6] * o[1] - o[0] * o[7];
    o[8] = o[0] * o[4] - o[3] * o[1];
    this.m = o;
  }

  drawShadow(ctx: Ctx): void {
    const r = BALL_R;
    const k = 1 / (1 + this.z / 22);
    ctx.fillStyle = SHADOW;
    ctx.globalAlpha = 0.2 * k;
    ctx.beginPath();
    ctx.ellipse(this.x + r * 0.25, this.y, r * (0.7 + 0.5 * k), r * (0.28 + 0.18 * k), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** seen from above (and a little from the front, like the fighters): white, its dark panels turning as it rolls */
  draw(ctx: Ctx): void {
    const r = BALL_R;
    const cx = this.x;
    const cy = this.y - r - this.z;
    ctx.fillStyle = '#f4f3ef';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    const m = this.m;
    ctx.fillStyle = '#3a404a';
    for (const pn of PANELS) {
      // the panels facing the viewer (+z after the turn) show
      const vz = m[6] * pn[0] + m[7] * pn[1] + m[8] * pn[2];
      if (vz < 0.12) continue;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const q = 3 + i * 3;
        const x = m[0] * pn[q] + m[1] * pn[q + 1] + m[2] * pn[q + 2];
        const y = m[3] * pn[q] + m[4] * pn[q + 1] + m[5] * pn[q + 2];
        if (i) ctx.lineTo(cx + x * r, cy + y * r);
        else ctx.moveTo(cx + x * r, cy + y * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx - r * 0.1, cy - r * 0.1, r * 1.15);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    g.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
    g.addColorStop(1, 'rgba(20, 24, 31, 0.35)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
  }
}

/**
 * Transitional: the old app.ts still mounts a battle screen. The main screen embeds BattleView instead; once
 * app.ts no longer imports this, it can go.
 */
export function createBattleScreen(app: App): { update(dt: number): void; render(ctx: Ctx): void } {
  const view = new BattleView(app);
  return { update: (dt) => view.update(dt), render: (ctx) => view.render(ctx) };
}
