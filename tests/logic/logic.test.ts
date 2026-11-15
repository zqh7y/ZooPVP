import { describe, expect, it } from 'vitest';
import {
  BENCH_SLOTS, CELL_LOCKS, CELL_PRICE, ECON, ENEMY, GRID, MAX_COUNT, PETS, PET_INFO, PET_TYPES, PITY, PIECE_NAME, SCRIPTED_ROLLS, START_OPEN, STARTER_KIT,
  WAVES, armyPower, cellBit, classOdds, clearCash, footprint, homeRung, isPet, koCash, nextPet, petOdds, recommendedPower, rungOf, sellValue, squadPower,
  stageGems, tierOf,
} from '../../src/data';
import { makeRng } from '../../src/rng';
import type { PetType, Piece, PieceType, SaveState, SquadSpec, WaveOutcome } from '../../src/types';
import type { SimSummary } from '../../src/sim/types';
import { Inventory, LOCKED, TOP_OF_LADDER, cellsOf, isOpen, isOwned, ownedRungs } from '../../src/logic/inventory';
import { caseBlock, caseOdds, casePrice, openCase } from '../../src/logic/rolls';
import { applyWave, cellLock, cellPrice, cellProgress, openEarned, outcomeOf, unlockCell } from '../../src/logic/progress';
import { enemyArmy, fightSeed, nextWave, waveFighters, waveInfo } from '../../src/logic/waves';
import { SAVE_VERSION, load, newSave, repair, replacedOldSave, save } from '../../src/logic/save';
import { autoArrange } from '../../src/logic/auto';
import { runBattle } from '../../src/sim/battle';

const ALL_OPEN = (1 << (GRID.cols * GRID.rows)) - 1;
/** a save with nothing in it and every cell open (the grid tests do not care about locks) */
const empty = (extra: Partial<SaveState> = {}): SaveState => ({ ...newSave(), pieces: [], nextId: 1, open: ALL_OPEN, ...extra });
const inv0 = () => new Inventory(empty());
function put(inv: Inventory, type: PieceType, level: number, c: number, r: number, count = 1, turned?: boolean): Piece {
  const p = inv.add(type, level)!;
  p.count = count;
  if (turned) p.turned = true;
  expect(inv.place(p, { col: c, row: r }).kind).toBe('moved');
  return p;
}
/** every grid cell is covered by at most one piece and is open, every piece is inside the grid or on its own tray slot */
function valid(inv: Inventory) {
  const seen = new Set<string>();
  const slots = new Set<number>();
  for (const p of inv.pieces) {
    if (p.slot >= 0) {
      expect(p.slot).toBeLessThan(BENCH_SLOTS);
      expect(slots.has(p.slot)).toBe(false);
      slots.add(p.slot);
      continue;
    }
    for (const c of cellsOf(p)) {
      expect(c.col >= 0 && c.col < GRID.cols && c.row >= 0 && c.row < GRID.rows).toBe(true);
      expect(isOpen(inv.state, c.col, c.row)).toBe(true);
      expect(seen.has(`${c.col},${c.row}`)).toBe(false);
      seen.add(`${c.col},${c.row}`);
      expect(inv.at(c.col, c.row)).toBe(p);
    }
  }
}
const spec = (pet: PetType, count = 1, o: Partial<SquadSpec> = {}): SquadSpec => ({ key: 0, pet, count, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0, ...o });

describe('the cast', () => {
  it('twelve units in rung order, each with a name, a trait line and a kick-off row', () => {
    expect(PET_TYPES).toEqual(['sprout', 'buzzy', 'ninja', 'snailor', 'roo', 'cacto', 'pogo', 'briar', 'angler', 'sumo', 'rhino', 'boulder']);
    PET_TYPES.forEach((p, i) => {
      expect(rungOf(p)).toBe(i + 1);
      expect(PIECE_NAME[p]).toBe(PET_INFO[p].name);
      expect(PET_INFO[p].trait.length).toBeGreaterThan(8);
      expect(PET_INFO[p].row).toBe(PETS[p].row);
    });
    expect(nextPet('sprout')).toBe('buzzy');
    expect(nextPet('boulder')).toBeNull();
    expect(PET_TYPES.map((p) => tierOf(rungOf(p)))).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
  });
  it('POWER doubles every rung (bare), and a boss is worth more than its unit', () => {
    for (let k = 1; k < PET_TYPES.length; k++) {
      const ratio = squadPower(spec(PET_TYPES[k])) / squadPower(spec(PET_TYPES[k - 1]));
      expect(Math.abs(ratio - 2)).toBeLessThan(0.03);
    }
    // stacking keeps POWER exactly; evolving doubles it per cell
    expect(squadPower(spec('roo', 2))).toBeCloseTo(2 * squadPower(spec('roo')), 6);
    expect(squadPower(spec('cacto')) / squadPower(spec('roo', 4)) * 4).toBeGreaterThan(1.95);
    expect(squadPower(spec('roo', 1, { boss: true }))).toBeGreaterThan(3 * squadPower(spec('roo')));
  });
});

