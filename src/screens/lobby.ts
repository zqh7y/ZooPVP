import type { App, Screen } from '../screen';
import type { Ctx, Rect } from '../util';
import type { LinkEdge, Piece, PetType, SquadSpec } from '../types';
import type { Target } from '../logic/inventory';
import { W, H, S, TYPE, COLOR, TOPBAR, STAGE, UI } from '../theme';
import { clamp, easeOutCubic, easeOutElastic, inRect, label, rr } from '../util';
import { BENCH_SLOTS, GRID, PIECE_DESC, PIECE_NAME, TROPHY_ROAD, TUTORIAL_DONE, cls, gearPct, isGear, isPet, leagueOf, squadPower } from '../data';
import { button, cell, classColor, fitLabel, gridFrame, hint, panel, pill, progressBar, toast } from '../draw/ui';
import type { ButtonOpts, IconFn } from '../draw/ui';
import { leagueBadge, rollToken, speaker, trash, trophy, wand } from '../draw/icons';
import { drawPiece } from '../draw/pieces';
import { petArt } from '../draw/pets';
import { restPose } from '../draw/petTypes';
import type { PetLook } from '../draw/petTypes';
import { STAGE_GROUND_Y } from '../draw/arena';
import { Fx } from '../draw/fx';
import { autoArrange } from '../logic/auto';
import { sfx, music } from '../audio/engine';
import { frand } from '../rng';

// ------------------------------------------------------------------ layout (shared with the roll screen)

export const CELL = 58;
export const GRID_RECT: Rect = { x: (W - CELL * GRID.cols) / 2, y: 374, w: CELL * GRID.cols, h: CELL * GRID.rows };
export const BENCH_RECT: Rect = { x: GRID_RECT.x, y: GRID_RECT.y + GRID_RECT.h + 28, w: CELL * 8, h: CELL * 2 };
/** Where a bench slot sits on screen. */
export const benchSlotRect = (slot: number): Rect => ({ x: BENCH_RECT.x + (slot % 8) * CELL, y: BENCH_RECT.y + Math.floor(slot / 8) * CELL, w: CELL, h: CELL });
const cellRect = (col: number, row: number): Rect => ({ x: GRID_RECT.x + col * CELL, y: GRID_RECT.y + row * CELL, w: CELL, h: CELL });

const BTN_Y = BENCH_RECT.y + BENCH_RECT.h + 24;
const SMALL_Y = BTN_Y + S.btnH + S.pad;
const BTN = {
  roll: { x: S.pad, y: BTN_Y, w: 200, h: S.btnH },
  battle: { x: S.pad + 200 + S.pad, y: BTN_Y, w: W - S.pad * 3 - 200, h: S.btnH },
  auto: { x: S.pad, y: SMALL_Y, w: 150, h: S.btnSmallH },
  trash: { x: (W - 150) / 2, y: SMALL_Y, w: 150, h: S.btnSmallH },
  mute: { x: W - S.pad - 150, y: SMALL_Y, w: 150, h: S.btnSmallH },
} satisfies Record<string, Rect>;
type BtnId = keyof typeof BTN;

