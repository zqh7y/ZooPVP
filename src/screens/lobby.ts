import { music, sfx } from '../audio/engine';
import {
  AUTO_START, BENCH_SLOTS, GRID, PIECE_DESC, PIECE_NAME, PITY, TUTORIAL_DONE, WAVES,
  cls, footprint, formatPower, gearPct, isGear, isPet, koCash, rungOf,
} from '../data';
import { setView } from '../draw/camera';
import { Fx } from '../draw/fx';
import { bars, bolt, cash, cycle, gem, koStar, lock, speaker, trash, wand } from '../draw/icons';
import { drawPiece } from '../draw/pieces';
import {
  button, cell, classBadge, classBadgeSize, classColor, fitLabel, gridFrame, hint, progressBar, rungBadge, scoreBug,
  tickTo, toast, type ButtonOpts,
} from '../draw/ui';
import { autoArrange } from '../logic/auto';
import { LOCKED, cellsOf, shapeCells, type Target } from '../logic/inventory';
import { applyWave, cellLock, cellProgress, unlockCell } from '../logic/progress';
import { caseBlock, casePrice, openCase } from '../logic/rolls';
import { FRESH_START_TOAST } from '../logic/save';
import { fightSeed, nextWave, stageBoss, type WaveInfo } from '../logic/waves';
import { frand } from '../rng';
import type { App, Screen } from '../screen';
import { COLOR, H, S, TEAM, TYPE, UI, W } from '../theme';
import type { ArmySpec, CaseKind, LinkEdge, PetType, Piece, WaveResult } from '../types';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, easeOutElastic, inRect, label, rr, type Ctx, type Rect } from '../util';
import { BattleView, type WaveSetup } from './battle';
import { Defeat, Evolve, Ladder, NewUnit, StageClear, WaveClear, drawUnit, type Overlay } from './panels';
import { RollOverlay } from './roll';

/*
 * The one main screen, like Bunny Brigade's, in ZooPVP's own look. Top to bottom: the top bar (cash, the WAVE m/10
 * bar with the stage boss's head at its end, gems; the STAGE n tab under it), the arena (it owns the battle view:
 * during prep a short view with your army in its rows and START WAVE over it; in a wave the view grows to most of the
 * screen while the grid slides down, locked, and it shrinks back when the outcome is in), then the power tab, the
 * 5 x 5 grid with its locked cells, the tray between the stats button and TRASH, and CASE / ELITE. The roll and every
 * panel are overlays on it.
 */

// ------------------------------------------------------------------ layout

export const ARENA_PREP: Rect = { x: 0, y: 90, w: W, h: 470 };
export const ARENA_FIGHT: Rect = { x: 0, y: 90, w: W, h: 930 };
/** how far the lower part (grid, tray, cases) slides down while a wave is fought */
const SLIDE = ARENA_FIGHT.h - ARENA_PREP.h;
const GROW_TIME = 0.75;

const TOP = {
  cash: { x: 12, y: 14, w: 128, h: 44 },
  wave: { x: 150, y: 14, w: 240, h: 44 },
  gems: { x: 400, y: 14, w: 128, h: 44 },
} satisfies Record<string, Rect>;
const STAGE_TAB: Rect = { x: 205, y: 56, w: 120, h: 30 };
const SOUND: Rect = { x: 12, y: 102, w: 54, h: 52 };
const AUTO: Rect = { x: 474, y: 102, w: 54, h: 52 };
const START: Rect = { x: 130, y: 230, w: 280, h: 92 };
const HUD: Rect = { x: 76, y: 104, w: 388, h: 44 };

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
const HINT: Rect = { x: 40, y: 160, w: W - 80, h: 58 };

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

