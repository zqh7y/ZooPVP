import { lerp, smooth } from '../../util';
import { B, C, E, PATH, R, RR, type Sh, TAU, WHITE, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inner, mix, paint, part, put, rope, shoeAt, stepX, twoH } from './kit';
// ---------------------------------------------------------------- 9 angler = Snapper: a Venus flytrap growing out of a rusty tin can
// (its label in the corner colour) that rolls about on two roller skates; its vine stretches far, so its bite is a
// lunge: the trap pulls back with its jaws wide on the wind-up and shoots out along the vine to snap shut on the hit

const SN = { tin: '#b9c1ca', tinLight: '#e1e6ec', tinDark: '#8d96a2', rust: '#c47b48', soil: '#6f5140', trap: '#8cc25a', trapDark: '#6c9d45', maw: '#f08a8f', teeth: '#f3f7d8', vine: '#72a858', wheel: '#f2ede3', hub: '#4a4656' };
/** the bottom of the can above the ground, and the soil at its top */
const CAN_Y = -0.27;
const SOIL_Y = -1.36;
/** where the trap's hinge rests */
const HOME_X = 0.36;
const HOME_Y = -2.12;

/** one roller skate: a plate in the corner colour on two wheels; pivot = the ground under it */
const SN_SKATE = part('snSk', [-0.42, -0.45, 0.88, 0.55], (g) => {
  const plate = RR(-0.27, -0.31, 0.52, 0.15, 0.06);
  const stop = E(0.27, -0.17, 0.065, 0.06);
  const w1 = E(-0.15, -0.085, 0.085, 0.085);
  const w2 = E(0.13, -0.085, 0.085, 0.085);
  chunk(g, [[stop, SN.hub, 0], [plate, accent(), 0.04], [w1, SN.wheel, 0.02], [w2, SN.wheel, 0.02]]);
  g.fillStyle = C(SN.hub);
  for (const x of [-0.15, 0.13]) {
    g.beginPath();
    g.arc(x, -0.085, 0.03, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.ellipse(-0.1, -0.27, 0.07, 0.025, 0, 0, TAU);
  g.fillStyle = C(mix(accent(), WHITE, 0.5));
  g.fill();
});
/** the tin can: ridges, a dent, rust, a label in the corner colour, the soil, the lid peeled back; pivot = its bottom */
const SN_CAN = part('snC', [-0.72, -1.55, 1.36, 1.68], (g) => {
  const lid = PATH((p) => {
    // the lid, torn open and bent back: a jagged disc standing up at the back of the rim
    p.moveTo(-0.38, -1.08);
    p.quadraticCurveTo(-0.66, -1.24, -0.52, -1.46);
    p.lineTo(-0.42, -1.4);
    p.lineTo(-0.36, -1.48);
    p.lineTo(-0.26, -1.4);
    p.quadraticCurveTo(-0.16, -1.24, -0.18, -1.08);
    p.closePath();
  });
  const can = RR(-0.46, -1.1, 0.92, 1.1, 0.07);
  const top = E(0, -1.1, 0.46, 0.1);
  chunk(g, [[lid, SN.tinDark, 0.03], [can, SN.tin, 0.12], [top, SN.tinLight, 0]]);
  paint(g, E(0.02, -1.09, 0.38, 0.065), SN.soil, 0);
  clipIn(g, can, () => {
    // a shine down its side, the rolled ridges top and bottom
    paint(g, RR(-0.34, -1.02, 0.1, 0.9, 0.04), SN.tinLight, 0);
    // the label
    const label = RR(-0.6, -0.84, 1.2, 0.5, 0);
    paint(g, label, accent(), 0.04);
    inner(g, label, 0.9);
    const stripe = RR(-0.6, -0.66, 1.2, 0.1, 0);
    paint(g, stripe, '#f2ede3', 0);
    inner(g, stripe, 0.6);
    // rust creeping up from the bottom and a patch on the front
    g.fillStyle = C(SN.rust);
    for (const [x, y, rx, ry] of [[-0.3, -0.04, 0.2, 0.1], [0.12, -0.02, 0.14, 0.08], [0.3, -0.16, 0.08, 0.06], [0.28, -0.98, 0.07, 0.05]] as const) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, TAU);
      g.fill();
    }
    inner(g, PATH((p) => { p.moveTo(-0.46, -0.24); p.quadraticCurveTo(0, -0.18, 0.46, -0.24); p.moveTo(-0.46, -0.96); p.quadraticCurveTo(0, -0.9, 0.46, -0.96); }), 0.7);
  });
  // a dent in the front
  inner(g, PATH((p) => { p.moveTo(0.38, -0.32); p.quadraticCurveTo(0.3, -0.26, 0.36, -0.18); }), 0.8);
});
/** a piece of vine from (0, 0) to (1, 0), stretched along its length to fit */
const SN_VINE = part('snV', [-0.25, -0.25, 1.5, 0.5], (g) => rope(g, PATH((p) => { p.moveTo(0, 0); p.lineTo(1, 0); }), 0.14, SN.vine));
/** a leaf on the vine; pivot = its base */
const SN_LEAF = part('snL', [-0.12, -0.3, 0.6, 0.42], (g) => {
  chunk(g, [[E(0.2, -0.06, 0.2, 0.08, -0.3), SN.vine, 0.02]]);
  inner(g, PATH((p) => { p.moveTo(0.04, 0.0); p.lineTo(0.3, -0.1); }), 0.5);
});
/** the dark inside of the open trap, between the jaws; pivot = the hinge */
const SN_MAW = part('snM', [-0.2, -0.45, 1.1, 0.9], (g) => chunk(g, [[E(0.38, 0, 0.4, 0.3), '#7a2f3f', 0]]));
/** the teeth along a jaw's lip: pointing down (dir 1) or up (dir -1) */
function teeth(x0: number, x1: number, n: number, dir: number): Sh[] {
  const out: Sh[] = [];
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, (i + 0.5) / n);
    out.push([PATH((p) => {
      p.moveTo(x - 0.05, 0);
      p.lineTo(x + 0.01, dir * 0.17);
      p.lineTo(x + 0.05, 0);
      p.closePath();
    }), SN.teeth, 0]);
  }
  return out;
}
/** the upper jaw with the face on it; pivot = the hinge at its back, the lip along y = 0 */
const SN_UPPER = part('snU', [-0.3, -0.75, 1.32, 1.05], (g) => {
  const lobe = PATH((p) => {
    p.moveTo(-0.06, 0.02);
    p.bezierCurveTo(-0.12, -0.56, 0.72, -0.66, 0.9, 0.02);
    p.closePath();
  });
  chunk(g, [...teeth(0.1, 0.84, 5, 1), [lobe, SN.trap, 0.1]]);
  clipIn(g, lobe, () => {
    // the red-pink inside showing along the lip, and the darker vein down the middle
    paint(g, E(0.44, 0.04, 0.5, 0.1), SN.maw, 0);
    inner(g, PATH((p) => { p.moveTo(-0.06, -0.06); p.lineTo(0.86, -0.06); }), 0.7);
  });
  blush(g, 0.6, -0.16, 0.075);
  eyes(g, 0.32, 0.56, -0.28, 0.125, SN.trap);
});
/** the lower jaw; pivot = the hinge */
const SN_LOWER = part('snLo', [-0.3, -0.3, 1.2, 0.75], (g) => {
  const lobe = PATH((p) => {
    p.moveTo(-0.06, -0.02);
    p.lineTo(0.82, -0.02);
    p.bezierCurveTo(0.66, 0.42, 0.0, 0.42, -0.06, -0.02);
    p.closePath();
  });
  chunk(g, [...teeth(0.12, 0.76, 4, -1), [lobe, SN.trapDark, 0.06]]);
  clipIn(g, lobe, () => paint(g, E(0.38, -0.04, 0.46, 0.09), SN.maw, 0));
});
const SN_GLOVE = glovePart('snG', SN.vine, 0.92);