const PILL = {
  name: { x: S.pad, y: TOPBAR.y, w: 236, h: TOPBAR.h },
  trophies: { x: S.pad + 236 + S.gap, y: TOPBAR.y, w: 134, h: TOPBAR.h },
  rolls: { x: S.pad + 236 + S.gap + 134 + S.gap, y: TOPBAR.y, w: W - S.pad * 2 - 236 - 134 - S.gap * 2, h: TOPBAR.h },
};
const ROAD_BAR: Rect = { x: S.pad, y: TOPBAR.y + TOPBAR.h + S.gap + 6, w: W - S.pad * 2 - 84, h: 4 };
const POWER_PILL: Rect = { x: W - S.pad - 150, y: STAGE.y + STAGE.h - 44, w: 150, h: 36 };
const CARD: Rect = { x: S.pad, y: STAGE.y + 10, w: W - S.pad * 2, h: 104 };
const HINT_W = W - 80;
const HINT_H = 56;
/** The guide's callout sits close to what it points at: just above the bench, just above the buttons, or at the top. */
const hintRect = (at: Rect, to?: Rect): Rect => {
  const x = (W - HINT_W) / 2;
  const avoid = (r: Rect) => !to || to.y > r.y + r.h + 8 || to.y + to.h < r.y - 8;
  const overBench = { x, y: GRID_RECT.y + GRID_RECT.h - HINT_H - 24, w: HINT_W, h: HINT_H };
  const overButtons = { x, y: BENCH_RECT.y + CELL + 4, w: HINT_W, h: HINT_H };
  if (at.y >= BTN_Y && avoid(overButtons)) return overButtons;
  if (at.y >= BENCH_RECT.y && avoid(overBench)) return overBench;
  return { x, y: STAGE.y + 12, w: HINT_W, h: HINT_H };
};
const ARMY_CAP = 16;
const DRAG_LIFT = 1.25; // the lifted piece is drawn this much larger
const DRAG_UP = 26; // and this far above the finger
const SLIDE_BACK = 0.2;

const btnIcon = (f: (ctx: Ctx, x: number, y: number, s: number) => void): IconFn => f;

interface Drag {
  piece: Piece;
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
}
interface Slide {
  piece: Piece;
  x: number;
  y: number;
  age: number;
}
interface Toast {
  text: string;
  x: number;
  y: number;
  age: number;
}

const linkKey = (e: LinkEdge) => `${e.c1},${e.r1},${e.c2},${e.r2},${e.active ? 1 : 0}`;
const homeRect = (p: Piece): Rect => (p.slot >= 0 ? benchSlotRect(p.slot) : cellRect(p.col, p.row));

