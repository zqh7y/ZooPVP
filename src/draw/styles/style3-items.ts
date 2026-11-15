import { K, TAU, ell, flat, frame, glint, ink, limb, pathPart, tone } from './style3-kit';
import type { Ctx } from './style3-kit';

/*
 * Style 3, "Bold Sticker": the weapons and gear. Each is drawn in its own units with its grip (or its centre) on
 * the origin and pointing up, so a pet can hold it at any angle and the lobby can show it as a sticker.
 * Units: a pet's radius when held (a knife is about 1.1 long, a spear 2.3).
 */
export const STEEL = tone('#eaf0f7', '#98a9c0', '#ffffff');
export const STEEL_DARK = tone('#7d8aa3', '#56627a', '#aab6cc');
export const WOOD = tone('#f7b45e', '#c77a34', '#ffd9a0');
export const GOLD = tone('#ffcd2e', '#e08a00', '#fff1a6');
const TAPE = '#2f3850';
const TAPE_HI = '#56617e';

/** Fills the side away from the light (x > edge, or x < -edge when the light comes from the right). */
function sideShade(c: Ctx, edge: number, color: string, h = 3) {
  c.fillStyle = color;
  if (K.lx <= 0) c.fillRect(edge, -h, h, h * 2);
  else c.fillRect(-edge - h, -h, h, h * 2);
}
/** Which way the lit side is in x: -1 when the light comes from the left. */
const litSide = () => (K.lx <= 0 ? -1 : 1);

// ------------------------------------------------------------------ knife

function blade(c: Ctx) {
  c.moveTo(-0.11, -0.13);
  c.lineTo(-0.11, -0.64);
  c.quadraticCurveTo(-0.1, -0.88, 0.02, -1.08);
  c.quadraticCurveTo(0.2, -0.72, 0.13, -0.13);
  c.closePath();
}

export function knife(c: Ctx) {
  // pommel and a wrapped handle
  ell(c, 0, 0.33, 0.105, 0.095, 0, GOLD, 0.6);
  limb(c, [0, 0.27, 0, -0.06], 0.22, WOOD.base, WOOD.rim);
  if (!K.sil) {
    ink(c, [-0.08, 0.17, 0.08, 0.12], K.lw * 0.8);
    ink(c, [-0.08, 0.06, 0.08, 0.01], K.lw * 0.8);
  }
  // the blade: a hard bevel along the edge, a white streak along the spine
  pathPart(c, blade, STEEL.base, (cc) => {
    cc.beginPath();
    cc.moveTo(0.035, -0.13);
    cc.lineTo(0.035, -0.62);
    cc.quadraticCurveTo(0.03, -0.86, 0.02, -1.08);
    cc.lineTo(0.4, -1.1);
    cc.lineTo(0.4, -0.1);
    cc.closePath();
    cc.fillStyle = STEEL.shade;
    cc.fill();
  });
  glint(c, [-0.055, -0.26, -0.055, -0.66], 0.05);
  // the guard
  limb(c, [-0.22, -0.13, 0.22, -0.13], 0.13, GOLD.base, GOLD.rim);
}

// ------------------------------------------------------------------ bat

function batPath(c: Ctx) {
  c.moveTo(-0.065, 0.2);
  c.lineTo(-0.065, -0.24);
  c.quadraticCurveTo(-0.075, -0.52, -0.19, -0.8);
  c.lineTo(-0.2, -1.2);
  c.arc(0, -1.2, 0.2, Math.PI, TAU);
  c.lineTo(0.19, -0.8);
  c.quadraticCurveTo(0.075, -0.52, 0.065, -0.24);
  c.lineTo(0.065, 0.2);
  c.closePath();
}

