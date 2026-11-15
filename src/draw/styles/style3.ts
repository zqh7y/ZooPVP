import type { ArtStyle, ItemType, PetOpts, Pose, SamplePet } from './api';
import type { Team, WeaponType } from '../../types';
import { TEAM } from '../../theme';
import { K, TAU, ell, flat, frame, ink, inkCurve, limb, mix, pathPart, sticker, tone } from './style3-kit';
import type { Ctx, Tone } from './style3-kit';
import { ITEM_ART, bat, helmet, knife, shield, spear } from './style3-items';

/*
 * Style sample 3, "Bold Sticker": punchy cel-shaded pets cut out like die-cut stickers. Each pet is one chunky
 * silhouette with a thick team-tinted outline, a hard shadow band, a crisp rim light on the shadow side and a
 * glossy highlight, wrapped in a white sticker border with a soft drop shadow. Weapons and gear are part of the
 * same sticker. Everything is drawn facing right in units of the pet's radius, feet on the origin.
 */

interface Pal {
  body: Tone;
  limb: string;
  limbHi: string;
  far: string;
  belly: Tone;
  ink: string;
  spot: string;
  lid: string;
}

function makePal(team: Team): Pal {
  const T = TEAM[team];
  const ink = mix(T.dark, '#070b18', 0.74);
  return {
    body: tone(T.main, mix(T.dark, T.main, 0.12), mix(T.light, '#ffffff', 0.35)),
    limb: mix(T.dark, T.main, 0.3),
    limbHi: mix(T.light, T.main, 0.4),
    far: mix(T.dark, ink, 0.35),
    belly: tone(mix(T.light, '#fffbea', 0.62), mix(T.light, T.main, 0.3), '#ffffff'),
    ink,
    spot: mix(T.dark, T.main, 0.35),
    lid: T.main,
  };
}
const PALS = [makePal(0), makePal(1)];

const WEAPONS: Record<WeaponType, (c: Ctx) => void> = { knife, bat, spear, shield };

// ------------------------------------------------------------------ pose

interface St {
  pose: Pose;
  blink: boolean;
  w: WeaponType | null;
  helm: boolean;
}

/** Where the hand is and how the weapon is turned, per pet and pose (pet units, facing right). */
function grip(pet: SamplePet, s: St): [number, number, number] {
  const ant = pet === 'ant';
  const w = s.w;
  if (s.pose === 'attack') {
    if (w === 'shield') return ant ? [1.08, -0.9, 0.12] : [1.1, -0.56, 0.12];
    if (w === 'spear') return ant ? [0.5, -0.98, 1.54] : [0.6, -0.62, 1.54];
    if (w === 'bat') return ant ? [0.98, -1.1, 1.1] : [1.04, -0.76, 1.1];
    return ant ? [1.04, -1.0, 1.6] : [1.1, -0.68, 1.6];
  }
  if (s.pose === 'hit') {
    if (w === 'shield') return ant ? [0.84, -0.86, -0.2] : [0.88, -0.5, -0.2];
    if (w === 'spear') return ant ? [0.8, -0.9, 1.05] : [0.86, -0.52, 1.05];
    return ant ? [0.82, -0.9, 1.25] : [0.9, -0.52, 1.25];
  }
  if (w === 'shield') return ant ? [0.92, -0.84, 0] : [0.94, -0.5, 0];
  if (w === 'spear') return ant ? [0.92, -0.92, 0.14] : [1.0, -0.56, 0.14];
  return ant ? [0.98, -0.92, 0.42] : [1.04, -0.56, 0.42];
}

function weapon(c: Ctx, s: St, g: [number, number, number], scale: number) {
  if (!s.w) return;
  const fn = WEAPONS[s.w];
  if (s.w === 'shield') frame(c, g[0], g[1], g[2], scale * 0.8, fn);
  else frame(c, g[0], g[1], g[2], scale, fn);
}

