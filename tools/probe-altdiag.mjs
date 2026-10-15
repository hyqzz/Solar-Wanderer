// 一次性诊断：多地体多高度地形瓦片方形接缝普查（看是否所有可登陆天体都有硬边方块）
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = 'tools/.shot-surface';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
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
async function settle(n = 3, maxMs = 20000) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { await sleep(400); if ((await ev(() => window.__fc)) - m >= n) return; }
  console.log('  settle TIMEOUT');
}

// 日下点纬度（相机看向白昼半球，避免黑夜什么都看不出）
async function subsolar(id) {
  return ev((id) => {
    const b = window.__game.builder.bodies.get(id);
    const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
    const s = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
    const q = b.mesh.quaternion;
    const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
    const ix = qw * s.x + qy * s.z - qz * s.y, iy = qw * s.y + qz * s.x - qx * s.z;
    const iz = qw * s.z + qx * s.y - qy * s.x, iw = -qx * s.x - qy * s.y - qz * s.z;
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, ix * qw + iw * -qx + iy * -qz - iz * -qy) };
  }, id);
}

const CASES = [
  ['earth', 400, 0.42], ['earth', 100, 0.42], ['earth', 20, 0.42],
  ['moon', 200, 0.42], ['moon', 20, 0.42],
  ['mars', 200, 0.42], ['mars', 20, 0.42],
];
for (const [id, alt, tilt] of CASES) {
  const ss = await subsolar(id);
  await ev((id, alt, t, ss) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = ss.lat * 0.8; oc.lon = ss.lon; oc.tilt = t; oc.heading = 0;
    oc.dist = oc.distTarget = R + alt;
  }, id, alt, tilt, ss);
  await settle(3);
  const st = await ev(() => {
    const g = window.__game;
    const a = g.terrainMgr.active;
    return { mode: g.getMode(), active: a?.bodyId ?? null, levels: a ? a.patches.levels.length : 0 };
  });
  console.log(`${id} alt=${alt}`, JSON.stringify(st));
  await page.screenshot({ path: `${OUT}/_alt-${id}-${alt}.png` });
}
await browser.close();
console.log('DONE');
