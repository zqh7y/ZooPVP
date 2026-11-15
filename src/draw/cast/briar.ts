import { B, C, E, PATH, R, RR, type Sh, accent, aimHand, armsAndWeapon, ch, chiliAt, chunk, clipIn, crownAt, eyes, helmetAt, inkC, inner, mouth, paint, part, put, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 8 briar: a round thorny rose bush with a grumpy face

const BR = { leaf: '#77a37d', vein: '#5c8865', rose: '#f0a3b0', thorn: '#ece1c4', root: '#8d6b4d' };
const BR_FOOT = part('brF', [-0.42, -0.4, 0.88, 0.52], (g) => chunk(g, [[E(0.04, -0.12, 0.23, 0.13), BR.root, 0.05]]));
/** a little leaf of a hand with a thorn on its back */
const BR_HAND = part('brH', [-0.4, -0.45, 0.8, 0.85], (g) => {
  const th = PATH((p) => {
    p.moveTo(-0.08, -0.1);
    p.lineTo(-0.03, -0.29);
    p.lineTo(0.06, -0.11);
    p.closePath();
  });
  chunk(g, [[th, BR.thorn, 0], [E(0, 0, 0.16, 0.14), BR.leaf, 0.05]]);
});
/** the knot of the band and its two ends, behind */
const BR_TAIL = part('brT', [-0.42, -0.32, 0.84, 0.95], (g) => {
  chunk(g, [[E(-0.1, 0.22, 0.1, 0.27, 0.35), accent(), 0.04], [E(0.1, 0.2, 0.1, 0.24, -0.3), accent(), 0.04], [E(0, -0.02, 0.14, 0.12), accent(), 0.03]]);
});
const BR_BODY = part('brB', [-1.42, -2.4, 2.88, 2.48], (g) => {
  const cy = -1.02;
  // thorns poking out all round, under the leaves
  const sh: Sh[] = [];
  for (const a of [-2.75, -2.15, -1.6, -1.0, -0.42, 0.4, 2.5, 3.05]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = c * 0.9;
    const y = cy + s * 0.86;
    sh.push([PATH((p) => {
      p.moveTo(x - s * 0.1, y + c * 0.1);
      p.lineTo(x + c * 0.24, y + s * 0.24);
      p.lineTo(x + s * 0.1, y - c * 0.1);
      p.closePath();
    }), BR.thorn, 0]);
  }
  // leafy clumps round a big round bush: one silhouette
  sh.push([E(-0.55, cy - 0.48, 0.45, 0.42), BR.leaf, 0.06]);
  sh.push([E(0.12, cy - 0.64, 0.48, 0.4), BR.leaf, 0.06]);
  sh.push([E(-0.8, cy + 0.14, 0.36, 0.38), BR.leaf, 0.06]);
  const body = E(0, cy, 0.92, 0.86);
  sh.push([body, BR.leaf, 0.15]);
  chunk(g, sh);
  // a few leaf marks
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = C(BR.vein);
  g.beginPath();
  for (const [x, y] of [[-0.55, cy - 0.12], [-0.3, cy + 0.42], [-0.05, cy - 0.5], [-0.72, cy + 0.42]] as const) {
    g.moveTo(x - 0.08, y - 0.06);
    g.lineTo(x, y + 0.02);
    g.lineTo(x + 0.08, y - 0.06);
  }
  g.stroke();
  // the band round its middle
  clipIn(g, body, () => {
    const band = RR(-1.0, cy + 0.42, 2.0, 0.24, 0.04);
    paint(g, band, accent(), 0);
    inner(g, band, 0.9);
  });
  // roses crowning the bush: a bloom with a curl of petals drawn in, two leaves under it
  for (const [x, y, s] of [[-0.4, cy - 0.86, 0.24], [0.3, cy - 0.92, 0.2], [-0.94, cy - 0.12, 0.18]] as const) {
    chunk(g, [[E(x - s * 0.8, y + s * 0.55, s * 0.5, s * 0.24, 0.5), BR.vein, 0], [E(x + s * 0.8, y + s * 0.55, s * 0.5, s * 0.24, -0.5), BR.vein, 0], [E(x, y, s, s * 0.9), BR.rose, s * 0.28]]);
    g.lineWidth = B.lw * 0.75;
    g.strokeStyle = inkC();
    g.beginPath();
    g.arc(x - s * 0.04, y + s * 0.02, s * 0.5, Math.PI * 0.75, Math.PI * 2.05);
    g.moveTo(x + s * 0.18, y + s * 0.02);
    g.arc(x + s * 0.02, y + s * 0.02, s * 0.18, 0, Math.PI * 1.3);
    g.stroke();
  }
  // a grumpy face: low brows and a frown when it is calm
  eyes(g, 0.36, 0.68, cy - 0.06, 0.13, BR.leaf);
  if (B.face === 'open' || B.face === 'blink') {
    g.lineWidth = 0.075;
    g.strokeStyle = inkC();
    g.beginPath();
    g.moveTo(0.2, cy - 0.33);
    g.lineTo(0.46, cy - 0.24);
    g.moveTo(0.6, cy - 0.26);
    g.lineTo(0.82, cy - 0.32);
    g.stroke();
  }
  if (B.mouth === 'smile') {
    g.lineWidth = Math.max(0.046, B.lw * 0.9);
    g.strokeStyle = inkC();
    g.beginPath();
    g.arc(0.54, cy + 0.34, 0.12, Math.PI * 1.18, Math.PI * 1.82);
    g.stroke();
  } else mouth(g, 0.54, cy + 0.24, 0.11);
});

function drawBriar() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.07 * R.mv;
  const sway = Math.sin(R.ph) * 0.06 * R.mv + Math.sin(t * 2.6 + R.seed) * 0.012;
  const fx = -0.3 + stepX(Math.PI, 0.2);
  const nx = 0.3 + stepX(0, 0.2);
  put(BR_FOOT, '', fx, stepY(Math.PI, 0.12));
  if (R.look.sneakers) shoeAt(fx + 0.04, stepY(Math.PI, 0.12), 0.55);
  if (!twoH()) put(BR_HAND, '', -0.98, -0.88 + bob);
  put(BR_TAIL, '', -0.84, -0.5 + bob, 0.3 + 0.6 * R.mv + Math.sin(t * 3 + R.seed) * 0.08);
  // it bristles as it lashes out
  const br = R.weapon ? 0 : 0.05 * R.strike;
  put(BR_BODY, R.fk, 0, bob, sway, 1 + br, 1 + br);
  put(BR_FOOT, '', nx, stepY(0, 0.12));
  if (R.look.sneakers) shoeAt(nx + 0.04, stepY(0, 0.12), 0.6);
  helmetAt(0.04 + sway * 1.4, bob - 1.42, 2.1, -0.06 + sway);
  crownAt(0.14 + sway * 2, bob - (R.look.helmet ? 2.02 : 1.98), -0.12 + sway);
  chiliAt(0.2, bob - 2.2, 1.0);
  aimHand(0.92, -0.86 + bob, 0.55);
  armsAndWeapon(BR_HAND);
}

export const briar = ch(2.15, 1.1, 1.0, [BR.leaf, BR.rose, BR.vein], drawBriar, { lean: 0.05, wl: 1.05 });
