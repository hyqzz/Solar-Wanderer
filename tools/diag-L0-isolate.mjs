// L0 隔离渲染：隐藏其余级 + 岩石 + 本体球，独显 L0；再切 wireframe 看真实几何。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-audit/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,720', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 720 },
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
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => window.__game.flyTo('moon'));
await sleep(2500);
await page.waitForFunction(() => !window.__game.orbitCam.flight, { timeout: 90000 });
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = -59.8 * Math.PI / 180;
  g.orbitCam.lon = 0;
  g.orbitCam.distTarget = 1737.4 + 30;
});
await sleep(3000);
await page.mouse.move(800, 450);
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(110);
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
}
await sleep(3500);
await ev(() => { const g = window.__game; if (g.ship.walk) { g.ship.walk.yaw = 0; g.ship.walk.pitch = 0.1; } });
await sleep(800);

// 独显 L0：其余级 + 岩石 + 本体球网格全部隐藏
await ev(() => {
  const g = window.__game;
  const ps = g.terrainMgr.active.patches;
  ps.levels.forEach((lv, i) => { lv.mesh.visible = (i === 0); });
  ps.rocks.mesh.visible = false;
  g.builder.bodies.get('moon').mesh.visible = false;
});
await sleep(400);
await page.screenshot({ path: OUT + 'diag-L0-only.png' });
console.log('📷 diag-L0-only（独显 L0）');

// L0 线框
await ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  ps.levels[0].mat.wireframe = true;
});
await sleep(400);
await page.screenshot({ path: OUT + 'diag-L0-wire.png' });
console.log('📷 diag-L0-wire（L0 线框）');

// L0 的世界包围球与相机距离
const info = await ev(() => {
  const g = window.__game;
  const ps = g.terrainMgr.active.patches;
  const lv = ps.levels[0];
  lv.geo.computeBoundingSphere();
  const bs = lv.geo.boundingSphere;
  // mesh 世界矩阵
  lv.mesh.updateWorldMatrix(true, false);
  const e = lv.mesh.matrixWorld.elements;
  return {
    localSphere: { c: bs.center.toArray().map((v) => +v.toFixed(3)), r: +bs.radius.toFixed(3) },
    meshWorldPos: [e[12], e[13], e[14]].map((v) => +v.toFixed(2)),
    meshScale: lv.mesh.scale.toArray(),
    parentChain: (() => { let p = lv.mesh.parent, s = []; while (p) { s.push(p.type + (p.name ? ':' + p.name : '')); p = p.parent; } return s; })(),
  };
});
console.log('L0:', JSON.stringify(info, null, 1));
await browser.close();
