import { COLOR } from '../../theme';
import { lerp, smooth } from '../../util';
import { E, PATH, R, RR, STONE_INK, TAU, accent, aimHand, armsAndWeapon, ch, chiliAt, chunk, clipIn, crownAt, eyes, handPart, helmetAt, inkC, inner, mouth, paint, part, put, shoeAt, stepX, stepY, twoH, B, rope } from './kit';
// ---------------------------------------------------------------- 9 angler: a fisherman in a rain hat with a rod

const AN = { coat: '#dfbc5f', skin: '#f0cca4', beard: '#eeebe4', boot: '#5a7680', rod: '#9a6a44', reel: '#aab2bd', nose: '#e8a291', hair: '#d4d0c8', dark: '#4a4f5c' };
const AN_FOOT = part('anF', [-0.42, -0.44, 0.9, 0.56], (g) => chunk(g, [[RR(-0.17, -0.27, 0.42, 0.27, 0.11), AN.boot, 0.05]]));
const AN_HAND = handPart('anH', AN.skin, 0.12);
const AN_TAIL = part('anT', [-0.32, -0.25, 0.64, 0.9], (g) => {
  chunk(g, [[RR(-0.13, -0.06, 0.26, 0.5, 0.12), accent(), 0.05]]);
  inner(g, PATH((p) => { p.moveTo(-0.13, 0.3); p.lineTo(0.13, 0.3); }), 0.7);
});
/** the raincoat and the scarf; pivot = the feet */
const AN_BODY = part('anB', [-0.75, -1.38, 1.5, 1.48], (g) => {
  const coat = PATH((p) => {
    p.moveTo(-0.3, -1.04);
    p.quadraticCurveTo(0.0, -1.14, 0.32, -1.04);
    p.quadraticCurveTo(0.52, -0.5, 0.5, -0.22);
    p.quadraticCurveTo(0.0, -0.1, -0.48, -0.22);
    p.quadraticCurveTo(-0.52, -0.5, -0.3, -1.04);
    p.closePath();
  });
  chunk(g, [[coat, AN.coat, 0.1]]);
  inner(g, PATH((p) => { p.moveTo(0.24, -0.98); p.quadraticCurveTo(0.32, -0.6, 0.28, -0.16); }), 0.8);
  g.fillStyle = inkC();
  for (const y of [-0.74, -0.46]) {
    g.beginPath();
    g.arc(0.38, y, 0.045, 0, TAU);
    g.fill();
  }
  chunk(g, [[E(0.0, -1.06, 0.4, 0.18), accent(), 0.06]]);
});
/** the head with its white beard and sou'wester (thin hair instead when gear sits there); pivot = the neck */
const AN_HEAD = part('anHd', [-1.02, -1.5, 2.04, 1.8], (g) => {
  const head = E(0.04, -0.5, 0.56, 0.52);
  const own = !R.look.helmet;
  chunk(g, own ? [[head, AN.skin, 0.1]] : [[E(-0.2, -0.78, 0.38, 0.26, -0.4), AN.hair, 0.03], [head, AN.skin, 0.1]]);
  chunk(g, [[E(-0.08, -0.22, 0.26, 0.24), AN.beard, 0.04], [E(0.48, -0.25, 0.24, 0.22), AN.beard, 0.04], [E(0.2, -0.14, 0.36, 0.3), AN.beard, 0.06]]);
  chunk(g, [[E(0.58, -0.44, 0.1, 0.085), AN.nose, 0.02]]);
  eyes(g, 0.28, 0.52, -0.6, 0.11, AN.skin);
  mouth(g, 0.42, -0.2, 0.09);
  if (!own) return;
  // the sou'wester: a round crown and a brim that slopes down long at the back
  const crown = PATH((p) => {
    p.moveTo(-0.5, -0.74);
    p.bezierCurveTo(-0.5, -1.32, 0.56, -1.36, 0.56, -0.8);
    p.closePath();
  });
  const brim = PATH((p) => {
    p.moveTo(0.8, -0.86);
    p.quadraticCurveTo(0.1, -0.88, -0.56, -0.76);
    p.quadraticCurveTo(-0.8, -0.64, -0.84, -0.36);
    p.quadraticCurveTo(-0.62, -0.42, -0.5, -0.58);
    p.quadraticCurveTo(0.1, -0.72, 0.8, -0.72);
    p.closePath();
  });
  chunk(g, [[crown, AN.coat, 0.07], [brim, AN.coat, 0.04]]);
});
/** the rod: pivot at the grip, pointing up, 1.9 long */
const AN_ROD = part('anR', [-0.24, -2.05, 0.5, 2.25], (g) => {
  rope(g, PATH((p) => { p.moveTo(0, 0.06); p.lineTo(0, -1.92); }), 0.06, AN.rod);
  chunk(g, [[RR(-0.065, -0.32, 0.13, 0.4, 0.05), AN.dark, 0], [E(0.1, -0.2, 0.09, 0.09), AN.reel, 0]]);
});
/** the float with the hook under it */
const AN_BOB = part('anBb', [-0.25, -0.25, 0.5, 0.6], (g) => {
  g.lineWidth = B.lw * 0.9;
  g.strokeStyle = inkC();
  g.beginPath();
  g.moveTo(0, 0.08);
  g.lineTo(0, 0.2);
  g.arc(-0.05, 0.2, 0.05, 0, Math.PI * 0.9);
  g.stroke();
  const f = E(0, 0, 0.1, 0.1);
  chunk(g, [[f, '#f2efe7', 0.03]]);
  clipIn(g, f, () => paint(g, RR(-0.12, -0.12, 0.24, 0.11, 0), '#e39a58', 0));
});

