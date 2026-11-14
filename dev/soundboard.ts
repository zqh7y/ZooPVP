import { music, sfx, type SoundName } from '../src/audio/engine';
import type { MusicState } from '../src/audio/names';
import { SOUNDS } from '../src/audio/sounds';

/* The page to listen on: a button per sound (a button per level where it has levels) and per music state. */

// the groups, in the order names.ts lists them
const GROUPS: [string, SoundName[]][] = [
  ['Interface', ['click', 'pick', 'drop', 'denied', 'link', 'unlink', 'merge', 'stack', 'whoosh', 'hint', 'count']],
  ['Rolls', ['rollStart', 'tick', 'tock', 'reveal', 'crack', 'breakthrough', 'collect']],
  ['Matchmaking', ['search', 'found', 'vsSlam', 'countdown', 'fight']],
  ['Fight: attacks', ['deploy', 'bite', 'knife', 'knifeHit', 'bat', 'batHit', 'spear', 'spearHit', 'shieldBash', 'block', 'hop', 'stun']],
  ['Fight: deaths', ['pop', 'squish', 'launch', 'slice', 'spin', 'deflate', 'shatter', 'petals', 'combo', 'lastKill', 'meter', 'rollEarned', 'enrage', 'cheer']],
  ['Result', ['victory', 'defeat', 'trophyUp', 'trophyDown', 'leagueUp']],
];
const STATES: MusicState[] = ['lobby', 'search', 'battle', 'overtime', 'victory', 'defeat', 'off'];

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

const root = el('sfx');
for (const [title, names] of GROUPS) {
  const h = document.createElement('h2');
  h.textContent = title;
  root.append(h);
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'row';
    const levels = SOUNDS[name]?.levels;
    if (!levels) row.append(button(name, '', () => sfx.play(name, 0)));
    else {
      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = name;
      row.append(label);
      for (const l of levels) row.append(button(String(l), 'lv', () => sfx.play(name, l)));
    }
    root.append(row);
  }
}

const musicBox = el('music');
const stateButtons = new Map<MusicState, HTMLButtonElement>();
for (const st of STATES) {
  const b = button(st, '', () => {
    music.set(st);
    for (const [k, x] of stateButtons) x.classList.toggle('on', k === st);
  });
  stateButtons.set(st, b);
  musicBox.append(b);
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