export function bat(c: Ctx) {
  pathPart(c, batPath, WOOD.base, (cc) => {
    sideShade(cc, 0.06, WOOD.shade);
    if (K.lod) {
      // a crisp rim of light just inside the shaded edge of the barrel
      const s = -litSide();
      cc.beginPath();
      cc.moveTo(0.135 * s, -0.8);
      cc.lineTo(0.14 * s, -1.24);
      cc.lineWidth = 0.04;
      cc.strokeStyle = WOOD.rim;
      cc.stroke();
    }
    // the grip tape
    cc.fillStyle = TAPE;
    cc.fillRect(-0.2, -0.22, 0.4, 0.44);
    cc.strokeStyle = TAPE_HI;
    cc.lineWidth = 0.04;
    cc.beginPath();
    for (let i = 0; i < 4; i++) {
      const y = 0.14 - i * 0.1;
      cc.moveTo(-0.07, y + 0.035);
      cc.lineTo(0.07, y - 0.035);
    }
    cc.stroke();
    // a painted band near the barrel
    cc.fillStyle = '#ff7a2e';
    cc.fillRect(-0.3, -1.0, 0.6, 0.08);
  });
  if (!K.sil) {
    ink(c, [-0.065, -0.22, 0.065, -0.22], K.lw * 0.8);
    ink(c, [-0.2, -1.0, 0.2, -1.0], K.lw * 0.6);
    ink(c, [-0.2, -0.92, 0.2, -0.92], K.lw * 0.6);
  }
  glint(c, [0.11 * litSide(), -0.84, 0.115 * litSide(), -1.26], 0.065);
  // the knob
  ell(c, 0, 0.22, 0.13, 0.07, 0, tone(TAPE, '#1d2436', TAPE_HI), 0);
}

// ------------------------------------------------------------------ spear

function spearHead(c: Ctx) {
  c.moveTo(0, -1.5);
  c.quadraticCurveTo(0.25, -1.2, 0.08, -0.96);
  c.lineTo(-0.08, -0.96);
  c.quadraticCurveTo(-0.25, -1.2, 0, -1.5);
  c.closePath();
}

const TASSEL = tone('#ff8a3d', '#d4521c', '#ffc59a');

export function spear(c: Ctx) {
  limb(c, [0, 0.5, 0, -1.0], 0.17, WOOD.base, WOOD.rim);
  ell(c, 0, 0.52, 0.09, 0.085, 0, STEEL_DARK, 0);
  // a tassel tied under the head
  ell(c, -0.13, -0.76, 0.065, 0.17, 0.38, TASSEL, 0);
  ell(c, -0.03, -0.74, 0.06, 0.16, 0.08, TASSEL, 0);
  pathPart(c, spearHead, STEEL.base, (cc) => sideShade(cc, 0.0, STEEL.shade));
  if (!K.sil) ink(c, [0, -1.4, 0, -1.0], K.lw * 0.7, '#7b8aa1');
  glint(c, [0.08 * litSide(), -1.3, 0.07 * litSide(), -1.1], 0.045);
  limb(c, [-0.09, -0.95, 0.09, -0.95], 0.11, GOLD.base);
  limb(c, [-0.08, -0.85, 0.08, -0.85], 0.08, GOLD.base);
}

// ------------------------------------------------------------------ shield (a heater shield, centred, facing out)

function shieldPath(c: Ctx) {
  c.moveTo(-0.56, -0.5);
  c.quadraticCurveTo(0, -0.66, 0.56, -0.5);
  c.lineTo(0.56, -0.04);
  c.quadraticCurveTo(0.53, 0.44, 0, 0.7);
  c.quadraticCurveTo(-0.53, 0.44, -0.56, -0.04);
  c.closePath();
}

function star(c: Ctx, x: number, y: number, r: number) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.45 : r;
    if (i) c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    else c.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  c.closePath();
}

export function shield(c: Ctx) {
  pathPart(c, shieldPath, STEEL.base, (cc) => {
    sideShade(cc, 0.12, STEEL.shade);
  });
  if (K.sil) return;
  frame(c, 0, 0.0, 0, 0.76, (cc) =>
    pathPart(cc, shieldPath, GOLD.base, (c2) => {
      sideShade(c2, 0.0, GOLD.shade);
      c2.beginPath();
      c2.ellipse(0, 0, 0.62, 0.72, 0, K.lx <= 0 ? -1.0 : Math.PI - 0.3, K.lx <= 0 ? 0.3 : Math.PI + 1.0);
      c2.lineWidth = 0.07;
      c2.strokeStyle = GOLD.rim;
      c2.stroke();
    }),
  );
  c.beginPath();
  star(c, 0, 0.02, 0.27);
  c.fillStyle = '#ffffff';
  c.fill();
  c.lineWidth = K.lw * 0.9;
  c.strokeStyle = K.ink;
  c.stroke();
  glint(c, [-0.4, -0.38, -0.4, -0.1], 0.07);
}

