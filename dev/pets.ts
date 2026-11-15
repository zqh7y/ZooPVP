import type { GearType, PetType, Team, WeaponType } from '../src/types';
import { UI } from '../src/theme';
import { label, seeded } from '../src/util';
import { restPose, type PetLook, type PetPose } from '../src/draw/petTypes';
import { petArt } from '../src/draw/pets';
import { drawWeapon } from '../src/draw/weapons';
import { drawGear } from '../src/draw/gear';
import { param, stage } from './harness';

/*
 * Sheets for looking at the units, weapons and gear:
 *   ?sheet=lineup | gear | poses | items | battle | perf | live | boss   (&t=1.2 freezes time; &pet=roo for poses / gear;
 *   &from=6 for live shows units 7-12)
 *   lineup: all 12, both teams, idle / attack / hurt, big and at fight size on grass.
 *   perf: &flush=1 also counts painting.
 */
type Ctx = CanvasRenderingContext2D;
const CLASSES = ['E', 'D', 'C', 'B', 'A', 'S', 'SSS'];
const WEAPONS: WeaponType[] = ['knife', 'bat', 'shield', 'spear'];
const GEAR: GearType[] = ['helmet', 'sneakers', 'chili'];
const UNITS: PetType[] = ['sprout', 'buzzy', 'ninja', 'snailor', 'roo', 'cacto', 'pogo', 'briar', 'angler', 'sumo', 'rhino', 'boulder'];
const NAMES = ['Chick', 'Scorp', 'Shroom', 'Tulip', 'Roo', 'Cacto', 'Dandy', 'Spike', 'Snapper', 'Pumpkin', 'Bamboo', 'Oak'];
/** the fight's body radius of each rung (px): the simulator's radius x 1.12, as the battle draws it */
const FIGHT_R = [13, 14, 14, 20, 24, 23, 21, 25, 25, 28, 30, 34].map((r) => Math.round(r * 1.12));
const SLATE = '#e9e4da';
/** a soft, muted pitch: two mowing stripes */
const PITCH = ['#8fb27a', '#87ab72'];
const CAP = { color: UI.textDim };

const fightR = (pet: PetType) => FIGHT_R[UNITS.indexOf(pet)];
const mk = (pet: PetType, team: Team, o: Partial<PetLook> = {}): PetLook => ({
  pet,
  level: 1,
  team,
  weapon: null,
  weaponLevel: 0,
  helmet: 0,
  sneakers: 0,
  chili: 0,
  seed: UNITS.indexOf(pet) * 3 + team,
  ...o,
});
const ps = (t: number, o: Partial<PetPose> = {}): PetPose => ({ ...restPose(), t, ...o });
const hops = (pet: PetType) => pet === 'roo' || pet === 'pogo';

function put(ctx: Ctx, x: number, y: number, l: PetLook, p: PetPose, r: number, cap = '') {
  ctx.save();
  ctx.translate(x, y);
  petArt.drawShadow(ctx, l, r, p.hop);
  petArt.drawPet(ctx, l, p, r);
  ctx.restore();
  if (cap) label(ctx, cap, x, y + 14, 11, CAP);
}

/** A fighter going through its moves: walk (or hop), wind up, strike. */
function act(p: PetPose, t: number, i: number, hop: boolean) {
  const c = (t * 0.8 + i * 0.37) % 1;
  p.walk = t * 70 + i * 9;
  p.moving = c < 0.5 ? 1 : 0;
  p.hop = hop && c < 0.5 ? Math.sin(c * 2 * Math.PI) : 0;
  p.wind = c >= 0.5 && c < 0.75 ? (c - 0.5) / 0.25 : 0;
  p.strike = c >= 0.75 ? 1 - (c - 0.75) / 0.25 : 0;
}

function pitch(ctx: Ctx, x: number, y: number, w: number, h: number) {
  for (let yy = 0; yy < h; yy += 40) {
    ctx.fillStyle = PITCH[(yy / 40) % 2];
    ctx.fillRect(x, y + yy, w, Math.min(40, h - yy));
  }
}

