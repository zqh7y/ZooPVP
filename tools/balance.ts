/*
 * Balance check: npx tsx tools/balance.ts [ladder] [waves] [player] [honest] [quick]
 * (no section named = all of them).
 * - ladder: POWER doubles every rung (bare, and with the natural kit).
 * - waves: the wave curve, stage 1..10 x wave 1..10: recommendedPower, the enemy army (POWER, fighters, rungs, the
 *   boss) and the POWER a stand-in army needs to win half / four in five of its fights.
 * - player: a typical player who spends their cash on cases (and cells) as they go, with AUTO arrange, from a new
 *   save through stage 10: their POWER against the recommended power, retries, cases, and the fight lengths
 *   (aim: a normal wave 15-25 s, a boss wave 25-40 s).
 * - honest: the stronger of two random armies wins more the bigger the POWER gap; a mirror is even.
 */
import { CELL_LOCKS, ENEMY, PET_TYPES, RECOMMENDED, WAVES, armyPower, formatPower, isBossWave, recommendedPower, rungOf, squadPower, tierOf } from '../src/data';
import { makeRng, type Rng } from '../src/rng';
import { runBattle } from '../src/sim/battle';
import { buildArmy, enemyArmy, fightSeed, nextWave, waveFighters } from '../src/logic/waves';
import { Inventory } from '../src/logic/inventory';
import { autoArrange } from '../src/logic/auto';
import { caseBlock, casePrice, openCase } from '../src/logic/rolls';
import { applyWave, cellLock, cellPrice, outcomeOf, unlockCell } from '../src/logic/progress';
import { newSave } from '../src/logic/save';
import type { ArmySpec, SaveState, SquadSpec } from '../src/types';

const args = process.argv.slice(2);
const QUICK = args.includes('quick');
const wanted = (s: string) => !args.some((a) => ['ladder', 'waves', 'player', 'honest'].includes(a)) || args.includes(s);
// "natural": every wave far below the player, to measure how fast a typical player grows on their own
if (args.includes('natural')) RECOMMENDED.stages = RECOMMENDED.stages.map((x) => x * 0.02);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const quant = (a: number[], q: number) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(q * (a.length - 1))] : NaN);
const fighters = (a: ArmySpec) => a.squads.reduce((s, q) => s + q.count, 0);
const rungs = (a: ArmySpec) => {
  const r = a.squads.filter((q) => !q.boss).map((q) => rungOf(q.pet));
  return r.length ? `${Math.min(...r)}-${Math.max(...r)}` : '-';
};

// ------------------------------------------------------------------ ladder
if (wanted('ladder')) {
  console.log('== the ladder: POWER of one fighter, bare and with its natural kit (knife, helmet, chili of its tier) ==');
  let prev = 0;
  for (const pet of PET_TYPES) {
    const t = tierOf(rungOf(pet));
    const bare = squadPower({ key: 0, pet, count: 1, weapon: null, weaponLevel: 0, helmet: 0, sneakers: 0, chili: 0 });
    const kit = squadPower({ key: 0, pet, count: 1, weapon: 'knife', weaponLevel: t, helmet: t, sneakers: 0, chili: t });
    const boss = squadPower({ key: 0, pet, count: 1, weapon: 'knife', weaponLevel: t, helmet: t, sneakers: 0, chili: t, boss: true });
    console.log(`${String(rungOf(pet)).padStart(2)} ${pet.padEnd(8)} bare ${formatPower(bare).padStart(6)}${prev ? ` (x${(bare / prev).toFixed(3)})` : '         '}  natural kit ${formatPower(kit).padStart(6)}  as a boss ${formatPower(boss).padStart(6)}`);
    prev = bare;
  }
}

