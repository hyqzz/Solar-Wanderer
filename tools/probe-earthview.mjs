// 月面看地球专项 v2：真实滚轮手势登陆对地点 60° 外（地球仰角 ~30°），精确瞄准。
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

// 相机放到对地点南侧 60°（地球仰角 ~30°）
await ev(() => {
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
  g.orbitCam.lat = Math.asin(Math.max(-1, Math.min(1, ly))) - Math.PI / 3; // 南退 60°
  g.orbitCam.lon = Math.atan2(-lz, lx);
  g.orbitCam.distTarget = 1737.4 + 30; // 先到 30km
});
await sleep(3500);

// 真实滚轮手势驱动自动登陆
await page.mouse.move(800, 450);
let landed = false;
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') { landed = true; break; }
}
console.log('登陆:', landed ? '✅ walk' : '❌ 未登陆');
await sleep(3000);

// 行走视线精确对准地球
const view = await ev(() => {
  const g = window.__game;
  const earth = g.builder.bodies.get('earth');
  const ship = g.ship;
  const moon = g.builder.bodies.get('moon');
  const ex = earth.posKm[0] - ship.posKm[0], ey = earth.posKm[1] - ship.posKm[1], ez = earth.posKm[2] - ship.posKm[2];
  const el = Math.hypot(ex, ey, ez);
  const up3 = [ship.posKm[0] - moon.posKm[0], ship.posKm[1] - moon.posKm[1], ship.posKm[2] - moon.posKm[2]];
  const ul = Math.hypot(...up3);
  const up = [up3[0] / ul, up3[1] / ul, up3[2] / ul];
  const pole = [0, 1, 0];
  let east = [up[1] * pole[2] - up[2] * pole[1], up[2] * pole[0] - up[0] * pole[2], up[0] * pole[1] - up[1] * pole[0]];
  const easL = Math.hypot(...east) || 1;
  east = [east[0] / easL, east[1] / easL, east[2] / easL];
  const north = [east[1] * up[2] - east[2] * up[1], east[2] * up[0] - east[0] * up[2], east[0] * up[1] - east[1] * up[0]];
  const ed = [ex / el, ey / el, ez / el];
  const eEast = ed[0] * east[0] + ed[1] * east[1] + ed[2] * east[2];
  const eNorth = ed[0] * north[0] + ed[1] * north[1] + ed[2] * north[2];
  const eUp = ed[0] * up[0] + ed[1] * up[1] + ed[2] * up[2];
  const pitch = Math.asin(Math.max(-1, Math.min(1, eUp)));
  const yaw = Math.atan2(eEast, eNorth);
  if (g.ship.walk) { g.ship.walk.yaw = yaw; g.ship.walk.pitch = pitch; }
  return { elevDeg: +(pitch * 180 / Math.PI).toFixed(1), mode: g.getMode() };
});
console.log('视线仰角 %s° 模式 %s', view.elevDeg, view.mode);
await sleep(2500);
await page.screenshot({ path: OUT + 'fix-moon-earthview2.png' });
console.log('📷 fix-moon-earthview2');

if (errors.length) { console.log('错误:'); errors.forEach((e) => console.log('  🔥', e)); }
else console.log('零控制台/页面错误 ✅');
await browser.close();
