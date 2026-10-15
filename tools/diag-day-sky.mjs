// 白昼天空回归：地面反弹项加了昼夜判定后，必须确认**白天没被改坏**。
// 在日下点（正午）拍火星与地球的地平线与天顶，并量天顶区亮度。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-day/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=high', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));

const subsolar = (id) => p.evaluate((bid) => {
  const e = window.__game.builder.bodies.get(bid);
  const q = e.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const v = { x: -e.posKm[0], y: -e.posKm[1], z: -e.posKm[2] };
  const L = Math.hypot(v.x, v.y, v.z); v.x /= L; v.y /= L; v.z /= L;
  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx),
    R: e.phys.radiusKm };
}, id);

const sky = () => p.evaluate(() => new Promise((res) => {
  const g = window.__game;
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a);
    g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let r = 0, gg = 0, bl = 0, n = 0;
    for (let y = Math.floor(h * 0.68); y < Math.floor(h * 0.88); y++) {
      for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x++) {
        const i = ((h - 1 - y) * w + x) * 4;
        r += buf[i]; gg += buf[i + 1]; bl += buf[i + 2]; n++;
      }
    }
    res({ r: r / n, g: gg / n, b: bl / n });
  };
}));

for (const id of ['mars', 'earth', 'moon']) {
  const ss = await subsolar(id);
  await p.evaluate((m, bid) => {
    const g = window.__game, oc = g.orbitCam;
    g.select(bid);
    oc.focusId = bid; oc.flight = null; oc.panOffset.set(0, 0, 0);
    oc.lat = m.lat * 0.5; oc.lon = m.lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = m.R + 0.002;
  }, ss, id);
  let ok = false;
  for (let i = 0; i < 60; i++) {
    if ((await p.evaluate(() => window.__game.getMode())) === 'walk') { ok = true; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ok) { console.log(id, 'WALK-TIMEOUT'); continue; }
  await new Promise((r) => setTimeout(r, 7000));
  await p.evaluate(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 0.02; w.yaw = 0; } });
  await new Promise((r) => setTimeout(r, 3000));
  const st = await sky();
  await p.screenshot({ path: `${OUT}${id}-horizon.png` });
  await p.evaluate(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 0.9; w.yaw = 0; } });
  await new Promise((r) => setTimeout(r, 2500));
  await p.screenshot({ path: `${OUT}${id}-sky.png` });
  console.log(`${id.padEnd(7)} 白昼天顶 RGB ${st.r.toFixed(1)}/${st.g.toFixed(1)}/${st.b.toFixed(1)}`);
}
console.log('错误:', errs.length, errs[0] ?? '');
await b.close();
