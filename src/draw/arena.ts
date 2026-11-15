import { W, H, STAGE } from '../theme';
import { ARENA } from '../data';
import { VIEW_PAD, viewRect, viewScale, setView, setFocus, focusDepth, screenX, screenY, arenaY, type ViewRect } from './camera';
import { rr, circle, ellipse, type Ctx } from '../util';
import { makeRng, type Rng } from '../rng';

/*
 * The football arena, flat and seen from straight above (camera.ts). A muted mowed pitch with clean white
 * markings and two small goals sits inside a rounded slate wall; outside it, grey crowd silhouettes pack both long
 * sides (a few wave little blue or red flags and scarves, and jump on cheer()), a scoreboard and a penguin referee
 * stand above the far end and the bench sits below the near one. Things outside the pitch are drawn as if seen a
 * little from the front, like the crowd: heads above bodies, the far wall's inner face and the near wall's outer
 * face showing.
 *
 * Everything that does not move is painted once into one tall canvas (per view width and pixel ratio) that covers
 * the whole stadium; a frame copies the visible band of it into the view, then draws only what moves: the lively
 * fans (head, shoulders, arms and flag or scarf: one frame of an atlas over their baked body), the bench, the
 * referee and the scoreboard lights.
 *
 * World units are arena px: ax across, ay deep (0 = the far end line, ARENA.h = yours), negative / past the end
 * outside the pitch.
 */

// ------------------------------------------------------------------ palette (calm, a little more colour since v5)

const BG = '#cdc6dc'; // the stands' concrete, a soft lavender grey that sits with the deep interface
const STAND = '#c3bbd6'; // the terraces behind the side crowds
const STEP = 'rgba(80, 64, 120, 0.14)';
const STEP_HI = 'rgba(255, 255, 255, 0.32)';
const APRON = '#c8c1d8';
const GRASS = ['#8fbf74', '#85b56b'];
const LINE = 'rgba(248, 250, 240, 0.9)';
const WALL_TOP = '#6f78b0';
const WALL_HI = 'rgba(255, 255, 255, 0.22)';
const WALL_FACE = '#535c92';
const WALL_EDGE = '#363d6b';
const SEAM = 'rgba(30, 30, 70, 0.32)';
const INK = '#343c49'; // outlines of props and the referee
/** the crowd: soft, friendly colours (muted, never loud) */
const PEOPLE = [
  { body: '#8fb0d8', head: '#f0d5c0' },
  { body: '#e3a39a', head: '#e8c4a8' },
  { body: '#a3cfa6', head: '#f2dcc8' },
  { body: '#c2aee0', head: '#dcb89c' },
  { body: '#e8c983', head: '#f0d5c0' },
  { body: '#9fc9cf', head: '#c99c7c' },
];
const HAT = ['#6f6aa8', '#c77f6e', '#5d8a9e'];
const PEOPLE_LINE = '#5e5878';
const EYE = '#4c535d';
const TEAMC = [
  { main: '#7499c8', dark: '#55779f', light: '#a9c1e0' },
  { main: '#cf847b', dark: '#a6625a', light: '#e7b3ac' },
];
const CREAM = '#f3eee2';
const BEAK = '#e0a160';
const PENG = '#414a5a';
const CARD = '#e6c65e';
const LAMP = '#f1ecdc';
const LAMP_ON = '#fff4cc';

// ------------------------------------------------------------------ the plan (arena px)

const AW = ARENA.w;
const AH = ARENA.h;
const SIDE = VIEW_PAD.side;
/** Arena px of stadium cached above the far end line and below the near one. */
const EXT = 200;
/** The wall: its thickness and the pitch's corner radius. */
const WALL = 13;
const RAD = 30;
/** The markings: inset of the touchlines and the end lines from the wall. */
const LX = 16;
const LY = 24;
/** The rows of the crowd. */
const ROW = 17;
const COL_A = WALL + 13; // the front column's distance outside the pitch edge
const COL_B = WALL + 26;
/**
 * A lively fan's frame around its base point: head, shoulders (cut at y1, so it never covers the fan in front),
 * arms and what it holds. Its frames sit in one atlas: [rest x frames, cheering x frames].
 */
const CELL = { x0: -24, x1: 24, y0: -47, y1: -5 };
/** A flag's waving frames. */
const FLAG_FRAMES = 4;
/** Where the referee stands (feet) and the scoreboard's centre. */
const REF = { x: AW / 2 - 100, y: -7 };
const BOARD = { x: AW / 2, y: -34, w: 124, h: 30 };
const REF_BOX = { x0: -20, y0: -52, x1: 25, y1: 4 };
/** The bench below the near end. */
const DUG = { x: AW / 2, top: AH + WALL + 2, base: AH + 50 };
/** Where the near wall's lip starts (drawFront covers from here down). */
const LIP_Y = AH - 6;
const LIP_H = WALL + 12;

/** Where the units stand in the old lobby strip (kept for the lobby until it is replaced). */
export const STAGE_GROUND_Y = STAGE.y + STAGE.h - 46;

type Acc = 'none' | 'flag' | 'scarf' | 'beanie';

interface Fan {
  x: number;
  y: number;
  /** which way it looks: +1 right, -1 left, 0 up the pitch */
  d: number;
  tone: number;
  hat: number;
  team: number;
  acc: Acc;
  ph: number;
  /** order along the stand, for the cheer to ripple */
  i: number;
  /** sub on the bench: tracksuit in the team colour */
  sub?: boolean;
  /** its first frame in the atlas, and how many frames each pose has */
  cell: number;
  frames: number;
}

interface Atlas {
  canvas: HTMLCanvasElement;
  /** one frame's size in pixels, and frames per atlas row */
  cw: number;
  ch: number;
  cols: number;
}

// ------------------------------------------------------------------ helpers

function layer(w: number, h: number, ratio: number, paint: (c: Ctx) => void, opaque = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * ratio));
  cv.height = Math.max(1, Math.ceil(h * ratio));
  const c = cv.getContext('2d', { alpha: !opaque })!;
  c.scale(ratio, ratio);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  paint(c);
  return cv;
}

