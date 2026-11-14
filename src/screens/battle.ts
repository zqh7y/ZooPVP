import { music, sfx } from '../audio/engine';
import type { SoundName } from '../audio/engine';
import { FIGHT, PIECE_NAME, REWARD } from '../data';
import { Deaths } from '../draw/deaths';
import { Fx } from '../draw/fx';
import { clock, koStar, rollToken } from '../draw/icons';
import { restPose, type PetLook, type PetPose } from '../draw/petTypes';
import { petArt } from '../draw/pets';
import { meter, namePlate, pill, ribbon, tugBar } from '../draw/ui';
import type { App, Screen } from '../screen';
import { createBattle } from '../sim/battle';
import type { Battle, SimEvent, SimUnit } from '../sim/types';
import { COLOR, FIELD, H, S, TEAM, TOPBAR, TYPE, UI, W } from '../theme';
import type { Team, WeaponType } from '../types';
import { clamp, easeOutBack, easeOutCubic, label, rr, type Ctx } from '../util';

/*
 * The fight: one automatic battle on the sakura field, opponent (red) at the top, you (blue) at the bottom.
 * The simulator decides everything; this screen only shows it and makes every hit and knock-out felt.
 */

// ---- the HUD (only this screen uses these)
const PLATE_W = 186;
const TIMER_W = W - 2 * (S.pad + PLATE_W + S.gap);
const PLATE_ME = { x: S.pad, y: TOPBAR.y, w: PLATE_W, h: TOPBAR.h };
const PLATE_BOT = { x: W - S.pad - PLATE_W, y: TOPBAR.y, w: PLATE_W, h: TOPBAR.h };
const TIMER = { x: (W - TIMER_W) / 2, y: TOPBAR.y, w: TIMER_W, h: TOPBAR.h };
const COUNT_W = 44; // room for each side's fighters-left number beside the bar
const TUG = { x: S.pad + COUNT_W, y: TOPBAR.y + TOPBAR.h + S.pad, w: W - 2 * (S.pad + COUNT_W), h: 10 };
const METER = { x: W / 2 - 78, y: TUG.y + TUG.h + S.pad + 2, w: 172, h: 6 };
const TOKEN = { x: METER.x - 18, y: METER.y + METER.h / 2, size: 18 };
/** The scoreboard: one slate band across the top that carries the whole HUD. */
const HUD_H = METER.y + METER.h + S.pad;
const STREAK = { x: METER.x + METER.w + 62, y: METER.y + METER.h / 2 };
const BANNER_W = { short: 300, long: 400 };
const HP_BAR = { minW: 14, h: 3, lift: 7 }; // the tiny health bar over a hurt fighter
const STAR = 18; // a knock-out star on its way to the meter
const COUNT_SCALE = 2.2; // the 3, 2, 1 is the title size, this much larger
const MID = { x: W / 2, y: FIELD.y + FIELD.h * 0.42 }; // where the countdown and the banners sit

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

