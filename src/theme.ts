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
 * The art's colours (pets, weapons, gear, effects). The interface does not draw with these any more: it uses
 * UI below. The few interface entries left here (page, grid, health, bot) are tuned to match UI.
 */
export const COLOR = {
  page: '#f3ead9', // behind the canvas (and the screen-change fade): warm cream
  ink: '#14181f', // every outline: a neutral slate-black, so the art sits with the interface
  white: '#ffffff',
  textDim: '#6b7380',
  textInk: '#1f2733', // text on paper
  toast: '#ffc21a',
  shade: 'rgba(255, 248, 236, 0.8)', // the light wash behind a panel that covers the screen

  // paper: panels, pills and cards
  paper: '#fffaf2',
  paperDark: '#f1e6d3',
  paperEdge: '#dccbb0',
  well: '#efe4d1', // a recessed window in paper (numbers sit in it)
  wellShade: 'rgba(120, 92, 52, 0.18)',

  // accents
  sakura: '#ff9ec4',
  sakuraLight: '#ffd3e4',
  sakuraDark: '#e0649a',
  vermilion: '#ef4b34',
  vermilionLight: '#ff8a6b',
  vermilionDark: '#b82f20',
  indigo: '#3d4a9e',
  indigoLight: '#7d8ee6',
  indigoDark: '#28306e',
  gold: '#ffc21a', // trophies, rewards
  goldLight: '#fff0a8',
  goldDark: '#d99400',
  jade: '#3fc48a',
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
  hpGood: '#46c46b',
  hpBad: '#e5484d',
  hpBack: '#1a2029',

  // the grid: a sand tray with cream cells
  gridFrame: '#e9dcc5',
  gridInner: '#efe4d1',
  gridInnerEdge: '#dccbb0',
  cell: 'rgba(120, 92, 52, 0.08)',
  cellLight: 'rgba(255, 255, 255, 0.6)',
  joint: '#ffc21a', // a link in use
  jointIdle: 'rgba(31, 39, 51, 0.22)', // a link the pet does not use (it has a better one)
  valid: 'rgba(60, 170, 90, 0.22)',
  invalid: 'rgba(229, 72, 77, 0.22)',
  fuse: '#ffc21a',

  bot: '#2b3441', // the BOT tag
};

/** Team colours: 0 = you (blue), 1 = the opponent (red). */
export const TEAM = [
  { main: '#3fa2ff', light: '#a5d6ff', dark: '#1f6fd1' },
  { main: '#ff5a5a', light: '#ffb0a8', dark: '#c92f3a' },
] as const;

/**
 * The interface: sunny match day. Warm white and cream surfaces, dark slate text, one grey for secondary text and
 * one main colour (a sunny gold) for the main action and highlights, with dark text on it. Team blue / red appear
 * only where something belongs to a team; class tones only on class plates and tile rims.
 */
export const UI = {
  bg: '#f6efe3', // the page behind everything: warm cream
  surface: '#fffaf2', // bars, panels, plates: warm white
  surfaceAlt: '#f3eadb', // neutral chips, inner cells
  tile: '#fffdf8', // the top face of the tile a piece sits on
  tileHi: '#ffffff', // a lifted tile
  track: '#ebe0cd', // the empty part of a bar
  border: '#e8dcc8',
  borderStrong: '#d3c3a6',
  text: '#1f2733',
  textDim: '#6b7380',
  textMute: '#a4a9b0',
  accent: '#ffc21a',
  accentDim: '#e8a900', // the accent, pressed
  accentDark: '#d18f00', // the side face of a gold block
  accentText: '#1f2733', // text on the accent
  ok: '#3caa5a', // a drop that fits: the grass green
  danger: '#e5484d',
  sky: '#e3f3ff', // a pale sky tint, where a panel wants air
  /** the soft warm shadow everything casts on the cream (sun from the upper left) */
  shadow: 'rgba(110, 80, 40, 0.16)',
  /** the thin dark edge of light text that sits directly on the pitch */
  edge: 'rgba(22, 40, 26, 0.72)',
  /** a see-through warm white, for plates that float over the pitch */
  glass: 'rgba(255, 250, 242, 0.95)',
  scrim: 'rgba(250, 243, 230, 0.78)',
  /** class rim colours E..SSS on light surfaces: greys, silver, then gold (see TIER) */
  tier: ['#a9afb7', '#8e96a1', '#737c88', '#9fb0c2', '#e4a311', '#f5b700', '#f0c64a'],
  /** the class plate: fill top, fill bottom, letter */
  tierPlate: [
    ['#d6d9de', '#bfc4cb', '#3d4552'],
    ['#b8bec6', '#9ea6b0', '#ffffff'],
    ['#8f98a4', '#77818e', '#ffffff'],
    ['#f4f7fa', '#bcc7d3', '#2c3644'],
    ['#ffd04a', '#e8a10c', '#3a2700'],
    ['#ffe15c', '#f5ae00', '#3a2400'],
    ['#fffdf2', '#ffd96a', '#8a5600'],
  ],
  /** class letters on a light surface (odds rows, captions) */
  tierText: ['#8a919b', '#737b86', '#5b6470', '#5e7389', '#c98a00', '#d99a00', '#b8860b'],
  /** one colour per league, Sprout..Legend: metals readable on cream, ending in the main gold */
  league: ['#8a939e', '#b07a48', '#8f9cab', '#e0a516', '#6f8fa8', '#4fa3c7', '#f2b200'],
};

/**
 * Colours per class, E..SSS. One main colour runs through the game, so rarity climbs from cool greys (E, D, C)
 * through silver (B) into gold (A), the full floodlight gold (S) and white-gold (SSS). Never a rainbow.
 */
export const TIER = {
  metal: ['#6b7480', '#848e9a', '#a3adb9', '#c9d0d8', '#d9a52e', '#ffcc1a', '#fff0b8'],
  metalLight: ['#a9b1bb', '#bcc4cd', '#d5dbe2', '#f1f4f7', '#ffe08a', '#fff0a0', '#ffffff'],
  tile: ['#4b535e', '#5c6571', '#727c89', '#8d97a3', '#b8892a', '#e0b21a', '#f3dc8a'],
  tileLight: ['#7a838e', '#8c95a0', '#a3acb7', '#c2c9d1', '#f0c75a', '#ffe066', '#fff6d6'],
  tileDark: ['#2f353d', '#3a414a', '#4a525d', '#5d6672', '#7f5e17', '#a37f0c', '#b99a3e'],
};
/** The slow white-gold shimmer of an SSS piece (the name stays from when it was a rainbow). */
export const RAINBOW = ['#fff6d6', '#ffe27a', '#ffffff', '#ffd21f', '#fff0b8'];
/** The S-class aura and the sparkle colour. */
export const CLASS_FX = { s: '#ffd21f', sss: '#fff3c4', spark: '#fffbe8' };

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
