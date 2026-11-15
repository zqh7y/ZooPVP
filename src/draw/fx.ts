import '@fontsource/barlow-condensed/latin-800.css';
import { fchance, frand } from '../rng';
import { CLASS_FX, COLOR, FONT, H, RAINBOW, TEAM, TIER, TYPE, UI, W } from '../theme';
import type { Team } from '../types';
import { clamp, easeOutBack, easeOutCubic, label, type Ctx } from '../util';

/*
 * The one effects system every screen shares: pooled particles, rings, flashes, words, flying icons, marks on
 * the grass, camera shake, hit-stop and slow motion. Positions and sizes are in whatever space the caller draws in:
 * the screens use logical screen px; the battle view uses arena px (it draws under the camera's transform, so its
 * effects stay on the pitch however the view moves) and draws drawScreen itself in screen px.
 *
 * One palette: light is white and warm sunny gold; a team colour only where something belongs to a team.
 * One sun from the upper left: a flying shard has a lit upper-left face and a shaded lower one, and anything
 * that flies over the grass leaves a small soft shadow on it, a touch to the lower right.
 *
 * What should stay on the pitch for the whole fight (the marks a knock-out leaves, pieces given `stay` once
 * they come to rest) is painted once into `ground`, a cached layer the screen draws under everything else; it is
 * emptied only by clear().
 *
 * A screen calls update(dt) with real time, multiplies its own game time by timeScale, and draws the three
 * layers: drawUnder (on the ground), drawOver (above the fighters), drawScreen (flashes and words on top).
 *
 * v5 (the fights' juice, docs/v5.md section 4): comic() pops a chunky outlined sticker word (POW!, BONK!, a combo
 * call) and number() a popping damage number that merges with the last one on the same victim; both come from a
 * fixed pool (POPS) and are drawn last in their layer. sticker() draws that chunky text anywhere (the battle
 * view's banners use it). word() / floatText() / tag() stay the clean interface words they were.
 */

export type FxShape = 'dot' | 'star' | 'petal' | 'shard' | 'confetti' | 'puff' | 'drop' | 'bubble';

/** What a body or a blow leaves on the grass. */
export type MarkKind = 'scuff' | 'divot' | 'flat';

export interface BurstOpts {
  colors: readonly string[];
  n?: number;
  speed?: number;
  size?: number;
  life?: number;
  gravity?: number;
  shape?: FxShape;
  under?: boolean;
  /** drawn on the screen layer (above the HUD) */
  screen?: boolean;
  /** aim the burst: direction in radians and half-width of the cone (default: all around) */
  dir?: number;
  spread?: number;
  /** pieces land and bounce on this y (the ground under them) */
  floor?: number;
  /** each piece's ground is up to this much nearer or farther than floor, so they land scattered in depth */
  depth?: number;
  /** a small shadow on the ground under each piece while it flies (needs floor) */
  shadow?: boolean;
  /** air drag, 1/s */
  drag?: number;
  /** a thin ink outline (stars and shards) */
  ink?: boolean;
  /** pieces start up to this many seconds late */
  stagger?: number;
  /** pieces start scattered this far from the centre */
  scatter?: number;
  /** once on the ground (needs floor) the pieces stay there for good, painted into the ground layer: true for all
   *  of them, a number 0..1 for that share of them (the rest fade as usual) */
  stay?: boolean | number;
}

const CAP = 500;
const UNDER = 0;
const OVER = 1;
const SCREEN = 2;
const TAU = Math.PI * 2;
/** rings on the grass are flattened this much (they lie on the ground, seen from the stands) */
const GROUND_RING = 0.5;
/** marks on the grass: at most this many, the oldest fade out first */
const MARKS = 70;
const DUST = ['#fbf8f1', '#ece4d4'];
/** the sparkles round a dizzy head: a soft cream-wheat, never a glaring gold */
const STAR_SOFT = '#efd99a';
/** the colour of a shadow on sunlit grass: a deep cool green, never black */
export const GRASS_SHADE = 'rgb(18, 58, 34)';
/** marks lying on the grass are flattened this much (seen from the stands, a little less than a ring) */
export const GROUND_FLAT = 0.55;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  age: number;
  color: string;
  shape: FxShape;
  rot: number;
  vr: number;
  grav: number;
  drag: number;
  floor: number;
  layer: number;
  ink: boolean;
  shadow: boolean;
  stay: boolean;
  ph: number;
}
interface Ring { x: number; y: number; color: string; r0: number; r1: number; life: number; age: number; layer: number }
interface Flash { color: string; alpha: number; life: number; age: number }
interface Word { x: number; y: number; text: string; color: string; size: number; age: number; life: number; rise: boolean; over?: boolean }
interface Flyer {
  x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; age: number; life: number;
  draw: (ctx: Ctx, x: number, y: number, s: number) => void;
  onArrive?: () => void;
}
interface Streak { x: number; y: number; ang: number; len: number; w: number; color: string; age: number; life: number }
interface Impact { x: number; y: number; size: number; color: string; age: number; life: number; rot: number }
interface Mark { x: number; y: number; size: number; sprite: number; age: number; life: number; fade: number; flip: boolean }
interface Rays { x: number; y: number; level: number; age: number; life: number }
/** a popping comic sticker word (kind 1) or damage number (kind 0); pooled */
interface Pop {
  kind: 0 | 1;
  x: number;
  y: number;
  text: string;
  /** a number's value (merged hits add up) */
  value: number;
  /** a number's victim, so the next hit on it merges into it (-1 = never merges) */
  key: number;
  size: number;
  style: StickerStyle;
  /** a small second sticker over it (CRIT!) */
  sub: string;
  rot: number;
  rise: number;
  drift: number;
  age: number;
  life: number;
  layer: number;
}

/** How a sticker's chunky letters look: a fill (a top-to-bottom gradient with fill2), the ink outline, a rim round
 *  the ink (null: none), and a starburst plate behind the word (null: none). */
export interface StickerStyle {
  fill: string;
  fill2?: string;
  ink?: string;
  rim?: string | null;
  burst?: string | null;
  /** the drop shadow's strength 0..1 (default 0.35) */
  shadow?: number;
}

/** the chunky letters of the stickers: the game's family at its heaviest (ExtraBold, loaded here) */
export const STICKER_FONT = FONT;
export const STICKER_WEIGHT = 800;
let stickerFontAsked = false;
const STICKER_INK = '#1d1a2b';
/** how many words and numbers can pop at once (the oldest number gives way) */
const POPS = 48;
const newPop = (): Pop => ({ kind: 0, x: 0, y: 0, text: '', value: 0, key: -1, size: 16, style: { fill: '#fff' }, sub: '', rot: 0, rise: 0, drift: 0, age: 0, life: 1, layer: 1 });

/** The damage numbers' looks: a hit by you, a hit on you, a crit, a poison glob. */
export const NUMBER_STYLE = {
  mine: { fill: '#ffffff', ink: STICKER_INK, rim: null, shadow: 0.3 },
  theirs: { fill: '#ffaa9b', ink: STICKER_INK, rim: null, shadow: 0.3 },
  crit: { fill: '#ffe45c', fill2: '#ff9a1f', ink: STICKER_INK, rim: '#ffffff', shadow: 0.4 },
  poison: { fill: '#cdf25e', ink: STICKER_INK, rim: null, shadow: 0.3 },
} as const satisfies Record<string, StickerStyle>;
const CRIT_TAG: StickerStyle = { fill: '#ff6b3d', fill2: '#e8381f', ink: STICKER_INK, rim: '#ffffff', shadow: 0.3 };
interface Lines { x: number; y: number; color: string; age: number; life: number; top: number }

