import { sfx } from '../src/audio/engine';
import { Arena } from '../src/draw/arena';
import { DEATH_KINDS, DEATH_PAYOFF, Deaths } from '../src/draw/deaths';
import { Fx } from '../src/draw/fx';
import type { PetLook } from '../src/draw/petTypes';
import type { Inventory } from '../src/logic/inventory';
import { newSave } from '../src/logic/save';
import type { App, Match, ScreenName } from '../src/screen';
import { createBattleScreen } from '../src/screens/battle';
import { ARENA } from '../src/data';
import { project } from '../src/draw/camera';
import { COLOR, H, TYPE, W } from '../src/theme';
import type { ArmySpec, DeathKind, PetType, SquadSpec, WeaponType } from '../src/types';
import { label } from '../src/util';
import { param, paramNum, params, stage } from './harness';

/*
 * The battle screen on its own.
 *   ?preset=small|mid|big|long  &seed=7     which fight
 *   ?at=7.5                            fast-forward to that second of the fight, then freeze
 *   ?at=999&after=0.2                  ... or to that long after the fight is decided
 *   ?secs=0.8                          freeze that long after the screen opens (the squads popping in)
 *   ?death=pop&t=0.4                   one death of an ant and of a frog at that moment (death=all: every
 *                                      kind, t seconds past its pay-off frame)
 *   ?bench=1                           run the whole fight as fast as it goes and show the cost per frame
 *   ?fx=confetti|drizzle|none&t=0.3    the shared effects the other screens use, at that moment
 */

const dpr = Math.max(1, window.devicePixelRatio || 1);
const arena = new Arena();
arena.build(dpr);

const sq = (pet: PetType, level: number, count: number, weapon: WeaponType | null = null, weaponLevel = 0, helmet = 0, sneakers = 0, chili = 0): SquadSpec =>
  ({ key: 0, pet, level, count, weapon, weaponLevel: weapon ? Math.max(1, weaponLevel) : 0, helmet, sneakers, chili });

const PRESETS: Record<string, [SquadSpec[], SquadSpec[]]> = {
  small: [
    [sq('ant', 1, 2, 'knife', 1), sq('frog', 1, 1, 'bat', 1)],
    [sq('ant', 1, 2, 'spear', 1), sq('frog', 1, 1)],
  ],
  // tough and toothless: it goes to overtime
  long: [
    [sq('frog', 4, 2, 'shield', 4, 5), sq('frog', 3, 1, 'shield', 3, 4)],
    [sq('frog', 4, 2, 'shield', 4, 5), sq('frog', 3, 2, 'shield', 3, 4)],
  ],
  // nobody can hurt anybody: the clock decides
  wall: [[sq('frog', 7, 1, 'shield', 7, 7)], [sq('frog', 7, 1, 'shield', 7, 7)]],
  mid: [
    [sq('ant', 2, 8, 'knife', 2), sq('frog', 2, 2, 'bat', 2), sq('ant', 1, 4, 'spear', 2), sq('frog', 3, 1, 'shield', 2, 2), sq('ant', 1, 8)],
    [sq('ant', 2, 8), sq('frog', 2, 2, 'bat', 2, 0, 1), sq('ant', 2, 4, 'knife', 2), sq('frog', 2, 2, 'spear', 1), sq('frog', 1, 1, 'shield', 1), sq('ant', 1, 4, 'bat', 1)],
  ],
  big: [
    [
      sq('ant', 3, 8, 'knife', 3), sq('ant', 2, 8, 'spear', 3), sq('ant', 2, 8, 'bat', 2), sq('ant', 1, 8), sq('frog', 3, 8, 'bat', 3), sq('frog', 2, 4, 'shield', 3, 2),
      sq('frog', 2, 8), sq('ant', 4, 8, 'knife', 4, 0, 3), sq('frog', 4, 4, 'spear', 3), sq('ant', 2, 8, 'shield', 2), sq('ant', 5, 4, 'bat', 5, 3, 0, 4), sq('frog', 6, 2, 'knife', 5, 4, 3, 3),
    ],
    [
      sq('ant', 3, 8, 'spear', 3), sq('ant', 2, 8, 'knife', 3), sq('ant', 3, 8, 'bat', 2), sq('ant', 2, 8), sq('frog', 3, 8), sq('frog', 3, 4, 'bat', 4, 2),
      sq('frog', 2, 8, 'knife', 2), sq('ant', 4, 8, 'shield', 3), sq('frog', 4, 4, 'shield', 3), sq('ant', 2, 8, 'bat', 3), sq('ant', 5, 4, 'spear', 5, 3, 3), sq('frog', 7, 1, 'bat', 6, 5, 4, 5),
    ],
  ],
};

