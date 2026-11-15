import { W, H, STAGE, TEAM, UI } from '../theme';
import { ARENA } from '../data';
import { PITCH, project, quad, circlePath, depthScale, screenY } from './camera';
import type { Ctx } from '../util';

/*
 * A small stadium on a sunny match day, seen through the match camera (camera.ts). One sun at the upper left:
 * lit faces and highlights sit up-left, shade and soft cast shadows fall down-right. The ground is a bright
 * mowed pitch inside a low cream rim; beyond it a little open stand behind the far goal, two short bleachers
 * along the far half of the touchlines, round trees and soft hills under an open sky. Seven fans sit far apart
 * in the stands, each a small character of its own that sways, blinks and hops, and jumps up on cheer().
 *
 * Everything that does not move is painted once in build(); a frame copies one layer, draws the seven fans
 * from cached sprites (a body in three faces and its moving limbs) and waves two team flags.
 *
 * World units are arena pixels: ax across, ay deep (0 = far end line, ARENA.h = near end line), z up.
 */

// ------------------------------------------------------------------ palette (sunlit, one gold)

const GOLD = UI.accent;
const GOLD_DK = '#e39a0b';
const INK = '#2b3440';
const SKY_TOP = '#7ec6f2';
const SKY_MID = '#b5e0f8';
const SKY_LOW = '#e4f5fc';
const CLOUD_SH = '#d5eaf6';
const HILL_FAR = '#bfe2b4';
const HILL_NEAR = '#a3d48f';
const MOW = ['#6fc54d', '#64ba45'];
const VERGE = '#93d36b';
const VERGE_DK = '#86c75f';
const LEAF = { base: '#6fc45a', shade: '#4f9e48', light: '#9edf80' };
const LEAF2 = { base: '#86cf62', shade: '#62ad4d', light: '#b4e994' };
const TRUNK = '#b5855c';
const TRUNK_SH = '#8c6142';
const CREAM = '#fffaf0';
const CREAM_MID = '#f3e6cd';
const CREAM_SH = '#e0cdaa';
const WOOD = '#eaa766';
const WOOD_TOP = '#f8cb93';
const WOOD_SH = '#c9874c';
const WOOD_EDGE = '#a4673a';
const STEP_EDGE = 'rgba(43, 52, 64, 0.55)';
const WHITE = '#ffffff';
const POST_SH = '#d4dde6';
const PATH = '#f5e6c6';
const PATH_EDGE = '#e7d3ac';
const SHADOW = 'rgba(32, 84, 36, 0.24)';
const SHADOW_SOFT = 'rgba(32, 84, 36, 0.14)';
const SHADOW_STAND = 'rgba(120, 92, 52, 0.2)';

/** Where the pets stand in the lobby strip. */
export const STAGE_GROUND_Y = STAGE.y + STAGE.h - 46;

// ------------------------------------------------------------------ the 3D plan

const AW = ARENA.w;
const AH = ARENA.h;
const MX = PITCH.cx;
/** Screen px per unit of height, per unit of depth scale (the camera looks down at a steep angle). */
const ELEV = 0.6;
/** Tall things lean away from the middle a little, as through a wide lens. */
const LEAN = 0.00022;
/** A thing z high throws its shadow this far across and down the ground (sun at the upper left). */
const SUN_X = 0.42;
const SUN_Y = 0.3;

type P = [number, number];

/** A world point (ax, ay on the ground, z up) on screen. */
function pt(ax: number, ay: number, z = 0): P {
  const s = depthScale(ay);
  const x = MX + (ax - AW / 2) * s;
  return [x + (x - MX) * z * LEAN, screenY(ay) - z * s * ELEV];
}
/** Where the shadow of the point (ax, ay, z) falls on the ground. */
const shd = (ax: number, ay: number, z: number): P => pt(ax + z * SUN_X, ay + z * SUN_Y);

// the low rim round the field
const RIM = { x0: -26, x1: AW + 26, y0: -34, y1: AH + 40, z: 9, t: 6 };
// goals
const GOAL_HW = 50;
const GOAL_Z = 44;
const GOAL_ZB = 34;
const GOAL_D = 28;
// the far stand: rows of benches climbing away from the pitch
const FS = { x0: 34, x1: AW - 34, front: -50, rows: 4, step: 14, rise: 10, z0: 12 };
const fsFront = (k: number) => FS.front - FS.step * k;
const fsZ = (k: number) => FS.z0 + FS.rise * k;
// the two bleachers along the touchlines (far half), rows climbing outward
const SB = { inner: 35, step: 25, rise: 9, z0: 9, rows: 1 };
const SB_SPAN: [number, number][] = [
  [-8, 180],
  [36, 232],
];
const sbIn = (k: number) => SB.inner + SB.step * k;
const sbZ = (k: number) => SB.z0 + SB.rise * k;
/** Ground x of a bleacher distance d outside the touchline, on side 0 (left) or 1 (right). */
const sideX = (side: number, d: number) => (side ? AW + d : -d);

const FRONT_Y = 900;
const FRONT_H = 92;

// the lobby strip: local y inside STAGE
const SG = STAGE_GROUND_Y - STAGE.y;
const S_LINE = 172; // the touchline
const S_RIM = 150; // the rim in front of the little stand
const S_ROWS = [S_RIM - 12, S_RIM - 28, S_RIM - 44]; // the stand's rows: where a fan sits
const S_X0 = 64;
const S_X1 = 360;

// ------------------------------------------------------------------ small helpers

function layer(w: number, h: number, ratio: number, paint: (c: Ctx) => void, opaque = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * ratio));
  cv.height = Math.max(1, Math.ceil(h * ratio));
  // an opaque layer is copied faster every frame
  const c = cv.getContext('2d', { alpha: !opaque })!;
  c.scale(ratio, ratio);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  paint(c);
  return cv;
}

function shape(c: Ctx, pts: P[]) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

function fillShape(c: Ctx, pts: P[], color: string | CanvasGradient, edge = 0, edgeColor = INK) {
  shape(c, pts);
  c.fillStyle = color;
  c.fill();
  if (edge) {
    c.strokeStyle = edgeColor;
    c.lineWidth = edge;
    c.stroke();
  }
}

