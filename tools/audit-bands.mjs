// 分带纹理能量：把画面按水平带切开，分别量"相邻像素亮度差均值"。
// 目的：区分"真细节"与"混叠"——真细节应当近带高、远带低（足迹增大后被正确滤掉）；
// 若各带一样高，那多半是混叠（不可分辨的高频），不是细节。
// 用法：node tools/audit-bands.mjs <body> [latDeg]
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./.audit-scenarios/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const id = process.argv[2] ?? 'mars';
const latDeg = Number(process.argv[3] ?? 18);

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 600 });
await p.goto('http://127.0.0.1:4199/?clean=1&quality=medium', { waitUntil: 'networkidle2', timeout: 180000 });
await p.waitForFunction(() => { const x = document.getElementById('start-btn'); return x && !x.disabled; }, { timeout: 120000 });
await p.click('#start-btn');
await new Promise((r) => setTimeout(r, 9000));

const ss = await p.evaluate((bid) => {
  const e = window.__game.builder.bodies.get(bid) ?? [...window.__game.registry.values()].find((t) => t.id === bid);
  const q = e.mesh.quaternion, pos = e.posKm;
  const L = Math.hypot(pos[0], pos[1], pos[2]) || 1;
  const v = { x: -pos[0] / L, y: -pos[1] / L, z: -pos[2] / L };
  const [qx, qy, qz, qw] = [-q.x, -q.y, -q.z, q.w];
  const ix = qw * v.x + qy * v.z - qz * v.y, iy = qw * v.y + qz * v.x - qx * v.z, iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return { lat: Math.asin(Math.max(-1, Math.min(1, ly))), lon: Math.atan2(-lz, lx), R: e.phys.radiusKm };
}, id);
await p.evaluate((m, bid) => {
  const g = window.__game, oc = g.orbitCam;
  g.select(bid); oc.focusId = bid; oc.flight = null; oc.panOffset.set(0, 0, 0);
  oc.tilt = 0; oc.heading = 0; oc.lat = m.lat; oc.lon = m.lon; oc.dist = oc.distTarget = m.R + 0.002;
}, ss, id);
for (let i = 0; i < 70; i++) { if (await p.evaluate((x) => window.__game.terrainMgr.baseReady(x), id)) break; await new Promise((r) => setTimeout(r, 500)); }
await p.evaluate((m, bid, la) => {
  const g = window.__game, oc = g.orbitCam;
  if (g.getMode() !== 'orbit' || oc.focusId !== bid) return;
  const V = Object.getPrototypeOf(g.camera.position).constructor;
  const L = la * Math.PI / 180;
  const dir = new V(Math.cos(L) * Math.cos(-m.lon), Math.sin(L), Math.cos(L) * Math.sin(-m.lon));
  oc.dist = oc.distTarget = g.terrainMgr.heightAt(bid, dir) + 0.002;
}, ss, id, latDeg);
for (let i = 0; i < 70; i++) { if ((await p.evaluate(() => window.__game.getMode())) === 'walk') break; await new Promise((r) => setTimeout(r, 500)); }
await new Promise((r) => setTimeout(r, 9000));
await p.evaluate(() => { const w = window.__game.ship.walk; if (w) { w.pitch = 0.04; w.yaw = 0; } });
await new Promise((r) => setTimeout(r, 3000));

const res = await p.evaluate(() => new Promise((res) => {
  const g = window.__game, gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const orig = g.composer.render.bind(g.composer);
  g.composer.render = (...a) => {
    orig(...a); g.composer.render = orig;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const L = (x, y) => { const i = ((h - 1 - y) * w + x) * 4; return buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114; };
    const bands = [];
    const NB = 5;
    for (let bi = 0; bi < NB; bi++) {
      const y0 = Math.floor(h * bi / NB), y1 = Math.floor(h * (bi + 1) / NB);
      let n = 0, tex = 0, sum = 0;
      for (let y = Math.max(4, y0); y < Math.min(h - 4, y1); y++)
        for (let x = 4; x < w - 4; x++) { const v = L(x, y); n++; sum += v; tex += Math.abs(L(x + 1, y) - v); }
      bands.push({ band: bi, mean: +(sum / n).toFixed(1), tex: +(tex / n).toFixed(3) });
    }
    res(bands);
  };
}));
console.log(`${id} 分带（0=画面顶部/最远，${res.length - 1}=画面底部/最近）:`);
for (const r of res) console.log(`  带${r.band}  均值${String(r.mean).padStart(6)}  纹理能量 ${String(r.tex).padStart(6)}`);
await p.screenshot({ path: `${OUT}bands-${id}.png` });
await b.close();
