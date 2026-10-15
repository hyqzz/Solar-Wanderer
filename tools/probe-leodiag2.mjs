// 一次性诊断 2：LEO 方形色块成分隔离（逐层隐藏 + 区块像素均值）
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('tools/.shot-surface', { recursive: true });

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
async function settle(n = 3, maxMs = 25000) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { await sleep(400); if ((await ev(() => window.__fc)) - m >= n) return; }
  console.log('settle TIMEOUT');
}

// 相机：地球 400km，看向方片中心区域（tilt 小 = 正下方）
await ev(() => {
  const g = window.__game, oc = g.orbitCam;
  const b = g.builder.bodies.get('earth');
  const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
  const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  g.select('earth');
  oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = Math.asin(Math.max(-1, Math.min(1, ly))) * 0.7;
  oc.lon = Math.atan2(-lz, qw * toSun.x + qy * toSun.z - qz * toSun.y);
  oc.tilt = 0.42; oc.heading = 0;
  oc.dist = oc.distTarget = 6371 + 400;
});
await settle(4);

// 像素均值工具：把截图 base64 送回页面用 2D canvas 采样
async function sample(name) {
  const b64 = await page.screenshot({ encoding: 'base64' });
  writeFileSync(`tools/.shot-surface/_iso-${name}.png`, Buffer.from(b64, 'base64'));
  const regions = await ev(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const mean = (x, y, w, h) => {
      const d = ctx.getImageData(x, y, w, h).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };
    return {
      inside: mean(600, 330, 120, 90),    // 方片内部
      outsideR: mean(1080, 330, 120, 90), // 方片右侧外部
      outsideTop: mean(600, 230, 120, 40),// 方片上缘之上
    };
  }, b64);
  console.log(name.padEnd(14), 'in=', regions.inside.join(','), ' outR=', regions.outsideR.join(','), ' outT=', regions.outsideTop.join(','));
  return regions;
}

await sample('normal');
const hide = (what) => ev((what) => {
  const g = window.__game, b = g.builder.bodies.get('earth');
  const P = g.terrainMgr.active.patches.group;
  if (what === 'clouds') b.cloudMesh.visible = false;
  if (what === 'atmo') { for (const c of b.group.children) if (c !== b.mesh) c.visible = false; }
  if (what === 'terrain') P.visible = false;
  if (what === 'mesh') b.mesh.material.visible = false;
}, what);
const show = () => ev(() => {
  const g = window.__game, b = g.builder.bodies.get('earth');
  b.mesh.material.visible = true;
  if (b.cloudMesh) b.cloudMesh.visible = true;
  for (const c of b.group.children) c.visible = true;
  g.terrainMgr.active.patches.group.visible = true;
});

await hide('clouds'); await settle(2); await sample('noClouds');
await show(); await settle(2);
await hide('atmo'); await settle(2); await sample('noAtmo');
await show(); await settle(2);
await hide('mesh'); await settle(2); await sample('noPlanetMesh');
await show(); await settle(2);
await hide('terrain'); await settle(2); await sample('noTerrain');
await show(); await settle(2);

await browser.close();
console.log('DONE');
