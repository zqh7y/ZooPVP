import { music, petVoice, sfx, type SoundName } from '../src/audio/engine';
import type { MusicState } from '../src/audio/names';
import { SOUNDS } from '../src/audio/sounds';
import { frand } from '../src/rng';
import type { PetType } from '../src/types';

/* The page to listen on: a button per sound (a button per level where it has levels) and per music state. */

const CAST: PetType[] = ['sprout', 'buzzy', 'ninja', 'snailor', 'roo', 'cacto', 'pogo', 'briar', 'angler', 'sumo', 'rhino', 'boulder'];
/** The v5 display names (the ids stay). */
const NAME: Record<PetType, string> = {
  sprout: 'Chick',
  buzzy: 'Scorp',
  ninja: 'Shroom',
  snailor: 'Tulip',
  roo: 'Roo',
  cacto: 'Cacto',
  pogo: 'Dandy',
  briar: 'Spike',
  angler: 'Snapper',
  sumo: 'Pumpkin',
  rhino: 'Bamboo',
  boulder: 'Oak',
};

// v5 first, then v4, then the v3 sounds (some of them legacy now)
const GROUPS: [string, SoundName[]][] = [
  ['v5: the bell and the call', ['bellStart', 'ready', 'fight', 'bellEnd']],
  ['v5: hits, knock-outs, combo calls', ['punch', 'crit', 'pow', 'bonk', 'wham', 'smash', 'ko', 'doubleKo', 'tripleKo', 'rampage', 'slowmo', 'coins', 'globSplat']],
  ['v5: the crowd', ['roar', 'ooh', 'cheer']],
  ['v5: matchmaking and the result', ['search', 'found', 'champion', 'victory', 'defeat', 'mvp', 'cashCount', 'xpCount', 'levelUp']],
  ['Traits (the v5 cast)', ['poison', 'globSplat', 'dodge', 'shellClose', 'shellOpen', 'thorns', 'hookPull', 'bellySlide', 'chargeImpact', 'leapLaunch', 'leapLand', 'doubleJab', 'armourClank', 'bossStomp']],
  ['Roll and evolve', ['spinTick', 'spinLand', 'unitReveal', 'itemReveal', 'evolve']],
  ['Interface', ['click', 'pick', 'drop', 'denied', 'link', 'unlink', 'merge', 'stack', 'whoosh', 'hint', 'count', 'collect', 'cashKill', 'gems', 'cellUnlock', 'sell']],
  ['Fight (v3 / v4)', ['deploy', 'bite', 'knife', 'knifeHit', 'bat', 'batHit', 'spear', 'spearHit', 'shieldBash', 'block', 'hop', 'stun', 'combo', 'lastKill']],
  ['Fight: deaths', ['pop', 'squish', 'launch', 'slice', 'spin', 'deflate', 'shatter', 'petals']],
  ['v4 stage flow (legacy)', ['waveStart', 'waveClear', 'stageClear', 'star', 'bossArrives', 'waveLost', 'cashWave']],
  ['v3 (legacy)', ['rollStart', 'tick', 'tock', 'reveal', 'crack', 'breakthrough', 'vsSlam', 'countdown', 'meter', 'rollEarned', 'enrage', 'trophyUp', 'trophyDown', 'leagueUp']],
];
const STATES: MusicState[] = ['lobby', 'search', 'fight', 'champion', 'victory', 'defeat', 'off'];
const LEGACY: MusicState[] = ['prep', 'wave', 'boss', 'stageClear', 'battle', 'overtime'];

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function button(text: string, cls: string, on: () => void) {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = cls;
  b.addEventListener('click', () => {
    try {
      sfx.unlock();
      on();
    } catch (e) {
      console.error(e);
    }
  });
  return b;
}

function heading(text: string) {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}

function row(label: string | null, ...items: HTMLElement[]) {
  const r = document.createElement('div');
  r.className = 'row';
  if (label) {
    const l = document.createElement('span');
    l.className = 'name';
    l.textContent = label;
    r.append(l);
  }
  r.append(...items);
  return r;
}

let enemy = false;
const at = () => ({ x: frand(60, 480), enemy });

