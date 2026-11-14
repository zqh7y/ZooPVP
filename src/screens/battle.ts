import { music, sfx } from '../audio/engine';
import type { SoundName } from '../audio/engine';
import { ARENA, FIGHT, REWARD } from '../data';
import { PITCH, project, projectInto, screenAngle, TILT, type Projected } from '../draw/camera';
import { Deaths } from '../draw/deaths';
import { Fx } from '../draw/fx';
import { koStar, rollToken } from '../draw/icons';
import { restPose, type PetLook, type PetPose } from '../draw/petTypes';
import { petArt } from '../draw/pets';
import { fitLabel, meter, ribbon, tugBar } from '../draw/ui';
import { fchance, frand } from '../rng';
import type { App, Screen } from '../screen';
import { createBattle } from '../sim/battle';
import type { Battle, SimEvent, SimUnit } from '../sim/types';
import { COLOR, H, S, TEAM, TYPE, UI, W } from '../theme';
import type { Team, WeaponType } from '../types';
import { clamp, easeOutBack, easeOutCubic, label, rr, type Ctx } from '../util';

/*
 * The fight: one automatic battle on a floodlit pitch, seen by the match camera from behind your end, the
 * opponent (red) at the far end and you (blue) at the near end. The simulator decides everything; this screen
 * only shows it, in depth (every fighter, effect and mark is placed with the camera and drawn at its depth's
 * scale) and makes every hit and knock-out felt with shape, timing, light and sound.
 *
 * A few things are only for the eye and never touch the simulator: a football that gets kicked about, marks
 * left on the grass, the crowd's cheers, a soft vignette and the floodlights swelling on the deciding blow.
 */

// ---- the HUD: one broadcast score bar
const BAR = { x: S.pad, y: 12, w: W - 2 * S.pad, h: 38 };
const CLOCK_W = 76;
const CLOCK = { x: W / 2 - CLOCK_W / 2, y: BAR.y, w: CLOCK_W, h: BAR.h };
const TICK = 4; // the team's colour at each end of the bar
const TAG = { w: 34, h: 18 }; // the opponent's BOT tag
const NAME = TYPE.body - 1;
const COUNT = TYPE.h2 - 4;
const TUG = { x: BAR.x, y: BAR.y + BAR.h + 6, w: BAR.w, h: 4 };
const PIPS = 10; // the roll meter: one roll is this many gold pips
const METER = { x: W / 2 - 60, y: TUG.y + TUG.h + 9, w: 120, h: 4 };
const TOKEN = { x: METER.x - 15, y: METER.y + METER.h / 2, size: 14 };
const STREAK = { x: METER.x + METER.w + 10, y: METER.y + METER.h / 2 };
const BANNER_W = { short: 250, long: 330 };
const HP_BAR = { minW: 10, h: 2, lift: 6, show: 1.6 }; // the thin health bar over a fighter that was just hit
const STAR = 14; // a knock-out star on its way to the roll meter
const COUNT_SCALE = 2; // the 3, 2, 1 is the title size, this much larger
const MID = project(ARENA.w / 2, ARENA.h / 2); // the centre spot: the countdown and the banners sit over it

// ---- timing
const DEPLOY_LEAD = 0.3; // before the first squad pops in
const DEPLOY_SPAN = 1.1; // all the squads are in within this long
const DEPLOY_REST = 0.3; // a breath before the countdown
const POP_IN = 0.28;
const STREAK_GAP = 1.0; // knock-outs this close together make a streak
const STREAK_SHOW = 1.6;
const END_HOLD = 1.6; // from the deciding blow to the result screen
const MAX_STARS = 10; // knock-out stars in the air at once
const BONK_GAP = 0.16; // at least this long between two full bat impacts
const CROWDED = 70; // more fighters than this: the small hit sparks are left out
const GLOW = 1.3; // the floodlights swell this long on the deciding blow

// ---- the ball (arena px and seconds; only for the eye)
const BALL_R = 5.5;
const GRAVITY = 980;
const ROLL_DRAG = 0.9; // 1/s, rolling on grass
const ROLL_STOP = 26; // px/s of speed lost every second as well
const BOUNCE = 0.48;
const WALL = 0.55;

const SWING: Record<WeaponType, SoundName> = { knife: 'knife', bat: 'bat', spear: 'spear', shield: 'shieldBash' };
const TAU = Math.PI * 2;

interface View {
  look: PetLook;
  pose: PetPose;
  /** 1 as its strike lands, fading */
  strike: number;
  moving: number;
  /** seconds since it popped onto the field, -1 while it has not */
  born: number;
}
interface Drop { team: Team; ids: number[]; at: number }
interface Banner { text: string; color: 'red' | 'gold' | 'indigo' | 'jade'; t: number; dur: number }

