import { lerp } from '../../util';
import { B, C, E, H, H2, PATH, R, RR, type Sh, TAU, WHITE, accent, aimHand, armsAndWeapon, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, helmetAt, inkC, inner, mix, mouth, paint, part, put, rope, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 12 boulder = Oak: an ancient oak giant. A BIRDHOUSE is nailed into
// its chest (the roof in the corner colour) and a sleepy owl peeks out of it (wide awake when there is trouble).
// Mushroom shoulder pads, a leafy crown, bark for armour (always on), and root fists taped in the corner colour.
// Its smash is a ground-pound: both root fists go up high and come down on the ground ahead.

const OK = { bark: '#8e6a4b', barkLight: '#ad8762', groove: '#6b4c35', leaf: '#76a85a', leafLight: '#9cc77a', leafDark: '#5c8c47', cap: '#d49152', capSpot: '#f6e7c8', gill: '#efdcb6', house: '#e0b679', houseDark: '#b68752', hole: '#3a2b2a', owl: '#a38b74', owlLight: '#e9dcc6', beak: '#f0a347' };

const OK_FOOT = part('okF', [-0.55, -0.45, 1.15, 0.58], (g) => {
  // a root foot: a stump with root toes spreading on the ground
  const toes: Sh[] = [
    [E(0.36, -0.05, 0.16, 0.06, 0.2), OK.groove, 0],
    [E(-0.26, -0.05, 0.14, 0.055, -0.2), OK.groove, 0],
  ];
  chunk(g, [...toes, [E(0.06, -0.12, 0.33, 0.14), OK.groove, 0.04]]);
});
/** a root fist: a knobbly ball of wood with a root or two sticking out, the wrist taped in the corner colour */
const OK_HAND = part('okH', [-0.55, -0.5, 1.05, 1.0], (g) => {
  const fist = PATH((p) => {
    p.moveTo(-0.16, -0.2);
    p.quadraticCurveTo(0.08, -0.32, 0.26, -0.16);
    p.quadraticCurveTo(0.34, 0.04, 0.22, 0.2);
    p.quadraticCurveTo(0.0, 0.3, -0.18, 0.18);
    p.quadraticCurveTo(-0.28, 0.0, -0.16, -0.2);
    p.closePath();
  });
  const tape = RR(-0.36, -0.14, 0.2, 0.28, 0.06);
  rope(g, PATH((p) => { p.moveTo(0.06, 0.2); p.quadraticCurveTo(0.08, 0.34, 0.0, 0.4); }), 0.05, OK.bark);
  chunk(g, [[fist, OK.bark, 0.07], [tape, accent(), 0.03]]);
  g.beginPath();
  g.ellipse(-0.27, -0.07, 0.05, 0.025, -0.3, 0, TAU);
  g.fillStyle = C(mix(accent(), WHITE, 0.5));
  g.fill();
  inner(g, PATH((p) => { p.moveTo(0.06, -0.24); p.quadraticCurveTo(0.14, -0.06, 0.08, 0.1); p.moveTo(0.22, -0.08); p.lineTo(0.3, -0.02); }), 0.7);
});
/** a mushroom shoulder pad; pivot = where it sits on the shoulder */
const OK_PAD = part('okP', [-0.55, -0.55, 1.1, 0.75], (g) => {
  const cap = PATH((p) => {
    p.moveTo(-0.36, 0.02);
    p.bezierCurveTo(-0.38, -0.4, 0.38, -0.4, 0.36, 0.02);
    p.quadraticCurveTo(0, 0.1, -0.36, 0.02);
    p.closePath();
  });
  const gill = PATH((p) => {
    p.moveTo(-0.3, 0.02);
    p.quadraticCurveTo(0, 0.14, 0.3, 0.02);
    p.quadraticCurveTo(0, 0.04, -0.3, 0.02);
    p.closePath();
  });
  chunk(g, [[gill, OK.gill, 0], [cap, OK.cap, 0.07]]);
  clipIn(g, cap, () => {
    for (const [x, y, r] of [[-0.15, -0.16, 0.065], [0.1, -0.22, 0.055], [0.23, -0.07, 0.045], [-0.26, -0.03, 0.035]] as const) paint(g, E(x, y, r, r * 0.85), OK.capSpot, 0);
  });
});
/** the leafy crown on its head; pivot = the top of the trunk */
const OK_CROWN = part('okC', [-1.2, -1.1, 2.35, 1.32], (g) => {
  const clumps: Sh[] = [];
  for (const [x, y, rx, ry] of [[-0.66, -0.2, 0.34, 0.28], [-0.36, -0.54, 0.4, 0.34], [0.12, -0.64, 0.42, 0.34], [0.58, -0.38, 0.36, 0.3], [0.7, -0.1, 0.24, 0.2], [-0.1, -0.24, 0.62, 0.34]] as const) {
    clumps.push([E(x, y, rx, ry), OK.leaf, 0.07]);
  }
  chunk(g, clumps);
  g.fillStyle = C(OK.leafLight);
  for (const [x, y, rx, ry] of [[-0.42, -0.68, 0.14, 0.07], [0.04, -0.8, 0.16, 0.07], [0.5, -0.54, 0.12, 0.06]] as const) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, -0.2, 0, TAU);
    g.fill();
  }
  g.lineWidth = B.lw * 0.8;
  g.strokeStyle = C(OK.leafDark);
  g.beginPath();
  for (const [x, y] of [[-0.6, -0.28], [-0.2, -0.44], [0.3, -0.36], [0.6, -0.2], [-0.3, -0.12]] as const) {
    g.moveTo(x - 0.07, y - 0.05);
    g.quadraticCurveTo(x, y + 0.03, x + 0.07, y - 0.05);
  }
  g.stroke();
});

