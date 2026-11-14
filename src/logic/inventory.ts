import { BENCH_SLOTS, GRID, MAX_COUNT, MAX_LEVEL, WEAPON_TYPES, armyPower, isGear, isPet, isWeapon } from '../data';
import type { ArmySpec, GearType, LinkEdge, Piece, PieceType, SaveState, SquadSpec, WeaponType } from '../types';

export type Target = { col: number; row: number } | { slot: number };
export interface PlaceResult {
  kind: 'moved' | 'swapped' | 'fused' | 'denied';
  /** what now sits at the target */
  piece?: Piece;
  fuse?: 'stack' | 'class';
  /** id of the piece that was used up */
  gone?: number;
}

/** Neighbour order, also the tie-break order: up, right, down, left. */
const DIRS: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

interface Best {
  weapon: Piece | null;
  gear: Partial<Record<GearType, Piece>>;
}

export class Inventory {
  constructor(public readonly state: SaveState) {}

  get pieces(): Piece[] {
    return this.state.pieces;
  }

  at(col: number, row: number): Piece | null {
    return this.state.pieces.find((p) => p.slot < 0 && p.col === col && p.row === row) ?? null;
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

  /** 'stack' doubles a pet's count, 'class' lifts a weapon or gear one class, null when they cannot fuse. */
  canFuse(a: Piece, b: Piece): 'stack' | 'class' | null {
    if (a === b || a.id === b.id || a.type !== b.type || a.level !== b.level) return null;
    if (isPet(a.type)) return a.count === b.count && a.count < MAX_COUNT ? 'stack' : null;
    return a.level < MAX_LEVEL ? 'class' : null;
  }

  private cellAt(t: Target): Piece | null {
    return 'slot' in t ? this.benchAt(t.slot) : this.at(t.col, t.row);
  }
  private valid(t: Target): boolean {
    if ('slot' in t) return Number.isInteger(t.slot) && t.slot >= 0 && t.slot < BENCH_SLOTS;
    return Number.isInteger(t.col) && Number.isInteger(t.row) && t.col >= 0 && t.col < GRID.cols && t.row >= 0 && t.row < GRID.rows;
  }

  /** The answer place() would give, without changing anything. */
  preview(piece: Piece, target: Target): PlaceResult {
    return this.run(piece, target, false);
  }

  place(piece: Piece, target: Target): PlaceResult {
    return this.run(piece, target, true);
  }

  private run(piece: Piece, target: Target, apply: boolean): PlaceResult {
    if (!this.valid(target) || !this.state.pieces.includes(piece)) return { kind: 'denied' };
    const other = this.cellAt(target);
    if (other === piece) return { kind: 'denied' };
    if (!other) {
      if (apply) this.setAt(piece, target);
      return { kind: 'moved', piece };
    }
    const fuse = this.canFuse(piece, other);
    if (fuse) {
      if (apply) {
        if (fuse === 'stack') other.count *= 2;
        else other.level += 1;
        this.remove(piece);
      }
      return { kind: 'fused', piece: other, fuse, gone: piece.id };
    }
    if (apply) {
      const from: Target = piece.slot >= 0 ? { slot: piece.slot } : { col: piece.col, row: piece.row };
      this.setAt(other, from);
      this.setAt(piece, target);
    }
    return { kind: 'swapped', piece };
  }

  private setAt(p: Piece, t: Target): void {
    if ('slot' in t) {
      p.slot = t.slot;
      p.col = -1;
      p.row = -1;
    } else {
      p.slot = -1;
      p.col = t.col;
      p.row = t.row;
    }
  }

  /** A new piece on the first free bench slot, or null when the bench is full. */
  add(type: PieceType, level: number): Piece | null {
    const slot = this.freeBenchSlot();
    if (slot < 0) return null;
    const p: Piece = { id: this.state.nextId++, type, level, count: 1, col: -1, row: -1, slot };
    this.state.pieces.push(p);
    return p;
  }

  remove(piece: Piece): void {
    const i = this.state.pieces.indexOf(piece);
    if (i >= 0) this.state.pieces.splice(i, 1);
  }

  private onGrid(p: Piece): boolean {
    return p.slot < 0 && p.col >= 0;
  }
  private neighbours(p: Piece): Piece[] {
    const out: Piece[] = [];
    for (const [dc, dr] of DIRS) {
      const n = this.at(p.col + dc, p.row + dr);
      if (n) out.push(n);
    }
    return out;
  }

  /**
   * What a pet really uses. The highest class wins; on equal class a weapon type earlier in WEAPON_TYPES wins;
   * for equal pieces the first neighbour in the order up, right, down, left wins.
   */
  private best(pet: Piece): Best {
    const res: Best = { weapon: null, gear: {} };
    for (const n of this.neighbours(pet)) {
      if (isWeapon(n.type)) {
        const w = res.weapon;
        if (!w || n.level > w.level || (n.level === w.level && WEAPON_TYPES.indexOf(n.type) < WEAPON_TYPES.indexOf(w.type as WeaponType))) res.weapon = n;
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

  links(): LinkEdge[] {
    const edges: LinkEdge[] = [];
    for (const pet of this.gridPets()) {
      const b = this.best(pet);
      for (const n of this.neighbours(pet)) {
        if (isPet(n.type)) continue;
        const active = n === b.weapon || (isGear(n.type) && b.gear[n.type] === n);
        edges.push({ c1: pet.col, r1: pet.row, c2: n.col, r2: n.row, active });
      }
    }
    return edges;
  }

  squadOf(pet: Piece): SquadSpec {
    const b = this.onGrid(pet) ? this.best(pet) : { weapon: null, gear: {} as Best['gear'] };
    const lv = (t: GearType) => b.gear[t]?.level ?? 0;
    return {
      key: pet.id,
      pet: pet.type as 'ant' | 'frog',
      level: pet.level,
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
    return this.neighbours(item).filter((n) => {
      if (!isPet(n.type)) return false;
      const b = this.best(n);
      return b.weapon === item || (isGear(item.type) && b.gear[item.type] === item);
    });
  }
}

