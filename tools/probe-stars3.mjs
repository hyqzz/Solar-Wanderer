// 残星最终定位：把 DOM 全部隐藏后截图（区分 DOM vs WebGL），再隐藏天空组截图。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-starfade/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => { window.__game.quality.detail = true; });

const ss = await ev(() => {
  const b = window.__game.builder.bodies.get('earth');
  const p = b.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const q = b.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lon: Math.atan2(-lz, lx) };
});
await ev((lon) => {
  const g = window.__game;
  const oc = g.orbitCam;
  g.select('earth');
  oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = 0.35; oc.lon = lon; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = 6371.0 + 0.002;
}, ss.lon);
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
  await sleep(400);
}
await sleep(3000);
await ev(() => { const w = window.__game.ship.walk; if (w) w.pitch = 1.05; });
await sleep(700);

// 1. 基线（隐藏全部 DOM，只留 WebGL 画布）
await ev(() => {
  for (const el of document.body.children) if (el.tagName !== 'CANVAS') el.style.visibility = 'hidden';
});
await sleep(300);
await page.screenshot({ path: `${OUT}webgl-only.png` });

// 2. 场景里还剩什么可见的点/精灵
const inv = await ev(() => {
  const g = window.__game;
  let root = g.camera;
  while (root.parent) root = root.parent;
  const out = [];
  root.traverse((o) => {
    if (!o.visible) return;
    // 父链可见性
    let p = o.parent, anyHidden = false;
    while (p) { if (!p.visible) { anyHidden = true; break; } p = p.parent; }
    if (anyHidden) return;
    if ((o.isPoints || o.isSprite)) {
      out.push({ type: o.type, op: +(o.material?.opacity ?? -1).toFixed(2), n: o.geometry?.attributes?.position?.count ?? 0, parentName: o.parent?.name });
    }
  });
  return out;
});
console.log('VISIBLE AFTER FIX:', JSON.stringify(inv));
await browser.close();
console.log('DONE');
