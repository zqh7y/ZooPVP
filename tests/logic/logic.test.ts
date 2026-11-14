import { describe, expect, it } from 'vitest';
import { BENCH_SLOTS, BOT, PITY, REWARD, SCRIPTED_ROLLS, TROPHY_ROAD, armyPower, botPowerAt } from '../../src/data';
import { makeRng } from '../../src/rng';
import type { Opponent, Piece, SaveState } from '../../src/types';
import type { SimSummary } from '../../src/sim/types';
import { Inventory } from '../../src/logic/inventory';
import { classOdds, rollOnce } from '../../src/logic/rolls';
import { applyMatch, claimRoad } from '../../src/logic/progress';
import { makeOpponent } from '../../src/logic/bots';
import { load, newSave, repair, save } from '../../src/logic/save';
import { autoArrange } from '../../src/logic/auto';

const empty = (): SaveState => ({ ...newSave(), pieces: [], nextId: 1 });
const inv0 = () => new Inventory(empty());
function put(inv: Inventory, type: Piece['type'], level: number, c: number, r: number, count = 1): Piece {
  const p = inv.add(type, level)!;
  p.count = count;
  inv.place(p, { col: c, row: r });
  return p;
}

describe('inventory', () => {
  it('moves, swaps grid and bench, fuses', () => {
    const inv = inv0();
    const a = inv.add('ant', 1)!;
    expect(inv.place(a, { col: 2, row: 2 }).kind).toBe('moved');
    const k = inv.add('knife', 1)!;
    const sw = inv.place(k, { col: 2, row: 2 });
    expect(sw.kind).toBe('swapped');
    expect(a.slot).toBe(0);
    expect(k.col).toBe(2);
    const k2 = inv.add('knife', 1)!;
    const f = inv.place(k2, { col: 2, row: 2 });
    expect(f).toMatchObject({ kind: 'fused', fuse: 'class', gone: k2.id });
    expect(k.level).toBe(2);
    expect(inv.piece(k2.id)).toBeNull();
  });
  it('previews without change and denies bad targets', () => {
    const inv = inv0();
    const a = inv.add('ant', 1)!;
    const b = put(inv, 'ant', 1, 0, 0);
    expect(inv.preview(a, { col: 0, row: 0 })).toMatchObject({ kind: 'fused', fuse: 'stack' });
    expect(a.slot).toBe(0);
    expect(b.count).toBe(1);
    expect(inv.place(a, { col: 8, row: 0 }).kind).toBe('denied');
    expect(inv.place(a, { slot: 99 }).kind).toBe('denied');
    inv.place(a, { col: 0, row: 0 });
    expect(b.count).toBe(2);
  });
  it('fuse limits: max count, max level, different count or class', () => {
    const inv = inv0();
    const a = inv.add('ant', 1)!; a.count = 8;
    const b = inv.add('ant', 1)!; b.count = 8;
    expect(inv.canFuse(a, b)).toBeNull();
    const c = inv.add('ant', 1)!; c.count = 2;
    expect(inv.canFuse(b, c)).toBeNull();
    const k = inv.add('knife', 7)!;
    const k2 = inv.add('knife', 7)!;
    expect(inv.canFuse(k, k2)).toBeNull();
    expect(inv.place(k, { slot: k2.slot }).kind).toBe('swapped');
    const h = inv.add('helmet', 2)!;
    const h2 = inv.add('helmet', 3)!;
    expect(inv.canFuse(h, h2)).toBeNull();
  });
  it('full bench gives no slot', () => {
    const inv = inv0();
    for (let i = 0; i < BENCH_SLOTS; i++) expect(inv.add('knife', 1)).not.toBeNull();
    expect(inv.freeBenchSlot()).toBe(-1);
    expect(inv.add('ant', 1)).toBeNull();
  });
  it('links: best weapon, tie by type order, gear per kind', () => {
    const inv = inv0();
    const pet = put(inv, 'ant', 1, 3, 3);
    put(inv, 'spear', 2, 3, 2);
    put(inv, 'knife', 2, 4, 3);
    put(inv, 'bat', 1, 3, 4);
    put(inv, 'helmet', 1, 2, 3);
    let s = inv.squadOf(pet);
    expect(s.weapon).toBe('knife');
    expect(s.weaponLevel).toBe(2);
    expect(s.helmet).toBe(1);
    expect(inv.links().filter((e) => e.active).length).toBe(2);
    expect(inv.links().length).toBe(4);
    put(inv, 'helmet', 3, 2, 4); // not touching
    expect(inv.squadOf(pet).helmet).toBe(1);
    expect(inv.squads().length).toBe(1);
    expect(inv.power()).toBe(armyPower([s]));
    s = inv.squadOf(inv.add('ant', 1)!);
    expect(s.weapon).toBeNull();
  });
  it('one item serves four pets', () => {
    const inv = inv0();
    const sw = put(inv, 'spear', 3, 3, 3);
    const pets = [put(inv, 'ant', 1, 3, 2), put(inv, 'ant', 1, 4, 3), put(inv, 'frog', 1, 3, 4), put(inv, 'frog', 1, 2, 3)];
    expect(inv.servedBy(sw).map((p) => p.id).sort()).toEqual(pets.map((p) => p.id).sort());
    expect(inv.squads().every((s) => s.weapon === 'spear' && s.weaponLevel === 3)).toBe(true);
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
    s.rolls = 1;
    rollOnce(s, makeRng(4));
    expect(s.pity).toBeLessThanOrEqual(1);
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
    expect(s.wins).toBe(1);
    expect(s.streak).toBe(1);
    expect(r.rolls).toBe(REWARD.rollsForKills + REWARD.rollsForWin);
    expect(s.bestTrophies).toBe(s.trophies);
  });
  it('defeat never goes below 0 and is gentle near 0', () => {
    const s = newSave();
    s.trophies = 5;
    const r = applyMatch(s, summary(1, 0, 10), opp, makeRng(1));
    expect(s.trophies).toBeGreaterThanOrEqual(0);
    expect(r.trophies).toBeLessThanOrEqual(0);
    s.trophies = 0;
    expect(applyMatch(s, summary(1, 0, 10), opp, makeRng(1)).trophies).toBe(0);
    expect(s.trophies).toBe(0);
    s.trophies = 500;
    expect(applyMatch(s, summary(1, 0, 10), opp, makeRng(1)).trophies).toBeLessThanOrEqual(-17);
    expect(s.streak).toBe(-3);
  });
  it('roll meter keeps fractions', () => {
    const s = newSave();
    s.rolls = 0;
    applyMatch(s, summary(1, 3, 10), opp, makeRng(1)); // 0.6
    expect(s.rolls).toBe(0);
    expect(s.rollMeter).toBeCloseTo(0.6);
    const r = applyMatch(s, summary(1, 3, 10), opp, makeRng(1)); // 1.2
    expect(r.rolls).toBe(1);
    expect(s.rollMeter).toBeCloseTo(0.2);
  });
  it('league up and road', () => {
    const s = newSave();
    s.trophies = 95;
    s.bestTrophies = 95;
    const r = applyMatch(s, summary(0, 1, 10), opp, makeRng(1));
    expect(r.leagueUp).toBe(1);
    const before = s.rolls;
    const c = claimRoad(s);
    expect(c.reached).toEqual([0, 1]);
    expect(c.rolls).toBe(TROPHY_ROAD[0].rolls + TROPHY_ROAD[1].rolls);
    expect(s.rolls).toBe(before + c.rolls);
    expect(claimRoad(s).rolls).toBe(0);
  });
});

