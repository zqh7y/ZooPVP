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
  page: '#0c1016', // behind the canvas
  ink: '#2b1f33', // every outline
  white: '#ffffff',
  textDim: '#8a94a3',
  textInk: '#4a3a52', // text on paper
  toast: '#ffd84a',
  shade: 'rgba(8, 11, 16, 0.8)', // the veil behind a panel that covers the screen

  // paper: panels, pills and cards
  paper: '#fff6e6',
  paperDark: '#ecd9bd',
  paperEdge: '#c9ad86',
  well: '#1e252f', // a recessed window in paper (numbers sit in it)
  wellShade: 'rgba(0, 0, 0, 0.25)',

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
  hpGood: '#46c46b',
  hpBad: '#e5484d',
  hpBack: '#1a2029',

  // the grid
  gridFrame: '#151a22',
  gridInner: '#151a22',
  gridInnerEdge: '#2b3441',
  cell: 'rgba(0, 0, 0, 0.28)',
  cellLight: 'rgba(255, 255, 255, 0.04)',
  joint: '#ffd21f', // a link in use
  jointIdle: 'rgba(255, 255, 255, 0.22)', // a link the pet does not use (it has a better one)
  valid: 'rgba(70, 196, 107, 0.22)',
  invalid: 'rgba(229, 72, 77, 0.22)',
  fuse: '#ffd21f',

  bot: '#3a4554', // the BOT tag
};

/** Team colours: 0 = you (blue), 1 = the opponent (red). */
export const TEAM = [
  { main: '#3fa2ff', light: '#a5d6ff', dark: '#1f6fd1' },
  { main: '#ff5a5a', light: '#ffb0a8', dark: '#c92f3a' },
] as const;

/**
 * The interface: a match-day scoreboard. Dark slate surfaces, off-white text, one grey for secondary text and
 * one accent (a floodlight yellow that reads on slate and on grass) for the main action and highlights.
 * Team blue / red appear only where something belongs to a team; class colours only as thin lines and letters.
 */
export const UI = {
  bg: '#0c1016', // the page behind everything
  surface: '#151a22', // bars, panels, plates
  surfaceAlt: '#1f2630', // neutral buttons, chips
  tile: '#28313d', // the tile a piece sits on
  tileHi: '#343f4d', // a lifted tile
  track: '#242c37', // the empty part of a bar
  border: '#2b3441',
  borderStrong: '#4a5767',
  text: '#f1f3f5',
  textDim: '#8a94a3',
  textMute: '#566170',
  accent: '#ffd21f',
  accentDim: '#d9b010', // the accent, pressed
  accentText: '#11151b', // text on the accent
  ok: '#46c46b',
  danger: '#e5484d',
  /** the thin dark edge of text that sits directly on the pitch */
  edge: 'rgba(8, 11, 16, 0.8)',
  /** a see-through slate, for plates that float over the pitch */
  glass: 'rgba(12, 16, 22, 0.9)',
  scrim: 'rgba(8, 11, 16, 0.8)',
  /** class line colours, E..SSS (SSS is drawn as a rainbow) and the lighter ones for letters */
  tier: ['#5d6878', '#38b653', '#2f86f6', '#9a52f5', '#f5a417', '#ff3b5c', '#ff4fd8'],
  tierText: ['#aab3c0', '#6fd27a', '#6fb1fb', '#bb93f7', '#ffc94f', '#ff5c77', '#f2a6ff'],
  /** one muted colour per league, Sprout..Legend */
  league: ['#8fb59a', '#c58f62', '#c3cad4', '#e8c35a', '#9ed3df', '#86b6f2', '#d7a7f0'],
};

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
  title: 60, // VICTORY, FIGHT!
  h1: 40, // a screen's main number or name
  h2: 27, // buttons, panel titles
  body: 20, // pills, cards
  small: 15, // captions
  tiny: 12, // badges on tiles
};

/** Spacing stands on a base of 4. */
export const S = {
  base: 4,
  gap: 8, // between neighbours
  pad: 12, // inside a panel, and the screen's side margin
  section: 24, // between sections
  radius: { s: 4, m: 6, l: 8 },
  line: { thin: 1, ui: 1.5, bold: 2 }, // border widths
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
