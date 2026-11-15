import { lerp, smooth } from '../../util';
import { E, H, H2, R, RR, type Part, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, mouth, paint, part, put, shoeAt, stepX, stepY, trunksIn, twoH } from './kit';
// ---------------------------------------------------------------- 11 rhino = Bamboo: a wobbly stack of two bamboo segments with one
// face on top and trunks in the corner colour. Bare-handed it pulls out a bamboo staff to fight with: a poke on the
// strike, levelled like a lance on its run-up (the charge)

const BB = { green: '#94c45a', node: '#7cab48', staff: '#d9c071' };
const SEG_H = 0.95;
/** the bottom of the lower segment above the feet */
const BASE = -0.22;

const BB_FOOT = part('bbF', [-0.42, -0.35, 0.9, 0.47], (g) => chunk(g, [[E(0.08, -0.08, 0.22, 0.1), BB.node, 0.03]]));
const BB_GLOVE = glovePart('bbG', BB.green, 0.92);
/** the staff: pivot = the near hand's grip, pointing forward (+x) */
const BB_STAFF = part('bbSt', [-1.25, -0.2, 2.75, 0.4], (g) => chunk(g, [[RR(-1.05, -0.065, 2.4, 0.13, 0.065), BB.staff, 0.03]]));

/** a segment: a green tube; the lower one has the trunks and its node ring (a shade, no ink) at the top, the upper
 * one the face and a leaf; pivot = its bottom middle */
function segPart(id: string, top: boolean, w: number): Part {
  return part(id, [-w / 2 - 0.25, -SEG_H - 0.5, w + 0.5, SEG_H + 0.68], (g) => {
    const tube = RR(-w / 2, -SEG_H, w, SEG_H + 0.04, 0.13);
    if (top) chunk(g, [[E(0.1, -SEG_H - 0.18, 0.24, 0.08, -0.7), BB.green, 0], [tube, BB.green, 0.1]]);
    else chunk(g, [[tube, BB.green, 0.1]]);
    if (!top) {
      clipIn(g, tube, () => paint(g, RR(-w, -SEG_H, w * 2, 0.16, 0), BB.node, 0));
      trunksIn(g, tube, -w / 2 - 0.1, w / 2 + 0.1, -0.36, 0.1, 0.03);
      return;
    }
    blush(g, 0.08, -0.36, 0.08);
    eyes(g, 0.12, 0.34, -0.54, 0.12, BB.green);
    mouth(g, 0.24, -0.32, 0.09);
  });
}
const BB_BOT = segPart('bbS0', false, 0.9);
const BB_TOP = segPart('bbS1', true, 0.82);

function drawBamboo() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const bare = !R.weapon;
  // the run-up: an angry face while walking is its charge, staff levelled
  const charge = bare && R.pose.mood === 'angry' && R.mv > 0.3 && !R.wind && !R.strike ? R.mv : 0;
  // the stack wobbles: the top segment lags the one under it
  const sway = Math.sin(R.ph) * 0.05 * R.mv + br * 0.012;
  const jolt = R.hurt;
  const lunge = bare ? 0.12 * R.strike - 0.08 * R.wind : 0;
  const fx = -0.22 + stepX(Math.PI, 0.24);
  const nx = 0.22 + stepX(0, 0.24);
  const fy = stepY(Math.PI, 0.15);
  const ny = stepY(0, 0.15);
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  const sk = R.strike;
  // the staff comes out only to fight bare-handed (wind-up, strike, charge); otherwise the gloves are up like Roo's
  const lv = bare && !R.cheer ? smooth(Math.max(R.wind, Math.min(1, sk * 2), charge)) : 0;
  put(BB_FOOT, '', fx, fy);
  if (R.look.sneakers) shoeAt(fx + 0.06, fy, 0.5);
  const fgx = 0.66 + 0.03 * br;
  const fgy = -1.36 + bob;
  if (lv <= 0.02 && !twoH()) put(BB_GLOVE, '', fgx, fgy, -0.4);
  const x1 = sway * 2 + lunge + 0.06 * jolt + 0.1 * charge;
  const y0 = BASE + bob;
  const y1 = y0 - SEG_H - 0.04 * jolt;
  const r1 = sway * 1.2 + lunge * 0.5 + 0.1 * jolt + 0.1 * charge;
  put(BB_BOT, '', 0, y0, sway * 0.4);
  put(BB_FOOT, '', nx, ny);
  if (R.look.sneakers) shoeAt(nx + 0.06, ny, 0.54);
  put(BB_TOP, R.fk, x1, y1, r1);
  const tx = x1 + Math.sin(r1) * SEG_H;
  const ty = y1 - Math.cos(r1) * SEG_H;
  helmetAt(tx + 0.02, ty + 0.12, 1.45, r1 - 0.06);
  crownAt(tx + 0.04, ty - (R.look.helmet ? 0.36 : 0.28), r1 - 0.12);
  chiliAt(tx + 0.12, ty - 0.7, 0.9);
  aimHand(0.56, -1.0 + bob, 0.6);
  if (lv > 0.02) {
    // both fists on the levelled staff, the far one behind the near one; it slides out as they close on it
    const ft = sk < 0.7 ? 1.15 * smooth(sk / 0.7) : lerp(1.15, 1, (sk - 0.7) / 0.3);
    const a = (sk > 0 ? R.aim * 0.35 : 0.06) + 0.05 * R.wind;
    const gx = 0.56 - 0.3 * R.wind + 0.75 * ft + 0.1 * charge;
    const gy = -1.0 + bob - 0.08 * R.wind + R.aim * 0.25 * ft + 0.08 * charge;
    put(BB_STAFF, '', gx, gy, a, smooth(Math.min(1, lv * 1.6)), 1);
    put(BB_GLOVE, '', lerp(fgx, gx - 0.5 * Math.cos(a), lv), lerp(fgy, gy - 0.5 * Math.sin(a), lv), 0);
    H2.on = false;
    H.x = gx;
    H.y = gy;
    H.a = 0;
    H.s = 1;
  }
  armsAndWeapon(BB_GLOVE, R.weapon ? -0.6 : lv > 0.02 ? 0 : -0.15);
}

export const rhino = ch(2.4, 0.95, 1.15, [BB.green, '#c4e08c', BB.node], drawBamboo, { lean: 0.06, wl: 1.1 });
