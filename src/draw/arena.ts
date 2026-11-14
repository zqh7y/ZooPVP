import { W, H, COLOR, FIELD, STAGE } from '../theme';
import { rr, circle, ellipse, poly, fillStroke, seeded, hash } from '../util';
import type { Ctx } from '../util';

/*
 * The sakura garden: the battle arena seen from above at a slight angle, the side-on lobby strip, the
 * lobby's quiet background and the evening version. Every static picture is cached once in build().
 */

// art colours of this module
const GROUND = '#e3edc4'; // the battlefield floor: pale and calm
const GROUND_SPOT = '#d5e4b0';
const GROUND_LIGHT = '#eef5d8';
const LAWN = '#9fd27a'; // the garden round the arena
const LAWN_DARK = '#82bd62';
const LAWN_LIGHT = '#b9e296';
const GRAVEL = '#efe3c8';
const GRAVEL_LINE = '#dccba6';
const POND = '#7cc7e0';
const POND_DARK = '#4f9fc0';
const POND_LIGHT = '#bfe8f4';
const KOI = '#ff8a4c';
const BARK = '#7a5030';
const BLOSSOM_SHADE = '#f27fb0';
const ROOF = '#5b5a72';
const LEAF = '#5bb36a';
const LEAF_DARK = '#3f8f52';
const LEAF_LIGHT = '#8fd88a';
const LANTERN_GLOW = '#ffd27a';
const DUSK = 'rgba(52, 30, 96, 0.46)';
const NIGHT_INK = '#2b2448';
const LOBBY_BASE = '#2e2340';
const LOBBY_EDGE = '#221a30';

/** Where the pets stand in the lobby strip. */
export const STAGE_GROUND_Y = STAGE.y + STAGE.h - 46;

/** The stone-and-wood frame round the field. */
const FRAME = { x: FIELD.x - 14, y: FIELD.y - 24, w: FIELD.w + 28, h: FIELD.h + 40, r: 34 };
const FIELD_R = 24;
/** The front layer only covers the near end of the arena. */
const FRONT_Y = FIELD.y + FIELD.h - 90;

type Pose = 0 | 1 | 2; // 0 front, 1 cheering, 2 back
interface Fan {
  x: number;
  y: number;
  kind: number;
  tone: number;
  pose: Pose;
  size: number;
  phase: number;
}

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

// ------------------------------------------------------------------ garden pieces

/** Several circles with one shared outline (the sticker look). */
function blob(c: Ctx, pts: number[][], fill: string, lw: number) {
  c.beginPath();
  for (const [x, y, r] of pts) {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  }
  c.lineWidth = lw * 2;
  c.strokeStyle = COLOR.ink;
  c.stroke();
  c.fillStyle = fill;
  c.fill();
}

function blobPath(c: Ctx, pts: number[][]) {
  c.beginPath();
  for (const [x, y, r] of pts) {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  }
}

/** A round canopy (blossom or leaves) with one shade and one highlight. */
function canopy(c: Ctx, cx: number, cy: number, r: number, rnd: () => number, col: string[], lw = 2.5) {
  const pts: number[][] = [[cx, cy, r * 0.62]];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    pts.push([cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.42, r * (0.4 + rnd() * 0.12)]);
  }
  blob(c, pts, col[0], lw);
  c.save();
  blobPath(c, pts);
  c.clip();
  c.fillStyle = col[1];
  ellipse(c, cx + r * 0.25, cy + r * 0.55, r * 0.95, r * 0.45);
  c.fill();
  c.fillStyle = col[2];
  ellipse(c, cx - r * 0.25, cy - r * 0.38, r * 0.45, r * 0.24, -0.3);
  c.fill();
  c.restore();
}

function blossomTree(c: Ctx, x: number, y: number, r: number, rnd: () => number) {
  c.fillStyle = 'rgba(40, 60, 30, 0.18)';
  ellipse(c, x + r * 0.15, y + r * 0.05, r * 0.95, r * 0.32);
  c.fill();
  // trunk
  poly(c, [x - r * 0.12, y, x + r * 0.12, y, x + r * 0.07, y - r * 0.7, x + r * 0.35, y - r * 1.0, x - r * 0.05, y - r * 0.85, x - r * 0.07, y - r * 0.6]);
  fillStroke(c, BARK, 2.5);
  canopy(c, x, y - r * 1.05, r, rnd, [COLOR.sakura, BLOSSOM_SHADE, COLOR.sakuraLight]);
  // a few loose blossoms
  c.fillStyle = COLOR.white;
  for (let i = 0; i < 6; i++) {
    circle(c, x + (rnd() - 0.5) * r * 1.3, y - r * 1.05 + (rnd() - 0.5) * r * 0.8, 1.4 + rnd());
    c.fill();
  }
}

function bush(c: Ctx, x: number, y: number, r: number, rnd: () => number, flowers = true) {
  c.fillStyle = 'rgba(40, 60, 30, 0.16)';
  ellipse(c, x + 2, y + r * 0.45, r * 1.1, r * 0.35);
  c.fill();
  canopy(c, x, y, r, rnd, [LEAF, LEAF_DARK, LEAF_LIGHT], 2.2);
  if (!flowers) return;
  for (let i = 0; i < 5; i++) {
    c.fillStyle = i % 2 ? COLOR.sakuraLight : COLOR.sakura;
    circle(c, x + (rnd() - 0.5) * r * 1.2, y + (rnd() - 0.6) * r * 0.8, 1.6);
    c.fill();
  }
}

