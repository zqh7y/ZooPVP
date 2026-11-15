import { B, C, E, H, PATH, R, RR, TAU, WHITE, accent, aimHand, armsAndWeapon, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inkC, inner, paint, part, put, rope, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 2 buzzy = Scorp: a scorpion in a gas mask (the corner colour)
// whose tail ends in a bubbling chemistry flask instead of a stinger; it LOBS poison from it, so its attack is a
// big tail throw: cocked back on the wind, flung over its head on the strike (the glob leaves the flask's mouth)

const SC = { shell: '#e39a55', light: '#f6c88f', dark: '#b97236', leg: '#a8642f', far: '#874c22', glass: '#e6f5f2', poison: '#a8d94a', metal: '#a3abb5' };

/** a leg: pivot = the hip; out to the knee and down to the ground */
const legOf = (id: string, col: string) =>
  part(id, [-0.2, -0.32, 0.56, 0.72], (g) => rope(g, PATH((p) => { p.moveTo(0, 0); p.quadraticCurveTo(0.2, -0.16, 0.2, 0.32); }), 0.065, col));
const SC_LEG = legOf('scL', SC.leg);
const SC_LEG_FAR = legOf('scLf', SC.far);
/** a bead of the tail */
const SC_SEG = part('scS', [-0.34, -0.34, 0.68, 0.68], (g) => {
  chunk(g, [[E(0, 0, 0.19, 0.17), SC.shell, 0.05]]);
  inner(g, PATH((p) => p.arc(0.0, 0.0, 0.11, Math.PI * 0.15, Math.PI * 0.85)), 0.6);
});
/** the flask: pivot = where it is clamped to the tail; the bulb, then the neck pointing up (-y), turned to aim */
const SC_FLASK = part('scF', [-0.52, -1.0, 1.04, 1.18], (g) => {
  const bulb = E(0, -0.3, 0.3, 0.28);
  const neck = RR(-0.1, -0.8, 0.2, 0.46, 0.05);
  const lip = RR(-0.16, -0.86, 0.32, 0.11, 0.05);
  chunk(g, [[neck, SC.glass, 0], [bulb, SC.poison, 0.07], [lip, SC.glass, 0]]);
  // the poison is in the bulb and up the neck a little, with bubbles in it
  clipIn(g, neck, () => paint(g, RR(-0.2, -0.56, 0.4, 0.4, 0), SC.poison, 0));
  inner(g, PATH((p) => { p.moveTo(-0.1, -0.56); p.lineTo(0.1, -0.56); }), 0.6);
  g.fillStyle = C('#d9f19c');
  for (const [x, y, r] of [[0.1, -0.24, 0.05], [-0.06, -0.14, 0.035], [0.02, -0.66, 0.03]] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  // glass shine
  g.strokeStyle = C(WHITE);
  g.lineWidth = 0.06;
  g.beginPath();
  g.arc(0, -0.3, 0.19, Math.PI * 1.05, Math.PI * 1.45);
  g.stroke();
  g.beginPath();
  g.moveTo(-0.04, -0.76);
  g.lineTo(-0.04, -0.62);
  g.stroke();
  // the clamp that holds it on the tail
  chunk(g, [[RR(-0.17, -0.07, 0.34, 0.13, 0.05), SC.metal, 0]]);
});
/** a bubble of poison, rising out of the flask */
const SC_BUB = part('scBb', [-0.16, -0.16, 0.32, 0.32], (g) => chunk(g, [[E(0, 0, 0.065, 0.065), SC.poison, 0]]));
/** the abdomen: pivot = the feet */
const SC_BODY = part('scB', [-1.08, -0.98, 1.6, 0.98], (g) => {
  const ab = E(-0.28, -0.48, 0.56, 0.3);
  chunk(g, [[ab, SC.shell, 0.08]]);
  clipIn(g, ab, () => {
    paint(g, E(-0.32, -0.26, 0.6, 0.12), SC.light, 0);
    g.lineWidth = 0.06;
    g.strokeStyle = inkC();
    g.beginPath();
    for (const x of [-0.52, -0.26]) {
      g.moveTo(x, -0.82);
      g.quadraticCurveTo(x - 0.08, -0.6, x - 0.04, -0.38);
    }
    g.stroke();
  });
});
/** the head in its gas mask: pivot = the middle of the head. A respirator in the corner colour over its mouth, a big
 * round filter can on the front, a strap round the back; the eyes stay free (and cocky) above it. */
const SC_HEAD = part('scHd', [-0.66, -0.72, 1.66, 1.34], (g) => {
  const head = E(0, 0, 0.48, 0.44);
  chunk(g, [[head, SC.shell, 0.1]]);
  clipIn(g, head, () => {
    const strap = PATH((p) => { p.moveTo(0.3, 0.16); p.quadraticCurveTo(-0.1, 0.12, -0.5, 0.3); });
    g.lineWidth = 0.13 + B.lw * 2;
    g.strokeStyle = inkC();
    g.stroke(strap);
    g.lineWidth = 0.13;
    g.strokeStyle = C(accent());
    g.stroke(strap);
  });
  const cup = PATH((p) => {
    p.moveTo(0.14, 0.02);
    p.quadraticCurveTo(0.4, -0.06, 0.6, 0.06);
    p.quadraticCurveTo(0.66, 0.3, 0.44, 0.4);
    p.quadraticCurveTo(0.2, 0.42, 0.14, 0.24);
    p.closePath();
  });
  const can = E(0.66, 0.24, 0.15, 0.18);
  chunk(g, [[cup, accent(), 0.06], [can, SC.metal, 0.05]]);
  const disc = E(0.7, 0.24, 0.08, 0.11);
  paint(g, disc, '#6d7580', 0);
  inner(g, disc, 0.7);
  eyes(g, 0.14, 0.41, -0.15, 0.155, SC.shell);
});
const SC_GLOVE = glovePart('scG', SC.shell, 0.95);

function drawScorp() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const bob = -Math.abs(Math.sin(R.ph * 1.5)) * 0.04 * R.mv + br * 0.01;
  // the throw: -1 cocked back (wind), 0 at rest, 1 flung forward at the strike
  const k = R.strike > 0 ? Math.min(1, R.strike * 1.25) : -R.wind;
  // far legs, darker, behind
  for (let i = 0; i < 3; i++) {
    const off = i * 2.1 + Math.PI;
    put(SC_LEG_FAR, '', -0.36 + i * 0.24, -0.36 + bob + stepY(off, 0.1), stepX(off, 0.5), i === 0 ? -1 : 1);
  }
  // the tail: a chain of beads from its back, curling up and over to the flask
  let a = -2.05 + 0.75 * k + Math.sin(t * 2.2 + R.seed) * 0.05;
  const curl = k >= 0 ? 0.5 - 0.15 * k : 0.5 + 0.1 * -k;
  let x = -0.74;
  let y = -0.55 + bob;
  const L = [0.3, 0.28, 0.26, 0.24];
  put(SC_SEG, '', x, y, 0, 1.1, 1.1);
  for (let i = 0; i < 4; i++) {
    x += Math.cos(a) * L[i];
    y += Math.sin(a) * L[i];
    const s = 1.02 - i * 0.08;
    put(SC_SEG, '', x, y, a, s, s);
    a += curl;
  }
  a += R.aim * 0.25 * Math.max(0, k);
  // a bubble rising from the flask's mouth
  const nx = x + Math.cos(a) * 0.9;
  const ny = y + Math.sin(a) * 0.9;
  const bc = (t * 1.1 + R.seed * 0.37) % 1;
  if (k > -0.2) put(SC_BUB, '', nx + bc * 0.12, ny - bc * 0.45, 0, 1 - bc * 0.6, 1 - bc * 0.6);
  put(SC_FLASK, '', x, y, a + Math.PI / 2);
  // the far claw (a glove) up by its mask
  if (!twoH()) put(SC_GLOVE, '', 1.1 + 0.03 * br, -0.64 + bob, -0.35);
  put(SC_BODY, '', 0, bob);
  const hx = 0.2;
  const hy = -0.84 + bob;
  put(SC_HEAD, R.fk, hx, hy, -0.1 * Math.max(0, k) + 0.04 * br);
  // near legs
  for (let i = 0; i < 3; i++) {
    const off = i * 2.1;
    put(SC_LEG, '', -0.44 + i * 0.25, -0.34 + bob + stepY(off, 0.1), stepX(off, 0.5), i === 0 ? -1 : 1);
  }
  if (R.look.sneakers) {
    shoeAt(-0.72, 0, 0.36);
    shoeAt(0.36, 0, 0.4);
  }
  helmetAt(hx + 0.02, hy - 0.3, 1.15, -0.08);
  crownAt(hx + 0.02, hy - (R.look.helmet ? 0.62 : 0.36));
  chiliAt(hx + 0.1, hy - 0.85, 0.75);
  // it throws with its tail, so a weapon in its claw is held up on guard, not swung
  const w = R.wind;
  const s = R.strike;
  if (R.weapon) R.wind = R.strike = 0;
  aimHand(1.02, -0.32 + bob, 0);
  R.wind = w;
  R.strike = s;
  if (!R.weapon) H.x -= 0.12 * Math.max(0, k);
  armsAndWeapon(SC_GLOVE, R.weapon ? -0.6 : -0.2);
}

export const scorp = ch(1.8, 1.05, 0.65, [SC.shell, SC.light, SC.dark], drawScorp, { lean: 0.03, wl: 0.85 });