/** Adds a rounded rectangle to the current path (no beginPath), for rings filled even-odd. */
function rrAdd(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

function fs(c: Ctx, fill: string, lw: number, stroke: string) {
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

// ------------------------------------------------------------------ the crowd

function makeFans(rng: Rng): { back: Fan[]; front: Fan[]; bench: Fan[] } {
  const back: Fan[] = [];
  const front: Fan[] = [];
  for (const side of [-1, 1]) {
    const d = -side;
    const xa = side < 0 ? -COL_A : AW + COL_A;
    const xb = side < 0 ? -COL_B : AW + COL_B;
    let i = 0;
    for (let y = -30 + ROW / 2; y <= AH + 26; y += ROW) {
      back.push({ x: xb + rng.range(-1.5, 1.5), y: y + rng.range(-1, 1), d, tone: rng.int(0, PEOPLE.length - 1), hat: rng.int(0, 3), team: 0, acc: 'none', ph: rng.next() * 6, i: i++, cell: 0, frames: 1 });
    }
    i = 0;
    for (let y = -22; y <= AH + 22; y += ROW) {
      const half = y > AH / 2 ? 0 : 1;
      const team = rng.chance(0.15) ? 1 - half : half;
      let acc: Acc = 'none';
      if (rng.chance(0.3)) acc = (['flag', 'flag', 'flag', 'scarf', 'scarf', 'beanie', 'beanie', 'none', 'none'] as const)[rng.int(0, 8)];
      // a still fan is baked whole; 'none' here means a lively fan that only reacts to cheers
      const lively = acc !== 'none' || rng.chance(0.05);
      const f: Fan = { x: xa + rng.range(-1.2, 1.2), y: y + rng.range(-0.8, 0.8), d, tone: rng.int(0, PEOPLE.length - 1), hat: rng.int(0, 3), team, acc, ph: rng.next() * 6, i: i++, cell: 0, frames: 1 };
      if (acc === 'beanie') f.hat = 1;
      if (!lively) f.ph = -1;
      front.push(f);
    }
  }
  const bench: Fan[] = [-66, -33, 0, 33, 66].map((dx, i) => ({
    x: DUG.x + dx + rng.range(-2, 2),
    y: DUG.base,
    d: 0,
    tone: rng.int(0, PEOPLE.length - 1),
    hat: i === 2 ? 1 : rng.chance(0.5) ? 3 : 0,
    team: 0,
    acc: 'none' as Acc,
    ph: rng.next() * 6,
    i,
    sub: true,
    cell: 0,
    frames: 1,
  }));
  return { back, front, bench };
}

const isLively = (f: Fan) => f.ph >= 0;

/** One fan, base point (x, y) at the bottom of its shoulders. part: the whole fan, only its body, or head and shoulders. */
function paintFan(c: Ctx, f: Fan, x: number, y: number, part: 'all' | 'body' | 'top') {
  const tone = PEOPLE[f.tone];
  const body = f.sub ? TEAMC[0].main : tone.body;
  rr(c, x - 8.5, y - 12, 17, 15, 6.5);
  fs(c, body, 1.4, PEOPLE_LINE);
  if (f.sub) {
    // a light collar stripe on the tracksuit
    c.beginPath();
    c.moveTo(x - 4, y - 11.4);
    c.lineTo(x, y - 8.5);
    c.lineTo(x + 4, y - 11.4);
    c.strokeStyle = TEAMC[0].light;
    c.lineWidth = 1.3;
    c.stroke();
  }
  if (part === 'body') return;
  if (f.acc === 'beanie' || (f.sub && f.hat === 1)) {
    // a scarf in the team colour round the neck
    rr(c, x - 6.5, y - 12.3, 13, 3.6, 1.8);
    fs(c, TEAMC[f.team].main, 1.1, TEAMC[f.team].dark);
  }
  const hy = y - 15.5;
  circle(c, x, hy, 6.2);
  fs(c, tone.head, 1.4, PEOPLE_LINE);
  // eyes, looking at the pitch
  const ex = x + f.d * 1.7;
  const ey = hy - 0.2 - (f.d === 0 ? 1 : 0);
  c.fillStyle = EYE;
  circle(c, ex - 2.1, ey, 0.95);
  c.fill();
  circle(c, ex + 2.1, ey, 0.95);
  c.fill();
  const hatCol = f.acc === 'beanie' ? TEAMC[f.team].main : HAT[(f.tone + f.i) % HAT.length];
  if (f.hat === 1) {
    c.beginPath();
    c.arc(x, hy - 0.6, 6.4, Math.PI * 1.02, Math.PI * 1.98);
    c.closePath();
    fs(c, hatCol, 1.3, f.acc === 'beanie' ? TEAMC[f.team].dark : PEOPLE_LINE);
    circle(c, x, hy - 7.2, 1.7);
    fs(c, f.acc === 'beanie' ? TEAMC[f.team].light : CREAM, 1.1, f.acc === 'beanie' ? TEAMC[f.team].dark : PEOPLE_LINE);
  } else if (f.hat === 2) {
    c.beginPath();
    c.arc(x, hy - 0.8, 6.3, Math.PI * 1.05, Math.PI * 1.95);
    c.closePath();
    fs(c, hatCol, 1.3, PEOPLE_LINE);
    ellipse(c, x + (f.d || 1) * 5.2, hy - 2.6, 3.6, 1.3);
    fs(c, hatCol, 1.1, PEOPLE_LINE);
  } else if (f.hat === 3) {
    c.beginPath();
    c.moveTo(x - 5.6, hy - 2.4);
    c.quadraticCurveTo(x - 4, hy - 8.4, x + 0.5, hy - 6.6);
    c.quadraticCurveTo(x + 4.6, hy - 8.6, x + 5.8, hy - 2.6);
    c.quadraticCurveTo(x + 1, hy - 5, x - 5.6, hy - 2.4);
    fs(c, HAT[(f.tone + 1) % HAT.length], 1.1, PEOPLE_LINE);
  }
}

/** A lively fan at base (0, 0): arms up by `up` (0..1) behind it, head and shoulders, then its flag or scarf. */
function paintLively(c: Ctx, f: Fan, up: number, wave: number) {
  const body = f.sub ? TEAMC[0].main : PEOPLE[f.tone].body;
  const tc = TEAMC[f.team];
  if (f.acc === 'scarf') up = Math.max(up, 0.8);
  const side = f.d === 0 ? 1 : f.d;
  const handL = { x: -6 - 4 * up, y: -9 - 15 * up };
  const handR = { x: 6 + 4 * up, y: -9 - 15 * up };
  if (f.acc === 'flag') {
    const h = side > 0 ? handR : handL;
    h.x = side * (8 + up * 1.5);
    h.y = -22 - up * 4;
  }
  c.beginPath();
  if (up > 0.08) {
    c.moveTo(-6, -9);
    c.lineTo(handL.x, handL.y);
    c.moveTo(6, -9);
    c.lineTo(handR.x, handR.y);
  } else if (f.acc === 'flag') {
    const h = side > 0 ? handR : handL;
    c.moveTo(side * 6, -9);
    c.lineTo(h.x, h.y);
  }
  c.lineWidth = 4.4;
  c.strokeStyle = PEOPLE_LINE;
  c.stroke();
  c.lineWidth = 2.4;
  c.strokeStyle = body;
  c.stroke();
  c.save();
  c.beginPath();
  c.rect(-30, -60, 60, 60 + CELL.y1);
  c.clip();
  paintFan(c, f, 0, 0, 'top');
  c.restore();
  if (f.acc === 'flag') {
    const h = side > 0 ? handR : handL;
    const px = h.x;
    const py = h.y - 13;
    c.beginPath();
    c.moveTo(h.x, h.y + 2);
    c.lineTo(px, py);
    c.lineWidth = 1.5;
    c.strokeStyle = '#5f6670';
    c.stroke();
    const w1 = Math.sin(wave) * 1.7;
    const w2 = Math.sin(wave + 1.7) * 1.7;
    const L = 11 * side;
    c.beginPath();
    c.moveTo(px, py);
    c.quadraticCurveTo(px + L * 0.5, py + w1, px + L, py + w2);
    c.lineTo(px + L, py + 7 + w2);
    c.quadraticCurveTo(px + L * 0.5, py + 7 + w1, px, py + 7);
    c.closePath();
    fs(c, tc.main, 1.1, tc.dark);
  } else if (f.acc === 'scarf') {
    // a striped scarf stretched between the hands
    const lx = handL.x - 1;
    const rx = handR.x + 1;
    const yy = handL.y - 1.5;
    rr(c, lx, yy - 2.3, rx - lx, 4.6, 1);
    fs(c, tc.main, 1, tc.dark);
    c.fillStyle = CREAM;
    c.fillRect(-4.5, yy - 2, 2.2, 4);
    c.fillRect(2.3, yy - 2, 2.2, 4);
  }
}

/** Every lively fan's frames in one canvas, so a frame of the crowd is one drawImage per fan. */
function buildAtlas(fans: Fan[], R: number): Atlas {
  let n = 0;
  for (const f of fans) {
    f.frames = f.acc === 'flag' ? FLAG_FRAMES : 1;
    f.cell = n;
    n += f.frames * 2;
  }
  const cw = Math.ceil((CELL.x1 - CELL.x0) * R);
  const ch = Math.ceil((CELL.y1 - CELL.y0) * R);
  const cols = Math.max(1, Math.min(n, Math.floor(4096 / cw)));
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw;
  canvas.height = Math.ceil(n / cols) * ch;
  const c = canvas.getContext('2d')!;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  for (const f of fans)
    for (let pose = 0; pose < 2; pose++)
      for (let fr = 0; fr < f.frames; fr++) {
        const i = f.cell + pose * f.frames + fr;
        c.setTransform(R, 0, 0, R, (i % cols) * cw, Math.floor(i / cols) * ch);
        c.translate(-CELL.x0, -CELL.y0);
        c.save();
        c.beginPath();
        c.rect(CELL.x0, CELL.y0, CELL.x1 - CELL.x0, CELL.y1 - CELL.y0);
        c.clip();
        paintLively(c, f, pose, (fr / f.frames) * Math.PI * 2 + f.ph);
        c.restore();
      }
  return { canvas, cw, ch, cols };
}

// ------------------------------------------------------------------ the referee: a round penguin with a whistle

function paintRef(c: Ctx, pose: 0 | 1 | 2) {
  const lw = 2.2;
  // feet
  ellipse(c, -5.5, -1, 4.6, 2.3);
  fs(c, BEAK, 1.6, INK);
  ellipse(c, 5.5, -1, 4.6, 2.3);
  fs(c, BEAK, 1.6, INK);
  // the far flipper behind the body when raised
  if (pose === 2) {
    ellipse(c, 14, -33, 3.6, 9, -0.45);
    fs(c, PENG, 1.8, INK);
    rr(c, 13, -51, 9, 12, 1.6);
    fs(c, CARD, 1.6, INK);
  }
  // body
  ellipse(c, 0, -18.5, 13.5, 17.5);
  fs(c, PENG, lw, INK);
  // the striped shirt on its belly
  c.save();
  ellipse(c, 0, -11, 9.5, 10.5);
  c.clip();
  c.fillStyle = CREAM;
  c.fillRect(-12, -24, 24, 26);
  c.fillStyle = PENG;
  for (const sx of [-6.8, -2.3, 2.3, 6.8]) c.fillRect(sx - 1.05, -24, 2.1, 26);
  c.restore();
  ellipse(c, 0, -11, 9.5, 10.5);
  c.lineWidth = 1.3;
  c.strokeStyle = INK;
  c.stroke();
  // the white face
  ellipse(c, 0, -28, 8.6, 6.4);
  c.fillStyle = CREAM;
  c.fill();
  // eyes
  for (const s of [-1, 1]) {
    circle(c, s * 3.3, -29.2, 1.75);
    c.fillStyle = INK;
    c.fill();
    circle(c, s * 3.3 + 0.6, -29.8, 0.6);
    c.fillStyle = '#ffffff';
    c.fill();
  }
  // beak and whistle
  c.beginPath();
  c.moveTo(-2.8, -26);
  c.lineTo(2.8, -26);
  c.lineTo(0, -22.3);
  c.closePath();
  fs(c, BEAK, 1.3, INK);
  rr(c, 1.2, -24.6, 5.4, 2.8, 1.2);
  fs(c, '#cfd4db', 1.2, INK);
  if (pose === 1) {
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    c.lineWidth = 1.4;
    for (const [dx, dy] of [
      [10, -28],
      [11.5, -23],
      [10, -18.5],
    ]) {
      c.beginPath();
      c.moveTo(7.8 + (dx - 8) * 0.3, -23.2 + (dy + 23.2) * 0.3);
      c.lineTo(dx, dy);
      c.stroke();
    }
  }
  // a little ref cap
  c.beginPath();
  c.arc(0, -33.5, 7.4, Math.PI * 1.08, Math.PI * 1.92);
  c.closePath();
  fs(c, '#2e3541', 1.4, INK);
  ellipse(c, 0, -34.5, 8.6, 1.6);
  fs(c, '#2e3541', 1.2, INK);
  // flippers
  ellipse(c, -13, -16, 3.7, 8.8, 0.35);
  fs(c, PENG, 1.8, INK);
  if (pose !== 2) {
    ellipse(c, 13, -16, 3.7, 8.8, -0.35);
    fs(c, PENG, 1.8, INK);
  }
}

// ------------------------------------------------------------------ the stadium layer

function paintStands(c: Ctx) {
  c.fillStyle = BG;
  c.fillRect(-SIDE, -EXT, AW + SIDE * 2, AH + EXT * 2);
  // terraces behind the end stands: soft steps
  for (let y = -WALL - 8; y > -EXT; y -= 11) {
    c.fillStyle = STEP;
    c.fillRect(-SIDE, y, AW + SIDE * 2, 1.2);
    c.fillStyle = STEP_HI;
    c.fillRect(-SIDE, y + 1.2, AW + SIDE * 2, 1);
  }
  // the apron below the near end
  c.fillStyle = APRON;
  c.fillRect(-SIDE, AH + WALL, AW + SIDE * 2, EXT);
  for (let y = AH + WALL + 60; y < AH + EXT; y += 11) {
    c.fillStyle = STEP;
    c.fillRect(-SIDE, y, AW + SIDE * 2, 1.2);
    c.fillStyle = STEP_HI;
    c.fillRect(-SIDE, y + 1.2, AW + SIDE * 2, 1);
  }
  // the side terraces
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -SIDE : AW + WALL + 2;
    const w = SIDE - WALL - 2;
    c.fillStyle = STAND;
    c.fillRect(x0, -EXT, w, AH + EXT * 2);
    for (let y = -EXT + 4; y < AH + EXT; y += ROW) {
      c.fillStyle = STEP;
      c.fillRect(x0, y, w, 1.2);
    }
    // the stand's low front wall along the pitch
    c.fillStyle = '#c4beb3';
    c.fillRect(side < 0 ? -WALL - 3 : AW + WALL + 1, -EXT, 2, AH + EXT * 2);
  }
}

function paintFloodlight(c: Ctx, x: number, y: number) {
  // the mast's shadow and the mast
  ellipse(c, x + 3, y + 15, 7, 2.6);
  c.fillStyle = 'rgba(60, 56, 48, 0.14)';
  c.fill();
  c.beginPath();
  c.moveTo(x, y + 4);
  c.lineTo(x, y + 14);
  c.strokeStyle = '#7d8592';
  c.lineWidth = 2.6;
  c.stroke();
  rr(c, x - 13, y - 9, 26, 15, 3);
  fs(c, '#6b7587', 1.8, INK);
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 4; k++) {
      circle(c, x - 8.4 + k * 5.6, y - 4.6 + r * 6, 2.1);
      c.fillStyle = LAMP;
      c.fill();
    }
}