/** the owl in its hole: sleepy, startled, cheering, knocked out, as the oak's face goes */
function owl(g: CanvasRenderingContext2D, x: number, y: number) {
  const f = B.face;
  const head = E(x, y + 0.06, 0.15, 0.13);
  const tufts = PATH((p) => {
    p.moveTo(x - 0.13, y - 0.02);
    p.lineTo(x - 0.15, y - 0.16);
    p.lineTo(x - 0.04, y - 0.06);
    p.moveTo(x + 0.13, y - 0.02);
    p.lineTo(x + 0.15, y - 0.16);
    p.lineTo(x + 0.04, y - 0.06);
  });
  chunk(g, [[tufts, OK.owl, 0], [head, OK.owl, 0.03]]);
  paint(g, E(x - 0.06, y + 0.05, 0.065, 0.065), OK.owlLight, 0);
  paint(g, E(x + 0.065, y + 0.05, 0.06, 0.06), OK.owlLight, 0);
  const awake = f === 'angry' || f === 'pinch' || f === 'wide' || f === 'spiral';
  const ink = inkC();
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineWidth = 0.028;
  for (const [ex, s] of [[x - 0.06, 1], [x + 0.065, 0.92]] as const) {
    g.beginPath();
    if (awake) {
      g.arc(ex + 0.01, y + 0.05, 0.035 * s, 0, TAU);
      g.fill();
    } else if (f === 'x') {
      g.moveTo(ex - 0.025, y + 0.025);
      g.lineTo(ex + 0.025, y + 0.075);
      g.moveTo(ex + 0.025, y + 0.025);
      g.lineTo(ex - 0.025, y + 0.075);
      g.stroke();
    } else if (f === 'happy') {
      g.moveTo(ex - 0.03, y + 0.06);
      g.quadraticCurveTo(ex, y + 0.01, ex + 0.03, y + 0.06);
      g.stroke();
    } else {
      // asleep: heavy lids, half shut
      g.moveTo(ex - 0.035, y + 0.05);
      g.quadraticCurveTo(ex, y + 0.08, ex + 0.035, y + 0.05);
      g.stroke();
    }
  }
  chunk(g, [[PATH((p) => { p.moveTo(x - 0.03, y + 0.1); p.lineTo(x + 0.03, y + 0.1); p.lineTo(x, y + 0.16); p.closePath(); }), OK.beak, 0]]);
}

