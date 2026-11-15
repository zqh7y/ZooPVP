import type { App, Screen } from '../screen';
import type { Ctx, Rect } from '../util';
import type { LinkEdge, Piece, PetType, SaveState, SquadSpec } from '../types';
import type { Target } from '../logic/inventory';
import { shapeCells, cellsOf } from '../logic/inventory';
import { W, S, TYPE, TOPBAR, STAGE, UI } from '../theme';
import { clamp, easeOutBack, easeOutCubic, easeOutElastic, inRect, label, rr } from '../util';
import { BENCH_SLOTS, GRID, PIECE_DESC, PIECE_NAME, TROPHY_ROAD, TUTORIAL_DONE, cls, footprint, gearPct, isGear, isPet, leagueOf, squadPower } from '../data';
import { button, cell, classBadge, classBadgeSize, classColor, fitLabel, gridFrame, hint, panel, pill, powerBadge, progressBar, toast } from '../draw/ui';
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

/** One grid cell (and one bench slot), px. */
export const CELL = 90;
/** The power plate: centred on the army strip's lower edge, where the eye goes from the army to the grid. */
const POWER = { cx: W / 2, cy: STAGE.y + STAGE.h + 6, w: 280, h: 76 };
export const GRID_RECT: Rect = { x: (W - CELL * GRID.cols) / 2, y: POWER.cy + POWER.h / 2 + 24, w: CELL * GRID.cols, h: CELL * GRID.rows };
/** The bench: one row of BENCH_SLOTS slots under the grid. */
export const BENCH_RECT: Rect = { x: (W - CELL * BENCH_SLOTS) / 2, y: GRID_RECT.y + GRID_RECT.h + 36, w: CELL * BENCH_SLOTS, h: CELL };
/** Where a bench slot sits on screen. */
export const benchSlotRect = (slot: number): Rect => ({ x: BENCH_RECT.x + slot * CELL, y: BENCH_RECT.y, w: CELL, h: CELL });
const cellRect = (col: number, row: number): Rect => ({ x: GRID_RECT.x + col * CELL, y: GRID_RECT.y + row * CELL, w: CELL, h: CELL });
/** The rect a piece's whole footprint covers on the grid, with its top-left cell at col, row. */
const shapeRect = (p: Piece, col: number, row: number): Rect => {
  const f = footprint(p);
  return { x: GRID_RECT.x + col * CELL, y: GRID_RECT.y + row * CELL, w: CELL * f.w, h: CELL * f.h };
};
/** The tile a bench piece is drawn on: its footprint's shape, shrunk to fit its slot. */
export function benchPieceRect(p: { type: Piece['type']; count: number; turned?: boolean }, slot: number): Rect {
  const s = benchSlotRect(slot);
  const f = footprint({ ...p, turned: false });
  const k = 1 / Math.max(f.w, f.h);
  const w = CELL * f.w * k;
  const h = Math.max(CELL * f.h * k, f.w > f.h ? CELL * 0.62 : 0);
  return { x: s.x + (CELL - w) / 2, y: s.y + (CELL - h) / 2, w, h };
}

const BTN_Y = BENCH_RECT.y + BENCH_RECT.h + 22;
const SMALL_Y = BTN_Y + S.btnH + S.pad;
const BTN = {
  roll: { x: S.pad + 2, y: BTN_Y, w: 196, h: S.btnH },
  battle: { x: S.pad + 2 + 196 + S.pad, y: BTN_Y, w: W - S.pad * 3 - 4 - 196, h: S.btnH },
  auto: { x: S.pad + 2, y: SMALL_Y, w: 160, h: S.btnSmallH },
  trash: { x: (W - 160) / 2, y: SMALL_Y, w: 160, h: S.btnSmallH },
  mute: { x: W - S.pad - 2 - 160, y: SMALL_Y, w: 160, h: S.btnSmallH },
} satisfies Record<string, Rect>;
type BtnId = keyof typeof BTN;

