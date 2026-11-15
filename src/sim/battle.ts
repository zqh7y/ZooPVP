import { ARENA, FIGHT, PETS, TRAIT, unitStats, type LineRow, type UnitStats } from '../data';
import { hashSeed, makeRng, type Rng } from '../rng';
import type { ArmySpec, PetType, Team, WeaponType } from '../types';
import type { Battle, Blow, DeathCause, HitEvent, SimEvent, SimSummary, SimUnit } from './types';

/*
 * The fight simulator. Pure and deterministic: fixed 1/60 s steps, randomness only from makeRng(seed) and
 * hashSeed. Fair: every unit decides from the same snapshot, hits land together at the end of a step, pushes
 * are summed before they are applied, and every trait that could depend on the order units are looked at is
 * collected first and applied in one fixed order (see applyHits), so the order never favours a team.
 *
 * The twelve pets' traits (docs/pets.md, section 3; numbers in TRAIT):
 * - ant: +10% per other friendly ant within 100 px when it strikes (up to +30%)
 * - bee: a landed sting poisons for 80% of its damage over 3 s; it flies over its own side (no collisions there)
 * - mouse: 30% of hits aimed at it miss (a seeded hash per attacker, victim, step and hit number)
 * - snail: once per life below half health it hides for 2.5 s: 85% less damage, no push or stun, regrows 15%
 * - frog: +30 knock on every hit, and its hits interrupt the wind-up of lighter foes
 * - crab: every attack lands as two pinches of 55%
 * - grasshopper: at the whistle it leaps onto the enemy back line; the landing hits and stuns round it
 * - hedgehog: whoever hits it takes 30% of that damage back
 * - chameleon: reach 52; its hits pull light foes in instead of pushing them
 * - penguin: belly-slides at 3x speed toward a far target and slams the first foe it touches
 * - beetle: after walking 90 px its next strike is a charge: 2.5x damage, a big shove and a stun
 * - turtle: armour cuts 35% of everything; its attack is a stomp all round it, shared among up to 4 foes
 */

const DT = 1 / 60;
/** how fast a shove dies away, per second */
const KNOCK_DECAY = 5;
/** a hop (frogs, grasshoppers after their leap): seconds in the air, then seconds resting */
const HOP_AIR = 0.36;
const HOP_REST = 0.2;
/** bat swing arc, half angle */
const ARC = 1.05;
/** shield-bearers look this much closer to nearby foes */
const TAUNT = 0.6;
const TAUNT_RANGE = 150;
/** a heavy hit (bat, slam, charge) or a frog slap interrupts the wind-up of a foe lighter than this x its mass */
const HEAVY_MASS = 0.8;
/** seconds a broken-off wind-up costs */
const INTERRUPT = 0.2;

interface Pool {
  /** hp per second */
  rate: number;
  /** seconds left */
  left: number;
  /** the bee that stung */
  by: number;
}

interface Brain {
  st: UnitStats;
  rng: Rng;
  /** seconds until it may attack again */
  cd: number;
  /** the shove velocity */
  kx: number;
  ky: number;
  /** in a hop (frogs, grasshoppers) */
  air: boolean;
  hopT: number;
  rest: number;
  retarget: number;
  checkT: number;
  lastDist: number;
  stall: number;
  /** -1 or 1: which way it sidesteps when stuck */
  side: number;
  /** collision push summed this step */
  px: number;
  py: number;
  /** what took its last health (read when it dies) */
  lastBy: number;
  lastWeapon: WeaponType | null;
  lastKnock: number;
  lastDir: number;
  lastCause: DeathCause;
  lastBlow: Blow;
  /** seconds after the start before its band sets off (it still fights back when a foe comes close) */
  wait: number;
  /** seconds of the short pause after a knock-out it scored */
  cheer: number;
  /** the strongest stun and whether a wind-up was interrupted this step (applied after all of the step's hits) */
  stunIn: number;
  intIn: boolean;
  // ---- traits
  /** bee poison it carries */
  poison: Pool[];
  /** poison damage since its last poison event, and when that event was */
  poisonAcc: number;
  poisonT: number;
  /** snail: its one hide is used */
  shellUsed: boolean;
  /** beetle: px walked since its last strike, and whether its horn is down */
  run: number;
  charged: boolean;
  /** penguin: seconds until its slide is ready */
  slideCd: number;
  /** grasshopper: the opening leap's end points */
  lx0: number;
  ly0: number;
  lx1: number;
  ly1: number;
}

interface Hit {
  from: number;
  to: number;
  dmg: number;
  dir: number;
  /** a bat-sized hit for the view (a bat swing, a slam, a charge) */
  heavy: boolean;
  /** it breaks off a lighter foe's wind-up (heavy hits and frog slaps) */
  interrupt: boolean;
  stun: number;
  knock: number;
  /** the knock pulls it toward the attacker, not divided by its mass (chameleon) */
  pull: boolean;
  weapon: WeaponType | null;
  pack: number;
  pinch: 0 | 1 | 2;
  blow: Blow;
  slap: boolean;
}

interface Spike {
  /** the hedgehog */
  from: number;
  /** its attacker */
  to: number;
  dmg: number;
}

interface Shove {
  to: number;
  dir: number;
  knock: number;
}

/** within a kind: shield-bearers first, spears last */
const rankOf = (w: WeaponType | null) => (w === 'shield' ? 0 : w === 'bat' ? 2 : w === 'spear' ? 3 : 1);
/** The kick-off order, front to back: kinds stand in contiguous rows in this order, each in its band. */
export const LINE_ORDER: readonly PetType[] = [
  'turtle', 'beetle', 'penguin', 'hedgehog', 'frog', 'snail', // front band, front to back
  'crab', 'mouse', 'ant', // middle band
  'chameleon', 'grasshopper', 'bee', // back band
];
const LINE_RANK: Record<string, number> = Object.fromEntries(LINE_ORDER.map((p, i) => [p, i]));
const BANDS: readonly LineRow[] = ['front', 'middle', 'back'];
/** these set off at the whistle whatever their band */
const NO_WAIT: ReadonlySet<PetType> = new Set<PetType>(['grasshopper', 'penguin']);
/** px kept free along the side lines */
const SIDE = 10;

