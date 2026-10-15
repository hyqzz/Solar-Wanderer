// 一次性诊断：月球 200km 米色斑块——带帧同步的逐级对照
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
async function waitSettled(maxMs = 40000) {
  const t0 = Date.now(); let st = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(300);
    const f = await ev(() => { const a = window.__game.terrainMgr.active; return a ? a.patches.levels.map((l) => l.uFade.value) : null; });
    if (f && f.every((v) => v >= 0.999)) { if (!st) st = Date.now(); else if (Date.now() - st > 800) return; }
    else st = 0;
  }
  console.log('  settle TIMEOUT');
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
await waitSettled();
const state = () => ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  return ps.levels.map((l) => `${l.extent}:${l.mesh.visible ? 1 : 0}`).join(' ') + ' orbit=' + window.__game.orbitCam.dist.toFixed(0);
});
await frames(6);
console.log('S0', await state());
await page.screenshot({ path: 'tools/.shot-surface/_b3-0-all.png' });

await ev(() => { const ps = window.__game.terrainMgr.active.patches; for (const l of ps.levels) if (l.extent > 100) l.mesh.visible = false; });
await frames(6);
console.log('S1', await state());
await page.screenshot({ path: 'tools/.shot-surface/_b3-1-no280.png' });

await ev(() => { const ps = window.__game.terrainMgr.active.patches; for (const l of ps.levels) if (l.extent > 20) l.mesh.visible = false; });
await frames(6);
console.log('S2', await state());
await page.screenshot({ path: 'tools/.shot-surface/_b3-2-no60.png' });

await ev(() => { const ps = window.__game.terrainMgr.active.patches; for (const l of ps.levels) l.mesh.visible = false; });
await frames(6);
console.log('S3', await state());
await page.screenshot({ path: 'tools/.shot-surface/_b3-3-none.png' });
await browser.close();
console.log('DONE');
