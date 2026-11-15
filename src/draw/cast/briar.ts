import { C, E, PATH, R, RR, WHITE, accent, aimHand, armsAndWeapon, ch, chiliAt, chunk, clipIn, crownAt, eyes, helmetAt, inner, mix, mouth, paint, part, put, shoeAt, stepX, stepY, trunksIn, twoH, wrapPart } from './kit';
// ---------------------------------------------------------------- 8 briar = Spike: a porcupine wrestler in a luchador mask (the corner
// colour, white eye flames and stripe) whose quills are sharpened coloured pencils, fanned out down its back; they
// bristle when it lunges or is hit (thorns), and it fights with taped fists

const SP = { fur: '#8f6b55', furDark: '#6f5141', belly: '#ecd5b2', nose: '#3f2f2c', wood: '#f3dcb0', lead: '#4a4452', trim: '#f2ede3' };
/** the pencils: base (x, y) inside the body, the way they point (radians), length, colour; the first two sit on the head */
const PENCILS: readonly (readonly [number, number, number, number, string])[] = [
  [0.1, -1.66, -2.32, 0.84, '#f2c94c'],
  [-0.12, -1.54, -2.48, 0.92, '#7cc36a'],
  [-0.32, -1.34, -2.62, 0.94, '#f0995a'],
  [-0.46, -1.1, -2.76, 0.9, '#a98bd8'],
  [-0.54, -0.86, -2.88, 0.84, '#f2c94c'],
  [-0.54, -0.62, -2.98, 0.7, '#ef9ec0'],
];
/** where the pencils fan out from (they bristle about it) */
const QX = -0.1;
const QY = -1.0;

