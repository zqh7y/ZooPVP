import { C, E, H, PATH, R, RR, TAU, WHITE, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inner, mouth, paint, part, put, rope, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 4 snailor = Tulip: a tulip in a flowerpot that scuttles about
// on little mechanical crab legs; its petals are riveted metal plates, and when it is in trouble it folds them shut
// into an armoured bud (pose.shell)

const TU = { petal: '#9a83d8', petalLight: '#c9bcf2', face: '#f8e8a6', stem: '#78aa62', pot: '#f1e5cd', rim: '#f8efdd', leg: '#636c7c', legFar: '#4d5564', bolt: '#b9c1cc', soil: '#6f5140' };
const HIP_Y = -0.44;

/** a mechanical crab leg: pivot = the hip; up to the knee, then down to a point on the ground */
const legOf = (id: string, col: string) =>
  part(id, [-0.25, -0.5, 0.95, 1.08], (g) => {
    rope(g, PATH((p) => { p.moveTo(0, 0); p.lineTo(0.3, -0.25); }), 0.15, col);
    const lo = PATH((p) => {
      p.moveTo(0.24, -0.27);
      p.quadraticCurveTo(0.44, -0.24, 0.5, 0.0);
      p.lineTo(0.53, -HIP_Y);
      p.lineTo(0.38, 0.0);
      p.quadraticCurveTo(0.36, -0.12, 0.26, -0.15);
      p.closePath();
    });
    chunk(g, [[lo, col, 0.03], [E(0.3, -0.25, 0.085, 0.085), TU.bolt, 0], [E(0, 0, 0.08, 0.08), TU.bolt, 0]]);
  });
const TU_LEG = legOf('tuL', TU.leg);
const TU_LEG_FAR = legOf('tuLf', TU.legFar);
/** the pot on its undercarriage: pivot = the feet */
const TU_POT = part('tuP', [-0.78, -1.42, 1.56, 1.12], (g) => {
  const pot = PATH((p) => {
    p.moveTo(-0.34, -0.46);
    p.lineTo(0.34, -0.46);
    p.lineTo(0.45, -1.02);
    p.lineTo(-0.45, -1.02);
    p.closePath();
  });
  const rim = RR(-0.56, -1.22, 1.12, 0.23, 0.08);
  const plate = RR(-0.42, -0.56, 0.84, 0.16, 0.06);
  chunk(g, [[plate, TU.leg, 0.03], [pot, TU.pot, 0.1], [rim, TU.rim, 0.06]]);
  clipIn(g, pot, () => {
    const band = RR(-0.7, -0.84, 1.4, 0.16, 0);
    paint(g, band, accent(), 0);
    inner(g, band, 0.8);
  });
  // rivets: it is bolted onto its legs
  g.fillStyle = C(TU.bolt);
  for (const x of [-0.3, 0, 0.3]) {
    g.beginPath();
    g.arc(x, -0.48, 0.04, 0, TAU);
    g.fill();
  }
});
/** the stem and two leaves: pivot = the soil in the pot */
const TU_STEM = part('tuSt', [-0.62, -1.0, 1.24, 1.1], (g) => {
  rope(g, PATH((p) => { p.moveTo(0, 0.02); p.quadraticCurveTo(0.06, -0.4, 0.02, -0.82); }), 0.13, TU.stem);
  chunk(g, [[E(-0.24, -0.22, 0.26, 0.09, -0.55), TU.stem, 0.02], [E(0.26, -0.3, 0.24, 0.085, 0.6), TU.stem, 0.02]]);
});
/** the face in the middle of the flower: pivot = its middle */
const TU_FACE = part('tuF', [-0.64, -0.64, 1.28, 1.24], (g) => {
  chunk(g, [[E(0, 0, 0.44, 0.42), TU.face, 0.08]]);
  blush(g, -0.02, 0.14, 0.08);
  eyes(g, 0.06, 0.3, -0.07, 0.125, TU.face);
  mouth(g, 0.18, 0.18, 0.1);
});
/** a petal: a riveted plate of violet metal; pivot = its base, pointing up */
const TU_PETAL = part('tuPt', [-0.5, -1.08, 1.0, 1.26], (g) => {
  const petal = PATH((p) => {
    p.moveTo(0, 0.05);
    p.bezierCurveTo(-0.36, 0.0, -0.42, -0.5, -0.26, -0.82);
    p.lineTo(-0.1, -0.7);
    p.lineTo(0, -0.9);
    p.lineTo(0.1, -0.7);
    p.lineTo(0.26, -0.82);
    p.bezierCurveTo(0.42, -0.5, 0.36, 0.0, 0, 0.05);
    p.closePath();
  });
  chunk(g, [[petal, TU.petal, 0.1]]);
  clipIn(g, petal, () => {
    // the shine of polished metal and the seam of the plate
    paint(g, RR(-0.24, -0.72, 0.09, 0.6, 0.04), TU.petalLight, 0);
    inner(g, PATH((p) => { p.moveTo(0.06, -0.08); p.lineTo(0.06, -0.62); }), 0.6);
  });
  g.fillStyle = C(WHITE);
  for (const [x, y] of [[-0.12, -0.12], [0.16, -0.14], [0.02, -0.74]] as const) {
    g.beginPath();
    g.arc(x, y, 0.035, 0, TAU);
    g.fill();
  }
});
const TU_GLOVE = glovePart('tuG', TU.stem, 1.0);

function drawTulip() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const sh = R.shell;
  const bob = -Math.abs(Math.sin(R.ph * 1.2)) * 0.05 * R.mv;
  const bare = !R.weapon;
  const lean = (bare ? 0.08 * R.strike - 0.06 * R.wind : 0) + br * 0.012;
  // the crab legs: far pair behind, back legs splayed back, front legs forward; tucked in under the bud
  const tuck = 1 - 0.45 * sh;
  const leg = (P: typeof TU_LEG, x: number, back: boolean, off: number) => {
    const sw = Math.sin(R.ph * 1.2 + off) * 0.28 * R.mv;
    const lift = -Math.max(0, Math.cos(R.ph * 1.2 + off)) * 0.1 * R.mv;
    put(P, '', x * tuck, HIP_Y + bob + lift, sw + 0.3 * sh * (back ? -1 : 1), back ? -tuck : tuck, 1);
  };
  leg(TU_LEG_FAR, -0.22, true, 1.6);
  leg(TU_LEG_FAR, 0.22, false, 4.7);
  if (!twoH()) put(TU_GLOVE, '', 0.66 + 0.03 * br - 0.25 * sh, -1.62 + bob - 0.25 * sh, -0.45);
  put(TU_STEM, '', 0, -1.12 + bob, lean, 1, 1.15);
  put(TU_POT, '', 0, bob);
  leg(TU_LEG, -0.14, true, 0);
  leg(TU_LEG, 0.14, false, 3.1);
  if (R.look.sneakers) {
    shoeAt(-0.66 * tuck, 0, 0.42);
    shoeAt(0.66 * tuck, 0, 0.46);
  }
  // the bloom: back petal, the face, the two front petals that fold shut over it
  const fx = 0.04 + Math.sin(lean) * 0.9;
  const fy = -2.1 + bob;
  const by = fy + 0.3;
  const open = 1 - sh;
  // open, the side petals fan out behind the face like a crown; shut, they fold in front of it into a bud
  const sides = () => {
    put(TU_PETAL, '', fx - 0.24 + 0.14 * sh, by + 0.02, lean - 0.85 * open + 0.22 * sh, 0.95, 0.95 + 0.08 * sh);
    put(TU_PETAL, '', fx + 0.28 - 0.14 * sh, by + 0.02, lean + 0.85 * open - 0.2 * sh, 0.95, 0.95 + 0.08 * sh);
  };
  put(TU_PETAL, '', fx, by, lean + 0.04, 0.95, 0.92 + 0.12 * sh);
  if (sh < 0.5) sides();
  put(TU_FACE, R.fk, fx, fy, lean);
  if (sh >= 0.5) sides();
  helmetAt(fx + 0.04, fy - 0.46, 1.6, lean - 0.06);
  crownAt(fx + 0.04, fy - (R.look.helmet ? 0.86 : 0.62), lean - 0.1);
  chiliAt(fx + 0.12, fy - 1.0, 0.95);
  aimHand(0.58, -1.44 + bob, 0.66);
  // shut in its bud, it brings its near glove in close too
  if (sh > 0 && !R.weapon) {
    H.x -= 0.25 * sh;
    H.y -= 0.2 * sh;
  }
  armsAndWeapon(TU_GLOVE, R.weapon ? -0.6 : -0.2 + 0.2 * R.strike);
}

export const tulip = ch(2.65, 0.92, 1.15, [TU.petal, TU.petalLight, TU.leg], drawTulip, { lean: 0.03, wl: 1.0 });