/** The battle screen, with a few read-only numbers for the dev page. */
export interface BattleScreen extends Screen {
  /** the fight's clock (negative in the countdown), or -99 before the squads are in */
  readonly time: number;
  readonly over: boolean;
  /** true once it has asked for the result screen */
  readonly left: boolean;
}

export function createBattleScreen(app: App): BattleScreen {
  const fx = new Fx();
  const deaths = new Deaths(fx, app.ratio);
  const ball = new Ball();
  const at: Projected = { x: 0, y: 0, s: 1 };
  let battle: Battle | null = null;
  let views: View[] = [];
  let order: SimUnit[] = [];
  let drops: Drop[] = [];
  // where each fighter is on screen this frame, by id
  let sx = new Float32Array(0);
  let sy = new Float32Array(0);
  let ss = new Float32Array(0);
  let phase: 'deploy' | 'fight' | 'done' = 'deploy';
  let t = 0;
  let deployT = 0;
  let countN = 0;
  let countT = 0;
  let banner: Banner | null = null;
  let size: [number, number] = [1, 1];
  // knock-outs and the roll meter
  let meterBase = 0;
  let landed = 0;
  let meterShown = 0;
  let rollsPopped = 0;
  let fullT = 0;
  let tokenBump = 0;
  let streak = 0;
  let streakT = 99;
  let streakPop = 0;
  let overtime = false;
  let winner: Team | -1 | null = null;
  let endT = 0;
  let left = false;
  let energy = 0;
  let bonkT = 0;
  let glowT = GLOW;
  // how many marks the grass may still take right now (they refill), so a busy fight does not carpet it
  let scuffs = 3;
  let divots = 2;

  function enter(): void {
    const m = app.match;
    fx.clear();
    deaths.clear();
    deaths.setRatio(app.ratio);
    ball.reset();
    t = deployT = countT = endT = energy = 0;
    countN = landed = rollsPopped = fullT = tokenBump = streak = streakPop = 0;
    streakT = 99;
    glowT = GLOW;
    scuffs = 3;
    divots = 2;
    banner = null;
    overtime = left = false;
    winner = null;
    phase = 'deploy';
    if (!m) {
      battle = null;
      return;
    }
    battle = createBattle([m.army, m.opponent.army], m.opponent.seed);
    const b = battle;
    size = [0, 0];
    views = b.units.map((u) => {
      size[u.team]++;
      const pose = restPose();
      pose.t = u.id * 0.37;
      return {
        look: {
          pet: u.pet, level: u.spec.level, team: u.team, weapon: u.spec.weapon, weaponLevel: u.spec.weaponLevel,
          helmet: u.spec.helmet, sneakers: u.spec.sneakers, chili: u.spec.chili, seed: (u.id * 7.31) % 10,
        },
        pose, strike: 0, moving: 0, born: -1,
      };
    });
    sx = new Float32Array(b.units.length);
    sy = new Float32Array(b.units.length);
    ss = new Float32Array(b.units.length);
    order = [];
    // the squads pop in one after the other, the two sides taking turns
    const bySquad: Drop[][] = [[], []];
    for (const u of b.units) (bySquad[u.team][u.squad] ??= { team: u.team, ids: [], at: 0 }).ids.push(u.id);
    drops = [];
    for (let i = 0; i < Math.max(bySquad[0].length, bySquad[1].length); i++) for (const team of [0, 1]) if (bySquad[team][i]) drops.push(bySquad[team][i]);
    const gap = clamp(DEPLOY_SPAN / Math.max(1, drops.length), 0.04, 0.16);
    drops.forEach((d, i) => (d.at = DEPLOY_LEAD + i * gap));
    meterBase = clamp(app.state.rollMeter, 0, 0.999);
    meterShown = meterBase;
    music.set('battle');
    music.energy(0);
  }

  function leave(): void {
    fx.clear();
    deaths.clear();
    music.energy(0);
  }

  // ------------------------------------------------------------------ deploy

  function deploy(d: Drop): void {
    const b = battle!;
    let cx = 0;
    let cy = 0;
    let cs = 0;
    for (const id of d.ids) {
      const u = b.units[id];
      views[id].born = 0;
      order.push(u);
      const p = projectInto(at, u.x, u.y);
      cx += p.x / d.ids.length;
      cy += p.y / d.ids.length;
      cs += p.s / d.ids.length;
      fx.dust(p.x, p.y - u.r * p.s * 0.4, d.ids.length > 4 ? 1 : 3, (u.r * 0.5 + 3) * p.s);
    }
    // a ring on the grass in the squad's colour: whose they are
    fx.ring(cx, cy, TEAM[d.team].light, 6 * cs, (26 + d.ids.length * 3) * cs, 0.35, 0);
    sfx.play('deploy', 0, { x: cx, enemy: d.team === 1 });
  }

  // ------------------------------------------------------------------ the fight's events

  function onEvent(ev: SimEvent): void {
    const b = battle!;
    switch (ev.type) {
      case 'start':
        banner = { text: 'FIGHT', color: 'red', t: 0, dur: 0.85 };
        countN = 0;
        sfx.play('fight');
        fx.flash(COLOR.white, 0.18, 0.25);
        fx.shake(4, 0.3);
        app.arena.cheer(1);
        break;
      case 'swing': {
        const u = b.units[ev.unit];
        views[u.id].strike = 1;
        sfx.play(ev.weapon ? SWING[ev.weapon] : 'bite', 0, { x: sx[u.id], enemy: u.team === 1 });
        break;
      }
      case 'hit':
        onHit(ev);
        break;
      case 'land': {
        const u = b.units[ev.unit];
        const p = projectInto(at, ev.x, ev.y);
        fx.ring(p.x, p.y, COLOR.white, u.r * 0.5 * p.s, (u.r * 1.5 + 2) * p.s, 0.22, 0);
        if (scuffs >= 1) {
          scuffs--;
          fx.groundMark('scuff', p.x, p.y + 1, u.r * 2.4 * p.s, frand(10, 14));
        }
        ball.bump(ev.x, ev.y, 26, 110);
        sfx.play('hop', 0, { x: p.x, enemy: u.team === 1 });
        break;
      }
      case 'death':
        onDeath(ev);
        break;
      case 'enrage':
        overtime = true;
        banner = { text: 'OVERTIME', color: 'gold', t: 0, dur: 1.4 };
        sfx.play('enrage');
        music.set('overtime');
        fx.flash(UI.accent, 0.12, 0.4);
        fx.shake(3, 0.4);
        app.arena.cheer(0.8);
        break;
      case 'end':
        winner = ev.winner;
        phase = 'done';
        if (app.match) app.match.summary = b.summary;
        music.energy(0);
        if (ev.byTime) {
          banner = { text: 'TIME', color: 'indigo', t: 0, dur: 1.3 };
          fx.flash(COLOR.white, 0.25, 0.3);
          sfx.play('cheer');
          app.arena.cheer(1);
        }
        break;
      default:
        break;
    }
  }

  function onHit(ev: Extract<SimEvent, { type: 'hit' }>): void {
    const b = battle!;
    const v = b.units[ev.to];
    const p = projectInto(at, ev.x, ev.y);
    const s = p.s;
    const r = v.r * s;
    const gx = p.x;
    const gy = p.y;
    const x = gx;
    const y = gy - r; // the middle of its body
    const sound = { x, enemy: b.units[ev.from].team === 1 };
    const dir = screenAngle(ev.dir);
    const c = Math.cos(dir);
    const sn = Math.sin(dir);
    if (ev.blocked) {
      // a clang on the shield: a bright ring and sparks thrown back
      sfx.play('block', 0, sound);
      fx.ring(x - c * r, y - sn * r, COLOR.white, r * 0.4, r * 1.5 + 5 * s, 0.2);
      fx.burst(x - c * r, y - sn * r, { colors: [UI.accent, COLOR.white], n: 4, speed: 170 * s, size: 4 * s, life: 0.28, gravity: 300, shape: 'star', dir: dir + Math.PI, spread: 0.9 });
    } else if (ev.weapon === 'bat') {
      // the big one
      sfx.play('batHit', 0, sound);
      fx.ring(x, y, COLOR.white, r * 0.6, r * 2.2 + 10 * s, 0.26);
      fx.dust(gx + c * r, gy, 3, r * 0.4 + 3 * s, true);
      ball.kick(ev.x, ev.y, ev.dir, ev.heavy ? 1 : 0.7);
      if (divots >= 1) {
        // the grass is torn where it was standing
        divots--;
        fx.groundMark('divot', gx + c * r * 0.8 + frand(-2, 2) * s, gy + frand(-1, 2) * s, frand(11, 15) * s, frand(14, 20));
      }
      // the burst of light, the camera kick and the freeze: every time in a duel, now and then in a crowd,
      // so a big fight stays readable and keeps its pace
      if (bonkT <= 0) {
        bonkT = BONK_GAP * (1 + (b.alive[0] + b.alive[1]) / 40);
        fx.impact(x + c * r * 0.4, y, (v.r * 0.8 + (ev.heavy ? 15 : 10)) * s, UI.accent, 0.18);
        fx.kick(dir, ev.heavy ? 6 : 3.5);
        fx.shake(ev.heavy ? 3 : 1.5, 0.15);
        fx.hitStop(ev.heavy ? 0.055 : 0.03);
      }
    } else if (ev.weapon === 'knife') {
      // a quick bright slash across it
      sfx.play('knifeHit', 0, sound);
      const a = dir + Math.PI / 2 + (ev.from % 2 ? 0.5 : -0.5);
      const len = r * 2 + 14 * s;
      fx.streak(x - (Math.cos(a) * len) / 2, y - (Math.sin(a) * len) / 2, a, len, COLOR.white, 3 * s, 0.14);
    } else if (ev.weapon === 'spear') {
      // a thrust streak right through it
      sfx.play('spearHit', 0, sound);
      fx.streak(x - c * (r + 20 * s), y - sn * (r + 20 * s), dir, r * 2 + 34 * s, COLOR.white, 2.5 * s, 0.16);
      fx.burst(x + c * r, y + sn * r, { colors: [COLOR.white], n: 2, speed: 150 * s, size: 2.5 * s, life: 0.2, gravity: 0, dir, spread: 0.4 });
    } else if (ev.weapon === 'shield') {
      fx.ring(x, y, COLOR.white, r * 0.5, r * 1.6 + 4 * s, 0.2);
      fx.dust(gx + c * r, gy, 2, r * 0.3 + 3 * s, true);
    } else if (b.alive[0] + b.alive[1] <= CROWDED) {
      fx.burst(x, y, { colors: [COLOR.white, COLOR.goldLight], n: 2, speed: 90 * s, size: 2.5 * s, life: 0.2, gravity: 200, dir, spread: 0.8 });
    }
    if (ev.stun) sfx.play('stun', 0, sound);
  }

  function onDeath(ev: Extract<SimEvent, { type: 'death' }>): void {
    const b = battle!;
    const u = b.units[ev.unit];
    const p = projectInto(at, ev.x, ev.y);
    const x = p.x;
    const y = p.y;
    const i = order.indexOf(u);
    if (i >= 0) order.splice(i, 1);
    deaths.start(views[u.id].look, u.r, ev.x, ev.y, u.face, { weapon: ev.weapon, dir: ev.dir, power: ev.power });
    ball.bump(ev.x, ev.y, 52, 240 + 120 * Math.min(1, ev.power));
    if (ev.weapon === 'bat' && !ev.last) app.arena.cheer(0.55);
    if (u.team === 1) {
      // yours: a star in your colour for the roll meter, and maybe a streak
      const arrive = () => {
        landed++;
        tokenBump = 1;
        sfx.play('meter', 0, { x: TOKEN.x });
      };
      if (fx.flying < MAX_STARS) fx.flyTo(x, y - u.r * p.s, TOKEN.x, TOKEN.y, (c, fx0, fy0, k) => koStar(c, fx0, fy0, STAR * k, TEAM[0].light), arrive, { delay: 0.12, life: 0.55 });
      else arrive();
      streak = streakT < STREAK_GAP ? streak + 1 : 1;
      streakT = 0;
      if (streak >= 2) {
        streakPop = 1;
        sfx.play('combo', streak);
        if (streak >= 3) app.arena.cheer(Math.min(1, 0.4 + streak * 0.1));
        if (streak % 5 === 0) sfx.play('cheer');
      }
    }
    if (ev.last) {
      // the blow that decides it: the world slows down to watch, the floodlights swell, the crowd erupts
      fx.slowMo(0.2, 0.85);
      fx.flash(UI.accent, 0.22, 0.5);
      fx.flash(COLOR.white, 0.35, 0.18);
      fx.speedLines(x, y - u.r * p.s, COLOR.white, 1);
      fx.shake(9, 0.9);
      fx.ring(x, y - u.r * p.s, UI.accent, u.r * p.s, 130, 0.6);
      fx.ring(x, y, COLOR.white, u.r * p.s, 90, 0.7, 0);
      glowT = 0;
      sfx.play('lastKill', 0, { x });
      sfx.play('cheer', 0, { delay: 0.5 });
      app.arena.cheer(1);
      music.energy(0);
    }
  }

  // ------------------------------------------------------------------ update

  function update(dt: number): void {
    t += dt;
    fx.update(dt);
    const b = battle;
    if (!b) {
      if (!left) {
        left = true;
        app.go('lobby');
      }
      return;
    }
    const sdt = dt * fx.timeScale;

    if (phase === 'deploy') {
      deployT += dt;
      while (drops.length && drops[0].at <= deployT) deploy(drops.shift()!);
      if (!drops.length && deployT >= DEPLOY_LEAD + DEPLOY_SPAN + DEPLOY_REST) phase = 'fight';
    } else if (phase === 'fight') {
      for (const ev of b.step(sdt)) onEvent(ev);
      if (b.time < 0) {
        const n = clamp(Math.ceil((-b.time / FIGHT.countdown) * 3), 1, 3);
        if (n !== countN) {
          countN = n;
          countT = 0;
          sfx.play('countdown', n);
        }
      }
    } else {
      endT += dt;
      if (endT >= END_HOLD && !left) {
        left = true;
        app.go('result');
      }
    }
    countT += dt;
    bonkT -= dt;
    glowT += dt;
    scuffs = Math.min(3, scuffs + dt * 2.5);
    divots = Math.min(2, divots + dt * 1.5);
    if (banner && (banner.t += dt) >= banner.dur) banner = null;
    deaths.update(sdt);

    // how each fighter stands this frame
    let swinging = 0;
    const started = b.time >= 0;
    for (const u of order) {
      const v = views[u.id];
      const p = v.pose;
      if (v.born >= 0) v.born += dt;
      v.strike = Math.max(0, v.strike - sdt / 0.3);
      v.moving += ((u.phase === 'move' ? 1 : 0) - v.moving) * Math.min(1, sdt * 12);
      const attacking = u.phase === 'windup' || u.phase === 'recover';
      if (attacking) swinging++;
      p.t += sdt;
      p.face = u.face;
      p.walk = u.walked;
      p.moving = v.moving;
      p.hop = u.hop;
      p.wind = u.phase === 'windup' && u.phaseDur > 0 ? clamp(u.phaseT / u.phaseDur, 0, 1) : 0;
      p.strike = v.strike;
      p.aimY = Math.sin(u.aim);
      p.hurt = clamp(1 - u.sinceHit / 0.22, 0, 1);
      const pop = v.born < POP_IN ? Math.max(0.05, easeOutBack(Math.max(0, v.born) / POP_IN)) : 1;
      p.squashX = p.squashY = pop;
      const mine = b.alive[u.team];
      const theirs = b.alive[u.team ? 0 : 1];
      p.mood =
        winner !== null ? (winner === u.team ? 'cheer' : 'scared')
        : u.phase === 'stun' ? 'dizzy'
        : attacking ? 'angry'
        : started && mine < theirs && mine <= Math.max(1, size[u.team] * 0.2) ? 'scared'
        : 'idle';
    }
    // nearly sorted from the last frame: an insertion sort is the cheap way (by depth, far to near)
    for (let i = 1; i < order.length; i++) {
      const u = order[i];
      let j = i - 1;
      while (j >= 0 && order[j].y > u.y) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = u;
    }
    ball.update(sdt, order);
    if (phase === 'fight' && started) {
      energy += (clamp(swinging / Math.max(5, order.length * 0.45), 0, 1) - energy) * Math.min(1, dt * 3);
      music.energy(energy);
    }

    // the roll meter fills as the stars land
    const total = meterBase + (landed / Math.max(1, size[1])) * REWARD.rollsForKills;
    meterShown += (total - meterShown) * Math.min(1, dt * 9);
    if (Math.floor(total + 1e-6) > rollsPopped) {
      rollsPopped++;
      fullT = 0.7;
      sfx.play('rollEarned', 0, { x: METER.x + METER.w / 2 });
      fx.floatText(METER.x + METER.w / 2, METER.y + 24, '+1 ROLL', UI.accent, TYPE.body);
      fx.ring(TOKEN.x, TOKEN.y, UI.accent, 6, 22, 0.4, 2);
      fx.burst(METER.x + METER.w / 2, METER.y + METER.h / 2, { colors: [UI.accent, COLOR.white], n: 6, speed: 150, size: 3, life: 0.4, gravity: 220, shape: 'star', screen: true });
    }
    fullT = Math.max(0, fullT - dt);
    tokenBump = Math.max(0, tokenBump - dt * 5);
    streakPop = Math.max(0, streakPop - dt * 6);
    streakT += dt;
  }

  // ------------------------------------------------------------------ drawing

  function drawFighters(ctx: Ctx): void {
    const n = order.length;
    for (let i = 0; i < n; i++) {
      const u = order[i];
      const p = projectInto(at, u.x, u.y);
      sx[u.id] = p.x;
      sy[u.id] = p.y;
      ss[u.id] = p.s;
    }
    // contact shadows first, all on the grass
    for (let i = 0; i < n; i++) {
      const u = order[i];
      const v = views[u.id];
      if (v.born < 0) continue;
      const x = sx[u.id];
      const y = sy[u.id];
      ctx.translate(x, y);
      petArt.drawShadow(ctx, v.look, u.r * ss[u.id] * Math.min(1, v.pose.squashX), u.hop);
      ctx.translate(-x, -y);
    }
    ball.drawShadow(ctx);
    // then the bodies, far to near, with the ball and the dying ones in their places
    deaths.beginDepth();
    let ballDrawn = false;
    for (let i = 0; i < n; i++) {
      const u = order[i];
      const v = views[u.id];
      if (v.born < 0) continue;
      const x = sx[u.id];
      const y = sy[u.id];
      if (!ballDrawn && ball.y <= u.y) {
        ball.draw(ctx);
        ballDrawn = true;
      }
      deaths.drawUpTo(ctx, y);
      ctx.translate(x, y);
      petArt.drawPet(ctx, v.look, v.pose, u.r * ss[u.id]);
      ctx.translate(-x, -y);
    }
    if (!ballDrawn) ball.draw(ctx);
    deaths.drawOver(ctx);
    // over the crowd of bodies: a thin health bar on the ones just hit, sparkles round the dizzy ones
    for (let i = 0; i < n; i++) {
      const u = order[i];
      const show = winner === null && u.hp < u.maxHp && u.sinceHit < HP_BAR.show;
      if (!show && u.phase !== 'stun') continue;
      const v = views[u.id];
      const s = ss[u.id];
      const r = u.r * s;
      const x = sx[u.id];
      const top = sy[u.id] - petArt.headTop(v.look, r) - u.hop * r * (u.pet === 'frog' ? 1.5 : 0.8);
      if (show) {
        const w = Math.round(Math.max(HP_BAR.minW, u.r * 1.6) * s);
        const bx = Math.round(x - w / 2);
        const by = Math.round(top - HP_BAR.lift * s);
        ctx.globalAlpha = clamp((HP_BAR.show - u.sinceHit) / 0.35, 0, 1);
        ctx.fillStyle = COLOR.ink;
        ctx.fillRect(bx - 1, by - 1, w + 2, HP_BAR.h + 2);
        ctx.fillStyle = TEAM[u.team].main;
        ctx.fillRect(bx, by, Math.max(1, Math.round(w * clamp(u.hp / u.maxHp, 0, 1))), HP_BAR.h);
        ctx.globalAlpha = 1;
      }
      if (u.phase === 'stun') fx.orbitStars(ctx, x, top - 3 * s, (u.r * 0.8 + 3) * s, t + u.id);
    }
  }

  function drawHud(ctx: Ctx): void {
    const b = battle!;
    const opp = app.match!.opponent;
    const cy = BAR.y + BAR.h / 2;
    // the bar: flat slate, a hairline of light along its top, a soft shadow under it on the stands
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let i = 1; i <= 3; i++) {
      rr(ctx, BAR.x - i, BAR.y + i, BAR.w + i * 2, BAR.h + i, S.radius.m + i);
      ctx.fill();
    }
    rr(ctx, BAR.x, BAR.y, BAR.w, BAR.h, S.radius.m);
    ctx.fillStyle = UI.surface;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fillRect(BAR.x, BAR.y, BAR.w, 1);
    // each end in its team's colour
    ctx.fillStyle = TEAM[0].main;
    ctx.fillRect(BAR.x, BAR.y, TICK, BAR.h);
    ctx.fillStyle = TEAM[1].main;
    ctx.fillRect(BAR.x + BAR.w - TICK, BAR.y, TICK, BAR.h);
    // the clock sits in a darker well in the middle; gold, and solid gold once it is overtime
    const hot = overtime && winner === null;
    ctx.fillStyle = UI.bg;
    ctx.fillRect(CLOCK.x, CLOCK.y, CLOCK.w, CLOCK.h);
    if (hot) {
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6);
      ctx.fillStyle = UI.accent;
      ctx.fillRect(CLOCK.x, CLOCK.y, CLOCK.w, CLOCK.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    const secs = Math.max(0, Math.ceil(FIGHT.timeLimit - Math.max(0, b.time)));
    label(ctx, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, W / 2, cy + 1, TYPE.h2 - 3, { color: hot ? UI.accentText : UI.accent, weight: 700, track: 0.5 });

    // you: tick, name, fighters left
    const inL = BAR.x + TICK + 10;
    const countL = CLOCK.x - 12;
    label(ctx, String(b.alive[0]), countL, cy + 1, COUNT, { align: 'right', weight: 700 });
    fitLabel(ctx, app.state.name, inL, cy + 1, NAME, countL - 34 - inL, { align: 'left', weight: 700, color: UI.text });
    // the opponent: fighters left, name, BOT tag, tick
    const countR = CLOCK.x + CLOCK.w + 12;
    const tagX = BAR.x + BAR.w - TICK - 9 - TAG.w;
    label(ctx, String(b.alive[1]), countR, cy + 1, COUNT, { align: 'left', weight: 700 });
    rr(ctx, tagX, cy - TAG.h / 2, TAG.w, TAG.h, S.radius.s);
    ctx.fillStyle = UI.borderStrong;
    ctx.fill();
    label(ctx, 'BOT', tagX + TAG.w / 2, cy + 1.5, TYPE.small - 2, { weight: 700, track: 1.5 });
    fitLabel(ctx, opp.name, tagX - 8, cy + 1, NAME, tagX - 8 - (countR + 34), { align: 'right', weight: 700, color: UI.text });

    // health as a tug of war under the bar
    tugBar(ctx, TUG, b.hpShare[0], b.hpShare[1], t);

    // the roll meter: a row of gold pips your knock-outs fill
    const shown = fullT > 0 ? 1 : meterShown - Math.floor(meterShown + 1e-6);
    meter(ctx, METER, shown, { ticks: PIPS, color: UI.accent, full: fullT > 0 });
    rollToken(ctx, TOKEN.x, TOKEN.y, TOKEN.size * (1 + 0.25 * tokenBump), fullT > 0 || tokenBump > 0.3 ? UI.accent : UI.textDim);
    if (streak >= 2 && streakT < STREAK_SHOW) {
      const k = 1 + 0.2 * streakPop;
      ctx.globalAlpha = clamp((STREAK_SHOW - streakT) / 0.3, 0, 1);
      label(ctx, `×${streak}`, STREAK.x, STREAK.y + 1, TYPE.body * k, { align: 'left', color: UI.accent, weight: 700 });
      ctx.globalAlpha = 1;
    }
  }

  function drawCalls(ctx: Ctx): void {
    const b = battle!;
    if (phase === 'fight' && b.time < 0 && countN > 0) {
      // 3, 2, 1 over the centre spot: each number drops in and fades as the next one comes
      const third = FIGHT.countdown / 3;
      const k = clamp(countT / third, 0, 1);
      const s = COUNT_SCALE * (1 + 0.2 * (1 - easeOutCubic(Math.min(1, k * 5))));
      ctx.save();
      ctx.translate(MID.x, MID.y);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp(k * 8, 0, 1) * clamp((1 - k) * 4, 0, 1);
      label(ctx, String(countN), 0, 0, TYPE.title, { color: countN === 1 ? UI.accent : UI.text, weight: 700, onPitch: true });
      ctx.restore();
    }
    if (banner) {
      // a title slab: rises a little as it fades in, holds still, fades out
      const k = banner.t / banner.dur;
      const inK = easeOutCubic(clamp(banner.t / 0.18, 0, 1));
      ctx.save();
      ctx.translate(MID.x, MID.y + (1 - inK) * 12);
      ctx.globalAlpha = inK * clamp((1 - k) * 7, 0, 1);
      ribbon(ctx, 0, 0, banner.text.length > 6 ? BANNER_W.long : BANNER_W.short, banner.text, { color: banner.color, size: TYPE.h1 + 4 });
      ctx.restore();
    }
  }

  function render(ctx: Ctx): void {
    if (!battle || !app.match) {
      app.arena.drawBattle(ctx, t);
      return;
    }
    // the field shakes with the camera, by whole pixels (a plain shifted copy is the cheap way to draw it);
    // the still backdrop is drawn first, so the strip the shift uncovers is never empty
    const cx = Math.round(fx.camera.x);
    const cy = Math.round(fx.camera.y);
    if (cx || cy) app.arena.drawBattle(ctx, t);
    ctx.save();
    ctx.translate(cx, cy);
    app.arena.drawBattle(ctx, t);
    fx.drawUnder(ctx);
    deaths.drawUnder(ctx);
    drawFighters(ctx);
    fx.drawOver(ctx);
    app.arena.drawBattleFront(ctx, t);
    ctx.restore();
    drawLight(ctx, glowT);
    drawHud(ctx);
    drawCalls(ctx);
    fx.drawScreen(ctx);
  }

  return {
    enter,
    leave,
    update,
    render,
    resize: (ratio: number) => deaths.setRatio(ratio),
    get time() {
      return phase === 'deploy' || !battle ? -99 : battle.time;
    },
    get over() {
      return phase === 'done';
    },
    get left() {
      return left;
    },
  };
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
    // two directions across the sphere at this point
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
const VIEW_Y = Math.sqrt(1 - TILT * TILT); // how much of the camera's view runs along the ground (toward you)

/**
 * One football on the pitch, only for the eye: it never touches the simulator or its random numbers. It sits
 * on the centre spot, rolls with friction, is nudged by fighters that walk into it and sent up in an arc by a
 * bat or a knock-out nearby, bounces a couple of times, and stays on the pitch. x, y, z in arena px (z = up).
 */
class Ball {
  x = ARENA.w / 2;
  y = ARENA.h / 2;
  z = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  /** spin while in the air: axis times speed, radians per second */
  private wx = 0;
  private wy = 0;
  private wz = 0;
  /** its turn so far, as a rotation matrix (rows) */
  private m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private p: Projected = { x: 0, y: 0, s: 1 };

  reset(): void {
    this.x = ARENA.w / 2;
    this.y = ARENA.h / 2;
    this.z = this.vx = this.vy = this.vz = this.wx = this.wy = this.wz = 0;
    this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.turn(0.6, 0.3, 0.2, 1); // so the first look is not a panel dead centre
  }

  /** A bat hit near it: up it goes, along the blow. */
  kick(ax: number, ay: number, dir: number, power: number): void {
    const d = Math.hypot(this.x - ax, this.y - ay);
    if (d > 48 || this.z > 30) return;
    const k = power * (1 - (d / 48) * 0.5);
    this.vz = Math.max(this.vz, frand(280, 400) * k);
    this.vx += Math.cos(dir) * frand(120, 200) * k;
    this.vy += Math.sin(dir) * frand(120, 200) * k;
    this.spinUp();
  }

  /** Something happened right by it (a body falls, a frog lands): it hops away from that point. */
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

  update(dt: number, fighters: readonly SimUnit[]): void {
    if (dt <= 0) return;
    // fighters that walk into it push it on (only when it is low enough to touch)
    for (const u of fighters) {
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
    // in the air: gravity and a bounce or two; on the grass: it rolls and slows
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
      // rolling without slipping: it turns about the axis across its way
      this.turn(-this.vy / BALL_R, this.vx / BALL_R, 0, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // the pitch's edges: it comes back off the boards
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

  /** Turns the ball by angular velocity (wx, wy, wz) for dt seconds. */
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
    // keep it a clean rotation (rounding creeps in over thousands of turns)
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

  /** Its contact shadow on the grass: smaller and fainter the higher it flies. */
  drawShadow(ctx: Ctx): void {
    const p = projectInto(this.p, this.x, this.y);
    const r = BALL_R * p.s;
    const k = 1 / (1 + this.z / 22);
    ctx.fillStyle = COLOR.ink;
    ctx.globalAlpha = 0.2 * k;
    ctx.beginPath();
    ctx.ellipse(p.x + r * 0.25, p.y, r * (0.7 + 0.5 * k), r * (0.28 + 0.18 * k), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.3 * k * k;
    ctx.beginPath();
    ctx.ellipse(p.x + r * 0.15, p.y, r * 0.6 * k, r * 0.22 * k, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The ball: white, a few dark panels turning as it rolls, lit from the upper left. */
  draw(ctx: Ctx): void {
    const p = projectInto(this.p, this.x, this.y);
    const r = BALL_R * p.s;
    const cx = p.x;
    const cy = p.y - r - this.z * p.s;
    ctx.fillStyle = '#f4f5f2';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    // the panels facing the camera, foreshortened toward the rim
    const m = this.m;
    ctx.fillStyle = '#262b33';
    for (const pn of PANELS) {
      const vz = m[6] * pn[0] + m[7] * pn[1] + m[8] * pn[2];
      const vy = m[3] * pn[0] + m[4] * pn[1] + m[5] * pn[2];
      if (vy * VIEW_Y + vz * TILT < 0.12) continue;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const q = 3 + i * 3;
        const x = m[0] * pn[q] + m[1] * pn[q + 1] + m[2] * pn[q + 2];
        const y = m[3] * pn[q] + m[4] * pn[q + 1] + m[5] * pn[q + 2];
        const z = m[6] * pn[q] + m[7] * pn[q + 1] + m[8] * pn[q + 2];
        const px = cx + x * r;
        const py = cy + (y * TILT - z * VIEW_Y) * r;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    // the floodlight from the upper left: a bright cap there, shade toward the lower right
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx - r * 0.1, cy - r * 0.1, r * 1.15);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    g.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.75, 'rgba(20, 24, 31, 0.12)');
    g.addColorStop(1, 'rgba(20, 24, 31, 0.5)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = Math.max(0.8, r * 0.16);
    ctx.strokeStyle = COLOR.ink;
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ light over the pitch

let vignette: HTMLCanvasElement | null = null;
let flood: HTMLCanvasElement | null = null;

/** A small canvas painted once and drawn stretched (a soft gradient loses nothing). */
function soft(w: number, h: number, paint: (c: Ctx) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paint(cv.getContext('2d')!);
  return cv;
}

/**
 * Over the pitch, under the HUD: a very soft vignette at the screen's edges, so the eye stays on the play, and
 * on the deciding blow the floodlights' glow swelling once from the upper corners.
 */
function drawLight(ctx: Ctx, glowT: number): void {
  vignette ??= soft(128, 128, (c) => {
    const g = c.createRadialGradient(64, 66, 30, 64, 66, 92);
    g.addColorStop(0, 'rgba(4, 6, 10, 0)');
    g.addColorStop(0.55, 'rgba(4, 6, 10, 0.1)');
    g.addColorStop(1, 'rgba(4, 6, 10, 0.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  ctx.drawImage(vignette, 0, 0, W, H);
  if (glowT >= GLOW) return;
  flood ??= soft(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255, 236, 160, 0.55)');
    g.addColorStop(0.4, 'rgba(255, 226, 130, 0.18)');
    g.addColorStop(1, 'rgba(255, 220, 120, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const k = glowT / GLOW;
  const a = Math.sin(Math.PI * Math.min(1, k * 1.6) ** 0.7) * (1 - k * 0.4);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const R = 560;
  const top = PITCH.top - 170;
  // the key light at the upper left is the strongest
  ctx.globalAlpha = a;
  ctx.drawImage(flood, -R / 2, top - R / 2, R, R);
  ctx.globalAlpha = a * 0.7;
  ctx.drawImage(flood, W - R / 2, top - R / 2, R, R);
  ctx.globalAlpha = a * 0.35;
  ctx.drawImage(flood, -R / 2, H - 120 - R / 2, R, R);
  ctx.drawImage(flood, W - R / 2, H - 120 - R / 2, R, R);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = op;
}
