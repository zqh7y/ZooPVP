import { music, sfx } from '../audio/engine';
import { LEAGUES, leagueOf } from '../data';
import { Fx } from '../draw/fx';
import { koStar, leagueBadge, rollToken, trophy } from '../draw/icons';
import { button, panel, ribbon, veil, type IconFn } from '../draw/ui';
import { claimRoad, applyMatch } from '../logic/progress';
import { hashSeed, makeRng } from '../rng';
import type { App, Screen } from '../screen';
import { H, S, TYPE, UI, W } from '../theme';
import type { MatchResult } from '../types';
import { clamp, easeOutCubic, inRect, label, type Ctx, type Rect } from '../util';

// layout: one column (title, score sheet, standing, CONTINUE) centred on the screen, a little above the middle,
// so a short sheet leaves no hole above the button
const RIBBON_W = 440;
const TITLE_H = Math.round(TYPE.title * 1.3); // the ribbon's title row; its caption row adds SUB_H under it
const SUB_H = TYPE.caption + S.pad + S.base;
const PANEL_X = S.pad * 3;
const PANEL_W = W - S.pad * 6;
const LINE_H = 76;
const LINE_X = PANEL_X + S.pad * 2;
const ICON = 26;
const GAP = S.section + S.pad + S.base; // 40, between the blocks
const STANDING_H = 40; // the league line under the panel
const BTN_W = 320;

