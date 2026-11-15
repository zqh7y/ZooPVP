import { sfx } from '../src/audio/engine';
import { ARENA } from '../src/data';
import { Arena } from '../src/draw/arena';
import { FOCUS_HOME, fitHeight, screenX, screenY, setFocus, setView, viewScale, type ViewRect } from '../src/draw/camera';
import { DEATH_KINDS, DEATH_PAYOFF, Deaths } from '../src/draw/deaths';
import { Fx } from '../src/draw/fx';
import type { PetLook } from '../src/draw/petTypes';
import { findOpponent } from '../src/logic/match';
import { newSave } from '../src/logic/save';
import type { App } from '../src/screen';
import { BattleView, type WaveSetup } from '../src/screens/battle';
import { COLOR, H, TYPE, UI, W } from '../src/theme';
import type { ArmySpec, DeathKind, PetType, SquadSpec, WeaponType } from '../src/types';
import { easeInOutCubic, label, lerp, rr } from '../src/util';
import { param, paramNum, params, stage } from './harness';

/*
 * The battle view on its own, in the rectangles the main screen gives it.
 *   ?preset=zoo|small|match|big &seed=7   which fight: zoo = all 12 units vs a CHAMPION team led by a crowned boss
 *                                         (a Snapper), with combos; small = a few low rungs; match = the bot
 *                                         findOpponent builds for the zoo army (&matches=4: the 5th is a champion);
 *                                         big = about 60 fighters (with &bench=1, the cost per frame)
 *   ?until=combo|ko|end  &after=0.3       fast-forward to the first combo call / knock-out / the end clock (&endt=0.4)
 *   ?until=glob&k=0.5                     ... to a Scorp glob that far through its flight
 *   ?view=wave|prep  &ph=360             the tall WAVE view (default) or the short PREP band (showPrep only), ph tall
 *   ?at=12.5                              fast-forward the fight to that second, then freeze
 *   ?at=999&after=0.3                     ... or to the end, then that much longer
 *   ?intro=0.6                            freeze that long after start() (the line-up popping in)
 *   ?secs=2                               (prep) freeze that long after showPrep
 *   ?grow=1                               animate the view from PREP to WAVE as the wave starts, and back after
 *   ?death=all|pop&t=0.4                  the death kinds of a Sprout and a Boulder at that moment
 *   ?bench=1                              run the whole fight drawing every frame and report the cost per frame
 *   ?fx=confetti|drizzle|none&t=0.3       the shared effects the other screens use, at that moment
 */

const dpr = Math.max(1, window.devicePixelRatio || 1);
const arena = new Arena();
/** the main screen's two rectangles (top bar above, grid below) */
const TOP = 96;
const PREP: ViewRect = { x: 0, y: TOP, w: W, h: paramNum('ph', 360) };
const WAVE: ViewRect = { x: 0, y: TOP, w: W, h: Math.min(Math.round(fitHeight(W)), H - TOP - 120) };
setView(param('view', 'wave') === 'prep' ? PREP : WAVE);
setFocus(FOCUS_HOME);
arena.build(dpr);

let key = 1;
const sq = (pet: PetType, count: number, weapon: WeaponType | null = null, wl = 0, helmet = 0, sneakers = 0, chili = 0, boss = false): SquadSpec =>
  ({ key: key++, pet, count, weapon, weaponLevel: weapon ? Math.max(1, wl) : 0, helmet, sneakers, chili, ...(boss ? { boss } : {}) });

/** one squad of every unit, a few with weapons and gear */
const ZOO: ArmySpec = {
  squads: [
    sq('sprout', 4, 'knife', 2), sq('buzzy', 2), sq('ninja', 2, 'knife', 2), sq('snailor', 2, 'shield', 2), sq('roo', 2), sq('cacto', 1),
    sq('pogo', 1), sq('briar', 1), sq('angler', 1, null, 0, 2), sq('sumo', 1), sq('rhino', 1, null, 0, 0, 2), sq('boulder', 1, 'bat', 3, 3),
  ],
};
/** a champion team: a crowned Snapper leading a swarm of low rungs and a few hitters */
const ZOO_CHAMP: ArmySpec = {
  squads: [
    sq('angler', 1, null, 0, 0, 0, 0, true), sq('sprout', 4), sq('sprout', 4), sq('buzzy', 2), sq('ninja', 2), sq('snailor', 1), sq('roo', 2),
    sq('cacto', 1), sq('briar', 1), sq('sumo', 1),
  ],
};
const SMALL: [ArmySpec, ArmySpec] = [
  { squads: [sq('sprout', 4, 'knife', 1), sq('buzzy', 2), sq('roo', 1)] },
  { squads: [sq('sprout', 4), sq('ninja', 2), sq('snailor', 1, 'shield', 1)] },
];

