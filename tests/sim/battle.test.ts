import { describe, expect, it } from 'vitest';
import { ARENA, FIGHT, unitStats } from '../../src/data';
import { makeRng } from '../../src/rng';
import { createBattle, runBattle } from '../../src/sim/battle';
import type { SimEvent } from '../../src/sim/types';
import type { ArmySpec, PetType, SquadSpec, WeaponType } from '../../src/types';

const WEAPONS: (WeaponType | null)[] = [null, 'knife', 'bat', 'shield', 'spear'];

function randomArmy(seed: number, squads: number): ArmySpec {
  const r = makeRng(seed);
  const list: SquadSpec[] = [];
  for (let i = 0; i < squads; i++) {
    const weapon = r.pick(WEAPONS);
    list.push({
      key: 0, pet: r.pick<PetType>(['ant', 'frog']), level: r.int(1, 4), count: r.pick([1, 2, 4]),
      weapon, weaponLevel: weapon ? r.int(1, 4) : 0,
      helmet: r.int(0, 2), sneakers: r.int(0, 2), chili: r.int(0, 2),
    });
  }
  return { squads: list };
}

function hashEvents(events: SimEvent[]): number {
  let h = 0x811c9dc5;
  const text = JSON.stringify(events, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) : v));
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function collect(armies: [ArmySpec, ArmySpec], seed: number, chunks: (i: number) => number) {
  const b = createBattle(armies, seed);
  const all: SimEvent[] = [];
  let i = 0;
  while (!b.over && i < 1e6) all.push(...b.step(chunks(i++)));
  return all;
}

