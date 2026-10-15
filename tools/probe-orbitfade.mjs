// 一次性诊断：冥王星轨道线——远观穿过本体 + 近距淡出
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);

async function view(distKm, tilt, file) {
  await page.evaluate((dist, t) => {
    const g = window.__game;
    const oc = g.orbitCam;
    const be = g.builder.bodies.get('pluto');
    g.select('pluto');
    oc.focusId = 'pluto'; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = 0.5; oc.lon = 0; oc.tilt = t; oc.heading = 0;
    oc.dist = oc.distTarget = be.phys.radiusKm + dist;
  }, distKm, tilt);
  await sleep(2500);
  const st = await page.evaluate(() => {
    const g = window.__game;
    const line = g.builder.orbitLines.userData.pluto;
    return { visible: line.visible, opacity: +line.material.opacity.toFixed(3) };
  });
  console.log(file, JSON.stringify(st));
  await page.screenshot({ path: `tools/.shot-surface/${file}` });
}
await view(2000000, 0.9, '_diag-orbit-far.png');   // 200 万 km：轨道线应清晰且穿过冥王星
await view(100000, 0.6, '_diag-orbit-near.png');   // 10 万 km：应基本隐去
await browser.close();
console.log('DONE');
