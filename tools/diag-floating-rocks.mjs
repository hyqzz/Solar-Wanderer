// 诊断：月面行走时天空中悬浮的灰色岩石是什么？
// 策略：登陆月球 → 截图 → 隐藏 RockField → 再截图 → 对比；
// 并 dump RockField 实例的世界坐标（相机系）验证位置正确性。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./.shot-diag/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1600,900', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
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
page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2000);

// 直飞月球并滚轮登陆
await ev(() => window.__game.flyTo('moon'));
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  if (!(await ev(() => !!window.__game.orbitCam.flight))) break;
  await sleep(300);
}
await page.mouse.move(800, 450);
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
console.log('mode:', await ev(() => window.__game.getMode()));
await sleep(2500);
await page.screenshot({ path: OUT + 'moon-walk-rocks-visible.png' });

// 找到 RockField 实例网格并分析
const rockInfo = await ev(() => {
  const g = window.__game;
  const tm = g.terrainMgr;
  const out = { active: tm.active?.bodyId, found: false };
  if (!tm.active) return out;
  const patches = tm.active.patches;
  const rocks = patches.rocks;
  out.found = true;
  out.count = rocks.mesh.count;
  out.meshPos = rocks.mesh.position.toArray();
  // 世界坐标：mesh 在世界中的位置（相机相对，浮动原点）
  rocks.mesh.updateWorldMatrix(true, false);
  const wp = new (rocks.mesh.position.constructor)();
  rocks.mesh.getWorldPosition(wp);
  out.meshWorldPos = wp.toArray();
  // 前 5 个实例的世界坐标
  const m = new (rocks.mesh.instanceMatrix.constructor === Float32Array ? Object : Object)();
  const arr = rocks.mesh.instanceMatrix.array;
  out.samples = [];
  for (let i = 0; i < Math.min(5, rocks.mesh.count); i++) {
    const o = i * 16;
    // 实例矩阵的平移分量（原点相对）
    out.samples.push({
      local: [arr[o + 12], arr[o + 13], arr[o + 14]],
      scale: [Math.hypot(arr[o], arr[o+1], arr[o+2])],
    });
  }
  // 相机到 mesh 世界位置的距离
  out.meshWorldDistKm = wp.length();
  return out;
});
console.log('rockInfo:', JSON.stringify(rockInfo, null, 1));

// 隐藏岩石层再截图对比
await ev(() => {
  const tm = window.__game.terrainMgr;
  if (tm.active) tm.active.patches.rocks.mesh.visible = false;
});
await sleep(300);
await page.screenshot({ path: OUT + 'moon-walk-rocks-hidden.png' });

// 抬头看天空（判断悬浮物是否随视角保持在天顶附近/还是固定在地平线）
await ev(() => { const tm = window.__game.terrainMgr; if (tm.active) tm.active.patches.rocks.mesh.visible = true; });
await page.mouse.move(800, 450);
await page.mouse.down();
await page.mouse.move(800, 150, { steps: 10 }); // 抬头
await page.mouse.up();
await sleep(600);
await page.screenshot({ path: OUT + 'moon-walk-lookup.png' });

// dump 相机附近所有渲染对象（按世界距离排序），找出天空中的灰色块状物
const near = await ev(() => {
  const g = window.__game;
  const res = [];
  const scene = g.builder.sunEntry.group.parent ?? g.builder.sunEntry.group;
  // 从 canvas 所属 scene 遍历：用 registry 的 relObj 找根
  const root = (() => { let p = g.registry.get('moon').relObj; while (p.parent) p = p.parent; return p; })();
  root.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const wp = o.getWorldPosition(new o.position.constructor());
    const d = wp.length();
    if (d < 5000) { // 5000 km 内
      res.push({ name: o.name || o.type, parent: o.parent?.name, d: +d.toFixed(3), count: o.count ?? undefined, isInst: !!o.isInstancedMesh });
    }
  });
  return res.sort((a, b) => a.d - b.d).slice(0, 30);
});
console.log('nearby meshes (<5000km):', JSON.stringify(near, null, 1));

await browser.close();