/** about 60 fighters: the stress test (?preset=big&bench=1) */
const BIG: [ArmySpec, ArmySpec] = [
  { squads: [sq('sprout', 4), sq('sprout', 4), sq('sprout', 4), sq('buzzy', 4), sq('buzzy', 2), sq('ninja', 4), sq('roo', 2), sq('cacto', 2), sq('briar', 2), sq('sumo', 1), sq('boulder', 1)] },
  { squads: [sq('sprout', 4), sq('sprout', 4), sq('sprout', 4), sq('buzzy', 4), sq('ninja', 4), sq('snailor', 2), sq('roo', 2), sq('pogo', 2), sq('angler', 2), sq('rhino', 1), sq('boulder', 1)] },
];

function armies(): [ArmySpec, ArmySpec, string] {
  const p = param('preset', 'zoo');
  if (p === 'big') return [...BIG, 'Big Bot'];
  if (p === 'small') return [...SMALL, 'Peck Squad'];
  if (p === 'match' || p === 'wave') {
    const o = findOpponent({ ...newSave(paramNum('seed', 7)), matches: paramNum('matches', 4) }, paramNum('seed', 7), ZOO);
    return [ZOO, o.army, o.name];
  }
  return [ZOO, ZOO_CHAMP, 'King Knockout'];
}

/** a stand-in for the main screen's cash pill: the KO coins fly to it and bump it */
const PILL = { x: 14, y: 22, w: 118, h: 40 };

function battlePage() {
  const [mine, theirs, name] = armies();
  const app = { arena, ratio: dpr, t: 0 } as unknown as App;
  const view = new BattleView(app);
  const setup: WaveSetup = { player: mine, enemy: theirs, seed: paramNum('seed', 7), champion: theirs.squads.some((s) => s.boss), names: ['You', name] };
  let cash = 0;
  let bump = 0;
  view.coinTarget = { x: PILL.x + 22, y: PILL.y + PILL.h / 2 };
  view.onCoin = () => {
    cash += 5;
    bump = 1;
  };
  const until = param('until', '');
  const reached = () =>
    until === 'combo' ? view.debug.call !== ''
    : until === 'ko' ? view.debug.kos > 0
    : until === 'glob' ? view.debug.glob >= paramNum('k', 0.5)
    : until === 'end' ? view.debug.mode === 'over' || (view.debug.mode === 'end' && view.debug.endT >= paramNum('endt', 0))
    : false;
  const prepOnly = param('view', 'wave') === 'prep';
  const grow = params.has('grow');
  const at = params.has('at') ? Number(params.get('at')) : null;
  const bench = params.has('bench');
  let size = prepOnly || grow ? 0 : 1; // 0 = the PREP band, 1 = the WAVE view
  let started = false;
  let frozen = false;
  let report = '';
  view.showPrep(mine, theirs);
  const place = () => {
    const k = easeInOutCubic(size);
    setView({ x: 0, y: TOP, w: W, h: Math.round(lerp(PREP.h, WAVE.h, k)) });
  };
  const tick = (dt: number) => {
    arena.update(dt);
    if (!started && !prepOnly && (!grow || size >= 0.25)) {
      started = true;
      view.start(setup);
    }
    if (grow) size = view.phase() === 'over' ? Math.max(0, size - dt * 2) : Math.min(1, size + dt * 2);
    place();
    view.update(dt);
    bump = Math.max(0, bump - dt * 5);
  };
  place();
  stage({
    w: W, h: H, bg: UI.bg,
    onDown: () => sfx.unlock(),
    draw(ctx, _t, dt) {
      if (bench && !report) {
        let n = 0;
        let sum = 0;
        let worst = 0;
        let worstAt = 0;
        for (let i = 0; i < paramNum('frames', 6000) && view.phase() !== 'over'; i++) {
          const t0 = performance.now();
          tick(1 / 60);
          view.render(ctx);
          ctx.getImageData(0, 0, 1, 1);
          const ms = performance.now() - t0;
          if (view.time < 0) continue;
          n++;
          sum += ms;
          if (ms > worst) {
            worst = ms;
            worstAt = view.time;
          }
        }
        report = `${n} frames avg ${(sum / n).toFixed(2)} ms worst ${worst.toFixed(0)} at ${worstAt.toFixed(1)} s, marks ${view.marks}`;
        console.log(`BENCH ${report}`);
        frozen = true;
      } else if (prepOnly && params.has('secs') && !frozen) {
        for (let i = 0; i < Math.round(paramNum('secs', 0) * 60); i++) tick(1 / 60);
        frozen = true;
      } else if (params.has('intro') && !frozen) {
        for (let i = 0; i < Math.round(paramNum('intro', 0) * 60); i++) tick(1 / 60);
        frozen = true;
      } else if (until && !frozen) {
        for (let i = 0; i < 20000 && !reached() && view.phase() !== 'over'; i++) tick(1 / 60);
        for (let i = 0; i < Math.round(paramNum('after', 0) * 60); i++) tick(1 / 60);
        frozen = true;
      } else if (at !== null && !frozen) {
        for (let i = 0; i < 20000 && view.time < at && view.phase() !== 'over'; i++) tick(1 / 60);
        for (let i = 0; i < Math.round(paramNum('after', 0) * 60); i++) tick(1 / 60);
        frozen = true;
      } else if (!frozen) tick(dt);
      view.render(ctx);
      // the stand-in cash pill the coins fly to
      const s = 1 + 0.12 * bump;
      ctx.save();
      ctx.translate(PILL.x + PILL.w / 2, PILL.y + PILL.h / 2);
      ctx.scale(s, s);
      rr(ctx, -PILL.w / 2, -PILL.h / 2, PILL.w, PILL.h, PILL.h / 2);
      ctx.fillStyle = '#2b2440';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-PILL.w / 2 + 22, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd84a';
      ctx.fill();
      label(ctx, String(cash), 14, 1, TYPE.h3, { color: '#ffffff', weight: 700 });
      ctx.restore();
      // what the main screen's HUD would read
      const l = view.live;
      const out = view.outcome();
      const y = TOP + WAVE.h + 30;
      label(ctx, `${view.phase().toUpperCase()}   t ${l.time.toFixed(1)} s   kills ${l.kills}   losses ${l.losses}   ${l.mine} v ${l.theirs}`, W / 2, y, TYPE.body, { color: UI.text, weight: 700 });
      if (out) label(ctx, `${out.won ? 'WON' : out.draw ? 'DRAW' : 'LOST'} in ${out.time.toFixed(1)} s, survived ${(out.survived * 100).toFixed(0)}%, boss ${out.boss ? 'down' : 'standing'}, MVP ${out.mvp ? `${out.mvp.pet} ${out.mvp.kos} KO` : '-'}, crits ${out.crits}`, W / 2, y + 28, TYPE.small, { color: UI.textDim });
      if (report) label(ctx, report, W / 2, y + 54, TYPE.small, { color: COLOR.textDim });
    },
  });
}

