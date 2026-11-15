import { stage, param, paramNum, params } from './harness';
import { W, H } from '../src/theme';
import { Arena } from '../src/draw/arena';
import { Inventory } from '../src/logic/inventory';
import { newSave } from '../src/logic/save';
import { rollOnce } from '../src/logic/rolls';
import { hashSeed, makeRng } from '../src/rng';
import { TUTORIAL_DONE } from '../src/data';
import type { Piece, PieceType, SaveState } from '../src/types';
import type { App, Screen, ScreenName } from '../src/screen';
import { createLobby, benchSlotRect, CELL, GRID_RECT } from '../src/screens/lobby';
import { createRoll } from '../src/screens/roll';
import { createMatch } from '../src/screens/match';
import { createResult } from '../src/screens/result';
import { makeOpponent } from '../src/logic/bots';
import type { SimSummary } from '../src/sim/types';

// ?save=rich  ?screen=roll&t=2.5&prize=6  ?screen=match&t=3.4  ?screen=result&t=4&won=1  ?drag=1  ?tut=3

function richSave(): SaveState {
  const s = newSave(7);
  s.name = 'Momo';
  s.trophies = 640;
  s.bestTrophies = 640;
  s.rolls = 5;
  s.rolled = 12;
  s.matches = 20;
  s.claimed = 12;
  s.tutorial = TUTORIAL_DONE;
  // a 5 x 5 grid with pets covering 1, 2 and 4 cells (a 2 x 2 frog squad, a lying and a standing pair) and their items
  const g: [PieceType, number, number, number, number, boolean?][] = [
    // type, level, count, col, row, turned
    ['frog', 6, 4, 0, 0], ['bat', 5, 1, 2, 0], ['chili', 4, 1, 2, 1],
    ['ant', 4, 2, 3, 0], ['helmet', 2, 1, 3, 1], ['knife', 4, 1, 4, 1],
    ['spear', 6, 1, 0, 2], ['shield', 3, 1, 3, 2], ['frog', 5, 2, 4, 2, true],
    ['ant', 7, 1, 0, 3], ['ant', 1, 4, 1, 3], ['helmet', 5, 1, 3, 3],
    ['sneakers', 3, 1, 0, 4], ['knife', 2, 1, 3, 4],
  ];
  const b: [PieceType, number, number][] = [['frog', 3, 1], ['ant', 2, 2], ['knife', 4, 1], ['frog', 2, 4], ['helmet', 7, 1]];
  let id = 1;
  const pieces: Piece[] = [];
  for (const [type, level, count, col, row, turned] of g) pieces.push({ id: id++, type, level, count, col, row, slot: -1, ...(turned ? { turned } : {}) });
  b.forEach(([type, level, count], slot) => pieces.push({ id: id++, type, level, count, col: -1, row: -1, slot }));
  s.pieces = pieces;
  s.nextId = id;
  return s;
}

const state = param('save') === 'rich' ? richSave() : newSave();
if (params.has('tut')) state.tutorial = paramNum('tut', 0);
// pick a seed whose next roll gives the asked class
if (params.has('prize')) {
  const want = paramNum('prize', 6);
  if (state.rolled < 3) state.rolled = 3;
  for (let seed = 1; seed < 20000; seed++) {
    const c = structuredClone(state);
    if (rollOnce(c, makeRng(hashSeed(seed, c.rolled)))?.level === want) {
      state.seed = seed;
      break;
    }
  }
}

const arena = new Arena();
arena.build(Math.max(1, window.devicePixelRatio || 1));
let current!: Screen;
const screens: Partial<Record<ScreenName, Screen>> = {};
const app: App = {
  state,
  inv: new Inventory(state),
  arena,
  t: 0,
  ratio: Math.max(1, window.devicePixelRatio || 1),
  match: null,
  go(to) {
    current?.leave?.();
    if (to === 'battle') to = 'lobby';
    if (to === 'match' && param('screen') !== 'match') {
      console.log('go match');
      state.matches += 1; // pretend the first match was played
      to = 'lobby';
    }
    current = screens[to] ?? screens.lobby!;
    current.enter?.();
  },
  save() {
    (window as unknown as { saved: number }).saved = ((window as unknown as { saved: number }).saved ?? 0) + 1;
  },
};
screens.lobby = createLobby(app);
screens.roll = createRoll(app);
screens.match = createMatch(app);
screens.result = createResult(app);
(window as unknown as { app: App }).app = app;
if (param('screen') === 'result') {
  // a finished match, so the result screen has something to show
  const won = param('won') !== '0';
  const opponent = makeOpponent(state, makeRng(hashSeed(state.seed, 5)));
  app.match = {
    opponent,
    army: app.inv.army(),
    summary: {} as SimSummary,
    result: { won, trophies: won ? 28 : -14, kills: won ? 9 : 4, losses: won ? 2 : 6, rolls: won ? 3 : 1, time: 47, leagueUp: -1 },
  };
}
const first = param('screen');
app.go(first === 'roll' || first === 'match' || first === 'result' ? first : 'lobby');

// run the screen up to ?t so effects exist at the frozen moment
const upTo = paramNum('t', 0);
for (let k = 0; k < upTo * 60; k++) current.update(1 / 60);

// ?drag=1: the bench pair held over the two free cells in the middle (the whole footprint previews);
// ?drag=2: the first bench piece that fuses with a grid piece, held over it
if (params.has('drag')) {
  const pieces = app.inv.pieces;
  const mode = paramNum('drag', 1);
  const pair = pieces.find((p) => p.slot >= 0 && p.count === 2);
  const fuse = pieces.flatMap((a) => pieces.filter((b) => a.slot >= 0 && b.slot < 0 && app.inv.canFuse(a, b)).map((b) => [a, b] as const))[0];
  const held = mode === 1 ? pair : fuse?.[0];
  const over = mode === 1 ? { x: GRID_RECT.x + 2 * CELL, y: GRID_RECT.y + 2.5 * CELL } : fuse ? { x: GRID_RECT.x + (fuse[1].col + 0.5) * CELL, y: GRID_RECT.y + (fuse[1].row + 0.5) * CELL } : null;
  if (held && over) {
    const from = benchSlotRect(held.slot);
    current.pointerDown?.(from.x + CELL / 2, from.y + CELL / 2);
    current.pointerMove?.(over.x + 4, over.y + 30);
  }
}

stage({
  w: W,
  h: H,
  bg: '#000',
  draw(ctx, _t, dt) {
    arena.update(dt);
    current.update(dt);
    current.render(ctx);
  },
  onDown: (x, y) => current.pointerDown?.(x, y),
  onMove: (x, y) => current.pointerMove?.(x, y),
  onUp: (x, y) => current.pointerUp?.(x, y),
});
