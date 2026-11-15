import { describe, expect, it } from 'vitest';
import { ARENA, BOSS, PETS, PET_TYPES, TRAIT, tierOf, rungOf, unitStats } from '../../src/data';
import { makeRng } from '../../src/rng';
import { LINE_ORDER, createBattle, runBattle } from '../../src/sim/battle';
import type { Battle, HitEvent, SimEvent } from '../../src/sim/types';
import type { ArmySpec, PetType, SquadSpec, WeaponType } from '../../src/types';
import { buildArmy } from '../../src/logic/waves';

const WEAPONS: (WeaponType | null)[] = [null, 'knife', 'bat', 'shield', 'spear'];
const sq = (pet: PetType, count = 1, o: Partial<SquadSpec> = {}): SquadSpec => ({ key: 0, pet, count, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0, ...o });
const army = (...squads: SquadSpec[]): ArmySpec => ({ squads });
/** a unit with its rung's natural kit and this weapon */
const kit = (pet: PetType, count: number, weapon: WeaponType | null = 'knife', o: Partial<SquadSpec> = {}): SquadSpec => {
  const t = tierOf(rungOf(pet));
  return sq(pet, count, { weapon, weaponLevel: weapon ? t : 0, helmet: t, chili: t, ...o });
};

/** random armies of the whole cast, rungs within two of `centre` */
function randomArmy(seed: number, squads: number, centre = 4): ArmySpec {
  const r = makeRng(seed);
  const list: SquadSpec[] = [];
  for (let i = 0; i < squads; i++) {
    const rung = Math.max(1, Math.min(12, centre + r.int(-2, 2)));
    const weapon = r.pick(WEAPONS);
    const t = tierOf(rung);
    list.push(sq(PET_TYPES[rung - 1], r.pick([1, 2, 4]), { weapon, weaponLevel: weapon ? t : 0, helmet: r.int(0, t), sneakers: r.int(0, 1), chili: r.int(0, t) }));
  }
  return { squads: list };
}
/** one squad of every unit, natural kits: every trait in play */
const everyone = (o: Partial<SquadSpec> = {}): ArmySpec => army(...PET_TYPES.map((p, i) => kit(p, i < 6 ? 2 : 1, WEAPONS[1 + (i % 4)], o)));

function hashEvents(events: SimEvent[]): number {
  let h = 0x811c9dc5;
  const text = JSON.stringify(events, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) : v));
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function collect(armies: [ArmySpec, ArmySpec], seed: number, chunks: (i: number) => number = () => 1 / 60) {
  const b = createBattle(armies, seed);
  const all: SimEvent[] = [];
  let i = 0;
  while (!b.over && i < 1e6) all.push(...b.step(chunks(i++)));
  return { b, all };
}
const hitsOf = (all: SimEvent[]) => all.filter((e): e is HitEvent => e.type === 'hit');
const petOf = (b: Battle, id: number) => b.units[id].pet;