const look = (pet: PetType, team: 0 | 1, weapon: WeaponType | null): PetLook =>
  ({ pet, level: 2, team, weapon, weaponLevel: weapon ? 2 : 0, helmet: 0, sneakers: 0, chili: 0, seed: pet === 'ant' ? 1.3 : 4.1 });

function deathPage(which: string) {
  const fx = new Fx();
  const deaths = new Deaths(fx, dpr);
  const kinds = which === 'all' ? DEATH_KINDS : [which as DeathKind];
  const past = paramNum('t', 0.03);
  const when = (k: DeathKind) => (which === 'all' ? DEATH_PAYOFF[k] + past : past);
  // arena points: the camera puts them on screen, farther ones smaller
  const cell = (i: number) => (which === 'all' ? { x: ARENA.w * (0.27 + 0.46 * (i % 2)), y: 120 + 190 * Math.floor(i / 2) } : { x: ARENA.w / 2, y: ARENA.h / 2 });
  const longest = Math.max(...kinds.map(when));
  let done = false;
  const run = () => {
    const started = new Set<number>();
    for (let s = 0; s <= Math.round(longest * 60); s++) {
      kinds.forEach((k, i) => {
        if (started.has(i) || longest - s / 60 > when(k) + 1e-6) return;
        started.add(i);
        const c = cell(i);
        const hit = { weapon: null, dir: -0.5, power: 0.9 };
        deaths.start(look('ant', 0, 'knife'), 10, c.x - 52, c.y, 1, hit, k);
        deaths.start(look('frog', 1, 'bat'), 16, c.x + 40, c.y, -1, { ...hit, dir: Math.PI + 0.5 }, k);
      });
      if (s < Math.round(longest * 60)) {
        fx.update(1 / 60);
        deaths.update(1 / 60);
      }
    }
  };
  stage({
    w: W, h: H,
    draw(ctx, t) {
      if (!done) {
        run();
        done = true;
      }
      arena.drawBattle(ctx, t);
      fx.drawUnder(ctx);
      deaths.drawUnder(ctx);
      deaths.drawOver(ctx);
      fx.drawOver(ctx);
      fx.drawScreen(ctx);
      kinds.forEach((k, i) => {
        const p = project(cell(i).x, cell(i).y);
        label(ctx, `${k} ${when(k).toFixed(2)}s`, p.x, p.y + 22, TYPE.small, { onPitch: true });
      });
    },
  });
}

