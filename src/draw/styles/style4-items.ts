import type { ItemType } from './api';
import { crayon, dot, ell, hatch, INK, line, path, pencil, spline, strokes, TAU, type Ctx, type Pts } from './style4-pencil';

/*
 * Style 4's things: the weapons, the helmet, the sneakers and the chili, as pencil-and-crayon drawings.
 * A weapon is drawn in its own space: the grip at (0, 0), pointing up (-y), L long. begin() is called by the
 * caller (the pet, or drawItem).
 */

const STEEL = '#c9d2de';
const STEEL_DARK = '#8b95a3';
const WOOD = '#c58447';
const WOOD_LIGHT = '#e6b373';
const WOOD_DARK = '#8a5a2e';
const GOLD = '#ffc21a';
const WHITE = '#fffdf6';

/** a closed shape from control points given in units of L */
const shape = (c: number[], L: number, seg = 5): Pts => spline(c.map((v) => v * L), true, seg);

function knife(g: Ctx, L: number) {
  const blade = shape([-0.07, -0.12, -0.075, -0.5, -0.05, -0.76, 0, -0.9, 0.07, -0.72, 0.11, -0.45, 0.09, -0.12], L);
  crayon(g, blade, STEEL);
  hatch(g, blade, { from: 0.15, alpha: 0.45 });
  strokes(g, -0.02 * L, -0.48 * L, 0.03 * L, 0.32 * L, Math.PI * 0.62, Math.PI * 1.32, WHITE, L * 0.045, 1);
  pencil(g, blade, true);
  line(g, [0.01 * L, -0.16 * L, 0.0, -0.45 * L, -0.02 * L, -0.66 * L], { passes: 1, w: 0.6, alpha: 0.6 });
  const guard = ell(0.01 * L, -0.11 * L, 0.17 * L, 0.05 * L, 0, 18);
  crayon(g, guard, STEEL_DARK);
  pencil(g, guard, true, { passes: 1 });
  const grip = shape([-0.06, -0.08, -0.07, 0.12, -0.05, 0.25, 0.05, 0.25, 0.07, 0.12, 0.06, -0.08], L, 4);
  crayon(g, grip, WOOD);
  hatch(g, grip, { from: 0.0, alpha: 0.4 });
  pencil(g, grip, true);
  dot(g, 0, 0.12 * L, 0.025 * L, WOOD_DARK, false);
}

function bat(g: Ctx, L: number) {
  const body = shape([-0.04, 0.18, -0.045, -0.12, -0.085, -0.45, -0.11, -0.75, -0.08, -0.93, 0, -0.97, 0.08, -0.93, 0.11, -0.75, 0.085, -0.45, 0.045, -0.12, 0.04, 0.18], L);
  crayon(g, body, WOOD_LIGHT);
  hatch(g, body, { from: 0.05, alpha: 0.42 });
  strokes(g, -0.03 * L, -0.62 * L, 0.035 * L, 0.3 * L, Math.PI * 0.6, Math.PI * 1.25, WHITE, L * 0.05, 1);
  pencil(g, body, true);
  line(g, [0.03 * L, -0.3 * L, 0.05 * L, -0.6 * L, 0.04 * L, -0.85 * L], { passes: 1, w: 0.55, alpha: 0.55 });
  // the taped grip
  const tape = shape([-0.055, -0.1, -0.06, 0.16, 0.06, 0.16, 0.055, -0.1], L, 3);
  crayon(g, tape, '#5d5468');
  for (let i = 0; i < 4; i++) {
    const y = (-0.06 + i * 0.065) * L;
    line(g, [-0.055 * L, y + 0.02 * L, 0.055 * L, y - 0.02 * L], { passes: 1, w: 0.6, alpha: 0.7 });
  }
  pencil(g, tape, true, { passes: 1 });
  const knob = ell(0, 0.2 * L, 0.075 * L, 0.04 * L, 0, 16);
  crayon(g, knob, WOOD);
  pencil(g, knob, true, { passes: 1 });
}

