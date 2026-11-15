import { BENCH_SLOTS, GRID, MAX_COUNT, MAX_LEVEL, PIECE_NAME, WEAPON_TYPES, armyPower, footprint, isGear, isPet, isWeapon, nextPet, rungOf } from '../data';
import type { ArmySpec, GearType, LinkEdge, PetType, Piece, PieceType, SaveState, SquadSpec, WeaponType } from '../types';

/**
 * Where a piece is dropped: a grid cell (the cell its top-left corner goes to) or a bench slot.
 */
export type Target = { col: number; row: number } | { slot: number };
/**
 * How two pieces fuse: 'stack' doubles a pet's count (x1 -> x2 -> x4), 'class' lifts a weapon or gear one class,
 * 'evolve' turns two x4 squads of a pet into one x1 of the next rung's pet.
 */
export type FuseKind = 'stack' | 'class' | 'evolve';
/** Why two x4 squads of the top pet do not fuse. */
export const TOP_OF_LADDER = 'Turtles are the top of the ladder';
export interface PlaceResult {
  kind: 'moved' | 'swapped' | 'fused' | 'denied';
  /** what now sits at the target (the grown piece after a fuse; after an evolve, the new pet) */
  piece?: Piece;
  fuse?: FuseKind;
  /** an evolve: the pet it was and the pet it became */
  from?: PetType;
  to?: PetType;
  /** an evolve into a pet the player never owned before (show the NEW PET reveal); in a preview, it would be */
  fresh?: boolean;
  /** id of the piece that was used up */
  gone?: number;
  /** the piece that went to the dragged piece's old spot in a swap */
  other?: Piece;
  /** why it was denied, short enough for a toast; absent when the drop simply changes nothing */
  reason?: string;
}
export interface TurnResult {
  ok: boolean;
  reason?: string;
}
export interface Cell {
  col: number;
  row: number;
}

/** The cells a w x h shape covers with its top-left cell at (col, row), row by row. */
export function shapeCells(w: number, h: number, col: number, row: number): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push({ col: col + c, row: row + r });
  return out;
}

/** The grid cells a piece covers (none when it is on the bench). */
export function cellsOf(p: Piece): Cell[] {
  if (p.slot >= 0 || p.col < 0) return [];
  const f = footprint(p);
  return shapeCells(f.w, f.h, p.col, p.row);
}

const inGrid = (c: number, r: number) => c >= 0 && c < GRID.cols && r >= 0 && r < GRID.rows;
const name = (p: Piece) => PIECE_NAME[p.type];

// ------------------------------------------------------------------ the pets ever owned (SaveState.seen)

const bitOf = (pet: PetType) => 1 << (rungOf(pet) - 1);
/** true when the player has owned this pet at some point (rolled, evolved, gifted or started with it). */
export function seenPet(state: Pick<SaveState, 'seen'>, pet: PetType): boolean {
  return (state.seen & bitOf(pet)) !== 0;
}
/** Remembers that the player owns this pet. True when it is the first time (show the NEW PET reveal). */
export function markSeen(state: Pick<SaveState, 'seen'>, pet: PetType): boolean {
  if (seenPet(state, pet)) return false;
  state.seen |= bitOf(pet);
  return true;
}
/** The rungs ever owned, 1..12 (for the ladder bar of the NEW PET card). */
export function seenRungs(state: Pick<SaveState, 'seen'>): number[] {
  const out: number[] = [];
  for (let r = 1; r <= 12; r++) if (state.seen & (1 << (r - 1))) out.push(r);
  return out;
}

/**
 * The cells side by side with a w x h shape at (col, row), each with the cell of the shape it touches.
 * Order (also the tie-break order of equal pieces): the top side left to right, the right side top to bottom,
 * the bottom side left to right, the left side top to bottom.
 */
