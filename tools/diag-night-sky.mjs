// 夜空底色太亮（灰蓝雾）会把星淹没。逐层关掉，看是谁贡献的。
// 真实夜空背景约 21.5 mag/arcsec²，在 8 位 sRGB 里接近 (8,10,14)，
// 而当前实测天空在 (40,55,70) 量级——亮了十几倍。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./.shot-night/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => {
  const x = document.getElementById('start-btn');
  return x && !x.disabled;
}, { timeout: 90000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));

const midnight = await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('earth');
  const q = e.mesh.quaternion;
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const v = { x: e.posKm[0], y: e.posKm[1], z: e.posKm[2] };
  const L = Math.hypot(v.x, v.y, v.z); v.x /= L; v.y /= L; v.z /= L;
  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx) };
});

await p.evaluate((m) => {
  const g = window.__game, oc = g.orbitCam;
  g.select('earth');
  oc.focusId = 'earth'; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.lat = m.lat; oc.lon = m.lon; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = g.terrainMgr.heightAt('earth', new (Object.getPrototypeOf(g.camera.position).constructor)(Math.cos(m.lat)*Math.cos(-m.lon), Math.sin(m.lat), Math.cos(m.lat)*Math.sin(-m.lon))) + 0.002;
}, midnight);
for (let i = 0; i < 60; i++) {
  if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 1.35; w.yaw = 0; } });
await new Promise((r) => setTimeout(r, 3000));

// 天顶区域的像素统计（避开地平线附近的雾）
const sample = async (label) => {
  const st = await p.evaluate(() => new Promise((res) => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const orig = g.composer.render.bind(g.composer);
    g.composer.render = (...a) => {
      orig(...a);
      g.composer.render = orig;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      // 天顶带：屏幕上方 12%–35%（天顶方向），全宽
      let r = 0, gg = 0, bl = 0, n = 0, mx = 0;
      for (let y = Math.floor(h * 0.65); y < Math.floor(h * 0.88); y++) {
        for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x++) {
          const i = ((h - 1 - y) * w + x) * 4;
          r += buf[i]; gg += buf[i + 1]; bl += buf[i + 2]; n++;
          mx = Math.max(mx, (buf[i] + buf[i + 1] + buf[i + 2]) / 3);
        }
      }
      res({ r: r / n, g: gg / n, b: bl / n, max: mx });
    };
  }));
  console.log(`${label.padEnd(22)} 天空均值 RGB ${st.r.toFixed(1)}/${st.g.toFixed(1)}/${st.b.toFixed(1)}` +
    `  最亮点 ${st.max.toFixed(0)}`);
  return st;
};

await sample('基线（全开）');
await p.screenshot({ path: `${OUT}00-base.png` });

const off = async (label, fn) => {
  await p.evaluate(fn);
  await new Promise((r) => setTimeout(r, 2500));
  await sample(label);
  await p.screenshot({ path: `${OUT}${label.replace(/[^\w]/g, '')}.png` });
};

await off('关大气', () => {
  const e = window.__game.builder.bodies.get('earth');
  if (e.atmoMesh) e.atmoMesh.visible = false;
});
await off('关大气+关星空', () => {
  const s = window.__game.sky;
  s.setFade(0);
});
await off('只关地形', () => {
  const e = window.__game.builder.bodies.get('earth');
  const s = window.__game.sky; s.setFade(1);
  if (e.atmoMesh) e.atmoMesh.visible = true;
  window.__game.terrainMgr?.setEnabled?.(false);
});
console.log('错误:', errs.length);
await b.close();
