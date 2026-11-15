import { music, sfx } from '../audio/engine';
import {
  AUTO_START, BENCH_SLOTS, GRID, PET_INFO, PIECE_DESC, PIECE_NAME, PITY, REWARD, TUTORIAL_DONE,
  cls, footprint, formatPower, gearPct, isGear, isPet, koCash, rungOf,
} from '../data';
import { setView } from '../draw/camera';
import { Fx } from '../draw/fx';
import { bars, bolt, cash, crown, cycle, fight, flame, gem, koStar, lock, speaker, star, trash, wand } from '../draw/icons';
import { drawPiece } from '../draw/pieces';
import {
  button, buttonLook, cell, classBadge, classBadgeSize, classColorOnDark, dropLabel, fitLabel, gridFrame, hint, progressBar,
  rungBadge, tickTo, toast, type ButtonOpts,
} from '../draw/ui';
import { autoArrange } from '../logic/auto';
import { LOCKED, cellsOf, shapeCells, type Target } from '../logic/inventory';
import { fightSeed, findOpponent, matchSeed, matchesToChampion } from '../logic/match';
import { applyMatch, cellLock, cellProgress, levelProgress, openEarned, unlockCell } from '../logic/progress';
import { caseBlock, casePrice, openCase } from '../logic/rolls';
import { FRESH_START_TOAST, MIGRATED_TOAST } from '../logic/save';
import { frand } from '../rng';
import type { App, Screen } from '../screen';
import { COLOR, H, PILL, S, TYPE, UI, W } from '../theme';
import type { ArmySpec, CaseKind, LinkEdge, Opponent, PetType, Piece, Team } from '../types';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, easeOutElastic, inRect, label, rr, textWidth, type Ctx, type Rect } from '../util';
import { BattleView, type MatchSetup } from './battle';
import { Matchmaking } from './matchmaking';
import { Evolve, Ladder, NewUnit, type Overlay } from './panels';
import { Result } from './result';
import { RollOverlay } from './roll';

/*
 * The one main screen. Top to bottom: the top bar (cash, LEVEL n with its XP bar, gems: three pills in the one style
 * the player liked), the arena (it owns the battle view: in prep a short view with your army in its rows and the big
 * BATTLE button over it; BATTLE opens the matchmaking moment, then the view grows to most of the screen for the fight
 * while the grid slides down, locked, and shrinks back behind the result panel), then the POWER tab, the 5 x 5 grid
 * with its locked cells, the tray between the stats button and TRASH, and CASE / ELITE. The roll and every panel are
 * overlays on it.
 */

// ------------------------------------------------------------------ layout

export const ARENA_PREP: Rect = { x: 0, y: 72, w: W, h: 488 };
export const ARENA_FIGHT: Rect = { x: 0, y: 72, w: W, h: 948 };
/** how far the lower part (grid, tray, cases) slides down while a match is fought */
const SLIDE = ARENA_FIGHT.h - ARENA_PREP.h;
const GROW_TIME = 0.75;

const TOP = {
  cash: { x: 12, y: 14, w: 128, h: 44 },
  level: { x: 150, y: 14, w: 240, h: 44 },
  gems: { x: 400, y: 14, w: 128, h: 44 },
} satisfies Record<string, Rect>;
const SOUND: Rect = { x: 12, y: 84, w: 54, h: 52 };
const AUTO: Rect = { x: 474, y: 84, w: 54, h: 52 };
const BATTLE: Rect = { x: 105, y: 176, w: 330, h: 108 };

/** One grid cell, px. */
export const CELL = 66;
export const GRID_RECT: Rect = { x: (W - CELL * GRID.cols) / 2, y: 620, w: CELL * GRID.cols, h: CELL * GRID.rows };
const POWER_TAB: Rect = { x: W / 2 - 86, y: 568, w: 172, h: 40 };
const ARRANGE: Rect = { x: GRID_RECT.x + GRID_RECT.w - 46, y: 570, w: 54, h: 38 };
/** The tray: BENCH_SLOTS slots under the grid. */
export const SLOT = 74;
const SLOT_GAP = 10;
export const TRAY: Rect = { x: (W - (SLOT * BENCH_SLOTS + SLOT_GAP * (BENCH_SLOTS - 1))) / 2, y: 978, w: SLOT * BENCH_SLOTS + SLOT_GAP * (BENCH_SLOTS - 1), h: SLOT };
const STATS: Rect = { x: 18, y: 980, w: 70, h: 70 };
const TRASH: Rect = { x: W - 18 - 70, y: 980, w: 70, h: 70 };
const CASE_BTN: Rect = { x: 18, y: 1070, w: 300, h: 80 };
const ELITE_BTN: Rect = { x: 330, y: 1070, w: 192, h: 80 };
/** the card over the arena's bottom while a piece is held */
const CARD: Rect = { x: S.pad, y: 446, w: W - S.pad * 2, h: 108 };
const HINT: Rect = { x: 40, y: 330, w: W - 80, h: 58 };

export const benchSlotRect = (slot: number): Rect => ({ x: TRAY.x + slot * (SLOT + SLOT_GAP), y: TRAY.y, w: SLOT, h: SLOT });
const cellRect = (col: number, row: number): Rect => ({ x: GRID_RECT.x + col * CELL, y: GRID_RECT.y + row * CELL, w: CELL, h: CELL });
const shapeRect = (p: Piece, col: number, row: number): Rect => {
  const f = footprint(p);
  return { x: GRID_RECT.x + col * CELL, y: GRID_RECT.y + row * CELL, w: CELL * f.w, h: CELL * f.h };
};
/** The tile a tray piece is drawn on: its footprint's shape, shrunk to fit its slot. */
function benchPieceRect(p: { type: Piece['type']; count: number }, slot: number): Rect {
  const s = benchSlotRect(slot);
  const f = footprint({ ...p, turned: false });
  const k = 1 / Math.max(f.w, f.h);
  const w = SLOT * f.w * k;
  const h = Math.max(SLOT * f.h * k, f.w > f.h ? SLOT * 0.64 : 0);
  return { x: s.x + (SLOT - w) / 2, y: s.y + (SLOT - h) / 2, w, h };
}
const homeRect = (p: Piece): Rect => (p.slot >= 0 ? benchPieceRect(p, p.slot) : shapeRect(p, p.col, p.row));
const centreOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inset = (r: Rect, m = 3): Rect => ({ x: r.x + m, y: r.y + m, w: r.w - m * 2, h: r.h - m * 2 });
const linkKey = (e: LinkEdge) => `${e.c1},${e.r1},${e.c2},${e.r2},${e.active ? 1 : 0}`;

const DRAG_LIFT = 1.08;
const DRAG_UP = 30;
const SLIDE_BACK = 0.2;
const TURN_TIME = 0.32;

type BtnId = 'sound' | 'auto' | 'battle' | 'stats' | 'trash' | 'case' | 'elite' | 'arrange';
const BTN: Record<BtnId, Rect> = { sound: SOUND, auto: AUTO, battle: BATTLE, stats: STATS, trash: TRASH, case: CASE_BTN, elite: ELITE_BTN, arrange: ARRANGE };
/** buttons in the lower part (they slide with the grid) */
const LOWER: ReadonlySet<BtnId> = new Set(['stats', 'trash', 'case', 'elite', 'arrange']);

