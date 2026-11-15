import { E, H, PATH, R, aimHand, armsAndWeapon, accent, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inner, mouth, paint, part, put, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 2 buzzy = Scorp: a scorpion whose tail ends in a round green
// bulb of poison instead of a stinger; it LOBS poison from it, so its attack is a big tail throw: cocked back on the
// wind, flung over its head on the strike

const SC = { shell: '#e39a55', light: '#f6c88f', leg: '#d18d50', bulb: '#a8d94a' };
/** the tail: one tapered curl, its length, its heading at the root (at rest) and its curl (turn per unit) for a throw k */
const TAIL_L = 1.08;
const TAIL_A0 = -2.3;
const kapOf = (k: number) => ((k >= 0 ? 0.5 - 0.15 * k : 0.5 - 0.1 * k) * 4) / TAIL_L;
/** a point s along the tail (root at 0, 0), the tail leaving at heading a0: [x, y, heading] */
function along(s: number, a0: number, kap: number): [number, number, number] {
  const a = a0 + kap * s;
  return [(Math.sin(a) - Math.sin(a0)) / kap, -(Math.cos(a) - Math.cos(a0)) / kap, a];
}

/** a stubby leg: pivot = the hip, down to the ground */
const SC_LEG = part('scL', [-0.3, -0.25, 0.62, 0.78], (g) => chunk(g, [[E(0.04, 0.19, 0.1, 0.19, -0.2), SC.leg, 0.04]]));
/** the tail, one smooth shape, thick at the body and thin at the bulb: pivot = the root. One per throw step (k in 1/4s) */
const SC_TAIL = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((q) =>
  part(`scT${q}`, [-0.65, -1.32, 1.35, 1.72], (g) => {
    const kap = kapOf(q / 4);
    const n = 18;
    const side: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const [x, y, a] = along((i / n) * TAIL_L, TAIL_A0, kap);
      const w = 0.21 - 0.12 * (i / n);
      side.push([x - Math.sin(a) * w, y + Math.cos(a) * w], [x + Math.sin(a) * w, y - Math.cos(a) * w]);
    }
    const [tx, ty, ta] = along(TAIL_L, TAIL_A0, kap);
    const tail = PATH((p) => {
      for (let i = 0; i <= n; i++) p.lineTo(side[i * 2][0], side[i * 2][1]);
      p.arc(tx, ty, 0.09, ta + Math.PI / 2, ta - Math.PI / 2, true);
      for (let i = n; i >= 0; i--) p.lineTo(side[i * 2 + 1][0], side[i * 2 + 1][1]);
      p.closePath();
    });
    chunk(g, [[tail, SC.shell, 0.06]]);
  }),
);
/** the bulb at the tip: pivot = where it sits on the tail, pointing up (-y) */
const SC_BULB = part('scBl', [-0.5, -0.82, 1.0, 1.0], (g) => chunk(g, [[E(0, -0.3, 0.3, 0.3), SC.bulb, 0.08]]));
/** the body and head as one shape with its face, trunks on its back end: pivot = the feet */
const SC_BODY = part('scB', [-1.08, -1.42, 2.0, 1.42], (g) => {
  const abd = E(-0.24, -0.48, 0.6, 0.3);
  chunk(g, [[abd, SC.shell, 0.08], [E(0.24, -0.8, 0.46, 0.42), SC.shell, 0.1]]);
  clipIn(g, abd, () => {
    const edge = (p: Path2D, x: number) => {
      p.moveTo(x, -0.82);
      p.quadraticCurveTo(x + 0.08, -0.48, x, -0.12);
    };
    const trunks = PATH((p) => {
      edge(p, -0.3);
      p.lineTo(-0.9, -0.12);
      p.lineTo(-0.9, -0.82);
      p.closePath();
    });
    paint(g, trunks, accent(), 0.06);
    inner(g, trunks, 1);
    const waist = PATH((p) => {
      edge(p, -0.3);
      p.lineTo(-0.39, -0.12);
      p.quadraticCurveTo(-0.31, -0.48, -0.39, -0.82);
      p.closePath();
    });
    paint(g, waist, '#f2ede3', 0);
    inner(g, waist, 0.8);
  });
  blush(g, 0.36, -0.66, 0.08);
  eyes(g, 0.38, 0.62, -0.92, 0.15, SC.shell);
  mouth(g, 0.56, -0.66, 0.1);
});
const SC_GLOVE = glovePart('scG', SC.shell, 0.95);

function drawScorp() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const bob = -Math.abs(Math.sin(R.ph * 1.5)) * 0.04 * R.mv + br * 0.01;
  // the throw: -1 cocked back (wind), 0 at rest, 1 flung forward at the strike
  const k = R.strike > 0 ? Math.min(1, R.strike * 1.25) : -R.wind;
  // two stubby legs a side, the back one of each pair turned back
  const legs = (x0: number, off0: number) => {
    for (let i = 0; i < 2; i++) {
      const off = i * 3.1 + off0;
      put(SC_LEG, '', x0 + i * 0.58, -0.36 + bob + stepY(off, 0.1), stepX(off, 0.4), i === 0 ? -1 : 1);
    }
  };
  legs(-0.36, Math.PI * 0.5);
  // the tail: from its back, curling up and over to the bulb; the whole curl swings on the throw
  const q = Math.round(k * 4);
  const kap = kapOf(q / 4);
  const rot = 0.75 * k + Math.sin(t * 2.2 + R.seed) * 0.05;
  const rx = -0.74;
  const ry = -0.55 + bob;
  put(SC_TAIL[q + 4], '', rx, ry, rot);
  const [tx, ty, ta] = along(TAIL_L, TAIL_A0 + rot, kap);
  const ba = ta + 0.25 + R.aim * 0.25 * Math.max(0, k);
  put(SC_BULB, '', rx + tx - Math.cos(ba) * 0.05, ry + ty - Math.sin(ba) * 0.05, ba + Math.PI / 2);
  // the far claw (a glove) up by its face
  if (!twoH()) put(SC_GLOVE, '', 1.1 + 0.03 * br, -0.64 + bob, -0.35);
  put(SC_BODY, R.fk, 0, bob);
  legs(-0.5, -Math.PI * 0.5);
  if (R.look.sneakers) {
    shoeAt(-0.58, 0, 0.36);
    shoeAt(0.14, 0, 0.4);
  }
  const hx = 0.24;
  const hy = -0.84 + bob;
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

export const scorp = ch(1.8, 1.05, 0.65, [SC.shell, SC.light, SC.leg], drawScorp, { lean: 0.03, wl: 0.85 });