// ------------------------------------------------------------------ helmet (unit = the head it sits on, centred on it)

const HELM = tone('#cfd9e7', '#8292ad', '#eef4fb');
const CREST = tone('#ffb21e', '#e07800', '#ffe08a');
/** where the helmet's edge meets the head: in front (above the eyes) and at the back (over the nape) */
const HF = -0.5;
const HB = Math.PI + 0.1;
const HR = 1.07;

const CA = -2.55;
const CB = -1.12;
function crestPath(c: Ctx) {
  c.moveTo(Math.cos(CA) * 0.9, Math.sin(CA) * 0.9);
  // the bristly outer edge, a run of small bumps
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a0 = CA + ((CB - CA) * i) / n;
    const a1 = CA + ((CB - CA) * (i + 1)) / n;
    const am = (a0 + a1) / 2;
    const rr = i === 0 || i === n - 1 ? 1.36 : 1.46;
    c.quadraticCurveTo(Math.cos(am) * (rr + 0.14), Math.sin(am) * (rr + 0.14), Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  c.lineTo(Math.cos(CB) * 0.9, Math.sin(CB) * 0.9);
  c.arc(0, 0, 0.9, CB, CA, true);
  c.closePath();
}

function domePath(c: Ctx) {
  c.moveTo(Math.cos(HB) * HR, Math.sin(HB) * HR);
  c.arc(0, 0, HR, HB, TAU + HF);
  c.quadraticCurveTo(0.05, 0.02, Math.cos(HB) * HR, Math.sin(HB) * HR);
  c.closePath();
}

/** A helmet as worn: a steel cap hugging the head, a brim band, a crest. inside: show its dark lining (the icon). */
export function helmetOn(c: Ctx, cheek = false) {
  const fx = Math.cos(HF) * HR;
  const fy = Math.sin(HF) * HR;
  const bx = Math.cos(HB) * HR;
  const by = Math.sin(HB) * HR;
  // the crest: a tall brush standing in a groove along the top, scalloped bristles on its edge
  pathPart(c, crestPath, CREST.base, (cc) => {
    cc.beginPath();
    cc.arc(0, 0, 1.2, -2.6, -0.6);
    cc.lineWidth = 0.22;
    cc.strokeStyle = CREST.shade;
    cc.stroke();
    cc.beginPath();
    cc.arc(0, 0, 1.3, K.lx <= 0 ? -2.2 : -1.45, K.lx <= 0 ? -1.75 : -1.0);
    cc.lineWidth = 0.08;
    cc.strokeStyle = 'rgba(255,255,255,0.92)';
    cc.stroke();
  });
  // the neck guard flaring out at the back
  const ux = (fx - bx) / Math.hypot(fx - bx, fy - by);
  const uy = (fy - by) / Math.hypot(fx - bx, fy - by);
  const nx = -uy;
  const ny = ux;
  pathPart(
    c,
    (cc) => {
      cc.moveTo(bx + ux * 0.5, by + uy * 0.5);
      cc.lineTo(bx + ux * 0.5 + nx * 0.16, by + uy * 0.5 + ny * 0.16);
      cc.quadraticCurveTo(bx + ux * 0.05 + nx * 0.24, by + uy * 0.05 + ny * 0.24, bx - ux * 0.26 + nx * 0.36, by - uy * 0.26 + ny * 0.36);
      cc.lineTo(bx - ux * 0.16 - nx * 0.05, by - uy * 0.16 - ny * 0.05);
      cc.closePath();
    },
    STEEL_DARK.base,
  );
  if (cheek) {
    // a cheek guard hanging from the brim (the icon: no head inside to hide it)
    const px = fx + (bx - fx) * 0.32;
    const py = fy + (by - fy) * 0.32;
    pathPart(
      c,
      (cc) => {
        cc.moveTo(px + ux * 0.24, py + uy * 0.24);
        cc.quadraticCurveTo(px + ux * 0.3 + nx * 0.5, py + uy * 0.3 + ny * 0.5, px + ux * 0.06 + nx * 0.7, py + uy * 0.06 + ny * 0.7);
        cc.quadraticCurveTo(px - ux * 0.22 + nx * 0.62, py - uy * 0.22 + ny * 0.62, px - ux * 0.24, py - uy * 0.24);
        cc.closePath();
      },
      HELM.base,
      (cc) => {
        cc.beginPath();
        cc.moveTo(px + ux * 0.02 + nx * 0.1, py + uy * 0.02 + ny * 0.1);
        cc.lineTo(px + ux * 0.6 + nx * 0.1, py + uy * 0.6 + ny * 0.1);
        cc.lineTo(px + ux * 0.6 + nx * 0.9, py + uy * 0.6 + ny * 0.9);
        cc.lineTo(px + ux * 0.02 + nx * 0.9, py + uy * 0.02 + ny * 0.9);
        cc.closePath();
        cc.fillStyle = HELM.shade;
        cc.fill();
      },
    );
    flat(c, px + nx * 0.42, py + ny * 0.42, 0.055, 0.055, 0, HELM.rim, 0.7);
  }
  pathPart(c, domePath, HELM.shade, (cc) => {
    cc.beginPath();
    cc.ellipse(K.lx * 0.2, -0.1 + K.ly * 0.14, 0.98, 0.9, 0, 0, TAU);
    cc.fillStyle = HELM.base;
    cc.fill();
    if (K.lod) {
      cc.beginPath();
      cc.arc(0, 0, 0.95, K.lx <= 0 ? -0.9 : Math.PI - 0.3, K.lx <= 0 ? -0.3 : Math.PI + 0.3);
      cc.lineWidth = 0.08;
      cc.strokeStyle = HELM.rim;
      cc.stroke();
    }
    cc.beginPath();
    cc.arc(0, 0, 0.72, K.lx <= 0 ? Math.PI + 0.55 : TAU - 1.15, K.lx <= 0 ? Math.PI + 1.15 : TAU - 0.55);
    cc.lineWidth = 0.17;
    cc.strokeStyle = 'rgba(255,255,255,0.95)';
    cc.stroke();
  });
  // the brim band along the edge, with rivets
  limb(c, [fx, fy, (fx + bx) / 2 + 0.03, (fy + by) / 2 + 0.03, bx, by], 0.22, STEEL_DARK.base);
  if (!K.sil) {
    c.fillStyle = HELM.rim;
    c.beginPath();
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      const x = fx + (bx - fx) * k;
      const y = fy + (by - fy) * k + 0.03;
      c.moveTo(x + 0.05, y);
      c.arc(x, y, 0.05, 0, TAU);
    }
    c.fill();
  }
}