function rock(c: Ctx, x: number, y: number, rx: number, ry: number) {
  c.fillStyle = 'rgba(40, 40, 60, 0.18)';
  ellipse(c, x + 2, y + ry * 0.6, rx, ry * 0.6);
  c.fill();
  ellipse(c, x, y, rx, ry);
  fillStroke(c, COLOR.stone, 2.2);
  c.save();
  ellipse(c, x, y, rx, ry);
  c.clip();
  c.fillStyle = COLOR.stoneDark;
  ellipse(c, x + rx * 0.3, y + ry * 0.8, rx, ry * 0.6);
  c.fill();
  c.fillStyle = '#ddd8e4';
  ellipse(c, x - rx * 0.3, y - ry * 0.4, rx * 0.4, ry * 0.25);
  c.fill();
  c.restore();
}

/** A stone garden lantern standing on y; returns the centre of its light window. */
function lantern(c: Ctx, x: number, y: number, s: number): [number, number] {
  const u = s / 40;
  c.fillStyle = 'rgba(40, 40, 60, 0.2)';
  ellipse(c, x + 3 * u, y, 13 * u, 4 * u);
  c.fill();
  rr(c, x - 8 * u, y - 5 * u, 16 * u, 6 * u, 2 * u);
  fillStroke(c, COLOR.stone, 2);
  rr(c, x - 3.5 * u, y - 16 * u, 7 * u, 12 * u, 1.5 * u);
  fillStroke(c, COLOR.stone, 2);
  rr(c, x - 9 * u, y - 20 * u, 18 * u, 5 * u, 2 * u);
  fillStroke(c, COLOR.stone, 2);
  rr(c, x - 6.5 * u, y - 30 * u, 13 * u, 11 * u, 2 * u);
  fillStroke(c, COLOR.stone, 2);
  rr(c, x - 3.5 * u, y - 28 * u, 7 * u, 7 * u, 1.5 * u);
  fillStroke(c, NIGHT_INK, 1.5);
  // roof with turned-up corners
  c.beginPath();
  c.moveTo(x - 14 * u, y - 29 * u);
  c.quadraticCurveTo(x - 9 * u, y - 31 * u, x - 6 * u, y - 37 * u);
  c.lineTo(x + 6 * u, y - 37 * u);
  c.quadraticCurveTo(x + 9 * u, y - 31 * u, x + 14 * u, y - 29 * u);
  c.closePath();
  fillStroke(c, ROOF, 2);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(x - 5 * u, y - 36 * u, 6 * u, 2 * u);
  circle(c, x, y - 39.5 * u, 3 * u);
  fillStroke(c, COLOR.stone, 2);
  return [x, y - 24.5 * u];
}

/** A vermilion gate standing on baseY. */
function torii(c: Ctx, cx: number, baseY: number, w: number, h: number, lw = 2.5) {
  const pw = w * 0.085;
  const px = w * 0.33;
  c.fillStyle = 'rgba(40, 40, 60, 0.18)';
  ellipse(c, cx - px + 4, baseY, pw * 1.3, pw * 0.4);
  c.fill();
  ellipse(c, cx + px + 4, baseY, pw * 1.3, pw * 0.4);
  c.fill();
  for (const sx of [-1, 1]) {
    const x = cx + sx * px;
    poly(c, [x - pw * 0.5, baseY - h * 0.88, x + pw * 0.5, baseY - h * 0.88, x + pw * 0.6, baseY, x - pw * 0.6, baseY]);
    fillStroke(c, COLOR.vermilion, lw);
    c.fillStyle = COLOR.vermilionDark;
    c.fillRect(x + pw * 0.12, baseY - h * 0.86, pw * 0.38, h * 0.84);
    rr(c, x - pw * 0.7, baseY - h * 0.1, pw * 1.4, h * 0.1, 2);
    fillStroke(c, NIGHT_INK, lw);
  }
  // tie beam
  rr(c, cx - w * 0.44, baseY - h * 0.7, w * 0.88, h * 0.08, 2);
  fillStroke(c, COLOR.vermilion, lw);
  // name plaque
  rr(c, cx - w * 0.05, baseY - h * 0.86, w * 0.1, h * 0.16, 2);
  fillStroke(c, NIGHT_INK, lw * 0.8);
  // top beam: a soft upward smile, black cap on top
  const top = baseY - h;
  c.beginPath();
  c.moveTo(cx - w * 0.52, top - h * 0.06);
  c.quadraticCurveTo(cx, top + h * 0.06, cx + w * 0.52, top - h * 0.06);
  c.lineTo(cx + w * 0.47, top + h * 0.1);
  c.quadraticCurveTo(cx, top + h * 0.18, cx - w * 0.47, top + h * 0.1);
  c.closePath();
  fillStroke(c, COLOR.vermilion, lw);
  c.beginPath();
  c.moveTo(cx - w * 0.54, top - h * 0.12);
  c.quadraticCurveTo(cx, top + h * 0.0, cx + w * 0.54, top - h * 0.12);
  c.lineTo(cx + w * 0.52, top - h * 0.03);
  c.quadraticCurveTo(cx, top + h * 0.08, cx - w * 0.52, top - h * 0.03);
  c.closePath();
  fillStroke(c, NIGHT_INK, lw);
}

