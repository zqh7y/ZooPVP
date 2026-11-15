import { music, petVoice, sfx, type SoundName } from '../src/audio/engine';
import type { MusicState } from '../src/audio/names';
import { SOUNDS } from '../src/audio/sounds';
import { frand } from '../src/rng';
import type { PetType } from '../src/types';

/* The page to listen on: a button per sound (a button per level where it has levels) and per music state. */

const CAST: PetType[] = ['sprout', 'buzzy', 'ninja', 'snailor', 'roo', 'cacto', 'pogo', 'briar', 'angler', 'sumo', 'rhino', 'boulder'];

// v4 first, then the v3 sounds (some of them legacy now)
const GROUPS: [string, SoundName[]][] = [
  ['Traits', ['poison', 'dodge', 'shellClose', 'shellOpen', 'thorns', 'hookPull', 'bellySlide', 'chargeImpact', 'leapLaunch', 'leapLand', 'doubleJab', 'armourClank', 'bossStomp']],
  ['Stage flow', ['waveStart', 'waveClear', 'stageClear', 'star', 'gems', 'bossArrives', 'waveLost', 'cashKill', 'cashWave', 'cellUnlock', 'sell']],
  ['Roll and evolve', ['spinTick', 'spinLand', 'unitReveal', 'itemReveal', 'evolve']],
  ['Interface', ['click', 'pick', 'drop', 'denied', 'link', 'unlink', 'merge', 'stack', 'whoosh', 'hint', 'count', 'collect']],
  ['Fight', ['deploy', 'bite', 'knife', 'knifeHit', 'bat', 'batHit', 'spear', 'spearHit', 'shieldBash', 'block', 'hop', 'stun', 'combo', 'lastKill', 'cheer']],
  ['Fight: deaths', ['pop', 'squish', 'launch', 'slice', 'spin', 'deflate', 'shatter', 'petals']],
  ['v3 (legacy)', ['rollStart', 'tick', 'tock', 'reveal', 'crack', 'breakthrough', 'search', 'found', 'vsSlam', 'countdown', 'fight', 'meter', 'rollEarned', 'enrage', 'victory', 'defeat', 'trophyUp', 'trophyDown', 'leagueUp']],
];
const STATES: MusicState[] = ['prep', 'wave', 'boss', 'stageClear', 'defeat', 'off'];
const LEGACY: MusicState[] = ['lobby', 'search', 'battle', 'overtime', 'victory'];

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
root.append(heading('The cast: attack, hurt, death'));
const side = button('team: yours (blue)', '', () => {
  enemy = !enemy;
  side.textContent = enemy ? 'team: enemy (red, deeper)' : 'team: yours (blue)';
  side.classList.toggle('on', enemy);
});
root.append(row(null, side));
for (const pet of CAST) {
  root.append(
    row(
      pet,
      button('attack', 'lv', () => sfx.play(petVoice(pet, 'attack'), 0, at())),
      button('hurt', 'lv', () => sfx.play(petVoice(pet, 'hurt'), 0, at())),
      button('death', 'lv', () => sfx.play(petVoice(pet, 'death'), 0, at())),
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
    button('a wave: start, brawl, clear', '', () => {
      sfx.play('waveStart');
      music.set('wave');
      for (let i = 0; i < 60; i++) {
        const pet = CAST[Math.floor(frand(0, 6))];
        const kind = frand(0, 1) < 0.7 ? 'attack' : frand(0, 1) < 0.7 ? 'hurt' : 'death';
        setTimeout(() => {
          sfx.play(petVoice(pet, kind), 0, { x: frand(60, 480), enemy: frand(0, 1) < 0.5 });
          if (kind === 'death') sfx.play('cashKill', 0, { delay: 0.2 });
        }, 800 + i * 70);
      }
      setTimeout(() => {
        sfx.play('waveClear');
        sfx.play('cashWave', 0, { delay: 0.9 });
        music.set('prep');
      }, 800 + 60 * 70 + 400);
    }),
    button('stage clear: fanfare, 3 stars, gems', '', () => {
      sfx.play('stageClear');
      music.set('stageClear');
      for (const k of [1, 2, 3]) setTimeout(() => sfx.play('star', k), (2.4 + k * 0.5) * 1000);
      setTimeout(() => sfx.play('gems'), 4.6 * 1000);
    }),
  ),
);

// ---- every sound, every level
for (const [title, names] of GROUPS) {
  root.append(heading(title));
  // plain sounds share one wrapping row; sounds with levels (and the spin tick's progress) get a row each
  root.append(row(null, ...names.filter((n) => !SOUNDS[n]?.levels && n !== 'spinTick').map((n) => button(n, '', () => sfx.play(n, 0, { x: 270 })))));
  for (const name of names) {
    const levels = SOUNDS[name]?.levels;
    if (name === 'spinTick') root.append(row(`${name} (progress)`, ...[0, 0.25, 0.5, 0.75, 1].map((p) => button(String(p), 'lv', () => sfx.play(name, p)))));
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
