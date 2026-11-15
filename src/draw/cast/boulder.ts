import { lerp } from '../../util';
import { C, E, H, H2, PATH, R, RR, TAU, type Sh, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, helmetAt, inner, mix, mouth, paint, part, put, rope, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 12 boulder: a mossy rock golem with a tiny flower on top

const BO = { rock: '#a8a294', moss: '#8aa86a', petal: '#f6f1e4', heart: '#e8c46a', stem: '#6aa45a' };
const BO_FOOT = part('boF', [-0.45, -0.46, 0.98, 0.6], (g) => chunk(g, [[RR(-0.22, -0.3, 0.52, 0.3, 0.13), BO.rock, 0.05]]));
const BO_HAND = part('boH', [-0.46, -0.46, 0.92, 0.92], (g) => {
  const fist = RR(-0.23, -0.21, 0.46, 0.42, 0.16);
  chunk(g, [[fist, BO.rock, 0.08]]);
  inner(g, PATH((p) => { p.moveTo(0.06, -0.2); p.lineTo(0.1, -0.06); }), 0.7);
});
/** the cape (the team colour): pivot at the top of its back, hanging down behind */
const BO_CAPE = part('boC', [-1.05, -0.3, 1.25, 1.85], (g) => {
  const p = PATH((p) => {
    p.moveTo(0.0, -0.06);
    p.quadraticCurveTo(-0.46, 0.4, -0.78, 1.3);
    p.quadraticCurveTo(-0.44, 1.44, -0.1, 1.32);
    p.quadraticCurveTo(0.02, 0.62, 0.1, 0.06);
    p.closePath();
  });
  chunk(g, [[p, accent(), 0.08]]);
  inner(g, PATH((p) => { p.moveTo(-0.1, 0.3); p.quadraticCurveTo(-0.3, 0.8, -0.42, 1.3); }), 0.7);
});
const BO_BODY = part('boB', [-1.32, -2.32, 2.64, 2.4], (g) => {
  const cy = -1.05;
  // a lumpy rock: a smooth curve round eight points
  const pts = [[0.95, -0.08], [0.8, -0.74], [0.16, -1.0], [-0.52, -0.9], [-0.97, -0.34], [-0.92, 0.44], [-0.38, 0.86], [0.52, 0.84]];
  const n = pts.length;
  const rock = PATH((p) => {
    const mid = (i: number) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, cy + (pts[i][1] + pts[(i + 1) % n][1]) / 2];
    const m0 = mid(n - 1);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(i);
      p.quadraticCurveTo(pts[i][0], cy + pts[i][1], m[0], m[1]);
    }
    p.closePath();
  });
  chunk(g, [[rock, BO.rock, 0.16]]);
  clipIn(g, rock, () => {
    // the moss cap, its edge hanging in drips
    const moss = PATH((p) => {
      p.moveTo(-1.1, cy - 0.46);
      for (let i = 0; i < 6; i++) {
        const x0 = -1.1 + i * 0.38;
        p.quadraticCurveTo(x0 + 0.19, cy - 0.46 + (i % 2 ? 0.2 : 0.32), x0 + 0.38, cy - 0.5 + (i % 2 ? 0 : 0.04));
      }
      p.lineTo(1.2, cy - 1.3);
      p.lineTo(-1.2, cy - 1.3);
      p.closePath();
    });
    paint(g, moss, BO.moss, 0.05);
    inner(g, moss, 0.9);
    // a crack and a pebble or two
    inner(g, PATH((p) => {
      p.moveTo(-0.7, cy + 0.2);
      p.lineTo(-0.5, cy + 0.36);
      p.lineTo(-0.56, cy + 0.56);
    }), 0.8);
    g.fillStyle = C(mix(BO.rock, '#2e2742', 0.14));
    for (const [x, y, s] of [[-0.3, cy + 0.6, 0.07], [0.12, cy + 0.68, 0.05], [-0.62, cy - 0.12, 0.05]] as const) {
      g.beginPath();
      g.ellipse(x, y, s * 1.3, s, 0, 0, TAU);
      g.fill();
    }
  });
  // a heavy brow over small kind eyes
  inner(g, PATH((p) => { p.moveTo(0.22, cy - 0.3); p.quadraticCurveTo(0.55, cy - 0.36, 0.88, cy - 0.3); }), 1.1);
  eyes(g, 0.42, 0.72, cy - 0.08, 0.12, BO.rock);
  blush(g, 0.3, cy + 0.12, 0.08);
  mouth(g, 0.6, cy + 0.22, 0.11);
});
const BO_FLOWER = part('boFl', [-0.42, -0.8, 0.84, 0.92], (g) => {
  rope(g, PATH((p) => { p.moveTo(0, 0.06); p.quadraticCurveTo(0.05, -0.2, 0, -0.42); }), 0.06, BO.stem);
  chunk(g, [[E(0.13, -0.18, 0.11, 0.055, -0.5), BO.moss, 0]]);
  const petals: Sh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 - Math.PI / 2;
    petals.push([E(Math.cos(a) * 0.13, -0.5 + Math.sin(a) * 0.13, 0.1, 0.1), BO.petal, 0]);
  }
  chunk(g, petals);
  chunk(g, [[E(0, -0.5, 0.075, 0.075), BO.heart, 0]]);
});

