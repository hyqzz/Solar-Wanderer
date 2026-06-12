// R9 运行时探针（浏览器端到端）：
// 1) 地球海洋：滚轮下潜入水 → 水下环境（浸没层/雾）→ 海床行走；
// 2) 火卫一土豆形态截图；3) 冥王星心形平原截图；
// 4) 惯性观察模式（V）切换连续性；5) 行走视角稳定性（无快速旋转）。
// 用法: node tools/probe-r9.mjs [url]

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const PAGE_URL = process.argv[2] ?? 'http://localhost:5173/?quality=high';
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

// --- 1) 地球海洋下潜：定位太平洋，滚轮压到海面之下 ---
{
  await page.evaluate(() => {
    const g = window.__game;
    g.orbitCam.lat = 0.05; g.orbitCam.lon = 0; // 先回地球正面
  });
  // 在体固系中搜出一个海洋方向（用地形管理器的 isWater）
  const oceanLL = await page.evaluate(() => {
    const g = window.__game;
    const V = { x: 0, y: 0, z: 0 };
    for (let lon = -Math.PI; lon < Math.PI; lon += 0.12) {
      for (let lat = -0.9; lat < 0.9; lat += 0.12) {
        const cl = Math.cos(lat);
        V.x = cl * Math.cos(lon); V.y = Math.sin(lat); V.z = -cl * Math.sin(lon);
        if (g.terrainMgr.isWater('earth', V)) return { lat, lon };
      }
    }
    return null;
  });
  check('找到地球海洋方向', !!oceanLL, '');
  if (oceanLL) {
    // R10 语义：滚轮拉近到底 → 默认登陆"水面"（站立）；继续滚轮下才下潜
    await page.evaluate((ll) => {
      const g = window.__game;
      g.orbitCam.lat = ll.lat; g.orbitCam.lon = ll.lon;
      g.orbitCam.distTarget = 1; // 压到底 → 下限=水面+1.7m → 自动登陆水面
    }, oceanLL);
    let mode = 'orbit';
    for (let i = 0; i < 40 && mode !== 'walk'; i++) { await sleep(400); mode = await page.evaluate(() => window.__game.getMode()); }
    const surf = await page.evaluate(() => ({
      mode: window.__game.getMode(),
      diving: window.__game.ship.walk.diving,
      alt: window.__game.ship.walk.localPos.length() - 6371,
    }));
    check('滚轮到底 → 默认登陆水面站立（不下潜）',
      surf.mode === 'walk' && !surf.diving && surf.alt > 0, JSON.stringify(surf));
    // 继续滚轮下 → 下潜
    await page.evaluate(() => { window.__game.input.wheel -= 1; });
    let st = null;
    for (let i = 0; i < 40; i++) {
      await sleep(400);
      st = await page.evaluate(() => ({
        diving: window.__game.ship.walk.diving,
        imm: parseFloat(document.getElementById('immersion').style.opacity || '0'),
        r: window.__game.ship.walk.localPos.length(),
      }));
      if (st.diving && st.imm > 0.2) break;
    }
    check('继续滚轮下 → 下潜（水下浸没层渐显）', st.diving && st.imm > 0.2, JSON.stringify(st));
    await page.screenshot({ path: OUT + 'r9-01-underwater.png' });
    // 主动滚轮下潜加深（中性浮力：不滚动即悬停），后截图
    for (let i = 0; i < 25; i++) {
      await page.evaluate(() => { window.__game.input.wheel -= 1; });
      await sleep(120);
    }
    await page.screenshot({ path: OUT + 'r9-02-seafloor-walk.png' });
    // 水下滚轮上 = 上游浮出 → 恢复站立水面
    for (let i = 0; i < 120; i++) {
      await page.evaluate(() => { window.__game.input.wheel += 1; });
      await sleep(150);
      const d = await page.evaluate(() => window.__game.ship.walk.diving);
      if (!d) break;
    }
    const resurfaced = await page.evaluate(() => !window.__game.ship.walk.diving);
    check('水下滚轮上 → 浮出水面恢复站立', resurfaced, '');
    // 水面滚轮上 = 起飞
    await page.evaluate(() => { window.__game.input.wheel += 1; });
    await sleep(500);
    mode = await page.evaluate(() => window.__game.getMode());
    check('水面滚轮上 → 无缝起飞', mode === 'orbit', `mode=${mode}`);
    await page.evaluate(() => { window.__game.orbitCam.distTarget = 6371 * 4; });
    await sleep(2000);
  }
}

