import type { App, Screen } from '../screen';
import type { Ctx, Rect } from '../util';
import type { PieceType, RollResult } from '../types';
import { W, H, S, TYPE, COLOR, UI } from '../theme';
import { clamp, easeOutCubic, label, inRect, rr } from '../util';
import { MAX_LEVEL, PIECE_NAME, PIECE_TYPES, cls, classOf } from '../data';
import { button, classBadge, classColor, panel, veil } from '../draw/ui';
import type { ButtonOpts } from '../draw/ui';
import { rollToken } from '../draw/icons';
import { drawPiece } from '../draw/pieces';
import { Fx } from '../draw/fx';
import { classOdds, rollOnce } from '../logic/rolls';
import { hashSeed, makeRng, frand, fpick, fchance } from '../rng';
import { sfx, music } from '../audio/engine';
import { benchSlotRect, CELL, drawTopPills } from './lobby';

// ------------------------------------------------------------------ layout and timing

const MED = { x: W / 2, y: 400, r: 128 };
const TITLE_Y = 150;
const TOKEN_FALL = 0.55; // the daruma drops in
const OPEN = 0.8; // it bursts open
const FLICK_TIME = 2.1; // how long the medallion flicks
const FLICK_GAP = 0.045;
const FLICK_SLOW = 1.12;
const CRACK = 0.75; // a landed rare prize waits, then cracks
const BREAK = 1.05; // and breaks through this long after it landed
const SETTLE = 0.55; // after the last landing, the prize goes to the bench
const ODDS_RECT: Rect = { x: S.pad * 3, y: 712, w: W - S.pad * 6, h: 244 };
const BTN_Y = 990;
const BTN = {
  again: { x: S.pad, y: BTN_Y, w: (W - S.pad * 3) / 2, h: S.btnH },
  back: { x: S.pad * 2 + (W - S.pad * 3) / 2, y: BTN_Y, w: (W - S.pad * 3) / 2, h: S.btnH },
};
type BtnId = keyof typeof BTN;
const SHAKE = [0, 1, 2, 4, 7, 11, 18];

interface Card {
  type: PieceType;
  level: number;
}
/** One landing of the medallion: the first at the end of the flicks, then one per break-through. */
interface Landing {
  at: number;
  level: number;
}