export function createLobby(app: App): Screen {
  const fx = new Fx();
  const inv = app.inv;
  let t = 0;
  let drag: Drag | null = null;
  let slide: Slide | null = null;
  let pressed: BtnId | null = null;
  const pops = new Map<number, number>(); // piece id -> age of its fuse pop
  const hops = new Map<number, number>(); // piece id -> age of its tap hop
  const toasts: Toast[] = [];
  let links = inv.links();
  let shownStep = -1;
  let stepAge = 0;

  const say = (text: string, x = W / 2, y = BTN_Y - 20) => {
    toasts.push({ text, x, y, age: 0 });
  };

  // -------------------------------------------------------------- the guide

  const pets = () => inv.pieces.filter((p) => isPet(p.type));
  const gridPets = () => pets().filter((p) => p.slot < 0);
  const tut = () => app.state.tutorial;

  function stepDone(step: number): boolean {
    const sq = inv.squads();
    switch (step) {
      case 0:
        return gridPets().some((p) => p.type === 'ant');
      case 1:
        return sq.some((s) => s.weapon === 'knife');
      case 2:
        return sq.some((s) => s.helmet > 0);
      case 3:
        return app.state.matches > 0;
      case 4:
        return false; // advanced by pressing ROLL
      case 5:
        return pets().some((p) => p.type === 'ant' && p.count >= 2);
      default:
        return false;
    }
  }

  function advanceGuide() {
    let changed = false;
    while (tut() < TUTORIAL_DONE && stepDone(tut())) {
      app.state.tutorial = tut() >= 5 ? TUTORIAL_DONE : tut() + 1;
      changed = true;
    }
    if (changed) app.save();
    if (tut() !== shownStep) {
      shownStep = tut();
      stepAge = 0;
      if (tut() < TUTORIAL_DONE && t > 0) sfx.play('hint');
    }
  }

  /** What the guide points at now: the piece (or button) to touch and where it should go. */
  function guideTarget(): { text: string; at: Rect; to?: Rect } | null {
    const step = tut();
    const find = (type: string, bench?: boolean) => inv.pieces.find((p) => p.type === type && (bench === undefined || (p.slot >= 0) === bench));
    const ant = gridPets().find((p) => p.type === 'ant');
    const beside = () => {
      if (!ant) return undefined;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = ant.col + dc;
        const r = ant.row + dr;
        if (c >= 0 && r >= 0 && c < GRID.cols && r < GRID.rows && !inv.at(c, r)) return cellRect(c, r);
      }
      return undefined;
    };
    if (step === 0) {
      const p = find('ant', true);
      return p ? { text: 'Drag your ant onto the grid', at: homeRect(p), to: cellRect(3, 3) } : null;
    }
    if (step === 1) {
      const p = find('knife');
      return p ? { text: 'Put the knife right next to the ant', at: homeRect(p), to: beside() } : null;
    }
    if (step === 2) {
      const p = find('helmet');
      return p ? { text: 'Now the helmet next to the ant too', at: homeRect(p), to: beside() } : null;
    }
    if (step === 3) return { text: 'Ready! Press BATTLE', at: BTN.battle };
    if (step === 4) return { text: 'You won rolls! Press ROLL', at: BTN.roll };
    if (step === 5) {
      const p = inv.pieces.find((q) => q.type === 'ant' && q.slot >= 0);
      return p ? { text: 'Drop the new ant onto your ant to double it', at: homeRect(p), to: ant ? homeRect(ant) : undefined } : null;
    }
    return null;
  }

  // -------------------------------------------------------------- changes

  function linkMid(e: LinkEdge) {
    const a = cellRect(e.c1, e.r1);
    const b = cellRect(e.c2, e.r2);
    return { x: (a.x + b.x) / 2 + CELL / 2, y: (a.y + b.y) / 2 + CELL / 2 };
  }

  /** After any change: links that lit up spark, links that broke go quiet, the guide moves on, the game saves. */
  function changed() {
    const before = new Set(links.filter((e) => e.active).map(linkKey));
    const now = inv.links();
    const after = new Set(now.filter((e) => e.active).map(linkKey));
    let gained = 0;
    for (const e of now) {
      if (e.active && !before.has(linkKey(e))) {
        const m = linkMid(e);
        fx.linkSpark(m.x, m.y);
        gained++;
      }
    }
    const lost = links.filter((e) => e.active && !after.has(linkKey(e))).length;
    if (gained) sfx.play('link', 0, { delay: 0.06 });
    else if (lost) sfx.play('unlink', 0, { delay: 0.04 });
    links = now;
    advanceGuide();
    app.save();
  }

  function drop(piece: Piece, target: Target, fromX: number, fromY: number) {
    const res = inv.place(piece, target);
    const r = 'slot' in target ? benchSlotRect(target.slot) : cellRect(target.col, target.row);
    const cx = r.x + r.w / 2;
    if (res.kind === 'denied') {
      slide = { piece, x: fromX, y: fromY, age: 0 };
      sfx.play('denied', 0, { x: cx });
      return;
    }
    if (res.kind === 'fused' && res.piece) {
      pops.set(res.piece.id, 0);
      fx.fuseBurst(cx, r.y + r.h / 2, res.piece.level);
      if (res.fuse === 'stack') sfx.play('stack', res.piece.count, { x: cx });
      else sfx.play('merge', res.piece.level, { x: cx });
    } else sfx.play('drop', 0, { x: cx });
    changed();
  }

  /** A tapped bench piece goes to the first free grid cell next to something it can use. */
  function quickPlace(p: Piece) {
    const free: { col: number; row: number }[] = [];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (!inv.at(c, r)) free.push({ col: c, row: r });
    if (!free.length) {
      say('The grid is full');
      sfx.play('denied');
      return;
    }
    const useful = (c: number, r: number) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
        const n = inv.at(c + dc, r + dr);
        return !!n && (isPet(p.type) ? !isPet(n.type) : isPet(n.type));
      });
    const centre = (q: { col: number; row: number }) => Math.abs(q.col - 3.5) + Math.abs(q.row - 3.5);
    const spot = free.find((q) => useful(q.col, q.row)) ?? [...free].sort((a, b) => centre(a) - centre(b))[0];
    const from = homeRect(p);
    drop(p, spot, from.x + CELL / 2, from.y + CELL / 2);
    hops.set(p.id, 0);
  }

  function discard(p: Piece) {
    if (isPet(p.type) && pets().length <= 1) {
      say('Keep at least one pet!');
      sfx.play('denied');
      slide = { piece: p, x: BTN.trash.x + BTN.trash.w / 2, y: BTN.trash.y, age: 0 };
      return;
    }
    const cx = BTN.trash.x + BTN.trash.w / 2;
    const cy = BTN.trash.y + BTN.trash.h / 2;
    inv.remove(p);
    fx.burst(cx, cy - 20, { colors: [UI.text, UI.textDim, UI.borderStrong], n: 10, speed: 140, shape: 'shard', gravity: 500 });
    fx.word(cx, cy - 50, 'REMOVED', { color: UI.text, size: TYPE.body });
    sfx.play('drop', 0, { x: cx });
    changed();
  }

  // -------------------------------------------------------------- hit tests

  function targetAt(x: number, y: number): Target | null {
    if (inRect(x, y, GRID_RECT)) {
      return { col: clamp(Math.floor((x - GRID_RECT.x) / CELL), 0, GRID.cols - 1), row: clamp(Math.floor((y - GRID_RECT.y) / CELL), 0, GRID.rows - 1) };
    }
    if (inRect(x, y, BENCH_RECT)) {
      const s = Math.floor((x - BENCH_RECT.x) / CELL) + 8 * Math.floor((y - BENCH_RECT.y) / CELL);
      return s >= 0 && s < BENCH_SLOTS ? { slot: s } : null;
    }
    return null;
  }
  const pieceAtTarget = (tg: Target | null) => (!tg ? null : 'slot' in tg ? inv.benchAt(tg.slot) : inv.at(tg.col, tg.row));
  const dropPoint = (d: Drag) => ({ x: d.x, y: d.y - DRAG_UP });
  const btnAt = (x: number, y: number) => (Object.keys(BTN) as BtnId[]).find((k) => inRect(x, y, BTN[k])) ?? null;

  // -------------------------------------------------------------- buttons

  const benchFull = () => inv.freeBenchSlot() < 0;
  const canRoll = () => app.state.rolls > 0 && !benchFull();
  const canBattle = () => gridPets().length > 0;

  function press(id: BtnId) {
    if (id === 'roll') {
      if (!canRoll()) {
        say(app.state.rolls <= 0 ? 'No rolls: knock foes out to earn them' : 'The bench is full');
        sfx.play('denied');
        return;
      }
      sfx.play('click');
      if (tut() === 4) {
        app.state.tutorial = 5;
        app.save();
      }
      app.go('roll');
    } else if (id === 'battle') {
      if (!canBattle()) {
        say('Put a pet on the grid first');
        sfx.play('denied');
        return;
      }
      sfx.play('click');
      if (tut() === 3) {
        app.state.tutorial = 4;
        app.save();
      }
      app.go('match');
    } else if (id === 'auto') {
      sfx.play('click');
      autoArrange(inv);
      for (const p of inv.pieces) if (p.slot < 0) hops.set(p.id, -frand(0, 0.25));
      sfx.play('drop', 0, { delay: 0.12 });
      changed();
    } else if (id === 'mute') {
      sfx.play('click');
      sfx.toggleMute();
    } else {
      sfx.play('click');
      say('Drag a piece here to throw it away', W / 2, BTN.trash.y - 16);
    }
  }

  // -------------------------------------------------------------- drawing

  function drawTopBar(ctx: Ctx) {
    const lg = leagueOf(app.state.trophies);
    pill(ctx, PILL.name, { icon: (c, x, y, s) => leagueBadge(c, x, y, s, lg), text: app.state.name });
    pill(ctx, PILL.trophies, { icon: trophy, text: String(app.state.trophies) });
    pill(ctx, PILL.rolls, { icon: rollToken, text: String(app.state.rolls) });
    // the road toward the next reward
    const i = Math.min(app.state.claimed, TROPHY_ROAD.length - 1);
    const next = TROPHY_ROAD[i];
    const prev = i > 0 ? TROPHY_ROAD[i - 1].at : 0;
    progressBar(ctx, ROAD_BAR, clamp((app.state.trophies - prev) / (next.at - prev), 0, 1), { color: UI.accent });
    // the next reward, right-aligned on the bar's line: a roll at so many trophies
    const ex = W - S.pad;
    const ey = ROAD_BAR.y + ROAD_BAR.h / 2;
    rollToken(ctx, ex - 7, ey, 14);
    label(ctx, `${next.at}`, ex - 20, ey + 1, TYPE.small, { align: 'right', color: UI.textDim });
  }

  function drawArmy(ctx: Ctx) {
    const squads: SquadSpec[] = [...inv.squads()].sort((a, b) => squadPower(b) - squadPower(a));
    const fighters: { s: SquadSpec; i: number }[] = [];
    for (const s of squads) for (let i = 0; i < s.count && fighters.length < ARMY_CAP; i++) fighters.push({ s, i });
    const n = fighters.length;
    if (!n) {
      label(ctx, 'YOUR ARMY STANDS HERE', W / 2, STAGE_GROUND_Y - 40, TYPE.small + 1, { onPitch: true, track: 1.5 });
      return;
    }
    const step = Math.min(64, (W - 80) / Math.max(1, n - 1));
    // biggest in the middle: slot order 0, +1, -1, +2, -2 ...
    const spots = fighters.map((f, k) => {
      const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
      return { f, x: W / 2 + (off - (n % 2 ? 0 : 0.5)) * step, back: Math.abs(off) % 2 === 1 };
    });
    // the back row first
    spots.sort((a, b) => Number(b.back) - Number(a.back));
    for (const { f, x, back } of spots) {
      const s = f.s;
      const big = 1 + (s.level - 1) * 0.06;
      const r = (s.pet === 'frog' ? 21 : 18) * big * (back ? 0.9 : 1) * (n > 10 ? 1 : n > 5 ? 1.15 : 1.35);
      const look: PetLook = { pet: s.pet as PetType, level: s.level, team: 0, weapon: s.weapon, weaponLevel: s.weaponLevel, helmet: s.helmet, sneakers: s.sneakers, chili: s.chili, seed: s.key * 5 + f.i };
      const pose = restPose();
      const ph = s.key * 1.7 + f.i * 0.9;
      pose.t = t + ph;
      pose.face = x < W / 2 - 4 ? 1 : x > W / 2 + 4 ? -1 : 1;
      // now and then one hops on the spot
      const hp = (t * 0.45 + ph * 0.31) % 3;
      pose.hop = hp < 0.4 ? Math.sin((hp / 0.4) * Math.PI) * 0.5 : 0;
      const gy = STAGE_GROUND_Y - (back ? 10 : 0);
      ctx.save();
      ctx.translate(x, gy);
      petArt.drawShadow(ctx, look, r, pose.hop);
      petArt.drawPet(ctx, look, pose, r);
      ctx.restore();
    }
  }

  /** A link between two neighbours: a short bar across their shared edge; the accent when the pet uses it. */
  function drawLink(ctx: Ctx, e: LinkEdge) {
    const m = linkMid(e);
    const horiz = e.r1 === e.r2;
    const len = 18;
    const th = 4;
    const w = horiz ? th : len;
    const h = horiz ? len : th;
    rr(ctx, m.x - w / 2 - 2, m.y - h / 2 - 2, w + 4, h + 4, 3);
    ctx.fillStyle = UI.bg;
    ctx.fill();
    rr(ctx, m.x - w / 2, m.y - h / 2, w, h, 2);
    ctx.fillStyle = e.active ? UI.accent : UI.borderStrong;
    ctx.fill();
  }

  function tileOf(ctx: Ctx, p: Piece, r: Rect, idle: boolean) {
    let y = r.y;
    const h = hops.get(p.id);
    if (h !== undefined && h >= 0) y -= Math.sin(clamp(h / 0.35, 0, 1) * Math.PI) * 16;
    const pa = pops.get(p.id);
    const pop = pa !== undefined ? 1 + 0.45 * (1 - easeOutElastic(clamp(pa / 0.6, 0, 1))) : 1;
    drawPiece(ctx, p, { x: r.x + 2, y: y + 2, w: r.w - 4, h: r.h - 4 }, { idle, t, pop });
  }

  function drawBoard(ctx: Ctx) {
    gridFrame(ctx, GRID_RECT);
    const lifted = drag?.moved ? drag.piece : null;
    const hidden = lifted ?? slide?.piece ?? null;
    const over = drag?.moved ? targetAt(dropPoint(drag).x, dropPoint(drag).y) : null;
    const state = (tg: Target) => {
      if (!lifted || !over) return 'empty' as const;
      const same = 'slot' in tg && 'slot' in over ? tg.slot === over.slot : !('slot' in tg) && !('slot' in over) && tg.col === over.col && tg.row === over.row;
      if (!same) return 'empty' as const;
      const pv = inv.preview(lifted, tg);
      return pv.kind === 'fused' ? ('fuse' as const) : pv.kind === 'denied' ? ('bad' as const) : ('ok' as const);
    };
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) cell(ctx, cellRect(c, r), state({ col: c, row: r }));
    // the guide's destination
    const g = !drag && tut() < TUTORIAL_DONE ? guideTarget() : null;
    if (g?.to) {
      const a = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.save();
      rr(ctx, g.to.x + 3, g.to.y + 3, g.to.w - 6, g.to.h - 6, S.radius.s);
      ctx.globalAlpha = 0.08 + 0.1 * a;
      ctx.fillStyle = UI.accent;
      ctx.fill();
      ctx.globalAlpha = 0.45 + 0.55 * a;
      ctx.lineWidth = S.line.ui;
      ctx.strokeStyle = UI.accent;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of inv.pieces) {
      if (p.slot >= 0 || p === hidden) continue;
      const idle = !isPet(p.type) && inv.servedBy(p).length === 0;
      tileOf(ctx, p, cellRect(p.col, p.row), idle);
    }
    for (const e of links) if (!e.active) drawLink(ctx, e);
    for (const e of links) if (e.active) drawLink(ctx, e);
    // the bench
    gridFrame(ctx, BENCH_RECT);
    for (let s = 0; s < BENCH_SLOTS; s++) cell(ctx, benchSlotRect(s), state({ slot: s }));
    for (const p of inv.pieces) if (p.slot >= 0 && p !== hidden) tileOf(ctx, p, benchSlotRect(p.slot), false);
    // the cell under the lifted piece, outlined over whatever sits there
    if (lifted && over) {
      const st = state(over);
      const r = 'slot' in over ? benchSlotRect(over.slot) : cellRect(over.col, over.row);
      const col = st === 'fuse' ? UI.accent : st === 'bad' ? UI.danger : UI.ok;
      ctx.save();
      rr(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, S.radius.m);
      ctx.lineWidth = S.line.bold;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.restore();
    }
  }

  function btn(ctx: Ctx, id: BtnId, o: ButtonOpts) {
    button(ctx, BTN[id], { ...o, pressed: o.pressed || pressed === id });
  }

  function drawButtons(ctx: Ctx) {
    const pulseOn = (step: number) => (tut() === step ? 0.5 + 0.5 * Math.sin(t * 6) : 0);
    btn(ctx, 'roll', { variant: 'roll', text: 'ROLL', icon: rollToken, badge: app.state.rolls > 0 ? app.state.rolls : undefined, disabled: !canRoll(), pulse: pulseOn(4) });
    btn(ctx, 'battle', { variant: 'primary', text: 'BATTLE', disabled: !canBattle(), pulse: pulseOn(3), breathe: t });
    btn(ctx, 'auto', { variant: 'secondary', text: 'AUTO', icon: btnIcon(wand) });
    const overTrash = !!drag?.moved && inRect(drag.x, drag.y, BTN.trash);
    btn(ctx, 'trash', { variant: overTrash ? 'danger' : 'quiet', text: 'TRASH', icon: btnIcon(trash), pressed: overTrash });
    btn(ctx, 'mute', { variant: 'quiet', text: sfx.muted ? 'OFF' : 'SOUND', icon: (c, x, y, s) => speaker(c, x, y, s, sfx.muted) });
  }

  function drawCard(ctx: Ctx, p: Piece) {
    panel(ctx, CARD);
    const k = p.level;
    const x0 = CARD.x + S.pad + 4;
    label(ctx, PIECE_NAME[p.type].toUpperCase(), x0, CARD.y + 27, TYPE.h2 - 3, { align: 'left', weight: 700, track: 1.5 });
    label(ctx, cls(k).toUpperCase(), CARD.x + CARD.w - S.pad - 4, CARD.y + 27, TYPE.small + 1, { align: 'right', color: classColor(k, t), weight: 700, track: 1.5 });
    let desc = PIECE_DESC[p.type];
    if (isGear(p.type)) desc = desc.replace('{v}', String(gearPct(p.type, k)));
    if (isPet(p.type) && p.count > 1) desc = `${p.count} of them. ${desc}`;
    fitLabel(ctx, desc, x0, CARD.y + 58, TYPE.body - 1, CARD.w - S.pad * 2 - 8, { align: 'left' });
    // what the drop would do
    const d = drag ? dropPoint(drag) : null;
    const tg = d ? targetAt(d.x, d.y) : null;
    const pv = tg ? inv.preview(p, tg) : null;
    let tip = 'Drop on an identical piece to fuse';
    if (pv?.kind === 'fused') tip = pv.fuse === 'stack' ? `FUSE: x${p.count * 2} ${PIECE_NAME[p.type]}s!` : `FUSE: ${cls(k + 1)}!`;
    else if (isPet(p.type) && pv && !('slot' in tg!)) tip = 'Touch weapons and gear to power up';
    else if (!isPet(p.type)) tip = 'Put it right next to a pet';
    fitLabel(ctx, tip, x0, CARD.y + 84, TYPE.small + 1, CARD.w - S.pad * 2 - 8, { align: 'left', color: pv?.kind === 'fused' ? UI.accent : UI.textDim });
  }

  function drawGuide(ctx: Ctx) {
    if (tut() >= TUTORIAL_DONE || drag?.moved) return;
    const g = guideTarget();
    if (!g) return;
    const a = clamp(stepAge / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    // the pulse on the thing to touch
    const pr = 1 + 0.04 * Math.sin(t * 5);
    const cx = g.at.x + g.at.w / 2;
    const cy = g.at.y + g.at.h / 2;
    rr(ctx, cx - (g.at.w / 2) * pr - 3, cy - (g.at.h / 2) * pr - 3, g.at.w * pr + 6, g.at.h * pr + 6, S.radius.m);
    ctx.lineWidth = S.line.bold;
    ctx.strokeStyle = UI.accent;
    ctx.stroke();
    const sc = 0.92 + 0.08 * easeOutCubic(clamp(stepAge / 0.25, 0, 1));
    const hr = hintRect(g.at, g.to);
    ctx.translate(W / 2, hr.y + hr.h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -(hr.y + hr.h / 2));
    hint(ctx, hr, g.text, { x: cx, y: cy }, t);
    ctx.restore();
  }

  // -------------------------------------------------------------- the screen

  return {
    enter() {
      music.set('lobby');
      fx.clear();
      links = inv.links();
      drag = null;
      slide = null;
      pressed = null;
      shownStep = -1;
      advanceGuide();
    },
    leave() {
      drag = null;
      pressed = null;
    },
    update(dt) {
      t += dt;
      stepAge += dt;
      fx.update(dt);
      for (const [id, a] of pops) a + dt > 0.7 ? pops.delete(id) : pops.set(id, a + dt);
      for (const [id, a] of hops) a + dt > 0.4 ? hops.delete(id) : hops.set(id, a + dt);
      for (const q of toasts) q.age += dt;
      while (toasts.length && toasts[0].age > 1.5) toasts.shift();
      if (slide) {
        slide.age += dt;
        if (slide.age >= SLIDE_BACK) slide = null;
      }
      advanceGuide();
    },
    render(ctx) {
      app.arena.drawLobbyBack(ctx, t);
      // the interface stands on flat slate: the bar above the pitch strip and everything below it
      ctx.fillStyle = UI.bg;
      ctx.fillRect(0, 0, W, STAGE.y);
      ctx.fillRect(0, STAGE.y + STAGE.h, W, H - STAGE.y - STAGE.h);
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      app.arena.drawStage(ctx, t);
      drawArmy(ctx);
      pill(ctx, POWER_PILL, { text: `POWER ${inv.power()}` });
      drawBoard(ctx);
      fx.drawUnder(ctx);
      drawButtons(ctx);
      if (slide) {
        const home = homeRect(slide.piece);
        const k = easeOutCubic(clamp(slide.age / SLIDE_BACK, 0, 1));
        const x = slide.x + (home.x + CELL / 2 - slide.x) * k;
        const y = slide.y + (home.y + CELL / 2 - slide.y) * k;
        drawPiece(ctx, slide.piece, { x: x - CELL / 2 + 2, y: y - CELL / 2 + 2, w: CELL - 4, h: CELL - 4 }, { t, lifted: true });
      }
      fx.drawOver(ctx);
      drawTopBar(ctx);
      if (drag?.moved) {
        drawCard(ctx, drag.piece);
        const d = dropPoint(drag);
        const s = (CELL - 4) * DRAG_LIFT;
        // the lifted tile draws its own shadow on the ground below it
        const wob = 0; // the lifted piece is held still
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(wob);
        drawPiece(ctx, drag.piece, { x: -s / 2, y: -s / 2, w: s, h: s }, { t, lifted: true });
        ctx.restore();
      }
      drawGuide(ctx);
      for (const q of toasts) toast(ctx, q.text, q.x, q.y, q.age);
      ctx.restore();
      fx.drawScreen(ctx);
    },
    pointerDown(x, y) {
      if (drag) return;
      const b = btnAt(x, y);
      if (b) {
        pressed = b;
        return;
      }
      const p = pieceAtTarget(targetAt(x, y));
      if (p && p !== slide?.piece) {
        drag = { piece: p, x, y, sx: x, sy: y, moved: false };
        sfx.play('pick', 0, { x });
      }
    },
    pointerMove(x, y) {
      if (pressed && !inRect(x, y, BTN[pressed])) pressed = null;
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 8) drag.moved = true;
    },
    pointerUp(x, y) {
      if (pressed) {
        const id = pressed;
        pressed = null;
        if (inRect(x, y, BTN[id])) press(id);
        return;
      }
      const d = drag;
      drag = null;
      if (!d) return;
      d.x = x;
      d.y = y;
      if (!d.moved) {
        if (d.piece.slot >= 0) quickPlace(d.piece);
        else {
          hops.set(d.piece.id, 0);
          sfx.play('hop', 0, { x });
        }
        return;
      }
      if (inRect(x, y, BTN.trash)) {
        discard(d.piece);
        return;
      }
      const dp = dropPoint(d);
      const tg = targetAt(dp.x, dp.y);
      if (!tg) {
        slide = { piece: d.piece, x: dp.x, y: dp.y, age: 0 };
        sfx.play('drop', 0, { x });
        return;
      }
      drop(d.piece, tg, dp.x, dp.y);
    },
    pointerCancel() {
      if (drag?.moved) slide = { piece: drag.piece, ...dropPoint(drag), age: 0 };
      drag = null;
      pressed = null;
    },
  };
}
