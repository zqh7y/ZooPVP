import { music, sfx } from '../audio/engine';
import { PET_TYPES, formatPower, rungOf, tierOf } from '../data';
import { Fx } from '../draw/fx';
import { bolt, crown } from '../draw/icons';
import { countBadge, dropLabel, fitLabel } from '../draw/ui';
import { fpick, frand } from '../rng';
import { H, RARITY, TEAM, TYPE, UI, W } from '../theme';
import type { ArmySpec, Opponent, PetType } from '../types';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, label, rr, textWidth, type Ctx, type Rect } from '../util';
import { drawUnit, type Overlay } from './panels';

/*
 * The matchmaking moment, between BATTLE and the fight. SEARCHING: the screen sinks into the deep base, a radar
 * pulses and sweeps while faces of the cast flick through its centre (the search ticks about twice a second). FOUND:
 * the opponent's card drops in from the top (its name with a small BOT tag, its theme, its POWER and its army as
 * small portraits), yours rises from the bottom, and a VS badge slams in between them. A moment later (or on a tap)
 * the overlay lifts away and onGo() starts the fight in the arena.
 */

const SEARCH_MIN = 1.5; // the search lasts about this long (a little random each time)
const SEARCH_MAX = 2.0;
const SLIDE = 0.42; // the cards slide in
const VS_AT = 0.32; // the VS badge slams in, after FOUND
const HOLD = 2.15; // after FOUND, the fight starts by itself
const TAP_AFTER = 0.75; // after FOUND, a tap starts it sooner
const OUT = 0.38; // the overlay lifts away

const RADAR = { x: W / 2, y: 520 };
const THEIRS: Rect = { x: 22, y: 128, w: W - 44, h: 318 };
const YOURS: Rect = { x: 22, y: 590, w: W - 44, h: 318 };
const VS = { x: W / 2, y: 518, r: 54 };

interface Group {
  pet: PetType;
  count: number;
  boss: boolean;
}

/** An army as portraits: its squads grouped by unit (a boss on its own), the boss first, then the highest rungs. */
function groupsOf(army: ArmySpec): Group[] {
  const map = new Map<string, Group>();
  for (const q of army.squads) {
    const key = `${q.pet}${q.boss ? '!' : ''}`;
    const g = map.get(key);
    if (g) g.count += q.count;
    else map.set(key, { pet: q.pet, count: q.count, boss: !!q.boss });
  }
  return [...map.values()].sort((a, b) => Number(b.boss) - Number(a.boss) || rungOf(b.pet) - rungOf(a.pet));
}

export class Matchmaking implements Overlay {
  readonly modal = true;
  private age = 0;
  private foundAt: number;
  private outAge = -1;
  private gone = false;
  private slammed = false;
  private nextTick = 0.05;
  private face: PetType = fpick(PET_TYPES);
  private faceAge = 0;
  private fx = new Fx();
  private theirs: Group[];
  private yours: Group[];

  /**
   * opp: the opponent findOpponent() picked; mine / myPower: the player's army and POWER; level: the player level.
   * onGo runs once, as the overlay lifts away: start the fight there.
   */
  constructor(
    private readonly opp: Opponent,
    mine: ArmySpec,
    private readonly myPower: number,
    private readonly level: number,
    private readonly onGo: () => void,
  ) {
    this.foundAt = frand(SEARCH_MIN, SEARCH_MAX);
    this.theirs = groupsOf(opp.army);
    this.yours = groupsOf(mine);
    music.set('search');
    sfx.play('whoosh');
  }

  get done() {
    return this.gone;
  }

  /** the phase, for the play-check script */
  get phase(): 'search' | 'found' | 'out' {
    return this.outAge >= 0 ? 'out' : this.age >= this.foundAt ? 'found' : 'search';
  }

  update(dt: number) {
    this.age += dt;
    this.fx.update(dt);
    if (this.age < this.foundAt) {
      // searching: a tick about twice a second, and the faces flick through the radar
      this.nextTick -= dt;
      if (this.nextTick <= 0) {
        this.nextTick = 0.45;
        sfx.play('search');
      }
      this.faceAge += dt;
      if (this.faceAge > 0.11) {
        this.faceAge = 0;
        let f = fpick(PET_TYPES);
        while (f === this.face) f = fpick(PET_TYPES);
        this.face = f;
      }
      return;
    }
    const f = this.age - this.foundAt;
    if (f - dt <= 0) {
      // FOUND
      sfx.play(this.opp.champion ? 'champion' : 'found');
      this.fx.flash('#ffffff', 0.25, 0.25);
    }
    if (!this.slammed && f >= VS_AT) {
      this.slammed = true;
      sfx.play('vsSlam');
      this.fx.shake(9, 0.35);
      this.fx.ring(VS.x, VS.y, UI.rewardLight, VS.r * 0.6, VS.r * 3.2, 0.45);
      this.fx.burst(VS.x, VS.y, { colors: [UI.reward, UI.rewardLight, '#ffffff', TEAM[0].light, TEAM[1].light], n: 26, speed: 420, size: 7, life: 0.7, gravity: 260, shape: 'star', drag: 1.4 });
    }
    if (this.outAge < 0 && f >= HOLD) this.go();
    if (this.outAge >= 0) {
      this.outAge += dt;
      if (this.outAge >= OUT) this.gone = true;
    }
  }

