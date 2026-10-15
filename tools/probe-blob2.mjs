// 一次性诊断：月球 200km 米色斑块——逐级/基底分离（真实 GPU 稳态）
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
await page.screenshot({ path: 'tools/.shot-surface/_blob-0-base.png' });

// 采样米色斑块处的地形顶点色 vs 基底贴图色
const probe = await ev(() => {
  const g = window.__game;
  const f = g.terrainMgr.field('moon');
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  // 屏幕 (700,120) 与 (840,50) 是米色斑块；(400,600) 是普通地面
  const px = [[700, 120], [840, 50], [760, 300], [400, 600]];
  const out = [];
  for (const [sx, sy] of px) {
    const dir = new V((sx / 1280) * 2 - 1, -(sy / 720) * 2 + 1, 0.5).unproject(g.camera).normalize();
    const m = f.sampleMap(dir);
    const c = new (Object.getPrototypeOf(f.color ? {} : {}).constructor ?? Object)();
    const col = { setRGB(r, gg, b) { this.r = r; this.g = gg; this.b = b; return this; } };
    f.color(dir, f.height(dir), 0.3, col);
    out.push({ px: [sx, sy], map: m, col: [+col.r.toFixed(3), +col.g.toFixed(3), +col.b.toFixed(3)], ocean: f.isOcean(dir), h: +f.height(dir).toFixed(1) });
  }
  return out;
});
console.log('probe', JSON.stringify(probe));

// A: 只隐藏最粗级（280）
await ev(() => { const ps = window.__game.terrainMgr.active.patches; for (const l of ps.levels) if (l.extent > 100) l.mesh.visible = false; });
await sleep(600);
await page.screenshot({ path: 'tools/.shot-surface/_blob-A-no280.png' });
// B: 只隐藏 60 级
await ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  for (const l of ps.levels) if (l.extent > 100) l.mesh.visible = true;
  for (const l of ps.levels) if (l.extent > 20 && l.extent < 100) l.mesh.visible = false;
});
await sleep(600);
await page.screenshot({ path: 'tools/.shot-surface/_blob-B-no60.png' });
// C: 全部地形隐藏（只看基底球）
await ev(() => {
  const ps = window.__game.terrainMgr.active.patches;
  for (const l of ps.levels) l.mesh.visible = false;
});
await sleep(600);
await page.screenshot({ path: 'tools/.shot-surface/_blob-C-base.png' });
await browser.close();
console.log('DONE');