describe('footprints', () => {
  it('weapons and gear 1 x 1, units by count, a pair turns', () => {
    expect(GRID).toEqual({ cols: 5, rows: 5 });
    expect(BENCH_SLOTS).toBe(4);
    expect(MAX_COUNT).toBe(4);
    expect(footprint({ type: 'knife', count: 1 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ type: 'chili', count: 4 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ type: 'sprout', count: 1 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ type: 'sprout', count: 2 })).toEqual({ w: 2, h: 1 });
    expect(footprint({ type: 'roo', count: 2, turned: true })).toEqual({ w: 1, h: 2 });
    expect(footprint({ type: 'roo', count: 4, turned: true })).toEqual({ w: 2, h: 2 });
  });
  it('at() finds a piece by any of its cells', () => {
    const inv = inv0();
    const big = put(inv, 'roo', 1, 1, 1, 4);
    for (const [c, r] of [[1, 1], [2, 1], [1, 2], [2, 2]]) expect(inv.at(c, r)).toBe(big);
    expect(inv.at(3, 1)).toBeNull();
    expect(inv.at(0, 0)).toBeNull();
    expect(inv.at(-1, 0)).toBeNull();
  });
});

describe('inventory', () => {
  it('moves, swaps grid and tray, fuses items', () => {
    const inv = inv0();
    const a = inv.add('sprout', 1)!;
    expect(inv.place(a, { col: 2, row: 2 }).kind).toBe('moved');
    const k = inv.add('knife', 1)!;
    expect(inv.place(k, { col: 2, row: 2 }).kind).toBe('swapped');
    expect(a.slot).toBe(0);
    expect(k.col).toBe(2);
    const k2 = inv.add('knife', 1)!;
    expect(inv.place(k2, { col: 2, row: 2 })).toMatchObject({ kind: 'fused', fuse: 'class', gone: k2.id });
    expect(k.level).toBe(2);
    expect(inv.piece(k2.id)).toBeNull();
    valid(inv);
  });
  it('previews without change and denies bad targets', () => {
    const inv = inv0();
    const a = inv.add('sprout', 1)!;
    const b = put(inv, 'sprout', 1, 0, 0);
    expect(inv.preview(a, { col: 0, row: 0 })).toMatchObject({ kind: 'fused', fuse: 'stack' });
    expect(a.slot).toBe(0);
    expect(b.count).toBe(1);
    expect(inv.place(a, { col: GRID.cols, row: 0 }).kind).toBe('denied');
    expect(inv.place(a, { slot: BENCH_SLOTS }).kind).toBe('denied');
    expect(inv.place(b, { col: 0, row: 0 })).toEqual({ kind: 'denied' }); // dropped where it is
  });
  it('a pair must fit inside the grid and on free cells', () => {
    const inv = inv0();
    const pair = inv.add('sprout', 1)!;
    pair.count = 2;
    const deny = inv.place(pair, { col: 4, row: 0 });
    expect(deny.kind).toBe('denied');
    expect(deny.reason).toBeTruthy();
    expect(inv.place(pair, { col: 3, row: 0 }).kind).toBe('moved');
    expect(inv.at(4, 0)).toBe(pair);
    expect(inv.place(pair, { col: 2, row: 0 }).kind).toBe('moved'); // shifting onto its own cell is fine
    expect(inv.at(4, 0)).toBeNull();
    put(inv, 'knife', 1, 1, 1);
    put(inv, 'helmet', 1, 2, 1);
    const big = inv.add('roo', 1)!;
    big.count = 4;
    const two = inv.place(big, { col: 1, row: 0 });
    expect(two).toMatchObject({ kind: 'denied', reason: 'No room there' });
    valid(inv);
  });
  it('stacking grows the unit in place: 1 -> 2 -> 4 cells', () => {
    const inv = inv0();
    const a = put(inv, 'sprout', 1, 1, 1);
    const b = inv.add('sprout', 1)!;
    expect(inv.place(b, { col: 1, row: 1 })).toMatchObject({ kind: 'fused', fuse: 'stack', piece: a, gone: b.id });
    expect(a.count).toBe(2);
    expect(footprint(a)).toEqual({ w: 2, h: 1 });
    const c = put(inv, 'sprout', 1, 0, 4, 2);
    expect(inv.place(c, { col: 0, row: 1 })).toMatchObject({ kind: 'fused', piece: a });
    expect(a.count).toBe(4);
    expect([a.col, a.row]).toEqual([1, 1]);
    valid(inv);
  });
  it('a grown unit takes the nearest spot covering the mate, else the nearest spot anywhere, else the tray slot', () => {
    const inv = inv0();
    const a = put(inv, 'roo', 1, 4, 4);
    expect(inv.place(inv.add('roo', 1)!, { col: 4, row: 4 }).kind).toBe('fused');
    expect(cellsOf(a).map((x) => `${x.col},${x.row}`)).toContain('4,4');
    // a pair boxed in by items grows into a square elsewhere
    const inv2 = inv0();
    const p = put(inv2, 'sprout', 1, 0, 0, 2);
    put(inv2, 'knife', 1, 0, 1);
    put(inv2, 'bat', 1, 1, 1);
    put(inv2, 'spear', 1, 2, 0);
    const q = inv2.add('sprout', 1)!;
    q.count = 2;
    expect(inv2.place(q, { col: 0, row: 0 })).toMatchObject({ kind: 'fused', fuse: 'stack', piece: p });
    expect(p.count).toBe(4);
    expect([p.col, p.row]).toEqual([0, 2]); // the nearest free square to where it was
    valid(inv2);
    // the starter's first fuse (Sprout in a corner of the 3 x 3 between its knife and helmet) never fails
    const s = { ...newSave(), pieces: [], nextId: 1 };
    const inv3 = new Inventory(s);
    const sp = put(inv3, 'sprout', 1, 1, 3);
    put(inv3, 'knife', 1, 1, 2);
    put(inv3, 'helmet', 1, 2, 3);
    for (const [c, r] of [[2, 1], [3, 1], [1, 1], [2, 2], [3, 2]]) put(inv3, 'chili', 1, c, r);
    put(inv3, 'bat', 1, 3, 3); // the 3 x 3 is full
    const t = inv3.add('sprout', 1)!;
    const slot = t.slot;
    expect(inv3.place(t, { col: 1, row: 3 })).toMatchObject({ kind: 'fused', fuse: 'stack', piece: sp });
    expect(sp).toMatchObject({ count: 2, slot, col: -1 });
    valid(inv3);
  });
  it('turns a pair on the grid when it fits', () => {
    const inv = inv0();
    const p = put(inv, 'sprout', 1, 1, 1, 2);
    expect(inv.turn(p)).toEqual({ ok: true });
    expect(footprint(p)).toEqual({ w: 1, h: 2 });
    put(inv, 'knife', 1, 2, 1);
    expect(inv.turn(p)).toMatchObject({ ok: false, reason: 'No room to turn it' });
    valid(inv);
  });
  it('the tray has 4 slots of any size', () => {
    const inv = inv0();
    for (let i = 0; i < BENCH_SLOTS; i++) expect(inv.add(i % 2 ? 'roo' : 'knife', 1)).not.toBeNull();
    expect(inv.freeBenchSlot()).toBe(-1);
    expect(inv.add('sprout', 1)).toBeNull();
  });
  it('links: the used weapon and gear are active; POWER is the squads', () => {
    const inv = inv0();
    const pet = put(inv, 'roo', 1, 1, 1, 4);
    put(inv, 'spear', 2, 1, 0);
    put(inv, 'knife', 3, 3, 2);
    put(inv, 'helmet', 1, 2, 3);
    put(inv, 'helmet', 2, 1, 3);
    put(inv, 'chili', 1, 4, 4);
    const s = inv.squadOf(pet);
    expect(s).toMatchObject({ pet: 'roo', weapon: 'knife', weaponLevel: 3, helmet: 2, chili: 0, count: 4 });
    expect(inv.links().filter((e) => e.active).length).toBe(2);
    expect(inv.power()).toBe(armyPower([s]));
    inv.add('sprout', 1); // tray units do not fight
    expect(inv.squads().length).toBe(1);
  });
});