/** Five round petals: the blossom crest. */
function crest(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const px = x + Math.cos(a) * r * 0.55;
    const py = y + Math.sin(a) * r * 0.55;
    c.moveTo(px + r * 0.42, py);
    c.arc(px, py, r * 0.42, 0, Math.PI * 2);
  }
}

// ------------------------------------------------------------------ spectators

const KINDS = 7;
const TONES: string[][] = [
  ['#ffb36b', '#f7e7d2'], // cat
  ['#ffffff', '#e8dfee'], // bunny
  ['#b78a62', '#8a6648'], // tanuki
  ['#ffe066', '#ffd03a'], // chick
  ['#8fdc7a', '#6cc05c'], // frog
  ['#c8c2d4', '#a49cb6'], // mouse
  ['#f0a35a', '#d98a40'], // shiba
];

function fanSprite(c: Ctx, kind: number, tone: number, pose: Pose, cx: number, cy: number, r: number) {
  const body = TONES[kind][tone];
  const lw = 1.6;
  const ear: number[][] = [];
  const parts: (() => void)[] = [];
  // ears as extra shapes sharing the outline
  const tri = (sx: number, w: number, h: number) => () => {
    c.moveTo(cx + sx * r * 0.85, cy - r * 0.35);
    c.lineTo(cx + sx * r * (0.85 - w), cy - r * (0.35 + h));
    c.lineTo(cx + sx * r * (0.85 - w * 2), cy - r * 0.6);
  };
  if (kind === 0 || kind === 6) parts.push(tri(-1, 0.18, 0.75), tri(1, 0.18, 0.75));
  if (kind === 1) {
    parts.push(() => {
      c.moveTo(cx - r * 0.2, cy - r * 0.6);
      c.ellipse(cx - r * 0.35, cy - r * 1.15, r * 0.2, r * 0.55, -0.15, 0, Math.PI * 2);
      c.moveTo(cx + r * 0.5, cy - r * 1.15);
      c.ellipse(cx + r * 0.35, cy - r * 1.15, r * 0.2, r * 0.55, 0.15, 0, Math.PI * 2);
    });
  }
  if (kind === 2) ear.push([cx - r * 0.68, cy - r * 0.68, r * 0.28], [cx + r * 0.68, cy - r * 0.68, r * 0.28]);
  if (kind === 4) ear.push([cx - r * 0.45, cy - r * 0.78, r * 0.32], [cx + r * 0.45, cy - r * 0.78, r * 0.32]);
  if (kind === 5) ear.push([cx - r * 0.72, cy - r * 0.62, r * 0.42], [cx + r * 0.72, cy - r * 0.62, r * 0.42]);
  // paws up when cheering
  if (pose === 1) ear.push([cx - r * 0.95, cy - r * 0.15, r * 0.24], [cx + r * 0.95, cy - r * 0.15, r * 0.24]);
  const all = () => {
    c.beginPath();
    for (const p of parts) p();
    for (const [x, y, rr2] of ear) {
      c.moveTo(x + rr2, y);
      c.arc(x, y, rr2, 0, Math.PI * 2);
    }
    c.moveTo(cx + r, cy);
    c.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
  };
  all();
  c.lineWidth = lw * 2;
  c.strokeStyle = COLOR.ink;
  c.stroke();
  c.fillStyle = body;
  c.fill();
  // one shade, one highlight
  c.save();
  ellipse(c, cx, cy, r, r * 0.92);
  c.clip();
  c.fillStyle = 'rgba(60, 30, 70, 0.16)';
  ellipse(c, cx + r * 0.2, cy + r * 0.85, r * 1.1, r * 0.5);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.45)';
  ellipse(c, cx - r * 0.35, cy - r * 0.45, r * 0.32, r * 0.18, -0.4);
  c.fill();
  c.restore();
  if (pose === 2) {
    // seen from behind: just a little tail
    circle(c, cx, cy + r * 0.75, r * 0.2);
    fillStroke(c, kind === 3 ? COLOR.goldDark : TONES[kind][1 - tone], 1.2);
    return;
  }
  // face
  if (kind === 2) {
    c.fillStyle = '#5a3f2e';
    ellipse(c, cx, cy - r * 0.02, r * 0.62, r * 0.24);
    c.fill();
  }
  if (kind === 6 || kind === 0) {
    c.fillStyle = '#fff3e0';
    ellipse(c, cx, cy + r * 0.32, r * 0.5, r * 0.32);
    c.fill();
  }
  const ey = cy - r * 0.05;
  const ex = r * 0.36;
  c.fillStyle = COLOR.ink;
  c.strokeStyle = COLOR.ink;
  c.lineWidth = 1.2;
  if (pose === 1) {
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.arc(cx + sx * ex, ey + r * 0.06, r * 0.13, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
    ellipse(c, cx, cy + r * 0.38, r * 0.17, r * 0.15);
    c.fillStyle = '#c23a4a';
    c.fill();
  } else {
    circle(c, cx - ex, ey, r * 0.11);
    c.fill();
    circle(c, cx + ex, ey, r * 0.11);
    c.fill();
    c.beginPath();
    c.moveTo(cx - r * 0.12, cy + r * 0.3);
    c.quadraticCurveTo(cx, cy + r * 0.42, cx + r * 0.12, cy + r * 0.3);
    c.stroke();
  }
  if (kind === 3) {
    poly(c, [cx - r * 0.14, cy + r * 0.14, cx + r * 0.14, cy + r * 0.14, cx, cy + r * 0.34]);
    fillStroke(c, '#ff9a3c', 1);
  }
  c.fillStyle = 'rgba(255, 110, 150, 0.55)';
  ellipse(c, cx - r * 0.6, cy + r * 0.22, r * 0.16, r * 0.1);
  c.fill();
  ellipse(c, cx + r * 0.6, cy + r * 0.22, r * 0.16, r * 0.1);
  c.fill();
}

