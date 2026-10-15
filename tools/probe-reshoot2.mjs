import puppeteer from 'puppeteer';
const OUT = 'tools/.shot-tour/';
const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox','--window-position=-2400,-2400','--window-size=1280,760','--hide-scrollbars'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(() => {
  const o = window.matchMedia.bind(window);
  window.matchMedia = (q) => /pointer\s*:\s*coarse/.test(q) ? { matches:false, addEventListener(){}, addListener(){} } : /any-pointer\s*:\s*fine/.test(q) ? { matches:true, addEventListener(){}, addListener(){} } : o(q);
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);
await ev(() => { window.__game.quality.detail = true; document.getElementById('directory')?.classList.remove('open'); });
await ev(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
async function settle(n = 8) { const m = await ev(() => window.__fc); const t0 = Date.now(); while (Date.now()-t0 < 25000) { await sleep(200); if ((await ev(() => window.__fc)) - m >= n) return; } }

// 冥王星近观（含冥卫一）
for (const [name, dist, lat, tilt] of [['08-冥王星', 6500, 0.34, 0.3], ['08b-冥王星系统', 34000, 0.5, 0.45]]) {
  await ev((dist, lat, tilt) => {
    const g = window.__game, oc = g.orbitCam;
    g.select('pluto');
    oc.focusId = 'pluto'; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = lat; oc.lon = 0; oc.tilt = tilt; oc.heading = 0;
    oc.dist = oc.distTarget = dist;
  }, dist, lat, tilt);
  await settle(8);
  console.log('shot', name, JSON.stringify(await ev(() => ({ f: window.__game.orbitCam.focusId, d: Math.round(window.__game.orbitCam.dist) }))));
  await page.screenshot({ path: OUT + name + '.png' });
}
// 柯伊伯带：从 90 AU 外侧俯视带面
await ev(() => {
  const g = window.__game, oc = g.orbitCam;
  g.select('kuiper'); oc.focusId = 'kuiper'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = 0.9; oc.lon = 0; oc.tilt = 0.0; oc.heading = 0;
  oc.dist = oc.distTarget = 90 * 1.496e8;
});
await settle(8);
console.log('kuiper state', JSON.stringify(await ev(() => ({ f: window.__game.orbitCam.focusId, d: +(window.__game.orbitCam.dist/1.496e8).toFixed(1) }))));
await page.screenshot({ path: OUT + '10-柯伊伯带.png' });
await browser.close();
console.log('DONE');