export function aroundShape(w: number, h: number, col: number, row: number): { cell: Cell; from: Cell }[] {
  const out: { cell: Cell; from: Cell }[] = [];
  for (let c = 0; c < w; c++) out.push({ cell: { col: col + c, row: row - 1 }, from: { col: col + c, row } });
  for (let r = 0; r < h; r++) out.push({ cell: { col: col + w, row: row + r }, from: { col: col + w - 1, row: row + r } });
  for (let c = 0; c < w; c++) out.push({ cell: { col: col + c, row: row + h }, from: { col: col + c, row: row + h - 1 } });
  for (let r = 0; r < h; r++) out.push({ cell: { col: col - 1, row: row + r }, from: { col, row: row + r } });
  return out.filter((e) => inGrid(e.cell.col, e.cell.row));
}

interface Best {
  weapon: Piece | null;
  gear: Partial<Record<GearType, Piece>>;
}

/** true when weapon a beats weapon b: the higher class, on equal class the type earlier in WEAPON_TYPES */
export const betterWeapon = (a: { type: PieceType; level: number }, b: { type: PieceType; level: number } | null) =>
  !b || a.level > b.level || (a.level === b.level && WEAPON_TYPES.indexOf(a.type as WeaponType) < WEAPON_TYPES.indexOf(b.type as WeaponType));

export class Inventory {
  constructor(public readonly state: SaveState) {}

  get pieces(): Piece[] {
    return this.state.pieces;
  }

  /** The piece covering this grid cell, or null. */
  at(col: number, row: number): Piece | null {
    if (!inGrid(col, row)) return null;
    for (const p of this.state.pieces) {
      if (p.slot >= 0 || p.col < 0) continue;
      const f = footprint(p);
      if (col >= p.col && col < p.col + f.w && row >= p.row && row < p.row + f.h) return p;
    }
    return null;
  }
  benchAt(slot: number): Piece | null {
    return this.state.pieces.find((p) => p.slot === slot) ?? null;
  }
  freeBenchSlot(): number {
    for (let s = 0; s < BENCH_SLOTS; s++) if (!this.benchAt(s)) return s;
    return -1;
  }
  piece(id: number): Piece | null {
    return this.state.pieces.find((p) => p.id === id) ?? null;
  }

  /**
   * 'stack' doubles a pet's count (two pets of the same type and count under 4), 'evolve' turns two x4 squads of a
   * pet into one x1 of the next rung's pet, 'class' lifts a weapon or gear one class; null when they cannot fuse
   * (two x4 turtles, different pets or counts, different items or classes, an SSS item).
   */
  canFuse(a: Piece, b: Piece): FuseKind | null {
    if (a === b || a.id === b.id || a.type !== b.type) return null;
    if (isPet(a.type)) {
      if (a.count !== b.count) return null;
      if (a.count < MAX_COUNT) return 'stack';
      return a.count === MAX_COUNT && nextPet(a.type) ? 'evolve' : null;
    }
    if (a.level !== b.level) return null;
    return a.level < MAX_LEVEL ? 'class' : null;
  }

  /** true when two pieces are full squads of the top pet: they cannot fuse (place() says so). */
  private topPair(a: Piece, b: Piece): boolean {
    return a !== b && a.type === b.type && isPet(a.type) && a.count === MAX_COUNT && b.count === MAX_COUNT && !nextPet(a.type);
  }

  private valid(t: Target): boolean {
    if ('slot' in t) return Number.isInteger(t.slot) && t.slot >= 0 && t.slot < BENCH_SLOTS;
    return Number.isInteger(t.col) && Number.isInteger(t.row) && inGrid(t.col, t.row);
  }

  /** true when every cell is on the grid and free, or covered by one of the pieces in `leaving` */
  private free(cells: readonly Cell[], leaving: readonly Piece[], blocked?: ReadonlySet<string>): boolean {
    for (const { col, row } of cells) {
      if (!inGrid(col, row)) return false;
      if (blocked?.has(`${col},${row}`)) return false;
      const o = this.at(col, row);
      if (o && !leaving.includes(o)) return false;
    }
    return true;
  }

  /** The answer place() would give, without changing anything. */
  preview(piece: Piece, target: Target): PlaceResult {
    return this.run(piece, target, false);
  }

