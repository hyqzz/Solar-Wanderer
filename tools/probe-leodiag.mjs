// 一次性诊断：地球 LEO 视角地形瓦片硬边方形色块成分分离
// A 正常 / B 隐藏地形瓦片 / C 只留地形瓦片（隐行星+云+大气）
import puppeteer from 'puppeteer';
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
await ev(() => {
  window.__fc = 0;
  const t = () => { window.__fc++; requestAnimationFrame(t); };
  requestAnimationFrame(t);
});
async function settle(n = 3, maxMs = 20000) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(400);
    if ((await ev(() => window.__fc)) - m >= n) return;
  }
  console.log('settle TIMEOUT');
}

const ss = await ev(() => {
  const b = window.__game.builder.bodies.get('earth');
  const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
  const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, iy * qw + iw * -qy + iz * -qx - ix * -qz))) , lon: Math.atan2(-lz, lx) };
});

async function view(dist, tilt) {
  await ev((dist, t, ss) => {
    const g = window.__game, oc = g.orbitCam;
    g.select('earth');
    oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = ss.lat * 0.7; oc.lon = ss.lon; oc.tilt = t; oc.heading = 0;
    oc.dist = oc.distTarget = 6371 + dist;
  }, dist, tilt, ss);
  await settle();
}

await view(400, 0.42);
const info = await ev(() => {
  const g = window.__game;
  const a = g.terrainMgr.active;
  const cm = g.builder.bodies.get('earth').cloudMesh;
  return {
    active: !!a,
    bodyId: a?.bodyId,
    extents: a?.patches.extents,
    levels: a?.patches.levels.map((l) => ({ e: l.extent, fade: +l.uFade.value.toFixed(2), built: l.built })),
    groupPos: a?.patches.group.position.toArray().map((v) => +v.toFixed(3)),
    cloudVisible: !!cm?.visible,
    camAbove: (() => { const c = g.camera.position.length(); return +c.toFixed(2); })(),
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'tools/.shot-surface/_diag-leo-A.png' });

// B: 隐藏地形瓦片
await ev(() => { window.__game.terrainMgr.active.patches.group.visible = false; });
await settle(2);
await page.screenshot({ path: 'tools/.shot-surface/_diag-leo-B.png' });

// C: 只留地形瓦片
await ev(() => {
  const g = window.__game;
  const b = g.builder.bodies.get('earth');
  g.terrainMgr.active.patches.group.visible = true;
  b.mesh.material.visible = false;
  if (b.cloudMesh) b.cloudMesh.visible = false;
  if (b.atmoMesh) b.atmoMesh.visible = false;
  b.group.traverse((o) => { if (o.isSprite) o.visible = false; });
});
await settle(2);
await page.screenshot({ path: 'tools/.shot-surface/_diag-leo-C.png' });
await browser.close();
console.log('DONE');
