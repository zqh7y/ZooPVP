import { ARENA } from './data';

/**
 * The one place for the game's shared look: canvas size, colours, type sizes, spacing and the regions more
 * than one screen uses. Everything is in "logical" pixels on a 540 x 1170 portrait canvas that is scaled to
 * fit the window. A screen keeps the positions only it uses at its own top, built from these.
 */
export const W = 540;
export const H = 1170;

/** One condensed sans, in two weights: 600 for labels, 700 for numbers and titles. Use util font() to build a canvas font. */
export const FONT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';

/**
 * The art's colours (units, weapons, gear, effects). The interface does not draw with these: it uses UI below. The
 * few interface entries left here (page, grid, health) are tuned to match UI.
 */
export const COLOR = {
  page: '#e7e4dd', // behind the canvas (and the screen-change fade): a soft greige
  ink: '#14181f', // every outline: a neutral slate-black, so the art sits with the interface
  white: '#ffffff',
  textDim: '#6c727a',
  textInk: '#2e343c', // text on paper
  toast: '#e2c98f',
  shade: 'rgba(240, 238, 233, 0.82)', // the light wash behind a panel that covers the screen

  // paper: panels, pills and cards
  paper: '#f6f4ef',
  paperDark: '#ebe7df',
  paperEdge: '#d6d0c4',
  well: '#e9e5dc', // a recessed window in paper (numbers sit in it)
  wellShade: 'rgba(70, 62, 48, 0.14)',

  // accents (art and effects)
  sakura: '#e6a9bf',
  sakuraLight: '#f3d6e1',
  sakuraDark: '#c47a96',
  vermilion: '#d7735f',
  vermilionLight: '#eba894',
  vermilionDark: '#a9503f',
  indigo: '#56609a',
  indigoLight: '#949cd0',
  indigoDark: '#373d68',
  gold: '#e3c06a', // rewards (soft, never glaring)
  goldLight: '#f5e6bc',
  goldDark: '#b8913a',
  jade: '#6fae92',
  jadeLight: '#bfe0cf',
  jadeDark: '#4a8a6d',

  // the field
  grass: '#9cc58a',
  grassLight: '#c8e0b4',
  grassDark: '#6f9e64',
  sky: '#cfe2ee',
  wood: '#ad8460',
  woodDark: '#7a5a3e',
  stone: '#b9b5bf',
  stoneDark: '#7f7a8a',

  // health
  hpGood: '#6fbf7f',
  hpBad: '#d96a62',
  hpBack: '#2a3038',

  // the grid: a calm stone tray with light cells
  gridFrame: '#dcd8cf',
  gridInner: '#e6e2da',
  gridInnerEdge: '#d2ccc0',
  cell: 'rgba(60, 54, 44, 0.07)',
  cellLight: 'rgba(255, 255, 255, 0.55)',
  joint: '#d9b467', // a link in use
  jointIdle: 'rgba(46, 52, 60, 0.2)', // a link the unit does not use (it has a better one)
  valid: 'rgba(106, 167, 122, 0.22)',
  invalid: 'rgba(207, 107, 99, 0.22)',
  fuse: '#d9b467',

  bot: '#2b3441', // kept for old callers
};

/** Team colours: 0 = you (blue), 1 = the enemy wave (red). A little softer than pure, still clear at a glance. */
export const TEAM = [
  { main: '#4f94d9', light: '#a9cdef', dark: '#2f6aa8' },
  { main: '#de6a62', light: '#f0b2ab', dark: '#a8433d' },
] as const;

/**
 * The interface: calm and easy on the eyes. Soft greige and warm white surfaces, slate text, one grey for
 * secondary text and one gentle accent (a muted sage teal) for the main action, with white text on it. Rewards
 * use a soft wheat tone, never a glaring gold. Team blue / red appear only where something belongs to a team.
 */
