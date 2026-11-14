import { music, sfx } from '../audio/engine';
import { Fx } from '../draw/fx';
import { swords } from '../draw/icons';
import { petArt } from '../draw/pets';
import { restPose, type PetLook } from '../draw/petTypes';
import { classBadge, countBadge, namePlate, panel, pill, veil } from '../draw/ui';
import { makeOpponent } from '../logic/bots';
import { frand, hashSeed, makeRng } from '../rng';
import type { App, Screen } from '../screen';
import { COLOR, S, TEAM, TYPE, UI, W } from '../theme';
import type { ArmySpec, Opponent } from '../types';
import { armyPower } from '../data';
import { circle, clamp, easeOutCubic, label, rr, textWidth, type Ctx, type Rect } from '../util';

// layout
const PLATE_W = 320;
const PLATE_H = 64;
const OPP_PLATE: Rect = { x: (W - PLATE_W) / 2, y: 150, w: PLATE_W, h: PLATE_H };
const OPP_ARMY_Y = 236;
const ME_ARMY_Y = 706;
const ME_PLATE: Rect = { x: (W - PLATE_W) / 2, y: 972, w: PLATE_W, h: PLATE_H };
const SLOT_W = 58; // one squad's place in its row
const SLOT_H = 76;
const PET_R = 17;
const PER_ROW = 8;
const MAX_TILES = 16;
const POWER_W = 200;
const VS = { x: W / 2, y: 585, r: 64, w: 96, h: 64 };
const RADAR = { x: W / 2, y: 520, r: 140 };
const SEARCH_TEXT_Y = 720;
const TAP_Y = 1090;

// timing
const SEARCH_MIN = 1.5;
const SEARCH_MAX = 3;
const PING_EVERY = 1;
const SLIDE = 0.35; // the plates and armies slide in
const VS_AT = 0.3; // after the opponent is found
const VS_POP = 0.25;
const ROW_STAGGER = 0.04;
const HOLD = 2.5; // then on to the fight
const TAP_AFTER = 0.6; // a tap skips once this much is shown

