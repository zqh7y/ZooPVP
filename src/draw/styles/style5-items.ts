import type { ItemType } from './api';
import { RIM, RIMH, SH, SHH, TEX, begin, cut, disc, ellipsePts, end, part, pop, push, rotate, scale, spline, strip, translate, type Pts } from './style5-paper';

/*
 * The perks of style 5, cut from the same papers as the pets: steel (a cool grey card with a pale bevel),
 * kraft (the wood of the bat, spear and shield), gold card and a few brights. Each is built once in its own
 * units and drawn with the paper kit, held in a pet's paw (in the pet's units) or alone on a lobby tile.
 */
type Ctx = CanvasRenderingContext2D;
type Weapon = 'knife' | 'bat' | 'shield' | 'spear';

export const PAPER = {
  steel: '#c4cedb',
  steelLight: '#eef3f8',
  steelDark: '#8794a8',
  kraft: '#d49a58',
  kraftLight: '#efc58a',
  kraftDark: '#9b6334',
  gold: '#ffc21a',
  goldDark: '#e09a0c',
  cream: '#fffaf0',
  creamDark: '#e9dcc4',
  grip: '#3a3f4d',
  ink: '#1c2130',
  chili: '#ec4430',
  chiliLight: '#ff8f6a',
  leaf: '#4caf50',
  leafDark: '#2f7d3a',
  kicks: '#22b8a7',
  kicksDark: '#14897c',
  ribbon: '#ff8a2a',
};

interface ItemShapes {
  knife: { handle: Path2D; guard: Path2D; blade: Path2D; bevel: Path2D };
  bat: { body: Path2D; knob: Path2D; grip: Path2D; grain: Path2D };
  spear: { shaft: Path2D; head: Path2D; bevel: Path2D; bind: Path2D; ribbon: Path2D };
  shield: { rim: Path2D; face: Path2D; star: Path2D; rivets: Path2D };
  helmet: { crest: Path2D; dome: Path2D; shine: Path2D; brim: Path2D };
  sneaker: { sole: Path2D; tread: Path2D; upper: Path2D; toe: Path2D; heel: Path2D; stripe: Path2D; laces: Path2D; wing: Path2D };
  chili: { body: Path2D; shine: Path2D; cap: Path2D; stalk: Path2D };
}

let S: ItemShapes | null = null;