describe('battle', () => {
  const armies: [ArmySpec, ArmySpec] = [everyone(), randomArmy(2, 6, 7)];

  it('is deterministic for the same seed and any dt chunks, with every trait in play', () => {
    const a = hashEvents(collect(armies, 7).all);
    const r = makeRng(3);
    expect(hashEvents(collect(armies, 7).all)).toBe(a);
    expect(hashEvents(collect(armies, 7, () => r.range(0.001, 0.09)).all)).toBe(a);
    expect(hashEvents(collect(armies, 7, () => 2.5).all)).toBe(a);
    expect(hashEvents(collect(armies, 8).all)).not.toBe(a);
  });

  it('never depends on the order units are looked at (shuffled think order, same fight)', () => {
    const r = makeRng(41);
    for (let i = 0; i < 14; i++) {
      const pair: [ArmySpec, ArmySpec] = i === 0 ? [everyone(), everyone()] : [randomArmy(r.int(1, 1e6), r.int(2, 6), r.int(2, 11)), randomArmy(r.int(1, 1e6), r.int(2, 6), r.int(2, 11))];
      const base = JSON.stringify(runBattle(pair, i));
      for (const k of [1, 2]) expect(JSON.stringify(runBattle(pair, i, { shuffle: k }))).toBe(base);
    }
  });

  it('is fair: an army against itself wins about half the time', () => {
    for (const s of [11, 12]) {
      const a = randomArmy(s, 4, s === 11 ? 3 : 8);
      let wins = 0;
      let games = 0;
      for (let seed = 0; seed < 300; seed++) {
        const res = runBattle([a, a], seed * 7919 + s);
        if (res.winner === -1) continue;
        games++;
        if (res.winner === 0) wins++;
      }
      expect(Math.abs(wins / games - 0.5)).toBeLessThan(0.08); // 300 games: 0.08 is about 2.8 standard errors
    }
  });

  it('ends once, stays in the arena, keeps numbers finite, uses valid ids, dead never attack', () => {
    for (let s = 0; s < 10; s++) {
      const b = createBattle([randomArmy(100 + s, 1 + (s % 6), 2 + s), randomArmy(200 + s, 1 + ((s * 5) % 6), 2 + s)], s);
      const n = b.units.length;
      const dead = new Set<number>();
      let ends = 0;
      let after = 0;
      const ok = (id: number) => Number.isInteger(id) && id >= 0 && id < n;
      while (!b.over) {
        for (const e of b.step(1 / 30)) {
          if (ends > 0) after++;
          if (e.type === 'end') ends++;
          if (e.type === 'windup' || e.type === 'swing') {
            expect(ok(e.unit)).toBe(true);
            expect(dead.has(e.unit)).toBe(false);
          }
          if (e.type === 'hit') {
            expect(ok(e.from) && ok(e.to)).toBe(true);
            expect(dead.has(e.to)).toBe(false);
            if (!e.spike) expect(dead.has(e.from)).toBe(false);
            expect(Number.isFinite(e.dmg) && e.dmg >= 0).toBe(true);
          }
          if ('x' in e) expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
          if (e.type === 'death') {
            expect(ok(e.unit)).toBe(true);
            expect(e.by === -1 || ok(e.by)).toBe(true);
            expect(dead.has(e.unit)).toBe(false);
            dead.add(e.unit);
          }
        }
        for (const u of b.units) {
          for (const v of [u.x, u.y, u.vx, u.vy, u.hp, u.hop, u.poison]) expect(Number.isFinite(v)).toBe(true);
          if (!u.alive || u.phase === 'air') continue;
          expect(u.x >= 0 && u.x <= ARENA.w && u.y >= 0 && u.y <= ARENA.h).toBe(true);
        }
      }
      expect(ends).toBe(1);
      expect(after).toBe(0);
      expect(b.step(1)).toEqual([]);
      const sum = b.summary!;
      expect(sum.alive[0] + sum.alive[1]).toBe(b.units.filter((u) => u.alive).length);
    }
  });

  it('lines up by kind and band: front, then middle, then back; one kind per row; mirrored; nobody overlapping', () => {
    expect(new Set(LINE_ORDER).size).toBe(12);
    const band = (p: PetType) => ['front', 'middle', 'back'].indexOf(PETS[p].row);
    for (let i = 1; i < LINE_ORDER.length; i++) expect(band(LINE_ORDER[i])).toBeGreaterThanOrEqual(band(LINE_ORDER[i - 1]));
    for (let s = 0; s < 16; s++) {
      const r = makeRng(500 + s);
      const b = createBattle([randomArmy(r.int(1, 1e6), r.int(1, 7), r.int(3, 10)), randomArmy(r.int(1, 1e6), r.int(1, 7), r.int(3, 10))], s);
      for (const team of [0, 1] as const) {
        const mine = b.units.filter((u) => u.team === team);
        const depth = (y: number) => (team === 0 ? ARENA.h - y : y);
        for (const u of mine)
          for (const o of mine) {
            if (o === u) continue;
            expect(Math.hypot(o.x - u.x, o.y - u.y)).toBeGreaterThanOrEqual(u.r + o.r);
            // a front-band unit stands ahead of (or level with) every back-band one
            if (band(u.pet) < band(o.pet)) expect(depth(u.y)).toBeGreaterThan(depth(o.y) - 1e-6);
          }
        for (const u of mine) expect(depth(u.y)).toBeLessThan(ARENA.h / 2);
      }
    }
    const a = randomArmy(9, 6);
    const b = createBattle([a, a], 3);
    const half = b.units.length / 2;
    for (let i = 0; i < half; i++) {
      expect(Math.abs(b.units[i].x - b.units[i + half].x)).toBeLessThan(2.5);
      expect(Math.abs(ARENA.h - b.units[i].y - b.units[i + half].y)).toBeLessThan(2.5);
    }
  });

  it('knife duels with the natural kit end in seconds at every rung', () => {
    for (const pet of PET_TYPES) {
      const times: number[] = [];
      for (let seed = 1; seed <= 4; seed++) {
        const b = createBattle([army(kit(pet, 1)), army(kit(pet, 1))], seed);
        let first = -1;
        let ko = -1;
        while (!b.over) for (const e of b.step(1 / 60)) {
          if (e.type === 'hit' && first < 0) first = b.time;
          if (e.type === 'death' && ko < 0) ko = b.time;
        }
        times.push(ko - first);
      }
      const mean = times.reduce((x, y) => x + y, 0) / times.length;
      expect(mean, pet).toBeGreaterThan(2);
      expect(mean, pet).toBeLessThan(9);
    }
  });

  it('runs a 25 v 25 fight fast, and an 80 v 80 one', () => {
    const t25 = performance.now();
    runBattle([randomArmy(3, 8), randomArmy(4, 8)], 2);
    expect(performance.now() - t25).toBeLessThan(150);
    const big = (seed: number): ArmySpec => ({ squads: [...randomArmy(seed, 10).squads, ...randomArmy(seed + 1, 10).squads].map((q) => ({ ...q, count: 4 })) });
    const t0 = performance.now();
    const res = runBattle([big(5), big(6)], 1);
    expect(res.size).toEqual([80, 80]);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('traits', () => {
  it('sprout: bites harder in a pack', () => {
    const { b, all } = collect([army(sq('sprout', 4)), army(sq('sprout', 4))], 1);
    const bites = hitsOf(all).filter((h) => petOf(b, h.from) === 'sprout');
    expect(bites.some((h) => h.pack >= 2)).toBe(true);
    expect(bites.every((h) => h.pack >= 0 && h.pack <= TRAIT.sprout.max)).toBe(true);
  });
  it('buzzy: stings poison (events with the buzzy and a position), and poison can knock out', () => {
    let poisonKo = 0;
    for (let seed = 0; seed < 6; seed++) {
      const { b, all } = collect([army(sq('buzzy', 4)), army(sq('sprout', 4, { helmet: 2 }))], seed);
      const ev = all.filter((e) => e.type === 'poison');
      expect(ev.length).toBeGreaterThan(0);
      for (const e of ev) if (e.type === 'poison') expect(petOf(b, e.by)).toBe('buzzy');
      poisonKo += all.filter((e) => e.type === 'death' && e.cause === 'poison').length;
    }
    expect(poisonKo).toBeGreaterThan(0);
  });
  it('ninja: about 30% of hits aimed at it miss, with a dodge event', () => {
    let dodged = 0;
    let landed = 0;
    for (let seed = 0; seed < 6; seed++) {
      const { b, all } = collect([army(sq('ninja', 4)), army(sq('ninja', 4))], seed);
      dodged += all.filter((e) => e.type === 'dodge').length;
      landed += hitsOf(all).filter((h) => petOf(b, h.to) === 'ninja' && !h.spike).length;
    }
    const share = dodged / (dodged + landed);
    expect(share).toBeGreaterThan(TRAIT.ninja.dodge - 0.05);
    expect(share).toBeLessThan(TRAIT.ninja.dodge + 0.05);
  });
  it('snailor: hides in its shell once per life, then pops out', () => {
    const { b, all } = collect([army(sq('snailor', 2)), army(sq('ninja', 4))], 3);
    const on = all.filter((e) => e.type === 'shell' && e.on);
    expect(on.length).toBeGreaterThan(0);
    const per = new Map<number, number>();
    for (const e of on) if (e.type === 'shell') per.set(e.unit, (per.get(e.unit) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBe(1);
    expect(all.some((e) => e.type === 'shell' && !e.on)).toBe(true);
    expect(hitsOf(all).some((h) => h.shell)).toBe(true);
    void b;
  });
  it('roo: its punches slap and interrupt lighter foes', () => {
    const { b, all } = collect([army(sq('roo', 2)), army(sq('sprout', 4))], 2);
    const punches = hitsOf(all).filter((h) => petOf(b, h.from) === 'roo');
    expect(punches.length).toBeGreaterThan(0);
    expect(punches.every((h) => h.slap)).toBe(true);
  });
  it('cacto: every attack is two jabs', () => {
    const { b, all } = collect([army(sq('cacto', 1)), army(sq('cacto', 1))], 4);
    const jabs = hitsOf(all).filter((h) => petOf(b, h.from) === 'cacto');
    expect(jabs.filter((h) => h.pinch === 1).length).toBe(jabs.filter((h) => h.pinch === 2).length);
    expect(jabs.every((h) => h.pinch === 1 || h.pinch === 2)).toBe(true);
  });
  it('pogo: leaps onto the back line at the whistle; the landing hits and stuns', () => {
    const { b, all } = collect([army(sq('roo', 2), sq('pogo', 1)), army(sq('roo', 2), sq('angler', 1))], 5);
    const start = all.findIndex((e) => e.type === 'start');
    const leap = all.find((e) => e.type === 'leap');
    expect(leap && leap.type === 'leap' && all.indexOf(leap) > start).toBe(true);
    if (leap?.type === 'leap') {
      expect(petOf(b, leap.unit)).toBe('pogo');
      expect(petOf(b, leap.target)).toBe('angler'); // the deepest foe
      expect(leap.dur).toBe(TRAIT.pogo.flight);
    }
    expect(all.some((e) => e.type === 'land' && e.big)).toBe(true);
    expect(hitsOf(all).some((h) => h.blow === 'landing' && h.stun)).toBe(true);
  });
  it('briar: thorns return part of every hit to the attacker', () => {
    const { b, all } = collect([army(sq('briar', 1)), army(sq('briar', 1))], 6);
    const thorns = hitsOf(all).filter((h) => h.spike);
    expect(thorns.length).toBeGreaterThan(0);
    for (const t of thorns) expect(petOf(b, t.from)).toBe('briar');
  });
  it('angler: the hook pulls light foes in', () => {
    const { b, all } = collect([army(sq('angler', 1)), army(kit('briar', 2))], 7);
    const pulls = hitsOf(all).filter((h) => h.pull);
    expect(pulls.length).toBeGreaterThan(0);
    for (const p of pulls) expect(petOf(b, p.from)).toBe('angler');
  });
  it('sumo: belly-slides at the whistle, and slams the first foe it reaches on a slide', () => {
    let slams = 0;
    for (let seed = 0; seed < 8; seed++) {
      const { b, all } = collect([army(kit('sumo', 1)), army(kit('pogo', 4), kit('angler', 2))], seed);
      const first = all.find((e) => e.type === 'slide');
      expect(first?.type === 'slide' && first.on && petOf(b, first.unit) === 'sumo').toBe(true);
      for (const e of all) if (e.type === 'slam') {
        slams++;
        expect(hitsOf(all).some((h) => h.from === e.unit && h.blow === 'slam' && h.heavy)).toBe(true);
      }
    }
    expect(slams).toBeGreaterThan(0);
  });
  it('rhino: after a run-up its horn goes down and the next strike is a charge', () => {
    const { b, all } = collect([army(sq('rhino', 1)), army(sq('rhino', 1))], 9);
    const charge = all.findIndex((e) => e.type === 'charge');
    const hit = all.findIndex((e) => e.type === 'hit' && e.blow === 'charge');
    expect(charge).toBeGreaterThanOrEqual(0);
    expect(hit).toBeGreaterThan(charge);
    void b;
  });
  it('boulder: armour cuts every hit on it; its stomp hits up to 4 foes around it', () => {
    const { b, all } = collect([army(kit('boulder', 1)), army(kit('rhino', 4))], 10);
    const onIt = hitsOf(all).filter((h) => petOf(b, h.to) === 'boulder');
    expect(onIt.length).toBeGreaterThan(0);
    expect(onIt.every((h) => h.armour)).toBe(true);
    const stomps = all.filter((e) => e.type === 'stomp');
    expect(stomps.length).toBeGreaterThan(0);
    for (const s of stomps) if (s.type === 'stomp') expect(s.n).toBeLessThanOrEqual(TRAIT.boulder.stompMax);
  });
});

describe('bosses', () => {
  it('a boss is a giant of its unit: bigger, much tougher, harder hitting, flagged for the crown', () => {
    const base = unitStats(sq('roo'));
    const boss = unitStats(sq('roo', 1, { boss: true }));
    expect(boss.radius).toBeCloseTo(base.radius * BOSS.radius, 6);
    expect(boss.hp).toBeGreaterThan(base.hp * 5);
    expect(boss.dmg * (1 / boss.cd)).toBeGreaterThanOrEqual(base.dmg * (1 / base.cd) * 0.79);
    expect(boss.boss).toBe(true);
    const b = createBattle([army(kit('roo', 4)), army(sq('roo', 1, { boss: true }), sq('sprout', 2))], 1);
    expect(b.units.filter((u) => u.boss).map((u) => [u.team, u.pet])).toEqual([[1, 'roo']]);
    expect(b.units.find((u) => u.boss)!.r).toBeCloseTo(PETS.roo.radius * BOSS.radius, 6);
  });
  it('knocking out the boss counts in the summary', () => {
    const s = runBattle([army(kit('cacto', 4)), army(sq('roo', 1, { boss: true }))], 2);
    expect(s.winner).toBe(0);
    expect(s.bossKos).toEqual([1, 0]);
    expect(s.alive[1]).toBe(0);
  });
  it('a boss wave stands its boss in a row of its own, ahead of its kind', () => {
    const b = createBattle([army(sq('sprout', 1)), army(sq('roo', 2), sq('roo', 1, { boss: true }))], 3);
    const boss = b.units.find((u) => u.boss)!;
    for (const u of b.units.filter((x) => x.team === 1 && !x.boss)) expect(boss.y).toBeGreaterThan(u.y);
  });
});

describe('the cast in fights', () => {
  it('mixed armies of equal POWER from the cast split their fights', () => {
    const r = makeRng(8);
    let wins = 0;
    const games = 60;
    for (let i = 0; i < games; i++) {
      const p = 50 * 2 ** r.range(0, 9);
      const a = { squads: buildArmy(p, r.int(3, 10), r, 10) };
      const b = { squads: buildArmy(p, r.int(3, 10), r, 10) };
      const s = runBattle(i % 2 ? [b, a] : [a, b], i);
      if (s.winner === (i % 2 ? 1 : 0)) wins++;
      else if (s.winner === -1) wins += 0.5;
    }
    expect(wins / games).toBeGreaterThan(0.3);
    expect(wins / games).toBeLessThan(0.7);
  });
});
