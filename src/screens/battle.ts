import { music, petVoice, sfx, type SoundName, type VoiceKind } from '../audio/engine';
import { ARENA, PET_INFO } from '../data';
import { screenX, screenY, viewRect, viewScale, type ViewRect } from '../draw/camera';
import { Deaths } from '../draw/deaths';
import { Fx } from '../draw/fx';
import { restPose, type PetLook, type PetPose } from '../draw/petTypes';
import { petArt } from '../draw/pets';
import { fchance, frand } from '../rng';
import type { App } from '../screen';
import { createBattle } from '../sim/battle';
import type { Battle, HitEvent, SimEvent, SimSummary, SimUnit } from '../sim/types';
import { COLOR, TYPE, UI } from '../theme';
import type { ArmySpec, Team, WeaponType } from '../types';
import { clamp, easeOutBack, easeOutCubic, label, rr, type Ctx } from '../util';

/*
 * THE BATTLE VIEW: the arena part of the main screen. It has no screen of its own: the main screen owns it, sets
 * the camera's view rectangle every frame (a short PREP band or a tall WAVE view, animated between the two) and
 * calls showPrep / start / update / render. The simulator decides everything; the view only shows it.
 *
 * Everything on the pitch is drawn in ARENA px: render() puts the camera's flat transform on the context once
 * (screen = origin + arena x viewScale), so units, shadows, effects and the marks a wave leaves on the grass stay
 * glued to the pitch however the view moves or grows. Only the boss bar, the banners and the soft flashes are
 * drawn in screen px, inside the view.
 *
 * PREP: your army stands idle in its kick-off rows (the same rows the fight starts from) with a gentle breathing and
 * a little hop now and then; the coming wave's enemies stand faded at the far end. START: the enemy rows pop in
 * (yours give a ready hop), the referee's whistle, then the fight. Every trait shows from the simulator's events with
 * a small, clear effect in a calm palette. A knock-out is a joke (no blood) and its mark stays on the grass for the
 * whole wave. The deciding blow gets a gentle slow-motion. OVER: outcome() is ready once the last effects played.
 */

export interface WaveSetup {
  player: ArmySpec;
  enemy: ArmySpec;
  seed: number;
  stage: number;
  wave: number;
  boss: boolean;
}

/**
 * How a wave went. kills / losses / survived / time are the HUD's; kos and boss make it a src/types.ts WaveOutcome
 * too, so it can go straight to applyWave(); summary is the simulator's own.
 */
export interface WaveOutcome {
  won: boolean;
  /** enemy fighters you knocked out (the boss included) */
  kills: number;
  /** your fighters knocked out */
  losses: number;
  /** share 0..1 of your fighters still standing */
  survived: number;
  /** seconds the fight took */
  time: number;
  /** = kills (the name applyWave reads) */
  kos: number;
  /** the boss was knocked out */
  boss: boolean;
  summary: SimSummary;
}

type Mode = 'prep' | 'intro' | 'fight' | 'end' | 'over';

// ---- timing (seconds)
const POP_IN = 0.3; // a fighter popping onto the pitch
const INTRO_LEAD = 0.12; // before the first row pops in
const ROWS_SPAN = 0.75; // every row is in within this long
const ROW_GAP = { min: 0.09, max: 0.2 };
const RIPPLE = 0.14; // within a row they pop from the middle out
const INTRO_REST = 0.3; // a breath before the whistle
const READY_HOP = 0.36; // a ready hop (or an idle hop in prep)
const END_HOLD = 1.5; // from the deciding blow until outcome() is ready
const END_MAX = 3.5; // ... at the latest, even if a death is still playing
const JAB_GAP = 0.12; // the second of a Cacto's two jabs
const HOOK_LIFE = 0.42; // a hook line that reels a foe in
const CAST_LIFE = 0.22; // the line of a plain hook strike
const BONK_GAP = 0.18; // at least this long between two big impacts (hit-stop and shake)
const MARKS_FADE = 0.5; // the old wave's marks fade this long when prep comes back

// ---- look (arena px unless said)
/** units are drawn this much larger than their body radius, so the characters read at fight size */
const DRAW = 1.12;
const GHOST = 0.42; // the coming wave, in prep
const LEAP_LIFT = 74; // a Pogo's opening leap rises this high at its top (over its own hop)
const HP = { w: 20, h: 4, show: 1.1 };
const CROWDED = 70; // more fighters: the small sparks are left out
const QUIET = 30; // fewer fighters: even a plain hop gets its puff
const PREP_SEED = 1;

/** The calm battle palette: creams, soft greys, sage and rose; team colours muted. */
const SOFT = {
  white: '#fbf8f1',
  cream: '#f2e9d6',
  ink: '#3a404a',
  dust: ['#f4efe4', '#e5dccb'],
  poison: ['#a9c98f', '#d3e5c2', '#b8abd4'],
  thorn: ['#d38f99', '#9fbf88', '#f2e1e4'],
  armour: ['#d2d9e1', '#f5f7f9', '#9ea9b6'],
  leaf: ['#9cc48a', '#c5dcb2'],
  jab: '#f6eedc',
  shell: { top: '#efe3c6', stripe: '#86a1c2', rim: '#c7b28a' },
  line: 'rgba(60, 66, 76, 0.85)',
  track: 'rgba(40, 46, 54, 0.55)',
  team: [
    { main: '#6f97c9', light: '#b5cce6', dark: '#4f7199' },
    { main: '#cd7d74', light: '#ebb8b1', dark: '#a25c54' },
  ],
  boss: '#c97c72',
} as const;