// ------------------------------------------------------------------ the arena

const SPR = 34; // a spectator sprite cell, logical px

export class Arena {
  private ratio = 1;
  private back?: HTMLCanvasElement;
  private front?: HTMLCanvasElement;
  private duskTop?: HTMLCanvasElement;
  private stage?: HTMLCanvasElement;
  private lobby?: HTMLCanvasElement;
  private petal?: HTMLCanvasElement;
  private glow?: HTMLCanvasElement;
  private sprites: HTMLCanvasElement[] = [];
  private fans: Fan[] = [];
  private lights: [number, number][] = [];
  private cheerAmt = 0;
  private cheerT = 0;

  /** Cache every static layer at the device pixel ratio. Call again when the ratio changes. */
  build(ratio: number) {
    this.ratio = ratio;
    this.lights = [];
    this.fans = this.placeFans();
    this.sprites = [];
    for (let k = 0; k < KINDS; k++)
      for (let tn = 0; tn < 2; tn++)
        for (let p = 0; p < 3; p++)
          this.sprites.push(layer(SPR, SPR, ratio, (c) => fanSprite(c, k, tn, p as Pose, SPR / 2, SPR / 2 + 4, 10)));
    this.back = layer(W, H, ratio, (c) => this.paintBack(c));
    this.front = layer(W, H - FRONT_Y, ratio, (c) => {
      c.translate(0, -FRONT_Y);
      this.paintFront(c);
    });
    this.duskTop = layer(W, H, ratio, (c) => this.paintDusk(c));
    this.stage = layer(STAGE.w, STAGE.h, ratio, (c) => this.paintStage(c));
    this.lobby = layer(W, H, ratio, (c) => this.paintLobby(c));
    this.petal = layer(12, 12, ratio, (c) => {
      ellipse(c, 6, 6, 4.2, 2.8, 0.5);
      fillStroke(c, COLOR.sakuraLight, 1, COLOR.sakuraDark);
    });
    this.glow = layer(80, 80, ratio, (c) => {
      const g = c.createRadialGradient(40, 40, 2, 40, 40, 40);
      g.addColorStop(0, 'rgba(255, 214, 130, 0.75)');
      g.addColorStop(0.35, 'rgba(255, 190, 100, 0.3)');
      g.addColorStop(1, 'rgba(255, 170, 80, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 80, 80);
    });
  }

  /** Let the crowd settle after a cheer. */
  update(dt: number) {
    this.cheerT += dt;
    this.cheerAmt = Math.max(0, this.cheerAmt - dt * 0.9);
  }

  /** Make the crowd jump for a moment (amount 0..1). */
  cheer(amount: number) {
    this.cheerAmt = Math.min(1, Math.max(this.cheerAmt, amount));
  }

  /** The whole battle backdrop behind the fighters, with the crowd. */
  drawBattle(ctx: Ctx, t: number) {
    if (!this.back) this.build(this.ratio);
    ctx.drawImage(this.back!, 0, 0, W, H);
    this.drawFans(ctx, t);
  }

  /** In front of the fighters: the near frame edge, corner branches, drifting petals. */
  drawBattleFront(ctx: Ctx, t: number) {
    ctx.drawImage(this.front!, 0, FRONT_Y, W, H - FRONT_Y);
    this.drawPetals(ctx, t, 0, 0, W, H, 12);
  }

  /** The battle backdrop at evening, lanterns lit (matchmaking and result screens). */
  drawDusk(ctx: Ctx, t: number) {
    this.drawBattle(ctx, t);
    ctx.drawImage(this.front!, 0, FRONT_Y, W, H - FRONT_Y);
    ctx.drawImage(this.duskTop!, 0, 0, W, H);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.lights.length; i++) {
      const [x, y] = this.lights[i];
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5 + i * 1.7) * Math.sin(t * 3.1 + i);
      ctx.drawImage(this.glow!, x - 40, y - 40, 80, 80);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
    this.drawPetals(ctx, t, 0, 0, W, H, 8);
  }