function paintBoard(c: Ctx) {
  const { x, y, w, h } = BOARD;
  // legs down to the wall and a soft shadow
  c.fillStyle = 'rgba(60, 56, 48, 0.14)';
  rr(c, x - w / 2 + 4, y - h / 2 + 5, w, h, 6);
  c.fill();
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(x + s * (w / 2 - 18), y + h / 2);
    c.lineTo(x + s * (w / 2 - 18), -WALL + 1);
    c.strokeStyle = '#6f7887';
    c.lineWidth = 3;
    c.stroke();
  }
  rr(c, x - w / 2, y - h / 2, w, h, 6);
  fs(c, '#4a5364', 2, INK);
  rr(c, x - w / 2 + 4, y - h / 2 + 6, w - 8, h - 10, 3.5);
  c.fillStyle = '#2f3643';
  c.fill();
  // the two teams' panels, each with a little crest, and a ball between them
  for (const s of [-1, 1]) {
    const t = TEAMC[s < 0 ? 0 : 1];
    const px = x + s * 31;
    rr(c, px - 22, y - 7, 44, 15, 3);
    c.fillStyle = t.dark;
    c.fill();
    c.beginPath();
    c.moveTo(px - 4.5, y - 4.2);
    c.lineTo(px + 4.5, y - 4.2);
    c.lineTo(px + 4.5, y + 0.5);
    c.quadraticCurveTo(px + 4.2, y + 4, px, y + 5.4);
    c.quadraticCurveTo(px - 4.2, y + 4, px - 4.5, y + 0.5);
    c.closePath();
    c.fillStyle = t.light;
    c.fill();
  }
  circle(c, x, y + 0.5, 4.6);
  c.fillStyle = CREAM;
  c.fill();
  circle(c, x, y + 0.5, 1.7);
  c.fillStyle = '#4a5364';
  c.fill();
  // the light bulbs along the top, off
  for (let k = 0; k < 9; k++) {
    circle(c, x - 48 + k * 12, y - h / 2 + 3, 1.3);
    c.fillStyle = '#6c7586';
    c.fill();
  }
}

