import { describe, expect, it } from 'vitest';
import { BENCH_SLOTS, BOT, GRID, MAX_COUNT, PITY, REWARD, SCRIPTED_ROLLS, TROPHY_ROAD, armyPower, footprint } from '../../src/data';
import { makeRng } from '../../src/rng';
import type { Opponent, Piece, PieceType, SaveState } from '../../src/types';
import type { SimSummary } from '../../src/sim/types';
import { Inventory, cellsOf } from '../../src/logic/inventory';
import { classOdds, rollOnce } from '../../src/logic/rolls';
import { applyMatch, claimRoad } from '../../src/logic/progress';
import { botFactor, kindsOf, makeOpponent, matchArmy, playerArmy } from '../../src/logic/bots';
import { load, newSave, repair, save } from '../../src/logic/save';
import { autoArrange } from '../../src/logic/auto';

const empty = (): SaveState => ({ ...newSave(), pieces: [], nextId: 1 });
const inv0 = () => new Inventory(empty());
function put(inv: Inventory, type: PieceType, level: number, c: number, r: number, count = 1, turned?: boolean): Piece {
  const p = inv.add(type, level)!;
  p.count = count;
  if (turned) p.turned = true;
  expect(inv.place(p, { col: c, row: r }).kind).toBe('moved');
  return p;
}
/** every grid cell is covered by at most one piece, every piece is inside the grid or on its own bench slot */
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
      expect(seen.has(`${c.col},${c.row}`)).toBe(false);
      seen.add(`${c.col},${c.row}`);
      expect(inv.at(c.col, c.row)).toBe(p);
    }
  }
}

describe('footprints', () => {
  it('weapons and gear 1 x 1, pets by count, a pair turns', () => {
    expect(GRID).toEqual({ cols: 5, rows: 5 });
    expect(BENCH_SLOTS).toBe(5);
    expect(MAX_COUNT).toBe(4);
    expect(footprint({ type: 'knife', count: 1 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ type: 'chili', count: 4 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ type: 'ant', count: 1 })).toEqual({ w: 1, h: 1 });
    expect(footprint({ type: 'ant', count: 2 })).toEqual({ w: 2, h: 1 });
    expect(footprint({ type: 'frog', count: 2, turned: true })).toEqual({ w: 1, h: 2 });
    expect(footprint({ type: 'frog', count: 4, turned: true })).toEqual({ w: 2, h: 2 });
  });
  it('at() finds a piece by any of its cells', () => {
    const inv = inv0();
    const big = put(inv, 'frog', 1, 1, 1, 4);
    for (const [c, r] of [[1, 1], [2, 1], [1, 2], [2, 2]]) expect(inv.at(c, r)).toBe(big);
    expect(inv.at(3, 1)).toBeNull();
    expect(inv.at(0, 0)).toBeNull();
    expect(inv.at(-1, 0)).toBeNull();
  });
});

