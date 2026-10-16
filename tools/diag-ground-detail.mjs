// 量地面到底有没有细节：落地后读回画面下方区域的相邻像素差（纹理能量）。
// 同时报告地形 LOD 状态——如果近处用的还是粗级，那问题就不在着色器。
import puppeteer from 'puppeteer';
const id = process.argv[2] ?? 'europa';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setViewport({ width: 900, height: 640 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise(r => setTimeout(r, 9000));

const ss = await p.evaluate((bid) => {
  const e = window.__game.builder.bodies.get(bid);
  const q = e.mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(pos[0],pos[1],pos[2]) || 1;
  const v = { x:-pos[0]/L, y:-pos[1]/L, z:-pos[2]/L };
  const [qx,qy,qz,qw] = [-q.x,-q.y,-q.z,q.w];
  const ix=qw*v.x+qy*v.z-qz*v.y, iy=qw*v.y+qz*v.x-qx*v.z, iz=qw*v.z+qx*v.y-qy*v.x;
  const iw=-qx*v.x-qy*v.y-qz*v.z;
  const lx=ix*qw+iw*-qx+iy*-qz-iz*-qy, ly=iy*qw+iw*-qy+iz*-qx-ix*-qz, lz=iz*qw+iw*-qz+ix*-qy-iy*-qx;
  return { lat: Math.asin(Math.lyClamp ? 0 : Math.max(-1,Math.min(1,ly))), lon: Math.atan2(-lz,lx), R: e.phys.radiusKm };
}, id);
await p.evaluate((m, bid) => {
  const g = window.__game, oc = g.orbitCam;
  g.select(bid);
  oc.focusId = bid; oc.flight = null; oc.panOffset.set(0,0,0);
  oc.lat = 0.25; oc.lon = m.lon; oc.tilt = 0; oc.heading = 0;
  oc.dist = oc.distTarget = m.R + 0.002;
}, ss, id);
for (let i = 0; i < 70; i++) {
  if (await p.evaluate((bid) => window.__game.terrainMgr.baseReady(bid), id)) break;
  await new Promise(r => setTimeout(r, 500));
}
await p.evaluate((m, bid) => {
  const g = window.__game, oc = g.orbitCam;
  if (g.getMode() !== 'orbit' || oc.focusId !== bid) return;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const dir = new V(Math.cos(0.25)*Math.cos(-m.lon), Math.sin(0.25), Math.cos(0.25)*Math.sin(-m.lon));
  oc.dist = oc.distTarget = g.terrainMgr.heightAt(bid, dir) + 0.002;
}, ss, id);
for (let i = 0; i < 70; i++) {
  if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break;
  await new Promise(r => setTimeout(r, 500));
}
await new Promise(r => setTimeout(r, 14000));

const st = await p.evaluate((bid) => new Promise((res) => {
  const g = window.__game;
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const L = (x, y) => { const i = ((h-1-y)*w + x)*4; return (buf[i]*0.299 + buf[i+1]*0.587 + buf[i+2]*0.114); };
    // 近地（画面下部 25%）
    let sum = 0, n = 0, mn = 999, mx = -1;
    for (let y = Math.floor(h*0.78); y < Math.floor(h*0.97); y++)
      for (let x = 20; x < w-20; x++) {
        const d = Math.abs(L(x+1,y) - L(x,y));
        sum += d; n++;
        const v = L(x,y); if (v < mn) mn = v; if (v > mx) mx = v;
      }
    const tm = g.terrainMgr;
    const act = tm.active;
    let levels = null;
    if (act?.bodyId === bid) {
      const P = act.patches;
      levels = P.levels?.map(l => ({ f: +(l.uFade?.value ?? -1).toFixed(2), g: l.geo?.attributes?.position?.count ?? 0 })).slice(0, 6);
    }
    res({ adjacent: sum/n, mn: +mn.toFixed(1), mx: +mx.toFixed(1), levels,
      activeBody: act?.bodyId ?? null, mode: g.getMode() });
  };
}));
console.log(`${id}: 模式 ${st.mode}  地形激活 ${st.activeBody}`);
console.log(`  近地亮度范围 ${st.mn}–${st.mx}（跨 ${(st.mx-st.mn).toFixed(0)}）  相邻像素差均值 ${st.adjacent.toFixed(3)}`);
console.log('  各级 uFade/顶点数:', JSON.stringify(st.levels));
console.log('错误:', errs.length, errs[0] ?? '');
await b.close();
