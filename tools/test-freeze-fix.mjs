// 冻结 bug 回归测试（用户报告："飞往某个星球会卡住不动，鼠标滚动远离也会卡住不动"）
// 验证：
//   1. 应用加载后画布持续渲染（帧间像素变化）
//   2. 飞往星球（Digit5=木星）过程中及到达后画布仍渲染
//   3. 鼠标滚轮缩放（远离/接近）后画布仍渲染
//   4. 控制台无致命错误（loop 区段错误会被 try-catch 捕获并报告）
// 用法: node tools/test-freeze-fix.mjs [url]

import puppeteer from 'puppeteer';

const PAGE_URL = process.argv[2] ?? 'http://localhost:5176/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 15000,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,800', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
const consoleLogs = [];
const pageErrors = [];
page.on('console', (m) => {
  consoleLogs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => pageErrors.push(e.message));

let pass = 0, fail = 0;
const ok = (msg) => { console.log('  ✅ ' + msg); pass++; };
const bad = (msg) => { console.error('  ❌ ' + msg); fail++; };

/**
 * 采样画布：返回中心区域像素 hash。
 * 连续两次采样不同 → 画布在渲染（未冻结）。
 */
async function canvasHash() {
  return page.evaluate(() => {
    const c = document.getElementById('app');
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    if (!ctx) return 'no-ctx';
    // 读取中心 32×32 区域的像素
    const w = c.width, h = c.height;
    const px = new Uint8Array(32 * 32 * 4);
    ctx.readPixels(
      Math.floor(w / 2 - 16), Math.floor(h / 2 - 16), 32, 32,
      ctx.RGBA || 0x1908, ctx.UNSIGNED_BYTE || 0x1401, px
    );
    // 简单 hash：每隔 4 字节取一个值
    let hash = 0;
    for (let i = 0; i < px.length; i += 16) {
      hash = ((hash * 31) + px[i]) | 0;
    }
    return hash;
  });
}

/**
 * 验证画布在 ~1s 内有变化（正在渲染，未冻结）。
 */
async function assertRendering(label) {
  const h1 = await canvasHash();
  await sleep(600);
  const h2 = await canvasHash();
  await sleep(600);
  const h3 = await canvasHash();
  const changed = h1 !== h2 || h2 !== h3 || h1 !== h3;
  if (changed) ok(`画布持续渲染（${label}）：帧 ${h1}→${h2}→${h3}`);
  else bad(`画布冻结（${label}）：三帧相同 ${h1}→${h2}→${h3}`);
  return changed;
}

console.log('冻结 bug 回归测试');
console.log('目标:', PAGE_URL);

// ── 1. 加载应用 ──
console.log('\n[1] 加载应用');
await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 30000 });
console.log('  DOM 加载完成，等待 init() ...');
// init() 是重同步操作（构建太阳系），等待它完成
await sleep(15000);

let inited = false;
try {
  inited = await page.evaluate(() => !!window.__game);
} catch (e) {
  console.log('  evaluate 超时（主线程仍忙碌）:', e.message?.slice(0, 80));
}
if (inited) {
  ok('init() 完成（window.__game 就绪）');
} else {
  // 再等待 30s
  console.log('  再等待 30s...');
  await sleep(30000);
  try {
    inited = await page.evaluate(() => !!window.__game);
  } catch (e) {
    console.log('  evaluate 再次超时:', e.message?.slice(0, 80));
  }
  if (inited) ok('init() 完成（延迟）');
  else {
    bad('init() 未完成');
    console.log('\n  控制台日志:');
    consoleLogs.slice(-20).forEach(l => console.log('    ' + l));
    console.log('\n  页面错误:');
    pageErrors.slice(0, 10).forEach(e => console.error('    ' + e));
    await browser.close();
    process.exit(1);
  }
}

// 点击开始按钮
try { await page.evaluate(() => document.getElementById('start-btn').click()); } catch {}
await sleep(3000);

// ── 2. 初始渲染检查 ──
console.log('\n[2] 初始渲染检查');
await assertRendering('初始状态');

