// 一次性诊断：火星地表黑带根因隔离（阴影装置 on/off 对照）
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.evaluateOnNewDocument(() => {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => q.includes('coarse') || q.includes('any-pointer')
    ? { matches: false, media: q, addEventListener() {}, removeEventListener() {} } : mm(q);
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await new Promise(r => setTimeout(r, 4000));
await page.waitForFunction(() => window.__game?.orbitCam, { timeout: 60000 });

// 火星日下点登陆
await page.evaluate(() => {
  const g = window.__game;
  const oc = g.orbitCam;
  const be = g.builder.bodies.get('mars');
  g.select('mars');
  oc.focusId = 'mars'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  // 日下点经纬
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
  oc.lat = -5 * Math.PI / 180; // probe-surface 同款着陆点（黑带出现处）
  oc.lon = Math.atan2(-vz, vx);
  oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = be.phys.radiusKm + 0.002;
});
await new Promise(r => setTimeout(r, 2500));
// dist=2m 触发自动登陆（无需滚轮）
{
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    if ((await page.evaluate(() => window.__game.getMode())) === 'walk') break;
    await new Promise(r => setTimeout(r, 500));
  }
}
await new Promise(r => setTimeout(r, 6000)); // 等地形建完+淡入完成

// 视线压平到地平线
await page.evaluate(() => { const g = window.__game; g.ship.walk.pitch = 0.02; });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'tools/.shot-surface/_diag-shadow-on.png' });

// 关阴影对照
await page.evaluate(() => {
  const g = window.__game;
  // 找渲染器：经 canvas __three? 直接从场景遍历关装置
  g.builder.bodies.get('mars'); // noop
  // 渲染器未暴露——用场景遍历找 DirectionalLight 关掉
  const scene = g.camera.parent;
  scene.traverse((o) => { if (o.isDirectionalLight) { o.visible = false; o.castShadow = false; } });
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'tools/.shot-surface/_diag-shadow-off.png' });

// 再开回來（恢复）
await browser.close();
console.log('DONE');
