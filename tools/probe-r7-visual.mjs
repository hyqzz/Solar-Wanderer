// R7 高画质档视检：?quality=high 强制开启细节着色器，截外行星近景与气巨特写
// 用法: node tools/probe-r7-visual.mjs [url]

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const PAGE_URL = (process.argv[2] ?? 'http://localhost:5173/') + '?quality=high';
const OUT = new URL('../docs/sdlc/screenshots/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1600,900', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitArrival(timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!(await page.evaluate(() => !!window.__game.orbitCam.flight))) return true;
    await sleep(500);
  }
  return false;
}

await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 180000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 180000 });
await page.click('#start-btn');
await sleep(2000);
const tier = await page.evaluate(() => window.__game ? 'ok' : 'no');
console.log('页面就绪:', tier);

for (const [id, R, mul] of [
  ['saturn', 58232, 1.5], ['uranus', 25362, 1.5], ['neptune', 24622, 1.5],
  ['jupiter', 69911, 1.3], ['pluto', 1188.3, 1.8],
]) {
  await page.evaluate((bid) => window.__game.flyTo(bid), id);
  await waitArrival();
  await page.evaluate((r) => { window.__game.orbitCam.distTarget = r; }, R * mul);
  await sleep(4000);
  await page.screenshot({ path: OUT + `r7-hi-${id}.png` });
  console.log(`📷 ${id} 高画质近景已截图`);
}
console.log('控制台错误数:', errors.length);
errors.slice(0, 5).forEach((e) => console.log('  ', e.slice(0, 200)));
await browser.close();
process.exit(errors.length ? 1 : 0);
