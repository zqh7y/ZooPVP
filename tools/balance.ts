/*
 * Balance check: npx tsx tools/balance.ts
 * 1) fight length of matched armies, 2) weapons against each other, 3) is armyPower honest.
 */
import { armyPower, FIGHT, GEAR_TYPES, squadPower } from '../src/data';
import { makeRng, type Rng } from '../src/rng';
import { runBattle } from '../src/sim/battle';
import type { ArmySpec, PetType, SquadSpec, WeaponType } from '../src/types';

const OPTS: (WeaponType | null)[] = [null, 'knife', 'bat', 'shield', 'spear'];
const name = (w: WeaponType | null) => w ?? 'none';
const pct = (v: number) => `${Math.round(v * 100)}%`;

function squad(r: Rng, count: number, lvl: number): SquadSpec {
  const weapon = r.pick(OPTS);
  const l = () => Math.max(1, Math.min(7, lvl + r.int(-1, 1)));
  return {
    key: 0, pet: r.pick<PetType>(['ant', 'frog']), level: l(), count, weapon, weaponLevel: weapon ? l() : 0,
    helmet: r.chance(0.4) ? l() : 0, sneakers: r.chance(0.3) ? l() : 0, chili: r.chance(0.4) ? l() : 0,
  };
}

/** a random army of about n fighters */
function army(r: Rng, n: number, lvl: number): ArmySpec {
  const squads: SquadSpec[] = [];
  let left = n;
  while (left > 0) {
    const c = [8, 4, 2, 1].filter((k) => k <= left);
    const count = r.pick(c);
    squads.push(squad(r, count, lvl));
    left -= count;
  }
  return { squads };
}

const quant = (a: number[], q: number) => a.slice().sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];

// 1) fight length
console.log('== fight length (same army both sides) ==');
for (const n of [1, 2, 4, 8, 16, 30, 60]) {
  const r = makeRng(n * 101);
  const times: number[] = [];
  let over = 0;
  let byTime = 0;
  const runs = n >= 30 ? 30 : 80;
  for (let i = 0; i < runs; i++) {
    const a = army(r, n, r.int(1, 5));
    const s = runBattle([a, a], i + 1);
    times.push(s.time);
    if (s.time > FIGHT.enrageAt) over++;
    if (s.byTime) byTime++;
  }
  const inBand = times.filter((t) => t >= 12 && t <= 45).length / runs;
  console.log(
    `${String(n).padStart(2)}v${n}: p10 ${quant(times, 0.1).toFixed(1)}s median ${quant(times, 0.5).toFixed(1)}s p90 ${quant(times, 0.9).toFixed(1)}s` +
      ` | 12-45s ${pct(inBand)} overtime ${pct(over / runs)} byTime ${pct(byTime / runs)}`,
  );
}

// 2) weapons, same pet class and count
console.log('\n== weapon (row) vs weapon (col): row win rate ==');
for (const pet of ['ant', 'frog'] as PetType[]) {
  console.log(`${pet}, class 3, 4 fighters:   ` + OPTS.map((w) => name(w).padStart(7)).join(''));
  for (const a of OPTS) {
    let line = `  ${name(a).padEnd(25)}`;
    for (const b of OPTS) {
      const mk = (w: WeaponType | null): ArmySpec => ({
        squads: [{ key: 0, pet, level: 3, count: 4, weapon: w, weaponLevel: w ? 3 : 0, helmet: 0, sneakers: 0, chili: 0 }],
      });
      let w = 0;
      const runs = 60;
      for (let i = 0; i < runs; i++) {
        const s = runBattle(i % 2 ? [mk(a), mk(b)] : [mk(b), mk(a)], i + 7);
        if (s.winner === (i % 2 ? 0 : 1)) w++;
        else if (s.winner === -1) w += 0.5;
      }
      line += (a === b ? '-' : pct(w / runs)).padStart(7);
    }
    console.log(line);
  }
}

// 3) power honesty
console.log('\n== power honesty ==');
{
  const r = makeRng(99);
  const pool: { a: ArmySpec; p: number }[] = [];
  for (let i = 0; i < 2500; i++) {
    const a = army(r, r.pick([2, 4, 6, 10, 16, 24]), r.int(1, 5));
    pool.push({ a, p: armyPower(a.squads) });
  }
  for (const [lo, hi] of [[1, 1.05], [1.25, 1.35]] as const) {
    let wins = 0;
    let games = 0;
    let tries = 0;
    while (games < 300 && tries < 200000) {
      tries++;
      const x = pool[r.int(0, pool.length - 1)];
      const y = pool[r.int(0, pool.length - 1)];
      const ratio = x.p / y.p;
      if (ratio < lo || ratio > hi || x === y) continue;
      const flip = games % 2 === 1;
      const s = runBattle(flip ? [y.a, x.a] : [x.a, y.a], games + 3);
      if (s.winner === (flip ? 1 : 0)) wins++;
      else if (s.winner === -1) wins += 0.5;
      games++;
    }
    console.log(`power ratio ${lo}..${hi}: stronger side wins ${pct(wins / games)} of ${games}`);
  }
  // fusing or adding never lowers power
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    const s = squad(r, r.pick([1, 2, 4]), r.int(1, 6));
    const p = squadPower(s);
    const up = (q: Partial<SquadSpec>) => {
      if (squadPower({ ...s, ...q }) < p - 1e-9) bad++;
    };
    if (squadPower({ ...s, count: s.count * 2 }) < 2 * p - 1e-9) bad++;
    if (s.level < 7) up({ level: s.level + 1 });
    if (s.weapon && s.weaponLevel < 7) up({ weaponLevel: s.weaponLevel + 1 });
    if (!s.weapon) for (const w of OPTS) if (w) up({ weapon: w, weaponLevel: 1 });
    for (const g of GEAR_TYPES) if (s[g] < 7) up({ [g]: s[g] + 1 });
  }
  console.log(`power never drops on fuse/add: ${bad === 0 ? 'ok' : `${bad} cases drop`}`);
}
