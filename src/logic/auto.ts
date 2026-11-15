import { BENCH_SLOTS, GEAR_TYPES, GRID, footprint, isGear, isPet, isWeapon, nextPet, rungOf, squadPower } from '../data';
import type { GearType, PetType, Piece, SquadSpec, WeaponType } from '../types';
import { aroundShape, betterWeapon, isOpen, markOwned, shapeCells, type Cell, type Inventory } from './inventory';

/*
 * The AUTO arrange: a simple, repeatable layout that never loses a piece and never leaves the army weaker.
 * 1. Every pair that can stack or lift a class is fused (to a fixed point).
 * 2. Everything leaves the grid. Units go back biggest first (then the highest rung), each where it gets the
 *    most power from its best free weapon and gear placed touching it (items already on the grid count too, so
 *    one item can serve several units), as long as the units still waiting keep room to fit. Locked cells stay
 *    empty.
 * 3. Items still unused go where they lift some unit the most. Units that found no room go to the bench; items
 *    left over fill free cells first (keeping the bench free for new cases), then the bench. If that still
 *    cannot hold everything, the layout is not changed at all.
 * 4. Then evolves, one pair of x4 squads at a time, lowest rung first (then the lowest ids): each is kept only when
 *    the re-stacked, re-packed army is at least as strong as before it (so surplus squads on the bench evolve, and
 *    a full grid is not hollowed out).
 * The result is kept only when POWER >= what AUTO found; else it tries stacks only, then no fusing at all.
 */

/** An evolve AUTO did (show the NEW UNIT reveal when fresh). */
export interface AutoEvolve {
  from: PetType;
  to: PetType;
  fresh: boolean;
}

export function autoArrange(inv: Inventory): { evolves: AutoEvolve[] } {
  const snap = () => ({ objs: [...inv.state.pieces], copy: inv.state.pieces.map((p) => ({ ...p })) });
  // the same objects come back on a failed try (the lobby may hold on to them)
  const restoreTo = (s: ReturnType<typeof snap>) => {
    inv.state.pieces.length = 0;
    s.objs.forEach((o, i) => {
      delete o.turned;
      Object.assign(o, s.copy[i]);
      inv.state.pieces.push(o);
    });
  };
  const start = snap();
  const was = inv.power();
  const evolves: AutoEvolve[] = [];
  if (pack(inv, true) && inv.power() >= was) {
    // evolves, one pair at a time, each kept only when the packed army did not get weaker
    for (let tries = 0; tries < 24; tries++) {
      const pair = evolvePair(inv);
      if (!pair) break;
      const before = snap();
      const power = inv.power();
      const owned = inv.state.owned;
      const [a, b] = pair;
      const from = a.type as PetType;
      const to = nextPet(from)!;
      a.type = to;
      a.count = 1;
      a.level = 1;
      delete a.turned;
      inv.remove(b);
      const fresh = markOwned(inv.state, to);
      if (pack(inv, true) && inv.power() >= power) {
        inv.state.evolves += 1;
        evolves.push({ from, to, fresh });
      } else {
        restoreTo(before);
        inv.state.owned = owned;
        break;
      }
    }
    return { evolves };
  }
  restoreTo(start);
  if (pack(inv, false) && inv.power() >= was) return { evolves };
  restoreTo(start);
  return { evolves };
}

/** The x4 pair AUTO would evolve next: the lowest rung, then the lowest ids. */
function evolvePair(inv: Inventory): [Piece, Piece] | null {
  const fours = inv.state.pieces.filter((p) => isPet(p.type) && p.count === 4 && nextPet(p.type as PetType)).sort((a, b) => rungOf(a.type as PetType) - rungOf(b.type as PetType) || a.id - b.id);
  for (let i = 0; i < fours.length; i++) {
    const mate = fours.slice(i + 1).find((q) => q.type === fours[i].type);
    if (mate) return [fours[i], mate];
  }
  return null;
}

const KEY = (c: number, r: number) => r * GRID.cols + c;