const SWING: Record<WeaponType, SoundName> = { knife: 'knife', bat: 'bat', spear: 'spear', shield: 'shieldBash' };
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
  /** a hiding Snailor's shell, 0..1; a sliding Sumo's lean, 0..1 */
  shell: number;
  slide: number;
  /** seconds until it may say something again */
  voice: number;
  /** seconds until its next trail puff */
  trail: number;
}

interface Hook { from: number; to: number; age: number; life: number; pull: boolean }
interface Leap { unit: number; x1: number; y1: number; age: number; dur: number }
interface Banner { text: string; age: number; life: number }

export class BattleView {
  /** live counters for the HUD (kills fuel the cash ticker) */
  readonly live = { kills: 0, losses: 0, time: 0, mine: 0, theirs: 0 };
  /** optional: called on every knock-out with the side that lost the fighter, where it fell on screen and if it was a boss */
  onKo: ((team: Team, x: number, y: number, boss: boolean) => void) | null = null;

  private readonly fx = new Fx();
  private readonly deaths: Deaths;
  private readonly ball = new Ball();
  private mode: Mode = 'prep';
  private battle: Battle | null = null;
  private views: View[] = [];
  /** the views on the pitch, far to near */
  private order: View[] = [];
  private t = 0;
  private introT = 0;
  private introEnd = 0;
  private endT = 0;
  private winner: Team | -1 | null = null;
  private result: WaveOutcome | null = null;
  private later: { t: number; run: () => void }[] = [];
  private hooks: Hook[] = [];
  private leaps: Leap[] = [];
  private banner: Banner | null = null;
  private bonk = 0;
  private scuffs = 3;
  private streak = 0;
  private streakT = 9;
  private energy = 0;
  /** the old wave's marks on the grass fading out (1 = shown) */
  private marksA = 1;
  private fading = false;
  private bossId = -1;
  private bossA = 0;
  private bossHp = 1;
  private ghostCv: HTMLCanvasElement | null = null;

  constructor(private readonly app: App) {
    this.deaths = new Deaths(this.fx, app.ratio);
  }

  // ------------------------------------------------------------------ the contract

  /** PREP: your army standing in its kick-off rows (and, faded at the far end, the coming wave's enemies). Call again when the grid changes. */
  showPrep(player: ArmySpec, enemy: ArmySpec | null): void {
    const after = this.mode !== 'prep';
    const old = new Map<string, View>();
    if (!after) for (const v of this.views) old.set(v.key, v);
    if (after) {
      // the wave is over: its marks fade, everything else goes
      this.fading = this.fx.ground.count > 0;
      this.marksA = 1;
      this.deaths.clear();
      this.later.length = this.hooks.length = this.leaps.length = 0;
      this.banner = null;
      this.bossId = -1;
      this.bossA = 0;
    }
    const b = createBattle([player, enemy ?? { squads: [] }], PREP_SEED);
    this.battle = null;
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
  }