export const UI = {
  bg: '#e7e4dd', // the page behind everything
  surface: '#f7f5f1', // bars, panels, plates
  surfaceAlt: '#eeebe5', // neutral chips, inner cells
  tile: '#fbfaf7', // the top face of the tile a piece sits on
  tileHi: '#ffffff', // a lifted tile
  track: '#dedad2', // the empty part of a bar
  border: '#dcd7cd',
  borderStrong: '#c7c0b3',
  text: '#2e343c',
  textDim: '#6c727a',
  textMute: '#9da1a7',
  accent: '#5a9686', // the one main-action colour: a muted sage teal
  accentDim: '#4f8577', // the accent, pressed
  accentDark: '#3f6c60', // the side face of an accent block
  accentLight: '#d5e7e1', // a pale wash of the accent (a fuse target, a selected chip)
  accentText: '#ffffff', // text on the accent
  /** a soft wheat for rewards: cash, stars, the reward glow */
  reward: '#d7b46a',
  rewardDark: '#a9873f',
  rewardLight: '#f1e3bf',
  /** gems: a soft lilac */
  gem: '#9b8fd0',
  gemDark: '#6f63a6',
  /** a muted amber: "not enough yet" (power under the recommended one, a price you cannot pay) */
  warm: '#c48552',
  ok: '#6aa77a', // a drop that fits
  danger: '#cf6b63',
  sky: '#e4ecf0', // a pale sky tint, where a panel wants air
  /** the soft shadow everything casts (light from the upper left) */
  shadow: 'rgba(60, 54, 44, 0.14)',
  /** the thin dark edge of light text that sits directly on the pitch */
  edge: 'rgba(24, 34, 30, 0.66)',
  /** a see-through warm white, for plates that float over the pitch */
  glass: 'rgba(247, 245, 241, 0.94)',
  scrim: 'rgba(231, 228, 221, 0.82)',
  /** class rim colours E..SSS on light surfaces: greys, a cool steel, then soft wheat (see TIER) */
  tier: ['#b4b8bd', '#9ea6ae', '#8b95a0', '#93a8bb', '#c8a660', '#c99a52', '#d8b874'],
  /** the class plate: fill top, fill bottom, letter */
  tierPlate: [
    ['#dfe1e4', '#cdd1d6', '#4a515c'],
    ['#c6ccd2', '#b2bac2', '#ffffff'],
    ['#a3acb6', '#8e98a3', '#ffffff'],
    ['#eef2f6', '#c6d1dc', '#34404e'],
    ['#ecd39a', '#d3b06a', '#4a3812'],
    ['#ebc98b', '#cf9f58', '#47320f'],
    ['#faf3e2', '#e6cf96', '#7a5a1c'],
  ],
  /** class letters on a light surface (odds rows, captions) */
  tierText: ['#8a9099', '#78808a', '#626b76', '#5f7489', '#a5823a', '#ad7b34', '#9b7a2c'],
};

/**
 * Colours per class, E..SSS (the effects use them). Rarity climbs from cool greys (E, D, C) through steel (B) into
 * soft wheat (A), a warmer ochre (S) and a pale cream-gold (SSS). Never a rainbow, never neon.
 */
export const TIER = {
  metal: ['#7a828c', '#8f98a2', '#a9b2bc', '#c6cfd8', '#cfae6a', '#d8ae5e', '#efdfb2'],
  metalLight: ['#b1b8c0', '#c2c9d0', '#d8dde2', '#eef1f4', '#ecd8a8', '#f0d9a6', '#fbf4e2'],
  tile: ['#59616b', '#68717c', '#7d8792', '#96a0ab', '#ad8d4c', '#c09550', '#dcc58e'],
  tileLight: ['#848d97', '#97a0a9', '#adb5be', '#c7ced5', '#dcc184', '#e4c587', '#f5ead0'],
  tileDark: ['#363c44', '#424951', '#525a64', '#646d78', '#7a6232', '#8c6a34', '#a68d55'],
};
/** The slow cream-gold shimmer of an SSS piece (the name stays from when it was a rainbow). */
export const RAINBOW = ['#fbf4e2', '#ecd6a0', '#ffffff', '#e3c27a', '#f5e8c6'];
/** The S-class aura and the sparkle colour. */
export const CLASS_FX = { s: '#e1bc72', sss: '#f4e6c2', spark: '#fffaf0' };

/**
 * Type sizes (px), by role. A screen takes a step from here and never does arithmetic on it: when a size is
 * missing, it is added here with its role.
 */
export const TYPE = {
  power: 46, // the lobby's POWER number
  title: 60, // VICTORY, FIGHT!
  h1: 40, // a screen's main number or name
  button: 36, // the word on a main button
  h2: 27, // panel titles, the big score
  h3: 24, // a card's title, a toast, a pill's number
  lead: 22, // a name on a plate, a medium button, the clock
  body: 20, // pills, cards
  label: 18, // a small button
  caption: 16, // a caption beside or under a value
  small: 15, // captions
  badge: 20, // the class letter on a piece tile
  tag: 13, // the BOT tag, a button's second line, a class letter at full size
  tiny: 12, // badges on tiles (the smallest text the game draws)
};

/** Spacing stands on a base of 4. */
export const S = {
  base: 4,
  gap: 8, // between neighbours
  pad: 12, // inside a panel, and the screen's side margin
  section: 24, // between sections
  radius: { s: 6, m: 10, l: 16 },
  line: { thin: 1, ui: 1.5, bold: 2 }, // border widths
  barH: 48, // a top-bar pill
  btnH: 84, // a main button
  btnSmallH: 52,
};

/** The row of pills at the top of every screen. */
export const TOPBAR = { y: 14, h: S.barH };

/**
 * The box the pitch fills on screen: the opponent's end at the top, yours at the bottom. The pitch is drawn
 * through the match camera (draw/camera.ts), so it is a trapezoid inside this box, narrower at the far end, and
 * an arena point is never just FIELD.x + x: use project() from the camera. Kept equal to camera.ts PITCH.
 */
export const FIELD = { x: 40, y: 295, w: 460, h: 657 };

/** The strip of the field in the lobby where your army stands idle. */
export const STAGE = { x: 0, y: 90, w: W, h: 206 };