// ── 3. 飞往木星（Digit5）── 用户报告"飞往某个星球，会卡住不动" ──
console.log('\n[3] 飞往木星（Digit5）');
const beforeFly = await page.evaluate(() => ({
  focus: window.__game.orbitCam.focusId,
  flight: !!window.__game.orbitCam.flight,
}));
console.log('  飞行前:', JSON.stringify(beforeFly));
await page.keyboard.press('Digit5');
await sleep(1000);
const duringFly = await page.evaluate(() => ({
  flight: !!window.__game.orbitCam.flight,
  to: window.__game.orbitCam.flight?.toId,
}));
console.log('  飞行中:', JSON.stringify(duringFly));
if (duringFly.flight && duringFly.to === 'jupiter') ok('飞行动画已启动（→木星）');
else bad('飞行动画未启动');

await assertRendering('飞往木星途中');

// 等待到达
const t0 = Date.now();
let arrived = false;
while (Date.now() - t0 < 60000) {
  try {
    const f = await page.evaluate(() => !!window.__game.orbitCam.flight);
    if (!f) { arrived = true; break; }
  } catch { /* 主线程忙，重试 */ }
  await sleep(1000);
}
if (arrived) ok(`到达木星（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
else bad('飞往木星超时（60s 未到达）');
await sleep(1000);

await assertRendering('到达木星后');

// ── 4. 鼠标滚轮缩放（远离）── 用户报告"鼠标滚动远离，也会卡住不动" ──
console.log('\n[4] 鼠标滚轮缩放（远离）');
const distBefore = await page.evaluate(() => window.__game.orbitCam.dist);
console.log('  缩放前距离:', distBefore.toFixed(1), 'km');
for (let i = 0; i < 20; i++) {
  await page.mouse.wheel({ deltaY: 120 });
  await sleep(50);
}
await sleep(500);
const distAfter = await page.evaluate(() => window.__game.orbitCam.dist);
console.log('  缩放后距离:', distAfter.toFixed(1), 'km');
if (distAfter > distBefore) ok('滚轮远离生效（距离增大）');
else bad('滚轮远离无效（距离未增大）');

await assertRendering('滚轮远离后');

// ── 5. 鼠标滚轮缩放（接近）──
console.log('\n[5] 鼠标滚轮缩放（接近）');
const distBefore2 = await page.evaluate(() => window.__game.orbitCam.dist);
for (let i = 0; i < 20; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await sleep(50);
}
await sleep(500);
const distAfter2 = await page.evaluate(() => window.__game.orbitCam.dist);
console.log('  接近前:', distBefore2.toFixed(1), '→ 接近后:', distAfter2.toFixed(1));
if (distAfter2 < distBefore2) ok('滚轮接近生效（距离减小）');
else bad('滚轮接近无效（距离未减小）');

await assertRendering('滚轮接近后');

// ── 6. 飞往地球（Digit3）── 连续飞行不冻结 ──
console.log('\n[6] 再次飞往地球（Digit3）');
await page.keyboard.press('Digit3');
await sleep(1000);
await assertRendering('飞往地球途中');
const t1 = Date.now();
let arrived2 = false;
while (Date.now() - t1 < 60000) {
  try {
    const f = await page.evaluate(() => !!window.__game.orbitCam.flight);
    if (!f) { arrived2 = true; break; }
  } catch {}
  await sleep(1000);
}
if (arrived2) ok('到达地球');
else bad('飞往地球超时');
await sleep(1000);
await assertRendering('到达地球后');

// ── 7. 检查控制台错误 ──
console.log('\n[7] 控制台错误检查');
if (pageErrors.length === 0) ok('无未捕获异常（pageerror=0）');
else { bad(`${pageErrors.length} 个未捕获异常:`); pageErrors.slice(0, 5).forEach(e => console.error('    ' + e)); }

const loopErrs = consoleLogs.filter(l => /\[(builder|comets|tnoScene|voyagers|modeUpdate|world|postWorldUpdate|terrain|atmoFog|uiKeys|hud|fpsGuard|input|composer|audioEngine|compass|scaleRef|eclipseSystem|webxr)\]/.test(l));
if (loopErrs.length === 0) ok('无 loop 区段错误');
else { console.log('  ⚠️  loop 区段错误（已被 try-catch 捕获）:'); loopErrs.slice(0, 5).forEach(e => console.log('    ' + e)); }

// ── 汇总 ──
console.log('\n════════════════════════════════════');
console.log(`  通过: ${pass}  失败: ${fail}`);
console.log('════════════════════════════════════');
if (fail > 0) { console.error('\n❌ 测试失败'); process.exitCode = 1; }
else console.log('\n✅ 全部通过：无冻结，画布持续渲染');

await browser.close();