function shield(g: Ctx, L: number) {
  const R = 0.46 * L;
  const rim = ell(0, 0, R, R * 1.04, 0, 40);
  crayon(g, rim, STEEL_DARK);
  const face = ell(0, 0, R * 0.8, R * 0.84, 0, 36);
  crayon(g, face, WOOD, { paper: false });
  // a bold yellow cross band, the way a kid would paint a shield
  const band = shape([-0.06, -0.37, 0.06, -0.37, 0.065, 0.37, -0.065, 0.37], L, 2);
  crayon(g, band, GOLD, { paper: false });
  const band2 = shape([-0.36, -0.06, 0.36, -0.06, 0.36, 0.065, -0.36, 0.065], L, 2);
  crayon(g, band2, GOLD, { paper: false });
  hatch(g, rim, { from: 0.2, alpha: 0.5 });
  strokes(g, 0, 0, R * 0.9, R * 0.92, Math.PI * 1.05, Math.PI * 1.45, WHITE, L * 0.045, 2, 0.1);
  pencil(g, rim, true);
  pencil(g, face, true, { passes: 1, w: 0.75 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    dot(g, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.92, 0.025 * L, INK, false);
  }
  dot(g, 0, 0, 0.11 * L, STEEL);
  strokes(g, -0.02 * L, -0.02 * L, 0.06 * L, 0.06 * L, Math.PI * 1.1, Math.PI * 1.5, WHITE, L * 0.03, 1);
}

function spear(g: Ctx, L: number) {
  const shaft = shape([-0.042, 0.38, -0.042, -0.9, 0.042, -0.9, 0.042, 0.38], L, 2);
  crayon(g, shaft, WOOD);
  hatch(g, shaft, { from: 0.0, alpha: 0.35 });
  pencil(g, shaft, true);
  const head = shape([0, -1.42, 0.11, -1.2, 0.08, -1.0, 0, -0.93, -0.08, -1.0, -0.11, -1.2], L, 5);
  crayon(g, head, STEEL);
  hatch(g, head, { from: 0.1, alpha: 0.45 });
  pencil(g, head, true);
  line(g, [0, -0.98 * L, 0, -1.3 * L], { passes: 1, w: 0.55, alpha: 0.55 });
  // a ribbon tied under the head
  const rib = shape([0, -0.9, -0.2, -0.86, -0.3, -0.74, -0.18, -0.8, -0.24, -0.66, -0.08, -0.8], L, 3);
  crayon(g, rib, GOLD);
  pencil(g, rib, true, { passes: 1, w: 0.75 });
  const wrap = shape([-0.05, -0.93, 0.05, -0.93, 0.05, -0.83, -0.05, -0.83], L, 2);
  crayon(g, wrap, '#5d5468');
  pencil(g, wrap, true, { passes: 1, w: 0.75 });
}

/** The weapon, grip at (0, 0), pointing up. swing adds the pencil smear of the attack. */
export function paintWeapon(g: Ctx, type: 'knife' | 'bat' | 'shield' | 'spear', L: number, swing: boolean) {
  if (swing) smear(g, type, L);
  if (type === 'knife') knife(g, L);
  else if (type === 'bat') bat(g, L);
  else if (type === 'shield') shield(g, L);
  else spear(g, L);
}

/** The motion it leaves: a crescent swoosh for a swing, lines for a stab or a bash. Drawn under the weapon. */
function smear(g: Ctx, type: string, L: number) {
  g.lineCap = 'round';
  if (type === 'knife' || type === 'bat') {
    // came round from behind and above (the -x side when it points up)
    const reach = (type === 'bat' ? 0.98 : 0.9) * L;
    const up = -Math.PI / 2;
    const a0 = up - 1.5;
    const a1 = up - 0.06;
    const pts: number[] = [];
    const n = 14;
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      pts.push(Math.cos(a) * reach, Math.sin(a) * reach);
    }
    for (let k = n; k >= 0; k--) {
      const a = a0 + ((a1 - a0) * k) / n;
      const rr = reach * (1 - 0.34 * Math.pow(k / n, 1.2) - 0.02);
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.globalAlpha = 0.7;
    crayon(g, pts, WHITE, { slip: 0.02, paper: false, wax: 0.7 });
    g.globalAlpha = 1;
    pencil(g, pts.slice(0, (n + 1) * 2), false, { passes: 1, w: 0.8, alpha: 0.85 });
    for (let i = 1; i < 3; i++) {
      const rr = reach * (1 - i * 0.12);
      const arc: number[] = [];
      for (let k = 0; k <= 8; k++) {
        const a = a0 + 0.45 + i * 0.12 + ((a1 - 0.1 - (a0 + 0.45 + i * 0.12)) * k) / 8;
        arc.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      pencil(g, arc, false, { passes: 1, w: 0.55, alpha: 0.6 });
    }
  } else if (type === 'spear') {
    for (const sx of [-0.16, 0.16, -0.27, 0.27]) {
      line(g, [sx * L, -0.5 * L + Math.abs(sx) * 0.6 * L, sx * L, 0.15 * L], { passes: 1, w: 0.8, alpha: 0.75 });
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const y = (i - 1) * 0.3 * L;
      line(g, [0.55 * L, y, 0.75 * L, y * 1.2], { passes: 1, w: 0.8, alpha: 0.7 });
    }
  }
}

/** The helmet: a steel pot with a brim and a yellow crest. (cx, cy) is the middle of the brim, w its width. */
export function paintHelmet(g: Ctx, cx: number, cy: number, w: number, tilt = 0) {
  g.save();
  g.translate(cx, cy);
  g.rotate(tilt);
  // the plume: a stiff brush crest from front to back
  const crest = spline([-0.34 * w, -0.32 * w, -0.3 * w, -0.6 * w, -0.06 * w, -0.78 * w, 0.22 * w, -0.72 * w, 0.36 * w, -0.48 * w, 0.22 * w, -0.44 * w, -0.02 * w, -0.52 * w, -0.22 * w, -0.4 * w], true, 5);
  crayon(g, crest, GOLD);
  hatch(g, crest, { from: 0.15, alpha: 0.4 });
  g.save();
  path(g, crest);
  g.clip();
  for (let i = 0; i < 6; i++) {
    const a = -2.7 + i * 0.3;
    line(g, [Math.cos(a) * 0.3 * w, -0.16 * w + Math.sin(a) * 0.3 * w, Math.cos(a) * 0.6 * w, -0.16 * w + Math.sin(a) * 0.6 * w], { passes: 1, w: 0.55, alpha: 0.5 });
  }
  g.restore();
  pencil(g, crest, true, { w: 0.9 });
  const dome = spline([-0.42 * w, 0, -0.4 * w, -0.26 * w, -0.22 * w, -0.46 * w, 0.04 * w, -0.52 * w, 0.28 * w, -0.42 * w, 0.42 * w, -0.18 * w, 0.43 * w, 0], true, 6);
  crayon(g, dome, STEEL);
  hatch(g, dome, { from: 0.12, alpha: 0.5 });
  strokes(g, -0.04 * w, -0.06 * w, 0.3 * w, 0.3 * w, Math.PI * 1.08, Math.PI * 1.42, WHITE, w * 0.055, 2, 0.22);
  pencil(g, dome, true);
  const brim = spline([-0.54 * w, 0.02 * w, -0.3 * w, -0.07 * w, 0.3 * w, -0.07 * w, 0.56 * w, 0.0, 0.3 * w, 0.09 * w, -0.3 * w, 0.09 * w], true, 5);
  crayon(g, brim, STEEL_DARK);
  hatch(g, brim, { from: 0.0, alpha: 0.4 });
  pencil(g, brim, true);
  for (let i = 0; i < 3; i++) dot(g, (-0.22 + i * 0.22) * w, -0.15 * w + Math.abs(i - 1) * 0.03 * w, 0.028 * w, INK, false);
  g.restore();
}

function sneaker(g: Ctx, s: number) {
  // speed lines behind it
  for (let i = 0; i < 3; i++) line(g, [-0.62 * s, (-0.08 + i * 0.12) * s, -0.44 * s, (-0.08 + i * 0.12) * s], { passes: 1, w: 0.8, alpha: 0.6 });
  const upper = spline([-0.36, 0.1, -0.38, -0.12, -0.3, -0.3, -0.1, -0.32, -0.02, -0.18, 0.12, -0.1, 0.32, -0.04, 0.44, 0.06, 0.42, 0.14].map((v) => v * s), true, 5);
  crayon(g, upper, '#3fc48a');
  hatch(g, upper, { from: 0.15, alpha: 0.45 });
  strokes(g, -0.05 * s, 0.02 * s, 0.3 * s, 0.2 * s, Math.PI * 1.1, Math.PI * 1.4, WHITE, s * 0.04, 1);
  pencil(g, upper, true);
  // stripes and laces
  line(g, [-0.24 * s, 0.06 * s, -0.12 * s, -0.14 * s], { passes: 1, w: 1.6, color: '#fffdf6', alpha: 0.9 });
  line(g, [-0.14 * s, 0.08 * s, -0.02 * s, -0.1 * s], { passes: 1, w: 1.6, color: '#fffdf6', alpha: 0.9 });
  for (let i = 0; i < 3; i++) line(g, [(-0.04 + i * 0.09) * s, (-0.16 + i * 0.03) * s, (0.02 + i * 0.09) * s, (-0.06 + i * 0.03) * s], { passes: 1, w: 0.7 });
  const sole = spline([-0.4, 0.1, 0.46, 0.1, 0.46, 0.2, 0.3, 0.24, -0.38, 0.24, -0.42, 0.17].map((v) => v * s), true, 4);
  crayon(g, sole, WHITE);
  hatch(g, sole, { from: 0.0, alpha: 0.3 });
  pencil(g, sole, true);
  const cuff = spline([-0.38, -0.3, -0.28, -0.36, -0.08, -0.36, -0.06, -0.28, -0.3, -0.26].map((v) => v * s), true, 4);
  crayon(g, cuff, GOLD);
  pencil(g, cuff, true, { passes: 1 });
}

function chili(g: Ctx, s: number) {
  // heat wiggles
  for (let i = 0; i < 3; i++) {
    const x = (-0.05 + i * 0.16) * s;
    line(g, [x, -0.22 * s, x + 0.04 * s, -0.3 * s, x - 0.02 * s, -0.38 * s, x + 0.03 * s, -0.46 * s], { passes: 1, w: 0.9, color: '#ef6a2a', alpha: 0.85 });
  }
  const body = spline([-0.3, -0.18, -0.16, -0.24, 0.0, -0.12, 0.16, 0.06, 0.34, 0.2, 0.44, 0.38, 0.3, 0.36, 0.1, 0.26, -0.14, 0.1, -0.34, -0.06].map((v) => v * s), true, 6);
  crayon(g, body, '#ef3b2c');
  hatch(g, body, { from: 0.1, alpha: 0.5 });
  strokes(g, -0.02 * s, 0.06 * s, 0.2 * s, 0.14 * s, Math.PI * 1.0, Math.PI * 1.35, '#ffd0b8', s * 0.045, 1);
  pencil(g, body, true);
  const cap = spline([-0.36, -0.08, -0.38, -0.2, -0.28, -0.28, -0.14, -0.26, -0.18, -0.16, -0.28, -0.1].map((v) => v * s), true, 4);
  crayon(g, cap, '#4caf50');
  pencil(g, cap, true, { passes: 1 });
  line(g, [-0.3 * s, -0.24 * s, -0.36 * s, -0.36 * s, -0.28 * s, -0.42 * s], { w: 1.4, color: '#2f7d32' });
}

/** An item's icon centred at (x, y) in a size box. begin() must have been called. */
export function paintItem(g: Ctx, type: ItemType, size: number) {
  if (type === 'helmet') paintHelmet(g, 0, size * 0.24, size * 0.84);
  else if (type === 'sneakers') sneaker(g, size * 0.95);
  else if (type === 'chili') chili(g, size * 1.05);
  else if (type === 'shield') paintWeapon(g, 'shield', size * 1.02, false);
  else {
    const L = type === 'spear' ? size * 0.7 : type === 'knife' ? size * 0.98 : size * 0.9;
    const mid = type === 'spear' ? -0.5 : type === 'bat' ? -0.38 : -0.32;
    g.save();
    g.rotate(Math.PI / 4);
    g.translate(0, -mid * L);
    paintWeapon(g, type, L, false);
    g.restore();
  }
}