const SP_FOOT = part('spF', [-0.45, -0.42, 0.95, 0.54], (g) => chunk(g, [[E(0.07, -0.1, 0.27, 0.12), SP.furDark, 0.04]]));
const SP_HAND = wrapPart('spH', SP.fur, 1.0);
/** the pencils, back to front; pivot = (QX, QY). Variant 'h': a helmet sits on its head, so none on top */
const SP_QUILLS = part('spQ', [-1.75, -1.6, 2.6, 2.15], (g) => {
  const off = R.look.helmet ? 1 : 0;
  for (let i = PENCILS.length - 1; i >= off; i--) {
    const [bx, by, a, L, col] = PENCILS[i];
    g.save();
    g.translate(bx - QX, by - QY);
    g.rotate(a + Math.PI / 2);
    // pointing up (-y) from the base: the hexagonal shaft, the shaved wood, the lead
    const w = 0.115;
    const s = L * 0.7;
    const shaft = RR(-w, -s, w * 2, s + 0.1, 0.03);
    const cone = PATH((p) => {
      p.moveTo(-w, -s + 0.01);
      p.lineTo(0, -L);
      p.lineTo(w, -s + 0.01);
      p.closePath();
    });
    chunk(g, [[shaft, col, 0], [cone, SP.wood, 0]]);
    // the lit facet of the hexagonal shaft
    clipIn(g, shaft, () => paint(g, RR(-w, -s, w * 0.75, s + 0.1, 0), mix(col, WHITE, 0.4), 0));
    inner(g, PATH((p) => { p.moveTo(w * 0.3, -s + 0.04); p.lineTo(w * 0.3, 0.05); }), 0.55);
    const lead = PATH((p) => {
      p.moveTo(-w * 0.36, -L + (L - s) * 0.36);
      p.lineTo(0, -L);
      p.lineTo(w * 0.36, -L + (L - s) * 0.36);
      p.closePath();
    });
    g.fillStyle = C(SP.lead);
    g.fill(lead);
    g.restore();
  }
});
/** the round body in its wrestling trunks; pivot = the feet */
const SP_BODY = part('spB', [-0.95, -1.62, 1.85, 1.72], (g) => {
  const body = E(-0.04, -0.74, 0.66, 0.68);
  chunk(g, [[body, SP.fur, 0.12]]);
  clipIn(g, body, () => paint(g, E(0.34, -0.8, 0.34, 0.5), SP.belly, 0));
  trunksIn(g, body, -0.8, 0.8, -0.44, 0.1, 0.05);
});
/** the head in its luchador mask; pivot = the middle of the head */
const SP_HEAD = part('spHd', [-0.72, -0.72, 1.62, 1.36], (g) => {
  const head = E(0, 0, 0.5, 0.46);
  const snout = E(0.46, 0.14, 0.22, 0.18, 0.1);
  chunk(g, [[head, accent(), 0.11], [snout, SP.belly, 0.04]]);
  clipIn(g, head, () => {
    // the white stripe over the crown, and the laces at the back of the mask
    const stripe = PATH((p) => {
      p.moveTo(0.42, -0.36);
      p.quadraticCurveTo(0.05, -0.62, -0.5, -0.3);
      p.lineTo(-0.52, -0.14);
      p.quadraticCurveTo(0.05, -0.48, 0.36, -0.24);
      p.closePath();
    });
    paint(g, stripe, SP.trim, 0);
    inner(g, stripe, 0.7);
    inner(g, PATH((p) => {
      for (const y of [-0.02, 0.12, 0.26]) {
        p.moveTo(-0.5, y - 0.06);
        p.lineTo(-0.38, y + 0.04);
      }
    }), 0.8);
  });
  // flames of white round the eyes
  const flame = (x: number, y: number, s: number) =>
    PATH((p) => {
      p.moveTo(x - 0.15 * s, y + 0.1 * s);
      p.quadraticCurveTo(x - 0.22 * s, y - 0.12 * s, x - 0.14 * s, y - 0.3 * s);
      p.quadraticCurveTo(x - 0.06 * s, y - 0.16 * s, x + 0.02 * s, y - 0.26 * s);
      p.quadraticCurveTo(x + 0.22 * s, y - 0.12 * s, x + 0.18 * s, y + 0.08 * s);
      p.quadraticCurveTo(x + 0.02 * s, y + 0.22 * s, x - 0.15 * s, y + 0.1 * s);
      p.closePath();
    });
  chunk(g, [[flame(0.4, -0.06, 0.82), SP.trim, 0], [flame(0.14, -0.06, 1), SP.trim, 0]]);
  eyes(g, 0.15, 0.39, -0.08, 0.12, SP.trim);
  chunk(g, [[RR(0.47, 0.25, 0.1, 0.1, 0.03), '#ffffff', 0], [E(0.66, 0.05, 0.11, 0.09), SP.nose, 0.02]]);
  inner(g, PATH((p) => { p.moveTo(0.52, 0.26); p.lineTo(0.52, 0.34); }), 0.5);
  mouth(g, 0.4, 0.24, 0.08);
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
  // the pencils bristle as it lunges, and when it is hit (its thorns)
  const bristle = 1 + (bare ? 0.12 * R.strike : 0) + 0.16 * R.hurt + 0.05 * R.wind;
  put(SP_QUILLS, R.look.helmet ? 'h' : '', QX + lunge * 0.5, QY + bob, rock * 0.8 + 0.08 * R.hurt + br * 0.02, bristle, bristle);
  // the far fist, up on guard by its chin
  if (!twoH()) put(SP_HAND, '', 0.8 + 0.03 * br, -0.96 + bob, -0.4);
  put(SP_BODY, '', lunge * 0.5, bob, rock);
  put(SP_FOOT, '', nx, ny);
  if (R.look.sneakers) shoeAt(nx + 0.05, ny, 0.6);
  const hx = 0.2 + lunge + rock * 1.2;
  const hy = -1.46 + bob + br * 0.015;
  put(SP_HEAD, R.fk, hx, hy, rock * 0.6 + lunge * 0.8);
  helmetAt(hx + 0.02, hy - 0.3, 1.55, -0.1 + rock);
  crownAt(hx + 0.02, hy - (R.look.helmet ? 0.66 : 0.5), -0.15 + rock);
  chiliAt(hx + 0.1, hy - 0.95, 0.9);
  aimHand(0.62 + lunge, -0.86 + bob, 0.72);
  armsAndWeapon(SP_HAND, R.weapon ? -0.6 : -0.1 + 0.15 * R.strike);
}

export const briar = ch(2.0, 1.05, 0.95, [SP.fur, '#f2c94c', SP.furDark], drawSpike, { lean: 0.08, wl: 1.05 });
