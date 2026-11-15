import { lerp, smooth } from '../../util';
import { B, C, E, PATH, R, RR, type Sh, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inkC, paint, part, put, shoeAt, twoH } from './kit';
// ---------------------------------------------------------------- 9 angler = Snapper: a Venus flytrap growing out of a tin can that
// hops along; its vine stretches far, so its bite is a lunge: the trap pulls back with its jaws wide on the wind-up
// and shoots out along the vine to snap shut on the hit

const SN = { tin: '#aab4c0', trap: '#8cc25a', vine: '#6c9d45', maw: '#7a2f3f', teeth: '#f6f7e6' };
/** the can's height; where the trap's hinge rests */
const CAN_H = 0.94;
const HOME_X = 0.36;
const HOME_Y = -1.86;

/** the can with a band in the corner colour; pivot = its bottom */
const SN_CAN = part('snC', [-0.6, -1.15, 1.2, 1.3], (g) => {
  const can = RR(-0.39, -CAN_H, 0.78, CAN_H, 0.08);
  chunk(g, [[can, SN.tin, 0.1]]);
  clipIn(g, can, () => paint(g, RR(-0.5, -0.6, 1.0, 0.22, 0), accent(), 0.03));
});
/** the vine (ink edge, then green): a piece from (0, 0) to (1, 0) stretched to fit, or a round joint */
const vine = (id: string, ink: boolean, knot: boolean) =>
  part(id, [-0.3, -0.3, 1.6, 0.6], (g) => {
    const w = 0.22 + (ink ? B.lw * 2 : 0);
    g.fillStyle = g.strokeStyle = ink ? inkC() : C(SN.vine);
    g.lineWidth = w;
    g.lineCap = 'butt';
    if (knot) g.fill(E(0, 0, w / 2, w / 2));
    else g.stroke(PATH((p) => { p.moveTo(0, 0); p.lineTo(1, 0); }));
  });
const SN_VINE = [[vine('snVi', true, false), vine('snKi', true, true)], [vine('snV', false, false), vine('snK', false, true)]] as const;
/** the vine's five points this frame (x, y) */
const VP = new Float64Array(10);
/** the dark inside of the open trap; pivot = the hinge */
const SN_MAW = part('snM', [-0.2, -0.45, 1.1, 0.9], (g) => chunk(g, [[E(0.38, 0, 0.4, 0.3), SN.maw, 0]]));
/** the upper jaw with the face and three big teeth; pivot = the hinge at its back, the lip along y = 0 */
const SN_UPPER = part('snU', [-0.3, -0.75, 1.32, 1.1], (g) => {
  const lobe = PATH((p) => {
    p.moveTo(-0.06, 0.02);
    p.bezierCurveTo(-0.12, -0.56, 0.72, -0.66, 0.9, 0.02);
    p.closePath();
  });
  const teeth: Sh[] = [0.24, 0.47, 0.7].map((x) => [PATH((p) => { p.moveTo(x - 0.08, 0); p.lineTo(x, 0.22); p.lineTo(x + 0.08, 0); p.closePath(); }), SN.teeth, 0] as const);
  chunk(g, [...teeth, [lobe, SN.trap, 0.06]]);
  clipIn(g, lobe, () => {
    blush(g, 0.6, -0.12, 0.075);
    eyes(g, 0.32, 0.56, -0.25, 0.125, SN.trap);
  });
});
/** the lower jaw, the same green; pivot = the hinge */
const SN_LOWER = part('snLo', [-0.3, -0.3, 1.2, 0.75], (g) => {
  const lobe = PATH((p) => {
    p.moveTo(-0.06, -0.02);
    p.lineTo(0.82, -0.02);
    p.bezierCurveTo(0.66, 0.42, 0.0, 0.42, -0.06, -0.02);
    p.closePath();
  });
  chunk(g, [[lobe, SN.trap, 0.06]]);
});
const SN_GLOVE = glovePart('snG', SN.vine, 0.92);

function drawSnapper() {
  const t = R.t;
  const ctx = R.ctx;
  const br = Math.sin(t * 2.6 + R.seed);
  const bare = !R.weapon;
  // it hops: the can bounces and sways (it stands in its sneakers when it has them)
  const lift = R.look.sneakers ? 0.14 : 0;
  const sway = Math.sin(R.ph) * 0.05 * R.mv + br * 0.01;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.14 * R.mv - lift;
  const top = bob - CAN_H;
  if (R.look.sneakers) shoeAt(-0.18, 0, 0.5);
  if (!twoH()) put(SN_GLOVE, '', 0.56 + 0.03 * br, -1.14 + bob, -0.4);
  ctx.translate(0, bob);
  ctx.rotate(sway);
  ctx.translate(0, -bob);
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
  const hy = HOME_Y + bob * 0.6 - 0.1 * back + (0.42 + R.aim * 0.55) * ext + (R.cheer ? -0.2 : 0) + br * 0.02;
  // the vine, out of the can: a curve in four stretched pieces
  const x0 = 0.0;
  const y0 = top + 0.12;
  const x1 = lerp(-0.34, 0.7, ext) - 0.1 * back;
  const y1 = lerp(-1.66, -2.2, ext);
  for (let i = 0; i <= 4; i++) {
    const k = i / 4;
    VP[i * 2] = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * x1 + k * k * hx;
    VP[i * 2 + 1] = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * y1 + k * k * hy;
  }
  for (const [piece, joint] of SN_VINE) {
    for (let i = 0; i < 4; i++) {
      const px = VP[i * 2];
      const py = VP[i * 2 + 1];
      const dx = VP[i * 2 + 2] - px;
      const dy = VP[i * 2 + 3] - py;
      put(piece, '', px, py, Math.atan2(dy, dx), Math.hypot(dx, dy), 1);
      put(joint, '', VP[i * 2 + 2], VP[i * 2 + 3]);
    }
  }
  put(SN_CAN, '', 0, bob);
  ctx.translate(0, bob);
  ctx.rotate(-sway);
  ctx.translate(0, -bob);
  if (R.look.sneakers) shoeAt(0.26, 0, 0.54);
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
  aimHand(0.54, -0.84 + bob, bare ? 0.15 : 0.6);
  armsAndWeapon(SN_GLOVE, R.weapon ? -0.6 : -0.2);
}

export const angler = ch(2.2, 0.75, 0.9, [SN.trap, '#b8dc8e', SN.vine], drawSnapper, { lean: 0.06, wl: 0.95 });