describe('bots', () => {
  const stateAt = (t: number): SaveState => ({ ...newSave(), trophies: t, matches: 10 });
  it('lands near the target power', () => {
    for (const t of [0, 300, 1000, 2000]) {
      const errs: number[] = [];
      const sizes: number[] = [];
      for (let i = 0; i < 30; i++) {
        const st = stateAt(t);
        const o = makeOpponent(st, makeRng(i + 1));
        const low = botPowerAt(t) * BOT.spread[0];
        const high = botPowerAt(t) * BOT.spread[1];
        errs.push(o.power < low * 0.92 ? o.power / low - 1 : o.power > high * 1.08 ? o.power / high - 1 : 0);
        sizes.push(o.army.squads.length);
        expect(o.power).toBe(armyPower(o.army.squads));
        expect(o.trophies).toBeGreaterThanOrEqual(0);
        for (const sq of o.army.squads) {
          expect([1, 2, 4, 8]).toContain(sq.count);
          expect(sq.level).toBeGreaterThanOrEqual(1);
          expect(sq.level).toBeLessThanOrEqual(7);
        }
      }
      const bad = errs.filter((e) => e !== 0).length;
      console.log(`trophies ${t}: target ${Math.round(botPowerAt(t))}, outside range ${bad}/30, squads ${Math.min(...sizes)}..${Math.max(...sizes)}`);
      if (t <= 1000) expect(bad).toBe(0);
    }
  });
  it('exact accuracy against its own target', () => {
    // with a fixed spread the army power is within 8% of the target it was built for
    for (const t of [300, 1000]) {
      const st = stateAt(t);
      const o = makeOpponent(st, makeRng(7));
      const lo = botPowerAt(t) * BOT.spread[0] * 0.92;
      const hi = botPowerAt(t) * BOT.spread[1] * 1.08;
      expect(o.power).toBeGreaterThanOrEqual(lo);
      expect(o.power).toBeLessThanOrEqual(hi);
    }
  });
  it('first matches, mercy and heat change the target; names vary', () => {
    const avg = (f: (s: SaveState) => void) => {
      let sum = 0;
      for (let i = 0; i < 20; i++) {
        const s = stateAt(300);
        f(s);
        sum += makeOpponent(s, makeRng(i + 50)).power;
      }
      return sum / 20;
    };
    const base = avg(() => {});
    expect(avg((s) => (s.streak = -2))).toBeLessThan(base);
    expect(avg((s) => (s.streak = 3))).toBeGreaterThan(base);
    expect(avg((s) => (s.matches = 0))).toBeLessThan(base * 0.6);
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) names.add(makeOpponent(stateAt(0), makeRng(i)).name);
    expect(names.size).toBeGreaterThan(150);
  });
  it('is repeatable', () => {
    const a = makeOpponent(stateAt(300), makeRng(9));
    const b = makeOpponent(stateAt(300), makeRng(9));
    expect(a).toEqual(b);
  });
});