describe('inventory', () => {
  it('moves, swaps grid and bench, fuses items', () => {
    const inv = inv0();
    const a = inv.add('ant', 1)!;
    expect(inv.place(a, { col: 2, row: 2 }).kind).toBe('moved');
    const k = inv.add('knife', 1)!;
    const sw = inv.place(k, { col: 2, row: 2 });
    expect(sw.kind).toBe('swapped');
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
    const a = inv.add('ant', 1)!;
    const b = put(inv, 'ant', 1, 0, 0);
    expect(inv.preview(a, { col: 0, row: 0 })).toMatchObject({ kind: 'fused', fuse: 'stack' });
    expect(a.slot).toBe(0);
    expect(b.count).toBe(1);
    expect(inv.place(a, { col: GRID.cols, row: 0 }).kind).toBe('denied');
    expect(inv.place(a, { slot: BENCH_SLOTS }).kind).toBe('denied');
    expect(inv.place(b, { col: 0, row: 0 })).toEqual({ kind: 'denied' }); // dropped where it is
  });
  it('a pair must fit inside the grid and on free cells', () => {
    const inv = inv0();
    const pair = inv.add('ant', 1)!;
    pair.count = 2;
    const deny = inv.place(pair, { col: 4, row: 0 });
    expect(deny.kind).toBe('denied');
    expect(deny.reason).toBeTruthy();
    expect(pair.slot).toBe(0);
    expect(inv.place(pair, { col: 3, row: 0 }).kind).toBe('moved');
    expect(inv.at(4, 0)).toBe(pair);
    // shifting onto its own cell is fine
    expect(inv.place(pair, { col: 2, row: 0 }).kind).toBe('moved');
    expect(inv.at(4, 0)).toBeNull();
    put(inv, 'knife', 1, 1, 1);
    put(inv, 'helmet', 1, 2, 1);
    const big = inv.add('frog', 1)!;
    big.count = 4;
    const two = inv.place(big, { col: 1, row: 0 }); // would cover the pair, the knife and the helmet
    expect(two.kind).toBe('denied');
    expect(two.reason).toBe('No room there');
    valid(inv);
  });
  it('fusing grows the pet in place: 1 -> 2 -> 4 cells', () => {
    const inv = inv0();
    const a = put(inv, 'ant', 2, 1, 1);
    const b = inv.add('ant', 2)!;
    expect(inv.place(b, { col: 1, row: 1 })).toMatchObject({ kind: 'fused', fuse: 'stack', piece: a, gone: b.id });
    expect(a.count).toBe(2);
    expect(footprint(a)).toEqual({ w: 2, h: 1 });
    expect([a.col, a.row]).toEqual([1, 1]);
    const c = put(inv, 'ant', 2, 0, 4, 2);
    // dropped so that only its second cell lands on the mate: still fuses
    expect(inv.place(c, { col: 0, row: 1 })).toMatchObject({ kind: 'fused', piece: a });
    expect(a.count).toBe(4);
    expect(footprint(a)).toEqual({ w: 2, h: 2 });
    expect([a.col, a.row]).toEqual([1, 1]);
    expect(inv.at(0, 4)).toBeNull();
    valid(inv);
  });
  it('a grown pet takes the nearest spot covering the mate, or the fuse is denied', () => {
    const inv = inv0();
    const a = put(inv, 'frog', 1, 4, 4); // bottom-right corner: nothing fits anchored here
    const b = inv.add('frog', 1)!;
    expect(inv.place(b, { col: 4, row: 4 }).kind).toBe('fused');
    expect(cellsOf(a).map((x) => `${x.col},${x.row}`).sort()).toContain('4,4');
    expect(a.count).toBe(2);
    valid(inv);
    // a pair boxed in by items cannot grow into a square
    const inv2 = inv0();
    const p = put(inv2, 'ant', 1, 0, 0, 2);
    put(inv2, 'knife', 1, 0, 1);
    put(inv2, 'bat', 1, 1, 1);
    put(inv2, 'spear', 1, 2, 0);
    const q = inv2.add('ant', 1)!;
    q.count = 2;
    const res = inv2.place(q, { col: 0, row: 0 });
    expect(res.kind).toBe('denied');
    expect(res.reason).toBe('No room to grow here');
    expect(p.count).toBe(2);
    expect(inv2.piece(q.id)).toBe(q);
    // with room it grows; on the bench a piece of any size just grows in its slot
    const r = put(inv2, 'frog', 1, 3, 3, 2);
    const r2 = inv2.add('frog', 1)!;
    r2.count = 2;
    expect(inv2.place(r2, { col: 3, row: 3 }).kind).toBe('fused');
    expect(footprint(r)).toEqual({ w: 2, h: 2 });
    const s1 = inv2.add('ant', 3)!;
    const s2 = inv2.add('ant', 3)!;
    expect(inv2.place(s2, { slot: s1.slot }).kind).toBe('fused');
    expect(s1.count).toBe(2);
    valid(inv2);
  });
  it('swaps only when both fit the other spot', () => {
    const inv = inv0();
    const k = put(inv, 'knife', 1, 0, 0);
    const pair = put(inv, 'ant', 1, 2, 0, 2);
    // the pair goes to the knife's old top-left cell (0,0)-(1,0); the knife to (3,0)
    expect(inv.place(k, { col: 3, row: 0 })).toMatchObject({ kind: 'swapped', other: pair });
    expect([pair.col, pair.row, k.col, k.row]).toEqual([0, 0, 3, 0]);
    valid(inv);
    // a square cannot take the knife's single cell when its other cells are taken
    const sq = put(inv, 'frog', 1, 3, 3, 4);
    put(inv, 'helmet', 1, 4, 0);
    const res = inv.place(k, { col: 3, row: 3 });
    expect(res.kind).toBe('denied');
    expect(res.reason).toContain('Frog');
    expect([sq.col, sq.row]).toEqual([3, 3]);
    // bench <-> grid: a big piece from the bench swaps with a grid item; any piece goes to the bench
    const bench = inv.add('frog', 2)!;
    bench.count = 4;
    const g = put(inv, 'chili', 1, 1, 3);
    expect(inv.place(bench, { col: 0, row: 3 })).toMatchObject({ kind: 'swapped', other: g });
    expect(g.slot).toBeGreaterThanOrEqual(0);
    expect(inv.place(sq, { slot: g.slot })).toMatchObject({ kind: 'swapped' }); // the chili lands at (3,3)
    expect(sq.slot).toBeGreaterThanOrEqual(0);
    expect(inv.at(3, 3)).toBe(g);
    valid(inv);
  });
  it('turns a pair on the grid when it fits, keeping its top-left cell', () => {
    const inv = inv0();
    const p = put(inv, 'ant', 1, 1, 1, 2);
    expect(inv.canTurn(p)).toBe(true);
    expect(inv.turn(p)).toEqual({ ok: true });
    expect(footprint(p)).toEqual({ w: 1, h: 2 });
    expect([p.col, p.row]).toEqual([1, 1]);
    expect(inv.at(1, 2)).toBe(p);
    expect(inv.at(2, 1)).toBeNull();
    put(inv, 'knife', 1, 2, 1);
    expect(inv.turn(p)).toMatchObject({ ok: false, reason: 'No room to turn it' });
    expect(p.turned).toBe(true);
    const edge = put(inv, 'frog', 1, 4, 3, 2, true);
    expect(inv.turn(edge).ok).toBe(false); // lying across would leave the grid
    const one = put(inv, 'ant', 1, 0, 0);
    expect(inv.turn(one).ok).toBe(false);
    const bench = inv.add('ant', 1)!;
    bench.count = 2;
    expect(inv.turn(bench).ok).toBe(false);
    valid(inv);
  });
  it('fuse limits: max count, max level, different count or class', () => {
    const inv = inv0();
    const a = inv.add('ant', 1)!; a.count = 4;
    const b = inv.add('ant', 1)!; b.count = 4;
    expect(inv.canFuse(a, b)).toBeNull();
    const c = inv.add('ant', 1)!; c.count = 2;
    expect(inv.canFuse(b, c)).toBeNull();
    const k = inv.add('knife', 7)!;
    const k2 = inv.add('knife', 7)!;
    expect(inv.canFuse(k, k2)).toBeNull();
    expect(inv.place(k, { slot: k2.slot }).kind).toBe('swapped');
  });
  it('the bench has 5 slots of any size', () => {
    const inv = inv0();
    for (let i = 0; i < BENCH_SLOTS; i++) expect(inv.add(i % 2 ? 'frog' : 'knife', 1)).not.toBeNull();
    expect(inv.freeBenchSlot()).toBe(-1);
    expect(inv.add('ant', 1)).toBeNull();
    const frog = inv.benchAt(1)!;
    frog.count = 4;
    expect(inv.place(frog, { col: 0, row: 0 }).kind).toBe('moved');
    expect(inv.place(frog, { slot: 1 }).kind).toBe('moved');
  });
  it('links: from every cell of a pet to what touches it; the used one is active', () => {
    const inv = inv0();
    const pet = put(inv, 'frog', 2, 1, 1, 4); // (1,1)-(2,2)
    put(inv, 'spear', 2, 1, 0); // above the left top cell
    put(inv, 'knife', 3, 3, 2); // right of the right bottom cell
    put(inv, 'bat', 1, 0, 2);
    put(inv, 'helmet', 1, 2, 3);
    put(inv, 'helmet', 2, 1, 3);
    put(inv, 'chili', 1, 4, 4); // not touching
    const s = inv.squadOf(pet);
    expect(s).toMatchObject({ weapon: 'knife', weaponLevel: 3, helmet: 2, chili: 0, count: 4 });
    const edges = inv.links();
    expect(edges.length).toBe(5);
    expect(edges.filter((e) => e.active).length).toBe(2);
    expect(edges.find((e) => e.c2 === 3 && e.r2 === 2)).toMatchObject({ c1: 2, r1: 2, active: true });
    expect(edges.find((e) => e.c2 === 1 && e.r2 === 0)).toMatchObject({ c1: 1, r1: 1, active: false });
    for (const e of edges) expect(Math.abs(e.c1 - e.c2) + Math.abs(e.r1 - e.r2)).toBe(1);
    expect(inv.power()).toBe(armyPower([s]));
    expect(inv.squads().length).toBe(1);
  });
  it('one item serves every pet around it, whatever their size', () => {
    const inv = inv0();
    const sw = put(inv, 'spear', 3, 2, 2);
    const pets = [put(inv, 'ant', 1, 1, 0, 2, true), put(inv, 'frog', 1, 3, 1, 4), put(inv, 'frog', 1, 2, 3, 2), put(inv, 'ant', 1, 1, 2)];
    expect(inv.servedBy(sw).map((p) => p.id).sort()).toEqual(pets.slice(1).map((p) => p.id).sort()); // the standing pair only touches it corner to corner
    expect(inv.squads().filter((s) => s.weapon === 'spear').length).toBe(3);
  });
  it('bench pets do not fight', () => {
    const inv = inv0();
    inv.add('ant', 1);
    expect(inv.squads()).toEqual([]);
  });
});

