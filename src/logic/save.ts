import { BENCH_SLOTS, GRID, MAX_COUNT, MAX_LEVEL, PIECE_TYPES, STARTER_KIT, TROPHY_ROAD, footprint, isPet } from '../data';
import { makeRng } from '../rng';
import type { Piece, PieceType, SaveState } from '../types';

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

/** The save format. A save of another version (the 8 x 8 grid was version 1) is replaced by a fresh start. */
export const SAVE_VERSION = 2;

/** A fresh player: the starter kit on the bench, the scripted first rolls still to come. The seed only picks the name number. */
export function newSave(seed = 48213): SaveState {
  const n = makeRng(seed).int(10000, 99999);
  const pieces: Piece[] = STARTER_KIT.map((k, i) => ({ id: i + 1, type: k.type, level: k.level, count: 1, col: -1, row: -1, slot: i }));
  return {
    version: SAVE_VERSION,
    name: `Player${n}`,
    trophies: 0,
    bestTrophies: 0,
    rolls: 3,
    rollMeter: 0,
    pity: 0,
    rolled: 0,
    pieces,
    nextId: pieces.length + 1,
    matches: 0,
    wins: 0,
    streak: 0,
    tutorial: 0,
    claimed: 0,
    seed: 1,
  };
}

const num = (v: unknown, def: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const whole = (v: unknown, def: number, min?: number, max?: number) => Math.floor(num(v, def, min, max));

/**
 * Turns anything into a valid SaveState: a save of another version (or no save) becomes a fresh start; a
 * damaged one keeps what it can (a piece that no longer fits its cells goes to the bench, and is dropped only
 * when there is no room anywhere).
 */
export function repair(raw: unknown): SaveState {
  const base = newSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  if (r.version !== SAVE_VERSION) return base;
  const trophies = whole(r.trophies, 0, 0);
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
    const level = whole(o.level, 1, 1, MAX_LEVEL);
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
      const out: string[] = [];
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) out.push(`${c + x},${rr + y}`);
      return out;
    };
    const fitsAt = (c: number, rr: number) => c >= 0 && rr >= 0 && c + f.w <= GRID.cols && rr + f.h <= GRID.rows && covers(c, rr).every((k) => !cells.has(k));
    const onGrid = typeof col === 'number' && typeof row === 'number' && Number.isInteger(col) && Number.isInteger(row) && fitsAt(col, row);
    if (onGrid && (typeof slot !== 'number' || slot < 0)) {
      p.col = col as number;
      p.row = row as number;
      for (const k of covers(p.col, p.row)) cells.add(k);
    } else {
      let s = typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < BENCH_SLOTS && !slots.has(slot) ? slot : -1;
      for (let i = 0; s < 0 && i < BENCH_SLOTS; i++) if (!slots.has(i)) s = i;
      if (s >= 0) {
        p.slot = s;
        slots.add(s);
      } else {
        // no bench slot left: the first free spot on the grid, else it cannot be kept
        let spot: [number, number] | null = null;
        for (let y = 0; !spot && y < GRID.rows; y++) for (let x = 0; !spot && x < GRID.cols; x++) if (fitsAt(x, y)) spot = [x, y];
        if (!spot) continue;
        [p.col, p.row] = spot;
        for (const k of covers(p.col, p.row)) cells.add(k);
      }
    }
    pieces.push(p);
  }
  const hasSave = Array.isArray(r.pieces);
  const trophiesBest = Math.max(trophies, whole(r.bestTrophies, 0, 0));
  return {
    version: SAVE_VERSION,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 24) : base.name,
    trophies,
    bestTrophies: trophiesBest,
    rolls: whole(r.rolls, 0, 0),
    rollMeter: num(r.rollMeter, 0, 0, 0.999999),
    pity: whole(r.pity, 0, 0),
    rolled: whole(r.rolled, 0, 0),
    pieces: hasSave ? pieces : base.pieces,
    nextId: Math.max(whole(r.nextId, 1, 1), maxId + 1),
    matches: whole(r.matches, 0, 0),
    wins: whole(r.wins, 0, 0),
    streak: whole(r.streak, 0),
    tutorial: whole(r.tutorial, 0, 0),
    claimed: whole(r.claimed, 0, 0, TROPHY_ROAD.length),
    seed: whole(r.seed, 1, 0),
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
