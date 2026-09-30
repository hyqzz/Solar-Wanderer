// 隔离测试：精确复现旅程 C 阶段后，逐个隐藏候选对象定位"天空浮石"
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

// 复现旅程：目录点火星 → 到达 → flyTo moon → 滚轮登陆
await ev(() => {
  const btns = [...document.querySelectorAll('#dir-body .dir-item')];
  const b = btns.find((x) => x.textContent.includes('火星'));
  if (b) b.click();
});
let t0 = Date.now();
while (Date.now() - t0 < 90000) {
  if (!(await ev(() => !!window.__game.orbitCam.flight))) break;
  await sleep(300);
}
await ev(() => window.__game.flyTo('moon'));
t0 = Date.now();
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
console.log('mode:', await ev(() => window.__game.getMode()), 'walkBody:', await ev(() => window.__game.ship.walk?.bodyId));
await sleep(2500);
// 旅程 05 视角：登陆后默认朝向（不抬头不低头）
await page.screenshot({ path: OUT + 'iso-baseline.png' });

// 环视 360° 抓浮石方向
for (let k = 0; k < 4; k++) {
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(800 + 380, 450, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  await page.screenshot({ path: OUT + `iso-pan-${k}.png` });
}

// 逐个隐藏候选对象
const candidates = await ev(() => {
  const g = window.__game;
  const list = [];
  if (g.terrainMgr.active?.patches?.rocks?.mesh) list.push({ id: 'rocks', obj: g.terrainMgr.active.patches.rocks.mesh });
  // 地标组（阿波罗/巡视器）挂在月球 mesh 下
  const moonEntry = g.builder.bodies.get('moon');
  moonEntry?.mesh.traverse((o) => { if (o.name && /apollo|rover|landmark|site/i.test(o.name)) list.push({ id: 'lmk:' + o.name, obj: o }); });
  window.__isoCands = list.map((c) => ({ id: c.id, obj: c.obj, vis: c.obj.visible }));
  return window.__isoCands.map((c) => c.id);
});
console.log('candidates:', JSON.stringify(candidates));

for (const id of candidates) {
  await ev((id) => {
    const c = window.__isoCands.find((x) => x.id === id);
    if (c) c.obj.visible = false;
  }, id);
  await sleep(200);
  await page.screenshot({ path: OUT + `iso-hide-${id.replace(/[^a-z0-9]/gi, '_')}.png` });
  await ev((id) => {
    const c = window.__isoCands.find((x) => x.id === id);
    if (c) c.obj.visible = c.vis;
  }, id);
}

// 额外：把相机方向上的浮石用射线拾取确认身份
const picked = await ev(() => {
  const g = window.__game;
  const THREERay = g.camera;
  // 从相机向地平线附近多个方向发射线（屏幕上半部分逐列采样）
  const results = [];
  const scene = (() => { let p = g.registry.get('moon').relObj; while (p.parent) p = p.parent; return p; })();
  const raycaster = new (Object.getPrototypeOf(scene).constructor === Object ? null : null)() ?? null;
  return 'need-three';
});
console.log('raycast placeholder:', picked);

await browser.close();
console.log('done');
