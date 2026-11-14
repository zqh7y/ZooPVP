import { W, H, STAGE, TEAM, FONT, UI } from '../theme';
import { ARENA } from '../data';
import { PITCH, project, quad, circlePath, depthScale, screenY } from './camera';
import { circle, ellipse, rr, seeded, hash } from '../util';
import type { Ctx } from '../util';

/*
 * The stadium on a floodlit night, seen through the match camera (camera.ts): the pitch is the bright calm
 * centre and everything round it falls off into darkness. One key light, from the floodlights at the upper
 * left: highlights sit up-left, shade and cast shadows fall down-right. Everything that does not move is
 * painted once in build(); a frame copies those layers, the crowd's cached strips (a strip is one section of
 * a row, so a section can rise and wave as one) and a few phone flashes.
 *
 * World units are arena pixels: ax across, ay deep (0 = far end line, ARENA.h = near end line), z up.
 */

// ------------------------------------------------------------------ palette (one gold, the rest slate)

const BG = UI.bg;
const GOLD = UI.accent;
const GOLD_DIM = '#b8930f';
const LAMP = '#fff7d6';
const WHITE = '#f4f6f8';
const POST_SHADE = '#a9b2bd';
const EDGE = 'rgba(5, 8, 12, 0.8)';
const GRASS = ['#3b7848', '#367142'];
const APRON = '#21402b';
const TREAD = '#192028';
const TREAD_ALT = '#161c24';
const RISER = '#10151b';
const LIP = '#2a333f';
const STAIR = '#212933';
const WALL = '#0d1117';
const ROOF_TOP = '#141a21';
const FASCIA = '#212934';
const STEEL = '#262e38';
const STEEL_LIT = '#6a7686';
const LED = '#0a0d12';
const LED_TOP = '#3d4755';
const CROWD = ['#0c1015', '#11161d', '#171d26'];
const RIM = 'rgba(255, 236, 186, 0.5)';
const RIM_BACK = 'rgba(255, 238, 196, 0.62)';
const SHADOW = 'rgba(3, 8, 5, 0.3)';
const HOLE = '#06080b';

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

type P = [number, number];

/** A world point (ax, ay on the ground, z up) on screen. */
function pt(ax: number, ay: number, z = 0): P {
  const s = depthScale(ay);
  const x = MX + (ax - AW / 2) * s;
  return [x + (x - MX) * z * LEAN, screenY(ay) - z * s * ELEV];
}

// goals
const GOAL_HW = 50;
const GOAL_Z = 44;
const GOAL_ZB = 34;
const GOAL_D = 28;
// boards: the foot sits BOARD_IN out from the line, the face leans back BOARD_LEAN
const BOARD_IN = 22;
const BOARD_LEAN = 12;
const BOARD_Z = 22;
const FAR_BOARD = -40;
const SIDE_Y0 = -40;
const SIDE_Y1 = AH + 36;
const NEAR_BOARD = AH + 36;
const DUGOUT_GAP = [292, 528];
// the far stand: row k's front edge, height and ends
const FAR_ROWS = 8;
const FAR_STEP = 13;
const farEdge = (k: number) => -60 - FAR_STEP * k;
const farZ = (k: number) => 26 + 10 * k;
const farX0 = (k: number) => -110 + 5 * k;
const farX1 = (k: number) => AW + 110 - 5 * k;
const FAR_AISLES = [95, AW - 95];
const VOMS: [number, number, number][] = [
  [3, FAR_AISLES[0] + 14, FAR_AISLES[0] + 46],
  [3, FAR_AISLES[1] - 46, FAR_AISLES[1] - 14],
];
const ROOF_Y = -172;
const ROOF_Z = 128;
// the side stands: tier j's front edge (left side; the right side mirrors) and height
const SIDE_TIERS = 3;
const SIDE_STEP = 13;
const sideEdge = (j: number) => -36 - SIDE_STEP * j;
const sideZ = (j: number) => 14 + 9 * j;
const SIDE_A0 = -62;
const SIDE_A1 = 960;
const SIDE_WALKS = [250, 560];
const TUNNEL = [396, 426];
// the floodlight towers
const TOWER_Z = 290;
const TOWER_AT: P[] = [
  [-52, -56],
  [AW + 52, -56],
  [-2, AH + 58],
  [AW + 2, AH + 58],
];
const TOWER_BOX = { w: 150, h: 270, dx: 75, dy: 80 };
// the near stand, in screen px
const NEAR_TOP = Math.floor(pt(0, NEAR_BOARD + 14)[1]);
const NEAR_AISLE = 150;
const nearSpread = (y: number) => 1 + (y - NEAR_TOP) / 520;
// the overlay strips
const TOP_H = 150;
const BOT_Y = 990;
const FRONT_Y = 910;
const FRONT_H = 76;

// the lobby strip, in its own pixels (0 is STAGE.y)
const SG = STAGE_GROUND_Y - STAGE.y;
const S_ROWS = [40, 55, 70, 85, 100, 115];
const S_BACK_H = 122;
const S_FRONT_Y = 114;

const WORDS = ['ZOOPVP', 'GO PETS', 'ZOO CUP', 'ROAR!', 'PAWS UP', 'HOP HOP'];

// ------------------------------------------------------------------ small helpers

function layer(w: number, h: number, ratio: number, paint: (c: Ctx) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * ratio));
  cv.height = Math.max(1, Math.ceil(h * ratio));
  const c = cv.getContext('2d')!;
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

function fillShape(c: Ctx, pts: P[], color: string | CanvasGradient) {
  shape(c, pts);
  c.fillStyle = color;
  c.fill();
}