const root = el('sfx');

// ---- the cast
root.append(heading('The cast: attack, hurt, death (and hello)'));
const side = button('team: yours (blue)', '', () => {
  enemy = !enemy;
  side.textContent = enemy ? 'team: enemy (red, deeper)' : 'team: yours (blue)';
  side.classList.toggle('on', enemy);
});
root.append(row(null, side));
for (const pet of CAST) {
  root.append(
    row(
      `${NAME[pet]} (${pet})`,
      button('attack', 'lv', () => sfx.play(petVoice(pet, 'attack'), 0, at())),
      button('hurt', 'lv', () => sfx.play(petVoice(pet, 'hurt'), 0, at())),
      button('death', 'lv', () => sfx.play(petVoice(pet, 'death'), 0, at())),
      button('reveal (hello)', 'lv', () => sfx.play('unitReveal', CAST.indexOf(pet) + 1)),
      button('x20 brawl', 'lv', () => {
        // twenty calls in a second: the gaps and caps must keep it clean
        for (let i = 0; i < 20; i++) setTimeout(() => sfx.play(petVoice(pet, i % 5 === 4 ? 'hurt' : 'attack'), 0, at()), i * 50);
      }),
    ),
  );
}

// ---- demos: whole moments, the way the game plays them
root.append(heading('Moments'));
function spin(prize: () => void) {
  // a spin that slows down: the ticks climb as it slows, then it lands and pops
  const times: number[] = [];
  for (let t = 0, gap = 0.035; t < 2.6; t += gap, gap *= 1.09) times.push(t);
  times.forEach((t, i) => setTimeout(() => sfx.play('spinTick', i / (times.length - 1)), t * 1000));
  const end = times[times.length - 1] + 0.25;
  setTimeout(() => sfx.play('spinLand'), end * 1000);
  setTimeout(prize, (end + 0.12) * 1000);
}
root.append(
  row(
    null,
    button('spin: unit (random rung)', '', () => spin(() => sfx.play('unitReveal', Math.floor(frand(1, 13))))),
    button('spin: item (random class)', '', () => spin(() => sfx.play('itemReveal', Math.floor(frand(1, 8))))),
    button('matchmaking: search, found', '', () => matchmaking(false)),
    button('matchmaking: champion', '', () => matchmaking(true)),
    button('a fight: bell, READY, FIGHT, brawl, KOs, win', '', () => fightNight(true)),
    button('a fight that is lost', '', () => fightNight(false)),
    button('result: count-ups, level up', '', () => result()),
  ),
);

/** The searching moment (the music loop and a tick a second), then FOUND or CHAMPION MATCH. */
function matchmaking(champion: boolean) {
  music.set('search');
  for (let i = 0; i < 3; i++) setTimeout(() => sfx.play('search'), 300 + i * 1000);
  setTimeout(() => {
    sfx.play(champion ? 'champion' : 'found');
    music.set(champion ? 'champion' : 'lobby');
  }, 3300);
}

