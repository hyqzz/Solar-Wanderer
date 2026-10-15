// 精确量测：同帧 A/B 差分——地形瓦片对画面的净贡献（0 = 与盘面完全一致）
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
async function settle(n = 5) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { await sleep(200); if ((await ev(() => window.__fc)) - m >= n) break; }
}
async function waitSettled(maxMs = 60000) {
  const t0 = Date.now(); let st = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(300);
    const f = await ev(() => { const a = window.__game.terrainMgr.active; return a ? a.patches.levels.map((l) => l.uFade.value) : null; });
    if (f && f.every((v) => v >= 0.999)) { if (!st) st = Date.now(); else if (Date.now() - st > 900) return; }
    else st = 0;
  }
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
async function ab(id, alt, tilt) {
  const ss = await subsolar(id);
  await ev((id, alt, tilt, ss) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = ss.lat * 0.8; oc.lon = ss.lon; oc.tilt = tilt; oc.heading = 0;
    oc.dist = oc.distTarget = R + alt;
  }, id, alt, tilt, ss);
  await waitSettled(); await settle(4);
  const a = await page.screenshot({ encoding: 'base64' });
  await ev(() => { window.__game.terrainMgr.active.patches.group.visible = false; });
  await settle(4);
  const b = await page.screenshot({ encoding: 'base64' });
  await ev(() => { window.__game.terrainMgr.active.patches.group.visible = true; });
  const stat = await ev(async (a, b) => {
    const load = async (s) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + s; });
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      return x.getImageData(0, 0, im.width, im.height).data;
    };
    const A = await load(a), B = await load(b);
    // 只统计 y>250（避开 UI 与天空），找差分最大的区块
    let maxd = 0, sum = 0, n = 0, mx = 0, my = 0, over = 0, sumOver = 0;
    for (let y = 250; y < 720; y++) {
      for (let x = 260; x < 1280; x++) {
        const i = (y * 1280 + x) * 4;
        const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
        sum += d; n++;
        if (d > 2) { over++; sumOver += d; }
        if (d > maxd) { maxd = d; mx = x; my = y; }
      }
    }
    return {
      meanAbsDiff: +(sum / n).toFixed(2), maxDiff: maxd, at: [mx, my],
      coverPct: +(100 * over / n).toFixed(1), meanOver: over ? +(sumOver / over).toFixed(2) : 0,
    };
  }, a, b);
  console.log(`${id} ${alt}km terrain-vs-disc:`, JSON.stringify(stat));
  await page.screenshot({ path: `tools/.shot-surface/_ab-${id}-${alt}.png` });
}
await ab('earth', 400, 0.42);
await ab('earth', 100, 0.42);
await ab('moon', 200, 0.42);
await ab('moon', 20, 0.42);
await ab('mars', 200, 0.42);
await browser.close();
console.log('DONE');
