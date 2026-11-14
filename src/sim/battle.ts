import { ARENA, FIGHT, unitStats, type UnitStats } from '../data';
import { hashSeed, makeRng, type Rng } from '../rng';
import type { ArmySpec, Team, WeaponType } from '../types';
import type { Battle, SimEvent, SimSummary, SimUnit } from './types';

/*
 * The fight simulator. Pure and deterministic: fixed 1/60 s steps, randomness only from makeRng(seed).
 * Fair: every unit decides from the same snapshot, hits land together at the end of a step, and pushes
 * are summed before they are applied, so the order units are looked at never favours a team.
 */

const DT = 1 / 60;
const CELL = 40;
const GCOLS = Math.ceil(ARENA.w / CELL);
const GROWS = Math.ceil(ARENA.h / CELL);
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

const rankOf = (w: WeaponType | null) => (w === 'shield' ? 0 : w === 'bat' ? 2 : w === 'spear' ? 3 : 1);

/** Lines a team up in its spawn band: rows from the front, shields first, squads kept together. */
function lineUp(list: SimUnit[], team: Team, brains: Brain[]) {
  list.sort((a, b) => rankOf(a.weapon) - rankOf(b.weapon) || a.squad - b.squad || a.id - b.id);
  const rows: SimUnit[][] = [];
  const usable = ARENA.w - 24;
  let row: SimUnit[] = [];
  let width = 0;
  for (const u of list) {
    const w = u.r * 2 + 6;
    if (row.length && width + w > usable) {
      rows.push(row);
      row = [];
      width = 0;
    }
    row.push(u);
    width += w;
  }
  if (row.length) rows.push(row);
  const depth = rows.map((r) => r.reduce((m, u) => Math.max(m, u.r * 2 + 4), 0));
  const total = depth.reduce((a, b) => a + b, 0);
  const squeeze = Math.min(1, (FIGHT.spawnBand[1] - FIGHT.spawnBand[0]) / Math.max(1, total));
  let dist = FIGHT.spawnBand[1];
  rows.forEach((r, i) => {
    const d = depth[i] * squeeze;
    dist -= d / 2;
    const rowW = r.reduce((a, u) => a + u.r * 2 + 6, 0);
    const avg = rowW / r.length;
    const shift = Math.min((usable - rowW) / 2, avg / 4) * (i % 2 ? 1 : -1);
    let x = (ARENA.w - rowW) / 2 + shift;
    for (const u of r) {
      const b = brains[u.id];
      const w = u.r * 2 + 6;
      u.x = clamp(x + w / 2 + b.rng.range(-1.5, 1.5), u.r, ARENA.w - u.r);
      const yy = clamp(dist + b.rng.range(-1.5, 1.5), u.r, ARENA.h / 2 - u.r);
      u.y = team === 0 ? ARENA.h - yy : yy;
      x += w;
    }
    dist -= d / 2;
  });
}

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
          lastBy: -1, lastWeapon: null, lastKnock: 0, lastDir: 0,
        });
        size[team]++;
        maxHpSum[team] += st.hp;
      }
    });
  }
  for (const team of [0, 1] as Team[]) lineUp(units.filter((u) => u.team === team), team, brains);
  const maxR = units.reduce((m, u) => Math.max(m, u.r), 0);

  // the neighbour grid
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
        const d = Math.hypot(f.x - u.x, f.y - u.y);
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
    } else if (tg && tg.alive && Math.hypot(tg.x - u.x, tg.y - u.y) <= (u.r + tg.r + st.reach) * 1.2 + 4) {
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
    if (u.phase === 'move') {
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
            b.stall = b.lastDist - d < 4 ? Math.min(3, b.stall + 1) : Math.max(0, b.stall - 1);
            b.lastDist = d;
            b.checkT = 0;
          }
          dirX = d > 1e-6 ? dx / d : 0;
          dirY = d > 1e-6 ? dy / d : u.team === 0 ? -1 : 1;
          if (b.stall > 0) {
            dirX += b.side * 0.5 * b.stall;
            dirY += (u.team === 0 ? -0.7 : 0.7) * b.stall;
            const n = Math.hypot(dirX, dirY) || 1;
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

  const collide = () => {
    for (const u of units) {
      if (!u.alive) continue;
      near(u.x, u.y, u.r + maxR, (o) => {
        if (o.id <= u.id) return;
        const dx = o.x - u.x;
        const dy = o.y - u.y;
        const rr = u.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) return;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : u.id % 2 ? 1 : -1;
        const ny = d > 1e-6 ? dy / d : 0;
        const push = (rr - d) * 0.4;
        const bu = brains[u.id];
        const bo = brains[o.id];
        const mu = bu.st.mass;
        const mo = bo.st.mass;
        const su = (push * mo) / (mu + mo);
        const so = (push * mu) / (mu + mo);
        bu.px -= nx * su;
        bu.py -= ny * su;
        bo.px += nx * so;
        bo.py += ny * so;
      });
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
      u.walked += Math.hypot(u.vx, u.vy) * DT;
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
      const stun = h.stun > 0 && v.hp > 0;
      events.push({
        type: 'hit', from: h.from, to: h.to, weapon: h.weapon, dmg: h.dmg, x: v.x, y: v.y, dir: h.dir,
        heavy: h.heavy, blocked: h.blocked, stun,
      });
      if (stun) {
        setPhase(v, 'stun', h.stun);
        b.air = false;
        v.hop = 0;
      } else if (h.heavy && v.phase === 'windup' && b.st.mass < brains[a.id].st.mass * 1.5) {
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
      if (b.lastBy >= 0) kills[units[b.lastBy].team]++;
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
    living[0] = [];
    living[1] = [];
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
    updateShare();
    buildGrid();
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
