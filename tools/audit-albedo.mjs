// 反照率标定验证：逐天体在日下点渲染，量盘面平均亮度，检查**排序**是否与实测
// 几何反照率一致。判据不是"看起来更亮"，而是"土卫二必须比火星亮"。
import puppeteer from 'puppeteer';
const IDS = (process.argv[2] ?? 'enceladus,mimas,mars,moon,mercury,europa,io,pluto').split(',');
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 800, height: 500 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));

const rows = [];
for (const id of IDS) {
  const ss = await p.evaluate((bid) => {
    const e = window.__game.builder.bodies.get(bid) ?? [...window.__game.registry.values()].find(t => t.id === bid);
    const q = e.mesh.quaternion, pos = e.posKm;
    const L = Math.hypot(pos[0], pos[1], pos[2]) || 1;
    const v = { x: -pos[0]/L, y: -pos[1]/L, z: -pos[2]/L };
    const [qx,qy,qz,qw] = [-q.x,-q.y,-q.z,q.w];
    const ix = qw*v.x+qy*v.z-qz*v.y, iy = qw*v.y+qz*v.x-qx*v.z, iz = qw*v.z+qx*v.y-qy*v.x;
    const iw = -qx*v.x-qy*v.y-qz*v.z;
    const lx = ix*qw+iw*-qx+iy*-qz-iz*-qy, ly = iy*qw+iw*-qy+iz*-qx-ix*-qz, lz = iz*qw+iw*-qz+ix*-qy-iy*-qx;
    return { lat: Math.asin(Math.max(-1,Math.min(1,ly))), lon: Math.atan2(-lz,lx), R: e.phys?.radiusKm ?? e.radiusKm };
  }, id);
  await p.evaluate((m, bid) => {
    const g = window.__game, oc = g.orbitCam;
    g.select(bid); oc.focusId = bid; oc.flight = null; oc.panOffset.set(0,0,0);
    oc.lat = m.lat; oc.lon = m.lon; oc.tilt = 0; oc.heading = 0;
    oc.dist = oc.distTarget = m.R * 3.0;
  }, ss, id);
  await new Promise((r) => setTimeout(r, 7000));
  const v = await p.evaluate((bid) => new Promise((res) => {
    const g = window.__game, gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const orig = g.composer.render.bind(g.composer);
    g.composer.render = (...a) => {
      orig(...a); g.composer.render = orig;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const L = (x,y) => { const i = ((h-1-y)*w+x)*4; return buf[i]*0.299+buf[i+1]*0.587+buf[i+2]*0.114; };
      // 盘面 = 中心区域里亮度 > 12 的像元（排除背景与星点）
      let n = 0, sum = 0, blown = 0;
      for (let y = (h*0.1)|0; y < h*0.9; y++) for (let x = (w*0.1)|0; x < w*0.9; x++) {
        const l = L(x,y); if (l < 12) continue; n++; sum += l; if (l > 245) blown++;
      }
      res({ n, mean: n ? +(sum/n).toFixed(1) : 0, blownPct: n ? +(blown/n*100).toFixed(1) : 0 });
    };
  }), id);
  const info = await p.evaluate((bid) => {
    const e = window.__game.builder.bodies.get(bid) ?? [...window.__game.registry.values()].find(t => t.id === bid);
    const u = e?.mat?.userData?.uniforms;
    return { scale: u?.uAlbedoScale ? +u.uAlbedoScale.value.toFixed(2) : null,
             dAU: +(Math.hypot(...e.posKm)/1.495978707e8).toFixed(2) };
  }, id);
  rows.push({ id, ...info, ...v });
  console.log(`${id.padEnd(10)} 标定×${String(info.scale).padStart(5)}  ${String(info.dAU).padStart(5)} AU  盘面均值 ${String(v.mean).padStart(6)}  过曝 ${String(v.blownPct).padStart(5)}%`);
}
await b.close();
