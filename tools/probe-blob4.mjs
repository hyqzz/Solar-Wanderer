// 一次性诊断：把 280km 级染成品红，看它到底覆盖屏幕哪些像素
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
mkdirSync('tools/.shot-surface', { recursive: true });
const HEADED = process.argv.includes('--gpu');
const browser = await puppeteer.launch({
  headless: !HEADED,
  args: ['--no-sandbox',
    ...(HEADED ? ['--window-position=-2400,-2400', '--window-size=1280,760'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);
await ev(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
async function frames(n = 8) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { await sleep(200); if ((await ev(() => window.__fc)) - m >= n) break; }
  await sleep(400);
}
await ev(() => {
  const g = window.__game, oc = g.orbitCam;
  const b = g.builder.bodies.get('moon');
  const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
  const s = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * s.x + qy * s.z - qz * s.y, iy = qw * s.y + qz * s.x - qx * s.z;
  const iz = qw * s.z + qx * s.y - qy * s.x, iw = -qx * s.x - qy * s.y - qz * s.z;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  g.select('moon');
  oc.focusId = 'moon'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = Math.asin(Math.max(-1, Math.min(1, ly))) * 0.8;
  oc.lon = Math.atan2(-lz, ix * qw + iw * -qx + iy * -qz - iz * -qy);
  oc.tilt = 0.42; oc.heading = 0;
  oc.dist = oc.distTarget = 1737.4 + 200;
});
await frames(10);

// 打印相机与地形的几何关系
console.log(JSON.stringify(await ev(() => {
  const g = window.__game;
  const ps = g.terrainMgr.active.patches;
  const l7 = ps.levels[ps.levels.length - 1];
  const v = l7.geo.attributes.position.array;
  let maxR = 0, minR = 1e18, maxH = -1e18, minH = 1e18;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i] + l7.origin.x, y = v[i + 1] + l7.origin.y, z = v[i + 2] + l7.origin.z;
    const r = Math.hypot(x, y, z);
    if (r > maxR) maxR = r; if (r < minR) minR = r;
    const h = r - 1737.4;
    if (h > maxH) maxH = h; if (h < minH) minH = h;
  }
  return {
    anchor: [+ps.anchorDir.x.toFixed(3), +ps.anchorDir.y.toFixed(3), +ps.anchorDir.z.toFixed(3)],
    origin: l7.origin.toArray().map((n) => +n.toFixed(2)),
    radiusRange: [+minR.toFixed(2), +maxR.toFixed(2)],
    heightRangeKm: [+minH.toFixed(3), +maxH.toFixed(3)],
    meshPos: l7.mesh.position.toArray().map((n) => +n.toFixed(2)),
    camPos: g.camera.position.toArray().map((n) => +n.toFixed(3)),
    focusQuat: [+g.builder.bodies.get('moon').mesh.quaternion.x.toFixed(3), +g.builder.bodies.get('moon').mesh.quaternion.y.toFixed(3), +g.builder.bodies.get('moon').mesh.quaternion.z.toFixed(3), +g.builder.bodies.get('moon').mesh.quaternion.w.toFixed(3)],
  };
})));

await ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  const l7 = ps.levels[ps.levels.length - 1];
  l7.mat.color.setRGB(6, 0, 6);
});
await frames(6);
await page.screenshot({ path: 'tools/.shot-surface/_b4-l7magenta.png' });

// 也把 60km 级染绿
await ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  ps.levels[6].mat.color.setRGB(0, 6, 0);
});
await frames(6);
await page.screenshot({ path: 'tools/.shot-surface/_b4-l6green.png' });
await browser.close();
console.log('DONE');