/** The white whoosh of a swing (a comet tail along the tip's arc) or the speed lines of a thrust; painted only. */
function smear(c: Ctx, s: St, g: [number, number, number], len: number) {
  if (K.sil || s.pose !== 'attack' || !s.w || s.w === 'shield' || !K.lod) return;
  c.save();
  c.translate(g[0], g[1]);
  if (s.w === 'spear') {
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 0.07;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const y = -0.2 + i * 0.2;
      c.moveTo(-0.5 - i * 0.14, y);
      c.lineTo(-0.95 - i * 0.14, y);
    }
    c.stroke();
  } else {
    const a1 = g[2] - Math.PI / 2;
    const a0 = a1 - 1.5;
    const n = 8;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n;
      const k = len - 0.38 * len * Math.pow(i / n, 1.4);
      c.lineTo(Math.cos(a) * k, Math.sin(a) * k);
    }
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ eyes

/**
 * An eye: a white oval, a big pupil looking forward with two glints, and a lid cutting the top (aL / aR: how
 * far down the lid comes at the eye's left and right, 0 = none, 1 = to the middle).
 */
function eye(c: Ctx, x: number, y: number, rx: number, ry: number, P: Pal, s: St, aL: number, aR: number, look: number, chev: 1 | -1) {
  if (s.pose === 'hit') {
    // a squint: a fat chevron
    const w = Math.max(K.lw * 1.25, rx * 0.34);
    ink(c, [x - rx * 0.62 * chev, y - ry * 0.55, x + rx * 0.62 * chev, y, x - rx * 0.62 * chev, y + ry * 0.55], w);
    return;
  }
  if (s.blink) {
    inkCurve(c, x - rx, y + ry * 0.05, x, y + ry * 0.55, x + rx, y + ry * 0.05, Math.max(K.lw * 1.1, rx * 0.26));
    return;
  }
  flat(c, x, y, rx, ry, 0, '#ffffff', 0.85);
  const px = x + look * rx * 0.3;
  const py = y + ry * 0.06;
  c.beginPath();
  c.ellipse(px, py, rx * 0.6, ry * 0.62, 0, 0, TAU);
  c.fillStyle = P.ink;
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(px - rx * 0.2, py - ry * 0.24, rx * 0.24, 0, TAU);
  c.fill();
  if (K.lod) {
    c.beginPath();
    c.arc(px + rx * 0.22, py + ry * 0.24, rx * 0.1, 0, TAU);
    c.fill();
  }
  // the lid: a chord across the top, in the body colour, with a thick ink edge
  if (aL > 0 || aR > 0) {
    const t0 = Math.PI + Math.asin(Math.min(1, 1 - aL)) * 1;
    const t1 = TAU - Math.asin(Math.min(1, 1 - aR));
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, t0 - (Math.PI / 2) * 0, t1);
    c.closePath();
    c.fillStyle = P.lid;
    c.fill();
    c.lineWidth = K.lw * 1.15;
    c.strokeStyle = P.ink;
    c.stroke();
  }
}

// ------------------------------------------------------------------ the ant

const LEG = 0.2;
/** The ant is drawn LIFT lower than its coordinates say (short legs); its feet sit at FY. */
const LIFT = 0.14;
const FY = -0.04 - LIFT;

/** A little round boot at the end of a leg. */
function boot(c: Ctx, x: number, y: number, P: Pal) {
  flat(c, x + 0.03, y - 0.03, 0.1, 0.065, 0, P.far, 0.8);
}

/** Points along a quadratic curve, for limbs that bend smoothly. */
function bend(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): number[] {
  const p: number[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const u = 1 - t;
    p.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
  }
  return p;
}

let PINCER = '#000';
function pincerPath(c: Ctx) {
  c.moveTo(-0.02, -0.07);
  c.quadraticCurveTo(0.2, -0.08, 0.25, 0.14);
  c.quadraticCurveTo(0.13, 0.04, -0.02, 0.07);
  c.closePath();
}
/** A mandible: a little curved pincer. */
function pincer(c: Ctx) {
  pathPart(c, pincerPath, PINCER);
}