function drawAngler() {
  const t = R.t;
  const ctx = R.ctx;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  const fx = -0.16 + stepX(Math.PI, 0.22);
  const nx = 0.16 + stepX(0, 0.22);
  // armed, it slings the rod on its back
  if (R.weapon) put(AN_ROD, '', -0.28, -0.55 + bob, -0.5);
  put(AN_FOOT, '', fx, stepY(Math.PI, 0.14));
  if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.14), 0.55);
  if (R.weapon && !twoH()) put(AN_HAND, '', -0.42, -0.62 + bob);
  put(AN_TAIL, '', -0.32, -1.04 + bob, 0.3 + 0.7 * R.mv + Math.sin(t * 3 + R.seed) * 0.08);
  put(AN_BODY, '', 0, bob);
  put(AN_FOOT, '', nx, stepY(0, 0.14));
  if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.14), 0.6);
  const hx = 0.02 + (R.weapon ? 0 : 0.06 * R.strike - 0.05 * R.wind);
  const hy = -1.08 + bob + Math.sin(t * 2.6 + R.seed + 0.8) * 0.02;
  put(AN_HEAD, R.fk, hx, hy, R.weapon ? 0 : 0.06 * R.strike - 0.06 * R.wind);
  helmetAt(hx + 0.05, hy - 0.78, 1.36, -0.08);
  crownAt(hx + 0.04, hy - (R.look.helmet ? 1.1 : 1.2));
  chiliAt(hx + 0.15, hy - 1.38, 0.9);
  if (R.weapon) {
    aimHand(0.42, -0.62 + bob, 0.5);
    armsAndWeapon(AN_HAND);
    return;
  }
  // the cast: the rod goes back over the shoulder on the wind-up and whips forward; the hook flies out
  const sk = R.strike;
  const ft = sk < 0.7 ? 1.15 * smooth(sk / 0.7) : lerp(1.15, 1, (sk - 0.7) / 0.3);
  const gx = 0.4 - 0.2 * R.wind + 0.18 * ft;
  const gy = -0.64 + bob - 0.22 * R.wind + R.aim * 0.1 * ft;
  let a = 0.5 - 1.45 * R.wind + (0.7 + R.aim * 0.35) * ft;
  if (R.cheer) a = -0.1 + Math.sin(t * 9) * 0.2;
  const L = 1.9;
  const tx = gx + Math.sin(a) * L;
  const ty = gy - Math.cos(a) * L;
  const out = Math.min(1, sk * 1.3);
  const sw = Math.sin(t * 2.2 + R.seed) * 0.06 * (1 - out);
  const ex = tx + sw + 0.55 * out;
  const ey = lerp(ty + 0.75, ty + 0.2 + R.aim * 0.5, out);
  // the far hand on the butt, the rod, the near hand on the grip
  put(AN_HAND, '', gx - Math.sin(a) * 0.3, gy + Math.cos(a) * 0.3);
  put(AN_ROD, '', gx, gy, a);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(lerp(tx, ex, 0.5) + 0.1 * out, lerp(ty, ey, 0.5) - 0.25 * out + 0.08, ex, ey - 0.08);
  ctx.lineWidth = R.lw * 0.7;
  ctx.strokeStyle = R.grey ? STONE_INK : COLOR.ink;
  ctx.stroke();
  put(AN_BOB, '', ex, ey);
  put(AN_HAND, '', gx, gy);
}

export const angler = ch(2.3, 0.95, 0.95, [AN.coat, AN.beard, AN.boot], drawAngler);