/**
 * Lines a team up in clean rows by kind, in LINE_ORDER: the front band (turtles, beetles, penguins, hedgehogs,
 * frogs, snails), then the middle (crabs, mice, ants), then the back (chameleons, grasshoppers, bees). Each kind
 * stands in rows of its own (shield squads first, spears last, then by squad); only when that would be deeper
 * than the half-pitch do the kinds of one band share rows. Rows are filled evenly and spaced evenly across the
 * width; nobody overlaps. The top team is the mirror image of the bottom one. The first band that has fighters
 * sets off at the whistle, the next FIGHT.wave seconds later, the next after that (or as soon as a foe comes
 * close); grasshoppers and penguins go at the whistle whatever their band.
 */
function lineUp(list: SimUnit[], team: Team, brains: Brain[]) {
  const usable = ARENA.w - SIDE * 2;
  const gap = FIGHT.lineGap;
  const order = (a: SimUnit, b: SimUnit) => LINE_RANK[a.pet] - LINE_RANK[b.pet] || rankOf(a.weapon) - rankOf(b.weapon) || a.squad - b.squad || a.id - b.id;
  const build = (shared: boolean) => {
    const rows: SimUnit[][] = [];
    /** the band each row sets off with: 0 for the first band that has fighters, then 1, 2 */
    const bandOf: number[] = [];
    let band = -1;
    for (const row of BANDS) {
      const inBand = list.filter((u) => PETS[u.pet].row === row).sort(order);
      if (inBand.length === 0) continue;
      band++;
      const blocks: SimUnit[][] = [];
      if (shared) blocks.push(inBand);
      else for (const u of inBand) {
        const last = blocks[blocks.length - 1];
        if (last && last[0].pet === u.pet) last.push(u);
        else blocks.push([u]);
      }
      for (const block of blocks) {
        const rMax = block.reduce((m, u) => Math.max(m, u.r), 0);
        const cap = Math.max(1, Math.floor((usable + gap) / (rMax * 2 + gap)));
        const per = Math.ceil(block.length / Math.ceil(block.length / cap));
        for (let i = 0; i < block.length; i += per) {
          rows.push(block.slice(i, i + per));
          bandOf.push(band);
        }
      }
    }
    const depth = rows.map((r) => r.reduce((m, u) => Math.max(m, u.r * 2), 0));
    const total = depth.reduce((a, b) => a + b, 0) + gap * Math.max(0, rows.length - 1);
    return { rows, bandOf, depth, total };
  };
  const room = ARENA.h / 2 - 24 - FIGHT.lineBack;
  let plan = build(false);
  if (plan.total > room) plan = build(true);
  const { rows, bandOf, depth, total } = plan;
  const front = Math.min(FIGHT.lineBack + room, Math.max(FIGHT.lineFront, FIGHT.lineBack + total));
  const squeeze = Math.min(1, room / Math.max(1, total)); // only ever below 1 for armies far beyond a 5 x 5 grid
  let dist = front;
  rows.forEach((r, i) => {
    const rMax = r.reduce((m, u) => Math.max(m, u.r), 0);
    dist -= (depth[i] / 2) * squeeze;
    const step = Math.min(usable / r.length, (rMax * 2 + gap) * 2.2);
    r.forEach((u, k) => {
      const b = brains[u.id];
      b.wait = NO_WAIT.has(u.pet) ? 0 : bandOf[i] * FIGHT.wave;
      const x = ARENA.w / 2 + (k - (r.length - 1) / 2) * step;
      u.x = clamp(x + b.rng.range(-1, 1), u.r, ARENA.w - u.r);
      const yy = clamp(dist + b.rng.range(-1, 1), u.r, ARENA.h / 2 - u.r);
      u.y = team === 0 ? ARENA.h - yy : yy;
    });
    dist -= (depth[i] / 2 + gap) * squeeze;
  });
}

const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Test hooks; the game never passes them. */
export interface BattleOptions {
  /** think in a seeded shuffled order every step instead of forward / backward (checks the order never matters) */
  shuffle?: number;
}

