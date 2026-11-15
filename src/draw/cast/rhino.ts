import { lerp, smooth } from '../../util';
import { B, C, E, H, H2, PATH, R, RR, type Face, type Mouth, type Part, accent, aimHand, armsAndWeapon, bandTails, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, helmetAt, inner, mouth, paint, part, put, rope, shoeAt, stepX, stepY, trunksIn, twoH, wrapPart } from './kit';
// ---------------------------------------------------------------- 11 rhino = Bamboo: a stack of three bamboo segments, a face on each,
// and they BICKER (the middle one turns round to shout at the top one, the bottom one rolls its eyes), until there
// is a fight: then all three glare the same way. A kung-fu headband and trunks in the corner colour, taped fists,
// and a bamboo staff: a poke on the strike, levelled like a lance on its run-up (the charge)

const BB = { green: '#94c45a', light: '#c4e08c', node: '#6f9a3c', leaf: '#7fb24e', staff: '#d9c071', staffNode: '#b39a4e', foot: '#6f9a3c' };
const SEG_H = 0.66;
/** the bottom of the lowest segment above the feet */
const BASE = -0.22;

const BB_FOOT = part('bbF', [-0.42, -0.45, 0.9, 0.57], (g) => {
  rope(g, PATH((p) => { p.moveTo(0, -0.32); p.lineTo(0.02, -0.1); }), 0.11, BB.foot);
  chunk(g, [[E(0.08, -0.08, 0.22, 0.1), BB.foot, 0.03]]);
});
const BB_HAND = wrapPart('bbH', BB.green, 0.95);
/** the headband's knot and loose ends */
const BB_KNOT = part('bbK', [-0.8, -0.32, 1.02, 0.72], (g) => bandTails(g, 0.9));
/** the staff: pivot = the near hand's grip, pointing forward (+x) */
const BB_STAFF = part('bbSt', [-1.25, -0.2, 2.75, 0.4], (g) => {
  const pole = RR(-1.05, -0.065, 2.4, 0.13, 0.065);
  chunk(g, [[pole, BB.staff, 0.03]]);
  g.lineWidth = B.lw * 0.9;
  g.strokeStyle = C(BB.staffNode);
  g.beginPath();
  for (const x of [-0.6, -0.1, 0.4, 0.9]) {
    g.moveTo(x, -0.06);
    g.lineTo(x, 0.06);
  }
  g.stroke();
});

/** one face: eyes and mouth as `f` / `m` say, looking forward (dir 1) or turned round (dir -1); s = its size */
function face(g: CanvasRenderingContext2D, f: Face, m: Mouth, dir: number, y: number, s = 1) {
  const f0 = B.face;
  const m0 = B.mouth;
  B.face = f;
  B.mouth = m;
  g.save();
  if (dir < 0) g.scale(-1, 1);
  blush(g, 0.04, y + 0.16 * s, 0.075 * s);
  eyes(g, 0.08 * s, 0.3 * s, y, 0.11 * s, BB.green);
  mouth(g, 0.2 * s, y + 0.2 * s, 0.085 * s);
  g.restore();
  B.face = f0;
  B.mouth = m0;
}

/** what the faces are doing: 'f' = all one face (the fight), else a bicker beat 0..2 */
type Beat = 'f' | 0 | 1 | 2;
/** the beat of the segments being drawn this frame (set before they are placed) */
let BEAT: Beat = 'f';
/** the three segments' faces for a beat: [face, mouth, dir] of the bottom, middle and top */
function facesOf(beat: Beat, seg: number): [Face, Mouth, number] {
  if (beat === 'f') return [B.face, B.mouth, 1];
  if (seg === 2) return beat === 0 ? ['angry', 'flat', 1] : beat === 2 ? ['open', 'smile', 1] : ['angry', 'open', 1];
  if (seg === 1) return beat === 0 ? ['angry', 'open', -1] : beat === 1 ? ['droop', 'flat', 1] : ['open', 'flat', 1];
  return beat === 2 ? ['angry', 'grit', 1] : ['droop', 'wavy', 1];
}

/** a segment: a green tube with its node ring on top and a face; pivot = its bottom middle. Variant: the beat */
function segPart(id: string, seg: number, w: number): Part {
  return part(id, [-w / 2 - 0.25, -SEG_H - 0.55, w + 0.5, SEG_H + 0.73], (g) => {
    const tube = RR(-w / 2, -SEG_H, w, SEG_H + 0.04, 0.13);
    const ring = RR(-w / 2 - 0.05, -SEG_H - 0.06, w + 0.1, 0.13, 0.065);
    const sh: [Path2D, string, number][] = [];
    if (seg === 2) {
      // a sprig of two leaves out of the top
      sh.push([E(-0.14, -SEG_H - 0.2, 0.2, 0.07, 0.6), BB.leaf, 0]);
      sh.push([E(0.1, -SEG_H - 0.24, 0.24, 0.075, -0.7), BB.leaf, 0]);
    }
    sh.push([tube, BB.green, 0.1], [ring, BB.node, 0.03]);
    chunk(g, sh);
    clipIn(g, tube, () => paint(g, RR(-w / 2 + 0.08, -SEG_H + 0.1, 0.07, SEG_H - 0.18, 0.035), BB.light, 0));
    if (seg === 0) trunksIn(g, tube, -w / 2 - 0.1, w / 2 + 0.1, -0.3, 0.1, 0.03);
    if (seg === 2) {
      clipIn(g, tube, () => {
        const band = RR(-w, -SEG_H + 0.05, w * 2, 0.15, 0);
        paint(g, band, accent(), 0);
        inner(g, band, 0.9);
      });
    }
    const [f, m, dir] = facesOf(BEAT, seg);
    const y = seg === 0 ? -0.46 : -0.36;
    g.save();
    g.translate(dir > 0 ? 0.04 : -0.04, 0);
    face(g, f, m, dir, y, seg === 2 ? 1.05 : 0.95);
    g.restore();
  });
}
const BB_BOT = segPart('bbS0', 0, 0.9);
const BB_MID = segPart('bbS1', 1, 0.84);
const BB_TOP = segPart('bbS2', 2, 0.8);