  /** The lobby strip on STAGE: a side-on slice of the garden. Pets stand on STAGE_GROUND_Y. */
  drawStage(ctx: Ctx, t: number) {
    if (!this.stage) this.build(this.ratio);
    ctx.drawImage(this.stage!, STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.clip();
    this.drawPetals(ctx, t, STAGE.x, STAGE.y, STAGE.w, STAGE.h, 7);
    ctx.restore();
  }

  /** The quiet full-screen background behind the lobby's panels. */
  drawLobbyBack(ctx: Ctx, _t: number) {
    if (!this.lobby) this.build(this.ratio);
    ctx.drawImage(this.lobby!, 0, 0, W, H);
  }

  // ---------------------------------------------------------------- per frame

  private drawFans(ctx: Ctx, t: number) {
    const ch = this.cheerAmt;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      const on = ch > 0.05 && hash(i * 3.1) < ch + 0.15;
      const jump = on ? Math.abs(Math.sin(t * 9 + f.phase)) * 7 * Math.min(1, ch * 1.5) : 0;
      const bob = Math.sin(t * 2.2 + f.phase) * 0.8;
      const pose = on && f.pose === 0 ? 1 : f.pose;
      const spr = this.sprites[(f.kind * 2 + f.tone) * 3 + pose];
      const s = (SPR * f.size) / 20;
      ctx.drawImage(spr, f.x - s / 2, f.y - s / 2 - 4 * (f.size / 20) + bob - jump, s, s);
    }
  }