// ------------------------------------------------------------------ waves
/** win share of `me` against `them` over n seeds, sides alternated */
function winShare(me: ArmySpec, them: ArmySpec, n: number, seed: number): { win: number; times: number[] } {
  let w = 0;
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const flip = i % 2 === 1;
    const s = runBattle(flip ? [them, me] : [me, them], seed + i * 7919);
    times.push(s.time);
    if (s.winner === (flip ? 1 : 0)) w++;
    else if (s.winner === -1) w += 0.5;
  }
  return { win: w / n, times };
}

/** the POWER a stand-in army (shaped like the wave's own) needs to win this share of fights against the wave */
function powerNeeded(stage: number, wave: number, enemy: ArmySpec, share: number, r: Rng): number {
  let lo = 0.3;
  let hi = 3;
  const base = armyPower(enemy.squads);
  const n = Math.max(1, waveFighters(stage, wave) + (isBossWave(wave) ? 1 : 0));
  for (let step = 0; step < (QUICK ? 4 : 6); step++) {
    const mid = Math.sqrt(lo * hi);
    let w = 0;
    const tries = QUICK ? 6 : 10;
    for (let k = 0; k < tries; k++) {
      const me: ArmySpec = { squads: buildArmy(base * mid, n, r, 10) };
      w += winShare(me, enemy, 2, r.int(1, 1e9)).win;
    }
    if (w / tries >= share) hi = mid;
    else lo = mid;
  }
  return base * Math.sqrt(lo * hi);
}

if (wanted('waves')) {
  console.log('\n== the wave curve: recommended POWER, the enemy army, and the POWER a stand-in army needs to win 50% / 80% ==');
  const r = makeRng(31);
  const waves = QUICK ? [1, 10] : [1, 4, 7, 9, 10];
  for (let stage = 1; stage <= 10; stage++) {
    for (const wave of waves) {
      const enemy = enemyArmy(stage, wave, 1234 + stage);
      const rec = recommendedPower(stage, wave);
      const p50 = powerNeeded(stage, wave, enemy, 0.5, r);
      const p80 = powerNeeded(stage, wave, enemy, 0.8, r);
      const boss = enemy.squads.find((q) => q.boss);
      console.log(
        `stage ${String(stage).padStart(2)} wave ${String(wave).padStart(2)}  rec ${formatPower(rec).padStart(6)}  enemy ${formatPower(armyPower(enemy.squads)).padStart(6)} (${String(fighters(enemy)).padStart(2)} fighters, rungs ${rungs(enemy).padEnd(5)}${boss ? `, boss ${boss.pet}` : ''})` +
          `  needs: 50% at ${formatPower(p50).padStart(6)} (${(p50 / rec).toFixed(2)}x rec), 80% at ${formatPower(p80).padStart(6)} (${(p80 / rec).toFixed(2)}x rec)`,
      );
    }
  }
}

// ------------------------------------------------------------------ the typical player
interface WaveLog {
  stage: number;
  wave: number;
  power: number;
  rec: number;
  won: boolean;
  time: number;
  boss: boolean;
  fighters: number;
  cases: number;
  top: number;
}

/** what a typical player does in prep: open every case they can afford, AUTO arrange, buy a cell when it is cheap next to a case */
function prep(s: SaveState, inv: Inventory, rng: Rng): void {
  for (let guard = 0; guard < 60; guard++) {
    // a cell when it costs no more than 3 cases and the grid is the bottleneck
    const cash = Object.keys(CELL_LOCKS).map((k) => k.split(',').map(Number)).find(([c, r]) => cellLock(s, c, r)?.kind === 'cash');
    if (cash && s.cash >= cellPrice(s) && cellPrice(s) <= 3 * casePrice(s, 'case')) {
      unlockCell(s, cash[0], cash[1]);
      autoArrange(inv);
      continue;
    }
    const kind = !caseBlock(s, 'elite') ? 'elite' : !caseBlock(s, 'case') ? 'case' : null;
    if (kind) {
      openCase(s, kind, rng);
      autoArrange(inv);
      continue;
    }
    // a full tray blocks the cases: trash the weakest piece on it (never the last unit)
    if (inv.freeBenchSlot() < 0 && (s.cash >= casePrice(s, 'case') || s.gems >= casePrice(s, 'elite'))) {
      const bench = s.pieces.filter((p) => p.slot >= 0).sort((a, b) => inv.sellValue(a) - inv.sellValue(b) || a.id - b.id);
      if (!bench.length || !inv.trash(bench[0]).ok) break;
      continue;
    }
    break;
  }
}