/** Where everything sits for a sheet of n lines. */
function layout(n: number) {
  const panelH = LINE_H * n + S.pad * 2;
  const total = TITLE_H + SUB_H + GAP + panelH + GAP + STANDING_H + GAP + S.btnH;
  const top = Math.max(S.section * 4, Math.round((H - total) * 0.45));
  const panel: Rect = { x: PANEL_X, y: top + TITLE_H + SUB_H + GAP, w: PANEL_W, h: panelH };
  const standY = panel.y + panelH + GAP + STANDING_H / 2;
  const cont: Rect = { x: (W - BTN_W) / 2, y: standY + STANDING_H / 2 + GAP, w: BTN_W, h: S.btnH };
  return { titleY: top + TITLE_H / 2, panel, standY, cont };
}

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
  let L = layout(3);

  function build(r: MatchResult, roadRolls: number) {
    lines = [];
    let at = FIRST_LINE;
    const add = (l: Omit<Line, 'at'>, len = COUNT_FOR) => {
      lines.push({ ...l, at });
      at += len + LINE_GAP;
    };
    add({
      // gold only for a gain: a loss in the danger red, no change in plain grey
      icon: trophy, text: 'Trophies', value: r.trophies, sign: true, color: r.trophies > 0 ? UI.accent : r.trophies < 0 ? UI.danger : UI.textDim,
      done: () => (r.trophies > 0 ? sfx.play('trophyUp', r.trophies) : r.trophies < 0 ? sfx.play('trophyDown') : sfx.play('count')),
    });
    add({ icon: koStar, text: 'Knock-outs', value: r.kills, sign: false, color: UI.text });
    add({ icon: rollToken, text: 'Rolls earned', value: r.rolls, sign: true, color: UI.text, done: () => r.rolls > 0 && sfx.play('rollEarned') });
    if (r.leagueUp >= 0) {
      const li = r.leagueUp;
      add({ icon: (c, x, y, s) => leagueBadge(c, x, y, s, li), text: `Promoted to ${LEAGUES[li].name}`, value: NaN, sign: false, color: UI.accent, done: () => sfx.play('leagueUp', li) }, 0.4);
    }
    if (roadRolls > 0) add({ icon: rollToken, text: 'Trophy road', value: roadRolls, sign: true, color: UI.text, done: () => sfx.play('rollEarned') });
    buttonAt = at - LINE_GAP + BUTTON_AFTER;
    L = layout(lines.length);
  }

  function skip() {
    if (t < buttonAt) t = buttonAt;
  }

  /** One row of the score sheet: glyph, caption, and the number at the right edge. */
  function drawLine(ctx: Ctx, l: Line, y: number) {
    const age = t - l.at;
    if (age < 0) return;
    const k = easeOutCubic(clamp(age / 0.25, 0, 1));
    ctx.save();
    ctx.translate((1 - k) * -16, 0);
    ctx.globalAlpha *= clamp(age / 0.2, 0, 1);
    l.icon(ctx, LINE_X + ICON / 2, y, ICON);
    const plain = Number.isNaN(l.value);
    label(ctx, l.text.toUpperCase(), LINE_X + ICON + S.pad + 2, y + 1, TYPE.body, { align: 'left', track: 1.5, color: plain ? l.color : UI.text });
    if (!plain) {
      const shown = Math.round(l.value * easeOutCubic(clamp(age / COUNT_FOR, 0, 1)));
      const s = l.sign && shown > 0 ? `+${shown}` : `${shown}`;
      label(ctx, s, L.panel.x + L.panel.w - S.pad * 2, y + 1, TYPE.h1, { align: 'right', color: l.color, weight: 700 });
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
        // a win is marked by one quiet burst behind the title, in the accent
        fx.burst(W / 2, L.titleY, { colors: [UI.accent, UI.text], n: 22, speed: 340, size: 4, life: 0.8, gravity: 260 });
        sfx.play('victory');
        music.set('victory');
      } else {
        sfx.play('defeat');
        music.set('defeat');
      }
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
            fx.burst(LINE_X + ICON / 2, L.panel.y + S.pad + LINE_H / 2 + lines.indexOf(l) * LINE_H, { colors: [UI.accent, UI.text], n: 10, speed: 240, size: 4, life: 0.5, gravity: 300 });
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
      veil(ctx, 1); // the stadium stays in the dark behind the score sheet
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      fx.drawUnder(ctx);
      if (res) {
        const k = clamp(t / RIBBON_POP, 0, 1);
        const s = k < 1 ? 1.25 - 0.25 * easeOutCubic(k) : 1;
        ctx.save();
        ctx.translate(W / 2, L.titleY);
        ctx.scale(s, s);
        ctx.globalAlpha = Math.min(1, k * 2);
        // the fight in one line, inside the title's plate (so the stadium's boards never run behind it)
        const secs = Math.max(0, Math.round(res.time));
        const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
        const lost = res.losses === 0 ? 'NONE OF YOURS KNOCKED OUT' : `${res.losses} OF YOURS KNOCKED OUT`;
        ribbon(ctx, 0, 0, RIBBON_W, res.won ? 'VICTORY' : 'DEFEAT', { color: res.won ? 'accent' : 'muted', sub: `${res.won ? 'WON' : 'LOST'} IN ${clock}  ·  ${lost}` });
        ctx.restore();
        const pk = easeOutCubic(clamp((t - 0.5) / 0.3, 0, 1));
        if (pk > 0) {
          ctx.save();
          ctx.globalAlpha = pk;
          const P = L.panel;
          panel(ctx, P, { tone: 'dark' });
          ctx.fillStyle = UI.border;
          for (let i = 1; i < lines.length; i++) if (t >= lines[i].at) ctx.fillRect(LINE_X, P.y + S.pad + i * LINE_H, P.w - S.pad * 4, 1);
          lines.forEach((l, i) => drawLine(ctx, l, P.y + S.pad + LINE_H / 2 + i * LINE_H));
          ctx.restore();
          // where you stand now: league badge and trophies
          const sk = clamp((t - buttonAt + 0.2) / 0.3, 0, 1);
          if (sk > 0) {
            const y = L.standY;
            const li = leagueOf(app.state.trophies);
            ctx.save();
            ctx.globalAlpha = sk;
            leagueBadge(ctx, LINE_X + 18, y, 40, li);
            label(ctx, `${LEAGUES[li].name} League`.toUpperCase(), LINE_X + 50, y - 11, TYPE.body, { align: 'left', weight: 700, track: 1.5 });
            label(ctx, `${app.state.trophies} TROPHIES`, LINE_X + 50, y + 13, TYPE.caption, { align: 'left', color: UI.textDim, track: 1.5 });
            ctx.restore();
          }
        }
        if (t >= buttonAt) {
          const bk = easeOutCubic(clamp((t - buttonAt) / 0.25, 0, 1));
          ctx.save();
          ctx.globalAlpha = bk;
          ctx.translate(0, (1 - bk) * 12);
          button(ctx, L.cont, { variant: 'primary', text: 'CONTINUE', pressed, breathe: t });
          ctx.restore();
        }
      }
      fx.drawOver(ctx);
      ctx.restore();
      fx.drawScreen(ctx);
    },
    pointerDown(x, y) {
      if (t >= buttonAt && inRect(x, y, L.cont)) pressed = true;
      else skip();
    },
    pointerMove(x, y) {
      if (pressed && !inRect(x, y, L.cont)) pressed = false;
    },
    pointerUp(x, y) {
      if (pressed && inRect(x, y, L.cont) && !left) {
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
