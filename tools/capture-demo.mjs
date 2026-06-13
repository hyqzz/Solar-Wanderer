// 捕获电影感演示序列：逐帧确定性驱动相机 → PNG 帧 → ffmpeg 合成 GIF/MP4。
// 用法：dev server 运行后 `node tools/capture-demo.mjs`，输出帧到 docs/promotion/demo-frames/。
import puppeteer from 'puppeteer';
import { mkdirSync, rmSync } from 'node:fs';

const OUT = new URL('../docs/promotion/demo-frames/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
try { rmSync(OUT, { recursive: true, force: true }); } catch {}
mkdirSync(OUT, { recursive: true });

const W = 1280, H = 720;
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--window-size=${W},${H}`, '--hide-scrollbars'],
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('#start-btn', { visible: true, timeout: 120000 });
await page.click('#start-btn');
await sleep(2500);

// 隐藏 UI 叠层（更干净的画面）
await page.evaluate(() => {
  for (const id of ['hud', 'left-col', 'labels']) {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  }
});
// 关闭轨道线（O 键）—— 干净的纯天体画面
await page.keyboard.press('KeyO');
await sleep(400);

let frame = 0;
async function shot() {
  await page.screenshot({ path: OUT + `f${String(frame).padStart(4, '0')}.png` });
  frame++;
}

// 定位到天体：focus + 体固经纬 + 距离（subsolar 朝向受光面）
async function place(id, dist, { lat = 12, lon = null, subsolar = true } = {}) {
  await page.evaluate(({ id, dist, lat, lon, subsolar }) => {
    const g = window.__game;
    const e = g.builder.bodies.get(id);
    const oc = g.orbitCam;
    oc.flight = null; oc.focusId = id;
    oc.vLat = oc.vLon = 0; oc.heading = 0; oc.tilt = 0; oc.panOffset.set(0, 0, 0);
    const V3 = Object.getPrototypeOf(e.mesh.position).constructor;
    if (subsolar) {
      const d = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
      const v = new V3(-e.posKm[0] / d, -e.posKm[1] / d, -e.posKm[2] / d);
      v.applyQuaternion(e.mesh.quaternion.clone().invert());
      oc.lat = Math.asin(Math.max(-1, Math.min(1, v.y)));
      oc.lon = Math.atan2(-v.z, v.x);
    }
    oc.lat = lat * Math.PI / 180;
    if (lon !== null) oc.lon = lon;
    oc.dist = oc.distTarget = dist;
    window.__lon0 = oc.lon;
  }, { id, dist, lat, lon, subsolar });
}

// 一段推进/环绕：在 N 帧内插值 dist 与 lon 偏移
async function move(id, { distFrom, distTo, lonDelta = 0, lat = 12, frames = 40, settle = 320 }) {
  const rMul = await page.evaluate((id) => window.__game.builder.bodies.get(id).phys.radiusKm, id);
  await place(id, rMul * distFrom, { lat });
  const lon0 = await page.evaluate(() => window.__lon0);
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    const dist = rMul * (distFrom + (distTo - distFrom) * ease);
    const lon = lon0 + lonDelta * ease;
    await page.evaluate(({ dist, lon }) => {
      const oc = window.__game.orbitCam;
      oc.dist = oc.distTarget = dist; oc.lon = lon;
    }, { dist, lon });
    await sleep(settle);
    await shot();
  }
}

console.log('🎬 Shot 1: Saturn push-in');
await move('saturn', { distFrom: 4.2, distTo: 2.8, lonDelta: 0.22, lat: 16, frames: 46 });

console.log('🎬 Shot 2: Earth approach (blue limb)');
await move('earth', { distFrom: 3.4, distTo: 1.7, lonDelta: -0.18, lat: 10, frames: 44 });

console.log('🎬 Shot 3: Jupiter close pass');
await move('jupiter', { distFrom: 3.0, distTo: 2.0, lonDelta: 0.2, lat: 8, frames: 40 });

console.log(`✅ captured ${frame} frames → ${OUT}`);
await browser.close();