/** a point on the vine's curve: P0 the soil, P1 the bend, P2 the hinge */
const VP = { x: 0, y: 0 };
function onVine(k: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
  const a = (1 - k) * (1 - k);
  const b = 2 * (1 - k) * k;
  const c = k * k;
  VP.x = a * x0 + b * x1 + c * x2;
  VP.y = a * y0 + b * y1 + c * y2;
}

function drawSnapper() {
  const t = R.t;
  const ctx = R.ctx;
  const br = Math.sin(t * 2.6 + R.seed);
  const bare = !R.weapon;
  // it skates: the two skates glide back and forth in turn and the can sways and leans into it
  const sway = Math.sin(R.ph) * 0.06 * R.mv + br * 0.01;
  const bx = -0.24 + stepX(Math.PI, 0.3);
  const fx = 0.24 + stepX(0, 0.3);
  put(SN_SKATE, '', bx, 0);
  if (R.look.sneakers) shoeAt(bx + 0.04, -0.16, 0.5);
  if (!twoH()) put(SN_GLOVE, '', 0.64 + 0.03 * br, -1.42, -0.4);
  if (sway) {
    ctx.translate(0, CAN_Y);
    ctx.rotate(sway);
    ctx.translate(0, -CAN_Y);
  }
  // the bite: how far the vine reaches out (ext), how wide the jaws are (open)
  const sk = R.strike;
  const ft = sk < 0.7 ? 1.12 * smooth(sk / 0.7) : lerp(1.12, 1, (sk - 0.7) / 0.3);
  const ext = bare && !R.cheer ? ft : 0;
  const back = bare ? R.wind : 0;
  const m = B.mouth;
  const calm = m === 'open' || m === 'grin' || m === 'wavy' || m === 'o' ? 0.42 : m === 'smile' ? 0.2 : m === 'tongue' ? 0.3 : 0.06;
  let open = bare ? Math.max(calm, 0.9 * back) : calm;
  if (bare && sk > 0) open = sk > 0.55 ? 0.02 : lerp(0.55, 0.02, sk / 0.55);
  open += Math.max(0, br) * 0.04 * (1 - R.mv);
  const hx = HOME_X - 0.26 * back + 2.05 * ext + Math.sin(t * 1.9 + R.seed) * 0.03 * (1 - ext);
  const hy = HOME_Y - 0.1 * back + (0.42 + R.aim * 0.55) * ext + (R.cheer ? -0.2 : 0) + br * 0.02;
  // the vine, out of the soil in the can: a curve in four stretched pieces, a leaf on it
  const x0 = 0.0;
  const y0 = SOIL_Y + 0.1;
  const x1 = lerp(-0.34, 0.7, ext) - 0.1 * back;
  const y1 = lerp(-1.95, -2.5, ext);
  let px = x0;
  let py = y0;
  for (let i = 1; i <= 4; i++) {
    onVine(i / 4, x0, y0, x1, y1, hx, hy);
    const dx = VP.x - px;
    const dy = VP.y - py;
    put(SN_VINE, '', px, py, Math.atan2(dy, dx), Math.hypot(dx, dy), 1);
    if (i === 1) put(SN_LEAF, '', VP.x, VP.y, -0.5 + br * 0.08 - ext * 0.3, 1, 1);
    px = VP.x;
    py = VP.y;
  }
  put(SN_CAN, '', 0, CAN_Y);
  if (sway) {
    ctx.translate(0, CAN_Y);
    ctx.rotate(-sway);
    ctx.translate(0, -CAN_Y);
  }
  put(SN_SKATE, '', fx, 0);
  if (R.look.sneakers) shoeAt(fx + 0.04, -0.16, 0.54);
  // the trap: the maw, the lower jaw, the upper jaw (with the face) tipped up as it opens
  const tilt = (R.aim * 0.35 + 0.15) * ext - 0.06 * back;
  if (open > 0.05) put(SN_MAW, '', hx, hy, tilt, 1, Math.min(1, open * 1.4));
  put(SN_LOWER, '', hx, hy, tilt + 0.5 * open);
  put(SN_UPPER, R.fk, hx, hy, tilt - 0.55 * open);
  const ux = hx + 0.38;
  const uy = hy - 0.36 - 0.12 * open;
  helmetAt(ux, uy, 1.3, tilt - 0.1 - 0.3 * open);
  crownAt(ux, uy - (R.look.helmet ? 0.42 : 0.12), tilt - 0.15 - 0.3 * open);
  chiliAt(ux + 0.1, uy - 0.6, 0.85);
  // the near glove: on guard while the trap bites; the weapon hand when armed
  aimHand(0.6, -1.08, bare ? 0.15 : 0.6);
  armsAndWeapon(SN_GLOVE, R.weapon ? -0.6 : -0.2);
}

export const angler = ch(2.45, 0.85, 1.0, [SN.trap, SN.tinLight, SN.tin], drawSnapper, { lean: 0.06, wl: 0.95 });
