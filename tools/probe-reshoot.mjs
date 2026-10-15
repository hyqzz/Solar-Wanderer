// 定点重拍 + 诊断：地球低轨取景（含地平线/大气边）、彗星（不设 lat/tilt）
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = 'tools/.shot-tour/';
mkdirSync(OUT, { recursive: true });
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
await ev(() => { window.__game.quality.detail = true; });
await ev(() => { window.__fc = 0; const t = () => { window.__fc++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
async function settle(n = 5) {
  const m = await ev(() => window.__fc);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { await sleep(200); if ((await ev(() => window.__fc)) - m >= n) return; }
}
const setCatalog = (open) => ev((open) => { document.getElementById('directory')?.classList.toggle('open', open); }, open);
await setCatalog(false);

// ── 地球低轨：tilt≈1.15 才能看到地平线与大气层边 ──
const ss = await ev(() => {
  const b = window.__game.builder.bodies.get('earth');
  const p = b.posKm, l = Math.hypot(p[0], p[1], p[2]);
  const s = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * s.x + qy * s.z - qz * s.y, iy = qw * s.y + qz * s.x - qx * s.z;
  const iz = qw * s.z + qx * s.y - qy * s.x, iw = -qx * s.x - qy * s.y - qz * s.z;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, ix * qw + iw * -qx + iy * -qz - iz * -qy) };
});
for (const [name, alt, tilt] of [['03-地球低轨', 400, 1.18], ['03b-地球弧面', 1200, 1.05]]) {
  await ev((alt, tilt, ss) => {
    const g = window.__game, oc = g.orbitCam;
    g.select('earth');
    oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = ss.lat * 0.7; oc.lon = ss.lon; oc.tilt = tilt; oc.heading = 0;
    oc.dist = oc.distTarget = 6371 + alt;
  }, alt, tilt, ss);
  await settle(6);
  console.log('shot', name, JSON.stringify(await ev(() => ({ f: window.__game.orbitCam.focusId, d: Math.round(window.__game.orbitCam.dist) }))));
  await page.screenshot({ path: `${OUT}${name}.png` });
}

// ── 彗星：flyTo 到位后只改距离（彗星 env 无 quat，设 lat/tilt 会落空）──
await ev(() => { const g = window.__game; g.orbitCam.flyTo(g.orbitEnv ?? undefined, 'encke'); });
{
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    await sleep(500);
    if (await ev(() => { const oc = window.__game.orbitCam; return oc.flight === null && oc.focusId === 'encke'; })) break;
  }
}
await settle(6);
console.log('comet state', JSON.stringify(await ev(() => {
  const g = window.__game;
  const e = g.__game?.comets?.entries?.find((x) => x.c.id === 'encke');
  const co = g.comets?.entries?.find((x) => x.c.id === 'encke');
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const dist = co ? new V(co.group.position.x, co.group.position.y, co.group.position.z).length() : null;
  return {
    oc: { focus: g.orbitCam.focusId, lat: +g.orbitCam.lat.toFixed(3), tilt: +g.orbitCam.tilt.toFixed(3), dist: Math.round(g.orbitCam.dist) },
    hasComets: !!g.comets,
    groupVisible: co ? co.group.visible : null,
    groupPos: co ? co.group.position.toArray().map((v) => +v.toFixed(0)) : null,
    camDistToComet: dist == null ? null : Math.round(dist),
    headScale: co ? +co.head.scale.x.toFixed(0) : null,
    headOpacity: co ? +co.head.material.opacity.toFixed(2) : null,
    ionVisible: co ? co.ionTail.visible : null,
    dustVisible: co ? co.dustTail.visible : null,
  };
})));
for (const [name, d] of [['09-彗星恩克', 8e6], ['09b-彗星恩克远', 3e7]]) {
  await ev((d) => { const oc = window.__game.orbitCam; oc.dist = oc.distTarget = d; }, d);
  await settle(5);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot', name);
}
await browser.close();
console.log('DONE');