/** what each fighter's own move looks like, for the lineup's fourth pose */
const SPECIAL: Partial<Record<PetType, [string, Partial<PetPose>]>> = {
  buzzy: ['throw', { wind: 1 }],
  ninja: ['boing', { walk: 22, moving: 1 }],
  snailor: ['bud', { shell: 1, squashX: 1.14, squashY: 0.66, mood: 'scared' }],
  roo: ['hop', { hop: 0.7, moving: 1 }],
  cacto: ['jab 2', { strike: 0.3 }],
  pogo: ['leap', { hop: 0.9 }],
  briar: ['bristle', { hurt: 0.35, mood: 'angry' }],
  angler: ['snap', { wind: 1 }],
  sumo: ['roll', { spin: -1.15, mood: 'angry', walk: 40, squashX: 1.12, squashY: 0.9 }],
  rhino: ['charge', { mood: 'angry', moving: 1, walk: 9 }],
  boulder: ['pound', { wind: 1 }],
};

function lineup(ctx: Ctx, t: number) {
  // big: idle (blue corner), attack (red), hurt (blue), and its own move (red)
  UNITS.forEach((pet, i) => {
    const cx = (i % 4) * 350;
    const cy = Math.floor(i / 4) * 215;
    label(ctx, `${i + 1}  ${NAMES[i]}`, cx + 175, cy + 18, 17, { color: UI.text });
    const r = 30;
    const [cap, sp] = SPECIAL[pet] ?? ['walk', { walk: 9, moving: 1 }];
    put(ctx, cx + 58, cy + 178, mk(pet, 0), ps(t), r, 'idle');
    put(ctx, cx + 140, cy + 178, mk(pet, 1), ps(t, { face: -1, strike: 0.85 }), r, 'attack');
    put(ctx, cx + 218, cy + 178, mk(pet, 0), ps(t, { hurt: 0.7 }), r, 'hurt');
    put(ctx, cx + 296, cy + 178, mk(pet, 1), ps(t, { face: -1, ...sp }), r, cap);
  });
  // at fight size on the grass
  const y0 = 660;
  pitch(ctx, 0, y0, 1400, 330);
  UNITS.forEach((pet, i) => {
    const x = 58 + i * 117;
    const r = fightR(pet);
    label(ctx, NAMES[i], x, y0 + 14, 12, { color: '#ffffff' });
    put(ctx, x - 14, y0 + 105, mk(pet, 0), ps(t, { walk: 6 + i }), r);
    put(ctx, x + 14, y0 + 200, mk(pet, 1), ps(t, { face: -1, strike: 0.85 }), r);
    put(ctx, x - 6, y0 + 300, mk(pet, 0, { weapon: WEAPONS[i % 4], weaponLevel: 1 + (i % 7), helmet: i % 3 === 0 ? 3 : 0 }), ps(t, { hurt: i % 2 ? 0.7 : 0, aimY: -0.4 }), r);
  });
}

/** Bosses at 1.8x next to a plain unit, all twelve in two rows. */
function boss(ctx: Ctx, t: number) {
  pitch(ctx, 0, 0, 1200, 640);
  UNITS.forEach((pet, i) => {
    const x = 100 + (i % 6) * 200;
    const y = 280 + Math.floor(i / 6) * 320;
    const r = fightR(pet);
    put(ctx, x - 50, y, mk(pet, 0), ps(t, { walk: 4 }), r);
    put(ctx, x + 30, y, mk(pet, 1, { boss: true }), ps(t, { face: -1 }), r * 1.8);
  });
}

function gear(ctx: Ctx, t: number) {
  const pets: PetType[] = param('pet') ? [param('pet') as PetType] : UNITS;
  pets.forEach((pet, row) => {
    const r = 26;
    const y = 95 + row * 125;
    label(ctx, pet, 40, y - 70, 13, { color: UI.text });
    WEAPONS.forEach((w, i) => {
      const lv = [2, 4, 5, 7][i];
      const base = { weapon: w, weaponLevel: lv };
      put(ctx, 60 + i * 190, y, mk(pet, 0, base), ps(t), r);
      put(ctx, 140 + i * 190, y, mk(pet, 1, base), ps(t, { face: -1, strike: w === 'bat' ? 0.95 : 0.8 }), r);
    });
    put(ctx, 830, y, mk(pet, 0, { helmet: 2 }), ps(t), r);
    put(ctx, 905, y, mk(pet, 1, { helmet: 7, sneakers: 6 }), ps(t, { face: -1 }), r);
    put(ctx, 980, y, mk(pet, 0, { sneakers: 3, chili: 7 }), ps(t, { walk: 8, moving: 1 }), r);
    put(ctx, 1080, y, mk(pet, 1, { helmet: 5, sneakers: 5, chili: 5, weapon: 'spear', weaponLevel: 6 }), ps(t, { face: -1, wind: 0.6 }), r);
  });
}

