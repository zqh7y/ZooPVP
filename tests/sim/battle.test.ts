import { describe, expect, it } from 'vitest';
import { ARENA } from '../../src/data';
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
      key: 0, pet: r.pick<PetType>(['ant', 'frog']), level: r.int(1, 4), count: r.pick([1, 2, 4, 8]),
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
      expect(Math.abs(wins / games - 0.5)).toBeLessThan(0.06);
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

  it('runs an 80 v 80 fight fast', () => {
    const big = (seed: number): ArmySpec => ({
      squads: randomArmy(seed, 10).squads.map((q) => ({ ...q, count: 8 })),
    });
    const t0 = performance.now();
    const res = runBattle([big(5), big(6)], 1);
    const ms = performance.now() - t0;
    expect(res.size).toEqual([80, 80]);
    expect(ms).toBeLessThan(150);
  });
});