  /** starts the fight (the line-up pop-in, the whistle, then the simulation) */
  start(setup: WaveSetup): void {
    const standing = new Map<string, View>();
    if (this.mode === 'prep') for (const v of this.views) if (v.u.team === 0 && v.born >= POP_IN) standing.set(v.key, v);
    const b = createBattle([setup.player, setup.enemy], setup.seed);
    this.battle = b;
    this.fx.clear();
    this.deaths.clear();
    this.deaths.setRatio(this.app.ratio);
    this.ball.reset();
    this.fading = false;
    this.marksA = 1;
    this.later.length = this.hooks.length = this.leaps.length = 0;
    this.banner = null;
    this.mode = 'intro';
    this.introT = this.endT = this.energy = 0;
    this.streak = 0;
    this.streakT = 9;
    this.winner = null;
    this.result = null;
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
    // the line-up: row by row from the halfway line back, both sides together; in a row from the middle out
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
    let last = INTRO_LEAD;
    for (let i = 0; i < n; i++) {
      for (const team of [0, 1] as Team[]) {
        for (const u of rows[team][i] ?? []) {
          const v = this.views[u.id];
          v.popAt = INTRO_LEAD + i * gap + (Math.abs(u.x - ARENA.w / 2) / (ARENA.w / 2)) * RIPPLE;
          last = Math.max(last, v.popAt);
        }
      }
    }
    this.introEnd = last + POP_IN + INTRO_REST;
    this.order = [];
    for (const v of this.views) if (v.born >= 0) this.order.push(v);
    this.bossId = b.units.find((u) => u.boss && u.team === 1)?.id ?? b.units.find((u) => u.boss)?.id ?? -1;
    this.bossA = 0;
    this.bossHp = 1;
    this.live.kills = this.live.losses = this.live.time = 0;
    this.live.mine = b.alive[0];
    this.live.theirs = b.alive[1];
    music.set(setup.boss || this.bossId >= 0 ? 'boss' : 'wave');
    music.energy(0);
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
      if (this.introT >= this.introEnd) {
        this.mode = 'fight';
        // the simulator's own countdown has been the line-up: run it out at once (the fight is the same either way)
        for (const ev of b.step(Math.max(0, -b.time))) this.onEvent(ev);
      }
    } else if (this.mode === 'fight' && b) {
      for (const ev of b.step(sdt)) this.onEvent(ev);
    } else if (this.mode === 'end' && b) {
      this.endT += dt;
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
    for (let i = this.hooks.length - 1; i >= 0; i--) if ((this.hooks[i].age += sdt) >= this.hooks[i].life) this.hooks.splice(i, 1);
    for (let i = this.leaps.length - 1; i >= 0; i--) if ((this.leaps[i].age += sdt) >= this.leaps[i].dur + 0.1) this.leaps.splice(i, 1);
    if (this.banner && (this.banner.age += dt) >= this.banner.life) this.banner = null;
    this.bonk -= dt;
    this.streakT += dt;
    this.scuffs = Math.min(3, this.scuffs + dt * 2.5);
    if (this.fading) {
      this.marksA -= dt / MARKS_FADE;
      if (this.marksA <= 0) {
        fx.ground.clear();
        this.fading = false;
        this.marksA = 1;
      }
    }
    this.deaths.update(sdt);
    this.pose(dt, sdt);
    if (b) {
      this.ball.update(sdt, this.order);
      this.live.time = Math.max(0, b.time);
      this.live.mine = b.alive[0];
      this.live.theirs = b.alive[1];
      if (this.bossId >= 0) {
        const boss = b.units[this.bossId];
        const shown = this.views[this.bossId].born >= 0;
        this.bossHp += (clamp(boss.hp / boss.maxHp, 0, 1) - this.bossHp) * Math.min(1, dt * 10);
        const want = shown && (boss.alive || this.bossHp > 0.01) && this.mode !== 'over' ? 1 : 0;
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
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    // the field shakes (gently) with the camera; the still backdrop under it keeps the uncovered strip filled
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
    this.deaths.drawUnder(ctx);
    this.drawField(ctx, K, false);
    this.drawHooks(ctx);
    this.drawTags(ctx, K);
    fx.drawOver(ctx);
    ctx.restore();
    arena.drawFront(ctx, this.t);
    ctx.restore();
    // over the pitch, unshaken: the soft flashes, the boss bar, a banner
    fx.drawScreen(ctx);
    this.drawBossBar(ctx, v);
    this.drawBanner(ctx, v);
    ctx.restore();
  }

  /** non-null once the fight is over and its last effects have played */
  outcome(): WaveOutcome | null {
    return this.result;
  }

  phase(): 'prep' | 'fight' | 'over' {
    return this.mode === 'prep' ? 'prep' : this.mode === 'over' ? 'over' : 'fight';
  }

  // ---- for the dev page
  /** the fight's clock: -99 before the whistle, then the simulator's seconds */
  get time(): number {
    return !this.battle || this.mode === 'intro' || this.mode === 'prep' ? -99 : this.battle.time;
  }
  /** marks the wave has left on the grass */
  get marks(): number {
    return this.fx.ground.count;
  }
  /** particles flying */
  get load(): number {
    return this.fx.load;
  }

  // ------------------------------------------------------------------ the line-up

  /** a fighter pops onto the pitch with a puff and a ring of its side's colour */
  private popIn(v: View, late = 0): void {
    v.born = Math.max(0, late);
    if (!this.order.includes(v)) this.order.push(v);
    const u = v.u;
    if (this.mode === 'prep' && u.team === 1) return; // the coming wave appears quietly
    const r = u.r * DRAW;
    this.fx.dust(u.x, u.y - r * 0.2, 2, r * 0.4 + 3, true);
    this.fx.ring(u.x, u.y, SOFT.team[u.team].light, r * 0.6, r * 1.7 + 4, 0.32, 0);
    if (v.popAt >= 0 && this.mode === 'intro') sfx.play('deploy', 0, { x: screenX(u.x), enemy: u.team === 1 });
    if (u.boss && this.mode === 'intro') {
      sfx.play('bossArrives', 0, { x: screenX(u.x) });
      this.fx.ring(u.x, u.y, SOFT.white, r, r * 3.4, 0.5, 0);
      this.fx.dust(u.x, u.y, 8, r * 0.5 + 4, true);
      this.fx.shake(3, 0.35);
      this.app.arena.cheer(1, 0.6);
    }
  }

  // ------------------------------------------------------------------ the fight's events

  private onEvent(ev: SimEvent): void {
    const b = this.battle!;
    const fx = this.fx;
    switch (ev.type) {
      case 'start':
        // the referee's whistle, a soft ring from the centre spot, the crowd up
        sfx.play('waveStart');
        fx.ring(ARENA.w / 2, ARENA.h / 2, SOFT.white, 10, 120, 0.6, 0);
        this.app.arena.cheer(2, 0.7);
        break;
      case 'swing': {
        const u = b.units[ev.unit];
        this.views[u.id].strike = 1;
        const at = this.at(u.x, u.team);
        if (ev.weapon) {
          sfx.play(SWING[ev.weapon], 0, at);
          if (fchance(0.25)) this.voice(u, 'attack');
        } else this.voice(u, 'attack', true);
        break;
      }
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
          // a Pogo's landing: a ring on the grass as wide as its splash, a puff, a little jolt
          fx.ring(ev.x, ev.y, SOFT.white, r * 0.6, r + 34, 0.4, 0);
          fx.ring(ev.x, ev.y, SOFT.team[u.team].light, r * 0.4, r + 22, 0.3, 0);
          fx.dust(ev.x, ev.y, 6, r * 0.45 + 4, true);
          fx.groundMark('scuff', ev.x, ev.y + 1, r * 2.8, 12);
          this.bigHit(2, 0.02);
          sfx.play('leapLand', 0, this.at(ev.x, u.team));
          this.ball.bump(ev.x, ev.y, 60, 220);
        } else {
          if (b.alive[0] + b.alive[1] <= QUIET) fx.dust(ev.x, ev.y, 1, r * 0.35 + 2, true);
          if (this.scuffs >= 1) {
            this.scuffs--;
            fx.groundMark('scuff', ev.x, ev.y + 1, r * 2.2, frand(9, 13));
          }
          sfx.play('hop', 0, this.at(ev.x, u.team));
          this.ball.bump(ev.x, ev.y, 26, 110);
        }
        break;
      }
      case 'dodge': {
        // a Ninja: a MISS puff where the blow went, and it is a step aside
        const u = b.units[ev.unit];
        const a = b.units[ev.from];
        const v = this.views[u.id];
        const r = u.r * DRAW;
        const across = Math.atan2(u.y - a.y, u.x - a.x) + (fchance(0.5) ? 1 : -1) * Math.PI / 2;
        v.dodge = 1;
        v.dodgeDir = across;
        fx.burst(ev.x, ev.y - r * 0.9, { colors: SOFT.dust, n: 4, speed: 60, size: r * 0.35 + 2, life: 0.4, gravity: -20, shape: 'puff' });
        fx.tag(ev.x, ev.y - r * 2.1, 'MISS', '#7d8794', TYPE.tiny);
        sfx.play('dodge', 0, this.at(ev.x, u.team));
        break;
      }
      case 'shell': {
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        fx.ring(ev.x, ev.y - r * 0.5, SOFT.shell.top, r * 0.6, r * 1.6, 0.3);
        fx.dust(ev.x, ev.y, 3, r * 0.3 + 2, true);
        sfx.play(ev.on ? 'shellClose' : 'shellOpen', 0, this.at(ev.x, u.team));
        break;
      }
      case 'leap': {
        // a Pogo springs for the back line: a puff where it took off, a ring marking where it will land
        const u = b.units[ev.unit];
        fx.dust(ev.x0, ev.y0, 4, u.r * 0.4 + 3, true);
        fx.ring(ev.x0, ev.y0, SOFT.white, u.r * 0.5, u.r * 1.8, 0.3, 0);
        this.leaps.push({ unit: ev.unit, x1: ev.x1, y1: ev.y1, age: 0, dur: ev.dur });
        sfx.play('leapLaunch', 0, this.at(ev.x0, u.team));
        break;
      }
      case 'slide': {
        const u = b.units[ev.unit];
        fx.dust(ev.x, ev.y, ev.on ? 4 : 3, u.r * 0.4 + 3, true);
        if (ev.on) sfx.play('bellySlide', 0, this.at(ev.x, u.team));
        break;
      }
      case 'slam': {
        // a Sumo bowls into the line: a ring as wide as the shove, a burst of dust
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        fx.ring(ev.x, ev.y, SOFT.white, r * 0.5, r * 1.6 + 16 + ev.n * 8, 0.35, 0);
        fx.burst(ev.x, ev.y - r * 0.3, { colors: SOFT.dust, n: 6 + ev.n * 2, speed: 140, size: r * 0.3 + 3, life: 0.5, gravity: -20, shape: 'puff', dir: u.aim, spread: 1.1 });
        fx.impact(ev.x, ev.y - r * 0.8, r * 0.7 + 10, SOFT.cream, 0.18);
        this.bigHit(2.5, 0.035, u.aim, 3);
        sfx.play('batHit', 0, this.at(ev.x, u.team));
        this.ball.kick(ev.x, ev.y, u.aim, 1);
        break;
      }
      case 'charge': {
        // a Rhino puts its horn down: a huff of steam and a scrape
        const u = b.units[ev.unit];
        fx.burst(ev.x + u.face * u.r * 0.9, ev.y - u.r * 0.9, { colors: [SOFT.white], n: 2, speed: 40, size: u.r * 0.25 + 2, life: 0.4, gravity: -30, shape: 'puff', dir: u.face > 0 ? 0 : Math.PI, spread: 0.5 });
        fx.dust(ev.x, ev.y, 2, u.r * 0.35 + 2, true);
        break;
      }
      case 'stomp': {
        // a Boulder (or a boss) stomps: a ring rolls out over the grass, dust all round
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        const reach = r + 30;
        fx.ring(ev.x, ev.y, SOFT.cream, r * 0.6, reach + 10, 0.45, 0);
        fx.ring(ev.x, ev.y, SOFT.white, r * 0.4, reach, 0.32, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + frand(-0.3, 0.3);
          fx.dust(ev.x + Math.cos(a) * reach * 0.7, ev.y + Math.sin(a) * reach * 0.4, 1, r * 0.25 + 3, true);
        }
        fx.groundMark('divot', ev.x, ev.y + 2, r * 1.6, 12);
        this.bigHit(u.boss ? 4 : 2.5, u.boss ? 0.05 : 0.03);
        sfx.play('bossStomp', 0, this.at(ev.x, u.team));
        this.ball.bump(ev.x, ev.y, reach + 30, 260);
        break;
      }
      case 'poison': {
        // a Buzzy's poison working: a few soft bubbles rise off the victim
        const u = b.units[ev.unit];
        const r = u.r * DRAW;
        fx.burst(ev.x, ev.y - r * 1.2, { colors: SOFT.poison, n: 3, speed: 30, size: r * 0.16 + 2, life: 0.8, gravity: -70, shape: 'bubble', drag: 1.4, scatter: r * 0.5 });
        sfx.play('poison', 0, this.at(ev.x, u.team));
        break;
      }
      case 'enrage':
        this.banner = { text: 'OVERTIME', age: 0, life: 1.4 };
        sfx.play('enrage');
        this.app.arena.cheer(2, 0.6);
        break;
      case 'end':
        this.winner = ev.winner;
        this.mode = 'end';
        this.endT = 0;
        music.energy(0);
        if (ev.byTime) {
          this.banner = { text: 'TIME', age: 0, life: 1.3 };
          fx.flash(SOFT.white, 0.14, 0.3);
          sfx.play('cheer');
        }
        if (ev.winner === 0 || ev.winner === 1) this.app.arena.cheer(ev.winner, 1);
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
    const r = v.r * DRAW;
    const x = ev.x;
    const y = ev.y - r * 0.9; // the middle of its body
    const dir = ev.dir;
    const c = Math.cos(dir);
    const sn = Math.sin(dir);
    const at = this.at(x, a.team);
    const crowded = b.alive[0] + b.alive[1] > CROWDED;

    if (ev.spike) {
      // Briar's thorns bite back: little rose and leaf-green thorns spring off at the attacker
      fx.burst(x, y, { colors: SOFT.thorn, n: crowded ? 3 : 5, speed: 150, size: r * 0.18 + 2.5, life: 0.32, gravity: 120, shape: 'shard', dir: dir, spread: 0.9, ink: true });
      if (!crowded) fx.ring(x, y, SOFT.thorn[0], r * 0.3, r * 1.2 + 3, 0.2);
      sfx.play('thorns', 0, at);
      this.voice(v, 'hurt');
      return;
    }
    if (ev.pinch === 2) {
      // a Cacto's second jab lands a beat after the first
      this.later.push({ t: JAB_GAP, run: () => this.jab(x, y, r, dir, -1) });
      return;
    }
    if (ev.pinch === 1) {
      this.jab(x, y, r, dir, 1);
      sfx.play('doubleJab', 0, at);
    } else if (ev.blow === 'charge') {
      // a Rhino's charge: an impact ring, dust thrown along the blow, a jolt
      fx.impact(x, y, r * 0.9 + 14, SOFT.cream, 0.2);
      fx.ring(x, y, SOFT.white, r * 0.6, r * 2.3 + 12, 0.3);
      fx.burst(ev.x, ev.y, { colors: SOFT.dust, n: 7, speed: 170, size: r * 0.3 + 3, life: 0.5, gravity: -20, shape: 'puff', dir, spread: 0.7 });
      this.bigHit(3, 0.045, dir, 4);
      sfx.play('chargeImpact', 0, at);
      this.ball.kick(ev.x, ev.y, dir, 1);
    } else if (ev.blow === 'slam' || ev.blow === 'stomp' || ev.blow === 'landing') {
      // the big ring is the slam's / stomp's / landing's own event: here only a small puff on each one hit
      fx.dust(ev.x, ev.y, 1, r * 0.3 + 2, true);
    } else if (a.pet === 'angler') {
      // the hook: a line from the rod; a pull reels the foe in
      this.hooks.push({ from: a.id, to: v.id, age: 0, life: ev.pull ? HOOK_LIFE : CAST_LIFE, pull: ev.pull });
      fx.burst(x, y, { colors: [SOFT.white], n: 2, speed: 70, size: 2.5, life: 0.25, gravity: 0, shape: 'star' });
      if (ev.pull) sfx.play('hookPull', 0, at);
      else if (ev.weapon) sfx.play(hitSound(ev.weapon), 0, at);
    } else if (ev.blocked) {
      // a clang on the shield: a ring and sparks thrown back
      sfx.play('block', 0, at);
      if (!crowded) fx.ring(x - c * r, y - sn * r, SOFT.white, r * 0.4, r * 1.4 + 4, 0.2);
      fx.burst(x - c * r, y - sn * r, { colors: [SOFT.cream, SOFT.white], n: 3, speed: 150, size: 3.5, life: 0.26, gravity: 260, shape: 'star', dir: dir + Math.PI, spread: 0.9 });
    } else if (ev.weapon === 'bat') {
      sfx.play('batHit', 0, at);
      fx.dust(ev.x + c * r, ev.y, 2, r * 0.35 + 3, true);
      this.ball.kick(ev.x, ev.y, dir, ev.heavy ? 1 : 0.7);
      if (this.bonk <= 0) {
        fx.ring(x, y, SOFT.white, r * 0.5, r * 2 + 8, 0.24);
        fx.impact(x + c * r * 0.4, y, r * 0.7 + (ev.heavy ? 12 : 8), SOFT.cream, 0.16);
        this.bigHit(ev.heavy ? 2 : 1.2, ev.heavy ? 0.04 : 0.02, dir, ev.heavy ? 3 : 2);
      }
    } else if (ev.weapon === 'knife') {
      sfx.play('knifeHit', 0, at);
      const s = dir + Math.PI / 2 + (ev.from % 2 ? 0.5 : -0.5);
      const len = r * 1.8 + 10;
      fx.streak(x - (Math.cos(s) * len) / 2, y - (Math.sin(s) * len) / 2, s, len, SOFT.white, 2.5, 0.14);
    } else if (ev.weapon === 'spear') {
      sfx.play('spearHit', 0, at);
      fx.streak(x - c * (r + 16), y - sn * (r + 16), dir, r * 2 + 28, SOFT.white, 2.2, 0.16);
    } else if (ev.weapon === 'shield') {
      if (!crowded) fx.ring(x, y, SOFT.white, r * 0.5, r * 1.5 + 4, 0.2);
      fx.dust(ev.x + c * r, ev.y, 2, r * 0.3 + 2, true);
    } else if (!crowded) {
      fx.burst(x, y, { colors: [SOFT.white, SOFT.cream], n: 2, speed: 80, size: 2.4, life: 0.2, gravity: 160, dir, spread: 0.8 });
    }

    if (ev.pack > 0 && !crowded) {
      // Sprouts biting together: a leaf for every friend helping
      fx.burst(x, y, { colors: SOFT.leaf, n: ev.pack, speed: 90, size: 3.2, life: 0.45, gravity: 60, shape: 'petal', dir: -Math.PI / 2, spread: 1.2 });
    }
    if (ev.slap) {
      // a Roo's glove: a soft round pow
      fx.impact(x - c * r * 0.3, y - sn * r * 0.3, r * 0.6 + 8, SOFT.jab, 0.14);
      if (!crowded) fx.ring(x, y, SOFT.white, r * 0.3, r * 1.3 + 4, 0.18);
    }
    if (ev.armour) {
      // Boulder's armour: a clank of cool grey sparks
      fx.burst(x - c * r * 0.6, y - sn * r * 0.6, { colors: SOFT.armour, n: 3, speed: 130, size: 3.2, life: 0.25, gravity: 220, shape: 'star', dir: dir + Math.PI, spread: 1 });
      sfx.play('armourClank', 0, at);
    }
    if (ev.shell) {
      // landed on a hiding Snailor's shell: a tink
      fx.burst(x, y + r * 0.3, { colors: [SOFT.white, SOFT.shell.top], n: 2, speed: 110, size: 3, life: 0.2, gravity: 200, shape: 'star', dir: -Math.PI / 2, spread: 1.2 });
      sfx.play('block', 0, at);
    }
    if (ev.stun) sfx.play('stun', 0, at);
    if (ev.dmg > 0) this.voice(v, 'hurt');
  }

  /** one of a Cacto's two jabs: a quick soft pow and a short thrust, the second one a little lower */
  private jab(x: number, y: number, r: number, dir: number, side: number): void {
    const fx = this.fx;
    const ox = -Math.sin(dir) * r * 0.35 * side;
    const oy = Math.cos(dir) * r * 0.35 * side;
    fx.impact(x + ox, y + oy, r * 0.45 + 6, SOFT.jab, 0.12);
    fx.streak(x + ox - Math.cos(dir) * (r + 8), y + oy - Math.sin(dir) * (r + 8), dir, r + 14, SOFT.white, 2, 0.12);
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
    if (u.team === 1) this.live.kills++;
    else this.live.losses++;
    this.onKo?.(u.team, screenX(ev.x), screenY(ev.y - r), u.boss);
    if (u.team === 1) {
      // your knock-outs close together climb a little scale
      this.streak = this.streakT < 1 ? this.streak + 1 : 1;
      this.streakT = 0;
      if (this.streak >= 2) sfx.play('combo', this.streak);
      if (this.streak >= 4) this.app.arena.cheer(0, Math.min(1, 0.3 + this.streak * 0.1));
    }
    if (u.boss) {
      fx.ring(ev.x, ev.y - r, SOFT.white, r * 0.8, r * 3.2, 0.6);
      fx.ring(ev.x, ev.y, SOFT.cream, r, r * 3.6, 0.7, 0);
      fx.flash(SOFT.white, 0.12, 0.35);
      this.bigHit(4, 0.06);
      sfx.play('cheer', 0, { delay: 0.3 });
      this.app.arena.cheer(u.team === 1 ? 0 : 1, 1);
    }
    if (ev.last) {
      // the blow that decides it: a gentle slow-motion, a soft swell of light, the crowd up
      fx.slowMo(0.35, 0.75);
      fx.flash(SOFT.white, 0.12, 0.4);
      fx.ring(ev.x, ev.y - r, SOFT.white, r, r * 4 + 60, 0.6);
      fx.shake(3, 0.5);
      sfx.play('lastKill', 0, { x: screenX(ev.x) });
      sfx.play('cheer', 0, { delay: 0.5 });
    }
  }

  /** a heavy blow: a short hit-stop, a little shake and a shove of the camera, at most every BONK_GAP */
  private bigHit(shake: number, stop: number, dir?: number, kick = 0): void {
    if (this.bonk > 0) return;
    const b = this.battle;
    this.bonk = BONK_GAP * (1 + (b ? (b.alive[0] + b.alive[1]) / 50 : 0));
    this.fx.shake(shake, 0.18);
    this.fx.hitStop(stop);
    if (dir !== undefined && kick) this.fx.kick(dir, kick);
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

  private finish(b: Battle): void {
    const s = b.summary;
    this.mode = 'over';
    if (!s) return;
    const kills = s.size[1] - s.alive[1];
    this.result = {
      won: s.winner === 0,
      kills,
      losses: s.size[0] - s.alive[0],
      survived: s.size[0] > 0 ? s.alive[0] / s.size[0] : 0,
      time: s.time,
      kos: kills,
      boss: s.bossKos[0] > 0,
      summary: s,
    };
  }

  // ------------------------------------------------------------------ poses

  private pose(dt: number, sdt: number): void {
    const b = this.battle;
    const fighting = this.mode === 'fight' || this.mode === 'end';
    const started = fighting && !!b && b.time >= 0;
    const fx = this.fx;
    let swinging = 0;
    for (const v of this.order) {
      const u = v.u;
      const p = v.pose;
      if (v.born >= 0) v.born += dt;
      v.voice -= sdt;
      p.t += sdt;
      v.strike = Math.max(0, v.strike - sdt / 0.3);
      v.moving += ((u.phase === 'move' ? 1 : 0) - v.moving) * Math.min(1, sdt * 12);
      v.dodge = Math.max(0, v.dodge - sdt * 4);
      v.shell += ((u.phase === 'shell' ? 1 : 0) - v.shell) * Math.min(1, sdt * 14);
      v.slide += ((u.phase === 'slide' ? 1 : 0) - v.slide) * Math.min(1, sdt * 12);
      const attacking = u.phase === 'windup' || u.phase === 'recover';
      if (attacking) swinging++;
      // before the whistle they look in toward the middle of the pitch; then the way the simulator says
      p.face = started ? u.face : u.x < ARENA.w / 2 ? 1 : -1;
      p.walk = u.walked;
      p.moving = v.moving;
      p.hop = u.phase === 'air' ? Math.min(1, u.hop * 1.2) : u.hop;
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
      p.hurt = clamp(1 - u.sinceHit / 0.22, 0, 1);
      const pop = v.born < POP_IN ? Math.max(0.05, easeOutBack(Math.max(0, v.born) / POP_IN)) : 1;
      p.squashX = pop * (1 + 0.14 * v.shell + 0.12 * v.slide);
      p.squashY = pop * (1 - 0.34 * v.shell - 0.1 * v.slide);
      p.spin = v.slide * u.face * 1.15;
      p.mood =
        this.winner !== null && this.winner !== -1 ? (this.winner === u.team ? 'cheer' : 'scared')
        : u.phase === 'stun' ? 'dizzy'
        : u.phase === 'shell' ? 'scared'
        : attacking || u.phase === 'slide' || u.charged ? 'angry'
        : 'idle';

      if (!fighting || !u.alive || sdt <= 0) continue;
      // trails: a Sumo's belly slide, a charging Rhino's dust, a poisoned fighter's bubbles
      v.trail -= sdt;
      if (v.trail > 0) continue;
      const r = u.r * DRAW;
      if (u.phase === 'slide') {
        v.trail = 0.05;
        const back = Math.atan2(u.vy, u.vx) + Math.PI;
        fx.burst(u.x + Math.cos(back) * r * 0.8, u.y, { colors: SOFT.dust, n: 1, speed: 30, size: r * 0.3 + 2, life: 0.4, gravity: -10, shape: 'puff', under: true });
        fx.streak(u.x + Math.cos(back) * r * 0.4, u.y - r * 0.35, back, r * 2.4, SOFT.white, 2.6, 0.22);
        if (this.scuffs >= 1) {
          this.scuffs -= 0.5;
          fx.groundMark('scuff', u.x, u.y + 1, r * 2, 8);
        }
      } else if (u.pet === 'rhino' && u.charged && v.moving > 0.5) {
        v.trail = 0.09;
        fx.burst(u.x - u.face * r * 0.7, u.y, { colors: SOFT.dust, n: 1, speed: 25, size: r * 0.25 + 2, life: 0.35, gravity: -10, shape: 'puff', under: true });
        fx.streak(u.x - u.face * r * 1.2, u.y - r * frand(0.5, 1.3), u.face > 0 ? Math.PI : 0, r * 1.4, SOFT.white, 1.6, 0.18);
      } else if (u.poison > 0) {
        v.trail = frand(0.35, 0.6);
        fx.burst(u.x + frand(-0.4, 0.4) * r, u.y - r * 1.4, { colors: SOFT.poison, n: 1, speed: 15, size: r * 0.12 + 1.8, life: 0.7, gravity: -60, shape: 'bubble', drag: 1.2 });
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

  // ------------------------------------------------------------------ drawing (arena px)

  /** where a unit's feet are drawn this frame (a dodge steps it aside, the opening leap lifts it) */
  private feet(v: View): { x: number; y: number; lift: number } {
    const u = v.u;
    let x = u.x;
    let y = u.y;
    if (v.dodge > 0) {
      const k = Math.sin(Math.PI * v.dodge) * u.r * 0.7;
      x += Math.cos(v.dodgeDir) * k;
      y += Math.sin(v.dodgeDir) * k * 0.6;
    }
    return { x, y, lift: u.phase === 'air' ? u.hop * LEAP_LIFT : 0 };
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
      const up = u.phase === 'air' ? u.hop * 2.2 : u.hop * 0.6;
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
      if (v.shell > 0.05) drawShell(ctx, f.x, f.y, r, v.shell, u.face);
    }
    if (!ballDrawn) this.ball.draw(ctx);
    if (!ghosts) this.deaths.drawOver(ctx);
  }

  /** PREP: the coming wave stands faded at the far end (drawn whole into a layer, then laid down see-through) */
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

  /** where each Pogo in the air will land: a soft ring on the grass that firms up as it comes down */
  private drawLeapMarks(ctx: Ctx): void {
    if (!this.leaps.length) return;
    const b = this.battle!;
    ctx.lineWidth = 2;
    for (const l of this.leaps) {
      const u = b.units[l.unit];
      const k = clamp(l.age / l.dur, 0, 1);
      const a = clamp(l.age / 0.15, 0, 1) * clamp((l.dur + 0.1 - l.age) / 0.1, 0, 1);
      const rad = (u.r * DRAW + 22) * (1.25 - 0.25 * k);
      ctx.globalAlpha = a * (0.35 + 0.45 * k);
      ctx.strokeStyle = SOFT.team[u.team].light;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -l.age * 30;
      ctx.beginPath();
      ctx.ellipse(l.x1, l.y1, rad, rad * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = a * 0.16 * k;
      ctx.fillStyle = SOFT.team[u.team].main;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** an Angler's line: from the rod's tip to the foe it hooked, sagging less as it reels in */
  private drawHooks(ctx: Ctx): void {
    if (!this.hooks.length) return;
    const b = this.battle!;
    ctx.lineCap = 'round';
    for (const h of this.hooks) {
      const a = b.units[h.from];
      const t = b.units[h.to];
      const ar = a.r * DRAW;
      const tr = t.r * DRAW;
      const k = h.age / h.life;
      const x0 = a.x + a.face * ar * 1.05;
      const y0 = a.y - ar * 2.1;
      const x1 = t.x;
      const y1 = t.y - tr * 0.9;
      const sag = (h.pull ? 18 * (1 - k) : 8) + 2;
      ctx.globalAlpha = clamp((1 - k) / 0.3, 0, 1);
      ctx.strokeStyle = SOFT.line;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1);
      ctx.stroke();
      // the hook itself, a little silver curl on the foe
      ctx.strokeStyle = '#8f99a6';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x1, y1 + 2.5, 2.5, -0.3, Math.PI * 1.1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** over the bodies: the health bar of a fighter just hit, sparkles round a dizzy head */
  private drawTags(ctx: Ctx, K: number): void {
    if (this.mode === 'prep') return;
    const fighting = this.winner === null;
    for (const v of this.order) {
      const u = v.u;
      if (v.born < 0 || !u.alive) continue;
      const bar = fighting && !u.boss && u.hp < u.maxHp && u.sinceHit < HP.show;
      const stun = u.phase === 'stun';
      if (!bar && !stun) continue;
      const r = u.r * DRAW;
      const f = this.feet(v);
      const head = f.y - f.lift - petArt.headTop(v.look, r) * Math.min(1.15, v.pose.squashY) - u.hop * r * 0.8;
      if (bar) {
        const w = Math.round(Math.max(HP.w, r * 1.2));
        const h = HP.h / Math.max(0.7, K);
        const x = Math.round(f.x - w / 2);
        const y = head - h - 4;
        ctx.globalAlpha = clamp((HP.show - u.sinceHit) / 0.3, 0, 1);
        ctx.fillStyle = SOFT.white;
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = SOFT.track;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = u.poison > 0 ? SOFT.poison[0] : SOFT.team[u.team].main;
        ctx.fillRect(x, y, Math.max(1, w * clamp(u.hp / u.maxHp, 0, 1)), h);
        ctx.globalAlpha = 1;
      }
      if (stun) this.fx.orbitStars(ctx, f.x, head - 3, r * 0.75 + 3, this.t + u.id);
    }
  }

  // ------------------------------------------------------------------ drawing (screen px)

  /** the boss's health, across the top of the arena while it is in the fight */
  private drawBossBar(ctx: Ctx, v: Readonly<ViewRect>): void {
    if (this.bossId < 0 || this.bossA < 0.02 || !this.battle) return;
    const boss = this.battle.units[this.bossId];
    const w = Math.min(300, v.w - 110);
    const h = 30;
    const x = v.x + (v.w - w) / 2;
    const y = v.y + 10 - (1 - easeOutCubic(this.bossA)) * 12;
    ctx.globalAlpha = this.bossA;
    ctx.fillStyle = 'rgba(60, 54, 44, 0.16)';
    rr(ctx, x + 1, y + 2.5, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(247, 245, 241, 0.95)';
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = UI.borderStrong;
    ctx.stroke();
    label(ctx, 'BOSS', x + 14, y + h / 2 + 1, TYPE.tag, { align: 'left', weight: 700, color: SOFT.boss, track: 1 });
    const name = PET_INFO[boss.pet]?.name.toUpperCase() ?? '';
    label(ctx, name, x + 50, y + h / 2 + 1, TYPE.tag, { align: 'left', weight: 700, color: UI.text, track: 0.5 });
    const bx = x + 60 + Math.max(44, name.length * 7.5);
    const bw = x + w - 14 - bx;
    const by = y + h / 2 - 5;
    ctx.fillStyle = UI.track;
    rr(ctx, bx, by, bw, 10, 5);
    ctx.fill();
    const k = clamp(this.bossHp, 0, 1);
    if (k > 0.005) {
      ctx.fillStyle = SOFT.boss;
      rr(ctx, bx, by, Math.max(10, bw * k), 10, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      rr(ctx, bx + 3, by + 1.5, Math.max(4, bw * k - 6), 3, 1.5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** OVERTIME / TIME: a calm plate over the middle of the view */
  private drawBanner(ctx: Ctx, v: Readonly<ViewRect>): void {
    const b = this.banner;
    if (!b) return;
    const k = b.age / b.life;
    const inK = easeOutCubic(clamp(b.age / 0.18, 0, 1));
    const w = 64 + b.text.length * 15;
    const h = 46;
    const x = v.x + v.w / 2 - w / 2;
    const y = v.y + v.h * 0.44 - h / 2 + (1 - inK) * 10;
    ctx.globalAlpha = inK * clamp((1 - k) * 6, 0, 1);
    ctx.fillStyle = 'rgba(60, 54, 44, 0.16)';
    rr(ctx, x + 1.5, y + 3, w, h, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(247, 245, 241, 0.95)';
    rr(ctx, x, y, w, h, 14);
    ctx.fill();
    label(ctx, b.text, x + w / 2, y + h / 2 + 1, TYPE.h3, { weight: 700, color: UI.text, track: 2 });
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ helpers

const SHADOW = 'rgb(28, 44, 34)';

const hitSound = (w: WeaponType): SoundName => (w === 'knife' ? 'knifeHit' : w === 'bat' ? 'batHit' : w === 'spear' ? 'spearHit' : 'block');

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
    dodge: 0, dodgeDir: 0, shell: 0, slide: 0, voice: 0, trail: frand(0, 0.3),
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

/**
 * A hiding Snailor: its striped sea-chest shell closed down over it (k = how far, 0..1), a soft outline, the sun on
 * its upper left. Drawn over the squashed body at its feet (x, y), r its drawn radius.
 */
function drawShell(ctx: Ctx, x: number, y: number, r: number, k: number, face: number): void {
  const e = easeOutBack(clamp(k, 0, 1));
  const w = r * 1.05 * e;
  const h = r * 0.95 * e;
  if (w < 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  ctx.lineJoin = 'round';
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w, -h * 1.35, w, -h * 1.35, w, 0);
    ctx.closePath();
  };
  dome();
  ctx.fillStyle = SOFT.shell.top;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = SOFT.shell.stripe;
  for (let i = 0; i < 3; i++) ctx.fillRect(-w, -h * (0.22 + i * 0.32), w * 2, h * 0.13);
  ctx.fillStyle = 'rgba(120, 100, 70, 0.18)';
  ctx.fillRect(-w, -h * 0.18, w * 2, h * 0.18);
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.35, -h * 0.72, w * 0.22, h * 0.12, -0.4, 0, TAU);
  ctx.fill();
  dome();
  ctx.lineWidth = Math.max(1.2, r * 0.11);
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  ctx.restore();
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
