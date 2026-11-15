import { music, sfx } from '../audio/engine';
import { Fx } from '../draw/fx';
import { petArt } from '../draw/pets';
import { restPose, type PetLook } from '../draw/petTypes';
import { classBadge, classBadgeSize, countBadge, panel, powerChip, vsBar } from '../draw/ui';
import { makeOpponent } from '../logic/bots';
import { frand, hashSeed, makeRng } from '../rng';
import type { App, Screen } from '../screen';
import { COLOR, H, S, TEAM, TYPE, UI, W } from '../theme';
import type { ArmySpec, Opponent, SquadSpec } from '../types';
import { armyPower } from '../data';
import { circle, clamp, easeOutCubic, label, rr, textWidth, type Ctx, type Rect } from '../util';

// layout: the VS bar at the top, then one panel per army (the opponent's, then yours), mirrored about the middle
const BAR: Rect = { x: S.pad + 4, y: 104, w: W - S.pad * 2 - 8, h: 72 };
const PANEL_X = S.pad * 2;
const PANEL_W = W - S.pad * 4;
const HEAD_H = 40; // the strip on top of an army panel that says whose it is
const VS = { x: W / 2, y: BAR.y + BAR.h / 2, r: 64 };
const ARMIES_TOP = BAR.y + BAR.h + 64;
const ARMY_GAP = 28;
const MAX_TILES = 16;
const POWER = { w: 190, h: 40 };
const RADAR = { x: W / 2, y: 470, r: 150 };
const SEARCH_TEXT_Y = RADAR.y + RADAR.r + 64;

/** How an army is laid out: a small squad list gets fewer, larger fighters, a big one two rows of eight. */
function armyGrid(n: number) {
  const tier = n <= 4 ? 0 : n <= 6 ? 1 : 2;
  const perRow = [4, 6, 8][tier];
  const slotW = [116, 78, 58][tier];
  const slotH = [128, 106, 90][tier];
  const rows = Math.max(1, Math.ceil(n / perRow));
  const bodyH = S.pad + rows * slotH + S.gap + POWER.h + S.pad + S.base;
  return { big: tier === 0, perRow, slotW, slotH, rows, bodyH, petR: [36, 27, 20][tier] };
}
// grouped by kind (ants together, frogs together), the strongest first in each
const sortSquads = (a: ArmySpec): SquadSpec[] => [...a.squads].sort((x, y) => (x.pet === y.pet ? y.level - x.level || y.count - x.count : x.pet < y.pet ? -1 : 1)).slice(0, MAX_TILES);

