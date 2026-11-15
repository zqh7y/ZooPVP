import { BENCH_SLOTS, ECON, GRID, LEVEL, MAX_COUNT, MAX_LEVEL, PET_TYPES, PIECE_TYPES, START_OPEN, STARTER_KIT, cellBit, footprint, isPet, levelForStage, rungOf, xpToNext } from '../data';
import { hashSeed } from '../rng';
import type { PetType, Piece, PieceType, SaveState } from '../types';

export const SAVE_KEY = 'zoopvp-save';

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
function store(): Store | null {
  try {
    return (globalThis as { localStorage?: Store }).localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The save format. Version 5 is the twelve fighters with matched fights and a player level. A version-4 save (the
 * stages and waves) is migrated: it keeps everything but the stage fields, and starts at levelForStage(its stage).
 * Anything older is replaced by a fresh start (version 1 was the 8 x 8 grid, version 2 the ant and frog with
 * classes, version 3 the twelve-pet ladder with trophies).
 */
export const SAVE_VERSION = 5;
/** The last version that is migrated rather than replaced. */
export const MIGRATES_FROM = 4;
/** The toast the main screen shows once when an older save was replaced (see replacedOldSave). */
export const FRESH_START_TOAST = 'A new adventure! Your army starts fresh.';

const ownBit = (pet: PetType) => 1 << (rungOf(pet) - 1);
const ALL_RUNGS = (1 << PET_TYPES.length) - 1;
const ALL_CELLS = (1 << (GRID.cols * GRID.rows)) - 1;

/** A fresh player: level 1, no matches yet, the starter kit on the tray, cash for the guide's first cases. */
export function newSave(seed = 48213): SaveState {
  const pieces: Piece[] = STARTER_KIT.map((k, i) => ({ id: i + 1, type: k.type, level: isPet(k.type) ? 1 : k.level, count: 1, col: -1, row: -1, slot: i }));
  const owned = pieces.reduce((m, p) => (isPet(p.type) ? m | ownBit(p.type) : m), ownBit('sprout'));
  return {
    version: SAVE_VERSION,
    cash: ECON.startCash,
    gems: ECON.startGems,
    level: 1,
    xp: 0,
    streak: 0,
    slump: 0,
    bestStreak: 0,
    matches: 0,
    wins: 0,
    champs: 0,
    cases: 0,
    elites: 0,
    pity: 0,
    rolled: 0,
    open: START_OPEN,
    cellBuys: 0,
    kos: 0,
    owned,
    evolves: 0,
    auto: false,
    tutorial: 0,
    tips: 0,
    seed: hashSeed(seed, 0x2004) || 1,
    pieces,
    nextId: pieces.length + 1,
  };
}

/** true when this stored save is too old to migrate (so load() starts fresh): show FRESH_START_TOAST once. */
export function replacedOldSave(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const v = (raw as Record<string, unknown>).version;
  return typeof v === 'number' && v !== SAVE_VERSION && v !== MIGRATES_FROM;
}

/** true when this stored save is a version-4 one (stages and waves) that load() migrates to matched fights. */
export function migratedOldSave(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>).version === MIGRATES_FROM;
}
/** The toast the main screen may show once after a version-4 save was migrated. */
export const MIGRATED_TOAST = 'No more stages: BATTLE now finds you a matched opponent!';

const num = (v: unknown, def: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const whole = (v: unknown, def: number, min?: number, max?: number) => Math.floor(num(v, def, min, max));

/**
 * Turns anything into a valid SaveState: a version-4 save is migrated (see SAVE_VERSION); a save of any other
 * version (or no save) becomes a fresh start; a damaged one keeps what it can (a piece that no longer fits its open
 * cells goes to the tray, and is dropped only when there is no room anywhere).
 */
export function repair(raw: unknown): SaveState {
  const base = newSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const v4 = r.version === MIGRATES_FROM;
  if (r.version !== SAVE_VERSION && !v4) return base;
  // the middle 3 x 3 is always open
  const open = (whole(r.open, START_OPEN, 0) & ALL_CELLS) | START_OPEN;
  const pieces: Piece[] = [];
  const usedIds = new Set<number>();
  const cells = new Set<string>();
  const slots = new Set<number>();
  const list = Array.isArray(r.pieces) ? r.pieces : [];
  let maxId = 0;
  for (const q of list) {
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    if (typeof o.type !== 'string' || !PIECE_TYPES.includes(o.type as PieceType)) continue;
    const type = o.type as PieceType;
    // a unit has no class: its level is always 1
    const level = isPet(type) ? 1 : whole(o.level, 1, 1, MAX_LEVEL);
    let count = whole(o.count, 1, 1, MAX_COUNT);
    count = isPet(type) ? 2 ** Math.floor(Math.log2(count)) : 1;
    let id = whole(o.id, -1, 0);
    if (id < 0 || usedIds.has(id)) id = Math.max(maxId, ...usedIds, 0) + 1;
    usedIds.add(id);
    maxId = Math.max(maxId, id);
    const p: Piece = { id, type, level, count, col: -1, row: -1, slot: -1 };
    if (count === 2 && o.turned === true) p.turned = true;
    const col = o.col, row = o.row, slot = o.slot;
    const f = footprint(p);
    const covers = (c: number, rr: number) => {
      const out: [number, number][] = [];
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) out.push([c + x, rr + y]);
      return out;
    };
    const fitsAt = (c: number, rr: number) =>
      c >= 0 && rr >= 0 && c + f.w <= GRID.cols && rr + f.h <= GRID.rows && covers(c, rr).every(([x, y]) => !cells.has(`${x},${y}`) && (open & cellBit(x, y)) !== 0);
    const onGrid = typeof col === 'number' && typeof row === 'number' && Number.isInteger(col) && Number.isInteger(row) && fitsAt(col, row);
    if (onGrid && (typeof slot !== 'number' || slot < 0)) {
      p.col = col as number;
      p.row = row as number;
      for (const [x, y] of covers(p.col, p.row)) cells.add(`${x},${y}`);
    } else {
      let s = typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < BENCH_SLOTS && !slots.has(slot) ? slot : -1;
      for (let i = 0; s < 0 && i < BENCH_SLOTS; i++) if (!slots.has(i)) s = i;
      if (s >= 0) {
        p.slot = s;
        slots.add(s);
      } else {
        // no tray slot left: the first free open spot on the grid, else it cannot be kept
        let spot: [number, number] | null = null;
        for (let y = 0; !spot && y < GRID.rows; y++) for (let x = 0; !spot && x < GRID.cols; x++) if (fitsAt(x, y)) spot = [x, y];
        if (!spot) continue;
        [p.col, p.row] = spot;
        for (const [x, y] of covers(p.col, p.row)) cells.add(`${x},${y}`);
      }
    }
    pieces.push(p);
  }
  const kept = Array.isArray(r.pieces) ? pieces : base.pieces;
  // every unit it owns counts as owned
  let owned = (whole(r.owned, base.owned, 0) & ALL_RUNGS) | ownBit('sprout');
  for (const p of kept) if (isPet(p.type)) owned |= ownBit(p.type);
  // a version-4 save: its stage gives the starting level, its waves fought and won the match counts
  const level = v4 ? levelForStage(whole(r.stage, 1, 1, 1e6)) : whole(r.level, 1, 1, LEVEL.max);
  const matches = whole(v4 ? r.fights : r.matches, 0, 0);
  const wins = Math.min(matches, whole(r.wins, 0, 0));
  const streak = v4 ? 0 : whole(r.streak, 0, 0, matches);
  return {
    version: SAVE_VERSION,
    cash: whole(r.cash, 0, 0),
    gems: whole(r.gems, 0, 0),
    level,
    xp: v4 ? 0 : whole(r.xp, 0, 0, xpToNext(level)),
    streak,
    slump: v4 || streak > 0 ? 0 : whole(r.slump, 0, 0, matches),
    bestStreak: v4 ? 0 : Math.max(streak, whole(r.bestStreak, 0, 0, matches)),
    matches,
    wins,
    champs: v4 ? 0 : whole(r.champs, 0, 0, wins),
    cases: whole(r.cases, 0, 0),
    elites: whole(r.elites, 0, 0),
    pity: whole(r.pity, 0, 0),
    rolled: whole(r.rolled, 0, 0),
    open,
    cellBuys: whole(r.cellBuys, 0, 0, GRID.cols * GRID.rows),
    kos: whole(r.kos, 0, 0),
    owned,
    evolves: whole(r.evolves, 0, 0),
    auto: r.auto === true,
    tutorial: whole(r.tutorial, 0, 0),
    tips: whole(r.tips, 0, 0),
    seed: whole(r.seed, base.seed, 1, 0xffffffff),
    pieces: kept,
    nextId: Math.max(whole(r.nextId, 1, 1), maxId + 1),
  };
}

/** Reads the saved game; a new save when there is none or it cannot be read. */
export function load(): SaveState {
  try {
    const raw = store()?.getItem(SAVE_KEY);
    if (!raw) return newSave();
    return repair(JSON.parse(raw));
  } catch {
    return newSave();
  }
}

/** Writes the save; false when storage is missing or full. */
export function save(state: SaveState): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
