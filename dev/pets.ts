import type { GearType, PetType, Team, WeaponType } from '../src/types';
import { UI } from '../src/theme';
import { label, seeded } from '../src/util';
import { restPose, type PetLook, type PetPose } from '../src/draw/petTypes';
import { petArt } from '../src/draw/pets';
import { drawWeapon } from '../src/draw/weapons';
import { drawGear } from '../src/draw/gear';
import { param, stage } from './harness';

/*
 * Sheets for looking at the pets, weapons and gear:
 *   ?sheet=lineup | battle | gear | poses | items | perf | live   (&t=1.2 freezes time; perf: &flush=1 also counts painting)
 * The sheets stand on the interface's slate; battle, perf and live stand on the night pitch's green.
 */
type Ctx = CanvasRenderingContext2D;
const CLASSES = ['E', 'D', 'C', 'B', 'A', 'S', 'SSS'];
const WEAPONS: WeaponType[] = ['knife', 'bat', 'shield', 'spear'];
const GEAR: GearType[] = ['helmet', 'sneakers', 'chili'];
const SLATE = UI.surfaceAlt;
/** the pitch under the floodlights: two mowing stripes */
const PITCH = ['#3f8f4a', '#3a8745'];
const CAP = { color: UI.textDim };

const mk = (pet: PetType, level: number, team: Team, o: Partial<PetLook> = {}): PetLook => ({
  pet,
  level,
  team,
  weapon: null,
  weaponLevel: 0,
  helmet: 0,
  sneakers: 0,
  chili: 0,
  seed: level * 3 + team,
  ...o,
});
const ps = (t: number, o: Partial<PetPose> = {}): PetPose => ({ ...restPose(), t, ...o });
/** the fight's own radius for a pet of a class */
const radius = (pet: PetType, level: number) => (pet === 'ant' ? 8 : 14) * (1 + 0.11 * (level - 1));

function put(ctx: Ctx, x: number, y: number, l: PetLook, p: PetPose, r: number, cap = '') {
  ctx.save();
  ctx.translate(x, y);
  petArt.drawShadow(ctx, l, r, p.hop);
  petArt.drawPet(ctx, l, p, r);
  ctx.restore();
  if (cap) label(ctx, cap, x, y + 13, 11, CAP);
}

/** A fighter going through its moves: walk (or hop), wind up, strike. */
function act(p: PetPose, t: number, i: number, frog: boolean) {
  const c = (t * 0.8 + i * 0.37) % 1;
  p.walk = t * 70 + i * 9;
  p.moving = c < 0.5 ? 1 : 0;
  p.hop = frog && c < 0.5 ? Math.sin(c * 2 * Math.PI) : 0;
  p.wind = c >= 0.5 && c < 0.75 ? (c - 0.5) / 0.25 : 0;
  p.strike = c >= 0.75 ? 1 - (c - 0.75) / 0.25 : 0;
}

