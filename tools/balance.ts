/*
 * Balance check: npx tsx tools/balance.ts [quick]
 * 1) duel time per kill, 2) fight length of a player army against the bot matched to it (the real match-up),
 * 3) bot accuracy, 4) weapons against each other, 5) is armyPower honest.
 */
import { armyPower, FIGHT, GEAR_TYPES, squadPower } from '../src/data';
import { makeRng, type Rng } from '../src/rng';
import { createBattle, runBattle } from '../src/sim/battle';
import { botFactor, kindsOf, matchArmy } from '../src/logic/bots';
import type { ArmySpec, PetType, SquadSpec, WeaponType } from '../src/types';

const QUICK = process.argv.includes('quick');
const OPTS: (WeaponType | null)[] = [null, 'knife', 'bat', 'shield', 'spear'];
const name = (w: WeaponType | null) => w ?? 'none';
const pct = (v: number) => `${Math.round(v * 100)}%`;
const quant = (a: number[], q: number) => a.slice().sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

function squad(r: Rng, count: number, lvl: number): SquadSpec {
  const weapon = r.chance(0.85) ? r.pick(OPTS.slice(1)) : null;
  const l = () => Math.max(1, Math.min(7, lvl + r.int(-1, 1)));
  return {
    key: 0, pet: r.pick<PetType>(['ant', 'frog']), level: l(), count, weapon, weaponLevel: weapon ? l() : 0,
    helmet: r.chance(0.5) ? l() : 0, sneakers: r.chance(0.35) ? l() : 0, chili: r.chance(0.5) ? l() : 0,
  };
}

/** a player-like army of n fighters: squads of 4, 2 and 1 */
function army(r: Rng, n: number, lvl: number): ArmySpec {
  const squads: SquadSpec[] = [];
  let left = n;
  while (left > 0) {
    const count = r.pick([4, 2, 1].filter((k) => k <= left));
    squads.push(squad(r, count, lvl));
    left -= count;
  }
  return { squads };
}
const fighters = (a: ArmySpec) => a.squads.reduce((s, q) => s + q.count, 0);

// 1) duel time per kill: one against one of the same, from the first hit to the knock-out
console.log('== duel: 1 v 1 of the same, seconds from first hit to knock-out (mean of 20) ==');
for (const lvl of [1, 4]) {
  for (const pet of ['ant', 'frog'] as PetType[]) {
    let line = `${pet} class ${lvl}`.padEnd(14);
    for (const w of OPTS) {
      const spec: SquadSpec = { key: 0, pet, level: lvl, count: 1, weapon: w, weaponLevel: w ? lvl : 0, helmet: 0, sneakers: 0, chili: 0 };
      const ttk: number[] = [];
      for (let s = 0; s < 20; s++) {
        const b = createBattle([{ squads: [spec] }, { squads: [spec] }], s + 1);
        let first = -1;
        let ko = -1;
        while (!b.over) {
          for (const e of b.step(1 / 60)) {
            if (e.type === 'hit' && first < 0) first = b.time;
            if (e.type === 'death' && ko < 0) ko = b.time;
          }
        }
        if (first >= 0 && ko >= 0) ttk.push(ko - first);
      }
      line += `${name(w)} ${mean(ttk).toFixed(1)}s  `;
    }
    console.log(line);
  }
}

// 2) the real match-up: a player army against the bot matched to it
console.log('\n== player army vs its matched bot (difficulty 1.0 unless noted) ==');
const rows: [string, number, number][] = [['1v1 tutorial', 1, 0.8], ['6v6', 6, 1], ['12v12', 12, 1], ['25v25', 25, 1]];
for (const [label, n, factor] of rows) {
  const r = makeRng(n * 977 + 5);
  const times: number[] = [];
  let wins = 0;
  let byTime = 0;
  let enraged = 0;
  const runs = QUICK ? 40 : n >= 25 ? 80 : 160;
  for (let i = 0; i < runs; i++) {
    const me: ArmySpec =
      n === 1
        ? { squads: [{ key: 0, pet: 'ant', level: 1, count: 1, weapon: 'knife', weaponLevel: 1, helmet: 1, sneakers: 0, chili: 0 }] }
        : army(r, n, r.int(1, 5));
    const p = armyPower(me.squads);
    const bot = matchArmy(fighters(me), p, factor, r, kindsOf(me.squads));
    const flip = i % 2 === 1;
    const s = runBattle(flip ? [{ squads: bot.squads }, me] : [me, { squads: bot.squads }], i + 1);
    times.push(s.time);
    if (s.winner === (flip ? 1 : 0)) wins++;
    if (s.byTime) byTime++;
    if (s.time > FIGHT.enrageAt) enraged++;
  }
  const band = times.filter((t) => t >= 30 && t <= 50).length / runs;
  console.log(
    `${label.padEnd(13)} p10 ${quant(times, 0.1).toFixed(1)}s  median ${quant(times, 0.5).toFixed(1)}s  p90 ${quant(times, 0.9).toFixed(1)}s` +
      ` | 30-50s ${pct(band)}  enraged ${pct(enraged / runs)}  by time ${pct(byTime / runs)}  player wins ${pct(wins / runs)}`,
  );
}

// 3) bot accuracy over many player armies (tiny ones apart: there the bot copies the player's kinds)
for (const [lo, hi] of [[1, 3], [4, 25]] as const) {
  const r = makeRng(4242 + lo);
  const botCountErr: number[] = [];
  const botPowerErr: number[] = [];
  for (let i = 0; i < (QUICK ? 200 : 600); i++) {
    const n = r.int(lo, hi);
    const me = army(r, n, r.int(1, 7));
    const f = botFactor({ matches: r.int(0, 20), trophies: r.int(0, 2000), streak: r.int(-3, 4) });
    const bot = matchArmy(n, armyPower(me.squads), f, r, kindsOf(me.squads));
    botCountErr.push(Math.abs(fighters({ squads: bot.squads }) - n) / n);
    botPowerErr.push(Math.abs(armyPower(bot.squads) - bot.target) / bot.target);
  }
  console.log(
    `\n== bot accuracy, ${lo}..${hi} fighters (${botPowerErr.length} bots) == fighters off by: median ${pct(quant(botCountErr, 0.5))}, p95 ${pct(quant(botCountErr, 0.95))}, max ${pct(Math.max(...botCountErr))}` +
      ` | power off target by: median ${pct(quant(botPowerErr, 0.5))}, p95 ${pct(quant(botPowerErr, 0.95))}, max ${pct(Math.max(...botPowerErr))}`,
  );
}
if (QUICK) process.exit(0);

// 4) weapons, same pet class and count
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

// 5) power honesty
console.log('\n== power honesty ==');
{
  const r = makeRng(99);
  const pool: { a: ArmySpec; p: number }[] = [];
  for (let i = 0; i < 2500; i++) {
    const a = army(r, r.pick([2, 4, 6, 10, 16, 24]), r.int(1, 5));
    pool.push({ a, p: armyPower(a.squads) });
  }
  for (const [lo, hi] of [[1, 1.05], [1.1, 1.2], [1.25, 1.35]] as const) {
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
    const s = squad(r, r.pick([1, 2]), r.int(1, 6));
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