  private go() {
    if (this.outAge >= 0) return;
    this.outAge = 0;
    sfx.play('whoosh');
    this.onGo();
  }

  up() {
    if (this.age - this.foundAt >= TAP_AFTER) this.go();
  }

  render(ctx: Ctx, t: number) {
    const out = this.outAge >= 0 ? easeInOutCubic(clamp(this.outAge / OUT, 0, 1)) : 0;
    const a = clamp(this.age / 0.22, 0, 1) * (1 - out);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    // the deep base, lit in the middle
    const g = ctx.createRadialGradient(W / 2, RADAR.y, 30, W / 2, RADAR.y, H * 0.75);
    g.addColorStop(0, '#3d2f7a');
    g.addColorStop(0.55, '#251c50');
    g.addColorStop(1, '#140f2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this.drawSparkles(ctx, t);
    ctx.translate(this.fx.camera.x, this.fx.camera.y);
    if (this.age < this.foundAt) this.drawSearch(ctx, t);
    else this.drawFound(ctx, t, out);
    this.fx.drawOver(ctx);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 1 - out;
    this.fx.drawScreen(ctx);
    ctx.restore();
  }

  /** soft drifting specks of light on the base */
  private drawSparkles(ctx: Ctx, t: number) {
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const x = (i * 97.3 + t * (8 + (i % 5) * 3)) % W;
      const y = (i * 211.7 + t * (14 + (i % 7) * 4)) % H;
      ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 2 + i);
      ctx.fillStyle = i % 3 ? '#b9a8ff' : '#ffe7a8';
      ctx.beginPath();
      ctx.arc(x, H - y, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSearch(ctx: Ctx, t: number) {
    const { x, y } = RADAR;
    // rings pulsing out
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.7 + i / 3) % 1;
      ctx.save();
      ctx.globalAlpha *= (1 - u) * 0.75;
      ctx.lineWidth = 4;
      ctx.strokeStyle = i % 2 ? '#8ef08c' : '#b9a8ff';
      ctx.beginPath();
      ctx.arc(x, y, 70 + u * 190, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // the radar disc and its sweep
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 150, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 22, 66, 0.85)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(160, 140, 255, 0.5)';
    ctx.stroke();
    for (const r of [50, 100]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(160, 140, 255, 0.25)';
      ctx.stroke();
    }
    ctx.clip();
    const sweep = t * 3.2;
    for (let k = 0; k < 14; k++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, 150, sweep - (k + 1) * 0.06, sweep - k * 0.06);
      ctx.closePath();
      ctx.fillStyle = `rgba(120, 230, 120, ${(0.32 * (1 - k / 14)).toFixed(3)})`;
      ctx.fill();
    }
    // blips where the sweep passed
    for (let i = 0; i < 6; i++) {
      const ang = i * 2.1 + 0.6;
      const rad = 40 + ((i * 37) % 100);
      const since = (((sweep - ang) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const b = Math.max(0, 1 - since / 2.2);
      if (b <= 0) continue;
      ctx.globalAlpha = b;
      ctx.fillStyle = '#c9ffbf';
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // a face flicking in the middle: the search looking through the cast
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 58, 0, Math.PI * 2);
    ctx.fillStyle = '#4a3d8a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.clip();
    drawUnit(ctx, this.face, x, y + 40, 30, t, { team: 1, mood: 'angry', face: -1 });
    ctx.restore();
    const dots = '.'.repeat(1 + (Math.floor(t * 3) % 3));
    // the word stays put while its dots come and go
    const x0 = W / 2 - textWidth(ctx, 'SEARCHING...', TYPE.title, 700, 3) / 2;
    dropLabel(ctx, `SEARCHING${dots}`, x0, 250, TYPE.title, W - 40, { align: 'left', drop: 'rgba(10, 6, 30, 0.8)', track: 3 });
    label(ctx, 'Finding an opponent of your power', W / 2, 300, TYPE.lead, { color: UI.hiDim, weight: 700 });
    // your POWER, under the radar
    const py = 760;
    const s = `${formatPower(this.myPower)}`;
    const w = textWidth(ctx, s, TYPE.h2, 700, 1) + 130;
    rr(ctx, W / 2 - w / 2, py - 26, w, 52, 26);
    ctx.fillStyle = 'rgba(16, 10, 40, 0.6)';
    ctx.fill();
    bolt(ctx, W / 2 - w / 2 + 28, py, 26, UI.reward);
    label(ctx, 'POWER', W / 2 - w / 2 + 48, py + 1, TYPE.small, { align: 'left', color: UI.hiDim, weight: 700, track: 2 });
    label(ctx, s, W / 2 - w / 2 + 108, py + 1, TYPE.h2, { align: 'left', color: UI.hi, weight: 700, track: 1 });
  }

  private drawFound(ctx: Ctx, t: number, out: number) {
    const f = this.age - this.foundAt;
    const k = easeOutBack(clamp(f / SLIDE, 0, 1));
    const lift = out * 60;
    this.drawCard(ctx, { ...THEIRS, y: THEIRS.y - (1 - k) * 420 - lift }, 1, t);
    this.drawCard(ctx, { ...YOURS, y: YOURS.y + (1 - k) * 420 + lift }, 0, t);
    // the VS badge slams in from big
    const v = clamp((f - VS_AT + 0.12) / 0.12, 0, 1);
    if (v > 0) {
      const sc = f < VS_AT ? 3 - 2 * easeOutCubic(v) : 1 + 0.18 * Math.exp(-(f - VS_AT) * 9) * Math.cos((f - VS_AT) * 26);
      ctx.save();
      ctx.globalAlpha *= v;
      ctx.translate(VS.x, VS.y);
      ctx.scale(sc, sc);
      ctx.beginPath();
      ctx.arc(0, 6, VS.r, 0, Math.PI * 2);
      ctx.fillStyle = '#7a4f0c';
      ctx.fill();
      const g = ctx.createLinearGradient(0, -VS.r, 0, VS.r);
      g.addColorStop(0, '#ffe08a');
      g.addColorStop(1, '#f0a92e');
      ctx.beginPath();
      ctx.arc(0, 0, VS.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      dropLabel(ctx, 'VS', 0, 2, TYPE.title, VS.r * 1.7, { drop: 'rgba(130, 70, 0, 0.9)', track: 2 });
      ctx.restore();
    }
    if (f > TAP_AFTER && out === 0) {
      ctx.save();
      ctx.globalAlpha *= 0.55 + 0.35 * Math.sin(t * 4);
      label(ctx, 'TAP TO FIGHT', W / 2, YOURS.y + YOURS.h + 50, TYPE.lead, { color: UI.hi, weight: 700, track: 3 });
      ctx.restore();
    }
  }

  /** One corner's card: a header in its corner colour (gold for a champion), the name, the theme, POWER and the army. */
  private drawCard(ctx: Ctx, r: Rect, team: 0 | 1, t: number) {
    const opp = this.opp;
    const champ = team === 1 && opp.champion;
    const tc = TEAM[team];
    const rad = 22;
    // the body: a deep plate with a chunky side
    rr(ctx, r.x, r.y + 8, r.w, r.h, rad);
    ctx.fillStyle = '#120d2a';
    ctx.fill();
    const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    bg.addColorStop(0, '#463a86');
    bg.addColorStop(1, '#30276a');
    rr(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = champ ? UI.reward : tc.main;
    ctx.stroke();
    // the header band
    const hh = 92;
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.clip();
    const hg = ctx.createLinearGradient(0, r.y, 0, r.y + hh);
    if (champ) {
      hg.addColorStop(0, '#ffd56a');
      hg.addColorStop(1, '#e79a24');
    } else {
      hg.addColorStop(0, tc.light);
      hg.addColorStop(0.15, tc.main);
      hg.addColorStop(1, tc.dark);
    }
    ctx.fillStyle = hg;
    ctx.fillRect(r.x, r.y, r.w, hh);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(r.x, r.y + 3, r.w, 2);
    ctx.restore();
    const drop = champ ? 'rgba(130, 70, 0, 0.85)' : 'rgba(10, 6, 30, 0.6)';
    const nameX = r.x + 22;
    const name = team === 1 ? opp.name.toUpperCase() : 'YOU';
    const powerW = 150;
    const room = r.w - 44 - powerW - (team === 1 ? 64 : 0);
    let nx = nameX;
    if (champ) {
      crown(ctx, nameX + 18, r.y + 34, 34, '#ffffff');
      nx += 42;
    }
    dropLabel(ctx, name, nx, r.y + 34, TYPE.h1, room - (nx - nameX), { align: 'left', drop, track: 1.5 });
    const nw = Math.min(room - (nx - nameX), textWidth(ctx, name, TYPE.h1, 700, 1.5));
    if (team === 1) {
      // the BOT tag: bots are always clearly AI
      const bx = nx + nw + 10;
      rr(ctx, bx, r.y + 22, 46, 24, 7);
      ctx.fillStyle = 'rgba(16, 10, 40, 0.75)';
      ctx.fill();
      label(ctx, 'BOT', bx + 23, r.y + 35, TYPE.tag, { color: '#ffffff', weight: 700, track: 1.5 });
    }
    const sub = team === 1 ? (champ ? 'CHAMPION MATCH  ·  x2 REWARDS' : `${opp.theme.name.toUpperCase()}  ·  ${opp.theme.blurb}`) : `BLUE CORNER  ·  LEVEL ${this.level}`;
    fitLabel(ctx, sub, nameX, r.y + 70, TYPE.body, r.w - 44 - powerW, { align: 'left', color: 'rgba(255, 255, 255, 0.92)', weight: 700, track: 1 });
    // POWER, on a dark chip at the right of the header
    const pr = { x: r.x + r.w - powerW - 16, y: r.y + 22, w: powerW, h: 50 };
    rr(ctx, pr.x, pr.y, pr.w, pr.h, 14);
    ctx.fillStyle = 'rgba(16, 10, 40, 0.55)';
    ctx.fill();
    bolt(ctx, pr.x + 24, pr.y + pr.h / 2, 26, UI.reward);
    label(ctx, 'POWER', pr.x + 44, pr.y + 15, TYPE.tiny, { align: 'left', color: 'rgba(255, 255, 255, 0.75)', weight: 700, track: 2 });
    fitLabel(ctx, formatPower(team === 1 ? opp.power : this.myPower), pr.x + 44, pr.y + 34, TYPE.h3, pr.w - 54, { align: 'left', color: '#ffffff', weight: 700, track: 0.5 });
    // the army, as portraits
    this.drawArmy(ctx, team === 1 ? this.theirs : this.yours, { x: r.x + 14, y: r.y + hh + 14, w: r.w - 28, h: r.h - hh - 28 }, team, t);
  }

  private drawArmy(ctx: Ctx, groups: Group[], r: Rect, team: 0 | 1, t: number) {
    const n = groups.length;
    if (!n) {
      label(ctx, 'NO FIGHTERS', r.x + r.w / 2, r.y + r.h / 2, TYPE.lead, { color: UI.hiMute, weight: 700, track: 2 });
      return;
    }
    const perRow = n <= 5 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / perRow);
    const gap = 8;
    const cw = Math.min(92, (r.w - gap * (perRow - 1)) / perRow);
    const ch = Math.min(rows === 1 ? 150 : 92, (r.h - gap * (rows - 1)) / rows);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const x0 = r.x + (r.w - (inRow * cw + (inRow - 1) * gap)) / 2;
      const col = i - row * perRow;
      const cr = { x: x0 + col * (cw + gap), y: r.y + (r.h - (rows * ch + (rows - 1) * gap)) / 2 + row * (ch + gap), w: cw, h: ch };
      this.portrait(ctx, groups[i], cr, team, t + i * 0.6);
    }
  }

  /** a unit's portrait card: tinted by its rarity, the unit standing in it, ×n in the corner; a boss gets a crown */
  private portrait(ctx: Ctx, g: Group, r: Rect, team: 0 | 1, t: number) {
    const ri = tierOf(rungOf(g.pet)) - 1;
    rr(ctx, r.x, r.y + 4, r.w, r.h, 12);
    ctx.fillStyle = 'rgba(10, 6, 30, 0.55)';
    ctx.fill();
    const cg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    cg.addColorStop(0, RARITY.light[ri]);
    cg.addColorStop(1, RARITY.main[ri]);
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.lineWidth = g.boss ? 4 : 2.5;
    ctx.strokeStyle = g.boss ? UI.reward : 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();
    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.clip();
    const u = Math.min(r.w, r.h);
    drawUnit(ctx, g.pet, r.x + r.w / 2, r.y + r.h - u * 0.14, u * (g.boss ? 0.3 : 0.27), t, { team, boss: g.boss, mood: team === 1 ? 'angry' : 'idle', face: team === 1 ? -1 : 1 });
    ctx.restore();
    if (g.boss) crown(ctx, r.x + r.w / 2, r.y - 2, 30);
    if (g.count > 1) countBadge(ctx, g.count, r.x + r.w - 18, r.y + r.h - 14, 0.95);
  }
}
