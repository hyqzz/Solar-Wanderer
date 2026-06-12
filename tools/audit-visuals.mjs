// 全行星视觉审查：系统性截图（土星环影/地球地表蓝天/火星地表/金星雾/木星特写/太阳特写/亮星）
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../docs/sdlc/screenshots/audit/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1600,900', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2000);

/** 探索模式定位：focus + 体固经纬 + 距离倍数（subsolar=true 时停在日下点方向） */
async function goOrbit(id, distMul, { subsolar = false, latDeg = 10 } = {}) {
  await page.evaluate(({ id, distMul, subsolar, latDeg }) => {
    const g = window.__game;
    const e = g.builder.bodies.get(id);
    const oc = g.orbitCam;
    oc.flight = null; oc.focusId = id;
    oc.vLat = oc.vLon = 0; oc.heading = 0; oc.tilt = 0; oc.panOffset.set(0, 0, 0);
    if (subsolar) {
      const d = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
      const v = { x: -e.posKm[0] / d, y: -e.posKm[1] / d, z: -e.posKm[2] / d };
      const q = e.mesh.quaternion.clone().invert();
      const V = new (Object.getPrototypeOf(e.mesh.position).constructor)(v.x, v.y, v.z);
      V.applyQuaternion(q);
      oc.lat = Math.asin(Math.max(-1, Math.min(1, V.y)));
      oc.lon = Math.atan2(-V.z, V.x);
    } else {
      oc.lat = latDeg * Math.PI / 180;
    }
    oc.dist = oc.distTarget = e.phys.radiusKm * distMul;
  }, { id, distMul, subsolar, latDeg });
  await sleep(1800);
}

// 1. 土星：环影应投在行星上（朝向太阳一侧观察）
await goOrbit('saturn', 4, { subsolar: true, latDeg: 8 });
await page.screenshot({ path: OUT + 'a1-saturn-ringshadow.png' });
console.log('📷 土星环影');

// 2. 地球地表白昼蓝天
await goOrbit('earth', 1.005, { subsolar: true });
await sleep(1500);
await page.keyboard.press('KeyG');
await sleep(2000);
await page.evaluate(() => { window.__game.ship.walk.pitch = 0.12; });
await sleep(700);
await page.screenshot({ path: OUT + 'a2-earth-surface-day.png' });
console.log('📷 地球地表白昼');
await page.keyboard.press('KeyG');
await sleep(600);

// 3. 火星地表
await goOrbit('mars', 1.006, { subsolar: true });
await sleep(1200);
await page.keyboard.press('KeyG');
await sleep(2000);
await page.evaluate(() => { window.__game.ship.walk.pitch = 0.1; });
await sleep(700);
await page.screenshot({ path: OUT + 'a3-mars-surface.png' });
console.log('📷 火星地表');
await page.keyboard.press('KeyG');
await sleep(600);

// 4. 金星地表（浓雾）
await goOrbit('venus', 1.008, { subsolar: true });
await sleep(1200);
await page.keyboard.press('KeyG');
await sleep(2000);
await page.evaluate(() => { window.__game.ship.walk.pitch = 0.1; });
await sleep(700);
await page.screenshot({ path: OUT + 'a4-venus-surface.png' });
console.log('📷 金星地表');
await page.keyboard.press('KeyG');
await sleep(600);

// 5. 木星特写（大红斑半球随机）
await goOrbit('jupiter', 2.2, { subsolar: true });
await page.screenshot({ path: OUT + 'a5-jupiter-close.png' });
console.log('📷 木星特写');

// 6. 太阳特写
await goOrbit('sun', 3.5, { latDeg: 5 });
await page.screenshot({ path: OUT + 'a6-sun-close.png' });
console.log('📷 太阳特写');

// 7. 亮星标签（地球远景拉开看星空）
await goOrbit('earth', 40, { latDeg: 15 });
await sleep(800);
const starLabels = await page.evaluate(() =>
  [...document.querySelectorAll('.label-star')].filter((el) => el.style.display !== 'none').length);
await page.screenshot({ path: OUT + 'a7-bright-stars.png' });
console.log('📷 亮星（可见标签数:', starLabels + '）');

console.log('\n控制台错误数:', errors.length);
for (const e of errors.slice(0, 10)) console.log('  ❌', e.slice(0, 250));
await browser.close();
process.exit(errors.length ? 1 : 0);
