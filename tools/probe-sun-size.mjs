// 验证：从水星表面看太阳的角直径是否符合真实值（理论 ~1.38°）
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../docs/sdlc/screenshots/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1600,900', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 300)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2000);

// 直达水星日下点上空并登陆
await page.evaluate(() => {
  const g = window.__game;
  const me = g.builder.bodies.get('mercury');
  const d = Math.hypot(me.posKm[0], me.posKm[1], me.posKm[2]);
  const v = { x: -me.posKm[0] / d, y: -me.posKm[1] / d, z: -me.posKm[2] / d }; // 指向太阳
  const q = me.mesh.quaternion.clone().invert();
  const V = new (Object.getPrototypeOf(me.mesh.position).constructor)(v.x, v.y, v.z);
  V.applyQuaternion(q);
  const oc = g.orbitCam;
  oc.flight = null; oc.focusId = 'mercury';
  oc.lat = Math.asin(Math.max(-1, Math.min(1, V.y)));
  oc.lon = Math.atan2(-V.z, V.x);
  oc.vLat = oc.vLon = 0; oc.heading = 0; oc.tilt = 0; oc.panOffset.set(0, 0, 0);
  oc.distTarget = me.phys.radiusKm * 1.006;
});
await sleep(2500);
await page.keyboard.press('KeyG');
await sleep(1500);

// 数据核验
const data = await page.evaluate(() => {
  const g = window.__game;
  const me = g.builder.bodies.get('mercury');
  const sunR = g.builder.bodies.get('sun').phys.radiusKm;
  const meshR = g.builder.bodies.get('sun').mesh.geometry.parameters.radius;
  const dSun = Math.hypot(g.ship.posKm[0], g.ship.posKm[1], g.ship.posKm[2]);
  const angDeg = (2 * Math.asin(sunR / dSun) * 180) / Math.PI;
  // 日下点：太阳应在天顶 → 抬头
  g.ship.walk.pitch = 1.5;
  return {
    mode: g.getMode(),
    sunRadiusPhysKm: sunR,
    sunMeshRadiusKm: meshR,
    distToSunAU: (dSun / 1.495978707e8).toFixed(4),
    angularDiameterDeg: angDeg.toFixed(3),
    expectedFromEarthDeg: ((2 * Math.asin(sunR / 1.496e8) * 180) / Math.PI).toFixed(3),
  };
});
console.log('核验数据:', JSON.stringify(data, null, 2));
await sleep(800);
await page.screenshot({ path: OUT + '12-sun-from-mercury.png' });

// 屏幕实测：太阳盘面像素直径（中心亮区阈值扫描）
const px = await page.evaluate(() => {
  const cv = document.getElementById('app');
  const gl = cv.getContext('webgl2');
  return null; // 像素读取经 composer 不可直接读，改用截图分析
});
console.log('截图已保存 12-sun-from-mercury.png（理论盘面像素 ≈ 1.38°/58° × 900px ≈ 21px + 日冕辉光）');
await browser.close();
