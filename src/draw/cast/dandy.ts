import { clamp, lerp, smooth } from '../../util';
import { B, E, H, PATH, R, RR, TAU, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inkC, mouth, paint, part, put, rope, shoeAt, twoH } from './kit';
// ---------------------------------------------------------------- 7 pogo = Dandy: a dandelion puff living in a round fishbowl
// on TWO wheels; it rolls about, and for its leap (any pose.hop) its puff pops open into a parachute and it floats
// over with the bowl dangling under it

const DD = { puff: '#f8f3e5', stem: '#77aa62', water: '#8ccfdf', glass: '#bfe7ef', tyre: '#5b5769' };
/** where the bowl's middle and the head's middle are above the feet */
const BOWL_Y = -0.92;
const HEAD_Y = -2.04;
const WHEEL_R = 0.22;

const DD_WHEEL = part('ddW', [-0.4, -0.4, 0.8, 0.8], (g) => chunk(g, [[E(0, 0, WHEEL_R, WHEEL_R), DD.tyre, 0.04]]));
/** the bowl of water with the stem rising out of it to the head, the corner band round its neck: pivot = its middle */
const DD_BOWL = part('ddB', [-0.82, -1.26, 1.64, 1.96], (g) => {
  rope(g, PATH((p) => { p.moveTo(0, -0.3); p.quadraticCurveTo(0.06, -0.7, 0.04, -1.12); }), 0.12, DD.stem);
  const bowl = E(0, 0, 0.58, 0.56);
  chunk(g, [[bowl, DD.water, 0.08]]);
  clipIn(g, bowl, () => paint(g, E(-0.08, -0.5, 0.5, 0.3), DD.glass, 0));
  chunk(g, [[RR(-0.46, -0.62, 0.92, 0.2, 0.09), accent(), 0.04]]);
});
/** the puff with its face, seven soft seed points round it: pivot = its middle */
const DD_HEAD = part('ddH', [-0.82, -0.82, 1.64, 1.64], (g) => {
  const n = 7;
  const at = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r * 0.96];
  const puff = PATH((p) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.25) / n) * TAU;
      const h = Math.PI / n;
      p.lineTo(...at(a - h, 0.47));
      p.quadraticCurveTo(...at(a - h * 0.6, 0.66), ...at(a, 0.68));
      p.quadraticCurveTo(...at(a + h * 0.6, 0.66), ...at(a + h, 0.47));
    }
    p.closePath();
  });
  chunk(g, [[puff, DD.puff, 0.08]]);
  blush(g, 0.06, 0.16, 0.085);
  eyes(g, 0.1, 0.35, -0.02, 0.135, DD.puff);
  mouth(g, 0.24, 0.2, 0.11);
});
/** the puff popped open into a parachute: pivot = where the strings meet (the top of the head) */
const DD_CHUTE = part('ddCh', [-1.45, -1.85, 2.9, 2.0], (g) => {
  const y0 = -0.98;
  g.lineWidth = B.lw;
  g.strokeStyle = inkC();
  g.beginPath();
  for (const x of [-0.96, 0.96]) {
    g.moveTo(x, y0 + 0.06);
    g.lineTo(0, 0);
  }
  g.stroke();
  const dome = PATH((p) => {
    p.moveTo(-1.24, y0);
    p.bezierCurveTo(-1.2, y0 - 0.98, 1.2, y0 - 0.98, 1.24, y0);
    p.quadraticCurveTo(0, y0 + 0.16, -1.24, y0);
    p.closePath();
  });
  chunk(g, [[dome, DD.puff, 0.12]]);
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
  const wy = -WHEEL_R + 0.1 * c;
  if (R.look.sneakers) {
    shoeAt(-0.36 + lurch + 0.08, wy + WHEEL_R, 0.44);
    shoeAt(0.4 + lurch + 0.08, wy + WHEEL_R, 0.46);
  }
  put(DD_WHEEL, '', -0.36 + lurch, wy);
  put(DD_WHEEL, '', 0.4 + lurch, wy);
  // the far glove, up by the bowl (or holding on to the strings in the air)
  if (!twoH()) put(DD_GLOVE, '', lerp(0.72 + 0.03 * br, 0.5, c), lerp(-1.2, hy - 0.42, c) + bump, -0.45 - 0.6 * c);
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
  aimHand(0.62, -1.02 + bump, 0.66);
  if (bare && c > 0.3 && !R.cheer) {
    H.x = lerp(H.x, -0.36, c);
    H.y = lerp(H.y, hy - 0.34, c);
  }
  armsAndWeapon(DD_GLOVE, R.weapon ? -0.6 : -0.2 + 0.2 * R.strike - 0.9 * c);
}

export const dandy = ch(2.58, 0.9, 1.1, [DD.puff, DD.water, '#6fb3c4'], drawDandy, { hop: 1.6, lean: 0.04, wl: 0.95 });
