// R8 #1 取证/验证截图：土星/木星中距离观察大气边界（修复前后对比用）
// 用法: node tools/probe-r8-shot.mjs [前缀，默认 r8-before]

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const TAG = process.argv[2] ?? 'r8-before';
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
page.on('pageerror', (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitArrival(timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!(await page.evaluate(() => !!window.__game.orbitCam.flight))) return true;
    await sleep(500);
  }
  return false;
}

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'networkidle2', timeout: 180000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 180000 });
await page.click('#start-btn');
await sleep(2000);
// 隐藏标签/轨道线，纯净观察大气边界
await page.evaluate(() => { window.__game.input.justPressed.add('KeyL'); window.__game.input.justPressed.add('KeyO'); });
await sleep(300);

for (const [id, R, mul, latDeg] of [
  ['saturn', 58232, 4.5, 35],   // 中距离+中纬度（扁率视角明显）
  ['saturn', 58232, 2.2, 70],   // 高纬俯视极区（扁率差最大处）
  ['jupiter', 69911, 4.0, 30],
]) {
  await page.evaluate((bid) => window.__game.flyTo(bid), id);
  await waitArrival();
  await page.evaluate(({ r, lat }) => {
    const c = window.__game.orbitCam;
    c.distTarget = r; c.lat = lat * Math.PI / 180; c.tilt = 0; c.heading = 0;
  }, { r: R * mul, lat: latDeg });
  await sleep(3500);
  const name = `${TAG}-${id}-${mul}x.png`;
  await page.screenshot({ path: OUT + name });
  console.log('📷', name);
}
console.log('页面错误:', errors.length);
await browser.close();