describe('rolls', () => {
  it('returns null with no rolls, scripts the first ones', () => {
    const s = newSave();
    s.rolls = 0;
    expect(rollOnce(s, makeRng(1))).toBeNull();
    s.rolls = 5;
    const rng = makeRng(2);
    for (let i = 0; i < SCRIPTED_ROLLS.length; i++) expect(rollOnce(s, rng)).toEqual(SCRIPTED_ROLLS[i]);
    expect(s.rolls).toBe(2);
    expect(s.rolled).toBe(3);
  });
  it('pity guarantees A-class after PITY misses', () => {
    const s = newSave();
    s.rolled = 10;
    s.rolls = 1;
    s.pity = PITY;
    const r = rollOnce(s, makeRng(3))!;
    expect(r.pity).toBe(true);
    expect(r.level).toBeGreaterThanOrEqual(5);
    expect(s.pity).toBe(0);
  });
  it('class odds follow the league and the draw matches them', () => {
    const s = newSave();
    s.rolled = 10;
    expect(classOdds(s)[0]).toBe(70);
    s.trophies = 1500;
    expect(classOdds(s)[0]).toBe(22);
    const rng = makeRng(5);
    let e = 0;
    for (let i = 0; i < 2000; i++) {
      s.rolls = 1;
      s.pity = 0;
      if (rollOnce(s, rng)!.level === 1) e++;
    }
    expect(e / 2000).toBeGreaterThan(0.18);
    expect(e / 2000).toBeLessThan(0.27);
  });
});

