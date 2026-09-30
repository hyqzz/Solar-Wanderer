// 缝合线精查：dump L0 第 32 行 x=28..38 的顶点高度（径向分量），
// 并在页面内用同一 height() 重算这些方向的理论值对比。
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

const out = await ev(() => {
  const g = window.__game;
  const ps = g.terrainMgr.active.patches;
  const lv = ps.levels[0];
  const pos = lv.geo.attributes.position.array;
  const origin = lv.origin;
  const R = 1737.4;
  const GRID = 64;
  const row = 32;
  const res = { origin: origin.toArray(), cols: [] };
  const field = g.terrainMgr.fields.get('moon');
  const dem = g.terrainMgr.demSources.get('moon');
  for (let x = 28; x <= 38; x++) {
    const k = row * (GRID + 1) + x;
    const px = pos[k * 3], py = pos[k * 3 + 1], pz = pos[k * 3 + 2];
    // 世界（体固系）方向 = (pos + origin) 归一化；径向高度 = |pos+origin| - R
    const wx = px + origin.x, wy = py + origin.y, wz = pz + origin.z;
    const wl = Math.hypot(wx, wy, wz);
    const dir = { x: wx / wl, y: wy / wl, z: wz / wl };
    const hNow = field.height(dir); // 现在重算
    // DEM 各级命中情况
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI;
    const lon = Math.atan2(-dir.z, dir.x) * 180 / Math.PI;
    const hits = [];
    for (let z = 4; z >= 0; z--) {
      const n = 2 ** z;
      const tx = Math.floor(((lon + 180) / 360) * n), ty = Math.floor(((90 - lat) / 180) * n);
      const t = dem.cache.get(z, ((tx % n) + n) % n, Math.max(0, Math.min(n - 1, ty)));
      if (t) hits.push(z + ':' + t.data.length + 'B');
    }
    res.cols.push({
      x,
      radialH_m: +((wl - R) * 1000).toFixed(1),
      heightFnNow_m: +((hNow - R) * 1000).toFixed(1),
      lon: +lon.toFixed(6), lat: +lat.toFixed(4),
      demHits: hits.join(','),
    });
  }
  return res;
});
console.log('origin:', JSON.stringify(out.origin));
for (const c of out.cols) {
  console.log(`x=${c.x} 网格径向高=${c.radialH_m}m  height()重算=${c.heightFnNow_m}m  lon=${c.lon}  DEM缓存命中=[${c.demHits}]`);
}
await browser.close();