/** Matchmaking: a radar search, then the opponent (a bot), both armies and a VS slam. */
export function createMatch(app: App): Screen {
  const fx = new Fx();
  let t = 0;
  let searchFor = 2;
  let found = -1; // time the opponent was found, -1 while searching
  let pingT = 0;
  let opponent: Opponent | null = null;
  let mine: ArmySpec = { squads: [] };
  let slammed = false;
  let gone = false;
  let down = false;

  function start() {
    if (gone || !opponent) return;
    gone = true;
    app.match = { opponent, army: mine, summary: null, result: null };
    app.state.seed = (hashSeed(app.state.seed, 101) % 2147483646) + 1;
    app.save();
    app.go('battle');
  }

  /** The search: thin range rings, one sweeping line, and a few faint contacts it lights up. */
  function drawRadar(ctx: Ctx) {
    const { x, y, r } = RADAR;
    ctx.save();
    ctx.lineWidth = S.line.thin;
    ctx.strokeStyle = UI.borderStrong;
    for (const k of [0.34, 0.67, 1]) {
      circle(ctx, x, y, r * k);
      ctx.stroke();
    }
    // one pulse rings out a second
    const p = (t % PING_EVERY) / PING_EVERY;
    ctx.globalAlpha = (1 - p) * 0.8;
    circle(ctx, x, y, r * p);
    ctx.lineWidth = S.line.ui;
    ctx.strokeStyle = UI.text;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // the sweep and the contacts it lights up
    const a = t * 3.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a - 0.6, a);
    ctx.closePath();
    ctx.fillStyle = 'rgba(241, 243, 245, 0.07)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineWidth = S.line.ui;
    ctx.strokeStyle = UI.text;
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const ba = i * 2.4 + 0.6;
      const br = r * (0.3 + ((i * 37) % 60) / 100);
      const since = (((a - ba) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const glow = clamp(1 - since / 2.5, 0, 1);
      if (glow <= 0) continue;
      ctx.globalAlpha = glow;
      circle(ctx, x + Math.cos(ba) * br, y + Math.sin(ba) * br, 3.5);
      ctx.fillStyle = TEAM[1].main;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    circle(ctx, x, y, 5);
    ctx.fillStyle = TEAM[0].main;
    ctx.fill();
    ctx.restore();
    // the dots count up beside a line that stays put
    const text = 'SEARCHING FOR AN OPPONENT';
    const size = TYPE.body;
    const x0 = W / 2 - textWidth(ctx, text, size, 600, 2) / 2;
    label(ctx, text, x0, SEARCH_TEXT_Y, size, { align: 'left', track: 2 });
    label(ctx, '.'.repeat(1 + (Math.floor(t * 2.5) % 3)), W / 2 + (W / 2 - x0) + 4, SEARCH_TEXT_Y, size, { align: 'left', color: UI.textDim, track: 2 });
  }

  /** One army on a dark panel: up to two rows of its squads as idle pets, and its power. */
  function drawArmy(ctx: Ctx, army: ArmySpec, y0: number, team: 0 | 1, age: number) {
    const squads = [...army.squads].sort((a, b) => b.level - a.level || b.count - a.count).slice(0, MAX_TILES);
    const rows = Math.max(1, Math.ceil(squads.length / PER_ROW));
    const dir = team === 1 ? -1 : 1;
    const pk = easeOutCubic(clamp(age / SLIDE, 0, 1));
    const ph = rows * SLOT_H + S.barH + S.section;
    ctx.save();
    ctx.globalAlpha = pk;
    panel(ctx, { x: S.pad * 2, y: y0 - S.pad, w: W - S.pad * 4, h: ph }, { tone: 'dark' });
    ctx.restore();
    for (let i = 0; i < squads.length; i++) {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, squads.length - row * PER_ROW);
      const col = i % PER_ROW;
      const k = easeOutCubic(clamp((age - i * ROW_STAGGER) / SLIDE, 0, 1));
      if (k <= 0) continue;
      const s = squads[i];
      const x = W / 2 + (col - (inRow - 1) / 2) * SLOT_W;
      const y = y0 + row * SLOT_H + SLOT_H - S.pad * 2 + dir * (1 - k) * 24;
      const look: PetLook = { pet: s.pet, level: s.level, team, weapon: s.weapon, weaponLevel: s.weaponLevel, helmet: s.helmet, sneakers: s.sneakers, chili: s.chili, seed: i * 1.7 };
      const pose = restPose();
      pose.t = app.t + i * 0.37;
      pose.face = team === 1 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(k, 0, 1);
      ctx.translate(x, y);
      petArt.drawShadow(ctx, look, PET_R, 0);
      petArt.drawPet(ctx, look, pose, PET_R);
      ctx.restore();
      classBadge(ctx, s.level, x - SLOT_W / 2 + 12, y + 10, 0.8, app.t);
      if (s.count > 1) countBadge(ctx, s.count, x + SLOT_W / 2 - 12, y + 10, 1);
    }
    const py = y0 + rows * SLOT_H + S.gap;
    if (pk > 0) {
      ctx.save();
      ctx.globalAlpha = pk;
      pill(ctx, { x: (W - POWER_W) / 2, y: py + 4, w: POWER_W, h: S.barH - 8 }, { icon: (c, x, y, sz) => swords(c, x, y, sz, TEAM[team].main), text: `POWER ${armyPower(army.squads)}` });
      ctx.restore();
    }
  }

  /** VS: a small plate on a hairline between the two armies. */
  function drawVs(ctx: Ctx, age: number) {
    const p = clamp((age - VS_AT) / VS_POP, 0, 1);
    if (p <= 0) return;
    const k = easeOutCubic(p);
    const s = 1.5 - 0.5 * k;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = UI.borderStrong;
    const reach = (W / 2 - S.pad * 2) * k;
    ctx.fillRect(VS.x - reach, VS.y - 0.5, reach * 2, 1);
    ctx.translate(VS.x, VS.y);
    ctx.scale(s, s);
    rr(ctx, -VS.w / 2, -VS.h / 2, VS.w, VS.h, S.radius.m);
    ctx.fillStyle = UI.text;
    ctx.fill();
    label(ctx, 'VS', 0, 2, TYPE.h1 + 4, { color: UI.accentText, weight: 700, track: 3 });
    ctx.restore();
  }

  return {
    enter() {
      fx.clear();
      t = pingT = 0;
      found = -1;
      slammed = gone = down = false;
      searchFor = frand(SEARCH_MIN, SEARCH_MAX);
      mine = app.inv.army();
      opponent = makeOpponent(app.state, makeRng(hashSeed(app.state.seed, app.state.matches, 7)));
      music.set('search');
      sfx.play('search');
    },
    leave() {
      fx.clear();
    },
    update(dt) {
      t += dt;
      fx.update(dt);
      if (found < 0) {
        pingT += dt;
        if (pingT >= PING_EVERY) {
          pingT -= PING_EVERY;
          sfx.play('search');
        }
        if (t >= searchFor) {
          found = t;
          sfx.play('found');
          fx.flash(COLOR.white, 0.12, 0.25);
        }
        return;
      }
      const age = t - found;
      if (!slammed && age >= VS_AT + VS_POP) {
        slammed = true;
        sfx.play('vsSlam');
        fx.shake(3, 0.2);
        fx.ring(VS.x, VS.y, UI.text, VS.r * 0.8, VS.r * 1.8, 0.35);
      }
      if (age >= HOLD) start();
    },
    render(ctx) {
      app.arena.drawDusk(ctx, app.t);
      veil(ctx, 0.7); // the stadium stays in the dark behind the match-up
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      fx.drawUnder(ctx);
      if (found < 0) {
        drawRadar(ctx);
        namePlate(ctx, ME_PLATE, { name: app.state.name, trophies: app.state.trophies, team: 0 });
      } else if (opponent) {
        const age = t - found;
        const k = easeOutCubic(clamp(age / SLIDE, 0, 1));
        ctx.save();
        ctx.translate(0, -(1 - k) * 160);
        namePlate(ctx, OPP_PLATE, { name: opponent.name, trophies: opponent.trophies, team: 1, bot: true });
        ctx.restore();
        drawArmy(ctx, opponent.army, OPP_ARMY_Y, 1, age);
        drawArmy(ctx, mine, ME_ARMY_Y, 0, age);
        ctx.save();
        ctx.translate(0, (1 - k) * 160);
        namePlate(ctx, ME_PLATE, { name: app.state.name, trophies: app.state.trophies, team: 0 });
        ctx.restore();
        drawVs(ctx, age);
        if (age > TAP_AFTER) {
          ctx.save();
          ctx.globalAlpha = 0.7 + 0.3 * Math.sin(app.t * 3);
          label(ctx, 'TAP TO FIGHT', W / 2, TAP_Y, TYPE.small + 1, { color: UI.textDim, track: 2.5 });
          ctx.restore();
        }
      }
      fx.drawOver(ctx);
      ctx.restore();
      fx.drawScreen(ctx);
    },
    pointerDown() {
      down = true;
    },
    pointerUp() {
      if (down && found >= 0 && t - found > TAP_AFTER) {
        sfx.play('click');
        start();
      }
      down = false;
    },
    pointerCancel() {
      down = false;
    },
  };
}