export function helmet(c: Ctx) {
  helmetOn(c, false);
}

export function helmetIcon(c: Ctx) {
  helmetOn(c, true);
}

// ------------------------------------------------------------------ sneakers (icon only), centred, toe to the right

const SHOE = tone('#3fc48a', '#1f8f5f', '#a6f0cb');

function upperPath(c: Ctx) {
  c.moveTo(-0.54, 0.1);
  c.lineTo(-0.52, -0.42);
  c.quadraticCurveTo(-0.5, -0.56, -0.34, -0.56);
  c.lineTo(-0.1, -0.54);
  c.quadraticCurveTo(-0.02, -0.3, 0.22, -0.2);
  c.quadraticCurveTo(0.6, -0.08, 0.6, 0.1);
  c.closePath();
}

function solePath(c: Ctx) {
  c.moveTo(-0.58, 0.04);
  c.lineTo(0.56, 0.04);
  c.quadraticCurveTo(0.7, 0.04, 0.68, 0.18);
  c.quadraticCurveTo(0.66, 0.32, 0.52, 0.32);
  c.lineTo(-0.54, 0.32);
  c.quadraticCurveTo(-0.66, 0.32, -0.66, 0.18);
  c.quadraticCurveTo(-0.66, 0.04, -0.58, 0.04);
  c.closePath();
}

