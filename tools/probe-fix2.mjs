// 验证：地形反照率（sRGB 解码 + 去调色板叠色）与光照中性化后的接缝/地表观感
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
async function orbit(id, alt, tilt) {
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
}
async function mean(x, y, w, h) {
  const b64 = await page.screenshot({ encoding: 'base64' });
  return ev(async (b64, x, y, w, h) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(x, y, w, h).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }, b64, x, y, w, h);
}

// 1) 地球 LEO：方片接缝是否消失
await orbit('earth', 400, 0.42);
console.log('earth 400 in=', await mean(600, 330, 120, 90), 'out=', await mean(1080, 330, 120, 90));
await page.screenshot({ path: 'tools/.shot-surface/_fix2-earth-400.png' });
await orbit('earth', 20, 0.42);
await page.screenshot({ path: 'tools/.shot-surface/_fix2-earth-20.png' });
console.log('earth 20 hist=', await mean(400, 600, 400, 100));

// 2) 月球/火星 高空斑块
await orbit('moon', 200, 0.42);
await page.screenshot({ path: 'tools/.shot-surface/_fix2-moon-200.png' });
await orbit('mars', 200, 0.42);
await page.screenshot({ path: 'tools/.shot-surface/_fix2-mars-200.png' });

// 3) 地表（登陆）观感：亮度与色偏
for (const [id, lat] of [['moon', 10], ['mars', -5]]) {
  const ss = await subsolar(id);
  await ev((id, lat, ss) => {
    const g = window.__game, oc = g.orbitCam;
    const R = g.builder.bodies.get(id).phys.radiusKm;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = lat * Math.PI / 180; oc.lon = ss.lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = R + 0.002;
  }, id, lat, ss);
  const t1 = Date.now();
  while (Date.now() - t1 < 25000) {
    if (await ev((id) => window.__game.terrainMgr.baseReady(id), id)) break;
    await sleep(500);
  }
  await ev((id, lat, ss) => {
    const g = window.__game, oc = g.orbitCam;
    if (g.getMode() !== 'orbit' || oc.focusId !== id) return;
    const V = Object.getPrototypeOf(g.camera.position).constructor;
    const dir = new V(Math.cos(lat * Math.PI / 180) * Math.cos(-ss.lon), Math.sin(lat * Math.PI / 180), Math.cos(lat * Math.PI / 180) * Math.sin(-ss.lon));
    oc.dist = oc.distTarget = g.terrainMgr.heightAt(id, dir) + 0.002;
  }, id, lat, ss);
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) { if ((await ev(() => window.__game.getMode())) === 'walk') break; await sleep(400); }
  await sleep(6000);
  await ev(() => { const w = window.__game.ship.walk; if (w) w.pitch = 0.05; });
  await sleep(800);
  console.log(id, 'ground mean=', await mean(300, 500, 600, 200));
  await page.screenshot({ path: `tools/.shot-surface/_fix2-${id}-ground.png` });
  await ev(() => { window.__game.input.wheel += 1; });
  await sleep(1500);
}
await browser.close();
console.log('DONE');