function seg(c: Ctx, a: P, b: P, color: string, w: number) {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

/** A flat rectangle of the world at height z. */
const flat = (ax0: number, ay0: number, ax1: number, ay1: number, z = 0): P[] => [pt(ax0, ay0, z), pt(ax1, ay0, z), pt(ax1, ay1, z), pt(ax0, ay1, z)];
/** An upright face standing on the ground segment (ax0, ay0)-(ax1, ay1), from z0 to z1. */
const wall = (ax0: number, ay0: number, ax1: number, ay1: number, z0: number, z1: number): P[] => [pt(ax0, ay0, z0), pt(ax1, ay1, z0), pt(ax1, ay1, z1), pt(ax0, ay0, z1)];

function word(c: Ctx, s: string, x: number, y: number, px: number, color: string) {
  c.font = `700 ${px}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = color;
  c.fillText(s, x, y + px * 0.04);
}

/** A white tube (posts, poles): a dark edge, the shaded body, a highlight up-left. */
function rod(c: Ctx, a: P, b: P, w: number) {
  seg(c, a, b, EDGE, w + 2);
  seg(c, a, b, POST_SHADE, w);
  const o = w * 0.2;
  seg(c, [a[0] - o, a[1] - o], [b[0] - o, b[1] - o], WHITE, w * 0.5);
}

/** A net over a four-cornered patch: a faint veil and a fine mesh. */
function net(c: Ctx, q: P[], nu: number, nv: number) {
  shape(c, q);
  c.fillStyle = 'rgba(230, 236, 242, 0.07)';
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
  c.strokeStyle = 'rgba(232, 238, 244, 0.38)';
  c.lineWidth = 0.7;
  c.stroke();
}

/** Every marking of the pitch, through the camera, in solid white (the caller fades it). */
function markings(c: Ctx, lw: number) {
  const u = AW / 68; // px per metre
  const r = 9.15 * u;
  c.strokeStyle = '#ffffff';
  c.fillStyle = '#ffffff';
  c.lineWidth = lw;
  c.lineJoin = 'miter';
  shape(c, quad(0, 0, AW, AH));
  c.stroke();
  const a = project(0, AH / 2);
  const b = project(AW, AH / 2);
  seg(c, [a.x, a.y], [b.x, b.y], '#ffffff', lw);
  circlePath(c, AW / 2, AH / 2, r, 0, Math.PI * 2, 64);
  c.stroke();
  circlePath(c, AW / 2, AH / 2, 2.6, 0, Math.PI * 2, 12);
  c.fill();
  const box = (w: number, d: number, y0: number, dir: number) => {
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
    box(40.32 * u, pd, y0, dir);
    box(18.32 * u, 5.5 * u, y0, dir);
    circlePath(c, AW / 2, y0 + dir * sp, 2.3, 0, Math.PI * 2, 12);
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
  c.lineJoin = 'round';
}

// ------------------------------------------------------------------ the crowd

interface Fan {
  x: number; // screen x of its middle
  y: number; // screen y of its feet (the tread it stands on)
  s: number; // size
  kind: number; // the ears: bear, cat, bunny, frog, round, chick
  tone: number;
  scarf: number; // team, or -1
  back: boolean; // seen from behind (the near stand)
  phone: boolean;
  up: boolean; // raises its arms in a cheer
}

interface Strip {
  x: number;
  y: number;
  w: number;
  h: number;
  idle: HTMLCanvasElement;
  cheer: HTMLCanvasElement;
  ph: number;
  delay: number;
  jump: number;
}

/** Adds a closed sub-path, always clockwise, so the overlapping parts of one silhouette never cancel. */
function polyCW(c: Ctx, p: number[]) {
  const n = p.length / 2;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  for (let k = 0; k < n; k++) {
    const i = a >= 0 ? k : n - 1 - k;
    if (k === 0) c.moveTo(p[i * 2], p[i * 2 + 1]);
    else c.lineTo(p[i * 2], p[i * 2 + 1]);
  }
  c.closePath();
}

function oval(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number) {
  c.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

const headY = (f: Fan) => f.y - f.s * 0.5 - f.s * 0.33 * 0.7;

/** The outline of one fan (head, ears, shoulders, raised arms) as one path. */
function silPath(c: Ctx, f: Fan, pose: number, ox: number, oy: number) {
  const s = f.s;
  const x = f.x + ox;
  const by = f.y + oy;
  const hr = s * 0.33;
  const hy = headY(f) + oy;
  c.beginPath();
  oval(c, x, by - s * 0.1, s * 0.48, s * 0.42, 0);
  oval(c, x, hy, hr, hr, 0);
  for (const d of [-1, 1]) {
    if (f.kind === 0) oval(c, x + d * hr * 0.72, hy - hr * 0.72, hr * 0.36, hr * 0.36, 0);
    else if (f.kind === 1) polyCW(c, [x + d * hr * 0.95, hy - hr * 0.2, x + d * hr * 0.8, hy - hr * 1.42, x + d * hr * 0.12, hy - hr * 0.84]);
    else if (f.kind === 2) oval(c, x + d * hr * 0.42, hy - hr * 1.28, hr * 0.7, hr * 0.24, Math.PI / 2 + d * 0.18);
    else if (f.kind === 3) oval(c, x + d * hr * 0.55, hy - hr * 0.72, hr * 0.42, hr * 0.42, 0);
  }
  if (f.kind === 5) polyCW(c, [x - hr * 0.3, hy - hr * 0.84, x + hr * 0.06, hy - hr * 1.6, x + hr * 0.32, hy - hr * 0.84]);
  const arms = pose === 1 ? [-1, 1] : f.phone ? [1] : [];
  for (const d of arms) {
    const sx = x + d * s * 0.34;
    const sy = by - s * 0.36;
    const hx = x + d * s * (pose === 1 ? 0.58 : 0.46);
    const hy2 = hy - hr * (pose === 1 ? 1.55 : 1.05);
    const rot = Math.atan2(hy2 - sy, hx - sx);
    oval(c, (sx + hx) / 2, (sy + hy2) / 2, Math.hypot(hx - sx, hy2 - sy) / 2 + s * 0.05, s * 0.1, rot);
    oval(c, hx, hy2, s * 0.12, s * 0.12, 0);
  }
}

/** One fan: a dark silhouette lit only at its rim (up-left), with its scarf and phone if it has them. */
function paintFan(c: Ctx, f: Fan, pose: number) {
  const s = f.s;
  const k = Math.max(0.8, s / 15);
  c.save();
  c.beginPath();
  c.rect(f.x - s * 1.4, f.y - s * 2.6, s * 2.8, s * (2.6 + (f.back ? 0.4 : 0.06)));
  c.clip();
  silPath(c, f, pose, 0, 0);
  c.fillStyle = f.back ? RIM_BACK : RIM;
  c.fill();
  c.save();
  c.clip();
  silPath(c, f, pose, (f.back ? 0.3 : 0.8) * k, (f.back ? 1.25 : 0.95) * k);
  c.fillStyle = CROWD[f.tone];
  c.fill();
  c.restore();
  const hr = s * 0.33;
  const hy = headY(f);
  if (f.scarf >= 0) {
    const tm = TEAM[f.scarf];
    c.fillStyle = tm.dark;
    c.fillRect(f.x - s * 0.3, hy + hr * 0.8, s * 0.6, s * 0.15);
    c.fillStyle = tm.main;
    c.fillRect(f.x - s * 0.3, hy + hr * 0.8, s * 0.6, s * 0.075);
    if (!f.back) {
      c.fillStyle = tm.dark;
      c.fillRect(f.x + s * 0.06, hy + hr * 0.8, s * 0.12, s * 0.34);
    }
    if (pose === 1) {
      const y = hy - hr * 1.55 - s * 0.1;
      c.fillStyle = tm.dark;
      c.fillRect(f.x - s * 0.58, y, s * 1.16, s * 0.18);
      c.fillStyle = tm.main;
      c.fillRect(f.x - s * 0.58, y, s * 1.16, s * 0.1);
      c.fillStyle = 'rgba(255, 255, 255, 0.85)';
      c.fillRect(f.x - s * 0.24, y, s * 0.1, s * 0.18);
      c.fillRect(f.x + s * 0.14, y, s * 0.1, s * 0.18);
    }
  }
  if (f.phone) {
    const px = f.x + s * 0.46;
    const py = hy - hr * 1.05 - s * 0.2;
    if (f.back) {
      circle(c, px, py, s * 0.24);
      c.fillStyle = 'rgba(220, 232, 255, 0.14)';
      c.fill();
    }
    c.fillStyle = f.back ? '#e6eef8' : '#05070a';
    c.fillRect(px - s * 0.07, py - s * 0.1, s * 0.14, s * 0.2);
  }
  c.restore();
}

// ------------------------------------------------------------------ stadium props

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
    rod(c, L0, L1, 3.4);
    rod(c, R0, R1, 3.4);
    rod(c, L1, R1, 3.4);
  };
  const back = () => {
    for (const [a, b] of [
      [B0, B1],
      [C0, C1],
      [B1, C1],
      [L1, B1],
      [R1, C1],
      [L0, B0],
      [R0, C0],
      [B0, C0],
    ])
      seg(c, a, b, 'rgba(170, 180, 192, 0.85)', 1.3);
  };
  const nets = () => {
    net(c, [B1, C1, C0, B0], 18, 5);
    net(c, [L0, L1, B1, B0], 4, 6);
    net(c, [R0, R1, C1, C0], 4, 6);
    net(c, [L1, R1, C1, B1], 18, 4);
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

/** The goal's shadow on the grass, thrown down-right by the key light. */
function goalShadow(c: Ctx, near: boolean) {
  const x0 = AW / 2 - GOAL_HW;
  const x1 = AW / 2 + GOAL_HW;
  const yl = near ? AH : 0;
  const yb = near ? AH + GOAL_D : -GOAL_D;
  const sx = (z: number) => z * 0.3;
  const sy = (z: number) => z * 0.2;
  const pts: P[] = near
    ? [pt(x0, yl), pt(x1, yl), pt(x1 + sx(GOAL_Z), yl + sy(GOAL_Z)), pt(x1 + sx(GOAL_ZB), yb + sy(GOAL_ZB)), pt(x0 + sx(GOAL_ZB), yb + sy(GOAL_ZB)), pt(x0, yb)]
    : [pt(x0, yb), pt(x1, yb), pt(x1 + sx(GOAL_ZB), yb + sy(GOAL_ZB)), pt(x1 + sx(GOAL_Z), yl + sy(GOAL_Z)), pt(x0 + sx(GOAL_Z), yl + sy(GOAL_Z)), pt(x0, yl)];
  fillShape(c, pts, 'rgba(3, 8, 5, 0.2)');
  const a = pt(x0 + sx(GOAL_Z), yl + sy(GOAL_Z));
  const b = pt(x1 + sx(GOAL_Z), yl + sy(GOAL_Z));
  seg(c, pt(x0, yl), a, SHADOW, 2.6);
  seg(c, pt(x1, yl), b, SHADOW, 2.6);
  seg(c, a, b, SHADOW, 2.6);
}

/** A corner flag: a thin pole, a small gold flag flying outward, a shadow down-right. */
function cornerFlag(c: Ctx, ax: number, ay: number, dir: number) {
  const z = 30;
  const b = pt(ax, ay);
  const t = pt(ax, ay, z);
  const sh = pt(ax + z * 0.3, ay + z * 0.2);
  seg(c, b, sh, SHADOW, 1.8);
  fillShape(c, [sh, [sh[0] + dir * 7, sh[1] + 1], pt(ax + z * 0.22, ay + z * 0.15)], SHADOW);
  ellipse(c, b[0] + 1, b[1] + 0.5, 3, 1.3);
  c.fillStyle = SHADOW;
  c.fill();
  rod(c, b, t, 1.6);
  const m = pt(ax, ay, z - 9);
  const tip: P = [t[0] + dir * 12, t[1] + 4];
  shape(c, [t, tip, m]);
  c.fillStyle = GOLD;
  c.fill();
  c.strokeStyle = EDGE;
  c.lineWidth = 1;
  c.stroke();
  fillShape(c, [[(t[0] + m[0]) / 2, (t[1] + m[1]) / 2], tip, m], GOLD_DIM);
}

/** A floodlight tower: a lattice mast and a bank of lamps turned toward the pitch, with its halo. */
function tower(c: Ctx, at: P) {
  const left = at[0] < AW / 2;
  const near = at[1] > AH / 2;
  const f = pt(at[0], at[1], BOARD_Z + 2);
  const h = pt(at[0], at[1], TOWER_Z);
  const g = c.createRadialGradient(h[0], h[1] - (near ? 8 : 0), 2, h[0], h[1], 66);
  g.addColorStop(0, `rgba(255, 240, 180, ${near ? 0.4 : 0.55})`);
  g.addColorStop(0.3, 'rgba(255, 228, 140, 0.16)');
  g.addColorStop(1, 'rgba(255, 220, 120, 0)');
  c.fillStyle = g;
  c.fillRect(h[0] - 70, h[1] - 70, 140, 140);
  const top = h[1] + 12;
  const lerpX = (a: number, b: number, k: number) => a + (b - a) * k;
  const rail = (side: number): [P, P] => [
    [f[0] + side * 5, f[1]],
    [h[0] + side * 2.6, top],
  ];
  const [l0, l1] = rail(-1);
  const [r0, r1] = rail(1);
  c.beginPath();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const b = (i + 1) / n;
    c.moveTo(lerpX(l0[0], l1[0], a), lerpX(l0[1], l1[1], a));
    c.lineTo(lerpX(r0[0], r1[0], b), lerpX(r0[1], r1[1], b));
    c.moveTo(lerpX(r0[0], r1[0], a), lerpX(r0[1], r1[1], a));
    c.lineTo(lerpX(l0[0], l1[0], b), lerpX(l0[1], l1[1], b));
  }
  c.strokeStyle = STEEL;
  c.lineWidth = 1;
  c.stroke();
  seg(c, l0, l1, EDGE, 3.2);
  seg(c, r0, r1, EDGE, 3.2);
  seg(c, l0, l1, STEEL_LIT, 1.4);
  seg(c, r0, r1, STEEL, 1.4);
  c.save();
  c.translate(h[0], h[1]);
  c.rotate(left ? 0.2 : -0.2);
  if (near) {
    // we see the back of this bank: a dark case, its light leaking round the top edge
    rr(c, -19, -9, 38, 19, 4);
    c.fillStyle = '#161b22';
    c.fill();
    c.strokeStyle = EDGE;
    c.lineWidth = 1.6;
    c.stroke();
    seg(c, [-16, -9.6], [16, -9.6], LAMP, 1.6);
    seg(c, [-18.4, -6], [-18.4, 6], STEEL_LIT, 1.1);
    for (let i = 0; i < 4; i++) seg(c, [-12 + i * 8, -4], [-12 + i * 8, 5], '#232a33', 2.2);
    c.restore();
    return;
  }
  rr(c, -20, 10, 40, 3.5, 1.5);
  c.fillStyle = STEEL;
  c.fill();
  rr(c, -19, -12, 38, 22, 4);
  c.fillStyle = '#1a2028';
  c.fill();
  c.strokeStyle = EDGE;
  c.lineWidth = 1.6;
  c.stroke();
  seg(c, [-15, -11.2], [15, -11.2], STEEL_LIT, 1.2);
  seg(c, [-18.2, -8], [-18.2, 6], STEEL_LIT, 1.2);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) {
      const x = -12 + i * 8;
      const y = -5.5 + j * 9;
      circle(c, x, y, 3.5);
      c.fillStyle = GOLD;
      c.fill();
      circle(c, x, y, 2.5);
      c.fillStyle = LAMP;
      c.fill();
      circle(c, x - 0.9, y - 0.9, 0.9);
      c.fillStyle = '#ffffff';
      c.fill();
    }
  c.restore();
}

/** A team shelter by the right touchline: a glass roof over a row of seats in the team's colour. */
function dugout(c: Ctx, ay0: number, ay1: number, team: number) {
  const ax0 = AW + 8;
  const ax1 = AW + 30;
  const z = 17;
  fillShape(c, [pt(ax0, ay0), pt(ax1, ay0), pt(ax1 + 6, ay1 + 4), pt(ax0 + 6, ay1 + 4)], 'rgba(3, 8, 5, 0.35)');
  fillShape(c, flat(ax0, ay0, ax1, ay1, 0), '#151a20');
  for (let a = ay0 + 7; a < ay1 - 4; a += 9.5) {
    fillShape(c, flat(ax1 - 9, a - 3.4, ax1 - 3, a + 3.4, 5), TEAM[team].dark);
    fillShape(c, wall(ax1 - 3, a - 3.4, ax1 - 3, a + 3.4, 5, 11), TEAM[team].main);
    const [hx, hy] = pt(ax1 - 9, a, 9);
    paintFan(c, { x: hx, y: hy + 3, s: 7.5, kind: Math.floor(hash(a) * 6), tone: 1, scarf: -1, back: false, phone: false, up: false }, 0);
  }
  fillShape(c, flat(ax0, ay0, ax1, ay1, z), 'rgba(150, 172, 196, 0.2)');
  shape(c, flat(ax0, ay0, ax1, ay1, z));
  c.strokeStyle = 'rgba(5, 8, 12, 0.7)';
  c.lineWidth = 1.2;
  c.stroke();
  seg(c, pt(ax0, ay0, z), pt(ax0, ay1, z), 'rgba(255, 255, 255, 0.55)', 1);
  seg(c, pt(ax0, ay0, z), pt(ax1, ay0, z), 'rgba(255, 255, 255, 0.35)', 1);
  fillShape(c, wall(ax0, ay1, ax1, ay1, 0, z), '#1c232c');
  seg(c, pt(ax0, ay1, z), pt(ax1, ay1, z), LIP, 1);
  // the manager, out on the touchline in a team scarf
  const ma = (ay0 + ay1) / 2 + (team ? 14 : -14);
  const [mx, my] = pt(AW + 4, ma);
  ellipse(c, mx + 3, my + 1, 5, 1.8);
  c.fillStyle = SHADOW;
  c.fill();
  paintFan(c, { x: mx, y: my, s: 11 * depthScale(ma), kind: team ? 1 : 0, tone: 2, scarf: team, back: false, phone: false, up: false }, 0);
}

/** A broadcast camera on its tripod on the left apron, with its operator. */
function tvCamera(c: Ctx, ax: number, ay: number) {
  fillShape(c, [pt(ax - 6, ay - 4), pt(ax + 10, ay - 4), pt(ax + 14, ay + 6), pt(ax - 2, ay + 6)], 'rgba(3, 8, 5, 0.3)');
  const top = pt(ax, ay, 15);
  for (const [dx, dy] of [
    [-5, -5],
    [5, -4],
    [-1, 6],
  ])
    seg(c, pt(ax + dx, ay + dy), top, '#3a4350', 1);
  const [hx, hy] = pt(ax - 13, ay, 0);
  paintFan(c, { x: hx, y: hy, s: 12, kind: 0, tone: 2, scarf: -1, back: false, phone: false, up: false }, 0);
  fillShape(c, flat(ax - 6, ay - 4, ax + 7, ay + 4, 22), '#3a4452');
  fillShape(c, wall(ax - 6, ay + 4, ax + 7, ay + 4, 15, 22), '#1b2129');
  seg(c, pt(ax - 6, ay - 4, 22), pt(ax + 7, ay - 4, 22), STEEL_LIT, 1);
  const l = pt(ax + 9, ay, 18.5);
  circle(c, l[0], l[1], 2.6);
  c.fillStyle = '#0b0e12';
  c.fill();
  circle(c, l[0] - 0.6, l[1] - 0.6, 0.8);
  c.fillStyle = 'rgba(200, 225, 255, 0.9)';
  c.fill();
  const tally = pt(ax - 4, ay - 2, 23.5);
  circle(c, tally[0], tally[1], 0.9);
  c.fillStyle = GOLD;
  c.fill();
}

/** LED scanlines over a board face. */
function scanlines(c: Ctx, face: P[], y0: number, y1: number) {
  c.save();
  shape(c, face);
  c.clip();
  c.fillStyle = 'rgba(0, 0, 0, 0.32)';
  for (let y = Math.floor(y0); y < y1; y += 2) c.fillRect(0, y + 1, W, 0.8);
  c.restore();
}

// ------------------------------------------------------------------ the arena

export class Arena {
  private ratio = 1;
  private back?: HTMLCanvasElement;
  private topStrip?: HTMLCanvasElement;
  private botStrip?: HTMLCanvasElement;
  private towers: { cv: HTMLCanvasElement; x: number; y: number }[] = [];
  private front?: HTMLCanvasElement;
  private night?: HTMLCanvasElement;
  private glow?: HTMLCanvasElement;
  private spark?: HTMLCanvasElement;
  private stageBack?: HTMLCanvasElement;
  private stageFront?: HTMLCanvasElement;
  private lobby?: HTMLCanvasElement;
  private strips: Strip[] = [];
  private stageStrips: Strip[] = [];
  private heads: P[] = [];
  private stageHeads: P[] = [];
  private lamps: P[] = [];
  private cheerAmt = 0;
  private fontWait = false;

  /** Cache every static layer at the device pixel ratio. Call again when the ratio changes. */
  build(ratio: number) {
    this.ratio = ratio;
    this.buildCrowd();
    this.back = layer(W, H, ratio, (c) => this.paintBack(c));
    this.topStrip = layer(W, TOP_H, ratio, (c) => this.paintTop(c));
    this.botStrip = layer(W, H - BOT_Y, ratio, (c) => {
      const g = c.createLinearGradient(0, 0, 0, H - BOT_Y);
      g.addColorStop(0, 'rgba(12, 16, 22, 0)');
      g.addColorStop(1, 'rgba(12, 16, 22, 0.62)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H - BOT_Y);
    });
    this.lamps = TOWER_AT.map((a) => pt(a[0], a[1], TOWER_Z));
    this.towers = TOWER_AT.map((a, i) => {
      const x = Math.floor(this.lamps[i][0] - TOWER_BOX.dx);
      const y = Math.floor(this.lamps[i][1] - TOWER_BOX.dy);
      return {
        x,
        y,
        cv: layer(TOWER_BOX.w, TOWER_BOX.h, ratio, (c) => {
          c.translate(-x, -y);
          tower(c, a);
        }),
      };
    });
    this.front = layer(W, FRONT_H, ratio, (c) => {
      c.translate(0, -FRONT_Y);
      goal(c, true);
      cornerFlag(c, 0, AH, -1);
      cornerFlag(c, AW, AH, 1);
    });
    this.night = layer(W, H, ratio, (c) => {
      c.fillStyle = 'rgba(5, 8, 12, 0.64)';
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-out';
      shape(c, quad(0, 0, AW, AH));
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      c.fill();
    });
    this.glow = layer(140, 140, ratio, (c) => {
      const g = c.createRadialGradient(70, 70, 2, 70, 70, 70);
      g.addColorStop(0, 'rgba(255, 240, 180, 0.8)');
      g.addColorStop(0.25, 'rgba(255, 226, 140, 0.25)');
      g.addColorStop(1, 'rgba(255, 220, 120, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 140, 140);
    });
    this.spark = layer(16, 16, ratio, (c) => {
      const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      g.addColorStop(0.35, 'rgba(235, 242, 255, 0.35)');
      g.addColorStop(1, 'rgba(235, 242, 255, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#ffffff';
      polyCW(c, [8, 1.5, 8.8, 7.2, 14.5, 8, 8.8, 8.8, 8, 14.5, 7.2, 8.8, 1.5, 8, 7.2, 7.2]);
      c.fill();
    });
    this.stageBack = layer(W, S_BACK_H, ratio, (c) => this.paintStageBack(c));
    this.stageFront = layer(W, STAGE.h - S_FRONT_Y, ratio, (c) => {
      c.translate(0, -S_FRONT_Y);
      this.paintStageFront(c);
    });
    this.lobby = layer(W, H, ratio, (c) => this.paintLobby(c));
    // the words on the boards need the game's font: paint again once it has arrived
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const face = `700 12px ${FONT.split(',')[0]}`;
    if (fonts && !this.fontWait && !fonts.check(face)) {
      this.fontWait = true;
      fonts.load(face).then(
        () => this.build(this.ratio),
        () => undefined,
      );
    }
  }

  /** Let the crowd settle after a cheer. */
  update(dt: number) {
    this.cheerAmt = Math.max(0, this.cheerAmt - dt * 0.9);
  }

  /** Make the crowd rise and wave for a moment, phones flashing (amount 0..1). */
  cheer(amount: number) {
    this.cheerAmt = Math.min(1, Math.max(this.cheerAmt, amount));
  }

  /** The whole stadium behind the fighters, with the crowd. */
  drawBattle(ctx: Ctx, t: number) {
    this.scene(ctx, t);
    this.drawFlashes(ctx, this.heads, t, 5, 28);
  }

  /** In front of the fighters: only the near goal and the near corner flags. */
  drawBattleFront(ctx: Ctx, _t: number) {
    if (!this.front) this.build(this.ratio);
    ctx.drawImage(this.front!, 0, FRONT_Y, W, FRONT_H);
  }

  /** The same ground with the lights at half (matchmaking and result screens sit on it). */
  drawDusk(ctx: Ctx, t: number) {
    this.scene(ctx, t);
    ctx.drawImage(this.front!, 0, FRONT_Y, W, FRONT_H);
    ctx.drawImage(this.night!, 0, 0, W, H);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.lamps.length; i++) {
      ctx.globalAlpha = 0.42 + 0.05 * Math.sin(t * 3.1 + i * 2);
      ctx.drawImage(this.glow!, this.lamps[i][0] - 70, this.lamps[i][1] - 70, 140, 140);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
    this.drawFlashes(ctx, this.heads, t + 7, 3, 10);
  }

  /** The lobby strip on STAGE: pitch level, across the grass to the stand. Pets stand on STAGE_GROUND_Y. */
  drawStage(ctx: Ctx, t: number) {
    if (!this.stageBack) this.build(this.ratio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.clip();
    ctx.drawImage(this.stageBack!, STAGE.x, STAGE.y, W, S_BACK_H);
    this.drawStrips(ctx, this.stageStrips, t);
    ctx.drawImage(this.stageFront!, STAGE.x, STAGE.y + S_FRONT_Y, W, STAGE.h - S_FRONT_Y);
    this.drawFlashes(ctx, this.stageHeads, t, 2, 8);
    ctx.restore();
  }

  /** The quiet full-screen background behind the lobby's panels. */
  drawLobbyBack(ctx: Ctx, _t: number) {
    if (!this.lobby) this.build(this.ratio);
    ctx.drawImage(this.lobby!, 0, 0, W, H);
  }

  // ---------------------------------------------------------------- per frame

  private scene(ctx: Ctx, t: number) {
    if (!this.back) this.build(this.ratio);
    ctx.drawImage(this.back!, 0, 0, W, H);
    this.drawStrips(ctx, this.strips, t);
    ctx.drawImage(this.topStrip!, 0, 0, W, TOP_H);
    for (const tw of this.towers) ctx.drawImage(tw.cv, tw.x, tw.y, TOWER_BOX.w, TOWER_BOX.h);
    ctx.drawImage(this.botStrip!, 0, BOT_Y, W, H - BOT_Y);
  }

  private drawStrips(ctx: Ctx, strips: Strip[], t: number) {
    const ch = this.cheerAmt;
    const q = this.ratio;
    for (let i = 0; i < strips.length; i++) {
      const st = strips[i];
      let dy = Math.sin(t * 1.3 + st.ph * 2.3) * 0.7;
      let img = st.idle;
      if (ch > 0.02) {
        const k = Math.min(1, Math.max(0, (ch * 1.3 - st.delay) * 2.5));
        if (k > 0) {
          dy -= Math.abs(Math.sin(t * 7 + st.ph)) * st.jump * k;
          if (k > 0.25) img = st.cheer;
        }
      }
      ctx.drawImage(img, st.x, Math.round((st.y + dy) * q) / q, st.w, st.h);
    }
  }

  /** Phone flashes: tiny sparkles that blink at random in the crowd; a burst while it cheers. */
  private drawFlashes(ctx: Ctx, heads: P[], t: number, base: number, burst: number) {
    if (!heads.length || !this.spark) return;
    const n = base + Math.round(this.cheerAmt * burst);
    for (let k = 0; k < n; k++) {
      const clock = t * 1.7 + k * 0.618 + ((k * k) % 7) * 0.13;
      const slot = Math.floor(clock);
      const age = (clock - slot) / 0.32;
      if (age > 1) continue;
      const h = heads[Math.floor(hash(slot * 7.13 + k * 31.7) * heads.length)];
      const s = 6 + 7 * Math.sin(age * Math.PI);
      ctx.globalAlpha = 1 - age * 0.6;
      ctx.drawImage(this.spark, h[0] - s / 2, h[1] - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the crowd

  private buildCrowd() {
    const rnd = seeded(31);
    const fan = (x: number, y: number, s: number, team: number, back: boolean, scarf: number): Fan => ({
      x,
      y,
      s,
      kind: Math.floor(rnd() * 6),
      tone: Math.floor(rnd() * 3),
      scarf: rnd() < scarf ? team : -1,
      back,
      phone: back && rnd() < 0.012,
      up: rnd() < 0.72,
    });
    const groups: Fan[][] = [];
    // the far stand, back row first; three sections between the aisles
    for (let k = FAR_ROWS - 1; k >= 0; k--) {
      const ay = farEdge(k) - FAR_STEP / 2;
      const z = farZ(k);
      const sec: Fan[][] = [[], [], []];
      for (let ax = farX0(k) + 7 + (k % 2) * 7; ax < farX1(k) - 6; ax += 14) {
        const jx = ax + (rnd() - 0.5) * 3;
        if (FAR_AISLES.some((a) => Math.abs(jx - a) < 13)) continue;
        if (VOMS.some(([r, a0, a1]) => r === k && jx > a0 - 6 && jx < a1 + 6)) continue;
        const [x, y] = pt(jx, ay, z);
        if (x < -8 || x > W + 8) continue;
        sec[jx < FAR_AISLES[0] ? 0 : jx < FAR_AISLES[1] ? 1 : 2].push(fan(x, y, 15.5 * depthScale(ay), 1, false, 0.09));
      }
      groups.push(...sec);
    }
    // the side stands, outer tier first; cut by the walkways
    const cuts = [SIDE_A0, ...SIDE_WALKS, SIDE_A1];
    for (const side of [0, 1])
      for (let j = SIDE_TIERS - 1; j >= 0; j--) {
        const axl = sideEdge(j) - SIDE_STEP / 2;
        const ax = side ? AW - axl : axl;
        for (let g = 0; g < cuts.length - 1; g++) {
          const list: Fan[] = [];
          for (let ay = cuts[g] + 11 + (j % 2) * 7; ay < cuts[g + 1] - 9; ay += 14) {
            if (side && ay > TUNNEL[0] - 6 && ay < TUNNEL[1] + 6) continue;
            const [x, y] = pt(ax + (rnd() - 0.5) * 2, ay, sideZ(j));
            if (x < -8 || x > W + 8) continue;
            const blue = Math.min(1, Math.max(0, (ay - 330) / 160));
            list.push(fan(x, y, 14 * depthScale(ay), rnd() < blue ? 0 : 1, false, 0.08));
          }
          groups.push(list);
        }
      }
    const front = groups.flat();
    // the near stand: seen from behind, growing toward the camera
    let y = NEAR_TOP - 4;
    let s = 17;
    while (y - s < H) {
      const sec: Fan[][] = [[], [], []];
      const sp = s * 0.92;
      const spread = nearSpread(y);
      const al = MX - NEAR_AISLE * spread;
      const ar = MX + NEAR_AISLE * spread;
      for (let x = 4 + rnd() * sp * 0.5; x < W + 4; x += sp * (0.9 + rnd() * 0.2)) {
        if (Math.abs(x - al) < 8 * spread + s * 0.45 || Math.abs(x - ar) < 8 * spread + s * 0.45) continue;
        sec[x < al ? 0 : x < ar ? 1 : 2].push(fan(x, y + (rnd() - 0.5) * 1.5, s, 0, true, 0.065));
      }
      groups.push(...sec);
      y += s * 0.62;
      s += 1.7;
    }
    this.strips = this.makeStrips(groups);
    this.heads = front.map((f) => [f.x, headY(f)] as P);
    // the lobby's stand
    const sg: Fan[][] = [];
    S_ROWS.forEach((by, k) => {
      const sec: Fan[][] = [[], []];
      const sz = 13 + k * 0.5;
      for (let x = 8 + (k % 2) * 7.5; x < W - 4; x += sz * 1.08) {
        if (Math.abs(x - 135) < 13 || Math.abs(x - 405) < 13) continue;
        sec[x < MX ? 0 : 1].push(fan(x + (rnd() - 0.5) * 2, STAGE.y + by, sz, rnd() < 0.9 ? 0 : 1, false, 0.13));
      }
      sg.push(...sec);
    });
    this.stageStrips = this.makeStrips(sg);
    this.stageHeads = sg.flat().map((f) => [f.x, headY(f)] as P);
  }

  private makeStrips(groups: Fan[][]): Strip[] {
    const out: Strip[] = [];
    groups.forEach((g, i) => {
      if (!g.length) return;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let sz = 0;
      for (const f of g) {
        x0 = Math.min(x0, f.x - f.s * 0.9);
        x1 = Math.max(x1, f.x + f.s * 0.9);
        y0 = Math.min(y0, f.y - f.s * 1.75);
        y1 = Math.max(y1, f.y + f.s * (f.back ? 0.45 : 0.1));
        sz += f.s;
      }
      x0 = Math.floor(x0);
      y0 = Math.floor(y0);
      const w = Math.ceil(x1 - x0);
      const h = Math.ceil(y1 - y0);
      const paint = (pose: number) =>
        layer(w, h, this.ratio, (c) => {
          c.translate(-x0, -y0);
          for (const f of g) paintFan(c, f, pose && f.up ? 1 : 0);
        });
      out.push({ x: x0, y: y0, w, h, idle: paint(0), cheer: paint(1), ph: ((x0 + w / 2) / W) * 3.4 + (i % 2) * 0.5, delay: hash(i * 1.7) * 0.45, jump: (sz / g.length) * 0.32 });
    });
    return out;
  }

  // ---------------------------------------------------------------- painting: the battle

  private paintBack(c: Ctx) {
    const sky = c.createLinearGradient(0, 0, 0, 260);
    sky.addColorStop(0, BG);
    sky.addColorStop(1, '#121821');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    this.paintFarStand(c);
    for (const side of [0, 1]) this.paintSideStand(c, side);
    this.paintNearStand(c);

    // the apron round the pitch, darker toward the stands
    fillShape(c, flat(sideEdge(0), -60, AW - sideEdge(0), NEAR_BOARD + 10), APRON);
    fillShape(c, flat(-BOARD_IN, FAR_BOARD, AW + BOARD_IN, NEAR_BOARD), '#244731');
    this.paintPitch(c);

    // light from the two far towers: short soft beams in the air, pools of light on the grass
    c.save();
    c.beginPath();
    c.rect(0, 0, W, NEAR_TOP);
    c.clip();
    c.globalCompositeOperation = 'lighter';
    TOWER_AT.slice(0, 2).forEach((a) => {
      const h = pt(a[0], a[1], TOWER_Z);
      const left = a[0] < AW / 2;
      const aim = project(left ? AW * 0.2 : AW * 0.8, AH * 0.3);
      const len = Math.hypot(aim.x - h[0], aim.y - h[1]);
      const ang = Math.atan2(aim.y - h[1], aim.x - h[0]);
      const strong = left ? 1 : 0.65;
      for (const sp of [0.34, 0.22, 0.1]) {
        const g = c.createLinearGradient(h[0], h[1], h[0] + Math.cos(ang) * len, h[1] + Math.sin(ang) * len);
        g.addColorStop(0, `rgba(255, 228, 150, ${0.055 * strong})`);
        g.addColorStop(1, 'rgba(255, 228, 150, 0)');
        c.fillStyle = g;
        shape(c, [h, [h[0] + Math.cos(ang - sp) * len, h[1] + Math.sin(ang - sp) * len], [h[0] + Math.cos(ang + sp) * len, h[1] + Math.sin(ang + sp) * len]]);
        c.fill();
      }
    });
    for (const [ax, ay, r, al] of [
      [AW * 0.3, AH * 0.3, 250, 0.075],
      [AW * 0.72, AH * 0.32, 230, 0.045],
      [AW * 0.5, AH * 0.72, 260, 0.035],
    ]) {
      const m = project(ax, ay);
      c.save();
      c.translate(m.x, m.y);
      c.scale(1, 0.8);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(255, 238, 190, ${al})`);
      g.addColorStop(1, 'rgba(255, 238, 190, 0)');
      c.fillStyle = g;
      c.fillRect(-r, -r, r * 2, r * 2);
      c.restore();
    }
    c.restore();

    this.paintBoards(c);
    goalShadow(c, false);
    goalShadow(c, true);
    goal(c, false);
    cornerFlag(c, 0, 0, -1);
    cornerFlag(c, AW, 0, 1);
    dugout(c, DUGOUT_GAP[0] + 12, DUGOUT_GAP[0] + 92, 1);
    dugout(c, DUGOUT_GAP[1] - 92, DUGOUT_GAP[1] - 12, 0);
    tvCamera(c, -10, AH / 2 - 6);
  }

  private paintFarStand(c: Ctx) {
    const kt = FAR_ROWS - 1;
    // the back wall up to the roof
    fillShape(c, wall(farX0(kt), farEdge(kt) - FAR_STEP, farX1(kt), farEdge(kt) - FAR_STEP, farZ(kt), ROOF_Z), WALL);
    for (let k = kt; k >= 0; k--) {
      const a = farEdge(k);
      const z = farZ(k);
      const zp = k ? farZ(k - 1) : 0;
      const x0 = farX0(k);
      const x1 = farX1(k);
      fillShape(c, flat(x0, a - FAR_STEP, x1, a, z), k % 2 ? TREAD : TREAD_ALT);
      fillShape(c, wall(x0, a, x1, a, zp, z), RISER);
      for (const s of FAR_AISLES) {
        fillShape(c, flat(s - 7, a - FAR_STEP, s + 7, a, z), STAIR);
        fillShape(c, wall(s - 7, a, s + 7, a, zp, z), '#1a2029');
        seg(c, pt(s - 7, a - FAR_STEP / 2, z), pt(s + 7, a - FAR_STEP / 2, z), RISER, 1);
      }
      for (const [r, v0, v1] of VOMS)
        if (r === k) {
          fillShape(c, flat(v0, a - FAR_STEP + 1, v1, a, z), HOLE);
          seg(c, pt(v0, a, z), pt(v1, a, z), LIP, 1);
        }
      seg(c, pt(x0, a, z), pt(x1, a, z), LIP, 1);
    }
    // the gold ribbon along the front wall
    seg(c, pt(farX0(0), farEdge(0), farZ(0) - 4), pt(farX1(0), farEdge(0), farZ(0) - 4), 'rgba(255, 210, 31, 0.55)', 1.2);
  }

  private paintSideStand(c: Ctx, side: number) {
    const X = (ax: number) => (side ? AW - ax : ax);
    const jt = SIDE_TIERS - 1;
    fillShape(c, flat(X(sideEdge(jt) - SIDE_STEP), SIDE_A0, X(-400), SIDE_A1, sideZ(jt)), WALL);
    for (let j = jt; j >= 0; j--) {
      const e = sideEdge(j);
      const z = sideZ(j);
      const zp = j ? sideZ(j - 1) : 0;
      fillShape(c, flat(X(e - SIDE_STEP), SIDE_A0, X(e), SIDE_A1, z), j % 2 ? TREAD : TREAD_ALT);
      fillShape(c, wall(X(e), SIDE_A0, X(e), SIDE_A1, zp, z), RISER);
      for (const wk of SIDE_WALKS) fillShape(c, flat(X(e - SIDE_STEP), wk - 8, X(e), wk + 8, z), STAIR);
      seg(c, pt(X(e), SIDE_A0, z), pt(X(e), SIDE_A1, z), LIP, 1);
    }
    if (side) {
      // the players' tunnel under the right stand
      fillShape(c, flat(X(sideEdge(0)), TUNNEL[0], X(sideEdge(jt) - SIDE_STEP), TUNNEL[1], sideZ(0) + 1), HOLE);
      seg(c, pt(X(sideEdge(0)), TUNNEL[0], sideZ(0) + 1), pt(X(sideEdge(0)), TUNNEL[1], sideZ(0) + 1), GOLD, 1.2);
      fillShape(c, flat(AW + BOARD_IN, TUNNEL[0] + 4, X(sideEdge(0)), TUNNEL[1] - 4), 'rgba(255, 220, 120, 0.06)');
    }
  }

  private paintNearStand(c: Ctx) {
    c.fillStyle = RISER;
    c.fillRect(0, NEAR_TOP - 4, W, H - NEAR_TOP + 4);
    let y = NEAR_TOP - 4;
    let s = 17;
    let i = 0;
    while (y - s < H) {
      const top = y - s * 0.62;
      c.fillStyle = i % 2 ? TREAD : TREAD_ALT;
      c.fillRect(0, top, W, y - top);
      c.fillStyle = LIP;
      c.fillRect(0, top, W, 1);
      y += s * 0.62;
      s += 1.7;
      i++;
    }
    for (const d of [-1, 1]) {
      const pts: P[] = [];
      for (const yy of [NEAR_TOP, H])
        for (const e of d < 0 ? [-1, 1] : [1, -1]) pts.push([MX + d * NEAR_AISLE * nearSpread(yy) + e * 8 * nearSpread(yy), yy]);
      fillShape(c, [pts[0], pts[1], pts[3], pts[2]], STAIR);
    }
  }

  private paintPitch(c: Ctx) {
    const bands = 16;
    for (let i = 0; i < bands; i++) fillShape(c, quad(0, (i * AH) / bands, AW, AH / bands + 0.6), GRASS[i % 2]);
    c.save();
    shape(c, quad(0, 0, AW, AH));
    c.clip();
    const rnd = seeded(5);
    for (let i = 0; i < 2600; i++) {
      const p = pt(rnd() * AW, rnd() * AH);
      c.fillStyle = i % 2 ? 'rgba(255, 255, 240, 0.045)' : 'rgba(0, 20, 8, 0.07)';
      c.fillRect(p[0], p[1], 1 + (i % 3 === 0 ? 1 : 0), 1);
    }
    // the floodlit pool in the middle and the key light from the upper left
    const mid = project(AW * 0.45, AH * 0.45);
    c.save();
    c.translate(mid.x, mid.y);
    c.scale(1, 1.45);
    const g = c.createRadialGradient(0, 0, 40, 0, 0, 330);
    g.addColorStop(0, 'rgba(255, 246, 210, 0.07)');
    g.addColorStop(0.55, 'rgba(255, 246, 210, 0)');
    g.addColorStop(1, 'rgba(0, 10, 4, 0.3)');
    c.fillStyle = g;
    c.fillRect(-W, -H, W * 2, H * 2);
    c.restore();
    const k = c.createLinearGradient(40, 300, 500, 950);
    k.addColorStop(0, 'rgba(255, 240, 190, 0.05)');
    k.addColorStop(1, 'rgba(0, 10, 4, 0.12)');
    c.fillStyle = k;
    c.fillRect(0, 0, W, H);
    c.restore();
    // worn turf where play is hardest: the goal mouths and the centre spot
    for (const [ay, rx, ry, al] of [
      [16, 46, 11, 0.09],
      [AH - 16, 54, 13, 0.09],
      [AH / 2, 30, 9, 0.05],
    ]) {
      const m = project(AW / 2, ay);
      c.save();
      c.translate(m.x, m.y);
      c.scale(1, ry / rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(196, 188, 140, ${al})`);
      g.addColorStop(1, 'rgba(196, 188, 140, 0)');
      c.fillStyle = g;
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    }
    const lines = layer(W, H, this.ratio, (lc) => markings(lc, 2.2));
    c.globalAlpha = 0.62;
    c.drawImage(lines, 0, 0, W, H);
    c.globalAlpha = 1;
  }

  /** The LED boards: a dark face with a lit top, a contact shadow and a little light spilled on the apron. */
  private paintBoards(c: Ctx) {
    const top = BOARD_Z;
    // far: faces the camera, so its words read straight
    {
      const a = FAR_BOARD;
      const x0 = -BOARD_IN;
      const x1 = AW + BOARD_IN;
      fillShape(c, flat(x0, a, x1, a + 14), 'rgba(255, 214, 90, 0.035)');
      fillShape(c, [pt(x0, a), pt(x1, a), pt(x1 + 5, a + 5), pt(x0 + 5, a + 5)], SHADOW);
      const face = [pt(x0, a, 0), pt(x1, a, 0), pt(x1, a - 4, top), pt(x0, a - 4, top)];
      fillShape(c, face, LED);
      fillShape(c, [pt(x0, a - 4, top), pt(x1, a - 4, top), pt(x1, a - 7, top - 1), pt(x0, a - 7, top - 1)], LED_TOP);
      const n = 5;
      const pw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const m = pt(x0 + pw * (i + 0.5), a - 2, top / 2);
        const s = i === 2 ? 'ZOOPVP' : WORDS[[1, 2, 0, 3, 4][i]];
        word(c, s, m[0], m[1], 10, i === 2 || i === 0 ? GOLD : WHITE);
        if (i) seg(c, pt(x0 + pw * i, a, 0), pt(x0 + pw * i, a - 4, top), '#1d242d', 1.2);
      }
      scanlines(c, face, face[3][1], face[0][1]);
    }
    // the sides: lean back, words run along the touchline
    for (const side of [0, 1]) {
      const X = (ax: number) => (side ? AW - ax : ax);
      const n = 12;
      const len = (SIDE_Y1 - SIDE_Y0) / n;
      for (let i = 0; i < n; i++) {
        const ya = SIDE_Y0 + i * len;
        const yb = ya + len;
        if (side && yb > DUGOUT_GAP[0] && ya < DUGOUT_GAP[1]) continue;
        const foot = X(-BOARD_IN);
        const lip = X(-BOARD_IN - BOARD_LEAN);
        fillShape(c, flat(X(-BOARD_IN + 4), ya, X(-BOARD_IN + 14), yb), 'rgba(255, 214, 90, 0.035)');
        fillShape(c, flat(foot, ya, X(-BOARD_IN + 5), yb), SHADOW);
        const face: P[] = [pt(foot, ya, 0), pt(foot, yb, 0), pt(lip, yb, top), pt(lip, ya, top)];
        fillShape(c, face, LED);
        fillShape(c, [pt(lip, ya, top), pt(lip, yb, top), pt(X(-BOARD_IN - BOARD_LEAN - 3), yb, top - 1), pt(X(-BOARD_IN - BOARD_LEAN - 3), ya, top - 1)], LED_TOP);
        seg(c, pt(foot, yb, 0), pt(lip, yb, top), '#1d242d', 1.1);
        const mid = (ya + yb) / 2;
        const cx = X(-BOARD_IN - BOARD_LEAN / 2);
        const m = pt(cx, mid, top / 2);
        const u0 = pt(cx, mid + (side ? -1 : 1), top / 2);
        const u1 = pt(cx, mid + (side ? 1 : -1), top / 2);
        const dl = Math.hypot(u1[0] - u0[0], u1[1] - u0[1]);
        const fp = pt(foot, mid, 0);
        const tp = pt(lip, mid, top);
        const gx = (fp[0] - tp[0]) / 16;
        const gy = (fp[1] - tp[1]) / 16;
        c.save();
        c.transform((u1[0] - u0[0]) / dl, (u1[1] - u0[1]) / dl, gx, gy, m[0], m[1]);
        const w = WORDS[(i + side * 3) % WORDS.length];
        word(c, w, 0, 0, 9, w === 'ZOOPVP' ? GOLD : WHITE);
        c.restore();
      }
    }
    // near: we see their backs; their light spills toward the pitch
    {
      const a = NEAR_BOARD;
      const x0 = -BOARD_IN;
      const x1 = AW + BOARD_IN;
      fillShape(c, flat(x0, a - 14, x1, a), 'rgba(255, 214, 90, 0.05)');
      fillShape(c, [pt(x0, a + 10, top - 2), pt(x1, a + 10, top - 2), pt(x1, a + 14, 0), pt(x0, a + 14, 0)], '#141920');
      fillShape(c, [pt(x0, a, 0), pt(x1, a, 0), pt(x1, a + 10, top - 2), pt(x0, a + 10, top - 2)], '#1b222b');
      seg(c, pt(x0, a + 10, top - 2), pt(x1, a + 10, top - 2), LED_TOP, 1.4);
      seg(c, pt(x0, a, 0), pt(x1, a, 0), 'rgba(255, 210, 31, 0.6)', 1);
    }
  }

  /** Over the crowd at the far end: the stand's roof and the shadow it throws on the top rows. */
  private paintTop(c: Ctx) {
    const f0 = pt(-80, ROOF_Y, ROOF_Z);
    const sky = c.createLinearGradient(0, 0, 0, f0[1]);
    sky.addColorStop(0, BG);
    sky.addColorStop(1, '#121821');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, f0[1] + 1);
    fillShape(c, flat(-80, ROOF_Y - 70, AW + 80, ROOF_Y, ROOF_Z + 10), ROOF_TOP);
    for (let ax = -60; ax <= AW + 60; ax += 46) seg(c, pt(ax, ROOF_Y - 70, ROOF_Z + 10), pt(ax, ROOF_Y, ROOF_Z + 10), '#19202a', 1);
    fillShape(c, wall(-80, ROOF_Y, AW + 80, ROOF_Y, ROOF_Z, ROOF_Z + 10), FASCIA);
    seg(c, pt(-80, ROOF_Y, ROOF_Z + 10), pt(AW + 80, ROOF_Y, ROOF_Z + 10), '#3e4958', 1);
    const sh = c.createLinearGradient(0, f0[1], 0, f0[1] + 28);
    sh.addColorStop(0, 'rgba(4, 6, 9, 0.6)');
    sh.addColorStop(1, 'rgba(4, 6, 9, 0)');
    c.fillStyle = sh;
    c.fillRect(0, f0[1], W, 28);
    for (let ax = -64; ax <= AW + 64; ax += 23) {
      const p = pt(ax, ROOF_Y, ROOF_Z - 0.5);
      circle(c, p[0], p[1], 2.6);
      c.fillStyle = 'rgba(255, 226, 140, 0.18)';
      c.fill();
      circle(c, p[0], p[1], 0.9);
      c.fillStyle = '#ffe9a0';
      c.fill();
    }
  }

  // ---------------------------------------------------------------- painting: the lobby

  private paintStageBack(c: Ctx) {
    c.fillStyle = BG;
    c.fillRect(0, 0, W, S_BACK_H);
    c.fillStyle = WALL;
    c.fillRect(0, 18, W, S_BACK_H - 18);
    S_ROWS.forEach((y, k) => {
      c.fillStyle = k % 2 ? TREAD : TREAD_ALT;
      c.fillRect(0, y - 15, W, 15);
      c.fillStyle = LIP;
      c.fillRect(0, y - 15, W, 1);
    });
    for (const x of [135, 405]) {
      c.fillStyle = STAIR;
      c.fillRect(x - 7, 24, 14, S_BACK_H - 24);
      c.fillStyle = RISER;
      for (let y = 25 + 7.5; y < S_BACK_H; y += 7.5) c.fillRect(x - 7, y, 14, 1);
    }
    // the roof edge and its lights
    c.fillStyle = ROOF_TOP;
    c.fillRect(0, 0, W, 10);
    c.fillStyle = FASCIA;
    c.fillRect(0, 10, W, 9);
    c.fillStyle = '#3e4958';
    c.fillRect(0, 10, W, 1);
    const sh = c.createLinearGradient(0, 19, 0, 46);
    sh.addColorStop(0, 'rgba(4, 6, 9, 0.6)');
    sh.addColorStop(1, 'rgba(4, 6, 9, 0)');
    c.fillStyle = sh;
    c.fillRect(0, 19, W, 27);
    for (let x = 14; x < W; x += 26) {
      circle(c, x, 19.5, 2.6);
      c.fillStyle = 'rgba(255, 226, 140, 0.18)';
      c.fill();
      circle(c, x, 19.5, 0.9);
      c.fillStyle = '#ffe9a0';
      c.fill();
    }
    // the floodlight at the upper left: the key light of the strip
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(48, 13, 4, 48, 13, 230);
    g.addColorStop(0, 'rgba(255, 232, 160, 0.4)');
    g.addColorStop(0.2, 'rgba(255, 226, 140, 0.1)');
    g.addColorStop(1, 'rgba(255, 220, 120, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, S_BACK_H);
    c.globalCompositeOperation = 'source-over';
    c.save();
    c.translate(48, 13);
    c.rotate(0.12);
    rr(c, -26, -11, 52, 20, 4);
    c.fillStyle = '#1a2028';
    c.fill();
    c.strokeStyle = EDGE;
    c.lineWidth = 1.6;
    c.stroke();
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 2; j++) {
        circle(c, -19 + i * 9.5, -4.5 + j * 8.5, 3.4);
        c.fillStyle = GOLD;
        c.fill();
        circle(c, -19 + i * 9.5, -4.5 + j * 8.5, 2.4);
        c.fillStyle = LAMP;
        c.fill();
      }
    c.restore();
  }

  private paintStageFront(c: Ctx) {
    c.fillStyle = WALL;
    c.fillRect(0, S_FRONT_Y, W, 4);
    // the boards
    const b0 = 120;
    const b1 = 143;
    c.fillStyle = LED_TOP;
    c.fillRect(0, b0 - 2.5, W, 2.5);
    c.fillStyle = 'rgba(255, 255, 255, 0.14)';
    c.fillRect(0, b0 - 2.5, W, 0.8);
    c.fillStyle = LED;
    c.fillRect(0, b0, W, b1 - b0);
    const pw = W / 5;
    for (let i = 0; i < 5; i++) {
      const s = WORDS[[1, 2, 0, 3, 4][i]];
      word(c, s, pw * (i + 0.5), (b0 + b1) / 2, 15, s === 'ZOOPVP' ? GOLD : WHITE);
      if (i) {
        c.fillStyle = '#1d242d';
        c.fillRect(pw * i - 0.6, b0, 1.2, b1 - b0);
      }
    }
    scanlines(c, [
      [0, b0],
      [W, b0],
      [W, b1],
      [0, b1],
    ], b0, b1);
    // the grass, running away from us; the key light warms the upper left
    c.fillStyle = APRON;
    c.fillRect(0, b1, W, 9);
    const g0 = b1 + 9;
    c.fillStyle = GRASS[0];
    c.fillRect(0, g0, W, STAGE.h - g0);
    c.fillStyle = GRASS[1];
    const k = 1 + (STAGE.h - g0) / 260;
    for (let i = -10; i < 10; i += 2) {
      const xa = MX + i * 40;
      const xb = MX + (i + 1) * 40;
      shape(c, [
        [xa, g0],
        [xb, g0],
        [MX + (xb - MX) * k, STAGE.h],
        [MX + (xa - MX) * k, STAGE.h],
      ]);
      c.fill();
    }
    const rnd = seeded(8);
    for (let i = 0; i < 700; i++) {
      c.fillStyle = i % 2 ? 'rgba(255, 255, 240, 0.05)' : 'rgba(0, 20, 8, 0.08)';
      c.fillRect(rnd() * W, g0 + rnd() * (STAGE.h - g0), 1.5, 1);
    }
    c.fillStyle = 'rgba(3, 8, 5, 0.35)';
    c.fillRect(0, b1, W, 4);
    c.fillStyle = 'rgba(255, 214, 90, 0.05)';
    c.fillRect(0, b1 + 4, W, 8);
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    c.fillRect(0, g0 + 1, W, 1.6);
    c.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    c.lineWidth = 2.4;
    ellipse(c, MX, SG + 2, 200, 30);
    c.stroke();
    seg(c, [MX, g0 + 1], [MX, STAGE.h], 'rgba(255, 255, 255, 0.32)', 2.4);
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.fillRect(0, STAGE.h - 12, W, 2.6);
    const lg = c.createLinearGradient(0, g0, W, STAGE.h);
    lg.addColorStop(0, 'rgba(255, 236, 170, 0.1)');
    lg.addColorStop(0.5, 'rgba(255, 236, 170, 0)');
    lg.addColorStop(1, 'rgba(0, 8, 4, 0.3)');
    c.fillStyle = lg;
    c.fillRect(0, g0, W, STAGE.h - g0);

    // a goal at the right end, seen side on
    const A0: P = [476, SG + 16];
    const A1: P = [476, SG - 58];
    const B0: P = [498, SG - 12];
    const B1: P = [498, SG - 80];
    const C0: P = [534, SG + 16];
    const C1: P = [528, SG - 44];
    const D0: P = [554, SG - 12];
    const D1: P = [548, SG - 66];
    ellipse(c, 512, SG + 12, 48, 6);
    c.fillStyle = SHADOW;
    c.fill();
    rod(c, B0, B1, 3.2);
    net(c, [B1, D1, D0, B0], 5, 8);
    net(c, [C1, D1, D0, C0], 4, 8);
    net(c, [A1, B1, D1, C1], 8, 5);
    net(c, [A1, C1, C0, A0], 5, 8);
    for (const [a, b] of [
      [C1, D1],
      [C0, C1],
      [A1, C1],
      [B1, D1],
    ])
      seg(c, a, b, 'rgba(170, 180, 192, 0.85)', 1.3);
    rod(c, A0, A1, 3.6);
    rod(c, A1, B1, 3.4);

    // a corner flag and a ball at the left end
    ellipse(c, 30, SG + 15, 8, 2.2);
    c.fillStyle = SHADOW;
    c.fill();
    rod(c, [26, SG + 14], [26, SG - 46], 2);
    shape(c, [
      [26, SG - 46],
      [46, SG - 40],
      [26, SG - 33],
    ]);
    c.fillStyle = GOLD;
    c.fill();
    c.strokeStyle = EDGE;
    c.lineWidth = 1;
    c.stroke();
    const bx = 66;
    const by = SG + 20;
    ellipse(c, bx + 4, by + 9, 11, 3);
    c.fillStyle = SHADOW;
    c.fill();
    circle(c, bx, by, 9);
    c.fillStyle = POST_SHADE;
    c.fill();
    c.strokeStyle = EDGE;
    c.lineWidth = 1.6;
    c.stroke();
    circle(c, bx - 1.2, by - 1.2, 7.2);
    c.fillStyle = WHITE;
    c.fill();
    c.fillStyle = '#20262e';
    c.beginPath();
    polyCW(c, [bx, by - 4, bx + 3.8, by - 1.2, bx + 2.4, by + 3.2, bx - 2.4, by + 3.2, bx - 3.8, by - 1.2]);
    c.fill();
  }

  private paintLobby(c: Ctx) {
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    c.lineWidth = 3;
    seg(c, [0, H / 2], [W, H / 2], 'rgba(255, 255, 255, 0.035)', 3);
    circle(c, W / 2, H / 2, 96);
    c.stroke();
    circle(c, W / 2, H / 2, 5);
    c.fillStyle = 'rgba(255, 255, 255, 0.035)';
    c.fill();
  }
}