interface Drag { piece: Piece; x: number; y: number; sx: number; sy: number; ox: number; oy: number; moved: boolean }
interface Slide { piece: Piece; x: number; y: number; age: number }
interface Toast { text: string; x: number; y: number; age: number; life: number }
/** a knock-out's cash, paid into the pill coin by coin as the battle view's coins arrive */
interface KoPay { value: number; coins: number; left: number }
/** prep: the grid is open; search: the matchmaking moment; fight: the match is fought; after: the result panel */
type Mode = 'prep' | 'search' | 'fight' | 'after';

export function createLobby(app: App, opts: { freshStart?: boolean; migrated?: boolean } = {}): Screen {
  const inv = app.inv;
  const state = app.state;
  const fx = new Fx();
  const view = new BattleView(app);
  const roll = new RollOverlay();
  let t = 0;
  let mode: Mode = 'prep';
  let grow = 0; // 0 = the prep view, 1 = the fight view
  let setup: MatchSetup | null = null;
  let opponent: Opponent | null = null;
  let result: Result | null = null;
  let drag: Drag | null = null;
  let slide: Slide | null = null;
  let pressed: BtnId | null = null;
  let downCell: { col: number; row: number } | null = null;
  let idle = 0; // seconds of untouched prep (AUTO)
  let battleAge = 0; // seconds the BATTLE button has been showing
  /** cash the fight's knock-out coins have brought into the pill so far */
  let fightCash = 0;
  const koPay: KoPay[] = [];
  const bumps = { cash: -9, gems: -9 };
  const pops = new Map<number, number>();
  const hops = new Map<number, number>();
  const turns = new Map<number, number>();
  const toasts: Toast[] = [];
  const panels: Overlay[] = []; // modal, one at a time
  let pendingCells: { col: number; row: number }[] = [];
  let links = inv.links();
  let army: ArmySpec = inv.army();
  let power = inv.power();
  let shownStep = -1;
  let stepAge = 0;

  const say = (text: string, y = TRAY.y - 22, life = 1.6) => toasts.push({ text, x: W / 2, y, age: 0, life });
  const slideY = () => SLIDE * easeInOutCubic(grow);
  const arenaRect = (): Rect => ({ ...ARENA_PREP, h: ARENA_PREP.h + slideY() });
  const busy = () => roll.active || panels.length > 0;
  const prep = () => mode === 'prep';
  const cashTarget = { x: TOP.cash.x + 22, y: TOP.cash.y + TOP.cash.h / 2 };
  const gemTarget = { x: TOP.gems.x + 22, y: TOP.gems.y + TOP.gems.h / 2 };

  // for the play-check script: where the flow is, and where to tap
  if (import.meta.env.DEV) {
    Object.assign(window as object, {
      __mode: () => {
        if (roll.active) return `roll:${roll.state}`;
        const p = panels[0];
        if (p instanceof Matchmaking) return `match:${p.phase}`;
        if (p instanceof Result) return 'result';
        if (p) return 'panel';
        return mode;
      },
      __rects: { battle: BATTLE, case: CASE_BTN, elite: ELITE_BTN, stats: STATS, cont: { x: 108, y: 866, w: 324, h: 84 } },
      __opponent: () => opponent,
    });
  }

  // -------------------------------------------------------------- the guide

  const pets = () => inv.pieces.filter((p) => isPet(p.type));
  const gridPets = () => pets().filter((p) => p.slot < 0);
  const tut = () => state.tutorial;
  const starter = () => PET_INFO.sprout.name;

  function stepDone(step: number): boolean {
    const sq = inv.squads();
    switch (step) {
      case 0:
        return gridPets().length > 0;
      case 1:
        return sq.some((s) => s.weapon !== null);
      case 2:
        return sq.some((s) => s.helmet > 0 || s.sneakers > 0 || s.chili > 0);
      case 3:
        return state.matches > 0 && mode === 'prep';
      case 4:
        return state.rolled > 0 && !roll.active;
      case 5:
        return pets().some((p) => p.type === 'sprout' && p.count >= 2) || pets().some((p) => rungOf(p.type as PetType) > 1);
      default:
        return false;
    }
  }

  function advanceGuide() {
    let moved = false;
    while (tut() < TUTORIAL_DONE && stepDone(tut())) {
      state.tutorial = tut() >= 5 ? TUTORIAL_DONE : tut() + 1;
      moved = true;
    }
    if (moved) app.save();
    if (tut() !== shownStep) {
      shownStep = tut();
      stepAge = 0;
      if (tut() < TUTORIAL_DONE && t > 0.2) sfx.play('hint');
    }
  }

  /** What the guide points at now: the thing to touch and where it should go. */
  function guideTarget(): { text: string; at: Rect; to?: Rect } | null {
    const step = tut();
    if (!prep() || busy()) return null;
    const onTray = (type: string) => inv.pieces.find((p) => p.type === type && p.slot >= 0);
    const unit = gridPets()[0];
    const beside = (): Rect | undefined => {
      if (!unit) return undefined;
      const f = footprint(unit);
      for (const [dc, dr] of [[f.w, 0], [-1, 0], [0, f.h], [0, -1]]) {
        const c = unit.col + dc;
        const r = unit.row + dr;
        if (inv.isOpen(c, r) && !inv.at(c, r)) return cellRect(c, r);
      }
      return undefined;
    };
    if (step === 0) {
      const p = onTray('sprout');
      return p ? { text: `Drag your ${starter()} onto the grid`, at: homeRect(p), to: cellRect(2, 2) } : null;
    }
    if (step === 1) {
      const p = onTray('knife');
      return p ? { text: 'Put the knife right next to it', at: homeRect(p), to: beside() } : null;
    }
    if (step === 2) {
      const p = onTray('helmet');
      return p ? { text: 'And the helmet next to it too', at: homeRect(p), to: beside() } : null;
    }
    if (step === 3) return { text: 'Ready? Tap BATTLE!', at: BATTLE };
    if (step === 4) return { text: 'You earned cash. Open a CASE', at: CASE_BTN };
    if (step === 5) {
      const p = inv.pieces.find((q) => q.type === 'sprout' && q.slot >= 0);
      const mate = gridPets().find((q) => q.type === 'sprout');
      return p ? { text: `Drop the new ${starter()} on your ${starter()} to fuse them`, at: homeRect(p), to: mate ? homeRect(mate) : undefined } : null;
    }
    return null;
  }

  // -------------------------------------------------------------- changes

  function linkMid(e: LinkEdge) {
    const a = cellRect(e.c1, e.r1);
    const b = cellRect(e.c2, e.r2);
    return { x: (a.x + b.x) / 2 + CELL / 2, y: (a.y + b.y) / 2 + CELL / 2 };
  }

  /** After any change to the grid or tray: links spark, the army and power update, the guide moves, the game saves. */
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
    army = inv.army();
    power = inv.power();
    if (prep()) view.showPrep(army, null);
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
      if (res.fuse === 'evolve' && res.from && res.to) {
        const to = res.to;
        const fresh = !!res.fresh;
        panels.push(new Evolve(res.from, to, homeRect(res.piece), () => {
          if (res.piece) pops.set(res.piece.id, 0);
          fx.fuseBurst(c.x, c.y, 5);
          if (fresh) panels.push(new NewUnit(to, state, true));
        }));
      } else {
        fx.fuseBurst(c.x, c.y, isPet(res.piece.type) ? 1 + res.piece.count : res.piece.level);
        if (res.fuse === 'stack') sfx.play('stack', res.piece.count, { x: c.x });
        else sfx.play('merge', res.piece.level, { x: c.x });
      }
    } else sfx.play('drop', 0, { x: c.x });
    changed();
  }

  function tapTray(p: Piece) {
    const res = inv.autoPlace(p);
    const from = centreOf(homeRect(p));
    if (res.kind === 'denied') {
      sfx.play('denied', 0, { x: from.x });
      say(res.reason ?? 'No room on the grid');
      hops.set(p.id, 0);
      return;
    }
    hops.set((res.piece ?? p).id, 0);
    const c = centreOf(homeRect(res.piece ?? p));
    if (res.kind === 'fused' && res.piece) {
      pops.set(res.piece.id, 0);
      fx.fuseBurst(c.x, c.y, res.piece.level);
      sfx.play(res.fuse === 'stack' ? 'stack' : 'merge', res.fuse === 'stack' ? res.piece.count : res.piece.level, { x: c.x });
    } else sfx.play('drop', 0, { x: c.x });
    changed();
  }

  function sell(p: Piece) {
    const res = inv.trash(p);
    const cx = TRASH.x + TRASH.w / 2;
    const cy = TRASH.y + TRASH.h / 2;
    if (!res.ok) {
      say(res.reason ?? 'Cannot sell that');
      sfx.play('denied');
      slide = { piece: p, x: cx, y: cy, age: 0 };
      return;
    }
    fx.burst(cx, cy - 16, { colors: [UI.hiDim, UI.border, COLOR.white], n: 10, speed: 140, shape: 'shard', gravity: 500 });
    fx.floatText(cx, cy - 46, `+${res.cash}`, UI.reward, TYPE.h3);
    sfx.play('sell', res.cash, { x: cx });
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

  function buyCell(col: number, row: number) {
    const lockOf = cellLock(state, col, row);
    if (!lockOf) return;
    const r = cellRect(col, row);
    const c = centreOf(r);
    const res = unlockCell(state, col, row);
    if (!res.ok) {
      sfx.play('denied', 0, { x: c.x });
      say(res.reason ?? 'Locked');
      return;
    }
    openCellFx(col, row, 0);
    if (res.cost > 0) fx.floatText(c.x, c.y - 30, `-${res.cost}`, UI.hi, TYPE.h3);
    changed();
  }

  function openCellFx(col: number, row: number, delay: number) {
    const c = centreOf(cellRect(col, row));
    sfx.play('cellUnlock', 0, { x: c.x, delay });
    fx.ring(c.x, c.y, UI.accentLight, 10, 52, 0.4);
    fx.burst(c.x, c.y, { colors: [UI.accent, UI.accentLight, UI.reward, COLOR.white], n: 14, speed: 200, size: 6, life: 0.6, gravity: 240, shape: 'star', stagger: delay });
  }

  // -------------------------------------------------------------- the match

  /** BATTLE: find the opponent and open the matchmaking moment (it starts the fight when it lifts). */
  function battle() {
    if (!prep() || busy()) return;
    if (!gridPets().length) {
      say('Put a unit on the grid first', BATTLE.y + BATTLE.h + 30);
      sfx.play('denied');
      return;
    }
    sfx.play('click');
    const opp = findOpponent(state, matchSeed(state), army);
    opponent = opp;
    mode = 'search';
    drag = null;
    slide = null;
    pressed = null;
    idle = 0;
    panels.push(new Matchmaking(opp, army, power, state.level, () => fightOn(opp)));
  }

  /** The matchmaking moment lifts: the arena grows and the fight starts. */
  function fightOn(opp: Opponent) {
    setup = { player: army, enemy: opp.army, seed: fightSeed(state), champion: opp.champion, names: ['YOU', opp.name] };
    view.start(setup);
    mode = 'fight';
    fightCash = 0;
    koPay.length = 0;
    // the battle view rings the bell and sets the fight music
  }

  // the battle view's knock-out coins fly into the cash pill: each of theirs knocked out pays its cash coin by coin
  view.coinTarget = cashTarget;
  view.coinsOnTop = true;
  view.onKo = (team: Team, _x: number, _y: number, boss: boolean) => {
    if (team !== 1 || mode !== 'fight') return;
    const coins = boss ? 9 : 3;
    koPay.push({ value: koCash(state.level) * (boss ? REWARD.bossKo : 1), coins, left: coins });
  };
  view.onCoin = () => {
    bumps.cash = 0;
    const q = koPay[0];
    if (!q || mode !== 'fight') return;
    const each = Math.floor(q.value / q.coins);
    fightCash += q.left === 1 ? q.value - each * (q.coins - 1) : each;
    if (--q.left <= 0) koPay.shift();
  };

  function finishMatch() {
    const out = view.outcome();
    if (!out || !setup || !opponent) return;
    const mo = { ...out.match, champion: opponent.champion };
    const res = applyMatch(state, mo);
    app.save();
    mode = 'after';
    pendingCells = res.cells;
    koPay.length = 0;
    // whatever the fight's coins did not bring (the base, the streak, coins still flying) the result panel flies in
    const panel = new Result(res, opponent, res.cash - fightCash, { cash: cashTarget, gems: gemTarget }, () => backToPrep(), out.draw);
    panel.onLand = (isGem) => {
      if (isGem) bumps.gems = 0;
      else bumps.cash = 0;
    };
    result = panel;
    panels.push(panel);
    music.set(res.won ? 'victory' : 'defeat');
    advanceGuide();
  }

  function backToPrep() {
    mode = 'prep';
    setup = null;
    result = null;
    fightCash = 0;
    idle = 0;
    view.showPrep(army, null);
    music.set('lobby');
    pendingCells.forEach((c, i) => openCellFx(c.col, c.row, 0.15 + i * 0.18));
    pendingCells = [];
    advanceGuide();
  }

  // -------------------------------------------------------------- cases

  function openRoll(kind: CaseKind) {
    if (!prep() || busy()) return;
    const block = caseBlock(state, kind);
    if (block) {
      say(block);
      sfx.play('denied');
      return;
    }
    const res = openCase(state, kind);
    if (!res) return;
    app.save();
    sfx.play('click');
    roll.onDone = (r) => {
      const c = centreOf(homeRect(r.piece));
      pops.set(r.piece.id, 0);
      fx.fuseBurst(c.x, c.y, isPet(r.type) ? 1 : r.level);
      if (r.fresh && isPet(r.type)) panels.push(new NewUnit(r.type as PetType, state, false));
      changed();
    };
    roll.start(res, benchPieceRect(res.piece, res.piece.slot));
  }

  // -------------------------------------------------------------- hit tests

  const heldCentre = (d: Drag) => ({ x: d.x + d.ox, y: d.y + d.oy - DRAG_UP });

  function targetFor(p: Piece, c: { x: number; y: number }): Target | null {
    if (inRect(c.x, c.y, { x: TRAY.x - 8, y: TRAY.y - 10, w: TRAY.w + 16, h: TRAY.h + 20 })) {
      return { slot: clamp(Math.floor((c.x - TRAY.x + SLOT_GAP / 2) / (SLOT + SLOT_GAP)), 0, BENCH_SLOTS - 1) };
    }
    if (!inRect(c.x, c.y, { x: GRID_RECT.x - 20, y: GRID_RECT.y - 20, w: GRID_RECT.w + 40, h: GRID_RECT.h + 40 })) return null;
    const f = footprint(p);
    const col = clamp(Math.round((c.x - GRID_RECT.x) / CELL - f.w / 2), 0, GRID.cols - f.w);
    const row = clamp(Math.round((c.y - GRID_RECT.y) / CELL - f.h / 2), 0, GRID.rows - f.h);
    return { col, row };
  }
  function gridCellAt(x: number, y: number): { col: number; row: number } | null {
    if (!inRect(x, y, GRID_RECT)) return null;
    return { col: clamp(Math.floor((x - GRID_RECT.x) / CELL), 0, GRID.cols - 1), row: clamp(Math.floor((y - GRID_RECT.y) / CELL), 0, GRID.rows - 1) };
  }
  function pieceAt(x: number, y: number): Piece | null {
    const g = gridCellAt(x, y);
    if (g) return inv.at(g.col, g.row);
    for (let s = 0; s < BENCH_SLOTS; s++) if (inRect(x, y, benchSlotRect(s))) return inv.benchAt(s);
    return null;
  }
  function btnAt(x: number, y: number): BtnId | null {
    const order: BtnId[] = ['sound', 'auto', 'battle', 'arrange', 'stats', 'trash', 'case', 'elite'];
    for (const id of order) {
      if ((id === 'sound' || id === 'auto') && grow > 0.2) continue;
      if (id === 'battle' && (!prep() || grow > 0)) continue;
      if (LOWER.has(id) && grow > 0.01) continue;
      if (inRect(x, y, BTN[id])) return id;
    }
    return null;
  }

  function press(id: BtnId) {
    if (id === 'sound') {
      sfx.toggleMute();
      sfx.play('click');
      return;
    }
    if (id === 'auto') {
      state.auto = !state.auto;
      app.save();
      sfx.play('click');
      say(state.auto ? 'AUTO: the next match starts by itself' : 'AUTO off', ARENA_PREP.y + 260);
      return;
    }
    if (!prep()) return;
    if (id === 'battle') battle();
    else if (id === 'case') openRoll('case');
    else if (id === 'elite') openRoll('elite');
    else if (id === 'stats') panels.push(new Ladder(state, app.ratio));
    else if (id === 'trash') {
      sfx.play('click');
      say('Drag a piece here to sell it', TRASH.y - 22);
    } else if (id === 'arrange') {
      sfx.play('click');
      const res = autoArrange(inv);
      for (const p of inv.pieces) if (p.slot < 0) hops.set(p.id, -frand(0, 0.25));
      sfx.play('drop', 0, { delay: 0.12 });
      const evo = res.evolves[0];
      if (evo) {
        const made = inv.pieces.find((p) => p.type === evo.to && p.slot < 0) ?? inv.pieces.find((p) => p.type === evo.to);
        if (made) panels.push(new Evolve(evo.from, evo.to, homeRect(made), () => { if (evo.fresh) panels.push(new NewUnit(evo.to, state, true)); }));
      }
      changed();
    }
  }

  // -------------------------------------------------------------- drawing: the top bar

  /** A top-bar pill, exactly as v4 drew cash and gems: a warm white pill, the icon at the left, the number in a well. */
  function pillBase(ctx: Ctx, r: Rect) {
    rr(ctx, r.x, r.y + 2, r.w, r.h, r.h / 2);
    ctx.fillStyle = PILL.shadow;
    ctx.fill();
    rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fillStyle = PILL.fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = PILL.edge;
    ctx.stroke();
  }

  function topPill(ctx: Ctx, r: Rect, icon: (c: Ctx, x: number, y: number, s: number) => void, value: number, key: string, bump: number) {
    // a coin landing gives the pill a small pop
    const pop = bump >= 0 && bump < 0.35 ? 1 + 0.08 * Math.sin((bump / 0.35) * Math.PI) : 1;
    ctx.save();
    if (pop !== 1) {
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(pop, pop);
      ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    }
    pillBase(ctx, r);
    // the number sits in a recessed window, the icon on the left
    const wr = { x: r.x + 40, y: r.y + 6, w: r.w - 46, h: r.h - 12 };
    rr(ctx, wr.x, wr.y, wr.w, wr.h, wr.h / 2);
    ctx.fillStyle = PILL.well;
    ctx.fill();
    icon(ctx, r.x + 22, r.y + r.h / 2, 26);
    const shown = tickTo(key, value);
    fitLabel(ctx, formatPower(shown), wr.x + wr.w / 2, r.y + r.h / 2 + 1, TYPE.h3, wr.w - 12, { weight: 700, color: shown !== value ? PILL.moving : PILL.text });
    ctx.restore();
  }

  /** LEVEL n with its XP bar, in the same pill: a gold star with the level at the left, the XP filling the well. */
  function levelPill(ctx: Ctx) {
    const r = TOP.level;
    const lp = result ? { ...result.shown } : (() => {
      const p = levelProgress(state);
      return { level: p.level, share: p.share };
    })();
    pillBase(ctx, r);
    const wr = { x: r.x + 44, y: r.y + 7, w: r.w - 52, h: r.h - 14 };
    rr(ctx, wr.x, wr.y, wr.w, wr.h, wr.h / 2);
    ctx.fillStyle = PILL.well;
    ctx.fill();
    const fill = tickTo('top:xp', Math.round(lp.share * 1000), 6) / 1000;
    if (fill > 0.001) {
      ctx.save();
      rr(ctx, wr.x, wr.y, wr.w, wr.h, wr.h / 2);
      ctx.clip();
      progressBar(ctx, { x: wr.x, y: wr.y, w: wr.w, h: wr.h }, fill, { color: PILL.xp, back: PILL.well, light: 'rgba(255, 255, 255, 0.5)' });
      ctx.restore();
    }
    label(ctx, `LEVEL ${lp.level}`, wr.x + wr.w / 2, r.y + r.h / 2 + 1, TYPE.lead, { weight: 700, color: PILL.text, track: 1.5 });
    // the star badge
    const sx = r.x + 24;
    const sy = r.y + r.h / 2;
    star(ctx, sx, sy + 1, 46, '#e6a92c');
    star(ctx, sx, sy, 44, PILL.xp);
    label(ctx, String(lp.level), sx, sy + 3, lp.level >= 10 ? TYPE.caption : TYPE.lead, { weight: 700, color: '#6b4a0c', track: 0 });
  }

  function drawTopBar(ctx: Ctx) {
    // the deep band behind the bar
    const g = ctx.createLinearGradient(0, 0, 0, ARENA_PREP.y);
    g.addColorStop(0, UI.bgTop);
    g.addColorStop(1, UI.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, ARENA_PREP.y);
    const held = result ? result.heldCash : 0;
    const shownCash = state.cash + (mode === 'fight' ? fightCash : 0) - held;
    topPill(ctx, TOP.cash, (c, x, y, s) => cash(c, x, y, s), shownCash, 'top:cash', bumps.cash);
    topPill(ctx, TOP.gems, (c, x, y, s) => gem(c, x, y, s), state.gems - (result ? result.heldGems : 0), 'top:gems', bumps.gems);
    levelPill(ctx);
  }

  /** a small square button over the arena's corner: its glyph, and a word under it inside the button */
  function cornerBtn(ctx: Ctx, id: BtnId, icon: (c: Ctx, x: number, y: number, s: number, color?: string) => void, on: boolean, word?: string) {
    const r = BTN[id];
    const cy = button(ctx, r, { variant: on ? 'secondary' : 'quiet', text: '', pressed: pressed === id });
    const ink = on ? UI.hi : UI.hiMute;
    if (word) {
      icon(ctx, r.x + r.w / 2, cy - 7, 22, ink);
      label(ctx, word, r.x + r.w / 2, cy + 14, TYPE.tag, { weight: 700, color: ink, track: 1 });
    } else icon(ctx, r.x + r.w / 2, cy, 26, ink);
  }

  // -------------------------------------------------------------- drawing: the arena

  function drawArena(ctx: Ctx) {
    const r = arenaRect();
    setView(r);
    ctx.save();
    rr(ctx, r.x, r.y - 20, r.w, r.h + 20, 22);
    ctx.clip();
    ctx.translate(fx.camera.x, fx.camera.y);
    view.render(ctx);
    ctx.restore();
    // a soft edge where the arena meets the page
    const g = ctx.createLinearGradient(0, r.y + r.h - 14, 0, r.y + r.h);
    g.addColorStop(0, 'rgba(16, 10, 40, 0)');
    g.addColorStop(1, 'rgba(16, 10, 40, 0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, r.y + r.h - 14, W, 14);
    const top = ctx.createLinearGradient(0, r.y, 0, r.y + 12);
    top.addColorStop(0, 'rgba(16, 10, 40, 0.4)');
    top.addColorStop(1, 'rgba(16, 10, 40, 0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, r.y, W, 12);
  }

  /** The prep overlay: the big BATTLE button, CHAMPION MATCH over it when the next is one, the win streak under it. */
  function drawBattle(ctx: Ctx) {
    if (!prep() || busy() || grow > 0) return;
    const intro = easeOutCubic(clamp(battleAge / 0.3, 0, 1));
    const champ = matchesToChampion(state) === 0;
    const autoK = state.auto && tut() >= TUTORIAL_DONE ? clamp(idle / AUTO_START, 0, 1) : 0;
    ctx.save();
    ctx.globalAlpha *= intro;
    const cx = BATTLE.x + BATTLE.w / 2;
    const cyb = BATTLE.y + BATTLE.h / 2;
    // the button breathes a little, so it calls to be pressed
    const beat = 1 + 0.025 * Math.max(0, Math.sin(t * 3.2)) ** 2;
    const sc = (0.85 + 0.15 * easeOutBack(clamp(battleAge / 0.3, 0, 1))) * beat;
    ctx.translate(cx, cyb);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cyb);
    if (champ) {
      // a gold glow and a crown banner: CHAMPION MATCH
      const gg = ctx.createRadialGradient(cx, cyb, 40, cx, cyb, 230);
      gg.addColorStop(0, 'rgba(255, 210, 90, 0.45)');
      gg.addColorStop(1, 'rgba(255, 210, 90, 0)');
      ctx.fillStyle = gg;
      ctx.fillRect(cx - 240, cyb - 200, 480, 400);
    }
    // with nobody on the grid it waits, greyed (the guide's first steps)
    const ready = gridPets().length > 0;
    const o: ButtonOpts = { variant: 'primary', text: '', pressed: pressed === 'battle', breathe: ready ? t : undefined, pulse: tut() === 3 ? (t * 1.1) % 1 : 0, disabled: !ready };
    const cy = button(ctx, BATTLE, o);
    const look = buttonLook('primary');
    const ink = ready ? '#ffffff' : '#9a90c6';
    fight(ctx, cx - 92, cy - 6, 40, ink);
    dropLabel(ctx, 'BATTLE', cx + 22, cy - 10, TYPE.title, BATTLE.w - 120, { color: ink, drop: ready ? look.drop : '', track: 3 });
    const pw = `POWER ${formatPower(power)}`;
    const tw = textWidth(ctx, pw, TYPE.caption, 700, 1.5);
    bolt(ctx, cx + 22 - tw / 2 - 12, cy + 26, 15, ready ? 'rgba(255, 255, 255, 0.85)' : ink);
    label(ctx, pw, cx + 22 + 6, cy + 27, TYPE.caption, { weight: 700, color: ready ? 'rgba(255, 255, 255, 0.9)' : ink, track: 1.5 });
    if (autoK > 0) {
      // AUTO: a ring fills round the button's corner
      const ax = BATTLE.x + BATTLE.w - 10;
      const ay = BATTLE.y + 10;
      ctx.beginPath();
      ctx.arc(ax, ay, 15, 0, Math.PI * 2);
      ctx.fillStyle = UI.surfaceAlt;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.arc(ax, ay, 12, -Math.PI / 2, -Math.PI / 2 + autoK * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = UI.accentLight;
      ctx.fill();
    }
    if (champ) {
      const by = BATTLE.y - 34;
      const text = 'CHAMPION MATCH';
      const w = textWidth(ctx, text, TYPE.h3, 700, 2) + 76;
      rr(ctx, cx - w / 2, by - 20 + 4, w, 40, 20);
      ctx.fillStyle = '#8a5a08';
      ctx.fill();
      const bg = ctx.createLinearGradient(0, by - 20, 0, by + 20);
      bg.addColorStop(0, '#ffe08a');
      bg.addColorStop(1, '#f2a92e');
      rr(ctx, cx - w / 2, by - 20, w, 40, 20);
      ctx.fillStyle = bg;
      ctx.fill();
      crown(ctx, cx - w / 2 + 28, by - 1, 26, '#ffffff');
      dropLabel(ctx, text, cx + 14, by + 1, TYPE.h3, w - 60, { drop: 'rgba(130, 70, 0, 0.85)', track: 2 });
    }
    ctx.restore();
    // under the button, on the pitch: the streak, x2 rewards, or what to do
    const ly = BATTLE.y + BATTLE.h + 26;
    ctx.save();
    ctx.globalAlpha *= intro;
    if (!gridPets().length) {
      if (tut() >= TUTORIAL_DONE) label(ctx, 'Drag a unit onto the grid to field it', W / 2, ly, TYPE.body, { weight: 700, color: '#ffffff', onPitch: true });
    }
    else if (state.streak >= 2 || champ) {
      const text = champ ? 'BEAT THE CHAMPION FOR x2 REWARDS' : `${state.streak} WIN STREAK!  +BONUS CASH`;
      const w = textWidth(ctx, text, TYPE.body, 700, 1.5) + (champ ? 40 : 64);
      rr(ctx, W / 2 - w / 2, ly - 17, w, 34, 17);
      ctx.fillStyle = 'rgba(24, 16, 52, 0.78)';
      ctx.fill();
      if (!champ) flame(ctx, W / 2 - w / 2 + 24, ly, 24);
      label(ctx, text, W / 2 + (champ ? 0 : 14), ly + 1, TYPE.body, { weight: 700, color: champ ? UI.rewardLight : '#ffc58a', track: 1.5 });
    } else label(ctx, 'Find a matched opponent and fight!', W / 2, ly, TYPE.body, { weight: 700, color: '#ffffff', onPitch: true });
    ctx.restore();
  }

  // -------------------------------------------------------------- drawing: the grid, tray and buttons

  function drawLink(ctx: Ctx, e: LinkEdge) {
    const m = linkMid(e);
    const horiz = e.r1 === e.r2;
    const w = horiz ? 9 : 22;
    const h = horiz ? 22 : 9;
    rr(ctx, m.x - w / 2 - 1.5, m.y - h / 2 - 0.5, w + 3, h + 3, 5);
    ctx.fillStyle = e.active ? '#a8700f' : '#241d4b';
    ctx.fill();
    rr(ctx, m.x - w / 2, m.y - h / 2, w, h, 4.5);
    ctx.fillStyle = e.active ? COLOR.joint : '#5d519e';
    ctx.fill();
  }

  function tileOf(ctx: Ctx, p: Piece, r: Rect, idleTile: boolean) {
    let y = r.y;
    const h = hops.get(p.id);
    if (h !== undefined && h >= 0) y -= Math.sin(clamp(h / 0.35, 0, 1) * Math.PI) * 12;
    const pa = pops.get(p.id);
    const pop = pa !== undefined ? 1 + 0.4 * (1 - easeOutElastic(clamp(pa / 0.6, 0, 1))) : 1;
    const ta = turns.get(p.id);
    const tr = inset({ x: r.x, y, w: r.w, h: r.h }, 3);
    if (ta !== undefined) {
      const k = easeOutBack(clamp(ta / TURN_TIME, 0, 1));
      const c = centreOf(tr);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((1 - k) * (p.turned ? -Math.PI / 2 : Math.PI / 2));
      ctx.translate(-c.x, -c.y);
      drawPiece(ctx, p, tr, { idle: idleTile, t, pop });
      ctx.restore();
      return;
    }
    drawPiece(ctx, p, tr, { idle: idleTile, t, pop });
  }

  function hoverCells(p: Piece, tg: Target): { cells: { col: number; row: number }[]; slot: number; state: 'ok' | 'bad' | 'fuse' } {
    const pv = inv.preview(p, tg);
    const st = pv.kind === 'fused' ? 'fuse' : pv.kind === 'denied' ? 'bad' : 'ok';
    if ('slot' in tg) return { cells: [], slot: tg.slot, state: st };
    if (pv.kind === 'fused' && pv.piece && pv.piece.slot < 0) return { cells: cellsOf(pv.piece), slot: -1, state: st };
    const f = footprint(p);
    return { cells: shapeCells(f.w, f.h, tg.col, tg.row).filter((c) => c.col < GRID.cols && c.row < GRID.rows), slot: -1, state: st };
  }

  function drawLocked(ctx: Ctx, col: number, row: number) {
    const pr = cellProgress(state, col, row);
    if (!pr) return;
    const r = inset(cellRect(col, row), 4);
    rr(ctx, r.x, r.y, r.w, r.h, S.radius.m);
    ctx.fillStyle = '#251e4c';
    ctx.fill();
    const cx = r.x + r.w / 2;
    const dim = '#7f73b8';
    if (pr.lock.kind === 'cash') {
      const can = state.cash >= pr.need;
      ctx.save();
      rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, S.radius.m - 1);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = can ? UI.accent : '#4f4590';
      ctx.stroke();
      ctx.restore();
      lock(ctx, cx, r.y + 18, 18, can ? UI.accentLight : dim);
      cash(ctx, cx - 14, r.y + r.h - 18, 18);
      label(ctx, String(pr.need), cx + 8, r.y + r.h - 17, TYPE.body, { weight: 700, color: can ? UI.accentLight : UI.hiDim, track: 0 });
    } else if (pr.lock.kind === 'level') {
      lock(ctx, cx, r.y + 18, 18, dim);
      fitLabel(ctx, `LEVEL ${pr.need}`, cx, r.y + r.h - 18, TYPE.small, r.w - 6, { weight: 700, color: UI.hiDim, track: 0.5 });
    } else {
      koStar(ctx, cx, r.y + 17, 18, dim);
      fitLabel(ctx, `${Math.min(pr.have, pr.need)}/${pr.need}`, cx, r.y + r.h / 2 + 4, TYPE.small, r.w - 8, { weight: 700, color: UI.hiDim, track: 0 });
      progressBar(ctx, { x: r.x + 8, y: r.y + r.h - 13, w: r.w - 16, h: 6 }, pr.have / pr.need, { color: UI.reward, back: '#1a1438' });
    }
  }

  function drawBoard(ctx: Ctx) {
    const lifted = drag?.moved ? drag.piece : null;
    const hidden = lifted ?? slide?.piece ?? null;
    const tg = lifted && drag ? targetFor(lifted, heldCentre(drag)) : null;
    const hov = lifted && tg ? hoverCells(lifted, tg) : null;
    gridFrame(ctx, GRID_RECT);
    for (let r = 0; r < GRID.rows; r++)
      for (let c = 0; c < GRID.cols; c++) {
        if (!inv.isOpen(c, r)) {
          drawLocked(ctx, c, r);
          continue;
        }
        const tint = hov && hov.cells.some((q) => q.col === c && q.row === r) ? hov.state : 'empty';
        cell(ctx, cellRect(c, r), tint);
      }
    // the guide's destination
    const g = !drag && tut() < TUTORIAL_DONE ? guideTarget() : null;
    if (g?.to) {
      const a = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.save();
      rr(ctx, g.to.x + 5, g.to.y + 5, g.to.w - 10, g.to.h - 10, S.radius.m);
      ctx.globalAlpha = 0.16 + 0.14 * a;
      ctx.fillStyle = UI.accent;
      ctx.fill();
      ctx.globalAlpha = 0.6 + 0.4 * a;
      ctx.lineWidth = 3;
      ctx.strokeStyle = UI.accentLight;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.restore();
    }
    const onGrid = inv.pieces.filter((p) => p.slot < 0 && p !== hidden).sort((a, b) => a.row - b.row || a.col - b.col);
    for (const p of onGrid) tileOf(ctx, p, homeRect(p), !isPet(p.type) && inv.servedBy(p).length === 0);
    for (const e of links) if (!e.active) drawLink(ctx, e);
    for (const e of links) if (e.active) drawLink(ctx, e);
    // the tray
    gridFrame(ctx, { x: TRAY.x + 2, y: TRAY.y + 2, w: TRAY.w - 4, h: TRAY.h - 4 });
    for (let s = 0; s < BENCH_SLOTS; s++) cell(ctx, benchSlotRect(s), hov && hov.slot === s ? hov.state : 'empty');
    for (const p of inv.pieces) if (p.slot >= 0 && p !== hidden && p.id !== roll.hiddenId) tileOf(ctx, p, homeRect(p), false);
  }

  /** The POWER tab on the grid frame's top edge (its v4 look, kept). */
  function drawPowerTab(ctx: Ctx) {
    const r = POWER_TAB;
    ctx.beginPath();
    ctx.moveTo(r.x - 14, r.y + r.h + 12);
    ctx.lineTo(r.x + 4, r.y + 4);
    ctx.quadraticCurveTo(r.x + 6, r.y, r.x + 12, r.y);
    ctx.lineTo(r.x + r.w - 12, r.y);
    ctx.quadraticCurveTo(r.x + r.w - 6, r.y, r.x + r.w - 4, r.y + 4);
    ctx.lineTo(r.x + r.w + 14, r.y + r.h + 12);
    ctx.closePath();
    ctx.fillStyle = '#4b535d';
    ctx.fill();
    const shown = tickTo('power', power);
    bolt(ctx, r.x + 34, r.y + r.h / 2 + 2, 22, '#cfe3dc');
    fitLabel(ctx, formatPower(shown), r.x + r.w / 2 + 12, r.y + r.h / 2 + 3, TYPE.h2, r.w - 70, { weight: 700, color: shown !== power ? '#f1e3bf' : '#ffffff', track: 1 });
  }

  function caseButton(ctx: Ctx, id: 'case' | 'elite') {
    const kind: CaseKind = id;
    const r = BTN[id];
    const price = casePrice(state, kind);
    const can = kind === 'case' ? state.cash >= price : state.gems >= price;
    const cy = button(ctx, r, { variant: kind, text: '', pressed: pressed === id, pulse: id === 'case' && tut() === 4 ? (t * 1.1) % 1 : 0 });
    const look = buttonLook(kind);
    const title = id === 'case' ? 'CASE' : 'ELITE';
    const sub = id === 'case' ? `A+ IN ${Math.max(1, PITY - state.pity)}` : 'NO E-CLASS';
    const left = r.x + 20;
    dropLabel(ctx, title, left, cy - 9, TYPE.h2 + 4, 120, { align: 'left', drop: look.drop, track: 2 });
    label(ctx, sub, left, cy + 18, TYPE.tag, { align: 'left', weight: 700, color: 'rgba(255, 255, 255, 0.88)', track: 1.2 });
    // the price on a dark chip at the right
    const cw = id === 'case' ? 104 : 78;
    const chip = { x: r.x + r.w - cw - 12, y: cy - 19, w: cw, h: 38 };
    rr(ctx, chip.x, chip.y, chip.w, chip.h, 19);
    ctx.fillStyle = 'rgba(30, 14, 50, 0.32)';
    ctx.fill();
    if (id === 'case') cash(ctx, chip.x + 22, chip.y + 19, 24);
    else gem(ctx, chip.x + 20, chip.y + 19, 22, '#e7dcff');
    dropLabel(ctx, String(price), chip.x + chip.w / 2 + 14, chip.y + 20, TYPE.h3, chip.w - 40, { color: can ? '#ffffff' : '#ffd0c8', drop: look.drop });
  }

  function drawLower(ctx: Ctx) {
    const dy = slideY();
    ctx.save();
    ctx.translate(0, dy);
    drawPowerTab(ctx);
    drawBoard(ctx);
    const overTrash = !!drag?.moved && inRect(drag.x, drag.y, TRASH);
    button(ctx, STATS, { variant: 'secondary', icon: bars, pressed: pressed === 'stats' });
    button(ctx, TRASH, { variant: overTrash ? 'danger' : 'quiet', icon: trash, pressed: pressed === 'trash' || overTrash });
    if (drag?.moved) {
      const v = inv.sellValue(drag.piece);
      label(ctx, `SELL +${v}`, TRASH.x + TRASH.w / 2, TRASH.y - 12, TYPE.caption, { weight: 700, color: overTrash ? UI.danger : UI.hiDim, track: 1 });
    }
    caseButton(ctx, 'case');
    caseButton(ctx, 'elite');
    button(ctx, ARRANGE, { variant: 'quiet', icon: wand, pressed: pressed === 'arrange' });
    if (grow > 0) {
      ctx.fillStyle = `rgba(20, 14, 46, ${(0.6 * clamp(grow * 1.5, 0, 1)).toFixed(3)})`;
      ctx.fillRect(0, POWER_TAB.y - 4, W, H);
    }
    ctx.restore();
  }

  function drawCard(ctx: Ctx, p: Piece) {
    const r = CARD;
    rr(ctx, r.x, r.y + 4, r.w, r.h, S.radius.l);
    ctx.fillStyle = 'rgba(8, 4, 24, 0.45)';
    ctx.fill();
    rr(ctx, r.x, r.y, r.w, r.h, S.radius.l);
    ctx.fillStyle = UI.glass;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(150, 130, 230, 0.5)';
    ctx.stroke();
    const x0 = r.x + 20;
    const pet = isPet(p.type);
    let nameX = x0;
    if (pet) {
      rungBadge(ctx, rungOf(p.type as PetType), x0, r.y + 30, 1);
      nameX += 36;
    } else {
      classBadge(ctx, p.level, x0, r.y + 30, 1, t);
      nameX += classBadgeSize(p.level, 1).w + 10;
    }
    label(ctx, PIECE_NAME[p.type].toUpperCase() + (pet && p.count > 1 ? ` x${p.count}` : ''), nameX, r.y + 31, TYPE.h3, { align: 'left', weight: 700, track: 1.5, color: UI.hi });
    label(ctx, pet ? `RUNG ${rungOf(p.type as PetType)} OF 12` : cls(p.level).toUpperCase(), r.x + r.w - 20, r.y + 31, TYPE.caption, { align: 'right', color: pet ? UI.hiDim : classColorOnDark(p.level, t), weight: 700, track: 1.5 });
    let desc = PIECE_DESC[p.type];
    if (isGear(p.type)) desc = desc.replace('{v}', String(gearPct(p.type, p.level)));
    fitLabel(ctx, desc, x0, r.y + 62, TYPE.body, r.w - 40, { align: 'left', color: UI.hi });
    const tg = drag ? targetFor(p, heldCentre(drag)) : null;
    const pv = tg ? inv.preview(p, tg) : null;
    let tip = 'Drop on an identical piece to fuse';
    if (pv?.kind === 'fused') tip = pv.fuse === 'evolve' ? `Evolves into ${PIECE_NAME[pv.to ?? p.type]}!` : pv.fuse === 'stack' ? `Fuses into ${p.count * 2} ${PIECE_NAME[p.type]}s` : `Fuses to ${cls(p.level + 1)}`;
    else if (pv?.kind === 'denied' && pv.reason) tip = pv.reason === LOCKED ? 'That cell is locked: tap it to see how it opens' : pv.reason;
    else if (pet && tg && !('slot' in tg)) tip = p.count === 2 ? 'Touch weapons and gear. Tap it to turn it' : 'Two x4 squads evolve into the next unit';
    else if (!pet) tip = 'Put it right next to a unit';
    fitLabel(ctx, tip, x0, r.y + 90, TYPE.caption, r.w - 40, { align: 'left', color: pv?.kind === 'fused' ? UI.reward : pv?.kind === 'denied' ? '#ff9c94' : UI.hiDim, weight: 700 });
  }

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
    const col = hov.state === 'fuse' ? UI.reward : hov.state === 'bad' ? UI.danger : UI.ok;
    ctx.save();
    rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, S.radius.m + 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = col;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -t * 30;
    ctx.stroke();
    ctx.restore();
  }

  function drawGuide(ctx: Ctx) {
    if (tut() >= TUTORIAL_DONE || drag?.moved || grow > 0) return;
    const g = guideTarget();
    if (!g) return;
    const a = clamp(stepAge / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    const pr = 1 + 0.04 * Math.sin(t * 5);
    const cx = g.at.x + g.at.w / 2;
    const cy = g.at.y + g.at.h / 2;
    rr(ctx, cx - (g.at.w / 2) * pr - 4, cy - (g.at.h / 2) * pr - 4, g.at.w * pr + 8, g.at.h * pr + 8, S.radius.l);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    const sc = 0.92 + 0.08 * easeOutCubic(clamp(stepAge / 0.25, 0, 1));
    const hr = tut() === 3 ? { x: 84, y: BATTLE.y - HINT.h - 22, w: W - 168, h: HINT.h } : HINT;
    ctx.translate(W / 2, hr.y + hr.h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -(hr.y + hr.h / 2));
    // point at the target's near edge, so the arrow never sits on its words
    const py = hr.y + hr.h <= g.at.y ? g.at.y : hr.y >= g.at.y + g.at.h ? g.at.y + g.at.h : cy;
    hint(ctx, hr, g.text, { x: cx, y: py }, t);
    ctx.restore();
  }

  // -------------------------------------------------------------- the screen

  return {
    enter() {
      music.set('lobby');
      fx.clear();
      links = inv.links();
      army = inv.army();
      power = inv.power();
      view.showPrep(army, null);
      shownStep = -1;
      // cells already earned (a migrated save's level, its knock-outs) open now, with their little party
      const earned = openEarned(state);
      if (earned.length) {
        app.save();
        earned.forEach((c, i) => openCellFx(c.col, c.row, 0.5 + i * 0.18));
      }
      advanceGuide();
      if (opts.freshStart) say(FRESH_START_TOAST, ARENA_PREP.y + 290, 4);
      else if (opts.migrated) say(MIGRATED_TOAST, ARENA_PREP.y + 290, 4.5);
    },
    update(dt) {
      t += dt;
      stepAge += dt;
      fx.update(dt);
      roll.update(dt);
      view.update(dt);
      for (const o of panels.slice(0, 1)) o.update(dt);
      while (panels.length && panels[0].done) panels.shift();
      for (const [id, a] of pops) a + dt > 0.7 ? pops.delete(id) : pops.set(id, a + dt);
      for (const [id, a] of hops) a + dt > 0.4 ? hops.delete(id) : hops.set(id, a + dt);
      for (const [id, a] of turns) a + dt > TURN_TIME ? turns.delete(id) : turns.set(id, a + dt);
      for (const q of toasts) q.age += dt;
      for (let i = toasts.length - 1; i >= 0; i--) if (toasts[i].age > toasts[i].life) toasts.splice(i, 1);
      bumps.cash += dt;
      bumps.gems += dt;
      if (slide) {
        slide.age += dt;
        if (slide.age >= SLIDE_BACK) slide = null;
      }
      // the arena grows for the fight and shrinks back behind the result panel
      const goal = mode === 'fight' ? 1 : 0;
      grow = goal > grow ? Math.min(1, grow + dt / GROW_TIME) : Math.max(0, grow - dt / GROW_TIME);
      if (mode === 'fight' && view.outcome()) finishMatch();
      // AUTO: the next match starts after a few untouched seconds of prep
      if (prep() && !busy() && grow === 0) battleAge += dt;
      else battleAge = 0;
      if (prep() && state.auto && !busy() && !drag && tut() >= TUTORIAL_DONE && grow === 0) {
        idle += dt;
        if (idle >= AUTO_START) battle();
      } else idle = 0;
      advanceGuide();
    },
    render(ctx) {
      ctx.fillStyle = UI.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      drawArena(ctx);
      drawLower(ctx);
      fx.drawUnder(ctx);
      drawBattle(ctx);
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
      // the corner buttons step aside while the fight's own HUD (the tug bar) is up
      const ca = 1 - clamp(grow * 3, 0, 1);
      if (ca > 0) {
        ctx.save();
        ctx.globalAlpha *= ca;
        cornerBtn(ctx, 'sound', (c, x, y, s, col) => speaker(c, x, y, s, sfx.muted, col), !sfx.muted);
        cornerBtn(ctx, 'auto', cycle, state.auto, 'AUTO');
        ctx.restore();
      }
      if (drag?.moved) {
        drawCard(ctx, drag.piece);
        const c = heldCentre(drag);
        const f = footprint(drag.piece);
        const w = (CELL * f.w - 6) * DRAG_LIFT;
        const h = (CELL * f.h - 6) * DRAG_LIFT;
        ctx.save();
        ctx.globalAlpha = 0.85;
        drawPiece(ctx, drag.piece, { x: c.x - w / 2, y: c.y - h / 2, w, h }, { t, lifted: true });
        ctx.restore();
        drawLanding(ctx, drag);
      }
      drawGuide(ctx);
      for (const q of toasts) toast(ctx, q.text, q.x, q.y, Math.min(q.age, 0.9 + Math.max(0, q.age - (q.life - 0.5))));
      view.renderCoins(ctx);
      ctx.restore();
      if (panels.length) {
        const p = panels[0];
        p.render(ctx, t);
        // the result panel keeps the top bar lit: its coins land in the real pills
        if (p instanceof Result) drawTopBar(ctx);
      }
      roll.render(ctx, t);
      fx.drawScreen(ctx);
    },
    pointerDown(x, y) {
      idle = 0;
      if (roll.active) return;
      if (panels.length) {
        panels[0].down?.(x, y);
        return;
      }
      if (drag) return;
      const b = btnAt(x, y);
      if (b) {
        pressed = b;
        return;
      }
      if (!prep() || grow > 0) return;
      const p = pieceAt(x, y);
      if (p && p !== slide?.piece) {
        const c = centreOf(homeRect(p));
        const grip = p.slot < 0 ? { ox: c.x - x, oy: c.y - y + DRAG_UP } : { ox: 0, oy: 0 };
        drag = { piece: p, x, y, sx: x, sy: y, ...grip, moved: false };
        sfx.play('pick', 0, { x });
        return;
      }
      const g = gridCellAt(x, y);
      downCell = g && !inv.isOpen(g.col, g.row) ? g : null;
    },
    pointerMove(x, y) {
      if (pressed && !inRect(x, y, BTN[pressed])) pressed = null;
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 8) {
        drag.moved = true;
        drag.ox *= 0.5;
        drag.oy *= 0.5;
      }
    },
    pointerUp(x, y) {
      idle = 0;
      if (roll.active) {
        roll.tap();
        return;
      }
      if (panels.length) {
        panels[0].up?.(x, y);
        return;
      }
      if (pressed) {
        const id = pressed;
        pressed = null;
        if (inRect(x, y, BTN[id])) press(id);
        return;
      }
      if (downCell) {
        const g = gridCellAt(x, y);
        const dc = downCell;
        downCell = null;
        if (g && g.col === dc.col && g.row === dc.row) buyCell(g.col, g.row);
        return;
      }
      const d = drag;
      drag = null;
      if (!d) return;
      d.x = x;
      d.y = y;
      if (!d.moved) {
        if (d.piece.slot >= 0) tapTray(d.piece);
        else if (isPet(d.piece.type) && d.piece.count === 2) turn(d.piece);
        else {
          hops.set(d.piece.id, 0);
          sfx.play('hop', 0, { x });
        }
        return;
      }
      if (inRect(x, y, TRASH)) {
        sell(d.piece);
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
      downCell = null;
    },
    resize() {
      /* the arena rebuilds its own caches (app.ts calls arena.build) */
    },
  };
}
