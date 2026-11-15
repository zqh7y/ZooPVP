import { clamp, lerp, smooth } from '../../util';
import { C, E, H, PATH, R, RR, type Sh, TAU, WHITE, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inkC, inner, mouth, paint, part, put, rope, shoeAt, twoH } from './kit';
// ---------------------------------------------------------------- 7 pogo = Dandy: a dandelion living in a round fishbowl (water,
// sand, bubbles) on a little cart with TWO wheels; it rolls about, and for its leap (any pose.hop) it pops its
// seed-puff open like a parachute and floats over with the bowl dangling under it

const DD = { puff: '#f8f3e5', seed: '#c9bfa6', collar: '#f2c64a', stem: '#77aa62', glass: '#d8f1f3', water: '#8ccfdf', sand: '#ead39b', tyre: '#4a4656', hub: '#e6e9ee' };
/** where the bowl's middle and the head's middle are above the feet */
const BOWL_Y = -1.06;
const HEAD_Y = -2.12;
const WHEEL_R = 0.27;

const DD_WHEEL = part('ddW', [-0.42, -0.42, 0.84, 0.84], (g) => {
  const tyre = E(0, 0, WHEEL_R, WHEEL_R);
  chunk(g, [[tyre, DD.tyre, 0.04]]);
  const hub = E(0, 0, 0.14, 0.14);
  paint(g, hub, accent(), 0.03);
  inner(g, hub, 0.8);
  // three bolts, so it is seen to roll
  g.fillStyle = C(WHITE);
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3;
    g.beginPath();
    g.arc(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.03, 0, TAU);
    g.fill();
  }
});
/** the cart: a little tray in the corner colour with a white stripe, on two axles; pivot = the feet */
const DD_CART = part('ddCt', [-0.92, -0.86, 1.84, 0.74], (g) => {
  const tray = PATH((p) => {
    p.moveTo(-0.74, -0.66);
    p.quadraticCurveTo(0, -0.5, 0.74, -0.66);
    p.lineTo(0.66, -0.36);
    p.quadraticCurveTo(0, -0.3, -0.66, -0.36);
    p.closePath();
  });
  chunk(g, [[tray, accent(), 0.06]]);
  clipIn(g, tray, () => {
    const stripe = PATH((p) => {
      p.moveTo(-0.8, -0.56);
      p.quadraticCurveTo(0, -0.4, 0.8, -0.56);
      p.lineTo(0.8, -0.49);
      p.quadraticCurveTo(0, -0.33, -0.8, -0.49);
      p.closePath();
    });
    paint(g, stripe, '#f2ede3', 0);
  });
});
/** the bowl and what lives in it: pivot = the middle of the bowl. The stem rises out of the top to the head. */
const DD_BOWL = part('ddB', [-0.82, -1.3, 1.64, 2.0], (g) => {
  const rad = 0.58;
  const lipY = -0.43;
  const a0 = Math.atan2(lipY, Math.sqrt(rad * rad - lipY * lipY));
  // from the right of the lip round under the bottom to the left of it
  const glass = PATH((p) => {
    p.arc(0, 0, rad, a0, Math.PI - a0, false);
    p.closePath();
  });
  // the stem out of the top, behind the lip
  rope(g, PATH((p) => { p.moveTo(0, -0.3); p.quadraticCurveTo(0.06, -0.7, 0.04, -1.1); }), 0.12, DD.stem);
  chunk(g, [[glass, DD.glass, 0]]);
  clipIn(g, glass, () => {
    const water = PATH((p) => {
      p.moveTo(-0.7, -0.2);
      p.quadraticCurveTo(-0.35, -0.29, 0, -0.2);
      p.quadraticCurveTo(0.35, -0.11, 0.7, -0.2);
      p.lineTo(0.7, 0.7);
      p.lineTo(-0.7, 0.7);
      p.closePath();
    });
    paint(g, water, DD.water, 0.05);
    inner(g, PATH((p) => {
      p.moveTo(-0.7, -0.2);
      p.quadraticCurveTo(-0.35, -0.29, 0, -0.2);
      p.quadraticCurveTo(0.35, -0.11, 0.7, -0.2);
    }), 0.7);
    // the stem in the water, rooted in the sand, with two jagged leaves
    rope(g, PATH((p) => { p.moveTo(0.0, 0.5); p.quadraticCurveTo(-0.05, 0.0, 0, -0.5); }), 0.12, DD.stem);
    const leaf = (x: number, y: number, dir: number) =>
      PATH((p) => {
        p.moveTo(x, y);
        p.lineTo(x + dir * 0.12, y - 0.12);
        p.lineTo(x + dir * 0.1, y - 0.05);
        p.lineTo(x + dir * 0.26, y - 0.2);
        p.lineTo(x + dir * 0.22, y - 0.1);
        p.lineTo(x + dir * 0.38, y - 0.2);
        p.quadraticCurveTo(x + dir * 0.3, y + 0.04, x, y + 0.06);
        p.closePath();
      });
    chunk(g, [[leaf(-0.02, 0.36, -1), DD.stem, 0], [leaf(0.02, 0.26, 1), DD.stem, 0]]);
    chunk(g, [[E(0, 0.62, 0.7, 0.2), DD.sand, 0.03]]);
    // bubbles
    g.lineWidth = 0.035;
    g.strokeStyle = C(WHITE);
    for (const [x, y, r] of [[0.3, -0.02, 0.06], [0.22, 0.14, 0.04], [-0.33, 0.04, 0.045]] as const) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.stroke();
    }
  });
  // the shine on the glass
  g.globalAlpha = 0.9;
  g.strokeStyle = C(WHITE);
  g.lineWidth = 0.075;
  g.beginPath();
  g.arc(0, 0, rad - 0.11, Math.PI * 0.95, Math.PI * 1.22);
  g.stroke();
  g.beginPath();
  g.arc(0.3, 0.3, 0.03, 0, TAU);
  g.fillStyle = C(WHITE);
  g.fill();
  g.globalAlpha = 1;
  // the lip of the opening, over the stem
  const x0 = Math.sqrt(rad * rad - lipY * lipY);
  chunk(g, [[RR(-x0 - 0.06, lipY - 0.07, (x0 + 0.06) * 2, 0.12, 0.06), DD.glass, 0]]);
});
/** the seed-puff head with its face, a yellow collar under it: pivot = the middle of the puff */
const DD_HEAD = part('ddH', [-0.82, -0.9, 1.64, 1.62], (g) => {
  const sh: Sh[] = [];
  for (const [x, rot] of [[-0.2, -0.5], [0.0, 0.0], [0.2, 0.5]] as const) sh.push([E(x, 0.38, 0.09, 0.15, rot), DD.collar, 0]);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    sh.push([E(Math.cos(a) * 0.43, Math.sin(a) * 0.41, 0.12, 0.12), DD.puff, 0.02]);
  }
  sh.push([E(0, 0, 0.47, 0.45), DD.puff, 0.08]);
  chunk(g, sh);
  // the seeds of the clock: fine lines fanning out to the fluff round the top and back
  g.lineWidth = 0.028;
  g.strokeStyle = C(DD.seed);
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.8 + i * 0.16);
    g.moveTo(Math.cos(a) * 0.24, Math.sin(a) * 0.23);
    g.lineTo(Math.cos(a) * 0.42, Math.sin(a) * 0.4);
  }
  g.stroke();
  blush(g, 0.06, 0.16, 0.085);
  eyes(g, 0.1, 0.35, -0.02, 0.135, DD.puff);
  mouth(g, 0.24, 0.2, 0.11);
});
/** the seed-puff popped open into a parachute: pivot = where the strings meet (the top of the head) */
const DD_CHUTE = part('ddCh', [-1.45, -1.85, 2.9, 2.0], (g) => {
  const y0 = -0.98;
  g.lineWidth = 0.04;
  g.strokeStyle = inkC();
  g.beginPath();
  for (const x of [-1.04, -0.4, 0.4, 1.04]) {
    g.moveTo(x, y0 + 0.08);
    g.lineTo(0, 0);
  }
  g.stroke();
  const dome = PATH((p) => {
    p.moveTo(-1.24, y0);
    p.bezierCurveTo(-1.2, y0 - 0.98, 1.2, y0 - 0.98, 1.24, y0);
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const x = 1.24 - (2.48 * i) / n;
      p.quadraticCurveTo(x + 1.24 / n, y0 + 0.2, x, y0);
    }
    p.closePath();
  });
  chunk(g, [[dome, DD.puff, 0.12]]);
  clipIn(g, dome, () => {
    g.lineWidth = 0.035;
    g.strokeStyle = C(DD.seed);
    g.beginPath();
    for (const x of [-0.84, -0.42, 0, 0.42, 0.84]) {
      g.moveTo(x * 0.45, y0 + 0.05);
      g.lineTo(x, y0 - 0.62 + Math.abs(x) * 0.2);
    }
    g.stroke();
  });
});
const DD_GLOVE = glovePart('ddG', DD.stem, 0.95);