  /**
   * Drops a piece. On the grid the target is the cell its top-left corner goes to. Dropping onto an identical
   * piece anywhere under it fuses them; onto one other piece swaps the two when each fits the other's spot.
   */
  place(piece: Piece, target: Target): PlaceResult {
    return this.run(piece, target, true);
  }

  private run(piece: Piece, target: Target, apply: boolean): PlaceResult {
    if (!this.valid(target) || !this.state.pieces.includes(piece)) return { kind: 'denied' };
    const onBench = piece.slot >= 0;

    if ('slot' in target) {
      const other = this.benchAt(target.slot);
      if (other === piece) return { kind: 'denied' };
      if (!other) {
        if (apply) this.toSlot(piece, target.slot);
        return { kind: 'moved', piece };
      }
      if (this.topPair(piece, other)) return { kind: 'denied', reason: TOP_OF_LADDER };
      const fuse = this.canFuse(piece, other);
      if (fuse) {
        // on the bench a piece of any size fits its slot, so it simply grows there (an evolved pet keeps the slot)
        const res = this.fused(other, piece, fuse);
        if (apply) {
          this.remove(piece);
          res.fresh = this.grow(other, fuse);
        }
        return res;
      }
      if (!onBench) {
        const f = footprint(other);
        if (!this.free(shapeCells(f.w, f.h, piece.col, piece.row), [piece])) return { kind: 'denied', reason: `No room for the ${name(other)} there` };
      }
      if (apply) {
        const from = onBench ? null : { col: piece.col, row: piece.row };
        if (from) this.toCell(other, from.col, from.row);
        else this.toSlot(other, piece.slot);
        this.toSlot(piece, target.slot);
      }
      return { kind: 'swapped', piece, other };
    }

    const f = footprint(piece);
    const cells = shapeCells(f.w, f.h, target.col, target.row);
    // the pieces under the dropped shape, the one under its top-left cell first
    const under: Piece[] = [];
    for (const { col, row } of cells) {
      const o = this.at(col, row);
      if (o && o !== piece && !under.includes(o)) under.push(o);
    }
    const mate = under.find((o) => this.canFuse(piece, o));
    if (mate) return this.fuseInto(piece, mate, target, apply);
    if (under.some((o) => this.topPair(piece, o))) return { kind: 'denied', reason: TOP_OF_LADDER };
    if (!onBench && piece.col === target.col && piece.row === target.row) return { kind: 'denied' };
    if (cells.some((c) => !inGrid(c.col, c.row))) return { kind: 'denied', reason: 'It does not fit there' };
    if (under.length === 0) {
      if (apply) this.toCell(piece, target.col, target.row);
      return { kind: 'moved', piece };
    }
    if (under.length > 1) return { kind: 'denied', reason: 'No room there' };
    const other = under[0];
    if (!onBench) {
      // the other piece goes to this one's old top-left cell, clear of where this one lands
      const of = footprint(other);
      const blocked = new Set(cells.map((c) => `${c.col},${c.row}`));
      if (!this.free(shapeCells(of.w, of.h, piece.col, piece.row), [piece, other], blocked)) return { kind: 'denied', reason: `No room for the ${name(other)} there` };
    }
    if (apply) {
      if (onBench) this.toSlot(other, piece.slot);
      else this.toCell(other, piece.col, piece.row);
      this.toCell(piece, target.col, target.row);
    }
    return { kind: 'swapped', piece, other };
  }

  /**
   * Fuses the dragged piece into its identical mate. A grown pet stays anchored where the mate was; when its
   * bigger shape does not fit there, it takes the nearest spot that still covers the mate's cell and fits.
   */
  private fuseInto(piece: Piece, mate: Piece, drop: { col: number; row: number }, apply: boolean): PlaceResult {
    const fuse = this.canFuse(piece, mate)!;
    const done = this.fused(mate, piece, fuse);
    if (fuse === 'class' || mate.slot >= 0) {
      if (apply) {
        this.remove(piece);
        done.fresh = this.grow(mate, fuse);
      }
      return done;
    }
    if (fuse === 'evolve') {
      // the new pet covers one cell: the drop cell when it is one of the mate's, else the mate's top-left cell
      const inMate = cellsOf(mate).some((c) => c.col === drop.col && c.row === drop.row);
      if (apply) {
        this.remove(piece);
        done.fresh = this.grow(mate, fuse);
        if (inMate) {
          mate.col = drop.col;
          mate.row = drop.row;
        }
      }
      return done;
    }
    const spot = this.growSpot(mate, piece, drop);
    if (!spot) return { kind: 'denied', reason: 'No room to grow here' };
    if (apply) {
      this.remove(piece);
      this.grow(mate, fuse);
      if (mate.count === 2) mate.turned = spot.turned;
      mate.col = spot.col;
      mate.row = spot.row;
    }
    return done;
  }

