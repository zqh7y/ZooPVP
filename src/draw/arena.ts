import { W, H, COLOR, FIELD, STAGE, TEAM, FONT } from '../theme';
import { rr, circle, ellipse, poly, fillStroke, seeded, hash } from '../util';
import type { Ctx } from '../util';

/*
 * The stadium: a football ground seen from above for the battle (the pitch is exactly FIELD), its night
 * version, the side-on pitch-level strip of the lobby and the lobby's quiet background. Everything that
 * does not move is painted once in build() into offscreen canvases; a frame only copies those and draws
 * the little spectators, a few flags and camera flashes from cached sprites.
 */

// art colours of this module
const INK = COLOR.ink;
const GRASS_A = '#86cd68'; // the two mowing stripes: close on purpose
const GRASS_B = '#7cc55f';
const APRON = '#4b9a56'; // the darker turf round the pitch
const CONCRETE = '#d9d1e3';
const CONCRETE_DARK = '#aca3be';
/** Seat colours by team: [a row, the next row]. */
const SEAT = [
  ['#3558a8', '#2d4b94'],
  ['#9b4160', '#863553'],
];
const ROOF = '#3d3a6b';
const ROOF_ALT = '#434073';
const ROOF_LIGHT = '#55518f';
const ROOF_DARK = '#2e2b52';
const STEEL = '#a3a8c6';
const LAMP = '#fff2a8';
const GLASS = '#cfeaff';
const CREAM = COLOR.paper;
const NAVY = COLOR.indigoDark;
const GOLD = COLOR.gold;
const SHADE = 'rgba(27, 21, 34, 0.2)';
const LOBBY_A = '#1d3f38';
const LOBBY_B = '#1a3933';

/** Where the pets stand in the lobby strip. */
export const STAGE_GROUND_Y = STAGE.y + STAGE.h - 46;

// ------------------------------------------------------------------ the plan of the ground (screen px)

const FX = FIELD.x;
const FY = FIELD.y;
const FW = FIELD.w;
const FH = FIELD.h;
const FR = FX + FW;
const FB = FY + FH;
const MX = W / 2;
const MY = FY + FH / 2;
/** The ring of advertising boards (its outer edge) and the apron inside it. */
const RING = { x: FX - 18, y: FY - 28, w: FW + 36, h: FH + 56 };
const APR = { x: FX - 9, y: FY - 12, w: FW + 18, h: FH + 24 };
const SIDE_W = RING.x; // the room of a side stand
/** Stairs through the end stands. */
const AISLES = [60, 165, 375, 480];
/** Where the rows of the end stands stand (the feet of the fans). */
const TOP_ROWS = [119, 133, 147, 161];
const BOT_ROWS = [1061, 1078, 1095, 1136, 1153, 1170];
const BALCONY = { y: 1097, h: 17 }; // the wall between the two tiers of the bottom stand
/** The side stands, cut by two walkways and the halfway buildings. */
const SIDE_SEGS = [
  [166, 374],
  [386, 586],
  [614, 814],
  [826, 1036],
];
const DUGOUT = { y0: 526, y1: 674 };
/** Floodlight towers: x, foot y, lamp-head y. */
const TOWERS = [
  [19, 168, 122],
  [W - 19, 168, 122],
  [19, 1112, 1064],
  [W - 19, 1112, 1064],
];
const GOAL_W = 88;
const GOAL_H = 9; // how far the crossbar is lifted on screen
const GOAL_D = 22; // how deep the net is
/** The layers over the crowd (roof, towers, banners) and in front of the fighters. */
const TOP_H = 174;
const BOT_Y = 1040;
const FRONT_Y = FB - 30;
const FRONT_H = 62;

// the lobby strip, in its own pixels (0 is STAGE.y)
const SG = STAGE_GROUND_Y - STAGE.y; // the ground line
const S_ROWS = [84, 99, 114, 129];
const S_WALL = 129; // top of the board wall
const S_GRASS = 154;
const S_BACK_H = 132;
const S_FRONT_Y = 124;

// ------------------------------------------------------------------ helpers

type P = [number, number];

function layer(w: number, h: number, ratio: number, paint: (c: Ctx) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * ratio);
  cv.height = Math.ceil(h * ratio);
  const c = cv.getContext('2d')!;
  c.scale(ratio, ratio);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  paint(c);
  return cv;
}

