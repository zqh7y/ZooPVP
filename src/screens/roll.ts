import type { App, Screen } from '../screen';
import type { Ctx, Rect } from '../util';
import type { PieceType, RollResult } from '../types';
import { W, H, S, TYPE, UI } from '../theme';
import { clamp, easeInOutCubic, easeOutCubic, label, inRect, rr, smooth } from '../util';
import { MAX_LEVEL, PIECE_NAME, PIECE_TYPES, cls, classOf, isPet } from '../data';
import { button, classBadge, classBadgeSize, classColor, fitLabel, panel } from '../draw/ui';
import type { ButtonOpts } from '../draw/ui';
import { rollToken } from '../draw/icons';
import { drawPiece, pieceIcon } from '../draw/pieces';
import { Fx } from '../draw/fx';
import { classOdds, rollOnce } from '../logic/rolls';
import { hashSeed, makeRng, frand, fpick, fchance } from '../rng';
import { sfx, music } from '../audio/engine';
import { benchSlotRect, CELL, drawTopPills } from './lobby';

/*
 * The roll as a one-reel slot machine: the lever is pulled, pieces spin DOWN the reel behind a single window,
 * slow down, overshoot a little and settle on the prize. A rare prize (A-class and better) makes the reel stop
 * on a lesser piece first, hold, then nudge on to the prize; the bulbs turn gold and the prize breaks through
 * class by class. Then it flies to the bench.
 */

// ------------------------------------------------------------------ layout

const CAB: Rect = { x: 50, y: 156, w: 390, h: 470 };
const WIN: Rect = { x: CAB.x + (CAB.w - 290) / 2, y: CAB.y + 62, w: 290, h: 262 };
const WC = { x: WIN.x + WIN.w / 2, y: WIN.y + WIN.h / 2 };
const PLATE: Rect = { x: CAB.x + 36, y: WIN.y + WIN.h + 30, w: CAB.w - 72, h: 76 };
const SIGN: Rect = { x: W / 2 - 112 - 24, y: CAB.y - 34, w: 224, h: 62 };
const LEVER = { x: CAB.x + CAB.w + 30, y: WC.y + 36, len: 118 };
/** one item of the reel is exactly the window's height: at rest the window shows a single piece */
const IH = WIN.h;
const SYM = 186; // the size of a piece's picture on the reel
const ODDS_RECT: Rect = { x: S.pad * 3, y: CAB.y + CAB.h + 52, w: W - S.pad * 6, h: 232 };
const BTN_Y = ODDS_RECT.y + ODDS_RECT.h + 34;
const BTN = {
  again: { x: S.pad + 2, y: BTN_Y, w: (W - S.pad * 3 - 4) / 2, h: S.btnH },
  back: { x: S.pad * 2 + 2 + (W - S.pad * 3 - 4) / 2, y: BTN_Y, w: (W - S.pad * 3 - 4) / 2, h: S.btnH },
};
type BtnId = keyof typeof BTN;
const SHAKE = [0, 1, 2, 4, 7, 11, 18];

// ------------------------------------------------------------------ timing

const PULL = 0.34; // the lever goes down, the reel starts
const SPIN = 2.5; // the main spin, fast and slowing
const SETTLE = 0.42; // the overshoot settles
const OVER = 0.24; // how far (in items) the reel runs past before it settles back
const HOLD = 0.6; // a rare prize: the reel stops on a lesser piece and holds...
const NUDGE = 0.42; // ...then nudges on to the prize
const CRACK = 0.75; // a landed rare prize waits, then cracks
const BREAK = 1.05; // and breaks through this long after it landed
const AWAY = 0.6; // after the last landing, the prize goes to the bench
const BULBS = 30;

