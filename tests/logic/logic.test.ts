import { describe, expect, it } from 'vitest';
import {
  BENCH_SLOTS, CELL_LOCKS, CELL_PRICE, CHAMPION, ECON, GRID, LEVEL, MATCH, MAX_COUNT, PETS, PET_INFO, PET_TYPES, PITY, PIECE_NAME, REWARD,
  SCRIPTED_ROLLS, START_OPEN, STARTER_KIT, THEMES, armyPower, cellBit, champGems, classOdds, footprint, homeRung, isChampionMatch, isPet, koCash,
  levelForStage, lossCash, nextPet, petOdds, rungOf, sellValue, squadPower, streakCash, tierOf, winCash, xpForLevel, xpToNext,
} from '../../src/data';
import { makeRng } from '../../src/rng';
import type { ArmySpec, MatchOutcome, PetType, Piece, PieceType, SaveState, SquadSpec, ThemeId } from '../../src/types';
import type { SimSummary } from '../../src/sim/types';
import { Inventory, LOCKED, TOP_OF_LADDER, cellsOf, isOpen, isOwned, ownedRungs } from '../../src/logic/inventory';
import { caseBlock, caseOdds, casePrice, openCase } from '../../src/logic/rolls';
import { addXp, applyMatch, cellLock, cellPrice, cellProgress, levelProgress, mvpOf, openEarned, outcomeOf, unlockCell } from '../../src/logic/progress';
import { championFactor, difficulty, fightSeed, findOpponent, matchSeed, matchesToChampion, nextIsChampion } from '../../src/logic/match';
import { MIGRATES_FROM, SAVE_VERSION, load, migratedOldSave, newSave, repair, replacedOldSave, save } from '../../src/logic/save';
import { autoArrange } from '../../src/logic/auto';
import { buildArmy } from '../../src/logic/match';
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
    expect(PET_TYPES.map((p) => PET_INFO[p].name)).toEqual(['Chick', 'Scorp', 'Shroom', 'Tulip', 'Roo', 'Cacto', 'Dandy', 'Spike', 'Snapper', 'Pumpkin', 'Bamboo', 'Oak']);
    // the chick is the small fast one; the scorp throws from a distance
    expect(PETS.sprout.speed).toBeGreaterThan(Math.max(...PET_TYPES.filter((p) => p !== 'sprout').map((p) => PETS[p].speed)));
    expect(PETS.sprout.hp).toBeLessThan(PETS.buzzy.hp);
    expect(PETS.sprout.dmg).toBeLessThan(PETS.buzzy.dmg);
    expect(PETS.buzzy.reach).toBeGreaterThanOrEqual(80);
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
  it('cash cells cost more each time; level and knock-out cells open when earned', () => {
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
    const lv = CELL_LOCKS['1,0'];
    expect(lv.kind).toBe('level');
    const need = lv.kind === 'level' ? lv.level : 0;
    expect(unlockCell(s, 1, 0)).toMatchObject({ ok: false, reason: `Opens at level ${need}` });
    expect(cellProgress(s, 1, 0)).toMatchObject({ lock: { kind: 'level' }, have: 1, need });
    expect(cellProgress(s, 1, 4)).toMatchObject({ lock: { kind: 'ko', count: 30 }, have: 0, need: 30 });
    s.level = need;
    s.kos = 30;
    const opened = openEarned(s).map((c) => `${c.col},${c.row}`).sort();
    expect(opened).toEqual(['1,0', '1,4']);
    expect(openEarned(s)).toEqual([]);
    // every level cell opens by the level it names, in order across the top row
    const levels = Object.values(CELL_LOCKS).flatMap((l) => (l.kind === 'level' ? [l.level] : []));
    expect(levels.length).toBe(5);
    s.level = Math.max(...levels);
    expect(openEarned(s).length).toBe(4);
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
  it('the first CASEs are the scripted ones and teach Chick + Chick -> x2', () => {
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
  it('the odds improve with the level; an ELITE is never E-class and never a Chick', () => {
    const mean = (o: number[]) => o.reduce((a, p, i) => a + p * (i + 1), 0) / 100;
    expect(mean(petOdds(homeRung(1)))).toBeLessThan(mean(petOdds(homeRung(5))));
    expect(mean(petOdds(homeRung(5)))).toBeLessThan(mean(petOdds(homeRung(12))));
    expect(classOdds(1)[0]).toBeGreaterThan(classOdds(10)[0]);
    expect(classOdds(4, true)[0]).toBe(0);
    expect(classOdds(4, true).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(caseOdds({ level: 5 }, 'elite').rungs[0]).toBe(0);
    expect(mean(caseOdds({ level: 5 }, 'elite').rungs)).toBeGreaterThan(mean(caseOdds({ level: 5 }, 'case').rungs));
    expect(mean(caseOdds({ level: 30 }, 'case').rungs)).toBeGreaterThan(mean(caseOdds({ level: 1 }, 'case').rungs));
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

/** a player's army of about this POWER over about this many fighters, from the cast */
const playerArmy = (seed: number, power: number, fighters: number): ArmySpec => {
  const r = makeRng(seed);
  return { squads: buildArmy(power, fighters, r, 8).map((q, i) => ({ ...q, key: i + 1 })) };
};
const fighters = (a: ArmySpec) => a.squads.reduce((n, q) => n + q.count, 0);
const meanRung = (a: ArmySpec) => a.squads.reduce((n, q) => n + rungOf(q.pet) * q.count, 0) / Math.max(1, fighters(a));
/** a save in the middle of the game: past the first fights, no streak */
const mid = (extra: Partial<SaveState> = {}): SaveState => ({ ...newSave(), matches: 11, ...extra });

describe('matchmaking', () => {
  it('difficulty: gentle for the first fights, eases after losses, a little harder on a win streak, never below the floor', () => {
    expect(difficulty({ matches: 0, streak: 0, slump: 0 })).toBe(MATCH.intro[0]);
    for (let n = 1; n < MATCH.intro.length; n++) expect(MATCH.intro[n]).toBeGreaterThan(MATCH.intro[n - 1]);
    const base = difficulty({ matches: 20, streak: 0, slump: 0 });
    expect(base).toBe(MATCH.base);
    expect(base).toBeLessThan(1);
    expect(difficulty({ matches: 20, streak: 0, slump: 2 })).toBeCloseTo(base - 2 * MATCH.slump, 9);
    expect(difficulty({ matches: 20, streak: 0, slump: 99 })).toBeGreaterThanOrEqual(MATCH.floor);
    expect(difficulty({ matches: 20, streak: 1, slump: 0 })).toBe(base);
    expect(difficulty({ matches: 20, streak: 3, slump: 0 })).toBeCloseTo(base + 2 * MATCH.hot, 9);
    expect(difficulty({ matches: 20, streak: 99, slump: 0 })).toBeCloseTo(base + MATCH.hotMax * MATCH.hot, 9);
    expect(difficulty({ matches: 20, streak: 99, slump: 0 })).toBeLessThanOrEqual(1);
  });

  it('the opponent: a BOT with a name, about your POWER x difficulty, a similar count, units near your rungs; the same for the same seed', () => {
    const r = makeRng(5);
    for (let i = 0; i < 40; i++) {
      const n = r.int(1, 14);
      const mine = playerArmy(100 + i, 30 * 2 ** r.range(0, 10), n);
      const s = mid({ matches: 10 + r.int(1, 3) * 1 + (i % 4), seed: 1000 + i });
      if (isChampionMatch(s.matches + 1)) s.matches++;
      const o = findOpponent(s, 77 + i, mine);
      expect(o.bot).toBe(true);
      expect(o.name.length).toBeGreaterThan(3);
      expect(o.champion).toBe(false);
      expect(o.match).toBe(s.matches + 1);
      expect(o).toEqual(findOpponent(s, 77 + i, mine));
      expect(o.power).toBe(armyPower(o.army.squads));
      expect(o.fighters).toBe(fighters(o.army));
      expect(o.difficulty).toBe(difficulty(s));
      const target = armyPower(mine.squads) * o.difficulty;
      expect(Math.abs(o.power / target - 1), `${o.theme.id} ${o.power} vs ${target}`).toBeLessThan(MATCH.tolerance * 2 + 0.02);
      expect(o.fighters).toBeLessThanOrEqual(MATCH.maxFighters);
      expect(o.fighters).toBeGreaterThanOrEqual(Math.max(1, Math.floor(fighters(mine) * 0.4)));
      expect(o.fighters).toBeLessThanOrEqual(Math.max(fighters(mine) * 2 + 1, 2));
      expect(Math.abs(meanRung(o.army) - meanRung(mine)), o.theme.id).toBeLessThan(2.6);
      expect(o.army.squads.every((q) => !q.boss && [1, 2, 4].includes(q.count) && q.key === 0)).toBe(true);
      expect(o.army.squads.length).toBeLessThanOrEqual(MATCH.maxSquads);
      expect(o.theme.name).toBe(THEMES[o.theme.id].name);
    }
    // the seed changes who you meet
    const mine = playerArmy(3, 400, 6);
    const names = new Set<string>();
    const armies = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const o = findOpponent(mid(), k, mine);
      names.add(o.name);
      armies.add(JSON.stringify(o.army));
    }
    expect(names.size).toBeGreaterThan(12);
    expect(armies.size).toBeGreaterThan(15);
    // by default it reads the save's own grid and its own seed
    const s = mid();
    const inv = new Inventory(s);
    autoArrange(inv);
    expect(findOpponent(s)).toEqual(findOpponent(s, matchSeed(s), inv.army()));
    expect(fightSeed(s)).not.toBe(fightSeed({ ...s, matches: s.matches + 1 }));
  });

  it('themes: all of them come up; a mirror is your lineup; glass cannons wear no helmet; tanks carry shields; a swarm is more, heavies fewer', () => {
    const seen = new Map<ThemeId, number>();
    for (let k = 0; k < 400; k++) {
      const mine = playerArmy(k, 200 + 37 * k, 2 + (k % 9));
      const o = findOpponent(mid({ seed: k + 9 }), k, mine);
      seen.set(o.theme.id, (seen.get(o.theme.id) ?? 0) + 1);
      const q = o.army.squads;
      if (o.theme.id === 'mirror') {
        expect(q.map((x) => [x.pet, x.count])).toEqual(mine.squads.map((x) => [x.pet, x.count]));
      } else if (o.theme.id === 'glass') {
        expect(q.every((x) => x.helmet === 0 && x.weapon !== 'shield' && x.weapon !== null)).toBe(true);
      } else if (o.theme.id === 'tanks') {
        expect(q.every((x) => x.chili === 0 && x.weapon === 'shield')).toBe(true);
        expect(q.some((x) => x.weapon === 'shield')).toBe(true);
      } else if (o.theme.id === 'swarm') {
        expect(o.fighters).toBeGreaterThan(fighters(mine));
      } else if (o.theme.id === 'heavy') {
        expect(o.fighters).toBeLessThan(fighters(mine));
      }
    }
    for (const t of ['mixed', 'swarm', 'heavy', 'glass', 'tanks', 'mirror'] as ThemeId[]) expect(seen.get(t) ?? 0, t).toBeGreaterThan(15);
    expect(seen.get('champion') ?? 0).toBe(0);
  });

  it('every 5th match is a CHAMPION match: one crowned boss a rung above its crew, a tougher team, a champion name', () => {
    expect([1, 2, 3, 4, 5, 6, 9, 10, 15].map(isChampionMatch)).toEqual([false, false, false, false, true, false, false, true, true]);
    expect(nextIsChampion({ matches: 4 })).toBe(true);
    expect(nextIsChampion({ matches: 5 })).toBe(false);
    expect([0, 1, 3, 4, 5].map((m) => matchesToChampion({ matches: m }))).toEqual([4, 3, 1, 0, 4]);
    for (let i = 0; i < 30; i++) {
      const mine = playerArmy(50 + i, 150 * 2 ** (i / 3), 1 + (i % 12));
      const s = mid({ matches: 4 + 5 * (i % 6), seed: 300 + i });
      const o = findOpponent(s, i, mine);
      expect(o.champion).toBe(true);
      expect(o.theme.id).toBe('champion');
      const bosses = o.army.squads.filter((q) => q.boss);
      expect(bosses).toHaveLength(1);
      expect(bosses[0].count).toBe(1);
      const crew = o.army.squads.filter((q) => !q.boss);
      if (crew.length) expect(rungOf(bosses[0].pet)).toBeGreaterThan(Math.max(...crew.map((q) => rungOf(q.pet))));
      expect(o.difficulty).toBeCloseTo(difficulty(s) * CHAMPION.power, 9);
      expect(championFactor(s)).toBe(CHAMPION.power);
      expect(Math.abs(o.power / (armyPower(mine.squads) * o.difficulty) - 1)).toBeLessThan(0.2);
      expect(o.fighters).toBeLessThanOrEqual(Math.max(fighters(mine) + 2, 2 * fighters(mine)));
    }
    // a slump softens the champion too
    expect(championFactor({ slump: 1 })).toBeLessThan(CHAMPION.power);
    expect(championFactor({ slump: MATCH.easeAfter })).toBe(1);
    // a tiny army meets a lone crowned Chick at worst
    const tiny = findOpponent(mid({ matches: 4 }), 1, playerArmy(1, 40, 2));
    expect(tiny.army.squads.filter((q) => q.boss)).toHaveLength(1);
    expect(tiny.power).toBeLessThan(squadPower(spec('sprout', 1, { boss: true })) * 1.05);
  });

  it('the first fights are easy for the starter army (Chick, knife, helmet), and with the guide\'s first cases', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = newSave(seed);
      const inv = new Inventory(s);
      autoArrange(inv);
      expect(inv.squads()).toHaveLength(1);
      expect(inv.squads()[0]).toMatchObject({ pet: 'sprout', weapon: 'knife', helmet: 1 });
      const wins = (o: ReturnType<typeof findOpponent>) => {
        expect(o.army.squads.every((q) => q.weapon === null || q.weapon === 'knife')).toBe(true);
        let n = 0;
        for (let k = 0; k < 12; k++) if (runBattle([inv.army(), o.army], k).winner === 0) n++;
        return n;
      };
      const first = findOpponent(s);
      expect(first.theme.id).toBe('mixed');
      expect(inv.power()).toBeGreaterThan(first.power * 1.25);
      expect(wins(first)).toBeGreaterThanOrEqual(11);
      // the three scripted cases (Chick, chili, Chick), AUTO: the next fights are easy too
      for (let i = 0; i < 3; i++) openCase(s, 'case');
      autoArrange(inv);
      for (const m of [1, 2]) expect(wins(findOpponent({ ...s, matches: m }))).toBeGreaterThanOrEqual(11);
    }
  });
});

const sum = (winner: 0 | 1 | -1, alive0: number, size0: number, dead1: number, size1: number, bossKo = 0, kos: number[] = [], dealt: number[] = []): SimSummary => ({
  winner, byTime: false, time: 20, kills: [dead1, size0 - alive0], size: [size0, size1], alive: [alive0, size1 - dead1], hpLeft: [0.5, 0], bossKos: [bossKo, 0],
  kos, dealt, crits: [0, 0],
});
const outcome = (won: boolean, kos: number, o: Partial<MatchOutcome> = {}): MatchOutcome => ({ won, kos, boss: false, survived: won ? 1 : 0, ...o });

describe('rewards and the level', () => {
  it('outcomeOf reads a fight, and with your army what each squad did; the MVP has the most knock-outs', () => {
    expect(outcomeOf(sum(0, 3, 4, 5, 5, 1))).toEqual({ won: true, kos: 5, boss: true, survived: 0.75 });
    expect(outcomeOf(sum(1, 0, 4, 2, 5))).toEqual({ won: false, kos: 2, boss: false, survived: 0 });
    const mine: ArmySpec = { squads: [spec('roo', 1, { key: 7 }), spec('sprout', 2, { key: 3 }), spec('buzzy', 1, { key: 9 })] };
    const o = outcomeOf(sum(0, 4, 4, 5, 5, 0, [1, 0, 2, 2, 0, 0, 0, 0, 0], [50, 10, 20, 30, 5]), mine);
    expect(o.squads).toEqual([
      { key: 7, pet: 'roo', kos: 1, dmg: 50 },
      { key: 3, pet: 'sprout', kos: 2, dmg: 30 },
      { key: 9, pet: 'buzzy', kos: 2, dmg: 30 },
    ]);
    expect(mvpOf(o.squads)).toEqual({ key: 3, pet: 'sprout', kos: 2, dmg: 30 });
    expect(mvpOf([{ key: 1, pet: 'roo', kos: 0, dmg: 0 }])).toBeNull();
    expect(mvpOf(undefined)).toBeNull();
    // a real fight: the KOs of your squads add up to the enemy fighters knocked out
    const army: ArmySpec = { squads: [spec('roo', 2, { key: 1 }), spec('buzzy', 2, { key: 2 })] };
    const s = runBattle([army, { squads: [spec('sprout', 4), spec('ninja', 1)] }], 3);
    const real = outcomeOf(s, army);
    expect(real.squads!.reduce((a, q) => a + q.kos, 0)).toBe(s.kills[0]);
  });

  it('a win pays its base, the knock-outs and the streak bonus, XP and sometimes gems; a loss a little cash and XP, nothing taken', () => {
    const s = newSave();
    s.cash = 0;
    s.gems = 0;
    const pieces = JSON.stringify(s.pieces);
    const r = applyMatch(s, outcome(true, 3));
    expect(r).toMatchObject({ won: true, champion: false, match: 1, baseCash: winCash(1), koCash: 3 * koCash(1), streakCash: 0, streak: 1, levelUp: null, mvp: null });
    expect(r.cash).toBe(winCash(1) + 3 * koCash(1));
    expect(r.xp).toBe(REWARD.xpWin + 3 * REWARD.xpKo);
    expect(s).toMatchObject({ cash: r.cash, gems: r.gems, matches: 1, wins: 1, streak: 1, slump: 0, kos: 3, xp: r.xp, level: 1 });
    const r2 = applyMatch(s, outcome(true, 0));
    expect(r2.streak).toBe(2);
    expect(r2.streakCash).toBe(streakCash(1, 2));
    expect(r2.streakCash).toBeGreaterThan(0);
    const cash = s.cash;
    const lv = s.level;
    const l = applyMatch(s, outcome(false, 1));
    expect(l).toMatchObject({ won: false, baseCash: lossCash(lv), koCash: koCash(lv), streakCash: 0, gems: 0, streak: 0 });
    expect(l.xp).toBe(REWARD.xpLoss + REWARD.xpKo);
    expect(lossCash(1)).toBeLessThan(winCash(1));
    expect(s.cash).toBe(cash + l.cash);
    expect(s).toMatchObject({ matches: 3, wins: 2, streak: 0, slump: 1, bestStreak: 2 });
    expect(JSON.stringify(s.pieces)).toBe(pieces);
    // gems now and then on a win, never on a loss; the same save and match always give the same
    let gemWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      const t = { ...newSave(), seed: seed + 1, matches: 10 };
      const g = applyMatch(t, outcome(true, 2)).gems;
      expect(g).toBe(applyMatch({ ...newSave(), seed: seed + 1, matches: 10 }, outcome(true, 2)).gems);
      if (g > 0) gemWins++;
      expect(g === 0 || (g >= REWARD.gems[0] && g <= REWARD.gems[1])).toBe(true);
      expect(applyMatch({ ...newSave(), seed: seed + 1, matches: 10 }, outcome(false, 2)).gems).toBe(0);
    }
    expect(gemWins / 200).toBeGreaterThan(REWARD.gemChance - 0.1);
    expect(gemWins / 200).toBeLessThan(REWARD.gemChance + 0.1);
    // rewards grow with the level
    expect(winCash(10)).toBeGreaterThan(winCash(1));
    expect(koCash(10)).toBeGreaterThan(koCash(1));
  });

  it('a champion win pays double and always gems; a champion loss pays like any loss', () => {
    const s = { ...newSave(), matches: 4, level: 6, gems: 0 };
    const r = applyMatch(s, outcome(true, 4, { boss: true }));
    expect(r.champion).toBe(true);
    expect(r.gems).toBe(champGems(6));
    expect(r.cash).toBe(CHAMPION.rewards * (winCash(6) + koCash(6) * (4 - 1 + REWARD.bossKo)));
    expect(r.xp).toBe(CHAMPION.rewards * (REWARD.xpWin + 4 * REWARD.xpKo));
    expect(s.champs).toBe(1);
    const t = { ...newSave(), matches: 9, level: 6 };
    const l = applyMatch(t, outcome(false, 2));
    expect(l).toMatchObject({ champion: true, won: false, gems: 0, cash: lossCash(6) + 2 * koCash(6) });
    expect(t.champs).toBe(0);
    expect(applyMatch({ ...newSave(), matches: 1 }, outcome(true, 0, { champion: true })).champion).toBe(true);
  });

  it('the level: a gentle XP curve, level-ups (more than one at once), cells that open by level, the XP bar', () => {
    for (let l = 2; l < 40; l++) {
      expect(xpToNext(l)).toBeGreaterThan(xpToNext(l - 1));
      expect(xpToNext(l) / xpToNext(l - 1)).toBeLessThan(1.6);
      expect(xpForLevel(l + 1) - xpForLevel(l)).toBe(xpToNext(l));
    }
    // a win or two for level 2; level 10 after a few dozen matches
    expect(xpToNext(1)).toBeLessThanOrEqual(2 * REWARD.xpWin + 10);
    const winsTo10 = xpForLevel(10) / (REWARD.xpWin + 4 * REWARD.xpKo);
    expect(winsTo10).toBeGreaterThan(20);
    expect(winsTo10).toBeLessThan(80);
    const s = newSave();
    const lv = CELL_LOCKS['1,0'].kind === 'level' ? (CELL_LOCKS['1,0'] as { level: number }).level : 3;
    s.xp = xpToNext(1) - 1;
    expect(levelProgress(s)).toEqual({ level: 1, xp: xpToNext(1) - 1, need: xpToNext(1), share: (xpToNext(1) - 1) / xpToNext(1) });
    const before = s.xp;
    const r = applyMatch(s, outcome(true, 0));
    expect(r.from).toEqual({ level: 1, xp: before, need: xpToNext(1) });
    expect(r.levelUp).toBe(2);
    expect(r.to).toEqual({ level: 2, xp: before + r.xp - xpToNext(1), need: xpToNext(2) });
    expect(s.level).toBe(2);
    // a big pile of XP climbs several levels, and the level cells open on the way
    expect(addXp(s, xpForLevel(lv) - xpForLevel(2))).toBe(lv - 2);
    expect(s.level).toBe(lv);
    expect(applyMatch(s, outcome(false, 0)).cells).toContainEqual({ col: 1, row: 0 });
    expect(isOpen(s, 1, 0)).toBe(true);
    const top = { ...newSave(), level: LEVEL.max };
    addXp(top, 1e9);
    expect(top.level).toBe(LEVEL.max);
    expect(levelProgress(top).share).toBe(1);
  });

  it('knock-outs add up and open the knock-out cells', () => {
    const s = newSave();
    let opened: { col: number; row: number }[] = [];
    for (let i = 0; i < 6; i++) opened = opened.concat(applyMatch(s, outcome(true, 5)).cells);
    expect(s.kos).toBe(30);
    expect(opened).toContainEqual({ col: 1, row: 4 });
  });
});

describe('save', () => {
  it('new save: version 5, level 1, no matches, the starter kit on the tray, cash for the first cases', () => {
    const s = newSave();
    expect(s.version).toBe(5);
    expect(SAVE_VERSION).toBe(5);
    expect(s).toMatchObject({ level: 1, xp: 0, streak: 0, slump: 0, bestStreak: 0, matches: 0, wins: 0, champs: 0, cases: 0, elites: 0, kos: 0, cellBuys: 0, open: START_OPEN, auto: false, tutorial: 0 });
    for (const gone of ['stage', 'wave', 'tries', 'stars', 'fights']) expect(gone in s).toBe(false);
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
  it('a version 1 to 3 save is replaced by a fresh start', () => {
    for (const v of [1, 2, 3]) {
      const old = { version: v, trophies: 640, rolls: 9, pieces: [{ id: 1, type: 'ant', level: 5, count: 4, col: 0, row: 0, slot: -1 }] };
      expect(repair(JSON.parse(JSON.stringify(old)))).toEqual(newSave());
      expect(replacedOldSave(old)).toBe(true);
      expect(migratedOldSave(old)).toBe(false);
    }
    expect(replacedOldSave(newSave())).toBe(false);
    expect(replacedOldSave({ version: MIGRATES_FROM })).toBe(false);
    expect(replacedOldSave(null)).toBe(false);
  });
  it('a version 4 save is migrated: pieces, cash, gems, cells, units, knock-outs, cases and the guide kept; its stage gives the level', () => {
    const v4 = {
      version: 4, cash: 345, gems: 21, stage: 4, wave: 7, tries: 2, stars: [3, 2, 1], cases: 31, elites: 4, pity: 9, rolled: 35,
      open: START_OPEN | cellBit(1, 0) | cellBit(0, 1), cellBuys: 1, kos: 140, owned: 0b10111, evolves: 2, auto: true, tutorial: 99, tips: 6,
      fights: 40, wins: 33, seed: 4242,
      pieces: [
        { id: 4, type: 'roo', level: 1, count: 2, col: 1, row: 1, slot: -1 },
        { id: 9, type: 'knife', level: 3, count: 1, col: 1, row: 2, slot: -1 },
        { id: 12, type: 'buzzy', level: 1, count: 1, col: -1, row: -1, slot: 2 },
      ],
      nextId: 13,
    };
    expect(migratedOldSave(v4)).toBe(true);
    const s = repair(JSON.parse(JSON.stringify(v4)));
    expect(s.version).toBe(5);
    expect(s).toMatchObject({
      cash: 345, gems: 21, cases: 31, elites: 4, pity: 9, rolled: 35, open: v4.open, cellBuys: 1, kos: 140, evolves: 2, auto: true, tutorial: 99,
      tips: 6, seed: 4242, nextId: 13, level: levelForStage(4), xp: 0, matches: 40, wins: 33, streak: 0, slump: 0, champs: 0,
    });
    expect(s.pieces).toEqual(v4.pieces);
    expect(isOwned(s, 'roo') && isOwned(s, 'buzzy') && isOwned(s, 'ninja')).toBe(true);
    expect(isOwned(s, 'snailor')).toBe(false);
    for (const gone of ['stage', 'wave', 'tries', 'stars', 'fights']) expect(gone in s).toBe(false);
    // the stage maps to a level that keeps climbing, from level 1 at stage 1
    expect(levelForStage(1)).toBe(1);
    for (let st = 2; st < 20; st++) expect(levelForStage(st)).toBeGreaterThan(levelForStage(st - 1));
    // a migrated save plays on: its next opponent is found and its match books
    const o = findOpponent(s);
    expect(o.power).toBeGreaterThan(0);
    applyMatch(s, outcome(true, 2));
    expect(repair(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('round trips and repairs a damaged version 5 save', () => {
    const mem: Record<string, string> = {};
    (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => (mem[k] = v) };
    try {
      const s = newSave();
      s.cash = 123;
      s.level = 7;
      s.xp = 30;
      s.matches = 20;
      s.wins = 14;
      s.streak = 3;
      s.bestStreak = 5;
      s.champs = 2;
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
        version: 5, cash: -5, gems: 'x', level: 0, xp: 1e9, matches: 3, wins: 9, streak: 7, slump: 2, open: 0, owned: 0,
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
      expect(r).toMatchObject({ cash: 0, gems: 0, level: 1, xp: xpToNext(1), matches: 3, wins: 3, streak: 3, slump: 0, open: START_OPEN });
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
    for (const j of [null, 5, 'x', [], {}, { pieces: 'x' }, { version: 5, pieces: 'x' }, { version: 4, pieces: 'x' }]) expect(repair(j).version).toBe(5);
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
