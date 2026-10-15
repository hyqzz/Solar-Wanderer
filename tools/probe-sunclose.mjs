// 一次性诊断：太阳近距 + 彗星彗尾 观感抽查
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

async function view(id, distKm, lat, tilt, file) {
  await page.evaluate((id, dist, la, t) => {
    const g = window.__game;
    const oc = g.orbitCam;
    const be = g.builder.bodies.get(id);
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = la; oc.lon = 0; oc.tilt = t; oc.heading = 0;
    oc.dist = oc.distTarget = (be ? be.phys.radiusKm : 0) + dist;
  }, id, distKm, lat, tilt);
  await sleep(3000);
  await page.screenshot({ path: `tools/.shot-surface/${file}` });
  console.log('shot', file);
}
// 太阳：3 个太阳半径距离（~2.1M km），略倾侧看米粒/色球
await view('sun', 2.1e6, 0.35, 0.5, '_diag-sun-close.png');
await browser.close();
console.log('DONE');