  private drawPetals(ctx: Ctx, t: number, x0: number, y0: number, w: number, h: number, n: number) {
    for (let i = 0; i < n; i++) {
      const sp = 14 + hash(i + 7) * 16;
      const x = x0 + ((((hash(i) * w + t * sp + Math.sin(t * 0.9 + i) * 18) % w) + w) % w);
      const y = y0 + ((((hash(i + 31) * h + t * (sp * 1.4)) % h) + h) % h);
      const sz = 7 + hash(i + 3) * 5;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.petal!, x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- layout

  private placeFans(): Fan[] {
    const rnd = seeded(77);
    const out: Fan[] = [];
    const add = (x: number, y: number, pose: Pose, size: number) =>
      out.push({ x, y, kind: Math.floor(rnd() * KINDS), tone: rnd() < 0.5 ? 0 : 1, pose, size, phase: rnd() * 6.28 });
    // sides, leaning on the fence
    for (let y = FIELD.y + 6; y < FIELD.y + FIELD.h - 4; y += 25) {
      add(13 + (rnd() - 0.5) * 2, y + rnd() * 4, 0, 16 + rnd() * 4);
      add(W - 13 + (rnd() - 0.5) * 2, y + 12 + rnd() * 4, 0, 16 + rnd() * 4);
    }
    // far side: a short row each side of the gate path
    for (let x = 64; x < 220; x += 26) add(x + rnd() * 4, FRAME.y - 4, 0, 16 + rnd() * 3);
    for (let x = 330; x < 482; x += 26) add(x + rnd() * 4, FRAME.y - 4, 0, 16 + rnd() * 3);
    // near side: two rows seen from behind
    const by = FRAME.y + FRAME.h;
    for (let x = 34; x < W - 20; x += 25) add(x + rnd() * 5, by + 14 + rnd() * 3, 2, 19 + rnd() * 3);
    for (let x = 46; x < W - 30; x += 26) add(x + rnd() * 5, by + 38 + rnd() * 3, 2, 20 + rnd() * 2);
    // far rows sit behind near rows
    out.sort((a, b) => a.y - b.y);
    return out;
  }

  // ---------------------------------------------------------------- cached pictures

  private paintBack(c: Ctx) {
    const rnd = seeded(2024);
    // lawn with soft mottling
    c.fillStyle = LAWN;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      c.fillStyle = rnd() < 0.5 ? LAWN_LIGHT : LAWN_DARK;
      c.globalAlpha = 0.35;
      ellipse(c, rnd() * W, rnd() * H, 10 + rnd() * 22, 5 + rnd() * 8);
      c.fill();
    }
    c.globalAlpha = 1;
    // grass tufts
    c.strokeStyle = LAWN_DARK;
    c.lineWidth = 1.6;
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      c.beginPath();
      c.moveTo(x - 3, y - 3);
      c.lineTo(x, y + 1);
      c.lineTo(x + 3, y - 4);
      c.stroke();
    }

    // gravel path from the gate down to the far wall, raked lines
    c.save();
    rr(c, W / 2 - 46, -20, 92, FRAME.y + 30, 18);
    c.fillStyle = GRAVEL;
    c.fill();
    c.clip();
    c.strokeStyle = GRAVEL_LINE;
    c.lineWidth = 1.5;
    for (let x = W / 2 - 40; x < W / 2 + 46; x += 9) {
      c.beginPath();
      c.moveTo(x, -10);
      c.lineTo(x, FRAME.y + 20);
      c.stroke();
    }
    c.restore();
    rr(c, W / 2 - 46, -20, 92, FRAME.y + 30, 18);
    c.lineWidth = 2.5;
    c.strokeStyle = COLOR.ink;
    c.stroke();
    // stepping stones on the path
    for (let i = 0; i < 5; i++) rock(c, W / 2 + (i % 2 ? 8 : -8), 20 + i * 30, 14, 8);

    // far garden: kept low and quiet under the HUD
    blossomTree(c, 28, 100, 62, rnd);
    blossomTree(c, W - 22, 112, 66, rnd);
    bush(c, 150, 110, 18, rnd);
    bush(c, 392, 104, 20, rnd);
    bush(c, 112, 148, 14, rnd, false);
    bush(c, 430, 148, 15, rnd, false);
    rock(c, 186, 56, 12, 7);
    rock(c, 352, 40, 10, 6);
    this.lights.push(lantern(c, W / 2 - 74, 160, 44));
    this.lights.push(lantern(c, W / 2 + 74, 160, 44));
    torii(c, W / 2, 132, 150, 82);

    // near garden: a pond with koi, lanterns, trees
    const by = FRAME.y + FRAME.h;
    c.fillStyle = 'rgba(40, 60, 30, 0.12)';
    c.fillRect(0, by, W, 74);
    // a wooden deck the near crowd sits on
    rr(c, 14, by + 4, W - 28, 64, 12);
    fillStroke(c, COLOR.wood, 2.5);
    c.strokeStyle = COLOR.woodDark;
    c.lineWidth = 1.5;
    for (let y = by + 18; y < by + 66; y += 14) {
      c.beginPath();
      c.moveTo(20, y);
      c.lineTo(W - 20, y);
      c.stroke();
    }
    rr(c, 14, by + 4, W - 28, 64, 12);
    c.lineWidth = 2.5;
    c.strokeStyle = COLOR.ink;
    c.stroke();

    ellipse(c, 120, H - 26, 100, 34);
    fillStroke(c, POND, 3);
    c.save();
    ellipse(c, 120, H - 26, 100, 34);
    c.clip();
    c.fillStyle = POND_DARK;
    ellipse(c, 130, H + 4, 110, 28);
    c.fill();
    c.strokeStyle = POND_LIGHT;
    c.lineWidth = 2;
    for (const [x, y] of [[80, H - 40], [150, H - 24]]) {
      c.beginPath();
      c.ellipse(x, y, 16, 5, 0, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
    c.restore();
    // koi
    for (const [x, y, a] of [[96, H - 22, 0.3], [150, H - 38, -2.6]]) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      ellipse(c, 0, 0, 9, 4.5);
      fillStroke(c, KOI, 1.8);
      poly(c, [-8, 0, -14, -4, -14, 4]);
      fillStroke(c, KOI, 1.6);
      c.fillStyle = COLOR.white;
      circle(c, 2, -1, 2.2);
      c.fill();
      c.restore();
    }
    // lily pad
    c.beginPath();
    c.moveTo(60, H - 24);
    c.arc(60, H - 24, 10, 0.4, Math.PI * 2 - 0.1);
    c.closePath();
    fillStroke(c, LEAF, 2);
    rock(c, 210, H - 44, 16, 10);
    rock(c, 30, H - 54, 12, 8);
    this.lights.push(lantern(c, 250, H - 10, 50));
    bush(c, 330, H - 20, 22, rnd);
    bush(c, 400, H - 6, 18, rnd, false);
    blossomTree(c, W - 40, H + 14, 70, rnd);

    // more lanterns along the near deck, for the evening
    this.lights.push(lantern(c, 384, H - 60, 40));
    // the frame: stone cap, wooden inner wall, then the field
    rr(c, FRAME.x + 3, FRAME.y + 6, FRAME.w, FRAME.h, FRAME.r);
    c.fillStyle = 'rgba(40, 40, 60, 0.25)';
    c.fill();
    this.paintFrameRing(c, 0);
    // wall face: seen on the far side, a little on the sides
    c.save();
    rr(c, FIELD.x - 7, FIELD.y - 14, FIELD.w + 14, FIELD.h + 14, FIELD_R + 6);
    c.fillStyle = COLOR.wood;
    c.fill();
    c.clip();
    c.strokeStyle = COLOR.woodDark;
    c.lineWidth = 1.5;
    for (let x = FIELD.x; x < FIELD.x + FIELD.w; x += 18) {
      c.beginPath();
      c.moveTo(x, FIELD.y - 14);
      c.lineTo(x, FIELD.y);
      c.stroke();
    }
    c.restore();
    rr(c, FIELD.x - 7, FIELD.y - 14, FIELD.w + 14, FIELD.h + 14, FIELD_R + 6);
    c.lineWidth = 2.5;
    c.strokeStyle = COLOR.ink;
    c.stroke();

    // the floor
    c.save();
    rr(c, FIELD.x, FIELD.y, FIELD.w, FIELD.h, FIELD_R);
    c.fillStyle = GROUND;
    c.fill();
    c.clip();
    for (let i = 0; i < 60; i++) {
      c.fillStyle = rnd() < 0.6 ? GROUND_SPOT : GROUND_LIGHT;
      c.globalAlpha = 0.5;
      ellipse(c, FIELD.x + rnd() * FIELD.w, FIELD.y + rnd() * FIELD.h, 14 + rnd() * 30, 6 + rnd() * 10);
      c.fill();
    }
    c.globalAlpha = 1;
    // tiny grass ticks, very faint
    c.strokeStyle = 'rgba(120, 160, 90, 0.22)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
      const x = FIELD.x + rnd() * FIELD.w;
      const y = FIELD.y + rnd() * FIELD.h;
      c.beginPath();
      c.moveTo(x - 2, y - 2);
      c.lineTo(x, y + 1);
      c.lineTo(x + 2, y - 3);
      c.stroke();
    }
    // centre line and crest
    const cy = FIELD.y + FIELD.h / 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    c.lineWidth = 3;
    c.setLineDash([12, 10]);
    c.beginPath();
    c.moveTo(FIELD.x + 18, cy);
    c.lineTo(FIELD.x + FIELD.w - 18, cy);
    c.stroke();
    c.setLineDash([]);
    crest(c, W / 2, cy, 46);
    c.fillStyle = 'rgba(255, 170, 200, 0.16)';
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    c.lineWidth = 3;
    c.stroke();
    circle(c, W / 2, cy, 8);
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    c.fill();
    // soft shade under the far wall (cached, so a gradient is fine)
    const g = c.createLinearGradient(0, FIELD.y, 0, FIELD.y + 26);
    g.addColorStop(0, 'rgba(70, 60, 50, 0.22)');
    g.addColorStop(1, 'rgba(70, 60, 50, 0)');
    c.fillStyle = g;
    c.fillRect(FIELD.x, FIELD.y, FIELD.w, 26);
    c.restore();
    rr(c, FIELD.x, FIELD.y, FIELD.w, FIELD.h, FIELD_R);
    c.lineWidth = 2;
    c.strokeStyle = COLOR.ink;
    c.stroke();
  }

