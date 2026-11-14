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
  ink: '#14181f', // every outline: a neutral slate-black, so the art sits with the interface
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
  /** class line colours E..SSS (greys, silver, then gold: see TIER) and the lighter ones for letters */
  tier: ['#5d6878', '#7c8796', '#a0aab7', '#cfd6de', '#d9a52e', '#ffd21f', '#fff3c4'],
  tierText: ['#8f99a7', '#a5afbc', '#c3cbd5', '#eef1f4', '#f0c75a', '#ffd21f', '#fff6dc'],
  /** one colour per league, Sprout..Legend: metals, ending in the main gold */
  league: ['#7d8794', '#a37a52', '#b9c1cb', '#e0b84a', '#d8dee6', '#eef3f7', '#ffd21f'],
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
 * The box the pitch fills on screen: the opponent's end at the top, yours at the bottom. The pitch is drawn
 * through the match camera (draw/camera.ts), so it is a trapezoid inside this box, narrower at the far end, and
 * an arena point is never just FIELD.x + x: use project() from the camera. Kept equal to camera.ts PITCH.
 */
export const FIELD = { x: 40, y: 295, w: 460, h: 657 };

/** The strip of the field in the lobby where your army stands idle. */
export const STAGE = { x: 0, y: 104, w: W, h: 250 };