function battlePage() {
  const [mine, theirs] = PRESETS[param('preset', 'mid')] ?? PRESETS.mid;
  const army: ArmySpec = { squads: mine };
  const state = newSave();
  state.trophies = 128;
  state.rollMeter = 0.3;
  const match: Match = { opponent: { name: 'MochiKing', trophies: 141, army: { squads: theirs }, power: 0, seed: paramNum('seed', 7) }, army, summary: null, result: null };
  let clock = 0;
  let went: ScreenName | null = null;
  const app: App = {
    state, inv: null as unknown as Inventory, arena, ratio: dpr, match,
    get t() {
      return clock;
    },
    go(to) {
      went = to;
    },
    save() {},
  };
  const screen = createBattleScreen(app);
  screen.enter?.();
  const at = params.has('at') ? Number(params.get('at')) : null;
  const bench = params.has('bench');
  let frozen = false;
  let report = '';
  const tick = (dt: number) => {
    clock += dt;
    arena.update(dt);
    screen.update(dt);
  };
  stage({
    w: W, h: H,
    onDown: () => sfx.unlock(),
    draw(ctx, _t, dt) {
      if (bench && !report) {
        // the whole fight, drawn every frame, with a one-pixel read so the picture is really made
        let n = 0;
        let sum = 0;
        let worst = 0;
        let sim = 0;
        let worstAt = 0;
        let worstUpd = 0;
        const slow: string[] = [];
        let n5 = 0;
        let sum5 = 0;
        for (let i = 0; i < 6000 && !went; i++) {
          const t0 = performance.now();
          tick(1 / 60);
          const t1 = performance.now();
          screen.render(ctx);
          ctx.getImageData(0, 0, 1, 1);
          const ms = performance.now() - t0;
          if (screen.time < 0) continue;
          n++;
          sum += ms;
          sim += t1 - t0;
          if (ms > worst) {
            worst = ms;
            worstAt = screen.time;
            worstUpd = t1 - t0;
          }
          if (ms > 28) slow.push(`${screen.time.toFixed(1)}:${ms.toFixed(0)}/${(t1 - t0).toFixed(0)}`);
          if (screen.time < 5) {
            n5++;
            sum5 += ms;
          }
        }
        report = `${n} fr avg ${(sum / n).toFixed(2)} ms (update ${(sim / n).toFixed(2)}) first 5 s ${(sum5 / n5).toFixed(1)} worst ${worst.toFixed(0)} (upd ${worstUpd.toFixed(0)}) at ${worstAt.toFixed(1)} s`;
        console.log(`BENCH ${report} | slow frames (t:ms/update) ${slow.join(' ')}`);
        frozen = true;
      } else if (at !== null && !frozen) {
        for (let i = 0; i < 9000 && screen.time < at && !screen.over; i++) tick(1 / 60);
        if (screen.over) for (let i = 0; i < Math.round(paramNum('after', 0) * 60); i++) tick(1 / 60);
        frozen = true;
      } else if (params.has('secs') && !frozen) {
        for (let i = 0; i < Math.round(paramNum('secs', 0) * 60); i++) tick(1 / 60);
        frozen = true;
      } else if (!frozen) tick(dt);
      screen.render(ctx);
      if (report) label(ctx, report, W / 2, H - 60, TYPE.small, { color: COLOR.toast });
      if (went) label(ctx, `go('${went}')  ${match.summary ? `winner ${match.summary.winner} in ${match.summary.time.toFixed(1)} s` : ''}`, W / 2, H - 30, TYPE.small);
    },
  });
}

function fxPage(rain: string) {
  const fx = new Fx();
  let done = false;
  const levels = [1, 4, 5, 7];
  stage({
    w: W, h: H,
    draw(ctx, t) {
      if (!done) {
        done = true;
        levels.forEach((lv, i) => {
          fx.fuseBurst(90 + i * 120, 330, lv);
          fx.revealRays(90 + i * 120, 560, lv);
        });
        fx.linkSpark(150, 760);
        fx.word(300, 760, 'S-CLASS');
        fx.floatText(420, 760, '+30', COLOR.goldLight);
        if (rain === 'confetti') fx.confettiCannon(0);
        if (rain === 'drizzle') fx.sadDrizzle();
        for (let i = 0; i < Math.round(paramNum('t', 0.25) * 60); i++) fx.update(1 / 60);
      }
      arena.drawBattle(ctx, t);
      fx.drawUnder(ctx);
      fx.drawOver(ctx);
      fx.drawScreen(ctx);
      levels.forEach((lv, i) => label(ctx, `fuse / reveal ${lv}`, 90 + i * 120, 440, TYPE.small));
      label(ctx, `particles ${fx.load}`, W / 2, 820, TYPE.small);
    },
  });
}

if (params.has('fx')) fxPage(param('fx', 'none'));
else if (params.has('death')) deathPage(param('death', 'all'));
else battlePage();