/** The top bar's three pills: name, trophies, rolls. Every screen that shows them uses these places, so they never jump. */
export const TOP_PILLS = {
  name: { x: S.pad, y: TOPBAR.y, w: 236, h: TOPBAR.h },
  trophies: { x: S.pad + 236 + S.gap, y: TOPBAR.y, w: 134, h: TOPBAR.h },
  rolls: { x: S.pad + 236 + S.gap + 134 + S.gap, y: TOPBAR.y, w: W - S.pad * 2 - 236 - 134 - S.gap * 2, h: TOPBAR.h },
} satisfies Record<string, Rect>;
const PILL = TOP_PILLS;

/** The player's name (with the league badge), trophies and rolls, in the TOP_PILLS places. */
export function drawTopPills(ctx: Ctx, state: SaveState) {
  const lg = leagueOf(state.trophies);
  pill(ctx, PILL.name, { icon: (c, x, y, s) => leagueBadge(c, x, y, s, lg), text: state.name });
  pill(ctx, PILL.trophies, { icon: (c, x, y, s) => trophy(c, x, y, s, UI.accentDark), text: String(state.trophies) });
  pill(ctx, PILL.rolls, { icon: (c, x, y, s) => rollToken(c, x, y, s, UI.text), text: String(state.rolls) });
}

const ROAD_BAR: Rect = { x: S.pad + 4, y: TOPBAR.y + TOPBAR.h + 12, w: W - S.pad * 2 - 92, h: 8 };
/** The card over the stage while a piece is held: flush with the stage's top edge. */
const CARD: Rect = { x: S.pad, y: STAGE.y + 4, w: W - S.pad * 2, h: 112 };
const HINT_W = W - 64;
const HINT_H = 60;
/** At most this many fighters stand on the stage: fewer and larger than the whole army. */
const ARMY_CAP = 6;
const DRAG_LIFT = 1.08; // the lifted piece is drawn this much larger
const DRAG_UP = 30; // and this far above the finger
const SLIDE_BACK = 0.2;
const TURN_TIME = 0.32;

const btnIcon = (f: (ctx: Ctx, x: number, y: number, s: number) => void): IconFn => f;