const SWING: Record<WeaponType, SoundName> = { knife: 'knife', bat: 'bat', spear: 'spear', shield: 'shieldBash' };
const STEEL = COLOR.white; // a clang ring on a shield or spear

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
  let battle: Battle | null = null;
  let views: View[] = [];
  let order: SimUnit[] = [];
  let drops: Drop[] = [];
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

  const fieldX = (u: { x: number }) => FIELD.x + u.x;
  const fieldY = (u: { y: number }) => FIELD.y + u.y;

  function enter(): void {
    const m = app.match;
    fx.clear();
    deaths.clear();
    deaths.setRatio(app.ratio);
    t = deployT = countT = endT = energy = 0;
    countN = landed = rollsPopped = fullT = tokenBump = streak = streakPop = 0;
    streakT = 99;
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
    let top = 1e9;
    for (const id of d.ids) {
      const u = b.units[id];
      views[id].born = 0;
      order.push(u);
      cx += fieldX(u) / d.ids.length;
      top = Math.min(top, fieldY(u) - u.r * 2.4);
      fx.dust(fieldX(u), fieldY(u) - u.r * 0.6, d.ids.length > 4 ? 2 : 4, u.r * 0.5 + 3);
    }
    const u0 = b.units[d.ids[0]];
    fx.ring(cx, fieldY(u0), TEAM[d.team].light, 6, 24 + d.ids.length * 3, 0.3, 0);
    fx.floatText(cx, top - 6, `+${d.ids.length} ${PIECE_NAME[u0.pet]}`, TEAM[d.team].light, TYPE.small);
    sfx.play('deploy', 0, { x: cx, enemy: d.team === 1 });
  }

  // ------------------------------------------------------------------ the fight's events

  function onEvent(ev: SimEvent): void {
    const b = battle!;
    switch (ev.type) {
      case 'start':
        banner = { text: 'FIGHT!', color: 'red', t: 0, dur: 0.95 };
        countN = 0;
        sfx.play('fight');
        fx.flash(COLOR.white, 0.3, 0.25);
        fx.shake(5, 0.3);
        app.arena.cheer(1);
        break;
      case 'swing': {
        const u = b.units[ev.unit];
        views[u.id].strike = 1;
        sfx.play(ev.weapon ? SWING[ev.weapon] : 'bite', 0, { x: fieldX(u), enemy: u.team === 1 });
        break;
      }
      case 'hit':
        onHit(ev);
        break;
      case 'land': {
        const u = b.units[ev.unit];
        fx.ring(FIELD.x + ev.x, FIELD.y + ev.y, COLOR.white, u.r * 0.5, u.r * 1.7 + 2, 0.25, 0);
        sfx.play('hop', 0, { x: FIELD.x + ev.x, enemy: u.team === 1 });
        break;
      }
      case 'death':
        onDeath(ev);
        break;
      case 'enrage':
        overtime = true;
        banner = { text: 'OVERTIME!', color: 'gold', t: 0, dur: 1.4 };
        sfx.play('enrage');
        music.set('overtime');
        fx.flash(COLOR.vermilion, 0.25, 0.4);
        fx.shake(4, 0.4);
        app.arena.cheer(0.8);
        break;
      case 'end':
        winner = ev.winner;
        phase = 'done';
        if (app.match) app.match.summary = b.summary;
        music.energy(0);
        if (ev.byTime) {
          banner = { text: 'TIME!', color: 'indigo', t: 0, dur: 1.3 };
          fx.flash(COLOR.white, 0.4, 0.3);
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
    const x = FIELD.x + ev.x;
    const y = FIELD.y + ev.y - v.r;
    const at = { x, enemy: b.units[ev.from].team === 1 };
    const c = Math.cos(ev.dir);
    const s = Math.sin(ev.dir);
    if (ev.blocked) {
      // a clang on the shield: a ring and sparks thrown back
      sfx.play('block', 0, at);
      fx.ring(x - c * v.r, y - s * v.r, STEEL, v.r * 0.4, v.r * 1.6 + 6, 0.2);
      fx.burst(x - c * v.r, y - s * v.r, { colors: [COLOR.goldLight, COLOR.white], n: 4, speed: 170, size: 5, life: 0.3, gravity: 300, shape: 'star', dir: ev.dir + Math.PI, spread: 0.9 });
    } else if (ev.weapon === 'bat') {
      // the big one
      sfx.play('batHit', 0, at);
      fx.ring(x, y, COLOR.white, v.r * 0.6, v.r * 2.4 + 12, 0.28);
      fx.dust(x + c * v.r, FIELD.y + ev.y, 4, v.r * 0.4 + 3, true);
      // the star, the word, the camera kick and the freeze: every time in a duel, now and then in a crowd,
      // so a big fight stays readable and keeps its pace
      if (bonkT <= 0) {
        bonkT = BONK_GAP * (1 + (b.alive[0] + b.alive[1]) / 40);
        fx.impact(x, y, v.r * 0.7 + (ev.heavy ? 15 : 10), COLOR.toast, 0.18);
        fx.kick(ev.dir, ev.heavy ? 7 : 4);
        fx.shake(ev.heavy ? 3 : 1.5, 0.15);
        fx.hitStop(ev.heavy ? 0.055 : 0.03);
        deaths.say(x, y - v.r * 2 - 14, 'BONK!', COLOR.toast, TYPE.h2);
      }
    } else if (ev.weapon === 'knife') {
      // a quick bright slash across it
      sfx.play('knifeHit', 0, at);
      const a = ev.dir + Math.PI / 2 + (ev.from % 2 ? 0.5 : -0.5);
      const len = v.r * 2 + 16;
      fx.streak(x - (Math.cos(a) * len) / 2, y - (Math.sin(a) * len) / 2, a, len, COLOR.white, 4, 0.14);
    } else if (ev.weapon === 'spear') {
      // a thrust streak right through it
      sfx.play('spearHit', 0, at);
      fx.streak(x - c * (v.r + 22), y - s * (v.r + 22), ev.dir, v.r * 2 + 38, COLOR.white, 3, 0.16);
      fx.burst(x + c * v.r, y + s * v.r, { colors: [COLOR.white], n: 2, speed: 150, size: 3, life: 0.2, gravity: 0, dir: ev.dir, spread: 0.4 });
    } else if (ev.weapon === 'shield') {
      fx.ring(x, y, STEEL, v.r * 0.5, v.r * 1.8 + 5, 0.2);
      fx.dust(x + c * v.r, FIELD.y + ev.y, 2, v.r * 0.3 + 3, true);
    } else if (b.alive[0] + b.alive[1] <= CROWDED) {
      fx.burst(x, y, { colors: [COLOR.white, TEAM[v.team].light], n: 2, speed: 90, size: 3, life: 0.22, gravity: 200, dir: ev.dir, spread: 0.8 });
    }
    if (ev.stun) sfx.play('stun', 0, at);
  }

  function onDeath(ev: Extract<SimEvent, { type: 'death' }>): void {
    const b = battle!;
    const u = b.units[ev.unit];
    const x = FIELD.x + ev.x;
    const y = FIELD.y + ev.y;
    const i = order.indexOf(u);
    if (i >= 0) order.splice(i, 1);
    deaths.start(views[u.id].look, u.r, x, y, u.face, { weapon: ev.weapon, dir: ev.dir, power: ev.power });
    if (u.team === 1) {
      // yours: a star for the roll meter, and maybe a streak
      const arrive = () => {
        landed++;
        tokenBump = 1;
        sfx.play('meter', 0, { x: TOKEN.x });
      };
      if (fx.flying < MAX_STARS) fx.flyTo(x, y - u.r, TOKEN.x, TOKEN.y, (c, sx, sy, s) => koStar(c, sx, sy, STAR * s, UI.accent), arrive, { delay: 0.12, life: 0.55 });
      else arrive();
      streak = streakT < STREAK_GAP ? streak + 1 : 1;
      streakT = 0;
      if (streak >= 2) {
        streakPop = 1;
        sfx.play('combo', streak);
        if (streak % 5 === 0) {
          app.arena.cheer(0.7);
          sfx.play('cheer');
        }
      }
    }
    if (ev.last) {
      // the blow that decides it: the world slows down to watch
      fx.slowMo(0.2, 0.85);
      fx.flash(COLOR.white, 0.7, 0.4);
      fx.speedLines(x, y - u.r, COLOR.white, 1);
      fx.shake(11, 0.9);
      fx.ring(x, y - u.r, COLOR.white, u.r, 150, 0.6);
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
    // nearly sorted from the last frame: an insertion sort is the cheap way
    for (let i = 1; i < order.length; i++) {
      const u = order[i];
      let j = i - 1;
      while (j >= 0 && order[j].y > u.y) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = u;
    }
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
      fx.floatText(METER.x + METER.w / 2, METER.y + METER.h + 30, '+1 ROLL', UI.accent, TYPE.h2);
      fx.ring(TOKEN.x, TOKEN.y, UI.accent, 8, 30, 0.4, 2);
      fx.burst(METER.x + METER.w / 2, METER.y + METER.h / 2, { colors: [UI.accent, UI.text], n: 6, speed: 180, size: 4, life: 0.45, gravity: 260, screen: true });
    }
    fullT = Math.max(0, fullT - dt);
    tokenBump = Math.max(0, tokenBump - dt * 5);
    streakPop = Math.max(0, streakPop - dt * 6);
    streakT += dt;
  }

  // ------------------------------------------------------------------ drawing

  function drawFighters(ctx: Ctx): void {
    for (const u of order) {
      const v = views[u.id];
      if (v.born < 0) continue;
      const x = fieldX(u);
      const y = fieldY(u);
      ctx.translate(x, y);
      petArt.drawShadow(ctx, v.look, u.r * Math.min(1, v.pose.squashX), u.hop);
      ctx.translate(-x, -y);
    }
    for (const u of order) {
      const v = views[u.id];
      if (v.born < 0) continue;
      const x = fieldX(u);
      const y = fieldY(u);
      ctx.translate(x, y);
      petArt.drawPet(ctx, v.look, v.pose, u.r);
      ctx.translate(-x, -y);
    }
    // on top of the crowd of bodies: health of the hurt ones, stars of the dizzy ones
    for (const u of order) {
      if (u.hp >= u.maxHp && u.phase !== 'stun') continue;
      const v = views[u.id];
      const x = fieldX(u);
      const top = fieldY(u) - petArt.headTop(v.look, u.r) - u.hop * u.r * (u.pet === 'frog' ? 1.5 : 0.8);
      if (u.hp < u.maxHp && winner === null) {
        const w = Math.max(HP_BAR.minW, u.r * 2);
        ctx.fillStyle = COLOR.ink;
        ctx.fillRect(x - w / 2 - 1, top - HP_BAR.lift - 1, w + 2, HP_BAR.h + 2);
        ctx.fillStyle = TEAM[u.team].main;
        ctx.fillRect(x - w / 2, top - HP_BAR.lift, w * clamp(u.hp / u.maxHp, 0, 1), HP_BAR.h);
      }
      if (u.phase === 'stun') fx.orbitStars(ctx, x, top - 4, u.r * 0.8 + 3, t);
    }
  }

  function drawHud(ctx: Ctx): void {
    const b = battle!;
    const opp = app.match!.opponent;
    ctx.fillStyle = UI.glass;
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = UI.border;
    ctx.fillRect(0, HUD_H, W, 1);
    namePlate(ctx, PLATE_ME, { name: app.state.name, trophies: app.state.trophies, team: 0, align: 'left' });
    namePlate(ctx, PLATE_BOT, { name: opp.name, trophies: opp.trophies, team: 1, bot: true, align: 'right' });
    const secs = Math.max(0, Math.ceil(FIGHT.timeLimit - Math.max(0, b.time)));
    const blink = overtime && winner === null ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
    pill(ctx, TIMER, { icon: clock, text: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, flash: blink });

    // health as a tug of war, with each side's fighters left at its end
    tugBar(ctx, TUG, b.hpShare[0], b.hpShare[1], t);
    const cy = TUG.y + TUG.h / 2;
    label(ctx, String(b.alive[0]), S.pad + 2, cy + 1, TYPE.body + 2, { align: 'left', weight: 700 });
    label(ctx, String(b.alive[1]), W - S.pad - 2, cy + 1, TYPE.body + 2, { align: 'right', weight: 700 });

    // the roll meter: knock-outs fill it
    const shown = fullT > 0 ? 1 : meterShown - Math.floor(meterShown + 1e-6);
    meter(ctx, METER, shown, { ticks: 4, full: fullT > 0 });
    rollToken(ctx, TOKEN.x, TOKEN.y, TOKEN.size * (1 + 0.2 * tokenBump), fullT > 0 ? UI.accent : undefined);
    if (streak >= 2 && streakT < STREAK_SHOW) {
      const k = 1 + 0.25 * streakPop;
      ctx.globalAlpha = clamp((STREAK_SHOW - streakT) / 0.3, 0, 1);
      koStar(ctx, STREAK.x - 30, STREAK.y, STAR * k, UI.accent);
      label(ctx, `×${streak}`, STREAK.x - 16, STREAK.y + 1, TYPE.body * k, { align: 'left', color: UI.accent, weight: 700 });
      ctx.globalAlpha = 1;
    }
  }

  function drawCalls(ctx: Ctx): void {
    const b = battle!;
    if (phase === 'fight' && b.time < 0 && countN > 0) {
      // 3, 2, 1: each number drops in and fades as the next one comes
      const third = FIGHT.countdown / 3;
      const k = clamp(countT / third, 0, 1);
      const s = COUNT_SCALE * (1 + 0.25 * (1 - easeOutCubic(Math.min(1, k * 5))));
      ctx.save();
      ctx.translate(MID.x, MID.y);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp(k * 8, 0, 1) * clamp((1 - k) * 4, 0, 1);
      label(ctx, String(countN), 0, 0, TYPE.title, { color: countN === 1 ? UI.accent : UI.text, weight: 700, onPitch: true });
      ctx.restore();
    }
    if (banner) {
      // a title slab: slides up a little as it fades in, holds still, fades out
      const k = banner.t / banner.dur;
      const inK = easeOutCubic(clamp(banner.t / 0.18, 0, 1));
      ctx.save();
      ctx.translate(MID.x, MID.y + (1 - inK) * 14);
      ctx.globalAlpha = inK * clamp((1 - k) * 7, 0, 1);
      ribbon(ctx, 0, 0, banner.text.length > 6 ? BANNER_W.long : BANNER_W.short, banner.text, { color: banner.color, size: TYPE.title });
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
    deaths.drawOver(ctx);
    fx.drawOver(ctx);
    app.arena.drawBattleFront(ctx, t);
    ctx.restore();
    if (overtime && winner === null) {
      // overtime: the edges of the screen glow red
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 6);
      ctx.strokeStyle = UI.danger;
      ctx.lineWidth = 6;
      rr(ctx, 0, 0, W, H, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
