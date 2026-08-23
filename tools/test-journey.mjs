// 全覆盖用户旅程测试：站在真实用户角度完整走一遍所有功能。
// 每个阶段含断言 + 截图（tools/.shot-journey/），任何报错/失败都计入失败清单。
// 用法：node tools/test-journey.mjs [url]   默认 http://localhost:5173/
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./.shot-journey/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1600,900', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log('  ✅ ' + name);
  else { console.error(`  ❌ ${name} ${detail}`); fails.push(name + (detail ? ` (${detail})` : '')); }
};
const shot = (name) => page.screenshot({ path: OUT + name + '.png' });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
async function waitArrival(timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!(await ev(() => !!window.__game.orbitCam.flight))) return true;
    await sleep(300);
  }
  return false;
}
async function wheelToLand(maxTicks = 90) {
  // 真实用户行为：滚轮连续拉近直到自动登陆（distTarget 直达法不会触发，需滚轮手势驱动）
  await page.mouse.move(800, 450);
  for (let i = 0; i < maxTicks; i++) {
    await page.mouse.wheel({ deltaY: -240 });
    await sleep(110);
    if ((await ev(() => window.__game.getMode())) === 'walk') return true;
  }
  return false;
}
async function waitMode(m, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if ((await ev(() => window.__game.getMode())) === m) return true;
    await sleep(300);
  }
  return false;
}

// ════════════ A. 启动与首屏 ════════════
console.log('\n═══ A. 启动与首屏 ═══');
const t0 = Date.now();
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
const tInteractive = Date.now() - t0;
check(`启动按钮解锁（${tInteractive}ms，要求 <15000ms）`, tInteractive < 15000, `${tInteractive}ms`);
await shot('01-start-screen');
await page.click('#start-btn');
await sleep(2500);
check('进入后启动屏隐藏', await ev(() => document.getElementById('start').style.display === 'none'));
check('场景注册表 >60 个天体', await ev(() => window.__game.registry.size > 60));
check('默认焦点为地球', await ev(() => window.__game.orbitCam.focusId === 'earth'));
await shot('02-earth-default');

// ════════════ B. 探索模式基础交互 ════════════
console.log('\n═══ B. 探索模式 ═══');
const labelCount = await ev(() => document.querySelectorAll('.body-label, #labels *').length);
check('标签层渲染（>10 个元素）', labelCount > 10, `count=${labelCount}`);
const lonBefore = await ev(() => window.__game.orbitCam.lon);
await page.mouse.move(800, 450);
await page.mouse.down();
await page.mouse.move(1000, 400, { steps: 10 });
await page.mouse.up();
await sleep(400);
const lonAfter = await ev(() => window.__game.orbitCam.lon);
check('左键拖拽旋转视角', Math.abs(lonAfter - lonBefore) > 0.01, `Δlon=${(lonAfter - lonBefore).toFixed(4)}`);
const dBefore = await ev(() => window.__game.orbitCam.distTarget);
await page.mouse.wheel({ deltaY: -480 });
await sleep(400);
const dAfter = await ev(() => window.__game.orbitCam.distTarget);
check('滚轮拉近（distTarget 减小）', dAfter < dBefore, `${dBefore.toExponential(1)}→${dAfter.toExponential(1)}`);
await page.mouse.wheel({ deltaY: 480 });
await sleep(300);
const clicked = await ev(() => {
  const btns = [...document.querySelectorAll('#dir-body .dir-item')];
  const b = btns.find((x) => x.textContent.includes('火星'));
  if (b) { b.click(); return true; }
  return false;
});
check('目录中找到并点击"火星"', clicked);
await sleep(300);
check('飞行动画启动', await ev(() => !!window.__game.orbitCam.flight));
await waitArrival();
check('到达火星（focusId=mars）', await ev(() => window.__game.orbitCam.focusId === 'mars'));
await sleep(600);
await shot('03-mars-arrival');
await page.keyboard.press('KeyO'); await sleep(200);
await page.keyboard.press('KeyL'); await sleep(200);
const labelsHidden = await ev(() => {
  const el = document.getElementById('labels');
  return el && (el.style.display === 'none' || el.offsetParent === null);
});
check('L 关闭标签', labelsHidden);
await page.keyboard.press('KeyL'); await sleep(200);
await page.keyboard.press('KeyK'); await sleep(200);
await page.keyboard.press('KeyH'); await sleep(300);
check('H 打开帮助', await ev(() => document.getElementById('help').style.display !== 'none'));
await shot('04-help');
await page.keyboard.press('KeyH'); await sleep(200);
check('H 关闭帮助', await ev(() => document.getElementById('help').style.display === 'none'));

