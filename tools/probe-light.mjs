import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'],
  defaultViewport: { width: 640, height: 360 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => { window.__game.quality.detail = true; });
// 直接把相机放到水星附近（探索模式即可，不用登陆）
await ev(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  g.select('mercury');
  oc.focusId = 'mercury'; oc.flight = null; oc.panOffset.set(0,0,0);
  oc.lat = 0.3; oc.lon = 0; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = 2439.7 + 0.002;
});
await sleep(4000);
const r = await ev(() => {
  const g = window.__game;
  const sunG = g.builder.bodies.get('sun').group;
  let pl = null;
  sunG.traverse((o) => { if (o.isPointLight) pl = o; });
  const rend = g.renderer ?? null;
  return {
    lightIntensity: pl?.intensity, lightColor: pl?.color.getHexString(),
    mode: g.getMode(),
  };
});
console.log(JSON.stringify(r));
await browser.close();
