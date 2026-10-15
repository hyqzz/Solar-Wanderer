// 一次性诊断：行走点周围 height() 一致性 + DEM 缓存状态
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
await sleep(8000);
const info = await page.evaluate(() => {
  const g = window.__game;
  const tm = g.terrainMgr;
  const f = tm.fields.get('moon');
  const dem = tm.demSources.get('moon');
  const w = g.ship.walk.localPos;
  const len = Math.hypot(w.x, w.y, w.z);
  const u = { x: w.x / len, y: w.y / len, z: w.z / len };
  const R = 1737.4;
  // 以相机方向为轴，切向偏移 0~400m 采样 height()
  const east = Math.abs(u.y) > 0.999 ? { x: 1, y: 0, z: 0 } : (() => {
    const e = { x: 0, y: 1, z: 0 };
    const c = { x: e.y * u.z - e.z * u.y, y: e.z * u.x - e.x * u.z, z: e.x * u.y - e.y * u.x };
    const l = Math.hypot(c.x, c.y, c.z);
    return { x: c.x / l, y: c.y / l, z: c.z / l };
  })();
  const rows = [];
  for (const dm of [0, 50, 100, 200, 300, 400]) {
    const d = {
      x: u.x + east.x * dm / R / 1000 * 1000 / 1000, y: u.y + east.y * dm / R, z: u.z + east.z * dm / R,
    };
    // dm 米 → km
    const dk = dm / 1000;
    const dd = {
      x: u.x + east.x * dk / R, y: u.y + east.y * dk / R, z: u.z + east.z * dk / R,
    };
    const dl = Math.hypot(dd.x, dd.y, dd.z);
    const dir = { x: dd.x / dl, y: dd.y / dl, z: dd.z / dl };
    const V = new (Object.getPrototypeOf(g.camera.position).constructor)(dir.x, dir.y, dir.z);
    const h = f.height(V);
    const demH = dem ? dem.getHeightSync(V) : null;
    rows.push({ dm, h: +(h - R).toFixed(3), dem: demH === null ? null : +demH.toFixed(3) });
  }
  return {
    camAboveDatum: +(len - R).toFixed(3),
    offline: dem?._offline, cacheSize: dem?.cache.size,
    cacheKeys: dem ? [...dem.cache.map.keys()].slice(0, 20) : [],
    rows,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
