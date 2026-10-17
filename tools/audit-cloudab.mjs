// 地球"惨白"归因：分别关掉云层 / 把云层不透明度减半，看海面本色回不回来。
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 600 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 10000));
await p.evaluate(() => {
  const g = window.__game, oc = g.orbitCam;
  const e = g.builder.bodies.get('earth');
  // 日下点：把 -posKm 方向转到体固系，取经纬
  const q = e.mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(pos[0], pos[1], pos[2]) || 1;
  const v = { x: -pos[0] / L, y: -pos[1] / L, z: -pos[2] / L };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * v.x + qy * v.z - qz * v.y, iy = qw * v.y + qz * v.x - qx * v.z, iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  g.select('earth'); oc.focusId = 'earth'; oc.flight = null;
  oc.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
  oc.lon = Math.atan2(-lz, lx);
  oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = 6371 * 3.0;
});
await new Promise((r) => setTimeout(r, 9000));

const sample = () => p.evaluate(() => new Promise((res) => {
  const g = window.__game, gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // 只统计"盘面"像素：用亮度 > 20 且位于画面中心区域
    let n = 0, r = 0, g2 = 0, bl = 0, bright = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4;
      const L = buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114;
      if (L < 15) continue; // 背景
      n++; r += buf[i]; g2 += buf[i + 1]; bl += buf[i + 2];
      if (L > 200) bright++;
    }
    res({ n, rgb: n ? [Math.round(r / n), Math.round(g2 / n), Math.round(bl / n)] : null,
          brightPct: n ? +(bright / n * 100).toFixed(1) : 0 });
  };
}));

console.log('基线            ', JSON.stringify(await sample()));
await p.evaluate(() => { const m = window.__game.builder.bodies.get('earth'); m.cloudMesh && (m.cloudMesh.visible = false); });
await new Promise((r) => setTimeout(r, 3000));
console.log('关闭云层        ', JSON.stringify(await sample()));
await p.evaluate(() => { const m = window.__game.builder.bodies.get('earth'); m.cloudMesh && (m.cloudMesh.visible = true); m.atmoMesh && (m.atmoMesh.visible = false); });
await new Promise((r) => setTimeout(r, 3000));
console.log('关闭大气壳      ', JSON.stringify(await sample()));
await p.evaluate(() => { const m = window.__game.builder.bodies.get('earth'); m.cloudMesh && (m.cloudMesh.visible = false); });
await new Promise((r) => setTimeout(r, 3000));
console.log('云+大气都关     ', JSON.stringify(await sample()));
await p.evaluate(() => { const m = window.__game.builder.bodies.get('earth'); m.cloudMesh && (m.cloudMesh.visible = true); });
await new Promise((r) => setTimeout(r, 3000));
await p.screenshot({ path: new URL('./.audit-scenarios/earth-cloudab-on.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
await p.evaluate(() => { const m = window.__game.builder.bodies.get('earth'); m.cloudMesh && (m.cloudMesh.visible = false); });
await new Promise((r) => setTimeout(r, 3000));
await p.screenshot({ path: new URL('./.audit-scenarios/earth-cloudab-off.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
await b.close();
