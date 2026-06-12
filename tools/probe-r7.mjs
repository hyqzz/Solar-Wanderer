// R7 运行时探针（浏览器端到端）：
// 1) 滚轮贴地自动转行走（无缝降落）；2) 行走中滚轮后退无缝起飞回探索；
// 3) 气巨入气：浸没层渐显 + 提示；4) 外行星近景截图（细节着色器视检）。
// 用法: node tools/probe-r7.mjs [url]

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const PAGE_URL = process.argv[2] ?? 'http://localhost:5173/';
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
let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log('✅ ' + name);
  else { console.error(`❌ ${name} ${detail}`); failed++; }
};
async function waitArrival(timeoutMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!(await page.evaluate(() => !!window.__game.orbitCam.flight))) return true;
    await sleep(400);
  }
  return false;
}

await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2000);

// --- 1) 滚轮贴地 → 自动转行走（火星，无缝降落） ---
await page.evaluate(() => window.__game.flyTo('mars'));
await waitArrival();
await sleep(800);
// 模拟持续滚轮拉近：直接压 distTarget（等效滚到底），主循环应自动转行走
await page.evaluate(() => { window.__game.orbitCam.distTarget = 1; });
let mode = 'orbit';
for (let i = 0; i < 50 && mode !== 'walk'; i++) { await sleep(400); mode = await page.evaluate(() => window.__game.getMode()); }
check('滚轮拉近到底 → 自动转入行走模式', mode === 'walk', `mode=${mode}`);
const walkInfo = await page.evaluate(() => ({
  hud: document.getElementById('hud-nav')?.innerText,
  pitch: window.__game.ship.walk.pitch,
}));
console.log('   行走 HUD:', JSON.stringify(walkInfo.hud?.split('\n')[0]), 'pitch=', walkInfo.pitch?.toFixed(3));
await page.screenshot({ path: OUT + 'r7-01-autoland-mars.png' });

// --- 2) 行走中滚轮后退 → 无缝起飞回探索 ---
await page.evaluate(() => {
  const w = window.__game;
  w.input.wheel += 1; // 模拟滚轮后退一格（等效 wheel 事件）
});
await sleep(600);
mode = await page.evaluate(() => window.__game.getMode());
check('行走中滚轮后退 → 起飞回探索模式', mode === 'orbit', `mode=${mode}`);
// 起飞后连续后退拉远
await page.evaluate(() => { window.__game.orbitCam.distTarget = window.__game.orbitCam.dist * 30; });
await sleep(1500);
await page.screenshot({ path: OUT + 'r7-02-takeoff-mars.png' });

// --- 3) 气巨入气：木星 ---
await page.evaluate(() => window.__game.flyTo('jupiter'));
await waitArrival();
await sleep(500);
await page.evaluate(() => {
  const g = window.__game;
  g.orbitCam.distTarget = 69911 * 1.0013; // 下潜到云甲板上空
});
await sleep(4000);
const imm = await page.evaluate(() => ({
  opacity: parseFloat(document.getElementById('immersion').style.opacity || '0'),
  tip: document.getElementById('hud-tip')?.innerText,
  mode: window.__game.getMode(),
  boost: (() => {
    const e = window.__game.builder.bodies.get('jupiter');
    return e.atmoMesh.material.userData.uniforms.uBoost.value;
  })(),
}));
check('木星入气：浸没层渐显', imm.opacity > 0.3, `opacity=${imm.opacity}`);
check('木星入气：大气密度增幅生效', imm.boost > 5, `uBoost=${imm.boost?.toFixed(1)}`);
check('木星入气：保持探索模式（不可登陆）', imm.mode === 'orbit', `mode=${imm.mode}`);
console.log('   提示:', JSON.stringify(imm.tip));
await page.screenshot({ path: OUT + 'r7-03-jupiter-entry.png' });
// 退出大气 → uBoost 应复位为 1（外观零回归）
await page.evaluate(() => { window.__game.orbitCam.distTarget = 69911 * 5; });
await sleep(3000);
const boostOut = await page.evaluate(() =>
  window.__game.builder.bodies.get('jupiter').atmoMesh.material.userData.uniforms.uBoost.value);
check('离开大气：密度增幅复位为 1', Math.abs(boostOut - 1) < 1e-6, `uBoost=${boostOut}`);
await page.screenshot({ path: OUT + 'r7-04-jupiter-outside.png' });

// --- 4) 外行星近景截图（细节着色器视检） ---
for (const [id, R] of [['saturn', 58232], ['neptune', 24622], ['pluto', 1188.3]]) {
  await page.evaluate((bid) => window.__game.flyTo(bid), id);
  await waitArrival();
  await page.evaluate((r) => { window.__game.orbitCam.distTarget = r * 1.6; }, R);
  await sleep(3000);
  await page.screenshot({ path: OUT + `r7-05-${id}-closeup.png` });
  console.log(`   📷 ${id} 近景已截图`);
}

console.log('\n控制台错误数:', errors.length);
errors.slice(0, 5).forEach((e) => console.log('  ', e.slice(0, 200)));
await browser.close();
console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ R7 运行时探针全部通过');
process.exit(failed || errors.length ? 1 : 0);