const summary = (winner: 0 | 1 | -1, k0: number, size1: number): SimSummary => ({ winner, byTime: false, time: 30, kills: [k0, 3], size: [10, size1], hpLeft: [0.5, 0] });
const opp = {} as Opponent;

describe('progress', () => {
  it('win gives trophies, record and win roll', () => {
    const s = newSave();
    s.trophies = 200;
    const r = applyMatch(s, summary(0, 10, 10), opp, makeRng(1));
    expect(r.won).toBe(true);
    expect(r.trophies).toBeGreaterThanOrEqual(REWARD.trophiesWin - REWARD.trophyJitter);
    expect(s.streak).toBe(1);
    expect(r.rolls).toBe(REWARD.rollsForKills + REWARD.rollsForWin);
  });
  it('defeat never goes below 0 and is gentle near 0', () => {
    const s = newSave();
    s.trophies = 0;
    expect(applyMatch(s, summary(1, 0, 10), opp, makeRng(1)).trophies).toBe(0);
    s.trophies = 500;
    expect(applyMatch(s, summary(1, 0, 10), opp, makeRng(1)).trophies).toBeLessThanOrEqual(-17);
    expect(s.streak).toBe(-2);
  });
  it('roll meter keeps fractions; league up and road', () => {
    const s = newSave();
    s.rolls = 0;
    applyMatch(s, summary(1, 3, 10), opp, makeRng(1));
    expect(s.rollMeter).toBeCloseTo(0.6);
    s.trophies = 95;
    s.bestTrophies = 95;
    expect(applyMatch(s, summary(0, 1, 10), opp, makeRng(1)).leagueUp).toBe(1);
    const c = claimRoad(s);
    expect(c.reached).toEqual([0, 1]);
    expect(c.rolls).toBe(TROPHY_ROAD[0].rolls + TROPHY_ROAD[1].rolls);
  });
});