describe('evolve', () => {
  it('canFuse: stack under x4, evolve at x4, nothing for two x4 Boulders', () => {
    const inv = inv0();
    const mk = (t: PieceType, count: number) => Object.assign(inv.add(t, 1) ?? inv.add('knife', 1)!, { count });
    const a = mk('sprout', 2);
    const b = mk('sprout', 2);
    expect(inv.canFuse(a, b)).toBe('stack');
    a.count = b.count = 4;
    expect(inv.canFuse(a, b)).toBe('evolve');
    a.type = b.type = 'boulder';
    expect(inv.canFuse(a, b)).toBeNull();
    a.type = 'sprout';
    expect(inv.canFuse(a, b)).toBeNull();
    // on the tray two x4 Boulders say why
    expect(inv.place(Object.assign(a, { type: 'boulder' }), { slot: b.slot })).toEqual({ kind: 'denied', reason: TOP_OF_LADDER });
  });
  it('two x4 on the grid become one x1 of the next rung on the drop cell, freeing 7 cells', () => {
    const s = empty();
    const inv = new Inventory(s);
    const mate = put(inv, 'sprout', 1, 1, 1, 4);
    const other = put(inv, 'sprout', 1, 3, 3, 4);
    expect(isOwned(s, 'buzzy')).toBe(false);
    const pre = inv.preview(other, { col: 2, row: 2 });
    expect(pre).toMatchObject({ kind: 'fused', fuse: 'evolve', from: 'sprout', to: 'buzzy', fresh: true });
    expect(mate.type).toBe('sprout');
    const res = inv.place(other, { col: 2, row: 2 });
    expect(res).toMatchObject({ kind: 'fused', fuse: 'evolve', to: 'buzzy', fresh: true, gone: other.id });
    expect(mate).toMatchObject({ type: 'buzzy', count: 1, level: 1, col: 2, row: 2 });
    expect(inv.pieces.length).toBe(1);
    expect(s.evolves).toBe(1);
    expect(isOwned(s, 'buzzy')).toBe(true);
    expect(ownedRungs(s)).toEqual([1, 2]);
    valid(inv);
    // dropped so the drop cell is outside the mate: the mate's top-left cell
    const m2 = put(inv, 'ninja', 1, 0, 0, 4);
    const o2 = inv.add('ninja', 1)!;
    o2.count = 4;
    expect(inv.place(o2, { col: 1, row: 0 })).toMatchObject({ fuse: 'evolve', to: 'snailor' });
    expect([m2.col, m2.row, m2.type]).toEqual([1, 0, 'snailor']);
    // on the tray the new unit keeps the mate's slot
    const t1 = inv.add('roo', 1)!;
    const t2 = inv.add('roo', 1)!;
    t1.count = t2.count = 4;
    const slot = t1.slot;
    expect(inv.place(t2, { slot })).toMatchObject({ fuse: 'evolve', to: 'cacto' });
    expect(t1).toMatchObject({ type: 'cacto', count: 1, slot });
    valid(inv);
  });
});

