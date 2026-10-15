// 地球夜面抬头看星空：确认真实星座在天上认得出（猎户座、冬季大三角、北斗）。
// 站在反日点（当地午夜），把视线抬到接近天顶。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-sky/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 1100, height: 760 });
await p.goto('http://127.0.0.1:4199/?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));
await p.evaluate(() => {
  const s = window.__game.sky;
  return s;
});

// 反日点（当地午夜）的体固经纬
const midnight = await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('earth');
  const q = e.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  // 反日点（当地午夜）：从行星中心**背离**太阳的方向。
  // 取 -posKm 得到的是日下点（正午）——第一版就这么写的，拍出来一片白昼天光。
  const toSun = { x: e.posKm[0], y: e.posKm[1], z: e.posKm[2] };
  const L = Math.hypot(toSun.x, toSun.y, toSun.z);
  toSun.x /= L; toSun.y /= L; toSun.z /= L;
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const lat = Math.asin(Math.max(-1, Math.min(1, ly)));
  const lon = Math.atan2(-lz, lx);
  return { lat, lon };
});

// 贴着地表并等自动登陆（与 probe-surface.mjs 同一套做法：
// 直接调 ship.enterWalk 会因为 env.nearest 还没算出来而抛错）
await p.evaluate((m) => {
  const g = window.__game;
  const oc = g.orbitCam;
  g.select('earth');
  oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = m.lat; oc.lon = m.lon; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = 6371 + 0.002;
}, midnight);
for (let i = 0; i < 60; i++) {
  if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('模式:', await p.evaluate(() => window.__game.getMode()));
await new Promise((r) => setTimeout(r, 6000));
const shot = async (pitch, name) => {
  await p.evaluate((pt) => {
    const w = window.__game.ship.walk;
    if (w) { w.pitch = pt; w.yaw = 0; }
  }, pitch);
  await new Promise((r) => setTimeout(r, 2500));
  await p.screenshot({ path: `${OUT}${name}.png` });
};
await shot(0.06, '01-horizon');
await shot(0.75, '02-mid');
await shot(1.35, '03-zenith');
console.log('模式:', await p.evaluate(() => window.__game.getMode()));
console.log('错误:', errs.length, errs[0] ?? '');
await b.close();
console.log('截图:', OUT);
