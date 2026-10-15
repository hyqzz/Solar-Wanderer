// 巡演路径星淡失效诊断：月球→起飞→地球，读取 skyFade 链路状态。
import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'],
  defaultViewport: { width: 640, height: 360 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/pointer\s*:\s*coarse/.test(q)) return { matches: false, addEventListener() {}, addListener() {} };
    if (/any-pointer\s*:\s*fine/.test(q)) return { matches: true, addEventListener() {}, addListener() {} };
    return orig(q);
  };
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => { window.__game.quality.detail = true; });

async function subsolarLon(id) {
  return ev((id) => {
    const b = window.__game.builder.bodies.get(id);
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
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return Math.atan2(-lz, lx);
  }, id);
}
async function land(id, R, latDeg) {
  const lon = await subsolarLon(id);
  await ev((id, R, lat, lon) => {
    const g = window.__game;
    const oc = g.orbitCam;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = lat; oc.lon = lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = R + 0.002;
  }, id, R, latDeg * Math.PI / 180, lon);
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if ((await ev(() => window.__game.getMode())) === 'walk') return true;
    await sleep(400);
  }
  return false;
}
const diag = () => ev(() => {
  const g = window.__game;
  let root = g.camera;
  while (root.parent) root = root.parent;
  let starMats = [], glintNonZero = 0, sbVisible = null;
  root.traverse((o) => {
    if (o.isPoints && o.parent?.name === 'smallBodies') sbVisible = o.parent.visible && o.visible;
  });
  // 星场材质：通过 starfield 模块创建的 Points（11000/900/129 颗）
  root.traverse((o) => {
    if (o.isPoints && [11000, 900, 129].includes(o.geometry?.attributes?.position?.count)) {
      starMats.push({ n: o.geometry.attributes.position.count, op: o.material.opacity, vis: o.visible, parentVis: o.parent?.visible });
    }
  });
  for (const [id, e] of g.builder.bodies) if (e.glint && e.glint.material.opacity > 0.01) glintNonZero++;
  return { mode: g.getMode(), starMats, glintNonZero, sbVisible, errLog: (window.__errLog ?? []).slice(0, 5) };
});

console.log('moon:', await land('moon', 1737.4, 10));
await sleep(2000);
console.log('AT MOON:', JSON.stringify(await diag()));
await ev(() => { window.__game.input.wheel += 1; });
await sleep(1200);
console.log('earth:', await land('earth', 6371.0, 20));
await sleep(2500);
console.log('AT EARTH:', JSON.stringify(await diag()));
await browser.close();