  /** Where a grid pet fused with `piece` would go: anchor and (for a pair) whether it stands up; null if nowhere. */
  private growSpot(mate: Piece, piece: Piece, drop: { col: number; row: number }): { col: number; row: number; turned: boolean } | null {
    const count = mate.count * 2;
    const shapes = count === 2 ? [false, true] : [false];
    const mine = cellsOf(mate);
    let best: { col: number; row: number; turned: boolean; k: number[] } | null = null;
    for (const turned of shapes) {
      const f = footprint({ type: mate.type, count, turned });
      for (let r = mate.row - f.h + 1; r <= mate.row + 1; r++) {
        for (let c = mate.col - f.w + 1; c <= mate.col + 1; c++) {
          const cells = shapeCells(f.w, f.h, c, r);
          if (!cells.some((x) => mine.some((m) => m.col === x.col && m.row === x.row))) continue;
          if (!this.free(cells, [mate, piece])) continue;
          const k = [(c - mate.col) ** 2 + (r - mate.row) ** 2, (c - drop.col) ** 2 + (r - drop.row) ** 2, turned ? 1 : 0, r, c];
          if (!best || less(k, best.k)) best = { col: c, row: r, turned, k };
        }
      }
    }
    return best && { col: best.col, row: best.row, turned: best.turned };
  }

  /** The answer to a fuse of `piece` into `mate`, before it is applied (fresh: the evolved pet would be new). */
  private fused(mate: Piece, piece: Piece, fuse: FuseKind): PlaceResult {
    const res: PlaceResult = { kind: 'fused', piece: mate, fuse, gone: piece.id };
    if (fuse === 'evolve') {
      const to = nextPet(mate.type as PetType)!;
      res.from = mate.type as PetType;
      res.to = to;
      res.fresh = !seenPet(this.state, to);
    }
    return res;
  }

  /** Grows a piece by a fuse. Returns true when an evolve made a pet the player never owned before. */
  private grow(p: Piece, fuse: FuseKind): boolean {
    if (fuse === 'class') p.level += 1;
    else if (fuse === 'stack') {
      p.count *= 2;
      if (p.count !== 2) delete p.turned;
    } else {
      p.type = nextPet(p.type as PetType)!;
      p.count = 1;
      p.level = 1;
      delete p.turned;
      this.state.evolves += 1;
      return markSeen(this.state, p.type);
    }
    return false;
  }

  private toSlot(p: Piece, slot: number): void {
    p.slot = slot;
    p.col = -1;
    p.row = -1;
  }
  private toCell(p: Piece, col: number, row: number): void {
    p.slot = -1;
    p.col = col;
    p.row = row;
  }

  /** true when this is a pair of pets on the grid and its turned shape fits where it is. */
  canTurn(piece: Piece): boolean {
    if (!isPet(piece.type) || piece.count !== 2 || piece.slot >= 0 || piece.col < 0) return false;
    const f = footprint({ ...piece, turned: !piece.turned });
    return this.free(shapeCells(f.w, f.h, piece.col, piece.row), [piece]);
  }

  /** Turns a pair of pets on the grid (lying across <-> standing up), keeping its top-left cell. */
  turn(piece: Piece): TurnResult {
    if (!isPet(piece.type) || piece.count !== 2 || piece.slot >= 0 || piece.col < 0) return { ok: false };
    if (!this.canTurn(piece)) return { ok: false, reason: 'No room to turn it' };
    piece.turned = !piece.turned;
    return { ok: true };
  }

