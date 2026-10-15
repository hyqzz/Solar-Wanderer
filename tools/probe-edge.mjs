// 量测：地球 400km 方片边缘阶跃 + 月球 200km 斑块亮度差
import puppeteer from 'puppeteer';
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
async function rows(id, alt, tilt) {
  const ss = await subsolar(id);
  await ev((id, alt, tilt, ss) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = ss.lat * 0.8; oc.lon = ss.lon; oc.tilt = tilt; oc.heading = 0;
    oc.dist = oc.distTarget = R + alt;
  }, id, alt, tilt, ss);
  await waitSettled();
  const b64 = await page.screenshot({ encoding: 'base64' });
  const out = await ev(async (b64) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const row = (y) => {
      const d = ctx.getImageData(700, y, 200, 2).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };
    return { y180: row(180), y220: row(220), y245: row(245), y260: row(260), y300: row(300), y400: row(400) };
  }, b64);
  console.log(id, alt + 'km', JSON.stringify(out));
  await page.screenshot({ path: `tools/.shot-surface/_fix3-${id}-${alt}.png` });
}
await rows('earth', 400, 0.42);
await rows('earth', 100, 0.42);
await rows('moon', 200, 0.42);
await rows('moon', 20, 0.42);
await rows('mars', 200, 0.42);
await browser.close();
console.log('DONE');