const look = (pet: PetType, team: 0 | 1, weapon: WeaponType | null): PetLook =>
  ({ pet, level: 1, team, weapon, weaponLevel: weapon ? 2 : 0, helmet: 0, sneakers: 0, chili: 0, seed: pet === 'sprout' ? 1.3 : 4.1 });

function deathPage(which: string) {
  const fx = new Fx();
  const deaths = new Deaths(fx, dpr);
  const kinds = which === 'all' ? DEATH_KINDS : [which as DeathKind];
  const past = paramNum('t', 0.03);
  const when = (k: DeathKind) => (which === 'all' ? DEATH_PAYOFF[k] + past : past);
  const cell = (i: number) => (which === 'all' ? { x: ARENA.w * (0.27 + 0.46 * (i % 2)), y: 110 + 190 * Math.floor(i / 2) } : { x: ARENA.w / 2, y: ARENA.h / 2 });
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
        deaths.start(look('sprout', 0, 'knife'), 18, c.x - 52, c.y, 1, hit, k);
        deaths.start(look('boulder', 1, null), 34, c.x + 44, c.y, -1, { ...hit, dir: Math.PI + 0.5 }, k);
      });
      if (s < Math.round(longest * 60)) {
        fx.update(1 / 60);
        deaths.update(1 / 60);
      }
    }
  };
  stage({
    w: W, h: H, bg: UI.bg,
    draw(ctx, t) {
      if (!done) {
        run();
        done = true;
      }
      arena.drawBack(ctx, t);
      // the same arena transform the battle view uses
      const K = viewScale();
      ctx.save();
      ctx.translate(screenX(0), screenY(0));
      ctx.scale(K, K);
      fx.ground.draw(ctx);
      fx.drawUnder(ctx);
      deaths.drawUnder(ctx);
      deaths.drawOver(ctx);
      fx.drawOver(ctx);
      kinds.forEach((k, i) => label(ctx, `${k} ${when(k).toFixed(2)}s`, cell(i).x, cell(i).y + 24, TYPE.small, { onPitch: true }));
      ctx.restore();
      fx.drawScreen(ctx);
    },
  });
}

function fxPage(rain: string) {
  const fx = new Fx();
  let done = false;
  const levels = [1, 4, 5, 7];
  stage({
    w: W, h: H, bg: UI.bg,
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
      arena.drawBack(ctx, t);
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