function pack(inv: Inventory, fuse: boolean): boolean {
  const all = inv.state.pieces;
  if (fuse) {
    for (let again = true; again; ) {
      again = false;
      const sorted = [...all].sort((a, b) => a.id - b.id);
      for (const a of sorted) {
        const b = sorted.find((x) => {
          const k = inv.canFuse(a, x);
          return k === 'stack' || k === 'class';
        });
        if (!b) continue;
        if (inv.canFuse(a, b) === 'stack') {
          a.count *= 2;
          if (a.count !== 2) delete a.turned;
        } else a.level += 1;
        inv.remove(b);
        again = true;
        break;
      }
    }
  }
  const order = [...all].sort((a, b) => a.id - b.id);
  for (const p of order) {
    p.col = -1;
    p.row = -1;
    p.slot = -1;
  }
  const occ: (Piece | null)[] = new Array(GRID.cols * GRID.rows).fill(null);
  const isFree = (c: number, r: number) => isOpen(inv.state, c, r) && !occ[KEY(c, r)];
  const fits = (cells: readonly Cell[]) => cells.every((x) => isFree(x.col, x.row));
  const put = (p: Piece, c: number, r: number) => {
    p.col = c;
    p.row = r;
    p.slot = -1;
    const f = footprint(p);
    for (const x of shapeCells(f.w, f.h, c, r)) occ[KEY(x.col, x.row)] = p;
  };

  const rung = (p: Piece) => rungOf(p.type as PetType);
  const pets = order.filter((p) => isPet(p.type)).sort((a, b) => b.count - a.count || rung(b) - rung(a) || a.id - b.id);
  const weapons = order.filter((p) => isWeapon(p.type)).sort((a, b) => (betterWeapon(a, b) ? -1 : betterWeapon(b, a) ? 1 : a.id - b.id));
  const gears = order.filter((p) => isGear(p.type)).sort((a, b) => b.level - a.level || a.id - b.id);
  const used = new Set<Piece>();
  const shapesOf = (p: Piece) => (p.count === 2 ? [false, true] : [false]);

  /** can these units still all be put on the free cells (first fit, biggest first)? */
  const roomFor = (rest: readonly Piece[], extra: ReadonlySet<number>) => {
    const taken = new Set(extra);
    const ok = (cells: readonly Cell[]) => cells.every((x) => isFree(x.col, x.row) && !taken.has(KEY(x.col, x.row)));
    for (const p of rest) {
      let placed = false;
      for (const turned of shapesOf(p)) {
        const f = footprint({ ...p, turned });
        for (let r = 0; r <= GRID.rows - f.h && !placed; r++)
          for (let c = 0; c <= GRID.cols - f.w && !placed; c++) {
            const cells = shapeCells(f.w, f.h, c, r);
            if (!ok(cells)) continue;
            for (const x of cells) taken.add(KEY(x.col, x.row));
            placed = true;
          }
        if (placed) break;
      }
      if (!placed) return false;
    }
    return true;
  };

  /** the unit's squad with the best items touching it */
  const specOf = (pet: Piece, w: Piece | null, g: Partial<Record<GearType, Piece>>): SquadSpec => ({
    key: pet.id, pet: pet.type as PetType, count: pet.count,
    weapon: w ? (w.type as WeaponType) : null, weaponLevel: w ? w.level : 0,
    helmet: g.helmet?.level ?? 0, sneakers: g.sneakers?.level ?? 0, chili: g.chili?.level ?? 0,
  });
  /** what already touches a shape on the grid */
  const touchingItems = (w: number, h: number, c: number, r: number) => {
    let weapon: Piece | null = null;
    const gear: Partial<Record<GearType, Piece>> = {};
    const freeCells: Cell[] = [];
    for (const e of aroundShape(w, h, c, r)) {
      const n = occ[KEY(e.cell.col, e.cell.row)];
      if (!n) {
        // a locked cell is never a spot for an item
        if (isFree(e.cell.col, e.cell.row) && !freeCells.some((x) => x.col === e.cell.col && x.row === e.cell.row)) freeCells.push(e.cell);
      } else if (isWeapon(n.type)) {
        if (betterWeapon(n, weapon)) weapon = n;
      } else if (isGear(n.type)) {
        const k = n.type as GearType;
        if (!gear[k] || n.level > gear[k]!.level) gear[k] = n;
      }
    }
    return { weapon, gear, freeCells };
  };
  const freeAround = (c: number, r: number) => [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dc, dr]) => isFree(c + dc, r + dr)).length;

  for (let i = 0; i < pets.length; i++) {
    const pet = pets[i];
    const rest = pets.slice(i + 1);
    type Cand = { score: number[]; turned: boolean; c: number; r: number; items: { p: Piece; cell: Cell }[] };
    let best: Cand | null = null;
    let fallback: Cand | null = null;
    for (const turned of shapesOf(pet)) {
      const f = footprint({ ...pet, turned });
      for (let r = GRID.rows - f.h; r >= 0; r--) {
        for (let c = 0; c <= GRID.cols - f.w; c++) {
          const cells = shapeCells(f.w, f.h, c, r);
          if (!fits(cells)) continue;
          const own = new Set(cells.map((x) => KEY(x.col, x.row)));
          const t = touchingItems(f.w, f.h, c, r);
          // the cells kept free for new items: the ones with the most free cells around them first
          const spots = t.freeCells.slice().sort((a, b) => freeAround(b.col, b.row) - freeAround(a.col, a.row) || a.row - b.row || a.col - b.col);
          const items: { p: Piece; cell: Cell }[] = [];
          const taken = new Set(own);
          let weapon = t.weapon;
          const gear = { ...t.gear };
          const wants: Piece[] = [];
          // of the free weapons that would be its best, the one that makes it strongest
          let w: Piece | null = null;
          let wp = -1;
          for (const x of weapons) {
            if (used.has(x) || !betterWeapon(x, weapon) || (w && x.type === w.type)) continue;
            const p = squadPower(specOf(pet, x, gear));
            if (p > wp + 1e-9) {
              w = x;
              wp = p;
            }
          }
          if (w) wants.push(w);
          for (const g of GEAR_TYPES) {
            const x = gears.find((y) => y.type === g && !used.has(y));
            if (x && (!gear[g] || x.level > gear[g]!.level)) wants.push(x);
          }
          for (const want of wants) {
            const spot = spots.find((s) => !taken.has(KEY(s.col, s.row)));
            if (!spot) break;
            const k = new Set(taken);
            k.add(KEY(spot.col, spot.row));
            if (!roomFor(rest, k)) continue;
            taken.add(KEY(spot.col, spot.row));
            items.push({ p: want, cell: spot });
            if (isWeapon(want.type)) weapon = want;
            else gear[want.type as GearType] = want;
          }
          const power = squadPower(specOf(pet, weapon, gear));
          // edges and pieces around it (hugging keeps the rest of the grid open), then the bottom rows first
          const hug = t.freeCells.length;
          const score = [-Math.round(power * 100), items.length, hug, -r, c, turned ? 1 : 0];
          const cand = { score, turned, c, r, items };
          if (!fallback || lessArr(score, fallback.score)) fallback = cand;
          if (!roomFor(rest, own)) continue;
          if (!best || lessArr(score, best.score)) best = cand;
        }
      }
    }
    const pick = best ?? fallback;
    if (!pick) continue;
    if (pet.count === 2) pet.turned = pick.turned;
    put(pet, pick.c, pick.r);
    used.add(pet);
    for (const it of pick.items) {
      put(it.p, it.cell.col, it.cell.row);
      used.add(it.p);
    }
  }

  // unused items where they lift the pets they touch the most
  const placedPets = pets.filter((p) => used.has(p));
  const petPower = (pet: Piece) => {
    const f = footprint(pet);
    const t = touchingItems(f.w, f.h, pet.col, pet.row);
    return squadPower(specOf(pet, t.weapon, t.gear));
  };
  for (const item of [...weapons, ...gears]) {
    if (used.has(item)) continue;
    let bestGain = 1e-9;
    let bestCell: Cell | null = null;
    for (let r = 0; r < GRID.rows; r++)
      for (let c = 0; c < GRID.cols; c++) {
        if (!isFree(c, r)) continue;
        const near = placedPets.filter((p) => {
          const f = footprint(p);
          return aroundShape(f.w, f.h, p.col, p.row).some((e) => e.cell.col === c && e.cell.row === r);
        });
        if (near.length === 0) continue;
        const was = near.map(petPower);
        occ[KEY(c, r)] = item;
        const gain = near.reduce((a, p, k) => a + petPower(p) - was[k], 0);
        occ[KEY(c, r)] = null;
        if (gain > bestGain + 1e-9) {
          bestGain = gain;
          bestCell = { col: c, row: r };
        }
      }
    if (bestCell) {
      put(item, bestCell.col, bestCell.row);
      used.add(item);
    }
  }

  // leftovers: pets that found no room go to the bench; unused items onto free cells (the top rows first, so
  // the bench stays free for new rolls), and only when the grid is full onto the bench
  let slot = 0;
  for (const p of pets) {
    if (used.has(p)) continue;
    if (slot >= BENCH_SLOTS) return false;
    p.slot = slot++;
  }
  for (const p of order) {
    if (isPet(p.type) || used.has(p)) continue;
    let done = false;
    for (let r = 0; r < GRID.rows && !done; r++)
      for (let c = 0; c < GRID.cols && !done; c++) {
        if (!isFree(c, r)) continue;
        put(p, c, r);
        done = true;
      }
    if (done) continue;
    if (slot >= BENCH_SLOTS) return false;
    p.slot = slot++;
  }
  return true;
}

function lessArr(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