function paintWall(c: Ctx) {
  // the near wall's outer face, showing below the ring
  rr(c, -WALL, -WALL + 5, AW + WALL * 2, AH + WALL * 2, RAD + WALL);
  fs(c, WALL_FACE, 2, WALL_EDGE);
  // the ring's top
  c.beginPath();
  rrAdd(c, -WALL, -WALL, AW + WALL * 2, AH + WALL * 2, RAD + WALL);
  rrAdd(c, 0, 0, AW, AH, RAD);
  c.fillStyle = WALL_TOP;
  c.fill('evenodd');
  // board seams across the top
  c.strokeStyle = SEAM;
  c.lineWidth = 1.2;
  c.beginPath();
  for (let y = RAD + 22; y < AH - RAD - 10; y += 46) {
    c.moveTo(-WALL, y);
    c.lineTo(0, y);
    c.moveTo(AW, y);
    c.lineTo(AW + WALL, y);
  }
  for (let x = RAD + 30; x < AW - RAD - 10; x += 50) {
    c.moveTo(x, -WALL);
    c.lineTo(x, 0);
    c.moveTo(x, AH);
    c.lineTo(x, AH + WALL);
  }
  c.stroke();
  // a soft light along the outer half of the top
  c.save();
  c.beginPath();
  rrAdd(c, -WALL, -WALL, AW + WALL * 2, AH + WALL * 2, RAD + WALL);
  rrAdd(c, -WALL / 2, -WALL / 2, AW + WALL, AH + WALL, RAD + WALL / 2);
  c.clip('evenodd');
  c.fillStyle = WALL_HI;
  c.fillRect(-WALL, -WALL, AW + WALL * 2, AH + WALL * 2);
  c.restore();
  // a muted team stripe on each end's boards
  for (const [ty, team] of [
    [-WALL / 2, 1],
    [AH + WALL / 2, 0],
  ] as const) {
    c.beginPath();
    c.moveTo(RAD + 6, ty);
    c.lineTo(AW - RAD - 6, ty);
    c.strokeStyle = TEAMC[team].main;
    c.globalAlpha = 0.7;
    c.lineWidth = 3;
    c.stroke();
    c.globalAlpha = 1;
  }
  // outlines
  rr(c, -WALL, -WALL, AW + WALL * 2, AH + WALL * 2, RAD + WALL);
  c.lineWidth = 2.2;
  c.strokeStyle = WALL_EDGE;
  c.stroke();
  rr(c, 0, 0, AW, AH, RAD);
  c.lineWidth = 2;
  c.stroke();
}