function ant(c: Ctx, P: Pal, s: St) {
  c.save();
  c.translate(0, LIFT);
  antBody(c, P, s);
  c.restore();
}

function antBody(c: Ctx, P: Pal, s: St) {
  PINCER = P.limb;
  const atk = s.pose === 'attack';
  const hit = s.pose === 'hit';
  const g = grip('ant', s);
  const sway = atk ? -0.12 : hit ? 0.14 : 0;
  const bite = atk && !s.w;
  const arm = !!s.w && s.w !== 'shield';
  const hx = 0.48;
  const hy = -1.56;

  // the far leg (only when the near front leg is busy), the far arm and the far antenna, in the body's shadow
  if (s.w) limb(c, [0.18, -0.86, 0.5, -0.62, 0.58, FY], LEG, P.far);
  if (arm) limb(c, [0.2, -1.0, 0.56, -0.8, g[0] + 0.05, g[1] - 0.1], LEG * 0.9, P.far);
  if (s.helm) {
    // under a helmet the antennae poke out in front of it
    limb(c, bend(0.66, -2.1, 0.74 + sway, -2.46, 0.96 + sway * 1.5, -2.56), 0.085, P.far);
    flat(c, 0.96 + sway * 1.5, -2.56, 0.095, 0.095, 0, P.far, 1);
  } else {
    limb(c, bend(0.38, -2.06, 0.26 + sway, -2.5, 0.02 + sway * 1.5, -2.42), 0.085, P.far);
    flat(c, 0.02 + sway * 1.5, -2.42, 0.095, 0.095, 0, P.far, 1);
  }

  // gaster with its bands, the waist, the thorax
  ell(c, -0.7, -0.8, 0.55, 0.46, -0.3, P.body);
  if (!K.sil) {
    c.save();
    c.beginPath();
    c.ellipse(-0.7, -0.8, 0.55 - K.lw * 0.5, 0.46 - K.lw * 0.5, -0.3, 0, TAU);
    c.clip();
    c.lineWidth = 0.08;
    c.strokeStyle = P.body.shade;
    c.beginPath();
    c.ellipse(-1.03, -0.68, 0.36, 0.62, -0.3, -1.3, 1.3);
    c.stroke();
    c.beginPath();
    c.ellipse(-1.27, -0.6, 0.36, 0.62, -0.3, -1.3, 1.3);
    c.stroke();
    c.restore();
  }
  ell(c, -0.17, -0.92, 0.11, 0.1, 0, P.body, 0);
  ell(c, 0.05, -1.0, 0.28, 0.23, -0.5, P.body, 0.6);

  // near legs (the front one is the arm when it holds something), with little boots
  limb(c, [-0.02, -0.88, -0.36, -0.66, -0.46, FY], LEG, P.limb, P.limbHi);
  limb(c, [0.06, -0.86, 0.14, -0.56, 0.02, FY], LEG, P.limb, P.limbHi);
  if (!s.w) limb(c, [0.14, -0.9, 0.46, -0.7, 0.48, FY], LEG, P.limb, P.limbHi);
  else if (s.w === 'shield') limb(c, [0.14, -0.9, 0.5, -0.74, g[0], g[1] + 0.05], LEG, P.limb);
  if (!K.sil) {
    boot(c, -0.46, FY, P);
    boot(c, 0.02, FY, P);
    boot(c, s.w ? 0.58 : 0.48, FY, P);
  }

  // head
  ell(c, hx, hy, 0.62, 0.6, 0, P.body);

  // mandibles: two little curved pincers under the face
  const mo = bite ? 0.55 : hit ? -0.1 : 0;
  frame(c, 0.9, -1.26, -0.3 - mo, 0.9, pincer);
  frame(c, 0.8, -1.1, 0.12 + mo * 0.6, 1.05, pincer);

  if (!K.sil) {
    // face: two big eyes in three-quarter view, a little mouth
    const lid = atk ? 0.6 : 0.3;
    eye(c, 0.36, -1.6, 0.21, 0.27, P, s, atk ? 0.3 : lid, atk ? lid + 0.3 : lid, 1, 1);
    eye(c, 0.8, -1.58, 0.15, 0.25, P, s, atk ? lid + 0.3 : lid, atk ? 0.3 : lid, 1, -1);
    if (atk) {
      c.beginPath();
      c.moveTo(0.5, -1.27);
      c.quadraticCurveTo(0.62, -1.3, 0.76, -1.26);
      c.quadraticCurveTo(0.66, -1.08, 0.5, -1.27);
      c.closePath();
      c.fillStyle = '#7a1630';
      c.fill();
      c.lineWidth = K.lw * 0.9;
      c.strokeStyle = P.ink;
      c.stroke();
    } else if (hit) {
      ink(c, [0.5, -1.22, 0.56, -1.27, 0.62, -1.21, 0.68, -1.27, 0.74, -1.22], K.lw * 0.95);
    } else {
      inkCurve(c, 0.52, -1.27, 0.62, -1.18, 0.74, -1.3, K.lw);
    }
  }

  // helmet, then the near antenna through it
  if (s.helm) frame(c, hx - 0.02, hy - 0.1, -0.08, 0.6, helmet);
  const an = s.helm ? [0.84, -2.04, 1.0 + sway, -2.36, 1.24 + sway * 2, -2.32] : [0.66, -2.04, 0.72 + sway, -2.52, 1.02 + sway * 2, -2.4];
  limb(c, bend(an[0], an[1], an[2], an[3], an[4], an[5]), 0.1, P.limb);
  ell(c, an[4] + 0.01, an[5], 0.12, 0.12, 0, P.body, 0.6);

  // the weapon, held in the near front leg
  smear(c, s, g, s.w === 'bat' ? 1.35 : 1.0);
  weapon(c, s, g, 1.0);
  if (arm) {
    limb(c, [0.16, -0.98, 0.52, -0.7, g[0], g[1]], LEG, P.limb, P.limbHi);
    ell(c, g[0], g[1], 0.12, 0.12, 0, P.body, 0);
  }
}