const newParticle = (): Particle => ({
  x: 0, y: 0, vx: 0, vy: 0, size: 1, life: 1, age: 0, color: '#fff', shape: 'dot', rot: 0, vr: 0, grav: 0, drag: 0, floor: Infinity, layer: OVER, ink: false, shadow: false, stay: false, ph: 0,
});

export class Fx {
  /** add this to everything that should shake with the field */
  readonly camera = { x: 0, y: 0 };

  private ps: Particle[] = Array.from({ length: CAP }, newParticle);
  private count = 0;
  private recycle = 0;
  private shadows = 0;
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private words: Word[] = [];
  private flyers: Flyer[] = [];
  private streaks: Streak[] = [];
  private impacts: Impact[] = [];
  private marks: Mark[] = [];
  private rays: Rays[] = [];
  private lines: Lines[] = [];
  private pops: Pop[] = Array.from({ length: POPS }, newPop);
  private popN = 0;
  /** what stays on the pitch for the whole fight */
  readonly ground = new Ground();

  private shakeAmt = 0;
  private shakeDur = 0.3;
  private shakeT = 0;
  private kx = 0;
  private ky = 0;
  private stop = 0;
  private slowF = 1;
  private slowT = 0;
  private t = 0;

  /** multiply game time by this: 0 during a hit-stop, below 1 in slow motion */
  get timeScale(): number {
    if (this.stop > 0) return 0;
    if (this.slowT > 0) return this.slowT < 0.3 ? 1 + (this.slowF - 1) * (this.slowT / 0.3) : this.slowF;
    return 1;
  }

  /** how many particles are flying (for the dev pages) */
  get load(): number {
    return this.count;
  }

  /** how many icons are on their way (flyTo) */
  get flying(): number {
    return this.flyers.length;
  }

  clear(): void {
    this.count = this.shadows = 0;
    this.rings.length = this.flashes.length = this.words.length = this.flyers.length = 0;
    this.streaks.length = this.impacts.length = this.marks.length = this.rays.length = this.lines.length = 0;
    this.popN = 0;
    this.shakeAmt = this.kx = this.ky = this.stop = this.slowT = 0;
    this.slowF = 1;
    this.camera.x = this.camera.y = 0;
    this.ground.clear();
  }

  // ------------------------------------------------------------------ time and camera

  /** amount = px of shake at its start; it dies out over `seconds` */
  shake(amount: number, seconds = 0.3): void {
    const left = this.shakeAmt * (1 - this.shakeT / this.shakeDur) ** 2;
    if (amount < left) return;
    this.shakeAmt = amount;
    this.shakeDur = seconds;
    this.shakeT = 0;
  }

  /** one shove of the camera in a direction (it springs back) */
  kick(dir: number, amount: number): void {
    this.kx += Math.cos(dir) * amount;
    this.ky += Math.sin(dir) * amount;
  }

  hitStop(seconds: number): void {
    this.stop = Math.max(this.stop, seconds);
  }

  slowMo(factor: number, seconds: number): void {
    this.slowF = factor;
    this.slowT = seconds;
  }