function word(c: Ctx, s: string, x: number, y: number, px: number, color: string) {
  c.font = `${px}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = color;
  c.fillText(s, x, y + px * 0.07);
}

/** A white bar with an ink outline through the points (goal frames, poles). */
function bar(c: Ctx, pts: number[], w: number, color = '#ffffff') {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.lineWidth = w + 3;
  c.strokeStyle = INK;
  c.stroke();
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

/** The threads of a net stretched over a four-cornered patch. */
function netQuad(c: Ctx, p0: P, p1: P, p2: P, p3: P, nu: number, nv: number) {
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
  c.stroke();
}

/** Every marking of a football pitch, in solid white (the caller fades the whole drawing). */
function pitchLines(c: Ctx, x: number, y: number, w: number, h: number, lw: number) {
  const u = w / 68; // px per metre
  const cx = x + w / 2;
  const cy = y + h / 2;
  const i = lw / 2;
  const r = 9.15 * u;
  c.strokeStyle = '#ffffff';
  c.fillStyle = '#ffffff';
  c.lineWidth = lw;
  c.lineJoin = 'miter';
  c.lineCap = 'butt';
  c.strokeRect(x + i, y + i, w - lw, h - lw);
  c.beginPath();
  c.moveTo(x, cy);
  c.lineTo(x + w, cy);
  c.stroke();
  circle(c, cx, cy, r);
  c.stroke();
  circle(c, cx, cy, lw * 1.4);
  c.fill();
  for (const s of [1, -1]) {
    const ey = s === 1 ? y + i : y + h - i;
    const pw = 40.3 * u;
    const pd = 16.5 * u;
    const gw = 18.3 * u;
    const gd = 5.5 * u;
    const spot = 11 * u;
    c.beginPath();
    c.moveTo(cx - pw / 2, ey);
    c.lineTo(cx - pw / 2, ey + s * pd);
    c.lineTo(cx + pw / 2, ey + s * pd);
    c.lineTo(cx + pw / 2, ey);
    c.moveTo(cx - gw / 2, ey);
    c.lineTo(cx - gw / 2, ey + s * gd);
    c.lineTo(cx + gw / 2, ey + s * gd);
    c.lineTo(cx + gw / 2, ey);
    c.stroke();
    circle(c, cx, ey + s * spot, lw * 1.2);
    c.fill();
    const a = Math.acos((pd - spot) / r);
    c.beginPath();
    c.arc(cx, ey + s * spot, r, s * (Math.PI / 2) - a, s * (Math.PI / 2) + a);
    c.stroke();
  }
  const ca = 1.7 * u;
  const q = Math.PI / 2;
  const corners: [number, number, number][] = [
    [x + i, y + i, 0],
    [x + w - i, y + i, q],
    [x + w - i, y + h - i, q * 2],
    [x + i, y + h - i, q * 3],
  ];
  for (const [px, py, a0] of corners) {
    c.beginPath();
    c.arc(px, py, ca, a0, a0 + q);
    c.stroke();
  }
  c.lineJoin = 'round';
  c.lineCap = 'round';
}

// ------------------------------------------------------------------ advertising boards

const BOARD = [
  { bg: NAVY, fg: CREAM },
  { bg: CREAM, fg: COLOR.vermilion },
  { bg: GOLD, fg: INK },
  { bg: COLOR.jade, fg: CREAM },
];

/** A row of boards: [word, style, width] one after another from x. */
function boardRow(c: Ctx, x: number, y: number, h: number, cells: [string, number, number][], px: number) {
  let cx = x;
  for (const [s, st, w] of cells) {
    c.fillStyle = BOARD[st].bg;
    c.fillRect(cx, y, w, h);
    c.fillStyle = 'rgba(255, 255, 255, 0.28)';
    c.fillRect(cx, y, w, Math.max(1.5, h * 0.14));
    c.fillStyle = 'rgba(27, 21, 34, 0.16)';
    c.fillRect(cx, y + h - Math.max(1.5, h * 0.16), w, Math.max(1.5, h * 0.16));
    if (s) word(c, s, cx + w / 2, y + h / 2, px, BOARD[st].fg);
    cx += w;
    c.fillStyle = INK;
    c.fillRect(cx - 1, y, 2, h);
  }
}

/** A column of plain boards down a touchline. */
function boardColumn(c: Ctx, x: number, w: number, y0: number, y1: number, skip0: number, skip1: number) {
  const n = 14;
  const step = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const y = y0 + i * step;
    c.fillStyle = BOARD[[0, 2, 1, 0, 3, 1][i % 6]].bg;
    c.fillRect(x, y, w, step);
    c.fillStyle = 'rgba(255, 255, 255, 0.3)';
    c.fillRect(x, y, 1.5, step);
    c.fillStyle = INK;
    c.fillRect(x, y + step - 1, w, 2);
  }
  if (skip1 > skip0) {
    c.fillStyle = INK;
    c.fillRect(x - 2, skip0, w + 4, skip1 - skip0);
  }
}

// ------------------------------------------------------------------ the spectators

const KINDS = 6; // bear, cat, bunny, frog, panda, chick
const TONES = 4; // blue shirt, red shirt, cream shirt + blue scarf, cream shirt + red scarf
const POSES = 3; // watching, arms up, scarf held up
const FUR = ['#c98d5e', '#b9b3c2', '#fff1dc', '#7ed36f', '#ffffff', '#ffd95a'];
/** Sprite sizes: side stands, top stand, bottom stand and lobby. */
const SIZES = [12.5, 15, 17.5];
const FOOT = 2.5; // room under the feet in a sprite cell
const cellW = (s: number) => Math.ceil(s * 1.5 + 6);
const cellH = (s: number) => Math.ceil(s * 1.5 + 7);

interface Fan {
  x0: number; // where its sprite goes
  y0: number;
  w: number;
  h: number;
  b: number; // its first sprite (the watching pose)
  ph: number;
  r: number; // how soon it joins a cheer
  idle: number;
  cheer: number;
  jump: number;
  hx: number; // its head, for the camera flashes
  hy: number;
}

interface Flag {
  x: number;
  y: number;
  team: number;
  ph: number;
}

/** One tiny animal fan: cx is its middle, by its feet, s its size. */
function fanSprite(c: Ctx, kind: number, tone: number, pose: number, cx: number, by: number, s: number) {
  const team = TEAM[tone & 1];
  const shirt = tone < 2 ? team.main : CREAM;
  const scarf = tone < 2 ? '#ffffff' : team.main;
  const fur = FUR[kind];
  const lw = Math.max(1.3, s * 0.1);
  const hr = s * 0.36;
  const bw = s * 0.8;
  const bh = s * 0.44;
  const hy = by - bh - hr * 0.6;
  if (pose > 0) {
    for (const d of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + d * bw * 0.36, by - bh * 0.7);
      c.lineTo(cx + d * s * 0.5, hy - hr * 0.95);
      c.lineWidth = s * 0.17 + lw * 2;
      c.strokeStyle = INK;
      c.stroke();
      c.lineWidth = s * 0.17;
      c.strokeStyle = fur;
      c.stroke();
    }
  }
  rr(c, cx - bw / 2, by - bh, bw, bh, s * 0.2);
  fillStroke(c, shirt, lw);
  // ears
  if (kind === 0 || kind === 4) {
    for (const d of [-1, 1]) {
      circle(c, cx + d * hr * 0.74, hy - hr * 0.72, hr * 0.38);
      fillStroke(c, kind === 4 ? INK : fur, lw);
    }
  } else if (kind === 1) {
    for (const d of [-1, 1]) {
      poly(c, [cx + d * hr * 0.98, hy - hr * 0.3, cx + d * hr * 0.86, hy - hr * 1.42, cx + d * hr * 0.16, hy - hr * 0.86]);
      fillStroke(c, fur, lw);
    }
  } else if (kind === 2) {
    for (const d of [-1, 1]) {
      ellipse(c, cx + d * hr * 0.42, hy - hr * 1.42, hr * 0.27, hr * 0.74, d * 0.16);
      fillStroke(c, fur, lw);
    }
  } else if (kind === 5) {
    poly(c, [cx - hr * 0.3, hy - hr * 0.86, cx, hy - hr * 1.5, cx + hr * 0.3, hy - hr * 0.86]);
    fillStroke(c, fur, lw);
  }
  circle(c, cx, hy, hr);
  fillStroke(c, fur, lw);
  // the scarf round the neck
  c.fillStyle = scarf;
  c.fillRect(cx - bw * 0.34, hy + hr * 0.78, bw * 0.68, s * 0.15);
  // the face
  const er = Math.max(0.75, s * 0.058);
  let ex = hr * 0.42;
  let ey = hy + hr * 0.06;
  if (kind === 3) {
    ex = hr * 0.56;
    ey = hy - hr * 0.72;
    for (const d of [-1, 1]) {
      circle(c, cx + d * ex, ey, hr * 0.42);
      fillStroke(c, fur, lw);
    }
  }
  c.fillStyle = INK;
  for (const d of [-1, 1]) {
    circle(c, cx + d * ex, ey, kind === 4 ? er * 2 : er);
    c.fill();
  }
  if (kind === 5) {
    poly(c, [cx - hr * 0.26, hy + hr * 0.24, cx + hr * 0.26, hy + hr * 0.24, cx, hy + hr * 0.62]);
    c.fillStyle = '#ff9a3c';
    c.fill();
  } else if (pose > 0) {
    circle(c, cx, hy + hr * 0.48, er * 1.25);
    c.fill();
  }
  if (pose === 2) {
    const sy = hy - hr - s * 0.36;
    const sh = s * 0.22;
    rr(c, cx - s * 0.62, sy, s * 1.24, sh, 1.5);
    fillStroke(c, team.main, lw);
    c.fillStyle = '#ffffff';
    for (const k of [-0.36, 0, 0.36]) c.fillRect(cx + k * s - s * 0.07, sy + lw / 2, s * 0.14, sh - lw);
  }
}

/** A big supporters' flag on its pole (the pole's foot is at 8, 46 of a 52 x 50 cell). */
function flagSprite(c: Ctx, team: number, frame: number) {
  const tm = TEAM[team];
  bar(c, [8, 46, 8, 6], 1.8, CREAM);
  const a = frame ? 3 : -3;
  const cloth = () => {
    c.beginPath();
    c.moveTo(9, 5);
    c.quadraticCurveTo(20, 5 + a, 30, 5);
    c.quadraticCurveTo(40, 5 - a, 48, 6);
    c.lineTo(48, 24);
    c.quadraticCurveTo(40, 23 - a, 30, 23);
    c.quadraticCurveTo(20, 23 + a, 9, 23);
    c.closePath();
  };
  cloth();
  c.fillStyle = tm.main;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = '#ffffff';
  c.fillRect(9, 11.5, 40, 5.5);
  c.fillStyle = tm.dark;
  c.fillRect(9, 20, 40, 6);
  c.restore();
  cloth();
  c.lineWidth = 2.2;
  c.strokeStyle = INK;
  c.stroke();
}

// ------------------------------------------------------------------ stadium pieces

/** A floodlight tower seen from above: the foot at (x, by), the lamp head round (x, hy). */
function tower(c: Ctx, x: number, by: number, hy: number) {
  ellipse(c, x + 5, by + 2, 12, 5);
  c.fillStyle = SHADE;
  c.fill();
  c.fillStyle = INK;
  c.fillRect(x - 5.5, hy, 11, by - hy);
  c.fillStyle = STEEL;
  c.fillRect(x - 3, hy, 6, by - hy - 2.5);
  c.strokeStyle = INK;
  c.lineWidth = 1.3;
  c.beginPath();
  for (let y = hy + 12; y < by - 6; y += 8) {
    c.moveTo(x - 3, y);
    c.lineTo(x + 3, y + 8);
    c.moveTo(x + 3, y);
    c.lineTo(x - 3, y + 8);
  }
  c.stroke();
  rr(c, x - 9, by - 5, 18, 8, 3);
  fillStroke(c, CONCRETE_DARK, 2.5);
  rr(c, x - 17, hy - 13, 34, 26, 6);
  fillStroke(c, ROOF_LIGHT, 3);
  c.fillStyle = 'rgba(255, 255, 255, 0.16)';
  c.fillRect(x - 13, hy - 10.5, 26, 3);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      circle(c, x - 10 + i * 10, hy - 3.5 + j * 9.5, 3.7);
      fillStroke(c, LAMP, 1.5);
      circle(c, x - 11 + i * 10, hy - 4.5 + j * 9.5, 1.2);
      c.fillStyle = '#ffffff';
      c.fill();
    }
}

/** A corner flag: the pole stands at (x, y), the cloth flies to side d. */
function cornerFlag(c: Ctx, x: number, y: number, d: number) {
  ellipse(c, x + 3, y + 1, 6, 2.4);
  c.fillStyle = SHADE;
  c.fill();
  poly(c, [x, y - 19, x + d * 11, y - 15, x, y - 11]);
  fillStroke(c, COLOR.vermilion, 1.8);
  bar(c, [x, y, x, y - 19], 1.6, GOLD);
}

/** A goal seen from above; top = the far goal (its mouth faces us), otherwise the near one (we see its back). */
function goal(c: Ctx, top: boolean) {
  const xl = MX - GOAL_W / 2;
  const xr = MX + GOAL_W / 2;
  const ly = top ? FY : FB;
  const ty = ly - GOAL_H;
  const by = top ? ly - GOAL_D : ly + GOAL_D - 2;
  if (!top) {
    bar(c, [xl, ly, xl, ty], 3);
    bar(c, [xr, ly, xr, ty], 3);
  }
  poly(c, [xl, ty, xr, ty, xr - 5, by, xl + 5, by]);
  c.fillStyle = top ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.14)';
  c.fill();
  c.strokeStyle = top ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.6)';
  c.lineWidth = 1;
  netQuad(c, [xl, ty], [xr, ty], [xr - 5, by], [xl + 5, by], 14, top ? 3 : 5);
  bar(c, [xl, ty, xl + 5, by, xr - 5, by, xr, ty], 1.4, '#e9e4f0');
  if (top) bar(c, [xl, ly, xl, ty, xr, ty, xr, ly], 3);
  else bar(c, [xl, ty, xr, ty], 3);
}

/** A team shelter by the touchline, seen from above. */
function dugout(c: Ctx, y: number, team: number) {
  for (let i = 0; i < 4; i++) {
    circle(c, FR + 6.5, y + 10 + i * 12, 3.3);
    fillStroke(c, FUR[(i * 2 + team) % KINDS], 1.3);
  }
  rr(c, FR + 8, y, 17, 56, 6);
  fillStroke(c, GLASS, 2.4);
  c.fillStyle = TEAM[team].main;
  c.fillRect(FR + 18.5, y + 4, 4.5, 48);
  c.strokeStyle = 'rgba(43, 31, 51, 0.4)';
  c.lineWidth = 1.2;
  c.beginPath();
  for (let i = 1; i < 4; i++) {
    c.moveTo(FR + 9.5, y + i * 14);
    c.lineTo(FR + 18, y + i * 14);
  }
  c.stroke();
}

/** A strip of stairs through a stand. */
function stairs(c: Ctx, x: number, y: number, h: number) {
  c.fillStyle = INK;
  c.fillRect(x - 6.5, y, 13, h);
  c.fillStyle = CONCRETE;
  c.fillRect(x - 4.5, y, 9, h);
  c.fillStyle = 'rgba(27, 21, 34, 0.22)';
  for (let sy = y + 3; sy < y + h; sy += 4.7) c.fillRect(x - 4.5, sy, 9, 1.4);
}

/** Mowing stripes that run away from the viewer (the lobby strip). */
function perspectiveStripes(c: Ctx, y0: number, y1: number) {
  c.fillStyle = GRASS_A;
  c.fillRect(0, y0, W, y1 - y0);
  c.fillStyle = GRASS_B;
  const k = 1 + (y1 - y0) / 420;
  for (let i = -9; i < 9; i += 2) poly(c, [MX + i * 44, y0, MX + (i + 1) * 44, y0, MX + (i + 1) * 44 * k, y1, MX + i * 44 * k, y1]), c.fill();
}

// ------------------------------------------------------------------ the arena

export class Arena {
  private ratio = 1;
  private back?: HTMLCanvasElement;
  private topStrip?: HTMLCanvasElement;
  private botStrip?: HTMLCanvasElement;
  private front?: HTMLCanvasElement;
  private night?: HTMLCanvasElement;
  private glow?: HTMLCanvasElement;
  private spark?: HTMLCanvasElement;
  private stageBack?: HTMLCanvasElement;
  private stageFront?: HTMLCanvasElement;
  private lobby?: HTMLCanvasElement;
  private sprites: HTMLCanvasElement[] = [];
  private flagSprites: HTMLCanvasElement[] = [];
  private fans: Fan[] = [];
  private stageFans: Fan[] = [];
  private flags: Flag[] = [];
  private cheerAmt = 0;
  private fontWait = false;

  /** Cache every static layer at the device pixel ratio. Call again when the ratio changes. */
  build(ratio: number) {
    this.ratio = ratio;
    this.sprites = [];
    for (const s of SIZES)
      for (let k = 0; k < KINDS; k++)
        for (let tn = 0; tn < TONES; tn++)
          for (let p = 0; p < POSES; p++)
            this.sprites.push(layer(cellW(s), cellH(s), ratio, (c) => fanSprite(c, k, tn, p, cellW(s) / 2, cellH(s) - FOOT, s)));
    this.flagSprites = [];
    for (let tm = 0; tm < 2; tm++) for (let f = 0; f < 2; f++) this.flagSprites.push(layer(52, 50, ratio, (c) => flagSprite(c, tm, f)));
    this.placeFans();
    this.back = layer(W, H, ratio, (c) => this.paintBack(c));
    this.topStrip = layer(W, TOP_H, ratio, (c) => this.paintTopStrip(c));
    this.botStrip = layer(W, H - BOT_Y, ratio, (c) => {
      c.translate(0, -BOT_Y);
      this.paintBotStrip(c);
    });
    this.front = layer(W, FRONT_H, ratio, (c) => {
      c.translate(0, -FRONT_Y);
      goal(c, false);
      cornerFlag(c, FX + 2, FB - 2, -1);
      cornerFlag(c, FR - 2, FB - 2, 1);
    });
    this.night = layer(W, H, ratio, (c) => this.paintNight(c));
    this.glow = layer(110, 110, ratio, (c) => {
      const g = c.createRadialGradient(55, 55, 2, 55, 55, 55);
      g.addColorStop(0, 'rgba(255, 244, 190, 0.85)');
      g.addColorStop(0.3, 'rgba(255, 232, 150, 0.32)');
      g.addColorStop(1, 'rgba(255, 220, 120, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 110, 110);
    });
    this.spark = layer(18, 18, ratio, (c) => {
      c.fillStyle = '#ffffff';
      poly(c, [9, 0, 10.6, 7.4, 18, 9, 10.6, 10.6, 9, 18, 7.4, 10.6, 0, 9, 7.4, 7.4]);
      c.fill();
      circle(c, 9, 9, 3.2);
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
    const face = `12px ${FONT.split(',')[0]}`;
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

  /** Make the crowd jump for a moment (amount 0..1). */
  cheer(amount: number) {
    this.cheerAmt = Math.min(1, Math.max(this.cheerAmt, amount));
  }

  /** The whole stadium behind the fighters, with the crowd. */
  drawBattle(ctx: Ctx, t: number) {
    if (!this.back) this.build(this.ratio);
    ctx.drawImage(this.back!, 0, 0, W, H);
    this.drawFans(ctx, this.fans, t);
    ctx.drawImage(this.topStrip!, 0, 0, W, TOP_H);
    ctx.drawImage(this.botStrip!, 0, BOT_Y, W, H - BOT_Y);
    this.drawFlags(ctx, t);
    this.drawFlashes(ctx, t);
  }

  /** In front of the fighters: the near goal, the near corner flags, confetti while the crowd cheers. */
  drawBattleFront(ctx: Ctx, t: number) {
    if (!this.front) this.build(this.ratio);
    ctx.drawImage(this.front!, 0, FRONT_Y, W, FRONT_H);
    const ch = this.cheerAmt;
    if (ch > 0.03) {
      ctx.globalAlpha = Math.min(1, ch * 1.4);
      for (let i = 0; i < 28; i++) {
        const side = i % 4;
        const u = hash(i * 5.3);
        const fall = (t * (60 + u * 50) + u * 400) % 150;
        const sway = Math.sin(t * 5 + i) * 6;
        // only along the edges of the pitch, never over the middle of the fight
        const x = side === 0 ? 34 + u * 60 + sway : side === 1 ? W - 34 - u * 60 + sway : hash(i * 9.1) * W;
        const y = side === 2 ? 150 + fall * 0.6 : side === 3 ? 960 + fall * 0.5 : hash(i * 2.7) * H * 0.9 + fall;
        ctx.fillStyle = i % 3 === 0 ? GOLD : i % 3 === 1 ? TEAM[0].light : TEAM[1].light;
        ctx.fillRect(x, y, 5, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** The same ground as a night match, floodlights on (matchmaking and result screens). */
  drawDusk(ctx: Ctx, t: number) {
    this.drawBattle(ctx, t);
    ctx.drawImage(this.front!, 0, FRONT_Y, W, FRONT_H);
    ctx.drawImage(this.night!, 0, 0, W, H);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < TOWERS.length; i++) {
      ctx.globalAlpha = 0.86 + 0.14 * Math.sin(t * 4.1 + i * 1.7) * Math.sin(t * 2.3 + i);
      ctx.drawImage(this.glow!, TOWERS[i][0] - 55, TOWERS[i][2] - 55, 110, 110);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
    this.drawFlashes(ctx, t + 3);
  }

  /** The lobby strip on STAGE: a pitch-level view across the grass. Pets stand on STAGE_GROUND_Y. */
  drawStage(ctx: Ctx, t: number) {
    if (!this.stageBack) this.build(this.ratio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.clip();
    ctx.drawImage(this.stageBack!, STAGE.x, STAGE.y, W, S_BACK_H);
    this.drawFans(ctx, this.stageFans, t);
    ctx.drawImage(this.stageFront!, STAGE.x, STAGE.y + S_FRONT_Y, W, STAGE.h - S_FRONT_Y);
    ctx.restore();
  }

  /** The quiet full-screen background behind the lobby's panels. */
  drawLobbyBack(ctx: Ctx, _t: number) {
    if (!this.lobby) this.build(this.ratio);
    ctx.drawImage(this.lobby!, 0, 0, W, H);
  }

  // ---------------------------------------------------------------- per frame

  private drawFans(ctx: Ctx, fans: Fan[], t: number) {
    const q = this.ratio;
    const ch = this.cheerAmt;
    const amp = Math.min(1, ch * 1.6);
    const spr = this.sprites;
    const live = ch > 0.03;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      let dy: number;
      let pose: number;
      if (live && f.r < ch * 1.3) {
        dy = -Math.abs(Math.sin(t * 9 + f.ph)) * f.jump * amp;
        pose = f.cheer;
      } else {
        dy = Math.sin(t * 2.3 + f.ph) * 0.9;
        pose = f.idle;
      }
      ctx.drawImage(spr[f.b + pose], f.x0, Math.round((f.y0 + dy) * q) / q, f.w, f.h);
    }
  }

  private drawFlags(ctx: Ctx, t: number) {
    const ch = this.cheerAmt;
    const speed = 2.4 + ch * 5;
    for (let i = 0; i < this.flags.length; i++) {
      const f = this.flags[i];
      const a = Math.sin(t * speed + f.ph) * (0.24 + ch * 0.2) + 0.1;
      const frame = Math.floor(t * 5 + f.ph) & 1;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(a);
      ctx.drawImage(this.flagSprites[f.team * 2 + frame], -8, -46, 52, 50);
      ctx.restore();
    }
  }

  /** Camera flashes twinkling in the crowd; many more while it cheers. */
  private drawFlashes(ctx: Ctx, t: number) {
    const fans = this.fans;
    if (!fans.length) return;
    const n = 4 + Math.round(this.cheerAmt * 12);
    for (let k = 0; k < n; k++) {
      const clock = t * 2.6 + k * 0.618;
      const slot = Math.floor(clock);
      const age = clock - slot;
      if (age > 0.45) continue;
      const f = fans[Math.floor(hash(slot * 7.13 + k * 31.7) * fans.length)];
      const s = 18 * (0.55 + 0.6 * Math.sin((age / 0.45) * Math.PI));
      ctx.globalAlpha = 1 - age / 0.45;
      ctx.drawImage(this.spark!, f.hx - s / 2, f.hy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the crowd

  private placeFans() {
    const q = this.ratio;
    const rnd = seeded(77);
    const mk = (x: number, y: number, sc: number, team: number): Fan => {
      const s = SIZES[sc];
      const cw = cellW(s);
      const chh = cellH(s);
      const kind = Math.floor(rnd() * KINDS);
      const tone = team + (rnd() < 0.24 ? 2 : 0);
      const pr = rnd();
      return {
        x0: Math.round((x - cw / 2) * q) / q,
        y0: y - chh + FOOT,
        w: cw,
        h: chh,
        b: ((sc * KINDS + kind) * TONES + tone) * POSES,
        ph: rnd() * 6.283,
        r: rnd(),
        idle: pr < 0.05 ? 2 : pr < 0.1 ? 1 : 0,
        cheer: rnd() < 0.4 ? 2 : 1,
        jump: 3 + rnd() * 4 + sc,
        hx: x,
        hy: y - s * 0.75,
      };
    };
    const fans: Fan[] = [];
    // the top stand: red
    TOP_ROWS.forEach((y, k) => {
      for (let x = 8 + (k % 2) * 7.2; x < W - 3; x += 14.4) {
        if (AISLES.some((a) => Math.abs(x - a) < 12)) continue;
        fans.push(mk(x + (rnd() - 0.5) * 2, y, 1, 1));
      }
    });
    // the side stands: red toward the top end, blue toward the bottom end, mixed round the halfway line
    for (const side of [0, 1])
      for (const col of [0, 1]) {
        const x = side ? W - (col ? 16.5 : 6) : col ? 16.5 : 6;
        for (const [y0, y1] of SIDE_SEGS) {
          const n = Math.floor((y1 - y0 - 14) / 12.4);
          for (let i = n; i >= 0; i--) {
            const y = y1 - i * 12.4;
            if (side === 1 && col === 1 && y > DUGOUT.y0 - 2 && y < DUGOUT.y1 + 16) continue;
            const blue = Math.min(1, Math.max(0, (y - 540) / 120));
            fans.push(mk(x, y, 0, rnd() < blue ? 0 : 1));
          }
        }
      }
    // the bottom stand: blue
    BOT_ROWS.forEach((y, k) => {
      for (let x = 9 + (k % 2) * 8.3; x < W - 3; x += 16.6) {
        if (AISLES.some((a) => Math.abs(x - a) < 13)) continue;
        fans.push(mk(x + (rnd() - 0.5) * 2, y, 2, 0));
      }
    });
    this.fans = fans;
    this.flags = [
      { x: 112, y: 142, team: 1, ph: 0.4 },
      { x: 322, y: 130, team: 1, ph: 2.1 },
      { x: 436, y: 146, team: 1, ph: 4.0 },
      { x: 96, y: 1086, team: 0, ph: 1.2 },
      { x: 228, y: 1158, team: 0, ph: 3.3 },
      { x: 318, y: 1160, team: 0, ph: 5.1 },
      { x: 448, y: 1084, team: 0, ph: 0.2 },
    ];
    // the lobby's stand: the home crowd
    const sf: Fan[] = [];
    S_ROWS.forEach((y, k) => {
      for (let x = 10 + (k % 2) * 8.4; x < W - 3; x += 16.8) {
        if (Math.abs(x - 135) < 13 || Math.abs(x - 405) < 13) continue;
        sf.push(mk(x + (rnd() - 0.5) * 2, STAGE.y + y, 2, rnd() < 0.88 ? 0 : 1));
      }
    });
    this.stageFans = sf;
  }

  // ---------------------------------------------------------------- painting: the battle

  private paintBack(c: Ctx) {
    c.fillStyle = ROOF_DARK;
    c.fillRect(0, 0, W, H);

    // the top stand's terraces
    TOP_ROWS.forEach((y, k) => {
      const y0 = k ? TOP_ROWS[k - 1] : 100;
      c.fillStyle = SEAT[1][k % 2];
      c.fillRect(0, y0, W, y - y0);
      c.fillStyle = SHADE;
      c.fillRect(0, y - 2, W, 2);
    });
    // the bottom stand's two tiers
    BOT_ROWS.forEach((y, k) => {
      const y0 = k === 0 ? RING.y + RING.h : k === 3 ? BALCONY.y + BALCONY.h : BOT_ROWS[k - 1];
      c.fillStyle = SEAT[0][k % 2];
      c.fillRect(0, y0, W, y - y0 + (k === 2 ? 4 : 0));
      c.fillStyle = SHADE;
      c.fillRect(0, y - 2, W, 2);
    });
    for (const a of AISLES) {
      stairs(c, a, 100, RING.y - 100);
      stairs(c, a, RING.y + RING.h, H - RING.y - RING.h);
    }
    // the side stands
    for (const x of [0, W - SIDE_W]) {
      c.fillStyle = SEAT[1][0];
      c.fillRect(x, RING.y, SIDE_W, MY - RING.y);
      c.fillStyle = SEAT[0][0];
      c.fillRect(x, MY, SIDE_W, RING.y + RING.h - MY);
    }
    c.fillStyle = 'rgba(27, 21, 34, 0.16)';
    c.fillRect(0, RING.y, SIDE_W / 2, RING.h);
    c.fillRect(W - SIDE_W / 2, RING.y, SIDE_W / 2, RING.h);
    for (const y of [380, 820])
      for (const x of [0, W - SIDE_W]) {
        c.fillStyle = INK;
        c.fillRect(x, y - 6, SIDE_W, 12);
        c.fillStyle = CONCRETE;
        c.fillRect(x, y - 4, SIDE_W, 8);
      }

    // the ring of boards, then the apron inside it
    rr(c, RING.x, RING.y, RING.w, RING.h, 7);
    c.fillStyle = INK;
    c.fill();
    const bx = RING.x + 2;
    const bw = RING.w - 4;
    const cw = (bw - 100) / 4;
    const bh = APR.y - RING.y - 3.25;
    boardRow(c, bx, RING.y + 2, bh, [['ZOO CUP', 0, cw], ['GO PETS!', 1, cw], ['', 2, 100], ['ROAR!', 1, cw], ['PAWS UP', 0, cw]], 10.5);
    boardRow(c, bx, APR.y + APR.h + 1.25, bh, [['HOP HOP', 2, cw], ['ZOO CUP', 0, cw], ['', 1, 100], ['GO PETS!', 0, cw], ['BIG BITE', 2, cw]], 10.5);
    boardColumn(c, RING.x + 2, APR.x - RING.x - 3, APR.y, APR.y + APR.h, 0, 0);
    boardColumn(c, APR.x + APR.w + 1, APR.x - RING.x - 3, APR.y, APR.y + APR.h, DUGOUT.y0, DUGOUT.y1);
    rr(c, APR.x, APR.y, APR.w, APR.h, 5);
    fillStroke(c, APRON, 2.5);
    c.fillStyle = SHADE; // the boards' shadow on the apron
    c.fillRect(APR.x + 1.25, APR.y + 1.25, APR.w - 2.5, 4);
    c.fillRect(APR.x + 1.25, APR.y + 5.25, 3, APR.h - 6.5);

    // the pitch
    const bands = 14;
    const band = FH / bands;
    for (let i = 0; i < bands; i++) {
      c.fillStyle = i % 2 ? GRASS_B : GRASS_A;
      c.fillRect(FX, FY + i * band, FW, band + 0.5);
    }
    const rnd = seeded(5);
    for (let i = 0; i < 700; i++) {
      c.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(30, 90, 40, 0.07)';
      c.fillRect(FX + 4 + rnd() * (FW - 12), FY + 4 + rnd() * (FH - 8), 4, 1.5);
    }
    c.save();
    c.beginPath();
    c.rect(FX, FY, FW, FH);
    c.clip();
    c.translate(MX, MY);
    c.scale(1, FH / FW);
    const g = c.createRadialGradient(0, 0, FW * 0.3, 0, 0, FW * 0.76);
    g.addColorStop(0, 'rgba(255, 255, 220, 0.07)');
    g.addColorStop(0.55, 'rgba(20, 70, 40, 0)');
    g.addColorStop(1, 'rgba(20, 70, 40, 0.2)');
    c.fillStyle = g;
    c.fillRect(-FW, -FW, FW * 2, FW * 2);
    c.restore();
    const lines = layer(FW, FH, this.ratio, (lc) => pitchLines(lc, 0, 0, FW, FH, 3));
    c.globalAlpha = 0.62;
    c.drawImage(lines, FX, FY, FW, FH);
    c.globalAlpha = 1;

    // the goals: the far one whole, of the near one only its shadow (the rest is in front of the fighters)
    const xl = MX - GOAL_W / 2;
    const xr = MX + GOAL_W / 2;
    c.fillStyle = 'rgba(27, 21, 34, 0.24)';
    poly(c, [xl, FY, xl + 5, FY - GOAL_D, xr - 5, FY - GOAL_D, xr, FY]);
    c.fill();
    poly(c, [xl, FB, xl + 5, FB + GOAL_D - 2, xr - 5, FB + GOAL_D - 2, xr, FB]);
    c.fill();
    goal(c, true);
    cornerFlag(c, FX + 2, FY + 2, -1);
    cornerFlag(c, FR - 2, FY + 2, 1);

    // the halfway buildings: dugouts and the tunnel on the right, a TV camera on the left
    rr(c, FR + 7, MY - 12, 40, 24, 4);
    fillStroke(c, CONCRETE, 2.4);
    rr(c, FR + 20, MY - 8, 30, 16, 3);
    c.fillStyle = ROOF_DARK;
    c.fill();
    c.fillStyle = GOLD;
    c.fillRect(FR + 9.5, MY - 9.5, 4, 19);
    dugout(c, MY - 70, 1);
    dugout(c, MY + 14, 0);
    rr(c, -6, MY - 13, 27, 26, 4);
    fillStroke(c, CONCRETE, 2.4);
    circle(c, 6, MY + 5, 4);
    fillStroke(c, FUR[0], 1.4);
    rr(c, 5, MY - 9, 11, 9, 2);
    fillStroke(c, '#5a5574', 1.6);
    c.fillStyle = INK;
    c.fillRect(16, MY - 7, 4, 5);
  }

  /** Over the crowd at the far end: the stand's roof and the two far towers. */
  private paintTopStrip(c: Ctx) {
    const edge = 96;
    for (let x = 0, i = 0; x < W; x += 54, i++) {
      c.fillStyle = i % 2 ? ROOF_ALT : ROOF;
      c.fillRect(x, 0, 54, edge);
    }
    c.fillStyle = 'rgba(27, 21, 34, 0.3)';
    for (let x = 54; x < W; x += 54) c.fillRect(x - 1, 0, 2, edge);
    c.fillStyle = ROOF_LIGHT;
    c.fillRect(0, edge - 12, W, 4);
    c.fillStyle = INK;
    c.fillRect(0, edge - 3, W, 14);
    c.fillStyle = CREAM;
    c.fillRect(0, edge, W, 8);
    c.fillStyle = COLOR.paperDark;
    c.fillRect(0, edge + 5, W, 3);
    c.fillStyle = 'rgba(27, 21, 34, 0.3)'; // the roof's shadow on the back row
    c.fillRect(0, edge + 11, W, 7);
    tower(c, TOWERS[0][0], TOWERS[0][1], TOWERS[0][2]);
    tower(c, TOWERS[1][0], TOWERS[1][1], TOWERS[1][2]);
  }

  /** Over the crowd at the near end: the balcony wall with its banners and the two near towers. */
  private paintBotStrip(c: Ctx) {
    const y = BALCONY.y;
    const h = BALCONY.h;
    c.fillStyle = INK;
    c.fillRect(0, y - 1.5, W, h + 3);
    c.fillStyle = CONCRETE;
    c.fillRect(0, y + 1, W, h - 2);
    c.fillStyle = CONCRETE_DARK;
    c.fillRect(0, y + h - 5, W, 4);
    for (const a of AISLES) stairs(c, a, y - 1.5, h + 3);
    // banners hung over the wall
    for (const [x0, x1] of [
      [70, 155],
      [385, 470],
    ]) {
      rr(c, x0, y - 3, x1 - x0, h + 5, 3);
      fillStroke(c, TEAM[0].main, 2.4);
      c.fillStyle = '#ffffff';
      for (let x = x0 + 12; x < x1 - 8; x += 21) c.fillRect(x, y - 1.8, 9, h + 2.6);
    }
    rr(c, 178, y - 4, 184, h + 8, 4);
    fillStroke(c, CREAM, 2.6);
    c.fillStyle = TEAM[0].main;
    c.fillRect(180, y + h - 1, 180, 3.5);
    word(c, 'GO PETS GO!', MX, y + h / 2 - 1, 16, TEAM[0].dark);
    tower(c, TOWERS[2][0], TOWERS[2][1], TOWERS[2][2]);
    tower(c, TOWERS[3][0], TOWERS[3][1], TOWERS[3][2]);
  }

  /** The night veil: dark stands, a floodlit pitch, four soft cones of light. */
  private paintNight(c: Ctx) {
    c.fillStyle = 'rgba(14, 12, 46, 0.7)';
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-out';
    c.save();
    c.translate(MX, MY);
    c.scale(1, FH / FW);
    const g = c.createRadialGradient(0, 0, FW * 0.1, 0, 0, FW * 0.8);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
    g.addColorStop(0.72, 'rgba(0, 0, 0, 0.36)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    c.fillRect(-W, -W * 1.2, W * 2, W * 2.4);
    c.restore();
    c.globalCompositeOperation = 'source-over';
    for (const [x, , hy] of TOWERS) {
      const tx = MX + (x < MX ? -60 : 60);
      const ty = MY + (hy < MY ? -170 : 170);
      const len = Math.hypot(tx - x, ty - hy);
      const nx = -(ty - hy) / len;
      const ny = (tx - x) / len;
      const g2 = c.createLinearGradient(x, hy, tx, ty);
      g2.addColorStop(0, 'rgba(255, 244, 190, 0.3)');
      g2.addColorStop(1, 'rgba(255, 244, 190, 0)');
      c.fillStyle = g2;
      poly(c, [x + nx * 8, hy + ny * 8, tx + nx * 120, ty + ny * 120, tx - nx * 120, ty - ny * 120, x - nx * 8, hy - ny * 8]);
      c.fill();
    }
  }

  // ---------------------------------------------------------------- painting: the lobby

  private paintStageBack(c: Ctx) {
    const sky = c.createLinearGradient(0, 0, 0, 70);
    sky.addColorStop(0, '#7fc6f7');
    sky.addColorStop(1, '#cdeeff');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, S_BACK_H);
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const [x, y, s] of [
      [150, 20, 1],
      [372, 13, 0.8],
      [262, 30, 0.6],
    ]) {
      c.beginPath();
      for (const [dx, dy, r] of [
        [-18, 3, 9],
        [-5, -2, 13],
        [11, 1, 10],
        [22, 5, 7],
      ]) {
        c.moveTo(x + (dx + r) * s, y + dy * s);
        c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      }
      c.fill();
    }
    // floodlight masts behind the roof
    for (const x of [62, W - 62]) {
      c.fillStyle = INK;
      c.fillRect(x - 5.5, 22, 11, 30);
      c.fillStyle = STEEL;
      c.fillRect(x - 3, 22, 6, 30);
      rr(c, x - 25, 3, 50, 25, 6);
      fillStroke(c, ROOF_LIGHT, 3);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          circle(c, x - 15.6 + i * 10.4, 10.6 + j * 9.6, 3.7);
          fillStroke(c, LAMP, 1.5);
        }
    }
    // the roof, the dark under it, the terraces
    c.fillStyle = INK;
    c.fillRect(0, 40, W, 19);
    c.fillStyle = ROOF;
    c.fillRect(0, 42.5, W, 8);
    c.fillStyle = ROOF_LIGHT;
    c.fillRect(0, 42.5, W, 2.5);
    c.fillStyle = CREAM;
    c.fillRect(0, 50.5, W, 6);
    c.fillStyle = ROOF_DARK;
    c.fillRect(0, 59, W, S_ROWS[0] - 59 - 14);
    S_ROWS.forEach((y, k) => {
      const y0 = k ? S_ROWS[k - 1] : S_ROWS[0] - 14;
      c.fillStyle = SEAT[0][k % 2];
      c.fillRect(0, y0, W, y - y0 + 4);
      c.fillStyle = SHADE;
      c.fillRect(0, y - 2, W, 2);
    });
    stairs(c, 135, 59, S_BACK_H - 59);
    stairs(c, 405, 59, S_BACK_H - 59);
    c.fillStyle = 'rgba(27, 21, 34, 0.28)'; // the roof's shadow
    c.fillRect(0, 59, W, 8);
    // pennants under the roof edge
    for (let x = 6, i = 0; x < W; x += 16, i++) {
      poly(c, [x, 58, x + 12, 58, x + 6, 68]);
      fillStroke(c, [TEAM[0].main, CREAM, GOLD][i % 3], 1.6);
    }
  }

  private paintStageFront(c: Ctx) {
    // the wall of boards
    c.fillStyle = INK;
    c.fillRect(0, S_WALL - 2.5, W, S_GRASS - S_WALL + 4);
    boardRow(c, -1, S_WALL, S_GRASS - S_WALL - 1, [['ZOO CUP', 0, 110], ['GO PETS!', 2, 106], ['ROAR!', 1, 108], ['PAWS UP', 3, 106], ['HOP HOP', 0, 112]], 15);
    // the grass
    perspectiveStripes(c, S_GRASS, STAGE.h);
    c.fillStyle = SHADE;
    c.fillRect(0, S_GRASS, W, 6);
    c.fillStyle = 'rgba(255, 255, 255, 0.7)';
    c.fillRect(0, S_GRASS + 12, W, 3);
    c.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    c.lineWidth = 3.5;
    ellipse(c, MX, SG + 4, 176, 31);
    c.stroke();
    ellipse(c, MX, SG + 4, 7, 2.6);
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.fill();
    c.fillStyle = 'rgba(20, 70, 40, 0.16)';
    c.fillRect(0, STAGE.h - 7, W, 7);

    // a goal at the right end, seen from the side
    const a0: P = [472, SG + 14];
    const a1: P = [472, SG - 62];
    const b0: P = [494, SG - 12];
    const b1: P = [494, SG - 84];
    const cg: P = [534, SG + 14];
    const dg: P = [552, SG - 12];
    ellipse(c, 506, SG + 12, 44, 7);
    c.fillStyle = SHADE;
    c.fill();
    bar(c, [b0[0], b0[1], b1[0], b1[1]], 3.5);
    c.fillStyle = 'rgba(255, 255, 255, 0.2)';
    poly(c, [a1[0], a1[1], b1[0], b1[1], dg[0], dg[1], cg[0], cg[1]]);
    c.fill();
    poly(c, [a1[0], a1[1], cg[0], cg[1], a0[0], a0[1]]);
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    c.lineWidth = 1.2;
    netQuad(c, a1, b1, dg, cg, 4, 9);
    netQuad(c, a1, a1, cg, a0, 8, 7);
    bar(c, [a1[0], a1[1], cg[0], cg[1], a0[0], a0[1]], 1.6, '#e9e4f0');
    bar(c, [a0[0], a0[1], a1[0], a1[1], b1[0], b1[1]], 4);

    // a corner flag and a ball at the left end
    ellipse(c, 36, SG + 14, 9, 3);
    c.fillStyle = SHADE;
    c.fill();
    poly(c, [32, SG - 50, 56, SG - 42, 32, SG - 33]);
    fillStroke(c, COLOR.vermilion, 2.4);
    bar(c, [32, SG + 13, 32, SG - 51], 2.4, GOLD);
    ellipse(c, 70, SG + 31, 11, 3.4);
    c.fillStyle = SHADE;
    c.fill();
    circle(c, 68, SG + 22, 9.5);
    fillStroke(c, '#ffffff', 2.4);
    c.fillStyle = INK;
    poly(c, [68, SG + 17.5, 72.3, SG + 20.6, 70.7, SG + 25.6, 65.3, SG + 25.6, 63.7, SG + 20.6]);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.beginPath();
    for (const [x1, y1, x2, y2] of [
      [68, 17.5, 68, 13],
      [72.3, 20.6, 76.6, 19],
      [70.7, 25.6, 73.4, 29.6],
      [65.3, 25.6, 62.6, 29.6],
      [63.7, 20.6, 59.4, 19],
    ]) {
      c.moveTo(x1, SG + y1);
      c.lineTo(x2, SG + y2);
    }
    c.stroke();
  }

  private paintLobby(c: Ctx) {
    c.fillStyle = LOBBY_A;
    c.fillRect(0, 0, W, H);
    c.fillStyle = LOBBY_B;
    for (let y = 0; y < H; y += 180) c.fillRect(0, y, W, 90);
    const lines = layer(W, H, this.ratio, (lc) => pitchLines(lc, 14, 20, W - 28, H - 40, 5));
    c.globalAlpha = 0.055;
    c.drawImage(lines, 0, 0, W, H);
    c.globalAlpha = 1;
    const g = c.createRadialGradient(MX, H / 2, H * 0.2, MX, H / 2, H * 0.62);
    g.addColorStop(0, 'rgba(10, 16, 24, 0)');
    g.addColorStop(1, 'rgba(10, 16, 24, 0.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}