function poses(ctx: Ctx, t: number) {
  const pet = (param('pet', 'sprout') as PetType) || 'sprout';
  const r = 30;
  const l = mk(pet, 0);
  const bat = mk(pet, 1, { weapon: 'bat', weaponLevel: 3 });
  const row = (y: number, cells: [string, PetLook, Partial<PetPose>][]) => {
    const step = 1200 / cells.length;
    cells.forEach(([cap, lk, o], i) => put(ctx, step * (i + 0.5), y, lk, ps(t, o), r, cap));
  };
  const move: [string, PetLook, Partial<PetPose>][] = hops(pet)
    ? [0.12, 0.5, 1, 0.12].map((h, i) => [`hop ${h}`, l, { hop: h, moving: 1, walk: i * 9 }])
    : [0, 9, 18, 27].map((d, i) => [`walk ${i}`, l, { walk: d, moving: 1 }]);
  row(110, [...move, ['wind', l, { wind: 1 }], ['strike 1', l, { strike: 1 }], ['strike .5', l, { strike: 0.5 }], ['bat wind', bat, { wind: 1 }], ['bat strike', bat, { strike: 1 }], ['hurt', l, { hurt: 1 }]]);
  row(250, [
    ['idle', l, {}],
    ['angry', l, { mood: 'angry' }],
    ['hurt', l, { mood: 'hurt' }],
    ['dizzy', l, { mood: 'dizzy' }],
    ['cheer', l, { mood: 'cheer' }],
    ['scared', l, { mood: 'scared' }],
    ['dead', l, { mood: 'dead' }],
    ['blink', l, { t: 0.05 + (((l.seed * 0.618) % 1) + 1) * -2.9 + 3.7 * 3 }],
  ]);
  row(410, [
    ['flat', l, { squashX: 1.8, squashY: 0.2 }],
    ['squash', l, { squashX: 1.3, squashY: 0.6 }],
    ['puff .5', l, { puff: 0.5 }],
    ['puff 1', l, { puff: 1 }],
    ['puff 1.5', l, { puff: 1.5 }],
    ['spin 1', l, { spin: 1, hop: 0.4 }],
    ['spin 3', l, { spin: 3, hop: 0.4 }],
  ]);
  const hat = mk(pet, 0, { helmet: 5, sneakers: 6, weapon: 'shield', weaponLevel: 4, chili: 5 });
  row(560, [
    ['stone .5', l, { stone: 0.5 }],
    ['stone 1', bat, { stone: 1 }],
    ['limp .5', l, { limp: 0.5 }],
    ['limp 1', l, { limp: 1 }],
    ['alpha .5', l, { alpha: 0.5 }],
    ['aim up', bat, { wind: 0.6, aimY: -1 }],
    ['aim down', bat, { wind: 0.6, aimY: 1 }],
    ['geared', hat, {}],
    ['shove', hat, { strike: 1 }],
  ]);
}

function items(ctx: Ctx, t: number) {
  CLASSES.forEach((c, i) => label(ctx, c, 110 + i * 62, 16, 16, { color: UI.tierText[i] }));
  [...WEAPONS, ...GEAR].forEach((kind, row) => {
    const y = 62 + row * 64;
    label(ctx, kind, 40, y, 12, CAP);
    for (let i = 0; i < 7; i++) {
      for (const [x, size] of [[110 + i * 62, 46], [560 + i * 22, 14]] as const) {
        ctx.save();
        if (row < 4) {
          ctx.translate(x, kind === 'shield' ? y : y + size / 2);
          drawWeapon(ctx, kind as WeaponType, i + 1, size, t);
        } else {
          ctx.translate(x, y);
          drawGear(ctx, kind as GearType, i + 1, size, t);
        }
        ctx.restore();
      }
    }
  });
}