  update(dt: number): void {
    this.t += dt;
    // particles hold with a hit-stop and drag in slow motion; words and flashes run in real time
    const pdt = dt * Math.max(0.12, this.timeScale);
    if (this.stop > 0) this.stop -= dt;
    else if (this.slowT > 0) this.slowT -= dt;

    if (this.shakeAmt > 0) {
      this.shakeT += dt;
      if (this.shakeT >= this.shakeDur) this.shakeAmt = 0;
    }
    const amp = this.shakeAmt * (1 - this.shakeT / this.shakeDur) ** 2;
    const k = Math.exp(-dt * 16);
    this.kx *= k;
    this.ky *= k;
    this.camera.x = this.kx + (amp > 0 ? frand(-amp, amp) : 0);
    this.camera.y = this.ky + (amp > 0 ? frand(-amp, amp) : 0);

    const ps = this.ps;
    let shadows = 0;
    for (let i = 0; i < this.count; ) {
      const p = ps[i];
      p.age += pdt;
      if (p.age >= p.life) {
        // a piece meant to stay that has not come to rest yet lies down where its ground is
        if (p.stay) this.settle(p);
        ps[i] = ps[--this.count];
        ps[this.count] = p;
        continue;
      }
      if (p.age < 0) {
        i++;
        if (p.shadow) shadows++;
        continue;
      }
      p.vy += p.grav * pdt;
      if (p.drag > 0) {
        const d = Math.max(0, 1 - p.drag * pdt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * pdt;
      p.y += p.vy * pdt;
      if (p.shape === 'petal' || p.shape === 'confetti') p.x += Math.sin(p.age * 3.2 + p.ph) * 34 * pdt;
      else if (p.shape === 'bubble') p.x += Math.sin(p.age * 6 + p.ph) * 10 * pdt;
      p.rot += p.vr * pdt;
      if (p.y > p.floor && p.vy > 0) {
        p.y = p.floor;
        p.vy = Math.abs(p.vy) > 60 ? -p.vy * 0.38 : 0;
        p.vx *= 0.55;
        p.vr *= 0.4;
        if (p.vy === 0) {
          p.grav = 0;
          p.vx *= 0.3;
          p.vr = 0;
          if (p.stay) {
            // at rest: into the ground layer for good
            this.settle(p);
            ps[i] = ps[--this.count];
            ps[this.count] = p;
            continue;
          }
        }
      }
      i++;
      if (p.shadow) shadows++;
    }
    this.shadows = shadows;
    age(this.rings, pdt);
    age(this.streaks, pdt);
    age(this.impacts, pdt);
    age(this.marks, pdt);
    age(this.rays, dt);
    age(this.lines, dt);
    age(this.flashes, dt);
    age(this.words, dt);
    for (let i = 0; i < this.popN; ) {
      const p = this.pops[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.pops[i] = this.pops[--this.popN];
        this.pops[this.popN] = p;
      } else i++;
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.age += dt;
      if (f.age < f.life) continue;
      this.flyers.splice(i, 1);
      this.ring(f.x1, f.y1, COLOR.goldLight, 4, 18, 0.28, SCREEN);
      this.burst(f.x1, f.y1, { colors: [UI.accent, COLOR.white], n: 4, speed: 110, size: 4, life: 0.32, gravity: 160, shape: 'star', screen: true });
      f.onArrive?.();
    }
  }

  // ------------------------------------------------------------------ makers

  burst(x: number, y: number, o: BurstOpts): void {
    const n = o.n ?? 12;
    const speed = o.speed ?? 160;
    const size = o.size ?? 5;
    const life = o.life ?? 0.6;
    const shape = o.shape ?? 'dot';
    const grav = o.gravity ?? 300;
    const layer = o.screen ? SCREEN : o.under ? UNDER : OVER;
    const spread = o.dir === undefined ? Math.PI : o.spread ?? 0.5;
    const dir = o.dir ?? 0;
    const floor = o.floor ?? Infinity;
    const depth = o.depth ?? 0;
    for (let i = 0; i < n; i++) {
      const p = this.count < CAP ? this.ps[this.count++] : this.ps[this.recycle++ % CAP];
      const a = dir + frand(-spread, spread);
      const v = speed * frand(0.35, 1);
      const sc = o.scatter ? frand(0, o.scatter) : 0;
      p.x = x + Math.cos(a) * sc;
      p.y = y + Math.sin(a) * sc;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.size = size * frand(0.6, 1.15);
      p.life = life * frand(0.7, 1.1);
      p.age = o.stagger ? -frand(0, o.stagger) : 0;
      p.color = o.colors[i % o.colors.length];
      p.shape = shape;
      p.rot = frand(0, TAU);
      p.vr = shape === 'dot' || shape === 'puff' || shape === 'drop' || shape === 'bubble' ? 0 : frand(-9, 9);
      p.grav = grav;
      p.drag = o.drag ?? (shape === 'petal' || shape === 'puff' ? 2.2 : 0);
      p.floor = depth ? floor + frand(-depth, depth) : floor;
      p.layer = layer;
      p.ink = o.ink ?? false;
      p.shadow = (o.shadow ?? false) && floor < Infinity;
      const keep = o.stay === true || (typeof o.stay === 'number' && ((i + 0.5) * 0.618034) % 1 < o.stay);
      p.stay = keep && floor < Infinity && layer !== SCREEN;
      p.ph = frand(0, TAU);
    }
  }

  /** layer: 0 = on the ground (a flattened ring), 1 = above the fighters (default), 2 = on the screen layer */
  ring(x: number, y: number, color: string, r0: number, r1: number, life = 0.35, layer = OVER): void {
    if (this.rings.length < 48) this.rings.push({ x, y, color, r0, r1, life, age: 0, layer });
  }

  flash(color: string, alpha: number, life = 0.25): void {
    this.flashes.push({ color, alpha, life, age: 0 });
  }

  /** a word that pops in and holds a moment (a class reveal, REMOVED): clean letters, never a comic word */
  word(x: number, y: number, text: string, opts: { color?: string; size?: number } = {}): void {
    if (this.words.length > 14) this.words.shift();
    this.words.push({ x: clamp(x, 70, W - 70), y, text, color: opts.color ?? UI.text, size: opts.size ?? TYPE.h2, age: 0, life: 0.8, rise: false });
  }

  /** rises and fades: +1 ROLL */
  floatText(x: number, y: number, text: string, color: string = COLOR.white, size: number = TYPE.body): void {
    if (this.words.length > 14) this.words.shift();
    this.words.push({ x: clamp(x, 40, W - 40), y, text, color, size, age: 0, life: 1.1, rise: true });
  }

  /** a small word on the pitch that pops in, rises a little and fades (MISS): drawn with drawOver, in the caller's space */
  tag(x: number, y: number, text: string, color: string = COLOR.white, size: number = TYPE.tiny): void {
    let n = 0;
    for (const w of this.words) if (w.over) n++;
    if (n > 10) return;
    this.words.push({ x, y, text, color, size, age: 0, life: 0.7, rise: true, over: true });
  }

  /**
   * A chunky comic sticker word that pops in with a squash, holds and swells away (POW!, BONK!, DOUBLE KO!), in the
   * caller's space: drawn last in drawOver, or in drawScreen with screen. rot: its tilt (default a small random one).
   */
  comic(x: number, y: number, text: string, style: StickerStyle, o: { size?: number; life?: number; rot?: number; rise?: number; screen?: boolean; delay?: number } = {}): void {
    let words = 0;
    for (let i = 0; i < this.popN; i++) if (this.pops[i].kind === 1) words++;
    if (words >= 8) return;
    const p = this.takePop();
    p.kind = 1;
    p.x = x;
    p.y = y;
    p.text = text;
    p.value = 0;
    p.key = -1;
    p.size = o.size ?? 28;
    p.style = style;
    p.sub = '';
    p.rot = o.rot ?? frand(-0.16, 0.16);
    p.rise = o.rise ?? 14;
    p.drift = 0;
    p.age = -(o.delay ?? 0);
    p.life = o.life ?? 0.62;
    p.layer = o.screen ? SCREEN : OVER;
  }

  /**
   * A damage number popping off a hit and rising (drawn last in drawOver): white for your hits, coral for hits on
   * you, gold and bigger with "CRIT!" for a crit, lime for poison. key = the victim: a hit on it while its last
   * number is young adds to that number and pops it again, so a flurry reads as one growing number.
   */
  number(x: number, y: number, value: number, o: { key?: number; crit?: boolean; style?: StickerStyle; size?: number } = {}): void {
    const key = o.key ?? -1;
    if (key >= 0) {
      for (let i = 0; i < this.popN; i++) {
        const p = this.pops[i];
        if (p.kind !== 0 || p.key !== key || p.age > 0.32 || p.age < 0) continue;
        p.value += value;
        p.text = String(Math.max(1, Math.round(p.value)));
        if (o.crit && !p.sub) {
          p.sub = 'CRIT!';
          p.style = NUMBER_STYLE.crit;
        }
        p.size = numberSize(p.value, !!p.sub, o.size);
        p.age = Math.min(p.age, 0.05);
        p.x += (x - p.x) * 0.5;
        p.y += (y - p.y) * 0.5;
        return;
      }
    }
    const p = this.takePop();
    p.kind = 0;
    p.x = x + frand(-4, 4);
    p.y = y;
    p.value = value;
    p.text = String(Math.max(1, Math.round(value)));
    p.key = key;
    p.sub = o.crit ? 'CRIT!' : '';
    p.style = o.crit ? NUMBER_STYLE.crit : (o.style ?? NUMBER_STYLE.mine);
    p.size = numberSize(value, !!o.crit, o.size);
    p.rot = o.crit ? frand(-0.12, 0.12) : 0;
    p.rise = o.crit ? 36 : 30;
    p.drift = frand(-14, 14);
    p.age = 0;
    p.life = o.crit ? 0.95 : 0.72;
    p.layer = OVER;
  }

  /** how many words and numbers are up (for the dev pages) */
  get popping(): number {
    return this.popN;
  }

  /** a free pop, or the oldest number (a word only when nothing else is left) */
  private takePop(): Pop {
    if (this.popN < POPS) return this.pops[this.popN++];
    let best = 0;
    let bestK = -1;
    for (let i = 0; i < POPS; i++) {
      const p = this.pops[i];
      const k = p.age / p.life + (p.kind === 0 ? 1 : 0);
      if (k > bestK) {
        bestK = k;
        best = i;
      }
    }
    return this.pops[best];
  }

  /** an icon arcs across the screen with a trail and pops where it lands */
  flyTo(
    x0: number, y0: number, x1: number, y1: number,
    draw: (ctx: Ctx, x: number, y: number, s: number) => void,
    onArrive?: () => void,
    opts: { delay?: number; life?: number } = {},
  ): void {
    const side = fchance(0.5) ? 1 : -1;
    const bow = frand(0.18, 0.34) * side;
    this.flyers.push({
      x0, y0, x1, y1,
      cx: (x0 + x1) / 2 + (y1 - y0) * bow,
      cy: (y0 + y1) / 2 - (x1 - x0) * bow,
      age: -(opts.delay ?? 0),
      life: opts.life ?? 0.6,
      draw,
      onArrive,
    });
  }

  /** a quick bright streak: a knife slash, a spear thrust, a cut line */
  streak(x: number, y: number, ang: number, len: number, color: string = COLOR.white, w = 7, life = 0.16): void {
    if (this.streaks.length < 40) this.streaks.push({ x, y, ang, len, w, color, age: 0, life });
  }

  /** the burst of light of a heavy hit: a white core and thin rays in `color` (gold by default) */
  impact(x: number, y: number, size: number, color: string = UI.accent, life = 0.2): void {
    if (this.impacts.length < 24) this.impacts.push({ x, y, size, color, age: 0, life, rot: frand(0, TAU) });
  }

  /**
   * Something left on the grass that fades slowly: a scuff where a frog lands, a divot after a bat hit, a
   * darker flattened patch where a body was squished. x, y on the ground, size = its width in screen px.
   */
  groundMark(kind: MarkKind, x: number, y: number, size: number, life = 14): void {
    const base = kind === 'scuff' ? 0 : kind === 'divot' ? 3 : 6;
    // a mark on top of a fresh one of its kind (a frog hopping in place) only freshens it: they never pile up
    for (const m of this.marks) {
      if (m.sprite - (m.sprite % 3) !== base || m.life - m.age < 1) continue;
      const near = Math.max(m.size, size) * 0.45;
      if (Math.abs(m.x - x) < near && Math.abs(m.y - y) < near * 0.6) {
        m.age = Math.max(Math.min(m.age, 0.08), Math.min(m.age, m.life - m.fade));
        m.size = Math.min(Math.max(m.size, size) * 1.04, Math.max(m.size, size) + 2);
        return;
      }
    }
    // past the cap the oldest ones fade out quickly rather than vanish
    let live = 0;
    for (const m of this.marks) if (m.life - m.age > 0.7) live++;
    if (live >= MARKS) {
      for (const m of this.marks) {
        if (m.life - m.age > 0.7) {
          m.life = m.age + 0.7;
          m.fade = 0.7;
          break;
        }
      }
    }
    if (this.marks.length >= MARKS + 16) this.marks.shift();
    this.marks.push({ x, y, size, sprite: base + Math.floor(frand(0, 3)), age: 0, life, fade: life * 0.45, flip: fchance(0.5) });
  }

  /** A mark of `kind` that stays for the whole fight, painted straight into the ground layer. */
  stampMark(kind: MarkKind, x: number, y: number, size: number, alpha = 1): void {
    const sp = markSprites()[(kind === 'scuff' ? 0 : kind === 'divot' ? 3 : 6) + Math.floor(frand(0, 3))];
    const g = this.ground.paint();
    g.globalAlpha = alpha;
    g.translate(x, y);
    if (fchance(0.5)) g.scale(-1, 1);
    g.drawImage(sp, -size / 2, -size / 4, size, size / 2);
    g.globalAlpha = 1;
  }

  /** A piece that came to rest on the ground: painted lying there into the ground layer, with its small shadow. */
  private settle(p: Particle): void {
    const g = this.ground.paint();
    const s = p.size;
    const x = p.x;
    const y = p.floor < Infinity ? p.floor : p.y;
    g.fillStyle = GRASS_SHADE;
    g.globalAlpha = 0.16;
    g.beginPath();
    g.ellipse(x + s * 0.25, y + s * 0.2, s * 0.95, s * 0.42, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    if (p.shape === 'shard') {
      drawShard(g, x, y - s * 0.15, s, p.rot, p.color, p.ink);
      return;
    }
    g.fillStyle = p.color;
    g.beginPath();
    if (p.shape === 'petal') {
      // lying flat: wide and thin, most of them turned across the view
      g.ellipse(x, y, s, s * 0.5 * GROUND_FLAT + 0.4, Math.sin(p.rot) * 0.5, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(31, 39, 51, 0.28)';
      g.lineWidth = 0.8;
      g.stroke();
    } else if (p.shape === 'confetti') {
      const c = Math.cos(p.rot) * 0.6;
      g.ellipse(x, y, s * 0.55, s * 0.3, c, 0, TAU);
      g.fill();
    } else if (p.shape === 'star') {
      sparkle(g, x, y, s * 0.6, p.rot);
      g.fill();
    } else {
      g.ellipse(x, y, s * 0.6, s * 0.6 * GROUND_FLAT, 0, 0, TAU);
      g.fill();
    }
  }

  /** speed lines from the screen's edges toward a point (the deciding blow); top: they stay below this y (a HUD) */
  speedLines(x: number, y: number, color: string = COLOR.white, life = 0.9, top = 0): void {
    this.lines.push({ x, y, color, age: 0, life, top });
  }

  /** a soft cloud of dust */
  dust(x: number, y: number, n = 6, size = 8, under = false): void {
    this.burst(x, y, { colors: DUST, n, speed: 70, size, life: 0.5, gravity: -30, shape: 'puff', under });
  }

  /** two pieces fuse: class colour, bigger for higher classes */
  fuseBurst(x: number, y: number, level: number): void {
    const i = clamp(Math.round(level), 1, 7) - 1;
    const colors = i === 6 ? [...RAINBOW, COLOR.white] : [TIER.metal[i], TIER.metalLight[i], COLOR.white];
    this.ring(x, y, TIER.metalLight[i], 12, 40 + i * 9, 0.35);
    this.burst(x, y, { colors, n: 9 + i * 3, speed: 150 + i * 28, size: 5 + i * 0.5, life: 0.55, gravity: 260 });
    this.burst(x, y, { colors: [CLASS_FX.spark, COLOR.white], n: 3 + i, speed: 90 + i * 14, size: 8 + i, life: 0.6, gravity: 0, shape: 'star', drag: 2 });
    if (i >= 4) {
      this.ring(x, y, TIER.metal[i], 20, 70 + i * 12, 0.5);
      this.shake(i - 2, 0.25);
    }
    if (i >= 5) this.flash(TIER.metalLight[i], 0.22, 0.3);
  }

  /** a pet connects to a weapon or gear */
  linkSpark(x: number, y: number): void {
    this.ring(x, y, COLOR.joint, 4, 18, 0.25);
    this.burst(x, y, { colors: [COLOR.joint, COLOR.goldLight, COLOR.white], n: 6, speed: 110, size: 5, life: 0.4, gravity: 120, shape: 'star' });
  }

  /** a roll's prize lands: turning rays (drawn under) and sparkles, grander for A, S, SSS */
  revealRays(x: number, y: number, level: number): void {
    const i = clamp(Math.round(level), 1, 7) - 1;
    this.rays.push({ x, y, level: i + 1, age: 0, life: 1.3 + i * 0.25 });
    const colors = i === 6 ? [...RAINBOW, COLOR.white] : [TIER.metalLight[i], CLASS_FX.spark, COLOR.white];
    this.ring(x, y, TIER.metalLight[i], 20, 80 + i * 14, 0.45);
    this.burst(x, y, { colors, n: 8 + i * 4, speed: 170 + i * 35, size: 7 + i * 0.6, life: 0.8 + i * 0.08, gravity: 60, shape: 'star', drag: 1.6 });
    if (i >= 4) {
      this.ring(x, y, COLOR.white, 30, 130 + i * 16, 0.6);
      this.flash(TIER.tileLight[i], 0.18 + (i - 4) * 0.1, 0.35);
      this.burst(x, y, { colors, n: 14 + (i - 4) * 10, speed: 420, size: 8, life: 1.4, gravity: 520, shape: 'confetti', dir: -Math.PI / 2, spread: 1.1, drag: 1 });
      this.shake(2 + (i - 4) * 3, 0.4);
    }
  }

  /** victory: gold and white, with the winning team's colour when it is given */
  confettiCannon(team?: Team): void {
    const colors = team === undefined ? [UI.accent, COLOR.goldLight, COLOR.white] : [TEAM[team].main, TEAM[team].light, UI.accent, COLOR.white];
    for (const side of [0, 1]) {
      this.burst(side ? W - 20 : 20, H * 0.8, {
        colors, n: 60, speed: 1250, size: 8, life: 2.8, gravity: 620, shape: 'confetti', dir: side ? -Math.PI * 0.62 : -Math.PI * 0.38, spread: 0.3, drag: 1.5, screen: true, stagger: 0.25,
      });
    }
    this.burst(W / 2, -30, { colors, n: 50, speed: 60, size: 7, life: 3.2, gravity: 130, shape: 'confetti', drag: 0.4, screen: true, stagger: 1.6, scatter: W / 2 });
    this.flash(COLOR.white, 0.2, 0.3);
  }

  /** defeat, played for laughs: a little grey rain */
  sadDrizzle(): void {
    this.burst(W / 2, -40, { colors: ['#c9d1db', '#e6eaef', '#9aa5b3'], n: 80, speed: 40, size: 5, life: 2.6, gravity: 900, shape: 'drop', dir: Math.PI / 2, spread: 0.1, screen: true, stagger: 1.8, scatter: W / 2, drag: 1.1 });
  }

  /** the little sparkles that circle a dizzy head (drawn by the caller where the head is); the far ones dim */
  orbitStars(ctx: Ctx, x: number, y: number, r: number, t: number): void {
    ctx.fillStyle = STAR_SOFT;
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * TAU) / 3;
      const near = Math.sin(a); // 1 in front of the head, -1 behind it
      const s = r * (0.3 + 0.1 * near);
      ctx.globalAlpha = 0.6 + 0.4 * near;
      sparkle(ctx, x + Math.cos(a) * r, y + near * r * 0.3, s, 0);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ drawing

  /** on the ground, below the fighters: marks on the grass, ground rings, and the shadows of flying pieces */
  drawUnder(ctx: Ctx): void {
    if (this.marks.length) {
      const sp = markSprites();
      for (const m of this.marks) {
        const a = clamp(m.age / 0.08, 0, 1) * clamp((m.life - m.age) / m.fade, 0, 1);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        const w = m.size;
        const h = m.size * 0.5;
        if (m.flip) {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.scale(-1, 1);
          ctx.drawImage(sp[m.sprite], -w / 2, -h / 2, w, h);
          ctx.restore();
        } else ctx.drawImage(sp[m.sprite], m.x - w / 2, m.y - h / 2, w, h);
      }
      ctx.globalAlpha = 1;
    }
    for (const r of this.rays) this.drawRays(ctx, r);
    ctx.globalAlpha = 1;
    if (this.shadows) this.drawShadows(ctx);
    this.drawLayer(ctx, UNDER);
  }

  /** above the fighters */
  drawOver(ctx: Ctx): void {
    this.drawImpacts(ctx);
    this.drawLayer(ctx, OVER);
    this.drawWords(ctx, true);
    for (const s of this.streaks) {
      const k = s.age / s.life;
      const reach = s.len * easeOutCubic(Math.min(1, k * 2.2));
      const tail = s.len * easeOutCubic(Math.max(0, k * 1.6 - 0.6));
      const c = Math.cos(s.ang);
      const sn = Math.sin(s.ang);
      const w = s.w * (1 - k);
      const mx = s.x + c * (tail + (reach - tail) * 0.6);
      const my = s.y + sn * (tail + (reach - tail) * 0.6);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(s.x + c * tail, s.y + sn * tail);
      ctx.lineTo(mx - sn * w, my + c * w);
      ctx.lineTo(s.x + c * reach, s.y + sn * reach);
      ctx.lineTo(mx + sn * w, my - c * w);
      ctx.closePath();
      ctx.fill();
    }
    this.drawPops(ctx, OVER);
  }

  /** the words and numbers of one layer: they pop in with a squash, wobble, then rise and fade (words swell away) */
  private drawPops(ctx: Ctx, layer: number): void {
    for (let i = 0; i < this.popN; i++) {
      const p = this.pops[i];
      if (p.layer !== layer || p.age < 0) continue;
      const k = p.age / p.life;
      const a = clamp(p.age / 0.13, 0, 1);
      // in: from small with an overshoot; then a wobble that dies out
      let s = a < 1 ? 0.35 + 0.65 * easeOutBack(a) : 1;
      const wob = Math.sin(p.age * 34) * Math.exp(-p.age * 9) * 0.16;
      let sx = s * (1 + wob + (1 - a) * 0.25);
      let sy = s * (1 - wob - (1 - a) * 0.2);
      const out = clamp((k - 0.72) / 0.28, 0, 1);
      if (p.kind === 1) {
        // a word swells a little as it fades
        s = 1 + 0.18 * out;
        sx *= s;
        sy *= s;
      } else {
        sx *= 1 - 0.25 * out;
        sy *= 1 - 0.25 * out;
      }
      const alpha = 1 - out * out;
      if (alpha <= 0.01) continue;
      const y = p.y - p.rise * easeOutCubic(Math.min(1, k * 1.5));
      const x = p.x + p.drift * k;
      ctx.globalAlpha = alpha;
      stickerCached(ctx, p.text, x, y, p.size, p.style, p.rot, sx, sy);
      if (p.sub) stickerCached(ctx, p.sub, x, y - p.size * 0.82, p.size * 0.52, CRIT_TAG, -0.1, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  /** a soft dark spot on the grass under every piece that flies, smaller and fainter the higher it is */
  private drawShadows(ctx: Ctx): void {
    const ps = this.ps;
    ctx.fillStyle = GRASS_SHADE;
    let alpha = -1;
    for (let i = 0; i < this.count; i++) {
      const p = ps[i];
      if (!p.shadow || p.age < 0) continue;
      const h = Math.max(0, p.floor - p.y);
      const k = 1 / (1 + h / 26);
      const fade = p.age / p.life > 0.75 ? (1 - p.age / p.life) * 4 : 1;
      const a = Math.round(0.26 * k * (p.stay ? 1 : fade) * 20) / 20;
      if (a <= 0) continue;
      if (a !== alpha) ctx.globalAlpha = alpha = a;
      const rx = p.size * (0.4 + 0.5 * k);
      ctx.beginPath();
      ctx.ellipse(p.x + h * 0.12, p.floor + 0.5, rx, rx * 0.4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawImpacts(ctx: Ctx): void {
    for (const m of this.impacts) {
      const k = m.age / m.life;
      const e = easeOutCubic(Math.min(1, k * 1.6));
      const fade = 1 - k * k;
      // thin rays of light thrown out from the point
      ctx.globalAlpha = fade;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = m.rot + (i * TAU) / 8;
        const long = i % 2 ? 0.62 : 1;
        const r0 = m.size * (0.25 + 0.45 * e);
        const r1 = m.size * (0.55 + 0.75 * e) * long;
        const w = 0.09 * (1 - k * 0.6);
        ctx.moveTo(m.x + Math.cos(a - w) * r0, m.y + Math.sin(a - w) * r0);
        ctx.lineTo(m.x + Math.cos(a) * r1, m.y + Math.sin(a) * r1);
        ctx.lineTo(m.x + Math.cos(a + w) * r0, m.y + Math.sin(a + w) * r0);
        ctx.closePath();
      }
      ctx.fill();
      // and a white core that blooms and is gone
      ctx.globalAlpha = fade * (1 - k);
      ctx.fillStyle = COLOR.white;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * (0.18 + 0.32 * e), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** full-screen flashes, flying icons and words, above everything */
  drawScreen(ctx: Ctx): void {
    for (const f of this.flashes) {
      ctx.globalAlpha = f.alpha * (1 - f.age / f.life);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, W, H);
    }
    for (const l of this.lines) {
      const k = l.age / l.life;
      ctx.save();
      if (l.top > 0) {
        ctx.beginPath();
        ctx.rect(0, l.top, W, H - l.top);
        ctx.clip();
      }
      ctx.globalAlpha = 0.32 * (1 - k) * clamp(k / 0.08, 0, 1);
      ctx.fillStyle = l.color;
      ctx.beginPath();
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU + Math.sin(i * 12.9898) * 0.09;
        const far = 900;
        const near = 170 + 90 * Math.abs(Math.sin(i * 78.233 + Math.floor(this.t * 14) * 1.7)) + k * 60;
        const w = 0.008 + 0.008 * Math.abs(Math.sin(i * 3.7));
        ctx.moveTo(l.x + Math.cos(a) * near, l.y + Math.sin(a) * near);
        ctx.lineTo(l.x + Math.cos(a - w) * far, l.y + Math.sin(a - w) * far);
        ctx.lineTo(l.x + Math.cos(a + w) * far, l.y + Math.sin(a + w) * far);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.drawLayer(ctx, SCREEN);
    for (const f of this.flyers) {
      if (f.age < 0) continue;
      const k = f.age / f.life;
      const p = k * k * (3 - 2 * k);
      ctx.fillStyle = COLOR.goldLight;
      for (let i = 4; i >= 1; i--) {
        const q = p - i * 0.035;
        if (q <= 0) continue;
        ctx.globalAlpha = 0.45 * (1 - i / 5);
        ctx.beginPath();
        ctx.arc(bez(f.x0, f.cx, f.x1, q), bez(f.y0, f.cy, f.y1, q), 4.5 - i * 0.7, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const s = k < 0.2 ? 0.5 + 0.8 * easeOutBack(k / 0.2) : 1.3 - 0.5 * ((k - 0.2) / 0.8);
      f.draw(ctx, bez(f.x0, f.cx, f.x1, p), bez(f.y0, f.cy, f.y1, p), s);
    }
    this.drawWords(ctx, false);
    this.drawPops(ctx, SCREEN);
  }

  private drawWords(ctx: Ctx, over: boolean): void {
    for (const w of this.words) {
      if (!!w.over !== over) continue;
      const k = w.age / w.life;
      const s = w.age < 0.12 ? 0.85 + 0.15 * easeOutCubic(w.age / 0.12) : 1;
      ctx.globalAlpha = clamp(w.age / 0.08, 0, 1) * clamp((1 - k) / 0.3, 0, 1);
      ctx.save();
      ctx.translate(w.x, w.rise ? w.y - (over ? 12 : 26) * easeOutCubic(k) : w.y - 4 * k);
      ctx.scale(s, s);
      label(ctx, w.text, 0, 0, w.size, { color: w.color, weight: 700, onPitch: true, track: over ? 1 : undefined });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawRays(ctx: Ctx, r: Rays): void {
    const i = r.level - 1;
    const n = 8 + (i >= 4 ? 4 : 0) + (i >= 6 ? 4 : 0);
    const R = (90 + i * 26) * easeOutBack(Math.min(1, r.age / 0.3));
    const a0 = clamp(r.age / 0.12, 0, 1) * clamp((r.life - r.age) / 0.45, 0, 1);
    const half = (Math.PI / n) * 0.42;
    for (let pass = 0; pass < (i >= 5 ? 2 : 1); pass++) {
      const rot = r.age * (pass ? -0.7 : 0.9) + pass * 0.4;
      const rad = pass ? R * 0.7 : R;
      ctx.globalAlpha = a0 * (pass ? 0.35 : 0.5);
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * TAU;
        ctx.fillStyle = i === 6 ? RAINBOW[k % RAINBOW.length] : pass ? COLOR.white : TIER.tileLight[i];
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.cos(a - half) * rad, r.y + Math.sin(a - half) * rad);
        ctx.lineTo(r.x + Math.cos(a + half) * rad, r.y + Math.sin(a + half) * rad);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawLayer(ctx: Ctx, layer: number): void {
    for (const r of this.rings) {
      if (r.layer !== layer) continue;
      const k = r.age / r.life;
      const e = easeOutCubic(k);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      ctx.globalAlpha = (1 - k * k) * (layer === UNDER ? 0.5 : 0.75);
      ctx.lineWidth = Math.min(3, (r.r1 - r.r0) * 0.08 * (1 - k)) + 0.8;
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      if (layer === UNDER) ctx.ellipse(r.x, r.y, rad, rad * GROUND_RING, 0, 0, TAU);
      else ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
    }
    let alpha = 1;
    let fill = '';
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOR.ink;
    const ps = this.ps;
    for (let i = 0; i < this.count; i++) {
      const p = ps[i];
      if (p.layer !== layer || p.age < 0) continue;
      const k = p.age / p.life;
      const a = p.shape === 'puff' ? 0.6 * (1 - k) : p.shape === 'dot' || p.shape === 'star' || p.stay ? 1 : k > 0.75 ? (1 - k) * 4 : 1;
      if (a !== alpha) ctx.globalAlpha = alpha = a;
      const s = p.size;
      if (p.shape === 'shard') {
        drawShard(ctx, p.x, p.y, s, p.rot, p.color, p.ink);
        fill = '';
        continue;
      }
      if (p.shape === 'confetti') {
        // a card that flips as it falls: its back is the darker side
        const c = Math.cos(p.rot);
        const sn = Math.sin(p.rot);
        const f = Math.cos(p.age * 9 + p.ph);
        const col = f < 0 ? tone(p.color).dark : p.color;
        if (col !== fill) ctx.fillStyle = fill = col;
        const ux = c * s * 0.6 * f;
        const uy = sn * s * 0.6 * f;
        const vx = -sn * s * 0.38;
        const vy = c * s * 0.38;
        ctx.beginPath();
        ctx.moveTo(p.x + ux + vx, p.y + uy + vy);
        ctx.lineTo(p.x - ux + vx, p.y - uy + vy);
        ctx.lineTo(p.x - ux - vx, p.y - uy - vy);
        ctx.lineTo(p.x + ux - vx, p.y + uy - vy);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      if (p.shape === 'bubble') {
        // a soft bubble: its colour, a darker rim and a speck of light, that grows a little and fades at the top
        const rad = s * (0.6 + 0.4 * easeOutCubic(Math.min(1, k * 3)));
        ctx.globalAlpha = alpha = 0.85 * (k > 0.7 ? (1 - k) / 0.3 : 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = Math.max(0.6, s * 0.16);
        ctx.strokeStyle = tone(p.color).dark;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(p.x - rad * 0.35, p.y - rad * 0.35, rad * 0.28, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = COLOR.ink;
        fill = '';
        continue;
      }
      if (p.color !== fill) ctx.fillStyle = fill = p.color;
      ctx.beginPath();
      if (p.shape === 'dot') {
        ctx.arc(p.x, p.y, s * (1 - k * k) + 0.3, 0, TAU);
      } else if (p.shape === 'puff') {
        ctx.arc(p.x, p.y, s * (0.5 + 1.1 * easeOutCubic(k)), 0, TAU);
      } else if (p.shape === 'drop') {
        ctx.rect(p.x - s * 0.22, p.y - s * 1.4, s * 0.44, s * 2.8);
      } else if (p.shape === 'petal') {
        ctx.ellipse(p.x, p.y, s, s * 0.55, p.rot, 0, TAU);
      } else {
        // a four-point sparkle that shrinks away
        sparkle(ctx, p.x, p.y, s * (1 - k * k) + 0.3, p.rot);
      }
      ctx.fill();
      if (p.ink) ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** A chip with volume: its upper-left facet catches the sun, its lower facet is in shade. */
export function drawShard(ctx: Ctx, x: number, y: number, s: number, rot: number, color: string, ink: boolean): void {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const ax = x + c * s;
  const ay = y + sn * s;
  const bx = x - c * s * 0.7 - sn * s * 0.6;
  const by = y - sn * s * 0.7 + c * s * 0.6;
  const cx = x - c * s * 0.5 + sn * s * 0.7;
  const cy = y - sn * s * 0.5 - c * s * 0.7;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (ink) {
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const mx = (ax + bx + cx) / 3;
  const my = (ay + by + cy) / 3;
  facet(ctx, ax, ay, bx, by, mx, my, color);
  facet(ctx, bx, by, cx, cy, mx, my, color);
  facet(ctx, cx, cy, ax, ay, mx, my, color);
}

/** A damage number's size: bigger for bigger hits, and for a crit. */
function numberSize(value: number, crit: boolean, base?: number): number {
  const s = (base ?? 15) + Math.min(9, Math.sqrt(Math.max(0, value)) * 0.85);
  return crit ? s * 1.3 : s;
}

const BURST_PTS = 14;

/**
 * Chunky cartoon letters, centred on (x, y): a soft drop shadow, a starburst plate when the style has one, a rim,
 * a thick ink outline and the fill (a gradient when fill2 is given), tilted by rot and scaled (sx, sy) about the
 * middle. In the caller's space; the caller sets globalAlpha.
 */
export function sticker(ctx: Ctx, text: string, x: number, y: number, size: number, st: StickerStyle, rot = 0, sx = 1, sy = 1): void {
  if (size < 2 || sx <= 0.01 || sy <= 0.01) return;
  if (!stickerFontAsked) {
    // ask for the ExtraBold face once, so it is ready a moment after the first sticker
    stickerFontAsked = true;
    try {
      void document.fonts?.load(`${STICKER_WEIGHT} 20px "Barlow Condensed"`);
    } catch {
      /* no font loading API: the fallback is used */
    }
  }
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.font = `${STICKER_WEIGHT} ${Math.round(size)}px ${STICKER_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const ink = st.ink ?? STICKER_INK;
  const rim = st.rim === undefined ? null : st.rim;
  const lw = Math.max(2, size * 0.2);
  const rimW = rim ? lw + Math.max(2, size * 0.13) : lw;
  const shade = st.shadow ?? 0.35;
  const ty = size * 0.04;
  if (st.burst) {
    // a jagged comic plate behind the word, as wide as it, with its own outline and shadow
    const w = ctx.measureText(text).width;
    const rx = w * 0.62 + size * 0.42;
    const ry = size * 0.98;
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i < BURST_PTS * 2; i++) {
        const a = (i / (BURST_PTS * 2)) * Math.PI * 2;
        const k = i % 2 ? 0.72 + 0.06 * Math.sin(i * 2.3) : 1 + 0.05 * Math.sin(i * 1.7);
        const px = Math.cos(a) * rx * k;
        const py = Math.sin(a) * ry * k;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
    };
    const a0 = ctx.globalAlpha;
    ctx.translate(size * 0.07, size * 0.1);
    path();
    ctx.globalAlpha = a0 * shade;
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.globalAlpha = a0;
    ctx.translate(-size * 0.07, -size * 0.1);
    path();
    ctx.fillStyle = st.burst;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  // the drop shadow
  if (shade > 0) {
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * shade;
    ctx.lineWidth = rimW;
    ctx.strokeStyle = ink;
    ctx.strokeText(text, size * 0.05, ty + size * 0.09);
    ctx.globalAlpha = a0;
  }
  if (rim) {
    ctx.lineWidth = rimW;
    ctx.strokeStyle = rim;
    ctx.strokeText(text, 0, ty);
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;
  ctx.strokeText(text, 0, ty);
  if (st.fill2) {
    const g = ctx.createLinearGradient(0, ty - size * 0.4, 0, ty + size * 0.4);
    g.addColorStop(0, st.fill);
    g.addColorStop(1, st.fill2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = st.fill;
  ctx.fillText(text, 0, ty);
  ctx.restore();
}

// ------------------------------------------------------------------ stickers as cached pictures

interface StickerPic { cv: HTMLCanvasElement; w: number; h: number }
/** each sticker look is painted once per text and size into a small canvas (the oldest are dropped past the cap) */
const PICS = new Map<string, StickerPic>();
const PICS_CAP = 220;
const STYLE_IDS = new WeakMap<StickerStyle, number>();
let styleN = 0;
/** device px per unit the pictures are painted at (the battle view draws at about 1 unit = 1 screen px) */
let picRes = 2;

/** Sets how sharp the cached stickers are painted: the screen's device pixel ratio (1..3). Clears the cache. */
export function setStickerRes(ratio: number): void {
  const r = clamp(Math.round(ratio * 4) / 4, 1, 3);
  if (r === picRes) return;
  picRes = r;
  PICS.clear();
}

/**
 * sticker() through a cache: the word is painted once into a small canvas and then drawn with one drawImage, so
 * dozens of damage numbers and words cost next to nothing a frame. Same arguments as sticker().
 */
export function stickerCached(ctx: Ctx, text: string, x: number, y: number, size: number, st: StickerStyle, rot = 0, sx = 1, sy = 1): void {
  if (size < 2 || sx <= 0.01 || sy <= 0.01) return;
  let id = STYLE_IDS.get(st);
  if (id === undefined) STYLE_IDS.set(st, (id = ++styleN));
  const q = Math.round(size * 2) / 2;
  const key = `${id}|${q}|${text}`;
  let pic = PICS.get(key);
  if (!pic) {
    if (PICS.size >= PICS_CAP) {
      let n = 0;
      for (const k of PICS.keys()) {
        PICS.delete(k);
        if (++n >= 60) break;
      }
    }
    const m = document.createElement('canvas').getContext('2d')!;
    m.font = `${STICKER_WEIGHT} ${Math.round(q)}px ${STICKER_FONT}`;
    const tw = m.measureText(text).width;
    const pad = q * 0.5;
    const w = Math.ceil((st.burst ? tw * 1.3 + q * 0.9 : tw) + pad * 2);
    const h = Math.ceil((st.burst ? q * 2.1 : q * 1.2) + pad * 2);
    const cv = m.canvas;
    cv.width = Math.ceil(w * picRes);
    cv.height = Math.ceil(h * picRes);
    m.setTransform(picRes, 0, 0, picRes, 0, 0);
    sticker(m, text, w / 2, h / 2, q, st);
    pic = { cv, w, h };
    PICS.set(key, pic);
  }
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  const k = size / q;
  ctx.scale(sx * k, sy * k);
  ctx.drawImage(pic.cv, -pic.w / 2, -pic.h / 2, pic.w, pic.h);
  ctx.restore();
}

/** A four-point sparkle path (long arms, a narrow waist). */
function sparkle(ctx: Ctx, x: number, y: number, o: number, rot: number): void {
  const n = o * 0.3;
  ctx.beginPath();
  for (let j = 0; j < 8; j++) {
    const q = j % 2 ? n : o;
    const a = rot + (j * Math.PI) / 4;
    if (j) ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    else ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath();
}

/** One facet of a chip (edge a-b to the middle m), lit or shaded by which way the edge faces the key light. */
function facet(ctx: Ctx, ax: number, ay: number, bx: number, by: number, mx: number, my: number, color: string): void {
  // the edge's outward side, against the light coming from the upper left
  let nx = by - ay;
  let ny = ax - bx;
  if (nx * (ax - mx) + ny * (ay - my) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const d = (-nx - ny) / (Math.hypot(nx, ny) * Math.SQRT2 || 1);
  if (d > -0.25 && d < 0.35) return;
  ctx.fillStyle = d > 0 ? tone(color).light : tone(color).dark;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(mx, my);
  ctx.closePath();
  ctx.fill();
}

const TONES = new Map<string, { light: string; dark: string }>();

/** A lighter and a darker shade of a #rrggbb colour (cached). */
function tone(color: string): { light: string; dark: string } {
  let t = TONES.get(color);
  if (t) return t;
  if (color[0] !== '#' || color.length !== 7) t = { light: color, dark: color };
  else {
    const c = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    const to = (k: number, w: number) => `rgb(${c.map((v) => Math.round(v + (w - v) * k)).join(', ')})`;
    t = { light: to(0.45, 255), dark: to(0.35, 12) };
  }
  TONES.set(color, t);
  return t;
}

// ------------------------------------------------------------------ marks on the grass

let sprites: HTMLCanvasElement[] | null = null;
const MW = 64; // a mark sprite, in its own px (drawn at any size, about twice as wide as high)
const MH = 32;

/** Three looks each of a scuff, a divot and a flattened patch, painted once. */
function markSprites(): HTMLCanvasElement[] {
  if (sprites) return sprites;
  sprites = [];
  let seed = 7;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const make = (paint: (c: Ctx) => void) => {
    const cv = document.createElement('canvas');
    cv.width = MW;
    cv.height = MH;
    paint(cv.getContext('2d')!);
    sprites!.push(cv);
  };
  const blob = (c: Ctx, x: number, y: number, rx: number, ry: number, color: string, a: number) => {
    c.globalAlpha = a;
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fill();
  };
  const soft = (c: Ctx, x: number, y: number, rx: number, ry: number, a: number, rgb = '24, 70, 36') => {
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${rgb}, ${a})`);
    g.addColorStop(0.6, `rgba(${rgb}, ${a * 0.6})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    c.fillStyle = g;
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  };
  // a frog's landing: a pale worn skid in the sunlit grass, a few blades kicked up along it
  for (let v = 0; v < 3; v++) {
    make((c) => {
      soft(c, 32, 16, 24, 9, 0.32, '236, 232, 186');
      soft(c, 28 + rnd() * 8, 16 + (rnd() - 0.5) * 3, 13, 4.5, 0.3, '226, 214, 160');
      c.globalAlpha = 0.35;
      c.strokeStyle = '#6c8f60';
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const x = 16 + rnd() * 32;
        const y = 12 + rnd() * 8;
        c.moveTo(x, y);
        c.lineTo(x + 4 + rnd() * 4, y + (rnd() - 0.5) * 2);
      }
      c.stroke();
      for (let i = 0; i < 3; i++) blob(c, 18 + rnd() * 28, 9 + rnd() * 14, 1.2, 0.8, '#f1eedb', 0.7);
    });
  }
  // a divot: a little hole of warm earth with its sunlit lower lip, and the clod of turf it threw
  for (let v = 0; v < 3; v++) {
    make((c) => {
      const x = 26 + rnd() * 6;
      soft(c, x, 16, 18, 9, 0.18);
      blob(c, x, 16, 11, 5, '#9a6a3e', 0.95);
      blob(c, x - 1.5, 15, 8, 3.4, '#6e4526', 0.9);
      c.globalAlpha = 0.85;
      c.strokeStyle = '#dce6c9';
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(x, 16.4, 10.4, 4.6, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
      // the clod: a grassy lit top and an earthy underside
      const cx = x + 18 + rnd() * 6;
      const cy = 13 + rnd() * 8;
      blob(c, cx + 0.8, cy + 2.4, 5.5, 2, '#183a22', 0.22);
      blob(c, cx, cy + 0.6, 5, 3.2, '#8a5a32', 1);
      blob(c, cx - 0.6, cy - 1, 4.2, 2.2, '#8cae78', 1);
      blob(c, cx - 1.6, cy - 1.6, 2, 0.9, '#cadcb3', 1);
    });
  }
  // a flattened patch: grass pressed flat, its blades laid out from the middle and catching the sun
  for (let v = 0; v < 3; v++) {
    make((c) => {
      soft(c, 32, 16, 30, 14, 0.22);
      blob(c, 32, 16.5, 22, 9, '#5e7f56', 0.16);
      c.globalAlpha = 0.5;
      c.strokeStyle = '#e3ead2';
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + rnd() * 0.3;
        c.moveTo(32 + Math.cos(a) * 6, 16 + Math.sin(a) * 3);
        c.lineTo(32 + Math.cos(a) * (18 + rnd() * 9), 16 + Math.sin(a) * (8 + rnd() * 4));
      }
      c.stroke();
    });
  }
  return sprites;
}

const bez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

function age<T extends { age: number; life: number }>(list: T[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].age += dt;
    if (list[i].age >= list[i].life) list.splice(i, 1);
  }
}

// ------------------------------------------------------------------ the ground layer

/** Kept at most this sharp: marks are soft shapes, and the layer covers the whole pitch. */
const GROUND_RATIO = 2;

/**
 * Marks that stay on the ground for the whole fight, painted once into one cached canvas and drawn with a single
 * drawImage, so hundreds of them cost nothing per frame. It covers one rectangle (area()) in the caller's units: the
 * battle view uses arena px, the whole pitch and its surrounds, so a mark stays put however the camera moves.
 * Cleared by Fx.clear() (a new fight) or clear().
 */
export class Ground {
  private cv: HTMLCanvasElement | null = null;
  private g: Ctx | null = null;
  /** device px per unit */
  private ratio = 1;
  private x = -60;
  private y = -90;
  private w = 580;
  private h = 1000;
  /** how many marks were painted since the last clear */
  count = 0;

  /** the rectangle the layer covers, in the caller's units (marks outside it are cut off); a change empties it */
  area(x: number, y: number, w: number, h: number): void {
    const ww = Math.max(1, Math.round(w));
    const hh = Math.max(1, Math.round(h));
    if (x === this.x && y === this.y && ww === this.w && hh === this.h) return;
    this.x = x;
    this.y = y;
    this.w = ww;
    this.h = hh;
    this.cv = this.g = null;
    this.count = 0;
  }

  /** a horizontal band of the screen (the old way to place it) */
  band(top: number, bottom: number): void {
    this.area(0, Math.round(top), W, bottom - top);
  }

  /** device px per unit; a change keeps what is painted (redrawn at the new size) */
  setRatio(ratio: number): void {
    const r = clamp(Math.round(ratio * 8) / 8, 1, GROUND_RATIO);
    if (r === this.ratio) return;
    const old = this.cv;
    this.ratio = r;
    this.cv = this.g = null;
    if (old && this.count) {
      const g = this.paint();
      g.drawImage(old, this.x, this.y, this.w, this.h);
      this.count--;
    }
  }

  clear(): void {
    this.count = 0;
    if (!this.g || !this.cv) return;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.cv.width, this.cv.height);
  }

  /** The layer's context set up in the caller's units, to paint one mark into (leave its transform as you like). */
  paint(): Ctx {
    if (!this.cv || !this.g) {
      this.cv = document.createElement('canvas');
      this.cv.width = Math.ceil(this.w * this.ratio);
      this.cv.height = Math.ceil(this.h * this.ratio);
      this.g = this.cv.getContext('2d')!;
    }
    const g = this.g;
    g.setTransform(this.ratio, 0, 0, this.ratio, -this.x * this.ratio, -this.y * this.ratio);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.count++;
    return g;
  }

  draw(ctx: Ctx, alpha = 1): void {
    if (!this.count || !this.cv || alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(this.cv, this.x, this.y, this.w, this.h);
    ctx.globalAlpha = 1;
  }
}