// timing
const SEARCH_MIN = 1.5;
const SEARCH_MAX = 3;
const PING_EVERY = 1;
const SLIDE = 0.35; // the plates and armies slide in
const VS_AT = 0.3; // after the opponent is found
const VS_POP = 0.25;
const ROW_STAGGER = 0.04;
const HOLD = 3; // then on to the fight
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

  /** The search: a white scope on the pitch, soft range rings, one gold sweep and a few contacts it lights up. */
  function drawRadar(ctx: Ctx) {
    const { x, y, r } = RADAR;
    ctx.save();
    ctx.fillStyle = 'rgba(110, 80, 40, 0.16)';
    circle(ctx, x + 6, y + 10, r + 14);
    ctx.fill();
    circle(ctx, x, y, r + 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = UI.border;
    ctx.stroke();
    circle(ctx, x, y, r);
    ctx.fillStyle = '#f4fbff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#dbe7ef';
    for (const k of [0.34, 0.67, 1]) {
      circle(ctx, x, y, r * k);
      ctx.stroke();
    }
    // one pulse rings out a second
    const p = (t % PING_EVERY) / PING_EVERY;
    ctx.globalAlpha = (1 - p) * 0.9;
    circle(ctx, x, y, r * p);
    ctx.lineWidth = 3;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // the sweep and the contacts it lights up
    const a = t * 3.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a - 0.7, a);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 194, 26, 0.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = UI.accentDark;
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const ba = i * 2.4 + 0.6;
      const br = r * (0.3 + ((i * 37) % 60) / 100);
      const since = (((a - ba) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const glow = clamp(1 - since / 2.5, 0, 1);
      if (glow <= 0) continue;
      ctx.globalAlpha = glow;
      circle(ctx, x + Math.cos(ba) * br, y + Math.sin(ba) * br, 6);
      ctx.fillStyle = TEAM[1].main;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    circle(ctx, x, y, 9);
    ctx.fillStyle = TEAM[0].main;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
    // the line on a white pill; the dots count up beside a line that stays put
    const text = 'SEARCHING FOR AN OPPONENT';
    const size = TYPE.lead;
    const tw = textWidth(ctx, text, size, 700, 2);
    rr(ctx, W / 2 - tw / 2 - 30, SEARCH_TEXT_Y - 24, tw + 60, 48, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    const x0 = W / 2 - tw / 2 - 6;
    label(ctx, text, x0, SEARCH_TEXT_Y + 1, size, { align: 'left', weight: 700, track: 2, color: UI.text });
    label(ctx, '.'.repeat(1 + (Math.floor(t * 2.5) % 3)), x0 + tw + 4, SEARCH_TEXT_Y + 1, size, { align: 'left', weight: 700, color: UI.textDim, track: 2 });
  }

  /** The top of one army panel (the opponent's first): y of its top edge and its height. */
  function sidePlace(team: 0 | 1): { top: number; g: ReturnType<typeof armyGrid> } {
    const og = armyGrid(opponent ? sortSquads(opponent.army).length : 1);
    const mg = armyGrid(sortSquads(mine).length);
    if (team === 1) return { top: ARMIES_TOP, g: og };
    return { top: ARMIES_TOP + HEAD_H + og.bodyH + ARMY_GAP, g: mg };
  }

  /**
   * One army: a white panel with a strip in the team colour saying whose it is, the fighters grouped by kind
   * (idle, each with its class plate and head count under its feet) and the army's power at the foot.
   */
  function drawSide(ctx: Ctx, army: ArmySpec, team: 0 | 1, age: number) {
    const squads = sortSquads(army);
    const { top, g } = sidePlace(team);
    const pk = easeOutCubic(clamp((age - (team === 1 ? 0.1 : 0.25)) / SLIDE, 0, 1));
    if (pk <= 0) return;
    const dir = team === 1 ? -1 : 1;
    ctx.save();
    ctx.globalAlpha *= pk;
    ctx.translate(0, dir * (1 - pk) * 40);
    const full: Rect = { x: PANEL_X, y: top, w: PANEL_W, h: HEAD_H + g.bodyH };
    panel(ctx, full);
    ctx.save();
    rr(ctx, full.x, full.y, full.w, full.h, S.radius.l);
    ctx.clip();
    ctx.fillStyle = TEAM[team].main;
    ctx.fillRect(full.x, full.y, full.w, HEAD_H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(full.x, full.y, full.w, HEAD_H * 0.4);
    ctx.restore();
    const who = team === 1 ? `${opponent?.name ?? 'Opponent'}'s army` : 'Your army';
    label(ctx, who.toUpperCase(), W / 2, top + HEAD_H / 2 + 1, TYPE.body, { weight: 700, track: 2, color: '#ffffff' });
    const y0 = top + HEAD_H + S.pad;
    for (let i = 0; i < squads.length; i++) {
      const row = Math.floor(i / g.perRow);
      const inRow = Math.min(g.perRow, squads.length - row * g.perRow);
      const col = i % g.perRow;
      const k = easeOutCubic(clamp((age - 0.3 - i * ROW_STAGGER) / SLIDE, 0, 1));
      if (k <= 0) continue;
      const sq = squads[i];
      const x = W / 2 + (col - (inRow - 1) / 2) * g.slotW;
      const y = y0 + row * g.slotH + g.slotH - (g.big ? 40 : 32) + (1 - k) * 14;
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
      // the class plate (and the head count) on one small row centred under the fighter's feet
      const kb = g.big ? 0.95 : 0.72;
      const by = y + (g.big ? 22 : 17);
      const bs = classBadgeSize(sq.level, kb);
      const cw = sq.count > 1 ? 30 * kb : 0;
      const bx = x - (bs.w + (cw ? S.base + cw : 0)) / 2;
      classBadge(ctx, sq.level, bx, by, kb, app.t);
      if (cw) countBadge(ctx, sq.count, bx + bs.w + S.base + cw / 2, by, kb);
      ctx.restore();
    }
    powerChip(ctx, { x: (W - POWER.w) / 2, y: y0 + g.rows * g.slotH + S.gap, w: POWER.w, h: POWER.h }, armyPower(army.squads));
    ctx.restore();
  }

  /** The VS bar: the two halves slide in from the sides and slam together, then the VS pops in. */
  function drawBar(ctx: Ctx, age: number) {
    const slide = easeOutCubic(clamp(age / SLIDE, 0, 1));
    const vs = clamp((age - VS_AT) / VS_POP, 0, 1);
    vsBar(ctx, BAR, {
      left: { name: app.state.name, trophies: app.state.trophies },
      right: { name: opponent?.name ?? '', trophies: opponent?.trophies ?? 0, bot: true },
      slide: found < 0 ? 0 : slide,
      vs,
    });
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
        fx.ring(VS.x, VS.y, '#ffffff', VS.r * 0.8, VS.r * 1.8, 0.35);
        fx.burst(VS.x, VS.y, { colors: [UI.accent, '#ffffff', TEAM[0].main, TEAM[1].main], n: 18, speed: 300, size: 4, life: 0.6, gravity: 380 });
      }
      if (age >= HOLD) start();
    },
    render(ctx) {
      app.arena.drawDusk(ctx, app.t);
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      fx.drawUnder(ctx);
      if (found < 0) {
        drawRadar(ctx);
        // your half of the bar waits at the top, the opponent's is still on its way
        vsBar(ctx, BAR, { left: { name: app.state.name, trophies: app.state.trophies }, right: { name: '' }, vs: 0, only: 0 });
      } else if (opponent) {
        const age = t - found;
        drawSide(ctx, opponent.army, 1, age);
        drawSide(ctx, mine, 0, age);
        drawBar(ctx, age);
        if (age > TAP_AFTER) {
          const me = sidePlace(0);
          const y = Math.min(H - 40, me.top + HEAD_H + me.g.bodyH + S.section * 2);
          const tw = textWidth(ctx, 'TAP TO FIGHT', TYPE.lead, 700, 3);
          ctx.save();
          ctx.globalAlpha = 0.8 + 0.2 * Math.sin(app.t * 3);
          rr(ctx, W / 2 - tw / 2 - 28, y - 23, tw + 56, 46, 23);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.fill();
          label(ctx, 'TAP TO FIGHT', W / 2, y + 1, TYPE.lead, { weight: 700, track: 3, color: UI.text });
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