/** the trunk: bark, the face, the birdhouse with the owl; pivot = the feet */
const OK_BODY = part('okB', [-1.0, -2.3, 2.0, 2.4], (g) => {
  const trunk = PATH((p) => {
    p.moveTo(-0.78, -0.12);
    p.quadraticCurveTo(-0.86, -1.0, -0.68, -2.06);
    p.quadraticCurveTo(0, -2.22, 0.7, -2.06);
    p.quadraticCurveTo(0.86, -1.0, 0.8, -0.12);
    p.quadraticCurveTo(0, 0.0, -0.78, -0.12);
    p.closePath();
  });
  chunk(g, [[trunk, OK.bark, 0.15]]);
  clipIn(g, trunk, () => {
    // the bark: long wavy grooves and a lighter ridge down the lit side
    paint(g, RR(-0.62, -1.9, 0.12, 1.7, 0.06), OK.barkLight, 0);
    g.lineWidth = B.lw * 1.0;
    g.strokeStyle = C(OK.groove);
    g.beginPath();
    for (const [x, y0, y1] of [[-0.42, -2.0, -0.3], [-0.12, -1.0, -0.1], [0.7, -1.3, -0.2], [-0.7, -1.2, -0.4]] as const) {
      g.moveTo(x, y0);
      g.bezierCurveTo(x + 0.08, lerp(y0, y1, 0.33), x - 0.08, lerp(y0, y1, 0.66), x + 0.02, y1);
    }
    g.stroke();
  });
  // a knot hole of a brow over its eyes, and its face
  inner(g, PATH((p) => { p.moveTo(-0.08, -1.74); p.quadraticCurveTo(0.2, -1.84, 0.5, -1.74); }), 1.4);
  blush(g, -0.02, -1.36, 0.09);
  eyes(g, 0.1, 0.36, -1.55, 0.14, OK.bark);
  mouth(g, 0.24, -1.3, 0.115);
  // the birdhouse
  const hx = 0.16;
  const house = RR(hx - 0.3, -0.98, 0.6, 0.5, 0.05);
  const roof = PATH((p) => {
    p.moveTo(hx - 0.42, -0.9);
    p.lineTo(hx, -1.2);
    p.lineTo(hx + 0.42, -0.9);
    p.lineTo(hx + 0.34, -0.83);
    p.lineTo(hx, -1.06);
    p.lineTo(hx - 0.34, -0.83);
    p.closePath();
  });
  chunk(g, [[house, OK.house, 0.05], [roof, accent(), 0.03]]);
  clipIn(g, house, () => {
    g.lineWidth = B.lw * 0.6;
    g.strokeStyle = C(OK.houseDark);
    g.beginPath();
    for (const y of [-0.8, -0.64]) {
      g.moveTo(hx - 0.3, y);
      g.lineTo(hx + 0.3, y);
    }
    g.stroke();
  });
  const hole = E(hx, -0.76, 0.17, 0.17);
  chunk(g, [[hole, OK.hole, 0]]);
  clipIn(g, hole, () => owl(g, hx, -0.78));
  inner(g, hole, 0.9);
  // the perch, and two nails
  rope(g, PATH((p) => { p.moveTo(hx - 0.04, -0.54); p.lineTo(hx + 0.2, -0.54); }), 0.04, OK.houseDark);
  g.fillStyle = C('#9aa1ab');
  for (const [x, y] of [[hx - 0.22, -0.9], [hx + 0.22, -0.9], [hx - 0.22, -0.56], [hx + 0.22, -0.56]] as const) {
    g.beginPath();
    g.arc(x, y, 0.025, 0, TAU);
    g.fill();
  }
});

/** it is drawn a little smaller than its own units, so the top rung stays big without towering over the pitch */
const K = 0.92;

function drawOak() {
  R.ctx.scale(K, K);
  drawOakAt();
  R.ctx.scale(1 / K, 1 / K);
}

function drawOakAt() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  const sway = Math.sin(R.ph) * 0.05 * R.mv + br * 0.01;
  const sk = R.strike;
  const bare = !R.weapon;
  const pound = bare && !R.cheer && (R.wind > 0 || sk > 0);
  const fx = -0.38 + stepX(Math.PI, 0.18);
  const nx = 0.38 + stepX(0, 0.18);
  const fy = stepY(Math.PI, 0.14);
  const ny = stepY(0, 0.14);
  put(OK_FOOT, '', fx, fy);
  if (R.look.sneakers) shoeAt(fx + 0.06, fy, 0.66);
  // the back pad behind the trunk
  put(OK_PAD, '', -0.74 + sway, -1.72 + bob, -0.3 + sway);
  // the far fist on guard, or up with the other for the ground-pound
  const wy = lerp(-0.82 + bob, -2.35, R.wind) + (0.42 + R.aim * 0.3) * sk * 1.6;
  const wx = lerp(0.95, 0.5, R.wind) + 0.3 * sk;
  if (!twoH()) {
    if (pound) put(OK_HAND, '', wx - 0.22, wy - 0.12, -0.6 + 0.9 * sk);
    else put(OK_HAND, '', 1.02 + 0.03 * br, -1.1 + bob, -0.5);
  }
  const sq = bare ? 0.05 * sk : 0;
  put(OK_BODY, R.fk, 0, bob, sway, 1 + sq, 1 - sq);
  put(OK_FOOT, '', nx, ny);
  if (R.look.sneakers) shoeAt(nx + 0.06, ny, 0.7);
  put(OK_PAD, '', 0.8 + sway * 1.6, -1.68 + bob, 0.3 + sway);
  // the leafy crown rustles
  const cx = 0.0 + sway * 2.2;
  const cy = -2.04 + bob;
  if (!R.look.helmet) put(OK_CROWN, '', cx, cy, sway * 0.8 + Math.sin(t * 1.9 + R.seed) * 0.03 - 0.06 * R.hurt);
  helmetAt(cx + 0.06, cy - 0.02, 1.9, -0.06 + sway);
  crownAt(cx + 0.1, cy - (R.look.helmet ? 0.64 : 0.86), -0.12 + sway);
  chiliAt(cx + 0.2, cy - 1.1, 1.05);
  if (pound) {
    H2.on = false;
    H.a = 0;
    H.s = 1;
    H.x = wx;
    H.y = wy;
  } else aimHand(0.92, -0.82 + bob, 0.55);
  armsAndWeapon(OK_HAND, R.weapon ? -0.6 : -0.2 + 0.6 * sk);
}

export const boulder = ch(2.6 * K, 1.15, 1.1 * K, [OK.bark, OK.leaf, OK.groove], drawOak, { lean: 0.04, wl: 1.15 });