function playThrough(seed: number, stages: number, maxFights: number): WaveLog[] {
  const s = newSave(seed);
  const inv = new Inventory(s);
  const rng = makeRng(seed * 31 + 7);
  autoArrange(inv);
  const log: WaveLog[] = [];
  while (s.stage <= stages && s.fights < maxFights) {
    prep(s, inv, rng);
    const army = inv.army();
    const w = nextWave(s);
    const sum = runBattle([army, w.army], fightSeed(s));
    const top = Math.max(0, ...army.squads.map((q) => rungOf(q.pet)));
    log.push({ stage: s.stage, wave: s.wave, power: armyPower(army.squads), rec: w.recommended, won: sum.winner === 0, time: sum.time, boss: w.boss, fighters: fighters(army), cases: s.cases, top });
    applyWave(s, outcomeOf(sum));
  }
  return log;
}

if (wanted('player')) {
  const players = QUICK ? 6 : 16;
  const stages = 10;
  console.log(`\n== a typical player (${players} runs): spends cash on cases and cheap cells as they go, AUTO arranges, fights every wave ==`);
  const logs = Array.from({ length: players }, (_, i) => playThrough(1000 + i, stages, 600));
  const t0 = logs.map((l) => l.length);
  console.log(`fights to finish stage ${stages}: median ${quant(t0, 0.5)} (${quant(t0, 0.1)}..${quant(t0, 0.9)}); runs stuck at the 600-fight cap: ${t0.filter((n) => n >= 600).length}`);
  console.log('stage | fights (p50 / p90) | POWER at wave 1 vs rec | at wave 9 vs rec | at the boss vs rec | losses on 1-9 / boss | fighters | top rung | cases');
  for (let stage = 1; stage <= stages; stage++) {
    const rows = logs.map((l) => l.filter((x) => x.stage === stage));
    const firstAt = (wave: number) => rows.map((r) => r.find((x) => x.wave === wave)).filter((x): x is WaveLog => !!x);
    const ratio = (xs: WaveLog[]) => quant(xs.map((x) => x.power / x.rec), 0.5);
    const w1 = firstAt(1);
    const w9 = firstAt(9);
    const w10 = firstAt(10);
    const n = rows.map((r) => r.length);
    const lossN = rows.map((r) => r.filter((x) => !x.won && !x.boss).length);
    const lossB = rows.map((r) => r.filter((x) => !x.won && x.boss).length);
    const all = rows.flat();
    console.log(
      `${String(stage).padStart(5)} | ${String(quant(n, 0.5)).padStart(4)} / ${String(quant(n, 0.9)).padStart(4)}` +
        `        | ${formatPower(quant(w1.map((x) => x.power), 0.5)).padStart(6)} (${ratio(w1).toFixed(2)}x)` +
        `      | ${formatPower(quant(w9.map((x) => x.power), 0.5)).padStart(6)} (${ratio(w9).toFixed(2)}x)` +
        ` | ${formatPower(quant(w10.map((x) => x.power), 0.5)).padStart(6)} (${ratio(w10).toFixed(2)}x)` +
        `       | ${quant(lossN, 0.5)} / ${quant(lossB, 0.5)} (p90 ${quant(lossN, 0.9)} / ${quant(lossB, 0.9)})` +
        `          | ${quant(all.map((x) => x.fighters), 0.5)} | ${quant(all.map((x) => x.top), 0.5)} | ${quant(w10.map((x) => x.cases), 0.5)}`,
    );
  }
  const all = logs.flat();
  const normal = all.filter((x) => !x.boss).map((x) => x.time);
  const boss = all.filter((x) => x.boss).map((x) => x.time);
  const bossWon = all.filter((x) => x.boss && x.won).map((x) => x.time);
  console.log(`fight length, normal waves: p10 ${quant(normal, 0.1).toFixed(1)}s  median ${quant(normal, 0.5).toFixed(1)}s  p90 ${quant(normal, 0.9).toFixed(1)}s (aim 15-25 s)`);
  console.log(`fight length, boss waves:   p10 ${quant(boss, 0.1).toFixed(1)}s  median ${quant(boss, 0.5).toFixed(1)}s  p90 ${quant(boss, 0.9).toFixed(1)}s; won ones median ${quant(bossWon, 0.5).toFixed(1)}s (aim 25-40 s)`);
  const late = all.filter((x) => x.stage >= 3);
  const lateN = late.filter((x) => !x.boss).map((x) => x.time);
  const lateB = late.filter((x) => x.boss).map((x) => x.time);
  console.log(`  from stage 3: normal median ${quant(lateN, 0.5).toFixed(1)}s, boss median ${quant(lateB, 0.5).toFixed(1)}s; clock-decided ${pct(all.filter((x) => x.time >= 74.9).length / all.length)}`);
  const first = logs.map((l) => l.slice(0, 3).every((x) => x.won));
  console.log(`the first three waves won at the first try: ${first.filter(Boolean).length} of ${players} runs`);
}