describe('cells', () => {
  it('the middle 3 x 3 is open; every other cell has a lock', () => {
    const s = newSave();
    expect(s.open).toBe(START_OPEN);
    let n = 0;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) {
        const mid = c >= 1 && c <= 3 && r >= 1 && r <= 3;
        expect(isOpen(s, c, r)).toBe(mid);
        if (!mid) {
          expect(cellLock(s, c, r)).toEqual(CELL_LOCKS[`${c},${r}`]);
          n++;
        }
      }
    expect(n).toBe(16);
    expect(Object.keys(CELL_LOCKS).length).toBe(16);
  });
  it('nothing goes on a locked cell: placing, growing, AUTO', () => {
    const s = { ...newSave(), pieces: [], nextId: 1 };
    const inv = new Inventory(s);
    const k = inv.add('knife', 1)!;
    expect(inv.place(k, { col: 0, row: 0 })).toMatchObject({ kind: 'denied', reason: LOCKED });
    expect(inv.place(k, { col: 1, row: 1 }).kind).toBe('moved');
    const pair = inv.add('sprout', 1)!;
    pair.count = 2;
    expect(inv.place(pair, { col: 3, row: 2 })).toMatchObject({ kind: 'denied', reason: LOCKED });
    for (let i = 0; i < 3; i++) inv.add(i ? 'roo' : 'chili', 1);
    autoArrange(inv);
    valid(inv);
    expect(inv.spotFor(inv.add('helmet', 1) ?? s.pieces[0])).not.toBeNull();
  });
  it('cash cells cost more each time; stage and knock-out cells open when earned', () => {
    const s = newSave();
    s.cash = 0;
    expect(unlockCell(s, 0, 1)).toMatchObject({ ok: false, reason: 'Not enough cash' });
    s.cash = 1000;
    expect(cellPrice(s)).toBe(CELL_PRICE.cost);
    expect(unlockCell(s, 0, 1)).toEqual({ ok: true, cost: CELL_PRICE.cost });
    expect(cellPrice(s)).toBe(CELL_PRICE.cost + CELL_PRICE.step);
    expect(isOpen(s, 0, 1)).toBe(true);
    expect(unlockCell(s, 0, 1).ok).toBe(false);
    expect(s.cash).toBe(1000 - CELL_PRICE.cost);
    expect(unlockCell(s, 1, 0)).toMatchObject({ ok: false, reason: 'Opens at stage 2' });
    expect(cellProgress(s, 1, 4)).toMatchObject({ lock: { kind: 'ko', count: 30 }, have: 0, need: 30 });
    s.stage = 3;
    s.kos = 30;
    const opened = openEarned(s).map((c) => `${c.col},${c.row}`).sort();
    expect(opened).toEqual(['1,0', '1,4', '2,0']);
    expect(openEarned(s)).toEqual([]);
  });
});

describe('trash and auto-place', () => {
  it('sells a piece for a little cash, never the last unit', () => {
    const s = empty();
    const inv = new Inventory(s);
    const knife = put(inv, 'knife', 3, 0, 0);
    const pet = put(inv, 'roo', 1, 1, 0, 2);
    s.cash = 0;
    expect(inv.trash(knife)).toEqual({ ok: true, cash: sellValue(knife) });
    expect(s.cash).toBe(4);
    expect(inv.trash(pet)).toMatchObject({ ok: false, reason: 'Keep at least one unit' });
    const two = inv.add('sprout', 1)!;
    expect(inv.trash(pet)).toEqual({ ok: true, cash: 10 });
    expect(s.pieces).toEqual([two]);
  });
  it('spotFor finds the first open spot that fits, the bottom rows first', () => {
    const inv = new Inventory({ ...newSave(), pieces: [], nextId: 1 });
    const big = inv.add('roo', 1)!;
    big.count = 4;
    expect(inv.spotFor(big)).toEqual({ col: 1, row: 2, turned: false });
    const pair = inv.add('sprout', 1)!;
    pair.count = 2;
    inv.place(big, { col: 1, row: 2 });
    put(inv, 'knife', 1, 2, 1);
    expect(inv.spotFor(pair)).toEqual({ col: 3, row: 2, turned: true });
    expect(inv.autoPlace(pair)).toMatchObject({ kind: 'moved' });
    expect(pair).toMatchObject({ col: 3, row: 2, turned: true, slot: -1 });
    const k = inv.add('knife', 1)!;
    expect(inv.autoPlace(k)).toMatchObject({ kind: 'moved' });
    expect(inv.autoPlace(inv.add('bat', 1)!)).toMatchObject({ kind: 'moved' }); // the last free open cell
    expect(inv.autoPlace(inv.add('spear', 1)!)).toMatchObject({ kind: 'denied', reason: 'No room on the grid' });
  });
});