/** A whole fight the way the game would play it. */
function fightNight(win: boolean) {
  const T = (s: number, f: () => void) => setTimeout(f, s * 1000);
  music.set('off');
  T(0, () => sfx.play('bellStart'));
  T(0.9, () => sfx.play('ready'));
  T(2.1, () => {
    sfx.play('fight');
    music.set('fight');
    music.energy(0.4);
  });
  // the brawl: punches, voices, a crit now and then with a comic word, knock-outs with coins
  let kos = 0;
  for (let i = 0; i < 70; i++) {
    T(2.6 + i * 0.08, () => {
      const pet = CAST[Math.floor(frand(0, CAST.length))];
      const enemy = frand(0, 1) < 0.5;
      const x = frand(60, 480);
      const r = frand(0, 1);
      if (r < 0.45) {
        sfx.play(petVoice(pet, 'attack'), 0, { x, enemy });
        sfx.play('punch', 0, { x, enemy, delay: 0.04 });
      } else if (r < 0.75) sfx.play(petVoice(pet, 'hurt'), 0, { x, enemy });
      else if (r < 0.82) {
        sfx.play('crit', 0, { x });
        sfx.play(['pow', 'bonk', 'wham', 'smash'][Math.floor(frand(0, 4))] as SoundName, 0, { x, delay: 0.03 });
        sfx.play('ooh', 0, { delay: 0.1 });
      } else if (r < 0.88) {
        sfx.play('ko', 0, { x, enemy });
        sfx.play(petVoice(pet, 'death'), 0, { x, enemy, delay: 0.05 });
        sfx.play('coins', 0, { delay: 0.3 });
        kos++;
        if (kos === 2) sfx.play('doubleKo', 0, { delay: 0.2 });
        if (kos === 3) sfx.play('tripleKo', 0, { delay: 0.2 });
        if (kos === 5) {
          sfx.play('rampage', 0, { delay: 0.2 });
          sfx.play('roar', 3, { delay: 0.3 });
        }
      }
      music.energy(Math.min(1, 0.4 + i / 70));
    });
  }
  const end = 2.6 + 70 * 0.08 + 0.3;
  T(end, () => {
    sfx.play('ko', 0, { x: 270 });
    sfx.play('slowmo');
    sfx.play('lastKill');
  });
  T(end + 1.6, () => {
    sfx.play('bellEnd');
    sfx.play(win ? 'victory' : 'defeat', 0, { delay: 0.4 });
    if (win) sfx.play('roar', 2, { delay: 0.5 });
    music.set(win ? 'victory' : 'defeat');
  });
}

/** The result panel: cash counting up, the XP bar filling, LEVEL UP, the MVP. */
function result() {
  const T = (s: number, f: () => void) => setTimeout(f, s * 1000);
  for (let i = 0; i <= 24; i++) T(i * 0.045, () => sfx.play('cashCount', i / 24));
  for (let i = 0; i <= 30; i++) T(1.4 + i * 0.04, () => sfx.play('xpCount', i / 30));
  T(2.7, () => sfx.play('levelUp'));
  T(4.6, () => sfx.play('mvp'));
}

// ---- every sound, every level
/** Sounds whose n is a progress 0..1 (they climb a scale). */
const PROGRESS: SoundName[] = ['spinTick', 'cashCount', 'xpCount'];
for (const [title, names] of GROUPS) {
  root.append(heading(title));
  // plain sounds share one wrapping row; sounds with levels (and the spin tick's progress) get a row each
  root.append(row(null, ...names.filter((n) => !SOUNDS[n]?.levels && !PROGRESS.includes(n)).map((n) => button(n, '', () => sfx.play(n, 0, { x: 270 })))));
  for (const name of names) {
    const levels = SOUNDS[name]?.levels;
    if (PROGRESS.includes(name)) root.append(row(`${name} (progress)`, ...[0, 0.25, 0.5, 0.75, 1].map((p) => button(String(p), 'lv', () => sfx.play(name, p)))));
    else if (levels) root.append(row(name, ...levels.map((l) => button(String(l), 'lv', () => sfx.play(name, l)))));
  }
}

// ---- music
const musicBox = el('music');
const stateButtons = new Map<MusicState, HTMLButtonElement>();
const legacyBox = el('legacy');
for (const st of [...STATES, ...LEGACY]) {
  const b = button(st, '', () => {
    music.set(st);
    for (const [k, x] of stateButtons) x.classList.toggle('on', k === st);
  });
  stateButtons.set(st, b);
  (LEGACY.includes(st) ? legacyBox : musicBox).append(b);
}

const slider = el<HTMLInputElement>('energy');
slider.addEventListener('input', () => {
  music.energy(Number(slider.value));
  el('energyv').textContent = Number(slider.value).toFixed(2);
});
music.energy(Number(slider.value));
el<HTMLInputElement>('muffle').addEventListener('change', (e) => {
  sfx.unlock();
  music.muffle((e.target as HTMLInputElement).checked);
});

setInterval(() => {
  const p = sfx.progress;
  el('status').textContent = p.done < p.total ? `Rendering sounds ${p.done}/${p.total}...` : `All ${p.total} sounds ready.`;
}, 300);
