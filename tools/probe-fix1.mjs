// 验证：基底球遮挡修复 + 地球海面配色统一（真实 GPU 稳态）
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
mkdirSync('tools/.shot-surface', { recursive: true });
const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--window-position=-2400,-2400', '--window-size=1280,760', '--hide-scrollbars'],
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
async function waitSettled(maxMs = 60000) {
  const t0 = Date.now(); let st = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(300);
    const f = await ev(() => { const a = window.__game.terrainMgr.active; return a ? a.patches.levels.map((l) => l.uFade.value) : null; });
    if (f && f.every((v) => v >= 0.999)) { if (!st) st = Date.now(); else if (Date.now() - st > 900) return; }
    else st = 0;
  }
  console.log('  settle TIMEOUT');
}
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
  ['earth', 400], ['earth', 100], ['earth', 20],
  ['moon', 200], ['moon', 20], ['moon', 480], ['moon', 700],
  ['mars', 200], ['mars', 20], ['mars', 600], ['mars', 900],
];
for (const [id, alt] of CASES) {
  const ss = await subsolar(id);
  await ev((id, alt, ss) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = ss.lat * 0.8; oc.lon = ss.lon; oc.tilt = 0.42; oc.heading = 0;
    oc.dist = oc.distTarget = R + alt;
  }, id, alt, ss);
  await waitSettled();
  const st = await ev((id) => {
    const g = window.__game;
    const a = g.terrainMgr.active;
    const mesh = g.builder.bodies.get(id).mesh;
    return {
      active: a?.bodyId ?? null,
      lv: a ? a.patches.levels.length : 0,
      outer: a ? +a.patches.extents[a.patches.extents.length - 1].toFixed(0) : null,
      cover: a ? !!a.patches.readyCover : null,
      baseVis: mesh.material.visible,
    };
  }, id);
  console.log(`${id} ${alt}km`, JSON.stringify(st));
  await page.screenshot({ path: `tools/.shot-surface/_fix1-${id}-${alt}.png` });
}
await browser.close();
console.log('DONE');