describe('cases', () => {
  it('the first CASEs are the scripted ones and teach Sprout + Sprout -> x2', () => {
    const s = newSave();
    expect(s.cash).toBe(ECON.startCash);
    // the guide first puts the starter kit on the grid, so the tray has room for the cases
    autoArrange(new Inventory(s));
    expect(s.pieces.every((p) => p.slot < 0)).toBe(true);
    const got = [];
    for (let i = 0; i < SCRIPTED_ROLLS.length; i++) {
      const r = openCase(s, 'case', makeRng(i))!;
      expect(r).not.toBeNull();
      got.push({ type: r.type, level: r.level });
      expect(r.piece.slot).toBeGreaterThanOrEqual(0);
    }
    expect(got).toEqual(SCRIPTED_ROLLS);
    const inv = new Inventory(s);
    const [a, b] = s.pieces.filter((p) => p.type === 'sprout');
    expect(inv.place(b, { col: a.col, row: a.row })).toMatchObject({ fuse: 'stack' });
    expect(a.count).toBe(2);
  });
  it('CASE costs cash and climbs; ELITE costs gems; a full tray or no money blocks', () => {
    const s = empty({ cash: 1000, gems: 100 });
    const p0 = casePrice(s, 'case');
    openCase(s, 'case', makeRng(1));
    openCase(s, 'case', makeRng(2));
    expect(s.cash).toBe(1000 - p0 - casePrice({ cases: 1 }, 'case'));
    expect(casePrice(s, 'case')).toBeGreaterThanOrEqual(p0);
    expect(casePrice({ cases: 40 }, 'case')).toBeGreaterThan(p0 + 10);
    const g = s.gems;
    const e = openCase(s, 'elite', makeRng(3))!;
    expect(e.case).toBe('elite');
    expect(s.gems).toBe(g - ECON.eliteCost);
    expect(e.price).toBe(ECON.eliteCost);
    openCase(s, 'case', makeRng(4));
    expect(caseBlock(s, 'case')).toBe('The tray is full');
    expect(openCase(s, 'case', makeRng(5))).toBeNull();
    expect(caseBlock(empty({ cash: 0 }), 'case')).toBe('Not enough cash');
    expect(caseBlock(empty({ gems: 0 }), 'elite')).toBe('Not enough gems');
  });
  it('a roll says what it gave: type, class or rung, and whether the unit is new', () => {
    const s = empty({ cash: 1e9, cases: 10 });
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = openCase(s, 'case', makeRng(i + 7))!;
      seen.add(r.type);
      if (isPet(r.type)) {
        expect(r.rung).toBe(rungOf(r.type));
        expect(r.level).toBe(1);
      } else {
        expect(r.rung).toBe(0);
        expect(r.level >= 1 && r.level <= 7).toBe(true);
        expect(r.fresh).toBe(false);
      }
      expect(s.pieces).toContain(r.piece);
      new Inventory(s).remove(r.piece);
    }
    expect(seen.size).toBeGreaterThan(8);
    // fresh only the first time a unit is owned
    const t = empty({ cash: 1e9, cases: 10, owned: 1 });
    let fresh = 0;
    for (let i = 0; i < 200; i++) {
      const r = openCase(t, 'case', makeRng(i))!;
      if (r.fresh) fresh++;
      new Inventory(t).remove(r.piece);
    }
    expect(fresh).toBe(ownedRungs(t).length - 1);
  });
  it('the odds improve with the stage; an ELITE is never E-class and never a Sprout', () => {
    const mean = (o: number[]) => o.reduce((a, p, i) => a + p * (i + 1), 0) / 100;
    expect(mean(petOdds(homeRung(1)))).toBeLessThan(mean(petOdds(homeRung(5))));
    expect(mean(petOdds(homeRung(5)))).toBeLessThan(mean(petOdds(homeRung(12))));
    expect(classOdds(1)[0]).toBeGreaterThan(classOdds(10)[0]);
    expect(classOdds(4, true)[0]).toBe(0);
    expect(classOdds(4, true).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(caseOdds({ stage: 3 }, 'elite').rungs[0]).toBe(0);
    expect(mean(caseOdds({ stage: 3 }, 'elite').rungs)).toBeGreaterThan(mean(caseOdds({ stage: 3 }, 'case').rungs));
    const s = empty({ cash: 0, gems: 1e9 });
    for (let i = 0; i < 300; i++) {
      const r = openCase(s, 'elite', makeRng(i))!;
      expect(r.type).not.toBe('sprout');
      if (!isPet(r.type)) expect(r.level).toBeGreaterThanOrEqual(2);
      new Inventory(s).remove(r.piece);
    }
  });
  it('pity: after PITY cases without a top piece the next one is guaranteed', () => {
    const s = empty({ cash: 1e9, cases: 10, pity: PITY });
    const r = openCase(s, 'case', makeRng(3))!;
    expect(r.pity).toBe(true);
    expect(isPet(r.type) ? r.rung >= 3 : r.level >= 5).toBe(true);
    expect(s.pity).toBe(0);
  });
  it('is seeded by the save when no rng is given', () => {
    const a = empty({ cash: 1e6, cases: 10 });
    const b = empty({ cash: 1e6, cases: 10 });
    for (let i = 0; i < 3; i++) expect(openCase(a, 'case')!.type).toBe(openCase(b, 'case')!.type);
  });
});

