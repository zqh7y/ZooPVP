import { ARENA, FIGHT, unitStats, type UnitStats } from '../data';
import { hashSeed, makeRng, type Rng } from '../rng';
import type { ArmySpec, PetType, Team, WeaponType } from '../types';
import type { Battle, SimEvent, SimSummary, SimUnit } from './types';

/*
 * The fight simulator. Pure and deterministic: fixed 1/60 s steps, randomness only from makeRng(seed).
 * Fair: every unit decides from the same snapshot, hits land together at the end of a step, and pushes
 * are summed before they are applied, so the order units are looked at never favours a team.
 */

const DT = 1 / 60;
/** how fast a shove dies away, per second */
const KNOCK_DECAY = 5;
/** a frog's hop: seconds in the air, then seconds resting */
const HOP_AIR = 0.36;
const HOP_REST = 0.2;
/** bat swing arc, half angle */
const ARC = 1.05;
/** shield-bearers look this much closer to nearby foes */
const TAUNT = 0.6;
const TAUNT_RANGE = 150;


interface Brain {
  st: UnitStats;
  rng: Rng;
  /** seconds until it may attack again */
  cd: number;
  /** the shove velocity */
  kx: number;
  ky: number;
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
  lastBy: number;
  lastWeapon: WeaponType | null;
  lastKnock: number;
  lastDir: number;
  /** seconds after the start before its row sets off (it still fights back when a foe comes close) */
  wait: number;
  /** seconds of the short pause after a knock-out it scored */
  cheer: number;
}

interface Hit {
  from: number;
  to: number;
  dmg: number;
  dir: number;
  heavy: boolean;
  blocked: boolean;
  stun: number;
  knock: number;
  weapon: WeaponType | null;
}

/** within a kind: shield-bearers first, spears last */
const rankOf = (w: WeaponType | null) => (w === 'shield' ? 0 : w === 'bat' ? 2 : w === 'spear' ? 3 : 1);
/** the kinds from the front row back: the tough frogs in front, the quick ants behind them */
const KIND_ORDER: readonly PetType[] = ['frog', 'ant'];
/** px kept free along the side lines */
const SIDE = 10;

/**
 * Lines a team up in clean rows by kind: the frogs (the tough kind) in front, the ants behind, each kind in rows
 * of its own. Squads of a kind stay together (shield squads first, spears last); a kind's rows are filled evenly
 * and spaced evenly across the width; nobody overlaps. The top team is the mirror image of the bottom one.
 * The front kind sets off at the whistle, the kind behind it FIGHT.wave seconds later (or as soon as a foe
 * comes close), so the lines meet one after the other.
 */