// ------------------------------------------------------------------ the frog

function frog(c: Ctx, P: Pal, s: St) {
  const atk = s.pose === 'attack';
  const hit = s.pose === 'hit';
  const g = grip('frog', s);
  const lash = atk && !s.w;
  const arm = !!s.w && s.w !== 'shield';

  // far arm, behind the body
  if (arm) limb(c, [0.42, -0.62, 0.74, -0.52, g[0] + 0.05, g[1] - 0.08], 0.19, P.far);
  else limb(c, [0.42, -0.62, 0.64, -0.36, 0.66, -0.04], 0.19, P.far);

  // body
  ell(c, 0.02, -0.8, 0.92, 0.72, -0.06, P.body);
  // pale throat
  ell(c, 0.5, -0.6, 0.4, 0.3, -0.5, P.belly, 0.4);
  if (!K.sil) {
    // back spots
    c.fillStyle = P.spot;
    c.beginPath();
    c.ellipse(-0.42, -1.12, 0.12, 0.09, -0.4, 0, TAU);
    c.moveTo(-0.08 + 0.08, -1.32);
    c.ellipse(-0.08, -1.32, 0.08, 0.06, -0.2, 0, TAU);
    c.moveTo(-0.7 + 0.07, -0.86);
    c.ellipse(-0.7, -0.86, 0.07, 0.06, 0, 0, TAU);
    c.fill();
  }

  // chunky back leg: a long webbed foot and the big thigh
  ell(c, -0.26, -0.08, 0.5, 0.11, 0, tone(P.limb, mix(P.limb, P.ink, 0.3), P.limbHi), 0);
  for (let i = 0; i < 3; i++) flat(c, 0.2 + i * 0.08, -0.07 + i * 0.012, 0.065, 0.06, 0, P.limb, 0.8);
  ell(c, -0.5, -0.46, 0.5, 0.38, -0.5, P.body);

  if (s.helm) frame(c, 0.1, -1.26, -0.32, 0.4, helmet);

  // eye domes on top of the head
  ell(c, 0.26, -1.4, 0.26, 0.26, 0, P.body, 0.45);
  ell(c, 0.7, -1.34, 0.3, 0.3, 0, P.body, 0.45);

  if (!K.sil) {
    const lid = atk ? 0.55 : 0.42;
    eye(c, 0.28, -1.44, 0.16, 0.17, P, s, atk ? 0.3 : lid, atk ? lid + 0.2 : lid, 1, 1);
    eye(c, 0.73, -1.39, 0.2, 0.21, P, s, atk ? lid + 0.2 : lid, atk ? 0.3 : lid, 1, -1);
    // the wide mouth
    if (lash || atk) {
      c.beginPath();
      c.moveTo(0.92, -1.02);
      c.quadraticCurveTo(0.62, -1.06, 0.3, -0.98);
      c.quadraticCurveTo(0.62, -0.64, 0.93, -0.82);
      c.closePath();
      c.fillStyle = '#7a1630';
      c.fill();
      c.lineWidth = K.lw;
      c.strokeStyle = P.ink;
      c.stroke();
    } else if (hit) {
      ink(c, [0.88, -0.98, 0.76, -0.9, 0.64, -0.97, 0.52, -0.9, 0.4, -0.95], K.lw * 1.05);
    } else {
      inkCurve(c, 0.92, -1.02, 0.62, -0.76, 0.28, -0.98, K.lw * 1.15);
      ink(c, [0.28, -0.98, 0.22, -1.05], K.lw * 1.15);
    }
    // a blush under the near eye
    if (K.lod) {
      c.beginPath();
      c.ellipse(0.72, -1.05, 0.1, 0.05, 0, 0, TAU);
      c.fillStyle = 'rgba(255, 120, 150, 0.5)';
      c.fill();
    }
  }
  if (lash) {
    // the tongue: one fat lash forward
    limb(c, [0.66, -0.86, 1.06, -0.94, 1.4, -0.9], 0.14, '#ff7aa8');
    ell(c, 1.42, -0.9, 0.14, 0.13, 0, tone('#ff7aa8', '#e04a82', '#ffd0e0'), 0.7);
  }

  // near arm and the weapon
  smear(c, s, g, s.w === 'bat' ? 1.35 : 1.0);
  weapon(c, s, g, 0.95);
  if (arm) {
    limb(c, [0.46, -0.56, 0.78, -0.42, g[0], g[1]], 0.2, P.body.base, P.limbHi);
    ell(c, g[0], g[1], 0.13, 0.13, 0, P.body, 0);
  } else if (!s.w) {
    limb(c, bend(0.5, -0.62, 0.86, -0.52, 0.8, -0.1), 0.22, P.body.base, P.limbHi);
    for (let i = 0; i < 3; i++) flat(c, 0.72 + i * 0.1, -0.06, 0.07, 0.06, 0, P.body.base, 0.8);
  }
}

