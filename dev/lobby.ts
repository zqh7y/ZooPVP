import '../src/style.css';
import { createApp } from '../src/app';
import { fontReady } from '../src/boot';
import { START_OPEN, TUTORIAL_DONE, cellBit } from '../src/data';
import { newSave, SAVE_KEY } from '../src/logic/save';
import type { Piece, PieceType, SaveState } from '../src/types';
import { params, param, paramNum } from './harness';

/*
 * The real main screen with a chosen save, for screenshots:
 *   ?save=rich     a level-7 army with units covering 1, 2 and 4 cells, items, some cells bought and earned
 *   ?save=fresh    a new player (the guide)
 *   ?save=v4       a version-4 save (stage 4) as v4 wrote it: the game migrates it on boot
 *   ?level=5&xp=40&matches=4&streak=3&cash=500&gems=40&kos=90&tut=99   override fields of either
 *     (matches=4: the next match is a CHAMPION match)
 * The save is written to localStorage (zoopvp-save) and the game boots on it.
 */

function richSave(): SaveState {
  const s = newSave(7);
  s.tutorial = TUTORIAL_DONE;
  s.level = 7;
  s.xp = 80;
  s.matches = 38;
  s.wins = 27;
  s.streak = 2;
  s.bestStreak = 6;
  s.champs = 4;
  s.cash = 260;
  s.gems = 34;
  s.cases = 22;
  s.rolled = 26;
  s.kos = 120;
  s.open = START_OPEN | cellBit(0, 1) | cellBit(4, 2) | cellBit(1, 0) | cellBit(2, 0) | cellBit(3, 0) | cellBit(1, 4) | cellBit(2, 4);
  s.cellBuys = 2;
  const g: [PieceType, number, number, number, number, boolean?][] = [
    // type, level, count, col, row, turned
    ['ninja', 1, 4, 1, 1], ['knife', 3, 1, 3, 1], ['chili', 2, 1, 3, 2],
    ['snailor', 1, 2, 1, 3], ['shield', 2, 1, 3, 3], ['helmet', 3, 1, 0, 1],
    ['buzzy', 1, 2, 2, 0, false], ['spear', 4, 1, 1, 0], ['sneakers', 2, 1, 4, 2], ['roo', 1, 1, 2, 4], ['bat', 2, 1, 1, 4],
  ];
  const b: [PieceType, number, number][] = [['sprout', 1, 2], ['knife', 1, 1], ['cacto', 1, 1]];
  let id = 1;
  const pieces: Piece[] = [];
  for (const [type, level, count, col, row, turned] of g) pieces.push({ id: id++, type, level, count, col, row, slot: -1, ...(turned ? { turned } : {}) });
  b.forEach(([type, level, count], slot) => pieces.push({ id: id++, type, level, count, col: -1, row: -1, slot }));
  s.pieces = pieces;
  s.nextId = id;
  s.owned = 0b111111;
  return s;
}

/** A save as v4 wrote it (version 4, stages and waves), from the rich army: the game must migrate it. */
function v4Save(): Record<string, unknown> {
  const { level: _l, xp: _x, streak: _s, slump: _sl, bestStreak: _b, matches: _m, wins, champs: _c, ...rest } = richSave();
  return { ...rest, version: 4, stage: 4, wave: 6, tries: 0, stars: [3, 2, 3], fights: 38, wins };
}

const kind = param('save');
const state = kind === 'rich' ? richSave() : newSave();
for (const k of ['level', 'xp', 'matches', 'streak', 'cash', 'gems', 'tut', 'kos'] as const) {
  if (!params.has(k)) continue;
  const v = paramNum(k, 0);
  if (k === 'tut') state.tutorial = v;
  else state[k] = v;
}
localStorage.setItem(SAVE_KEY, JSON.stringify(kind === 'v4' ? v4Save() : state));

const canvas = document.createElement('canvas');
canvas.id = 'game';
document.body.appendChild(canvas);
fontReady().then(() => createApp(canvas));