// ════════════ C. 月球登陆与行走（DEM 验证） ════════════
console.log('\n═══ C. 月球登陆行走 ═══');
await ev(() => window.__game.flyTo('moon'));
await waitArrival();
const walked = await wheelToLand();
console.log('  [诊断] C 阶段落点:', await ev(() => window.__game.ship.walk?.bodyId), 'focus:', await ev(() => window.__game.orbitCam.focusId));
check('滚轮连续拉近自动登陆月球（walk 模式）', walked && await ev(() => window.__game.ship.walk?.bodyId === 'moon'), 'walkBody 应为 moon');
await sleep(2500);
await shot('05-moon-surface');
const demState = await ev(() => {
  const src = window.__game.terrainMgr.demSources.get('moon');
  return src ? { offline: src.isOffline, cached: src.cache.size } : null;
});
check('月球 DEM 源在线且瓦片已缓存', demState && !demState.offline && demState.cached > 0, JSON.stringify(demState));
const posBefore = await ev(() => [...window.__game.ship.posKm]);
await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
const posAfter = await ev(() => [...window.__game.ship.posKm]);
const moved = Math.hypot(posAfter[0] - posBefore[0], posAfter[1] - posBefore[1], posAfter[2] - posBefore[2]);
check('W 键行走移动', moved > 0.0005, `位移 ${(moved * 1000).toFixed(2)}m`);
await page.keyboard.press('Space'); await sleep(300);
await page.keyboard.press('KeyY'); await sleep(400);
check('Y 显示人体剪影', await ev(() => !!window.__game.scaleRef._human));
await shot('06-moon-walk-human');
await page.keyboard.press('KeyY'); await sleep(200);
await ev(() => { window.__game.input.wheel += 1; });
check('滚轮后退起飞回探索模式', await waitMode('orbit', 20000));

// ════════════ D. 火星登陆（DEM + 大气） ════════════
console.log('\n═══ D. 火星登陆 ═══');
await ev(() => window.__game.flyTo('mars'));
await waitArrival();
const walkedMars = await wheelToLand();
console.log('  [诊断] D 阶段落点:', await ev(() => window.__game.ship.walk?.bodyId), 'focus:', await ev(() => window.__game.orbitCam.focusId));
check('火星自动登陆', walkedMars && await ev(() => window.__game.ship.walk?.bodyId === 'mars'), 'walkBody 应为 mars');
await sleep(2500);
await shot('07-mars-surface');
const demMars = await ev(() => {
  const src = window.__game.terrainMgr.demSources.get('mars');
  return src ? { offline: src.isOffline, cached: src.cache.size } : null;
});
check('火星 DEM 源在线且瓦片已缓存', demMars && !demMars.offline && demMars.cached > 0, JSON.stringify(demMars));
await ev(() => { window.__game.input.wheel += 1; });
await waitMode('orbit', 20000);

// ════════════ E. 自由飞行模式 ════════════
console.log('\n═══ E. 自由飞行 ═══');
await page.keyboard.press('KeyF'); await sleep(500);
check('F 进入飞行模式', await ev(() => window.__game.getMode() === 'fly'));
const flyBefore = await ev(() => [...window.__game.ship.posKm]);
await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW');
const flyAfter = await ev(() => [...window.__game.ship.posKm]);
const flyMoved = Math.hypot(flyAfter[0] - flyBefore[0], flyAfter[1] - flyBefore[1], flyAfter[2] - flyBefore[2]);
check('飞行 W 推进位移', flyMoved > 1e-6, `Δ=${flyMoved.toExponential(1)}km`);
await page.mouse.wheel({ deltaY: -600 }); await sleep(400);
check('滚轮调速无报错', errors.length === 0);
await page.keyboard.press('KeyX'); await sleep(200);
// headless 环境无真实指针锁定，Esc 退出链路（pointerlockchange→switchToOrbit）无法在软渲染下复现；
// 真实浏览器 Esc 可用。这里验证 F 往返切换（fly 模式下的官方退出键）。
await page.keyboard.press('KeyF'); await sleep(500);
check('F 从飞行模式切回探索模式', await ev(() => window.__game.getMode() === 'orbit'));