function paintGoal(c: Ctx, far: boolean) {
  const gw = 78;
  const gd = 19;
  const x0 = AW / 2 - gw / 2;
  const yLine = far ? LY : AH - LY;
  const y0 = far ? yLine - gd : yLine;
  // shadow, net, frame
  c.fillStyle = 'rgba(38, 56, 34, 0.16)';
  c.fillRect(x0 + 4, y0 + 4, gw, gd);
  c.fillStyle = 'rgba(255, 255, 255, 0.2)';
  c.fillRect(x0, y0, gw, gd);
  c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  c.lineWidth = 0.8;
  c.beginPath();
  for (let x = x0 + 5; x < x0 + gw; x += 5) {
    c.moveTo(x, y0);
    c.lineTo(x, y0 + gd);
  }
  for (let y = y0 + 4.75; y < y0 + gd - 1; y += 4.75) {
    c.moveTo(x0, y);
    c.lineTo(x0 + gw, y);
  }
  c.stroke();
  c.beginPath();
  c.moveTo(x0, yLine);
  c.lineTo(x0, far ? y0 : y0 + gd);
  c.lineTo(x0 + gw, far ? y0 : y0 + gd);
  c.lineTo(x0 + gw, yLine);
  c.strokeStyle = 'rgba(244, 246, 240, 0.85)';
  c.lineWidth = 1.6;
  c.stroke();
  // the crossbar, chunky, with its posts
  c.beginPath();
  c.moveTo(x0, yLine);
  c.lineTo(x0 + gw, yLine);
  c.strokeStyle = '#56616f';
  c.lineWidth = 6.4;
  c.stroke();
  c.strokeStyle = '#fbfbf7';
  c.lineWidth = 3.8;
  c.stroke();
  for (const x of [x0, x0 + gw]) {
    circle(c, x, yLine, 3.4);
    fs(c, '#fbfbf7', 1.5, '#56616f');
  }
}