function seg(c: Ctx, a: P, b: P, color: string, w: number) {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

/** A drawn tube: an ink edge, the body, a highlight up-left. */
function tube(c: Ctx, a: P, b: P, w: number, body = WHITE, shade = POST_SH) {
  seg(c, a, b, INK, w + 2.2);
  seg(c, a, b, shade, w);
  const o = w * 0.18;
  seg(c, [a[0] - o, a[1] - o], [b[0] - o, b[1] - o], body, w * 0.55);
}

/** Adds an ellipse as a sub-path (for shapes built from several parts). */
function oval(c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}
/** Adds a circle as a sub-path. */
function dot(c: Ctx, x: number, y: number, r: number) {
  c.moveTo(x + r, y);
  c.arc(x, y, r, 0, Math.PI * 2);
}
/** Adds a rounded rectangle as a sub-path. */
function box(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}
function tri(c: Ctx, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  c.moveTo(ax, ay);
  c.lineTo(bx, by);
  c.lineTo(cx, cy);
  c.closePath();
}

/**
 * A cartoon solid: the union of the parts build() adds, with one ink outline round the outside, the shade
 * colour as a crescent on the lower right and the base colour where the sun reaches (upper left).
 */
function toon(c: Ctx, build: (c: Ctx) => void, base: string, shade: string, k = 2, lw = 1.5, light?: string) {
  c.beginPath();
  build(c);
  if (lw > 0) {
    c.lineWidth = lw * 2;
    c.strokeStyle = INK;
    c.stroke();
  }
  c.fillStyle = shade;
  c.fill();
  c.save();
  c.clip();
  c.translate(-k, -k * 1.15);
  c.beginPath();
  build(c);
  c.fillStyle = base;
  c.fill();
  if (light) {
    c.translate(-k * 1.6, -k * 1.8);
    c.globalAlpha = 0.55;
    c.beginPath();
    build(c);
    c.fillStyle = light;
    c.fill();
  }
  c.restore();
}

/** A soft, round contact shadow. */
function softShadow(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0.24) {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(32, 84, 36, ${a})`);
  g.addColorStop(0.6, `rgba(32, 84, 36, ${a * 0.75})`);
  g.addColorStop(1, 'rgba(32, 84, 36, 0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ------------------------------------------------------------------ scenery pieces (screen space)

/** A soft cartoon cloud: rounded puffs on a flat base, a pale shade under it. */
function cloud(c: Ctx, x: number, y: number, s: number, a = 1) {
  c.save();
  c.globalAlpha = a;
  const build = (c: Ctx) => {
    dot(c, x - 22 * s, y - 6 * s, 13 * s);
    dot(c, x, y - 14 * s, 19 * s);
    dot(c, x + 22 * s, y - 8 * s, 14 * s);
    box(c, x - 34 * s, y - 10 * s, 70 * s, 14 * s, 7 * s);
  };
  c.beginPath();
  build(c);
  c.fillStyle = CLOUD_SH;
  c.fill();
  c.save();
  c.clip();
  c.translate(-2 * s, -4 * s);
  c.beginPath();
  build(c);
  c.fillStyle = WHITE;
  c.fill();
  c.restore();
  c.restore();
}

/** A round cartoon tree standing at the arena point (ax, ay); r is its crown radius in arena px. */
function tree(c: Ctx, ax: number, ay: number, r: number, pal = LEAF, k = 1) {
  const s = depthScale(ay) * k;
  const R = r * s;
  const [x, y] = pt(ax, ay);
  softShadow(c, x + R * 0.55, y + R * 0.1, R * 1.25, R * 0.42, 0.26);
  const th = R * 0.85;
  toon(c, (c) => box(c, x - R * 0.13, y - th - R * 0.2, R * 0.26, th + R * 0.22, R * 0.08), TRUNK, TRUNK_SH, R * 0.06, 1.3);
  const cy = y - th - R * 0.55;
  toon(
    c,
    (c) => {
      dot(c, x, cy - R * 0.3, R * 0.78);
      dot(c, x - R * 0.52, cy + R * 0.12, R * 0.6);
      dot(c, x + R * 0.55, cy + R * 0.16, R * 0.56);
      oval(c, x, cy + R * 0.3, R * 0.85, R * 0.4);
    },
    pal.base,
    pal.shade,
    R * 0.12,
    1.4,
    pal.light,
  );
}

/** A low round bush on the ground. */
function bush(c: Ctx, ax: number, ay: number, r: number, pal = LEAF2) {
  const s = depthScale(ay);
  const R = r * s;
  const [x, y] = pt(ax, ay);
  softShadow(c, x + R * 0.45, y + R * 0.05, R * 1.3, R * 0.38, 0.24);
  toon(
    c,
    (c) => {
      dot(c, x - R * 0.55, y - R * 0.42, R * 0.55);
      dot(c, x + R * 0.05, y - R * 0.66, R * 0.66);
      dot(c, x + R * 0.62, y - R * 0.38, R * 0.5);
      box(c, x - R * 1.05, y - R * 0.5, R * 2.1, R * 0.52, R * 0.25);
    },
    pal.base,
    pal.shade,
    R * 0.1,
    1.3,
    pal.light,
  );
}

/** A net over a four-cornered patch: a faint veil and a fine white mesh. */
function net(c: Ctx, q: P[], nu: number, nv: number, mesh = 0.6) {
  shape(c, q);
  c.fillStyle = 'rgba(255, 255, 255, 0.12)';
  c.fill();
  const [p0, p1, p2, p3] = q;
  c.beginPath();
  for (let i = 1; i < nu; i++) {
    const k = i / nu;
    c.moveTo(p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k);
    c.lineTo(p3[0] + (p2[0] - p3[0]) * k, p3[1] + (p2[1] - p3[1]) * k);
  }
  for (let i = 1; i < nv; i++) {
    const k = i / nv;
    c.moveTo(p0[0] + (p3[0] - p0[0]) * k, p0[1] + (p3[1] - p0[1]) * k);
    c.lineTo(p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k);
  }
  c.strokeStyle = `rgba(255, 255, 255, ${mesh})`;
  c.lineWidth = 0.8;
  c.stroke();
}

/** Every marking of the pitch, through the camera, in solid white (the caller fades it). */
function markings(c: Ctx, lw: number) {
  const u = AW / 68; // px per metre
  const r = 9.15 * u;
  c.strokeStyle = '#ffffff';
  c.fillStyle = '#ffffff';
  c.lineWidth = lw;
  c.lineJoin = 'round';
  shape(c, quad(0, 0, AW, AH));
  c.stroke();
  const a = project(0, AH / 2);
  const b = project(AW, AH / 2);
  seg(c, [a.x, a.y], [b.x, b.y], '#ffffff', lw);
  circlePath(c, AW / 2, AH / 2, r, 0, Math.PI * 2, 64);
  c.stroke();
  circlePath(c, AW / 2, AH / 2, 3, 0, Math.PI * 2, 12);
  c.fill();
  const rect = (w: number, d: number, y0: number, dir: number) => {
    const p = [project(AW / 2 - w / 2, y0), project(AW / 2 - w / 2, y0 + dir * d), project(AW / 2 + w / 2, y0 + dir * d), project(AW / 2 + w / 2, y0)];
    c.beginPath();
    c.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < 4; i++) c.lineTo(p[i].x, p[i].y);
    c.stroke();
  };
  const pd = 16.5 * u;
  const sp = 11 * u;
  const k = Math.asin((pd - sp) / r);
  for (const far of [true, false]) {
    const y0 = far ? 0 : AH;
    const dir = far ? 1 : -1;
    rect(40.32 * u, pd, y0, dir);
    rect(18.32 * u, 5.5 * u, y0, dir);
    circlePath(c, AW / 2, y0 + dir * sp, 2.6, 0, Math.PI * 2, 12);
    c.fill();
    if (far) circlePath(c, AW / 2, sp, r, k, Math.PI - k, 24);
    else circlePath(c, AW / 2, AH - sp, r, Math.PI + k, Math.PI * 2 - k, 24);
    c.stroke();
  }
  const q = Math.PI / 2;
  const corners: [number, number, number][] = [
    [0, 0, 0],
    [AW, 0, q],
    [AW, AH, q * 2],
    [0, AH, q * 3],
  ];
  for (const [x, y, a0] of corners) {
    circlePath(c, x, y, 10, a0, a0 + q, 8);
    c.stroke();
  }
}

/** A goal standing on the end line; the far one faces us, the near one shows us its back. */
function goal(c: Ctx, near: boolean) {
  const x0 = AW / 2 - GOAL_HW;
  const x1 = AW / 2 + GOAL_HW;
  const yl = near ? AH : 0;
  const yb = near ? AH + GOAL_D : -GOAL_D;
  const L0 = pt(x0, yl, 0);
  const L1 = pt(x0, yl, GOAL_Z);
  const R0 = pt(x1, yl, 0);
  const R1 = pt(x1, yl, GOAL_Z);
  const B0 = pt(x0, yb, 0);
  const B1 = pt(x0, yb, GOAL_ZB);
  const C0 = pt(x1, yb, 0);
  const C1 = pt(x1, yb, GOAL_ZB);
  const frame = () => {
    tube(c, L0, L1, 3.6);
    tube(c, R0, R1, 3.6);
    tube(c, L1, R1, 3.6);
  };
  const back = () => {
    for (const [a, b] of [
      [B0, B1],
      [C0, C1],
      [B1, C1],
      [L1, B1],
      [R1, C1],
      [B0, C0],
    ])
      seg(c, a, b, 'rgba(255, 255, 255, 0.9)', 1.4);
  };
  const m = near ? 0.5 : 0.7;
  const nets = () => {
    if (!near) {
      fillShape(c, [L0, R0, C0, B0], 'rgba(30, 90, 40, 0.16)');
      fillShape(c, [B1, C1, C0, B0], 'rgba(40, 90, 60, 0.14)');
    }
    net(c, [B1, C1, C0, B0], 18, 5, m);
    net(c, [L0, L1, B1, B0], 4, 6, m);
    net(c, [R0, R1, C1, C0], 4, 6, m);
    net(c, [L1, R1, C1, B1], 18, 4, m);
  };
  if (near) {
    frame();
    back();
    nets();
  } else {
    nets();
    back();
    frame();
  }
}

/** The goal's soft shadow on the grass, thrown down-right by the sun. */
function goalShadow(c: Ctx, near: boolean) {
  const x0 = AW / 2 - GOAL_HW;
  const x1 = AW / 2 + GOAL_HW;
  const yl = near ? AH : 0;
  const yb = near ? AH + GOAL_D : -GOAL_D;
  fillShape(c, [pt(x0, yb), pt(x1, yb), shd(x1, yb, GOAL_ZB), shd(x1, yl, GOAL_Z), shd(x0, yl, GOAL_Z), pt(x0, yl)], 'rgba(32, 84, 36, 0.12)');
  c.lineCap = 'round';
  seg(c, pt(x0, yl), shd(x0, yl, GOAL_Z), SHADOW, 3);
  seg(c, pt(x1, yl), shd(x1, yl, GOAL_Z), SHADOW, 3);
  seg(c, shd(x0, yl, GOAL_Z), shd(x1, yl, GOAL_Z), SHADOW, 3);
}

/** A corner flag: a thin pole and a small gold flag flying outward; its shadow down-right is drawn on its own. */
function cornerFlag(c: Ctx, ax: number, ay: number, dir: number, part: 'shadow' | 'flag' | 'both' = 'both') {
  const z = 32;
  const b = pt(ax, ay);
  const t = pt(ax, ay, z);
  if (part !== 'flag') {
    seg(c, b, shd(ax, ay, z), SHADOW, 2);
    fillShape(c, [shd(ax, ay, z), shd(ax + dir * 12, ay, z - 4), shd(ax, ay, z - 9)], SHADOW);
    softShadow(c, b[0] + 1, b[1] + 0.5, 4, 1.6, 0.3);
  }
  if (part === 'shadow') return;
  tube(c, b, t, 1.8);
  const m = pt(ax, ay, z - 10);
  const tip: P = [t[0] + dir * 13, t[1] + 4];
  shape(c, [t, tip, m]);
  c.fillStyle = GOLD;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  c.stroke();
  fillShape(c, [[(t[0] + m[0]) / 2, (t[1] + m[1]) / 2], tip, m], GOLD_DK);
}

/** A white football resting on the grass at (ax, ay), r in arena px. */
function ball(c: Ctx, ax: number, ay: number, r: number) {
  const s = depthScale(ay);
  const R = r * s;
  const [x, y0] = pt(ax, ay);
  const y = y0 - R;
  softShadow(c, x + R * 0.6, y0 + 0.5, R * 1.3, R * 0.4, 0.32);
  toon(c, (c) => dot(c, x, y, R), WHITE, '#d8e0e9', R * 0.22, 1.2);
  c.save();
  c.beginPath();
  dot(c, x, y, R);
  c.clip();
  c.fillStyle = '#3a4554';
  const patch = (px: number, py: number, pr: number, rot: number) => {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      c.lineTo(px + Math.cos(a) * pr, py + Math.sin(a) * pr * 0.92);
    }
    c.closePath();
    c.fill();
  };
  patch(x + R * 0.2, y + R * 0.1, R * 0.34, -1.2);
  patch(x - R * 0.85, y - R * 0.3, R * 0.3, 0.3);
  patch(x + R * 0.75, y - R * 0.75, R * 0.3, 0.8);
  patch(x + R * 0.55, y + R * 0.95, R * 0.3, 0.1);
  patch(x - R * 0.5, y + R * 0.9, R * 0.28, 0.6);
  c.restore();
  c.beginPath();
  dot(c, x, y, R);
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  c.stroke();
}

// ------------------------------------------------------------------ the fans

type Mode = 0 | 1 | 2; // eyes open, a blink, cheering

interface LimbDef {
  /** pivot in the fan's local units (x to the right side; mirrored limbs use -px) */
  px: number;
  py: number;
  mirror?: boolean;
  behind?: boolean;
  /** angle at rest and when cheering (0 = pointing up, clockwise) */
  rest: number;
  up: number;
  /** idle motion: amplitude and speed; cheering motion: amplitude and speed */
  amp: number;
  spd: number;
  camp: number;
  cspd: number;
  paint: (c: Ctx) => void;
}

interface KindDef {
  body: (c: Ctx, m: Mode, lx: number) => void;
  limbs: LimbDef[];
}

interface Limb extends LimbDef {
  img: HTMLCanvasElement;
}

interface Fan {
  x: number;
  y: number;
  sc: number;
  ph: number;
  body: HTMLCanvasElement[];
  limbs: Limb[];
}

// a fan's sprite box in local units: the seat point at (BX, BY)
const BW = 50;
const BH = 58;
const BX = 25;
const BY = 52;
// a limb's sprite box: the pivot at (LX, LY)
const LW = 34;
const LH = 44;
const LX = 17;
const LY = 34;
const FLW = 1.5; // a fan's outline

const FROG = { base: '#8ed35f', shade: '#64ae46', belly: '#effabf' };
const BIRD = { base: '#c99c70', shade: '#a77a52', belly: '#fff1dc', beak: '#f7a93a', beakDk: '#d9851c' };
const CAT = { base: '#f5b273', shade: '#d98c4c', belly: '#fff4e4', pink: '#f4a3a0' };
const BEAR = { base: '#b27d55', shade: '#8c5c3a', muzzle: '#f2dcbc' };
const BUNNY = { base: '#fdf9f3', shade: '#e2d6c6', pink: '#f6b9b3' };
const PENG = { base: '#3f4d5f', shade: '#2b3646', belly: '#ffffff', bellySh: '#dfe6ee', beak: '#f7a93a' };
const HAM = { base: '#e9b783', shade: '#c99060', belly: '#fff5e8', pink: '#f4b0a6' };
const MOUTH = '#8a3b3b';
const TONGUE = '#f58d8d';

function inkStroke(c: Ctx, w = FLW) {
  c.strokeStyle = INK;
  c.lineWidth = w;
  c.stroke();
}
function fill(c: Ctx, color: string) {
  c.fillStyle = color;
  c.fill();
}

/** Two eyes: dots with a glint (open), soft lines (a blink), happy arcs (cheering). */
function eyes(c: Ctx, x: number, y: number, gap: number, r: number, m: Mode, lx: number) {
  for (const s of [-1, 1]) {
    const ex = x + s * gap;
    if (m === 0) {
      c.beginPath();
      dot(c, ex + lx * 0.45, y + 0.2, r);
      fill(c, INK);
      c.beginPath();
      dot(c, ex + lx * 0.45 - r * 0.36, y - r * 0.38, r * 0.38);
      fill(c, WHITE);
    } else if (m === 1) {
      c.beginPath();
      c.moveTo(ex - r * 1.1, y + 0.2);
      c.quadraticCurveTo(ex, y + r * 0.9, ex + r * 1.1, y + 0.2);
      inkStroke(c, 1.2);
    } else {
      c.beginPath();
      c.moveTo(ex - r * 1.15, y + r * 0.5);
      c.quadraticCurveTo(ex, y - r * 1.3, ex + r * 1.15, y + r * 0.5);
      inkStroke(c, 1.3);
    }
  }
}

/** A small smile, or a wide-open cheering mouth. */
function mouth(c: Ctx, x: number, y: number, w: number, m: Mode) {
  if (m === 2) {
    c.beginPath();
    c.moveTo(x - w, y - 0.6);
    c.quadraticCurveTo(x, y - 1.2, x + w, y - 0.6);
    c.quadraticCurveTo(x + w * 0.8, y + w * 1.25, x, y + w * 1.25);
    c.quadraticCurveTo(x - w * 0.8, y + w * 1.25, x - w, y - 0.6);
    c.closePath();
    fill(c, MOUTH);
    c.save();
    c.clip();
    c.beginPath();
    oval(c, x, y + w * 1.25, w * 0.65, w * 0.5);
    fill(c, TONGUE);
    c.restore();
    c.beginPath();
    c.moveTo(x - w, y - 0.6);
    c.quadraticCurveTo(x, y - 1.2, x + w, y - 0.6);
    c.quadraticCurveTo(x + w * 0.8, y + w * 1.25, x, y + w * 1.25);
    c.quadraticCurveTo(x - w * 0.8, y + w * 1.25, x - w, y - 0.6);
    c.closePath();
    inkStroke(c, 1.1);
  } else {
    c.beginPath();
    c.moveTo(x - w, y);
    c.quadraticCurveTo(x, y + w * 0.75, x + w, y);
    inkStroke(c, 1.2);
  }
}

/** A little 'w' cat-and-bear mouth under the nose. */
function wMouth(c: Ctx, x: number, y: number, w: number, m: Mode) {
  if (m === 2) return mouth(c, x, y + 0.6, w * 1.1, 2);
  c.beginPath();
  c.moveTo(x - w, y);
  c.quadraticCurveTo(x - w * 0.5, y + w * 0.8, x, y);
  c.quadraticCurveTo(x + w * 0.5, y + w * 0.8, x + w, y);
  inkStroke(c, 1.1);
}

function blush(c: Ctx, x: number, y: number, gap: number, color = 'rgba(255, 128, 120, 0.32)') {
  c.beginPath();
  oval(c, x - gap, y, 2.4, 1.4);
  oval(c, x + gap, y, 2.4, 1.4);
  fill(c, color);
}

/** An arm or a wing: a rounded limb from the pivot upward. */
function limbShape(c: Ctx, len: number, w: number, base: string, shade: string) {
  toon(c, (c) => oval(c, 0, -len / 2, w, len / 2 + w * 0.4), base, shade, w * 0.35, FLW);
}

const KINDS: Record<string, KindDef> = {
  // a frog with a big gold foam finger
  frog: {
    body(c, m, lx) {
      toon(
        c,
        (c) => {
          oval(c, 0, -11, 12.5, 11);
          oval(c, 0, -20, 13, 8.6);
          dot(c, -6.6, -26.6, 5.3);
          dot(c, 6.6, -26.6, 5.3);
        },
        FROG.base,
        FROG.shade,
        2.2,
        FLW,
      );
      c.beginPath();
      oval(c, 0.4, -8.6, 7.6, 6.6);
      fill(c, FROG.belly);
      for (const s of [-1, 1]) {
        c.beginPath();
        dot(c, s * 6.6, -27, 3.6);
        fill(c, WHITE);
      }
      eyes(c, 0, -26.8, 6.6, 1.85, m, lx);
      blush(c, 0, -19.6, 9.4);
      mouth(c, 0, -19.4, 5.6, m);
      toon(
        c,
        (c) => {
          oval(c, -8, -0.8, 4.8, 2.3);
          oval(c, 8, -0.8, 4.8, 2.3);
        },
        FROG.base,
        FROG.shade,
        1,
        FLW,
      );
    },
    limbs: [
      {
        px: 10,
        py: -13,
        rest: 0.62,
        up: 0.12,
        amp: 0.07,
        spd: 1.6,
        camp: 0.28,
        cspd: 10,
        paint(c) {
          limbShape(c, 9, 2.6, FROG.base, FROG.shade);
          toon(
            c,
            (c) => {
              box(c, -5.6, -18.5, 11.2, 10.5, 3.6);
              box(c, -2.3, -28.5, 4.8, 13, 2.4);
            },
            GOLD,
            GOLD_DK,
            1.4,
            FLW,
          );
          c.beginPath();
          oval(c, -5.4, -12.8, 2.2, 3, 0.5);
          fill(c, GOLD);
          inkStroke(c, 1.1);
          c.beginPath();
          c.moveTo(-3, -11.5);
          c.lineTo(3.2, -11.5);
          inkStroke(c, 0.9);
        },
      },
    ],
  },
  // a round little bird in a blue knitted scarf
  bird: {
    body(c, m, lx) {
      toon(
        c,
        (c) => {
          oval(c, 0, -15, 13.4, 14.4);
          oval(c, -1.6, -29.6, 1.9, 4, -0.45);
          oval(c, 1.6, -30, 1.7, 3.6, 0.4);
        },
        BIRD.base,
        BIRD.shade,
        2.2,
        FLW,
      );
      c.beginPath();
      oval(c, 0.6, -9.8, 9, 8.4);
      fill(c, BIRD.belly);
      // the scarf round the neck, one end hanging
      const scarf = (c: Ctx) => {
        c.moveTo(-12.6, -16.4);
        c.quadraticCurveTo(0, -13.2, 12.6, -16.4);
        c.lineTo(12.4, -11.8);
        c.quadraticCurveTo(0, -8.6, -12.4, -11.8);
        c.closePath();
        box(c, 4.4, -12.6, 5.4, 11.4, 1.6);
      };
      toon(c, scarf, TEAM[0].main, TEAM[0].dark, 1.2, FLW);
      c.save();
      c.beginPath();
      scarf(c);
      c.clip();
      c.fillStyle = 'rgba(255, 255, 255, 0.92)';
      for (const x of [-7.5, -1.6, 10]) c.fillRect(x, -18, 2.2, 7);
      c.fillRect(4, -6.4, 6, 1.8);
      c.fillRect(4, -3.2, 6, 1.8);
      c.restore();
      eyes(c, 0, -23.6, 4.9, 1.85, m, lx);
      // the beak
      if (m === 2) {
        c.beginPath();
        tri(c, -2.6, -21.4, 2.6, -21.4, 0, -19);
        fill(c, BIRD.beak);
        inkStroke(c, 1.1);
        c.beginPath();
        tri(c, -2, -18.4, 2, -18.4, 0, -16.4);
        fill(c, BIRD.beakDk);
        inkStroke(c, 1.1);
      } else {
        c.beginPath();
        tri(c, -2.6, -21.4, 2.6, -21.4, 0, -17.8);
        fill(c, BIRD.beak);
        inkStroke(c, 1.1);
      }
      blush(c, 0, -19.8, 8.4);
      // little feet
      c.beginPath();
      for (const s of [-1, 1]) {
        c.moveTo(s * 4.2, -1.4);
        c.lineTo(s * 4.2, 0.8);
        c.moveTo(s * 4.2 - 1.6, 1);
        c.lineTo(s * 4.2 + 1.6, 1);
      }
      c.strokeStyle = BIRD.beakDk;
      c.lineWidth = 1.4;
      c.stroke();
    },
    limbs: [1, -1].map(
      (side): LimbDef => ({
        px: 11.6,
        py: -14,
        mirror: side < 0,
        rest: 2.9,
        up: 1.0,
        amp: 0.06,
        spd: 2.2,
        camp: 0.55,
        cspd: 16,
        paint(c) {
          toon(c, (c) => oval(c, 0, -6.8, 3.7, 7.6), BIRD.base, BIRD.shade, 1.1, FLW);
          c.beginPath();
          c.moveTo(-1.4, -3);
          c.lineTo(-1.6, -9);
          c.moveTo(1.2, -3);
          c.lineTo(1.4, -10);
          c.strokeStyle = BIRD.shade;
          c.lineWidth = 0.9;
          c.stroke();
        },
      }),
    ),
  },
  // a ginger cat waving a little red pennant
  cat: {
    body(c, m, lx) {
      // the tail curls up behind
      c.beginPath();
      c.moveTo(-7, -3);
      c.bezierCurveTo(-18, -4, -19, -16, -14.5, -21);
      c.lineWidth = 6.8;
      c.strokeStyle = INK;
      c.stroke();
      c.lineWidth = 3.8;
      c.strokeStyle = CAT.base;
      c.stroke();
      toon(
        c,
        (c) => {
          oval(c, 0, -9.6, 10.6, 9.6);
          oval(c, 0, -23, 11.2, 9.3);
          tri(c, -10.6, -25.4, -9.4, -38.2, -2.4, -31.4);
          tri(c, 10.6, -25.4, 9.4, -38.2, 2.4, -31.4);
        },
        CAT.base,
        CAT.shade,
        2.2,
        FLW,
      );
      c.beginPath();
      tri(c, -8.6, -29, -8.2, -35, -4.6, -31.4);
      tri(c, 8.6, -29, 8.2, -35, 4.6, -31.4);
      fill(c, CAT.pink);
      // tabby stripes
      c.beginPath();
      c.moveTo(0, -31.6);
      c.lineTo(0, -28.6);
      c.moveTo(-3.2, -31);
      c.lineTo(-2.6, -28.8);
      c.moveTo(3.2, -31);
      c.lineTo(2.6, -28.8);
      c.strokeStyle = CAT.shade;
      c.lineWidth = 1.3;
      c.stroke();
      c.beginPath();
      oval(c, 0.3, -8, 6.2, 6.2);
      fill(c, CAT.belly);
      c.beginPath();
      oval(c, 0, -19.8, 5.4, 3.5);
      fill(c, CAT.belly);
      eyes(c, 0, -24.4, 4.7, 1.75, m, lx);
      c.beginPath();
      tri(c, -1.3, -21.6, 1.3, -21.6, 0, -20.2);
      fill(c, CAT.pink);
      inkStroke(c, 0.8);
      wMouth(c, 0, -19.9, 2, m);
      // whiskers
      c.beginPath();
      for (const s of [-1, 1]) {
        c.moveTo(s * 6.4, -20.6);
        c.lineTo(s * 11.6, -21.6);
        c.moveTo(s * 6.4, -19.2);
        c.lineTo(s * 11.4, -18.8);
      }
      c.strokeStyle = 'rgba(43, 52, 64, 0.55)';
      c.lineWidth = 0.6;
      c.stroke();
      // the paw at rest
      toon(c, (c) => oval(c, -5.4, -2.4, 3.2, 2.4), CAT.belly, '#ecd9c0', 0.8, 1.2);
    },
    limbs: [
      {
        px: 8.5,
        py: -12,
        rest: 0.42,
        up: 0.12,
        amp: 0.32,
        spd: 2.8,
        camp: 0.55,
        cspd: 11,
        paint(c) {
          limbShape(c, 8, 2.6, CAT.base, CAT.shade);
          // the stick and the pennant
          tube(c, [0, -6], [0, -27], 1.2, '#fdf2df', '#e2c79e');
          c.beginPath();
          tri(c, 0.4, -27, 13.5, -23.2, 0.4, -19.2);
          fill(c, TEAM[1].main);
          c.save();
          c.clip();
          c.beginPath();
          tri(c, 0.4, -24.2, 13.5, -23.2, 0.4, -19.2);
          fill(c, TEAM[1].dark);
          c.fillStyle = 'rgba(255, 255, 255, 0.95)';
          c.fillRect(2.6, -28, 1.8, 10);
          c.restore();
          c.beginPath();
          tri(c, 0.4, -27, 13.5, -23.2, 0.4, -19.2);
          inkStroke(c, 1.2);
          c.beginPath();
          dot(c, 0, -7.2, 2.7);
          fill(c, CAT.belly);
          inkStroke(c, 1.2);
        },
      },
    ],
  },
  // a bear cub who claps and throws both arms up
  bear: {
    body(c, m, lx) {
      toon(
        c,
        (c) => {
          oval(c, 0, -10, 12.2, 10.6);
          oval(c, 0, -25, 11.2, 9.6);
          dot(c, -8.6, -32.4, 4.3);
          dot(c, 8.6, -32.4, 4.3);
        },
        BEAR.base,
        BEAR.shade,
        2.2,
        FLW,
      );
      c.beginPath();
      dot(c, -8.4, -32.2, 2.1);
      dot(c, 8.8, -32.2, 2.1);
      fill(c, BEAR.muzzle);
      c.beginPath();
      oval(c, 0.4, -8.6, 7.6, 6.8);
      fill(c, BEAR.muzzle);
      c.beginPath();
      oval(c, 0, -21.6, 5.8, 4.1);
      fill(c, BEAR.muzzle);
      c.beginPath();
      oval(c, 0, -23.4, 2.3, 1.55);
      fill(c, INK);
      eyes(c, 0, -26.8, 4.8, 1.8, m, lx);
      wMouth(c, 0, -21.2, 2, m);
      blush(c, 0, -22, 8.2);
      toon(
        c,
        (c) => {
          oval(c, -6.8, -0.8, 4.2, 2.6);
          oval(c, 6.8, -0.8, 4.2, 2.6);
        },
        BEAR.base,
        BEAR.shade,
        1,
        FLW,
      );
    },
    limbs: [1, -1].map(
      (side): LimbDef => ({
        px: 10.6,
        py: -15,
        mirror: side < 0,
        rest: 3.55,
        up: 0.45,
        amp: 0.06,
        spd: 1.4 + side * 0.2,
        camp: 0.32,
        cspd: 12,
        paint(c) {
          limbShape(c, 12, 3.4, BEAR.base, BEAR.shade);
          c.beginPath();
          dot(c, 0, -11.6, 1.7);
          fill(c, BEAR.muzzle);
        },
      }),
    ),
  },
  // a bunny with one flopped ear, blowing a blue horn
  bunny: {
    body(c, m, lx) {
      toon(c, (c) => oval(c, -4.6, -37, 3.7, 9.6, -0.12), BUNNY.base, BUNNY.shade, 1.2, FLW);
      toon(c, (c) => oval(c, 8.4, -33.6, 3.5, 8.6, 1.0), BUNNY.base, BUNNY.shade, 1.2, FLW);
      c.beginPath();
      oval(c, -4.7, -37.6, 1.6, 6.6, -0.12);
      oval(c, 8.6, -33.8, 1.5, 5.8, 1.0);
      fill(c, BUNNY.pink);
      toon(c, (c) => dot(c, 10.4, -4.6, 3.6), BUNNY.base, BUNNY.shade, 0.8, FLW);
      toon(
        c,
        (c) => {
          oval(c, 0, -9.6, 11, 10);
          oval(c, 0, -23.2, 10.2, 9.1);
        },
        BUNNY.base,
        BUNNY.shade,
        2.2,
        FLW,
      );
      eyes(c, 0, -24.4, 4.3, 1.75, m, lx);
      blush(c, 0, -20.6, 6.6, 'rgba(255, 120, 120, 0.38)');
      c.beginPath();
      oval(c, 0, -21.4, 1.5, 1.05);
      fill(c, '#ee8f8f');
      if (m === 2) mouth(c, 0, -19.6, 2.4, 2);
      else wMouth(c, 0, -20.3, 1.6, 0);
      toon(
        c,
        (c) => {
          oval(c, -6.2, -0.8, 5, 2.4);
          oval(c, 6.2, -0.8, 5, 2.4);
        },
        BUNNY.base,
        BUNNY.shade,
        1,
        FLW,
      );
    },
    limbs: [
      {
        px: 2.6,
        py: -19.8,
        rest: 1.22,
        up: 0.62,
        amp: 0.05,
        spd: 1.8,
        camp: 0.14,
        cspd: 8,
        paint(c) {
          const horn = (c: Ctx) => {
            c.moveTo(-1.1, -1);
            c.lineTo(-4.6, -21);
            c.quadraticCurveTo(0, -23.6, 4.6, -21);
            c.lineTo(1.1, -1);
            c.closePath();
          };
          toon(c, horn, TEAM[0].main, TEAM[0].dark, 1.1, FLW);
          c.save();
          c.beginPath();
          horn(c);
          c.clip();
          c.fillStyle = 'rgba(255, 255, 255, 0.92)';
          c.fillRect(-6, -9.6, 12, 1.8);
          c.fillRect(-6, -16.4, 12, 1.8);
          c.restore();
          c.beginPath();
          oval(c, 0, -21.4, 4.6, 1.3);
          fill(c, TEAM[0].dark);
          inkStroke(c, 1);
          c.beginPath();
          dot(c, -1.2, -6.4, 2.6);
          fill(c, BUNNY.base);
          inkStroke(c, 1.2);
        },
      },
    ],
  },
  // a penguin in a red bobble hat, flapping
  penguin: {
    body(c, m, lx) {
      toon(c, (c) => oval(c, 0, -15.6, 11.6, 15.6), PENG.base, PENG.shade, 2.2, FLW);
      toon(
        c,
        (c) => {
          oval(c, 0, -11.4, 8.2, 11);
          dot(c, -3.6, -20.6, 4.7);
          dot(c, 3.6, -20.6, 4.7);
        },
        PENG.belly,
        PENG.bellySh,
        1.4,
        0,
      );
      // the bobble hat
      const hat = (c: Ctx) => {
        c.moveTo(-10.6, -25.4);
        c.bezierCurveTo(-10.8, -37.6, 10.8, -37.6, 10.6, -25.4);
        c.closePath();
      };
      toon(c, hat, TEAM[1].main, TEAM[1].dark, 1.4, FLW);
      toon(c, (c) => box(c, -11.4, -28, 22.8, 4.4, 2), '#ffffff', '#e1e6ec', 0.8, FLW);
      toon(c, (c) => dot(c, 0, -36.2, 3.2), '#ffffff', '#e1e6ec', 0.9, FLW);
      eyes(c, 0, -20.6, 3.7, 1.6, m, lx);
      blush(c, 0, -17.6, 6.4);
      c.beginPath();
      if (m === 2) {
        tri(c, -2.4, -18.6, 2.4, -18.6, 0, -16.2);
        fill(c, PENG.beak);
        inkStroke(c, 1);
        c.beginPath();
        tri(c, -1.8, -15.6, 1.8, -15.6, 0, -13.8);
        fill(c, '#d9851c');
        inkStroke(c, 1);
      } else {
        tri(c, -2.4, -18.6, 2.4, -18.6, 0, -15.4);
        fill(c, PENG.beak);
        inkStroke(c, 1);
      }
      toon(
        c,
        (c) => {
          oval(c, -4.6, -0.4, 3.8, 2);
          oval(c, 4.6, -0.4, 3.8, 2);
        },
        PENG.beak,
        '#d9851c',
        0.8,
        FLW,
      );
    },
    limbs: [1, -1].map(
      (side): LimbDef => ({
        px: 10.4,
        py: -19,
        mirror: side < 0,
        rest: 2.72,
        up: 1.05,
        amp: 0.07,
        spd: 2.6 + side * 0.3,
        camp: 0.5,
        cspd: 14,
        paint(c) {
          toon(c, (c) => oval(c, 0, -7, 3.1, 8.4), PENG.base, PENG.shade, 1.1, FLW);
        },
      }),
    ),
  },
  // a hamster with stuffed cheeks and a box of popcorn
  hamster: {
    body(c, m, lx) {
      toon(
        c,
        (c) => {
          oval(c, 0, -13, 13.2, 13);
          dot(c, -8.4, -24, 3.9);
          dot(c, 8.4, -24, 3.9);
        },
        HAM.base,
        HAM.shade,
        2.2,
        FLW,
      );
      c.beginPath();
      dot(c, -8.2, -24, 2);
      dot(c, 8.6, -24, 2);
      fill(c, HAM.pink);
      c.beginPath();
      oval(c, 0.4, -8.6, 8.8, 8);
      fill(c, HAM.belly);
      // stuffed cheeks
      c.beginPath();
      oval(c, -7.4, -14.6, 3.8, 3.2);
      oval(c, 7.4, -14.6, 3.8, 3.2);
      fill(c, HAM.belly);
      c.beginPath();
      oval(c, 0, -15.6, 4, 2.8);
      fill(c, HAM.belly);
      eyes(c, 0, -19.2, 4.7, 1.8, m, lx);
      c.beginPath();
      oval(c, 0, -16.9, 1.4, 1);
      fill(c, '#e58a80');
      if (m === 2) mouth(c, 0, -15.2, 2.2, 2);
      else {
        wMouth(c, 0, -15.8, 1.6, 0);
        c.beginPath();
        box(c, -1, -15.2, 2, 1.8, 0.4);
        fill(c, WHITE);
        inkStroke(c, 0.7);
      }
      blush(c, 0, -15.4, 9.4, 'rgba(255, 120, 110, 0.3)');
      c.beginPath();
      oval(c, -5, -0.6, 3, 1.8);
      oval(c, 5, -0.6, 3, 1.8);
      fill(c, HAM.pink);
      inkStroke(c, 1.1);
    },
    limbs: [
      {
        px: 0,
        py: -4,
        rest: 0,
        up: 0,
        amp: 0.05,
        spd: 2.2,
        camp: 0.32,
        cspd: 9,
        paint(c) {
          // popcorn on top, then the striped box, then the paws holding it
          const puffs: [number, number, number][] = [
            [-4.4, -13.6, 2.6],
            [0, -15.4, 2.9],
            [4.4, -13.8, 2.6],
            [-2, -17.4, 2.3],
            [2.6, -17.8, 2.1],
          ];
          toon(
            c,
            (c) => {
              for (const [x, y, r] of puffs) dot(c, x, y, r);
            },
            '#fff8e1',
            '#f1d9a0',
            0.9,
            1.2,
          );
          const tub = (c: Ctx) => {
            c.moveTo(-5.8, -1);
            c.lineTo(5.8, -1);
            c.lineTo(7.2, -13);
            c.lineTo(-7.2, -13);
            c.closePath();
          };
          toon(c, tub, '#ffffff', '#e4e8ee', 1, FLW);
          c.save();
          c.beginPath();
          tub(c);
          c.clip();
          c.fillStyle = GOLD;
          for (const x of [-5.4, -0.9, 3.6]) c.fillRect(x, -14, 2.4, 14);
          c.restore();
          c.beginPath();
          tub(c);
          inkStroke(c, FLW);
          c.beginPath();
          dot(c, -6.6, -6.6, 2.5);
          dot(c, 6.6, -6.6, 2.5);
          fill(c, HAM.base);
          inkStroke(c, 1.1);
        },
      },
    ],
  },
};

/** Paint a fan's three faces and its limbs into sprites at the size it is drawn. */
function makeFan(kind: string, x: number, y: number, sc: number, lx: number, ph: number, ratio: number): Fan {
  const def = KINDS[kind];
  const body = ([0, 1, 2] as Mode[]).map((m) =>
    layer(BW * sc, BH * sc, ratio, (c) => {
      c.scale(sc, sc);
      c.translate(BX, BY);
      def.body(c, m, lx);
    }),
  );
  const limbs = def.limbs.map((d) => ({
    ...d,
    img: layer(LW * sc, LH * sc, ratio, (c) => {
      c.scale(sc, sc);
      c.translate(LX, LY);
      d.paint(c);
    }),
  }));
  return { x, y, sc, ph, body, limbs };
}

// ------------------------------------------------------------------ the arena

/** Where the seven fans sit: kind, the bench they sit on, how they look. */
interface Seat {
  kind: string;
  /** the far stand: row and ax; a bleacher: side, row and ay */
  stand: 'far' | 'side';
  side?: number;
  row: number;
  at: number;
  lx: number;
}
const SEATS: Seat[] = [
  { kind: 'frog', stand: 'far', row: 1, at: 74, lx: 0.6 },
  { kind: 'bird', stand: 'far', row: 2, at: 236, lx: 0 },
  { kind: 'cat', stand: 'far', row: 0, at: 372, lx: -0.6 },
  { kind: 'bear', stand: 'side', side: 0, row: 0, at: 30, lx: 1 },
  { kind: 'bunny', stand: 'side', side: 0, row: 0, at: 146, lx: 1 },
  { kind: 'penguin', stand: 'side', side: 1, row: 0, at: 76, lx: -1 },
  { kind: 'hamster', stand: 'side', side: 1, row: 0, at: 196, lx: -1 },
];
const FAN_K = 1.26;
const FAN_SHADOW = 'rgba(90, 64, 30, 0.26)';

interface TallFlag {
  base: P;
  top: P;
  len: number;
  h: number;
  dir: number;
  team: number;
  ph: number;
}

export class Arena {
  private ratio = 1;
  private back?: HTMLCanvasElement;
  private front?: HTMLCanvasElement;
  private veil?: HTMLCanvasElement;
  private stageBack?: HTMLCanvasElement;
  private lobby?: HTMLCanvasElement;
  private fans: Fan[] = [];
  private stageFans: Fan[] = [];
  private flags: TallFlag[] = [];
  private cheerAmt = 0;

  /** Cache every static layer at the device pixel ratio. Call again when the ratio changes. */
  build(ratio: number) {
    this.ratio = ratio;
    this.flags = [this.tallFlag(FS.x1 + 6, fsFront(FS.rows) - 2, 1, 1), this.tallFlag(22, AH + 122, 0, 1)];
    this.back = layer(W, H, ratio, (c) => this.paintBack(c), true);
    this.front = layer(W, FRONT_H, ratio, (c) => {
      c.translate(0, -FRONT_Y);
      goal(c, true);
      cornerFlag(c, 0, AH, -1, 'flag');
      cornerFlag(c, AW, AH, 1, 'flag');
    });
    this.veil = layer(W, H, ratio, (c) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255, 251, 242, 0.42)');
      g.addColorStop(0.5, 'rgba(255, 251, 242, 0.5)');
      g.addColorStop(1, 'rgba(255, 251, 242, 0.44)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    });
    this.fans = SEATS.map((s, i) => {
      let p: P;
      let d: number;
      if (s.stand === 'far') {
        const ay = fsFront(s.row) - FS.step * 0.55;
        p = pt(s.at, ay, fsZ(s.row) + 5);
        d = depthScale(ay);
      } else {
        const side = s.side ?? 0;
        const ax = sideX(side, sbIn(s.row) + SB.step * 0.55);
        p = pt(ax, s.at, sbZ(s.row) + 5);
        d = depthScale(s.at);
      }
      return makeFan(s.kind, p[0], p[1], d * FAN_K, s.lx, i * 1.37 + 0.4, ratio);
    });
    this.stageBack = layer(W, STAGE.h, ratio, (c) => this.paintStage(c), true);
    this.stageFans = [makeFan('bird', 134, S_ROWS[2] - 6, 1.0, 0.5, 0.7, ratio), makeFan('frog', 292, S_ROWS[1] - 6, 1.0, -0.3, 2.9, ratio)];
    this.lobby = layer(W, H, ratio, (c) => this.paintLobby(c), true);
  }

  /** Let the fans settle after a cheer. */
  update(dt: number) {
    this.cheerAmt = Math.max(0, this.cheerAmt - dt * 0.9);
  }

  /** Make the fans jump up and wave for a moment (amount 0..1). */
  cheer(amount: number) {
    this.cheerAmt = Math.min(1, Math.max(this.cheerAmt, amount));
  }

  /** The whole stadium behind the fighters, with the fans. */
  drawBattle(ctx: Ctx, t: number) {
    if (!this.back) this.build(this.ratio);
    ctx.drawImage(this.back!, 0, 0, W, H);
    this.drawFlags(ctx, t);
    this.drawFans(ctx, this.fans, t);
  }

  /** In front of the fighters: only the near goal and the near corner flags. */
  drawBattleFront(ctx: Ctx, _t: number) {
    if (!this.front) this.build(this.ratio);
    ctx.drawImage(this.front!, 0, FRONT_Y, W, FRONT_H);
  }

  /** The same sunny ground, softened, so the matchmaking and result panels read on top of it. */
  drawDusk(ctx: Ctx, t: number) {
    this.drawBattle(ctx, t);
    ctx.drawImage(this.front!, 0, FRONT_Y, W, FRONT_H);
    ctx.drawImage(this.veil!, 0, 0, W, H);
  }

  /** The lobby strip on STAGE: pitch level, the touchline, a little stand with two fans. Pets stand on STAGE_GROUND_Y. */
  drawStage(ctx: Ctx, t: number) {
    if (!this.stageBack) this.build(this.ratio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.clip();
    ctx.drawImage(this.stageBack!, STAGE.x, STAGE.y, W, STAGE.h);
    ctx.translate(STAGE.x, STAGE.y);
    this.drawFans(ctx, this.stageFans, t);
    ctx.restore();
  }

  /** The quiet full-screen background behind the lobby's panels. */
  drawLobbyBack(ctx: Ctx, _t: number) {
    if (!this.lobby) this.build(this.ratio);
    ctx.drawImage(this.lobby!, 0, 0, W, H);
  }

  // ---------------------------------------------------------------- per frame

  private drawFans(ctx: Ctx, fans: Fan[], t: number) {
    const ch = this.cheerAmt;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      const sc = f.sc;
      // cheering spreads over the stands: each fan joins a moment after the last
      const k = ch > 0.01 ? Math.min(1, Math.max(0, (ch * 1.4 - ((i * 0.13) % 0.4)) * 2.2)) : 0;
      // idle: a slow sway, now and then a little hop
      const hp = (t * 0.32 + f.ph * 0.37) % 3.2;
      let hop = hp < 0.34 ? Math.sin((hp / 0.34) * Math.PI) * 2.6 * sc : 0;
      let sway = Math.sin(t * 1.25 + f.ph * 2.1) * 0.045;
      if (k > 0) {
        hop = hop * (1 - k) + Math.abs(Math.sin(t * 8.5 + f.ph * 3)) * 9 * sc * k;
        sway = sway * (1 - k) + Math.sin(t * 6.3 + f.ph) * 0.09 * k;
      }
      const bl = (t * 0.6 + f.ph * 0.71) % 3.6;
      const mode = k > 0.3 ? 2 : bl < 0.11 ? 1 : 0;
      // the contact shadow on the bench: smaller and fainter in the air
      const lift = hop / (12 * sc);
      ctx.globalAlpha = 1 - lift * 0.6;
      ctx.fillStyle = FAN_SHADOW;
      ctx.beginPath();
      ctx.ellipse(f.x + 2 * sc, f.y + 0.6 * sc, 11.5 * sc * (1 - lift * 0.25), 2.6 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(f.x, f.y - hop);
      ctx.rotate(sway);
      for (let pass = 0; pass < 2; pass++) {
        if (pass === 1) ctx.drawImage(f.body[mode], -BX * sc, -BY * sc, BW * sc, BH * sc);
        for (let j = 0; j < f.limbs.length; j++) {
          const l = f.limbs[j];
          if (!!l.behind !== (pass === 0)) continue;
          const idle = l.rest + Math.sin(t * l.spd + f.ph * 1.7 + j * 0.9) * l.amp;
          const cheer = l.up + Math.sin(t * l.cspd + f.ph + j * 1.3) * l.camp;
          const a = idle + (cheer - idle) * k;
          ctx.save();
          ctx.translate((l.mirror ? -l.px : l.px) * sc, l.py * sc);
          if (l.mirror) ctx.scale(-1, 1);
          ctx.rotate(a);
          ctx.drawImage(l.img, -LX * sc, -LY * sc, LW * sc, LH * sc);
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  private tallFlag(ax: number, ay: number, team: number, dir: number): TallFlag {
    const z = 96;
    const s = depthScale(ay);
    return { base: pt(ax, ay), top: pt(ax, ay, z), len: 30 * s, h: 18 * s, dir, team, ph: ay * 0.01 };
  }

  /** The two team flags on their tall poles, waving in the breeze. */
  private drawFlags(ctx: Ctx, t: number) {
    for (const f of this.flags) {
      const [x, y] = f.top;
      const N = 7;
      const wave = (u: number) => Math.sin(t * 3.4 + f.ph - u * 4.2) * 2.4 * u;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        ctx.lineTo(x + f.dir * f.len * u, y + 1 + wave(u) + u * 1.5);
      }
      for (let i = N; i >= 0; i--) {
        const u = i / N;
        ctx.lineTo(x + f.dir * f.len * u, y + 1 + f.h * (1 - u * 0.18) + wave(u) + u * 1.5);
      }
      ctx.closePath();
      ctx.fillStyle = TEAM[f.team].main;
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      // a lighter stripe through the middle and the shaded fold
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        ctx.lineTo(x + f.dir * f.len * u, y + 1 + f.h * 0.42 * (1 - u * 0.18) + wave(u) + u * 1.5);
      }
      for (let i = N; i >= 0; i--) {
        const u = i / N;
        ctx.lineTo(x + f.dir * f.len * u, y + 1 + f.h * 0.6 * (1 - u * 0.18) + wave(u) + u * 1.5);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      // the gold ball on top of the pole
      ctx.beginPath();
      ctx.arc(x, y - 1.5, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- the battle backdrop

  private paintBack(c: Ctx) {
    this.paintSky(c, 0, 260);
    this.paintHorizon(c);
    this.paintGround(c);
    this.paintFarStand(c);
    for (const side of [0, 1]) this.paintBleacher(c, side);
    this.paintRim(c, 'far');
    this.paintRim(c, 'sides');
    goalShadow(c, false);
    goal(c, false);
    cornerFlag(c, 0, 0, -1);
    cornerFlag(c, AW, 0, 1);
    // the near goal and corner flags stand in front of the fighters (drawBattleFront); only their shadows lie here
    goalShadow(c, true);
    cornerFlag(c, 0, AH, -1, 'shadow');
    cornerFlag(c, AW, AH, 1, 'shadow');
    this.paintRim(c, 'near');
    this.paintNearSide(c);
    for (const f of this.flags) this.flagPole(c, f);
  }

  private paintSky(c: Ctx, y0: number, y1: number) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.55, SKY_MID);
    g.addColorStop(1, SKY_LOW);
    c.fillStyle = g;
    c.fillRect(0, y0, W, y1 - y0);
    // the sun's warm glow at the upper left
    const s = c.createRadialGradient(10, y0 - 10, 0, 10, y0 - 10, 340);
    s.addColorStop(0, 'rgba(255, 252, 228, 0.95)');
    s.addColorStop(0.25, 'rgba(255, 246, 210, 0.45)');
    s.addColorStop(1, 'rgba(255, 246, 210, 0)');
    c.fillStyle = s;
    c.fillRect(0, y0, W, y1 - y0);
  }

  private paintHorizon(c: Ctx) {
    cloud(c, 410, 112, 0.9, 0.95);
    cloud(c, 150, 70, 0.62, 0.7);
    cloud(c, 500, 168, 0.5, 0.85);
    // far hills, then nearer ones, hazy and calm
    c.beginPath();
    c.moveTo(0, 210);
    c.lineTo(0, 172);
    c.bezierCurveTo(60, 150, 120, 150, 190, 170);
    c.bezierCurveTo(250, 186, 300, 160, 370, 152);
    c.bezierCurveTo(440, 146, 500, 160, 540, 170);
    c.lineTo(540, 210);
    c.closePath();
    c.fillStyle = HILL_FAR;
    c.fill();
    c.beginPath();
    c.moveTo(0, 220);
    c.lineTo(0, 186);
    c.bezierCurveTo(70, 172, 150, 176, 220, 190);
    c.bezierCurveTo(290, 200, 360, 178, 430, 176);
    c.bezierCurveTo(480, 175, 520, 182, 540, 186);
    c.lineTo(540, 220);
    c.closePath();
    c.fillStyle = HILL_NEAR;
    c.fill();
    // the ground from the hills down
    const top = 196;
    const g = c.createLinearGradient(0, top, 0, 320);
    g.addColorStop(0, '#9fd877');
    g.addColorStop(1, VERGE);
    c.fillStyle = g;
    c.fillRect(0, top, W, H - top);
    // trees along the far edge, more at the sides where the stand does not hide them
    tree(c, -96, -150, 24, LEAF2);
    tree(c, -40, -176, 20);
    tree(c, 6, -140, 26);
    tree(c, 140, -190, 16, LEAF2);
    tree(c, 330, -192, 15);
    tree(c, 462, -144, 25, LEAF2);
    tree(c, 520, -178, 19);
    tree(c, 560, -136, 23);
    bush(c, -60, -110, 16);
    bush(c, 512, -104, 15, LEAF);
  }

  private paintGround(c: Ctx) {
    // a few hand-drawn tufts on the verge outside the rim
    c.beginPath();
    for (let i = 0; i < 46; i++) {
      const side = i % 2;
      const ay = -120 + ((i * 97.3) % 1180);
      const ax = side ? AW + 36 + ((i * 37.1) % 60) : -36 - ((i * 53.7) % 60);
      const [x, y] = pt(ay > AH + 50 ? (i * 61.7) % AW : ax, ay > AH + 50 ? Math.min(ay, AH + 240) : ay);
      if (y < 200 || (ay > AH + 50 && ay < AH + 110)) continue;
      c.moveTo(x - 2.4, y - 2.6);
      c.lineTo(x - 0.8, y);
      c.lineTo(x, y - 3.4);
      c.lineTo(x + 0.8, y);
      c.lineTo(x + 2.4, y - 2.6);
    }
    c.strokeStyle = 'rgba(60, 130, 50, 0.55)';
    c.lineWidth = 1;
    c.stroke();
    // the mowed field inside the rim: stripes across, darker and lighter
    const field = [pt(RIM.x0, RIM.y0), pt(RIM.x1, RIM.y0), pt(RIM.x1, RIM.y1), pt(RIM.x0, RIM.y1)];
    c.save();
    shape(c, field);
    c.clip();
    fillShape(c, field, MOW[0]);
    const band = AH / 10;
    for (let i = -1; i < 12; i++) {
      if (i % 2 === 0) continue;
      fillShape(c, [pt(RIM.x0 - 10, i * band), pt(RIM.x1 + 10, i * band), pt(RIM.x1 + 10, (i + 1) * band), pt(RIM.x0 - 10, (i + 1) * band)], MOW[1]);
    }
    // a second, fainter mowing across: soft lanes up the pitch
    const lane = AW / 6;
    for (let i = 0; i < 6; i += 2) fillShape(c, [pt(i * lane, RIM.y0 - 10), pt((i + 1) * lane, RIM.y0 - 10), pt((i + 1) * lane, RIM.y1 + 10), pt(i * lane, RIM.y1 + 10)], 'rgba(255, 255, 240, 0.045)');
    // the sun: warm light from the upper left, a touch deeper toward the lower right
    const lg = c.createRadialGradient(40, 240, 0, 40, 240, 820);
    lg.addColorStop(0, 'rgba(255, 250, 214, 0.32)');
    lg.addColorStop(0.55, 'rgba(255, 250, 214, 0.06)');
    lg.addColorStop(1, 'rgba(255, 250, 214, 0)');
    c.fillStyle = lg;
    c.fillRect(0, 200, W, H - 200);
    const dg = c.createLinearGradient(0, 300, W, 1000);
    dg.addColorStop(0, 'rgba(20, 70, 30, 0)');
    dg.addColorStop(1, 'rgba(20, 70, 30, 0.08)');
    c.fillStyle = dg;
    c.fillRect(0, 200, W, H - 200);
    c.globalAlpha = 0.9;
    markings(c, 2.6);
    c.globalAlpha = 1;
    c.restore();
  }

  /** The little open stand behind the far goal: a cream front wall with a gold trim, rows of wooden benches. */
  private paintFarStand(c: Ctx) {
    const { x0, x1, rows } = FS;
    const back = fsFront(rows);
    const zTop = fsZ(rows - 1);
    // its shadow on the grass in front, down and to the right
    fillShape(c, [pt(x0, FS.front), pt(x1, FS.front), shd(x1, FS.front, FS.z0), shd(x1, back, zTop + 14), [pt(x1, back, 0)[0], pt(x1, back, 0)[1]]], SHADOW_SOFT);
    // the back wall: a backrest for the top row
    fillShape(c, [pt(x0, back, zTop), pt(x1, back, zTop), pt(x1, back, zTop + 14), pt(x0, back, zTop + 14)], CREAM_MID, 1.3);
    fillShape(c, [pt(x0, back, zTop + 14), pt(x1, back, zTop + 14), pt(x1, back - 5, zTop + 14), pt(x0, back - 5, zTop + 14)], CREAM, 1.3);
    for (let k = rows - 1; k >= 0; k--) {
      const f = fsFront(k);
      const b = f - FS.step;
      const z = fsZ(k);
      const zb = k ? fsZ(k - 1) : 0;
      // the tread (lit), with the shadow of the riser above falling on its back edge
      fillShape(c, [pt(x0, b, z), pt(x1, b, z), pt(x1, f, z), pt(x0, f, z)], CREAM);
      fillShape(c, [pt(x0, b, z), pt(x1, b, z), pt(x1, b + 3, z), pt(x0, b + 3, z)], SHADOW_STAND);
      // the riser below its front edge
      fillShape(c, [pt(x0, f, zb), pt(x1, f, zb), pt(x1, f, z), pt(x0, f, z)], k ? CREAM_MID : CREAM_MID);
      seg(c, pt(x0, f, z), pt(x1, f, z), 'rgba(255, 255, 255, 0.9)', 1);
      // the bench: a wooden plank on short legs, its shadow on the tread
      const bf = f - FS.step * 0.32;
      const bb = f - FS.step * 0.78;
      const bz = z + 5;
      fillShape(c, [pt(x0 + 6, bb, z), pt(x1 - 6, bb, z), pt(x1 - 2, bf + 2, z), pt(x0 + 10, bf + 2, z)], SHADOW_STAND);
      fillShape(c, [pt(x0 + 4, bf, z + 1.5), pt(x1 - 4, bf, z + 1.5), pt(x1 - 4, bf, bz), pt(x0 + 4, bf, bz)], WOOD, 1, WOOD_EDGE);
      fillShape(c, [pt(x0 + 4, bb, bz), pt(x1 - 4, bb, bz), pt(x1 - 4, bf, bz), pt(x0 + 4, bf, bz)], WOOD_TOP, 1, WOOD_EDGE);
      // plank joints
      c.beginPath();
      for (let ax = x0 + 4 + 57; ax < x1 - 20; ax += 57) {
        const a = pt(ax, bb, bz);
        const d = pt(ax, bf, bz);
        c.moveTo(a[0], a[1]);
        c.lineTo(d[0], d[1]);
        const e = pt(ax, bf, z + 1.5);
        c.lineTo(e[0], e[1]);
      }
      c.strokeStyle = 'rgba(150, 92, 40, 0.5)';
      c.lineWidth = 0.9;
      c.stroke();
      // the outline of the step
      seg(c, pt(x0, f, z), pt(x1, f, z), STEP_EDGE, 1);
    }
    // the cheek walls at both ends, sloping up with the rows
    for (const [ax, dir] of [
      [x0, 1],
      [x1, -1],
    ] as [number, number][]) {
      const o = ax - dir * 5;
      const lo: P[] = [pt(ax, FS.front, FS.z0 + 6), pt(ax, back, zTop + 14)];
      const hi: P[] = [pt(o, FS.front, FS.z0 + 6), pt(o, back, zTop + 14)];
      const steps: P[] = [pt(ax, FS.front, 0)];
      for (let k = 0; k < rows; k++) {
        steps.push(pt(ax, fsFront(k), fsZ(k)));
        steps.push(pt(ax, fsFront(k) - FS.step, fsZ(k)));
      }
      fillShape(c, [...steps, lo[1], lo[0]], CREAM_SH, 1.2);
      fillShape(c, [lo[0], lo[1], hi[1], hi[0]], CREAM, 1.2);
      fillShape(c, [pt(ax, FS.front, 0), pt(o, FS.front, 0), hi[0], lo[0]], CREAM_MID, 1.2);
    }
    // the front wall with a thin gold band along its top
    const fw = [pt(x0, FS.front, 0), pt(x1, FS.front, 0), pt(x1, FS.front, FS.z0), pt(x0, FS.front, FS.z0)];
    fillShape(c, fw, CREAM_MID, 1.3);
    fillShape(c, [pt(x0, FS.front, FS.z0 - 3.4), pt(x1, FS.front, FS.z0 - 3.4), pt(x1, FS.front, FS.z0 - 1.2), pt(x0, FS.front, FS.z0 - 1.2)], GOLD);
    // the stand's two ends, a clean outline of the stepped profile
    for (const ax of [x0, x1]) {
      c.beginPath();
      const p0 = pt(ax, FS.front, 0);
      c.moveTo(p0[0], p0[1]);
      for (let k = 0; k < rows; k++) {
        const a = pt(ax, fsFront(k), fsZ(k));
        const b = pt(ax, fsFront(k) - FS.step, fsZ(k));
        c.lineTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
      }
      const q = pt(ax, back, zTop + 14);
      c.lineTo(q[0], q[1]);
      c.strokeStyle = INK;
      c.lineWidth = 1.3;
      c.stroke();
    }
  }

  /** A short bleacher along a touchline in the far half: two rows of benches climbing outward. */
  private paintBleacher(c: Ctx, side: number) {
    const [a0, a1] = SB_SPAN[side];
    const rows = SB.rows;
    const outer = sbIn(rows);
    const zTop = sbZ(rows - 1);
    const X = (d: number) => sideX(side, d);
    const lit = side === 1; // the right bleacher's faces turn to the sun
    // the shadow it throws
    if (side === 0) fillShape(c, [pt(X(SB.inner), a0), shd(X(SB.inner), a0, SB.z0), shd(X(SB.inner), a1, SB.z0), pt(X(SB.inner), a1)], SHADOW_SOFT);
    else fillShape(c, [pt(X(outer), a0), shd(X(outer + 4), a0, zTop + 12), shd(X(outer + 4), a1, zTop + 12), pt(X(outer), a1)], SHADOW_SOFT);
    // the backrest along the outer edge
    fillShape(c, [pt(X(outer), a0, zTop), pt(X(outer), a1, zTop), pt(X(outer), a1, zTop + 12), pt(X(outer), a0, zTop + 12)], lit ? CREAM_MID : CREAM_SH, 1.2);
    fillShape(c, [pt(X(outer), a0, zTop + 12), pt(X(outer), a1, zTop + 12), pt(X(outer + 4), a1, zTop + 12), pt(X(outer + 4), a0, zTop + 12)], CREAM, 1.2);
    for (let k = rows - 1; k >= 0; k--) {
      const i0 = sbIn(k);
      const i1 = sbIn(k + 1);
      const z = sbZ(k);
      const zb = k ? sbZ(k - 1) : 0;
      fillShape(c, [pt(X(i0), a0, z), pt(X(i1), a0, z), pt(X(i1), a1, z), pt(X(i0), a1, z)], CREAM);
      fillShape(c, [pt(X(i0), a0, zb), pt(X(i0), a1, zb), pt(X(i0), a1, z), pt(X(i0), a0, z)], lit ? CREAM_MID : CREAM_SH, 1.1);
      // a gold band along the top of the riser
      fillShape(c, [pt(X(i0), a0, z - 3.2), pt(X(i0), a1, z - 3.2), pt(X(i0), a1, z - 1.2), pt(X(i0), a0, z - 1.2)], GOLD);
      // short benches along the row, a gap between each
      const bi = i0 + SB.step * 0.3;
      const bo = i0 + SB.step * 0.74;
      const bz = z + 5;
      const n = 3;
      const len = (a1 - a0 - 8) / n;
      for (let j = 0; j < n; j++) {
        const b0 = a0 + 4 + j * len + 3;
        const b1 = b0 + len - 6;
        fillShape(c, [pt(X(bi), b0 + 3, z), pt(X(bo + 3), b0 + 5, z), pt(X(bo + 3), b1 + 2, z), pt(X(bi), b1 + 3, z)], SHADOW_STAND);
        fillShape(c, [pt(X(bi), b0, z + 1.5), pt(X(bi), b1, z + 1.5), pt(X(bi), b1, bz), pt(X(bi), b0, bz)], lit ? WOOD : WOOD_SH, 1, WOOD_EDGE);
        fillShape(c, [pt(X(bi), b0, bz), pt(X(bo), b0, bz), pt(X(bo), b1, bz), pt(X(bi), b1, bz)], WOOD_TOP, 1, WOOD_EDGE);
        fillShape(c, [pt(X(bi), b1, z + 1.5), pt(X(bo), b1, z + 1.5), pt(X(bo), b1, bz), pt(X(bi), b1, bz)], WOOD, 1, WOOD_EDGE);
      }
    }
    // the near end: the stepped profile, facing us
    const prof: P[] = [pt(X(SB.inner), a1, 0)];
    for (let k = 0; k < rows; k++) {
      prof.push(pt(X(sbIn(k)), a1, sbZ(k)));
      prof.push(pt(X(sbIn(k + 1)), a1, sbZ(k)));
    }
    prof.push(pt(X(outer), a1, zTop + 12));
    prof.push(pt(X(outer + 4), a1, zTop + 12));
    prof.push(pt(X(outer + 4), a1, 0));
    fillShape(c, prof, CREAM_MID, 1.3);
    fillShape(c, [pt(X(SB.inner), a1, SB.z0 - 3.2), pt(X(SB.inner), a1, SB.z0 - 1.2), pt(X(SB.inner + 0.01), a1, SB.z0 - 1.2)], GOLD);
  }

  /** The low cream rim round the field: a rounded top, a shaded face, a soft shadow. */
  private paintRim(c: Ctx, part: 'far' | 'sides' | 'near') {
    const { x0, x1, y0, y1, z, t } = RIM;
    if (part === 'far') {
      fillShape(c, [pt(x0, y0), pt(x1, y0), shd(x1, y0, z), shd(x0, y0, z)], SHADOW);
      fillShape(c, [pt(x0, y0, 0), pt(x1, y0, 0), pt(x1, y0, z), pt(x0, y0, z)], CREAM_MID, 1.2);
      fillShape(c, [pt(x0, y0 - t, z), pt(x1, y0 - t, z), pt(x1, y0, z), pt(x0, y0, z)], CREAM, 1.2);
    } else if (part === 'sides') {
      // left: its inner face turns away from the sun; right: toward it
      fillShape(c, [pt(x0, y0), pt(x0, y1), shd(x0, y1, z), shd(x0, y0, z)], SHADOW);
      fillShape(c, [pt(x0, y0, 0), pt(x0, y1, 0), pt(x0, y1, z), pt(x0, y0, z)], CREAM_SH, 1.2);
      fillShape(c, [pt(x0 - t, y0, z), pt(x0, y0, z), pt(x0, y1, z), pt(x0 - t, y1, z)], CREAM, 1.2);
      fillShape(c, [pt(x1, y0, 0), pt(x1, y1, 0), pt(x1, y1, z), pt(x1, y0, z)], CREAM_MID, 1.2);
      fillShape(c, [pt(x1, y0, z), pt(x1 + t, y0, z), pt(x1 + t, y1, z), pt(x1, y1, z)], CREAM, 1.2);
    } else {
      fillShape(c, [pt(x0 - t, y1, z), pt(x1 + t, y1, z), pt(x1 + t, y1 + t, z), pt(x0 - t, y1 + t, z)], CREAM, 1.2);
      fillShape(c, [pt(x0 - t, y1 + t, 0), pt(x1 + t, y1 + t, 0), pt(x1 + t, y1 + t, z), pt(x0 - t, y1 + t, z)], CREAM_MID, 1.2);
      fillShape(c, [pt(x0 - t, y1 + t), pt(x1 + t, y1 + t), shd(x1 + t, y1 + t, z * 0.4), shd(x0 - t, y1 + t, z * 0.4)], SHADOW_SOFT);
    }
  }

  /** Below the near rim: a sandy path, the bench of the home side, a ball bag, bushes and two big trees. */
  private paintNearSide(c: Ctx) {
    const pa = AH + 62;
    const pb = AH + 98;
    fillShape(c, [pt(-400, pa), pt(AW + 400, pa), pt(AW + 400, pb), pt(-400, pb)], PATH);
    seg(c, pt(-400, pa), pt(AW + 400, pa), PATH_EDGE, 1.6);
    seg(c, pt(-400, pb), pt(AW + 400, pb), PATH_EDGE, 1.6);
    // little flowers on the grass
    const fl: [number, number, string][] = [
      [70, 1000, '#ffffff'],
      [96, 1012, GOLD],
      [330, 1004, '#ffffff'],
      [356, 1022, '#ffffff'],
      [214, 1030, GOLD],
      [-14, 930, '#ffffff'],
      [AW + 12, 948, GOLD],
    ];
    for (const [ax, ay, col] of fl) {
      const [x, y] = pt(ax, ay);
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        dot(c, x + Math.cos(a) * 2.2, y + Math.sin(a) * 1.4, 1.6);
      }
      c.fillStyle = col;
      c.fill();
      c.beginPath();
      dot(c, x, y, 1.1);
      c.fillStyle = col === GOLD ? '#ffffff' : GOLD;
      c.fill();
    }
    bush(c, 150, AH + 146, 22);
    bush(c, -36, AH + 126, 20, LEAF);
    ball(c, 262, AH + 128, 8);
    this.cart(c, 372, AH + 150);
    tree(c, -44, AH + 214, 44, LEAF, 1);
    tree(c, AW + 50, AH + 196, 40, LEAF2, 1);
    // a low round hedge along the bottom edge frames the view
    const hy = AH + 248;
    const hs = depthScale(hy);
    const [, hY] = pt(0, hy);
    toon(
      c,
      (c) => {
        for (let x = -20, i = 0; x < W + 30; x += 34, i++) dot(c, x, hY - 6 - (i % 2) * 5, 24 * hs + (i % 3) * 2);
        c.rect(-30, hY - 4, W + 60, 60);
      },
      LEAF.base,
      LEAF.shade,
      3,
      1.4,
      LEAF.light,
    );
  }

  /** A little lemonade cart under a gold-and-white sunshade. */
  private cart(c: Ctx, ax: number, ay: number) {
    const s = depthScale(ay);
    const [x, y] = pt(ax, ay);
    const u = (v: number) => v * s;
    softShadow(c, x + u(14), y + u(2), u(40), u(9), 0.3);
    // the pole of the shade
    tube(c, [x + u(2), y - u(20)], [x + u(2), y - u(70)], u(2.2));
    // the cart: a cream box with a wooden top
    toon(c, (c) => box(c, x - u(24), y - u(30), u(48), u(24), u(4)), CREAM, CREAM_SH, u(2.4), 1.3);
    c.fillStyle = GOLD;
    c.fillRect(x - u(23), y - u(20), u(46), u(3));
    toon(c, (c) => box(c, x - u(27), y - u(34), u(54), u(6), u(2)), WOOD_TOP, WOOD, u(1.2), 1.3);
    // a jug and two glasses on top
    toon(c, (c) => box(c, x - u(17), y - u(46), u(10), u(13), u(3)), '#fff3b0', '#f2d66e', u(1), 1.1);
    for (const gx of [-2, 6]) toon(c, (c) => box(c, x + u(gx), y - u(41), u(6), u(8), u(1.5)), '#fff6c8', '#f0dc8c', u(0.8), 1.1);
    // wheels
    for (const wx of [-14, 14]) {
      toon(c, (c) => dot(c, x + u(wx), y - u(5), u(6)), '#5d6b7c', '#3f4a58', u(1.2), 1.3);
      c.beginPath();
      dot(c, x + u(wx), y - u(5), u(2));
      c.fillStyle = '#e6ebf1';
      c.fill();
    }
    // the sunshade: a shallow dome in gold and white segments
    const cx = x + u(2);
    const cy = y - u(72);
    const rw = u(34);
    const rh = u(12);
    const dome = (c: Ctx) => {
      c.moveTo(cx - rw, cy + rh * 0.5);
      c.quadraticCurveTo(cx, cy - rh * 1.6, cx + rw, cy + rh * 0.5);
      c.closePath();
    };
    toon(c, dome, WHITE, '#e8e2d6', u(1.4), 1.3);
    c.save();
    c.beginPath();
    dome(c);
    c.clip();
    c.fillStyle = GOLD;
    for (let i = -3; i <= 3; i += 2) {
      c.beginPath();
      c.moveTo(cx, cy - rh * 1.2);
      c.lineTo(cx + (i * rw) / 3.2, cy + rh);
      c.lineTo(cx + ((i + 1) * rw) / 3.2, cy + rh);
      c.closePath();
      c.fill();
    }
    c.restore();
    c.beginPath();
    dome(c);
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.stroke();
    c.beginPath();
    dot(c, cx, cy - rh * 0.55, u(2.2));
    c.fillStyle = GOLD;
    c.fill();
    c.stroke();
  }

  private flagPole(c: Ctx, f: TallFlag) {
    const [bx, by] = f.base;
    const len = by - f.top[1];
    softShadow(c, bx + 2, by + 1, 6, 2.2, 0.3);
    seg(c, f.base, [bx + len * 0.55, by + len * 0.22], SHADOW_SOFT, 2.4);
    tube(c, f.base, f.top, 2.2);
  }

  // ---------------------------------------------------------------- the lobby strip (pitch level)

  private paintStage(c: Ctx) {
    const h = STAGE.h;
    this.paintSky(c, 0, 130);
    cloud(c, 420, 44, 0.75, 0.95);
    cloud(c, 210, 26, 0.45, 0.7);
    // hills and trees on the horizon
    c.beginPath();
    c.moveTo(0, 130);
    c.lineTo(0, 102);
    c.bezierCurveTo(80, 84, 170, 90, 250, 104);
    c.bezierCurveTo(330, 116, 420, 88, 540, 96);
    c.lineTo(540, 130);
    c.closePath();
    c.fillStyle = HILL_FAR;
    c.fill();
    c.fillStyle = '#9fd877';
    c.fillRect(0, 118, W, h - 118);
    const treeAt = (x: number, y: number, r: number, pal = LEAF) => {
      softShadow(c, x + r * 0.5, y, r * 1.2, r * 0.3, 0.24);
      toon(c, (c) => box(c, x - r * 0.13, y - r * 1.05, r * 0.26, r * 1.07, r * 0.08), TRUNK, TRUNK_SH, r * 0.06, 1.3);
      const cy = y - r * 1.45;
      toon(
        c,
        (c) => {
          dot(c, x, cy - r * 0.3, r * 0.78);
          dot(c, x - r * 0.52, cy + r * 0.12, r * 0.6);
          dot(c, x + r * 0.55, cy + r * 0.16, r * 0.56);
          oval(c, x, cy + r * 0.3, r * 0.85, r * 0.4);
        },
        pal.base,
        pal.shade,
        r * 0.12,
        1.4,
        pal.light,
      );
    };
    treeAt(24, 126, 22, LEAF2);
    treeAt(400, 122, 18);
    treeAt(452, 126, 24, LEAF2);
    treeAt(512, 120, 15);
    // the little stand: three rows of benches seen from the front, under a light canopy
    const sx0 = S_X0;
    const sx1 = S_X1;
    const top = S_ROWS[2] - 16;
    // its shadow on the grass to the right
    fillShape(c, [[sx1 + 8, top - 18], [sx1 + 34, top + 8], [sx1 + 34, S_RIM + 4], [sx1 + 8, S_RIM]], SHADOW_SOFT);
    fillShape(c, [[sx0, top], [sx1, top], [sx1, S_RIM], [sx0, S_RIM]], CREAM_MID, 1.2);
    for (let k = 2; k >= 0; k--) {
      const y = S_ROWS[k];
      const yb = k ? S_ROWS[k - 1] - 9 : S_RIM;
      // the riser under the row, a little darker toward its foot
      const rg = c.createLinearGradient(0, y, 0, yb);
      rg.addColorStop(0, CREAM_MID);
      rg.addColorStop(1, CREAM_SH);
      c.fillStyle = rg;
      c.fillRect(sx0, y, sx1 - sx0, yb - y);
      c.fillStyle = CREAM;
      c.fillRect(sx0, y - 2.5, sx1 - sx0, 2.5);
      seg(c, [sx0, y], [sx1, y], STEP_EDGE, 1);
      // the bench: its shadow on the riser, the front of the plank, the top just seen
      c.fillStyle = SHADOW_STAND;
      c.fillRect(sx0 + 4, y - 3, sx1 - sx0 - 8, 4);
      fillShape(c, [[sx0 + 5, y - 9], [sx1 - 5, y - 9], [sx1 - 5, y - 7], [sx0 + 5, y - 7]], WOOD_TOP, 1, WOOD_EDGE);
      fillShape(c, [[sx0 + 5, y - 7], [sx1 - 5, y - 7], [sx1 - 5, y - 3.5], [sx0 + 5, y - 3.5]], WOOD, 1, WOOD_EDGE);
      c.beginPath();
      for (let x = sx0 + 5 + 53; x < sx1 - 20; x += 53) {
        c.moveTo(x, y - 9);
        c.lineTo(x, y - 3.5);
      }
      c.strokeStyle = 'rgba(150, 92, 40, 0.5)';
      c.lineWidth = 0.9;
      c.stroke();
    }
    // the cheek walls at both ends
    for (const x of [sx0 - 7, sx1]) {
      toon(c, (c) => box(c, x, top - 2, 7, S_RIM - top + 2, 1.5), CREAM, CREAM_SH, 1.2, 1.2);
    }
    // the canopy: thin white posts, a shaded underside and a white edge with a gold band
    const ry = top - 30;
    for (const x of [sx0 + 2, (sx0 + sx1) / 2, sx1 - 2]) tube(c, [x, S_RIM - 1], [x, ry + 8], 2.4);
    const ug = c.createLinearGradient(0, ry + 8, 0, top - 4);
    ug.addColorStop(0, '#e9dcc3');
    ug.addColorStop(1, '#d9c8a6');
    fillShape(c, [[sx0 - 14, ry + 8], [sx1 + 14, ry + 8], [sx1 + 2, top - 4], [sx0 - 2, top - 4]], ug, 1.2);
    toon(c, (c) => box(c, sx0 - 16, ry, sx1 - sx0 + 32, 9, 2.5), WHITE, '#e6eaef', 1.2, 1.3);
    c.fillStyle = GOLD;
    c.fillRect(sx0 - 14, ry + 5, sx1 - sx0 + 28, 2);
    // the rim: a cream wall all along, its shadow on the grass in front
    fillShape(c, [[0, S_RIM - 1], [W, S_RIM - 1], [W, S_RIM + 3], [0, S_RIM + 3]], CREAM, 1.2);
    fillShape(c, [[0, S_RIM + 3], [W, S_RIM + 3], [W, S_RIM + 10], [0, S_RIM + 10]], CREAM_MID, 1.2);
    c.fillStyle = GOLD;
    c.fillRect(0, S_RIM + 4.5, W, 1.6);
    // the grass: the verge, then the mowed pitch in stripes that run toward the horizon
    c.fillStyle = MOW[0];
    c.fillRect(0, S_RIM + 11, W, h - S_RIM - 11);
    c.fillStyle = SHADOW_SOFT;
    c.fillRect(0, S_RIM + 11, W, 5);
    c.save();
    c.beginPath();
    c.rect(0, S_RIM + 11, W, h - S_RIM - 11);
    c.clip();
    const vx = 270;
    const vy = -260;
    for (let i = -8; i < 10; i += 2) {
      const xb0 = vx + (i * 80 - vx) * 1.0;
      const xb1 = xb0 + 80;
      const tY = S_RIM + 11;
      const k0 = (tY - vy) / (h - vy);
      fillShape(
        c,
        [
          [vx + (xb0 - vx) * k0, tY],
          [vx + (xb1 - vx) * k0, tY],
          [xb1, h],
          [xb0, h],
        ],
        MOW[1],
      );
    }
    const lg = c.createRadialGradient(20, 120, 0, 20, 120, 520);
    lg.addColorStop(0, 'rgba(255, 250, 214, 0.3)');
    lg.addColorStop(1, 'rgba(255, 250, 214, 0)');
    c.fillStyle = lg;
    c.fillRect(0, S_RIM, W, h - S_RIM);
    c.restore();
    // the touchline
    c.fillStyle = 'rgba(255, 255, 255, 0.92)';
    c.fillRect(0, S_LINE, W, 3);
    // the corner flag at the left, the goal at the right
    const fx = 30;
    softShadow(c, fx + 3, S_LINE + 1.5, 6, 2, 0.3);
    seg(c, [fx, S_LINE + 1.5], [fx + 28, S_LINE + 8], SHADOW_SOFT, 2);
    tube(c, [fx, S_LINE + 1.5], [fx, S_LINE - 42], 2.2);
    fillShape(c, [[fx + 1, S_LINE - 42], [fx + 18, S_LINE - 36], [fx + 1, S_LINE - 29]], GOLD, 1.2);
    fillShape(c, [[fx + 1, S_LINE - 35.5], [fx + 18, S_LINE - 36], [fx + 1, S_LINE - 29]], GOLD_DK);
    this.stageGoal(c);
    // a ball resting by the line
    toon(c, (c) => dot(c, 70, SG - 6, 6.5), '#ffffff', '#d9e1ea', 1.6, 1.2);
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      c.lineTo(70.5 + Math.cos(a) * 2.4, SG - 6 + Math.sin(a) * 2.4);
    }
    c.closePath();
    c.fillStyle = '#3a4554';
    c.fill();
    softShadow(c, 74, SG + 0.5, 9, 2.4, 0.3);
  }

  /** The goal at the right of the lobby strip, side on: two posts, the crossbar running back, the net. */
  private stageGoal(c: Ctx) {
    const nb: P = [470, SG + 8]; // near post foot
    const nt: P = [470, SG - 66];
    const fb: P = [500, S_LINE - 2]; // far post foot
    const ft: P = [500, S_LINE - 64];
    const bb: P = [W + 30, SG + 4];
    const bt: P = [W + 30, SG - 50];
    const fbb: P = [W + 40, S_LINE - 4];
    // its shadow
    fillShape(c, [nb, [nb[0] + 40, nb[1] + 14], [W, nb[1] + 14], [W, fb[1] + 8], fb], 'rgba(32, 84, 36, 0.14)');
    net(c, [ft, [W + 40, S_LINE - 52], fbb, fb], 6, 6, 0.6);
    net(c, [nt, ft, [W + 40, S_LINE - 52], bt], 5, 4, 0.6);
    net(c, [nt, bt, bb, nb], 6, 6, 0.6);
    tube(c, fb, ft, 3);
    tube(c, ft, nt, 3.4);
    tube(c, nb, nt, 3.8);
  }

  // ---------------------------------------------------------------- the lobby background

  private paintLobby(c: Ctx) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fffaf1');
    g.addColorStop(1, '#fbf1df');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // a faint grid of soft dots, like a mowed pattern seen from far away
    c.fillStyle = 'rgba(214, 180, 120, 0.12)';
    for (let y = 18; y < H; y += 28)
      for (let x = (y / 28) % 2 ? 14 : 28; x < W; x += 28) {
        c.beginPath();
        c.arc(x, y, 1.4, 0, Math.PI * 2);
        c.fill();
      }
    const s = c.createRadialGradient(0, 0, 0, 0, 0, 600);
    s.addColorStop(0, 'rgba(255, 244, 205, 0.3)');
    s.addColorStop(1, 'rgba(255, 244, 205, 0)');
    c.fillStyle = s;
    c.fillRect(0, 0, W, H);
  }
}
