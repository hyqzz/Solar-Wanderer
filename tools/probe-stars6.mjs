// 桌面模式残星定位：桌面指针伪装 + 登陆地球白昼 → 基线截图 → 隐藏 #directory/#left-col → 再截图。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-starfade/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
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
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => { window.__game.quality.detail = true; });

const lon = await ev(() => {
  const b = window.__game.builder.bodies.get('earth');
  const p = b.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return Math.atan2(-lz, lx);
});
await ev((lon) => {
  const g = window.__game;
  const oc = g.orbitCam;
  g.select('earth');
  oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = 0.35; oc.lon = lon; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = 6371.0 + 0.002;
}, lon);
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
  await sleep(400);
}
await sleep(3000);
await ev(() => { const w = window.__game.ship.walk; if (w) w.pitch = 1.05; });
await sleep(700);
await page.screenshot({ path: `${OUT}desk-baseline.png` });

await ev(() => {
  for (const id of ['directory', 'left-col']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await sleep(300);
await page.screenshot({ path: `${OUT}desk-nodir.png` });

// 再隐藏 labels
await ev(() => { document.getElementById('labels').style.display = 'none'; });
await sleep(300);
await page.screenshot({ path: `${OUT}desk-nolabels.png` });
await browser.close();
console.log('DONE');