// ════════════ F. 时间系统 ════════════
console.log('\n═══ F. 时间系统 ═══');
const rate0 = await ev(() => window.__game.simClock.rateTarget);
await page.keyboard.press('BracketRight'); await sleep(200);
const rate1 = await ev(() => window.__game.simClock.rateTarget);
check('] 加速时间', rate1 > rate0, `${rate0}→${rate1}`);
await page.keyboard.press('BracketLeft'); await sleep(200);
check('[ 减速时间', await ev(() => window.__game.simClock.rateTarget) === rate0);
await page.keyboard.press('KeyP'); await sleep(200);
const jdA = await ev(() => window.__game.simClock.jdTT);
await sleep(700);
const jdB = await ev(() => window.__game.simClock.jdTT);
check('P 暂停（jdTT 冻结）', jdA === jdB);
await shot('08-time-paused');
await page.keyboard.press('KeyN'); await sleep(200);
const resumed = await ev(() => ({ rateT: window.__game.simClock.rateTarget, paused: window.__game.simClock.paused }));
check('N 回到现在（rateTarget=1, 未暂停）', resumed.rateT === 1 && !resumed.paused);

// ════════════ G. 导览（真实 UI 点击） ════════════
console.log('\n═══ G. 导览 ═══');
const tourClicked = await ev(() => {
  const dets = [...document.querySelectorAll('#dir-body details')];
  const tourDet = dets.find((d) => d.querySelector('summary')?.textContent.includes('导览'));
  if (!tourDet) return false;
  tourDet.open = true;
  tourDet.querySelector('.dir-item')?.click();
  return true;
});
check('目录导览分组存在并可点击', tourClicked);
await sleep(600);
check('导览激活', await ev(() => window.__game.tourSystem.isActive));
check('导览控制条出现', await ev(() => document.getElementById('tour-bar')?.style.display !== 'none'));
const cpIdx0 = await ev(() => window.__game.tourSystem.checkpointIndex);
await ev((i) => document.getElementById('tour-bar-next')?.click(), cpIdx0);
await sleep(400);
check('控制条下一站推进', await ev((i) => window.__game.tourSystem.checkpointIndex === i + 1, cpIdx0));
await shot('09-tour-active');
await ev(() => document.getElementById('tour-bar-exit')?.click());
await sleep(400);
check('退出导览（状态清理 + 控制条隐藏）', await ev(() => !window.__game.tourSystem.isActive && document.getElementById('tour-bar').style.display === 'none'));

// ════════════ H. 书签/指南针/音频/惯性/分享 ════════════
console.log('\n═══ H. 辅助功能 ═══');
const bm0 = await ev(() => window.__game.bookmarks.list().length);
await page.keyboard.down('Control'); await page.keyboard.press('KeyB'); await page.keyboard.up('Control');
await sleep(300);
check('Ctrl+B 保存书签', await ev((n) => window.__game.bookmarks.list().length === n + 1, bm0));
const tipShown = await ev(() => document.getElementById('hud-tip').textContent.includes('书签'));
check('书签提示可见（2.5s 窗口修复生效）', tipShown);
await ev(() => { window.__game.orbitCam.dist *= 10; window.__game.orbitCam.distTarget *= 10; });
await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyB'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
await sleep(300);
check('Ctrl+Shift+B 还原书签视角', await ev(() => window.__game.orbitCam.dist < 1e8));
const comp0 = await ev(() => window.__game.compass.visible);
await page.keyboard.press('KeyC'); await sleep(200);
check('C 指南针开关', await ev((v) => window.__game.compass.visible !== v, comp0));
const audio0 = await ev(() => window.__game.audioEngine._enabled);
await page.keyboard.press('KeyM'); await sleep(300);
check('M 音频开关', await ev((v) => window.__game.audioEngine._enabled !== v, audio0));
await page.keyboard.press('KeyM'); await sleep(200);
await waitArrival(); // 导览退出的 flyTo 可能仍在进行，先等到位（V 在飞行中不响应是设计行为）
const iner0 = await ev(() => window.__game.orbitCam.inertial);
await page.keyboard.press('KeyV'); await sleep(300);
check('V 惯性观察开关', await ev((v) => window.__game.orbitCam.inertial !== v, iner0));
await page.keyboard.press('KeyV'); await sleep(200);
await page.keyboard.down('Control'); await page.keyboard.press('KeyL'); await page.keyboard.up('Control');
await sleep(300);
check('Ctrl+L 分享链接无报错', errors.length === 0);