export function createRoll(app: App): Screen {
  const fx = new Fx();
  let t = 0;
  let tt = 0; // time in this roll
  let prize: RollResult | null = null;
  let cards: Card[] = [];
  let times: number[] = [];
  let lands: Landing[] = [];
  let shown = -1; // flick index already played
  let landed = 0; // landings already played
  let done = false; // the piece is on the bench
  let doneAt = 0;
  let pressed: BtnId | null = null;
  let flipAge = 1;
  let crackPlayed = -1;

  const rare = (lv: number) => lv >= 5;

  function start() {
    fx.clear();
    tt = 0;
    shown = -1;
    landed = 0;
    done = false;
    flipAge = 1;
    crackPlayed = -1;
    const rng = makeRng(hashSeed(app.state.seed, app.state.rolled));
    prize = rollOnce(app.state, rng);
    if (!prize) {
      app.go('lobby');
      return;
    }
    app.save();
    // a rare prize lands one or two classes lower, then breaks through class by class
    const first = rare(prize.level) ? prize.level - (prize.level >= 6 && fchance(0.5) ? 2 : 1) : prize.level;
    cards = [];
    times = [];
    let at = OPEN;
    let gap = FLICK_GAP;
    while (at < OPEN + FLICK_TIME) {
      let type = fpick(PIECE_TYPES);
      for (let k = 0; k < 4 && cards.length && type === cards[cards.length - 1].type; k++) type = fpick(PIECE_TYPES);
      const lv = clamp(Math.round(frand(0.6, 4.8) ** 1.2) || 1, 1, MAX_LEVEL);
      cards.push({ type, level: lv });
      times.push(at);
      at += gap;
      gap *= FLICK_SLOW;
    }
    // a near miss: just before a common prize, an S or SSS flicks past
    if (!rare(prize.level) && fchance(0.4)) cards[cards.length - 1] = { type: fpick(PIECE_TYPES), level: fchance(0.8) ? 6 : 7 };
    cards.push({ type: prize.type, level: first });
    times.push(at);
    lands = [{ at, level: first }];
    for (let lv = first + 1; lv <= prize.level; lv++) lands.push({ at: lands[lands.length - 1].at + BREAK, level: lv });
    sfx.play('rollStart');
  }

  const lastLand = () => lands[lands.length - 1];
  const levelNow = () => {
    let lv = lands[0]?.level ?? 1;
    for (const l of lands) if (tt >= l.at) lv = l.level;
    return lv;
  };

  function land(l: Landing, i: number) {
    const breaking = i > 0;
    if (breaking) {
      sfx.play('breakthrough', l.level);
      fx.fuseBurst(MED.x, MED.y, l.level);
      fx.flash(COLOR.white, 0.25, 0.3);
    } else sfx.play('reveal', l.level);
    fx.ring(MED.x, MED.y, UI.tier[l.level - 1], MED.r * 0.8, MED.r * 1.5, 0.45);
    fx.shake(SHAKE[l.level - 1] * (breaking ? 0.6 : 0.45));
    flipAge = 0;
    // the final landing of a rare prize shouts
    if (prize && i === lands.length - 1 && rare(l.level)) fx.word(MED.x, MED.y - MED.r - 30, l.level === 7 ? 'LEGENDARY' : `${classOf(l.level)}-CLASS`, { color: classColor(l.level, t), size: TYPE.h2 });
  }

  function collect() {
    if (!prize || done) return;
    done = true;
    doneAt = tt;
    const p = app.inv.add(prize.type, prize.level);
    app.save();
    if (!p) return;
    // the bench is not on this screen: the piece drops away below it, toward the bench in the lobby
    const to = benchSlotRect(p.slot);
    const card = { type: prize.type, level: prize.level };
    fx.flyTo(MED.x, MED.y, to.x + CELL / 2, H + 120, (c, x, y, s) => {
      const z = 70 * s;
      drawPiece(c, card, { x: x - z / 2, y: y - z / 2, w: z, h: z }, { t, bare: true });
    });
    sfx.play('collect', 0, { delay: 0.1 });
  }

  /** A tap skips to the next landing (or straight to the prize). */
  function skip() {
    if (done) return;
    const next = lands.find((l) => l.at > tt);
    if (!next) return;
    if (tt < lands[0].at) {
      tt = lands[0].at - 0.001;
      shown = cards.length - 2;
    } else tt = next.at - 0.001;
  }

  // -------------------------------------------------------------- drawing

  /** The die drops in and swells a little before it opens. */
  function drawToken(ctx: Ctx) {
    if (tt >= OPEN) return;
    const k = easeOutCubic(clamp(tt / TOKEN_FALL, 0, 1));
    const swell = tt > TOKEN_FALL ? 1 + 0.12 * ((tt - TOKEN_FALL) / (OPEN - TOKEN_FALL)) : 1;
    ctx.save();
    ctx.globalAlpha = k;
    rollToken(ctx, MED.x, MED.y - (1 - k) * 60, 150 * swell, UI.text);
    ctx.restore();
  }

  /** The prize: one big tile, its class as the thin border. It flicks through pieces, lands, and may break through. */
  function drawMedallion(ctx: Ctx) {
    if (tt < OPEN) return;
    let idx = 0;
    for (let i = 0; i < times.length; i++) if (tt >= times[i]) idx = i;
    const isLanded = tt >= lands[0].at;
    const card = isLanded ? { type: cards[cards.length - 1].type, level: levelNow() } : cards[idx];
    const lv = card.level;
    const open = easeOutCubic(clamp((tt - OPEN) / 0.25, 0, 1));
    // flick squash and the landing punch
    const flip = 1 - 0.1 * Math.max(0, 1 - flipAge / 0.06);
    const punch = isLanded ? 1 + 0.08 * Math.max(0, 1 - flipAge / 0.25) : 1;
    // trembling before a break-through
    const next = lands.find((l) => l.at > tt);
    const charge = isLanded && next ? clamp((tt - (next.at - BREAK + CRACK)) / (BREAK - CRACK), 0, 1) : 0;
    const shakeX = charge > 0 ? Math.sin(t * 70) * 3 * charge : 0;
    const R = MED.r * (0.9 + 0.1 * open) * punch;
    // a landed top class glows behind its tile: A faintly, S in gold, SSS in white-gold
    if (isLanded && lv >= 5) {
      const a = (lv === 5 ? 0.14 : lv === 6 ? 0.3 : 0.36) * clamp(flipAge / 0.3, 0, 1) * (0.85 + 0.15 * Math.sin(t * 2));
      const g = ctx.createRadialGradient(MED.x, MED.y, MED.r * 0.6, MED.x, MED.y, MED.r * 2.1);
      const c = lv === 7 ? '255, 243, 196' : '255, 210, 31';
      g.addColorStop(0, `rgba(${c}, ${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${c}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(MED.x - MED.r * 2.2, MED.y - MED.r * 2.2, MED.r * 4.4, MED.r * 4.4);
    }
    ctx.save();
    ctx.globalAlpha = open;
    ctx.translate(MED.x + shakeX, MED.y);
    // a hairline frame around the tile
    rr(ctx, -MED.r - 14, -MED.r - 14, MED.r * 2 + 28, MED.r * 2 + 28, S.radius.l + 4);
    ctx.lineWidth = S.line.thin;
    ctx.strokeStyle = UI.border;
    ctx.stroke();
    ctx.scale(1, flip);
    const z = R * 2;
    drawPiece(ctx, card, { x: -z / 2, y: -z / 2, w: z, h: z }, { t, bare: true });
    ctx.restore();
    // cracks spreading, glowing in the colour of the class to come
    if (charge > 0 && next) {
      ctx.save();
      ctx.translate(MED.x + shakeX, MED.y);
      ctx.strokeStyle = classColor(next.level, t);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 6; i++) {
        const a0 = i * 1.05 + 0.3;
        const len = R * Math.min(1, charge * 1.6 - i * 0.12);
        if (len <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        let x = 0;
        let y = 0;
        for (let s = 1; s <= 4; s++) {
          const a = a0 + (s % 2 ? 0.25 : -0.2);
          x += Math.cos(a) * (len / 4);
          y += Math.sin(a) * (len / 4);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // the name and class of the landed piece
    if (isLanded) {
      const k = easeOutCubic(clamp(flipAge / 0.25, 0, 1));
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(MED.x, MED.y + MED.r + 62 + (1 - k) * 8);
      label(ctx, PIECE_NAME[card.type].toUpperCase(), 0, 0, TYPE.h1, { weight: 700, track: 3 });
      label(ctx, cls(lv).toUpperCase(), 0, 38, TYPE.body, { color: classColor(lv, t), weight: 700, track: 3 });
      ctx.restore();
    }
  }

  function drawOdds(ctx: Ctx) {
    panel(ctx, ODDS_RECT, { title: 'ODDS' });
    const odds = classOdds(app.state);
    const show = odds.map((p, i) => ({ p, lv: i + 1 })).filter((o) => o.p > 0);
    const top = ODDS_RECT.y + 28;
    const rowH = Math.min(28, (ODDS_RECT.h - 44) / Math.max(1, show.length));
    const lv = tt >= (lands[0]?.at ?? Infinity) ? levelNow() : 0;
    show.forEach((o, i) => {
      const y = top + rowH * (i + 0.5);
      const hit = o.lv === lv;
      if (hit) {
        // the class that came up: a lit row with an accent bar
        ctx.fillStyle = UI.surfaceAlt;
        ctx.fillRect(ODDS_RECT.x + 1, y - rowH / 2, ODDS_RECT.w - 2, rowH);
        ctx.fillStyle = UI.accent;
        ctx.fillRect(ODDS_RECT.x + 1, y - rowH / 2, 3, rowH);
      }
      classBadge(ctx, o.lv, ODDS_RECT.x + 22, y, 1, t);
      label(ctx, cls(o.lv).toUpperCase(), ODDS_RECT.x + 64, y + 1, TYPE.caption, { align: 'left', track: 1.5, color: hit ? UI.text : UI.textDim });
      const n = Math.max(1, Math.round(100 / o.p));
      label(ctx, n <= 1 ? 'EVERY ROLL' : `1 IN ${n}`, ODDS_RECT.x + ODDS_RECT.w - 22, y + 1, TYPE.caption, { align: 'right', track: 1.5, color: hit ? UI.text : UI.textDim });
    });
  }

  const canAgain = () => app.state.rolls > 0 && app.inv.freeBenchSlot() >= 0;
  const btnAt = (x: number, y: number) => (Object.keys(BTN) as BtnId[]).find((k) => buttonsOn() && inRect(x, y, BTN[k]) && (k !== 'again' || canAgain())) ?? null;
  const buttonsOn = () => done && tt - doneAt > 0.3;

  function drawButtons(ctx: Ctx) {
    if (!buttonsOn()) {
      if (!done && tt > OPEN + 0.5) label(ctx, 'TAP TO SKIP', W / 2, BTN_Y + S.btnH / 2, TYPE.caption, { color: UI.textDim, track: 2.5 });
      return;
    }
    const k = easeOutCubic(clamp((tt - doneAt - 0.3) / 0.25, 0, 1));
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(0, (1 - k) * 12);
    const b = (id: BtnId, o: ButtonOpts) => button(ctx, BTN[id], { ...o, pressed: pressed === id });
    // one main action: rolling again while there are rolls, going back when there are none
    if (canAgain()) b('again', { variant: 'primary', text: 'ROLL AGAIN', badge: app.state.rolls });
    b('back', { variant: canAgain() ? 'secondary' : 'primary', text: 'BACK' });
    ctx.restore();
  }

  return {
    enter() {
      music.muffle(true);
      pressed = null;
      start();
    },
    leave() {
      music.muffle(false);
      fx.clear();
    },
    update(dt) {
      t += dt;
      fx.update(dt);
      const d = dt * fx.timeScale;
      tt += d;
      flipAge += d;
      if (!prize) return;
      if (tt >= OPEN && tt - d < OPEN) {
        fx.burst(MED.x, MED.y, { colors: [UI.text, UI.textDim, UI.borderStrong], n: 12, speed: 320, shape: 'shard', gravity: 600 });
        fx.ring(MED.x, MED.y, UI.text, 40, 180, 0.35);
        fx.shake(2);
      }
      // flicks
      let idx = -1;
      for (let i = 0; i < times.length - 1; i++) if (tt >= times[i]) idx = i;
      if (idx > shown && tt < lands[0].at) {
        shown = idx;
        flipAge = 0;
        sfx.play(times.length - 1 - idx <= 5 ? 'tock' : 'tick', 0, { x: MED.x });
      }
      // landings and cracks
      while (landed < lands.length && tt >= lands[landed].at) {
        land(lands[landed], landed);
        landed++;
      }
      const next = lands[landed];
      if (next && landed > 0 && crackPlayed < landed && tt >= next.at - BREAK + CRACK) {
        crackPlayed = landed;
        sfx.play('crack', next.level);
        fx.shake(1.5);
      }
      if (!done && tt >= lastLand().at + SETTLE) collect();
    },
    render(ctx) {
      // the stadium after dark, veiled, as on match and result: the prize is the only lit thing
      app.arena.drawDusk(ctx, app.t);
      veil(ctx, 1);
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      // the same top bar as the lobby, in the same places, so the counters do not jump between the two
      drawTopPills(ctx, app.state);
      label(ctx, done ? 'NEW PIECE' : 'ROLLING', W / 2, TITLE_Y, TYPE.body, { color: done ? UI.text : UI.textDim, weight: 700, track: 5 });
      fx.drawUnder(ctx);
      drawToken(ctx);
      drawMedallion(ctx);
      drawOdds(ctx);
      drawButtons(ctx);
      fx.drawOver(ctx);
      ctx.restore();
      fx.drawScreen(ctx);
    },
    pointerDown(x, y) {
      pressed = btnAt(x, y);
      if (!pressed) skip();
    },
    pointerMove(x, y) {
      if (pressed && !inRect(x, y, BTN[pressed])) pressed = null;
    },
    pointerUp(x, y) {
      const id = pressed;
      pressed = null;
      if (!id || !inRect(x, y, BTN[id])) return;
      sfx.play('click');
      if (id === 'again') start();
      else app.go('lobby');
    },
    pointerCancel() {
      pressed = null;
    },
  };
}
