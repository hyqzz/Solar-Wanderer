// 日食阴影锥专项探测：2026-08-12 17:47 UTC 西班牙日全食。
// 1) 程序化断言阴影锥 visible/几何/透明度
// 2) 侧视截图（从黄道北极俯瞰地月系，锥应以暗楔可见）
// 3) 地表全食带视角截图（验证 MultiplyBlending 变暗效果）
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const URL_ = 'http://localhost:5173/?quality=high';
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
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);

// 跳到日食时刻
await ev(() => {
  const g = window.__game;
  const jdUT = Date.UTC(2026, 7, 12, 17, 47, 0) / 86400000 + 2440587.5;
  g.simClock.set(jdUT + 69.184 / 86400);
  g.simClock.paused = true;
});
await sleep(1000);

// 相机到地球附近（触发 distCam < 5e5 的锥渲染条件）
await ev(() => {
  const g = window.__game;
  g.flyTo('earth');
});
await sleep(3500);

// 断言阴影锥状态
const coneInfo = await ev(() => {
  const g = window.__game;
  const es = g.eclipseSystem;
  if (!es) return { error: 'no eclipseSystem on __game' };
  return es.cones.map((c) => c ? {
    type: c.type, occluder: c.occluderId, receiver: c.receiverId,
    visible: c.mesh.visible,
    scale: c.mesh.scale.toArray().map((v) => +v.toFixed(1)),
    umbraR: +c.mat.uniforms.uUmbraR.value.toFixed(1),
    penumbraR: +c.mat.uniforms.uPenumbraR.value.toFixed(1),
    opacity: c.mat.uniforms.uOpacity.value,
  } : null);
});
console.log('阴影锥状态:', JSON.stringify(coneInfo, null, 1));

// 侧视：从黄道北极上方俯瞰地月（相机 lat 拉高，距离 30 万 km）
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = 1.35;
  g.orbitCam.distTarget = 300000;
});
await sleep(3000);
await page.screenshot({ path: OUT + 'fix-eclipse-topdown.png' });
console.log('📷 fix-eclipse-topdown（俯瞰地月系）');

// 地表全食带：相机降到 200km 高，对着日下点略偏
await ev(() => {
  const g = window.__game;
  g.orbitCam.lat = 0.9;
  g.orbitCam.distTarget = 6371 + 200;
});
await sleep(3000);
await page.screenshot({ path: OUT + 'fix-eclipse-surface.png' });
console.log('📷 fix-eclipse-surface（全食带 200km）');

// 恢复实时钟
await ev(() => { window.__game.simClock.paused = false; window.__game.simClock.setNow(); });

if (errors.length) { console.log('错误:'); errors.forEach((e) => console.log('  🔥', e)); }
else console.log('零控制台/页面错误 ✅');
await browser.close();
