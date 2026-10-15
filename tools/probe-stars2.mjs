// 白昼残星二分定位：登陆地球白昼，逐一隐藏候选对象组并截图对比。
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

// 登陆地球白昼（日下经度）
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
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx) };
});
await ev((lat, lon) => {
  const g = window.__game;
  const oc = g.orbitCam;
  g.select('earth');
  oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = 0.35; oc.lon = lon; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = 6371.0 + 0.002;
}, ss.lat, ss.lon);
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  if ((await ev(() => window.__game.getMode())) === 'walk') break;
  await sleep(400);
}
await sleep(3000);
await ev(() => { const w = window.__game.ship.walk; if (w) w.pitch = 1.05; });
await sleep(700);

// 场景根节点下所有候选点/精灵对象的清单
const inv = await ev(() => {
  const g = window.__game;
  let root = g.camera;
  while (root.parent) root = root.parent;
  const out = [];
  root.traverse((o) => {
    if ((o.isPoints || o.isSprite) && o.visible) {
      let p = o, chain = [];
      while (p) { chain.push(p.name || p.type); p = p.parent; }
      out.push({ chain: chain.join('<'), matOpacity: o.material?.opacity, count: o.geometry?.attributes?.position?.count });
    }
  });
  return out;
});
console.log(JSON.stringify(inv, null, 1));

await page.screenshot({ path: `${OUT}baseline.png` });

// 依次隐藏每类并截图
const steps = ['smallBodies', 'tno', 'comets', 'voyager'];
for (const s of steps) {
  await ev((s) => {
    const g = window.__game;
    if (s === 'smallBodies') g.smallBodies.group.visible = false;
    if (s === 'tno') for (const [, e] of (window.__tnoEntries ?? [])) e.glint.visible = false;
  }, s);
  await sleep(300);
  await page.screenshot({ path: `${OUT}hide-${s}.png` });
}
await browser.close();
console.log('DONE');
