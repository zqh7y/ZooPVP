import { E, PATH, R, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, mouth, paint, part, put, rope, shoeAt, trunksIn, twoH } from './kit';
// ---------------------------------------------------------------- 3 ninja = Shroom: a toadstool (a pink cap with three big
// dots) in boxing trunks, standing on ONE plain spring it bounces about on

const SH = { cap: '#ee88b6', capLight: '#f9c4dc', dot: '#fff4f8', stalk: '#f3e7cf', spring: '#aab3be' };
/** how long the spring is at rest */
const SPRING = 0.66;

/** the spring: pivot = its foot on the ground; SPRING tall, stretched and squeezed with a scale */
const SH_SPRING = part('shSp', [-0.38, -0.8, 0.76, 0.92], (g) => {
  const p = new Path2D();
  p.moveTo(-0.2, 0);
  p.lineTo(0.2, 0);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y1 = -(SPRING * (i + 0.5)) / n;
    const y2 = -(SPRING * (i + 1)) / n;
    p.lineTo(-0.18, y1);
    p.lineTo(i < n - 1 ? 0.18 : 0, y2);
  }
  rope(g, p, 0.08, SH.spring);
});
/** the stalk with its face and trunks: pivot = the bottom of the stalk */
const SH_BODY = part('shB', [-0.72, -1.12, 1.5, 1.26], (g) => {
  const stalk = PATH((p) => {
    p.moveTo(-0.36, 0.02);
    p.quadraticCurveTo(-0.58, -0.42, -0.34, -0.92);
    p.lineTo(0.34, -0.92);
    p.quadraticCurveTo(0.6, -0.42, 0.38, 0.02);
    p.quadraticCurveTo(0, 0.1, -0.36, 0.02);
    p.closePath();
  });
  chunk(g, [[stalk, SH.stalk, 0.1]]);
  trunksIn(g, stalk, -0.6, 0.6, -0.24, 0.2, 0.03);
  blush(g, 0.04, -0.4, 0.08);
  eyes(g, 0.14, 0.38, -0.6, 0.12, SH.stalk);
  mouth(g, 0.28, -0.38, 0.1);
});
/** the cap: pivot = the middle of its rim */
const SH_CAP = part('shC', [-1.08, -0.9, 2.16, 1.1], (g) => {
  const cap = PATH((p) => {
    p.moveTo(-0.92, 0.04);
    p.bezierCurveTo(-0.96, -0.56, -0.46, -0.7, 0, -0.7);
    p.bezierCurveTo(0.46, -0.7, 0.96, -0.56, 0.92, 0.04);
    p.quadraticCurveTo(0, 0.14, -0.92, 0.04);
    p.closePath();
  });
  chunk(g, [[cap, SH.cap, 0.13]]);
  clipIn(g, cap, () => {
    for (const [x, y, r] of [[-0.46, -0.34, 0.17], [0.14, -0.5, 0.15], [0.6, -0.18, 0.13]] as const) paint(g, E(x, y, r, r * 0.85), SH.dot, 0);
  });
});
const SH_GLOVE = glovePart('shG', SH.stalk, 0.85);

function drawShroom() {
  const t = R.t;
  const br = Math.sin(t * 3 + R.seed);
  // it gets about by bouncing on its spring: up (stretched) and down (squeezed)
  const s = Math.sin(R.ph * 0.75);
  const up = Math.max(0, s) * R.mv;
  const dn = Math.max(0, -s) * R.mv;
  const bare = !R.weapon;
  // before a punch it sinks down on the spring; on the hit it springs up and in
  const k = 1 + 0.5 * up - 0.35 * dn + 0.06 * br * (1 - R.mv) - (bare ? 0.34 * R.wind - 0.26 * R.strike : 0);
  const foot = up * 0.22;
  const lean = (bare ? 0.18 * R.strike - 0.12 * R.wind : 0) + 0.06 * up - 0.03 * dn;
  if (R.look.sneakers) shoeAt(0.04, -foot, 0.62);
  put(SH_SPRING, '', 0, -foot, lean * 0.5, 1, k);
  const bx = Math.sin(lean * 0.5) * SPRING * k;
  const by = -foot - SPRING * k;
  // the far glove, up on guard
  if (!twoH()) put(SH_GLOVE, '', bx + 0.64 + 0.02 * br, by - 0.3, -0.3);
  put(SH_BODY, R.fk, bx, by, lean);
  // the cap sits on the stalk and wobbles
  const jig = 0.1 * dn - 0.06 * up + Math.sin(t * 13) * 0.025 * R.mv + (bare ? 0.07 * R.strike : 0) + 0.015 * br;
  const cx = bx + Math.sin(lean) * 0.86;
  const cy = by - Math.cos(lean) * 0.86;
  put(SH_CAP, '', cx, cy, lean * 1.25 + Math.sin(t * 2.2 + R.seed) * 0.03, 1 + jig, 1 - jig);
  helmetAt(cx + 0.04, cy - 0.5 * (1 - jig), 1.9, lean - 0.06);
  crownAt(cx + 0.05, cy - (R.look.helmet ? 0.9 : 0.66) * (1 - jig), lean - 0.12);
  chiliAt(cx + 0.12, cy - 1.0, 0.95);
  aimHand(bx + 0.5, by - 0.24, 0.62);
  armsAndWeapon(SH_GLOVE, R.weapon ? -0.6 : -0.15 + 0.2 * R.strike);
}

export const shroom = ch(2.25, 0.8, 1.1, [SH.cap, SH.capLight, SH.stalk], drawShroom, { lean: 0.04, wl: 0.9 });
