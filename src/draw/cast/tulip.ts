import { E, H, PATH, R, RR, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inner, mouth, paint, part, put, shoeAt, twoH } from './kit';
// ---------------------------------------------------------------- 4 snailor = Tulip: a tulip (a three-pointed petal cup round its
// face) sitting in a flowerpot that walks on two legs; when it is in trouble the cup folds shut over its face into a bud
// (pose.shell)

const TU = { petal: '#9a83d8', pot: '#d3c8f2', face: '#f8e8a6' };
const HIP_Y = -0.46;
/** the pot's rim, where the cup sits */
const RIM_Y = -1.26;

/** a leg: pivot = the hip, down to the ground */
const TU_LEG = part('tuL', [-0.32, -0.2, 0.64, 0.82], (g) => chunk(g, [[RR(-0.1, -0.06, 0.2, 0.55, 0.1), TU.petal, 0.04]]));
/** the pot, one shape with a lip, the corner band round it: pivot = the feet */
const TU_POT = part('tuP', [-0.78, -1.42, 1.56, 1.12], (g) => {
  const pot = PATH((p) => {
    p.moveTo(-0.34, -0.42);
    p.lineTo(0.34, -0.42);
    p.lineTo(0.46, -1.04);
    p.lineTo(0.58, -1.04);
    p.arcTo(0.6, RIM_Y, 0.4, RIM_Y, 0.06);
    p.arcTo(-0.6, RIM_Y, -0.6, -1.04, 0.06);
    p.lineTo(-0.58, -1.04);
    p.lineTo(-0.46, -1.04);
    p.closePath();
  });
  chunk(g, [[pot, TU.pot, 0.1]]);
  clipIn(g, pot, () => {
    const band = RR(-0.7, -0.86, 1.4, 0.17, 0);
    paint(g, band, accent(), 0);
    inner(g, band, 0.8);
  });
});
/** the face: pivot = its middle */
const TU_FACE = part('tuF', [-0.6, -0.6, 1.2, 1.2], (g) => {
  chunk(g, [[E(0, 0, 0.4, 0.38), TU.face, 0.08]]);
  blush(g, -0.02, 0.13, 0.08);
  eyes(g, 0.06, 0.29, -0.06, 0.12, TU.face);
  mouth(g, 0.18, 0.17, 0.1);
});
/** the petal cup, one shape with three points along its top: open behind the face, or shut over it as a bud (w = half
 * its width, d = how deep the notches between the points are); pivot = the face's middle */
const cup = (id: string, w: number, d: number) =>
  part(id, [-0.9, -1.0, 1.8, 1.7], (g) => {
    const n = -0.44 + d;
    const c = PATH((p) => {
      p.moveTo(0, 0.5);
      p.bezierCurveTo(w * 0.7, 0.5, w * 1.02, 0.22, w, -0.1);
      p.bezierCurveTo(w * 0.99, -0.42, w * 0.92, -0.62, w * 0.74, -0.64);
      p.quadraticCurveTo(w * 0.56, -0.64, w * 0.42, n);
      p.bezierCurveTo(w * 0.34, -0.74, w * 0.12, -0.82, 0, -0.86);
      p.bezierCurveTo(-w * 0.12, -0.82, -w * 0.34, -0.74, -w * 0.42, n);
      p.quadraticCurveTo(-w * 0.56, -0.64, -w * 0.74, -0.64);
      p.bezierCurveTo(-w * 0.92, -0.62, -w * 0.99, -0.42, -w, -0.1);
      p.bezierCurveTo(-w * 1.02, 0.22, -w * 0.7, 0.5, 0, 0.5);
      p.closePath();
    });
    chunk(g, [[c, TU.petal, 0.1]]);
  });
const TU_CUP = cup('tuC', 0.62, 0.06);
const TU_BUD = cup('tuBd', 0.47, -0.04);
const TU_GLOVE = glovePart('tuG', TU.petal, 1.0);

function drawTulip() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const sh = R.shell;
  const bob = -Math.abs(Math.sin(R.ph * 1.2)) * 0.05 * R.mv;
  const bare = !R.weapon;
  const lean = (bare ? 0.08 * R.strike - 0.06 * R.wind : 0) + br * 0.012;
  // two legs, stepping in turn; tucked in under the bud
  const tuck = 1 - 0.3 * sh;
  const leg = (x: number, off: number) => {
    const sw = Math.sin(R.ph * 1.2 + off) * 0.3 * R.mv;
    const lift = -Math.max(0, Math.cos(R.ph * 1.2 + off)) * 0.1 * R.mv;
    put(TU_LEG, '', x * tuck, HIP_Y + bob + lift, sw + (x < 0 ? 0.12 : -0.12) * tuck);
  };
  leg(0.16, 0);
  leg(-0.18, Math.PI);
  if (!twoH()) put(TU_GLOVE, '', 0.66 + 0.03 * br - 0.25 * sh, -1.5 + bob - 0.25 * sh, -0.45);
  // the cup sits on the rim and leans from there: open behind the face, shut over it
  const fx = 0.03 + Math.sin(lean) * 0.5;
  const fy = RIM_Y - 0.5 * Math.cos(lean) + bob;
  if (sh < 0.5) put(TU_CUP, '', fx, fy, lean, 1 - 0.4 * sh, 1);
  put(TU_FACE, R.fk, fx, fy, lean);
  if (sh >= 0.5) put(TU_BUD, '', fx, fy, lean, 0.85 + 0.15 * sh, 0.9 + 0.1 * sh);
  put(TU_POT, '', 0, bob);
  if (R.look.sneakers) {
    shoeAt(-0.26 * tuck, 0, 0.44);
    shoeAt(0.24 * tuck, 0, 0.46);
  }
  helmetAt(fx + 0.04, fy - 0.46, 1.6, lean - 0.06);
  crownAt(fx + 0.04, fy - (R.look.helmet ? 0.86 : 0.7), lean - 0.1);
  chiliAt(fx + 0.12, fy - 1.0, 0.95);
  aimHand(0.58, -1.32 + bob, 0.66);
  // shut in its bud, it brings its near glove in close too
  if (sh > 0 && !R.weapon) {
    H.x -= 0.25 * sh;
    H.y -= 0.2 * sh;
  }
  armsAndWeapon(TU_GLOVE, R.weapon ? -0.6 : -0.2 + 0.2 * R.strike);
}

export const tulip = ch(2.55, 0.92, 1.1, [TU.petal, TU.pot, '#7d69bd'], drawTulip, { lean: 0.03, wl: 1.0 });