/** a save whose grid holds these pieces: [type, level, count, col, row] */
function stateWith(list: [PieceType, number, number, number, number][], extra: Partial<SaveState> = {}): SaveState {
  const s: SaveState = { ...empty(), matches: 10, ...extra };
  s.pieces = list.map(([type, level, count, col, row], i) => ({ id: i + 1, type, level, count, col, row, slot: -1 }));
  s.nextId = list.length + 1;
  valid(new Inventory(s));
  return s;
}

describe('bots', () => {
  const armies: [string, [PieceType, number, number, number, number][]][] = [
    ['tutorial', [['ant', 1, 1, 0, 0], ['knife', 1, 1, 1, 0]]],
    ['two pairs', [['ant', 1, 2, 0, 0], ['knife', 1, 1, 2, 0], ['frog', 1, 2, 0, 1]]],
    ['mid', [['frog', 3, 4, 0, 0], ['shield', 3, 1, 2, 0], ['ant', 2, 4, 3, 0], ['spear', 2, 1, 2, 1], ['ant', 3, 2, 0, 2], ['bat', 3, 1, 2, 2]]],
    ['big', [['ant', 4, 4, 0, 0], ['knife', 4, 1, 2, 0], ['frog', 4, 4, 3, 0], ['bat', 4, 1, 2, 1], ['ant', 5, 4, 0, 2], ['spear', 5, 1, 2, 2], ['frog', 3, 2, 3, 2]]],
    ['huge', [['ant', 6, 4, 0, 0], ['knife', 6, 1, 2, 0], ['ant', 6, 4, 3, 0], ['bat', 6, 1, 2, 1], ['frog', 6, 4, 0, 2], ['spear', 6, 1, 2, 2], ['frog', 5, 4, 3, 2], ['shield', 5, 1, 2, 3], ['ant', 7, 2, 0, 4], ['knife', 7, 1, 2, 4], ['ant', 7, 1, 3, 4], ['ant', 7, 1, 4, 4]]],
  ];
  it('fields about as many fighters as the player, at the player power x the difficulty', () => {
    for (const [label, army] of armies) {
      const s = stateWith(army, { matches: 10, trophies: 600 });
      const me = playerArmy(s);
      expect(me.fighters).toBe(army.filter((q) => q[0] === 'ant' || q[0] === 'frog').reduce((a, q) => a + q[2], 0));
      const counts: number[] = [];
      const errs: number[] = [];
      for (let i = 0; i < 25; i++) {
        const o = makeOpponent(s, makeRng(i + 1));
        const n = o.army.squads.reduce((a, q) => a + q.count, 0);
        counts.push(n);
        expect(n).toBeGreaterThanOrEqual(Math.max(1, Math.ceil(me.fighters * (1 - BOT.countSpread) - 1e-9)));
        expect(n).toBeLessThanOrEqual(Math.max(1, Math.floor(me.fighters * (1 + BOT.countSpread) + 1e-9)));
        const target = me.power * botFactor(s);
        errs.push(o.power / target - 1);
        expect(o.power).toBe(armyPower(o.army.squads));
        expect(o.army.squads.length).toBeLessThanOrEqual(BOT.maxSquads);
        for (const q of o.army.squads) {
          expect([1, 2, 4]).toContain(q.count);
          expect(q.level >= 1 && q.level <= 7).toBe(true);
          expect(q.weaponLevel >= (q.weapon ? 1 : 0) && q.weaponLevel <= 7).toBe(true);
        }
      }
      // the target already carries the +-BOT.spread; the build lands within BOT.tolerance of it
      const off = errs.filter((e) => Math.abs(e) > BOT.spread + BOT.tolerance + 1e-9).length;
      console.log(`${label}: ${me.fighters} fighters, power ${me.power} -> bot fighters ${Math.min(...counts)}..${Math.max(...counts)}, power ${errs.map((e) => Math.round(e * 100)).sort((a, b) => a - b).filter((_, i) => i % 6 === 0).join('/')}%`);
      if (label !== 'tutorial') expect(off).toBe(0);
    }
  });
  it('matchArmy lands within the tolerance of its own target', () => {
    const r = makeRng(77);
    for (let i = 0; i < 120; i++) {
      const n = r.int(4, 25);
      const power = n * r.range(12, 400);
      const bot = matchArmy(n, power, 1, r);
      expect(Math.abs(armyPower(bot.squads) / bot.target - 1)).toBeLessThanOrEqual(BOT.tolerance);
    }
  });
  it('a one-on-one bot is the same pet with the same weapon, and weaker in the first match', () => {
    const s = stateWith([['ant', 1, 1, 0, 0], ['knife', 1, 1, 1, 0], ['helmet', 1, 1, 0, 1]], { matches: 0 });
    for (let i = 0; i < 10; i++) {
      const o = makeOpponent(s, makeRng(i + 3));
      expect(o.army.squads).toHaveLength(1);
      expect(o.army.squads[0]).toMatchObject({ pet: 'ant', count: 1, weapon: 'knife' });
      expect(o.power).toBeLessThan(playerArmy(s).power);
    }
    expect(kindsOf([{ key: 0, pet: 'frog', level: 1, count: 2, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0 }])).toHaveLength(2);
  });
  it('difficulty: easy first matches, rising with trophies, mercy and heat', () => {
    expect(botFactor({ matches: 0, trophies: 0, streak: 0 })).toBeCloseTo(0.8);
    expect(botFactor({ matches: 1, trophies: 0, streak: 0 })).toBeCloseTo(0.9);
    expect(botFactor({ matches: 2, trophies: 0, streak: 0 })).toBeCloseTo(0.9);
    expect(botFactor({ matches: 3, trophies: 0, streak: 0 })).toBeCloseTo(0.95);
    expect(botFactor({ matches: 30, trophies: 3000, streak: 0 })).toBeCloseTo(1.1);
    const mid = botFactor({ matches: 30, trophies: 700, streak: 0 });
    expect(mid > 0.95 && mid < 1.1).toBe(true);
    expect(botFactor({ matches: 30, trophies: 700, streak: -2 })).toBeCloseTo(mid * BOT.mercy);
    expect(botFactor({ matches: 30, trophies: 700, streak: 3 })).toBeCloseTo(mid * BOT.heat);
  });
  it('is varied, repeatable, never empty', () => {
    const s = stateWith([['ant', 3, 4, 0, 0], ['knife', 3, 1, 2, 0], ['frog', 3, 4, 3, 0], ['bat', 3, 1, 2, 1], ['ant', 2, 4, 0, 2]]);
    const mixes = new Set<string>();
    const names = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const o = makeOpponent(s, makeRng(i));
      const ants = o.army.squads.filter((q) => q.pet === 'ant').reduce((a, q) => a + q.count, 0);
      mixes.add(String(Math.round((ants / o.army.squads.reduce((a, q) => a + q.count, 0)) * 4)));
      names.add(o.name);
    }
    expect(mixes.size).toBeGreaterThanOrEqual(4);
    expect(names.size).toBeGreaterThan(50);
    expect(makeOpponent(s, makeRng(9))).toEqual(makeOpponent(s, makeRng(9)));
    const none = makeOpponent(empty(), makeRng(1));
    expect(none.army.squads.length).toBeGreaterThan(0);
  });
});