// ------------------------------------------------------------------ painting (slow, done once per picture)

/** Paints a pet facing right with its feet on (0, 0), sticker border and all: the art of one cached picture. */
function paintPet(ctx: Ctx, type: SamplePet, team: Team, r: number, pose: Pose, blink: boolean, o: PetOpts | undefined, f: 1 | -1) {
  const P = PALS[team];
  const s: St = { pose, blink, w: o?.weapon ?? null, helm: !!o?.helmet };
  let dx = 0;
  let dy = 0;
  let lean = 0;
  let sx = 1;
  let sy = 1;
  if (pose === 'attack') {
    dx = 0.24;
    lean = 0.2;
    sx = 1.05;
    sy = 0.95;
  } else if (pose === 'hit') {
    dx = -0.18;
    dy = -0.06;
    lean = -0.22;
    sx = 0.95;
    sy = 1.04;
  }
  const ol = Math.max(1.6, r * 0.085);
  const b = Math.max(2, r * 0.11);
  // the ground shadow
  ctx.fillStyle = 'rgba(30, 60, 40, 0.22)';
  ctx.beginPath();
  ctx.ellipse(dx * 0.5 * r * f, r * 0.02, r * (type === 'frog' ? 1.0 : 1.05), r * 0.2, 0, 0, TAU);
  ctx.fill();
  K.ink = P.ink;
  K.lod = r >= 22 ? 1 : 0;
  const geom = (c: Ctx) => {
    c.save();
    c.translate(dx * r * f, dy * r);
    c.scale(f * r * sx, r * sy);
    c.rotate(lean);
    K.lw = ol / r;
    // the key light stays at the upper left of the screen, whichever way the pet faces
    const cs = Math.cos(lean);
    const sn = Math.sin(lean);
    const lx = -0.6 * f;
    K.lx = lx * cs - 0.8 * sn;
    K.ly = -lx * sn - 0.8 * cs;
    if (type === 'ant') ant(c, P, s);
    else frog(c, P, s);
    c.restore();
  };
  sticker(ctx, geom, b, ol, b * 0.85, r >= 22);
}

