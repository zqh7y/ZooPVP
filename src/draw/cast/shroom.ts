import { B, C, E, PATH, R, RR, TAU, WHITE, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, helmetAt, inkC, inner, mouth, paint, part, put, rope, shoeAt, trunksIn, twoH, wrapPart } from './kit';
// ---------------------------------------------------------------- 3 ninja = Shroom: a toadstool with a wobbly pink jelly cap and
// shades, in boxing trunks, bouncing about on ONE big spring with ONE big hi-top sneaker (the corner colour) on it

const SH = { cap: '#ee88b6', capLight: '#f9c4dc', spot: '#fff4f8', stalk: '#f3e7cf', stalkDark: '#d9c6a3', spring: '#aab3be', lens: '#2a2633', sole: '#f6f1e6' };
/** how long the spring is at rest, and how tall the shoe is (where the spring sits) */
const SPRING = 0.38;
const SHOE_Y = -0.46;

/** the hi-top: pivot = the middle of its sole on the ground; the spring stands on its collar */
const SH_SHOE = part('shS', [-0.62, -0.72, 1.3, 0.86], (g) => {
  const upper = PATH((p) => {
    p.moveTo(-0.44, -0.12);
    p.lineTo(-0.4, -0.5);
    p.quadraticCurveTo(-0.16, -0.6, 0.06, -0.52);
    p.lineTo(0.12, -0.32);
    p.quadraticCurveTo(0.44, -0.32, 0.52, -0.12);
    p.closePath();
  });
  const sole = RR(-0.48, -0.16, 1.04, 0.16, 0.07);
  chunk(g, [[upper, accent(), 0.06], [sole, SH.sole, 0]]);
  clipIn(g, upper, () => {
    const toe = E(0.44, -0.12, 0.22, 0.16);
    paint(g, toe, SH.sole, 0);
    inner(g, toe, 0.8);
  });
  // the laces and an ankle star
  g.lineWidth = 0.06;
  g.strokeStyle = C(WHITE);
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    g.moveTo(-0.02 + i * 0.05, -0.46 + i * 0.07);
    g.lineTo(0.14 + i * 0.05, -0.42 + i * 0.07);
  }
  g.stroke();
  g.fillStyle = C(WHITE);
  g.beginPath();
  g.arc(-0.24, -0.34, 0.07, 0, TAU);
  g.fill();
});
/** the spring: pivot = its foot; SPRING tall, stretched and squeezed with a scale */
const SH_SPRING = part('shSp', [-0.34, -0.58, 0.68, 0.7], (g) => {
  const p = new Path2D();
  p.moveTo(0, 0);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y0 = -(SPRING * i) / n;
    const y1 = -(SPRING * (i + 0.5)) / n;
    const y2 = -(SPRING * (i + 1)) / n;
    p.quadraticCurveTo(0.24, y0 - 0.01, 0.17, y1);
    p.quadraticCurveTo(-0.22, y2 + 0.04, -0.14, y2);
  }
  p.lineTo(0, -SPRING);
  rope(g, p, 0.07, SH.spring);
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
  const f = B.face;
  // the shades: on, as cool as ever, unless the shock knocks them down its nose
  const off = f === 'pinch' || f === 'x' || f === 'spiral' || f === 'wide';
  const gy = off ? -0.4 : -0.58;
  if (off) eyes(g, 0.1, 0.36, -0.62, 0.1, SH.stalk);
  g.save();
  g.translate(0.2, gy);
  if (off) g.rotate(-0.22);
  const lens1 = RR(-0.3, -0.1, 0.31, 0.21, 0.08);
  const lens2 = RR(0.06, -0.11, 0.25, 0.2, 0.08);
  inner(g, PATH((p) => { p.moveTo(-0.02, -0.05); p.lineTo(0.08, -0.05); p.moveTo(-0.3, -0.05); p.lineTo(-0.5, -0.1); }), 1.1);
  chunk(g, [[lens1, SH.lens, 0], [lens2, SH.lens, 0]]);
  g.strokeStyle = C(WHITE);
  g.lineWidth = 0.035;
  g.beginPath();
  g.moveTo(-0.22, 0.05);
  g.lineTo(-0.12, -0.06);
  g.moveTo(0.11, 0.04);
  g.lineTo(0.19, -0.06);
  g.stroke();
  g.restore();
  if (f === 'angry' && !off) inner(g, PATH((p) => { p.moveTo(-0.06, -0.82); p.lineTo(0.46, -0.72); }), 1.2);
  blush(g, 0.02, -0.36, 0.08);
  if (B.mouth === 'smile') {
    // a cool little smirk
    g.lineWidth = 0.05;
    g.strokeStyle = inkC();
    g.beginPath();
    g.moveTo(0.08, off ? -0.18 : -0.3);
    g.quadraticCurveTo(0.24, off ? -0.12 : -0.23, 0.38, off ? -0.24 : -0.37);
    g.stroke();
  } else mouth(g, 0.24, off ? -0.18 : -0.3, 0.1);
});
/** the jelly cap: pivot = the middle of its rim */
const SH_CAP = part('shC', [-1.08, -0.86, 2.16, 1.16], (g) => {
  const cap = PATH((p) => {
    p.moveTo(-0.92, 0.0);
    p.bezierCurveTo(-0.96, -0.56, -0.46, -0.7, 0, -0.7);
    p.bezierCurveTo(0.46, -0.7, 0.96, -0.56, 0.92, 0.0);
    // a wobbly jelly rim with two drips hanging off it
    p.quadraticCurveTo(0.84, 0.1, 0.76, 0.06);
    p.quadraticCurveTo(0.68, 0.3, 0.58, 0.06);
    p.quadraticCurveTo(0.1, 0.12, -0.3, 0.05);
    p.quadraticCurveTo(-0.5, 0.0, -0.6, 0.07);
    p.quadraticCurveTo(-0.68, 0.24, -0.78, 0.07);
    p.quadraticCurveTo(-0.88, 0.05, -0.92, 0.0);
    p.closePath();
  });
  chunk(g, [[cap, SH.cap, 0.13]]);
  clipIn(g, cap, () => {
    for (const [x, y, rx, ry] of [[-0.42, -0.42, 0.16, 0.12], [0.2, -0.52, 0.13, 0.1], [0.62, -0.22, 0.12, 0.1], [-0.12, -0.14, 0.09, 0.07], [-0.78, -0.12, 0.08, 0.07]] as const) {
      const s = E(x, y, rx, ry);
      paint(g, s, SH.spot, 0);
    }
  });
  // the jelly's shine
  g.globalAlpha = 0.85;
  g.strokeStyle = C(WHITE);
  g.lineWidth = 0.08;
  g.beginPath();
  g.arc(0, -0.02, 0.62, Math.PI * 1.13, Math.PI * 1.32);
  g.stroke();
  g.beginPath();
  g.arc(-0.24, -0.58, 0.035, 0, TAU);
  g.fillStyle = C(WHITE);
  g.fill();
  g.globalAlpha = 1;
});
const SH_HAND = wrapPart('shH', SH.stalk, 0.85);

