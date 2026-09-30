// 白昼星空淡出失效诊断：登陆地球/土卫六，读取 skyFade 链路的每个中间量。
import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'],
  defaultViewport: { width: 640, height: 360 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto('http://localhost:5173/?quality=high', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const b = document.getElementById('start-btn'); return b && !b.disabled; }, { timeout: 90000 });
await page.click('#start-btn');
await sleep(2500);
await ev(() => { window.__game.quality.detail = true; });

async function probe(id, R, latDeg) {
  const ss = await ev((id) => {
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
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx) };
  }, id);
  await ev((id, R, lat, lon) => {
    const g = window.__game;
    const oc = g.orbitCam;
    g.select(id);
    oc.focusId = id; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = lat; oc.lon = lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = R + 0.002;
  }, id, R, latDeg * Math.PI / 180, ss.lon);
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if ((await ev(() => window.__game.getMode())) === 'walk') break;
    await sleep(400);
  }
  await sleep(3000);
  const r = await ev((id) => {
    const g = window.__game;
    const e = g.builder.bodies.get(id);
    const atm = e.phys.atmosphere;
    const ship = g.ship;
    const rel = [
      ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]];
    const relLen = Math.hypot(rel[0], rel[1], rel[2]);
    const l = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
    const sunDir = [-e.posKm[0] / l, -e.posKm[1] / l, -e.posKm[2] / l];
    const sunElev = (rel[0] * sunDir[0] + rel[1] * sunDir[1] + rel[2] * sunDir[2]) / relLen;
    const distSurface = relLen - e.phys.radiusKm;
    const nearest = g.nearestInfo ?? null;
    // 星点材质当前不透明度（从相机上溯到场景根遍历 Points）
    let root = g.camera;
    while (root.parent) root = root.parent;
    const opacities = [];
    root.traverse((o) => { if (o.isPoints && o.material && o.material.transparent) opacities.push(+o.material.opacity.toFixed(3)); });
    return {
      mode: g.getMode(),
      distSurfaceKm: +distSurface.toFixed(4),
      sunElev: +sunElev.toFixed(3),
      atmoHeight: atm ? atm.heightKm : null,
      rayleighScale: atm ? atm.rayleighScaleKm : null,
      nearest,
      starOpacities: opacities.slice(0, 8),
    };
  }, id);
  console.log(id, JSON.stringify(r));
}

await probe('earth', 6371.0, 20);
await probe('titan', 2574.7, 10);
await browser.close();
