// 地球夜面盘边一圈亮绿。逐个关掉候选，看是谁。
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.shot-rim/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 700 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=high', { waitUntil: 'networkidle2', timeout: 150000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 90000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 8000));

// 夜面视角：反日点方向看过去
// 与 probe-atlas 的 earth-night 同一机位：从反日点方向看
await p.evaluate(() => {
  const g = window.__game;
  const b = g.builder.bodies.get('earth');
  const p = b.posKm; const l = Math.hypot(p[0], p[1], p[2]);
  const away = { x: p[0]/l, y: p[1]/l, z: p[2]/l };
  const q = b.mesh.quaternion; const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw*away.x + qy*away.z - qz*away.y;
  const iy = qw*away.y + qz*away.x - qx*away.z;
  const iz = qw*away.z + qx*away.y - qy*away.x;
  const iw = -qx*away.x - qy*away.y - qz*away.z;
  const lx = ix*qw + iw*-qx + iy*-qz - iz*-qy;
  const ly = iy*qw + iw*-qy + iz*-qx - ix*-qz;
  const lz = iz*qw + iw*-qz + ix*-qy - iy*-qx;
  const oc = g.orbitCam;
  oc.focusId = 'earth';
  oc.lat = Math.asin(Math.max(-1, Math.min(1, ly)));
  oc.lon = Math.atan2(-lz, lx);
  oc.dist = oc.distTarget = 6371 * 2.4;
});
await new Promise(r => setTimeout(r, 10000));

const rim = async (label) => {
  const st = await p.evaluate(() => new Promise((res) => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const orig = g.composer.render.bind(g.composer);
    g.composer.render = (...a) => {
      orig(...a); g.composer.render = orig;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      // 找"绿显著高于红蓝"的像素
      let green = 0, total = 0, lum = 0, n = 0;
      for (let i = 0; i < buf.length; i += 4) {
        const R = buf[i], G = buf[i+1], B = buf[i+2];
        if (R + G + B < 24) continue;
        total++;
        if (G > R * 1.5 && G > B * 1.5 && G > 40) green++;
      }
      for (let i = 0; i < buf.length; i += 4) { const R=buf[i],G=buf[i+1],B=buf[i+2]; if (R+G+B>24){ lum += (R+G+B)/3; n++; } } res({ green, total, frac: green / Math.max(total, 1), mean: lum / Math.max(n,1) });
    };
  }));
  console.log(`${label.padEnd(18)} 绿色像素 ${String(st.green).padStart(6)}  占比 ${(st.frac*100).toFixed(2)}%  盘面均亮 ${st.mean.toFixed(1)}`);
  await p.screenshot({ path: `${OUT}${label.replace(/[^\w]/g,'')}.png` });
  return st;
};

await rim('00-base');
await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('earth');
  // uAuroraStrength 每帧被 builder 覆写成 1.0，改它无效；uAuroraMode 只在创建时设定，改它才生效
  e.atmoMesh.material.userData.uniforms.uAuroraMode.value = 0;
});
await new Promise(r => setTimeout(r, 2500));
await rim('01-no-aurora');
await p.evaluate(() => {
  const e = window.__game.builder.bodies.get('earth');
  e.atmoMesh.material.userData.uniforms.uOzone.value = 0; e.atmoMesh.material.userData.uniforms.uAuroraMode.value = 1;
});
await new Promise(r => setTimeout(r, 2500));
await p.evaluate(() => { const e = window.__game.builder.bodies.get('earth'); if (e.cloudMesh) e.cloudMesh.visible = false; });
await new Promise(r => setTimeout(r, 2500));
await rim('02-no-clouds');
await p.evaluate(() => { const e = window.__game.builder.bodies.get('earth'); if (e.terrain) e.terrain.visible = false; window.__game.terrainMgr?.setEnabled?.(false); });
await new Promise(r => setTimeout(r, 2500));
await rim('03-no-terrain');
console.log('错误:', errs.length);
await b.close();