function drawShroom() {
  const t = R.t;
  const br = Math.sin(t * 3 + R.seed);
  // it gets about by bouncing on its spring: up (stretched) and down (squeezed)
  const s = Math.sin(R.ph * 0.75);
  const up = Math.max(0, s) * R.mv;
  const dn = Math.max(0, -s) * R.mv;
  const bare = !R.weapon;
  // before a punch it sinks down on the spring; on the hit it springs up and in
  const k = 1 + 0.55 * up - 0.4 * dn + 0.08 * br * (1 - R.mv) - (bare ? 0.38 * R.wind - 0.3 * R.strike : 0);
  const foot = up * 0.22;
  const lean = (bare ? 0.18 * R.strike - 0.12 * R.wind : 0) + 0.06 * up - 0.03 * dn;
  put(SH_SHOE, '', 0, -foot, -0.12 * up);
  if (R.look.sneakers) shoeAt(0.06, -foot, 0.86);
  const sx = -0.14;
  const sy = SHOE_Y - foot;
  put(SH_SPRING, '', sx, sy, lean * 0.5, 1, k);
  const bx = sx + Math.sin(lean * 0.5) * SPRING * k;
  const by = sy - SPRING * k;
  // the far hand, up on guard
  if (!twoH()) put(SH_HAND, '', bx + 0.64 + 0.02 * br, by - 0.3, -0.3);
  put(SH_BODY, R.fk, bx, by, lean);
  // the cap sits on the stalk and wobbles like jelly
  const jig = 0.1 * dn - 0.06 * up + Math.sin(t * 13) * 0.025 * R.mv + (bare ? 0.07 * R.strike : 0) + 0.015 * br;
  const cx = bx + Math.sin(lean) * 0.86;
  const cy = by - Math.cos(lean) * 0.86;
  put(SH_CAP, '', cx, cy, lean * 1.25 + Math.sin(t * 2.2 + R.seed) * 0.03, 1 + jig, 1 - jig);
  helmetAt(cx + 0.04, cy - 0.5 * (1 - jig), 1.9, lean - 0.06);
  crownAt(cx + 0.05, cy - (R.look.helmet ? 0.9 : 0.66) * (1 - jig), lean - 0.12);
  chiliAt(cx + 0.12, cy - 1.0, 0.95);
  aimHand(bx + 0.5, by - 0.24, 0.62);
  armsAndWeapon(SH_HAND, R.weapon ? -0.6 : 0);
}

export const shroom = ch(2.4, 0.8, 1.15, [SH.cap, SH.capLight, SH.stalk], drawShroom, { lean: 0.04, wl: 0.9 });