type BtnId = 'sound' | 'auto' | 'start' | 'stats' | 'trash' | 'case' | 'elite' | 'arrange';
const BTN: Record<BtnId, Rect> = { sound: SOUND, auto: AUTO, start: START, stats: STATS, trash: TRASH, case: CASE_BTN, elite: ELITE_BTN, arrange: ARRANGE };
/** buttons in the lower part (they slide with the grid) */
const LOWER: ReadonlySet<BtnId> = new Set(['stats', 'trash', 'case', 'elite', 'arrange']);

interface Drag { piece: Piece; x: number; y: number; sx: number; sy: number; ox: number; oy: number; moved: boolean }
interface Slide { piece: Piece; x: number; y: number; age: number }
interface Toast { text: string; x: number; y: number; age: number; life: number }
type Mode = 'prep' | 'fight' | 'after';

export function createLobby(app: App, opts: { freshStart?: boolean } = {}): Screen {
  const inv = app.inv;
  const state = app.state;
  const fx = new Fx();
  const view = new BattleView(app);
  const roll = new RollOverlay();
  let t = 0;
  let mode: Mode = 'prep';
  let grow = 0; // 0 = the prep view, 1 = the wave view
  let setup: WaveSetup | null = null;
  let drag: Drag | null = null;
  let slide: Slide | null = null;
  let pressed: BtnId | null = null;
  let downCell: { col: number; row: number } | null = null;
  let idle = 0; // seconds of untouched prep (AUTO)
  let startAge = 0; // seconds START WAVE has been showing
  let lastKills = 0;
  const pops = new Map<number, number>();
  const hops = new Map<number, number>();
  const turns = new Map<number, number>();
  const toasts: Toast[] = [];
  const panels: Overlay[] = []; // modal, one at a time
  const ribbons: Overlay[] = []; // not modal
  let pendingCells: { col: number; row: number }[] = [];
  let links = inv.links();
  let army: ArmySpec = inv.army();
  let power = inv.power();
  let shownStep = -1;
  let stepAge = 0;
  let waveCache: { key: string; info: WaveInfo } | null = null;
  let bossCache: { stage: number; pet: PetType } | null = null;

  const say = (text: string, y = TRAY.y - 22, life = 1.6) => toasts.push({ text, x: W / 2, y, age: 0, life });
  // for the play-check script: where the wave flow is
  if (import.meta.env.DEV) Object.assign(window as object, { __mode: () => (panels.length ? 'panel' : roll.active ? 'roll' : mode) });

  function wave(): WaveInfo {
    const key = `${state.stage},${state.wave},${state.tries},${state.seed}`;
    if (!waveCache || waveCache.key !== key) waveCache = { key, info: nextWave(state) };
    return waveCache.info;
  }
  function boss(): PetType {
    if (!bossCache || bossCache.stage !== state.stage) bossCache = { stage: state.stage, pet: stageBoss(state.stage, state.seed) };
    return bossCache.pet;
  }
  const slideY = () => SLIDE * easeInOutCubic(grow);
  const arenaRect = (): Rect => ({ ...ARENA_PREP, h: ARENA_PREP.h + slideY() });
  const busy = () => roll.active || panels.length > 0;
  const prep = () => mode === 'prep';

  // -------------------------------------------------------------- the guide

  const pets = () => inv.pieces.filter((p) => isPet(p.type));
  const gridPets = () => pets().filter((p) => p.slot < 0);
  const tut = () => state.tutorial;

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
        return state.fights > 0;
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
      return p ? { text: 'Drag your Sprout onto the grid', at: homeRect(p), to: cellRect(2, 2) } : null;
    }
    if (step === 1) {
      const p = onTray('knife');
      return p ? { text: 'Put the knife right next to it', at: homeRect(p), to: beside() } : null;
    }
    if (step === 2) {
      const p = onTray('helmet');
      return p ? { text: 'And the helmet next to it too', at: homeRect(p), to: beside() } : null;
    }
    if (step === 3) return { text: 'Ready! Tap START WAVE', at: START };
    if (step === 4) return { text: 'You earned cash. Open a CASE', at: CASE_BTN };
    if (step === 5) {
      const p = inv.pieces.find((q) => q.type === 'sprout' && q.slot >= 0);
      const mate = gridPets().find((q) => q.type === 'sprout');
      return p ? { text: 'Drop the new Sprout on your Sprout to fuse them', at: homeRect(p), to: mate ? homeRect(mate) : undefined } : null;
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
    if (prep()) view.showPrep(army, wave().army);
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
    fx.burst(cx, cy - 16, { colors: [UI.textDim, UI.borderStrong, COLOR.white], n: 10, speed: 140, shape: 'shard', gravity: 500 });
    fx.floatText(cx, cy - 46, `+${res.cash}`, UI.text, TYPE.h3);
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
    if (res.cost > 0) fx.floatText(c.x, c.y - 30, `-${res.cost}`, UI.text, TYPE.h3);
    changed();
  }

  function openCellFx(col: number, row: number, delay: number) {
    const c = centreOf(cellRect(col, row));
    sfx.play('cellUnlock', 0, { x: c.x, delay });
    fx.ring(c.x, c.y, UI.accentLight, 10, 52, 0.4);
    fx.burst(c.x, c.y, { colors: [UI.accent, UI.accentLight, COLOR.white], n: 14, speed: 200, size: 6, life: 0.6, gravity: 240, shape: 'star', stagger: delay });
  }

  // -------------------------------------------------------------- the wave

  function startWave() {
    if (!prep() || busy()) return;
    if (!gridPets().length) {
      say('Put a unit on the grid first', START.y + START.h + 30);
      sfx.play('denied');
      return;
    }
    const w = wave();
    setup = { player: army, enemy: w.army, seed: fightSeed(state), stage: w.stage, wave: w.wave, boss: w.boss };
    view.start(setup);
    mode = 'fight';
    lastKills = 0;
    drag = null;
    slide = null;
    pressed = null;
    idle = 0;
    // the battle view plays the whistle, the boss sting and sets the wave music
    if (tut() === 3) advanceGuide();
  }

  function backToPrep() {
    mode = 'prep';
    setup = null;
    idle = 0;
    view.showPrep(army, wave().army);
    music.set('prep');
    pendingCells.forEach((c, i) => openCellFx(c.col, c.row, 0.15 + i * 0.18));
    pendingCells = [];
    advanceGuide();
  }

  function finishWave() {
    const out = view.outcome();
    if (!out || !setup) return;
    const res: WaveResult = applyWave(state, { won: out.won, kos: out.kills, boss: out.boss, survived: out.survived });
    app.save();
    mode = 'after';
    pendingCells = res.cells;
    if (res.won && !res.stageClear) {
      ribbons.push(new WaveClear(res, ARENA_PREP.y + 150));
      fx.burst(TOP.cash.x + 30, TOP.cash.y + 22, { colors: [UI.reward, UI.rewardLight, COLOR.white], n: 10, speed: 120, size: 5, life: 0.6, gravity: 100, shape: 'star' });
      backToPrep();
    } else if (res.stageClear) {
      music.set('stageClear');
      panels.push(new StageClear(res, state.auto, () => backToPrep()));
    } else {
      music.set('defeat');
      panels.push(new Defeat(res, () => backToPrep()));
    }
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
    const order: BtnId[] = ['sound', 'auto', 'start', 'arrange', 'stats', 'trash', 'case', 'elite'];
    for (const id of order) {
      if (id === 'start' && (!prep() || ribbons.length > 0 || grow > 0)) continue;
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
      say(state.auto ? 'AUTO: waves start by themselves' : 'AUTO off', ARENA_PREP.y + 190);
      return;
    }
    if (!prep()) return;
    if (id === 'start') startWave();
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

  function topPill(ctx: Ctx, r: Rect, icon: (c: Ctx, x: number, y: number, s: number) => void, value: number, key: string) {
    rr(ctx, r.x, r.y + 2, r.w, r.h, r.h / 2);
    ctx.fillStyle = 'rgba(60, 54, 44, 0.12)';
    ctx.fill();
    rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fillStyle = UI.surface;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = UI.border;
    ctx.stroke();
    // the number sits in a recessed window, the icon on the left
    const wr = { x: r.x + 40, y: r.y + 6, w: r.w - 46, h: r.h - 12 };
    rr(ctx, wr.x, wr.y, wr.w, wr.h, wr.h / 2);
    ctx.fillStyle = UI.surfaceAlt;
    ctx.fill();
    icon(ctx, r.x + 22, r.y + r.h / 2, 26);
    const shown = tickTo(key, value);
    fitLabel(ctx, formatPower(shown), wr.x + wr.w / 2, r.y + r.h / 2 + 1, TYPE.h3, wr.w - 12, { weight: 700, color: shown !== value ? UI.rewardDark : UI.text });
  }

  function drawTopBar(ctx: Ctx) {
    // a soft band behind the bar
    const g = ctx.createLinearGradient(0, 0, 0, ARENA_PREP.y);
    g.addColorStop(0, '#ece9e3');
    g.addColorStop(1, '#e3dfd7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, ARENA_PREP.y);
    const fightCash = mode === 'fight' ? view.live.kills * koCash(state.stage) : 0;
    topPill(ctx, TOP.cash, (c, x, y, s) => cash(c, x, y, s), state.cash + fightCash, 'top:cash');
    topPill(ctx, TOP.gems, (c, x, y, s) => gem(c, x, y, s), state.gems, 'top:gems');
    // the STAGE tab hangs under the wave bar
    const st = STAGE_TAB;
    rr(ctx, st.x, st.y - 10, st.w, st.h + 10, 10);
    ctx.fillStyle = UI.text;
    ctx.fill();
    label(ctx, `STAGE ${state.stage}`, st.x + st.w / 2, st.y + st.h / 2 + 1, TYPE.body, { weight: 700, color: '#ffffff', track: 2 });
    // the wave bar: one line through the stage, the boss's head at its end
    const r = TOP.wave;
    rr(ctx, r.x, r.y + 2, r.w, r.h, r.h / 2);
    ctx.fillStyle = 'rgba(60, 54, 44, 0.12)';
    ctx.fill();
    rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fillStyle = UI.surface;
    ctx.fill();
    ctx.strokeStyle = UI.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    const bar = { x: r.x + 8, y: r.y + 8, w: r.w - 16 - 30, h: r.h - 16 };
    const done = mode === 'fight' ? state.wave - 0.5 : state.wave - 1;
    progressBar(ctx, bar, clamp(done / (WAVES - 1), 0, 1), { color: '#9cc3b8', back: UI.surfaceAlt });
    label(ctx, `WAVE ${state.wave}/${WAVES}`, bar.x + bar.w / 2 + 2, r.y + r.h / 2 + 1, TYPE.lead, { weight: 700, color: UI.text, track: 1.5 });
    // the boss head
    const hx = r.x + r.w - 22;
    const hy = r.y + r.h / 2;
    const hr = 24;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fillStyle = state.wave >= WAVES ? TEAM[1].light : '#efd9d5';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = state.wave >= WAVES ? TEAM[1].main : '#d9b2ac';
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr - 2.5, 0, Math.PI * 2);
    ctx.clip();
    drawUnit(ctx, boss(), hx, hy + 26, 15, t, { team: 1, boss: true, mood: 'angry', face: -1 });
    ctx.restore();
  }

  /** a small square button over the arena's corner: its glyph, and a word under it inside the button */
  function cornerBtn(ctx: Ctx, id: BtnId, icon: (c: Ctx, x: number, y: number, s: number, color?: string) => void, on: boolean, word?: string) {
    const r = BTN[id];
    const cy = button(ctx, r, { variant: on ? 'secondary' : 'quiet', text: '', pressed: pressed === id });
    const ink = on ? UI.accentDark : UI.textDim;
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
    g.addColorStop(0, 'rgba(40, 46, 40, 0)');
    g.addColorStop(1, 'rgba(40, 46, 40, 0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(0, r.y + r.h - 14, W, 14);
    const top = ctx.createLinearGradient(0, r.y, 0, r.y + 10);
    top.addColorStop(0, 'rgba(40, 46, 40, 0.18)');
    top.addColorStop(1, 'rgba(40, 46, 40, 0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, r.y, W, 10);
  }

  function drawStart(ctx: Ctx) {
    if (!prep() || busy() || ribbons.length || grow > 0) return;
    const w = wave();
    const enough = power >= w.recommended;
    const intro = easeOutCubic(clamp(startAge / 0.3, 0, 1));
    const autoK = state.auto && tut() >= TUTORIAL_DONE ? clamp(idle / AUTO_START, 0, 1) : 0;
    const o: ButtonOpts = { variant: 'primary', text: '', pressed: pressed === 'start', breathe: t, pulse: tut() === 3 ? (t * 1.1) % 1 : 0 };
    ctx.save();
    ctx.globalAlpha *= intro;
    const sc = 0.85 + 0.15 * easeOutBack(clamp(startAge / 0.3, 0, 1));
    ctx.translate(W / 2, START.y + START.h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -(START.y + START.h / 2));
    const cy = button(ctx, START, o);
    const title = w.boss ? 'FIGHT THE BOSS' : `START WAVE ${w.wave}`;
    label(ctx, title, START.x + START.w / 2, cy - 12, TYPE.h2 + 3, { weight: 700, color: '#ffffff', track: 2 });
    // the recommended power: pale when your army has it, warm when it does not
    const rec = `RECOMMENDED ${formatPower(w.recommended)}`;
    const col = enough ? 'rgba(255, 255, 255, 0.78)' : '#ffd9b0';
    ctx.font = `700 ${TYPE.caption}px sans-serif`;
    bolt(ctx, START.x + START.w / 2 - 70, cy + 20, 15, col);
    label(ctx, rec, START.x + START.w / 2 + 8, cy + 20, TYPE.caption, { weight: 700, color: col, track: 1.5 });
    if (autoK > 0) {
      // AUTO: a ring fills round the button's corner
      const ax = START.x + START.w - 8;
      const ay = START.y + 8;
      ctx.beginPath();
      ctx.arc(ax, ay, 14, 0, Math.PI * 2);
      ctx.fillStyle = UI.surface;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.arc(ax, ay, 11, -Math.PI / 2, -Math.PI / 2 + autoK * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = UI.accent;
      ctx.fill();
    }
    // the line under the button, on the pitch
    const line = !gridPets().length ? 'Drag a unit onto the grid to field it' : enough ? 'PREP TIME: open cases, merge and fuse!' : 'Below the recommended power: fuse or open a case';
    label(ctx, line, W / 2, START.y + START.h + 22, TYPE.body, { weight: 700, color: enough ? '#ffffff' : '#ffe2c4', onPitch: true });
    ctx.restore();
  }

  function drawHud(ctx: Ctx) {
    if (mode !== 'fight' || !setup) return;
    const a = clamp(grow * 2 - 0.4, 0, 1);
    if (a <= 0) return;
    const l = view.live;
    const s = Math.floor(l.time);
    ctx.save();
    ctx.globalAlpha *= a;
    scoreBug(ctx, HUD, { home: { name: 'You', score: l.mine }, away: { name: setup.boss ? 'Boss wave' : `Wave ${setup.wave}`, score: l.theirs }, clock: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
    ctx.restore();
  }

  // -------------------------------------------------------------- drawing: the grid, tray and buttons

  function drawLink(ctx: Ctx, e: LinkEdge) {
    const m = linkMid(e);
    const horiz = e.r1 === e.r2;
    const w = horiz ? 9 : 22;
    const h = horiz ? 22 : 9;
    rr(ctx, m.x - w / 2 - 1.5, m.y - h / 2 - 0.5, w + 3, h + 3, 5);
    ctx.fillStyle = e.active ? '#a9873f' : '#b9b2a6';
    ctx.fill();
    rr(ctx, m.x - w / 2, m.y - h / 2, w, h, 4.5);
    ctx.fillStyle = e.active ? COLOR.joint : '#e2ded6';
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
    ctx.fillStyle = '#cfc9be';
    ctx.fill();
    const cx = r.x + r.w / 2;
    if (pr.lock.kind === 'cash') {
      const can = state.cash >= pr.need;
      ctx.save();
      rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, S.radius.m - 1);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = can ? UI.accent : '#b3ac9f';
      ctx.stroke();
      ctx.restore();
      lock(ctx, cx, r.y + 18, 18, can ? UI.accentDark : '#8e877b');
      cash(ctx, cx - 14, r.y + r.h - 18, 18);
      label(ctx, String(pr.need), cx + 8, r.y + r.h - 17, TYPE.body, { weight: 700, color: can ? UI.accentDark : UI.textDim, track: 0 });
    } else if (pr.lock.kind === 'stage') {
      lock(ctx, cx, r.y + 20, 18, '#8e877b');
      label(ctx, `STAGE ${pr.need}`, cx, r.y + r.h - 18, TYPE.small, { weight: 700, color: UI.textDim, track: 0.5 });
    } else {
      koStar(ctx, cx, r.y + 17, 18, '#8e877b');
      fitLabel(ctx, `${Math.min(pr.have, pr.need)}/${pr.need}`, cx, r.y + r.h / 2 + 4, TYPE.small, r.w - 8, { weight: 700, color: UI.textDim, track: 0 });
      progressBar(ctx, { x: r.x + 8, y: r.y + r.h - 13, w: r.w - 16, h: 6 }, pr.have / pr.need, { color: UI.accent, back: '#e2ddd4' });
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
      ctx.globalAlpha = 0.12 + 0.12 * a;
      ctx.fillStyle = UI.accent;
      ctx.fill();
      ctx.globalAlpha = 0.6 + 0.4 * a;
      ctx.lineWidth = 3;
      ctx.strokeStyle = UI.accentDark;
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

  function drawPowerTab(ctx: Ctx) {
    const r = POWER_TAB;
    const rec = wave().recommended;
    const enough = power >= rec;
    // a tab on the grid frame's top edge
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
    bolt(ctx, r.x + 34, r.y + r.h / 2 + 2, 22, enough ? '#cfe3dc' : '#f0c89c');
    fitLabel(ctx, formatPower(shown), r.x + r.w / 2 + 12, r.y + r.h / 2 + 3, TYPE.h2, r.w - 70, { weight: 700, color: shown !== power ? '#f1e3bf' : '#ffffff', track: 1 });
  }

  function caseButton(ctx: Ctx, id: 'case' | 'elite') {
    const kind: CaseKind = id;
    const r = BTN[id];
    const price = casePrice(state, kind);
    const can = kind === 'case' ? state.cash >= price : state.gems >= price;
    const cy = button(ctx, r, { variant: kind, text: '', pressed: pressed === id, pulse: id === 'case' && tut() === 4 ? (t * 1.1) % 1 : 0 });
    const title = id === 'case' ? 'CASE' : 'ELITE';
    const sub = id === 'case' ? `A+ IN ${Math.max(1, PITY - state.pity)}` : 'NO E-CLASS';
    const ink = id === 'case' ? '#3d321f' : '#2c2647';
    const left = r.x + 22;
    label(ctx, title, left, cy - 9, TYPE.h2 + 2, { align: 'left', weight: 700, color: ink, track: 2 });
    label(ctx, sub, left, cy + 17, TYPE.tag, { align: 'left', weight: 700, color: ink, track: 1.2 });
    // the price on a chip at the right
    const cw = id === 'case' ? 104 : 78;
    const chip = { x: r.x + r.w - cw - 12, y: cy - 19, w: cw, h: 38 };
    rr(ctx, chip.x, chip.y, chip.w, chip.h, 19);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fill();
    if (id === 'case') cash(ctx, chip.x + 22, chip.y + 19, 24);
    else gem(ctx, chip.x + 20, chip.y + 19, 22);
    label(ctx, String(price), chip.x + chip.w / 2 + 14, chip.y + 20, TYPE.h3, { weight: 700, color: can ? ink : UI.danger });
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
      label(ctx, `SELL +${v}`, TRASH.x + TRASH.w / 2, TRASH.y - 12, TYPE.caption, { weight: 700, color: overTrash ? UI.danger : UI.textDim, track: 1 });
    }
    caseButton(ctx, 'case');
    caseButton(ctx, 'elite');
    button(ctx, ARRANGE, { variant: 'quiet', icon: wand, pressed: pressed === 'arrange' });
    if (grow > 0) {
      ctx.fillStyle = `rgba(231, 228, 221, ${(0.55 * clamp(grow * 1.5, 0, 1)).toFixed(3)})`;
      ctx.fillRect(0, POWER_TAB.y - 4, W, H);
    }
    ctx.restore();
  }

  function drawCard(ctx: Ctx, p: Piece) {
    const r = CARD;
    rr(ctx, r.x, r.y + 3, r.w, r.h, S.radius.l);
    ctx.fillStyle = 'rgba(40, 46, 40, 0.18)';
    ctx.fill();
    rr(ctx, r.x, r.y, r.w, r.h, S.radius.l);
    ctx.fillStyle = UI.glass;
    ctx.fill();
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
    label(ctx, PIECE_NAME[p.type].toUpperCase() + (pet && p.count > 1 ? ` x${p.count}` : ''), nameX, r.y + 31, TYPE.h3, { align: 'left', weight: 700, track: 1.5, color: UI.text });
    label(ctx, pet ? `RUNG ${rungOf(p.type as PetType)} OF 12` : cls(p.level).toUpperCase(), r.x + r.w - 20, r.y + 31, TYPE.caption, { align: 'right', color: pet ? UI.textDim : classColor(p.level, t), weight: 700, track: 1.5 });
    let desc = PIECE_DESC[p.type];
    if (isGear(p.type)) desc = desc.replace('{v}', String(gearPct(p.type, p.level)));
    fitLabel(ctx, desc, x0, r.y + 62, TYPE.body, r.w - 40, { align: 'left', color: UI.text });
    const tg = drag ? targetFor(p, heldCentre(drag)) : null;
    const pv = tg ? inv.preview(p, tg) : null;
    let tip = 'Drop on an identical piece to fuse';
    if (pv?.kind === 'fused') tip = pv.fuse === 'evolve' ? `Evolves into ${PIECE_NAME[pv.to ?? p.type]}!` : pv.fuse === 'stack' ? `Fuses into ${p.count * 2} ${PIECE_NAME[p.type]}s` : `Fuses to ${cls(p.level + 1)}`;
    else if (pv?.kind === 'denied' && pv.reason) tip = pv.reason === LOCKED ? 'That cell is locked: tap it to see how it opens' : pv.reason;
    else if (pet && tg && !('slot' in tg)) tip = p.count === 2 ? 'Touch weapons and gear. Tap it to turn it' : 'Two x4 squads evolve into the next unit';
    else if (!pet) tip = 'Put it right next to a unit';
    fitLabel(ctx, tip, x0, r.y + 90, TYPE.caption, r.w - 40, { align: 'left', color: pv?.kind === 'fused' ? UI.accentDark : pv?.kind === 'denied' ? UI.danger : UI.textDim, weight: 700 });
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

  function drawGuide(ctx: Ctx) {
    if (tut() >= TUTORIAL_DONE || drag?.moved || ribbons.length || grow > 0) return;
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
    ctx.strokeStyle = UI.accentDark;
    ctx.stroke();
    const sc = 0.92 + 0.08 * easeOutCubic(clamp(stepAge / 0.25, 0, 1));
    const hr = tut() === 3 ? { ...HINT, y: START.y - HINT.h - 26 } : HINT;
    ctx.translate(W / 2, hr.y + hr.h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -(hr.y + hr.h / 2));
    hint(ctx, hr, g.text, { x: cx, y: cy }, t);
    ctx.restore();
  }

  // -------------------------------------------------------------- the screen

  return {
    enter() {
      music.set('prep');
      fx.clear();
      links = inv.links();
      army = inv.army();
      power = inv.power();
      view.showPrep(army, wave().army);
      shownStep = -1;
      advanceGuide();
      if (opts.freshStart) say(FRESH_START_TOAST, ARENA_PREP.y + 200, 4);
    },
    update(dt) {
      t += dt;
      stepAge += dt;
      fx.update(dt);
      roll.update(dt);
      view.update(dt);
      for (const o of panels.slice(0, 1)) o.update(dt);
      for (const o of ribbons) o.update(dt);
      while (panels.length && panels[0].done) panels.shift();
      for (let i = ribbons.length - 1; i >= 0; i--) if (ribbons[i].done) ribbons.splice(i, 1);
      for (const [id, a] of pops) a + dt > 0.7 ? pops.delete(id) : pops.set(id, a + dt);
      for (const [id, a] of hops) a + dt > 0.4 ? hops.delete(id) : hops.set(id, a + dt);
      for (const [id, a] of turns) a + dt > TURN_TIME ? turns.delete(id) : turns.set(id, a + dt);
      for (const q of toasts) q.age += dt;
      for (let i = toasts.length - 1; i >= 0; i--) if (toasts[i].age > toasts[i].life) toasts.splice(i, 1);
      if (slide) {
        slide.age += dt;
        if (slide.age >= SLIDE_BACK) slide = null;
      }
      // the arena grows for the wave and shrinks back once its outcome is in
      const goal = mode === 'fight' ? 1 : 0;
      grow = goal > grow ? Math.min(1, grow + dt / GROW_TIME) : Math.max(0, grow - dt / GROW_TIME);
      if (mode === 'fight') {
        const k = view.live.kills;
        if (k > lastKills) {
          sfx.play('cashKill', k);
          lastKills = k;
        }
        if (view.outcome()) finishWave();
      }
      if (mode === 'after' && !panels.length) mode = 'prep';
      // AUTO: the wave starts after a few untouched seconds of prep
      if (prep() && !busy() && !ribbons.length && grow === 0) startAge += dt;
      else startAge = 0;
      if (prep() && state.auto && !busy() && !drag && !ribbons.length && tut() >= TUTORIAL_DONE && grow === 0) {
        idle += dt;
        if (idle >= AUTO_START) startWave();
      } else idle = 0;
      advanceGuide();
    },
    render(ctx) {
      ctx.save();
      ctx.translate(fx.camera.x, fx.camera.y);
      drawArena(ctx);
      drawLower(ctx);
      fx.drawUnder(ctx);
      drawStart(ctx);
      drawHud(ctx);
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
      cornerBtn(ctx, 'sound', (c, x, y, s, col) => speaker(c, x, y, s, sfx.muted, col), !sfx.muted);
      cornerBtn(ctx, 'auto', cycle, state.auto, 'AUTO');
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
      for (const o of ribbons) o.render(ctx, t);
      for (const q of toasts) toast(ctx, q.text, q.x, q.y, Math.min(q.age, 0.9 + Math.max(0, q.age - (q.life - 0.5))));
      ctx.restore();
      if (panels.length) panels[0].render(ctx, t);
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