export function createBattle(armies: [ArmySpec, ArmySpec], seed: number, opts: BattleOptions = {}): Battle {
  const units: SimUnit[] = [];
  const brains: Brain[] = [];
  const size: [number, number] = [0, 0];
  const maxHpSum: [number, number] = [0, 0];
  for (const team of [0, 1] as Team[]) {
    armies[team].squads.forEach((spec, si) => {
      const st = unitStats(spec);
      for (let k = 0; k < spec.count; k++) {
        const id = units.length;
        units.push({
          id, team, squad: si, spec, pet: spec.pet, weapon: spec.weapon,
          x: 0, y: 0, vx: 0, vy: 0, r: st.radius, face: 1,
          aim: team === 0 ? -Math.PI / 2 : Math.PI / 2,
          hp: st.hp, maxHp: st.hp, alive: true,
          phase: 'wait', phaseT: 0, phaseDur: 0, target: -1, rung: st.rung, hop: 0, poison: 0, charged: false,
          walked: 0, sinceHit: 99, hitDir: 0,
        });
        const rng = makeRng(hashSeed(seed, team, si, k));
        brains.push({
          st, rng, cd: rng.range(0, st.cd * 0.5), kx: 0, ky: 0, air: false, hopT: 0, rest: rng.range(0, HOP_REST),
          retarget: 0, checkT: 0, lastDist: 1e9, stall: 0, side: rng.chance(0.5) ? 1 : -1, px: 0, py: 0,
          lastBy: -1, lastWeapon: null, lastKnock: 0, lastDir: 0, lastCause: 'hit', lastBlow: null, wait: 0, cheer: 0,
          stunIn: 0, intIn: false,
          poison: [], poisonAcc: 0, poisonT: -1e9, shellUsed: false, run: 0, charged: false, slideCd: 0,
          lx0: 0, ly0: 0, lx1: 0, ly1: 0,
        });
        size[team]++;
        maxHpSum[team] += st.hp;
      }
    });
  }
  for (const team of [0, 1] as Team[]) lineUp(units.filter((u) => u.team === team), team, brains);
  const maxR = units.reduce((m, u) => Math.max(m, u.r), 0);
  const snails = units.filter((u) => u.pet === 'snail');

  // the neighbour grid: a cell is at least as wide as the two biggest bodies, so touching pairs are in next cells
  const CELL = Math.max(32, maxR * 2 + 1);
  const GCOLS = Math.ceil(ARENA.w / CELL);
  const GROWS = Math.ceil(ARENA.h / CELL);
  const head = new Int32Array(GCOLS * GROWS);
  const next = new Int32Array(Math.max(1, units.length));
  const cellOf = (x: number, y: number) =>
    clamp(Math.floor(y / CELL), 0, GROWS - 1) * GCOLS + clamp(Math.floor(x / CELL), 0, GCOLS - 1);
  const buildGrid = () => {
    head.fill(-1);
    for (const u of units) {
      if (!u.alive) continue;
      const c = cellOf(u.x, u.y);
      next[u.id] = head[c];
      head[c] = u.id;
    }
  };
  /** calls fn for every living unit within rad of (x, y)'s cells */
  const near = (x: number, y: number, rad: number, fn: (o: SimUnit) => void) => {
    const c0 = clamp(Math.floor((x - rad) / CELL), 0, GCOLS - 1);
    const c1 = clamp(Math.floor((x + rad) / CELL), 0, GCOLS - 1);
    const r0 = clamp(Math.floor((y - rad) / CELL), 0, GROWS - 1);
    const r1 = clamp(Math.floor((y + rad) / CELL), 0, GROWS - 1);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) for (let i = head[r * GCOLS + c]; i >= 0; i = next[i]) fn(units[i]);
  };

  let tickN = 0;
  let time = -FIGHT.countdown;
  let started = false;
  let enraged = false;
  let over = false;
  let summary: SimSummary | null = null;
  let acc = 0;
  const kills: [number, number] = [0, 0];
  const alive: [number, number] = [size[0], size[1]];
  const hpShare: [number, number] = [1, 1];
  const living: [SimUnit[], SimUnit[]] = [[], []];
  let hits: Hit[] = [];
  let shoves: Shove[] = [];
  let events: SimEvent[] = [];
  /** how many units go for each unit, counted once at the start of every step (so the order never matters) */
  const crowd = new Int32Array(Math.max(1, units.length));
  const countCrowd = () => {
    crowd.fill(0);
    for (const u of units) if (u.alive && u.target >= 0 && units[u.target].alive) crowd[u.target]++;
  };
  const forward = units.map((u) => u.id);
  const backward = forward.slice().reverse();
  const shuffleRng = opts.shuffle !== undefined ? makeRng(opts.shuffle) : null;
  const thinkOrder = (): readonly number[] => {
    if (!shuffleRng) return tickN % 2 ? forward : backward;
    const o = forward.slice();
    for (let k = o.length - 1; k > 0; k--) {
      const j = shuffleRng.int(0, k);
      [o[k], o[j]] = [o[j], o[k]];
    }
    return o;
  };

  const airborne = (u: SimUnit) => u.phase === 'air';
  const mulNow = () => (enraged ? 1 + FIGHT.enrageRamp * (time - FIGHT.enrageAt) : 1);

  const chooseTarget = (u: SimUnit) => {
    const foes = living[1 - u.team];
    const k = Math.max(1, 3 - Math.max(0, time) / 3);
    let best = -1;
    let bs = Infinity;
    for (const f of foes) {
      if (airborne(f)) continue;
      const dx = f.x - u.x;
      const dy = f.y - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      let s = Math.sqrt(dx * dx * k * k + dy * dy);
      if (f.weapon === 'shield' && d < TAUNT_RANGE) s *= TAUNT;
      if (f.id === u.target) s *= 0.85;
      const others = crowd[f.id] - (f.id === u.target ? 1 : 0);
      if (others > 0) s *= 1 + FIGHT.crowd * others;
      if (s < bs || (s === bs && f.id < best)) {
        bs = s;
        best = f.id;
      }
    }
    u.target = best;
  };

  /** Queues one hit of u on v, with u's own traits (frog slap, chameleon pull) added. */
  const pushHit = (u: SimUnit, b: Brain, v: SimUnit, dmg: number, dir: number, o: Partial<Hit> = {}) => {
    let knock = o.knock ?? b.st.knock;
    let pull = false;
    const slap = u.pet === 'frog';
    if (slap) knock += TRAIT.frog.knock;
    if (u.pet === 'chameleon' && brains[v.id].st.mass < b.st.mass * TRAIT.chameleon.pullMass) {
      knock = TRAIT.chameleon.pull;
      pull = true;
    }
    const heavy = o.heavy ?? u.weapon === 'bat';
    hits.push({
      from: u.id, to: v.id, dmg, dir, heavy, interrupt: heavy || slap, stun: o.stun ?? b.st.stun, knock, pull,
      weapon: o.weapon !== undefined ? o.weapon : u.weapon, pack: o.pack ?? 0, pinch: o.pinch ?? 0, blow: o.blow ?? null, slap,
    });
  };

  const strike = (u: SimUnit, b: Brain) => {
    const st = b.st;
    const tg = u.target >= 0 ? units[u.target] : null;
    const tgOk = !!tg && tg.alive && !airborne(tg);
    if (tgOk) u.aim = Math.atan2(tg!.y - u.y, tg!.x - u.x);
    const victims: SimUnit[] = [];
    const ax = Math.cos(u.aim);
    const ay = Math.sin(u.aim);
    const slack = (f: SimUnit) => hyp(f.x - u.x, f.y - u.y) <= (u.r + f.r + st.reach) * 1.2 + 4;
    const stomp = u.pet === 'turtle';
    if (stomp || u.weapon === 'bat') {
      // a bat swings an arc in front; a turtle's stomp lands all round it
      const found: [number, SimUnit][] = [];
      near(u.x, u.y, u.r + st.reach + maxR, (f) => {
        if (f.team === u.team || airborne(f)) return;
        const d = hyp(f.x - u.x, f.y - u.y);
        if (d > u.r + f.r + st.reach) return;
        if (!stomp && d > 1e-6 && angDiff(Math.atan2(f.y - u.y, f.x - u.x), u.aim) > ARC) return;
        found.push([d, f]);
      });
      found.sort((a, c) => a[0] - c[0] || a[1].id - c[1].id);
      const most = stomp ? Math.max(TRAIT.turtle.stompMax, st.splash) : st.splash;
      for (const [, f] of found.slice(0, most)) victims.push(f);
      if (stomp && tgOk && !victims.includes(tg!) && slack(tg!)) victims.push(tg!);
    } else if (u.weapon === 'spear') {
      const found: [number, SimUnit][] = [];
      near(u.x, u.y, u.r + st.reach + maxR, (f) => {
        if (f.team === u.team || airborne(f)) return;
        const rx = f.x - u.x;
        const ry = f.y - u.y;
        const along = rx * ax + ry * ay;
        const perp = Math.abs(-rx * ay + ry * ax);
        if (along < -f.r || along > u.r + st.reach + f.r || perp > f.r + 3) return;
        found.push([along, f]);
      });
      found.sort((a, c) => a[0] - c[0] || a[1].id - c[1].id);
      for (const [, f] of found.slice(0, st.pierce)) victims.push(f);
    } else if (tgOk && slack(tg!)) {
      victims.push(tg!);
    }
    events.push({ type: 'swing', unit: u.id, weapon: u.weapon, hit: victims.length > 0 });
    let mul = mulNow();
    // ant teamwork: the other living ants of its team close by, from the step's start positions
    let pack = 0;
    if (u.pet === 'ant') {
      const R = TRAIT.ant.range;
      near(u.x, u.y, R + maxR, (f) => {
        if (f !== u && f.team === u.team && f.pet === 'ant' && hyp(f.x - u.x, f.y - u.y) <= R) pack++;
      });
      pack = Math.min(TRAIT.ant.max, pack);
      mul *= 1 + TRAIT.ant.per * pack;
    }
    let o: Partial<Hit> = { pack };
    if (u.pet === 'beetle') {
      if (b.charged) {
        mul *= TRAIT.beetle.mul;
        o = { ...o, knock: st.knock + TRAIT.beetle.knock, stun: Math.max(st.stun, TRAIT.beetle.stun), heavy: true, blow: 'charge' };
        b.charged = false;
        u.charged = false;
      }
      b.run = 0;
    }
    if (stomp) o.blow = 'stomp';
    // a stomp on more foes than its weapon alone would reach shares that weapon's damage among them
    const share = stomp && victims.length > st.splash ? st.splash / victims.length : 1;
    for (const v of victims) {
      const dir = u.weapon === 'spear' && !stomp ? u.aim : Math.atan2(v.y - u.y, v.x - u.x);
      const dmg = st.dmg * b.rng.range(0.9, 1.1) * mul * share;
      if (u.pet === 'crab') {
        pushHit(u, b, v, dmg * TRAIT.crab.share, dir, { ...o, pinch: 1 });
        pushHit(u, b, v, dmg * TRAIT.crab.share, dir, { ...o, pinch: 2 });
      } else pushHit(u, b, v, dmg, dir, o);
    }
    if (stomp) events.push({ type: 'stomp', unit: u.id, x: u.x, y: u.y, n: victims.length });
  };

  const setPhase = (u: SimUnit, p: SimUnit['phase'], dur: number) => {
    u.phase = p;
    u.phaseT = 0;
    u.phaseDur = dur;
  };
  const endSlide = (u: SimUnit, b: Brain, then: SimUnit['phase'], dur: number) => {
    b.slideCd = TRAIT.penguin.recharge;
    setPhase(u, then, dur);
    events.push({ type: 'slide', unit: u.id, on: false });
  };

  /**
   * The grasshoppers' opening leaps, at the whistle and before anyone thinks: each team's grasshoppers pick a
   * landing target in id order (the deepest foe on its own side, spread so teammates pick different ones, a
   * little toward its own side of the pitch), with the same procedure for both teams.
   */
  const kickOffLeaps = () => {
    const T = TRAIT.grasshopper;
    for (const team of [0, 1] as Team[]) {
      const aimed = new Map<number, number>();
      for (const u of units) {
        if (u.team !== team || !u.alive || u.pet !== 'grasshopper') continue;
        let best: SimUnit | null = null;
        let bs = -Infinity;
        for (const f of living[1 - team]) {
          const depth = f.team === 1 ? ARENA.h / 2 - f.y : f.y - ARENA.h / 2;
          const s = depth - T.spread * (aimed.get(f.id) ?? 0) - T.side * Math.abs(f.x - u.x);
          if (s > bs || (s === bs && best && f.id < best.id)) {
            bs = s;
            best = f;
          }
        }
        if (!best) continue;
        aimed.set(best.id, (aimed.get(best.id) ?? 0) + 1);
        const b = brains[u.id];
        const dx = best.x - u.x;
        const dy = best.y - u.y;
        const d = hyp(dx, dy) || 1;
        const stop = Math.max(0, d - (u.r + best.r + T.gap));
        b.lx0 = u.x;
        b.ly0 = u.y;
        b.lx1 = u.x + (dx / d) * stop;
        b.ly1 = u.y + (dy / d) * stop;
        b.wait = 0;
        u.target = best.id;
        setPhase(u, 'air', T.flight);
        events.push({ type: 'leap', unit: u.id, target: best.id, x0: b.lx0, y0: b.ly0, x1: b.lx1, y1: b.ly1, dur: T.flight });
      }
    }
  };

  const think = (u: SimUnit) => {
    const b = brains[u.id];
    const st = b.st;
    u.sinceHit += DT;
    u.phaseT += DT;
    if (!started) return;
    b.cd -= DT;
    b.slideCd -= DT;

    // grasshopper: the opening leap, a straight line at a constant speed (the end point was fixed at take-off)
    if (u.phase === 'air') {
      if (u.phaseT <= u.phaseDur + 1e-9) {
        u.vx = (b.lx1 - b.lx0) / u.phaseDur;
        u.vy = (b.ly1 - b.ly0) / u.phaseDur;
        u.hop = Math.sin(Math.PI * Math.min(1, u.phaseT / u.phaseDur));
        return;
      }
      // landing: one hit on every foe close round it, with a stun
      const T = TRAIT.grasshopper;
      u.vx = u.vy = 0;
      u.hop = 0;
      b.air = false;
      b.rest = HOP_REST;
      setPhase(u, 'move', 0);
      b.cd = st.cd * T.cdLeft;
      events.push({ type: 'land', unit: u.id, x: u.x, y: u.y, big: true });
      const dmg = st.dmg * mulNow();
      near(u.x, u.y, u.r + T.splash + maxR, (f) => {
        if (f.team === u.team || airborne(f)) return;
        if (hyp(f.x - u.x, f.y - u.y) > u.r + f.r + T.splash) return;
        pushHit(u, b, f, dmg, Math.atan2(f.y - u.y, f.x - u.x), { knock: T.knock, stun: T.stun, heavy: false, blow: 'landing' });
      });
      return;
    }
    // snail: hiding in its shell, regrowing
    if (u.phase === 'shell') {
      const T = TRAIT.snail;
      u.vx = u.vy = 0;
      u.hp = Math.min(u.maxHp, u.hp + (u.maxHp * T.regrow * DT) / T.time);
      if (u.phaseT >= u.phaseDur - 1e-9) {
        setPhase(u, 'move', 0);
        events.push({ type: 'shell', unit: u.id, on: false });
      }
      return;
    }

    if (b.wait > 0) {
      if (time < b.wait && u.sinceHit > 1) {
        // its band has not set off yet: it holds its place unless a foe comes close
        let close = false;
        const look = u.r + st.reach + 40;
        near(u.x, u.y, look + maxR, (f) => {
          if (f.team !== u.team && !airborne(f) && hyp(f.x - u.x, f.y - u.y) < look + f.r) close = true;
        });
        if (!close) {
          if (u.phase === 'move') setPhase(u, 'wait', 0);
          u.vx = u.vy = 0;
          return;
        }
      }
      b.wait = 0;
      if (u.phase === 'wait') setPhase(u, 'move', 0);
    }

    // beetle: the horn goes down once it has walked far enough since its last strike
    if (u.pet === 'beetle' && !b.charged && b.run >= TRAIT.beetle.run) {
      b.charged = true;
      u.charged = true;
      events.push({ type: 'charge', unit: u.id });
    }

    // penguin: the belly slide
    if (u.phase === 'slide') {
      const T = TRAIT.penguin;
      const tg = u.target >= 0 ? units[u.target] : null;
      if (!tg || !tg.alive || airborne(tg)) {
        endSlide(u, b, 'move', 0);
      } else {
        // the first foe its body touches (the nearest, then the lowest id) takes the slam
        let bumped: SimUnit | null = null;
        let bd = Infinity;
        near(u.x, u.y, u.r + maxR + T.touch, (f) => {
          if (f.team === u.team || airborne(f)) return;
          const d = hyp(f.x - u.x, f.y - u.y);
          if (d > u.r + f.r + T.touch) return;
          if (d < bd || (d === bd && bumped && f.id < bumped.id)) {
            bd = d;
            bumped = f;
          }
        });
        if (bumped) {
          const v = bumped as SimUnit;
          pushHit(u, b, v, st.dmg * T.slam * mulNow(), Math.atan2(v.y - u.y, v.x - u.x), { knock: T.knock, heavy: true, stun: 0, blow: 'slam' });
          let n = 0;
          near(u.x, u.y, u.r + T.splash + maxR, (f) => {
            if (f === v || f.team === u.team || airborne(f)) return;
            if (hyp(f.x - u.x, f.y - u.y) > u.r + f.r + T.splash) return;
            shoves.push({ to: f.id, dir: Math.atan2(f.y - u.y, f.x - u.x), knock: T.knock });
            n++;
          });
          events.push({ type: 'slam', unit: u.id, to: v.id, x: v.x, y: v.y, n });
          u.vx = u.vy = 0;
          b.cd = st.cd;
          endSlide(u, b, 'recover', T.standUp);
        } else if (u.phaseT >= u.phaseDur - 1e-9) {
          endSlide(u, b, 'move', 0);
        } else {
          const dx = tg.x - u.x;
          const dy = tg.y - u.y;
          const d = hyp(dx, dy);
          if (Math.abs(dx) > 2) u.face = dx > 0 ? 1 : -1;
          const sp = st.speed * T.speed;
          const tx = d > 1e-6 ? (dx / d) * sp : 0;
          const ty = d > 1e-6 ? (dy / d) * sp : 0;
          const a = Math.min(1, T.steer * DT);
          u.vx += (tx - u.vx) * a;
          u.vy += (ty - u.vy) * a;
          u.aim = Math.atan2(dy, dx);
          return;
        }
      }
    }

    let want = false;
    let dirX = 0;
    let dirY = 0;
    const hops = st.move === 'hop' || st.move === 'leap';
    const speed = st.speed * (b.charged ? TRAIT.beetle.speed : 1);
    if (u.phase === 'stun' || u.phase === 'recover' || u.phase === 'windup') {
      if (u.phaseT >= u.phaseDur) {
        if (u.phase === 'windup') {
          strike(u, b);
          setPhase(u, 'recover', st.cd * 0.25);
        } else setPhase(u, 'move', 0);
      }
    }
    if (u.phase === 'move' && b.cheer > 0) {
      b.cheer -= DT;
    } else if (u.phase === 'move') {
      b.retarget -= DT;
      if (u.target < 0 || !units[u.target].alive || airborne(units[u.target]) || b.retarget <= 0) {
        chooseTarget(u);
        b.retarget = 0.3 + b.rng.range(0, 0.2);
      }
      const tg = u.target >= 0 ? units[u.target] : null;
      if (tg) {
        const dx = tg.x - u.x;
        const dy = tg.y - u.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const range = u.r + tg.r + st.reach;
        if (Math.abs(dx) > 2) u.face = dx > 0 ? 1 : -1;
        if (u.pet === 'penguin' && b.slideCd <= 0 && d > TRAIT.penguin.minDist) {
          // a far target and the slide is ready: it flops onto its belly
          setPhase(u, 'slide', TRAIT.penguin.maxTime);
          events.push({ type: 'slide', unit: u.id, on: true });
          u.aim = Math.atan2(dy, dx);
          return;
        }
        if (d <= range) {
          u.aim = Math.atan2(dy, dx);
          b.stall = 0;
          b.checkT = 0;
          b.lastDist = d;
          if (b.cd <= 0 && !b.air) {
            setPhase(u, 'windup', Math.max(0.1, st.cd / 3));
            b.cd = st.cd;
            events.push({ type: 'windup', unit: u.id });
          }
        } else {
          want = true;
          // no progress for a while: press forward and sidestep
          b.checkT += DT;
          if (b.checkT >= 1) {
            if (b.lastDist - d < 4) {
              b.stall = Math.min(3, b.stall + 1);
              if (b.stall === 3) b.side = -b.side;
            } else b.stall = Math.max(0, b.stall - 1);
            b.lastDist = d;
            b.checkT = 0;
          }
          dirX = d > 1e-6 ? dx / d : 0;
          dirY = d > 1e-6 ? dy / d : u.team === 0 ? -1 : 1;
          if (b.stall > 0) {
            // press on toward the foe, slipping sideways around whatever is in the way
            const sx = -dirY * b.side * FIGHT.sidestep * b.stall;
            const sy = dirX * b.side * FIGHT.sidestep * b.stall;
            dirX += sx;
            dirY += sy;
            const n = hyp(dirX, dirY) || 1;
            dirX /= n;
            dirY /= n;
          }
          u.aim = Math.atan2(dirY, dirX);
        }
      }
    }
    // motion
    if (hops) {
      if (b.air) {
        b.hopT += DT;
        if (b.hopT >= HOP_AIR) {
          b.air = false;
          b.rest = HOP_REST;
          u.hop = 0;
          u.vx = 0;
          u.vy = 0;
          events.push({ type: 'land', unit: u.id, x: u.x, y: u.y, big: false });
        } else {
          u.hop = Math.sin((Math.PI * b.hopT) / HOP_AIR);
          if (want) {
            const sp = (speed * (HOP_AIR + HOP_REST)) / HOP_AIR;
            u.vx = dirX * sp;
            u.vy = dirY * sp;
          }
        }
      } else {
        b.rest -= DT;
        u.vx = 0;
        u.vy = 0;
        if (want && b.rest <= 0) {
          b.air = true;
          b.hopT = 0;
          const sp = (speed * (HOP_AIR + HOP_REST)) / HOP_AIR;
          u.vx = dirX * sp;
          u.vy = dirY * sp;
        }
      }
    } else {
      const tx = want ? dirX * speed : 0;
      const ty = want ? dirY * speed : 0;
      const a = Math.min(1, 12 * DT);
      u.vx += (tx - u.vx) * a;
      u.vy += (ty - u.vy) * a;
    }
  };

  const pair = (u: SimUnit, o: SimUnit) => {
    if (u.phase === 'air' || o.phase === 'air') return;
    // bees fly over their own side
    if (u.team === o.team && (u.pet === 'bee' || o.pet === 'bee')) return;
    const dx = o.x - u.x;
    const dy = o.y - u.y;
    const rr = u.r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2);
    const nx = d > 1e-6 ? dx / d : 1;
    const ny = d > 1e-6 ? dy / d : 0;
    const bu = brains[u.id];
    const bo = brains[o.id];
    const mu = bu.st.mass * (u.phase === 'shell' ? TRAIT.snail.massMul : 1);
    const mo = bo.st.mass * (o.phase === 'shell' ? TRAIT.snail.massMul : 1);
    const push = ((rr - d) * 0.4) / (mu + mo);
    bu.px -= nx * push * mo;
    bu.py -= ny * push * mo;
    bo.px += nx * push * mu;
    bo.py += ny * push * mu;
  };
  /** every touching pair once: each cell with itself and its next neighbours (right, below-left, below, below-right) */
  const collide = () => {
    for (let r = 0; r < GROWS; r++) {
      for (let c = 0; c < GCOLS; c++) {
        for (let i = head[r * GCOLS + c]; i >= 0; i = next[i]) {
          const u = units[i];
          for (let j = next[i]; j >= 0; j = next[j]) pair(u, units[j]);
          if (c + 1 < GCOLS) for (let j = head[r * GCOLS + c + 1]; j >= 0; j = next[j]) pair(u, units[j]);
          if (r + 1 < GROWS) {
            const below = (r + 1) * GCOLS;
            for (let k = Math.max(0, c - 1); k <= Math.min(GCOLS - 1, c + 1); k++)
              for (let j = head[below + k]; j >= 0; j = next[j]) pair(u, units[j]);
          }
        }
      }
    }
  };

  const integrate = () => {
    const decay = Math.exp(-KNOCK_DECAY * DT);
    for (const u of units) {
      const b = brains[u.id];
      if (!u.alive) {
        b.px = b.py = 0;
        continue;
      }
      const walk = hyp(u.vx, u.vy) * DT;
      u.x += (u.vx + b.kx) * DT + b.px;
      u.y += (u.vy + b.ky) * DT + b.py;
      u.walked += walk;
      // a beetle counts only the distance it walks, not shoves
      if (u.pet === 'beetle') b.run += walk;
      b.kx *= decay;
      b.ky *= decay;
      b.px = b.py = 0;
      if (u.phase === 'air') continue;
      // soft bounce off the edges
      if (u.x < u.r) {
        u.x = u.r;
        if (b.kx < 0) b.kx = -b.kx * 0.4;
      } else if (u.x > ARENA.w - u.r) {
        u.x = ARENA.w - u.r;
        if (b.kx > 0) b.kx = -b.kx * 0.4;
      }
      if (u.y < u.r) {
        u.y = u.r;
        if (b.ky < 0) b.ky = -b.ky * 0.4;
      } else if (u.y > ARENA.h - u.r) {
        u.y = ARENA.h - u.r;
        if (b.ky > 0) b.ky = -b.ky * 0.4;
      }
    }
  };

  /** the share of a blow that reaches it: turtle armour and a hiding snail's shell */
  const cutOf = (v: SimUnit) => (v.pet === 'turtle' ? 1 - TRAIT.turtle.armour : 1) * (v.phase === 'shell' ? TRAIT.snail.take : 1);

  /**
   * The end of a step, in one fixed order: the main hits (a mouse's dodge, then a shield's block and the cuts,
   * then the damage, the shove, a bee's poison pool and a hedgehog's spikes to come), the strongest stun or an
   * interrupt per unit, the penguin shove waves, the spikes, the poison ticks, the snail hide check, then deaths.
   */
  const applyHits = () => {
    const spikes: Spike[] = [];
    const touched: number[] = [];
    /** hits so far from one attacker to one mouse this step (the dodge hash's hit number) */
    let dodgeN: Map<number, number> | null = null;
    for (const h of hits) {
      const v = units[h.to];
      const a = units[h.from];
      const b = brains[h.to];
      if (v.pet === 'mouse') {
        dodgeN ??= new Map();
        const key = h.from * units.length + h.to;
        const k = dodgeN.get(key) ?? 0;
        dodgeN.set(key, k + 1);
        if (hashSeed(seed, tickN, h.from, h.to, k) / 4294967296 < TRAIT.mouse.dodge) {
          events.push({ type: 'dodge', unit: v.id, from: h.from, x: v.x, y: v.y });
          continue;
        }
      }
      let dmg = h.dmg;
      let blocked = false;
      // a shield takes part of a hit from its front half (checked after everyone has turned this step)
      if (b.st.block > 0 && angDiff(Math.atan2(a.y - v.y, a.x - v.x), v.aim) < Math.PI / 2) {
        dmg *= 1 - b.st.block;
        blocked = true;
      }
      // bee: the sting leaves a pool of poison (80% of what got past the shield), drained over 3 s
      if (a.pet === 'bee' && dmg > 0) b.poison.push({ rate: (dmg * TRAIT.bee.poison) / TRAIT.bee.time, left: TRAIT.bee.time, by: a.id });
      const armour = v.pet === 'turtle';
      const shell = v.phase === 'shell';
      dmg *= cutOf(v);
      v.hp -= dmg;
      if (v.pet === 'hedgehog' && dmg > 0) spikes.push({ from: v.id, to: a.id, dmg: dmg * TRAIT.hedgehog.thorns });
      let dir = h.dir;
      let dist = 0;
      if (h.knock !== 0 && !shell) {
        dist = h.pull ? h.knock : h.knock / b.st.mass;
        if (h.pull) dir += Math.PI;
        b.kx += Math.cos(dir) * dist * KNOCK_DECAY;
        b.ky += Math.sin(dir) * dist * KNOCK_DECAY;
      }
      v.sinceHit = 0;
      v.hitDir = dir;
      b.lastBy = h.from;
      b.lastWeapon = h.weapon;
      b.lastKnock = dist;
      b.lastDir = dir;
      b.lastCause = 'hit';
      b.lastBlow = h.blow;
      const stun = h.stun > 0 && !shell;
      const interrupt = !stun && !shell && h.interrupt && v.phase === 'windup' && b.st.mass < brains[a.id].st.mass * HEAVY_MASS;
      if ((stun || interrupt) && b.stunIn === 0 && !b.intIn) touched.push(v.id);
      if (stun) b.stunIn = Math.max(b.stunIn, h.stun);
      else if (interrupt) b.intIn = true;
      events.push({
        type: 'hit', from: h.from, to: h.to, weapon: h.weapon, dmg, x: v.x, y: v.y, dir,
        heavy: h.heavy, blocked, stun, pack: h.pack, pinch: h.pinch, spike: false, pull: h.pull, armour, shell,
        blow: h.blow, slap: h.slap, interrupt,
      });
    }
    hits = [];
    // the strongest stun of the step (a hiding snail cannot be stunned), else a broken-off wind-up
    for (const id of touched) {
      const v = units[id];
      const b = brains[id];
      if (b.stunIn > 0) {
        const left = v.phase === 'stun' ? v.phaseDur - v.phaseT : 0;
        if (v.phase === 'slide') endSlide(v, b, 'stun', Math.max(b.stunIn, left));
        else setPhase(v, 'stun', Math.max(b.stunIn, left));
        b.air = false;
        v.hop = 0;
      } else if (b.intIn && v.phase === 'windup') {
        setPhase(v, 'recover', TRAIT.frog.interrupt);
      }
      b.stunIn = 0;
      b.intIn = false;
    }
    // the penguin's shove wave: no damage, cannot be dodged, and a hiding snail does not budge
    for (const s of shoves) {
      const v = units[s.to];
      if (v.phase === 'shell') continue;
      const b = brains[s.to];
      const dist = s.knock / b.st.mass;
      b.kx += Math.cos(s.dir) * dist * KNOCK_DECAY;
      b.ky += Math.sin(s.dir) * dist * KNOCK_DECAY;
    }
    shoves = [];
    // hedgehog spikes: a share of what it took goes back to its attacker (cut by the attacker's armour or shell)
    for (const s of spikes) {
      const v = units[s.to];
      const b = brains[s.to];
      const hh = units[s.from];
      const dmg = s.dmg * cutOf(v);
      const before = v.hp;
      v.hp -= dmg;
      v.sinceHit = 0;
      const dir = Math.atan2(v.y - hh.y, v.x - hh.x);
      if (before > 0 && v.hp <= 0) {
        b.lastBy = s.from;
        b.lastWeapon = null;
        b.lastKnock = 0;
        b.lastDir = dir;
        b.lastCause = 'spike';
        b.lastBlow = null;
      }
      events.push({
        type: 'hit', from: s.from, to: s.to, weapon: null, dmg, x: v.x, y: v.y, dir,
        heavy: false, blocked: false, stun: false, pack: 0, pinch: 0, spike: true, pull: false, armour: v.pet === 'turtle',
        shell: v.phase === 'shell', blow: null, slap: false, interrupt: false,
      } satisfies HitEvent);
    }
    // bee poison: every pool drains evenly; ticks are not hits (no push, flinch, dodge or spikes)
    for (const u of units) {
      const b = brains[u.id];
      if (!u.alive || b.poison.length === 0) continue;
      let dmg = 0;
      let left = 0;
      const by = b.poison[b.poison.length - 1].by;
      for (const p of b.poison) {
        const step = Math.min(p.left, DT);
        dmg += p.rate * step;
        p.left -= step;
        left += p.rate * p.left;
      }
      if (b.poison.some((p) => p.left <= 1e-9)) b.poison = b.poison.filter((p) => p.left > 1e-9);
      dmg *= cutOf(u);
      const before = u.hp;
      u.hp -= dmg;
      u.poison = left * cutOf(u);
      if (before > 0 && u.hp <= 0) {
        b.lastBy = by;
        b.lastWeapon = null;
        b.lastKnock = 0;
        b.lastCause = 'poison';
        b.lastBlow = null;
      }
      b.poisonAcc += dmg;
      if (time - b.poisonT >= TRAIT.bee.tickEvent - 1e-9) {
        events.push({ type: 'poison', unit: u.id, by, dmg: b.poisonAcc });
        b.poisonAcc = 0;
        b.poisonT = time;
      }
    }
    // snail: hides once per life, the first step that ends with it alive below half health
    for (const v of snails) {
      const b = brains[v.id];
      if (!v.alive || b.shellUsed || v.hp <= 0 || v.hp >= v.maxHp * TRAIT.snail.below) continue;
      b.shellUsed = true;
      setPhase(v, 'shell', TRAIT.snail.time);
      v.vx = v.vy = 0;
      b.kx = b.ky = 0;
      b.air = false;
      v.hop = 0;
      events.push({ type: 'shell', unit: v.id, on: true });
    }
    const dead: SimUnit[] = [];
    for (const u of units) if (u.alive && u.hp <= 0) dead.push(u);
    for (const u of dead) {
      u.alive = false;
      alive[u.team]--;
      const b = brains[u.id];
      if (b.lastBy >= 0) {
        kills[units[b.lastBy].team]++;
        brains[b.lastBy].cheer = FIGHT.cheer;
      }
    }
    for (const u of dead) {
      const b = brains[u.id];
      const last = alive[u.team] === 0 && dead.filter((d) => d.team === u.team).pop() === u;
      const power = Math.min(1.5, 0.2 + b.lastKnock / 80 + -u.hp / u.maxHp);
      u.hp = 0;
      u.vx = u.vy = 0;
      u.hop = 0;
      u.poison = 0;
      u.charged = false;
      b.poison = [];
      events.push({ type: 'death', unit: u.id, by: b.lastBy, weapon: b.lastWeapon, x: u.x, y: u.y, dir: b.lastDir, power, last, cause: b.lastCause, blow: b.lastBlow });
    }
  };

  const updateShare = () => {
    const sum: [number, number] = [0, 0];
    living[0].length = 0;
    living[1].length = 0;
    for (const u of units) {
      if (!u.alive) continue;
      sum[u.team] += u.hp;
      living[u.team].push(u);
    }
    hpShare[0] = maxHpSum[0] > 0 ? sum[0] / maxHpSum[0] : 0;
    hpShare[1] = maxHpSum[1] > 0 ? sum[1] / maxHpSum[1] : 0;
  };

  const finish = (winner: Team | -1, byTime: boolean) => {
    over = true;
    events.push({ type: 'end', winner, byTime });
    summary = {
      winner, byTime, time: Math.max(0, time), kills: [kills[0], kills[1]], size: [size[0], size[1]],
      hpLeft: [hpShare[0], hpShare[1]],
    };
  };

  const tick = () => {
    tickN++;
    time = tickN * DT - FIGHT.countdown;
    if (!started && time >= -1e-9) {
      started = true;
      events.push({ type: 'start' });
      for (const u of units) if (u.alive) setPhase(u, 'move', 0);
      kickOffLeaps();
    }
    if (!enraged && time >= FIGHT.enrageAt - 1e-9) {
      enraged = true;
      events.push({ type: 'enrage' });
    }
    buildGrid();
    countCrowd();
    for (const id of thinkOrder()) if (units[id].alive) think(units[id]);
    collide();
    integrate();
    applyHits();
    const before0 = hpShare[0];
    const before1 = hpShare[1];
    updateShare();
    if (alive[0] === 0 && alive[1] === 0) {
      // both armies fell in the same step: the one that had more health left as the step began wins
      const d = before0 - before1;
      finish(Math.abs(d) < 1e-12 ? -1 : d > 0 ? 0 : 1, false);
    } else if (alive[0] === 0 || alive[1] === 0) {
      finish(alive[0] > 0 ? 0 : 1, false);
    } else if (time >= FIGHT.timeLimit - 1e-9) {
      const d = hpShare[0] - hpShare[1];
      finish(Math.abs(d) < 1e-9 ? -1 : d > 0 ? 0 : 1, true);
    }
  };

  let pending: SimEvent[] | undefined;
  updateShare();
  if (size[0] === 0 || size[1] === 0) {
    // nothing to fight: decided at once
    started = true;
    time = 0;
    finish(size[0] > 0 ? 0 : size[1] > 0 ? 1 : -1, false);
    pending = events;
    events = [];
  }

  return {
    units,
    get time() {
      return time;
    },
    get over() {
      return over;
    },
    get summary() {
      return summary;
    },
    hpShare,
    alive,
    step(dt: number): SimEvent[] {
      events = pending ?? [];
      pending = undefined;
      if (over) return events;
      acc += Math.max(0, dt);
      while (acc >= DT - 1e-9 && !over) {
        acc -= DT;
        tick();
      }
      return events;
    },
  };
}

/** Runs a whole fight headless and returns how it went. */
export function runBattle(armies: [ArmySpec, ArmySpec], seed: number, opts?: BattleOptions): SimSummary {
  const b = createBattle(armies, seed, opts);
  while (!b.over) b.step(1);
  return b.summary as SimSummary;
}