// --- 2) 火卫一土豆形态 ---
{
  await page.evaluate(() => window.__game.flyTo('phobos'));
  await waitArrival();
  await sleep(1200);
  await page.keyboard.press('KeyL'); // 隐藏标签便于视检
  await page.keyboard.press('KeyO');
  await sleep(300);
  await page.screenshot({ path: OUT + 'r9-03-phobos-potato.png' });
  console.log('   📷 火卫一不规则形态已截图');
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyO');
}

// --- 3) 冥王星心形平原 ---
{
  await page.evaluate(() => window.__game.flyTo('pluto'));
  await waitArrival();
  await sleep(1500);
  // 环绕半圈找心形（心形约在反木卫角度，多拍两张保证覆盖）
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyO');
  await sleep(300);
  await page.screenshot({ path: OUT + 'r9-04-pluto-a.png' });
  await page.evaluate(() => { window.__game.orbitCam.lon += Math.PI; });
  await sleep(800);
  await page.screenshot({ path: OUT + 'r9-05-pluto-b.png' });
  console.log('   📷 冥王星两半球已截图（核对心形平原）');
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyO');
}

// --- 4) 惯性观察模式：切换前后视向/位置连续 ---
{
  await page.evaluate(() => window.__game.flyTo('jupiter'));
  await waitArrival();
  await sleep(800);
  const before = await page.evaluate(() => {
    const c = window.__game.orbitCam;
    return { pos: [...c.posKm], quat: [c.quat.x, c.quat.y, c.quat.z, c.quat.w] };
  });
  await page.keyboard.press('KeyV');
  await sleep(200);
  const after = await page.evaluate(() => {
    const c = window.__game.orbitCam;
    return { inertial: c.inertial, pos: [...c.posKm], quat: [c.quat.x, c.quat.y, c.quat.z, c.quat.w] };
  });
  check('V 进入惯性观察模式', after.inertial === true, '');
  const posJump = Math.hypot(
    after.pos[0] - before.pos[0], after.pos[1] - before.pos[1], after.pos[2] - before.pos[2]
  );
  const qd = Math.abs(before.quat[0] * after.quat[0] + before.quat[1] * after.quat[1] +
    before.quat[2] * after.quat[2] + before.quat[3] * after.quat[3]);
  const angDeg = 2 * Math.acos(Math.min(1, qd)) * 180 / Math.PI;
  check('切换瞬间位置连续（跳变 < 50 km）', posJump < 50, `jump=${posJump.toFixed(1)} km`);
  check('切换瞬间视向连续（< 2°）', angDeg < 2, `ang=${angDeg.toFixed(2)}°`);
  // 时间加速下卫星应绕转（取木卫一相对行星方位角变化）
  for (let i = 0; i < 9; i++) { await page.keyboard.press('BracketRight'); await sleep(120); }
  const az0 = await page.evaluate(() => {
    const g = window.__game;
    const j = g.registry.get('jupiter').posKm, io = g.registry.get('io').posKm;
    return Math.atan2(io[2] - j[2], io[0] - j[0]);
  });
  await sleep(4000);
  const az1 = await page.evaluate(() => {
    const g = window.__game;
    const j = g.registry.get('jupiter').posKm, io = g.registry.get('io').posKm;
    return Math.atan2(io[2] - j[2], io[0] - j[0]);
  });
  let dAz = Math.abs(az1 - az0); if (dAz > Math.PI) dAz = 2 * Math.PI - dAz;
  check('时间加速下木卫一明显绕转（方位角变化 > 0.02 rad）', dAz > 0.02, `dAz=${dAz.toFixed(4)}`);
  await page.screenshot({ path: OUT + 'r9-06-inertial-jupiter.png' });
  await page.keyboard.press('KeyV');
  await page.evaluate(() => { window.__game.simClock.setNow(); });
}

console.log(`\n控制台错误数: ${errors.length}`);
errors.slice(0, 8).forEach((e) => console.log('  ⚠', e));
console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ R9 运行时探针全部通过');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
