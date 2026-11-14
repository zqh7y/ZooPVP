import { music, sfx } from '../audio/engine';
import { LEAGUES, leagueOf } from '../data';
import { Fx } from '../draw/fx';
import { koStar, leagueBadge, rollToken, trophy } from '../draw/icons';
import { button, panel, ribbon, type IconFn } from '../draw/ui';
import { claimRoad, applyMatch } from '../logic/progress';
import { hashSeed, makeRng } from '../rng';
import type { App, Screen } from '../screen';
import { COLOR, S, TEAM, TYPE, W } from '../theme';
import type { MatchResult } from '../types';
import { clamp, easeOutBack, easeOutCubic, inRect, label, type Ctx, type Rect } from '../util';

// layout
const RIBBON = { y: 210, w: 460 };
const SUB_Y = 290;
const PANEL: Rect = { x: S.pad * 3, y: 340, w: W - S.pad * 6, h: 520 };
const LINE_H = 92;
const LINE_X = PANEL.x + S.pad * 2;
const ICON = 46;
const STANDING_GAP = 80; // the league line under the panel
const CONTINUE: Rect = { x: (W - 320) / 2, y: 930, w: 320, h: S.btnH };

// timing
const RIBBON_POP = 0.35;
const FIRST_LINE = 0.9;
const LINE_GAP = 0.3; // pause between two lines
const COUNT_FOR = 0.6; // a number counts up this long
const TICK_EVERY = 0.05;
const BUTTON_AFTER = 0.3;

interface Line {
  icon: IconFn;
  text: string;
  /** the number it counts to; NaN for a line with no number */
  value: number;
  sign: boolean;
  color: string;
  at: number;
  /** sound once it is counted */
  done?: () => void;
  shown?: boolean;
  last?: number;
}

