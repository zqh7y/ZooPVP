/*
 * Balance check: npx tsx tools/balance.ts [ladder] [player] [themes] [honest] [quick]
 * (no section named = all of them).
 * - ladder: POWER doubles every rung (bare, and with the natural kit).
 * - player: a modelled player from a new save through their first 50 matches against the matched bot: they spend
 *   their cash on cases (and cheap cells) as they go and AUTO arrange. Win rate (aim about 60-70%), the longest
 *   losing streak (aim: never more than 3 at the start), champion matches, POWER and level growth, and the fight
 *   lengths (aim: a normal match 15-25 s, a champion match 25-35 s).
 * - themes: each theme against stand-in armies at an even difficulty (1.0): how often the player wins (aim
 *   40-60%: a theme must not be stronger or weaker than its POWER says).
 * - honest: the stronger of two random armies wins more the bigger the POWER gap; a mirror is even; a boss is
 *   worth its POWER.
 */
import { CELL_LOCKS, MATCH, PET_TYPES, armyPower, formatPower, rungOf, squadPower, tierOf } from '../src/data';
import { makeRng, type Rng } from '../src/rng';
import { runBattle } from '../src/sim/battle';
import { buildArmy, difficulty, fightSeed, findOpponent } from '../src/logic/match';
import { Inventory } from '../src/logic/inventory';
import { autoArrange } from '../src/logic/auto';
import { caseBlock, casePrice, openCase } from '../src/logic/rolls';
import { applyMatch, cellLock, cellPrice, outcomeOf, unlockCell } from '../src/logic/progress';
import { newSave } from '../src/logic/save';
import type { ArmySpec, SaveState, SquadSpec, ThemeId } from '../src/types';

const args = process.argv.slice(2);
const QUICK = args.includes('quick');
const SECTIONS = ['ladder', 'player', 'themes', 'honest'];
const wanted = (s: string) => !args.some((a) => SECTIONS.includes(a)) || args.includes(s);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const quant = (a: number[], q: number) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(q * (a.length - 1))] : NaN);
const fighters = (a: ArmySpec) => a.squads.reduce((s, q) => s + q.count, 0);

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

// ------------------------------------------------------------------ the modelled player
interface MatchLog {
  n: number;
  power: number;
  opp: number;
  won: boolean;
  time: number;
  champion: boolean;
  theme: ThemeId;
  fighters: number;
  level: number;
  top: number;
  cash: number;
}