describe('waves', () => {
  it('recommended power rises through a stage, peaks at the boss, and keeps rising stage by stage', () => {
    for (let stage = 1; stage <= 15; stage++) {
      for (let w = 2; w <= WAVES; w++) expect(recommendedPower(stage, w)).toBeGreaterThanOrEqual(recommendedPower(stage, w - 1));
      expect(recommendedPower(stage + 1, 1)).toBeGreaterThan(recommendedPower(stage, 1));
      // a new stage opens below the boss it follows (stage 1 is the starter's ramp: its boss is gentler)
      if (stage >= 2) expect(recommendedPower(stage + 1, 1)).toBeLessThan(recommendedPower(stage, WAVES));
    }
    expect(recommendedPower(1, 1)).toBeLessThan(20);
  });
  it('the enemy army: about share x recommended POWER, more fighters and higher rungs later, the same for the same seed', () => {
    let lastTop = 0;
    for (let stage = 1; stage <= 12; stage++) {
      const w = enemyArmy(stage, 5, 77);
      expect(w).toEqual(enemyArmy(stage, 5, 77));
      const p = armyPower(w.squads);
      expect(Math.abs(p / (recommendedPower(stage, 5) * ENEMY.share) - 1)).toBeLessThan(ENEMY.tolerance + 0.02);
      expect(w.squads.every((q) => !q.boss && [1, 2, 4].includes(q.count))).toBe(true);
      expect(w.squads.length).toBeLessThanOrEqual(ENEMY.maxSquads);
      const top = Math.max(...w.squads.map((q) => rungOf(q.pet)));
      expect(top).toBeGreaterThanOrEqual(lastTop - 1);
      lastTop = Math.max(lastTop, top);
    }
    expect(lastTop).toBeGreaterThanOrEqual(5);
    expect(waveFighters(1, 1)).toBe(1);
    expect(waveFighters(8, 9)).toBeGreaterThan(waveFighters(2, 9));
    // armies differ from seed to seed
    const kinds = new Set<string>();
    for (let seed = 0; seed < 20; seed++) kinds.add(enemyArmy(6, 4, seed).squads.map((q) => q.pet + q.count + q.weapon).join());
    expect(kinds.size).toBeGreaterThan(10);
  });
  it('wave 10 has one boss, a rung above its escort, worth its share of the POWER', () => {
    for (let stage = 1; stage <= 12; stage++) {
      const info = waveInfo(stage, WAVES, 5);
      expect(info.boss).toBe(true);
      const bosses = info.army.squads.filter((q) => q.boss);
      expect(bosses).toHaveLength(1);
      expect(bosses[0].count).toBe(1);
      const escort = info.army.squads.filter((q) => !q.boss);
      if (escort.length) expect(rungOf(bosses[0].pet)).toBeGreaterThan(Math.max(...escort.map((q) => rungOf(q.pet))));
      expect(rungOf(bosses[0].pet)).toBeGreaterThanOrEqual(2);
      expect(Math.abs(info.power / (info.recommended * ENEMY.bossShare) - 1)).toBeLessThan(0.15);
      expect(info.fighters).toBe(info.army.squads.reduce((a, q) => a + q.count, 0));
      // the boss is the same unit whatever the seed and tries
      expect(enemyArmy(stage, WAVES, 99, 3).squads.find((q) => q.boss)!.pet).toBe(bosses[0].pet);
    }
  });
  it('a retry rolls a new, softer army (mercy) of the same wave', () => {
    const p0 = armyPower(enemyArmy(4, 6, 3, 0).squads);
    const p3 = armyPower(enemyArmy(4, 6, 3, 3).squads);
    expect(p3 / p0).toBeLessThan(1 - ENEMY.mercy * 2);
    const s = newSave();
    s.stage = 4;
    s.wave = 6;
    expect(nextWave(s).army).toEqual(enemyArmy(4, 6, s.seed, 0));
    s.tries = 2;
    expect(nextWave(s).army).toEqual(enemyArmy(4, 6, s.seed, 2));
    expect(fightSeed(s)).not.toBe(fightSeed({ ...s, fights: 1 }));
  });
  it('the first waves are easy for the starter army (Sprout, knife, helmet), and with the guide\'s first cases', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = newSave(seed);
      const inv = new Inventory(s);
      autoArrange(inv);
      expect(inv.squads()).toHaveLength(1);
      expect(inv.squads()[0]).toMatchObject({ pet: 'sprout', weapon: 'knife', helmet: 1 });
      const wins = (wave: number) => {
        const enemy = enemyArmy(1, wave, s.seed);
        expect(enemy.squads.every((q) => q.weapon === null || q.weapon === 'knife')).toBe(true);
        let n = 0;
        for (let k = 0; k < 12; k++) if (runBattle([inv.army(), enemy], k).winner === 0) n++;
        return n;
      };
      for (const wave of [1, 2]) {
        expect(inv.power()).toBeGreaterThan(armyPower(enemyArmy(1, wave, s.seed).squads) * 1.25);
        expect(wins(wave)).toBeGreaterThanOrEqual(11);
      }
      // the three scripted cases (Sprout, chili, Sprout), AUTO: waves 1 to 3 are easy
      for (let i = 0; i < 3; i++) openCase(s, 'case');
      autoArrange(inv);
      for (const wave of [1, 2, 3]) expect(wins(wave)).toBe(12);
    }
  });
});

const sum = (winner: 0 | 1 | -1, alive0: number, size0: number, dead1: number, size1: number, bossKo = 0): SimSummary => ({
  winner, byTime: false, time: 20, kills: [dead1, size0 - alive0], size: [size0, size1], alive: [alive0, size1 - dead1], hpLeft: [0.5, 0], bossKos: [bossKo, 0],
});