function drawBamboo() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  const bare = !R.weapon;
  const pose = R.pose;
  const calm = R.face === 'open' || R.face === 'blink';
  // the bicker beats: every couple of seconds someone else starts it
  const beat: Beat = calm && !R.grey ? ((Math.floor(t * 0.42 + R.seed * 0.37) % 3) as 0 | 1 | 2) : 'f';
  const key = beat === 'f' ? R.fk : 'b' + beat;
  BEAT = beat;
  // the run-up: an angry face while walking is its charge, staff levelled
  const charge = bare && pose.mood === 'angry' && R.mv > 0.3 && !R.wind && !R.strike ? R.mv : 0;
  // the stack wobbles: each segment lags the one under it
  const sway = Math.sin(R.ph) * 0.05 * R.mv + br * 0.012;
  const jolt = R.hurt;
  const lunge = bare ? 0.12 * R.strike - 0.08 * R.wind : 0;
  const fx = -0.22 + stepX(Math.PI, 0.24);
  const nx = 0.22 + stepX(0, 0.24);
  const fy = stepY(Math.PI, 0.15);
  const ny = stepY(0, 0.15);
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv;
  // with a weapon in its hands, the staff goes on its back
  if (!bare) put(BB_STAFF, '', -0.1, -1.2 + bob, -2.2, 0.85, 1);
  put(BB_FOOT, '', fx, fy);
  if (R.look.sneakers) shoeAt(fx + 0.06, fy, 0.5);
  const x1 = sway * 1.2 + lunge * 0.4 - 0.06 * jolt + 0.05 * charge;
  const x2 = sway * 2.6 + lunge + 0.06 * jolt + 0.12 * charge;
  const y0 = BASE + bob;
  const y1 = y0 - SEG_H - 0.02 * jolt;
  const y2 = y1 - SEG_H - 0.05 * jolt;
  const r1 = sway * 0.8 + lunge * 0.3 - 0.08 * jolt;
  const r2 = sway * 1.4 + lunge * 0.6 + 0.1 * jolt + 0.1 * charge;
  put(BB_KNOT, '', x2 - 0.42, y2 - SEG_H + 0.13, 0.2 + 0.4 * R.mv + Math.sin(t * 6 + R.seed) * 0.12);
  // the staff and the far hand behind the stack, unless it is out in front (strike, charge)
  const sk = R.strike;
  const ft = sk < 0.7 ? 1.15 * smooth(sk / 0.7) : lerp(1.15, 1, (sk - 0.7) / 0.3);
  // idle, the staff stands upright in front of it (both fists on it, clear of the faces); it levels for a poke
  let gx = 0.74;
  let gy = -0.9 + bob;
  let a = -1.42 + br * 0.03;
  let lv = 0;
  if (bare) {
    if (R.cheer) {
      gx = 0.5;
      gy = -1.9 + Math.sin(t * 9) * 0.06;
      a = t * 9;
      lv = 0.5;
    } else {
      lv = smooth(Math.max(R.wind, Math.min(1, sk * 2), charge));
      a = lerp(a, (sk > 0 ? R.aim * 0.35 : 0.06) + 0.05 * R.wind, lv);
      gx += -0.22 * lv - 0.3 * R.wind + 0.75 * ft + 0.1 * charge;
      gy += -0.2 * lv - 0.08 * R.wind + R.aim * 0.25 * ft + 0.08 * charge;
    }
  }
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // the far fist: up the staff while it stands, behind the near one when it is levelled
  const fd = lerp(0.52, -0.5, lv);
  if (!bare && !twoH()) put(BB_HAND, '', 0.66 + 0.03 * br, -1.36 + bob, -0.4);
  put(BB_BOT, key, 0, y0, sway * 0.4);
  put(BB_FOOT, '', nx, ny);
  if (R.look.sneakers) shoeAt(nx + 0.06, ny, 0.54);
  put(BB_MID, key, x1, y1, r1);
  put(BB_TOP, key, x2, y2, r2);
  const tx = x2 + Math.sin(r2) * SEG_H;
  const ty = y2 - Math.cos(r2) * SEG_H;
  helmetAt(tx + 0.02, ty + 0.12, 1.45, r2 - 0.06);
  crownAt(tx + 0.04, ty - (R.look.helmet ? 0.36 : 0.28), r2 - 0.12);
  chiliAt(tx + 0.12, ty - 0.7, 0.9);
  if (bare) {
    // both fists on the staff: the far one a little back along it
    H2.on = false;
    put(BB_HAND, '', gx + fd * ca, gy + fd * sa, a * 0.3);
    put(BB_STAFF, '', gx, gy, a);
    H.x = gx;
    H.y = gy;
    H.a = 0;
    H.s = 1;
    put(BB_HAND, '', gx, gy, a * 0.3);
    return;
  }
  aimHand(0.56, -1.0 + bob, 0.6);
  armsAndWeapon(BB_HAND, -0.6);
}

export const rhino = ch(2.5, 0.95, 1.15, [BB.green, BB.light, BB.node], drawBamboo, { lean: 0.06, wl: 1.1 });
