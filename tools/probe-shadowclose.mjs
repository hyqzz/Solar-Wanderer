// 一次性诊断：近场太阳阴影特写（月球晨昏线附近，低太阳角长影子）
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--hide-scrollbars'],
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
await page.waitForFunction(() => window.__game?.orbitCam, { timeout: 60000 });

await page.evaluate(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  const be = g.builder.bodies.get('moon');
  g.select('moon');
  oc.focusId = 'moon'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  const q = be.mesh.quaternion;
  const p = be.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const vx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const vy = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const vz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  oc.lat = 10 * Math.PI / 180;
  oc.lon = Math.atan2(-vz, vx) + 62 * Math.PI / 180; // 日下点以西 62° → 太阳高度 ~28°
  oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = be.phys.radiusKm + 0.002;
});
await sleep(2500);
// G 键立即登陆（DEM 就绪闸通过后 enterWalk 吸附真实地表）
await page.evaluate(() => {
  const g = window.__game;
  g.input.keys.add('KeyG'); g.input.justPressed.add('KeyG');
});
{
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    if ((await page.evaluate(() => window.__game.getMode())) === 'walk') break;
    await sleep(500);
  }
}
await sleep(7000); // 地形 + DEM 扫 + 岩石就位
// 略微俯视看脚下岩石与影子
await page.evaluate(() => { const w = window.__game.ship.walk; w.pitch = -0.30; });
await sleep(1000);
await page.screenshot({ path: 'tools/.shot-surface/_diag-shadow-close.png' });
// 地平线视角（岩石剪影+长影）
await page.evaluate(() => { const w = window.__game.ship.walk; w.pitch = 0.04; });
await sleep(700);
await page.screenshot({ path: 'tools/.shot-surface/_diag-shadow-horizon.png' });
await browser.close();
console.log('DONE');