function lineUp(list: SimUnit[], team: Team, brains: Brain[]) {
  const usable = ARENA.w - SIDE * 2;
  const gap = FIGHT.lineGap;
  const rows: SimUnit[][] = [];
  /** which wave each row sets off in: the front kind first, the next kind FIGHT.wave seconds later */
  const waveOf: number[] = [];
  for (const kind of KIND_ORDER) {
    const block = list.filter((u) => u.pet === kind).sort((a, b) => rankOf(a.weapon) - rankOf(b.weapon) || a.squad - b.squad || a.id - b.id);
    if (block.length === 0) continue;
    const rMax = block.reduce((m, u) => Math.max(m, u.r), 0);
    const cap = Math.max(1, Math.floor((usable + gap) / (rMax * 2 + gap)));
    const per = Math.ceil(block.length / Math.ceil(block.length / cap));
    const wave = waveOf.length ? waveOf[waveOf.length - 1] + 1 : 0;
    for (let i = 0; i < block.length; i += per) {
      rows.push(block.slice(i, i + per));
      waveOf.push(wave);
    }
  }
  const depth = rows.map((r) => r.reduce((m, u) => Math.max(m, u.r * 2), 0));
  const total = depth.reduce((a, b) => a + b, 0) + gap * Math.max(0, rows.length - 1);
  const room = ARENA.h / 2 - 24 - FIGHT.lineBack;
  const front = Math.min(FIGHT.lineBack + room, Math.max(FIGHT.lineFront, FIGHT.lineBack + total));
  const squeeze = Math.min(1, room / Math.max(1, total)); // only ever below 1 for armies far beyond a 5 x 5 grid
  let dist = front;
  rows.forEach((r, i) => {
    const rMax = r.reduce((m, u) => Math.max(m, u.r), 0);
    dist -= (depth[i] / 2) * squeeze;
    const step = Math.min(usable / r.length, (rMax * 2 + gap) * 2.2);
    r.forEach((u, k) => {
      const b = brains[u.id];
      b.wait = waveOf[i] * FIGHT.wave;
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

export function createBattle(armies: [ArmySpec, ArmySpec], seed: number): Battle {
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
          phase: 'wait', phaseT: 0, phaseDur: 0, target: -1, hop: 0, walked: 0, sinceHit: 99, hitDir: 0,
        });
        const rng = makeRng(hashSeed(seed, team, si, k));
        brains.push({
          st, rng, cd: rng.range(0, st.cd * 0.5), kx: 0, ky: 0, air: false, hopT: 0, rest: rng.range(0, HOP_REST),
          retarget: 0, checkT: 0, lastDist: 1e9, stall: 0, side: rng.chance(0.5) ? 1 : -1, px: 0, py: 0,
          lastBy: -1, lastWeapon: null, lastKnock: 0, lastDir: 0, wait: 0, cheer: 0,
        });
        size[team]++;
        maxHpSum[team] += st.hp;
      }
    });
  }
  for (const team of [0, 1] as Team[]) lineUp(units.filter((u) => u.team === team), team, brains);
  const maxR = units.reduce((m, u) => Math.max(m, u.r), 0);

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
  let events: SimEvent[] = [];
  /** how many units go for each unit, counted once at the start of every step (so the order never matters) */
  const crowd = new Int32Array(Math.max(1, units.length));
  const countCrowd = () => {
    crowd.fill(0);
    for (const u of units) if (u.alive && u.target >= 0 && units[u.target].alive) crowd[u.target]++;
  };
  const forward = units.map((u) => u.id);
  const backward = forward.slice().reverse();

  const chooseTarget = (u: SimUnit) => {
    const foes = living[1 - u.team];
    const k = Math.max(1, 3 - Math.max(0, time) / 3);
    let best = -1;
    let bs = Infinity;
    for (const f of foes) {
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

  const strike = (u: SimUnit, b: Brain) => {
    const st = b.st;
    const tg = u.target >= 0 ? units[u.target] : null;
    if (tg && tg.alive) u.aim = Math.atan2(tg.y - u.y, tg.x - u.x);
    const victims: SimUnit[] = [];
    const ax = Math.cos(u.aim);
    const ay = Math.sin(u.aim);
    if (u.weapon === 'bat') {
      const found: [number, SimUnit][] = [];
      near(u.x, u.y, u.r + st.reach + maxR, (f) => {
        if (f.team === u.team) return;
        const d = hyp(f.x - u.x, f.y - u.y);
        if (d > u.r + f.r + st.reach) return;
        if (d > 1e-6 && angDiff(Math.atan2(f.y - u.y, f.x - u.x), u.aim) > ARC) return;
        found.push([d, f]);
      });
      found.sort((a, c) => a[0] - c[0] || a[1].id - c[1].id);
      for (const [, f] of found.slice(0, st.splash)) victims.push(f);
    } else if (u.weapon === 'spear') {
      const found: [number, SimUnit][] = [];
      near(u.x, u.y, u.r + st.reach + maxR, (f) => {
        if (f.team === u.team) return;
        const rx = f.x - u.x;
        const ry = f.y - u.y;
        const along = rx * ax + ry * ay;
        const perp = Math.abs(-rx * ay + ry * ax);
        if (along < -f.r || along > u.r + st.reach + f.r || perp > f.r + 3) return;
        found.push([along, f]);
      });
      found.sort((a, c) => a[0] - c[0] || a[1].id - c[1].id);
      for (const [, f] of found.slice(0, st.pierce)) victims.push(f);
    } else if (tg && tg.alive && hyp(tg.x - u.x, tg.y - u.y) <= (u.r + tg.r + st.reach) * 1.2 + 4) {
      victims.push(tg);
    }
    events.push({ type: 'swing', unit: u.id, weapon: u.weapon, hit: victims.length > 0 });
    const mul = enraged ? 1 + FIGHT.enrageRamp * (time - FIGHT.enrageAt) : 1;
    for (const v of victims) {
      const dir = u.weapon === 'spear' ? u.aim : Math.atan2(v.y - u.y, v.x - u.x);
      const dmg = st.dmg * b.rng.range(0.9, 1.1) * mul;
      hits.push({ from: u.id, to: v.id, dmg, dir, heavy: u.weapon === 'bat', blocked: false, stun: st.stun, knock: st.knock, weapon: u.weapon });
    }
  };

  const setPhase = (u: SimUnit, p: SimUnit['phase'], dur: number) => {
    u.phase = p;
    u.phaseT = 0;
    u.phaseDur = dur;
  };

  const think = (u: SimUnit) => {
    const b = brains[u.id];
    const st = b.st;
    u.sinceHit += DT;
    u.phaseT += DT;
    if (!started) return;
    b.cd -= DT;
    if (b.wait > 0) {
      if (time < b.wait && u.sinceHit > 1) {
        // its row has not set off yet: it holds its place unless a foe comes close
        let close = false;
        const look = u.r + st.reach + 40;
        near(u.x, u.y, look + maxR, (f) => {
          if (f.team !== u.team && hyp(f.x - u.x, f.y - u.y) < look + f.r) close = true;
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
    let want = false;
    let dirX = 0;
    let dirY = 0;
    const frog = st.move === 'hop';
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
      if (u.target < 0 || !units[u.target].alive || b.retarget <= 0) {
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
    if (frog) {
      if (b.air) {
        b.hopT += DT;
        if (b.hopT >= HOP_AIR) {
          b.air = false;
          b.rest = HOP_REST;
          u.hop = 0;
          u.vx = 0;
          u.vy = 0;
          events.push({ type: 'land', unit: u.id, x: u.x, y: u.y });
        } else {
          u.hop = Math.sin((Math.PI * b.hopT) / HOP_AIR);
          if (want) {
            const sp = (st.speed * (HOP_AIR + HOP_REST)) / HOP_AIR;
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
          const sp = (st.speed * (HOP_AIR + HOP_REST)) / HOP_AIR;
          u.vx = dirX * sp;
          u.vy = dirY * sp;
        }
      }
    } else {
      const tx = want ? dirX * st.speed : 0;
      const ty = want ? dirY * st.speed : 0;
      const a = Math.min(1, 12 * DT);
      u.vx += (tx - u.vx) * a;
      u.vy += (ty - u.vy) * a;
    }
  };

  const pair = (u: SimUnit, o: SimUnit) => {
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
    const mu = bu.st.mass;
    const mo = bo.st.mass;
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
      u.x += (u.vx + b.kx) * DT + b.px;
      u.y += (u.vy + b.ky) * DT + b.py;
      u.walked += hyp(u.vx, u.vy) * DT;
      b.kx *= decay;
      b.ky *= decay;
      b.px = b.py = 0;
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

  const applyHits = () => {
    for (const h of hits) {
      const v = units[h.to];
      const a = units[h.from];
      const b = brains[h.to];
      // a shield takes part of a hit from its front half (checked after everyone has turned this step)
      if (b.st.block > 0 && angDiff(Math.atan2(a.y - v.y, a.x - v.x), v.aim) < Math.PI / 2) {
        h.dmg *= 1 - b.st.block;
        h.blocked = true;
      }
      v.hp -= h.dmg;
      const dist = h.knock / b.st.mass;
      b.kx += Math.cos(h.dir) * dist * KNOCK_DECAY;
      b.ky += Math.sin(h.dir) * dist * KNOCK_DECAY;
      v.sinceHit = 0;
      v.hitDir = h.dir;
      b.lastBy = h.from;
      b.lastWeapon = h.weapon;
      b.lastKnock = dist;
      b.lastDir = h.dir;
      const stun = h.stun > 0;
      events.push({
        type: 'hit', from: h.from, to: h.to, weapon: h.weapon, dmg: h.dmg, x: v.x, y: v.y, dir: h.dir,
        heavy: h.heavy, blocked: h.blocked, stun,
      });
      if (stun) {
        setPhase(v, 'stun', h.stun);
        b.air = false;
        v.hop = 0;
      } else if (h.heavy && v.phase === 'windup' && b.st.mass < brains[a.id].st.mass * 0.8) {
        setPhase(v, 'recover', 0.2);
      }
    }
    hits = [];
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
      events.push({ type: 'death', unit: u.id, by: b.lastBy, weapon: b.lastWeapon, x: u.x, y: u.y, dir: b.lastDir, power, last });
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
    }
    if (!enraged && time >= FIGHT.enrageAt - 1e-9) {
      enraged = true;
      events.push({ type: 'enrage' });
    }
    buildGrid();
    countCrowd();
    for (const id of tickN % 2 ? forward : backward) if (units[id].alive) think(units[id]);
    collide();
    integrate();
    applyHits();
    updateShare();
    if (alive[0] === 0 || alive[1] === 0) {
      finish(alive[0] > 0 ? 0 : alive[1] > 0 ? 1 : -1, false);
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
export function runBattle(armies: [ArmySpec, ArmySpec], seed: number): SimSummary {
  const b = createBattle(armies, seed);
  while (!b.over) b.step(1);
  return b.summary as SimSummary;
}