describe('save', () => {
  it('new save has the starter kit', () => {
    const s = newSave();
    expect(s.pieces.map((p) => p.type)).toEqual(['ant', 'knife', 'helmet']);
    expect(s.pieces.every((p) => p.slot >= 0)).toBe(true);
    expect(s.name).toMatch(/^Player\d{5}$/);
    expect(s.tutorial).toBe(0);
  });
  it('loads in node without storage, never throws', () => {
    expect(load().pieces.length).toBe(3);
    expect(save(newSave())).toBe(false);
  });
  it('round trips through a fake storage and repairs corrupt data', () => {
    const mem: Record<string, string> = {};
    (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => (mem[k] = v) };
    try {
      const s = newSave();
      s.trophies = 123;
      expect(save(s)).toBe(true);
      expect(load().trophies).toBe(123);
      mem['zoopvp-save'] = '{not json';
      expect(load().pieces.length).toBe(3);
      mem['zoopvp-save'] = JSON.stringify({ trophies: -5, pieces: [{ id: 1, type: 'ant', level: 99, count: 3, col: 1, row: 1, slot: -1 }, { id: 1, type: 'nope' }, { id: 1, type: 'ant', level: 1, count: 1, col: 1, row: 1, slot: -1 }, null], rolls: 'x' });
      const r = load();
      expect(r.trophies).toBe(0);
      expect(r.rolls).toBe(0);
      expect(r.pieces.length).toBe(2);
      expect(r.pieces[0]).toMatchObject({ level: 7, count: 2 });
      expect(new Set(r.pieces.map((p) => p.id)).size).toBe(2);
      expect(r.pieces[1].slot).toBeGreaterThanOrEqual(0);
      expect(r.nextId).toBeGreaterThan(2);
    } finally {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });
  it('repair handles junk', () => {
    for (const j of [null, 5, 'x', [], {}, { pieces: 'x' }]) expect(repair(j).version).toBe(1);
  });
});

describe('autoArrange', () => {
  it('fuses, links and loses nothing', () => {
    const s = empty();
    const inv = new Inventory(s);
    for (const [t, l] of [['ant', 1], ['ant', 1], ['frog', 1], ['knife', 1], ['knife', 1], ['bat', 1], ['helmet', 1], ['chili', 2], ['sneakers', 1]] as const) inv.add(t, l);
    const before = inv.power();
    autoArrange(inv);
    expect(s.pieces.length).toBe(7); // ants and knives fused
    expect(s.pieces.filter((p) => p.type === 'ant')[0].count).toBe(2);
    expect(new Set(s.pieces.map((p) => (p.slot >= 0 ? `s${p.slot}` : `${p.col},${p.row}`))).size).toBe(7);
    expect(inv.squads().length).toBe(2);
    expect(inv.squads().every((q) => q.weapon !== null)).toBe(true);
    expect(inv.power()).toBeGreaterThan(before);
    expect(s.pieces.filter((p) => p.slot >= 0).length).toBeLessThanOrEqual(BENCH_SLOTS);
    const again = JSON.stringify(s.pieces);
    autoArrange(inv);
    expect(JSON.stringify(s.pieces)).toBe(again);
  });
});