function paintPitch(c: Ctx, rng: Rng) {
  c.save();
  rr(c, 0, 0, AW, AH, RAD);
  c.clip();
  // mowing stripes
  const n = 20;
  const sh = AH / n;
  for (let i = 0; i < n; i++) {
    c.fillStyle = GRASS[i % 2];
    c.fillRect(0, i * sh, AW, sh + 0.5);
  }
  // soft patches and grain, so it reads as grass, not paint
  for (let i = 0; i < 18; i++) {
    ellipse(c, rng.range(0, AW), rng.range(0, AH), rng.range(30, 80), rng.range(20, 50), rng.range(0, 3));
    c.fillStyle = i % 2 ? 'rgba(255, 255, 240, 0.03)' : 'rgba(50, 70, 40, 0.018)';
    c.fill();
  }
  for (let i = 0; i < 900; i++) {
    c.fillStyle = i % 3 ? 'rgba(48, 70, 40, 0.07)' : 'rgba(255, 255, 240, 0.09)';
    c.fillRect(rng.range(0, AW), rng.range(0, AH), 1.3, rng.range(1.3, 2.6));
  }
  // a gentle light in the middle
  const g = c.createRadialGradient(AW / 2, AH / 2, 20, AW / 2, AH / 2, AH * 0.62);
  g.addColorStop(0, 'rgba(255, 252, 235, 0.12)');
  g.addColorStop(1, 'rgba(255, 252, 235, 0)');
  c.fillStyle = g;
  c.fillRect(0, 0, AW, AH);

  // markings
  c.strokeStyle = LINE;
  c.lineWidth = 2.6;
  c.lineJoin = 'miter';
  c.lineCap = 'butt';
  c.strokeRect(LX, LY, AW - LX * 2, AH - LY * 2);
  c.beginPath();
  c.moveTo(LX, AH / 2);
  c.lineTo(AW - LX, AH / 2);
  c.stroke();
  c.beginPath();
  c.arc(AW / 2, AH / 2, 58, 0, Math.PI * 2);
  c.stroke();
  const boxW = 250;
  const boxD = 104;
  const goalW = 118;
  const goalD = 38;
  const spot = 76;
  const arcR = 56;
  for (const far of [true, false]) {
    const e = far ? LY : AH - LY; // the end line
    const s = far ? 1 : -1; // into the pitch
    c.beginPath();
    c.moveTo(AW / 2 - boxW / 2, e);
    c.lineTo(AW / 2 - boxW / 2, e + s * boxD);
    c.lineTo(AW / 2 + boxW / 2, e + s * boxD);
    c.lineTo(AW / 2 + boxW / 2, e);
    c.moveTo(AW / 2 - goalW / 2, e);
    c.lineTo(AW / 2 - goalW / 2, e + s * goalD);
    c.lineTo(AW / 2 + goalW / 2, e + s * goalD);
    c.lineTo(AW / 2 + goalW / 2, e);
    c.stroke();
    // the arc outside the box
    const a = Math.asin((boxD - spot) / arcR);
    c.beginPath();
    if (far) c.arc(AW / 2, e + spot, arcR, a, Math.PI - a);
    else c.arc(AW / 2, e - spot, arcR, Math.PI + a, Math.PI * 2 - a);
    c.stroke();
    circle(c, AW / 2, e + s * spot, 3);
    c.fillStyle = LINE;
    c.fill();
    // corner arcs
    c.beginPath();
    if (far) {
      c.arc(LX, LY, 10, 0, Math.PI / 2);
      c.moveTo(AW - LX, LY + 10);
      c.arc(AW - LX, LY, 10, Math.PI / 2, Math.PI);
    } else {
      c.arc(LX, AH - LY, 10, -Math.PI / 2, 0);
      c.moveTo(AW - LX - 10, AH - LY);
      c.arc(AW - LX, AH - LY, 10, Math.PI, Math.PI * 1.5);
    }
    c.stroke();
  }
  circle(c, AW / 2, AH / 2, 3.4);
  c.fillStyle = LINE;
  c.fill();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  paintGoal(c, true);
  paintGoal(c, false);

  // the far wall's inner face, and the walls' soft shadows on the grass (light from the upper left)
  let sg = c.createLinearGradient(0, 0, 0, 22);
  sg.addColorStop(0, 'rgba(36, 52, 34, 0.26)');
  sg.addColorStop(1, 'rgba(36, 52, 34, 0)');
  c.fillStyle = sg;
  c.fillRect(0, 0, AW, 22);
  sg = c.createLinearGradient(0, 0, 14, 0);
  sg.addColorStop(0, 'rgba(36, 52, 34, 0.16)');
  sg.addColorStop(1, 'rgba(36, 52, 34, 0)');
  c.fillStyle = sg;
  c.fillRect(0, 0, 14, AH);
  sg = c.createLinearGradient(AW, 0, AW - 7, 0);
  sg.addColorStop(0, 'rgba(36, 52, 34, 0.1)');
  sg.addColorStop(1, 'rgba(36, 52, 34, 0)');
  c.fillStyle = sg;
  c.fillRect(AW - 7, 0, 7, AH);
  c.fillStyle = WALL_FACE;
  c.fillRect(0, 0, AW, 5);
  c.fillStyle = 'rgba(255, 255, 255, 0.12)';
  c.fillRect(0, 4, AW, 1);
  c.restore();
}

function paintDugout(c: Ctx, bench: Fan[]) {
  const { x, top, base } = DUG;
  const hw = 92;
  // shadow, back wall, side panels
  c.fillStyle = 'rgba(60, 56, 48, 0.14)';
  rr(c, x - hw + 5, top + 6, hw * 2, base - top - 2, 6);
  c.fill();
  rr(c, x - hw, top + 4, hw * 2, base - top - 6, 5);
  fs(c, '#a3adbb', 2, INK);
  c.fillStyle = 'rgba(255, 255, 255, 0.16)';
  c.fillRect(x - hw + 3, top + 9, hw * 2 - 6, 2);
  // the bench seat
  rr(c, x - hw + 6, base - 9, hw * 2 - 12, 6, 2.5);
  fs(c, '#7c8796', 1.4, INK);
  for (const f of bench) paintFan(c, f, f.x, f.y, 'body');
  // the roof
  rr(c, x - hw - 6, top - 1, hw * 2 + 12, 8, 4);
  fs(c, WALL_TOP, 2, INK);
  c.fillStyle = 'rgba(255, 255, 255, 0.24)';
  c.fillRect(x - hw - 2, top + 0.6, hw * 2 + 4, 1.6);
  // the coach, standing beside it with a clipboard
  const cx = x + hw + 24;
  const cy = base + 1;
  rr(c, cx - 7.5, cy - 22, 15, 23, 6);
  fs(c, '#5d6a7e', 1.5, INK);
  circle(c, cx, cy - 27, 6.3);
  fs(c, '#cfcac3', 1.5, INK);
  c.beginPath();
  c.arc(cx, cy - 27.6, 6.5, Math.PI * 1.05, Math.PI * 1.95);
  c.closePath();
  fs(c, TEAMC[0].dark, 1.3, INK);
  ellipse(c, cx, cy - 29.4, 4, 1.4);
  fs(c, TEAMC[0].dark, 1.1, INK);
  c.fillStyle = EYE;
  circle(c, cx - 2.1, cy - 27.6, 0.95);
  c.fill();
  circle(c, cx + 2.1, cy - 27.6, 0.95);
  c.fill();
  rr(c, cx - 1, cy - 16, 9, 11, 1.5);
  fs(c, CREAM, 1.3, INK);
  c.fillStyle = '#9aa2ad';
  c.fillRect(cx + 1, cy - 13, 5, 1);
  c.fillRect(cx + 1, cy - 10.5, 5, 1);
  // a crate of balls on the other side
  const bx = x - hw - 24;
  rr(c, bx - 11, base - 12, 22, 13, 2.5);
  fs(c, '#8a96a6', 1.5, INK);
  for (const [dx, dy] of [
    [-5.5, -13.5],
    [5.5, -13.5],
    [0, -17.5],
  ]) {
    circle(c, bx + dx, base + dy, 4.2);
    fs(c, CREAM, 1.3, INK);
    circle(c, bx + dx, base + dy, 1.4);
    c.fillStyle = '#5a6372';
    c.fill();
  }
}