export function sneakers(c: Ctx) {
  // the heel tab and the tongue
  limb(c, [-0.5, -0.4, -0.58, -0.6], 0.14, '#ff7a2e');
  limb(c, [-0.14, -0.5, -0.06, -0.66], 0.16, SHOE.shade);
  pathPart(c, upperPath, SHOE.base, (cc) => {
    cc.beginPath();
    cc.ellipse(-0.1, 0.34, 0.8, 0.3, -0.1, 0, TAU);
    cc.fillStyle = SHOE.shade;
    cc.fill();
    // the white toe cap
    cc.beginPath();
    cc.ellipse(0.54, 0.1, 0.26, 0.24, 0, 0, TAU);
    cc.fillStyle = '#ffffff';
    cc.fill();
    cc.lineWidth = K.lw * 0.8;
    cc.strokeStyle = K.ink;
    cc.stroke();
    // a lightning stripe
    cc.beginPath();
    cc.moveTo(-0.44, -0.2);
    cc.lineTo(-0.06, -0.12);
    cc.lineTo(-0.16, -0.04);
    cc.lineTo(0.26, 0.02);
    cc.lineTo(-0.04, 0.06);
    cc.lineTo(-0.22, 0.05);
    cc.lineTo(-0.12, -0.03);
    cc.lineTo(-0.46, -0.08);
    cc.closePath();
    cc.fillStyle = '#ffffff';
    cc.fill();
    cc.stroke();
  });
  // laces
  if (!K.sil) {
    for (let i = 0; i < 3; i++) {
      const x = -0.08 + i * 0.12;
      const y = -0.44 + i * 0.09;
      ink(c, [x - 0.07, y - 0.04, x + 0.07, y + 0.05], 0.09);
      ink(c, [x - 0.07, y - 0.04, x + 0.07, y + 0.05], 0.045, '#ffffff');
    }
  }
  pathPart(c, solePath, '#ffffff', (cc) => {
    cc.fillStyle = '#d2d9e5';
    cc.fillRect(-0.8, 0.23, 1.6, 0.2);
    cc.fillStyle = '#ff7a2e';
    cc.fillRect(-0.8, 0.12, 1.6, 0.05);
  });
  glint(c, [-0.42, -0.4, -0.26, -0.44], 0.06);
}

// ------------------------------------------------------------------ chili (icon only), centred

const CHILI = tone('#ff3d2e', '#c21d1d', '#ff9b84');
const LEAF = tone('#4fd06a', '#24924a', '#b2f5b8');

function chiliPath(c: Ctx) {
  c.moveTo(-0.3, -0.36);
  c.quadraticCurveTo(-0.02, -0.5, 0.18, -0.3);
  c.quadraticCurveTo(0.4, -0.06, 0.34, 0.24);
  c.quadraticCurveTo(0.3, 0.48, 0.02, 0.6);
  c.quadraticCurveTo(0.2, 0.36, 0.06, 0.08);
  c.quadraticCurveTo(-0.08, -0.16, -0.36, -0.14);
  c.quadraticCurveTo(-0.44, -0.3, -0.3, -0.36);
  c.closePath();
}

export function chili(c: Ctx) {
  pathPart(c, chiliPath, CHILI.base, (cc) => {
    // the hard shade along the inner curve
    cc.beginPath();
    cc.moveTo(-0.5, -0.06);
    cc.quadraticCurveTo(-0.02, -0.2, 0.14, 0.12);
    cc.quadraticCurveTo(0.3, 0.42, 0.06, 0.7);
    cc.lineTo(-0.5, 0.7);
    cc.closePath();
    cc.fillStyle = CHILI.shade;
    cc.fill();
    if (K.lod) {
      cc.beginPath();
      cc.moveTo(0.3, 0.02);
      cc.quadraticCurveTo(0.33, 0.3, 0.16, 0.48);
      cc.lineWidth = 0.035;
      cc.strokeStyle = CHILI.rim;
      cc.stroke();
    }
  });
  glint(c, [-0.14, -0.33, 0.06, -0.3, 0.18, -0.16], 0.07);
  if (!K.sil) {
    c.beginPath();
    c.arc(0.25, -0.05, 0.035, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.fill();
  }
  // the stalk and its leafy cap
  limb(c, [-0.36, -0.3, -0.44, -0.46, -0.36, -0.58], 0.08, LEAF.shade);
  ell(c, -0.33, -0.27, 0.15, 0.12, -0.5, LEAF, 0.4);
  ell(c, -0.2, -0.34, 0.12, 0.09, -0.2, LEAF, 0);
}

// ------------------------------------------------------------------ lookup

export const ITEM_ART = { knife, bat, spear, shield, helmet: helmetIcon, sneakers, chili } as const;
