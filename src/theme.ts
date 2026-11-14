import { ARENA } from './data';

/**
 * The one place for the game's shared look: canvas size, colours, type sizes, spacing and the regions more
 * than one screen uses. Everything is in "logical" pixels on a 540 x 1170 portrait canvas that is scaled to
 * fit the window. A screen keeps the positions only it uses at its own top, built from these.
 */
export const W = 540;
export const H = 1170;

export const FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

/** Spring in a Japanese garden: warm paper panels, plum ink outlines, cherry pink, torii red, indigo, gold. */
export const COLOR = {
  page: '#1b1522', // behind the canvas
  ink: '#2b1f33', // every outline
  white: '#ffffff',
  textDim: '#e6dcec',
  textInk: '#4a3a52', // text on paper
  toast: '#ffe27a',
  shade: 'rgba(27, 21, 34, 0.6)', // the veil behind a panel that covers the screen

  // paper: panels, pills and cards
  paper: '#fff6e6',
  paperDark: '#ecd9bd',
  paperEdge: '#c9ad86',
  well: '#e3cfae', // a recessed window in paper (numbers sit in it)
  wellShade: 'rgba(90, 60, 30, 0.22)',

  // accents
  sakura: '#ff9ec4',
  sakuraLight: '#ffd3e4',
  sakuraDark: '#e0649a',
  vermilion: '#ef4b34', // the main action (BATTLE)
  vermilionLight: '#ff8a6b',
  vermilionDark: '#b82f20',
  indigo: '#3d4a9e', // secondary actions
  indigoLight: '#7d8ee6',
  indigoDark: '#28306e',
  gold: '#ffc93c', // trophies, rewards
  goldLight: '#fff0a8',
  goldDark: '#d9951a',
  jade: '#3fc48a', // rolls
  jadeLight: '#a6f0cb',
  jadeDark: '#1f8f5f',

  // the field
  grass: '#8fd46a',
  grassLight: '#c4ee9a',
  grassDark: '#5fae4a',
  sky: '#bfe6ff',
  wood: '#b07a4a',
  woodDark: '#7a5030',
  stone: '#b9b3c2',
  stoneDark: '#7f7890',

  // health
  hpGood: '#5ad66c',
  hpBad: '#ff4d4d',
  hpBack: '#3a2f3f',

  // the grid
  gridFrame: '#8a6f5a',
  gridInner: '#5b4a52',
  gridInnerEdge: '#3d3038',
  cell: 'rgba(0, 0, 0, 0.16)',
  cellLight: 'rgba(255, 255, 255, 0.06)',
  joint: '#ffc93c', // a link in use
  jointIdle: 'rgba(255, 255, 255, 0.35)', // a link the pet does not use (it has a better one)
  valid: 'rgba(110, 230, 120, 0.45)',
  invalid: 'rgba(255, 80, 80, 0.45)',
  fuse: '#ffe066',

  bot: '#6b6278', // the BOT tag
};

/** Team colours: 0 = you (blue), 1 = the opponent (red). */
export const TEAM = [
  { main: '#3fa2ff', light: '#a5d6ff', dark: '#1f6fd1' },
  { main: '#ff5a5a', light: '#ffb0a8', dark: '#c92f3a' },
] as const;

/** Colours per class: index 0 = E (gray), D green, C blue, B purple, A gold, S crimson, 6 = SSS (prismatic). */
export const TIER = {
  metal: ['#8f99a8', '#38b653', '#2f86f6', '#9a52f5', '#f5a417', '#ff3b5c', '#ff4fd8'],
  metalLight: ['#d2d8e1', '#9bf0a8', '#a3cdff', '#dcb8ff', '#ffe08a', '#ffb3c0', '#ffd1f6'],
  tile: ['#c9cfd9', '#7fd77c', '#7db9fb', '#c09af7', '#ffc94f', '#ff8a9c', '#f2a6ff'],
  tileLight: ['#eef1f5', '#c9f3c4', '#cfe6ff', '#ead9ff', '#fff0bf', '#ffdbe1', '#fff0ff'],
  tileDark: ['#7d8696', '#3a9a45', '#3a78cc', '#7b47c9', '#c98712', '#c4243f', '#9b2fd0'],
};
/** The rainbow rim of an SSS piece. */
export const RAINBOW = ['#ff6b6b', '#ffd84a', '#5ad66c', '#5aa8ff', '#c48bff'];
/** The S-class aura and the sparkle colour. */
export const CLASS_FX = { s: '#ff4664', sss: '#ff7af5', spark: '#fff6d8' };

/** Type sizes (px), by role. */
export const TYPE = {
  title: 56, // VICTORY, FIGHT!
  h1: 36, // a screen's main number or name
  h2: 26, // buttons, panel titles
  body: 18, // pills, cards
  small: 14, // captions
  tiny: 11, // badges on tiles
};

/** Spacing stands on a base of 4. */
export const S = {
  base: 4,
  gap: 8, // between neighbours
  pad: 12, // inside a panel, and the screen's side margin
  section: 24, // between sections
  radius: { s: 8, m: 12, l: 18 },
  line: { thin: 2, ui: 3, bold: 4 }, // outline widths
  barH: 48, // a top-bar pill
  btnH: 84, // a main button
  btnSmallH: 52,
};

/** The row of pills at the top of every screen. */
export const TOPBAR = { y: 14, h: S.barH };

/**
 * The battlefield on screen: one arena pixel is one screen pixel. The opponent holds the top, you the
 * bottom. The frame and the crowd are drawn around it.
 */
export const FIELD = { x: (W - ARENA.w) / 2, y: 190, w: ARENA.w, h: ARENA.h };

/** The strip of the field in the lobby where your army stands idle. */
export const STAGE = { x: 0, y: 104, w: W, h: 250 };
