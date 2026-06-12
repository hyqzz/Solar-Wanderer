// 针对性验证（第四轮迭代）：土星环配色 / 行走360°视角 / 右键空间平移 /
// 搜索下拉默认列表+轨道线开关 / NMS地表(日照面) / 知识卡片
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
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('❌ ' + msg); process.exitCode = 1; };

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2000);

// --- 1. 右键拖拽空间平移（无旋转）---
const pan0 = await page.evaluate(() => {
  const oc = window.__game.orbitCam;
  return { off: oc.panOffset.length(), lat: oc.lat, lon: oc.lon };
});
await page.mouse.move(800, 450);
await page.mouse.down({ button: 'right' });
await page.mouse.move(950, 520, { steps: 10 });
await page.mouse.up({ button: 'right' });
await sleep(400);
const pan1 = await page.evaluate(() => {
  const oc = window.__game.orbitCam;
  return { off: oc.panOffset.length(), lat: oc.lat, lon: oc.lon };
});
if (pan1.off <= pan0.off) fail('右键拖拽未平移');
if (Math.abs(pan1.lat - pan0.lat) > 1e-6 || Math.abs(pan1.lon - pan0.lon) > 1e-6) fail('平移混入了旋转');
console.log(`✅ 右键空间平移（offset=${pan1.off.toFixed(0)}km，无旋转）`);
await page.keyboard.press('KeyR');
await sleep(200);
const panR = await page.evaluate(() => window.__game.orbitCam.panOffset.length());
if (panR !== 0) fail('R 未复位平移');
console.log('✅ R 复位平移');

// --- 2. 搜索框下拉默认列表 + 轨道线开关 ---
await page.click('#search-input');
await sleep(300);
const dd = await page.evaluate(() => {
  const list = document.getElementById('search-results');
  return {
    shown: list.style.display !== 'none',
    n: list.children.length,
    first: list.children[0]?.textContent ?? '',
  };
});
console.log('下拉默认列表:', JSON.stringify(dd));
if (!dd.shown || dd.n < 5 || !dd.first.includes('轨道线')) fail('搜索下拉默认列表/轨道线项缺失');
const orb0 = await page.evaluate(() => {
  // 点击轨道线开关项
  const item = document.getElementById('search-results').children[0];
  item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return true;
});
await sleep(300);
const orbState = await page.evaluate(() =>
  document.getElementById('search-results').children[0]?.textContent ?? '');
console.log('切换后状态行:', JSON.stringify(orbState));
if (!orbState.includes('隐藏')) fail('轨道线开关未生效');
console.log('✅ 搜索下拉轨道线开关');
await page.keyboard.press('Escape');

// --- 3. 知识卡片 ---
const fact = await page.evaluate(() =>
  document.querySelector('#hud-target .fact')?.textContent ?? '');
console.log('知识卡片:', JSON.stringify(fact.slice(0, 50) + '…'));
if (!fact.includes('你知道吗')) fail('知识卡片未展示');
await page.evaluate(() => document.querySelector('.fact-next')?.click());
await sleep(300);
const fact2 = await page.evaluate(() =>
  document.querySelector('#hud-target .fact')?.textContent ?? '');
if (fact2 === fact) fail('换一条知识未生效');
console.log('✅ 知识卡片与换一条');

// --- 4. 土星环配色（NASA 淡黄褐）---
await page.evaluate(() => window.__game.flyTo('saturn'));
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (!(await page.evaluate(() => !!window.__game.orbitCam.flight))) break;
}
await sleep(800);
await page.screenshot({ path: OUT + '10-saturn-rings-color.png' });
console.log('✅ 土星环配色截图');

// --- 5. 月面日照区地表（NMS/SpaceEngine 质感）+ 行走360°视角 ---
await page.evaluate(() => window.__game.flyTo('moon'));
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (!(await page.evaluate(() => !!window.__game.orbitCam.flight))) break;
}
await page.evaluate(() => {
  const g = window.__game;
  const moon = g.builder.bodies.get('moon');
  // 月面日下点（保证日照）
  const d = Math.hypot(moon.posKm[0], moon.posKm[1], moon.posKm[2]);
  const v = { x: -moon.posKm[0] / d, y: -moon.posKm[1] / d, z: -moon.posKm[2] / d };
  const q = moon.mesh.quaternion.clone().invert();
  const V = new (Object.getPrototypeOf(moon.mesh.position).constructor)(v.x, v.y, v.z);
  V.applyQuaternion(q);
  const oc = g.orbitCam;
  oc.flight = null; oc.focusId = 'moon';
  oc.lat = Math.asin(Math.max(-1, Math.min(1, V.y)));
  oc.lon = Math.atan2(-V.z, V.x);
  oc.vLat = oc.vLon = 0; oc.heading = 0; oc.tilt = 0; oc.panOffset.set(0, 0, 0);
  oc.distTarget = moon.phys.radiusKm * 1.006;
});
await sleep(2500);
await page.keyboard.press('KeyG');
await sleep(2000);
const mode = await page.evaluate(() => window.__game.getMode());
if (mode !== 'walk') fail('未进入行走');
// 行走 360° 俯仰：注入大幅鼠标 dy，验证 pitch 越过旧 ±1.55 限制并环绕
const pitchTest = await page.evaluate(() => {
  const g = window.__game;
  g.input.dy = -1200; // 大幅抬头（一帧内）
  return new Promise((res) => setTimeout(() => res({
    pitch: g.ship.walk.pitch,
  }), 300));
});
console.log('行走俯仰测试:', JSON.stringify(pitchTest));
if (Math.abs(pitchTest.pitch) <= 1.56) fail('行走俯仰仍被 90° 钳制');
console.log('✅ 行走 360° 视角（pitch=' + pitchTest.pitch.toFixed(2) + ' rad，已越过旧钳制）');
await page.evaluate(() => { window.__game.ship.walk.pitch = -0.06; });
await sleep(800);
await page.screenshot({ path: OUT + '11-moon-surface-sunlit.png' });
console.log('✅ 月面日照地表截图');

console.log('\n控制台错误数:', errors.length);
for (const e of errors.slice(0, 10)) console.log('  ❌', e.slice(0, 250));
await browser.close();
process.exit(process.exitCode || (errors.length ? 1 : 0));
