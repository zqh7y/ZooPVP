import { E, PATH, R, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, mouth, paint, part, put, shoeAt, stepX, stepY, trunksIn, twoH } from './kit';
// ---------------------------------------------------------------- 8 briar = Spike: a porcupine wrestler in trunks, a fan of dark
// quills down its back; they bristle when it lunges or is hit (thorns)

const SP = { fur: '#9a7259', light: '#efd8b4', quill: '#4e3c37', nose: '#3f2f2c' };
/** where the quills fan out from */
const QX = -0.1;
const QY = -1.0;

const SP_FOOT = part('spF', [-0.45, -0.42, 0.95, 0.54], (g) => chunk(g, [[E(0.07, -0.1, 0.27, 0.12), SP.fur, 0.04]]));
const SP_GLOVE = glovePart('spG', SP.fur, 1.0);
/** the quills: one spiky fan; pivot = (QX, QY). Variant 'h': a helmet sits on its head, so none on top */
const SP_QUILLS = part('spQ', [-1.5, -1.45, 2.2, 2.0], (g) => {
  const a0 = R.look.helmet ? -2.2 : -1.55;
  const a1 = -3.45;
  const n = R.look.helmet ? 4 : 6;
  const p = PATH((p) => {
    p.moveTo(0, 0);
    for (let i = 0; i <= n * 2; i++) {
      const a = a0 + ((a1 - a0) * i) / (n * 2);
      const L = i % 2 ? 1.0 + 0.24 * Math.sin((Math.PI * i) / (n * 2)) : 0.7;
      p.lineTo(Math.cos(a) * L, Math.sin(a) * L);
    }
    p.closePath();
  });
  chunk(g, [[p, SP.quill, 0.06]]);
});
/** the round body in its trunks; pivot = the feet */
const SP_BODY = part('spB', [-0.95, -1.62, 1.85, 1.72], (g) => {
  const body = E(-0.04, -0.74, 0.66, 0.68);
  chunk(g, [[body, SP.fur, 0.12]]);
  clipIn(g, body, () => paint(g, E(0.36, -0.8, 0.32, 0.5), SP.light, 0));
  trunksIn(g, body, -0.8, 0.8, -0.44, 0.1, 0.05);
});
/** the head; pivot = its middle */
const SP_HEAD = part('spHd', [-0.72, -0.72, 1.62, 1.36], (g) => {
  chunk(g, [[E(0, 0, 0.5, 0.46), SP.fur, 0.11], [E(0.46, 0.12, 0.22, 0.17, 0.1), SP.light, 0.04], [E(0.66, 0.04, 0.1, 0.08), SP.nose, 0]]);
  blush(g, 0.18, 0.18, 0.08);
  eyes(g, 0.2, 0.42, -0.1, 0.12, SP.fur);
  mouth(g, 0.44, 0.24, 0.08);
});

function drawSpike() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  // a wrestler's waddle: heavy steps, the body rocking on each
  const bob = -Math.abs(Math.sin(R.ph)) * 0.07 * R.mv;
  const rock = Math.sin(R.ph) * 0.06 * R.mv + br * 0.012;
  const bare = !R.weapon;
  const lunge = bare ? 0.1 * R.strike - 0.06 * R.wind : 0;
  const fx = -0.28 + stepX(Math.PI, 0.22);
  const nx = 0.28 + stepX(0, 0.22);
  const fy = stepY(Math.PI, 0.14);
  const ny = stepY(0, 0.14);
  put(SP_FOOT, '', fx, fy);
  if (R.look.sneakers) shoeAt(fx + 0.05, fy, 0.56);
  // the quills bristle as it lunges, and when it is hit (its thorns)
  const bristle = 1 + (bare ? 0.12 * R.strike : 0) + 0.18 * R.hurt + 0.05 * R.wind;
  put(SP_QUILLS, R.look.helmet ? 'h' : '', QX + lunge * 0.5, QY + bob, rock * 0.8 + 0.08 * R.hurt + br * 0.02, bristle, bristle);
  // the far glove, up on guard by its chin
  if (!twoH()) put(SP_GLOVE, '', 0.8 + 0.03 * br, -0.96 + bob, -0.4);
  put(SP_BODY, '', lunge * 0.5, bob, rock);
  put(SP_FOOT, '', nx, ny);
  if (R.look.sneakers) shoeAt(nx + 0.05, ny, 0.6);
  const hx = 0.2 + lunge + rock * 1.2;
  const hy = -1.46 + bob + br * 0.015;
  put(SP_HEAD, R.fk, hx, hy, rock * 0.6 + lunge * 0.8);
  helmetAt(hx + 0.02, hy - 0.3, 1.55, -0.1 + rock);
  crownAt(hx + 0.02, hy - (R.look.helmet ? 0.66 : 0.4), -0.15 + rock);
  chiliAt(hx + 0.1, hy - 0.95, 0.9);
  aimHand(0.62 + lunge, -0.86 + bob, 0.72);
  armsAndWeapon(SP_GLOVE, R.weapon ? -0.6 : -0.1 + 0.15 * R.strike);
}

export const briar = ch(2.0, 1.05, 0.95, [SP.fur, SP.light, SP.quill], drawSpike, { lean: 0.08, wl: 1.05 });
