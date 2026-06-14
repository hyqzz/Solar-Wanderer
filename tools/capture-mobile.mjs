// 捕获移动端真机视角截图（iPhone 14 Pro 视口 + 触控媒体），用于 v2.0.0 推广。
// 输出真实的 v2.0.0 移动 UI（常驻时间标签、底部 ☰、动作抽屉）叠在天体画面上。
// 用法：dev server 运行后 `node tools/capture-mobile.mjs`，输出到 docs/promotion/mobile-shots/。
import puppeteer from 'puppeteer';
import { mkdirSync, rmSync } from 'node:fs';

const OUT = new URL('../docs/promotion/mobile-shots/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
try { rmSync(OUT, { recursive: true, force: true }); } catch {}
mkdirSync(OUT, { recursive: true });

const W = 390, H = 844;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--window-size=${W},${H}`, '--hide-scrollbars', '--lang=zh-CN'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
});
const page = await browser.newPage();
await page.emulateTimezone('UTC');
page.on('pageerror', (e) => console.log('PAGEERR', e.message));

// 强制 coarse pointer + 触控检测，触发移动 UI
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  const orig = window.matchMedia;
  window.matchMedia = (q) => q === '(pointer: coarse)'
    ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
    : orig(q);
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
const startBtn = await page.$('#start-btn');
await startBtn.tap();
await sleep(3500);

let n = 0;
async function shot(name) {
  const file = OUT + `${String(++n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('📱', file);
}

// 把相机放到某天体（subsolar 受光面）
async function place(id, distMul, lat = 12) {
  await page.evaluate(({ id, distMul, lat }) => {
    const g = window.__game;
    const e = g.builder.bodies.get(id);
    const oc = g.orbitCam;
    oc.flight = null; oc.focusId = id;
    oc.vLat = oc.vLon = 0; oc.heading = 0; oc.tilt = 0; oc.panOffset.set(0, 0, 0);
    const V3 = Object.getPrototypeOf(e.mesh.position).constructor;
    const d = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
    const v = new V3(-e.posKm[0] / d, -e.posKm[1] / d, -e.posKm[2] / d);
    v.applyQuaternion(e.mesh.quaternion.clone().invert());
    oc.lat = Math.asin(Math.max(-1, Math.min(1, v.y)));
    oc.lon = Math.atan2(-v.z, v.x);
    oc.lat = lat * Math.PI / 180;
    oc.dist = oc.distTarget = e.phys.radiusKm * distMul;
  }, { id, distMul, lat });
  await sleep(900);
}

// 1) Earth — 蓝色弧光 + 移动 HUD
await place('earth', 1.9, 10);
await shot('earth');

// 2) Saturn — 环 + 移动 HUD
await place('saturn', 3.0, 16);
await shot('saturn');

// 3) Jupiter — 云带
await place('jupiter', 2.2, 8);
await shot('jupiter');

// 4) 打开目录底部抽屉（点 ☰ tc-menu-btn）
try {
  await page.tap('#tc-menu-btn');
  await sleep(600);
  await shot('directory');
  await page.tap('#tc-menu-btn');
  await sleep(300);
} catch (e) { console.log('directory shot skipped:', e.message); }

// 5) 展开时间标签
try {
  await page.tap('#tc-time-btn');
  await sleep(500);
  await place('mars', 2.4, 12);
  await shot('time-mars');
} catch (e) { console.log('time shot skipped:', e.message); }

console.log(`\n✅ ${n} mobile shots → ${OUT}`);
await browser.close();
