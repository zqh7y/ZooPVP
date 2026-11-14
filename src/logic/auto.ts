import { GEAR_TYPES, GRID, WEAPON_TYPES, isGear, isPet, isWeapon } from '../data';
import type { Piece } from '../types';
import type { Inventory } from './inventory';

const DIRS: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * A simple, repeatable layout. First every pair that can fuse is fused (to a fixed point). Then every piece
 * leaves the grid, and pets (strongest first) are put where they have the most free neighbours, each followed
 * by its best unused weapon and one unused gear of each kind next to it. Leftovers go to the bench. No piece is lost.
 */
export function autoArrange(inv: Inventory): void {
  const all = inv.state.pieces;
  // fuse everything that can fuse
  for (let again = true; again; ) {
    again = false;
    for (const a of [...all]) {
      const b = all.find((x) => inv.canFuse(a, x));
      if (!b) continue;
      if (inv.canFuse(a, b) === 'stack') a.count *= 2;
      else a.level += 1;
      inv.remove(b);
      again = true;
      break;
    }
  }
  // lift everything off, keeping the old order as the tie-break
  const order = [...all].sort((a, b) => a.id - b.id);
  for (const p of order) {
    p.col = -1;
    p.row = -1;
    p.slot = -1;
  }
  const taken = new Set<string>();
  const free = (c: number, r: number) => c >= 0 && c < GRID.cols && r >= 0 && r < GRID.rows && !taken.has(`${c},${r}`);
  const put = (p: Piece, c: number, r: number) => {
    p.col = c;
    p.row = r;
    taken.add(`${c},${r}`);
  };
  const freeAround = (c: number, r: number) => DIRS.filter(([dc, dr]) => free(c + dc, r + dr)).length;
  const strength = (p: Piece) => p.level * 10 + Math.log2(p.count) * 3;

  const pets = order.filter((p) => isPet(p.type)).sort((a, b) => strength(b) - strength(a) || a.id - b.id);
  const weapons = order.filter((p) => isWeapon(p.type)).sort((a, b) => b.level - a.level || WEAPON_TYPES.indexOf(a.type as never) - WEAPON_TYPES.indexOf(b.type as never) || a.id - b.id);
  const gears = order.filter((p) => isGear(p.type)).sort((a, b) => b.level - a.level || a.id - b.id);

  for (const pet of pets) {
    let bc = -1, br = -1, bn = -1;
    for (let r = GRID.rows - 1; r >= 0; r--) {
      for (let c = 0; c < GRID.cols; c++) {
        if (!free(c, r)) continue;
        const n = freeAround(c, r);
        if (n > bn) {
          bn = n;
          bc = c;
          br = r;
        }
      }
    }
    if (bc < 0) break;
    put(pet, bc, br);
    const spots = DIRS.map(([dc, dr]) => [bc + dc, br + dr] as const).filter(([c, r]) => free(c, r));
    const wanted: Piece[] = [];
    const w = weapons.find((x) => x.col < 0);
    if (w) wanted.push(w);
    for (const g of GEAR_TYPES) {
      const x = gears.find((y) => y.type === g && y.col < 0);
      if (x) wanted.push(x);
    }
    wanted.slice(0, spots.length).forEach((item, i) => put(item, spots[i][0], spots[i][1]));
  }
  // leftovers: bench first, then any free cell
  let slot = 0;
  for (const p of order) {
    if (p.col >= 0) continue;
    if (slot < 16) {
      p.slot = slot++;
      continue;
    }
    outer: for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (free(c, r)) { put(p, c, r); break outer; }
  }
}