function paintItem(ctx: Ctx, type: ItemType, size: number) {
  const fit = ITEM_FIT[type];
  const s = size / fit[3];
  const ol = Math.max(1.6, size * 0.05);
  const b = Math.max(2, size * 0.07);
  K.ink = '#1b2133';
  K.lod = size >= 40 ? 1 : 0;
  sticker(
    ctx,
    (c) => {
      K.lx = -0.6;
      K.ly = -0.8;
      K.lw = 1;
      frame(c, 0, 0, fit[2], s, (cc) => {
        K.lw = ol / s;
        cc.translate(-fit[0], -fit[1]);
        ITEM_ART[type](cc);
      });
    },
    b,
    ol,
    b * 0.75,
    true,
  );
}

// ------------------------------------------------------------------ the picture cache (fast, every frame)

/*
 * Every look a pet can have (type, team, facing, weapon, helmet, and idle / blink / attack / hit) is painted once
 * into its own small canvas at the screen's pixel density, cropped to its ink, and then only stamped on whole
 * device pixels: one plain drawImage per fighter, the cheapest thing a canvas does. Breathing is a small rise
 * and fall of the stamp.
 */
interface Pic {
  cv: HTMLCanvasElement;
  /** where the picture's top left sits, and its size, in logical px relative to the anchor */
  x: number;
  y: number;
  w: number;
  h: number;
}
const PICS = new Map<string, Pic>();
const MAX_PICS = 400;

/** How far ahead of the ground point (in pet radii) each weapon can reach, lunge included. */
const REACH: Record<WeaponType | 'none', number> = { none: 2.0, knife: 2.5, bat: 2.75, spear: 2.7, shield: 2.05 };

