// 巨墙定位：登陆同一点位，逐级隐藏地形找出肇事网格 + 输出各级几何/锚点诊断。
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
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
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

// 面向墙（yaw=90° 曾是全屏静态方向）
await ev(() => { const g = window.__game; if (g.ship.walk) { g.ship.walk.yaw = 0; g.ship.walk.pitch = 0.1; } });
await sleep(800);

// 各级几何诊断
const diag = await ev(() => {
  const g = window.__game;
  const tm = g.terrainMgr;
  const ps = tm.active?.patches;
  if (!ps) return { error: 'no active patches' };
  const moon = g.builder.bodies.get('moon');
  const out = { levels: [], demCache: tm.demSources.get('moon')?.cache.size, demOffline: tm.demSources.get('moon')?.isOffline };
  // 相机在月球本地系方向
  const cp = [g.ship.posKm[0] - moon.posKm[0], g.ship.posKm[1] - moon.posKm[1], g.ship.posKm[2] - moon.posKm[2]];
  const cl = Math.hypot(...cp);
  out.camDirLocal = null;
  for (const lv of ps.levels) {
    const pos = lv.geo.attributes.position.array;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < pos.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        if (pos[i + a] < mn[a]) mn[a] = pos[i + a];
        if (pos[i + a] > mx[a]) mx[a] = pos[i + a];
      }
    }
    out.levels.push({
      extent: lv.extent,
      fade: +lv.uFade.value.toFixed(2),
      origin: lv.origin.toArray().map((v) => +v.toFixed(1)),
      bboxMin: mn.map((v) => +v.toFixed(1)),
      bboxMax: mx.map((v) => +v.toFixed(1)),
      visible: lv.mesh.visible,
    });
  }
  return out;
});
console.log(JSON.stringify(diag, null, 1));

// 逐级隐藏定位肇事者
await page.screenshot({ path: OUT + 'diag-wall2-all.png' });
for (let li = 0; li < diag.levels.length; li++) {
  await ev((i) => {
    const ps = window.__game.terrainMgr.active.patches;
    ps.levels[i].mesh.visible = false;
  }, li);
  await sleep(300);
  await page.screenshot({ path: OUT + `diag-wall2-hide-L${li}.png` });
  await ev((i) => { window.__game.terrainMgr.active.patches.levels[i].mesh.visible = true; }, li);
}
console.log('📷 逐级隐藏截图完成（找墙消失的那级）');
await browser.close();
