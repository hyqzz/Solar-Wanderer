// 月面巨墙 artifact 诊断：同一落点，从轨道俯瞰 + 地表环视，定位几何来源。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = 'http://localhost:5173/?quality=high';
const OUT = new URL('./.shot-audit/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

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
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => { window.__game.quality.detail = true; });

await ev(() => window.__game.flyTo('moon'));
await sleep(2500);
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 90000 });

// 与 earthview 探针完全相同的落点（对地点南退 60°）
const site = await ev(() => {
  const g = window.__game;
  const moon = g.builder.bodies.get('moon');
  const earth = g.builder.bodies.get('earth');
  const dx = earth.posKm[0] - moon.posKm[0], dy = earth.posKm[1] - moon.posKm[1], dz = earth.posKm[2] - moon.posKm[2];
  const l = Math.hypot(dx, dy, dz);
  const ew = [dx / l, dy / l, dz / l];
  const q = moon.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * ew[0] + qy * ew[2] - qz * ew[1];
  const iy = qw * ew[1] + qz * ew[0] - qx * ew[2];
  const iz = qw * ew[2] + qx * ew[1] - qy * ew[0];
  const iw = -qx * ew[0] - qy * ew[1] - qz * ew[2];
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const lat = Math.asin(Math.max(-1, Math.min(1, ly))) - Math.PI / 3;
  const lon = Math.atan2(-lz, lx);
  g.orbitCam.lat = lat;
  g.orbitCam.lon = lon;
  g.orbitCam.distTarget = 1737.4 + 30;
  return { lat: +(lat * 180 / Math.PI).toFixed(1), lon: +(lon * 180 / Math.PI).toFixed(1) };
});
console.log('落点: lat=%s° lon=%s°', site.lat, site.lon);
await sleep(4000);

// 俯瞰：30km 高度看落点周围地形全貌
await page.screenshot({ path: OUT + 'diag-wall-orbit30km.png' });
console.log('📷 diag-wall-orbit30km');

// 降到 2km
await ev(() => { window.__game.orbitCam.distTarget = 1737.4 + 2; });
await sleep(3000);
await page.screenshot({ path: OUT + 'diag-wall-orbit2km.png' });
console.log('📷 diag-wall-orbit2km');

// 滚轮登陆
await page.mouse.move(800, 450);
let landed = false;
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') { landed = true; break; }
}
console.log('登陆:', landed ? '✅' : '❌');
await sleep(4000);

// 地表环视 4 向
const state = await ev(() => {
  const g = window.__game;
  return {
    mode: g.getMode(),
    posKm: [...g.ship.posKm].map((v) => +v.toFixed(2)),
    yaw: g.ship.walk?.yaw, pitch: g.ship.walk?.pitch,
  };
});
console.log('状态:', JSON.stringify(state));
for (let k = 0; k < 4; k++) {
  await ev((kk) => {
    const g = window.__game;
    if (g.ship.walk) { g.ship.walk.yaw = kk * Math.PI / 2; g.ship.walk.pitch = 0.1; }
  }, k);
  await sleep(1200);
  await page.screenshot({ path: OUT + `diag-wall-pan${k}.png` });
  console.log(`📷 diag-wall-pan${k}（yaw=${k * 90}°）`);
}

if (errors.length) { console.log('错误:'); errors.forEach((e) => console.log('  🔥', e)); }
else console.log('零控制台/页面错误 ✅');
await browser.close();