/** The match's outcome: VICTORY or DEFEAT, the trophies, knock-outs and rolls counting up, CONTINUE. */
export function createResult(app: App): Screen {
  const fx = new Fx();
  let t = 0;
  let tickT = 0;
  let res: MatchResult | null = null;
  let lines: Line[] = [];
  let buttonAt = 0;
  let pressed = false;
  let left = false;

  function build(r: MatchResult, roadRolls: number) {
    lines = [];
    let at = FIRST_LINE;
    const add = (l: Omit<Line, 'at'>, len = COUNT_FOR) => {
      lines.push({ ...l, at });
      at += len + LINE_GAP;
    };
    add({
      icon: trophy, text: 'Trophies', value: r.trophies, sign: true, color: r.trophies >= 0 ? COLOR.gold : TEAM[1].light,
      done: () => (r.trophies >= 0 ? sfx.play('trophyUp', r.trophies) : sfx.play('trophyDown')),
    });
    add({ icon: koStar, text: 'Knock-outs', value: r.kills, sign: false, color: COLOR.white });
    add({ icon: rollToken, text: 'Rolls earned', value: r.rolls, sign: true, color: COLOR.jadeLight, done: () => r.rolls > 0 && sfx.play('rollEarned') });
    if (r.leagueUp >= 0) {
      const li = r.leagueUp;
      add({ icon: (c, x, y, s) => leagueBadge(c, x, y, s, li), text: `${LEAGUES[li].name} League!`, value: NaN, sign: false, color: COLOR.goldLight, done: () => sfx.play('leagueUp', li) }, 0.4);
    }
    if (roadRolls > 0) add({ icon: rollToken, text: 'Trophy road', value: roadRolls, sign: true, color: COLOR.jadeLight, done: () => sfx.play('rollEarned') });
    buttonAt = at - LINE_GAP + BUTTON_AFTER;
  }

  function skip() {
    if (t < buttonAt) t = buttonAt;
  }

  function drawLine(ctx: Ctx, l: Line, y: number) {
    const age = t - l.at;
    if (age < 0) return;
    const k = easeOutBack(clamp(age / 0.3, 0, 1));
    ctx.save();
    ctx.translate((1 - k) * -60, 0);
    ctx.globalAlpha = clamp(age / 0.2, 0, 1);
    l.icon(ctx, LINE_X + ICON / 2, y, ICON);
    label(ctx, l.text, LINE_X + ICON + S.pad * 1.5, y, TYPE.h2, { align: 'left' });
    if (!Number.isNaN(l.value)) {
      const shown = Math.round(l.value * easeOutCubic(clamp(age / COUNT_FOR, 0, 1)));
      const s = l.sign && shown > 0 ? `+${shown}` : `${shown}`;
      const pop = age > COUNT_FOR && age < COUNT_FOR + 0.2 ? 1 + 0.25 * Math.sin(((age - COUNT_FOR) / 0.2) * Math.PI) : 1;
      ctx.save();
      ctx.translate(PANEL.x + PANEL.w - S.pad * 2, y);
      ctx.scale(pop, pop);
      label(ctx, s, 0, 0, TYPE.h1, { align: 'right', color: l.color });
      ctx.restore();
    }
    ctx.restore();
  }

  return {
    enter() {
      fx.clear();
      t = tickT = 0;
      pressed = left = false;
      res = null;
      const m = app.match;
      if (!m || !m.summary) return;
      let roadRolls = 0;
      if (!m.result) {
        m.result = applyMatch(app.state, m.summary, m.opponent, makeRng(hashSeed(m.opponent.seed, 3)));
        roadRolls = claimRoad(app.state).rolls;
        if (app.state.tutorial === 3) app.state.tutorial = 4;
        app.save();
      }
      res = m.result;
      build(res, roadRolls);
      if (res.won) {
        fx.confettiCannon();
        sfx.play('victory');
        music.set('victory');
      } else {
        fx.sadDrizzle();
        sfx.play('defeat');
        music.set('defeat');
      }
      fx.shake(8, 0.3);
    },
    leave() {
      fx.clear();
    },
    update(dt) {
      t += dt;
      fx.update(dt);
      if (!res) {
        if (!left) {
          left = true;
          app.go('lobby');
        }
        return;
      }
      tickT -= dt;
      for (const l of lines) {
        const age = t - l.at;
        if (age < 0) continue;
        if (!l.shown) {
          l.shown = true;
          l.last = 0;
        }
        if (Number.isNaN(l.value)) {
          if (l.done && age >= 0.2) {
            l.done();
            l.done = undefined;
            fx.burst(LINE_X + ICON / 2, PANEL.y + 70 + lines.indexOf(l) * LINE_H, { colors: [COLOR.gold, COLOR.goldLight, COLOR.white], n: 24, speed: 380, size: 7, life: 0.7, gravity: 300, shape: 'star' });
          }
          continue;
        }
        const shown = Math.round(Math.abs(l.value) * easeOutCubic(clamp(age / COUNT_FOR, 0, 1)));
        if (shown !== l.last && tickT <= 0) {
          l.last = shown;
          tickT = TICK_EVERY;
          sfx.play('count');
        }
        if (age >= COUNT_FOR && l.done) {
          l.done();
          l.done = undefined;
        }
      }
    },
    render(ctx) {
      app.arena.drawDusk(ctx, app.t);
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      fx.drawUnder(ctx);
      if (res) {
        const k = clamp(t / RIBBON_POP, 0, 1);
        const s = k < 1 ? 2.2 - 1.2 * easeOutCubic(k) : 1;
        ctx.save();
        ctx.translate(W / 2, RIBBON.y);
        ctx.scale(s, s);
        ctx.globalAlpha = Math.min(1, k * 2);
        ribbon(ctx, 0, 0, RIBBON.w, res.won ? 'VICTORY' : 'DEFEAT', { color: res.won ? 'gold' : 'indigo' });
        ctx.restore();
        if (t > RIBBON_POP) {
          const secs = Math.round(res.time);
          label(ctx, `${res.won ? 'Won' : 'Lost'} in ${secs} s, ${res.losses} of yours knocked out`, W / 2, SUB_Y, TYPE.body, { color: COLOR.textDim });
        }
        const pk = easeOutCubic(clamp((t - 0.5) / 0.3, 0, 1));
        if (pk > 0) {
          ctx.save();
          ctx.globalAlpha = pk;
          const h = Math.max(LINE_H * lines.length + S.section * 2, 200);
          panel(ctx, { ...PANEL, h }, { tone: 'dark' });
          lines.forEach((l, i) => drawLine(ctx, l, PANEL.y + S.section + LINE_H / 2 + i * LINE_H));
          ctx.restore();
          // where you stand now: league badge and trophies
          const sk = clamp((t - buttonAt + 0.2) / 0.3, 0, 1);
          if (sk > 0) {
            const y = PANEL.y + h + STANDING_GAP;
            const li = leagueOf(app.state.trophies);
            ctx.save();
            ctx.globalAlpha = sk;
            leagueBadge(ctx, W / 2 - 120, y, ICON + S.gap, li);
            label(ctx, `${LEAGUES[li].name} League`, W / 2 - 84, y - 14, TYPE.h2, { align: 'left' });
            label(ctx, `${app.state.trophies} trophies`, W / 2 - 84, y + 16, TYPE.body, { align: 'left', color: COLOR.goldLight });
            ctx.restore();
          }
        }
        if (t >= buttonAt) {
          const bk = easeOutBack(clamp((t - buttonAt) / 0.3, 0, 1));
          ctx.save();
          ctx.translate(W / 2, CONTINUE.y + CONTINUE.h / 2);
          ctx.scale(bk, bk);
          ctx.translate(-W / 2, -(CONTINUE.y + CONTINUE.h / 2));
          button(ctx, CONTINUE, { variant: 'primary', text: 'CONTINUE', pressed, pulse: 0.5 + 0.5 * Math.sin(t * 4) });
          ctx.restore();
        }
      }
      fx.drawOver(ctx);
      ctx.restore();
      fx.drawScreen(ctx);
    },
    pointerDown(x, y) {
      if (t >= buttonAt && inRect(x, y, CONTINUE)) pressed = true;
      else skip();
    },
    pointerMove(x, y) {
      if (pressed && !inRect(x, y, CONTINUE)) pressed = false;
    },
    pointerUp(x, y) {
      if (pressed && inRect(x, y, CONTINUE) && !left) {
        pressed = false;
        left = true;
        sfx.play('click');
        app.go('lobby');
      }
      pressed = false;
    },
    pointerCancel() {
      pressed = false;
    },
  };
}