describe('save', () => {
  it('new save: version 2, the starter kit on the bench, the scripted rolls to come', () => {
    const s = newSave();
    expect(s.version).toBe(2);
    expect(s.pieces.map((p) => p.type)).toEqual(['ant', 'knife', 'helmet']);
    expect(s.pieces.every((p) => p.slot >= 0 && p.slot < BENCH_SLOTS)).toBe(true);
    expect(s.rolled).toBe(0);
    expect(s.rolls).toBeGreaterThanOrEqual(SCRIPTED_ROLLS.length);
    expect(s.name).toMatch(/^Player\d{5}$/);
  });
  it('loads in node without storage, never throws', () => {
    expect(load().pieces.length).toBe(3);
    expect(save(newSave())).toBe(false);
  });
  it('a version 1 save (the 8 x 8 grid) is replaced by a fresh start', () => {
    const old = { ...newSave(), version: 1, trophies: 640, pieces: [{ id: 1, type: 'frog', level: 5, count: 8, col: 7, row: 7, slot: -1 }] };
    const r = repair(JSON.parse(JSON.stringify(old)));
    expect(r).toEqual(newSave());
  });
  it('round trips and repairs a damaged version 2 save', () => {
    const mem: Record<string, string> = {};
    (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => (mem[k] = v) };
    try {
      const s = newSave();
      s.trophies = 123;
      s.bestTrophies = 123;
      new Inventory(s).place(s.pieces[0], { col: 0, row: 0 });
      s.pieces[0].count = 2;
      s.pieces[0].turned = true;
      expect(save(s)).toBe(true);
      expect(load()).toEqual(s);
      mem['zoopvp-save'] = '{not json';
      expect(load().pieces.length).toBe(3);
      mem['zoopvp-save'] = JSON.stringify({
        version: 2, trophies: -5, rolls: 'x',
        pieces: [
          { id: 1, type: 'ant', level: 99, count: 3, col: 1, row: 1, slot: -1 }, // count 2: (1,1)-(2,1)
          { id: 1, type: 'nope' },
          { id: 1, type: 'frog', level: 1, count: 4, col: 2, row: 0, slot: -1 }, // overlaps the pair: to the bench
          { id: 5, type: 'frog', level: 1, count: 4, col: 4, row: 4, slot: -1 }, // off the grid: to the bench
          null,
        ],
      });
      const r = load();
      expect(r.trophies).toBe(0);
      expect(r.rolls).toBe(0);
      expect(r.pieces.length).toBe(3);
      expect(r.pieces[0]).toMatchObject({ level: 7, count: 2, col: 1, row: 1 });
      expect(r.pieces[1].slot).toBeGreaterThanOrEqual(0);
      expect(r.pieces[2].slot).toBeGreaterThanOrEqual(0);
      expect(new Set(r.pieces.map((p) => p.id)).size).toBe(3);
      expect(r.nextId).toBeGreaterThan(5);
      valid(new Inventory(r));
    } finally {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });
  it('repair handles junk', () => {
    for (const j of [null, 5, 'x', [], {}, { pieces: 'x' }, { version: 2, pieces: 'x' }]) expect(repair(j).version).toBe(2);
  });
});

describe('autoArrange', () => {
  it('fuses, packs shapes, links the best kit and loses nothing', () => {
    const s = empty();
    const inv = new Inventory(s);
    const kit = [['ant', 1], ['ant', 1], ['frog', 1], ['knife', 1], ['knife', 1], ['bat', 1], ['helmet', 1], ['chili', 2], ['sneakers', 1]] as const;
    kit.forEach(([t, l], i) => inv.place(inv.add(t, l)!, { col: i % 5, row: Math.floor(i / 5) }));
    const before = inv.power();
    autoArrange(inv);
    valid(inv);
    expect(s.pieces.length).toBe(7); // ants and knives fused
    const pair = s.pieces.find((p) => p.type === 'ant')!;
    expect(pair.count).toBe(2);
    expect(inv.squads().length).toBe(2);
    expect(inv.squads().every((q) => q.weapon !== null)).toBe(true);
    expect(inv.squadOf(pair)).toMatchObject({ weapon: 'knife', weaponLevel: 2, chili: 2 }); // the biggest pet gets the best
    expect(inv.power()).toBeGreaterThan(before);
    const again = JSON.stringify(s.pieces);
    autoArrange(inv);
    expect(JSON.stringify(s.pieces)).toBe(again);
  });
  it('a full grid and bench: everything stays, nothing overlaps', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = makeRng(seed);
      const s = empty();
      const inv = new Inventory(s);
      // fill the grid and bench randomly with what fits
      const types: PieceType[] = ['ant', 'frog', 'knife', 'bat', 'shield', 'spear', 'helmet', 'sneakers', 'chili'];
      for (let i = 0; i < 60; i++) {
        const p = inv.add(r.pick(types), r.int(1, 4));
        if (!p) break;
        if (p.type === 'ant' || p.type === 'frog') p.count = r.pick([1, 2, 4]);
        for (let k = 0; k < 30; k++) if (inv.place(p, { col: r.int(0, 4), row: r.int(0, 4) }).kind === 'moved') break;
      }
      const ids = s.pieces.map((p) => p.id).sort();
      const cells = s.pieces.reduce((a, p) => a + (p.slot >= 0 ? 0 : footprint(p).w * footprint(p).h), 0);
      expect(cells).toBeGreaterThan(5);
      const powerBefore = inv.power();
      autoArrange(inv);
      valid(inv);
      // pieces are only ever fused, never dropped: every id left is an old one and fighters are kept
      for (const p of s.pieces) expect(ids).toContain(p.id);
      expect(s.pieces.filter((p) => p.slot >= 0).length).toBeLessThanOrEqual(BENCH_SLOTS);
      expect(inv.power()).toBeGreaterThan(powerBefore * 0.7);
    }
  });
});