interface Card {
  type: PieceType;
  level: number;
}
/** One landing: the first when the reel stops on the prize, then one per break-through. */
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
  let lands: Landing[] = [];
  let F = 0; // index of the prize on the reel
  let rare = false;
  let stopAt = 0; // the main spin ends (on the prize, or on the decoy before it)
  let landed = 0; // landings already played
  let done = false; // the piece is on the bench
  let doneAt = 0;
  let pressed: BtnId | null = null;
  let flash = 1; // age of the window's class flash
  let crackPlayed = -1;
  let lastItem = 0;
  let lastTick = -1;
  let pulledAt = -9;
  const images = new Map<string, HTMLCanvasElement>();

  const isRare = (lv: number) => lv >= 5;

  // -------------------------------------------------------------- the reel's motion

  /** Where the reel is (in items: n means item n sits on the pay line) at time s of this roll. */
  function reel(s: number): number {
    const D = rare ? F - 1 : F;
    if (s < PULL) return -0.12 * Math.sin(clamp(s / PULL, 0, 1) * Math.PI); // a small lift as the lever goes down
    const u = clamp((s - PULL) / SPIN, 0, 1);
    // fast from the first moments (a short ramp), then a long slow-down that runs a little past the stop
    if (s < stopAt) return (D + OVER) * (1 - (1 - u) ** 3) * smooth(clamp(u / 0.08, 0, 1));
    const settle = (k: number) => OVER * Math.exp(-k * 9) * Math.cos(k * 15);
    const a = s - stopAt;
    if (!rare) return D + settle(a);
    // rare: settle on the decoy, hold with a nervous tremble, then nudge on to the prize and settle there
    if (a < HOLD) return D + settle(a) + (a > SETTLE ? Math.sin(a * 60) * 0.012 : 0);
    const b = a - HOLD;
    if (b < NUDGE) return D + (1 + OVER) * easeInOutCubic(b / NUDGE);
    return F + settle(b - NUDGE);
  }
  /** Items per second the reel moves at time s. */
  const speed = (s: number) => (reel(s + 1 / 120) - reel(s - 1 / 120)) * 60;
  const landTime = () => stopAt + (rare ? HOLD + NUDGE : 0);

  // -------------------------------------------------------------- a roll

  function start() {
    fx.clear();
    tt = 0;
    landed = 0;
    done = false;
    flash = 1;
    crackPlayed = -1;
    lastItem = 0;
    lastTick = -1;
    pulledAt = t;
    const rng = makeRng(hashSeed(app.state.seed, app.state.rolled));
    prize = rollOnce(app.state, rng);
    if (!prize) {
      app.go('lobby');
      return;
    }
    app.save();
    rare = isRare(prize.level);
    // a rare prize shows one or two classes lower when it lands, then breaks through class by class
    const first = rare ? prize.level - (prize.level >= 6 && fchance(0.5) ? 2 : 1) : prize.level;
    cards = [];
    const n = 26;
    for (let i = 0; i < n + 3; i++) {
      let type = fpick(PIECE_TYPES);
      for (let k = 0; k < 4 && cards.length && type === cards[cards.length - 1].type; k++) type = fpick(PIECE_TYPES);
      cards.push({ type, level: clamp(Math.round(frand(0.6, 4.8) ** 1.2) || 1, 1, MAX_LEVEL) });
    }
    F = n;
    cards[F] = { type: prize.type, level: first };
    if (rare) {
      // the decoy the reel stops on first: a plain piece
      cards[F - 1] = { type: fpick(PIECE_TYPES.filter((p) => p !== prize!.type)), level: clamp(first - 2, 1, 3) };
    } else if (fchance(0.4)) {
      // a near miss: an S or SSS crawls past just before a common prize
      cards[F - 1] = { type: fpick(PIECE_TYPES), level: fchance(0.8) ? 6 : 7 };
    }
    stopAt = PULL + SPIN;
    lands = [{ at: landTime(), level: first }];
    for (let lv = first + 1; lv <= prize.level; lv++) lands.push({ at: lands[lands.length - 1].at + BREAK, level: lv });
    sfx.play('click');
    sfx.play('rollStart', 0, { delay: 0.12 });
  }

  const levelNow = () => {
    let lv = lands[0]?.level ?? 1;
    for (const l of lands) if (tt >= l.at) lv = l.level;
    return lv;
  };
  const isLanded = () => lands.length > 0 && tt >= lands[0].at;

  function land(l: Landing, i: number) {
    const breaking = i > 0;
    if (breaking) {
      sfx.play('breakthrough', l.level);
      fx.fuseBurst(WC.x, WC.y, l.level);
      fx.flash(UI.accent, 0.22, 0.3);
    } else sfx.play('reveal', l.level);
    fx.ring(WC.x, WC.y, l.level >= 4 ? UI.tier[l.level - 1] : '#ffffff', WIN.w * 0.4, WIN.w * 0.8, 0.45);
    fx.shake(SHAKE[l.level - 1] * (breaking ? 0.6 : 0.4));
    flash = 0;
    if (prize && i === lands.length - 1 && isRare(l.level)) {
      fx.word(WC.x, SIGN.y - 44, l.level === 7 ? 'LEGENDARY' : `${classOf(l.level)}-CLASS`, { color: classColor(l.level, t), size: TYPE.h1 });
      fx.burst(WC.x, WC.y, { colors: [UI.accent, '#ffffff', '#ffe27a'], n: 26, speed: 380, size: 5, life: 0.9, gravity: 420, shape: 'star' });
    }
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
    fx.flyTo(WC.x, WC.y, to.x + CELL / 2, H + 120, (c, x, y, s) => {
      const z = 92 * s;
      drawPiece(c, card, { x: x - z / 2, y: y - z / 2, w: z, h: z }, { t });
    });
    sfx.play('collect', 0, { delay: 0.1 });
  }

  /** A tap skips to the next landing. */
  function skip() {
    if (done || tt < PULL) return;
    const next = lands.find((l) => l.at > tt);
    if (!next) return;
    tt = next.at - 0.001;
    lastItem = Math.round(reel(tt));
  }

  // -------------------------------------------------------------- drawing

  /** A piece's picture for the reel, drawn once into its own small canvas. */
  function symbol(c: Card): HTMLCanvasElement {
    const key = `${c.type}:${c.level}`;
    let img = images.get(key);
    if (img) return img;
    const k = Math.max(1, app.ratio);
    img = document.createElement('canvas');
    img.width = Math.ceil(SYM * k);
    img.height = Math.ceil(SYM * k);
    const g = img.getContext('2d')!;
    g.scale(k, k);
    pieceIcon(g, c.type, c.level, SYM / 2, SYM / 2 + (isPet(c.type) ? 6 : 0), SYM * (isPet(c.type) ? 0.92 : 0.8), 0.4);
    images.set(key, img);
    return img;
  }

  function drawCabinet(ctx: Ctx) {
    const rad = 40;
    const D = 12;
    // the shadow on the ground, then the body: a warm white block with a gold rim, lit from the upper left
    ctx.save();
    ctx.fillStyle = 'rgba(110, 80, 40, 0.16)';
    rr(ctx, CAB.x + 10, CAB.y + 18, CAB.w + 6, CAB.h, rad + 6);
    ctx.fill();
    rr(ctx, CAB.x, CAB.y + D, CAB.w, CAB.h, rad);
    ctx.fillStyle = '#d18f00';
    ctx.fill();
    const rim = ctx.createLinearGradient(CAB.x, CAB.y, CAB.x + CAB.w, CAB.y + CAB.h);
    rim.addColorStop(0, '#ffe37a');
    rim.addColorStop(0.5, '#ffc21a');
    rim.addColorStop(1, '#f0a400');
    rr(ctx, CAB.x, CAB.y, CAB.w, CAB.h, rad);
    ctx.fillStyle = rim;
    ctx.fill();
    // A-class and better: the whole machine glows gold
    if (isLanded() && levelNow() >= 5) {
      ctx.save();
      ctx.shadowColor = `rgba(255, 190, 0, ${(0.65 + 0.3 * Math.sin(t * 6)).toFixed(3)})`;
      ctx.shadowBlur = 34;
      rr(ctx, CAB.x, CAB.y, CAB.w, CAB.h, rad);
      ctx.fillStyle = rim;
      ctx.fill();
      ctx.restore();
    }
    const face = ctx.createLinearGradient(0, CAB.y, 0, CAB.y + CAB.h);
    face.addColorStop(0, '#fffdf8');
    face.addColorStop(1, '#f6ecdb');
    rr(ctx, CAB.x + 12, CAB.y + 12, CAB.w - 24, CAB.h - 24, rad - 12);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(CAB.x + rad, CAB.y + 3, CAB.w - rad * 2, 2);
    ctx.restore();
  }

  /** The bulbs around the cabinet: they chase while the reel spins, blink on a landing, and go gold for A-class and better. */
  function drawBulbs(ctx: Ctx) {
    const inset = 6 + 0.5;
    const x0 = CAB.x + inset;
    const y0 = CAB.y + inset;
    const w = CAB.w - inset * 2;
    const h = CAB.h - inset * 2;
    const per = 2 * (w + h);
    const v = Math.abs(speed(tt));
    const spinning = tt > PULL * 0.5 && !isLanded();
    const gold = isLanded() && levelNow() >= 5;
    const blink = isLanded() && tt - lands[landed - 1 >= 0 ? landed - 1 : 0].at < 1.2;
    const phase = t * (spinning ? 4 + v * 0.6 : gold ? 9 : 1.6);
    for (let i = 0; i < BULBS; i++) {
      let d = ((i + 0.5) / BULBS) * per;
      let x: number;
      let y: number;
      if (d < w) (x = x0 + d), (y = y0);
      else if ((d -= w) < h) (x = x0 + w), (y = y0 + d);
      else if ((d -= h) < w) (x = x0 + w - d), (y = y0 + h);
      else (d -= w), (x = x0), (y = y0 + h - d);
      // keep the bulbs off the rounded corners' tips
      const cxk = clamp(x, CAB.x + 30, CAB.x + CAB.w - 30);
      const cyk = clamp(y, CAB.y + 30, CAB.y + CAB.h - 30);
      if (Math.abs(cxk - x) > 0.1 && Math.abs(cyk - y) > 0.1) continue;
      let on: boolean;
      if (blink) on = Math.floor(t * 8) % 2 === 0;
      else if (spinning || gold) on = (i + Math.floor(phase)) % 3 === 0;
      else on = (i + Math.floor(phase)) % 6 === 0;
      const col = gold ? '#fffbe2' : '#fff4c8';
      ctx.save();
      if (on) {
        ctx.shadowColor = gold ? 'rgba(255, 170, 0, 1)' : 'rgba(255, 255, 255, 0.95)';
        ctx.shadowBlur = gold ? 16 : 8;
      }
      ctx.beginPath();
      ctx.arc(x, y, gold && on ? 6.5 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = on ? col : '#e3a000';
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x - 1.6, y - 1.6, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ffffff' : 'rgba(255, 236, 170, 0.75)';
      ctx.fill();
    }
  }

  function drawSign(ctx: Ctx) {
    const r = SIGN;
    const D = 7;
    ctx.fillStyle = 'rgba(110, 80, 40, 0.2)';
    rr(ctx, r.x + 5, r.y + 9, r.w, r.h, r.h / 2);
    ctx.fill();
    rr(ctx, r.x, r.y + D, r.w, r.h - D, (r.h - D) / 2);
    ctx.fillStyle = '#d8c6a8';
    ctx.fill();
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h - D);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#f7efe2');
    rr(ctx, r.x, r.y, r.w, r.h - D, (r.h - D) / 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    const cy = r.y + (r.h - D) / 2;
    if (!done) {
      rollToken(ctx, r.x + 36, cy, 24, UI.accentDark);
      rollToken(ctx, r.x + r.w - 36, cy, 24, UI.accentDark);
    }
    fitLabel(ctx, done ? 'NEW PIECE!' : 'ROLL', r.x + r.w / 2, cy + 1, TYPE.h2, r.w - 40, { color: UI.text, weight: 700, track: done ? 2 : 4 });
  }

  function drawReel(ctx: Ctx) {
    const bez = 12;
    // the bezel: a slate ring with a gold inner lip
    ctx.fillStyle = 'rgba(110, 80, 40, 0.18)';
    rr(ctx, WIN.x - bez + 3, WIN.y - bez + 5, WIN.w + bez * 2, WIN.h + bez * 2, 30);
    ctx.fill();
    const bg = ctx.createLinearGradient(WIN.x, WIN.y - bez, WIN.x + WIN.w * 0.4, WIN.y + WIN.h + bez);
    bg.addColorStop(0, '#ffe589');
    bg.addColorStop(0.5, '#f2b100');
    bg.addColorStop(1, '#c98500');
    rr(ctx, WIN.x - bez, WIN.y - bez, WIN.w + bez * 2, WIN.h + bez * 2, 30);
    ctx.fillStyle = bg;
    ctx.fill();
    rr(ctx, WIN.x - 3, WIN.y - 3, WIN.w + 6, WIN.h + 6, 22);
    ctx.fillStyle = '#8a5a00';
    ctx.fill();
    ctx.save();
    rr(ctx, WIN.x, WIN.y, WIN.w, WIN.h, 20);
    ctx.clip();
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    // the reel's items: item i sits at the pay line when the reel is at i, and higher items wait above it
    const p = reel(tt);
    const v = speed(tt);
    const blur = clamp(Math.abs(v) / 14, 0, 1);
    const lv = isLanded() ? levelNow() : 0;
    const from = Math.floor(p) - 1;
    for (let i = from; i <= from + 3; i++) {
      if (i < 0 || i >= cards.length) continue;
      const y = WC.y + (p - i) * IH;
      if (y < WIN.y - IH / 2 || y > WIN.y + WIN.h + IH / 2) continue;
      const card = i === F && isLanded() ? { type: cards[F].type, level: lv } : cards[i];
      const img = symbol(card);
      // a divider between two items
      ctx.fillStyle = '#efe4d2';
      ctx.fillRect(WIN.x, Math.round(y - IH / 2) - 1, WIN.w, 2);
      const punch = i === F && isLanded() ? 1 + 0.1 * Math.max(0, 1 - flash / 0.25) : 1;
      const z = SYM * punch;
      if (blur > 0.05) {
        // motion blur: the picture smeared along the reel, a few faint copies trailing it
        const stretch = 1 + blur * 0.45;
        for (let k = 5; k >= 0; k--) {
          ctx.globalAlpha = k === 0 ? 1 - blur * 0.6 : blur * 0.15;
          const dy = -k * blur * 11 * Math.sign(v || 1);
          ctx.drawImage(img, WC.x - z / 2, y - (z * stretch) / 2 + dy, z, z * stretch);
        }
        ctx.globalAlpha = 1;
      } else ctx.drawImage(img, WC.x - z / 2, y - z / 2, z, z);
      if (blur < 0.6) {
        ctx.globalAlpha = 1 - blur / 0.6;
        classBadge(ctx, card.level, WIN.x + 14, y - IH / 2 + 30, 1.1, t);
        ctx.globalAlpha = 1;
      }
    }
    // the window flashes in the class tone when the prize lands (and on each break-through)
    if (isLanded() && flash < 0.6) {
      ctx.globalAlpha = (1 - flash / 0.6) * (lv >= 4 ? 0.5 : 0.85);
      ctx.fillStyle = lv >= 4 ? UI.tier[lv - 1] : '#ffffff';
      ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
      ctx.globalAlpha = 1;
    }
    // the drum's curve: the reel darkens toward the top and bottom edges
    const curve = ctx.createLinearGradient(0, WIN.y, 0, WIN.y + WIN.h);
    curve.addColorStop(0, 'rgba(90, 64, 24, 0.3)');
    curve.addColorStop(0.16, 'rgba(90, 64, 24, 0)');
    curve.addColorStop(0.84, 'rgba(90, 64, 24, 0)');
    curve.addColorStop(1, 'rgba(90, 64, 24, 0.3)');
    ctx.fillStyle = curve;
    ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    // the glass: a soft diagonal band of light from the upper left and a bright line along the top
    const glass = ctx.createLinearGradient(WIN.x, WIN.y, WIN.x + WIN.w * 0.7, WIN.y + WIN.h * 0.7);
    glass.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    glass.addColorStop(0.28, 'rgba(255, 255, 255, 0.12)');
    glass.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glass;
    ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(WIN.x + 22, WIN.y + 6, WIN.w - 44, 2);
    ctx.restore();
    // the pay line markers, pointing in at the middle
    for (const side of [-1, 1]) {
      const x = side < 0 ? WIN.x - bez - 2 : WIN.x + WIN.w + bez + 2;
      ctx.beginPath();
      ctx.moveTo(x + side * 4, WC.y - 14);
      ctx.lineTo(x - side * 14, WC.y);
      ctx.lineTo(x + side * 4, WC.y + 14);
      ctx.closePath();
      ctx.fillStyle = UI.accent;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#b97c00';
      ctx.stroke();
    }
    drawCracks(ctx);
  }

  /** Before a break-through, cracks spread over the glass, glowing in the colour of the class to come. */
  function drawCracks(ctx: Ctx) {
    const next = lands.find((l) => l.at > tt);
    if (!isLanded() || !next) return;
    const charge = clamp((tt - (next.at - BREAK + CRACK)) / (BREAK - CRACK), 0, 1);
    if (charge <= 0) return;
    ctx.save();
    rr(ctx, WIN.x, WIN.y, WIN.w, WIN.h, 20);
    ctx.clip();
    ctx.translate(WC.x + Math.sin(t * 70) * 3 * charge, WC.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [lw, col] of [[5, 'rgba(255, 255, 255, 0.9)'], [2.2, UI.tier[next.level - 1]]] as const) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      for (let i = 0; i < 6; i++) {
        const a0 = i * 1.05 + 0.3;
        const len = WIN.w * 0.6 * Math.min(1, charge * 1.6 - i * 0.12);
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
    }
    ctx.restore();
  }

  /** The lever on the cabinet's right side: pulled down as a roll starts, springing back up. */
  function drawLever(ctx: Ctx) {
    const a = t - pulledAt;
    const down = a < 0 ? 0 : a < 0.16 ? easeOutCubic(a / 0.16) : a < 0.7 ? 1 - easeOutCubic((a - 0.16) / 0.54) * 1.08 + Math.max(0, (a - 0.5) / 0.2) * 0.08 : 0;
    const th = clamp(down, -0.1, 1) * 2.25;
    const px = LEVER.x;
    const py = LEVER.y;
    // the bracket on the cabinet
    rr(ctx, CAB.x + CAB.w - 4, py - 22, px - (CAB.x + CAB.w) + 16, 44, 12);
    ctx.fillStyle = '#d18f00';
    ctx.fill();
    rr(ctx, CAB.x + CAB.w - 4, py - 22, px - (CAB.x + CAB.w) + 16, 38, 12);
    ctx.fillStyle = '#ffc21a';
    ctx.fill();
    const kx = px + Math.sin(th) * 6;
    const ky = py - Math.cos(th) * LEVER.len;
    const near = 1 + 0.28 * Math.sin(th);
    // the stick
    ctx.lineCap = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#8f98a4';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d6dbe1';
    ctx.beginPath();
    ctx.moveTo(px - 2, py);
    ctx.lineTo(kx - 2, ky);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#5b6470';
    ctx.fill();
    // the knob, lit from the upper left
    const r = 21 * near;
    ctx.fillStyle = 'rgba(110, 80, 40, 0.2)';
    ctx.beginPath();
    ctx.arc(kx + 3, ky + 5, r, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(kx - r * 0.4, ky - r * 0.45, r * 0.1, kx, ky, r);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.45, '#ffc21a');
    g.addColorStop(1, '#d99000');
    ctx.beginPath();
    ctx.arc(kx, ky, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(kx - r * 0.35, ky - r * 0.4, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  }

  /** Under the window: the landed piece's name and class (or a quiet line while it spins). */
  function drawPlate(ctx: Ctx) {
    const r = PLATE;
    rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fillStyle = '#f1e6d3';
    ctx.fill();
    rr(ctx, r.x + 2, r.y + 2, r.w - 4, 8, 4);
    ctx.fillStyle = 'rgba(110, 80, 40, 0.1)';
    ctx.fill();
    const cy = r.y + r.h / 2;
    if (!isLanded()) {
      const dots = '.'.repeat(1 + (Math.floor(t * 3) % 3));
      label(ctx, tt < PULL ? 'PULLING' : `SPINNING${dots}`, r.x + r.w / 2, cy + 1, TYPE.body, { color: UI.textDim, weight: 700, track: 3 });
      return;
    }
    const lv = levelNow();
    const k = easeOutCubic(clamp(flash / 0.25, 0, 1));
    ctx.save();
    ctx.globalAlpha = k;
    const name = PIECE_NAME[cards[F].type].toUpperCase();
    const bs = classBadgeSize(lv, 1.25);
    classBadge(ctx, lv, r.x + 18, cy, 1.25, t);
    fitLabel(ctx, name, r.x + 18 + bs.w + 14, cy - 9, TYPE.h3, r.w - bs.w - 50, { align: 'left', weight: 700, color: UI.text, track: 2 });
    label(ctx, cls(lv).toUpperCase(), r.x + 18 + bs.w + 14, cy + 15, TYPE.caption, { align: 'left', weight: 700, color: classColor(lv, t), track: 2 });
    ctx.restore();
  }

  function drawOdds(ctx: Ctx) {
    panel(ctx, ODDS_RECT, { title: 'ODDS' });
    const odds = classOdds(app.state);
    const show = odds.map((p, i) => ({ p, lv: i + 1 })).filter((o) => o.p > 0);
    const top = ODDS_RECT.y + 24;
    const rowH = Math.min(30, (ODDS_RECT.h - 38) / Math.max(1, show.length));
    const lv = isLanded() ? levelNow() : 0;
    show.forEach((o, i) => {
      const y = top + rowH * (i + 0.5);
      const hit = o.lv === lv;
      if (hit) {
        rr(ctx, ODDS_RECT.x + 10, y - rowH / 2 + 1, ODDS_RECT.w - 20, rowH - 2, (rowH - 2) / 2);
        ctx.fillStyle = 'rgba(255, 194, 26, 0.28)';
        ctx.fill();
      }
      classBadge(ctx, o.lv, ODDS_RECT.x + 22, y, 0.82, t);
      label(ctx, cls(o.lv).toUpperCase(), ODDS_RECT.x + 72, y + 1, TYPE.caption, { align: 'left', track: 1.5, weight: 700, color: hit ? UI.text : UI.textDim });
      const n = Math.max(1, Math.round(100 / o.p));
      label(ctx, n <= 1 ? 'EVERY ROLL' : `1 IN ${n}`, ODDS_RECT.x + ODDS_RECT.w - 22, y + 1, TYPE.caption, { align: 'right', track: 1.5, weight: 700, color: hit ? UI.text : UI.textDim });
    });
  }

  const canAgain = () => app.state.rolls > 0 && app.inv.freeBenchSlot() >= 0;
  const buttonsOn = () => done && tt - doneAt > 0.3;
  const btnAt = (x: number, y: number) => (Object.keys(BTN) as BtnId[]).find((k) => buttonsOn() && inRect(x, y, BTN[k]) && (k !== 'again' || canAgain())) ?? null;

  function drawButtons(ctx: Ctx) {
    if (!buttonsOn()) {
      if (!done && tt > PULL + 0.4) {
        rr(ctx, W / 2 - 76, BTN_Y + S.btnH / 2 - 19, 152, 38, 19);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fill();
        label(ctx, 'TAP TO SKIP', W / 2, BTN_Y + S.btnH / 2 + 1, TYPE.caption, { color: UI.textDim, weight: 700, track: 2.5 });
      }
      return;
    }
    const k = easeOutCubic(clamp((tt - doneAt - 0.3) / 0.25, 0, 1));
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(0, (1 - k) * 12);
    const b = (id: BtnId, o: ButtonOpts) => button(ctx, BTN[id], { ...o, pressed: pressed === id });
    // one main action: spinning again while there are rolls, going back when there are none
    if (canAgain()) b('again', { variant: 'primary', text: 'SPIN AGAIN', badge: app.state.rolls, breathe: t });
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
      flash += d;
      if (!prize) return;
      // a tick each time a piece passes the pay line, a heavier tock for the last few
      const item = Math.round(reel(tt));
      if (item !== lastItem && !isLanded()) {
        lastItem = item;
        if (tt - lastTick > 0.05) {
          lastTick = tt;
          sfx.play(F - item <= 3 ? 'tock' : 'tick', 0, { x: WC.x });
        }
      }
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
      if (!done && lands.length && tt >= lands[lands.length - 1].at + AWAY) collect();
    },
    render(ctx) {
      app.arena.drawDusk(ctx, app.t);
      // a warm wash, lighter in the middle, so the machine stands out on the sunny pitch
      const wash = ctx.createLinearGradient(0, 0, 0, H);
      wash.addColorStop(0, 'rgba(250, 243, 230, 0.55)');
      wash.addColorStop(0.5, 'rgba(250, 243, 230, 0.35)');
      wash.addColorStop(1, 'rgba(250, 243, 230, 0.7)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      drawTopPills(ctx, app.state);
      fx.drawUnder(ctx);
      drawCabinet(ctx);
      drawBulbs(ctx);
      drawReel(ctx);
      drawPlate(ctx);
      drawLever(ctx);
      drawSign(ctx);
      drawOdds(ctx);
      drawButtons(ctx);
      fx.drawOver(ctx);
      ctx.restore();
      fx.drawScreen(ctx);
    },
    pointerDown(x, y) {
      pressed = btnAt(x, y);
      if (pressed) return;
      // the lever spins again once the piece is away
      if (buttonsOn() && canAgain() && Math.hypot(x - LEVER.x, y - (LEVER.y - LEVER.len / 2)) < 70) {
        start();
        return;
      }
      skip();
    },
    pointerMove(x, y) {
      if (pressed && !inRect(x, y, BTN[pressed])) pressed = null;
    },
    pointerUp(x, y) {
      const id = pressed;
      pressed = null;
      if (!id || !inRect(x, y, BTN[id])) return;
      if (id === 'again') start();
      else {
        sfx.play('click');
        app.go('lobby');
      }
    },
    pointerCancel() {
      pressed = null;
    },
  };
}