// ════════════ I. 资源加载与高清升级 ════════════
console.log('\n═══ I. 资源与渐进加载 ═══');
await page.waitForFunction(() => {
  const el = document.getElementById('hud-bgload');
  return el && (el.style.display === 'none' || el.style.opacity === '0');
}, { timeout: 240000 });
const hdState = await ev(() => {
  const c = window.__game.builder.cache;
  return { earth: c.get('earth_day.jpg')?.image?.width ?? 0, moon: c.get('moon.jpg')?.image?.width ?? 0 };
});
check('高清贴图后台升级到位（earth/moon = 8192）', hdState.earth === 8192 && hdState.moon === 8192, JSON.stringify(hdState));
check('真实小天体层加载（5412 颗）', await ev(() => window.__game.smallBodies.count === 5412));

// ════════════ J. 视觉场景截图集（供人工审查） ════════════
console.log('\n═══ J. 视觉场景截图 ═══');
await ev(() => window.__game.flyTo('jupiter')); await waitArrival(); await sleep(800);
await shot('10-jupiter');
await ev(() => window.__game.flyTo('saturn')); await waitArrival(); await sleep(800);
await shot('11-saturn');
await ev(() => window.__game.flyTo('sun')); await waitArrival();
await ev(() => { window.__game.orbitCam.distTarget = 696340 * 3; });
await sleep(2500);
await shot('12-sun-closeup');
await ev(() => window.__game.flyTo('earth')); await waitArrival();
await ev(() => { window.__game.orbitCam.lon += Math.PI; window.__game.orbitCam.lat = 0.3; });
await sleep(2000);
await shot('13-earth-night');
await ev(() => { window.__game.select('sun'); window.__game.orbitCam.distTarget = 3e12; });
await sleep(4000);
await shot('14-deep-space');
await ev(() => window.__game.flyTo('venus')); await waitArrival(); await sleep(600);
await shot('15-venus');

// ════════════ K. 性能（软渲染下仅作"未冻结"参考） ════════════
console.log('\n═══ K. 性能 ═══');
await ev(() => window.__game.flyTo('earth')); await waitArrival(); await sleep(500);
const fps = await ev(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(n / 3); };
  requestAnimationFrame(tick);
}));
console.log(`  ℹ️  软渲染 FPS ≈ ${fps.toFixed(1)}（swiftshader 软渲染，真实 GPU 会高一个数量级）`);
check('渲染循环未冻结（FPS > 3）', fps > 3, `fps=${fps.toFixed(1)}`);

// ════════════ L. 二次访问：IndexedDB 命中 ════════════
console.log('\n═══ L. 二次访问缓存 ═══');
const t1 = Date.now();
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
const tSecond = Date.now() - t1;
const texReqs = await ev(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/textures/') && !r.name.includes('preview') && !r.name.includes('manifest')).length);
check(`二次访问快速解锁（${tSecond}ms <8000ms）`, tSecond < 8000, `${tSecond}ms`);
check('二次访问全尺寸贴图零网络请求（IndexedDB 命中）', texReqs === 0, `requests=${texReqs}`);

// ════════════ 汇总 ════════════
console.log('\n═══════════════════════════════');
if (errors.length) { console.log('控制台/页面错误:'); errors.forEach((e) => console.log('  🔥 ' + e)); }
if (fails.length) { console.log('失败用例:'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log(`结果：${fails.length === 0 && errors.length === 0 ? '全部通过 ✅' : '存在问题 ❌'}`);
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
