import { clamp } from '../../util';
import { B, C, E, PATH, R, TAU, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, crownAt, eyes, glovePart, helmetAt, inner, paint, part, put, shadeOf, shoeAt, stepX, stepY, trunksIn, twoH } from './kit';
// ---------------------------------------------------------------- 10 sumo = Pumpkin: a round pumpkin in corner-colour trunks whose
// grin is carved and lit from inside. Its belly slide is a BOWLING ROLL: limbs tucked in, it rolls over and over

const PK = { skin: '#ee9a45', stem: '#6f8a45', glow: '#ffd36a' };
/** the pumpkin's middle above the feet, and its radius */
const CY = -1.0;
const RAD = 0.86;

const PK_FOOT = part('pkF', [-0.42, -0.42, 0.9, 0.54], (g) => chunk(g, [[E(0.07, -0.1, 0.25, 0.12), PK.stem, 0.04]]));
const PK_GLOVE = glovePart('pkG', PK.stem, 1.05);

/** the grin for B.mouth, around (x, y) */
function grin(m: string, x: number, y: number): Path2D {
  return PATH((p) => {
    if (m === 'open') p.ellipse(x, y + 0.06, 0.24, 0.22, 0, 0, TAU);
    else if (m === 'o') p.ellipse(x, y + 0.05, 0.1, 0.13, 0, 0, TAU);
    else if (m === 'smile' || m === 'grin') {
      // the jack-o'-lantern's crescent with one square tooth
      p.moveTo(x - 0.36, y - 0.12);
      p.quadraticCurveTo(x, y + 0.02, x + 0.38, y - 0.18);
      p.quadraticCurveTo(x + 0.3, y + 0.3, x + 0.08, y + 0.3);
      p.lineTo(x + 0.08, y + 0.16);
      p.lineTo(x - 0.06, y + 0.16);
      p.lineTo(x - 0.06, y + 0.3);
      p.quadraticCurveTo(x - 0.34, y + 0.26, x - 0.36, y - 0.12);
    } else {
      p.moveTo(x - 0.28, y - 0.02);
      p.lineTo(x + 0.3, y - 0.06);
      p.lineTo(x + 0.28, y + 0.08);
      p.lineTo(x - 0.26, y + 0.1);
    }
    p.closePath();
  });
}

/** the pumpkin: one round body with its stem, two shade creases and the trunks, and the face (dot eyes, the lit grin)
 * unless it is rolling; pivot = its middle */
const pumpkin = (id: string, face: boolean) =>
  part(id, [-1.12, -1.18, 2.24, 2.22], (g) => {
    const stem = PATH((p) => {
      p.moveTo(-0.12, -0.74);
      p.quadraticCurveTo(-0.14, -0.92, -0.26, -1.02);
      p.lineTo(-0.12, -1.08);
      p.quadraticCurveTo(0.0, -0.94, 0.06, -0.74);
      p.closePath();
    });
    const ball = E(0, 0, 0.92, RAD);
    chunk(g, [[stem, PK.stem, 0.03], [ball, PK.skin, 0.13]]);
    g.lineWidth = 0.06;
    g.lineCap = 'round';
    g.strokeStyle = shadeOf(C(PK.skin));
    g.stroke(PATH((p) => {
      p.moveTo(-0.34, -0.74);
      p.quadraticCurveTo(-0.5, -0.56, -0.5, -0.3);
      p.moveTo(0.36, -0.74);
      p.quadraticCurveTo(0.54, -0.6, 0.6, -0.42);
    }));
    trunksIn(g, ball, -0.7, 1.3, 0.46, 0.9, 0.08);
    if (!face) return;
    const m = grin(B.mouth, 0.38, 0.1);
    paint(g, m, PK.glow, 0);
    inner(g, m, 1);
    blush(g, 0.02, -0.1, 0.09);
    eyes(g, 0.18, 0.56, -0.3, 0.14, PK.skin);
  });
const PK_BODY = pumpkin('pkB', true);
const PK_BALL = pumpkin('pkR', false);

function drawPumpkin() {
  const t = R.t;
  const ctx = R.ctx;
  const pose = R.pose;
  const br = Math.sin(t * 2.6 + R.seed);
  // the bowling roll: the battle gives the slide as a tilt (spin) with an angry face; it is drawn here instead
  const rl = pose.mood === 'angry' && Math.abs(pose.spin) > 0.02 ? clamp(Math.abs(pose.spin) / 1.15, 0, 1) : 0;
  const a = pose.spin * pose.face;
  if (rl > 0) {
    ctx.translate(0, CY);
    ctx.rotate(-a);
    ctx.translate(0, -CY);
  }
  // tucked in for the roll: no feet, no gloves
  const limbs = rl < 0.35;
  const tuck = 1 - rl;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv * tuck;
  const wob = (Math.sin(R.ph) * 0.06 * R.mv + br * 0.012) * tuck;
  const bare = !R.weapon;
  const lunge = bare ? 0.08 * R.strike - 0.06 * R.wind : 0;
  const roll = rl > 0 ? pose.walk / (R.r * RAD) : 0;
  const fx = -0.36 + stepX(Math.PI, 0.18);
  const nx = 0.36 + stepX(0, 0.18);
  if (limbs) {
    put(PK_FOOT, '', fx, stepY(Math.PI, 0.16));
    if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.16), 0.58);
    if (!twoH()) put(PK_GLOVE, '', 0.98 + 0.03 * br, -1.12 + bob, -0.45);
  }
  const cx = lunge * 0.6;
  const cy = CY + bob - 0.12 * rl;
  const sq = bare ? R.strike : 0;
  if (limbs) put(PK_BODY, R.fk, cx, cy, wob + roll, 1 + 0.04 * sq, 1 - 0.03 * sq);
  else put(PK_BALL, '', cx, cy, wob + roll);
  if (limbs) {
    put(PK_FOOT, '', nx, stepY(0, 0.16));
    if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.16), 0.62);
  }
  helmetAt(cx + 0.06 + wob, cy - RAD + 0.06, 1.85, -0.06 + wob);
  crownAt(cx + 0.12 + wob * 1.6, cy - RAD - (R.look.helmet ? 0.56 : 0.12), -0.12 + wob);
  chiliAt(cx + 0.15, cy - RAD - 0.7, 1.0);
  if (limbs) {
    aimHand(0.92 + lunge, -0.92 + bob, 0.6);
    armsAndWeapon(PK_GLOVE, R.weapon ? -0.6 : -0.15 + 0.2 * R.strike);
  }
  if (rl > 0) {
    ctx.translate(0, CY);
    ctx.rotate(a);
    ctx.translate(0, -CY);
  }
}

export const sumo = ch(2.0, 1.12, -CY, [PK.skin, '#f6c27a', '#c9762f'], drawPumpkin, { lean: 0.05, wl: 1.1 });