describe('battle', () => {
  const armies: [ArmySpec, ArmySpec] = [randomArmy(1, 5), randomArmy(2, 5)];

  it('is deterministic for the same seed and any dt chunks', () => {
    const a = hashEvents(collect(armies, 7, () => 1 / 60));
    const b = hashEvents(collect(armies, 7, () => 1 / 60));
    const r = makeRng(3);
    const c = hashEvents(collect(armies, 7, () => r.range(0.001, 0.09)));
    const d = hashEvents(collect(armies, 7, () => 2.5));
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(d).toBe(a);
  });

  it('is fair: an army against itself wins about half the time', () => {
    for (const s of [11, 12]) {
      const army = randomArmy(s, 4);
      let wins = 0;
      let games = 0;
      for (let seed = 0; seed < 300; seed++) {
        const res = runBattle([army, army], seed * 7919 + s);
        if (res.winner === -1) continue;
        games++;
        if (res.winner === 0) wins++;
      }
      expect(Math.abs(wins / games - 0.5)).toBeLessThan(0.08); // 300 games: 0.08 is about 2.8 standard errors
    }
  });

  it('ends once, stays in the arena, keeps numbers finite, uses valid ids, dead never attack', () => {
    for (let s = 0; s < 12; s++) {
      const b = createBattle([randomArmy(100 + s, 1 + (s % 6)), randomArmy(200 + s, 1 + ((s * 5) % 6))], s);
      const n = b.units.length;
      const dead = new Set<number>();
      let ends = 0;
      let after = 0;
      const ok = (id: number) => Number.isInteger(id) && id >= 0 && id < n;
      while (!b.over) {
        const evs = b.step(1 / 30);
        for (const e of evs) {
          if (ends > 0) after++;
          if (e.type === 'end') ends++;
          if (e.type === 'windup' || e.type === 'swing') {
            expect(ok(e.unit)).toBe(true);
            expect(dead.has(e.unit)).toBe(false);
          }
          if (e.type === 'hit') {
            expect(ok(e.from) && ok(e.to)).toBe(true);
            expect(dead.has(e.from)).toBe(false);
            expect(dead.has(e.to)).toBe(false);
            expect(Number.isFinite(e.dmg)).toBe(true);
          }
          if (e.type === 'land') expect(ok(e.unit)).toBe(true);
          if (e.type === 'death') {
            expect(ok(e.unit)).toBe(true);
            expect(e.by === -1 || ok(e.by)).toBe(true);
            expect(dead.has(e.unit)).toBe(false);
            dead.add(e.unit);
          }
        }
        for (const u of b.units) {
          for (const v of [u.x, u.y, u.vx, u.vy, u.hp, u.hop]) expect(Number.isFinite(v)).toBe(true);
          if (!u.alive) continue;
          expect(u.x >= 0 && u.x <= ARENA.w && u.y >= 0 && u.y <= ARENA.h).toBe(true);
        }
      }
      expect(ends).toBe(1);
      expect(after).toBe(0);
      expect(b.step(1)).toEqual([]);
    }
  });

  it('lines up by kind in clean rows: frogs in front, ants behind, nobody overlapping, mirrored', () => {
    for (let s = 0; s < 20; s++) {
      const r = makeRng(500 + s);
      const army = (): ArmySpec => randomArmy(r.int(1, 1e6), r.int(1, 8));
      const b = createBattle([army(), army()], s);
      for (const team of [0, 1] as const) {
        const mine = b.units.filter((u) => u.team === team);
        // distance from its own end line
        const depth = (y: number) => (team === 0 ? ARENA.h - y : y);
        const frogs = mine.filter((u) => u.pet === 'frog');
        const ants = mine.filter((u) => u.pet === 'ant');
        if (frogs.length && ants.length) {
          const backFrog = Math.min(...frogs.map((u) => depth(u.y) - u.r));
          const frontAnt = Math.max(...ants.map((u) => depth(u.y) + u.r));
          expect(frontAnt).toBeLessThanOrEqual(backFrog + 1e-6);
        }
        for (const u of mine) {
          expect(depth(u.y)).toBeLessThan(ARENA.h / 2);
          expect(u.x - u.r).toBeGreaterThanOrEqual(0);
          expect(u.x + u.r).toBeLessThanOrEqual(ARENA.w);
          for (const o of mine) if (o !== u) expect(Math.hypot(o.x - u.x, o.y - u.y)).toBeGreaterThanOrEqual(u.r + o.r);
        }
        // a squad stands together in its kind's rows: each row holds one kind
        const rows = new Map<number, Set<string>>();
        for (const u of mine) {
          const k = Math.round(depth(u.y) / 4);
          if (!rows.has(k)) rows.set(k, new Set());
          rows.get(k)!.add(u.pet);
        }
        for (const kinds of rows.values()) expect(kinds.size).toBe(1);
      }
    }
    // the same army on both sides stands as a mirror image
    const a = randomArmy(9, 6);
    const b = createBattle([a, a], 3);
    const half = b.units.length / 2;
    for (let i = 0; i < half; i++) {
      expect(Math.abs(b.units[i].x - b.units[i + half].x)).toBeLessThan(2.5);
      expect(Math.abs(ARENA.h - b.units[i].y - b.units[i + half].y)).toBeLessThan(2.5);
    }
  });

  it('pets are big and a one-on-one ends in seconds', () => {
    const one = (pet: PetType, weapon: WeaponType | null): SquadSpec => ({ key: 0, pet, level: 1, count: 1, weapon, weaponLevel: weapon ? 1 : 0, helmet: 0, sneakers: 0, chili: 0 });
    expect(unitStats(one('ant', null)).radius).toBeGreaterThanOrEqual(11);
    expect(unitStats(one('frog', null)).radius).toBeGreaterThanOrEqual(18);
    const times: number[] = [];
    for (const pet of ['ant', 'frog'] as PetType[]) {
      for (const w of WEAPONS) {
        const b = createBattle([{ squads: [one(pet, w)] }, { squads: [one(pet, w)] }], 5);
        let first = -1;
        let ko = -1;
        while (!b.over) for (const e of b.step(1 / 60)) {
          if (e.type === 'hit' && first < 0) first = b.time;
          if (e.type === 'death' && ko < 0) ko = b.time;
        }
        times.push(ko - first);
      }
    }
    times.sort((x, y) => x - y);
    const median = times[Math.floor(times.length / 2)];
    expect(median).toBeGreaterThanOrEqual(2);
    expect(median).toBeLessThanOrEqual(7);
    expect(times[times.length - 1]).toBeLessThan(FIGHT.enrageAt);
  });

  it('runs a 25 v 25 fight fast, and an 80 v 80 one', () => {
    const t25 = performance.now();
    runBattle([randomArmy(3, 8), randomArmy(4, 8)], 2);
    expect(performance.now() - t25).toBeLessThan(150);
    const big = (seed: number): ArmySpec => ({
      squads: [...randomArmy(seed, 10).squads, ...randomArmy(seed + 1, 10).squads].map((q) => ({ ...q, count: 4 })),
    });
    const t0 = performance.now();
    const res = runBattle([big(5), big(6)], 1);
    const ms = performance.now() - t0;
    expect(res.size).toEqual([80, 80]);
    expect(ms).toBeLessThan(150);
  });
});