interface Unit {
  l: PetLook;
  x: number;
  y: number;
  face: 1 | -1;
  kind: number;
}
function army(n: number, w: number, h: number, seed: number): Unit[] {
  const rng = seeded(seed);
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) {
    const team: Team = i < n / 2 ? 1 : 0;
    const pet = UNITS[Math.floor(rng() ** 1.6 * 12)];
    const armed = rng() < 0.5;
    const l = mk(pet, team, {
      weapon: armed ? WEAPONS[Math.floor(rng() * 4)] : null,
      weaponLevel: armed ? 1 + Math.floor(rng() * 7) : 0,
      helmet: rng() < 0.2 ? 1 + Math.floor(rng() * 7) : 0,
      sneakers: rng() < 0.15 ? 1 + Math.floor(rng() * 7) : 0,
      chili: rng() < 0.15 ? 1 + Math.floor(rng() * 7) : 0,
      seed: i,
    });
    const y = team ? 40 + rng() * (h * 0.5 - 40) : h * 0.5 + 30 + rng() * (h * 0.5 - 40);
    out.push({ l, x: 26 + rng() * (w - 52), y, face: team ? -1 : 1, kind: Math.floor(rng() * 10) });
  }
  return out.sort((a, b) => a.y - b.y);
}
function drawArmy(ctx: Ctx, units: Unit[], t: number, plain: boolean) {
  const poses = units.map((u, i) => {
    const p = ps(t, { face: u.face, aimY: u.l.team ? 0.6 : -0.6 });
    act(p, t, i, hops(u.l.pet));
    if (!plain) {
      if (u.kind === 7) p.hurt = 0.8;
      else if (u.kind === 8) p.mood = 'angry';
    }
    return p;
  });
  units.forEach((u, i) => {
    ctx.save();
    ctx.translate(u.x, u.y);
    petArt.drawShadow(ctx, u.l, fightR(u.l.pet), poses[i].hop);
    ctx.restore();
  });
  units.forEach((u, i) => {
    ctx.save();
    ctx.translate(u.x, u.y);
    petArt.drawPet(ctx, u.l, poses[i], fightR(u.l.pet));
    ctx.restore();
  });
}

/** Big fighters going through their moves in real time, to watch the small things. */
function live(ctx: Ctx, t: number) {
  UNITS.slice(param('from') ? +param('from') : 0).slice(0, 6).forEach((pet, i) => {
    const l = mk(pet, (i % 2) as Team, i % 3 === 1 ? { weapon: WEAPONS[i % 4], weaponLevel: 4 } : {});
    const p = ps(t + i * 0.9, { face: i % 2 ? -1 : 1, aimY: i % 2 ? 0.5 : -0.5 });
    const c = ((t * 0.25 + i * 0.3) % 1) * 4;
    if (c < 1.6) {
      p.walk = t * 40;
      p.moving = 1;
      if (hops(pet)) p.hop = Math.max(0, Math.sin(((t * 1.6) % 1) * Math.PI));
    } else if (c > 2.4 && c < 3.2) act(p, t, i, hops(pet));
    put(ctx, 120 + (i % 3) * 210 + (c < 1.6 ? Math.sin(c * 2) * 20 : 0), i < 3 ? 200 : 420, l, p, 40);
  });
}

const sheet = param('sheet', 'lineup');
const SIZE: Record<string, [number, number, string]> = {
  lineup: [1400, 990, SLATE],
  boss: [1200, 640, SLATE],
  gear: [1200, param('pet') ? 180 : 1540, SLATE],
  poses: [1200, 640, SLATE],
  items: [720, 480, SLATE],
  battle: [460, 620, PITCH[0]],
  perf: [460, 820, PITCH[0]],
  live: [680, 500, PITCH[0]],
};
const [w, h, bg] = SIZE[sheet] ?? SIZE.lineup;
const fighters = sheet === 'battle' ? army(60, w, h, 11) : sheet === 'perf' ? army(200, w, h, 5) : [];
let frames = 0;
let total = 0;
void stage({
  w,
  h,
  bg,
  draw(ctx, t) {
    if (sheet === 'battle' || sheet === 'perf' || sheet === 'live') pitch(ctx, 0, 0, w, h);
    if (sheet === 'battle') drawArmy(ctx, fighters, t, false);
    else if (sheet === 'live') live(ctx, t);
    else if (sheet === 'gear') gear(ctx, t);
    else if (sheet === 'poses') poses(ctx, t);
    else if (sheet === 'items') items(ctx, t);
    else if (sheet === 'boss') boss(ctx, t);
    else if (sheet === 'perf') {
      const t0 = performance.now();
      drawArmy(ctx, fighters, t, true);
      if (param('flush')) ctx.getImageData(0, 0, 1, 1);
      const ms = performance.now() - t0;
      if (++frames > 30) total += ms;
      const avg = frames > 30 ? total / (frames - 30) : 0;
      (window as unknown as { perf: object }).perf = { avg, frames };
      label(ctx, `200 fighters: ${avg.toFixed(2)} ms / frame`, w / 2, 16, 16);
    } else lineup(ctx, t);
  },
});
