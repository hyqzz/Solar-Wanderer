// 找出 L0 中的巨型三角形：扫描索引缓冲，报告顶点跨度 >50m 的三角形及其顶点坐标。
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,720', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => window.__game.flyTo('moon'));
await sleep(2500);
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 90000 });
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = -59.8 * Math.PI / 180;
  g.orbitCam.lon = 0;
  g.orbitCam.distTarget = 1737.4 + 30;
});
await sleep(3000);
await page.mouse.move(800, 450);
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
await sleep(3500);

const report = await ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  const lv = ps.levels[0];
  const pos = lv.geo.attributes.position.array;
  const idx = lv.geo.index.array;
  const grid = Math.sqrt(pos.length / 3) - 1; // GRID
  const giants = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
    const dab = Math.hypot(ax - bx, ay - by, az - bz);
    const dbc = Math.hypot(bx - cx, by - cy, bz - cz);
    const dca = Math.hypot(cx - ax, cy - ay, cz - az);
    const mx = Math.max(dab, dbc, dca);
    if (mx > 0.05) { // >50m
      giants.push({
        tri: t / 3, idx: [a, b, c],
        idxXY: [a, b, c].map((i) => [i % (grid + 1), Math.floor(i / (grid + 1))]),
        span: +mx.toFixed(3),
        pa: [ax, ay, az].map((v) => +v.toFixed(3)),
        pb: [bx, by, bz].map((v) => +v.toFixed(3)),
        pc: [cx, cy, cz].map((v) => +v.toFixed(3)),
      });
      if (giants.length >= 12) break;
    }
  }
  return { grid, totalTris: idx.length / 3, giantCount: giants.length, giants, indexMax: Math.max(...idx), vertCount: pos.length / 3 };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
