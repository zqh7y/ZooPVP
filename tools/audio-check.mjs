// Renders every sound (every level, every variant) like engine.ts does and prints duration, peak and RMS.
// Usage: node tools/audio-check.mjs   (starts its own vite on port 5182 unless one answers there)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 5182;
const BASE = `http://localhost:${PORT}`;

async function up() {
  try {
    return (await fetch(BASE + '/')).ok;
  } catch {
    return false;
  }
}

let vite = null;
if (!(await up())) {
  vite = spawn('node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let bad = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.route(BASE + '/__check', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>check</title>' }));
  await page.goto(BASE + '/__check');
  const rows = await page.evaluate(async () => {
    const { SOUNDS } = await import('/src/audio/sounds.ts');
    const { renderRecipe } = await import('/src/audio/synth.ts');
    const out = [];
    for (const name of Object.keys(SOUNDS)) {
      const def = SOUNDS[name];
      for (const level of def.levels ?? [0]) {
        for (let v = 0; v < (def.vars ?? 1); v++) {
          const dur = typeof def.dur === 'function' ? def.dur(level) : def.dur;
          const row = { name, level, v, dur, vol: def.vol, cat: def.cat };
          try {
            const b = await renderRecipe(`${name}#${level}#${v}`, dur, (s) => def.make(s, level));
            const d = b.getChannelData(0);
            let peak = 0;
            let sum = 0;
            let nan = 0;
            for (let i = 0; i < d.length; i++) {
              if (!Number.isFinite(d[i])) nan++;
              else {
                peak = Math.max(peak, Math.abs(d[i]));
                sum += d[i] * d[i];
              }
            }
            row.len = b.duration;
            row.peak = peak;
            row.rms = Math.sqrt(sum / d.length);
            row.nan = nan;
          } catch (e) {
            row.err = String(e && e.message ? e.message : e);
          }
          out.push(row);
        }
      }
    }
    return out;
  });
  for (const r of rows) {
    const probs = [];
    if (r.err) probs.push('ERROR ' + r.err);
    else {
      if (r.nan) probs.push('NaN');
      if (!(r.peak > 0.01)) probs.push('SILENT');
      if (r.len > r.dur * 1.05 + 0.05) probs.push('LONG');
      if (r.len < 0.02) probs.push('TINY');
    }
    if (probs.length) bad++;
    console.log(
      `${r.name.padEnd(13)} L${String(r.level).padEnd(3)} v${r.v} dur ${r.dur.toFixed(2)} len ${(r.len ?? 0).toFixed(2)} peak ${(r.peak ?? 0).toFixed(2)} rms ${(r.rms ?? 0).toFixed(3)} vol ${r.vol} ${r.cat} ${probs.join(' ')}`,
    );
  }
  console.log(`${rows.length} renders, ${bad} problems`);
} finally {
  await browser.close();
  if (vite) vite.kill();
}
process.exit(bad ? 1 : 0);