  /**
   * A new piece on the first free bench slot, or null when the bench is full. A pet's level is always 1, and the
   * pet is remembered as owned (check seenPet before adding to know whether it is new).
   */
  add(type: PieceType, level: number): Piece | null {
    const slot = this.freeBenchSlot();
    if (slot < 0) return null;
    const pet = isPet(type);
    const p: Piece = { id: this.state.nextId++, type, level: pet ? 1 : level, count: 1, col: -1, row: -1, slot };
    this.state.pieces.push(p);
    if (pet) markSeen(this.state, type);
    return p;
  }

  remove(piece: Piece): void {
    const i = this.state.pieces.indexOf(piece);
    if (i >= 0) this.state.pieces.splice(i, 1);
  }

  private onGrid(p: Piece): boolean {
    return p.slot < 0 && p.col >= 0;
  }

  /** The pieces side by side with a grid piece, each once with the first cell pair where they touch. */
  private touching(p: Piece): { piece: Piece; cell: Cell; from: Cell }[] {
    const f = footprint(p);
    const out: { piece: Piece; cell: Cell; from: Cell }[] = [];
    for (const e of aroundShape(f.w, f.h, p.col, p.row)) {
      const n = this.at(e.cell.col, e.cell.row);
      if (n && n !== p && !out.some((o) => o.piece === n)) out.push({ piece: n, cell: e.cell, from: e.from });
    }
    return out;
  }

  /**
   * What a pet really uses of what touches it. The highest class wins; on equal class a weapon type earlier
   * in WEAPON_TYPES wins; for equal pieces the first in the touching order (see aroundShape) wins.
   */
  private best(pet: Piece): Best {
    const res: Best = { weapon: null, gear: {} };
    for (const { piece: n } of this.touching(pet)) {
      if (isWeapon(n.type)) {
        if (betterWeapon(n, res.weapon)) res.weapon = n;
      } else if (isGear(n.type)) {
        const g = res.gear[n.type];
        if (!g || n.level > g.level) res.gear[n.type] = n;
      }
    }
    return res;
  }

  private gridPets(): Piece[] {
    return this.state.pieces.filter((p) => isPet(p.type) && this.onGrid(p)).sort((a, b) => a.row - b.row || a.col - b.col);
  }

  /** One edge for every weapon or gear touching a pet: from the pet's cell to the item's cell. */
  links(): LinkEdge[] {
    const edges: LinkEdge[] = [];
    for (const pet of this.gridPets()) {
      const b = this.best(pet);
      for (const { piece: n, cell, from } of this.touching(pet)) {
        if (isPet(n.type)) continue;
        const active = n === b.weapon || (isGear(n.type) && b.gear[n.type] === n);
        edges.push({ c1: from.col, r1: from.row, c2: cell.col, r2: cell.row, active });
      }
    }
    return edges;
  }

  squadOf(pet: Piece): SquadSpec {
    const b = this.onGrid(pet) ? this.best(pet) : { weapon: null, gear: {} as Best['gear'] };
    const lv = (t: GearType) => b.gear[t]?.level ?? 0;
    return {
      key: pet.id,
      pet: pet.type as PetType,
      count: pet.count,
      weapon: b.weapon ? (b.weapon.type as WeaponType) : null,
      weaponLevel: b.weapon ? b.weapon.level : 0,
      helmet: lv('helmet'),
      sneakers: lv('sneakers'),
      chili: lv('chili'),
    };
  }

  squads(): SquadSpec[] {
    return this.gridPets().map((p) => this.squadOf(p));
  }
  army(): ArmySpec {
    return { squads: this.squads() };
  }
  power(): number {
    return armyPower(this.squads());
  }

  /** The grid pets that actually use this weapon or gear piece. */
  servedBy(item: Piece): Piece[] {
    if (isPet(item.type) || !this.onGrid(item)) return [];
    return this.touching(item)
      .map((t) => t.piece)
      .filter((n) => {
        if (!isPet(n.type)) return false;
        const b = this.best(n);
        return b.weapon === item || (isGear(item.type) && b.gear[item.type] === item);
      });
  }
}

function less(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
