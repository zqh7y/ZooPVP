import { music, sfx } from '../audio/engine';
import { Fx } from '../draw/fx';
import { petArt } from '../draw/pets';
import { restPose, type PetLook } from '../draw/petTypes';
import { classBadge, countBadge, namePlate, powerChip, veil } from '../draw/ui';
import { makeOpponent } from '../logic/bots';
import { frand, hashSeed, makeRng } from '../rng';
import type { App, Screen } from '../screen';
import { COLOR, S, TEAM, TYPE, UI, W } from '../theme';
import type { ArmySpec, Opponent, SquadSpec } from '../types';
import { armyPower } from '../data';
import { circle, clamp, easeOutCubic, label, rr, textWidth, type Ctx, type Rect } from '../util';

// layout: one panel per side (the name plate is its header row, the army below it), mirrored about VS
const PANEL_X = S.pad * 2;
const PANEL_W = W - S.pad * 4;
const HEAD_H = 64;
const VS = { x: W / 2, y: 585, r: 64, w: 96, h: 64 };
const SIDE_GAP = 56; // from VS to the near edge of each panel
const ME_TOP = VS.y + SIDE_GAP;
const MAX_TILES = 16;
const POWER = { w: 160, h: 36 };
const RADAR = { x: W / 2, y: 330, r: 136 };
const SEARCH_TEXT_Y = 530;
const TAP_Y = 1090; // at most this low: it sits a little under your panel

/** How an army is laid out: a small squad list gets fewer, larger fighters (lobby tile size), a big one two rows of eight. */
function armyGrid(n: number) {
  const big = n <= 4;
  const perRow = big ? 4 : 8;
  const slotW = big ? 104 : 58;
  const slotH = big ? 104 : 76;
  const rows = Math.max(1, Math.ceil(n / perRow));
  const bodyH = S.pad + rows * slotH + S.gap + POWER.h + S.pad + S.base;
  return { big, perRow, slotW, slotH, rows, bodyH, petR: big ? 30 : 17 };
}
const sortSquads = (a: ArmySpec): SquadSpec[] => [...a.squads].sort((x, y) => y.level - x.level || y.count - x.count).slice(0, MAX_TILES);

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
    // a pool of dark under the scope, so the pitch's lines never cross its rings
    const pool = ctx.createRadialGradient(x, y, r * 0.75, x, y, r * 1.45);
    pool.addColorStop(0, UI.bg);
    pool.addColorStop(1, 'rgba(12, 16, 22, 0)');
    ctx.fillStyle = pool;
    circle(ctx, x, y, r * 1.45);
    ctx.fill();
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

  /**
   * One side: its name plate as the header of one panel, the army in the panel's body (idle pets with their class
   * and head count) and its power. The opponent's is mirrored (team edge and name on the right) and sits above VS.
   */
  function drawSide(ctx: Ctx, army: ArmySpec, team: 0 | 1, age: number) {
    const squads = sortSquads(army);
    const g = armyGrid(squads.length);
    const pk = easeOutCubic(clamp(age / SLIDE, 0, 1));
    const top = team === 1 ? VS.y - SIDE_GAP - HEAD_H - g.bodyH : ME_TOP;
    const dir = team === 1 ? -1 : 1;
    const header: Rect = { x: PANEL_X, y: top, w: PANEL_W, h: HEAD_H };
    ctx.save();
    // the opponent's panel drops in from above; yours was already there, its body opens downward
    if (team === 1) ctx.translate(0, -(1 - pk) * 160);
    const who = team === 1 && opponent ? { name: opponent.name, trophies: opponent.trophies, bot: true } : { name: app.state.name, trophies: app.state.trophies, bot: false };
    namePlate(ctx, header, { ...who, team, align: team === 1 ? 'right' : 'left', body: Math.round(g.bodyH * (team === 1 ? 1 : pk)) });
    const y0 = top + HEAD_H + S.pad;
    for (let i = 0; i < squads.length; i++) {
      const row = Math.floor(i / g.perRow);
      const inRow = Math.min(g.perRow, squads.length - row * g.perRow);
      const col = i % g.perRow;
      const k = easeOutCubic(clamp((age - i * ROW_STAGGER) / SLIDE, 0, 1));
      if (k <= 0) continue;
      const sq = squads[i];
      const x = W / 2 + (col - (inRow - 1) / 2) * g.slotW;
      const y = y0 + row * g.slotH + g.slotH - (g.big ? 30 : 22) + dir * (1 - k) * 16;
      const look: PetLook = { pet: sq.pet, level: sq.level, team, weapon: sq.weapon, weaponLevel: sq.weaponLevel, helmet: sq.helmet, sneakers: sq.sneakers, chili: sq.chili, seed: i * 1.7 };
      const pose = restPose();
      pose.t = app.t + i * 0.37;
      pose.face = team === 1 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha *= clamp(k, 0, 1);
      ctx.save();
      ctx.translate(x, y);
      petArt.drawShadow(ctx, look, g.petR, 0);
      petArt.drawPet(ctx, look, pose, g.petR);
      ctx.restore();
      // the class (and the head count) on one small row centred under the fighter's feet
      const by = y + (g.big ? 16 : 12);
      const bw = sq.level >= 7 ? 30 : 16;
      const cw = sq.count > 1 ? 28 : 0;
      const bx = x - (bw + (cw ? S.base + cw : 0)) / 2;
      classBadge(ctx, sq.level, bx, by, 1, app.t);
      if (cw) countBadge(ctx, sq.count, bx + bw + S.base + cw / 2, by, 1);
      ctx.restore();
    }
    if (pk > 0) {
      ctx.globalAlpha *= pk;
      powerChip(ctx, { x: (W - POWER.w) / 2, y: y0 + g.rows * g.slotH + S.gap, w: POWER.w, h: POWER.h }, armyPower(army.squads));
    }
    ctx.restore();
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
    // a small block lit from the upper left: side face, top face, a highlight along the top edge
    const D = 5;
    rr(ctx, -VS.w / 2, -VS.h / 2 + D, VS.w, VS.h - D, S.radius.m);
    ctx.fillStyle = UI.textDim;
    ctx.fill();
    rr(ctx, -VS.w / 2, -VS.h / 2, VS.w, VS.h - D, S.radius.m);
    ctx.fillStyle = UI.text;
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(-VS.w / 2 + S.radius.m, -VS.h / 2 + 1, VS.w - S.radius.m * 2, 1);
    label(ctx, 'VS', 0, -D / 2 + 2, TYPE.h1, { color: UI.accentText, weight: 700, track: 3 });
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
      veil(ctx, 1); // the stadium stays in the dark behind the match-up
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      fx.drawUnder(ctx);
      if (found < 0) {
        drawRadar(ctx);
        // your plate waits where your side's panel will open
        namePlate(ctx, { x: PANEL_X, y: ME_TOP, w: PANEL_W, h: HEAD_H }, { name: app.state.name, trophies: app.state.trophies, team: 0 });
      } else if (opponent) {
        const age = t - found;
        drawSide(ctx, opponent.army, 1, age);
        drawSide(ctx, mine, 0, age);
        drawVs(ctx, age);
        if (age > TAP_AFTER) {
          ctx.save();
          ctx.globalAlpha = 0.7 + 0.3 * Math.sin(app.t * 3);
          label(ctx, 'TAP TO FIGHT', W / 2, Math.min(TAP_Y, ME_TOP + HEAD_H + armyGrid(sortSquads(mine).length).bodyH + S.section * 2), TYPE.caption, { color: UI.text, track: 2.5, onPitch: true });
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
