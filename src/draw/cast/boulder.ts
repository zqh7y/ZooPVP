import { lerp } from '../../util';
import { E, PATH, R, RR, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, crownAt, eyes, helmetAt, mouth, part, put, shoeAt, stepX, stepY, trunksIn, twoH } from './kit';
// ---------------------------------------------------------------- 12 boulder = Oak: an ancient oak giant with a round leafy crown,
// trunks in the corner colour and root fists. Its smash is a ground-pound: both fists go up high beside the crown and
// come down on the ground ahead.

const OK = { bark: '#8e6a4b', dark: '#6b4c35', leaf: '#76a85a' };

const OK_FOOT = part('okF', [-0.5, -0.4, 1.05, 0.52], (g) => chunk(g, [[E(0.06, -0.12, 0.33, 0.14), OK.dark, 0.04]]));
/** a root fist: a ball of wood, the wrist taped in the corner colour */
const OK_HAND = part('okH', [-0.55, -0.45, 1.0, 0.9], (g) => chunk(g, [[E(0.06, 0, 0.23, 0.21), OK.bark, 0.06], [RR(-0.33, -0.16, 0.27, 0.32, 0.07), accent(), 0.03]]));
/** the round leafy crown: one cloud with three bumps; pivot = the top of the trunk */
const OK_CROWN = part('okC', [-1.15, -1.4, 2.3, 1.65], (g) => {
  const cloud = PATH((p) => {
    p.arc(-0.52, -0.36, 0.46, 2.43, 4.61);
    p.arc(0, -0.62, 0.6, -2.81, -0.27);
    p.arc(0.54, -0.34, 0.44, -1.48, 0.69);
    p.quadraticCurveTo(0, 0.22, -0.87, -0.06);
    p.closePath();
  });
  chunk(g, [[cloud, OK.leaf, 0.12]]);
});
/** the trunk: the face, the trunks; pivot = the feet */
const OK_BODY = part('okB', [-1.0, -2.3, 2.0, 2.4], (g) => {
  const trunk = PATH((p) => {
    p.moveTo(-0.78, -0.12);
    p.quadraticCurveTo(-0.86, -1.0, -0.68, -2.06);
    p.quadraticCurveTo(0, -2.22, 0.7, -2.06);
    p.quadraticCurveTo(0.86, -1.0, 0.8, -0.12);
    p.quadraticCurveTo(0, 0.0, -0.78, -0.12);
    p.closePath();
  });
  chunk(g, [[trunk, OK.bark, 0.15]]);
  trunksIn(g, trunk, -0.9, 0.9, -0.5, 0.1, 0.05);
  blush(g, 0.0, -1.3, 0.1);
  eyes(g, 0.14, 0.44, -1.52, 0.16, OK.bark);
  mouth(g, 0.3, -1.24, 0.13);
});

/** it is drawn a little smaller than its own units, so the top rung stays big without towering over the pitch */
const K = 0.92;

function drawOak() {
  R.ctx.scale(K, K);
  drawOakAt();
  R.ctx.scale(1 / K, 1 / K);
}

function drawOakAt() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  const sway = Math.sin(R.ph) * 0.05 * R.mv + br * 0.01;
  const sk = R.strike;
  const bare = !R.weapon;
  const pound = bare && !R.cheer && (R.wind > 0 || sk > 0);
  const fx = -0.38 + stepX(Math.PI, 0.18);
  const nx = 0.38 + stepX(0, 0.18);
  const fy = stepY(Math.PI, 0.14);
  const ny = stepY(0, 0.14);
  put(OK_FOOT, '', fx, fy);
  if (R.look.sneakers) shoeAt(fx + 0.06, fy, 0.66);
  // the far fist on guard, or up with the other for the ground-pound: beside the crown, behind it
  const wy = lerp(-0.82 + bob, -2.3, R.wind) + (0.42 + R.aim * 0.3) * sk * 1.6;
  const wx = lerp(0.95, 1.24, R.wind) + 0.3 * sk;
  if (!twoH()) {
    if (pound) put(OK_HAND, '', wx - 0.16, wy - 0.2, -0.6 + 0.9 * sk);
    else put(OK_HAND, '', 1.02 + 0.03 * br, -1.1 + bob, -0.5);
  }
  const sq = bare ? 0.05 * sk : 0;
  put(OK_BODY, R.fk, 0, bob, sway, 1 + sq, 1 - sq);
  put(OK_FOOT, '', nx, ny);
  if (R.look.sneakers) shoeAt(nx + 0.06, ny, 0.7);
  if (pound) put(OK_HAND, '', wx, wy, -0.2 + 0.6 * sk);
  // the leafy crown rustles
  const cx = sway * 2.2;
  const cy = -2.04 + bob;
  if (!R.look.helmet) put(OK_CROWN, '', cx, cy, sway * 0.8 + Math.sin(t * 1.9 + R.seed) * 0.03 - 0.06 * R.hurt);
  helmetAt(cx + 0.06, cy - 0.02, 1.9, -0.06 + sway);
  crownAt(cx + 0.1, cy - (R.look.helmet ? 0.64 : 0.98), -0.12 + sway);
  chiliAt(cx + 0.2, cy - 1.1, 1.05);
  if (pound) return;
  aimHand(0.92, -0.82 + bob, 0.55);
  armsAndWeapon(OK_HAND, R.weapon ? -0.6 : -0.2 + 0.6 * sk);
}

export const boulder = ch(2.6 * K, 1.15, 1.1 * K, [OK.bark, OK.leaf, OK.dark], drawOak, { lean: 0.04, wl: 1.15 });
