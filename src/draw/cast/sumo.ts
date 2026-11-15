import { clamp } from '../../util';
import { B, C, E, MODE, PATH, R, RR, type Sh, TAU, WHITE, accent, aimHand, armsAndWeapon, ch, chiliAt, chunk, clipIn, crownAt, eye, glovePart, helmetAt, inner, mix, paint, part, put, rope, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 10 sumo = Pumpkin: a carved jack-o'-lantern with a candle glowing
// in its grin (the carved eyes glow too, with live pupils in them) and a tiny top hat with a corner-colour band.
// Its belly slide is a BOWLING ROLL: limbs tucked in, it rolls over and over on its walk, the hat bobbing above

const PK = { skin: '#ee9a45', light: '#f6c27a', rib: '#c9762f', stem: '#7a8a4a', vine: '#6f9a4a', foot: '#5f8a43', hat: '#3d3747', hatLight: '#5b5466', wall: '#c4621f', glow: '#ffcf5a', core: '#fff3b4', wax: '#f6f0e2' };
/** the pumpkin's middle above the feet, and its radius */
const CY = -1.0;
const RAD = 0.86;

const PK_FOOT = part('pkF', [-0.42, -0.42, 0.9, 0.54], (g) => chunk(g, [[E(0.07, -0.1, 0.25, 0.12), PK.foot, 0.04]]));
const PK_GLOVE = glovePart('pkG', PK.vine, 1.05);
/** the tiny top hat with its band in the corner colour; pivot = the middle of its brim */
const PK_HAT = part('pkH', [-0.45, -0.75, 0.9, 0.9], (g) => {
  const crown = PATH((p) => {
    p.moveTo(-0.19, -0.02);
    p.lineTo(-0.22, -0.5);
    p.quadraticCurveTo(0, -0.55, 0.22, -0.5);
    p.lineTo(0.19, -0.02);
    p.closePath();
  });
  const brim = RR(-0.33, -0.07, 0.66, 0.12, 0.06);
  chunk(g, [[crown, PK.hat, 0.06], [brim, PK.hat, 0.02]]);
  clipIn(g, crown, () => {
    const band = RR(-0.3, -0.2, 0.6, 0.13, 0);
    paint(g, band, accent(), 0);
    inner(g, band, 0.8);
    paint(g, RR(-0.16, -0.48, 0.06, 0.26, 0.03), PK.hatLight, 0);
  });
});
/** a soft warm light, for the candle shining out through the face */
const PK_HALO = part('pkGl', [-0.8, -0.8, 1.6, 1.6], (g) => {
  if (MODE === 's') return;
  const gr = g.createRadialGradient(0, 0, 0.05, 0, 0, 0.78);
  gr.addColorStop(0, 'rgba(255, 214, 110, 0.75)');
  gr.addColorStop(0.5, 'rgba(255, 190, 80, 0.28)');
  gr.addColorStop(1, 'rgba(255, 170, 60, 0)');
  g.fillStyle = gr;
  g.fillRect(-0.8, -0.8, 1.6, 1.6);
});

/** a carved hole, lit by the candle: the cut wall at its top, the glow, a hotter core; flicker 0..1 */
function carve(g: CanvasRenderingContext2D, hole: Path2D, cx: number, cy: number, s: number, fl: number) {
  clipIn(g, hole, () => {
    paint(g, hole, PK.wall, 0);
    g.translate(0.015, 0.05 * s);
    paint(g, hole, fl ? mix(PK.glow, PK.core, 0.25) : PK.glow, 0);
    g.translate(-0.015, -0.05 * s);
    paint(g, E(cx, cy + 0.04 * s, 0.24 * s, 0.14 * s), PK.core, 0);
  });
  inner(g, hole, 0.9);
}

/** the grin for B.mouth, around (x, y) */
function grin(m: string, x: number, y: number): Path2D {
  return PATH((p) => {
    switch (m) {
      case 'open': {
        // a shout: a big round hole with a tooth hanging down
        p.moveTo(x - 0.24, y - 0.12);
        p.lineTo(x - 0.06, y - 0.12);
        p.lineTo(x - 0.03, y - 0.03);
        p.lineTo(x + 0.06, y - 0.03);
        p.lineTo(x + 0.08, y - 0.13);
        p.lineTo(x + 0.26, y - 0.12);
        p.quadraticCurveTo(x + 0.3, y + 0.3, x, y + 0.3);
        p.quadraticCurveTo(x - 0.3, y + 0.3, x - 0.24, y - 0.12);
        break;
      }
      case 'o':
        p.ellipse(x, y + 0.05, 0.1, 0.13, 0, 0, TAU);
        break;
      case 'flat':
        p.moveTo(x - 0.26, y);
        p.lineTo(x + 0.28, y - 0.03);
        p.lineTo(x + 0.26, y + 0.07);
        p.lineTo(x - 0.24, y + 0.09);
        break;
      case 'wavy':
      case 'tongue': {
        const d = m === 'tongue' ? 0.05 : 0;
        p.moveTo(x - 0.3, y + d);
        for (let i = 1; i <= 6; i++) p.lineTo(x - 0.3 + i * 0.1, y + d + (i % 2 ? -0.06 : 0.02) + (m === 'tongue' ? Math.abs(i - 3) * 0.02 : 0));
        p.lineTo(x + 0.3, y + d + 0.12);
        for (let i = 5; i >= 0; i--) p.lineTo(x - 0.3 + i * 0.1, y + d + 0.1 + (i % 2 ? -0.04 : 0.03));
        break;
      }
      case 'grit':
        // clenched: a long slot with a zigzag of teeth across it
        p.moveTo(x - 0.32, y - 0.08);
        p.lineTo(x + 0.34, y - 0.12);
        p.lineTo(x + 0.3, y + 0.14);
        p.lineTo(x - 0.3, y + 0.14);
        break;
      default: {
        // smile and grin: the jack-o'-lantern's crescent with a square tooth up and one down
        const w = m === 'grin' ? 1.12 : 1;
        p.moveTo(x - 0.36 * w, y - 0.14);
        p.quadraticCurveTo(x - 0.14, y - 0.02, x - 0.09, y - 0.04);
        p.lineTo(x - 0.08, y + 0.05);
        p.lineTo(x + 0.04, y + 0.05);
        p.lineTo(x + 0.04, y - 0.05);
        p.quadraticCurveTo(x + 0.2, y - 0.07, x + 0.38 * w, y - 0.2);
        p.quadraticCurveTo(x + 0.32 * w, y + 0.3, x + 0.12, y + 0.3);
        p.lineTo(x + 0.12, y + 0.18);
        p.lineTo(x + 0.0, y + 0.18);
        p.lineTo(x + 0.0, y + 0.31);
        p.quadraticCurveTo(x - 0.34 * w, y + 0.28, x - 0.36 * w, y - 0.14);
      }
    }
    p.closePath();
  });
}

/** the pumpkin with its stem and carved face; pivot = its middle. Variant: the face, and the candle's flicker */
const PK_BODY = part('pkB', [-1.12, -1.18, 2.24, 2.22], (g) => {
  const fl = R.t % 0.24 < 0.12 ? 1 : 0;
  const stem = PATH((p) => {
    p.moveTo(-0.14, -0.74);
    p.quadraticCurveTo(-0.16, -0.92, -0.3, -1.04);
    p.lineTo(-0.16, -1.1);
    p.quadraticCurveTo(-0.02, -0.96, 0.04, -0.74);
    p.closePath();
  });
  rope(g, PATH((p) => { p.moveTo(-0.1, -0.86); p.bezierCurveTo(0.12, -0.98, 0.16, -0.8, 0.06, -0.8); }), 0.04, PK.vine);
  const lobes: Sh[] = [
    [stem, PK.stem, 0.03],
    [E(-0.5, 0.02, 0.38, 0.74), PK.skin, 0.08],
    [E(0.5, 0.02, 0.38, 0.74), PK.skin, 0.08],
    [E(-0.24, 0, 0.46, 0.84), PK.skin, 0.1],
    [E(0.26, 0, 0.46, 0.84), PK.skin, 0.1],
    [E(0.02, -0.01, 0.4, RAD), PK.skin, 0.12],
  ];
  chunk(g, lobes);
  // the grooves between the lobes
  g.lineWidth = B.lw * 0.9;
  g.strokeStyle = C(PK.rib);
  g.beginPath();
  for (const x of [-0.36, 0.38]) {
    g.moveTo(x * 0.6, -0.8);
    g.quadraticCurveTo(x * 1.2, 0, x * 0.6, 0.8);
  }
  g.stroke();
  // a little light on the top left
  paint(g, E(-0.3, -0.56, 0.12, 0.06, -0.5), PK.light, 0);
  // the eyes: carved triangles, lit from inside, with live pupils in them
  const sock = (x: number, y: number, w: number, h: number) =>
    PATH((p) => {
      p.moveTo(x - w, y + h * 0.4);
      p.lineTo(x + w, y + h * 0.4);
      p.lineTo(x + w * 0.12, y - h * 0.6);
      p.closePath();
    });
  const s1 = sock(0.24, -0.24, 0.19, 0.34);
  const s2 = sock(0.6, -0.25, 0.14, 0.3);
  carve(g, s1, 0.24, -0.2, 0.8, fl);
  carve(g, s2, 0.6, -0.21, 0.6, fl);
  const f = B.face;
  if (f !== 'stone') {
    clipIn(g, s1, () => eye(g, 0.24, -0.17, 0.1, fl ? PK.core : PK.glow, 0));
    clipIn(g, s2, () => eye(g, 0.6, -0.18, 0.085, fl ? PK.core : PK.glow, 1));
  }
  // the grin, and the candle in it
  const gx = 0.38;
  const gy = 0.26;
  const mo = grin(B.mouth, gx, gy);
  carve(g, mo, gx, gy + 0.08, 1.2, fl);
  if (B.mouth === 'open' || B.mouth === 'smile' || B.mouth === 'grin') {
    clipIn(g, mo, () => {
      paint(g, RR(gx + 0.02, gy + 0.13, 0.09, 0.3, 0.03), PK.wax, 0);
      paint(g, E(gx + 0.065, gy + 0.08, 0.035, 0.06), WHITE, 0);
    });
  }
});

function drawPumpkin() {
  const t = R.t;
  const ctx = R.ctx;
  const pose = R.pose;
  const br = Math.sin(t * 2.6 + R.seed);
  // the bowling roll: the battle gives the slide as a tilt (spin) with an angry face; it is drawn here instead
  const rl = pose.mood === 'angry' && Math.abs(pose.spin) > 0.02 ? clamp(Math.abs(pose.spin) / 1.15, 0, 1) : 0;
  if (rl > 0) {
    const a = pose.spin * pose.face;
    ctx.translate(0, CY);
    ctx.rotate(-a);
    ctx.translate(0, -CY);
  }
  // tucked in for the roll: no feet, no gloves
  const limbs = rl < 0.35;
  const tuck = 1 - rl;
  const bob = -Math.abs(Math.sin(R.ph)) * 0.06 * R.mv * tuck;
  const wob = (Math.sin(R.ph) * 0.06 * R.mv + br * 0.012) * tuck;
  const bare = !R.weapon;
  const lunge = bare ? 0.08 * R.strike - 0.06 * R.wind : 0;
  const roll = rl > 0 ? pose.walk / (R.r * RAD) : 0;
  const lift = -0.12 * rl;
  const fx = -0.36 + stepX(Math.PI, 0.18);
  const nx = 0.36 + stepX(0, 0.18);
  if (limbs) {
    put(PK_FOOT, '', fx, stepY(Math.PI, 0.16));
    if (R.look.sneakers) shoeAt(fx + 0.05, stepY(Math.PI, 0.16), 0.58);
    if (!twoH()) put(PK_GLOVE, '', 0.98 + 0.03 * br, -1.12 + bob, -0.45);
  }
  const cx = lunge * 0.6;
  const cy = CY + bob + lift;
  const sq = bare ? R.strike : 0;
  put(PK_BODY, R.fk + (t % 0.24 < 0.12 ? 1 : 0), cx, cy, wob + roll, 1 + 0.04 * sq, 1 - 0.03 * sq);
  // the candle's warm light through the face
  if (!R.grey) {
    const op = ctx.globalCompositeOperation;
    const a0 = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a0 * (0.3 + 0.08 * Math.sin(t * 17 + R.seed) + 0.05 * Math.sin(t * 7.3)) * (1 - R.stoneA);
    const c = Math.cos(wob + roll);
    const s = Math.sin(wob + roll);
    put(PK_HALO, '', cx + 0.38 * c - 0.05 * s, cy + 0.38 * s + 0.05 * c, 0, 0.75, 0.72);
    ctx.globalAlpha = a0;
    ctx.globalCompositeOperation = op;
  }
  if (limbs) {
    put(PK_FOOT, '', nx, stepY(0, 0.16));
    if (R.look.sneakers) shoeAt(nx + 0.05, stepY(0, 0.16), 0.62);
  }
  // the hat: perched cockily on top; in the roll it bobs along above the pumpkin
  const hx = cx + 0.16 + wob * 1.6;
  const hy = cy - RAD + 0.06 - 0.22 * rl + Math.sin(t * 9) * 0.05 * rl;
  if (!R.look.helmet) put(PK_HAT, '', hx, hy, 0.24 + wob - 0.5 * rl + Math.sin(t * 6) * 0.15 * rl);
  helmetAt(cx + 0.06 + wob, cy - RAD + 0.22, 1.85, -0.06 + wob);
  crownAt(hx - 0.04, hy - (R.look.helmet ? 0.4 : 0.66), -0.12 + wob);
  chiliAt(cx + 0.15, cy - RAD - 0.7, 1.0);
  if (limbs) {
    aimHand(0.92 + lunge, -0.92 + bob, 0.6);
    armsAndWeapon(PK_GLOVE, R.weapon ? -0.6 : -0.15 + 0.2 * R.strike);
  }
  if (rl > 0) {
    const a = pose.spin * pose.face;
    ctx.translate(0, CY);
    ctx.rotate(a);
    ctx.translate(0, -CY);
  }
}

export const sumo = ch(2.3, 1.12, -CY, [PK.skin, PK.light, PK.rib], drawPumpkin, { lean: 0.05, wl: 1.1 });
