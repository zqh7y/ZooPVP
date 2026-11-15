import { B, E, MOUTH, PATH, R, RR, type Sh, accent, aimHand, armsAndWeapon, bandTails, blush, ch, chiliAt, chunk, clipIn, crownAt, eyes, glovePart, helmetAt, inner, paint, part, put, rope, shoeAt, stepX, stepY, twoH } from './kit';
// ---------------------------------------------------------------- 1 sprout = Chick: a tiny chick still half inside its cracked
// eggshell (the shell is its shorts), a headband and HUGE boxing gloves

const CK = { down: '#f6cd4c', light: '#fbe6a0', shade: '#d8a73a', beak: '#f0973a', shell: '#f7f1e3', foot: '#ee913c' };
/** the middle of its round body above the feet */
const CY = -0.9;

const CK_FOOT = part('ckF', [-0.32, -0.5, 0.72, 0.62], (g) => {
  rope(g, PATH((p) => { p.moveTo(-0.01, -0.36); p.lineTo(0.02, -0.08); }), 0.09, CK.foot);
  chunk(g, [[E(0.09, -0.07, 0.16, 0.08), CK.foot, 0]]);
});
/** the knot of the headband and its two loose ends */
const CK_KNOT = part('ckK', [-0.72, -0.3, 0.92, 0.68], (g) => bandTails(g, 0.8));
const CK_GLOVE = glovePart('ckG', CK.down, 1.32);

const CK_BODY = part('ckB', [-0.95, -1.98, 1.98, 1.9], (g) => {
  const cy = CY;
  const body = E(0, cy, 0.62, 0.6);
  // a cocky crest: three feathers swept back
  const sh: Sh[] = [
    [E(-0.27, cy - 0.6, 0.075, 0.19, -0.85), CK.down, 0],
    [E(-0.1, cy - 0.69, 0.09, 0.22, -0.4), CK.down, 0],
    [E(0.07, cy - 0.68, 0.075, 0.18, -0.05), CK.down, 0],
    [body, CK.down, 0.12],
  ];
  chunk(g, sh);
  // the headband, round the top of its head
  clipIn(g, body, () => {
    const band = RR(-0.7, cy - 0.56, 1.4, 0.14, 0);
    paint(g, band, accent(), 0);
    inner(g, band, 0.9);
  });
  eyes(g, 0.15, 0.41, cy - 0.21, 0.15, CK.down);
  blush(g, 0.08, cy - 0.02, 0.08);
  // the cracked eggshell it still wears as shorts: a zigzag rim
  const shell = PATH((p) => {
    p.moveTo(-0.7, cy + 0.12);
    for (let i = 1; i <= 7; i++) p.lineTo(-0.7 + (1.4 * i) / 7, cy + (i % 2 ? -0.04 : 0.13));
    p.ellipse(0, cy + 0.12, 0.7, 0.6, 0, 0, Math.PI);
    p.closePath();
  });
  chunk(g, [[shell, CK.shell, 0.1]]);
  inner(g, PATH((p) => {
    p.moveTo(-0.38, cy + 0.26);
    p.lineTo(-0.3, cy + 0.38);
    p.lineTo(-0.38, cy + 0.48);
    p.moveTo(0.36, cy + 0.3);
    p.lineTo(0.44, cy + 0.42);
  }), 0.75);
  // the beak: shut in a smirk, or wide open (a shout, a cheer, an ouch)
  const bx = 0.5;
  const by = cy - 0.06;
  const m = B.mouth;
  if (m === 'open' || m === 'grin' || m === 'o' || m === 'wavy') {
    const up = PATH((p) => { p.moveTo(bx, by - 0.14); p.lineTo(bx + 0.38, by - 0.08); p.lineTo(bx, by + 0.0); p.closePath(); });
    const lo = PATH((p) => { p.moveTo(bx, by + 0.04); p.lineTo(bx + 0.28, by + 0.18); p.lineTo(bx, by + 0.17); p.closePath(); });
    const gap = PATH((p) => { p.moveTo(bx - 0.02, by - 0.06); p.lineTo(bx + 0.3, by + 0.02); p.lineTo(bx - 0.02, by + 0.13); p.closePath(); });
    chunk(g, [[gap, MOUTH, 0], [up, CK.beak, 0.03], [lo, CK.beak, 0.02]]);
  } else {
    const bk = PATH((p) => {
      p.moveTo(bx - 0.02, by - 0.14);
      p.quadraticCurveTo(bx + 0.26, by - 0.1, bx + 0.4, by + 0.0);
      p.quadraticCurveTo(bx + 0.22, by + 0.13, bx - 0.02, by + 0.14);
      p.closePath();
    });
    chunk(g, [[bk, CK.beak, 0.04]]);
    // the line of the beak curls up at the corner: a smirk
    inner(g, PATH((p) => { p.moveTo(bx + 0.34, by + 0.0); p.quadraticCurveTo(bx + 0.14, by + 0.03, bx + 0.0, by - 0.04); }), 0.75);
  }
});

function drawChick() {
  const t = R.t;
  const br = Math.sin(t * 2.6 + R.seed);
  // it scurries: quick little steps, the body bouncing on each
  const bob = -Math.abs(Math.sin(R.ph)) * 0.09 * R.mv;
  const bare = !R.weapon;
  const lean = (bare ? 0.14 * R.strike - 0.1 * R.wind : 0) + Math.sin(R.ph) * 0.05 * R.mv + br * 0.015;
  const fx = -0.2 + stepX(Math.PI, 0.26);
  const nx = 0.2 + stepX(0, 0.26);
  const fy = stepY(Math.PI, 0.16);
  const ny = stepY(0, 0.16);
  put(CK_FOOT, '', fx, fy);
  if (R.look.sneakers) shoeAt(fx + 0.06, fy, 0.44);
  put(CK_KNOT, '', -0.5 + lean * 1.4, CY - 0.5 + bob, 0.15 + 0.35 * R.mv + Math.sin(t * 6 + R.seed) * 0.12);
  // the far glove up by the beak, the guard
  if (!twoH()) put(CK_GLOVE, '', 0.84 + 0.03 * br, CY + 0.06 + bob, -0.5);
  put(CK_BODY, R.fk, 0, bob, lean);
  put(CK_FOOT, '', nx, ny);
  if (R.look.sneakers) shoeAt(nx + 0.06, ny, 0.48);
  const hx = 0.02 + lean * 1.5;
  const hy = CY - 0.52 + bob;
  helmetAt(hx + 0.04, hy, 1.5, -0.1 + lean);
  crownAt(hx + 0.02, hy - (R.look.helmet ? 0.42 : 0.2), -0.12 + lean);
  chiliAt(hx + 0.1, hy - 0.62, 0.8);
  aimHand(0.44, CY + 0.38 + bob, 0.72);
  armsAndWeapon(CK_GLOVE, R.weapon ? -0.6 : -0.15 + 0.2 * R.strike);
}

export const chick = ch(1.85, 0.78, 0.9, [CK.down, CK.light, CK.shade], drawChick, { lean: 0.1, wl: 0.85 });