interface Drag {
  piece: Piece;
  x: number;
  y: number;
  sx: number;
  sy: number;
  /** where the finger holds the piece, from the piece's centre (grid pieces keep their grip) */
  ox: number;
  oy: number;
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
/** Where a piece is drawn when it rests: its footprint on the grid, or its shrunk tile on the bench. */
const homeRect = (p: Piece): Rect => (p.slot >= 0 ? benchPieceRect(p, p.slot) : shapeRect(p, p.col, p.row));
const centreOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** The tile inside a footprint rect: a small gap all round, so neighbours read as separate blocks. */
const inset = (r: Rect, m = 3): Rect => ({ x: r.x + m, y: r.y + m, w: r.w - m * 2, h: r.h - m * 2 });

export function createLobby(app: App): Screen {
  const fx = new Fx();
  const inv = app.inv;
  let t = 0;
  let drag: Drag | null = null;
  let slide: Slide | null = null;
  let pressed: BtnId | null = null;
  const pops = new Map<number, number>(); // piece id -> age of its fuse pop
  const hops = new Map<number, number>(); // piece id -> age of its tap hop
  const turns = new Map<number, number>(); // piece id -> age of its turn
  const toasts: Toast[] = [];
  let links = inv.links();
  let shownStep = -1;
  let stepAge = 0;

  const say = (text: string, x = W / 2, y = BTN_Y - 26) => {
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
      const f = footprint(ant);
      for (const [dc, dr] of [[f.w, 0], [-1, 0], [0, f.h], [0, -1]]) {
        const c = ant.col + dc;
        const r = ant.row + dr;
        if (c >= 0 && r >= 0 && c < GRID.cols && r < GRID.rows && !inv.at(c, r)) return cellRect(c, r);
      }
      return undefined;
    };
    if (step === 0) {
      const p = find('ant', true);
      return p ? { text: 'Drag your ant onto the grid', at: homeRect(p), to: cellRect(2, 2) } : null;
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
    if (step === 4) return { text: 'You won rolls. Press ROLL', at: BTN.roll };
    if (step === 5) {
      const p = inv.pieces.find((q) => q.type === 'ant' && q.slot >= 0);
      return p ? { text: 'Drop the new ant onto your ant to double it', at: homeRect(p), to: ant ? homeRect(ant) : undefined } : null;
    }
    return null;
  }

  /**
   * Where the guide's callout sits: in an empty row of the grid when one is clear of the target (the top row,
   * else the bottom one), else at the top of the army strip.
   */
  function hintRect(to?: Rect): Rect {
    const x = (W - HINT_W) / 2;
    const clear = (r: Rect) => (!to || to.y > r.y + r.h + S.gap || to.y + to.h < r.y - S.gap) && !inv.pieces.some((p) => p.slot < 0 && p.row <= Math.floor((r.y + r.h - GRID_RECT.y) / CELL) && p.row + footprint(p).h - 1 >= Math.floor((r.y - GRID_RECT.y) / CELL));
    const top = { x, y: GRID_RECT.y + (CELL - HINT_H) / 2, w: HINT_W, h: HINT_H };
    const bottom = { x, y: GRID_RECT.y + GRID_RECT.h - CELL + (CELL - HINT_H) / 2, w: HINT_W, h: HINT_H };
    if (clear(top) && to) return top;
    if (clear(bottom)) return bottom;
    if (clear(top)) return top;
    return { x, y: STAGE.y + S.pad, w: HINT_W, h: HINT_H };
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
    if (res.kind === 'denied') {
      slide = { piece, x: fromX, y: fromY, age: 0 };
      sfx.play('denied', 0, { x: fromX });
      if (res.reason) say(res.reason);
      return;
    }
    const at = res.piece ?? piece;
    const c = centreOf(homeRect(at));
    if (res.kind === 'fused' && res.piece) {
      pops.set(res.piece.id, 0);
      fx.fuseBurst(c.x, c.y, res.piece.level);
      if (res.fuse === 'stack') sfx.play('stack', res.piece.count, { x: c.x });
      else sfx.play('merge', res.piece.level, { x: c.x });
    } else sfx.play('drop', 0, { x: c.x });
    changed();
  }

  /** A tapped bench piece goes to the first free spot next to something it can use (else the free spot nearest the middle). */
  function quickPlace(p: Piece) {
    const f = footprint(p);
    const free: { col: number; row: number }[] = [];
    for (let r = 0; r + f.h <= GRID.rows; r++) for (let c = 0; c + f.w <= GRID.cols; c++) if (inv.preview(p, { col: c, row: r }).kind === 'moved') free.push({ col: c, row: r });
    if (!free.length) {
      say('No room on the grid');
      sfx.play('denied');
      return;
    }
    const useful = (c0: number, r0: number) =>
      shapeCells(f.w, f.h, c0, r0).some(({ col, row }) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
          const n = inv.at(col + dc, row + dr);
          return !!n && n !== p && (isPet(p.type) ? !isPet(n.type) : isPet(n.type));
        }),
      );
    const mid = (GRID.cols - 1) / 2;
    const centre = (q: { col: number; row: number }) => Math.abs(q.col + (f.w - 1) / 2 - mid) + Math.abs(q.row + (f.h - 1) / 2 - mid);
    const spot = [...free].sort((a, b) => Number(useful(b.col, b.row)) - Number(useful(a.col, a.row)) || centre(a) - centre(b))[0];
    const from = centreOf(homeRect(p));
    drop(p, spot, from.x, from.y);
    hops.set(p.id, 0);
  }

  function discard(p: Piece) {
    if (isPet(p.type) && pets().length <= 1) {
      say('Keep at least one pet');
      sfx.play('denied');
      slide = { piece: p, x: BTN.trash.x + BTN.trash.w / 2, y: BTN.trash.y, age: 0 };
      return;
    }
    const cx = BTN.trash.x + BTN.trash.w / 2;
    const cy = BTN.trash.y + BTN.trash.h / 2;
    inv.remove(p);
    fx.burst(cx, cy - 20, { colors: [UI.textDim, UI.borderStrong, '#ffffff'], n: 10, speed: 140, shape: 'shard', gravity: 500 });
    fx.word(cx, cy - 50, 'REMOVED', { color: UI.text, size: TYPE.body });
    sfx.play('drop', 0, { x: cx });
    changed();
  }

  function turn(p: Piece) {
    const res = inv.turn(p);
    const c = centreOf(homeRect(p));
    if (!res.ok) {
      say(res.reason ?? 'No room to turn it');
      sfx.play('denied', 0, { x: c.x });
      hops.set(p.id, 0);
      return;
    }
    turns.set(p.id, 0);
    sfx.play('hop', 0, { x: c.x });
    sfx.play('drop', 0, { x: c.x, delay: 0.16 });
    changed();
  }

  // -------------------------------------------------------------- hit tests

  /** The piece's centre while it is held. */
  const heldCentre = (d: Drag) => ({ x: d.x + d.ox, y: d.y + d.oy - DRAG_UP });

  /** Where a held piece would land: the grid anchor that puts its shape under it, or the bench slot under its centre. */
  function targetFor(p: Piece, c: { x: number; y: number }): Target | null {
    if (inRect(c.x, c.y, { x: BENCH_RECT.x - 8, y: BENCH_RECT.y - 10, w: BENCH_RECT.w + 16, h: BENCH_RECT.h + 20 })) {
      return { slot: clamp(Math.floor((c.x - BENCH_RECT.x) / CELL), 0, BENCH_SLOTS - 1) };
    }
    if (!inRect(c.x, c.y, { x: GRID_RECT.x - 20, y: GRID_RECT.y - 20, w: GRID_RECT.w + 40, h: GRID_RECT.h + 40 })) return null;
    const f = footprint(p);
    const col = clamp(Math.round((c.x - GRID_RECT.x) / CELL - f.w / 2), 0, GRID.cols - f.w);
    const row = clamp(Math.round((c.y - GRID_RECT.y) / CELL - f.h / 2), 0, GRID.rows - f.h);
    return { col, row };
  }
  function pieceAt(x: number, y: number): Piece | null {
    if (inRect(x, y, GRID_RECT)) return inv.at(Math.floor((x - GRID_RECT.x) / CELL), Math.floor((y - GRID_RECT.y) / CELL));
    if (inRect(x, y, BENCH_RECT)) return inv.benchAt(Math.floor((x - BENCH_RECT.x) / CELL));
    return null;
  }
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
      say('Drag a piece here to throw it away', W / 2, BTN.trash.y - 20);
    }
  }

  // -------------------------------------------------------------- drawing

  function drawTopBar(ctx: Ctx) {
    drawTopPills(ctx, app.state);
    // the road toward the next reward
    const i = Math.min(app.state.claimed, TROPHY_ROAD.length - 1);
    const next = TROPHY_ROAD[i];
    const prev = i > 0 ? TROPHY_ROAD[i - 1].at : 0;
    progressBar(ctx, ROAD_BAR, clamp((app.state.trophies - prev) / (next.at - prev), 0, 1), { color: UI.accent });
    const ex = W - S.pad - 4;
    const ey = ROAD_BAR.y + ROAD_BAR.h / 2;
    rollToken(ctx, ex - 9, ey, 18, UI.text);
    label(ctx, `${next.at}`, ex - 26, ey + 1, TYPE.caption, { align: 'right', color: UI.text, weight: 700 });
  }

  /** The army on the strip: up to ARMY_CAP fighters, grouped by kind, each with its class plate over its head. */
  function drawArmy(ctx: Ctx) {
    const squads: SquadSpec[] = [...inv.squads()].sort((a, b) => (a.pet === b.pet ? squadPower(b) - squadPower(a) : a.pet < b.pet ? -1 : 1));
    const total = squads.reduce((a, s) => a + s.count, 0);
    // every squad shows at least one fighter (while there is room), the strongest fill the rest
    const shown = new Map<SquadSpec, number>();
    let left = ARMY_CAP;
    for (const s of squads) if (left > 0) shown.set(s, 1), left--;
    const byPower = [...squads].sort((a, b) => squadPower(b) - squadPower(a));
    for (let pass = 0; left > 0 && pass < 8; pass++) for (const s of byPower) if (left > 0 && (shown.get(s) ?? 0) < s.count && shown.has(s)) shown.set(s, (shown.get(s) ?? 0) + 1), left--;
    const fighters: { s: SquadSpec; i: number }[] = [];
    for (const s of squads) for (let i = 0; i < (shown.get(s) ?? 0); i++) fighters.push({ s, i });
    const n = fighters.length;
    const ground = STAGE_GROUND_Y - 6;
    if (!n) {
      rr(ctx, W / 2 - 150, ground - 74, 300, 44, 22);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      label(ctx, 'YOUR ARMY STANDS HERE', W / 2, ground - 51, TYPE.body, { weight: 700, track: 1.5, color: UI.textDim });
      return;
    }
    const step = Math.min(n <= 3 ? 130 : 96, (W - 110) / Math.max(1, n - 1));
    const scale = n <= 2 ? 1.55 : n <= 4 ? 1.35 : 1.12;
    fighters.forEach(({ s, i }, k) => {
      const x = W / 2 + (k - (n - 1) / 2) * step;
      const r = (s.pet === 'frog' ? 21 : 18) * (1 + (s.level - 1) * 0.05) * scale;
      const look: PetLook = { pet: s.pet as PetType, level: s.level, team: 0, weapon: s.weapon, weaponLevel: s.weaponLevel, helmet: s.helmet, sneakers: s.sneakers, chili: s.chili, seed: s.key * 5 + i };
      const pose = restPose();
      const ph = s.key * 1.7 + i * 0.9;
      pose.t = t + ph;
      pose.face = x < W / 2 - 4 ? 1 : x > W / 2 + 4 ? -1 : 1;
      const hp = (t * 0.45 + ph * 0.31) % 3;
      pose.hop = hp < 0.4 ? Math.sin((hp / 0.4) * Math.PI) * 0.5 : 0;
      const gy = ground + (k % 2) * 8;
      ctx.save();
      ctx.translate(x, gy);
      petArt.drawShadow(ctx, look, r, pose.hop);
      petArt.drawPet(ctx, look, pose, r);
      ctx.restore();
      // the class plate floats over the head (only on the first of a squad, so a crowd does not turn into labels)
      if (i === 0) {
        const bs = classBadgeSize(s.level, 0.9);
        const top = gy - Math.abs(petArt.headTop(look, r)) - 4 - pose.hop * r * 0.3;
        classBadge(ctx, s.level, x - bs.w / 2, top, 0.9, t);
      }
    });
    if (total > n) {
      const s = `+${total - n}`;
      const x = W - S.pad - 30;
      const y = ground - 4;
      rr(ctx, x - 26, y - 15, 52, 30, 15);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      label(ctx, s, x, y + 1, TYPE.body, { weight: 700, color: UI.text });
    }
  }

  /** A link between two neighbours: a small rounded joint across their shared edge; gold when the pet uses it. */
  function drawLink(ctx: Ctx, e: LinkEdge) {
    const m = linkMid(e);
    const horiz = e.r1 === e.r2;
    const len = 26;
    const th = 10;
    const w = horiz ? th : len;
    const h = horiz ? len : th;
    rr(ctx, m.x - w / 2 - 2, m.y - h / 2 - 1, w + 4, h + 4, 6);
    ctx.fillStyle = 'rgba(90, 60, 20, 0.25)';
    ctx.fill();
    rr(ctx, m.x - w / 2 - 1.5, m.y - h / 2 - 1.5, w + 3, h + 3, 6);
    ctx.fillStyle = e.active ? '#b97c00' : '#b9ad99';
    ctx.fill();
    rr(ctx, m.x - w / 2, m.y - h / 2, w, h, 5);
    ctx.fillStyle = e.active ? UI.accent : '#e8dfd0';
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    if (horiz) ctx.fillRect(m.x - w / 2 + 2, m.y - h / 2 + 3, 2, h - 6);
    else ctx.fillRect(m.x - w / 2 + 3, m.y - h / 2 + 2, w - 6, 2);
  }

  function tileOf(ctx: Ctx, p: Piece, r: Rect, idle: boolean) {
    let y = r.y;
    const h = hops.get(p.id);
    if (h !== undefined && h >= 0) y -= Math.sin(clamp(h / 0.35, 0, 1) * Math.PI) * 14;
    const pa = pops.get(p.id);
    const pop = pa !== undefined ? 1 + 0.4 * (1 - easeOutElastic(clamp(pa / 0.6, 0, 1))) : 1;
    const ta = turns.get(p.id);
    const tr = inset({ x: r.x, y, w: r.w, h: r.h }, p.slot >= 0 ? 4 : 3);
    if (ta !== undefined) {
      const k = easeOutBack(clamp(ta / TURN_TIME, 0, 1));
      const c = centreOf(tr);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((1 - k) * (p.turned ? -Math.PI / 2 : Math.PI / 2));
      ctx.translate(-c.x, -c.y);
      drawPiece(ctx, p, tr, { idle, t, pop });
      ctx.restore();
      return;
    }
    drawPiece(ctx, p, tr, { idle, t, pop });
  }

  /** The cells a held piece would cover at its target, with the state to tint them. */
  function hoverCells(p: Piece, tg: Target): { cells: { col: number; row: number }[]; slot: number; state: 'ok' | 'bad' | 'fuse' } {
    const pv = inv.preview(p, tg);
    const state = pv.kind === 'fused' ? 'fuse' : pv.kind === 'denied' ? 'bad' : 'ok';
    if ('slot' in tg) return { cells: [], slot: tg.slot, state };
    if (pv.kind === 'fused' && pv.piece && pv.piece.slot < 0) return { cells: cellsOf(pv.piece), slot: -1, state };
    const f = footprint(p);
    return { cells: shapeCells(f.w, f.h, tg.col, tg.row).filter((c) => c.col < GRID.cols && c.row < GRID.rows), slot: -1, state };
  }

  /** The outline of the spot a held piece would take (or of the piece it would fuse with), in the state colour. */
  function drawLanding(ctx: Ctx, d: Drag) {
    const tg = targetFor(d.piece, heldCentre(d));
    if (!tg) return;
    const hov = hoverCells(d.piece, tg);
    let r: Rect | null = null;
    if (hov.slot >= 0) r = benchSlotRect(hov.slot);
    else if (hov.cells.length) {
      const c0 = Math.min(...hov.cells.map((c) => c.col));
      const r0 = Math.min(...hov.cells.map((c) => c.row));
      const c1 = Math.max(...hov.cells.map((c) => c.col));
      const r1 = Math.max(...hov.cells.map((c) => c.row));
      r = { x: GRID_RECT.x + c0 * CELL, y: GRID_RECT.y + r0 * CELL, w: (c1 - c0 + 1) * CELL, h: (r1 - r0 + 1) * CELL };
    }
    if (!r) return;
    const col = hov.state === 'fuse' ? UI.accentDark : hov.state === 'bad' ? UI.danger : UI.ok;
    ctx.save();
    rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, S.radius.m + 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = col;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -t * 30;
    ctx.stroke();
    ctx.restore();
  }

  function drawBoard(ctx: Ctx) {
    gridFrame(ctx, GRID_RECT);
    const lifted = drag?.moved ? drag.piece : null;
    const hidden = lifted ?? slide?.piece ?? null;
    const tg = lifted && drag ? targetFor(lifted, heldCentre(drag)) : null;
    const hov = lifted && tg ? hoverCells(lifted, tg) : null;
    const tint = (c: number, r: number) => (hov && hov.cells.some((q) => q.col === c && q.row === r) ? hov.state : 'empty');
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) cell(ctx, cellRect(c, r), tint(c, r));
    // the guide's destination
    const g = !drag && tut() < TUTORIAL_DONE ? guideTarget() : null;
    if (g?.to) {
      const a = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.save();
      rr(ctx, g.to.x + 5, g.to.y + 5, g.to.w - 10, g.to.h - 10, S.radius.m);
      ctx.globalAlpha = 0.14 + 0.14 * a;
      ctx.fillStyle = UI.accent;
      ctx.fill();
      ctx.globalAlpha = 0.6 + 0.4 * a;
      ctx.lineWidth = 3;
      ctx.strokeStyle = UI.accentDark;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.restore();
    }
    // the pieces, top rows first, so a lower tile's thickness never paints over the one above it
    const onGrid = inv.pieces.filter((p) => p.slot < 0 && p !== hidden).sort((a, b) => a.row - b.row || a.col - b.col);
    for (const p of onGrid) tileOf(ctx, p, homeRect(p), !isPet(p.type) && inv.servedBy(p).length === 0);
    for (const e of links) if (!e.active) drawLink(ctx, e);
    for (const e of links) if (e.active) drawLink(ctx, e);
    // the bench
    gridFrame(ctx, BENCH_RECT);
    for (let s = 0; s < BENCH_SLOTS; s++) cell(ctx, benchSlotRect(s), hov && hov.slot === s ? hov.state : 'empty');
    for (const p of inv.pieces) if (p.slot >= 0 && p !== hidden) tileOf(ctx, p, homeRect(p), false);
  }

  function btn(ctx: Ctx, id: BtnId, o: ButtonOpts) {
    button(ctx, BTN[id], { ...o, pressed: o.pressed || pressed === id });
  }

  function drawButtons(ctx: Ctx) {
    const pulseOn = (step: number) => (tut() === step ? (t * 1.1) % 1 : 0);
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
    const x0 = CARD.x + S.pad + S.base + 4;
    const bs = classBadgeSize(k, 1);
    classBadge(ctx, k, x0, CARD.y + 30, 1, t);
    label(ctx, PIECE_NAME[p.type].toUpperCase(), x0 + bs.w + 10, CARD.y + 31, TYPE.h3, { align: 'left', weight: 700, track: 1.5, color: UI.text });
    label(ctx, cls(k).toUpperCase(), CARD.x + CARD.w - S.pad - S.base - 4, CARD.y + 31, TYPE.caption, { align: 'right', color: classColor(k, t), weight: 700, track: 1.5 });
    let desc = PIECE_DESC[p.type];
    if (isGear(p.type)) desc = desc.replace('{v}', String(gearPct(p.type, k)));
    if (isPet(p.type) && p.count > 1) desc = `${p.count} of them. ${desc}`;
    fitLabel(ctx, desc, x0, CARD.y + 64, TYPE.body, CARD.w - (S.pad + S.base + 4) * 2, { align: 'left', color: UI.text });
    const tg = drag ? targetFor(p, heldCentre(drag)) : null;
    const pv = tg ? inv.preview(p, tg) : null;
    let tip = 'Drop on an identical piece to fuse';
    if (pv?.kind === 'fused') tip = pv.fuse === 'stack' ? `Fuses into ${p.count * 2} ${PIECE_NAME[p.type]}s` : `Fuses to ${cls(k + 1)}`;
    else if (pv?.kind === 'denied' && pv.reason) tip = pv.reason;
    else if (isPet(p.type) && tg && !('slot' in tg)) tip = p.count === 2 ? 'Touch weapons and gear. Tap it to turn it' : 'Touch weapons and gear to power up';
    else if (!isPet(p.type)) tip = 'Put it right next to a pet';
    fitLabel(ctx, tip, x0, CARD.y + 92, TYPE.caption, CARD.w - (S.pad + S.base + 4) * 2, { align: 'left', color: pv?.kind === 'fused' ? '#b97c00' : pv?.kind === 'denied' ? UI.danger : UI.textDim, weight: 700 });
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
    rr(ctx, cx - (g.at.w / 2) * pr - 4, cy - (g.at.h / 2) * pr - 4, g.at.w * pr + 8, g.at.h * pr + 8, S.radius.l);
    ctx.lineWidth = 3;
    ctx.strokeStyle = UI.accentDark;
    ctx.stroke();
    const sc = 0.92 + 0.08 * easeOutCubic(clamp(stepAge / 0.25, 0, 1));
    const hr = hintRect(g.to);
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
      for (const [id, a] of turns) a + dt > TURN_TIME ? turns.delete(id) : turns.set(id, a + dt);
      for (const q of toasts) q.age += dt;
      while (toasts.length && toasts[0].age > 1.6) toasts.shift();
      if (slide) {
        slide.age += dt;
        if (slide.age >= SLIDE_BACK) slide = null;
      }
      advanceGuide();
    },
    render(ctx) {
      app.arena.drawLobbyBack(ctx, t);
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      app.arena.drawStage(ctx, t);
      drawArmy(ctx);
      drawBoard(ctx);
      powerBadge(ctx, POWER.cx, POWER.cy, inv.power(), { w: POWER.w, h: POWER.h, key: 'lobby' });
      fx.drawUnder(ctx);
      drawButtons(ctx);
      if (slide) {
        const home = homeRect(slide.piece);
        const k = easeOutCubic(clamp(slide.age / SLIDE_BACK, 0, 1));
        const hc = centreOf(home);
        const x = slide.x + (hc.x - slide.x) * k;
        const y = slide.y + (hc.y - slide.y) * k;
        drawPiece(ctx, slide.piece, inset({ x: x - home.w / 2, y: y - home.h / 2, w: home.w, h: home.h }), { t, lifted: true });
      }
      fx.drawOver(ctx);
      drawTopBar(ctx);
      if (drag?.moved) {
        drawCard(ctx, drag.piece);
        const c = heldCentre(drag);
        const f = footprint(drag.piece);
        const w = (CELL * f.w - 6) * DRAG_LIFT;
        const h = (CELL * f.h - 6) * DRAG_LIFT;
        // the held piece lets the tinted cells under it show through, and the spot it would take is outlined over it
        ctx.save();
        ctx.globalAlpha = 0.82;
        drawPiece(ctx, drag.piece, { x: c.x - w / 2, y: c.y - h / 2, w, h }, { t, lifted: true });
        ctx.restore();
        drawLanding(ctx, drag);
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
      const p = pieceAt(x, y);
      if (p && p !== slide?.piece) {
        // a grid piece keeps the grip the finger took on it; a bench piece is held by its middle
        const c = centreOf(homeRect(p));
        const grip = p.slot < 0 ? { ox: c.x - x, oy: c.y - y + DRAG_UP } : { ox: 0, oy: 0 };
        drag = { piece: p, x, y, sx: x, sy: y, ...grip, moved: false };
        sfx.play('pick', 0, { x });
      }
    },
    pointerMove(x, y) {
      if (pressed && !inRect(x, y, BTN[pressed])) pressed = null;
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 8) {
        drag.moved = true;
        // once lifted, the piece floats just above the finger
        drag.ox *= 0.5;
        drag.oy = drag.oy * 0.5;
      }
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
        else if (isPet(d.piece.type) && d.piece.count === 2) turn(d.piece);
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
      const c = heldCentre(d);
      const tg = targetFor(d.piece, c);
      if (!tg) {
        slide = { piece: d.piece, x: c.x, y: c.y, age: 0 };
        sfx.play('drop', 0, { x });
        return;
      }
      drop(d.piece, tg, c.x, c.y);
    },
    pointerCancel() {
      if (drag?.moved) slide = { piece: drag.piece, ...heldCentre(drag), age: 0 };
      drag = null;
      pressed = null;
    },
  };
}
