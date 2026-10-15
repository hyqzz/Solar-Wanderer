// 一次性诊断：冥王星地平线天空团块成分排查
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
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(4000);
// 与 probe-surface 相同的冥王星着陆点（lat 20°, 日下经度）
await page.evaluate(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  const be = g.builder.bodies.get('pluto');
  g.select('pluto');
  oc.focusId = 'pluto'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  const q = be.mesh.quaternion;
  const p = be.posKm;
  const l = Math.hypot(p[0], p[1], p[2]);
  const toSun = { x: -p[0] / l, y: -p[1] / l, z: -p[2] / l };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * toSun.x + qy * toSun.z - qz * toSun.y;
  const iy = qw * toSun.y + qz * toSun.x - qx * toSun.z;
  const iz = qw * toSun.z + qx * toSun.y - qy * toSun.x;
  const iw = -qx * toSun.x - qy * toSun.y - qz * toSun.z;
  const vx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const vy = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const vz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  oc.lat = 20 * Math.PI / 180;
  oc.lon = Math.atan2(-vz, vx);
  oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = be.phys.radiusKm + 0.002;
});
await sleep(2500);
// G 登陆（select 可能触发飞行动画吞掉首次按键，重试至多 3 次）
for (let k = 0; k < 3; k++) {
  await page.evaluate(() => { const g = window.__game; g.input.keys.add('KeyG'); g.input.justPressed.add('KeyG'); });
  await sleep(2500);
  if ((await page.evaluate(() => window.__game.getMode())) === 'walk') break;
}
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  if ((await page.evaluate(() => window.__game.getMode())) === 'walk') break;
  await sleep(500);
}
await sleep(6000);
await page.evaluate(() => { const w = window.__game.ship.walk; w.pitch = 0.05; });
await sleep(700);
// 团块方位记录：打印 charon / sun / 银河带方向相对相机的屏幕投影
const info = await page.evaluate(() => {
  const g = window.__game;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const proj = (wx, wy, wz) => {
    const v = new V(wx, wy, wz).project(g.camera);
    return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)];
  };
  const ch = g.builder.bodies.get('charon');
  const pl = g.builder.bodies.get('pluto');
  const sunW = [0, 0, 0]; // 世界系太阳（浮动原点后 = -shipPos）
  const out = {
    charonNDC: proj(ch.group.position.x, ch.group.position.y, ch.group.position.z),
    sunNDC: proj(-g.ship.posKm[0], -g.ship.posKm[1], -g.ship.posKm[2]),
    charonDist: Math.hypot(ch.posKm[0] - g.ship.posKm[0], ch.posKm[1] - g.ship.posKm[1], ch.posKm[2] - g.ship.posKm[2]),
    plutoAtmo: !!pl.atmoMesh,
  };
  return out;
});
console.log(JSON.stringify(info));
await page.screenshot({ path: 'tools/.shot-surface/_diag-pluto-base.png' });
// A: 隐藏冥卫一
await page.evaluate(() => { window.__game.builder.bodies.get('charon').group.visible = false; });
await sleep(400);
await page.screenshot({ path: 'tools/.shot-surface/_diag-pluto-nocharon.png' });
await page.evaluate(() => { window.__game.builder.bodies.get('charon').group.visible = true; });
// B: 隐藏冥王星大气
await page.evaluate(() => {
  const p = window.__game.builder.bodies.get('pluto');
  if (p.atmoMesh) p.atmoMesh.visible = false;
});
await sleep(400);
await page.screenshot({ path: 'tools/.shot-surface/_diag-pluto-noatmo.png' });
await browser.close();
console.log('DONE');
