// #14 太阳遮挡补拍：相机置于火星背日线外侧 2.5R，太阳应被火星盘面完全遮挡
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--hide-scrollbars'],
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
await ev(() => window.__game.flyTo('mars'));
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 90000 });
await sleep(1500);
// 相机定位到火星背日点方向 2.5R，看向火星（太阳在火星正背后）
const setup = await ev(() => {
  const g = window.__game;
  const mars = g.builder.bodies.get('mars');
  const p = mars.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const away = { x: p[0] / l, y: p[1] / l, z: p[2] / l }; // 日心→火星（世界系）
  // 世界方向 → 体固系经纬
  const q = mars.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w]; // 逆
  const ix = qw * away.x + qy * away.z - qz * away.y;
  const iy = qw * away.y + qz * away.x - qx * away.z;
  const iz = qw * away.z + qx * away.y - qy * away.x;
  const iw = -qx * away.x - qy * away.y - qz * away.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  const oc = g.orbitCam;
  oc.flight = null;
  oc.panOffset.set(0, 0, 0);
  oc.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
  oc.lon = Math.atan2(-lz, lx);
  oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = 3396 * 2.5;
  return { lat: oc.lat, lon: oc.lon };
});
console.log('setup', JSON.stringify(setup));
await sleep(3000);
const st = await ev(() => {
  const g = window.__game;
  const mars = g.builder.bodies.get('mars');
  const d = Math.hypot(
    g.ship.posKm[0] - mars.posKm[0], g.ship.posKm[1] - mars.posKm[1], g.ship.posKm[2] - mars.posKm[2]);
  // 太阳相对火星的角偏移（应≈0：相机—火星—太阳共线）
  const sunDir = [-mars.posKm[0], -mars.posKm[1], -mars.posKm[2]];
  const camDir = [g.ship.posKm[0] - mars.posKm[0], g.ship.posKm[1] - mars.posKm[1], g.ship.posKm[2] - mars.posKm[2]];
  const nl = (v) => Math.hypot(...v);
  const dot = (sunDir[0] * camDir[0] + sunDir[1] * camDir[1] + sunDir[2] * camDir[2]) / (nl(sunDir) * nl(camDir));
  const sepDeg = Math.acos(Math.max(-1, Math.min(1, -dot))) * 180 / Math.PI;
  return { distKm: Math.round(d), marsAngRadiusDeg: +(Math.asin(3396 / d) * 180 / Math.PI).toFixed(2), sunBehindMarsDeg: +sepDeg.toFixed(2) };
});
console.log(JSON.stringify(st));
await page.screenshot({ path: 'tools/.shot-issues/14-sun-occluded2.png' });
// 对照组：相机偏移 5°，太阳应露出边缘
await ev(() => { const g = window.__game; g.orbitCam.lon += 0.20; });
await sleep(1500);
await page.screenshot({ path: 'tools/.shot-issues/14-sun-peek.png' });
await browser.close();
console.log('done');
