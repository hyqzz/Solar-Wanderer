// R10 运行时探针（浏览器端到端）：
// 1) 登陆→起飞回探索后，GE 键盘（WASD 平移 / Shift 旋转倾斜）必须生效；
// 2) 点击屏幕上的天体 = 锁定焦点（位置/视向连续）；
// 3) V 在可登陆天体（地球）上切换无镜头跳跃（浏览器侧复验）。
// 用法: node tools/probe-r10.mjs [url]

import puppeteer from 'puppeteer';

const PAGE_URL = process.argv[2] ?? 'http://localhost:5173/';
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

// --- 1) 登陆火星 → 起飞 → GE 键盘必须生效 ---
{
  await page.evaluate(() => window.__game.flyTo('mars'));
  await waitArrival();
  await sleep(800);
  await page.evaluate(() => { window.__game.orbitCam.distTarget = 1; });
  let mode = 'orbit';
  for (let i = 0; i < 50 && mode !== 'walk'; i++) { await sleep(400); mode = await page.evaluate(() => window.__game.getMode()); }
  check('登陆火星（前置）', mode === 'walk', `mode=${mode}`);
  // 起飞
  await page.evaluate(() => { window.__game.input.wheel += 1; });
  await sleep(600);
  mode = await page.evaluate(() => window.__game.getMode());
  check('起飞回探索（前置）', mode === 'orbit', `mode=${mode}`);
  // 拉高一些再测按键（避免贴地速率过小）
  await page.evaluate(() => { window.__game.orbitCam.distTarget = window.__game.orbitCam.dist + 500; });
  await sleep(1500);
  const s0 = await page.evaluate(() => {
    const c = window.__game.orbitCam;
    return { lat: c.lat, lon: c.lon, heading: c.heading, tilt: c.tilt, dist: c.dist };
  });
  await page.keyboard.down('KeyW');
  await sleep(1200);
  await page.keyboard.up('KeyW');
  const s1 = await page.evaluate(() => ({ lat: window.__game.orbitCam.lat }));
  check('起飞后 W 平移生效（纬度变化）', Math.abs(s1.lat - s0.lat) > 1e-4,
    `Δlat=${(s1.lat - s0.lat).toExponential(2)}`);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyA');
  await sleep(900);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ShiftLeft');
  const s2 = await page.evaluate(() => ({ heading: window.__game.orbitCam.heading }));
  check('起飞后 Shift+A 旋转航向生效', Math.abs(s2.heading - s0.heading) > 0.05,
    `Δheading=${(s2.heading - s0.heading).toFixed(3)}`);
  await page.keyboard.press('KeyR');
}

// --- 2) 点击天体锁定焦点（从月球轨道点击天空中的地球） ---
{
  await page.evaluate(() => window.__game.flyTo('moon'));
  await waitArrival();
  await sleep(1000);
  // 把地球中心投影到屏幕坐标后直接点击画布（隐藏标签防遮挡）
  await page.keyboard.press('KeyL');
  await sleep(200);
  const pos = await page.evaluate(() => {
    const g = window.__game;
    const v = g.registry.get('earth').relObj.position.clone().project(g.camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  });
  if (pos && pos.x > 0 && pos.x < 1600 && pos.y > 0 && pos.y < 900) {
    // 位置连续性以"相对地球"度量（地球公转 30 km/s）
    const relE = () => page.evaluate(() => {
      const c = window.__game.orbitCam;
      const e = window.__game.registry.get('earth').posKm;
      return {
        focus: c.focusId,
        pos: [c.posKm[0] - e[0], c.posKm[1] - e[1], c.posKm[2] - e[2]],
      };
    });
    const before = await relE();
    await page.mouse.click(pos.x, pos.y);
    // 注意：锚定地球体固系后，38 万 km 距离上随自转每秒扫过 ~28 km（设计行为）——
    // 连续性测量必须紧贴切换瞬间
    await sleep(80);
    const after = await relE();
    const jump = Math.hypot(
      after.pos[0] - before.pos[0], after.pos[1] - before.pos[1], after.pos[2] - before.pos[2]
    );
    check('点击地球 → 焦点锁定地球', after.focus === 'earth', `focus=${after.focus}`);
    check('焦点切换位置连续（< 5 km）', jump < 5, `jump=${jump.toFixed(2)} km`);
  } else {
    check('地球在屏幕内（点击拾取前置）', false, JSON.stringify(pos));
  }
  await page.keyboard.press('KeyL');
}

// --- 3) V 在地球上无跳跃（浏览器复验 _qf 修复） ---
{
  await page.evaluate(() => window.__game.flyTo('earth'));
  await waitArrival();
  await sleep(800);
  // 位置以"相对焦点"度量（地球公转 30 km/s，绝对坐标 250ms 自然移动 ~7.5 km）
  const rel = () => page.evaluate(() => {
    const c = window.__game.orbitCam;
    const e = window.__game.registry.get('earth').posKm;
    return {
      inertial: c.inertial,
      pos: [c.posKm[0] - e[0], c.posKm[1] - e[1], c.posKm[2] - e[2]],
      quat: [c.quat.x, c.quat.y, c.quat.z, c.quat.w],
    };
  });
  const b = await rel();
  await page.keyboard.press('KeyV');
  await sleep(250);
  const a = await rel();
  const jump = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
  const qd = Math.abs(b.quat[0] * a.quat[0] + b.quat[1] * a.quat[1] + b.quat[2] * a.quat[2] + b.quat[3] * a.quat[3]);
  const ang = 2 * Math.acos(Math.min(1, qd)) * 180 / Math.PI;
  check('地球按 V：位置连续（< 5 km）', a.inertial && jump < 5, `jump=${jump.toFixed(2)} km`);
  check('地球按 V：视向连续（< 2°）', ang < 2, `ang=${ang.toFixed(2)}°`);
  await page.keyboard.press('KeyV');
}

console.log(`\n控制台错误数: ${errors.length}`);
errors.slice(0, 8).forEach((e) => console.log('  ⚠', e));
console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ R10 运行时探针全部通过');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