describe('progress', () => {
  it('outcomeOf reads a fight', () => {
    expect(outcomeOf(sum(0, 3, 4, 5, 5, 1))).toEqual({ won: true, kos: 5, boss: true, survived: 0.75 });
    expect(outcomeOf(sum(1, 0, 4, 2, 5))).toEqual({ won: false, kos: 2, boss: false, survived: 0 });
  });
  it('a win pays knock-outs and the clear bonus and moves on; a loss pays knock-outs and keeps the wave', () => {
    const s = newSave();
    s.cash = 0;
    const r = applyWave(s, { won: true, kos: 3, boss: false, survived: 1 });
    expect(r).toMatchObject({ won: true, stage: 1, wave: 1, koCash: 3 * koCash(1), clearCash: clearCash(1, 1), stageClear: false, stars: 0, gems: 0, next: { stage: 1, wave: 2 } });
    expect(s.cash).toBe(r.cash);
    expect(s.wave).toBe(2);
    const before = { ...s, pieces: [...s.pieces] };
    const l = applyWave(s, { won: false, kos: 1, boss: false, survived: 0 });
    expect(l).toMatchObject({ won: false, clearCash: 0, koCash: koCash(1), next: { stage: 1, wave: 2 } });
    expect(s.wave).toBe(2);
    expect(s.tries).toBe(1);
    expect(s.pieces).toEqual(before.pieces);
    expect(s.kos).toBe(4);
    expect(s.fights).toBe(2);
    expect(s.wins).toBe(1);
    applyWave(s, { won: true, kos: 0, boss: false, survived: 1 });
    expect(s.tries).toBe(0);
  });
  it('winning wave 10 clears the stage: stars by survivors, gems, the next stage, earned cells open', () => {
    const s = newSave();
    s.wave = WAVES;
    s.gems = 0;
    const r = applyWave(s, { won: true, kos: 4, boss: true, survived: 0.5 });
    expect(r).toMatchObject({ stageClear: true, stars: 2, gems: stageGems(1, 2), next: { stage: 2, wave: 1 } });
    expect(r.koCash).toBe(koCash(1) * (4 - 1 + ECON.bossKo));
    expect(s.gems).toBe(stageGems(1, 2));
    expect(s.stars).toEqual([2]);
    expect(r.cells).toEqual([{ col: 1, row: 0 }]);
    expect(isOpen(s, 1, 0)).toBe(true);
    // replaying a stage never lowers its stars
    s.stage = 1;
    s.wave = WAVES;
    applyWave(s, { won: true, kos: 4, boss: true, survived: 0.1 });
    expect(s.stars).toEqual([2]);
    s.wave = WAVES;
    expect(applyWave(s, { won: true, kos: 4, boss: true, survived: 1 }).stars).toBe(3);
    expect(s.stars[1]).toBe(3);
  });
  it('a lost boss wave keeps the stage and wave', () => {
    const s = newSave();
    s.wave = WAVES;
    const r = applyWave(s, { won: false, kos: 2, boss: false, survived: 0 } satisfies WaveOutcome);
    expect(r).toMatchObject({ stageClear: false, gems: 0, next: { stage: 1, wave: WAVES } });
  });
});

