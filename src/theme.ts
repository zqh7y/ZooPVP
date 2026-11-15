
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
  page: '#1f1940', // behind the canvas (and the screen-change fade): the deep indigo base
  ink: '#14181f', // every outline: a neutral slate-black, so the art sits with the interface
  white: '#ffffff',
  textDim: '#6c727a',
  textInk: '#2e343c', // text on paper
  toast: '#e2c98f',
  shade: 'rgba(31, 25, 64, 0.82)', // the deep wash behind a panel that covers the screen

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
  gold: '#f2c14e', // rewards: a warm gold, rich but never glaring
  goldLight: '#fbe3a0',
  goldDark: '#c48a1c',
  jade: '#5cc46a',
  jadeLight: '#bfeac2',
  jadeDark: '#2f8a3c',

  // the field
  grass: '#8fc477',
  grassLight: '#c3e3ae',
  grassDark: '#64a055',
  sky: '#cfe2ee',
  wood: '#ad8460',
  woodDark: '#7a5a3e',
  stone: '#b9b5bf',
  stoneDark: '#7f7a8a',

  // health
  hpGood: '#6fcf7f',
  hpBad: '#ef6a62',
  hpBack: '#2a2348',

  // the grid: a deep plum tray with darker cells, so the white tiles pop
  gridFrame: '#3a2f6c',
  gridInner: '#2a2253',
  gridInnerEdge: '#1f1840',
  cell: 'rgba(16, 10, 40, 0.28)',
  cellLight: 'rgba(255, 255, 255, 0.08)',
  joint: '#f2c14e', // a link in use
  jointIdle: 'rgba(170, 150, 230, 0.32)', // a link the unit does not use (it has a better one)
  valid: 'rgba(92, 196, 106, 0.3)',
  invalid: 'rgba(239, 106, 98, 0.3)',
  fuse: '#f2c14e',

  bot: '#2b3441', // kept for old callers
};

/** Team colours (the corners): 0 = you (blue), 1 = the opponent (red). Clear at a glance, a little softer than pure. */
export const TEAM = [
  { main: '#4f94d9', light: '#a9cdef', dark: '#2f6aa8' },
  { main: '#de6a62', light: '#f0b2ab', dark: '#a8433d' },
] as const;

/**
 * The interface: a deep, inviting base. Deep indigo behind everything, plum-indigo panels with chunky depth, light
 * text on them; saturated but soft-edged buttons (BATTLE a juicy green, CASE a warm orange, ELITE a purple); warm
 * white only where a thing is held or read up close (the piece tiles, the top-bar pills, the guide's bubbles), with
 * dark ink on it. Rewards are a warm gold. Team blue / red appear only where something belongs to a corner.
 *
 * text / textDim / textMute are INK for light plates (the label() default); hi / hiDim / hiMute are for the dark base.
 */
export const UI = {
  bg: '#241d4a', // the page behind everything: deep indigo
  bgTop: '#2f2560', // the top of the page's gentle gradient (a touch of plum)
  bgLow: '#1b1538', // its bottom
  surface: '#3d3274', // panels and plates on the base
  surfaceHi: '#4a3e8a', // a panel's lit top
  surfaceAlt: '#2f2760', // chips and wells inside a panel
  tile: '#fbfaf7', // the top face of the tile a piece sits on
  tileHi: '#ffffff', // a lifted tile
  track: '#221b47', // the empty part of a bar
  border: '#5b4ea0',
  borderStrong: '#7262bf',
  /** ink: text on light plates (tiles, pills, bubbles) */
  text: '#2e343c',
  textDim: '#6c727a',
  textMute: '#9da1a7',
  /** text on the dark base and panels */
  hi: '#fbf8ff',
  hiDim: '#c8bdef',
  hiMute: '#8f83c2',
  accent: '#56c15a', // the main action: a juicy green (BATTLE, CONTINUE, a good drop)
  accentDim: '#45ad4b', // the accent, pressed
  accentDark: '#2c7f30', // the side face of an accent block
  accentLight: '#bdf0b8', // a pale wash of the accent (a fuse target, a selected chip)
  accentText: '#ffffff', // text on the accent
  /** a warm gold for rewards: cash, the XP bar, the reward glow */
  reward: '#f2c14e',
  rewardDark: '#c48a1c',
  rewardLight: '#fde7a8',
  /** gems: a soft lilac-violet */
  gem: '#a98cf5',
  gemDark: '#7a5bd6',
  /** a warm orange: "not enough yet" (a price you cannot pay) */
  warm: '#ff9f4a',
  ok: '#5cc46a', // a drop that fits
  danger: '#ef6a62',
  sky: '#e4ecf0', // a pale sky tint, where a light card wants air
  /** the shadow everything casts on the deep base */
  shadow: 'rgba(10, 6, 30, 0.45)',
  /** the thin dark edge of light text that sits directly on the pitch */
  edge: 'rgba(24, 34, 30, 0.66)',
  /** a see-through deep plate, for plates that float over the pitch */
  glass: 'rgba(36, 29, 74, 0.92)',
  scrim: 'rgba(24, 18, 52, 0.78)',
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
 * The top bar's cash, gems and LEVEL pills: the v4 look the player asked to keep EXACTLY (a warm white pill, a
 * recessed well for the number), so they keep their own colours whatever the rest of the palette does.
 */
export const PILL = {
  fill: '#f7f5f1',
  edge: '#dcd7cd',
  well: '#eeebe5',
  shadow: 'rgba(60, 54, 44, 0.12)',
  text: '#2e343c',
  moving: '#a9873f', // the number while it ticks
  xp: '#f0bf4f', // the XP fill in the LEVEL pill's well
  xpLight: '#fbe7ad',
};

/**
 * Rarity as a colour, E..SSS (a unit takes the tier its rung looks like): the roll's reel cards, the prize burst and
 * class letters on the dark base. Grey, green, blue, purple, gold, coral, then a pink-gold shimmer for SSS: the
 * ramp roll games use, softened so it never glares.
 */
export const RARITY = {
  main: ['#9aa3b8', '#5cc46a', '#4fa3ea', '#a173f2', '#f2b83d', '#ff7a5c', '#ff7ccf'],
  light: ['#d3d8e4', '#b6eab9', '#b4daf8', '#d6bffb', '#fde3a0', '#ffc6b4', '#ffd0ef'],
  dark: ['#5b6378', '#2f8a3c', '#2a6fb0', '#6a40b8', '#b67d12', '#c2492f', '#b8418e'],
  name: ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'SECRET'],
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