function picture(key: string, x0: number, y0: number, x1: number, y1: number, q: number, paint: (c: Ctx) => void): Pic {
  let p = PICS.get(key);
  if (p) {
    // keep it fresh in the LRU order
    PICS.delete(key);
    PICS.set(key, p);
    return p;
  }
  const pw = Math.max(1, Math.ceil((x1 - x0) * q));
  const ph = Math.max(1, Math.ceil((y1 - y0) * q));
  const big = document.createElement('canvas');
  big.width = pw;
  big.height = ph;
  const c = big.getContext('2d', { willReadFrequently: true })!;
  c.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
  paint(c);
  // crop to what was painted (once per picture, so the stamp moves as few pixels as possible)
  const a = c.getImageData(0, 0, pw, ph).data;
  let minX = pw;
  let minY = ph;
  let maxX = -1;
  let maxY = -1;
  for (let yy = 0; yy < ph; yy++) {
    const row = yy * pw * 4 + 3;
    for (let xx = 0; xx < pw; xx++) {
      if (a[row + xx * 4] > 2) {
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        maxY = yy;
      }
    }
  }
  if (maxX < 0) {
    minX = minY = 0;
    maxX = maxY = 0;
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  cv.getContext('2d')!.drawImage(big, minX, minY, cw, ch, 0, 0, cw, ch);
  p = { cv, x: x0 + minX / q, y: y0 + minY / q, w: cw / q, h: ch / q };
  PICS.set(key, p);
  if (PICS.size > MAX_PICS) PICS.delete(PICS.keys().next().value as string);
  return p;
}

/** Stamps a picture with its anchor at (x, y), snapped to whole device pixels when the context only scales. */
function stamp(ctx: Ctx, p: Pic, x: number, y: number) {
  const m = ctx.getTransform();
  if (m.b === 0 && m.c === 0 && m.a > 0 && m.d > 0) {
    const dx = Math.round((x + p.x) * m.a + m.e);
    const dy = Math.round((y + p.y) * m.d + m.f);
    ctx.drawImage(p.cv, (dx - m.e) / m.a, (dy - m.f) / m.d, p.w, p.h);
  } else ctx.drawImage(p.cv, x + p.x, y + p.y, p.w, p.h);
}

/** The pixel density the context draws at (its transform's scale). */
function density(ctx: Ctx) {
  const m = ctx.getTransform();
  return Math.max(0.5, Math.round(Math.hypot(m.a, m.b) * 1000) / 1000);
}

// ------------------------------------------------------------------ the style

export const style3: ArtStyle = {
  NAME: 'Bold Sticker',
  BLURB: 'die-cut cel-shaded stickers: chunky ink, hard shadow, rim light, gloss',

  drawPet(ctx, type, team, x, y, r, pose, t, o?: PetOpts) {
    const f = o?.face ?? 1;
    const idle = pose === 'idle';
    const blink = idle && (t + 0.4) % 3.3 < 0.14;
    const w = o?.weapon ?? null;
    const q = density(ctx);
    // radii come in half-pixel steps, so a pet that grows a little reuses its pictures
    const rq = Math.max(1, Math.round(r * 2) / 2);
    const key = `${type}${team}${f}${idle ? (blink ? 'b' : 'i') : pose}${w}${o?.helmet ? 1 : 0}|${rq}|${q}`;
    const reach = REACH[w ?? 'none'] + 0.4;
    const x0 = f > 0 ? -1.9 : -reach;
    const x1 = f > 0 ? reach : 1.9;
    const pic = picture(key, x0 * rq, -3.2 * rq, x1 * rq, 0.5 * rq, q, (c) => paintPet(c, type, team, rq, pose, blink, o, f));
    // the breath: a slow rise and fall
    const bob = idle ? (Math.sin(t * TAU * 0.8) * 0.5 + 0.5) * 0.05 * r : 0;
    if (rq === r) stamp(ctx, pic, x, y - bob);
    else {
      const k = r / rq;
      ctx.drawImage(pic.cv, x + pic.x * k, y - bob + pic.y * k, pic.w * k, pic.h * k);
    }
  },

  drawItem(ctx, type, x, y, size) {
    const q = density(ctx);
    const h = size * 0.68;
    stamp(ctx, picture(`item${type}|${size}|${q}`, -h, -h, h, h, q, (c) => paintItem(c, type, size)), x, y);
  },
};

/** Per item: its centre (item units), turn, and the span (item units) that fits the box. */
const ITEM_FIT: Record<ItemType, [number, number, number, number]> = {
  knife: [0, -0.33, 0.72, 1.32],
  bat: [0, -0.56, 0.72, 1.55],
  spear: [0, -0.5, 0.75, 1.82],
  shield: [0, 0.03, 0, 1.45],
  helmet: [-0.1, -0.55, 0.06, 2.75],
  sneakers: [0, -0.1, -0.06, 1.48],
  chili: [0, 0.08, 0.1, 1.3],
};