function star(cx: number, cy: number, ro: number, ri: number, rot = -Math.PI / 2): Pts {
  const out: Pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const r = i % 2 ? ri : ro;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

function build(): ItemShapes {
  // knife: grip at the origin, the blade along +x (length ~1)
  const knife = {
    handle: cut(strip([-0.3, 0, -0.03, 0], 0.062, 0.058), 'kn-handle', 0.09, 0.006),
    guard: cut(strip([0.0, -0.11, 0.0, 0.11], 0.04), 'kn-guard', 0.06, 0.004),
    blade: cut([0.03, -0.072, 0.4, -0.08, 0.58, -0.055, 0.72, 0.0, 0.6, 0.05, 0.36, 0.078, 0.03, 0.074], 'kn-blade', 0.12, 0.008),
    bevel: cut([0.06, 0.012, 0.4, 0.02, 0.6, 0.034, 0.68, 0.012, 0.6, 0.05, 0.36, 0.07, 0.06, 0.066], 'kn-bevel', 0.12, 0.005),
  };
  // bat: grip at the origin, barrel along +x
  const batLine = spline([-0.3, -0.046, 0.1, -0.048, 0.48, -0.098, 0.82, -0.128, 0.97, -0.09, 1.01, 0, 0.97, 0.09, 0.82, 0.128, 0.48, 0.098, 0.1, 0.048, -0.3, 0.046, -0.32, 0], true, 6);
  const bat = {
    body: cut(batLine, 'bat-body', 0.12, 0.008),
    knob: disc(-0.33, 0, 0.085, 'bat-knob'),
    grip: cut(strip([-0.27, 0, 0.1, 0], 0.056, 0.058, 2), 'bat-grip', 0.08, 0.005),
    grain: cut(strip([0.3, -0.045, 0.62, -0.068, 0.88, -0.072], 0.02, 0.014), 'bat-grain', 0.1, 0.004),
  };
  // spear: grip at the origin, the head along +x
  const spear = {
    shaft: cut(strip([-0.95, 0, 1.02, 0], 0.046, 0.042), 'sp-shaft', 0.16, 0.006),
    head: cut([0.96, -0.02, 1.12, -0.12, 1.36, -0.07, 1.54, 0.0, 1.36, 0.07, 1.12, 0.12, 0.96, 0.02], 'sp-head', 0.1, 0.008),
    bevel: cut([0.99, 0.0, 1.12, -0.1, 1.35, -0.058, 1.5, 0.0], 'sp-bevel', 0.1, 0.004),
    bind: cut(strip([0.88, 0, 1.0, 0], 0.07, 0.066, 2), 'sp-bind', 0.06, 0.005),
    ribbon: cut(strip(spline([0.9, 0.05, 0.84, 0.16, 0.74, 0.25, 0.66, 0.38], false, 4), 0.045, 0.012), 'sp-ribbon', 0.08, 0.006),
  };
  // shield: face-on, centre at the origin, radius 0.5
  const rivets = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    disc(Math.cos(a) * 0.455, Math.sin(a) * 0.455, 0.028, `sh-rv${i}`, 0.03, 0.002, rivets);
  }
  const shield = {
    rim: disc(0, 0, 0.5, 'sh-rim', 0.13, 0.01),
    face: disc(0, 0, 0.41, 'sh-face', 0.12, 0.009),
    star: cut(star(0, 0.01, 0.23, 0.1), 'sh-star', 0.1, 0.006),
    rivets,
  };
  // helmet: in head units (head centre at the origin, head radius 1), the visor to +x
  // the crest: a fin of gold card along the ridge, its brush cut into scallops and swept back
  const crestPts: Pts = [];
  const M = 40;
  for (let i = 0; i <= M; i++) {
    const u = i / M;
    const a = Math.PI * (1.17 + 0.64 * u) - 0.1 * Math.sin(Math.PI * u);
    const h = 0.42 * Math.sin(Math.PI * u) ** 0.6 + Math.abs(Math.sin(u * Math.PI * 6)) ** 0.5 * 0.07;
    crestPts.push(Math.cos(a) * (0.98 + h), Math.sin(a) * (0.98 + h) - 0.06);
  }
  for (let i = M; i >= 0; i -= 4) {
    const a = Math.PI * (1.2 + 0.58 * (i / M));
    crestPts.push(Math.cos(a) * 0.86, Math.sin(a) * 0.88 - 0.06);
  }
  const dome: Pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (i / 24) * Math.PI;
    dome.push(Math.cos(a) * 1.08, Math.sin(a) * 1.04 - 0.08);
  }
  const helmet = {
    crest: cut(crestPts, 'hm-crest', 0.14, 0.012),
    dome: cut(dome, 'hm-dome', 0.2, 0.014),
    shine: cut(strip(spline([-0.78, -0.42, -0.55, -0.82, -0.12, -0.98], false, 5), 0.07, 0.035), 'hm-shine', 0.14, 0.006),
    brim: cut(strip([-1.16, -0.06, 0.4, -0.02, 1.3, 0.04], 0.13, 0.11, 3), 'hm-brim', 0.18, 0.01),
  };
  // sneaker: side view, toe to +x, in a unit box; a little wing on the heel
  const wing = new Path2D();
  for (let i = 0; i < 3; i++) {
    const a = -2.45 + i * 0.32;
    const l = 0.3 - i * 0.05;
    cut(ellipsePts(-0.36 + Math.cos(a) * l * 0.9, -0.06 + Math.sin(a) * l * 0.9, l, 0.075, a, 20), `sn-w${i}`, 0.08, 0.006, wing);
  }
  const sneaker = {
    sole: cut(spline([-0.5, 0.12, 0.2, 0.12, 0.5, 0.1, 0.56, 0.2, 0.48, 0.3, -0.46, 0.3, -0.54, 0.22], true, 5), 'sn-sole', 0.14, 0.007),
    tread: cut(strip([-0.46, 0.27, 0.46, 0.27], 0.03, 0.03, 2), 'sn-tread', 0.16, 0.004),
    upper: cut(spline([-0.48, 0.14, -0.5, -0.1, -0.42, -0.3, -0.22, -0.3, -0.08, -0.36, 0.04, -0.3, 0.22, -0.1, 0.44, -0.0, 0.54, 0.13, 0.1, 0.16], true, 6), 'sn-upper', 0.12, 0.008),
    toe: cut(spline([0.24, 0.15, 0.28, 0.0, 0.44, 0.0, 0.55, 0.13], true, 5), 'sn-toe', 0.08, 0.005),
    heel: cut(spline([-0.5, 0.12, -0.52, -0.08, -0.42, -0.06, -0.38, 0.12], true, 4), 'sn-heel', 0.08, 0.005),
    stripe: cut(strip(spline([-0.3, 0.06, -0.12, -0.06, 0.08, 0.04], false, 4), 0.045, 0.03), 'sn-stripe', 0.08, 0.005),
    laces: (() => {
      const p = new Path2D();
      cut(strip([-0.08, -0.27, 0.06, -0.21], 0.028), 'sn-l1', 0.05, 0.003, p);
      cut(strip([0.03, -0.18, 0.16, -0.11], 0.028), 'sn-l2', 0.05, 0.003, p);
      cut(strip([0.13, -0.08, 0.26, -0.02], 0.028), 'sn-l3', 0.05, 0.003, p);
      return p;
    })(),
    wing,
  };
  // chili: a fat curl, the stalk at the top left
  const chiliLine = spline([-0.2, -0.26, -0.14, -0.04, 0.0, 0.16, 0.18, 0.3, 0.38, 0.34, 0.46, 0.26], false, 6);
  const chili = {
    body: cut(strip(chiliLine, 0.16, 0.012, 4), 'ch-body', 0.12, 0.009),
    shine: cut(strip(spline([-0.24, -0.16, -0.2, 0.0, -0.08, 0.14], false, 4), 0.035, 0.015), 'ch-shine', 0.08, 0.004),
    cap: cut(spline([-0.38, -0.25, -0.3, -0.36, -0.2, -0.33, -0.1, -0.38, -0.02, -0.26, -0.07, -0.18, -0.2, -0.2, -0.32, -0.16], true, 4), 'ch-cap', 0.07, 0.008),
    stalk: cut(strip(spline([-0.2, -0.32, -0.22, -0.44, -0.12, -0.54], false, 4), 0.038, 0.03), 'ch-stalk', 0.08, 0.004),
  };
  return { knife, bat, spear, shield, helmet, sneaker, chili };
}

