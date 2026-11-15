import { B, C, E, PATH, R, RR, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inkC, inner, mouth, paint, part, put, shoeAt, twoH } from './kit';
// ---------------------------------------------------------------- 6 cacto: a potted cactus with two little boxing arms

const CA = { green: '#80ad6b', rib: '#6a9758', pot: '#c98364', rim: '#d6967a' };
const CA_POT = part('caP', [-0.85, -0.98, 1.7, 1.15], (g) => {
  const pot = PATH((p) => {
    p.moveTo(-0.44, 0);
    p.lineTo(0.44, 0);
    p.lineTo(0.54, -0.56);
    p.lineTo(-0.54, -0.56);
    p.closePath();
  });
  const rim = RR(-0.63, -0.76, 1.26, 0.24, 0.08);
  chunk(g, [[pot, CA.pot, 0.1], [rim, CA.rim, 0.06]]);
  clipIn(g, pot, () => {
    const band = RR(-0.7, -0.38, 1.4, 0.15, 0);
    paint(g, band, accent(), 0);
    inner(g, band, 0.8);
  });
});
const CA_BODY = part('caB', [-0.75, -1.72, 1.5, 1.92], (g) => {
  const col = RR(-0.48, -1.46, 0.96, 1.52, 0.48);
  chunk(g, [[col, CA.green, 0.14]]);
  clipIn(g, col, () => {
    g.lineWidth = B.lw * 1.1;
    g.strokeStyle = C(CA.rib);
    g.beginPath();
    g.moveTo(-0.22, -1.3);
    g.quadraticCurveTo(-0.3, -0.6, -0.24, 0.1);
    g.moveTo(-0.02, -1.42);
    g.lineTo(-0.02, -1.2);
    g.stroke();
  });
  // a few spines
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = inkC();
  g.beginPath();
  for (const [x, y, dx] of [[-0.48, -1.0, -1], [-0.5, -0.55, -1], [-0.48, -0.15, -1], [0.48, -0.25, 1], [0.0, -1.46, 0]] as const) {
    if (dx) {
      g.moveTo(x, y);
      g.lineTo(x + dx * 0.13, y - 0.04);
      g.moveTo(x, y);
      g.lineTo(x + dx * 0.13, y + 0.06);
    } else {
      g.moveTo(-0.08, y);
      g.lineTo(-0.12, y - 0.13);
      g.moveTo(0.06, y);
      g.lineTo(0.1, y - 0.13);
    }
  }
  g.stroke();
  blush(g, 0.0, -0.78, 0.08);
  eyes(g, 0.1, 0.34, -0.98, 0.12, CA.green);
  mouth(g, 0.24, -0.72, 0.1);
});
const CA_GLOVE = glovePart('caG', CA.green, 0.9);

function drawCacto() {
  const t = R.t;
  const ctx = R.ctx;
  const hp = Math.abs(Math.sin(R.ph)) * 0.12 * R.mv;
  const wob = Math.sin(R.ph) * 0.07 * R.mv;
  ctx.translate(0, -hp);
  if (wob) ctx.rotate(wob);
  if (R.look.sneakers) {
    shoeAt(-0.22, hp, 0.48);
    shoeAt(0.24, hp, 0.52);
  }
  // two jabs: the near glove on the first half of the strike, the far glove on the second
  const sk = R.strike;
  const jab2 = !R.weapon && sk > 0 && sk <= 0.5 ? Math.sin((sk / 0.5) * Math.PI) : 0;
  const by = -0.66;
  const sway = Math.sin(t * 2.6 + R.seed) * 0.02;
  const fgx = 0.56 + 0.62 * jab2;
  const fgy = -1.36 + 0.08 * jab2 + R.aim * 0.3 * jab2;
  if (!twoH()) put(CA_GLOVE, '', fgx, fgy, -0.4 + 0.3 * jab2);
  put(CA_POT, '', 0, 0);
  const tilt = (R.weapon ? 0 : 0.08 * Math.max(0, sk - 0.5) - 0.06 * R.wind) + sway;
  put(CA_BODY, R.fk, 0, by, tilt);
  helmetAt(0.04 + tilt * 1.4, by - 1.42, 1.5, -0.08);
  crownAt(0.05 + tilt * 1.4, by - 1.62);
  chiliAt(0.15, by - 1.85, 0.9);
  if (!R.weapon && sk > 0.5) {
    R.strike = (sk - 0.5) / 0.5;
    aimHand(0.6, -1.08, 0.6);
    R.strike = sk;
  } else if (!R.weapon && sk > 0) aimHand(0.6, -1.08, 0);
  else aimHand(0.6, -1.08, 0.6);
  armsAndWeapon(CA_GLOVE, R.weapon ? -0.6 : -0.2);
  if (wob) ctx.rotate(-wob);
  ctx.translate(0, hp);
}

export const cacto = ch(2.15, 1.0, 1.1, [CA.green, '#b4d39f', CA.rib], drawCacto, { wl: 1.0 });
