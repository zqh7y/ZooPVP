import { E, PATH, R, TAU, accent, aimHand, armsAndWeapon, blush, C, chiliAt, chunk, crownAt, ch, clipIn, eyes, glovePart, helmetAt, mouth, paint, part, put, shoeAt, twoH, RR } from './kit';
// ---------------------------------------------------------------- 5 roo: a kangaroo in boxing gloves

const RO = { fur: '#cf9d6e', light: '#f2ddbf', ear: '#e7b4a2', nose: '#5b3d35' };
const RO_FOOT = part('roF', [-0.5, -0.35, 1.05, 0.48], (g) => chunk(g, [[E(0.1, -0.09, 0.3, 0.1), RO.fur, 0.04]]));
const RO_TAIL = part('roT', [-1.05, -0.35, 1.3, 1.0], (g) => {
  const p = PATH((p) => {
    p.moveTo(0.1, -0.16);
    p.quadraticCurveTo(-0.55, -0.05, -0.82, 0.36);
    p.quadraticCurveTo(-0.84, 0.46, -0.72, 0.44);
    p.quadraticCurveTo(-0.4, 0.22, 0.08, 0.14);
    p.closePath();
  });
  chunk(g, [[p, RO.fur, 0.06]]);
});
const RO_BODY = part('roB', [-0.75, -1.32, 1.45, 1.35], (g) => {
  const body = E(0.02, -0.66, 0.42, 0.5);
  const haunch = E(-0.14, -0.3, 0.32, 0.25);
  chunk(g, [[haunch, RO.fur, 0.06], [body, RO.fur, 0.1]]);
  clipIn(g, body, () => paint(g, E(0.2, -0.72, 0.24, 0.36), RO.light, 0));
  const trunks = PATH((p) => {
    p.moveTo(-0.44, -0.44);
    p.lineTo(0.42, -0.44);
    p.quadraticCurveTo(0.44, -0.2, 0.3, -0.14);
    p.lineTo(-0.36, -0.12);
    p.quadraticCurveTo(-0.48, -0.24, -0.44, -0.44);
    p.closePath();
  });
  chunk(g, [[trunks, accent(), 0.07]]);
  const waist = RR(-0.44, -0.47, 0.86, 0.08, 0.03);
  chunk(g, [[waist, '#f2ede3', 0]]);
});
const RO_HEAD = part('roHd', [-0.75, -1.65, 1.8, 1.85], (g) => {
  const head = E(0.06, -0.4, 0.5, 0.45);
  const earB = E(-0.3, -0.98, 0.14, 0.38, -0.38);
  const earF = E(0.0, -1.04, 0.14, 0.38, -0.12);
  const snout = E(0.5, -0.28, 0.3, 0.21, 0.08);
  chunk(g, [[earB, RO.fur, 0.05], [earF, RO.fur, 0.05], [head, RO.fur, 0.12], [snout, RO.light, 0.05]]);
  for (const [x, y, rot] of [[-0.27, -0.98, -0.38], [0.02, -1.03, -0.12]] as const) {
    g.beginPath();
    g.ellipse(x, y, 0.07, 0.25, rot, 0, TAU);
    g.fillStyle = C(RO.ear);
    g.fill();
  }
  chunk(g, [[E(0.78, -0.37, 0.085, 0.065), RO.nose, 0]]);
  blush(g, 0.2, -0.2, 0.08);
  eyes(g, 0.22, 0.46, -0.52, 0.11, RO.fur);
  mouth(g, 0.6, -0.14, 0.09);
});
const RO_GLOVE = glovePart('roG', RO.fur, 1.05);

function drawRoo() {
  const t = R.t;
  // it hops when it walks: both feet together
  const hp = Math.abs(Math.sin(R.ph * 0.6)) * 0.28 * R.mv;
  const air = Math.min(1, hp * 6);
  const bob = -hp;
  put(RO_TAIL, '', -0.36, -0.42 + bob * 0.5, -0.1 * air + Math.sin(t * 2.6 + R.seed) * 0.03);
  put(RO_FOOT, '', -0.06, bob, 0.2 * air);
  if (R.look.sneakers) shoeAt(0.0, bob, 0.55);
  // the far glove up by the chin, the guard
  const gx = 0.48 + 0.04 * Math.sin(t * 2.6 + R.seed);
  put(RO_GLOVE, '', twoH() ? 0.3 : gx, -1.18 + bob, -0.5);
  put(RO_BODY, '', 0, bob);
  put(RO_FOOT, '', 0.06, bob, 0.2 * air);
  if (R.look.sneakers) shoeAt(0.14, bob, 0.6);
  const hx = 0.04 + (R.weapon ? 0 : 0.06 * R.strike - 0.05 * R.wind);
  const hy = -1.06 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02;
  put(RO_HEAD, R.fk, hx, hy, -0.05 * air);
  helmetAt(hx + 0.08, hy - 0.72, 1.55, -0.08);
  crownAt(hx + 0.06, hy - 1.02);
  chiliAt(hx + 0.2, hy - 1.5, 0.9);
  aimHand(0.5, -0.9 + bob, 0.7);
  armsAndWeapon(RO_GLOVE, R.weapon ? -0.6 : -0.15 + 0.2 * R.strike);
}

export const roo = ch(2.55, 1.05, 1.0, [RO.fur, RO.light, '#9c6f48'], drawRoo, { hop: 1.5, lean: 0.12, wl: 1.05 });