/** what a typical player does in prep: open every case they can afford, AUTO arrange, buy a cell when it is cheap next to a case */
function prep(s: SaveState, inv: Inventory, rng: Rng): void {
  for (let guard = 0; guard < 60; guard++) {
    // a cell when it costs no more than 3 cases
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

function playThrough(seed: number, matches: number): MatchLog[] {
  const s = newSave(seed);
  const inv = new Inventory(s);
  const rng = makeRng(seed * 31 + 7);
  autoArrange(inv);
  const log: MatchLog[] = [];
  while (s.matches < matches) {
    prep(s, inv, rng);
    const army = inv.army();
    const o = findOpponent(s, undefined, army);
    const sum = runBattle([army, o.army], fightSeed(s));
    const top = Math.max(0, ...army.squads.map((q) => rungOf(q.pet)));
    const res = applyMatch(s, outcomeOf(sum, army));
    log.push({ n: s.matches, power: armyPower(army.squads), opp: o.power, won: res.won, time: sum.time, champion: o.champion, theme: o.theme.id, fighters: fighters(army), level: s.level, top, cash: res.cash });
  }
  return log;
}

const longestLoss = (l: MatchLog[]) => {
  let best = 0;
  let run = 0;
  for (const x of l) {
    run = x.won ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
};

if (wanted('player')) {
  const players = QUICK ? 8 : 24;
  const N = 50;
  console.log(`\n== a modelled player (${players} runs, ${N} matches each): spends cash on cases and cheap cells, AUTO arranges, fights the matched bot ==`);
  const logs = Array.from({ length: players }, (_, i) => playThrough(1000 + i, N));
  const all = logs.flat();
  const wr = (xs: MatchLog[]) => (xs.length ? xs.filter((x) => x.won).length / xs.length : NaN);
  console.log(`win rate over ${N} matches: ${pct(wr(all))} (aim 60-70%); per run p10 ${pct(quant(logs.map(wr), 0.1))} .. p90 ${pct(quant(logs.map(wr), 0.9))}`);
  console.log(`the first 3 matches won: ${pct(wr(logs.flatMap((l) => l.slice(0, 3))))}; champion matches won: ${pct(wr(all.filter((x) => x.champion)))}; normal: ${pct(wr(all.filter((x) => !x.champion)))}`);
  const ls = logs.map(longestLoss);
  const ls20 = logs.map((l) => longestLoss(l.slice(0, 20)));
  console.log(`longest losing streak: in the first 20 matches max ${Math.max(...ls20)} (median ${quant(ls20, 0.5)}); in all ${N}: max ${Math.max(...ls)} (median ${quant(ls, 0.5)}) (aim: never more than 3 at the start)`);
  console.log('matches | win rate | POWER (p50) | bot / you | fighters | top rung | level | cash / match');
  for (let a = 0; a < N; a += 10) {
    const xs = logs.flatMap((l) => l.slice(a, a + 10));
    console.log(
      `${String(a + 1).padStart(3)}-${String(a + 10).padEnd(3)} | ${pct(wr(xs)).padStart(8)} | ${formatPower(quant(xs.map((x) => x.power), 0.5)).padStart(11)} | ${quant(xs.map((x) => x.opp / x.power), 0.5).toFixed(2).padStart(9)} |` +
        ` ${String(quant(xs.map((x) => x.fighters), 0.5)).padStart(8)} | ${String(quant(xs.map((x) => x.top), 0.5)).padStart(8)} | ${String(quant(xs.map((x) => x.level), 0.5)).padStart(5)} | ${quant(xs.map((x) => x.cash), 0.5)}`,
    );
  }
  const themes = new Map<ThemeId, MatchLog[]>();
  for (const x of all) themes.set(x.theme, [...(themes.get(x.theme) ?? []), x]);
  console.log('by theme: ' + [...themes].map(([t, xs]) => `${t} ${xs.length} (won ${pct(wr(xs))})`).join(', '));
  const normal = all.filter((x) => !x.champion).map((x) => x.time);
  const champ = all.filter((x) => x.champion).map((x) => x.time);
  console.log(`fight length, normal:   p10 ${quant(normal, 0.1).toFixed(1)}s  median ${quant(normal, 0.5).toFixed(1)}s  p90 ${quant(normal, 0.9).toFixed(1)}s (aim 15-25 s)`);
  console.log(`fight length, champion: p10 ${quant(champ, 0.1).toFixed(1)}s  median ${quant(champ, 0.5).toFixed(1)}s  p90 ${quant(champ, 0.9).toFixed(1)}s (aim 25-35 s)`);
  console.log(`clock-decided: ${pct(all.filter((x) => x.time >= 74.9).length / all.length)}; level after ${N}: median ${quant(logs.map((l) => l[l.length - 1].level), 0.5)}`);
}

// ------------------------------------------------------------------ themes at an even difficulty
if (wanted('themes')) {
  console.log('\n== themes at difficulty 1.0 (a champion at CHAMPION.power x): the player\'s win share against each theme (aim 40-60%) ==');
  const r = makeRng(71);
  const tally = new Map<ThemeId, { w: number; n: number; t: number[] }>();
  const runs = QUICK ? 300 : 900;
  for (let i = 0; i < runs; i++) {
    const mine: ArmySpec = { squads: buildArmy(30 * 2 ** r.range(0, 11), r.int(2, 14), r, 8).map((q, k) => ({ ...q, key: k + 1 })) };
    // a mid-game save with a win streak that cancels the base (difficulty 1.0 for normal matches)
    // (every 5th of these runs is a champion match, at CHAMPION.power x that)
    const s: SaveState = { ...newSave(), matches: 20 + (i % 5), seed: 5000 + i, streak: 1 + Math.round((1 - MATCH.base) / MATCH.hot), slump: 0 };
    if (Math.abs(difficulty(s) - 1) > 1e-9) throw new Error(`difficulty ${difficulty(s)}`);
    const o = findOpponent(s, i, mine);
    const res = winShare(mine, o.army, 2, i * 3 + 1);
    const e = tally.get(o.theme.id) ?? { w: 0, n: 0, t: [] };
    e.w += res.win * 2;
    e.n += 2;
    e.t.push(...res.times);
    tally.set(o.theme.id, e);
  }
  for (const [t, e] of tally) console.log(`${t.padEnd(8)} ${String(e.n).padStart(4)} fights: the player wins ${pct(e.w / e.n)}, median ${quant(e.t, 0.5).toFixed(1)}s`);
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
}