function drawDandy() {
  const t = R.t;
  const ctx = R.ctx;
  const br = Math.sin(t * 2.6 + R.seed);
  const h = clamp(R.pose.hop, 0, 1);
  // the parachute: open while it is off the ground
  const c = smooth(clamp((h - 0.08) / 0.4, 0, 1));
  const bare = !R.weapon;
  const lurch = bare ? 0.12 * R.strike - 0.08 * R.wind : 0;
  const bump = -Math.abs(Math.sin(R.ph * 2)) * 0.025 * R.mv;
  const hx = 0.04 + lurch * 0.6;
  const hy = HEAD_Y + bump + br * 0.015 - 0.1 * c;
  if (c > 0.02) put(DD_CHUTE, '', hx, hy - 0.36, Math.sin(t * 2.4 + R.seed) * 0.06 * c, 0.3 + 0.7 * c, 0.2 + 0.8 * c);
  // everything under the head hangs from it while it floats
  const swing = c * Math.sin(t * 3.2 + R.seed) * 0.12 - 0.08 * c;
  if (swing) {
    ctx.translate(hx, hy);
    ctx.rotate(swing);
    ctx.translate(-hx, -hy);
  }
  const roll = R.pose.walk / (R.r * WHEEL_R) + c * t * 8;
  const wy = -WHEEL_R + 0.1 * c;
  if (R.look.sneakers) {
    shoeAt(-0.44 + lurch + 0.08, wy + WHEEL_R, 0.44);
    shoeAt(0.5 + lurch + 0.08, wy + WHEEL_R, 0.46);
  }
  put(DD_WHEEL, '', -0.46 + lurch, wy, roll);
  put(DD_WHEEL, '', 0.5 + lurch, wy, roll);
  // the far glove, up by the bowl (or holding on to the strings in the air)
  if (!twoH()) put(DD_GLOVE, '', lerp(0.72 + 0.03 * br, 0.5, c), lerp(-1.3, hy - 0.42, c) + bump, -0.45 - 0.6 * c);
  put(DD_CART, '', lurch, bump * 0.5);
  put(DD_BOWL, '', lurch * 0.8, BOWL_Y + bump, lurch * 0.3 + Math.sin(R.ph * 2) * 0.02 * R.mv);
  if (swing) {
    ctx.translate(hx, hy);
    ctx.rotate(-swing);
    ctx.translate(-hx, -hy);
  }
  put(DD_HEAD, R.fk, hx, hy, lurch * 0.4 + br * 0.02);
  helmetAt(hx + 0.04, hy - 0.4, 1.6, -0.08);
  crownAt(hx + 0.05, hy - (R.look.helmet ? 0.86 : 0.6));
  chiliAt(hx + 0.14, hy - 1.0, 0.95);
  aimHand(0.62, -1.12 + bump, 0.66);
  if (bare && c > 0.3 && !R.cheer) {
    H.x = lerp(H.x, -0.36, c);
    H.y = lerp(H.y, hy - 0.34, c);
  }
  armsAndWeapon(DD_GLOVE, R.weapon ? -0.6 : -0.2 + 0.2 * R.strike - 0.9 * c);
}

export const dandy = ch(2.6, 0.95, 1.2, [DD.puff, DD.water, DD.tyre], drawDandy, { hop: 1.6, lean: 0.04, wl: 0.95 });