// ------------------------------------------------------------------ the arena

interface Cache {
  key: string;
  R: number;
  world: HTMLCanvasElement;
  front: HTMLCanvasElement;
  lively: Fan[];
  bench: Fan[];
  ref: HTMLCanvasElement[];
  atlas: Atlas;
}

export class Arena {
  private ratio = 1;
  private cache?: Cache;
  /** cheer levels: everyone, and each team's supporters */
  private all = 0;
  private team = [0, 0];

  /** Cache the static stadium at this device pixel ratio for the current view. Call again when the ratio changes. */
  build(ratio: number) {
    this.ratio = ratio;
    this.cache = undefined;
    this.ensure();
  }

  /** Let the fans settle after a cheer. */
  update(dt: number) {
    this.all = Math.max(0, this.all - dt * 0.8);
    this.team[0] = Math.max(0, this.team[0] - dt * 0.8);
    this.team[1] = Math.max(0, this.team[1] - dt * 0.8);
  }

  /**
   * Make the crowd jump and wave for a moment: team 0 (blue) or 1 (red) sets that side's supporters off (and the
   * rest a little); any other team value cheers everyone. amount 0..1. (A fractional first argument, from older
   * callers, is read as an amount for everyone.)
   */
  cheer(team: number, amount = 1) {
    if (team === 0 || team === 1) {
      this.team[team] = Math.min(1, Math.max(this.team[team], amount));
      this.all = Math.min(1, Math.max(this.all, amount * 0.35));
    } else {
      const a = team > 0 && team < 1 ? team : amount;
      this.all = Math.min(1, Math.max(this.all, a));
    }
  }

  /** Everything under the units, for the current view (camera.ts setView), clipped to it. */
  drawBack(ctx: Ctx, t: number) {
    const C = this.ensure();
    const v = viewRect();
    const K = viewScale();
    const ay0 = arenaY(v.y);
    const ay1 = arenaY(v.y + v.h);
    ctx.save();
    // the caches are painted at the screen's own pixel size: when the canvas is not zoomed, copy them pixel for pixel
    const m = ctx.getTransform();
    const exact = m.b === 0 && m.c === 0 && Math.abs(m.a - this.ratio) < 1e-3 && Math.abs(m.d - this.ratio) < 1e-3;
    ctx.imageSmoothingEnabled = !exact;
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    const top = Math.max(ay0, -EXT);
    const bot = Math.min(ay1, AH + EXT);
    if (top > ay0 || bot < ay1) {
      ctx.fillStyle = top > ay0 ? BG : APRON;
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }
    if (bot > top) {
      const R = C.R;
      const sy = (top + EXT) * R;
      const sh = Math.min(C.world.height - sy, (bot - top) * R);
      ctx.drawImage(C.world, 0, sy, C.world.width, sh, v.x, screenY(top), v.w, sh / R * K);
    }
    // what moves, in arena units
    ctx.translate(screenX(0), screenY(0));
    ctx.scale(K, K);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lo = ay0 - 40;
    const hi = ay1 + 30;
    for (const f of C.lively) if (f.y > lo && f.y < hi) this.drawFan(ctx, f, t, C.atlas);
    if (DUG.base - 30 < ay1) for (const f of C.bench) this.drawFan(ctx, f, t, C.atlas);
    if (ay0 < 0) this.drawTop(ctx, C, t);
    ctx.restore();
  }