function drawBoulder() {
  const t = R.t;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  const sway = Math.sin(R.ph) * 0.05 * R.mv + Math.sin(t * 2.6 + R.seed) * 0.01;
  const sk = R.strike;
  put(BO_CAPE, '', -0.55, -1.72 + bob, 0.12 + 0.35 * R.mv + Math.sin(t * 2.2 + R.seed) * 0.05 + 0.12 * R.hurt);
  const fx = -0.36 + stepX(Math.PI, 0.18);
  const nx = 0.36 + stepX(0, 0.18);
  put(BO_FOOT, '', fx, stepY(Math.PI, 0.14));
  if (R.look.sneakers) shoeAt(fx + 0.06, stepY(Math.PI, 0.14), 0.62);
  if (!twoH()) put(BO_HAND, '', -0.98, -0.9 + bob);
  const sq = R.weapon ? 0 : 0.06 * sk;
  put(BO_BODY, R.fk, 0, bob, sway, 1 + sq, 1 - sq);
  put(BO_FOOT, '', nx, stepY(0, 0.14));
  if (R.look.sneakers) shoeAt(nx + 0.06, stepY(0, 0.14), 0.66);
  if (!R.look.helmet) put(BO_FLOWER, '', 0.12 + sway * 2, bob - 1.98, sway + Math.sin(t * 2.1 + R.seed) * 0.12 - R.mv * 0.2 - R.hurt * 0.3);
  helmetAt(0.04 + sway * 1.4, bob - 1.46, 2.15, -0.06 + sway);
  crownAt(0.12 + sway * 2, bob - (R.look.helmet ? 2.05 : 1.98), -0.12 + sway);
  chiliAt(0.2, bob - 2.25, 1.0);
  // the smash: the fist goes up high on the wind-up and comes down ahead
  if (!R.weapon && !R.cheer && (R.wind > 0 || sk > 0)) {
    H2.on = false;
    H.a = 0;
    H.s = 1;
    H.x = lerp(0.9, 0.45, R.wind) + 0.42 * sk;
    H.y = lerp(-0.92 + bob, -2.05, R.wind) + (0.3 + R.aim * 0.3) * sk;
  } else aimHand(0.9, -0.92 + bob, 0.45);
  armsAndWeapon(BO_HAND);
}

export const boulder = ch(2.15, 1.2, 1.05, [BO.rock, BO.moss, '#77736a'], drawBoulder, { lean: 0.04, wl: 1.15 });