export const itemShapes = () => (S ??= build());

/** a weapon held at (hx, hy) in the current units, pointing along angle ang, at scale sc */
export function weapon(kind: Weapon, hx: number, hy: number, ang: number, sc: number) {
  const I = itemShapes();
  push();
  translate(hx, hy);
  rotate(ang);
  scale(sc);
  if (kind === 'knife') {
    part(I.knife.blade, PAPER.steel, SH | RIM);
    part(I.knife.bevel, PAPER.steelLight, 0);
    part(I.knife.handle, PAPER.kraftDark, SH | RIMH);
    part(I.knife.guard, PAPER.gold, SH | RIMH);
  } else if (kind === 'bat') {
    part(I.bat.body, PAPER.kraft, SH | RIM | TEX);
    part(I.bat.grain, PAPER.kraftLight, 0);
    part(I.bat.knob, PAPER.kraftDark, SHH);
    part(I.bat.grip, PAPER.grip, SHH | RIMH);
  } else if (kind === 'spear') {
    part(I.spear.shaft, PAPER.kraft, SH | RIM);
    part(I.spear.ribbon, PAPER.ribbon, SHH);
    part(I.spear.head, PAPER.steel, SH | RIM);
    part(I.spear.bevel, PAPER.steelLight, 0);
    part(I.spear.bind, PAPER.gold, SHH | RIMH);
  } else {
    part(I.shield.rim, PAPER.steelDark, SH | RIM);
    part(I.shield.face, PAPER.kraft, SHH | RIMH | TEX);
    part(I.shield.star, PAPER.gold, SH | RIMH);
    part(I.shield.rivets, PAPER.steelLight, 0);
  }
  pop();
}

/** the helmet on a head centred at (hx, hy) of radius hr, tipped by ang */
export function helmet(hx: number, hy: number, hr: number, ang: number) {
  const I = itemShapes().helmet;
  push();
  translate(hx, hy);
  rotate(ang);
  scale(hr);
  part(I.crest, PAPER.gold, SH | RIMH | TEX);
  part(I.dome, PAPER.steel, SH | RIM | TEX);
  part(I.shine, PAPER.steelLight, 0);
  part(I.brim, PAPER.steelDark, SH | RIMH);
  pop();
}

/** a perk alone, centred at (x, y) in a size x size box */
export function itemIcon(ctx: Ctx, type: ItemType, x: number, y: number, size: number) {
  const I = itemShapes();
  begin(ctx, x, y, size, 1, size * 0.72);
  if (type === 'knife') weapon('knife', -0.26, 0.26, -Math.PI / 4, 1.0);
  else if (type === 'bat') weapon('bat', -0.24, 0.26, -Math.PI / 4, 0.74);
  else if (type === 'spear') weapon('spear', -0.1, 0.1, -Math.PI / 4, 0.5);
  else if (type === 'shield') weapon('shield', 0, 0.0, 0, 0.94);
  else if (type === 'helmet') {
    helmet(-0.03, 0.2, 0.41, 0);
  } else if (type === 'sneakers') {
    push();
    translate(0.1, -0.01);
    scale(0.86);
    part(I.sneaker.wing, PAPER.gold, SH | RIM | TEX);
    part(I.sneaker.upper, PAPER.kicks, SH | RIM | TEX);
    part(I.sneaker.stripe, PAPER.cream, SHH);
    part(I.sneaker.heel, PAPER.kicksDark, SHH);
    part(I.sneaker.toe, PAPER.cream, SH | RIM);
    part(I.sneaker.sole, PAPER.cream, SH | RIM);
    part(I.sneaker.tread, PAPER.creamDark, 0);
    part(I.sneaker.laces, PAPER.cream, SH);
    pop();
  } else {
    push();
    translate(0.0, 0.04);
    scale(1.08);
    part(I.chili.stalk, PAPER.leafDark, SH | RIM);
    part(I.chili.body, PAPER.chili, SH | RIM | TEX);
    part(I.chili.shine, PAPER.chiliLight, 0);
    part(I.chili.cap, PAPER.leaf, SH | RIM);
    pop();
  }
  end();
}