  /** Anything over the units: the near wall's lip. */
  drawFront(ctx: Ctx, _t: number) {
    const C = this.ensure();
    const v = viewRect();
    const K = viewScale();
    const y = screenY(LIP_Y);
    if (y > v.y + v.h || y + LIP_H * K < v.y) return;
    const inside = y >= v.y && y + LIP_H * K <= v.y + v.h;
    if (inside) {
      ctx.drawImage(C.front, v.x, y, v.w, LIP_H * K);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    ctx.drawImage(C.front, v.x, y, v.w, LIP_H * K);
    ctx.restore();
  }

  // ---------------------------------------------------------------- old names, until the old screens are replaced

  /** The arena in the current view (old name of drawBack). */
  drawBattle(ctx: Ctx, t: number) {
    this.drawBack(ctx, t);
  }

  /** Old name of drawFront. */
  drawBattleFront(ctx: Ctx, t: number) {
    this.drawFront(ctx, t);
  }

  /** The whole stadium on the full screen, softened, for panels to read on. */
  drawDusk(ctx: Ctx, t: number) {
    this.withView({ x: 0, y: 0, w: W, h: H }, null, () => {
      this.drawBack(ctx, t);
      this.drawFront(ctx, t);
    });
    ctx.fillStyle = 'rgba(246, 242, 234, 0.5)';
    ctx.fillRect(0, 0, W, H);
  }

  /** A band of the pitch in the old lobby strip (STAGE). */
  drawStage(ctx: Ctx, t: number) {
    this.withView(STAGE, AH - 120, () => this.drawBack(ctx, t));
  }

  /** The quiet full-screen background behind the old lobby's panels. */
  drawLobbyBack(ctx: Ctx, t: number) {
    this.drawDusk(ctx, t);
  }

  private withView(r: ViewRect, focus: number | null, draw: () => void) {
    const old = { ...viewRect() };
    const oldFocus = focusDepth();
    setView(r);
    if (focus !== null) setFocus(focus);
    draw();
    setView(old);
    setFocus(oldFocus);
  }

  // ---------------------------------------------------------------- caching

  private ensure(): Cache {
    const K = viewScale();
    const R = this.ratio * K;
    const key = `${this.ratio}|${K}`;
    if (this.cache && this.cache.key === key) return this.cache;
    const rng = makeRng(20261115);
    const { back, front, bench } = makeFans(rng);
    const world = layer(AW + SIDE * 2, AH + EXT * 2, R, (c) => {
      c.translate(SIDE, EXT);
      paintStands(c);
      paintFloodlight(c, -24, -46);
      paintFloodlight(c, AW + 24, -46);
      paintFloodlight(c, -24, AH + 46);
      paintFloodlight(c, AW + 24, AH + 46);
      paintBoard(c);
      for (const f of back) paintFan(c, f, f.x, f.y, 'all');
      // the back column sits a step up and in shade
      c.fillStyle = 'rgba(64, 66, 74, 0.13)';
      c.fillRect(-SIDE, -EXT, SIDE - COL_A - 8, AH + EXT * 2);
      c.fillRect(AW + COL_A + 8, -EXT, SIDE - COL_A - 8, AH + EXT * 2);
      for (const f of front) paintFan(c, f, f.x, f.y, isLively(f) ? 'body' : 'all');
      paintWall(c);
      paintPitch(c, rng);
      paintDugout(c, bench);
    }, true);
    const lipFront = layer(AW + SIDE * 2, LIP_H, R, (c) => {
      c.translate(SIDE, -LIP_Y);
      c.beginPath();
      c.rect(-SIDE, LIP_Y, AW + SIDE * 2, LIP_H);
      c.clip();
      c.beginPath();
      rrAdd(c, -WALL - 2, -WALL - 2, AW + WALL * 2 + 4, AH + WALL * 2 + 9, RAD + WALL + 2);
      rrAdd(c, 0, 0, AW, AH, RAD);
      c.clip('evenodd');
      paintWall(c);
    });
    const lively = front.filter(isLively);
    const atlas = buildAtlas([...lively, ...bench], R);
    const ref = ([0, 1, 2] as const).map((p) =>
      layer(REF_BOX.x1 - REF_BOX.x0, REF_BOX.y1 - REF_BOX.y0, R, (c) => {
        c.translate(-REF_BOX.x0, -REF_BOX.y0);
        paintRef(c, p);
      }),
    );
    this.cache = { key, R, world, front: lipFront, lively, bench, ref, atlas };
    return this.cache;
  }

  // ---------------------------------------------------------------- per frame

  /** How much this fan is cheering now (0..1): the cheer ripples along the stand. */
  private level(f: Fan): number {
    const c = Math.max(this.all, this.team[f.team], this.team[1 - f.team] * 0.25);
    if (c < 0.01) return 0;
    const delay = (f.i * 0.137) % 0.45;
    return Math.min(1, Math.max(0, (c * 1.5 - delay) * 2.4));
  }

  private drawFan(ctx: Ctx, f: Fan, t: number, A: Atlas) {
    const k = this.level(f);
    const hp = (t * 0.33 + f.ph * 0.41) % 3.6;
    const hop = hp < 0.36 ? Math.sin((hp / 0.36) * Math.PI) * 1.8 : 0;
    const jump = f.sub ? 3 : 5.5;
    const bob = hop * (1 - k) + Math.abs(Math.sin(t * 8.4 + f.ph * 3)) * jump * k;
    const pose = k > 0.25 ? 1 : 0;
    const frame = f.frames > 1 ? Math.floor(t * (5 + 6 * k) + f.ph * 2) % f.frames : 0;
    const n = f.cell + pose * f.frames + frame;
    ctx.drawImage(A.canvas, (n % A.cols) * A.cw, Math.floor(n / A.cols) * A.ch, A.cw, A.ch, f.x + CELL.x0, f.y - bob + CELL.y0, CELL.x1 - CELL.x0, CELL.y1 - CELL.y0);
  }

  /** The referee and the scoreboard's lights. */
  private drawTop(ctx: Ctx, C: Cache, t: number) {
    const k = Math.max(this.all, this.team[0], this.team[1]);
    // idle: a slow sway and a whistle now and then; cheering: hops with the card up
    const pose = k > 0.3 ? 2 : t % 5.5 > 4.9 ? 1 : 0;
    const hop = k > 0.3 ? Math.abs(Math.sin(t * 7)) * 4 * k : Math.max(0, Math.sin(t * 2.2)) * 0.8;
    const sway = k > 0.3 ? 0 : Math.sin(t * 1.1) * 1.2;
    ctx.drawImage(C.ref[pose], REF.x + sway + REF_BOX.x0, REF.y - hop + REF_BOX.y0, REF_BOX.x1 - REF_BOX.x0, REF_BOX.y1 - REF_BOX.y0);
    ctx.imageSmoothingEnabled = true;
    if (k > 0.05) {
      ctx.fillStyle = LAMP_ON;
      const step = Math.floor(t * 10);
      for (let i = 0; i < 9; i++) {
        if ((i + step) % 3 !== 0) continue;
        circle(ctx, BOARD.x - 48 + i * 12, BOARD.y - BOARD.h / 2 + 3, 1.6);
        ctx.fill();
      }
    }
  }
}
