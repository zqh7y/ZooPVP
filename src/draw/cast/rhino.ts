import { C, E, PATH, R, RR, TAU, accent, aimHand, armsAndWeapon, ch, chiliAt, chunk, clipIn, crownAt, eyes, handPart, helmetAt, inkC, inner, mouth, paint, part, put, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 11 rhino: a rhino in plated armour

const RH = { skin: '#b3aaa6', plate: '#6d7b91', rivet: '#e2cd96', horn: '#efe6d0', ear: '#d9a7a5' };
const RH_FOOT = part('rhF', [-0.45, -0.44, 0.96, 0.56], (g) => chunk(g, [[E(0.06, -0.13, 0.27, 0.15), RH.skin, 0.05]]));
/** an armoured fist */
const RH_HAND = handPart('rhH', RH.plate, 0.15);
/** the body in its breastplate, a sash across it, a plate on the shoulder; pivot = the feet */
const RH_BODY = part('rhB', [-0.9, -1.65, 1.8, 1.7], (g) => {
  const torso = E(0, -0.78, 0.52, 0.56);
  const plate = PATH((p) => {
    p.moveTo(-0.5, -0.66);
    p.bezierCurveTo(-0.58, -1.44, 0.6, -1.48, 0.55, -0.64);
    p.quadraticCurveTo(0.02, -0.48, -0.5, -0.66);
    p.closePath();
  });
  chunk(g, [[torso, RH.skin, 0.1], [plate, RH.plate, 0.08]]);
  clipIn(g, plate, () => {
    const sash = PATH((p) => {
      p.moveTo(-0.62, -1.22);
      p.lineTo(-0.42, -1.4);
      p.lineTo(0.64, -0.74);
      p.lineTo(0.44, -0.56);
      p.closePath();
    });
    paint(g, sash, accent(), 0);
    inner(g, sash, 0.8);
  });
  g.fillStyle = C(RH.rivet);
  for (const [x, y] of [[0.36, -1.1], [-0.3, -0.76]] as const) {
    g.beginPath();
    g.arc(x, y, 0.05, 0, TAU);
    g.fill();
  }
  chunk(g, [[E(-0.14, -1.24, 0.32, 0.2, -0.25), RH.plate, 0.06]]);
});
const RH_HEAD = part('rhHd', [-0.78, -1.42, 1.98, 1.62], (g) => {
  const skull = E(0.05, -0.45, 0.5, 0.45);
  const snout = RR(0.1, -0.7, 0.84, 0.62, 0.28);
  const ear = E(-0.26, -0.86, 0.11, 0.2, -0.45);
  const horn = PATH((p) => {
    p.moveTo(0.68, -0.66);
    p.quadraticCurveTo(0.86, -0.8, 0.86, -1.14);
    p.quadraticCurveTo(1.02, -0.82, 0.92, -0.58);
    p.closePath();
  });
  const horn2 = PATH((p) => {
    p.moveTo(0.48, -0.68);
    p.quadraticCurveTo(0.55, -0.78, 0.55, -0.9);
    p.quadraticCurveTo(0.66, -0.78, 0.64, -0.66);
    p.closePath();
  });
  chunk(g, [[ear, RH.skin, 0.03], [skull, RH.skin, 0.1], [snout, RH.skin, 0.1]]);
  g.beginPath();
  g.ellipse(-0.25, -0.86, 0.05, 0.12, -0.45, 0, TAU);
  g.fillStyle = C(RH.ear);
  g.fill();
  chunk(g, [[horn2, RH.horn, 0.03], [horn, RH.horn, 0.05]]);
  g.fillStyle = inkC();
  g.beginPath();
  g.ellipse(0.84, -0.36, 0.045, 0.035, 0, 0, TAU);
  g.fill();
  eyes(g, 0.22, 0.42, -0.56, 0.1, RH.skin);
  mouth(g, 0.66, -0.2, 0.09);
});

function drawRhino() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.07 * R.mv;
  const fx = -0.2 + stepX(Math.PI, 0.24);
  const nx = 0.2 + stepX(0, 0.24);
  put(RH_FOOT, '', fx, stepY(Math.PI, 0.16));
  if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.16), 0.6);
  if (!twoH()) put(RH_HAND, '', -0.56, -0.72 + bob);
  put(RH_BODY, '', 0, bob);
  put(RH_FOOT, '', nx, stepY(0, 0.16));
  if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.16), 0.64);
  // the horn leads the charge: head down and forward on the strike, reared back on the wind-up
  const gore = R.weapon ? 0 : 1;
  const hx = 0.12 + gore * (0.26 * R.strike - 0.1 * R.wind);
  const hy = -1.3 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02 + gore * (0.1 * R.strike - 0.06 * R.wind);
  const tilt = gore * (0.35 * R.strike - 0.22 * R.wind);
  put(RH_HEAD, R.fk, hx, hy, tilt);
  helmetAt(hx + 0.02 + tilt * 0.4, hy - 0.68, 1.2, -0.12 + tilt);
  crownAt(hx + 0.04 + tilt * 0.5, hy - (R.look.helmet ? 1.06 : 0.92), -0.12 + tilt);
  chiliAt(hx + 0.2, hy - 1.25, 0.9);
  aimHand(0.5, -0.82 + bob, 0.35);
  armsAndWeapon(RH_HAND);
}

export const rhino = ch(2.35, 1.05, 1.0, [RH.skin, RH.plate, '#7b7476'], drawRhino, { lean: 0.1, wl: 1.1 });