// ------------------------------------------------------------------ honesty
if (wanted('honest')) {
  console.log('\n== POWER honesty: random armies of the cast, the stronger by this much wins ==');
  const r = makeRng(99);
  const pool: { a: ArmySpec; p: number }[] = [];
  for (let i = 0; i < (QUICK ? 600 : 1500); i++) {
    const target = 20 * 2 ** r.range(0, 12);
    const a: ArmySpec = { squads: buildArmy(target, r.int(2, 16), r, 10) };
    pool.push({ a, p: armyPower(a.squads) });
  }
  for (const [lo, hi] of [[1, 1.05], [1.1, 1.2], [1.25, 1.35]] as const) {
    let wins = 0;
    let games = 0;
    for (let tries = 0; games < (QUICK ? 100 : 300) && tries < 400000; tries++) {
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
    console.log(`POWER ratio ${lo}..${hi}: the stronger side wins ${pct(wins / games)} of ${games}`);
  }
  // a mirror is even: the bottom team's share of decided fights
  let bottom = 0;
  let decided = 0;
  for (let i = 0; i < (QUICK ? 300 : 1500); i++) {
    const a: ArmySpec = { squads: buildArmy(20 * 2 ** r.range(0, 12), r.int(2, 16), r, 10) };
    const s = runBattle([a, a], i * 31 + 1);
    if (s.winner === -1) continue;
    decided++;
    if (s.winner === 0) bottom++;
  }
  console.log(`mirror: the bottom team wins ${pct(bottom / decided)} of ${decided} decided fights (aim 46-54%)`);
  // a boss is worth its POWER: one boss against an army of the same POWER made of its own rung
  let bw = 0;
  const bn = QUICK ? 40 : 120;
  for (let i = 0; i < bn; i++) {
    const rung = r.int(2, 11);
    const t = tierOf(rung);
    const boss: SquadSpec = { key: 0, pet: PET_TYPES[rung - 1], count: 1, weapon: r.pick(['knife', 'bat', 'shield', 'spear'] as const), weaponLevel: t, helmet: t, sneakers: 0, chili: t, boss: true };
    const army: ArmySpec = { squads: buildArmy(squadPower(boss), r.int(3, 6), r, 10) };
    const res = winShare({ squads: [boss] }, army, 1, i + 5);
    bw += res.win;
  }
  console.log(`a boss alone against an army of its POWER wins ${pct(bw / bn)} (aim about 50%)`);
  void ENEMY;
  void WAVES;
}
