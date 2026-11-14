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

// ?save=rich  ?screen=roll&t=2.5&prize=6  ?drag=1  ?tut=3

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
  const g: [PieceType, number, number, number, number][] = [
    // type, level, count, col, row
    ['ant', 3, 4, 2, 2], ['knife', 4, 1, 1, 2], ['helmet', 3, 1, 2, 1], ['sneakers', 2, 1, 3, 2],
    ['frog', 5, 2, 5, 2], ['bat', 6, 1, 6, 2], ['chili', 5, 1, 5, 1], ['shield', 2, 1, 4, 2],
    ['ant', 6, 1, 2, 5], ['spear', 7, 1, 3, 5], ['helmet', 6, 1, 2, 6], ['knife', 2, 1, 1, 5],
    ['frog', 2, 8, 5, 5], ['sneakers', 4, 1, 5, 6], ['chili', 1, 1, 7, 7], ['knife', 2, 1, 6, 5],
  ];
  const b: [PieceType, number, number][] = [
    ['knife', 2, 1], ['ant', 1, 1], ['frog', 7, 1], ['bat', 3, 1], ['helmet', 1, 1], ['spear', 5, 1], ['chili', 4, 1], ['ant', 4, 2], ['shield', 6, 1],
  ];
  let id = 1;
  const pieces: Piece[] = [];
  for (const [type, level, count, col, row] of g) pieces.push({ id: id++, type, level, count, col, row, slot: -1 });
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
    if (to === 'match') {
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
(window as unknown as { app: App }).app = app;
app.go(param('screen') === 'roll' ? 'roll' : 'lobby');

// run the screen up to ?t so effects exist at the frozen moment
const upTo = paramNum('t', 0);
for (let k = 0; k < upTo * 60; k++) current.update(1 / 60);

if (param('drag') === '1') {
  const pieces = app.inv.pieces;
  const pair = pieces.flatMap((a) => pieces.filter((b) => a.slot >= 0 && b.slot < 0 && app.inv.canFuse(a, b)).map((b) => [a, b] as const))[0];
  if (pair) {
    const [a, b] = pair;
    const from = benchSlotRect(a.slot);
    current.pointerDown?.(from.x + CELL / 2, from.y + CELL / 2);
    current.pointerMove?.(GRID_RECT.x + b.col * CELL + CELL / 2 + 6, GRID_RECT.y + b.row * CELL + CELL / 2 + 26);
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
