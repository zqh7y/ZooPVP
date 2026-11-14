// Takes a screenshot of a page with the pre-installed headless Chromium.
//   node tools/shot.mjs <url> <out.png> [--w 540] [--h 1170] [--scale 2] [--wait 600] [--full] [--eval "js to run in the page first"] [--clip x,y,w,h]
// Prints console errors of the page, so a broken page is noticed.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out.png> [--w 540] [--h 1170] [--scale 2] [--wait 600] [--full] [--eval "js"] [--clip x,y,w,h]');
  process.exit(2);
}
const opt = { w: 540, h: 1170, scale: 2, wait: 600, full: false, eval: '', clip: '' };
for (let i = 0; i < rest.length; i++) {
  const k = rest[i].replace(/^--/, '');
  if (k === 'full') opt.full = true;
  else opt[k] = rest[++i];
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +opt.w, height: +opt.h }, deviceScaleFactor: +opt.scale });
let errors = 0;
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors++;
    console.log('[page error]', m.text());
  }
});
page.on('pageerror', (e) => {
  errors++;
  console.log('[page exception]', e.message);
});
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.fonts && document.fonts.ready);
if (opt.eval) await page.evaluate(opt.eval);
await page.waitForTimeout(+opt.wait);
const shot = { path: out, fullPage: opt.full };
if (opt.clip) {
  const [x, y, width, height] = opt.clip.split(',').map(Number);
  shot.clip = { x, y, width, height };
}
await page.screenshot(shot);
await browser.close();
console.log(`saved ${out}${errors ? ` (${errors} page errors)` : ''}`);