function lineup(ctx: Ctx, t: number) {
  CLASSES.forEach((c, i) => label(ctx, c, 85 + i * 138, 24, 22, { color: UI.tierText[i] }));
  for (let row = 0; row < 4; row++) {
    const pet: PetType = row < 2 ? 'ant' : 'frog';
    for (let i = 0; i < 7; i++) put(ctx, 85 + i * 138, [150, 300, 465, 625][row], mk(pet, i + 1, (row % 2) as Team), ps(t), row < 2 ? 30 : 40);
  }
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
    const pet: PetType = rng() < 0.62 ? 'ant' : 'frog';
    const level = 1 + Math.floor(rng() ** 1.5 * 7);
    const armed = rng() < 0.5;
    const l = mk(pet, level, team, {
      weapon: armed ? WEAPONS[Math.floor(rng() * 4)] : null,
      weaponLevel: armed ? 1 + Math.floor(rng() * 7) : 0,
      helmet: rng() < 0.2 ? 1 + Math.floor(rng() * 7) : 0,
      sneakers: rng() < 0.15 ? 1 + Math.floor(rng() * 7) : 0,
      chili: rng() < 0.15 ? 1 + Math.floor(rng() * 7) : 0,
      seed: i,
    });
    const y = team ? 34 + rng() * (h * 0.5 - 30) : h * 0.5 + 8 + rng() * (h * 0.5 - 20);
    out.push({ l, x: 26 + rng() * (w - 52), y, face: rng() < 0.5 ? 1 : -1, kind: Math.floor(rng() * 10) });
  }
  return out.sort((a, b) => a.y - b.y);
}
function drawArmy(ctx: Ctx, units: Unit[], t: number, plain: boolean) {
  const poses = units.map((u, i) => {
    const p = ps(t, { face: u.face, aimY: u.l.team ? 0.6 : -0.6 });
    act(p, t, i, u.l.pet === 'frog');
    if (!plain) {
      if (u.kind === 7) p.hurt = 0.8;
      else if (u.kind === 8) p.mood = 'angry';
      else if (u.kind === 9 && i % 3 === 0) p.puff = 0.9;
    }
    return p;
  });
  units.forEach((u, i) => {
    ctx.save();
    ctx.translate(u.x, u.y);
    petArt.drawShadow(ctx, u.l, radius(u.l.pet, u.l.level), poses[i].hop);
    ctx.restore();
  });
  units.forEach((u, i) => {
    ctx.save();
    ctx.translate(u.x, u.y);
    petArt.drawPet(ctx, u.l, poses[i], radius(u.l.pet, u.l.level));
    ctx.restore();
  });
}

function gear(ctx: Ctx, t: number) {
  (['ant', 'frog'] as PetType[]).forEach((pet, row) => {
    const r = pet === 'ant' ? 30 : 36;
    WEAPONS.forEach((w, i) => {
      const lv = [2, 4, 5, 7][i];
      const base = { weapon: w, weaponLevel: lv };
      const y = 150 + row * 175;
      put(ctx, 70 + i * 240, y, mk(pet, 3, 0, base), ps(t), r, `${w} ${CLASSES[lv - 1]}`);
      put(ctx, 175 + i * 240, y, mk(pet, 3, 1, base), ps(t, { strike: w === 'bat' ? 0.95 : 0.8 }), r, 'strike');
    });
    const y = 520 + row * 170;
    const worn: [string, Partial<PetLook>][] = [
      ['helmet E', { helmet: 1 }],
      ['helmet B', { helmet: 4 }],
      ['helmet SSS', { helmet: 7 }],
      ['sneakers C', { sneakers: 3 }],
      ['sneakers SSS', { sneakers: 7 }],
      ['chili C', { chili: 3 }],
      ['chili SSS', { chili: 7 }],
      ['all', { helmet: 6, sneakers: 5, chili: 5, weapon: 'spear', weaponLevel: 6 }],
    ];
    worn.forEach(([cap, o], i) => put(ctx, 65 + i * 125, y, mk(pet, 2, (i % 2) as Team, o), ps(t, { walk: 8, moving: i === 3 || i === 4 ? 1 : 0 }), r, cap));
  });
}

