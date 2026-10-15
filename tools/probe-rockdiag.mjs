// 一次性诊断：岩石实例计数与位置检查
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
await page.evaluate(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  const be = g.builder.bodies.get('moon');
  g.select('moon');
  oc.focusId = 'moon'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = 10 * Math.PI / 180; oc.lon = 0; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = be.phys.radiusKm + 0.002;
});
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  if ((await page.evaluate(() => window.__game.getMode())) === 'walk') break;
  await sleep(500);
}
await sleep(7000);
const info = await page.evaluate(() => {
  const g = window.__game;
  const tm = g.terrainMgr;
  if (!tm.active) return { active: false };
  const rocks = tm.active.patches.rocks;
  const m = rocks.mesh;
  const arr = m.instanceMatrix.array;
  const first = [];
  for (let i = 0; i < Math.min(3, m.count); i++) {
    first.push([arr[i * 16 + 12], arr[i * 16 + 13], arr[i * 16 + 14]].map((v) => +v.toFixed(4)));
  }
  return {
    active: true, body: tm.active.bodyId, count: m.count, MAX: rocks.MAX,
    density: rocks.density, meshPos: m.position.toArray().map((v) => +v.toFixed(2)),
    meshVisible: m.visible, parentVisible: m.parent?.visible,
    camLocal: (() => { const w = g.ship.walk.localPos; return [w.x, w.y, w.z].map((v) => +v.toFixed(1)); })(),
    first,
    hasInstanceColor: !!m.instanceColor,
    scale0: [arr[0], arr[5], arr[10]].map((v) => +v.toFixed(6)),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