describe('save', () => {
  it('new save: version 4, stage 1 wave 1, the starter kit on the tray, cash for the first cases', () => {
    const s = newSave();
    expect(s.version).toBe(4);
    expect(SAVE_VERSION).toBe(4);
    expect(s).toMatchObject({ stage: 1, wave: 1, tries: 0, stars: [], cases: 0, elites: 0, kos: 0, cellBuys: 0, open: START_OPEN, auto: false, tutorial: 0 });
    expect(s.pieces.map((p) => ({ type: p.type, level: p.level }))).toEqual(STARTER_KIT);
    expect(s.pieces.every((p) => p.slot >= 0 && p.slot < BENCH_SLOTS)).toBe(true);
    expect(isOwned(s, 'sprout')).toBe(true);
    expect(isOwned(s, 'buzzy')).toBe(false);
    let cash = s.cash;
    for (let i = 0; i < SCRIPTED_ROLLS.length; i++) cash -= casePrice({ cases: i }, 'case');
    expect(cash).toBeGreaterThanOrEqual(0);
  });
  it('loads in node without storage, never throws', () => {
    expect(load().pieces.length).toBe(3);
    expect(save(newSave())).toBe(false);
  });
  it('any older version (the trophy saves) is replaced by a fresh start', () => {
    for (const v of [1, 2, 3]) {
      const old = { version: v, trophies: 640, rolls: 9, pieces: [{ id: 1, type: 'ant', level: 5, count: 4, col: 0, row: 0, slot: -1 }] };
      expect(repair(JSON.parse(JSON.stringify(old)))).toEqual(newSave());
      expect(replacedOldSave(old)).toBe(true);
    }
    expect(replacedOldSave(newSave())).toBe(false);
    expect(replacedOldSave(null)).toBe(false);
  });
  it('round trips and repairs a damaged version 4 save', () => {
    const mem: Record<string, string> = {};
    (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => (mem[k] = v) };
    try {
      const s = newSave();
      s.cash = 123;
      s.stage = 3;
      s.wave = 4;
      s.stars = [3, 1];
      s.auto = true;
      s.open |= cellBit(0, 1);
      new Inventory(s).place(s.pieces[0], { col: 1, row: 1 });
      s.pieces[0].count = 2;
      s.pieces[0].turned = true;
      expect(save(s)).toBe(true);
      expect(load()).toEqual(s);
      mem['zoopvp-save'] = '{not json';
      expect(load().pieces.length).toBe(3);
      mem['zoopvp-save'] = JSON.stringify({
        version: 4, cash: -5, gems: 'x', stage: 2, wave: 99, stars: [5, 2, 2], open: 0, owned: 0,
        pieces: [
          { id: 1, type: 'sprout', level: 99, count: 3, col: 1, row: 1, slot: -1 }, // a pair at (1,1)-(2,1)
          { id: 1, type: 'nope' },
          { id: 1, type: 'roo', level: 1, count: 4, col: 2, row: 1, slot: -1 }, // overlaps the pair: to the tray
          { id: 5, type: 'knife', level: 2, count: 1, col: 0, row: 0, slot: -1 }, // a locked cell: to the tray
          { id: 6, type: 'ant', level: 1, count: 1, col: 3, row: 3, slot: -1 }, // an old unit: dropped
          null,
        ],
      });
      const r = load();
      expect(r).toMatchObject({ cash: 0, gems: 0, stage: 2, wave: WAVES, stars: [3], open: START_OPEN });
      expect(r.pieces.length).toBe(3);
      expect(r.pieces[0]).toMatchObject({ type: 'sprout', level: 1, count: 2, col: 1, row: 1 });
      expect(r.pieces[1].slot).toBeGreaterThanOrEqual(0);
      expect(r.pieces[2]).toMatchObject({ type: 'knife', col: -1 });
      expect(isOwned(r, 'roo')).toBe(true);
      expect(new Set(r.pieces.map((p) => p.id)).size).toBe(3);
      valid(new Inventory(r));
    } finally {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });
  it('repair handles junk', () => {
    for (const j of [null, 5, 'x', [], {}, { pieces: 'x' }, { version: 4, pieces: 'x' }]) expect(repair(j).version).toBe(4);
  });
});

describe('autoArrange', () => {
  it('fuses, packs shapes, links the best kit and loses nothing', () => {
    const s = empty();
    const inv = new Inventory(s);
    const kit = [['sprout', 1], ['sprout', 1], ['roo', 1], ['knife', 1], ['knife', 1], ['bat', 1], ['helmet', 1], ['chili', 2], ['sneakers', 1]] as const;
    kit.forEach(([t, l], i) => inv.place(inv.add(t, l) ?? inv.add(t, l)!, { col: i % 5, row: Math.floor(i / 5) }));
    while (s.pieces.length < kit.length) {
      const [t, l] = kit[s.pieces.length];
      const p = inv.add(t, l)!;
      inv.place(p, inv.spotFor(p)!);
    }
    const before = inv.power();
    autoArrange(inv);
    valid(inv);
    expect(s.pieces.length).toBe(7); // the Sprouts and the knives fused
    expect(s.pieces.find((p) => p.type === 'sprout')!.count).toBe(2);
    expect(inv.squads().every((q) => q.weapon !== null)).toBe(true);
    expect(inv.power()).toBeGreaterThan(before);
    const again = JSON.stringify(s.pieces);
    autoArrange(inv);
    expect(JSON.stringify(s.pieces)).toBe(again);
  });
  it('evolves surplus squads from the tray, never leaving the army weaker', () => {
    const s = empty({ open: START_OPEN });
    const inv = new Inventory(s);
    put(inv, 'sprout', 1, 1, 1, 4);
    put(inv, 'knife', 1, 3, 1);
    for (let i = 0; i < 2; i++) inv.add('sprout', 1)!.count = 4;
    const was = inv.power();
    const res = autoArrange(inv);
    expect(res.evolves).toEqual([{ from: 'sprout', to: 'buzzy', fresh: true }]);
    expect(s.evolves).toBe(1);
    expect(inv.power()).toBeGreaterThanOrEqual(was);
    expect(s.pieces.filter((p) => p.type === 'sprout')).toHaveLength(1);
    valid(inv);
  });
  it('a full grid and tray: everything stays, nothing overlaps, never weaker', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = makeRng(seed);
      const s = empty();
      if (seed % 2) s.open = START_OPEN | cellBit(0, 1) | cellBit(4, 4);
      const inv = new Inventory(s);
      const types: PieceType[] = ['sprout', 'buzzy', 'roo', 'knife', 'bat', 'shield', 'spear', 'helmet', 'sneakers', 'chili'];
      for (let i = 0; i < 60; i++) {
        const p = inv.add(r.pick(types), r.int(1, 4));
        if (!p) break;
        if (isPet(p.type)) p.count = r.pick([1, 2, 4]);
        for (let k = 0; k < 30; k++) if (inv.place(p, { col: r.int(0, 4), row: r.int(0, 4) }).kind === 'moved') break;
      }
      const ids = s.pieces.map((p) => p.id);
      const was = inv.power();
      autoArrange(inv);
      valid(inv);
      for (const p of s.pieces) expect(ids).toContain(p.id);
      expect(inv.power()).toBeGreaterThanOrEqual(was);
    }
  });
});