function poses(ctx: Ctx, t: number) {
  (['ant', 'frog'] as PetType[]).forEach((pet, half) => {
    const r = pet === 'ant' ? 20 : 24;
    const x0 = half * 500;
    const l = mk(pet, 3, half as Team);
    const bat = mk(pet, 3, half as Team, { weapon: 'bat', weaponLevel: 3 });
    const row = (y: number, cells: [string, PetLook, Partial<PetPose>][]) => {
      const step = 500 / cells.length;
      cells.forEach(([cap, lk, o], i) => put(ctx, x0 + step * (i + 0.5), y, lk, ps(t, o), r, cap));
    };
    const move: [string, PetLook, Partial<PetPose>][] =
      pet === 'ant'
        ? [0, 9, 18, 27].map((d, i) => [`walk ${i}`, l, { walk: d, moving: 1 }])
        : [0.12, 0.5, 1, 0.12].map((h, i) => [`hop ${h}`, l, { hop: h, moving: 1, walk: i * 9 }]);
    row(95, [...move, ['wind', bat, { wind: 1 }], ['strike 1', bat, { strike: 1 }], ['strike .6', bat, { strike: 0.6 }], ['hurt', l, { hurt: 1 }]]);
    row(220, [
      ['idle', l, {}],
      ['angry', l, { mood: 'angry' }],
      ['hurt', l, { mood: 'hurt' }],
      ['dizzy', l, { mood: 'dizzy' }],
      ['cheer', l, { mood: 'cheer' }],
      ['scared', l, { mood: 'scared' }],
      ['dead', l, { mood: 'dead' }],
      [pet === 'ant' ? 'bite' : 'tongue', l, pet === 'ant' ? { wind: 1 } : { strike: 0.9 }],
    ]);
    row(390, [
      ['flat', l, { squashX: 1.8, squashY: 0.2 }],
      ['squash', l, { squashX: 1.3, squashY: 0.6 }],
      ['puff .5', l, { puff: 0.5 }],
      ['puff 1', l, { puff: 1 }],
      ['puff 1.5', l, { puff: 1.5 }],
    ]);
    row(520, [
      ['spin 1', l, { spin: 1, hop: 0.4 }],
      ['spin 3', l, { spin: 3, hop: 0.4 }],
      ['stone .5', l, { stone: 0.5 }],
      ['stone 1', bat, { stone: 1 }],
      ['limp .5', l, { limp: 0.5 }],
      ['limp 1', l, { limp: 1 }],
      [pet === 'ant' ? 'snap' : 'wind', l, pet === 'ant' ? { strike: 1 } : { wind: 1 }],
    ]);
  });
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

/** Big fighters going through their moves in real time, to watch the small things (blinks, feelers, throats). */
function live(ctx: Ctx, t: number) {
  const cast: [PetLook, number, number][] = [
    [mk('ant', 1, 0), 110, 0],
    [mk('ant', 5, 1, { weapon: 'spear', weaponLevel: 5 }), 330, 1],
    [mk('frog', 3, 0), 110, 2],
    [mk('frog', 7, 1, { weapon: 'bat', weaponLevel: 7, chili: 6 }), 330, 3],
  ];
  cast.forEach(([l, x, i]) => {
    const p = ps(t + i * 0.9, { face: i % 2 ? -1 : 1, aimY: i % 2 ? 0.5 : -0.5 });
    const c = ((t * 0.25 + i * 0.3) % 1) * 4;
    if (c < 1.6) {
      p.walk = t * 40;
      p.moving = 1;
      if (l.pet === 'frog') p.hop = Math.max(0, Math.sin(((t * 1.6) % 1) * Math.PI));
    } else if (c > 2.4 && c < 3.2) act(p, t, i, l.pet === 'frog');
    put(ctx, x + (c < 1.6 ? Math.sin(c * 2) * 20 : 0), i < 2 ? 190 : 400, l, p, l.pet === 'ant' ? 40 : 46);
  });
}

function pitch(ctx: Ctx, w: number, h: number) {
  for (let y = 0; y < h; y += 40) {
    ctx.fillStyle = PITCH[(y / 40) % 2];
    ctx.fillRect(0, y, w, 40);
  }
}

const sheet = param('sheet', 'lineup');
const SIZE: Record<string, [number, number, string]> = {
  lineup: [1000, 640, SLATE],
  battle: [460, 520, PITCH[0]],
  gear: [1000, 720, SLATE],
  poses: [1000, 560, SLATE],
  items: [720, 480, SLATE],
  perf: [460, 820, PITCH[0]],
  live: [460, 520, PITCH[0]],
};
const [w, h, bg] = SIZE[sheet] ?? SIZE.lineup;
const fighters = sheet === 'battle' ? army(50, w, h, 11) : sheet === 'perf' ? army(200, w, h, 5) : [];
let frames = 0;
let total = 0;
void stage({
  w,
  h,
  bg,
  draw(ctx, t) {
    if (sheet === 'battle' || sheet === 'perf' || sheet === 'live') pitch(ctx, w, h);
    if (sheet === 'battle') drawArmy(ctx, fighters, t, false);
    else if (sheet === 'live') live(ctx, t);
    else if (sheet === 'gear') gear(ctx, t);
    else if (sheet === 'poses') poses(ctx, t);
    else if (sheet === 'items') items(ctx, t);
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
