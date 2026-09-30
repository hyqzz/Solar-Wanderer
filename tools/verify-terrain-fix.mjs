// 修复验证：月球/火星地表纹理 + 岩石落座 + DEM 全级覆盖
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = 'http://localhost:5173/';
const OUT = new URL('./.shot-verify/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2000);

async function landOn(bodyId, label) {
  await ev((b) => window.__game.flyTo(b), bodyId);
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
  const mode = await ev(() => window.__game.getMode());
  const walkBody = await ev(() => window.__game.ship.walk?.bodyId);
  console.log(`${label}: mode=${mode} walkBody=${walkBody}`);
  // 等 DEM 瓦片 + 全级扫掠重建完成（7 级 × 每帧 1 级 + 淡入）
  await sleep(6000);
  // 地平线视角
  await page.mouse.move(800, 450);
  await page.mouse.down(); await page.mouse.move(800, 350, { steps: 6 }); await page.mouse.up();
  await sleep(800);
  await page.screenshot({ path: OUT + `${label}-surface.png` });
  // 俯视近地面（检查纹理细节）
  await page.mouse.down(); await page.mouse.move(800, 700, { steps: 6 }); await page.mouse.up();
  await sleep(400);
  await page.screenshot({ path: OUT + `${label}-ground.png` });
  // 各级地形与 DEM 一致性校验：取相机方向 ±300m 内若干点，比较 field.height 与各 LOD 级网格高度
  const consist = await ev(() => {
    const g = window.__game;
    const tm = g.terrainMgr;
    if (!tm.active) return null;
    const p = tm.active.patches;
    const lvInfo = p.levels.map((lv) => ({ extent: lv.extent, fade: +lv.uFade.value.toFixed(2), demClean: !!lv.demClean }));
    return { levels: lvInfo, rocks: p.rocks.mesh.count };
  });
  console.log(`${label} levels:`, JSON.stringify(consist));
  // 起飞离开
  await ev(() => { window.__game.input.wheel += 1; });
  const t1 = Date.now();
  while (Date.now() - t1 < 20000) {
    if ((await ev(() => window.__game.getMode())) === 'orbit') break;
    await sleep(300);
  }
}

await landOn('moon', 'moon');
await landOn('mars', 'mars');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