  /** The stone cap round the field; lip > 0 pulls the near edge over the floor. */
  private paintFrameRing(c: Ctx, lip: number) {
    c.beginPath();
    c.roundRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h, FRAME.r);
    c.roundRect(FIELD.x - 7, FIELD.y - 14, FIELD.w + 14, FIELD.h + 14 - lip, FIELD_R + 6);
    c.fillStyle = COLOR.stone;
    c.fill('evenodd');
    c.save();
    c.clip('evenodd');
    // highlight along the top of the cap, shade along its outer foot
    c.strokeStyle = '#d8d3e0';
    c.lineWidth = 4;
    rr(c, FRAME.x + 4, FRAME.y + 4, FRAME.w - 8, FRAME.h - 8, FRAME.r - 4);
    c.stroke();
    c.fillStyle = COLOR.stoneDark;
    c.fillRect(FRAME.x, FRAME.y + FRAME.h - 6, FRAME.w, 6);
    // stone joints
    c.strokeStyle = 'rgba(80, 70, 100, 0.45)';
    c.lineWidth = 1.5;
    for (let x = FRAME.x + 56; x < FRAME.x + FRAME.w - 40; x += 62) {
      c.beginPath();
      c.moveTo(x, FRAME.y);
      c.lineTo(x, FRAME.y + 12);
      c.moveTo(x + 20, FRAME.y + FRAME.h - 16);
      c.lineTo(x + 20, FRAME.y + FRAME.h);
      c.stroke();
    }
    for (let y = FRAME.y + 70; y < FRAME.y + FRAME.h - 40; y += 70) {
      c.beginPath();
      c.moveTo(FRAME.x, y);
      c.lineTo(FRAME.x + 9, y);
      c.moveTo(FRAME.x + FRAME.w - 9, y + 30);
      c.lineTo(FRAME.x + FRAME.w, y + 30);
      c.stroke();
    }
    c.restore();
    c.lineWidth = 2.5;
    c.strokeStyle = COLOR.ink;
    c.beginPath();
    c.roundRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h, FRAME.r);
    c.stroke();
    c.beginPath();
    c.roundRect(FIELD.x - 7, FIELD.y - 14, FIELD.w + 14, FIELD.h + 14 - lip, FIELD_R + 6);
    c.stroke();
  }

  private paintFront(c: Ctx) {
    const rnd = seeded(31);
    // the near edge of the frame, drawn again over the floor's bottom
    c.save();
    c.beginPath();
    c.rect(0, FIELD.y + FIELD.h - 40, W, 200);
    c.clip();
    this.paintFrameRing(c, 5);
    c.restore();
    // blossom branches over the corners
    const branch = (x: number, y: number, dx: number, dy: number, s: number) => {
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + dx * 0.5, y + dy * 0.2, x + dx, y + dy);
      c.lineWidth = 7 * s;
      c.strokeStyle = COLOR.ink;
      c.stroke();
      c.lineWidth = 3.5 * s;
      c.strokeStyle = BARK;
      c.stroke();
      const pts: number[][] = [];
      for (let i = 0; i < 5; i++) {
        const k = 0.45 + i * 0.14;
        pts.push([x + dx * k + (rnd() - 0.5) * 14 * s, y + dy * k + (rnd() - 0.5) * 12 * s, (7 + rnd() * 5) * s]);
      }
      blob(c, pts, COLOR.sakura, 2.2);
      c.save();
      blobPath(c, pts);
      c.clip();
      c.fillStyle = BLOSSOM_SHADE;
      for (const [px, py, r] of pts) {
        circle(c, px + r * 0.4, py + r * 0.6, r * 0.7);
        c.fill();
      }
      c.restore();
      for (const [px, py] of pts) {
        crest(c, px - 1, py - 2, 6 * s);
        c.fillStyle = COLOR.sakuraLight;
        c.fill();
        circle(c, px - 1, py - 2, 1.4 * s);
        c.fillStyle = COLOR.gold;
        c.fill();
      }
    };
    branch(-6, FRAME.y + FRAME.h - 64, 84, 34, 1.15);
    branch(W + 6, FRAME.y + FRAME.h - 50, -86, 24, 1.15);
  }

  private paintDusk(c: Ctx) {
    c.fillStyle = DUSK;
    c.fillRect(0, 0, W, H);
    // a darker rim at the top and bottom (cached)
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(20, 14, 50, 0.35)');
    g.addColorStop(0.25, 'rgba(20, 14, 50, 0)');
    g.addColorStop(0.8, 'rgba(20, 14, 50, 0)');
    g.addColorStop(1, 'rgba(20, 14, 50, 0.35)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // lit lantern windows
    for (const [x, y] of this.lights) {
      rr(c, x - 3.5, y - 3.5, 7, 7, 1.5);
      c.fillStyle = LANTERN_GLOW;
      c.fill();
    }
  }

  private paintStage(c: Ctx) {
    const rnd = seeded(505);
    const w = STAGE.w;
    const h = STAGE.h;
    const gy = STAGE_GROUND_Y - STAGE.y;
    const sky = c.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, '#9fd6ff');
    sky.addColorStop(1, '#fde3ee');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // clouds
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [x, y, s] of [[90, 40, 1], [380, 28, 0.8], [250, 62, 0.6]]) {
      blobPath(c, [[x, y, 14 * s], [x + 16 * s, y - 6 * s, 16 * s], [x + 34 * s, y, 13 * s]]);
      c.fill();
    }
    // far mountain with a snow cap
    poly(c, [150, gy - 70, 290, 52, 430, gy - 70]);
    c.fillStyle = '#b9b6e0';
    c.fill();
    poly(c, [262, 72, 290, 52, 318, 72, 304, 78, 290, 70, 276, 78]);
    c.fillStyle = '#f4f2ff';
    c.fill();
    // rolling hills, two layers
    const hills = (base: number, amp: number, col: string, seed: number) => {
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += 10) c.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x * 0.012 + seed) * Math.cos(x * 0.007 + seed * 2)));
      c.lineTo(w, h);
      c.closePath();
      fillStroke(c, col, 2.5);
    };
    hills(gy - 40, 40, '#a9dc94', 1.3);
    // a little distant gate and a hedge
    torii(c, 448, gy - 44, 70, 52, 2.2);
    hills(gy - 24, 22, LAWN, 4.1);
    // the ground the pets stand on
    c.fillStyle = LAWN;
    c.fillRect(0, gy - 22, w, h - gy + 22);
    c.fillStyle = GRAVEL;
    c.fillRect(0, gy - 12, w, 40);
    c.strokeStyle = GRAVEL_LINE;
    c.lineWidth = 1.5;
    for (let y = gy - 4; y < gy + 28; y += 8) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.strokeStyle = COLOR.ink;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, gy - 22);
    c.lineTo(w, gy - 22);
    c.moveTo(0, gy - 12);
    c.lineTo(w, gy - 12);
    c.moveTo(0, gy + 28);
    c.lineTo(w, gy + 28);
    c.stroke();
    c.fillStyle = LAWN_DARK;
    c.fillRect(0, gy + 29.5, w, h - gy);
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = LAWN_LIGHT;
      c.lineWidth = 1.5;
      const x = rnd() * w;
      const y = gy + 34 + rnd() * 10;
      c.beginPath();
      c.moveTo(x - 3, y - 3);
      c.lineTo(x, y + 1);
      c.lineTo(x + 3, y - 4);
      c.stroke();
    }
    blossomTree(c, 48, gy - 16, 60, rnd);
    blossomTree(c, w - 30, gy - 14, 52, rnd);
    bush(c, 128, gy - 24, 16, rnd);
    bush(c, 390, gy - 22, 14, rnd);
    lantern(c, 168, gy - 15, 46);
    lantern(c, 372, gy - 15, 40);
    // a front bush in each corner frames the strip
    bush(c, 6, gy + 18, 20, rnd);
    bush(c, w - 8, gy + 22, 18, rnd);
  }

  private paintLobby(c: Ctx) {
    c.fillStyle = LOBBY_BASE;
    c.fillRect(0, 0, W, H);
    // seigaiha waves, very faint
    const r = 26;
    c.lineWidth = 1.5;
    for (let row = 0; row * (r / 2) < H + r; row++) {
      const y = row * (r / 2);
      const off = row % 2 ? r : 0;
      for (let x = -r + off; x < W + r; x += r * 2) {
        for (let k = 3; k >= 1; k--) {
          c.beginPath();
          c.arc(x, y, (r * k) / 3, Math.PI, Math.PI * 2);
          c.fillStyle = LOBBY_BASE;
          if (k === 3) c.fill();
          c.strokeStyle = 'rgba(255, 220, 240, 0.05)';
          c.stroke();
        }
      }
    }
    // darker edges (cached)
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, LOBBY_EDGE);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}
