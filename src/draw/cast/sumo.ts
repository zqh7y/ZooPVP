import { B, E, H, PATH, R, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, handPart, helmetAt, inkC, inner, mouth, paint, part, put, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 10 sumo: a big sumo wrestler

const SU = { skin: '#efc19e', hair: '#3e3844' };
const SU_FOOT = part('suF', [-0.45, -0.44, 0.96, 0.56], (g) => chunk(g, [[E(0.06, -0.13, 0.28, 0.15), SU.skin, 0.05]]));
const SU_HAND = handPart('suH', SU.skin, 0.17);
/** the belly in its belt (the team colour), the knot behind; pivot = the feet */
const SU_BODY = part('suB', [-1.2, -1.95, 2.4, 2.0], (g) => {
  const belly = E(0, -0.92, 0.9, 0.8);
  chunk(g, [[E(-0.9, -0.44, 0.17, 0.15), accent(), 0.03], [belly, SU.skin, 0.16]]);
  clipIn(g, belly, () => {
    const belt = PATH((p) => {
      p.moveTo(-1, -0.56);
      p.quadraticCurveTo(0, -0.38, 1, -0.62);
      p.lineTo(1, 0.1);
      p.lineTo(-1, 0.1);
      p.closePath();
    });
    paint(g, belt, accent(), 0.05);
    inner(g, belt, 0.9);
  });
  // the belly button
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = inkC();
  g.beginPath();
  g.arc(0.66, -0.78, 0.05, Math.PI * 0.6, Math.PI * 1.5);
  g.stroke();
});
const SU_HEAD = part('suHd', [-0.85, -1.38, 1.75, 1.58], (g) => {
  const head = E(0.05, -0.42, 0.5, 0.47);
  const own = !R.look.helmet;
  chunk(g, own ? [[E(-0.12, -0.96, 0.16, 0.13), SU.hair, 0.04], [head, SU.skin, 0.1]] : [[head, SU.skin, 0.1]]);
  const hair = E(-0.16, -0.82, 0.56, 0.36, -0.12);
  clipIn(g, head, () => {
    paint(g, hair, SU.hair, 0.04);
    inner(g, hair, 0.8);
  });
  if (own) inner(g, PATH((p) => { p.moveTo(-0.2, -0.86); p.lineTo(-0.04, -0.9); }), 0.8);
  blush(g, 0.2, -0.24, 0.09);
  eyes(g, 0.26, 0.48, -0.4, 0.1, SU.skin);
  mouth(g, 0.38, -0.18, 0.09);
});

function drawSumo() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.05 * R.mv;
  const sway = Math.sin(R.ph) * 0.07 * R.mv + Math.sin(t * 2.6 + R.seed) * 0.012;
  // the belly push: it bumps forward on the strike, both palms out
  const bare = !R.weapon;
  const push = bare ? 0.24 * R.strike - 0.12 * R.wind : 0;
  const shove = bare && !R.cheer && (R.strike > 0 || R.wind > 0);
  const fx = -0.42 + stepX(Math.PI, 0.16);
  const nx = 0.42 + stepX(0, 0.16);
  put(SU_FOOT, '', fx, stepY(Math.PI, 0.22));
  if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.22), 0.62);
  if (!twoH() && !shove) put(SU_HAND, '', -0.9, -1.0 + bob);
  put(SU_BODY, '', push, bob, sway, 1 + 0.05 * R.strike * (bare ? 1 : 0), 1 - 0.03 * R.strike * (bare ? 1 : 0));
  put(SU_FOOT, '', nx, stepY(0, 0.22));
  if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.22), 0.66);
  const hx = 0.2 + push * 0.6 + sway * 1.5;
  const hy = -1.55 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.015;
  put(SU_HEAD, R.fk, hx, hy, sway * 0.5);
  helmetAt(hx + 0.05, hy - 0.65, 1.2, -0.08);
  crownAt(hx + 0.06, hy - (R.look.helmet ? 1.02 : 0.92));
  chiliAt(hx + 0.15, hy - 1.25, 0.9);
  aimHand(0.84 + push, -1.0 + bob, 0.45);
  if (shove) put(SU_HAND, '', H.x - 0.1, H.y - 0.34);
  armsAndWeapon(SU_HAND);
}

export const sumo = ch(2.5, 1.25, 1.0, [SU.skin, '#f7dcc6', SU.hair], drawSumo, { lean: 0.04, wl: 1.1 });
